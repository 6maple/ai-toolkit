# lsh

手动调用的私有 Skill 查找与管理入口。源码位置：`ai-toolkit/skills/lsh/`。保留创建背景的公开概述与历史决定的 [BASE.md](BASE.md)；安装操作请先读 **[INSTALL.md](INSTALL.md)**；Agent 任务入口见 [SKILL.md](SKILL.md)；具体操作按需进入 [使用指引](references/use.md) 或 [管理指引](references/manage.md)。

私有库在安装时由用户指定并写入对应范围的 `.agents/lsh.json`，作为之后默认使用的固定路径。源仓库中没有预设作者本机的 Skill 路径。用户级安装默认提供 `~/.agents/skills/lsh`（Codex）与 `~/.claude/skills/lsh`（Claude Code）；也可安装到指定项目。只有 `lsh` 暴露在宿主发现目录，私有库的普通 Skill 始终在仓库原处按需读取；脚本直接扫描目录，不维护额外的 `llm.txt` 索引文件。

## 使用命令

使用 Node.js 18+，不需要额外 npm 依赖。下面的相对命令均从 `ai-toolkit/skills/lsh/` 目录运行；在其它目录执行时请使用脚本绝对路径；示例中的 `example-skill` 请替换为个人库里实际存在的名称。

```powershell
# 参考 INSTALL.md 执行 install --library <私有库> [--user|--project ...] --apply
node scripts/lsh.mjs --help
node scripts/lsh.mjs status
node scripts/lsh.mjs list
node scripts/lsh.mjs find "文档"
node scripts/lsh.mjs inspect example-skill
node scripts/lsh.mjs audit example-skill
```

增删改等命令默认只预览，明确确认具体目标后附加 `--apply`；已有反向引用的重命名或移除还需 `--ack-coupling`，并由 AI 先展示涉及的文件和影响。脚本会扫描 `SKILL.md` 及参考资料中的静态跨 Skill 引用，但职责/边界等开放语义由 AI 阅读原始文件判断。旧版本归档在私有库的 `.lsh-archive/`。`list` 仅列路径；`find` 根据库中实际 Skill 的名称与描述执行通用文本匹配，默认最多返回 5 条候选路径和简短匹配原因，不预置私人 Skill 名称或特定服务的词语映射；跨语言或功能语义由 AI 在取得实际资料后判断。`inspect` 返回单项概要，`audit <name>` 按需返回详细关联。

`scripts/link-skills.mjs` 随 `lsh` 一起交付，此仓库内的版本是之后的正式维护源。私有库中以前单独放置的同名脚本属于历史独立版本，不会随着 `lsh` 更新；两者的 `--source` 默认行为不同，请按实际调用的脚本使用。它负责按用户明确要求将普通 Skill 原位链接到客户端；命令必须传入 `--source <私有库目录>` 和 `--target <客户端Skill发现目录>`，先用 `--dry-run` 预览。详见 [链接管理说明](LINK-SKILLS.md)。`lsh` 的常规安装仅链接自身，不会自动部署普通 Skill；管理普通 Skill 内容时拒绝直接改动 junction。

## 工程验证

```powershell
node --check scripts/lsh.mjs
node --test tests/lsh.test.mjs tests/link-skills.test.mjs
```

测试使用临时目录，不会写真实私有库。Node 测试证明脚本覆盖的行为；Claude/Codex 的实际手动发现行为仍需用户在新会话核对。
