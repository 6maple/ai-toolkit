# 06 · v7 当前架构理解

本文记录 v7 当前已经收敛到的设计 baseline 和仍然开放的问题。

它是 **Current design**，不是 Base，也不是最终 production Contract。新 evidence 可以重新打开这里的设计。

## 1. 当前最重要的修正：模型是主体

[Base](../base/01-origin-and-goal.md) 现已明确保留用户的长期追求：以顶尖全能人才在模糊、陌生、跨领域问题中的高水平思考为研究参照，让模型在 Brain 和 Harness 支撑下更稳定地产生这类实际判断与行动。这里研究如何实现、由哪一层承担以及怎样验证，仍属于可修正的 v7 设计。

用户实际交互和使用的主体是 Model。Model 负责理解用户、形成判断、进行专业推理、调用工具、执行任务并根据反馈修正自己；Brain、Prompt、Harness、Tool 与 Runtime 都是在帮助 Model 更可靠地完成这些事情。

用户进一步明确：Model 同时是 Brain 的直接使用者。Brain 故障要尽可能把具体错误和可行下一步传给 Model；模型继续完成其他可做的工作。Brain 作为 Harness 增强，不把自身的读取、检索、维护或注入失败扩张为整个任务的停止条件。当前任务若确实依赖尚未取得的认知，模型说明受影响部分和实际依据，再决定怎样继续。

v7 因此先研究模型真实能稳定做好什么、哪些能力存在但不稳定、哪些事实必须从外部取得、哪些 invariant 更适合由软件机械保证，再决定补偿机制。

尤其不能把下面这些当成强保证：

~~~text
“我觉得信息够了”
“我没有发现未知”
“这个 Skill 看起来不需要”
“我已经验证过了”
“这个解释最合理，所以事实就是这样”
~~~

一个新机制只有能够追回真实模型 failure，并说明它怎样改善“做对做准 / 自主省事”，才有理由进入 Brain / Harness 设计。

## 2. Per-turn cognition bootstrap

当前方向仍然是：每个新的 user turn，在模型开始重要语义判断前，Harness 确定性建立最近上下文 cognition anchor。

逻辑上至少涉及：

- Brain 每轮上下文的建立与记忆读取协议；
- 用户选择安装后才存在的通用判断、协作与领域方法；
- Global stable routing surface；
- 当前 Project 存在时的 Project stable routing surface。

这里是逻辑责任，不代表最终必须拼成一份 Prompt 或一个文件。

Project route 与 Global route 分开；related Project 的 route surface 不自动加载。

用户提出可选默认记忆包：用户选择安装后，正文按相对路径复制到自己的 Global memories，Global Core 只增加一行读取入口。包的内容须从真实使用需求重新设计，现有 `ai-think` 仅作为参考；候选正文见 [默认记忆包重新设计](10-default-memory-pack-design.md)。Brain runtime 的每轮上下文建立、路径、工具和角色协议仍由代码说明。辅助 `brain-cli` 的代码统一放在 `code/brain-cli`，面向用户和模型：顶层 `install/update --agent <名称>` 仅管理指定 Agent 的 Brain MCP 接入，语义搜索另有安装与更新；记忆导入、Global 记忆导出及记忆包安装是独立命令，记忆包没有更新命令。导出的 Core 和 memories 保留相对于 Brain root 的路径。Brain Web 集成留到以后。具体 Contract 见 [代码与认知改造讨论稿](07-code-and-cognition-change-proposal.md)。

## 3. Root、Route 与 Domain Coverage

### Root

Root 只拥有那些如果缺失，模型可能连正确的下一步 cognition / evidence 获取动作都不会产生的跨任务关系。以下内容属于可选记忆包的研究候选；Brain runtime 自己仍需准确说明每轮上下文建立和记忆读取协议。

当前候选主要围绕：

- 第一层合理解释不能自动升级成现实；
- material 外部事实需要从真正能够说明它的 source 取得；
- 模型自己的 confidence / “没发现问题”不能替代当前任务真正要求的 coverage；
- AI 能自行调查的事实和专业问题先自行取得，只有真正 user-owned 的 material gap 才回到用户。

最终 model-facing wording 尚未批准。

### Stable Route

Stable Route 只解决“当前任务属于哪一大片长期 cognition domain，以及下一步去哪里读”。

它优先使用 task / artifact / action / transition 这类较容易观察的特征，而不是依赖模型先准确意识到自己的 cognition gap。

~~~text
涉及代码或工程判断
→ software

修改 Prompt / rule / executable guidance
→ expression

继续某个 Project active work
→ 对应 continuation body
~~~

Route 条件优先避免 false negative；漏读后果高时，只有明确不适用才跳过。

一条承担稳定可达责任的 route 应让触发条件、下一读取目标、使用范围和可达性都能检查。宿主必须提供正确的 Global / 当前 Project route surface，目标和工具也必须真实可用。活跃工作路线增多时，可以逐层分流或提供确定性完整索引；不能用静默 top-k 截掉仍承担续作保证的路线。具体物理形式与预算仍需真实数量和用户人工使用结果决定。详细分析见 [research/10-stable-route-and-coverage-review.md](research/10-stable-route-and-coverage-review.md)。

同一研究稿已写出完整的中文路由执行说明候选，并用当前 `@global` / `@project` 路径核对了目标在本任务环境中可读。用户明确允许一次只读外部回放后，CLI 报告当前账户不支持 `gpt-6-luna`；改用 `gpt-5.5` 时，模型选择了正确的 `brain_cat` 路径，但工具返回 invocation context 缺失，未读到正文。后续备用入口和 sandbox 也未完成任务。因此只有一次正确选路的局部观察，没有弱模型完整遵循或候选改善行为的证据。

### Domain Coverage

进入一个 bounded domain 后，Skill / workflow 不只告诉模型“怎么做”，还可以定义这种工作通常需要覆盖哪些 cognition、项目现实和外部信息。

当前只保留三个执行强度：

- **Required**：当前判断或阶段没有实际覆盖它，就不能可靠继续；
- **Default**：进入该 domain 后通常主动取得，只有明确无关才跳过；
- **Conditional**：写清触发条件；条件成立后可以升级为 Required。

Coverage 对象不限于 Brain memory，可以包括：

- Brain cognition / active-work state；
- Requirement / Design / project artifact；
- 当前代码、配置、tests；
- Git / history；
- runtime / log / database / GUI state；
- official docs / external research；
- experiment / POC；
- user-owned input。

这三个强度优先作为 Skill / workflow 中清楚的自然语言规则，不先设计新的 metadata、评分系统或数据库字段。只有真实 Replay / Eval 证明自然语言控制不够稳定时，再考虑提升到 Harness mechanism。

### Active Discovery

Discovery 用于模型已经产生明确 information need、但没有 stable address 的长尾 cognition / evidence。

它不承担所有 upstream trigger，否则会回到“模型必须先意识到自己缺什么”的递归 failure。

Search hit、route description、摘要、grep hit 或 top-k candidate 只说明“这里可能有相关内容”。material 判断需要正文时要继续 exact read；没有在有限搜索 / 分页 / 截断结果中看到某项，也不能直接证明它不存在。

## 4. Bounded Coverage，而不只是 over-recall

原来的 bounded over-recall 只描述 Brain retrieval，范围过窄。

更准确的原则是：

> 先用 route / domain 缩小工作范围；在这个合理范围内，如果漏掉某项 cognition 或现实 evidence 会明显改变行动，而取得成本较低，就优先 coverage，而不是赌模型能够精确挑出理论上的最少信息。

这同时适用于：

- 多读相邻 Brain cognition；
- 多看一份相关 Design / test；
- 检查已有 precedent；
- 在版本相关事实上查当前官方资料；
- 在静态材料不足时观察 runtime。

仍然不追求完整世界模型。长 context、无关检索和过量 Tool 调用都有成本，所以 coverage 只服务当前 material dependency 和下一行动。

## 5. Canonical Owner 与当前 Coverage 分开

一份 cognition / artifact 是否应该独立维护，由它自己的 semantic owner 和 lifecycle 决定。

一次任务需要共同取得哪些内容，由当前 Domain Coverage 决定。

因此可以：

~~~text
canonical owners:
    design.md
    testing.md
    workflow.md
    current implementation
    official API docs

software design coverage:
    默认恢复 design + testing + workflow
    涉及已有系统时读取 current implementation
    依赖外部 API 当前能力时读取 current official source
~~~

不需要为了共同读取而把多个 owner 合并成一个巨型文档，也不需要让所有信息都进入 Brain。

## 6. Project continuity

同一 Project 可以有多个并发 work，不建立唯一 Project.currentTask。

Active-work continuation 的目标：

> 没有原 conversation 的新 session，可以从正确位置继续。

应恢复：

- 当前目标；
- 当前阶段 / 问题；
- 仍有效的 confirmed baseline；
- 已完成进度；
- blocker / open question；
- 下一步；
- 必须读取的 canonical refs。

Active-work body 保存 current-state snapshot，不保存逐轮 discussion log。

工作结束后移除 continuation-critical route；长期仍有效的 cognition 留在自己的 durable owner。

当前还要求路由与正文保持可恢复的关系：仍作为活跃工作的路线应指向可读的当前状态；承诺跨会话继续的工作应有确定入口。中途失败或并发更新不能静默留下断链；物理上如何联合更新或检测修复仍待设计。暂停是否退出活跃路线取决于以后是否仍需默认续作入口，不能仅按“暂停”字面决定。

Active / Dormant / Closed 的最终 physical representation 尚未冻结，但语义上应区分“仍需要默认 route”与“只是未来可能通过 discovery 恢复”。

## 7. Cognition maintenance

Brain 代码的固定每轮正文只负责建立和读取认知，不替用户规定可演进的保存方法。用户选择安装方法包或自行建立记忆后，适用的 Global Core 路线使模型每轮取得该方法；方法正文负责避免“模型根本想不起应该保存”这一触发失败。Brain 工具仍准确说明写入、编辑、移动、删除及反馈的参数、状态和错误。

当前方向：

~~~text
Core 中的准确方法入口
→ 条件成立
→ exact read 包或用户记忆中的保存方法
→ 再决定 create / update / challenge / supersede / close
~~~

长期 cognition 不能把历史 assistant inference 静默升级成 truth；provenance / role / challenge 必须足以避免以后误用。

## 8. Prompt 写法

当前已确认的写作要求：

- 正确、清楚、低歧义优先于短；
- 面向弱模型；
- 简单确定关系直接写 condition → action；
- 需要判断时写清 condition → basis → action → stop；
- 有稳定方法时把方法写清楚；
- hard gate 只放真正不能越过的边界；
- examples 用于校准判断，不替代原则；
- 不用设计者术语迫使模型先学习理论再执行。

当前 Universal Root 候选仍需按完整任务过程复核：错误的问题理解会影响后续路由、取证、停止和验证；单句 Prompt 修补不能替代稳定 route、领域覆盖、真实反馈及用户决策边界。跨场景推演、对初轮建议的修正和一手来源见 [research/09-prompt-body-writing-review.md](research/09-prompt-body-writing-review.md)。

2026-09-24 的逐句复核已在同一研究稿中形成 Universal Root 与 Collaboration Root 的完整中文**研究候选**。它将有限搜索未命中的具体处理归入检索方法，保留 Root 对问题理解、材料证明范围、适用领域覆盖和反馈修正的上游关系。候选尚未经过弱模型 Replay，也未获得 production Prompt 批准。

用户看到这两段完整候选后回复“可以”，后续设计据此继续。生产 Prompt 仍要连同路由、领域方法、能力 Contract 和实际接入形式完成审核；这次回复不替尚未展示的正文作决定。

对 Prompt 的开源参考目前包括 Superpowers、Anthropic Skills、GitHub awesome-copilot、OpenAI Plugins、Matt Pocock grilling、Addy Osmani interview-me 等。

最终 Prompt 尚未批准。

## 9. Prompt / implementation Gate

当前工作明确采用：

~~~text
能力和文档设计收敛
→ 形成按 owner 分开的完整中文 model-facing Prompt
→ 用户审核完整实际文字
→ 用户明确批准
→ 才允许写入 production Brain / Harness / Tool / renderer / code
~~~

“继续”“整理文档”“继续架构设计”都不等于 production approval。

## 10. 当前开放问题

接下来重点继续解决：

1. Universal / Collaboration Root 中，哪些最上游 failure 确实会阻止模型产生正确的 cognition / evidence need，因此必须 resident；
2. Global / Project Stable Route 怎样保持 bounded，同时降低重要 cognition 的 false negative；
3. 不同 domain 的 Required / Default / Conditional coverage 怎样用清楚的自然语言表达；模型实际执行效果由用户人工验证；
4. 哪些真实 failure 只靠 Skill / route 已经足够，哪些值得升级成 deterministic Harness trigger；
5. maintenance trigger 怎样稳定命中而不过量写入；
6. active / dormant / closed 的 lifecycle 与 Project route projection 怎样实现；
7. canonical root / route text 怎样保持单一 source of truth 并 deterministic projection；
8. 用户人工验证时，怎样观察弱模型是否遵循指导、是否漏读必要认知或证据、是否出现上下文干扰、证据越级及跨阶段续作问题。协助者提供可检查的场景与文字，不自行运行模型回放。
