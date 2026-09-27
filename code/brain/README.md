# brain

通用 MCP cognition runtime。当前 production cognition scope 只有 Global / Project；宿主可以有自己的 session/thread，但它不属于 Brain cognition namespace。

## 当前基线

当前 production contract 以 Brain v6 为准：

- `../../doc/brain/v6/01-requirements-contract.md` — cognition scope / continuity contract；
- `../../doc/brain/v6/02-acceptance-spec.md` — acceptance；
- `../../doc/brain/v6/03-system-design.md` — system design；
- `../../doc/brain/v6/04-detailed-design.md` — detailed design；
- `../../doc/brain/v6/05-verification-delivery.md` — implementation / verification evidence；
- `../../doc/brain/v5/01-requirements-contract.md` — v6 继续继承的 multi-project predecessor contract；
- [RELATED_PROJECTS.md](RELATED_PROJECTS.md) — related projects 配置与使用；
- [MCP_HOSTS.md](MCP_HOSTS.md) — host/source-root routing。

历史版本保留在 `../../doc/brain/archive/` 和对应 version directory，不作为当前 production contract。

## Cognition scope

内置 Brain cognition 地址只有：

```text
@global/core.md
@global/memories/{decision,knowledge,intention,skill}/...

@project/core.md
@project/memories/{decision,knowledge,intention,skill}/...
```

配置 related projects 后，还可以通过：

```text
#<alias>/core.md
#<alias>/memories/{decision,knowledge,intention,skill}/...
```

访问对应项目的 Project cognition。

`@session/...` 不是合法 Brain 地址。Host session/thread 可以用于 Codex/DSH 等宿主自己的 invocation routing、cwd、approval 或 UI 状态，但不会选择 Brain cognition scope。

## brain_think

收到每条新的用户消息后，显式 restore 模式应立即调用一次 `brain_think({})`，再继续解释、规划、回答或调用其他工具。

Host hook 已自动 restore 时，由宿主注入返回的 cognition context，并隐藏或避免再次要求模型调用 `brain_think`。

`brain_think` 没有模型可见参数。当前 source root 决定 ProjectId；relatedProjects 仍按 active source root 的配置解析。

返回的 resident cognition 包括 Global Core、Project Core、bounded archival descriptions，以及 applicable related-project routing。不存在 Session Core。

## Public tools

主要模型可见工具：

- `brain_think` — restore 当前 Global / Project working cognition；
- `brain_absolute_path` — 把 Brain workspace 地址映射为 filesystem path；
- `brain_ls` — 浏览一个 archival cognition directory；
- `brain_glob` — 按 public path glob 查找 archival cognition；
- `brain_grep` — 按 Markdown content 查找 archival cognition；
- `brain_cat` — 读取一个 Scope Core 或 archival cognition；
- `brain_write` — 创建新的 archival cognition，或有意用另一份 cognition 替换目标；
- `brain_edit` — 更新同一份 Scope Core / archival cognition；
- `brain_rm` — 删除一个 archival cognition；
- `brain_mv` — 移动一个 archival cognition；
- `brain_feedback` — 记录 adopt / question / resolve；
- `brain_ask_search` — Semantic Search 启用时提供的语义检索工具。

具体 model-visible schema / guidance 以 `src/integration/public-tools.ts` 为准。

## Archival cognition

Archival cognition 使用 Markdown + YAML frontmatter：

```md
---
description: 什么时候应该读取这份 cognition
summary: 正文当前记录的主要认识和适用边界
importance: high
---

# 正文

完整 cognition。
```

规则：

- cognitive role 由路径目录决定：`decision | knowledge | intention | skill`；
- `description` 必须是非空字符串，说明适用条件 / 读取触发；
- 写入与更新工具要求模型提供并核对 `summary`；为了兼容旧记忆，存储解析不因缺少摘要而拒绝读取。缺摘要的记忆不参加语义发现，仍可按路径读取或按正文词句搜索；
- `importance` 必须是 `low | medium | high | critical`；
- body 必须非空；
- learning、retrievability、exposure、challenge 等内部状态由 companion state 维护，不写入 archival frontmatter。

## Scope Core

每个 active built-in scope 恰有一个 Core：

- Global Core：跨项目必须 resident 的极少量 guidance / routing；
- Project Core：当前项目必须 resident 的极少量 guidance，以及重要 active work 的 trigger + exact memory path + usage guidance。

完整 cognition 应放在 archival memories；Core 只保留让它能够稳定被找到和使用的最小路由。

Core 不使用 archival frontmatter，最大长度为 4000 Unicode code points。

Core mutation：

- 空 Core 可以用 `brain_edit(content=...)` 初始化；
- 非空 Core 必须使用 exact `edits`；
- 需要整体重写非空 Core 时，用一个 exact edit，把完整当前 Core 作为 `oldText`；
- stale `oldText` 不匹配时 edit 失败，不静默覆盖较新的 Core；
- `brain_write`、`brain_rm`、`brain_mv` 不作用于 Core。

## brain_edit / brain_mv

`brain_edit`：

- archival cognition 可以用 exact `edits`，也可以用完整 `content` 重写同一 cognition；
- non-empty Scope Core 只能 exact edit；
- missing document 不由 `brain_edit` 创建。

`brain_mv`：

- 只移动 archival cognition；
- 可以改变 Global / Project continuity scope、cognitive role 或 relative path；
- destination 已存在时是 replace，不是 merge；
- 不移动 Core、directory 或 supporting assets。

## Feedback

`brain_feedback` 只改变 learning / challenge state，不改 cognition document：

- `adopt`：实际使用过该 cognition，且观察结果支持这次使用时记录；
- `question`：有具体 evidence materially challenge 当前 cognition，且问题仍未解决时设置 / 替换 current challenge；
- `resolve`：当前 challenge 已解决后清除 challenge；如果 cognition 本身需要修改，先 `brain_edit`。

仅仅读取、提及、同意或准备使用 cognition，不构成 `adopt`。

## Discovery

不提供 `path` 的 lexical discovery 搜索：

```text
Global memories
+ current Project memories
+ available related Project memories
```

不存在 current-session memory source。

显式 `path` 只搜索被指定的 Global / Project / related-project memory tree。

Semantic Search 使用同样的 cognition universe。

## 并发与一致性

Brain semantic mutation 使用 brain-root cross-process lease 串行化。derive / compare / commit 在同一个受协调 operation 中完成。

这意味着多个 host session/process 可以共享同一 Project Core；non-empty Core 的 exact-edit contract 提供 compare-and-apply，stale edit 会失败而不是覆盖更新后的内容。

Semantic operation 成功后提供 read-your-writes。Git checkpoint / history 是辅助能力；Git 不可用不能阻止 cognition tools 正常工作。

## Brain repository / Project mapping

Brain repository 固定为：

```text
~/.brain-data
```

当前不使用同名环境变量改变这个根目录。

Source root 通过 `projects/*/project.json` 映射到稳定 ProjectId；一个 ProjectId 可以登记多个 source roots。Multiplexed host 必须为每次调用解析正确的 source root / project services，不能把长驻 server process cwd 当作当前 project。

## Semantic Search

Agent 的 Brain MCP 安装与更新、Global 记忆导入导出和可选 `brain-ai` 记忆包安装，见 [Brain CLI](../brain-cli/README.md)。

Semantic Search 默认关闭。全局配置位于：

```text
~/.brain-data/config.json
```

启用：

```json
{
  "semanticSearch": {
    "enabled": true
  }
}
```

本机 embedding runtime 安装：

```bash
node ../brain-cli/index.mjs semantic-search install
```

配置在 runtime 启动时读取；修改后需要重启相应 Brain host。

启用后，Brain 在 `~/.brain-data/.runtime/semantic-search/` 维护 SQLite derived index，并公开 `brain_ask_search`。向量只使用 archival frontmatter 的 `summary`；结果返回路径、`description`、`summary` 和可用争议标记。正文仍由 `brain_grep` 搜索和 `brain_cat` 读取。Index 只包含 Global / Project cognition；Markdown + companion state 仍是 authoritative state。

## Brain Web

`code/brain-web` 只投影当前 Global / Project cognition。

Brain Web 的页面 Markdown 是 projection；search document 保留 cognition 原始文本作为检索内容。

## 开发与验证

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

开发 stub：

```bash
pnpm run stub
```

`stub` 与 production 都使用 `dist/index.mjs` 入口。源码或 build 更新后，已经运行的 MCP / host process 需要重启，才会加载新的 runtime。

不同 host 的接线见 [MCP_HOSTS.md](MCP_HOSTS.md)。DSH AutoThink 由独立 `brain-dsh-plugin` 提供；Codex 的 thread/session binding 由 `brain-codex-plugin` 持有；Claude Code 的 turn-start restore 与 MCP 接线由 `brain-claude-plugin` 提供。这些 host adapter 不改变 Brain cognition scope。
