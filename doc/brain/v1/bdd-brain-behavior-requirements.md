# brain 行为需求（BDD）

> **状态：BDD Baseline / Re-reviewed（2026-08-20）**  
> **用途：行为需求基线（What），不是工程设计（How）**  
> A1~A9 已于 2026-08-20 确认；A10 在本轮 BDD re-review 中按新的 file → file 路径原则修订；A11 确认 feedback-only edit：`adopt` / `attribute` 在 delta=0 时允许 `edits=[]`，不要求伪造文本修改，`correct` 仍必须满足负 delta。当前 43 个 REQ / 72 个 Scenario 已完成抽象边界与功能维度复审，并作为 Acceptance Specification 的唯一行为输入。
>
> **稳定性约定：** REQ / Scenario / 已确认决策属于规范性内容，代码更新后仍然有效，除非先修改本 BDD。实现符合性与历史 gap 必须记录在独立 review 文档中，不再写入 BDD 作为章节。

## 1. 文档定位

brain 的目标不是提供一个普通“长期记忆数据库”，而是为 agent 提供一个**外部化、可持久、可审计的认知状态与记忆运行时**：在每个用户 turn 开始时恢复关键状态，并允许主模型在清晰的结构约束下读取、写入、纠正、移动和淘汰记忆。

本文档只回答：

- 系统对模型、宿主和持久数据**必须表现为什么行为**；
- 哪些 invariant 必须由程序机械保证；
- 哪些语义判断必须留给主模型；
- 各种正常、边界、失败场景下，可观察结果应该是什么。

本文档**不回答**：

- 使用哪种锁、事务、WAL、临时文件或 rename 方案；
- ID 使用 UUID、ULID、持久序号还是其他算法；
- questioned 降权具体系数；
- FSRS 参数具体数值如何标定；
- MCP host 如何实现协议级 hook。

这些属于后续设计文档或参数标定。

---

## 2. 文档关系与历史依据

当前行为真相由本 BDD 自身承载。其他文档按职责分层，不形成第二份行为需求。

| 文档 | 角色 |
|---|---|
| `doc/design-rule.md` | 设计与验证方法；用于处理新增问题和歧义，不覆盖已确认 BDD。 |
| `doc/brain/v1/brain-tools-contract.md` | 当前模型可见/public tool contract；与 BDD 一起约束公开接口。 |
| `doc/brain/v1/acceptance-spec-brain.md` | Frozen Specification by Example；把本 BDD 展开为可验证场景。 |
| `doc/brain/v1/design-brain-runtime.md` | Engineering Design；回答如何实现，不反向定义行为。 |
| `doc/brain/archive/*` | 历史问题分析、设计依据、旧领域模型、实现笔记、讨论记录与被替代测试资料；仅作为背景证据和决策追溯。 |

### 2.1 行为需求的裁决优先级

行为冲突首先回到本 BDD 与已确认决策；public tool 形状再对照 `doc/brain/v1/brain-tools-contract.md`。若仍存在真实行为歧义，应先讨论并修改 BDD，再同步 Acceptance、Design、Tests 与 production。

`doc/brain/archive/*` 可以解释历史原因和被否方案，但不直接覆盖当前规范。
---

## 3. BDD 约定与总原则

### 3.1 场景表达

本文档使用 Given / When / Then / And / But 描述对外可观察行为：

- **Given**：前置状态；
- **When**：触发事件或工具动作；
- **Then**：必须成立的主结果；
- **And**：同时必须成立的约束；
- **But**：明确不能发生的副作用。

### 3.2 总原则

**BR-P1：机制管结构，模型管语义。**  
程序能 100% 判断的结构、合法区间、状态机、安全边界、一致性必须机械保证；需要理解内容和意图的语义判断由主模型负责。

**BR-P2：工具纯程序化。**  
brain 运行时不得依赖独立 LLM 来判断记忆语义。

**BR-P3：单一记忆通道。**  
模型只通过公开的 brain 工具与 @-scheme 操作记忆；任何非公开机制存储都不得成为模型可寻址接口。

**BR-P4：渐进披露。**  
模型先获得足以决定“是否深入”的信息，再按需读取更多内容，避免无关正文污染上下文。

**BR-P5：清晰准确优先。**  
记忆表达的清晰度和准确性高于单纯压缩 token；容量限制不能迫使模型牺牲语义准确性。

---

### 3.3 Acceptance Specification 边界

BDD Scenario 必须优先使用模型/调用方可观察的产品语言表达：

- Given 优先由公开 brain 行为建立；
- When 指向公开 MCP / brain tool 动作；
- Then 描述公开返回、后续可观察记忆行为或稳定系统 invariant；
- 不因当前实现存在某个 helper、文件名、JSON schema、锁或 ID 算法，就把它写成 Scenario 前提；
- corruption / 可预期提交失败等正常公开接口无法制造的场景，可以描述“持久状态已损坏/提交失败”这一故障事实，具体如何注入故障留给 Fault Test / Design；强制进程终止属于已明确的 non-goal boundary，不要求 crash-recovery verification。

如果某条 REQ 只能通过当前内部表示才能说明或测试，应重新判断它是否真的属于 BDD，还是应下沉到 Design / Mechanism Test。
### 3.4 Scenario 验证层级

默认 Scenario 都应转化为 **Acceptance / Executable Specification**。公开接口无法自然制造前置故障的场景标记为 **[Fault]**；稳定但没有自然 public observation、若强行黑盒会造成慢/脆测试的系统性质可标记为 **[Invariant]**；纯算法/参数性质才标记为 **[Mechanism]**。

- **Acceptance**：Given/When/Then 优先全走公开 brain contract；
- **[Fault]**：允许 Given 用最小故障注入制造损坏/中断，When/Then 仍验证稳定系统行为；
- **[Mechanism]**：只验证 Design 中确实需要锁定的机制，不能替代功能 acceptance coverage。
# 4. 三层记忆与作用域

## REQ-SCOPE-001 三层持久记忆

系统必须支持：

- **global**：跨项目稳定记忆；
- **project**：当前项目长期记忆；
- **session**：当前会话记忆。

三层物理生命周期不同，但运行时必须能合并为一个整体记忆视图。

### Scenario SCOPE-001-A：每轮加载三层 core

**Given** global / project / session 均存在 core 内容  
**When** 当前用户 turn 执行一次有效 `brain_think`  
**Then** 返回结果必须同时包含三层 core  
**And** 顺序稳定为 global → project → session  
**And** 不要求模型分别发起三次读取。

## REQ-SCOPE-002 模型按语义选择写入层

记忆应该写入哪个作用域，由主模型根据“未来应影响哪些上下文”判断；机制只验证路径/作用域是否合法，并依据一次 mutation 实际 touched 的长期 layers 判断是否需要审批。

系统不得把“先写 session，之后再晋升”变成固定规则。

> **依据：** `doc/02` 明确“模型自选写层”；`doc/06` 的演进历史也支持由模型做语义作用域判断。
### Scenario SCOPE-002-A：天然全局内容可直接写 global

**Given** 模型判断一条内容天然应跨项目生效  
**When** 模型选择 global 作为目标层  
**Then** 系统不得要求该内容先写 session  
**And** 不得要求先积累成功使用次数、达到晋升阈值后才能成为 global  
**And** 若 protect 开启，仅执行长期层审批。

---

# 5. 每轮锚定与事件时间

## REQ-THINK-001 brain_think 是每轮认知锚工具

brain 必须暴露 `brain_think`。其 tool description 必须明确要求模型：**收到每条新的用户消息后立即调用一次；拿到 `brain_think` 返回的 memory view 后，将其作为当前记忆继续思考、回答和行动。**

本次调用加载三层 core、L0 candidates 与机制 signals，并推进记忆事件时间。调用方是否通过宿主 hook、plugin 或模型显式调用来保证这一调用纪律，属于**外部集成层**，不属于本 BDD 的范围。

### Scenario THINK-001-A：有效调用

**Given** 模型刚收到一条新的用户消息  
**When** 模型立即调用 `brain_think`  
**Then** 返回结果包含三层 core、L0 candidates 与机制 signals  
**And** 本次调用推进一次事件时间  
**And** 模型应在拿到该 memory view 后再继续本轮思考、回答和行动。

## REQ-THINK-002 每次 brain_think 调用都表示一次新的 think 事件

每次成功调用 `brain_think` 都视为一次新的 think 事件，并正常推进 tick 与本次 L0 exposure。BDD 只规定这一可观察行为；是否存在额外调用标识或去重机制属于设计层，不在此规定。

### Scenario THINK-002-A [Invariant]：连续调用两次

**Given** 同一 session 已成功调用过一次 `brain_think`  
**When** 再次调用 `brain_think`  
**Then** 第二次调用仍视为新的 think 事件  
**And** 第二次调用必须被当作新的 think event，后续所有基于 brain event 的行为都应体现新增的一次事件。

> **确认结论 A1：** 正确性依赖 `brain_think` description 的调用纪律——收到每条用户消息后立即调用一次，并基于返回记忆继续思考；brain 不对重复调用做特殊处理，每次实际成功调用都正常推进事件时间。

---

# 6. 记忆命名空间与路径安全

## REQ-PATH-001 模型只能访问抽象记忆命名空间

模型可见地址只允许：

- `@/memories/...`：project archival；
- `@/sessions/<sid>/memories/...`：session archival；
- `@global/memories/...`：global archival；
- `@core/global.md`；
- `@core/project.md`；
- `@core/sessions/<sid>.md`。

任何非公开机制存储、内部索引、审计载体或物理文件地址都不可被模型直接寻址。

### Scenario PATH-001-A：机制文件不可寻址

**Given** 模型尝试构造指向机制文件的 @ 路径  
**When** 任一 brain 工具解析该地址  
**Then** 必须拒绝  
**And** 不得把真实文件系统路径暴露给模型。

### Scenario PATH-001-B：非 @-scheme 物理路径不可作为模型地址

**Given** 模型向 brain tool 提供绝对文件系统路径或其他非公开地址  
**When** 工具解析该地址  
**Then** 必须拒绝  
**And** 返回信息不得把内部物理路径转换成新的可寻址接口。

### Scenario PATH-001-C：brain_ls 只浏览公开 memory namespace

**Given** 一个 memory directory 中存在若干公开 archival items  
**When** 模型调用 `brain_ls` 浏览该目录  
**Then** 返回公开可寻址的 memory entries / directories  
**And** 不返回非公开机制存储或 recycle/audit 载体。

## REQ-PATH-002 session id 是标识符，不是路径

任何来源的 session id，包括 `brain_think.session_id`、MCP `_meta`、`@/sessions/<sid>/...`、`@core/sessions/<sid>.md`，都必须按“单一安全标识符”验证，不得具有路径语义。

### Scenario PATH-002-A：拒绝路径穿越 session id

**Given** session id 含 `..`、路径分隔符、空值、控制字符或其他非法路径成分  
**When** 它被用于定位 session layer  
**Then** 系统必须在任何文件操作发生前拒绝  
**And** 不得在预期 `sessions/<sid>` 之外创建、读取或修改任何文件。

### Scenario PATH-002-B：所有公开 session-id 入口使用同一校验

**Given** 同一个非法 session id  
**When** 它分别通过 `brain_think.session_id`、session @-path 或 core session @-path 进入系统  
**Then** 各入口都必须拒绝  
**And** 不得存在“某个入口能绕过 session-id 安全规则”的旁路。

## REQ-PATH-003 路径必须区分 directory、archival item、core

机制必须能确定一个地址是可浏览 directory、可读写 archival item 或 core document。写、编辑、删除、移动工具不得仅因地址“位于 memories 树内”就把目录当作 item。

### Scenario PATH-003-A：rm 不得作用于目录

**Given** `@/memories/knowledge` 是类型目录  
**When** 调用 `brain_rm`  
**Then** 必须拒绝  
**And** 目录及其中全部记忆保持不变。

### Scenario PATH-003-B：archival item 必须是合法 `.md` item

**Given** 地址为 `@/memories/knowledge/x.txt`、类型目录本身或其他非 archival item 路径  
**When** 该地址被用于一个明确要求 archival item 的参数位置（例如 write/edit/rm 的目标或 mv 的 source）  
**Then** 必须拒绝为非法 memory item 地址  
**And** `brain_mv` 的 source / destination 也默认要求明确文件级 public path；允许的 core ↔ archival / core ↔ core 例外仍然都是文件路径到文件路径。

---

# 7. Core 行为

## REQ-CORE-001 每层恰有一篇逻辑 core 文档

每层 core 在模型侧表现为一篇普通 Markdown 文档：global=`@core/global.md`，project=`@core/project.md`，session=`@core/sessions/<sid>.md`。不得向模型暴露内部容器索引或“每层多篇 core”语义。

### Scenario CORE-001-A：三层 core 以三篇逻辑文档出现

**Given** global / project / 当前 session 各有 core 内容  
**When** 执行 `brain_think`  
**Then** 三层 core 各以一篇逻辑文档出现  
**And** 模型不需要知道任何内部数组索引或多文档容器。

## REQ-CORE-002 core 由模型正常维护

模型可以通过 `brain_cat` 读取、`brain_edit content=...` 整篇替换，并通过 `brain_mv` 在 core ↔ archival、core ↔ core 之间移动。机制负责合法性、容量、审批、持久化和审计，不负责替模型做语义梳理。

### Scenario CORE-002-A：模型整篇替换 core

**Given** 当前 session core 已有旧内容  
**When** 模型通过 `brain_edit @core/sessions/<sid>.md content=...` 提交新内容  
**Then** 后续 `brain_cat` 与 `brain_think` 看到的是新 core 文档  
**And** 旧 core 内容不再作为该层当前 core 出现。

### Scenario CORE-002-B：直接读取 core 返回完整当前文档

**Given** 某层 core 已有内容  
**When** 模型对对应 `@core/...` 调用 `brain_cat`  
**Then** 返回该层当前完整 core 文档  
**And** 不要求模型使用 archival 的 L1/L2 分页流程来读取 core。

## REQ-CORE-003 core 超长时必须在提交前拒绝

### Scenario CORE-003-A：超限不产生部分修改

**Given** 新 core 内容超过当前配置允许的 core 文档上限  
**When** edit 或 mv 尝试写入 core  
**Then** 必须拒绝  
**And** 原 core 保持原样  
**And** 不得留下源已移走、目标未写成的部分状态  
**And** 返回可执行的整理提示：保留常驻要点，其余内容可移入 archival。

---

# 8. 渐进读取与检索

## REQ-READ-001 L0 只用于目录级发现

`brain_think` 的 candidates 是目录行，不展开正文。候选集必须有明确的单次返回上限，并来自三层 archival；具体上限属于 Design / Calibration，不由 BDD 锁死。candidate 至少需要向模型表达 layer、@-path、type、summary、排序/相关展示信息；若状态会改变语义判断，则必须暴露对应状态提示。

### Scenario READ-001-A：L0 不展开正文

**Given** archival memories 的正文包含仅在 body 中出现的细节  
**When** 执行 `brain_think`  
**Then** candidates 可以包含 path / type / summary / 状态提示等目录级信息  
**But** 不得把正文细节作为 candidate body 展开  
**And** 单次返回的 candidates 不超过当前设计规定的候选上限。

## REQ-READ-002 L1 只返回摘要级信息，L2 才进入正文

渐进层级固定为：`L0 目录 → L1 摘要 → L2 正文`。L1 不默认返回正文 preview。

> **确认结论 A2：** 历史材料 `doc/brain/archive/03-memory-model.md`、`doc/brain/archive/06-discussion-log.md` 中的渐进披露语义已被本 BDD 吸收：L1=摘要，L2=正文。

### Scenario READ-002-A：L1 摘要读取

**Given** 一个有效 archival item  
**When** `brain_cat` 未提供正文分页位置  
**Then** 返回 frontmatter summary 与必要元数据  
**And** 不默认加载正文大段内容。

### Scenario READ-002-B：L2 正文读取

**Given** 模型决定深入读取该 item  
**When** 以正文 offset / limit 调用 `brain_cat`  
**Then** 返回实际存在的正文页  
**And** 只有实际读到正文内容才产生 L2 read 事件。

## REQ-READ-003 空页不得强化记忆

### Scenario READ-003-A：offset 超出文件末尾

**Given** 一个有效 archival item  
**When** L2 offset 超过末尾，实际没有读到任何正文  
**Then** 可以返回 `(no more lines)` 等明确结果  
**But** 不得将其记为成功 L2 review  
**And** 后续行为不得把这次空读当成一次有效 L2 review 或成功使用。


## REQ-SEARCH-001 grep 是模型语义精化后的机械检索

`brain_grep` 只做确定性 regex / literal 检索。同义改写、隐式意图、query refinement 由主模型判断；brain 不内嵌 LLM；v1 不引入 embedding / RAG / fuse。

> `doc/06` 中早期 fuse 方案属于历史演进；现行需求以 `doc/05` 定稿的 grep + 主模型 query refinement 为准。

### Scenario SEARCH-001-A：literal grep 只返回机械匹配

**Given** memory A 含有目标 literal，memory B 只表达相近语义但不含该 literal  
**When** 模型用 literal 模式调用 `brain_grep`  
**Then** 返回机械匹配到的 memory A  
**And** brain 不自行把相近语义扩展成额外匹配；若模型希望扩大语义范围，应由模型改写 query / pattern 后再次搜索。

### Scenario SEARCH-001-B：regex grep 按表达式机械匹配

**Given** 多条 memories 的文本内容中只有部分满足某个 regex  
**When** 模型用 regex 模式调用 `brain_grep`  
**Then** 只返回满足该表达式的公开 memory 匹配结果  
**And** 不因语义相似而额外扩展结果。

---

# 9. 新增、编辑与 semantic contract

## REQ-WRITE-001 brain_write 对齐熟悉的 write：create 或整篇 overwrite

`brain_write` 的模型可见语义应对齐 coding/file `write` 的训练先验：目标不存在时创建，目标已存在时以新的完整 Markdown 文档覆盖该 item。`brain_edit` 则用于对已有内容做局部、精确修改；brain 不人为把 `write` 收窄成“只能 create”。

覆盖已有 memory item 时，它仍然是同一条记忆的完整内容更新：必须保留已有 mechanism learning state，不得因为 overwrite 偷偷把它变成一条全新、未使用的记忆。具体内部 id 如何保存属于设计实现细节。

> **A3 经 D4 修订：** `brain_write` 最终采用 create/overwrite 语义，以对齐项目实际复用的 write 工具训练先验。

### Scenario WRITE-001-A：目标不存在时创建

**Given** 目标 memory item 不存在  
**When** 提交合法的 `brain_write`  
**Then** 创建该 archival item  
**And** 为它初始化新的 mechanism state。

### Scenario WRITE-001-B：目标已存在时整篇覆盖

**Given** 目标 memory item 已存在  
**When** 提交合法的 `brain_write`  
**Then** destination 正文被新的完整文档覆盖  
**And** 后续 `brain_cat` / `brain_think` 等公开读取看到的 semantic metadata 与新文档一致  
**And** 已有 mechanism learning state 得到保留  
**And** 不得把 overwrite 误当成“新记忆创建”而重置 usage/status/FSRS 状态。

## REQ-WRITE-002 brain_write 的 resulting archival item 必须满足完整 semantic contract

无论 create 还是 overwrite，最终 item 至少必须具有：`type`=`decision|knowledge|intention|skill`、非空 `summary`、位于 `[0,1]` 的数值 `importance`。body 是普通 Markdown 正文，可为空。semantic contract 未通过时，不得先写文件再“尽量同步”。

### Scenario WRITE-002-A：缺失必填字段

**Given** write 内容缺少 type、summary 或 importance  
**When** 提交 `brain_write`  
**Then** 必须拒绝  
**And** 若目标原本不存在，后续公开读取/发现不得看到任何半创建 memory  
**And** 若目标原本存在，后续公开读取/发现必须仍看到操作前的完整 memory 状态。

### Scenario WRITE-002-B：字段存在但值非法

**Given** write 文档包含 type / summary / importance 字段  
**But** type 不在允许枚举内、summary 为空，或 importance 不是 `[0,1]` 内数值  
**When** 提交 `brain_write`  
**Then** 必须拒绝  
**And** 目标 memory 的公开可观察状态保持操作前不变。

### Scenario WRITE-002-C：semantic contract 的合法边界值可接受

**Given** archival document 的 type / summary 均合法  
**And** importance 分别取允许区间下界 `0` 或上界 `1`  
**When** 提交 `brain_write`  
**Then** 两种边界值都应被接受  
**And** 后续读取看到对应 semantic metadata。

### Scenario WRITE-002-D：正文可以为空

**Given** archival document 具有合法 type / summary / importance  
**And** Markdown body 为空  
**When** 提交 `brain_write`  
**Then** write 应成功  
**And** 该 memory 仍可被发现并读取摘要级 metadata。

## REQ-EDIT-001 edit 后的最终文档必须重新通过 semantic validation

edit 的合法性应基于**应用修改后的最终文档**判断。

### Scenario EDIT-001-A：importance 被改成非法值

**Given** 一个合法已存在 item  
**When** edit 的 resulting document 将 `importance` 改为非数字或超出 `[0,1]`  
**Then** 整个 edit 必须拒绝  
**And** 后续公开读取/发现必须仍看到 edit 前的完整 memory 状态。

### Scenario EDIT-001-B：type 或 summary 变非法

**Given** 一个合法已存在 item  
**When** edit 后 type 不在枚举内，或 summary 为空  
**Then** 整个 edit 必须拒绝  
**And** 不得留下“部分内容已变、其他可观察语义仍是旧值”的分裂状态。

### Scenario EDIT-001-C：合法局部 edit 成功更新 memory

**Given** 一个合法已存在 item  
**When** `brain_edit` 对正文或 semantic metadata 做合法局部修改  
**Then** edit 成功  
**And** 后续 `brain_cat` / `brain_think` 看到更新后的内容与 metadata  
**And** 未被修改的其余内容保持不变。

## REQ-TYPE-001 frontmatter type 必须与路径类型目录一致

例如 `memories/skill/x.md` 必须对应 `type: skill`，`memories/decision/x.md` 必须对应 `type: decision`。

> **确认结论 A4：** 两者必须一致。类型本身由模型判断，但“两处声明是否一致”是程序可机械判断的 invariant。

### Scenario TYPE-001-A：目录与 frontmatter 不一致

**Given** 目标路径是 `memories/skill/x.md`  
**And** resulting document 声明 `type: knowledge`  
**When** write/edit/mv 尝试形成该状态  
**Then** 必须拒绝  
**And** 后续公开读取/发现不得出现 public path 类型与 memory semantic type 互相矛盾的结果。

---

# 10. Feedback、纠正与 status

## REQ-FEEDBACK-001 模型选择反馈语义与取值，机制保证合法区间

合法 feedback：adopt delta∈`[0,+0.2]`；correct delta∈`[-0.3,-0.05]`；attribute delta∈`[-0.15,0]`。高 importance 的 correction 可按既有阻尼规则进一步收窄。

### Scenario FEEDBACK-001-A：方向与 feedback 矛盾

**Given** 原 importance = 0.5  
**When** `feedback=correct` 但新 importance = 0.6  
**Then** 必须 reject  
**And** importance 保持 0.5  
**And** 不得增加 failed/corrected-use 记录  
**And** 不得改变 status。

### Scenario FEEDBACK-001-B：方向正确但幅度越界

**Given** feedback 方向正确  
**And** delta 的绝对幅度超出该路径合法范围  
**When** 提交 edit  
**Then** 机制可以把幅度 clamp 到合法边界  
**And** 必须明确告诉模型发生了 clamp  
**And** 最终持久状态必须落在合法区间内。


### Scenario FEEDBACK-001-C：feedback-only 不要求伪造文本修改

**Given** 一条已有 archival memory，当前内容本身不需要修改  
**When** 模型实际采用它并提交 `brain_edit feedback=adopt edits=[]`  
**Then** 请求合法，并记录一次 successful-use feedback event  
**And** memory 正文与 semantic metadata 保持不变  
**When** 模型提交 `brain_edit feedback=attribute edits=[]` 且 delta=0  
**Then** 请求同样合法，并记录失败归因但不质疑内容本身  
**But** `feedback=correct` 仍必须满足其负 delta 合法区间，因此不能用 0-delta feedback-only correct。

> **确认结论 A5：** 方向错误 reject；方向正确但幅度越界 clamp + 明示。

## REQ-FEEDBACK-002 强纠正与轻纠正走不同路径

强纠正由模型选择 `brain_rm`；轻纠正由模型选择 `brain_edit feedback=correct`，importance 下调并进入 questioned；失败归因使用 `feedback=attribute`，记录失败但不质疑内容本身。系统不得引入独立 bans 结构；负向约束仍是普通记忆内容。

### Scenario FEEDBACK-002-A：轻纠正后仍可召回但标记存疑

**Given** 一条 active memory  
**When** 模型提交合法的 `brain_edit feedback=correct`  
**Then** memory 仍存在并可被后续检索/召回  
**And** `brain_think` 必须让模型知道它已处于 questioned。

### Scenario FEEDBACK-002-B：强纠正通过 rm 退出正常记忆

**Given** 一条 active memory  
**When** 模型明确选择 `brain_rm`  
**Then** 该 memory 不再出现在正常发现/召回结果中  
**But** 删除仍遵守可恢复、可审计的逻辑删除要求。

### Scenario FEEDBACK-002-C：失败归因不自动质疑 memory

**Given** 一条 active memory  
**When** 模型提交合法的 `feedback=attribute`  
**Then** 记录一次失败归因  
**But** 不得仅因为这次 attribute 自动把 memory 标记为 questioned。

## REQ-STATUS-001 questioned 必须对主模型可观察且机械降权

questioned item 仍可召回，但必须显示“存疑”，排序必须相对同条件 active item 降权，不参与正常 promotion，也不因一次轻纠正自动物理删除。

> **确认结论 A8：** BDD 只规定“必须降权 + 标记”；具体降权公式和系数留给设计/标定。

### Scenario STATUS-001-A：questioned 候选

**Given** 一条 questioned item 仍在 archival  
**When** 它进入 L0 candidate  
**Then** 模型必须能知道它处于 questioned  
**And** 它的排序应低于其他条件相同的 active item。

---

# 11. FSRS 与使用反馈

## REQ-FSRS-001 时间单位是有效认知事件，不是现实时间

系统不依赖现实时间做遗忘。retrievability 的衰减依据有效 brain event tick；每次成功 `brain_think` 调用推进一次 think event。正常调用纪律是每条用户消息立即调用一次，但 brain 不按 user turn 做去重。

### Scenario FSRS-001-A [Invariant]：墙上时间本身不构成记忆事件

**Given** 两组 otherwise equivalent 的 memory 状态经历相同的 brain event 序列  
**And** 其中一组调用之间经过更长现实时间  
**When** 执行下一次等价的 brain 操作  
**Then** 不能仅因为现实时间差而产生不同的遗忘/强化结果。

## REQ-FSRS-002 L0 只产生 exposure，不主动强化 stability

candidate 被 L0 展示时：exposure +1；retrievability 按当前 tick 的时间差自然计算；stability 不因“只看见目录行”而增强。

### Scenario FSRS-002-A：反复出现在 L0 不等于成功使用

**Given** 一条 memory 多次出现在 `brain_think` candidates 中  
**And** 模型从未对它提交 adopt  
**When** 继续产生 think events  
**Then** 系统不得仅因为反复 L0 曝光就把它视为成功使用  
**And** 不得仅靠 L0 曝光触发基于 successful-use 的 promotion。

## REQ-FSRS-003 L1、L2 read 与 adopt 的语义必须分开

> **确认结论 A6：** 读取和成功采用是不同事件。

行为定义：

- **L1**：摘要级 retrieval review，可轻量恢复记忆可提取性；
- **L2**：实际深入读到正文，表示“被重新取回/理解”，可恢复 retrievability，但**不等价于成功采用**；
- **adopt**：模型实际采用该记忆并形成成功行动时，才执行 FSRS good-style stability 强化并记录一次 successful use；
- **correct / attribute**：执行失败/纠正相关 review，并记录一次 failed/corrected use。

### Scenario FSRS-003-A：只读未采用

**Given** 模型读取了一条 memory 的 L2 正文  
**When** 没有发生 adopt  
**Then** 不增加 successful-use 记录  
**And** 不得把“读过”视为一次成功使用。

### Scenario FSRS-003-B：读取后成功采用

**Given** 模型已读取并在行动中实际采用该 memory  
**When** 明确提交 adopt feedback  
**Then** 增加一次 successful-use 记录  
**And** 执行一次成功采用所对应的 learning reinforcement  
**And** 不得因为前面的 L2 read 再额外重复一次同等 good 强化。

## REQ-FSRS-004 模型写 memory 时不需要提供 initial difficulty

> **确认结论 A7：** initial difficulty 属于机制初始化责任，不是 archival semantic contract 的模型输入。

### Scenario FSRS-004-A：合法 write 不含 difficulty 也能成功

**Given** 模型提交一个满足 type / summary / importance 的合法 archival document  
**And** 文档没有提供 difficulty  
**When** 调用 `brain_write`  
**Then** write 可以正常成功并产生可用 memory  
**And** 模型不需要知道或选择 initial difficulty 的内部默认值。

具体 initial difficulty 数值与后续更新算法属于 Design / Calibration，不作为 acceptance contract。
---

# 12. 晋升、降级与移动

## REQ-MOVE-001 archival 晋升只产生机械候选，由模型决定作用域变化

达到当前 successful-use promotion threshold 时，机制可输出 promotion-candidate，但不得自动改变记忆作用域。

### Scenario MOVE-001-A：达到晋升阈值

**Given** session item 的成功采用历史已达到 promotion threshold  
**When** 执行 `brain_think`  
**Then** 可以输出 promotion signal  
**But** item 仍留在原作用域  
**Until** 主模型基于语义判断主动执行 `brain_mv`。

## REQ-MOVE-002 core 与 archival 的移动语义必须无歧义

- archival → core：incoming 文档替换目标层 core；
- core → archival：源 core 清空，完整文档写出为 archival item；
- core → core：源 core 清空，目标 core 被替换；
- file → file：同层重命名或跨层移动。

任何替换/清空都必须服从一致提交、审批和容量规则。

### Scenario MOVE-002-A：core 移出前必须满足 archival semantic contract

**Given** source core 是普通 Markdown，尚未具有合法 archival 所需的 `type / summary / importance`  
**When** 模型执行 `brain_mv @core/... <archival-item-path>`  
**Then** 必须在清空 source core 或创建 destination 前拒绝  
**And** 提示模型先通过 `brain_edit` 为该 core 补齐合法 archival frontmatter，再重试 `brain_mv`  
**But** brain 不得替模型猜测 type、summary 或 importance。

### Scenario MOVE-002-B：archival 移入 core 替换目标 core

**Given** source 是合法 archival memory  
**And** destination core 已有旧内容  
**When** 模型执行 `brain_mv <archival> @core/<layer>.md`  
**Then** destination core 被 source 文档替换  
**And** source public path 不再表示 active archival memory  
**And** 后续 `brain_cat` / `brain_think` 看到新的 core 内容。

### Scenario MOVE-002-C：合法 core 移出到明确 archival item

**Given** source core 已具有合法 archival 所需的 type / summary / importance  
**When** 模型执行 `brain_mv @core/... <archival-item-path>`  
**Then** destination 成为可正常读取/检索的 archival memory  
**And** source core 被清空  
**And** 不得丢失 core 文档正文。

### Scenario MOVE-002-D：core 移到另一层 core

**Given** source core 有内容，destination core 也可能已有旧内容  
**When** 模型执行 `brain_mv @core/<source>.md @core/<destination>.md`  
**Then** destination core 被 source core 内容替换  
**And** source core 被清空。

## REQ-MOVE-003 跨层 archival move 必须保留已有学习历史

跨层移动不得把已有 memory 重置成“全新未使用记忆”。它在 source layer 已形成的成功使用、失败/纠正、questioned 等有效学习历史，移动后仍必须影响后续行为。具体内部字段与 identity 迁移方式属于 Design。
### Scenario MOVE-003-A：移动后继续沿用已有成功使用历史

**Given** 一条 session memory 已通过真实 adopt 行为积累成功使用历史，并且距下一次 promotion 条件只差一次成功采用  
**When** 模型将它 `brain_mv` 到 project，并再次对该 memory 提交一次 adopt  
**Then** 后续 `brain_think` 应按连续的累计使用历史判断 promotion  
**But** 不得把移动后的 memory 当作从零开始的新 memory。

## REQ-MOVE-004 brain_mv 的模型可见语义应对齐熟悉的 `mv`

`brain_mv` 的命名与基础行为应尽量保持模型对 shell/file `mv` 的训练先验，不人为发明不必要的 memory-specific 操作习惯。对 archival file → file move，若 destination 已存在普通 file item，则表现为 `mv` 的 replace 语义：source 移到 destination，原 destination 内容被替换，source 路径消失。

brain 额外负责的是**记忆系统一致性**：原 destination 不得继续作为另一条 active memory 出现，source 的有效学习历史必须随移动结果继续生效，且不得出现 phantom/duplicate memory 或一条 memory 的学习历史错误作用到另一条。具体内部 metadata / identity / audit 表示属于 Design。

### Scenario MOVE-004-A：目标 item 已存在

**Given** move 的 archival destination 已存在另一个合法 item  
**When** 执行 `brain_mv src dst`  
**Then** 对模型表现为熟悉的 `mv` replace 语义  
**And** destination 最终包含 source 的记忆正文  
**And** source 路径不再存在  
**And** 原 destination 不得继续作为另一条 active memory 被公开工具观察到  
**And** source 的有效机制学习状态随移动结果正确迁移  
**And** 不得留下可被公开工具观察到的 phantom/duplicate active memory。
### Scenario MOVE-004-B：directory 不能替代明确 destination file

**Given** source 是合法 archival item  
**And** destination 只给到 memory type directory，而不是明确 archival item path  
**When** 执行 `brain_mv src dst-directory`  
**Then** 必须拒绝  
**And** 提示模型提供明确的 destination file path  
**And** source memory 保持不变。

> **A10 经本轮 BDD re-review 修订：** `brain_mv` 保留熟悉的 file → file move/replace 语义，但 source / destination 默认都必须是明确的文件级 public path；memory type directory 不作为 destination shorthand。core ↔ archival / core ↔ core 是明确受控的 memory-specific 文件转换例外。

### Scenario MOVE-004-C：fresh file → fresh file

**Given** source 是合法 archival item  
**And** destination 是尚不存在的合法 archival item path  
**When** 执行 `brain_mv src dst`  
**Then** destination 可以读取到 source 的完整 memory 内容  
**And** source path 消失  
**And** 原有学习历史继续作用于 destination memory。

## REQ-DEMOTE-001 长期不用不得自动删除

低 retrievability + 低 importance 可产生 demotion signal。系统可以建议降低重要性、question 或移动，但不得机械删除正文；显式删除只由 `brain_rm` 等强纠正行为触发。

### Scenario DEMOTE-001-A：demotion signal 不自动执行删除

**Given** 一条 memory 已满足当前 demotion signal 条件  
**When** 执行 `brain_think`  
**Then** 系统可以返回 demotion signal  
**But** 在模型没有执行后续 rm / mv / edit 前，该 memory 仍保持可读/可检索  
**And** 不得仅因为长期不用自动物理删除。

---

# 13. 删除、回收与审计

## REQ-RM-001 rm 是逻辑删除，不是不可恢复物理销毁

有效 archival item 被 rm 后必须退出正常发现/召回，不再作为 active memory 使用；删除应属于可恢复、可审计的逻辑删除，而不是不可恢复的物理销毁。具体 recycle 与审计载体属于 Design。

### Scenario RM-001-A：rm 后退出正常发现与召回

**Given** 一条可正常读取和检索的 archival memory  
**When** 模型执行 `brain_rm`  
**Then** 后续 `brain_ls` / `brain_grep` / `brain_think` 不再把它作为 active memory 返回  
**And** 对原 public path 的正常读取不再把它当作当前 active memory  
**But** 系统仍保留可恢复、可审计的删除语义。

### Scenario RM-001-B：core 不能用 rm 直接删除

**Given** 某层存在 core 文档  
**When** 模型对 `@core/...` 调用 `brain_rm`  
**Then** 必须拒绝  
**And** 原 core 保持不变  
**And** 模型应通过 `brain_edit` 或合法 `brain_mv` 来维护 core。

## REQ-RM-002 正常 move/promotion 不是删除

正常晋升或移动不得在系统语义上被归类为“用户强纠正/删除”；移动后的记忆必须继续存在并保留其有效语义与学习历史。具体审计记录格式属于 Design。

### Scenario RM-002-A：正常 move 后 memory 继续存在

**Given** 一条存在学习历史的 active memory  
**When** 模型执行正常 `brain_mv`  
**Then** source public path 不再表示该 active memory  
**And** destination public path 可以继续读取/使用同一 memory  
**And** 后续行为继续体现 move 前已有的学习历史  
**But** 该 move 不应被当作一次强纠正删除。

---

# 14. 审批

## REQ-APPROVAL-001 一套统一审批配置控制所有 brain 写操作

审批由统一配置控制，**默认 `none`，即默认不需要任何用户审批**。当前定义：

- `none`：所有 brain 写操作直接执行，不进入审批流程；
- `protect`：凡会修改 project/global 长期层最终状态的 write/edit/rm/mv/core update 都需要用户确认；
- 仅修改 session 层的操作不需要长期层审批。

“修改长期层”按**所有实际被改变的 layer**判断，而不是只看 destination。`brain_mv` 同时检查 source 与 destination，因为 move 既写目标，也会从源位置移除内容。

### Scenario APPROVAL-001-A：默认配置不审批

**Given** 审批配置未显式设置或为 `none`  
**When** 模型执行任一合法 brain 写操作  
**Then** 不因审批机制阻塞该操作。

### Scenario APPROVAL-001-B：从 project 移到 session

**Given** `protect` 模式  
**And** 一个 project item 将被 move 到 session  
**When** 提交 `brain_mv`  
**Then** 必须要求用户确认  
**Because** 此操作会修改 project 长期层，即使 destination 是 session。

> **确认结论 A9：** 统一审批配置作用于全部 brain 写操作；默认 `none`。开启 `protect` 后，只要一次 mutation 实际修改 project/global，就需要审批；`brain_mv` 按 source + destination 的实际长期层 mutation 判断。

### Scenario APPROVAL-001-C：protect 对长期层 mutation 一致生效

**Given** `protect` 模式  
**When** write / edit / rm / core update 中任一操作会修改 project 或 global 长期层  
**Then** 均必须进入同一套确认流程  
**But** 不能因为工具类型不同而绕过长期层保护。

## REQ-APPROVAL-002 未确认前不得产生副作用

### Scenario APPROVAL-002-A：pending approval

**Given** protect 模式  
**When** 模型首次提交需要审批的长期写，且未确认  
**Then** 返回 pending-approval  
**And** 当前 memory 内容、可观察学习历史、删除状态与审计语义都保持操作前状态。

### Scenario APPROVAL-002-B：确认后执行

**Given** 用户已经确认该长期写  
**When** 模型按设计定义的确认流程重试  
**Then** 才执行真正修改。

> brain 本体的信任边界到“调用方提供确认”截止：在 `protect` 下，没有符合工具契约的确认输入就不得产生长期写副作用；收到确认重试后才可执行。该确认是否由真实用户操作产生，属于外部调用方/宿主集成的责任，不由 brain 本体验证。

---

# 15. 一致性、并发、失败与持久化

## REQ-CONSISTENCY-001 成功 mutation 必须表现为一个一致的新状态

任一 write/edit/mv/rm 成功返回后，后续公开读取与操作必须只观察到一个完整、一致的新状态：不能同时看到一部分新内容和一部分旧语义；move 不能出现 source 已消失但 destination 未完成；同一条 memory 的学习历史不能错误绑定到另一条 memory。

### Scenario CONSISTENCY-001-A：预提交校验失败

**Given** 请求最终会产生非法 semantic document 或非法路径状态  
**When** 执行 write/edit/mv  
**Then** 整个操作失败  
**And** 后续公开读取、发现和再次操作都必须观察到操作前的完整状态。

### Scenario CONSISTENCY-001-B：成功后立即读取

**Given** 一个合法 mutation 请求  
**When** brain tool 返回 success  
**Then** 紧接着通过相关 `brain_cat` / `brain_ls` / `brain_think` 读取时必须看到 mutation 后的新状态  
**And** 不存在“先 success、稍后才可见”的延迟提交窗口。
## REQ-CONSISTENCY-002 并发调用不得产生 lost update

### Scenario CONSISTENCY-002-A：并发新增不同 item

**Given** 两个并发 brain 操作写入同一 layer 的不同 item  
**When** 它们同时执行  
**Then** 两个成功操作产生的 memory 都必须在后续公开读取/发现中完整存在  
**And** 不得出现其中一个 success 结果被另一个并发操作静默覆盖。
### Scenario CONSISTENCY-002-B：多个 MCP 进程共享 global layer

**Given** 可能存在多个 project MCP 实例共享 global memory  
**When** 两个进程并发修改 global layer  
**Then** 两个成功 mutation 的效果都必须保留，不得出现 silent lost update  
**And** 若系统无法安全完成并发操作，必须显式拒绝，而不是返回 success 后丢失其中一个结果。
## REQ-CONSISTENCY-003 进程重启后新旧 memories 不得发生身份碰撞

### Scenario CONSISTENCY-003-A：MCP server 重启后新增

**Given** 某 layer 已存在一条具有自己学习历史的 memory  
**And** brain 进程重启  
**When** 在同一 layer 新增另一条 memory  
**Then** 两条 memory 必须继续作为彼此独立的实体存在  
**And** 对其中一条进行 read/edit/feedback 不得错误影响另一条  
**And** 新 memory 不得继承旧 memory 的学习历史。

BDD 只规定“重启后实体身份仍不碰撞”的行为；内部 identity / ID 算法属于 Design。
## REQ-CONSISTENCY-004 可预期失败不得留下部分 mutation

### Scenario CONSISTENCY-004-A [Fault]：提交过程中发生可预期失败

**Given** 一个 mutation 已开始执行，但在完整提交前发生可预期失败  
**When** 工具最终向调用方报告失败  
**Then** 系统不得把部分 mutation 静默当作正常一致状态  
**And** 必须保证可恢复到提交前状态，或具备明确、可验证的恢复协议。

BDD 不规定具体事务实现，但“成功意味着一致、失败不会静默留下正常态假象”是硬需求。

## REQ-CONSISTENCY-005 强制终止不提供 durable transaction 保证

brain 本体只保证正常运行期间的同步 success 一致性，以及可捕获失败时的同调用 rollback；不承担 SIGKILL、宿主崩溃、机器断电等强制终止下的 durable transaction / 自动 crash recovery。

### Scenario CONSISTENCY-005-A [Boundary]：持久状态更新中进程被强制终止

**Given** 系统正在更新持久机制状态  
**When** 进程在 mutation 完成前被强制终止  
**Then** 当前未完成的 brain mutation 允许丢失  
**And** 下一次启动不要求重建、rollback 或识别所有跨文件部分提交窗口  
**But** 若落盘表示本身不可解析或明确违反既有 invariant，仍按数据损坏规则 fail loud。

> brain 不是会话事实的唯一持久化来源；DSH / Codex 等宿主侧会话记录承担对话事实恢复，因此 core runtime 不为 crash durability 引入额外 WAL/journal 复杂度。

---

# 16. 数据损坏与内部 invariant 检查

## REQ-CORRUPT-001 持久状态损坏不得静默重置

### Scenario CORRUPT-001-A [Fault]：已存在持久机制状态不可解析

**Given** 已存在持久机制状态，但其表示已损坏或不可解析  
**When** brain 加载 layer  
**Then** 必须明确报错  
**But** 不得把它当成“文件不存在”并自动初始化为空覆盖。

## REQ-CORRUPT-002 内部绑定冲突不得被默认值静默掩盖

如果持久状态已经出现“两个 active memories 共享同一学习身份/状态”“memory 与其学习状态绑定歧义”“公开路径语义与持久语义明显冲突”等内部一致性破坏，系统必须 fail loud 或进入明确恢复流程，不得继续把冲突状态当作正常 memory 使用。

### Scenario CORRUPT-002-A [Fault]：两个 active memories 错误共享同一学习身份

**Given** 持久状态已损坏，使两个不同 active memories 错误共享同一机制学习身份  
**When** 该 layer 被加载或即将参与 mutation  
**Then** 系统必须 fail loud 或进入明确恢复流程  
**But** 不得继续让两条 memory 共享并互相污染学习历史。

具体内部 identity/schema 如何构造属于 Fault Test / Design，不属于本 BDD。
---

# 17. 输出与抽象边界

## REQ-OUTPUT-001 模型可见输出应使用 @-scheme，不泄露内部绝对路径

brain_ls / grep / cat / think / signals / mutation result 中，凡是需要向模型表达记忆地址，都应使用 @-scheme。

### Scenario OUTPUT-001-A：物理路径不得外泄

**Given** 内部处理结果或异常中包含物理定位信息  
**When** brain 把结果返回给模型  
**Then** 必须重写为等价 @-path  
**And** 机制文件路径应被隐藏。

## REQ-OUTPUT-002 brain_think L0 只携带认知锚需要的信息

`brain_think` 的核心返回结构应由 core、candidates、signals 构成。可以有最小必要的结构提示，但不得每轮注入与已确认需求冲突的固定语义 heuristic，例如“所有记忆先写 session”。通用“如何选择作用域、何时采用、何时纠正”的语义仍由主模型根据工具契约和当前任务判断。

### Scenario OUTPUT-002-A：brain_think 不注入固定 session-first heuristic

**Given** 三层中存在可供当前 turn 使用的 core / candidates / signals  
**When** 执行 `brain_think`  
**Then** 返回认知锚需要的 core、candidates、signals  
**But** 不得额外告诉模型“所有新记忆必须先写 session 再晋升”等固定作用域语义。

---

# 18. 已确认需求边界汇总

A1~A9 与本轮修订后的 A10 均已写回对应 REQ。此表只用于追溯决策，不作为另一份独立规格源。

| ID | 已确认结论 |
|---|---|
| **A1** | `brain_think` description 要求收到每条用户消息后立即调用一次，并基于返回记忆继续思考；brain 不对重复调用做特殊处理，每次实际成功调用都推进一次 tick/exposure。 |
| **A2** | 渐进披露为 L0 目录 → L1 摘要 → L2 正文；L1 不默认展开正文 preview。 |
| **A3 / D4** | `brain_write` 最终对齐熟悉的 write 训练先验：目标不存在时 create，已存在时整篇 overwrite；overwrite 保留已有 mechanism learning state。 |
| **A4** | frontmatter type 必须与路径类型目录一致。 |
| **A5** | feedback 方向错误 reject；方向正确但幅度越界可 clamp 并明确告知。 |
| **A6** | L2 read 与成功 adopt 分离；adopt 才承担成功使用的 good + usage.ok。 |
| **A7** | v1 initial difficulty 由机制默认初始化，模型无需在 write 时标注。 |
| **A8** | questioned 必须可观察并机械降权；具体系数留设计/标定。 |
| **A9** | 一套统一审批配置控制全部审批，默认 `none`；`protect` 下凡修改 project/global 的 mutation 都需确认，move 同时检查 source/destination。 |
| **A10（re-review 修订）** | `brain_mv` 对齐熟悉的 file → file move/replace 语义；source/destination 默认必须是明确文件级 public path，不使用 directory shorthand；core 相关转换是受控文件级例外。 |
| **A11** | feedback 与文本修改正交：`adopt` / `attribute` 在 delta=0 时允许 `brain_edit edits=[]` 作为纯 feedback event；`correct` 仍要求负 delta，不能 0-delta no-op。 |

---
