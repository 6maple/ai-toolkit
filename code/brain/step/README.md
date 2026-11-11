# brain_step：单轮深度思考推进

模型是真正的工作主体；本工具以每次返回一项 Markdown 任务，帮助模型把完整意图、事实本质、实际工作与关键整体检视衔接起来。程序只保证可信身份、当前动作合法、State 保存及读取和确定的下一项工作；模型负责调查、实际执行、综合判断及客观检视。

## 宿主注册

`brain_step` 已通过 `registerBrainTools` 与 Brain 其它工具一同注册；也可以单独注册：

```js
import { registerBrainStep, createFileRuntime } from "brain/step";

registerBrainStep(
  server,
  createFileRuntime({
    async resolveHost(extra) {
      return resolveCurrentHostContext(extra);
    },
  }),
);
```

`resolveHost` 必须返回可信的 `conversationId`、`turnId` 与绝对路径 `sourceRoot`。这些由宿主绑定，不是模型传入的业务参数。标准 Brain 集成优先使用 `BrainToolInvocation.stepHost`，也支持实际 MCP metadata 提供的 threadId/turnId；不同宿主的会话接线参见 [MCP_HOSTS.md](../MCP_HOSTS.md)。

CLI 入口由 [brain-skill](../../brain-skill-toolkit-cli/README.md) 提供 `step --input-file` 和 `step --schema`，复用同一控制器及 State runtime。新代码部署后已运行的 Host/MCP 进程需要重启加载。

## 模型可见的六个动作

| 动作             | 输入                                         | 行为                                                                                      |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `start`          | `message`：本轮用户原消息                    | 为本轮建立当前 State，返回首次完整意图任务；同轮同消息重复调用仅返回当前任务              |
| `submit_work`    | `result?`：当前任务完整新成果 Markdown       | 首次形成正式成果时保存正文，派完整整体检视；修正 work 已用 update 保存后，可以省略 result |
| `submit_review`  | `result?`：仅发现有据实质问题时提供 Markdown | 完整客观检视结束；空结果进入一次简短确认，有问题则派修正 work                             |
| `confirm_review` | `result?`：仅发现有据实质问题时提供 Markdown | 最后确认；空结果进入既定后继，有问题则派修正 work                                         |
| `update`         | `edits:[{old_text,new_text}]`                | 仅在 work 中调用 Pi edit 修改 State Markdown；找不到或出现多处匹配时建议 read             |
| `read`           | 无                                           | 原样读取当前 State 的 Markdown 认知内容，不改变工作状态                                   |

结果经 MCP `content` 返回**直接 Markdown 文本**，无 `structuredContent` / `outputSchema`。工具固定契约说明动作，当前任务 Markdown 单独说明目标、质量要求和「本次提交」。JSON 无须提供 phase、taskId、next、outcome 或 confirmed。

## 实际推进

```text
start(message)
    → 查清完整意图 work
submit_work(result)
    → 当前意图的完整客观 review
submit_review()          → 一次简短确认
confirm_review()         → 事实本质调查 work
submit_work(result)
    → 事实认识的完整客观 review
submit_review()          → 一次简短确认
confirm_review()         → 实际专业处理、执行与验证 work
submit_work(result)
    → 整体工作成果完整客观 review
submit_review()          → 一次简短确认
confirm_review()         → 本轮结束，交付真实成果
```

这是正常路径。任何 `submit_review(result)` 或 `confirm_review(result)` 都表示发现**实际有据的问题**，程序直接派一项修正 work；模型修改 State 后调用 `submit_work()`，程序派**新的一次完整 review**。上一轮 review 已经结束，不保存待恢复的旧 review，也不引入任务队列或单独 TaskState。

模型在任一 work 内可开展必要的调查、专业方法选择、编码、验证和中间文件记录，直到当前任务真正达到要求才提交。程序不能仅凭 result 非空证明理解、实现或质量正确，完整 review 必须对最新认识与实际证据作客观核查，必要时主动取得外部资料。

## State 与保存

按宿主真实会话 ID 隔离，在 `{sourceRoot}/.brain-working/brain-step/{SHA256(conversationId)}.json` 存放程序状态。JSON 的 `state.contentFile` 字段引用同目录下的当前 Markdown 文件；模型的已提交成果保存在这个 `.md` 文件中，JSON 不嵌入 Markdown 正文。

`start` 初始化 State；`submit_work` 把新成果写入 Markdown；`update` 使用已安装的 `@earendil-works/pi-coding-agent` 的 **Pi edit** 完成已有原文的替换，支持其 Unicode 标点和空白规范化匹配，同时要求修改位置唯一、不重叠。找不到旧文或匹配多处时按错误建议 `read` 后重试。`read` 读取 JSON 指向的 `.md` 并直接返回全文，不改变状态。

正文变动时先写入新的 Markdown 文件，再原子写入引用它的 JSON；若 JSON 保存失败，原有 JSON 仍指向原有 Markdown，未确认的新文件会清理。更新成功后清理旧正文文件。单纯推进 review/confirm 时复用现有 Markdown 文件。State 存储和跨轮长期认知仍各有边界：跨轮长期记忆及项目持续材料由 Brain cognition 和正常项目工作文件负责。

本轮最终确认后的结果以实际有效 State、真实工具产物和用户可见交付为准；当前实现没有通过模型实测证明认知质量增益。旧三阶段状态文件保留在原 `brain-step-three-phase` 目录，升级不会把旧数据按新 schema 解读。
