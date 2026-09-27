# 09 · Problem Representation 在 LLM + Harness 中怎样形成与纠错

> 本文继续 [03-problem-representation-and-metacognitive-control.md](03-problem-representation-and-metacognitive-control.md) 中尚未展开的问题：
>
> **LLM 的当前 problem representation 到底由什么形成？它为什么会早早走偏？新 evidence 到来后，Harness 怎样帮助模型真正更新 frame，而不是只把更多文本追加进 context？**
>
> 这里的 `frame / problem representation` 不是要求新增一个固定 schema。它首先描述模型在当前时刻实际用来理解目标、解释 evidence、选择下一步行动的 working model。

## 1. Problem representation 是当前行为的隐含中间层

当用户说：

> 我想做一个 app。

模型后续是否：

- 直接问技术栈；
- 先恢复长期背景；
- 询问一个具体经历；
- 查过去 cognition；
- 查市场或现有产品；
- 开始做 prototype；

都取决于它已经把当前问题**理解成什么**。

因此实际运行关系更接近：

~~~text
当前 user input
+ conversation history
+ restored cognition
+ system / developer guidance
+ model prior
+ project / web / runtime evidence
+ 自己前面已经生成的回答与计划
↓
形成当前 working frame
↓
frame 决定：
    什么看起来重要
    什么被当作事实
    什么未知值得调查
    什么 tool / role / method 看起来适用
    什么动作看起来已经足够
~~~

这说明 frame 虽然常常没有显式字段，却已经是 Agent 行为中的真实中间状态。

## 2. LLM 的 frame 很容易被 surface wording 捕获

### 研究支持

2025 的 prompt-architecture 大规模实验发现，仅仅改变：

- order；
- label；
- framing；
- justification；

就能系统性改变 GPT-4、Llama 3.1 等模型的判断，而且简单告诉模型“不要受顺序/标签影响”并不能消除这种偏差。

来源：

- Brucks & Toubia (2025), *Prompt architecture induces methodological artifacts in large language models*: https://doi.org/10.1371/journal.pone.0319159

2025–2026 的 anchoring 研究进一步发现，初始数值、说法或模型自己的已有答案会持续影响后续判断；一般性的 “ignore the anchor” / reflection / chain-of-thought 并不足以稳定消除。

来源：

- Lou & Sun (2025/2026), *Anchoring bias in large language models: an experimental study*: https://doi.org/10.1007/s42001-025-00435-2
- Liu et al. (2026), *Competing Biases underlie Overconfidence and Underconfidence in LLMs*: https://doi.org/10.1038/s42256-026-01217-9

### 综合推论

用户的 surface expression 不只是提供信息，也会**预先框定模型的 problem space**。

例如：

~~~text
“我想做一个 app”
~~~

可能让模型自然激活：

~~~text
产品设计
UI
技术栈
iOS / Android
开发计划
~~~

即使真正的上游问题还没有成立。

因此好的 Harness 不应假设：

> “模型看到完整上下文以后自然会忽略表面 framing。”

更稳的是让会改变 problem frame 的 evidence 有机会进入当前 working context，并让模型有一个简单、稳定的方法把：

~~~text
用户当前 wording
≠ 自动等于最终 problem definition
~~~

## 3. 多轮对话的最大危险是 Premature Commitment

### 研究支持

Microsoft 的 *LLMs Get Lost In Multi-Turn Conversation* 在 200,000+ 模拟多轮对话中发现，所测强模型在多轮任务中平均比单轮下降约 39%。

论文把主要下降归因为 **unreliability** 而不是基础 aptitude 消失。

最关键的行为模式是：

~~~text
用户信息还在逐步出现
→ 模型早期自行补足假设
→ 过早生成完整 solution
→ 后续继续依赖自己已经生成的 solution
→ 新信息即使出现，也很难真正恢复
~~~

作者把它概括成：

> when LLMs take a wrong turn in a conversation, they get lost and do not recover.

来源：

- Laban et al. (ICLR 2026 Best Paper), *LLMs Get Lost In Multi-Turn Conversation*: https://www.microsoft.com/en-us/research/publication/llms-get-lost-in-multi-turn-conversation/

### 综合推论

这说明 assistant 自己的历史输出不是中性的 conversation history。

一旦模型已经写出：

~~~text
“所以你需要的是一个 AI 收藏 App……”
~~~

这句话会成为之后新的 context evidence，并可能反过来强化最初未经确认的 frame。

于是形成自增强回路：

~~~text
弱 evidence
→ provisional inference
→ assistant 把 inference 写得像 conclusion
→ 下一轮把自己的 conclusion 当 context
→ 更强 conviction
→ solution 继续围绕它展开
~~~

因此 Harness / Brain 需要特别防止：

> **模型自己的 provisional interpretation 因为被写进历史而自动升级。**

这也解释为什么 cognition role、decision / hypothesis / fact 区分具有根价值。

## 4. 自己已经说过的话会产生特殊的 Self-Anchoring

### 研究支持

2026 Nature Machine Intelligence 的研究发现，当模型能够看到自己的初始答案时，会表现出明显的 choice-supportive bias：

- 更不容易改答案；
- 对原答案 confidence 上升；
- 即使并没有新增支持 evidence。

把同一个旧答案说成来自“另一个模型”后，这种效应明显消失。

同一研究又发现另一面：

- 模型对反对意见可能过度更新；
- 反对信息的权重可显著高于支持信息。

来源：

- https://doi.org/10.1038/s42256-026-01217-9

### 综合推论

LLM 的 belief revision 不是简单：

~~~text
保守
或
容易被新信息改变
~~~

而是两个偏差可以同时存在：

~~~text
看见自己的旧结论
→ 倾向保护旧 frame

遇到明显 opposition
→ 又可能对 opposing evidence 过度反应
~~~

因此后续 Brain 不能依赖简单规则：

~~~text
“优先保持已有 cognition”
~~~

也不能依赖：

~~~text
“发现冲突就采用新的 cognition”
~~~

真正需要的是：

~~~text
旧 cognition 证明什么？
新 evidence 证明什么？
两者是否判断同一个 claim？
source / time / conditions 有什么差异？
是否存在 explicit correction / supersession？
当前现实由谁拥有？
~~~

然后选择性更新。

## 5. “新 evidence 已经进入 context”不等于 frame 已被更新

### 研究支持

2026 Evidence Sufficiency Benchmark 在 RAG 场景中发现：

- 面对完全没有 evidence，模型相对容易 abstain；
- 面对互相冲突、但每条都看起来 plausible 的 evidence，模型反而经常直接选一边。

在 conflicting evidence 条件中，所测七个模型 over-answer rate 都超过 65%。

来源：

- *Do LLMs Know When Evidence is Insufficient?*: https://doi.org/10.32604/cmc.2026.086343

ACL 2026 ConfRAG 使用真实 web documents 构造 1,814 个问题，其中 57.2% 含显式冲突；GPT-4.1、Claude 3.7 Sonnet 等在识别、组织和解释冲突信息上仍有明显 gap。

来源：

- Yuan et al. (ACL 2026), *Benchmarking LLM’s Capability in Reasoning over Conflicting Web References*: https://aclanthology.org/2026.acl-long.11/

### 综合推论

Harness 不能只完成：

~~~text
找到更多 evidence
→ append to prompt
~~~

还需要让模型处理：

~~~text
这条 evidence 针对哪个 claim？
支持 / 削弱 / 替代 / 限定什么？
它与哪些现有 cognition 冲突？
冲突是因为：
    时间不同？
    条件不同？
    来源不同？
    interpretation 不同？
    真正事实矛盾？
~~~

否则 retrieval 越强，可能只是把更多 mutually inconsistent material 放进 context。

## 6. “当前状态”与“过去相关信息”必须区分

### 研究支持

2026 StateMemBench 专门测试 long-running Agent memory 是否能够跟踪 evolving state：

~~~text
旧事实 / 旧约束 / 旧决定
→ 后来被修改
→ Agent 必须回答当前最新状态
~~~

现有 memory systems、RAG baselines 和 long-context baselines 都表现出明显困难。

StateMem 显式跟踪 supersession 和 relational dependencies 后，current-state accuracy 明显提升；作者还发现同样的 state wrapper 可以叠加到多个现有 memory / retrieval backend 上获得大幅改善。

来源：

- Fan et al. (2026), *Can Agent Memory Systems Track Evolving State?*: https://arxiv.org/abs/2608.19652

另一项 Supersede 研究也指出：

- frontier model 在 full context 下表现显著高于 self-maintained bounded memory；
- conversation 变长后，简单扩大 memory budget 并不能恢复 supersession accuracy；
- 问题不是只因为 memory 太小，而是 memory maintenance / current-state update 本身困难。

来源：

- Patel (2026), *Supersede: Diagnosing and Training the Memory-Update Gap in LLM Agents*: https://arxiv.org/abs/2606.27472

### 综合推论

对于 Brain：

~~~text
retrieval relevance
≠ current validity
~~~

一条旧 cognition 可以非常相关，同时已经失效。

因此长期 cognition 至少需要能够表达或恢复：

~~~text
formed context
current applicability
challenge
correction
supersession
dependency
~~~

不一定都做成结构化字段。

但系统必须能够回答：

> **当前正在形成 frame 时，这条旧 cognition 还是现行认识，还是只是一段历史 evidence？**

## 7. 模型对 Fact / Belief / Knowledge 的 epistemic role 也并不稳

### 研究支持

Nature Machine Intelligence 2025 的 KaBLE benchmark 用 13,000 个问题评估 24 个模型如何区分：

- fact；
- belief；
- knowledge；
- recursive epistemic relation。

结果显示，即使较新的模型也会系统性混淆 first-person false belief、knowledge 的 factive 条件等 epistemic relation。

来源：

- *Language models cannot reliably distinguish belief from knowledge and fact*: https://www.nature.com/articles/s42256-025-01113-8

### 综合推论

这会进一步放大 problem representation 的风险：

~~~text
用户猜测
assistant interpretation
历史 proposal
旧 implementation
confirmed decision
当前 factual observation
~~~

如果都只作为“文本”进入 context，模型可能静默把它们混成一个世界模型。

所以 Brain 当前强调 cognitive role 的方向有更深的必要性。

它不是文档分类美学，而是在替模型提供它天然并不稳定的 epistemic scaffold。

## 8. User Correction 也不能机械覆盖一切

用户 correction 是理解 user-owned intent 的高价值 evidence，但 correction 本身可能包含：

- 用户对目标的纠正；
- 用户对外部事实的错误判断；
- 仅针对某个局部含义的修正；
- 新的价值取舍；
- authority / social pressure。

SycoBench-600 专门测试模型是否：

~~~text
正确 suggestion → 应接受
错误 suggestion → 应抵抗
~~~

结果表明“愿意更新”与“选择性地正确更新”不是同一个能力。

来源：

- Sinha (ACL 2026), *SycoBench-600*: https://aclanthology.org/2026.findings-acl.1759/

因此 frame update 仍要按 claim ownership：

~~~text
用户：“我不是想做收藏 App，我要解决的是资料以后想不起。”
→ user-owned intent correction
→ 应强更新 problem frame

用户：“SQLite 肯定不支持 FTS。”
→ external technical claim
→ 作为需要验证的 evidence，不直接覆盖项目事实
~~~

这与 Brain 现有 “evidence weight depends on claim” 的原则一致。

## 9. Problem Representation 还会被 Instruction / Authority 混淆污染

### 研究支持

IHEval 发现，模型在不同优先级 instruction 冲突时性能显著下降。

OpenAI 2026 的 instruction hierarchy research 也把这一问题视为安全与可靠性的基础问题：模型同时看到 system、developer、user、tool / web 内容时，必须知道谁有权要求什么。

来源：

- Zhang et al. (NAACL 2025), *IHEval*: https://aclanthology.org/2025.naacl-long.425/
- OpenAI (2026), *Improving instruction hierarchy in frontier LLMs*: https://openai.com/index/instruction-hierarchy-challenge/

### 综合推论

Problem frame 不只是“事实理解”。

它还隐含：

~~~text
什么是当前目标
什么是要求
什么只是过去 discussion
什么只是 web page 中的文本
什么是 tool observation
谁有权改变哪个 decision
~~~

因此 Harness 的 context projection 需要保持 role / provenance 清楚。

这也是为什么把网页、memory、历史 prompt 原样混在一个大文本块里很危险。

## 10. 跨领域类比也会错误塑造 frame

### 研究支持

2025 Strategy Science 对战略 analogical reasoning 的人类 / LLM 比较发现：

- LLM 往往 recall 很强；
- 但会 over-apply analogy；
- reasoning-oriented LLM 在错误类比中甚至可能构造出内部很连贯、但 causal schema 不匹配的结构映射。

来源：

- *Can LLMs Aid Analogical Reasoning for Strategic Decisions?*: https://doi.org/10.1287/stsc.2025.0426

### 综合推论

所以 Brain 将来如果增强 cross-domain recall，需要特别防止：

~~~text
找到了结构看起来相似的 cognition
→ 模型为了使用它而强行重构当前 frame
~~~

更稳的是：

~~~text
先有当前 problem structure
→ 找 candidate analogy
→ 明确比较：
    哪些 relation 真正一致？
    哪些成立条件不同？
    analogy 如果错，会改变什么？
→ 再决定是否迁移
~~~

Retrieval 不应该反过来支配 frame。

## 11. 一个更准确的 Frame 形成模型

把以上 evidence 合起来，当前可以把 LLM + Harness 中的 problem representation 看成：

~~~text
                   User / Environment
                           ↓
                 New observations / request
                           ↓
                    Harness projection
                           ↓
              ┌────────────────────────┐
              │  Provisional Frame     │
              │                        │
              │ goal                   │
              │ situation              │
              │ owners                 │
              │ constraints            │
              │ hypotheses             │
              │ current state          │
              │ material unknowns      │
              │ action boundary        │
              └──────────┬─────────────┘
                         │
             predicts information need
                         ↓
       Brain / local / web / API / user / experiment
                         ↓
                   New evidence
                         ↓
                  Evidence relation
       support / weaken / conflict / supersede / limit
                         ↓
                 Selective frame update
                         ↓
              action / research / design
                         ↓
                     feedback
                         └──────────────↺
~~~

这里有两个非常关键的词：

### Provisional

frame 是当前最好解释，不自动升级成 reality。

### Selective update

不是有新文本就更新，也不是旧 frame 默认优先。

更新应由 evidence relation 决定。

## 12. Harness 应帮助什么，而不是直接决定 frame

根据目前 evidence，Harness 对 problem representation 的合理支持大致有五类。

### 12.1 保持 evidence provenance / cognitive role

让模型看得出：

~~~text
current user request
past user decision
assistant hypothesis
Brain cognition
web observation
runtime result
governing instruction
~~~

各是什么。

### 12.2 让 materially relevant history 可发现

避免：

~~~text
最新一句用户话
→ 因为 past cognition 没出现
→ 模型以为这是一个全新的 isolated request
~~~

### 12.3 让 contradiction / supersession 不被埋没

如果检索到：

~~~text
old decision
new correction
~~~

Harness / Brain 不应只分别返回两个“相关结果”。

应该至少让二者的 temporal / correction relation 有机会进入模型判断。

### 12.4 让真实 feedback 回到 working frame

Tool call 后不是只返回一段 output。

重要结果应该使模型知道：

~~~text
原 expectation 是什么
实际 observation 是什么
是否要求重新考虑 current frame / plan
~~~

### 12.5 给模型简单的 frame-update discipline

例如要求模型在 material new evidence 到来时判断：

~~~text
它影响哪个 current claim？
支持、削弱、冲突、替代还是只是补充？
如果接受它，goal / frame / action 会改变什么？
~~~

这比单纯要求“reflect on the new information”更具体。

## 13. 当前不建议立即建立一个显式 Frame Database

虽然上述分析说明 frame 很重要，但还不能直接推出：

~~~text
建立 Frame schema
每轮 serialize
存数据库
每次更新字段
~~~

原因有三个：

1. **frame 高度语义化。**
   过早结构化可能迫使模型把连续、模糊、未决关系错误离散化。

2. **额外 state 也可能变成新的 stale source。**
   如果 frame artifact 没被正确更新，它会比自然 conversation 更强地锚定后续模型。

3. **当前还不知道 minimal guidance + better recall 是否已经足够。**

所以更合理的验证顺序：

~~~text
minimal frame guidance
+ active evidence acquisition
+ cognition role / provenance
+ selective update guidance
↓
真实 replay

如果 frame 仍在长任务中明显漂移 / 丢失
↓
再测试 lightweight external frame checkpoint

如果 checkpoint 仍不足
↓
才考虑更强 structured state
~~~

这符合 Harness “只为真实 failure 增加外部结构”的原则。

## 14. 但长任务中可能需要 lightweight Frame Checkpoint

这仍然是一个值得实验的设计假设。

StateMem、Supersede、ContextEcho 等最新工作共同提示：

- 长会话中 current state 会漂移；
- compaction 不总能恢复行为；
- superseded cognition 容易重新出现；
- 短 anchor / state structure 有时能显著恢复模型。

因此可以测试一种非常轻的 **thread-scoped external checkpoint**：

~~~text
Current goal
Current frame
Confirmed decisions / constraints
Material open questions
Current active work
Recent material correction
~~~

它首先服务于当前 conversation / thread 的 working state，但如果 context compaction、新会话或其他项目会话需要继续这项 active work，就应把继续所需的 goal / frame summary / confirmed decisions / open questions / progress / blocker / remaining work 保存到对应的 `@project` active-work cognition。多个 active work 分开保存，不形成一个项目唯一 current frame。

它不是永久 canonical truth，也不要求每轮写。

触发条件可能是：

~~~text
长任务
context compaction
host restart
material user correction
major phase transition
发现 previous frame 明显错误
~~~

是否值得存在，必须通过 Luna 等真实模型 replay 决定。

来源：

- ContextEcho: https://accenture.github.io/ContextEcho/
- StateMemBench: https://arxiv.org/abs/2608.19652
- Supersede: https://arxiv.org/abs/2606.27472

## 15. 对 Brain retrieval 的直接启示

这一轮进一步明确：

### Query 不应该只来自 latest utterance

因为 latest utterance 可能正是 surface frame。

更合理：

~~~text
current provisional frame
+ material uncertainty
+ what past cognition could change it
↓
retrieval intent
~~~

### Ranking 不应只追求 similarity

未来 reranking / selection 可以特别重视 candidate 是否可能：

~~~text
support current frame
contradict current frame
supply missing goal / constraint
supersede stale cognition
explain historical cause
provide structurally relevant precedent
~~~

### Retrieval result 需要角色

至少模型应该能理解：

~~~text
这是 current cognition？
historical decision？
questioned cognition？
superseded cognition？
reusable method？
supporting evidence？
~~~

否则相关性越高，认知混淆可能越严重。

## 16. 对 Role / Interviewer 的直接启示

当 problem frame 很不稳定时：

~~~text
interviewer
sensemaker
investigator
~~~

仍然可能是有价值的方法包。

但它们的共同目标应该统一成：

> **提高 problem representation 的证据质量。**

例如 interviewer 不是为了“多问问题”，而是：

~~~text
找到只有用户拥有、且能区分 material interpretations 的 evidence
~~~

researcher 也不是为了“多查资料”，而是：

~~~text
取得能支持 / 反驳当前 frame 的 external evidence
~~~

memory investigator 是：

~~~text
恢复过去已经存在、能改变 current frame 的 cognition
~~~

这样角色自然统一到同一个 sensemaking loop。

## 17. 接下来最值得验证的 Eval

后续真实 Luna Eval 不应该只测最终答案。

Problem Representation 可以专门构造下面几类 replay：

### Early Wrong Turn

用户逐步提供信息，前几轮故意容易诱导一个错误 solution frame。

测：

- 模型是否过早 commitment；
- 后续 evidence 到来能否恢复。

### Historical Correction

Brain 中：

~~~text
old user preference
→ later correction
~~~

测：

- retrieval 是否找全；
- 模型是否使用 current cognition 而不是 stale cognition。

### Conflicting External Evidence

web / docs 返回互相冲突资料。

测：

- 模型是否识别 conflict；
- 是否判断 source / time / scope；
- 是否过早选一边。

### Assistant Self-Anchor

历史 assistant 曾提出错误 hypothesis。

用户随后只给一个间接 correction。

测：

- 模型是否把自己的旧话误当 confirmed context。

### Surface vs Deep Structure

用户用 solution wording 描述需求。

过去 cognition 中存在真实 underlying goal。

测：

- query 由 latest utterance 还是 information need 驱动时，谁更容易恢复正确 frame。

### Frame Recovery

长任务 compaction / restart 后，只提供不同级别：

~~~text
raw summary
vs
Brain recall
vs
lightweight frame checkpoint
~~~

测后续决策连续性。

## 18. 当前根结论

到这里，problem representation 可以更准确地理解成：

> **LLM 根据当前可见 evidence 临时构造的、会反过来决定注意、检索、解释和行动的 working model。**

它的主要风险不是单纯“忘记信息”，而是：

~~~text
surface framing
premature commitment
self-anchoring
stale-state reuse
epistemic-role confusion
conflict mis-handling
incorrect analogical transfer
feedback not integrated
~~~

因此一个好的 Harness 应帮助：

~~~text
让正确 evidence 可发现
让 evidence role / provenance 清楚
让 correction / supersession 不丢
让新 feedback 真正回到判断
让 frame 保持 provisional
让更新按 evidence relation 选择性发生
~~~

而不是替模型决定一个固定 frame。

这为下一步研究 metacognitive control 提供了更清楚的输入：

> 既然 frame 本身会错，而且模型不能可靠知道它什么时候错，那么 meta-control 应依赖哪些 observable signals 来决定“继续 / 查证 / 换 frame / 停止”？
