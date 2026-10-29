# router-creator — 创造模式 · 极简触发

一个 DSH Agent preset：先用极简模式（RL 接口还原）触发模型最强状态，第一个工具调用后放行完整创造能力，并在第一次后续思考前注入一次原版创造 persona。

## 行为

| 阶段 | 行为 |
|---|---|
| 首轮 | 只有 RL 训练句 + shell + `str_replace_editor`，`contexts: []` |
| 第一个 `tool/call` | 放行完整创造目录（Standard 全量 + `tool-cordis` + skills） |
| 第一个 `tool/result`（主）或第二个 `tool/call`（兜底） | 注入一次原版 cordis persona 到 `next-step` inbox |

## 为什么需要 shim

`tool-cordis` 会在进程里注册全局唯一的 Host inspect provider。若同进程已有官方“创造模式”挂载过，再挂载一个包含 `tool-cordis` 的新预设会报 `already registered`。

`tool-cordis-idempotent` 是一个 host-plane 兼容插件，把 `cordisInspect.register` 改成幂等：已注册则跳过，未注册则正常注册。这样新预设可以和官方创造模式共存。

## 安装

### 1. 安装幂等 shim

```powershell
# 方式 A：通过 dsh 官方装配（重启后仍生效）
dsh plugin --profile web add .\code\router-creator\tool-cordis-idempotent

# 方式 B：如果已装 dsh-super-injector，可运行时热装
# dev_install_package D:\Workspace\ai-projects\ai-toolkit\code\router-creator\tool-cordis-idempotent
```

### 2. 安装预设

```powershell
$src = '.\code\router-creator'
$target = Join-Path $env:USERPROFILE '.dsh\.agent-presets\router-creator'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Join-Path $src 'agent.cordis.yml') $target
Copy-Item (Join-Path $src 'preset.yml') $target
Copy-Item (Join-Path $src 'router-bootstrap-creator.mjs') $target
Copy-Item (Join-Path $src 'router-core.mjs') $target
Copy-Item (Join-Path $src 'skills') $target -Recurse
# 可选：测试与说明
Copy-Item (Join-Path $src 'router-creator.test.mjs') $target
Copy-Item (Join-Path $src 'README.md') $target
```

### 3. 重启 DSH

重启后新建会话，选择“创造模式 · 极简触发”。

## 文件

- `agent.cordis.yml` — 官方 cordis 组成 + `router-bootstrap-creator` 行
- `router-bootstrap-creator.mjs` — 路由器（极简触发 + persona 注入）
- `router-core.mjs` — 复用 router-standard 的路由核心（未修改）
- `preset.yml` — 预设显示元数据
- `skills/` — 官方 cordis 的两个创作 skill
- `tool-cordis-idempotent/` — host-plane 幂等 shim 插件
- `router-creator.test.mjs` — 纯逻辑单元测试

## 更新

DSH 官方上游更新频繁时，使用 `UPDATING.md` 和 `scripts/update-from-official.mjs` 同步官方源文件：

```powershell
# 带代理拉取官方最新
node scripts/update-from-official.mjs --ref master --proxy http://127.0.0.1:7890

# 先看差异
node scripts/update-from-official.mjs --dry-run --verbose
```

详细说明见 [UPDATING.md](UPDATING.md)。

## 验证

```sh
node --test router-creator.test.mjs
```
