# 14 · 生产修改前的实施契约（待审核）

本文把已经确认的需求、当前代码事实和仍需批准的实现选择放在同一处。它是实施审核稿，不表示生产代码或用户 Brain 已修改。模型实际使用效果由用户人工验证。

## 1. 已确认的边界

- Brain 作为 Harness 提供稳定的认知路线、准确读取和发现能力，以及维护工具的接口契约；如何思考、协作与主动判断保存时机由用户记忆指导。用户可选择安装 `brain-ai` 候选包，三份完整正文和一行 Global Core 入口见 [10](10-default-memory-pack-design.md)。包只有安装命令，没有更新命令。
- `code/brain-cli` 提供顶层 `install/update --agent codex|claude|dsh`，来源必须显式指定为本地目录或 GitHub 仓库；`semantic-search install/update` 管理语义依赖；`memory export/import` 管理 Global 迁移。`brain-cli` 通过 `brain: "link:../brain"` 使用 Brain 导出的原子能力，整批流程留在 CLI。
- 用户已明确 `brain_ask_search` 仅按 archival frontmatter 中的 `summary` 做语义发现，正文供 `brain_grep` 文字搜索与 `brain_cat` 完整读取；`description` 只作读取引导。结果按记忆给出路径、`description`、`summary` 和已有争议标记，模型再按路径读取。缺少摘要的旧记忆在补写前不参加语义发现，但仍可读取与文字搜索；代码改造完成后单独安排一轮存量摘要补写，具体边界见 [13](13-body-semantic-search-design.md)。
- 不运行模型回放；用户在真实使用中验证模型行为。工程检查负责路径、格式、更新、宿主接入和结果边界。

## 2. 从现有安装物推出的最小做法

当前 Codex 的 `.mcp.json` 与 hook 命令含开发 checkout 的绝对路径；Claude 的插件引用 `${CLAUDE_PLUGIN_ROOT}`，但构建输入仍引用相邻 Brain 源码；DSH 的 `brain` 依赖为 `link:../brain`。因此 CLI 必须先取得包含 `code/brain` 与对应宿主目录的来源树，准备可运行产物，再调用宿主已有安装入口。不能把 GitHub URL、单个插件目录或源码 `link:` 直接当成可运行安装结果。

候选实施方式：

1. `--source local --path` 校验传入目录确为所需来源树，并将安装所需文件准备到 CLI 管理的稳定位置；`--source github --repository [--ref]` 把用户指定仓库的实际提交取得到同一类本机版本目录。来源解析、构建、宿主安装使用同一份已确定内容，并报告实际本地路径或提交。`--ref` 暂作为可选项，省略时记录仓库默认分支当时的提交；这是易用性建议，尚非用户已作的字段决定。CLI 本身的交付也须保留 `link:../brain` 的相邻关系或将运行依赖打进 CLI 产物，不能只发布一个悬空的链接。
2. 在来源目录构建 `brain` 和指定宿主插件，生成与该安装位置相符的配置。Codex 先沿用仓库已有的本地 marketplace 和 `codex plugin add` 接入，Claude 沿用其 marketplace 与 `claude plugin install`，DSH 沿用 profile 的 `dsh plugin ... add`。DSH 必须由 `--profile <名称>` 指明目标 profile；仓库 README 的 `web` 只是开发示例，不能静默用作所有用户的默认值。更新先准备并验证新产物，再切换宿主接入；命令结果说明目标位置、来源版本、需要的重启及宿主信任步骤。不要在失败后声称已经完成切换。
3. Codex 的当前绝对命令路径必须指向稳定、在目标机器实际存在的产物；Claude 和 DSH 也必须验证构建后的相邻依赖可用。各宿主官方安装接口和当前版本应在实施时核对，不能只凭仓库 README 假定远程 marketplace 会自动带上相邻 Brain。Codex 当前官方插件文档支持本地或 Git 来源的 marketplace、显式安装、插件缓存和 hook 信任；这里选用本地 marketplace 作为 CLI 已准备产物的接入点。[Codex 插件文档](https://developers.openai.com/plugins/build/plugins)

这是以现有开发入口为起点的第一版。若某宿主的实际 CLI 拒绝该产物，应先报告具体失败并调整该宿主接线，不扩建一套通用插件发布系统。CLI 不自动处理宿主信任选择。

## 3. Global 记忆操作

### 导出

从 Brain root 的 `global/` 读取 Core、archival 正文以及正文确实依赖的普通配套文件，保留 `global/...` 相对路径。争议状态仅在配套文件对当前正文有效时随正文导出；损坏或不匹配时给出逐路径警告并继续。运行学习计数、索引和 Git 历史不进入导出。导出列出所有写出的文件，供用户查看，其中可能包含个人内容。只读流程不调用会创建 Project/Core/Git 的生产服务工厂。

### 导入和记忆包安装

先校验所有输入路径、Markdown 和配套文件，再比较目标：相同内容报告无变化，缺失内容准备写入，不同内容列为冲突；有冲突时整次写入不开始。`brain-ai` 安装另外检查三份文件的引用及 Global Core 一行入口：目标已有同路径不同正文或指向同一入口的冲突路线时失败，准确相同行为保持无变化。其他已有方法路线原样保留，由安装者自行查看。

Brain 包只增加 CLI 所需的最小 **Global 受协调操作入口**：在现有锁内重新读取目标并执行单文件的校验与写入；CLI 自己组织整批预检、复制、结果清单与导出。Core 非空时使用当前 exact edit 语义；空 Core 初始化一行。逐文件写入中断后报告哪些文件完成、哪些未写及 Core 是否已添加，重跑时先重新检查；不承诺未实现的整批原子性。写包时先写三份正文，再加 Core 一行，最后按路径核对可读性。导入若包含 Core，也按同一受协调边界处理，不能绕开 Core 容量和写入规则。

普通配套文件的接受集合以当前 Brain 实际可读取的路径为准；若无法安全迁移某类文件，命令列出具体路径及原因。无需为第一版引入额外 manifest 或包版本登记。

## 4. Brain runtime、索引与活跃路线

下文 renderer 的“Brain 使用协议”专指建立和读取认知的固定引导。Global／Project Core 中用户写入的路线可经 renderer 呈现，但其指向的思考与保存方法仍由对应记忆拥有；renderer 自己不写这些方法。

- `ArchivalDocument` 解析 `summary` 供索引与候选展示使用；模型可见的 `brain_write`、`brain_edit` 描述要求每次写入或更新都提供并核对 `description` 与 `summary`，但不新增“缺少摘要则写入失败”的 schema 门槛。旧记忆缺摘要时仍可读取、编辑和 grep；代码改造后在独立的认知维护轮次逐份据正文补写。摘要变化更新向量及候选展示；只改描述更新结果文字；正文变化保留正常读取与文字检索，不触发正文向量。索引升级时重建旧向量，不把 `description` 向量作为摘要向量复用；语义结果仅覆盖有可用摘要的记忆，并如实标记结果边界。新增摘要展示可能触发输出预算截断，结果要向模型说明。
- renderer 统一拥有本轮 Brain 使用协议；Codex／Claude hook 保留宿主绑定、传输、权限和诊断。显式 `brain_think` 模式仍每条新用户消息调用一次；自动建立的宿主不暴露重复调用指令。语义搜索按宿主启动配置决定是否**列入工具表**；列出不保证某次调用可运行，初始化或项目绑定失败时返回明确错误，模型改用准确路径、`brain_grep` 或 `brain_glob`，并说明会改变当前行动的具体缺口。renderer 只在工具表列出 `brain_ask_search` 时加入语义发现分支，不把配置开关写成运行健康保证。完整待审核文字由 [08](08-model-facing-and-memory-text-draft.md)、[15](15-complete-model-facing-contract.md) 和 [10](10-default-memory-pack-design.md) 共同给出。
- 每轮自动建立失败应让模型知道 Brain 未建立、失败位置和可行的下一步。Codex／Claude hook 和 DSH AutoThink 捕获的错误不能只写 stderr 或日志；具体模型可见输出形式按宿主接口核实。宿主若未调用适配器或丢弃其输出，Brain 无法单方面保证诊断送达，应如实记录这项接入限制，不因此阻断整轮模型工作。不得把失败标记为已成功注入，也不无限重试有副作用的 `brain_think`。模型利用已有上下文、准确路径或其他来源继续；缺失认知确实影响某项重要行动且仍取不到时，说明该行动的依据缺口，同时继续可完成的工作。
- 继续使用当前 Global／Project Core 的准确自然语言路线。新增活跃工作在对应 Project archival 保存继续所需内容；已有路线不足时再以 Core exact edit 增加入口。写入和核对尽可能完成；中断时报告已完成部分、未保存部分、准确路径与修复动作，让模型继续当前或其他工作，不能声称未完成的路线已生效。当前证据不足以要求结构化活跃工作登记或跨文件事务；若真实断链或规模问题出现，再据此调整。

## 5. 工程验收和生产修改顺序

1. 固定完整模型可见文字及记忆包正文；按现有工具字段和四种入口逐项检查语义。审核后代码和文字同时切换，不先向模型承诺尚未实现的摘要搜索。
2. 实施 `summary` 解析、模型可见写入说明、语义索引和搜索结果展示；验证旧记忆、只改正文/摘要/描述、前十份与空集合、移动/删除/争议状态及结果截断。
3. 实施 Brain 的最小受协调 Global 操作，再实现 `code/brain-cli` 的 Global 迁移、包安装、语义安装和三个 Agent 接入。验证无冲突/有冲突/中断重跑以及本地/GitHub 来源。
4. 更新 renderer、工具描述、宿主 hook 和各 README；检查显式调用与 Codex、Claude、DSH 自动建立的条件、路径、工具表暴露、调用失败和模型可见诊断。分别模拟 hook/AutoThink 失败、语义搜索列出但初始化失败，以及成功建立；核对可交付的模型可见材料及模型继续工作的路径，不能仅检查日志。模型实际行为交由用户人工验证。
5. 上述代码与工具文字改造完成后，单独列出并处理存量旧记忆：逐份读取正文和当前争议，补写与现有认识及条件相符的 `summary`，核对结果。该轮次不作为索引重建或 CLI 导入的隐式副作用。

下一步先对 [08](08-model-facing-and-memory-text-draft.md)、[10](10-default-memory-pack-design.md) 与 [15](15-complete-model-facing-contract.md) 的完整模型可见文字作一致性审核，并处理仍未收敛的记忆发现触发与包内通用方法。按 [README 的 Gate](README.md#当前阶段)，完整候选经用户审核并得到明确批准后，才进入 production 修改；普通“继续”不能代替该批准。
