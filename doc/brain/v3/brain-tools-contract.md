# brain Public Tool Contract v3

> **状态：Frozen Public Tool Contract v3 / Re-synchronized with v3 BDD（2026-08-30）。**
> **需求源：** `bdd-brain-behavior-requirements.md`（current 62 REQ / 140 Scenario）以及本轮已经重新确认的模型可见工具裁决。\
> **边界：** 本文冻结 public/model-visible surface；内部 state schema、Git repo 形态、ranking 公式、固定 output budget 数值、lock/transaction、FSRS-like 算法均不属于本文。
> v2 [`../v2/brain-tools-contract.md`](../v2/brain-tools-contract.md) 保留为冻结前代，不作为 v3 真相源。
> **变更控制：** public/model-visible schema、tool semantics、路径语义或 model-facing guarantees 的行为性变化必须回到 v3 BDD / Acceptance 重新裁决；纯 wording calibration 只有在不改变冻结语义时才可在 Design 阶段调整。

---

## 1. Contract 目标

v3 工具面优先复用模型已经熟悉的 filesystem/search/tool primitives，再只叠加 memory 所必需的语义：

```text
restore persistent cognition → brain_think / host hook
browse one directory    → brain_ls
locate by path shape    → brain_glob
search by content       → brain_grep
read exact document     → brain_cat
create/replace document → brain_write
edit same cognition     → brain_edit
remove active memory    → brain_rm
move same cognition     → brain_mv
report memory outcome   → brain_feedback
```

`edit` 不再承担 feedback-only 特例；`glob` 不再由 `ls` 或 `grep` 魔改替代；Git history 不增加任何模型专用 rationale/commit-message 参数。

---

## 2. Public brain namespace

### PC3-PATH-001 对称 scope roots

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

root 表示 cognition 的 continuity scope：

- `@global/**`：跨 projects / sessions 延续；
- `@project/**`：在当前 project 的 sessions 间延续；
- `@session/<sid>/**`：只在该 session 中延续。

continuity scope 不是 current relevance、priority 或 authority。`@global/`、`@project/`、`@session/<sid>/` 是 continuity prefix，不是 standalone public object。每个 valid scope 都实际包含一个 `core.md`；scope 初始化时创建空文件，适用 core 随 `brain_think` / hook-equivalent anchor 完整进入 current context，模型直接通过 `brain_edit` 维护，不使用 `brain_cat` 重新读取，也不使用 `brain_write` 创建 core。

### PC3-PATH-002 archival path grammar

```text
<scope-root>/memories/<role>/<relative-item-path>.md
```

只有以 `.md` 结尾且符合该 grammar 的文件是 archival cognition。`memories/` 物理目录允许同时保存脚本、表格、样例数据等附加资产；这些非 `.md` 文件不进入 cognition namespace、summary/status、L0、strength 或其他 memory semantics，可通过 `brain_absolute_path` 映射到普通 filesystem 工具处理。

其中 `<role>` 是稳定的 closed top-level ontology，只能是：

```text
decision
knowledge
intention
skill
```

root 与 role 是正交的组合语义：

- root 表达 continuity scope；
- `memories/<role>/` 表达 restored cognition 应怎样参与 current understanding/reasoning/decision/action；
- 后续 relative path 只组织/标识 item，不改变 role；
- 新增第五类 role 需要新的真实 category 需求先进入 Requirement/Design，再扩展该 enum。

四个 role 的 model-facing meaning：

- `decision`：an established choice that current work should continue from when applicable；它建立 chosen direction/constraint，不证明 implementation/completion；
- `knowledge`：在 scope/conditions 适用时进入 current reasoning 的 fact/rule/constraint/established understanding，不超出原 certainty/scope 泛化；
- `intention`：相关时继续推进、直到 fulfilled/cancelled/replaced 的 active goal/commitment；它建立 remaining intended work，不证明已经执行；
- `skill`：当前任务满足 prerequisites/intended conditions 时用于指导行动的 reusable method/procedure/technique；prior outcome 不证明当前事实。

role 由 path 单一拥有，document metadata 不再重复 `type`。role path 编码主模型已经判断出的 cognition meaning，不因存入 `decision/` / `knowledge/` 就自动升级 epistemic authority。model-facing namespace guidance 使用真实、glob-friendly 的 public path grammar，使模型能从 concrete path 自然泛化/收窄 discovery pattern；不另造 `scope + type + path` 三套并行 selector。

### PC3-PATH-003 object kinds

public namespace 只暴露：

```text
archival memories directory
core document
archival memory document
```

其中 archival memories directory 仅指 `<scope>/memories/`、固定 role root 与其 nested directory；standalone scope prefix 不构成 public object。

internal ID、state/index/history/lock/temp、physical filesystem path 不属于 public path space。

### PC3-PATH-004 existing filesystem alias follows the real target without creating a second cognition

brain 的 public path 仍是 cognition/workspace locator，但 existing resource 可能经过 symlink/junction-style filesystem alias。对需要实际读取/枚举 existing resource 的 cognition tools：

- alias 只有在 resolved target 仍位于同一 logical scope 的 physical containment 内时才可跟随；跨 scope / scope 外 target 不通过 alias 暴露；
- 若 resolved target 是 managed cognition，**resolved target 的 canonical public cognition path** 继续拥有 identity、scope 与 role；alias path 不创建第二条 cognition，也不把 target 重新分类；
- broad browse/discovery 遇到可跟随 alias 时可以返回 canonical target，并对同一 resolved cognition 去重；可附 concise diagnostic warning 表达发生了 alias follow；
- broken、不可访问或越界 alias 在 broad browse/discovery 中只 warning + skip 该 entry；exact operation 指向该 location 时明确失败；
- `brain_absolute_path` 仍只是把 caller 给出的 logical/workspace location 映射到 projected absolute path，不因为 target 当前是否存在而改变其 mapping contract。

这条 contract 的目的只是让 brain workspace 保持熟悉 filesystem 行为，同时守住 cognition path 的语义 ownership；不建立第二套 alias identity。

---

## 3. Archival Markdown contract

每个 active archival memory 是一个真实 Markdown logical document。最小 metadata：

```yaml
---
summary: <non-empty current gist>
importance: low | medium | high | critical
---
```

body 可以为空；当 summary 已完整表达 cognition 时，不要求为了 schema 仪式重复正文。

Archival memory 保持普通 Markdown 语义。brain 当前只消费上述 `summary` / `importance` frontmatter；其他 frontmatter 或正文内容不因此获得额外 mechanism semantics，也不建立 reserved-key 黑名单。

### PC3-MEMORY-001 `summary`

`summary` 是 L0 passive cue 与 active discovery 使用的 current gist。write/edit 后必须与 current cognition 保持一致。

### PC3-MEMORY-002 `importance`

判断问题：

> If this memory applies and is not recalled, what material consequence is reasonably expected, and how recoverable would that omission be?

四档：

- `low`：通常几乎没有 material effect，遗漏容易被发现/恢复；
- `medium`：可能造成有意义的返工或较差判断，但通常可恢复；
- `high`：可能实质改变重要结果，造成显著成本、伤害或返工；
- `critical`：可能造成 severe、irreversible 或 otherwise unacceptable consequence。

使用合理预期后果，不沿遥远最坏链条推演。importance 只在新证据改变“适用时遗漏后果”时更新；频率、recency、retrievability、scope、confidence、当前 query relevance、adopt/question/resolve feedback 本身都不自动改变它。

### PC3-MEMORY-003 epistemic meaning

proposal、hypothesis、user-confirmed decision、verified fact、uncertain claim 等必须在 document 自身保留未来正确解释所需的 meaning / certainty / commitment / source context。保存本身不升级其 authority。

---

## 4. Integration modes 与 `brain_think`

### PC3-THINK-001 Generic MCP host

没有可靠 pre-reasoning hook 的 host 暴露：

```text
brain_think(session_id?)
```

其 tool description 明确引导：收到每条新 user message 后立即调用一次，拿到 restored cognition 再进行 substantive reasoning。这是 best-effort model guidance，不是假装 MCP protocol 能机械强制。

### PC3-THINK-002 Hook-backed host

支持 pre-reasoning hook 的 integration 必须选择一条且仅一条 restore path：

- mechanical restore：hook 直接自动调用等价的 `brain_think` / restore，并把返回结果注入当前上下文；此时 model-visible tool surface 不暴露 `brain_think`；
- explicit restore instruction：若 host 对 hook result 的投递只形成容易被弱化为背景的 context，而 explicit ToolResult 对模型注意更可靠，则 hook 只注入短指令，要求模型在 reasoning / response / other tool 前立即且仅调用一次 model-visible `brain_think`。工具必须按 exact name 选择，不能按 description 模糊匹配、取第一个 fuzzy result 或用其他 Brain tool 代替。如何理解和使用返回内容由 `brain_think` output-local preface 说明。

同一 turn 不同时执行两条路径，也不允许重复 restore。

`brain_think` 的 MCP annotations 必须如实声明其运行边界：`openWorldHint=false`、`destructiveHint=false`。由于 successful restore 会记录 passive exposure，不能声明为 read-only 或 idempotent，因此 `readOnlyHint=false`、`idempotentHint=false`。这些 annotations 用于向 host 提供机器可读的行为提示，不代替 host approval policy。

### PC3-THINK-003 Context role

无论来自 explicit tool 还是 hook，返回内容都是 **user-requested restored cognition working context**。它是本轮从 Brain 读取的 current persistent cognition snapshot，不是因为排列在 latest user event 之后就已针对该事件形成的新分析，也不因为来自 persistence 就整体变成较旧或较低权重的背景。每条 cognition 所描述状态的时间、适用性与有效性分别按该 claim 的 meaning、scope 和 relevant evidence 判断：

```text
latest user event
+ applicable restored cognition
+ relevant available evidence
→ current understanding
```

注入位置较新不代表 Brain 已经针对 latest user message 更新了其中 claim；persistence/restore 也不决定 claim 的新旧、authority 或 current relevance。使用时保持其 meaning、certainty、commitment、scope、cognitive role，以及它所描述状态的时间；只在 latest input / relevant evidence 为具体 claim 提供 material basis 时更新受影响部分，其他 applicable cognition 继续参与。

### PC3-THINK-004 Presentation shape

`brain_think` 先用 human-readable preface 说明：这是用户要求 Brain 跨 turn 保持的 working context，不是 optional background；latest user message 定义 current request，但 applicable restored cognition 仍须按其 meaning 与 cognitive role 参与受影响的 understanding/reasoning/answer/action，不能只从其他来源重建。随后使用 XML/HTML-like structural boundary。目标不是把 memory 数据库序列化给模型，而是利用模型已有的 Markdown heading、tagged-context / filesystem / tool-call 训练先验形成一个可直接操作的 cognition work surface。稳定结构如下；exact English wording 仍可做不改变语义的 replay/eval calibration：

```text
# User-Requested Working Context

The following brain_think_context is user-requested working context for this turn. The latest user message defines the current request. Use applicable cognition according to its meaning and cognitive role; do not treat it as optional background or reconstruct the same understanding from other sources alone.

<brain_think_context
  context_role="Restored cognition that participates in the working context for this turn."
  form_current_understanding_from="Form current understanding from the latest user message, applicable restored cognition, and relevant evidence together."
  update_cognition_when="Update only cognition that the latest user message or relevant evidence materially confirms, refines, contradicts, fulfills, cancels, or replaces. Carry forward other applicable cognition; another source's silence does not change it."
  preserve_cognitive_semantics="Keep each cognition's meaning, certainty, commitment, and role unless materially updated. A proposal or hypothesis does not become a fact or decision because it was stored or recalled. An intention remains active until fulfilled, cancelled, or replaced."
>
  <brain_namespace
    continuity_roots="{@session/&lt;sid&gt;,@project,@global}"
    root_encodes="The contexts across which cognition is intended to carry forward."
  >
    <path_rule match="@session/&lt;sid&gt;/**" continuity_scope="This session only." />
    <path_rule match="@project/**" continuity_scope="This project, across sessions." />
    <path_rule match="@global/**" continuity_scope="Across projects and sessions." />
  </brain_namespace>

  <core_memory
    residency="Working cognition kept resident across turns within its continuity scope."
    restore_policy="Each core document is included in full inside its core element on every turn within that scope. Use non-empty content directly; `brain_cat` does not read core.md."
    empty_meaning="`empty=true` means the core exists and is intentionally empty, not omitted or truncated."
  >
    <core
      path="@global/core.md"
      update_when="The cross-project cognition that should remain resident is added, materially updated, or removed."
      update_with="Use `brain_edit` to replace @global/core.md with the complete updated core document."
      archive_when="Cognition should remain preserved and available across projects but no longer needs to be resident on every turn."
      archive_with="First use `brain_write` to preserve it at a concrete @global/memories/{decision,knowledge,intention,skill}/&lt;relative-item-path&gt;.md path matching its cognitive role, then use `brain_edit` to replace @global/core.md with the complete core document after removing it."
    >...raw Markdown...</core>

    <core
      path="@project/core.md"
      update_when="Cognition scoped to this project that should remain resident across its sessions is added, materially updated, or removed."
      update_with="Use `brain_edit` to replace @project/core.md with the complete updated core document."
      archive_when="Cognition should remain preserved and available in this project but no longer needs to be resident on every turn."
      archive_with="First use `brain_write` to preserve it at a concrete @project/memories/{decision,knowledge,intention,skill}/&lt;relative-item-path&gt;.md path matching its cognitive role, then use `brain_edit` to replace @project/core.md with the complete core document after removing it."
    >...raw Markdown...</core>

    <core
      path="@session/&lt;sid&gt;/core.md"
      update_when="Session-scoped cognition that should remain resident for subsequent turns is added, materially updated, or removed. Typical examples include the active goal, current progress, commitments, unresolved work, or intended next step."
      update_with="Use `brain_edit` to replace @session/&lt;sid&gt;/core.md with the complete updated core document."
      archive_when="Cognition should remain preserved and available in this session but no longer needs to be resident on every turn."
      archive_with="First use `brain_write` to preserve it at a concrete @session/&lt;sid&gt;/memories/{decision,knowledge,intention,skill}/&lt;relative-item-path&gt;.md path matching its cognitive role, then use `brain_edit` to replace @session/&lt;sid&gt;/core.md with the complete core document after removing it."
    >...raw Markdown...</core>
  </core_memory>

  <archival_memory
    path_pattern="{@session/&lt;sid&gt;,@project,@global}/memories/{decision,knowledge,intention,skill}/**/*.md"
    residency="Persistent cognition not restored on every turn, but available for recall within its continuity scope."
    preserve_when="Newly formed or materially updated cognition should remain available within its continuity scope because losing it could materially change future understanding, reasoning, decisions, or actions, but it does not need to remain resident on every turn."
    preserve_with="Use `brain_write` at a concrete path whose continuity root and cognitive-role directory match the cognition being preserved."
    maintenance_rule="If the same cognition already has an existing persistent owner, update that owner instead of creating a duplicate Brain item. A raw tool result, completed turn, or tool call alone is not a reason to persist cognition. If no durable cognition changed, do not mutate Brain."
  >
    <cognitive_role_rules
      directory_encodes="The directory immediately after memories/ encodes the cognitive role an item retains when restored: how it should participate in current understanding, reasoning, decisions, and actions when applicable. Restoration does not reduce it to generic background."
    >
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/decision/**/*.md" role="An established choice that current work should continue from when applicable, unless materially revised, reversed, or superseded. It establishes the chosen direction or constraint, not that implementation or completion has occurred." />
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/knowledge/**/*.md" role="A fact, rule, constraint, or established understanding to use in current reasoning when its scope and conditions apply. Preserve the certainty it expresses and do not generalize it beyond what the item establishes." />
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/intention/**/*.md" role="An active goal or commitment to continue pursuing when applicable until it is fulfilled, cancelled, or replaced. It establishes work that remains intended, not that the work has been performed or completed." />
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/skill/**/*.md" role="A reusable method, procedure, or learned technique to apply when the current task matches its prerequisites and intended conditions. It guides how to act; prior examples or outcomes do not establish facts about the current task." />
    </cognitive_role_rules>

    <memory_candidates
      purpose="A bounded, non-exhaustive set of archival cognition summaries surfaced as working context for this turn."
      when_to_use="Use a candidate when its summary is relevant to the latest user request or the cognition it represents may materially affect current understanding, reasoning, decisions, or actions."
      use_as="Use a sufficient summary directly according to the cognitive role encoded by its path, incorporating it into current understanding, reasoning, decisions, and actions it materially affects."
      inspect_only_when="The summary is insufficient for the current task, or its exact reasoning, qualifications, evidence, or details are needed."
      inspect_with="Use `brain_cat` on the candidate's concrete path."
      search_when="Cognition needed for the current task is not present in the surfaced candidates."
      search_with="Use `brain_glob` when the likely path, continuity root, cognitive role, or filename shape is known; use `brain_grep` when content clues are known. Start with the narrowest plausible path pattern and broaden only if needed."
      questioned_means="The item's cognitive role is preserved, but one or more material claims have unresolved uncertainty. This status does not by itself make the item false, irrelevant, cancelled, or superseded. Re-evaluate the affected claims against relevant evidence before relying on them."
    >
      <memory_candidate_item path="..." summary="..." />
      <memory_candidate_item path="..." summary="..." status="questioned" />
    </memory_candidates>
  </archival_memory>
</brain_think_context>
```

运行时 projection 必须把 `<sid>` 实例化为当前真实 session identifier，例如 `@session/abc/...`；不能把字面 `<sid>` 当成 agent work surface。这里的 glob/path pattern 是 model-facing namespace language，不要求任一单个 tool 参数原样接收整串跨-root selector；具体 `brain_glob` / `brain_grep` 参数边界仍由各自 public contract 定义。

稳定行为边界：

- outer wrapper 直接表达 latest user message、applicable restored cognition 与 relevant evidence 共同形成 current understanding，不设置固定 source hierarchy；
- core body 是原始 resident Markdown；
- `<core_memory>` 只拥有共同的 residency/restore/empty semantics；每个固定 `<core path="...">` 自己拥有与该 path/continuity scope 对应的 update/archive decision affordance 与 concrete tool path；
- continuity root 由 `<brain_namespace>` 单一解释，不要求每个 core 再复制 `scope` label，但 concrete core guidance 仍就地保留其 scope-specific condition/path；
- cognitive role meaning 由 archival path rules 单一解释，candidate item 不重复 role/type；archival maintenance 的 owner 复用、非持久化事件与 no-change 规则由 `<archival_memory maintenance_rule>` 只表达一次；
- L0 candidate item 只携带真正随 item 变化的信息：`path + summary + status?`；
- candidate summary 是可直接使用的 bounded working context，但 surfacing alone 不声明 current relevance 或验证 claim；
- `importance` 不在 L0 candidate 上重复展示，避免被误读成 current relevance；
- core 与 L0 各自受其 bounded contract 控制；不得为了塞入更多 L0 而 silent truncate core；
- generic promotion/demotion/signals list 不再存在；
- guidance 放在最小且稳定、真正拥有该语义的 owner 上：固定 concrete object 的 scope-specific action guidance 不因“去重”被错误上提，动态同构 item 的 shared guidance 不机械复制；
- tool identifier 在自然语言 guidance 中使用明确的 inline-code 形式，如 `` `brain_cat` ``、`` `brain_edit` ``。

### PC3-THINK-005 Persistence judgment guidance

`brain_think` / hook-backed projection 是每个 cognition cycle 稳定在场的 agent context，因此必须保留低摩擦的 persistence/maintenance judgment guidance，但不把它定义成固定 end-of-turn write workflow。

稳定 semantic ownership：

- 每个 concrete core 在自身最小稳定 owner 上表达 scope-specific `update_when` / `update_with` / `archive_when` / `archive_with`；core→archival 的安全 guidance 是先 `brain_write` concrete archival cognition，再 `brain_edit` core prune resident content，避免先移除 resident cognition 后 archival write 失败；
- `<core_memory>` 只表达三层 core 共同的 resident working-cognition role，不承担要求模型重新映射到具体 scope/path 的泛化 action policy；
- archival memory collection 表达：当本轮新形成或实质更新的 cognition 若被忘记会 materially change future reasoning/behavior、且不需要每轮 resident 时，应考虑保存/维护 archival memory；
- archival path rules 表达 future applicability × cognitive role 的组合语义；role 是对已经形成 meaning 的编码，不制造 authority；
- 若已有 canonical persistent owner，优先维护 existing cognition / current epistemic lifecycle，而不是无必要复制第二份长期真相；
- raw ToolResult、经过一个 turn 或调用一个 tool 本身不构成“应该写 memory”的事实；必须先由主模型形成对应 cognition judgment；
- 没有 durable cognition change 时，正常不产生 mutation。

这类 guidance 只定义“何时值得考虑 persistence”与合法 action affordance。scope、residency、cognitive role、importance、correction attribution 等语义选择继续由主模型负责；runtime 不自动判定必须保存什么。

各 `brain_write` / `brain_edit` / `brain_feedback` tool description 继续聚焦自身操作 contract，不重复承载整套 persistence policy。最终自然语言措辞可在不改变上述 semantic owner / action relation 的前提下通过 Replay/Eval 做 wording calibration。

### PC3-THINK-006 Restore failure locality

`brain_think` / hook-equivalent anchor 以“恢复当前真实 cognition”为主要结果：

- applicable core 与可用 archival cognition 能正确读取时，cycle / retrievability / exposure / Git history 等 auxiliary update 暂时失败，不取消 restored context；允许丢失对应本轮 auxiliary learning/history event，并提供可诊断 warning；
- required applicable core 本身无法按 core contract 正确读取时，anchor 明确失败，不用空文本掩盖；
- host 提供 reliable current session identity 且该 session 尚未 materialize 时，首次 anchor 必须先建立真实空 session `core.md`；无法建立时 anchor 失败，不返回假的可维护 core；
- broad L0 枚举遇到单条 malformed archival Markdown 时，只跳过该 item 并提供 logical-path warning；其他有效 cognition 继续恢复。exact read 该 malformed item 仍按其自身 document error 明确失败。

---

## 5. Public tool surface

Generic MCP integration 暴露 11 个 logical primitives；mechanical-restore hook 可替代并隐藏 `brain_think`，其余 10 个相同；instruction hook 保留全部 11 个工具。

| Tool | Model-visible input | Core semantics |
|---|---|---|
| `brain_think` | `session_id?` | restore turn-level persistent cognition；hook host 可替代 |
| `brain_absolute_path` | `path` | map a brain workspace location to its absolute filesystem path |
| `brain_ls` | `path` | list direct children only |
| `brain_glob` | `pattern`, `path?` | path/filename pattern discovery |
| `brain_grep` | `pattern`, `path?`, `glob?`, `ignoreCase?`, `literal?`, `context?` | Pi-style bounded lexical/regex content search |
| `brain_cat` | `path`, `offset?`, `limit?` | exact archival logical-document read |
| `brain_write` | `path`, `content` | archival create / full overwrite |
| `brain_edit` | `path`, exactly one of `edits` / `content` | evolve an existing cognition/document |
| `brain_rm` | `path` | archival cognition exits active memory |
| `brain_mv` | `src`, `dst` | move same archival cognition to another concrete archival path |
| `brain_feedback` | `path`, `feedback`, `challenge?` | record validated use / current epistemic transition |

没有 public `confirmed`、approval mode、model-controlled ls/glob/grep `limit`、promotion/demotion signal 参数、Git rationale/commit-message 参数。`brain_glob` / `brain_grep` 的 active-discovery domain 只覆盖各 applicable scope 的 `memories/` archival subtree；省略 `path` 时联合搜索这些 memories trees。

Model-facing Tool 定义遵循熟悉 agent primitive 的分层：Tool 顶层 description 简短说明能力；具体 parameter description 就地说明参数 domain；跨 Tool 的 cognition workflow 由 `brain_think` context 表达。对于 brain 特有 path，parameter description 直接给完整可使用的 path pattern，优先正面说明合法域与推荐动作，必要时用 `only` 消除真实歧义，不把相同约束改写成一长串禁令。例如：

```text
brain_cat
Read one concrete archival memory Markdown document.

path
Concrete archival memory path under
@global/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md,
@project/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md,
or @session/<sid>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md.
```

这种完整表达可以有少量重复；不要求模型把 `root + role + relative path` 或 `this path + 另一个属性` 二次拼装成实际调用地址。

---

### PC3-ABSOLUTE-001 `brain_absolute_path`

```text
brain_absolute_path(path)
```

这是 brain logical/workspace location 到真实 absolute filesystem path 的窄桥接工具，不读取、不创建、不修改目标，也不要求目标已经存在。它接受 `@global` / `@project` / `@session/<sid>` scope root、`<scope-root>/core.md`、`<scope-root>/memories/`、固定 role root 及其任意后代位置；后代可以是 directory、`.md` cognition 或非 `.md` 附加资产。`core.md` 与 `memories/` 在这里不是裸路径。

该工具的宽松 location grammar 不改变其他 `brain_*` cognition tools 的 object grammar：`brain_ls/glob/grep/cat/write/edit/mv/rm/feedback` 仍只对 `.md` cognition 与其 logical directories 生效。路径仍必须保持 scope containment；`..`、反斜杠逃逸以及 scope-level `.state` 等 mechanism location 不通过此桥暴露。

## 6. `brain_ls`

```text
brain_ls(path)
```

`path` 是 archival memory directory：`<scope-root>/memories/`、固定 role root 或其 nested directory。

行为：

- 返回该 archival directory 的 direct children，不递归展开 subtree；
- directory node 返回结构信息；
- archival leaf 返回 public path/name + current summary + necessary current status；
- true membership 由 archival namespace 决定，memory strength 不把真实 child 变成不存在；
- runtime 有固定内部 output budget，模型不能设置 page size；
- 超预算时显式说明还有更多，并引导缩小 `path` 或使用 `brain_glob` / `brain_grep`；
- 不提供 page 2 / offset / cursor。

仅仅被 `ls` 展示不构成 exact retrieval，也不刷新 retrievability 或 L0 exposure。

---

## 7. `brain_glob`

```text
brain_glob(pattern, path?)
```

行为：

- `pattern` 使用 familiar glob-style public-path matching；public baseline 支持 `*`、`**`、`?`、`[]`；
- `path?` 若提供，是 `<scope-root>/memories/`、固定 role root 或 nested archival directory；省略时联合搜索当前可访问 scopes 的 memories trees；
- candidate/result 只包含 active archival memory paths；
- 返回真实 matching archival paths，并携带 current summary + necessary status；
- runtime 有固定内部 output budget；无 model-controlled `limit`；
- 超预算时显式返回 `truncated=true` 并引导缩小 `pattern` / `path`；
- 不提供 offset/cursor/page 2；
- retrievability/importance 只可影响 scarce output 中的 discoverability，不改变 archival glob match truth。

仅仅被 glob 展示不构成 retrieval refresh。

---

## 8. `brain_grep`

```text
brain_grep(
  pattern,
  path?,
  glob?,
  ignoreCase?,
  literal?,
  context?
)
```

参数语义：

- `pattern`：regex by default；
- `literal=true`：按 literal text 搜索；
- `path?`：若提供，是 `<scope-root>/memories/`、固定 role root 或 nested archival directory；省略时联合搜索当前可访问 scopes 的 memories trees；
- grep corpus 对模型只返回 active archival Markdown；core 不参与 active content discovery；
- `glob?`：采用 familiar Pi/ripgrep-style file glob，在所选 search root 下进一步收窄搜索；
- `ignoreCase?`：case-insensitive matching；
- `context?`：请求 matching line 附近的上下文行；matching line number 使用与 `brain_cat` 相同的 1-based logical-document line coordinate。

regex mode 的 `pattern` 必须是合法 regex。compile/parse 失败属于明确 input/query error，不等价于“合法搜索但没有 match”；结果应提示 caller 修正 regex，或在确实想搜索这些普通字符时改用 `literal=true`。

返回必须同时保留：

```text
path/name
current summary
questioned status when applicable
real matching line/context evidence
```

`brain_grep` 采用成熟 grep Tool 的 bounded-result 语义：

- 单次结果由 Tool 的 match/output bound 控制，模型不设置 public `limit`；
- 超出单次边界时显式返回 `truncated=true`，并引导缩小 `pattern/path/glob` 后重新搜索；
- 不提供 `offset`、cursor、`next_offset` 或隐式 pagination state；
- Glob 与 Grep 是并列 recall strategy：path/name clue 用 `brain_glob`，content clue 用 `brain_grep`。

仅展示 grep result 不构成 retrieval refresh，也不改变 L0 exposure。


---

## 9. `brain_cat`

```text
brain_cat(path, offset?, limit?)
```

`path` 指向一个 concrete active archival document；适用 core 已由 `brain_think` 完整恢复并通过 `brain_edit` 维护。

读取语义：

- archival 按真实 Markdown document 读取，不再有“先 summary、再特殊 body offset”的私有读取协议；
- `offset` / `limit` 使用同一个稳定 document-line coordinate；`offset` 是 1-based document line，与模型常见 Read/cat-like 工具保持一致；
- 小文档可一次完整返回；长文档明确提供后续读取位置；
- 文档未变时连续读取不无故跳行/重复稳定内容；
- bounded rendering 以完整 logical line 为最小无损读取单位：不能截掉一行后半段、却让后续 continuation 越过它；
- 若下一条完整 logical line 本身超过 `brain_cat` 的安全输出边界，返回明确的“该行无法在当前 exact-read transport 中无损表示”，不返回该行 excerpt 作为 exact content，也不推进到下一行；model-facing guidance 指向 `brain_absolute_path`，再由宿主已有普通 filesystem read 能力读取该文件，而不是新增 brain 私有 byte/column 子分页协议。

当还有完整 logical lines 未返回时，结果追加稳定 continuation affordance：

```text
next_offset: <下一条尚未完整返回的 1-based line>
continue_with: brain_cat(path=<canonical-path>, offset=<next_offset>)
```

EOF、空文档、offset 超出 EOF 或 representation-blocked line 不输出假的 continuation。

对于 archival memory，结果还必须让模型看到 current epistemic status；若存在 current unresolved challenge，则展示 `questioned` 并恢复该 challenge。`status` 由 challenge 是否存在派生，不改变 Markdown document 的行坐标。

`brain_cat` 就是 ordinary concrete-document exact read；实际返回的 archival content 可以构成 exact retrieval 并刷新近期 retrievability，但 read 本身不等于 validated successful use。若请求在返回任何 archival content 前因超长 logical line 等 representation boundary 失败，则不伪造一次 exact-retrieval learning event。辅助 retrievability refresh 本身失败时，已经正确读取的 content 仍可返回；该 refresh 可局部丢失并给 diagnostic warning。

---

## 10. `brain_write`

```text
brain_write(path, content)
```

只接受 concrete archival item path。

- absent target → create new cognition；
- existing target → full overwrite / replacement cognition at same address；
- overwrite 不继承被替换 cognition 的 learning history；
- `content` 必须是完整 archival Markdown document，并满足 §3；
- 不接受 directory selector、core target、glob path；
- 无 `confirmed`、Git `reason`、commit-message 参数。

成功结果应明确实际发生 `created` 或 `overwrote`，不暴露 internal ID / state/index/FSRS 数值。

---

## 11. `brain_edit`

```text
brain_edit(
  path,
  edits? | content?
)
```

exactly one of：

```text
edits: [{ oldText, newText }, ...]
content: <complete replacement document>
```

语义：

- `brain_edit` target 必须已存在；valid scope 的 `<scope-root>/core.md` 已由 scope 初始化创建；archival 不存在时按普通 edit 语义返回 not found；
- `edit` 明确表达 **same cognition/document evolves**；archival identity/适当 learning continuity 保留；
- `edits` 包含一条或多条 exact-text replacements，全部针对同一个 original document 验证；
- `content` 用于需要整篇重写但仍明确是 same cognition/document 的情况；
- core 使用 edit 维护 resident working context；空 core 也只是正常已有文件，可直接 edit；core 不是 `brain_write`/`brain_rm` 的 archival object；
- archival resulting document 必须满足 §3，summary 与 current content 保持一致；
- importance 只有 omission consequence 变化时才应由模型修改；
- edit 本身不自动产生 adopt/question/resolve feedback。

`edits=[]` 不是合法 edit；没有 `feedback` / `confirmed` / Git rationale 参数。

---

## 12. `brain_rm`

```text
brain_rm(path)
```

只接受 concrete active archival item。

成功后：

- cognition 退出正常 `brain_think` L0、`brain_ls`、`brain_glob`、`brain_grep` 与 normal `brain_cat` active flow；
- core 不接受 rm，通过 `brain_edit` 维护；
- 若旧版本已经真实进入 Git checkpoint，Git 可额外提供历史恢复依据；rm 成功不以 Git history 存在或本次 Git 操作成功为前提；
- 不创建 public tombstone/history/recycle object；
- 不要求模型额外提供删除 rationale。

---

## 13. `brain_mv`

```text
brain_mv(src, dst)
```

只移动 concrete archival item → concrete archival item。

- same cognition 改变 address，可同时改变 applicability scope、cognitive role 或 relative path；
- identity / appropriate learning continuity 随 cognition 移动；
- document content 不因为 path role/scope 改变而偷偷重写重复 metadata；
- destination 不存在 → normal move；
- destination 已存在 → 采用 familiar file `mv` replacement semantics，并在结果中明确 `replaced existing destination`；被替换 cognition 退出该 active address；若它已有 Git checkpoint，该 checkpoint 仍可作为额外历史依据，但 replacement 成功不依赖 Git；
- core↔archival 不是 move：应使用 read/write/edit 进行 semantic extraction / incorporation；
- 不接受 directory shorthand、glob selector、`confirmed` 或 Git rationale 参数。

---

## 14. `brain_feedback`

```text
brain_feedback(
  path,
  feedback,
  challenge?
)
```

`path` 必须是 concrete active archival memory。

### `feedback=adopt`

含义：该 memory **实际参与**了 decision/action，而且 outcome 支持它继续有效。

- 形成 positive successful-use evidence；
- 仅 read/grep/cat/提及/赞同不等于 adopt；
- 不自动改变 importance 或 questioned status。

### `feedback=question`

含义：current evidence 对 stored meaning / basis / conditions / certainty / commitment 构成 material challenge，而且问题尚未解决。

此时 `challenge` **required 且 trim 后 non-empty**，表达：

> 当前究竟在质疑什么，以及什么仍 unresolved。

结果：持久保留 current unresolved `challenge`；model-visible `status=questioned` 由 challenge 存在派生。对已经 questioned 的 memory 再 `question`，模型提交新的完整 current challenge，使其准确表示仍未解决的问题，而不是无限 append 历史 issue list。

### `feedback=resolve`

含义：current unresolved challenge 已经被解决。

- only valid when current unresolved challenge 存在；
- 清除 current challenge，因此 model-visible status 自然恢复为 active；
- `resolve` 不表达“原 cognition 被改过”还是“原 cognition 被重新确认”；如果 document meaning 需要变化，先用 `brain_edit` 修改 Markdown，再 `resolve`；
- 不伪造 successful-use evidence；
- 不要求额外 reason。


### 不产生 feedback 的情况

行动失败但 evidence 表明 failure 与 memory 本身无关时，不提交负向 feedback。旧 `attribute` event 退出 v3。

### Model-facing result 与 error affordance

- 合法 `brain_ls` / `brain_glob` / `brain_grep` 无结果分别明确返回 `no archival cognition entries` / `no matching archival cognition paths` / `no matching archival cognition content`，不是空 ToolResult，也不是 error；
- typed error 首行保持 `error: <code>`；第二行给 caller 可以直接采取的修正动作。invalid regex 明确提示修正表达式或改用 `literal=true`；edit ambiguity 指出怎样形成 exact unique region；feedback challenge 与 archival frontmatter error 指出缺少的完整输入；
- no-op edit 返回 `no changes: <path>`；no-op question 返回 `current challenge unchanged for <path>`；adopt 成功返回 `recorded validated use for <path>`，避免把记录 validated-use event 表述成 cognition 本身被“采纳”；
- 上述是 presentation affordance，不新增 public 参数、第二套 error code 或 pagination state。

---

## 15. Current persistence 与 auxiliary Git history

current cognition / explicit epistemic state 是 Tool 的业务结果；Git 是可用时的辅助 version-history resource。两者的边界固定为：

```text
explicit cognition / feedback mutation
→ write complete required current state
→ success is determined by that public operation

Git available
→ best-effort history/staging/checkpoint
→ failure may leave history behind current state
→ does not roll back a correct cognition result
```

因此：

- write/edit/mv/rm/core-maintenance / explicit `brain_feedback` 返回 success 前，其 public semantics 所必需的 current state 必须已经完整成立并立即可观察；
- `brain_cat` / anchor 顺带产生的 retrievability、cycle、exposure 等 auxiliary learning update 失败，只丢失对应辅助 learning effect；已经正确读取/恢复的 cognition 不因此失败；
- Git stage/checkpoint 不属于任一 cognition Tool 的 success 前置条件；repository 不可用、add/commit 失败时 current working cognition 继续作为 truth；
- `brain_think` / hook-equivalent anchor 是一次自然的 best-effort checkpoint opportunity；一个 anchor 至多形成一次轮次 checkpoint，细粒度 Tool event 不要求逐个 commit；
- Git 可用时，checkpoint 可以覆盖当前 brain workspace 中已经形成的 cognition 与配套 assets；具体 staging 时机、repo layout、commit template 留 Engineering Design；
- model 不需要为 auxiliary history 额外提供 `reason` / `rationale` / `commit_message`；
- Git failure 可以通过 concise model-facing warning 和/或 technical log 诊断，但不创建 pending-history / recovery-commit 等第二套业务状态机。

brain 也不建立与 Git 平行的 `history.jsonl`、`change_history.jsonl`、hidden recycle/tombstone history store。

---

## 16. Result / error presentation

普通 read/mutation primitive 尽量保持熟悉、短、执行事实导向，不为结构化而 XML 化。

示例方向：

```text
created @project/memories/knowledge/x.md
overwrote @project/memories/knowledge/x.md
edited @project/core.md
removed @project/memories/knowledge/x.md
moved @session/s1/memories/skill/x.md -> @project/memories/skill/x.md
moved ... -> ...; replaced existing destination
questioned @project/memories/knowledge/x.md
resolved @project/memories/knowledge/x.md; status=active
```

发生 truncated/continuation/object-kind conflict 时，结果必须给合法下一步 affordance，而不是只给错误码。auxiliary learning/history side effect 被降级时，可以附 concise warning，使模型/日志能知道本轮少记录了什么，但不能把 warning 伪装成主要 cognition operation failure。

结果不常规暴露：

```text
internal state id
physical path
index sync
stability/retrievability raw score
usage counter
Git object id
lock/transaction detail
```

---

## 17. 留给 Engineering Design / Calibration

本文不冻结：

- ls/glob/grep fixed internal budget 的数值；
- exact ranking formula、importance enum 到内部 weight 的映射；
- retrievability/stability 的内部 representation；
- exposure reset/calibration；
- Git repository physical boundary、commit granularity、commit-message exact template；
- persistence/index/state layout；
- filesystem locking / transaction implementation；
- hook/plugin 的具体 SDK wiring；
- XML attribute 的最终英文 wording，只要不改变 §4 的语义 contract。

---

## 18. Phase 2 使用方式

Specification by Example 应以：

```text
v3 BDD
+
本文 public/model-visible contract
+
真实 deployment/failure boundaries
```

为输入展开 acceptance cases；不得从当前 production implementation 或冻结的 v2 contract 反推 v3 expectation。
