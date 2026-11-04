# lsh 安装指引（人和 AI 均可直接使用）

这个 Skill 的作用是：用户**主动**调用 `/lsh`（Claude Code）或 `$lsh`（Codex）后，按需查看独立私有 Skill 库的索引、原始 `SKILL.md` 和相关引用，并管理普通 Skill。日常 Agent 会话只发现 `lsh` 这一个入口，不会自动枚举私有库的普通 Skill 元数据。

需要 Node.js 18+，无需额外安装 npm 包。本文件、`SKILL.md`、`scripts/lsh.mjs` 和源码可以直接交给另一个 AI 阅读与执行安装。**AI 安装时必须先确定用户要求的作用范围和真实私有库目录，先预览，再取得用户同意后执行**。不得直接复制文档中的示例路径当成每个人的默认配置。

## 安装前确定两件事

1. **私有 Skill 库**：用户自己的目录，里面直接包含 `<技能名>/SKILL.md`，可含 `link-skills.mjs`、`llm.txt` 和其它文件。例：`D:\Workspace\ai-mds\skills`。此目录不能本身位于宿主会自动扫描 Skill 的目录下。
2. **作用范围**：通常选**用户级**，这样无论在哪个项目里都可以显式调用；只在单个项目可用时选**项目级**，并提供项目根目录。两个作用范围是独立的，每个都保存自己的库路径。

## 安装命令

以下从仓库源码执行，将 `<ai-toolkit根目录>` 和 `<私有Skill库>` 换为本机真实的路径。先运行 `--help` 看完整参数。

用户级（Windows PowerShell，Node 18+）：

```powershell
$script = '<ai-toolkit根目录>\skills\lsh\scripts\lsh.mjs'
node $script --help
node $script install --user --library '<私有Skill库>'
# 核对预览结果中的 library、config、links 后再执行：
node $script install --user --library '<私有Skill库>' --apply
node $script status --user
node $script index --check --user
```

项目级：

```powershell
$script = '<ai-toolkit根目录>\skills\lsh\scripts\lsh.mjs'
node $script install --project '<项目根目录>' --library '<私有Skill库>'
node $script install --project '<项目根目录>' --library '<私有Skill库>' --apply
node $script status --project '<项目根目录>'
node $script index --check --project '<项目根目录>'
```

Unix / macOS 使用同一 Node CLI，把路径替换成对应的 POSIX 路径即可。命令支持从任意工作目录调用。

## 安装具体做了什么

执行 `install --apply` 时：

- **固定路径**：把规范化的私有库绝对路径写入所选范围的 `.agents/lsh.json`，例如 `{"version":1,"library":"D:\\Workspace\\ai-mds\\skills"}`。以后 `list/find/inspect/audit/index/create/...` 从该文件读取库路径，源码不内置任何安装者的机器路径；必须显式用 `--library` 才会临时覆盖当前命令的选择。
- **用户级链接**：`~/.agents/skills/lsh` 指向 `ai-toolkit/skills/lsh` 的原始源码目录，`~/.claude/skills/lsh` 再链接至前者。
- **项目级链接**：在 `<项目根>/.agents/skills/lsh` 和 `<项目根>/.claude/skills/lsh` 做相同的链接，配置位于 `<项目根>/.agents/lsh.json`。该配置含本机绝对路径，通常应加入目标项目的 `.gitignore`，以免误提交个人安装路径；安装器不会擅自修改项目的 Git 配置。
- **索引**：生成或更新私有库根目录的 `llm.txt`，但安装本身不会把普通 Skill 安装到客户端可发现目录。
- **保护已有内容**：真实文件夹、外来源链接、不同路径的已有配置都报冲突并保留原样。Windows 建立目录 junction，其它系统建立目录符号链接。

源码正式维护于 `ai-toolkit/skills/lsh`。如果希望像 Brain 一样在私有库也能通过 `lsh` 目录访问其源码，可以**单独**在库中创建指向此源码的链接；这个私有库链接不参与 Agent 默认发现，也不由用户/项目安装卸载命令管理。

## 日常使用

确认安装完成后，开启新的 Codex/Claude 会话，显式调用：

```text
/lsh 帮我找到适合读取这份飞书文档的私有 Skill，然后按其指引处理
$lsh 帮我检查本地 Skills 中 lark-doc 与 lark-drive 的职责边界与依赖
```

调用后 `lsh` 会检查 `llm.txt` 是否过期，读取索引并按需读取原始 Skill，解释具体耦合。用户**明确调用后**本次读取内容保留在当前会话上下文是正常现象；保证的是普通 Skill 元数据不会因安装 `lsh` 就默认加载。Codex 的 `agents/openai.yaml` 关闭隐式调用，Claude 的 `SKILL.md` 设置 `disable-model-invocation: true`；实际 CLI 版本的选择和上下文行为以宿主为准，需在新的会话里确认。

## 更换路径、升级与卸载

- 更换私有库：先处理当前范围的安装（按下方命令卸载），再用新的 `--library` 路径重新安装；操作不会删除库里的普通 Skills 或索引。
- 源码搬家：原链接以旧绝对路径为目标，需要先核对和重建作用范围内的链接。不要直接覆盖冲突目录；保留 `.agents/lsh.json` 的库路径，按安装预览识别和处理旧链接。
- 卸载入口（先预览）：

```powershell
node $script uninstall --user
node $script uninstall --user --apply
# 项目级：node $script uninstall --project '<项目根目录>' --apply
```

卸载仅处理所选范围的 `lsh` 链接与 `.agents/lsh.json`；不会删除原始 Skill 库、它的 `llm.txt` 或其他作用范围的安装。

如果曾使用旧名 `local-skill-helper`：先检查其用户级或项目级 `.agents/skills/local-skill-helper`、`.claude/skills/local-skill-helper` 的实际目标，以及私有库里相应的旧名称目录。确认确实是以前安装的同一源码链接后，再移除旧链接；**不要删除真实文件夹或未知来源链接**。之后按上方命令安装 `lsh`。历史初始背景和旧名称仍保存在 [BASE.md](BASE.md)。

## AI 安装自检

AI 应在本次被请求安装时，先读取本说明和脚本 `--help`，核对用户实际私有库路径和使用的宿主/项目，再执行 `install` 预览、向用户说明变更目标，得到同意后 `--apply`。安装结束读取 `status` 和 `index --check`，确认仅 `lsh` 两处链接与配置建立、所选库路径准确、索引当前有效。不得调用 Codex/Claude 执行模型测试，除非用户另有明确授权；需要真实宿主验证时给用户提供人工检查步骤。
