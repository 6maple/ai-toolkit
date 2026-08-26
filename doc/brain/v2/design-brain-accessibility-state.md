# brain v2 Detailed Design — Accessibility State & Learning

> **Layer:** Phase 5B Detailed Design child。
> **System owner:** D1 Accessibility State & Learning。
> **Parent:** `design-brain-system.md`。
> **Frozen inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。
> **Sibling dependencies:** B1 `ScopeRef` 见 `design-brain-namespace-storage.md`；D1 persistence wire fields / E1 codec 见 `design-brain-cognition-state.md`。
> **Supersedes:** `design-brain-runtime.md` 中重复的 accessibility state / decay / event-transition implementation truth。
> **Status:** **Design Frozen (2026-08-24, evidence-corrected re-freeze)**；canonical v2 Detailed Design baseline。

---

## 1. 本文职责

D1 只回答：

> 给定当前 scope cognition cycle、某条 archival cognition 的 accessibility state，以及 application 已经判定成立的 learning event，当前 retrievability 和下一 accessibility state 是什么？

```text
scope cognition cycle
+
item accessibility state
+
application event
→ deterministic projection / next state
```

D1 不判断：

- `brain_cat` 是否真正返回了 archival content（B2）；
- `brain_feedback(adopt)` 是否有 validated successful-use evidence（B3）；
- 哪些 L0 candidate 实际进入返回 context（B4）；
- importance（C1）、questioned/challenge（C2）、scarcity ranking（D2）；
- auxiliary state 缺失/损坏后是否 fresh fallback（C/E application boundary）；
- physical persistence / Git / transaction。

D1 不使用 wall clock、query relevance、embedding、scope priority 或 hidden usage counter。

---

## 2. Concrete module boundary

```text
src/brain/accessibility.ts   # D1 pure domain module
```

要求：

- pure TypeScript domain functions；
- 不 import filesystem / Git / MCP / host SDK；
- 不执行 persistence；
- calibration constant 只有一份 owner；
- D2 只消费 D1 projection，不复制 retrievability formula。

---

## 3. State model

### 3.1 Scope cycle

```ts
export interface ScopeCycleState {
  readonly cycle: number
}
```

Invariant：

```text
cycle = finite non-negative integer
```

一个 applicable scope 的每次有效 turn-level anchor 都推进一次 cycle。它表示该 cognition scope 又经历了一次真实的 cognitive opportunity；没有新 anchor 时，wall-clock 经过不推进。

### 3.2 Per-item persistence state

```ts
export interface AccessibilityPersistenceState {
  readonly ageCycles: number
  readonly anchorCycle: number
  readonly durability: number
  readonly exposure: number
}
```

Invariant：

```text
ageCycles   = finite non-negative integer
anchorCycle = finite non-negative integer
durability  = finite > 0
exposure    = finite non-negative integer
```

语义：

- `ageCycles`：在 `anchorCycle` 坐标前已经累计、需要继续保留的 cognition-age；
- `anchorCycle`：该 item state 最近一次重新锚定到 scope cycle 的位置；
- `durability`：validated use 形成的可达性耐久度；越高，同样 age 下 retrievability 越高；
- `exposure`：只服务 passive L0 anti-monopoly 的展示压力。

`durability` 是 brain 自己的 cycle-space quantity。它可以借鉴 spaced-repetition/FSRS 的“成功使用后更耐久”直觉，但不继承 FSRS Stability 的完整定义、状态机或参数语义。

### 3.3 Derived projection

```ts
export interface AccessibilityProjection {
  readonly currentAge: number
  readonly retrievability: number
}
```

这两个字段不持久化。

---

## 4. Calibration baseline

```ts
export const INITIAL_DURABILITY = 1
export const ADOPT_DURABILITY_GAIN = 1
```

当前两个数值都是 calibration-sensitive implementation baseline：

```text
Replay/Eval / production evidence
→ Design-first 修改 calibration
→ tests
→ implementation
```

不从 environment/config 动态调参。

**没有 scope-specific decay weight。**

原因是 cycle 自己已经表示“该 scope 又经历了一次 cognition opportunity”：

- project memory 只在该 project 的 applicable anchors 中 aging；
- session memory 只在该 session 的 applicable anchors 中 aging；
- global memory 在跨 project 的 applicable anchors 中 aging，因为这些本来就是它真实经历的机会。

固定 `global=0.5` 不能表达项目数量或实际机会差异，反而会无依据地抹掉一部分真实 cognition cycles，因此退出当前 Design。

---

## 5. Scope-cycle functions

### 5.1 `initialScopeCycleState()`

```ts
return { cycle: 0 }
```

### 5.2 `advanceScopeCycle(current)`

```text
validate current
→ return { cycle: current.cycle + 1 }
```

不访问 item，不做 O(all items) aging write。未触碰 item 的 age 由 cycle delta 惰性推导。

---

## 6. Accessibility projection

### 6.1 `projectAccessibility(scopeState, itemState)`

```text
function projectAccessibility(
  scopeState: ScopeCycleState,
  itemState: AccessibilityPersistenceState,
) -> AccessibilityProjection
```

Validation：

1. numeric invariants 成立；
2. `itemState.anchorCycle <= scopeState.cycle`；
3. derived arithmetic finite。

Algorithm：

```text
currentAge
= itemState.ageCycles
  + (scopeState.cycle - itemState.anchorCycle)

retrievability
= itemState.durability
  / (itemState.durability + currentAge)
```

Postconditions：

```text
currentAge = finite non-negative integer
0 < retrievability <= 1
```

Properties：

```text
currentAge = 0
→ R = 1

currentAge = durability
→ R = 0.5

currentAge ↑
→ R monotonically ↓

durability ↑ with same currentAge
→ R monotonically ↑
```

不 round R。

---

## 7. Fresh state

### `createFreshAccessibilityState(scopeState)`

```ts
return {
  ageCycles: 0,
  anchorCycle: scopeState.cycle,
  durability: INITIAL_DURABILITY,
  exposure: 0,
}
```

用于 new archival cognition 与 `brain_write` overwrite replacement。Replacement 不继承旧 cognition 的 learning state。

---

## 8. Event transitions

D1 不设计 generic event dispatcher。Application 先判断业务事件，再调用对应 pure transition。

### 8.1 Exact retrieval

```text
applyExactRetrieval(scopeState, current)
```

先 `projectAccessibility` 验证 current coordinate，然后：

```ts
return {
  ageCycles: 0,
  anchorCycle: scopeState.cycle,
  durability: current.durability,
  exposure: 0,
}
```

含义：真正进入 context 的 archival content 刷新近期 retrievability，但不等于 validated use，也不增加 durability。

B2 只在 public `brain_cat` 已实际返回 archival content 时调用。若 content 已正确返回但该 auxiliary learning state 后续无法持久化，B2 可以丢失本次 refresh；D1 不拥有这个 failure policy。

### 8.2 Validated successful use / adopt

```text
applyValidatedUse(scopeState, current)
```

```ts
nextDurability = current.durability + ADOPT_DURABILITY_GAIN

return {
  ageCycles: 0,
  anchorCycle: scopeState.cycle,
  durability: nextDurability,
  exposure: 0,
}
```

当前 gain 不依赖 current R，不引入 difficulty/rating/success counter。

### 8.3 Passive L0 shown

```text
applyPassiveExposure(scopeState, current)
```

先验证 coordinate，然后：

```ts
return {
  ...current,
  exposure: current.exposure + 1,
}
```

不改变 age/durability，因此不 refresh R。只有 B4 **实际放入返回 context** 的 archival L0 item 才调用。

### 8.4 Direct engagement

```text
applyDirectEngagement(scopeState, current)
```

先验证 coordinate，然后：

```ts
return {
  ...current,
  exposure: 0,
}
```

不刷新 age，不增加 durability。典型 caller：

```text
archival brain_edit with actual document change
brain_feedback(question / resolve)
same-scope brain_mv
```

`brain_ls / brain_glob / brain_grep` presentation 不产生 D1 transition。

---

## 9. Cross-scope move rebase

跨 logical scope move 需要把同一 cognition 当前已经累计的 accessibility age 搬到 target scope 的 cycle coordinate，但不需要 scope-specific normalization。

### `rebaseAcrossScope(sourceScopeState, targetScopeState, current)`

```text
sourceProjection = projectAccessibility(sourceScopeState, current)

return {
  ageCycles: sourceProjection.currentAge,
  anchorCycle: targetScopeState.cycle,
  durability: current.durability,
  exposure: 0,
}
```

瞬间 invariant：

```text
R_before == R_after
```

因为 target rebase 后：

```text
currentAge_after = ageCycles = currentAge_before
```

`ageCycles` 始终保持整数，不再有 scope-weight 导致的 fractional age / rounding 问题。

B3 负责判断 source/target 是否是不同 logical scope；same-scope relocation 使用 `applyDirectEngagement`。

---

## 10. Event ownership table

| Application fact | Caller | D1 transition | age | durability | exposure |
|---|---|---|---|---|---|
| new / overwrite replacement cognition | B3 | `createFreshAccessibilityState` | fresh | fresh=1 | 0 |
| archival exact content returned | B2 | `applyExactRetrieval` | reset | preserve | 0 |
| validated successful use | B3 | `applyValidatedUse` | reset | +1 | 0 |
| actually shown passive L0 | B4 | `applyPassiveExposure` | preserve | preserve | +1 |
| archival edit / question / resolve | B3 | `applyDirectEngagement` | preserve | preserve | 0 |
| same-scope move | B3 | `applyDirectEngagement` | preserve | preserve | 0 |
| cross-scope move | B3 | `rebaseAcrossScope` | rebase current age | preserve | 0 |
| ls/glob/grep display | B2 | none | preserve | preserve | preserve |

---

## 11. Anchor sequencing consumed by B4

本轮 L0 ranking 使用推进后的 cognition cycle：

```text
for each applicable scope:
  currentCycle = advanceScopeCycle(previousCycle)

→ derive current R against currentCycle
→ D2/B4 choose actual L0
→ applyPassiveExposure only to actually shown items
```

没有 shown 的 item 不需要 persistence write；全量 aging 仍只是 derived projection。

**D1 不要求 cycle/exposure persistence 成为 restored cognition 的强事务前置条件。** B4/E2 根据 upstream failure-locality 决定：辅助 cycle/exposure write 失败时可以丢失本轮对应 learning effect，而不是反向否定已经可正确恢复的 cognition。

---

## 12. Persistence wire contract

E1 codec 的 D1-owned fields：

```text
scope state:
  cycle

archival companion:
  ageCycles
  anchorCycle
  durability
  exposure
```

C2 `challenge?` 可与 D1 fields 共存于 companion，但不由 D1解释。

D1 不持久：

```text
currentAge
retrievability
wall-clock timestamps
usage/success counters
difficulty/rating
scope decay weight
```

Auxiliary scope/companion record 缺失、malformed、stale 时是否 fresh fallback 由 E1/application owner根据 Frozen Acceptance 处理；codec 不调用 D1 猜 default。

---

## 13. Error / invariant model

```ts
class AccessibilityStateError extends Error {
  code:
    | "invalid-scope-cycle"
    | "invalid-accessibility-state"
    | "anchor-cycle-ahead"
    | "non-finite-derived-value"
}
```

D1 pure API 对收到的 typed values 做 domain assert，不 clamp、不用 current cycle 修补 invalid input。Application 对“auxiliary persisted record 不可用”的 fresh fallback 应发生在进入 D1 之前。

---

## 14. Determinism / precision

- JavaScript `number` 足够当前 cycle scale；
- cycle / age / anchor / exposure 都是 safe integer domain；
- R 使用 raw number，不 round/toFixed；
- transition 不依赖 wall clock / randomness / iteration order；
- 不为理论上极端 cycle 数引入 BigInt/decimal。

若 production evidence 证明 precision 成为真实 failure，再重新设计。

---

## 15. Coding constraints

1. retrievability formula 只有 D1 一份 owner；
2. `INITIAL_DURABILITY / ADOPT_DURABILITY_GAIN` 不散落 magic number；
3. 没有 `scopeDecayWeight` / scope-specific aging branch；
4. B2/B3/B4 不直接修改 `ageCycles/anchorCycle/durability/exposure`；
5. E1 codec 不自行做 reinforcement；
6. D2 只消费 `AccessibilityProjection`；
7. transitions 返回 immutable new value；
8. 每个 transition 先验证 current coordinate；
9. 不建立 generic event-name registry；
10. comments 解释 brain 自身 formula/invariant，不复制 FSRS 教程。

---

## 16. Required pure tests

### 16.1 Cycle / projection

- cycle initial 0 / advance +1；
- no wall-clock aging；
- fresh R=1；
- `currentAge=durability → R=.5`；
- age ↑ → R monotonically ↓；
- durability ↑ → same age 下 R monotonically ↑；
- global/project/session 使用同一 projection formula；
- anchorCycle ahead fails。

### 16.2 Fresh / exact / adopt

- fresh durability exactly 1；
- exact reset age/exposure，preserve durability；
- adopt reset age/exposure，durability +1；
- repeated adopt linear +1；
- exact read never increases durability。

### 16.3 Exposure / engagement

- passive shown only exposure +1；
- direct engagement exposure=0 only；
- ls/glob/grep no D1 transition。

### 16.4 Cross-scope rebase

覆盖 project↔global、session↔project、session A→B：

- currentAge before/after exactly equal；
- R before/after equal within normal floating arithmetic；
- durability preserved；
- exposure clears；
- `ageCycles` remains integer；
- target cycle value itself does not alter preserved current age at the rebase instant。

Pure tests 直接调用 D1，不通过 filesystem/MCP 验证 formula。

---

## 17. Convergence / implementation-ready boundary

D1 当前只维护：

```text
scope cognition cycle
+
age / durability / passive exposure
→ derived retrievability
```

不增加 wall-clock、persisted R、FSRS difficulty/rating、scope decay weight、usage counters 或 status-driven learning。

实现者不再需要自行决定：

- cycle 初值/推进；
- exact persistence fields；
- R formula；
- scope 是否有独立 decay coefficient（没有）；
- fresh/adopt durability baseline；
- exact/adopt/passive/direct transitions；
- cross-scope age continuity；
- derived R 是否持久化（否）。

D2 ranking、B3 business event判定、B4 anchor composition、E1/E2 persistence failure policy由各自 canonical child拥有。
