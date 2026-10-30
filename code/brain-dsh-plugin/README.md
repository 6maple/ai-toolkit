# @dsh-external/brain-dsh-plugin

Default complete setup includes the six formal brain-ai methods and their Global Core route. The shared Brain installer prepares them automatically; manual checkout setup uses the pack command below. Conflicts preserve existing content and must be resolved before completing an upgrade.

DSH 的 brain v2 A2 host adapter。插件按source root启动并复用一个brain MCP
stdio process；它不拥有 memory schema、工具 contract 或 cognition workflow。

## 行为边界

- 工具定义直接来自 `brain/public-tools`。Semantic Search 默认关闭，此时 hook 默认开启时模型可见
  11 个操作工具（含 `brain_step`）；关闭 hook 后，`exposeThink` 决定是否额外公开 `brain_think`。当 Brain 全局配置启用
  Semantic Search 时，再额外公开 `brain_ask_search`。
- 显式公开 `brain_think` 时，`brain_step` 描述先要求本轮立即调用一次 `brain_think`，再按返回引导使用 step；AutoThink 开启时使用原 step 描述，避免重复恢复。
- 每个真实用户消息边界只调用一次 `brain_think`。成功时把短宏观处理入口作为 plugin message 注入下一次模型输入，模型再用 brain_cat 读取各自专用的 @brain-virtual/ 流程和记忆视图（每次计算、完整返回）；自动建立失败时把明确诊断注入同一通道，并记录日志。其他可完成的工作继续进行。
- 工具与 AutoThink 先用当前 DSH agent/session 的 cwd 选择正确的 source root / Brain instance。DSH session identity 只属于宿主，不注入 Brain tool args；`brain_think` 的模型可见输入为空对象。
- 对 `opencode` / `opencode-go` 的 `opencode.ai` 推理请求，插件把当前 DSH 会话 ID 写入
  `x-opencode-session`。并发会话相互隔离；其他 provider、其他域名和已有显式请求头不变。
- `InstanceManager`负责按source root的lazy process、timeout、abort、崩溃冷却和plugin
  卸载清理。brain 负责所有 cognition semantics。

## 配置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `server.command` | `node` | MCP server 启动命令；`node` 使用当前 Node。 |
| `server.args` | `[]` | 为空时解析 profile 已安装的匹配 `brain` package entry。 |
| `server.timeoutMs` | `30000` | MCP initialize、list 与 call 的超时。 |
| `exposeThink` | `true` | 仅当 AutoThink 关闭时公开 `brain_think`。 |
| `autoThink.enabled` | `true` | 在用户消息边界 anchor 并注入 context。 |
| `autoThink.timeoutMs` | `5000` | 单次 hook anchor 超时；失败不阻塞 agent step。 |
| `opencodeSession.enabled` | `true` | 注入 OpenCode Go 要求的会话请求头。 |
| `opencodeSession.providers` | `[opencode, opencode-go]` | 允许建立会话请求头上下文的 provider。 |
| `opencodeSession.hosts` | `[opencode.ai]` | 允许写入请求头的目标域名及其子域名。 |

旧 v1 的 vendored tools、approval、`project_root` tool 参数、`default` session 与历史文件语义
不受支持。当前 Brain cognition scope 与 host/session 分工以 `doc/brain/v6/` 为准；未被 v6 重开的行为继续继承当前实现 baseline。

## Semantic Search

插件不拥有独立的 semantic 配置。它与 Brain MCP process 共同读取：

```text
~/.brain-data/config.json
```

安装 runtime 使用仓库统一入口：

```bash
node ../brain-cli/index.mjs semantic-search install
```

然后设置 `semanticSearch.enabled=true` 并重启 DSH/plugin。这个开关只在宿主启动时读取，不支持热切换；修改后继续使用旧 DSH 可能让宿主已注册的工具 surface 与后来 lazy spawn/respawn 的 Brain child 不一致，此时插件会提示重启 DSH/plugin。配置关闭时插件保持原工具 surface。

## 依赖与本地开发

按照 DeepSeek Harness 的 package/profile 模型：

- `@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 和 DSH service-definition packages 是
  host peer dependencies；开发时同时列入 devDependencies，保证独立 typecheck/build 可复现。
- `brain` 是插件直接 import 且实际 spawn 的普通 runtime dependency，不是 peer。当前两个项目
  位于同一私有 checkout，因此使用 `link:../brain` 绑定这份 core；两者必须同步升级。
- 构建仅运行 `unbuild`，不会创建 junction 或修改依赖树。profile 的依赖安装由 pnpm/DSH 管理。

本仓库当前 `private: true`，以下是 checkout 开发流程，不声称可从 registry 安装：

```bash
cd D:/Workspace/ai-projects/ai-toolkit/code/brain
pnpm install
pnpm run stub

cd ../brain-dsh-plugin
pnpm install
pnpm run stub
pnpm run typecheck
pnpm run test

cd ..
pnpm --dir brain-cli install
node brain-cli/index.mjs pack install brain-ai
dsh plugin --profile web add ./brain-dsh-plugin
dsh --profile web --dump-config
```

`brain` 没有 `dsh.bundle`，它由 plugin 的普通依赖进入 profile；只有
`brain-dsh-plugin` 的 `dsh.bundle.patch` 参与 profile composition。若以后发布到 registry，发布前应把
本地 `link:` 改为 core 的精确版本（例如 `0.1.0`），并保持两包同步发布。core 的
`brain/public-tools` export 是唯一 host/tool contract source，并交付 JavaScript 与 declarations。

`test` 覆盖 instance lifecycle、timeout/abort/crash guard、AutoThink 的单边界逐字注入与失败去重、
OpenCode 并发会话请求头隔离与域名边界，并对真实 MCP server 验证默认工具 surface、Semantic Search 可选工具 surface、host session 不进入 Brain cognition、Project 范围无路径 glob/grep、write、feedback 和 absolute-path 转发。
