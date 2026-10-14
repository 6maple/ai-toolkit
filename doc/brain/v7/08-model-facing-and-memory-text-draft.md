# 08 · 模型可见文字与 Brain 记忆正文草稿

本文供用户审核文字和归属。以下是中文候选正文，不是已经写入 production 的 Prompt，也不是对当前用户 Brain 的修改。动态 Core、候选描述、相关项目、错误信息由运行时填入；示例路径只有在对应文档确实安装且可读时才出现。

**复核说明**：下文的 Brain runtime 和工具文字仍是候选，供逐句审查。默认记忆包应从真实任务重新设计，`ai-think` 只作参考；包的完整中文候选正文见 [10 · 默认记忆包的重新设计](10-default-memory-pack-design.md)。主动发现与保存的候选触发条件仍按真实场景审查。仅按摘要的语义搜索契约见 [13 · 摘要语义发现](13-body-semantic-search-design.md)；当前生产代码仍按 `description` 建向量索引，需在 Prompt Gate 之后实施。

## 1. 归属与进入时机

| 内容 | 完整正文的维护位置 | 进入模型的时机 |
|---|---|---|
| 本轮 Brain 工作上下文的建立、路径、角色、准确读取和发现协议 | `code/brain` | 每条新用户消息，按实际能力呈现 |
| `brain_think` 的显式调用指令 | `code/brain` | 仅模型负责调用 `brain_think` 的 MCP 模式 |
| 本轮上下文的通用使用说明 | `code/brain` 的同一份上下文正文 | Codex／Claude／DSH 与显式入口使用同一语义，不在宿主前缀另写一份 |
| 工具目的、参数、结果、错误和边界 | Brain 公共工具定义与参数 schema | 对应工具实际暴露时 |
| 通用判断、软件、Prompt 写法、普通用户表达与正式报告写作 | 用户可选择安装的 `brain-ai` 默认记忆包 | 包正文进入 Global memories；Global Core 只增加一行读取包入口的路线，由 `brain-ai/core.md` 按明确任务形态读取专项正文 |
| 当前用户或项目自己的决定、偏好和续作状态 | 对应 Global／Project Core 与 archival 记忆 | Core 每轮出现；正文按触发条件读取 |

这里的“建立本轮工作上下文”指把本轮实际可用的协议、Global／当前 Project Core、相关项目边界和有限候选组织后提供给模型，不表示这些内容一定来自以往任务，也不表示所有相关正文已经读完。首次使用时 Core 可以是空的；普通新任务可以使用已有通用方法；继续旧任务时才需要读取相应的续作状态。“恢复”仅用于准确描述读取先前保存的内容或延续未完成工作。

记忆包的安装位置已经明确：方法正文在 Global memories，Global Core 只添加入口。包的具体内容须先依据真实场景设计和审核，安装器再复制已审核文件，不在安装时改写。与现有 Brain 和 `ai-think` 的关系一样，Brain runtime 自己提供的固定文字只负责建立和读取认知所需的协议；可修订的思考、协作与主动保存方法由用户记忆拥有。runtime 可以呈现用户 Core 的路线，但不因此拥有路线指向的方法正文。写入等工具仍说明参数、效果和错误。

## 2. Brain runtime 的模型可见文字

### 2.1 显式调用 `brain_think` 时的 server instruction

```text
每收到一条新的用户消息，在进行实质理解、规划、回答或调用其他工具前，调用 brain_think，以建立本轮 Brain 工作上下文。直接执行返回内容中的必读指令；其余路线默认读取完整正文，只有明确无关时才跳过，拿不准时读取；取得正文后再按其适用范围使用。成功建立后不重复调用；若调用失败，先看错误与已产生的副作用，再决定是否值得重试。使用仍可用的上下文、Brain 工具或其他来源继续本轮任务；不要把未取得的记忆当成已读。
```

宿主 hook 已经建立本轮上下文时，不向模型提供这条调用指令，也不暴露 `brain_think` 供重复调用。`brain_think` 工具描述与这段文字使用同一来源；工具描述补充“它返回什么”，不建立另一套每轮规则。

### 2.2 宿主的职责

Codex、Claude 的 hook 负责宿主绑定、权限和传输，成功时直接注入 2.3 的 Brain 上下文；DSH 和显式 `brain_think` 入口使用同一正文语义。宿主不另加一段近似的通用判断说明，避免与 Brain 正文重复或分歧。普通安装的文字也不声称“用户明确要求注入”；宿主特有诊断单独呈现。自动建立失败且宿主适配器已运行时，使用宿主可加入模型输入的结果通道提供以下诊断，并让模型继续本轮任务；不能只写 stderr 或日志。若宿主未调用适配器，或不交付其结果，Brain 不能保证模型收到诊断；如实报告这个接入限制，不由 Brain 阻断模型工作。

```text
# 本轮 Brain 上下文未建立

Brain 未能为这条用户消息建立工作上下文：<可公开的简短错误说明>。本轮可能缺少仍有效的决定、约束和续作状态。继续处理用户任务；主动用仍可用的 Brain 工具按准确路径读取，或从对话、项目和其他来源取得依据。只有明确与当前工作无关的内容才跳过，拿不准时取得。仍取不到时说明受影响的判断和具体缺口，不把缺失认知当成已核对。其他可完成的工作继续进行。
```

### 2.3 本轮上下文中的静态协议候选

```text
# 本轮 Brain 工作上下文

## 如何使用

本轮实际提供的 Global Core 和当前 Project Core 是稳定的记忆读取路线；Core 为空时，该范围没有路线可执行。

直接执行 Core 中的必读指令；默认沿其余已提供路线按准确路径读取完整正文，只有明确与当前工作无关时才跳过，拿不准时读取。本轮已经提供的候选记忆同样先按 description 判断对象和范围；明确无关才跳过，拿不准时读取正文。

准确路径读取、续读、超长内容恢复以及失败后的替代获取方式，按本轮实际 Brain 工具说明执行。暂时取不到某项 cognition 时，不把它当成已经读过；继续仍有依据且不依赖缺失内容的工作。

<这里插入本轮 Global Core、当前 Project Core、相关项目及候选描述。运行时应清楚标出来源与路径。>

## 记忆的角色

Decision 是相应决定者已明确作出的选择，在其对象和范围内使用；模型建议或推断不会因为进入 Brain 而成为用户决定。

Knowledge 是在正文所记条件和依据范围内可用的认识；条件改变时重新判断。

Intention 是仍需继续的目标或承诺；按正文的当前状态继续。

Skill 是带有适用条件的可复用方法；条件成立时按正文使用。

搜索命中、最近修改时间或进入本轮候选，都不会自动改变 cognition 的角色或 authority。

## 候选与发现

本轮候选只表示运行时认为它们可能相关，不表示已经验证适用。需要它们指导当前工作时读取完整正文，再按正文的对象、条件、依据和当前状态使用。

已知准确路径时直接读取；需要发现其他历史 cognition 时，使用本轮实际提供的发现工具。各发现工具的适用方式、搜索范围、结果限制和失败退路以对应工具说明为准。

<这里插入本轮实际工具表对应的发现能力分支。>

## 范围与相关项目

Global cognition 跨项目继续使用；Project cognition 用于对应项目。

相关项目的普通 cognition 可以通过本轮实际提供的发现能力取得；相关 Project Core 不自动加载。准备依据某个相关项目的当前状态作判断或处理其文件时，按本轮提供的准确路径读取该项目 Core，再使用其中适用的路线。
```

<这里插入...> 是设计稿占位，不会原样进入模型。最终 renderer 把静态读取说明与真实投影组合，并根据本轮是否暴露 `brain_ask_search` 插入以下其中一段能力说明。Harness 只拥有稳定的读取与工具接口语义；主动 recall 的认知触发、搜索目的和搜索前后判断由适用的用户记忆方法负责。

**本轮工具表列出 `brain_ask_search` 时：**

```text
本轮提供 brain_ask_search，可在没有准确路径且需要按语义发现历史 cognition 时使用；已知正文词句时使用 brain_grep，已知路径、目录或文件名模式时使用 brain_glob。发现结果是候选，material 判断需要正文时继续用 brain_cat 读取完整内容。
```

**本轮工具表没有 `brain_ask_search` 时：**

```text
本轮未提供 brain_ask_search。需要发现历史 cognition 时，按已知正文词句使用 brain_grep，按 scope、角色、目录或文件名线索使用 brain_glob，再用 brain_cat 读取选中的完整正文。
```

### 2.4 公共工具主描述候选

下表是每个工具的主 description 草稿。全部参数字段、结果边界和条件呈现的中文候选见 [15](15-complete-model-facing-contract.md)；路径语法、分页、覆盖后果和状态变更等重要细节保留在对应字段附近。

| 工具 | 中文主描述草稿 |
|---|---|
| `brain_think` | 建立本轮 Brain 工作上下文。仅在模型负责显式调用的模式暴露；每条新用户消息后、其他实质行动前调用，使用返回的 Core、候选和诊断。成功后不重复调用；失败时根据错误与副作用判断是否重试，并继续可完成的工作。 |
| `brain_cat` | 按准确路径读取一份 Scope Core 或 archival 记忆。结果按稳定的 1 起始逻辑行分页；返回 `next_offset` 时从该位置续读。archival 结果包含当前可用的争议状态。 |
| `brain_ls` | 已知记忆目录时列出直接子项。结果有限且不可分页；根据路径、描述和状态选出要读的正文。被截断时缩小范围或改用其他发现工具。 |
| `brain_glob` | 已知 scope、角色、目录或文件名线索时，按完整公开路径匹配活跃 archival 记忆。返回的是有限候选；命中后按路径读取正文，截断时缩小范围重查。 |
| `brain_grep` | 已知词句或文本模式时，在活跃 archival Markdown 中查找匹配片段，包括正文。片段用于定位；需要完整内容和条件时按路径读取正文。结果截断时缩小范围重查。 |
| `brain_ask_search` | 需要按意思寻找尚无准确路径的历史认知，且本轮提供该工具时，用自然语言描述当前对象、动作与要找的过去决定、约束或经验。只搜索活跃 archival 记忆的 `summary`，按记忆返回有限候选；每条显示路径、说明何时值得读取的 `description`、概括正文认识的 `summary` 和可用的争议标记。记忆缺少摘要或细节只在正文中时可能漏掉；相似度排名和摘要都不判断当前适用性，未出现也不证明不存在。默认用 `brain_cat` 读取候选的完整记忆与当前争议；只有明确无关时才跳过，拿不准时读取。查找正文中的明确词句用 `brain_grep`，枚举路径模式用 `brain_glob`。 |
| `brain_absolute_path` | 将有效的 Brain 公开位置映射为供文件工具使用的绝对路径。只返回路径，不读取或创建目标；也不保证目标存在。 |
| `brain_write` | 在准确的 archival 路径创建新认知，或有意以不同认知替换原有内容。替换不会继承原记忆的争议和学习连续性；修订同一认知用 `brain_edit`。此工具不写 Core。 |
| `brain_edit` | 修订一份已有 Core 或 archival 记忆并保留其身份。Core 只保存每轮必须直接可见的少量指导与稳定读取路线，详细方法放在 archival。非空 Core 使用准确匹配的 `edits`；空 Core 才能用 `content` 初始化。更新 archival 的结论且影响概述时同步更新 `summary`，适用条件变化时同步更新 `description`。 |
| `brain_mv` | 将同一份 archival 记忆移动到另一准确路径，保留身份与适用的连续状态。目标已存在时会被替换，先检查目标；不移动 Core 或目录。 |
| `brain_rm` | 删除一份准确路径上的活跃 archival 记忆。成功后它不再参与每轮候选呈现、发现或准确读取；不删除 Core、目录或配套文件。 |
| `brain_feedback` | 对现有活跃 archival 记忆记录已验证的成功使用、当前未解争议，或解除已解决争议。只改变学习／争议状态，不改写正文、描述、重要性或路径；各 `feedback` 值的成立条件以参数说明为准。 |

主描述刻意把“何时使用”放在动作发生的位置。路径合法形式、frontmatter、`feedback=adopt/question/resolve` 的具体条件、`brain_edit` 的 exact 匹配要求继续由参数字段准确说明，不能因主描述变短而删除。

### 2.5 关键参数字段的文字候选

以下字段直接影响模型是否能完成动作，不能只在本轮上下文的总说明中说明。

| 字段 | 中文描述候选 |
|---|---|
| `brain_cat.offset` | 从哪一条逻辑行开始读取；省略时从第 1 行开始。续读时传入上次结果返回的准确 `next_offset`。超过文档末尾时返回空行集且没有后续位置。 |
| `brain_cat.limit` | 本次最多请求的正整数逻辑行数；省略时使用工具默认值。传输预算可能使实际返回行数少于请求值；以结果中的 `next_offset` 判断是否还需续读。 |
| `brain_ask_search.query` | 用自然语言说明“当前对象和动作＋要找的过去决定、约束或经验”；不要机械复制用户消息。只根据记忆的 `summary` 语义发现；结果是有限候选，重要内容需再按路径读取。 |
| `brain_write.content` | 一份完整 archival Markdown；frontmatter 写明非空 `description`（何时应读）、`summary`（正文的当前认识及重要边界）和 `importance`，并提供非空正文。写入已存在路径会以不同认知替换它；修订同一认知使用 `brain_edit`。缺少摘要的旧记忆仍可读取和文字搜索，但不参加仅按摘要的语义发现；此处的填写要求不新增 schema 拒绝门槛。 |
| `brain_edit.edits` | 对当前原文作精确替换；每个 `oldText` 必须在同一份原文中恰好出现一次，替换范围不能重叠。非空 Core 必须使用此字段，整个 Core 重写时以完整当前原文作为一个 `oldText`。任何一项匹配失败，本次替换都不生效。 |
| `brain_edit.content` | 同一份现有记忆的完整修订正文。只有空 Core 可用此字段初始化；其内容限于每轮必须直接可见的少量指导及稳定读取路线。archival 可用它整体修订，保留完整 frontmatter；每次更新核对 `description` 和 `summary` 与正文一致，旧记忆缺少摘要时据正文补写。此处的填写要求不新增 schema 拒绝门槛。 |
| `brain_feedback.feedback` | `adopt` 只记录在适用条件内经真实行动和结果验证的成功使用；`question` 记录仍未解决且有具体依据的重要争议，需同时给出完整 `challenge`；`resolve` 只解除已解决的当前争议，正文认识改变时先用 `brain_edit` 更新。读取、提及或计划使用不构成 `adopt`。 |

当前 renderer 允许少量直接指导，`brain_edit` 的主描述及 `content` 参数又强调 Core 中只保留最小触发条件、路径和用法。新包拟向目标 Global Core 增加一行入口，无需为记忆包改变 Core 的维护规则；renderer 与工具描述之间其他实际矛盾仍需按工具语义审查。

## 3. 可选默认记忆包的正文入口

### 3.1 新设计的正文与唯一 Core 入口

首包候选名为 `brain-ai`，表示供 AI 使用的 Brain 默认工作记忆。完整的设计依据、六份正文、frontmatter 与相对路径见 [10](10-default-memory-pack-design.md)。`ai-think` 只作为检查经验与遗漏的参考，不能原样充当默认包。安装器只复制经过审核的包文件。

目标 Global Core 只增加一行；目标已有同一行时报告无变化，保留 Core 的其他内容：

```text
- 立即读取 `@global/memories/skill/brain-ai/core.md` 的完整原文。继续按正文完成本轮相关读取，再使用适用的方法形成并说明工作方向。
```

这条路线在每轮进入模型；`brain-ai/core.md` 直接提供跨任务判断和协作方法，并读取普通用户表达正文，再按软件、Prompt 写法或正式书面成品任务读取对应专项正文。研究文档中的 Universal／Collaboration Root 是设计参考，不额外插入 Global Core。

### 3.2 当前用户 `ai-think/software/core.md` 的增补判断

当前用户的 `ai-think/software/core.md` 已说明需求、设计、测试和实现各自能证明什么。这个观察可帮助审查新包有无遗漏，不能代替从任务目标独立设计新包。眼下不对该现有正文补丁式增写；新包的软件正文在 10 中完整给出。若用户人工使用仍观察到旧材料压过新目标，再辨别模型是没读到方法、读到却没执行，还是没有取得当前事实。

### 3.3 当前用户 Brain 的修订草稿与保留项

当前用户的 Global Core 有自己的 `ai-think` 入口；3.1 是拟给新包用户增加的一行，不能说它已经在当前用户的 Core 中。若当前用户以后也安装新包，安装器只按目标路径和包入口检查冲突，不替换已有 `ai-think` 路线；其他方法记忆怎样并用由安装者自行查看。记忆包没有更新命令。

当前 Project Core 的 Brain v7 续作路线继续指向 `@project/memories/intention/brain-base-cognitive-harness-redesign.md`。该 intention 的压缩正文候选如下；它保留当前目标、有效决定、验证边界和下一步，把逐次实验过程留在研究文档及原始日志：

```text
---
description: 继续 Brain Base / v7 架构、模型可见文字、记忆包或 production 实施方案讨论时读取。
summary: 在做对、做准的约束下设计模型使用的 Brain 连续性、检索与维护能力；当前仍处于 v7 架构和模型可见文字审核阶段，完整批准后才进入生产实施。
importance: high
---

# Brain Base / v7 当前工作

目标：在“做对、做准”的约束下，让模型借助 Brain、宿主和工具更自主、省事地完成任务。模型是实际任务主体；Brain 负责认知连续性、准确发现与维护，不把模型的自信、连贯叙述或检索命中当作现实证明。

当前阶段：v7 架构与完整模型可见文字讨论。Base 只保存用户跨版本的根目标和认识论纪律；v7 保存当前证据、解释、方案与未决项。生产 Prompt 尚未整体批准。

已确认方向：每条新用户消息前建立确定性的 Brain 认知入口；Global／当前 Project Core 承担稳定路线，相关项目 Core 按实际进入条件读取；重要结论所需正文准确读取；活跃工作有跨会话入口；用户可选择安装重新设计的默认记忆包，包名与正文仍待审核。`brain-cli` 代码位于 `code/brain-cli`，顶层安装／更新只针对 Agent 的 Brain MCP 接入，由参数指定 Agent 和本地目录或 GitHub 来源；语义搜索另行管理；记忆包只有安装命令。CLI 的导出流程由 CLI 自己负责，Brain 包提供可复用原子能力。Global 记忆导出保留相对路径。

证据边界：Universal／Collaboration Root 的中文研究候选已获“可以”作为后续设计输入；路由文字与领域覆盖仍需继续收敛。现有网页试验和工具回放只提供局部观察，尚未证明弱模型在真实 Brain 工具条件下完整遵循。细节见 `doc/brain/v7/research/09-prompt-body-writing-review.md` 与 `10-stable-route-and-coverage-review.md`。

当前待办：审核 Brain runtime／工具描述／可选记忆包的完整中文正文；确定安装物及 CLI 调用 Brain 原子能力的方式；明确活跃路线故障后的可恢复边界。模型实际使用效果由用户人工验证；协助者提供可检查的候选文字、场景和静态证据，不自行运行模型回放。完整 Prompt 经用户逐份审核并明确批准后，才修改 production Brain、宿主接入、工具或当前用户 Brain 正文。当前讨论稿见 `doc/brain/v7/07-code-and-cognition-change-proposal.md` 与 `08-model-facing-and-memory-text-draft.md`。
```

这份压缩不删除旧结论的证据：原研究、日志及阶段性判断仍留在各自 owner。应用到 live Brain 前需再次核对当时已完成进度和新决定；这里只是文字草稿。

`@project/memories/decision/related-project-memory-discovery.md` 只需修订已失效的 scope 句子，其他排序、权限和相关 Core 边界保持其原有决定：

```text
- brain_glob / brain_grep 不传 path 时，搜索唯一的 Global、当前 Project，并合并所有 available relatedProjects 已经 materialize 的 @project/memories/；某个 related 仅已注册、尚未创建 Project cognition 时，在默认搜索中贡献空结果，显式 #alias/memories/... 仍保持原有 not-found。
- Global 只有一份；relatedProjects 只增加各自的 Project memories，不增加 related-specific Global。
```

## 4. 审核时需要特别判断

1. 10 中当前六份默认记忆正文是否覆盖真实任务失效，且入口及内部引用准确可读；目标 Global Core 是否只需 3.1 的一行入口。
2. 2.3 的静态协议是否清楚地把 Core 路线、候选描述、完整正文和运行时工具能力区分开；哪些内容应留在工具字段附近。
3. 现有软件方法已写明旧材料的一致性边界；人工使用时仍需观察它是否实际被读到并用于“旧材料一致而用户提出模糊新功能”的任务。
4. 新包的必读入口是否完整承担承重的证据与协作关系，能按可观察的任务类型触发专项记忆，并使已授权的小任务继续执行；实际模型效果由用户人工验证。
5. 工具主描述与 [15](15-complete-model-facing-contract.md) 的全量参数字段、真实返回及错误逐项比对后，再确定 production 最终文字。模型使用效果由用户人工验证。
6. “重要方案实施前等待用户回应”是否会错误覆盖用户已经授权的功能修改；推荐的收窄文字及依据见 09。

OpenAI 官方文档建议给出清楚的目标和相关上下文；推理模型的指导也强调直白表达、必要的分隔和目标约束。这支持本稿按归属分段，不证明这些具体候选已经有效。后续模型效果由用户人工验证。[Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering) · [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)
