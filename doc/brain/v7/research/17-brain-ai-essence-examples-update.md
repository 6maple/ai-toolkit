# brain-ai 本质法与联合示例正式同步

2026-10-03。用户在完整六篇候选与独立复审结果交付后回复“可以”，本轮据此同步正式 Global 方法、默认包、安装分发与当前文档。

## 用户意图与本次结果

brain-ai 以本质法为核心，帮助模型从真实目标、条件、约束和关系形成可修正的认识，并自主寻找、选择、组合和调整合适的方法，方法来源可以超出 brain-ai。其他方法继续承担直接指导作用，同时作为本质法的讲解与示例保留。用户特别要求自上而下与黑盒、中间记录、恢复及整体修正共同理解，并保留面向弱模型的明确读取与 checkpoint。实际模型效果由用户人工观察。

六篇正式正文位于 [默认包目录](../../../../code/brain-cli/default-memories/skill/brain-ai/)，同名内容已同步到 `@global/memories/skill/brain-ai/`：

| 正文 | 本次主要变化 |
|---|---|
| [core.md](../../../../code/brain-cli/default-memories/skill/brain-ai/core.md) | 从具体材料、实际过程与结果依赖条件形成暂定认识；说明方法适用、不适用和未知状态；联合讲解分层、黑盒、即时记录、恢复与返回整体；通过具体信息和条件变化示范方法选择与不过度设计。 |
| [software.md](../../../../code/brain-cli/default-memories/skill/brain-ai/software.md) | 从实际使用、外部关系与黑盒边界展开内部，结果返回整体；移动筛选示例说明不同条件下的动作，并路由 Agent 软件方法。 |
| [agentic-software.md](../../../../code/brain-cli/default-memories/skill/brain-ai/agentic-software.md) | 讲解 Prompt、Context、Tool 与工作材料怎样配合，明确设计者与目标 Task Lead 的能力和动作主体；本轮加入默认包。 |
| [instructions.md](../../../../code/brain-cli/default-memories/skill/brain-ai/instructions.md) | 根据实际关系使用短顺序链、并列项、条件分支或职责说明；明确未知、复合条件、主体和就近提醒；示例兼顾消歧、方法依据与迁移。 |
| [user-facing-expression.md](../../../../code/brain-cli/default-memories/skill/brain-ai/user-facing-expression.md) | 由接收者用途组织表达；区分进度答复与独立交接所需的信息。 |
| [report-writing.md](../../../../code/brain-cli/default-memories/skill/brain-ai/report-writing.md) | 区分并列准备项与可调整的阅读顺序；场地报告按实际总费用、超支或费用未知组织判断。 |

箭头用于确有先后关系的短主线，其余形式按关系选择。四项前置 checkpoint 仍先于主动历史发现与现实调查；认识可以暂定，后续新信息更新受影响部分，不要求每次重复九项。立即读取、拿不准时读取、现实取证、事实与推断边界、专业责任及继续完成有效授权范围内工作的要求继续保留。中间记录在后续依赖且重建成本高或丢失后果明显时立即进行。

## 同步与分发

- 实际 Global 六篇通过 `brain_edit` 修订，保留同一记忆身份；修改前逐篇比对当初完整审阅的 baseline，确认没有其间新增内容被覆盖。
- 默认包完整收录六篇；`memory.mjs` 的安装清单增加 `agentic-software`。已有 Global Core 一行入口继续使用，软件方法中的 Agent 软件读取目标随包安装。
- CLI README、模型使用说明、v7 当前架构、索引及 [10](../10-default-memory-pack-design.md)、[16](../16-model-facing-composition-review.md) 的完整正文镜像同步更新。记忆包仍只有安装命令，目标内容冲突时仍停止并报告。
- 完整候选与独立审阅记录保留在仓库 `.cache/brain-ai-essence-review-20261003/`；本轮覆盖前的仓库文件保存在该目录的 `before-formal-sync/`。该工作目录是本次过程材料，正式可分发正文以上述默认包为准。

## 检查与结论范围

正式写入后重新完整读取六篇，规范化换行后，候选、实际 Global 与默认包逐篇内容一致。两个文档镜像的六篇正文也与默认包核对一致。

CLI 全部现有测试执行 `node --test tests/*.test.mjs`，2 项通过：覆盖六篇原样安装、重复安装保持单一 Core 入口、用户修改冲突保护，以及 Global 导出/导入路径、状态处理与写入前冲突检查。本轮在现有安装测试中增加六篇文件清单及正文一致性断言，并更新导出清单。

独立审查此前指出的场地示例问题已在批准稿中修正：设备打包或另行收费均按所需设备可用及实际总费用判断。本轮同步复核另发现架构说明仍写“示例只解决实际歧义”，已修正为包含方法依据、配合关系与条件变化的教学用途。

这些检查支持文本同步与安装分发完整性，不证明弱模型实际执行效果。后续根据用户实际使用中的具体反馈继续调整。
