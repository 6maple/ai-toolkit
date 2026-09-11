# Brain v4 model-facing cognition interface — 临时设计稿

> 状态：Implemented in source / user manual acceptance pending，2026-09-10。
>
> 本文件是本轮 v4 model-facing cognition interface 文案调整的唯一设计记录。未在本文明确重开的行为继续以 v3 当前基线为准。
>
> 实现状态：当前源码已实现本文的 shared presentation、Codex overlay、Tool description/schema prose 与 oversized-line behavior；尚未执行 stub、重新安装或 representative model replay。

Brain 跨版本稳定的初始背景、目的和防偏边界由 [`../../README.md`](../../README.md#brain-的初始背景与目的) 拥有。本稿的背景章节只说明这些目标怎样约束当前 model-facing interface，不建立第二份 original-intent truth。

## 1. 原始背景、目的与本轮问题

Brain 不是通用知识库，也不只是给模型提供一个可选的“历史记忆库”。它的原始目标是：在模型参数不会随当前用户和项目持续演化、长会话 transcript 会被压缩或裁剪、早期内容会因 attention dilution / context rot 失去影响力的现实下，以有限的 read-before-think context 成本恢复此前形成的 cognition，使模型延续用户偏好、既定 decision、仍在进行的 intention、已知 knowledge、约束和可复用 skill。

原始问题不是“信息有没有保存”，而是“已经形成的理解能否在后续行动中继续起作用”。Transcript 可能仍包含某条用户要求，但模型不再注意它；静态 skill 或 instruction 可能仍在 context 中，但触发和遵循依赖同一个会衰减的模型。Brain 因此提供一个外部、连续维护、每个新 user event 都重新恢复的 cognition work surface，降低 Lost in the Middle、压缩失忆、最新消息冲击和未完成承诺静默遗漏造成的重复纠正成本。

这里改用 `cognition` 作为 model-facing 术语，不是否定 Brain 的 memory architecture，而是避免模型把 `memory` 自动解释成较旧、较弱或只供参考的历史材料。Storage、scope、learning 和 archival 机制本身不因本轮 presentation 调整而改变。

当前用户回放中，问题主要发生在 GPT/Luna：模型看到 `memory`、`candidate`、大段 XML attribute 或反复出现的“适用时才使用、需要验证”限定后，容易把整个 Brain 输出降为低优先级背景、待验证线索或搜索提示。随后即使它读取了工作区，也常常只按磁盘信息重新构造任务，遗漏 Brain 中不同命题上的 decision、intention、preference、constraint 或 commitment。

用户的对照回放显示，同一套 Brain 机制在 DSH + DeepSeek V4 Flash/0731 中能较好生效，而把返回值直接放进 developer context 也不能稳定修复 GPT/Luna。因此，当前 evidence 不支持把根因归结为注入通道；本轮重点是 model-visible instructions 和 working-context presentation。该判断仍应由后续 representative replay 继续验证。

目标：

- governing system/developer instructions 继续拥有其既有优先级；Brain 不与它们竞争 authority；
- latest user message 仍定义本轮请求；
- applicable restored cognition 直接参与本轮理解、工具选择、行动和回答，而不是可选背景；
- 新查到的信息与 restored cognition 共同形成当前理解，不允许只凭磁盘信息无声重建整个任务；
- evidence 只更新它实际涉及的 claim；一个命题上的新证据不自动覆盖另一个命题上的 decision、intention 或 constraint；
- cognition 不因被持久化或恢复而自动升级，也不因叫作 memory、位于 archival、时间较早或其他来源较新而自动降级；
- 文案直白、分层、低歧义，不凭空加入防御性限制，也不靠大量重复的 `must/never` 制造遵循度。

本轮设计是否成功，最终不以“模型调用了 Tool”或“prompt 中出现了关键词”判断，而以这些原始结果判断：后续工作是否延续已经形成的目标、decision、commitment 和 constraint；长会话或压缩后是否减少要求用户重新提供背景和反复纠正；这些收益是否值得 bounded core/L0 context 成本。

### 1.1 Archive 的使用边界

`doc/brain/archive` 是理解原始问题、设计依据、被否方案和演进原因的 evidence，不是当前 contract。Archive 中最早的“缺陷对抗控制回路”包含把锚、自查、验收和验证外部化的更广愿景；经过后续版本收敛，Brain 当前承担其中的 persistent cognition continuity：恢复、渐进发现、精确读取、维护和相关 learning state。任务专属的事实验证、验收流程和专业判断仍由 governing instructions、当前任务工具和主模型承担。

因此 v4 不把完整 CQF/checklist、通用验证流程或独立 evaluator 塞进每轮 `brain_think_context`。这样既保留原始目标中的外部认知锚，也避免重新制造长静态 instruction、恒定 token 成本和依赖模型执行元流程的问题。

Archive 中已经被 v1/v2/v3 后续设计替代的 API、物理布局、approval 档位、promotion/demotion、history/recycle、FSRS 参数或 L1/L2 细节，不因本次引用 Archive 自动恢复为 v4 设计。本文没有明确重开的行为继续由 v3 当前基线拥有。

## 2. 总体表达方式

采用“Markdown instructions + tagged dynamic content”的混合格式。

这不是断言 Markdown 在所有模型和场景中都优于 XML。选择依据是：稳定 instruction 更适合用模型熟悉的 heading、paragraph 和 list 表达层级与动作关系；tag 更适合界定不可与说明混淆的动态 cognition content；当前 GPT/Luna 回放又表明，把大量行为语义塞进 XML attributes 会降低实际消费效果。因此只把二者分别用在其更擅长的职责上，不建立两套语义 owner。

Markdown 负责：

- 稳定的 instructions；
- 层级和阅读顺序；
- continuity scope、cognitive role、preservation 和 maintenance 说明；
- shared Brain context 的整体语义。

Shared Brain renderer 中的 XML-like tags 只负责界定动态内容：

- `<brain_think_context>`：shared Brain working context 的边界；
- `<core>`：一份 concrete resident core 的内容边界；
- `<recalled_cognition_summary>`：一条 recalled archival cognition summary 的边界。

attribute 只放短小、原子的动态 metadata：

- `core.path`；
- `core.empty`（只有确实需要表达空 core 时）；
- `recalled_cognition_summary.path`；
- `recalled_cognition_summary.status`（只有存在 current status 时）。

不再用长 attribute 承载 instructions，也不再生成以下静态 presentation containers：

- `brain_namespace`；
- `core_memory`；
- `archival_memory`；
- `cognitive_role_rules`；
- `memory_candidates`；
- `memory_candidate_item`。

model-facing 摘要名称统一使用 **recalled cognition summary**，不使用容易被理解为“尚未确认观点或搜索线索”的 **memory candidate**。

## 3. 语义与文案 ownership

### 3.1 Shared Brain renderer

Brain 通用 renderer 拥有所有宿主共享的 cognition semantics：

- working-context meaning；
- continuity scopes；
- resident core 与 archival cognition 的 residency；
- cognitive roles；
- recalled summary 的使用方式；
- preservation 和 maintenance rules；
- dynamic cognition 的 tag structure。

这些内容放在 `<brain_think_context>` 附近，由 DSH、generic MCP、Codex 等宿主共同消费，不能复制成多个宿主私有版本。

“Renderer 拥有 semantics”只表示它拥有这些 model-facing 定义和表达，不表示 Brain runtime 在内部做语义判断。Brain 仍是纯程序化机制：负责 scope/path/schema、bounded selection、状态转换和确定性约束；主模型负责判断什么 cognition 相关、怎样理解、是否应持久化、写入哪个 scope/role，以及怎样维护正文。v4 不在 Brain runtime 内嵌第二个 LLM、RAG 或语义裁判。

### 3.2 Host integration

宿主只拥有：

- 何时触发 restore；
- 怎样取得可信的 project/session binding；
- 怎样把 shared context 交给模型；
- 基于真实 host/model evidence 所需的最薄 attention overlay。

Codex 当前使用 `UserPromptSubmit` 机械调用同一个 Brain restore application，并隐藏 model-visible `brain_think`。它不提示模型再调用一次工具，也不建立第二条 restore path。

Shared restore diagnostics 与 cognition context 分离：diagnostic 可以由宿主记录或作为独立 warning 传递，但不能插进 `<brain_think_context>`，也不能把 auxiliary learning/history 的局部失败表述成 cognition restore 失败。

如果真实回放证明 Codex 会把普通 injected context 系统性降为 background，Codex 可以在 shared result 前添加专用 instruction overlay。该 overlay 只要求模型实际使用 shared context，不复制 scope、role、residency、persistence 或 maintenance policy。

DSH 和 generic MCP 不复制 Codex overlay，除非各自的真实 evidence 证明需要独立的 host calibration。

触发保证需要按宿主真实能力表述：

- Codex 这类 mechanical-restore integration 可以由 host 保证每个新 user event 调用一次 restore；
- generic MCP 只能通过 Tool description 强烈引导模型立即调用，MCP 本身不能机械保证遵循；
- 两种模式都只允许一条 restore path，同一 turn 不重复 restore；
- 新 user event 是 restore 和 persistence judgment 的自然触发点，但不是“每轮必须写 Brain”的信号；没有形成或改变应跨未来持续的 cognition 时，不 mutation；
- 会话结束不额外引入 flush/沉淀流程。没有新的 user event 时，不为模拟连续思考而触发额外 Brain cycle。

### 3.3 Tool contract

Tool description 拥有：

- 本工具能做什么；
- 什么时候用；
- 关键结果或限制。

Parameter description 就地拥有该参数的完整合法域和输入语义。跨工具 cognition workflow 不应重复塞进每个 Tool description。

Tool 自指使用 `this tool`，因为宿主可能把 logical tool name 加 namespace 或改写显示名称。只有指向另一个稳定 primitive 时才写 `brain_cat`、`brain_edit` 等 logical name。

Description 长度不设机械字符上限，而按 semantic ownership 判断：

- Tool 顶层保持一个短段落，只放能力、选择时机，以及会改变调用决策的主要结果、副作用或限制；
- parameter description 可以更长，因为它必须独立给出该字段的合法域、默认/省略语义和必要示例；
- path grammar、enum 分支、archival metadata 这类无法由类型本身表达的 contract 留在对应参数，不上移到顶层，也不因追求短而删除；
- result/error 只有在 caller 需要据此继续、恢复或避免错误 mutation 时才进入顶层；完整 deterministic contract 留在 design/acceptance；
- 同一规则只由一个 owner 表达；不为强调而在 shared context、Tool description 和多个 parameter description 中重复。

Model-facing Markdown 中，凡是明确指代真实 tag、Tool、parameter、enum value、field 或 path pattern，都使用 inline code 标记，例如 `<core>`、`brain_cat`、`next_offset`、`feedback=question`。真实 dynamic tag 本身仍按结构原样输出，不加反引号。

## 4. Shared `<brain_think_context>` 的完整结构

以下是当前设计结构。示例展示存在 reliable current session 且 recalled set 非空时的最大结构；没有可靠 session identity 时，整个 session scope/core 不渲染。具体英文允许在不改变语义和 ownership 的前提下微调；测试不锁整段自然语言。

```markdown
# User-Requested Working Context

## How to Use This Context

The latest user message defines what is being requested now. The following `<brain_think_context>` contains cognition the user asked Brain to keep available for this turn.

- Use applicable restored cognition directly when interpreting the request, choosing tools, acting, and answering. Do not treat it as optional background or reconstruct the same understanding from other sources alone.
- Combine the latest user message, applicable restored cognition, and relevant new information to form the current understanding.
- Keep each cognition's meaning and cognitive role. New information updates the cognition it actually addresses; it does not silently replace a different decision, intention, preference, constraint, commitment, fact, or method.

<brain_think_context>

## Continuity Scopes

- `@global` contains cognition that should continue across projects and sessions.
- `@project` contains cognition that should continue for the current project across sessions.
- `@session/<sid>` contains cognition that should continue only in the current reliable session.

## Resident Working Cognition

### Global Core

<core path="@global/core.md">
...verbatim global core Markdown...
</core>

Maintain this `<core>` with `brain_edit` when cross-project cognition that should remain visible in every applicable turn changes, such as stable user preferences, principles, or reusable working constraints.
When cognition no longer needs to remain resident but should still be preserved globally, write it under `@global/memories/<role>/...` before removing it from this `<core>`.

### Project Core

<core path="@project/core.md">
...verbatim project core Markdown...
</core>

Maintain this `<core>` with `brain_edit` when project-scoped cognition that should remain visible across this project's sessions changes, such as its active goals, established working agreements, constraints, or architectural direction.
When cognition no longer needs to remain resident but should still be preserved for this project, write it under `@project/memories/<role>/...` before removing it from this `<core>`.

### Session Core

<core path="@session/session-id/core.md">
...verbatim session core Markdown...
</core>

Maintain this `<core>` with `brain_edit` when session-scoped working cognition changes, including the active goal, current progress, commitments, unresolved work, or intended next step.
When cognition no longer needs to remain resident but should still be preserved for this session, write it under `@session/session-id/memories/<role>/...` before removing it from this `<core>`.

## Archival Cognition

Archival means that cognition is not resident in every turn. It does not mean stale, unimportant, uncertain, or lower authority.

### Cognitive Roles

#### Decision

A choice that has already been made. Continue from it unless a later decision replaces or cancels it. Do not turn an implementation result, completion state, proposal, or hypothesis into a decision.

#### Knowledge

A fact, rule, constraint, or understanding, including its conditions and uncertainty. Use it as a premise within its scope and update it when relevant evidence changes it. Do not overgeneralize it or turn a decision or reusable method into knowledge.

#### Intention

A goal or commitment that remains intended until fulfilled, cancelled, or replaced. Continue from its outcome, progress, blockers, and remaining work. Do not turn completion evidence or a proposal into an active intention.

#### Skill

A reusable method together with its trigger and prerequisites. Apply its procedure, checks, stopping conditions, and fallback when appropriate. Do not turn current facts, a one-time decision, progress, or result into a skill. An agent method is not automatically a product requirement.

## Recalled Archival Cognition Summaries

Use these summaries to identify saved cognition relevant to the current task. Preserve the decisions, facts, intentions, and constraints they express according to each cognition's role. A summary is not necessarily the complete cognition.

<recalled_cognition_summary path="@project/memories/decision/example.md">
...escaped current summary text...
</recalled_cognition_summary>

<recalled_cognition_summary path="@project/memories/knowledge/example.md" status="questioned">
...escaped current summary text...
</recalled_cognition_summary>

### Questioned Cognition

A `status="questioned"` marker applies only to that `<recalled_cognition_summary>`. Preserve and use what remains established, while treating the current challenge as unresolved.

### Read Content for Application

When applying a method or relying on a cognition's conditions, reasoning, or evidence, use `brain_cat` to obtain the needed content before proceeding. Simple cognition fully expressed by its summary can be used directly. Do not reread content already available in the current context.

### Find Cognition Not Shown Here

Use `brain_glob` or `brain_grep` when needed cognition is not present in this bounded recalled set.

## Preserving Cognition

Carry forward cognition that is formed or changed and should remain available beyond the current turn.

### Choose Where It Lives

- Put cognition in the narrowest continuity scope that matches where it should continue: global, project, or session.
- Put cognition in `core.md` when it should remain visible in every applicable turn.
- Otherwise preserve it as archival cognition under the matching cognitive role.
- A raw tool result, tool call, or completed turn is not by itself cognition to persist.
- If no cognition that should carry forward was formed or changed, do not mutate Brain.

## Maintaining Cognition

- If an existing document is still the correct owner of the same cognition, update it with `brain_edit` rather than creating a duplicate.
- “The same cognition” means the same fact or understanding, choice, commitment, or reusable method—not merely the same topic.
- Use `brain_write` for a new archival cognition or an intentional full overwrite that does not preserve the prior cognition's learning continuity.
- Use `brain_mv` when the same archival cognition moves to a different scope, role, or path while preserving identity and appropriate learning continuity.
- Use `brain_rm` only when an active archival cognition should no longer remain in Brain.

</brain_think_context>
```

## 5. Renderer details

### 5.1 Core

- Core body 保持原始 logical Markdown，不把正文塞进 attribute。
- 每个 applicable scope 恰有一个 concrete core document；它在该 scope 的每次 restore 中完整 resident，不参与 archival selection，也不需要先用 `brain_cat` 读取。
- body 必须出现在该 concrete core 的 maintain/archive 说明之前，避免说明和内容的 owner 混淆。
- `@global/core.md`、`@project/core.md`、`@session/<sid>/core.md` 各自保留完整的 scope-specific 描述和目标 path；不能只在父级给一条抽象规则，让模型自行拼接。
- 只有确实存在可靠 current session identity 时才渲染 session scope/core；不得发明、缩短、复用其他 session id。
- 空 core 仍渲染真实 concrete path，并可用短 `empty="true"` 表达；不能伪造正文。
- Core 转 archival 时先成功 `brain_write`，再用 `brain_edit` 从 core 删除，避免中间丢失 cognition。

### 5.2 Recalled cognition

- tag 名固定为 `recalled_cognition_summary`，不用 `memory_candidate_item`。
- `path` 是 canonical public path；role 和 continuity scope 已由 path 表达，不重复增加 `scope`、`role`、`layer` 等第二份 metadata owner。
- current summary 放在 tag body 中，而不是 `summary` attribute。
- summary 作为 XML text 时转义 `&`、`<`、`>`；path/status attribute 使用 attribute escaping。
- status 仅在存在 current status 时输出；questioned 不使整条 cognition 失效，只局部表达当前 unresolved challenge。
- recalled item 的顺序与 Brain 内部 passive L0 selection 顺序一致，但 model-facing presentation 不称其为 candidate，也不声称它已针对 current query 做 relevance ranking。
- passive recalled set 的数量和 rendered-byte bounds 完整继承 v3；v4 只改变其 model-facing presentation，不扩大注入量。未进入 bounded set 的 session archival 仍可通过 discovery/exact read 接管 transcript 中已被压缩或失去注意力的早期细节。
- bounded set 为空时，明确输出 `No archival cognition was recalled in this bounded set.`，而不是留下容易误解的空容器。

## 6. Codex attention overlay

Codex overlay 位于 shared `# User-Requested Working Context` 之前。当前源码中的 aggressive baseline 已经获得正向回放 evidence；以下 v4 草案保持其行为要求，只替换过时的 presentation 术语。替换后的版本尚未单独 Replay 验证，不能写成已验证结论：

```xml
<brain_think_instructions>
The user explicitly requires the following `<brain_think_context>` to be used as current context for this turn.
The latest user message defines the request. Treat every relevant `<core>` and `<recalled_cognition_summary>` item as already established working cognition, not as background, a search lead, or material that must first be reconstructed from project files.
You must let every relevant item materially determine your interpretation, tool choices, actions, and final answer according to its stated cognitive role. Follow the shared context's guidance for applying summaries and reading the cognition content needed for the current task.
Other evidence may add facts or update the cognition it directly addresses. It must not replace, downgrade, or cause you to omit a relevant decision, intention, preference, constraint, or commitment merely because files, commits, timestamps, or other sources are newer or silent.
Before completing the turn, ensure that your actions and answer reflect every relevant item.
</brain_think_instructions>
```

约束：

- overlay 不包住整个 `brain_think_context`；它只是前置 instruction block；
- 不在 overlay 中重复 shared role/scope/persistence policy；
- 不增加硬性的多阶段流程；
- 不要求模型再次调用 `brain_think`；
- hook 的 `session_id` 和 `cwd` 必须来自当前可信 invocation facts，调用同一个 production restore application。

## 7. Tool wording

本节记录已应用到共享 public Tool definitions 的 v4 wording。

### 7.1 `brain_think`

Model-visible description：

```text
Restore the user's Brain working context for the current turn. When available, call this tool exactly once immediately after each new user message, before substantive interpretation, planning, responding, or calling another tool. Use the returned `<brain_think_context>` as working cognition for the turn and follow its instructions. Do not call this tool again in the same turn.
```

这里使用 `this tool` 自指，不依赖宿主把工具显示成 `brain_think`。自动 restore host 隐藏该 Tool，因此这段只服务 generic/manual integration。

`session_id` parameter description：

```text
Optional exact current session identifier supplied by the host. Do not invent, shorten, derive, or reuse an identifier from another session. Omit it when no reliable current session identity is available.
```

### 7.2 `brain_absolute_path`

Model-visible description：

```text
Map a valid Brain workspace location to its absolute filesystem path for use with the host's filesystem, code, or data tools. Use this tool for cognition documents or supporting assets, including when an exact-read result directs you to filesystem recovery. It returns only the mapped path; the target does not need to exist, and this tool does not read or create it.
```

`path` parameter description：

```text
Brain workspace location to map. Use a scope root (`@global`, `@project`, or `@session/<sid>`), `<scope-root>/core.md`, `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or any safe descendant below one of those role roots, including non-`.md` supporting assets. Use forward slashes; traversal and scope-level internal paths are invalid.
```

该工具只是 Brain public workspace location 到 host filesystem/code/data capability 的窄桥接：

- target 可以不存在；
- supporting asset 可以不是 `.md`；
- tool 只映射 path，不读取或创建；
- 它的宽 location grammar 不扩大其他 cognition tools 的 object grammar；
- scope containment、traversal 和 hidden internal path 边界不变。

### 7.3 `brain_ls`

Model-visible description：

```text
List the direct children of one archival cognition directory. Use this tool when the directory is known and its immediate structure is needed. The bounded, non-pageable result contains subdirectories and cognition entries with public `path`, current `summary`, and `status` when present. If truncated, narrow `path`, or use `brain_glob` for path/name clues and `brain_grep` for content clues.
```

`path` parameter description：

```text
Archival cognition directory to list. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a directory this tool can list.
```

设计判断：

- `brain_ls` 是 model-initiated structural browse，不是每次 retrieval 必须先走的第一步。
- 已知 exact archival path 时可直接 exact read；有 path/name clue 时可直接 glob；有 content clue 时可直接 grep。
- `direct children` 是主要能力，必须明确写出“不递归”，避免模型把它当 subtree enumeration。
- result 说明真实返回字段即可，不把 summary 重复解释成待验证 search lead；summary 的使用方式由 shared `brain_think_context` 拥有。
- bounded output 由机制控制，模型没有 `limit`、offset 或 cursor；超额时 refine/switch primitive，而不是请求 page 2。
- 低 retrievability 不改变真实 directory membership；排序/packing 只在 output scarcity 时影响哪些真实 entry 能进入 bounded result。
- 合法空结果继续明确返回 `no archival cognition entries`；它不是 error。
- 本轮不改变 direct-child truth、ordering、budget、truncation、empty-result、error code 或 Tool 参数集合，只调整 Tool/parameter description。

### 7.4 `brain_glob`

Model-visible description：

```text
Find active archival cognition documents by matching a glob against their complete public paths. Use this tool when a scope, cognitive role, directory, or filename clue is known but the exact path is not. The bounded, non-pageable result contains public `path`, current `summary`, and `status` when present. If truncated, narrow `pattern` or `path` and search again.
```

`pattern` parameter description：

```text
Non-empty glob matched against each candidate document's complete canonical public path, including its scope root and `.md` filename. Familiar operators include `*`, `**`, `?`, and character classes such as `[ab]`. For example, use `**/*.md` for all candidate documents, `**/testing-*.md` for matching filenames at any depth, or `@project/memories/decision/**/*.md` for a path-shaped subset. Use forward slashes. Only active archival cognition documents are candidates; directories, `core.md`, and arbitrary workspace files are not matched.
```

`path` parameter description：

```text
Optional archival cognition directory used to narrow candidates before `pattern` is matched against their complete public paths. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Omit `path` to search all applicable memories trees. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a search root for this tool.
```

设计判断：

- `brain_glob` 是 model-initiated path discovery：适合已有 scope、role、directory、filename 等 path clue，但还不知道 concrete archival path 的情况。
- glob truth 只由 active archival cognition 的 complete canonical public path 与 `pattern` 决定；`path` 先限定 candidate set，不把 `pattern` 改成相对于该 directory 的 glob。
- 顶层说明直接区分 `brain_glob` 与 `brain_grep`：前者查 path shape，后者查 document content；不把 glob 描述成模糊的通用 search。
- result 只声称真实返回的 public path、current summary 与 optional questioned status；summary 如何参与 cognition workflow 仍由 shared `brain_think_context` 统一说明。
- omitted `path` 仍联合搜索当前 applicable 且 materialized 的 global、project，以及存在可靠 session identity 时的 current session memories trees；不会初始化缺失的 session scope。
- low retrievability 或 questioned status 不改变 true glob match；只有结果超出固定预算时，scarcity ranking 才影响哪些 true matches 进入 bounded output。
- 合法空结果继续明确返回 `no matching archival cognition paths`；它不是 error。无效 glob 继续返回 `invalid-glob`，并指引修正 pattern 后重试。
- bounded result 没有 model-controlled `limit`、offset、cursor 或 page 2；截断后只 refine `pattern` / `path` 并重新搜索。
- 本轮不改变 glob grammar、candidate membership、full-path matching、ordering、budget、truncation、empty-result、error code 或 Tool 参数集合，只调整 Tool/parameter description。

### 7.5 `brain_grep`

Model-visible description：

```text
Search active archival cognition Markdown content for matching lines. Use this tool when words or text patterns are known but the exact document path is not. The bounded, non-pageable result groups matches by document and includes public `path`, current `summary`, `status` when present, and 1-based matching/context line excerpts. If truncated, narrow `pattern`, `path`, or `glob` and search again.
```

`pattern` parameter description：

```text
Search expression applied to archival Markdown document content. It is parsed as a regular expression by default; set `literal=true` when its characters should be searched as ordinary text instead of regex syntax. Matching is case-sensitive unless `ignoreCase=true`. An invalid regular expression is an input error, not a successful search with no matches.
```

`path` parameter description：

```text
Optional archival cognition directory used as the content-search root. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Omit `path` to search all applicable memories trees. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a search root for this tool.
```

`glob` parameter description：

```text
Optional file glob relative to each selected search root. Use it to filter which archival Markdown documents are searched; unlike `brain_glob`'s `pattern`, it is not matched against complete canonical public paths. Omit it to search all archival `.md` documents below each selected root. Use forward slashes.
```

`ignoreCase` parameter description：

```text
When `true`, match text without distinguishing uppercase and lowercase. Omit or set `false` for case-sensitive matching.
```

`literal` parameter description：

```text
When `true`, treat `pattern` characters as ordinary text rather than regular-expression syntax. Omit or set `false` to use regular-expression matching.
```

`context` parameter description：

```text
Non-negative integer number of surrounding logical document line excerpts to include before and after each matching line. Omit or use `0` to return matching-line excerpts without surrounding lines.
```

设计判断：

- `brain_grep` 是 model-initiated content discovery：适合已有 word、phrase 或 regex clue，但还不知道 concrete archival path 的情况；它不是 path/name search 的模糊别名。
- `pattern` 只对 archival Markdown 的真实 content 产生 match；document summary 会随真实 match 一起返回，但 summary 本身不能凭空生成一条不存在的 content match。
- `path` 选择 search root；`glob` 再以该 root 为相对坐标过滤被搜索的 `.md` documents；这与 `brain_glob.pattern` 的 complete canonical public-path coordinate 明确不同。
- omitted `path` 仍分别搜索当前 applicable 且 materialized 的 global、project，以及存在可靠 session identity 时的 current session memories trees；不会初始化缺失的 session scope。
- result 按 canonical archival identity 分组并去重，恢复 current summary、optional questioned status、真实 matching logical-line excerpt，以及 `context` 请求的前后 logical-line excerpts；过长 excerpt 会明确标记 clipping，line number 与 `brain_cat` 使用相同的 1-based document coordinate。
- regex 是 default，`literal=true` 才把 metacharacters 当普通文本；invalid regex 是 `invalid-regex` input error，并继续指引修正 expression 或在确实要搜索普通文本时使用 `literal=true`。
- 当前 public schema 不要求 `pattern` 非空，本轮不借 wording 增加新的 validation rule。
- low retrievability 或 questioned status 不改变真实 content match；只有结果超出固定预算时，scarcity ranking 才影响哪些真实 matching documents 优先进入 bounded output。
- 合法空结果继续明确返回 `no matching archival cognition content`；它不是 error。仅展示 grep result 不构成 exact retrieval，也不修改 accessibility learning state。
- bounded result 没有 model-controlled `limit`、offset、cursor、`next_offset` 或 page 2；截断后只 refine `pattern` / `path` / `glob` 并重新搜索。
- 本轮不改变 regex/literal/case behavior、relative file-glob coordinate、candidate corpus、line coordinate、ordering、budget、truncation、empty-result、error code 或 Tool 参数集合，只调整 Tool/parameter description。

### 7.6 `brain_cat`

Model-visible description：

```text
Read one concrete active archival cognition Markdown document to obtain the method, conditions, reasoning, or evidence needed for the current task beyond its recalled or discovered summary. The bounded result uses stable 1-based logical lines and includes current `status` and unresolved challenge when present. Continue from `next_offset` when returned. An oversized line is returned as a marked excerpt with instructions for reading the complete file.
```

`path` parameter description：

```text
Concrete active archival cognition Markdown document to read. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. This tool does not read `core.md` because applicable core content is already resident in `<brain_think_context>` and is maintained with `brain_edit`. A bare scope, directory, or non-`.md` path is not a readable cognition document for this tool.
```

`offset` parameter description：

```text
Positive 1-based logical document line at which reading begins. Omit it to start at line `1`. To continue a bounded read, pass the exact `next_offset` returned by the preceding result. An `offset` beyond the end of the document returns no lines and no continuation.
```

`limit` parameter description：

```text
Positive integer maximum number of logical document lines to return. Omit it to use the tool default. The transport budget may return fewer lines than this `limit`. A line that fits is returned in full; an oversized line is returned as a marked excerpt and does not prevent later lines from being read.
```

设计判断：

- `brain_cat` 是 concrete archival document read，不是默认 retrieval pipeline；普通结果返回 exact complete lines，只有明确标记的 oversized-line excerpt 是例外。应用方法或依赖条件、依据时获取所需正文；摘要已完整表达简单认知，或当前 context 已有所需内容时不重复读取。
- readable object 只包含 active archival cognition `.md` document。Applicable core 已完整 resident，不通过此 Tool 重读；core 的 maintenance 仍由 `brain_edit` 负责。
- 读取坐标覆盖统一的 archival Markdown document，包括 frontmatter 与 body；没有“summary 占特殊 offset、body 使用另一套坐标”的私有协议。
- `offset`、`limit`、rendered line number、`brain_grep` line number 与 `next_offset` 共享同一套稳定的 1-based logical-document coordinate；文档未变时，普通 continuation 不得跳过或重复稳定内容。Oversized-line remainder 是明确标记并提供恢复路径的例外，不伪装成已完整返回。
- 普通 bounded partial read 只在确有未返回 logical lines 时输出 `next_offset` 与 `continue_with`；此时 `next_offset` 指向下一条尚未返回的 line。
- EOF、空 document view、offset 超出 EOF 时不输出 continuation，也不把零内容读取记为 exact retrieval。
- 如果某条 logical line 本身超过 transport budget，返回其有用前缀作为明确标记的 truncated excerpt，而不是返回空内容。结果就地标明 line number、已展示 prefix 的 UTF-8 bytes 和完整 line 的 UTF-8 bytes，并指向 `brain_absolute_path` 与 host filesystem read capability，以便需要时读取完整文件。
- Oversized-line excerpt 明确承认该 line 的 remainder 没有通过本 Tool 返回；若 document 还有后续 lines，`next_offset` 指向下一条 logical line，使该异常行不会阻塞其余 document。这里不新增 byte/column continuation 参数。
- 返回 archival document content 后继续沿用现有 best-effort accessibility/exact-retrieval transition；marked oversized-line excerpt 不新增另一种 learning state，零内容结果仍不触发该 transition。Read 不等于 validated successful use，不产生 `adopt`；辅助 learning 写入失败也不能反转已经成功的 read。
- alias target 按 canonical archival identity 读取并返回 canonical public path；alias 若解析为 core 或其他错误 object kind，不能伪装成 archival read。
- invalid `offset` / `limit` 继续分别返回 `invalid-offset` / `invalid-limit` 与直接修正动作；path/object-kind error 继续说明本 Tool 只读取 concrete archival `.md` cognition。
- 本节明确重开且只重开 oversized-line presentation：由“空结果并阻塞在该 line”改为“marked prefix excerpt + complete-file recovery + 可继续后续 line”。不新增 public 参数，也不改变 exact-read membership、canonicalization、logical-line coordinate、default limit、transport budget、普通 continuation、learning side effect 或 error code。

### 7.7 `brain_write`

Model-visible description：

```text
Create a new archival cognition at a concrete path, or intentionally replace the cognition already at that path with a different cognition. Use `brain_edit` when revising the same existing cognition, including a complete-document revision. A replacement does not inherit the previous cognition's unresolved challenge or learning continuity. This tool does not write `core.md`; `content` is one complete archival Markdown document.
```

`path` parameter description：

```text
Concrete archival cognition path to create or replace. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. The scope root selects where the cognition continues, and the role directory records its cognitive role. Use forward slashes. `core.md`, bare scopes, directories, and non-`.md` paths are invalid.
```

`content` parameter description：

```text
Complete archival Markdown document.

Required YAML frontmatter:

---
summary: <non-empty current gist>
importance: low | medium | high | critical
---

`summary` supports bounded recall and active discovery. State the cognition's current meaning and when it applies; when useful, indicate which procedures, conditions, or evidence the body provides. Preserve its cognitive role and key qualifications so the summary is not misleading. Keep it consistent with the document. The body may be empty when the summary expresses the complete cognition.

`importance` is the reasonably expected consequence if this cognition applies but is not recalled, considering how recoverable the omission would be:

- low: little material effect and easy recovery.
- medium: meaningful but usually recoverable rework or worse judgment.
- high: a material change to an important result, or significant cost, harm, or rework.
- critical: a severe, irreversible, or otherwise unacceptable consequence.

Choose the reasonably expected consequence, not a remote worst case. `importance` does not mean recency, frequency, continuity scope, confidence, retrievability, or relevance to the current request.
```

设计判断：

- `brain_write` 的 semantic action 是建立一条新的 archival cognition：目标不存在时是 create；目标已存在时是 deliberate replacement。它不是维护同一 cognition 的另一种写法。
- `brain_edit` 的 `content` mode 已能完整重写同一 existing cognition，因此是否“整篇替换文本”不能作为选择 write 的依据；选择依据是 cognition identity 是否延续。
- overwrite 使用 fresh cognition state。旧 cognition 的 unresolved challenge、retrieval/accessibility learning 与其他 identity continuity 不附着到 replacement；runtime 不根据 path 相同、文本相似或文本相同暗自推断 continuity。
- 即使提交的 document text 与现有 text 相同，只要目标已存在，本 Tool 的 public action 仍是 `overwrote`，并兑现 replacement 所要求的 fresh state；它不能被模型当成无害的 same-cognition no-op。
- `path` 只接受 concrete archival `.md` cognition。Continuity scope 与 cognitive role 继续由 path 表达；详细 role/scope 选择规则由 shared `brain_think_context` 拥有，不在本 Tool 重复一套。
- Applicable core 已 resident，且 core 的同一认知维护由 `brain_edit` 完成；`brain_write` 不创建、覆盖或初始化 `core.md`。
- `content` 是 complete document，不是 patch。Runtime 在任何 create/overwrite side effect 之前完成 newline normalization 与完整 archival contract validation。
- `summary` 同时表达当前认知要点、适用场景与必要的正文线索；保持 decision/knowledge/intention/skill 的角色和关键限定，不把它改成只有触发词的索引。body 承载流程、条件和依据，简单认知完整表达时允许为空。
- `importance` 只表达 cognition 适用却未被 recall 时的合理预期遗漏后果与可恢复性。四档定义保留完整，但用分层文本呈现；不再把结构、summary、body、importance 定义压成一个长段落。
- 普通 Markdown body 与额外 frontmatter 继续按 v3 contract 被保留，但不会因此获得新的 Brain mechanism semantics；model-facing description 只教必需格式和 Brain 实际消费的 metadata，不邀请创建无作用字段。
- 成功结果继续使用 `created <canonical-path>` 或 `overwrote <canonical-path>`，直接报告实际 identity action。缺失/无效 frontmatter、summary 或 importance 继续在 mutation 前失败，并给出提交完整有效 archival document 的修正方向。
- 本轮不改变 create/overwrite 判定、fresh-state constructor、alias canonicalization、session create-intent initialization、atomic semantic operation、normalization、frontmatter parser、成功 action、error code 或 Tool 参数集合；只调整 Tool/parameter description 的表达结构与精确度。

### 7.8 `brain_edit`

Model-visible description：

```text
Update one existing core or archival cognition document while preserving its cognition identity. Provide exactly one of `edits` or `content`; both modes preserve an archival target's current unresolved challenge and appropriate learning continuity. For `core.md`, use the complete content already resident in `<brain_think_context>` rather than calling `brain_cat`. This tool does not create missing documents; use `brain_write` for a new archival cognition.
```

`path` parameter description：

```text
Concrete existing cognition document to update. Use `<scope-root>/core.md` or `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. A bare scope, directory, non-`.md` archival path, or missing document is not an editable target.
```

`edits` parameter description：

```text
Non-empty list of exact targeted replacements. Form each `oldText` from the current exact document content, not from a recalled or discovered `summary`. Every `edits[].oldText` is matched against the same original document before any replacement is applied; no edit sees another edit's `newText`. Each `oldText` must identify one unique region, and the matched regions must not overlap. If any replacement is invalid, none are applied. When changing archival meaning or applicability, update `summary` in the same edit so it preserves the cognitive role, key qualifications, and useful body-reading cues. Use `content` instead when supplying the complete resulting document is clearer than a set of targeted replacements.
```

`edits[].oldText` parameter description：

```text
Non-empty exact text from the original current document to replace. It must occur exactly once. Matching is literal, including spaces and line breaks; `oldText` is not trimmed or fuzzy-matched. Include enough surrounding text to identify one unique region.
```

`edits[].newText` parameter description：

```text
Replacement text for the matched region. It may contain Markdown and line breaks. Use `""` to delete the matched text.
```

`content` parameter description：

```text
Complete resulting Markdown for the same existing cognition document. Use this mode when revising or reorganizing the document as a whole; it still preserves the cognition's identity.

For `core.md`, provide the complete resulting core Markdown. Core does not use archival `summary`/`importance` frontmatter.

For an archival cognition, provide the complete resulting archival document with YAML frontmatter containing a non-empty `summary` and `importance` set to `low`, `medium`, `high`, or `critical`. Keep `summary` consistent with the resulting cognition, including its meaning, applicability, key qualifications, and useful body-reading cues. `importance` remains the reasonably expected consequence if this cognition applies but is not recalled; change it only when that omission consequence changes.
```

设计判断：

- `brain_edit` 的 semantic action 是 existing persistent owner 中的 same cognition evolves，可用于 correction、refinement、extension、pruning 或 complete rewrite。Identity 由 operation 表达，不由 diff 大小、文本相似度或是否使用 `content` 猜测。
- `edits` 与 `content` 是互斥的文本更新 mode，不是两套 cognition semantics。Both/neither 继续失败为 `edit-mode`；`edits=[]` 继续失败为 `empty-edits`。
- `edits` 中每个 `oldText` 都针对同一个 original normalized logical document 做 exact match；任何前一项的 `newText` 都不能改变后一项的 match identity。所有 match 与 non-overlap validation 通过后才原子形成完整 resulting document。
- `oldText` 不 trim、不做 fuzzy match，也不采用 public character-offset protocol；missing、non-unique 或 overlapping region 分别保持现有明确 error 与修正 affordance。`newText=""` 是合法 deletion。
- `content` 是 complete resulting document，不是 `brain_write` replacement cognition。即使全文改变，existing archival cognition 的 epistemic state 与 appropriate accessibility learning continuity 仍随同一 identity 延续。
- Archival document 实际改变时保留现有 unresolved challenge，并执行现有 direct-engagement accessibility transition；edit 本身不表示 validated successful use，不增加 durability，也不自动 question 或 resolve cognition。
- Archival resulting document 必须重新通过完整 archival contract；`summary` 必须反映 resulting cognition，`importance` 只有遗漏后果本身变化时才修改。这里不重复四档完整定义，因为同一字段的 canonical formation semantics 已在 `brain_write.content` 紧邻给出，本参数仍明确了 edit 时最容易出错的 maintenance rule。
- Core target 使用 current `brain_think_context` 中已经完整 resident 的 concrete core content直接维护，不需要也不能先用 `brain_cat` 读取。Core replacement 是普通 complete core Markdown，不使用 archival metadata，并继续受既有 core capacity validation 约束。
- 本 Tool 只更新 existing document，不 lazy-create cognition 或 scope。Missing core/archival target 继续是 not-found；新 archival cognition 使用 `brain_write`。
- Resulting normalized text 与 current text 相同时返回 `no changes: <canonical-path>`，不产生 Markdown mutation、epistemic change 或 accessibility-learning event；实际改变时返回 `edited <canonical-path>`。
- Alias 继续按 canonical existing identity 解析，success path 使用 canonical target。任一 mode、exact-match、document-contract、capacity、path 或 existence failure 都在 semantic mutation 前失败，不产生 partial edit。
- 本轮不改变 edit identity、mode XOR、exact-match algorithm、atomicity、normalization、core capacity、archival parsing、challenge continuity、direct-engagement transition、no-change behavior、success wording、error code 或 Tool 参数集合；只调整 Tool/parameter description 的表达结构与精确度。

### 7.9 `brain_rm`

Model-visible description：

```text
Remove one existing active archival cognition from Brain. After success, it no longer participates in working-context restore, archival discovery, or exact archival read. This tool removes only one concrete archival `.md` document; it does not remove `core.md`, directories, or supporting assets.
```

`path` parameter description：

```text
Concrete existing active archival cognition to remove. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. `core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid targets.
```

设计判断：

- `brain_rm` 表达一条 current active archival cognition 退出 Brain，而不是泛化 filesystem deletion。成功后该 cognition 不再进入 working-context restore、`brain_ls`、`brain_glob`、`brain_grep` 或 normal `brain_cat` active flow。
- Target 必须是一条 concrete、existing、active archival `.md` cognition。一次调用只移除这一条 cognition；不接受 scope、directory、glob、core 或 supporting asset，因此不存在隐式 recursive/bulk removal。
- Core 是每个 materialized scope 的 resident cognition owner，通过 `brain_edit` 维护；`brain_rm` 不删除 core，也不删除或回收整个 scope。移除最后一条 archival cognition 后，scope 与 core 仍然存在。
- Active archival Markdown 的删除属于本 Tool 的 required semantic mutation。其 companion state cleanup 是 best-effort auxiliary cleanup；即使 cleanup 暂时失败，也不能让已删除的 cognition 继续保持 active。
- `brain_rm` 不先制造 direct-engagement、adopt、question、resolve 或其他 learning/epistemic transition；要移除的 cognition 直接退出 active state。
- Missing target 或错误 object kind 在 semantic deletion 前失败，不产生部分删除。Core target 的 error guidance 继续指向使用 `brain_edit` 维护 core；directory/object-kind guidance 不建议使用隐藏的 recursive 参数。
- Alias 继续解析到 canonical existing identity；alias 指向 archival 时移除 canonical cognition 并返回 canonical path，alias 指向 core 或 scope 外部时失败。
- 成功结果继续是 `removed <canonical-path>`，只报告已经成立的 active removal。它不返回 hidden tombstone、recycle location、internal state 或 Git detail。
- Brain 不为 rm 创建第二套 tombstone/recycle/deletion-history store。已有 Git checkpoint 仍可作为辅助历史依据，但 current removal 的成立既不等待 Git，也不需要在 model-facing Tool description 中制造额外恢复流程。
- 本轮不改变 active-removal semantics、existing-target requirement、object-kind boundary、canonicalization、atomic deletion、companion cleanup locality、Git auxiliary boundary、success wording、error code 或 Tool 参数集合；只调整 Tool/parameter description。

### 7.10 `brain_mv`

Model-visible description：

```text
Move one existing archival cognition to a different concrete archival path while preserving its identity, current unresolved challenge, and appropriate learning continuity. Use this tool when the same cognition should continue at a different relative path, continuity scope, or cognitive role. Its document content is not rewritten. If `dst` already contains another cognition, that destination cognition is replaced, not merged. This tool does not move `core.md`, directories, or supporting assets.
```

`src` parameter description：

```text
Concrete existing active archival cognition to move. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. `core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid sources.
```

`dst` parameter description：

```text
Different concrete archival cognition path where `src` will continue. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. The destination may use a different continuity scope, cognitive role, or relative path. It need not exist; if it already contains another cognition, that cognition is replaced. `dst` must resolve to a different canonical address from `src`. Use forward slashes. `core.md`, bare scopes, directories, and non-`.md` paths are invalid destinations.
```

设计判断：

- `brain_mv` 的 semantic action 是 same archival cognition changes address。Moved cognition 的 Markdown、epistemic state、unresolved challenge 与 appropriate accessibility learning continuity 随 identity 到达 destination；它不是 remove + fresh write。
- Address 可只改变 relative path，也可改变 continuity scope、cognitive role，或同时改变三者。Scope/role 的具体含义继续由 shared `brain_think_context` 中的 namespace 与 role guidance 拥有；本 Tool 只明确 move 可以落实已经作出的 relocation/reclassification 判断。
- Move 不自动重写 document。Cognitive role 由 destination path 表达，但 path 变化本身不生成新的正文、summary、type metadata、事实依据或 authority；需要修改同一 cognition 内容时另用 `brain_edit`。
- Source 必须是 existing active archival cognition；destination 是另一个 concrete archival address，可以尚不存在。Src/dst 在 canonical resolution 后相同则失败为 `same-source-destination`，不产生伪 move 或 direct-engagement event。
- Destination 已存在 cognition B 时，source cognition A 完整替换 B，A 的 identity/challenge/learning 到达 destination；B 的 document、challenge 或 learning state 不与 A 合并，也不污染 A。成功结果必须明确 `replaced existing destination`。
- Same-scope move 保留 source age/durability 并应用现有 direct-engagement transition。Cross-scope move 将同一 age/durability 重基准化到 target scope cycle，并重置 exposure；不 fresh-reset cognition，也不按 scope 权重修改 learning。
- Cross-scope destination 若是尚未 materialize 的 valid session scope，所需空 session core initialization 与 move 处于同一 semantic operation。Move 不删除 source scope/core，也不清理空 parent directories。
- Required move plan 先使 destination Markdown 及其 source-derived companion state 成立，再删除 source Markdown；destination old state 不得重新附着。Source companion deletion 仍是 best-effort orphan cleanup，不反转已成立的 move。
- Core↔archival 不是 address move：core 是聚合 resident document，archival 是独立 cognition。Core 与 archival 之间的 semantic extraction/incorporation 继续使用 `brain_write` 与 `brain_edit`，不伪装成 `brain_mv`。
- 成功结果继续为 `moved <canonical-src> -> <canonical-dst>`；只在 destination 原先存在 active cognition 时追加 `; replaced existing destination`。Source 不存在、错误 object kind、same canonical path 或无效 destination 都在 mutation 前失败。
- Move 与 destination replacement 的 current semantics 不等待 Git checkpoint，也不要求 model-visible confirmation/rationale。已有 Git history 只是辅助历史，不进入 Tool description 或 success contract。
- 本轮不改变 same-cognition identity、document preservation、challenge continuity、same/cross-scope accessibility transition、destination replacement、session initialization、puts-before-delete operation、canonicalization、success wording、error code 或 Tool 参数集合；只调整 Tool/parameter description。

### 7.11 `brain_feedback`

Model-visible description：

```text
Record validated successful use or maintain the current unresolved challenge for one existing active archival cognition. Choose `adopt`, `question`, or `resolve` according to the `feedback` definitions. This tool changes only learning or challenge state; it does not edit the cognition document, `summary`, `importance`, `path`, continuity scope, or cognitive role.
```

`path` parameter description：

```text
Concrete existing active archival cognition to receive feedback. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. `core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid targets.
```

`feedback` parameter description：

```text
Choose one feedback event:

- `adopt`: Record validated successful use only after this cognition actually guided a decision or action and the observed outcome supports its continued validity. Reading, recalling, mentioning, agreeing with, or planning to use it is not enough. `adopt` preserves any current unresolved challenge and does not change `importance`.
- `question`: Set or replace the complete current unresolved material challenge. Use it when the cognition's stored meaning, basis, conditions, certainty, or commitment is materially challenged and the issue remains unresolved. `challenge` is required and must be non-empty.
- `resolve`: Clear an existing current challenge after that challenge has been resolved. It is valid only when a current unresolved challenge exists. If resolving the challenge changes the stored cognition, update the document first with `brain_edit`, then resolve it. `resolve` does not record validated successful use.
```

`challenge` parameter description：

```text
For `feedback=question`, the required complete non-empty description of what is currently challenged and what remains unresolved. Leading and trailing whitespace is removed. This value replaces the previous current challenge; it does not append a challenge history. Omit it for `adopt` and `resolve`; if supplied with either, it is ignored.
```

设计判断：

- `brain_feedback` 只接受 existing active archival cognition，并只维护该 cognition 的 explicit epistemic/accessibility companion state。它不修改 C1 Markdown、`summary`、`importance`、public path、continuity scope 或 cognitive role。
- `adopt` 的真实含义是 validated successful use，不是 read、recall、agreement、positive sentiment、planned use 或一般“认为它不错”。Cognition 必须已经实际指导 decision/action，并且 observed outcome 支持其继续有效。
- Adopt 应用现有 validated-use transition：durability 增加一次，age 在 current scope cycle 重置，exposure 清零；current challenge 保持不变。因此 questioned cognition 可以获得一条独立的 successful-use evidence，但不会因 adopt 自动恢复 active。
- `question` 表达 cognition 自身的 meaning/basis/conditions/certainty/commitment 遭到 material challenge，且问题当前仍 unresolved；一次 unrelated action failure 本身不构成 question。
- `challenge` 是 complete current unresolved challenge 的单一 current representation，不是 issue log。Runtime trim 后要求 non-empty；repeated question 用新值 replace 旧值，不 append history。Question 保持 age/durability，只将 exposure 清零。
- Repeated question 只有在 resulting challenge 与 accessibility state 都未变化时才返回 no-change；此时 public result 是 `current challenge unchanged for <canonical-path>`。如果 challenge text 相同但 direct-engagement transition仍改变 exposure，则仍产生真实 state change 并返回 `questioned <canonical-path>`。
- `resolve` 只表示 existing current challenge 已解决并将其清除，使 derived status 回到 active。没有 current challenge 时失败为 `no-current-challenge`；resolve 保持 age/durability、清零 exposure，不记录 validated use，也不降低 importance。
- Challenge 的解决可能来自重新确认原 cognition，也可能来自修正 cognition；`resolve` 不猜是哪一种。若 stored meaning 需要改变，先用 `brain_edit` 形成正确 document，再调用 resolve 清除 challenge，保持两个 semantic operations 各自准确。
- Frozen public signature 继续允许 `challenge` 随 adopt/resolve 出现，但 runtime 不消费、不持久化，也不把它变成 rationale/audit metadata。Model-facing 参数说明直接建议在这两种 feedback 下省略。
- 每次 explicit feedback 所要求的 resulting companion state 属于 required semantic mutation；持久化失败则该 feedback 失败，不能返回 success 后依靠 fresh fallback 丢失已承诺的 transition。
- Alias 继续解析到 canonical existing archival identity，结果使用 canonical path；alias 指向 core、missing target 或错误 object kind 时在 feedback mutation 前失败。
- 成功结果保持执行事实：adopt → `recorded validated use for <canonical-path>`；changed question → `questioned <canonical-path>`；resolve → `resolved <canonical-path>`。结果不暴露 challenge history、durability、age、exposure、internal state 或 Git detail。
- `question` 缺少 challenge 继续失败为 `question-challenge-required`，空或全空白继续失败为 `empty-challenge`；两者都直接说明需要 non-empty complete current unresolved challenge。Resolve 无 current challenge 继续给出对应修正说明。
- 本轮不恢复旧 `attribute` event，不把 feedback 塞回 `brain_edit`，不新增 negative score、reason、history 或 confirmation 参数，也不改变 feedback enum、challenge frozen behavior、C2/D1 transitions、no-change condition、success wording、error code 或 Tool 参数集合；只调整 Tool/parameter description。

## 8. Tool wording 逐项审阅状态

11 个 public Tool 的目标 description 与 parameter description 已全部在本节逐项审阅：

- restore：`brain_think`；
- workspace mapping：`brain_absolute_path`；
- discovery：`brain_ls`、`brain_glob`、`brain_grep`；
- exact read：`brain_cat`；
- maintenance：`brain_write`、`brain_edit`、`brain_rm`、`brain_mv`、`brain_feedback`。

源码实现仍遵循：能力、使用时机与主要结果放 Tool description；参数合法域放 parameter description；shared cognition workflow 不在每个 Tool 重复；确定性测试不锁死自然语言原文。

横向长度审计的结论不是把所有 description 压成同一长度。`brain_ls`、`brain_glob`、`brain_grep`、`brain_cat` 和 `brain_edit` 的顶层说明已经移除可由参数 schema 独立承担的重复细节；`brain_mv` 仍需同时说明 identity continuity、scope/role relocation、document preservation 和 destination replacement，因为缺少任一项都会改变调用决策。`brain_write.content` 与 `brain_feedback.feedback` 较长是其参数本身拥有完整 metadata/enum contract，不应为了表面简短重新藏回 shared prompt 或要求模型猜测。

与当前 Codex Desktop 可见 Tool contract 的横向结构相比，这 11 个顶层 description 都保持为一个短段落：简单能力使用三至四句，只有确实存在多个会改变调用选择的 mutation semantics 时使用五句。较长内容主要留在拥有合法域的 parameter schema，例如 path grammar、archival frontmatter 和 feedback enum branches。这里不设字符数门槛；如果删去一句会迫使模型猜测输入合法域、identity action 或 destructive replacement，该句就不属于可删除的冗余。

## 9. 验证原则

确定性测试验证行为和结构，不测试自然语言原文：

- public tool surface 和参数集合不因 wording 调整而变化；
- 每个 Tool/parameter description 均非空并随 shared definitions 进入 generic/DSH adapter，但不对完整句子、段落顺序或同义措辞做 snapshot；
- generic/manual integration 暴露 `brain_think`，Codex mechanical restore 隐藏它；
- stable guidance 使用 Markdown hierarchy；
- shared renderer 的 dynamic tag 只有 `<brain_think_context>`、`<core>`、`<recalled_cognition_summary>`；Codex 的静态 attention overlay 另用 `<brain_think_instructions>` 界定；
- tag/attribute 的 `path`、`status`、`empty` 和 escaping 正确；
- 每个 concrete core 的 scope-specific maintain/archive ownership 完整；
- recalled summary 在 tag body 中，questioned status 不改变 cognition text；
- Codex overlay 的注入位置正确，并且不复制 shared semantics；
- explicit restore 与 hook restore 使用同一个 Brain restore result；host overlay 只增加前缀，不改写 shared result；
- `brain_absolute_path` 继续接受 scope/core/memories/role/descendant/supporting-asset location，并且只映射 absolute path，不要求 target 存在或扩大其他 Tool 的 object domain；
- `brain_ls` 只列 direct children；`brain_glob` 对 complete canonical public path 匹配；`brain_grep.glob` 继续相对于 selected search root 过滤 content corpus；三者无 model-controlled pagination，合法空结果为明确非错误文本；
- `brain_cat` 的 path、1-based logical-line coordinate、normal continuation 与 status/challenge presentation 保持稳定；普通 line 完整返回，oversized line 返回 marked prefix excerpt、byte extent 和 full-file recovery，且不会阻塞后续 logical lines；
- `brain_write` create/overwrite 都建立 new cognition semantics；overwrite fresh-reset 旧 cognition 的 challenge/learning，而 `brain_edit` 的 exact/content 两种 mode 都继续维护 same cognition identity；
- `brain_edit` exact replacements 全部针对同一 original document，missing/non-unique/overlap 原子失败；same-content edit 返回 no changes 且不产生 learning event；core/archival resulting document 分别通过各自 contract；
- `brain_rm` 只移除 one existing active archival cognition；core/scope/directory/supporting asset 不受影响，companion cleanup failure 不使 cognition 重新 active；
- `brain_mv` 保留 source identity/document/challenge/appropriate learning，canonical same-path 失败；destination existing 时被 source replacement 并在结果中明确报告；core↔archival 不按 move 处理；
- `brain_feedback` 的 adopt/question/resolve 保持各自前置条件与 C2/D1 transition；question challenge trim 后 non-empty 且 replace current value，resolve 要求 existing challenge；三者都不修改 document/summary/importance/path/scope/role；
- mutation success/result 与 caller-correctable error 继续检查 stable action/code/affordance marker，例如 `created`、`overwrote`、`no changes:`、`replaced existing destination`、`recorded validated use`、`current challenge unchanged`、`literal=true`、`next_offset` 和 `brain_absolute_path`，不以完整英文句子作为 oracle。

测试不得：

- snapshot 整段英文；
- 逐字锁定长说明；
- 用关键词存在代替真实 semantic evaluation；
- 因测试方便重新引入 static XML container 或重复 metadata owner。

本次摘要调整的模型行为由用户人工验收，不新增模型行为评估套件。以下场景供人工观察：

- latest user message 改变当前 request，但未影响的 decision/constraint 继续生效；
- 磁盘实现状态更新某个事实，但不抹掉 distinct intention 或 workflow decision；
- intention 不被当成 implementation 已完成的证据；
- recalled summary 足够时直接使用，不机械调用 `brain_cat`；
- summary 不足时能选择 exact read；未召回所需 cognition 时能主动 search；
- 模型不会因为 `archival`、持久化时间、文件时间戳或 context placement 自动把 cognition 整体降档；
- transcript 中早期 session detail 已被压缩或失去注意力时，session core 能恢复当前目标/进度，session archival 能按需找回早期相关细节，而不要求用户重述；
- 以 Brain enabled 与 transcript-only/host-context control 做可比对照，观察 continuity、重复纠正、既定约束恢复和额外 context/tool 成本，而不是只看单次回答是否流畅。

## 10. 明确不做

- 不改变 11 个 logical Tool 名称或参数名称；
- 不改变 Brain namespace、scope、cognitive roles、storage、selection、learning、mutation、coordination 或 Git 模型；
- 不把 Codex overlay 复制到 DSH；
- 不把整个 shared context 包进 instruction tag；
- 不新增第二次 model-driven restore；
- 不靠 block、后台 hook 风险规避或其他流程性强制替代语义表达；
- 不把 Brain 提升到 user message 或 governing instruction 之上；
- 不因“可能过期”给所有 cognition 反复附加适用性/验证性防御；
- 不把磁盘、时间戳、context placement 或 persistence 本身当作 authority；
- 不为了制造“更新”观感而注入 current timestamp；时间只按各 cognition 所描述的 claim 判断；
- 不把新 user event、一次 ToolResult、完成一个 turn 或会话结束本身解释成必须写入 Brain；
- 不增加 session-end flush、独立反思模型或持续后台思考；
- 不在当前临时稿阶段同步 v4 BDD、Acceptance、Implementation Plan 或历史文档；
- 不执行 stub、安装或真实模型回放。

## 11. Original Intent Reverse Audit

| Archive 中的原始问题或取舍 | v4 当前承接方式 | 自检结论 |
|---|---|---|
| 静态 skill/instruction 会因注意力衰减而失去实际作用 | 每个新 user event 恢复 bounded working cognition；Codex 由 host mechanical restore，generic MCP 明确只是 best-effort Tool guidance | 保留原始方向，同时诚实区分不同宿主的 guarantee |
| Transcript 在长会话中会被压缩、裁剪或失去注意力 | global/project/session core 合并为 resident cognition；session archival 继续参与 bounded recall 和 active discovery | 没有把 session memory 错误缩成“最近几轮状态” |
| 未完成目标、承诺和既定约束容易被最新消息冲掉 | session core 明确拥有 active goal、progress、commitments、unresolved work 和 intended next step；decision/intention 保持各自角色 | 直接覆盖原始连续性目标 |
| 模型会过早收敛、混淆 proposal/fact/decision 或只按最新 evidence 重建 | role definitions 保留 meaning/certainty/commitment；evidence 只更新它实际涉及的 claim | 没有把 Brain cognition 统一升级成事实，也没有统一降为历史背景 |
| 机制应管结构，模型应管语义；Tool runtime 不内嵌 LLM | Shared renderer 只表达 fixed semantics；runtime 负责确定性 boundary/selection/state，主模型负责理解、相关性、scope/role 和内容维护 | 未引入第二个语义 owner |
| 渐进式披露应复用 agent 熟悉的 ls/grep/read 模式 | bounded recalled summary 可直接使用；不足时 exact read；未出现时 glob/grep | 保留 gist-first、verbatim-on-demand，并避免机械 cat pipeline |
| 清晰准确优先于省字符，但 context 成本必须 bounded | stable instructions 使用分层 Markdown；tags 只界定 dynamic content；core/L0 bounds 不扩大 | 只改变表达，不用无限重复防御语句换遵循度 |
| 用户交互应花在真正需要用户提供的信息，而不是重复背景和纠偏 | Replay/Eval 检查 continuity、重复纠正、约束恢复以及额外 context/tool 成本 | 验收回到原始用户收益，不以 Tool call 或关键词代替 |
| 不做无 evidence 的预防性设计 | v4 不改变 storage、learning、promotion、approval、history、Git 或 coordination subsystem | 本轮 scope 与已观察 failure 相称 |

当前反向审计没有发现需要为实现本轮目标新增 Brain subsystem 的一级缺口。真正未验证的是 presentation 是否能让目标模型稳定产生上述行为，因此本次调整交由用户人工验收，不新增评估子系统。

## 12. 下一步

11 个 Tool 的 description/schema prose 与整份临时稿的 consistency/self-sufficiency audit 已完成。Shared prompt、dynamic presentation、Codex overlay、Tool wording 和验收点之间没有发现尚未说明的一级语义缺口；具体 tag、Tool、parameter、enum value、field 和 path pattern 的 model-facing 引用已统一使用 inline code，实际 dynamic tags 保持原样。

Shared renderer、Codex attention overlay、Tool description/schema prose 与 oversized-line presentation 已按本文完成源码调整和确定性测试。2026-09-10 的摘要标签、写作约定与读取指导调整已同步源码；模型效果由用户人工验收。stub、重新安装仍未执行。只有实际出现需要独立规格或验收文档的复杂度时，再讨论是否增加其他 v4 文档；不机械扩展完整文档集。

## 13. 2026-09-10 摘要消费调整

用户确认：动态标签使用 `recalled_cognition_summary`；摘要参考 Agent Skills description 的“是什么、何时使用”写法，补充必要的正文线索。模型实际应用方法或依赖条件、依据时获取所需正文；已明确的决定、事实、意图与约束仍作为 working cognition 生效。

写作参考：[Agent Skills specification](https://agentskills.io/specification)、[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)。借鉴发现和触发方式，保留 Brain 四类认知角色；不要求每条摘要机械附加读取命令。

范围：shared renderer、Codex overlay 的标签引用、`brain_cat` 选择时机、`brain_write.content` 与 `brain_edit` 两种模式的摘要维护指导、现有标签结构测试及本稿。保留 `summary` 存储字段、现有读取工具、排序和预算；不新增 `has_body`，不自动改写已有记忆。程序一致性使用现有检查；模型实际效果由用户人工验收，不新增行为评估套件。

程序检查：Brain 现有 155 项测试、源码类型检查、三个修改的 Brain TypeScript 文件格式检查、Codex 插件现有 8 项检查通过。全量 `vp check` 在未改动的 `storage.ts` 和 `production-v2-foundation.test.ts` 上报告格式问题；`vp lint` 另报告现有测试文件的类型错误和未使用导入，未计为全量检查通过。插件的 `pnpm test` 因包管理器解析所需的 registry 请求失败，随后直接运行其同一 `node scripts/verify.mjs` 脚本通过。模型行为仍待用户人工验收。
