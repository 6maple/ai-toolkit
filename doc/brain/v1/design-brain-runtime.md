# brain 工程设计

> **状态：Design Baseline / Re-reviewed（2026-08-20，基于 Frozen Acceptance Specification）**  
> **范围：仅 `code/brain/` 本体，不包含 `brain-dsh-plugin` 或其他宿主集成。**  
> **需求基线：`doc/brain/v1/bdd-brain-behavior-requirements.md`；冻结验收规格：`doc/brain/v1/acceptance-spec-brain.md`**
> 本文档回答“如何实现 Frozen BDD / Acceptance Specification 中已经确认的行为”。若本文与 BDD / frozen acceptance expectation 冲突，必须修改 Design；不能反向修改 acceptance 来迁就 How。若 Design 暴露真正的行为歧义，先回到 BDD/Scenario 重新裁决并重新 Freeze。

## 1. 设计目标

brain 是一个纯程序化 MCP memory runtime。设计需要同时满足：

- 模型看到的是熟悉的 `brain_ls / brain_grep / brain_cat / brain_write / brain_edit / brain_rm / brain_mv` 与 `brain_think`，而不是内部文件系统；同名工具的参数与基础行为默认对齐模型已有训练先验，只有已确认 BDD 的 memory-specific 需求确实冲突时才偏离，并由 tool description 明确说明；
- 三层 memory（global / project / session）具有独立生命周期，但可被一次 `brain_think` 合并成整体认知锚；
- 模型负责语义：写什么、summary/type/importance 是什么、写哪层、何时 adopt/correct/attribute；
- 机制负责确定性约束：路径、安全、schema、区间、状态机、审批门、索引同步、并发、一致性、审计；
- 所有写入在成功返回后必须形成可验证的一致状态；
- 不为了预防性问题扩张协议。特别是：不引入额外 turn identity 协议、不内嵌 LLM、不引入 embedding/RAG、不把宿主自动注入能力耦合进 brain。

### 1.1 非目标

本文档不设计：

- `brain-dsh-plugin` 的 AutoThink、DSH/Codex hook 或 UI；
- questioned / FSRS 参数的最终标定值；
- 额外的 repair/admin MCP 工具；
- 数据库化重写（SQLite 等）；
- 语义推断、自动摘要、自动选层。

---

## 2. 设计依据与文档关系

| 材料 | 作用 |
|---|---|
| `doc/brain/v1/bdd-brain-behavior-requirements.md` | **唯一行为需求基线**；本文逐条落实 |
| `doc/brain/v1/acceptance-spec-brain.md` | **Frozen Specification by Example**；约束可观察 expected behavior 与 verification 边界 |
| `doc/brain/v1/brain-tools-contract.md` | 当前模型可见/public tool contract；约束 schema、@-scheme 与工具交互语义 |
| `doc/design-rule.md` | **设计方法约束**：最小充分机制、failure-driven、训练先验、真实部署拓扑、测试设计原则 |

| `doc/brain/archive/*` | 历史背景、旧设计/实现笔记、讨论和测试快照；仅用于追溯，不作为当前 Design truth |

| 当前 `src/**` / legacy tests | implementation 现状事实；用于 compliance/改造，不反向定义需求或设计 |
---

## 3. 总体架构

```text
MCP caller / model
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ brain MCP tools                                     │
│ think / ls / grep / cat / write / edit / rm / mv      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Contract + validation                                   │
│ @-path parser │ session id │ path-kind │ frontmatter    │
│ feedback range │ approval scope │ core length           │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Layer operation runtime                                 │
│ process queue + global lock  │ transaction plan          │
│ state/index invariant validation │ audit                │
└───────────────┬───────────────────────┬─────────────────┘
                │                       │
        global layer              project/session layers
                │                       │
                ▼                       ▼
      state / index / memories / history / change_history
```

核心原则是把一次工具调用拆成：

`解析 → 校验 → 审批门 → 进入 queue/必要锁 → 加载 → 构造 MutationPlan → 再校验 → 同步提交 → 校验结果 → 审计 → 返回`

任何会改变持久状态的操作都必须走同一条 mutation pipeline；不得继续采用“先让底层 write/edit 改正文，再尽量 sync index/state”的双阶段模式。

---

## 4. 根目录与三层定位

### 4.1 进程级根

brain server 启动时确定：

```text
projectRoot = canonical(BRAIN_PROJECT_ROOT || process.cwd())
globalRoot  = canonical(BRAIN_HOME || ~/.brain-data)
projectBrainRoot = <projectRoot>/.brain-data
```

项目根是**进程级配置**。所有 `brain_*` 工具必须使用同一 projectRoot，避免一次 `brain_think` 在 A 项目生成 @-path、后续工具却在 B 项目解析。

`brain_think` 的模型可见 schema **不再暴露 `project_root`**。真实部署已经是“每项目一个 MCP server，projectRoot 在 server 启动时固定”；debug/test 需要切换项目根时，通过 server 启动参数、`BRAIN_PROJECT_ROOT` 或测试构造环境完成，不把 debug knob 暴露给模型。

### 4.2 LayerRoot

```text
global  → <globalRoot>/
project → <projectBrainRoot>/
session → <projectBrainRoot>/sessions/<sessionId>/
```

每个 LayerRoot 独立拥有：

```text
state.json
index.json
history.jsonl
change_history.jsonl
memories/
  decision/
  knowledge/
  intention/
  skill/
  history/
```

session id 的唯一作用是选择 session LayerRoot，不具有路径语义。

---

## 5. @-scheme 与路径类型系统

### 5.1 不再使用模糊的 `kind: "file"`

内部 `BrainPath` 必须是判别联合：

```ts
type BrainPath =
  | { kind: "directory"; layer: Layer; abs: string; rel: string; roots: ResolvedRoots }
  | { kind: "item"; layer: Layer; abs: string; rel: string; memoryType: MemoryType; roots: ResolvedRoots }
  | { kind: "core"; layer: Layer; roots: ResolvedRoots; sessionId?: string };
```

工具只接受与动作匹配的 kind：

| 工具 | directory | item | core |
|---|---:|---:|---:|
| `brain_ls` | ✅ | 可列父/自身信息 | ❌ |
| `brain_grep` | ✅ | ✅ | ❌ |
| `brain_cat` | ❌ | ✅ | ✅ |
| `brain_write` | ❌ | ✅（create / overwrite） | ❌ |
| `brain_edit` | ❌ | ✅ | ✅ |
| `brain_rm` | ❌ | ✅ | ❌ |
| `brain_mv` source | ❌ | ✅ | ✅ |
| `brain_mv` destination | ❌ | ✅ | ✅ |

### 5.2 合法公开路径

```text
@/memories/<type>/<name>.md
@/sessions/<sid>/memories/<type>/<name>.md
@global/memories/<type>/<name>.md
@core/project.md
@core/global.md
@core/sessions/<sid>.md
```

`brain_ls/grep` 可以接受相应 memories 根或类型目录；mutation 的 archival item 必须落在 `<type>/*.md`。

以下一律拒绝：

- `state.json/index.json/history.jsonl/change_history.jsonl`；
- 非 `.md` archival item；
- `memories/history` 作为模型主动寻址目标；该目录也不得出现在 `brain_ls` 结果或 `brain_grep` 搜索范围中；
- `.` / `..` traversal；
- 绝对路径、盘符、UNC、反斜线逃逸；
- symlink 后 realpath 逃出预期 LayerRoot。

### 5.3 session id

统一函数：

```ts
validateSessionId(value: string): string
```

v1 使用安全文件段约束：

```text
^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$
```

并额外拒绝 `.`、`..`。显式参数、MCP `_meta`、@-scheme 中的 sid 均必须经过同一函数。

解析完成后再次断言：

```text
parent(canonical(sessionLayerRoot)) == canonical(<projectBrainRoot>/sessions)
```

形成语法校验 + resolved parent 双层保护。

---

## 6. 数据模型

### 6.1 archival Markdown

模型语义字段只存于 Markdown：

```yaml
---
type: knowledge
summary: 一句可独立理解的摘要
importance: 0.8
---
正文……
```

必需字段：

- `type ∈ decision | knowledge | intention | skill`
- `summary` 非空字符串
- `importance ∈ [0,1]`

`difficulty` 不要求模型填写；由机制初始化。

### 6.2 path type 是结构约束

`memories/skill/x.md` 必须对应 `type: skill`。

模型决定“它是什么类型”；机制只验证“路径声明与 frontmatter 声明一致”。如果模型要改变类型，应通过 `brain_mv` 指向另一个类型目录下的**明确 `.md` destination file path**；destination file 的父类型目录表达模型选择的新 type，brain 在同一 transaction 中把 frontmatter `type` 同步改成 destination path 对应的 type。不能只 edit frontmatter 留在旧目录，也不接受仅给 type directory 的 destination shorthand。

### 6.3 index.json

index 只存 L0 所需语义快照与内部 identity：

```ts
interface IndexEntry {
  id: string;             // UUID，机制内部
  file: string;           // layer 内相对路径
  type: MemoryType;
  summary: string;
  importance: number;
  updated_at: number;     // mechanism tick 或稳定序列
}
```

index 不存正文，不向模型暴露 id。

### 6.4 state.json

```ts
interface MechanismItem {
  stability: number;
  difficulty: number;
  last_at: number;
  exposure: number;
  usage: { ok: number; fail: number };
  status: "active" | "questioned" | "removed";
}

interface LayerState {
  version: number;
  tick: number;
  core: string[];                 // 0 或 1 个元素；模型语义是一篇 core 文档
  items: Record<string, MechanismItem>;
}
```

retrievability `R` 优先作为 `tick / stability / last_at` 的派生值实时计算；如果为了兼容旧 schema 暂时持久化，也必须在加载时重新计算/校验，不能成为第二真相。

### 6.5 ID

新 archival item 使用 `crypto.randomUUID()`。

理由：

- 不依赖 tick；
- 不依赖进程内 counter；
- 重启后不会回绕；
- 跨 project MCP 进程共享 global layer 时仍具有足够碰撞安全性；
- id 对模型不可见，无需为了可读性设计层前缀。

创建时仍必须断言生成 id 不存在于当前 state/index；极端碰撞则重新生成。

跨层 `brain_mv` **保留同一 id**，因为它是同一记忆的迁移而不是新建。这样也自然保留全部 FSRS/usage/status 状态；不再因“目标层前缀”重新生成 id。提交前必须断言 destination layer 中不存在由其他 active/ questioned item 占用的同 id；若出现这种极端碰撞/损坏，fail loud，而不是静默复用或覆盖 state。

---

## 7. invariant 验证

### 7.1 热路径结构校验

每次 LayerRoot 参与受锁操作时统一执行：

```text
recoverIncompleteTransaction(layer)
load state/index
validateStoreStructure(layer)
```

热路径只检查无需扫描所有 Markdown 的结构 invariant：

1. state/index JSON 可解析且 schema/version 合法；
2. active/questioned index entry 的 id 唯一；
3. 每个 active index entry 有对应 state item；
4. `status=active|questioned` 的 state item 应有 index；`removed` 可以无 active index；
5. core 数组长度 ≤ 1，core 文档长度合法；
6. session LayerRoot 与 sid containment 合法。

`brain_think` 的 L0 因此仍然可以直接从 index 生成 candidates，不扫描所有正文。

### 7.2 item 局部一致性校验

当一个具体 archival item 被 `cat/edit/rm/mv` 访问，或 write 的 effective destination 已存在时，只对相关 item 检查：

- Markdown 存在且是合法 archival document；
- Markdown type/summary/importance 与 index 一致；
- path type == frontmatter type；
- id/state 绑定唯一。

### 7.3 全量一致性校验

全量扫描只在以下情况触发：

- transaction recovery 后需要验证恢复结果；
- 测试/诊断入口；
- schema migration 等显式维护阶段。

发现现存损坏时 **fail loud**，不使用默认值把损坏状态当作“第一次运行”。只有文件真正不存在时才允许初始化空 state/index。

---

## 8. `brain_think`

### 8.1 工具描述

工具 description 必须把调用纪律写在最前：

> **Immediately after receiving each user message, call `brain_think` once before continuing your reasoning or taking substantive action. Read the returned core memories, candidates, and signals, then continue thinking with them as your memory context.**

核心不是“回答前形式化调用”，而是：**先取得 memory view，再拿它继续思考。**

brain 本体只提供此工具契约；外部宿主是否自动调用不属于本设计。

### 8.2 参数

当前候选参数：

```text
session_id?
```

模型可见参数保持最小；project root 是 server 进程级配置，不作为 `brain_think` 调用参数。

不引入额外 turn identity 或幂等 token。每次成功调用 `brain_think` 都是一条有效 brain event：三层 tick 各 +1，并对本次实际返回的 L0 candidates 各记一次 exposure。

### 8.3 执行

`brain_think` 会同时修改 global/project/session，因此：

1. 根据 session id 得到三层 LayerRoot；
2. 进入当前 server 的进程内 mutation queue，并获取 global cross-process lock；project/session 不加跨进程文件锁；
3. 验证三层必要 invariant；
4. 三层 tick 各 +1；
5. 计算三层 core；
6. 从三层 index 生成统一 L0 candidates；v1 使用 `CANDIDATE_LIMIT=10`，该值属于 Design/Calibration 参数而非长期 acceptance contract；
7. 对实际展示 candidate exposure +1；
8. 生成 promotion/demotion signals；
9. 使用与其他 mutation 相同的 transaction runtime 同步提交三个 state 的 tick/exposure 变化；
10. **提交完成后**返回 memory view。

`brain_think` 虽不修改 archival body/index，但它会同时修改三层 mechanism state，因此不能用三个互不关联的裸 `writeFile` 声称“每轮事件已一致推进”。

### 8.4 L0 排序

保持简单主公式：

```text
baseScore = importance - α * exposure
```

`questioned` 必须额外机械降权。设计使用独立常量：

```text
score = baseScore - (status == questioned ? QUESTIONED_PENALTY : 0)
```

`QUESTIONED_PENALTY > 0`，具体默认值属于参数标定；verification 只固化“同条件 questioned 在公开候选行为上严格低于 otherwise-equivalent active”，不固化未经标定的数值。

candidate 输出至少包含：

```json
{
  "layer": "project",
  "path": "@/memories/knowledge/x.md",
  "type": "knowledge",
  "summary": "...",
  "relevance": 0.72,
  "status": "questioned"
}
```

active 可省略 status 或显式返回 `active`；questioned 必须显式可见。

---

## 9. 渐进读取与 review

### 9.1 L1

`brain_cat(path)`（无正文 offset）只返回 frontmatter 摘要级信息与必要 metadata，不返回 20 行正文 preview。

L1 可以记录 retrieval review，但：

- 不增加 usage.ok；
- 不等同 adopt；
- 数值更新由纯函数 `applyL1Review` 完成，参数保持可标定。

### 9.2 L2

`brain_cat(path, offset, limit)` 只有在**实际返回至少一行正文内容**时才产生 L2 read event。

L2 表示记忆被真正取回/深读：

- 可以刷新 `last_at` / retrievability；
- 不增加 usage.ok；
- 不执行与成功采用等价的 `good` stability 增长。

空页、越界 offset、`(no more lines)` 都不改变 review state。

### 9.3 adopt

只有 `brain_edit(..., feedback="adopt")` 才表达“该记忆被实际采用并成功作用于行动”：

- feedback 与文本修改是两个正交维度；当内容无需变化时，archival `brain_edit` 允许 `edits=[]`；
- `adopt` / `attribute` 的合法区间包含 delta=0，因此可作为纯 feedback event；
- correct 的合法区间严格为负，因此仍需要产生合法 importance 下调，不能用 0-delta no-op correct。

- `usage.ok += 1`
- 执行 good-style stability 更新
- importance delta 受 adopt 区间约束

这样不会出现“L2 深读一次 + adopt 一次 = 两次 good”的重复强化。

---

## 10. write/edit 与 semantic validation

### 10.1 统一 `DocumentPlan`

write/edit 不允许先改真实文件。先在内存构造：

```ts
interface DocumentPlan {
  path: BrainPath & { kind: "item" };
  before?: string;
  after: string;
  metadata: ParsedMemoryMetadata;
}
```

edit 的 `edits[]` 先应用到内存字符串，得到完整 `after`；然后对 resulting document 做完整 frontmatter 校验。

### 10.2 `brain_write`

`brain_write` 对齐项目实际复用的 pi/coding-agent `write` 训练先验：**create / overwrite**。它表达“用这份完整 Markdown 作为该 path 的最终内容”；`brain_edit` 则表达对已有内容的局部、精确修改。

共同规则：

- 目标必须是 item path；
- after document 必须满足完整 semantic contract；
- path type 必须等于 frontmatter type；
- semantic validation、审批和一致性检查必须在正式持久 mutation 前完成。

目标不存在时：

- 创建正文/index entry；
- 新建 UUID + 初始 mechanism state：
  - stability = 当前起始参数
  - difficulty = `0.4`
  - exposure = 0
  - usage = 0/0
  - status = active
  - last_at = 当前 layer tick。

目标已存在时：

- 读取现有 index/state，确认它是一条一致的 active/questioned item；
- 用新的完整 Markdown 覆盖正文；
- 根据新 frontmatter 同步更新 index 的 type/summary/importance 等 semantic metadata；
- **保留现有内部 id、stability、difficulty、retrievability、last_at、exposure、usage、status 等 mechanism learning state**；`brain_write` 本身不承担 adopt/correct/attribute 反馈语义；
- overwrite 不产生“新记忆创建”的 mechanism 初始化，也不要求模型改用 `brain_edit`。

### 10.3 `brain_edit`

- item 必须已存在；core 走独立 core 分支；
- resulting document 在任何持久 mutation 前验证；
- type 若被 edit 单独改成与当前路径目录不同，拒绝并提示用 `brain_mv` 完成类型迁移；`brain_mv` 跨类型目录时由 destination type 驱动 frontmatter type 的原子同步；
- summary/importance 更新同步进入 index；
- feedback 更新 mechanism state。

### 10.4 feedback 统一函数

```ts
applyFeedback(oldImportance, requestedImportance, feedback, item)
```

规则：

| feedback | 合法方向/区间 | 状态/usage |
|---|---|---|
| adopt | delta `[0,+0.2]` | good；usage.ok+1 |
| correct | delta `[-0.3,-0.05]`，高 importance 可收窄 | again；usage.fail+1；status=questioned |
| attribute | delta `[-0.15,0]` | failure review；usage.fail+1；不把内容置 questioned |

处理顺序：

1. 先验证反馈方向；方向矛盾直接 reject，所有状态不变；
2. 方向正确后计算该 item 当前合法区间（含 correction damping）；
3. 仅幅度越界时 clamp；
4. 返回结构化 notice，明确 requested delta 与 applied delta；
5. 再更新 usage/status/FSRS。

不得通过单侧 `Math.min/Math.max` 接受方向错误的 feedback。

---

## 11. core

### 11.1 单文档语义

每层 state.core 始终是 `[]` 或 `[markdown]`；模型只看到一篇 `@core/...md`。

core：

- 不参与 index；
- 不参与 FSRS / exposure / usage；
- 可以有 frontmatter，但 brain 不要求它满足 archival schema；
- write-time 检查 `CORE_DOC_MAX_CHARS`。

### 11.2 edit core

`brain_edit @core/... content=<完整文档>`：

- 先检查长度；
- 再进入统一 mutation transaction；
- project/global 是否审批按 touched layer 判定。

### 11.3 core → archival

已确认 D2：`brain_mv @core/... <archival dst>` 不替模型生成语义 metadata。

在任何 mutation 前检查 core 文档本身是否已经包含完整合法 archival frontmatter，并且 `type` 与 dst 目录一致。

若缺失或非法：

```text
error: core document is not yet a valid archival memory; add type/summary/importance with brain_edit @core/... first, then retry brain_mv
```

通过后才：

- 写出 dst item；
- 创建 UUID / mechanism state；
- 清空源 core；
- 更新 index/state/audit。

### 11.4 archival → core

incoming item 的完整 Markdown 替换目标 core；进入 core 后其 archival index entry 退出 active 检索，原 mechanism item 可以置 `removed`（reason=promoted/moved-to-core 在 audit 中表达），但不记入 deletion history。

源 archival 正文可移动至 history/recycle 作为可恢复副本，因为公开内容已进入 core；这属于内部存储行为，不改变模型可见 `mv`。

### 11.5 core → core

源 core 清空，目标 core 被源完整替换。先验证目标长度与审批，再以跨层 transaction 一次提交。

---

## 12. `brain_mv` 生命周期

### 12.1 模型可见语义

`brain_mv` 保持 `src/dst` 参数与熟悉的 file → file `mv` 先验，但 memory namespace 要求地址无歧义：

- archival file → archival file：移动/重命名；
- destination archival item 已存在：source **replace** destination；
- archival → core：明确 file path → core file，替换目标 core；
- core → archival：core file → 明确 archival `.md` file；
- core → core：源清空、目标替换；
- source / destination 都不接受 directory shorthand。

因此 `brain_mv src @/.../knowledge` 必须拒绝并要求模型给出明确 destination file path。这里是对通用 `mv file directory` 的小范围 memory-specific 偏离，用来避免 core 名称、类型迁移与 archival 文件名之间的歧义。brain 不增加 `overwrite=true`、`new_type` 等额外参数。

### 12.2 archival file → archival file，同一记忆迁移

`src` 与 `dst` 都已经解析为明确 archival item path；不存在额外 `effectiveDst` / basename 推导。

source item 的 id 与 mechanism state 全部保留；只更新：

- file path；
- layer 所属 index/state 容器；
- 若跨层，last_at/tick 不重置；
- 若 destination file 所在的类型目录与 source frontmatter type 不同，则把它视为模型通过**明确 destination file path**发起的类型迁移：MutationPlan 在内存中把 resulting document 的 frontmatter `type` 改成 destination path 对应 type，并同步内部 L0 metadata；与正文移动、learning state 迁移一起提交。

最终不允许出现 public path type 与 semantic type 的双重真相。

### 12.3 destination 已存在：replace

已确认 D3：公开语义仍是 `mv` replace，但旧 destination 不物理消失。

transaction 内执行：

1. 读取 source 与 old destination 两条完整状态；
2. old destination 正文移动到本层 `memories/history/` 唯一回收路径；
3. old destination 从 active index 退出；
4. old destination mechanism item 置 `status=removed`（保留内部状态用于审计/潜在恢复）；
5. **不写 deletion `history.jsonl`**，因为这不是用户 `brain_rm` 强纠正；
6. `change_history.jsonl` 写 `mv_replace_target`；
7. source 迁到 destination，并保留 source id/state；
8. 写 source 的 `mv_out` / destination 的 `mv_in` change audit。

最终 active destination 对应 source 的 identity；旧 destination 只存在于 recycle + removed state/audit，不留下 ghost active metadata。

---

## 13. `brain_rm`

仅接受 archival item。

transaction 内：

1. 正文移动到本层 `memories/history/<unique-name>.md`；
2. active index entry 删除；
3. mechanism item `status=removed`；
4. `history.jsonl` 追加强纠正/删除事件；
5. `change_history.jsonl` 追加 `rm`；
6. history 不自动清理。

core 不支持 rm；提示使用 edit 或 mv。

---

## 14. 审批

### 14.1 统一配置

```text
BRAIN_ASK_LONG_TERM=none | protect
默认 none
```

`none`：任何 brain mutation 不要求额外确认。

`protect`：只要此次 MutationPlan 会改变 project/global 任一层，就要求确认。

### 14.2 touched layers

审批不按“目标层”捷径判断，而由计划阶段计算：

```ts
mutation.touchedLayers: Set<Layer>
```

例如：

- write project → `{project}`
- edit session → `{session}`
- mv project → session → `{project, session}` → 需要确认
- mv session → global → `{session, global}` → 需要确认
- core global → project → `{global, project}` → 需要确认

### 14.3 两段式

protect + touched long-term + `confirmed !== true`：

- 返回 pending-approval；
- 不改变 body/index/state/audit；
- 不执行任何文件 mutation。

`confirmed: true` 重试后执行。

brain 的信任边界到“调用方提供 confirmed”截止；v1 不增加审批 token、challenge id 或宿主真实性验证。

---

## 15. 并发控制

### 15.1 实际并发拓扑

部署前提是**每项目最多一个 brain MCP server 进程**。因此：

- 当前项目的 project layer 只由该项目 server 访问；
- 该项目下各 session layer 也只由同一个 server 访问；
- 只有 global LayerRoot 会被多个不同项目的 MCP server 进程共同访问。

所以 project/session 不需要额外的跨进程文件锁；同进程并发由一个进程内 mutation queue 串行化即可。

### 15.2 global 跨进程互斥

任何会读取并修改 global 的操作，在进入 global transaction 前必须获得一个**global 专用的跨进程 exclusive lock**。它的含义很简单：同一时刻只能有一个 brain 进程对共享 global state/index/body 做一致性 mutation。

可用文件系统可见的原子锁实现，例如在 global root 下原子创建 `.brain.lock`（具体库/协议可在实现时选择）。另一个项目进程如果发现锁已存在，就等待当前 global mutation 完成后再继续。

这个锁只服务于 global，不为 project/session 创建对应的跨进程锁。

### 15.3 不需要多层文件锁排序

当前拓扑下只有一个跨进程共享锁：global lock。project/session 的 queue 都是各自进程私有的，不会被其他 MCP server 持有，因此不会形成“进程 A 持 project 等 global、进程 B 持 global 等 project”的跨进程锁环。

统一获取顺序保持简单：

1. 进入当前 server 的进程内 mutation queue；
2. 若此次操作 touched global，再获取 global cross-process lock；
3. 完成 transaction；
4. 释放 global lock（如有）；
5. 离开进程内 queue。

`brain_think` 会修改 global tick/exposure，因此也需要短暂持有 global lock；仅涉及 project/session 的 mutation 不触碰该跨进程锁。

---

## 16. 一致提交与失败处理

### 16.1 MutationPlan

所有 mutation 都在**同一次工具调用内部**完成“计划 → 提交 → 返回”。`MutationPlan` 只是提交前的内存计划，不跨 tool call、不延迟到后续 turn、更不是后台异步队列。

真实文件改变前先构造完整计划：

```ts
interface MutationPlan {
  touchedLayers: LayerRef[];
  fileOps: FileOp[];
  nextIndexes: Map<LayerRef, IndexEntry[]>;
  nextStates: Map<LayerRef, LayerState>;
  auditOps: AuditOp[];
  rollbackOps: RollbackOp[];
}
```

计划阶段必须完成：路径、frontmatter、core length、feedback、目标冲突、审批范围、index/state invariant 等全部可预见校验。

### 16.2 原子单文件写

`state.json` / `index.json` / 新正文等普通覆盖写统一使用：

```text
write temp file in same directory
close temp file
rename temp → target
```

不得直接 truncate + write 正式 JSON 文件，避免进程中断留下半截 JSON。

### 16.3 同步提交

v1 不引入 durable transaction journal、WAL 或自动 roll-forward。当前真实问题是“正常工具调用中，正文先改而 index/state 同步失败会留下分裂状态”；最小充分机制是：**提交前把最终状态全部算清楚，提交期间持有本进程 mutation queue（涉及 global 时同时持有 global lock），失败则在同一次调用内回滚。**

流程：

1. 进入进程内 mutation queue；若 touched global，再获取 global cross-process lock；
2. 加载当前 body/index/state 并验证参与此次操作的 invariant；
3. 构造并校验 `MutationPlan`，同时在内存准备受影响文件的 rollback 内容/动作；
4. 在本次 tool call 内执行 body/state/index/audit changes；单文件覆盖使用 §16.2 的 temp + rename；
5. 验证提交后的关键 invariant；
6. **只有提交和校验全部完成后才返回 success**；随后调用方立刻执行的 `brain_cat` / `brain_think` / `brain_ls` 必须读到新状态；
7. 释放 global lock（如有）并离开进程 queue。

因此正常调用提供同步的 **read-your-writes** 语义，不存在“先向模型返回、稍后再落盘”的延迟提交。

### 16.4 同进程失败回滚

commit 任一步骤 throw 时，在当前调用仍持有 queue/global lock 的情况下执行 `rollbackOps`：

- 恢复已经变更的 body/state/index；
- 若 audit 已追加，则恢复到调用前长度；
- 重新验证受影响的关键 invariant；
- 回滚成功后返回原操作 error。

如果回滚本身失败，则必须返回明确的 store/invariant error，并将该 layer 视为损坏状态；后续 mutation 先校验并 fail loud，不得把部分 mutation 当成正常状态继续运行。

### 16.5 进程异常中断

单个 `state.json` / `index.json` 等覆盖写仍使用 §16.2 的同目录 temp + rename，避免单文件写入中途终止直接留下半截正式 JSON。

v1 **不为“进程恰好在多个已原子写文件之间崩溃”增加 durable journal 自动恢复协议**。SIGKILL、宿主崩溃、机器断电等强制终止发生在 mutation 完成前时，允许该次未完成 mutation 丢失；brain 不承诺自动 rollback / roll-forward，也不承诺识别所有仍可解析的跨文件部分提交组合。

若重启后某份持久表示本身不可解析或明确违反既有 invariant，仍按 corruption 规则 fail loud。除此之外不为 crash durability 增加额外协议。

该取舍基于实际职责边界：DSH / Codex 等宿主已经持久化会话事实，可作为对话恢复来源；brain core 从简，不重复承担 durable event log / transaction recovery 职责。

---

## 17. audit 与 history

明确区分两类日志：

### 17.1 `history.jsonl`

只记录**显式删除/强纠正**（`brain_rm`）。

普通 promotion/mv、mv replace 的被覆盖目标不写成用户删除事件。

### 17.2 `change_history.jsonl`

所有成功 mutation 都写：

```text
write
edit
feedback_adopt
feedback_correct
feedback_attribute
mv_out
mv_in
mv_replace_target
core_replace
core_clear
rm
```

每条至少包含 `action / @-path / tick / summary?`。

日志 append 也是 transaction 的一部分；工具 success 意味着所需 audit 已落地。

---

## 18. promotion / demotion signals

### 18.1 promotion

只对 `status=active` archival item 生成。

触发依据 `usage.ok >= PROMOTION_THRESHOLD`；signal 只表达“值得模型考虑提升作用域”，不自动 mv。

模型仍按语义决定目标 layer。

### 18.2 demotion

按 retrievability + importance 等既有机械条件产生 signal，不自动删除。

signal 给出可执行 @-path；模型可以选择 edit importance、纠正、移动或不处理。

questioned 不参与正常 promotion。

---

## 19. 错误模型与返回原则

错误分三类：

### 19.1 Contract error

如：非法 @-path、目录拿去 rm、frontmatter 缺字段、type mismatch、feedback 方向错误。

特点：操作前即可发现；**零副作用**；返回可执行修正提示。

### 19.2 Approval pending

不是 mutation failure，而是受配置控制的两段式状态；零副作用。

### 19.3 Store/invariant error

如 JSON 损坏、duplicate id、恢复失败、跨进程锁异常。

必须 fail loud；不自动初始化覆盖已有数据，不继续执行 mutation。

对模型可见错误不得泄露真实绝对路径；内部日志可记录真实路径供工程诊断。

---

## 20. 模块重构建议

目标不是大重写，而是把当前职责边界收紧。建议结构：

```text
src/
  index.ts                    MCP registration only
  memory/
    paths.ts                  @ parser + BrainPath union + sid validation
    frontmatter.ts            parse/validate semantic document
    store.ts                  state/index/audit atomic IO
    invariant.ts              layer invariant validation
    fsrs.ts                   pure review/retrievability functions
    candidates.ts             L0 ranking/signals
  runtime/
    lock.ts                   in-process queue + global interprocess lock
    transaction.ts            MutationPlan/commit/in-process rollback
    context.ts                roots/layer resolution
  tools/
    think.ts
    read.ts
    write.ts
    edit.ts
    lifecycle.ts              rm/mv/core movement
    approval.ts
    feedback.ts
```

`pi-adapt` 可以继续复用 pi 的参数/文本 edit 算法，但不得让 pi tool 直接修改正式 memory 文件；适配层应把 edit 应用到内存内容，再由 transaction runtime 提交。

---

## 21. 关键纯函数

为了让稳定机制可以被确定性验证，并避免 Fault/Invariant 测试依赖真实 sleep 或概率副作用，以下逻辑应保持可纯函数/小范围 mechanism test：

```ts
parseBrainPath(publicPath, roots): BrainPath
validateSessionId(sid): string
parseMemoryDocument(text): ParsedMemoryDocument
validatePathType(path, doc): void
applyTextEdits(before, edits): after
resolveFeedback(oldImportance, requestedImportance, feedback, item): FeedbackResult
computeRetrievability(item, tick): number
applyL1Review(item, tick): item
applyL2Read(item, tick): item
applyAdopt(item, tick): item
rankCandidate(entry, item, tick): score
approvalRequired(mode, touchedLayers): boolean
buildMutationPlan(...): MutationPlan
validateStoreStructure(state, index): void
validateItemInvariant(path, indexEntry, stateItem, document): void
validateLayerInvariantFull(layerSnapshot): void
```

这些纯函数测试属于 **Mechanism / Invariant verification**，用于验证 Design 的算法与结构，不作为“BDD 功能已经覆盖”的证据；功能覆盖仍由 Frozen Acceptance Specification 对应的 public MCP cases 证明。

---

## 22. REQ → 设计追踪矩阵

| BDD REQ | 设计章节 |
|---|---|
| REQ-SCOPE-001, REQ-SCOPE-002 | §4, §8, §18 |
| REQ-THINK-001, REQ-THINK-002 | §8 |
| REQ-PATH-001, REQ-PATH-002, REQ-PATH-003 | §4, §5 |
| REQ-CORE-001, REQ-CORE-002, REQ-CORE-003 | §11, §16 |
| REQ-READ-001, REQ-READ-002, REQ-READ-003 | §8, §9 |
| REQ-SEARCH-001 | §3, §20 |
| REQ-WRITE-001, REQ-WRITE-002 | §6, §10, §16 |
| REQ-EDIT-001 | §10, §16 |
| REQ-TYPE-001 | §5, §6, §10, §12 |
| REQ-FEEDBACK-001, REQ-FEEDBACK-002 | §10 |
| REQ-STATUS-001 | §8.4, §10, §18 |
| REQ-FSRS-001, REQ-FSRS-002, REQ-FSRS-003, REQ-FSRS-004 | §6, §8, §9, §10 |
| REQ-MOVE-001, REQ-MOVE-002, REQ-MOVE-003, REQ-MOVE-004 | §11, §12, §16 |
| REQ-DEMOTE-001 | §18 |
| REQ-RM-001, REQ-RM-002 | §12, §13, §17 |
| REQ-APPROVAL-001, REQ-APPROVAL-002 | §14 |
| REQ-CONSISTENCY-001, REQ-CONSISTENCY-002, REQ-CONSISTENCY-003, REQ-CONSISTENCY-004, REQ-CONSISTENCY-005 | §6.5, §7, §15, §16 |
| REQ-CORRUPT-001, REQ-CORRUPT-002 | §7, §16.5 |
| REQ-OUTPUT-001, REQ-OUTPUT-002 | §5, §8, §19 |

> BDD / Acceptance Specification Freeze 前后都应校验追踪关系，禁止出现 orphan REQ / Scenario；Design 不能通过新增内部测试来掩盖 public scenario 漏映射。

---

## 23. Verification Implementation Plan

本节只决定 Frozen Specification 如何被看护，不重新设计测试期望。验证分成 **CI Automated** 与 **Manual / E2E** 两类。

### 23.1 CI Automated：真实业务逻辑，假资源边界

CI tests 不启动真实 MCP/stdio，不创建真实 filesystem/store/process/network/LLM resource。

测试最终应连接真实 production business/application logic，但以下 resource ports 使用最小 stub/fake：

- persistence / filesystem；
- process / cross-process coordination；
- network / external service；
- LLM / semantic reviewer；
- 其他会产生真实外部资源的 adapter。

普通 object/array/Map 作为测试数据或 fake 内部状态允许使用。

CI acceptance 只通过稳定 application/tool facade 驱动行为，不 import `memory/store.ts`、`tools/lifecycle.ts` 等私有 helper 来证明功能。

### 23.2 Fake Green：最小测试替身

在 production 进入视野前，CI test scripts 先使用测试内局部最小 Stub/Fake 做 Self-Validation：

- 能用 `{}` / `vi.fn()` / 固定 result 就不用 stateful fake；
- mock 行为紧贴对应 action 前声明，不在测试顶部预排长 sequence；
- 只有跨步骤确实需要状态时才用几行轻量 fake；
- 不为未来 production wiring 预造统一 factory/driver/reference implementation；
- 不复制 FSRS/store/transaction/lock/domain 实现；
- Fake Green 只证明 test code 自洽。

随后冻结 Scenario、输入边界和核心业务 assertions；允许修改测试 Arrange / instance creation / dependency wiring 以接入真实 production logic，同时 resource ports 仍为 stub/fake。此时的 CI Red/Green 才代表 production 业务行为。

### 23.3 Manual / E2E：真实 resource adapters

以下不得进入普通 CI：

- 真实 MCP stdio/host wiring；
- 真实文件系统与 @-scheme mapping；
- 两个真实 process 的 global concurrency；
- 真实 process restart / persistence（仅验证已规定的身份连续性等行为；不包含 crash durability）；
- 真实删除回收/audit 的物理证据；
- LLM/AI 对自然语言 description/result 的语义 review。

这些按 `doc/brain/v1/acceptance-spec-brain.md` 的 `MAN-*` 以及显式标记 Manual/E2E 的 AC/FI case 执行。

### 23.4 Fault / Invariant / Mechanism

- 可预期 commit failure：CI 用 fake persistence port 确定性 throw，验证零部分状态；
- malformed/corrupt snapshot：CI 可让 fake repository 返回损坏输入，验证 fail loud；
- think-event / event-time：CI 直接验证确定性 domain transition，不用真实 sleep；
- rm recover/audit domain semantics：CI 用 fake audit/recycle port 验证；真实磁盘证据由 MAN-RM-001；
- parser、feedback range、ranking、approval predicate 等 mechanism tests 可以存在，但不能替代 AC 功能覆盖。

### 23.5 顺序

1. Design Freeze；
2. 每个 case 分类 CI Automated / 项目选择的其他验证方式；
3. 写 CI test scripts；
4. Acceptance Test Review；
5. 每个 test 就地使用最小 Stub/Fake 做 Fake Green；
6. 冻结 Scenario / 输入边界 / 核心业务 assertions；
7. 才读取/接入 current production business logic；允许修改 Arrange / instance creation / dependency wiring，resource ports 仍为 fake；
8. 第一次 CI production Red/Green；
9. Double-Loop implementation → CI Green；
10. 按 brain 当前项目 Test Strategy 选择是否执行 Manual/E2E 真实 adapter 用例；
11. Compliance Review。

已有直接调用内部 helper 或真实 filesystem/process 的测试必须重新分类：前者只能作为 Mechanism/Invariant 候选，后者只能作为 Manual/E2E 候选；不能继续以 REQ 标签冒充 CI acceptance coverage。
---

## 24. 设计决策汇总

本轮已经确认并纳入本文：

- **D1**：不引入额外 turn identity/幂等协议；`brain_think` 每次调用推进事件，description 负责要求“每条用户消息收到后立即调用一次，并用返回记忆继续思考”。
- **D2**：core→archival 若 core 没有完整合法 `type/summary/importance`，mv 拒绝并提示先 edit；不扩张 mv 参数，也不让机制猜语义。
- **D3**：archival mv replace 对模型保持标准 mv 语义；旧 destination 内部进入可恢复 recycle + removed state + change audit，但不记成用户主动 rm。
- **类型迁移**：模型通过 `brain_mv` 的明确 destination `.md` file path 所在类型目录表达新 type；不接受 directory shorthand；机制在同一 transaction 中同步 frontmatter 与内部 L0 metadata。
- **ID**：使用 UUID，跨层 move 保留 id。
- **并发**：project/session 仅使用当前 MCP 进程内 mutation queue；只有共享 global 使用跨进程 exclusive lock，不引入多层文件锁排序。
- **一致性**：mutation 先完整计划/验证，再同步提交；单文件使用 atomic temp+rename，同进程可捕获异常在当前调用内 rollback；强制终止下允许未完成 mutation 丢失，不提供 durable transaction/crash-recovery 保证。
- **审批**：统一 `none|protect`，默认 none；protect 按全部 touched long-term layers 判断；confirmed 的真实性属于调用方信任边界。
- **questioned**：候选显式标记 + 正惩罚项，具体数值留标定。

### 24.1 design-rule 复审后的补充裁决

以下 D4/D5 已于 2026-08-20 确认；A10 在本轮 Frozen BDD re-review 中进一步修订为明确 file → file path：

- **D4 — `brain_write` 对齐 create/overwrite**：项目实际复用的 pi/coding-agent `write` 明确定义为 **creates/overwrites**。brain 因而不再人为收窄为 create-only；目标不存在时创建，已存在时整篇 overwrite。overwrite 先做完整 semantic validation，并保留该 path 已有内部 id 与 mechanism learning state，不把它重置成新记忆。
- **D5 — 移除 `brain_think.project_root?`**：真实部署是“每项目一个 MCP server，project root 启动时固定”。模型可见 schema 只保留 `session_id?`；debug/test 通过 server 启动参数、环境变量或测试构造环境设置 project root。
- **A10 re-review — `brain_mv` 明确 file → file**：src/dst 默认都必须是明确文件级 public path；不使用 memory type directory shorthand。destination `.md` file 的父类型目录仍可表达类型迁移；core ↔ archival / core ↔ core 都保持文件路径到文件路径。

---

## 25. 设计验收条件

本轮 Engineering Design re-review 的验收标准：

- Frozen BDD 的 43 REQ / 72 Scenario 均可映射到明确设计机制；
- Frozen Acceptance Specification 的 expected behavior 没有被本 Design 的内部实现反向修改；
- `brain_mv` 已收敛为明确 file → file public path，不再接受 type-directory shorthand；
- candidate 数量上限、questioned penalty、initial difficulty 等参数属于 Design / Calibration，不被误提升为 acceptance contract；
- `brain-dsh-plugin` 与宿主自动注入能力仍然在核心设计范围之外；
- write/edit/mv/rm 的正常 success 满足同步 read-your-writes；
- global 跨进程共享仍只有一个必要的 cross-process mutex，不增加 project/session 多层文件锁；
- v1 对可预期 commit failure 做同调用 rollback；强制终止下允许未完成 mutation 丢失，不引入 WAL/journal 或 crash-recovery contract；不可解析/明确 invariant 损坏仍 fail loud；
- Verification Method 已区分 Automated / AI Review / Fault / Invariant / Mechanism，不再把内部 unit tests 当作功能 coverage；
- `brain_think` description 的自然语言语义由 Hybrid verification 看护，不使用 exact-text brittle test；
- 参数标定与行为正确性继续分离。

本 Design Freeze 之后，下一阶段是按 `doc/brain/v1/acceptance-spec-brain.md` 实现/审查 verification。**在 acceptance automation 完成并再次审查之前，不读取 current production implementation 来调整测试期望。** 第一次运行 current production 后产生的 Red/Green 只是实现事实，不会反向修改 Frozen Specification。
