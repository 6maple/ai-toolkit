# brain v3 Design Verification Index

> **Layer:** non-canonical Phase 5 verification/support document。
> **Status:** non-canonical verification index；**PASS / Design Frozen (2026-08-30, v3 anchor-semantics re-freeze)**。
> **Canonical truth:** `design-brain-system.md` + owner child Detailed Designs。
> **Boundary:** 本文不拥有 implementation truth，不承担 migration/legacy compatibility；只保留 owner map、Acceptance traceability、original-intent reverse audit、Replay/Eval 与 Freeze checklist。

---

## 1. Current canonical owner map

| Owner | Canonical Design | Owns |
|---|---|---|
| A1/A2 | [design-brain-integration.md](design-brain-integration.md) | project/session invocation facts；Tool dispatch/result/error；hook→same B4→actual context |
| B1/E1 | [design-brain-namespace-storage.md](design-brain-namespace-storage.md) | public logical namespace；physical projection/layout/containment |
| B2 | [design-brain-read-discovery.md](design-brain-read-discovery.md) | ls/glob/grep/cat truth、budget、paging、exact-read event |
| B3 | [design-brain-cognition-maintenance.md](design-brain-cognition-maintenance.md) | write/edit/mv/rm/feedback identity/transition semantics |
| B4 | [design-brain-anchor-restore.md](design-brain-anchor-restore.md) | anchor/restore、L0 projection/packing、renderer、exposure、checkpoint opportunity |
| C1/C2/E1 codecs | [design-brain-cognition-state.md](design-brain-cognition-state.md) | Markdown cognition schema、epistemic state、Markdown/JSON codec |
| D1 | [design-brain-accessibility-state.md](design-brain-accessibility-state.md) | cycle/accessibility state、learning/exposure、cross-scope rebase |
| D2 | [design-brain-scarcity-selection.md](design-brain-scarcity-selection.md) | archival scarcity comparator/ranking |
| E2 | [design-brain-operation-coordination.md](design-brain-operation-coordination.md) | semantic mutation coordination/required success boundary + auxiliary best-effort state updates |
| E3 | [design-brain-git-history.md](design-brain-git-history.md) | optional Git repo/history；anchor-time best-effort workspace checkpoint |

Parent composition owner：[design-brain-system.md](design-brain-system.md)。

### Verification discipline

- 本文只检查 Frozen What 是否都有唯一 How owner；
- child 间冲突由 canonical owner修，不在本文复制第二份 truth；
- compatibility 默认不是 Design input；只有明确 Requirement 才增加 migration/fallback/legacy adapter；
- implementation-ready 只冻结会影响 behavior/correctness/ownership 的选择；package/version/helper/string algorithm/retry tuning 等 semantic-neutral choice留 implementation；
- 历史 implementation 只作为 failure evidence，不反推当前设计。

---

## 2. Acceptance → Design traceability

| Acceptance | Primary Design owner | Closure |
|---|---|---|
| AC3-CONTRACT-001 | Integration + B1/B2/B3 | one public Tool definition source；primitive semantics归 application owner |
| AC3-ANCHOR-001 | B4 + Integration | explicit think返回 shared B4 actual context；generic host用 contract guidance |
| AC3-ANCHOR-002 | Integration | hook直接触发 same B4；真实替代 think 时隐藏 model-visible think |
| AC3-ANCHOR-003 | B4 | restored output表达 current persistent cognition snapshot；latest input、applicable cognition 与 evidence按 claim 合并/更新 |
| AC3-ANCHOR-004 | B4 + E2/E3 | required core failure fatal；single bad archival local skip；cycle/exposure/Git failure local degradation |
| AC3-SCOPE-001 | B1 + B4 | scope只表达 applicability；不推导 priority/authority |
| AC3-CORE-001 | C1 + B4 | 每 valid scope一个 bounded real core；applicable core resident |
| AC3-CORE-002 | B1/E1 + B4 | session 同时有 core + archival；fresh current session由 anchor materialize |
| AC3-CORE-003 | C1 + B3 | core mutation先完整 validation/capacity check；超限 zero mutation + curation guidance |
| AC3-DISCLOSURE-001 | B4 + B2 | L0 / active discovery / exact cat可自由跳转，无额外读取状态机 |
| AC3-DISCLOSURE-002 | B2 | ls/glob gist；grep content evidence；cat exact document |
| AC3-CAT-001 | B2 | frontmatter/body共用 logical document 1-based line coordinate |
| AC3-CAT-002 | B2 | stable line paging + executable continuation |
| AC3-CAT-003 | B2 | oversized logical line never clipped-as-consumed；lossless host-file escape hatch |
| AC3-MEMORY-001 | C1 + B2/B4 | summary是 document current gist single truth；presentation bounds属于 caller |
| AC3-MEMORY-002 | B1 + B3 + B4 | B1 path单一编码 role；B3只在模型已完成 semantic reclassification 后 move；B4明确恢复后各 role 怎样参与 reasoning/action |
| AC3-MEMORY-003 | C1 + D2 | importance是 omission-cost enum；只保护 scarce discoverability，不造 match |
| AC3-MEMORY-004 | C1/B3 + B4 | cognition保存必要 epistemic meaning；rendering不洗白 authority |
| AC3-WRITE-001 | B3 + C1/C2/D1 | create=fresh cognition；overwrite=fresh replacement state |
| AC3-EDIT-001 | B3 + C1/D1 | same cognition evolves；whole-content edit仍保持 continuity |
| AC3-MV-001 | B3 + D1 | same archival cognition relocates；cross-scope rebase；destination replacement |
| AC3-EDIT-002 | B3 + E2 | edit mode/object-kind/exact-text validation failure zero mutation |
| AC3-RM-001 | B3 | archival Markdown exit makes cognition inactive；companion cleanup/history are not success prerequisites |
| AC3-FEEDBACK-001 | B3 + D1 | read/discovery ≠ adopt；explicit adopt才形成 validated-use learning |
| AC3-FEEDBACK-002 | B3 + C2 | edit修 cognition；question/resolve只维护 current epistemic challenge |
| AC3-FEEDBACK-003 | B3 | causal attribution/model judgment；无 automatic negative feedback |
| AC3-FEEDBACK-004 | B3 + C2 | question requires challenge；resolve requires current challenge |
| AC3-QUESTIONED-001 | C2 + D2 + B2/B4 | challenge current；passive trust降低但 true discovery/exact read不隐藏 |
| AC3-LEARNING-001 | D1 + D2/B2 | forgetting改变 scarce discoverability，不改变 membership/match truth |
| AC3-TIME-001 | D1 | event-time per-scope cognition cycle；无 wall-clock decay |
| AC3-RETRIEVAL-001 | D1 + B2 | archival substantive cat触发 exact retrieval；list/search/passive display不 refresh |
| AC3-REINFORCEMENT-001 | D1 + B3 | adopt增强 durability；普通 read不增强 |
| AC3-EXPOSURE-001 | D1 + B4 | only actually rendered L0 cues gain passive exposure debt |
| AC3-DISCOVERABILITY-001 | D2 | R + importance floor独立保护，stable deterministic tiebreak |
| AC3-PATH-001 | B1/E1 | one logical public namespace projected to one canonical physical tree |
| AC3-PATH-002 | B1 | only cognition object kinds/directories public；hidden mechanism state不可寻址 |
| AC3-PATH-003 | B1/E1 | cognition tools share one logical grammar + physical containment boundary |
| AC3-PATH-004 | B1/E1 + B2/B3/B4 | exact operations canonicalize before kind/identity decisions；broad aliases dedupe canonical targets；broken/outside failure localized |
| AC3-ABSOLUTE-001 | B1/E1 + Integration | separate permissive workspace-location grammar maps cognition/assets to contained absolute filesystem paths without widening cognition tools |
| AC3-LS-001 | B2 + D2 | direct-child truth first；strength只在 scarce archival presentation排序 |
| AC3-LS-002 | B2 | fixed bounded whole records + refine；no page-2 protocol |
| AC3-GLOB-001 | B2 + D2 | public path-pattern truth first；accessibility不能抹掉 true match |
| AC3-GLOB-002 | B2 | fixed bounded result + refine；no continuation |
| AC3-GREP-001 | B2 | literal/regex truth只来自 applicable memories trees 的 active archival content；core resident、不进入 discovery corpus；summary不伪造 evidence |
| AC3-GREP-002 | B2 | Pi-style bounded grep + explicit refine affordance；无 public pagination state；display不产生 learning transition |
| AC3-GREP-003 | B2 | invalid regex is input error；literal mode remains explicit alternative |
| AC3-HISTORY-001 | E3 + current workspace | cognition success independent of Git；existing commits optional recovery；no parallel history |
| AC3-HISTORY-002 | B4 + E3 | each anchor gives at most one best-effort current-workspace checkpoint opportunity |
| AC3-CONSISTENCY-000 | C1/C2/D1 + E1/B2/B3/B4 | Markdown/core truth；D1/scope-cycle fresh fallback；C2 challenge remains semantic when promised |
| AC3-CONSISTENCY-001 | E2 + B2/B3/B4 | required public state has strong success boundary；incidental learning/history may degrade |
| AC3-CONCURRENCY-001 | E2 | process serial + global semantic coordination give sequentially explainable successes |
| AC3-CONCURRENCY-002 | E2 | only actually shared global current state pays cross-process semantic coordination |
| AC3-FAILURE-001 | E2 | prevalidation zero side effect；catchable failure restore before-state or fail loud |
| AC3-RESTART-001 | E1/E2 | successful current working state survives restart even if never checkpointed |
| AC3-RESTART-002 | E1/E2 + E3 optional | hard kill before success non-goal；working files truth；no WAL/Git-cleanliness gate |
| AC3-LIFECYCLE-001 | D1 + B3 | learning不自动 promotion/demotion/reclassification/status change |
| AC3-LIFECYCLE-002 | B4 | no generic lifecycle candidate subsystem；core/L0只提供语义 affordance |
| AC3-PRESENTATION-001 | B4 | stable owner guidance + dynamic path/summary/status；no internal scores/IDs |
| AC3-PERSISTENCE-001 | B4 + Integration | persistence judgment stays model-owned；no mandatory write hook |

**Result：59 / 59 current Acceptance cases have an explicit canonical Design owner.**

---

## 3. Original Intent Reverse Audit

brain 的目标不是“更强的 memory database”，而是补偿模型不会随长期使用自然更新自身 cognition：

```text
persistent cognition may leave transcript/context
→ pay a bounded restore cost before substantive reasoning
→ restore resident core + bounded archival cues
→ use familiar active discovery/exact read only when more detail is needed
→ reason with latest user input + applicable restored cognition + relevant evidence
→ model judges what changed cognition deserves persistence
→ persist current cognition
→ next turn continues from that state
```

关键非对称：

```text
read-before-think
→ host/mechanism can trigger when supported

write-before-forget
→ semantic judgment stays with the main model
```

### Reverse closure

| Original failure / trade-off | Required guarantee | Canonical closure |
|---|---|---|
| persistent cognition missing before a new turn | restore before substantive reasoning | B4 + Integration |
| persistence/restore is mistaken for a global age or authority rank | evaluate each claim by meaning/certainty/commitment/scope/state-time and relevant evidence；update only affected cognition | B4 + C1/B3 |
| resident context grows without bound | bounded core + bounded passive L0 presentation | C1 + B4 |
| L0 cue is insufficient | familiar ls/glob/grep/cat retrieval | B2 |
| exact transport cannot carry one huge line | never lose/pretend-consume content；use ordinary filesystem escape hatch | B2 + B1/E1 |
| filesystem workspace uses aliases | follow safe same-scope real target without duplicate cognition identity；canonicalize exact mutation/read targets；localize broken alias failure | B1/E1 + B2/B3/B4 |
| useful cognition monopolizes or becomes hard to rediscover | event-time accessibility + truth/scarcity separation | D1 + D2 + B2/B4 |
| correction and unresolved doubt get conflated | edit cognition；challenge only while unresolved | B3 + C2 |
| usage mechanically promotes scope/residency | scope/residency remain semantic/model-owned | B1 + B3 + D1/B4 |
| durable cognition gets no chance to persist | model-visible persistence judgment opportunity every cognition cycle | B4 + Integration |
| mechanism decides what must be remembered | meaning/scope/importance/persistence stay model-owned | C1/B3/B4 |
| history workflow pollutes model work | current cognition independent of Git；anchor best-effort workspace checkpoint；no approval/parallel history | E3 |
| concurrent global updates silently lose success | only shared global state gets cross-process semantic coordination | E2 |
| unified Git turns all project/session operations into global business locking | Git technical sharing separated from semantic coordination | E2 + E3 |
| hard-kill durability invites WAL/recovery machinery | unfinished hard-kill is non-goal；working files truth + auxiliary fallback；Git only optional history | E1/E2/E3 |
| hook-capable host still relies on model to call think | A2 invokes same B4 and injects actual context | Integration |
| unknown session silently mixes unrelated sessions | no fake/default session | Integration + B1 |

### Conclusion

After convergence, this loop has no identified top-level capability gap. Remaining risk classes are deliberately narrower:

1. **Model semantic behavior** — whether presentation/tool affordances cause the intended cognition behavior；verify with Representative Replay/Eval.
2. **Calibration** — whether current core/L0/discovery/D1/D2 constants are useful；change only from Eval/production evidence.
3. **Implementation translation** — whether code satisfies the frozen owner contracts；verify with unit/invariant/integration tests.

Legacy compatibility is **not** a remaining design risk unless an explicit compatibility requirement is added.

---

## 4. Representative Agent Replay / Eval rubric

Replay verifies cognition behavior, not exact wording snapshots or a fixed number of Tool calls.

### R1 — Current instruction updates a conflicting persisted decision
Restored cognition contains an older decision; the current user explicitly changes that decision. The model must follow the current instruction, update the affected cognition, and carry forward other applicable cognition. The reason is the explicit change to the same claim, not a blanket rule that restored cognition is lower-priority background.

### R2 — Persisted hypothesis remains hypothesis
A proposal/hypothesis remains at the same epistemic commitment after repeated restore/read; persistence alone must not turn it into a confirmed fact or user decision.

### R3 — Candidate summary is used directly or inspected when needed
Given an applicable path + summary, the model preserves the path-encoded cognitive role and uses a sufficient summary directly. When the summary is insufficient or exact reasoning/qualifications/evidence/details are needed, it cats the concrete item；when needed cognition is not surfaced, it uses glob/grep. Relevance alone does not mechanically require a cat call.

### R4 — Unknown target is rediscovered with familiar primitives
With only path/name/content clues, model can reformulate glob/grep queries and broaden/narrow search. It should not require semantic-search machinery before lexical/path retrieval has shown a real failure.

### R5 — Durable decision gets a persistence judgment opportunity
A decision that will affect future work should naturally cause the model to maintain/create an appropriate owner; the mechanism does not dictate which cognition to save.

### R6 — Transient turn does not trigger ritual write
A one-off calculation/tool result with no durable cognition change may end with no memory mutation.

### R7 — Question/resolve stays distinct from document edit
Unresolved doubt uses question/challenge；known correction edits the cognition and resolves；new evidence validating unchanged cognition may resolve without fake edit/history.

### R8 — Importance and continuity scope are not relevance/authority
Critical/global cognition is not automatically more relevant or correct. Importance protects scarce discoverability；continuity scope only states the contexts across which cognition is intended to carry forward.

### R9 — Questioned cognition lowers proactive trust without disappearing
Questioned archival cognition may lose passive priority but remains a true ls/glob/grep/cat result and exposes current questioned state where required.

### R10 — Host injection role is understood correctly
Hook-injected `<brain_think_context>` is interpreted as the current persistent cognition snapshot supplied as user-requested working context. It is not itself a new user message or an analysis already produced from that message；persistence does not make the whole block older/lower-priority background or turn every contained claim into a newly observed fact. Applicable cognition participates according to its preserved meaning/role, with described-state time evaluated per claim.

### R11 — Context stays bounded but useful
With three scope cores and a large archive, core remains resident, L0 remains bounded, and deeper detail is retrieved only when useful; model-visible context is not dominated by duplicate metadata/guidance.

### R12 — Mutation affordance remains model-native
Create/edit/move/remove/reclassify/correct tasks map naturally to write/edit/mv/rm/feedback semantics. Core↔archival change uses semantic read/write/edit, not private promotion verbs.

### R13 — Long-session transcript takeover
After simulated transcript compaction/context rot, session core restores current goal/progress and session archival can recover earlier relevant detail without asking the user to repeat it or leaking session-only cognition into project/global.

### R14 — Raw evidence becomes memory only after durable cognition forms
Large logs/tool output are not copied ritualistically. If they produce a durable conclusion, the model preserves a concise self-contained cognition rather than the raw transient evidence.

### R15 — Existing owner / scope / residency selection remains semantic
When a turn updates an existing cognition plus introduces session/project/resident facts, the model maintains the canonical owner, selects continuity scope semantically, and does not follow a fixed promotion ladder.

### R16 — Current implementation evidence does not erase a distinct decision or intention
Restored project candidates contain an established workflow decision and an active unfinished intention；the current workspace independently establishes implementation/document status. When asked for current progress, the model combines both claim sets: it reports implementation status from current evidence while preserving the agreed workflow and remaining intended work. It must not reconstruct the task from disk alone, infer cancellation from absence, or claim implementation from the decision/intention. A sufficient candidate summary does not require `brain_cat`.

### G1 — Product-goal effectiveness / context-cost trade-off

This is **not another Acceptance case and does not add a mechanism requirement**. It validates the original product trade-off itself.

Run representative long-running tasks with comparable prior decisions/constraints under at least two conditions:

```text
A: brain enabled with normal read-before-think / discovery behavior
B: control without brain restored cognition (e.g. transcript-only / available host context only)
```

Compare evidence such as:

- whether previously established durable constraints/decisions are correctly carried into later reasoning after context compaction/attention loss；
- contradictions or avoidable mistakes caused by missing or materially outdated cognition；
- how often the user must repeat, restate, or correct information that should already be durable；
- whether session archival can recover earlier detail when the live transcript no longer carries it；
- added model-visible context / retrieval cost caused by brain；
- overall task quality/continuity on the representative workflow。

Current Design does **not** invent a universal numeric pass threshold. The purpose is to verify that the observed continuity/quality benefit is commensurate with the added context cost. If the trade-off is poor, diagnose wording/ownership/calibration first; do not infer a new subsystem automatically.
### Eval interpretation rule

When a Replay fails, diagnose in this order:

```text
original cognition/business goal
→ semantic ownership
→ model-visible prompt/context wording
→ Tool description/affordance
→ projection/state ownership
→ only then consider a new mechanism
```

Parameter tuning only addresses calibration failure；it must not hide an ownership/cognition-loop failure.

---

## 5. Design Freeze checklist

Final convergence audit 只回答以下问题；**全部通过后停止继续设计**：

1. **Current coverage** — 59/59 Acceptance cases 都有 canonical How owner；
2. **Original-loop closure** — restore → reasoning → active retrieval → cognition update → persistence judgment → durable state → next restore 无一级能力断点；
3. **Ownership uniqueness** — System/child docs 没有相互复制或反转 semantic owner；
4. **Composition closure** — anchor、read/discovery、mutation、scope initialization、failure/restart/concurrency 都能由现有 owners 组合解释；
5. **Public contract integrity** — Design 没有私自增加/删除 model-visible tool/path/state semantics；
6. **Minimal mechanism** — 无 WAL/recovery manager、semantic/RAG、promotion ladder、approval、parallel history、read snapshot lock 等未经 Frozen What/evidence要求的机制；
7. **Compatibility opt-in** — legacy data/layout/API/wiring 没有作为默认 runtime constraint回流；
8. **Implementation boundary** — package/version、host metadata key、retry timing、internal string algorithm等 semantic-neutral选择没有被伪装成 canonical Design；
9. **Calibration ownership** — 仍保留的 core/L0/discovery/D1/D2 concrete baselines都有单一 owner，并明确 evidence-driven Design-first调整；
10. **Verification surface** — deterministic behavior有 unit/invariant/integration seam；model semantic behavior有 R1–R16 Replay/Eval，且初始产品取舍有 G1 goal-level effectiveness/context-cost 对照 Eval；
11. **Document hygiene** — no stale canonical links/section refs、UTF-8 valid、`git diff --check` clean；
12. **Remaining work classification** — 剩余事项只能是 implementation translation、tests、Replay/Eval 或 future evidence-driven calibration，而不是未裁决 Design gap。

若任一项失败，只修对应真实断链；**不把“还能想到什么 edge case”当成继续扩设计的理由**。

Freeze status：**PASS / FROZEN for v3 (2026-08-30, anchor-semantics re-freeze)** — current canonical Design closes all 59 Acceptance cases without an identified unresolved Design gap。

### Freeze baseline

Design Freeze applies to the following current v3 truth set:

- Frozen BDD Requirements；
- Frozen Public Tool Contract；
- Frozen Acceptance Specification；
- canonical System Design；
- all canonical owner child Detailed Designs listed in §1。

`R1–R16` Representative Replay/Eval and `G1` goal-level effectiveness/context-cost comparison are **verification support**, not additional product requirements. They may produce evidence for later calibration or a deliberate Design reopen, but do not silently mutate the frozen baseline.

After Freeze, implementation must translate the frozen Design. If implementation discovers a materially different architecture/state/algorithm interpretation or an observable behavior change is required, reopen the owning Design (and Requirements/Acceptance first when observable What changes) before changing production semantics.

### 5.1 Inherited v2 2026-08-24 Evidence-correction Design Re-freeze

**Decision：** canonical System Design + all owner child Detailed Designs re-frozen against the 2026-08-24 upstream behavior baseline。

**Verified structure：**

```text
BDD Requirements:       62 / 62 unique
BDD Scenarios:          140 / 140 unique
Acceptance cases:       59 / 59 unique
Scenario → Acceptance:  140 / 140 referenced
Acceptance → Design:    59 / 59 mapped
Stale Design AC rows:   0
Missing relative links: 0
```

**Evidence-corrected ownership decisions included in this Freeze：**

- restore/read/render is primary；anchor cycle/exposure and Git history cannot become restore prerequisites；
- B3 success strength follows each operation's explicit identity/epistemic/learning promise：overwrite fresh-learning、edit/mv continuity、feedback resulting state are required when promised；cat/anchor incidental learning may degrade；
- Git is optional history only；no per-operation staging or runtime-serving gate；
- D1 uses one cycle-space model + `durability`；no scope decay weight/effectiveAge；D2 uses one `max(R, importanceFloor)` protection value with no secondary bonus；
- `brain_cat` never treats a clipped oversized line as exact consumed content；ordinary filesystem access is the lossless escape hatch；
- public filesystem aliases follow only safe same-scope real targets；E1 canonicalRef owns path/role/object-kind，B2/B3/B4 consume canonical refs，broad traversal dedupes repeated/cyclic real directories without a persistent alias registry；
- invalid grep regex remains a query/input error, not zero matches。

**Remaining work after Freeze：** implementation translation、TDD/Acceptance/Fault tests、host E2E、Representative Replay/Eval、and future evidence-driven calibration only。Any observable behavior change reopens upstream What first；any materially different implementation architecture reopens the owning Design before code semantics change。

### 5.2 2026-08-30 v3 Anchor-semantics Design Re-freeze

**Decision：** v3 re-froze the System/B4/Integration interpretation of restored cognition while inheriting all unaffected owner designs by value inside this version directory。

**Reopened Design boundary：**

- restored output is current persistent cognition working context, not optional background and not a blanket “older/lower-priority” source；
- latest user input、applicable restored cognition 与 relevant evidence jointly form current understanding；
- each claim retains its meaning、certainty、commitment、scope、cognitive role and described-state time until evidence materially updates that claim；
- evidence about implementation state does not erase a distinct decision/intention, and decision/intention does not prove implementation；
- candidate summaries may be used directly when sufficient；exact read/search remains need-driven；
- shared guidance stays on stable collection owners while each concrete core keeps its complete scope/path-specific update/archive mapping；
- Codex mechanical hook restore injects the shared B4 context directly and hides model-visible `brain_think` to prevent a second restore path。

**Unchanged Design boundary：** B1/B2/B3/C1/C2/D1/D2/E1/E2/E3 semantics remain those fully defined by the corresponding v3 owner documents；their original v2 evidence dates do not make v2 a runtime truth dependency。

**Remaining validation：** deterministic tests prove structure/owner/invariant translation；host E2E and R1–R16/G1 provide model/goal evidence。A failed Replay/Eval is evidence to reopen the appropriate v3 owner or create a later version, not permission to silently reinterpret this Freeze。
