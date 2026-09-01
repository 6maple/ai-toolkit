# MCP 挂载与验证清单（DSH / Codex / ZCode）

> 目标：记录 Brain 在 DSH、Codex、Claude Code 等宿主中的真实挂载方式，以及 project/source binding 与 current session identity 分别从哪里取得。
> 当前结论：Brain repository 固定为 `~/.brain-data`。独立、project-scoped MCP 可以用启动 cwd 作为 source root；能提供 trusted per-invocation binding 的宿主 adapter 可以让一个长驻 MCP server 安全服务多个 projects/sessions，不能再回退到进程 cwd。Codex plugin 用 `UserPromptSubmit.session_id + cwd` 建立 binding，并用后续 `tools/call` 的 `_meta.threadId` 解析；直接使用 DSH 原生 `mcp-client` 时仍需要 bridge 注入 session 信息。

## 1. Project/source binding 原则

- standalone/project-scoped MCP 从一个已登记的 source directory cwd启动；未登记目录会自动创建 project mapping；
- multiplexed host MCP 必须为每次调用提供 trusted source/session binding，不得把长驻进程 cwd 当成当前 project；
- 同一ProjectId可在 `project.json` 中登记多个source roots；
- `BRAIN_ASK_LONG_TERM` = `none`（默认）或 `protect`；
- `brain_think`不暴露project/source参数，模型可见参数只保留 `session_id?`。

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

### 会话 id / AutoThink 现状

- **推荐 DSH 集成**：使用仓库中的独立 `brain-dsh-plugin`。它作为 DSH adapter 按当前 agent/session 注入 `session_id`，并可在用户消息边界自动调用/注入 `brain_think`。自动 restore 的跨宿主行为由 Brain BDD/Design 定义；DSH event/metadata/process wiring 只属于该 adapter。
- 若不使用 plugin、而是直接挂原生 DSH `mcp-client`，则 bridge 仍需要把 `exec.agent.id` 作为会话信息传给 brain（例如 `_meta.dshSessionId`）。
- brain 本体兼容 `_meta.dshSessionId` / `com.example.dsh/sessionId` 等 fallback，但模型也可以显式传 `session_id`。

## 3. Claude Code

项目级 `.mcp.json`：

```json
{
  "mcpServers": {
    "brain": {
      "command": "node",
      "args": ["/path/to/brain/dist/index.mjs"],
      "cwd": "/path/to/source-directory"
    }
  }
}
```

### 会话 id 现状

- Claude Code 支持项目级 `.mcp.json`，但标准 MCP 工具调用不会自动携带 conversation id。
- 可选的 `UserPromptSubmit` hook 可以把当前会话信息注入 prompt/工具参数，属于后续增强。

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
- hook 将完整恢复结果作为 developer context 返回；plugin MCP entry不再暴露`brain_think`，避免模型重复恢复。
- plugin MCP entry使用每次 `tools/call` 的 `params._meta.threadId`查找该绑定，一次性向 brain 的通用 invocation resolver提供project services与trusted session id；不得回退到长驻MCP进程cwd。

## 5. ZCode

- 当前不在验证范围内（用户已确认暂不处理）。
- 若后续需要，可参考官方文档：https://zcode.z.ai/docs/mcp-services

## 6. 验证清单

- [ ] DSH plugin：在实际 DSH 环境验证 session 注入 + AutoThink 端到端行为
- [ ] DSH raw `mcp-client`（若仍需要）：验证 bridge 会话信息透传
- [ ] Codex plugin：`UserPromptSubmit` 使用当前 `session_id + cwd` 直接恢复完整 context；plugin MCP surface隐藏 `brain_think`，其余工具调用通过 `_meta.threadId` 解析同一 host binding
- [ ] 若宿主无法提供可靠 session id，只使用可确认的 project/global scope；不得伪造或回退到 `default` session

## 7. TODO（宿主集成验证）

- [ ] 在真实 DSH 项目中验证 `brain-dsh-plugin` 的 AutoThink/session 行为
- [ ] 在真实 Codex tasks 中验证 `session_id + cwd` hook binding、`_meta.threadId` per-call resolution 与跨 project 隔离
