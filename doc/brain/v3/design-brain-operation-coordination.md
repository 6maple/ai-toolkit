# brain v3 Detailed Design — Persistent State Coordination

> **Layer:** Phase 5B Detailed Design child。
> **System owner:** E2 Persistent State Coordination。
> **Parent:** `design-brain-system.md`。
> **Inputs:** Frozen Requirements / Contract / Acceptance；B1/E1 physical projection；C1/C2/D1 semantic state。
> **Children:** none。
> **Status:** **Design Frozen for v3 (2026-08-30)**；owner semantics inherit the unchanged v2 evidence-corrected baseline；canonical v3 Detailed Design truth is this file。
> **Compatibility boundary:** 不为 v1/旧内部 transaction API 保留兼容路径；旧实现只作为 failure evidence。

---

## 1. 本文职责

E2 只解决两类不同问题：

1. **Semantic state mutation**：write/edit/mv/rm/core maintenance / explicit feedback 等 public operation 承诺的必要 current state，怎样在并发下形成一个可立即观察、可由某个合法顺序解释的新状态；
2. **Auxiliary state update**：cycle/exposure/retrievability 等只影响 learning/discoverability 的附加更新，怎样避免明显 stale overwrite，同时允许失败局部降级。

这两类不能再用同一个“全部 side effects 必须事务成功”的模型处理。

E2 不拥有：

- C1/C2/D1 的业务语义；
- filesystem layout/containment/atomic single-file write（E1）；
- Git/history/checkpoint（E3）；
- WAL/journal/crash recovery；
- pure discovery snapshot isolation。

---

## 2. Coordination topology

支持拓扑：一个 project 一个 MCP process；不同 project processes 共享 global scope。

### 2.1 Process-local serial boundary

同一 process 内，所有会 read-modify-write current brain state 的 semantic mutation / auxiliary update 共用一个 serial boundary，避免 stale derive 覆盖同进程已成功更新。

Pure `ls/glob/grep` 不进入；`brain_cat` 只有它的 best-effort exact-retrieval refresh 进入。

### 2.2 Global cross-process lease

只要 work 会 read-modify-write `global` scope：

```text
acquire global exclusive semantic lease
→ read current state
→ derive/apply
→ release
```

必须保证两个**成功的 semantic global mutations**可由某个合法 sequential order解释，并且不会 silent lost update。

具体 lock library、file name、retry/backoff、heartbeat/stale-lock policy 属于 implementation。无法可靠取得 global exclusivity：

- semantic mutation → 明确失败；
- auxiliary update → 放弃本次 auxiliary effect并返回 degraded outcome。

Project/session-only work 不支付 cross-process lock成本。

### 2.3 Reads

Frozen behavior没有要求普通 discovery 对 concurrent writer提供 snapshot isolation。Pure reads可 overlap；如果 exact resource 在读取时已无法形成合法结果，按该 read 自身 contract失败/局部跳过。

---

## 3. Shared coordination primitive

```ts
export interface CoordinationScope {
  readonly scopes: readonly ScopeRef[]
  readonly signal?: AbortSignal
}

function withStateCoordination<T>(
  request: CoordinationScope,
  work: () => Promise<T>,
): Promise<T>
```

职责只包括：

- process-local serialization；
- scopes 含 global 时的 cross-process lease；
- waiting 阶段 cancellation；
- `work` 完成/抛错后可靠 release。

它不自动 capture bytes、不自动 stage Git、不自动 rollback arbitrary callback side effect。

---

## 4. Semantic mutation model

```ts
export type PersistentFileRef =
  | CorePhysicalRef
  | ArchivalPhysicalRef
  | CompanionPhysicalRef

export type ResourceMutation =
  | { readonly kind: "put"; readonly ref: PersistentFileRef; readonly bytes: Uint8Array }
  | { readonly kind: "delete"; readonly ref: PersistentFileRef }

export type PreparedSemanticOperation<T> =
  | { readonly kind: "no-change"; readonly result: T }
  | {
      readonly kind: "change"
      readonly mutations: readonly ResourceMutation[]
      readonly result: T
    }
```

Scope-cycle state **不是 semantic mutation 必须携带的固定 companion**；它是 auxiliary learning coordinate。某个 operation 真正需要哪些 resources 才能兑现自己的 public semantics，由 application owner决定。

例如：

- `brain_write` create/overwrite：post-success hydration必须是 replacement 的 fresh C2/D1；physical companion可以缺失来表达 fresh，但旧 companion若仍会 valid并继承旧 learning/challenge，就必须 delete/replace；
- archival edit：same-cognition **C2 + appropriate D1 continuity** 都是 operation identity promise；如果 companion rebind失败会让下一 hydration fresh-reset continuity，则该 companion mutation是 required；
- archival mv：target必须 hydrate 成 source cognition 的 C2 + preserved/rebased D1，并替换 destination old state；只有 source orphan companion cleanup可降级；
- `brain_feedback(question/resolve/adopt)`：resulting C2/D1 是显式 operation state，发生 transition时对应 companion是 required。

这不是给每个 file 人工打“重要/不重要”标签，而是 application 根据**本次 public promise**决定 operation plan。

---

## 5. E1 port for semantic mutation

E2 消费 E1 的 whole-resource primitives：

```ts
interface PersistentResourcePort {
  preflight(mutation: ResourceMutation): Promise<PreparedPhysicalMutation>
  readBefore(prepared: PreparedPhysicalMutation): Promise<ResourceBeforeState>
  putWhole(prepared: PreparedPhysicalMutation, bytes: Uint8Array): Promise<void>
  deleteFile(prepared: PreparedPhysicalMutation): Promise<void>
  restoreBefore(prepared: PreparedPhysicalMutation, before: ResourceBeforeState): Promise<void>
}
```

`putWhole` 对**单文件**应使用简单、成熟的 atomic-replacement primitive（例如 temp + rename）；具体实现归 E1。

E2 的 multi-resource rollback只服务 public semantic mutation 的 catchable failure，不承担 crash durability。

---

## 6. `runSemanticOperation`

```ts
interface SemanticOperationRequest<T> {
  readonly name: string
  readonly scopes: readonly ScopeRef[]
  readonly signal?: AbortSignal
  readonly derive: () => Promise<PreparedSemanticOperation<T>>
}

function runSemanticOperation<T>(request: SemanticOperationRequest<T>): Promise<T>
```

Canonical algorithm：

```text
withStateCoordination(scopes):
  1. derive complete semantic after-state from current state
  2. no-change → return
  3. preflight every required mutation
  4. capture before-state for every required resource
  5. apply final puts first, then deletes, each group canonical path order
  6. success → return semantic result
  7. catchable apply failure after first side effect:
       restore required resources from captured before-state
       → report failure
```

Success 后立即 read-your-writes。

**Git 不在这条 algorithm 中。** History failure不能改变 semantic success。

### 6.1 Failure boundary

- derive/preflight/before-state capture failure → zero semantic write；
- apply failure → operation-local restore；
- restore itself失败 → `StoreInvariantError(restore-failed)`，后续 state-changing operation不得把未知状态当健康 state继续修改；
- SIGKILL/host crash/power loss不由本算法提供 durable transaction guarantee；单文件 atomic replacement已尽量避免 torn file，跨文件未完成 operation允许丢失/部分落盘，restart按真实 current resources解释。

不增加 WAL/journal/recovery state machine。

---

## 7. Auxiliary state update

Auxiliary update只用于 **不属于某个 semantic mutation identity promise 的 incidental learning**：

```text
scope cognition cycle
brain_cat exact-read short-term retrievability refresh
anchor passive-L0 exposure debt
fresh scope-cycle bootstrap hint
```

`adopt` durability reinforcement、edit/mv learning continuity、overwrite fresh-learning reset不是这里的 auxiliary event；它们归 B3 `runSemanticOperation` required semantics。

它不改变 cognition Markdown、core、scope/role、importance 或 explicit unresolved challenge。

### 7.1 API

```ts
export type AuxiliaryUpdateOutcome =
  | { readonly kind: "applied" }
  | { readonly kind: "degraded"; readonly diagnostic: TechnicalDiagnostic }

function tryApplyAuxiliaryUpdate(
  request: {
    readonly scopes: readonly ScopeRef[]
    readonly deriveAndApply: () => Promise<void>
  },
): Promise<AuxiliaryUpdateOutcome>
```

Canonical behavior：

```text
try withStateCoordination(scopes):
  reload current auxiliary state/fresh fallback
  → derive current update
  → write whole auxiliary records using E1 single-file atomic replacement
  → applied
catch coordination / codec / persistence failure:
  → degraded diagnostic
```

### 7.2 No multi-file rollback

如果一个 anchor 的多个 cycle/exposure auxiliary files 中途失败：

- 已成功的 individual auxiliary records可以保留；
- 未成功的本轮 learning effects丢失；
- 不为了让“本轮所有 exposure 一起成功”capture/rollback全套 before-state；
- 不把这种 partial auxiliary learning写成 cognition corruption。

原因是这些状态本来就可 fresh/rebuild/degrade；跨多个 auxiliary files 做强事务只会增加脆弱性，而不会保护 cognition truth。

### 7.3 Stale-write prevention

基于 current companion 做 read-modify-write 时，reload 必须发生在 coordination boundary 内。不要拿进入 Tool 前缓存的 companion覆盖后来已成功的 feedback/mutation。

若当前 item 的 companion 同时含有**业务必要 challenge**，调用方不能把包含 challenge 变化/保留的写入降格为 auxiliary；应放进 `runSemanticOperation`。

---

## 8. Scope initialization

### 8.1 Runtime required global/project

Serving 前必须有真实 `core.md`。Runtime bootstrap若缺失：

```text
create empty core.md as required semantic workspace state
```

scope-cycle state可同时 best-effort 写 initial `{cycle:0}`；缺失/失败后后续 application使用 fresh cycle baseline。

### 8.2 Fresh session

Reliable current session首次 anchor：

- real empty session `core.md` 是返回 maintainable session core 的必要前提；创建失败 → anchor failure；
- initial/final cycle state属于 auxiliary learning；写失败不否定已经真实创建的 core。

B3 对尚未 materialize session 的真实 create-intent mutation同样可以先创建其必要 core workspace。

Pure B2 discovery/read不创建 scope。

---

## 9. Composition

### B2 exact retrieval

```text
render/return exact content independently
→ if substantive lines returned:
     tryApplyAuxiliaryUpdate(reload current companion → D1 exact retrieval → persist)
→ degraded update only yields warning/log
```

### B3 maintenance

B3 在 `runSemanticOperation.derive` 内决定：

- document/explicit epistemic semantics；
- 哪些 companion fields必须随本次 operation保存；
- final required resource plan。

只有 **不属于本次 operation identity/learning promise** 的 incidental D1 event 才能 best-effort。B3 edit/mv/overwrite/adopt 已由其 Acceptance 明确要求 continuity/reset/reinforcement，不能在 E2 composition 中降级。

### B4 anchor

B4 的 **primary restore/read/render 不进入 E2 auxiliary lease**；否则 auxiliary coordination unavailable 会反向阻断 read-before-think。

```text
pure current reads / fresh auxiliary fallback
→ derive in-memory advanced projection / rank / render context
→ context成立
→ for each applicable scope:
     tryApplyAuxiliaryUpdate([scope])
       reload current cycle/companions inside coordination
       record this anchor's cycle + shown exposure
       degradation is local to that scope
→ return context
```

这样既保证 restore priority，又保证真正持久化 D1 event不会拿 render 前的 stale state覆盖 concurrent feedback/anchor。Git checkpoint完全在 E2之外。

---

## 10. Error model

```ts
class CoordinationError extends Error {
  code: "global-coordination-unavailable" | "aborted"
}

class SemanticOperationPlanError extends Error {
  code: "duplicate-resource" | "empty-change-plan"
}

class StoreInvariantError extends Error {
  code: "restore-failed"
}
```

Auxiliary update把可处理失败压成 `degraded` technical outcome；A层可选择 concise warning，不能泄露 physical path/lock internals。

---

## 11. Coding constraints

1. E2 不 import Git/E3；
2. current-state-dependent semantic derive 在 coordination boundary 内；
3. global cross-process lease只保护真实 shared global state；
4. required semantic plan 使用 final whole-file mutations；
5. catchable semantic apply failure只 rollback required business resources；
6. auxiliary state不做 multi-file transaction/rollback；
7. single-file persistence复用 E1 atomic replacement；
8. no WAL/journal/custom transaction history；
9. no HEAD/index-based rollback；
10. pure discovery不为 snapshot guarantee加锁；
11. scope-cycle缺失不是 scope/core不存在的证据。

---

## 12. Required tests

### Semantic coordination

- concurrent same-process mutations serial-explainable；
- different global processes successful updates no silent lost update；
- project-only mutation不需要 global lease；
- validation/preflight failure zero write；
- second required-file failure restores earlier required file；
- restore failure becomes invariant failure；
- no Git collaborator is needed for semantic success。

### Auxiliary update

- exact-read refresh persistence failure returns degraded but CatPage remains usable；
- cycle write failure does not invalidate valid core/cognition；
- exposure write failure only loses that anti-monopoly event；
- multi-file auxiliary failure does not rollback already-valid cognition or other auxiliary records；
- global auxiliary coordination unavailable → degraded, no business failure；project/session scope attempts need not be cancelled；
- anchor auxiliary updates are scope-local；
- reload-inside-coordination prevents stale cycle/companion overwrite。

### Scope initialization

- global/project core creation is required before serving；
- fresh session core creation failure makes anchor fail；
- fresh session cycle write failure still leaves a real maintainable core；
- pure reads do not initialize session。

---

## 13. Convergence note

旧 E2 把下面内容绑成一个统一 transaction：

```text
semantic files
+ auxiliary learning files
+ Git staging
+ anchor checkpoint finalizer
```

这导致任何低价值 auxiliary/history failure都可能反向失败或回滚 cognition。

当前只保留真实需要的两种保证：

```text
semantic mutation
→ strong current-state success boundary

auxiliary learning
→ coordinated best effort / local degradation
```

Git完全退出 E2。新事务机制只能由新的不可恢复 business failure evidence推动。
