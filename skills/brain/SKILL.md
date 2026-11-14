---
name: brain
description: Use Brain through the locally installed brain-skill CLI when the user explicitly selects this skill or requests CLI-based Brain memory access and maintenance.
---

# Brain

通过本机已安装的 `brain-skill` 命令使用 Brain。此 skill 由用户选择，作用于用户指定的任务及其续作；用户停止使用后停止后续 Brain 调用，新任务或新会话不自动继承启用选择。

## 开始使用

确定当前任务的项目源码根目录，Brain 记忆工具及 CLI 的项目相关命令使用相同的 `--project <目录>`。先确认本机 `brain-skill --version` 可用。

用户显式选择完整 Brain 工作方式时，先取得**正式 Step 1 提示词**，按它进行初始思考：

```powershell
brain-skill step --intro
```

完成 Step 1 要求的思考后，单独调用：

```powershell
brain-skill --project '<项目根目录>' step start
```

每次 Shell 调用只执行一个 `step` 命令；取得返回的提示词后，完成相应的思考、调查或实际工作，再单独调用下一步。`start` 返回 Step 2；完成 Step 2 后调用 `ready` 取得 Step 3；完成实际工作并取得结果后调用 `review` 取得 Step 4。Step 4 若仍有实际改进点，就继续工作，否则向用户汇报。无需 `turnId`、用户消息参数或阶段成果提交。

`brain-skill step --schema` 可查看仅含 `action` 的调用协议。三个动作只返回固定提示词；Brain 记忆、项目资料、外部查证及实际工作由模型使用可用工具完成。CLI 首次 `step start` 仍执行现有 Brain 记忆与历史维护；遇到实际错误时按错误处理。

用户仅请求一次记忆查找或维护时，直接执行该操作。Brain 作为已安装的外部工具使用；命令不可用时确认 PATH 或使用维护者提供的绝对入口，不擅自重装。

## Brain 记忆工具

| Brain 工具 | CLI 子命令 |
| --- | --- |
| `brain_step` | `step <start|ready|review>` |
| `brain_cat` | `cat <path>` |
| `brain_ls` | `ls <path>` |
| `brain_glob` | `glob <pattern>` |
| `brain_grep` | `grep <pattern>` |
| `brain_ask_search` | `ask-search <query>` |
| `brain_write` | `write <path> --content-file <file或->` |
| `brain_edit` | `edit <path> --edits-file <file或->` 或 `--content-file <file或->` |
| `brain_rm` | `rm <path>` |
| `brain_mv` | `mv <src> <dst>` |
| `brain_feedback` | `feedback <path> <adopt或question或resolve>` |
| `brain_absolute_path` | `absolute-path <path>` |

`@global`、`@project` 和已配置的 `#alias` 仍沿用 Brain 的含义。具体命令参数参考[命令说明](references/commands.md)。

## 读取与维护

已知准确路径用 `cat`；已知目录用 `ls`；已知路径模式用 `glob`；已知词句用 `grep`；按意义发现历史认知时用可用的 `ask-search`。搜索、列表只定位候选，默认读取候选完整正文，明确无关才跳过。

`cat` 返回 `next_offset` 时从该位置继续读取。单行标为不完整时，先用 `absolute-path` 取得本地位置再读原文；不能把片段当作完整文件写回。发现结果截断时缩小范围重查。

修订同一认知用 `edit`；新建或有意替换为不同认知用 `write`。非空 Core 必须准确替换当前原文；写入归档记忆时包含 `description`、`summary`、`importance`，保持结论、适用条件与依据一致。Core 只保留必要指引，详细内容放在归档。

只有认知实际指导行动且结果支持时才记录 `adopt`；当前未解反证用 `question`；解决现有争议用 `resolve`，若正文变化先 edit。执行 mv 前核对目标，已有目标会被替换。

执行长内容写入、复杂搜索、维护或处理错误前，读取 [完整命令参考](references/commands.md)。用 UTF-8 文件或标准输入传递 Markdown 与 JSON，避免通过 Shell 字符串拼接内容。

退出码 `0` 表示操作成功，`2` 表示用法错误，`1` 表示操作失败。查看警告，区分正文已保存与辅助状态维护失败；部分写入后先重读当前状态，再决定修复或重试。语义搜索不可用时根据错误处理，并可继续使用 grep/glob；不把失败当作空结果。
