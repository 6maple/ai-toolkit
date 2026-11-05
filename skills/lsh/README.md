# lsh

手动调用的私有 Skill 查找与管理入口。源码位置：`ai-toolkit/skills/lsh/`。保留创建背景、初始原话和历史决定的 [BASE.md](BASE.md)；安装操作请先读 **[INSTALL.md](INSTALL.md)**；Agent 任务入口见 [SKILL.md](SKILL.md)；具体操作按需进入 [使用指引](references/use.md) 或 [管理指引](references/manage.md)。

私有库在安装时由用户指定并写入对应范围的 `.agents/lsh.json`，作为之后默认使用的固定路径。源仓库中没有预设作者本机的 Skill 路径。用户级安装默认提供 `~/.agents/skills/lsh`（Codex）与 `~/.claude/skills/lsh`（Claude Code）；也可安装到指定项目。只有 `lsh` 暴露在宿主发现目录，私有库的普通 Skill 始终在仓库原处按需读取；脚本直接扫描目录，不维护额外的 `llm.txt` 索引文件。

## 使用命令

使用 Node.js 18+，不需要额外 npm 依赖。

```powershell
# 参考 INSTALL.md 执行 install --library <私有库> [--user|--project ...] --apply
node scripts/lsh.mjs --help
node scripts/lsh.mjs status
node scripts/lsh.mjs list
node scripts/lsh.mjs find "飞书文档"
node scripts/lsh.mjs inspect lark-doc
node scripts/lsh.mjs audit lark-doc
```

增删改等命令默认只预览，明确确认具体目标后附加 `--apply`；已有反向引用的重命名或移除还需 `--ack-coupling`，并由 AI 先展示涉及的文件和影响。脚本会扫描 `SKILL.md` 及参考资料中的静态跨 Skill 引用，但职责/边界等开放语义由 AI 阅读原始文件判断。旧版本归档在私有库的 `.lsh-archive/`。`list` 仅列路径；`find` 默认最多返回 5 条候选路径和简短匹配原因；`inspect` 返回单项概要，`audit <name>` 按需返回详细关联。

已有 `link-skills.mjs` 负责普通 Skill 目录链接；本工具会拒绝直接修改 junction。安装仅链接 `lsh`，不会自动部署普通 Skill。

## 工程验证

```powershell
node --check scripts/lsh.mjs
node --test tests/lsh.test.mjs
```

测试使用临时目录，不会写真实私有库。Node 测试证明脚本覆盖的行为；Claude/Codex 的实际手动发现行为仍需用户在新会话核对。
