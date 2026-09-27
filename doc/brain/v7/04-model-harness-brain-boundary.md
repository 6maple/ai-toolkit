# 04 · Model、Harness 与 Brain 的责任边界

本文综合当前 v7 对 Model + Harness 系统以及 Brain 所处位置的理解。

详细研究过程见：

- [research/04-harness-as-cognitive-system.md](research/04-harness-as-cognitive-system.md)
- [research/05-harness-lower-bound-mechanisms.md](research/05-harness-lower-bound-mechanisms.md)
- [research/06-functional-cognitive-architecture.md](research/06-functional-cognitive-architecture.md)

本文属于 **Current interpretation / design derivation**。

## Confirmed input

Base 要求：

- 设计必须面向 LLM 的真实能力边界；
- 能机械保证的 invariant 不应主要依赖模型记住；
- AI 应主动取得可以自行访问的事实；
- user-owned goal / value / risk / authorization 仍由用户拥有；
- Prompt、Harness、Tool、external state 和真实 evidence 应各自承担自己最可靠的责任。
- 模型是 Brain 的直接使用者；Brain 是 Harness 的增强部分，故障要给模型可执行的说明，不阻止模型完成仍可完成的其他工作。

## Current interpretation

用户实际交互和使用的主体是 Model。Model 负责理解用户、形成判断、专业推理、调用工具、执行任务和表达结果；Brain、Harness、Tool 与 Runtime 都是在帮助 Model 更可靠地完成这些工作。

因此 v7 的设计顺序从模型能力边界开始：

~~~text
Model 能稳定做好什么
→ 哪些能力存在但不稳定
→ 哪些事实必须通过外部 source 才能知道
→ 哪些 invariant 可以由软件机械保证
→ 再决定 Brain / Prompt / Harness / Tool / Runtime 各自补偿什么
~~~

从系统工程角度，最终行为当然仍由 Model + Harness 共同产生；但这个描述不能模糊主体关系，也不能让 Harness / Brain 反过来承担本应由模型完成的语义理解与专业工作。

Model 提供强大的语言理解、模式识别、推理和生成能力，但它是概率性的、context-sensitive，而且不可靠地管理自己的 attention、uncertainty、long-horizon state 和 verification。

Harness 决定模型：

- 当前看见什么；
- 能读取什么；
- 能调用什么；
- 什么状态被外部保持；
- 怎样接入 repo / web / runtime / GUI / API；
- 怎样得到反馈；
- 哪些 hard invariant 被确定性限制。

Brain 是 Harness 中专门处理 **长期 cognition continuity + 每轮认知恢复 / 路由** 的子系统，不等于整个 Harness。

Brain 的某项能力失败时，宿主与工具应让模型看见失败发生在哪一步、该结果覆盖了什么范围、还能使用什么来源。模型自行判断哪些当前行动确实依赖缺失的认知，继续其他工作；Brain 不接管整个任务的运行许可。

## Responsibility boundary

### Model

适合承担：

- 语义理解；
- problem framing；
- 综合多个 evidence；
- 专业推理与方案设计；
- 对当前上下文中的 route / Skill 条件做语义判断；
- 对 Tool result 的任务语义解释。

不应单独依赖它保证：

- 每轮都会想起正确 Skill；
- 自己一定知道缺什么；
- 自己的 confidence 一定准确；
- 长任务阶段永不漂移；
- 自己对自己的 verification 一定可靠；
- permission / schema / CAS / protected state 等 hard invariant。

### Harness / Runtime

适合机械保证：

- 每轮确定性 hook / bootstrap；
- 当前 Project identity 与访问边界；
- permissions / sandbox / protected state；
- schema / input validation；
- stale-write / concurrency invariant；
- Tool result delivery；
- 当前阶段需要的固定 projection / renderer 行为；
- 可观测 runtime state 与 recovery。

### Brain

当前 v7 把 Brain 的核心职责收敛为三件事：

1. **Continuity**：未来仍需使用的 cognition 不因为 context、compaction、session 或时间变化而丢失；
2. **Recall / Routing**：已经存在的重要 cognition 在真正需要时能够重新靠近模型，而不要求模型记住具体地址或先准确意识到自己漏了什么；
3. **Cognition Maintenance**：长期 cognition 能被更新、纠正、challenge、supersede、close，避免把旧模型 inference 稳定放大成长期 truth。

active-work continuation、stable route、exact read、discovery 等都是服务这三项职责的候选机制，不是独立根目标。

Brain 不负责取代 repo、runtime、web、database 等现实 source of truth，也不负责把所有外部 information acquisition 统一收进 memory。

### Domain cognition / Skill

Domain Skill 是给模型使用的专业方法。它可以定义：

- 当前类型工作怎样调查、判断、设计、执行和验证；
- 通常需要覆盖哪些 Brain cognition、项目现实和外部信息；
- 哪些 coverage 是 Required / Default / Conditional；
- 什么 evidence / result 允许进入下一阶段或声明完成。

因此 Skill 的 coverage 可以跨 Brain、repo、runtime、web、Git、experiment 和 user-owned input；Brain 只负责其中长期 cognition 的保存与恢复。

### Tools / external evidence

当 claim 属于可以直接观察的现实事实时，优先由对应 source 提供：

- repo / filesystem；
- Git；
- test；
- runtime / log；
- official docs；
- web / provider；
- experiment。

Tool 返回的是 evidence，不自动决定高层语义。

### User

用户拥有：

- 自己的目标；
- 价值和偏好；
- 风险接受；
- 组织约束；
- 需要本人授权的重要变化。

AI 当前不知道一个技术事实，不意味着它属于用户。

## Current design consequence

后续机制应先问：

~~~text
这个 failure 的根因是什么？
↓
哪一层最可靠地补它？
~~~

例如：

| Failure | 优先补偿层 |
|---|---|
| 已存在的重要 cognition 被模型漏掉 | Brain route / bootstrap / bounded recall |
| 当前领域的方法或 evidence coverage 不清楚 | cognition / Skill |
| 当前外部事实模型无法直接知道 | 对应 source / Tool / live observation |
| 模型把局部 evidence 补成完整现实 | epistemic guidance + 更直接的外部 evidence |
| stale shared write | runtime CAS / exact update |
| permission 边界 | Harness / Tool |
| 长任务跨 context / session continuity 丢失 | Brain active-work continuity + bootstrap |
| completion claim 不可靠 | workflow gate + verification result |
| user-owned trade-off 缺失 | user |

不要因为 Prompt 最容易修改，就把所有问题都堆到 Prompt。

## Open / to validate

- 每轮 bootstrap 的最终 deterministic surface；
- Universal Root 哪些关系确实存在 upstream trigger failure，必须 resident；
- 哪些 domain coverage 只需要 Skill 自然语言规则，哪些真实 failure 值得升级为 deterministic Harness trigger；
- maintenance 哪些 trigger 值得机械化，哪些语义必须由模型理解；
- Host-specific adapter 怎样保持 Brain core Host-agnostic。
