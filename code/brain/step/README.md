# brain_step：固定提示词

模型按四份正式提示词开展工作。工具验证 `action` 和非空 `thought`，返回一行当前项目路径及对应提示词，不保存步骤状态。

| action | 参数 | 返回 |
| --- | --- | --- |
| `start` | `action`、`thought` | `prompts/step2.md` |
| `ready` | `action`、`thought` | `prompts/step3.md` |
| `review` | `action`、`thought` | `prompts/step4.md` |

`prompts/step1.md` 由 MCP、宿主或 CLI Skill 在首次 `start` 之前提供。模型按当前提示词的要求完成思考或实际工作，再提交对应动作。Step 4 若仍有改进点继续 `ready`，否则正式汇报。

## MCP 与 CLI

`registerBrainTools` 注册此工具，也可以使用 `registerBrainStep(server)` 单独注册。

CLI 通过 `brain-skill step --intro` 获取 Step 1。完成要求后调用：

```powershell
brain-skill --project '<项目根目录>' step start --thought '初步认识'
```

后续按提示词独立调用 `step ready --thought '...'` 或 `step review --thought '...'`。长内容可通过 `--thought-file <file|->` 传入。

显式 MCP/CLI 首次 `start` 仍执行独立的 Brain 记忆恢复和历史维护；Codex、Claude、DSH 宿主在用户消息入口恢复。Brain 长期记忆与本工具的固定提示词返回是不同职责。

## 验证边界

测试核对四份提示词、输入约束、MCP/CLI 调用及宿主恢复。程序验证参数与返回内容，模型是否真正充分思考、实际完成任务仍需在真实场景中观察。
