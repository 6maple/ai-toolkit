# brain Acceptance Specification v3

> **状态：Frozen Acceptance Specification v3（2026-08-30，v3 BDD + Public Contract 同步后重新冻结）。**
> **输入：** `bdd-brain-behavior-requirements.md` + `brain-tools-contract.md`。
> **Current converged structure：** 62 REQ / 140 BDD Scenario / 59 Acceptance cases。原始 Phase 4 Freeze 记录保留在 §20；本轮新增/改判只扩展 observable expectations，不把 Engineering Design 细节反推为需求。
> **变更控制：** Engineering Design、CI Draft 或 production implementation 必须满足本文；若 observable expectation 需要改变，先重新打开受影响 BDD / public contract / Acceptance，而不是从实现反推修改 expectation。
> **禁止反推：** 当前 production internals、v2 acceptance/contract、现有 state/index/lock/FSRS 实现都不能反向成为 v3 expectation。

## 1. 目的

本文把 v3 BDD 的稳定 What 展开成可审查的完整 Examples，并为每个 case 标记合适的 Verification Method。它不是测试代码，也不决定 Engineering Design。

原则：

- 一个完整 case 可以覆盖多个 BDD Scenario，不追求“一条 REQ 一个 test”；
- Given 优先通过 public tool/application 行为建立；只有公开接口无法自然制造的稳定 fault 才使用 Fault/Invariant seam；
- When 只使用稳定 public application/tool contract；
- Then 只观察模型/调用方真正关心的 public behavior 或稳定 invariant；
- fixed output budget 数值、ranking 公式、Git repo layout、内部 ID、lock/transaction、FSRS 数值不进入 acceptance expectation；
- Manual/E2E/AI Review 是项目验证方法，不自动成为 CI gate。

## 2. Verification Method

### CI Acceptance

使用真实 application/business behavior + fake/stub resource ports，可确定性执行，不创建真实 filesystem/process/network/LLM 资源。

### CI Contract

检查稳定模型可见 surface、schema、result class 或结构 fragment；不 snapshot 整篇自然语言文案。

### CI Fault / Invariant

通过最小 deterministic seam 制造 public API 无法自然建立的 commit failure、corrupt state 等前置条件，只断言对应稳定 guarantee。

### Manual / E2E candidate

用于真实 MCP/hook wiring、真实 Git/filesystem、真实 restart、真实多进程等项目级验证。是否执行与何时执行由 Test Strategy 决定。

### AI Semantic Review candidate

用于检查“restored cognition 是 user-requested working context”“candidate summary 可直接使用但不是 relevance/validity proof”等自然语言/model-facing 语义是否清楚；它补充 Contract 检查，但不替代确定性行为测试。

---

# 3. Public Contract 与 Cognition Anchor

## AC3-CONTRACT-001：v3 logical tool surface

**来源：** `brain-tools-contract.md` §5  
**类型：** Contract  
**Verification：** CI Contract

**Given** generic MCP integration 的 public tool surface  
**When** 查询模型可见工具定义  
**Then** 暴露 `brain_think / brain_absolute_path / brain_ls / brain_glob / brain_grep / brain_cat / brain_write / brain_edit / brain_rm / brain_mv / brain_feedback`\
**And** mutation tools 不暴露 `confirmed` / approval 参数  
**And** `brain_ls / brain_glob / brain_grep` 不暴露 model-controlled `limit`  
**And** `brain_edit.edits` 表达同一 document 内的一条或多条 exact replacements，空数组不是合法 edit
**And** Git history 不要求任何 model-visible rationale/commit-message 参数。

## AC3-ANCHOR-001：Generic MCP 的 read-before-think guidance

**来源：** ANCHOR3-001-A  
**类型：** Contract  
**Verification：** CI Contract + AI Semantic Review candidate

**Given** host 没有可靠 pre-reasoning hook  
**When** 暴露 `brain_think`  
**Then** tool guidance 清楚表达“收到新 user message 后立即恢复 persistent cognition，再 substantive reasoning”  
**And** contract 不声称 MCP 能机械保证模型一定调用。

## AC3-ANCHOR-002：Hook-backed integration 自动恢复 cognition

**来源：** ANCHOR3-001-B；TIME3-001-A；CONTEXT-BOUNDARY3-001-B  
**类型：** Acceptance / Integration Contract  
**Verification：** CI Acceptance；真实 host 为 Manual/E2E candidate

**Given** host 支持 pre-reasoning hook  
**When** 一个新 user turn 到达  
**Then** hook 自动完成与 explicit `brain_think` 等价的 restore/injection  
**And** model-visible tool surface 不暴露 `brain_think`，模型不需要再显式调用  
**And** hook 与 explicit mode 中 restored memory 的 context role / authority 相同  

## AC3-ANCHOR-003：Restored cognition 与 latest user event 正确合并

**来源：** ANCHOR3-003-A；AUTH3-001-A；AUTH3-001-B；AUTH3-001-C；CONTEXT-BOUNDARY3-001-A；CONTEXT-BOUNDARY3-001-C  
**类型：** Contract / Semantic Acceptance  
**Verification：** CI Contract + AI Semantic Review candidate

**Given** restored cognition 中有多个仍有效约束、一个旧 assistant next-step proposal，以及一个 tentative hypothesis\
**And** latest user message 明确改变 next-step direction  
**When** anchor presentation 被模型使用  
**Then** presentation 将 injected block 明确标识为 user-requested working context；它是本轮读取的 current persistent cognition snapshot，不是假定已经针对 latest message 生成的新分析，也不因 persistence 被整体解释成较旧或较低权重的背景\
**And** latest message 改变受影响的 next-step cognition  
**And** 未受影响的有效 constraints 继续保留  
**And** assistant proposal 仍是 proposal  
**And** hypothesis 仍是 hypothesis  
**And** 每条 cognition 所描述状态的时间、适用性与有效性按该 claim 的 meaning、scope 和 relevant evidence 判断  
**And** 模型可根据当前 task 自己产生后续 ls/glob/grep/cat retrieval intent。

## AC3-ANCHOR-004：restore 优先；auxiliary failure 局部降级，primary core failure 明确失败

**来源：** ANCHOR3-004-A；ANCHOR3-004-B；ANCHOR3-004-C；ANCHOR3-004-D\
**类型：** Acceptance / Fault / Invariant\
**Verification：** CI Acceptance + deterministic fault seams

**Given** 四个 case：A applicable cognition 可正常读取但 cycle/exposure/history 更新失败；B reliable fresh session 尚未 materialize 且无法建立真实空 core；C required applicable core 无法正确读取；D broad L0 corpus 只有一条 malformed archival Markdown\
**When** anchor 建立\
**Then** A 仍返回基于当前真实 cognition 的 restored context，并允许本轮对应 auxiliary learning/history event 丢失且产生 diagnostic warning\
**And** B/C 明确失败，不伪造可维护的 session/core context\
**And** D 只跳过 malformed item 并给 logical-path warning，其他有效 cognition 正常恢复。

---

# 4. Scope、Core 与 Archival

## AC3-SCOPE-001：scope 只表达 cognition continuity boundary

**来源：** SCOPE3-001-A；SCOPE3-001-B；LIFECYCLE3-001-C  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** 一条 cognition 明确跨 projects 适用，另一条只属于当前 session  
**When** 模型分别保存  
**Then** 跨项目 cognition 可以直接写 `@global/...`，无需先积累 promotion evidence  
**And** session cognition 保持在 `@session/<sid>/...`，不会因 project 相同自动外溢到另一 session。

## AC3-CORE-001：适用 core resident，archival 按需

**来源：** RESIDENCY3-001-A；RESIDENCY3-001-B；CORE3-001-A  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** global/project/session 三个 scope 都适用于当前 turn，其中至少一个 `core.md` 是空文件，其余 core 有内容，并有大量 archival items  
**When** anchor 建立  
**Then** 三个 bounded `core.md` 都真实存在；非空 core 直接进入 current context，空 core 正常为空且不产生伪内容  
**And** archival corpus 不整体展开  
**And** 只出现 bounded L0 cues，其他 archival 通过 discovery/cat 按需恢复  
**And** core 与 L0 都保持各自 bounded；不为增加 L0 而 silent truncate core
**And** core 已完整 resident，后续维护直接使用 `brain_edit`，不要求再 `brain_cat` 读取。

## AC3-CORE-002：session 同时有 resident 与 archival cognition

**来源：** SESSION3-001-A；SESSION3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** 当前 session 有每轮都需持续可见的 goal/progress，以及较早但以后可能需要的详细背景  
**When** 模型维护 session cognition  
**Then** active working state 可以进入 `@session/<sid>/core.md`  
**And** fresh session 初始化时已有空 `core.md`，anchor 将其作为 resident core 恢复，可直接用 `brain_edit(..., content=...)` 维护，不要求先 `brain_cat` 或 `brain_write`
**And** 历史细节可以进入 `@session/<sid>/memories/...` 并按需检索。

## AC3-CORE-003：core 超容量先失败再整理

**来源：** CORE3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** core 已接近 bounded capacity  
**When** `brain_edit` 的 resulting core 会超限  
**Then** mutation 在形成超限新状态前失败  
**And** 返回 actionable curation/compression guidance  
**And** 机制不自动挑某一段写进 archival。

---

# 5. Passive Cues、Active Discovery 与 Exact Read

## AC3-DISCLOSURE-001：L0 是 gist，可直接跳 exact read

**来源：** DISCLOSURE3-001-A；DISCLOSURE3-001-B；DISCLOSURE3-002-A  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** L0 candidate 只提供 archival path + summary，或者当前 context 已经知道 exact archival path
**When** 模型需要完整 archival cognition
**Then** 可以直接 `brain_cat(path)`  
**And** 不要求先经历 ls/glob/grep  
**And** ls/glob/grep 不是固定 pipeline；模型可按已有 directory/path-name/content clue 直接选择适合的 discovery primitive  
**And** L0 本身不自动展开 archival body。

## AC3-DISCLOSURE-002：active discovery 保留 gist；grep 额外保留 evidence

**来源：** DISCLOSURE3-003-A；DISCLOSURE3-003-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** archival leaf 被 ls/glob/grep 发现  
**When** 返回 active discovery result  
**Then** ls/glob memory leaf 带 public path/name + current summary  
**And** directory node 不伪造 memory summary  
**And** grep 还保留真实 matching line/context evidence，不用 summary 冒充 content match  
**And** matching line number 与 `brain_cat` 使用同一 1-based logical-document line coordinate  
**And** 合法 ls/glob/grep 无结果时分别返回明确的非错误文本，不返回空 ToolResult。

## AC3-CAT-001：一个 Markdown document 只有一个稳定坐标系

**来源：** READ3-001-A；READ3-002-A  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** 一个 archival Markdown document 可以在单次 read budget 内容纳  
**When** `brain_cat` exact read  
**Then** 可以一次返回完整 logical document  
**And** frontmatter/body 属于同一 1-based document-line coordinate  
**And** 不存在首次读取与 continuation 使用不同 offset 语义的私有协议。

## AC3-CAT-002：长文档 continuation 稳定

**来源：** READ3-003-A；READ3-003-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** document 超过单次 read budget 且读取期间 document 未修改  
**When** 模型按返回 affordance 连续读取后续页  
**Then** 非末页返回 `next_offset` 与包含 canonical path/同一 offset 的 `continue_with`  
**And** EOF、空文档、out-of-range 与 blocked line 不返回假的 continuation  
**And** stable document content 不无故跳过或重复。

## AC3-CAT-003：超长 logical line 不被截断后伪装成 exact read

**来源：** READ3-003-C；public contract §9\
**类型：** Acceptance / Contract\
**Verification：** CI Acceptance + Contract

**Given** 下一条完整 logical line 本身超过 `brain_cat` 的安全 representation boundary\
**When** exact read 到达该行\
**Then** 不把该行 excerpt 当作完整 exact content 返回，也不让 continuation 永久越过未返回的后半段\
**And** 明确指出当前 transport 无法无损表示该行，并引导 `brain_absolute_path` → host ordinary filesystem read\
**And** 在未返回任何 archival content 时不因此产生 exact-retrieval learning event。

---

# 6. Archival Semantic Contract

## AC3-MEMORY-001：summary 始终代表 current cognition，短 memory 不重复 body

**来源：** MEMORY3-001-A；MEMORY3-001-B；MEMORY3-005-A  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** archival memory 有非空 summary，且某次 edit 改变了其 meaning  
**When** edit 成功后再次通过 L0 passive cue / active discovery 观察  
**Then** 返回 current summary，不长期展示与新正文冲突的旧 gist  
**And** 若 summary 已无损表达一条很短 cognition，body 可以为空。

## AC3-MEMORY-002：cognitive role 由 path 单一拥有，并保留真实 behavioral meaning

**来源：** MEMORY3-002-A；MEMORY3-002-B；PATH3-003-A；PATH3-003-B  
**类型：** Acceptance / Contract / Semantic Review  
**Verification：** CI Acceptance + Contract + AI Semantic Review candidate

**Given** `@project/memories/decision/database/migration/rollback.md`、嵌套 skill path，以及一条仍只是 proposal 的 cognition  
**When** 判断 cognitive role 或基于新语义证据通过 `brain_mv` 重新分类  
**Then** `memories/<role>/` 第一层决定 role，后续 nested directories 不改变 role  
**And** `decision` 表示 established choice，`knowledge` 表示 fact/rule/constraint/established understanding，`intention` 表示 active goal/commitment，`skill` 表示 reusable method  
**And** decision/intention 分别证明已选择的方向与仍然 intended 的工作，不证明 implementation/performance/completion 已发生  
**And** knowledge 保留自身 certainty/scope/conditions，skill 只指导满足 prerequisites 的行动；二者都不从历史描述无依据泛化当前事实  
**And** scope/root 与 role 正交组合，不建立 `skill→global` / `intention→session` 等机械映射  
**And** move 到另一 role namespace 表达主模型已经完成的 semantic reclassification  
**And** proposal 不因被放到 `decision/` / `knowledge/` 就获得 established/user-confirmed authority  
**And** document metadata 不要求再重复 `type`  
**And** archival Markdown 可保留其他普通 frontmatter / 正文内容；brain 只消费其明确 contract 的字段，不建立额外 reserved-key blacklist。

## AC3-MEMORY-003：importance 是 omission consequence，不是 relevance

**来源：** MEMORY3-003-A；MEMORY3-003-B；public contract PC3-MEMORY-002  
**类型：** Contract / Semantic Acceptance  
**Verification：** CI Contract + AI Semantic Review candidate

**Given** 一条罕用但遗漏会造成严重不可逆后果的 memory，以及一条当前 query 不相关的 high-importance memory  
**When** 模型按 `low | medium | high | critical` contract 维护 importance  
**Then** 罕用 memory 可以是 `critical/high`  
**And** high importance 不把 non-match 变成 match  
**And** usage/recency/scope/confidence/current relevance 本身不改变 importance。

## AC3-MEMORY-004：持久化保留原 epistemic meaning

**来源：** MEMORY3-004-A；MEMORY3-004-B  
**类型：** Semantic Acceptance  
**Verification：** AI Semantic Review candidate + CI content assertions where deterministic

**Given** 一条只是 assistant proposal，另一条是用户明确决定  
**When** 两者作为 archival cognition 被保存并在后续 session exact read  
**Then** proposal 仍可识别为 proposal  
**And** user decision 保留足以理解其来源/commitment 的语义  
**And** persistence 不把二者洗成同一种 authority。

---

# 7. Mutation 与 Identity

## AC3-WRITE-001：create 与 overwrite 是不同 identity 语义

**来源：** WRITE3-001-A；WRITE3-001-B；WRITE3-001-C；IDENTITY3-001-C  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** 一个合法 archival path 在 case A 不存在，在 case B 已有 cognition A 及 learning evidence  
**When** `brain_write` 写入完整合法 document  
**Then** case A 创建新的 active cognition  
**And** case B 用 replacement cognition B 完整覆盖该地址  
**And** B 不继承 A 的 retrievability/reinforcement/usage learning history  
**And** resulting document 满足 summary/importance/path epistemic contract。

## AC3-EDIT-001：edit 表达 same cognition evolves

**来源：** EDIT3-001-A；EDIT3-001-B；IDENTITY3-001-A  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** archival memory 已存在并具有 learning continuity  
**When** `brain_edit` 通过 exact edits 或 whole-content replacement 修改同一 cognition  
**Then** public path identity 保持同一 cognition lineage  
**And** appropriate learning continuity 保留  
**And** resulting summary/content 不冲突。

## AC3-MV-001：archival mv 改地址但保持 identity；destination 使用 replace

**来源：** IDENTITY3-001-B；MV3-001-A；MV3-001-B；MV3-001-C；public contract §13  
**类型：** Acceptance / Contract  
**Verification：** CI Acceptance

**Given** archival item A 需要改变 scope/role，且分别测试 destination absent / destination 已有 B / destination 是 core  
**When** 调用 `brain_mv(src,dst)`  
**Then** archival→archival 时 A 的 identity/learning continuity 随新 path 保留  
**And** destination 已有 B 时采用 familiar replacement semantics，并明确实际 replace；B 退出该 active address\
**And** replacement 的成功不依赖 Git；若 B 之前已有 committed checkpoint，该 checkpoint 仍可作为额外历史依据\
**And** core↔archival move 被拒绝并给 read/write/edit semantic guidance。

## AC3-EDIT-002：edit schema 与 object-kind boundary 失败无副作用

**来源：** `brain-tools-contract.md` §10–13  
**类型：** Contract / Boundary Acceptance  
**Verification：** CI Contract + Acceptance

**Given** existing archival/core documents  
**When** 分别尝试：`brain_edit` 同时提供 `edits`+`content`、两者都不提供、或提供空 `edits=[]`；`brain_write` 指向 core；`brain_rm` 指向 core；`brain_mv` 使用 core↔archival 或 directory/glob selector
**Then** 每个调用都按 public object-kind/schema contract 明确失败  
**And** failure 不改变 current cognition、identity 或 learning state  
**And** 返回与目标 object kind 对应的合法下一步 affordance，而不是建议用私有参数绕过。

## AC3-RM-001：rm 只让 archival cognition 退出 active memory

**来源：** RM3-001-A；RM3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** 一个 active archival item 和一个 core document  
**When** 分别调用 `brain_rm`  
**Then** archival item 成功后退出 think/ls/glob/grep/normal cat active flow  
**And** core target 被拒绝，guidance 指向 `brain_edit`。

---

# 8. Feedback、Correction 与 Questioned State

## AC3-FEEDBACK-001：read 不等于 adopt；validated use 才强化

**来源：** FEEDBACK3-001-A；FEEDBACK3-001-B；FEEDBACK3-002-A；public contract `feedback=adopt`  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** memory 经 L0 passive cue、active discovery 或 exact read 进入 context  
**When** case A 最终未依赖它完成 decision/action，case B 实际依赖且 outcome 支持继续有效  
**Then** case A 不形成 validated successful-use evidence  
**And** case B 只有在显式 `brain_feedback(..., adopt)` 后形成 positive evidence  
**And** adopt 本身不机械提高 importance。

## AC3-FEEDBACK-002：question / resolve 表达 current epistemic lifecycle

**来源：** FEEDBACK3-002-B；CORRECTION3-001-A；CORRECTION3-001-B；QUESTIONED3-001-D；public contract §14  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** 三种 evidence：A 明确给出正确新 meaning；B 只证明旧 cognition 可能有问题但答案未知；C 对 questioned cognition 重新验证后确认原 meaning 仍成立  
**When** A 先 edit current document 再 `feedback=resolve`；B `feedback=question` 并提供完整 current `challenge`；C `feedback=resolve`  
**Then** A 的 current cognition 为 active，旧错误不永久污染 identity  
**And** B 为 questioned 且未来能恢复“在质疑什么、仍需解决什么”  
**And** C 回到 active 且无需伪造 semantic edit  
**And** correction/question/resolve 本身都不机械降低 importance。
**And** `feedback=question` 在 schema/runtime boundary 拒绝缺失、空或全空白 challenge；adopt/resolve 仍按 frozen signature 忽略额外 challenge。


## AC3-FEEDBACK-003：action failure 先做 causal attribution

**来源：** ATTRIBUTION3-001-A；ATTRIBUTION3-001-B  
**类型：** Semantic Acceptance  
**Verification：** AI Semantic Review candidate；deterministic state effect 可 CI

**Given** case A action 因外部 CI provider outage 失败，memory 本身仍正确；case B evidence 明确错误 memory 直接导致失败  
**When** 模型归因结果  
**Then** case A 不提交负向 memory feedback  
**And** case B 可以根据已知程度选择 question、edit+resolve 或 rm  
**And** 工具不把“action failed”机械等同“memory wrong”。

## AC3-FEEDBACK-004：feedback conditional schema 保持 current state 完整

**来源：** `brain-tools-contract.md` §14  
**类型：** Contract / Boundary Acceptance  
**Verification：** CI Contract + Acceptance

**Given** case A active memory，case B active memory，case C questioned memory  
**When** A 调用 `feedback=question` 但缺少 `challenge`；B 调用 `feedback=resolve`；C 调用 `feedback=resolve`  
**Then** A 明确失败且仍 active，不产生无解释 questioned state  
**And** B 明确失败且仍 active，因为没有 current challenge 可解决  
**And** C 成功恢复 active 并清除 current challenge  
**And** 三个结果都不要求 Git/audit rationale 参数。


## AC3-QUESTIONED-001：questioned 降低 proactive trust，但不改变 retrieval truth

**来源：** QUESTIONED3-001-A；QUESTIONED3-001-B；QUESTIONED3-001-C  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** active 与 questioned memory 其他条件等价，且 questioned memory 有 current challenge  
**When** 分别通过 L0、grep 与 exact cat 观察  
**Then** questioned 可在 bounded L0 中获得更低 proactive priority并显式标记  
**And** grep 真实 match 不因 questioned 消失  
**And** cat 正常读取 logical document  
**And** exact read 能恢复 questioned status + current challenge。

---

# 9. Learning、Forgetting 与 Discoverability

## AC3-LEARNING-001：forgetting 只使 broad discovery 更难，不使 memory 消失

**来源：** LEARNING3-001-A；LEARNING3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance with deterministic learning-state fixture

**Given** A 长期未 exact retrieval、current retrievability 很低  
**When** case A 参与 broad bounded discovery，case B 使用 exact path 或足够具体 query 使真实结果很少  
**Then** broad case 中 A 可以进入更深位置  
**And** specific cue case 中 A 仍正常被发现/读取。

## AC3-TIME-001：memory evolution 由 cognition events 驱动，不由墙钟驱动

**来源：** TIME3-001-B  
**类型：** Fault / Invariant  
**Verification：** CI Fault / Invariant

**Given** memory state 固定，期间没有新的 anchor/retrieval/use event  
**When** wall clock 从短间隔推进到很长间隔  
**Then** 不只因为现实时间流逝产生额外 forgetting state change。

## AC3-RETRIEVAL-001：exact read refresh；list/search discovery 不批量复习

**来源：** RETRIEVAL3-001-A；RETRIEVAL3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** 一条长期未取回 memory，另一次 broad grep 返回多条结果  
**When** 只对其中一条执行 `brain_cat`  
**Then** exact-read memory 可以获得 short-term retrievability refresh  
**And** 仅被 grep/ls/glob 展示的其他 items 不自动获得 retrieval refresh  
**And** exact read 本身仍不等于 adopt。

## AC3-REINFORCEMENT-001：validated successful use 比单纯 read 更 durable

**来源：** REINFORCEMENT3-001-A  
**类型：** Invariant  
**Verification：** CI Fault / Invariant with deterministic learning model seam

**Given** A 只有 exact reads，B 多次参与成功 action 并记录 adopt，之后经历相同未使用 cognition cycles  
**When** 比较 future accessibility  
**Then** B 可以比 A 保持更 durable retrievability  
**And** 不断言具体 stability/FSRS 数值。

## AC3-EXPOSURE-001：L0 passive anti-monopoly 不污染 active search

**来源：** EXPOSURE3-001-A；EXPOSURE3-001-B  
**类型：** Acceptance / Invariant  
**Verification：** CI Acceptance

**Given** A 连续多轮 L0 surfaced 但未进一步 read/use，且有其他 eligible memories  
**When** 继续 anchor，再随后用明确 grep query 命中 A  
**Then** A 在 passive L0 中逐渐让出 attention 机会  
**And** 过去 exposure debt 不隐藏/惩罚当前真实 grep match。

## AC3-DISCOVERABILITY-001：retrievability 与 importance 都是单调保护

**来源：** DISCOVERABILITY3-003-A；DISCOVERABILITY3-003-B；DISCOVERABILITY3-003-C  
**类型：** Invariant  
**Verification：** CI Fault / Invariant

**Given** otherwise-equivalent memory pairs，分别只提高 R、只提高 importance，以及都低 R 但一条 importance 明显更高  
**When** 竞争相同 bounded discovery window  
**Then** 更高 R 不导致更差 discoverability  
**And** 更高 importance 不导致更差 discoverability  
**And** 长期未使用不能单独消除 high-importance protection  
**And** 不断言具体组合公式。

---

# 10. Namespace、Path 与 Object Kind

## AC3-PATH-001：public path 是唯一 locator，scope roots 对称

**来源：** PATH3-001-A；PATH3-001-B；PATH3-002-A；PATH3-002-B  
**类型：** Acceptance / Contract  
**Verification：** CI Acceptance

**Given** discovery 返回 archival path X，并存在 global/project/session core+archival
**When** 用 X exact read，或检查同 scope 的 core/archival address  
**Then** X round-trip 到同一 cognition  
**And** internal ID/state key 不成为第二 public locator  
**And** 同 scope 的 `core.md` 与 `memories/...` 共享同一 root  
**And** session `<sid>` 只作为 opaque identity。

## AC3-PATH-002：public namespace 只暴露合法 cognition object kinds

**来源：** PATH3-004-A；PATH3-005-A；PATH3-005-B  
**类型：** Acceptance / Contract  
**Verification：** CI Acceptance

**Given** caller 猜测 mechanism filenames，并分别操作 directory/core/archival item  
**When** 通过 public brain tools 寻址  
**Then** state/index/history/lock/temp 等不成为 public cognition object  
**And** directory 可 `ls` 但不能被当单个 memory `rm`  
**And** core 按 core contract 处理，不被当 archival item
**And** standalone `@global/` / `@project/` / `@session/<sid>/` 只作为 applicability prefix，不成为可操作 public object。

## AC3-PATH-003：所有工具共享同一 path parser，并保持 containment

**来源：** PATH3-006-A；PATH3-007-A；PATH3-007-B\
**类型：** Acceptance / Security Invariant
**Verification：** CI Acceptance + Fault / Invariant

**Given** glob/grep 返回 archival path X，以及 malicious session id / nested path traversal attempts
**When** cat/edit 使用 X，或解析 traversal input
**Then** cat/edit 操作同一 cognition，无 tool-specific rewriting
**And** session id / nested item path 不能逃逸其 scope/role namespace
**And** 不把 shared parser semantics 解释成 ls/glob/grep 必须接受 core 或 standalone scope prefix 等其他 input kind。

## AC3-PATH-004：contained filesystem alias 跟随 real target；broken/越界 failure 局部化

**来源：** PATH3-007-C；PATH3-007-D；public contract PC3-PATH-004\
**类型：** Acceptance / Security Invariant\
**Verification：** CI Acceptance + filesystem-boundary fault seam；真实 symlink/junction 为 Manual/E2E candidate

**Given** case A alias 指向同一 logical scope 内的合法 managed target；case B alias broken/不可访问；case C alias resolved target 越出 intended scope\
**When** broad browse/discovery 与 exact operation 分别经过这些 locations\
**Then** A 跟随 real target；resolved target 的 canonical public path 继续拥有 cognition identity/scope/role，alias 不创建第二 cognition，重复 target 被 dedupe，并可给 alias-follow warning\
**And** B/C 在 broad browse/discovery 中只 warning + skip 受影响 entry，其他合法 cognition 继续工作\
**And** exact operation 指向 B/C 时明确失败，且 C 不泄露 scope 外内容。

---

## AC3-ABSOLUTE-001：宽松映射 cognition/asset workspace location

**来源：** PATH3-006A-A；PATH3-006A-B\
**类型：** Contract / Acceptance\
**Verification：** CI Contract + CI Unit

**Given** scope root、core、memory directory、`.md` cognition、已有或尚不存在的非 `.md` asset location\
**When** `brain_absolute_path(path)`\
**Then** 返回对应 scope 内的 deterministic absolute filesystem path\
**And** 不要求目标存在，不读取或创建目标\
**And** traversal 与 scope-level hidden mechanism path 被拒绝\
**And** 非 `.md` asset 不因此进入其他 brain cognition tools。

# 11. `brain_ls`

## AC3-LS-001：只列 memories-directory direct children，真实 membership 不受 strength 改写

**来源：** LS3-001-A；LS3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** `<scope-root>/memories/.../` directory 同时有 direct child、deeper descendant 与低-retrievability direct memory
**When** `brain_ls(directory)`  
**Then** 只返回 direct children  
**And** 结果量在 budget 内时低-R direct child 仍真实出现
**And** standalone scope prefix/core/concrete-item 不是合法 ls target。

## AC3-LS-002：超预算显式 refine，不提供 page 2

**来源：** LS3-002-A；LS3-002-B  
**类型：** Acceptance / Contract  
**Verification：** CI Acceptance

**Given** direct children 超过内置 output budget  
**When** `brain_ls` 返回  
**Then** 明确说明还有更多/发生 truncation  
**And** 给缩小 path 或改用 glob/grep 的 actionable guidance  
**And** 不提供 offset/cursor/扩大 model limit 的 page-2 protocol。

---

# 12. `brain_glob`

## AC3-GLOB-001：glob 只按 path truth 匹配 archival memory

**来源：** GLOB3-001-A；GLOB3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** nested archival paths，其中某一真实 match R 很低或 questioned  
**When** pattern 匹配且结果量在 budget 内  
**Then** recursive nested archival paths 正常命中
**And** low-R/questioned 不把真实 path match 变 false  
**And** questioned status 在结果中保持可见  
**And** omitted optional path 时，当前可访问 scopes 的 active archival memory paths 都属于搜索范围
**And** standalone scope prefix/core 不是 glob search root，directory 也不是 glob result。

## AC3-GLOB-002：glob 超预算只 refine，不分页

**来源：** GLOB3-002-A  
**类型：** Acceptance / Contract  
**Verification：** CI Acceptance

**Given** broad pattern 的 true matches 超内置 budget  
**When** `brain_glob` 返回 bounded results  
**Then** 明确 `truncated=true`，表示结果尚未完整展示
**And** 引导缩小 pattern/path  
**And** 不提供 page-2 continuation。

---

# 13. `brain_grep`

## AC3-GREP-001：literal/regex 只对 archival content 返回真实 evidence

**来源：** GREP3-001-A；GREP3-001-B  
**类型：** Acceptance  
**Verification：** CI Acceptance

**Given** active archival documents 分别包含 literal 与 regex matches
**When** 按 public grep contract 搜索  
**Then** 返回真实 matching archival paths/lines/context
**And** summary 仅作为 gist，不生成不存在的 content match  
**And** `glob?` 作为相对于 selected search root 的 file glob 收窄 archival Markdown corpus  
**And** omitted optional path 时只搜索当前可访问 scopes 的 active archival Markdown
**And** standalone scope prefix/core/concrete-item 不是 grep search root。

## AC3-GREP-003：invalid regex 是 input error，不是 no-match

**来源：** GREP3-001-C；public contract §8\
**类型：** Contract / Boundary Acceptance\
**Verification：** CI Contract + Acceptance

**Given** regex mode 收到无法 compile/parse 的 pattern\
**When** `brain_grep` 执行\
**Then** 返回明确 input/query error，不返回“合法搜索但 0 matches”\
**And** guidance 指向修正 regex，或在确实想搜索这些普通字符时使用 `literal=true`。

## AC3-GREP-002：grep 使用 bounded result，截断后 refine query，不建立分页状态

**来源：** GREP3-002-A；GREP3-002-B；GREP3-002-C  
**类型：** Acceptance / Invariant  
**Verification：** CI Acceptance

**Given** true matches 超出成熟 grep Tool 的单次 result/output bound
**When** `brain_grep` 返回
**Then** 明确提示结果被截断，并给出缩小 `pattern/path/glob` 后重新搜索的可执行 guidance
**And** public schema/result 不提供 `offset` / cursor / `next_offset`
**And** 单纯展示 grep result 不改变 R/L0 exposure 等 learning state。


---

# 14. Approval、Auxiliary Git History 与 Recoverability

## AC3-HISTORY-001：current cognition success 不等待 Git；history failure 局部降级

**来源：** APPROVAL3-001-A；HISTORY3-001-A；HISTORY3-001-B；HISTORY3-001-E；HISTORY3-002-A\
**类型：** Acceptance / Contract / Fault\
**Verification：** CI Acceptance with Git resource port fake；真实 Git 为 Manual/E2E candidate

**Given** 合法 current cognition mutation，分别令 Git repository unavailable、stage/add failure、checkpoint failure\
**When** mutation 的 public cognition semantics 已完整形成\
**Then** Tool success 由 current cognition result 决定，不等待 Git 才成立，也不因 Git failure 回滚已正确成立的 cognition\
**And** Git history 可以暂时落后于 current working state，并留下 diagnostic warning/log\
**And** 已经真实存在的 committed checkpoint 仍可作为额外历史恢复依据\
**And** rm 不额外维护 hidden recycle，也不维护 `history.jsonl` / `change_history.jsonl`，不创建 pending-history / recovery-commit 业务状态。

## AC3-HISTORY-002：anchor 是 best-effort 轮次 checkpoint opportunity

**来源：** HISTORY3-001-C；HISTORY3-001-D  
**类型：** Acceptance / Contract  
**Verification：** CI Acceptance with Git resource port fake；真实 Git 为 Manual/E2E candidate

**Given** 从上一次 anchor 后已有一个或多个 current brain workspace changes\
**When** 下一次 `brain_think` / hook-equivalent anchor 执行且 Git 可用\
**Then** 本轮至多形成一次统一 checkpoint opportunity\
**And** 不要求模型额外提供 Git reason/rationale/commit message，也不为每个 `brain_cat` / write / edit / mv / rm 单独制造 commit\
**And** 当前 cognition 与配套 assets 可以进入同一辅助 history checkpoint\
**But** checkpoint 失败只使 history 落后，不取消本轮已经正确 restored 的 cognition。

---

# 15. Consistency、Concurrency、Failure 与 Restart

## AC3-CONSISTENCY-000：Markdown/core truth + disposable learning state

**来源：** CONSISTENCY3-000-A；CONSISTENCY3-000-B；CONSISTENCY3-000-C\
**类型：** Acceptance / Invariant  
**Verification：** CI Acceptance

**Given** valid Markdown/core cognition，并分别让 companion 缺失/malformed/hash stale/cross-state invalid，或让 scope-cycle state 缺失/malformed/无法解释\
**When** read/discovery/anchor 使用该 scope/cognition\
**Then** Markdown/core workspace 仍定义 cognition existence/content\
**And** unavailable companion / scope-cycle learning state 从 fresh baseline 继续，不反向否定 valid cognition\
**And** orphan companion 不产生 memory\
**And** 普通 ls/glob/grep 不因 fresh fallback 被迫产生 repair write，也不猜测修改 cognition 内容。

## AC3-CONSISTENCY-001：success boundary 跟随业务语义；auxiliary read-learning failure 不吞内容

**来源：** CONSISTENCY3-001-A；CONSISTENCY3-001-B；CONSISTENCY3-001-C\
**类型：** Acceptance / Invariant / Fault\
**Verification：** CI Acceptance + deterministic learning-state fault seam

**Given** case A 合法 write/edit/mv/rm/feedback mutation；case B 一次 mv 等 semantic operation 需要多个必要 state change；case C `brain_cat` 已正确读取 content 但 exact-read retrievability refresh 无法持久化\
**When** operation 完成\
**Then** A success 后后续 public operation 立即观察到其完整业务结果，不等待 background flush / Git commit\
**And** B 不会出现 source 已退出而 destination 尚未成立等 public partial success\
**And** C 仍返回已经正确读取的 document content，允许本次 auxiliary learning refresh 丢失并给 diagnostic warning。

## AC3-CONCURRENCY-001：并发成功结果等价于某个合法顺序

**来源：** CONCURRENCY3-001-A；CONCURRENCY3-001-B  
**类型：** Invariant  
**Verification：** CI Fault / Invariant with deterministic coordination seam

**Given** case A 并发修改两个独立 items，case B 两个操作竞争同一 item  
**When** 多个 operation 均报告 success  
**Then** case A 两个独立成功结果都可观察，不因 stale read/write race 静默丢失  
**And** case B 最终状态等价于某个 public contract 允许的 sequential order，或冲突被明确拒绝。

## AC3-CONCURRENCY-002：只有共享 global scope 需要跨进程协调

**来源：** CONCURRENCY3-001-C  
**类型：** Invariant / Integration  
**Verification：** CI coordination-port invariant；真实多进程为 Manual/E2E candidate

**Given** 两个 project-level server instances 共享同一 global memory store  
**When** 它们并发修改 shared global state  
**Then** global guarantee 仍满足 AC3-CONCURRENCY-001 的 sequential / no silent lost update semantics  
**And** 不要求 project/session scope 为不存在的 cross-process sharing 支付同样机制成本。
## AC3-FAILURE-001：可处理 failure 不留下伪成功半状态

**来源：** FAILURE3-001-A；FAILURE3-001-B  
**类型：** Fault / Invariant  
**Verification：** CI Fault / Invariant

**Given** case A mutation 在 precondition/validation 阶段失败，case B 在 public success boundary 内的 required cognition/store write 阶段发生 deterministic failure\
**When** operation 返回 failure  
**Then** case A 保持 original current state  
**And** case B 不把 partial state 暴露成正常 success  
**And** 当前 state 要么回到 prior valid state，要么显式 fail loud，具体 rollback mechanism 不属于 acceptance。

## AC3-RESTART-001：普通 restart 保留已成功 cognition continuity

**来源：** RESTART3-001-A  
**类型：** Integration Acceptance  
**Verification：** Manual/E2E candidate；business-level persistence port contract 可 CI

**Given** cognition mutation 已 success 并写入 persistent state  
**When** brain 正常 stop/start  
**Then** current cognition public semantics 保持  
**And** edit/mv 所要求的 identity/learning continuity 不重置、不串到别的 cognition。

## AC3-RESTART-002：强制终止中的未完成 mutation 是明确 non-goal

**来源：** RESTART3-001-B  
**类型：** Contract / Boundary Review  
**Verification：** Specification review；不要求 crash-recovery automated case

**Given** operation 尚未到达 success boundary  
**When** process 被 SIGKILL/host crash/power loss  
**Then** v3 不承诺重放或完成这次 mutation  
**And** restart 后 normal active state 必须对应一个已完成的 persistent state；已成功但从未形成 Git checkpoint 的 current cognition 也不能仅因正常 restart 丢失，无法安全解释 current cognition 时才 fail loud\
**And** 不因此要求 durable WAL/journal/roll-forward。

---

# 16. Lifecycle 与 Generic Signals

## AC3-LIFECYCLE-001：usage/retrievability 不自动推导 scope 或 semantic lifecycle

**来源：** LIFECYCLE3-001-A；LIFECYCLE3-001-B；DISCOVERY-LEARNING3-001-A  
**类型：** Acceptance / Invariant  
**Verification：** CI Acceptance

**Given** case A session cognition 被高频成功使用，case B cognition 长期未 exact retrieval  
**When** learning state 演化  
**Then** case A future accessibility 可以更 durable，但不自动产生 session→project/global promotion  
**And** case B 可以更难发现，但不自动降低 importance、question、缩小 scope 或 rm  
**And** learning 直接作用于 accessibility，不需要 promotion signal 才生效。

## AC3-LIFECYCLE-002：brain_think 不再输出 generic promotion/demotion candidates

**来源：** DISCOVERY-LEARNING3-001-B  
**类型：** Contract  
**Verification：** CI Contract

**Given** memories 有不同 retrievability/importance/exposure/questioned status  
**When** anchor presentation 生成  
**Then** 各状态按自身 contract 影响 presentation/discoverability  
**And** 不额外生成 promotion-candidate / demotion-candidate / generic lifecycle signal list。

---

# 17. Restored-context Presentation

## AC3-PRESENTATION-001：presentation 表达真实 cognition relation，并把 guidance 放到真正的 semantic owner

**来源：** PRESENTATION3-001-A；PRESENTATION3-001-B；PRESENTATION3-001-C；PRESENTATION3-001-D  
**类型：** Contract / Semantic Review  
**Verification：** CI Contract + AI Semantic Review candidate

**Given** anchor 同时包含 global/project/session 三个固定 core 与多个动态 L0 candidates，其中一条 questioned  
**When** 渲染 model-visible context  
**Then** outer wrapper 将 injected block 表达为 user-requested working context，并明确 latest user message、applicable restored cognition 与 relevant evidence 共同形成 current understanding\
**And** candidate summary 被表达为可直接使用的 bounded working context，同时不声称 runtime 已证明 current-query relevance 或 claim validity\
**And** root/path guidance 表达 continuity scope，不暗示更宽/更窄 scope 有更高 authority\
**And** archival role rules明确表达 `decision/knowledge/intention/skill` 恢复后怎样参与 current understanding/reasoning/decision/action，而不是只给四个分类 label\
**And** 动态 candidate item 只重复真正随 item 变化的 path/summary/status 等 instance data，其 shared read/search guidance 由 `<memory_candidates>` 这类最小稳定 collection owner 表达  
**And** 每个 concrete core 自己携带与其 path/continuity scope 对应的 `update_when` / `update_with` / `archive_when` / `archive_with`，不把 scope-specific action guidance 上提成需要模型重新映射的一坨通用规则\
**And** root applicability 不在每个 core 上重复成第二份 `scope` / `applies_to` truth  
**And** presentation 在需要 exact read/search/maintenance 的 decision point 暴露合法 `brain_*` next action  
**And** 是否执行该 semantic action 仍由模型根据 current task/evidence 决定。

---

# 18. Cognition Persistence Opportunity

## AC3-PERSISTENCE-001：新 cognition 有 persistence judgment opportunity，但不形成强制 write workflow

**来源：** PERSISTENCE3-001-A；PERSISTENCE3-001-B；PERSISTENCE3-001-C；PERSISTENCE3-001-D；PERSISTENCE3-001-E；`brain-tools-contract.md` PC3-THINK-005  
**类型：** Contract / Semantic Acceptance  
**Verification：** CI Contract + representative Agent Replay / AI Semantic Review candidate

**Given** 代表性 turns 分别形成：A 会影响 future project work 的明确新 decision；B later turns 仍需 resident 的 session working-state change，并包含一段仍值得 session 内保留但已不需 resident 的 cognition；C 只有 raw ToolResult 尚未形成 durable cognition judgment；D 对已有 persistent cognition X 的实质更新/质疑/纠正；E 没有需要跨未来持续的新 cognition  
**When** 模型使用 turn-level brain context 与 public brain tool affordance 完成当前任务  
**Then** A 能识别 persistence opportunity，并按 future applicability/residency 选择适当 persistent owner，而不是机械先写 session 再 promotion  
**And** B 能识别维护已有 session core；对需要从 resident 转为 archival 的部分，先 `brain_write` 到 concrete `@session/<sid>/memories/<role>/...`，成功后再 `brain_edit` core prune，不使用 cross-kind `brain_mv`  
**And** C 不因 tool 被调用或 result 被看到就由 mechanism 自动生成 memory；只有模型形成 durable cognition 后才考虑保存  
**And** D 能识别 existing canonical owner / epistemic lifecycle 是优先维护对象，而不是无必要复制第二份长期真相  
**And** E 可以正常完成而完全不产生 memory mutation  
**And** contract 不要求固定 end-of-turn write、固定 Tool 顺序或额外 reviewer/hook 才算完成该 cycle。

---

# 19. Phase 3 Test Design Review Checklist

进入 Acceptance Specification Freeze 前，应逐项审：

- 当前 140 个 BDD Scenario 是否全部至少映射到一个 case；
- public contract 新增的 `brain_feedback`、importance enum、mv destination replacement 是否都有 case；
- Contract case 是否只检查稳定 schema/fragment，而非整段 wording snapshot；
- AI Semantic Review case 是否有明确判据，而不是“看起来不错”；
- CI case 是否可以使用真实 business logic + fake resource ports，不依赖真实 filesystem/process/network/LLM；
- Fault case 是否只针对已经成为产品 guarantee 的 failure；
- Manual/E2E candidate 是否保持可选验证策略，不偷渡进标准 CI 流程；
- 替换内部 storage/ranking/Git wiring 而 public behavior 不变时，绝大多数 expectations 是否仍可保持。
---

## 20. Inherited v2 Acceptance Freeze Record

**Freeze date：** 2026-08-22
**Decision：** Phase 4 Acceptance Specification Freeze executed.
**Frozen inputs：** v2 BDD Requirements Baseline + v2 Public Tool Contract。
**Frozen scope：** 53 acceptance cases 对应的 Scenario、关键边界、Expected behavior、public/model-visible contract 与 Verification Method 分类。

Freeze 时结构检查：

```text
BDD requirements:        60
BDD scenarios:           126
Acceptance cases:        53
BDD scenario coverage:   126 / 126
Missing scenario refs:   0
Stale scenario refs:     0
Duplicate AC IDs:        0
Incomplete case metadata:0
```

> 以上是从 v2 继承的 2026-08-22 原始 Freeze record。它只解释前代规格的形成过程，不声称当时已经冻结 v3。

### 20.1 Inherited v2 2026-08-24 Evidence-correction Re-freeze

**Decision：** BDD / Public Contract / Acceptance 上游行为重新冻结。\
**Current structure：** 62 BDD requirements / 140 BDD scenarios / 59 Acceptance cases。\
**Coverage：** 140 / 140 BDD scenarios mapped；missing 0；stale scenario refs 0；duplicate AC IDs 0。\
**Reopened behavior domains：** anchor failure locality、exact-read lossless continuation、filesystem alias semantics、invalid regex error、mv/rm 与 Git 解耦、auxiliary learning/history degradation、current-state success boundary。\
**Boundary：** 本次 re-freeze 不冻结 D1/D2 ranking/decay/calibration、Git/storage/coordination implementation、具体 output budget 数值或 host wiring；这些仍由 Phase 5 Engineering Design 从当前上游规格推导。

### 20.2 2026-08-30 v3 Anchor-semantics Re-freeze

**Decision：** v3 BDD / Public Contract / Acceptance 对 model-visible anchor 的表达与消费语义重新冻结。\
**Current structure：** 62 BDD requirements / 140 BDD scenarios / 59 Acceptance cases。\
**Coverage：** 140 / 140 BDD scenarios mapped；missing 0；stale scenario refs 0；duplicate AC IDs 0。\
**Reopened behavior domains：** restored cognition 的 working-context role、claim-level time/authority evaluation、不同 claim 的 evidence boundary、cognitive-role consumption、candidate summary direct use、按需 exact read/search、shared guidance 与 concrete core guidance ownership。\
**Unchanged domains：** scope、storage、mutation、learning、discovery、coordination 与 Git behavior 继续由 v3 完整文档集中的继承定义拥有；本次没有重新设计这些 subsystem。\
**Verification boundary：** deterministic CI 验证 model-visible structure 和稳定 semantic relation，不锁整段英文；Representative Agent Replay / Eval 验证模型是否实际联合使用 latest user input、applicable cognition 与 relevant evidence。

以下仍不是 Frozen Engineering Design：内部 state schema、ranking/learning 公式和数值、fixed output budget 数值、Git repository physical layout/commit granularity、lock/transaction mechanism、hook/plugin SDK wiring、具体 XML attribute wording。它们必须在 Phase 5 中从本 Frozen Acceptance 反推 How，而不能反向修改这里的 What。
