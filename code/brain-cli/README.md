# Brain CLI

辅助安装指定 Agent 的 Brain MCP、管理语义搜索依赖，以及迁移 Global 记忆。CLI 代码集中在此目录，运行时依赖相邻的 `brain` 包。

先在 `../brain` 构建，再在本目录运行 `pnpm install`。`node index.mjs --help` 显示当前命令；需要全局 `brain-cli` 命令时，可在本目录运行 `pnpm link --global`。

```text
brain-cli install --agent codex --source local --path <ai-toolkit目录>
brain-cli update --agent claude --source github --repository https://github.com/<owner>/<repo> [--ref <版本>]
brain-cli install --agent dsh --profile <名称> --source local --path <ai-toolkit目录>
brain-cli semantic-search install|update
brain-cli memory export --output <目录>
brain-cli memory import <目录>
brain-cli pack install brain-ai
```

Agent 安装命令会复制指定来源中的 Brain 与对应宿主插件，构建可运行产物，再调用宿主 CLI 接入；结果列出所用本地目录或 Git 提交、安装位置和后续重启提示。需要对应宿主 CLI、Node 与 pnpm。失败时保留已准备的版本目录，并报告失败的具体步骤；宿主信任和启用提示由用户完成。

记忆导出只处理 Global Core、Global archival 和记忆目录中的普通配套文件，保持 `global/...` 相对路径。有效且与正文匹配的争议状态随正文迁移，运行学习计数重置；状态损坏或失配时给出路径警告并继续。导入和包安装在 Brain 的 Global 协调锁内预检所有目标：相同内容跳过，冲突时整体停止；写入中断时报告完成和未完成路径。`brain-ai` 只提供 `pack install`，其三份正文位于 `default-memories/skill/brain-ai/`，安装时在 Global Core 增加一行入口。

`semantic-search install/update` 使用原安装脚本移入本目录的逻辑。依赖安装完成后仍需在 Brain 全局配置中启用语义搜索并重启宿主。模型可读的辅助说明见 [llm.txt](llm.txt)。
