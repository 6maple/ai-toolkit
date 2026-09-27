# 11 · Brain runtime 与 CLI 的实现边界复核（待审核）

本页记录对当时实现的核查及当时的开放项；当前候选实施契约见 [14](14-implementation-contract-review.md)，全量工具字段审核稿见 [15](15-complete-model-facing-contract.md)。

本文承接 [brain-ai 正文](10-default-memory-pack-design.md) 的讨论，检查当前代码能否兑现 [改造方案](07-code-and-cognition-change-proposal.md) 和 [模型可见文字草稿](08-model-facing-and-memory-text-draft.md)。这里只形成待审核的契约与修改建议；没有修改 production Prompt、工具、插件或用户 Brain，也不进行模型回放。

## 1. 当前代码能证明什么

| 位置 | 已观察到的行为 | 对方案的影响 |
|---|---|---|
| `code/brain/src/application/anchor-renderer.ts` | 每轮上下文呈现 Core、候选和读取说明；语义搜索启用时，另要求理解任务后调用 `brain_ask_search`；维护段硬编码当前用户的 `ai-think` 路线作例子。 | Core 一行入口可以被注入，但包正文仍需模型按路径读取；不能把“一行已呈现”等同于“方法已执行”。语义搜索触发条件和私有例子需要修订。 |
| Codex、Claude 的 `src/user-prompt-submit.ts` | 两处 hook 都在 Brain 上下文之前加通用使用说明，且都称“用户明确要求”注入；Codex 的说明更长。 | 普通安装不能推出用户对每一轮作过这种明确要求；Brain 上下文只拥有建立和读取认知的固定引导，方法正文由适用的用户记忆拥有。 |
| `code/brain/src/integration/server-instructions.ts` | 显式 MCP 模式要求每条新用户消息后调用 `brain_think`；hook 模式隐藏该工具，避免重复建立上下文。 | 两种模式分别描述，不向已自动建立的宿主再下达调用命令。失败重试应依据实际错误和副作用处理。 |
| `code/brain/src/integration/public-tools.ts` | 路径语法、分页、状态和写入身份已有较详细的工具及参数说明。 | 不整批替换成简短的新表格；仅修订与真实行为矛盾、重复或缺失的字段。08 的中文表格用于逐项核对。 |
| `code/brain/src/shared.ts` 与 `persistence/operation-coordination.ts` | `brain/shared` 导出路径、正文和状态 codec、store、storage 等能力；`PersistentOperationCoordinator` 目前只在内部文件导出。 | `link:../brain` 解决仓库内依赖关系，不自动提供受协调的 CLI 写入入口。导入和记忆包安装所需的最小写入能力仍要明确。 |
| `code/brain/src/runtime/production.ts` 与 `runtime/bootstrap.ts` | `createProductionBrainServices` 会解析或创建 Project，bootstrap 会确保 Global／Project Core 并准备 Git 历史；`createStorageBinding` 也要求 `projectId`，且会确保 Brain root 目录存在。 | Global 记忆导出不能直接调用生产服务工厂并声称纯读取；CLI 的 Global 文件操作应复用较低层的校验、投影、状态与协调能力，明确哪些步骤会创建目录。 |
| Codex／Claude／DSH 插件与现有语义搜索脚本 | Codex hook 命令写有当前 checkout 的绝对路径；Claude 使用 `${CLAUDE_PLUGIN_ROOT}`；DSH 以 `link:../brain` 依赖相邻包。语义搜索脚本已有 Python、模型、重复运行判断和健康检查。 | CLI 的两种来源都必须形成目标机器可运行的接入；语义搜索把现有脚本逻辑移入 `code/brain-cli`，避免再设计服务管理层。 |

当前代码中 `anchor-renderer.ts` 的 “The same cognition�?means” 含乱码，是独立的文本缺陷。它可以在获准修改 production 时直接校正，不需要为此引入新协议。

## 2. 模型可见文字的最小修订

以下是要取代当前具体问题句子的**中文语义草稿**。生产文字的语言、准确标点和与现有上下文的拼接，需要在完整 Prompt 审核时一起确认；不能只摘取其中一句上线。

### 2.1 语义搜索的触发

当前 `anchor-renderer.ts` 在语义功能启用时，无条件写“理解当前任务后调用 `brain_ask_search`”。建议改为：

> 已知准确记忆路径时，直接按路径读取。需要按意思发现尚未定位的过去认知、且本轮提供 `brain_ask_search` 时，优先用它寻找候选；要找正文中的明确词句用 `brain_grep`，要枚举路径模式用 `brain_glob`。搜索结果是候选，需要其完整条件或内容时再按路径读取。

启用语义搜索仅代表工具可用，不代表本轮都需要调用。当前 renderer 的候选发现段与末尾主动搜索段应使用同一个条件，避免同一上下文给出不同强度的要求。`brain_ask_search` 工具自身若已有准确的能力、结果与边界描述，就只修订触发条件，不删减字段细节。

从较弱模型使用角度复核后，这里的“路线和材料仍不足”还需要以可观察任务类型给出默认发现动作，且“配置启用”并不必然代表运行时可用。完整风险与中文候选见 [12](12-weak-model-usage-audit.md)。本节原句只保留为高层目标，不单独作为最终执行文字。

### 2.2 Hook 前缀与 Brain 正文

Codex／Claude hook 的“用户明确要求”不是普通安装必然成立的事实。候选处理是移除两处重复的通用前缀，由 Brain renderer 提供同一套 Core、候选和读取语义；宿主只保留确实需要的绑定、传输和诊断。Brain 正文可写：

> 以下是本轮可用的 Brain 工作上下文。结合最新用户消息及此前仍有效的决定，检查 Core 路线与候选的适用条件；需要正文时按准确路径读取。新证据只修正它实际涉及的判断。

这段也要核对 renderer 现有文字，避免又叠加一份同义说明。DSH 注入及显式 `brain_think` 返回同一 Brain 正文语义，但宿主包装和失败诊断允许不同。

### 2.3 维护示例与工具文字

删除 runtime 中硬编码的 `ai-think` 路径例子。现有“Core 保持最小路线、详细认知放 archival”的规则已经能说明怎样维护；无需换成 `brain-ai` 路径，因为默认包是可选的。修正乱码句的字符编码。

工具文字先按真实行为逐项比对：`brain_think` 建立上下文时的副作用，`brain_cat` 的续读，`brain_edit` 对非空 Core 的 exact edits，`brain_write` 的身份替换，`brain_feedback` 的成立条件，以及搜索工具的候选性质。没有证据表明有问题的字段保持原样。完整中文候选仍在 [08](08-model-facing-and-memory-text-draft.md)，那里是待审核稿，不能直接替换现有全量 schema。

## 3. CLI 的最小可交付契约

拟建的 `brain-cli` 位于 `code/brain-cli`，通过 `brain: "link:../brain"` 使用同仓库 Brain 包；当前该目录尚不存在。顶层 `install/update` 只负责指定 Agent 的 Brain MCP 接入；`semantic-search install/update` 负责共享的语义搜索依赖；`memory import/export` 负责 Global 记忆；`pack install brain-ai` 复制经审核的默认记忆包。记忆包没有更新命令，Web 暂不集成。命令候选详见 [07](07-code-and-cognition-change-proposal.md#cli-命令与数据格式候选)。

### Agent 接入

安装和更新都显式给出 `--agent codex|claude|dsh` 与本地目录或 GitHub 仓库来源。本地模式读取指定目录；GitHub 模式读取指定仓库并报告实际取得的提交或版本。`--ref` 可以作为可选参数，缺省取仓库默认分支当时解析到的提交；更新仍须报告安装前后所用的实际提交。这里将 `--ref` 保留为易用性候选，不能声称用户已决定其必填性。

“安装成功”应以目标 Agent 的接入文件与可运行产物在目标机器上成立为准。Codex 当前的绝对路径不能原样复制；Claude 的插件根路径也需要实际安装位置支持；DSH 的相邻 `brain` 包关系需要随安装物保留。安装器应按 Agent 已支持的方式生成或放置配置，报告目标位置、来源版本和需要的宿主信任或重启步骤。具体目标目录与命令参数必须先对照各宿主当前支持的安装入口，不能从开发 checkout 猜测。

### 记忆与写入

导出按 Brain root 下的 `global/...` 相对路径保留 Core、archival 正文和当前可用的配套内容；损坏或失配的争议状态给警告并继续。导入先完整列出文件路径冲突，发现已有不同内容时不开始写入。记忆包安装同样先检查三份正文与 Core 一行入口，冲突则停止，不覆盖用户已修订的记忆。

“先检查再写”还要处理检查后目标被其他 Brain 宿主改变的情况。实施前需选定最小共用写入边界：从 Brain 导出足够小的协调能力，供 CLI 在同一把 Global 锁内重新检查并写入。现有 `maintenance.write` 对同一路径可以覆盖，不能单独充当“冲突则失败”的导入接口；当前 `brain/shared` 也没有导出 `PersistentOperationCoordinator`。因此 07 中“CLI 调用 Brain 导出的原子读写能力完成校验和写入协调”是目标，不是现状。Global 导出则直接复用低层读取与状态校验，避免生产服务工厂的 Project 和 Git 初始化副作用。若最终采用逐文件写入，结果必须准确报告完成、无变化与中断位置；不能承诺未经实现的整批原子性。

### 语义搜索

把 `code/scripts/install-brain-semantic-search.mjs` 的安装逻辑移到 CLI，复用现有 Python 检测、环境和模型安装、重复运行判断、健康检查。CLI 报告“已安装且健康／进行了更新／失败”，并说明启用配置与重启要求。安装依赖本身不等于 Brain runtime 已启用该工具。

## 4. 仍需审核的两项实质判断

1. `brain-ai/core.md` 作为每轮必读正文，由 Global Core 的准确一行直接指向 `brain_cat`。明确路径后的立即读取可以作为模型的基本执行能力，不因抽象的漏读可能性增加自动展开机制。静态检查路径和工具可用性；人工使用若观察到漏读，再确定是接入、工具、文字还是模型行动的问题。
2. CLI 的 Agent 安装物和最小受协调写入接口尚未落实到具体代码。先核对各宿主安装入口与 Brain 现有资源变更 API，再固定参数和实现；不要把现有开发包路径或 `link:../brain` 当成跨机器安装方案。

进入 production 前仍按 v7 的 Prompt Gate 展示完整最终文字，由用户审核并明确批准。模型实际使用由用户人工验证。
