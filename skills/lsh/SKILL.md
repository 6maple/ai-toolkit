---
name: lsh
description: ban
disable-model-invocation: true
---

# lsh — 私有 Skill 入口

仅在用户明确调用 `/lsh`（Claude Code）或 `$lsh`（Codex），或明确要求继续当前调用时使用。普通 Skill 不进入宿主的默认发现目录。

根据这次任务，**只读取需要的指引**：

- **查找、阅读、使用**私有 Skill 完成任务：读取 [references/use.md](references/use.md)。
- **创建、导入、修改、更新、重命名、归档**私有 Skill，**把普通 Skill 链接到宿主或解除链接**，或审查管理影响：读取 [references/manage.md](references/manage.md)。
- **安装、卸载 `lsh` 自身入口或更换其私有库绑定**：读取 [INSTALL.md](INSTALL.md)。

任务随后涉及另一类操作时，再读取该类指引。不要预读其他指引、[BASE.md](BASE.md) 或全部私有 Skill。

执行命令时，从本 Skill 的实际位置定位 `scripts/lsh.mjs`，以其**绝对路径**调用 Node.js。默认采用用户级安装配置；用户明确选择项目级实例，或当前项目存在 `<项目根目录>/.agents/lsh.json` 且本次使用该实例时，给命令加 `--project '<项目根目录>'`。私有库路径来自安装配置，不猜测作者的路径。
