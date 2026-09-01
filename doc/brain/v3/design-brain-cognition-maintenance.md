# brain v3 Detailed Design — Cognition Maintenance Application

> **Layer:** Phase 5B Detailed Design child。
> **System owner:** B3 Cognition Maintenance Application。
> **Parent:** `design-brain-system.md`。
> **Frozen inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。
> **Dependencies:** B1/E1 logical/physical paths → `design-brain-namespace-storage.md`；C1/C2/E1 codecs → `design-brain-cognition-state.md`；D1 transitions → `design-brain-accessibility-state.md`；E2 semantic/auxiliary coordination → `design-brain-operation-coordination.md`。
> **Supersedes:** `design-brain-runtime.md` §5.3 identity lifecycle、§12.5–§12.8 的 mutation/feedback implementation truth。
> **Status:** **Design Frozen for v3 (2026-08-30)**；owner semantics inherit the unchanged v2 evidence-corrected baseline；canonical v3 Detailed Design truth is this file。

---

## 1. 本文职责

B3 是五个 cognition-maintenance public use cases 的唯一 application semantic owner：

```text
brain_write
brain_edit
brain_mv
brain_rm
brain_feedback
```

它把 public maintenance intent翻译为：

```text
public logical object + current C1/C2/D1 state
→ semantic precondition
→ identity/lifecycle transition
→ complete after-state
→ E2 PreparedSemanticOperation
→ semantic result
```

B3 不拥有：

- public namespace grammar / physical path（B1/E1）；
- Markdown schema / summary / importance meaning（C1）；
- challenge representation（C2）；
- accessibility formula/transitions（D1）；
- filesystem coordination / semantic success boundary（E1/E2）；Git/history 不属于 B3 success path；
- model对“是否应该修改 cognition”的判断。

---

## 2. Identity table is executable design

B3 不根据文本相似度、summary、path相近程度猜 identity。

| Operation | Identity meaning | C1 | C2 | D1 |
|---|---|---|---|---|
| write create | new cognition | new document | fresh active | fresh |
| write overwrite | replacement cognition at same address | replacement document | fresh active | fresh |
| edit archival | same cognition evolves | resulting document | preserve | direct engagement if document actually changes |
| edit core | same resident document evolves | resulting core | N/A | N/A |
| mv | same archival cognition changes address/scope/role | preserve | preserve | same-scope direct engagement / cross-scope rebase |
| rm | cognition exits active memory | remove | remove | remove |
| feedback adopt | same cognition validated-use evidence | preserve | preserve | validated use |
| feedback question | same cognition current unresolved challenge | preserve | set/replace challenge | direct engagement |
| feedback resolve | same cognition challenge resolved | preserve | clear challenge | direct engagement |

禁止：

```text
semantic similarity identity matching
edit => replacement fresh learning
write overwrite => preserve old learning
mv => fresh state
question/resolve => status bit
rm => tombstone/recycle copy
```

---

## 3. Concrete module baseline

```text
src/application/cognition-maintenance.ts   # B3 five use cases / result mapping
src/application/exact-edits.ts             # B3 pure exact-text edit engine
src/persistence/cognition-state-store.ts   # E1-backed hydrated read adapter; no semantic transitions
```

`cognition-state-store.ts` 是 composition adapter，不成为新 semantic owner：

```text
E1 resource read
→ E1 codec decode
→ C1/C2/D1 domain values
→ B3
```

它不得调用 write/edit/mv/feedback transition。

---

## 4. Hydrated maintenance state port

B3 的所有 read-modify-write state必须在 E2 `derive()` callback内重新读取。

```ts
export interface MaterializedScopeSnapshot {
  readonly scope: ScopeRef
  readonly cycle: ScopeCycleState
  readonly core: CoreDocument
}

export interface ArchivalSnapshot {
  readonly path: LogicalArchivalPath
  readonly document: ArchivalDocument
  readonly epistemic: EpistemicState
  readonly accessibility: AccessibilityPersistenceState
}

export interface MaintenanceStatePort {
  loadScope(scope: ScopeRef): Promise<MaterializedScopeSnapshot | undefined>
  loadArchival(path: LogicalArchivalPath): Promise<ArchivalSnapshot | undefined>
}

export interface ResolvedMaintenanceTarget {
  readonly requested: LogicalBrainPath
  readonly path: LogicalBrainPath      // E1 canonicalRef
  readonly aliasFollowed: boolean
}

export interface MaintenancePathPort {
  resolveExisting(path: LogicalBrainPath): Promise<ResolvedMaintenanceTarget>
  resolveCreateTarget(path: LogicalBrainPath): Promise<ResolvedMaintenanceTarget>
}
```

`MaintenancePathPort` 是 E1 `resolveExistingResource/resolveCreateTarget` 的 application-safe projection：只返回 canonical logical ref + alias fact，不返回 absolute/realpath。**所有 current-state-dependent identity/object-kind判断使用 resolved `path`。**

### 4.1 `loadScope`

Scope resident truth只由真实 `core.md` 决定；scope cycle 是 auxiliary learning coordinate。

```text
core valid + scope-cycle valid
→ snapshot(core, persisted cycle)

core valid + scope-cycle missing/malformed/uninterpretable
→ snapshot(core, initialScopeCycleState())
→ mark cycleWasFresh for optional diagnostic/persistence

core absent
→ undefined (scope resident workspace尚未 materialize)

core present but malformed/unreadable
→ PersistentStateInvariantError
```

`memories/` 下已有 Markdown/assets不把 scope cycle提升成存在真相，也不阻止 create-intent initialization 先补真实 empty core。

### 4.2 `loadArchival`

```text
Markdown absent
→ undefined（companion-only residue does not create cognition）

Markdown valid + companion current/valid/hash-matched
→ snapshot with persisted C2/D1

Markdown valid + companion missing/malformed/hash-stale/cross-state-invalid
→ snapshot with fresh C2/D1
```

Markdown 是 cognition truth；companion unavailable不否定 cognition，普通 load不主动 repair。

### 4.3 Scope must be loaded before item

B3 current-state flow：

```text
loadScope(item.scope)
→ materialized: loadArchival(item)
→ unmaterialized: item path没有 active cognition address until a create-intent operation materializes required core
```

如果 physical memories workspace已有内容而 core缺失，create-intent可以保留这些普通 workspace resources并建立 core；B3不把 auxiliary scope-state pair完整性当作 cognition truth。

---

## 5. Scope equality / path equality

B3 structural comparisons使用 B1 value semantics，不比较 physical path。

### 5.1 Scope equality

```ts
function sameScopeRef(a: ScopeRef, b: ScopeRef): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "session" && b.kind === "session") {
    return a.sessionId === b.sessionId
  }
  return true
}
```

这只是 B1 value equality 的 concrete encoding；不查询 filesystem。

### 5.2 Canonical logical path equality

Requested paths只证明输入 grammar，不足以判断 alias 后的 semantic identity。

```text
requested public path
→ MaintenancePathPort / E1 resolution
→ canonical public path
→ sameLogicalPath(a,b)
   := formatPublicPath(a) === formatPublicPath(b)
```

因此 `brain_mv(aliasOfX, X)` 在 resolution 后是 same source/destination。B3 仍不比较 absolute/realpath；physical resolution由 E1拥有。

---

## 6. Scope initialization helper consumed by write/mv

只有具有真实 create intent 的 B3 operation会 materialize absent session target scope：

```text
brain_write target session scope absent
brain_mv destination session scope absent
```

Edit/rm/feedback/source-read不初始化不存在的 scope。

### 6.1 `prepareTargetScope`

```ts
interface TargetScopePreparation {
  readonly scopeState: ScopeCycleState
  readonly requiredInitMutations: readonly ResourceMutation[]
  readonly wasInitialized: boolean
}
```

Algorithm：

```text
loadScope(targetScope)

present
→ scopeState = current/fresh-loaded cycle
→ requiredInitMutations = []

absent + targetScope.kind == session
→ scopeState = initialScopeCycleState() = {cycle:0}
→ requiredInitMutations = [put empty core.md]

absent + targetScope.kind in {global, project}
→ MaintenanceStateInvariantError(required-runtime-core-uninitialized)
```

Empty core是可维护 session workspace的必要 semantic state；scope-cycle persistence不是。若新 session operation之后希望保存 initial cycle，可走 E2 auxiliary update；失败不回滚已经正确成立的 core + cognition mutation。

---

## 7. Success boundary follows the operation's identity / learning promise

不能按“字段在 companion 里”或“字段属于 D1”机械决定 failure strength。判断顺序是：

```text
本次 public operation 承诺什么 identity / epistemic / learning outcome？
→ 哪些 resulting domain values 必须在 success 后继续成立？
→ 这些是 required semantic state

只是由 read/anchor 顺带形成的 learning event？
→ 才是 auxiliary best-effort state
```

### 7.1 C2 challenge is semantic current state

C2 unresolved challenge直接改变模型能否依赖 cognition，因此：

- explicit `feedback(question/resolve)` 的 resulting challenge state是 required；
- questioned edit 必须 preserve challenge；
- questioned mv 必须把 challenge随 cognition带到 target；
- write overwrite replacement必须确保旧 challenge不再附着。

### 7.2 D1 can be required when the operation promises learning identity

Frozen Acceptance 已明确：

```text
write overwrite
→ replacement cognition does not inherit old retrievability/reinforcement/usage history

edit
→ same cognition preserves appropriate learning continuity

mv
→ same cognition carries appropriate learning continuity to new address/scope

feedback adopt
→ this operation itself records validated-use learning
```

因此这些 D1 outcomes 属于对应 B3 operation 的 **required resulting semantics**。如果 success 后因为 companion persistence失败而立刻 fresh-reset/继承错误 D1，就违反 operation identity contract。

`question/resolve` 的 D1 direct-engagement 是当前 B3/D1 Detailed Design transition；当它与 challenge transition一起形成 resulting companion时，同一个 semantic operation完整持久化 resulting state。

真正允许局部丢失的 D1 event 主要属于 B3 之外：

- `brain_cat` exact-read refresh；
- anchor scope-cycle / passive exposure；
- scope-cycle bootstrap hint。

这些由 B2/B4/E2 auxiliary contract处理，不能反推 B3 identity continuity也可随意丢失。

### 7.3 Required domain state does not always mean a physical companion must exist

Fresh fallback本身可以是某些 domain state 的合法 physical representation。例如 new cognition 的 fresh active C2/D1：

```text
no companion
→ hydrate fresh active C2 + fresh D1
```

所以 B3 的 required guarantee 应写成 **success 后重新 hydrate 时必须得到正确 resulting C2/D1**，而不是“每次都必须写 JSON”。

Examples：

| Operation | Required resulting hydration semantics | Physical consequence |
|---|---|---|
| write create | fresh active C2 + fresh D1 | companion 可省略；但 orphan/stale state不能附着到新 cognition |
| write overwrite | fresh active C2 + fresh D1；不继承 A learning | 若旧 companion 在 resulting Markdown 下仍可能 valid，必须 delete/replace；不能仅因 text same 而保留旧 D1 |
| archival edit | preserve same-cognition C2 + D1 continuity，并应用 current direct-engagement transition | 若 omission 会 fresh-reset continuity，则 rebound companion是 required |
| mv | target hydrate 为 source resulting C2 + rebased/preserved D1；不得继承 destination B | target companion/delete/replace strategy必须保证该 domain result；source orphan cleanup可 best-effort |
| rm | cognition因 Markdown退出 active tree | companion cleanup可 best-effort；orphan不产生 cognition |
| feedback adopt/question/resolve | resulting explicit feedback C2/D1 | state changed时 full companion write属于 required semantic mutation |

这保持了两件事同时成立：

1. companion 仍不是 cognition existence truth；missing/malformed external auxiliary state可以 fresh fallback；
2. **一个已经返回 success 的 identity/feedback operation 不能借 fresh fallback逃掉自己承诺的 learning continuity/reset。**

---

## 8. Semantic no-change and physical no-change

E2支持：

```text
PreparedSemanticOperation.kind = no-change | change
```

B3 必须区分两个概念。

### 8.1 Semantic no-change

Operation没有形成 durable current-state change，例如：

- `brain_edit(edits=[])`；
- edit resulting normalized document == current document；
- repeated identical question 且 D1 direct-engagement后 accessibility也完全相同。

这种情况：

```text
kind=no-change
no write
no persistence side effect
```

不能因为 Tool 被调用就人为 touch文件/更新时间戳。

### 8.2 Semantic transition but encoded final state equal

`brain_write` existing target永远表达 replacement cognition intent，并构造 fresh C2/D1。

极端情况下：

```text
replacement Markdown == current Markdown
AND current C2 already active
AND current D1 already equals target-scope fresh baseline
```

则 durable representation没有任何差异。

B3仍返回：

```text
action = overwrote
```

但 E2 plan可为 `no-change`，因为 v2没有 hidden cognition UUID / audit counter用来伪造“replacement happened”第二 truth。

Public operation semantics来自调用本身；未来 cognition behavior只由 current canonical state决定。

### 8.3 Mutation minimization

对于 `change` plan，只包含 domain value实际发生变化的 files：

```text
required document changed → put Markdown
required resulting C2/D1 cannot be represented correctly by fallback alone → put/delete companion as needed
scope initialized → required put core
scope-cycle bootstrap hint → auxiliary, not semantic plan
```

不为了“保持配对”机械重写 companion；但如果 edit/mv/overwrite/feedback 的 required C2/D1 outcome在不改 companion时无法成立，就必须把对应 put/delete放进 E2 `runSemanticOperation`。只有真正 incidental 的 anchor/read learning走 auxiliary path。

---

## 9. Shared document mutation pipeline

任何 B3 resulting document必须：

```text
construct resulting JavaScript string
→ E1 normalizeMarkdownInput
→ C1 parseArchivalDocument OR validateCoreDocument
→ E1 encodeMarkdown
```

禁止：

- patch parsed `summary` separately；
- preserve stale parsed metadata after body edit；
- auto-fix frontmatter；
- normalize Unicode；
- truncate over-capacity core。

C1只做 structural validation；summary是否语义准确仍由主模型负责。

---

## 10. `brain_write`

Public contract：

```text
brain_write(path, content)
```

只接受 concrete `LogicalArchivalPath`。

### 10.1 Pre-E2 validation

```text
parsePublicPath(requestedPath)
→ require requested kind=archival
→ normalizeMarkdownInput(content)
→ parseArchivalDocument(result)
```

错误在首次 E2 side effect之前返回。

Directory/core/pattern target → `MaintenanceTargetError(write-requires-archival)`。

### 10.2 E2 request

```text
scopes = [path.scope]
name = brain-write
```

Inside derive：

1. `prepareTargetScope(requestedPath.scope)`；
2. `resolved = MaintenancePathPort.resolveCreateTarget(requestedPath)`；require `resolved.path` canonical kind=archival；
3. load current target cognition using resolved canonical archival path when it exists；
4. construct fresh C2：`activeEpistemicState()`；
5. construct fresh D1：`createFreshAccessibilityState(targetScopeState)`；
6. derive a physical plan such that post-success hydration at **resolved canonical path** is fresh active C2/D1；delete/replace any companion that would otherwise keep old challenge or learning；a separate fresh JSON is optional only when absence already represents the same fresh state；
7. compare resulting domain state with current；
8. return plan + semantic result using resolved canonical path。

### 10.3 Create

Target absent：

```text
new cognition
C1 = supplied validated document
C2 = active
D1 = fresh at target scope current cycle
```

Required semantic mutations：

```text
[empty session core init if needed]
+ put archival Markdown
+ remove/replace any existing companion state that could attach old challenge to this new cognition
```

Fresh D1 不要求为了“有记录”额外写 companion；absence本身即可代表 fresh。但 **确保 old/orphan companion 不会在 resulting content 下继续 valid** 属于 create/overwrite required semantics。

Result：

```ts
{
  readonly action: "created"
  readonly path: LogicalArchivalPath
}
```

### 10.4 Overwrite

Target present：

```text
replacement cognition at same public address
```

Old state does **not** carry：

```text
challenge
age/retrievability coordinate
durability reinforcement
exposure debt
```

New C2/D1 exactly same fresh constructor as create。

Result：

```ts
{
  readonly action: "overwrote"
  readonly path: LogicalArchivalPath
}
```

No hidden continuity heuristic。

### 10.5 Existing auxiliary companion mismatch

Markdown present 而 companion missing/malformed/stale 时，existing cognition 仍由 Markdown 成立，读取按 fresh state 继续。`brain_write` overwrite 仍按 replacement semantics 产生 fresh state；不会把旧 companion 当 continuity evidence。Companion-only residue 不构成 existing cognition。

---

## 11. Exact-edit semantics

```ts
export interface ExactEdit {
  readonly oldText: string
  readonly newText: string
}
```

`edits` mode保持 familiar exact-text replacement，不定义公开 character offset protocol。

### 11.1 `applyExactEdits(current, edits)`

Input 是 C1 normalized logical text。

Rules：

- `edits` 必须包含一条或多条 replacement；空数组 → `MaintenanceInputError(empty-edits)`；
- `oldText` 必须 non-empty，按原值 exact match，不 trim/模糊匹配；
- 所有 edits 必须先针对**同一个 original document**验证，不能让前一个 `newText` 改变后一个 `oldText` 的 match identity；
- 每条 replacement 必须能定位一个无歧义 exact region；missing / ambiguous → whole operation fail；
- 多条 replacement 的 original regions不能 overlap；overlap → whole operation fail；
- 所有 validation通过后才在内存形成一个 resulting document；任一 edit失败都没有 partial mutation；
- result 最后统一 `normalizeMarkdownInput` + full C1 validation，再进入 E2。

`newText` 可为空并可包含 Markdown/newline。

具体 internal string offset单位、range representation、排序/slicing实现属于 implementation，只要满足“original-document validation + atomic deterministic result”即可；internal offset不进入 cat/grep/public persisted coordinates。

---
## 12. `brain_edit`

Public contract：

```text
brain_edit(path, edits? | content?)
```

Requested target可以：

```text
core
archival
```

必须 target existing；edit不创建 cognition/scope。进入 current-state derive 后先 `resolveExisting(requestedPath)`；**canonical target kind** 仍可为 core 或 archival，并决定走 §12.2/§12.3。Success/result path使用 canonical target。

### 12.1 Mode validation

Exactly one mode：

```text
edits provided XOR content provided
```

Both/neither → `MaintenanceInputError(edit-mode)`。

`edits` mode 至少包含一条 replacement；`edits=[]` 在进入 E2/persistent plan 前失败为 `MaintenanceInputError(empty-edits)`。

### 12.2 Core edit

E2 scopes：

```text
[path.scope]
```

Inside derive：

1. `loadScope(path.scope)`；absent → not found；
2. current = scope.core.text；
3. derive string using exact edits OR content；
4. normalize + `validateCoreDocument`；
5. if resulting text == current text → `no-change`；
6. else put core Markdown only。

Result：

```ts
{
  readonly action: "edited"
  readonly path: LogicalCorePath
  readonly changed: boolean
}
```

`changed=false` 只用于 adapter决定是否写“no changes”; 不触发 D1。

### 12.3 Archival edit

Inside E2 derive：

1. load materialized scope；absent → not found；
2. load archival snapshot；absent → not found；
3. derive resulting full text；
4. normalize + `parseArchivalDocument`；
5. compare resulting C1 text with current C1 text。

If unchanged：

```text
no C1 change
no C2 change
no D1 event
→ no-change
```

这一规则防止 `edits=[]` / same-content edit成为 hidden feedback/exposure reset。

If changed：

```text
C1 = resulting document
C2 = preserve current epistemic state exactly
D1 = applyDirectEngagement(scopeState, currentAccessibility)
```

Required identity state：

- document belongs to required semantic mutation；
- current C2 questioned → resulting companion must preserve challenge；
- **whether active or questioned, edit must preserve appropriate D1 continuity and apply the frozen direct-engagement transition**；if omission/stale hash would make the next hydration fresh-reset that continuity, companion rebind is required。

因此 edit success 不允许出现“Markdown 已改成功，但 learning identity 因本次 persistence failure立即丢失”的状态。

Edit不：

```text
reset age
increase durability
clear challenge
set challenge
fresh-reset learning
```

如果当前 item questioned，edit后仍 questioned，除非模型另调用 `feedback(resolve)`。

### 12.4 Content mode is still edit identity

Whole `content=` replacement **不等于 `brain_write` overwrite**。

即使 100% 文本被重写：

```text
brain_edit(content=...)
→ same cognition evolves
→ C2/D1 continuity preserved as above
```

Identity由 operation verb决定，不由 diff size决定。

---

## 13. `brain_mv`

Public contract：

```text
brain_mv(src, dst)
```

只接受：

```text
concrete archival → concrete archival
```

### 13.1 Pre-E2 validation

1. parse requested src/dst；
2. require both requested paths use archival grammar；
3. do **not** decide same-path yet；alias resolution belongs inside coordinated derive。

After E1 canonical resolution, same canonical path：

```text
MaintenanceInputError(same-source-destination)
```

Contract本身定义 mv 为 move to **another** concrete archival path；same path不是 relocation，不触发 direct engagement。

Core source/destination → public guidance：

```text
read source semantics
→ brain_write archival when extracting resident cognition
→ brain_edit core when incorporating/pruning resident cognition
```

### 13.2 E2 request

```text
scopes = unique [src.scope, dst.scope]
```

Canonical B1 scope order只用于 deterministic request representation；E2真正关心是否包含 global。

Inside derive：

1. resolve source with `resolveExisting(requestedSrc)`；canonical source must be archival；
2. resolve destination with `resolveCreateTarget(requestedDst)`；canonical destination must be archival；
3. compare canonical source/destination；same → `same-source-destination` zero mutation；
4. load source scope + canonical source archival；must exist；
5. prepare canonical destination scope（same logical scope as requested by containment contract；may initialize session）；
6. load canonical destination archival if present；
7. derive moved C2/D1；
8. encode destination document + required companion state；
9. create whole cross-path plan and result using canonical paths。

### 13.3 C1/C2 continuity

Moved cognition：

```text
C1 document text unchanged
C2 challenge unchanged
```

Role/scope/path改变不重写 Markdown frontmatter type/role字段；role来自 B1 path。

Destination existing B完全被 source cognition A取代；B 的 C1/C2/D1不参与 A resulting state。

### 13.4 Same-scope move

When：

```text
sameScopeRef(src.scope,dst.scope) == true
```

D1：

```text
applyDirectEngagement(sourceScopeState, sourceAccessibility)
```

因此：

```text
age/durability preserved
exposure = 0
challenge preserved
```

### 13.5 Cross-scope move

When scopes differ：

```text
rebaseAcrossScope(
  sourceScopeState,
  targetScopeState,
  sourceAccessibility,
)
```

得到：

```text
same current age at move boundary
same durability
exposure = 0
anchorCycle = target current cycle
challenge preserved
```

不做 scope-weight normalization、不产生 fractional age、不 fresh-reset。

Target scope若刚初始化，target cycle就是 `0`。

### 13.6 Mutation plan

Required semantic plan至少保证：

```text
[empty target-session core init if needed]
put dst Markdown
remove/replace destination companion state so old destination challenge cannot attach
delete src Markdown
```

Target hydration 必须同时满足 source cognition 的 C2 + D1 continuity：questioned source保留 challenge；active/questioned 都保留/rebase source D1。若不写/不替换 target companion会导致 fresh-reset或继承 old destination B state，则 target companion mutation属于 required plan。Source companion deletion只是 orphan cleanup，可 best-effort，因为 source Markdown退出后它不再产生 cognition。

E2 required plan仍采用 puts-before-deletes，所以 destination先成立再移除 source。B3不手写 filesystem rename transaction；不删除 source scope/core，也不清理空 parent directories。

### 13.7 Result

```ts
{
  readonly action: "moved"
  readonly from: LogicalArchivalPath
  readonly to: LogicalArchivalPath
  readonly replacedExistingDestination: boolean
}
```

Adapter必须在 replacement case明确表达 replaced existing destination。

---

## 14. `brain_rm`

Public contract：

```text
brain_rm(path)
```

只接受 existing archival cognition。

### 14.1 Flow

Pre-E2：require archival path。

E2：

```text
scopes=[path.scope]
```

Inside derive：

1. resolve existing requested path；canonical target must still be archival；
2. load canonical scope；absent → not found；
3. load canonical archival；absent → not found；
4. required plan delete canonical Markdown；
5. companion cleanup作为 best-effort inert-orphan cleanup；
6. return removed result using canonical path。

No D1 transition先发生，因为 resulting identity已经退出 active state。Companion即使残留也只是 orphan auxiliary state，不能反向产生 cognition。

### 14.2 Must not

- delete core；
- delete scope state；
- remove empty directories as semantic cleanup；
- create tombstone；
- copy Markdown into recycle/history；
- intentionally preserve companion as a second inactive/tombstone semantic object；best-effort cleanup failure may leave an inert orphan record。

### 14.3 Result

```ts
{
  readonly action: "removed"
  readonly path: LogicalArchivalPath
}
```

Success后 B2 active flow立即不再看到该 path。若旧版本已经真实进入 Git checkpoint，该 checkpoint 可提供额外历史恢复依据；rm success 本身不依赖 Git。

---

## 15. `brain_feedback`

Public contract：

```text
brain_feedback(path, feedback, challenge?)
```

Path必须 existing archival cognition。

```ts
type FeedbackKind = "adopt" | "question" | "resolve"
```

Feedback不修改：

```text
C1 document
public path
importance
summary
role
scope
```

只可能改变 companion C2/D1 fields。

### 15.1 Shared flow

Pre-E2：

```text
require archival path
feedback enum valid
question requires challenge argument
question challenge must remain non-empty after trimming
```

对于 adopt/resolve，Frozen public signature没有禁止额外 `challenge`；B3不消费、不持久该字段，也不把它变成 audit metadata。

Inside E2 derive：

1. resolve existing requested path；canonical target must still be archival；
2. load canonical scope；must exist；
3. load canonical archival；must exist；
4. run exact C2/D1 transition；
5. compare resulting companion state；
6. no change → E2 no-change；otherwise companion是本次 explicit feedback 的 required semantic mutation，使用 `runSemanticOperation` 持久化；result path使用 canonical target。

---

### 15.2 `feedback=adopt`

Meaning由主模型在调用前判断：memory实际参与 decision/action且 outcome支持继续有效。

B3 transition：

```text
C2 next = current C2
D1 next = applyValidatedUse(scopeState, currentAccessibility)
```

Result：

```text
durability += 1
age reset at current cycle
exposure = 0
challenge unchanged
```

Adopt always changes valid D1 state because durability gain is +1；不存在 semantic no-change adopt。

它不自动：

```text
increase importance
resolve challenge
edit content
```

Questioned cognition可以被 adopt；其 challenge仍 questioned。Validated use与 epistemic unresolved state是正交 evidence。

---

### 15.3 `feedback=question`

First：

```text
nextEpistemic = setChallenge(currentEpistemic, rawChallenge)
```

C2负责 trim + non-empty validation。

D1：

```text
nextAccessibility = applyDirectEngagement(...)
```

因此：

```text
challenge = complete current unresolved challenge
age/durability unchanged
exposure = 0
```

Repeated question **replace** current challenge，不 append list。

If：

```text
next challenge == current challenge
AND next accessibility == current accessibility
```

→ `no-change`。

否则 put full companion。

---

### 15.4 `feedback=resolve`

```text
nextEpistemic = clearChallenge(currentEpistemic)
```

Current challenge absent → `no-current-challenge` failure, zero mutation。

D1：

```text
applyDirectEngagement(...)
```

Result：

```text
challenge absent → derived active
age/durability unchanged
exposure = 0
```

Resolve不：

- 增加 successful-use durability；
- 证明 document被 edit；
- 自动重写 document；
- 降低 importance。

如果 current meaning需要修正：

```text
brain_edit
→ brain_feedback(resolve)
```

是两个明确 semantic operations。

---

## 16. Domain equality

No-change detection比较 domain truth，而不是 `JSON.stringify` 或 filesystem timestamp：

- document → C1 normalized logical text exact equality；
- C2 → current challenge equality；
- D1 persistence state → `ageCycles / anchorCycle / durability / exposure` field equality。

不做 tolerance/rounding，也不借 equality 猜 cognition identity。

---
## 17. Result rendering boundary

B3返回 structured semantic result；A1 MCP adapter负责 ToolResult presentation。

Canonical semantic result union：

```ts
type MaintenanceResult =
  | { action:"created"; path:LogicalArchivalPath }
  | { action:"overwrote"; path:LogicalArchivalPath }
  | { action:"edited"; path:LogicalCorePath|LogicalArchivalPath; changed:boolean }
  | { action:"moved"; from:LogicalArchivalPath; to:LogicalArchivalPath; replacedExistingDestination:boolean }
  | { action:"removed"; path:LogicalArchivalPath }
  | { action:"adopted"; path:LogicalArchivalPath }
  | { action:"questioned"; path:LogicalArchivalPath; changed:boolean }
  | { action:"resolved"; path:LogicalArchivalPath }
```

Public output：

- paths用 B1 `formatPublicPath` 对 **E1-resolved canonical logical path** 格式化；成功 alias operation不把 requested alias回显成第二 identity；
- write明确 `created` / `overwrote`；
- mv replacement明确 `replaced existing destination`；
- no-op edit/question可以明确 `no persistent change`；
- no-op edit 渲染为 `no changes: <path>`；no-op question 渲染为 `current challenge unchanged for <path>`；
- adopt 渲染为 `recorded validated use for <path>`，只陈述 validated-use event 已记录；
- 不显示 challenge history、durability、age、exposure、Git SHA、physical path。

---

## 18. Error model

```ts
class MaintenanceInputError extends Error {
  code:
    | "edit-mode"
    | "empty-old-text"
    | "old-text-not-found"
    | "old-text-not-unique"
    | "overlapping-edits"
    | "same-source-destination"
    | "question-challenge-required"
}

class MaintenanceTargetError extends Error {
  code:
    | "write-requires-archival"
    | "rm-requires-archival"
    | "feedback-requires-archival"
    | "mv-requires-archival-source"
    | "mv-requires-archival-destination"
    | "target-not-found"
}

class PersistentStateInvariantError extends Error {
  code:
    | "required-runtime-core-uninitialized"
    | "malformed-persistent-state"
}
```

C1/C2/D1/E1/E2 errors保留各自 owner type；B3只负责映射成 maintenance public affordance。

Model-facing adapter 保留 `error: <code>` 首行，并对可由 caller 修正的 input error追加直接 action：exact edit 的 missing/non-unique/overlap、same source/destination、question challenge、resolve without current challenge，以及 archival frontmatter/summary/importance error。Guidance不创建另一套 code。

### 18.1 Guidance

Wrong core/archive kind：

- write core → use `brain_edit core`；
- rm core → use `brain_edit core`；
- mv core↔archival → read/write/edit semantic extraction/incorporation；
- edit missing archival → not found；不建议 write unless user actually wants new cognition identity。

Error不建议 hidden `confirmed/reason/id/status` 参数。

---

## 19. Composition summary

所有 B3 use case 共用一个形状：

```text
parse model-only input
→ enter E2 for every current-state-dependent decision
→ load current semantic state
→ derive public-semantic after-state according to operation sections
→ derive required post-success C1/C2/D1 hydration semantics (§7)
→ choose the minimal document/companion mutations that make those semantics true
→ E2 runSemanticOperation for required state / no-change
→ only inert orphan cleanup / scope-cycle hint may remain best-effort
→ return semantic result
```

Special cases只保留各 owner章节已经定义的差异：

- write → create/fresh or overwrite/fresh replacement；
- edit → same cognition；
- mv → same cognition relocation/rebase + destination replacement；
- rm → exits active；
- feedback → C2/D1 only，不修改 document/importance。

本节不再重复五套 operation algorithm；具体 after-state以 §§10–15 为 canonical truth。

---
## 20. Concurrency semantics consumed from E2

B3 **never reads current mutation state before entering E2 and then reuses it for write**。

Model-visible validation that depends only on raw input可以 pre-E2；all current-state-dependent decisions inside derive：

```text
create vs overwrite
source exists
mv destination exists/replaced
current challenge exists
current scope cycle
current accessibility state
same challenge no-change
```

因此：

- project/session competing operations由 one-process E2 serial解释；
- any global source/target在 global lock内重新读 state；
- mv source/destination形成一个 cross-scope operation，不拆两次 mutation。

---

## 21. Scope initialization matrix

| Operation | Missing target scope | Behavior |
|---|---|---|
| write → session target | initialize session + write in same semantic flow | allowed |
| write → global/project target | invariant failure | runtime bootstrap must already materialize required scope |
| edit | not found; no init | required existing target |
| rm | not found; no init | required existing archival |
| feedback | not found; no init | required existing archival |
| mv source | not found; no init | required existing source |
| mv destination → session target | initialize session + move in same semantic flow | allowed |
| mv destination → global/project target | invariant failure | runtime bootstrap must already materialize required scope |

Pure B2 read仍不初始化 scope；B3不能把这张表扩成 generic lazy-init-on-access。

---

## 22. Core ↔ archival semantic flow

B3明确不提供 cross-kind move。

### Core → archival

```text
resident core content is already present in the current brain_think context
→ model forms self-contained archival cognition
→ brain_write concrete archival path
→ after success, brain_edit core to prune/adjust resident context if warranted
```

### Archival → core

```text
brain_cat archival
→ model decides which meaning belongs resident core
→ brain_edit core
→ archival may remain or be rm separately if semantic judgment warrants
```

Mechanism不自动 copy/promote/demote。

---

## 23. Coding constraints

1. 五个 maintenance public operations只有一个 B3 semantic owner；
2. raw path先 B1 parse；existing/create target再经 E1-backed `MaintenancePathPort` canonicalize；B3不接 physical path；
3. object-kind、same-path、create-vs-overwrite、destination-replacement 等 current identity判断都使用 resolved canonical path并在 E2 derive内；
4. `brain_write overwrite`始终使用 fresh C2/D1 constructor；
5. `brain_edit content=`绝不调用 write-overwrite fresh constructor；
6. `brain_edit` unchanged document不产生 D1 transition；
7. exact edits全部先针对 original document形成无歧义、无重叠 replacement plan，再原子得到 result；
8. `oldText`不做 trim/newline normalization；
9. all resulting documents统一 normalize + full C1 reparse；
10. mv same logical path fail；
11. mv不 rewrite Markdown role/type metadata；
12. mv destination old state完全被 source resulting state replacement；
13. rm不先执行 direct-engagement transition；
14. feedback永远不改 Markdown/importance；
15. adopt不清 challenge；
16. resolve不增加 durability；
17. question replace challenge，不 append；
18. no hidden status/id/history/timestamp；
19. no direct fs/Git calls；
20. E2 semantic plan只包含兑现 public semantics 所必需的 changed resources；
21. edit/mv/write-replacement/adopt 所承诺的 D1 continuity/reset/reinforcement属于 semantic success boundary；
22. current challenge preservation/clear/set不能被降格成 auxiliary；
23. write replacement必须防止 old/orphan companion challenge **或 old learning state** 重新附着；
24. orphan companion cleanup / scope-cycle hint可以 best-effort，因为它们不改变 post-success identity semantics。

---

## 24. Required tests

Tests 聚焦会改变 public/semantic correctness 的边界，不 snapshot implementation algorithm。

### Write / Edit

- create → fresh state；overwrite → replacement fresh state/clears prior challenge/learning；
- whole-content edit仍保持 identity/learning；actual changed archival edit只应用相应 direct-engagement transition；
- same-content whole-document edit → no durable change；`edits=[]` → input failure / zero persistent plan；
- exact edits：missing/ambiguous/overlap 任一情况 whole request fails zero mutation；多个合法 edits against original document形成 deterministic complete result；
- core edit：empty/content、capacity boundary、missing/uninitialized scope不得 lazy-create。

### Move / Remove

- same path mv fails；same-scope continuity；cross-scope D1 rebase；role change；
- destination absent/existing replacement；destination old state不污染 moved cognition；
- target session required core initialization joins same semantic flow when allowed；core source/destination rejected；
- rm requires active Markdown deletion；companion cleanup is best-effort；absent target fails；no tombstone/recycle；scope/core remain。

### Feedback

- adopt changes D1 as defined and preserves challenge/importance/document；
- question requires nonblank challenge, replaces current challenge, clears exposure as D1 defines；
- repeated identical question may be no-change when resulting C2/D1 identical；
- resolve requires current challenge, clears it, no durability gain/document/importance change。

### Semantic / auxiliary boundary

- active/questioned archival edit：if companion mutation is required to preserve C2/D1 continuity, its failure makes edit fail/restore required state；
- overwrite same content with old challenge or reinforced D1 still ends fresh active/fresh learning；old companion cannot reattach；
- mv active/questioned cognition preserves/rebases source D1 at target and cannot inherit destination D1；questioned also preserves challenge；
- rm companion cleanup failure does not keep cognition active；
- feedback companion failure means feedback itself fails；
- cat/anchor auxiliary learning failure is tested in B2/B4, not used to weaken B3 identity semantics；
- no case depends on Git availability。

### Alias canonical identity

- edit/rm/feedback through same-scope archival alias operate on canonical target and return canonical path；
- archival-looking alias resolving to core：edit may follow canonical core semantics，rm/feedback/write/mv reject wrong canonical kind；
- `mv(aliasOfX, X)` and `mv(X, aliasOfX)` become same-source-destination after resolution；
- destination directory alias changes canonical role/path to resolved target role；result/replacement checks use canonical destination；
- broken/outside alias exact maintenance fails before semantic mutation。

### Coordination

Using E2 seam，competing write/edit/question/mv outcomes必须 sequentially explainable；global current-state-dependent operations在 global semantic coordination内读取 current state。

---
## 25. Convergence / compatibility boundary

Legacy B3/v1 implementation不是兼容目标。当前 Design不保留：

- feedback hidden in `edits=[]`；
- path-stable overwrite自动继承 old learning；
- core↔archival mv；
- recycle/tombstone/custom history；
- B3 自己的 Git/rollback protocol；
- hidden cognition id/status/timestamp。

旧实现只作为 failure evidence；除非 Requirements 明确要求 compatibility，不增加 dual semantics/fallback/migration branch。

---
## 26. Implementation-ready completion check

实现者不需要重新设计这些 semantic decisions：

- write create/overwrite 与 edit/mv identity continuity；
- edit exact-text 的 atomic/unambiguous boundary；
- no-change 不产生 semantic persistence；
- mv destination replacement / cross-scope rebase / core rejection；
- session-only create-intent initialization；
- rm exits active with no hidden recycle；
- adopt/question/resolve 的 C2/D1 effects；
- every current-state-dependent branch stays inside E2；
- B3不直接操作 fs/Git。

具体 internal string range algorithm、helper names、collection implementation等 compatibility-neutral coding choice留给 implementation。
B4/A1/A2 已有各自 canonical child；B3只提供这里定义的 maintenance application semantics。
