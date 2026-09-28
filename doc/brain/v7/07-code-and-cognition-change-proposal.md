# 07 · Brain 代码与认知内容改造方案（讨论稿）

本页保留方案形成过程。生产修改前的最新实施契约见 [14](14-implementation-contract-review.md)；完整中文模型可见文字由 [08](08-model-facing-and-memory-text-draft.md)、[15](15-complete-model-facing-contract.md) 与 [10](10-default-memory-pack-design.md) 合成。若本页仍把某项写为“待确定”，以 14 的当前候选及用户后续裁决为准。

本文把 [当前架构](06-current-architecture.md) 落到 Brain runtime、可选记忆包、辅助 CLI 和现有 Brain 认知文档，供方案讨论。它是设计候选；中文正文草稿见 [08 · 模型可见文字与 Brain 记忆正文草稿](08-model-facing-and-memory-text-draft.md)，仍须逐段审核。

对本文的机制与格式假设，另见 [09 · 真实场景与最小改动复核](09-grounded-design-audit.md)。已确认的用户要求与未经验证的实现选项应分别对待。

## 1. 当前实现与要解决的落差

当前 `AnchorRestore.runAnchor()` 在每轮读取 Global／当前 Project Core、挑选有限数量的 archival 描述，并交给 `renderAnchorContext()`；`restoreProductionBrainContext()` 让宿主 hook 复用同一路径。Codex、Claude 的 `UserPromptSubmit` 各自又在结果前附加相近但不同的 `brainThinkInstructions`；DSH 则直接注入 `brain_think` 的结果。因而不同宿主实际看到的通用指令不完全相同。

当前 renderer 同时承担 Core、相关项目、archival 候选、认知角色、保存维护、语义搜索等说明。`L0_MAX_CANDIDATES = 10` 和 8192 UTF-8 字节预算只适合被动候选描述，不能被解释为完整稳定路由或活跃工作的上限。Core 当前作为完整文本进入上下文，这正好可作为 Global／Project 的动态稳定路由面；按路径发现的其他记忆仍需准确读取正文。

现有 `@global/core.md` 用一行指向当前用户的 `ai-think/core.md`，再由该记忆路由到推理、表达、软件等方法；`@project/core.md` 指向 Brain v7 当前工作。这说明一行 Core 入口可以路由到 Global memories，但不决定可选默认记忆包的内容。默认包须从目标任务重新设计，`ai-think` 只作参考；候选见 [10 · 默认记忆包的重新设计](10-default-memory-pack-design.md)。现有 `brain_ask_search` 文案要求在“理解任务后”搜索；若信息需要靠稳定 route 才会被想起，搜索不能承担该 route 的责任。

## 2. 建议的责任与投影

| 内容 | 单一维护位置 | 本轮怎样进入模型 |
|---|---|---|
| 每轮 Brain 工作上下文的建立、路径、角色、准确读取和维护协议 | Brain runtime 的 model-facing 文本及公共工具契约 | 由同一份本轮上下文和实际可用工具表呈现 |
| 通用判断、协作、软件与可执行文本方法 | 可选 `brain-memory-packs/brain-ai` 候选，准确正文见 10 | 用户选择安装后，按包内相对路径复制正文；目标 Global Core 只增加一行指向包入口的路线 |
| 当前用户的跨项目路线和特定方法 | `@global/core.md` 与其指向的 Global archival 文档 | Global Core 原文常驻；触发后 `brain_cat` 读取正文 |
| 当前项目的规则与活跃工作入口 | `@project/core.md` 与 Project archival 文档 | Project Core 原文常驻；触发后 `brain_cat` 读取正文 |
| 领域所需的资料范围、步骤和停止条件 | 对应领域 skill／workflow 正文 | 由稳定路线触发准确读取；没有稳定地址时主动发现 |
| 当前工具的参数、分页、错误和能力可用性 | 公共 Tool Contract 与宿主绑定 | 工具描述和实际工具表；正文只写完成动作所需的短指引 |
| 来源、路径、候选状态、宿主诊断 | Brain 运行时生成的数据 | 本轮投影，不能由静态 Prompt 假造 |

这个包由用户主动选择安装。包内方法从真实任务与失效方式设计，不能把当前用户的 `ai-think` 目录当成默认正文；10 给出逐字可审的候选。安装器只复制已审核的包文件，不临时筛选或改写。未安装该包的 Brain 仍应完整支持 Global／Project cognition；runtime 只承担自己实际实现的协议责任。产品对协议文本的版本管理与用户对已安装记忆的后续维护分别处理。

## 3. 代码修改顺序

### A. 先冻结可执行 Contract 与 Prompt

分别核对两套材料：Brain runtime 必需的 model-facing 协议文字，以及重新设计的默认记忆包正文与一行 Core 入口。研究候选与 `ai-think` 可提供参考，不能自动成为包内容；稳定路由的工具使用协议仍由 Brain runtime 拥有。每段标明正文 owner、注入／读取条件、实际工具名和变量。产物须包括空 Core、安装包后、已有其他用户记忆时的完整样例投影，并核对必要内容读不到时怎样处理，以及已授权任务中的协作边界。

### B. 每轮建立一份工作上下文

- `application/anchor-renderer.ts` 负责把结构化的当前投影与 Brain 建立、读取所需的协议文字组合；审查其角色解释、搜索引导、现有维护方法和当前 `ai-think` 特定例子，把可演进的思考与主动保存方法留给用户记忆。
- `application/anchor-restore.ts` 保留 Global／Project Core、被动候选和 checkpoint 的现有机制。明确被动候选有限集与稳定 Core 路由的语义区别，继续报告候选截断／字节预算的真实范围。
- `runtime/production.ts`、`integration/mcp-adapter.ts` 与 `integration/server-instructions.ts` 维持宿主 hook 和显式 `brain_think` 两种入口共享同一份 Brain 上下文；显式入口仍要求每个新 user turn 调用一次。
- Codex／Claude hook 移除各自重复的通用判断文字，只保留宿主传输、source root 绑定和权限状态职责。DSH 继续走相同 Brain context。若某宿主需要额外包装，其作用和优先级需体现在宿主 Contract 中。
- `integration/public-tools.ts`、参数 schema 描述、`integration/server-instructions.ts`、renderer 和宿主 hook 一起审查。工具描述保留使用该工具必须知道的参数、结果、分页、错误和状态语义；把可选的通用工作方法放在记忆包。向模型推荐的工具必须在本轮工具表中实际存在；语义搜索初始化失败时，不应继续给出无条件可用的指令。`brain_cat` 的 `next_offset` 必须能完成准确续读。

### C. 路由与活跃工作完整性

继续使用 Global／Project Core 的自然语言路由；一条承担稳定可达责任的路线须包含可识别触发条件、准确目标路径和使用范围。多个触发条件可以同时成立。相关项目的普通记忆仍可发现，相关 Core 仍按项目实际进入条件读取。

初始迁移尽可能按“先写完整 archival 正文 → 核对可读 → 对需要补充的 Core 路线做 exact edit → 再核对从 Core 到正文”的顺序执行。工作结束时，保存仍有效的长期结论，按实际需要移除过期路线。迁移检查目标存在、`brain_cat` 可读、描述与正文匹配，并检查仍承诺跨会话继续的工作有入口。并发或失败时 exact edit 不能静默覆盖较新的 Core；把已完成内容、未完成步骤、准确路径和修复办法交给模型，模型继续可完成的工作。

这套步骤目前只能使迁移可检查、可修复，尚不能机械保证任意时刻路线与正文原子一致。若真实并发或故障显示这影响跨会话续作，再确定是否需要结构化路由登记或协调写入，不能只靠 Prompt 承诺额外保证。被动 top-k 不能代替仍承诺可达的活跃路线；若实际路线数量超预算，先量测并决定怎样保留可达入口及报告限制。

当前先用现有 Core 路线与迁移后的可读检查满足已知续作需求。结构化 active-work 登记属于故障或规模证据出现后的备选方案：若实际并发、断链或路线数量证明现有做法不足，再量测活跃工作数量、更新频率和现有协调器的边界，确定是否需要登记和协调写入。不能把备选方案写成已经决定的生产机制。

## 4. 可选记忆包与辅助 CLI

`brain-memory-packs` 是可选记忆包的暂定目录名。首包候选名 `brain-ai`，表示供 AI 使用的 Brain 默认工作记忆；从任务目标和真实失效方式设计，不复制当前用户的 `ai-think`。完整的设计依据和逐字正文见 [10](10-default-memory-pack-design.md)。候选文件集合为：

```text
memories/skill/brain-ai/core.md
memories/skill/brain-ai/software.md
memories/skill/brain-ai/instructions.md
```

安装器只给目标 `@global/core.md` 加这一行；目标 Core 的其他内容保持原样：

```text
- 立即读取 `@global/memories/skill/brain-ai/core.md` 的完整原文。继续按正文完成本轮相关读取，再使用适用的方法形成并说明工作方向。
```

安装前核对包内所有引用可读；`brain-data/global/.state/` 是当前用户的运行状态，不复制到包。安装后，正文在用户自己的 Brain 中正常维护。记忆包只提供安装命令，不提供更新命令。顶层 `install/update --agent ...` 仅管理 Agent 的 Brain MCP 接入；语义搜索的安装与更新另用 `semantic-search` 子命令。

每轮常驻的是 Global Core 的一行入口；包入口 `core.md` 直接承担跨任务的证据与协作方法，再按可观察的任务类型指向软件或可执行文本正文。小而明确的任务不强制加载专项记忆。实际读取路径和效果由用户人工观察，不能仅凭正文推定模型一定遵循。

`brain-cli` 是供用户及模型调用的辅助入口，代码统一放在 `code/brain-cli`。这里的顶层 `install`／`update` 明确指 Brain MCP：用 `--agent codex` 这类参数选择安装或更新到哪个 Agent，并处理该宿主所需的 Brain 接入。CLI 还管理语义搜索运行依赖的安装／更新、记忆导入、Global 记忆导出和可选记忆包。可附带面向模型的 `SKILL.md` 或 `llm.txt`，只说明 CLI 已实现的命令及结果。现有 `code/brain` 的 `brain` 命令用于启动 MCP；Brain Web 集成留到后续阶段。

记忆导入先检查整批目标：原路径没有内容时列为待写入，正文与可用的争议说明相同时报告无变化，同一路径已有不同内容时整批失败并列出冲突。没有冲突后才写入；同时检查正文格式、Core 容量和路径范围，不自动合并或覆盖。不同路径的正文是否在语义上矛盾，CLI 无法可靠地从文件名或 hash 判断，结果中不声称完成这种审查。记忆包安装另外检查它要加入的 Core 路由和目标路径。

记忆包安装的冲突检查以当前目标内容为准。Core 非空时仍遵守 exact edit，空 Core 按现有初始化规则写入一行入口。安装优先复用现有受协调的写入机制，不为 CLI 另建一套长期状态管理。

当前的“导出记忆”只处理 Global scope 的 Core、archival 正文及正文依赖的配套文件。产物内保留相对于 Brain root 的路径，例如 `global/core.md` 和 `global/memories/...`；正文中的 `@global/...` 路径也不改写。Global 仍可能包含个人偏好等私人内容，导出结果应列出文件清单供用户检查。

当前实现把 archival 的 `challenge` 放在 `.state` companion 中。导出时，能读取到的有效争议说明随正文保存；状态文件损坏或与正文不匹配时，按 Brain 当前读取结果继续导出，并向用户警告该路径的争议状态无法确认。导出不会因为这类状态异常中止，也不复制运行期学习计数。

### CLI 命令与数据格式候选

导出物先采用普通目录，保留 `global/core.md` 和 `global/memories/...` 的相对路径。可用的争议说明随其正文和现有配套状态保存；运行时的学习计数、Git 历史和语义索引不进入导出物。Global memories 下若有正文使用的普通配套文件，也按原路径导出。导入只接受 Global 范围内的安全路径。是否还需要 `manifest.json`，须等现有配套文件的实际导入方式明确后决定。Global 导出是用户记忆的迁移产物；默认记忆包仅安装自身经过审核的文件及一行入口。

命令形式建议如下；安装和更新均显式给出来源。`--agent` 选择 Brain MCP 要接入的宿主，语义搜索运行依赖则由 Brain 共用：

```text
brain-cli install --agent codex --source local --path <ai-toolkit目录>
brain-cli update --agent codex --source local --path <ai-toolkit目录>
brain-cli install --agent codex --source github --repository <GitHub仓库URL> [--ref <tag或commit>]
brain-cli update --agent codex --source github --repository <GitHub仓库URL> [--ref <tag或commit>]
brain-cli semantic-search install
brain-cli semantic-search update
brain-cli memory export --output <目录>
brain-cli memory import <目录>
brain-cli pack install <包名>
```

导入报告“新建／无变化／冲突”；发现冲突时列出路径并停止写入。

记忆包声明包名、这些准确相对路径及 Core 的一行入口。安装只处理用户指定的包；先检查全部目标与 Core：缺失的文件列为复制，已有且正文完全相同的列为无变化，已有不同正文时整次安装失败并报告路径。Core 已有准确同一行时不重复添加；已有指向同一路径但文字不同的路线时报告冲突；其他现有路线保持原样。全部检查通过后先写记忆，再按现有 Core 规则添加入口：非空 Core 使用 exact edit，空 Core 用 `content` 初始化这一行。最后核对该入口可读取 `brain-ai/core.md`；中断时报告已完成步骤，不声称跨文件原子性。

以上是命令形态候选。用户已确认 GitHub 仓库来源必须显式输入，尚未决定 `--ref` 是否必填；无论采用哪种参数形式，结果都应报告实际取得的版本。

记忆包不提供更新命令；已安装正文由用户的 Brain 维护。安装不要求额外版本记录或内容指纹，也不自动改写用户已经维护的记忆。

CLI 调用 Brain 导出的原子读写能力完成校验和写入协调，避免在冲突检查之后被另一宿主抢先修改目标；整批导入、清单生成和导出流程由 CLI 自己组织。导出是只读操作，不创建 Project Core 或 Git 仓库。配套文件若无法随正文可靠导入，应列出具体文件并说明限制，不默默遗漏。

### Brain MCP 与语义搜索的安装

`brain-cli install --agent <名称>` 安装 Brain MCP 到指定 Agent，`update` 更新同一接入。对于 Codex、Claude 这类由插件自动建立本轮 Brain 上下文的宿主，安装应包含对应的 MCP 与 hook，并在宿主自动建立时隐藏 `brain_think`；使用普通 MCP 接入的宿主则按显式调用契约暴露它。`--agent` 只选择接入目标，不选择 Brain 记忆 scope。命令先识别当前安装，再按该宿主真实支持的方式操作，结果说明安装位置、版本、是否需要重启，以及宿主还需要用户完成的信任步骤。

`local` 模式读取参数指定的 ai-toolkit 目录，`github` 模式读取参数指定的 GitHub 仓库及版本；两种模式都不能静默改用当前工作目录或某个默认仓库。CLI 要识别来源内 Brain MCP 和目标 Agent 接入文件，安装／更新后报告实际来源与版本。目前 Codex、Claude 插件仍是依赖当前 checkout 的本地开发包，DSH 插件依赖相邻的 Brain 包；跨机器的 GitHub 安装还需要把这些本地接线变成可在目标机器生成或使用的安装物。

`brain-cli semantic-search install/update` 直接拥有语义搜索的安装逻辑：把现有 `code/scripts/install-brain-semantic-search.mjs` 的 Python 检测、环境与模型安装、重复运行判断和健康检查移入 `code/brain-cli`，两个命令共用“确保 CLI 所带版本已安装且健康”的过程。已安装且健康时报告无变化；版本变化时安装新版并检查结果。完成迁移后，README 和运行时的安装提示统一指向 CLI 命令，旧脚本不再作为独立入口。安装依赖后仍由 `~/.brain-data/config.json` 决定是否启用；配置在 Brain host 启动时读取，CLI 提示需要重启的 Agent。

CLI 保持直接的命令结构：解析命令、执行对应的 Brain MCP 接入或文件操作、报告结果。`--agent` 仅决定安装位置；Global 导出复制内容并列出文件，导入先列出路径冲突再写入。Brain 包只导出可复用的原子能力，CLI 自己组合导出、导入和安装流程，不另外建立通用安装框架或独立状态系统。

`code/brain-cli` 统一放 CLI 入口、子命令实现、CLI 自身的安装资源、面向模型的命令说明及对应构建和验证代码。它作为独立目录交付 `brain-cli` 命令，并以仓库内的 `brain: "link:../brain"` 依赖使用 Brain 包；`code/brain` 继续负责 MCP 服务和可复用的原子读写能力，现有 Agent 插件目录仍负责各自的宿主接入代码。CLI 自己拥有整批导出、导入和安装流程，不把 CLI 用例搬入 Brain 包。各 Agent 接入文件怎样随来源安装到目标机器，仍需结合实际宿主核对。

模型与用户应调用同一操作语义。面向模型的说明可由 CLI 一起提供，但不能另写一套与命令实际行为不同的“模型专用”规则。机器可读结果与人类可读错误都应准确区分冲突、格式错误、目标不可用以及执行中断。

### 模型可见文字的逐处审查

| 当前 owner | 已观察到的文字职责 | 审查重点 |
|---|---|---|
| `application/anchor-renderer.ts` | 当前有 Core、角色、候选、维护、搜索、相关项目的每轮说明 | 去掉当前用户 `ai-think` 路径的内置例子与代码自有的思考、主动保存方法；保留建立与读取协议、必要的角色及状态解释 |
| `integration/public-tools.ts` 的描述与参数 schema | 每个工具的适用时机、目标、参数、结果和错误语义 | 逐工具核对实现，尤其 `brain_cat` 的续读、`brain_write`／`brain_edit` 的身份语义、`brain_feedback` 的成立条件、搜索结果只是候选，以及按实际能力暴露的 `brain_ask_search` |
| `integration/server-instructions.ts` 与 `brain_think` 描述 | 显式调用模式的每轮调用要求 | 与宿主 hook 自动建立上下文的模式保持一致；不让模型重复调用；保持“每轮”与 source root 绑定的实际条件 |
| Codex／Claude hook 的 `brainThinkInstructions`、DSH 注入 | 宿主给模型的本轮 Brain 上下文 | 移除互相不同、且与 Brain 正文重复的通用说明；复核“用户明确要求”一类措辞是否真实适用于普通安装；保留宿主特有的接线和失败诊断 |
| `brain-cli` 的 `SKILL.md` 或 `llm.txt` | 给模型的辅助命令用法 | 只描述实际存在的命令、冲突失败、输出和副作用；版本与命令实现同步 |

审查结果应给出每段文字的原文、适用条件、目标动作、当前实现依据与拟修订正文。结构化工具字段与实际输出由工程检查核对；模型是否准确遵循路线和读取要求，由用户在实际使用中人工验证，本方案不安排协助者运行模型回放。

## 5. 现有 Brain 内容怎样改

| 当前文档 | 建议动作 | 保留的关系 |
|---|---|---|
| `@global/core.md` | 安装新包时只增加指向 `brain-ai/core.md` 的候选入口，检查重复和冲突；其他 Core 路线继续有效。 | 安装不覆盖整个 Core；当前用户已有的 `ai-think` 路线不是新包来源。 |
| 默认包的三份 Global memories | 按 [10](10-default-memory-pack-design.md) 的完整候选正文审核后制作包文件；检查描述、触发条件和内部引用。 | 跨任务判断在必读入口；软件与可执行文本方法按任务类型读取。 |
| 当前用户的 `ai-think` 记忆 | 保留为现有用户认知及设计参考。若要修订它，另按真实使用问题逐份审查。 | 新包不自动迁移或改写已有个人记忆。 |
| `@project/memories/intention/brain-base-cognitive-harness-redesign.md` | 先核对当前目标、已确认边界、进度、未决项和证据路径是否都有可读入口；只有确认不损失续作所需信息时再压缩。 | 当前未获整体 production Prompt 批准、回放只观察到局部选路、用户要求控制变量等重要限制。 |
| `@project/core.md` | Brain 工作未结束时保留准确续作路线；方案转成实施后，让入口指向当前 continuation owner。 | 其他 GUI、DSH 路线不因本次 Brain 改造被覆盖。 |
| `@project/memories/decision/related-project-memory-discovery.md` | 复核旧正文中“global、当前 session、当前 project”的描述；以当前 Global／Project 两层模型和实际 discovery 实现修订失效的 scope 文字。 | 相关项目普通记忆的发现规则、权限与排序约束继续有效；相关 Core 不自动加载。 |

每一项先保存原文与 exact path，标出“原判断仍有效／条件改变／旧实现事实／仅是试验观察”；同一 cognition 用 `brain_edit` 更新，改了适用范围同时改 `description`。Global／Project Core 非空时只用 exact edits。可选记忆包与当前 live Brain 是两份不同产物：修订包不自动改写用户已有记忆。所有当前用户记忆修改都要在前述 Prompt 与方案审核后按真实文本逐项执行，不把研究候选直接升级成既定规则。

## 6. 验收与剩余裁决

1. **投影**：无可选包、安装候选 `brain-ai`、用户另有记忆三种状态下，显式 `brain_think`、Codex、Claude、DSH 都呈现 Brain 拥有的适用内容和相同使用语义；宿主绑定正确，同一 turn 不重复建立上下文，新 user turn 必建立。宿主需要的包装是否逐字相同仍待实际接入核对。工程检查核对 Core、path、status、`next_offset` 和能力条件；模型实际使用效果由用户人工验证。
2. **可达**：真实工具表中能按 Global／Project 路线读取准确正文；相关项目的路由边界正确；工具不可用、路径坏、结果截断有可见诊断。有限候选的未命中不被当成不存在。
3. **连续性**：跨会话从当前 Project 路线恢复多项活跃工作的正确状态；新增、完成、并发编辑与失败重试后路线和正文可检查；被动候选预算不吞掉承诺续作的入口。
4. **行为**：供用户人工验证的场景涵盖旧材料与模糊功能、明确小改动、相关项目、检索失败、用户改变决定、真实代码运行结果。需要判断提示词效果时，由用户决定是否对照同模型、同工具、同场景下 Root／Route／领域方法的组合，并观察实际提供的上下文、工具选择、正文读取、行动、结果和用户负担。一次网页对话或单次选路不构成整体有效性证明。
5. **CLI 与记忆包**：按 `--agent` 安装／更新 Brain MCP 后能在该宿主正确建立每轮 Brain 上下文；语义搜索依赖安装后通过健康检查，启用配置与重启提示清楚；默认包安装复制经审核的三份候选正文、只增加一行 Global Core 入口，遇到路径冲突会停止；记忆包没有更新命令；Global 导出再导入保留相对路径和有效争议说明，状态文件损坏或失配时给出警告并继续。

进入生产前仍需确定：

- 本地目录和 GitHub 仓库两种显式来源怎样提供可安装的 Brain MCP 与 Agent 接入文件，如何识别和更新已安装版本。当前 Codex／Claude 插件依赖本地 checkout 生成的接线文件，DSH 插件依赖相邻的 Brain 包，不能直接当成可移植安装物。
- Brain 包需要导出哪些最小原子能力供 `code/brain-cli` 通过 `link:../brain` 依赖调用；CLI 自己组织整批导入和导出。导入预检查与写入之间的并发变化、写入中断后的报告范围也要明确。
- Global 导出清单、普通配套文件与有效争议说明的具体格式；记忆包安装所需的准确文件复制和一行 Core 入口。
- 活跃工作路线所承诺的可恢复程度，以及 Core 路由与正文在并发、故障下怎样保持可检查或可修复。
- 完整的 model-facing 协议文字与可选包正文；跨宿主验收中的“同一份 Brain 正文”究竟要求逐字相同，还是 Brain 拥有的正文与使用语义相同、宿主包装可不同。

这些是待核对或待裁决项，不从当前 renderer 或本地安装脚本反推为已定方案。
