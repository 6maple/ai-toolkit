# Documentation

`doc/` 按“跨项目认知基线 → c-skills 项目规则 → capability 具体 truth”分层。

## Brain 的初始背景与当前设计入口

Brain 文档现在明确区分“跨版本根锚点”和“当前版本研究 / 设计”。

### 跨版本根锚点

[brain/base/](brain/base/) 只保存：

- Brain 最初为什么出现、真正希望改善什么；
- “做对做准”与“自主省事”的用户目标；
- 用户明确确认的长期设计思想；
- 分清 fact / evidence / inference / hypothesis、避免把合理解释当现实等认识论纪律。

Base 不保存当前版本的 LLM benchmark、Architecture、Prompt 或 implementation 方案。

### 当前 v7

[brain/v7/](brain/v7/) 保存当前正在形成的：

~~~text
LLM / cognition / Harness evidence
→ current interpretation
→ design derivation
→ current architecture
→ open / to validate
~~~

当前 v7 正在重做 Brain 的 cognition bootstrap、routing、project continuity 与 maintenance，并显式以 LLM 的 hallucination、unreliable metacognition、attention / trigger failure、premature convergence 等能力边界为输入。

v7 仍处于 **research / architecture design**，尚未批准最终 model-facing Prompt，也尚未授权基于该 Prompt 修改 production。

### 阅读

重新理解 Brain 时：

~~~text
brain/base/
→ brain/v7/
→ 按需要查看 brain/archive/ 历史原始 evidence
→ 对照对应历史版本或当前 production reality
~~~

详细版本状态与阅读顺序见 [brain/README.md](brain/README.md)。


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
