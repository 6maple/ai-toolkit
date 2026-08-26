> **Archive / Historical**：本文件保留用于背景与决策追溯；版本入口以 `doc/brain/README.md` 为准，v1/v2 规范分别位于对应版本目录。

# brain 测试设计审查：功能场景覆盖 vs 实现耦合

> 状态：Review / 仅审查，不修改测试与 production
> 日期：2026-08-20
> 需求基线：`doc/brain/v1/bdd-brain-behavior-requirements.md`

## 1. 本次审查采用的测试哲学

主验收测试的职责是证明 **功能场景成立**，而不是证明“当前实现恰好按某种内部函数、数据结构或算法实现”。

判断一条测试是否适合作为功能验收测试，使用三个问题：

1. **Given**：前置状态能否主要通过公开 `brain_*` 行为建立，而不是直接 `saveState()` / `saveIndex()` 构造内部状态？
2. **When**：被测动作是否通过真实 MCP `brain_*` 契约执行，而不是直接调用 `moveItem()` / `syncAfterWrite()` / `buildCorePayload()` / `applyReview()` 等内部函数？
3. **Then**：断言是否面向模型/调用方可观察结果，或稳定的系统不变量，而不是锁定当前内部 schema、helper 返回值、文件相对路径形式、UUID 格式、锁实现、FSRS 某个具体系数？

主验收测试应尽可能满足 1~3。

允许的白盒例外只有两类：

- **故障注入**：例如主动制造损坏 `state.json`、duplicate id、半截 JSON。这类状态无法通过合法公开 API 产生。
- **明确决定长期锁定的算法契约测试**：如果未来明确决定某个公式本身就是产品契约，可独立放入 mechanism/algorithm suite；它不应被当作功能场景覆盖本身。

即使是故障注入测试，也应尽量做到：**白盒只负责 Given 造故障，When/Then 仍通过公开 MCP 行为验证。**

## 2. 当前测试集的结构性结论

当前共有 75 个测试。

按“被测 When 是否走真实 MCP 公开接口”粗分：

- 约 **17 个**走 MCP / tool contract 路径；
- 约 **58 个**主要直接调用 `src/**` 内部函数。

这不是说 58 个都没有价值，而是说明当前测试集的主体仍是“实现级单元/集成测试”，不是“以功能场景为中心的验收测试”。其中 corruption/fault-injection 的少量白盒是合理的，但大量正常功能场景也采用了白盒捷径。

因此，当前“75 tests / 43 REQ 全覆盖”只能说明 **有测试关联这些 REQ**，不能说明 **REQ 已按正确测试层级覆盖**。

## 3. 主要实现耦合模式

### 3.1 直接构造内部 mechanism state 来代替用户行为

典型例子：

- promotion：直接 `saveState(... usage.ok=3)`；
- questioned：直接构造 `status="questioned"`；
- demotion：直接设置 `stability / last_at / importance / tick`；
- 跨层 move：直接修改 `stability / difficulty / retrievability / exposure / usage / status` 后检查原值搬过去。

这些测试覆盖了最终规则，但把当前 `state.json` schema 变成了正常功能测试的前提。

更符合功能测试的做法：

- 用 `brain_write` 创建；
- 用 `brain_cat` 产生 read；
- 用 `brain_edit feedback=adopt/correct/attribute` 形成真实使用轨迹；
- 用 `brain_think` 观察 candidate / signal；
- 用 `brain_mv` 做真实作用域变化。

例如“move 保留学习状态”不必直接比较 stability 等字段：可以在 session 中成功 adopt 两次 → move 到 project → 再 adopt 一次 → `brain_think` 应基于累计历史产生后续 promotion 行为。如果 move 把学习状态重置，该功能链会自然失败。

### 3.2 直接调用内部函数作为 When

高耦合调用包括：

- `parseBrainPath()`
- `layerOf()` / `rootsForPath()`
- `buildCorePayload()` / `renderCorePayload()` / `readMemoryFile()`
- `updateCore()`
- `syncAfterWrite()`
- `removeItem()` / `moveItem()`
- `requireApproval()`
- `decay()` / `applyReadReview()` / `applyReview()`

这些函数都可以重构、合并、删除，而产品行为保持不变。主功能测试若直接依赖它们，会把内部函数边界误当成产品边界。

### 3.3 Then 锁定内部表示，而不是功能结果

典型例子：

- 要求 parser 返回 `kind: "item" | "directory" | "core"`；
- 断言 index `file` 必须是 RELATIVE path；
- 断言新 id 必须符合 UUID regex；
- 断言内部 `state.items[id].status`、`last_at`、`stability` 等精确值；
- 断言 FSRS 固定系数 `2.2 / 1.2 / 0.4`；
- 测试名称直接写“store lock serializes”“share one lock”。

其中部分内部不变量确实重要，但应转换成“行为后果”：

- relative path 的真正需求是 **move 后仍能正常 cat/edit/rm，且不会产生 duplicate/ghost item**；
- ID 唯一的真正需求是 **重启后两个 item 独立存在、互不继承 learning state、分别可读写删除**；具体是不是 UUID 不重要；
- lock 的真正需求是 **并发成功操作不丢失**，不是系统内部必须使用某种 lock。

## 4. 按测试文件审查

| 文件 | 当前性质 | 审查结论 |
|---|---|---|
| `approval.test.ts` | 纯内部 helper + 手工 state | **主功能 suite 不应保留现状**。审批应通过真实 MCP none/protect/pending/confirmed 场景；summary helper 不属于功能覆盖。promotion 应通过真实 adopt 轨迹产生。 |
| `core.test.ts` | 直接 core/store/lifecycle helper | **大部分应改黑盒**。三层 core、core replace、over-limit、core move 都能通过 MCP 完成。内部 render/payload 数组形态不应定义功能。 |
| `fsrs.test.ts` | 高度算法/内部 state 耦合 | **最需要拆分**。反馈/read/adopt 行为应改黑盒；精确 FSRS 公式和系数若要保留，单独归类为 mechanism algorithm tests，不计入功能场景覆盖。 |
| `index.test.ts` | parser/locator/storage internals | **不适合作为功能验收主体**。路径接受/拒绝、机制文件不可寻址、输出不泄露路径应通过 brain tools 验证。 |
| `lifecycle.test.ts` | 直接 sync/rm/mv/store | **应重写为 MCP lifecycle scenarios**。尤其 `RELATIVE file path` 是典型实现断言，应改为 move 后继续 cat/edit/rm 正常。审计/回收物理文件可留在 persistence-contract 辅助 suite。 |
| `spec-boundaries.test.ts` | 主要真实 MCP，Then 有部分内部 probe | **方向基本正确**。应把“share one lock/serialize”改成“并发不丢更新”；能用 ls/cat/think 验证的 postcondition 不再读 index/state。global core 并发不应假定并发提交的最后数组下标一定成为最终 core。 |
| `spec-consistency.test.ts` | fault + MCP 混合 | **应拆成两类**。corruption Given 可白盒造坏文件，但 When 改为真实 `brain_think`/mutation；restart ID 应验证两个记忆独立可用，而不是直接比较内部 id。 |
| `spec-lifecycle.test.ts` | 虽有 REQ 名，实际全走内部 lifecycle | **REQ 标签不改变其白盒性质**。几乎整文件都应改成 MCP black-box。 |
| `spec-mcp-contract.test.ts` | 公开 MCP 主体，内部状态作 oracle | **最接近目标结构**。保留 tool/schema/approval/error 契约；overwrite/feedback 等 Then 优先改成 `brain_cat/think/ls` 的可观察结果。 |
| `spec-memory.test.ts` | 直接 memory/core/store | **应改为 MCP read/think scenarios**。L1/L2/questioned 都天然是模型可见行为，不需要内部函数。 |
| `spec-paths.test.ts` | 前 3 个 parser unit，后 2 个 MCP | **前 3 个应改黑盒，后 2 个方向正确**。directory/item/core 的需求是不同工具对地址的行为边界，不是 parser 必须返回某个 discriminated union。 |

## 5. 当前功能覆盖中最需要补成“真正黑盒”的场景

以下 BDD 场景虽然多数已有某种测试映射，但当前主要依赖内部函数或内部状态，应该优先补成真实 MCP acceptance tests：

1. **SCOPE-001-A**：分别写 global/project/session core，一次 `brain_think` 同时返回三层且顺序稳定。
2. **THINK-002-A**：连续两次 `brain_think` 都是新事件；通过可观察的 candidate/exposure 后果或受控 persistence probe 验证，而不是直接调用 `buildCorePayload()`。
3. **PATH-001-A**：对 `@/state.json`、`@global/index.json` 等直接调用 brain tools，均拒绝且不泄露 fs path。
4. **PATH-003-B**：`.txt`、类型目录、非法 nested path 分别用于 write/edit/rm/mv，走真实 tool contract。
5. **CORE-003-A**：已有 core → 提交超长 core edit/mv → reject → `brain_cat` 仍返回原 core。
6. **READ-002-A/B / READ-003-A**：全部通过 `brain_cat` 黑盒验证。
7. **SEARCH-001**：目前缺一个清晰的正向 grep 功能场景：合法 active memories 可被 literal/regex 找到，history 不可见。
8. **WRITE-001-B**：overwrite 后用 `brain_cat` 验证完整正文已替换；再通过后续行为验证 learning state 未重置。
9. **EDIT-001-B**：summary 为空、type 非枚举都应作为公开 edit failure 场景，不只测 importance。
10. **FEEDBACK-001-B**：方向正确但幅度越界，公开结果明确告诉模型发生 clamp；后续行为应反映合法范围，而不是只读内部 state。
11. **STATUS-001-A**：通过 `feedback=correct` 真实产生 questioned，再 `brain_think` 验证“存疑”可见与相对降权。
12. **FSRS-003-A/B**：L2 read 本身不算 adopt；显式 adopt 才形成成功使用。应通过后续 signal/behavior 证明，不锁死当前系数。
13. **MOVE-001-A**：通过真实连续 adopt 达 threshold，再 think 看到 promotion-candidate，且 item 仍在原层。
14. **MOVE-002 / MOVE-004**：core↔archival、core↔core、file→directory、replace 都通过 `brain_mv` 真实入口验证。
15. **RM-001 / RM-002**：模型侧先验证 rm 后原 path 不再可读/列出，正常 mv 不被当删除；物理 recycle/audit 另放 persistence suite。
16. **OUTPUT-002**：直接检查 `brain_think` 文本不泄露 internal id / stability / state file 等，不含“先 session 再晋升”的固定 heuristic。

## 6. 现有覆盖里真正的缺口

除了耦合问题，还有几个 BDD Scenario 目前没有被充分真实验证：

### 6.1 CONSISTENCY-004-A sync 失败

当前主要用“semantic validation 失败”代替 sync/commit 中途失败。它证明了 pre-validation，但没有真正验证：提交阶段某一步失败时，tool 报失败后不会留下正常态的部分 mutation。

需要独立故障注入测试。故障注入方式属于测试 harness，不应要求 production 暴露具体事务 helper。

### 6.2 CONSISTENCY-005-A 写 mechanism JSON 时进程异常中断

当前“手工写半截 JSON → load 失败”主要覆盖 CORRUPT-001，而不是“brain 自己写 state/index 中途进程崩溃”的 crash scenario。

如果 BDD 保留这一 scenario，应增加真正的 crash/fault test：在 mutation 期间 kill process，然后重新启动，验证只能读到上一个完整版本或明确 corruption，不能把半截 JSON 当正常状态。

### 6.3 正常 `brain_ls` / `brain_grep` 正向行为覆盖偏弱

现在边界/隔离测试不少，但正常 browse/search 的正向 happy path 相对不足。

## 7. 建议的新测试分层

### A. `tests/acceptance/**` — BDD 功能验收主套件

规则：

- 不 import `../src/**`；
- Given 尽量只用 brain tools 建立；
- When 一律真实 MCP；
- Then 一律面向 tool result / 后续 brain tool 可观察行为；
- 每条测试名使用业务场景，不出现 `lock`、`syncAfterWrite`、`layerOf`、`UUID`、`RELATIVE index path` 等实现词。

建议按功能维度组织：

- `contract-think.test.ts`
- `scope-core.test.ts`
- `paths-output.test.ts`
- `read-search.test.ts`
- `write-edit-feedback.test.ts`
- `move-rm.test.ts`
- `approval.test.ts`
- `concurrency-restart.test.ts`

### B. `tests/faults/**` — 故障/损坏测试

只允许这里直接碰测试目录中的物理 storage：

- corrupt JSON；
- duplicate id / orphan index-state；
- process crash；
- commit-stage injected failure。

规则：白盒只用于 Given，When/Then 尽量仍走 MCP。

### C. `tests/mechanism/**` — 可选算法契约测试

只有当团队明确决定“这个公式本身要长期锁死”时保留：

- decay 公式；
- 某个 FSRS 系数；
- calibration 参数。

这些测试 **不计入 BDD 功能覆盖率**。如果参数仍属于标定项，就不应在这里锁死具体数值。

## 8. 对当前 75 tests 的处理建议

不是简单删掉 58 个内部测试，而是：

1. 先根据 40 个 BDD Scenario 重新写一套独立的黑盒 acceptance matrix；
2. 在写新 acceptance tests 时完全不看 production helper 的函数边界，只看 BDD；
3. 新黑盒 suite 审查通过后，再决定旧测试：
   - 功能已被黑盒覆盖且只锁实现的 → 删除；
   - 有价值的 fault/persistence invariant → 移入 faults；
   - 确实要锁算法的 → 移入 mechanism；
4. 最后才运行现有 production，看新 acceptance suite 自然出现哪些 Red；
5. 这次不因为现有 production 已经 Green，就降低或调整新测试期望。

## 9. 审查结论

你的原始思路是正确的，而且当前测试集确实偏离了这个目标：**我们此前把“为了快速精确暴露已知实现 gap 的 TDD 测试”与“长期稳定的功能验收测试”混成了一套。**

这些白盒测试在定位旧 bug 时有效，但它们不应该成为未来功能需求的主要防线。

正确的下一步不是继续改 production，而是先重新从 BDD 的功能场景出发，独立设计一套黑盒 acceptance tests；审查这套测试本身是否完整、是否只表达功能与边界。只有这套测试定稿后，才应该再看 production 是否通过。
