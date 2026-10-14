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

当前方向是：每个新的 user turn，在模型开始主要任务判断前，Harness 先确定性建立本轮 Brain 工作上下文。Harness 负责稳定路线、已提供候选、角色与工具接口语义；不替用户记忆拥有可演进的问题理解和主动 recall 方法。

逻辑上至少涉及：

- Brain 每轮上下文的建立与记忆读取协议；
- 用户选择的记忆外think-workflow，以及Brain记忆中的专业方法和读取指导；
- Global stable routing surface；
- 当前 Project 存在时的 Project stable routing surface。

这里是逻辑责任，不代表最终必须拼成一份 Prompt 或一个文件。Project route 与 Global route 分开；related Project 的 route surface 不自动加载。

2026-10-14当前实现：Brain每次建立上下文读取config.json的thinkWorkflowFile并提供选定流程全文；internal以开发期源码包根定位，普通相对路径以配置目录定位。读取异常转内置default，仅日志warning。思考流程在think-workflow资源中，记忆读取方法及专业Skill在Brain记忆中；专业文档不依赖流程步骤。配置/正文下次建立即重新读取，工具和Host自动restore共用接线。具体源码、配置及stub验证见[Brain README](../../../code/brain/README.md)。

以下记录此前checkpoint方案的形成经过，按各日期理解；当前流程以所选think-workflow为准。

2026-09-29 用户批准并实施新的 per-turn cognition checkpoint。2026-10-02 又根据真实使用继续重构通用 cognition：模型不能把用户消息、代码、数据、日志、搜索结果或 Tool result 直接当成完整现实，而要先理解“为什么会有这个输入、它由什么目标、条件、约束、关系、机制和历史产生、什么真正决定结果”，并让现实 evidence 持续修正这个事情理解。当时安装 `brain-ai` 后，每轮方法按下面关系工作：

~~~text
确定性读取 stable route / 已提供 candidate
→ 前置 checkpoint：
   认知更新 / 本质认知 / 关联记忆 / 本轮计划
→ 根据当前事情理解和认知缺口做 semantic discovery
→ 由认知缺口取得项目、runtime、外部资料、experiment 等 reality evidence
→ 新信息持续支持、限定、修正或推翻当前事情理解
→ 复杂时再自上而下展开并执行 / 验证
→ 结束本轮前 checkpoint：
   当前判断 / 后续预判 / 关键存疑 / 记录维护 / 后续推进
~~~

前置仍是四项、结束前仍是五项；本次把原 `初步判断` 升级为 `本质认知`，不是增加 checkpoint 数量。它要求模型说明为什么当前消息、现象或问题会出现，当前认为事情为什么会是现在这样，哪些因素真正决定结果，哪些已经可靠成立、哪些仍是 hypothesis，以及当前最重要的认知缺口。用户消息还要放回此前目标、当前工作状态和模型前次行为中理解；未被用户明确表达的动机或意图继续保持 hypothesis，不升级成用户事实。

2026-10-03 checkpoint 修订已获用户批准并同步：明确关键判断关系及依据、追溯到哪里与停止或继续的理由；表达以通用、清晰、直白为准，允许短语、常见符号和必要文字组合。前四后五与既有执行保障保留，详见[实施记录](research/18-checkpoint-reasoning-boundary-update.md)。停止判断对照整体目标、本轮交付与重要风险；关键依据不足时继续调查，已知下一步动作不等于根因已查明，停止某段追溯不等于任务完成。新增依据改变停止条件时重开受影响的问题。当前判断吸收实际结果，其他 checkpoint 继续承担各自的认知、记录与续作职责。本质认知展示的最上层须为有依据支持的最根本层，或当前实际采用的最上层的直接上一层；后一种说明两层关系及停止边界。上一层未知时保留具体问题，不能把未知当成影响小。

2026-10-03，checkpoint 自检与纠正修订已获用户批准并正式同步。前四项与结束前五项承担实际判断、核对和纠正；过程中在重要判断用于行动前、新信息取得后、下层返回整体时检查受影响部分。写下简明判断、关键依据和必要变化供后续工作使用，发现偏差后同步修正方案、产物及必要记录，再继续推进。普通答复按用户需要组织。核对时回到原始目标、已确认约束、事实和实际结果；依据支持则保留，存在矛盾则纠正并返回整体检查，关键依据不足则明确缺口并继续取得。没有具体问题不制造修改，未受影响工作继续。本质认知继续保留最上层与停止边界要求，并核对原则是否有现实条件支撑。详见[实施记录](research/19-checkpoint-self-correction-update.md)。

2026-10-04，用户批准本质法直白引导与通用表达修订，已同步三篇正式方法。本质认知每轮按“目的 / 关系 / 边界”逐项写出、核对并纠正；过程中只更新受影响部分。表达由用户已有背景、当前需要与缺口推出回答作用、内容、深度与形式，独立审核区是需要判断候选时的具体应用。原前四后五、强读取、现实依据、追溯停止边界、黑盒、即时记录与恢复继续保留。详见[实施记录](research/20-direct-guidance-and-expression-update.md)。

现实取证改为由当前认知缺口驱动：先判断还缺什么会改变事情理解或行动，再选择历史 cognition、当前项目、外部一手来源、runtime、测试、experiment 或用户 input；不先选 Tool / 来源再找问题。完成必要历史 recall 后，在重要判断或行动前再次判断当前现实资料是否可能改变理解；需要时主动取得，决定不查时先说明具体理由，不能只因为已有模型知识、本地材料或自己觉得信息足够就跳过，拿不准时先查再判断。当前信息范围清楚、漏掉其中一项可能 materially 改变判断且取得成本较低时，在 bounded 范围内偏向 coverage，不赌模型能精确选出最少集合。能够从 Brain、项目、外部资料、runtime、测试或专业分析自行查明的先自行查明；只有用户拥有的信息、目标、价值、偏好、经验、组织约束或授权才能区分关键分歧时，再主动询问用户。每取得重要新信息，都判断它为什么出现、实际证明什么，以及它如何改变当前事情理解。retrieval、历史 assistant 输出或已经保存的模型 interpretation 不因为被读到、写入 Brain 或重复出现就升级成 truth；深层解释没有足够依据时继续保持 hypothesis；模型 confidence、已有本地资料或暂时没搜到更多信息不能代替 reality。

自上而下仍是复杂度控制方法，不再承担“理解本质”的职责：先形成当前最可靠的事情理解，再只展开会 materially 改变上层结果的下一层。行动前说明真正要改变什么、为什么当前行动能够改变它、依赖哪些重要前提、什么真实结果能够说明成功；行动后的实际结果再反过来更新事情理解。

2026-10-01 已实施的 working artifact / interruption continuity 继续保留并进一步明确：复杂、长程或跨调用工作中，如果后续调查、判断或行动已经依赖当前形成的事情理解，而重新构建它成本明显或丢失后容易回到表面问题，就立即把必要的事情理解、已确认事实及来源、重要判断、hypothesis、竞争解释、关键 unknown、evidence 覆盖范围、information need 和后续验证方向写入正确 working owner，不等到本轮结束，也不保存完整内部 chain-of-thought。持久化不改变 epistemic status；已有 canonical owner 的正式事实不复制成第二份真相。

记忆包安装仍将六份记忆写入Global memories，并在Global Core增加读取入口。当前brain-ai/core.md只承担记忆读取指导及专业Skill路线，其余五篇保存独立专业方法；思考流程由记忆外think-workflow提供。Brain runtime呈现实际流程、Core、候选、范围和工具能力，并保留现有cognition修改接口约束。CLI安装记忆包不静默替用户选择流程，流程选择由thinkWorkflowFile配置。导出/导入继续只处理Global Core和memories，不把workflow纳入记忆迁移。

## 3. Root、Route 与 Domain Coverage

### Root

Root 只拥有那些如果缺失，模型可能连正确的下一步 cognition / evidence 获取动作都不会产生的跨任务关系。以下内容属于可选记忆包的研究候选；Brain runtime 自己仍需准确说明每轮上下文建立和记忆读取协议。

当前候选主要围绕：

- 第一层合理解释不能自动升级成现实；
- material claim 需要从真正拥有或直接说明该事实的 source 取得，并核对对象、时间、版本和环境；由外部 owner 控制且可能变化的重要事实主动取得当前来源，本地材料不能单独证明它现在仍成立，当前外部资料也不能覆盖项目实际锁定的版本、环境和兼容约束；
- 模型自己的 confidence / “没发现问题”不能替代当前任务真正要求的 coverage；当范围清楚、遗漏代价高且取得成本低时，在 bounded 范围内偏向 coverage；
- retrieval、历史 assistant 输出和已经保存的模型 interpretation 只按各自 provenance 与证明范围使用，不因为被检索、写入 Brain 或重复出现就升级成 truth；
- 当仍有多个符合现有依据、且会改变目标、范围、行为、重要风险或后续行动的合理解释时，先从 Brain、项目、外部资料、runtime、测试、experiment 或专业分析取得区分依据；能够自行查明的先自行查明，只有用户拥有的信息、目标、偏好、经验、组织约束或授权能够区分时才向用户澄清或请其决定。
- AI 自行调查事实并承担专业判断；查阅与分析后仍不清楚用户意思时直接澄清，用户尚未明确的重要取舍或授权由用户决定。
- 复杂问题从当前整体目标、边界和决定结果的关系开始；当前层不足时，只展开会 materially 改变它的直接下一层。对当前层的直接子问题或子模块，先按黑盒明确父层为什么需要它、对外职责、输入、结果、关键约束和与其他部分的配合关系；只有内部差异会改变父层目标、边界、contract、重要风险、行为或验收结果时才展开内部。取得所需 cognition / reality evidence 后再组合回上层检查。没有上层真实需要或 evidence 支撑的机制不提前固化；继续下钻不再改变目标、方向、重要风险、责任、行为或验收结果时停止。

这一层的通用 model-facing wording 已在 2026-09-29 cognition checkpoint 基础上实施；2026-09-30 又补入 material ambiguity / evidence ownership 的提问触发，以及上述自上而下逐层思考方法。2026-10-01 用户继续批准主动现实查证补强：形成重要判断时按 claim 的 source owner、时间、版本和环境选择 evidence，不固定 local-first / web-first；由外部 owner 控制且可能变化的事实主动取得当前来源，项目当前状态与外部当前事实分别核对。软件方法同步补强外部接口、生态能力和成熟实现的查证触发。上述修改仍只属于 model-facing cognition，没有新增 Harness 字段、状态或固定 workflow。真实模型是否能在旧本地材料、当前外部资料、锁定旧版本和稳定知识等不同情境下选择正确查证动作，仍需实际使用或 replay 验证。

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

Discovery 用于稳定路线和已提供候选之外、模型已经形成明确 information need 但没有 stable address 的长尾 cognition / evidence。

它不承担确定性 bootstrap：stable route 和已提供 candidate 先读取，避免所有 recall 都依赖模型先意识到缺口。安装 `brain-ai` 时，主动 discovery 放在搜索前 checkpoint 之后：先形成 provisional frame 和 `关联记忆`，再据此寻找可能改变当前理解的过去 cognition。这样既避免直接复制用户消息搜索，也避免先完成最终判断再让检索只做确认。

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
- 仍有效的重要判断及其依据；
- 仍有效的 confirmed baseline；
- 已完成进度；
- blocker / open question；
- 下一步；
- 必须读取的 working / canonical artifact refs。

用户暂时转去处理另一个事项，不自动结束、替换或清空原 active work。原工作仍有效的判断、未完事项和恢复材料继续存在；只有明确暂停、取消、替换、实际完成或相应依据失效时才更新对应状态。

Active-work body 保存 current-state snapshot，不保存逐轮 discussion log。工作本身的数据、中间材料和正式 artifact 留在项目 / 工作目录的真实 owner；Brain continuation 保存恢复这项工作所需的 cognition、状态和关键引用。

工作结束后移除 continuation-critical route；长期仍有效的 cognition 留在自己的 durable owner。

当前还要求路由与正文保持可恢复的关系：仍作为活跃工作的路线应指向可读的当前状态；承诺跨会话继续的工作应有确定入口。中途失败或并发更新不能静默留下断链；物理上如何联合更新或检测修复仍待设计。暂停是否退出活跃路线取决于以后是否仍需默认续作入口，不能仅按“暂停”字面决定。

Active / Dormant / Closed 的最终 physical representation 尚未冻结，但语义上应区分“仍需要默认 route”与“只是未来可能通过 discovery 恢复”。

## 7. Cognition maintenance

Brain 代码的固定每轮正文只负责建立和读取认知，不替用户规定可演进的保存方法。用户选择安装方法包或自行建立记忆后，适用的 Global Core 路线使模型每轮取得该方法；方法正文负责避免“模型根本想不起应该保存”这一触发失败。Brain 工具仍准确说明写入、编辑、移动、删除及反馈的参数、状态和错误。

当前 persistence failure boundary：

- 单资源 semantic mutation 依赖单文件 atomic replacement / filesystem 原子操作；apply 失败保留原始 persistence error，并以 `mutation-failed` 返回，不做 before-state capture 或补偿。
- 多资源 semantic mutation 在 apply 前取得 before-state；apply 中只记录已经成功完成的资源。后续资源失败时，仅按逆序补偿这些已成功资源，不补偿当前失败项和尚未执行项。
- 补偿本身有失败时仍继续尝试其余已成功资源，并返回 `mutation-partially-applied`；保留原始 mutation failure 与补偿 failure，不能用补偿错误覆盖原始原因。
- 一次补偿失败不再把 coordinator 永久标记为不可写。模型收到 partial-state 错误后重新读取本次操作涉及的 cognition，以当前 persisted state 为准继续处理。
- model-facing 错误只暴露必要的 failure category、状态影响和下一动作；完整底层异常链和物理细节只进入内部诊断。Git/history 不参与这条 operation-local failure handling。

当前方向：

~~~text
Core 中的准确方法入口
→ 条件成立
→ exact read 包或用户记忆中的保存方法
→ 再决定 create / update / challenge / supersede / close
~~~

长期 cognition 不能把历史 assistant inference 静默升级成 truth；provenance / role / challenge 必须足以避免以后误用。

## 8. Prompt 写法

2026-09-30 已批准并实施 `brain-ai/instructions.md` 的弱模型优先写法：正确、完整、清楚、低歧义、弱模型稳定执行优先于精简；确定动作直接写，判断分支明确什么条件改变下一动作，顺序影响结果时明确先后，关键要求不依赖模型从背景或例子自行推导。2026-10-03 的已批准重组进一步明确：示例可消除实际歧义，也可讲解方法依据、配合关系及条件变化后的调整；按实际关系选用短顺序链、并列事项、条件分支或职责说明。重要修改仍关注正常情境、关键边界和已有代表性失败，实际模型效果由用户人工观察。

同轮新增 `user-facing-expression.md` 与 `report-writing.md`：前者负责普通用户可见表达，把最终表达与内部思考/执行过程分开；后者只在需要可独立阅读、保存、提交或转发的正式书面成品时读取，并按状态报告、分析/研究报告、决策 brief 的目的调整结构。

当前 Universal Root 候选仍需按完整任务过程复核：错误的问题理解会影响后续路由、取证、停止和验证；单句 Prompt 修补不能替代稳定 route、领域覆盖、真实反馈及用户决策边界。跨场景推演、对初轮建议的修正和一手来源见 [research/09-prompt-body-writing-review.md](research/09-prompt-body-writing-review.md)。

2026-09-24 的逐句复核已在同一研究稿中形成 Universal Root 与 Collaboration Root 的完整中文**研究候选**。它将有限搜索未命中的具体处理归入检索方法，保留 Root 对问题理解、材料证明范围、适用领域覆盖和反馈修正的上游关系。候选尚未经过弱模型 Replay，也未获得 production Prompt 批准。

用户看到这两段完整候选后回复“可以”，后续设计据此继续。生产 Prompt 仍要连同路由、领域方法、能力 Contract 和实际接入形式完成审核；这次回复不替尚未展示的正文作决定。

对 Prompt 的开源参考目前包括 Superpowers、Anthropic Skills、GitHub awesome-copilot、OpenAI Plugins、Matt Pocock grilling、Addy Osmani interview-me 等。

上述三份 guidance 与对应 `core.md` 路由已获完整文字批准并实施；历史 Universal / Collaboration Root 研究候选仍按各自阶段理解，不因本次实施自动升级为 production truth。

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
