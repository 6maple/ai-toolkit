# brain Public Tool Contract v2

> **状态：Frozen Public Tool Contract v2 / Re-synchronized with evidence-corrected BDD（2026-08-24）。**
> **需求源：** `bdd-brain-behavior-requirements.md`（current 62 REQ / 140 Scenario）以及本轮已经重新确认的模型可见工具裁决。\
> **边界：** 本文冻结 public/model-visible surface；内部 state schema、Git repo 形态、ranking 公式、固定 output budget 数值、lock/transaction、FSRS-like 算法均不属于本文。
> v1 [`../v1/brain-tools-contract.md`](../v1/brain-tools-contract.md) 保留为旧 baseline，不作为 v2 真相源。
> **变更控制：** public/model-visible schema、tool semantics、路径语义或 model-facing guarantees 的行为性变化必须回到 v2 BDD / Acceptance 重新裁决；纯 wording calibration 只有在不改变冻结语义时才可在 Design 阶段调整。

---

## 1. Contract 目标

v2 工具面优先复用模型已经熟悉的 filesystem/search/tool primitives，再只叠加 memory 所必需的语义：

```text
restore prior cognition → brain_think / host hook
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

### PC2-PATH-001 对称 scope roots

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

root 表示 future applicability：

- `@global/**`：跨 projects / future sessions 持续适用；
- `@project/**`：当前 project 的 future sessions 持续适用；
- `@session/<sid>/**`：只在该 session 中持续适用。

scope 不是 priority 或 authority。`@global/`、`@project/`、`@session/<sid>/` 是 applicability prefix，不是 standalone public object。每个 valid scope 都实际包含一个 `core.md`；scope 初始化时创建空文件，适用 core 随 `brain_think` / hook-equivalent anchor 完整进入 current context，模型直接通过 `brain_edit` 维护，不使用 `brain_cat` 重新读取，也不使用 `brain_write` 创建 core。

### PC2-PATH-002 archival path grammar

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

- root 表达 future applicability；
- `memories/<role>/` 表达 recalled cognition 应怎样参与 reasoning/action；
- 后续 relative path 只组织/标识 item，不改变 role；
- 新增第五类 role 需要新的真实 category 需求先进入 Requirement/Design，再扩展该 enum。

四个 role 的 model-facing meaning：

- `decision`：an established choice that future work should continue from while its basis remains valid；
- `knowledge`：a fact, rule, constraint, or established understanding to reason with when its conditions apply；
- `intention`：an active goal or commitment whose remaining work should continue until fulfilled, cancelled, or replaced；
- `skill`：a reusable method to apply when similar task conditions recur。

role 由 path 单一拥有，document metadata 不再重复 `type`。role path 编码主模型已经判断出的 cognition meaning，不因存入 `decision/` / `knowledge/` 就自动升级 epistemic authority。model-facing namespace guidance 使用真实、glob-friendly 的 public path grammar，使模型能从 concrete path 自然泛化/收窄 discovery pattern；不另造 `scope + type + path` 三套并行 selector。

### PC2-PATH-003 object kinds

public namespace 只暴露：

```text
archival memories directory
core document
archival memory document
```

其中 archival memories directory 仅指 `<scope>/memories/`、固定 role root 与其 nested directory；standalone scope prefix 不构成 public object。

internal ID、state/index/history/lock/temp、physical filesystem path 不属于 public path space。

### PC2-PATH-004 existing filesystem alias follows the real target without creating a second cognition

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

### PC2-MEMORY-001 `summary`

`summary` 是 L0 passive cue 与 active discovery 使用的 current gist。write/edit 后必须与 current cognition 保持一致。

### PC2-MEMORY-002 `importance`

判断问题：

> If this memory applies and is not recalled, what material consequence is reasonably expected, and how recoverable would that omission be?

四档：

- `low`：通常几乎没有 material effect，遗漏容易被发现/恢复；
- `medium`：可能造成有意义的返工或较差判断，但通常可恢复；
- `high`：可能实质改变重要结果，造成显著成本、伤害或返工；
- `critical`：可能造成 severe、irreversible 或 otherwise unacceptable consequence。

使用合理预期后果，不沿遥远最坏链条推演。importance 只在新证据改变“适用时遗漏后果”时更新；频率、recency、retrievability、scope、confidence、当前 query relevance、adopt/question/resolve feedback 本身都不自动改变它。

### PC2-MEMORY-003 epistemic meaning

proposal、hypothesis、user-confirmed decision、verified fact、uncertain claim 等必须在 document 自身保留未来正确解释所需的 meaning / certainty / commitment / source context。保存本身不升级其 authority。

---

## 4. Integration modes 与 `brain_think`

### PC2-THINK-001 Generic MCP host

没有可靠 pre-reasoning hook 的 host 暴露：

```text
brain_think(session_id?)
```

其 tool description 明确引导：收到每条新 user message 后立即调用一次，拿到 restored cognition 再进行 substantive reasoning。这是 best-effort model guidance，不是假装 MCP protocol 能机械强制。

### PC2-THINK-002 Hook-backed host

支持 pre-reasoning hook 的 integration 直接自动调用等价的 `brain_think` / restore，并把返回结果注入当前上下文；hook-backed model-visible tool surface 不暴露 `brain_think`，模型也不需要再显式调用。

### PC2-THINK-003 Context role

无论来自 explicit tool 还是 hook，返回内容都是 **restored prior context**：

```text
prior cognition
+ latest user event
+ current evidence
→ current understanding
```

注入位置较新不代表 brain 已经理解 latest user message。使用 remembered content 时保持它形成时的 meaning、certainty、commitment；只更新被最新输入/证据实际改变的部分。

### PC2-THINK-004 Presentation shape

`brain_think` 使用 XML/HTML-like structural boundary，目标不是把 memory 数据库序列化给模型，而是利用模型已有的 tagged-context / filesystem / tool-call 训练先验形成一个可直接操作的 cognition work surface。稳定结构如下；exact English wording 仍可做不改变语义的 replay/eval calibration：

```xml
<brain_think_context
  purpose="Restore prior working context as the starting point for this turn."
  reconcile_with="The user's latest message and current evidence."
  update_rule="Update prior context where they change it; carry forward what remains valid."
  preserve_rule="Use remembered content with the same meaning, certainty, and commitment it had when formed."
>
  <brain_namespace
    roots="{@session/&lt;sid&gt;,@project,@global}"
    root_meaning="The root of a brain path states the future context in which that cognition should continue to apply."
  >
    <path_rule match="@session/&lt;sid&gt;/**" meaning="Applies within the current session." />
    <path_rule match="@project/**" meaning="Applies across sessions in the current project." />
    <path_rule match="@global/**" meaning="Applies across projects and future sessions." />
  </brain_namespace>

  <core_memory
    purpose="Resident working cognition restored every applicable turn so ongoing work can continue without depending on archival retrieval."
  >
    <core
      path="@global/core.md"
      maintain_when="Cross-project working cognition changes and future work across projects should carry that change directly."
      maintain_with="Use `brain_edit` on @global/core.md with the updated complete core document."
      archive_when="Some cognition should remain remembered across projects but no longer needs to stay resident every turn."
      archive_with="First use `brain_write` on @global/memories/{decision,knowledge,intention,skill}/&lt;relative-item-path&gt;.md to preserve the archival cognition, then use `brain_edit` on @global/core.md to remove what no longer needs to remain resident."
    >...raw Markdown...</core>

    <core
      path="@project/core.md"
      maintain_when="Project working cognition changes and future sessions in this project should carry that change directly."
      maintain_with="Use `brain_edit` on @project/core.md with the updated complete core document."
      archive_when="Some cognition should remain remembered in this project but no longer needs to stay resident every turn."
      archive_with="First use `brain_write` on @project/memories/{decision,knowledge,intention,skill}/&lt;relative-item-path&gt;.md to preserve the archival cognition, then use `brain_edit` on @project/core.md to remove what no longer needs to remain resident."
    >...raw Markdown...</core>

    <core
      path="@session/&lt;sid&gt;/core.md"
      maintain_when="The current session's active goal, progress, commitments, unresolved work, or other resident working cognition changes and later turns in this session need that change to continue correctly."
      maintain_with="Use `brain_edit` on @session/&lt;sid&gt;/core.md with the updated complete core document."
      archive_when="Some cognition from this session should remain recoverable later in the session but no longer needs to stay resident every turn."
      archive_with="First use `brain_write` on @session/&lt;sid&gt;/memories/{decision,knowledge,intention,skill}/&lt;relative-item-path&gt;.md to preserve the archival cognition, then use `brain_edit` on @session/&lt;sid&gt;/core.md to remove what no longer needs to remain resident."
    >...raw Markdown...</core>
  </core_memory>

  <archival_memory
    path_space="{@session/&lt;sid&gt;,@project,@global}/memories/{decision,knowledge,intention,skill}/**/*.md"
    purpose="Persistent cognition that does not need to stay resident every turn and can be recalled when useful."
    remember_when="Preserve newly formed or materially updated cognition when forgetting it could materially change future reasoning or behavior, but it does not need to remain resident in core."
    remember_with="Use `brain_write` at a concrete path whose applicability root and cognitive-role directory match the cognition being preserved."
  >
    <cognitive_role_rules
      role_meaning="The directory after memories/ states how recalled cognition should participate in future reasoning or action."
    >
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/decision/**/*.md" meaning="An established choice that future work should continue from while its basis remains valid." />
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/knowledge/**/*.md" meaning="A fact, rule, constraint, or established understanding to reason with when its conditions apply." />
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/intention/**/*.md" meaning="An active goal or commitment whose remaining work should continue until fulfilled, cancelled, or replaced." />
      <path_rule match="{@session/&lt;sid&gt;,@project,@global}/memories/skill/**/*.md" meaning="A reusable method to apply when similar task conditions recur." />
    </cognitive_role_rules>

    <memory_candidates
      purpose="Archival recall cues surfaced for this turn; being listed does not mean a memory is currently relevant or correct."
      choose="Use the current task to decide which summaries may materially affect the current judgment."
      inspect_when="A summary may materially affect the current judgment, or its exact reasoning, qualifications, evidence, or details matter."
      inspect_with="Use `brain_cat` on that item's concrete path."
      search_when="The prior cognition you need is not surfaced here."
      search_with="Use `brain_glob` when you remember its path/name shape, or `brain_grep` when you remember content clues; narrow or generalize the memory path patterns above to select the appropriate search space."
      questioned_status="An item marked `questioned` remains recallable, but its current cognition has unresolved epistemic uncertainty and should be re-evaluated before relying on it."
    >
      <memory_candidate_item path="..." summary="..." />
      <memory_candidate_item path="..." summary="..." status="questioned" />
    </memory_candidates>
  </archival_memory>
</brain_think_context>
```

运行时 projection 必须把 `<sid>` 实例化为当前真实 session identifier，例如 `@session/abc/...`；不能把字面 `<sid>` 当成 agent work surface。这里的 glob/path pattern 是 model-facing namespace language，不要求任一单个 tool 参数原样接收整串跨-root selector；具体 `brain_glob` / `brain_grep` 参数边界仍由各自 public contract 定义。

稳定行为边界：

- outer wrapper 直接表达 prior/current relationship，不再用抽象 `role="restored_prior_context"` 代替这些关系；
- core body 是原始 resident Markdown；
- `<core_memory>` 只拥有共同的 resident-cognition role；每个固定 `<core path="...">` 自己拥有与该 path/applicability 对应的 maintain/archive decision affordance；
- root applicability 由 `<brain_namespace>` 单一解释，不要求每个 core 再复制 `scope` / `applies_to` label；
- cognitive role meaning 由 archival path rules 单一解释，candidate item 不重复 role/type；
- L0 candidate item 只携带真正随 item 变化的信息：`path + summary + status?`；
- candidate 是 recall cue，不声称已经与 current query 做过 semantic relevance 判断；
- `importance` 不在 L0 candidate 上重复展示，避免被误读成 current relevance；
- core 与 L0 各自受其 bounded contract 控制；不得为了塞入更多 L0 而 silent truncate core；
- generic promotion/demotion/signals list 不再存在；
- guidance 放在最小且稳定、真正拥有该语义的 owner 上：固定 concrete object 的 scope-specific action guidance 不因“去重”被错误上提，动态同构 item 的 shared guidance 不机械复制；
- tool identifier 在自然语言 guidance 中使用明确的 inline-code 形式，如 `` `brain_cat` ``、`` `brain_edit` ``。

### PC2-THINK-005 Persistence judgment guidance

`brain_think` / hook-backed projection 是每个 cognition cycle 稳定在场的 agent context，因此必须保留低摩擦的 persistence/maintenance judgment guidance，但不把它定义成固定 end-of-turn write workflow。

稳定 semantic ownership：

- 每个 concrete core 在自身最小稳定 owner 上表达 scope-specific `maintain_when` / `maintain_with` / `archive_when` / `archive_with`；core→archival 的安全 guidance 是先 `brain_write` concrete archival cognition，再 `brain_edit` core prune resident content，避免先移除 resident cognition 后 archival write 失败；
- `<core_memory>` 只表达三层 core 共同的 resident working-cognition role，不承担要求模型重新映射到具体 scope/path 的泛化 action policy；
- archival memory collection 表达：当本轮新形成或实质更新的 cognition 若被忘记会 materially change future reasoning/behavior、且不需要每轮 resident 时，应考虑保存/维护 archival memory；
- archival path rules 表达 future applicability × cognitive role 的组合语义；role 是对已经形成 meaning 的编码，不制造 authority；
- 若已有 canonical persistent owner，优先维护 existing cognition / current epistemic lifecycle，而不是无必要复制第二份长期真相；
- raw ToolResult、经过一个 turn 或调用一个 tool 本身不构成“应该写 memory”的事实；必须先由主模型形成对应 cognition judgment；
- 没有 durable cognition change 时，正常不产生 mutation。

这类 guidance 只定义“何时值得考虑 persistence”与合法 action affordance。scope、residency、cognitive role、importance、correction attribution 等语义选择继续由主模型负责；runtime 不自动判定必须保存什么。

各 `brain_write` / `brain_edit` / `brain_feedback` tool description 继续聚焦自身操作 contract，不重复承载整套 persistence policy。最终自然语言措辞可在不改变上述 semantic owner / action relation 的前提下通过 Replay/Eval 做 wording calibration。

### PC2-THINK-006 Restore failure locality

`brain_think` / hook-equivalent anchor 以“恢复当前真实 cognition”为主要结果：

- applicable core 与可用 archival cognition 能正确读取时，cycle / retrievability / exposure / Git history 等 auxiliary update 暂时失败，不取消 restored context；允许丢失对应本轮 auxiliary learning/history event，并提供可诊断 warning；
- required applicable core 本身无法按 core contract 正确读取时，anchor 明确失败，不用空文本掩盖；
- host 提供 reliable current session identity 且该 session 尚未 materialize 时，首次 anchor 必须先建立真实空 session `core.md`；无法建立时 anchor 失败，不返回假的可维护 core；
- broad L0 枚举遇到单条 malformed archival Markdown 时，只跳过该 item 并提供 logical-path warning；其他有效 cognition 继续恢复。exact read 该 malformed item 仍按其自身 document error 明确失败。

---

## 5. Public tool surface

Generic MCP integration 暴露 11 个 logical primitives；hook-backed integration 可由 hook 替代 `brain_think`，其余 10 个相同。

| Tool | Model-visible input | Core semantics |
|---|---|---|
| `brain_think` | `session_id?` | restore turn-level prior cognition；hook host 可替代 |
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

### PC2-ABSOLUTE-001 `brain_absolute_path`

```text
brain_absolute_path(path)
```

这是 brain logical/workspace location 到真实 absolute filesystem path 的窄桥接工具，不读取、不创建、不修改目标，也不要求目标已经存在。它接受 `@global` / `@project` / `@session/<sid>` scope root、`core.md`、`memories/`、固定 role root 及其任意后代位置；后代可以是 directory、`.md` cognition 或非 `.md` 附加资产。

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

此时 `challenge` **required**，表达：

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

行动失败但 evidence 表明 failure 与 memory 本身无关时，不提交负向 feedback。旧 `attribute` event 退出 v2。

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
v2 BDD
+
本文 public/model-visible contract
+
真实 deployment/failure boundaries
```

为输入展开 acceptance cases；不得从当前 production implementation 或 v1 contract 反推 v2 expectation。
