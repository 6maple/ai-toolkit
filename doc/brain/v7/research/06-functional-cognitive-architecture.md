# 08 · Model + Harness 的功能性认知架构

> 本文把“LLM 像一个高能力但不完整的认知子单元”进一步展开成工程可用的功能模型。
>
> 目标不是把人脑脑区一一复制到 Agent，而是回答：
>
> **一个能够长期、可靠、自主完成复杂任务的认知系统，需要哪些功能？其中哪些适合由 LLM 自己承担，哪些应该由 Harness 外部化，Brain 又真正负责哪一部分？**

## 1. 为什么用“认知功能”而不是“脑区仿生”

CoALA 很早就提出，可以把 Language Agent 理解成：

- memory；
- action space；
- decision-making loop；

共同组成的认知架构。

2026 年对 LLM Agent externalization 的综述又进一步指出，现代 Agent 能力越来越不是通过修改模型权重获得，而是把：

- state 外部化成 memory；
- procedural expertise 外部化成 skills；
- interaction structure 外部化成 protocols；
- 再由 Harness 协调运行。

这些工作说明“认知架构”作为工程抽象是有价值的。

但不应该推出：

~~~text
人脑有海马体
→ Agent 必须造一个 hippocampus module

人脑有 executive control
→ Agent 必须造一个 executive Agent
~~~

真正应该复用的是**功能关系**：

~~~text
什么信息需要跨时间保留？
什么信息只属于当前 working context？
谁决定下一步取得什么 evidence？
谁执行动作？
谁提供真实反馈？
什么规则可以确定性保证？
~~~

来源：

- Sumers et al. (TMLR 2024), *Cognitive Architectures for Language Agents*: https://arxiv.org/abs/2309.02427
- Zhou et al. (2026), *Externalization in LLM Agents*: https://arxiv.org/abs/2604.08224

## 2. 一个复杂 Agent 至少需要这些认知功能

下面不是组件清单，而是职责清单。

### 2.1 Goal / Problem Representation

需要回答：

~~~text
现在到底在解决什么？
用户真正希望什么改变？
当前有哪些约束和 owner？
什么只是 solution proposal？
~~~

**主要 semantic owner：LLM**

因为它依赖自然语言、上下文、历史、因果和用户含义的动态解释。

Harness 可以支持：

- 提供相关历史；
- 投影当前任务状态；
- 暴露 project / web / runtime evidence；
- 防止旧 context 淹没当前问题。

Brain 可以支持：

- 恢复过去用户目标、取舍、纠正和相关 cognition。

但 Harness 不应该直接用固定 classifier 替模型决定完整 problem frame。

## 3. Evidence Acquisition / Perception

任何智能系统都必须能取得超出内部参数的现实信息。

Evidence 可能来自：

~~~text
conversation
past cognition
local files / code
runtime
database
web
official docs
papers
remote API
browser / GUI
user
experiment
~~~

这里的职责分工是：

~~~text
LLM
    判断当前 information need 和 evidence 意义

Harness
    提供可发现、可调用、可恢复的访问通道

Environment / provider
    拥有真实外部数据
~~~

因此网络搜索和本地读取在认知层属于同一种功能：**取得外部 evidence**。

它们只是来源不同。

Brain 是这一功能中的一个特殊 source：它提供**过去形成的 cognition**。

## 4. Attention / Working Context

LLM 的 context window 提供临时 working space，但研究已经表明：

~~~text
context 可容纳很多
≠ context 能可靠使用很多
~~~

所以需要一个外部 working-context 管理职责：

~~~text
完整可恢复信息
→ 当前 problem frame
→ 选择高价值 context
→ inference
→ raw detail 可退出工作面但仍可恢复
~~~

**Harness 是主要 owner。**

LLM 可以通过 Tool 主动 deeper read；Harness 决定：

- 什么能够被取回；
- ToolResult 怎样 bounded；
- old result 是否清除；
- session 怎样恢复；
- compaction / context projection 怎样发生。

Brain 不应该保存所有 working context；它只保存未来仍值得恢复的 cognition。

## 5. Long-Term Cognition

LLM 权重不能在当前用户工作中实时、可靠地吸收所有长期 cognition。

所以需要外部长期状态：

~~~text
knowledge
decision
intention
preference
constraint
lesson
reusable method
correction
~~~

这里正是 Brain 最核心的 responsibility。

但要区分：

~~~text
保存
≠ 常驻
≠ 当前采纳
~~~

Brain 负责 future recoverability 和 discovery。

当前是否适用，仍由 LLM 根据当前 frame 和 evidence 判断。

## 6. Procedural Expertise / Skills

“怎么做某类事”的方法和“过去发生过什么”不是同一类 cognition。

Procedural expertise 可以外部化成：

- Skill；
- playbook；
- executable script；
- specialized Tool；
- reusable workflow；
- Brain 中的 reusable method cognition。

对 Brain 来说，重要的是能够跨 turn 恢复“遇到什么情况，应依据什么 evidence、按什么判断关系思考，什么时候停止或切换”这类方法 cognition。它最终是否对应某种 Skill 类型、独立结构或普通 Markdown，属于后续实现设计。

理想关系：

~~~text
LLM 判断当前 bottleneck / task structure
→ 发现适用方法
→ Harness 载入对应 Skill / cognition
→ LLM 根据当前 case 应用
~~~

如果一个 procedure 已经完全确定、稳定且可机械执行，则应进一步下沉到 code / tool，而不是继续要求模型每次解释。

所以 procedural cognition 有一个自然演化方向：

~~~text
还需要语义判断
→ Skill / method guidance

反复稳定且可程序化
→ Tool / code / invariant
~~~

## 7. Executive / Meta-Control

这是最容易过度设计的部分。

系统需要回答：

~~~text
继续想还是行动？
继续搜索还是停止？
查 Brain、项目、网络还是问用户？
当前方法还有效吗？
是否要换 role / strategy？
~~~

当前 evidence 表明 LLM 有这种能力，但并不稳定：

- uncertainty attribution 不可靠；
- 容易过早收敛；
- long-horizon control 会漂移；
- 会漏工具；
- 会忽略新反馈。

因此这里不适合两个极端。

### 极端一：全部依赖模型自觉

~~~text
“请仔细思考并在必要时搜索”
~~~

下限太低。

### 极端二：中央 Controller 全部替模型决定

~~~text
task classifier
→ fixed role
→ fixed source
→ fixed workflow
~~~

会损失开放语义适应性。

更合理的是**shared control**：

~~~text
LLM
    负责 semantic meta-judgment：
    当前 bottleneck、information need、strategy value

Harness
    提供：
    minimal stable cues
    capability discoverability
    budget / timeout
    durable state
    hard invariants
    feedback
    recovery
~~~

这也符合近年的 cognitive-architecture review：现代 Agent 已经分别实现了 memory、recovery、skill selection、resource scheduling 等机制，但真正困难的是这些机制之间的 coupling，尤其是 uncertainty 与 resource allocation、interruption、stopping 的连接。

来源：

- Fan & Lan (2026), *From Cognitive Architectures to Language Agents*: https://arxiv.org/abs/2607.23942

## 8. Intention / Plan Continuity

LLM 可以形成计划，但长程执行中：

- 新消息会打断；
- context 会变化；
- progress 会丢；
- plan 可能失效。

因此需要区分：

~~~text
Planning
    LLM 的动态 semantic work

Plan persistence
    Harness / external artifact

Current progress
    durable state / artifact / project reality

Replanning
    LLM 根据反馈重新判断
~~~

Brain 保存**当前 conversation 消失以后未来项目工作仍需要恢复**的 cognition，例如：

- active project goal；
- task progress；
- blocker；
- remaining work；
- continuation 所需的 working decision / constraint；
- project-level long-term intention；
- major decision；
- stable constraint；
- design rationale；
- reusable method。

当前会话里只对本轮有用的 scratch state、临时 reply plan 和原始 ToolResult 仍属于 conversation / thread / host state。

多个会话可以同时推进不同工作，所以 Brain 应按 active work 分别保存连续性 cognition，而不是维护一个共享的项目唯一 current state。

因此真正要区分的是“conversation-only transient state”与“project-continuity cognition”，而不是简单把 progress / remaining work 都归给 thread。

## 9. Action / Motor Interface

LLM 自己不能真正改变外部世界。

它需要 Harness 提供：

- shell；
- file edits；
- browser；
- GUI；
- API；
- database；
- messaging；
- deployment；
- custom tools。

这里的关键不是 Tool 数量，而是：

~~~text
模型能否正确发现能力
→ 能否形成正确输入
→ 能否理解结果
→ failure 能否反馈回来
~~~

所以 Tool 设计本身是认知架构的一部分。

## 10. Verification / Error Detection

人类专家会利用外部反馈纠错。

LLM 更需要这样做，因为内部 confidence 不可靠。

Verification 可以来自：

~~~text
tests
schema validators
runtime observation
independent source
formal checker
simulator
human correction
second-agent challenge
~~~

这里要特别区分：

~~~text
LLM self-reflection
    新 reasoning

external verification
    新 evidence
~~~

前者可能有价值，但不能替代后者。

Harness 应尽量让可以验证的 claim 获得真实 feedback。

## 11. Learning / Consolidation

一次任务结束后，系统是否会变得更好？

这里也需要职责分开：

~~~text
feedback / outcome
→ LLM 解释发生了什么
→ 形成 lesson / corrected cognition
→ Brain / Skill / code 保存到正确 owner
~~~

不是所有 trajectory 都应该进入 memory。

更有价值的是：

~~~text
什么条件
→ 使用了什么方法
→ 得到了什么真实结果
→ 哪个 cognition 应该被强化、修正或废弃
~~~

2026 的 memory survey 把 Agent memory 的演进描述为：

~~~text
Storage
→ Reflection
→ Experience
~~~

这与 Brain 的未来方向有明显对应：

- Storage：把历史保存下来；
- Reflection：把 trajectory 提炼成 cognition；
- Experience：形成可跨 case 复用的方法与条件。

来源：

- Luo et al. (ACL 2026), *From Storage to Experience: A Survey on the Evolution of LLM Agent Memory Mechanisms*: https://aclanthology.org/2026.findings-acl.2069/

## 12. Social / User Model

AI 还需要理解另一个特殊 external system：用户。

用户不是普通 database。

用户拥有：

- subjective goal；
- value；
- preference；
- lived experience；
- risk acceptance；
- authorization。

LLM 负责解释用户表达。

Brain 可以帮助恢复：

- 用户以前明确过什么；
- 哪些取舍已经稳定；
- 哪些纠正曾发生。

Harness 可以提供 conversation continuity。

但只有用户拥有的价值判断不能因为历史 memory 或模型 inference 被静默替代。

这里还需要把“用户拥有决定”与“AI 是否应继续自主工作”同时说清楚。稳定的协作边界不是让 AI 遇到不确定就停下来问用户，而是：

~~~text
用户拥有
    目标 / desired outcome
    价值与偏好
    risk acceptance
    material scope choice
    需要用户授权的动作

AI / solution owner 在已确认边界内拥有
    可访问事实的调查
    专业分析与方案形成
    ordinary implementation / reasoning detail
    verification 与问题定位
~~~

只有缺失内容属于 user-owned，而且不同答案会 materially 改变结果时，才需要用户补充或裁决。项目事实、代码状态、外部资料、专业设计判断等能够由 Harness / Model 取得或完成的内容，不因为模型当前不知道就自动变成 user question。

已有用户决定或授权继续有效，但只覆盖其实际对象和范围；后续出现 materially different 的目标、结果、风险或授权要求时，需要回到正确 decision owner。是否允许某个具体外部动作真正执行，则由 Host / Tool / Runtime 的 permission 与 invariant 继续机械约束，不能只靠模型记住这条协作原则。

### 12.1 Interaction control、表达与呈现约束不要混成一个 root

真实工作中“怎样和用户交互”至少包含三类不同责任。

#### 会改变任务推进的交互决定

例如：

~~~text
新的 Prompt 必须先展示完整文本给用户审核
→ 用户明确通过后才能进入代码实现
~~~

这里如果模型直到准备最终回复时才想起规则，已经太晚，因为它可能已经写了代码。因此“什么时候问用户 / 什么时候需要 approval / 什么授权仍有效”属于 Collaboration Root 或当前工作阶段的 interaction contract，需要在对应 action decision 之前可用。

#### 只影响用户如何理解结果的表达

项目讨论中用户多次要求用直白中文、减少不必要术语，并要求交接 Prompt 让没有前文的人也能直接理解。这里改变的主要是已经形成的内容怎样组织和表达：

~~~text
已有要表达的判断 / 结果
→ 选择用户当前语言
→ 用普通词说明实际关系
→ 保留必要技术细节
→ 结构清楚到读者无需补作者脑中的背景
~~~

这类规则通常不需要从本轮 reasoning 的第一步就完整常驻。只要在**第一次产生用户可见自然语言之前**可靠取得并应用即可。对长任务来说，这个 decision point 可能是中途 progress update，而不是 final answer。

因此它更适合建模为 **User-facing Expression Route / Output Contract**，不是第三个 cognition root。

#### 可以由 Host / renderer 直接保证的呈现协议

有些规则并不需要模型理解其语义，例如固定 UI wrapper、消息 channel、结构化 citation rendering、平台格式约束等。能由 Host / renderer 确定性完成时，不应再要求模型每轮记住。

从这里得到的分层是：

~~~text
Collaboration Root
    会改变“现在继续、问用户、等待 approval、还是执行”的语义关系

Interaction Policy
    什么时候需要向用户发消息 / progress / approval surface
    若依赖开放语义，由模型 guidance 判断；若属于 Host 固定协议，由 Host 保证

Expression Route
    在每次用户可见自然语言输出前，取得并应用语言、术语、结构、清晰度等表达 guidance

Renderer / UI Contract
    能机械保证的最终呈现格式由系统直接承担
~~~

这也说明“per-turn stable”不等于“全部正文每轮 resident”。Expression 的关键 guarantee 是：**在第一次用户可见输出 decision point 之前，相关 guidance 必须可靠可用。** 如果当前 Host 没有独立的 pre-output hook，实现上可以选择在 turn bootstrap 时提前加载；那是 delivery 方案，不改变它在能力模型中属于 Output Route 而不是 cognition root。

## 13. 一张责任图

当前可以得到下面这张功能责任图：

| 认知功能 | LLM 主要职责 | Harness 主要职责 | Brain 的职责 |
|---|---|---|---|
| Per-turn cognitive bootstrap | 结合当前 conversation 使用 Universal / Collaboration guidance，并按稳定 route 继续取得所需 cognition | 每个用户 turn 确定性触发，并在本轮重要语义判断前把最小 cognition anchor 放到最近上下文 | **保证 Universal Root、Collaboration Root 与 stable routing surface 在正确 decision point 可靠可用；不把当前 renderer 中所有附带内容都当成 bootstrap root** |
| Frame / problem representation | 从 surface input、conversation 与 evidence 构造可修正 working model | 提供当前高价值 context | 恢复能校准 frame 的长期 cognition；不替模型生成唯一 frame |
| Monitor / calibration | 检查 evidence basis、alternative、anomaly、material unknown、pattern validity | 暴露 source freshness、conflict、runtime result 等可观察信号 | 恢复过去 correction / challenge / applicability cognition |
| Control / cognitive action selection | 根据 bottleneck 选择继续、decompress、recall、search、inspect、ask、experiment、verify、act / stop | 暴露 local/web/API/user/experiment 能力、budget、feedback | 提供 past cognition source、discovery / exact read 与稳定 meta-guidance |
| Collaboration / decision boundary | 解释用户目标、委托和 material change；在已确认边界内主动调查与形成专业方案 | enforce permission / sandbox / action invariant；提供明确 action capability | 每轮恢复稳定的协作 guidance，并恢复仍有效的 project/global decision / intention；不替 runtime 执行权限检查 |
| User-facing interaction / expression | 判断何时需要用户可见交互，并把已形成内容写成用户容易理解的表达 | 可机械保证的消息协议、renderer、surface contract；必要时提供 pre-output hook | 提供跨会话稳定的 interaction / expression cognition 与读取 route；详细表达 guidance 不必成为 cognition root |
| Working context | 使用当前工作面推理 | projection、compaction、JIT retrieval | 不拥有 thread current state；提供需要重新靠近当前上下文的稳定 guidance / cognition |
| Long-term cognition | 判断当前是否适用 | persistence plumbing | 跨会话长期 cognition 的核心 owner |
| Procedural method | 判断当前方法是否适用并按 case 使用 | method/tool discovery plumbing | 保存可跨时间恢复的方法 cognition；其当前适用性仍由主模型结合上下文判断 |
| Plan / active work continuity | 动态规划 / replanning | 当前 thread / plan artifact 提供即时工作面 | 保存需要在压缩、新会话或其他项目会话中继续的 goal / progress / blocker / remaining work；按 active work 分开 |
| Action | 选择动作 | Tool / sandbox / connector | 一般不负责 |
| Verification | 解释验证结果 | test / verifier / observation | 保存长期 lesson |
| Learning | 从反馈形成新 cognition | persistence / routing | cognition maintenance |
| User model | 理解表达、保持多解释 | conversation continuity | 恢复长期 user cognition |

这张表不是最终 architecture。

它的价值是：

> **以后新增一个 Brain feature 时，先找到它到底服务哪一个认知功能，再检查 owner 是否真的应该是 Brain。**

## 14. 什么东西值得外部化到 Harness

可以形成一个目前相对稳定的判断方法。

### 更适合外部化

如果某种认知负担具有这些特点：

~~~text
需要跨时间存活
需要访问模型参数外的现实
需要确定性保证
需要可靠恢复
反复发生而模型经常漏
结果可以被真实 feedback 校验
需要权限 / isolation / lifecycle
~~~

优先考虑 Harness。

### 更适合留给 LLM

如果核心问题是：

~~~text
含义理解
开放世界解释
新的 problem framing
跨领域类比
professional judgment
复杂 trade-off
根据新 evidence 改变策略
~~~

优先让模型承担，Harness 提供 context 和能力。

### Brain 更窄的判断

如果问题进一步属于：

~~~text
跨时间 cognition
过去 knowledge / decision / intention / method
当前需要主动恢复
新 evidence 需要修订旧 cognition
~~~

才优先由 Brain 负责。

## 15. Brain 的一个更清楚定位

到这里，Brain 可以暂时定义为：

> **Harness 中负责每轮重新建立 cognition anchor / routing guidance，并负责跨会话长期 cognition continuity 的外部认知子系统。**

它不只是 database。

它至少围绕：

~~~text
Bootstrap
    每个用户 turn 在重要语义判断前稳定恢复最小 cognition anchor
    最小 guarantee 是 Universal Root + Collaboration Root + Stable Routing Surface
    当前 renderer 的 passive cues / role definitions / maintenance guidance 等不因一起输出就自动属于 bootstrap root

Universal Root
    让 Frame → Monitor → Control 的最小通用认知关系重新靠近当前上下文

Collaboration Root
    让用户-owned decision / AI-owned investigation / commitment scope / material change 的最小协作关系重新靠近当前上下文
    实际 permission / sandbox / protected-state invariant 继续由 Harness / Tool / Runtime 机械保证

Stable Routing Surface
    每轮保持能够继续进入 current project / active-work cognition、领域 / 专项 cognition 与主动 discovery 的简单入口
    route 本身降低“模型必须先想起某个方法，才知道要找它”的递归触发失败

Output Route
    保证在第一次用户可见自然语言输出前，interaction / expression guidance 已可靠可用
    详细表达方法不作为第三个 cognition root；Host 能机械完成的呈现协议直接由 Host / renderer 保证

Guide Recall
    恢复明确的读取 guidance；由主模型结合当前上下文继续读取领域方法、project cognition 与其他长期 cognition

Persist
    哪些跨会话 cognition 值得未来继续存在

Discover
    当前方法产生的 information need 怎样找到相关 cognition

Read
    怎样逐层恢复足够 detail

Apply
    cognition 以什么角色进入当前 reasoning

Revise
    correction / feedback 怎样更新 cognition / method
~~~

工作。

但：

~~~text
网络资料
本地文件
运行时现实
tool execution
permission
verification
~~~

属于 Harness 的其他认知接口。

Brain 可以帮助模型意识到“需要它们”，不应该把它们全部吸收到自己的产品边界。

### 15.1 Brain 内部逻辑也应区分 cognition plane 与 access plane

Brain 自身也不能把“cognition 的意义”与“当前怎样访问它”混成一个类型体系。

可以先用两个正交平面理解：

~~~text
Cognition plane
    这份长期 cognition 负责什么：
    root / collaboration / active-work continuity / reusable method /
    durable project-global cognition / output cognition / maintenance policy

Access plane
    当前模型怎样获得它：
    guaranteed resident / fixed route / progressive route /
    active discovery / passive cue / exact read
~~~

于是：

- `resident` 不是 cognition role，而是一种 delivery guarantee；
- `search candidate` 不是 memory type，而是 discovery 产生的导航结果；
- Project Core / Global Core 若继续存在，也只是 route surface 的一种实现；
- active-work body、method body、decision / knowledge body 可以共享存储基础设施，但各自的 continuation / applicability 语义不能因此消失；
- maintenance 更新 body 后，只在 applicability / discoverability 变化时同步 route / description / index。

从系统职责看，可以再抽成四个逻辑面：

~~~text
Anchor / Route Plane
    每轮 root guarantee + 稳定条件路由

Cognition Body Plane
    完整的长期 cognition owner

Discovery / Read Plane
    information-need-driven search、bounded candidate、exact read

Maintenance Plane
    persist / revise / challenge / supersede / route-index synchronization
~~~

这是逻辑 architecture，不要求最终变成四个模块或四套数据库。它的价值是防止 physical storage shape 重新主导 capability boundary。

## 16. 对后续研究最重要的转折

现在再研究“Problem Representation”，问题已经更清楚：

~~~text
Problem representation
不是 LLM 单独在脑内产生的一段文字

它是：
    LLM 当前 semantic interpretation
    + Harness 投影进来的 evidence
    + Brain 恢复的 past cognition
    + Tool / external-world feedback
    + user correction
不断共同更新出的 working model
~~~

所以未来真正需要优化的不是：

> “怎样写一句更聪明的 prompt 让模型理解用户？”

而是完整闭环：

~~~text
什么 evidence 应该被发现
→ 怎样进入当前 context
→ 模型怎样形成 provisional frame
→ 哪种 uncertainty 触发新的 evidence acquisition
→ Harness 怎样把对应 source 暴露出来
→ 新 evidence 怎样迫使 frame 更新
→ 哪些 cognition 需要跨未来保存
~~~

这才是 Brain / Harness 根设计真正应该继续研究的对象。
