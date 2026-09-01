# brain v3 System Design

> **Layer:** System Design
> **Owns:** brain v3 的整体 black-box decomposition、跨黑盒 contracts、state ownership、major control/data flow、failure/concurrency boundary 与 cognition-loop composition。
> **Parent:** Frozen v3 Requirements / Public Contract / Acceptance。
> **Inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`、`../../design-rule.md`、`../../ai-mds/agent-dev-rules.md`。
> **Children:** 只在对应 black box 完成独立 Detailed Design review 后创建；当前迁移状态见 §9。
> **Status:** **Design Frozen (2026-08-30, v3 anchor-semantics re-freeze)**；canonical v3 System Design baseline；未受影响的 owner design 继承 v2 已冻结内容。

---

## 1. 本文职责与边界

本文只回答 **brain v3 整体怎样组成、各 black box 分别负责什么、它们怎样组合才能完成 Frozen cognition behavior**。

本文不拥有 leaf implementation algorithm。以下内容属于 Detailed Design owner：

- concrete module / package / type / API；
- companion schema 的字段级实现细节；
- accessibility 公式、baseline 数值、ranking/tie-break；
- discovery budget、pagination algorithm；
- concrete renderer wording / XML attributes；
- operation 内部 step order、side-effect boundary、error mapping；
- filesystem / Git / host adapter 的具体 API 与 coding constraints。

这些内容在迁移完成前仍以 `design-brain-runtime.md` 对应章节为当前 canonical Design baseline；迁移一个 owner 后，旧综合稿必须改成摘要 + canonical link，不能长期保留两份同义 truth。

**Compatibility boundary:** legacy version/data/layout/API 默认不是当前 Design constraint。只有 Frozen Requirements 或用户明确提出兼容目标时，才允许为兼容引入 migration、fallback、dual-read/write 或 legacy adapter；否则旧实现只作为 failure/evidence，不进入 current mechanism。

---

## 2. 原始目标与系统闭环

brain v3 的目标不是构建通用知识库，而是在模型参数不随项目持续演化、原始 transcript 会压缩/腐化/丢失注意力的条件下，用有限 read-before-think 成本恢复当前任务可能需要的持久 cognition，并给主模型保留自然的主动发现、读取和维护能力。

系统必须闭合这条循环：

```text
persistent cognition
        ↓
turn-level restore + bounded unsolicited cues
        ↓
current reasoning
        ↕
active ls / glob / grep / cat when more evidence is needed
        ↓
current cognition evolves
        ↓
model-owned persistence judgment
        ↓
write / edit / mv / rm / feedback when warranted
        ↓
persistent cognition + mechanism state change
        ↓
future turn restores from the resulting state
```

系统设计必须同时保持：

1. **model-native surface**：模型继续使用熟悉的 file-like primitives 与 Markdown；
2. **semantic ownership**：meaning、scope、importance、correction、persistence judgment 由主模型负责；
3. **deterministic mechanism**：namespace、state transition、ranking、bounded output、persistence coordination 等由程序保证；
4. **bounded cognition cost**：每轮恢复不会退化成全量 memory dump；
5. **continuity**：同一 cognition 的 edit/mv/use history 与 restart 后状态保持可解释；
6. **no hidden lifecycle workflow**：不因为 memory 内部 bookkeeping 把正常认知循环变成 approval/promotion/reviewer protocol。

---

## 3. Top-level black boxes

```text
┌──────────────────────────────────────────────────────────────┐
│ A. Integration Boundary                                            │
│ tools · generic MCP · supported host hook                    │
└───────────────────────────┬──────────────────────────────────┘
                            │ public/application invocation
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ B. Cognition application                                    │
│ operation orchestration · public-path semantics · identity   │
│ feedback semantics · discovery truth · anchor orchestration  │
└───────────────┬───────────────────────┬──────────────────────┘
                │                       │
                ▼                       ▼
┌──────────────────────────────┐  ┌─────────────────────────────┐
│ C. Semantic Cognition State  │  │ D. Accessibility            │
│ documents + semantic state   │  │ cycle/state/policy         │
│ current cognition truth      │  │ retrievability/scarcity   │
└───────────────┬──────────────┘  └──────────────┬──────────────┘
                │                                │
                └──────────────┬─────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ E. Deterministic Runtime / Persistence                       │
│ filesystem · Git history/checkpoint · coordination · ports   │
└──────────────────────────────────────────────────────────────┘
```

这五个 black boxes 是当前顶层 System Design owner。某个 black box 内部如果仍包含多个独立 responsibility / state owner / failure domain，进入 Detailed Design 前继续按 `design-rule.md §0.3` 分解。

---

## 4. Black-box responsibility 与 parent contract

### A. Integration Boundary

A 只负责把不同宿主的调用事实和触发方式接到同一 application semantics；它不拥有 cognition behavior。当前拆成两个二级 black boxes：

```text
A. Integration Boundary
│
├─ A1. MCP Tool Adapter
└─ A2. Hook-backed Restore Adapter
```

A parent 统一定义最小 invocation facts contract：

```text
InvocationFacts
  sourceRoot
  sessionId?
```

`sourceRoot / sessionId?` 是host/runtime提供的当前调用事实；E1把sourceRoot映射到稳定ProjectId，B1继续解释logical scope。`brainRoot`不属于invocation fact，而是composition root传给E1的必填runtime/storage配置。

#### A1. MCP Tool Adapter

**Canonical Detailed Design:** [design-brain-integration.md](design-brain-integration.md)。

**负责：**

- 暴露 Frozen public/model-visible MCP Tool contract；
- 把 MCP args + trusted host metadata 转成 invocation facts / application input；
- generic MCP mode 下暴露 model-visible `brain_think`，并保持 best-effort read-before-think guidance；
- 调用 B1/B2/B3/B4 对应 application use case；
- 把 application result/error 映射成 MCP `CallToolResult`。

Generic MCP 的 session fact resolution 当前保持：

```text
explicit session_id when the Tool contract provides it
→ trusted host tool-call metadata when available
→ otherwise no current session binding
```

A1 不把未知 session 伪造成 `default`，不从 storage path 反推 host/project/session facts，也不拥有任何 cognition/accessibility transition。

#### A2. Hook-backed Restore Adapter

**Canonical Detailed Design:** [design-brain-integration.md](design-brain-integration.md)。

**负责：** 在支持可靠 pre-reasoning/user-message hook 的宿主中：

```text
detect real host event
→ obtain trusted project/session invocation facts
→ call B4 Anchor / Restore Application
→ inject B4 actual returned context before substantive model reasoning
→ hide model-visible brain_think when this integration replaces explicit invocation
```

A2 可以与 brain core 同进程，也可以位于独立 plugin/adapter package；如果是分离进程，也可以通过内部 MCP 调用同一 server/application anchor。具体 wiring 不改变 semantic ownership。

A2 不得自行做 L0 ranking、cycle/exposure transition、memory parsing、persistence decision、latest-user-query analysis，或维护 host-specific `brain_think_context` wording。

#### A1-A2 sibling contract

```text
same B1-B4 application semantics
same B4 anchor behavior
same cognition meaning

A1 difference = model explicit Tool trigger
A2 difference = host automatic trigger/injection
```

**trigger 可以不同，brain behavior 不能分叉。** Host-specific integration 只消费 application boundary，不因此成为 cognition semantic owner。

### B. Cognition application

B 是 application-level cognition semantics 的 parent owner。它不直接作为一个“大模块”进入实现，而是先拆成四个二级 black boxes：

```text
B. Cognition application
│
├─ B1. Public Namespace & Object Semantics
├─ B2. Read & Discovery Application
├─ B3. Cognition Maintenance Application
└─ B4. Anchor / Restore Application
```

#### B1. Public Namespace & Object Semantics

**Canonical Detailed Design:** [design-brain-namespace-storage.md](design-brain-namespace-storage.md)。

**负责：** public logical namespace 的唯一解释入口，统一定义 scope root、core / memories / role / archival item 等 logical object kind，以及 public path / pattern 如何被解释成 logical target 或 search space。

B1 只做 **logical validation**。它必须在接触 filesystem 之前拒绝不属于 public brain language 的输入，例如：

```text
. / .. traversal
absolute filesystem path / drive-root form
separator embedded in opaque session id
unknown cognitive role
mechanism-hidden namespace
invalid exact-path / relative-pattern shape
```

合法结果是一个与 filesystem 无关的 logical value，例如概念上的 `LogicalBrainPath / LogicalSearchSpace`；B2/B3/B4 与 E1 都消费这个结果，而不是重新解析原始 public string。

**不负责：** physical filesystem path、canonical/real-path containment、symlink/junction behavior、document content、ranking、mutation I/O。

**Sibling contract：** B2/B3/B4 只消费 B1 已解析的 logical object / search space，不各自实现第二套 public-path grammar。

#### B2. Read & Discovery Application

**Canonical Detailed Design:** [design-brain-read-discovery.md](design-brain-read-discovery.md)。

**负责：** `brain_ls / brain_glob / brain_grep / brain_cat` 的 application semantics。ls/glob/grep 只在 `<scope-root>/memories/...` archival subtree 中做 active discovery；cat 只对 concrete archival document 做 exact read。适用 core 已由 B4 anchor 完整 resident，并由 B3 `brain_edit` 维护。B2 同时拥有 discovery cognition membership、archival exact logical-document read、public result composition，以及 ls/glob/grep 的 bounded public-output composition；通用 Tool execution 优先直接复用成熟 Agent Tool。

```text
public read/discovery request
→ B1 resolve logical target/search space
→ C1/C2 provide cognition/epistemic truth when needed
→ D1/D2 provide accessibility projection/selection when applicable
→ B2 compose deterministic public result
```

**边界：**

- match truth 由 B2 的 read/discovery semantics 决定；D2 只能在超 budget 时提供 accessibility-based scarcity ordering，不能改变 true-match predicate；
- `brain_cat` 决定“本次 concrete archival read 是否构成 exact retrieval event”，但 exact-retrieval 对 accessibility state 的计算和 transition 由 D1 拥有；
- `brain_cat` / `brain_grep` 使用的 logical-document line coordinate 属于 B2 public read/search semantics；它基于 logical text，不以 physical byte offset 作为模型坐标；
- B2 不直接写 physical filesystem / Git。

#### B3. Cognition Maintenance Application

**Canonical Detailed Design:** [design-brain-cognition-maintenance.md](design-brain-cognition-maintenance.md)。

**负责：** `brain_write / brain_edit / brain_mv / brain_rm / brain_feedback` 的 operation semantic transition 与 identity continuity：

```text
write create     → new cognition
write overwrite  → replacement cognition at same address
edit             → same cognition evolves
mv               → same cognition relocates/reclassifies
rm               → cognition exits active memory
feedback adopt   → validated-use event
feedback question→ set/replace current unresolved challenge
feedback resolve → clear current challenge
```

B3 负责把一次 maintenance action 解释成完整 application transition intent；C1/C2 拥有 resulting cognition/epistemic truth，D1 拥有 accessibility transition，E1/E2/E3 负责 physical persistence / coordination / staging。

**Sibling contract：** B3 必须通过 B1 解析 object identity；不能根据 Markdown semantic similarity 猜 identity，也不能把 storage layout 当 cognition identity owner。

#### B4. Anchor / Restore Application

**Canonical Detailed Design:** [design-brain-anchor-restore.md](design-brain-anchor-restore.md)。

**负责：** application-level `brain_think` / hook-equivalent restore：确定 applicable scopes、读取 required core + valid archival cognition、拥有 anchor/L0 capacity/projection packing、用 auxiliary snapshot形成 cycle-first D1/D2 projection、形成 `brain_think_context`，然后才 best-effort记录本轮 cycle/exposure 并触发 optional Git history opportunity。

```text
normalized invocation binding
→ determine applicable scopes
→ C/E1 read current cognition + auxiliary snapshot/fresh fallback
→ D in-memory advance/select accessibility projection
→ B4 compose + render prepared restored cognition work surface
→ context成立
→ E2 per-scope best-effort record cycle/shown exposure from reloaded current auxiliary state
→ E3 best-effort workspace checkpoint
→ B4 return context + separate diagnostics
```

**边界：** B4 拥有 anchor control flow 与 projection composition/packing；D1/D2 拥有 accessibility transition/selection policy；E1/E2/E3 拥有 physical persistence/coordination/Git mechanics。host-specific adapter 只触发 B4，不复制它。

#### B1-B4 composition rule

B1 是共享 logical object language；B2/B3/B4 分别对应“主动找/读 cognition”“维护 cognition”“每轮恢复 cognition”三类 application use case。B parent 只拥有它们之间的 contract，不再增加一个无独立 failure/ownership 依据的通用 transaction/result framework。

B1-B4 都不得自己重新定义 semantic meaning，也不得让 adapter/storage 各自复制 public-path、identity、feedback、ranking 或 anchor semantics。

### C. Semantic Cognition State

C 统一拥有“当前 cognition 是什么”的持久语义真相，但在进入 Detailed Design 前继续拆成两个二级 black boxes：

```text
C. Semantic Cognition State
│
├─ C1. Cognition Documents
└─ C2. Epistemic State
```

#### C1. Cognition Documents

**Canonical Detailed Design:** [design-brain-cognition-state.md](design-brain-cognition-state.md)。

**负责：**

- `global / project / session` 下的 core Markdown；
- archival Markdown cognition documents；
- archival `summary / importance / body` 的 current document truth；
- core vs archival 的 logical document schema，以及 Frozen contract 可确定的 structural validation；
- 单个 core 的 bounded-capacity invariant；具体阈值属于 C1 的 calibration-sensitive Detailed Design baseline；
- document create/replace/evolve/relocate/remove 后的 current content result。

**不负责：** scope / role / logical address identity（由 B1 拥有），也不负责 retrievability / exposure / ranking（由 D1/D2 拥有）。

#### C2. Epistemic State

**Canonical Detailed Design:** [design-brain-cognition-state.md](design-brain-cognition-state.md)。

**负责：** archival cognition 当前唯一 unresolved epistemic challenge，以及由它派生的 active/questioned status：

```text
challenge absent → active
challenge present → questioned
```

C2 不额外维护 `status` bit、challenge history、counter 或 timestamp。`questioned` 只是 current challenge 的 derived projection，不成为第二 truth。

#### C1-C2 sibling contract

C1 document truth 与 C2 epistemic truth 可以独立变化：

```text
brain_edit
→ C1 may change
→ C2 challenge remains unless a separate feedback operation changes it

brain_feedback(question/resolve)
→ C2 changes
→ C1 Markdown remains unchanged
```

跨两者的 continuity 由 B3 maintenance operation semantics 决定：

```text
write overwrite
→ replacement cognition
→ replace C1
→ clear replaced cognition's C2 challenge

mv
→ same cognition
→ preserve C1 + C2 continuity

rm
→ C1 + C2 both exit active state
```

C2 与 D1 可以共存于同一个 companion resource，但只是 storage co-location；**字段共文件不等于 failure semantics 相同。**

```text
C2 challenge
→ current epistemic truth
→ 当某个 public operation承诺 set/preserve/clear challenge 时，属于该 operation 的必要 semantic state

D1 accessibility
→ learning/discoverability state owner
→ write overwrite fresh-learning、edit/mv continuity、adopt reinforcement 等若属于 operation identity promise，则是 required resulting state
→ cat exact-read refresh、anchor cycle/exposure 等 incidental event才可 fresh/degrade

E1
→ physical companion codec

E2
→ 根据 application 本次 public promise协调 required semantic mutation；只有 incidental learning走 best-effort
```

因此不能再从“同一个 JSON”推出“任何 companion write failure 都必须回滚 Markdown”，也不能反过来把 explicit challenge 降格成可随意丢失的 learning state。

### D. Accessibility subsystem

D 统一负责“archival cognition 当前多容易重新进入有限 attention”这一机制，但在进入 Detailed Design 前拆成两个二级 black boxes：

```text
D. Accessibility
│
├─ D1. Accessibility State & Learning
└─ D2. Scarcity Selection Policy
```

#### D1. Accessibility State & Learning

**Canonical Detailed Design:** [design-brain-accessibility-state.md](design-brain-accessibility-state.md)。

**负责：**

- per-scope cognition cycle；
- per-item `ageCycles / anchorCycle / durability / exposure`；
- derived `currentAge / retrievability R`；
- exact retrieval、validated use、passive shown、direct engagement、cross-scope rebase transitions；
- 当前 calibration baseline。

D1 的 cycle 已经表示“该 scope 又经历一次真实 applicable cognition opportunity”，因此 global/project/session 使用同一 cycle-space decay formula；**没有 scope-specific decay weight / effectiveAge**。

```text
current state + current scope cycle + confirmed application event
→ next accessibility state / derived R
```

D1 不判断 event 是否成立，不决定 importance/questioned，也不让 auxiliary persistence failure反向否定 cognition。R不持久为第二 truth。

#### D2. Scarcity Selection Policy

**Canonical Detailed Design:** [design-brain-scarcity-selection.md](design-brain-scarcity-selection.md)。

**负责：** 当一个已经由 B 确定的 true candidate/result set 超过当前 bounded attention/output capacity 时，根据当前已确认状态生成 deterministic scarcity ordering。

输入概念上包括：

```text
true candidate/result set
+ D1 current accessibility projection
+ C1 importance
+ C2 questioned status when the selection mode uses it
+ selection mode
```

输出只是一条 stable ordered candidate sequence；D2 不修改 cognition/accessibility state，也不拥有 caller 的 output/L0 capacity。B2/B4 给出本 use case 的容量边界，D2 只在该边界需要 scarcity 时提供 ordering。

当前存在两类 selection mode：

**Passive L0：**

- 使用 retrievability protection + importance protection；
- passive exposure 形成 anti-monopoly pressure；
- questioned 只形成 proactive-trust pressure；
- scope 本身不产生 priority bonus。

**Active discovery scarcity：**

- 只有 B2 已得到 true results 且结果超 budget 时才参与；
- 使用 retrievability + importance protection；
- 不使用 passive exposure pressure；
- questioned 不过滤 true match；
- 当全部 true results 能进入 budget 时，D2 不得隐藏任何结果。

#### D1-D2 sibling contract

```text
D1 = 当前 accessibility 是什么、遇到事件后怎样变化
D2 = 当前状态已给定时，有限 attention 怎样分配
```

D2 应保持 selection-pure：被选中本身不等于 exposure/retrieval/use event。只有 B4 实际把 candidate 展示到 L0 后，才向 D1 发出 passive-shown event；B2 实际返回 concrete archival content 后，才按 B2 contract 发出 exact-retrieval event。

**边界：** cognition content / importance meaning 由 C1 拥有；challenge/questioned truth 由 C2 拥有；D1/D2 只消费这些已确认事实，不反向修改 semantic truth。

### E. Deterministic Runtime / Persistence

E 负责把已确定的 cognition/application semantics 落到真实 workspace，但三层责任必须分开：

```text
E1. Physical Storage Projection
→ filesystem layout / codec / single-resource I/O / containment / public alias resolution

E2. Persistent State Coordination
→ semantic mutation coordination + required current-state success boundary
→ auxiliary learning update coordination/degradation

E3. Auxiliary Git History
→ anchor-time best-effort workspace checkpoint only
```

#### E1. Physical Storage Projection

**Canonical Detailed Design:** [design-brain-namespace-storage.md](design-brain-namespace-storage.md) + [design-brain-cognition-state.md](design-brain-cognition-state.md)。

E1 owns physical projection/codec/I/O. Internal structural scope roots remain deterministic real directories；public scope workspace中的 symlink/junction可以 follow real target **only after same-scope containment proof**。若发生 public alias，resolved target 的 canonical public ref继续拥有 cognition identity/scope/role；broken/inaccessible alias在 broad discovery局部 warning+skip，exact operation失败；cross-scope/outside alias不暴露。

E1 只允许对“已知 typed scope + 已证明 same-scope resolved target”做受控 public-layout canonicalization；这不是 arbitrary physical-path reverse parser。

#### E2. Persistent State Coordination

**Canonical Detailed Design:** [design-brain-operation-coordination.md](design-brain-operation-coordination.md)。

E2 有两种不同强度：

```text
semantic mutation
→ process/global coordination
→ required business resources form complete current state
→ catchable multi-resource failure may restore operation-local before-state

auxiliary learning update
→ coordinated best effort
→ failure/subset failure loses only learning effect
→ no multi-file rollback transaction
```

Global 是当前真实跨 process shared semantic state，因此 successful global semantic mutations仍需 sequentially explainable / no silent lost update；project/session不增加跨进程 semantic lock。

**Git完全不在 semantic success boundary 中。**

#### E3. Auxiliary Git History

**Canonical Detailed Design:** [design-brain-git-history.md](design-brain-git-history.md)。

Git只在可用时提供 workspace history：

```text
current brainRoot working files
→ cognition/workspace truth

anchor checkpoint opportunity
→ best-effort capture current global/** + projects/**
→ commit if possible
→ optional history point
```

Ordinary write/edit/mv/rm/cat不需要 `stageAffected`，Git CLI/repo/index/commit failure不取消 cognition。Checkpoint不需要持有 E2 global lease，也不承诺精确等同某一个 anchor transition；它只是当时可形成的一份 workspace history snapshot。

#### Shared transition: Scope Initialization

Scope initialization不新增 Scope Manager。

- runtime serving前 global/project必须有真实 empty-or-current `core.md`；core creation是 required workspace state；
- reliable fresh current session在首次 anchor返回前必须有真实 empty core；创建失败 → anchor failure；
- scope-cycle JSON只是 auxiliary learning coordinate：missing/malformed时 fresh baseline，初始化写失败不否定 real core；
- B3 create-intent可以为 absent session先建立 required empty core，再完成 write/mv；
- pure B2 read/discovery不因 probing创建 session。

Logical validity仍不等于 physical scope existence；但 scope existence也不再依赖 `core + scope.json` mandatory pair。

---

## 5. State ownership 与 single source of truth

| Fact / state | Canonical owner | Composition rule |
|---|---|---|
| cognition Markdown/core existence/content | C1 + real workspace | E1 encodes bytes；B3 mutates semantics |
| public logical address / scope / role | B1 | E1 projects；public alias resolves back to canonical same-scope B1 ref |
| summary / importance | C1 | D2 consumes only |
| unresolved challenge / questioned | C2 | companion co-location does not make it disposable when public operation promises C2 continuity |
| cycle / age / durability / exposure / R | D1 | persistence strength由 event owner决定：B3 identity/feedback promises可 required；B2/B4 incidental learning可 fresh/degrade |
| ls/glob/grep truth + cat line coordinate | B2 | D2 only orders true archival results under scarcity |
| L0 capacity/projection | B4 | D2 orders；B4 packs/shows |
| semantic mutation success/concurrency | E2 | only required public state gets strong boundary |
| Git history checkpoint | E3 | optional history；never current truth/success prerequisite |
| raw invocation project/session facts | A1/A2 | B1 interprets binding |
| persistence judgment / cognition meaning | 主模型 | mechanism executes validated primitives |

All application state ports consume E1-resolved canonical public refs：exact operations canonicalize before object-kind/identity decisions；broad enumeration returns canonical refs + local diagnostics and dedupes resolved targets。Requested alias path is an input locator, not a second semantic identity。

Derived projection/cache/index不能演化成第二事实源。

---

## 6. Major control / data flows

### 6.1 Turn-level anchor

```text
A invocation facts
→ B1 current binding
→ if fresh reliable session: required real empty core
→ B4 read required cores + valid archival; auxiliary state snapshot/fresh fallback
→ D1 in-memory cycle advance / R for projection
→ D2 passive order
→ B4 pack/render context
→ context成立
→ E2 per-scope best-effort reload current auxiliary state + record cycle/exposure
→ E3 best-effort workspace checkpoint
→ return/inject context; route diagnostics separately
```

Single malformed archival item只影响自身 passive candidate；required core failure才使 restore失败。Auxiliary coordination/learning/history failure不会成为 primary read prerequisite，也不会吞掉已正确形成的 context。

### 6.2 Active discovery / exact read

```text
A → B1 → B2 truth/search/read → E1 real resources
→ C1/C2 result metadata
→ D2 only if true archival results exceed budget
→ B2 render
→ cat substantive content: best-effort D1 exact-retrieval persistence via E2
```

`brain_cat` exact lines不能 clip 后仍被计为 consumed；单行本身超过 exact transport时明确 blocked，并通过 `brain_absolute_path` → host ordinary file read 提供 lossless escape hatch。Learning refresh失败不取消已读取 content。

### 6.3 Cognition mutation / feedback

```text
A → B1 → B3
→ E2 coordinated current-state derive
→ C1/C2/D1 determine resulting semantics
→ B3 derives the post-success C1/C2/D1 hydration promised by this operation
→ choose the minimal required document/companion mutations that make that result true
→ E2 runSemanticOperation(required state)
→ only inert orphan cleanup / scope-cycle hints may remain best-effort
→ return success
```

B3 operation自己承诺的 learning identity 不能仅因字段属于 D1 就降级：overwrite fresh-learning、edit/mv continuity、adopt reinforcement 都属于 required result；cat/anchor incidental learning才使用 auxiliary path。Git不在这条 flow中。

---

## 7. Failure、concurrency 与 recovery ownership

### 7.1 Failure locality

```text
primary cognition/core/C2 required state failure
→ operation/anchor fails as appropriate

single malformed archival during broad restore
→ skip item + diagnostic

D1 cycle/exposure/retrieval persistence failure
→ lose auxiliary learning effect only

Git failure
→ lose/delay history only
```

Semantic multi-resource mutation的 catchable failure由 E2 operation-local before-state处理；不把这套 rollback扩张到 auxiliary state/Git。

### 7.2 Concurrency

- same process state-changing work serial；
- successful `@global` semantic mutations使用真实 cross-process coordination；
- project/session不因统一 Git repo而升级成 global semantic lock；
- Git technical contention只使 checkpoint失败/降级；
- pure discovery不增加 snapshot lock。

### 7.3 Recovery

Current working files是 restart truth。Hard-kill before operation success仍是 non-goal，不设计 WAL/journal/roll-forward。Companion/scope-cycle unavailable按 fresh auxiliary state继续；Git只有真实 commit存在时才提供额外历史恢复依据，不声称每次 replace/rm都必然可恢复。

---

## 8. Composition closure

顶层设计只有在五个 black boxes 合起来能解释完整 cognition loop 时才成立：

```text
A 让模型/host 能触达系统
↓
B 保持 public semantics 与 operation ownership
↓
C 保存“当前 cognition 是什么”
+
D 保存“当前多容易重新看到”
↓
E 给 C/D 的持久 state 提供 filesystem/Git/coordination guarantee
↓
B 在下一个 anchor 重新组合 C + D
↓
A 把 restored cognition 带回主模型工作面
```

任何 child design 如果要求：

- adapter 直接修改 storage；
- storage 自己解释 cognition meaning；
- accessibility state 成为第二 cognition truth；
- Git branch/workflow 反向决定 project semantics；
- tool 内部为了便利增加第二套 path/identity/feedback rule；

都属于违反 parent System Design，而不是允许的 implementation freedom。

### 8.1 Dependency direction

Phase 5B 必须保持以下依赖方向；具体 module/package 名可以在 Detailed Design 决定，但不能反转 owner：

```text
A1/A2 integration adapters
        ↓
B1-B4 application semantics / orchestration
        ↓
C1/C2 cognition state   D1/D2 accessibility domain
                         /
                        /
          E1/E2/E3 persistence/runtime ports & mechanics
```

这里不是要求 infrastructure 在 source-code import graph 中位于最底层的某个固定 package，而是冻结**semantic dependency**：

- A1/A2 只把宿主事实/transport 接到 B，不包含 B/C/D/E 规则的第二实现；
- B 调用 C/D domain capability，并通过 E1/E2/E3 ports 完成 I/O/coordination/history；
- C1/C2 与 D1/D2 的规则应能在不依赖 MCP/host adapter 的情况下独立测试；
- E1/E2/E3 可以依赖明确的数据 contract / codec schema，但不得回调或重新解释 B/C/D cognition semantics；E2 的 coordination callback 由 caller 提供，语义计算仍发生在 B/C/D owner；
- shared pure helper 可以被多个 child 使用，但 helper 不因此获得 semantic ownership。

因此允许 implementation 使用 dependency inversion / ports 让 source-code imports 满足工程需要，但任何 adapter/infrastructure convenience 都不能导致 semantic owner 反转。

---

## 9. Child design / migration map

当前不预建空的 Detailed Design 文件。Phase 5B 以已经确认的 leaf owner / shared transition 为**审查单位**；完成一个 cohesive area 的重新审计后，才决定它单独成文还是与紧密协作的 sibling 合并成一个 canonical Detailed Design document。

| Phase 5B review area | System owner | 旧综合稿主要 source | 进入 Detailed Design 前必须守住的边界 |
|---|---|---|---|
| integration adapters | A1 / A2 | [design-brain-integration.md](design-brain-integration.md) ✓ | trigger/wiring 可不同；B4 anchor semantics 不分叉 |
| logical namespace + physical projection | B1 / E1 | [`design-brain-namespace-storage.md`](design-brain-namespace-storage.md) ✓ | logical grammar 与 filesystem containment 分层；单向 B1 → E1 |
| cognition document + epistemic state persistence | C1 / C2 + E1 codec | [design-brain-cognition-state.md](design-brain-cognition-state.md) ✓ | Markdown、challenge、physical companion schema 各有唯一 owner |
| accessibility state / learning | D1 | [design-brain-accessibility-state.md](design-brain-accessibility-state.md) ✓ | event transition、derived R、cross-scope rebase 不与 selection 混合 |
| scarcity selection | D2 | [design-brain-scarcity-selection.md](design-brain-scarcity-selection.md) ✓ | 只排已成立的 true candidate/result；selection 无 state side effect |
| read / discovery application | B2 | [design-brain-read-discovery.md](design-brain-read-discovery.md) ✓ | match/read truth、paging/result contract 属于 B2；scarcity 调 D2 |
| cognition maintenance application | B3 | [design-brain-cognition-maintenance.md](design-brain-cognition-maintenance.md) ✓ | identity/feedback semantics 属于 B3；C2/D1 各算自己的 state transition |
| anchor / restore application | B4 | [design-brain-anchor-restore.md](design-brain-anchor-restore.md) ✓ | orchestration/projection/packing 属于 B4；D1/D2/E2/E3 只提供各自 child capability |
| persistent state coordination | E2 | [design-brain-operation-coordination.md](design-brain-operation-coordination.md) ✓ | semantic required state vs auxiliary best-effort boundary |
| auxiliary Git history | E3 | [design-brain-git-history.md](design-brain-git-history.md) ✓ | anchor-time best-effort workspace checkpoint；no Tool success dependency |
| scope initialization shared transition | runtime bootstrap + B3/B4 + C1 + E1/E2 | Integration + B3/B4/E2 canonical child docs ✓ | real core是 required workspace；cycle auxiliary；pure read/discovery不 lazy-create |

这张表冻结的是**review ownership 与依赖边界，不是最终文件数**。例如 B1/E1 很可能需要在一个 storage/namespace Detailed Design 中并列描述接口，但仍必须保留两个 semantic owner；C2/D1 可以共用一个 physical companion codec，但不能合并 semantic transition。

只有完成某个 review area 后，才创建对应 child document，并把 `design-brain-runtime.md` 中已经迁移的旧 section 改成摘要 + canonical link，避免双重 truth。

---
## 10. 当前 System Design completeness check

进入 leaf Detailed Design 前，顶层至少必须能稳定回答：

- 为什么系统需要 A-E 五类责任；
- cognition truth（含 challenge/questioned）、accessibility state、Git history、host facts 分别由谁拥有；
- anchor、active discovery/read、mutation 三条主控制流怎样穿过这些 black boxes；
- MCP / host integration boundary 为什么不能拥有 cognition semantics；
- project/session/global 的真实共享边界在哪里；
- 五个 black boxes 怎样重新闭合最初的 persistent-cognition loop。

当前 Phase 5A review 已能稳定回答上述问题，未发现仍需新增的一级 subsystem / state owner。**System Design 进入 reviewed baseline，Phase 5B 可以按 §9 owner map 开始。**

如果后续 Detailed Design review 暴露新的一级 responsibility 或证明当前 owner boundary 不成立，先修改本文再继续 child design；不要在 leaf function 中静默改变 parent architecture。
