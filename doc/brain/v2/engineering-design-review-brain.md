# brain v2 Phase 5 Engineering Design Holistic Review

> **状态：Review Finding / non-normative；用于 Design Freeze 前审查，不是新的 Requirements / Public Contract。**
> **日期：2026-08-22**
> **审查基线：** 最初目标与用户关键取舍 + Frozen BDD / Public Contract / Acceptance + 当前 `design-brain-runtime.md`。

## 1. 审查问题

本轮不再只问“53 个 Acceptance 是否都有 Design section”，而是反向检查：

```text
最初目标 / 核心取舍
→ BDD 是否真的表达了必要 What
→ 当前 Design 是否以最小充分机制实现这些 What
→ 是否出现局部 subsystem 完整、但原始 cognition loop 反而受损
→ 是否有 calibration / lower-level detail 被过早冻结成 architecture
```

最初目标以用户后期明确纠正后的表述为准：

1. 当前模型不会像人一样在长期使用中自然持续进化，因此愿意支付**有限、稳定的 read-before-think context 成本**，换取更准确、更连续的思考，减少做错后反复纠正；
2. read-before-think 在 host 能支持时可以机械触发；generic MCP 只能 best effort；
3. write-before-forget 不能机械强制，因为“什么值得记住”是语义判断；系统只能让主模型在每轮保有清楚的 persistence judgment opportunity；
4. session archival 必须能接管长会话 transcript 因 compaction / attention dilution / context rot 丢失的细节；
5. 机制管结构、约束、确定性 correctness；主模型管 meaning、scope、importance、correction、persistence；
6. 优先使用模型已有 `ls/glob/grep/cat/write/edit/mv/rm` 训练先验，不凭空制造 private protocol；
7. memory strength / importance 在有限 attention 中影响 discoverability，但不能改变 retrieval truth；
8. current cognition 不依赖 Git；需要历史时只使用 Git 这一种 optional history mechanism，不再叠加 approval / JSONL / recycle 等 parallel workflow；
9. 最小充分机制优先，不为理论完备性提前设计。

## 2. 总结结论

当前 v2 **架构方向总体正确，BDD 主体也仍然成立**。没有发现需要重新推翻 scope/core/archival、public tools、query-independent L0、model-owned persistence 等一级决策；Git 已进一步收敛为 optional auxiliary history，而不是 cognition success boundary。

本文件记录的是当时的 Holistic Review findings。后续 Phase 5B/convergence 已逐项裁决这些 findings；**以下旧 blocker 不再自动代表当前未解决问题，以每节顶部“后续状态”为准**。当前 Freeze 结论由 `design-brain-runtime.md` verification index + canonical System/child Design 的最终 audit 决定。

## 3. Freeze blocker A：read-before-think 的 context economics 还没有真正闭环
> **后续状态：Resolved in Phase 5B convergence.** Core 仍有明确 capacity；B4 用 `L0_MAX_CANDIDATES=10` + candidate children rendered-byte envelope约束 passive cues；public path/session identifier也有 namespace bounds。C1 **不再为 summary 增加无证据的独立 256-code-point hard limit**：summary只需 non-empty/current gist，过长 presentation由 B2/B4 outer output envelope显式 bounded/omit/clipped representation处理。这样 bounded context 由真正的 presentation owner保证，不把外层 budget反向变成 cognition semantic schema。

### 3.1 当前 gap

BDD 已冻结：

```text
all applicable cores resident
+ bounded/small L0 cues
+ archival on-demand discovery/read
```

当前 Design 只有：

- 每层 core 的 `CORE_DOC_MAX_CHARS` calibration；
- discovery tools 的 result budget；
- L0 ranking relation；

但**没有独立定义 L0 max-items / rendered-size budget，也没有定义整个 anchor 的 worst-case context envelope**。

更直接的问题是 archival `summary` 目前只要求 non-empty，没有 bounded-gist validation。一条极长 summary 可以绕过“少量 L0 item”的数量限制直接击穿 context economics。

### 3.2 为什么这是原始目标问题，而不是参数问题

最初 tradeoff 不是“无条件把 prior memory 塞进 context”，而是：

> 牺牲**有限的一点** context lightweightness，换取准确性。

因此 bounded anchor 本身就是核心机制，不只是 calibration 值。

### 3.3 推荐 Design correction

Freeze Design 只需要定义机制形态：

```text
Core:
  every applicable logical core resident
  each core bounded

L0:
  independent maxCandidateItems
  + maxRenderedSize

Compact model-visible fields:
  summary bounded as gist
  questioned challenge bounded as concise unresolved-state explanation

Anchor envelope:
  worst-case = applicable core bounds + L0 render bound + wrapper/guidance bound
```

精确字符/byte/token 数值仍然属于 calibration，不能进入 BDD/public schema。

## 4. Freeze blocker B：anchor failure policy 目前没有服从 read-before-think 的第一责任
> **后续状态：Superseded again by 2026-08-24 evidence correction.** 当前 BDD/Acceptance 明确区分 primary restore failure 与 auxiliary degradation：required core失败仍是 anchor failure；单条坏 archival 局部 skip；cycle/exposure/Git failure不吞已形成 context，而通过与 cognition context 分离的 diagnostic表达。A2只消费同一个 `AnchorResult`，不自建 retry/dedupe/fail-open policy。见 B4 + Integration canonical Design。

### 4.1 当前 Design

当前 `runAnchor` 将：

```text
restore/select
→ update cycle/exposure
→ Git commit
→ only then return context
```

并写明 commit 未到 success boundary 时不返回看似成功的 restored context。

现有 DSH AutoThink 实现还提供了一个真实 failure evidence：MCP `isError` 路径可以直接跳过 injection；如果不显式阻断 step，模型会在没有 restored cognition 的情况下继续。

### 4.2 核心责任

hook-backed read-before-think 的首要 guarantee 是：

```text
substantive reasoning cannot silently proceed
as if prior cognition had been restored
when anchor actually failed
```

learning cycle/exposure bookkeeping 是二级责任，不能把失败隐藏成“正常无 memory turn”。

### 4.3 两个合法方向（需需求决策者裁决）

**Option A — fail closed（推荐最小 baseline）**

```text
internal transient retry
→ anchor still fails
→ current host step visibly fails/blocks
→ do not silently continue reasoning
```

优点：最简单；不引入 partial-success/degraded-anchor contract；完全保持“准确优先于便利”的原始取舍。

**Option B — explicit degraded restore**

如果 committed prior cognition 本身仍可安全读取：

```text
learning/Git update fails
→ rollback state update
→ return/inject committed prior cognition
→ explicitly mark anchor-state persistence failure/degraded mode
→ do not claim successful cognition-cycle state transition
```

优点：尽量保住 prior context；缺点：引入新的 failure presentation / partial anchor semantics，需要额外 Contract/Acceptance 裁决。

当前推荐 **Option A**，因为它不需要重开 Frozen BDD；只有真实 Agent/host failure evidence 表明 fail-closed 代价过高，再考虑 Option B。

## 5. Freeze blocker C：统一 Git repository 下的 observation/concurrency gate 不完整
> **后续状态：Superseded by Frozen boundary review.** 现行 BDD/Acceptance 只要求并发 **state-changing operations** 的 success 可 sequentially explain、以及 mutation success 后 read-your-writes；没有要求 concurrent pure `ls/glob/grep` 对正在 apply 的 writer 提供 snapshot isolation。E2 因而只串行 state-changing operations；pure reads 可 overlap，若撞到 malformed/inconsistent resource则 fail loud，不为理论 snapshot guarantee增加 read/RW-lock。旧 §5.4 的“all public observations one store gate”不再是 current Design truth。

### 5.1 Current-process read can observe mutation split state

当前 Design 只把 state-changing operations 放进 in-process mutation queue。

但 `brain_ls / brain_glob / brain_grep` 虽不改 learning state，仍会观察 filesystem。若它们与同一 process 的 multi-file `mv/write/sidecar` mutation 并发，就可能看到中间 working-tree state。

这与 `REQ2-CONSISTENCY-001 / CONCURRENCY-001` 的 serial-explainable public observation 不一致。

### 5.2 Global read also needs coordination

global mutation 由多个 project processes 共享。只锁 global writers 不够；global read-only discovery 若在 writer 的多文件 transition 中间观察，同样可能看见 split state。

### 5.3 Shared working tree changes startup recovery semantics

一个 canonical repo 的 working tree 被多个 project processes 共用：

```text
project B writes own path
→ before B Git commit
→ project A restarts
```

此时 repository dirty 是**正常 live transaction**，不是 crash residue。

因此 startup 绝不能把“repo dirty”整体解释成 unfinished state 后做 repo-wide reset/restore，否则会破坏另一个 live project operation。

### 5.4 推荐最小 correction

```text
within one project MCP process:
  all public store observations pass one store gate
  simplest baseline = serialize all brain operations
  (future evidence才需要 RW optimization)

global scope:
  every operation that observes or mutates global current state
  participates in global cross-process gate

startup/recovery:
  never repo-wide clean/reset because repo is dirty
  only reason about current owned project subtree
  and global subtree while holding global gate
  unknown dirty state → fail loud rather than overwrite other owners
```

Git adapter 只冻结 “affected-path commit / no unrelated state capture”。当前文档中的显式 `git add → commit` 不应成为 Design invariant；共享 index 的具体规避方式留 lower-level adapter。Local Git 2.53 probe 已验证 `git commit --only -- <path>` 在未预先 `git add` 时可提交 working-tree path，且两个 disjoint project paths 的并发 path-only commits可形成连续 history；这只作为 implementation evidence，不冻结具体 command sequence。

## 6. Freeze blocker D：public Markdown 允许 duplicate/reserved semantic owners
> **后续状态：Superseded by Frozen Public Contract.** `brain-tools-contract.md §3` 已明确：brain 只消费 `summary` / `importance`，additional frontmatter 不获得 mechanism semantics，且**不建立 reserved-key blacklist**。Path/C2/D1 仍是 mechanism truth owner；用户 Markdown里出现同名普通 metadata不会覆盖这些 owners。旧建议若实施反而会改变 Frozen public Markdown contract，因此不采纳。

当前 archival validator 接受 unknown additional frontmatter keys，只是不把它们当 runtime semantics。

这会允许：

```yaml
type: decision
scope: global
status: active
id: ...
retrievability: ...
```

即使 runtime 忽略，模型 exact read 时仍会把这些字段看成 cognition data；之后 mv / feedback 可能让它们与 canonical path / companion state 冲突。

推荐：允许未来业务 semantic metadata 的扩展空间，但**明确拒绝 reserved owner keys**，至少包括：

```text
path / scope / type
status / challenge
id / cognitionId
retrievability / stability|durability / exposure
cycle / anchorCycle / ageCycles
```

`summary / importance` 仍由 public Markdown 拥有；path owns scope/type；companion owns unresolved challenge/accessibility state。

## 7. Freeze blocker E：logical core initialization 未定义
> **后续状态：Resolved, then simplified in 2026-08-24 correction.** Scope existence/maintainability由真实 `core.md`承担；global/project required core在 bootstrap建立，fresh reliable session在 first anchor前建立，B3 create-intent可建立 session core。Scope cycle只是 auxiliary learning coordinate，missing/malformed时 fresh；Git不参与 scope initialization success；pure B2 read/discovery不 lazy-create。

Public Contract 已冻结：

- core 由 `brain_edit` 维护；
- `brain_write` 不接受 core；
- ordinary edit target 必须存在。

因此新 global/project/session scope 必须有明确的 **logical core singleton** 语义，否则第一次维护 core 会落入“没有合法 create primitive”。

推荐冻结：

> **后续状态：Superseded.** 每个 valid scope 初始化时创建真实空 `core.md`；适用 core 每轮已由 anchor 完整 resident，只通过 `brain_edit` 维护，不再由 `brain_cat` 读取。`brain_ls/glob/grep` 的 active-discovery domain 仅属于 `memories/` subtree。

## 8. Recommended simplification A：`status` 可由 current challenge 推导
> **后续状态：Resolved.** C2 只持久 `challenge?`；`active/questioned` 由 challenge existence派生，不再持久 status bit。

当前 companion 同时存：

```text
status: active | questioned
challenge?: ...
```

但 Frozen semantics 只有：

```text
questioned ⇔ current unresolved challenge exists
otherwise active
```

因此 persistent `status` 是可派生 duplicate state，还额外制造：

```text
active + challenge
questioned + no challenge
```

两种非法组合。

推荐最小 schema：

```text
challenge?: non-empty concise current unresolved challenge
```

presentation：

```text
challenge present → status=questioned
challenge absent  → status=active
```

`question` set/replace challenge；`correct/revalidate` clear challenge；`correct` on no challenge remains legal idempotent no-op。

## 9. Recommended simplification B：不要在 Frozen Design 主干冻结 calibration formula / encoding
> **后续状态：Partially superseded by later methodology decision.** D1/D2/core/discovery/L0 的当前数值与公式是 calibration-sensitive Detailed Design baseline，允许 evidence-driven Design-first调整；但不再把 package/version、host key、retry timing、project hash等 semantic-neutral选择强行冻结。具体以各 canonical child为准。

当前以下内容已经比 BDD 所需更具体：

```text
R = stability / (stability + age)
stability += 1
importance floor = .25/.50/.75/1.00
exposure divisor = 1+n
questioned divisor = 2
maxRecords = 64
maxRenderedUtf8Bytes = 8192
CORE_DOC_MAX_CHARS = 4000
cat default = 100 lines
projectKey = cryptographic hash(canonicalProjectRoot)
```

其中关系/职责有设计价值，但**精确函数、数值、physical key encoding 是 calibration / implementation starting point**。

推荐 Freeze Design 只保留：

```text
R = monotonicDecay(age, durability)
validatedUse → durability non-decreasing and more persistent than plain read
importance and R independently monotonic protect scarcity
time unit = applicable cognition cycle
exposure only pressures passive L0
project key stable + collision-safe + mechanism-only
budgets fixed by mechanism, not model-controlled
```

具体 baseline 可以放入单独 calibration/implementation appendix；这样真实 Eval 调参数/换简单公式不需要假装“架构变更”。

另外内部角色建议用 `durability` 而不是复用带 FSRS 强语义的 `stability`，除非 implementation 确实采用兼容 Stability 定义。

## 10. Recommended simplification C：Git recovery 要兼顾 human inspectability
> **后续状态：Resolved differently, then simplified further on 2026-08-24.** E1用 canonical project path projection，不引入 projectKey/registry；E2完全退出 Git；ordinary cognition mutation不 stage。E3只在 anchor best-effort capture current workspace checkpoint，Git不可用/失败不影响 cognition或 startup serving；working files始终是 current truth。

Git 已被用户选择为唯一 history/recovery owner，因此 physical tree 不只是机器私有数据库；用户可能直接通过 Git diff/log/restore 理解历史。

`projectKey=纯 hash` 虽安全但降低可读性。Freeze Design 不应规定 hash；只规定 stable/collision-safe mechanism key。实现可以采用 readable basename + short hash 等方式，在不增加 registry 的情况下兼顾 debug/recovery。

## 11. Stable guidance 与 dynamic anchor 的复核

本轮最初怀疑 §8 把太多 stable guidance 重复进每轮 anchor。复核 Frozen Public Contract 后，这一点**不再列为 Freeze blocker**：persistence judgment guidance 的确需要每 cognition cycle 稳定在场，而且当前 Design 已经把共享语义放 collection/wrapper owner，而不是每 candidate 重复。

仍建议实现保持一个 canonical guidance source，避免 generic tool description、hook stable context 与 rendered anchor 三处各写一份稍有差异的长期真相。具体 host 可以选择最合适的 stable instruction surface，但必须保持同一 semantics。

## 12. BDD 是否需要重开

> **2026-08-24 实际后续：本节当时结论已被后续 evidence correction supersede。** BDD / Public Contract / Acceptance 后来确实重开并 re-freeze，用于明确 anchor failure locality、lossless oversized cat、filesystem alias、invalid regex、Git-optional history 与 auxiliary-state failure boundary；当前为 62 REQ / 140 Scenario / 59 Acceptance。

当前整体审查结论：**暂不需要重开 Frozen BDD / Acceptance。**

上述 A/C/D/E 都已经能从现有 BDD 的 bounded context、canonical owner、consistency/concurrency、core singleton 语义直接推出；问题是 Design 未完整落实。

anchor failure 的 Option A（fail closed）同样可直接由现有 read-before-think + failure loud guarantee 推出，不新增 public partial-success contract。

只有选择 Option B（explicit degraded restore）时，建议最小重开 Contract/Acceptance，明确 degraded anchor 的 model-visible failure semantics。

## 13. Replay / Test additions required before Freeze

现有 12 个 Replay case 保留，并增加至少以下目标：

### R13 Long-session transcript takeover

早期 session detail 已离开 active transcript/被 compaction；session core 保持目标/进度，archival 保存较早但仍重要细节。后续任务出现相关 cue 时，模型能通过 L0/discovery/cat 恢复细节，不需要用户重新纠正。

### R14 Hook anchor failure is never silent

【历史审查项，已被 §4 后续裁决 supersede】当时计划模拟 anchor store/Git failure；当前不再把 hook failure policy 作为独立 Freeze blocker。

### Fault/Integration: read-vs-mutation serialization

在 mv / document+companion multi-file mutation 期间并发 ls/glob/grep，不允许成功 read 暴露任何无法由合法顺序解释的 split state。

### Fault/Integration: shared repo startup isolation

project A restart 不得 reset/overwrite project B 正在进行的合法 working-tree transition。

## 14. Review decision

**历史结论：当时应退回 Holistic Review / Freeze Paused。当前该结论已被后续 owner-by-owner Detailed Design + convergence review supersede；最终状态以 verification index 的 Freeze audit为准。**

当前 closure：上述历史 findings 已被 owner-by-owner Design 与 2026-08-24 evidence correction重新裁决。当前上游 BDD/Contract/Acceptance 已 re-freeze；Design re-freeze 只需验证 canonical owners 对 59/59 Acceptance 无冲突、支持层无 current-stale instruction。若 checklist通过，后续工作转 implementation/tests/Replay/Eval。
