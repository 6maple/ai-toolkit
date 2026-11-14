# brain_step：固定工作提示词

模型是实际工作主体。程序仅按动作返回固定 Markdown：

| action | 返回 |
| --- | --- |
| `start` | `prompts/step2.md` |
| `ready` | `prompts/step3.md` |
| `review` | `prompts/step4.md` |

`prompts/step1.md` 是第一次调用 `start` 前由宿主或显式 Brain Skill 提供给模型的初始提示词。四份文本来自用户审核的原文，作为模型可见内容的唯一正式来源。

每次调用只需 `{ "action": "start" | "ready" | "review" }`，不使用 `turnId`、`message`、`result` 或持久 Step State，不检查动作顺序。模型每次独立调用一个动作，取得提示词后完成本步骤要求的思考或实际工作，再调用下一步。Step 4 要求模型在仍有值得改进之处时再次调用 `ready`，否则直接向用户汇报。

## MCP 入口

`registerBrainTools` 会注册 `brain_step`，直接注册也可：

```js
import { registerBrainStep } from "brain/step";
registerBrainStep(server);
```

宿主需要的 Brain 记忆恢复、项目绑定与 Git 历史维护属于 Brain 的其他能力。在现有显式 MCP 接入模式下，`start` 继续触发宿主的恢复处理；在 Codex/Claude/DSH Hook 模式下，恢复在用户消息入口执行。以上维护与固定 Step 提示词分发相互独立。

CLI 同样使用三个动作：`brain-skill step start`、`step ready`、`step review`；通过 `brain-skill step --intro` 可读取初始 Step 1 原文。

## 验证

工程测试应核对四份提示词与人工稿完全一致、MCP/CLI 只接受三个动作、任意顺序均返回对应固定文本、不会创建 Step State 文件，以及独立的 Brain 记忆与宿主恢复不受影响。模型是否真实查证、执行和改进需要实际使用场景验证。
