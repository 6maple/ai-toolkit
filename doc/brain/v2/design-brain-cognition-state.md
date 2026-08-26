# brain v2 Detailed Design — Cognition Documents, Epistemic State & Persistence Codecs

> **Layer:** Phase 5B Detailed Design child。
> **System owners:** C1 Cognition Documents + C2 Epistemic State + E1 Physical Storage Projection（Markdown / scope-state / companion codec 部分）。
> **Parent:** `design-brain-system.md`。
> **Frozen inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。
> **Sibling dependency:** physical paths / `.state` / companion mirroring 以 `design-brain-namespace-storage.md` 为 canonical truth。
> **Supersedes:** `design-brain-runtime.md` §5.2、§5.5、§12.2–§12.3 中属于 C1/C2/E1 codec 的具体 truth；旧综合稿迁移后只保留摘要 + 本文件链接。
> **Status:** **Design Frozen (2026-08-24, evidence-corrected re-freeze)**；canonical v2 Detailed Design baseline。

---

## 1. 本文要完成什么

本文把三类不同 owner 的 current state 明确分开：

```text
C1 Cognition Documents
→ core / archival Markdown 的 logical content/schema

C2 Epistemic State
→ current unresolved challenge + derived active/questioned

E1 Persistence Codecs
→ physical bytes / JSON record ↔ 上述 logical state + D1 persistence fields
```

关键原则：

```text
semantic state owner
≠
physical record owner
```

特别是一个 archival companion JSON 同时承载 C2 + D1 fields，并不意味着 codec 可以决定 question/resolve/reinforcement 语义。

本文不设计：

- B1 logical path / role / scope grammar；
- D1 accessibility event transitions / retrievability formula；
- D2 ranking；
- B2 read/search line paging；
- B3 write/edit/mv/rm/feedback operation sequencing；
- B4 anchor；
- E2 multi-resource read/write/rollback ordering；
- E3 Git staging/checkpoint。

---

## 2. Concrete module / dependency baseline

当前 implementation baseline：

```text
src/brain/documents.ts        # C1
src/brain/epistemic.ts        # C2
src/persistence/codecs.ts     # E1 codecs
```

依赖方向：

```text
B2/B3/B4
  ↓
C1 documents.ts      C2 epistemic.ts      D1 accessibility domain
        \               |                 /
         \              |                /
          └──────── E1 codecs.ts ────────┘
                         ↓
                 E2 persistence boundary
```

这里的箭头表达 **semantic consumption / persistence composition**，不是要求 `codecs.ts` 在源码 import graph 中回调 domain logic。实际代码应通过 typed state values 进入 codec；codec 不调用 C1/C2/D1 transition function。

### 2.1 Dependency baseline

Frontmatter parsing 必须复用成熟 YAML parser，而不是继续维护 v1 那种逐行 `key:value` 半截 parser。

Canonical Design只要求：

- parser 正确处理 YAML mapping/scalars/comments/block values；
- brain 只读取 `summary` / `importance`；
- 不 stringify/rewrite 整份 frontmatter；原始 Markdown text保持 owner truth；
- parser/library exact package/version由 implementation/package lock管理，不进入 Design truth。

Internal JSON strict validation同理可以复用当前成熟 schema validator；具体 library不是 cognition schema owner。

---

## 3. E1 Markdown physical codec

C1 永远处理 normalized logical text，不直接处理 filesystem bytes / CRLF。

### 3.1 Logical text normalization

```ts
export type LogicalMarkdownText = string & {
  readonly __brand: "LogicalMarkdownText"
}
```

只有 E1 codec 可以从 bytes / arbitrary persisted text 建立该 brand。

### 3.2 `decodeMarkdown(bytes)`

```text
function: decodeMarkdown(bytes: Uint8Array) -> LogicalMarkdownText
```

**Algorithm**

1. 使用 strict UTF-8 decoder；invalid byte sequence → fail；
2. 若 decoded string 的第一个 code point 是 U+FEFF BOM，移除这一个 BOM；
3. `\r\n` → `\n`；
4. remaining lone `\r` → `\n`；
5. 返回 branded logical text。

**Postconditions**

- text 不含 `\r`；
- newline 唯一表示是 `\n`；
- physical BOM 不进入 C1/B2 logical coordinate。

**Must not**

- replacement-character 容错 decode；
- 根据内容猜其他 encoding；
- trim document；
- normalize Unicode NFC/NFD；
- 修改 Markdown 其他字符。

### 3.3 `normalizeMarkdownInput(text)`

Tool input 已是 JavaScript string，但仍必须进入同一 newline normalization：

```text
string
→ optional leading U+FEFF remove
→ CRLF/lone CR → LF
→ LogicalMarkdownText
```

B3 在构造 resulting document 后必须先调用它，再交给 C1 validation。这样 persisted write、core capacity 与未来 B2 line coordinate 使用同一 logical text。

### 3.4 `encodeMarkdown(text)`

```text
LogicalMarkdownText
→ UTF-8 bytes, no BOM
```

writer 不再做任何 newline/frontmatter/content rewrite；logical text 已经是 LF baseline。

---

## 4. C1 document types

### 4.1 Importance

```ts
export const IMPORTANCE_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
] as const

export type Importance = (typeof IMPORTANCE_LEVELS)[number]
```

Importance 只接受 canonical enum string；numeric/boolean/其他 representation 直接 invalid，不做转换/fallback。

### 4.2 Core

```ts
export interface CoreDocument {
  readonly kind: "core"
  readonly text: LogicalMarkdownText
}
```

Core 没有 mechanism-required frontmatter；即使文本自身碰巧有 frontmatter，也只是普通 core Markdown content。

### 4.3 Archival

```ts
export interface ArchivalDocument {
  readonly kind: "archival"
  readonly text: LogicalMarkdownText
  readonly summary: string
  readonly importance: Importance
  readonly body: string
}
```

`summary / importance / body` 都是从 `text` 派生的 current logical view，不持久第二份 index/cache truth。

`body` 是 closing frontmatter delimiter 后的剩余 logical Markdown；保留原内容，不 trim。

---

## 5. C1 archival frontmatter envelope

### 5.1 Envelope grammar

Archival document 必须从第一个 logical character 开始：

```text
---\n
<YAML>\n
---\n
<body may be empty>
```

规则：

- opening delimiter 必须是第一行精确 `---`；
- closing delimiter 是其后第一个 column-0、整行精确 `---`；
- delimiter line 不允许前后空格；
- 不把 YAML `...` 当 closing delimiter；
- closing delimiter 后可以直接 EOF，也可以有 newline/body；
- frontmatter 中 block scalar 内缩进的 `---` 不是 column-0 delimiter，因此不会提前结束；
- 没有 closing delimiter → invalid archival document。

这不是通用 Markdown parser；只冻结 brain 当前 archival envelope。

### 5.2 `extractFrontmatterEnvelope(text)`

internal pure helper：

```ts
interface FrontmatterEnvelope {
  readonly yamlSource: string
  readonly body: string
}
```

**Algorithm**

1. require `text.startsWith("---\n")`；
2. 从第二行开始按 LF scan；
3. 找第一行 `line === "---"`；
4. `yamlSource` 是 opening/closing delimiter 之间的原始 logical substring，不 trim、不 rewrite；
5. `body` 从 closing delimiter 后一个 newline 之后开始；若 closing delimiter 即 EOF，则 body=`""`；
6. 返回 envelope。

不保留 offset 作为 persistence truth；B2 未来需要 line coordinate 时直接基于 full `text`。

---

## 6. C1 YAML parsing contract

### 6.1 Parser

使用：

```ts
import { parseDocument, isMap, isScalar } from "yaml"
```

概念调用：

```ts
const doc = parseDocument(yamlSource)
```

要求：

- `doc.errors.length > 0` → archival schema failure；
- top-level YAML node 必须是 mapping；
- parser warning 不自动让整个 document 失败，因为 additional frontmatter 不属于 mechanism semantics；
- 但 `summary / importance` 自身必须能作为 scalar string 读取，不能通过 collection/object coercion 获得；
- duplicate key 若被 parser 作为 error 报告则失败；不额外再造第二 YAML lexer。

### 6.2 Consumed keys

只消费 top-level：

```text
summary
importance
```

其他 keys：

```text
valid YAML
→ preserve in original text
→ no mechanism semantics
→ no reserved-key blacklist
```

例如额外出现：

```yaml
type: knowledge
status: questioned
owner: team-a
custom:
  x: 1
```

都不能覆盖 B1/C2/D1 truth；它们只是用户 Markdown metadata。

### 6.3 `summary`

要求 YAML value 是 string scalar。

```text
semanticSummary = value.trim()
```

- trim 后 empty → fail；
- C1 返回 `semanticSummary` 供 L0/discovery 使用；
- **不把 trimmed value 写回 document**；原始 quoted/plain formatting 保留；
- C1 不为 summary 另加 hard length limit。summary 是否是足够简洁、当前一致的 gist 属于主模型语义责任；bounded presentation由 B2/B4 output envelope负责。

因此 summary semantic value 是 document 的 deterministic projection，不是第二持久化 truth。

### 6.4 `importance`

要求 YAML value 是 string scalar，且值精确属于：

```text
low | medium | high | critical
```

不 lowercase、不 trim 后猜测、不接受 numeric、boolean、alias enum。

YAML parser 对 plain scalar 正常返回相应 string；若调用方写 quoted string，值相同则合法。

---

## 7. C1 key functions

### 7.1 `parseArchivalDocument(text)`

```text
function: parseArchivalDocument(text: LogicalMarkdownText)
  -> ArchivalDocument
```

**Reads / Writes**

pure；不访问 filesystem，不修改 document。

**Algorithm**

1. `extractFrontmatterEnvelope(text)`；
2. `parseDocument(yamlSource)`；
3. require top-level mapping；
4. require `summary` key exists exactly once according to parser validity；
5. require summary scalar string；derive `summary.trim()`；non-empty；
6. require `importance` key exists；
7. require importance scalar string + exact enum；
8. return `{ kind, text, summary, importance, body }`。

**Failure codes**

```text
missing-frontmatter
unterminated-frontmatter
invalid-frontmatter-yaml
frontmatter-not-map
missing-summary
invalid-summary
missing-importance
invalid-importance
```

**Must not**

- validate role/type from frontmatter；
- derive path/scope；
- fix malformed YAML；
- rewrite frontmatter；
- call LLM/NLP 判断 summary quality。

### 7.2 `validateCoreDocument(text)`

```text
function: validateCoreDocument(text: LogicalMarkdownText)
  -> CoreDocument
```

Current calibration baseline：

```text
CORE_DOC_MAX_CODE_POINTS = 4000
```

count algorithm：

```ts
Array.from(text).length
```

即 Unicode code points，不是 UTF-8 bytes、UTF-16 code units 或 grapheme clusters。

**Algorithm**

1. text 已由 E1 newline normalization；
2. `count = Array.from(text).length`；
3. count > 4000 → `CoreCapacityError`；
4. return `{ kind: "core", text }`。

empty core 合法。

**Must not**

- truncate；
- auto summarize；
- auto write archival；
- 因 frontmatter shape 拒绝 core。

### 7.3 `reparseAfterDocumentMutation`

B3 write/edit 不应维护单独 metadata patch helper。其 resulting full text 必须重新走：

```text
normalizeMarkdownInput
→ parseArchivalDocument OR validateCoreDocument
```

因此 summary/importance 永远由 resulting document 重新派生；禁止“edit body 后保留旧 parsed metadata object”。

---

## 8. C2 Epistemic State

### 8.1 Type

```ts
export interface EpistemicState {
  readonly challenge?: string
}

export type EpistemicStatus = "active" | "questioned"
```

valid invariant：

```text
challenge absent
OR
challenge is already trimmed, non-empty string
```

不允许内存里出现 `challenge: ""` 作为长期 valid domain state。

### 8.2 `activeEpistemicState()`

```ts
return {}
```

fresh cognition / overwrite replacement 的初始 C2 state。

### 8.3 `setChallenge(current, rawChallenge)`

pure。

**Algorithm**

1. `challenge = rawChallenge.trim()`；
2. empty → `EpistemicStateError(empty-challenge)`；
3. return `{ challenge }`；覆盖旧 challenge，不 append。

不修改 C1 document / D1 state。

### 8.4 `clearChallenge(current)`

pure。

1. current.challenge absent → `EpistemicStateError(no-current-challenge)`；
2. return `{}`。

这使 C2 自己维护 valid transition invariant；B3 `feedback(resolve)` 负责把该 domain failure 映射成 public operation result。

### 8.5 `deriveEpistemicStatus(state)`

```ts
return state.challenge === undefined ? "active" : "questioned"
```

status 永远 derived，不存进 JSON、Markdown 或 index。

### 8.6 C2 forbidden state

不得增加：

```text
status
challengeHistory
questionCount
updatedAt
resolvedAt
confidence
```

未来只有 Frozen behavior / real failure 要求后才能扩 schema。

---

## 9. E1 scope-state JSON codec

D1 拥有 `cycle` 的语义/transition；E1 只拥有 wire shape。

### 9.1 Physical record

```json
{
  "cycle": 42
}
```

schema：

```ts
const scopeStateRecordSchema = z.strictObject({
  cycle: z.number().int().nonnegative(),
})
```

### 9.2 `decodeScopeState(bytes)`

1. strict UTF-8 decode；
2. JSON.parse；syntax failure → `CodecError(invalid-json)`；
3. strict schema parse；unknown/missing/invalid field → `CodecError(invalid-scope-state)`；
4. return typed persistence value for D1。

Codec 本身不把不存在或 malformed scope-state bytes 偷偷 decode 成 `{cycle:0}`；它只返回 valid typed value 或 typed codec failure。**Application 层**对一个 cognition workspace 真实存在、但 auxiliary scope-cycle record 缺失/无法解释的情况，按 Frozen Acceptance 将该 record 视为 unavailable，并显式调用 `initialScopeCycleState()` 得到 fresh learning coordinate。fresh session 的真实 `core.md` 创建仍由 scope initialization owner负责，不能由 codec伪造。

### 9.3 `encodeScopeState(state)`

writer field order固定：

```text
cycle
```

输出：

```text
JSON.stringify(record, null, 2) + "\n"
```

UTF-8 no BOM。

---

## 10. E1 archival companion codec

### 10.1 Physical wire record

```ts
interface CompanionRecord {
  readonly contentHash: string
  readonly challenge?: string
  readonly ageCycles: number
  readonly anchorCycle: number
  readonly durability: number
  readonly exposure: number
}
```

字段 owner：

| field | semantic owner |
|---|---|
| `contentHash` | E1：绑定当前 normalized Markdown 内容，判断附加状态是否仍属于当前真实资源 |
| `challenge` | C2 |
| `ageCycles` | D1 |
| `anchorCycle` | D1 |
| `durability` | D1 |
| `exposure` | D1 |

E1 只拥有这些 fields 怎样组合成一个 physical JSON record。

### 10.2 strict schema

```ts
const companionRecordSchema = z.strictObject({
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  challenge: z.string().optional(),
  ageCycles: z.number().int().nonnegative(),
  anchorCycle: z.number().int().nonnegative(),
  durability: z.number().finite().positive(),
  exposure: z.number().int().nonnegative(),
})
```

JSON unknown fields → fail loud；与 Markdown frontmatter 不同，internal mechanism JSON 不是用户扩展面。

当前不增加 schema version field。没有 migration requirement/evidence 时，不预建 version negotiation。

### 10.3 Cross-field validation

Codec 可以验证**结构性可判定 invariant**：

```text
challenge absent or string
ageCycles >= 0 integer
anchorCycle >= 0 integer
durability > 0 finite
exposure >= 0 integer
```

`anchorCycle <= currentScopeCycle` 需要 current scope state 才能判断，属于调用方/D1 cross-record validation，不由单-record codec 猜 context。

### 10.4 Challenge canonical representation

Companion reader与 C2 domain invariant一致：

```text
challenge absent
→ active

challenge present
→ must already be trimmed and non-empty
```

因此 persisted `challenge:""`、whitespace-only、或带首尾 whitespace 的 non-canonical challenge 都是 malformed internal state，**不做 compatibility normalization**。

Writer 对 active state始终 omit `challenge`；questioned state写入 C2 已 canonicalized 的 challenge。
### 10.5 `decodeCompanion(bytes)`

conceptual output：

```ts
interface DecodedCompanion {
  readonly epistemic: EpistemicState
  readonly accessibility: AccessibilityPersistenceState
}
```

`AccessibilityPersistenceState` 的 canonical semantic/transition owner 是 [design-brain-accessibility-state.md](design-brain-accessibility-state.md)；E1 codec 只消费其 persistence-facing shape：

```ts
interface AccessibilityPersistenceState {
  readonly ageCycles: number
  readonly anchorCycle: number
  readonly durability: number
  readonly exposure: number
}
```

**Algorithm**

1. strict UTF-8 decode；
2. JSON.parse；
3. strict schema parse；
4. if challenge present: require non-empty and `challenge === challenge.trim()`；otherwise malformed state；
5. construct C2 `EpistemicState`；
6. construct D1 persistence value without calculating R or performing learning transition；
7. return decoded state。

**Must not**

- derive/store retrievability；
- read summary/importance；
- infer role/scope/path from JSON；
- repair invalid numeric values；
- 在 codec 内 create missing/fresh defaults；fresh fallback 由 application 在收到 typed unavailable/failure 后显式决定。

### 10.6 `encodeCompanion({epistemic, accessibility})`

preconditions：inputs are already valid domain values。

writer deterministic field order：

```text
challenge   # only when questioned
ageCycles
anchorCycle
durability
exposure
```

active example：

```json
{
  "ageCycles": 0,
  "anchorCycle": 42,
  "durability": 1,
  "exposure": 0
}
```

questioned example：

```json
{
  "challenge": "Current unresolved challenge",
  "ageCycles": 3,
  "anchorCycle": 42,
  "durability": 2,
  "exposure": 1
}
```

serialization：2 spaces + final LF + UTF-8 no BOM。

---

## 11. Fresh-state construction boundary

本文只冻结 state shape，不抢 B3/D1 operation semantics。

### 11.1 Scope Initialization

D1 对一个没有可用 persisted cycle 的 materialized scope 使用 fresh auxiliary cycle baseline：

```text
cycle = 0
```

E1 codec 负责稳定 encode/decode；required core/current semantic writes由 E2 semantic boundary协调，scope-cycle等 auxiliary persistence可 best-effort。初始化 trigger 由 runtime bootstrap / B3 / B4 的 parent shared transition 决定。

### 11.2 Fresh archival cognition

当前 known baseline：

```text
C2:
  challenge absent

D1 persistence:
  ageCycles = 0
  anchorCycle = currentScopeCycle
  durability = 1
  exposure = 0
```

具体 `createFreshAccessibilityState(scopeState)` 已由 [design-brain-accessibility-state.md §7](design-brain-accessibility-state.md) 冻结；E1 不在 codec 中偷偷填这些 default。

Markdown 是 archival cognition truth。读取已存在 Markdown 时，如果 companion 缺失、无法 decode/validate、`contentHash` 与当前 normalized Markdown 的 SHA-256 不一致，或其 accessibility state 与当前 scope cycle 不协调，则把该 companion 视为不可用附加状态并使用同一个 fresh constructor：`challenge` absent + `createFreshAccessibilityState(currentScopeState)`。普通纯读只在内存得到 fresh state；本来就要持久化 companion 的后续操作再写出完整新 record。

---

## 12. Document + companion consistency contract

每条 active archival cognition 的存在与 cognition 内容由一个 archival Markdown resource 定义。Companion JSON 是可选的持久化附加状态：存在且绑定当前 Markdown 时恢复 challenge/accessibility；否则 fresh。

但它们拥有不同 truth：

```text
Markdown
→ cognition existence + summary / importance / cognition body

companion
→ contentHash + challenge + accessibility persistence state
```

禁止任何 derived duplication：

```text
companion.summary
companion.importance
companion.role
companion.scope
companion.path
companion.status
companion.retrievability
```

同样不建立 `index.json` 复制 Markdown metadata。

当 cognition operation 同时改变 Markdown 且其 public semantics 要求 C2/D1 continuity/reset 继续成立时，新的 required companion（或必要 delete）必须让 resulting Markdown 的 hydration得到正确 state，并在写 companion时绑定 resulting `contentHash`。Edit/mv 的 appropriate learning continuity、overwrite 的 fresh-learning reset都可能使 companion mutation成为 required；只有 B2/B4 的 incidental read/anchor learning才走 auxiliary best-effort。Codec 本身不决定 required/auxiliary，也不执行 I/O transaction。

---

## 13. Identity/lifecycle implications consumed by B3

本文不拥有 B3 sequencing，但 state APIs 必须支持 Frozen identity semantics：

```text
edit
→ C1 resulting document changes
→ existing C2/D1 state retained except other explicit event transitions

mv
→ same C1 + C2/D1 state relocated

write create
→ new C1 + fresh C2/D1 state

write overwrite
→ replacement C1 + fresh C2/D1 state
→ old challenge/learning do not carry

rm
→ current Markdown exits active tree
→ matching companion may be deleted as auxiliary cleanup; orphan companion alone never keeps cognition active
```

因此 codec/path layer不提供 hidden cognition UUID。

---

## 14. Error model

### 14.1 C1

```ts
class DocumentSchemaError extends Error {
  code:
    | "missing-frontmatter"
    | "unterminated-frontmatter"
    | "invalid-frontmatter-yaml"
    | "frontmatter-not-map"
    | "missing-summary"
    | "invalid-summary"
    | "missing-importance"
    | "invalid-importance"
}

class CoreCapacityError extends Error {
  code: "core-capacity-exceeded"
  actualCodePoints: number
  maxCodePoints: 4000
}
```

C1 error 可以引用 logical document issue，但不包含 physical path。

### 14.2 C2

```text
EpistemicStateError(empty-challenge)
EpistemicStateError(no-current-challenge)
```

### 14.3 E1 codec

```text
CodecError(invalid-utf8)
CodecError(invalid-json)
CodecError(invalid-scope-state)
CodecError(invalid-companion-state)
```

internal error 可保留 field-level diagnostic；public Tool error mapping 由 B/application owner完成，不能直接把 filesystem/hidden path/raw stack 泄漏给模型。

---

## 15. Validation placement / mutation discipline

### 15.1 On read

```text
E1 bytes decode
→ C1 parse archival/core OR E1 JSON codec
→ semantic owner receives valid typed state
```

invalid persisted state → fail loud；不让 B2/B3 继续在半合法 state 上工作。

### 15.2 On write/edit

```text
B3 builds complete resulting logical text in memory
→ E1 normalizeMarkdownInput
→ C1 parse/validate resulting document
→ C2/D1 derive resulting companion state when operation requires
→ E1 encode full records
→ B3 classifies required semantic companion vs auxiliary D1 follow-up
→ E2 semantic boundary or best-effort auxiliary persistence as appropriate
```

first physical side effect 必须发生在上述 pure normalization + structural validation 之后。

### 15.3 No direct patch persistence

禁止：

```text
replace one line in persisted frontmatter without reparsing full result
patch companion JSON.challenge directly
patch companion JSON.exposure directly
write index.json summary cache
```

所有 companion write（无论 required 或 auxiliary）都来自完整 after-state encode；不做字段级 patch。

---

## 16. YAML / JSON security and scope constraints

### YAML

- YAML 只解析 archival frontmatter envelope；body 不送 YAML parser；
- 只读取 top-level `summary/importance` scalar；
- 不执行 custom code/tag hooks；
- 不 stringify whole document；
- 不把 arbitrary YAML object merge到 application config/domain object。

### JSON

- mechanism JSON 使用 `JSON.parse + z.strictObject`；
- unknown field fail；
- codec 对 malformed record 返回 typed failure；application 可按对应 resource 的 Frozen fallback contract显式 fresh；
- 当前不增加 checksum/version/WAL，因为没有 Frozen requirement/real failure 支撑。

---

## 17. Coding constraints

1. `documents.ts` 不 import `node:fs/path`；
2. `epistemic.ts` 必须 pure；
3. `codecs.ts` 不 import MCP/host adapter；
4. `codecs.ts` 不调用 D1 ranking/learning 或 B3 feedback logic；
5. frontmatter extraction 只有一份 canonical implementation；不要在 renderer/search 再写 regex parser；
6. Markdown newline normalization 只有 E1 codec 一份；
7. companion JSON schema 只有 E1 codec 一份；
8. 当前 baseline 不建立 persistent 或 long-lived derived cache/index；单次 operation 内的 ephemeral map/list 可以作为局部计算结构，但不得成为第二 truth。真实性能证据需要长期 cache 时先修改 Design；
9. 所有 union/error code switch exhaustive；
10. parser/library raw error 不作为 application branch contract；调用方只依赖 typed error code。

---

## 18. Test seams required by this Design

### 18.1 Markdown codec pure tests

覆盖：

- valid UTF-8；
- invalid UTF-8 fail；
- UTF-8 BOM strip；
- LF；
- CRLF → LF；
- lone CR → LF；
- encode no BOM + deterministic bytes。

### 18.2 C1 archival tests

覆盖：

- minimal valid frontmatter + empty body；
- nested/additional YAML preserved；
- comments preserved because raw text unchanged；
- quoted summary；
- summary whitespace normalization；
- missing/empty/non-string summary；
- four importance values；
- numeric/boolean/unknown importance fail；
- malformed YAML；
- top-level sequence fail；
- missing closing delimiter；
- indented `---` in block scalar不 prematurely close；
- additional `type/status/custom` key不改变 mechanism truth。

### 18.3 Core tests

- empty valid；
- exactly 4000 code points valid；
- 4001 fail；
- astral Unicode character按一个 code point；
- CRLF normalized before count；
- over-limit 不产生截断后的 alternative document。

### 18.4 C2 tests

- active → status active；
- question trims + status questioned；
- repeated question replaces；
- empty question fail；
- resolve returns active；
- resolve with no challenge fail。

### 18.5 JSON codec tests

- scope cycle round-trip；
- companion active/questioned round-trip；
- deterministic field order/final LF；
- persisted empty/whitespace/non-trimmed challenge fails as malformed internal state；
- missing required field fail；
- unknown field fail；
- negative/non-integer fields fail per schema；
- codec 不自行 default；application 对 missing/malformed/stale companion 按 Frozen contract 使用 fresh C2/D1 state。

Fake/resource tests不得内置 C1/C2 semantic transition，否则会复制 production bug。

---

## 19. Convergence / compatibility boundary

Current codec只读写 canonical v2 document/scope/companion schema。

不提供：

- numeric importance转换；
- duplicated frontmatter `type/status` semantic recovery；
- old index/state schema import；
- schema-version negotiation for hypothetical historical data；
- codec 内部的 silent default/repair；application-level fresh fallback 是明确的 current contract，不属于 compatibility repair。

旧实现可作为 failure evidence，但不是 runtime compatibility input；需要数据升级时必须先有明确 migration requirement。

---
## 20. Implementation-ready completion check

实现者读取本文件后不再需要自行决定：

- Markdown physical newline/UTF-8/BOM policy；
- mature YAML parser capability boundary；exact dependency/version由 implementation/package lock选择；
- frontmatter envelope 怎样找；
- additional frontmatter 怎样处理；
- summary/importance 的具体类型与 validation；
- summary 只验证 non-empty/current schema；不为 outer output budget增加第二个 semantic hard limit；
- core capacity 的 `4000` 到底按什么单位计算；
- C2 challenge 内存 invariant 与 question/resolve pure transition；
- active/questioned 是否持久化；
- scope/companion JSON exact fields；
- unknown field/malformed record policy；
- JSON deterministic serialization；
- fresh-state default 是否由 codec 猜；
- Markdown + companion 是否存在 index/cache 第二 truth；
- validation 与 first side-effect boundary。

D1 accessibility algorithm、B3 operation-required C2/D1 hydration semantics 与 E2 semantic-vs-incidental persistence strength仍由各自 child Detailed Design拥有；implementation 不得从“同一 JSON”或“D1 字段”自行推导统一事务强度。
