# brain v2 Test Design Review

> **状态：Phase 3 Review Complete / Phase 4 Acceptance Specification Freeze executed（2026-08-22）。**
> **日期：2026-08-22**  
> **输入：** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。  
> 本文审查 Specification by Example 的覆盖、边界、可观察性与 verification method；不决定 Engineering Design。
> **历史说明：** §§1–6 保留 2026-08-22 Phase 3/4 当时的 `60 / 126 / 53` 审查记录与当时判断，供追溯；**它们不是 2026-08-24 current contract 的替代 truth**。后续显式裁决以当前 BDD / Contract / Acceptance 为准；current re-review 见 §7。

## 1. Automated structure checks

当前结果：

```text
BDD requirements: 60
BDD scenarios:    126
Acceptance cases: 53
Scenario coverage: 126 / 126
Missing scenario refs: 0
Extra/stale scenario refs: 0
Duplicate AC IDs: 0
Cases missing Source/Type/Verification/Given/When/Then: 0
```

未发现明显将 current implementation 私有结构写进 acceptance expectation 的情况。测试规格没有冻结 state/index schema、内部 ID 格式、lock/transaction 调用、FSRS 数值或 Git repository layout。

## 2. Functional coverage review

### 2.1 Anchor / restored cognition

已覆盖 generic MCP guidance、hook auto-restore、single-anchor cycle、restored-prior 时间边界、latest user event 局部更新，以及 persistence 不提升 proposal/hypothesis/assistant recommendation 的 authority。

结论：覆盖完整。真正 host wiring 作为 Manual/E2E candidate；稳定 tool/schema fragment 可以 CI Contract；自然语言是否让模型正确理解 prior/current relation 作为 AI Semantic Review candidate。

### 2.2 Scope / core / archival

已覆盖 global/project/session applicability、core residency、session core+archival、core bounded failure。没有把 scope 写成 priority，也没有重新引入 promotion ladder。

结论：覆盖完整。

### 2.3 Progressive disclosure / read

已覆盖 L0 gist、L1 gist+grep evidence、direct L0→L2/exact-path→L2、single logical Markdown coordinate、小文档单次 read、长文档 continuation。

`brain_cat.offset` 已在 v2 public contract 收敛为 **1-based document line**。frontmatter/body 使用同一 coordinate；不恢复 `body_start` 或“首次 metadata、后续 body”的私有读取协议。

结论：覆盖完整。

### 2.4 Archival semantic contract

已覆盖 summary consistency、path-owned cognitive type、importance omission-consequence semantics、epistemic meaning/source preservation、body optional。

public importance representation 已收敛为：

```text
low | medium | high | critical
```

Acceptance 不断言内部 weight，只验证语义梯度与 update boundary。

结论：覆盖完整。

### 2.5 Mutation / identity

已覆盖：

```text
write create     → new cognition
write overwrite  → replacement cognition / fresh learning identity
edit             → same cognition evolves
mv               → same archival cognition changes address
rm               → current archival cognition exits active memory
```

额外补了 contract-boundary case：`brain_edit` 必须 exactly one of `edits/content`；write/rm/mv 对错误 object kind / cross-kind move 必须 fail with zero side effects。

`brain_mv` destination collision 已在 public contract 收敛为 familiar replacement semantics，并要求结果明确实际 replace。

结论：覆盖完整。

### 2.6 Feedback / questioned

已覆盖 `adopt / question / correct / revalidate`：

- read/list/search 不等于 adopt；
- question 表达 current unresolved epistemic challenge；
- correct 表达 previous meaning 已错且 current cognition 已修正；
- revalidate 表达 questioned cognition 经证据确认原 meaning 仍成立；
- unrelated action failure 不产生 memory negative feedback；
- feedback 不机械修改 importance。

额外补了 conditional-schema boundary：`question` 缺 challenge 必须 fail；active memory 上 `revalidate` 必须 fail；两者均不能留下半状态。

结论：覆盖完整。

### 2.7 Learning / forgetting / discoverability

已覆盖：forgetting 只改变 discoverability；wall clock 本身不衰减；exact read refresh；L0/L1 不批量 refresh；validated use 更 durable；L0 exposure anti-monopoly；R/importance 单调保护。

Acceptance 只锁行为关系，不锁 `max(R, importance)`、FSRS 参数、stability 字段或具体 score。

结论：覆盖完整。

### 2.8 Namespace / ls / glob / grep

已覆盖 public path round-trip、symmetric roots、object kinds、mechanism path hidden、traversal containment，以及：

```text
ls   → direct child + fixed internal budget + no page 2
glob → path pattern + fixed internal budget + no page 2
grep → content evidence + fixed page budget + stable continuation
```

ls/glob/grep 没有 model-controlled `limit`。只有 grep 公开 `offset` continuation。真实 match/membership 不因 memory strength 变 false。

结论：覆盖完整。

### 2.9 Git history / failure / restart / concurrency

已覆盖：

- 正常 mutation 不审批；
- semantic mutation success 时已有 Git-backed recovery history；
- 不维护 `history.jsonl` / `change_history.jsonl` / hidden recycle；
- Git 不要求模型提供 reason/rationale/commit message；
- read-your-writes；
- catchable failure 不暴露伪成功 partial state；
- 并发成功结果等价于合法 sequential order；
- shared global scope 覆盖真实跨进程竞争；
- normal restart 保持 successful state；
- forced termination 中 unfinished mutation 是 durability non-goal。

真实 Git/filesystem/restart/multiprocess 可作为项目级 Manual/E2E candidate；CI 使用 deterministic resource/coordination ports 验业务 invariant。

结论：覆盖完整。

### 2.10 Lifecycle / presentation

已覆盖删除 promotion/demotion/generic signals；usage/retrievability 只直接影响 accessibility/discoverability。presentation 重点验证 candidate=recall cue、scope=applicability、dynamic item 不重复稳定 schema semantics，以及合法 next action affordance。

XML exact English wording 不作为整段 snapshot contract；Contract 可验证稳定 structure/required semantic fragments，AI Semantic Review 验证模型理解效果。

结论：覆盖完整。

### 2.11 Cognition persistence opportunity

已覆盖新形成/实质更新 cognition 的 write-before-forget 边界：主模型拥有 persistence judgment；core/archival guidance 位于 turn-level model context 的最小稳定 semantic owner；raw ToolResult 不自动成为 memory；已有 cognition 优先维护 canonical owner；没有 durable cognition change 时正常不 mutation。

该能力不通过“每轮固定 write”或 end-of-turn reviewer/hook 来机械保证。按照 `doc/ai-mds/agent-dev-rules.md`，优先使用 cognitive ownership + Prompt/Context + clear Tool affordance，并通过代表性 Agent Replay / Eval 验证真实模型是否在该记时会记、没该记时不乱写。若真实 Eval 证明简单 guidance 仍系统性失败，再讨论更强 orchestration mechanism。

结论：覆盖完整，且未引入新的固定 workflow / implementation coupling。
## 3. Test quality review

### 3.1 Stable behavior vs flexible wiring

通过。大多数 case 即使替换 storage/index/Git/learning implementation，Expected behavior 仍成立。

### 3.2 Public Given / When / Then

通过。正常状态主要用 public cognition/tool semantics 表达；只有 history failure、learning comparison、concurrency coordination 等公开接口不易自然制造的前置条件使用 Fault/Invariant seam。

### 3.3 Failure zero-side-effect boundary

通过。validation/schema/object-kind failure、Git-history failure、catchable commit failure均有“不得形成伪成功新状态”的 expectation。

### 3.4 Verification method boundary

通过。CI Automated 不要求真实 filesystem/process/network/LLM；真实 host/Git/restart/multiprocess 保留为 project-specific validation candidate。

### 3.5 Model-facing semantics

通过，但需要在 Freeze 后的 Test Strategy 明确 AI Semantic Review 的 rubric。它不能只问“模型觉得清不清楚”，至少要验证：

```text
restored block 被识别为 prior，不是 current answer
assistant proposal 不被洗成 user decision
candidate 不被当成 current-query relevance proof
scope 不被当成 authority hierarchy
questioned challenge 被理解为待验证 current issue
importance 不被理解成 frequency/current relevance
```

这些判据来自已冻结 behavior，而不是自由主观评价。

## 4. Remaining items that do not block Phase 4

以下属于 Engineering Design / wording calibration，不应阻塞 Acceptance Freeze：

- ls/glob/grep fixed internal budget 数值；
- exact ranking formula；
- importance enum 到内部 weight 的映射；
- retrievability/stability state schema；
- exact Glob implementation library / regex engine internals，只要满足冻结的 pattern/search examples；
- Git repo physical boundary、commit granularity、commit-message exact template；
- lock/queue/transaction implementation；
- hook/plugin SDK wiring；
- `brain_think_context` attribute 的最终英文措辞，只要保持同一 source/time/epistemic semantics。

## 5. Final reverse audit against original design intent

Freeze 前额外从最初设计目的反向检查，而不是只依赖 Scenario coverage：

| 最初问题 / 设计取舍 | v2 可观察行为闭环 |
|---|---|
| 模型权重不会随持续使用稳定进化，旧认知会因 context rot / compaction 退出工作面 | turn-level restored prior cognition；global/project/session core + session archival；restart 后保留成功 persisted cognition |
| 愿意用有限 context 成本换更少的重复犯错 | read-before-think anchor；bounded core + bounded L0，避免整个 corpus 常驻 |
| 不能预知未来要搜什么，也不能只靠 L0 猜 relevance | anchor 不预先知道 query；模型按当前 task 形成 retrieval intent；ls/glob/grep/cat 主动 discovery/read |
| 外部 memory 没有 latent trace，必须重新进入 context 才能影响推理 | L0/L1/L2 progressive disclosure + exact path read；retrieval truth 不被 forgetting/ranking 改写 |
| 旧记忆不能因持久化变成更高权威 | restored prior context / epistemic authority boundary；current user/evidence 可更新 affected cognition |
| 什么值得记没有 100% 机械规则，不能强制 write-before-forget | persistence judgment opportunity；主模型决定 durable cognition，raw ToolResult 不自动写，no durable change 时 no mutation |
| scope / importance / correction 属于语义判断 | 主模型拥有 natural scope、omission-cost importance、correction/question/failure attribution；机制只守 path/schema/invariant |
| 使用历史应影响未来可发现性，但不能污染 truth | exact retrieval / successful-use learning / passive exposure / retrievability + importance 的 monotonic protection |
| 正常维护不应被审批和冗余历史机制打断 | mutation 无强制审批；Git 独占版本历史与恢复；无 parallel history/recycle subsystem |
| MCP 也是 agent cognition infrastructure | guidance 位于 turn-level context 与最小稳定 semantic owner；Tool 提供能力、Agent 做判断；代表性模型行为留给 Replay/Eval |
| 工程故障不能让 cognition state 变得不可解释 | synchronous success boundary、serial-equivalent concurrency、fail/no partial success、restart boundary |

结论：未发现新的一级 cognition-loop 断点。剩余开放项均是 Engineering Design / calibration / wording / validation strategy，不需要回退 Phase 1–3。

这里需要明确一个验证边界：`53 Acceptance / 126 Scenario` 能证明 **brain 按冻结行为工作**，但不能单独证明最初产品取舍“增加有限 read-before-think context 能换来更准确、更连续、少重复纠正”已经获得真实收益。该目标应在 implementation 后通过代表性 Agent goal-level 对照 Eval 验证（brain enabled vs transcript-only/host-context control），同时观察 continuity/重复纠正/早期约束恢复与额外 context 成本。这个 Eval 不修改 Frozen Acceptance，也不预设无证据的统一数值阈值。

---

## 6. Review conclusion

当前 v2 已具备进入 **Phase 4 Acceptance Specification Freeze** 的条件：

- BDD 60 REQ / 126 Scenario 已完成高影响需求裁决；
- v2 public tool contract 已独立于 v1 建立；
- Specification by Example 53 cases 覆盖 126/126 Scenario；
- contract-specific boundary 已补齐；
- verification method 分层明确；
- 未发现必须回退 Phase 1 的公开行为歧义。

**Phase 4 Freeze 已于 2026-08-22 执行。** `brain-tools-contract.md` 与 `acceptance-spec-brain.md` 已成为 Phase 5 Engineering Design 的稳定输入；后续若需要改变 observable behavior，应先重新打开对应 BDD / Acceptance，而不是由 Design 反向改写。


---

## 7. 2026-08-24 Evidence-correction re-review

本节不改写 2026-08-22 历史审查；它验证本轮 BDD / Contract / Acceptance 重开并 re-freeze 后，新增/改判的 public behavior 仍具有清楚、可执行、不过度耦合 implementation 的 verification surface。

### 7.1 Current structure result

```text
BDD requirements: 62
BDD scenarios:    140
Acceptance cases: 59
Scenario coverage: 140 / 140
Missing scenario refs: 0
Extra/stale scenario refs: 0
Duplicate AC IDs: 0
```

### 7.2 New / materially changed verification boundaries

**Anchor failure locality — `AC2-ANCHOR-004`**

- required applicable core unavailable → primary anchor failure；
- one malformed archival item → warning + skip only that item；
- cycle/exposure persistence or Git history failure → successful restored context remains usable, with degraded diagnostic。

CI 可通过 deterministic core/item/auxiliary/Git fault seams覆盖；真实 host warning transport作为 Integration test / Manual candidate。

**Lossless exact read — `AC2-CAT-003`**

- `brain_cat` 只把完整 logical line算作 exact returned content；
- oversized line不能 clip 后前进 offset；
- transport blocked时提供 `brain_absolute_path` → ordinary filesystem read escape hatch。

CI 锁 coordinate/consumption/affordance；不锁内部 byte slicing algorithm。

**Filesystem alias — `AC2-PATH-004`**

- same-scope public alias follow real target并返回 canonical cognition identity/object kind；
- exact B2/B3 operation在 semantic kind/identity判断前 canonicalize；`mv(aliasOfX, X)` 等价 same-path；
- direct path + alias broad discovery dedupe；directory alias cycle有限终止；
- broken/inaccessible alias broad warning+skip、exact failure；
- cross-scope/outside alias拒绝。

Fake seam验证 semantic outcomes；真实 POSIX symlink / Windows junction 为 Manual/E2E candidate。

**Invalid regex — `AC2-GREP-003`**

invalid regex 是 input error，不等价 no-match；literal mode仍是显式不同 query mode。CI Contract + Acceptance 足够。

**Current state vs auxiliary/history — `AC2-HISTORY-001..002` / `AC2-CONSISTENCY-000..001` / restart**

- Markdown/core/C2 以及 **operation 明确承诺的 D1 identity/learning outcome** 决定 required semantic success boundary；
- overwrite fresh-learning、edit/mv continuity、adopt reinforcement 不能因本次 persistence failure在 success 后丢失；
- scope-cycle、cat exact-read refresh、anchor passive exposure 等 incidental learning 可以 fresh/degrade；
- Git 不参与 cognition success，也不参与 runtime serving gate；
- anchor只给 optional history一次 checkpoint opportunity；
- normal restart以 current working files为 truth；never-checkpointed successful cognition仍有效。

CI 应分别 fault required semantic port、auxiliary port、Git port，防止 fake 把三种 failure strength重新捆回一个 transaction。

### 7.3 Learning/calibration test boundary

Current DD 使用 `durability` 表达 validated-use reinforcement，并使用当前 D1/D2 calibration baseline；Acceptance仍只冻结可观察关系，不冻结字段名/公式为产品 contract。特别验证：

```text
same cycle-space across scopes
cross-scope move preserves currentAge
validated use increases durability
plain read does not increase durability
edit/mv preserve appropriate D1 continuity; overwrite resets old learning
protection = max(R, importanceFloor)
no secondary min(R,I) bonus
```

公式/数值的 pure unit test属于 Design translation test；若 calibration 改变，应先改 owning D1/D2 Design，再同步测试。

### 7.4 Current conclusion

当前 59 Acceptance cases 对 140/140 Scenario 完整覆盖；本轮新增行为都能使用既有 Contract / Acceptance / Fault / Manual-E2E 分层验证，没有要求新增 WAL、recovery manager、parallel history、semantic search 或 alias registry 等 subsystem。

因此 Phase 4 current Acceptance baseline 可继续作为 evidence-corrected Design re-freeze 的稳定输入。
