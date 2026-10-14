---
description: 凡是当前工作可能涉及 LLM Agent 本身的职责、工作面、输入与结果形式、Tool、持续工作材料或 Agent 间协作设计时读取。
summary: 聚焦 LLM Agent 本身的通用设计推荐：从认知职责组织工作面，开放语义输入输出保留自然表达空间；从单个 Agent 的黑盒视角设计 model-visible Tool surface，用专用业务 Tool 表达稳定责任动作，底层通用 transport / routing 保持为实现细节；Tool 使用完整 contract，长程工作可利用外部材料；具体组织、Workflow/Graph、状态与持久化由项目实际决定。
importance: high
---

# Agent 设计推荐

Agent 设计同样从实际工作怎样完成出发：谁交付目标，模型需要形成什么判断，判断所需材料从哪里来，能够采取什么行动，结果由谁继续使用。由这些关系共同设计 Prompt、Context、Tool、工作材料与协作方式，再逐层展开内部。只优化某一项的形式，可能使其它部分无法承担原定责任。

## 认知职责

先明确 Agent 负责理解什么、判断什么、能采取什么行动，以及结果怎样被人、Agent 或程序使用。

认知职责描述 Agent 对什么语义工作负责，不等同于固定执行步骤。

Prompt、Context、Tool 和结果消费者共同支持这项职责；不要由节点名、固定流程或数据结构反过来决定职责。

## 工作面

Agent 的实际工作能力通常由 Prompt、Context 和 Tool 共同形成。

| 工作面中的部分 | 为 Agent 提供什么 | 怎样支持同一职责 |
|---|---|---|
| Prompt | 职责和当前工作的语义 | 说明需要理解、判断和完成什么，以及行动边界 |
| Context | 可用于判断的材料 | 提供目标、对象、已有事实和当前约束 |
| Tool | 继续取得信息或采取行动的能力 | 补足当前缺失的材料，或执行职责所需的动作 |

这张表说明三者的配合关系。具体需要哪些材料和能力，从当前职责与实际缺口判断；持续工作所需材料按后文结合工作环境安排。

设计时核对组合后能否承担当前职责，不只检查某一部分。

## 输入与结果形式

开放语义任务的主要输入通常适合用自然语言或多模态内容，直接表达目标、背景、约束和已有事实。机器需要稳定识别或绑定的信息可同时结构化，例如对象标识、受约束参数和协议数据。

例如，一个 Agent 可以直接收到：

> 检查当前数据库迁移设计是否可能造成服务中断。
> 先调查现状，不修改代码；说明依据、风险和建议。

无需仅为程序处理方便，把完整工作语义拆成大量固定分类字段。

结果形式按内容和消费者选择：自然语言、结构化数据、文件或其他 artifact、Tool 行动，以及宿主的 UI / presentation 能力。需要稳定机器协议的部分适合使用结构化输出；其余不必预设为单一格式。

宿主提供多种展示能力，且形式选择需要语义判断时，可让 Agent 选择。例如直接回答文字，或用表格、地图、交互组件呈现结果。

一次模型调用结束、一次结果输出和业务工作完成可以不同；是否绑定，由系统实际协作方式决定。

## Tool contract

Tool 是 Agent 工作能力的一部分。

设计 Tool 前，先明确：哪个 Agent 在什么背景下需要它，要完成什么，为什么已有 Context / 普通 Tool / 自身判断还不够，调用后需要得到什么变化或结果。说清这些问题后，再设计名称、参数和 schema。

设计 Tool 时，先把当前 Agent 当作黑盒：从它所在的工作背景、认知职责、当前要完成的事情、允许采取的业务动作以及结果消费者出发，再决定这个 Agent 应该看到哪些 Tool。**Tool 首先是给模型理解和使用的能力界面，不是给程序员看的函数签名。** 不要先从底层代码、消息系统、统一 API、类型系统或实现复用出发反推 model-visible Tool surface。

然后先区分 Tool 的**暴露边界与复用范围**，不要把不同类型的 model-visible Tool 混成一套设计规则：

- **可复用 / 可发现 Tool**：能力独立于某一个 Agent 角色，可能通过 MCP、通用 function-tool registry、plugin/tool search 等方式被不同 Host、Agent 或模型发现和调用。调用方的 system prompt、同场 Tool 集合和业务背景未必由 Tool owner 控制，因此 contract / metadata 需要更自足，description 往往同时承担 capability discovery、局部适用条件、与相似能力消歧等责任。
- **Agent 系统内专用 Tool**：只服务一个已知 Agent 角色或一个封闭的责任拓扑，例如某个 manager Agent 调用固定 specialist、某个 Task Lead 请求固定专业责任。调用方 system prompt、可见 Tool 集合、Context 和 Harness 由同一系统共同设计，因此跨 Tool 的 selection policy 可以由调用 Agent 的 instructions 统一拥有；Tool contract 重点表达这个专用能力本身、必要输入输出和副作用，不重复整套角色策略。

这是语义上的分类，不由底层 transport 决定。一个内部专用 Tool 即使底层通过 MCP / RPC 实现，也仍然可以是 Agent-internal dedicated capability；反过来，把一个能力公开成可被不同 Host 发现的 MCP Tool 时，就需要重新按可复用边界审查其 contract。

当目标责任和业务动作是稳定、明确的时，Agent 系统内部优先暴露对应的**专用业务 Tool**。名称与 contract 至少应让模型直接理解这项能力做什么、对应哪个稳定责任、会得到或产生什么结果，而不是要求模型每次再从通用参数、目标 ID 或消息协议中自行推断。

底层实现仍可以复用统一 transport、routing、registry、queue、lifecycle 或 provider；这些属于宿主实现细节。只有“任意选择对象并执行通用操作”本身就是 Agent 真正需要的能力时，才把通用接口直接暴露给模型，例如普通文件读取、搜索或 shell 类能力。

结合 Agent 实际能够看到的完整 contract 来考虑其可理解性，包括：

- 名称与 description；
- 输入里模型真正需要主动表达什么；
- 哪些上下文、对象和 scope 宿主已经知道，应由宿主绑定；
- 返回结果以什么形式最利于模型继续判断；
- 只有机器消费者真正需要稳定识别时，才增加对应 schema；
- Agent 需要理解的特殊结果或失败语义。

同时区分 **Tool contract** 与 **Agent instructions** 的不同作用，但不要把具体 placement 固化成跨模型定律：

- Tool contract 必须自足地说明能力本身、输入、结果、重要副作用、限制与失败语义。目标 runtime 如果会直接依赖 Tool metadata 做 discovery / selection，或多个 Tool 容易混淆，description 也可以承载必要的局部适用条件和区分信息。
- Agent system prompt / instructions 适合承载跨 Tool、跨情境长期成立的角色策略：整体目标、cognitive ownership、授权边界、能力之间怎样取舍、什么时候自己判断、什么时候协作或升级、怎样吸收其它 Agent 的结果。
- “when / when not to use”究竟主要放哪一层，不只受具体模型、provider、Tool API、deferred loading / tool search 等机制影响，也取决于它是可复用/可发现 Tool，还是封闭 Agent 系统内的专用 Tool。前者通常需要更自足的 metadata；后者可以把更多跨能力 selection policy 放在调用 Agent instructions。凡这个 placement 会 materially 影响行为，先确认 Tool 的暴露边界，再查目标模型与运行时的当前官方 guidance，并用代表性 replay / eval 验证，不把某个 provider 或某代模型的做法直接升级为 Global 规则。
- 避免在多处维护两套完整、可能漂移的 selection policy；如果 Tool description 需要局部判别信息，只保留当前 Tool 自身为了被正确理解和区分所必需的部分。

优先让开放业务语义保持为自然语言或少量高价值参数。不要因为代码函数常见多个具名参数，就把一个完整专业意图机械拆成 `question`、`why_it_matters`、`hypothesis`、`constraints`、`evidence` 等字段；只有真实模型行为或机器 contract 证明这种拆分能稳定改善结果时才保留。

同样，不要默认把 Tool 结果拆成固定 `judgment / evidence / limitations / implications` 结构。Agent-to-Agent 专业结果如果主要由模型消费，通常可以直接返回一份清楚的自然语言专业答复并附必要 source / artifact 引用；只有后续程序必须稳定读取某些字段时才结构化那些字段。

Schema 不只是程序侧的类型定义，也是 Agent 理解能力边界的一部分；因此 schema 越复杂，模型需要额外理解和正确填写的协议就越多。结构化只服务真正稳定的机器语义，不把代码侧便利性包装成模型必须遵循的字段。

Tool 输入输出随能力选择，文本、结构化对象、文件、图片等都可使用，无需统一形态。宿主已可靠知道、且无需 Agent 判断的信息，可由宿主直接绑定，不必让模型重复生成。

## 持续工作的材料

较长的 Agent 工作可能需要把部分中间材料延续到后续模型调用。

Agent 已有可持久的工作目录时，可复用普通文件 Tool 管理中间材料，例如：

    notes.md
    candidates.json
    open-questions.md

后续 Agent 可继续 read / write / edit，中间材料无需全部长期留在 Context，也无需为每种材料建立专用状态接口。这是推荐模式之一，不要求所有 Agent 使用文件工作区。

## Agent 间协作

Agent 之间交换开放的专业语义时，自然语言通常适合承载目标、背景、约束、当前判断、evidence 和需要对方回答的问题。

但 model-visible 协作能力仍应从**调用方 Agent 的黑盒职责**设计。系统已经知道稳定责任关系时，优先提供角色专用的业务 Tool，让 Tool contract 直接表达当前 Agent 正在请求哪一类专业责任，而不是把通用 Agent registry、目标 Agent ID、`list_agents` / `send_message` / `dispatch` 一类基础设施接口直接交给模型，再要求模型自行恢复责任边界。

例如，承担任务交付责任的 Agent 如果需要设计专业判断，model-visible 能力可以直接表达“请求设计判断”；宿主内部再把这个动作路由到正确的设计责任实例。底层仍可以统一使用同一套 transport 和消息系统，但这层复用不应泄漏到模型可见 contract。

专用 Tool 固定的是稳定责任和合法动作，不是专业结论本身。Agent 仍然负责判断是否需要协作、当前问题是什么、应该提供哪些上下文，以及怎样解释对方返回的结果。

如果通信本身面向机器消费者，或者确实需要稳定字段和协议，可以采用结构化信息；开放专业语义仍可保留自然语言。不要为了统一而把所有 Agent 间交流压成同一种通用消息格式。

## 联合示例：Task Lead 如何取得并使用任务信息

以下为教学假设：Task Lead 需要判断 A 所依赖的 B 接口是否可用，已有按引用读取能力。当前设计结果可以具体写成：“Context 给出当前任务及依赖引用；读取能力取得 B 的记录与接口材料；instructions 要求按所需结果的可用条件安排工作；后续工作材料保存判断及来源范围，得到更新时重审受影响的安排。”这些部分共同支持一个职责，单独写一句“正确协调任务”无法补足缺失输入。

在所设计的产品中，Task Lead 取得接口负责人的确认后，应保存“A 所需旧版接口可用”的有据判断及来源，不把它改写成“B 的所有工作都已批准”。Task Lead 恢复工作时仍按当前版本和条件使用。

设计者还需查明宿主实际怎样让 Task Lead 再次取得状态。若变化通知并非现有能力，设计者继续调查可用更新方式，并在设计工作材料中记录这个未完部分；模型结束一次调用，不代表后续更新机制已经存在。

如果调查确认 Task Lead 还需请求一个稳定设计责任提供接口判断，可以考虑专用的“请求接口设计判断”能力，输入说明当前问题和必要背景，输出提供可继续使用的专业结论与依据。具体责任仍以项目为准，不能仅为套用示例新增一个 Agent。底层路由可复用通用实现；模型主要需要理解当前请求会交给谁承担什么责任。

条件若改为“任务是探索未知仓库中的任意文件”，普通搜索和读取能力就可能符合职责；若能力要供外部未知调用方发现，contract 还需自足地表达适用范围。涉及具体模型和运行时的 placement 判断时取得当前资料。将这些取舍与成立条件写入已有设计材料，再回到上层核对调用方是否真能获得必要结果。
