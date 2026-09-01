# brain v3 Detailed Design — Integration Boundary

> **Layer:** Phase 5B Detailed Design child。
> **Owns:** A1/A2 host invocation facts、public Tool registration/dispatch/result transport、hook-backed B4 call-through。
> **Parent:** `design-brain-system.md` A. Integration Boundary。
> **Inputs:** Frozen Requirements / Tool Contract / Acceptance + B1/B2/B3/B4 application contracts。
> **Children:** none。
> **Status:** **Design Frozen for v3 (2026-08-30)**；project-mapping semantics inherit the unchanged v2 2026-08-26 baseline；canonical v3 Detailed Design truth is this file。
> **Compatibility boundary:** 不为 v1 Tool schema、旧 plugin config、旧 metadata key 或旧 host wiring提供兼容；只有明确 compatibility requirement 才增加 adapter。

---

## 1. 本文职责

Integration 只把 host invocation 映射到同一套 brain application semantics：

```text
host/tool invocation
→ reliable project/session facts when available
→ A1/A2 adapter
→ B1/B2/B3/B4
→ application result
→ MCP return or hook injection
```

A1/A2 不拥有：

- public path/cognition meaning；
- discovery/ranking；
- mutation identity/feedback；
- anchor renderer/learning；
- filesystem/Git/coordination；
- legacy compatibility。

核心 invariant：

> trigger/wiring 可以不同，brain behavior 不能分叉。

---

## 2. Concrete module boundary

Current structure可以很小：

```text
src/integration/public-tools.ts   # one in-code public tool definition source
src/integration/mcp-adapter.ts    # A1 register/dispatch/result/error
src/runtime/bootstrap.ts          # project binding + required core bootstrap + optional history setup

brain-dsh-plugin/
└─ host adapter                   # A2 host event → same B4/tool call → inject
```

Exact validation library、MCP SDK method、plugin process manager、host registry API属于 implementation。

---

## 3. Runtime project binding

One brain runtime instance binds exactly one project identity：

```ts
export interface RuntimeBindingFacts {
  readonly sourceRoot: string
}
```

Raw `sourceRoot`来自server/host startup cwd。E1通过 `<brainRoot>/projects/*/project.json`把canonical source root映射到稳定ProjectId；未匹配目录创建新project metadata。StorageBinding只持有brainRoot与projectId。

Rules：

- model/tool arguments不能切换 project；
- sourceRoot不是project identity；一个ProjectId可以对应多个sourceRoots；
- multi-project host如需同时服务多个 project，应运行/管理多个 project-bound runtime instances；具体 child-process/instance-manager实现不属于 brain semantic Design。

---

## 4. Invocation facts / session resolution

```ts
export interface IntegrationCallContext {
  readonly currentSessionId?: SessionId
}
```

Session 是 host invocation fact，不是 filesystem推导结果。

### 4.1 `brain_think`

Resolution：

```text
reliable trusted host session fact when available
→ else explicit public session_id when supplied
→ else no session binding
```

Explicit value仍必须通过 B1 `parseSessionId`；若同时存在trusted host fact且两者不一致，必须拒绝调用而不是允许model argument覆盖host identity。

### 4.2 Omitted-path `brain_glob` / `brain_grep`

这两个 use case需要 current session 才能形成：

```text
global + project + current session?
```

default search scopes。

因此 path omitted 时可消费 trusted host session fact；没有 reliable fact 时只搜索 global+project，不造 `default` session。

### 4.3 Concrete-path operations

`ls(path)`、`cat/write/edit/rm/mv/feedback` 的具体 path 已完整表达目标 scope；它们不为了“统一 context”额外解析无关 session metadata。

### 4.4 Trusted host fact adapter

A1/A2可以有：

```ts
interface HostInvocationAdapter {
  currentSessionId(rawHostInvocation: unknown): string | undefined
}
```

具体 metadata field是 host adapter implementation fact，不属于 public contract。

Current evidence：Codex/DSH 都能提供单 segment session identity；若某 host 不提供，保持 `undefined`，不猜、不 fallback。

---

## 5. One public Tool contract source

Frozen model-visible contract由：

```text
brain-tools-contract.md
```

拥有。

Implementation 必须只有**一份 in-code Tool definition source**，供 A1 MCP registration 与 A2 host tool registration共同消费：

```ts
export interface BrainToolDefinition {
  readonly name: BrainToolName
  readonly description: string
  readonly inputSchema: unknown
}
```

要求：

- 11 个 Tool name/schema 与 current Contract一致；
- A2 不 vendoring 第二份 schema/description；
- model-visible unknown args按 schema拒绝；
- Tool 顶层 description保持简短 capability statement；parameter description就地表达 precise domain，brain-specific path直接给完整可使用 pattern；跨 Tool workflow由 `brain_think` context拥有，不重复 DD calibration、Git、ranking internals；
- model-facing wording优先正面描述合法域和正确动作，必要时使用 `only` 消除真实歧义；允许少量重复以避免 `this path` 指代解析或 `root + role + relative path` 二次拼装。

Exact schema library（例如 Zod）和从 internal schema生成 host JSON Schema 的 API属于 implementation choice；package version由 package manifest/lockfile管理，不进 Design。

---

## 6. A1 MCP Tool Adapter

A1 暴露 current 11 tools：

```text
brain_think
brain_absolute_path
brain_ls
brain_glob
brain_grep
brain_cat
brain_write
brain_edit
brain_rm
brain_mv
brain_feedback
```

### Dispatch

```text
validate public args
→ resolve only the invocation facts this use case actually needs
→ B1 logical parse/binding
→ B2/B3/B4 application use case
→ render application result as MCP ToolResult
```

Ownership：

| Tool | Application owner |
|---|---|
| think | B4 |
| ls/glob/grep/cat | B2 |
| write/edit/mv/rm/feedback | B3 |

A1不得直接 import fs/Git、重算 D1/D2、parse frontmatter、执行 exact-edit algorithm 或初始化 scope semantic state。

---

## 7. Normal result mapping

### `brain_think`

B4 返回 `AnchorResult { context, diagnostics }`。A1 的 cognition payload直接使用 **actual `context`**，不包第二套 memory representation；若有 public-safe degraded diagnostics，可以作为与 cognition context 分离的 concise ToolResult warning附带。warning 不得被拼进 `<brain_think_context>` 内，也不能把“history/learning少记录了一次”说成 restore failure。

### Read/discovery

A1返回 B2 已生成的 familiar plain-text result；不 XML 化 ordinary tools。

### Mutation/feedback

A1返回 B3 的 concise execution fact / actionable next step；不追加 Git rationale、internal score、physical path。

Transport-specific `content[]` / result envelope属于 MCP adapter实现，不是 domain contract。

---

## 8. Public error boundary

Adapter只做 presentation，不重新分类 semantic truth。

### Typed semantic/application error

保留 owner error code/meaning，转成短、安全、可行动的 model-visible text，例如：

```text
invalid path/object kind
not found
invalid document/edit/feedback
capacity exceeded
coordination unavailable
persistent operation failed
```

### Infrastructure detail

不得直接暴露：

- absolute filesystem path；
- raw Node stack/error；
- Git stderr/SHA/lock path；
- companion/internal state；
- command line。

A1 不用 regexp 对 arbitrary raw exception“洗一遍再暴露”；unknown infrastructure exception只返回 generic safe failure，详细 diagnostic进 stderr/logger。

---

## 9. Runtime bootstrap

Before Tool serving：

```text
obtain raw sourceRoot startup fact
→ E1 resolve/create ProjectId mapping
→ E1 createStorageBinding({ brainRoot, projectId })
→ runtime composition ensures required global/project real core workspace through E2/E1
→ construct application services
→ best-effort E3 repository/history setup
→ register/serve Tools
```

**Required bootstrap failure**（project binding不可建立、required global/project core不能真实建立/读取）→ runtime不进入可用 Tool service。

**E3 Git/repository setup failure** → 只记录 history-unavailable diagnostic；runtime仍正常 serving cognition Tools。后续 anchor可以继续 best-effort尝试 checkpoint/setup。

Bootstrap不猜 project/session、不自动 migrate legacy state。Global/project required core materialization属于 runtime composition，不属于 A1 handler；scope-cycle是 auxiliary state，缺失/写失败不构成 serving gate。

---

## 10. A2 Hook-backed Restore Adapter

A2只负责 host 在真实 turn boundary 触发 read-before-think，并选择一种 host 实际能可靠承载的 delivery：

```text
host detects real new user-message / pre-reasoning boundary
→ exactly one of:
   A. obtain reliable project/session facts
      → call the same B4 anchor semantics used by brain_think
      → inject only AnchorResult.context into model input
   B. inject a short instruction requiring one immediate model-visible brain_think call
```

当 host 把 hook tool output 只转换为普通 additional context、而不是 explicit ToolResult，且 replay 证明模型会把它弱化为背景时，B 是合法的 attention-strengthening adapter；它必须明确 hook 尚未 restore、同 turn 不得重复调用、latest user message 仍定义 current task。

A2 不拥有另一份：

- ranking；
- renderer；
- cycle/exposure transition；
- memory parser；
- persistence decision；
- query analysis。

### Tool surface

如果 host hook已经机械替代 explicit `brain_think`：

```text
model-visible surface = remaining 10 tools
```

如果 host没有 automatic restore：

```text
model-visible surface = all 11 tools
```

instruction hook 也属于 all 11 tools：hook 只拥有 trigger instruction，显式 `brain_think` 仍拥有 restore。是否隐藏 think只取决于 host integration是否实际替代了 restore，不改变 B4 behavior。

### Failure boundary

A2 不自行发明 retry/dedupe/fail-open/fail-closed policy。B4 已经定义哪些情况是 primary restore failure、哪些只是 successful context + degraded diagnostics；A2必须忠实消费这个结果：primary failure沿宿主正常失败通道处理且不得伪造空 context，degraded diagnostics不取消 `context`，也不注入为 persistent cognition。

---

## 11. DSH current adapter note

Current DSH evidence说明 host可取得：

```text
source root
agent/session id
pre-step/new-user boundary
model context injection point
```

因此当前 adapter可以：

```text
new user event
→ use agent.id as current session fact
→ call same B4/brain_think application
→ inject actual context
```

对于 model主动调用且省略 path 的 glob/grep，adapter也应把同一个 current session fact作为 trusted host metadata提供给 A1；不得通过修改 ordinary Tool model args制造第二份 session contract。

当前实现使用什么 metadata key、怎样连接 internal MCP client、怎样 spawn/reuse project process属于 DSH adapter implementation，不是 brain canonical Design。

Plugin 的 model-visible tool descriptors必须来自 §5 同一 in-code contract source，不保留独立 vendored schema/description表。

---

## 12. Codex/current MCP host note

某些当前 MCP host能在 tool invocation metadata中提供 thread/session identity。A1提供通用的per-invocation resolver option，使host adapter能在一次解析中共同提供project-bound application services与trusted session identity，避免两者来自不同生命周期。

当前 Codex adapter在同步 `UserPromptSubmit` 中读取官方hook input的 `session_id`与 `cwd`并保存同一条host-owned binding；plugin MCP entry再以每次调用的thread metadata查找该binding。Codex-specific字段、持久化位置与校验属于plugin implementation，不进入brain核心。绑定缺失或冲突时fail closed，不回退到长驻MCP进程cwd，模型显式参数也不能覆盖trusted session。

当前 Codex adapter 使用同步 `UserPromptSubmit` command hook直接调用与 `brain_think` 相同的 B4 restore path，并把未改写的 `AnchorResult.context` 作为 `hookSpecificOutput.additionalContext` developer context 注入。因为 hook 已机械完成 restore，plugin MCP server隐藏 model-visible `brain_think`，只暴露其余十个工具；同一 turn 不再要求或允许第二次 model-triggered restore。

具体 key（例如当前 Codex integration 使用的 thread metadata）只是 adapter evidence：

- 不进入 MCP public contract；
- host未来不提供时保持 no-session binding；
- 不为了兼容旧 key设计多层 fallback chain。

---

## 13. Generic MCP read-before-think boundary

Generic MCP protocol本身不能保证模型一定在每个新用户消息后主动调用 `brain_think`。

因此无 hook host：

```text
Tool contract / description
→ strong best-effort guidance: think before substantive reasoning
```

有 host hook时：

```text
mechanical host trigger → B4 → actual context injection
or
host turn trigger → one immediate explicit brain_think instruction → ToolResult
```

Design不通过在 MCP adapter内分析 latest user message来伪造 hook能力。

---

## 14. Security / trust boundary

Trusted：

- runtime startup sourceRoot；
- host adapter提供的 current-session fact；
- canonical in-code public Tool definitions。

Untrusted/model-controlled：

- public Tool arguments；
- brain public paths/patterns/content。

Rules：

- project/source-root mapping不能由public cognition Tool任意覆盖；
- session_id只是 opaque identifier，仍经 B1 validate；
- raw host metadata不能直接成为 filesystem path；
- public result/error不泄露 physical/Git/process internals；
- host adapter不能绕开 B1/B2/B3/B4直接写 brain store。

---

## 15. Coding constraints

1. one project-bound runtime instance；
2. one in-code public Tool definition source；
3. public contract comes from Frozen Tool Contract, not current SDK convenience；
4. no exact SDK/Zod version as Design truth；
5. no vendored A2 tool contract；
6. no default/fake session；
7. session resolution only for think and omitted-path glob/grep when needed；
8. concrete-path operations do not depend on unrelated host session metadata；
9. A1 only adapts/dispatches/results/errors；
10. A2 only triggers same B4, injects `AnchorResult.context`, routes diagnostics separately；
11. no hook-specific ranking/renderer/retry/dedupe/failure reinterpretation；
12. no child-process/InstanceManager algorithm in canonical semantic Design；
13. no legacy schema/config/metadata compatibility unless explicitly required。

---

## 16. Required tests

### A1 public surface

- exact current 11 Tool names；
- schemas accept/reject representative Contract cases；
- no project-root/debug/approval/legacy args；
- same in-code definitions feed every exposed host surface。

### Binding

- startup sourceRoot解析出的ProjectId在runtime binding后保持不变；
- invalid project binding / required global-project core bootstrap fails before Tool serving；
- Git unavailable/repository setup failure does **not** block Tool serving；
- runtime required global/project scopes exist before first Tool call；
- no legacy auto-detection/migration。

### Session

- trusted host session wins，conflicting explicit think session被拒绝；
- explicit think session在trusted host session absent时作为fallback；
- no session fact → no session scope, never `default`；
- omitted glob/grep consumes current session when available；
- concrete path operations do not need session metadata。

### Result / error

- think cognition payload equals B4 `AnchorResult.context`；public-safe degraded diagnostics may appear only in a separate warning surface；
- B2/B3 normal text passes through adapter without alternate representation；
- semantic errors stay actionable；
- absolute paths/raw Git/stack do not appear。

### A2

- one real user boundary triggers exactly one shared B4 call according to host event semantics；
- injected cognition bytes equal B4 `AnchorResult.context`；diagnostics are logged/routed separately and not injected as cognition；
- hook mode does not expose a second model-visible think trigger；
- explicit mode retains think；
- A1/A2 same binding/state yield same B4 cognition semantics。

---

## 17. Convergence note

Earlier draft froze MCP SDK/Zod APIs, all ten schema implementations/descriptions, concrete Codex/DSH metadata keys, plugin config, child-process lifecycle and instance manager behavior。

Those details were useful implementation evidence but not architecture truth。

Current Integration Design contracts back to：

```text
project/session invocation facts
+ one public contract source
+ A1 dispatch/result/error + separate degraded warning transport
+ A2 hook → same B4 → inject context only / route diagnostics separately
```

Host-specific wiring remains an adapter implementation unless a Requirement explicitly elevates it。
