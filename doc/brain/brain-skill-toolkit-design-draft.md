# brain-skill-toolkit-cli + skill 设计草稿

状态：2026-10-21 已新增 CLI 与 skill，命令为 `brain-skill`，直接 import Brain 源码，使用 unbuild stub。依赖安装、stub、类型与格式检查、skill 校验及 10 项工程测试已通过；真实模型使用效果与真实 embedding 冷启动耗时尚未验证。

2026-10-28 同步：CLI 增加 `step --input-file <file|->` 与只读 `step --schema`，复用正式 `brain/step` 状态机和 schema。`think`、`step` 要求真实宿主会话标识（显式 `--session` 或支持的环境变量），成功 think 建立 CLI 逻辑轮次，后续 step 进程复用绑定。skill、命令参考与安装引导已同步。下文首版命令表与 10 项测试记录描述 10 月 21 日版本；当前用法与验收以 CLI README、命令参考及实际测试为准。

## 1. 目标与交付组成

让具备命令执行能力的 AI，通过 CLI 使用 Brain；用户选择何时让 AI 使用这套能力。配套 skill 说明如何使用 CLI。

用户已明确的组成是 `brain-skill-toolkit-cli + skill`。本稿建议以下职责：

| 对象 | 职责 |
| --- | --- |
| `brain` | 持有记忆、项目映射、认知状态、检索、维护和思考指引的实际规则 |
| `brain-skill-toolkit-cli` | 将 Brain 的能力提供为可直接执行的命令，处理参数、输出和进程生命周期 |
| 配套 skill，建议名 `brain` | 教 AI 获取当前 Brain 指引、选择命令、读取结果和正确维护记忆 |
| 现有 `brain-cli` | 继续承担已有的安装、更新、依赖管理和记忆迁移职责 |

调用关系：

```mermaid
flowchart LR
    U[用户选择使用 Brain] --> S[AI 读取 skill]
    S --> C[brain-skill 命令]
    C --> B[Brain 应用服务]
    M[现有 MCP 接入] --> B
    B --> D[同一套 Global / Project 记忆与状态]
```

CLI 在同一进程内直接 import 并调用现有 Brain 源码模块，沿用仓库现有插件的使用方式。使用者不必先配置或启动 Brain MCP server。

## 2. 用户如何选择使用

建议首版采用显式调用 skill 的方式。示意请求：

> 使用 $brain，参考项目历史决定，帮我完成这项工作。

这次调用适用于用户指定的任务及其续作；用户明确停止使用后，AI 停止后续 Brain 调用。跨任务、跨新会话的自动启用不从这次调用推导。

skill 不保存一个全局的开关状态。用户也可在明确要求单次读取或搜索时直接使用对应命令，不为一次操作强行增加完整思考流程。

本方案采用上述触发策略。以后需要自动发现 skill 时，可以另行调整触发策略；CLI 能力不依赖该选择。

### 接入条件

按需使用的接入配置，应只安装 CLI 与 skill，不自动注入每轮 Brain 恢复要求。

已有 MCP、自动恢复 hook 或强制使用指令的环境，要在选择这种接入方式时处理相应的自动入口。只安装 skill 无法撤销已有入口，skill 也不能覆盖更高优先级指令。已读入当前对话的内容不会因停止后续调用而消失。

本次仅设计这一接入方式；迁移现有宿主配置的具体改动，在实施阶段按目标宿主确认。

## 3. CLI 命令

包名为 `brain-skill-toolkit-cli`，执行命令统一使用 `brain-skill`，调用形式为 `brain-skill <子命令> [参数]`。首版提供现有 Brain 公共能力的直接对应命令，保留熟悉的动作名称。

| 命令 | 用途 | 主要参数 |
| --- | --- | --- |
| `think` | 建立本轮 Brain 工作入口 | 无业务参数 |
| `cat <path>` | 读取 Core、记忆或虚拟指引 | `--offset`、`--limit` |
| `ls <path>` | 列出记忆目录直接子项 | 目录路径 |
| `glob <pattern>` | 根据完整公开路径发现记忆 | `--path` |
| `grep <pattern>` | 按正文词句或正则发现记忆 | `--path`、`--glob`、`--literal`、`--ignore-case`、`--context` |
| `ask-search <query>` | 按自然语言语义搜索记忆 | 使用现有语义搜索配置 |
| `write <path>` | 创建记忆，或有意用不同认知替换该位置内容 | `--content-file <file或->` |
| `edit <path>` | 修订同一认知并保留身份 | `--content-file <file或->` 或 `--edits-file <file或->` |
| `mv <src> <dst>` | 移动同一认知，保留身份与相应状态 | 来源与目标路径 |
| `rm <path>` | 删除一份归档记忆 | 准确记忆路径 |
| `feedback <path> <adopt或question或resolve>` | 记录成功使用或维护争议 | question 使用 `--challenge-file <file或->` |
| `absolute-path <path>` | 将 Brain 公开位置映射为本地绝对路径 | 公开位置 |

共同参数：

- `--project <directory>`：本次操作所绑定的项目源码根目录。默认采用当前工作目录；skill 在任务中确定项目根后，持续显式传入同一目录。
- `--brain-root <directory>`：可选的数据根目录，默认沿用 `~/.brain-data`。主要用于明确选择数据环境和隔离验证。
- `--json`：输出可供程序处理的结果封装。
- `--help`、`--version`：查看帮助与版本；各子命令也有独立帮助。

示例，均为拟定接口：

```powershell
brain-skill --project 'D:/Workspace/my-project' think
brain-skill --project 'D:/Workspace/my-project' cat '@brain-virtual/deep.md'
brain-skill --project 'D:/Workspace/my-project' cat '@project/core.md'
brain-skill --project 'D:/Workspace/my-project' grep '发布流程' --literal
brain-skill --project 'D:/Workspace/my-project' write '@project/memories/decision/release.md' --content-file 'D:/Cache/release-memory.md'
brain-skill --project 'D:/Workspace/my-project' edit '@project/core.md' --edits-file 'D:/Cache/core-edits.json'
```

`--edits-file` 的文件内容是非空数组：

```json
[
  { "oldText": "当前原文中的唯一完整片段", "newText": "替换后的文字" }
]
```

两个 edit 输入选项互斥。文件使用 UTF-8；`-` 表示从标准输入读取。通过文件或标准输入传递 Markdown 和 JSON，减少多行内容、引号及 Shell 特殊字符造成的问题。指定标准输入却没有提供输入时，应说明用法并退出。

命令保持非交互方式，参数缺失或无效直接返回错误。输出、标准输入与退出码采用常见 CLI 约定，依据 [Command Line Interface Guidelines](https://clig.dev/)。

## 4. Brain 行为与结果约定

### 同一套记忆与规则

CLI 复用现有项目映射及数据目录：`@global`、`@project` 和已配置的 `#alias` 仍具有相同含义。关联项目的可用性与读写权限继续由 Brain 判断。

项目参数表示源码根目录，不是另一份记忆存储目录。首次绑定未登记目录时，沿用现有 Brain 项目建立行为，并明确返回所绑定的目录与项目，便于发现误选目录。

以下语义沿用现有 Brain：

- 同一认知的修订用 `edit`；`write` 替换已有认知会改变其身份连续性。
- 非空 Core 使用精确替换；原文变化或匹配不唯一时失败，不覆盖较新内容。
- 归档正文写入包含 `description`、`summary`、`importance`；现有旧文档的兼容规则继续成立。
- `mv` 目标已有认知时会替换目标，命令帮助明确说明这一行为。
- 争议、学习状态、并发协调、历史 checkpoint 和语义索引维护由同一 Brain 应用链路承担。
- 读取、检索及反馈仍可能更新相应使用状态；`think` 会推进认知周期并尝试历史 checkpoint，不能把它当作无副作用的帮助命令反复执行。

### 输出

默认输出适合 AI 与人阅读的文本，保留路径、行号、状态、争议、截断提示及续读位置。`cat` 继续按 `next_offset` 续读；列表和发现结果沿用当前有界、不可分页的规则，截断后缩小搜索范围。

成功结果进入 stdout；警告、诊断及文本模式错误进入 stderr。`--json` 模式的 stdout 始终为一个结果对象，错误也使用同一封装；日志不能混入 JSON。

JSON 首版只承诺封装字段 `ok`、`text`、`warnings`、`binding`，失败时附 `error.code` 与 `error.message`。`binding` 说明源码根和实际 Brain 项目。正文仍使用 Brain 当前渲染结果，不通过解析展示文字反推新的结构化数据协议。

退出码建议：`0` 成功，`2` 命令或输入用法错误，`1` 操作失败。查无匹配属于成功的空结果；配置禁用、运行时不可用及存储失败明确返回各自错误，不能显示成没有找到记忆。

操作部分写入时，保留 Brain 的部分完成诊断；AI 根据当前真实状态决定下一步。辅助状态或索引更新降级时，结果要区分正文已保存与辅助维护未完成。

`--help`、`--version` 和参数检查在初始化 Brain 服务前完成，避免帮助查询建立项目或推进状态。

### 语义搜索与进程退出

`ask-search` 沿用现有开关、模型和索引。未启用或依赖缺失时说明原因，并提供使用 grep/glob 的指引。

每次 CLI 调用完成后释放本次数据库、文件资源及 Python worker；中断时也执行清理。轻量读取不为自身操作额外启动 embedding，但写入必须保留现有索引更新或待更新记录的完整链路，不能用加速为由跳过。

首版采用一次命令一次进程。语义搜索可能重复承担冷启动成本，具体耗时需实测；守护进程与批量执行留待有证据后决定。当前 production 工厂存在进程内语义运行时缓存，没有直接返回统一释放入口。建议由新增的 CLI 运行时模块持有本次 SemanticIndex 与 PythonEmbeddingRuntime，并调用其已有 close/dispose；通过现有 bootstrap 与 createBrainApplicationServices 组装服务，使生命周期管理留在 CLI 新增代码中。

## 5. skill 如何指导 AI

建议技能名称为 `brain`，主文件保持简短，按以下工作关系组织：

1. 明确适用范围：用户选择通过 Brain 支持当前任务，或明确要求某项 Brain 操作。
2. 取得准确项目根；确认 CLI 可用。缺少程序时报告安装需求，不擅自安装或改写宿主配置。
3. 使用完整 Brain 工作方式时，每条处于该任务范围内的新用户消息先调用一次 `think`，再执行返回入口。单独 cat、grep、write 等命令不隐式调用 think，避免重复推进周期。
4. 根据入口按需读取 normal/deep 和 memory 虚拟视图、Core、候选及指向的正文。skill 只解释如何执行这些读取，具体思考流程和记忆方法从 Brain 当前内容取得。
5. 根据目录、路径、词句或语义线索选择 ls/glob/grep/ask-search，再读取相关正文；取得正文后按实际条件使用。
6. 对需要继续保存的有效认知，按既有范围与角色选择 write/edit/feedback 等操作，核对返回状态。成功使用、当前争议与内容修订保持各自含义。

CLI 使用场景应能完整执行 Brain 返回的指引。现有生成内容和用户记忆正文继续原样返回；新增 skill 提供 `brain_xxx` 到 `brain-skill` 对应子命令及参数的明确映射，例如 `brain_cat(path=...)` 对应 `brain-skill cat <path>`。AI 按映射执行工具引用，保留原有分支、执行强度和自检要求。这一适配放在新增 skill 中。

若正文引用宿主独有能力而当前环境不具备，按实际缺口处理，不把它伪装成已有 CLI 能力。

建议 skill 文件组成：

```text
skills/brain/
  SKILL.md                  适用范围、入口、常用命令与关键语义
  references/commands.md    完整参数、长内容输入和错误处理示例
  agents/openai.yaml        支持该格式的宿主所需调用策略
```

按本稿显式触发建议，支持的宿主设置 `allow_implicit_invocation: false`；其他宿主按其实际能力设置。该设置管调用方式，不能保证已进入上下文的指令被清除。具体宿主行为需要实施后核对。

## 6. 工程组成与安装

新增 `code/brain-skill-toolkit-cli/`，由 CLI 源码直接 import 相邻 `code/brain/src/` 中需要的模块。执行命令仍为 `brain-skill`，包名仍为 `brain-skill-toolkit-cli`。

例如，在 CLI 的 `src/` 下直接复用已有的基础设施与应用组装函数：

```typescript
import { bootstrapBrainRuntimeInfrastructure } from "../../brain/src/runtime/bootstrap.ts";
import { createBrainApplicationServices } from "../../brain/src/runtime/application.ts";
```

同样直接复用现有配置读取、项目映射、schema、路径解析、routed 服务及维护操作。CLI 层负责参数、UTF-8 输入、命令分发、结果输出及本次调用的资源关闭；持有语义运行时资源后注入应用组装函数。业务规则由现有模块执行。

### 预计改动范围

本轮功能代码已按纯新增方式实施，主要新增目录为 `code/brain-skill-toolkit-cli/` 与 `skills/brain/`，CLI 的依赖、stub 配置、测试及运行时组装均放在新增目录中。现有 Brain 核心代码未因本功能改动。

现有文档增加入口链接属于配套文档修改。用户若选择将已有强制 Brain 接入切换到本方案，会涉及对应宿主配置调整；这是使用方式迁移，不是 CLI 执行所需的核心代码修改。本轮通过隔离数据与模拟 worker 验证直接复用和资源清理。

### unbuild stub 入口

沿用仓库现有插件使用的 unbuild `3.6.1` stub 方式，提供独立的可执行入口 `src/cli.ts`。入口负责运行 CLI 主函数，保证从 stub 启动时能够执行。

`build.config.ts` 的入口约定：

```typescript
import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [{ input: "src/cli.ts", name: "brain-skill" }],
  outDir: "dist",
  clean: true,
  declaration: false,
  rollup: { emitCJS: false },
});
```

`package.json` 的关键约定：

```json
{
  "name": "brain-skill-toolkit-cli",
  "type": "module",
  "bin": { "brain-skill": "./dist/brain-skill.mjs" },
  "scripts": {
    "build": "unbuild --stub --config build.config.ts",
    "stub": "unbuild --stub --config build.config.ts"
  },
  "devDependencies": { "unbuild": "3.6.1" }
}
```

以上是入口与脚本片段，完整依赖按实际 import 与现有模块运行需要配置。

stub 生成可执行入口后，运行时使用源码。安装与链接保留 CLI、相邻 Brain 源码及相应依赖的可解析关系；源码更新后直接运行命令即可使用更新内容。依据：[unbuild 官方说明](https://github.com/unjs/unbuild#readme)。

首版在仓库中安装依赖、生成 stub，并通过本地链接提供 `brain-skill` 命令；skill 目录单独安装。安装只建立所选调用入口；现有安装器是否增加相应安装选项，作为实施时的配套设计，不在运行命令中自动接入 Agent。

CLI 与 skill 同步维护版本及命令示例。命令帮助是实际参数依据，skill 的详细参考与其核对。

该组织参考 Codegraph 将直接命令与 MCP 能力并列提供的做法；用户提到的类比不意味着采用 Codegraph 的全部安装与自动启用策略。依据：[Codegraph CLI Reference](https://github.com/colbymchenry/codegraph#cli-reference)。

## 7. 验收范围

实现后重点取得以下证据：

| 目标 | 验收方式 |
| --- | --- |
| CLI 可独立使用 | 在没有 Brain MCP 配置的隔离环境中完成一次读取、发现、写入与修订 |
| stub 与直接 import 可用 | 生成 unbuild stub 并链接命令后，核对入口可执行、Brain 模块可解析；修改源码后新进程直接取得更新行为 |
| 与既有入口使用同一数据 | 对同一隔离 Brain 数据根，通过 CLI 与现有应用/MCP 调用交叉读写，核对正文、身份与争议状态 |
| 保护共享 Core | 两个独立进程用旧原文修改同一 Core，后提交的过期替换必须失败 |
| 项目范围正确 | 从子目录显式指定项目根，仍绑定原项目；核对关联 alias 权限与默认发现范围 |
| 内容传输可靠 | 中文、多行 Markdown、JSON、空替换和 Shell 特殊字符通过文件及 stdin 后保持正确含义 |
| 文本与 JSON 可用 | 结果、错误、警告、退出码、续读与截断提示正确；JSON 不受日志污染 |
| 指引可执行 | think 和虚拟视图中的 CLI 引导能连续执行，用户正文中的工具引用有明确对应 |
| 调用能结束 | 普通读取和语义搜索执行完成或中断后均退出；记录冷启动耗时及子进程清理结果 |
| 选择使用有效 | 检查纯 CLI + skill 接入配置没有自动恢复入口；由用户实际使用核对显式调用、任务续作与停止后的行为 |

上述为验收范围。当前 `tests/cli.test.mjs` 中 10 项工程测试均已通过，覆盖原 8 项完整集成测试，以及追加的 stdin 中断、CLI/MCP 交叉读写测试；语义搜索使用本地确定性 worker 模拟 embedding 协议。类型检查、格式检查、官方 skill 校验、冻结锁文件安装与隔离 prefix 下的命令链接也已通过。本轮未调用本地 AI Agent、下载 embedding 模型或取得真实模型遵循与真实 embedding 冷启动耗时证据。

## 8. 审核后的设计要点

用户已认可本方案，并明确执行命令为 `brain-skill`、包名为 `brain-skill-toolkit-cli`，直接 import 代码，使用 unbuild stub。主要设计要点：

1. 首版 CLI 覆盖现有完整公共能力，包含 think、语义搜索、维护与反馈；skill 可支持完整 Brain 使用，也可执行单项命令。
2. skill 名为 `brain`，建议显式触发，并以用户指定任务作为继续使用范围。
3. CLI 直接 import 现有 Brain 源码，采用 unbuild stub 提供命令入口，并使用同一套数据及规则；短进程生命周期纳入首版，语义搜索冷启动先测量再决定是否增加常驻服务。

实际使用与安装说明见 `code/brain-skill-toolkit-cli/README.md`，skill 入口为 `skills/brain/SKILL.md`。工程验证证明其覆盖条件内的行为；宿主安装后的真实模型使用效果继续由实际使用验证。
