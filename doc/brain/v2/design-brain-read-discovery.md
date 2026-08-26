# brain v2 Detailed Design — Read & Discovery Application

> **Layer:** Phase 5B Detailed Design child。
> **System owner:** B2 Read & Discovery Application。
> **Parent:** `design-brain-system.md`。
> **Frozen inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。
> **Dependencies:** B1 namespace / E1 physical projection → `design-brain-namespace-storage.md`；C1/C2/codecs → `design-brain-cognition-state.md`；D1 → `design-brain-accessibility-state.md`；D2 → `design-brain-scarcity-selection.md`。
> **Supersedes:** `design-brain-runtime.md` §10 与 §12.4 中属于 B2 的 active discovery / exact-read implementation truth。
> **Status:** **Design Frozen (2026-08-24, evidence-corrected re-freeze)**；canonical v2 Detailed Design baseline。

---

## 1. 本文职责

B2 拥有四个 model-initiated read/discovery use cases：

```text
brain_ls
brain_glob
brain_grep
brain_cat
```

共同结构：

```text
public query
→ B1 logical target/search scope
→ load current public cognition state
→ familiar tool truth
→ only if output becomes scarce: D2 archival ordering
→ B2 whole-record/page packing
→ model-visible result
```

关键边界：

- B2 决定 `ls/glob/grep/cat` 的 **truth**；
- D2 只在结果竞争有限 output 时排列 archival cognition；
- C1 summary 是 gist，不是 grep match truth；
- `ls/glob/grep` presentation 不产生 D1 learning/exposure transition；
- `brain_cat` 对 archival 实际返回 document line 时触发 D1 exact-retrieval transition；
- exact-retrieval learning update 是 auxiliary side effect：B2 通过 coordinated persistence collaborator best-effort 记录；失败可丢失本次 refresh，不反向取消已经正确读取的 content，也不要求 Git 成功。

---

## 2. BDD boundary：core resident 与 archival discovery 分开

Frozen BDD 的核心 residency contract：

```text
core
→ applicable 时由每轮 brain_think / anchor 完整恢复
→ 不依赖 active discovery

archival
→ passive cue / active discovery / exact read
```

因此 B2 active-discovery baseline：

- `brain_ls` / `brain_glob` / `brain_grep` 只作用于 `<scope-root>/memories/...` archival subtree；
- `brain_ls(path)` 只接受 memories-root / role-root / nested directory，返回该 directory 的 direct children；
- `brain_glob` candidate/result 只包含 active archival memory paths，不返回 scope root、core 或 directory match；
- `brain_grep` content corpus只包含 active archival Markdown；core 不进入 grep corpus；
- omitted glob/grep path 联合 default accessible materialized scopes 的 memories trees；
- `brain_cat` exact read concrete archival document；适用 core 已由 anchor 完整 resident。

Public address namespace包含 concrete core、archival item 与 archival directories；standalone scope prefix 只参与完整 path grammar，不构成 object。core 的 concrete path 用于 `brain_edit` maintenance / storage identity，但 core 已 resident，不进入 B2 read/discovery。不同 Tool 按 object kind拥有不同合法域。

---

## 3. Concrete modules

当前 baseline：

```text
src/application/read-discovery.ts   # B2 cognition-specific orchestration
src/brain/discovery.ts              # B2 pure namespace/query/result algorithms
src/adapters/pi-tools.ts            # direct Pi Agent Tool execution adapter
```

### 3.1 `read-discovery.ts`

拥有：

- current applicable scopes 与 canonical cognition membership；
- alias/root/object-kind mapping；
- summary / questioned / D1 / D2 composition；
- Pi Tool 调用前后的 domain-specific mapping；
- public result/error composition；
- `brain_cat` exact retrieval 后的 auxiliary learning。

不重新拥有 Pi 已提供的 generic Tool cancellation、read/find/ls execution、ripgrep subprocess 或 grep truncation。

### 3.2 `discovery.ts`

pure：

- archival discovery namespace node construction；
- direct-child derivation；
- canonical public-path glob matcher（供 `brain_glob` domain matching）；
- logical line splitting；
- grep record grouping/context；
- brain-specific final-output budget packing；
- deterministic result rendering helpers。

### 3.3 `adapters/pi-tools.ts`

直接调用 `@earendil-works/pi-coding-agent` 的公开 Tool definitions：

```text
createLsToolDefinition
createFindToolDefinition
createReadToolDefinition
createGrepToolDefinition
```

`ls/find/read` 通过 Pi 公开的 operations seam 接收 brain 提供的 virtual/canonical cognition input；`grep` 直接把 canonical physical search root交给 Pi grep，再把上游 locator 映射回 cognition identity。adapter 只做必要的输入/输出桥接，不复制 Pi Tool 的通用执行实现。

---

## 4. Dependency / primitive baseline

B2 不自行实现 glob grammar 或 regex engine。应复用成熟 primitive：

- public glob matcher：支持当前 familiar path glob 能力（至少 `* / ** / ? / []`，以及当前 contract/guidance 使用到的组合 pattern），匹配 B1 canonical `/` public path；
- grep engine：成熟 lexical/regex search primitive，支持 literal / case-insensitive / regex，并能返回 document + logical line evidence；
- subprocess型实现不得通过 shell拼接 model pattern/path。

当前 implementation 可以选择 Picomatch、ripgrep 等成熟组件；**exact package、wrapper、version 与 CLI flags由 implementation/package lock管理，不属于 canonical Design truth**。

B2 不复用 pi ls/grep ToolResult 作为 public truth，也不使用 JS `RegExp` + 自造递归 filesystem search来重新设计成熟 grep primitive。

---
## 5. Application read port

B2 依赖一个 typed current-state read port。具体 E1/E2 implementation 在其 child DD 冻结，但 B2 要求的 contract 固定为：

```ts
export interface DiscoveryDiagnostic {
  readonly kind: "alias-followed" | "entry-skipped"
  readonly path?: LogicalBrainPath
  readonly message: string
}

export interface CanonicalDiscoveryRoot {
  readonly requested: LogicalDiscoveryDirectory
  readonly path: LogicalDiscoveryDirectory
  readonly aliasFollowed: boolean
}

export interface ArchivalPathListing {
  readonly paths: readonly LogicalArchivalPath[]
  readonly diagnostics: readonly DiscoveryDiagnostic[]
}

export interface ReadDiscoveryStatePort {
  isScopeMaterialized(scope: ScopeRef): Promise<boolean>
  resolveDiscoveryRoot(path: LogicalDiscoveryDirectory): Promise<CanonicalDiscoveryRoot | undefined>
  listActiveArchivalPaths(scope: ScopeRef): Promise<ArchivalPathListing>
  loadArchival(path: LogicalArchivalPath): Promise<LoadedArchival | undefined>
  readScopeCycle(scope: ScopeRef): Promise<ScopeCycleState>
}

export interface LoadedArchival {
  readonly requestedPath: LogicalArchivalPath
  readonly path: LogicalArchivalPath  // E1 resolved canonical archival identity
  readonly aliasFollowed: boolean
  readonly document: ArchivalDocument
  readonly epistemic: EpistemicState
  readonly accessibility: AccessibilityPersistenceState
  readonly companionState: "persisted" | "fresh"
}
```

Port guarantees：

- all existing public resources pass through E1 real-target resolution；returned `path`/`paths` are **canonical public refs after alias resolution**, never alias-derived second identities；
- canonicalRef 的 object kind由 resolved target拥有；例如 archival-looking alias→core 不能被 `loadArchival`伪装成 archival，必须映射 wrong-kind/exact failure；
- Markdown 返回值已经过 E1 codec + C1 validation；companion 若 current/valid 则恢复，否则得到 fresh C2/D1 state；
- `listActiveArchivalPaths` 只返回四个 canonical role subtree中的 current `.md` cognition；direct path + aliases按 resolved target dedupe；broken/inaccessible/outside alias返回 `entry-skipped` diagnostic并继续；directory alias cycle/repeated target用 operation-local canonical-real-directory visited set终止 traversal；
- `resolveDiscoveryRoot`：若 requested directory有 existing alias，返回 same-scope canonical target directory；若 static logical memories/role root没有 physical entry但按 B2 namespace仍存在，则保持 requested canonical logical root；resolved target若不是合法 discovery directory则 wrong kind；
- 路径由 B1 typed representation 表达，不返回 physical path；
- pure reads 不创建 scope/directories；
- concrete malformed archival exact load明确失败；broad enumeration可按 caller contract warning+skip该 item；companion missing/malformed/hash-stale/cross-state-invalid 不否定 Markdown，而是 fresh fallback。

B2 不建立 persistent index；port implementation 可以 per-operation 扫描 current tree并返回 ephemeral list。

Fresh fallback 本身不是 repair operation：`brain_ls` / `brain_glob` / `brain_grep` 只在内存使用 fresh state，不因此写 companion。`brain_cat` 若返回 substantive lines，会 best-effort 记录 exact-retrieval transition；该 auxiliary write 失败只丢失本次 refresh。

---

## 6. Read context / accessible scopes

```ts
export interface ReadDiscoveryContext {
  readonly currentSessionId?: SessionId
}
```

当前 project 已由 runtime binding 固定，不作为 model parameter。

### `defaultSearchScopes(context)`

返回：

```text
global
project
+ current session only when reliable session binding exists
```

固定顺序只用于 deterministic enumeration；它不是 ranking priority。

Omitted `brain_glob.path` / `brain_grep.path` 使用这个 scope set。

显式 `@session/<sid>/...` 仍按其 concrete logical path处理；是否存在由 state port 判断，不把 unknown session变成 `default`。

---

## 7. Current archival discovery namespace derivation

B2 不把 arbitrary physical directory leftovers 当 public discovery truth。Active discovery 只构造每个 materialized scope 的 `memories/` subtree。

### 7.1 Static memories nodes

一个 materialized scope 的固定 discovery directories：

```text
<scope-root>/memories/
<scope-root>/memories/decision/
<scope-root>/memories/knowledge/
<scope-root>/memories/intention/
<scope-root>/memories/skill/
```

即使 physical `memories/` 尚未 materialize，这些 ontology nodes 在 materialized scope 内仍成立。scope root 与 `core.md` 不属于 active-discovery namespace。

### 7.2 Nested directories

Nested discovery directory 存在当且仅当：

> 至少一个 active archival path 以该 nested directory 为前缀。

因此 rm 最后一条 child 后留下的空 physical directory不会继续作为 public discovery truth。

### 7.3 `buildScopeDiscoveryNamespace(scope, canonicalArchivalPaths)`

Input 必须已经经过 E1 alias resolution + canonical-target dedupe；B2 不用 alias entry path另造 namespace node。

pure 输出：

```ts
export type PublicDiscoveryNode =
  | LogicalDiscoveryDirectory
  | LogicalArchivalPath
```

Algorithm：

1. add memories root + 4 role roots；
2. for each active archival path：
   - add every nested directory prefix；
   - add archival leaf；
3. dedupe by canonical B1 public path；
4. return canonical-path lexical asc list。

不加入 standalone scope prefix/core，也不根据 filesystem directory entry生成额外 node。

---

## 8. Logical line coordinate

B2 与 C1/E1 的共同 contract：输入已经是 LF-normalized `LogicalMarkdownText`。

### 8.1 `splitLogicalLines(text)`

```ts
function splitLogicalLines(text: LogicalMarkdownText): readonly string[]
```

Algorithm：

```text
text == ""
→ []

otherwise:
parts = text.split("\n")
if text endsWith "\n"
→ drop exactly the final split sentinel
return parts
```

Examples：

```text
"a"       → ["a"]
"a\n"     → ["a"]
"a\n\n"   → ["a", ""]
"\n"      → [""]
""         → []
```

因此 blank logical line是真实 line；terminal newline本身不制造额外 phantom line。

Line number 永远 1-based。

---

## 9. Shared numeric argument validation

### Cat

```text
offset default = 1
limit  default = 100
```

要求：

- offset positive safe integer；
- limit positive safe integer。

### Grep

```text
offset default = 0
context default = 0
ignoreCase default = false
literal default = false
```

要求：

- offset non-negative safe integer；
- context non-negative safe integer。

Invalid numeric input fail，不 floor/ceil/clamp。

---

## 10. Public glob matcher

### 10.1 Matching subject

所有 glob pattern 都匹配 **B1 canonical full public path string**：

```text
@project/memories/decision/**/*.md
@session/s1/memories/**/migration*.md
**/*.md
```

`path?` 是先缩窄 candidate universe 的 search root，不改变 `pattern` 的坐标系。

因此 grep 的 `glob?` 也使用同一 full-public-path glob language，不引入 basename-only 第二语法；想过滤所有 Markdown 可写 `**/*.md`。

### 10.2 `compilePublicGlob(pattern)`

```ts
function compilePublicGlob(pattern: string): (publicPath: string) => boolean
```

Contract：

- matcher subject 永远是 B1 canonical full public path；
- `/` 是唯一 public separator；不把 `\` 当 separator；
- 不启用 basename-only / matchBase 第二语义；
- invalid pattern → `DiscoveryQueryError(invalid-glob)`；
- matcher compile一次/query，不 per candidate重复 compile。

具体 glob library/options只要满足这些 public semantics即可，不冻结 package API/version。

---
## 11. Shared result records

```ts
export type DiscoveryNodeRecord =
  | {
      readonly kind: "directory"
      readonly path: LogicalDirectory
    }
  | {
      readonly kind: "archival"
      readonly path: LogicalArchivalPath
      readonly summary: string
      readonly status?: "questioned"
    }
```

Active 不重复输出 `status=active`；questioned leaf 输出 `status=questioned`。ls/glob 不展开 challenge；需要完整 current challenge 时 `brain_cat` exact read。

`summary` 只来自 C1 current document；不从 cache/index读取。

---

## 12. Shared internal output budget

B2 的 ls/glob/grep calibration baseline：

```ts
export const DISCOVERY_MAX_RECORDS = 64
export const DISCOVERY_MAX_RENDERED_UTF8_BYTES = 8192
```

Cat 另使用相同 rendered safety envelope：

```ts
export const CAT_MAX_RENDERED_UTF8_BYTES = 8192
```

Cat public `limit` 仍控制 logical line request；8192 bytes只是 ToolResult safety，不成为第二 paging coordinate。

这些数值只能 Design-first calibration。

---

## 13. Whole-record packing

### 13.1 Rule

B2 先形成 canonical **whole logical records**，再 render/pack；不先拼巨型 string 再任意从中间切。

```text
record count <= 64
AND
full rendered response UTF-8 bytes <= 8192
```

### 13.2 `packDiscoveryRecords(orderedRecords, renderer, trailer)`

Algorithm contract：

1. 按 already-determined canonical result sequence，从头 whole-record greedy pack；
2. 不跳过一个正常可表示的大 record 去塞后面更小 record；
3. 满足 record-count + rendered-byte bounds；
4. overflow 时明确 `truncated` 与对应 continuation-or-refine affordance；不要求计算完整 universe 的精确 omitted count；
5. discovery gist/match record 若单个首 record超过 byte safety bound，可使用 tool-specific **显式 bounded representation**；`brain_cat` exact document line 不使用 excerpt-as-content，见 §19；
6. canonical locator / object identity / matching line coordinate等 continuation 所需 identity不能 silent truncate；mandatory locator本身无法表达时 fail `render-safety-bound-exceeded`。

具体 excerpt长度、从行首还是 match附近取片段、ellipsis 字符等属于 renderer implementation，不冻结为跨版本算法。

---
## 14. `brain_ls`

### 14.1 Input

```text
brain_ls(path)
```

requested path 先由 B1 parse 为 `LogicalDiscoveryDirectory`：memories-root / role-root / nested；standalone scope prefix/core/concrete archival item → wrong kind。

随后调用 `resolveDiscoveryRoot(requested)`：existing alias 跟随 E1 real target并得到 canonical discovery directory；resolved target object kind不再是 discovery directory → wrong kind。后续 direct-child truth、ordering、render全部使用 **resolved canonical directory**。

### 14.2 Directory existence

- canonical memories-root / role-root：scope materialized 即存在，即使 physical directory尚未创建；
- canonical nested directory：至少一条 active canonical archival descendant 才存在；
- absent scope/nested directory → not found；
- broken/inaccessible/outside alias exact target → explicit alias/containment failure，不当成普通 no-result。

不 materialize scope/dir。

### 14.3 `directChildren(directory, discoveryNamespace)`

pure：只返回 parent 正好等于 directory 的 discovery nodes，不 recursive。

Example：

```text
@project/memories/
→ decision/
→ intention/
→ knowledge/
→ skill/
```

Nested directory只来自 active archival path prefixes。

### 14.4 Ordering

先形成 true direct-child set。

如果所有 records 可完整装入 budget：

```text
directory records canonical path lexical asc
then archival records canonical path lexical asc
```

如果超 budget：

```text
directory records canonical path lexical asc
then archival records via D2 active-discovery comparator
```

结构节点不能因 archival strength 被排挤掉。

### 14.5 Render

Directory：canonical path + kind。

Archival：canonical path + summary + questioned status when applicable。

### 14.6 Truncation

超额：

```text
truncated=true
affordance=narrow path or use brain_glob/brain_grep
brain_ls is not pageable
```

无 offset/cursor/page2。展示 ls 不调用 D1 transition。

---

## 15. `brain_glob`

### 15.1 Input

```text
brain_glob(pattern, path?)
```

`path?` 若存在先由 B1 parse 为 `LogicalGlobSearchRoot`，再经 `resolveDiscoveryRoot` canonicalize existing alias；resolved target必须仍是 legal memories-root / role-root / nested search directory。Candidate narrowing使用 canonical root。

Omitted path：default accessible materialized scopes 的 memories trees；broad listing直接消费 canonical archival paths + diagnostics。

### 15.2 Candidate set

```text
for each selected scope:
  listActiveArchivalPaths(scope)
→ optional path-root narrowing
→ candidate archival paths only
```

standalone scope prefix/core/directory nodes不是 glob result；concrete archival item也不是 search root。

### 15.3 Truth

```text
candidate canonical archival path
→ compiled public glob matcher
→ true/false
```

D1/D2 不影响 match truth。

### 15.4 Enrichment

每个 true archival match load current C1/C2/D1 projection，产生 path + summary + questioned status when applicable。

### 15.5 Ordering / budget

- full result fits → canonical archival path lexical asc；
- scarcity → D2 active-discovery comparator；
- whole-record pack。

### 15.6 Truncation

```text
truncated=true
narrow pattern/path
brain_glob is not pageable
```

不提供 continuation。展示 glob 不修改 D1。

---

## 16. Pi Tool execution adapter contract

### 16.1 Direct reuse boundary

B2 production 直接依赖 `@earendil-works/pi-coding-agent` 的公开 Tool API。当前适配端口只把 cognition-specific data送入成熟 Tool，并把结构化需要映射回来：

```ts
interface PiDiscoveryToolPort {
  ls(entries, signal?): Promise<PiOrderedKeysResult>
  find(entries, pattern, matches, signal?): Promise<PiOrderedKeysResult>
  read(text, offset, limit, signal?): Promise<PiReadResult>
  grepRoot(root, request, signal?): Promise<PiGrepResult>
}
```

production `PiDiscoveryTools` 必须实际调用 Pi 的 `createLsToolDefinition` / `createFindToolDefinition` / `createReadToolDefinition` / `createGrepToolDefinition`；不能在该 adapter 中重新实现一套等价 Tool control flow。

### 16.2 Responsibility split

Pi Tool 拥有通用能力：

- cancellation；
- familiar `ls/find/read/grep` execution flow；
- read/grep generic output truncation；
- grep regex/literal/case parsing 与 ripgrep subprocess lifecycle；
- 对应平台与 Tool-level failure handling。

brain 外层拥有：

- public brain path grammar 与 scope applicability；
- canonical alias/object identity；
- active archival cognition membership；
- summary / questioned / D1 / D2；
- exact-read learning；
- model-facing cognition result composition。

### 16.3 Failure mapping

Pi generic execution error 只在跨入 B2 public boundary 时映射为必要的稳定 cognition/query error。invalid regex 必须映射为 `DiscoveryQueryError(invalid-regex)`；abort 保持可取消语义；其他 execution error不泄露不必要的 physical command/path。

---

## 17. `brain_grep`

### 17.1 Input scope

```text
brain_grep(pattern, path?, glob?, ignoreCase?, literal?, context?)
```

`path?` 先接受 B1 `LogicalGrepSearchRoot`：memories-root / role-root / nested directory；explicit root 经 `resolveDiscoveryRoot` canonicalize，resolved target 必须仍是 legal grep search directory。省略 `path` 时，对当前 applicable/materialized scopes 的 memories search roots 分别执行同一查询；未 materialize 的 optional session scope 不因此初始化。

standalone scope prefix/core/concrete archival item → wrong kind；它们不是 grep search root。

### 17.2 Pi Tool owns generic grep execution

B2 不再拥有独立的 ripgrep subprocess / pagination engine。production 直接复用 `@earendil-works/pi-coding-agent` 暴露的 grep Tool execution；brain 外层只承担 cognition-specific composition：

```text
canonical search root / applicable scopes
→ Pi grep(pattern, root, glob?, ignoreCase?, literal?)
→ parse returned matching locators
→ map/follow to canonical active archival cognition
→ discard non-cognition / malformed / duplicate aliases
→ hydrate current summary + epistemic status + logical line/context
→ bounded brain result rendering
```

Pi 的 cancellation、regex parsing、ripgrep process handling、match limit / byte truncation 等通用行为由上游 Tool 拥有，不在 brain 内再实现平行版本。

### 17.3 Corpus and match truth

Model-visible match 必须最终解析为所选 search scope 中的 active canonical archival Markdown；core、非 `.md` asset、malformed archival item、outside-scope target 不作为 model-visible grep result。

Pi/ripgrep 可以在物理 search root 中看到更多 filesystem entry；brain 在结果映射阶段只保留满足上述 cognition membership 的真实 match。上游 bounded execution 若在返回全部可能 filesystem match 前已达到其限制，结果按 bounded/truncated 语义处理，而不是由 brain 构造第二套完整-match pagination state。

`glob?` 使用 Pi/ripgrep familiar file-glob 语义，相对于每个 selected search root 收窄搜索；不再把它定义成 canonical full-public-path matcher。

### 17.4 Match record and logical evidence

```ts
export interface GrepMatchRecord {
  readonly path: LogicalArchivalPath
  readonly summary: string
  readonly status?: "questioned"
  readonly lineNumber: number
  readonly lineText: string
  readonly contextBefore: readonly LogicalLineExcerpt[]
  readonly contextAfter: readonly LogicalLineExcerpt[]
}
```

Pi grep 提供 locator/matching-line evidence；对最终保留的 active cognition，public `lineText/context` 从同一 C1 logical text 按 matching 1-based line coordinate 取得，使 summary/status 与 current cognition snapshot一致。

对于 matching line `L`：

```text
before = max(1, L-context) .. L-1
after  = L+1 .. min(totalLines, L+context)
```

不跨 document。

### 17.5 Result order and dedupe

同一 canonical archival path + matching line 只返回一次；alias/direct-path duplicates 合并。对 Pi 已返回且通过 cognition membership 的 match records，使用 deterministic canonical path + line number order，再进行 current result rendering。

如果 enriched output 超 brain 的 final transport budget，D2 可以在**Pi 本轮已返回的 matching cognition 集合内**决定哪些 records 更值得进入最终 bounded output；它不声称恢复上游 grep 因自身 limit 已未返回的 hidden matches。

### 17.6 Bounded result; no pagination

单次 grep 结果同时受成熟 Pi grep 的 generic match/output bound 与 brain 最终 transport bound 约束。任一层表明还有未展示结果时，最终结果显式带：

```text
truncated=true
affordance=narrow pattern/path/glob and search again
```

public schema/result 不提供 `offset`、cursor 或 `next_offset`。caller 需要继续定位时，通过更具体或调整后的 query/root/glob 重新执行 familiar grep。

### 17.7 State-change semantics

展示 grep result 本身不产生 D1 transition，不刷新 retrievability，也不增加 L0 exposure。

---

## 18. Grep rendering

按最终 selected records group by canonical archival document path：

```text
<canonical archival path>
summary: <current summary>
status: questioned       # only when applicable
<context-line>- <text>
<match-line>: <text>
<context-line>- <text>
```

- summary 一次/group；
- questioned status保留 current epistemic state；current challenge 可由后续 `brain_cat`恢复；
- overlapping context lines within same group dedupe；
- selected matching line用 `:` marker；context用 `-` marker；
- line number永远 logical 1-based；
- bounded/truncated 时 guidance 指向 refine query，而不是 page continuation。

### Oversized grep line

Pi grep 的 generic long-line truncation负责保护 subprocess/tool output；brain 最终 renderer仍保留 canonical path + matching line number，并可将 evidence 作为 bounded excerpt 展示。需要 exact content 时使用 `brain_cat(path, offset=lineNumber, limit=1)`；full locator本身无法容纳时 fail safety-bound，不截断 locator。


---

## 19. `brain_cat`

### 19.1 Input kind

```text
brain_cat(path, offset?, limit?)
```

允许：

```text
LogicalArchivalPath
```

`LogicalCorePath` 已由 anchor 完整 resident，并由 `brain_edit` 维护；directory / core → wrong kind。

### 19.2 Load

`loadArchival(requestedPath)`先通过 E1 existing-target resolution。Success 时 `LoadedArchival.path` 是 canonical archival path，CatPage/result/learning update都使用它；alias resolved target若是 core/其他 kind → wrong kind；broken/inaccessible/outside alias → exact failure。Markdown 不存在 → not found；removed cognition不会通过 active path返回。

### 19.3 Logical page

```ts
export interface CatPage {
  readonly path: LogicalArchivalPath
  readonly startLine: number
  readonly lines: readonly string[]
  readonly nextOffset?: number
  readonly representationBlockedAtLine?: number
  readonly status?: "questioned"
  readonly challenge?: string
  readonly safetyTruncated: boolean
}
```

Algorithm：

1. validate offset/limit；
2. `allLines = splitLogicalLines(document.text)`；
3. `startIndex = offset - 1`；
4. `requested = allLines.slice(startIndex, startIndex + limit)`；
5. 先计算 mandatory path/status/challenge/header envelope；它本身超 safety bound → `render-safety-bound-exceeded`；
6. 从 `requested` 开头逐条尝试加入**完整 logical line**；
7. line 加入当前 page 后超 byte bound，但该 line 在空 page + mandatory envelope 中可以完整表示 → stop before this line；`nextOffset = 该 line number`；
8. line 即使在空 page + mandatory envelope 中也无法完整表示 → stop before this line；`representationBlockedAtLine = 该 line number`，不返回 excerpt、不把该行计作 consumed；
9. `returnedLines` 只包含实际完整返回的 lines；`nextOffset` 永远指向下一条尚未由 `brain_cat` 完整返回的 logical line；
10. 因 byte safety 少于 requested `limit` 时，`safetyTruncated=true`；普通可继续 page 给 `nextOffset`，blocked line 另外给 exact recovery affordance。

因此：

```text
brain_cat exact read
→ full logical lines only
→ never excerpt-as-exact-content
→ never advance past bytes it did not return
```

### 19.4 Empty/out-of-range

- empty document → 0 document lines；
- offset beyond EOF → 0 lines；
- no nextOffset；
- no exact-retrieval learning event。

### 19.5 Archival epistemic projection

若 C2 questioned：

```text
status=questioned
challenge=<full current unresolved challenge>
```

`challenge` 是 mandatory current epistemic truth，不做 silent clipping。若 canonical path + full challenge + minimum envelope 已超 safety bound，fail `render-safety-bound-exceeded`。

这是 out-of-band metadata，不插入 Markdown lines、不改变 1-based offset coordinate。

### 19.6 Exact retrieval event is best-effort auxiliary learning

只有 `returnedLines.length > 0` 才形成 exact-retrieval event。Blank line `""` 也是实际 logical line，被返回时 count=1。

Content rendering/read result先独立成立；随后 B2 best-effort 请求 auxiliary update：

```text
if returnedLines.length > 0:
  acquire relevant coordination if available
  → reload current scope cycle + current companion/fresh fallback
  → D1.applyExactRetrieval(scopeState, currentAccessibility)
  → preserve C2 current state
  → persist full companion if possible
```

规则：

- reload 必须发生在该 auxiliary update 自己的 coordination boundary 内，避免拿 page-render 前的 stale companion覆盖并发 current state；
- auxiliary coordination/persistence/Git failure → record warning/log + drop this refresh；
- **已经正确读取并渲染的 CatPage 仍然 success**；不做“为了 learning state 回滚 read”；
- no returned line → no auxiliary update；
- B2 不要求 Git stage/commit 才返回 cat content。

### 19.7 Representation-blocked logical line

当 `representationBlockedAtLine=N`：

- `brain_cat` 不返回 line N 的 clipped excerpt 作为 exact content；
- line N 不算 consumed，不触发基于该行的 exact-retrieval event；
- model-facing result明确说明当前 exact-read transport 无法无损表示该完整行；
- affordance：`brain_absolute_path(path)` → 使用 host ordinary filesystem read 能力读取真实文件；
- 若模型之后仍想回到 `brain_cat` line coordinate，可在处理完 blocked line 后显式从 `offset=N+1` 继续；不增加 byte-offset/column/sub-line protocol。

Grep 的 oversized match excerpt 仍可存在，因为 grep 是 discovery evidence，不是假装 exact document read；若 grep excerpt 不够，先尝试 `brain_cat(path, offset=lineNumber, limit=1)`，若该 exact line也 blocked，再使用上述 filesystem escape hatch。

---
## 20. Result/error presentation

B2 normal output使用 plain ToolResult text，不用 XML wrapper。

共同要求：

- canonical public path；exact alias input成功后不回显 alias 作为第二 identity；
- broad alias-follow / skipped-entry diagnostics可在 result尾部用 concise warning表达，不把 physical realpath泄漏给模型；
- short execution fact；
- 只在需要时给下一步 affordance；
- 不输出 R/durability/exposure/internal score；
- 不输出 physical path、`.state`、Git SHA、lock/rollback detail。

No result：

```text
ls: empty directory

 glob: no matching public paths

 grep: no content matches

 cat: empty document / offset beyond end
```

这些不是 mechanism error。

---

## 21. Error model

```ts
class DiscoveryQueryError extends Error {
  code:
    | "invalid-glob"
    | "invalid-regex"
    | "invalid-offset"
    | "invalid-limit"
    | "invalid-context"
}

class DiscoveryObjectError extends Error {
  code:
    | "not-found"
    | "wrong-object-kind"
}

class DiscoveryRenderError extends Error {
  code: "render-safety-bound-exceeded"
}

class PiExecutionError extends Error {
  code: "invalid-regex" | "execution-failed" | "aborted"
}
```

Wrong kind result必须指出 legal affordance，例如：

- archival directory → `brain_ls`；
- concrete archival memory → `brain_cat`；
- resident core → `brain_edit` when maintenance is needed；
- content clue → `brain_grep`。

Error mapping不输出 raw Node/ripgrep physical diagnostic。

---

## 22. Ordering summary

| Tool / condition | Canonical order |
|---|---|
| ls full result fits | directory path asc；then archival path asc |
| ls scarce | directory path asc；then archival D2 active |
| glob full result fits | archival path asc |
| glob scarce | D2 archival active |
| grep full result fits | archival path asc → line asc |
| grep scarce | D2 archival document order → line asc |
| cat | document line order only |

Memory state only affects **scarce archival presentation**；core 不进入 active-discovery ordering。

---

## 23. No read-before-discovery mutation

`brain_ls / brain_glob / brain_grep` 全部 pure current-state reads：

```text
no scope creation
no exposure reset/increment
no retrieval reset
no durability reinforcement
no persistence side effect
```

`brain_cat` 只有 archival substantive exact page会产生 best-effort companion learning transition。

---

## 24. Coding constraints

1. B2 不直接读 physical path；
2. public namespace node只从 B1 typed path + current active archive paths构造；
3. structural directory existence不依赖 leftover physical dirs；
4. glob matcher compile一次/query；
5. grep regex只通过 ripgrep adapter；
6. ripgrep adapter只返回 logical path/line，不返回 public ToolResult string；
7. match truth先于 D2；
8. D2只在 output scarcity时调用；
9. summary不参与 grep match；
10. no persistent/long-lived discovery index；
11. no ls/glob continuation state；
12. grep offset unit只有 matching-line record；
13. cat offset unit只有 logical document line；
14. result packing不能改变 true match set；
15. all comparator/string order使用 canonical path + non-locale lexical rules。

---

## 25. Test seams required by this Design

### 25.1 Line coordinate

- empty / terminal newline / blank lines；
- cat offset 1-based；
- grep line matches cat line number；
- CRLF already normalized by E1。

### 25.2 Namespace/ls

- memories root / role roots even without physical memories dir；
- nested dirs derived from active paths；
- empty leftover physical dir not public；
- standalone scope prefix/core/concrete-item → wrong kind for ls；
- direct children only；
- low-R leaf still present when budget fits；
- overbudget structural affordance preserved；
- no D1 state change。

### 25.3 Glob

- full canonical pattern e.g. `@project/memories/decision/**/*.md`；
- `**/*.md`；
- representative `*` / `**` / `?` / `[]` patterns；
- memories-directory path narrowing；
- omitted path global+project+current session memories trees；
- low-R/questioned true archival match remains；
- directory/core never returned as glob matches；
- standalone scope prefix/core/concrete-item rejected as path root；
- overbudget refine/no page2；
- no D1 state change。

### 25.4 Grep engine

- literal special regex characters remain literal；
- regex representative ripgrep syntax；
- ignoreCase；
- invalid regex；
- physical path never escapes adapter；
- candidates are active archival documents only；
- candidate filter ignores rogue/unselected physical files；
- line-number mapping；
- abort kills child。

### 25.5 Grep application

- summary-only occurrence does not match if content line absent；
- one record per matching line, not per occurrence；
- context lines；
- memories/role/nested directory path searches active archival descendants；
- omitted path includes global/project/current-session active archival documents for materialized accessible scopes；
- standalone scope prefix/core/concrete-item path rejected as wrong kind；
- archival questioned status remains visible；
- full-fit all true archival lines visible；
- scarcity: D2 archival document order + line asc；
- offset 0-based continuation across archival matching-line sequence；
- unchanged state no duplicate/miss；
- page display no D1 transition。

### 25.6 Cat

- archival kind；core rejected because it is already resident；
- default 1/100；
- short doc full return；
- continuation；
- questioned challenge out-of-band；
- archival returned line → exact retrieval transition；
- offset beyond EOF → no D1 update；
- blank line counts；
- oversized line never becomes clipped exact content；blocked line is not consumed；filesystem escape hatch is explicit。

### 25.7 Budget

- 64 record bound；
- 8192 UTF-8 byte bound；
- whole-record greedy packing；
- multibyte Unicode byte counting；
- discovery oversized single record may use explicit bounded representation；cat oversized logical line follows §19.7 instead；
- locator-too-large fail；
- truncated/refine-or-continuation affordance accurate。

---

## 26. Convergence / compatibility boundary

B2只支持当前 familiar primitives：memories-directory direct-child `ls`、archival-path `glob`、archival-content `grep`、concrete archival `cat`。

不增加 legacy ToolResult shape、model-controlled discovery limit、hidden L1/L2 read mode、summary-as-match、physical-path rewrite、occurrence-based pagination；resident core 保持 anchor-resident + edit-maintained，standalone scope prefix不成为 public object。

具体 glob/grep package/version/CLI wrapper属于 implementation；current Design只冻结它们必须满足的 public semantics。

---

## 27. Implementation-ready completion check

实现者不再需要自行决定：

- active discovery为什么只覆盖 `<scope-root>/memories/...` archival subtree；
- ls/glob/grep 各自允许的 search-root object kind；
- memories discovery nodes怎样从 current archival paths得到；
- empty nested physical dirs是否属于 public discovery truth；
- glob matching subject/semantics；exact library/version/options implementation-managed；
- grep literal/regex/evidence contract；exact engine/version/process flags implementation-managed；
- grep record unit是 line还是 occurrence；
- ls/glob/grep 何时调用 D2；
- full-fit 与 scarcity order；
- fixed budgets 数值；
- whole-record packing；
- ls/glob continuation policy；
- grep bounded/truncated semantics、refine affordance，以及 public 无 pagination state；
- cat line split、offset、limit、EOF；
- cat exact retrieval触发条件；
- questioned challenge怎样与 Markdown coordinate分离；
- discovery 是否更新 exposure/R；
- physical/ranking state是否泄漏 public output；
- exact alias root/item是否先 canonicalize object kind/path；
- direct path + one/multiple aliases是否只形成一个 canonical result；
- directory alias cycle是否有限终止且不建立 persistent alias registry；
- broken/outside alias broad warning+skip、exact failure。

B2 exact-read learning update必须在自己的 coordinated auxiliary-update boundary内重新加载 current state，避免 stale overwrite；该 auxiliary update失败时丢失 refresh，不改变已经正确返回的 exact content。
