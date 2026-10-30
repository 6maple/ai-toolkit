# 将已就绪的 Brain 接入目标项目

这份引导给目标项目的使用者或 AI 执行。Brain 的安装、依赖、构建，以及实际数据根中的六份正式 brain-ai 方法和 Global Core 入口已经由维护者准备好；目标项目只使用现成命令与 skill 文件。

维护者首次准备本机 CLI 时，先按 [README 的本地安装步骤](README.md#本地安装命令windows--powershell) 安装依赖、生成 stub 并执行本地 `npm link`。无需发布包。先在目标宿主中确认 `brain-skill --version`、`step --help`、`step --schema` 可用，再执行本页项目接入；复制或链接 skill 本身不会安装 CLI。

## 接入需要的信息

| 信息               | 填写方式                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| 目标项目根目录     | 要使用 Brain 的项目根，例如 `D:/Workspace/my-project`                                   |
| 就绪的 CLI 入口    | 通常是 `brain-skill`；也可以是维护者提供的绝对命令路径                                  |
| 现成 skill 目录    | 本机为 `D:/Workspace/ai-projects/ai-toolkit/skills/brain`；其他环境使用维护者提供的位置 |
| 项目使用的 AI 宿主 | Codex、Claude Code，或用户明确指定的其他宿主                                            |

目标项目使用维护者配置好的 Brain 数据环境。只有维护者明确提供另一数据根时才附加 `--brain-root <目录>`；`--project` 始终填写目标项目源码根。

## 可以直接交给项目 AI 的指令

将下面内容交给目标项目中的 AI，并填写对应路径：

```text
请把已经准备好的 Brain 接入当前项目。

目标项目根目录：<目标项目的绝对路径>
已就绪 CLI：brain-skill
现成 skill 目录：D:/Workspace/ai-projects/ai-toolkit/skills/brain
AI 宿主：<当前宿主，例如 Codex 或 Claude Code>

把 Brain 当作已就绪的外部工具，只使用公开 CLI、帮助和交付的 skill。
依赖安装、构建和维护由 Brain 维护者负责；不要进入 Brain 实现代码、重新安装/构建它，
或向当前项目添加 Brain 的源码和依赖。

请完成项目范围的接入：
1. 确认目标项目根、当前宿主和现成 skill 路径，执行 CLI 的 --version 与 --help。
   命令不可用时使用维护者已提供的绝对入口；没有可用入口则报告具体错误，交由维护者处理。
2. 检查当前宿主的项目级 skill 目录。Codex 使用 .agents/skills/brain，
   Claude Code 使用 .claude/skills/brain；其他宿主先取得其准确目录与调用规则。
3. 将整个现成 skill 目录复制到对应目标位置，包含 SKILL.md、references、agents。
   如果目标已存在，先比较：一致则复用；内容不同则报告差异，保留原内容，等待升级方式明确。
   用户已指定使用目录链接时，沿用该方式，并检查链接目标及 CLI 是否能实际执行。
4. Codex 保留 agents/openai.yaml 中的 allow_implicit_invocation: false。
   Claude Code 仅在目标副本 SKILL.md 的 YAML frontmatter 添加
   disable-model-invocation: true，保留其他字段与正文；不要修改交付源文件。
   共享目录链接没有独立副本，不在链接内添加宿主专用字段；需要此字段时使用独立副本。
5. 执行 brain-skill --project '<目标项目根>' --json cat '@project/core.md'。
   检查退出码为 0、ok 为 true，且 binding.sourceRoot 对应目标项目根。
   Project Core 为空是正常结果。报告有影响的警告。
   使用同一 --project 和 --brain-root 读取 @global/core.md，核对正式方法入口；
   再读取 @global/memories/skill/brain-ai/ 下的 core.md、software.md、agentic-software.md、
   instructions.md、user-facing-expression.md、report-writing.md，确认六份正文均可用。
   六份方法的 cat 结果均须退出码为 0、ok 为 true；可用 --limit 限制输出，无需逐页读完。
   实际任务按适用条件读取完整方法正文。
   缺少方法或入口时报告完整环境未就绪，交由维护者准备；不自行写入 Global。
   另外执行 brain-skill step --help 与 brain-skill step --schema，确认交付包含流程控制命令。
   完整工作需要真实宿主会话标识；检查当前宿主是否提供 CODEX_THREAD_ID 或
   CLAUDE_CODE_SESSION_ID，或维护者是否提供 BRAIN_SESSION_ID / --session 的接入方式。
   缺少时报告“记忆命令已可用，完整流程仍缺会话标识”，不要猜测标识，也不要为验证运行 think。
6. 报告 skill 安装位置、CLI 入口与版本、项目绑定验证结果、用户如何显式调用，
   并分别说明方法记忆/入口、会话标识的就绪情况，以及宿主是否已经实际发现该 skill。

本次接入只安装项目 skill 并验证命令，不启用“每轮强制使用 Brain”，
不新增 MCP/hook，不改变全局配置，也不修改当前项目的业务代码。
安装验证不运行 think，不替用户执行正式任务。
```

没有指定其他目标目录时，在该项目聊天中根据已知工作区确定项目根，不把 Brain 的交付目录当作目标项目。

## 项目中应出现的文件

按实际宿主选择一处安装：

| 宿主        | 项目级位置                       | 用户显式调用                               |
| ----------- | -------------------------------- | ------------------------------------------ |
| Codex       | `<项目根>/.agents/skills/brain/` | `$brain`，或在宿主的技能选择入口选择 Brain |
| Claude Code | `<项目根>/.claude/skills/brain/` | `/brain`                                   |

目录中保留完整 skill：

```text
brain/
  SKILL.md
  references/commands.md
  agents/openai.yaml
```

本机 Sales Copilot 已按用户指定使用两级 Windows Junction：

```text
E:/Zen/Workspace/sales-copilot/.claude/skills/brain
  -> D:/Workspace/ai-mds/skills/brain
  -> D:/Workspace/ai-projects/ai-toolkit/skills/brain
```

维护 `skills/brain` 即更新这两处目录内容。创建链接使用 `D:/Workspace/ai-mds/skills/link-skills.mjs`，先读取该脚本说明，只指定 `--skill brain`；已有内容先比较并保留项目适配，再决定链接方式。其他协作者用各自的仓库和项目路径。已加载的宿主上下文可能仍含旧 skill 文本，需重新加载或重新调用 skill 后确认。

Codex 的显式策略由 `agents/openai.yaml` 提供。Claude Code 的显式策略使用目标副本 frontmatter 中的 `disable-model-invocation: true`；该字段只加入 Claude 项目的副本。依据：[OpenAI 官方 skills 文档](https://developers.openai.com/codex/skills)、[Claude Code 官方 skills 文档](https://code.claude.com/docs/en/skills)。

如果宿主尚未显示 skill，在目标项目重新加载或新开聊天后检查。文件存在与宿主实际识别是两个验收结果，不依据文件复制成功宣称模型使用效果已验证。

## 手动安装示例：Codex / PowerShell

将 `$targetProject` 换成实际项目根。以下命令使用现成 skill；目标已存在时会停止，供先比较差异。

```powershell
$preparedSkill = 'D:/Workspace/ai-projects/ai-toolkit/skills/brain'
$targetProject = (Resolve-Path -LiteralPath 'D:/Workspace/my-project' -ErrorAction Stop).Path
$skillsParent = Join-Path $targetProject '.agents/skills'
$targetSkill = Join-Path $skillsParent 'brain'

Get-Command brain-skill -ErrorAction Stop | Out-Null
brain-skill --version
if ($LASTEXITCODE -ne 0) { throw '现成 Brain 命令不可用，请向维护者反馈' }

if (-not (Test-Path -LiteralPath (Join-Path $preparedSkill 'SKILL.md'))) {
    throw '现成 skill 路径不正确，请核对维护者提供的位置'
}
if (Test-Path -LiteralPath $targetSkill) {
    throw '项目已存在 brain skill，请先比较内容'
}

New-Item -ItemType Directory -Path $skillsParent -Force -ErrorAction Stop | Out-Null
Copy-Item -LiteralPath $preparedSkill -Destination $targetSkill -Recurse -ErrorAction Stop

$verificationJson = brain-skill --project $targetProject --json cat '@project/core.md'
if ($LASTEXITCODE -ne 0) { throw 'Brain 项目绑定验证失败，请查看返回错误' }
$verification = $verificationJson | ConvertFrom-Json -ErrorAction Stop
if (-not $verification.ok) { throw 'Brain 未返回成功结果' }
$verification.binding
$verification.warnings
```

若使用维护者提供的绝对命令路径，PowerShell 调用形式为 `& '<CLI绝对路径>' --version`，其余参数保持相同。

核对打印出的 `binding.sourceRoot` 是否对应实际项目根（有目录链接时以真实目录为准）。cat 验证会建立或恢复目标项目在 Brain 中的绑定，可能初始化项目记忆入口。空 Project Core 可以正常使用，不需要为安装凑写项目记忆；这不代表 Global 方法记忆和读取入口已齐备，还需完成前述六份正文与 Global Core 核验。原有 Brain 数据和已配置的可选能力由维护者负责。

## 安装后的使用

在 Codex 中选择 Brain skill，例如：

```text
$brain 请结合本项目已有记忆，帮我处理这项工作。
```

Claude Code 使用 `/brain` 并附上任务。用户选择使用后，AI 才按 skill 调用 Brain；CLI 的 `think` 是正式工作的入口，不是安装检测命令。

完整工作还使用 `step --input-file` 推进同一轮流程。真实会话标识的来源及缺失处理见安装后的命令参考；会话/轮次由 CLI 绑定，模型只提交 Brain 的业务参数。只验证 cat 成功不代表完整深度思考流程已具备宿主上下文。

运行失败时，记录命令、错误码、错误信息和相关警告，反馈给维护者。命令参考已包含在安装后的 `references/commands.md` 中，目标项目 AI 据此调用公开能力。

已存在的强制 Brain 指令或自动恢复接入不会因复制 skill 自动撤销。若目标项目需要从旧接入迁移，先报告实际已有的接入，再按用户明确要求处理。

升级副本时比较现成 skill 与项目副本，保留项目自行调整的内容，Claude 副本继续保留显式调用字段。目录链接直接承接源文件更新；本地 CLI 的源码与依赖更新方式见 README。项目卸载时只移除本次安装的 skill 副本或链接，目录链接按链接处理并保留共享源目录，Brain 数据继续由维护者管理。
