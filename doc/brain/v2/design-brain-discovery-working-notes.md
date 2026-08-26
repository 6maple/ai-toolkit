# brain Discovery / Memory Accessibility v2 — Premature Design Notes

> **状态：Phase 5 Engineering Design Input Notes / 非规格真相 / 待重新裁决。**
> **重建日期：2026-08-22。**  
> 本文保存 BDD 讨论中提前出现的 How 候选，避免丢失推理，但不能反向约束 BDD。Phase 5 Engineering Design 开始时必须重新依据已冻结 BDD、Public Tool Contract、Acceptance Specification 与 Test Design Review 裁决；本文只保存候选 How，不得直接升级为 Design truth。

---

## 1. 文档责任

- public behavior 以 `bdd-brain-behavior-requirements.md` 为准。
- 本文只保存“可能怎样实现”的设计候选、风险与待比较方案。
- 任何与后续 BDD 冲突的内容自动降级为历史探索，不具有规范权威。
- 数值、阈值、排序公式、page size、内部 state schema 都不得因为写在本文里就被视为已确认。

---

## 2. 已确认并可作为 Design 输入的 BDD 事实

当前 v2 BDD 已确认的关键输入：

- scope = future applicability：global / project / session。
- residency 与 scope 正交：每 scope 一个 bounded logical `core.md`，archival on-demand。
- public roots：`@global/`、`@project/`、`@session/<sid>/`。
- archival path：`<scope-root>/memories/<type>/<relative-item-path>.md`，relative path 可嵌套。
- type 由 public path 单一拥有，不再重复 frontmatter `type`。
- L0/L1/L2：passive gist / active discovery gist+evidence / exact read。
- ls/glob/grep 都有 mechanism-owned fixed output budget；只有 grep 需要 continuation。
- discovery 不改变 retrieval truth；exact path read 不受 memory strength 阻断。
- L2 exact retrieval 可刷新近期 retrievability；validated successful use 可带来更持久 reinforcement。
- exposure 只解决 L0 passive monopoly，不惩罚主动 ls/glob/grep。
- questioned affects proactive trust, not retrieval truth。
- 每个 cognition cycle 保留 persistence judgment opportunity：主模型决定是否维护 core/archival/existing owner；不固定 write step，不自动持久化 raw ToolResult。
- write-before-forget guidance 优先放在 turn-level model context 的最小稳定 semantic owner，并用 Agent replay/eval 验真实行为；end-of-turn reviewer/hook 仅在简单 guidance 经真实任务证明不足后再考虑。
- importance = 适用时遗漏 cognition 的预期代价。
- memory mutation 不再要求 `none/protect/confirmed/pending-approval` 流程。
- Git 是 memory version history / recoverability 的唯一历史 owner；不保留 `history.jsonl`、`change_history.jsonl`、`memories/history/` recycle 等平行历史机制。具体 repo 边界、commit 粒度与 commit message 形式尚未冻结；commit message 应利用已有 operation/path 等信息保持可读，但不增加模型输入负担。

---

## 3. Integration mode 候选

### 3.0 read-before-think

行为目标已经在 BDD 冻结；可能的工程实现分两类：

```text
generic MCP host
→ expose brain_think
→ tool description strongly guides immediate call after every user message
→ best-effort, not protocol guarantee

supported host/plugin
→ register pre-reasoning hook
→ restore/inject cognition automatically
→ MCP may omit brain_think
→ avoid double-trigger
```

Design 时需要明确：

- host capability detection；
- hook 与 MCP server 的责任边界；
- 一次 user turn 如何拥有唯一 cognition-cycle identity；
- context injection 的 source/status presentation。

### 3.1 Public tool shape 候选

当前较自然的候选：

```text
brain_ls(path?)

brain_glob(pattern, path?)

brain_grep(
  pattern,
  path?,
  glob?,
  ignoreCase?,
  literal?,
  context?,
  continuation?
)

brain_cat(path, offset?, limit?)
```

注意：

- `limit` 不应重新成为 ls/glob/grep 的 model-controlled page-size；
- grep 的 continuation 参数名称未冻结，不必一定叫 `offset`；
- cat/read 的 offset/limit 有熟悉的 stable document coordinate 先验，与 grep result continuation 是不同问题；
- write/edit/mv/rm 的最终 public schema 等待完整 BDD 后统一审。

### 3.2 Truncation / continuation 候选

- `brain_ls`：固定内部 budget；超额返回 bounded children + 明确“仍有更多” + refine path guidance；无 page 2。
- `brain_glob`：固定内部 budget；超额返回 bounded matches + refine path/pattern guidance；无 page 2。
- `brain_grep`：固定内部 page budget；超额显式 continuation affordance，也允许 refine query/path/glob。
- exact total 只在廉价/已知时提供；不能为了显示总数扫描巨大 corpus 或伪造 total。
- page size、字节/行/entry 预算属于 Calibration。

### 3.3 Grep continuation 的稳定性

BDD 只要求 stable continuation。Design 候选可以是：

```text
integer offset
cursor
opaque continuation token
deterministic resume key
```

不要为了 pagination 先制造复杂 snapshot state。优先检查是否可以通过：

```text
pure discovery
+
deterministic ordering
+
continuation does not mutate ordering state
```

满足稳定性。

只有 Eval/故障证明普通 continuation 不足时，才考虑 snapshot/cursor session state。

---

## 4. Matching 与 memory-aware scarcity

### 4.1 三阶段模型

当前最有解释力的设计分层：

```text
1. Match
   familiar ls/glob/grep semantics determine true candidates

2. Context-budget selection / ordering
   only when candidates compete for scarce output/context,
   memory accessibility/value may affect which are easier to see

3. Presentation
   preserve familiar tool evidence/shape where possible
   never pretend omitted true matches do not exist
```

关键原则：

> 记忆强度不参与 retrieval truth，只参与 retrieval scarcity。

因此：

- grep 只有 7 个真实 matches → 应全部返回，不能因为 R 低删掉；
- grep 有 1800 个 matches → bounded scarcity 中可以讨论 ordering；
- exact `brain_cat(path)` → strength 不得 block exact read；
- ls/glob 的结构/path membership 与 strength 无关，超预算时如何选前部结果再进入 Design。

### 4.2 Cue specificity

设计直觉：

```text
per-turn anchor
→ no query, huge universe
→ state/importance matters most

brain_ls
→ location cue

brain_glob
→ path-pattern cue

brain_grep
→ content + scope cue

brain_cat
→ exact target
→ no competition
```

因此高 specificity 自然降低 memory-state 排序的必要性，不需要额外设计“随机复活”机制。

---

## 5. Memory accessibility state：待设计而非 BDD schema

### 5.1 语义角色

可能存在的机制概念：

```text
retrievability (R)
→ current accessibility / short-term ease of recall

stability-like factor (S)
→ controls how slowly R decays after validated reinforcement

importance
→ semantic omission cost, model-owned judgment

exposure
→ passive L0 anti-monopoly state

successful-use evidence
→ validated use history

questioned
→ current epistemic uncertainty
```

不要因为旧实现有 `difficulty / stability / retrievability / usage.ok / usage.fail` 就默认全部保留。

### 5.2 FSRS 的角色

用户已明确原始意图：

> FSRS 只是权重系数、衰减/强化曲线的经验参考，不是直接采用 FSRS。

Phase 5 可以研究 FSRS 中有经验依据的关系，但不要求：

- 复刻完整 D/S/R state machine；
- 复刻 human spaced-repetition review model；
- 引入 `again / hard / good / easy` 作为 agent memory public semantics；
- 原样采用任何 FSRS 公式；
- 为了“理论完整”要求模型填写 difficulty。

Design 的问题应该是：

> 哪些 FSRS 曲线/参数经验能帮助 brain 自己的 BDD 行为更稳定？

而不是：

> 怎样把 brain 变成一个 FSRS flashcard scheduler？

### 5.3 `S` 与 `R`

当前最小假设：

```text
validated successful use
→ may increase durability / stability-like factor

stability-like factor
→ affects future decay of retrievability

retrievability
→ affects scarce-context discoverability
```

如果 `S` 已经通过 R 的衰减速度表达作用，就不要无证据再把 S 作为独立 ranking weight double-count。

### 5.4 `R` 与 `importance`

BDD 只要求两者都提供独立、单调保护，不冻结组合公式。

候选曾包括：

```text
R only
R * importance
lexicographic / floors
max(R, importance)
```

其中曾 parked 一个简洁候选：

```text
baseDiscoverability = max(retrievability, importance)
```

它的直觉是 high-importance memory 不因长期未取回而完全沉没，同时 recent retrieval 也能提高普通 memory 的可见性。

但这只是 Phase 5 比较候选，不是结论。需要用 Eval 检查：

- 是否让 high importance 永久垄断；
- 是否使 R 的价值过弱；
- 是否需要 normalization；
- 与 query/path specificity 怎样组合；
- 是否造成 discontinuity 或难标定。

### 5.5 `brain_think` 与 search 不应共用同一裸 score

可以先按事件类型拆开：

```text
base accessibility/value
→ common candidate signal

brain_think passive L0
→ apply exposure anti-monopoly
→ apply questioned proactive-trust reduction

active ls/glob/grep
→ do not apply L0 exposure penalty
→ questioned remains searchable and visibly marked

exact cat
→ no candidate competition
```

这比“所有工具共用一个统一 score”更贴合 BDD。

### 5.6 exposure

当前设计语义：

> exposure 表示 cognition 被系统主动放入 L0 attention、但尚未发生进一步 retrieval/engagement 的重复展示压力。

可能流程：

```text
brain_think L0 shown
→ exposure increases

later exact retrieval / meaningful engagement
→ maybe reset or reduce exposure

active discovery only
→ does not change exposure
```

具体 increment/reset/decay 必须在 Design/Calibration 重新推导，不能照抄旧常量。

---

## 6. Mutation identity 与 learning continuity

BDD 已经把 identity 从 path 分离：

```text
edit
→ same cognition evolves
→ preserve appropriate learning continuity

mv
→ same cognition changes public address/scope/type
→ preserve continuity

write create
→ new cognition

write overwrite
→ replacement cognition at same address
→ fresh learning identity

rm
→ cognition exits active memory
```

Design 可能需要 persistent internal identity，但该 ID 不应成为第二 model-visible locator。

特别要防止：

```text
old meaning at same path has strong learning state
→ full overwrite with unrelated meaning
→ old strength contaminates replacement cognition
```

操作语义本身应表达 identity continuity，机制不需要 NLP 猜“两个文本是不是同一 cognition”。

---

## 7. Git-backed recoverability：新方向

### 7.1 已确认方向

旧 approval 的目标是 mutation 前阻塞长期写入。用户已明确不希望每次 memory update 要用户确认，因此：

```text
approval before mutation
→ remove

normal semantic mutation
→ execute directly

history / recoverability
→ Git only
```

Git-backed history 是已确认的唯一 version history / recoverability / change-rationale owner。v2 不再设计与 Git 平行的 custom mutation/deletion/audit history。

### 7.2 尚未确认的物理设计

以下只是待比较候选：

```text
global physical memory store
→ one Git repository ?

project physical memory store
→ one Git repository covering sessions subtree ?

each session its own nested repository ?
→ likely problematic because embedded repo / gitlink semantics
```

不要在 BDD 或 Design Freeze 前把“每 scope 一个 repo”或“每 session 一个 repo”当事实。

### 7.3 Semantic success boundary 已确认；内部 Git wiring 仍开放

BDD 已确认：semantic memory mutation 不能先 success、再等后续 turn 批量补 Git history。success 返回时，本次 mutation 的 Git-backed history / recovery basis / rationale 已经成立。因此 `batch semantic changes by turn after tool success` 不再是合法候选。

仍留给 Design 的是：一个 semantic mutation 内部涉及的多个文件如何形成一个 coherent Git history event、失败时 Git 与 working state 如何协调，以及 mechanism-only state 是否进入 Git：

```text
L0 exposure
retrieval refresh
reinforcement counters
ticks
```

semantic cognition mutation 的 success/history boundary 已由 BDD 决定；think/read 等 mechanism-only learning state 是否进入 Git 仍需单独从 durable value 与 noise 成本判断，不能因为 semantic history 使用 Git 就自动全部 commit。

### 7.4 custom history/recycle 已退出 v2

用户已明确裁决：历史记录与恢复只通过 Git 管理。因此以下 production 旧机制不进入 v2 Design：

```text
history.jsonl
change_history.jsonl
memories/history/
rm recycle
专用 tombstone / deletion-history store
```

Git 负责过去持久状态的 version history / diff / restore，并承载语义修改原因；brain 的正常 memory namespace 只表达当前 cognition。修改原因如何进入 Git history（例如由哪个调用层提供、commit message 如何组织）留给正式 Design，不通过 JSONL 再建一套 reason/audit store。runtime correctness 所需的 state/index/lock/temp/rollback 等机制应按其自身职责重新裁决，不能借“audit/history”名义恢复第二套历史系统。

---

### 7.5 Consistency / concurrency / failure / restart 的 BDD 已重新裁决

当前 v2 BDD 已冻结以下 What：

- success 是同步可观察边界；没有 success 后后台延迟 commit；
- semantic mutation success 同时要求 Git history / recovery basis / rationale 已成立；
- concurrency 以“等价于某个合法 sequential order”为 guarantee，不要求自动 merge；
- 实际跨进程共享只要求 global，project/session 按一项目一个 MCP process 的支持拓扑处理；
- 正常可处理 failure 不留下成功半状态；无法确认安全状态时 fail loud；
- 普通 restart 保持已成功 cognition continuity；强制终止发生在 success 前时允许本次 mutation 丢失；restart 正常暴露的 semantic state 必须回到某个已完成 Git-backed state，否则 fail loud；不引入 WAL/journal/roll-forward requirement。

`MutationPlan`、queue、global lock、atomic rename、rollback implementation、Git command sequence 都仍是 Design，而不是上述 BDD 本身。

---

### 7.6 Promotion / demotion signals 已退出 v2

BDD 已确认：scope / residency / epistemic lifecycle 由 cognition meaning 与 current cognitive need 决定；usage frequency 与 retrievability decay 不提供足够语义证据去自动推导 scope widening、importance 降低、questioned、rm 或 core/archival residency 变化。

因此 v2 不再保留独立 `promotion-candidate` / `demotion-candidate` / generic lifecycle signal subsystem。validated successful use、retrievability、exposure、questioned 等状态继续直接承担各自已经定义的 discoverability / attention / epistemic 职责，不再被二次包装成 lifecycle 建议。

这意味着正式 Design 不应因为旧 production 仍有 promotion threshold / demotion threshold / signals output 就把它们继续实现；只有未来出现新的、独立且可验证的 failure mode，才重新打开 signal 机制。

---

### 7.7 Restored-context / presentation BDD 已完成

v2 BDD 已确认：

- hook / explicit `brain_think` 都恢复同一种 prior cognition；物理注入顺序较新不代表 brain 已理解 latest user event；
- current understanding = restored prior + latest user input + current evidence 的局部更新；未受影响 cognition 继续保留；
- persistence / core residency / auto injection 不提升 remembered content 原有的 meaning / certainty / commitment；assistant recommendation 不因被记住变 user decision；
- presentation 必须让 restored context、core、archival recall cue、status、applicability 与合法 next action 足够清楚；candidate 不能伪装成 runtime 已证明的 current-query relevance；
- exact XML/tag/attribute naming、nesting、English wording、inline-code tool marker 属于后续 Design / Public Contract，而不是 BDD。

至此 BDD Phase 1 的高影响 domain 已全部重新裁决。下一阶段按 `doc/design-rule.md` §13.8 进入 Specification by Example / Test Design Review；仍不能直接把本文 parked How 提升为正式 Design。

---

## 8. Phase 5 进入条件与设计审查问题

只有 BDD / Specification by Example / Test Design Review / Acceptance Freeze 完成后，本文内容才可被重新裁决为正式 Engineering Design。

届时至少重新回答：

1. bounded budget 的单位与默认值；
2. ls/glob 超额时的确定性 ordering；
3. grep flatten/order/continuation contract；
4. R 的定义、更新与 decay；
5. validated reinforcement 是否需要 stability-like factor；
6. importance 的 model-visible representation；
7. `max(R, importance)` 等候选的 Eval 结果；
8. exposure reset/reduction；
9. questioned presentation；
10. internal persistent identity；
11. Git repo boundary / semantic-mutation history event / rationale wiring / mechanism-state tracking；
12. 在已确认 topology 与 success/failure guarantee 下，queue/lock/rollback/Git working-state 如何用最小机制实现。

在这些问题有独立 failure mode / acceptance requirement 前，不提前增加新的状态、工具或协议。
### 7.8 Git commit message 不增加模型负担

Git-backed history 的产品职责是版本追溯与恢复，不要求模型为每次 mutation 额外提供 rationale / reason / commit message。

Design 时应让 commit message 尽量根据已有确定信息生成得可读，例如 operation kind、public path、move source/destination 等；若无法机械知道语义原因，也不为了“为什么改”新增模型输入字段。commit message quality 是内部可维护性要求，不是新的 cognition contract。
