# 10 · Metacognitive Control：用可观察信号决定下一认知动作

> 本文继续 [07-problem-representation-in-model-harness.md](07-problem-representation-in-model-harness.md)。
>
> 已知问题是：
>
> - LLM 的 current frame 会错；
> - confidence / self-reported uncertainty 不可靠；
> - self-reflection 不能替代新 evidence；
> - 多轮任务中模型会 premature commitment；
> - 新 evidence 到来后也可能不正确更新。
>
> 因此真正需要回答的是：
>
> **Model + Harness 凭什么决定“继续、查资料、问用户、验证、换 frame、停止还是行动”？**
>
> 当前结论是：优先依赖与任务现实直接相关的 **observable signals**，再让 LLM 做语义判断；不要把一个 verbal confidence score 当成中央控制变量。

## 1. Meta-control 本质上是“下一认知动作选择”

可以把当前 Agent 的候选动作抽象成：

~~~text
Continue
    继续当前 reasoning / implementation

Acquire
    从 Brain / local / web / API / environment 获取新 evidence

Clarify
    向 user / decision owner 获取 user-owned context

Verify
    用 test / runtime / independent source / verifier 检查 claim

Reframe
    修改当前 problem representation / hypothesis

Switch Method
    改用 interviewer / diagnostician / researcher / designer / reviewer 等方法

Act
    执行当前已经足够有依据的动作

Defer / Abstain
    当前无法安全继续，保留未决并说明原因
~~~

Meta-control 不是另一个业务 role。

它解决的是：

> **当前哪一个 cognition action 最可能解除真正阻碍正确行动的瓶颈？**

## 2. 为什么不能用“模型 confidence”直接控制

已有研究已经反复表明：

- answer accuracy 与 uncertainty attribution 可以脱钩；
- reasoning model 仍会 overconfidence；
- 模型看到自己的旧答案后 confidence 会无 evidence 上升；
- contradictory advice 又可能被过度加权；
- RAG 有 retrieval evidence 也不代表模型能正确判断 evidence 是否充分。

因此下面这种设计不可靠：

~~~text
confidence > 0.8
→ act

confidence < 0.8
→ search
~~~

verbal confidence 可以作为弱 signal，但不应成为主要 control state。

更可靠的方式是把 uncertainty 投影到**当前任务结构**：

~~~text
哪个 claim 没有足够 evidence？
哪个 interpretation 仍有 materially different alternative？
哪个 required choice 还没有 owner / value？
哪个 expectation 与真实 result 不一致？
哪个 state 可能已经被 supersede？
~~~

## 3. Structured Uncertainty 给出的重要启发

### 研究支持

ACL 2026 的 *Structured Uncertainty guided Clarification for LLM Agents* 把 ambiguity 从自由语言中的“我不确定”转换成：

- tool parameter；
- parameter domain；
- specification uncertainty；
- model uncertainty。

它使用 Expected Value of Perfect Information（EVPI）衡量每个澄清问题的价值，再结合 question cost，避免重复提问。

SAGE-Agent 在 ambiguous tool-calling tasks 上：

- coverage 提高 7–39%；
- clarification question 减少 1.5–2.7 倍；
- When2Call training accuracy 也显著提高。

来源：

- Suri et al. (ACL Findings 2026), *Structured Uncertainty guided Clarification for LLM Agents*: https://aclanthology.org/2026.findings-acl.2028/

### 应用边界

这项方法的 uncertainty 主要围绕 tool parameters，因此不能直接推出：

> “所有 open-ended problem framing 都应该 schema 化成 parameter domains。”

但它证明了一个更一般的原则：

> **当 uncertainty 能落到“哪个未决关系会改变下一动作”时，控制信号会比自由语言 confidence 更稳定。**

这与 Brain 当前的 `material uncertainty` 概念高度一致。

## 4. 第一类 observable signal：存在 materially different interpretations

当前 frame 如果仍存在两个解释：

~~~text
A
B
~~~

并且二者都会满足当前已知 evidence，但会改变：

- goal；
- behavior；
- responsibility；
- risk；
- architecture；
- irreversible action；

那么这是一个真实 control signal。

动作不是固定“问用户”。

先判断 evidence ownership：

~~~text
过去 cognition 能区分？
→ Brain

当前项目事实能区分？
→ local/project tool

外部现实能区分？
→ web / API / official source

真实行为能区分？
→ experiment / runtime

只有用户目标 / value / experience 能区分？
→ Clarify with user
~~~

所以 ambiguity signal 触发的是 **evidence routing**，不是直接触发提问。

## 5. 第二类 signal：Evidence Sufficiency 不足

一个 claim 即将被用于重要判断前，可以检查：

~~~text
当前 conclusion 需要哪些 evidence？
实际已经有什么？
是：
    Full support
    Partial support
    Irrelevant
    Missing
    Conflicting
？
~~~

2026 Evidence Sufficiency Benchmark 表明，模型在 no-context 时反而比较容易 abstain，而在 conflicting evidence 下经常会直接选一边；所测模型在冲突条件中的 over-answer rate 都超过 65%。

所以：

~~~text
context 里“有资料”
≠ evidence sufficient
~~~

Harness 可以帮助暴露：

- source count；
- timestamps；
- provider failures；
- missing fields；
- partial results；
- explicit contradiction；
- stale marker。

但“是否足以支持当前 claim”仍需要模型进行语义判断。

来源：

- *Do LLMs Know When Evidence is Insufficient?*: https://doi.org/10.32604/cmc.2026.086343

## 6. 第三类 signal：Evidence Conflict / Source Disagreement

当多个来源对同一个 claim 给出不同结论时：

~~~text
source A → X
source B → not X
~~~

最差的行为是：

~~~text
挑一条看起来顺眼的
→ 继续
~~~

ConfRAG 已经证明，即使当前强模型，在真实 web conflicting references 上也有明显 gap。

更合理的 control loop：

~~~text
确认是否真在判断同一个 claim
→ 比较 source / time / scope / directness
→ 判断是否可以解释成成立条件不同
→ 如果不能：
    保留 conflict
    继续取得 discriminating evidence
    或在 consequence 允许时给 conditional result
~~~

来源：

- Yuan et al. (ACL 2026), *Benchmarking LLM’s Capability in Reasoning over Conflicting Web References*: https://aclanthology.org/2026.acl-long.11/

## 7. 第四类 signal：Supersession / State Change

如果当前任务依赖某个 state，而 Harness / Brain 看到了：

~~~text
old state
→ later update
~~~

这本身就是一个强 control signal：

> current frame 需要重新检查。

例如：

~~~text
用户以前：必须每次手动确认
后来：这个项目内普通 mutation 可以自动执行
~~~

或者：

~~~text
Design A
→ 后来被 Design B supersede
~~~

需要更新的是相应 claim，而不是把整套旧 cognition 全部废弃。

Harness 能比较可靠地提供：

- timestamp / order；
- version；
- explicit supersession relation；
- current canonical state。

模型负责判断：

- 变更具体影响哪个 conclusion；
- 其他仍有效目标 / constraint 是否继续成立。

StateMem / Supersede 的研究表明，这类 current-state tracking 不能只靠普通 semantic relevance。

来源：

- https://arxiv.org/abs/2608.19652
- https://arxiv.org/abs/2606.27472

## 8. 第五类 signal：Prediction / Postcondition Mismatch

一个高价值 control signal 是：

~~~text
模型预期：
    action A → result R

实际 tool / runtime：
    action A → result Q
~~~

如果 Q 与 R materially different：

~~~text
Mismatch
→ 当前 causal model / implementation assumption 可能错
→ 暂停沿旧 frame 继续
→ 解释 mismatch
→ 必要时 reframe / inspect / verify
~~~

这是比“再反思一次”更强的 signal，因为它来自真实环境。

典型例子：

~~~text
模型认为修复了 UI
→ screenshot 仍错误

模型认为 config 已生效
→ runtime 仍显示旧行为

模型认为 API 返回空结果
→ provider 返回 permission denied
~~~

它们对应完全不同的下一步。

因此 ToolResult 的设计应该尽量让：

- expected postcondition；
- actual observation；
- failure class；

可辨别。

## 9. 第六类 signal：Capability / Environment Failure

AgentAbstain 的一个重要贡献是把 abstention 从单次问答提升成 sequential agent decision。

它的场景包括：

- ambiguity；
- conflicting constraints；
- impossible request；
- tool/environment failure；
- runtime 才发现不能安全继续。

在 17 个 frontier model、4 个 harness 中，最好 paired accuracy 只有 59.5%；而一般 task-solving 能力并不能预测 agent 是否知道何时停止。

来源：

- Liu et al. (2026), *AgentAbstain: Do LLM Agents Know When Not to Act?*: https://agentabstain.github.io/

这说明 Harness 需要把环境 failure 显式变成 control signal。

例如：

~~~text
permission denied
missing provider
tool unavailable
unsupported operation
irreversible action lacks authorization
target identity unresolved
~~~

模型不应把这些都理解成：

> “再试几次。”

有些 trigger 应该：

~~~text
retry
~~~

有些应该：

~~~text
alternate path
~~~

有些应该：

~~~text
defer / ask owner
~~~

有些应该：

~~~text
hard stop
~~~

其中完全确定的边界由 Harness 直接 enforce。

## 10. 第七类 signal：Authority / Ownership Gap

不是所有 uncertainty 都是“事实未知”。

有些是：

~~~text
事实都知道
但这个选择属于谁？
~~~

例如：

- 用户风险接受；
- 产品目标；
- privacy preference；
- destructive-action authorization；
- organizational policy exception。

如果不同选择 materially different，而且没有 delegation：

~~~text
owner gap
→ user / decision owner
~~~

这是 control signal，不是模型 confidence signal。

反过来：

~~~text
技术实现方式
项目当前结构
公开 API 行为
成熟算法
~~~

属于模型可调查 / 专业判断的内容，不因为“不确定”就问用户。

## 11. 第八类 signal：Long-Horizon Drift / Context Boundary

长任务中存在一些结构性 trigger：

~~~text
context compaction
host restart
long idle continuation
major phase transition
large tool-history accumulation
important correction after long trajectory
~~~

这些 trigger 不证明 frame 已错。

但它们提高了：

- stale cognition；
- dropped goal；
- persona / mode drift；
- missed correction；

发生的风险。

因此可以把它们作为**thread recovery check trigger**：

~~~text
从当前 conversation / thread / task artifact 恢复 current goal
恢复 material decision / constraint
恢复 active work
恢复 recent correction
→ 再继续
~~~

而不是每一轮都重复完整 planning。纯 conversation transient state 不需要进入 Brain；但这项 active work 如果需要在 compaction、新会话或其他项目会话中继续，就应把恢复所需的 goal / progress / blocker / remaining work 保存到对应 `@project` memory。

这类 trigger 更适合 Host / Harness 自动发现，Model 负责恢复后的 semantic integration；Brain 同时提供稳定思考 guidance，以及按 active work 保存的 project continuity cognition。

## 12. 第九类 signal：Repeated Failure / No Information Gain

Agent 可能陷入：

~~~text
search
→ 没有新 evidence
→ 改一下 query
→ 还是同样结果
→ 继续 search
~~~

或者：

~~~text
tool failure
→ 同样参数 retry
→ 同样 failure
→ retry
~~~

如果连续 cognition action：

- 没有改变 frame；
- 没有减少 material uncertainty；
- 没有新增 discriminating evidence；

那么 marginal information gain 已经很低。

这时 meta-control 应考虑：

~~~text
换 source
换 method
缩小问题
形成 conditional conclusion
明确 unknown
stop
~~~

Harness 可以提供：

- query/result fingerprints；
- repeated error class；
- search coverage；
- retry count / budget。

模型解释这些是否真的意味着“无新增信息”。

## 13. Stop Condition 应该是什么

当前最合理的 stop condition 不是：

~~~text
confidence 足够高
~~~

也不是：

~~~text
已经搜索 N 次
~~~

更接近：

~~~text
当前 goal / frame 足够清楚
+ 没有仍会 materially 改变下一动作的可调查 uncertainty
+ 重要 claim 已获得与 consequence 相称的 evidence / verification
+ 当前 action 在授权 / invariant 边界内
+ 继续 cognition 的预期增益已经不足以改变行动
→ Act / Answer
~~~

如果还存在 unknown，但它：

- 当前不可取得；
- 不影响下一动作；
- 或可以用 conditional behavior 安全处理；

也可以停止，并明确它的边界。

## 14. Meta-control 可以分成 Deterministic、Semantic、Hybrid 三层信号

这有助于避免“中央 AI controller”。

### Deterministic signals

Harness 可以直接知道：

~~~text
tool error
permission
schema invalid
required field missing
version changed
test failed
timeout
budget
compaction / restart
explicit supersession link
~~~

这些不需要 LLM 猜。

### Semantic signals

LLM 更擅长判断：

~~~text
两个 interpretation 是否 materially different
evidence 是否真的支持当前 claim
当前 analogy 是否 causal match
什么 unknown 最能改变 decision
当前 role / method 是否适合
~~~

这些不适合硬编码。

### Hybrid signals

Harness 提供结构，LLM解释：

~~~text
source disagreement
partial retrieval
stale timestamp
multiple candidate memories
runtime mismatch
repeated no-gain search
~~~

这是 Model + Harness shared control 最自然的区域。

## 15. 一个轻量 Meta-control Loop

现在可以把前面的 A–F loop进一步具体化：

~~~text
1. Frame
   当前 goal / situation / hypothesis / action boundary 是什么？

2. Check Signals
   是否存在：
       material alternative
       evidence insufficiency
       conflict
       supersession
       prediction mismatch
       capability failure
       ownership gap
       drift trigger
       repeated no-gain

3. Route
   没有 material signal
       → continue / act

   有 signal
       → 判断哪个 evidence / computation 最能解除它

4. Acquire / Verify / Clarify / Reframe

5. Integrate
   新 evidence 具体改变哪个 current claim？

6. Repeat only while expected gain can change action
~~~

这不是要求模型每轮输出一张 checklist。

它是 Base 中的功能关系，后续应测试怎样用最少 guidance + Harness signal 实现。

## 16. 对 Brain 的具体意义

Brain 最可能参与这些 signal：

~~~text
material historical cognition missing
old/new cognition conflict
explicit correction
supersession
questioned cognition
repeated retrieval no-gain
long-horizon recovery
~~~

Brain 不应自己决定完整 meta-control。

更合适的是提供 model-legible evidence：

~~~text
candidate cognition
+ role
+ temporal / supersession relation
+ applicability / challenge
~~~

让模型知道：

> “这里存在值得重新判断 current frame 的历史 evidence。”

## 17. 对 ask_search 的进一步启示

`brain_ask_search` 的 trigger 可以逐渐从：

~~~text
每轮固定 search
~~~

转向更根的语义：

~~~text
当前 frame 已经足以形成 retrieval direction
+ 过去 cognition 有合理机会：
    补全 current goal
    区分 material interpretations
    恢复重要 constraint / decision
    challenge current frame
    发现 supersession
    提供 reusable method
→ search
~~~

但这里还有一个工程现实：

> 对较弱模型，如果 trigger 太抽象，它可能错误判断“没有必要 search”。

所以最终 prompt 不能只追求认知理论漂亮。

需要 Luna real replay 比较：

~~~text
mandatory once-per-turn recall
vs
semantic trigger recall
vs
harness-preselected candidate
vs
hybrid
~~~

看哪个真正提高下限。

## 18. 对 Role 的进一步启示

Role selection 也可以由 signal 驱动：

~~~text
intent / meaning ambiguity
→ interviewer / sensemaker

causal contradiction / anomaly
→ diagnostician

external factual gap
→ researcher

solution trade-off
→ designer

claim not verified
→ reviewer / verifier

runtime mismatch
→ investigator / debugger
~~~

Role 不是 stage。

Role 是对当前 signal 最有价值的一套认知策略。

## 19. 后续 Eval 应测“正确控制动作”

除了最终 task success，未来 Luna Eval 可以记录：

~~~text
该继续时是否错误停下？
该查证时是否直接行动？
该问用户时是否自己猜？
本可查网络 / 项目时是否把问题丢给用户？
遇到 conflict 是否选边？
遇到 correction 是否 selective update？
遇到 tool failure 是否重复无效 retry？
验证已经充分后是否还无限 search？
~~~

这可以形成一个真正属于 Harness 的 metric：

> **Cognitive Routing Accuracy**

它不是判断模型答案本身对不对，而是：

> 在当前 cognition state 下，模型有没有选择正确的下一类动作。

这可能是后续 Brain / Harness Eval 中一个非常关键的中间指标。

## 20. 当前结论

Meta-control 最值得依赖的不是模型主观 confidence，而是：

~~~text
当前 frame
+ observable mismatch / gap / conflict
+ evidence ownership
+ action consequence
+ external feedback
~~~

Harness 的责任是：

~~~text
让这些 signal 可见
让确定性 signal 被机械捕获
让 evidence source 易于调用
让 state / correction / failure 可恢复
~~~

LLM 的责任是：

~~~text
判断这些 signal 对当前问题意味着什么
→ 选择最有价值的 cognition action
→ 用新 evidence 更新 frame
~~~

这就形成一个没有“中央小人”的 shared meta-control。

下一步因此应该转向更具体但仍上游的问题：

> **怎样把这些认知信号和 Brain 的长期 cognition 组织成最小、稳定、对 Luna 有效的 resident guidance + active recall 行为，而不把整个 Harness 写成一套死板 workflow？**
