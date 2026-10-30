# ai-toolkit

English docs: [README.md](README.md).

面向 AI Agent 的工具、skills 和宿主插件集合。当前主要组件是 **Brain**，提供持久化 Global / Project 记忆、发现与维护命令，以及跨会话继续工作的思考指引。

## Brain 接入

### 宿主插件 / MCP

为 Codex、Claude Code 或 DSH 接入 Brain，在用户消息边界恢复上下文，并提供记忆工具。从仓库根目录执行：

```sh
pnpm --dir code/brain install
pnpm --dir code/brain stub
pnpm --dir code/brain-cli install
node code/brain-cli/index.mjs install --agent codex --source local --path .
```

Claude Code 使用 `--agent claude`；DSH 使用 `--agent dsh --profile <名称>`。安装和更新会先准备所选来源的六份正式 brain-ai 方法记忆及 Global Core 入口；已有不同内容时保留原文并报告冲突。按安装结果重启宿主，完成信任或启用步骤。依赖与更新命令见[安装器 README](code/brain-cli/README.md)。

### CLI + skill

为任务显式选择 [brain skill](skills/brain/SKILL.md)，或通过 `brain-skill` 执行单项记忆命令。从仓库根目录准备本机命令：

```sh
pnpm --dir code/brain install
pnpm --dir code/brain stub
pnpm --dir code/brain-cli install
node code/brain-cli/index.mjs pack install brain-ai
pnpm --dir code/brain-skill-toolkit-cli install
pnpm --dir code/brain-skill-toolkit-cli stub
node code/brain-skill-toolkit-cli/dist/brain-skill.mjs --help
```

按 [CLI README](code/brain-skill-toolkit-cli/README.md) 链接 `brain-skill`，再按[项目接入引导](code/brain-skill-toolkit-cli/INSTALL.md) 安装 skill。单独复制 skill 不会安装 CLI 或 Global 方法记忆。指定其他数据根时，用 `node code/brain-cli/index.mjs pack install brain-ai --brain-root <目录>` 准备并核验同一个数据根。完整 `think` / `step` 流程需要真实宿主会话标识；单项记忆命令可独立执行。参数见[命令参考](skills/brain/references/commands.md)。

Brain 数据默认保存在 `~/.brain-data`。配置、记忆语义与可选语义搜索见[运行 README](code/brain/README.md)。

## 组件

| 路径 | 用途 |
| --- | --- |
| [code/brain](code/brain/README.md) | Brain 运行时、MCP 工具、记忆与思考流程。 |
| [code/brain-cli](code/brain-cli/README.md) | 宿主安装与更新、记忆迁移及可选依赖管理。 |
| [code/brain-skill-toolkit-cli](code/brain-skill-toolkit-cli/README.md) | brain-skill 命令及安装引导。 |
| [code/brain-codex-plugin](code/brain-codex-plugin/README.md) | Codex 的 Brain 接入。 |
| [code/brain-claude-plugin](code/brain-claude-plugin/README.md) | Claude Code 的 Brain 接入。 |
| [code/brain-dsh-plugin](code/brain-dsh-plugin/README.md) | DSH 的 Brain 接入。 |
| [code/brain-web](code/brain-web/README.md) | Brain 数据的本地浏览界面。 |
| [code/custom-dsh-plugin](code/custom-dsh-plugin/README.md) | DSH 审批审查插件。 |
| [code/router-creator](code/router-creator/README.md) | DSH 创造模式 Agent 预设与配套工具。 |

## 文档与开发

- [文档索引](doc/README.md)与 [Brain 设计记录](doc/brain/README.md)。
- [AI 阅读入口](llm.txt)。
- [项目协作与修改流程](AGENTS.md)；Claude 通过 [CLAUDE.md](CLAUDE.md) 读取同一份规则。
- 各组件的依赖与检查命令以其 README 和 package scripts 为准。
- [许可证](LICENSE)。
