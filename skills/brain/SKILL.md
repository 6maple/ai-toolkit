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

完整工作方式中的 `think`、`step` 必须使用本会话的真实宿主标识。CLI 自动读取 `BRAIN_SESSION_ID`、Codex 的 `CODEX_THREAD_ID` 或 Claude 的 `CLAUDE_CODE_SESSION_ID`；没有可用环境标识时，对每次 `think`、`step` 显式传入相同的 `--session '<真实宿主会话标识>'`。无法取得真实标识时报告缺口，不能编造或用项目路径代替。

用户选择完整 Brain 工作方式时，每条处于任务范围内的新用户消息后、其他实质行动前执行一次：

```powershell
brain-skill --project '<项目根目录>' think
```

严格按返回入口读取并执行当前流程、记忆读取和维护要求。成功后本轮不重复调用 `think`；失败时根据返回错误及可能副作用判断后续动作。具体流程从 Brain 取得，不在此复制。

用户明确只要求某一次读取、搜索或记忆维护时，直接执行对应命令。

## 执行 Brain 指引

Brain 返回的正文与指引保留原文，其中的工具名通过以下命令执行：

| Brain 工具            | CLI 子命令                                                         |
| --------------------- | ------------------------------------------------------------------ |
| `brain_think`         | `think`                                                            |
| `brain_step`          | `step --input-file <file或->`                                      |
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

流程要求调用 `brain_step` 时，先读取 `step --help` 和 `step --schema`，按当前 schema 将请求写入 UTF-8 JSON 文件或标准输入，再执行 `step --input-file`。严格执行返回的 `guidance`。同轮各次调用复用 `think` 建立的绑定；每条新用户消息成功执行一次 `think` 后，由程序建立新的 CLI 轮次。

`@global`、`@project`、已配置 `#alias` 沿用 Brain 含义。引用关联项目正文中的 `@project/...` 时，调用改用同一个 `#alias/...`；写回正文保留原引用。

## 读取与维护

已知准确路径用 `cat`；已知目录用 `ls`；已知路径模式用 `glob`；已知词句用 `grep`；按意义发现历史认知时用可用的 `ask-search`。搜索、列表只定位候选，默认读取候选完整正文，明确无关才跳过。

`cat` 返回 `next_offset` 时从该位置继续读取。单行标为不完整时，先用 `absolute-path` 取得本地位置再读原文；不能把片段当作完整文件写回。发现结果截断时缩小范围重查。

修订同一认知用 `edit`；新建或有意替换为不同认知用 `write`。非空 Core 必须准确替换当前原文；写入归档记忆时包含 `description`、`summary`、`importance`，保持结论、适用条件与依据一致。Core 只保留必要指引，详细内容放在归档。

只有认知实际指导行动且结果支持时才记录 `adopt`；当前未解反证用 `question`；解决现有争议用 `resolve`，若正文变化先 edit。执行 mv 前核对目标，已有目标会被替换。

执行长内容写入、复杂搜索、维护或处理错误前，读取 [完整命令参考](references/commands.md)。用 UTF-8 文件或标准输入传递 Markdown 与 JSON，避免通过 Shell 字符串拼接内容。

退出码 `0` 表示操作成功，`2` 表示用法错误，`1` 表示操作失败。查看警告，区分正文已保存与辅助状态维护失败；部分写入后先重读当前状态，再决定修复或重试。语义搜索不可用时根据错误处理，并可继续使用 grep/glob；不把失败当作空结果。
