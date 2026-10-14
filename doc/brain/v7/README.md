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

Base / v7 职责重构及 production Brain、CLI、可选记忆包已实现。2026-10-02 用户进一步把“先理解事情为什么会是现在这样”提升为通用认知主干，前置 checkpoint 保持四项但第二项由 `初步判断` 升级为 `本质认知`，当前为 `认知更新 / 本质认知 / 关联记忆 / 本轮计划`。外部资料触发仍按此前真实 failure 的修正工作：完成主动 semantic recall 后、进入现实调查和重要判断前，重新判断当前外部资料是否可能改变理解、判断或行动，需要时主动取得；决定不查时先说明具体理由，不能只凭模型知识、本地材料或自身 confidence 跳过，拿不准时先查再判断。2026-10-03 结合 Base 复核后又补回三项语义：边界清楚且遗漏代价高、取得成本低时在 bounded 范围内偏向 coverage；能够自行查明的先自行查明，只有用户拥有的信息或决定才能区分关键分歧时再主动询问；retrieval、历史 assistant 输出和已保存的模型 interpretation 不因被检索或重复出现就升级成 truth。结束本轮前实际核对 `当前判断 / 后续预判 / 关键存疑 / 记录维护 / 后续推进`，发现本轮可纠正的问题先处理，再简洁写下供后续工作使用的判断与必要依据。Brain bootstrap 的固定文字负责确定性读取 / discovery / scope 等通用协议，并新增“维护已有 cognition”的语义连续性 invariant：结构级修订不能静默删除或弱化未受当前变化影响、仍会改变判断或行动的明确语义；修改后重新读取核对。主动 recall、现实取证、澄清、行动与记录等任务方法仍由 `brain-ai/core.md` 拥有。

该变更已同步 [06-current-architecture.md](06-current-architecture.md)、[08-model-facing-and-memory-text-draft.md](08-model-facing-and-memory-text-draft.md)、[10-default-memory-pack-design.md](10-default-memory-pack-design.md) 与 [16-model-facing-composition-review.md](16-model-facing-composition-review.md)，实施记录见 [research/15-cognition-checkpoint-update.md](research/15-cognition-checkpoint-update.md)。2026-09-30 用户又批准并实施弱模型优先的 Prompt 写法、普通用户表达与正式报告写作三份 guidance，并由 `brain-ai/core.md` 明确路由；实施记录见 [research/16-expression-and-prompt-guidance-update.md](research/16-expression-and-prompt-guidance-update.md)。真实宿主与模型行为仍由用户实际使用验证。

2026-10-03，用户审阅并批准六篇本质法与联合示例正文，已同步实际 Global、六篇默认包及完整正文镜像。方法继续承担直接指导与示例讲解两种作用，强读取与九项 checkpoint 保留；实际模型效果由用户人工观察。详见[实施记录](research/17-brain-ai-essence-examples-update.md)。

2026-10-03，checkpoint 的关键论证、追溯边界与通用直白表达修订已获批准并正式同步。前四后五保留，详情见[实施记录](research/18-checkpoint-reasoning-boundary-update.md)。

2026-10-03，checkpoint 自检与纠正修订已获用户批准并正式同步。前四项与结束前五项承担实际判断、核对和纠正；过程中在重要判断用于行动前、新信息取得后、下层返回整体时检查受影响部分。写下简明判断、关键依据和必要变化供后续工作使用，发现偏差后同步修正方案、产物及必要记录，再继续推进。普通答复按用户需要组织。详见[实施记录](research/19-checkpoint-self-correction-update.md)。

2026-10-04，用户批准本质法直白引导与通用表达修订，已同步三篇正式方法。本质认知每轮按“目的 / 关系 / 边界”逐项写出、核对并纠正；过程中只更新受影响部分。表达由用户已有背景、当前需要与缺口推出回答作用、内容、深度与形式，独立审核区是需要判断候选时的具体应用。原前四后五、强读取、现实依据、追溯停止边界、黑盒、即时记录与恢复继续保留。详见[实施记录](research/20-direct-guidance-and-expression-update.md)。
