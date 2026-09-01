# brain v3

> **状态：Current / Specification & Design Frozen（2026-08-30）/ Tests、Implementation 与 Replay-Eval validation 进行中。**
> Current structure：**62 Requirements / 140 BDD Scenarios / 59 Acceptance cases；140/140 Scenario coverage；59/59 Acceptance → Design owner mapping。**

v3 是 v2 的完整版本派生，不是附加在 v2 上的补丁文档。未改变的行为在本目录中继续完整定义；本轮变化则重新裁决并同步到 BDD、Public Contract、Acceptance、B4 Detailed Design、Verification Index 与实现测试。v2 保持冻结，不接受这些变化的回写。

## v3 版本差异

v3 只改变 model-visible anchor 的表达与消费语义，不重新设计 Brain 的 scope、storage、learning、mutation、discovery 或 Git 边界：

- `brain_think` 返回的是本轮读取到的 current persistent cognition snapshot，也是用户要求 Brain 保持的 working context；它不是可随意忽略的背景材料，也不替代 latest user message 或 governing instruction。
- 这份 snapshot 不等于 Brain 已经针对 latest user message 生成了新分析，也不表示其中所有 claim 都较旧。每条 claim 所描述状态的时间、适用性和有效性分别判断，persistence 本身不提供统一的新旧或 authority 排名。
- 当前用户消息定义本轮请求；适用 cognition 按自身语义角色参与理解、判断和回答。模型不能只从随后读取的磁盘事实重新构造结论，从而无声丢失不同命题上的 decision、intention、knowledge 或 skill。
- 不同证据只能更新它实际证明或反驳的命题。实现状态可以修正“是否已经实现”，但不能仅凭这一点抹掉仍然有效的方向、约束或剩余意图；Brain 中的方向或意图同样不能证明实现已经完成。
- anchor 使用可直接解释的属性名和值表达 namespace、core、archival、cognitive role 与 candidate 的消费方式。父级只承载真正通用的规则；每个 concrete `core path` 保留自己的完整 update/archive 语义。
- candidate summary 足以支持当前判断时可以直接使用；只有 summary 不足或需要 exact detail 时才读取正文。相关性本身不构成强制 `brain_cat` 流程。
- archival 表示 non-resident cognition，不表示 stale、低权重或低可信；每条 claim 仍按语义、scope、证据和当前请求判断。

## 当前最重要的既有边界

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

- anchor **先 restore/read/render**，context 成立后才按 scope best-effort 记录 cycle/exposure，再 best-effort checkpoint；
- D1 使用统一 cycle-space + `durability`，无 scope-specific decay weight / `effectiveAge`；
- D2 使用单一 `max(R, importanceFloor)` protection，无 secondary `min(R,I)` bonus；
- `brain_cat` exact content 只消费完整 logical lines；单行超过 transport 时不 clip-as-consumed，改走 `brain_absolute_path` → ordinary filesystem read；
- same-scope public symlink/junction alias 按 real target 工作，但 resolved canonical target 的 public path / role / object kind 拥有 cognition identity；
- malformed 单条 archival 在 broad anchor/discovery 中局部 warning + skip；required core failure仍是 primary restore failure；
- invalid regex 是 query/input error，不是假装 0 matches。

## 文档

| 文档 | 当前职责 |
|---|---|
| [bdd-brain-behavior-requirements.md](bdd-brain-behavior-requirements.md) | **Frozen What**；62 REQ / 140 Scenario。 |
| [brain-tools-contract.md](brain-tools-contract.md) | **Frozen model-visible / Public Tool Contract**。 |
| [acceptance-spec-brain.md](acceptance-spec-brain.md) | **Frozen Acceptance**；59 cases / 140 Scenario coverage。 |
| [test-design-review-brain.md](test-design-review-brain.md) | 继承的 v2 review evidence + v3 anchor 语义增量审查。 |
| [design-brain-system.md](design-brain-system.md) | **Frozen canonical System Design**；black-box ownership、composition、major flows。 |
| [design-brain-integration.md](design-brain-integration.md) | **A1/A2**；project/session facts、single Tool definitions、context/diagnostic transport、Git-optional bootstrap。 |
| [design-brain-namespace-storage.md](design-brain-namespace-storage.md) | **B1/E1**；public namespace、physical projection、containment、same-scope alias canonicalization。 |
| [design-brain-cognition-state.md](design-brain-cognition-state.md) | **C1/C2/E1 codec**；Markdown/core schema、challenge、scope/companion wire codec 与 fresh fallback boundary。 |
| [design-brain-accessibility-state.md](design-brain-accessibility-state.md) | **D1**；cycle/currentAge/durability/retrievability、learning/exposure、cross-scope rebase。 |
| [design-brain-scarcity-selection.md](design-brain-scarcity-selection.md) | **D2**；importance/R protection、passive pressure、active scarcity ordering。 |
| [design-brain-read-discovery.md](design-brain-read-discovery.md) | **B2**；ls/glob/grep/cat truth、canonical alias roots/results、budget/paging、lossless exact read。 |
| [design-brain-cognition-maintenance.md](design-brain-cognition-maintenance.md) | **B3**；write/edit/mv/rm/feedback identity、canonical alias target、required C2/D1 success semantics。 |
| [design-brain-anchor-restore.md](design-brain-anchor-restore.md) | **B4**；restore-first anchor、working-cognition semantics、L0 projection/packing、scope-local auxiliary learning、separate diagnostics。 |
| [design-brain-operation-coordination.md](design-brain-operation-coordination.md) | **E2**；semantic mutation coordination + incidental auxiliary-update degradation；无 Git dependency。 |
| [design-brain-git-history.md](design-brain-git-history.md) | **E3**；anchor-time best-effort current-workspace Git checkpoint only。 |
| [design-brain-runtime.md](design-brain-runtime.md) | **Design Verification Index / non-canonical**；59/59 owner traceability、original-intent audit、R1–R16/G1、Freeze record。 |
| [implementation-plan-brain.md](implementation-plan-brain.md) | **Optional execution map / non-canonical**；组织 dependency、canonical refs、implementation area、verification 与 done condition。 |
| [engineering-design-review-brain.md](engineering-design-review-brain.md) | 从 v2 继承的历史 Holistic Review 与后续裁决记录；不是当前 canonical truth owner。 |
| [design-brain-discovery-working-notes.md](design-brain-discovery-working-notes.md) | 从 v2 继承的历史 working notes / evidence；不是规格真相。 |

## 当前流程位置

`v3 behavior delta ✓ → BDD / Public Contract / Acceptance synchronized ✓ → B4 / verification synchronized ✓ → Unit / type validation ✓ → host E2E / Replay-Eval`

Specification / Design Freeze 后：

- implementation 发现 materially different 的 architecture/state/algorithm interpretation → 先 reopen owning Design；
- observable behavior/invariant 需要改变 → 建立后续版本，不回写 v3；
- calibration-only evidence → 先改 owning D1/D2/B2/B4 Design baseline，再同步 code/tests；若改变 observable guarantee，同样需要新版本；
- 不因为“还能想到 edge case”继续扩 subsystem。

上位方法见 [`../../design-rule.md`](../../design-rule.md)；Agent 设计原则见 [`../../ai-mds/agent-dev-rules.md`](../../ai-mds/agent-dev-rules.md)。

上一冻结版本见 [`../v2/`](../v2/)，更早实现基线见 [`../v1/`](../v1/)，跨版本历史证据见 [`../archive/`](../archive/)。
