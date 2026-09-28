# 15 · 完整模型可见契约候选（待审核）

本文补齐 [08](08-model-facing-and-memory-text-draft.md) 的字段缺口。审核对象是以下三处文字的组合：08 第 2.1、2.3 节的完整 Brain instruction 与每轮上下文静态正文；08 第 2.4 节的 12 个公共工具主描述；本页的**全部参数字段和结果边界**。可选方法包的完整正文及 Global Core 一行入口在 [10](10-default-memory-pack-design.md)。三处文字共同构成此次拟修改的完整中文候选；动态插入的用户 Core、候选、相关项和错误只来自运行时实际数据。

本页描述目标工具契约，当前生产工具仍按 `code/brain/src/integration/public-tools.ts` 的英文文字和现有 schema 工作。表中未写的参数不存在；各工具输入对象拒绝额外字段。宿主启动配置决定是否在工具表列出 `brain_ask_search`；列出后某次调用仍可能因运行依赖或项目绑定失败而返回错误。`brain_think` 只在没有宿主自动建立本轮上下文的显式 MCP 模式提供。工具返回的结构化输出仍是 `text` 字符串，同时兼容现有文本内容；正文、候选、错误和截断信息按各工具真实运行结果呈现。

## 1. 公开路径的共同写法

`<scope-root>` 是 `@global`、`@project` 或已配置的相关项目 `#alias`。Core 只使用 `<scope-root>/core.md`。archival 文档使用 `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`；目录只在 `memories/` 下。路径用正斜杠，不能穿越目录。`#*` 仅表示语法类别，调用时要换成真实别名。各字段下述差异仍适用：准确读取和编辑可指 Core；创建、删除、移动和反馈只指 archival；发现工具的目录参数不接受 Core 或单个文档。

## 2. 全部输入字段的中文候选正文

### `brain_think`

输入是空对象 `{}`，无其他参数。其主描述和调用时机见 08 第 2.1、2.4 节。返回本轮 Brain 工作上下文；同一轮不再重复调用。

### `brain_absolute_path`

- `path`（必填）：要映射的有效 Brain 工作区位置。可填内置 scope 根（`@global`、`@project`）或已配置的 `#alias`，也可填其 Core、memories 树，或记忆角色目录以下的安全路径。使用正斜杠；不接受路径穿越和 scope 内部管理路径。返回绝对文件系统路径；目标可以尚不存在，调用不会读取或创建目标。

### `brain_ls`

- `path`（必填）：要列出直接子项的 archival 目录。使用 `<scope-root>/memories/`、`<scope-root>/memories/{decision,knowledge,intention,skill}/` 或角色目录以下的子目录。不能填裸 scope、Core 或具体 `.md` 文档。结果有限且不可分页，包含子目录与活跃记忆的公开路径、`description`、可用的状态；截断时缩小目录或换发现工具。

### `brain_glob`

- `pattern`（必填，非空）：匹配候选**完整公开路径**的 glob，包括 scope 根和 `.md` 文件名。可用 `*`、`**`、`?`、字符类等；例如 `**/testing-*.md` 或 `@project/memories/decision/**/*.md`。只匹配活跃 archival 文档，不匹配 Core、目录或普通工作区文件。用正斜杠。
- `path`（可选）：搜索前缩小范围的 archival 目录，允许的目录形式同 `brain_ls.path`；省略时查 Global、当前 Project 和可用相关 Project 的记忆。它是目录范围，不是单个 `.md` 文档。返回有限、不可分页的路径与读取引导；截断时缩小 `path` 或 `pattern` 再查。

### `brain_grep`

- `pattern`（必填）：要在活跃 archival Markdown 内容中查找的表达式。默认按正则表达式解析，非法正则是输入错误；要按普通文字查找时设 `literal=true`。默认区分大小写。
- `path`（可选）：搜索的 archival 目录范围，允许的目录形式同 `brain_ls.path`；省略时查 Global、当前 Project 和可用相关 Project。不能填 Core 或单个文档。
- `glob`（可选）：相对于每个选定搜索根的文件 glob，用于进一步过滤被搜索的 archival `.md` 文档；它与 `brain_glob.pattern` 匹配完整公开路径的规则不同。省略时不作此过滤。使用正斜杠。
- `ignoreCase`（可选，布尔）：`true` 时不区分大小写；省略或 `false` 时区分。
- `literal`（可选，布尔）：`true` 时把 `pattern` 当普通文字；省略或 `false` 时按正则表达式。
- `context`（可选，非负整数）：在每条命中行前后显示多少条逻辑行片段；省略或 `0` 时只显示命中行。结果有限且不可分页，片段用于定位；关键内容仍需 `brain_cat` 完整读取，截断时缩小条件。

### `brain_ask_search`

- `query`（必填，非空）：用自然语言描述“当前对象和动作＋要找的过去决定、约束或经验”，按当前要找的对象聚焦查询，不机械复制用户消息；新线索改变搜索对象时可调整查询。内部只查活跃 archival 记忆的 frontmatter `summary`；正文不参加语义搜索。结果是有限的记忆级候选，每份最多出现一次，显示路径、说明何时读取的 `description`、概括正文当前认识的 `summary` 和可用的争议标记。排名与摘要都不证明当前适用；记忆缺少摘要或细节只在正文时可能漏掉，未出现也不证明不存在。需要结论时按路径调用 `brain_cat`。已知具体词句用 `brain_grep`，已知路径模式用 `brain_glob`。

  例如，用户说“帮我规划个人网站”，本轮缺少可能影响方案的既有个人目标时，可查询“个人网站规划：过去确定的展示目标、目标受众与表达偏好”。查询只是寻找候选；命中后按路径读取正文，未命中时继续使用本轮已有资料，不据此断言过去没有相关决定。

### `brain_cat`

- `path`（必填）：准确的一份 cognition Markdown。可填 `<scope-root>/core.md` 或 `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`。不能填裸 scope、目录或非 `.md` 路径；相关项目的 `#alias` 要写实际值。
- `offset`（可选，正整数）：从第几条逻辑行开始，首行为 `1`；省略时从第 1 行开始。续读时准确传入前次结果的 `next_offset`。超出末尾时返回空行且无后续位置。
- `limit`（可选，正整数）：本次最多请求多少条逻辑行；省略时用默认值。传输预算可能使实际返回少于请求值，以 `next_offset` 判断是否续读。能容纳的一行会完整返回；单行过大时仅返回标为不完整的片段，`next_offset` 会走到后续行，不能据此认为该行已经读全。若该行影响判断，按结果给出的恢复位置用 `brain_absolute_path` 和宿主文件工具取得原文。archival 读取同时呈现可用的当前状态和争议。

### `brain_write`

- `path`（必填）：要创建或有意替换的准确 archival 路径，形式为 `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`。scope 决定连续使用范围，角色目录记录认知角色。不能填 Core、裸 scope、目录或非 `.md` 路径。已有内容被替换时不继承原记忆的争议和学习连续性；修订同一认知用 `brain_edit`。
- `content`（必填）：完整 archival Markdown，包含非空正文及以下 YAML frontmatter：

  ```yaml
  ---
  description: <何时应该读取这份认知>
  summary: <正文当前记录的主要认识及必要边界>
  importance: low | medium | high | critical
  ---
  ```

  每次写入都提供 `description` 和 `summary`。`description` 写清适用的任务、问题或条件，帮助模型辨认对象和范围；候选默认读取，只有明确无关时才跳过，拿不准时读取；`summary` 概括正文当前记录的对象、主要认识及会改变适用性的边界，是 `brain_ask_search` 的唯一语义索引输入。二者都要由正文支持，不能把未证实的解释写成结论；摘要不能代替正文。正文保留结论成立的条件、关键依据及尚未证实的原因。这里的摘要填写要求仅来自模型可见描述，不增加缺摘要即拒绝写入的校验门槛；旧记忆可读取、编辑和按文字搜索，但缺摘要时不参加语义发现。`importance` 表示该认知适用却未被想起时合理预期的遗漏后果：`low` 为影响很小且易恢复，`medium` 为有意义但通常可恢复的返工或误判，`high` 为重要结果的实质改变或显著成本，`critical` 为严重、不可逆或不可接受的后果。按合理预期判断，不按遥远最坏情形；它不代表新旧、频率、适用范围、确定性、可检索性或本轮相关性。

### `brain_edit`

- `path`（必填）：现存的准确 Core 或 archival 文档路径，格式同 `brain_cat.path`；裸 scope、目录、非 `.md` archival 路径及缺失目标不可编辑。
- `edits`（与 `content` 二选一）：非空的准确替换列表。每项 `oldText` 是当前原文中恰好出现一次的非空完整片段，按字面匹配空格和换行，取足够上下文以唯一定位；`newText` 是替换文字，可含 Markdown 和换行，空字符串表示删除。各 `oldText` 均在**同一份修改前原文**上匹配，不能重叠，不依赖前一项的结果；任一项无效则整次替换不生效。非空 Core 必须使用 `edits`；若有意整体重写，以完整当前 Core 作为一项 `oldText`。Core 修改后的完整结果最多 4000 个 Unicode 码点。archival 每次更新都核对 `description` 与 `summary` 是否仍与正文一致；适用条件或认识变化时在同次编辑中同步修订，旧记忆缺少摘要时据正文补写。
- `content`（与 `edits` 二选一）：同一现存认知的完整修订 Markdown。只有空 Core 可用它初始化；Core 不需要 archival frontmatter，只保留常驻所需的最少触发条件、准确路径和用法，完整结果最多 4000 个 Unicode 码点。archival 可用完整正文整体修订，保留完整 frontmatter、非空正文及当前已知结论、条件和证据。每次更新都核对 `description` 与 `summary`，旧记忆缺少摘要时据正文补写；适用条件或认识变化时同步修订对应字段。重要性只在合理预期遗漏后果改变时调整。此操作保留同一认知的身份与适用连续性，不创建缺失文件；此处的摘要填写要求不新增 schema 拒绝门槛。

### `brain_rm`

- `path`（必填）：现存活跃 archival 的准确路径，形式同 `brain_write.path`。不能填 Core、裸 scope、目录、非 `.md` 路径或缺失目标。删除后该记忆不再参加本轮候选、发现或准确读取；普通目录和配套资产不由此删除。

### `brain_mv`

- `src`（必填）：现存活跃 archival 的准确来源路径，形式同 `brain_write.path`；不能填 Core、裸 scope、目录、非 `.md` 路径或缺失目标。
- `dst`（必填）：不同的准确 archival 目标路径，形式同 `brain_write.path`。可改变 scope、角色或相对路径；目标可尚不存在，已存在时该目标认知会被替换，不会合并。移动保留来源认知的身份、当前争议和适用的学习连续性，正文不改写；不移动 Core、目录或普通资产。

### `brain_feedback`

- `path`（必填）：要反馈的现存活跃 archival 准确路径，形式同 `brain_write.path`；不能填 Core、裸 scope、目录、非 `.md` 路径或缺失目标。
- `feedback`（必填，`adopt|question|resolve`）：`adopt` 只在该认知实际指导了行动或决定，且观察结果支持其在已测试条件内有效时记录；仅阅读、提及、同意、计划使用或任务总体成功都不够。成功不扩大适用范围；若认识改变，先用 `brain_edit` 修改正文；已有争议仍保留。`question` 在具体反例或矛盾实质挑战正文含义、依据、条件、确定性或承诺且仍未解决时，设置或替换完整当前争议；仅不清楚本轮条件是否成立时先调查条件。`resolve` 仅在已有当前争议被解决后解除；解决改变正文时先编辑，解除本身不记录成功使用。
- `challenge`（`feedback=question` 时必填、非空）：完整说明当前被挑战之处及仍未解决之处；去掉首尾空白，替换旧的当前争议，不追加历史。`adopt`、`resolve` 时省略；若传入也会被忽略。反馈只改变学习或争议状态，不改正文、`description`、`summary`、`importance`、路径或认知角色。

## 3. 条件呈现与错误边界

完整拼接目标与动态数据呈现格式见 [16 第 1—3 节](16-model-facing-composition-review.md)。

每轮上下文由 08 第 2.3 节的静态正文、按工具表选出的**有／无语义搜索完整分支**以及以下运行时片段组成：Global Core、当前 Project Core、有限候选的路径/`description`/争议标记；有相关项目时才列别名、访问范围、文件映射与其 Core 准确路径；实际存在警告或错误时才列对应诊断。Core 为空时如实标示。候选集为空仅说明这次有界集合未提供候选。工具表未列出 `brain_ask_search` 时使用 08 的无语义分支；工具已列出但调用失败时给出错误和可用的准确路径、`brain_grep`、`brain_glob` 退路。宿主自动建立成功时提供 Brain 正文；建立失败且适配器仍可交付内容时，必须向模型呈现“本轮 Brain 上下文未建立”的明确诊断和可行下一步，让模型继续工作。若宿主未调用适配器或丢弃输出，Brain 无法保证模型收到诊断，应如实记录接入限制，不能因此阻断整轮工作，也不能仅凭日志声称模型已知晓失败。

参数校验失败、工具初始化失败、路径不可达、搜索无命中、候选截断、精确编辑匹配失败和写入中断各按真实情形报告。任何“无命中”只针对已查范围；任何截断提示应告诉模型下一步怎样缩小或续读。新增 Global Core 路线时，尽可能先保存正文并核对可读，再添加路线并复核；任一步失败只影响本次写入或路线建立，返回已完成内容、可识别的路径与修复动作。模型继续可完成的任务，不以成功语气掩盖未完成步骤。

## 4. `brain-cli` 面向模型的候选说明

CLI 的 `SKILL.md` 或 `llm.txt` 仅在 CLI 已实现后随 CLI 安装。候选正文：

```text
Brain CLI 提供辅助操作。命令或参数不清楚时，用 brain-cli --help 核对当前安装的用法。安装或更新 Brain MCP 时显式给出 --agent codex|claude|dsh，并指定 --source local --path <ai-toolkit目录>，或 --source github --repository <GitHub仓库URL> [--ref <版本>]；选择 dsh 时还要给出 --profile <名称>。这两个顶层命令只处理指定 Agent 的 Brain 接入。brain-cli semantic-search install/update 管理语义搜索运行依赖；完成后按结果提示检查 Brain 全局开关并重启需要的宿主。brain-cli memory export --output <目录> 导出 Global 路径并列出文件与警告；brain-cli memory import <目录> 在写入前列出路径冲突，有冲突时不开始写入，并报告具体冲突路径与可行处理。brain-cli pack install brain-ai 复制经审核的三份 Global 记忆并在 Global Core 加一行入口；重复的相同内容不重复写入，冲突时停止本次安装并报告冲突。记忆包没有 update 命令。每次操作依据命令结果核对已完成、无变化、警告或中断步骤；模型仍可继续其他工作。不要把依赖安装等同于语义工具已经启用，也不要把预检说成所有文件已原子写入。
```

这份 CLI 说明不要求模型每轮调用 CLI；Brain 的日常认知读取与维护仍使用实际暴露的 MCP 工具。CLI 命令名和可选 `--ref` 属于待审核实现提案，正式发布时必须与 `--help`、真实错误及宿主实际接入一致。

## 5. 审核检查

请把 08、10 与本页一起审核。重点是：默认包是否在旧代码/文档/测试表面一致时仍检查新目标；准确路径是否先直接读；语义搜索是否只在工具表列出且符合任务触发条件时调用，调用失败是否有退路；`summary`、`description` 和正文的职责是否清楚；工具字段有无遗漏、越过当前能力或诱导覆盖；CLI 是否会把部分写入报告为全部成功。通过文字审核也不构成模型效果已验证。
