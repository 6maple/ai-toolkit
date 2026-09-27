# 05 · 从证据与认知模型向 Brain 设计推导

> **文档角色：Detailed design derivation working document。** 本文保存 v7 的详细推导过程。它包含若干早于最新讨论形成的阶段性结论；如果与 [06-current-architecture.md](06-current-architecture.md) 冲突，以后者记录的当前 baseline 为准，再回到本文修正相应推导。
>
> 本文主体从迁移前的 living Base 设计稿整理而来。正文中少量历史段落仍使用“Base”指代当时的研究 / 设计层；除非明确在引用新的 [Base](../base/README.md) 根锚点，否则应把这些用法理解为 **v7 的历史工作语境**，不能据此把当前推导重新升级成 Base authority。
>
> 本文把 [02-generalist-cognition-research.md](02-generalist-cognition-research.md) 的认知研究、[01-llm-capability-and-failures.md](01-llm-capability-and-failures.md) 的模型 capability / failure evidence、[04-model-harness-brain-boundary.md](04-model-harness-brain-boundary.md) 的系统责任边界、[03-problem-representation-and-control.md](03-problem-representation-and-control.md) 的当前综合理解，以及 research/ 下的详细工作稿一起转换成 Brain 后续设计必须回答的问题。
>
> 当前出现的 RAG、BM25、GraphRAG、role、core、description、top-k 等都先保持为**下游候选机制**。只有它们能够沿本文的因果链解释为什么改善 Base 根目标，并经过真实模型行为验证，才应进入版本 Contract。

## 0. 最新修正：模型是主体，补偿机制从真实 failure 推导

用户实际使用的是 Model。Brain 是给 Model 使用的 cognition / continuity 支撑；Harness、Tool 与 Runtime 也都是为了让 Model 更可靠地完成理解、调查、判断、执行和反馈修正。

因此设计顺序改为：

~~~text
Model 真实能稳定做好什么
→ 哪些能力存在但不稳定
→ 哪些现实事实模型没有外部信息就无法可靠知道
→ 哪些 invariant 软件能够更可靠地机械保证
→ 再决定 Brain / Prompt / Skill / Harness / Tool / Runtime 分别补什么
~~~

当前尤其不能依赖：

~~~text
模型自己可靠知道：
    信息是否已经足够
    自己漏了哪些 cognition / evidence
    第一解释是否真实
    是否还存在会改变行动的 alternative
    自己是否已经完成真实验证
~~~

由此得到的当前方向是：

~~~text
Brain
    负责长期 cognition 的 continuity / recall / maintenance

Stable Route
    用容易观察的 task surface 帮模型进入正确 cognition domain

Domain Skill / workflow
    定义这类工作怎样做好
    + 当前通常需要覆盖哪些 cognition / 项目现实 / 外部 information
    + Required / Default / Conditional
    + 进入下一阶段所需的 evidence / result

Tool / external source
    提供模型当前无法仅靠内部 reasoning 知道的现实信息

Harness / Runtime
    只承担已经确认需要 guarantee、且能低成本确定性保证的 invariant
~~~

Required / Default / Conditional 不再只是 memory retrieval policy。它们描述当前 domain 的 information coverage，可以作用于 Brain cognition、Requirement / Design、代码、tests、Git、runtime、official docs、experiment 或 user-owned input。

同时继续区分：

~~~text
canonical owner / lifecycle
≠
当前任务的 coverage bundle
~~~

共同读取不要求合并 canonical owner，也不要求所有 information 都进入 Brain。

详细当前 baseline 见 [06-current-architecture.md](06-current-architecture.md)。

## 1. Brain 最上游应该帮助维持什么

从根模型看，长期 AI cognition 至少包含六类不同但互相作用的东西：

1. **当前 working model**
   - 用户现在真正想实现什么；
   - 当前任务发生在什么现实和历史背景；
   - 当前问题被怎样 framing。

2. **epistemic state**
   - 已确认事实；
   - 当前解释 / inference；
   - provisional hypotheses；
   - 尚未解决、会改变方向的 unknown；
   - 哪些 cognition 已受到 challenge。

3. **continuity**
   - 已确认目标、取舍、decision、constraint、intention；
   - 未完成工作及为什么仍未完成；
   - 以前已经取得、未来仍可复用的 evidence / lesson。

4. **methods / skills**
   - 当前类型问题适合怎样调查、推理、设计、验证；
   - 方法的成立条件、停止条件和失败回退。

5. **cross-domain structure**
   - 相似的 causal pattern；
   - responsibility / ownership pattern；
   - failure mechanism；
   - decision structure；
   - 可迁移的 analogy，以及 analogy 在哪里失效。

6. **metacognitive guidance**
   - 当前理解不充分时如何发现它；
   - 什么时候应该相信成熟模式；
   - 什么时候需要重新展开机制；
   - 如何判断下一步需要什么 evidence；
   - 怎样选择当前最适合的认知方式 / role。

这六类内容不等于六种存储 schema，也不等于“每轮都应常驻”的六类 root。它们首先是 Brain / Model + Harness 长期需要处理的**认知职责**。具体是否需要结构化字段、普通 Markdown、关系图、runtime state 或只靠主模型理解，要在后续 Design 中分别判断。

其中每轮 Universal Cognitive Root 以 [03-problem-representation-and-control.md](03-problem-representation-and-control.md) 的当前综合理解与真实开发 case 校准为当前上游依据：优先保持 `Frame → Monitor → Control → Evidence/Feedback → Frame` 这个小闭环；其他方法、领域 cognition、Agent collaboration 约束再从它向下展开。真实 case 已验证的重点不是三个抽象名词本身，而是：不要把 surface request 直接当任务定义；检查当前 frame / pattern 的成立条件与 material alternative；再根据真实 bottleneck 选择下一 cognition action，并在新增信息不再改变行动时停止。

## 2. 一个更上游的运行闭环

未来任何 Brain 版本，都应该能解释自己怎样帮助下面这个循环，而不是只解释 memory CRUD：

```text
new user / environment event
        ↓
Frame
    结合当前表达、conversation、必要 past cognition 与现实 evidence
    构造 / 更新可修正的当前问题表征
        ↓
Monitor
    检查 evidence basis、material alternatives / unknown、anomaly
    检查已有 pattern / analogy / compressed expertise 的成立条件
        ↓
Control
    ├─ 使用成熟模式直接继续
    ├─ deeper recall
    ├─ project / external research
    ├─ ask user-owned context
    ├─ causal / mechanism decomposition
    ├─ analogy / cross-domain comparison
    ├─ experiment / simulation
    ├─ skeptic / verification
    └─ stop / act
        ↓
新 evidence / outcome / feedback
        ↓
更新 Frame
        └────────────────→ 下一轮
```

这里 Brain 最直接拥有的是 past cognition 的 persistence / discovery / update；但 Brain 的 model-facing guidance 也可能帮助主模型把 recall 正确放进整个 sensemaking loop。

### 2.1 新方案先独立成立，再处理旧 Brain cognition

当前目标是设计一套新的 Brain 能力模型，不是重构已有 `reasoning-and-action.md` 或其他历史 memory。现有 Brain cognition 可以提供过去真实使用中的 evidence，例如哪些问题反复出现、哪些 guidance 曾经有效或误导，但它们不拥有新方案的能力边界。

因此后续顺序固定为：

```text
研究中的稳定认知机制
+ 真实 Agent / 软件开发 case
↓
独立形成新的 capability / behavior Contract
↓
确定各能力之间的 owner、边界和依赖
↓
再设计 cognition organization、routing、retrieval、maintenance
↓
新方案稳定后
→ 把旧 Brain memories 当作 migration input
→ 逐项决定复用、改写、合并或淘汰
```

不能反过来因为旧 memory 已经存在某条规则，就把它提升成新设计 requirement；也不能为了保持旧文件结构而限制新的 capability boundary。

## 3. 如何识别“当前主要认知瓶颈”

不应只按 workflow stage 决定模型怎样思考。Stage 是 evidence，真正应驱动选择的是当前阻止正确行动的 bottleneck。

可以先研究以下信号是否足够稳定：

### 3.1 意图 / meaning ambiguity

表现：

- 用户表达是 solution-level，但目的不清；
- 同一句话存在多个 materially different interpretation；
- assistant 历史已经形成某个解释，但用户正在纠正或表现出不一致。

需要的认知动作通常偏向：

```text
sensemaking
+ conversation / memory recall
+ interviewer / communicator
```

### 3.2 factual uncertainty

表现：

- 目标清楚，但关键事实未知；
- 事实可以从代码、日志、外部资料、数据中取得。

通常偏向：

```text
investigator / researcher
+ source verification
```

### 3.3 causal / mechanism uncertainty

表现：

- 已知“发生了什么”，不知道为什么；
- 当前 solution 是否有效取决于中间 mechanism。

通常偏向：

```text
diagnostician
+ mechanistic reasoning
+ experiment
```

### 3.4 novelty / low pattern validity

表现：

- 环境与过去经验成立条件不同；
- 出现 anomaly；
- 高 consequence 且反馈历史不足。

通常需要降低对直觉 / 压缩经验的信任：

```text
decompress
→ first-principles / mechanism
→ external evidence
→ multiple hypotheses
```

### 3.5 solution uncertainty

表现：

- problem frame 相对稳定；
- 有多个不同方案会产生 materially different trade-off。

偏向：

```text
designer / strategist
+ precedent research
+ trade-off reasoning
```

### 3.6 completion / confidence uncertainty

表现：

- 方案看起来完成；
- 但关键 claim 尚未由真实结果证明。

偏向：

```text
skeptic / verifier
+ adversarial example
+ test / observation / premortem
```

这些类别本身也只是当前研究用的 frame。以后若真实模型 eval 表明某些分类无助于行为，不应为了分类完整继续保留。

## 4. Role 是方法 bundle 的可读标签，不成为 runtime state

Role 的价值在于帮助人和模型快速指向一组相关 attention、questions 和 methods。

但当前能力层只需要确认 Brain 能够让主模型恢复和使用具体 cognitive methods，而不是维护：

```text
currentRole = interviewer / researcher / designer
```

更准确的关系是：

```text
当前 cognitive bottleneck / decision point
→ 使用一个或多个适用 cognition method
→ 这些方法可以被人类概括成某个 role label
```

例如意图不清时，可以同时应用：

- intent-understanding method：恢复 user-owned experience / intent；
- memory-investigation method：主动恢复用户以前已经表达过的背景；
- diagnostic method：维护多个解释并寻找区分 evidence。

如果 memory 已经足够，intent-understanding method 就应停止继续提问；不需要先执行一次“退出 interviewer role”。

多个方法默认可以局部叠加。上层只需要持续判断：

```text
当前哪些 material bottleneck 仍存在？
当前方法的成立条件是否仍然满足？
新 evidence 是否要求换一种 computation / evidence source？
```

具体方法怎样组合、退出和存储，继续作为后续设计问题，不在 Base 根模型中提前冻结。

## 5. Evidence routing：先判断“什么 evidence 缺”，再判断“去哪找”

Pirolli & Card 的 Information Foraging / Sensemaking work 对这里很有启发：人会根据与当前目标相关的 information scent 选择搜索方向，并在搜集材料与构建更结构化表示之间循环。

Brain 可以借用这个原则，但不需要照搬具体人机界面模型。

一个更适合 Agent 的 routing relation：

```text
当前 claim / unknown 是什么？
↓
谁最可能拥有直接 evidence？
↓
哪个 source 取得成本低、可靠性高、最能改变判断？
↓
获取
```

### 5.1 Past cognition

问题：

- 用户以前讲过吗？
- 以前已经形成过 decision / lesson / skill / causal understanding 吗？
- 当前是在回应哪段历史讨论？

来源：

```text
Brain recall / search / exact read
```

### 5.2 Current project / environment fact

问题：

- 当前代码到底怎样实现？
- 配置、数据、运行行为和测试实际是什么？

来源：

```text
project tools / logs / tests / runtime
```

### 5.3 External reality

问题：

- 某 API、产品、标准、研究、市场事实现在怎样？

来源：

```text
official docs / web / primary source / mature implementation
```

### 5.4 User-owned context

问题：

- 目标、体验、价值、优先级、风险接受；
- 具体经历中只有本人知道的事实。

来源：

```text
user
```

这里 interviewer role 才真正必要。

### 5.5 Uncertain mechanism

问题：

- 两个解释都合理，现有材料无法区分；
- 当前系统是否真的产生某效果。

来源：

```text
experiment / prototype / counterexample / simulation
```

## 6. Active Recall 的根 trigger 应来自 information need

这直接影响当前正在讨论的 `brain_ask_search`。

过去的 wording：

```text
After you have understood the current task...
→ call brain_ask_search
```

存在因果顺序问题，因为 recall 本身可能是形成更准确理解所必需的 evidence。

更接近根模型的关系应该是：

```text
从当前消息和相关会话形成足以指导搜索的 provisional understanding
→ 判断哪些过去 cognition 能验证、补全、区分或深化当前理解
→ 基于这个 information need 主动 recall
→ 用结果更新理解
```

这里仍有几个需要后续单独裁决的问题：

- 是否每一轮都主动 recall，还是允许明确无 information need 时跳过；
- “向用户说明当前理解”应该发生在 recall 前、recall 后，还是只在需要 alignment 时；
- query 是一条综合 information need，还是可以分成多个 retrieval intent；
- 搜索是否允许根据第一批结果再次 refinement。

这些都是下游 interaction / retrieval design，不在 Base 里提前冻结。

## 7. Description、正文与 retrieval 的职责需要重新分开

目前讨论已经指出一个重要语义区别：

### Description

更接近：

> **什么时候应该读取这份 cognition。**

它是 model-facing applicability guidance / gist。

### Body

更接近：

> **这份 cognition 实际知道什么、为什么、成立条件和 evidence 是什么。**

本阶段最初考虑过让语义搜索直接处理正文，并按正文片段排序。后续用户明确收敛目标：`ask_search` **仅按 frontmatter 的 `summary`** 发现记忆，正文交给 `brain_grep` 做文字搜索；`description` 仍说明何时值得读。摘要应由正文实际 cognition 支持，不能由适用场景描述替代。目标链路变为：

```text
按 summary 语义发现，或按正文词句 grep
→ 返回有限候选（path + description + summary + 可用状态）
→ 模型按 path 准确读取
→ 用正文、条件与当前证据判断
```

这保留了有限候选和准确读取，也使摘要质量成为语义发现的边界。缺少摘要的旧记忆、只在正文出现的细节可能不会被 `ask_search` 找到；不能从无命中推断不存在。当前设计与最小改造见 [13 · 摘要语义发现](13-body-semantic-search-design.md)。

## 8. grep / glob / ask_search 的角色应从“用户的信息需求”重新设计

如果 `ask_search` 成为默认 cognition discovery 入口，模型不应该被要求先选择：

> “这是 semantic search，还是 BM25，还是 glob？”

这属于 retrieval implementation burden。

更自然的 model-facing 分工可能是：

```text
ask_search
    默认：我想找到与当前 information need 相关的过去 cognition

grep
    专用：我明确要找一个 literal / regex / exact textual occurrence

glob
    专用：我明确要枚举某个 path / directory / filename / role pattern
```

于是 ask_search 内部可以自由演进成：

- dense semantic retrieval；
- BM25 / lexical；
- hybrid fusion；
- relation / graph-assisted expansion；
- reranking。

模型只在真正需要确定性 text/path search 时调用 grep / glob。

这只是当前推导方向，最终仍要用真实模型行为验证是否比“三种 discovery 方法由模型自行选择”稳定。

## 9. Candidate 数量不是根问题；根问题是“给下一判断多少有效 evidence”

当前 top-k 讨论不应该只变成 10、20、50 哪个数字最好。

真正需要衡量的是：

```text
retrieval candidate recall
× candidate relevance
× model-visible token cost
× 模型从候选中正确选择 exact reads 的能力
```

因此后续 calibration 应区分：

1. retrieval 内部候选池；
2. rerank / fusion 后候选池；
3. 最终 model-visible candidate 数；
4. exact body read 的数量和成本。

现有 output budget 已经可以作为最后一层资源边界，内部 top-k 不应无依据地早于真正预算截断。

20–50、64 或其他数值都只是 baseline candidate，需要代表性 memory corpus + real model eval 标定。

## 10. RAG 与 GraphRAG 应从“需要恢复怎样的 cognition”反推

当前不提前裁决 simple RAG 或 GraphRAG。

### 10.1 Simple / hybrid RAG 可能已经足够的情况

如果每份 AI 主动记忆本身已经清楚记录：

- 背景；
- conclusion；
- conditions；
- reasons / evidence；
- 与当前任务相关的关键词和自然语言关系；

那么现代 embedding + lexical hybrid retrieval 可能已经能召回大量有用 cognition，主模型再通过多篇 body 自己恢复关系。

### 10.2 Graph / relation-aware retrieval 可能真正增加价值的情况

如果经常出现：

- 单篇 memory 都不直接命中，但两三篇之间的关系链共同决定当前答案；
- 需要沿 `decision → superseded by → later evidence`；
- 需要沿 `goal → subproblem → design → failure`；
- 需要跨领域找“相同 causal / responsibility structure”；
- 需要从 entity / event / time relation 做 multi-hop discovery；

那么 explicit relation graph 或 graph-assisted expansion 才可能有真实收益。

### 10.3 应避免的倒因果

不能因为 GraphRAG 看起来更先进，就先做图结构，再寻找用途。

正确顺序：

```text
观察 simple/hybrid retrieval 的真实 failure
→ failure 是否来自缺少 relation / multi-hop
→ graph 是否能以合理成本解决
→ eval
```

Brain 的 AI-authored memory 是一个特殊条件：内容本身可以在写入时把因果、条件和关系写清楚，因此它可能比“对任意原始文档做 RAG”更容易让简单 retrieval + 主模型 reasoning 达到好效果。这需要专门实验，而不能直接照搬企业 GraphRAG 的结论。

## 11. Cognition organization / routing 应拆成两个正交维度

到这一层，最容易犯的错误是把下面几件事混成一个 taxonomy：

```text
这份 cognition 在语义上是什么？
它属于哪个 scope / owner？
它多久需要一次？
它怎样被模型找到？
它当前是否要 resident？
它最后存在哪个文件 / role / schema？
```

这些不是同一个问题。

### 11.1 第一维：Semantic ownership——它长期负责什么

当前先区分稳定的逻辑 owner，不提前绑定现有 `Decision / Knowledge / Intention / Skill` role 或目录：

```text
Universal Root
    跨领域都需要的判断关系

Collaboration Root
    用户-owned decision / AI-owned investigation / commitment scope

Project / Active-work Continuity
    某一项未来仍要继续的工作：目标、已确认边界、progress、blocker、remaining work

Domain / Reusable Cognition
    某类问题反复可用的方法、成立条件、检查方式和停止边界

Durable Project / Global Cognition
    长期 decision、constraint、fact、lesson、causal understanding 等

Output / Interaction Cognition
    用户可见交互与表达所需的稳定 guidance

Maintenance Policy
    cognition 何时保存、更新、challenge、supersede、合并或淘汰
```

这些是**语义职责**。后续即使决定继续使用 role metadata，也不能假设一个 role 名称就等于整个 owner 结构。

例如：

- 一个 active work 可以包含 decision、known fact、open question 和 remaining work，但它仍首先属于这一项 project continuation；
- 一个 software design method 可以包含 knowledge 与 procedure，但它首先承担 reusable method 的职责；
- Universal Root 是否 resident，是访问策略，不是因为它属于某个特殊“memory type”。

### 11.2 第二维：Access mode——当前模型怎样拿到它

同一类 cognition 可以使用不同访问方式：

```text
Resident / guaranteed
    在某个 decision point 前确定性可用

Fixed route
    条件明确时给出 exact target / exact next read

Progressive route
    先进入 domain / project 大入口，再下钻到更具体 cognition

Active discovery
    当前 information need 已明确，但目标地址未知
    → 搜索 body / index
    → 返回 bounded candidates

Exact read
    目标已经明确
    → 读取完整 cognition body

Passive cue
    有预算时提供机会性 candidate / gist
    → 只能辅助发现，不能承担必须命中的 routing guarantee
```

因此：

> **resident 是 delivery 属性，不是 cognition type；search result 是访问结果，不是 cognition role；Core / route 是导航结构，不是详细 cognition body。**

### 11.3 新方案的逻辑 routing graph

当前能力 Contract 更自然地导出下面的关系：

```text
new user turn
↓
Deterministic Bootstrap
    Universal Root
    Collaboration Root
    Stable Routing Surface
↓
main model + latest user message + conversation
↓
┌─────────────────────────────────────────────┐
│ A. 已有明确 route                           │
│    → exact / progressive read               │
│                                             │
│ B. 已形成 information need，但不知道地址   │
│    → active discovery                       │
│    → bounded candidate                      │
│    → exact read                             │
│                                             │
│ C. 当前没有识别出 material cognition need   │
│    → root contract 本身不要求机械搜索        │
│    → 是否做低成本默认 discovery 留给下游策略 / eval │
└─────────────────────────────────────────────┘
↓
reason / investigate / act
↓
new evidence / outcome
↓
必要时 update current frame
必要时进入 Cognition Maintenance
```

这里 `Stable Routing Surface` 只负责让模型知道**哪些稳定入口存在，以及什么条件下进入**，不负责承载目标 cognition 的完整正文。

### 11.4 Fixed route 与 Active discovery 必须有明确分工

Fixed route 解决的是递归 trigger failure：

```text
模型必须先想起某个 cognition
→ 才知道应该去找它
```

所以对下面这种关系，应优先用明确 route：

- 每轮必须先获得 Universal / Collaboration guidance；
- 当前项目继续某项已知 active work 时读取对应 continuation cognition；
- 进入高漏读代价的大领域后读取其 broad guidance；
- 第一次 user-visible output 前取得 expression guidance。

Active discovery 解决的是另一类问题：

```text
我已经知道现在缺什么过去 cognition
但不知道它存在哪里 / 是否存在
```

例如：

- 以前是否讨论过类似 failure；
- 某个设计决定当时为什么这样选；
- 另一个 project 是否有 causal structure 相似的 lesson；
- 当前用户以前是否明确过一个相关 preference。

不能让 active discovery 负责找“形成这个 information need 本身必需的最上游方法”，否则又回到 bootstrap recursion。

### 11.5 用真实 case 校准 routing graph

#### Case A：用户说“继续”当前 Brain Base 设计

正确路径应接近：

```text
turn bootstrap
→ Universal / Collaboration Root
→ Project route 识别“继续 Brain Base”
→ exact read 对应 active-work continuation cognition
→ 从已记录的 next step 继续
```

这里不需要先 semantic search “Brain Base 是什么”。active work 地址已经稳定已知时，再走 discovery 反而增加遗漏和 ranking 风险。

#### Case B：用户问一个新的 Brain search 卡顿原因

```text
turn bootstrap
→ project / software broad route
→ provisional understanding：需要知道真实瓶颈与相关历史设计
→ inspect runtime / logs / code
→ 若需要“以前为何采用某 reconcile 机制”的 past cognition
   → active discovery
   → exact read 对应 decision / knowledge body
```

Domain method、project reality 和 past cognition 可以同时参与，但没有必要预先把所有相关 memory 全部 resident。

#### Case C：普通简单问题

如果当前没有识别出 project continuation、domain method 或 past cognition 会 materially 改变答案：

```text
turn bootstrap
→ root guidance 已足够
→ 直接处理
→ output route
```

这只说明 **Universal Root 本身不应以“每轮必须 semantic search”作为成立前提**。产品层是否为了降低漏召回而增加一个低成本默认 discovery，仍是后续 retrieval policy / replay eval 要裁决的问题，不能在这里提前冻结。

#### Case D：related-project 普通 memory discovery

related project 的 memory 可以进入统一 discovery workspace，但 related Project Core 不因此自动加载：

```text
current information need
→ active discovery across accessible cognition bodies
→ unified ranking / bounded candidates
```

而：

```text
进入 related project 的项目级 context / decision routing
```

是另一条 Project Route 责任。这样不会把“可以搜它的 memory”误升级成“自动采用它的 Core / 当前工作规则”。

### 11.6 Project Core / Global Core 若继续存在，只应视为 route surface 的一种实现

能力层当前只要求：

```text
Global stable routes
Project-specific stable routes
active-work discoverability
```

它**不要求**最终一定继续使用现在的 `core.md` 文件，也不要求所有 route 放在一个文件中。

如果后续仍使用 Core，一个合理职责应是：

```text
Core / route surface
    trigger
    applicability boundary
    exact next cognition / route
    极少量必须就地存在的 use contract

Cognition body
    完整方法 / decision / active work / reasoning / evidence / conditions
```

只要删除正文后仍能让模型稳定知道“何时去哪里读”，详细内容就不属于 route surface。

### 11.7 Maintenance 是写侧控制面，不进入每轮主读取链

Cognition Maintenance 与 routing 相连，但职责不同：

```text
new stable cognition / correction / outcome
↓
判断是否需要跨当前 context 存活
↓
找到 semantic owner 与 scope
↓
更新 canonical body
↓
如果 applicability / discoverability 改变
    → 同步更新 route / description / index
↓
如果只是正文事实变化
    → 不为了同步而修改无关 route
```

这能避免两个常见问题：

- 每改一份 cognition 就顺手膨胀 Core；
- 同一认识在 route、description、body、README 多处各自演化成不同版本。

### 11.8 当前最重要的组织原则

可以先压成四句：

```text
先按 semantic owner 决定“它是谁的 cognition”。
再按 access need 决定“模型怎样拿到它”。
已知地址用 route / exact read；未知地址才 discovery。
route 只导航，body 才拥有完整 cognition；maintenance 只更新真正受影响的 owner。
```

这一步仍不裁决最终 role taxonomy、目录、schema、Core 文件形态或 retrieval algorithm。

### 11.9 Stable Routing Surface 最少要表达什么

Stable Routing Surface 的任务不是“理解当前任务并选出唯一 mode”，而是把**稳定、已知的 condition → next cognition** 关系重新放回模型容易执行的位置。

一条 route 在逻辑上至少需要让模型直接得到：

```text
什么时候进入
→ 现在做什么
→ 去哪里继续
```

如果不同情况的边界容易误判，再补充：

```text
根据什么差异区分
→ 拿不准时采用哪一侧
```

不需要为了形式完整加入大量 metadata。route 中也不应复制目标 body 的完整结论、方法和历史 rationale；只有缺少某个摘要会让“是否进入这个 route”本身发生误判时，才保留该摘要。

例如：

```text
继续 Brain Base 根模型、每轮 cognition bootstrap 或当前 Brain 能力设计
→ 读取对应 active-work continuation cognition
```

已经足够时，不需要再在 route 中重复当前设计的全部内容。

#### Route strength 不是统一数字，而是明确执行语义

当前至少需要区分三种语义：

```text
Unconditional
    当前 decision point 每次都进入

Broad / false-negative-averse
    只有明确不适用才跳过；拿不准时进入

Conditional / narrow
    只有写明条件成立时才进入
```

例如 Universal Root 属于 unconditional；software 这类高漏读代价、读取成本可接受的大领域 route 可以采用 broad；某个昂贵 POC / specialist method 则应使用 narrow condition。

这种强度直接写进行为关系即可，不需要现在设计 score / priority 数值。

### 11.10 Routing 不是 task classification，而是可并行 activation

中央 classifier 常见形态是：

```text
当前任务
→ 判成一个 type
→ 选择唯一 role / workflow / method
```

Stable Routing Surface 应避免这种结构。更自然的是：

```text
当前上下文
→ 独立判断多个 route condition
→ 0..N 个 route 可以同时成立
→ 各自读取需要的 cognition
```

例如一个“继续 Brain Base 并准备修改 Prompt”的任务可以同时触发：

```text
Project active-work route
+ software / design route
+ prompt-writing route
+ output route（第一次用户可见输出前）
```

这些 route 不互斥，也不需要先给任务贴一个唯一标签。

route chain 可以逐层降低判断难度：

```text
Global broad condition
→ Domain route
→ Domain 内更具体的 condition
→ Detailed method / body
```

越靠近根部，条件越简单、越宽松；越往下，才允许更窄、更昂贵的方法判断。

### 11.11 Global / Project / Domain / Active-work route 的逻辑关系

当前可以先这样分责：

```text
Global Route Surface
    Universal Root / Collaboration Root 的 guaranteed entry
    跨项目 broad domain routes
    discovery / output 等全局稳定入口

Project Route Surface
    当前 project 特有的稳定 guidance
    多个 active-work continuation routes
    project-specific cognition entry

Domain Route
    一个大领域内部的 progressive fan-out
    例如 software → design / testing / debugging / POC ...

Active-work Route
    指向一项具体 continuing work 的 canonical continuation body
    不维护一个项目唯一 current task
```

Host 可以确定“当前 project 是哪个”，所以恢复 current Project Route Surface 不需要模型做语义分类；但“当前用户是在继续哪个 active work、哪些 domain condition 成立”仍由主模型结合 conversation 判断。

related project 要继续保持两条边界：

```text
普通 cognition discovery 可跨 accessible related projects
≠ 自动加载 related Project Route Surface

真正进入 related project 的项目级工作 / decision context
→ 才需要恢复并遵循该 project 自己的 route surface
```

### 11.12 Required routes 不能退化成 passive ranked candidates

如果某条 route 承担的是“漏掉会导致稳定 failure”的 guarantee，就不能把它和普通 passive cognition candidate 一起按预算排名后随机截掉。

逻辑上应区分：

```text
Guaranteed route
    必须 resident 或通过 guaranteed route chain 可达

Passive cue
    有预算时增加 recall opportunity
    可以被 ranking / truncation
```

例如：

- Universal / Collaboration root entry；
- current Project Route Surface；
- project 中仍 active 且 continuation-critical 的 route；
- 高漏读代价 domain root 的稳定入口；

如果被认定为 required route，就必须有确定的可达性 guarantee，而不能依赖“刚好进入 top-k passive descriptions”。

这并不意味着所有 active work 正文都 resident。可以只保证**短 route 可达**，正文继续 exact read。

### 11.13 Route graph 的停止边界

Route 也不能无限展开。每一层只解决当前 applicability decision：

```text
当前 route 已足够指向 exact body
→ 直接读 body

当前只知道 broad domain
→ 进入下一层 route

当前 information need 明确但没有稳定 route
→ discovery

没有 material need
→ 不因为还有更多 route 就继续展开
```

这样 routing 本身也是 progressive disclosure，而不是另一个长 prompt / workflow。

### 11.14 Core 是否保留，应由 route surface 的需求决定

现有 v6 的 Project Core 已经证明一种简单模式是可工作的：

```text
Project Core
    short resident guidance
    + trigger
    + exact target path
    + minimal usage instruction

Project memory
    complete cognition body
```

这个 precedent 与新能力模型并不冲突。冲突的是把“当前 Core 恰好怎么实现”直接提升成根 requirement。

后续至少有三种物理实现可能：

```text
A. Explicit Core document
   人工维护一个小型 route surface

B. Generated route projection
   route relation 保存在其他 canonical data 中
   runtime 每轮生成 Global / Project route surface

C. Hybrid
   少量人工拥有的 root / project route
   + 可由 active-work / domain registration 生成的 route entries
```

能力层现在还不足以裁决 A / B / C，但可以给出选择标准：

- required route 能否确定性出现，不依赖 passive ranking；
- route 是否足够小、直白、可审查；
- target body 更新时是否容易产生重复 truth；
- active-work route 的加入 / 移除是否清楚；
- 多 session / 多进程更新时是否安全；
- 人和模型能否看出为什么某条 route 存在；
- route 数量增长后能否继续 progressive disclosure，而不是把一个 Core 膨胀成目录大全。

因此当前结论不是“删除 Core”，也不是“继续照旧 Core”。更准确的是：

> **保留 `Core` 这个物理概念只有在它继续是最简单可靠的 route surface 时才合理；新 Brain 的语义设计不再依赖 Core 这个名字或文件形态。**

### 11.15 Universal / Collaboration Root 比普通 route 更强

Universal Root 和 Collaboration Root 已被定义为每轮在重要语义判断前必须可靠可用。如果最终实现仍是：

```text
resident Core
→ 写一句“请再去读取 root body”
→ 依赖模型下一次工具调用
```

那么它仍然保留了一次可失败的 instruction trigger。

因此后续 implementation design 应认真比较：

```text
方案 1：root 作为 route target
    bootstrap 只恢复短 route
    模型再 exact read root body

方案 2：root body 直接进入 deterministic bootstrap projection
    不依赖模型先想起 / 执行一次 read

方案 3：极小 resident root + deeper root body route
    最承重关系直接 resident
    详细解释 / examples 按需读取
```

从当前根目标看，越是“缺失后会破坏本轮认知起点”的内容，越倾向直接进入 deterministic projection；越详细、越可渐进读取的内容，越适合 route。

这仍不等于现在就写最终 Prompt。真正 model-facing root 文本必须经过独立 Prompt 审核 Gate 后才允许进入 production。

### 11.16 Route 是独立关系，不能默认只是 target 的 description

一份 cognition 的 description 可以表达“什么时候值得读它”，但 route 还可能承担：

- 从哪个稳定 decision point 进入；
- 进入强度是 unconditional / broad / narrow；
- 是否必须 immediate read；
- 是否先进入另一个 progressive route；
- 当前 project / domain 是否有特定使用约束。

同一个 body 也可能从多个 decision point 被读取。

因此逻辑上：

```text
Cognition body
    拥有完整 cognition

Applicability description
    描述什么情况下这份 cognition 相关

Route relation
    在一个稳定 source decision point 上
    把 condition 明确连接到 next target / action
```

三者可以在物理上合并存储，但语义不能混为同一个字段。

如果后续希望 route 自动生成，也应由明确 route relation / exposure policy 生成，而不是把所有 cognition description 自动提升成 resident route；否则 route surface 会退化成全 memory catalog。

### 11.17 Route graph 应持续降低当前选择难度

一个健康的 route edge 应使下一判断更具体：

```text
Global broad domain
→ software
→ design
→ 当前需要的详细 method
```

或者：

```text
Project route
→ 某个 active work
→ exact continuation body
```

如果 route A 进入 B、B 又要求回 A 才能判断，或者多层 route 只重复相同摘要，就没有 progressive disclosure 的价值。

后续设计可以把“每跳一层是否减少 applicability ambiguity / 缩小 candidate space / 直接到达 body”作为 route graph 的审查原则，而不必先引入复杂 graph engine。

### 11.18 Cognitive role 应从“怎样正确使用 / 更新”重新推导

旧 Brain 的 `Decision / Knowledge / Intention / Skill` 最多只能作为 precedent。新设计真正需要回答的是：**不同 cognition 是否因为应用、更新和停止语义不同，而必须显式区分。**

真实 case 表明至少存在这些不同：

```text
已做决定
    当前在其 scope 内继续生效
    后续 evidence 可以触发重新裁决，但普通实现结果不能自动改写决定

描述性理解 / knowledge
    作为 premise 使用
    条件、版本或现实变化时需要重新验证受影响部分

Active-work continuation
    重点是恢复 goal / confirmed boundary / progress / blocker / remaining work
    完成后 continuation route 应消失，但其中有长期价值的内容可以继续保存

Reusable method
    只有 trigger / prerequisite 成立时使用
    outcome / feedback 可以修订方法与适用条件

User / project constraint
    可能长期有效，但其 owner、授权范围和 supersession 方式与普通事实不同
```

因此“role semantics”很可能仍有价值，但它是 **Apply / Maintenance semantics**，不是 route / storage taxonomy 的替代品。

尤其要避免：

```text
一个 active-work body 因为放在 Intention 目录
→ 就假设里面所有内容都是同一种 intention
```

active work 实际可能同时包含：

- 当前 goal；
- 已确认 decision；
- supporting fact；
- open uncertainty；
- progress；
- next remaining work。

所以后续 role design 至少要比较：

1. 整份 cognition 只有一个 primary role；
2. body 允许混合语义，但用结构化 section / relation 表达；
3. 更细粒度 cognition item 分别拥有 role，再由 active-work / topic body 聚合。

当前不裁决哪一种；只确认 **role 不应再承担 scope、routing、resident status 和 storage path 四种额外责任**。

### 11.19 Description 只承担 applicability / navigation，不替 body 当 truth

Description 的逻辑职责继续保持窄：

> **帮助模型判断“为什么这份 cognition 现在值得读”。**

它可以包含 trigger、适用场景和最少 disambiguation，但不应成为完整 conclusion 的第二份副本。

新的 routing / discovery 架构下要进一步区分：

```text
Route condition
    从一个稳定 decision point 判断是否进入 target

Description / candidate gist
    target 被发现后，帮助模型判断是否 exact read

Body
    完整 cognition、成立条件、evidence、reasoning 与当前状态
```

因此：

- fixed route 不需要依赖 search description 才成立；
- active discovery 的相关性判断应尽量基于 body / chunk 的实际 cognition，而不是只搜索 description；
- candidate 返回 description / gist 是为了控制上下文，不表示 description 成为 search truth；
- body 更新导致 applicability 真正变化时才同步 description / route；仅正文细节变化不应机械改所有导航文字。

这能减少 summary drift，也能让“route 为什么进入”和“body 实际知道什么”分别有清晰 owner。

### 11.20 Root / Route / Body 的 canonical ownership

为了避免同一认识在多个位置各自演化，可以先明确三个 owner：

```text
Root
    拥有跨任务稳定、每轮必须恢复的行为关系
    只有 root contract 本身改变时才修改

Route
    拥有 source decision point 的 condition → next target / action
    只在 trigger、target、执行强度或 routing boundary 改变时修改

Body
    拥有完整 cognition truth / current state / method / evidence / rationale
    正文变化优先只改 body
```

同步关系：

```text
body 内容更新，但 applicability 不变
→ 只改 body

body 的“什么时候适用”改变
→ 改 body + description / route 中真正受影响部分

target 移动 / identity 改变
→ 改 route target / index

root 的通用认知 Contract 改变
→ 才改 root
```

这样可以避免“每次 body 更新都顺手改 Core / description / README”，也避免 route 中保留一份过期 conclusion。

### 11.21 Active-work continuation body 的目标是恢复工作，不是保存聊天历史

真实对比很明显：

- 当前 `gui-agent-capability-design` active cognition 主要保存当前阶段、已确认方向、下一步和 canonical references，读完即可继续工作；
- 当前 Brain Base active cognition 在连续讨论中逐轮追加了大量阶段性结论，已经开始接近 discussion log，恢复时需要重新消化很长历史。

后者说明 active-work body 应有明确压缩目标：

> **让一个没有原 conversation 的新 session，读完最少内容就能从正确位置继续这项工作。**

逻辑上至少需要恢复：

```text
当前目标 / desired outcome
当前阶段 / 当前正在解决的问题
仍有效的 confirmed baseline / user decision
已经完成到哪里
当前 material blocker / open question
下一步应从哪里继续
继续工作必须读取的 canonical references
```

通常不需要保存：

```text
每一轮谁说了什么
已经被后续结论覆盖的旧 proposal
完整 tool output
已经进入 canonical decision / Base 文档的详细 rationale 副本
仅用于当时 reply 的临时 reasoning / wording
```

active-work body 应是**当前状态的 selective update**，不是 append-only timeline。

### 11.22 Active-work 与长期 cognition 分开，避免“一个巨大 project current state”

一项 work 在推进过程中会产生不同寿命的 cognition：

```text
只为继续当前 work 服务
    → active-work continuation body

已经稳定、未来别的 work 也会用到的 decision / knowledge / method
    → 进入各自 durable canonical owner
    → active-work 只引用，不复制完整正文

纯 conversation scratch
    → 留在 Host / thread
```

当 active work 完成：

```text
移除 continuation-critical route
→ active-work body 不再作为当前入口
→ 仍有长期价值的 cognition 已经在 durable owner 中继续存在
```

这允许同一 Project 同时有多个 active work，而不需要一个共享 `Project.currentTask` 或“项目总状态文档”。

### 11.23 多 session 同一 active work 需要共享状态安全，但不恢复 Session cognition

多个 session 可以同时读同一个 project active-work body。若两个 session 真的并行推进同一项 work，逻辑 requirement 是：

> **较早读取到的 continuation state 不能在稍后写回时静默抹掉另一个 session 已形成的更新。**

这是 shared mutable cognition 的并发问题，与是否存在 Session scope 无关。

后续 implementation design 需要判断 active-work body 是否也需要 exact-edit / compare-and-set、局部 structured update 或其他 stale-write protection。这里先保留 requirement，不提前选机制。

同时，不应为了并发就恢复 session-owned cognition：

```text
session identity
    Host responsibility

shared active-work truth
    Project cognition responsibility
```

冲突时应围绕共享 work 的 canonical state 解决，而不是把同一工作拆回多个 session memory 再尝试合并。

### 11.24 Active-work body 本身也应定期压缩到“当前可继续状态”

Maintenance 不只是保存新内容，还要防止 continuation body 随时间线性增长。

当某段历史已经：

- 被新的 current baseline 替代；
- 迁移成 durable decision / knowledge / method；
- 对下一步不再产生影响；

就应从 active-work body 中移除或缩成必要 reference。

因此 active-work maintenance 的成功标准不是“历史都还在”，而是：

```text
新 session 能恢复真正目标和当前边界
+ 知道做到哪里
+ 知道什么仍未解决
+ 知道下一步去哪读 / 做什么
- 不必重放整个 conversation
```

### 11.25 Body granularity 应按“什么需要一起理解 / 一起变化”划分

三个真实 cognition 可以帮助校准：

- `brain-cognition-scope-model`：一个相对单一的长期 decision / target model，scope、Project Core、Session 定位和 migration 共同解释同一决定，适合作为一个 coherent durable body；
- `related-project-memory-discovery`：也是一个完整 decision cluster，多个行为条款共同定义同一 discovery contract；
- `gui-agent-capability-design`：不是单一 decision，而是 continuation snapshot，需要同时恢复当前阶段、已确认方向、canonical references 和下一步，适合作为一个 structured active-work body。

因此 body boundary 更适合由下面的问题决定：

```text
这些内容是否通常需要一起读取才能正确继续？
这些内容是否由同一次 correction / decision / progress update 一起变化？
它们是否拥有同一个 canonical lifecycle？
拆开后是否会迫使模型额外拼接才能恢复完整语义？
合在一起是否会导致无关内容频繁一起加载 / 一起修改？
```

这比“每个 role 一个文件”或“每条事实一个 item”更接近真实使用。

### 11.26 当前更合理的 body baseline：coherent durable body + structured active-work snapshot

当前证据更支持一个中间方案：

```text
Durable cognition
    每个 body 尽量有一个主要长期语义目的
    例如一个 decision cluster、一个 causal understanding、一个 reusable method

Active-work continuation
    一个 work 一个 coherent structured snapshot
    允许混合 goal / confirmed decisions / progress / blocker / next step
    但 durable truth 只引用 canonical owner，不复制完整正文

Retrieval
    可以对 body 做 chunk / indexing
    但 chunk 是 retrieval unit，不自动升级成独立 canonical cognition item
```

它避开两个极端：

```text
极端 A：一个巨大 topic / project document
    所有事实、决定、方法、进度长期混在一起

极端 B：每句话 / 每条 bullet 都是独立 cognition item
    续作需要拼装大量碎片，写入和关系维护成本迅速上升
```

Fine-grained cognition item 只有在后续真实 failure 证明：

- selective update 无法安全完成；
- body 内冲突 / supersession 无法表达；
- multi-hop relation retrieval 明显受限；
- 并发编辑必须细到 item 才能解决；

时再引入，不因为 GraphRAG / knowledge graph 看起来先进就预先细粒度化。

### 11.27 Cognitive role 的最小需求可以先按四种 Apply / Maintenance 行为研究

不沿用旧目录名字，当前从真实使用反推至少有四类不同 lifecycle：

```text
Continuation State
    为一项 active work 恢复“现在做到哪里”
    频繁 selective update；完成后退出 active route

Commitment / Decision
    记录已经确认的目标、选择、边界或授权
    在 scope 内继续有效，直到 owner 明确改变 / 完成 / supersede

Descriptive Understanding
    记录事实、解释、causal model、lesson 与成立条件
    新 evidence 只修订受影响 claim；时间 / 环境变化可能要求重新验证

Reusable Method
    记录 trigger / prerequisite / procedure / check / stop / fallback
    outcome feedback 可以改变方法或适用条件
```

这四类首先是**行为语义候选**，不是现在就确定四个目录或 schema enum。

还有些内容可能跨越它们，例如 user preference / project constraint：关键不是先给它找一个名字，而是明确它由谁拥有、怎样生效、什么时候失效 / supersede。若后续发现现有四类 Apply/Maintenance 行为无法稳定表达，再增加语义类别。

### 11.28 一个 body 可以有 primary purpose，但不要求内部每句话同 role

例如 active-work continuation 的 primary purpose 是 Continuation State，但里面可以引用：

- 一个已经确认的 Decision；
- 一个当前已知 fact；
- 一个 open uncertainty；
- 一个下一步 action。

正确约束是：

```text
body 有清晰 primary lifecycle / canonical purpose
+ 内部结构让模型知道各部分怎样使用
+ 真正跨 work 长期成立的 cognition 有独立 durable owner
```

而不是：

```text
为了 role purity
→ 把一次继续工作需要同时读到的内容拆成很多文件
```

这也解释了为什么 role taxonomy 与 body granularity 必须分开设计。

### 11.29 Metadata 也应区分 canonical semantics 与 derived runtime state

下一步不能把所有方便实现 / ranking 的字段都升级成 cognition schema。

逻辑上至少有三类不同数据：

#### A. Canonical cognition semantics

模型正确应用 / 维护这份 cognition 真正需要知道的内容，例如：

```text
identity / scope
primary purpose / lifecycle semantics
applicability description
当前有效性 / challenge / supersession（只有确实需要时）
body
```

这里 `scope` 解决未来在哪里继续；`primary purpose` 决定怎样 Apply / Maintain；`description` 帮助 navigation；validity relation 防止把被质疑 / 被替代的 cognition 当当前 baseline。

是否最终都成为 frontmatter 字段仍未决定。能清楚写在 body 且不需要机器索引的语义，不必为了“结构化”强行 metadata 化。

#### B. Canonical route semantics

一条 route 真正需要拥有：

```text
source decision point / route surface
condition
strength：unconditional / broad / narrow
next action / target
```

这些语义可以用清晰自然语言表达，也可能以后部分结构化；但不能用 generic `importance` 代替 route guarantee。

#### C. Derived / operational state

例如：

```text
embedding
chunk vectors
lexical index
content hash
mtime / size
passive exposure
ranking score
retrievability cache
search fingerprint
```

这些服务 retrieval / sync / scarcity / performance，可以重建，不拥有 cognition truth。

因此一个重要原则是：

> **机器为了更快找 cognition 而生成的 state，不应反过来决定 cognition 在语义上是什么。**

### 11.30 `importance` 不能承担 required-route guarantee

当前系统已有 importance / retrievability / exposure 等 ranking 信号。它们可以继续服务 passive recall / discovery ranking，但不应表达：

```text
“这个 cognition 每轮必须可达”
```

required-route guarantee 是 routing plane 的明确 contract：resident 或 guaranteed chain 可达。

否则：

```text
critical active work
importance = high
→ 仍可能因为 candidate budget / ranking 被截掉
```

这和真正“必须稳定续作”不是同一种保证。

### 11.31 Challenge / supersession 是语义状态，不只是 ranking feature

当一份 cognition 被新 evidence 质疑或替代时，模型怎样使用它会改变：

```text
questioned
    可以继续作为 hypothesis / historical cognition
    但不能无条件当 current truth

superseded
    旧内容可能仍有 historical / rationale 价值
    但 current application 应进入 successor / new baseline
```

因此 challenge / supersession 如果保留，属于 cognition semantics / maintenance relation；ranking 可以利用它，但不能把它降格成纯分数。

同样，当前 active-work route 是否存在，本身就是 continuation lifecycle 的语义结果，不应该只靠 importance score 猜测。

### 11.32 最小 metadata 应由“哪种错误无法只靠正文可靠避免”反推

后续决定 schema 时，对每个候选字段都问：

```text
如果没有这个字段，
模型 / runtime 是否仍能稳定完成正确 Apply / Route / Maintain？

如果可以
→ 保留在正文或 derived state，不升级 schema

如果不可以，且这个语义需要被机器可靠查询 / enforce / synchronize
→ 才考虑 canonical metadata
```

例如：

- embedding model fingerprint 明显是 derived state；
- active-work 的当前目标通常应在正文中直接可读；
- scope 需要 runtime 确定访问 / persistence 边界，属于 canonical system semantics；
- route strength 若系统需要 guaranteed projection，可能需要显式表达；
- `why` / rationale 通常属于 body，不需要 frontmatter 复制。

这可以控制 schema 膨胀，也让 Prompt / Markdown 继续承担模型真正擅长理解的开放语义。

### 11.33 当前物理方向更偏向 Hybrid，但先不冻结

用现有真实形态对照三种方案：

#### 全 explicit Core

优点：

- route 文字直白、可审查；
- Project Core 的 active-work route 已有真实 precedent；
- 人和模型容易知道为什么某条 route 存在。

问题：

- Universal / Collaboration Root 若仍只通过 Core 再要求模型读取，就保留一次 trigger failure；
- route 数量增长时 Core 容易膨胀；
- passive / derived state 不适合人工维护。

#### 全 generated projection

优点：

- 可以从 canonical registration / metadata 自动生成 surface；
- 减少路径移动与某些重复更新。

问题：

- 如果从普通 description 自动生成，很容易把整个 memory catalog 变成 resident route；
- route 的真正 owner / strength / decision point 变得隐蔽；
- 调试“为什么这轮出现这条 guidance”更困难；
- 为了解决简单 route 可能引入过早 schema / generator complexity。

#### Hybrid

当前更符合根目标的候选是：

```text
Deterministic bootstrap projection
    直接承载经审核的最小 Universal / Collaboration root

Explicit Global / Project route surface
    保存少量稳定、可审查的 route relation
    特别是 project active-work continuation route

Progressive domain route bodies
    进入 broad domain 后再 exact read 更具体 routing / method cognition

Derived discovery / passive index
    从 cognition bodies 构建，可重建，不承担 canonical route truth
```

这样最承重的 cognition 不依赖模型先执行一次 read；需要人 / 模型维护的 route 仍然显式；大量 search / ranking state 继续自动派生。

但这还只是**当前 preferred architecture candidate**，不是 implementation decision。后续仍需检查：

- Global / Project explicit route surface 在 route 数量增长时怎样保持小；
- active-work route 是否人工维护、由 preservation action 显式注册，还是部分生成；
- domain route 是否需要独立 route document；
- root canonical text 存在哪里、怎样版本化 / 审核；
- model-facing Prompt 的完整实际文字。

尤其最后一项必须遵守 Prompt Gate：在用户审核完整 root / route Prompt 前，不进入 production 实现。

Base 不冻结 Global Core、dynamic prompt assembly 或具体 Tool schema，但有两个连续性目标不能再降级成可选实现：

1. **每个用户 turn 都重新把必要 cognition anchor 放到当前重要 decision point 附近**；
2. **需要在 context compaction、新会话或其他项目会话中继续的 active work，必须有可恢复的 project cognition，而不能只存在于原 conversation。**

多个 active work 应按工作本身分别保存和路由，不建立项目唯一 current-task state。

## 12. Eval 应验证“认知行为”，而不是只验证 retrieval 指标

传统 retrieval 指标仍有价值：

- recall@k；
- precision；
- MRR / NDCG；
- latency / token budget。

但 Brain 的最终成功标准应该继续回到用户结果。

需要构建真实对话型 eval，至少覆盖：

### 12.1 Intent ambiguity

用户只说 solution-level 请求，历史 memory 中存在真实背景。

检查：

- 是否主动恢复；
- 是否避免过早进入 solution；
- 是否只询问仍属于 user-owned 的缺口。

### 12.2 Conflicting past cognition

存在旧 decision 与后来 correction。

检查：

- 是否恢复最新有效语义；
- 是否理解 supersession / challenge；
- 是否避免仅凭 embedding 相似度混用。

### 12.3 Novel situation

过去有相似经验，但成立条件已经改变。

检查：

- 是否识别 anomaly；
- 是否降低 routine pattern 权重；
- 是否进一步调查。

### 12.4 Cross-domain analogy

另一个项目存在 causal structure 相似的 lesson。

检查：

- 是否迁移关系结构；
- 是否避免把表面细节一并复制。

### 12.5 Role switching

任务从访谈进入设计，又因新 evidence 暴露上游歧义。

检查：

- 是否能退回 sensemaking；
- 是否不被 workflow stage 锁死。

### 12.6 User burden

测量：

- 重复询问用户已经表达过的信息次数；
- 本可自行调查却交给用户的问题；
- 错误行动导致的纠偏轮数；
- 为获得同等质量额外增加的 token / Tool / latency。

最终我们关心的是：

```text
更准确的理解
+ 更连续的行动
+ 更少的无效用户负担
+ 可接受的系统成本
```

## 13. 当前明确保留的开放研究问题

在进入下一版本 Design 前，还值得逐一研究：

1. **Problem representation 怎样在 LLM 中稳定形成和更新？**
   哪种 guidance / structure 能让模型恢复 deep structure，而不是机械复述用户句子。

2. **Meta-controller 如何判断 information need？**
   是否需要显式 known / hypothesis / unknown，还是自然语言 guidance 已足够。

3. **Role activation 对 LLM 的真实收益与副作用。**
   应比较方法型 guidance、轻量 role cue、完整 persona，并测角色惯性和无关 persona detail 的干扰。

4. **正文级 retrieval 的最佳最小方案。**
   dense、BM25、hybrid fusion、chunk strategy、rerank、candidate budget。

5. **Graph 是否有必要。**
   先收集 simple/hybrid retrieval 的真实 multi-hop failure，再决定。

6. **Memory 的最小语义结构。**
   是否仅靠高质量正文即可，还是需要显式 relation / evidence / validity / supersession metadata。

7. **每轮方法召回与具体历史 cognition recall 怎样分工。**
   思考模式 / 方法 guidance 应随每个用户 turn 稳定恢复；具体历史 cognition 是否继续 search，可以由方法产生的 information need 驱动。需要验证的是后者采用默认 search、information-need gated search 或其他机制时，哪个真实行为更稳。

8. **怎样让 Brain 帮助“解压错误的历史经验”。**
   过去 cognition 怎样带成立条件、challenge 和更新关系，避免 persistence 反而固化旧 frame。

这些问题从 Base 出发逐项讨论，比直接从现有 Tool 和 schema 做局部优化更可靠。

---

## 补充研究来源

- Pirolli, P., & Card, S. (1999). *Information Foraging*. Psychological Review, 106(4), 643–675. DOI: 10.1037/0033-295X.106.4.643.
- Pirolli, P., & Card, S. (2005). *The sensemaking process and leverage points for analyst technology as identified through cognitive task analysis*.
- Simon, H. A. (1973). *The Structure of Ill Structured Problems*. Artificial Intelligence, 4, 181–201. DOI: 10.1016/0004-3702(73)90011-8.
