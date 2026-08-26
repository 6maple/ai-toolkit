# brain 工具契约

## 1. 概念与实现

- **概念名**：brain_think（记忆系统整体）；
- **实现**：一个 MCP server，注册**多个** `brain_*` 工具（工具名 = `brain_` + 动作名）；
- **为什么多工具而非单工具带动作序列**：批量序列的失败语义有风险（中间动作失败时整体回滚还是部分返回？可审计性差）。独立工具每个成功/失败自包含，语义清晰；
- **为什么动作与模型熟悉的工具同名**：`ls/grep/cat/edit/write/rm/mv` 是模型训练中反复见过的工具名——**同名即触发训练先验，理解成本最低**；参数也尽量与同名工具一致。名字降低识别成本，description 承担记忆语义（工具描述是模型理解语义的入口）。

## 2. 工具集与 @-scheme 路径

### 2.1 @-scheme：记忆命名空间（外层抽象贯彻到寻址层）

模型**不知道也不关心**物理布局（`.brain-data` 目录名、项目根绝对位置、state.json 内嵌）——记忆是一个封闭命名空间，路径是唯一的寻址契约：

| @-路径 | 物理位置 | 语义 |
|---|---|---|
| `@/memories/...` | `<project>/.brain-data/memories/...` | 项目层 archival（file 型） |
| `@/sessions/<sid>/memories/...` | `<project>/.brain-data/sessions/<sid>/memories/...` | 会话层 archival（sid 内嵌路径） |
| `@global/memories/...` | `<BRAIN_HOME>/memories/...` | 全局层 archival |
| `@core/global.md` | global 层 core 文档 | 文档维度 |
| `@core/project.md` | project 层 core 文档 | 文档维度 |
| `@core/sessions/<sid>.md` | session 层 core 文档 | 文档维度 |

- **纯 @-scheme**：所有 `brain_*` 工具（除必调工具外）的路径参数只接受上述形态，不接受相对/绝对文件系统路径；
- **file 型封闭范围**：file 型 @-scheme 只覆盖 `memories/{decision,knowledge,intention,skill}/...`；`state.json` / `index.json` / `history.jsonl` / `change_history.jsonl` 等机制文件不可寻址；
- **id 不是契约**：条目 id 由机制内部生成（index/state 的键），frontmatter 不写 id，候选目录/信号一律给出 @-路径；
- **安全**：@-scheme 是封闭命名空间——模型无法表达树外路径（无绝对路径、无 `..` 入口）；解析后仍过 fs 白名单（双保险）。

### 2.2 工具集

| 工具 | 语义 | 参数 | 记忆层映射 |
|---|---|---|---|
| `brain_think` | **必调锚**：三层 core 文档 + 候选目录 + 信号；推进时间轴 | `session_id?` | 读三层 state + index |
| `brain_ls` | 列候选/目录 | `path?`(@-scheme，默认 `@/memories`), `limit` | 读 index.json → 候选目录 |
| `brain_grep` | 关键词检索 | `pattern`, `path?`(@-scheme), `glob?`, `ignoreCase?`, `literal?`, `context?`, `limit` | 检索 memories 目录 |
| `brain_cat` | 读条目内容（渐进） | `path`(@-scheme), `offset`, `limit` | 读 md frontmatter（L1）/ 正文分页（L2）/ core 文档 |
| `brain_edit` | 更新条目 | `path`(@-scheme), `edits: [{oldText,newText}]` 或 `content`(core), `feedback?`, `confirmed?` | archival 使用 exact-text replacement；core 使用整篇替换 |
| `brain_write` | 写完整 archival 条目（create / overwrite） | `path`(@-scheme), `content`（无 id）, `confirmed?` | 目标不存在则创建；已存在则整篇覆盖并保留已有机制学习状态；同步 index/state |
| `brain_rm` | 删除条目 | `path`(@-scheme), `reason?`, `confirmed?` | 条目 → memories/history/ + 索引移除 |
| `brain_mv` | 移动条目 | `src`, `dst`（明确文件级 @-scheme path）, `confirmed?` | core ↔ archival、core ↔ core、archival file ↔ file |

**core 特殊路径（文档维度）**：
- `brain_think` → 返回三层 core 合并块（顺序固定：全局 → 项目 → 会话）+ 候选 + 信号；
- `brain_cat @core/global.md` / `@core/project.md` / `@core/sessions/<sid>.md` → 读该层 core 文档（**单文档语义**：每层恰有一份 core 文档，`core: string[]` 只是便于合并的存储形态，模型侧只感知 3 个文档）；
- `brain_edit @core/<layer>.md`（content 整体替换）→ 提交新 core 文档（超长 → 拒绝并提示拆分，模型梳理后重试）；
- `brain_mv` 的 source / destination 默认都使用明确文件级 public path；archival 使用明确 `.md` item path，core 使用 `@core/*.md`。支持 core→archival、archival→core（**替换**目标 core）、core→core 与 archival file→file；不使用 memory type directory 作为 destination shorthand。
- `brain_edit` 的 archival edit 对齐 pi/coding-agent 当前公开 contract：`edits` 是数组，每项为 `{ oldText: string, newText: string }`；这是模型可见参数形状，不要求模型理解内部 edit 实现。
- 当 archival `brain_edit` 携带 `feedback` 时，`edits` 可以为空数组：`adopt` / `attribute` 在 delta=0 时允许作为纯 feedback event，不要求模型伪造文本修改；`correct` 仍必须满足负 delta 合法区间。

## 3. 必调引导（模型侧约定，非协议强制）

收到每条用户消息后，模型**立即调用一次 `brain_think`（L0 锚）**；拿到返回的三层 core / candidates / signals 后，**把它们作为当前记忆继续思考、回答和行动**。该调用由**工具描述引导**（`brain_think` 的 description 置顶要求），**非协议级强制**：

- 可靠性的来源：**距上次写只隔一轮对话**（文件连续维护，每次触发时刚被更新过）；
- 触发不依赖模型自觉是理想形态（Letta"agent not self-editing memory"失败模式的直接对抗），但 v1 定稿接受降级：工具描述每 step 常驻系统提示工具区，可靠性高于 skill 文本、低于协议注入——换取不绑定载体的通用性（工程落实见 `doc/brain/v1/design-brain-runtime.md` §8.1）；
- **载体层注入（harness turn 前注入 / hook）属于可选宿主增强，不是 brain core public contract。**

## 4. brain_think（必调工具）返回结构

```jsonc
{
  "core": {                          // 三层合并，顺序固定：全局 → 项目 → 会话
    "global":  [ "markdown 文档（该层唯一 core 文档）" ],   // 每层 1 份文档
    "project": [ ... ],
    "session": [ ... ]
  },
  "candidates": [                    // 三层 archival 的有界候选结果
    { "layer": "project", "path": "@/memories/knowledge/xxx.md", "type": "knowledge",
      "summary": "鉴权必须走ORM参数化，禁止动态SQL", "relevance": 0.82 }
  ],
  "signals": [ "promotion-candidate: <@-path> …", "demotion-candidate: <@-path> …" ]
}
```

- **core 合并全读**（不参与选择——目标/承诺/进度永远在场）；`core: string[]` 只是存储形态，每层恰有 1 份文档，模型感知的是 `@core/global.md`、`@core/project.md`、`@core/sessions/<sid>.md` 3 个文档；
- **candidates 是目录行**（ls 语义）：**@-路径**/type/summary/relevance，不展开正文；模型决定深读哪个（`brain_cat` L1/L2）；
- candidates 必须有界，避免一次展开过多目录项；具体单次上限与超限策略属于当前 Design / Calibration，不作为长期 public contract 锁死；
- candidates 的 summary 来自 index.json（模型写记忆时生成的摘要）；
- signals 只含机械可检测信号，一律给出可执行的 @-路径（模型直接据此 `brain_mv`/`brain_edit`）；无"core 条数超限"信号（单文档语义，超限由写时长度检查承担）。

## 5. 读写流程（模型两段式）

### 读（必调 L0 + 按需渐进）

```
用户消息 → brain_think（必调）→ 三层 core 文档 + 候选目录 + 信号
        → 模型语义判断（哪条相关、要不要深读）
        → brain_grep（query 精化再搜）/ brain_cat（L1 摘要 / L2 正文分页 / @core/*.md）
        → 模型基于读取内容回答
```

- L1 只返回摘要/必要 metadata，不默认展开正文 preview；
- L2 只表示正文被真正深读，不等同成功采用；空页/越界不产生 review；
- 只有模型显式提交 `feedback="adopt"` 才记录成功采用（good + usage.ok）。

### 写（思考后、行动前；读结果引导）

```
模型决定写入 → brain_write / brain_edit / brain_mv / brain_rm
  → 机制检查：
     core 文档超长（> CORE_DOC_MAX_CHARS）→ 拒绝并提示 → 模型拆分（保留常用，移别处）→ 重试
     `protect` 下若此次 mutation 实际 touched project/global → 审批；`brain_mv` 同时考虑 source + destination
  → brain 在当前工具调用内同步提交：预验证 → body/index/state/audit 一致更新 → 返回
  → 返回结果反馈（成功 / 提示 / pending-approval）
```

## 6. 审批（BRAIN_ASK_LONG_TERM，两档定稿）

非会话层写入影响未来所有会话/项目，需要用户控制权（**定稿为两档**，旧三档方案作废）：

| 配置值 | 语义 |
|---|---|
| `none`（默认） | 从不问 |
| `protect` | 任何实际修改 project/global 的 mutation 都需确认（两段式：pending-approval → 模型转述 → confirmed:true 重试）；`brain_mv` 同时看 source/destination，因为移出长期层本身也会修改长期记忆 |

- 审批门由各 mutation 工具统一执行：未确认时不得先改 body/index/state/history；`confirmed:true` 重试后才真正提交；
- brain 的信任边界到调用方提供 `confirmed` 截止；确认是否真实来自用户属于外部调用方/宿主责任；
- 与省事省力的平衡：默认 `none` 不审批；只有显式开启 `protect` 后才保护长期层。

## 7. 存储路径约定与 @-scheme 映射

```
<BRAIN_HOME>/.brain-data/                   # 全局层（BRAIN_HOME || ~/.brain-data）
  index.json   state.json   history.jsonl
  memories/{decision,knowledge,intention,skill}/*.md

<project>/.brain-data/                      # 项目层（BRAIN_PROJECT_ROOT || cwd）
  index.json   state.json   history.jsonl
  memories/{decision,knowledge,intention,skill}/*.md

<project>/.brain-data/sessions/<sid>/       # 会话层（项目下会话目录）
  index.json   state.json   history.jsonl
  memories/{decision,knowledge,intention,skill}/*.md
```

@-scheme → 物理映射（模型侧只感知左侧）：

| @-scheme | 物理 |
|---|---|
| `@/memories/knowledge/x.md` | `<project>/.brain-data/memories/knowledge/x.md` |
| `@/sessions/<sid>/memories/knowledge/x.md` | `<project>/.brain-data/sessions/<sid>/memories/knowledge/x.md` |
| `@global/memories/skill/x.md` | `<BRAIN_HOME>/memories/skill/x.md` |
| `@core/global.md` / `@core/project.md` / `@core/sessions/<sid>.md` | 对应层 state.json 的 core 文档（内嵌，非文件） |

- **memories/ 按类型分子目录**（decision/knowledge/intention/skill），ls 即见类型；
- 记忆条目格式：markdown 文件，frontmatter（**type/summary/importance** — 无 id）+ 正文；id 由机制生成（index/state 内部键）；
- 外层只知道"记忆"抽象，物理格式是实现细节。

## 8. 记忆条目 markdown 形态（示例）

```markdown
---
type: knowledge
summary: 鉴权必须走ORM参数化，禁止动态SQL
importance: 0.8
---

# 鉴权规范

所有数据库访问必须使用 ORM 参数化查询，禁止动态拼接 SQL。
依据：用户 2025-06 在安全评审中明确要求。
```

## 9. 与 cqf 的关系

- cqf 的**认知规则**（怎么设 Target、怎么判断 user-owned、怎么收敛、怎么界定 depth、closure 判据）保留在 skill 文本中；
- brain_think 的**记忆与强制**（状态外部化、必调锚、检索、审批、记忆模型）承载机制层；
- 分工：skill 保留认知，机制负责执行——本设计的核心立场（"skill 保留认知，机制负责执行"）。
