# brain v2 Detailed Design — Anchor / Restore Application

> **Layer:** Phase 5B Detailed Design child。
> **System owner:** B4 Anchor / Restore Application。
> **Parent:** `design-brain-system.md`。
> **Frozen inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。
> **Dependencies:** B1/E1 namespace/storage → `design-brain-namespace-storage.md`；C1/C2 codecs → `design-brain-cognition-state.md`；D1 → `design-brain-accessibility-state.md`；D2 → `design-brain-scarcity-selection.md`；E2 → `design-brain-operation-coordination.md`；E3 → `design-brain-git-history.md`。
> **Consumers:** A1 MCP Tool Adapter + A2 Hook-backed Restore Adapter；两者只改变 trigger/transport/injection，不复制本流程。
> **Supersedes:** `design-brain-runtime.md` §8 的 anchor orchestration / renderer / L0 capacity implementation truth。
> **Status:** **Design Frozen (2026-08-24, evidence-corrected re-freeze)**；canonical v2 Detailed Design baseline。

---

## 1. 本文职责

B4回答：

> 每个有效 turn-level cognition anchor 开始时，怎样把当前 applicable persistent cognition恢复成 bounded、query-independent、可继续维护的 starting work surface？

Canonical loop：

```text
normalized current binding
→ applicable scopes
→ if reliable fresh session: ensure a real empty session core (required)
→ read required cores + valid archival cognition without depending on auxiliary coordination
→ load auxiliary cycle/companion state or fresh baseline for projection
→ advance each scope cycle in memory once
→ derive D1 accessibility from those in-memory advanced cycles
→ D2 passive-L0 ranking
→ select/render bounded prior-context work surface
→ after context exists: for each applicable scope independently
     E2.tryApplyAuxiliaryUpdate(scope)
     → reload that scope's current cycle/companions inside coordination
     → record one real anchor cycle + shown-item exposures best-effort
→ best-effort E3 workspace checkpoint
→ return rendered context + technical diagnostics separately
```

`context` 的可用性只依赖真实 current cognition 能否正确恢复/呈现。Cycle/exposure/history 是辅助 learning/history：失败可以少记录本轮效果，但不反向吞掉已正确形成的 prior context。

B4不分析 latest user message/query，不做 relevance rerank，不修改 cognition content，不重定义 D1/D2公式，不建立 L0→L1→L2 state machine，不自动 promotion/demotion，也不让 hook 另做一套 restore semantics。

---

## 2. Concrete module boundary

```text
src/application/anchor-restore.ts      # B4 orchestration
src/application/anchor-renderer.ts     # B4 XML-like projection
src/persistence/cognition-state-store.ts
                                      # shared E1-backed hydration adapter
```

`cognition-state-store.ts` 可被 B2/B3/B4共享，但只做 E1 bytes/resources → C1/C2/D1 domain values，不拥有 anchor semantics。

---

## 3. Input / output

A层已经把 invocation facts归一化；B4不接 raw latest message。

```ts
export interface AnchorRequest {
  readonly currentSessionId?: SessionId
}

export interface AnchorResult {
  readonly context: string
  readonly diagnostics: readonly AnchorDiagnostic[]
}

export interface AnchorDiagnostic {
  readonly kind:
    | "archival-item-skipped"
    | "auxiliary-learning-degraded"
    | "history-checkpoint-degraded"
  readonly path?: LogicalArchivalPath
  readonly message: string
}
```

Current project由 runtime `StorageBinding` 固定；B4不接受 arbitrary project selector。

`context` 是 A1/A2 注入模型的 restored work surface。`diagnostics` 与 cognition context 分离：A1 可按 Public Contract 给 concise warning，A2 可记录 host log；physical path、Git stderr/SHA 等不进入 context。

---
## 4. Query-independent boundary

`runAnchor` signature中不得出现：

```text
userMessage
query
prompt
searchTerms
keywords
conversationText
```

Selection只消费 current binding、persistent cognition、C1 importance、C2 status、D1 state/projection、D2 passive ranking。

因此 otherwise-identical state + binding，在不同 latest user messages下产生同一 B4 candidate ordering/context。Latest input只在 B4返回后由主模型 reconcile；task-specific retrieval由 B2 tools完成。

---

## 5. Applicable scopes

```ts
function applicableScopes(request: AnchorRequest): readonly ScopeRef[]
```

无 session：

```text
[global, project]
```

有 reliable current session：

```text
[global, project, session(currentSessionId)]
```

这是 deterministic state/core order，不是 authority hierarchy。

每个 anchor都包含 global，但 **restore/read/render 本身不以取得 global auxiliary lease 为前提**。只有 context 已形成后的 global cycle/exposure read-modify-write 进入 E2 global coordination；取得失败只丢失该 scope 本轮 learning event。Project/session auxiliary update仍可各自继续尝试。

### 5.1 No current session

Session absent时：不创建 default/fake session，不读 historical sessions，不推进 session cycle，renderer省略 session root/rule/core/pattern。

### 5.2 Reliable session

`currentSessionId` 已是 B1 validated `SessionId`；B4不再 parse raw string。只有 current session unsolicited restore；其他 session仍可通过 explicit B2 path主动读取。

---

## 6. Scope materialization

### 6.1 Global / project

Global/project 由 runtime bootstrap shared transition 在 Tool serving 前 materialize。B4只消费这个已成立的 precondition；required global/project core 缺失、不可读或无法按 core contract 正确解释时：

```text
AnchorStateInvariantError(required-core-unavailable)
```

不在 B4补建，避免双 owner。

### 6.2 Fresh current session

Reliable session第一次 anchor可尚未 materialize。

B4在进入 main restore前调用共享 scope-initialization semantic flow，只要求先真实建立：

```text
@session/<sid>/core.md = empty Markdown
```

这是 model 即将获得并可用 `brain_edit` 维护的 resident workspace；创建失败 → anchor failure，不返回假的 session core。

Scope-cycle state不是 session existence truth。Main anchor 对 absent/unavailable session cycle直接使用：

```text
initialScopeCycleState() = {cycle:0}
→ in-memory advance → {cycle:1}
```

随后 best-effort持久化 final cycle1。失败只丢失本轮 learning coordinate；真实 empty core仍成立。Fresh session archival pool为空。

---

## 7. Anchor state port

```ts
export interface AnchorScopeSnapshot {
  readonly scope: ScopeRef
  readonly core: CoreDocument
  readonly cycle: ScopeCycleState
  readonly cycleWasFresh: boolean
}

export interface AnchorArchivalSnapshot {
  readonly path: LogicalArchivalPath
  readonly document: ArchivalDocument
  readonly epistemic: EpistemicState
  readonly accessibility: AccessibilityPersistenceState
}

export interface AnchorArchivalListing {
  readonly items: readonly AnchorArchivalSnapshot[]
  readonly diagnostics: readonly AnchorDiagnostic[]
}

export interface AnchorStatePort {
  loadScope(scope: ScopeRef): Promise<AnchorScopeSnapshot | undefined>
  listArchival(scope: ScopeRef): Promise<AnchorArchivalListing>
}
```

`loadScope`：

- real `core.md` 是 scope resident cognition truth；E1 resolution后 canonicalRef 必须仍是该 scope 的 `LogicalCorePath`。Core path broken/outside alias，或 alias resolved 成 archival/其他 object kind，都等价 required core unavailable → fatal；current reliable session core已在 §6.2确保真实存在；
- scope-cycle JSON 是 auxiliary learning state；missing/malformed/uninterpretable → `initialScopeCycleState()` + `cycleWasFresh=true`，不把 valid core变成不存在。

`listArchival`：

- 从 current memories tree枚举 active cognition，并经 E1 real-target resolution返回 **canonical archival paths**；direct path + aliases按 target dedupe；directory alias重复/环路只在本 operation 的 visited-real-directory set中收敛，不建 registry；
- same-scope valid alias可产生 `alias-followed`/public-safe diagnostic；broken/inaccessible/outside alias → skip affected entry + diagnostic，继续其他 cognition；
- resolved target canonical kind不是 archival → 不把 alias入口重新分类成 archival；按 broad invalid entry warning+skip；
- companion missing/malformed/hash-stale/cross-state-invalid → fresh C2/D1 state；
- **单条 archival Markdown malformed** → 不产生 candidate，返回 `archival-item-skipped(path)` diagnostic并继续其他 items；
- orphan companion不产生 item；
- broad anchor不建立 persistent index。

Exact read malformed item仍由 B2按 concrete-document error失败；这里的 skip只服务 broad passive restore failure locality。

---

## 8. L0 calibration baseline

```ts
export const L0_MAX_CANDIDATES = 10
export const L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES = 8192
```

这两个值都是 Calibration-sensitive DD，不是 BDD/Public Contract常量。

`10` 复用历史已收敛的 fixed candidate baseline；旧动态 `min(10, floor((budget-core-signals)/...))` 已因过度复杂被放弃。`8192` 复用 B2/Cat 已采用的 rendered UTF-8 safety baseline，作为 L0 presentation 的外层 bound；不再为了证明外层 bounded 而给 C1 summary 追加独立 hard length limit。

### 8.1 Two independent L0 bounds

L0 同时受：

```text
candidate count <= 10
rendered <memory_candidate_item .../> children UTF-8 bytes <= 8192
```

约束。8192 只计算 candidate item children，不计算 fixed wrapper/guidance/core；否则 core长度变化会反过来改变 candidate count，恢复旧动态公式。

B4 不增加整个 anchor 的第三个 aggregate byte/token envelope。Bounded structure来自：

- applicable core count ≤3；
- C1 each core ≤4000 code points；
- L0 item count ≤10；
- L0 item children serialized UTF-8 bytes ≤8192。

Renderer不得 silent truncate core/path/summary。若某个单独 candidate item的完整 serialization本身超过8192，它只是不适合进入 passive L0；B4 packing 跳过该 item、不给 exposure，并继续扫描下一条。其 cognition/path truth不变，仍可通过 B2 active discovery/exact read访问。

如果 representative Eval证明当前 envelope仍过大，优先 calibration现有 core/summary/L0值，不恢复 dynamic token formula。

---
## 9. Cycle-first semantics

Inside E2 derive：

```text
advancedScopeState[scope]
= advanceScopeCycle(currentScopeState[scope])
```

Fresh session由 cycle0同样 advance到1。

本轮 ranking必须使用 advanced cycles：

```text
old cycle → advance → D1 projectAccessibility → D2 rank
```

不能先按上一轮 R选 candidate再推进。B4不读取 wall clock；Git commit date不参与 aging。

---

## 10. Unified archival candidate pool

每个 archival snapshot构造：

```text
path             = B1 path
importance       = C1 document.importance
epistemicStatus  = C2 deriveEpistemicStatus(epistemic)
accessibility    = D1 projectAccessibility(advancedScopeState, persisted accessibility)
exposure         = persisted accessibility.exposure
value.summary    = C1 document.summary
```

所有 applicable：

```text
@global archival
+ current @project archival
+ current @session archival when bound
→ one pool
```

No scope quota、project-first/session bonus/global authority bonus。D1 对 global/project/session 使用同一 cycle-space retrievability formula；scope 只决定哪些 anchors 对该 cognition适用。

Pool包含所有 valid applicable archival cognition；low R/questioned/exposure不改变 truth。D2只决定 scarce passive attention order。

---
## 11. Passive-L0 selection / packing

```text
ranked = rankPassiveL0Candidates(allCandidates)
shown = D2-ordered representable subsequence until count/byte boundary
        bounded by 10 shown items + 8192 candidate-item UTF-8 bytes
```

Packing algorithm：

1. 按 D2 order扫描 `ranked`；
2. 若 `shown.length == L0_MAX_CANDIDATES` → stop；
3. 构造完整 `AnchorCandidateProjection`，用 final renderer同一 candidate-item renderer得到 item string；
4. `itemBytes = TextEncoder().encode(itemString).byteLength`；
5. 若 `itemBytes > L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES` → **omit this item from passive L0 only**，不 exposure，continue；
6. 若 `usedBytes + itemBytes > L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES` → stop；不跳过这个正常可表示 item去用更低 ranked 的短 item填缝；
7. 否则 append item，`usedBytes += itemBytes`；继续。

Properties：

- `shown.length <= 10`；
- `shownItemsUtf8Bytes <= 8192`；
- 全部前 ranked items fit 时按 D2 order显示最多10条；
- cumulative byte ceiling触发时不截断任一 path/summary；
- individually oversized item不会让 anchor失败，也不会改变其 discovery/read truth；
- no random sampling/revival；
- no think page-2 protocol；
- 未 surfaced cognition 仍可由 B2 discovery找到。

Questioned candidate仍可进入 shown，只是 D2 passive pressure降低 otherwise-equivalent proactive priority。

---
## 12. Projection model before string rendering

B4先建立结构化 projection，不在 state orchestration中拼字符串。

```ts
export interface AnchorCoreProjection {
  readonly scope: ScopeRef
  readonly path: LogicalCorePath
  readonly text: LogicalMarkdownText
}

export interface AnchorCandidateProjection {
  readonly path: LogicalArchivalPath
  readonly summary: string
  readonly status?: "questioned"
}

export interface AnchorProjection {
  readonly currentSessionId?: SessionId
  readonly cores: readonly AnchorCoreProjection[]
  readonly candidates: readonly AnchorCandidateProjection[]
}
```

Invariants：

- cores = global, project, current session if bound；
- candidates = D2 passive order top10；
- active candidate无 status；
- questioned只带 `status="questioned"`，不带 challenge；
- no importance/R/durability/exposure/internal id。

Full challenge仍由 exact `brain_cat`恢复。

---

## 13. Render before exposure transition

固定顺序：

```text
select shown
→ build AnchorProjection
→ renderAnchorContext
→ render success
→ applyPassiveExposure(shown)
```

Exposure表示 cue **实际进入本轮准备返回的 work surface**，不是“被 ranking考虑”。Renderer失败时 derive失败且 zero persistent mutation。

---

## 14. Renderer output contract

```ts
function renderAnchorContext(projection: AnchorProjection): string
```

Single owner：`anchor-renderer.ts`。

输出：

- JS string；line separator `\n`；
- deterministic indentation / element / attribute order；
- final newline = yes；
- no timestamps/random ids/Git data/latest user text。

Tests验证 semantic structure/invariants；wording理解由 Replay/Eval验证，不把 brittle full-string snapshot当模型理解证明。

---

## 15. XML transport escaping

Wrapper虽是 XML-like agent surface而非 DB，dynamic cognition仍不能破坏 structural framing。

### 15.1 Attribute escaping

```ts
function escapeXmlAttribute(value: string): string
```

固定：

```text
&  → &amp;
<  → &lt;
>  → &gt;
"  → &quot;
\t → &#9;
\n → &#10;
\r → &#13;
```

所有 dynamic path/session/summary 都走同一 encoder。

### 15.2 Core body is verbatim logical Markdown

Frozen Contract 明确：core body 是**原始 resident Markdown**。

因此 renderer：

```text
<core ...>
+ core.text exactly as C1 LogicalMarkdownText
+ </core>
```

不对 body做：

```text
XML entity escaping
CDATA wrapping
trim
summary
Markdown rewrite
Unicode normalization
```

Wrapper是 XML/HTML-like **model work surface**，不是交给 XML parser 的 serialization format；不能为了追求 strict well-formed XML而修改 remembered content。

如果未来真实 Replay/Eval / injection failure证明 raw Markdown中的 tag-like text会 materially 破坏模型边界，再从该 evidence修改 Public Contract/Design；当前不预建第二套 content framing protocol。

### 15.3 Attribute escaping remains required

Attribute值仍必须使用 §15.1，因为 path/summary 进入 quoted attribute；这只编码 attribute transport，不改变 C1 persistent truth。

---
## 16. Dynamic root-set rendering

### 16.1 Model-facing root order

With session：

```text
{@session/<sid>,@project,@global}
```

Without session：

```text
{@project,@global}
```

这是 namespace teaching order，不改变 state-processing order或 authority。

### 16.2 `brain_namespace`

Always render project/global rule；session bound才 render session rule：

```text
@session/<sid>/** → Applies within the current session.
@project/**       → Applies across sessions in the current project.
@global/**        → Applies across projects and future sessions.
```

Actual output永不保留 literal `<sid>`。

---

## 17. Wrapper fixed wording

Top-level fixed attributes：

```text
purpose="Restore prior working context as the starting point for this turn."
reconcile_with="The user's latest message and current evidence."
update_rule="Update prior context where they change it; carry forward what remains valid."
preserve_rule="Use remembered content with the same meaning, certainty, and commitment it had when formed."
```

这是 Replay/Eval-sensitive DD baseline：prior是 starting context，不是 fresh authority；latest evidence可覆盖；persistence不升级 proposal/hypothesis/commitment meaning。

---

## 18. Core rendering

`<core_memory>` purpose固定：

```text
Resident working cognition restored every applicable turn so ongoing work can continue without depending on archival retrieval.
```

Core order：global → project → session?。

### 18.1 Global core

```text
maintain_when="Cross-project working cognition changes and future work across projects should carry that change directly."
maintain_with="Use `brain_edit` on @global/core.md with the updated complete core document."
archive_when="Some cognition should remain remembered across projects but no longer needs to stay resident every turn."
archive_with="First use `brain_write` on @global/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md to preserve the archival cognition, then use `brain_edit` on @global/core.md to remove what no longer needs to remain resident."
```

### 18.2 Project core

```text
maintain_when="Project working cognition changes and future sessions in this project should carry that change directly."
maintain_with="Use `brain_edit` on @project/core.md with the updated complete core document."
archive_when="Some cognition should remain remembered in this project but no longer needs to stay resident every turn."
archive_with="First use `brain_write` on @project/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md to preserve the archival cognition, then use `brain_edit` on @project/core.md to remove what no longer needs to remain resident."
```

### 18.3 Session core

```text
maintain_when="The current session's active goal, progress, commitments, unresolved work, or other resident working cognition changes and later turns in this session need that change to continue correctly."
maintain_with="Use `brain_edit` on @session/<sid>/core.md with the updated complete core document."
archive_when="Some cognition from this session should remain recoverable later in the session but no longer needs to stay resident every turn."
archive_with="First use `brain_write` on @session/<sid>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md to preserve the archival cognition, then use `brain_edit` on @session/<sid>/core.md to remove what no longer needs to remain resident."
```

Runtime插入 actual sid。

### 18.4 Empty core

Empty applicable core仍 render concrete `<core ...></core>`，不因 body empty省略 owner/maintenance affordance。

### 18.5 Core→archival guidance

始终：

```text
brain_write archival first
→ success
→ brain_edit core prune
```

不建议 cross-kind `brain_mv`。

---

## 19. Archival-memory owner wording

Dynamic `<roots>`取 §16 root set：

```text
path_space="<roots>/memories/{decision,knowledge,intention,skill}/**/*.md"
purpose="Persistent cognition that does not need to stay resident every turn and can be recalled when useful."
remember_when="Preserve newly formed or materially updated cognition when forgetting it could materially change future reasoning or behavior, but it does not need to remain resident in core."
remember_with="Use `brain_write` at a concrete path whose applicability root and cognitive-role directory match the cognition being preserved."
```

Persistence guidance是 judgment opportunity，不是 mandatory write。

---

## 20. Cognitive role rules

Collection meaning：

```text
The directory after memories/ states how recalled cognition should participate in future reasoning or action.
```

Rules使用同一 dynamic roots：

```text
decision  → An established choice that future work should continue from while its basis remains valid.
knowledge → A fact, rule, constraint, or established understanding to reason with when its conditions apply.
intention → An active goal or commitment whose remaining work should continue until fulfilled, cancelled, or replaced.
skill     → A reusable method to apply when similar task conditions recur.
```

Scope与role正交，不写3×4默认映射。

---

## 21. Memory-candidates wording

Fixed collection attrs：

```text
purpose="Archival recall cues surfaced for this turn; being listed does not mean a memory is currently relevant or correct."
choose="Use the current task to decide which summaries may materially affect the current judgment."
inspect_when="A summary may materially affect the current judgment, or its exact reasoning, qualifications, evidence, or details matter."
inspect_with="Use `brain_cat` on that item's concrete path."
search_when="The prior cognition you need is not surfaced here."
search_with="Use `brain_glob` when you remember its path/name shape, or `brain_grep` when you remember content clues; narrow or generalize the memory path patterns above to select the appropriate search space."
questioned_status="An item marked `questioned` remains recallable, but its current cognition has unresolved epistemic uncertainty and should be re-evaluated before relying on it."
```

### 21.1 Candidate item

Active：

```xml
<memory_candidate_item path="..." summary="..." />
```

Questioned：

```xml
<memory_candidate_item path="..." summary="..." status="questioned" />
```

Attribute order path → summary → status?。No importance/role/scope/challenge/R/age/durability/exposure/id。

### 21.2 Empty list

仍 render collection + guidance，只是无 item。No unsolicited cue ≠ no archival memory。

---

## 22. Complete structural order

```text
brain_think_context
  brain_namespace
  core_memory
    global core
    project core
    session core?
  archival_memory
    cognitive_role_rules
    memory_candidates
      candidate items in D2 order
```

不恢复 memory_signals、promotion/demotion、scores、feedback lifecycle dump、Git state、host metadata。

---
## 23. Apply passive exposure

Renderer成功后，对 `shown` 每条：

```text
nextAccessibility
= applyPassiveExposure(
    advancedScopeState[item.scope],
    item.persistedAccessibility
  )
```

C2 challenge原样保留。Companion next state：same ageCycles/anchorCycle/durability/challenge，`exposure + 1`。

### 23.1 Only shown items mutate

Rank 11+ / not selected item无 companion write。No O(all memories) age write；aging仍由 D1 lazy projection表达。

### 23.2 Selection uses pre-increment exposure

本轮 ranking使用 persisted exposure；increment发生在 selection/render之后，不自我改变本轮排序。Next anchor才消费新的 exposure debt。

---

## 24. Anchor auxiliary update plan

Anchor 的 current cognition restore 与 auxiliary learning persistence 分开。

Context 已经用 read snapshot + in-memory advanced cycles完成 ranking/render。随后按 **scope-local anchor event** 记录 learning：

```text
for scope in applicable scopes:
  E2.tryApplyAuxiliaryUpdate([scope]):
    reload current/fresh scope cycle
    advanced = advanceScopeCycle(current)
    put auxiliary scope-cycle = advanced

    for shown item whose canonical scope == scope:
      reload current/fresh companion
      preserve current C2
      applyPassiveExposure(advanced, current D1)
      put companion best-effort
```

Ranking 时使用的 in-memory cycle snapshot 与最终持久化的 cycle 在并发 anchor 下不要求形成 snapshot transaction；public context不暴露 raw cycle/R。真正需要防止的是 auxiliary stale overwrite，所以 persisted transition必须在自己的 coordination boundary 内从 current state重新 derive。

这些都是 **auxiliary**：某个 scope拿不到 coordination或某一 write失败，不撤销 context；已经成功的其他 scope/file不 rollback。

Fresh current session 的 empty core 不在这份 auxiliary plan中；它已在 §6.2 作为 required semantic workspace state先建立。

---

## 25. `runAnchor(request)`

```ts
function runAnchor(request: AnchorRequest): Promise<AnchorResult>
```

Conceptual implementation：

```text
1. scopes = applicableScopes(request)
2. if reliable current session is fresh:
     ensure real empty session core through semantic scope initialization

3. primary restore/read phase (no auxiliary lease prerequisite):
     a. load every required core
     b. load/fresh each scope cycle for projection
     c. enumerate valid archival items; collect per-item skip diagnostics
     d. advancedProjectionCycle = D1.advanceScopeCycle(read cycle) for each scope
     e. project D1 R with advancedProjectionCycle
     f. D2 rankPassiveL0Candidates
     g. pack L0 using current count/byte bounds
     h. build + render AnchorProjection.context

4. context now exists. For each applicable scope independently:
     E2.tryApplyAuxiliaryUpdate([scope]):
       reload current/fresh scope cycle + shown-item companions
       advance current scope cycle once for this real anchor event
       apply exposure to shown items in this scope against that advanced cycle
       write auxiliary records best-effort
     degraded → add auxiliary diagnostic; continue next scope

5. E3.checkpointWorkspace() at most once
   failure/unavailable → history diagnostic only

6. return AnchorResult
```

E3 checkpoint不参与 context correctness，也不要求本轮 auxiliary records全部成功后才能尝试。Checkpoint捕获调用时真实 current workspace，允许 history落后或跨多个 completed operations聚合。

---

## 26. Failure ordering

### 26.1 Primary restore failure

以下会使 anchor失败、不返回 context：

- required global/project/current-session core 无法真实读取/解释；
- fresh reliable session 的 empty core无法建立；
- B1/D2 等使整个 projection本身无法安全解释的 invariant（例如 duplicate canonical cognition identity）；
- final renderer无法形成合法 work surface。

### 26.2 Per-item archival failure

Broad L0 enumeration中单条 archival Markdown malformed / unreadable：

```text
skip that item
+ logical-path diagnostic
+ continue restoring other cognition
```

不把一个坏 archival item升级成 whole-anchor failure。

### 26.3 Auxiliary learning failure

任一 scope 的 cycle/exposure coordination 或写入失败：

```text
context remains valid
→ affected learning event may be lost
→ diagnostic
```

已经成功的其他 scope / auxiliary records不 rollback；一个 global auxiliary lease failure也不阻止 project/session learning attempt。

### 26.4 Git history failure

`checkpointWorkspace()` unavailable/failed：

```text
context remains valid
current workspace remains truth
history checkpoint missing/delayed
→ diagnostic/log
```

不 retry、不 pending、不 recovery commit。

---

## 27. Model-visible mechanism isolation

Git outcome、cycle/R/exposure raw state、physical path、lock/rollback detail不进入 `<brain_think_context>`。

`AnchorResult.diagnostics` 只允许 public-safe logical information。A1/A2决定以 concise warning或 technical log 呈现；warning不能被模型误解为“prior cognition restore failed”当实际上 context 已成功形成。

---
## 29. Explicit think vs hook equivalence

A1：

```text
brain_think(session_id?)
→ A1 resolve InvocationFacts
→ B1 current binding
→ B4 runAnchor
→ expose AnchorResult.context
```

A2：

```text
host pre-reasoning/user-message event
→ A2 trusted InvocationFacts
→ B1 current binding
→ SAME B4 runAnchor
→ inject SAME AnchorResult.context
```

A2不 rerank latest message、不调用 fast-think、不自建 checkpoint retry/dedupe/renderer；它与 A1 共同消费同一个 B4 restore/learning flow。

One real host anchor event = one B4 invocation。

---

## 30. No automatic lifecycle suggestions

Every-turn guidance只提供 core maintenance、archival remember opportunity、role/path semantics、candidate inspect/search affordance。

不 generic emit：

```text
promote/demote this memory
move session→project/global
importance up/down
question/resolve/adopt reminder for each item
```

模型只有在 current evidence形成真实 semantic judgment时才调用 B3。

---

## 31. Error model

```ts
class AnchorStateInvariantError extends Error {
  code:
    | "required-core-unavailable"
    | "duplicate-archival-path"
}

class AnchorRenderError extends Error {
  code: "invalid-projection"
}
```

Malformed auxiliary cycle/companion不进入 fatal error enum；按 fresh/degraded处理。单条 malformed archival Markdown通过 `AnchorDiagnostic(archival-item-skipped)`表达。Model-visible diagnostic不泄漏 physical path/Git/raw score。

---

## 32. Determinism constraints

1. scope processing order global→project→session?；
2. model root set session?→project→global；
3. core order global→project→session?；
4. canonical candidate path unique；
5. D2 only ranking owner；
6. current calibration top10；
7. candidate item order = D2 order；
8. projection uses in-memory advanced cycles；
9. exposure transition after selection/render；
10. renderer constants/attribute order stable；
11. dynamic XML attribute escape deterministic；core body verbatim；
12. no Date/random/latest-message dependency；
13. one real anchor event derives one learning-cycle event per applicable scope；persist attempt is scope-local and may degrade；
14. one anchor = at most one E3 checkpoint opportunity；
15. Git outcome does not change context；
16. auxiliary persistence failure does not trigger a second restore/rerank in the same anchor。

---

## 33. Coding constraints

1. `runAnchor`不接 latest query/message；
2. global/project required core不由 B4随意补建；fresh reliable session core只走共享 initialization；
3. primary projection derives one in-memory advance per applicable scope；auxiliary persistence later reloads current state and records one anchor-cycle event per scope，不拿 projection snapshot覆盖 current state；
4. R only D1 `projectAccessibility`；
5. ranking only D2；B4不重算 score；
6. `L0_MAX_CANDIDATES=10` 与 candidate 8192-byte ceiling 各只有一个 owner；
7. no per-scope L0 quota / no whole-anchor dynamic token formula；
8. no silent core/summary clipping；
9. only shown items derive exposure+1；
10. malformed archival broad item warning+skip，不 whole-anchor fatal；
11. cycle/exposure writes are auxiliary best effort；
12. no importance/score/Git in context；
13. core Markdown verbatim render；
14. runtime actual SessionId, no literal `<sid>`；
15. B4不直接实现 filesystem/Git；
16. E3 checkpoint occurs outside E2 state lease；
17. no pending/recovery history state machine；
18. A1/A2不复制 renderer/ranking/transitions。

---
## 34. Required test matrix

### 34.1 Applicable scopes

- no session → global/project only；
- session bound → global/project/session；
- no default session；
- other sessions omitted；
- processing order deterministic。

### 34.2 Fresh session

- first anchor absent session → empty core + final cycle1 same plan；
- no intermediate cycle0 write；
- second anchor cycle1→2；
- fresh core rendered empty；
- arbitrary B2 read of absent session still does not init。

### 34.3 Cycle-first ranking

Construct candidate where advancing cycle changes R/order：advance before projection/rank；no O(all) item write；wall clock alone no effect。

### 34.4 Candidate pool

- merge global/project/session；
- no scope quota/bonus；
- pool0 → empty collection；
- pool3 → all3；
- pool10 → all10；
- pool11 → exactly top10；
- rank11+ remains B2-discoverable。
- one malformed archival item → warning+skip only that item；other valid candidates remain。
- same-scope aliases + direct target yield one canonical candidate/path；
- broken/outside alias warning+skip；directory alias cycle terminates；
- core alias to non-core target is required-core failure, not archival-as-core coercion。

### 34.5 Questioned

- true candidate retained；
- passive pressure applies；
- status attr present；
- challenge absent from L0；
- exact cat still exposes challenge。

### 34.6 Exposure / auxiliary failure

- selected candidates derive exposure+1 once；
- not-shown / individually oversized item no exposure event；
- auxiliary exposure write success affects next anchor；
- auxiliary exposure/cycle write failure leaves returned context valid and only loses affected learning event；
- global auxiliary coordination unavailable still returns context；project/session auxiliary attempts can continue；
- partial auxiliary success does not rollback valid cognition or other auxiliary state；
- persisted auxiliary transition reloads current state inside its scope coordination，不 stale overwrite；
- no Git dependency。

### 34.7 Renderer scope variants

With session：

```text
roots={@session/s1,@project,@global}
3 cores
session rules/patterns present
```

Without session：

```text
roots={@project,@global}
2 cores
no session placeholder/rule/core/pattern
```

### 34.8 Renderer escaping

- core `<tag>&value` appears verbatim in body；
- summary with quote/ampersand/angle/newline escapes safely；
- summary/path attribute encoding does not double-escape；
- core body LF / Markdown text preserved verbatim；
- empty body stable。

### 34.9 Projection minimality

Candidate item never contains importance/scope attr/role attr/challenge/R/S/age/exposure/Git SHA。

### 34.10 Checkpoint

- one anchor → at most one `checkpointWorkspace()` attempt；
- checkpoint happens outside E2 state lease；
- committed/no-change/unavailable/failed never changes returned context；
- Git failure leaves current workspace untouched；
- later anchor may naturally checkpoint accumulated changes；
- no per-operation staging prerequisite。

### 34.11 Explicit/hook equivalence

Same binding/state + same underlying read/auxiliary outcomes：A1 and A2 get byte-identical context and the same B4 learning intent；no latest-message rerank, no hook-only retry/dedupe/renderer。

### 34.12 Semantic Replay/Eval

Representative cases verify：prior context不是 fresh authority；current user可覆盖；proposal不被洗白成 decision；scope是 applicability不是 authority；candidate是 cue不是 relevance proof；questioned需重新判断；理解 core vs archival；candidate缺失用 glob/grep；gist重要时 cat；durable cognition有 write opportunity但不机械写。

---

## 35. Convergence / compatibility boundary

B4 canonical behavior只保留：

```text
query-independent prior-context restore
+ applicable real core residency
+ archival L0 pool
+ in-memory cycle-first D1/D2 selection
+ only-shown exposure learning
+ structured work surface
+ local failure isolation
+ scope-local best-effort auxiliary learning attempts
+ one best-effort history checkpoint opportunity
```

不恢复 pending checkpoint、hook-only retry/dedupe、latest-query rerank、all-auxiliary transaction 或 Git-gated context。

Current L0 calibration仍是 `10` + candidate-item rendered-byte ceiling；具体 wording继续可 Replay/Eval calibration。

---
## 36. Implementation-ready completion check

实现者不再需要自行决定：

- anchor是否接 current query（否）；
- applicable scopes/order；
- fresh session必须先有 real empty core；
- scope-cycle缺失是否等于 scope不存在（否，fresh auxiliary）；
- cycle advance是否用于本轮 ranking（是，in-memory advance first）；
- archival pool是否有 scope quota（无）；
- L0 count/byte bounds；
- questioned是否把 challenge放 L0（不放）；
- importance/score是否进 L0（不进）；
- malformed single archival是否拖垮 anchor（不拖垮）；
- exposure更新哪些 item（only shown）；
- cycle/exposure persistence failure是否取消 context（否）；
- Git checkpoint是否在 E2 lease内（否）；
- Git failure是否改变 cognition/context（否）；
- 是否需要 pending/recovery history lifecycle（否）；
- explicit think/hook是否拥有不同 restore flow（否）。

B1/E1 alias、E2 coordination、E3 checkpoint的 concrete implementation分别由其 canonical child拥有；B4只消费这些 contracts。
