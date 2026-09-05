# brain 文档入口

brain 文档按版本整理，文档规模应与实际变更相称。小范围调整可以只保留一份设计稿；只有确实需要完整规格、验收或工程设计时，才增加对应文档。跨版本历史材料单独保留在 `archive/`，不回写已经冻结的旧版本。

## 版本状态

| 目录 | 状态 | 用途 |
|---|---|---|
| [`v4/design-draft.md`](v4/design-draft.md) | **Design draft / Implementation pending** | 本轮 model-facing cognition interface 文案调整的唯一设计记录。尚未扩展为完整版本文档。 |
| [`v3/`](v3/) | **Current frozen specification and implementation baseline** | 当前完整规格与实现基线；完整继承 v2 后，重新裁决 model-visible anchor 的语义、结构与验证要求。 |
| [`v2/`](v2/) | **Frozen Predecessor** | v3 的冻结前代基线。保留 v2 自己的完整规格、设计、审查和执行记录；后续变化不得回写。 |
| [`v1/`](v1/) | **Frozen / Implemented Baseline** | 2026-08-20 冻结并完成 production CI review 的早期实现基线。 |
| [`archive/`](archive/) | **Historical / Cross-version Evidence** | 早期问题分析、设计依据、旧 memory model、讨论过程、旧 TDD / review 等；用于解释演进和被否方案，不直接覆盖任一版本规范。 |

## 上位方法

- [`../README.md`](../README.md#brain-的初始背景与目的)：Brain 跨版本的初始背景、目的、成功标准与防偏边界。
- [`../design-rule.md`](../design-rule.md)：复杂系统从 BDD → Specification by Example → Test Design Review → Acceptance Freeze → Engineering Design 的设计/测试流程。
- [`../ai-mds/agent-dev-rules.md`](../ai-mds/agent-dev-rules.md)：Agent cognitive ownership、Prompt / Context / Tool / State 分工与真实 Replay / Eval 方法；brain 作为 agent cognition infrastructure 同样遵循这些原则。

## 阅读方式

讨论或实现当前 **v3**：

`design-rule + agent-dev-rules → v3/README.md → v3 BDD → v3 Public Contract → v3 Acceptance → v3 Review → v3 Design`

讨论或实现当前 **v4 model-facing interface**：

`../README.md 的 Brain 初始背景与目的 → v4/design-draft.md`

理解上一冻结版本 **v2**：

`v2/README.md → v2 BDD / Contract / Acceptance → v2 Design / Review`

追溯为什么形成这些设计：

`archive/README.md → archive/*`

## 版本边界

- 已冻结版本中的规范只约束自己的版本；实现证据不能反向改写已冻结 expectation。
- v4 当前只记录本轮明确讨论的调整；未重开的行为继续以 v3 当前基线为准，不机械复制整套文档。
- `archive/` 只提供历史证据，不是 current contract。
- 是否增加 BDD、Public Contract、Acceptance 或 Detailed Design 取决于实际需要，不把完整文档集合当作版本成立的前提。
