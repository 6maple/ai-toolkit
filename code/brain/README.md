# brain

通用 MCP cognitive memory runtime：三层持久记忆（global / project / session）+ 每轮认知锚 + 渐进披露 + 用进废退学习状态。

## 当前基线

2026-08-20 已完成 Frozen BDD / Acceptance → Engineering Design → Fake Green → Production CI Red/Green → Compliance Review：

```text
pnpm test
→ 9 test files / 60 tests passed

pnpm run typecheck
→ passed
```

权威文档：

- `../../doc/brain/v1/bdd-brain-behavior-requirements.md` — 行为需求；
- `../../doc/brain/v1/brain-tools-contract.md` — 模型可见/public tool contract；
- `../../doc/brain/v1/acceptance-spec-brain.md` — Frozen Specification by Example；
- `../../doc/brain/v1/design-brain-runtime.md` — 完整 Engineering Design；
- `../../doc/design-rule.md` — 设计与验证方法；

- `../../doc/brain/archive/` — 历史资料。

## 模型可见契约

### `brain_think`

收到**每一条新的用户消息后立即调用一次**；拿到返回的 global/project/session core、L0 candidates 和 signals 后，把它们作为当前记忆继续思考、回答和行动。

公开参数只有：

```text
session_id?
```

project root 不由模型逐次传入，而是在 MCP server 启动时固定。

### 7 个熟悉动作工具

- `brain_ls` — 浏览公开 memory directory；
- `brain_grep` — regex/literal 检索公开 archival memory；
- `brain_cat` — 渐进读取：L1 summary/metadata；带 offset 时 L2 body page；
- `brain_write` — 写完整 archival Markdown，**create / overwrite**；overwrite 保留已有内部 id 与 learning state；
- `brain_edit` — 精确修改已有 item，或以 `content` 整篇替换 core；
- `brain_rm` — 逻辑删除 archival item；
- `brain_mv` — 熟悉的 file→file move/replace 语义；source/destination 使用明确文件级 @-path，支持跨层、类型迁移、item↔core、core→core。

所有地址使用 @-scheme：

```text
@/memories/<type>/<name>.md
@/sessions/<sid>/memories/<type>/<name>.md
@global/memories/<type>/<name>.md
@core/project.md
@core/global.md
@core/sessions/<sid>.md
```

机制文件、真实 filesystem path、`memories/history/` 不对模型开放。

## 记忆语义

archival item 是 Markdown：

```md
---
type: knowledge
summary: 一句话摘要
importance: 0.7
---

# 正文

...
```

- `type`: `decision | knowledge | intention | skill`；必须与路径 type directory 一致；
- `summary`: 模型自己生成；
- `importance`: `[0,1]`，模型语义值；
- id / difficulty / stability / retrievability / exposure / usage / status 等由机制维护，不写入 frontmatter。

读取/学习事件：

- L0：看到候选，只增加 exposure；
- L1：摘要级读取；
- L2：正文深读，只刷新 retrieval 状态，**不等于成功 adopt**；
- `feedback="adopt"`：成功使用；
- `feedback="correct"`：轻纠正，questioned；
- `feedback="attribute"`：失败归因，不质疑内容本身。

feedback 必须显式提供；普通 edit/write overwrite 不会根据 importance 变化自动猜 adopt/correct。

## Core

每层恰有 1 篇逻辑 core Markdown，物理内嵌于该层 `state.json`：

- global — 跨项目长期原则/偏好；
- project — 项目目标/架构/约定；
- session — 当前会话状态/承诺/进度。

core 可正常 `brain_cat` / `brain_edit` / `brain_mv`；写入 core 有长度保护。core→archival 时，源 core 必须已经具备合法 archival frontmatter，brain 不替模型生成 summary/type/importance。

## 审批

```text
BRAIN_ASK_LONG_TERM=none      # 默认
BRAIN_ASK_LONG_TERM=protect
```

`protect` 下，只要一次 mutation 实际修改 project/global 就返回 pending-approval；`brain_mv` 同时检查 source 和 destination。`confirmed:true` 重试后提交。

## 并发与一致性

部署拓扑：每项目最多一个 brain MCP process；多个项目共享 global memory。

- project/session：当前 MCP process 内 mutation queue；
- global：同进程 queue + 跨进程 exclusive lock；
- 所有会修改 global 的 think/read-review/write/edit/core-edit/rm/mv/sync 都使用同一 global lock；
- mutation 在一个 tool call 内同步 plan/validate → commit → verify → return；success 后立即 read-your-writes；
- `state.json/index.json` 普通覆盖采用同目录 temp → close → rename；
- 当前 v1 不引入 durable WAL/journal；若 crash 造成跨文件 invariant 不一致，下一次加载 fail loud，不静默猜测恢复。

## 环境变量

| 变量                  | 默认            | 说明                                   |
| --------------------- | --------------- | -------------------------------------- |
| `BRAIN_PROJECT_ROOT`  | process cwd     | 当前项目根；每个 MCP server 启动时固定 |
| `BRAIN_HOME`          | `~/.brain-data` | 共享 global memory root                |
| `BRAIN_ASK_LONG_TERM` | `none`          | `none` / `protect`                     |

## 开发与运行

```bash
pnpm install
pnpm exec vitest run --configLoader native
pnpm exec tsc --noEmit
node src/index.ts
```

发布/打包方式按项目现有 package scripts 执行。

不同 MCP host 的挂载与 session `_meta` 接线见 [MCP_HOSTS.md](MCP_HOSTS.md)。DSH 的 AutoThink 增强由独立 `brain-dsh-plugin` 提供，它是宿主适配层，不改变 brain 核心契约。

## 仍需真实使用标定

机制闭环已经完成；后续主要是基于真实使用数据调整 α、questioned penalty、promotion/demotion 阈值、core 容量和 FSRS 系数。参数调整不能反向改变 BDD 行为边界。
