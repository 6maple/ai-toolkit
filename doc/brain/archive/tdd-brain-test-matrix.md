> **Archive / Historical**：本文件保留用于背景与决策追溯；版本入口以 `doc/brain/README.md` 为准，v1/v2 规范分别位于对应版本目录。

# brain TDD 测试追踪矩阵

> **状态：Historical / Superseded** — 记录上一轮实现耦合较重的 TDD 轨迹，仅保留历史价值；当前测试设计以 `doc/brain/v1/bdd-brain-behavior-requirements.md` + `doc/brain/v1/acceptance-spec-brain.md` + `doc/design-rule.md` §13 为准。不得从本矩阵反推新的 acceptance test。

> **状态：TDD Green / 已完成（2026-08-20）**  
> **需求基线：`doc/brain/v1/bdd-brain-behavior-requirements.md`**
> **设计基线：`doc/brain/v1/design-brain-runtime.md`**
> **规则：测试只定义 BDD + Design 已确认行为；现有实现和旧测试不具备反向定义需求的权力。**

## 1. 测试策略

测试按“模型可见契约 → 领域纯规则 → 文件生命周期 → 一致性/并发 → 回归”分层。能通过真实 MCP stdio 验证的模型可见行为优先走真实 `Client + StdioClientTransport`，避免只测试内部 helper 却遗漏 schema/description/approval/output 等最终契约。

TDD 阶段遵守：

1. 先补齐/改写测试，不修改 `src/**`；
2. 运行测试，确认新测试对当前实现产生预期失败；
3. 删除或改写固化旧错误语义的历史测试；
4. 所有 REQ 至少映射到一个测试；
5. 未标定参数只测试方向/序关系，不锁死未经确认的数值；
6. production 修复必须由这些失败测试驱动。

## 2. REQ → Test 映射

| REQ | 主要测试 |
|---|---|
| REQ-SCOPE-001 | `brain_think advances the tick on ALL layers`; `MCP default none lets the model write directly to global` |
| REQ-SCOPE-002 | `REQ-SCOPE-002 / REQ-APPROVAL-001: default none lets the model write directly to global` |
| REQ-THINK-001 | `REQ-THINK-001 / D5: MCP exposes exactly 8 tools and brain_think only accepts session_id`; existing think tick tests |
| REQ-THINK-002 | existing `brain_think advances the tick on ALL layers` calls twice and expects both events |
| REQ-PATH-001 | existing whitelist/@-scheme/locator tests; `recycle/history is invisible to brain_ls and brain_grep`; MCP output isolation tests |
| REQ-PATH-002 | `session id is an identifier and rejects path syntax`; `brain_think rejects a traversal session_id` |
| REQ-PATH-003 | `parser distinguishes directory, archival item, and core`; `.md` item validation; `rm rejects a directory` |
| REQ-CORE-001 | existing core single-document/render tests |
| REQ-CORE-002 | existing `updateCore replaces...`; core↔core/mv tests |
| REQ-CORE-003 | existing `updateCore rejects an over-long core document...` |
| REQ-READ-001 | existing L0 candidate/exposure tests; `questioned candidates...` |
| REQ-READ-002 | `L1 returns summary metadata only and no body preview` |
| REQ-READ-003 | `an L2 request beyond EOF does not create a review event` |
| REQ-SEARCH-001 | existing grep/locator contract + MCP tool contract; no LLM/RAG behavior is architecture-nonfunctional |
| REQ-WRITE-001 | `brain_write create/overwrite preserves identity and learning state` |
| REQ-WRITE-002 | `brain_write rejects invalid semantic documents before persistence`; default difficulty test |
| REQ-EDIT-001 | `invalid edit or wrong feedback direction has zero side effects` |
| REQ-TYPE-001 | write type mismatch test; mv directory type migration test; `brain_edit cannot change type without moving the item` |
| REQ-FEEDBACK-001 | existing feedback clamp tests + wrong-direction MCP test; updated pure feedback tests |
| REQ-FEEDBACK-002 | existing correction/attribute tests; rm strong-correction lifecycle test |
| REQ-STATUS-001 | `questioned candidates are visible and rank below otherwise equal active candidates` |
| REQ-FSRS-001 | existing think tick/decay tests |
| REQ-FSRS-002 | existing L0 exposure test asserts stability unchanged |
| REQ-FSRS-003 | `L2 read refreshes retrieval without good-style stability growth`; updated L1/L2 tests; adopt tests |
| REQ-FSRS-004 | `new items get a mechanism-owned finite default difficulty` |
| REQ-MOVE-001 | existing promotion signal threshold test |
| REQ-MOVE-002 | core→archival invalid frontmatter; core→core; `same-layer archival→core leaves no active orphan state`; `same-layer core→archival clears core and registers one active item` |
| REQ-MOVE-003 | `cross-layer mv preserves id and mechanism learning state` |
| REQ-MOVE-004 | `mv file→memory type directory...`; `replacing an existing destination...`; existing same-layer mv regression |
| REQ-DEMOTE-001 | existing demotion signal test |
| REQ-RM-001 | existing rm recycle/history/status test |
| REQ-RM-002 | existing promotion no deletion-history test; mv replace deletion-history assertion |
| REQ-APPROVAL-001 | `protect mode evaluates all layers touched by mv`; default-none direct global write |
| REQ-APPROVAL-002 | same protect pending test additionally asserts source/destination unchanged |
| REQ-CONSISTENCY-001 | invalid edit zero side effect; `success is read-your-writes for write then cat`; mv consistency tests |
| REQ-CONSISTENCY-002 | same-process concurrent writes; global think concurrency; global write/write; global rm/write; global core-edit/think cross-process tests |
| REQ-CONSISTENCY-003 | `ids remain unique when the MCP server restarts at the same tick` |
| REQ-CONSISTENCY-004 | invalid edit zero side effect; lifecycle rollback-oriented tests; no silent split state |
| REQ-CONSISTENCY-005 | `truncated mechanism JSON is never silently reset`; atomic persistence regression |
| REQ-CORRUPT-001 | truncated state JSON test |
| REQ-CORRUPT-002 | duplicate active id test; active-state-without-index test |
| REQ-OUTPUT-001 | locator tests; `MCP errors never expose the physical project path`; recycle/history filtered from discovery/search |
| REQ-OUTPUT-002 | existing core payload/render tests; questioned status/candidate shape tests |

## 3. 需要改写的历史测试

以下旧测试编码了已被 BDD/Design 推翻的行为，必须在 production 修改前先改测试：

- L1 返回 20 行正文 preview → 改为 L1 只返回摘要/metadata；
- L2 read = good review → 改为 read 与 adopt 分离；
- `syncAfterWrite` 遇非法 importance 时“保留旧 importance 继续成功” → 改为非法最终文档必须拒绝；
- 跨层 mv 重新生成 layer-prefixed id → 改为同一记忆跨层保留 id；
- core 无 archival frontmatter 也可直接 mv 出 → 改为 D2 预校验拒绝且 source core 不变；
- path parser 用单一 `kind=file` 表示目录/item → 改为 directory/item/core 判别联合。

## 4. Red 阶段验收

进入 production 修复前必须满足：

- 原 baseline 41/41 已记录；
- 新测试可以编译并实际执行；
- 失败项能逐条回链已确认 REQ，而非测试自身错误；
- 旧错误测试已移除/改写，不存在相互矛盾的绿/红规格；
- `src/**` 在 Red 阶段没有被修改。

## 5. 本轮 Red → Green 记录

### 5.1 初始基线

在新增规格测试之前：

- `pnpm exec vitest run --configLoader native`：**5 files / 41 tests，41/41 通过**；
- `pnpm exec tsc --noEmit`：通过。

这个绿只代表旧测试集，不代表新 BDD/Design 已满足。

### 5.2 Red 阶段

完成新规格测试并先改写固化旧行为的历史测试、且尚未修改 production code 时：

- **10 files / 67 tests**；
- **38 passed / 29 failed**；
- TypeScript typecheck 仍通过。

红点直接对应已确认 gap，包括：session traversal、directory/item 混淆、D5 schema、D4 overwrite learning-state、L1 preview、L2=good、empty L2 review、questioned 排序、restart id、cross-layer re-key、mv directory/replace、approval source layer、global lost update、corruption invariant 等。

### 5.3 第一轮 Green 后的符合性审计

达到 67/67 后没有停止，而是继续按 Design/REQ 查找“已有矩阵间接覆盖但没有直接回归”的边界，新增测试再次抓到真实问题：

- `history/` / recycle 可通过 `brain_ls` / `brain_grep` 被模型观察；
- MCP ENOENT 错误泄露真实 Windows `.brain-data` 路径；
- global `rm ↔ write` 并发产生 lost update（8 个 survivor 实测只剩 5 个）；
- global `core-edit ↔ brain_think` 并发丢 tick（10 次实测只剩 3）；
- 同一 LayerRoot 的 item→core / core→item 使用两份 state snapshot，后一次 save 覆盖前一次 mutation。

这些问题均先增加失败测试，再修改 production code。

### 5.4 最终 Green

2026-08-20 最终验证：

- `pnpm exec vitest run --configLoader native`：**11 files / 75 tests，75/75 通过**；
- `pnpm exec tsc --noEmit`：**通过**；
- MCP 模型可见契约、文件生命周期、并发、重启、损坏与输出隔离均有直接回归覆盖。

## 6. 后续测试规则

本文件从一次性 TDD 计划转为持续回归追踪矩阵：

- 新需求先改 BDD，再改 Design，再先写失败测试；
- 修 bug 时优先把真实 failure mode 固化为回归测试；
- 不因为当前 production 行为修改测试期望；
- 参数标定只在需求明确后锁定具体数值，否则继续测试方向、范围和相对关系；
- 代码变化后重新运行全部 75+ 测试和 typecheck，并同步 BDD §19 的非规范实现快照。
