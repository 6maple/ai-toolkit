# brain_step：单轮深度思考推进

模型是真正的工作主体；本工具把用户工作分为 Background + Goal、Method、Plan、Execute 四个阶段，每次只返回一项 Markdown 任务，并在每项工作与检视中提醒整体目标和当前目标。程序负责分配轮次 ID、校验动作、保存 State 及安排固定的下一步；模型负责调查、方法选择、实际执行、验证及客观检视。

## 宿主注册

`brain_step` 已通过 `registerBrainTools` 与 Brain 其它工具一同注册；也可以单独注册：

```js
import { registerBrainStep, createFileRuntime } from "brain/step";

registerBrainStep(server, () => createFileRuntime({ sourceRoot, brainRoot }));
```

宿主提供绝对项目路径 `sourceRoot` 和规范化的 Brain 数据根 `brainRoot`。MCP 调用通过 `turnId` 选择对应的 State。项目路由见 [MCP_HOSTS.md](../MCP_HOSTS.md)。

CLI 入口由 [brain-skill](../../brain-skill-toolkit-cli/README.md) 提供 `step --input-file` 和 `step --schema`，复用同一控制器及 State runtime。新代码部署后已运行的 Host/MCP 进程需要重启加载。

## 模型可见的六个动作

| 动作             | 输入                                         | 行为                                                                                      |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `start`          | `message`：本轮用户原消息                    | 省略 ID 时创建新 State，返回 Background + Goal / Work；带本轮 ID 和原消息时返回当前任务              |
| `submit_work`    | `result?`：当前任务完整新成果 Markdown       | 首次形成正式成果时保存正文，派完整整体检视；修正 work 已用 update 保存后，可以省略 result |
| `submit_review`  | `result?`：仅发现有据实质问题时提供 Markdown | 完整客观检视结束；空结果进入一次简短确认，有问题则派修正 work                             |
| `confirm_review` | `result?`：仅发现有据实质问题时提供 Markdown | 最后确认；空结果进入既定后继，有问题则派修正 work                                         |
| `update`         | `edits:[{old_text,new_text}]`                | 仅在 work 中调用 Pi edit 修改 State Markdown；找不到或出现多处匹配时建议 read             |
| `read`           | `turnId`                                           | 原样读取当前 State 的 Markdown 认知内容，不改变工作状态                                   |

除新轮 `start` 外，所有调用都传回本轮 `turnId`。相同消息可以开启不同轮次，各轮独立保存。

MCP `content` 的第一段返回任务 Markdown 或 State 原文，第二段返回本轮 `turnId`。工具固定契约说明动作，当前任务 Markdown 单独说明目标、质量要求和「本次提交」。JSON 无须提供 phase、taskId、next、outcome 或 confirmed。

## 实际推进

```text
start(message)          → Background + Goal / Work
submit_work(result)      → Background + Goal / Review
submit_review()          → Background + Goal / Confirm
confirm_review()         → Method / Work
submit_work(result)      → Method / Review
submit_review()          → Method / Confirm
confirm_review()         → Plan / Work
submit_work(result)      → Plan / Review
submit_review()          → Plan / Confirm
confirm_review()         → Execute / Work
submit_work(result)      → Execute / Review
submit_review()          → Execute / Confirm
confirm_review()         → 本轮结束，交付真实成果
```

下图中的后续动作均传入首次 `start` 返回的 `turnId`。任何 `submit_review(result)` 或 `confirm_review(result)` 都表示发现**实际有据的问题**，程序直接派一项修正 work；模型修改 State 后调用 `submit_work()`，程序派**新的一次完整 review**。上一轮 review 已经结束，不保存待恢复的旧 review，也不引入任务队列或单独 TaskState。

模型在任一 work 内可开展必要的调查、专业方法选择、编码、验证和中间文件记录，直到当前任务真正达到要求才提交。程序不能仅凭 result 非空证明理解、实现或质量正确，完整 review 必须对最新认识与实际证据作客观核查，必要时主动取得外部资料。

## State 与保存

State 按项目和 Brain 数据根隔离。每个轮次以 Brain 数据根和 `turnId` 的组合散列为文件名，保存在 `{sourceRoot}/.brain-working/brain-step/`。JSON 的 `state.contentFile` 引用同目录下的 Markdown 正文。同一轮次的操作通过文件锁串行执行。

`start` 初始化 State；`submit_work` 把新成果写入 Markdown；`update` 使用已安装的 `@earendil-works/pi-coding-agent` 的 **Pi edit** 完成已有原文的替换，支持其 Unicode 标点和空白规范化匹配，同时要求修改位置唯一、不重叠。找不到旧文或匹配多处时按错误建议 `read` 后重试。`read` 读取 JSON 指向的 `.md` 并直接返回全文，不改变状态。

正文变动时先写入新的 Markdown 文件，再原子写入引用它的 JSON；若 JSON 保存失败，原有 JSON 仍指向原有 Markdown，未确认的新文件会清理。更新成功后清理旧正文文件。单纯推进 review/confirm 时复用现有 Markdown 文件。State 存储和跨轮长期认知仍各有边界：跨轮长期记忆及项目持续材料由 Brain cognition 和正常项目工作文件负责。

本轮最终确认后的结果以实际有效 State、真实工具产物和用户可见交付为准；工程测试不等于已经验证模型的认知质量。升级后以 `start` 建立新的四阶段 State。
