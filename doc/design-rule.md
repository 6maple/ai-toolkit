# c-skills Project Design Rules

> **用途：只记录 c-skills 仓库自身采用的设计、文档和交付规则。**
>
> 跨项目通用的认知原则以 [`ai-think/core.md`](ai-think/core.md) 为准；软件领域跨阶段稳定原则以 [`ai-think/software-core.md`](ai-think/software-core.md) 为准；软件迭代的阶段顺序和 Gate 以 [`ai-think/software-workflow.md`](ai-think/software-workflow.md) 为准。本文只说明这些通用方法在 c-skills 中怎样落地，以及本仓库特有的目录、truth owner 和工程约束。
>
> 当本文与某个 capability 的当前 Requirements / Contract / Design 冲突时，先按 `core.md` 恢复背景、目的和责任关系，判断是项目规则需要更新，还是 capability 文档理解有误；不能因为某个旧 artifact 已经存在就机械延续。

---

## 1. 文档职责与目录

c-skills 的文档按责任分层：

```text
doc/ai-think/core.md
    跨项目认知与判断基线

doc/ai-think/software-core.md
    软件领域中跨阶段稳定的 truth / Design / Test 原则

doc/ai-think/software-workflow.md
    软件迭代的阶段顺序、Gate、产出和回退关系

doc/ai-think/cognitive-model.md
    长篇认知案例与历史校准材料

doc/design-rule.md
    c-skills 项目自身规则

doc/ai-mds/
    AI / Agent 相关专项规则；只有对应任务适用时读取

doc/<capability>/
    具体 capability 的 Requirements / Contract / Acceptance / Design / history

code/<capability>/
    capability implementation
```

一个通用原则如果在不同项目仍然自然成立，应根据 owner 提升到 `ai-think/core.md`、`software-core.md` 或 `software-workflow.md`；`design-rule.md` 只保留 c-skills 自身需要的具体采用方式。

具体 capability 的产品 truth 只能由自己的当前规范拥有，不在 `design-rule.md` 复制一套近似定义。

---

## 2. c-skills 的 capability 迭代默认采用公共软件 workflow

当一个 capability 的改动已经进入稳定规格与交付阶段，c-skills 默认采用 [`ai-think/software-workflow.md`](ai-think/software-workflow.md) 定义的 Requirements / Acceptance / System Design / Detailed Design / Test / Implementation / Readiness 流程，并采用 [`ai-think/software-core.md`](ai-think/software-core.md) 的跨阶段 truth、Design 和 Test 原则。

简单改动可以合并相邻步骤；探索 / research 任务只做到足以回答当前 material question 的程度。具体 capability 如果需要偏离公共 workflow，应在自己的 README / Design / Test Strategy 中说明当前背景和理由。

---

## 3. capability 文档保持单一 truth owner

一个 capability 可以根据复杂度拆成多个文档，但同一个设计事实只保留一个 canonical owner。

推荐职责：

- BDD / Requirements：observable What；
- Contract：调用方 / 模型可见接口；
- Acceptance：Example 和 expected observable result；
- System Design：整体 black boxes、ownership、flow、failure boundary；
- Detailed Design：具体实现结构、算法、状态转换和关键操作；
- review：记录审查结论，不重新拥有被审查对象的 truth；
- implementation plan（仅在复杂执行确实需要时）：只组织 implementation slices、依赖、canonical refs、验证和 done condition，不重新描述 Detailed Design；
- archive：历史依据、已替代方案和讨论过程。

其他文档需要该事实时使用摘要 + canonical reference，不复制另一份完整规则。

复杂 capability 可以按：

```text
top-level System Design
→ subsystem / child black-box design
→ leaf Detailed Design
```

继续拆分。拆分依据是 semantic owner 和责任边界，不是文件长度。

---

## 4. 当前 truth 与历史资料分开

c-skills 会长期保留历史 discussion、旧版本 specification 和实现记录用于追溯，但这些材料只作为 evidence。

当前工作时：

1. 先读取当前 capability 的工作版本；
2. 需要理解背景或歧义时，再查看 archive / session history；
3. 区分“当前已经确认”“历史探索”“后来已被推翻”；
4. 新裁决形成后，更新当前 canonical 文档，避免只留在会话里。

历史材料需要保存时放到对应 capability 的 `archive/` 或明确的历史位置，不与当前 Working Specification 混在同一 truth 层。

---

## 5. c-skills 文档按公共表达基线编写

所有 normative docs、Prompt、Tool description 和自动注入 guidance 都采用 [`ai-think/core.md`](ai-think/core.md) §11 的表达基线：先保证语义正确、边界和因果清楚，并使缺少历史上下文、能力较弱的执行者也能稳定理解，再考虑去冗余和压缩。

c-skills 额外约定：对会 materially 影响实现的规则，优先直接给出完整路径、完整条件或 canonical reference。只有增加间接层确实降低当前理解成本时才引入新的抽象。

---

## 6. AI / Agent capability 的专项规则

当 capability 的主要执行者或 semantic owner 是 AI Agent 时，在公共 `core.md` / `software-core.md` / `software-workflow.md` 之外，再读取：

- [`ai-mds/agent-dev-rules.md`](ai-mds/agent-dev-rules.md)
- [`ai-mds/rules.md`](ai-mds/rules.md)（当对应内容适用）

设计模型可见接口时，应优先结合真实模型使用过程、训练先验、宿主能力和当前成熟 Agent 实践。外部实践需要查看实际接口、源码或真实行为后再判断可复用部分。

Prompt / Context / Tool / State 的具体分工属于该 capability 的 Design；项目规则不预设某个固定 Agent architecture。

---

## 7. Acceptance 和测试在 c-skills 中的落地

c-skills 的稳定 capability 行为默认按 [`ai-think/software-core.md`](ai-think/software-core.md) 的测试语义与资源边界，以及 [`ai-think/software-workflow.md`](ai-think/software-workflow.md) 的 Example Design、Test Review、Fake Green 和 Production Red/Green 阶段组织验证。

每个 capability 自己的 Test Strategy 只需要补充项目公共 workflow 无法决定的内容，例如哪些真实 filesystem / process / host / browser / LLM 验证进入 CI、integration、E2E、release gate 或 manual acceptance。

---

## 8. 实现和 review 使用当前 canonical specification

实现阶段直接读取当前 capability 的 Requirements / Contract / Acceptance / Design，并按 [`ai-think/software-core.md`](ai-think/software-core.md) 的 truth change 与双向审查原则，以及 [`ai-think/software-workflow.md`](ai-think/software-workflow.md) 的阶段回退规则处理偏差。Implementation Plan 不是实现前置条件；复杂迭代若保留 Plan，它只作为执行导航，不能替代 canonical specification / Design。

c-skills 的 review 必须同时包含当前规格的正向 traceability 和 Original Intent Reverse Audit；审查结论需要区分 implementation deviation、Design gap、Requirement gap，以及更早理解本身已经被新 evidence 推翻的情况。

---

## 9. 文档与临时材料保持干净

`doc/` 只保留仍承担当前 truth、跨项目基线、专项规则、历史追溯或明确导航职责的文档。

一次性 working notes 在完成使命后：

- 有持续 truth → 合并到 canonical owner；
- 有历史解释价值 → archive；
- 不再承担任何作用 → 删除。

不要让临时讨论稿长期和当前规范并列，迫使后续模型重新判断哪个才是 authoritative。

---

## 10. 文件写入与 Windows UTF-8

本仓库在 Windows 环境处理中文 Markdown 时，以明确 UTF-8 编码写入。

已有经验表明，旧 PowerShell 文本管道可能把中文真实写成字面 `?`。因此修改中文文档时优先使用能够明确保证 UTF-8 的工具或脚本，并在大规模文档修改后检查：

- 文件能按 UTF-8 正常读取；
- 没有异常 BOM / encoding drift；
- 没有大量字面 `?` 替代中文；
- `git diff` 中正文仍然完整。

如果文件内容已经真实损坏，转码不能恢复原文字，应从可信来源重建。

---

## 11. brain 等大型 capability 的版本化文档

对于已经采用版本化规范目录的 capability（当前主要是 `brain`），保持：

```text
doc/<capability>/vN/
    当前版本的 Requirements / Contract / Acceptance / Design

doc/<capability>/archive/
    跨版本历史 evidence

doc/<capability>/README.md
    当前工作版本、实现版本和阅读顺序
```

具体版本状态由 capability 自己的 `README.md` 拥有。项目级 `design-rule.md` 不复制具体版本号或行为结论。

---

## 12. c-skills 修改完成时的检查原则

每次能力迭代完成前，只运行与当前改动和该 capability Test Strategy 对应的检查。

至少确认：

- 当前 canonical docs 已同步；
- Requirements / Acceptance / Design / implementation 不存在已知语义漂移；
- 需要的 automated tests / typecheck / build / lint 通过；
- `git diff --check` 等基础仓库检查通过；
- 中文文档编码正常；
- 没有把已被推翻的历史语义继续留在当前文档或 tests 中。

具体命令由 capability 当前 toolchain 决定。例如使用 Vite+ / pnpm 的 package 按其 `package.json` 与 workspace 配置执行，不在项目级规则里假定所有 capability 共用完全相同命令。

---

## 13. 修改这些规则本身

`core.md`、`software-core.md`、`software-workflow.md` 和本文件都可以被真实反馈修正。

出现新的稳定认知模式时：

```text
跨领域仍成立
→ core.md

软件领域跨阶段仍成立
→ software-core.md

软件阶段顺序或 Gate
→ software-workflow.md

只在 c-skills 成立
→ design-rule.md

只在某个 capability 成立
→ capability 自己的 Requirements / Design / Test Strategy
```

修改前先确认是新增 truth，还是对已有规则理解不足。能通过澄清已有 canonical rule 解决时，优先改清楚原 owner，而不是继续增加平行规则。
