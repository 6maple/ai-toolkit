# Former Base 01 · Brain 的问题本源与目标（迁移工作稿）

> 本文件保留迁移前 Base 01 的完整工作稿。它包含原始背景，也混入了后续 per-turn restore、scope 和架构推导；用于追溯，不拥有当前 Base 或 v7 Architecture truth。

## 1. 最初问题不是“怎样做一个记忆系统”

Brain 最初从一个带约束的目标出发。archive 中最早的表述是：

~~~text
约束：做对、做准
    准确抓住并持续遵循用户真正的目标、取舍和已确认约束

目标：自主、省事
    AI 主动承担自己能够完成的调查、判断和执行，
    减少用户提供背景、回答问题和反复纠偏
~~~

这两个方向必须同时成立。

只追求自主，会得到“很主动地做错事”的 AI；只追求谨慎，会得到把调查、分析、选择和记忆负担重新丢给用户的 AI。

因此用户交互本身有成本。真正应该询问用户的，是只有用户拥有、而且不同答案会实质改变结果的信息；可由会话、Brain、项目、外部资料、运行结果和实验取得的 evidence，应由 AI 主动取得。

历史来源：

- [../archive/01-problem-and-context.md](../../archive/01-problem-and-context.md)
- [../archive/02-design-rationale.md](../../archive/02-design-rationale.md)
- [../archive/06-discussion-log.md](../../archive/06-discussion-log.md)

## 2. Brain 的直接背景：模型“知道规则”不等于规则一直在实际控制它

Brain 出现时面对的关键问题，不只是模型会忘记事实。

更根的是：

> **一个正确的 system prompt、项目 instruction、skill 或长期规则，即使仍然存在于上下文里，也不保证它在后续每一轮都继续以足够权重影响模型。**

Archive 已经记录了几类实际 failure：

- **Lost in the Middle**：长上下文里，中间位置的信息更容易被弱化；
- **context rot / attention dilution**：随着对话增长，较早的约束仍“存在”，但实际影响会下降；
- **最新消息刺激**：模型容易优先响应最近输入，跳过原本应该继续执行的思考纪律；
- **压缩 / 裁剪**：宿主可能压缩、裁剪或重组早期上下文；
- **skill / instruction trigger failure**：一份方法存在，不代表模型会在正确时机主动重新读取和执行；
- **self-anchoring / premature convergence**：一旦模型当前形成了一个方向，早期的纠偏原则可能不足以让它主动退回去重审。

所以真正的问题不是：

~~~text
规则有没有被写进 prompt？
~~~

而是：

~~~text
当前这一轮开始理解和行动时，
正确的思考 guidance 是否重新进入了模型最容易实际使用的位置？
~~~

这解释了为什么仅靠长期 system prompt、项目 instruction、AGENTS.md / CLAUDE.md 类文件或普通 memory 都不足以承担 Brain 的核心目标。

这些机制仍然有价值，但它们主要解决“规则存在在哪里”；Brain 还要解决：

> **规则在每一轮需要做判断时，能不能重新变得足够近、足够显著、足够可执行。**

## 3. 每轮召回到最近上下文，是 Brain 的核心机制，不只是实现细节

Archive 中“收到每条新的用户消息后必调一次”的设计，真正价值不是“每轮顺便刷新 memory”。

它是在 Harness 层建立一个确定性控制点：

~~~text
新的用户消息到达
→ Harness 必定触发 Brain
→ Brain 把 Global / Project Core 与有界的 cognition cues 重新送到最近上下文
→ Core 中的稳定读取 / 使用引导再次变得显著
→ 主模型依据这些引导和当前 conversation 判断哪些具体 cognition 需要继续读取
→ 模型再开始本轮的理解、调查、判断和行动
~~~

这里必须明确区分两种责任：

- **代码能够确定性保证的**：每个 user turn 触发 restore；恢复适用 Scope Core；提供有界 cognition cues；把这些内容重新放到最近上下文。
- **仍由主模型承担的语义判断**：当前请求属于什么问题、哪些读取条件成立、应该继续 `brain_cat` 哪些具体方法 / cognition，以及取得新 evidence 后怎样应用和更新它们。

当前 `brain_think` 本身不读取 latest user message 做“这是软件设计 / 测试 / 诊断”的任务分类。被动 L0 cognition descriptions 也不是按本轮语义相关性排序。因此 Brain 的稳定性来源不是代码替模型完成任务理解，而是**代码每轮重新恢复一组足以指导模型正确读取和判断的 cognition 入口与规则**。

这解决的是一个模型自身很难稳定解决的递归问题：

~~~text
模型需要先想起正确方法
→ 才知道自己应该重新读取哪些方法 / memory

但模型正因为 attention 漂移
→ 可能根本想不起应该重新读取
~~~

所以“是否先恢复思考方式”不能完全交给裸模型自己的 reasoning 决定。

Brain 的关键 guarantee 是：

> **每个新的用户回合，都重新给模型一次恢复正确认知方式的机会。**

这里“最近上下文”很重要。

同一份 guidance：

~~~text
只存在于很早的 system / project instruction
~~~

和：

~~~text
刚刚由 Brain 在当前 turn 重新恢复到最近上下文
~~~

对长对话中的实际行为影响并不等价。

Brain 正是利用每轮触发，把长期稳定 cognition 重新投影到当前 decision point 附近，对抗 attention drift、长窗口稀释和压缩。

## 4. Brain 每轮最应该稳定召回的是“怎样思考”，不是“当前做到哪里”

因此 Brain 的第一召回目标不是普通事实，也不是当前任务状态，而是**跨会话仍然成立的思考方式**。

例如：

~~~text
用户表达是 evidence，不直接等于现实
→ 恢复真正目标、背景和问题

重要判断先看 evidence 能证明什么
→ 区分 fact / interpretation / inference / decision / unknown

存在会改变行动的重要未知
→ 主动取得最合适的 evidence

项目、网络、runtime 等 AI 可以调查
→ AI 先调查

只有 user-owned goal / value / experience / authorization
→ 才请求用户补充

新 evidence 与当前解释冲突
→ 更新 frame，不保护自己的旧答案

已有依据足够
→ 停止无价值搜索并行动
~~~

这些 cognition 的共同特点是：

- 对很多不同任务都成立；
- 多个并发会话可以同时安全使用；
- 不依赖某个会话当前做到哪一步；
- 直接影响模型怎样理解、检索、判断和行动；
- 如果模型靠自己临场重新发现，执行稳定性会显著下降。

在此基础上，需要让模型能够继续读取更具体的专业方法，例如：

~~~text
意图理解 / sensemaking
research
diagnosis / debugging
software design
testing / verification
prompt / rule writing
decision analysis
~~~

这些方法主要回答：

> **遇到这种问题，应按什么关系去理解、调查、判断和验证？**

但“当前究竟是哪一种问题”本身仍是语义判断，不能假定 Brain 的固定程序代码能够直接知道。

因此更符合现实的认知路径是：

~~~text
每轮确定性 Brain restore
→ 重新恢复稳定 Core / cognition cues
→ Core 给出明确、宽松、可执行的读取条件和下一步入口
→ 主模型结合 latest user message + conversation 判断哪些条件成立
→ 读取对应方法 / 项目 cognition
→ 方法产生新的 information need
→ 再按需取得更多 cognition / external evidence
~~~

Brain 提高下限的关键，是让“怎样判断是否需要继续读、去哪里读”的 guidance 每轮重新靠近模型，而不是在代码里造一个隐藏的任务分类器。

而不是：

~~~text
用户消息
→ 相似 memory 搜索
→ 塞给模型
→ 让模型自己决定怎么想
~~~

后一种更接近普通 memory / RAG。

## 5. 多会话并发与跨会话续作：按“工作需要在哪里继续”保存，而不是按 session 保存

实际使用中，同一个用户、同一个项目可以同时存在多个独立会话。

例如：

~~~text
会话 A：研究新的检索设计
会话 B：排查一个构建问题
会话 C：讨论产品需求
~~~

这说明 Brain 不能假设项目只有一个全局唯一的：

~~~text
current goal
current frame
current bottleneck
current progress
next step
~~~

但这**不表示任务进度不应该进入 Brain**。

另一个同样真实的需求是：

~~~text
用户新建会话
或
当前会话经过 context compaction / 大幅裁剪
↓
仍然希望方便地继续此前未完成的项目工作
~~~

因此真正的 scope 判断不是：

~~~text
“这是 session 里产生的，所以属于 session”
~~~

而是：

> **这份 cognition 在当前 conversation 消失以后，未来的项目工作是否仍然需要它？**

如果答案是需要，它就属于 project continuity，应保存到 Brain 的 project memory。

### 5.1 只服务当前 conversation 的瞬时状态

例如：

- 临时 reply planning；
- 尚未形成认识的 scratch reasoning；
- 一次 ToolResult 的原始输出；
- 几分钟后就失去意义、且未来无需恢复的局部步骤。

这些由当前 conversation / thread / Host context 承担，不因为“发生过”就进入 Brain。

### 5.2 需要跨 context / 跨会话继续的 active project work

例如：

- 当前项目仍未完成的目标；
- 已经做到哪里；
- 已完成的重要步骤；
- 当前 blocker；
- remaining work；
- 为继续任务必须知道的当前判断、约束和下一工作边界；
- 当前工作依赖的已确认 decision / design rationale。

这些即使形成于某一个会话，只要：

~~~text
新会话需要接手
或
当前会话压缩后仍需要恢复
~~~

就应该保存为 `@project` cognition。

这也是 Brain v6 已冻结并实现的 continuity 原则：**cognition 根据未来需要在哪个 scope 继续使用来归属，而不是根据产生它的 session 归属。**

### 5.3 多会话并发不需要一个“Project Current State”

并发会话的正确处理不是把所有工作压成一个共享 current state，而是允许项目同时存在多个 active work / intention cognition：

~~~text
@project/memories/intention/work-a.md
    检索设计的目标 / progress / blocker / remaining work

@project/memories/intention/work-b.md
    构建问题的调查进展 / 已确认原因 / remaining work

@project/memories/intention/work-c.md
    产品需求讨论中仍需继续的项目工作
~~~

它们由“正在推进的工作本身”区分，不由 session id 区分。

`@project/core.md` 只需要保留重要 active work 的短 route / trigger，让新的或被压缩后的会话能够发现正确 memory；完整 task state 继续留在对应 project memory 中。

因此：

~~~text
当前 conversation 的临时工作面
    → thread / Host context

需要跨 conversation 继续的 active project work
    → Brain @project memory

项目长期 decision / constraint / knowledge / method
    → Brain @project memory

跨项目稳定思考方法和长期 cognition
    → Brain @global memory
~~~

例如：

~~~text
“我刚刚临时打开了第 3 个日志窗口”
    → conversation transient state

“parser 修复已经完成原因定位和方案设计，尚未实现；继续时先读 X/Y，blocker 是 Z”
    → active project work，应进入 Brain

“parser 对 malformed input 必须 fail closed”
    → project decision，应进入 Brain
~~~

这也解释了为什么历史 session core / session archival 可以删除，而跨会话续作能力不能删除：**session scope 不是根需求；project-level durable active work 才是根需求。**

## 6. Brain 与宿主自带 memory 的关系：解决的问题层级不同

现代 Agent Host 可以自己提供：

- conversation history；
- thread / task state；
- project instruction；
- built-in memory；
- compaction / summarization；
- skills；
- local / network / runtime tools。

这些能力都可以被 Brain 利用。

Brain 不需要复制一套宿主已有的 conversation / session 系统，也不需要把完整 transcript 再存一遍；但它仍应把**未来项目工作需要继续使用的 active work cognition**保存到 project memory，因为 Host 当前会话、压缩摘要或内建 memory 不一定提供 Brain 所要求的跨会话可发现性和每轮恢复行为。

真正的差异在于：

~~~text
普通宿主 memory
    保存 / 检索过去信息
    但不一定在每个用户 turn 都自动建立新的 cognition anchor

Brain
    Harness 保证每个用户 turn 都恢复稳定 Core / cues 到最近上下文
    Core 重新给出读取和判断 guidance
    主模型再结合当前 conversation 按这些 guidance 读取需要的 cognition 和其他 evidence
~~~

因此 Brain 与普通 memory 并不是简单替代关系。

一个宿主即使已经有 memory，仍可能需要 Brain，因为核心 failure 是：

> **“模型这一轮有没有重新进入正确思考模式？”**

而不只是：

> “过去的信息有没有被存下来？”

## 7. Brain 必须是通用、宿主无关的能力

Brain 的根定义不能绑定 Codex、DSH、Claude Code 或任何具体 Agent Host。

这些产品和项目可以作为：

- failure evidence；
- harness engineering 参考；
- adapter 实现案例；
- integration test target。

但它们不能成为 Brain 的语义前提。

Brain 的通用 contract 应更接近：

~~~text
Host
    能在收到新的用户消息后触发 Brain
    能把 Brain 返回内容放回当前模型上下文
    能提供必要的 scope / project identity（如有）

Brain
    每轮恢复稳定 Scope Core 与有界 cognition cues
    提供 cognition 的发现、精确读取和维护能力

Model
    使用每轮重新恢复的 Core / cues 与当前 conversation 理解任务
    按其中明确的读取条件继续发现和读取具体 cognition
    再调用 Host 暴露的本地、网络、runtime、memory 等其他能力
~~~

不同 Host 怎样取得 session identity、怎样注入 tool result、怎样提供项目根目录、怎样管理 conversation，是 adapter / integration 层问题。

Base 不应该把其中一种 Host 的具体形态写成 Brain 的产品定义。

## 8. 从“记忆系统”提升到“每轮认知支撑系统”

结合以上背景，Brain 的定位应该比“长期 cognition persistence / recall”更靠前：

> **Brain 是 Harness 中负责每轮认知恢复与长期 cognition 支撑的通用外部认知系统。它通过每个用户 turn 的确定性触发，把稳定 Core / cognition cues 与读取 guidance 重新送到当前模型最容易使用的上下文位置；主模型再结合 latest user message、conversation 和这些 guidance，继续读取需要的具体 cognition、调查外部 evidence、形成和修正当前判断。**

这里长期 memory 是重要能力，但不是目的本身。

更完整的关系是：

~~~text
每轮新的用户消息
→ 确定性 Brain trigger
→ 恢复稳定 Core / cognition cues 到最近上下文
→ 主模型按恢复出的 guidance 结合当前 conversation 形成 provisional understanding
→ 主模型判断哪些明确读取条件成立，并读取相应方法 / project cognition
→ 这些方法和当前理解产生新的 information need
→ Brain / project / web / runtime / user / experiment 取得 evidence
→ 更新理解并行动
→ 需要跨当前 context 继续的 active project work，以及长期有价值的 cognition，沉淀回 Brain
~~~

这个循环同时解释了：

- 为什么 Brain 必须每轮出现；
- 为什么主要召回思考模式；
- 为什么普通 memory 不足以替代 Brain；
- 为什么纯 conversation transient state 不进入 Brain，但需要在新会话或压缩后继续的项目 progress / blocker / remaining work 必须进入 `@project` cognition；
- 为什么 Brain 应与具体 Host 解耦；
- 为什么 Brain 的检索最终服务于 reasoning method，而不是相似度本身。

## 9. Archive 中哪些东西属于根，哪些只属于历史方案

### 9.1 继续保留为根的认识

以下内容不是某个版本偶然形成的实现细节，而是后续设计应继续解释和承担的原问题：

1. **准确理解优先于表面完成。**
   用户表达是 evidence，需要恢复它真正指向的目标、背景、取舍和现实。

2. **AI 应主动承担可调查和可专业判断的工作。**
   减少用户负担依赖 AI 主动取得 evidence、形成判断、验证和更新。

3. **静态 instruction 的“存在”不能保证持续生效。**
   长上下文、attention drift、最新消息和压缩都会让较早 guidance 的实际控制力下降。

4. **关键思考 guidance 需要在每个用户 turn 重新靠近当前 decision point。**
   这是 Brain 每轮确定性触发的根目的。

5. **稳定每轮召回的主体首先是跨会话可复用的思考方式；项目续作状态则要持久化并可发现。**
   纯 conversation transient state 由 thread 拥有；active goal、progress、blocker、remaining work 等只要需要在新会话或压缩后继续，就属于 `@project` cognition。多个并发工作分别保存，不合并成一个虚假的项目唯一 current state。

6. **机制与主模型各做自己擅长的事。**
   确定性触发、scope 和工具 Contract 由 Harness 稳定承担；语义理解、关联、解释和取舍由主模型完成。

7. **真实模型行为而不是文案存在性才是最终验收。**
   “写了规则”“memory 被保存”“Tool 出现在列表”都不能证明 Brain 达成用户结果。

### 9.2 保留为历史 evidence、但不再作为根约束的方案

Archive 曾出现或冻结过许多具体选择，例如：

- global / project / session 三层；
- session core / session archival；
- core 每层一篇或固定条数；
- 固定 L0 候选数量；
- FSRS、LRU、importance / exposure；
- fuse / grep / glob 检索；
- 不使用 embedding / RAG；
- 某个版本的每轮具体工具调用流程；
- 具体目录、状态文件和 schema；
- 某种审批档位或 Tool 数量；
- 针对 DSH / Codex 等具体 Host 的接线方式。

这些方案继续保留，因为它们说明历史上试图解决什么问题、哪些 trade-off 当时成立。但新的根研究不能以“已经做过这些”为前提。

特别是：

- archive 中 session memory 的设计，是当时针对长会话转录可靠性形成的具体方案；
- archive 中某个 Host adapter 的行为，是 integration evidence；
- archive 中“RAG / embedding 被否”的结论，是当时设计条件下的取舍。

它们都不能自动升级成当前 Base 的永久要求。

## 10. 后续设计的总验收问题

任何新的 Brain 设计，都先回答：

~~~text
它改善的是哪一种认知 failure？
→ 为什么现有 system / project instruction / host memory 不能稳定承担？
→ 需要每轮重新靠近当前上下文的到底是哪种 cognition？
→ 这份 cognition 是纯 conversation transient state，还是未来项目工作仍需要恢复的 active work？
→ 如果新会话、context compaction 或另一个工作会话需要继续它，是否已经进入正确的 `@project` memory，而不是只留在原 thread？
→ 多个并发 active work 是否按工作本身分开保存，而不是被覆盖成一个 project current state？
→ 如果需要历史 cognition，它应该怎样被思考方法主动发现？
→ 这个能力是否保持 Host-agnostic？
→ 哪一部分需要 Harness 确定性保证，哪一部分继续由模型做语义判断？
→ 有没有更小、更自然的机制？
→ 怎样用真实模型行为证明它提高了“做对做准 + 自主省事”的下限？
~~~

无法沿这条链解释的机制，暂时不因为“像记忆系统应该有”或“某个 Host 恰好这么做”进入 Brain。
