# router-creator 更新指南

DSH 上游更新较频繁，`router-creator` 中**跟随官方 deepseek-harness** 的文件不应手工长期维护。
本目录提供一个轻量更新脚本：按 manifest 从官方仓库拉取指定文件，并重新注入本地的
`router-bootstrap-creator` 片段。

## 上游映射

| 本地文件 | 官方仓库路径 | 更新方式 |
|---|---|---|
| `agent.cordis.yml` | `apps/cli/config/agent-presets/cordis/agent.cordis.yml` | 拉取后 + `patches/router-bootstrap-creator.snippet.yml` 合并 |
| `skills/cordis-plugin-development/SKILL.md` | `apps/cli/config/agent-presets/cordis/skills/cordis-plugin-development/SKILL.md` | 直接覆盖 |
| `skills/editing-cordis-compositions/SKILL.md` | `apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md` | 直接覆盖 |

**不会自动更新的本地内容**：

- `preset.yml` — 本地显示名/描述，不取自官方；
- `router-bootstrap-creator.mjs` — 是 `router-standard` 的本地 fork（加入了创造 persona 注入），
  需要人工 diff/合并；
- `router-core.mjs` — 来自第三方 `router-standard`，当前与
  `~/.dsh/.agent-presets/router-standard/router-core.mjs` 一致；上游变化时需要人工同步；
- `tool-cordis-idempotent/` — 本地幂等 shim；
- `router-creator.test.mjs`、`README.md` — 本地维护。

## 常用命令

### 拉取官方最新（带代理）

```powershell
node scripts/update-from-official.mjs --ref master --proxy http://127.0.0.1:7890
```

### 先看会改什么（不写磁盘）

```powershell
node scripts/update-from-official.mjs --ref master --proxy http://127.0.0.1:7890 --dry-run --verbose
```

### 离线/开发：用本地官方仓库代替网络

```powershell
node scripts/update-from-official.mjs --local D:\Workspace\github\deepseek-harness --dry-run
node scripts/update-from-official.mjs --local D:\Workspace\github\deepseek-harness
```

### 不需要代理

```powershell
node scripts/update-from-official.mjs --no-proxy
```

## 脚本行为

1. 按 manifest 从 `raw.githubusercontent.com/deepseek-ai/deepseek-harness/<ref>/**` 拉取
   3 个文件；`--local` 模式改为从本地官方 clone 读取，不联网。
2. `agent.cordis.yml` 不是直接覆盖：
   - 读取官方文件；
   - 若官方已包含 `router-bootstrap-creator` 行，则不再插入；
   - 否则在 `# ── shell` 锚点前插入
     `patches/router-bootstrap-creator.snippet.yml`。
   - 若锚点找不到，脚本会中止，避免生成损坏的 preset。
3. 两个 `SKILL.md` 直接替换为官方内容。
4. 每次覆盖前在 `.backups/<时间戳>/` 生成备份。
5. `--dry-run` 只打印预计变更。

## 手动同步 router-standard 部分

`router-core.mjs` 和 `router-bootstrap-creator.mjs` 不在官方 harness 仓库中，当前来源是
第三方 `dsh-router-standard`（或本地安装的 `~/.dsh/.agent-presets/router-standard`）。

建议流程：

```powershell
# 对比 router-core
git diff --no-index "$env:USERPROFILE\.dsh\.agent-presets\router-standard\router-core.mjs" "D:\Workspace\ai-projects\ai-toolkit\code\router-creator\router-core.mjs"

# 对比 router-bootstrap 上游 v1 与本 fork
git diff --no-index "$env:USERPROFILE\.dsh\.agent-presets\router-standard\router-bootstrap-v1.mjs" "D:\Workspace\ai-projects\ai-toolkit\code\router-creator\router-bootstrap-creator.mjs"
```

- `router-core.mjs` 当前与上游逐字一致，可直接覆盖。
- `router-bootstrap-creator.mjs` 有本地新增的 persona 捕获/注入逻辑，上游更新时应
  **手动合并**，不要直接覆盖。

## 网络/代理说明

- 脚本使用系统 `curl` 拉取 HTTPS 内容，默认代理 `http://127.0.0.1:7890`；
- 也读取 `ROUTER_UPDATE_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY`；
- 若本机沙箱/环境对 `curl` 的 Schannel TLS 有限制，可先确认代理支持 CONNECT，
  或改用 `--local` 从本地官方仓库更新。