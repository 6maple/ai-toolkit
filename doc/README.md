# Documentation

`doc/` 按“跨项目认知基线 → c-skills 项目规则 → capability 具体 truth”分层。

## Cross-project baseline

| 文档 | 职责 |
|---|---|
| [ai-think/core.md](ai-think/core.md) | 跨项目认知与判断基线：如何理解 evidence、恢复意图和因果、判断责任/后果、控制复杂度并形成最小充分行动。 |
| [ai-think/software-core.md](ai-think/software-core.md) | 软件领域中跨阶段稳定的 truth ownership、research-backed / project-native Design、Test 和验证原则。 |
| [ai-think/software-workflow.md](ai-think/software-workflow.md) | 软件任务的唯一执行入口，以及从 Requirements 到 Acceptance 的阶段顺序、Alignment Gate、产出和回退关系。 |
| [ai-think/cognitive-model.md](ai-think/cognitive-model.md) | 长篇认知案例与历史校准材料；用于理解这些原则怎样从真实讨论中形成。 |

## Cross-project specialization

| 文档 | 职责 |
|---|---|
| [ai-mds/](ai-mds/) | AI / Agent 类型项目适用的跨项目专项规则；只在对应问题具有 Agent 特性时叠加到 `core.md` / `software-core.md` / `software-workflow.md`。 |

## Project-level

| 文档 | 职责 |
|---|---|
| [design-rule.md](design-rule.md) | 仅记录 c-skills 自身采用的文档组织、capability 迭代、测试、实现和仓库规则。 |

## Capabilities

| 目录 | 内容 |
|---|---|
| [brain/](brain/) | brain 版本化 Requirements / Contract / Acceptance / Design 与历史 evidence。 |

新增通用规则时，先判断它在其他项目是否仍自然成立：跨领域认知原则进入 `ai-think/core.md`，软件领域的跨阶段稳定原则进入 `ai-think/software-core.md`，阶段顺序和 Gate 进入 `ai-think/software-workflow.md`；只有 c-skills 自身约定进入 `design-rule.md`。具体 capability 的产品 truth 保留在自己的子目录。
