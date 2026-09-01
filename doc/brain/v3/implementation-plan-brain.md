# brain v3 Implementation Execution Map

> **Layer:** optional Implementation Plan / non-canonical execution aid。
> **Status:** current v3 execution map；2026-08-30 anchor-semantics re-freeze 已同步，未受影响的执行依赖继承 2026-08-24/26 v2 baseline。
> **Purpose:** reduce dependency / cutover / handoff cost for this multi-owner implementation；它不是 Design → Implementation 的流程 gate。
> **Canonical truth:** BDD / Public Contract / Acceptance / Frozen System + owner Detailed Designs。发生冲突时，本文件永远让位于对应 canonical owner。

---

## 1. 使用规则

### 1.1 每个 slice 从 canonical owner 开始

执行某个 T task 时：

```text
read canonical task refs + mapped Acceptance
→ inspect current tests / production only as implementation evidence
→ first update/add Acceptance / Fault / Mechanism tests to current truth
→ self-validate the tests with the minimum suitable seam / Fake Green when useful
→ run them against current production
   current implementation already satisfies truth → may already be green
   current implementation deviates → corresponding tests should expose the deviation before production is changed
→ update production to satisfy the Frozen owner
→ focused green
→ reverse-review implementation against the canonical owner
```

这里的 test-first 是为了让当前 Frozen truth 先拥有 executable expression，不是为了机械追求一次 red。旧 test若保护已被推翻的行为，先改/删 test；旧 production若恰好已经满足新 truth，不为了制造 red 故意破坏它。

本文件不重新解释 owner 中的 algorithm、state transition、operation ordering 或 failure semantics。

### 1.2 Reopen rule

实现中若出现 materially different 的合理解释，并会改变 architecture、state ownership、algorithm outcome、public behavior、identity/learning continuity、failure/concurrency/restart semantics 或 compatibility policy：

```text
stop choosing inside implementation
→ reopen owning Design
→ observable What also changes?
   yes → reopen BDD / Contract / Acceptance first
```

semantic-neutral helper name、library API、局部等价 data structure 可以直接在 Frozen boundary 内选择最简单实现。

### 1.3 Compatibility / test boundary

v3 是当前 v1 semantics 的 replacement，不默认维护 dual compatibility。旧代码和旧测试只作为 failure/evidence reference；只有新的明确 Requirement 才引入 migration / compatibility。

测试分层继续由 `test-design-review-brain.md` 和各 owner DD 决定：

```text
CI
→ production domain/application logic + minimum fake/stub resource seams

Manual / E2E
→ real filesystem / Git / MCP / host / multiprocess where required

Agent verification
→ R1–R16 representative Replay + G1 effectiveness/context-cost comparison
```

---

## 2. Delivery order

```text
T1 namespace + cognition/storage foundation
        ↓
T2 accessibility + scarcity pure domain
        ↓
T3 coordination + state-store + optional history/bootstrap
        ↓
        ┌────────────────┐
        ↓                ↓
T4 cognition maintenance T5 read/discovery
        └───────┬────────┘
                ↓
T6 anchor/restore
                ↓
T7 generic MCP cutover
                ↓
T8 hook-backed host integration
                ↓
T9 readiness / E2E / Replay-Eval
```

这只是 dependency / delivery order。Sibling tasks在依赖满足后可以独立推进；不要为了 Plan 顺序预建后续 task skeleton。

---

# T1 — Namespace + cognition/storage foundation

## Goal

让后续 application 只消费 v3 typed logical identity、C1/C2 state 和 E1 storage/codec boundary。

## Canonical inputs

- `design-brain-namespace-storage.md` — B1/E1；
- `design-brain-cognition-state.md` — C1/C2/E1 codec；
- `AC3-PATH-001..004`、`AC3-MEMORY-001..004`、`AC3-CORE-003`。

## Dependency

None。

## Implementation area

`code/brain/src/brain/{namespace,documents,epistemic}.ts`、`src/persistence/{storage,codecs}.ts` 及其直接 tests。文件名若因等价局部重构变化，以 owner-defined module responsibility 为准。

## Verification

B1/C1/C2/E1 owner required tests + focused `typecheck`：namespace/path/object-kind、document/core contract、challenge、codec/fresh fallback、containment与 same-scope alias canonical identity。真实 symlink/junction filesystem behavior留相应 integration/E2E。

## Done

后续 owner 不需要再解析 raw v1 path/schema，也不复制 B1/C1/C2/E1 semantics。

---

# T2 — Accessibility + scarcity pure domain

## Goal

实现 D1/D2 pure domain owners，不连接 filesystem/Git/application orchestration。

## Canonical inputs

- `design-brain-accessibility-state.md`；
- `design-brain-scarcity-selection.md`；
- `AC3-LEARNING-001`、`AC3-TIME-001`、`AC3-RETRIEVAL-001`、`AC3-REINFORCEMENT-001`、`AC3-EXPOSURE-001`、`AC3-DISCOVERABILITY-001`、`AC3-QUESTIONED-001`。

## Dependency

T1 typed values。

## Implementation area

`code/brain/src/brain/accessibility.ts`、`src/brain/scarcity.ts` 及 pure tests。

## Verification

执行 D1/D2 required mechanism/invariant tests，重点证明当前 Frozen formula/transition/order；不存在 storage/application 中的 duplicate ranking/learning owner。

## Done

D1/D2 可作为 pure functions 独立测试并供 B2/B3/B4 消费。

---

# T3 — Coordination + state store + optional history/bootstrap

## Goal

建立 E2 current-state coordination、hydrated state-store、E3 optional history，以及不依赖 Git 的 runtime bootstrap。

## Canonical inputs

- `design-brain-operation-coordination.md` — E2；
- `design-brain-git-history.md` — E3；
- `design-brain-system.md` — scope initialization / composition；
- `design-brain-integration.md` — bootstrap；
- `AC3-HISTORY-001..002`、`AC3-CONSISTENCY-000..001`、`AC3-CONCURRENCY-001..002`、`AC3-FAILURE-001`、`AC3-RESTART-001..002`。

## Dependency

T1 + T2。

## Implementation area

`src/persistence/{operation-coordination,cognition-state-store}.ts`、`src/git/*` only as required by E3、`src/runtime/bootstrap.ts`。旧 per-operation staging owner 不属于 v3 target architecture。

## Verification

E2/E3/bootstrap owner tests：required semantic operation consistency、auxiliary degradation、global vs project/session coordination、restart/current-state behavior、Git unavailable/failure independence、idempotent global/project core bootstrap。真实 Git/filesystem/multiprocess进入对应 integration/E2E。

## Done

无 Git 环境可以正常 bootstrap + current cognition mutation；Git 可用时提供独立的 best-effort history，不进入 E2 semantic success boundary。

---

# T4 — Cognition maintenance

## Goal

实现 `brain_write / brain_edit / brain_mv / brain_rm / brain_feedback` application owner B3。

## Canonical inputs

- `design-brain-cognition-maintenance.md`；
- its B1/C1/C2/D1/E2 dependencies；
- `AC3-WRITE-001`、`AC3-EDIT-001..002`、`AC3-MV-001`、`AC3-RM-001`、`AC3-FEEDBACK-001..004`、`AC3-QUESTIONED-001`、`AC3-LIFECYCLE-001`。

## Dependency

T1 + T2 + T3。

## Implementation area

`src/application/cognition-maintenance.ts`、`src/application/exact-edits.ts` 以及 B3 application tests。

## Verification

直接执行 B3 Required tests + mapped Acceptance：create/overwrite、edit、mv/replacement、rm、feedback、no-change、scope-init、canonical alias identity、required-vs-incidental state failure boundaries。

## Done

五个 maintenance use cases 在不经过 MCP adapter 的 application layer 已满足 mapped Acceptance；v1 approval/lifecycle semantics 不再被新 owner调用。

---

# T5 — Read / discovery

## Goal

实现 B2 familiar `ls / glob / grep / cat`，包括 bounded discovery 与 lossless exact-read behavior。

## Canonical inputs

- `design-brain-read-discovery.md`；
- B1/E1/D1/D2/E2 contracts；
- `AC3-DISCLOSURE-001..002`、`AC3-CAT-001..003`、`AC3-LS-001..002`、`AC3-GLOB-001..002`、`AC3-GREP-001..003`、`AC3-PATH-004`、`AC3-RETRIEVAL-001`。

## Dependency

T1 + T2 + T3。

## Implementation area

`src/application/read-discovery.ts`、`src/brain/discovery.ts`、`src/adapters/pi-tools.ts`（直接复用 Pi Agent Tool）及 B2 tests。

## Verification

B2 Required tests + mapped Acceptance：ls/glob/grep truth、canonical alias roots/results、regex/literal error boundary、Pi-style bounded grep + refine affordance、output scarcity、`brain_cat` logical-line continuation/oversized escape hatch、exact-read auxiliary degradation。

## Done

B2 Acceptance 可以直接通过 fake state/E1/search/auxiliary seams 验证；旧 private L1/L2 retrieval semantics 不再参与 v3。

---

# T6 — Anchor / restore

## Goal

实现 B4 restore-first `brain_think` application path和唯一 work-surface renderer。

## Canonical inputs

- `design-brain-anchor-restore.md`；
- C1/C2/D1/D2/E1/E2/E3 contracts；
- `AC3-ANCHOR-001..004`、`AC3-CORE-001..002`、`AC3-EXPOSURE-001`、`AC3-PRESENTATION-001`、`AC3-PERSISTENCE-001`、`AC3-HISTORY-002`。

## Dependency

T1–T5。

## Implementation area

`src/application/anchor-restore.ts`、`src/application/anchor-renderer.ts` 及 B4 tests。

## Verification

B4 Required test matrix + mapped Acceptance：applicable core/session、malformed archival failure locality、L0 selection/packing、presentation、only-shown exposure、scope-local auxiliary degradation、Git independence、`AnchorResult.context/diagnostics` boundary。

## Done

直接 application call产生 canonical persistent-cognition working context；B4 不复制 host/MCP semantics，也不把 Git/auxiliary-learning success变成 restore prerequisite。

---

# T7 — Generic MCP integration + v1 server cutover

## Goal

通过 A1 暴露 Frozen 11-tool contract，并让 v3 application成为 `code/brain` 唯一 production semantic path。

## Canonical inputs

- `design-brain-integration.md` — A1；
- `brain-tools-contract.md`；
- `AC3-CONTRACT-001`、`AC3-ANCHOR-001` 与其他 public Tool cases。

## Dependency

T1–T6。

## Implementation area

`src/integration/public-tools.ts`、`src/integration/mcp-adapter.ts`、final `runtime/bootstrap.ts`、thin `src/index.ts`；清理不再 reachable 的 v1 semantic modules。

## Verification

Frozen tool list/schema/description、adapter dispatch、generic think guidance、session facts、typed error sanitization、Git-optional serving；`typecheck/test/build`。再用真实 stdio MCP 做最小 initialize → tools/list → tools/call E2E。

## Done

production build启动 v3 MCP server并只暴露 Frozen contract；不存在 reachable v1 semantics/compatibility shim。

---

# T8 — Hook-backed host integration

## Goal

让 `code/brain-dsh-plugin` 与 `code/brain-codex-plugin` 都成为 thin A2 adapter：按各自真实 host lifecycle调用同一个 B4，并把实际 `AnchorResult.context` 注入 host context，不再拥有第二套 Brain contract、renderer 或 cognition workflow。

## Canonical inputs

- `design-brain-integration.md` — A2；
- `AC3-ANCHOR-002..003`、`AC3-PRESENTATION-001`。

## Dependency

T6 behavior + T7 stable v3 server contract。

## Implementation area

`code/brain-dsh-plugin/src/*` 与 `code/brain-codex-plugin/src/*` 中实际需要的 host/MCP/process lifecycle adapters。Codex adapter同时维护 `session_id + cwd` host binding，并在机械 restore 后从 plugin MCP surface隐藏 `brain_think`；删除 vendored Tool contract与旧 dual-restore cognition semantics。

## Verification

A2 owner tests：one host trigger → one B4 result、injected bytes/text == `AnchorResult.context`、diagnostics separate、无 second renderer/rerank/default session。对机械 restore 的 Codex mode额外验证 `brain_think` hidden + other 10 tools exposed、`session_id + cwd` binding 与 per-call thread resolution。再分别做真实 host + MCP 短会话 E2E。

## Done

各 plugin 仅承担 host invocation / trusted binding / transport / context injection，不拥有 cognition logic或第二份 public contract。

---

# T9 — Readiness / full verification / cleanup

## Goal

证明 implementation 是 Frozen v3 的翻译，而不是产生第三套语义；完成当前承诺的 CI、real-adapter 与 Agent-level evidence path。

## Canonical inputs

- `acceptance-spec-brain.md` — 59 cases / 140 scenarios；
- `test-design-review-brain.md`；
- `design-brain-runtime.md` — 59/59 owner map、R1–R16、G1；
- all Frozen owner completion checks。

## Dependency

T1–T8。

## Execution / verification

1. 59 Acceptance cases全部落实到其当前 verification method；140 Scenarios仍由 Acceptance覆盖。
2. 删除/重写仍保护 v1 / 已推翻 Design semantics 的 tests和 unreachable production paths。
3. 运行 current package/workspace 的 typecheck、test、build、lint/check 等实际 required gates。
4. 执行 Frozen Test Strategy要求的 real filesystem / Git / MCP / host / restart / multiprocess Manual/E2E。
5. 以最低充分方式执行或形成 R1–R16 reproducible Replay evidence，并完成 G1 enabled-vs-control comparison。
6. 对 failure先分类：implementation deviation / Design gap / Requirement gap / calibration evidence；按 owner回流，不在 readiness gate临时发明机制。
7. 最后做正向 traceability + Original Intent Reverse Audit + stale semantic/doc/reference/UTF-8/diff hygiene。

## Done

- required automated checks green；
- supported deployment 的 required Manual/E2E blocker 为 0；
- 59 Acceptance / 140 Scenario coverage 与 implementation一致；
- R1–R16 / G1 有真实可执行或已记录的验证结果；
- 剩余问题已有正确 owner，不存在未裁决 implementation architecture gap。

---

## 3. Acceptance area → primary slice

| Area | Primary slice |
|---|---|
| namespace / cognition schema / physical boundary | T1 + T7 public exposure |
| accessibility / forgetting / reinforcement / scarcity | T2 |
| persistence / consistency / concurrency / restart / optional history | T3 |
| write/edit/mv/rm/feedback | T4 |
| ls/glob/grep/cat | T5 |
| core/L0/brain_think/presentation/persistence opportunity | T6 |
| generic MCP | T7 |
| hook-backed host | T8 |
| full Acceptance + real adapters + Replay/G1 | T9 |

---

## 4. Cutover

v3 是 replacement，不是 runtime dual-mode compatibility layer。推荐执行关系只是：

```text
new owner tests + implementation
→ v3 application slices converge
→ A1 production entrypoint cutover
→ remove unreachable v1 semantics/tests
→ A2 host adapter cutover
→ full readiness / real E2E / Replay
```

如果真实部署需要 parallel runtime/migration，先新增明确 Requirement，再重新设计；不要从 execution convenience反推 compatibility subsystem。
