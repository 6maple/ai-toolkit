# Brain Skill Toolkit CLI

通过 `brain-skill` 使用 Brain，配套 skill 位于 [`skills/brain`](../../skills/brain/SKILL.md)。

目标项目接入现成 Brain 时，使用 [项目安装引导](INSTALL.md)，其中包含可直接交给项目 AI 的指令。该引导假定维护者已准备好命令和 skill，目标项目只安装项目级 skill 并验证公开 CLI。

以下为 Brain 维护者的准备说明。CLI 直接 import 相邻 `brain/src`，使用 unbuild stub 执行源码。

在仓库中先安装 `code/brain` 的运行依赖，再安装本目录依赖并生成 stub：

```powershell
pnpm --dir code/brain install
pnpm --dir code/brain-skill-toolkit-cli install
pnpm --dir code/brain-skill-toolkit-cli stub
node code/brain-skill-toolkit-cli/dist/brain-skill.mjs --help
```

## 本地安装命令：Windows / PowerShell

使用 `npm link` 将本地工程注册为 `brain-skill`，无需发布到 npm 或制作 release 包。它读取本包的 `bin`，在安装目录生成 PowerShell、CMD 和 Bash 启动器，并将包链接到当前源码目录。[npm link 官方说明](https://docs.npmjs.com/cli/v11/commands/npm-link/)

先完成上面的依赖安装与 stub 生成，然后从仓库根目录执行：

```powershell
$commandDirectory = Join-Path $HOME '.local/bin'
$savedPrefix = $env:npm_config_prefix
Push-Location 'code/brain-skill-toolkit-cli'
try {
    $env:npm_config_prefix = $commandDirectory
    npm link --ignore-scripts --offline --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Brain CLI 本地链接失败，请查看 npm 错误' }
} finally {
    if ($null -eq $savedPrefix) {
        Remove-Item Env:npm_config_prefix -ErrorAction SilentlyContinue
    } else {
        $env:npm_config_prefix = $savedPrefix
    }
    Pop-Location
}
```

确认 `$commandDirectory` 在用户或系统 PATH 中；其他协作者若尚未配置，将这个目录加入用户 PATH，然后重新打开终端及 AI 宿主。Node.js 也须在宿主 PATH 中可用，版本满足 `package.json` 的 engines 要求。安装不会自动修改 PATH。

临时 `npm_config_prefix` 指定稳定的全局安装位置，调用后恢复原值，不修改 npm 全局配置。不要把上面的设置改成 `npm link --prefix <安装目录>`：命令行 `--prefix` 会同时改变 npm 的本地包目录。使用 Node 版本管理器时，默认全局 prefix 可能位于特定 Node 版本目录，升级或切换版本后命令可能不可见。

本机安装位置为 `C:/Users/Maple/.local/bin`，已在系统 PATH 中；包链接指向本仓库的 `code/brain-skill-toolkit-cli`。

## 验证与日常使用

在仓库以外的目录，分别用 PowerShell 和 Git Bash 执行：

```powershell
brain-skill --version
brain-skill --help
brain-skill step --help
brain-skill step --schema
```

这些查询不初始化 Brain，不需要会话标识，也不调用模型。命令找不到时，PowerShell 用 `Get-Command brain-skill`、Bash 用 `command -v brain-skill` 检查解析位置和宿主实际 PATH。若 PATH 尚未更新，PowerShell 可先执行 `& "$HOME/.local/bin/brain-skill.cmd" --version`。

再按 [项目安装引导](INSTALL.md) 安装 skill 并验证目标项目绑定。完整宿主会话中的 think/step 流程需另行按其实际任务验证；安装检查不运行 think。

```powershell
brain-skill --project 'D:/Workspace/my-project' think
brain-skill --project 'D:/Workspace/my-project' cat '@project/core.md'
brain-skill --project 'D:/Workspace/my-project' grep '发布流程' --literal
```

完整命令、输入文件格式及错误处理见 [命令参考](../../skills/brain/references/commands.md)。所有命令都有 `--help`。默认数据根为 `~/.brain-data`，使用 `--brain-root` 选择隔离数据环境；`--project` 指定项目源码根。读写、争议与权限沿用既有 Brain 行为。

完整流程现已包含 `step --input-file <file|->`，直接复用 `brain/step` 状态机、schema 与指导；用 `step --schema` 取得完整输入定义。`think`、`step` 从 `BRAIN_SESSION_ID`、`CODEX_THREAD_ID` 或 `CLAUDE_CODE_SESSION_ID` 取得真实会话标识，也可显式传入同一个 `--session <真实宿主会话标识>`。缺少标识时明确失败。每次成功 think 建立新 CLI 轮次，同轮 step 进程复用绑定；按会话、项目及 Brain 数据根隔离。CLI 不依赖已安装的 MCP/hook 来取得轮次。

`build` 与 `stub` 都运行 `unbuild --stub`。安装和链接必须保留 CLI、相邻 Brain 源码及依赖的位置关系；源码更新后新命令进程使用更新内容。该目录按仓库内使用设计，不能仅复制 dist 文件执行。

源码内容更新后通常无需重新链接；依赖变化时重新安装对应依赖，构建配置或入口变化时重新生成 stub。仓库搬家后在新位置重新执行本地链接，再核对命令解析和版本。其他机器需要各自安装本地命令，复制 skill 不会安装 CLI。

卸载本机命令时，指定同一个安装目录和包名（包名为 `brain-skill-toolkit-cli`，命令名为 `brain-skill`）：

```powershell
npm uninstall --global --prefix "$HOME/.local/bin" brain-skill-toolkit-cli --ignore-scripts --offline --no-audit --no-fund
```

这里只移除全局包链接及命令启动器，仓库源码、项目 skill 和 Brain 数据仍保留。

语义搜索使用现有 Brain 可选运行时，每个命令自己创建与释放资源；轻量读取不启动 embedding。语义维护不可用时，写入先保留待更新标记，并报告降级。CLI 不配置 MCP 或自动恢复 hook；已有强制 Brain 接入的迁移需单独处理。

验证：`pnpm stub`、`pnpm test`、`pnpm typecheck`。测试使用临时目录与隔离 Brain 数据，不调用 AI Agent 或远程模型。
