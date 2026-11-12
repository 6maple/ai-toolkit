---
name: brain
description: Use Brain through the locally installed brain-skill CLI when the user explicitly selects this skill or requests CLI-based Brain memory access and maintenance.
---

# Brain

通过本机已安装的 `brain-skill` 命令使用 Brain。此 skill 由用户选择，作用于用户指定的任务及其续作；用户停止使用后停止后续 Brain 调用，新任务或新会话不自动继承启用选择。

## 开始使用

确定当前任务的项目源码根目录，后续命令显式传入同一个 `--project <目录>`，避免工作目录变化导致绑定其他项目。使用当前 Brain 数据根；用户指定另一数据环境时传入 `--brain-root <目录>`。

先查询维护者已在本机安装的命令版本：

```powershell
brain-skill --version
```

以下命令同样适用于 PowerShell 和 Bash。Brain 作为外部工具使用：通过公开 CLI、帮助和返回指引完成操作。命令找不到时检查当前宿主的 PATH，或使用维护者提供的绝对入口；仍不可用则报告具体错误，交由维护者处理。目标项目的接入范围为安装本 skill 与验证命令，不承担 Brain 实现代码、依赖或构建的维护。

用户选择完整 Brain 工作方式时，每条处于任务范围内的新用户消息后、其他实质行动前立即调用：

```powershell
brain-skill --project '<项目根目录>' step start --message '<本轮用户消息原文>'
```

这次调用返回 Background + Goal 的当前 Work 和本轮 `turnId`。后续每次 `step` 都传 `--turn-id '<本轮 ID>'`。按每次返回的 Markdown 完成当前工作、检视和修正；需要历史决定、专业方法和当前资料时，按首次「资料与方法入口」以及现有 Brain 读取能力取得有效依据。工具或读取失败时根据实际错误处理。

完整工作方式配套的六份正式 brain-ai 方法及 Global Core 入口由维护者准备，项目接入时按[安装引导](../../code/brain-skill-toolkit-cli/INSTALL.md)核验。实际工作沿返回的入口和现有条件读取正文；发现缺少方法或读取入口时报告完整环境未就绪，由维护者处理，不自行补装 Global。用户只请求单项记忆操作时按该操作的实际结果处理。

带本轮 `--turn-id` 和原消息再次执行 `step start` 可取得当前任务。每条新用户消息使用不带 ID 的 `step start`。

用户明确只要求某一次读取、搜索或记忆维护时，直接执行对应命令。

## 执行 Brain 指引

Brain 返回的正文与指引保留原文，其中的工具名通过以下命令执行：

| Brain 工具            | CLI 子命令                                                         |
| --------------------- | ------------------------------------------------------------------ |
| `brain_step`          | `step <start|submit-work|submit-review|confirm-review|update|read>` |
| `brain_cat`           | `cat <path>`                                                       |
| `brain_ls`            | `ls <path>`                                                        |
| `brain_glob`          | `glob <pattern>`                                                   |
| `brain_grep`          | `grep <pattern>`                                                   |
| `brain_ask_search`    | `ask-search <query>`                                               |
| `brain_write`         | `write <path> --content-file <file或->`                            |
| `brain_edit`          | `edit <path> --edits-file <file或->` 或 `--content-file <file或->` |
| `brain_rm`            | `rm <path>`                                                        |
| `brain_mv`            | `mv <src> <dst>`                                                   |
| `brain_feedback`      | `feedback <path> <adopt或question或resolve>`                       |
| `brain_absolute_path` | `absolute-path <path>`                                             |

例如，“使用 brain_cat 读取 @brain-virtual/deep.md”表示执行：

```powershell
brain-skill --project '<项目根目录>' cat '@brain-virtual/deep.md'
```

同样执行返回流程中的必读指引、Core 路线和自检要求。指引包含本地工作流文件路径时，用宿主文件工具读取该文件。宿主专属能力缺失时明确实际缺口。

流程要求调用 `brain_step` 时，使用 `step start --message '<本轮用户消息原文>'`，之后按返回的当前 Markdown 任务调用 `step submit-work --result '<Markdown成果>'`、`step submit-review`、`step confirm-review`、`step update --old-text '<旧文>' --new-text '<新文>'` 或 `step read`。有实质检视问题时给 review/confirm 添加 `--result '<问题与依据>'`，没有问题时省略。长文本或包含复杂 Shell 字符的内容用 `--message-file`、`--result-file`、`--old-text-file`、`--new-text-file` 传入 UTF-8 文件或 `-` 标准输入，避免转义改变正文；批量替换按对应顺序重复 `--old-text` 和 `--new-text`。需要时读取 `step --help` 和[命令参考](references/commands.md)。同轮各次调用都传入首次 `step start` 返回的 `--turn-id '<本轮 ID>'`。

`@global`、`@project`、已配置 `#alias` 沿用 Brain 含义。引用关联项目正文中的 `@project/...` 时，调用改用同一个 `#alias/...`；写回正文保留原引用。

## 读取与维护

已知准确路径用 `cat`；已知目录用 `ls`；已知路径模式用 `glob`；已知词句用 `grep`；按意义发现历史认知时用可用的 `ask-search`。搜索、列表只定位候选，默认读取候选完整正文，明确无关才跳过。

`cat` 返回 `next_offset` 时从该位置继续读取。单行标为不完整时，先用 `absolute-path` 取得本地位置再读原文；不能把片段当作完整文件写回。发现结果截断时缩小范围重查。

修订同一认知用 `edit`；新建或有意替换为不同认知用 `write`。非空 Core 必须准确替换当前原文；写入归档记忆时包含 `description`、`summary`、`importance`，保持结论、适用条件与依据一致。Core 只保留必要指引，详细内容放在归档。

只有认知实际指导行动且结果支持时才记录 `adopt`；当前未解反证用 `question`；解决现有争议用 `resolve`，若正文变化先 edit。执行 mv 前核对目标，已有目标会被替换。

执行长内容写入、复杂搜索、维护或处理错误前，读取 [完整命令参考](references/commands.md)。用 UTF-8 文件或标准输入传递 Markdown 与 JSON，避免通过 Shell 字符串拼接内容。

退出码 `0` 表示操作成功，`2` 表示用法错误，`1` 表示操作失败。查看警告，区分正文已保存与辅助状态维护失败；部分写入后先重读当前状态，再决定修复或重试。语义搜索不可用时根据错误处理，并可继续使用 grep/glob；不把失败当作空结果。
