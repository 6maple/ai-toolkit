# v7 Research Notes

本目录保存 v7 的详细研究工作稿和从原 base/ 迁移出来的研究材料。

它们用于追溯：

- 研究依据；
- 当时的完整推导；
- 真实 case；
- 具体论文 / benchmark；
- 尚未压缩进当前综合文档的细节。

这些文件 **不单独拥有当前 v7 Architecture truth**。

当前综合 owner 位于上一级：

- ../03-problem-representation-and-control.md
- ../04-model-harness-brain-boundary.md
- ../05-design-derivation.md
- ../06-current-architecture.md

当研究笔记与上一级当前综合结论不一致时：

1. 先判断是否出现了新的有效 evidence；
2. 如果是，更新当前综合 owner；
3. 如果只是旧阶段推导，则把它作为历史研究上下文使用，不自动恢复为当前 baseline。

00-former-origin-and-mechanism-note.md 是迁移前 base/01-origin-and-goal.md 的完整工作稿，保留其中已经混入的每轮 restore、scope 和旧阶段设计分析，避免此次整理丢失未提交研究；它不是新的 Base owner。

09-prompt-body-writing-review.md 对照开源 Skill 正文和 2026-09-24 可查的官方 Prompt 指南，复核当前 Universal Root 候选的表述；它是 Prompt 写法研究，不是获批的最终文字。

10-stable-route-and-coverage-review.md 接续 Root 正文候选，审查 Global / Project 稳定路由、领域信息覆盖、活跃工作数量增长和工具不可用时的责任边界；其中的情境推演尚未经过模型 Replay。

11-brain-ai-collaboration-review.md 从 Base 的准确与省事双重目标出发，审查 `brain-ai/core.md` 的用户意图理解、两行说明和共同决定边界，保留已同步到记忆包与实际 Global 的完整正文；实际模型效果仍由用户验证。

2026-10-03，用户审阅并批准六篇本质法与联合示例正文，已同步实际 Global、六篇默认包及完整正文镜像。方法继续承担直接指导与示例讲解两种作用，强读取与九项 checkpoint 保留；实际模型效果由用户人工观察。详见[实施记录](17-brain-ai-essence-examples-update.md)。

2026-10-03，checkpoint 的关键论证、追溯边界与通用直白表达修订已获批准并正式同步。前四后五保留，详情见[实施记录](18-checkpoint-reasoning-boundary-update.md)。

2026-10-03，checkpoint 自检与纠正修订已获用户批准并正式同步。前四项与结束前五项承担实际判断、核对和纠正；过程中在重要判断用于行动前、新信息取得后、下层返回整体时检查受影响部分。写下简明判断、关键依据和必要变化供后续工作使用，发现偏差后同步修正方案、产物及必要记录，再继续推进。普通答复按用户需要组织。详见[实施记录](19-checkpoint-self-correction-update.md)。

2026-10-04，用户批准本质法直白引导与通用表达修订，已同步三篇正式方法。本质认知每轮按“目的 / 关系 / 边界”逐项写出、核对并纠正；过程中只更新受影响部分。表达由用户已有背景、当前需要与缺口推出回答作用、内容、深度与形式，独立审核区是需要判断候选时的具体应用。原前四后五、强读取、现实依据、追溯停止边界、黑盒、即时记录与恢复继续保留。详见[实施记录](20-direct-guidance-and-expression-update.md)。

2026-10-04，按用户授权完成 brain-ai 六篇表达改写与独立审查，仓库默认包和两份全文镜像已更新，供 Git 审核。实际 Global 沿用此前版本。详见[改写与审查记录](21-brain-ai-expression-edit-review.md)。
