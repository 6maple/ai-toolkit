# MCP 挂载与验证清单（DSH / Codex / ZCode）

> 目标：记录 Brain 在 DSH、Codex、Claude Code 等宿主中的真实挂载方式，以及 source/project binding 与宿主自己的 session/thread identity 如何分工。
> 当前结论：Brain repository 固定为 `~/.brain-data`。Brain cognition 只有 Global / Project 两层。独立、project-scoped MCP 可以用启动 cwd 作为 source root；长驻、多项目宿主必须在每次调用前解析出正确 source root/services，不能回退到进程 cwd。宿主 session/thread 可以用于完成这个绑定，但不会进入 Brain cognition scope。Codex plugin 用 `UserPromptSubmit.session_id + cwd` 建立 host binding，并用后续 `tools/call` 的 `_meta.threadId` 找回对应 source root。

## 1. Project/source binding 原则

- standalone/project-scoped MCP 从一个已登记的 source directory cwd启动；未登记目录会自动创建 project mapping；
- multiplexed host MCP 必须为每次调用解析出可信 source/project binding，不得把长驻进程 cwd 当成当前 project；宿主可用自己的 session/thread id 找到该 binding；
- 同一 ProjectId 可在 `project.json` 中登记多个 source roots；
- `BRAIN_ASK_LONG_TERM` = `none`（默认）或 `protect`；
- `brain_think` 不暴露 project/source/session 参数，模型可见输入为空对象。

## 2. DSH（DeepSeek Harness）

在项目级 `cordis.yml` 增加：

```yaml
mcp-client:
  - serverName: brain
    transport: stdio
    command: node
    args: ["D:/Workspace/ai-projects/c-skills/code/brain/dist/index.mjs"]
    cwd: D:/Workspace/ai-projects/c-skills
    env:
      BRAIN_ASK_LONG_TERM: none
```

### Session / AutoThink 现状

- **推荐 DSH 集成**：使用仓库中的独立 `brain-dsh-plugin`。它从当前 agent/session 取得 cwd，用这个 source root 选择 Brain instance/services，并可在用户消息边界自动调用/注入 `brain_think`。AutoThink 接管 restore 时模型侧隐藏 `brain_think`，也不再接收要求调用它的 server instruction。
- DSH 的 agent/session identity 仍可用于 cwd、OpenCode header、approval 等宿主行为，但 Brain tool args 不再注入 `session_id` 或 thread metadata。
- 若直接使用 project-scoped 原生 `mcp-client`，只要该 MCP 的 cwd/source root 已正确绑定项目，就不需要额外提供 session id。

## 3. Claude Code

推荐使用仓库中的 [`brain-claude-plugin`](../brain-claude-plugin/README.md)。它用 Claude Code 的 `UserPromptSubmit` hook 在每个用户提示前恢复 Brain context，再由插件自带的 MCP server 暴露其余工具。hook 和 MCP server 都使用 `CLAUDE_PROJECT_DIR` 绑定同一个 source root；MCP 工具列表隐藏 `brain_think`，避免重复恢复。

### 会话 id 现状

- Claude Code 的 `UserPromptSubmit` 与 `PermissionRequest` hook 提供 `session_id`、`transcript_path`。插件只用它们记录并核对当前提示的权限状态；Brain cognition 仍只有 Global 与 Project 两层。
- 标准 MCP 工具调用没有可依赖的 Claude session id。插件 MCP process 从宿主提供的项目根目录取得 source root。
- 该插件目前是本地 checkout 开发版本。实际 Claude Code 端到端安装验证仍需在目标宿主运行；插件自身的 hook、MCP 协议和 manifest 验证见其 `pnpm test` 与 `claude plugin validate`。

## 4. Codex

Codex 使用 `config.toml` 配置 MCP server（本地 stdio 示例）：

```toml
[mcp_servers.brain]
command = "node"
args = ["/path/to/brain/dist/index.mjs"]
cwd = "/path/to/source-directory"
```

> 具体字段名以当前 Codex 版本为准；本地源码见 `codex-rs/codex-mcp` 的 `McpServerTransportConfig::Stdio`。

### 会话 id 现状（已确认）

- Codex plugin 的同步 `UserPromptSubmit` hook 从官方 hook input读取 `session_id`与 `cwd`，将二者作为同一条宿主调用绑定保存，并直接执行与`brain_think`相同的恢复逻辑。
- hook 将完整恢复结果作为 developer context 返回；plugin MCP entry不再暴露`brain_think`，也不返回要求调用它的 server instruction，避免模型重复恢复。
- plugin MCP entry 使用每次 `tools/call` 的 `params._meta.threadId` 查找 host binding，并向 Brain 的通用 invocation resolver 提供对应 project services；thread id 到这里为止，不进入 Brain cognition scope。不得回退到长驻 MCP 进程 cwd。

## 5. ZCode

- 当前不在验证范围内（用户已确认暂不处理）。
- 若后续需要，可参考官方文档：https://zcode.z.ai/docs/mcp-services

## 6. 验证清单

- [ ] DSH plugin：在实际 DSH 环境验证 source-root instance routing + AutoThink 端到端行为，确认 Brain 调用不携带 session cognition 参数
- [ ] DSH raw `mcp-client`（若仍需要）：验证 project-scoped cwd/source root 绑定
- [ ] Codex plugin：`UserPromptSubmit` 使用当前 `session_id + cwd` 建立 host binding 并按 cwd 恢复 Project cognition；plugin MCP surface 隐藏 `brain_think`，其余工具调用通过 `_meta.threadId` 解析同一 source root/services
- [ ] 多项目宿主若无法可靠解析当前 source root，直接报 invocation binding 不可用；不得用进程 cwd 或伪造 session 兜底

## 7. TODO（宿主集成验证）

- [ ] 在真实 DSH 项目中验证 `brain-dsh-plugin` 的 AutoThink / source-root routing 行为
- [ ] 在真实 Codex tasks 中验证 `session_id + cwd` host binding、`_meta.threadId` per-call source-root resolution 与跨 project 隔离
