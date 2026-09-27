# 04 · Problem Representation 与 Metacognitive Control

> 本文是 v7 detailed research note。它继续向 [../02-generalist-cognition-research.md](../02-generalist-cognition-research.md) 的研究深入，同时结合 [../01-llm-capability-and-failures.md](../01-llm-capability-and-failures.md)、[04-harness-as-cognitive-system.md](04-harness-as-cognitive-system.md)、[05-harness-lower-bound-mechanisms.md](05-harness-lower-bound-mechanisms.md)、[06-functional-cognitive-architecture.md](06-functional-cognitive-architecture.md)、[07-problem-representation-in-model-harness.md](07-problem-representation-in-model-harness.md) 与 [08-metacognitive-control-signals.md](08-metacognitive-control-signals.md)，研究“哪些人类认知机制可以直接依赖模型、哪些需要 Harness 外部化，以及其中哪些真正属于 Brain”：
>
> 1. 高水平思考者如何把杂乱、模糊的输入形成一个可工作的 problem representation；
> 2. 他凭什么决定下一步该继续想、查资料、回忆、提问、实验、切换方法，还是停止思考并行动。
>
> 这里使用“metacognitive control / meta-control”作为功能性描述，不假定人脑存在一个全知、单一、中央的“控制器”。

## 0. 研究回溯后的 Universal Cognitive Root

重新对照 expertise、sensemaking、meta-reasoning、adaptive expertise、actively open-minded thinking、analogy 与 cognitive flexibility 的研究后，Brain 每轮应稳定恢复的通用认知根不能从现有 prompt 文件或 Agent workflow 倒推，也不适合拆成越来越多平级模块。

更稳定的研究支撑集中在一个小闭环：

~~~text
Current reality / user / context
↓
Frame
    形成可修正的当前问题表征
    优先组织 deep structure / causal relation
    不把 surface wording、已有 solution 或第一解释直接当成 reality
↓
Monitor
    当前 frame 凭什么成立？
    有哪些 materially different alternative / anomaly / unknown？
    过去经验、压缩模式和 analogy 的成立条件现在还成立吗？
↓
Control
    继续沿成熟模式快速处理？
    还是 decompress，展开 mechanism / assumptions？
    是否需要 recall / project evidence / external search / experiment / user context / verification？
    继续 cognition 是否仍可能 materially 改变行动？
↓
Evidence / outcome / feedback
↓
更新 Frame
~~~

这不是要求模型每轮显式输出或逐项执行的固定流程，而是解释哪些关系值得被 Brain 每轮重新拉回最近上下文。

研究依据分别来自：

- expertise：专家更倾向按决定结果的 deep structure / principle 表征问题，而不是按 surface feature；
- Data-Frame / design co-evolution：frame 会引导继续寻找什么 evidence，新 evidence 与 solution exploration 又会修改 frame；
- meta-reasoning：高层控制的承重关系是 monitoring → control，而 subjective confidence 本身并不足以证明 accuracy；
- actively open-minded thinking / forecasting：高质量判断需要保留替代解释、对反证敏感并允许更新，而不是过早 closure；
- intuitive / adaptive expertise：熟悉、规律稳定且 feedback 充分时可以使用压缩经验；novelty、anomaly、conflict、high consequence 或 pattern validity 变弱时需要重新展开；
- analogy / cognitive flexibility：跨领域迁移应基于 relation / structure 与成立条件，在 ill-structured case 中按当前情境重新组合，而不是机械套一个固定 schema。

因此，`fact / inference` 分类、evidence sufficiency、material uncertainty、alternative hypothesis、mechanistic reasoning、search、recall、experiment、verification、stop 等都很重要，但它们首先是 Frame / Monitor / Control 中的具体判断或可调用认知动作，不需要全部升为每轮 resident root 的平级模块。

同时必须分清另一类通用约束：

~~~text
Agent Collaboration / Action Boundary
    information ownership
    decision ownership
    delegation / authorization
    action visibility
    execution boundary
~~~

这些对 AI Agent 很重要，也可能需要稳定召回，但它们来自 human-AI responsibility / governance，而不是“顶尖通才怎样思考”的认知根模型。后续能力设计应把二者分层；现有 Brain guidance 即使曾把它们写在一起，也不能反过来决定新方案必须保持同一层级。

### 0.1 用真实开发过程校准，而不是从抽象词反推

下面用 ai-toolkit 中已经真实发生并形成正式 decision / design 的三个 case 检查 `Frame → Monitor → Control` 是否真的解释开发行为。如果某条关系不能帮助这些真实判断，就不应仅因为理论上完整而升为每轮 root。

#### Case A：从“Session Core 没必要”恢复真正的 cognition scope 问题

用户最初提出的是“有 Project Core 后，Session Core 是否还有存在必要”。如果只跟随 surface wording，任务很容易被表征成：

~~~text
删掉 Session Core
~~~

真实设计最后解决的却是更上游的问题：**Brain cognition 应按“未来在哪里继续使用”划分，而不是按“在哪个 host session 产生”划分。** Host session/thread 可以继续存在，但不再拥有 Brain cognition scope；需要跨 context / 新 session 续作的 active work 进入 Project，纯 conversation transient state 不进入 Brain。

这里三个关系实际都发生了：

~~~text
Frame
    “删一个 Core”
    → “重新判断 cognition continuity 的真实 ownership / scope”

Monitor
    如果 Session scope 删除：
    - 新 session 怎样继续 active work？
    - 多个并发 session 是否共享同一 Project cognition？
    - host 自己仍需要 session identity 的地方是否会被误删？
    - legacy non-empty session cognition 怎样迁移？

Control
    检查现有 v5 scope / host adapter / related-project precedent
    → 区分 Brain scope 与 host runtime state
    → 形成 Global + Project 两层模型
    → 再向下修改 namespace、storage、semantic index、tool contract、Web、migration
~~~

这个 case 说明，Frame root 真正需要提醒模型的是：**当前表达只是 evidence；先恢复决定结果的 underlying problem / relation，再把当前 frame 保持为可修正。** 它不需要每轮把“scope ownership”这种软件方法写进 root。

#### Case B：relatedProjects 的 ordinary memory discovery 应像 monorepo

用户确认：related project 在普通 memory discovery 的使用心智上应类似 monorepo，不应该要求 AI 先知道 alias，才能去那个 project 搜 memory。

如果只接受表面 solution，很容易直接做成：

~~~text
每个 related project 分别搜一次
→ 把各自 top-k 拼起来
~~~

但进一步检查真实语义后发现，这会改变全局 ranking / truncation：某个项目若先本地截断，真正更重要的跨项目 candidate 可能永远进不了最终候选集。因此最终 decision 是：各 source 先提供匹配候选，再统一排序、统一限制、统一渲染；显式 path 仍可收窄；related Core 仍不自动加载；passive recalled summaries 也不顺手扩大到 related memories。

这里实际发生的是：

~~~text
Frame
    “让 related project 也能搜”
    → “普通 discovery 是否应表现为一个统一工作空间”

Monitor
    检查简单实现隐含的成立条件：
    - per-project top-k 再合并是否保持全局排序？不是
    - related Core 是否也应该自动加载？没有这个需求
    - active discovery 的变化是否自然推出 passive recall 也变化？不推出

Control
    保留 current single-project semantics
    → 扩展 candidate collection boundary
    → 合并后统一 rank / bound
    → 不修改无依据的相邻能力
~~~

这个 case 说明 Monitor 不只是“列 unknown”。它要检查：**当前解释 / 类比 / 简化方案依赖哪些条件；改变一个边界后，哪些结论真的随之成立，哪些只是被模型顺手带过去。** 这与 adaptive expertise 和 relational transfer 的研究是一致的。

#### Case C：已有跨进程 lease，为什么仍需要 stale-write protection

v6 中 Project Core 变成多个 session 共享。系统已经有 brain-root lease，会串行化 mutation。一个表面经验很容易得出：

~~~text
有锁
→ 并发写安全
~~~

但真实 failure 是：模型可以先读到旧 Core；另一进程随后更新；第一个模型之后拿旧全文做 whole-document replacement。Lease 只能保证两个 mutation 不同时执行，不能保证后执行者的**意图**不是基于 stale snapshot。

这里出现了典型的 adaptive decompression：

~~~text
Frame
    “并发写需要锁”
    → “真正要保证的是 stale client/model intent 不能覆盖 newer shared state”

Monitor
    检查成熟模式“串行化 mutation = 安全”的成立条件
    → 发现它只保证 execution serialization
    → 不保证 read-before-write snapshot freshness

Control
    不继续堆更大的 lock / merge subsystem / version field
    → 检查已有 exact-edit primitive
    → 发现其已能表达 compare-and-set
    → non-empty Core 强制 exact edit
    → oldText 已变化就失败并重新读取
~~~

这个 case 说明 Universal Root 需要保留的不是“并发要用 CAS”这种领域答案，而是：**熟悉模式只有在成立条件仍满足时才能继续压缩使用；出现 anomaly / novelty / conflict 时，先展开机制，再选择新的 computation / evidence / action。**

### 0.2 三个真实 case 共同留下的最小关系

从这些 case 反推，每轮 root 暂时只需要稳定恢复下面的认知关系，不需要把具体领域方法常驻：

~~~text
Frame
    最新表达、历史 cognition、文档、代码和已有 solution 都是 evidence
    → 形成当前最能解释现实与目标的 provisional frame
    → 优先抓决定结果的 deep relation，不把第一种表述直接当任务定义

Monitor
    当前 frame / pattern / analogy 凭什么成立？
    → 是否还有会改变行动的 alternative、unknown、anomaly 或前提差异？
    → 熟悉模式的有效条件当前仍成立吗？

Control
    当前真正 bottleneck 是什么？
    → 选择最能改善判断的下一 cognition action / evidence source
    → 熟悉且条件稳定时允许压缩继续
    → novelty / conflict / anomaly / high consequence 时展开机制和假设
    → 继续 cognition 已不会 materially 改变行动时停止

新 evidence / outcome
    → 回写当前 Frame，并在需要时改变方法
~~~

这些是行为关系，不要求当前就建立 `Frame` / `Monitor` / `Control` schema、状态机或三个 memory 文件。后续若要写成模型 guidance，应继续遵守 condition → judgment basis → action 的直接表达，减少模型需要自行补出的隐藏推理。

### 0.3 从真实 case 继续压缩出的每轮最小行为 Contract

把三个 case 再逐项对照后，可以进一步删除不承重的抽象词。每一层只保留“缺失后会稳定导致错误、存在后会改变下一步”的关系。

#### Frame：恢复当前真正要解释和改变的现实关系

最小关系：

~~~text
当前用户表达、历史 cognition、文档、代码和已有 solution 都先作为 evidence
→ 结合当前 conversation 与能够取得的现实，形成一个 provisional frame：
   当前发生了什么 / 希望什么结果变化 / 哪些关系真正决定结果
→ 新 evidence 改变这些关系时，更新 frame
~~~

为什么需要它：

- Session-scope case 中，若直接接受“Session Core 没必要”的 surface wording，任务只是删一个对象；恢复 continuation / cognition ownership 后，才得到 Global + Project 的真实 scope 问题。
- related-project case 中，若只表征成“把其他项目也搜进来”，就看不到真正需要保持的是统一 workspace discovery semantics。

因此 Frame root 不需要每轮要求完整因果分析、完整 requirements 或领域分类。它只要阻止模型把第一种表述 / 旧方案直接当成问题本身，并让后续判断围绕决定结果的关系展开。

#### Monitor：检查当前 frame 与压缩模式是否仍有资格继续使用

最小关系：

~~~text
准备依赖当前 frame / 熟悉模式 / analogy 形成重要判断时
→ 检查它凭什么成立、关键成立条件当前是否仍满足
→ 主动看是否存在会改变下一动作的 alternative、anomaly、conflict 或 condition mismatch
→ 没有 material difference 时继续；有时再展开
~~~

为什么需要它：

- related-project case 中，“每项目各取 top-k 再合并”表面上像自然扩展；Monitor 检查全局 ranking / truncation 后发现成立条件不满足。
- stale-write case 中，“已有 lease，所以并发安全”是成熟压缩模式；Monitor 展开后发现 lease 只串行 mutation，不保证 read-before-write snapshot freshness。

Monitor 不是要求每轮列风险清单，也不是无差别怀疑一切。真正的 stopping boundary 是：替代解释、前提差异或异常是否会 materially 改变下一动作。

#### Control：围绕当前 bottleneck 选择下一认知动作，并知道什么时候停

最小关系：

~~~text
根据 Monitor 暴露的当前 bottleneck
→ 选择最可能改变 / 校准当前判断的下一 cognition action 或 evidence source
→ 熟悉模式的条件仍成立时允许压缩继续
→ novelty / anomaly / conflict / high consequence / weak feedback 使模式不可靠时，展开 mechanism / assumptions 或取得新 evidence
→ 继续 cognition 已不再可能 materially 改变下一动作时停止并行动 / 回答
~~~

可选动作可能包括 recall、读取 project reality、external research、内部 reasoning、experiment、verification 等，但 root 不需要把它们写成固定顺序或任务分类器。

为什么需要它：

- stale-write case 中，Control 没有因为发现并发问题就自动新增 version / merge subsystem；它先检查已有 exact-edit primitive，发现已有 compare-and-set 语义足够承担新的 guarantee。
- Session-scope case 中，确认真实 scope 问题后，Control 才继续读取现有 storage / host / semantic / migration evidence，而不是在抽象讨论中无限展开。

#### Feedback：不是第四个模块，而是闭环的返回边

~~~text
新 evidence / experiment / implementation outcome 与当前 frame 或方法预期不一致
→ 修改受影响的 frame / method
→ 保留仍然成立的部分
~~~

它的作用是防止模型为了维护旧答案而解释掉反例。它不要求建立一个独立 Feedback state。

#### 压缩成一段 guidance 时应仍能保留的语义

如果以后需要把 Universal Root 写成很短的每轮 guidance，至少应能够表达：

~~~text
把当前表达、历史和已有方案先当作 evidence，结合现实形成可修正的当前问题表征，抓住真正决定结果的关系。
在依赖当前理解或熟悉模式形成重要判断前，检查它的依据、成立条件，以及是否存在会改变下一动作的替代解释、异常或冲突；条件稳定时直接继续，条件失效时再展开。
围绕当前真正的瓶颈选择最能改善判断的下一认知动作或 evidence source；继续 cognition 已不会 materially 改变下一动作时停止。新 evidence 或实际结果与当前理解不一致时，更新受影响的 frame 或方法。
~~~

这只是 capability-level 的压缩表达，用于检验是否还能保留承重语义；当前不把它冻结成 Prompt、文件结构或 memory schema。

### 0.4 跨不同开发阶段的真实 case 验证

为了避免三个 Brain 架构 case 恰好偏向同一种问题，再用已经发生过的需求纠偏、性能 / 故障调查、设计和完成验收交叉检查。

#### 需求理解：通用 GUI Agent 不是浏览器自动化方案

真实讨论中，早期调研很容易围绕浏览器 Agent、Playwright 等成熟方案展开；用户随后明确，浏览器网页、桌面软件和手机 App 在目标上都是 GUI Agent 应处理的同一种问题，不能把底层设计绑定到 DOM / Playwright 页面结构。

~~~text
Frame
    “找一个好用的 browser / GUI automation 技术”
    → “给上层 Agent 一个跨网页、桌面和手机的通用 GUI capability”

Monitor
    Playwright 等 precedent 哪些成立条件可以迁移？
    - async 可组合 API、运行对象、actionability：可借鉴
    - DOM / selector / browser internal structure：条件不成立，不能照搬

Control
    保留真正同构的关系
    → 继续研究 scope / session / observable result / transparent learning
    → 不因为 precedent 成熟就把产品重新收窄成 browser automation
~~~

这里如果缺 Frame，会高质量解决错误产品；缺 Monitor，会把表面相似 precedent 当完整答案；缺 Control，则可能在“都不能直接照搬”后失去可复用部分、重新从零设计。

#### 性能 / 故障调查：大量 cognition 后查询变慢不能靠猜优化点

真实讨论中，面对 future large-memory scale / search 卡顿问题，用户明确要求不要猜瓶颈，而应先用日志和真实执行路径定位；后续又结合 CodeGraph 等成熟实现，收敛到 SQLite catalog 驱动的增量 reconcile：健康稳态查询不应每次枚举全部 cognition 文件，filesystem scan 主要服务 unknown discovery / degraded recovery。

~~~text
Frame
    “文件多了会不会卡”
    → “哪个真实 operation 随 cognition 数量增长产生了不必要工作？”

Monitor
    当前猜测到底由什么 runtime evidence 支持？
    是 embedding 慢、Markdown parse 慢、filesystem enumeration 慢，还是 reconciliation owner 设计不对？
    现有 CodeGraph / database pattern 的成立条件与 Brain 是否相近？

Control
    先增加足够诊断 evidence / inspect execution path
    → 找到真实重复工作
    → 再选择 database-known catalog + incremental reconcile
    → 不用大规模 fake file benchmark 代替机制证明
~~~

这个 case 说明 root 必须允许“当前没有足够 evidence，就先取得能区分原因的 evidence”，但不需要把“加日志”“用 SQLite”写进通用 root；那是当前 case 的具体 cognition action 和 solution。

#### 设计：shared Core stale write

这一 case 已在上文展开。它验证的是成熟压缩模式的成立条件检查，以及 anomaly 出现时从“继续套 lock 模式”切换为展开 read / write mechanism，再复用已有 exact-edit compare-and-set primitive。

#### 完成验收：测试通过不等于 v6 cognition-scope cutover 已完成

v6 实现后，完成 claim 不只涉及 unit tests，还涉及：production 只暴露 Global / Project scope、host session 只保留宿主责任、Brain Web 投影一致、legacy Session cognition 已迁移 / 清理、shared Core stale edit 有真实 integration evidence。最终还检查了 `remainingSessionTrees=0`，并补充两独立 runtime 的 stale-edit integration coverage。

~~~text
Frame
    “代码改完 / tests green”
    → “原始 Global + Project cognition contract 是否已经在所有交付面真实成立？”

Monitor
    当前完成 claim 由哪些 evidence 支持？
    unit tests 没覆盖哪些真实 boundary？
    legacy storage、Web projection、host adapter、cross-runtime mutation 是否仍可能违背目标？

Control
    对缺失 claim 做针对性 integration / source / filesystem verification
    → 已有 evidence 足够的部分不重复验证
    → 所有 material completion claim 有对应 evidence 后停止
~~~

这个 case 说明 verification 不需要成为第四个 root；它是 Monitor 发现“完成 claim evidence 不足”后由 Control 选择的 cognition action。

### 0.5 交叉验证后的进一步收敛

这四类任务覆盖了 requirement framing、diagnosis / performance investigation、system design 和 completion verification。当前没有发现必须增加第四个 Universal Root 模块的稳定缺口。

但得到一个新的表达约束：`Frame / Monitor / Control` 适合作为设计者解释架构的标签，**不应要求主模型先理解这些抽象词才能正确执行**。未来 model-facing guidance 应直接表达真实判断关系，例如：

~~~text
先把当前表达、历史信息和已有方案当作 evidence，结合当前上下文和可取得的事实，恢复现在发生了什么、真正想改变什么结果、哪些关系决定结果；当前理解先作为可修正版本。

要基于当前理解或熟悉做法形成重要判断时，检查它的依据和成立条件，并看是否存在会改变下一动作的替代解释、异常、冲突或条件差异。没有就继续；有就补齐真正决定结果的部分。

根据当前最影响下一步的缺口，选择最能改变判断的认知动作或 evidence source。已有方法的条件仍成立就直接使用；不成立时再展开机制、调查、实验或验证。继续取得信息已经不会 materially 改变下一动作时停止。新 evidence 或实际结果与当前理解冲突时，只修改受影响的理解或方法。
~~~

这段仍只是新能力 Contract 的可执行性校准稿，不是最终 Prompt。

### 0.6 Model-facing Prompt 必须单独为“容易正确执行”设计

Universal Root 的认知内容与最终写给模型的 Prompt 是两层不同问题：

~~~text
Capability / cognition design
    决定模型每轮必须重新获得哪些判断关系

Model-facing Prompt
    把这些关系写成模型在当前 decision point 能直接理解和执行的文字
~~~

Prompt 不能因为理论模型使用 `Frame / Monitor / Control`，就直接要求模型“先 Frame，再 Monitor，再 Control”。这些标签适合设计者讨论，不应成为执行前置知识。

为了提高不同能力模型的稳定遵循，最终 guidance 至少应满足：

1. **直接写条件、判断依据和动作。** 能由一个条件决定动作时，直接写成 `条件成立 → 动作`；需要判断时，写清“看什么差异 → 怎样处理”。
2. **用普通词表达实际意思。** 如果模型必须先理解 `metacognition`、`adaptive compression`、`problem representation` 等术语才能知道怎么做，Prompt 还不够直接。
3. **一条 guidance 只承担一个附近的 decision。** 不把整个认知理论压成一条超长流程；在第一次需要做决定的位置给出当前足够的信息。
4. **优先写正确方法，而不是堆失败禁令。** 历史错误用于发现缺失关系；长期 Prompt 保存能够迁移到新 case 的正向方法。只有省略限制仍可能合理地产生 materially wrong action 时，才补必要禁令。
5. **触发条件偏向避免漏读。** 对漏掉后代价高、读取成本可接受的 cognition，条件写得宽松，例如“只有明确无关时才跳过；拿不准时读取”，不要要求模型做困难的精细分类后才获得方法。
6. **例子只用于校准容易误解的判断。** 先给一个正常 case，再只改变一个会改变结论的关键条件，让模型看出同一方法怎样变化；例子不能变成第二套规则。
7. **正确和低歧义优先于极短。** 删除文字后如果模型必须依赖隐藏上下文、领域经验或重新推理才能恢复关键关系，这部分不是冗余。
8. **Prompt 本身也要有停止边界。** 不要求模型为简单任务机械展开完整分析；只有出现 material uncertainty、condition mismatch、anomaly 等真正会改变下一动作的信号时，才展开更多 cognition。

#### 用真实 case 比较抽象写法与可执行写法

例如 stale-write case，如果写成：

~~~text
进行 metacognitive monitoring，并在 pattern validity 下降时执行 adaptive decompression。
~~~

理论上没有错，但模型必须自己补出：什么叫 pattern validity、什么信号算下降、decompression 实际要做什么。

更适合模型执行的是：

~~~text
准备沿用一个熟悉做法形成重要判断时，先确认它依赖的关键条件在当前情况仍成立。
如果出现与预期不一致的现象、当前条件和过去不同，或这个判断一旦错会产生重要后果，就展开决定结果的机制和前提，再继续。
条件仍成立，而且没有会改变下一动作的差异时，直接沿用，不重复从头研究。
~~~

在 stale-write case 中，这会自然促使模型检查“已有 lease 到底保证了什么”，而不是要求它先识别自己正在执行 `adaptive decompression`。

再例如 GUI Agent case，不应写：

~~~text
先恢复 deep structure，再执行 relational transfer。
~~~

更直接的写法是：

~~~text
参考成熟方案时，先分清它真正解决的问题、依赖的环境和能够保证的行为。
当前问题与这些条件相同时直接复用对应做法；条件不同的部分不要一起照搬，只保留仍然成立的关系。
~~~

这样 Playwright 的 async / runtime-object / actionability 可以被借鉴，而 DOM / selector 假设不会因为“都是 GUI automation”被一起带进来。

因此，后续把 Universal Root 落成 Prompt 时，应以“弱一些的模型只看当前文字也能得到正确下一动作”为目标，而不是以术语完整、理论优雅或文字最短为目标。

### 0.7 Prompt 遵循的稳定性要靠分层保证

清晰直白的 Prompt 是必要条件，但不能把所有稳定性都寄托在模型遵循文字上。后续设计应把要求按“谁最适合可靠承担”分层：

~~~text
必须每轮发生、可以由系统确定性触发
→ Harness / Brain runtime 保证

需要理解当前语义、根据情况判断
→ 用短、直接、低歧义的 model-facing guidance 交给主模型

绝不能因为模型漏读 / 误解而破坏的权限、数据或状态 invariant
→ 尽量由 tool schema / runtime / permission / compare-and-set 等机制直接约束

只有当前领域 / decision point 才需要的详细方法
→ condition → read / progressive disclosure，在需要时再加载
~~~

例如：

- “每个 user turn 必须先恢复 cognition anchor”不应写成一句让模型自觉遵守的 Prompt，而应由 Host / Harness 确定性触发；
- “当前表达可能只是 solution，要结合现实恢复真正问题”需要开放语义理解，适合写成直白 model guidance；
- “non-empty shared Core 不能用 stale whole-document replacement 静默覆盖”已有明确状态 invariant，适合由 exact-edit / compare-and-set 机制直接阻止，而不是只提醒模型‘小心并发’；
- software / UI / POC 等详细方法不需要全部常驻，通过容易判断、偏向避免漏读的条件继续读取。

因此“Prompt 怎么写”与“什么应该根本不靠 Prompt”必须同时设计。越重要、越可机械验证的 invariant，越不应只依赖语言遵循；越需要开放世界语义判断的部分，越要把 Prompt 写得简单、具体、靠近 decision point。

最终还需要用真实任务 replay 检查不同能力模型是否按预期执行这些文字；在 replay 前只能声称 Prompt 已按低歧义原则设计，不能声称弱模型已经稳定遵循。

### 0.8 Prompt 进入代码前必须先经过独立审核

新的能力设计、model-facing Prompt 和 production 实现是三个顺序阶段：

~~~text
能力 Contract 稳定
→ 写出完整 Prompt 候选文本
→ 单独审查文字是否清楚、直接、低歧义、可执行
→ decision owner 明确认可该 Prompt
→ 才进入 Brain / Harness / tool / renderer 等代码实现
~~~

“继续能力设计”只表示继续讨论能力；它不自动批准尚未展示的 Prompt。“Prompt 方向认可”也只有在完整候选文本已经展示并被明确接受后，才构成把该文本写入代码的依据。

审核时直接看最终模型会看到的完整文字，而不是只看摘要、伪代码或设计意图。至少检查：

- 只看这段文字时，模型是否知道什么时候适用；
- 需要依据什么区分不同情况；
- 条件成立后具体做什么；
- 什么时候可以直接继续，什么时候需要展开；
- 什么情况说明已经足够，可以停止；
- 是否存在需要读者依赖作者脑中背景才能补出的关键关系；
- 示例是否只是校准判断，而没有偷偷增加另一套规则。

如果后续实现阶段发现 Prompt 必须发生 materially different 的语义修改，应先回到完整 Prompt 审核，再继续代码修改；实现者不能为了接线方便静默改写 Prompt Contract。

## 1. 为什么 problem representation 比“推理能力”更上游

很多失败并不是推理链本身算错，而是**一开始解决的就不是正确的问题**。

用户说：

> 我想做一个 app。

如果模型立即表征成：

~~~text
Task = design and implement an app
~~~

后面即使产品设计、架构和代码都很好，也可能只是高质量完成了错误任务。

真正需要先恢复的是一组关系：

~~~text
当前发生了什么？
→ 为什么用户现在把它提出来？
→ 用户希望现实中的什么结果发生变化？
→ “app”在这里是目标、约束、已有决定，还是当前想到的 solution？
→ 哪些前提已经被用户确认？
→ 哪些只是 assistant 根据常见模式补出来的？
~~~

### 研究支持

Expertise 研究长期显示，专家与新手的差异之一是问题表征：专家更容易按照决定结果的 deep structure / principles 组织问题，而新手更容易被 surface features 吸引。

跨 representational domain 的 problem-solving 神经影像 meta-analysis 也把“initial characterization of the problem”视为问题解决的重要组成：求解者需要识别当前情境隐含或相关的 rule set；同时存在跨领域共享的 control network 和领域特定的 representation subnetworks。

### 综合推论

对通用 AI 来说，problem representation 不应该只是一个“摘要字段”。

它至少同时包含：

~~~text
phenomenon / situation
goal / desired change
actors / owners
constraints
causal structure
current hypotheses
relevant history
unknowns
decision / action boundary
~~~

哪些部分需要显式写出来，哪些可以保持在自然语言 working context 中，是后续实现问题。

真正重要的是：**模型后续的 retrieval、research、role selection、reasoning 和 action 都应该受到当前 representation 驱动。**

## 2. Representation 是任务相关压缩，不是把现实全部复制进 context

一个好 representation 不等于“把所有已知信息全部保留”。

认知系统之所以需要 representation，恰恰因为真实世界的信息远超当前计算能力。

因此形成 representation 同时做两件事：

~~~text
保留当前目标下会决定结果的关系
+
暂时把其他细节留在背景 / external source
~~~

这个过程必然有选择。

问题也由此出现：

> **模型怎么知道什么值得进入当前 working representation？**

没有一个永远正确的静态答案。它取决于：

- 当前目标；
- 正在判断的 claim；
- consequence；
- 可获得 evidence；
- 当前已有 hypotheses；
- 哪些 relation 会改变行动。

所以 problem representation 与 information search 是循环关系：

~~~text
当前 representation
→ 决定什么 information 看起来重要
→ 新 information
→ 修改 representation
~~~

这与 Klein 的 Data-Frame Theory、Pirolli & Card 的 sensemaking loop 在结构上相近。

## 3. Frame 的价值不只是解释已有 data，还在于产生“下一步该找什么”

一个 representation 真正有用时，会产生预测：

~~~text
如果我的理解是对的
→ 我还应该观察到什么？
→ 什么 evidence 会支持它？
→ 什么 evidence 会让它明显变弱？
→ 哪个未知最能区分它与其他解释？
~~~

例如用户说：

> 我收藏很多东西，但后来基本都不会再看。

当前至少可能有：

~~~text
H1 retrieval failure：需要时搜不到
H2 prospective-memory failure：根本想不起保存过
H3 context-loss：忘了当初为什么觉得它重要
H4 trigger failure：没有在合适任务/时机重新浮现
H5 capture pathology：保存成本太低，导致没有真正处理
~~~

这时高信息量的问题并不是：

> “你喜欢什么样的 UI？”

而是能够区分这些 hypotheses 的 concrete incident：

> “讲一个最近真的发生过的例子：你保存了什么，后来什么时候又想用它，当时发生了什么？”

所以“理解用户意图”不能只写成一句抽象 instruction。

一个好的 frame 应自然产生下一 evidence need。

## 4. Metacognition 的关键不是“多想一层”，而是 monitoring → control

Nelson & Narens 的经典 metacognitive framework 区分：

- object level：实际记忆、推理、解决问题；
- meta level：对 object level 进行 monitoring，并据此 control。

Meta-reasoning 的后续研究把同样关系扩展到复杂 reasoning/problem solving。

对 Brain 最有价值的不是脑区对应，而是功能依赖：

~~~text
Monitoring
    我现在的理解 / 答案到底有多可靠？
    哪一部分最不稳？
    当前策略是否正在取得进展？
    新 evidence 是否与 frame 冲突？

↓ informs

Control
    继续当前方法？
    花更多计算？
    换策略？
    找 external information？
    recall past cognition？
    ask user？
    experiment？
    stop and act？
~~~

### 一个重要限制

Meta-reasoning 研究也反复表明：

> 人的 confidence / metacognitive judgment 并不总是与真实 accuracy 完美校准。

因此 AI 不能把：

~~~text
“我感觉已经理解”
~~~

当成：

~~~text
“已经有足够 evidence”
~~~

更稳的是让 monitoring 尽量依赖可观察关系：

- 当前 conclusion 具体依赖哪些 evidence；
- 是否还能构造不违反现有 evidence 的 materially different interpretation；
- 是否有 anomaly；
- 关键事实是否真正读取 / 验证；
- action consequence 多大；
- feedback 是否支持当前模式。

## 5. Meta-control 不是“中央小人”

讨论 Brain 时很容易自然画出：

~~~text
Meta Controller
→ 看懂全部状态
→ 选择正确 role
→ 选择正确 tool
→ 决定正确深度
~~~

这个图很直观，但它隐藏了一个问题：

> **谁来保证 Meta Controller 自己理解正确？**

认知科学里的 executive-function 研究也遇到同样的 homunculus problem。

近年的 review 越来越强调：executive control 更像分布式系统的 emergent coordination，而不是一个位于脑内、拥有全部知识的单一 executive。Multiple-Demand network 的研究也显示跨任务共享的 flexible control network 与领域特定表征同时存在：通用网络协调、聚焦和组织 mental programs，但具体内容仍由不同 representation systems 共同承担。

### 对 Brain 的综合推论

Brain 的上层机制不宜变成一个庞大的显式 state machine：

~~~text
识别任务类型
→ 固定分配角色
→ 固定走完整 workflow
→ 每一步都通过中央 controller
~~~

更自然的形态可能是：

~~~text
每个用户 turn 重新靠近当前上下文的少量稳定 meta-guidance
    + 当前 conversation / thread 中已经存在的任务状态
    + 当前 evidence
    + 可按需召回的专业方法
    + Tool / environment feedback
    + 主模型本身的 pattern recognition
→ 动态产生下一认知动作
~~~

也就是说：

> **元层负责提出最小但关键的控制问题，具体认知仍由主模型和按需激活的方法完成。**

这与 Brain 早期“机制管结构，模型管语义”的原始思想是兼容的，但现在理由更深：不仅因为程序无法正确理解所有语义，也因为“中央控制器承担所有智能”本身会把问题向上递归一次。

## 6. 那么 meta-level 最小需要维护什么？

这是当前值得验证的设计假设。

一个真正最小的 meta-level 可能不需要维护复杂 taxonomy，只需要持续使以下关系可用：

~~~text
1. Current Goal
   现在真正希望改变什么结果？

2. Current Frame
   我现在怎样解释这个问题？

3. Evidence Basis
   这个解释凭什么成立？

4. Material Uncertainty
   哪个未知 / alternative 会改变方向？

5. Cognitive Bottleneck
   当前阻止正确继续的是：
   meaning、fact、mechanism、solution、execution 还是 verification？

6. Next Information / Computation Need
   什么新的 evidence 或 computation 最可能改善当前判断？

7. Feedback
   刚才的行动 / 新 evidence 是否要求更新 frame？
~~~

注意这些不是建议现在新增七个 schema 字段，也不表示 Brain 应把它们保存成 global / project 的共享 current state。

它们首先是当前 conversation / thread 中需要在认知上成立的**关系**。多个并发会话可以同时拥有不同的 Current Goal、Current Frame 和 Bottleneck，因此不能把它们压成一个项目唯一 shared state。

但如果某项 active work 需要在 context compaction、新会话或其他项目会话中继续，那么恢复该工作的必要 goal / frame summary / progress / blocker / remaining work 就应保存到该工作自己的 `@project` cognition。

Brain 的职责因此有两层：每个用户 turn 重新恢复**怎样形成、检查和更新这些关系的方法**；同时为需要跨 context 继续的 active work 保存最小充分的 project continuity cognition。

如果主模型在这种 guidance + task-specific project memory 下能稳定继续，就没有必要再引入一个全项目共享的中央 current-state schema。

## 7. “下一步做什么”可以理解成资源分配问题

### 研究支持

Lieder & Griffiths 的 Resource-Rational Analysis 提供一个有用的规范性框架：认知策略不只看答案质量，还要把有限 computation 的成本纳入考虑。

Rational metareasoning 更具体地把“做一次 computation”本身视为一个 decision：

~~~text
做这次 computation
→ 可能改善最终 decision
→ 但会消耗时间 / computation / opportunity
~~~

Callaway 等人的工作讨论了：

- 什么时候停止计算；
- 多个候选之间把计算分配到哪里；
- planning 时哪些 computation 值得做。

Shenhav、Botvinick、Cohen 的 Expected Value of Control 又从 cognitive-control 角度提出类似结构：control allocation 与预期收益、需要投入多少 control、以及 effort cost 有关。

### 必须保留的边界

Resource-rationality 是非常有价值的分析 / normative framework，但不能直接写成：

> “人类大脑事实上就是严格按 Value of Computation 最优计算。”

相关同行评论明确指出，应区分“研究者用 resource-rationality 建模”与“人实际上就是 resource-rational agent”。

所以 Brain 可以借用其**决策关系**，不需要假装实现一个精确的人脑定律。

### 对 Brain 的综合推论

元认知下一步可以抽象成：

~~~text
candidate cognitive action
    recall / search / reason / ask / experiment / verify / act

expected improvement
    会减少哪个 material uncertainty？
    会改变哪个 decision？
    会避免什么 high-consequence error？

cost
    token
    latency
    Tool calls
    user interaction cost
    implementation / experiment cost

↓
选择当前足够有价值的 cognition action
~~~

这给“什么时候 ask_search”“什么时候继续搜索”“什么时候停止”提供了共同根。

## 8. Search / Recall 不应追求“相关最多”，而应追求“判断改善最大”

语义相似度回答的是：

> 什么内容和 query 最像？

BM25 回答的是：

> 什么内容与 query 有最强 lexical match？

它们都是 retrieval signal。

但 meta-level 真正关心的是：

> **哪条 cognition 最可能改变或校准我现在的 working model？**

这两者并不总相同。

例如当前 hypothesis 是：

> “用户过去一直偏好完全自动化。”

最有价值的 memory 可能恰好是一条：

> “用户在高风险 mutation 上明确要求先展示再确认。”

它未必与“自动化” query 有最高语义相似度，却可能 materially 改变行动。

因此长远看，Brain retrieval quality 可以分两层理解：

~~~text
Retrieval Layer
    尽量找出 candidate cognition

Reasoning / Selection Layer
    判断哪条 candidate 对当前 frame / uncertainty / decision 最有价值
~~~

简单 hybrid RAG 可以主要负责第一层。

是否需要 graph、reranker、relation-aware expansion，要看第一层经常漏掉哪一种真正高价值 cognition。

## 9. 为什么“role”仍然有价值，但不应成为控制中心

LLM 很擅长根据 role cue 激活一套相关语言和 reasoning prior。

因此：

~~~text
当前 bottleneck
→ 激活某套成熟专业方法
~~~

仍然很有价值。

但 role 更适合被看成**一组 computation strategy 的可读标签**，不需要成为独立 runtime state。具体方法可以同时组合；至于这些方法怎样存储、分类和召回，留给后续 Brain 设计决定。

例如：

~~~text
interviewer
    = 一组取得 user-owned evidence 的策略

diagnostician
    = 一组生成 / 区分 causal hypotheses 的策略

researcher
    = 一组寻找 / 校验 external evidence 的策略

designer
    = 一组从 goal / constraint 推导 solution 的策略

reviewer
    = 一组主动寻找 counterexample / failure 的策略
~~~

Meta-level 不需要问：

> “我现在应该是谁？”

更根本的问题是：

> **“当前 bottleneck 是什么，哪套认知策略最可能解除它？”**

“进入角色”只是模型层的一种高效实现方式。

## 10. Stability 与 Flexibility：什么时候不应该切换

Adaptive cognition 不表示持续切角色、持续查资料、持续推翻 frame。

Task switching 本身有成本。Egner 对 cognitive stability / flexibility 的综述强调，自适应行为需要同时具备：

- 在当前任务上保持 focus、抵抗干扰；
- 情境变化时能够切换。

因此 meta-control 还需要一个容易被忽略的判断：

~~~text
新 evidence 是否真的改变当前主要 bottleneck？
~~~

如果没有：

~~~text
保持当前 frame / strategy
→ 继续
~~~

如果有：

~~~text
更新 frame
→ 必要时切 role / method
~~~

这可以避免 Brain 最终变成“每轮重新规划一遍自己的认知架构”。

## 11. Feedback 才让 meta-control 越来越可靠

当前选择的认知策略是否正确，不能只靠内部 self-evaluation。

真正有价值的 feedback 包括：

- 用户 correction；
- 新 evidence 与 hypothesis 的冲突；
- experiment result；
- implementation outcome；
- test / verification；
- 后续任务证明某 memory 有用或误导；
- 某 search 没有产生任何能改变判断的信息；
- 某次向用户提问实际上重复问了已经存在的 context。

由此可以学习：

~~~text
什么条件
→ 什么 cognitive action
→ 最终产生什么效果
~~~

这可能是未来 Brain 真正“变聪明”的重要对象。

比单纯记录：

~~~text
某 memory 被读取了 5 次
~~~

更有意义的是：

~~~text
在什么 frame / bottleneck 下调用了哪种 cognition
→ 是否真正帮助判断 / 行动
→ 后续是否被纠正
~~~

是否应该显式建模这种 feedback，是后续 design question；根层先保留这个因果关系。

## 12. 一个可供后续 LLM Eval 的最小认知循环

当前最值得先验证的，不是复杂 controller，而是一段非常小的行为闭环：

~~~text
A. Frame
   根据当前用户表达、相关上下文和已知现实，
   形成一个可修正的当前问题理解。

B. Monitor
   找出仍可能 materially 改变这个理解或下一行动的 uncertainty。

C. Route
   判断最有价值的新 evidence / computation 从哪里来：
   past cognition、current project、external source、user、experiment，
   或者当前 information 已经足够。

D. Apply
   使用最适合解除当前 bottleneck 的认知方法。

E. Update
   把新 evidence 吸收回 frame；发现重要冲突时重构，而不是保护旧解释。

F. Stop / Act
   当继续 cognition 的预期价值已经不足以改变当前行动时，停止搜索并行动。
~~~

如果一个 LLM 只通过这套最小 guidance + Brain recall 就能显著减少：

- 过早误解；
- 重复询问；
- 无意义 research；
- 旧 memory 机械套用；
- workflow role inertia；

那么它可能比一个复杂 explicit meta-controller 更接近我们真正需要的东西。

## 13. 对后续 Brain 设计最重要的新增问题

基于这一轮研究，后续设计应特别验证：

1. **Frame 是否需要显式状态？**
   还是当前对话 + minimal resident guidance 已足够。

2. **Material uncertainty 能否由模型稳定识别？**
   需要怎样的 counter-hypothesis / evidence guidance 才不会只写形式化 uncertainty。

3. **information need 是否能直接驱动 ask_search query？**
   与“直接拿用户最新消息做 query”做真实 A/B。

4. **Meta-control 是否需要持久化？**
   长任务中 bottleneck / frame 的 continuity 是否会像其他 cognition 一样衰减。

5. **如何避免 controller homunculus？**
   每增加一个 control state，都要说明它如何通过实际 evidence 更新，而不是再依赖一个更高层模型去“正确理解它”。

6. **如何衡量 cognition action 的收益？**
   不要求做精确 VoC 数学，而是建立足够轻量的行为指标：是否改变判断、避免错误、减少用户交互或解除关键 uncertainty。

7. **feedback 是否应该影响方法召回？**
   例如某种 role / skill 在特定条件下反复被纠正，未来应怎样降低其 applicability。

这些问题比“先设计一套角色枚举”更接近根。

---

## 主要研究来源

1. Ackerman, R., & Thompson, V. A. (2017). *Meta-Reasoning: Monitoring and Control of Thinking and Reasoning*. Trends in Cognitive Sciences, 21(8), 607–617. DOI: 10.1016/j.tics.2017.05.004.
2. Zink, N., Lenartowicz, A., & Markett, S. (2021). *A new era for executive function research: On the transition from centralized to distributed executive functioning*. Neuroscience & Biobehavioral Reviews, 124, 235–244. DOI: 10.1016/j.neubiorev.2021.02.011.
3. Bartley, J. E. et al. (2018). *Meta-analytic evidence for a core problem solving network across multiple representational domains*. Neuroscience & Biobehavioral Reviews, 92, 318–337. DOI: 10.1016/j.neubiorev.2018.06.009.
4. Duncan, J. (2010). *The multiple-demand (MD) system of the primate brain: mental programs for intelligent behaviour*. Trends in Cognitive Sciences, 14(4), 172–179. DOI: 10.1016/j.tics.2010.01.004.
5. Shenhav, A., Botvinick, M. M., & Cohen, J. D. (2013). *The Expected Value of Control*. Neuron, 79(2), 217–240. DOI: 10.1016/j.neuron.2013.07.007.
6. Lieder, F., & Griffiths, T. L. (2020). *Resource-rational analysis: Understanding human cognition as the optimal use of limited computational resources*. Behavioral and Brain Sciences, 43, e1. DOI: 10.1017/S0140525X1900061X.
7. Rahnev, D. (2020). *Resource-rational analysis versus resource-rational humans*. Behavioral and Brain Sciences, 43, e19. DOI: 10.1017/S0140525X19001699.
8. Callaway, F., Gul, S., Krueger, P. M., Griffiths, T. L., & Lieder, F. (2018). *Learning to select computations*. UAI 2018.
9. Griffiths, T. L., Lieder, F., & Goodman, N. D. (2015). *Rational Use of Cognitive Resources*. Topics in Cognitive Science, 7(2), 217–229. DOI: 10.1111/tops.12142.
10. Egner, T. (2023). *Principles of cognitive control over task focus and task switching*. Nature Reviews Psychology, 2, 702–714.
11. Hu, X. et al. (2026). *Metacognitive sensitivity predicts the quality of information search in value-based decision making*. Cognition, 269, 106410. DOI: 10.1016/j.cognition.2025.106410.
12. De Sabbata, C. N., Sumers, T. R., & Griffiths, T. L. (2024). *Rational Metareasoning for Large Language Models*. arXiv:2410.05563. This is direct LLM evidence but remains preprint evidence and should not be treated as settled architecture.
