# 创建、修改与管理私有 Skill

适用于用户通过 `lsh` 新建、导入、修改、更新、重命名、移除或审查私有 Skill。

1. 使用 `find` / `list` 定位目标，然后 `inspect <名称>` 查看简短关联概要；对需要修改的目标执行 `audit <名称>`，读取具体引用文件、反向引用与原始 `SKILL.md`。比较已有职责、相近能力、声明依赖及实际文本，**主动**向用户解释耦合与建议。脚本只提供静态线索，职责边界由 AI 结合原始材料判断。
2. 使用以下命令预览具体操作，不加 `--apply` 时不会写入：
   - `create <name> --description '<用途>'`：创建草稿。
   - `add <name> --from '<本地Skill目录>'`：导入完整 Skill 目录。
   - `update <name> --from '<本地Skill目录>'`：归档原版并替换。
   - `rename <old> <new>`：更改目录和 Skill 名称。
   - `remove <name>`：归档并从可用目录移出。
3. 核对预览中的真实路径、影响范围、引用和恢复方式；用户明确认可具体更改后才加 `--apply`。对有反向引用的 `rename` / `remove`，先说明受影响 Skill 与文件、可能失效的引用和建议。只有用户**明确接受这些影响**后才加 `--ack-coupling`；这个参数不会自动改写引用。
4. `lsh` 拒绝移动或覆盖 junction / symlink。已由链接管理器管理的私有库链接，先核对目标目录的 `.skill-links.json` 和实际源位置，再按 [链接管理说明](../LINK-SKILLS.md) 使用本 Skill 自带的 `scripts/link-skills.mjs`，对正确的 `--source` 和 `--target` 执行预览及操作；未登记的手动链接应通过原创建方式维护。真实 Skill 内容在源码位置修改。
5. 完成后再次 `inspect` / `audit <名称>`（目标仍存在时）检查内容、依赖和实际文件状态，确认更新或归档结果并说明未修复引用及任何未知影响。脚本在每次查询时从原始目录读取，不需要手动维护索引文件。

用户额外要求让某个普通 Skill 被 Codex/Claude 默认发现时，先说明会使该 Skill 元数据进入宿主的默认发现范围。使用 `node '<lsh实际目录>/scripts/link-skills.mjs' install --source '<configured.library>' --target '<客户端实际Skill发现目录>' --skill '<名称>' --dry-run` 预览；用户确认目标和变更后，去掉 `--dry-run` 安装，再执行同参数的 `status` 核对。`<configured.library>` 来自 `node '<lsh实际目录>/scripts/lsh.mjs' status`，项目级使用时加 `--project '<项目根目录>'`；`--target` 必须按实际客户端配置确定。命令细节见 [链接管理说明](../LINK-SKILLS.md)。

如果任务涉及 `lsh` 本身的安装、卸载或私有库路径变更，再读取 [INSTALL.md](../INSTALL.md)。
