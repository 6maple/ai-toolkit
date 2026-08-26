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

每完成一层，回到 parent 检查各部分组合后是否仍满足原目标。一个较低经验实现者忠实按 Detailed Design 编码时，不应仍需自行决定会 materially 改变行为、责任、状态或主要 failure semantics 的问题。

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

### 4.4 设计讨论用于校准方向，不把专业责任退回用户

对应 Design Gate 通过前，AI 必须让用户看见会 materially 影响结果的设计、precedent 比较、关键依据和偏离点，使用户能够用自己拥有的背景纠正方向。该讨论由 AI 提供已经能够确定的设计和明确推荐，不把未经整理的技术选项交给用户选择。

```text
调研事实和参考对象
→ AI 的比较与专业判断
→ 不依赖未知的已完成设计
→ 受未知影响部分的条件化方案及推荐理由
→ 依据用户历史表达推导出的目标和取舍
→ 仍然只能由用户补充的 context（如有）
```

以上内容统一写入 Design Evidence & Alignment，不拆成多个辅助 artifact。Material Design 必须让用户实际看见；展示后，只有该方向尚未完成对齐、不能由上下文唯一确定且没有明确委托时，才保持 Gate 打开等待用户纠正或允许继续。已经看过并允许继续、通过 `core.md` §4.1 唯一推断测试，或已在明确范围内委托给 AI 的内容，记录成立依据后可以推进，不机械重复提问。同一次讨论可以覆盖相邻 Design 阶段，但不能以“AI 能独立设计”为由静默跳过对齐。只有未解决的 user-owned context 会 materially 改变 Design 时，才把问题作为 `decision owner` blocker 请求最小充分补充；普通设计讨论不把专业决定转交给用户。

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

Fake Green 不证明 production 已实现功能，也不证明真实 adapter 或环境满足假设。

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
