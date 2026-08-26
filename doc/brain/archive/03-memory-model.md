> **Archive / Historical**：本文件保留用于背景与决策追溯；版本入口以 `doc/brain/README.md` 为准，v1/v2 规范分别位于对应版本目录。

# 03 · 记忆模型

## 1. 三层记忆架构

记忆分三层持久化，**三层同构**（机制只写一遍）：

| 层 | 位置 | 内容 | 特性 |
|---|---|---|---|
| **全局层 (global)** | 用户目录 `~/.brain-data/` | 跨项目的稳定内容：原则、偏好、长期经验、通用技能 | 影响所有项目；写入需审批（默认） |
| **项目层 (project)** | 项目目录 `<project>/.brain-data/` | 项目专属：项目目标、约定、架构决策、项目技能 | 影响当前项目所有会话；写入需审批（默认） |
| **会话层 (session)** | `<project>/.brain-data/sessions/<sid>/` | 当前对话：当前目标、进度、承诺、会话内经验 | 每轮热更新；写入无需审批 |

**会话运行时合并**：模型感知的是一个**整体记忆**，不是三个分层文件——三层 core 合并呈现，三层 archival 参与检索。

**会话层必须有 archival 的理由**：会话变长时，转录不可靠（DSH 源码：maxBytes 裁剪从最老消息开始丢；Lost in the Middle：中间内容注意力弱）——衰减覆盖**整个会话历史**，不只是最近几轮。会话 core 只承载当前状态（每轮更新），早期关键内容只能靠会话 archival 承载 + 检索找回。**记忆文件在长会话中逐步接管转录的功能。**

## 2. 条目 schema（archival）与 core 形态

以下 schema 仅指 **archival 条目**（落文件、参与检索与机制维护）。**core 不是条目，无此 schema**——形态见本段末尾「core 形态（定稿）」：

```jsonc
{
  "id": "550e8400-e29b-41d4-a716-446655440000", // 机制生成的内部稳定 id；模型不写、不回写文件
  "type": "decision|knowledge|intention|skill",  // 模型自定
  "content": "鉴权必须走ORM参数化，禁止动态SQL",   // 清晰无歧义第一
  "note": "用户2025-06明确要求",                 // 依据/理由/纠正上下文/跨项目理由
  "importance": 0.8,              // 0~1，模型取值；反馈动态调整
  "difficulty": 0.4,              // FSRS：难度；机制以默认值初始化，后续 review 事件机械调整
  "stability": 3.2,               // FSRS：稳定性；机制维护
  "retrievability": 0.7,          // FSRS：可提取性；机制维护，按调用次数衰减
  "last_at": 42,                  // 上次状态更新时的调用次数（懒衰减计算用）
  "exposure": 5,                  // L0 曝光计数（排序降权，防熟悉偏差）
  "usage": { "ok": 2, "fail": 1 },// 成功/失败使用计数（高频进阶限定成功）
  "status": "active|questioned|removed",
  "at": 30                        // 创建时的调用次数
}
```

**语义域（模型写）**：`type / content / note / importance`（机制只定类型与范围）。
**机制域（brain 维护）**：`id / difficulty / stability / retrievability / last_at / exposure / usage / status / at`（模型不直接写，只通过 brain 工具事件影响——采纳/纠正/失败/删除）。

**存储位置（定稿）**：`content / note` 等语义域写在 `memories/**/*.md` 的 frontmatter 与正文中；`state.json` 的 `items` **只保存机制域字段**，不保存正文快照。

**core 形态（定稿）**：每层恰有 **1 篇正常 markdown 文档**（可含 frontmatter 与正文，就是一份普通文档），定位类似 CLAUDE.md 的层级常驻上下文：global=用户级原则/偏好、project=项目级约定/目标/架构决策、session=会话级当前状态/进度/承诺。**`core: string[]` 只是存储形态**：每层物理存储为 `["<该层文档>"]`，三层合并 = 三个单元素数组拼接——模型侧感知的永远是 `@core/global.md`、`@core/project.md`、`@core/sessions/<sid>.md` 3 个文档，**不存在"每层多篇"状态**。core 由模型**正常维护**：需要常驻的内容写入、需要调整（含 core 超长时梳理：保留常驻要点，移走不合适常驻的内容）直接改，修改经 brain 工具通道（审批/审计适用），不是只读保护区。物理上内嵌于 state.json（选内嵌为便于管理：合并/检查/拦截零成本、单一通道不失配）。**读写按文档维度**：`@core/<layer>.md` = 该层 core 文档（物理即数组首个元素，`core[0]`）——`brain_cat` 读、`brain_edit`（content 替换）/`brain_mv`（与文件互转，移入 = **替换**、移出 = 清空）改——**不暴露数组索引**。**容量保护 = 文档长度上限（写时检查）**：修改后超长 → 工具拒绝并提示拆分（模型梳理后重试），非"条数超限"信号。core 无条目 schema（不参与检索/候选/FSRS/exposure/usage）；机制只做长度检查与呈现，内容与分块由模型负责。

## 3. 存储文件形态（每层同构）

| 文件 | 内容 | 谁写 | 用途 |
|---|---|---|---|
| `state.json` | **core 数组**（该层，`core: string[]`，每条为 markdown 文本）+ FSRS/exposure/usage/status 等机制域状态 | brain runtime | 常驻核心 + 记忆模型状态 |
| `index.json` | 索引：id、file、type、title、summary(短)、importance、updated_at | brain runtime | **L0 直接序列化**（不扫描文件） |
| `history.jsonl` | 显式删除事件元数据（追加式）；被回收正文进入内部 `memories/history/` | brain runtime | 审计；**不清理**（不参与正常检索） |
| `change_history.jsonl` | 所有记忆变更：write/edit/rm/mv/core_update 等（@-scheme path + action + tick） | brain runtime | 可审计记忆变化；追加式，不清理 |
| `memories/**/*.md` | frontmatter（type/summary/importance…，无 id）+ 正文 | 经 `brain_*` mutation tools 写 | 记忆本体，渐进披露载体 |

**要点**：
- **core 不落独立文件**：core 是 state.json 内的 markdown 文本（每层 1 篇，`string[]` 仅合并时用）。因为 core 每次必调都在场，放内嵌字段使检查/拦截零成本（长度检查、梳理提示、合并）；
- **摘要放 frontmatter**：与 skills（SKILL.md）的维护方式一致；模型写记忆时**自己先做摘要**，记录"摘要 + 正文"——摘要用于 L0/L1 快速呈现，正文用于 L2 深读；
- **记忆条目先只做 .md**（不引入 json 形态条目）；
- **记忆数据全部由 brain 的 `brain_*` 工具通道管理**：模型不能直接用原生 read/write 碰记忆文件——单一通道使审批不可绕过、索引与正文不失配、状态维护点唯一；
- **外层抽象**：外层（模型/用户）只知道"记忆"，不知道物理格式（json/markdown 是实现细节）。

## 4. 记忆模型（FSRS 三状态 + 事件时间）

### 4.1 时间单位

**一切时间以 think_tool 调用次数计，不用真实时间**。依据：agent 事件驱动（只有被调用才存在），真实时间是伪维度（用户可能三个月后回来）；实践侧 mem0 的 decay 也按对话轮次运作。

### 4.2 双力 → 三状态

Bjork 双力理论：提取强度（快速衰减、提取后回升）+ 存储强度（几乎不衰减、靠成功使用累积）。FSRS 扩展为三状态（难度/稳定性/可提取性），作为多级 LRU 具体实现的**指导**（权重、参数借用 FSRS 经验值）。

```
retrievability R(t) = exp(-t / S)     // 按调用次数衰减；被读操作提升
stability S：                         // 机制维护
  显式成功 adopt（good）→ S × f(S, D) // 借用 FSRS 增长系数
  用户纠正（again）→ S × g(S, D)      // 借用 FSRS 衰减系数，D 上调
  L2 深读 → 刷新提取状态，不做 good 增长
  L1 gist（hard）→ 小幅更新
  L0 曝光 → 不变
difficulty D：机制默认初始化；后续由 review 事件机械调整
```

### 4.3 复习分级（渐进披露 → 复习计数）

| 读动作 | 对状态的影响 |
|---|---|
| L0 看到名称/摘要（浅接触） | retrievability 不主动回升（按当前 tick 继续衰减）；stability 不变；exposure +1 |
| L1 展开摘要 | retrievability 回升；stability 小幅更新 |
| L2 深读正文 | retrievability 回升；不做 good-style stability 增长；usage.ok 不变 |
| 显式成功 adopt（记忆实际作用于行动） | stability 按 good 更新；usage.ok +1 |
| 深读后行动被用户纠正 | 按 again 处理；usage.fail +1 |
| 未检索 | 纯衰减 |

**"高频进阶"限定成功**：进阶主要靠显式成功 adopt（usage.ok 达阈值），不靠 L0 出现或仅 L2 深读——条目在列表里出现/被读很多次但从未成功采用，不该进阶（Voyager 只在执行成功后存储的先例）。

### 4.4 importance 动态调整

importance 不是写入时定死的属性，而是被反馈持续维护的状态（前额叶价值引导记忆维护的证据）：

| 事件 | 调整 |
|---|---|
| 显式成功 adopt 且无纠正 | 模型在 [0, +0.2] 内取值（默认小幅） |
| 轻度纠正 | 模型根据纠正语气/明确度在 [−0.3, −0.05] 内取值，附依据引用；高 importance 阻尼（范围收窄） |
| 行动失败 | 模型判断归因后，在 [−0.15, 0] 内取值（可为零） |
| 长期未检索 | 不变（衰减由 retrievability 承担） |

**通用模式**：每个调整点 = 机制定义合法区间 + 档位描述 + 模型取值 + 依据引用。模型取值时附"为什么"（引用的纠正原话/上下文），可审计。

### 4.5 曝光降权

L0 曝光计数（exposure）参与候选排序降权，防"熟悉偏差"——反复出现但没用的条目不应占据列表。

排序公式（运行时计算，不入库）：
```
candidates 排序 = importance − α·exposure − questionedPenalty
```
> L0 没有 query，不计算 relatedness；`importance` 是主分，`exposure` 做防熟悉偏差降权；`questioned` 条目额外使用一个正惩罚项，使同条件下排序严格低于 active。具体 α / questionedPenalty 属于参数标定。语义精化由模型在 `brain_grep` 阶段完成，不改变 L0 排序结构。

### 4.6 纠正双路径（强/轻）

| 路径 | 触发 | 动作 |
|---|---|---|
| **强纠正** | "禁止再xxx"、"去掉xx记忆"、"删掉"、"不要再用xx" | 删除：条目移入 history.jsonl（模拟内存回收）；如适用，模型自行决定是否补记一条负向记忆（通用结构，**无 bans 特殊结构**） |
| **轻度纠正** | "这个不太行"、"有点问题" | 模型在 [−0.3, −0.05] 内调整 importance + 标记 questioned（仍可召回，排序降权，附"存疑"标记） |

- 判定走哪条路径 = 模型语义判断（"这个不太行" vs "禁止xxx!"），机制只提供两条路径；
- **无 bans/禁令特殊结构**：模型用通用记忆结构自己记"禁止"类内容（人脑没有"禁令区"，"禁止"就是一条普通负向记忆，一样存储、衰减、检索）；
- **history 不清理**：不参与检索、不进候选列表、只在审计时按需读取，体积增长不影响功能；
- 状态机：`active → (轻纠正) questioned → (多次一致纠正未解决/归因确认错误) → 删除`；`active/removed` 直达。

## 5. 升降级与驱逐（用进废退 + 多级 LRU）

| 方向 | 触发 | 动作 |
|---|---|---|
| 晋升（高频进阶） | `usage.ok` 达阈值（如 3~5 次） | 会话 → 项目 → 全局的层级晋升（模型自选 + 审批） |
| 降级（用进废退） | 长期未检索（按调用次数计）且综合分低 | 降级/归档标记，**不删除** |
| 驱逐（回收） | 显式删除（强纠正） | 移入 history.jsonl |

- 驱逐/降级分 = f(retrievability, stability, importance) **三因子混合**，非纯 LRU——纯时间衰减是弱信号（mem0 实践结论），且大脑修剪针对"长期不用"而非"最近不用"；
- 降级 ≠ 删除：显式失效/归档（Graphiti valid_at/invalid_at 范式），避免"重要的低频记忆被永久销毁"；
- **core 不参与自动晋升信号**：core 每轮必调常驻，不需要“晋升”；模型可主动用 `brain_mv` 做 core↔archival、core→core 移动（core→core = 目标层 core 被替换、源 core 清空）。
- 参数（阈值、α、FSRS 系数）借用 FSRS 经验值起步，**实测标定**（先机制后参数）。

## 6. 容量与记录约束

- **core：每层 1 篇文档，长度上限（写时检查）**——`brain_edit @core/<layer>.md` / `brain_mv → @core/<layer>.md` 时检查修改后文档长度，超长 → 拒绝并提示拆分 → **模型自己梳理**（保留常驻要点，移入本层 archival 后重试）；合并后 3 篇的总体量由阈值（CORE_DOC_MAX_CHARS，待标定）控制；
- **L0 候选：固定 10 条**（简化定稿）；
- **记录原则**：表述清晰无歧义第一 > 去冗余 > 保守简洁化；容量是软约束，不因省字符牺牲表述精准（写入工具描述，模型每次写都可见）。
