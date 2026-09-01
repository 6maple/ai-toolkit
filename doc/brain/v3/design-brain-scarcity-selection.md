# brain v3 Detailed Design — Scarcity Selection Policy

> **Layer:** Phase 5B Detailed Design child。
> **System owner:** D2 Scarcity Selection Policy。
> **Parent:** `design-brain-system.md`。
> **Frozen inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。
> **Dependencies:** B1 canonical path formatter 见 `design-brain-namespace-storage.md`；C1 importance / C2 epistemic status 见 `design-brain-cognition-state.md`；D1 retrievability/exposure 见 `design-brain-accessibility-state.md`。
> **Supersedes:** `design-brain-runtime.md` 中重复的 archival scarcity comparator truth。
> **Status:** **Design Frozen for v3 (2026-08-30)**；owner semantics inherit the unchanged v2 evidence-corrected baseline；canonical v3 Detailed Design truth is this file。

---

## 1. 本文职责

D2 只回答：

> true archival candidates/results 已经成立，但当前 bounded output 装不下全部内容时，哪些 cognition 更早获得 scarce attention？

D2 不决定：

- ls/glob/grep match truth（B2）；
- output/L0 budget 与 packing（B2/B4）；
- grep 同一 document 内 line ordering（B2）；
- retrievability formula / learning transition（D1）；
- importance meaning（C1）；
- questioned lifecycle（C2）；
- 是否发生 exposure/retrieval event（application owner）。

D2 是 pure ordering policy；ranking 本身无 side effect。

---

## 2. Concrete module boundary

```text
src/brain/scarcity.ts
```

允许依赖：

```text
B1 LogicalArchivalPath + formatPublicPath
C1 Importance
C2 EpistemicStatus
D1 AccessibilityProjection + exposure
```

不依赖 filesystem / MCP / Git / renderer / output budget。

---

## 3. Calibration baseline

### 3.1 Importance protection floor

```ts
export const IMPORTANCE_PROTECTION_FLOOR = {
  low: 0.25,
  medium: 0.50,
  high: 0.75,
  critical: 1.00,
} as const
```

importance 不是 query relevance，而是“该 cognition 适用时，如果没想起来可能造成的 omission consequence”。floor 只保证长期低 R 不会把高后果 cognition 完全压没。

这些具体数值是 calibration-sensitive baseline；只从 Replay/Eval / production evidence 做 Design-first 调整。

### 3.2 Passive question pressure

```text
active     → factor 1
questioned → factor 2
```

questioned 仍可被 recall/search；这里仅降低 system-proactive passive L0 trust，不根据 challenge length/severity继续造权重。

---

## 4. Candidate

```ts
export interface ScarcityCandidate<T = unknown> {
  readonly path: LogicalArchivalPath
  readonly importance: Importance
  readonly epistemicStatus: EpistemicStatus
  readonly accessibility: AccessibilityProjection
  readonly exposure: number
  readonly value: T
}
```

Rules：

- R 必须来自 D1；
- exposure 来自当前 D1 state；
- epistemicStatus 由 C2 derive；
- same rank call 的 canonical archival path unique；
- `value` 只是 B2/B4 payload，D2 不解释。

Grep 多个 match line 先由 B2 按 owning archival document 组织；D2 比较 document order，不比较同 document 的 line records。

---

## 5. Shared protection

### 5.1 `importanceProtectionFloor(importance)`

exhaustive mapping到 §3.1，无 generic default。

### 5.2 `protection(candidate)`

```text
R = candidate.accessibility.retrievability
I = importanceProtectionFloor(candidate.importance)

protection = max(R, I)
```

这是当前最小充分关系：

- R 高本身是“当前容易重新发现”的充分理由；
- importance 高本身是“遗漏后果较大、不应仅因久未取回而完全下沉”的充分理由；
- 提高任一项都不会让 protection 变差；
- R/I 角色交换得到同一 protection；
- **没有 secondary `min(R,I)` bonus**。当前没有 evidence 证明“R 与 importance 同时高”应比“其中一个理由已经足够强”再额外获得一次 attention 奖励。

若 future Eval 证明双高 cognition 确实需要额外保护，再从那个具体 failure 重新设计，而不是预留第二维 score。

---

## 6. Passive L0 score

### 6.1 Pressure

```text
questionFactor = epistemicStatus == active ? 1 : 2
pressure = (1 + exposure) * questionFactor
```

Invariant：`pressure >= 1`。

### 6.2 `passiveL0Score(candidate)`

```text
score = protection(candidate) / pressure
```

不 round。

语义：

- exposure 只形成 passive anti-monopoly debt；
- questioned 只形成 proactive-trust pressure；
- questioned 不 hard-filter；
- critical 也不是永久 resident，重复 passive exposure 可以让其他 cognition 轮换；
- scope 不提供 bonus。

---

## 7. Active discovery score

### `activeDiscoveryScore(candidate)`

```text
return protection(candidate)
```

Active discovery 忽略：

```text
exposure
questioned pressure
scope bonus
query relevance score
```

questioned status 仍由 B2 model-visible result 表达，但不降低一个已经真实命中的 search result 的 active-discovery scarcity score。

如果 true results 全部装得下，B2 不需要 D2 cutoff/order 来隐藏任何 result；match truth 优先于 memory-strength scarcity。

---

## 8. Deterministic tie-break

两个 score 数值完全相等时：

```text
formatPublicPath(candidate.path) lexical ascending
```

使用 JS `<` / `>`，不使用 `localeCompare()`，避免 host locale 改变 deterministic order。

Public root 只可能通过最终 lexical tie-break 影响顺序；这不是 scope priority。

---

## 9. Comparator

### 9.1 `compareScoreDesc(a, b)`

```text
if a != b
→ larger first
else equal
```

不 epsilon/round。

### 9.2 Passive comparator

```text
validate a/b
→ passiveL0Score
→ larger score first
→ equal: canonical public path asc
```

### 9.3 Active comparator

同上，使用 `activeDiscoveryScore`。

---

## 10. Ranking functions

```text
rankPassiveL0Candidates(candidates)
rankActiveDiscoveryCandidates(candidates)
```

共同 algorithm：

1. validate candidate invariants；
2. canonical path uniqueness；duplicate → fail；
3. shallow-copy input；
4. sort using corresponding comparator；
5. return new ordered array。

不 mutate caller input，不 slice/pack，不修改 D1 state。

---

## 11. B2 composition boundary

### `brain_ls`

```text
true direct children
→ B2 keeps directory/navigation semantics
→ archival leaves use D2 active order only when scarcity exists
→ B2 renders/packs
```

### `brain_glob`

```text
true archival path matches
→ D2 active order when scarcity exists
→ B2 renders/packs
```

### `brain_grep`

```text
archival document order
→ D2 active order when scarcity exists

within same document
→ B2 logical line order
```

D2 不认识 grep offset/context/match line。

---

## 12. B4 composition boundary

```text
all applicable archival cognition
→ C1 importance
→ C2 status
→ D1 R + exposure
→ D2 passive ranking
→ B4 selects what actually fits L0
→ only shown items receive D1 passive exposure event
```

因此：

```text
rank != shown != state mutation
```

D2 comparator 永远不能更新 exposure。

---

## 13. No generic relevance model

当前不引入：

```text
alpha * R + beta * importance
R * importance
secondary min(R,I) reward
query semantic relevance
scope/role/recency bonus
question severity
embedding similarity
```

理由不是这些信号理论上永远无价值，而是当前真实需求只要求：

```text
R provides monotonic protection
importance provides independent monotonic protection
passive exposure rotates L0
questioned lowers proactive trust
```

`max(R,I)` + passive pressure 已直接表达这些关系。新复杂度只能由新的可观察 selection failure 推导。

---

## 14. Error model

```ts
class ScarcitySelectionError extends Error {
  code:
    | "invalid-retrievability"
    | "invalid-exposure"
    | "duplicate-candidate-path"
    | "invalid-selection-state"
}
```

Validation：

```text
0 < R <= 1
exposure = finite non-negative integer
importance = valid C1 enum
epistemicStatus = active | questioned
candidate paths unique
```

不 clamp/default invalid inputs。

---

## 15. Determinism / precision

- raw JavaScript number；
- scores 不 round/toFixed；
- path tie-break JS lexical；
- no current time / randomness；
- ranking output 只依赖 input candidate facts；
- invalid duplicate path fail，而不是依赖 array input order。

---

## 16. Coding constraints

1. importance floor mapping 只有 D2 一份；
2. `protection=max(R,I)` 只有 D2 一份；
3. passive pressure 只有 D2 一份；
4. 不保留 `ProtectionKey/ScarcityKey primary+secondary` 双维结构；
5. B2/B4 不复制 comparator；
6. D2 不 import renderer/budget、也不调用 D1 transition；
7. D2 不解析 challenge text；
8. D2 不从 path 推 scope/role score；
9. comparator/rank helpers pure；
10. B2 structural ordering 继续由 B2 拥有。

---

## 17. Required pure tests

### 17.1 Importance floor

- low=.25 / medium=.5 / high=.75 / critical=1；
- exhaustive mapping。

### 17.2 Protection

- `protection=max(R,I)` representative examples；
- R 增加 protection 不变差；
- importance 升级 protection 不变差；
- R/I symmetry；
- same `max` but different lower dimension → same protection；确认没有 secondary bonus。

### 17.3 Passive pressure

- exposure0 active divisor1；
- exposure1 active divisor2；
- questioned doubles otherwise-equivalent divisor；
- repeated exposure lowers passive score；
- critical 可因足够 exposure 让位；
- questioned 不 hard-filter。

### 17.4 Active discovery

same R/importance：

- exposure 不改变 score/order；
- active vs questioned 不改变 active score；
- scope 无 bonus。

### 17.5 Tie-break / purity

- equal score → canonical path asc；
- Unicode path JS lexical，不 locale；
- reversed input order gives same output；
- duplicate path fails；
- ranking does not mutate input / D1 state；
- D2 never slices output budget。

---

## 18. Composition / implementation-ready boundary

D2 当前完整 policy：

```text
protection = max(retrievability, importanceFloor)
passive L0 score = protection / ((1 + exposure) * questionedFactor)
active discovery score = protection
exact tie = canonical public path asc
```

B2 仍拥有 truth set、non-archival ordering、grep line sequence、budget/packing/pagination；B4 拥有 L0 capacity与 actual shown selection。

实现者不再需要自行决定：

- importance floor calibration baseline；
- R/importance 组合关系；
- 是否有 secondary bonus（没有）；
- passive exposure/questioned pressure；
- active discovery 是否受 exposure/questioned 影响（不受）；
- scope bonus（没有）；
- tie-break / locale behavior；
- D2 是否负责 packing/state mutation（不负责）。

新 ranking factor 只能来自新的 evidence-driven Design reopen。
