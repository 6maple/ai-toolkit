# brain 文档入口

brain 文档按版本管理。版本目录保存该版本完整的 BDD / public contract / Acceptance / Design / Review；跨版本历史材料单独保留在 `archive/`，避免“当前规范”“已实现基线”和“历史依据”混在同一层。

## 版本状态

| 目录 | 状态 | 用途 |
|---|---|---|
| [`v2/`](v2/) | **Frozen Specification / Design Ready** | 当前下一版冻结规格。BDD 60 REQ / 126 Scenario，Acceptance 53 cases，Phase 4 Acceptance Freeze 已完成；**Phase 5 Engineering Design 是下一步，当前 production implementation 仍是 v1**。 |
| [`v1/`](v1/) | **Frozen / Implemented Baseline** | 2026-08-20 冻结并完成 production CI review 的上一版；当前 `code/brain/` 实现与校准文档仍以此版本为基线。 |
| [`archive/`](archive/) | **Historical / Cross-version Evidence** | 早期问题分析、设计依据、旧 memory model、讨论过程、旧 TDD / review 等，用于解释演进和被否方案，不直接覆盖任一版本规范。 |

## 上位方法

- [`../design-rule.md`](../design-rule.md)：复杂系统从 BDD → Specification by Example → Test Design Review → Acceptance Freeze → Engineering Design 的设计/测试流程。
- [`../ai-mds/agent-dev-rules.md`](../ai-mds/agent-dev-rules.md)：Agent cognitive ownership、Prompt / Context / Tool / State 分工与真实 Replay / Eval 方法；brain 作为 agent cognition infrastructure 同样遵循这些原则。

## 阅读方式

讨论或继续设计 **v2**：

`design-rule + agent-dev-rules → v2/README.md → v2 BDD → v2 public contract → v2 Acceptance → v2 Review`

理解当前 **production v1**：

`v1/README.md → v1 BDD / Acceptance → v1 Design → code/brain/src/**`

追溯为什么形成这些设计：

`archive/README.md → archive/*`

## 版本边界

- 版本目录中的规范只约束自己的版本；不要用 v1 implementation internals 反推 v2 expectation。
- `archive/` 只提供历史证据，不是 current contract。
- 根目录不再复制具体版本的 BDD / Contract / Acceptance / Design，避免出现第二份“当前真相”。