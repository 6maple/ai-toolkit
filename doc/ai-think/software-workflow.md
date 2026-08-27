# Software Workflow：从需求到验收的可执行流程

> **用途：规定软件任务的阶段顺序、每个阶段的产出、完成条件和回退关系。**
>
> 软件领域中跨阶段稳定的 truth、Design 和 Test 原则见 [`software-core.md`](software-core.md)。跨领域的 evidence、因果、责任和最小充分原则见 [`core.md`](core.md)。
>
> 本文是一条可恢复、可审查的工作状态机。相邻阶段可以在同一次工作中完成，但每个适用阶段的 truth、产出和完成条件仍分别成立。合并的是执行开销，不是阶段责任。
>
> `Frozen`、`Gate`、`material`、`production`、`Red / Green` 和 `Fake / Stub` 的统一含义见 [`software-core.md` §0](software-core.md#0-本文关键术语)。执行任务时先读本文 §0，选择入口后只展开当前阶段、相邻 Gate 和它们引用的 owner；不要求每次从头重读全部阶段。

---

## 0. 唯一执行入口

当软件能力进入稳定规格与交付阶段，使用下面这一条主流程：

```text
恢复背景与当前阶段
→ Requirements / BDD
→ Public Contract / Experience（适用时）
→ Example & Coverage Design
→ Test Design Review
→ Acceptance Freeze
→ System Design
→ Detailed Design
→ CI Test Draft
→ Test Review
→ Minimal Fake Green（适用时）
→ Production Baseline / Red
→ Double-Loop Implementation（存在实现差异时）
→ Production Green
→ Compliance + Original Intent Review
→ Readiness / Acceptance
```

Implementation Plan 不是这条 truth flow 的必经层。复杂执行确实需要时，它从 Frozen Acceptance + Design 派生，只组织 slices、依赖和交付顺序。

这条流程是唯一的软件 delivery flow。Alignment 只负责检查能否转换阶段，不是第二条流程，也不创建新的 truth layer。

每次准备采取 material 行动、转换阶段或宣布完成时，只执行下面这份控制检查：

```text
1. Target：当前真正目标、范围和 non-goal 是什么；Visible Action Boundary 与 Authorized Execution Boundary 分别是什么？
2. Stage：当前处于哪个阶段，为什么从这里进入？
3. Evidence：已验证事实、可靠推断、未验证材料和未知分别是什么？
4. Owner：本阶段读取和产生的 canonical truth 在哪里？
5. Commitments：哪些已确认要求必须保留，哪些候选尚未进入范围？
6. Gap：是否仍有会改变方向或 acceptance result 的 material gap？
7. Intervention：没有 gap，还是由 AI 调查、decision owner 裁决或等待外部 evidence？
8. Gate / Next：什么 evidence 证明当前阶段完成；产物变化时 §1.3、任务关闭时 §1.6 是否满足；通过后进入哪里，或为什么保持打开？
```

简单任务可以在一次工作中回答这些问题，不要求输出模板。复杂、需要交接或容易偏离的任务才显式记录完整 Alignment State。后文只说明怎样取得这八项需要的 evidence，不得建立另一套与本节并列的控制面或执行流程。

---

## 1. Alignment readiness 是阶段转换机制

Alignment readiness 用于确认 AI 正在解决正确的问题、完整保留已经成立的要求、没有擅自扩大范围，并且具备转换当前 Gate 所需的 evidence 与授权。它不是新的 truth layer，也不替代 Requirements、Acceptance、Design 或验证证据。

本文严格区分五件事：用户明确确认目标或选择；上下文为 AI 提供唯一推断依据；用户把有界专业判断委托给 AI；具体行动已经按要求展示；具体行动已经获得执行授权。它们可以共同支持 Gate，但不能互相改名或互相代替。只有能够指向 decision owner 对当前这一对象作出的明确要求、批准、授权、拒绝或带条件裁决，并记录为 `explicit-owner` 时，才可以按实际极性描述用户的决定；提问、担忧、候选、事实陈述或没有回应不成立。`context-derived`、`delegated-solution` 和 AI 的专业判断只表示“有依据继续”，不能描述成“用户已经明确同意”“已与用户达成一致”“用户认可”或其他等价说法。行动已经展示不自动表示已经授权，目标或结果进入范围也不自动表示所有实现手段都已获得静默执行授权。

Alignment readiness 主要防止：

```text
做偏
→ 对目标、行为、责任或边界理解错误

做少
→ 已确认要求或承诺在下游被遗漏

做多
→ 未经确认增加功能、机制、范围或外部影响
```

### 1.1 持续维护轻量 Alignment State

Alignment State 就是 §0 的八个控制项，不再建立另一份模板。执行者只维护当前判断需要的内容，其中：

- **Target** 包含真正目标、所需深度、scope、boundary、non-goal 和相关 acceptance context，并分别维护：
  - **Visible Action Boundary**：已经向用户实际展示的 artifact、组件、外部状态和 action category；只证明可见，不证明可执行；
  - **Authorized Execution Boundary**：当前允许实际执行的 mutation；每项同时记录 §1.3 规定的授权依据，不能与 Visible Action Boundary 合并或取并集；
- **Evidence** 区分 `user-intent` 与 `domain-fact`，并标明已验证事实、可靠推断、未验证材料、假设和未知；
- **Commitments** 只使用下面五种状态：
  - `proposed`：已提出，但尚未由正确 owner 确认进入当前范围；
  - `active`：已基于明确依据进入当前范围，下游必须保留；
  - `fulfilled`：本任务已经落实该 Commitment，并有匹配的完成 evidence；
  - `superseded`：已被后续明确裁决替代，并记录替代关系；
  - `parked`：明确不属于本轮路径或范围，并记录以后重新进入的条件；
- 每个 `active` Commitment 同时记录 owner 和成立依据，依据只使用：
  - `explicit-owner`：正确 owner 已对当前对象明确表达要求、批准、授权、拒绝或带条件裁决，并记录对象、极性和条件；提问、担忧、候选或事实陈述不属于该依据；
  - `context-derived`：通过 [`core.md` §4.1](core.md#41-ai-先完成能够完成的调查和专业判断) 的唯一推断测试；
  - `delegated-solution`：属于已明确委托给 solution owner 的决定范围；
  - `canonical-source`：直接来自当前适用的 canonical Requirement / Contract / Design；
- Commitment 的成立依据回答“为什么该结果或选择可以进入范围”，不单独证明某个具体 mutation 已向用户展示或可以执行；动作可见性和执行边界按 §1.3 判断；
- **Gap** 只使用 `none`、`non-blocking unknown` 或 `blocking material gap`；Gap 不是 Commitment 状态；
- **Intervention** 只使用 `none`、`AI 调查或执行`、`decision owner 裁决` 或 `等待外部 evidence`；Gap 为 `none` 时 Intervention 也必须为 `none`；
- **Gate / Next** 使用 §1.5 的统一 Gate 结果，并记录下一阶段或保持打开的原因。

`fulfilled` 只表示“本任务已经履行”，不表示对应 canonical Requirement、Contract 或 Design 失效。`fulfilled`、`superseded` 和 `parked` 是任务关闭时允许的 Commitment 终态；`proposed` 和 `active` 都不是关闭状态。

在任务真实结果尚未落实前，不能因为某项 Requirement 已写入文档、某个阶段已结束或某个测试已通过，就提前把对应范围 Commitment 标成 `fulfilled`；它继续保持 `active` 并参与下游 Alignment Check。只有任务结果已经满足该 Commitment 且有匹配 evidence 时，才在 Closure Alignment 中转为 `fulfilled`。

这份状态可以只存在于当前会话。只有状态变化会影响用户判断、阶段转换或交接时才展示，不要求每轮重复完整模板；但 §1.3 规定必须展示的 Visible Action Boundary 不能以“状态未变化”为由留在内部，Authorized Execution Boundary 也不能仅由内部推断成“用户已授权”。

用户确认能够确定 `user-intent` 和授权，不能把未经验证的 `domain-fact` 变成事实。Domain fact 由观察、测试、可靠资料或其他匹配的 evidence 验证。

用户明确提出且语义清楚的规范性要求、价值选择和授权决定，记录为 `active / explicit-owner` Commitment；用户对现有系统、外部事实或历史状态的描述进入 Evidence，按重要性验证。一个消息同时包含两类内容时分别记录。

### 1.2 Intent-first：用户要求先理解时停在理解阶段

用户表达以下意图时，进入 intent-first：

- “先理解我的意图”；
- “先复述一下”；
- “先讨论，不要改”；
- “一步步来”；
- “先审查，我确认后继续”；
- 其他明确要求先达成理解、再采取下游行动的说法。

本轮只做理解当前请求所需的安全调查，然后给出一个可纠正的 intent frame：

```text
表面请求
→ 推断出的真正目标
→ 支持该推断的上下文 / evidence
→ 当前深度、范围和 non-goal
→ 最关键的 material gap（如有）
```

Intent-first 不创建下游 Requirements、Design、Plan、代码或其他交付物。理解足够且用户确认继续后，再进入相应软件阶段。

### 1.3 在 material move 前对齐，在 Gate 前审查实际产物

Alignment Check 是嵌入当前阶段的转换检查，不是需要单独排期、产出或从头执行的第二条流程。只在以下时机检查一次：

- 新目标开始；
- 用户作出 material correction；
- scope、方向或当前讨论层级变化；
- 准备提出重大事实结论或 Design 方向；
- 准备通过当前阶段 Gate；
- 准备进入 production implementation；
- 准备宣布阶段或任务完成。

检查内容固定为：

```text
Target 是否仍是同一个目标和范围？
→ active Commitments 是否全部保留？
→ 下一决定依赖的 premise 和 evidence 是否成立？
→ 准备执行的 mutation 是否落在 Authorized Execution Boundary 内？
→ material Design 和行动是否落在 Visible Action Boundary 内？
→ 当前 Gap 与 Intervention 分类是否准确？
→ 当前 Gate 是否已有匹配的完成 evidence？
```

状态没有 material 变化时，直接复用既有 Alignment State 并继续，不机械重问、重复复述或创建额外文档。发生变化时只更新受影响的控制项，并明确 supersede 或 park 已离开主路径的内容。这种复用不豁免下面的行动可见性检查。

#### 行动发生前：Action Visibility Check

只读调查、检索、比较和不会改变用户 artifact 或外部状态的检查，可以按当前 Target 直接执行，不要求逐项预告。准备首次创建或修改 artifact，或实际 mutation 超出此前的 Visible Action Boundary 或 Authorized Execution Boundary 时，先用一段简短、用户可见的说明明确：

```text
准备改变什么 artifact、组件或外部状态
→ 这些动作与当前明确请求有什么直接关系
→ 哪些是用户明确提出的结果，哪些是 AI 选择的必要实现或验证手段
→ 是否包含用户没有提到的 material mutation、额外交付物或外部影响
→ Visible Action Boundary 与 Authorized Execution Boundary 各自包含什么
→ 每项执行授权来自 explicit-action、delegated-action 还是 necessary-means
→ 当前可以直接执行，还是必须等待 owner 裁决
```

Authorized Execution Boundary 只接受以下三种授权依据：

- `explicit-action`：正确 owner 明确要求或批准当前 action / action category，并且对象、方向和条件可识别；
- `delegated-action`：正确 owner 已明确委托这一类执行决定，当前 action 落在已展示的委托对象、范围和边界内；
- `necessary-means`：用户已经明确要求修改或交付某个结果，当前 action 已经展示，并且同时通过下面的必要性测试。

```text
不执行该 action，就无法满足或验证当前 active Commitment
+ 不存在范围更小、影响更低且同样充分的方案
+ action 保持局部、最小且可逆
+ 依据不是更整洁、更统一、方便未来、顺手处理或 AI 单纯偏好
```

通过 `necessary-means` 的实现和验证动作可以进入 Authorized Execution Boundary 并继续，不要求用户逐行批准。测试、构建或格式检查产生的临时状态也不需要逐项列出，但不能借验证名义改变 production、canonical truth、依赖或外部状态。

任何 mutation 在进入 Authorized Execution Boundary 前都只是候选 action，不能借用 Commitment 的 `proposed` 状态取得执行资格；Visible Action Boundary 中只有“已展示、未授权”的 action 仍然不能执行。以下行动只接受 `explicit-action` 或 `delegated-action`，不能由 `necessary-means` 自行授权；未获得对应依据时，展示后保持 Gate 打开等待授权：

- 新增用户未要求的功能、机制、长期 artifact 或交付物；
- 改变 public behavior、Requirement、scope、non-goal、依赖、配置、持久化数据、权限、安全或外部状态；
- 扩大到尚未展示的组件，进行非必要重构、迁移、清理或统一化；
- 发布、部署、发送外部消息、删除重要数据，或产生其他 material external impact。

执行中发现新的 material 行动，或需要越出任一行动边界时，在该行动发生前分别更新 Visible Action Boundary、Authorized Execution Boundary 和授权依据。Design 是否需要等待用户回复仍由 intent-first、已有委托和 unresolved user-owned gap 决定；mutation 是否可以执行只由 Authorized Execution Boundary 决定，未授权时无论是否已经展示都必须等待。

#### 产物形成后：Artifact Self-Review

本阶段创建或 materially 修改了文档、Design、测试、代码、报告或其他 artifact 时，在 Gate 通过前重新读取**最终实际产物**并做一次证伪审查。审查不能用作者未写出的意图替实际内容辩护；读取方式必须符合 `core.md` §1 的 evidence 可靠性要求。

```text
原始 owner 表达、相关 correction 和 canonical input
→ 是否完整进入 Commitment、Evidence、superseded 或 parked（防止一开始就漏记）
→ 每项 active Commitment 在实际产物哪里落实，条件、强度、owner 和结果是否保持（防做少）
→ 每项 material 新增、删除或修改由哪个 Commitment、canonical rule 或通过 §1.3 测试的 necessary-means 支撑（防做多或误删）
→ 主动构造一个合理但错误的解释或偷步路径，实际表达是否明确阻止它（防做偏）
→ 模拟正常路径，以及适用的边界、gap、回退或状态转换路径
→ 检查 canonical owner、引用、下游 consumer、验证结果和最终报告是否一致
```

每个“通过”都要有实际 artifact、source、diff、运行结果或可复现因果作为 evidence，不能只回答“已检查”。发现 material discrepancy 时，回到最早受影响的 owner 修正，并重新审查受影响链；未解除时保持 Gate 打开。

Artifact Self-Review 只为 §0 的 Evidence、Commitments 和 Gate / Next 提供完成 evidence，不是新控制面、阶段或 truth layer，也不要求每次创建独立 review 文档。简单、非 material 改动可以紧凑执行；但 canonical 规则、public contract、Gate、状态转换、owner、授权边界、规范性措辞或 material scope 的变化默认不能省略。使用“简单”“适用时”“相关 Alignment obligation 已完成”或“已有唯一方案”跳过工作时，必须能够指出成立条件和 evidence。

### 1.4 区分 AI 可完成的工作与需要人工介入的决定

先判断 gap 属于哪一类。

| Gap 或工作 | AI 的责任 | Intervention |
|---|---|---|
| 可以从会话历史、代码、文件、日志、运行结果、官方资料或实验获得的事实与上下文 | 主动调查、验证并报告 evidence | `AI 调查或执行` |
| 根据已确认规则进行覆盖检查、traceability、静态分析或一致性审查 | 完成检查并报告结果 | `AI 调查或执行` |
| 在 Frozen behavior、Design boundary、Visible Action Boundary 和 Authorized Execution Boundary 内完成测试、实现、通过 §1.3 必要性测试的重构和验证 | 自主执行可逆、范围明确的工作 | `AI 调查或执行` |
| 已确认目标和授权边界内的 Contract、Experience、Test、System 或 Detailed Design | 调研会话、项目、已有写法和外部 evidence，完成比较、专业取舍和完整设计；按 §1.3、§2.4 在下游行动前让用户看见 material 方向和依据 | `AI 调查或执行` |
| 多个技术选择真正等价，或 evidence 已支持唯一最佳专业方案 | 选择最直接、可逆、易验证的方案；material 时记录依据并按 §1.3 展示 | `AI 调查或执行` |
| 用户目标、价值或偏好已经明确表达，或结合会话与事实不存在合理的 materially different 解释 | 记录推导依据并按该意图继续，不机械重问 | `AI 调查或执行` |
| 只能由用户提供或决定，并且 AI 从现有会话和其他 evidence 中既无法取得、也无法根据上下文唯一且可靠地推出的目标、价值、优先级、体验、scope、non-goal 或 acceptance context | 先完成全部可调查工作和不受影响的设计，对受影响部分给出条件化方案，只请求缺失的最小充分 context | `decision owner 裁决` |
| 安全、隐私、合规、不可逆操作、外部发布或 material external impact | 先调查和降低不确定性 | `decision owner 裁决`，由拥有授权和责任的人决定；已有明确授权边界时按授权执行 |
| 客观工程检查 | AI 运行并解释结果 | `AI 调查或执行` |
| 主观体验验收、风险接受或组织规定的发布授权 | AI 提供 evidence 和建议 | `decision owner 裁决` |
| AI 无法取得、用户也不是可靠事实来源的外部信息 | 明确缺失 evidence 和验证方式 | `等待外部 evidence`，不把它伪装成用户澄清题 |

设计是 AI / solution owner 的专业工作。与用户讨论 Design 是让用户能够用自己拥有的背景纠正方向，不表示把技术方案重新交给用户选择，也不自动把 Intervention 设为 `decision owner 裁决`。

人工介入只用于真正 user-owned / owner-owned、尚未从上下文确定且没有委托的判断。准备提问前，依次检查：相关会话是否已经回答；项目和外部 evidence 是否可调查；已确认目标和专业因果是否支持唯一方案；该类判断是否已经委托给 AI。任一项足以继续时，由 AI 完成工作，不增加用户裁决负担；这不取消 §1.3 的行动可见义务，也不能把“无需用户决定”表达成“用户已经同意”。

使用 `delegated-solution` 时记录委托的 Target、决定类别和边界。用户说“继续”只覆盖当时已经展示的范围、设计和下一动作；后续出现新的 material 方向时重新对齐。

用户关于现有系统行为的描述作为 evidence 验证，而不是因为来自用户就跳过验证；用户已经明确表达的规范、价值和授权则按其对象、极性和条件记录，不因为需要补齐 Alignment readiness 而反复要求确认。

仍需要提问时，每次只请求一个最上游、只能由对方补充且会改变方向的核心 context。问题同时说明：

- 当前解释；
- 已知 evidence 和不确定性；
- 为什么该信息无法从其他来源取得或唯一推出；
- AI 已完成的不受影响部分，以及受该信息影响的条件化方案、推荐和主要 trade-off；
- 不同答案怎样改变后续流程。

### 1.5 Alignment Gate 的结果

Intervention 回答“下一步由谁解除 gap”，Gate result 回答“当前能否转换阶段”。两者不能互相替代：需要 AI、decision owner 或外部 evidence 采取的动作完成后，必须重新依据 Gap 和完成 evidence 评估 Gate。

无论使用下面哪一种通过结果，所有 mutation 都必须在执行前已经落入 Authorized Execution Boundary；material Design 和行动还必须在对应行动前按 §1.3、§2.4 落入 Visible Action Boundary。任一条件不满足时，Gate 保持打开，不能靠事后补录边界取得通过。

每次评估 Gate 时，只使用以下四种结果：

1. **通过—AI 可继续**
   - 当前 Target 和 user-owned Commitments 已由明确输入或不存在合理 material 分支的上下文确定；
   - 需要 AI 调查、专业设计、讨论或执行的工作已经完成；
   - AI 没有把能够完成的工作转交给用户；
   - Gap 为 `none`；
   - 没有新增 user-owned 选择；
   - AI 可以进入下一阶段。

2. **通过—Owner 已确认**
   - 曾经缺少只能由 decision owner 提供、且无法从其他 evidence 唯一推出的意图、价值、scope、风险或授权 context；
   - AI 已先完成可调查内容、不受影响的设计，以及受该 context 影响的条件化方案、建议和 trade-off；
   - decision owner 已补齐最小 context 或明确裁决，相关 Commitment 和 canonical owner 已更新；
   - Gap 为 `none`，可以进入下一阶段。

3. **有条件通过—仅剩非阻塞未知**
   - Gap 为 `non-blocking unknown`，其不同答案不会改变当前目标、方向、风险或 acceptance result；
   - 临时默认可逆、局部且不会推翻当前方向；
   - 默认、影响边界和后续验证入口已公开，可以进入下一阶段。

4. **保持打开—存在阻塞项**
   - Gap 为 `blocking material gap`；
   - 缺少的可调查事实、只能由 decision owner 补充的 context / 裁决或外部 evidence 仍会改变目标、方向、风险或 acceptance result；
   - 根据 Intervention 记录由 AI、decision owner 或外部 evidence source 解除阻塞所需的动作。

只有前三种结果表示 Gate 已通过。第四种结果必须保持在当前 Gate。Gate 通过只表示当前 evidence 和授权足以继续，不表示“已与用户达成一致”或用户逐项明确同意；只有能够追溯到 decision owner 对当前对象作出的明确要求、批准、授权、拒绝或带条件裁决，才能按实际极性报告对应用户决定。Alignment 记录是下游输入；下游阶段仍负责保护 Commitments、Visible Action Boundary 和 Authorized Execution Boundary，不能静默改写。

### 1.6 Closure Alignment 适用于任何合法任务终点

任务可以按 §2 的入口和授权范围停在分析、审查、Design、implementation 或完整 delivery 的合法终点，不要求为了关闭任务补走不适用的后续阶段。关闭前先完成 §1.3 的 Artifact Self-Review，再统一检查：

```text
逐项检查 Commitments
→ proposed：取得允许进入范围的成立依据后转 active，或转 superseded / parked；关闭时不能保持 proposed
→ active：任务结果已落实并有 evidence 时转 fulfilled；否则形成 blocking material gap
→ fulfilled：保留本任务的完成 evidence；对应 canonical truth 继续有效
→ superseded：记录替代它的新裁决和原因
→ parked：记录为什么不属于本轮以及未来入口

再单独检查 Gap
→ none：可以关闭
→ non-blocking unknown：公开影响边界和后续验证入口后，可以有条件关闭
→ blocking material gap：保持 Gate 打开，不能宣布任务完成

最后核对实际行动
→ 每个实际 mutation 是否在执行时已经落入 Authorized Execution Boundary，并保留对应授权依据
→ 每个 material mutation 和行动是否在执行前已经落入 Visible Action Boundary
→ 用户没有明确提出但由 AI 选择的 material 行动，是否已提前说明其依据和影响
→ 若存在越界或未提前展示的 mutation：不能事后只用“必要”补授权；只有能证明该变化完全由本轮 AI 独立产生、未与用户或其他工作交织且可以精确逆转时，才可自行撤回
→ 无法证明精确安全撤回时：保持 Gate 打开，如实报告实际变化、影响和所需处理授权，不自行覆盖现有工作
```

最终报告也属于实际产物：其中的完成范围、数量、测试或检查结果、未验证项和剩余 gap 必须从当前文件、运行结果或其他 source of truth 重新取得，不能根据执行记忆估计。对发生过 mutation 的任务，最终报告还必须单独说明用户未明确提出但 AI 实际执行的 material 行动及其成立依据；没有此类行动时明确说明“无”。Closure 还要确认没有 material contradiction 被隐藏，没有把 `context-derived`、`delegated-solution`、AI 专业选择或新增建议描述成用户已经明确同意或要求的内容。

---

## 2. 先确定从哪里进入流程

开始工作时，先恢复：

- 当前背景和原始目标；
- 用户或 decision owner 当前真正需要的结果；
- 当前 capability 的成熟阶段；
- 已经 Frozen 的 Requirements、Contract、Acceptance 和 Design；
- 当前实现和测试的真实状态；
- 本轮交付范围；
- 尚未裁决、且会改变结果的 material uncertainty。

然后选择入口。

| 当前任务 | 正确入口 |
|---|---|
| 新 capability、material behavior change、重要体验或责任边界变化 | 从 Requirements / BDD 开始 |
| 已有行为出现 bug，当前 expected behavior 已明确 | 从现有 Requirement / Acceptance 映射开始，确认复现后进入相关 Design / Test / Implementation 阶段 |
| 纯内部重构，public behavior 和 Design boundary 不变 | 读取 Frozen Acceptance + Design，从测试基线和 Implementation 开始 |
| 当前 Design 已 Frozen，只缺实现 | 从 CI Test Draft 或现有 Production Red 开始 |
| 只做分析、审查或诊断 | 只推进到能形成 evidence-backed 结论的阶段，不自动进入修改 |
| 探索 / research / POC | 只回答当前 material question；结论保持 candidate，直到进入稳定规格流程 |
| 前一轮工作已经完成部分阶段 | 从最早一个尚未满足完成条件的 Gate 恢复，不重复已确认工作 |

进入流程时，用 Alignment State 的必要部分说明当前定位：

```text
Target（含范围和 non-goal）：...
Stage（含进入依据）：...
Evidence（区分事实、推断、材料和未知）：...
Owner / 已确认输入：...
Commitments（逐项状态）：...
Gap：none / non-blocking unknown / blocking material gap
Intervention：none / AI 调查或执行 / decision owner 裁决 / 等待外部 evidence
Gate result：通过—AI 可继续 / 通过—Owner 已确认 / 有条件通过—仅剩非阻塞未知 / 保持打开—存在阻塞项
Next：...
```

这不是要求新建一份状态文档。简单任务可以在会话中直接说明；复杂或需要交接的任务再由项目决定是否持久化。

### 2.1 相邻阶段可以合并，Gate 仍需成立

简单改动可以在一次分析或一次提交中完成多个相邻阶段。例如，一个行为已经由现有 Requirement 和 Acceptance 明确定义的小 bug，可以连续完成复现、测试、修复和验证。

合并后仍能分别回答：

- 当前依据哪个 Requirement / expected behavior；
- 用什么 Example 或测试证明问题；
- 是否涉及 Design 变化；
- production 修改前基线是什么；
- 修改后什么证据说明完成。

如果这些问题无法回答，就不是合并步骤，而是丢失了阶段 truth。

### 2.2 Material uncertainty 在 evidence 或必要 context 足够前保持打开

不同答案会改变目标、public behavior、重要体验、责任、架构或主要 failure semantics 时：

```text
明确列出不同解释
→ 恢复相关会话并调查项目、外部资料或 experiment
→ 由 AI 完成职责内专业判断，给出 evidence、后果、已确定部分和条件化推荐
→ 上下文已支持唯一解释或已有授权：记录依据后继续
→ 仍缺只能由用户提供的 material context：请求最小补充
→ 仍缺外部事实：等待对应 evidence source
→ 更新 canonical owner
→ 再进入下一阶段
```

用户明确要求“先理解”“一步步来”“先审查再继续”时，按 §1.2 停在对应 Gate，先交付本阶段结果。

### 2.3 当前代码可以作为 evidence，但不拥有 expected behavior

维护现有系统时，可以在早期读取代码、测试、日志和运行结果，以确认当前现实、已有数据、部署拓扑和真实 failure。

形成 Requirement 和 Acceptance expectation 时，明确区分：

```text
当前代码说明：系统现在怎样工作

Requirement / owner 裁决说明：系统应该怎样工作
```

一个 Acceptance Scenario 应能够由用户目标、Contract、已确认事实和行为因果关系独立解释。当前内部 helper、schema 或模块拆分不能成为 expected behavior 的唯一依据。

### 2.4 所有 Design 阶段共用一套调研与对齐规则

Public Contract / Experience、Example & Coverage、Test Design Review、System Design 和 Detailed Design 都按 [`software-core.md` §4.2–§4.4](software-core.md#42-design-由-ai-调研并形成不从空白或模型偏好开始)执行，并维护同一份 **Design Evidence & Alignment**：

```text
恢复相关会话和 canonical truth
→ 调查项目规则、真实调用方、公共机制和同类型 precedent
→ 必要时补充外部资料或 experiment
→ 比较成立条件，识别必须一致、优先一致和可以偏离的部分
→ AI 完成专业设计和推荐
→ 讨论 materially significant 的方向、依据和影响
→ 只有剩余 gap 确实属于 user-owned context 时才请求最小补充
```

这是一次随设计逐步更新的证据链，不是每个阶段重新建立一套文档或机械要求用户确认。各阶段只补充本阶段相关的来源、比较、结论和对齐结果；无 material 新信息时复用已有记录。Design Evidence & Alignment 是当前 Design 的一个章节或可追溯记录，不创建新的 truth layer。

可见、等待和裁决边界的完整语义由 [`software-core.md` §4.4](software-core.md#44-设计讨论用于校准方向不把专业责任退回用户) 拥有。当前 Gate 分别判断：material Design 是否已在 implementation 前让用户实际看见；是否因 intent-first、未完成对齐或未委托的 material 方向而需要等待；是否存在只能由 decision owner 裁决的 unresolved user-owned context。其余专业设计由 AI 推进，但“AI 可推进”不能报告成“用户已明确确认”。

下面逐阶段说明怎样执行。每个阶段满足“完成条件”后，再按 §1.5 得到统一 Gate 结果；只有 Gate 已通过，才能进入下一阶段。

---

## 3. Requirements / BDD：明确需要什么结果

### 进入条件

- 已恢复当前背景、目标和本轮范围；
- 已知道谁对产品行为和价值取舍负责；
- 已区分当前实现事实、历史方案和当前规范。

### 本阶段工作

先由 AI 恢复相关会话、历史讨论、现有产品行为、调用方 evidence 和已经确认的取舍。能够从这些材料唯一推出的用户意图直接记录依据；不要因为 Requirements 属于 user-owned truth，就要求用户重复提供已经存在的 context。

用用户、调用方或业务语言明确：

- 谁在什么背景下使用；
- success 时真正得到什么结果；
- 哪些状态必须连续；
- 哪些 failure 会改变调用方行为；
- 哪些边界属于当前责任；
- 哪些内容明确不属于本轮；
- 哪些明显价值机会已经由 owner 确认进入范围。

BDD Scenario 在这一阶段主要帮助表达稳定 What，不提前冻结内部 How。

### 明确产出

- 当前 Requirements / BDD baseline；
- Requirement ID 或其他稳定追踪标识；
- 当前 scope 与 non-goal；
- Commitment 状态、owner 和成立依据的明确区分；
- 仍未解决的 material question；
- 已停车的 How candidate。

### 完成条件

- 原始目标能够映射到明确 Requirement；
- 每个 materially different 的产品选择已经由明确输入、无合理 material 分支的上下文推导或必要的 owner 最小补充确定；
- 文档没有把当前实现便利误写成 Requirement；
- 当前边界足以开始定义 Public Contract 和 Example。

### 回退或暂停

AI 已检查可访问会话和其他 evidence 后，目标、价值、责任或重要行为仍有多个合理解释，而且差异只能由 user-owned context 消除时，停在本阶段请求最小补充。

---

## 4. Public Contract / Experience：明确调用方真正看到什么

### 进入条件

- Requirements / BDD 已足够稳定；
- 已知道真实调用方是人、程序、模型还是多个角色。

### 本阶段工作

按 §2.4 更新 Design Evidence & Alignment，重点调查同调用方、同类型 API / 交互、公共约定和真实 call sites，并比较语义、兼容性、状态、错误、任务路径和验证方式。AI 形成 Contract / Experience 方案并讨论 materially significant 的公开语义；只把无法从 evidence 唯一推出的 user-owned 体验或产品 context 留给用户补充。

根据产品形态明确：

- public / model-visible API、参数、返回、错误和调用语义；
- identity、path、namespace 或状态在公开边界上的含义；
- UI 的任务路径、信息层级和 loading/empty/error/success 等状态；
- visual、responsive、accessibility 等当前适用 baseline。

### 明确产出

- Public Contract；
- UI 产品适用时的 Experience / Interaction / Visual baseline；
- 更新后的 Design Evidence & Alignment；
- 后续 Acceptance 可以观察的稳定边界。

### 完成条件

- 调用方不需要猜参数、状态和结果的含义；
- Contract 能表达当前 Requirement；
- 相关 precedent、严格参考或偏离依据，以及 §2.4 适用的可见、等待和裁决结果已记录；
- 内部实现仍有合理自由度。

---

## 5. Example & Coverage Design：把 Requirement 展开成可检查行为

### 进入条件

- Requirements 和公开行为边界已经足够清楚；
- material product ambiguity 已裁决。

### 本阶段工作

按 §2.4 更新 Design Evidence & Alignment，重点调查历史 failure、相似 capability 的行为规格以及既有 Example / verification pattern。由 AI 把每个 Requirement 展开为 Given / When / Then 和完整 coverage matrix，并讨论 materially distinct 的行为与边界；旧测试只帮助发现遗漏和选择验证方式，不拥有 expected behavior，用户也不负责替 AI 设计普通测试场景。

覆盖维度至少检查：

- happy path；
- 会 materially 改变结果的输入和状态边界；
- 调用方可观察的 failure；
- 状态连续性和后续可观察结果；
- permission、concurrency、restart、migration、compatibility、UI state 等当前适用维度；
- 无法可靠自动化的语义、视觉、环境或人工验收项。

“代表性 Example”表示用有限场景表达完整行为关系，不表示只挑几个容易测试的样例。每个 materially distinct 的行为、边界和 failure 都应有 Example 或明确验证去向。

### 明确产出

- Requirement → Scenario / Example 映射；
- 更新后的 Design Evidence & Alignment；
- 每个 Example 的 Given / When / Then；
- verification method：Automated、AI Semantic Review、Manual、Integration/E2E 或其他明确方式；
- 当前未覆盖项及原因。

### 完成条件

- 所有当前 Requirement 都有验证去向；
- Scenario 使用产品或 application 语言；
- Then 观察稳定行为，不锁当前内部表示；
- coverage 由 AI 基于 Requirement 和调研完整展开，§2.4 适用的可见、等待和裁决结果已记录；
- 无法自动化的内容没有被伪装成脆弱字符串测试；
- 当前场景矩阵足以进入独立 Test Design Review。

---

## 6. Test Design Review：独立审查行为规格

### 进入条件

- Example / Scenario matrix 已完成初稿；
- production implementation 尚未被用来决定 expected behavior。

### 本阶段工作

逐项审查：

1. 每个 Requirement 是否有完整验证去向；
2. happy path、重要边界和 failure 是否覆盖；
3. Given 是否建立真正需要的前置状态；
4. When 是否使用稳定 public / application contract；
5. Then 是否断言用户或调用方关心的结果；
6. Scenario 是否混入 helper、schema、锁、内部字段或调用顺序；
7. 某个内部重构不改变行为时，Scenario 是否仍然成立；
8. verification method 是否真的能证明对应 claim；
9. 是否存在由测试便利偷偷裁决的产品选择；
10. 从原始目的反向检查时，是否遗漏一级行为；
11. 调研、precedent 适用性和 §2.4 的可见、等待、裁决义务是否成立：既不凭模型印象或机械复制旧测试，也不把 coverage 专业判断交还用户。

### 明确产出

- review 结论；
- 需要补充、合并、拆分或改写的 Scenario；
- 需要回到 Requirement / Contract 裁决的问题；
- 满足 Freeze 条件的 Acceptance Specification。

### 完成条件

- review 问题已经处理；
- material ambiguity 已由 AI 调查和专业判断消除，或只剩确实需要 user-owned context / 外部 evidence 的 blocker；
- Acceptance 可以作为后续 Design 和测试代码的稳定 What。

---

## 7. Acceptance Freeze：建立当前行为基线

Freeze 表示：当前 evidence 下，行为已经清楚到足以进入 Design。它不是宣告文档永远不能变化。

### 进入条件

- Test Design Review 已完成；
- review 发现的问题已经修正或回到对应 owner 裁决；
- 当前 Acceptance 可以稳定表达需要设计的 What。

### 本阶段工作

确认当前行为基线，明确哪些文档和 Scenario 是后续 Design、tests 与 implementation 的输入。Freeze 只冻结当前已确认行为，不冻结尚未进入 Design 的内部 How。

### 明确产出

至少明确：

- Frozen Requirement / Contract / Scenario 版本或当前文件；
- Requirement → Acceptance 覆盖结果；
- 自动化、AI Review、Manual、Integration/E2E 的分工；
- 已知 non-goal 和尚未验证但不阻塞当前设计的 unknown；
- owner 已裁决的关键选择。

### 完成条件

只有满足以下条件才进入 Engineering Design：

- 当前重要行为和边界已经明确；
- 每个 Requirement 有验证去向；
- 没有把 production internals 当作行为来源；
- 没有仍会改变架构或主要行为的未决问题。

新 evidence 后续推翻当前理解时，重新打开对应 Requirement / Acceptance，向下同步，不在 Design、tests 或 implementation 中静默改写行为。

---

## 8. System Design：确定整体责任和协作关系

### 进入条件

- Acceptance 已 Frozen；
- 系统级目标、调用边界和主要 guarantee 已明确。
- 与当前设计有关的会话、项目文档、代码和测试可以读取；无法取得的 evidence 已标明，而不是由 AI 猜测补齐。

### 本阶段工作

按 §2.4 更新 Design Evidence & Alignment，重点调查项目级规则、公共机制、相邻模块、同 responsibility family、相关调用方，以及必要的外部成熟架构。AI / solution owner 完成 evidence 足以确定的 System Design；对仍受 user-owned gap 影响的部分给出条件化方案和推荐，再只请求最小 context，不把架构分析或普通技术选择交给用户。

定义：

- responsibility black boxes；
- semantic owner、state owner 和 source of truth；
- data/control flow；
- sibling contract；
- 主要 success、failure、concurrency 和 recovery boundary；
- 组合后怎样完成原始目标。

从 guarantee 推导最小充分机制：

```text
需要的结果
→ 真实 failure / consequence
→ 所需 guarantee
→ 最小充分机制
```

### 明确产出

- System Design；
- Design Evidence & Alignment：调研来源、precedent 比较、严格参考或偏离依据、当前推荐、委托范围和仍缺 user-owned context；
- black-box responsibilities 和 contracts；
- 需要继续 Detailed Design 的 leaf 列表；
- 仍需由 AI research / experiment 的问题，以及确实只能由用户或外部 evidence source 解除的 gap。

### 完成条件

- 每个 Requirement / Acceptance 行为有明确责任承担者；
- 主要状态和 failure 不在多个 owner 之间漂移；
- 系统组合能够解释原始目标；
- §2.4 的调研、precedent 比较、AI 专业判断和适用的可见、等待、裁决结果均可追溯，没有由模型先验静默补出的 material 设计；
- user-owned context 已由明确输入、唯一上下文推导或最小补充确定；仍会改变结果的缺口保持 Gate 打开；
- leaf 可以在明确 parent contract 下继续设计。

---

## 9. Detailed Design：消除当前实现所需的 material 歧义

### 进入条件

- 当前 leaf 的 parent goal、输入输出和 sibling contract 已明确；
- 当前需要决定到什么深度已经清楚。
- System Design 的 Design Evidence & Alignment 可以追溯。

### 本阶段工作

按 §2.4 更新 Design Evidence & Alignment，重点调查公共 primitive、同 owner / contract / lifecycle 的实现，以及同类型 command、adapter、repository、state machine、codec、UI interaction 或测试写法。按责任、contract、data/control flow、状态、错误、恢复、依赖、扩展和测试边界详细比较；成立条件相同且没有 material 偏离依据时严格参考，需要偏离时记录差异来源及其对其他同类型实现的影响。AI 完成可确定部分；只把确实受 user-owned gap 影响的部分作为条件化方案讨论。

定义当前实现真正需要的：

- schema / data shape；
- state transition；
- operation sequence；
- algorithm 和 calibration-sensitive baseline；
- module / dependency boundary；
- validation、mutation 和 error ownership；
- public error mapping；
- 关键 phases、branch、read/write、side effect 和 postcondition。

需要通用 Tool、adapter 或基础设施时，在当前语义明确后审查成熟实现及其 public reuse seam。直接复用能够承担通用责任的成熟实现，只在外层增加当前项目拥有的领域语义。

### 明确产出

- 可由较低经验实现者直接落实的 Detailed Design；
- 更新后的 Design Evidence & Alignment：leaf-level precedent 比较、严格参考或偏离边界、关键讨论结论和成立依据；
- 当前 baseline 参数和后续 calibration 入口；
- 成熟实现的复用、适配或局部替换边界；
- tests 需要验证的 Design mechanism。

### 完成条件

- 实现者不需要自行决定 materially different 的行为、责任、状态或 failure semantics；
- 等价编码选择仍保留 implementation freedom；
- Design 能逐项解释 Frozen Acceptance；
- §2.4 的调研、严格参考或偏离依据、AI 专业判断和适用的可见、等待、裁决结果均可追溯；
- AI 没有把可调查或可完成的专业工作交给用户，也没有替用户决定尚未确定的 user-owned 选择；
- 从方案反向回到 guarantee 和原始目标时，因果链成立。

---

## 10. CI Test Draft：把 Frozen Acceptance 自动化

### 进入条件

- Acceptance 已 Frozen；
- 当前 Test Strategy 已明确哪些 case 进入确定性 CI；
- Design 已为 production 和必要 mechanism test 提供边界。

### 本阶段工作

为进入 CI 的 Acceptance / Fault / Mechanism cases 编写测试代码。

测试代码遵守：

- Acceptance expectation 只来自 Frozen behavior；
- 默认 CI 使用真实 production business/application logic + fake resource ports；
- fault Given 只开放最小 deterministic seam；
- mechanism tests 明确标注自己验证 Design，而不是 Requirement；
- Scenario 意图、输入和断言保持可读；
- wiring 和 fixture 不提前制造未来抽象。

### 明确产出

- CI test draft；
- Scenario / case ID 到测试代码的映射；
- 尚未自动化 case 的验证去向；
- 当前测试脚本仍需确认的问题。

### 完成条件

- 每个计划进入 CI 的 case 都有测试代码；
- 测试代码可以独立接受 Test Review；
- 尚未接入 production 或尚未根据 production 修改 expected behavior。

---

## 11. Test Review：确认测试代码忠实实现规格

### 进入条件

- CI test draft 已完成；
- Frozen Acceptance 仍是 expected behavior owner。

### 本阶段工作

审查：

- 每个测试是否对应明确 Scenario / mechanism；
- fixture 除当前被测变量外是否保持合法；
- assertion 是否观察稳定结果；
- 是否锁死内部字段、helper、调用次数或偶然文案；
- fake 是否在替 production 实现业务规则；
- mock 行为是否靠近对应 action；
- 重复 helper 是否来自真实稳定重复；
- 失败信息能否指出哪个行为没有成立；
- Fake Green、Production CI 和真实资源验证的证据边界是否清楚。

### 明确产出

- Test Review 结论；
- 已修正的测试脚本；
- 需要回到 Acceptance 或 Design 的 gap；
- 可以进入 Fake Green 或 Production Baseline 的测试基线。

### 完成条件

- 测试代码忠实实现 Frozen Scenario；
- 没有为了当前 production 便利改变业务 expectation；
- 测试 wiring 保持最小且可理解；
- 所有 review 问题已处理或有明确去向。

---

## 12. Minimal Fake Green：验证测试脚本自身（适用时）

### 适用条件

出现以下任一情况时执行：

- 新编写了尚未接入 production 的 Acceptance tests；
- 测试包含新的 fixture、matcher、参数化或多步 Scenario；
- 需要先区分“测试脚本写错”与“production 未实现”。

已有稳定测试只做小幅调整、且其自验证证据仍然成立时，可以直接进入 Production Baseline。

### 本阶段工作

使用每个 Scenario 所需的最小 Stub / Fake，让测试脚本按 Frozen behavior 自洽运行。Fake 只返回测试步骤需要的结果，不发展成 reference production implementation。

### 明确产出

- Fake Green 结果；
- 被验证的测试脚本范围；
- 明确说明 Fake Green 不代表 production Green。

### 完成条件

- test code、fixture、matcher 和参数化能够正确运行；
- Fake 没有复制 production 业务逻辑；
- 默认 CI 不会把 Fake Green 误报成产品通过。

---

## 13. Production Baseline / Red：第一次让实现面对规格

### 进入条件

- CI tests 已通过 Test Review；
- 适用时 Fake Green 已完成；
- production 修改尚未为了这些新 expectation 开始。

### 本阶段工作

把测试 wiring 接到真实 production business/application logic 和规定的 resource boundary，运行当前实现，记录真实结果。

可能出现：

```text
Red
→ 当前实现尚未满足 Frozen behavior

部分 Green / 部分 Red
→ 只实现缺失行为

全部 Green
→ 检查功能是否早已存在、测试是否真正执行、Scenario 是否有效
→ 不为了制造形式上的 Red 故意改坏实现
→ 测试有效且功能已经存在：不修改 production，直接进入 Production Green
```

无法自动化的语义或真实环境 case，记录其当前验证 baseline，不伪造代码 Red。

### 明确产出

- production baseline；
- Red case 和 failure evidence；
- 已有 Green behavior；
- implementation 需要处理的具体差异。

### 完成条件

- 已知道当前实现相对 Frozen truth 的真实差异；
- 没有在获取 baseline 时修改 expectation 迁就实现；
- 存在 Red 或 implementation difference 时，可以进入实现循环；
- 全部 Green 且测试有效、功能已经存在时，直接进入 Production Green。

---

## 14. Double-Loop Implementation：用内外两层验证推进实现

### 进入条件

- 当前 Production Red 或实现差异已明确；
- Frozen Acceptance 和 Design 能指导实现；
- materially different 的 How 已在 Design owner 中决定。

### 本阶段工作

外环保持 Acceptance goal 稳定：

```text
Acceptance / Fault case
→ 当前 feature 是否完成
```

内环按 Detailed Design 小步推进：

```text
选择一个最小实现差异
→ 必要时增加 mechanism / unit test
→ 修改 production
→ 运行相关检查
→ refactor
→ 回到外层 Acceptance
```

实现中遇到 gap 时按 owner 回退：

```text
编码等价选择
→ implementation 自行选择

Design 没决定 material How
→ 回 Detailed Design

Acceptance 行为有歧义
→ 回 Acceptance / Requirement owner

新的外部事实改变目标
→ 回 Requirements
```

Implementation Plan 只在复杂执行顺序确实降低交付成本时创建或更新。

### 明确产出

- production 修改；
- 必要的 mechanism tests；
- 每个 Red case 的处理证据；
- 新发现 gap 的 owner 和处理结果。

### 完成条件

- 当前范围内的 Production tests Green；
- 实现符合 Frozen Design；
- 没有通过改弱 expectation 获得 Green；
- 代码和测试保持可理解、可维护。

---

## 15. Production Green：确认实现结果，不提前宣告产品完成

### 进入条件

- 当前范围的 production 修改已完成；
- 相关自动化检查已运行。

### 本阶段工作

记录：

- 哪些 Acceptance / Fault / Mechanism tests Green；
- typecheck、build、lint、static checks 等当前要求的结果；
- 哪些真实 adapter、环境、视觉或语义项尚未验证；
- 当前已知 gap。

### 明确产出

- Production Green 结果及实际运行范围；
- 自动化检查结果；
- 尚需 Readiness / Integration / Manual 验证的项目；
- 当前已知 gap 和 owner。

### 完成条件

- Green 证据与实际执行的测试范围一致；
- 没有把 Fake Green、局部单测或未运行检查描述成完整产品通过；
- 可以进入 Compliance Review。

---

## 16. Compliance + Original Intent Review：同时检查落实完整性和方向正确性

### 进入条件

- Production Green baseline 已形成；
- 当前 canonical Requirements、Acceptance 和 Design 可读取。

### 本阶段工作

§16 不替代各阶段的 Artifact Self-Review。先确认每个 material artifact 已按 §1.3 审查，发现的问题已经回到对应 owner 修正或保持为公开 gap，再做下面的端到端检查。

先做正向 traceability：

```text
Requirement
→ Contract / Scenario
→ Acceptance
→ Design
→ tests
→ implementation
```

再做 Original Intent Reverse Audit：

```text
当前实现 / 方案
← 所需 guarantee
← 真实 failure / opportunity
← 核心使用和运行过程
← 原始背景与目标
```

同时按 §2.4 反查 Design Evidence & Alignment：每个 material Design 是否有相关会话、canonical truth、项目 precedent、必要的外部 evidence 或专业因果支撑；严格参考与偏离是否正确落实；AI 是否完成了职责内工作。对于声称“可从用户上下文唯一推出”的选择，按 `core.md` §4.1 反查原始消息，确认不存在另一个合理的 material 解释。

发现差异时分类：

- implementation deviation；
- test deviation；
- Detailed Design gap；
- System Design gap；
- Acceptance / Requirement gap；
- 更早的原始理解被新 evidence 推翻。

### 明确产出

- Requirement / Scenario / Design / test / implementation 覆盖结果；
- Original Intent Review 结论；
- Design Evidence & Alignment 审查结果；
- 每个 gap 的 owner 和修正位置；
- 可以进入 Readiness 的剩余项。

### 完成条件

- 正向和反向两条链都成立；
- 每个 material Design 都能追溯到调查 evidence、专业因果或明确授权；
- 严格参考与偏离已有写法的判断均已落实，用户没有被要求替 AI 完成可调查或专业设计工作；
- gap 已修正，或准确记录为当前未完成项；
- Review 没有自行增加本轮未承诺的新 Requirement。

---

## 17. Readiness / Acceptance：验证当前承诺的真实结果

### 进入条件

- Compliance Review 已完成；
- 当前项目 Test Strategy 已明确最终验证方式。

### 本阶段工作

只检查当前已经承诺的内容，例如：

- required automated tests、typecheck、build、lint 和 static checks；
- required integration / real-adapter / migration / browser / device 验证；
- functional、visual、accessibility 或 AI Semantic Review；
- 当前 Design 的 module boundary、dependency direction 和 owner 是否落实；
- known gaps 是否准确记录；
- 用户或调用方是否能够完成原始目标。

客观工程结果由 AI 运行和判断，不要求人工重复执行。主观体验、风险接受、外部发布授权或当前流程明确归属于人的 Acceptance，由 AI 提供完整 evidence 后交给对应 owner。

完成本阶段特有的 Readiness / Acceptance 检查后，按 §1.6 执行通用 Closure Alignment。主观 Acceptance 仍由正确 owner 提供；Artifact Self-Review 和客观 Closure evidence 仍由 AI 完成。

### 明确产出

- readiness 结果；
- Acceptance / release / handoff 证据；
- 未验证项、non-goal 和后续工作；
- 最终完成状态。

### 完成条件

- 当前 required engineering 和 Acceptance evidence 已完成，且报告范围与实际验证一致；
- 真实结果满足原始目标，或已准确说明差距和下一责任人；
- 客观 Gate 已由 AI 完成，真正 user-owned / owner-owned 的 Acceptance 已获得对应确认；
- §1.6 Closure Alignment 已通过：所有 Commitments 已进入允许终态，不存在隐藏的 `blocking material gap`，最终报告与实际 evidence 一致。

---

## 18. 新反馈出现时从正确 owner 重新进入

流程完成后出现新需求、故障、用户纠正或 production evidence 时，不默认从头重走，也不直接在代码里打补丁。

先判断反馈改变了哪一层：

```text
目标 / public behavior 改变
→ Requirements / Contract

Example 或 expected result 有误
→ Acceptance

责任、架构或主要机制有 gap
→ System / Detailed Design

测试没有忠实表达当前 truth
→ Test Draft / Review

实现偏离当前 truth
→ Production Red / Implementation

验证证据不足
→ Readiness / Test Strategy
```

从最早受影响的 owner 重新进入，向下同步到完成。若反馈暴露了稳定的方法问题，同时更新 `core.md`、`software-core.md`、本文或对应领域规则。

---

## 19. 最小执行摘要

§0 的八个控制项是本文唯一的执行摘要。开始、恢复、转换阶段和交接时都回到同一份控制面，不另造简化流程。

任务关闭时额外确认三件事：所有 Commitment 已进入允许的终态；Artifact Self-Review 已用实际 evidence 排除 material 的做偏、做少、做多；当前 Gate result 与实际 Gap、Intervention 和 evidence 一致。

低经验执行者按当前阶段的进入条件、本阶段工作、明确产出和完成条件执行，不需要猜隐藏步骤；高经验执行者可以合并相邻阶段，但仍保留这些阶段关系和 evidence。
