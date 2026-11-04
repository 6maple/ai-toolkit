---
name: lsh
description: ban
disable-model-invocation: true
---

# lsh — 私有 Skill 查找与管理

仅在用户明确选择 `/lsh`（Claude Code）或 `$lsh`（Codex），以及用户明确要求继续该次任务时使用。不要基于普通消息、主题匹配或新的无关任务自动调用。调用后正文留在当前会话上下文是正常现象；关键约束是**普通 Skill 的名称和描述不得在每次新会话默认进入模型上下文**。

本 Skill 的初始背景和已确认目标记录在 [BASE.md](BASE.md)。面向人和 AI 的安装与路径绑定说明在 [INSTALL.md](INSTALL.md)。

## 进入后定位私有库

从本 Skill 的真实安装位置找到 `scripts/lsh.mjs`，始终以绝对脚本路径执行 Node.js 命令，不能假设当前工作目录在 Skill 中。默认使用用户级安装配置；用户明确选择项目级安装，或当前项目存在 `<项目根目录>/.agents/lsh.json` 且本次使用这个实例时，为以下所有命令附加 `--project '<项目根目录>'`。

1. 执行 `node '<lsh脚本绝对路径>' status`。配置里的 `configured.library` 是安装时已绑定的私有库绝对路径；它来自安装过程，不得自行推测作者机器的目录。
2. 未安装时，读取 [INSTALL.md](INSTALL.md)，确定本次是用户级还是项目级安装及用户实际私有库位置，先展示 `install --library '<私有库>'` 预览，获得用户认可后使用 `--apply`。不得擅自选一个默认库。
3. 执行 `index --check`；如果索引不存在或过期，执行 `index --write` 并检查结果。之后读取 `<configured.library>/llm.txt`。此操作仅发生在用户主动调用后。
4. 理解用户本次要找、使用、创建、导入、修改还是管理 Skill；根据索引挑选候选。需要时执行 `find '<关键词>'`、`list`、`inspect '<名称>'`、`audit`。
5. 阅读候选原位置的 `SKILL.md` 和其实际要求的 `references/`、共享 Skill 及其他文件。对于 junction 中的 Skill，`inspect` 提供 `sourcePath` 来定位真正源码；跨目录相对路径以实际被引用文件的目录解析。
6. **主动说明耦合及建议**：比较职责范围、重复功能、声明依赖、参考文件中的跨 Skill 引用，以及新增或修改后的受影响对象。CLI 的 `incoming` 和 `references` 包括支持文件的静态线索；继续阅读实际正文进行语义判断，逐项说明为什么有关联、怎样分工以及建议措施。无静态引用不能证明没有语义重叠。
7. 按选中的原始 Skill 指引，用当前宿主可用工具完成用户任务。不得为了本次使用把普通 Skill 部署或链接进 `.agents/skills`、`.claude/skills` 等宿主发现目录。

## 管理原始 Skill

先使用 `inspect` / `audit` 和关联原始文件审视影响，再预览操作：

- `create <name> --description '<用途>'`：新增草稿。
- `add <name> --from '<本地Skill目录>'`：导入。
- `update <name> --from '<本地Skill目录>'`：原版归档后更新。
- `rename <old> <new>`：重命名。
- `remove <name>`：归档并从可用清单移除。
- `index --check` / `index --write`：验证 / 重新生成索引。

执行前核对目标路径与影响范围，取得用户对具体修改的认可，再附加 `--apply`。`rename` 和 `remove` 有反向引用时必须展示关联 Skill 与文件、说明可能出现的失效引用并给出建议；只有用户明确接受这种结果才可附加 `--ack-coupling`。该参数**不会自动修正其他文件的引用**。

`lsh` 拒绝移动或覆盖 junction / symlink。对于私有库中由 `link-skills.mjs` 管理的链接，先通过其管理命令核对和调整；真实源码则在原位置修改。对于失败的修改，查看实际返回、目录状态和索引，不能把报错理解为已完成。

用户明确要求额外将普通 Skill 部署给某客户端时，先说明此举会改变普通 Skill 的默认可发现范围；仅根据用户确定的目标借助原有 `link-skills.mjs` 单项安装并先做 `--dry-run`。

## 完成前

核对选中的 Skill、实际读取的引用文件、修改结果和 `index --check` 状态。向用户说明发现的职责或依赖耦合及建议，以及任何仍需人工处理、未完成或未经实际验证的行为。
