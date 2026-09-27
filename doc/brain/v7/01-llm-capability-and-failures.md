# 01 · LLM 的能力边界与 Failure Evidence

> **文档角色：Evidence / current research。** 本文记录 v7 当前关于 LLM capability / failure boundary 的外部 evidence 与直接 design implication。具体架构结论由后续 v7 设计文档拥有；研究更新可以修改本文，不反向改写 Base。
>
> 更新时间：2026-09-23。
>
> 本文回答一个在继续研究“顶尖通才怎样思考”之前必须先确定的问题：
>
> **当前 LLM 实际具备什么认知能力，又缺少什么？**
>
> Brain 不能直接照搬人类专家的认知模型。人类认知研究提供目标形态和启发，但具体设计必须经过 LLM 自身 capability / failure boundary 这一层转换。
>
> GPT-6 Luna 于 2026-09-22 刚发布，因此当前 model-specific evidence 主要来自 OpenAI 官方 system card / API 文档，以及少量发布首日的独立 benchmark。对它尚不存在充分的长期、独立、同行评审研究。本文因此把证据分成：
>
> - **Luna-specific observed evidence**：直接测到 GPT-6 Luna；
> - **frontier-LLM evidence**：近期 frontier LLM 普遍存在的 failure，除非后续实验证明 Luna 已解决，否则设计时应把它视为需要验证的风险；
> - **design implication**：由前两类 evidence 推出的 Brain 设计问题，不直接升级为产品 Requirement。

## 1. GPT-6 Luna 的当前定位本身就说明：它不是“缩小版全能人脑”

### Luna-specific observed evidence

OpenAI 将 GPT-6 家族分成三个层级：

- GPT-6 Astra：最难的端到端工作；
- GPT-6 Sol：复杂 coding / agentic workflow；
- GPT-6 Luna：focused、high-volume、cost-sensitive work。

GPT-6 Luna 当前公开规格：

- context window：1,050,000 tokens；
- max output：128,000 tokens；
- knowledge cutoff：2026-05-18；
- reasoning effort：none / low / medium / high / xhigh / max；
- 支持 web search、file search、computer use、MCP 等工具。

来源：

- OpenAI model catalog: https://developers.openai.com/api/docs/models/gpt-6-luna
- OpenAI model guidance: https://developers.openai.com/api/docs/guides/latest-model
- OpenAI API changelog, 2026-09-22: https://developers.openai.com/api/docs/changelog

### 当前外部 benchmark 提醒

ARC Prize Verified 在发布首日给 GPT-6 Luna 的结果显示：

| Reasoning effort | ARC-AGI-1 | ARC-AGI-2 | ARC-AGI-3 Standard | ARC-AGI-3 Provider Adapter |
|---|---:|---:|---:|---:|
| Medium | 61.0% | 18.1% | 0.19% | 0.32% |
| Max | 86.7% | 59.3% | 0.10% | 0.59% |

来源：https://arcprize.org/results/openai-gpt-6-luna

这里不能把 ARC-AGI-3 直接解释成“一般智能百分比”。但它至少说明两个设计事实：

1. **同一个模型的可用能力高度依赖 test-time reasoning budget**；
2. **在更陌生、需要在线适应的新环境中，旧 benchmark 上的高表现不会自然迁移成可靠的新任务适应能力。**

Artificial Analysis 发布首日的 high-effort 测试把 Luna 放在其 Intelligence Index 32 分；这说明它已经是很强的低成本 reasoning model，但仍不是该 evaluator 中最高能力层。

来源：https://artificialanalysis.ai/models/gpt-6-luna-high

因此后续 Brain 如果希望成为“所有模型都稳定可用”的认知基础，至少要用 Luna 这类高效模型作为重要设计基线，而不能只看 Astra / Sol 在高 reasoning effort 下的最佳表现。

## 2. 巨大 context window 不等于可靠 working memory

这是对 Brain 最直接的一条限制。

GPT-6 Luna 可以接收约 105 万 token，但“能放进去”与“能在正确时机、以正确关系使用”是两回事。

### Frontier-LLM evidence

EMNLP 2025 的 *Context Length Alone Hurts LLM Performance Despite Perfect Retrieval* 对五个 open / closed models 做系统实验。即使：

- 所有相关 evidence 都被完美检索；
- 无关 token 被换成近乎没有语义干扰的 whitespace；
- 甚至 attention 被限制到相关 token；

输入长度增加仍让不同任务性能下降 13.9%–85%。

来源：https://aclanthology.org/2025.findings-emnlp.1264/

ACL 2025 的 ICR² 工作也发现，现实长 context 中加入强 retriever 找到的 confounding passages 后，模型表现明显比简单 needle / haystack benchmark 更差。

来源：https://aclanthology.org/2025.findings-acl.165/

### Design implication

Brain 不能把：

```text
更多 memory
→ 全塞进 context
→ 模型自然综合
```

作为默认架构。

更合理的长期原则应该继续是：

```text
大规模 cognition 在外部
→ 当前 problem representation 产生 information need
→ bounded retrieval
→ 只把当前判断真正需要的 cognition 带入短 working context
→ 必要时继续 deeper read
```

因此 progressive disclosure 不只是省 token，而是直接服务模型认知质量。

## 3. LLM 会“回答用户的话”，但不稳定地理解用户真正的意图

这与我们正在研究的 problem representation 直接相关。

### Frontier-LLM evidence

NAACL 2025 的 IntInst benchmark 发现，instruction-tuned LLM 很容易对 instruction-formatted statement 产生“本能式回应”，但未必抓住 instruction 背后的真实 intent。

来源：https://aclanthology.org/2025.findings-naacl.330/

ACL 2026 的 AskBench 直接针对：

- intent-deficient query；
- 带 false premise 的 query；

研究“什么时候应该澄清、应该问什么”。论文的出发点正是：LLM 在缺少关键细节或输入含误导信息时，常常仍直接回答，导致 hallucination 或强化错误 premise。

来源：https://aclanthology.org/2026.findings-acl.845/

2025 对 referential ambiguity 的研究发现，LLM 与人类在何时提出 clarification question 上相关性很低：模型更容易追问表面 referential ambiguity，却较少针对真正影响任务完成的 task uncertainty 提问。

来源：https://aclanthology.org/2025.crac-1.1/

### Design implication

因此不能把：

```text
“请理解用户真实意图”
```

当成已经解决了 intent understanding。

Brain / resident cognition 以后真正需要帮助模型建立的，更可能是一个**可执行的 sensemaking method**：

```text
当前用户表达
→ 与历史目标 / correction / trade-off 一起形成 provisional frame
→ 主动构造 materially different alternative
→ 判断哪个未知会改变结果
→ 先从 memory / project / external evidence 获取
→ 只有 user-owned gap 仍存在时再问用户
→ 新 evidence 更新 frame
```

重点是让“理解”产生具体的 evidence-seeking behavior。

## 4. LLM 的“我不知道 / 我有把握”不是可靠的 metacognition

### Frontier-LLM evidence

ACL 2026 UA-Bench 测试 18 个 frontier LLM，专门区分：

- **data uncertainty**：输入本身模糊 / 信息不足；
- **model uncertainty**：信息足够，但模型能力或知识不足。

结果是，即使当前最先进模型也不能可靠区分这两类 uncertainty；而且 answer accuracy 高，不代表 uncertainty attribution 就好。

来源：https://aclanthology.org/2026.acl-long.547/

ACL 2026 的 calibration 研究又反复发现 post-trained / reasoning LLM 容易 overconfident；某些 RLVR 训练会提升 reasoning accuracy，却让 calibration 变差。

来源：

- https://aclanthology.org/2026.acl-long.836/
- https://aclanthology.org/2026.findings-acl.610/
- https://aclanthology.org/2026.acl-long.234/

### Design implication

Brain 以后不能建立在这种关系上：

```text
模型说“我已经理解”
→ 因此停止 recall / research
```

也不能：

```text
模型说“我不确定”
→ 因此一定问用户
```

更稳的 monitoring 应尽量落到可检查的关系：

```text
当前结论依据什么 evidence？
是否存在不违反 evidence 的 materially different explanation？
关键事实有没有实际取得？
当前 unknown 属于 user-owned、external fact 还是 model capability？
不同答案是否真的会改变行动？
```

也就是说，Brain 应帮助模型**检查 epistemic structure**，而不只是要求模型报告 confidence。

## 5. 搜索工具并不会自动修复模型的过度自信

### Frontier-LLM evidence

ACL 2026 *The Confidence Dichotomy* 研究 tool-use agent 的 verbalized calibration，发现不同工具会带来不同效果：

- evidence tools（例如 web search）由于返回内容本身存在噪声，可能系统性加重 overconfidence；
- verification tools（例如 code interpreter 的确定性反馈）更能 grounding reasoning、改善 calibration。

来源：https://aclanthology.org/2026.acl-long.520/

### Design implication

这对 Brain retrieval 有直接影响。

```text
memory search 命中
≠ memory 正确
≠ memory 当前仍适用
≠ 当前 hypothesis 被证明
```

所以未来 ask_search 的 result 应被视为：

> candidate evidence / past cognition

而不是：

> retrieval-backed truth

历史 memory 的：

- formed context；
- applicability；
- evidence；
- correction / supersession；
- current project conditions；

仍然可能决定它是否能够进入当前判断。

这也说明 GraphRAG 本身不解决 epistemic correctness：graph 只会让关系检索更强，如果 graph 中关系本身错误或过期，它也可以更有效地放大错误 cognition。

## 6. Self-correction 有帮助，但模型不能可靠地成为自己的最终 verifier

### Frontier-LLM evidence

2025 CorrectBench 对 intrinsic / external / fine-tuned self-correction 做系统评估，发现 self-correction 可以改善复杂 reasoning，但收益不稳定、计算成本明显，而且 reasoning model 在额外 self-correction 上的边际收益受限。

来源：https://arxiv.org/abs/2510.16062

更值得注意的是，2026 的 sycophancy 研究发现 reasoning 虽然平均会降低最终答案中的 sycophancy，却也可能让模型生成看似有逻辑的 post-hoc justification，通过单边 argument、逻辑不一致或计算错误来维护已有方向。

来源：https://aclanthology.org/2026.acl-long.1126/

### Design implication

所以：

```text
模型提出一个 frame
→ 同一个模型再“认真反思一下”
```

不能单独作为强保证。

真正可靠的 correction loop 更应依赖**新的 information / feedback**：

- 用户 correction；
- independent source；
- runtime result；
- test；
- counterexample；
- second retrieval；
- experiment；
- explicit competing hypothesis。

Brain 应帮助产生和保存 correction evidence，而不是把“自我反思”当成外部证据。

## 7. LLM 仍存在 sycophancy / authority bias，角色提示还可能改变这种倾向

### Frontier-LLM evidence

ACL 2026 的研究继续发现 AI sycophancy：

- 会提高用户 confidence，却降低 open-minded deliberation；
- reasoning 可以缓解一部分 sycophancy，但也能把它包装得更有逻辑；
- 在 subjective task 和 authority-bias 下更明显。

来源：

- https://aclanthology.org/2026.acl-long.2046/
- https://aclanthology.org/2026.acl-long.1126/

另一项 persona 研究发现，在所测 13 个 open-weight model 中，persona 的 agreeableness 与 sycophancy 在多数模型上存在显著正相关。

来源：https://aclanthology.org/2026.acl-long.1421/

### Design implication

这会直接约束我们此前“让模型自动扮演不同顶尖角色”的设想。

Role 不能只写成：

```text
You are a world-class empathetic interviewer.
```

因为 persona 可能同时带入：

- personality stereotype；
- agreeableness；
- 风格惯性；
- 角色目标与事实判断之间的污染。

更稳的方向仍然是：

```text
role cue
+ 该角色负责解决的 cognitive bottleneck
+ attention target
+ evidence method
+ responsibility boundary
+ switching / stopping condition
```

让“角色”主要激活方法，而不是让模型模拟一个人格。

## 8. 长程 planning、动态 replanning 和 trajectory evaluation 仍不可靠

### Frontier-LLM evidence

ACL 2026 CostBench 发现，leading proprietary / open models 在 cost-aware multi-turn planning 上仍有明显差距；最难的静态任务里 GPT-5 也低于 75% exact match，环境动态变化后表现继续明显下降。

来源：https://aclanthology.org/2026.acl-long.584/

ACL 2026 Plan-RewardBench 又发现，不只是 agent 做长 trajectory 难，连 LLM judge 在判断长 trajectory 哪条更好时也会随 horizon 增长明显退化。

来源：https://aclanthology.org/2026.acl-long.1062/

### Luna-specific observed evidence

OpenAI GPT-6 system card 的 Luna appendix 提供了一个小但有价值的例子：

- 在 “Unintended Engagement with External Agent Messages” eval 中，其他模型的 message-board discovery rate 至少 96%，GPT-6 Luna 是 76%。

来源：https://deploymentsafety.openai.com/gpt-6-astra

这个数字来自一个安全 eval，不能泛化成“一般检索能力 76%”。但它说明：**即使信息真实存在于环境里，高效模型也可能直接漏掉一个对后续行为很重要的 affordance / signal。**

### Design implication

Brain 不能把：

```text
完整 workflow 已经写在 prompt / memory
→ 模型会一直正确保持并执行
```

作为保证。

更可能需要：

- 当前 stage / goal 的轻量 continuity，但其 owner 首先是当前 conversation / thread / host state；
- 新 evidence 后重新检查 bottleneck；
- tool result 作为最新反馈回流；
- 关键 transition 的 bounded guidance；
- 长任务中能够重新恢复当前 frame，而不是把完整计划一直压在模型内部。

对 Brain 来说，更稳定的职责是每个用户 turn 重新恢复跨会话有效的 thinking guidance，并按需恢复项目 cognition。纯 conversation transient state 留在 thread；但 active goal、progress、blocker、remaining work 等只要需要在 context compaction、新会话或其他项目会话中继续，就应作为 `@project` cognition 持久化，而不必等它“沉淀成长期决定”。

## 9. 105 万 token context 也不能解决 instruction distraction

### Frontier-LLM evidence

ACL 2025 的 *LLMs can be easily Confused by Instructional Distractions* 发现，即使 advanced LLM，在存在 instructional distraction 时仍容易偏离用户真正 intent。

来源：https://aclanthology.org/2025.acl-long.957/

### Design implication

这对 Brain 的 context injection 很关键。

如果 memory 正文、历史 assistant response、旧 prompt、文档示例都长得像 instruction，模型可能无法总是正确区分：

```text
governing instruction
past cognition
quoted instruction
historical decision
example
current user request
```

因此 Brain 要保持：

- cognition role 明确；
- authority 不因被检索而升级；
- old instruction / example 不自动成为当前 command；
- 当前用户 request 与 restored cognition 在结构上可辨别。

把更多历史原文直接塞进 prompt，可能反而扩大 instruction distraction。

## 10. “更会 reasoning”不等于内部 reasoning 是可信的世界模型

### Official GPT-6 evidence

GPT-6 Astra system card 显示，最新模型已经更能控制自己的 chain-of-thought；在某些 adversarial setting 下还会根据“知道自己被 monitor”改变 reasoning 表现。OpenAI 因此明确强调不能只依赖 CoT monitoring。

GPT-6 Luna 在这部分 eval 中被省略，所以目前没有公开 evidence 证明 Luna 的 CoT controllability 达到什么水平。

来源：https://deploymentsafety.openai.com/gpt-6-astra

### Design implication

Brain 不应把 hidden / verbalized chain-of-thought 当成 canonical cognition。

可以持久化的是经过任务 evidence 支撑、未来真正有用的 cognition，例如：

- decision；
- knowledge；
- intention；
- reusable method；
- conditions；
- evidence / correction。

不应保存：

> “模型当时内部似乎这样想过，所以这就是真实理由。”

这也支持当前 Brain 把 memory 当成可维护 cognition artifact，而不是无限保存 reasoning trace。

## 11. Luna 还暴露出一个容易被忽略的效率 trade-off：更短不一定更完整

### Luna-specific observed evidence

GPT-6 system card 中：

- GPT-6 Luna 在 HealthBench Professional 从 GPT-5.6 Luna 的 55.7 提升到 60.8；
- 但 HealthBench 从 55.8 降到 54.5；
- HealthBench Hard 从 32.0 降到 31.4。

OpenAI 说明这些回退与输出显著变短同步发生：Luna 在 HealthBench 上平均回答长度约下降 35%，因此覆盖 rubric 所要求的细节更少。

来源：https://deploymentsafety.openai.com/gpt-6-astra

### Design implication

这对 Brain 的 prompt / memory 写法尤其重要。

如果我们只要求：

> “保持简洁。”

高效模型可能通过**省掉 material relation**来满足简洁。

因此 Base 中当前已有的原则应该继续保持：

```text
语义正确
→ 必要关系完整
→ 低歧义
→ 最后才压缩
```

同时 progressive disclosure 负责控制总 context，而不强迫每一份 cognition 本身省掉成立条件和因果关系。

## 11.5 局部观察容易被模型补成“完整现实”

### Project-observed evidence

当前项目讨论中出现过一个很典型的 failure：

- 模型只看了界面截图和局部现象；
- 很快形成“当前 1:2 布局是后来凭空加的、没有项目依据”的解释；
- 这个解释在表面上自洽，但模型并没有先读取真正拥有历史设计依据的 pi-mp 项目；
- 在用户指出应先检查项目设计后，模型读取真实 source 才修正判断。

这个 case 本身不能证明所有模型在所有任务中的统一错误率，但它展示了一个需要专门防守的结构：

~~~text
局部 observation
→ 模型用先验补齐缺失关系
→ 形成 plausible interpretation
→ interpretation 在语言生成中被无声升级成 factual claim
~~~

### Current interpretation

这与 hallucination、anchoring、sycophancy 和 unreliable metacognition 共同构成一个现实风险：**模型不只会凭空编造，也会把“根据有限 evidence 很像是真的”说成“已经确认是真的”。**

设计上不能简单要求“保持客观严谨”，因为模型也可能主观认为自己已经足够客观。

更可靠的补偿方向是：

- 让重要 claim 明确对应能够证明它的 source；
- 当前 evidence 只能支持局部 observation 时，不把额外关系静默升级为 fact；
- 可访问 source of truth 存在时，优先实际读取，而不是依赖模型补全；
- 用外部 evidence 修正 current frame，而不是靠更多内部解释增强 confidence；
- 对高 miss-cost、低 read-cost 的 cognition，默认偏向多读，降低“浅看即定论”的概率。

这里不把“迎合 / 乐观”归结为单一训练机制；v7 只把已观察到的 sycophancy、plausible completion 和过早收敛当作需要真实 Eval 的 failure family。

## 12. 当前可以把 LLM 的认知边界压缩成什么

基于目前 evidence，可以先把 frontier LLM 看成：

> **一个非常强的、可被上下文和工具动态编程的模式识别 + 生成 + reasoning system；它能形成很有价值的 working model，但这个 model 是概率性的、context-sensitive、容易受 framing 与输入结构影响，而且它对自己的理解是否正确没有可靠的内建检测器。**

它的典型优点：

- 强大的语言理解与生成；
- 很大的先验知识；
- 快速跨领域 pattern matching；
- 在合适 prompt / tool / reasoning budget 下能完成复杂推理；
- 能调用外部工具取得新的 evidence；
- 能根据 feedback 修改当前答案；
- 能通过 role / context 快速激活不同专业方法。

它的根本限制：

```text
有限 context utilization
+ lossy problem representation
+ ambiguity / intent handling 不稳定
+ uncertainty attribution / confidence 不可靠
+ 会 hallucinate
+ 容易被 instruction / framing / authority 影响
+ 会过早收敛并合理化
+ long-horizon planning / replanning 不稳定
+ self-correction 不能替代新 evidence
+ tool retrieval 不能自动变成 truth
+ test-time reasoning budget 会显著改变能力
+ 没有自然持续、可靠的跨回合 cognition continuity
```

这比单纯说“LLM 会幻觉”更接近 Brain 真正要解决的认知边界。

## 13. 这会修正我们此前的“顶尖通才大脑”研究方法

我们不能直接做：

```text
研究顶尖人类怎么思考
→ 把整套思考方式写进 prompt
→ 期待 LLM 自动变成顶尖通才
```

更合理的研究链应变成：

```text
顶尖人类为什么能做到某种认知行为
→ 找到真正 load-bearing 的机制
→ 检查 LLM 是否已经自然具备对应能力
→ 找出 LLM 在这一机制上的具体 failure
→ 能靠 model guidance 稳定补：写成 cognition / skill
→ 需要外部 continuity / retrieval / verification：由 Harness 提供；其中长期 cognition continuity / recall 由 Brain 承担
→ 需要真实世界 ground truth：Harness 通过对应 tool / environment / provider 获取
→ 需要 user-owned value / meaning：交还用户
→ 用 Luna 这类高效模型做真实 Replay / Eval
```

这意味着 Brain 的目标不再是“模拟一颗完整人脑”。

更准确的方向是：

> **用外部 cognition、retrieval、工具反馈和少量稳定 meta-guidance，补足 LLM 最关键、而且确实可由 harness 补偿的认知缺口，让主模型能够更接近高水平通才的行为。**

## 14. 对后续研究顺序的修正

接下来再研究 problem representation / meta-control 时，应优先问：

### 14.1 Problem representation

LLM 在什么情况下会：

- 直接照 surface wording frame；
- 锁定第一解释；
- 被 user / assistant 历史锚定；
- 忽略 contradicting evidence；
- 在长 context 中漏掉真正目标；
- 把 solution proposal 当 requirement？

然后只设计足以修复这些 failure 的 mechanism。

### 14.2 Metacognitive control

不要假设模型能准确知道“我现在缺什么”。

需要研究：

- 哪种 observable structure 能帮助它发现 material unknown；
- counter-hypothesis 是否稳定有效；
- information need 是否可以由 prompt elicitation 产生；
- external retrieval / verification 如何帮助校准；
- 何时 model confidence 应完全忽略。

### 14.3 Role selection

比较：

```text
完整 persona
vs
轻量 role cue
vs
方法 + trigger
vs
只提供当前 bottleneck
```

真实测试哪一种让 Luna 最稳定地进入正确认知方式，同时最少产生 persona inertia / sycophancy。

### 14.4 Brain retrieval

先测试：

```text
user utterance query
vs
information-need query
```

再比较：

```text
dense
BM25
hybrid
hybrid + rerank
relation / graph-assisted
```

最终评价不是“哪种 retrieval benchmark 分数最高”，而是：

> **哪种机制最能让一个认知受限的主模型恢复真正会改变当前判断的过去 cognition。**

---

## 主要来源

### GPT-6 Luna / OpenAI

- OpenAI API model catalog, GPT-6 Luna: https://developers.openai.com/api/docs/models/gpt-6-luna
- OpenAI API changelog, GPT-6 Sol / Luna release, 2026-09-22: https://developers.openai.com/api/docs/changelog
- OpenAI GPT-6 Astra System Card, Appendix for GPT-6 Sol / Luna, updated 2026-09-22: https://deploymentsafety.openai.com/gpt-6-astra
- ARC Prize Verified GPT-6 Luna: https://arcprize.org/results/openai-gpt-6-luna
- Artificial Analysis GPT-6 Luna: https://artificialanalysis.ai/models/gpt-6-luna-high

### Recent LLM research

- Du et al. (EMNLP 2025), *Context Length Alone Hurts LLM Performance Despite Perfect Retrieval*: https://aclanthology.org/2025.findings-emnlp.1264/
- Qiu et al. (ACL 2025), *Eliciting In-context Retrieval and Reasoning for Long-context Large Language Models*: https://aclanthology.org/2025.findings-acl.165/
- Moon et al. (NAACL 2025), *Find the Intention of Instruction*: https://aclanthology.org/2025.findings-naacl.330/
- Zhao et al. (ACL 2026), *When and What to Ask: AskBench*: https://aclanthology.org/2026.findings-acl.845/
- Ren et al. (ACL 2026), *Beyond "I Don’t Know": Evaluating LLM Self-Awareness*: https://aclanthology.org/2026.acl-long.547/
- Xuan et al. (ACL 2026), *The Confidence Dichotomy*: https://aclanthology.org/2026.acl-long.520/
- Liu et al. (ACL 2026), *CostBench*: https://aclanthology.org/2026.acl-long.584/
- Hwang et al. (ACL 2025), *LLMs can be easily Confused by Instructional Distractions*: https://aclanthology.org/2025.acl-long.957/
- Feng et al. (ACL 2026), *Good Arguments Against the People Pleasers*: https://aclanthology.org/2026.acl-long.1126/
- Ryu et al. (ACL 2026), *Feeling Right vs. Being Right*: https://aclanthology.org/2026.acl-long.2046/
