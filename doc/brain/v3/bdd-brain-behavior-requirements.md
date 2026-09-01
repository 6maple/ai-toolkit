# brain 行为需求 v3（BDD Requirements Baseline）

> **状态：BDD Requirements Baseline / Frozen for v3 Acceptance（2026-08-30，anchor semantics re-freeze）。**
> 当前 62 REQ / 140 Scenario 已重新确认；Public Contract / Acceptance 已从本基线同步并完成 140/140 Scenario coverage，Engineering Design 继续只能从这些上游行为推导。
> 本文只定义可观察的 **What / invariant**，不提前冻结 Engineering Design（How）。
> **变更控制：** Freeze 后若需要改变 observable behavior / invariant，先重新打开本 BDD 与受影响 Scenario，再同步 Public Contract / Acceptance；Engineering Design 不得反向修改本基线来迁就实现。
> v2 [`../v2/bdd-brain-behavior-requirements.md`](../v2/bdd-brain-behavior-requirements.md) 是冻结前代；v3 在完整继承其余行为的基础上，重新裁决 model-visible anchor semantics。  
> 2026-08-22 的 v2 形成过程曾发生真实磁盘内容损坏：中文被替换为字面 `?`。继承内容依据保真的 ChatGPT Share transcript、continuation ledger、checkpoint 与仍完整的 ASCII REQ/Scenario 骨架重建；不声称逐字恢复损坏前的中文。v3 保持一一对应的 requirement/scenario structure，并使用本版本的 `REQ3-*` / `*3-*` ID。

---

## 1. 目标与边界

brain 的目标不是模拟人脑本身，而是在有限且持续变化的 LLM working context 中，让过去值得继续影响未来的 cognition 能被恢复、发现和读取，并让本轮新形成或被实质更新、且值得跨未来持续的 cognition 有机会进入正确的 persistent owner。

```text
user message
→ turn-level memory anchor restore
→ core + bounded L0 cues enter current context
→ model reasons from applicable persistent cognition + latest input + current evidence
→ task/context may create retrieval intent or gap
→ model uses ls / glob / grep / cat as needed
→ bounded external memory re-enters current context
→ model forms / updates current cognition
→ model judges whether any durable cognition should persist
→ maintain core / archival / existing cognition when warranted; otherwise no mutation
→ next user message restores the resulting persistent cognition again
```

### 1.1 本 BDD 关注

- 每轮 persistent cognition 何时应已进入 context；
- scope / residency / archival 的可观察语义；
- bounded passive cues / active discovery / familiar exact read；
- public memory namespace 与熟悉的 ls/glob/grep/cat 语义；
- mutation / identity / correction / learning 的行为边界；
- 新形成或被实质更新 cognition 的 persistence judgment opportunity；
- bounded context 下 discoverability 与 retrieval truth 的关系。

### 1.2 本阶段不冻结的 How

内部 state schema、persistent ID 表示、ranking 公式、数值系数、page size、FSRS 公式、Git repo 物理边界与 commit 粒度、hook/plugin/MCP wiring、filesystem containment/locking/transaction 均留给后续 Design / Calibration，除非某项已成为明确 public contract。

---

## 2. 设计问题

### BR3-P1：有限 context 中怎样恢复值得占据注意力的 cognition？
需要 bounded resident context + bounded proactive cues，并允许模型按任务主动检索，而不是把整个 memory corpus 常驻 context。

### BR3-P2：memory discoverability 怎样随使用历史演化而不污染 retrieval truth？
memory strength 可以影响有限结果竞争，但不得让存在的 memory 消失、让真实 grep match 变成 false，或阻断 exact-path read。

### BR3-P3：怎样保护语义边界而不把 runtime protection 变成交互负担？
机制负责可机械保证的 namespace/object-kind/bounded-output；模型负责 scope、importance、correction attribution 等语义判断。正常 memory maintenance 不应因长期 scope 而逐次要求用户审批。

### BR3-P4：怎样区分 discovery、retrieval 与 validated adoption？
看到 gist、真正读取全文、实际使用并被结果支持是不同认知事件。

### BR3-P5：怎样让新 cognition 在遗忘前有机会持久化，而不把 write 变成机械流程？
主模型负责判断新事实、新判断、新承诺或既有 cognition 的实质变化是否值得跨未来持续；系统提供清楚、低摩擦的 persistence/maintenance affordance，但不把每轮结束、每次 tool result 或经过某个节点本身解释成必须产生 memory mutation。

---

## 3. Turn-level cognition anchor

## REQ3-ANCHOR-001 每个新 turn 的实质处理前，适用的 persistent cognition 应已恢复到当前 context

系统应使适用的 global/project/session core 与 bounded L0 archival cues 在模型进行实质推理前可用。integration mechanism 可随 host 不同，但行为目标相同。

### Scenario ANCHOR3-001-A：没有可靠 hook 的 host 通过 tool description 引导 read-before-think

**Given** host 无法在模型推理前自动注入 memory  
**When** MCP 暴露 `brain_think`  
**Then** tool guidance 明确要求收到新用户消息后立即调用  
**And** 这是 best-effort model guidance，不是假装 protocol guarantee  

### Scenario ANCHOR3-001-B：支持 hook 的 host 自动恢复 cognition

**Given** host 可在 substantive reasoning 前运行 hook  
**When** 新用户消息到达  
**Then** integration 自动完成等价 restore/injection  
**And** 模型不需要再显式调用 `brain_think`  


## REQ3-ANCHOR-003 anchor 不需要预先知道未来的 discovery query

L0 是 bounded passive cue，不要求系统预测后续 grep 什么；模型根据当前 task/context 自己形成 retrieval intent。

### Scenario ANCHOR3-003-A：任务产生新的 retrieval intent

**Given** anchor 只暴露 core 与少量 L0 cues  
**When** 推理中出现知识缺口或具体 path/content cue  
**Then** 模型可主动生成 ls/glob/grep/cat 调用继续检索  

## REQ3-ANCHOR-004 cognition restore 是 anchor 的主要结果；辅助 learning/history 失败只缩小本轮学习效果

当适用的 current persistent cognition 本身可被正确恢复时，cycle、retrievability/exposure 等附加 learning state 或 Git history 暂时无法更新，不应让模型失去本来可用的 cognition。系统可以丢失本轮对应的辅助 learning/history event，并提供可诊断信息。相反，模型将直接依赖和维护的 primary cognition workspace 必须真实成立：required core 无法正确读取，或可靠 fresh current session 的真实空 `core.md` 无法建立时，anchor 应失败而不是伪造一个可维护的 core。

### Scenario ANCHOR3-004-A：辅助状态更新失败不吞掉可恢复的 persistent cognition

**Given** applicable core 与可用 archival cognition 都能正确读取\
**And** 本轮 cycle / exposure / history 中一个或多个辅助更新无法持久化\
**When** anchor 建立\
**Then** 仍返回根据当前真实 cognition 可正确形成的 restored context\
**And** 允许本轮受影响的 learning/history event 不被记录\
**And** 不把辅助状态失败解释成 cognition 不存在或失效\

### Scenario ANCHOR3-004-B：fresh current session 不返回假的 core affordance

**Given** host 提供可靠的 current session identity\
**And** 该 session 尚未 materialize\
**When** 首次 anchor 无法建立真实空 `@session/<sid>/core.md`\
**Then** 本次 anchor 失败\
**And** 不向模型呈现一个实际无法直接维护的 session core\

### Scenario ANCHOR3-004-C：required core 无法正确解释时不伪装成功

**Given** 一个当前 applicable core 存在但无法按 core contract 正确读取/解释\
**When** anchor 建立\
**Then** 本次 anchor 失败并给出可诊断错误\
**And** 不把该 core 偷偷解释成空 cognition\

### Scenario ANCHOR3-004-D：单条坏 archival cognition 只影响自身 passive recall

**Given** applicable archival corpus 中只有某一条 Markdown 无法按 archival contract 正确解释\
**And** 其他 applicable core / archival cognition 正常\
**When** broad anchor 建立\
**Then** 该异常 item 不作为正常 L0 candidate 使用\
**And** 其他有效 cognition 仍可正常恢复\
**And** 系统保留足以定位该 logical item 的可诊断 warning\


---

## 4. Scope、Core 与 Archival

## REQ3-SCOPE-001 global / project / session 表示未来适用范围

scope 表示 cognition 将来在哪些上下文中自然适用，不是 importance、频率、寿命或成熟度。主模型按 meaning 直接选择 natural scope；机制只验证所选 public path/scope。不存在强制 session→project→global promotion ladder。

### Scenario SCOPE3-001-A：天然跨项目的 cognition 可以直接写 global

**Given** 用户明确表达对未来不同项目都适用的稳定约束  
**When** 模型保存 cognition  
**Then** 可直接选择 global scope  
**And** 不要求先写 session 再晋升  

### Scenario SCOPE3-001-B：session cognition 不自动外溢

**Given** cognition 只适用于当前 session 的目标/承诺/临时状态  
**When** 同一 project 开启另一 session  
**Then** 不因 project 相同自动成为新 session cognition  

## REQ3-RESIDENCY-001 core 与 archival 表示不同的 context residency 保证

scope 与 residency 正交。core 在 scope applicable 时保证 resident；archival 持久存在但不保证每轮进入 context，需要经 L0/discovery/exact read 回到 context。

### Scenario RESIDENCY3-001-A：core 无需 discovery 即进入 context

**Given** project scope 适用于当前 turn  
**When** anchor 建立  
**Then** project core 在 bounded contract 内直接进入 context  

### Scenario RESIDENCY3-001-B：archival 不整体常驻

**Given** archival 中有大量 items  
**When** anchor 建立  
**Then** 不展开整个 corpus  
**And** 只允许 bounded L0 或后续按需 discovery/read  

## REQ3-SESSION-001 session scope 同时支持 core 与 archival

长会话 transcript 会受 compaction、attention dilution、context rot，因此 session 也需要 resident core 与 on-demand archival。

### Scenario SESSION3-001-A：当前目标可放 session core

**Given** 当前会话有需每轮持续可见的目标/进度/承诺  
**When** 模型维护 session cognition  
**Then** 可以写入 session core  

### Scenario SESSION3-001-B：早期细节可进 session archival

**Given** 较早信息以后可能有用但不值得每轮常驻  
**When** 模型保存  
**Then** 可作为 session archival 持久并按需检索  

## REQ3-CORE-001 每个 scope 对模型表现为一个有界 logical core document

每个 valid scope 始终有且只有一个 `core.md`，它是普通 Markdown document，可以为空；scope 初始化时保证该文件存在。适用 scope 的 core 在每次 `brain_think` / hook-equivalent anchor 中完整恢复，因此模型直接从当前 resident context 使用它，并通过 `brain_edit` 维护，不需要 `brain_cat` 重新读取，也不使用 `brain_write` 创建 core。core 不变成 ranked multi-doc discovery。单个 core 有界，L0 cues 也有界，因此 turn-level anchor 的额外 cognition context 保持有界；具体阈值留 Design/Calibration。超容量 mutation 在形成无效状态前失败并给 curation guidance，机制不自动猜哪段 demote 到 archival。

### Scenario CORE3-001-A：多个适用 scope 的 core 可同时 anchor

**Given** global/project/session 都是当前 valid/applicable scope，其中一个或多个 core 尚为空、其余已有内容  
**When** anchor 建立  
**Then** 三个 `core.md` 都存在；非空内容进入 context，空 core 正常表现为空 Markdown，不伪造内容  
**And** 模型能区分其 scope owner，并直接通过 `brain_edit` 维护 core，无需 `brain_write` 创建文件  
**And** core 与 L0 都按各自 bounded contract 呈现；不为增加 L0 而 silent truncate core  

### Scenario CORE3-001-B：core mutation 超容量

**Given** core 已接近 bounded capacity  
**When** mutation 会使 resulting core 超限  
**Then** 新状态形成前失败  
**And** 提示模型整理/压缩  
**And** 机制不自动选内容写 archival  

## REQ3-AUTHORITY-001 持久化与 core residency 不自动改变 epistemic authority

memory 是当前保存并可恢复的 cognition，不是“较旧”或“较低权重”的同义词。保存、重复恢复、进入 core 或被自动注入，都不能单独证明其中 claim 更新、更旧、更可靠或更不可靠。模型使用 restored cognition 时应保留其 meaning、certainty、commitment、scope，以及它所描述状态的时间；proposal/hypothesis/uncertain claim 不因 persistence 变成 confirmed fact，assistant recommendation 不因 persistence 变成 user decision。当前理解由 latest user input、applicable restored cognition 与 relevant current evidence 共同形成；每条 evidence 只更新它能够实质证明或反驳的 claim。

### Scenario AUTH3-001-A：当前用户指令可以覆盖冲突历史 cognition

**Given** persistent memory 与当前明确用户指令冲突  
**When** 模型处理当前 turn  
**Then** 不因 memory 更早或位于 core 就提升权威  
**And** 按当前证据/用户意图纠正或更新  

### Scenario AUTH3-001-B：persisted hypothesis 不因重复恢复变 confirmed fact

**Given** memory 语义是 proposal/hypothesis  
**When** 多次 anchor/read  
**Then** 仍按 proposal/hypothesis 解释，直到新确认  

### Scenario AUTH3-001-C：assistant recommendation 不因被记住变成用户决定

**Given** earlier assistant 只提出了一个 recommendation / next-step proposal  
**And** 该内容后来被持久化并再次恢复  
**When** 当前 turn 使用这段 restored cognition  
**Then** 它仍保持 recommendation / proposal 的 commitment level  
**And** 不因进入 core、candidate 或自动注入位置而被解释成 user-confirmed decision  


---

## 5. Archival passive cue、active discovery 与 exact read

## REQ3-DISCLOSURE-001 passive cue、active discovery、exact read 是不同访问事件，不是强制 pipeline

L0 是 system-proactive passive gist；`brain_ls` / `brain_glob` / `brain_grep` 是 model-initiated active discovery；`brain_cat` 是对 concrete archival logical document 的普通 exact read。三者只是不同访问事件，不构成额外的 memory-level 协议或强制流水线：知道 exact archival path 可直接 cat，知道具体 memories directory 可直接 ls，记得 path/name shape 可直接 glob，记得 content clue 可直接 grep；Glob 与 Grep 是并列 recall strategy。适用 core 已完整 resident，不需要通过这些 read/discovery primitives 重新发现或读取。

### Scenario DISCLOSURE3-001-A：L0 candidate 可直接 exact read

**Given** L0 已给出明确 path+summary  
**When** 模型需要完整 cognition  
**Then** 可直接 `brain_cat(path)`  
**And** 不要求先做其他 discovery  

### Scenario DISCLOSURE3-001-B：已知 exact path 时直接 read

**Given** context 已有准确 archival public path
**When** 模型需要该 archival cognition
**Then** 可以直接 exact read  

## REQ3-DISCLOSURE-002 L0 只暴露少量 gist，不展开 archival 正文

L0 candidate 只需暴露 public path/name、current summary 与必要 current status，不再重复 scope/role；future applicability 与 cognitive role 已由 public path 单一表达。L0 不自动展开 body。active discovery 也可返回相似 gist；差异在 passive push vs model-initiated search，而不是额外的读取层级。

### Scenario DISCLOSURE3-002-A：L0 gist 足够判断是否深读

**Given** archival memory 被选入 L0  
**When** anchor 返回 candidate  
**Then** 模型获得足够 gist 判断相关性  
**And** 不自动获得整个 body  

## REQ3-DISCLOSURE-003 active discovery 应提供 memory gist；grep 还必须保留真实 match evidence

ls/glob 的 memory leaf 返回 path/name+summary；directory node 不伪造 summary。grep 的 summary 不能替代真实 lexical/regex evidence，必须保留 matching line/context；matching line number 使用与 `brain_cat` 相同的 1-based logical-document line coordinate，使 grep hit 可直接用于后续 exact read。

### Scenario DISCLOSURE3-003-A：ls/glob 返回 path + summary

**Given** 结果包含 archival leaf  
**When** 返回 active discovery result  
**Then** 包含 public path/name 与 current summary  
**And** directory node 不强加 memory summary  

### Scenario DISCLOSURE3-003-B：grep 同时返回 gist 与 evidence

**Given** grep 命中 archival document  
**When** 返回结果  
**Then** 包含 path/name+summary  
**And** 保留匹配行及请求的 context  
**And** matching line number 与 `brain_cat` 使用同一 1-based logical-document line coordinate  

## REQ3-READ-001 `brain_cat` 对 archival memory 使用统一 logical-document 读取语义

一个 archival memory 对模型是一个真实 Markdown logical document。cat 不再用隐藏的“先 summary、特殊 offset 才 body”协议；continuation 使用单一稳定坐标系。

### Scenario READ3-001-A：同一 memory 只有一个稳定文档坐标系

**Given** archival memory 可 exact read  
**When** 从不同 offset 继续读  
**Then** offset 始终相对同一 logical document  
**And** 不因首次/continuation 改变坐标语义  

## REQ3-READ-002 能在单次 read budget 内容纳的 memory 可以一次完整返回

bounded context 保护不能制造读取仪式。`brain_cat` 按普通 read 语义工作；小 memory 可单次完整返回。

### Scenario READ3-002-A：小 memory 单次完整读取

**Given** 完整 logical document 可放入单次 budget  
**When** `brain_cat` 读取  
**Then** 可以一次返回完整文档  

## REQ3-READ-003 长 memory 可以正常分页，且 continuation 稳定

长 exact document 应明确仍有后续并提供稳定 continuation；文档未变时不得静默跳过或重复稳定内容。bounded transport 不能通过“只返回一部分内容，却让后续 continuation 永久越过未返回部分”的方式满足预算。page size / safety bound 与具体 continuation representation 留 Design/Calibration；如果当前 `brain_cat` 无法无损表示下一部分内容，应明确这一事实，并给出能够继续无损访问该 logical document 的可执行下一步。

### Scenario READ3-003-A：长 memory 明确存在后续

**Given** memory 超过单次 read budget  
**When** 第一页返回  
**Then** 明确还有后续并提供 continuation  

### Scenario READ3-003-B：未修改 document 时不跳失不重复

**Given** 多页读取期间 document 未变  
**When** 依次读取后续页  
**Then** stable content 不无故跳过或重复  

### Scenario READ3-003-C：超长单行不能被截断后伪装成已完整读取

**Given** 下一条完整 logical line 本身超过当前安全输出边界\
**When** `brain_cat` 无法无损返回该行\
**Then** 不把该行的截断 excerpt 计为完整 exact read\
**And** continuation 不跳过该行剩余内容\
**And** 未实际完整返回该行时不因此记录一次完整 exact-retrieval learning event\
**And** 提供能够继续无损访问该 logical document 的可执行下一步，具体 mechanism 留 Public Contract / Design\


---

## 6. Archival Semantic Contract

## REQ3-MEMORY-001 每个 active archival memory 都有非空、当前一致的 summary gist

summary 是 L0 passive cue 与 active discovery 用来判断是否值得进一步读取的稳定 gist，由主模型在写/改 cognition 时维护。物理存储位置属于 Design。mutation 后 discovery 不得长期展示与 current cognition 冲突的旧 summary。

### Scenario MEMORY3-001-A：passive cue / active discovery 使用 current summary

**Given** archival memory active  
**When** 经 L0 passive cue 或 active discovery 呈现  
**Then** 使用与 current cognition 一致的非空 summary  

### Scenario MEMORY3-001-B：正文变化后旧 gist 不继续成为真相

**Given** memory content 被合法 edit  
**When** 新 cognition 已生效  
**Then** 后续 discovery 不长期返回冲突旧 summary  

## REQ3-MEMORY-002 cognitive role 由 public memory namespace / path 表达，并描述 recalled cognition 应怎样参与 reasoning/action

cognitive role 的 canonical owner 是 public path namespace，不要求 document metadata 再重复一份 `type`。四个 role 表达的是 cognition 已经形成的语义功能，而不是通过写入某个目录给内容提权：

- `decision`：an established choice that future work should continue from while its basis remains valid；它证明已选择的方向或约束，不证明实现或完成已经发生；
- `knowledge`：a fact, rule, constraint, or established understanding to reason with when its conditions apply；保留原有 certainty，不超出其 scope/conditions 泛化；
- `intention`：an active goal or commitment whose remaining work should continue until fulfilled, cancelled, or replaced；它证明仍然 intended 的工作，不证明工作已执行或完成；
- `skill`：a reusable method to apply when similar task conditions recur；它指导怎样行动，历史示例或结果不证明当前任务事实。

role 与 scope 正交：scope/root 回答 future applicability，`memories/<role>/` 回答 recalled cognition 怎样参与 reasoning/action；不得把某个 role 机械绑定到某个 scope。保存/移动到某个 role path 只编码主模型已经判断出的 current meaning，不把 proposal/hypothesis 自动升级为 established decision/knowledge。

### Scenario MEMORY3-002-A：path 编码 cognitive role，但不制造该 role 的 epistemic authority

**Given** 一条 cognition 已经是 established choice，另一条仍只是 proposal  
**When** 模型判断 archival cognitive role  
**Then** established choice 可以由 `memories/decision/` 表达  
**And** proposal 不因被放到 `decision/` 就获得 established/user-confirmed authority  

### Scenario MEMORY3-002-B：重新分类通过 public destination 表达

**Given** 新语义证据使同一 cognition 的 current cognitive role 应变化  
**When** `brain_mv` 到另一 role namespace  
**Then** resulting path 明确表达新 role  
**And** path change 表达已经完成的 semantic reclassification，而不是机制自行生成 semantic evidence  


## REQ3-MEMORY-003 importance 表示 cognition 适用时的遗漏代价

importance 回答：真正适用时若没有被召回，预期后果多大。它不是 recency、frequency、retrievability、scope、confidence 或当前 query relevance。数值表示留 Design。

### Scenario MEMORY3-003-A：罕用但高后果 memory 可以高 importance

**Given** memory 很少用但适用时遗漏后果重大  
**When** 模型判断 importance  
**Then** 可给高 importance  
**And** 不因低 frequency 自动降低  

### Scenario MEMORY3-003-B：importance 不等于 query relevance

**Given** memory omission cost 高但当前 query 不相关  
**When** 检索不匹配它  
**Then** high importance 不把 non-match 变 match  

## REQ3-MEMORY-004 memory 必须保留未来正确解释所需的 epistemic context

如果 cognition 是用户决定、事实、proposal、hypothesis、uncertain claim 或带关键 rationale/source，持久内容应保留未来正确解释所需角色。BDD 不要求统一 `note` 字段。

### Scenario MEMORY3-004-A：proposal 持久后仍是 proposal

**Given** 保存尚未确认 proposal  
**When** 后续 session 读取  
**Then** 仍足以识别为 proposal，不是 confirmed decision  

### Scenario MEMORY3-004-B：明确用户决定保留必要来源语义

**Given** cognition 权威来自用户明确决定  
**When** 保存  
**Then** 未来读取保留足够 source/epistemic context  

## REQ3-MEMORY-005 archival body 可以为空，不为 schema 仪式重复 summary

若短 cognition 已由 summary 完整表达，body 可为空；不要求复制相同文本。body 仅在需要 fuller detail 时承载正文。

### Scenario MEMORY3-005-A：summary 已完整表达短 cognition

**Given** summary 已无损表达未来含义  
**When** 写 archival memory  
**Then** body 可以为空  
**And** 不要求重复正文  


---

## 7. Mutation Public Semantics

## REQ3-WRITE-001 `brain_write` 表示 archival create / full overwrite

不存在则创建；已存在则完整替换该地址上的 cognition。resulting memory 必须满足 archival semantic contract。

### Scenario WRITE3-001-A：不存在 path 被创建

**Given** 合法 archival item path 不存在  
**When** `brain_write` 写入完整 cognition  
**Then** 创建新的 active archival memory  

### Scenario WRITE3-001-B：已存在 path 被完整覆盖

**Given** path 已存在  
**When** 同 path full write 另一 cognition  
**Then** previous cognition 被 replacement cognition 取代  

### Scenario WRITE3-001-C：resulting memory 满足 semantic contract

**Given** write 成功  
**When** resulting memory 可见  
**Then** 具有合法 path/role、current summary、importance 语义与必要 epistemic context  

## REQ3-EDIT-001 `brain_edit` 表示 existing cognition 的演化

edit 用于同一 cognition 的修正、补充、精炼或重写，不创建新 identity。exact-edits 模式包含一条或多条针对同一 original document 的 replacement；空 `edits` 不表达一次有意义的 edit。需要整篇保持 identity 的重写时使用完整 `content`。

### Scenario EDIT3-001-A：局部 edit 保持 same cognition

**Given** archival memory 已存在  
**When** 修改内容但意图仍是维护同一 cognition  
**Then** resulting item 是同 identity 的新 revision  

### Scenario EDIT3-001-B：resulting cognition 与 summary 一致

**Given** edit 改变 meaning/detail  
**When** edit 成功  
**Then** resulting content 与 discovery gist 不冲突  

## REQ3-IDENTITY-001 操作本身表达 cognition continuity，不由机制猜文本相似度

edit=same cognition evolves；mv=same cognition changes address/scope/role；write create=new cognition；write overwrite=replacement cognition at same address；rm=current cognition exits active memory。edit/mv 保留适当 continuity；overwrite 不继承旧 cognition learning history。

### Scenario IDENTITY3-001-A：edit 保持 learning continuity

**Given** memory 有与 current identity 相关的 learning evidence  
**When** edit 演化同一 cognition  
**Then** 适当 continuity 随 identity 保留  

### Scenario IDENTITY3-001-B：mv 保持 learning continuity

**Given** 同一 cognition 被重新分类/调整 scope  
**When** `brain_mv` 改 public address  
**Then** continuity 随 cognition 移动  

### Scenario IDENTITY3-001-C：write overwrite 不继承旧 learning history

**Given** same path 原为 cognition A  
**When** full overwrite 为 replacement B  
**Then** B 不自动继承 A 的 retrievability/reinforcement/usage history  
**And** 机制不需用文本相似度猜是否同 identity  

## REQ3-MV-001 `brain_mv` 只移动明确 archival item，不把 core↔archival 伪装成 mv

mv 表示 same archival cognition 的 address change，可改变 scope/role/relative path。source/destination 都是调用方明确给出的 concrete archival path；destination 已有另一条 active cognition 时，采用熟悉的 file-style replacement semantics：source cognition 成为 destination 的 current cognition，被替换的 destination cognition 退出该 active address，并在结果中明确报告 replacement。这个语义是本次显式 move 自身的效果，不以 Git history 是否可用为成立前提。core 是聚合 resident document，通过 semantic edit 维护。

### Scenario MV3-001-A：archival item 可改变 scope/role

**Given** item 当前在 session knowledge  
**When** 模型 mv 到 project decision  
**Then** resulting path 表达新 scope/role  
**And** continuity 保留  

### Scenario MV3-001-B：destination 已有 cognition 时由显式 mv 替换

**Given** source 与 destination 都是 concrete archival path\
**And** destination 已有另一条 active cognition\
**When** 执行 mv  
**Then** source cognition 连同其应保留的 continuity 成为 destination 的 current cognition\
**And** 原 destination cognition 不再作为该 active address 的 current cognition\
**And** 成功结果明确表达 destination 被替换\
**And** 不要求额外 approval / confirmed retry，也不依赖 Git 成功才使 replacement 成立\

### Scenario MV3-001-C：core 不是 `brain_mv` source/destination

**Given** source 或 destination 是 core  
**When** 尝试 core↔archival mv  
**Then** 不按 archival mv 成功  
**And** guidance 指向 read/write/edit semantic flow  

## REQ3-RM-001 `brain_rm` 使 archival cognition 退出 active memory

rm 的 BDD 含义是使当前 archival cognition 退出正常 active anchor/discovery/read flow。brain 不维护额外 tombstone/recycle/deletion-history store；若 Git history 可用且已有旧 checkpoint，它可以额外提供历史追溯/恢复，但这不是 rm 成功的前提。core 不通过 rm 删除。

### Scenario RM3-001-A：rm 后退出 active discovery

**Given** archival memory active  
**When** `brain_rm` 成功  
**Then** 不再出现在 think/ls/glob/grep/normal cat active flow  

### Scenario RM3-001-B：core 不接受 rm

**Given** target 是 scope core  
**When** 调用 `brain_rm`  
**Then** 不把 core 当 archival 删除  
**And** core 通过 edit 维护  


---

## 8. Feedback、Correction 与 Epistemic Status

## REQ3-FEEDBACK-001 memory access、successful use 与 learning evidence 是不同事件

L0 passive exposure、active discovery、`brain_cat` exact read 都不等于 successful adoption。只有主模型判断 cognition 实际参与成功 decision/action 且 outcome 支持其继续有效时，才构成 positive use evidence。

### Scenario FEEDBACK3-001-A：只看到 memory 不等于 successful use

**Given** memory 经 passive cue、active discovery 或 exact read 进入过 context  
**When** 模型最终没有依赖它完成 decision/action  
**Then** 不自动计为 validated successful use  

### Scenario FEEDBACK3-001-B：实际使用且结果支持才形成 positive evidence

**Given** 模型明确依赖 memory 做 decision/action  
**When** outcome 支持 cognition 继续有效  
**Then** 可以记录 positive learning evidence  

## REQ3-FEEDBACK-002 use / correction / failure evidence 不机械修改 importance

successful use、correction、failure 都不能固定方向自动修改 importance；只有模型判断 omission cost 本身变化时才调整。

### Scenario FEEDBACK3-002-A：successful use 不自动增加 importance

**Given** memory 易恢复且遗漏后果低，但经常成功使用  
**When** 又一次 successful use  
**Then** 可强化 learning state  
**But** 不机械提高 importance  

### Scenario FEEDBACK3-002-B：correction 不自动降低 importance

**Given** 高后果 cognition 的旧版本被纠正  
**When** 得到正确新版本  
**Then** 可改变 current cognition/learning evidence  
**But** 不因曾经错误自动降低 importance  

## REQ3-CORRECTION-001 correction 纠正 current cognition，不永久把 identity 标成 questioned

正确 cognition 已明确时可 edit 成正常 active；只有 resulting current cognition 仍有 unresolved epistemic uncertainty 时才 questioned。历史上被 correction 不等于当前永久 questioned。

### Scenario CORRECTION3-001-A：明确纠正后得到正常 current cognition

**Given** memory 写 MySQL，用户明确纠正为 PostgreSQL  
**When** 模型 edit 为正确 cognition  
**Then** resulting cognition 可正常 active  
**And** 不因旧 revision 错误永久 questioned  

### Scenario CORRECTION3-001-B：无法完整解决时保持 questioned

**Given** evidence 只证明 memory 可能有问题但无法可靠得到正确版本  
**When** 模型保留等待验证  
**Then** current cognition 可以 questioned  

## REQ3-ATTRIBUTION-001 action failure 是否构成 memory 负证据由主模型判断

行动失败不自动等于所用 memory 错误。主模型按 causal evidence 判断 failure 是否真正反驳 cognition。

### Scenario ATTRIBUTION3-001-A：外部故障不归咎于 memory

**Given** 模型正确依据部署前 migration 检查完成检查  
**When** 部署因 CI provider outage 失败  
**Then** failure 不自动成为该 memory negative evidence  

### Scenario ATTRIBUTION3-001-B：memory 内容确实导致失败时可形成负证据

**Given** evidence 明确错误 cognition 直接导致失败  
**When** 模型完成 causal attribution  
**Then** 可纠正/question/remove cognition  

## REQ3-QUESTIONED-001 questioned 表示 current epistemic uncertainty，不改变 retrieval truth

questioned affects proactive trust, not retrieval truth。questioned 不是裸 status bit：只要 current cognition 仍处于 unresolved epistemic uncertainty，就必须保留足以让未来模型理解“当前在质疑什么、还需要解决什么”的 current challenge；该 challenge 随 questioned state 在需要深入判断的 disclosure 中可恢复。具体内部字段与 presentation 形式留 Design / Public Contract。

### Scenario QUESTIONED3-001-A：L0 降低 questioned proactive priority

**Given** active/questioned memory 其他条件等价  
**When** 竞争 bounded L0  
**Then** questioned 可获得更低 push priority  
**And** 若返回 status visible  

### Scenario QUESTIONED3-001-B：active discovery 不因 questioned 过滤真实 match

**Given** grep 真实命中 questioned memory  
**When** 主动搜索  
**Then** 真实 match 不消失  
**And** result 显示 questioned status  

### Scenario QUESTIONED3-001-C：exact read 正常读取

**Given** exact path 指向 questioned memory  
**When** `brain_cat` 读取  
**Then** 正常返回 logical document  
**And** questioned status 可见  
**And** 模型能恢复当前 unresolved challenge，知道为什么仍不能按普通 active cognition 依赖  

### Scenario QUESTIONED3-001-D：questioned 不能只剩无解释的状态位

**Given** 新 evidence 只证明 current cognition 可能有实质问题，但正确答案尚未得到  
**When** 模型将它保留为 questioned  
**Then** 持久状态同时保留当前 unresolved challenge 的简洁语义  
**And** 后续 turn/session 不需要依赖原 transcript 才能知道待验证问题  


---

## 9. Learning、Forgetting 与 Discoverability

## REQ3-LEARNING-001 forgetting 表示 discoverability 下降，不改变 memory truth

长期未真正取回的 active memory 可以更难赢得有限 attention，但仍存在、仍参与真实 match、仍可 exact read。forgetting ≠ delete ≠ match false。

### Scenario LEARNING3-001-A：低 retrievability 在 broad discovery 中更深

**Given** A 很久未真正取回，其他条件等价  
**When** broad bounded discovery 有大量候选  
**Then** A 可更难进入前部窗口  

### Scenario LEARNING3-001-B：具体 cue 仍能找回低 retrievability memory

**Given** memory retrievability 很低  
**When** exact path 或足够具体 query 使其成为真实少量结果  
**Then** 正常发现/读取  

## REQ3-TIME-001 memory evolution 随 cognition cycles 演化，墙上时间本身不构成遗忘

每次有效 turn-level anchor 是一个 cognitive opportunity；explicit think 与 hook anchor 行为等价。没有新的 cognition event 时，仅现实时间过去不自动改变 memory state。

### Scenario TIME3-001-A：explicit think 与 hook anchor 是同一种 cycle

**Given** host A explicit think，host B hook  
**When** 各处理一个新用户 turn  
**Then** 各形成一次等价 cognition cycle  

### Scenario TIME3-001-B：没有新 event 时 wall-clock 不单独衰减

**Given** 两周无新 anchor/retrieval/use event  
**When** 两周后重新打开  
**Then** 不只因时间经过自动额外 forgetting  

## REQ3-RETRIEVAL-001 exact read 刷新近期 retrievability；passive cue / active discovery 不等价于 retrieval refresh

exact read 表示 cognition 真正回到 document-level context，可提高近期再取回便利性；仅出现在 cue/list 中不代表完整取回。

### Scenario RETRIEVAL3-001-A：exact read 后近期更易取回

**Given** memory 长期未取回  
**When** `brain_cat` 实质读取  
**Then** 可刷新 short-term retrievability  
**But** 不自动等于 successful-use validation  

### Scenario RETRIEVAL3-001-B：broad active discovery 不批量复习结果

**Given** grep 返回大量 results  
**When** 模型只选少数 exact read  
**Then** 其余仅展示结果不自动获得 retrieval refresh  

## REQ3-REINFORCEMENT-001 validated successful use 可以形成比单纯读取更持久的 future accessibility

successful-use evidence 可使 future retrievability 更 durable；BDD 不要求内部一定有 `stability` 字段或固定公式。

### Scenario REINFORCEMENT3-001-A：反复成功使用的 cognition 衰退更慢

**Given** A 只被 read，B 多次参与成功 action  
**And** 之后经历相同未使用 cycles  
**When** 比较 future accessibility  
**Then** B 可保持更 durable retrievability  

## REQ3-EXPOSURE-001 重复无效 L0 passive exposure 产生 anti-monopoly pressure，不惩罚主动 discovery

exposure 只解决 system-proactive L0 slot 被同一 memory 长期霸占。反复 passive push 且无进一步 engagement 时，应逐渐给其他 eligible cognition 让位；reset 细节留 Design。

### Scenario EXPOSURE3-001-A：反复 L0 展示未使用时逐渐让位

**Given** A 连续多轮进入 L0 但无进一步 read/use  
**And** 还有其他 eligible memories  
**When** 继续竞争 L0 slots  
**Then** A 受到 anti-monopoly pressure  

### Scenario EXPOSURE3-001-B：旧 exposure 不惩罚明确 grep match

**Given** memory 曾多次 L0 展示未使用  
**When** 后来主动 grep 真实命中  
**Then** 旧 exposure debt 不隐藏/惩罚该 active-search match  

## REQ3-DISCOVERABILITY-003 retrievability 与 importance 对有限 context allocation 保持独立、单调保护

其他条件等价时，更高 R 或更高 importance 都不应反而更难发现；长期未取回不能单独消除 high importance 保护。BDD 不冻结组合公式。

### Scenario DISCOVERABILITY3-003-A：更高 retrievability 不反向降低 discoverability

**Given** A/B importance 等条件相同，A R 更高  
**When** 竞争 bounded window  
**Then** A 不因 R 更高而位置更差  

### Scenario DISCOVERABILITY3-003-B：更高 importance 不反向降低 discoverability

**Given** A/B R 等条件相同，A omission cost 更高  
**When** 竞争 bounded allocation  
**Then** A 不因 importance 更高而更难发现  

### Scenario DISCOVERABILITY3-003-C：长期未使用不能让 importance 完全失效

**Given** A/B 都长期未取回且 R 低  
**And** A importance 明显更高  
**When** 其他条件等价竞争  
**Then** A 仍保有 importance 保护作用  


---

## 10. Public Memory Namespace 与 Path

## REQ3-PATH-001 public path 是模型唯一 cognition address

模型不需要理解 internal state id、physical filesystem path 或第二套 locator。discovery path 必须可直接用于 exact read/mutation。

### Scenario PATH3-001-A：discovery path round-trip 到 exact read

**Given** glob/grep 返回 public path X  
**When** 模型 `brain_cat(X)`  
**Then** 读取同一 cognition  

### Scenario PATH3-001-B：internal identity 不成为第二 public address

**Given** 机制内部有 persistent ID/state key  
**When** memory 对模型呈现  
**Then** 模型仍以 public path 寻址  

## REQ3-PATH-002 applicability scope 由对称 public roots 表达

已从更早共享会话复核的 ontology：

```text
@global/
├── core.md
└── memories/...

@project/
├── core.md
└── memories/...

@session/<sid>/
├── core.md
└── memories/...
```

root 是 applicability owner；core 与 archival 位于同一 scope root。

### Scenario PATH3-002-A：同 scope 的 core/archival 共享 root

**Given** project scope  
**When** 寻址 project core 或 archival  
**Then** 都位于 `@project/`  
**And** 不再用独立 `@core/...` 表达 residency  

### Scenario PATH3-002-B：session root 带 opaque identifier

**Given** session root 为 `@session/<sid>/`  
**When** 解析 `<sid>`  
**Then** 只作为 session identity，不作自由 path fragment  

## REQ3-PATH-003 archival path 由 scope root + cognitive role + 可递归 item path 组成

`<scope-root>/memories/<role>/<relative-item-path>.md`。root 是 future-applicability owner，`memories/<role>/` 是 cognitive-role owner，二者按组合语义共同解释 concrete memory；不定义 3×4 的组合类型表。顶层 cognitive role 固定为 `decision / knowledge / intention / skill` 四类；relative path 可包含合法嵌套目录，后续目录只组织 item tree，不改变 role。只有新的真实 cognition category 需求经过 Requirement/Design 重新裁决时才扩展该顶层 ontology。model-facing namespace/glob guidance 应尽量使用与 public tools 一致的真实 path grammar，使 concrete path 能自然被泛化/收窄为 discovery pattern，而不是再引入第二套 scope/role selector 语言。

### Scenario PATH3-003-A：role namespace 是 cognitive-role owner

**Given** `@project/memories/decision/database/migration/rollback-policy.md`  
**When** 判断 cognitive role  
**Then** role 是 `decision`  

### Scenario PATH3-003-B：nested directory 不改变 role

**Given** `@global/memories/skill/coding/typescript/refactor.md`  
**When** item 位于多级目录  
**Then** role 仍是 `skill`  

## REQ3-PATH-004 public namespace 只暴露 cognition objects 与 archival public directories

`@global/`、`@project/`、`@session/<sid>/` 是 cognition public path 的 applicability 前缀，不单独成为 cognition object。可寻址 cognition 对象只有 concrete core、concrete archival `.md` memory，以及 `memories/`、role root、nested archival directory。`memories/` 的物理目录可以同时承载非 `.md` 附加资产，但这些资产不因此成为 cognition object；`brain_absolute_path` 只负责把合法 workspace location 映射到 filesystem。state/index/history/lock/temp 等 mechanism objects 不因存放邻近就成为可寻址 cognition。

### Scenario PATH3-004-A：猜 mechanism filename 不能通过 brain path 访问

**Given** 模型猜到 `state.json`/`index.json` 等 internal filename  
**When** 通过 public namespace 寻址  
**Then** 不作为 cognition object 暴露  

## REQ3-PATH-005 archival directory、archival item 与 core 是不同 public object kinds

工具仅对合法 kind 生效；判断依据是 public ontology，而不是底层碰巧是 file/directory。

### Scenario PATH3-005-A：directory 可 ls 但不是 archival item

**Given** target 是 `.../memories/skill/`  
**When** `brain_ls`  
**Then** 合法返回 direct children  
**But** `brain_rm` 不把整个 type directory 当单个 cognition 删除  

### Scenario PATH3-005-B：core 与 archival item 行为不同

**Given** target 是 `<scope-root>/core.md`  
**When** mutation 判断 object kind  
**Then** 按 core contract 处理  

## REQ3-PATH-006 所有 brain tools 对同一 public path 保持同一 cognition 语义

同一 public path 只能有一套 object identity / parser semantics；但不同 Tool 仍可按 object kind 拥有不同合法作用域。一个 Tool 返回的 archival path 交给后续合法 Tool 时，不需要 tool-specific rewriting，也不能变成另一条 cognition。

### Scenario PATH3-006-A：glob/grep/cat/edit path 语义一致

**Given** glob/grep 返回同一 archival path X
**When** cat/edit 使用 X
**Then** 操作同一 cognition
**And** 不需 tool-specific rewriting
**But** 这不要求 ls/glob/grep 接受 core、standalone scope prefix 或其他非 archival-discovery input

## REQ3-PATH-006A `brain_absolute_path` 提供宽松 workspace location 到真实路径的桥接

`brain_absolute_path` 用于让模型把 brain workspace 中的 cognition 或配套资产交给宿主已有 filesystem/code/data tools。它可以接受 scope root、core、memories directory、固定 role directory，以及 role 下任意后代位置；目标不要求已经存在。它只返回 absolute path，不读取或修改文件，也不把非 `.md` 资产提升成 cognition。scope-level hidden mechanism 路径与 traversal 仍不可访问。

### Scenario PATH3-006A-A：skill 附件可映射给普通文件工具

**Given** `@project/memories/skill/report/workflow.md` 旁边需要 `run.py` 与 `template.xlsx`\
**When** 模型对 `@project/memories/skill/report/run.py` 调用 `brain_absolute_path`\
**Then** 返回对应 scope 内的 absolute filesystem path\
**And** `run.py` 不进入 memory summary/status/strength/discovery semantics\

### Scenario PATH3-006A-B：不存在的附件位置也可映射

**Given** 合法 role subtree 中的目标资产尚未创建\
**When** `brain_absolute_path` 映射该 location\
**Then** 可返回其 deterministic absolute path\
**And** 工具本身不创建目标\

## REQ3-PATH-007 public path 与 identifier 不能逃逸 memory namespace

session ID 是 opaque identifier；nested item path 保持 scope/role containment。canonicalization/realpath/allowlist 属于 Design。

### Scenario PATH3-007-A：session id 不能 path traversal

**Given** session identifier 试图表达 `..`/separator 等 traversal  
**When** 建立 session mapping  
**Then** 不能逃逸 session namespace  

### Scenario PATH3-007-B：nested item path 保持 containment

**Given** 模型指定 nested archival path  
**When** 解析  
**Then** 仍位于所选 scope root/role namespace 内  

### Scenario PATH3-007-C：contained filesystem alias 按真实 target 工作，不另造一套文件语义

**Given** memories workspace 中某个 public location 经过 symlink/junction-style filesystem alias 指向仍位于同一 logical scope containment 内的合法 target\
**When** brain 读取或枚举该 location\
**Then** 可以按 resolved real target 的真实文件/目录语义继续工作\
**And** alias 本身不改变 cognition 的 public scope/role/path meaning\
**And** 系统可以记录“发生了 alias follow”的诊断 warning，而不把合法 alias 自动升级成 store corruption\

### Scenario PATH3-007-D：broken、不可访问或越界 alias 只影响真实受影响范围

**Given** symlink/junction-style alias broken、不可访问，或 resolved target 会越出 intended logical scope containment\
**When** broad discovery/anchor 枚举到它\
**Then** 不通过该 alias 暴露越界内容，也不伪造 cognition\
**And** 受影响 entry 可被 warning + skip，其他合法 cognition 继续工作\
**But** 当调用方 exact 指向该受影响 location 时，返回明确失败而不是假装不存在其他正常 cognition\


---

## 11. `brain_ls`：direct-child structural browse

## REQ3-LS-001 `brain_ls` 返回指定 archival memories directory 的 direct children

保持熟悉 list-directory 语义，不递归展开 subtree。`path` 只接受 `<scope-root>/memories/` 及其 role / nested directory；standalone scope prefix、core 与 concrete archival item 都不是 ls target。memory leaf 可附 summary gist；memory strength 不改变真实 directory membership。

### Scenario LS3-001-A：只返回 direct children

**Given** `<scope-root>/memories/.../` directory 有直接 child 与更深 descendant
**When** `brain_ls(directory)`  
**Then** 返回 direct children，不递归展开全部 descendants  

### Scenario LS3-001-B：namespace structure 不因 strength 改变

**Given** 真实 child memory R 很低  
**When** 结果量在 budget 内  
**Then** 仍作为真实 direct child 返回

## REQ3-LS-002 `brain_ls` 使用 mechanism-owned bounded output；超额时缩小 path，不提供 page 2

模型不设置 page size。超额必须显式说明并建议进入更具体 directory。

### Scenario LS3-002-A：超额时显式 truncated/refine

**Given** direct children 超 budget  
**When** ls 返回  
**Then** 不 silent truncate  
**And** 明确还有更多并引导缩小 path  

### Scenario LS3-002-B：不通过 ls page 2 穷举

**Given** ls 超额  
**When** 模型继续导航  
**Then** 使用更具体 path/其他 primitive  
**And** public contract 不要求 ls continuation  


---

## 12. `brain_glob`：按 path pattern 发现 memory

## REQ3-GLOB-001 `brain_glob` 按熟悉 path pattern 发现 archival memory

glob 用于 archival filename/path lookup，与 grep content search 分工。candidate/result domain 只包含 `<scope-root>/memories/...` 下的 active archival memory paths，不包含 scope root、core 或 directory result。`path?` 若提供，只接受 memories root / role / nested directory；省略时联合搜索当前可访问 scopes 的 memories trees。match truth 由 pattern/path 决定；accessibility 不把真实 archival path match 变 false。

### Scenario GLOB3-001-A：recursive pattern 命中 nested archival paths

**Given** role namespace 下有多级 archival items
**When** glob pattern 覆盖这些 paths
**Then** 返回真实 matching archival paths

### Scenario GLOB3-001-B：真实 path match 不因 state 消失

**Given** archival item 满足 pattern 但 R 低或 questioned
**When** 结果量在 budget 内  
**Then** 仍返回真实 match  
**And** 必要 status 可见  
**And** 省略 optional path 时，当前可访问 scopes 的 active archival memory paths 都属于搜索范围

## REQ3-GLOB-002 `brain_glob` bounded output；超额 refine pattern/path，不公开分页

超额显式说明更多匹配；不暴露 model-controlled page size，也不要求 glob continuation。

### Scenario GLOB3-002-A：glob 超额时 refine pattern

**Given** broad glob 超 budget  
**When** 返回 bounded results  
**Then** 明确还有更多  
**And** 建议缩小 path/pattern  
**And** 无 glob page 2 contract  


---

## 13. `brain_grep`：内容搜索与 bounded discovery

## REQ3-GREP-001 `brain_grep` 支持熟悉的 literal / regex archival content 匹配

grep 只搜索 active archival Markdown content，可结合 memories-directory `path`、archival-path `glob`、case/literal/context 等过滤。core 已由适用 turn 的 `brain_think` 完整恢复，不进入 grep corpus。`path?` 若提供，只接受 memories root / role / nested directory；省略时联合搜索当前可访问 scopes 的 memories trees。summary 帮助判断，但真实 match evidence 必须来自 archival content。

### Scenario GREP3-001-A：literal grep 找到真实 content match

**Given** active archival document 存在 literal query
**When** literal mode 搜索  
**Then** 返回 path 与 matching evidence/context  

### Scenario GREP3-001-B：regex 按公开 contract 匹配

**Given** 合法 regex 且 archival content 满足
**When** grep  
**Then** 返回真实 matches  
**And** 不以 summary 伪造 content match  
**And** 省略 optional path 时，当前可访问 scopes 的 active archival documents 中真实 content match 都属于搜索范围

### Scenario GREP3-001-C：invalid regex 与有效 query 的 no-match 是不同结果

**Given** caller 选择 regex mode\
**And** pattern 不是合法 regex\
**When** `brain_grep` 执行\
**Then** 返回明确的 query/input error\
**And** 不把它伪装成“合法搜索但零 matches”\
**And** 若 caller 想按普通文本搜索这些字符，可选择 literal mode\

## REQ3-GREP-002 `brain_grep` 使用成熟 grep 的 bounded-result 语义，不建立分页状态

单次 grep 由成熟 Tool 自己拥有 match/output bound；超出单次结果边界时明确提示结果被截断，并引导 caller 缩小 `pattern/path/glob` 后重新搜索。brain 不为 grep 建立 `offset` / cursor / snapshot continuation 状态。

### Scenario GREP3-002-A：超额时明确提示截断并给可执行收窄动作

**Given** 真实 matches 超出单次 grep 的 bounded result
**When** `brain_grep` 返回
**Then** 明确说明结果被截断
**And** guidance 指向缩小 `pattern/path/glob` 后重新搜索

### Scenario GREP3-002-B：grep 不建立 public pagination state

**Given** 一次 grep 结果被截断
**When** caller 需要进一步定位
**Then** public contract 不提供 `offset` / cursor / `next_offset`
**And** caller 通过更具体或调整后的 `pattern/path/glob` 继续 discovery

### Scenario GREP3-002-C：仅展示 grep 结果不产生 learning transition

**Given** grep result 只作为 active discovery 展示
**When** 模型查看返回结果
**Then** 展示本身不刷新 R/L0 exposure 或其他 learning state


---

## 14. Mutation 不审批；Git 仅提供可用时的辅助版本历史

## REQ3-APPROVAL-001 合法 memory mutation 直接形成新 state，不因 project/global scope 强制审批重试

用户已明确删除旧 `none/protect`、`confirmed:true`、`pending-approval` 方向。正常 memory maintenance 不应每次打断用户。

### Scenario APPROVAL3-001-A：长期 scope mutation 不进入 pending approval

**Given** 合法 project/global write/edit/mv/rm/core update  
**When** brain 执行 mutation  
**Then** 不因 scope 是 project/global 返回 pending approval  
**And** 不要求以 `confirmed:true` 重试  

## REQ3-HISTORY-001 Git 可用时提供辅助版本历史；current cognition 与 Tool success 不依赖 Git

brain 不建立第二套 mutation/deletion history。current working Markdown / cognition state 是当前业务事实；Git 只在可用时提供额外的版本历史与恢复便利，不拥有 current cognition truth，也不是正常 Tool success 的前置条件。细粒度 state-changing operation 不要求各自 commit；turn-level `brain_think` / hook-equivalent anchor 是自然的 best-effort checkpoint opportunity。Git repository、staging、add 或 commit 暂时不可用时，可以造成 history 暂时落后，但不能反向撤销已经正确成立的 current cognition，也不能让本来可正确完成的 cognition read/restore/mutation 仅因此失败。BDD 不冻结 repository 物理边界、staging/index 细节、commit message 或内部 Git wiring。

### Scenario HISTORY3-001-A：current cognition mutation 不等待 Git 才成立

**Given** 一个合法 write/edit/mv/rm/core update 已完整形成其 current cognition 语义\
**When** Git history 暂时不可用、stage 失败或尚未形成下一 checkpoint\
**Then** 本次 current cognition 仍按已经成立的新状态工作\
**And** Tool success 不因“还没有 Git history”而被撤销\
**And** history 可以暂时落后于 current working state\

### Scenario HISTORY3-001-B：已有 checkpoint 在 Git 可用时提供额外恢复依据

**Given** 某个旧 cognition version 已经真实进入 Git checkpoint\
**When** 后续 cognition 被 edit / overwrite / mv / rm\
**Then** 该已存在的 committed version 仍可作为额外历史恢复依据\
**But** 当前 mutation 的正确性不以一定存在这个 checkpoint 为前提\

### Scenario HISTORY3-001-C：anchor 只提供一次自然 checkpoint opportunity

**Given** 从上一次 anchor 后发生了一个或多个 current persistent changes\
**When** 下一次 `brain_think` / hook-equivalent anchor 执行且 Git 可用\
**Then** 可以把当前可 checkpoint 的 brain workspace 作为本轮一次统一 history opportunity\
**And** 一个 anchor 至多尝试形成一次这种轮次 checkpoint\
**And** 不要求每个 `brain_cat` / write / edit / mv / rm 各自生成 commit\

### Scenario HISTORY3-001-D：Git history 不给模型增加 rationale 输入负担

**Given** brain 尝试形成辅助 history\
**When** stage/checkpoint 发生\
**Then** 不要求模型额外提供 Git reason / rationale / commit message\
**And** history 的技术性可读信息由 mechanism 使用已有事实生成\

### Scenario HISTORY3-001-E：history failure 是局部降级

**Given** current cognition 本身仍完整可读写\
**When** Git repository/add/commit 失败\
**Then** cognition Tool 继续依据 current working state 工作\
**And** 系统记录足够的 technical diagnostic\
**And** 不创建 pending-history / recovery-commit 等第二套业务状态机作为成功条件\

## REQ3-HISTORY-002 不维护与 Git 平行的 custom history / recycle 机制

`history.jsonl`、`change_history.jsonl`、`memories/history/` recycle、专用 tombstone/deletion-history store 不属于 v3 history/recoverability contract。机制内部仍可有满足当前运行正确性所需的 state/lock/temp 等实现状态，但不能把它们重新扩张成第二套版本历史。

### Scenario HISTORY3-002-A：正常 mutation 不追加 custom audit history

**Given** 合法 write/edit/mv/rm/core update 成功  
**When** brain 完成本次 current state change\
**Then** 不要求同步追加 `history.jsonl` 或 `change_history.jsonl`  
**And** 不要求维护隐藏 recycle copy 来承担版本恢复  

---

## 15. Consistency、Concurrency、Failure 与 Restart

## REQ3-CONSISTENCY-000 Markdown / core workspace 是 cognition truth；learning/history state 是可重建或可降级的附加状态

一条 archival cognition 是否存在及其正文/summary/importance 由合法 `.md` resource 决定；valid scope 的 resident cognition 由真实 `core.md` 表达。对应 companion 只保存 current challenge/accessibility 等附加状态并绑定当前 Markdown 内容版本；scope-cycle 只保存 learning coordinate，不决定 scope/core/cognition 是否存在；Git 只提供辅助 history。companion 或 scope-cycle 缺失、无法解析、版本/coordinate 不匹配时，可以从 fresh mechanism state 继续，而不是否定仍然合法的 Markdown/core cognition。孤立 companion 不反向产生 memory；某份辅助 state 无法按当前机制正确解释，只说明该辅助记录当前不可用，不自动升级成 cognition corruption。

### Scenario CONSISTENCY3-000-A：Markdown 存在但 companion 缺失仍可读取

**Given** 合法 archival Markdown 存在而 companion 不存在\
**When** memory 被 read/discovery/anchor 使用\
**Then** cognition 仍存在并使用 fresh challenge/accessibility state\
**And** 不因缺失 companion 报 persistence-pair corruption\

### Scenario CONSISTENCY3-000-B：旧 companion 不覆盖新 Markdown

**Given** Markdown 内容已变化而 companion 仍绑定旧内容\
**When** 读取 cognition\
**Then** 以当前 Markdown 为 truth\
**And** 旧 companion 状态不继续附着，改用 fresh state\

### Scenario CONSISTENCY3-000-C：scope-cycle 不可用不把 valid core 变成不存在

**Given** 一个 valid scope 的真实 `core.md` 与 cognition resources 正常\
**And** 该 scope 的 cycle state 缺失、malformed 或无法按当前 schema解释\
**When** read/discovery/anchor 需要该 scope\
**Then** valid cognition 仍按真实 workspace resource 存在和可用\
**And** learning coordinate 可以从 fresh baseline 重新开始\
**And** 不为了恢复旧 learning 数值而猜测或修补 cognition 内容\

## REQ3-CONSISTENCY-001 success boundary 跟随请求的业务语义，不由 incidental auxiliary side effect 扩张

public operation 返回 success 时，它向调用方承诺的主要业务结果及维持该 public semantics 所必需的关联状态必须已经真实成立，并可被后续操作立即观察。例如 write/edit/mv/rm/core maintenance 与显式 `brain_feedback` 不能只完成一半。相反，read/restore 或 cognition mutation 顺带触发的 retrievability、cycle、exposure、Git history 等 auxiliary side effect，如果失败后仍能保持主要 cognition/epistemic semantics 真实一致，可以局部降级而不反向取消主要结果。

### Scenario CONSISTENCY3-001-A：显式 state mutation success 后立即 read-your-writes

**Given** 一个合法 cognition mutation 或显式 feedback operation\
**When** tool 返回 success  
**Then** 紧接着通过相关 cat/ls/glob/grep/think 或后续 mutation 观察时看到它承诺的新业务状态\
**And** 不存在 success 后仍暂时只看到旧业务状态的延迟提交窗口\

### Scenario CONSISTENCY3-001-B：一个 semantic operation 不形成部分成功

**Given** 一次合法操作需要同时改变多个维持其 public semantics 所必需的关联状态\
**When** tool 返回 success  
**Then** 该 operation 承诺的必要状态已经完整形成\
**And** 不存在例如 mv source 已退出而 destination 尚未成立的部分成功  

### Scenario CONSISTENCY3-001-C：read 的 auxiliary learning refresh 失败不吞掉真实内容

**Given** `brain_cat` 已能正确读取并返回目标 archival logical document\
**And** 本次 exact-read 对 retrievability/accessibility 的辅助 refresh 无法持久化\
**When** read 完成\
**Then** 已正确读取的 document 仍可作为本次 `brain_cat` 结果返回\
**And** 允许本次 learning refresh 丢失并留下可诊断信息\
**And** 不为了回滚辅助状态而撤销已经真实完成的 read\
## REQ3-CONCURRENCY-001 并发成功结果必须等价于某个合法的顺序执行，不产生额外 silent lost update

并发不是要求自动 merge 所有效果；public operation 原本允许 overwrite/replace 时，后执行者仍可按顺序语义替换前状态。要求是：并发不能制造任何单线程合法调用顺序都解释不了的结果，也不能让一个已经 success 的独立更新因 stale read/write race 静默消失。实现可选择串行化或显式拒绝冲突，BDD 不冻结 lock/queue 算法。

### Scenario CONCURRENCY3-001-A：并发修改不同 item 不丢成功结果

**Given** 两个并发操作修改同一共享 scope 中的不同 items  
**When** 两个操作都返回 success  
**Then** 后续状态包含两个成功操作按某个合法顺序执行后的效果  
**And** 不因 stale shared state 覆盖而静默丢掉其中一个 item  

### Scenario CONCURRENCY3-001-B：同一 item 的竞争保持 sequential semantics

**Given** 两个并发操作竞争修改同一个 cognition  
**When** 系统处理这两个操作  
**Then** 若二者都 success，current state 必须能由某个合法顺序执行解释\
**And** 若无法安全形成这种结果，可以显式拒绝其中一个操作  
**And** 不允许二者都 success 却产生无法由任何顺序解释的 stale-write 结果  

### Scenario CONCURRENCY3-001-C：跨进程协调只覆盖实际共享的 global scope

**Given** 不同 project 的 MCP processes 共享同一个 global cognition scope  
**When** 它们并发修改 global state  
**Then** global 更新仍满足 sequential semantics / no silent lost update guarantee  
**And** project/session 在“一项目一个 MCP process”的支持拓扑下不额外要求 cross-process coordination  
## REQ3-FAILURE-001 可处理失败不形成一个伪装成正常成功的部分 mutation

请求在正常可处理边界内失败时，本次操作不应留下对外可见的成功半状态。若底层 store 已经无法恢复或验证为一个安全状态，则错误升级为明确的 store/invariant failure；系统宁可 fail loud，也不把未知部分状态继续当作正常 cognition 操作。

### Scenario FAILURE3-001-A：预条件/校验失败保持原状态

**Given** 请求因非法 path、document、conflict 或其他可预先判定条件不成立  
**When** tool 拒绝请求  
**Then** 本次 operation success boundary 内的 current cognition / required state 保持调用前状态\
**And** 不把失败请求伪装成已经成立的 semantic mutation\

### Scenario FAILURE3-001-B：执行中的可捕获失败不静默留下半状态

**Given** operation 已开始但在 success boundary 前发生可捕获 execution/store failure  
**When** tool 最终报告 failure  
**Then** 系统恢复并继续暴露调用前的一致状态，或明确进入 store/invariant failure  
**And** 若进入 store/invariant failure，后续 mutation 不把未知部分状态当正常状态继续写入  

## REQ3-RESTART-001 普通 restart 保留已成功 cognition；强制终止不承诺未完成 mutation

brain 的 persistent cognition 不因正常 process restart 改变语义或 identity。Markdown working files 是 current cognition truth；成功 operation 的 current Markdown 即使从未形成 Git checkpoint，也必须在正常 restart 后保持。附加 learning state 可以在缺失、损坏或与当前 Markdown 不匹配时按 fresh state 重新开始。SIGKILL、宿主崩溃、机器断电发生在 operation 尚未到达 success boundary 时，本次未完成 mutation 允许丢失；不要求 durable WAL/journal、自动 roll-forward 或重放未完成操作。若 Git 中真实存在 checkpoint，它只是额外历史恢复来源。

### Scenario RESTART3-001-A：success 后普通 restart 保持 continuity

**Given** cognition mutation 已成功写入 persistent state  
**When** brain 正常停止并重新启动  
**Then** 已成功的 current cognition 仍保持相同 public semantics  
**And** edit/mv 所要求的 identity / learning continuity 不因 restart 重置或串到另一条 cognition  

### Scenario RESTART3-001-B：强制终止期间的未完成 mutation 可以丢失

**Given** 一个 state-changing operation 尚未到达 success boundary  
**When** process 被强制终止  
**Then** brain 不承诺保留、重放或自动完成本次 mutation  
**And** restart 后作为正常 active cognition 暴露的 semantic state 必须对应某个已完成的 persistent state；已成功但从未 checkpoint 的 current cognition 也不能仅因正常 restart 丢失\
**And** 不把 companion 残留或失配升级成 cognition corruption；Markdown 仍按当前真实资源解释，已有 Git checkpoint 仅在实际存在时提供额外历史恢复依据\

---

## 16. Lifecycle 不由 promotion / demotion signals 驱动

## REQ3-LIFECYCLE-001 scope、residency 与 epistemic lifecycle 由 cognition meaning / current cognitive need 决定

scope 表示未来适用范围，core/archival 表示 context residency，questioned/rm 表示当前 epistemic/lifecycle decision。successful-use frequency、retrievability decay、长期未使用本身都不是这些语义变化的充分证据。模型可以基于新语义证据主动 write/edit/mv/rm/core-maintenance，但机制不把 usage/decay 自动翻译成 promotion/demotion lifecycle 建议。

### Scenario LIFECYCLE3-001-A：高频 session cognition 不自动建议扩大 scope

**Given** 一条只适用于当前 session 的 cognition 被反复成功使用  
**When** successful-use evidence 持续增加  
**Then** future accessibility 可以因 learning evidence 变得更 durable  
**But** 不仅因为使用次数高就产生 session→project/global promotion requirement 或 candidate  

### Scenario LIFECYCLE3-001-B：低 retrievability 不推导 semantic demotion

**Given** 一条 cognition 很久没有 exact retrieval，current retrievability 较低  
**When** 它在有限 discovery budget 中逐渐排到更深位置  
**Then** 这已经构成 discoverability forgetting  
**And** 不因此自动建议降低 importance、question、缩小 scope 或 rm  

### Scenario LIFECYCLE3-001-C：天然广 scope cognition 无需先积累 promotion evidence

**Given** 新 cognition 的 meaning 明确适用于未来多个 projects  
**When** 模型保存它  
**Then** 可以直接选择 global scope  
**And** 不要求先在 session/project 中积累 successful-use threshold  

## REQ3-DISCOVERY-LEARNING-001 retrieval/use learning 直接作用于 future discoverability，不再产生独立 promotion/demotion signal subsystem

retrievability、validated successful use、L0 exposure 等机制状态只承担各自已经定义的 discoverability / attention-learning 职责。`brain_think` 不需要再输出 generic promotion-candidate / demotion-candidate 来驱动 scope、importance、questioned 或 removal mutation。若某个 current epistemic status 本身影响模型是否可依赖 cognition，则按该 status 的 contract 直接呈现，而不是包装成 lifecycle signal。

### Scenario DISCOVERY-LEARNING3-001-A：successful use 的效果留在 accessibility

**Given** B 比 otherwise-equivalent A 有更多 validated successful-use evidence  
**When** 后续经历相同 cognition cycles  
**Then** B 可以保持更 durable future accessibility  
**And** 不要求另发 promotion signal 才使这种 learning 生效  

### Scenario DISCOVERY-LEARNING3-001-B：brain_think 不需要 generic lifecycle candidates

**Given** anchor 需要返回 bounded core/L0 cognition  
**When** 某些 memories 同时具有不同 retrievability、importance、exposure 或 questioned status  
**Then** 这些状态按各自 contract 影响 presentation/discoverability  
**And** 不要求额外生成 promotion/demotion candidate 列表作为第二套解释层  

---

## 17. Restored Context 的来源、claim 时间与 Presentation Boundary

## REQ3-CONTEXT-BOUNDARY-001 turn-level anchor 必须可被理解为当前恢复的 persistent working context，而不是针对 latest user event 自动生成的新分析

无论通过 explicit `brain_think` 还是 host hook 注入，anchor 内容都是本轮从 Brain 读取的 current persistent cognition snapshot。它不会仅因注入位置位于 latest user message 之后，就自动变成 Brain 已经针对该消息形成的新分析；同样也不能因源自 persistence 就被整体解释成较旧、较低权重的背景。每条 cognition 所描述状态的时间、当前适用性与有效性分别按其 meaning、scope 和 relevant evidence 判断。integration mode 不改变这一语义。

### Scenario CONTEXT-BOUNDARY3-001-A：hook 注入位置不改变 restored cognition 的来源

**Given** user message 到达后 host 自动执行 restore/injection  
**And** injected block 在 token/message 顺序上出现在该 user message 之后  
**When** 模型开始 substantive reasoning  
**Then** 不把 injected cognition 解释成 Brain 已经针对这条 user message 得出的更新结论  
**And** 也不把它整体降为旧背景；使用其中适用的 cognition，与该 user message / current evidence 一起形成 current understanding  

### Scenario CONTEXT-BOUNDARY3-001-B：explicit brain_think 与 hook 保持相同 context role

**Given** 一个 host 通过 explicit `brain_think` 建立 anchor，另一个 host 通过 hook 建立等价 anchor  
**When** 模型使用返回 cognition  
**Then** 两种 integration 都表达同一种 current persistent cognition snapshot 与 working-context role  
**And** 不因 transport 不同改变 memory 的 authority  

### Scenario CONTEXT-BOUNDARY3-001-C：新输入只更新受影响的 cognition

**Given** restored cognition 同时包含多个仍有效约束与一个旧 next-step proposal  
**And** latest user message 只明确改变 next-step direction  
**When** 形成 current understanding  
**Then** 更新与新方向冲突的部分  
**And** carry forward 未被新输入/证据改变的有效 cognition  

## REQ3-PRESENTATION-001 anchor presentation 必须让 cognition role、continuity boundary 与可执行 affordance 足够清楚，而不制造新的 semantic owner

presentation 的稳定行为目标是让模型区分机制 wrapper 与 restored cognition、core 与 archival summary、current status 与 cognition text，并能理解何时可以直接使用 summary、何时需要进一步 read/search/maintenance。presentation 不应把 runtime ranking 包装成“当前 user query relevance”，也不能因 archival residency 把 candidate 降为 optional background；同时不应通过重复 layer/type/authority labels 建立与 canonical path/semantic state 冲突的第二份真相。具体 XML/HTML-like tag 名、attribute 名、嵌套方式、自然语言措辞与 tool identifier 的排版属于 Design / Public Tool Contract。

### Scenario PRESENTATION3-001-A：candidate summary 可直接参与，但不假装 task relevance

**Given** L0 candidate 是在没有 current semantic query 的情况下由 bounded recall mechanism surfaced  
**When** candidate 被注入 anchor  
**Then** presentation 让模型把它理解为 bounded、non-exhaustive 的 archival cognition summary，并在适用且 summary 足够时按 path 编码的 cognitive role 直接参与 current understanding\
**And** 不声称 runtime 已经证明它与 latest user request 最相关或其中 claim 已被验证\

### Scenario PRESENTATION3-001-B：scope 信息表达 continuity，而不是 relevance/priority/authority

**Given** global/project/session cognition 同时进入 anchor  
**When** 模型读取它们的 public path / scope meaning  
**Then** 能理解 cognition 分别在哪些 session/project contexts 中延续\
**And** 不因 scope 更宽、更窄或更靠近 current session 就自动推导更高 epistemic authority  

### Scenario PRESENTATION3-001-C：guidance 放在最小且稳定、真正拥有该语义的 owner

**Given** anchor 同时包含三个固定 scope core 与一组动态同构 L0 candidate items  
**When** presentation 组织 maintenance / recall guidance  
**Then** 每个 candidate item 只携带真正随 item 改变的 cognition data，例如 public path、summary 与必要 current status  
**And** candidate list 共享的“这些 items 是什么、何时深入 read/search”语义由 `<memory_candidates>` 这类最小稳定 collection owner 表达  
**And** 每个 concrete core 保留与自身 path/continuity scope 对应的 `update_when` / `update_with` / `archive_when` / `archive_with` affordance，因为这些 decision conditions 与 destination scope 属于该固定 cognition owner\
**And** 不把 scope-specific core guidance 上提成一段要求模型重新映射到具体 path 的泛化说明  

### Scenario PRESENTATION3-001-D：presentation 暴露合法 next action，但不替模型做 semantic decision

**Given** restored cognition 可能需要 exact read、进一步 discovery 或 maintenance  
**When** 模型看到相应 presentation  
**Then** 能找到适用的 public brain primitive 作为下一步 affordance  
**And** 是否 read、write、edit、mv、rm 仍由模型根据 current meaning/evidence 判断  

---

## 18. Cognition Persistence Opportunity

## REQ3-PERSISTENCE-001 每个有效 cognition cycle 都保留语义性的 persistence judgment opportunity，而不是固定 write step

当 latest user input、tool evidence 或当前 reasoning 新形成、实质更新或否定了一个 cognition，且忘记该变化可能 materially change future reasoning or behavior 时，model-visible cognition interface 应让主模型能够及时判断是否需要维护对应 persistent owner。主模型按 cognition meaning、future applicability、residency need 与 current epistemic state 选择 core / archival / existing owner 以及适用 mutation；机制只提供能力、结构约束与可执行 affordance，不自动推导“必须记什么”，也不要求每轮固定执行 write。单纯经过一个 turn、调用一个 tool 或收到 raw ToolResult 本身不构成 persistent cognition state change。

### Scenario PERSISTENCE3-001-A：新形成的 durable cognition 有明确保存机会

**Given** latest user input 明确形成一个会影响未来 project work 的稳定 decision  
**When** 模型已经理解该 decision 及其未来适用范围  
**Then** cognition interface 让模型能够考虑将它保存到合适的 project persistent owner  
**And** 是否进入 core 或 archival 由未来是否需要 resident 等语义需要决定  
**And** 不要求先经过固定 write step 或 promotion ladder  

### Scenario PERSISTENCE3-001-B：当前 working cognition 改变时可维护已有 core

**Given** current session 的目标、进度、承诺或 unresolved work 已发生实质变化  
**And** later turns 仍需要这些变化保持 resident 才能正确继续  
**When** 模型形成新的 current working state  
**Then** 能明确识别应维护相应 session core  
**And** 若某段 cognition 仍值得在该 scope 保留、但已不需要继续 resident，model-facing affordance 先引导 `brain_write` concrete archival cognition，再 `brain_edit` core prune 对应 resident content  
**And** 不把 core↔archival 的 semantic transformation 伪装成 `brain_mv`  

### Scenario PERSISTENCE3-001-C：raw ToolResult 不自动变成 memory

**Given** 某次 tool call 返回新的执行事实或外部 evidence  
**When** 主模型尚未把它解释成值得未来持续的 fact、judgment、commitment、skill 或其他 cognition  
**Then** mechanism 不自动把 raw ToolResult 写成 persistent memory  
**And** 若模型随后形成了会 materially affect future reasoning/behavior 的 cognition，可再由模型保存该 cognition  

### Scenario PERSISTENCE3-001-D：已有 persistent cognition 被新证据改变时维护 canonical owner

**Given** persistent cognition X 已有明确 public owner  
**And** current evidence 对 X 形成了实质更新、质疑、纠正或退出 active 的判断  
**When** 模型决定该变化应跨未来持续  
**Then** cognition interface 让模型优先维护 X 的 current canonical owner / lifecycle state  
**And** 不把同一业务认知无必要地复制成第二份长期真相  

### Scenario PERSISTENCE3-001-E：没有 durable cognition change 时正常不 mutation

**Given** 本轮只完成一次性回答、可随时重新获得的执行信息，或没有形成需要跨未来持续的新事实/判断/承诺  
**When** 模型完成当前任务  
**Then** 不要求为了完成 memory workflow 而调用 write/edit/mv/rm/feedback  
**And** 普通流程经过本身不构成 state change  

---

## 19. Working Draft 的 Freeze 条件

进入 Acceptance Specification Freeze 前：

- 高影响 behavior domain 已逐项裁决；
- 每条 REQ 有能够校准 happy path / boundary / failure 的 Example；
- public tool contract 与 BDD 边界明确；
- BDD 只保留 What / invariant，不把 ranking 公式、FSRS 参数、filesystem implementation 偷渡进规格；
- 与共享历史、当前用户明确裁决和 working documents 不存在已知语义冲突。
