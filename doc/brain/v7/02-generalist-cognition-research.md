# 02 · 高水平通用认知研究

> **文档角色：Research evidence / synthesis。** 本文研究人类高水平通用认知中哪些机制值得作为 Agent 设计参考；其中“综合推论”和“设计假设”仍属于 v7 当前研究，不是 Base 根事实。
>
> 本文研究的对象不是某种固定人格，也不是“最聪明的人都使用同一套 checklist”。“顶尖通才”并不是认知科学中的单一正式构念，因此本文把多个相邻研究领域交叉起来：expertise、sensemaking、metacognition、adaptive expertise、cognitive flexibility、analogical reasoning、design framing、mechanistic reasoning、actively open-minded thinking、wise reasoning 和 forecasting。
>
> 下文明确区分：
>
> - **研究支持**：对应认知现象有直接研究；
> - **综合推论**：把多个研究方向组合成 Brain 可用的统一模型；
> - **设计假设**：以后仍需真实 LLM Replay / Eval 验证。

## 1. 最根本的能力不是“知道很多”，而是建立正确的问题表征

### 研究支持

Chi、Feltovich、Glaser 对物理专家与新手的经典研究发现：新手更容易按题目表面的对象和措辞分类，专家更容易按背后的物理原理组织问题。

这说明专业能力很大一部分不是“多背几条答案”，而是：

```text
看到表面输入
→ 识别真正决定结果的深层结构
→ 用这个结构组织后续推理与检索
```

Klein 的 Data-Frame Theory 又从真实工作中的 sensemaking 给出另一种表达：

```text
data / signals
↕
frame / explanatory structure
```

人不是先被动收完所有 data 再生成 frame。已有 frame 会决定下一步注意什么、找什么；新 data 又会强化、修改或推翻 frame。

### 综合推论

面对用户表达时，最重要的第一步不是“回答句子”，而是形成一个**当前问题表征**：

- 用户实际面对的现状是什么；
- 用户为什么现在提这件事；
- 用户真正希望哪个结果发生变化；
- 当前说法中的 solution、解释、事实、目标和假设分别是什么；
- 哪些关系已经有 evidence，哪些只是模型补出的解释。

例如：

```text
用户：我想做一个 app
```

只是 surface expression。可能的更深 frame 包括：

- 用户已经有一个明确业务流程，只缺软件实现；
- 用户遇到某个反复痛点，把“app”当成当前想到的 solution；
- 用户只是想探索一个创业方向；
- 用户其实想自动化某个行为，app 未必是最终形态。

强模型不应在 evidence 不足时任选一种升级成事实。

## 2. 问题表征不是一次完成，而是在 evidence 与 frame 之间持续重构

### 研究支持

Data-Frame Theory 把 sensemaking 描述成 data 与 frame 的双向适配：frame 解释 data，也引导继续搜索 data。

Dorst 与 Cross 对 creative design 的研究发现，真实设计并不是“先完全定义问题，再寻找答案”；problem space 与 solution space 经常 co-evolve。尝试 solution 会暴露原先没有看见的 constraint，反过来改变 problem frame。

### 综合推论

因此高水平理解不是：

```text
先把意图完全弄清楚
→ 再开始搜索、设计、实验
```

而是：

```text
当前 evidence
→ provisional frame
→ 根据 frame 判断还缺什么
→ 获取新 evidence / 尝试 solution
→ 更新 frame
→ 再判断
```

“provisional”很关键：当前最好的解释可以指导下一步，但不能因为它暂时最好，就静默变成 reality。

这直接解释了为什么 memory retrieval 应进入理解过程本身，而不是发生在“已经理解完成”之后。

## 3. 真正上层的能力是 metacognition：监控自己正在怎样理解

### 研究支持

Nelson & Narens 的经典 metacognition 框架把认知活动区分为两个相互作用层次：

- object level：正在执行具体认知任务；
- meta level：监控 object level，并据此控制下一步活动。

核心关系是 **monitoring + control**。

这不意味着人脑里真的存在一个独立模块，而是一个很有用的功能模型：高水平思考者不只思考问题，也持续评估自己的思考状态。

### 综合推论

对于通用 AI，meta-level 至少需要持续知道：

```text
我当前把问题理解成什么？
这个理解依赖哪些 evidence？
哪些是事实，哪些是 inference / hypothesis？
还有哪些合理解释没有被排除？
我过去经验的成立条件与当前环境一致吗？
哪个未知如果答案不同，会改变目标、方向或重要设计？
下一步继续内部推理够不够，还是应该获取新的 evidence？
```

这层能力比“进入某个专家角色”更上游。

角色、搜索、询问、实验、第一性拆解，都应该是 metacognitive control 选择出来的动作。

## 4. 专家强在“会压缩”，顶尖适应者更强在“知道什么时候解压”

### 研究支持

专家研究表明，熟悉领域中的高水平表现大量依赖长期形成的结构化知识和快速 pattern recognition。

Kahneman 与 Klein 在对直觉与专家判断的共同分析中达成一个重要边界：专业直觉的质量主要取决于：

1. 环境是否具有足够稳定、可学习的规律；
2. 当事人是否有充分机会通过有效反馈学习这些规律。

主观自信本身不能证明直觉可靠。

Adaptive expertise 研究进一步区分：

- routine expertise：熟悉问题上高效、稳定；
- adaptive expertise：遇到陌生任务、方法或目标变化时，仍能重新组织知识并较快恢复高水平表现。

Carbonell 等人的综述把 adaptive expertise 与 knowledge representation、analogical problem solving、learning orientation 等联系起来。

### 综合推论

“顶尖人才总是从第一性原理重新推导”并不准确。

更接近真实专家的是：

```text
熟悉、规律稳定、反馈充分
→ 使用压缩后的模式和方法快速行动

新颖、异常、冲突、高后果、旧模式解释力下降
→ 暂停自动套用
→ 展开原来的黑盒
→ 重新检查机制、假设、因果和边界
```

所以根能力不是永远慢思考，而是**能判断何时继续压缩、何时需要解压**。

这对 Brain 很重要：长期 cognition 的价值之一正是形成可靠压缩；风险之一则是历史 cognition 在成立条件已经变化时继续被机械套用。

## 5. 高水平思考不会过早爱上一个解释

### 研究支持

Actively Open-Minded Thinking（AOT）研究关注：

- 愿意考虑替代解释和不同观点；
- 对反驳自己信念的 evidence 保持敏感；
- 在 evidence 不够时避免过早 closure。

Stanovich 等人的研究也反复指出：传统认知能力高，并不自动消除 myside bias。

Superforecasting / Good Judgment Project 的研究则表明，预测表现较好的人往往更开放、愿意更新、做更多细粒度概率修正，并且能从团队/多观点中获益。

Wise reasoning 研究中也反复出现 intellectual humility、perspective taking、认识变化和不确定性等成分。

### 综合推论

一个强的通才应把当前理解维护成：

```text
confirmed
+ likely
+ plausible alternatives
+ unknown
```

而不是：

```text
第一印象
→ 一个故事
→ 后续所有信息都解释为支持这个故事
```

真正关键的下一步 evidence，往往不是“更多相关资料”，而是**最能区分当前几个 materially different explanations 的资料**。

这也给“什么值得搜索”提供了一个比语义相似度更根本的标准。

## 6. 下一步应该取得什么 evidence：看它能改变什么判断

### 研究支持与规范性参考

Sensemaking 研究表明 frame 会引导 data search。

Decision analysis 中的 Value of Information 提供了一个更规范性的视角：如果某个未知一旦被澄清，会显著减少决策损失或改变行动，那么获取它的价值更高。

这里不主张 Brain 必须实现正式 Bayesian VoI 计算，而是借用其核心判断关系。

### 综合推论

优秀思考者面对 information gap 时，不只是问：

> “还有什么不知道？”

而是：

```text
如果这个未知得到不同答案
→ 会不会改变 problem frame？
→ 会不会排除某个主要 hypothesis？
→ 会不会改变目标 / 设计 / 风险 / 行动？
→ 获取它的成本是多少？
→ 哪个来源最直接可靠？
```

因此 information need 可以按实际任务动态排序：

```text
最能改变当前判断的未知
→ 最直接可靠的 evidence source
→ 获取
→ 更新模型
```

可用 evidence source 可能包括：

- 当前用户消息和前文；
- Brain 中过去 cognition；
- 项目代码、文档、测试、日志、真实数据；
- 外部官方资料和成熟实践；
- 运行实验 / POC；
- 只有用户本人拥有的目标、价值、偏好和经历。

这些来源不是固定 authority 排名。要看当前 claim 属于谁、什么来源最能直接证明它。

## 7. “追根溯源”应该追到决定结果的机制，而不是无限向下

### 研究支持

Mechanistic reasoning 研究通常强调：

- 先明确要解释的现象；
- 识别参与的 entities；
- 识别它们的 activities / interactions；
- 沿时间和因果关系把 setup conditions 连到结果。

Haskel-Ittah 对 explanatory black boxes 的分析又指出：黑盒本身是所有 mechanistic explanation 的固有部分。好的解释不是消灭所有黑盒，而是知道当前哪些黑盒必须展开。

### 综合推论

“从最根本的地方理解”可以改写成一个有停止条件的过程：

```text
当前现象 / 目标
→ 为什么会这样？
→ 中间由什么实体、状态、活动、约束和反馈产生？
→ 哪个仍未展开的黑盒会改变当前解释或行动？
→ 继续展开它
→ 剩余黑盒已经不会 materially 改变当前决定
→ 停止
```

这避免两种错误：

- 只停留在表面相关性和经验口号；
- 为了“第一性原理”无限追问到底层物理学，反而丢掉当前任务。

## 8. 通才的跨领域能力来自“迁移关系结构”，不是堆 mental model 名称

### 研究支持

Gentner 的 Structure-Mapping Theory 强调，成熟 analogy 的核心是映射**关系结构**，而不是映射对象表面属性。好的 analogy 会保留高阶关系系统。

Spiro 的 Cognitive Flexibility Theory 针对复杂、ill-structured domains 提出：面对复杂情境，不能总是取出一个完整、固定、预编译 schema；需要从多个知识片段和表示中，根据当前 case 重新组装。

Adaptive expertise 综述也发现 analogical problem solving 与适应性相关。

### 综合推论

优秀通才的优势不应理解成：

```text
记住很多“mental model”
→ 每次挑一个套上去
```

更接近：

```text
先理解当前问题的结构
→ 从不同领域召回结构相似的案例 / 原理
→ 比较哪些因果和约束关系真正同构
→ 舍弃只在表面相似的部分
→ 为当前问题组装一个新的 working model
```

因此 Brain 将来如果做 graph / relation-aware recall，真正有价值的方向也不是“记忆看起来有关联”，而是帮助模型找出：

- 相同 causal structure；
- 相同 responsibility pattern；
- 相同 failure mechanism；
- 相同 trade-off；
- 相同 decision structure；
- 历史上成立/失败的条件。

## 9. Problem 与 Solution 会一起演化，因此角色不能按固定阶段锁死

### 研究支持

Design co-evolution 研究表明，solution exploration 会持续改变 problem understanding。

Adaptive expertise 又说明，陌生情况需要打破 routine strategy。

### 综合推论

固定流程：

```text
访谈阶段
→ 研究阶段
→ 设计阶段
→ 实现阶段
```

可以帮助组织工作，但不能成为认知锁。

例如已经进入 implementation，突然发现：

> “自动整理”到底是移动用户原文件，还是只创建索引？

这不是一个局部代码问题，而是上游 meaning 又出现了 material ambiguity。

顶尖思考者会让当前主认知方式退回：

```text
sensemaking
+ intent reconstruction
+ evidence acquisition
```

而不是因为“阶段已经到了实现”继续编码。

因此：

> **阶段是选择认知方式的重要 evidence，当前瓶颈才是更根本的 trigger。**

## 10. “角色”是方法包，不是人格

### 综合推论

人类专业实践中可以观察到 interviewer、researcher、diagnostician、designer、engineer、reviewer 等不同工作方式。LLM 又确实容易通过角色语言激活不同先验。

但从根模型看，角色更适合定义成一个**认知方法 bundle**：

```text
role
= attention target
+ questions it asks
+ evidence it values
+ reasoning method
+ responsibility boundary
+ stopping / switching condition
```

例如：

### Interviewer / communicator

- 目标：恢复用户真实经历、目标、价值和含义；
- 方法：开放、具体、低引导问题；reflection；从 concrete incident 向上理解；
- 边界：不把自己的解释升级成用户事实；
- 停止：user-owned context 已足够支持当前判断。

### Investigator / researcher

- 目标：取得当前判断缺失的外部或历史 evidence；
- 方法：从 information need 反推 source；
- 边界：搜索结果是 evidence，不自动是真相；
- 停止：新增 evidence 已不会 materially 改变当前判断。

### Diagnostician / sensemaker

- 目标：解释发生了什么以及为什么；
- 方法：维护多个 hypotheses；寻找 discriminating evidence；检查 anomaly；
- 停止：一个解释获得充分支持，其他 material alternatives 被排除或不再影响行动。

### Designer

- 目标：构造能承担目标和 guarantee 的 solution；
- 方法：problem-solution co-evolution、mechanistic reasoning、trade-off；
- 停止：重要 behavior / responsibility / failure semantics 已足够明确。

### Skeptic / verifier

- 目标：尝试证伪当前解释、方案和完成结论；
- 方法：反例、failure scenario、premortem、真实验证；
- 停止：剩余风险与当前 consequence 相称。

这些名称更适合作为认知方法 bundle 的可读标签，而不是 Brain 的独立 runtime state。实际任务可以同时组合其中不同方法；不要求始终存在一个唯一 primary role。至于这些方法以后怎样存储、分类和检索，属于后续 Brain cognition model / implementation 设计，不在这里提前决定。

## 11. 一个更接近“全能型高手”的统一循环

### 综合推论

把上述研究压缩后，可以得到一个目前最值得作为 Brain 根参考的认知闭环：

```text
Reality / user / environment
        ↓
获得当前 evidence
        ↓
形成 provisional problem representation / frame
        ↓
维护 hypotheses、known / inferred / unknown
        ↓
Metacognitive Monitoring
    - 当前模型解释力如何？
    - 经验适用吗？
    - 哪个未知最可能改变方向？
    - 当前是否过早收敛？
        ↓
Metacognitive Control
    - 直接使用成熟模式
    - 展开机制 / first-principles reasoning
    - 调用某个认知角色
    - recall past cognition
    - search external source
    - inspect project reality
    - ask user
    - experiment / simulate / verify
        ↓
取得高价值 evidence
        ↓
更新 frame / hypotheses / causal model
        ↓
形成判断、设计或行动
        ↓
真实反馈
        └──────────────→ 回到 monitoring
```

旁边还有一个跨时间成长的长期系统：

```text
past cases
+ reusable principles
+ decisions and their conditions
+ skills / methods
+ causal relations
+ failures and corrections
+ user / project continuity
```

它不是为了让每次思考读取全部历史，而是让当前 metacognitive controller 在需要时获得更好的压缩知识和 relevant evidence。

## 12. 用“我想做一个 app”走一遍根循环

用户：

> 我想做一个 app。

### 12.1 Frame 不是“开始 app 开发”

当前 evidence 只证明：

```text
用户产生了“做 app”这个想法
```

暂时未知：

- 什么 trigger 让用户产生它；
- 用户真正希望改变什么；
- 谁在什么情境下遇到问题；
- app 是目标还是候选 solution；
- 用户以前是否讨论过相关痛点。

### 12.2 Monitoring 发现当前瓶颈

```text
主要 uncertainty = user intent / problem context
当前如果直接设计 feature，方向风险很高
```

### 12.3 Control 选择认知方式

Primary：

```text
sensemaker / interviewer
```

Supporting：

```text
memory investigator
```

于是同时发生两类行为：

1. 根据已有会话形成暂时解释；
2. 思考“哪些过去 cognition 能帮助恢复这个产品想法的来源、长期痛点和既有取舍”，据此 recall。

如果过去 cognition 已经说明用户长期在解决某类资料复用问题，当前 frame 会明显收窄；如果没有，再向用户取得只有用户知道的具体经历。

可能问：

> 是什么事情让你最近开始觉得需要做这个 app？

用户：

> 我收藏很多文章和视频，但后来基本不会再看。

此时不立即升级成“需要 AI 收藏 app”。

维护 hypotheses：

```text
H1 找不到
H2 忘记自己收藏过
H3 保存时的上下文丢失
H4 没有未来回顾触发
H5 保存过于容易，产生囤积
...
```

下一步问题选择的依据是：哪个问题最能区分这些解释。

例如：

> 讲一个最近真实发生的例子：你收藏了什么，后来什么时候想再用，当时发生了什么？

后续具体经历说明“保存时知道为什么相关，真正需要时只剩模糊印象，最后重新 Google”。

当前 frame 更新：

```text
核心 failure 可能是：
保存对象仍然存在
但“当时为什么相关”以及未来任务与它之间的连接无法被恢复
```

再查当前 workaround、capture friction、现有工具，直到剩余未知不再 materially 改变 problem frame。

这时 role 才自然转向：

```text
problem framer / product strategist
+ researcher
```

形成 solution 以后，又转：

```text
designer / architect
```

但如果 implementation 中发现“主动恢复”到底意味着什么仍有语义歧义，就重新切回 sensemaking，而不是被阶段锁住。

这就是本文所谓 adaptive cognition。

## 13. 这套模型对 Brain 的真正启示

当前最重要的启示还不是“应该增加哪些工具”，而是：

1. **Brain 的最高价值不是存得多，而是在正确时机让过去 cognition 改善当前 problem representation。**
2. **主动 recall 的 query 应来自当前 information need，而不只是 latest utterance 的相似词。**
3. **retrieval 是 sensemaking loop 的一部分，不应等到“理解完成”后才发生。**
4. **长期 cognition 必须保存成立条件和认知角色，否则历史压缩会被错误套用。**
5. **当前理解需要允许 provisional / questioned / alternative，而不是强迫所有内容成为单一 truth。**
6. **memory、web、project、user、experiment 都是 evidence source；Brain 是其中负责跨时间 cognition 的一个 owner。**
7. **role selection 应由当前认知瓶颈驱动，stage 只能提供 context。**
8. **第一性拆解按 materiality 停止，避免无限递归。**
9. **真正的学习来自 feedback 后修改 cognition，而不只是把成功/失败记录下来。**
10. **任何具体 RAG、graph、ranking、prompt 或 memory schema 都应该证明它如何服务上述循环。**

---

## 参考研究

以下材料是本文主要 evidence。它们属于 v7 research；Base 只保留用户明确拥有的根目标、长期设计思想和认识论纪律，不因为这些研究结论成立就自动扩张。

1. Chi, M. T. H., Feltovich, P. J., & Glaser, R. (1981). *Categorization and representation of physics problems by experts and novices*. Cognitive Science, 5(2), 121–152. DOI: 10.1207/s15516709cog0502_2.
2. Klein, G., Moon, B., & Hoffman, R. R. Data-Frame Theory of Sensemaking. Gary Klein overview: https://www.gary-klein.com/data-frame
3. Nelson, T. O., & Narens, L. (1990). *Metamemory: A Theoretical Framework and New Findings*. Psychology of Learning and Motivation, 26, 125–173.
4. Kahneman, D., & Klein, G. (2009). *Conditions for intuitive expertise: a failure to disagree*. American Psychologist, 64(6), 515–526. PMID: 19739881, DOI: 10.1037/a0016755.
5. Carbonell, K. B., Stalmeijer, R. E., Könings, K. D., Segers, M., & van Merriënboer, J. J. G. (2014). *How experts deal with novel situations: A review of adaptive expertise*. Educational Research Review, 12, 14–29. DOI: 10.1016/j.edurev.2014.03.001.
6. Spiro, R. J. et al. (1988). *Cognitive Flexibility Theory: Advanced Knowledge Acquisition in Ill-Structured Domains*.
7. Gentner, D. (1983). *Structure-Mapping: A Theoretical Framework for Analogy*. Cognitive Science, 7, 155–170.
8. Dorst, K., & Cross, N. (2001). *Creativity in the design process: co-evolution of problem–solution*. Design Studies, 22(5), 425–437.
9. Stanovich, K. E. et al. Work on Actively Open-Minded Thinking; 2023 review: *Actively Open-Minded Thinking and Its Measurement*, Journal of Intelligence, 11(2), 27.
10. Grossmann, I. (2017). *Wisdom in Context*. Perspectives on Psychological Science, 12(2), 233–257. PMID: 28346113.
11. Porter, T. et al. (2022). *Predictors and consequences of intellectual humility*. Nature Reviews Psychology.
12. Russ, R. S., Scherr, R. E., Hammer, D., & Mikeska, J. (2008). *Recognizing mechanistic reasoning in student scientific inquiry*. Science Education, 92, 499–525. DOI: 10.1002/sce.20264.
13. Haskel-Ittah, M. (2023). *Explanatory black boxes and mechanistic reasoning*. Journal of Research in Science Teaching. DOI: 10.1002/tea.21817.
14. Mellers, B. et al. (2015). *The psychology of intelligence analysis: Drivers of prediction accuracy in world politics*. Journal of Experimental Psychology: Applied, 21(1), 1–14. DOI: 10.1037/xap0000040.
15. Mellers, B. et al. (2015). *Identifying and cultivating superforecasters as a method of improving probabilistic predictions*. Perspectives on Psychological Science, 10(3), 267–281.
