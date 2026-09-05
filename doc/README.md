# Documentation

`doc/` 按“跨项目认知基线 → c-skills 项目规则 → capability 具体 truth”分层。

## Brain 的初始背景与目的

本节是 Brain 跨版本的 **original-intent owner**。它回答“为什么需要 Brain、最终希望改善什么”，用于审查后续 Requirements、Design 和实现是否虽然内部自洽，却已经偏离最初问题。具体工具、schema、算法、prompt、宿主接线和版本行为不由本节决定。

### 初始背景

整个问题建立在一个带约束的目标上：

```text
约束：准确理解并持续遵循用户真正的目标、取舍和已确认约束
目标：让 AI 主动承担能够完成的调查、判断和执行，减少用户重复提供背景与纠偏
```

现实中的模型和宿主无法仅靠静态 instruction 稳定满足它：

- 长会话存在 Lost in the Middle、attention dilution、context rot、压缩和裁剪；某条信息仍在 transcript 中，不表示它仍会实际影响模型。
- 最新 user message 容易冲掉先前目标、decision、commitment、constraint 和未完成工作。
- proposal、hypothesis、fact、decision、intention 和 completion 容易在多轮对话中被混淆或静默升级。
- 静态 skill、system prompt 或项目说明仍依赖同一个会衰减的模型主动注意和执行，不能单独形成可靠的连续性机制。
- 模型参数不会针对当前用户、项目和会话持续更新；只依赖 transcript 会迫使用户反复补背景和纠正。

### Brain 的目的

Brain 的目的不是建设通用知识库，而是在上述条件下提供一个外部、持久、连续维护的 cognition work surface：

```text
新的 user event 到达
→ 以有限 read-before-think 成本恢复此前形成的 working cognition
→ 主模型结合 latest user request、restored cognition 与相关 evidence 形成当前理解
→ 延续目标、decision、knowledge、intention、preference、constraint、commitment 和 reusable skill
→ 在确实形成或改变了需要跨未来持续的 cognition 时维护 Brain
→ 后续长会话、压缩、restart 或注意力衰减后仍可恢复
```

它最终应带来这些用户结果：

- 已经说明和确认的内容能在后续行动中继续起作用，而不只是“被保存过”。
- 未完成目标、承诺、进度和 remaining work 不因最新消息或长对话而静默消失。
- 早期但仍相关的 session detail 在 transcript 不再可靠时仍能按需找回。
- 用户不需要反复重述背景、偏好、约束和已经作出的决定。
- AI 能在保持连续理解的基础上提高自主性，而不是用更多提问把记忆负担退回用户。
- 获得上述收益所增加的 context、Tool 调用和维护成本保持 bounded，并由真实 Replay/Eval 证明值得。

### 跨版本稳定原则

- **机制管结构，模型管语义。** Brain runtime 负责 scope/path/schema、bounded selection、状态和确定性 invariant；主模型负责理解、相关性、写什么、怎样写以及怎样作用于当前任务。
- **恢复不是统一 authority 排名。** Governing instructions 继续拥有既有优先级，latest user message 定义当前请求；restored cognition 作为 working cognition 参与理解。Persistence、时间戳、磁盘位置或 context placement 本身不使 claim 自动升级或降级。
- **保持认知角色。** Proposal 不因保存变成 decision，intention 不证明已经完成，当前实现事实也不能无声抹掉不同命题上的既定方向或 commitment。
- **渐进披露。** Resident cognition 直接在场；其他 cognition 先给 bounded gist，summary 足够时直接使用，需要 exact detail 时再读取，未出现时再搜索。
- **事件触发不等于强制写入。** 新 user event 是恢复和 persistence judgment 的自然时机，不代表每轮、每个 ToolResult 或会话结束都必须 mutation。
- **清晰准确优先。** 语义正确和低歧义优先于省字符；同时不靠重复防御性限定或无限 context 换取表面遵循。
- **用实际行为验收。** Tool 被调用、关键词存在或 prompt 结构正确都不是最终成功；应观察 continuity、重复纠正、约束恢复、长会话表现和额外成本。

### 初始目的与派生设计的边界

以下内容可以服务于 Brain 的目的，但都不是目的本身，也不能因为已经实现或写进文档就反向成为不可改变的产品目标：

| 派生设计 | 为什么不是初始目的 |
|---|---|
| Markdown heading、XML-like tag、attribute 或具体 tag 名 | model-facing presentation 方案，可按目标模型的真实表现调整 |
| Codex/DSH hook、developer context、ToolResult 或 attention overlay | 宿主投递与注意力校准方案，不定义 cognition 本身 |
| `brain_*` 工具名称、数量、description、参数和 `brain_absolute_path` | 当前 public capability 设计，不是 Brain 存在的原因 |
| global/project/session 的具体路径、core/archival 文件形态 | continuity/residency 的当前表达，可由版本 contract 调整 |
| ranking、exposure、importance、feedback、learning 或 Git history 机制 | bounded recall 和维护的实现/设计选择 |
| claim-level evidence 规则和 cognitive-role wording | 为防止模型误用 cognition 形成的后续语义约束；必须服务于连续理解，而不能演变成通用推理流程 |
| 测试结构、Replay rubric 和校准参数 | 验证与调优方法，不是用户目标 |

判断一个新增设计是否合理，应反问：

```text
它解决了哪个已观察到的 continuity / recall / maintenance failure？
→ 为什么由 Brain 而不是 governing instruction、当前任务工具或宿主负责？
→ 是否实质减少用户重复背景与纠正，或提高后续行动连续性？
→ 是否有更小、更清楚、成立条件更接近的做法？
→ 怎样用真实模型行为和 context 成本验证？
```

回答不了这些问题的机制、规则或 prompt，不应仅因为“可能有用”进入 Brain。

原始历史 evidence 见 [brain/archive/01-problem-and-context.md](brain/archive/01-problem-and-context.md)、[brain/archive/02-design-rationale.md](brain/archive/02-design-rationale.md) 与 [brain/archive/06-discussion-log.md](brain/archive/06-discussion-log.md)。Archive 用于解释形成过程和被否方案，不直接覆盖当前版本 contract；当前版本入口见 [brain/README.md](brain/README.md)。

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
