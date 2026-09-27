# 07 · Harness 如何提高 LLM 的能力下限

> 本文继续 [04-harness-as-cognitive-system.md](04-harness-as-cognitive-system.md)。
>
> 目标不是列举 Agent 框架功能，而是回答一个更根的问题：
>
> **为什么同一个高能力 LLM 放进不同 Harness 后，会表现出很不同的可靠性？一个 Harness 真正通过什么机制提高模型的有效能力下限？**
>
> 这里的“提高下限”指：减少模型本来具备完成能力，却因为上下文、工具、状态、反馈、权限、恢复和环境可见性问题而产生的可避免失败。它不意味着 Harness 能消除模型本身所有认知上限。

## 1. 评价单位应该是 Model × Harness，而不是 Model

2026 Harness-Bench 在 106 个现实 Agent workflow、5,194 条执行轨迹中发现，不同 model–harness pairing 在完成率、过程质量、效率和失败行为上存在显著差异。

它还识别出一种很重要的 failure：

~~~text
模型生成了看起来合理的 reasoning
但 reasoning 已经与：
    tool feedback
    workspace state
    evidence
    verifiable output contract
脱节
~~~

这说明 practical capability 不应该只问：

> “这个模型聪不聪明？”

还要问：

> “这个 Harness 是否让模型持续接触到正确的现实、状态和反馈？”

2026 年 9 月刚接受到 EMNLP 2026 的 *Beyond Prompts* 又提供了更直接的 fixed-model evidence：在保持底层模型不变时，只优化 prompt、tool-boundary middleware、state handling 和 recovery logic，作者报告在 BFCL multi-round、tau2-Retail、tau2-Telecom 上分别获得 14.2、14.9、10.1 个百分点的 held-out lift；同时论文特别强调，Harness 优化不能只看平均提升，还要看 worst-condition、repeatability 和所选 Harness 是否 brittle。

这说明“提高下限”本身就是一个可以独立优化的工程对象，不必等模型重新训练。

来源：

- Zhao et al. (EMNLP 2026), *Beyond Prompts: Measuring and Optimizing LLM Tool-Agent Harnesses*: https://arxiv.org/abs/2609.05736

因此后续 Eval 至少应以：

~~~text
Model version
+ reasoning budget
+ Harness configuration
+ environment / available evidence
~~~

作为一个完整运行配置报告。

来源：

- Yao et al. (2026), *Harness-Bench: Measuring Harness Effects across Models in Realistic Agent Workflows*: https://arxiv.org/abs/2605.27922

## 2. 第一承重机制：Legibility——让现实对模型可读

OpenAI 在大规模 Codex 工程实践中的一个核心经验是：

> Agent 无法直接看到的东西，实际工作中近似于不存在。

因此他们不仅给 Codex 看代码，还逐渐让：

- UI；
- DOM / screenshot；
- logs；
- metrics；
- traces；
- design history；
- plans；
- quality state；

都变成 Agent 可以直接访问的对象。

这不是简单“增加工具”。

真正发生的是：

~~~text
过去需要人类观察现实
→ 人类理解
→ 人类转述给模型

变成

现实
→ Harness 提供 model-legible interface
→ 模型直接观察
~~~

这显著减少了：

- 人工转述失真；
- 用户重复提供背景；
- 模型凭先验猜当前状态；
- “代码改了但实际 UI 仍然坏”的闭环断裂。

SWE-agent 的 Agent-Computer Interface 研究也较早证明了类似关系：同一个语言模型，如果文件浏览、编辑、搜索、执行反馈的接口更适合模型使用，其软件工程表现会明显改善。

### 根原则

> **Harness 首先应提高现实的可读性，而不是先增加模型内部推理复杂度。**

对 Brain 来说，这同样意味着 memory 的第一目标不是“存更多”，而是让过去真正会改变当前理解的 cognition 在需要时变得 legible。

来源：

- OpenAI, *Harness engineering: leveraging Codex in an agent-first world*: https://openai.com/index/harness-engineering/
- Yang et al. (NeurIPS 2024), *SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering*: https://proceedings.neurips.cc/paper_files/paper/2024/hash/5a7c947568c1b1328ccc5230172e1e7c-Abstract-Conference.html

## 3. 第二承重机制：Context Selection——当前只给模型最值得看的东西

Anthropic 对 context engineering 的定义很有价值：

> 重点已经从“system prompt 怎么写”转向“当前 inference 时，到底应该让模型看到哪些 token”。

它给出的经验与 OpenAI 的“map, not a 1000-page manual”高度一致：

~~~text
完整信息宇宙
≠ 当前 context

Harness
→ 维护完整可恢复信息
→ 根据当前工作面选择高信号部分
→ 必要时 just-in-time 深入
~~~

适合的模式包括：

- progressive disclosure；
- index / map → targeted read；
- tool discovery on demand；
- old raw ToolResult 在已经吸收后退出 working context；
- long-horizon compaction；
- structured notes / memory；
- 必要时 subagent 分离 context。

### 根原则

> **Harness 的 context 职责不是“把信息放进去”，而是维持当前 problem representation 所需的最小充分工作面。**

这与 Brain 当前的方向直接相关：

~~~text
长期 cognition 全量外部保存
→ 当前 information need
→ bounded candidate
→ exact read
→ 当前 working context
~~~

因此 top-k、summary、description、chunking 最终都只是这个职责的局部实现。

来源：

- Anthropic, *Effective context engineering for AI agents*: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- OpenAI, *Harness engineering*: https://openai.com/index/harness-engineering/

## 4. 第三承重机制：External State——“发生过”与“模型现在看见”分开

Anthropic Managed Agents 给出了一个很清楚的架构：

~~~text
session
    durable event log / recoverable history

harness
    当前怎样选择和组织 context

sandbox / tools
    执行与现实交互
~~~

其中一个关键观点是：

> **Session 不是 context window。**

所有发生过的事件可以持续保存，但模型每次只看到当前 Harness 投影进 context 的部分。

这是一个非常重要的分离：

~~~text
Persistence
    这个事实未来还能不能找回来？

Visibility
    当前 inference 要不要让模型看到？

Working cognition
    模型当前正用什么来判断？
~~~

三者不应混成一个东西。

### 对 Brain 的意义

Brain 也应该继续保持：

~~~text
cognition persistence
≠ cognition resident
≠ 当前正在 reasoning 中使用
~~~

Brain 保存一份 cognition，只说明未来可以恢复；不说明它每轮都要常驻，也不说明一旦召回就必须采纳。

来源：

- Anthropic, *Scaling Managed Agents: Decoupling the brain from the hands*: https://www.anthropic.com/engineering/managed-agents

## 5. 第四承重机制：Capability Ergonomics——让模型容易正确使用能力

Tool 是模型与外部世界之间的 interface。

Anthropic 的 tool-engineering 实践指出，Agent tool 与传统程序 API 不同：调用方不是确定性代码，而是概率模型。

因此 Tool 的质量不只看“功能是否存在”，还要看模型是否能稳定判断：

~~~text
什么时候用
→ 参数怎样形成
→ 调用后发生了什么
→ 输出意味着什么
→ 失败后还能怎样继续
~~~

典型高价值特征：

- 工具职责清楚；
- 相邻工具少重叠；
- 参数语义直接；
- 输出 bounded、model-legible；
- empty / partial / stale / failure 显式区分；
- 大 tool catalog 按需 discovery，不全部塞进 context；
- 能把底层复杂 schema 包装成更适合模型的动作。

SWE-agent 甚至发现非常小的接口差异都会明显改变行为：

- 文件 viewer 一次展示适当长度；
- search 结果过多细节反而让模型更困惑；
- command 无输出时显式告诉模型“成功且没有输出”。

### 根原则

> **能力存在，不等于模型实际拥有这个能力；只有接口足够 legible、discoverable、recoverable，它才成为 Agent 的 realized capability。**

这对 Brain tool description、ask_search / grep / glob 的关系特别重要。

来源：

- Anthropic, *Writing effective tools for agents*: https://www.anthropic.com/engineering/writing-tools-for-agents
- SWE-agent ACI docs: https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/aci.md

## 6. 第五承重机制：Feedback Loop——每次行动重新接回现实

LLM 一个很危险的 failure 是：

~~~text
形成一个 frame
→ 行动
→ 得到 tool result
→ 没真正更新 frame
→ 按旧故事继续推
~~~

Harness-Bench 把这种现象称为 execution-alignment failure：reasoning 与 workspace state、tool feedback、evidence、output contract 逐渐分离。

因此一个高质量 Harness 应把重要动作组织成：

~~~text
Intent / hypothesis
→ Action
→ Observable result
→ Interpret result
→ Compare with expected postcondition
→ Update state / frame
→ Continue / recover / stop
~~~

这里真正重要的不是“必须 ReAct 格式”。

而是：

> **动作产生的现实反馈必须重新成为下一判断的 evidence。**

### Feedback 强度也不同

~~~text
search result
    提供新的可能 evidence

runtime observation
    提供当前事实

test / verifier
    对一个具体 postcondition 提供更强反馈

deterministic validator
    对明确 invariant 给出机械判定
~~~

不能把它们都简单叫“tool result”。

### 对 Brain 的意义

Brain recall 返回的是 past cognition candidate，属于 evidence acquisition。

如果当前 claim 可以通过真实运行、官方资料或 deterministic check 直接验证，就不应该只因为 Brain 里以前记过某结论而停止。

## 7. 第六承重机制：Deterministic Invariants——不用模型记住硬边界

一类问题不应该反复要求概率模型“记得遵守”。

例如：

- permission；
- sandbox boundary；
- tenant / object isolation；
- schema validity；
- protected files；
- irreversible-action authorization；
- dependency direction；
- syntax / structural validity；
- resource budget。

OpenAI 的 agent-first repository 实践中特别强调：

~~~text
模型负责自由实现
Harness / repo mechanically enforce invariants
~~~

他们用 structural tests、custom linters、boundary validation 等保证架构约束。

2026 关于 auditable harness 的研究也给出类似结果：把关键 contract 从 prompt 移到 code/schema/validator 后，可以在替换模型时继续稳定保证；仅靠 prompt 更容易让违规结果到达用户。

### 根原则

> **100% 可确定表达且错误后果重要的 invariant，优先由 Harness 机械保证；不要把它变成模型每轮需要重新理解和记住的认知负担。**

这会直接提高下限，因为它把一类随机 failure 从概率问题变成确定性系统行为。

来源：

- OpenAI, *Harness engineering*
- Ahn & Kim (2026), *From Prompts to Contracts: Harness Engineering for Auditable Enterprise LLM Agents*: https://arxiv.org/abs/2607.08028

## 8. 第七承重机制：Recovery——失败是新状态，不是任务终点

真正长任务不可避免会遇到：

- tool failure；
- environment crash；
- stale result；
- invalid edit；
- timeout；
- context reset；
- host restart；
- network failure。

一个差 Harness 会让这些 failure 直接破坏 cognition continuity。

一个好的 Harness 则会把失败变成：

~~~text
observable structured event
→ durable state
→ model receives actionable feedback
→ retry / alternate path / recovery
~~~

Anthropic Managed Agents 把 session log 与 harness / sandbox 分离后，Harness 本身 crash 也能从 durable session 恢复；sandbox 失败也只是一个 tool-call error，可以重新 provision。

这说明：

> **长期可靠性很大部分来自 recoverability，而不是假设每一步都不会失败。**

### 对 Brain 的意义

Brain 本身也应更重视：

- interrupted work 怎样恢复；
- cognition update 中途失败怎样解释；
- retrieval runtime unavailable 时怎样 fallback；
- host restart 后什么必须继续成立。

而不是只测试 happy-path search / write。

来源：

- Anthropic, *Scaling Managed Agents: Decoupling the brain from the hands*

## 9. 第八承重机制：Harness 必须随着模型变强而“退化”自己的控制

这是很容易被忽略的一点。

Anthropic 明确指出：

> Harness 会编码“模型当前自己做不到什么”的假设，而这些假设会随模型变强而过时。

他们曾为 Sonnet 4.5 的 “context anxiety” 增加 context reset；换到更强模型后，这个行为消失，旧 reset 反而变成 dead weight。

所以 Harness 不是越多越好。

可以把每个机制理解成：

~~~text
Observed model failure
→ external support
→ Eval 证明 support 有价值
→ 模型升级
→ 重新 Eval
→ failure 已消失：
      删除 / 简化 support
   failure 仍在：
      保留
~~~

### 根原则

> **Harness 是能力补偿层，不是永久流程宗教。**

这与 Brain 尤其相关。

今天 Luna 需要显式 active recall trigger，不代表未来更强模型仍需要相同 wording。

今天需要 ask_search，不代表未来宿主不会直接提供更好的 memory retrieval。

Base 应保存根 failure 与 desired cognition，而不是把当前 workaround 神圣化。

来源：

- Anthropic, *Scaling Managed Agents: Decoupling the brain from the hands*

## 10. Harness 的最高级目标：改变问题形态

把前面八条压缩后，可以看到 Harness 真正做的事情：

~~~text
原始困难：
模型需要在巨大、模糊、长期、动态的现实中
同时记忆、感知、推理、搜索、执行、验证、恢复

Harness 转换后：

当前只给一个清楚问题
+ 一个紧凑 working context
+ 几个清楚可用的能力
+ 一条真实反馈
+ 可靠的长期恢复源
+ 硬边界由系统保证
~~~

也就是说 Harness 并不是直接替 LLM “思考得更聪明”。

它更像是在做 **problem transformation**：

> **把模型不稳定完成的巨大认知问题，变成一连串它更容易稳定完成的小而清楚的认知问题。**

这可能是“提高下限”最根的解释。

## 11. 但 Harness 不能把所有问题都切碎

这里存在一个相反风险。

如果 Harness 把任务预先切得太死：

~~~text
分类器决定问题类型
→ router 决定唯一 tool
→ workflow 决定步骤
→ state machine 决定什么时候停止
~~~

模型就只剩执行局部模板。

这样虽然局部下限可能提高，却会牺牲：

- 对新情况重新 framing；
- 跨领域迁移；
- 利用 unexpected evidence；
- 自主改变研究路径；
- 创造新 solution；
- 识别 workflow 本身已经不适用。

Anthropic 早期的 Agent Engineering 经验与 2026 Managed Agents 的反思都指向同一个边界：

> 简单、组合式的 support 往往优于过度 orchestration；Harness 中对模型能力的假设需要不断重审。

因此 Harness 的职责可以压成：

~~~text
Externalize what is brittle
Expose what is needed
Enforce what is deterministic
Preserve what must survive
Feedback what actually happened

Leave semantic adaptation to the model
~~~

## 12. 对 Brain：我们现在可以更精确地问“它该外部化什么”

Brain 不需要复制整个 Harness，也不需要复制 Host 已经拥有的 conversation / thread state。

它最可能承担的是 Harness 中这几类负担：

### 12.1 每轮 cognition anchor 恢复

稳定 guidance 即使长期存在于 system / project instruction，也可能因 attention drift、位置、最新消息和压缩而弱化。因此每个用户 turn 需要一个 Harness 确定性控制点，在主模型开始本轮重要语义判断前，把最小的 cognition anchor 重新放到最近上下文。

这里要区分**新能力 Contract 的最小 guarantee**与**当前 production renderer 恰好一起输出的内容**。

新能力模型目前要求的最小 guarantee 是：

~~~text
新的用户 turn
↓
Harness 确定性触发 Brain / cognition bootstrap
↓
在主模型开始本轮重要判断前，可靠提供：

1. Universal Cognitive Root
   怎样从当前 evidence 形成可修正理解、检查成立条件、
   围绕当前 bottleneck 选择下一 cognition action，并根据反馈更新

2. Collaboration Root
   用户拥有目标 / 价值 / risk / material authorization；
   AI 在边界内主动调查事实、完成专业判断；
   已有 commitment 不静默扩张到 materially different 的对象

3. Stable Routing Surface
   让模型能够继续取得：
   - 当前 project / active-work continuation cognition；
   - 当前可能适用的领域 / 专项 cognition；
   - fixed route 没覆盖时的主动 discovery 能力。
   高漏读代价且读取成本可接受时，route condition 应偏向避免漏读。
↓
主模型结合 latest user message + conversation 做开放语义判断
~~~

这三类是语义责任，不预设最终必须分别成为三段 Prompt、三个文件或三个 schema。真正要求的是：在模型第一次需要这些判断关系时，它们已经可靠可用。

User-facing expression 单独处理：它不属于 cognition root。系统只需保证在**第一次用户可见自然语言输出前**，对应 interaction / expression guidance 已可靠可用；若 Host 没有独立 pre-output hook，可以在 turn bootstrap 提前加载，这是 delivery 选择。

当前 production `anchor-renderer` 还会每轮一起渲染 archival candidate descriptions、cognitive role definitions、related-project information、preserving / maintaining cognition guidance，以及在启用时的 semantic-search guidance。这些内容可能各自有价值，但不能仅因为当前打包在同一个 `brain_think_context` 里，就全部升级成 Per-turn Bootstrap 的最小 Contract：

- passive archival descriptions 属于 opportunistic recall / discovery support；
- cognitive role definitions 属于 cognition interpretation contract；
- preserving / maintaining guidance 属于 Cognition Maintenance & Evolution；
- related-project information 属于 workspace / project accessibility；
- semantic-search guidance 属于 discovery capability。

后续可以继续共享一次物理投影，只要清楚它们的 semantic owner；也可以在新设计里拆开。能力层先不由现有 renderer shape 决定。

这应是 Brain 相对普通 memory layer 最核心的能力：**不是每轮重新塞入所有长期内容，而是每轮恢复足以让模型重新进入正确认知与读取链的最小 anchor。**

这里还带出两个 routing invariant：

1. **Route activation 是 multi-label，不是 task classifier。** 多个 condition 可以同时成立，模型可以并行进入 project continuation、software、prompt-writing 等 route；不要求先选唯一 role / workflow。
2. **Required route 与 passive cue 分开。** 被认定为 bootstrap / continuation-critical 的 route 必须 resident 或通过 guaranteed route chain 可达，不能和普通 passive candidate 一起 ranking 后被 top-k 截掉；正文仍可按需 exact read，不代表全部 resident。

### 12.2 跨时间 cognition persistence

~~~text
过去形成、跨会话仍然有价值的 cognition
不会因为 context / restart / attention decay 消失
~~~

### 12.3 Cognition discovery

~~~text
当前思考方法产生 information need
→ 能从过去大量 cognition 中找到 candidate
~~~

### 12.4 Progressive disclosure

~~~text
candidate gist
→ exact cognition
→ 必要 evidence / history
~~~

### 12.5 Cognition maintenance

~~~text
新 correction / evidence
→ 更新过去 cognition
→ 保留成立条件、supersession、challenge
~~~

Brain 不拥有一个对整个项目唯一的：

~~~text
current goal
current frame
current progress
next step
~~~

因为同一项目可以有多个并发工作流。

纯 conversation transient state 首先由当前 thread / Host context 拥有；但某个 active work 的 goal、progress、blocker、remaining work、继续任务所需判断，只要需要在 context compaction、新会话或其他会话接手时恢复，就应保存为该工作自己的 `@project` cognition。

因此 Brain 可以同时保存多个 active-work memories，但不把它们压成一个共享的 “Project Current State”。

而这些也不属于 Brain：

- web search provider；
- filesystem；
- browser；
- shell；
- GUI；
- permission enforcement；
- sandbox；
- deterministic verifier；
- generic workflow orchestration。

Brain 可以帮助模型**知道什么时候需要这些 evidence / capability**，但实际能力由 Harness 其他部分提供。

## 13. 一个更完整的系统闭环

当前 Base 可以暂时用下面这个图理解整个系统：

~~~text
                         External World
          local / web / APIs / users / runtime / services
                               ↑ ↓
                       Harness Interfaces
              tools / connectors / sandbox / browser
                               ↑ ↓
        ┌──────────────────────────────────────────┐
        │                Harness                   │
        │                                          │
        │ context selection                        │
        │ capability discovery                     │
        │ durable session / state                  │
        │ Brain cognition                          │
        │ deterministic invariants                 │
        │ permissions                              │
        │ tracing / recovery                       │
        │ verification feedback                    │
        └──────────────────┬───────────────────────┘
                           ↑ ↓
                      ┌──────────┐
                      │   LLM    │
                      │          │
                      │ frame    │
                      │ reason   │
                      │ select   │
                      │ judge    │
                      │ adapt    │
                      └──────────┘
                           ↑ ↓
                  current working context
~~~

这里 external web page 本身不是 Harness；**让模型能发现、搜索、读取、验证它的接口和运行机制**属于 Harness。

在本项目日常语言里，可以把“Agent Host + Brain + tools/connectors + context/state/permissions/recovery”整体简称为 Harness，只要 architecture 层仍保留环境与 Harness 的边界。Codex、DSH、Claude Code 等都只是可能的 Host / adapter，不进入 Brain 的根定义。

## 14. 下一步：从“Harness 一般原理”回到 problem representation

经过这轮研究，后续研究 problem representation 时，应把问题从：

> “怎样 prompt 模型更好地理解用户？”

提升成：

~~~text
为了让当前模型形成更可靠的 problem representation：

哪些 evidence 应该自动变得可发现？
哪些 past cognition 应该主动 recall？
哪些 external source 应该允许模型按需研究？
当前 context 应该怎样 bounded projection？
什么 feedback 能暴露 frame 已经错了？
哪个 invariant 不应该再让模型自己记？
怎样在新 evidence 到来后让旧 frame 被真正更新？
~~~

这才是 Model + Harness 一起实现“像顶尖通才那样思考”的正确层级。

---

## 主要参考

- OpenAI (2026), *Harness engineering: leveraging Codex in an agent-first world*: https://openai.com/index/harness-engineering/
- OpenAI (2026), *Introducing the Agents API*: https://openai.com/index/introducing-the-agents-api/
- OpenAI Agents API, *Architecture*: https://developers.openai.com/api/docs/guides/agents-api/architecture
- Anthropic (2025), *Effective context engineering for AI agents*: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic (2025), *Writing effective tools for AI agents*: https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic (2025), *Effective harnesses for long-running agents*: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic (2026), *Scaling Managed Agents: Decoupling the brain from the hands*: https://www.anthropic.com/engineering/managed-agents
- Yao et al. (2026), *Harness-Bench*: https://arxiv.org/abs/2605.27922
- Barbaste et al. (2026), *Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents*: https://arxiv.org/abs/2609.00006
- Ahn & Kim (2026), *From Prompts to Contracts*: https://arxiv.org/abs/2607.08028
- Yang et al. (NeurIPS 2024), *SWE-agent*: https://proceedings.neurips.cc/paper_files/paper/2024/hash/5a7c947568c1b1328ccc5230172e1e7c-Abstract-Conference.html
