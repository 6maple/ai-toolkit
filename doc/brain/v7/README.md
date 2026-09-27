# Brain v7

v7 是当前正在形成的 Brain 研究与设计版本。

它建立在 [Base](../base/README.md) 的跨版本根锚点上，但 v7 中的研究解释、架构和 Prompt 都是 **当前阶段可修正的内容**，不能反向改写 Base 的初始目标和用户设计思想。

## 阅读顺序

推荐：

~~~text
../base/01-origin-and-goal.md
→ ../base/02-design-philosophy.md
→ ../base/03-epistemic-discipline.md
→ 01-llm-capability-and-failures.md
→ 02-generalist-cognition-research.md
→ 03-problem-representation-and-control.md
→ 04-model-harness-brain-boundary.md
→ 05-design-derivation.md
→ 06-current-architecture.md
→ 07-code-and-cognition-change-proposal.md
→ 08-model-facing-and-memory-text-draft.md
→ 09-grounded-design-audit.md
→ 10-default-memory-pack-design.md
→ 11-runtime-and-cli-contract-review.md
→ 12-weak-model-usage-audit.md
→ 13-body-semantic-search-design.md
→ 14-implementation-contract-review.md
→ 15-complete-model-facing-contract.md
→ 16-model-facing-composition-review.md
~~~

需要核对详细研究过程、原始长篇分析和迁移前 Base 内容时，再进入 research/。

## 文档角色

| 文档 | 主要角色 |
|---|---|
| 01-llm-capability-and-failures.md | 当前模型能力 / failure evidence，以及直接 design implication |
| 02-generalist-cognition-research.md | 人类高水平通用认知研究，以及哪些机制值得迁移到 Agent |
| 03-problem-representation-and-control.md | 对 frame、浅看、证据越级、metacognitive control 的当前综合理解 |
| 04-model-harness-brain-boundary.md | Model / Harness / Brain / Tool / User 的当前责任边界 |
| 05-design-derivation.md | 从 Base + evidence 向 Brain 设计推导的详细工作文档 |
| 06-current-architecture.md | 当前已经收敛的 v7 baseline、Prompt Gate 与开放问题 |
| 07-code-and-cognition-change-proposal.md | Brain 代码改造与现有认知迁移的讨论方案，含顺序、验收和待裁决事项 |
| 08-model-facing-and-memory-text-draft.md | Brain runtime、公共工具与可选记忆包的中文正文草稿，供用户逐段审核 |
| 09-grounded-design-audit.md | 用真实任务与当前实现复核整套方案，区分已确认要求和仍需证据的实现选项 |
| 10-default-memory-pack-design.md | 从真实任务重新设计可选默认记忆包，给出完整中文正文、入口与静态审查场景 |
| 11-runtime-and-cli-contract-review.md | 对照当前实现审查 runtime 文字、宿主接入与 CLI 的最小契约及未落实边界 |
| 12-weak-model-usage-audit.md | 以较弱模型实际执行链审查入口、搜索、候选读取和工具可用性，提出待验证的触发规则 |
| 13-body-semantic-search-design.md | 明确只按 frontmatter 的 summary 做语义发现、正文供 grep 文字搜索、按记忆返回路径、description 与 summary 的目标契约，并记录改造后单独补写旧记忆摘要的顺序 |
| 14-implementation-contract-review.md | 汇总生产修改前的 CLI、记忆、索引、宿主与活跃路线实施契约及验收顺序 |
| 15-complete-model-facing-contract.md | 补齐所有公共工具输入字段、结果边界与 CLI 面向模型的中文候选说明；与 08、10 合成完整审核稿 |
| 16-model-facing-composition-review.md | 完整模型可见文字实施审核稿：组合自动建立、显式调用、失败诊断、动态数据格式、CLI、包正文和工具文字；示例 Core 与候选数据由真实内容替换 |
| research/ | 支撑上述结论的详细研究工作稿；不单独拥有当前 Architecture truth |

## v7 的证据纪律

v7 写作时区分：

~~~text
Confirmed input / owner decision
Evidence / observation
Current interpretation
Current design derivation
Open / to validate
~~~

“写进 v7”不意味着已经变成事实。

尤其：

- 模型生成的合理解释仍然是 inference；
- search / retrieval 命中仍然只是 candidate evidence；
- 当前 Design 是当前 baseline，不是 Base 原始目的；
- 未经过真实 Replay / Eval 的 Prompt 行为，只能报告为待验证。

## 当前阶段

Base / v7 职责重构及完整模型可见文字审核已完成，用户已批准按 [16-model-facing-composition-review.md](16-model-facing-composition-review.md) 实施。production Brain、CLI 与可选记忆包已在工作区实现，核心测试、CLI 记忆操作测试、类型检查和 Brain 构建通过。随后依照 [通用协作记忆审查](research/11-brain-ai-collaboration-review.md)，已更新记忆包正文与实际 Global 记忆；Codex、Claude、DSH 的宿主接入和模型行为由用户人工验证。
