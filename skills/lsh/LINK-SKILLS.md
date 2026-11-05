# 本地 skill 链接管理

`scripts/link-skills.mjs` 把源库中的 Skill 目录链接到项目指定目录。要求 Node.js 18+，无需安装依赖。此版本正式维护于 `ai-toolkit/skills/lsh/scripts/link-skills.mjs`；私有库中历史独立版本不随本工具自动更新。此版本必须通过 `--source` 指定源库，可以从 `lsh` 安装配置的 `configured.library` 读取；从任何工作目录运行都可以。

Windows 使用目录 junction，其他平台使用目录符号链接。源文件编辑、新增或删除后，项目会直接看到变化。

## 使用

在 PowerShell 中设置脚本位置和项目实际使用的 skill 目录：

```powershell
$skillLinkScript = '<ai-toolkit根目录>\skills\lsh\scripts\link-skills.mjs'
$skillSource = '<私有Skill库目录>'
$skillTarget = '<目标项目实际使用的Skill发现目录>'

# 安装指定 skill；先预览，确认后安装；可重复传入 --skill 安装多个
node $skillLinkScript install --source $skillSource --target $skillTarget --skill example-skill --dry-run
node $skillLinkScript install --source $skillSource --target $skillTarget --skill example-skill

# 查看已管理的链接和源目录状态
node $skillLinkScript status --source $skillSource --target $skillTarget

# 修复已安装项缺失的链接；先预览
node $skillLinkScript update --source $skillSource --target $skillTarget --all --dry-run
node $skillLinkScript update --source $skillSource --target $skillTarget --all

# 卸载指定 skill；先预览
node $skillLinkScript uninstall --source $skillSource --target $skillTarget --skill example-skill --dry-run
node $skillLinkScript uninstall --source $skillSource --target $skillTarget --skill example-skill
```

`--source` 是私有 Skill 库目录，`--target` 是项目实际用于发现 Skill 的目录。两者都必须明确指定。示例中的 `example-skill` 是占位名称，请换成源库中的实际 Skill 名称。脚本不会猜测路径。

先预览批量安装：

```powershell
node $skillLinkScript install --source $skillSource --target $skillTarget --all --dry-run
node $skillLinkScript install --source $skillSource --target $skillTarget --all
```

私有库搬家后，指定新的源库目录更新链接：

```powershell
node $skillLinkScript update --target $skillTarget --all --source '<新的私有Skill库目录>' --dry-run
node $skillLinkScript update --target $skillTarget --all --source '<新的私有Skill库目录>'
```

## 操作约定

| 命令 | 行为 |
| --- | --- |
| `install` | 创建链接。相同安装跳过，同名真实目录、文件或非本脚本管理的链接报告冲突。只安装含 `SKILL.md` 的目录。 |
| `update` | 修复缺失链接，或根据当前源库调整已有安装的源路径。源目录或 `SKILL.md` 缺失时报告异常并保留记录及链接。内容通过链接共享，无需复制更新。 |
| `uninstall` | 核对后解除链接、移除对应记录。链接已经缺失时清理记录。源 skill 保留，即使源已不存在仍可卸载。 |
| `status` | 检查已管理项的实际链接及源目录。默认查看全部已管理项，也支持 `--skill`。 |

`install --all` 发现源库直接子目录中的所有 skill；`update --all` 和 `uninstall --all` 只处理安装记录中的条目。新增 skill 通过 `install` 加入。

目标目录保存 `.skill-links.json`，记录格式版本、skill 名称和绝对源路径。修改、卸载前核对实际链接是否仍指向记录中的位置；被改成真实目录或其他指向时报告冲突。未记录的手动链接保留，需要自行处理后才能安装。

所有命令支持 `--dry-run`，预览时不创建目录、链接或记录。成功退出码为 `0`，冲突、异常或状态不正常为 `1`；批量操作允许其他正常条目继续执行，可再次运行失败项。输出 `create` / `repair` / `repoint` / `remove` / `forget` 分别表示创建、修复、调整指向、移除链接和清理缺失链接的记录。

修改时临时创建 `.skill-links.lock` 防止脚本并发修改同一目标。若进程被强制结束，确认没有运行中的操作后，可手动删除残留锁文件再重试。`.skill-links.json` 应保留以支持后续管理；它和本机链接通常加入项目的 Git 忽略规则。

源库与目标目录不能相同或互相包含。skill 名称使用字母、数字、点、下划线或连字符，以字母或数字开头；Windows 保留文件名不接受。脚本只解除已核对的链接，不递归删除 skill 目录。

源 skill 的版本由源库管理。脚本不下载远程仓库，`update` 更新的是本地链接关系。

## 测试

使用 Node.js 20+ 运行行为测试。测试在系统临时目录建立独立的源库、目标和链接，并在结束时清理自己的目录：

```powershell
node --test '<ai-toolkit根目录>\skills\lsh\tests\link-skills.test.mjs'
```

测试覆盖内容共享、重复操作、预览、源库搬家、缺失源与链接、目录及链接冲突、批量部分成功、锁竞争、记录写入失败恢复和路径别名。
