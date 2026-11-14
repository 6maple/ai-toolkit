# brain-skill 命令参考

以下示例使用维护者已在本机安装并加入 PATH 的 `brain-skill` 命令，PowerShell 和 Bash 均可执行。

所有子命令支持 `--help`。共同参数可位于子命令前或后：

| 参数                       | 含义                                               |
| -------------------------- | -------------------------------------------------- |
| `--project <directory>`    | 项目源码根，默认当前目录；任务内固定显式传入       |
| `--brain-root <directory>` | Brain 数据根，默认 `~/.brain-data`                 |
| `--json`                   | stdout 输出一个 JSON 结果，日志与警告输出到 stderr |
| `--help`、`--version`      | 查询帮助或版本，不初始化 Brain                     |

公开路径、正则和 glob 使用引号。公开路径使用正斜杠。归档目录为 `<scope>/memories/{decision,knowledge,intention,skill}/`；Core 是 `<scope>/core.md`。`scope` 是 `@global`、`@project` 或已配置 `#alias`。Core、目录和具体归档文档按不同命令分别使用。

完整工作方式需要维护者先准备正式 brain-ai 六份方法和 Global Core 入口。项目安装按 [接入引导](../../../code/brain-skill-toolkit-cli/INSTALL.md) 使用现有 cat 核验入口及六份正文；自定义 --brain-root 的准备与核验必须使用同一目录。缺少方法时报告就绪缺口，单项记忆操作保持其原有用途。

## 工作入口与读取

```powershell
brain-skill --project 'D:/Workspace/my-project' cat '@brain-virtual/deep.md'
brain-skill --project 'D:/Workspace/my-project' cat '@brain-virtual/deep-memory.md'
brain-skill --project 'D:/Workspace/my-project' cat '@project/core.md' --offset 1 --limit 80
brain-skill --project 'D:/Workspace/my-project' ls '@project/memories/decision/'
brain-skill --project 'D:/Workspace/my-project' absolute-path '@project/memories/decision/release.md'
```

normal/deep 流程及 memory 视图通过 `cat` 分层读取。四份虚拟视图每次生成并完整返回。

普通 cat 的 offset/limit 是从 1 开始的逻辑行；按返回的 `next_offset` 续读。`absolute-path` 只映射位置，目标可以尚不存在。

## 固定 Brain Step 提示词

本地 CLI 只用三个动作，不保存阶段 State 或轮次 ID：

先获取 Step 1：

```powershell
brain-skill step --intro
```

阅读并完成本步骤要求的思考后，单独执行 `brain-skill --project 'D:/Workspace/my-project' step start`，获取 Step 2。完成 Step 2 的要求后再单独执行 `step ready`，取得 Step 3；实际工作取得结果后再单独执行 `step review`，取得 Step 4。每次 Shell 调用只执行一个 `step` 命令，根据本次返回完成工作再进行下一次调用。Step 4 若还有改进点就再次调用 `ready`，否则正式回复。无需 `--turn-id`、`--message`、`--result` 或其它 Step 参数。可用 `step --schema` 查看仅含 `action` 的工具协议。

记忆、项目源文件及外部信息的读取与维护继续使用现有独立工具。

## 发现记忆

```powershell
brain-skill --project 'D:/Workspace/my-project' glob '**/release-*.md'
brain-skill --project 'D:/Workspace/my-project' glob '@project/memories/decision/**/*.md'
brain-skill --project 'D:/Workspace/my-project' grep '发布流程' --literal --context 2
brain-skill --project 'D:/Workspace/my-project' grep 'release|deploy' --ignore-case --glob '*.md' --path '@project/memories/decision/'
brain-skill --project 'D:/Workspace/my-project' ask-search '关于发布失败后恢复服务的已有决定'
```

glob 的 pattern 匹配完整公开路径；grep 的 `--glob` 相对于各搜索根过滤文件。grep 默认将 pattern 作为大小写敏感正则；普通词句可用 `--literal`，忽略大小写用 `--ignore-case`。`--context` 是非负整数。

glob/grep 省略 `--path` 时发现 Global、当前 Project 和可用关联项目的记忆。指定 path 必须是归档目录。列表、路径与正文发现有界且不可分页，截断后缩小范围；不能据一次未命中断言不存在相关记忆。

ask-search 沿用 Brain 配置。开关关闭返回 `semantic-search-disabled`；依赖不可用返回 `semantic-search-unavailable`。命令不自动安装模型或启用服务。

## 新建与修订

将完整记忆写入 UTF-8 文件，例如：

```markdown
---
description: 发布任务需要确定审批条件时读取
summary: 当前发布须满足已确认的审批条件，具体适用环境见正文
importance: high
---

这里保存已确认决定、成立条件与依据。
```

```powershell
brain-skill --project 'D:/Workspace/my-project' write '@project/memories/decision/release.md' --content-file 'D:/Cache/release.md'
brain-skill --project 'D:/Workspace/my-project' edit '@project/memories/decision/release.md' --content-file 'D:/Cache/release-revised.md'
brain-skill --project 'D:/Workspace/my-project' edit '@project/core.md' --edits-file 'D:/Cache/core-edits.json'
```

edits 文件是非空 JSON 数组：

```json
[{ "oldText": "原文中的唯一完整片段", "newText": "替换文字" }]
```

所有 oldText 针对同一修改前原文匹配；必须唯一，替换区域不能重叠。任一项不成立则整批替换失败。空 newText 表示删除。非空 Core 只使用 edits；空 Core 可用 content 初始化。完整重写非空 Core 时，用当前完整 Core 作为一项 oldText。

内容输入选项接受 `-` 以读取 stdin；编辑的两种输入互斥。文件按 UTF-8 解码，并接受 UTF-8 BOM。Markdown 内的引号、反引号、美元符号与换行通过文件/stdin 原样传入；创建文件也使用宿主可靠的文件写入方式。

## 移动、删除与反馈

```powershell
brain-skill --project 'D:/Workspace/my-project' mv '@project/memories/decision/old.md' '@project/memories/decision/new.md'
brain-skill --project 'D:/Workspace/my-project' rm '@project/memories/knowledge/obsolete.md'
brain-skill --project 'D:/Workspace/my-project' feedback '@project/memories/decision/release.md' adopt
brain-skill --project 'D:/Workspace/my-project' feedback '@project/memories/decision/release.md' question --challenge-file 'D:/Cache/challenge.txt'
brain-skill --project 'D:/Workspace/my-project' feedback '@project/memories/decision/release.md' resolve
```

mv、rm、feedback 只作用于具体归档文档。mv 保留来源身份及适用学习状态，目标已存在时替换目标；rm 不删除配套文件或 Core。question 的 challenge 是完整当前未解争议，替换此前争议；adopt 保留现有争议。resolve 只解除已有争议，不记录成功使用。

## 输出与失败

JSON 结果包含 `ok`、`text`、`warnings`、`binding`。binding 包含 sourceRoot、brainRoot、projectId；初始化尚未成功时可能为 null。失败附 `error.code` 与 `error.message`。正文保留现有 Brain 渲染，不额外解析为另一套记忆数据结构。帮助和版本查询始终输出普通文本。

`step` 的 `text` 是相应动作的固定提示词，不使用轮次 ID、成果提交或状态文件。输入参数或 schema 错误退出 2。

- 用法错误：退出码 2，修正参数、路径对象种类、JSON 格式或缺失内容。
- 操作失败：退出码 1，按具体 code 处理。过期精确替换失败时重读原文，不改成覆盖。
- `mutation-partially-applied`：可能存在部分持久更改，先重读目标；mv 同时重读来源和目标。
- `mutation-failed`：操作未完成，此操作先前更改已恢复；修复存储原因后再判断重试。
- 警告：正文操作可能成功，但辅助状态、历史或索引维护降级。根据警告判断影响，不把它说成全部完成。

语义维护暂不可用时，CLI 保存待更新标记，供后续索引恢复；内容搜索可继续。新轮 `step start` 执行记忆周期维护并尝试 Git 检查点。Ctrl+C/SIGTERM 请求中断并清理本次资源。
