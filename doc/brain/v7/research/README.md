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
