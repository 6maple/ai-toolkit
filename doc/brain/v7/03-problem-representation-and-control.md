# 03 · Problem Representation 与 Cognitive Control

本文综合 v7 关于 problem representation、证据角色、浅层判断和 metacognitive control 的当前理解。

详细研究过程见：

- [research/03-problem-representation-and-metacognitive-control.md](research/03-problem-representation-and-metacognitive-control.md)
- [research/07-problem-representation-in-model-harness.md](research/07-problem-representation-in-model-harness.md)
- [research/08-metacognitive-control-signals.md](research/08-metacognitive-control-signals.md)

本文是 **Current interpretation**，不是 Base 原始目标，也不是最终 Prompt。

## Confirmed input

Base 已确认：

- 模型不能把第一层合理解释自动当成现实；
- 应区分 owner-confirmed、direct observation、retrieved evidence、inference 和 hypothesis；
- “深度思考”意味着向 reality、source of truth、成立条件和因果结构深入，而不是单纯延长 reasoning；
- 设计不能假设模型能可靠判断自己是否已经知道得够多。

## Evidence / observation

当前研究与真实 case 反复显示：

- 用户 surface wording、历史 assistant 输出、已有 solution 和 retrieved cognition 都会塑造模型当前 frame；
- 模型容易在只有局部 evidence 时补出一段连贯解释，并把 plausibility 偷偷升级成 reality；
- 模型的 verbal confidence 与真实正确率并不稳定对应；
- 新 evidence 进入 context 不保证旧 frame 会正确更新；
- self-reflection 可以帮助，但不能替代新的独立 evidence；
- context、instruction framing、authority cue 和模型自己前面说过的话都会产生 anchoring。

一个典型 failure：

~~~text
只看到局部截图 / 局部代码
→ 形成一个很顺的解释
→ 用模型先验补齐缺失历史
→ 直接声称“项目原来就是这样 / 后来才这样”
→ 直到真正查 repo / design / Git 才发现判断错误
~~~

这类错误可以理解为 **证据越级**：

~~~text
evidence 直接支持 A
→ A 让 B 看起来合理
→ 模型未经验证把 B 当成事实
~~~

## Current interpretation

### 1. Frame 是 provisional working model

模型每一刻都会形成某种 current frame，即使没有显式字段。

它决定：

- 当前到底在解决什么；
- 什么被当成事实；
- 哪些东西看起来相关；
- 哪个 Skill / Tool 看起来应该使用；
- 模型认为自己是否已经知道得够多。

因此错误 frame 会系统性污染后续 retrieval、reasoning、planning 和 action。

v7 当前不把 frame 当成一个必须结构化持久化的固定 schema；它首先是一个必须能被 evidence 修正的 working model。

### 2. Plausibility 不能承担 reality

模型很擅长从不完整信息补出“最像会发生的故事”。

这个能力适合产生 hypothesis，不适合直接承担 factual truth。

重要关系是：

~~~text
当前 evidence
→ 能直接证明什么
→ 还需要模型补什么关系
→ 补出的部分先保持 inference / hypothesis
→ 能取得 source of truth 时取得
→ 再更新 frame
~~~

### 3. “信息已经足够”不能主要依赖主观自评

下面这种 control 不可靠：

~~~text
模型觉得自己懂了
→ 停止 recall / research
~~~

更稳的方向是把“足够性”尽量转换成当前 Skill / workflow 可以检查的 coverage：

- 当前必须恢复的方法、目标、决定和 continuation 是否已经在场；
- 决定结果的关键项目现实 / 外部事实是否已经从真正能说明它的 source 取得；
- 当前任务默认应覆盖而且漏掉会明显改变行动的材料是否已经检查；
- 关键前提和已知 conflict 是否处理；
- 应有的 runtime / test / experiment / external feedback 是否取得；
- 当前阶段的 gate / postcondition 是否满足。

Coverage 不限于 Brain cognition。Universal guidance 不需要定义所有任务具体要查哪些来源；这些要求应由 domain / specialist cognition 靠近实际 decision point 定义。

### 4. Alternative 不能只靠模型“偶然想到”

不能写成：

> 如果你发现还有其他解释，就继续查。

因为模型可能根本没有发现。

对 materially important 的关键关系，更合理的是主动检查：

~~~text
当前结论依赖什么关键事实 / 条件？
→ 现有 evidence 是否也允许会改变行动的另一解释？
→ 如果允许，什么 evidence 最能区分？
~~~

不要求形式化地每次列 N 个 alternative；重点是避免第一解释未经挑战就成为事实。

### 5. 新 evidence 比更多内省更重要

当前方向：

~~~text
provisional judgment
→ source / repo / runtime / test / independent docs / experiment
→ new signal
→ update affected frame
~~~

而不是：

~~~text
reason
→ “再认真反思”
→ reason
→ 把更多内部 reasoning 当作 verification
~~~

### 6. 复杂问题用有停止条件的逐层展开

当前模型另一个相关 failure 是：即使已经知道整体目标，也可能迅速钻入某个局部解释、机制或实现，并在上层关系还不稳定时继续补齐下层细节。复杂任务也很难一次同时把所有层级想清楚。

结合 Base 的高水平通用思考目标、coverage 取向、对主观 confidence 的限制，以及已有 mechanistic / black-box 研究，当前更稳的解释是：

~~~text
先明确当前整体目标、边界和决定结果的关系
→ 当前层足够时直接行动
→ 不足时覆盖会 materially 改变当前层的直接子问题
→ 需要时取得对应 cognition / reality evidence
→ 子问题形成判断后重新组合回上层检查
→ 仍有会改变结果的下层差异时继续展开
→ 否则停止
~~~

这不是要求固定层数或把所有内容拆到底。已有事实、有效约束或成熟能力能够承担，而且内部差异不会改变当前决定时，可以继续作为黑盒。相反，如果新增机制、职责、状态或分类没有上层真实需要与 evidence 支撑，就不应只因“可能以后需要”而提前固化。

因此“逐层”同时承担两种控制：在当前 material 范围内避免漏掉会改变上层结果的相邻关系；在剩余差异不会改变行动时停止，避免无限下钻。停止依据应尽量落到 material consequence 和 coverage，而不是模型主观觉得“已经想够了”。

## Current design derivation

后续设计应从 Model 的真实 failure 出发，优先帮助模型：

1. 在重要判断前恢复必要的 epistemic discipline；
2. 让重要的长期 cognition 不依赖模型先准确意识到“我应该读取”；
3. 由 domain Skill 明确当前工作通常要覆盖哪些 cognition、项目现实和外部 information；
4. 当判断依赖模型无法直接知道的事实时，让模型实际取得对应 source / runtime / test / experiment，而不是用先验补全；
5. 用 coverage、真实结果和 workflow gate 替代纯 subjective confidence；
6. 在新 evidence 到来后更新受影响的 current frame；
7. 让历史 assistant 分析、retrieved memory、search candidate 和旧方案保持正确 role，不因进入 context 就升级 authority。
8. 让复杂问题从当前整体关系向直接下一层逐步展开；每层由 cognition / reality evidence 支撑，处理后回到上层组合检查，并在继续下钻不再 materially 改变下一动作时停止。

## Open / to validate

- 对不同模型，哪种短 Prompt 最能稳定阻止 evidence leap；
- 是否需要显式要求模型在重要判断时区分 observation / inference，还是由 Skill 内 coverage 即可产生同样行为；
- counter-hypothesis / alternative check 在弱模型上的收益和 context 成本；
- frame checkpoint 是否只需要 active-work continuity，还是复杂长任务需要更显式结构；
- 哪些 verification signal 可以由 Harness 自动判断，哪些仍需模型语义解释；
- 当前逐层思考 guidance 对弱模型是否能减少“整体目标已知但仍过早钻入局部”和“为了完整无限细化”两类 failure，仍需用户实际使用验证。
