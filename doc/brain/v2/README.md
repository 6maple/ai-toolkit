# brain v2

> **状态：BDD / Public Contract / Acceptance / System Design / canonical owner Detailed Designs 均已完成 2026-08-24 evidence-corrected re-freeze。**
> Current verified structure：**62 Requirements / 140 BDD Scenarios / 59 Acceptance cases；140/140 Scenario coverage；59/59 Acceptance → Design owner mapping。**

当前阶段已经停止继续扩 Design。下一阶段直接进入 tests + implementation translation，并随后完成 Acceptance / Fault / E2E / Replay-Eval。由于 brain 跨多个 owner、package 与 cutover 步骤，保留 [`implementation-plan-brain.md`](implementation-plan-brain.md) 作为**可选的轻量执行导航**；它不是流程 gate，也不能替代 Frozen Design。当前 worktree 中已有或历史 production code **不反向拥有 v2 语义**；实现必须向本冻结文档收敛。

## 当前最重要的设计边界

```text
current Markdown / core workspace
→ cognition truth

operation-promised identity / epistemic / learning result
→ semantic success boundary

cat / anchor 顺带产生的 cycle / retrievability refresh / exposure
→ incidental auxiliary learning；允许局部 degradation

Git
→ optional workspace history only；不参与 Tool success / runtime serving
```

此外：

- anchor **先 restore/read/render**，context 成立后才按 scope best-effort记录 cycle/exposure，再 best-effort checkpoint；
- D1 使用统一 cycle-space + `durability`，无 scope-specific decay weight / `effectiveAge`；
- D2 使用单一 `max(R, importanceFloor)` protection，无 secondary `min(R,I)` bonus；
- `brain_cat` exact content只消费完整 logical lines；单行超 transport 时不 clip-as-consumed，改走 `brain_absolute_path` → ordinary filesystem read；
- same-scope public symlink/junction alias按 real target工作，但 **resolved canonical target 的 public path / role / object kind 拥有 cognition identity**；B2/B3/B4 都在 semantic 判断前消费 E1 canonicalRef；
- malformed 单条 archival 在 broad anchor/discovery 中局部 warning+skip；required core failure仍是 primary restore failure；
- invalid regex 是 query/input error，不是假装 0 matches。

## 文档

| 文档 | 当前职责 |
|---|---|
| [bdd-brain-behavior-requirements.md](bdd-brain-behavior-requirements.md) | **Frozen What**；62 REQ / 140 Scenario。 |
| [brain-tools-contract.md](brain-tools-contract.md) | **Frozen model-visible/public Tool contract**。 |
| [acceptance-spec-brain.md](acceptance-spec-brain.md) | **Frozen Acceptance**；59 cases / 140/140 Scenario coverage。 |
| [test-design-review-brain.md](test-design-review-brain.md) | 历史 Phase 3 review + 2026-08-24 current re-review；历史数字保留用于追溯。 |
| [design-brain-system.md](design-brain-system.md) | **Frozen canonical System Design**；black-box ownership、composition、major flows。 |
| [design-brain-integration.md](design-brain-integration.md) | **A1/A2**；project/session facts、single Tool definitions、context/diagnostic transport、Git-optional bootstrap。 |
| [design-brain-namespace-storage.md](design-brain-namespace-storage.md) | **B1/E1**；public namespace、physical projection、containment、same-scope alias canonicalization。 |
| [design-brain-cognition-state.md](design-brain-cognition-state.md) | **C1/C2/E1 codec**；Markdown/core schema、challenge、scope/companion wire codec 与 fresh fallback boundary。 |
| [design-brain-accessibility-state.md](design-brain-accessibility-state.md) | **D1**；cycle/currentAge/durability/retrievability、learning/exposure、cross-scope rebase。 |
| [design-brain-scarcity-selection.md](design-brain-scarcity-selection.md) | **D2**；importance/R protection、passive pressure、active scarcity ordering。 |
| [design-brain-read-discovery.md](design-brain-read-discovery.md) | **B2**；ls/glob/grep/cat truth、canonical alias roots/results、budget/paging、lossless exact read。 |
| [design-brain-cognition-maintenance.md](design-brain-cognition-maintenance.md) | **B3**；write/edit/mv/rm/feedback identity、canonical alias target、required C2/D1 success semantics。 |
| [design-brain-anchor-restore.md](design-brain-anchor-restore.md) | **B4**；restore-first anchor、L0 projection/packing、scope-local auxiliary learning、separate diagnostics。 |
| [design-brain-operation-coordination.md](design-brain-operation-coordination.md) | **E2**；semantic mutation coordination + incidental auxiliary-update degradation；无 Git dependency。 |
| [design-brain-git-history.md](design-brain-git-history.md) | **E3**；anchor-time best-effort current-workspace Git checkpoint only。 |
| [design-brain-runtime.md](design-brain-runtime.md) | **Design Verification Index / non-canonical**；59/59 owner traceability、original-intent audit、R1–R15/G1、Freeze record。 |
| [implementation-plan-brain.md](implementation-plan-brain.md) | **Optional execution map / non-canonical**；只组织 T1–T9 dependency、canonical refs、implementation area、verification 与 done condition。 |
| [engineering-design-review-brain.md](engineering-design-review-brain.md) | 历史 Holistic Review + 后续裁决记录；不是当前 canonical truth owner。 |
| [design-brain-discovery-working-notes.md](design-brain-discovery-working-notes.md) | 历史 working notes / evidence；不是规格真相。 |

## 当前流程位置

`BDD ✓ → Public Contract ✓ → Acceptance ✓ → Test Design Review ✓ → System Design ✓ → Owner Detailed Designs ✓ → Evidence-corrected Design Re-freeze ✓ → Tests / Implementation → E2E / Replay-Eval`

`Implementation Execution Map` 仅在当前 brain 的复杂依赖/交接场景中旁路辅助 Tests / Implementation，不构成独立 truth layer 或必经阶段。

Design Freeze 后：

- implementation 发现 materially different 的 architecture/state/algorithm interpretation → 先 reopen owning Design；
- observable behavior/invariant 需要改变 → 先 reopen BDD / Contract / Acceptance；
- calibration-only evidence → 先改 owning D1/D2/B2/B4 Design baseline，再同步 code/tests；
- 不因为“还能想到 edge case”继续扩 subsystem。

上位方法见 [`../../design-rule.md`](../../design-rule.md)；Agent 设计原则见 [`../../ai-mds/agent-dev-rules.md`](../../ai-mds/agent-dev-rules.md)。

上一版冻结 baseline 见 [`../v1/`](../v1/)，跨版本历史证据见 [`../archive/`](../archive/)。
