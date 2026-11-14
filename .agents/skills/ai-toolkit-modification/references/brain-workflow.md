# Brain 工作流与 Tool 契约

本模块用于涉及 Brain 工作引导、工具、宿主或持续记忆配合的设计、审查与修改。以用户最新确认的四份提示词和实际代码为准。

## 现行分工

用户实际评价的是模型完成的工作。模型根据初始「顶尖全能秘书」身份和提醒，自主理解用户的完整需求，主动取得有关的 Brain 记忆、网络和其他外部资料，作出有据的专业判断，调查、执行并检查实际结果。

`brain_step` 只返回固定的提示词，不保存模型的工作过程，也不替模型决定是否做完。当前正式 Prompt 统一放在 `code/brain/step/prompts/step1.md`～`step4.md`，以用户确认的最新文本为准。修改提示词须完整核对用户当前审定文本，不自行补写旧流程。

初始 Step 1 由 MCP 或宿主 Hook 向模型提供；后续 `brain_step` 只接收 `action`：

| action | 响应 |
| --- | --- |
| `start` | Step 2：重点资源与重新判断 |
| `ready` | Step 3：模型自主开展工作 |
| `review` | Step 4：检查实际质量，必要时再次 `ready` |

没有 `turnId`、`message`、`result`、`edits`、单轮 Step State、阶段顺序控制或确认动作。模型在每次返回的提示词要求完成之后，才单独调用下一个 Step 动作；Step 3 在完成实际工作并取得结果后进入 Review。模型按照 Step 4 原文决定是返工还是向用户正式汇报；95/100 分是模型引导，并非程序认证的评价。

## 源码与接入的核对入口

- `code/brain/step/views.mjs`、`engine.mjs`、`schema.mjs`、`guidance/tool-definition.json`：Prompt 路由、动作参数与工具描述
- `code/brain/src/integration/model-facing-text.ts`：统一输出 Step 1 初始提示词
- `code/brain/src/integration/mcp-adapter.ts` 与 `brain-skill-toolkit-cli/src/`：MCP/CLI 工具调用及独立的 Brain 恢复
- Codex、Claude、DSH 插件和 Tunnel：宿主初始提示、项目绑定及实际消费者
- `skills/brain/SKILL.md`：显式 CLI Skill 使用方法

长期 Brain Memory 的 Global / Project Core、Decision / Knowledge / Intention / Skill、项目工作文件与外部工具仍由各自现有职责维护；`start` 在显式 MCP/CLI 中保留原有历史和记忆恢复副作用，宿主 Hook 模式在用户消息入口完成恢复。这些职责不要求重建 Step State。

## 审查与验收

检视时对照用户完整目标、真实信息来源、工作结果及仍未完成的部分，注意因模型过早收敛、局部化或忘记约束产生的真实问题。模型有改进点时继续调查、修正并再次检视。

工程测试核对固定提示词原文、工具 Schema、MCP/CLI 和各宿主调用、记忆功能及项目隔离；真实模型能否积极调查和补做需以实际场景验证。历史四阶段六动作、State/Fix/Confirm 和动态 Think Workflow 已不属于现行 Step 契约，不按其说明增加新流程。
