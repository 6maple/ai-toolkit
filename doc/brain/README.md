# brain 文档入口

brain 文档按版本管理。每个版本目录保存该版本完整的 BDD / Public Contract / Acceptance / Design / Review；跨版本历史材料单独保留在 `archive/`。新版本可以从上一冻结版本完整派生，但一旦版本边界成立，就分别拥有自己的真相源，不能继续回写上一版本。

## 版本状态

| 目录 | 状态 | 用途 |
|---|---|---|
| [`v3/`](v3/) | **Current / Frozen Specification & Design / Implementation Validation** | 当前版本。完整继承 v2 后，重新裁决 model-visible anchor 的语义、结构与验证要求；BDD 62 REQ / 140 Scenario，Acceptance 59 cases。 |
| [`v2/`](v2/) | **Frozen Predecessor** | v3 的冻结前代基线。保留 v2 自己的完整规格、设计、审查和执行记录；后续变化不得回写。 |
| [`v1/`](v1/) | **Frozen / Implemented Baseline** | 2026-08-20 冻结并完成 production CI review 的早期实现基线。 |
| [`archive/`](archive/) | **Historical / Cross-version Evidence** | 早期问题分析、设计依据、旧 memory model、讨论过程、旧 TDD / review 等；用于解释演进和被否方案，不直接覆盖任一版本规范。 |

## 上位方法

- [`../design-rule.md`](../design-rule.md)：复杂系统从 BDD → Specification by Example → Test Design Review → Acceptance Freeze → Engineering Design 的设计/测试流程。
- [`../ai-mds/agent-dev-rules.md`](../ai-mds/agent-dev-rules.md)：Agent cognitive ownership、Prompt / Context / Tool / State 分工与真实 Replay / Eval 方法；brain 作为 agent cognition infrastructure 同样遵循这些原则。

## 阅读方式

讨论或实现当前 **v3**：

`design-rule + agent-dev-rules → v3/README.md → v3 BDD → v3 Public Contract → v3 Acceptance → v3 Review → v3 Design`

理解上一冻结版本 **v2**：

`v2/README.md → v2 BDD / Contract / Acceptance → v2 Design / Review`

追溯为什么形成这些设计：

`archive/README.md → archive/*`

## 版本边界

- 版本目录中的规范只约束自己的版本；实现证据不能反向改写已冻结 expectation。
- v3 对 v2 的继承以 v3 目录内的完整副本为准，不运行时引用 v2 作为第二真相源。
- `archive/` 只提供历史证据，不是 current contract。
- 根目录只维护版本索引和边界，不复制具体版本的 BDD / Contract / Acceptance / Design。
