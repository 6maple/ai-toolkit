# brain v3 Detailed Design — Logical Namespace & Physical Storage Projection

> **Layer:** Phase 5B Detailed Design child。
> **System owners:** B1 Public Namespace & Object Semantics + E1 Physical Storage Projection（仅 layout / containment / physical-address 部分）。
> **Parent:** `design-brain-system.md`。
> **Frozen inputs:** `bdd-brain-behavior-requirements.md`、`brain-tools-contract.md`、`acceptance-spec-brain.md`。
> **Supersedes:** `design-brain-runtime.md` 中 B1/E1 path/layout 的旧综合设计；旧文只保留摘要和本文件链接。
> **Status:** **Design Frozen for v3 (2026-08-30)**；project-mapping semantics inherit the unchanged v2 2026-08-26 baseline；canonical v3 Detailed Design truth is this file。

---

## 1. 本文要完成什么

本文把下面这条 System Design contract 展开到可以直接编码：

```text
public brain string
→ B1 logical parse / validation
→ LogicalBrainPath / LogicalSearchSpace
→ E1 physical projection + containment validation
→ physical resource address
```

核心目标只有两个：

1. **B1 是 public brain language 的唯一 owner**：scope、role、object kind、session id、path/pattern grammar 都不依赖 filesystem；
2. **E1 是 physical address/layout 的唯一 owner**：brain root、project projection、scope root、hidden-state path、canonical containment 都不反向定义 cognition semantics。

本文不设计：

- C1 archival frontmatter / core content schema；
- C2 challenge field semantics；
- D1 accessibility fields / formulas；
- B2 ls/glob/grep/cat match、paging、budget；
- B3 mutation sequencing；
- E2 multi-resource operation coordination / rollback；
- E3 Git staging / checkpoint；
- A1/A2 host/MCP binding resolution。

这些 child 只能消费本文 contract，不能重新定义 path/layout。

---

## 2. Concrete module boundary

当前implementation baseline采用三个模块：

```text
src/brain/namespace.ts       # B1
src/persistence/project-mapping.ts # E1 project metadata/source-root mapping
src/persistence/storage.ts  # E1 path/layout/containment portion
```

### 2.1 `src/brain/namespace.ts`

必须是 pure domain module：

- 不 import `node:fs`；
- 不调用 `realpath/stat/exists`；
- 不持有 `brainRoot/projectId/sourceRoots`；
- 不返回 absolute filesystem path；
- 不根据 physical existence 判断 object kind。

它只依赖普通字符串/TypeScript 数据结构。

### 2.2 E1 persistence modules

`project-mapping.ts`负责project metadata/source-root mapping；`storage.ts`负责binding、projection与containment。两者共同负责：

- canonical `brainRoot / projectId` physical binding；
- source roots ↔ ProjectId metadata mapping；
- logical scope → scope root；
- public document/directory → physical target；
- scope state / archival companion → hidden physical target；
- stable ProjectId projection；
- canonical/realpath containment；
- create target 的 nearest-existing-parent containment proof。

它可以依赖 Node filesystem/path primitives，但不能 parse raw public brain strings，也不能解释 role/importance/challenge/retrievability。

后续 companion codec Detailed Design 可以继续扩展同一个 E1 module 或提炼相邻 internal module；**不得因此复制本文 path mapping**。

---

## 3. B1 types

### 3.1 Branded identifier

```ts
export type SessionId = string & { readonly __brand: "SessionId" }
```

只有 `parseSessionId` 可以从 raw string 构造 `SessionId`。其他 module 不允许用 `as SessionId` 绕过校验。

当前 baseline：

```text
^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$
```

并显式拒绝 `.` / `..`。

这是当前 public identifier baseline，不是 filesystem escaping scheme。未来真实 host identity 不能表示时，先修改 Design，不在 adapter 中 silent encode/hash。

### 3.2 Scope

```ts
export type ScopeRef =
  | { readonly kind: "global" }
  | { readonly kind: "project" }
  | { readonly kind: "session"; readonly sessionId: SessionId }
```

`ScopeRef` 只表达 cognition applicability owner，不携带 physical root。

### 3.3 Cognitive role

```ts
export const COGNITIVE_ROLES = [
  "decision",
  "knowledge",
  "intention",
  "skill",
] as const

export type CognitiveRole = (typeof COGNITIVE_ROLES)[number]
```

role 只来自 public path，不在 document metadata / companion state 复制第二份 truth。

### 3.4 Logical path

```ts
export type LogicalDirectory =
  | {
      readonly kind: "directory"
      readonly area: "memories-root"
      readonly scope: ScopeRef
    }
  | {
      readonly kind: "directory"
      readonly area: "role-root"
      readonly scope: ScopeRef
      readonly role: CognitiveRole
    }
  | {
      readonly kind: "directory"
      readonly area: "nested"
      readonly scope: ScopeRef
      readonly role: CognitiveRole
      readonly segments: readonly [string, ...string[]]
    }

export type LogicalCorePath = {
  readonly kind: "core"
  readonly scope: ScopeRef
}

export type LogicalArchivalPath = {
  readonly kind: "archival"
  readonly scope: ScopeRef
  readonly role: CognitiveRole
  readonly itemSegments: readonly [string, ...string[]]
}

export type LogicalBrainPath =
  | LogicalDirectory
  | LogicalCorePath
  | LogicalArchivalPath
```

`LogicalArchivalPath.itemSegments` 的最后一段必须：

- 非空；
- 不是 `.` / `..`；
- 不包含 `/` 或 `\`；
- 以 `.md` 结尾；
- `.md` 前至少有一个字符。

nested directory segment 也必须非空、不是 `.` / `..`、不包含 `/` / `\`。

### 3.5 Logical active-discovery root

B1 不实现 ls/glob/grep matching，但负责把 active-discovery `path` 解析成 typed logical boundary。active discovery 只属于 `<scope-root>/memories/...` archival subtree：

```ts
export type LogicalDiscoveryDirectory = LogicalDirectory
export type LogicalGlobSearchRoot = LogicalDirectory
export type LogicalGrepSearchRoot = LogicalDirectory
```

- `brain_ls(path)`：只接受 memories-root / role-root / nested directory；
- `brain_glob(path?)` / `brain_grep(path?)`：显式 path 也只接受上述 memories subtree directory；
- standalone scope prefix、core、concrete archival item 都不是 active-discovery search root；
- omitted path 的 default scope set由 B2/A1 current-session context决定，不由 B1 猜 current host state。

B1 把 concrete core、archival `.md` item 与 archival directories 解析为稳定的 `LogicalBrainPath`；`@global/`、`@project/`、`@session/<sid>/` 只作为这些 cognition path 的 applicability prefix，本身不产生 `LogicalBrainPath` object。不同 cognition Tool 只接受各自需要的 typed object；Glob/grep pattern semantics仍由 B2拥有。另有一套更宽松的 `LogicalResourceLocation` 只供 `brain_absolute_path` 做 workspace→filesystem bridge，不改变 `LogicalBrainPath` ontology。

---

## 4. B1 public grammar

### 4.1 Canonical roots

```text
@global/
@project/
@session/<sid>/
```

canonical separator 固定 `/`。Public brain namespace 是虚拟地址语言，不采用当前 OS 的 path separator。

raw public path 中出现 `\` 直接失败；不把它 silent normalize 成 `/`。

### 4.2 Object grammar

```text
<scope-root>/core.md
<scope-root>/memories/
<scope-root>/memories/<role>/
<scope-root>/memories/<role>/<nested-dir>/...
<scope-root>/memories/<role>/<relative-item-path>.md
```

Directory input 的 terminal `/` 可有可无；parser 将两种写法解释为同一个 `LogicalDirectory`。

Standalone scope prefix 不构成 object；core / archival item input 也不接受 terminal `/`：

```text
@project/                                 → invalid object shape
@project/core.md/                         → invalid object shape
@project/memories/knowledge/a.md/        → invalid object shape
```

### 4.3 Directory 与 archival leaf 的判定

B1 不查看 filesystem。判定只看语法：

- `.../memories/<role>/x.md` → archival item；
- `.../memories/<role>/x` → nested directory；
- `.../memories/<role>/a/b.md` → archival item；
- `.../memories/<role>/a/b` → nested directory。

因此 public object kind 不会因为底层恰好存在同名 file/directory 而变化。

### 4.3A `brain_absolute_path` resource-location grammar

该 bridge 接受比 `LogicalBrainPath` 更宽的 location：

```text
@global[/]
@project[/]
@session/<sid>[/]
<scope-root>/core.md
<scope-root>/memories[/]
<scope-root>/memories/<role>[/]
<scope-root>/memories/<role>/<arbitrary-safe-descendant>...
```

最后一类不按扩展名判断 cognition，可表示 `.md`、`.py`、`.xlsx`、directory 或尚不存在的 future asset。仍只允许四个固定 top-level role；segment 不允许 `.` / `..` / separator escape。Scope-level `.state` 不在该 grammar 中。E1 projection只做 deterministic join + containment，不要求 target exists，也不 realpath 一个尚不存在的 leaf。

### 4.4 Public structural directories 不要求预先 materialize

`memories / role-root / nested directory` 是 public archival ontology 的结构节点。它们的 logical validity 与 physical directory 是否已经创建分开；physical scope root 仍由 E1 拥有，但不作为 public object。

特别是 fresh initialized scope 可以只有：

```text
core.md
.state/scope.json
```

而尚无 physical `memories/` directory。B2 仍可根据 ontology 表达 `memories/` / role roots；pure read/discovery 不为了“让目录存在”而创建 physical directory。

一个非 materialized scope 则仍然只是**语法上可表达**；是否作为 current existing scope 返回内容由 B2/C1/E1 current-state contract决定，不由 B1 创建。

---

## 5. B1 key functions

### 5.1 `parseSessionId(raw)`

```text
function: parseSessionId(raw: string) -> SessionId
```

**Algorithm**

1. raw 必须非空；
2. 完整匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`；
3. reject `.` / `..`；
4. 返回 branded `SessionId`。

**Failure**

抛 `NamespaceParseError(code="invalid-session-id")`；error 的 public-safe detail 可以包含 raw session id，但不能包含 physical path。

**Must not**

- URL encode；
- hash；
- truncate；
- replace separator；
- fallback `default`。

### 5.2 `parsePublicPath(raw)`

```text
function: parsePublicPath(raw: string) -> LogicalBrainPath
```

**Preconditions**

无 filesystem precondition；只接 model/application raw public string。

**Algorithm**

1. raw 必须以 `@global` / `@project` / `@session/` 三种 root 之一开始；
2. 若 raw 含 `\`，立即失败；
3. 记录 `hasTrailingSlash = raw.endsWith("/")`；解析 segment 时只去掉这一个 terminal separator，不把中间 `//` 合并；任何中间 empty segment 都失败；
4. 解析 root：
   - `@global` → `ScopeRef(global)`；
   - `@project` → `ScopeRef(project)`；
   - `@session/<sid>` → `parseSessionId(<sid>)`；
5. root 后无 segment → `invalid-object-shape`；
6. 唯一 remaining segment 是 `core.md`：`hasTrailingSlash=true` → `invalid-object-shape`；否则返回 `LogicalCorePath`；
7. 第一 segment 非 `memories` → fail；
8. 只有 `memories` → `directory(memories-root)`；
9. 读取下一 segment 为 role；不在 enum → fail；
10. role 后无 segment → `directory(role-root)`；
11. 对剩余 segments 逐一验证：非空、非 `.`/`..`、不含 separator；
12. 取最后一个 non-empty segment：若以合法 `.md` 结尾，则 `hasTrailingSlash=true` → `invalid-object-shape`，否则返回 archival item；
13. 最后 segment 不以 `.md` 结尾 → nested directory；`hasTrailingSlash` 只影响 canonical formatting，不改变其 logical identity。

**Output normalization**

不保存 raw string；只返回 typed logical representation。

**Failure codes**

```text
invalid-root
invalid-separator
invalid-session-id
invalid-role
traversal-segment
invalid-segment
invalid-object-shape
```

调用方只能根据 code + public path 生成模型错误，不读取 parser 内部实现文本做业务分支。

### 5.3 `formatPublicPath(path)`

```text
function: formatPublicPath(path: LogicalBrainPath) -> string
```

canonical output：

- directory 永远以 `/` 结尾；
- core / archival 不以 `/` 结尾；
- separator 永远 `/`；
- 不做 filesystem case normalization。

必须满足：

```text
parsePublicPath(formatPublicPath(x)) == x
```

以及对任意 parser 成功输入：

```text
formatPublicPath(parsePublicPath(raw))
```

返回唯一 canonical public representation。

### 5.4 `isSameLogicalPath(a, b)`

只比较 typed fields；不比较 formatted string，也不询问 filesystem。

B3 identity/move precondition 应使用 typed equality/helper，而不是 raw string equality。

---

## 6. E1 runtime storage binding

### 6.1 Inputs

E1 process/runtime 初始化后形成：

```ts
export type CanonicalBrainRoot = string & { readonly __brand: "CanonicalBrainRoot" }
export type ProjectId = string & { readonly __brand: "ProjectId" }

export interface StorageBinding {
  readonly brainRoot: CanonicalBrainRoot
  readonly projectId: ProjectId
  readonly platform: "win32" | "posix"
}
```

`sessionId` 不属于 `StorageBinding`。具体 session 已经包含在 B1 `ScopeRef(session)` 中；未知 current session 也不需要 fake binding。

### 6.2 `brainRoot` baseline

composition root内部继续使用 `BRAIN_HOME` 表示固定Brain repository path：

```text
BRAIN_HOME = join(homedir(), ".brain-data")
→ 作为必填 brainRoot 传入 E1
```

当前production不读取同名环境变量。E1不读取环境变量、`homedir()`或默认路径；`brainRoot`是必填外部依赖。未来若恢复可配置路径，只修改composition root如何计算 `BRAIN_HOME`。

Canonical v3 state只按本文 `global/` / `projects/` physical tree解释；brainRoot中的其他历史/未知布局不自动映射成 cognition state。

### 6.3 Project identity 与 source roots

Brain project identity是稳定 `ProjectId`，不是filesystem path。每个project metadata保存一个可变source root集合：

```json
{
  "schemaVersion": 1,
  "projectId": "<project-id>",
  "name": "ai-toolkit",
  "sourceRoots": [
    "D:\\Workspace\\ai-projects\\ai-toolkit",
    "D:\\Workspace\\shared\\brain-assets"
  ]
}
```

规则：

- 一个project可以映射零个或多个source directory；
- 一个canonical source root最多属于一个project；
- 添加/移除source root只修改 `project.json`，不改变ProjectId或移动cognition；
- display name不拥有identity；重命名不改变physical project directory；
- 当前source directory经 `path.resolve → fs.realpath` canonicalize后，与 `sourceRoots`匹配；
- 未匹配的source directory创建新的ProjectId和project metadata；
- project resolve/create与source-root mutation在同一brainRoot下跨进程串行化，使“检查现有映射→创建或更新metadata”保持一个原子语义操作；
- 不读取或迁移legacy `.brain-data` layout。

`project.json`位于 `<brainRoot>/projects/<projectId>/project.json`。项目数量当前有限，baseline直接扫描 `projects/*/project.json`，不增加第二份registry/index truth。

### 6.4 brainRoot normalization

```text
required brainRoot
→ path.resolve
→ ensure root directory exists
→ fs.realpath.native(root)
→ CanonicalBrainRoot
```

E1 可以在 runtime bootstrap 时创建 `brainRoot` 本身；创建后再取 realpath。Git repository 初始化属于 E3，不属于这里。

---

## 7. Stable project projection

`ProjectId`直接拥有physical project directory：

```text
projectScopeRoot(binding)
→ join(binding.brainRoot, "projects", binding.projectId)
```

ProjectId只允许安全单segment字符集；不得包含separator、`.`/`..` traversal或absolute path shape。sourceRoots不参与physical path projection。

---

## 8. Canonical physical tree

### 8.1 Global

```text
<brainRoot>/
├─ .git/                         # E3
├─ global/
│  ├─ core.md
│  ├─ memories/                  # lazy physical parent
│  │  └─ <role>/<relative>.md
│  └─ .state/
│     ├─ scope.json
│     └─ memories/
│        └─ <role>/<relative>.json
└─ projects/
```

### 8.2 Project + sessions

```text
<brainRoot>/projects/<projectId>/
├─ project.json
├─ core.md
├─ memories/
│  └─ <role>/<relative>.md
├─ .state/
│  ├─ scope.json
│  └─ memories/
│     └─ <role>/<relative>.json
└─ sessions/
   └─ <sessionId>/
      ├─ core.md
      ├─ memories/
      │  └─ <role>/<relative>.md
      └─ .state/
         ├─ scope.json
         └─ memories/
            └─ <role>/<relative>.json
```

E1 hidden-state physical root 当前 baseline 正式冻结为：

```text
.state
```

它永远不进入 B1 public namespace。

### 8.3 Lazy structural directories

Scope initialization 必须真实创建：

```text
<scope-root>/core.md
<scope-root>/.state/scope.json
```

以及它们必需的 parent directories。

以下可以直到第一次 archival create 才 materialize：

```text
memories/
memories/<role>/...
.state/memories/
.state/memories/<role>/...
```

physical directory existence 不是 cognition public ontology truth。`memories/` 下可存在非 `.md` scripts/data/templates 等附加资产；B2 cognition discovery忽略它们。E1/B2 不因 `ls/glob/grep/cat` 创建这些目录或资产。

### 8.4 Companion mirroring

```text
<scope>/memories/skill/coding/typescript/refactor.md
```

对应唯一 hidden companion：

```text
<scope>/.state/memories/skill/coding/typescript/refactor.json
```

即：保持 `role + nested relative path`，只把 terminal `.md` 替换为 `.json`。

不得生成：

```text
refactor.md.json
```

不得把 role/path 复制进 JSON 字段作为 identity truth。

---

## 9. E1 resource references

E1 不接受 raw public string。内部 resource selector：

```ts
export type PhysicalResourceRef =
  | { readonly kind: "public"; readonly path: LogicalBrainPath }
  | { readonly kind: "scope-state"; readonly scope: ScopeRef }
  | { readonly kind: "companion"; readonly item: LogicalArchivalPath }
```

`public` directory/core/archival 的 physical path 由 logical path 派生；hidden state 只能通过 `scope-state` / `companion` typed ref 获得，不能由调用方传 `".state/..."` raw relative string。

这保证 hidden mechanism path 没有第二套自由字符串入口。

---

## 10. E1 key functions

### 10.1 `createStorageBinding`

```text
function: createStorageBinding({ brainRoot, projectId })
  -> Promise<StorageBinding>
```

**Responsibility**

建立一次process/runtime使用的canonical brain root与稳定project binding。

**Algorithm**

1. `brainRoot`与 `projectId`必须提供；
2. validate ProjectId为安全单segment identifier；
3. resolve brainRoot；若不存在，创建directory；
4. realpath.native brainRoot；必须directory；
5. 返回immutable `StorageBinding`。

**Side-effect boundary**

步骤3是第一个允许side effect的位置。

**Failure**

- invalid/missing ProjectId → `StorageBindingError(project-id-invalid)`；
- brainRoot 无法创建/读取 → `StorageBindingError(brain-root-unavailable)`。

内部 error 可保留 physical diagnostic；model-visible mapping 不得输出这些 absolute paths。

### 10.2 `projectScopeRoot(binding)`

pure derivation：

```text
ProjectId
→ <brainRoot>/projects/<projectId>
```

不访问 filesystem，不创建目录。

同一 `StorageBinding` 中结果稳定；不得依据 cwd、session 或当前 Tool 改变。

### 10.3 `scopeRoot(binding, scope)`

```text
global
→ <brainRoot>/global

project
→ projectScopeRoot(binding)

session(sid)
→ projectScopeRoot(binding)/sessions/<sid>
```

输入 session id 已经是 B1 branded `SessionId`；E1 不重新 parse raw identifier。

### 10.4 `projectPhysicalResource(binding, ref)`

```text
function: projectPhysicalResource(binding, ref)
  -> ProjectedResource
```

这是**纯 lexical projection**，不证明 target 当前安全/存在。

映射：

```text
public core                 → <scopeRoot>/core.md
public memories root        → <scopeRoot>/memories
public role/nested dir      → <scopeRoot>/memories/<role>/<segments...>
public archival             → <scopeRoot>/memories/<role>/<itemSegments...>
scope-state                 → <scopeRoot>/.state/scope.json
companion                   → <scopeRoot>/.state/memories/<role>/<item path .json>
```

输出至少包含：

```ts
interface ProjectedResource {
  readonly ref: PhysicalResourceRef
  readonly scopeRoot: string
  readonly absolutePath: string
  readonly expectedKind: "directory" | "file"
}
```

`absolutePath` 只在 E1/E2/persistence adapter 内部流动，不允许进入 B1/B2 public result model。

Existing/create resolution 额外返回：

```ts
interface ResolvedBrainResource {
  readonly requestedRef: PhysicalResourceRef
  readonly canonicalRef: PhysicalResourceRef
  readonly canonicalScopeRoot: string
  readonly canonicalPath: string
  readonly aliasFollowed: boolean
  readonly expectedKind: "directory" | "file"
}
```

`canonicalRef` 只可能与 `requestedRef` 在 **public same-scope filesystem alias** 情况下不同；hidden scope-state/companion 不通过 alias 建第二地址。Application/model-facing path **以及 object kind / role interpretation** 都采用 `canonicalRef`，避免同一真实 target 因 alias 入口同时获得两个 address/role/kind。Caller 必须在 resolution 后按 canonicalRef 重新检查本 operation 允许的 object kind；不能只验证 requestedRef 的外形。

### 10.5 `resolveExistingResource(binding, ref)`

Responsibility：

> 对 typed existing resource 建立 real-target containment proof，并在 public alias 存在时返回同一 scope 内唯一 canonical resource identity。

#### Structural scope root

`brainRoot → global/projects/<projection>/sessions/<sid>` 这条 E1 **内部结构链**不是 public workspace alias surface：

- 已存在 structural nodes / scope root必须是真实 directory；
- 不跟随把一个 logical scope root指到另一个 physical scope root的 symlink/junction；
- canonical scope root由 `realpath.native(scopeRoot)`取得并确认仍在 canonical brainRoot内。

这样 scope identity仍由 B1 binding + deterministic E1 projection拥有。

#### Public resource below scope root

对于 `ref.kind="public"`：

1. `projectPhysicalResource` 得到 requested lexical target；
2. target必须存在；
3. `realpath.native(target)` 跟随 OS 支持的 symlink/junction chain；broken/inaccessible → typed alias/I/O failure；
4. resolved real target必须仍 contained in该 `canonicalScopeRoot`；否则 `StorageContainmentError`；
5. target real kind必须符合 caller requested object kind；
6. 若 resolved path == lexical canonical path：`canonicalRef=requestedRef`, `aliasFollowed=false`；
7. 若发生 alias follow：调用 §10.5.1 的受控 managed-target canonicalization得到 `canonicalRef`，`aliasFollowed=true`；
8. 返回 `ResolvedBrainResource`。

Alias可以位于 core/public memories subtree 的 leaf 或中间 directory。只要最终 target仍在同一 scope且仍是 public managed workspace resource，就按真实 filesystem target工作。

#### Hidden mechanism resource

`scope-state` / `companion` 不是 public filesystem workspace affordance。它们的 deterministic hidden path不接受 alias identity：existing hidden target若本身/中间 hidden node是 symlink/junction → `StorageContainmentError`。Auxiliary record不可用后由 application按 fresh contract处理，而不是 follow hidden alias。

#### Expected kind

- expected file → resolved target regular file；
- expected directory → resolved target directory；
- mismatch → `StorageResourceKindError`。

### 10.5.1 `canonicalPublicRefForResolvedTarget(...)`

这个 helper **不是任意 absolute-path reverse parser**。它只能在以下前提全部成立后调用：

```text
caller already supplied a typed public ref
+ its logical scope is already known
+ canonicalScopeRoot is already known
+ resolved target is already proven contained in that same scope
```

然后只对 E1 自己定义的 public layout做受控 inverse：

```text
<scopeRoot>/core.md
→ same scope LogicalCorePath

<scopeRoot>/memories[/...]
→ same scope memories/role/descendant path
```

Rules：

- relative target落入 `.state`、scope root内部其他 mechanism-only路径、或不能通过 B1 public grammar validation → containment/object error；
- cognition role来自 resolved canonical target在 `memories/<role>/...` 中的位置，不来自 alias入口的位置；
- public asset descendant同样返回 canonical same-scope public location；
- helper不能从 arbitrary physical path猜 global/project/session，也不能用于日志/output全局 rewrite。

因此：

```text
@project/memories/knowledge/link.md
  -> real target @project/memories/decision/x.md

resolution
→ canonical public cognition = @project/memories/decision/x.md
→ not a second knowledge cognition
```

Broad discovery若同时从真实 path与一个/多个 aliases遇到同一 canonical target，以 canonical public path dedupe。对 directory alias 的递归枚举，implementation 在**单次 operation 内**按 canonical real directory identity维护 ephemeral visited set；重复 target / alias cycle只 warning+skip重复 traversal，不建立 persistent alias registry/index。

### 10.6 `resolveCreateTarget(binding, ref)`

只允许有 create/replace intent 的 typed ref；pure B2 read不调用。

#### No existing public alias in prefix

若从 scope root 到 target 的 existing prefix 都是真实 directories：

```text
nearest existing parent realpath
→ prove contained in canonical scope root
→ append B1-validated missing suffix
→ target
```

#### Existing public alias in prefix

如果 public path 的 existing parent/middle segment是 symlink/junction：

1. follow该 existing prefix到 real target；
2. resolved prefix必须是同 scope内的 public directory；
3. 对 unresolved suffix继续普通 deterministic join；
4. final canonical create target仍需 contained in canonical scope root；
5. 用 §10.5.1 得到 canonical public `canonicalRef`。

因此在一个 same-scope directory alias下面创建文件，等价于在它指向的真实 directory下面创建；结果 cognition/address以 canonical target path表达。

若 existing alias broken/inaccessible/outside-scope/指向 hidden mechanism subtree，则明确失败，不从 alias旁边偷偷创建另一个 lexical resource。

#### Scope not materialized

Scope Initialization仍只沿 E1 internal structural chain创建真实 directories；这条 structural chain不接受 alias。Fresh scope的 public target在真实 scope root建立后按上述规则处理。

`resolveCreateTarget` 本身只解析/prove target，不写 file/content；E2/E1 persistence随后执行 actual create/replace。

### 10.7 `companionRef(item)`

pure：

```text
LogicalArchivalPath
→ PhysicalResourceRef(kind="companion")
```

不查文件、不读 JSON。

terminal basename：

```text
name.md → name.json
```

如果收到非 archival type，TypeScript signature 本身应阻止调用；不提供 `LogicalBrainPath` 宽类型 + runtime 猜测。

---

## 11. Containment / alias invariants

E1 success 后保持：

1. public logical path不直接作为未经验证的 OS path使用；
2. canonical brainRoot 到 logical scope root 的 E1 internal structural chain保持真实 directory，不通过 alias重定义 scope identity；
3. public scope workspace内的 symlink/junction可以按 OS real target工作，但 resolved target必须仍 contained in同一 canonical scope root；
4. public alias的 model/application identity归一到 resolved target的 canonical public ref；alias不创建第二 cognition、不重新定义 role/scope；
5. broad enumeration对同一 canonical target dedupe；
6. broken/inaccessible alias在 broad discovery中 warning + skip受影响 entry；exact request明确失败；
7. cross-scope / outside-scope alias不暴露 target；
8. hidden `.state` / companion paths不成为 public alias surface；
9. create target若经过 public directory alias，实际创建位置与 canonical public result都跟随 resolved parent；
10. `@project`不能通过 alias读取 global/sibling project；session同理；
11. physical path不成为普通 model-visible locator；
12. E1不因 physical existence改变 B1 object grammar。

这里的 alias follow 是熟悉 filesystem semantics的受控使用，不是“containment failure后继续访问”。只有先证明 real target仍属于同一 logical scope/public layout时才成立。

---

## 12. Error model

### B1

```ts
class NamespaceParseError extends Error {
  code:
    | "invalid-root"
    | "invalid-separator"
    | "invalid-session-id"
    | "invalid-role"
    | "traversal-segment"
    | "invalid-segment"
    | "invalid-object-shape"
}
```

B1 error 不含 physical path。

### E1

```text
StorageBindingError
StorageNotFoundError
StorageResourceKindError
StorageContainmentError
StorageAliasResolutionError   # broken / inaccessible public alias
StorageIoError
```

E1 error 可以携带 internal diagnostic fields，但 A/B public mapping 必须只返回 canonical public path / object-kind guidance，不泄露：

- brainRoot；
- projectId / sourceRoots；
- `.state`；
- temp path；
- realpath target。

不得通过 `ENOENT: C:\...` 原样向模型透传 Node error string。

---

## 13. Dependency / coding constraints

### 13.1 Allowed

```text
A/B application
→ namespace.ts typed paths
→ storage.ts typed physical projection
```

后续 E2 可以消费 E1 projected/resolved resources；C1/C2/D1 可以通过 persistence contract 读写自己拥有的 state。

### 13.2 Forbidden

禁止：

- Tool handler 自己 `join(brainRoot, rawPath)`；
- B2/B3/B4 各写一套 session/path parser；
- `storage.ts` 接 raw `@project/...` string；
- B1 type 携带 `abs`；
- 从 arbitrary absolute path反推 cognition scope/role；§10.5.1 只允许对“已知 typed scope + 已证明 same-scope target”做 E1 public-layout canonicalization；
- 用 regexp/token scan rewrite arbitrary Tool output 中的 physical path；
- unknown session fallback `default`；
- project hash/registry/key；
- path failure 后 silent fallback 到 project/global；
- unresolved/out-of-scope alias绕过 containment继续访问 target。

### 13.3 Exhaustiveness

`ScopeRef` / `LogicalBrainPath` 所有 switch 必须 exhaustive。新增 scope/object kind 时 TypeScript 应在 B1 formatter + E1 projection 产生 compile-time gap，而不是落入 generic default。

### 13.4 Shared helpers

可以提炼 pure helper：

- segment validation；
- platform-aware containment comparison；
- project projection segment derivation。

但 shared helper 不拥有 semantic rule；例如 role enum 仍只从 `namespace.ts` export，storage 只能消费。

---

## 14. Test seams required by this Design

Detailed Design 本身不写 Acceptance tests，但 implementation 必须留下这些可直接测试的 seam：

### B1 pure tests

至少覆盖：

- 三 scope 的 core/memories/role/nested/item round-trip；
- standalone global/project/session scope prefix → `invalid-object-shape`；
- directory trailing slash normalization；
- backslash rejection；
- invalid role；
- `. / ..`；
- nested archival path；
- session id valid/invalid boundary；
- core/archival terminal slash rejection；
- hidden `.state` root cannot parse。

### E1 pure projection tests

至少覆盖：

- ProjectId safe segment validation；
- one project maps multiple canonical source roots；
- one source root cannot map to multiple projects；
- global/project/session scope root mapping；
- companion `.md → .json` mirroring。

### E1 filesystem-boundary tests

使用真实 temp filesystem 或符合通用 filesystem semantics 的 resource fake，覆盖：

- source root realpath normalization与project mapping；
- existing contained file；
- missing existing target；
- create target existing-prefix validation；
- internal structural scope-root alias仍失败，不重定义 scope identity；
- same-scope public directory alias follows target；
- same-scope public document alias canonicalizes to real cognition path；
- alias from one role path to another role target returns target canonical role/path，不重新分类；
- multiple aliases + direct path dedupe to one canonical cognition；
- directory alias cycle/repeated real directory terminates by operation-local canonical-target dedupe；
- archival-looking alias → core target：canonical object kind remains core；caller must revalidate allowed kind；
- broken/inaccessible alias：broad listing warning+skip，exact failure；
- cross-scope / outside-root alias rejected；
- hidden `.state` / companion alias not followed as public workspace；
- create under same-scope public directory alias creates at canonical real target；
- physical Node error 不通过 public mapper泄漏。

不要让 fake filesystem 内置 brain path grammar；否则测试会把 production bug一起复制进 fake。

---

## 15. Convergence / compatibility boundary

B1/E1只支持本文 canonical public grammar 与 physical projection。

禁止为了旧实现增加：

- second public path grammar；
- generic/arbitrary physical-path reverse parser；§10.5.1 的受控 same-scope public-target canonicalization属于当前 alias contract；
- `default` session fallback；
- project hash/key registry fallback；
- legacy filesystem layout probing/migration branch。

旧 source可以提供 path/symlink failure evidence，但不形成 runtime compatibility contract。需要历史兼容时先新增明确 Requirement。

---
## 16. Implementation-ready completion check

本 child Design 完成后，实现者不再需要自行决定：

- public path 的 object type；
- session id grammar；
- slash/backslash/trailing slash 行为；
- B1/E1 module dependency；
- fixed composition-root `BRAIN_HOME` 与required `brainRoot` boundary；
- sourceRoots怎样映射到稳定ProjectId；
- ProjectId怎样映射到unified repo；
- `.state` 名称；
- scope/core/memory/companion physical path；
- `.md → .json` companion mapping；
- existing/create containment algorithm；
- internal structural alias rejection + same-scope public alias follow/canonicalization/failure locality；
- physical error leakage boundary。

仍未在本文拥有的实现设计，只能来自其他明确 child owner；不能在实现 B1/E1 时顺手替 B2/B3/C/D/E2/E3 决定。
