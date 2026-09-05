# Software Core：软件工作的稳定原则

> **用途：定义软件任务中跨阶段始终成立的 truth ownership、设计边界、测试语义和验证原则。**
>
> 本文不规定先做哪一步、后做哪一步。具体阶段顺序、进入条件和完成条件由 [`software-workflow.md`](software-workflow.md) 拥有。跨领域的 evidence、因果、责任、最小充分和表达原则由 [`core.md`](core.md) 拥有。
>
> 执行具体任务时先读 `core.md` §0、本节术语和 [`software-workflow.md` §0](software-workflow.md#0-唯一执行入口)，再按当前问题读取本文相关原则、流程入口与当前阶段，最后读取项目和 capability 的 canonical 文档；不要求每次全文加载三份规则。只有审查或修改这些规则本身时才完整通读。

---

## 0. 本文关键术语

- **canonical owner**：完整拥有某类 truth 的唯一位置。其他文档可以摘要和引用，不建立第二份独立定义。
- **material / materially different**：不同答案会改变用户结果、public behavior、重要体验、责任、架构、主要 failure semantics 或长期复杂度，因而不能当作等价细节处理。
- **observable behavior**：用户、调用方或后续公开操作能够观察到的结果和状态关系，不等于当前内部字段或 helper 调用。
- **Frozen / Freeze**：当前 evidence 下已经审查并足以指导下游工作的 baseline。新 evidence 可以重新打开它；下游不能静默改写它。
- **Gate**：进入下一阶段前必须满足的完成条件。Gate 可以在同一次工作中通过，但需要有明确产出和证据。
- **production**：项目实际交付或运行的业务/application 代码及 adapter，不包括只为测试构造的 reference fake。
- **Red / Green**：对应验证在当前 production 上失败 / 通过。Fake Green 只表示测试脚本在 Fake 上自洽，不属于 Production Green。
- **Fake / Stub**：测试中替代 resource boundary 或提供预定结果的最小对象。它帮助形成确定性验证，不拥有 production 的完整业务行为。
- **solution owner / designer**：在已确认目标和委托边界内负责调查、比较并形成专业设计的主体；AI 承担软件设计任务时默认是该角色。
- **precedent（既有参考）**：项目中可能约束或校准当前设计的 canonical 规则、公共机制、同类型实现或稳定写法；存在不等于自动适用。
- **Design Evidence & Alignment（设计依据与对齐记录）**：Design 中统一记录调研来源、precedent 比较、当前方案与依据、委托范围和仍缺 user-owned context 的章节；不是新的 truth layer，也不要求独立文档。

---

## 1. 软件 artifact 分别拥有不同类型的 truth

### 背景与目的

软件工作会不断把同一个目标转成不同产物：需求说明、接口、场景、设计、测试和代码。如果每份产物都自行解释用户目标，早期误解会向下复制；如果直接以现有代码为准，测试又可能把实现缺陷保护起来。

因此需要分清“应该得到什么”“当前准备怎样实现”“实际做成什么”和“已经证明什么”。分层的目的，是让每个重要选择有明确归属，反馈出现时知道从哪里修正，并让实现者不必重新发明上游决定。它不要求每层各写一个文件；小任务可以在同一文档或会话中保留这些内容，完整定义仍只维护一份。

下面的 `truth` 表示某类判断当前以哪里为准，不表示不可推翻的绝对真理。`Contract` 是调用方可依赖的接口和行为约定；`invariant` 是在约定条件下必须一直成立的关系；`schema` 是数据结构与合法性规则。先理解这些词承担的职责，再选择项目中的名称和文件。

软件项目中的文档、测试和代码不是同一份 truth 的不同格式。每一层只拥有自己应决定的内容。

| Truth layer | 拥有的内容 | 不拥有的内容 |
|---|---|---|
| **Requirements / BDD** | 用户或调用方需要得到的结果、稳定行为和 observable invariant | 当前实现结构、算法、模块拆分 |
| **Public / model-visible Contract** | 调用方真实可见的接口、参数、结果、错误和使用语义 | 内部 helper、存储布局和执行细节 |
| **Experience / Interaction / Visual Design** | UI 产品中的任务路径、信息层级、状态反馈、视觉和可访问性 baseline | 后端内部实现方式 |
| **Acceptance / Specification by Example** | 用具体 Example 证明 Requirement 成立的方法，以及 expected observable result | production 当前恰好怎样实现 |
| **System Design** | responsibility black boxes、ownership、data/control flow、主要 success/failure/recovery boundary | leaf 内部全部代码细节 |
| **Detailed Design** | 当前 leaf black box 的 schema、状态转换、算法、operation sequence、依赖和错误映射 | 与当前重要结果真正等价的编码选择 |
| **Tests** | 对当前 Acceptance、Design mechanism 或明确 fault guarantee 的可执行验证 | 自动创造 Requirement 或替代 owner 裁决 |
| **Implementation** | 当前系统实际怎样工作 | 单独证明产品本来就应该这样工作 |
| **Review / Report** | 对被审查对象的证据、结论和差异分类 | 复制并重新拥有被审查对象的 truth |
| **Discussion / Archive** | 历史背景、推理过程和已经被替代的方案 | 当前仍应执行的规范 |

当同一事实需要出现在多个位置时，指定一个 canonical owner。其他位置只保留当前上下文需要的摘要和链接。

### 1.1 贯穿示例：修改项目名称

后文用同一个教学案例说明分层、测试与交付。以下是明确假设的当前需求，不代表本仓库存在该功能，也不是所有命名功能的统一规则。教学范围只覆盖 ASCII 名称；真实产品若支持其他字符，应由其 Contract 定义计数规则并补充对应场景。

- **R1 正常保存**：用户提交项目名称；移除首尾空格，校验通过且存储提交成功后，该名称成为新名称，再次读取能够看到它。
- **R2 非法输入**：处理后名称为空，或超过 20 个字符时返回输入错误，原名称保持不变。
- **R3 保存失败**：存储提交前发生可捕获错误时，返回保存错误，原名称保持不变。本例不承诺提交中途断电或进程被强制终止时的恢复。

| 产物 | 本例应该写什么 | 为什么放在这里 |
|---|---|---|
| Requirement | R1–R3 的用户结果、失败边界和不变关系 | 决定功能应该表现成什么样 |
| Public Contract | `setName(raw)` 接收字符串，成功返回 `{ ok: true, name }`，失败返回 `{ ok: false, error }`，其中 error 为 `invalid-name` 或 `save-failed`；`getName()` 返回当前名称字符串 | 让调用方知道如何调用、观察和处理结果 |
| Acceptance | 旧名称为 `Old`，提交 `  Maple  `，得到成功，随后读取为 `Maple`；提交空白时得到输入错误，随后仍为 `Old` | 用具体输入和结果校准已定义行为 |
| System Design | application 负责名称规则和公开错误；存储端口负责读取、提交名称；adapter 接到实际资源 | 定义谁承担规则和资源责任 |
| Detailed Design | 先去首尾空格，再校验，再调用存储；把提交前存储错误映射成 `save-failed` | 消除执行顺序和错误处理歧义 |
| Tests | 按 §6.4 验证正常行为、失败不变关系和必要机制 | 证明对应规格，而非定义新行为 |
| Implementation | 按上述设计实际处理请求 | 必须用运行结果确认是否落实 |

`application` 指真正执行用户业务规则的代码；`port` 指它访问外部资源的接口；`adapter` 指连接文件、数据库等真实资源的实现。三者的边界在 §8.4 用具体接线说明。

---

## 2. Truth 变化沿 owner 向下传播

Requirement 真正变化时，按下面的关系同步：

```text
明确的新 evidence 或 owner 裁决
→ Requirements / Contract / Experience
→ Acceptance
→ System Design / Detailed Design
→ tests
→ implementation
```

下层反馈需要先分类，再决定修改哪里：

```text
implementation 没有实现当前 Design
→ 修 implementation

Design 无法完整实现 Frozen Acceptance
→ 回到 Design owner 补齐或重判

Acceptance 遗漏或误解了 Requirement
→ 回到 Acceptance / Requirement owner

新的事实说明更早的共同理解本身有误
→ 回到原始背景、目的和责任人重新裁决
```

代码和旧测试可以证明“当前是什么”，不能单独证明“应该是什么”。已有 artifact 即使彼此一致，也可能共同复制了同一个上游误解。

---

## 3. 稳定行为与实现自由分开

一个选择如果会 materially 改变以下任一内容，就应由对应的 Requirement、Contract 或 Design owner 明确决定：

- 用户或调用方看到的行为；
- 重要体验；
- responsibility / ownership；
- source of truth 或状态连续性；
- 主要 success、failure、concurrency 或 recovery semantics；
- 架构方向或长期维护边界。

多个选择如果在这些重要结果上真正等价，可以保留为 implementation freedom。实现者可选择最直接、最容易验证的表达，不需要为了形式完整把每个局部编码选择提升成 Design。

Requirements 阶段提前出现有价值的 How 时，把它记录为 working / parked design note。等 What 和 Acceptance 稳定后，再由 Design 根据完整条件重新裁决。

---

## 4. 软件 Design 必须由调研、项目现实和用户意图共同支撑

### 4.1 System Design 与 Detailed Design 按责任层级递归展开

System Design 先回答：

- 系统怎样拆成 responsibility black boxes；
- source of truth、state owner 和 semantic owner 在哪里；
- sibling black boxes 共享的 contract 由哪个 parent owner 定义；
- black boxes 怎样协作；
- 关键业务闭环怎样贯穿系统；
- 主要 success、failure、concurrency 和 recovery boundary 在哪里承担。

Detailed Design 再回答当前 leaf black box 怎样履行 parent contract：

- schema / data shape；
- state transition；
- operation sequence；
- algorithm 和当前 baseline 参数；
- module / dependency boundary；
- validation、mutation 和 error ownership；
- public error mapping；
- 关键函数的 phases、branch、read/write、side effect 和 postcondition。

复杂设计按下面的关系递归：

```text
整体目标
→ responsibility black boxes
→ child black boxes
→ leaf Detailed Design
```

逐层展开时，每个局部设计视图只定义当前节点、它的直接子责任单元及它们之间的协作；子节点内部在下一层单独展开。端到端 flow 可以跨层说明完整路径，但引用各层已定义的 contract，不在总览中重新定义子节点内部细节。

父层拥有对子节点的外部约束和兄弟节点之间的协作契约；子层拥有在这些约束下的内部组织与实现方式。子层引用 parent contract，不建立第二份独立定义。发现内部方案无法满足外部约束时，回到 parent owner 修正或重新裁决，再向下同步。

每完成一层，回到 parent 检查各部分组合后是否仍满足原目标。拆解到已有契约和当前 Detailed Design 足以指导实现、material 歧义已消除时停止；成熟组件内部可以保持黑盒，不要求所有设计都拆到原子或函数级。一个较低经验实现者忠实按 Detailed Design 编码时，不应仍需自行决定会 materially 改变行为、责任、状态或主要 failure semantics 的问题。

父子约束、逐层视图及停止条件的完整 UI 示例见 [§9.2](#92-完整示例局部信息面板的分层设计)。其他软件设计沿用上述责任关系，具体表达按领域选择。

### 4.2 Design 由 AI 调研并形成，不从空白或模型偏好开始

这里的 Design 包括 Public Contract、Experience、Example / Coverage、Test Design、System Design 和 Detailed Design；每一层继续只拥有自己的 truth。软件 Design 是 solution owner 的专业工作。形成任何 material Design 前，AI 必须先取得当前问题能够取得的最小充分 evidence：

- 当前会话、相关历史讨论、用户已经反复确认的目标和取舍；
- 当前 Requirements、Contract、Acceptance、既有 Design 和项目规则；
- 当前代码、测试、调用方、运行方式、数据和已观察到的 failure；
- 项目中的公共机制、相邻模块和同类型实现；
- 当前生态的官方资料、成熟实现和已验证实践（适用时）。

项目内调研达到下面条件时即为充分，不为了形式完整继续扩大搜索：

```text
相关会话与当前 canonical truth 已检查
+ 项目规则、公共机制和真实调用方已检查
+ 直接同类型实现、测试与 failure evidence 已检查（存在时）
+ 候选方案的成立条件、material 差异和后果已经能够解释
+ 没有仍会改变当前 Design 的可调查未知
```

项目内没有可比 precedent、外部 contract 真实约束当前设计，或成熟实现可能改变自研边界时，再调查外部一手资料和成熟实现。简单、非 material 或已有唯一 canonical Design 的任务可以合并调查，但仍要能够指出依据。

模型已有知识可以帮助发现调查方向和候选方案，但 material Design 不能只由模型先验、局部代码片段或“通常这样做”推出。项目中不存在适用 precedent 时，AI 继续调查外部成立条件接近的方案；evidence 仍不足时，明确 hypothesis 和验证入口，不凭空补齐事实。

AI 负责完成调查、比较和专业取舍，并完成所有不依赖缺失信息的设计；受未知影响的部分先形成条件化方案和推荐。用户不负责替 AI 查项目、解释代码、选择普通技术方案或完成架构分析。只有缺失信息确实属于 user-owned 目标、价值、偏好、风险接受、组织约束或授权，而且无法从会话和其他 evidence 唯一推出时，才请求用户补充该 context。

### 4.3 Existing Pattern Review 同时检查公共写法和同类型写法

项目不是默认的绿地环境。设计当前能力前，主动寻找并比较：

- 项目级 canonical 规则、公共 primitive 和 shared infrastructure；
- 同一 owner、contract、lifecycle 或 responsibility family 下的实现；
- 同类型 command、adapter、repository、state machine、codec、UI interaction 或测试方式；
- 相邻模块中已经稳定承担同类问题的写法；
- 工具链、调用方、运维和测试已经依赖的结构。

“没有抽成公共组件”不表示它不构成 precedent。同类型实现即使位于不同模块，也可能共同定义必须保持的 lifecycle、状态转换、错误语义、注册方式、dependency direction 或验证方式。

比较不能只看代码外形。按当前问题实际涉及的维度，详细比较：

```text
目标和成立条件
→ responsibility / owner
→ public 与 internal contract
→ data / control flow
→ schema、state transition 和 lifecycle
→ success、failure、concurrency 和 recovery semantics
→ dependency、extension、registration 和 discovery
→ 测试边界与验证方式
→ compatibility、migration 和长期维护后果
```

比较后把关系分成三类：

- **必须保持一致**：已有 contract、工具链或调用方真实依赖；属于同一 canonical pattern；或同类型对象成立条件一致，差异会制造第二套语义；
- **优先保持一致**：一致性能够降低认知和维护成本，但当前重要结果允许有依据的局部变化；
- **可以偏离**：当前 Requirement、责任、环境或 failure semantics materially different，或现有写法已有明确缺陷和迁移方向。

多个 precedent 冲突时，不按“最先找到”或“代码最像”选择。依次确认：当前 canonical Requirement / Contract / Design 是否已经决定；真实调用方、工具链或数据是否依赖其中一种；哪些属于当前主路径、legacy、迁移中状态或局部例外；各自成立条件是否与当前问题一致。Evidence 已支持最佳专业方案时由 solution owner 选择并记录依据；仍缺 user-owned 方向时才请求最小补充。

成立条件相同且没有 material 理由时，默认严格参考已有写法，不重新设计一套近似机制。当前 Requirement 和 canonical Design 拥有“应该怎样”，existing code 只证明“当前怎样”和真实兼容约束；两者冲突时先分类，不能让旧实现静默改写 Requirement。决定偏离时，Design 必须说明参考对象、差异、偏离依据、影响以及是否需要迁移其他同类型实现。§10 进一步规定外部成熟实现和通用能力的复用边界。

例如，新增名称设置与已有设置命令使用同一个调用协议，客户端已经依赖统一错误结构，因此应沿用该结构。另一个导入命令即使代码相似，其“跳过坏记录后继续”行为也不能直接复制给本例：R2 已要求非法名称不修改原名称。比较的对象是成立条件和行为责任，代码外形只是寻找参考的线索。没有参考实现也不等于无限搜索；当前 contract、必要机制及其证据已足够，且没有会改变设计的可调查未知时，按 §4.2 停止调研。

### 4.4 设计讨论用于校准方向，不把专业责任退回用户

对应 Design Gate 通过前，AI 必须让用户看见会 materially 影响结果的设计、precedent 比较、关键依据和偏离点，使用户能够用自己拥有的背景纠正方向。该讨论由 AI 提供已经能够确定的设计和明确推荐，不把未经整理的技术选项交给用户选择。

这里的重要方案，指会改变 §3 所列的行为、重要体验、责任、状态保证、架构或长期维护边界的设计选择。直接落实已经确认的具体规则、修正其实现偏差和等价局部编码，不自动成为新的重要方案。

**为什么展示后还要等待回复。** “目标清楚、没有缺口、方案最好”可能只是 AI 在自己的理解范围内得出的结论。用户看见具体方案后，才可能指出 AI 没意识到的背景和取舍。只有展示而不等回复，用户就没有机会在实施前纠正这类偏差。因此，等待不以 AI 是否发现未知为前提，也不要求用户先声明“逐步确认”。

```text
调研事实和参考对象
→ AI 的比较与专业判断
→ 不依赖未知的已完成设计
→ 受未知影响部分的条件化方案及推荐理由
→ 依据用户历史表达推导出的目标和取舍
→ 仍然只能由用户补充的 context（如有）
```

以上内容统一写入 Design Evidence & Alignment，不拆成多个辅助 artifact。对应 Gate 分别检查三项义务：

- **可见义务**：Material Design、关键依据、precedent 关系和影响必须在依赖它的 implementation 开始前让用户实际看见；AI 能独立完成专业设计、上下文能够唯一推出或已有专业委托，都不取消该义务。
- **等待义务**：新的重要方案展示后，保持对应 Design Gate 打开，等待用户针对该方案回应并明确允许继续，再进入依赖它的实施。AI 认为上下文唯一、没有 user-owned gap，或拥有一般性的专业设计委托，都不能跳过等待。此前已展示且获得明确允许的具体方案不重复确认；新出现的重要方向、偏离或影响需要再次展示和等待。
- **已知缺口的裁决义务**：只有未解决的 user-owned context 会 materially 改变 Design 时，才请求 decision owner 补齐相应信息或取舍；普通技术方案继续由 solution owner 完成。这项信息分类不替代上面的方案回应。

回应的内容也必须足以继续：用户提问、表达担忧、纠正方案或只谈另一件事，不等于批准当前方案。先处理相关问题；方案有重要变化时，展示变化后的版本并取得允许继续的回应。未回复和等待了一段时间都不表示默认接受。等待期间可以继续不依赖该方案的调查与已授权工作，不能提前实施待确认的部分。

Design Gate 通过还要求实际修改符合 [`software-workflow.md` §1.3](software-workflow.md#13-在-material-move-前对齐在-gate-前审查实际产物) 的 Authorized Execution Boundary。对方案的确认只覆盖展示的对象、方向与条件，不自动增加发布、迁移或其他未展示动作的权限。

记录时区分 AI 推断、专业委托与用户对具体方案的回应。前两者支持 AI 形成推荐；只有第三者能证明本次方案已获得用户允许。一次展示与回应可以覆盖已经明确列出的多个相邻 Design 阶段，不能覆盖之后新出现的重要方向。普通变量命名、等价局部编码以及忠实落实已确认设计的修复，不需要重新提交同一个方案。

**例子。** 用户要求提高搜索速度，AI 调研后推荐增加后台索引。即使 AI 认为这是唯一合理的方案，也先说明提速依据、资源开销和索引更新时机，等待用户回应；用户可能这时才指出“这个工具主要运行在省电环境，不能常驻后台”。若用户明确回复“按这个方案做”，AI 才在该范围实施；之后发现需要上传内容到外部服务，则是新的重要影响，不能借前一句“按方案做”继续。AI 承担调研和推荐，用户通过具体方案检验双方的理解。

---

## 5. 缺少长期 calibration evidence 时仍给出当前 baseline

当前实现必须选择阈值、预算、排序系数或其他参数时，即使 evidence 还不足以证明唯一长期值，Detailed Design 仍给出一个可以直接实现和验证的当前 baseline。

同时明确：

- 哪些参数是 calibration-sensitive；
- 当前 baseline 依据什么形成；
- 后续用什么 representative data 或 production evidence 调整；
- 调整时哪些 mechanism tests 和 implementation 需要同步。

只有当具体数值已经成为用户可观察 contract 时，它才提升到 Requirement / Public Contract。

---

## 6. Acceptance、Fault 与 Mechanism Tests 回答不同问题

### 6.1 Acceptance / Executable Specification

Acceptance Test 证明公开功能行为满足 Requirement。

它的正常结构是：

```text
Given
    通过公开行为建立正常前置状态

When
    通过稳定 public / application contract 执行动作

Then
    观察用户或调用方真正关心的结果、后续状态和稳定 invariant
```

某个故障条件已经属于稳定 guarantee、但公开接口无法自然制造时，Given 可以使用最小 deterministic seam 构造该条件。When 和 Then 仍尽量保持在稳定行为边界。

Acceptance expectation 来自 Requirement、Contract 和已经裁决的行为，不来自 production 当前内部结构。内部重构如果不改变 public behavior，通常不应迫使大量 Acceptance expectation 改写。

### 6.2 Fault / Invariant Tests

Fault / Invariant Tests 验证已经被确认必须保证、但正常公开路径不容易制造的故障和不变量。

技术事件“可能发生”只说明它值得被看见；只有 Requirement、责任边界或可靠因果关系已经定义了对应 guarantee，才需要验证该 guarantee。

```text
可能发生
≠ 产品承诺恢复
≠ 测试必须证明恢复
```

### 6.3 Mechanism Tests

Mechanism Tests 验证已经属于 Design 的 pure algorithm、parser、deterministic transform、状态转换等机制。

它们可以知道内部实现，但不能冒充 Requirement 覆盖。一个内部函数测试通过，只证明该机制满足当前 Design expectation；公开能力是否成立仍由 Acceptance 或对应验证方法证明。

### 6.4 同一功能的三类测试

沿用 §1.1 的项目名称案例。`Given` 建立前置条件，`When` 执行被测动作，`Then` 观察结果；下面每行都必须能追溯到已写出的 Requirement 或 Design。

| 类别 / 依据 | Given | When | Then |
|---|---|---|---|
| Acceptance / R1 | 当前名称为 `Old` | 调用 `setName("  Maple  ")` | 成功结果为 `Maple`，随后 `getName()` 为 `Maple` |
| Acceptance / R2 | 当前名称为 `Old` | 分别提交全空格和 21 个 ASCII 字符；每个场景独立初始化 | 返回 `invalid-name`，随后读取仍为 `Old` |
| Acceptance 边界 / R1、R2 | 当前名称为 `Old` | 分别提交 1 个、20 个 ASCII 字符 | 均保存成功；与 0 个、21 个的拒绝行为一起覆盖长度边界 |
| Fault / R3 | 当前名称为 `Old`；存储端口下一次提交在写入前抛错 | 调用真实 `setName("Maple")` | 返回 `save-failed`，随后读取仍为 `Old` |
| Mechanism / Detailed Design | 已定义一个纯名称处理函数 | 输入首尾带空格的字符串 | 得到裁剪后的字符串；是否单独保留此测试，取决于机制复杂度和诊断价值 |

这里用存储端口构造失败，是因为公开 API 没有“让下一次存储失败”的参数。故障从资源边界注入，名称校验和错误映射仍由真实 application 执行。Fault 与 Acceptance 并非完全互斥：R3 也是公开行为保证，“Fault”额外标明了它需要特殊故障前提。

如果只断言“内部校验 helper 被调用一次”，则既没有证明非法输入被拒绝，也没有证明旧名称保留。即使以后 helper 被内联，只要公开结果不变，上面 Acceptance 场景仍应成立。检查内部机制可以补充诊断，不能替换这些断言。

---

## 7. 稳定测试意图，允许测试 wiring 自然变化

测试中真正需要稳定的是：

- Scenario 的业务意图；
- input boundary；
- expected observable behavior；
- 核心 assertion；
- 已确认的 invariant。

constructor、factory、DI、fixture、resource wiring 和局部 helper 可以在接入 production 或实现结构变化时调整。测试不为了保持 wiring 永远不变而提前制造 `SutFactory`、统一 Driver、script queue 或 reference implementation。

每个场景只创建当前需要的 fake state。Mock / Stub 的行为尽量紧靠下一次 action 声明，使阅读顺序保持：

```text
Arrange 当前动作
→ Act
→ Assert
```

稳定、真实、重复的测试 wiring 出现后再抽 shared helper。抽象不带走 Scenario 的业务含义。

---

## 8. 区分测试自验证、业务逻辑验证和真实资源验证

### 8.1 Minimal Fake Green

Acceptance test 在接入 production 之前，可以用最小 Stub / Fake 做 self-validation。

Fake Green 证明：

- 测试代码可以执行；
- fixture、matcher 和参数化正确连接；
- Scenario 自身的 Arrange → Act → Assert 能够自洽。

Fake Green 不证明 production 已实现功能，也不证明真实 adapter 或环境满足假设。按 expected result 配置的 Fake 与测试一起通过，也不能单独证明断言足够严格或能识别错误结果；这些还需通过 Test Review，以及必要时有意提供错误返回值观察测试是否失败来检查。

### 8.2 默认确定性 CI

需要快速、确定性 CI 时，采用：

```text
真实 production business / application logic
+
最小 fake / stub resource boundaries
```

普通对象、数组和内存中的测试数据不属于“真实外部资源”。需要隔离的是会依赖环境、产生非确定性或启动真实 adapter 的边界，例如 filesystem、network、process、host、browser、LLM 和真实 wall clock race。

### 8.3 真实资源验证

真实 filesystem、进程、网络、浏览器、设备、LLM、host wiring、restart 或多进程行为是否进入 CI、integration、E2E、release gate 或人工验收，由当前项目的 Requirements、风险和 Test Strategy 决定。

真实资源验证不是所有项目的统一必经阶段。项目已经承诺某项真实 adapter 或环境 guarantee 时，必须选择能够真实证明它的验证方式；没有这项承诺时，不为了工程形式完整扩大验证范围。

### 8.4 示例：测试自验证与真实业务验证怎样接线

沿用 §1.1。本节代码是说明接线关系的伪代码，省略框架导入，不是本仓库已运行的测试。`fixture` 是测试所需的前置数据，`matcher` 是比较实际结果与预期的断言工具，`wiring` 是把测试接到被测对象与资源的方式。

**测试脚本自验证。** 若按 workflow §12 需要 Fake Green，可以先给一个场景提供预定返回值，检查测试步骤能否执行：

```ts
const fakeApp = {
  setName: async (_raw: string) => ({ ok: true, name: "Maple" }),
  getName: async () => "Maple",
};
const result = await fakeApp.setName("  Maple  ");
expect(result).toEqual({ ok: true, name: "Maple" });
expect(await fakeApp.getName()).toBe("Maple");
```

这个 Fake 没有执行裁剪、校验或保存。它通过只说明这一组脚本可以与预定结果配合运行。为检查断言是否真的工作，可以把 Fake 返回的名称临时改为 `Wrong`，确认相应断言失败，再恢复正确值；这只验证该断言的辨错能力，不证明所有场景都有效。其他场景仍按各自前提检查，不能用这一场景的通过代替它们。

**业务逻辑验证。** 接入 production 时保留场景的输入和期望，改用真实 application，只有存储资源被替换：

```ts
let storedName = "Old";
let failBeforeWrite = false;
const memoryStore = {
  read: async () => storedName,
  commit: async (name: string) => {
    if (failBeforeWrite) throw new Error("storage unavailable");
    storedName = name;
  },
};
const app = createRealNameApplication(memoryStore);

// 每个测试独立建立上面的前置状态；下面展示 R3 的一个场景。
failBeforeWrite = true;
const result = await app.setName("Maple");
expect(result).toEqual({ ok: false, error: "save-failed" });
expect(await app.getName()).toBe("Old");
```

`createRealNameApplication` 代表真正交付的业务代码。`memoryStore` 只保存值或模拟提交前失败，不裁剪名称、不校验长度，也不生成业务错误结果。若把 `app.setName` 替换成固定的 `save-failed` 返回值，就绕开了真正要验证的错误映射。

**证据边界。** 上述业务测试可以发现真实 application 的规则或错误映射缺陷，但不能证明真实文件或数据库 adapter 的写入行为。实际项目若要求真实资源或重启后的保证，按 Test Strategy 另行接入该资源验证。接线可以改变，R1–R3 已确认的期望不因 production 当前表现而改变。Fake Green 的执行条件由 [`software-workflow.md` §12](software-workflow.md#12-minimal-fake-green验证测试脚本自身适用时) 拥有。

---

## 9. UI 产品需要独立的 Experience truth

存在用户界面时，功能正确不等于体验已经定义完整。根据当前产品阶段，明确：

- 用户能够做什么；
- loading、empty、error、success、disabled、permission 等稳定状态；
- 用户怎样完成任务；
- 页面、region 和 component 的信息层级；
- visual、responsive 和 accessibility baseline；
- functional、visual、accessibility 各自怎样验收。

自动化无法可靠判断的体验项可以由真实浏览器、设备、Design QA 或人工验收承担。验证方式服务于 Experience truth，不为了让所有检查进入 CI 而改写产品要求。

### 9.1 UI 还原与复杂布局的拆解方法

根据截图、设计稿还原 UI，或复杂布局需要显式说明组件关系时，由 Experience / Visual Design 的 solution owner 按以下方法形成当前 baseline。简单 UI 已有足够明确的组件契约时，可以合并表达。

1. **识别实际边界。** 根据输入和使用上下文确认对象是完整页面、弹窗还是局部模块，明确宿主提供的空间与约束。根节点按实际职责命名，不从截图默认推出全屏 App、固定高度或未展示的区域。截图能证明当前可见外观，不能单独证明交互、其他状态和响应式规则；这些内容从对应 contract 或补充 evidence 确定。
2. **逐层建立语义结构。** 按 §4.1 每次只展开当前容器与直接子节点，用能表达职责的名称标识 region 和 component，并保持跨层身份一致。当前任务明确要求原子级高保真拆解时，继续到按钮、图标、文本等原子单元；其他任务以已有组件契约足够落实当前要求为停止条件。每个复合节点应有下层定义、可引用的既有契约，或明确的未完成标记。
3. **分别记录外部约束和内部布局。** 父层记录子节点在当前容器中的尺寸、伸缩、位置等约束；展开子节点时记录它自身的流向、对齐、间距、内边距和溢出处理。各项约束归属按真实关系确定。例如，父层规定 `Header` 的高度和不可收缩，`Header` 层规定左右分组怎样排列；下层引用上层约束，避免重复维护。
4. **分别表达布局和视觉。** 结构视图表达空间关系；视觉清单按同一组件身份记录颜色、背景、边框、阴影、字体及适用状态，并覆盖当前范围内的所有组件；无额外样式或继承已有定义时注明来源。分开表达用于降低混淆，组合检查仍需考虑字号、行高、边框等对尺寸、换行和排布的影响。语义化标签和 Tailwind 只是可选记法，不规定生产代码必须采用某种框架或标签。
5. **提取可复用的 design token。** Design token 是有名称、语义和取值的共享设计变量，例如颜色角色、间距、字体尺度和圆角。优先引用已有设计系统；新增 token 基于已确认的共同语义，记录名称、取值、来源及组件引用，局部例外保留在组件定义中。截图估计值标明待校准，不把视觉近似宣称为精确取值，也不为每个偶然数值制造共享抽象。
6. **组合验证当前承诺。** 文档形成后检查边界、逐层覆盖、约束归属以及组件与样式/token 的对应关系；实现后在当前约定的视口、内容和状态下，将真实渲染与参考比较。按已承诺的还原程度检查结构、尺寸、间距、字体和视觉差异，并验证适用的响应式与交互状态。缺少参考或实际渲染证据时，明确尚未验证的范围；文档完整本身不能证明像素级还原。

结构、视觉清单和 token 可以作为同一份 Design 的不同视图，不要求新建多份文档。它们共同落实当前 Experience truth，内部组件实现细节继续由相应 Detailed Design 拥有。

### 9.2 完整示例：局部信息面板的分层设计

**背景与输入。** 以下是教学用的假设案例，不是对某张真实截图的测量结果。当前任务只定义宿主侧栏中的信息面板：宿主提供 320px 可用宽度，面板高度随内容增长；面板包含标题栏和说明区，标题为“项目说明”，说明为“查看当前项目的基本信息。”。标题栏高 48px，右侧是 24px 的关闭按钮。尺寸、文字和下表 token 均假设已由当前设计稿确认；关闭操作调用宿主的关闭接口，不自行销毁宿主状态。本例覆盖默认状态的布局和外观；按钮的键盘、焦点和其他交互状态沿用已确认的项目按钮契约。

**边界判断。** 输入对象属于局部面板，因此根节点命名为 `InfoPanel`，宽度使用宿主可用空间。它不拥有整页高度、背景遮罩或弹窗定位。下面使用语义标签和 CSS 声明表达设计，不是可直接运行的 HTML 组件实现。

**Level 0：只定义 InfoPanel 与直接子节点。**

```html
<InfoPanel style="display: flex; flex-direction: column; width: 100%; min-width: 0">
  <PanelHeader style="height: 48px; flex-shrink: 0"></PanelHeader>
  <PanelContent style="min-width: 0"></PanelContent>
</InfoPanel>
```

这里的 `width: 100%` 是根节点承接宿主的边界约束。`InfoPanel` 决定标题栏占用 48px 高度；本层看不到标题和按钮，它们属于下一层。

**Level 1：分别展开两个直接子节点。**

`InfoPanel > PanelHeader`：

```html
<PanelHeader style="display: flex; align-items: center; gap: var(--space-inline); padding-inline: var(--space-panel)">
  <PanelTitle style="flex: 1; min-width: 0">项目说明</PanelTitle>
  <CloseButton style="width: 24px; height: 24px; flex-shrink: 0">×</CloseButton>
</PanelHeader>
```

`InfoPanel > PanelContent`：

```html
<PanelContent style="display: flex; flex-direction: column; padding: var(--space-panel)">
  <Description style="min-width: 0">查看当前项目的基本信息。</Description>
</PanelContent>
```

两个 `PanelHeader` 是同一个节点的不同设计视图：Level 0 拥有它的外部高度约束，Level 1 拥有它内部的排列与内边距。Level 1 没有重写高度，也没有取消高度。`PanelContent` 的 `min-width: 0` 同理来自 Level 0。

**停止条件。** `PanelTitle` 和 `Description` 是纯文本原子，`CloseButton` 是已有按钮契约下的单个按钮，本例到此停止，没有 Level 2。`PanelTitle` 采用单行省略，`Description` 正常换行；`CloseButton` 的可访问名称为“关闭项目说明”，激活后调用上述宿主接口。这些是叶节点的已知契约，不需要为了凑层级再画一个内部节点。若按钮契约未知且会影响当前承诺，应补齐该契约；若任务要求拆解按钮内部图标与文字，则继续展开，不能直接套用本例的停止结论。

**共享 token。** 以下值假设来自本例已确认的设计稿，在同一设计定义中维护；48px 标题栏高度和 24px 按钮尺寸暂属局部约束。

| Token | 语义 / 取值 | 引用位置 |
|---|---|---|
| `--space-panel` | 面板内容留白 / `16px` | PanelHeader、PanelContent |
| `--space-inline` | 行内控件间距 / `8px` | PanelHeader |
| `--color-surface` | 面板表面 / `#ffffff` | InfoPanel |
| `--color-text` | 默认文本 / `#1f2937` | InfoPanel，后代继承 |
| `--color-muted` | 次要文本 / `#6b7280` | Description |
| `--font-body` | 正文字号 / `14px` | InfoPanel，后代继承 |

**非布局样式清单。** 六个节点全部有去向；继承不表示缺失。

| 节点 | 当前默认状态的视觉定义 |
|---|---|
| InfoPanel | 背景 `var(--color-surface)`；文字 `var(--color-text)`；字号 `var(--font-body)`；沿用项目字体；行高 `20px` |
| PanelHeader | 继承，无额外视觉样式 |
| PanelContent | 继承，无额外视觉样式 |
| PanelTitle | 继承，字重 `600` |
| CloseButton | 继承文字色和字体；透明背景、无边框；其他状态引用已有按钮契约 |
| Description | 继承，文字色覆盖为 `var(--color-muted)` |

**落实为代码时合并，而不是用下一层覆盖上一层。** 实现中的同一个 `PanelHeader` 同时具有以下布局声明；视觉定义再按清单与继承关系应用：

```css
/* 来自 Level 0 的父层约束 */
height: 48px;
flex-shrink: 0;
/* 来自 Level 1 的内部布局 */
display: flex;
align-items: center;
gap: var(--space-inline);
padding-inline: var(--space-panel);
```

如果两个视图给同一个属性提出互相冲突的值，应回到对应约束 owner 处理，不能依赖 CSS 覆盖顺序偷偷选一个答案。

**怎样检查本例。** 文档检查可以确认：Level 0 的两个复合节点都已展开，三个叶节点都有契约，六个节点都有视觉去向，所有 token 引用都有定义。实现后仍需在宿主提供 320px 宽度时检查标题栏高 48px、按钮尺寸 24px、左右留白 16px，以及字体和实际换行结果；关闭行为和已有按钮契约也应按当前验收范围验证。这些渲染与行为检查在本教学案例中没有执行，不能报告为已通过。

**条件改变时怎样推导。** 宿主改为提供 280px 宽度时，先沿 `width: 100%` 和叶节点换行契约重新检查组合结果，不直接给根节点固定 320px。任务改为弹窗时，重新确定遮罩、定位、焦点和关闭责任；本例的局部面板边界不再足以指导设计。

---

## 10. 成熟实现优先承担通用能力

Detailed Design 已确定当前语义后，如果 leaf 属于通用 Tool primitive、协议/宿主 adapter、filesystem/process/network 基础设施，或生态中已有高度相近的成熟实现，先审查其真实复用边界。

默认顺序是：

```text
成立条件接近的成熟同类实现
→ 稳定 public API / extension point / operation seam
→ 可以承载当前能力：直接依赖，在外层增加领域语义
→ 只有局部不适配：局部替换、裁剪或 fork
→ 无法直接复用：采用其已验证的更低层 primitive / library
→ 平台 / 协议官方稳定能力
→ 其他成熟 library
→ 仍有真实未覆盖差异时，自行实现最薄的一层
```

审查同时看：

- control flow 和 responsibility boundary；
- cancellation、timeout 和 concurrency；
- empty、not-found、malformed、oversized、partial-result 等 failure semantics；
- platform-specific handling；
- output bounding / continuation；
- dependency choice；
- upstream tests 覆盖的边界；
- 安装、构建、启动、运行和供应链成本。

“包更大”“传递依赖更多”“自己写看起来更直接”不是单独否决成熟实现的充分理由。比较时同时计入自研的维护、平台兼容、边界遗漏、行为漂移和重复测试成本。

Reference implementation 是 implementation evidence，不取代当前 Requirements、Contract、Acceptance 和 Design。若它与 Frozen semantics 冲突，先判断成立条件、Design gap 和 adapter boundary，再决定直接复用、外层适配或局部替换。

---

## 11. Implementation Plan 是执行导航，不是 truth layer

Implementation Plan 只在多个依赖、多人或多 Agent 交接、跨 package cutover、复杂 delivery order 等情况下出现。

它只组织：

```text
task / slice goal
+ canonical specification / Design refs
+ dependencies / delivery order
+ expected implementation area
+ required verification
+ done condition
```

Architecture、algorithm、state transition、operation sequence 和 failure semantics 继续由 Design owner 决定。Plan 直接引用这些 owner，不重新写第二份 Design。

单文件、小改动、单 owner 或执行顺序天然清楚时，可以直接从 Frozen Acceptance + Design 进入 tests / implementation。

---

## 12. 同时保持正向 traceability 与 Original Intent Reverse Audit

正向 traceability：

```text
Requirement
→ Contract / Scenario
→ Acceptance
→ Design
→ tests / implementation
```

它回答：已经定义的要求是否都有落实和验证。

Original Intent Reverse Audit：

```text
原始背景 / 目的
→ 核心使用或运行过程
→ 主要 failure / opportunity
→ responsibility / guarantee
→ 当前 Requirement / Design / implementation
```

它回答：为了让原始目标成立，是否还有一级能力没有进入规格，或者当前内部虽然自洽，但早期理解已经偏离。

例如，名称修改的测试全部通过，但原始目标是“其他成员打开项目时能够识别它”，而规格只检查设置窗口中的名称。如果实际其他成员看到的仍是旧名称，正向映射即使完整，也不能证明原始目标成立。反向检查应回到原始要求判断共享可见性是否被遗漏，再由对应 owner 修正；不能只为了让审查表完整，临时发明一个共享功能。反过来，原始目标只要求个人别名时，共享可见性就不属于这个要求。

两条链都成立，才能说明当前交付既完整，又没有失去最初目的。

---

## 13. 软件文档优先让低经验执行者得到一致理解

规范性文档按下面的顺序表达：

```text
为什么需要
→ 什么时候适用
→ 谁负责
→ 依据什么判断
→ 应该怎样做
→ 得到什么结果
→ 失败或不适用时怎样解释
```

关键术语第一次出现时给出明确含义。条件、owner、输入、输出和完成标准直接写出，不依赖读者从多个章节自行拼接。

同一个概念只保留一个 canonical owner。必要摘要靠近 decision point，并链接到完整定义。先保证语义正确、低歧义和执行一致，最后才压缩文字。
