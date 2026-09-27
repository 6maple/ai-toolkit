# 06 · Harness 作为外部认知系统

> 本文明确 Brain 与更大 Agent System 的关系。
>
> 这里的 **Harness** 使用广义定义：围绕 LLM、使其能够稳定地获取上下文、访问外部世界、调用能力、维持状态、执行动作、接受反馈并受到确定性约束的运行时系统。
>
> Brain 是 Harness 中负责**每轮认知恢复 + project/global cognition continuity** 的通用子系统，不等于整个 Harness。它一方面把跨会话稳定的思考 guidance 在每个用户 turn 重新带回模型当前最容易使用的上下文位置；另一方面保存需要在 context compaction、新会话或其他项目会话中继续的 active project work 与长期 cognition。

## 1. 更合适的基本单位不是“LLM”，而是“Model + Harness”

2026 年 Harness Engineering 的研究与工程实践已经越来越明确地把 agent 看成：

~~~text
Agent System
= Model
+ Harness
~~~

其中 Model 提供高度通用但概率性的语言、推理、模式识别与生成能力；Harness 把模型接入：

- context；
- memory；
- skills / methods；
- tools；
- local files / project；
- network / web / API；
- runtime / shell / browser / GUI；
- state；
- permissions / sandbox / policy；
- orchestration；
- verification / feedback；
- observability。

OpenAI 自己的 harness engineering 实践也强调：真正让 Codex 在复杂工程任务中工作良好的，不只是更强模型，而是把 repository knowledge、UI、logs、metrics、browser、skills 和 verification 变成模型可以直接访问和使用的工作环境。

因此，讨论 Brain 时不应把“模型”当作完整智能系统，把 Brain 当成一个附加 memory plugin。

更准确的系统观是：

~~~text
Model
    提供通用智能计算能力

Harness
    决定模型在当前任务中：
    看见什么
    能查什么
    能调用什么
    能记住什么
    能执行什么
    如何获得反馈
    什么行为被确定性限制
~~~

最终用户体验来自二者共同作用。

## 2. LLM 可以类比成“认知子单元”，但不要把类比生物化

把当前 LLM 理解成“一个具备智能的大脑子单元”有很强的解释力：

- 它拥有很强的模式识别和知识压缩；
- 能根据输入临时构造 reasoning / working model；
- 能切换不同专业方法；
- 上限很高；
- 但单独运行时容易受 framing、context、tool exposure、reasoning budget 等影响；
- 同一个模型在不同 Harness 中可以表现出显著不同的可靠性。

但这个类比只应该用于**系统职责**，不能假设：

- LLM 对应某个真实脑区；
- 人脑某种结构应该被一比一复制；
- 给模型增加“人脑模块名称”就会产生相应能力。

更稳的表达是：

> **LLM 是一个高能力但不完整、概率性、上下文敏感的通用认知引擎。Harness 把模型缺少的外部状态、感知、行动、检索、验证和控制结构接到它周围。**

## 3. “下限低，上限高”是一个很重要的 Harness 设计视角

同一个 frontier model 经常表现出很宽的能力区间。

它可能在一个好的 context / tool / feedback loop 里：

- 找到正确资料；
- 写出高质量代码；
- 做多步推理；
- 自主修复；
- 持续工作数小时。

也可能在另一个任务里：

- 漏掉明显 evidence；
- 误解用户意图；
- 不调用已有工具；
- 被长 context 干扰；
- 过早停止；
- 过度自信；
- 把一个错误 frame 一路合理化。

因此 Harness 的重要目标之一可以表述为：

> **缩小“模型偶尔能做到”与“模型稳定能做到”之间的差距，提高有效能力下限。**

但还需要一个边界：

Harness 不只提高下限。

当它提供模型原本无法直接获得的东西，例如：

- 最新网页；
- 私有项目；
- 真实运行环境；
- database / API；
- long-term memory；
- browser / computer；
- verifier；
- specialist tool；

整个 Agent System 的**可实现任务上限**也会扩展。

所以可以区分：

~~~text
Raw Model Capability
    参数模型在给定输入上的能力

Realized Model Capability
    在某个 Harness 中实际被稳定激活出来的能力

System Capability
    Model + external tools / sources / state / environment 共同能完成的任务
~~~

Harness Engineering 主要希望：

~~~text
提高 Realized Capability 的下限
+ 减少波动
+ 在需要时通过外部能力扩展 System Capability
~~~

这比只说“让模型更聪明”更准确。

## 4. “查资料”是 Harness 的 Evidence Acquisition，不是“查本地文件”

当前 Brain 讨论中，“调查 / 查资料”应使用统一的广义语义：

~~~text
当前 information need
→ 找最合适的 evidence source
→ 由 Harness 提供对应访问能力
~~~

Evidence source 可以包括：

### Past cognition

~~~text
Brain / memory / prior conversation
~~~

适合回答：

- 用户以前明确说过什么；
- 以前已经形成什么 decision / lesson / skill；
- 当前话题此前讨论到了哪里。

### Local / project reality

~~~text
files
code
git
tests
logs
database
local runtime
GUI
~~~

适合回答：

- 当前系统实际上怎样；
- 当前实现、配置、数据和行为是什么。

### Network / external reality

~~~text
web search
official docs
papers
APIs
remote repositories
services
market / public data
~~~

适合回答：

- 当前外部世界怎样；
- 最新产品 / 标准 /研究 / provider 行为是什么。

### User-owned context

~~~text
user conversation
~~~

适合回答：

- 用户目标；
- 价值取舍；
- subjective experience；
- 只有用户本人掌握的背景。

### Active experiment

~~~text
code execution
POC
simulation
benchmark
browser / computer interaction
~~~

适合回答：

- 两个合理 hypothesis 哪个与真实行为一致；
- 当前 solution 是否真的工作。

因此：

> **本地搜索、Brain recall、网络检索和实验不是四套不同的“研究哲学”，而是 Harness 面向不同 evidence ownership 提供的不同感知通道。**

模型需要判断的是“我缺什么 evidence、哪个来源最适合”，不应被迫先按实现细节选择检索算法。

## 5. Brain 必须保持 Host-agnostic

Brain 的根 Contract 不应绑定 Codex、DSH、Claude Code 或任何具体 Agent Host。

更通用的关系是：

~~~text
LLM
    ↑ ↓
Agent Host / Harness runtime
    ├─ conversation / thread context
    ├─ local / network / runtime capabilities
    ├─ tools / skills / permissions / feedback
    └─ Brain adapter
         ├─ 每个用户 turn 的确定性触发
         ├─ 稳定 Core / cognition cues 与读取 guidance 的最近上下文恢复
         ├─ project active-work continuity
         ├─ long-term cognition discovery / read
         └─ cognition maintenance
~~~

不同 Host 可以有自己的 conversation history、thread-local task state、built-in memory、project instruction 和 compaction。Brain 可以利用这些能力，但不重复保存完整 transcript 或纯 conversation transient state。与此同时，凡是 active work 需要在当前 context 消失以后继续，就应进入 Brain 的 project cognition，而不能只依赖原 thread 仍然存在。

这里 Brain 的职责不应该扩张成：

- 自己实现 web browser；
- 自己替代 shell；
- 自己复制 Host 已经拥有的 conversation / thread state；
- 自己保存全部 runtime state；
- 自己变成 workflow engine；
- 自己做所有 verification。

Brain 更应该稳定完成三件事：

~~~text
每个用户 turn
→ 确定性恢复 Scope Core 与有界 cognition cues 到最近上下文
→ 让主模型重新获得稳定的读取 / 判断 guidance

active project work 需要跨 context / 跨会话继续
→ 保存并恢复 goal / progress / blocker / remaining work 等续作 cognition

主模型在当前任务中产生 information need
→ 使用 Brain discovery / exact read 按需恢复过去 cognition、correction、decision / constraint / method
~~~

其中“当前是什么问题、哪条读取条件成立”属于主模型的语义判断；Brain 固定程序代码负责让判断所依赖的 cognition guidance 每轮重新可见，而不自己充当任务分类器。

Codex、DSH 等只作为 adapter / engineering evidence；它们的具体接线方式不进入 Brain 的根定义。

## 6. Harness 的真正作用是“外部化模型不稳定承担的认知负担”

2026 年关于 LLM Agent externalization 的研究把这个趋势概括得很清楚：

- Memory 外部化跨时间 state；
- Skills 外部化 procedural expertise；
- Protocols 外部化 interaction structure；
- Harness 把这些模块组织成 governed execution。

这与 Brain 的原始问题非常吻合。

一个认知负担如果完全交给模型内部维持，例如：

~~~text
永远记住过去 200 轮目标
永远知道有哪些可用工具
永远记得什么时候验证
永远从一百万 token 里找到关键规则
永远自己保持正确权限边界
~~~

模型可能偶尔做到，却很难稳定做到。

Harness 可以把它转换成更容易的问题：

~~~text
只投影当前 relevant state
明确暴露可用 capability
需要时恢复 active project work / 长期 cognition
真实权限由 runtime enforce
tool result 直接作为新 feedback
必要时提供 verifier
~~~

这就是“提高下限”的核心机制：

> **把模型容易忘、容易漏、容易误判、需要外部真实世界才能完成的认知负担，变成模型更容易稳定解决的局部问题。**

## 7. Harness 不能替模型完成所有语义判断

提高下限容易走向另一个极端：

~~~text
模型不可靠
→ 所有行为都写成 state machine
→ 所有搜索都由程序决定
→ 所有角色都由 router 分类
→ 所有 reasoning 都由 workflow 固定
~~~

这样会直接损失 LLM 最有价值的能力：面对新的、开放的、无法提前枚举的语义情况进行动态理解和组合。

因此更合理的职责关系仍是：

~~~text
Harness
    提供能力
    组织 context
    维护外部 state
    暴露 evidence
    enforce deterministic invariants
    提供 feedback
    保证可访问性

Model
    理解用户和任务
    形成 problem representation
    判断当前 information need
    选择适合的 capability / method
    解释 evidence
    做 semantic / professional judgment
    在 feedback 后更新理解
~~~

这与早期 Brain 的“机制管结构，模型管语义”是一致的，但现在应该放到更大的 Harness 语境下理解。

### 7.1 Agent 协作边界：语义责任与机械权限分开

Universal Cognitive Root 解决“怎样形成和校准判断”，但一个可工作的 Agent 还需要稳定知道“哪些判断该由谁负责、什么时候应该自己继续、什么时候必须回到用户”。这不是 expertise / metacognition 本身，而是 human–AI collaboration 的系统约束。

用本项目真实过程反推，可以看到三个稳定 failure：

#### Case A：用户说“继续”不等于批准尚未展示的 Prompt 或代码

当前 Brain Base 设计里，用户明确要求：新的 model-facing Prompt 必须先展示完整文本，由用户审核后才能写入 production code。因此后续一句“继续”在当前阶段只授权继续能力设计；它不能被扩大解释成：

~~~text
能力设计继续
→ Prompt 自动批准
→ production 实现自动批准
~~~

这里需要模型理解的是**commitment / authorization 的作用范围**。已有决定继续有效，但不能静默扩张到 materially different 的对象或阶段。

#### Case B：性能 / 故障问题里，AI 应自己调查，而不是把专业工作重新问给用户

此前调查大量 cognition / search scaling 问题时，用户要求先增加日志、检查真实 execution path，再判断瓶颈。项目事实、代码路径、runtime 行为和成熟实现 precedent 都是 AI / Harness 可以取得的 evidence。

如果模型因为“不确定”就问用户“你觉得哪里慢”“你想让我用 SQLite 吗”，实际上是在把 solution owner 的调查和专业判断成本转移给 decision owner。

这里稳定的关系是：

~~~text
目标和边界已经清楚
+ 缺的是可以从项目 / runtime / external source 取得的事实或专业判断
→ AI 继续调查、比较并形成方案

只有缺失的是用户独有的目标、价值、风险接受、组织约束或授权
且不同答案会改变重要结果
→ 才需要用户补充或裁决
~~~

#### Case C：用户拥有风险接受和目标裁决，代码事实不能替他做决定

例如讨论 auto-approval / Git 保护时，AI 可以分析 Git 能恢复什么、自动审批会扩大什么风险、哪些操作仍可能产生后果；但“这些风险是否可接受、是否希望全部放行”最终属于用户的产品 / workflow 取舍。

反过来，用户决定“全部 allow”也不能改变一个外部技术事实，例如 Git 是否真的能够恢复某种未跟踪状态。目标 / risk decision 与可验证事实仍是两类 owner。

从这些 case 反推，每轮需要稳定恢复的协作关系可以很小：

~~~text
用户负责自己的目标、价值、风险接受和需要其授权的决定。
AI 在这些边界内负责主动取得可访问的事实、完成专业调查并形成方案，不把可自行完成的工作重新要求用户完成。

已有决定 / 授权只在其实际范围内继续有效。
普通的专业细节由 AI 在已确认目标内继续完成；出现会改变用户结果、范围、风险或授权边界的 material change 时，再把具体差异交给有权决定的人。
~~~

这类关系适合成为 per-turn stable collaboration guidance，因为它依赖开放语义理解，无法完全由代码判断；attention drift 后一旦丢失，会直接表现为重复提问、过度请示、擅自扩大授权或替用户做价值判断。

但**实际执行权限**应尽量机械化：

~~~text
模型判断：当前决定 / 授权语义是什么
        ↓
Harness / Tool / Runtime：当前动作是否真的允许执行
~~~

例如：

- related project 的 `read | write` access 由 runtime enforcement；
- sandbox / provider permission 由 Host / Tool enforcement；
- non-empty shared Core 的 stale overwrite 由 exact-edit / compare-and-set 阻止；
- schema、路径、资源边界等能确定判断的约束由 validator / code 拦截。

因此不能用一个巨大的“Agent 权限 Prompt”同时承担语义责任和安全 enforcement。Model-facing guidance 只保留需要理解当前用户、目标、委托和 material change 才能判断的关系；可机械判定的 hard boundary 交给 Harness。

## 8. Harness 设计的核心评价对象应该是“系统行为分布”

如果 Model 的表现存在较大方差，那么 Harness 的成功不能只看一次最好表现。

更值得观察的是：

~~~text
同一类真实任务
在多个 case / replay / run 中

成功率是否提高？
严重错误尾部是否减少？
用户纠偏次数是否减少？
重复询问是否减少？
工具漏调用是否减少？
错误 frame 是否更早被纠正？
长期任务是否更少漂移？
成本是否可接受？
~~~

因此“提高下限”可以转成实际 Eval：

- p50 / p10 success；
- catastrophic failure rate；
- correction turns；
- unnecessary user questions；
- missed-evidence rate；
- unsupported-confidence rate；
- recovery after contradiction；
- tool / context / latency cost。

这比只展示一个高分 benchmark 更接近 Harness 的真实价值。

## 9. 对 Brain 根目标的修正

结合这一系统观，Brain 不应独立承担“让 AI 成为顶尖通才”的完整责任。

更准确的是：

~~~text
目标：构造一个高质量 Agent Harness
    ↓
让通用 LLM 的高能力更稳定地被激活
    ↓
并通过外部 evidence / state / tools 扩展它实际能够完成的工作

Brain：
    专门承担其中的 per-turn cognitive guidance recovery
    + long-term cognition recall / maintenance
~~~

因此 Brain Base 后续讨论任何机制时，应同时问：

~~~text
这个问题属于：
Model 本身的 semantic judgment？
Brain 的每轮 thinking-guidance recovery / past-cognition recall？
Host 的 context delivery？
Tool / provider 的 external evidence？
Runtime 的 invariant / permission？
Experiment / verifier 的 ground truth？
~~~

先找到正确 owner，再决定是否修改 Brain。

## 10. 后续研究方法也随之变化

以后研究“顶尖人才怎样思考”，不应该直接问：

> Brain 应如何复制这套机制？

而应该走：

~~~text
顶尖人类的某个认知能力是什么？
→ 它解决什么根问题？
→ LLM 当前在哪些情况下已经能做好？
→ 哪些 failure 导致它表现下限很低？
→ 最小的 Harness 支撑是什么？

可能是：
    prompt / resident guidance
    dynamic context
    Brain memory / recall
    web / API retrieval
    local/project tools
    experiment / verifier
    permission / invariant
    specialist skill / role
    orchestration

→ 再用真实模型 eval 看系统分布是否改善
~~~

这一层是后续 Brain 设计的必要边界。

---

## 参考

- OpenAI, *Harness engineering: leveraging Codex in an agent-first world* (2026): https://openai.com/index/harness-engineering/
- OpenAI, *Introducing the Codex app* (2026): https://openai.com/index/introducing-the-codex-app/
- Barbaste et al. (2026), *Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents*: https://arxiv.org/abs/2609.00006
- Tang et al. (2026), *Agent Systems with Harness Engineering*: https://openreview.net/pdf?id=nM5tDHrQsx
- Zhou et al. (2026), *Externalization in LLM Agents: A Unified Review of Memory, Skills, Protocols and Harness Engineering*: https://arxiv.org/abs/2604.08224
- Sumers et al. (2023), *Cognitive Architectures for Language Agents (CoALA)*: https://arxiv.org/abs/2309.02427
