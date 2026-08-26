# brain Acceptance Specification

> **状态：Acceptance Specification Baseline / Frozen（2026-08-20）**  
> **阶段：Specification by Example + Test Design Review 已完成并冻结；production 验证结果记录在独立 Review / tests 中，不写回本规格。**  
> **输入：** `doc/brain/v1/bdd-brain-behavior-requirements.md` + `doc/brain/v1/brain-tools-contract.md` 的模型可见/public contract。
> **禁止输入：** `code/brain/src/**`、现有 tests 的内部 helper/fixture、当前 state/index schema、当前锁/事务/ID 算法。

## 1. 目的

本文档不是测试代码，也不是实现设计。它先冻结“从模型/public MCP 视角应该验证哪些功能场景、边界和失败结果”。

目标：

1. 用少量完整功能流覆盖 BDD，而不是机械做到“一条 REQ 一个 test”；
2. CI case 的 Given 优先围绕公开 application/tool 行为建立；Fake Green 可用测试内局部 stub，接 production 时 Arrange/wiring 可以调整；
3. When 只经过公开 brain tool/application contract；真实 MCP transport 只在 Manual/E2E 验证；
4. Then 只断言公开可观察行为或真正稳定的系统 invariant；
5. 不断言内部 JSON shape、UUID 格式、relative index path、helper 调用次数、锁实现、未标定 FSRS 精确数字；
6. 将 corruption、可预期 commit failure 等无法通过正常公开接口制造的场景单独标记为 Fault/Invariant；强制进程终止属于已确认的 durability non-goal，不生成 crash-recovery acceptance case。

## 2. 验证层级

### 2.1 Acceptance

主功能验收。正常情况下：

```text
Given  通过公开 brain_* 建立状态
When   调用公开 brain_* MCP tool
Then   再通过公开 brain_* / MCP result 观察结果
```

纯内部重构不应要求修改这些 case。

### 2.2 Contract

验证稳定的模型可见工具 surface，例如工具集合、参数是否公开、`brain_think` 是否只暴露 `session_id?` 等。只断言 public schema/能力，不锁 exact 文案。

### 2.3 Fault / Invariant

仅用于公开接口无法自然制造的前置故障：损坏持久状态、可预期提交中途异常、内部身份绑定冲突等。强制进程终止不属于必须恢复的 Fault contract。

Fault case 冻结的是**故障后的产品结果**；具体怎样注入故障必须等 Engineering Design 后再选，不能在本阶段反推测试 hook。

## 3. 不测试什么

Acceptance suite 不直接验证：

- `state.json` / `index.json` 字段；
- UUID / ULID / counter 的具体格式；
- storage relative path；
- `moveItem()` / `syncAfterWrite()` / `buildCorePayload()` 等内部函数；
- lock 是否被调用、调用几次；
- transaction/temp/rename 的执行顺序；
- `stability=2.2`、`difficulty=0.4` 等未成为 public contract 的精确机制数字；
- exact error/tool-description 全文字符串。

如果未来实现完全替换，只要 public behavior 相同，Acceptance cases 应保持有效。

---

### 2.4 Test Case Execution Class

每个测试用例必须明确归入以下两类之一。

#### CI Automated

CI 自动执行，但**不得创建真实资源**：

- 不创建真实文件/目录、真实持久化 memory/store；
- 不启动 child process / MCP stdio server；
- 不建立网络连接，不调用真实 LLM/embedding/外部 API；
- 不依赖真实 wall-clock sleep 或概率竞态；
- 可以运行真实 production 业务逻辑，但其 persistence / IO / process / network / LLM resource ports 必须使用 stub/fake；
- 普通 object / array / Map 作为测试数据或 test double 内部状态是允许的，不视为真实资源。

除非明确标记为 Manual/E2E，本文 `AC-*` / 可确定性注入的 `FI-*` / `INVARIANT-*` 默认按 CI Automated 设计。

#### Manual / E2E

CI 不自动执行。只有这类用例允许真实资源调用，例如：

- 真实 MCP stdio 与 host wiring；
- 真实文件系统；
- 真实多进程并发；
- 真实 restart / persistence（用于身份连续性等已规定行为；不验证 crash durability）；
- 真实网络/外部服务；
- LLM/AI 自然语言语义检查。

Manual 用例仍然必须有明确 Given / When / Then、执行步骤、预期与失败判据，不能变成随意人工观察。

### 2.5 Fake Green：自动化测试脚本先证明自己

适合 CI Automated 的测试脚本，在连接 production 前先做 **Fake Green**。

- 每个 test 就地创建自己需要的最小 stub/fake，例如 `{ callTool: vi.fn() }`；
- 每次 mock 行为紧贴对应 action 前声明，保持“安排 → 执行 → 断言”的认知局部性；
- 能用空对象、固定返回值或单个 `vi.fn()` 就不要抽 factory/driver/reference implementation；
- 只有场景本身确实需要状态时才使用最小状态 Fake；
- Fake 不 import production，不复制 store/FSRS/transaction/lock/domain 实现；
- Fake Green 只证明 test code、fixture、matcher、参数化与场景步骤自洽，不代表 production 通过。

Fake Green 后冻结的是 Scenario、输入边界、Expected behavior 与核心业务 assertions。进入 production 阶段**允许修改测试的 Arrange、实例创建、dependency injection 与 helper/wiring**，使测试连接真实 production business logic + fake resource ports。

如果为了接 production 必须修改 expected behavior，说明 production 或规格存在问题；如果只是修改 `const sut = ...` 如何构造，这是正常的。
# 4. Contract 与认知锚

## AC-CONTRACT-001：公开工具 surface

**来源：** public tool contract；REQ-THINK-001；D5 既有裁决  
**类型：** Contract
**Execution：** CI Automated

**Given** 构造 brain 的公开 tool contract surface，所有 resource ports 使用 stub/fake，且不启动真实 MCP transport  
**When** CI test driver 查询公开工具定义  
**Then** 应暴露约定的 8 个 `brain_*` 能力：think / ls / grep / cat / write / edit / rm / mv  
**And** `brain_think` 的模型输入只包含可选 `session_id`，不公开 `project_root` 这类 server 配置参数  
**And** mutation tools 暴露与其公开确认流程对应的 `confirmed?`。

> 不比较整个 JSON schema snapshot；只检查稳定的模型可见能力和已确认参数边界。

## AC-CONTRACT-002：brain_think description 保留认知锚语义

**来源：** REQ-THINK-001  
**类型：** Contract
**Execution：** Manual / E2E — via `MAN-AI-001`

**When** client 查询 `brain_think` 的模型可见 tool description  
**Then** description 必须表达两个稳定语义：

1. 收到每条新的用户消息后，应立即调用一次 `brain_think`；
2. 应先取得返回的 memory view，再把它作为当前记忆继续本轮思考、回答和行动。

**But** 不要求 exact wording、句子顺序或整段 snapshot 一致。

> 这是模型行为 contract，不是普通提示文案。CI 只在 `AC-CONTRACT-001` 守 public surface/description presence 等结构条件；本项完整语义由 `MAN-AI-001` 按 rubric 检查。禁止 exact snapshot 或关键词拼凑式语义测试。
## AC-ANCHOR-001：一次 think 返回完整认知锚

**覆盖：** SCOPE-001-A, THINK-001-A, CORE-001-A, READ-001-A, OUTPUT-002-A

**Given** global / project / session 各有不同 core，并存在若干 archival memories  
**When** 调用一次 `brain_think`  
**Then** 返回 global → project → session 三层 core  
**And** 返回 L0 candidates 与机制 signals  
**And** candidates 只携带目录级信息，不展开仅存在于 body 的细节  
**And** candidates 保持有界，不把无限候选或正文整体倾倒进认知锚  
**But** 不注入“新记忆必须先写 session 再晋升”等固定 scope heuristic。


## AC-SCOPE-001：模型可直接选择 global

**覆盖：** SCOPE-002-A

**Given** approval=`none`，模型已判断某条合法 memory 应跨项目生效  
**When** 直接 `brain_write` 到 global public path  
**Then** write 成功  
**And** 后续通过 global scope 的公开读取/发现仍可以看到它  
**But** 不要求先写 session 或先积累 promotion 历史。

---

# 5. Namespace、寻址与浏览

## AC-PATH-001：只能使用 public @-scheme

**覆盖：** PATH-001-A, PATH-001-B, OUTPUT-001-A

参数化验证：

- mechanism/internal address；
- 绝对文件系统路径；
- 非 @-scheme 普通路径。

**When** 将其交给一个需要 memory path 的公开 brain tool  
**Then** 请求被拒绝  
**And** error/result 不泄露可用的物理 memory 路径或内部机制地址。

## AC-PATH-002：session id 所有入口一致安全

**覆盖：** PATH-002-A, PATH-002-B

参数化非法值：`..`、路径分隔符、空值、控制字符、明显路径语法。

对每个非法值分别经：

- `brain_think.session_id`；
- `@/sessions/<sid>/...`；
- `@core/sessions/<sid>.md`。

**Then** 所有入口都拒绝，并且没有入口可作为绕过路径。

## AC-PATH-003：item 操作要求明确 `.md` file path

**Execution：** CI Automated


**覆盖：** PATH-003-A, PATH-003-B, MOVE-004-B

参数化动作：

- `brain_rm` 对 directory；
- write/edit/rm 的目标为 type directory；
- mv source 为 directory；
- mv destination 只给 type directory；
- archival path 使用非 `.md` 文件名。

**Then** 均明确拒绝  
**And** 原 memory 状态不变  


## AC-LS-001：ls 浏览三个公开 scope

**覆盖：** PATH-001-C

分别在 project / session / global 建立公开 memories 后：

**When** 对对应公开 namespace 调用 `brain_ls`  
**Then** 返回该 scope 可寻址的公开 directories/items  
**And** 不出现内部机制存储、recycle/audit 载体或物理路径。

---

# 6. Core、渐进读取与搜索

## AC-CORE-001：core 可直接完整读取与整篇替换

**覆盖：** CORE-002-A, CORE-002-B

**Given** 某层 core 有旧文档  
**When** `brain_cat` 读取 core  
**Then** 直接得到当前完整 core 文档，不进入 archival L1/L2 语义  
**When** 再以 `brain_edit content=...` 替换 core  
**Then** 后续 `brain_cat` 与 `brain_think` 都立即看到新文档，旧文档不再作为当前 core 出现。

## AC-CORE-002：core 超限拒绝且无部分状态

**Execution：** CI Automated


**覆盖：** CORE-003-A

**Given** 当前 core 有稳定旧内容  
**When** edit 或 move 尝试写入超过当前 core 容量上限的文档  
**Then** 请求失败  
**And** 原 core 仍完整可读  
**And** 若是 move，source 仍存在、destination 未出现半完成结果  




## AC-READ-001：L1 只读摘要级信息

**覆盖：** READ-002-A

**Given** 一个 archival memory，其 body 包含只在正文出现的独特 marker  
**When** `brain_cat` 不提供正文分页位置  
**Then** 返回 summary/frontmatter 必要 metadata  
**But** 不返回 body marker 或正文 preview。

## AC-READ-002：L2 读取真实正文页

**覆盖：** READ-002-B

**Given** 一个多页 archival body  
**When** `brain_cat` 提供正文 offset/limit  
**Then** 返回对应实际正文页  
**And** 不越过请求分页范围  
**And** 实际读到正文才算发生一次 L2 read。

## AC-READ-003：EOF 空页不产生有效 review

**覆盖：** READ-003-A

**Given** 一个可产生后续 learning/promotion 行为的 memory  
**When** 使用超过正文末尾的 offset 调用 L2  
**Then** 返回明确的无更多内容结果  
**And** 后续行为与“没有发生这次有效 L2 read”一致  
**But** 不把空读当 successful use。

> 不直接断言 stability/retrievability 字段。

## AC-SEARCH-001：literal 与 regex 都是机械匹配

**覆盖：** SEARCH-001-A, SEARCH-001-B

建立三条内容：

- A 包含 literal `auth-token-42`；
- B 只表达语义相近内容但不含 literal；
- C 满足给定 regex 但不满足 literal。

**When** 分别执行 literal grep 与 regex grep  
**Then** 每次只返回表达式真实命中的公开 memory  
**And** 不因为语义相似自行扩展结果。

---

# 7. Write、Edit 与 semantic contract

## AC-WRITE-001：合法 create 覆盖 semantic contract 边界

**覆盖：** WRITE-001-A, WRITE-002-C, WRITE-002-D, FSRS-004-A

使用参数化合法文档：

- importance=`0`；
- importance=`1`；
- body 为空；
- 不提供 difficulty。

每份文档都具有合法 type / 非空 summary / importance。

**When** `brain_write` 到不存在的明确 `.md` path  
**Then** write 成功  
**And** 后续 L1 可发现/读取 semantic metadata  
**And** 模型无需提供任何 initial difficulty。

## AC-WRITE-002：overwrite 是同一 memory 的整篇更新

**覆盖：** WRITE-001-B

**Given** 一条 memory 先通过公开 feedback 进入一个可观察的非初始学习状态（优先使用 questioned，因为公开可见）  
**When** 对同一路径执行合法 `brain_write` overwrite，且不提交新的 feedback  
**Then** body/semantic metadata 更新为新文档  
**And** 原有可观察学习历史仍然存在  
**And** overwrite 本身不被当作新 memory 创建或新的 adopt/correct 事件。

> 不检查 internal id 是否相同；检查的是“同一 memory 的行为连续性”。

## AC-WRITE-003：非法 document create/overwrite 都是零部分状态

**覆盖：** WRITE-002-A, WRITE-002-B, TYPE-001-A, CONSISTENCY-001-A

参数化非法结果：

- 缺 type / summary / importance；
- type 不在枚举；
- summary 为空；
- importance 非数字、<0、>1；
- path type 与 document type 不一致。

分别对“不存在 destination”和“已有 destination”执行。

**Then** 请求失败  
**And** create 情况下后续不存在半创建 memory  
**And** overwrite 情况下旧 memory 仍完整可读/可发现。

## AC-EDIT-001：合法局部 edit 只改变目标内容

**覆盖：** EDIT-001-C

**Given** 一个包含多个独立段落和合法 metadata 的 archival memory  
**When** `brain_edit` 对其中一个明确片段做合法局部修改  
**Then** 修改片段与预期一致  
**And** 其余未编辑正文保持不变  
**And** 后续 L1/L2 看到一致的新状态。

## AC-EDIT-002：resulting document 非法则整次 edit 拒绝

**覆盖：** EDIT-001-A, EDIT-001-B, TYPE-001-A, CONSISTENCY-001-A

参数化 edit：

- importance → 非法；
- type → 非法枚举；
- summary → 空；
- type 改成与当前 public path 目录冲突。

**Then** edit 失败  
**And** 后续 L1/L2 仍看到 edit 前完整 memory  
**And** 不出现 path semantic type 与读取 metadata 互相矛盾的状态。

---

# 8. Feedback、questioned 与 learning semantics

## AC-FEEDBACK-001：feedback 方向错误必须 reject

**覆盖：** FEEDBACK-001-A

参数化：

- correct 却提高 importance；
- adopt 却降低 importance（若公开 contract 定义为非法方向）；
- attribute 却提高 importance。

**Then** 请求失败  
**And** memory 内容/状态与操作前一致  
**And** 不产生 successful-use 或 failed/corrected-use 记录。

## AC-FEEDBACK-001B：feedback-only event 不要求文本修改

**覆盖：** FEEDBACK-001-C, FSRS-003-B

**Given** existing archival memory 的内容无需修改  
**When** `brain_edit feedback=adopt edits=[]`  
**Then** 请求合法并记录一次 successful-use  
**And** 正文/semantic metadata 不变  
**When** `brain_edit feedback=attribute edits=[]` 且 delta=0  
**Then** 请求合法并记录失败归因，但不自动 questioned  
**But** 0-delta `correct` 非法。
## AC-FEEDBACK-002：合法方向越界可以 clamp 并告知

**Execution：** CI Automated


**覆盖：** FEEDBACK-001-B

**Given** feedback 方向正确但 requested delta 超出该 feedback 合法范围  
**When** 提交 edit+feedback  
**Then** 请求可以成功  

**And** 后续 L1 看到的 importance 落在允许边界  


## AC-FEEDBACK-003：correct / attribute / rm 的语义分离

**覆盖：** FEEDBACK-002-A, FEEDBACK-002-B, FEEDBACK-002-C, STATUS-001-A

使用三条初始等价 active memories：

1. 对 A 提交合法 `feedback=correct`；
2. 对 B 提交合法 `feedback=attribute`；
3. 对 C 执行 `brain_rm`。

随后 `brain_think` / search：

**Then** A 仍可召回并明确显示 questioned，且相对 otherwise-equivalent active memory 降权  
**Then** B 仍是正常 active，不因 attribute 自动 questioned  
**Then** C 不再进入正常 active discovery/recall。

## AC-LEARNING-001：L0/L2 read 不等于 adopt

**覆盖：** FSRS-002-A, FSRS-003-A, FSRS-003-B

使用两条 otherwise-equivalent memories：

- A：先经历多次 L0 展示与真实 L2 阅读，但不 adopt；
- B：不做这些额外 read/exposure。

随后对 A/B 分别只通过明确 adopt 推进 successful-use history，直到各自首次出现 promotion signal。

**Then** A 不应因为此前 L0/L2 就少需要 successful-use adoption 才达到 promotion 条件  
**And** 只有明确 adopt 才计入 successful-use learning  
**And** L2 read 本身不会额外重复一次同等 successful-use reinforcement。

> 整个判断只观察公开 signal 与显式 adopt 次数，不读取 usage/stability。

---

# 9. Move、promotion、demotion 与 rm

## AC-MOVE-001：core → archival 缺 semantic contract 时拒绝

**Execution：** CI Automated


**覆盖：** MOVE-002-A

**Given** source core 是普通 Markdown，没有合法 type/summary/importance  
**When** `brain_mv @core/... <明确 archival .md path>`  
**Then** 请求失败  
**And** source core 保持原样  
**And** destination 不出现  


## AC-MOVE-002：archival → core 替换

**覆盖：** MOVE-002-B

**Given** source archival 有完整正文，destination core 有旧内容  
**When** `brain_mv <archival .md> @core/<layer>.md`  
**Then** destination core 变成 source 文档  
**And** source archival path 不再 active  
**And** 后续 think/cat 只看到新 core。

## AC-MOVE-003：合法 core → archival

**覆盖：** MOVE-002-C

**Given** core 已通过 edit 具有合法 archival semantic metadata  
**When** mv 到明确 `.md` archival destination  
**Then** source core 清空  
**And** destination 可被 ls/grep/cat 正常使用  
**And** 正文不丢失。

## AC-MOVE-004：core → core

**覆盖：** MOVE-002-D

**Given** source core 与 destination core 都有内容  
**When** core file → core file  
**Then** destination 被 source 替换  
**And** source 清空。

## AC-MOVE-005：fresh archival file → fresh archival file

**覆盖：** MOVE-004-C, RM-002-A

参数化同层与跨层 move：

**Given** source 是存在学习历史的 archival memory，destination 是不存在的明确 `.md` path  
**When** `brain_mv src dst`  
**Then** source path 消失  
**And** destination 可读到完整 source 内容  
**And** 原学习历史继续影响 destination memory  
**But** 不产生“强纠正删除”的产品语义。

## AC-MOVE-006：existing destination 使用 replace 语义

**覆盖：** MOVE-004-A

**Given** src 与 dst 都是不同的合法 active archival memories  
**When** `brain_mv src dst`  
**Then** dst 最终是 src 的完整内容/语义  
**And** src path 消失  
**And** 原 dst 不再作为另一条 active memory 被 ls/grep/think 观察到  
**And** src 的学习历史继续作用于最终 dst  
**And** 不出现 phantom/duplicate active memory。

## AC-MOVE-007：跨层 move 保留真实学习历史

**覆盖：** MOVE-003-A

1. 在 session 创建 subject memory；
2. 只通过公开 adopt + `brain_think` 反复推进，直到 subject 首次出现 promotion signal；
3. 模型主动 `brain_mv` 到 project 的明确 `.md` path；
4. 再把同一 memory `brain_mv` 回 session 的另一个明确 `.md` path；
5. 不增加新的 adopt，直接执行 `brain_think`。

**Then** 回到 session 后应立即再次体现已经达到的 promotion/successful-use 条件  
**And** 不得表现成一条从零开始的新 memory。

> 通过 round-trip 让 observable witness 仍落在 session promotion 语义上；不读取 usage/state，也不预先知道或硬编码 promotion threshold。

## AC-PROMOTION-001：promotion/demotion 都只是 signal

**覆盖：** MOVE-001-A, DEMOTE-001-A

**Promotion branch**：通过公开 adopt 行为达到 promotion 条件后 `brain_think` 可以给 signal，但 memory scope 在模型主动 mv 前不变。  
**Demotion branch**：通过足够 brain events 形成 demotion signal 后，memory 在模型主动 rm/mv/edit 前仍可读/可检索。

**Then** 两种 signal 都不能自行执行 scope change 或 delete。

## AC-RM-001：rm 退出正常 active memory

**覆盖：** RM-001-A, FEEDBACK-002-B

**Given** 一条正常可发现 memory  
**When** `brain_rm`  
**Then** 后续 ls/grep/think 不再返回它作为 active memory  
**And** 原 public path 不再作为当前 active memory 正常读取。

> “可恢复、可审计”部分没有公开恢复 API，留到 Invariant specification；不通过读取某个固定 history 文件来冒充功能 acceptance。

## AC-RM-002：core 不能直接 rm

**Execution：** CI Automated


**覆盖：** RM-001-B

**Given** core 有内容  
**When** `brain_rm @core/...`  
**Then** 拒绝  
**And** core 保持不变  


---

# 10. Approval

## AC-APPROVAL-001：none 不阻塞合法 mutation

**覆盖：** APPROVAL-001-A

参数化 representative operations：write / edit / rm / mv / core edit，覆盖 session/project/global 中合法组合。

**Given** approval=`none`  
**When** 操作本身合法  
**Then** 不因 approval 进入 pending 状态。

## AC-APPROVAL-002：protect 按所有 touched long-term layers 判断

**覆盖：** APPROVAL-001-B, APPROVAL-001-C

参数化：

- session-only edit → 不需要 long-term approval；
- project write/edit/rm/core edit → 需要；
- global mutation → 需要；
- project → session mv → 需要（source project 被修改）；
- session → project mv → 需要（destination project 被修改）。

**Then** approval 结果只由实际 touched long-term scope 决定，不因工具类型或只看 destination 而绕过。

## AC-APPROVAL-003：pending 零副作用，confirmed 重试才执行

**Execution：** CI Automated


**覆盖：** APPROVAL-002-A, APPROVAL-002-B

**Given** protect 下一个需要确认的合法 mutation  
**When** 首次未 confirmed 提交  
**Then** 返回 pending approval  
**And** 通过公开读取观察到的 memory 内容、学习状态、删除/移动结果均未变化  
**When** 以相同 mutation + `confirmed:true` 重试  
**Then** mutation 才真正生效。

---

# 11. Consistency、并发与 restart

## AC-CONSISTENCY-001：success 即 read-your-writes

**覆盖：** CONSISTENCY-001-B

对 write / edit / mv / rm / core edit 各取一个代表性合法 mutation：

**When** tool 返回 success  
**Then** 紧接着通过对应 public read/discovery 必须看到新状态  
**And** 不存在 success 后仍看到旧状态的延迟窗口。

## AC-CONSISTENCY-002：同一 layer 并发成功结果不丢失

**覆盖：** CONSISTENCY-002-A

**Given** 两个并发 client 对同一 layer 的不同明确 file paths 发起合法 create/mutation  
**When** 两个调用都返回 success  
**Then** 后续 public discovery/read 必须同时看到两个结果  
**And** 不能有一个 success 被另一个静默覆盖。

## AC-CONSISTENCY-003：多个 project server 共享 global 不 lost update

**Execution：** Manual / E2E


**覆盖：** CONSISTENCY-002-B

**Given** 两个独立 project MCP server 共享同一个 global memory  
**When** 两边并发执行不同 global mutations  
**Then** 所有返回 success 的 mutation 都能从任一 server 后续 global read/discovery 中观察到  
**Or** 若系统不能安全完成某个操作，应明确返回失败，而不是 success 后丢更新。

## AC-CONSISTENCY-004：restart 后新旧 memory 身份仍独立

**Execution：** Manual / E2E


**覆盖：** CONSISTENCY-003-A

**Given** server A 创建 memory old，并通过 public feedback 赋予它独特可观察学习状态  
**When** 关闭并重新启动 server B 指向相同持久数据，再创建 memory new  
**Then** old/new 都能独立读取/编辑  
**And** 对 new 的 feedback 不改变 old 的可观察 learning state  
**And** new 不继承 old 的学习历史。

> 不读取或比较 internal ID。

---

# 12. Fault / Invariant Specification

这些 case 的 expected behavior 现在可以冻结，但**故障注入办法必须等 Engineering Design 后再决定**。

## FI-CONSISTENCY-001：可预期提交失败不能留下正常可见的半 mutation

**覆盖：** CONSISTENCY-004-A [Fault]

**Given** 一个合法 mutation 已开始，但在完整提交前发生可预期失败  
**When** tool 最终向 caller 报告 failure  
**Then** 系统必须恢复到操作前可观察状态，或进入明确、可验证的恢复/损坏状态  
**But** 不能一边报告普通 failure，一边继续把半 mutation 当正常 memory 提供服务。

### Crash termination boundary（非验证 case）

**对应：** CONSISTENCY-005-A [Boundary]

进程在 mutation 完成前被 SIGKILL、宿主崩溃或机器断电强制终止时，brain 允许当前未完成 mutation 丢失；不要求自动 rollback、roll-forward、journal recovery，也不要求识别所有仍可解析的跨文件部分提交组合。

如果重启后落盘表示不可解析或明确违反既有 invariant，则由 `FI-CORRUPT-*` 继续验证 fail-loud。该边界本身不生成 Manual/E2E crash-recovery case。

## FI-CORRUPT-001：不可解析持久状态 fail loud

**覆盖：** CORRUPT-001-A [Fault]

**Given** 已存在持久状态被外部破坏为不可解析  
**When** server 加载对应 layer  
**Then** 明确报错/拒绝继续正常使用  
**But** 不自动当作“首次启动空状态”覆盖掉原数据。

## FI-CORRUPT-002：两个 active memories 错误共享学习身份时 fail loud

**覆盖：** CORRUPT-002-A [Fault]

**Given** 外部故障制造了两个不同 active memories 共享同一学习身份的持久冲突  
**When** layer 被加载或参与 mutation  
**Then** fail loud 或进入明确 recovery  
**But** 不继续正常运行并允许两条 memory 互相污染学习历史。

## INVARIANT-THINK-001：每次成功 brain_think 都是新 event

**覆盖：** THINK-002-A [Invariant]

**Given** 同一 session 已成功执行一次 `brain_think`  
**When** 再执行一次 `brain_think`  
**Then** 第二次成功调用必须作为新的 brain event 生效，不因“同一 turn / 重复调用”被 dedupe。

normal acceptance 可以验证第二次调用正常成功；“事件时间确实多推进一次”的确定性验证放在 Invariant Test，避免通过 internal tick 字段或脆弱的间接排名副作用来证明。
## INVARIANT-EVENT-001：wall-clock 本身不构成记忆事件

**覆盖：** FSRS-001-A [Invariant]

这是稳定领域 invariant：相同 brain-event 序列不能仅因为现实等待时间不同而产生额外遗忘/强化。

不在 normal acceptance 中使用真实长时间 `sleep` 来证明它。Engineering Design 后选择确定性验证方式，但测试只能证明“event sequence 决定时间推进”，不能锁定具体时钟/helper 实现。
## INVARIANT-RM-001：rm 的删除应可恢复、可审计

**来源：** REQ-RM-001

这是稳定系统 invariant，但当前没有模型可见 restore/audit API，因此不在正常 black-box acceptance 中读取某个固定内部文件来证明。

Engineering Design 完成后，Invariant Test 只需要证明：

- rm 不是不可恢复物理销毁；
- 存在足够信息重建被删除 memory 与删除事件；
- 普通 move/promotion 不被归类为用户强纠正删除；
- 验证方法不应锁死某个具体 `history.jsonl` 文件名，除非该文件格式被另行提升为稳定 contract。

---

# 13. Manual / E2E Test Cases

这些用例**不进入普通 CI**，只有它们允许创建真实资源或进行真实语义调用。它们与 CI Automated cases 共同构成完整验收证据。

## MAN-MCP-001：真实 MCP stdio wiring

**Execution：** Manual / E2E  
**覆盖：** public tool contract / AC-CONTRACT-001 的真实 transport adapter

**Given** 使用真实启动命令启动 brain MCP stdio server  
**When** 真实 MCP client 完成 initialize、listTools，并至少调用一次代表性 read 与 mutation tool  
**Then** 8 个公开 `brain_*` tools 能通过真实 transport 访问  
**And** public schema 与 CI contract guard 一致  
**And** 不因为 transport/host wiring 改变业务语义。

## MAN-AI-001：模型可见自然语言 contract 语义检查

**Execution：** Manual / E2E — AI Review

**覆盖：** AC-CONTRACT-002，以及 PATH-003-B / CORE-003-A / FEEDBACK-001-B / MOVE-002-A / RM-001-B / APPROVAL-002-A~B 中的模型可理解 guidance 语义  

由 AI 按 rubric 检查代表性真实 tool description / result，而不是关键词或全文 snapshot。

至少检查：

1. `brain_think` description 完整表达“收到新用户消息后立即调用一次”；
2. 完整表达“拿到 memory view 后再继续本轮思考/回答/行动”；
3. mv destination 只给 directory 时，错误能让模型知道必须给明确 destination file；
4. core 超限时，返回能指导“保留常驻要点，其余移入 archival 后重试”；
5. feedback clamp 时，模型能明确知道 requested 与 applied 的差异；
6. core→archival 缺 semantic metadata 时，能明确知道先用 edit 补齐 type/summary/importance；
7. 对 core 执行 rm 时，能明确知道应使用 edit 或合法 mv；
8. protect pending 时，模型能理解尚未修改 memory，需确认后以 `confirmed:true` 重试。

**Pass**：语义完整、可执行、无歧义；允许改写措辞与句序。  
**Fail**：关键步骤缺失、方向相反、需要猜测下一步，或依赖内部物理路径。

## MAN-FS-001：真实文件系统 adapter 与 @-scheme 隔离

**Execution：** Manual / E2E

**Given** 使用真实临时 project/global 数据根启动 server  
**When** 通过真实 MCP 执行 write / ls / grep / cat / rm  
**Then** public @-scheme 与真实文件系统映射正确  
**And** internal mechanism/recycle/audit 载体不通过正常 ls/grep 暴露  
**And** 正常/错误输出不泄露可用物理路径  
**And** 非 @-scheme / traversal 不能越出配置的数据根。

## MAN-RM-001：真实删除的 recover/audit 证据

**Execution：** Manual / E2E  
**覆盖：** INVARIANT-RM-001 的 resource-adapter 部分

**Given** 一条真实持久化 archival memory  
**When** 通过真实 MCP 执行 rm  
**Then** public active discovery 中消失  
**And** 真实持久化层仍保留足以恢复正文和解释删除事件的证据  
**And** 普通 mv/promotion 不被记录成同类强纠正删除。

---
# 14. Coverage Review

## 14.1 功能维度

| 功能维度 | Acceptance cases | 状态 |
|---|---|---|
| MCP public surface / think anchor | AC-CONTRACT-001~002, AC-ANCHOR-001 + INVARIANT-THINK-001 | covered, split acceptance/invariant |
| 三层 scope | AC-ANCHOR-001, AC-SCOPE-001, AC-LS-001 | covered |
| @-namespace / session safety | AC-PATH-001~003 | covered |
| core | AC-CORE-001~002, AC-MOVE-001~004, AC-RM-002 | covered |
| L0/L1/L2 | AC-ANCHOR-001, AC-READ-001~003 | covered |
| ls/grep | AC-LS-001, AC-SEARCH-001 | covered |
| write | AC-WRITE-001~003 | covered |
| edit | AC-EDIT-001~002 | covered |
| feedback/questioned | AC-FEEDBACK-001~003 | covered |
| learning event semantics | AC-LEARNING-001 + INVARIANT-EVENT-001 | covered, split acceptance/invariant |
| move | AC-MOVE-001~007 | covered |
| promotion/demotion | AC-PROMOTION-001 | covered |
| rm | AC-RM-001~002 + INVARIANT-RM-001 | covered, split acceptance/invariant |
| approval | AC-APPROVAL-001~003 | covered |
| read-your-writes | AC-CONSISTENCY-001 | covered |
| same-process/multi-process concurrency | AC-CONSISTENCY-002~003 | covered |
| restart identity independence | AC-CONSISTENCY-004 | covered |
| commit/corruption | FI-* | covered as Fault spec；强制终止 durability 为明确 non-goal |
| physical path/output abstraction | AC-PATH-001 | covered |

## 14.2 抽象边界检查

CI Automated case 不应：

- import production 私有 helper/module；Fake Green 阶段不 import production；Production CI 阶段只通过稳定 application/tool facade 接入真实业务逻辑；
- 直接读写 mechanism JSON；
- 比较 internal id；
- 比较 exact FSRS numeric state；
- 断言 lock/transaction implementation；
- 断言 exact prose。

Fault / Invariant 若可通过 stub/fake resource port 确定性制造则进入 CI；必须使用真实 filesystem/process 才成立的已规定行为明确进入 Manual/E2E。强制终止 crash durability 不属于验证要求。

## 14.3 Test Design Review 结论

本轮 Freeze 前复审已完成：

1. 参数化 case 只合并共享同一行为契约的输入边界，没有为了减少 test 数量混合无关 failure；
2. wall-clock/event-time 不再使用真实 `sleep` 的 normal acceptance，已拆为 `INVARIANT-EVENT-001`；
3. repeated `brain_think` 的事件推进不通过 internal tick 或脆弱排名副作用证明，已拆为 `INVARIANT-THINK-001`；
4. `AC-MOVE-007` 使用 public adopt → promotion signal → project round-trip → session signal 的行为链验证 successful-use history 连续性，不读取 threshold/usage/state；
5. rm 的“退出 active memory”由 black-box acceptance 验证；“可恢复、可审计”由 `INVARIANT-RM-001` 验证，不读取固定 history 文件冒充公开行为；
6. exact 文案只在 `brain_think` description 这种真正的模型行为 contract 中验证必要语义，不做全文 snapshot。
## 14.4 Execution Classification

### CI Automated（默认）

除下列 Manual 例外外，所有 `AC-*`、`FI-*`、`INVARIANT-*` 都按 CI Automated 设计：真实 production business logic 可以运行，但 persistence / IO / process / network / LLM 等 resource ports 必须 stub/fake，不创建真实资源。

CI 代表性范围包括：path/semantic validation、L0/L1/L2 行为、write/edit/feedback、move/rm 领域语义、approval、read-your-writes、可确定性并发模型、可预期 persistence failure、corrupt snapshot handling、event-time invariant、rm recover/audit domain semantics。

### Manual / E2E（显式例外）

| Case | 原因 |
|---|---|
| `AC-CONTRACT-002` | 自然语言 description 需要 AI semantic review；实际执行并入 `MAN-AI-001` |
| `AC-CONSISTENCY-003` | 必须验证两个真实 project process 共享 global |
| `AC-CONSISTENCY-004` | 必须验证真实 process restart + persistence |
| `MAN-MCP-001` | 真实 MCP stdio/host wiring |
| `MAN-AI-001` | LLM/AI 对模型可见自然语言语义的真实 review |
| `MAN-FS-001` | 真实 filesystem/@-scheme adapter |
| `MAN-RM-001` | 真实 recover/audit 持久化证据 |

Manual case 不进入普通 CI。CI 中即使存在相似 domain test，也不能替代这里的真实 adapter 证据。
---

# 15. Freeze 条件

本文档进入 **Acceptance Specification Baseline / Frozen** 前，需要确认：

- [x] BDD re-review 完成且无行为歧义；
- [x] 每个 BDD Scenario 都被至少一个 case 覆盖；
- [x] public tool contract 的稳定 surface 已覆盖；
- [x] normal Acceptance cases 无需知道 production internal representation；
- [x] Fault/Invariant cases 与 normal Acceptance 分开；
- [x] 参数标定值没有被错误提升成 acceptance expectation；
- [x] exact 文案没有被当作主要功能断言；
- [x] pure refactor 在 public behavior 不变时，不应要求大面积修改本 specification。
- [x] CI Automated tests 先以最小 Stub/Fake 完成 Fake Green，再接真实 production business logic + fake resource ports；真实 MCP/FS/process/LLM adapter 只由 Manual/E2E 用例验证。

Freeze 后才进入 Engineering Design；Design Freeze 后先做 CI/Manual 分类与测试脚本 Self-Validation，再允许 current production 进入视野。
