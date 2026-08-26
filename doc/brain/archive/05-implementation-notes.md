> **Archive / Historical**：本文件保留用于背景与决策追溯；版本入口以 `doc/brain/README.md` 为准，v1/v2 规范分别位于对应版本目录。

# 05 · 实现要点与开放项

> 本文档记录 brain 的实现边界、载体差异和仍需实测标定的参数。行为契约以 [bdd-brain-behavior-requirements.md](../v1/bdd-brain-behavior-requirements.md) 为准，工程设计以 [design-brain-runtime.md](../v1/design-brain-runtime.md) 为准，设计判断规则见 [design-rule.md](../../design-rule.md)。`code/brain/DESIGN.md` 只保留实现入口摘要，不再作为第二份完整设计真相。

## 1. brain 本体边界

- 一个纯程序化 MCP server，注册 `brain_think` + `brain_ls / brain_grep / brain_cat / brain_edit / brain_write / brain_rm / brain_mv` 八个工具；
- 模型可见路径只有 @-scheme；`state.json / index.json / history.jsonl / change_history.jsonl / memories/history/` 等机制/回收位置不可寻址；
- `brain_think` 模型可见参数只保留 `session_id?`；project root 在 server 启动时通过 `BRAIN_PROJECT_ROOT` / cwd 固定；
- brain 运行时无独立 LLM：模型负责语义，机制负责路径/schema/区间/invariant/审批/并发/持久化；
- `ls/grep` 继续复用 pi/coding-agent 的成熟只读文件工具；`write/edit` 保持熟悉的模型交互语义，但正式 memory mutation 由 brain 自己先在内存构造 after document、验证后同步提交，避免“文件先改、metadata 后同步”的双通道。

## 2. 存储、一致性与并发

- 每层同构：`state.json`（core + mechanism state）、`index.json`、`history.jsonl`、`change_history.jsonl`、`memories/{decision,knowledge,intention,skill}/*.md`；
- archival Markdown 是语义内容真相；index 是 L0 快照；state 只保存 mechanism state；
- `brain_write` = create / whole-document overwrite；overwrite 保留已有 id 与 learning state；
- item ID 使用机制生成 UUID；跨层 `brain_mv` 保留同一 ID / FSRS / usage / status；
- mutation 正常路径为：解析 → 审批 → 加锁 → 加载/验证 → 构造 after/plan → 再验证 → 同步提交 → 校验 → 返回；成功返回后满足 read-your-writes；
- `state.json/index.json` 等普通覆盖采用同目录 temp → close → rename，避免把半截 JSON 当正常数据；
- 当前 v1 不引入 durable WAL/journal/自动 roll-forward。正常调用中的失败在当前调用内恢复；若跨文件 crash window 造成 invariant 不一致，下一次加载 fail loud，等真实故障证明需要时再增加恢复协议；
- 同项目的 project/session 只由一个项目级 MCP process 访问，使用进程内 mutation queue；多个项目进程共享 global，因此**所有会修改 global 的路径**（think、L1/L2 review、write/edit、core edit、rm、mv、直接 sync）共享一个 global cross-process exclusive lock。

## 3. 读/学习事件

- L0：`brain_think` 从 index 生成候选；只记 exposure，不主动强化 stability；
- L1：`brain_cat(path)` 只返回摘要/frontmatter metadata，不展开正文 preview；可做轻量 retrieval review；
- L2：带 offset 的正文分页；只有实际返回正文时才产生 L2 read event；L2 read 刷新提取状态，但**不等于 adopt**，不增加 usage.ok、不做 good-style stability 增长；
- adopt/correct/attribute 必须由模型显式 feedback 表达，不根据 importance 正负自动猜：
  - adopt `[0,+0.2]`，方向错误 reject，越界 clamp；
  - correct `[-0.3,-0.05]`（高 importance 阻尼），标记 questioned；
  - attribute `[-0.15,0]`，记录失败但不质疑内容；
- questioned 在 L0 candidate 显式可见，并有确定性降权；具体惩罚系数仍属于标定参数。

## 4. 生命周期与审批

- `brain_rm` 只作用于 archival item；正文进入内部 recycle，active index 退出，state=removed，显式删除写 history + change audit；
- `brain_mv` 对齐熟悉的 mv：支持 item→item、item→memory type directory（保留 basename）、existing destination replace、跨层、类型迁移、item↔core、core→core；
- core→archival 必须先满足 archival semantic contract；缺 `type/summary/importance` 时拒绝，模型先 edit core 再重试；
- mv replace 的旧 destination 进入 recycle + removed state + change audit，但不伪装成用户主动 rm 的 deletion history；
- 审批只有一套配置：`none`（默认）/ `protect`。protect 依据一次 mutation **实际 touched 的所有 layers** 判断；`brain_mv project/global → session` 仍因修改长期 source 而需要确认；
- brain 的信任边界到调用方提供 `confirmed:true` 截止，确认来源真实性属于宿主/调用方。

## 5. 载体差异

brain 本体的契约不绑定宿主：tool description 要求模型**收到每条新的用户消息后立即调用一次 `brain_think`，拿到返回 memory view 后再把它作为当前记忆继续思考、回答和行动**。

宿主可以额外增强这个触发，但不改变 brain 核心契约：

- DSH：仓库中的 `brain-dsh-plugin` 已实现 AutoThink/会话上下文注入能力，这是 DSH adapter，不属于 brain BDD/design；
- Codex/其他 MCP host：可通过 MCP `_meta` 提供 session identity；brain 当前兼容 `threadId / dshSessionId / com.example.dsh/sessionId / sessionId`，未提供时回退 `default`；
- host 级挂载、session `_meta` 接线细节见 `code/brain/MCP_HOSTS.md`。

## 6. 仍需真实使用标定的参数

| 参数 | 当前实现 | 状态 |
|---|---:|---|
| initial difficulty | 0.4 | 机制默认值；BDD 不锁死 |
| L0 exposure α | 0.05 | 待真实数据标定 |
| questioned penalty | 0.1 | 待真实数据标定，只锁定“questioned < active”方向 |
| promotion threshold | usage.ok ≥ 3 | 待真实数据标定 |
| demotion thresholds | R < 0.05 且 importance < 0.4 | 待真实数据标定 |
| CORE_DOC_MAX_CHARS | 4000 | 待真实使用标定 |
| FSRS hard/good/again 系数 | 当前经验值 | 先机制后参数 |

2026-08-20 当前实现验证见 `doc/tdd-brain-test-matrix.md`：**11 个 test file / 75 个测试全部通过，`pnpm exec tsc --noEmit` 通过。**
