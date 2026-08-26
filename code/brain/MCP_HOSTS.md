# MCP 挂载与验证清单（DSH / Codex / ZCode）

> 目标：验证 brain 在 DSH、Codex、ZCode 三个宿主上的挂载方式，以及“每项目一个 MCP 实例”和“当前会话 id 获取”是否可行。
> 当前结论：项目根用 `BRAIN_PROJECT_ROOT` 固定可行。Codex 的原生 MCP 调用可通过 `_meta.threadId` 提供会话 id；若直接使用 DSH 原生 `mcp-client`，仍需要 bridge 注入会话信息。仓库中的独立 `brain-dsh-plugin` 已提供 DSH 侧 session 注入/AutoThink 增强，它属于宿主适配层，不改变 brain 核心契约。

## 1. 每项目一个实例的配置原则

- 每个项目启动一个 brain 进程；
- 通过环境变量固定：
  - `BRAIN_PROJECT_ROOT` = 当前项目根（`@/` 与 `@core/project.md` 的解析基准）
  - `BRAIN_HOME` = 全局记忆根（默认 `~/.brain-data`）
  - `BRAIN_ASK_LONG_TERM` = `none`（默认）或 `protect`
- `brain_think` 不再暴露 `project_root`；项目根在 MCP server 启动时通过 `BRAIN_PROJECT_ROOT` / cwd 固定，模型可见参数只保留 `session_id?`。

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
      BRAIN_PROJECT_ROOT: D:/Workspace/ai-projects/c-skills
      BRAIN_HOME: C:/Users/<you>/.brain-data
      BRAIN_ASK_LONG_TERM: none
```

### 会话 id / AutoThink 现状

- **推荐 DSH 集成**：使用仓库中的独立 `brain-dsh-plugin`。它作为 DSH adapter 按当前 agent/session 注入 `session_id`，并可在用户消息边界自动调用/注入 `brain_think`；这部分能力不进入 brain BDD/design。
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
      "env": {
        "BRAIN_PROJECT_ROOT": "/path/to/project",
        "BRAIN_HOME": "/home/<you>/.brain-data"
      }
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
env = { BRAIN_PROJECT_ROOT = "/path/to/project", BRAIN_HOME = "/home/<you>/.brain-data" }
```

> 具体字段名以当前 Codex 版本为准；本地源码见 `codex-rs/codex-mcp` 的 `McpServerTransportConfig::Stdio`。

### 会话 id 现状（已确认）

- Codex 会在 MCP `tools/call` 的 `params._meta.threadId` 自动注入当前 thread/session id。
- brain 会读取 `_meta.threadId` 作为 `brain_think` 的默认 session id，开箱即用。

## 5. ZCode

- 当前不在验证范围内（用户已确认暂不处理）。
- 若后续需要，可参考官方文档：https://zcode.z.ai/docs/mcp-services

## 6. 验证清单

- [ ] DSH plugin：在实际 DSH 环境验证 session 注入 + AutoThink 端到端行为
- [ ] DSH raw `mcp-client`（若仍需要）：验证 bridge 会话信息透传
- [ ] Codex：项目级 MCP 配置挂载成功，`brain_think` 能从 `_meta.threadId` 拿到当前 session id
- [ ] 若某个宿主无法提供 session id，回退到 `default` 会话

## 7. TODO（宿主集成验证）

- [ ] 在真实 DSH 项目中验证 `brain-dsh-plugin` 的 AutoThink/session 行为
- [ ] 在真实 Codex 项目中验证 `_meta.threadId` 透传与项目级挂载
