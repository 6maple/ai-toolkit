# Brain v5 — Detailed Design

Status: implementation-ready detailed design.

## Parent contract

Implements `01-requirements-contract.md` through `05-system-design.md`. Related projects remain independent ProjectIds. `#alias` is public routing syntax, never a new cognition scope.

## 1. Relation config and resolution

Add a source-root-local relation loader, owned outside the cognition domain.

```text
<active sourceRoot>/.brain/config.json
        ↓
ProjectRelationCatalog
        ↓
#alias → { configuredPath, files, access, targetProjectId | unavailable }
```

Data shape:

```ts
type RelatedAccess = "read" | "write";

type RelatedRelation = {
  alias: string;
  configuredPath: string;
  files: string;
  access: RelatedAccess;
  targetProjectId: ProjectId;
};
```

Rules:

- alias is one safe segment, using the same conservative character family already used by project/session ids; stored alias excludes `#`.
- top-level JSON/schema failure makes related configuration unavailable but does not affect built-ins.
- validate each `relatedProjects.<alias>` independently so one bad entry does not invalidate valid siblings.
- `access` defaults to `read`.
- resolve relative `path` from active source root; absolute paths are allowed.
- canonicalize the existing directory, then exact-match registered project metadata; never call `resolveOrCreateProject` for a relation. Resolve all valid relation paths in one catalog build against one project-metadata snapshot rather than rescanning every project for every alias.
- a relation resolving to the active ProjectId is unavailable: current-project cognition is already addressed by `@project` and a self-relation adds only ambiguous permission/routing semantics.
- multiple aliases may resolve to the same *other* ProjectId; relation access remains per alias. `brain_think` groups available relations by target ProjectId and emits a warning when a group contains more than one alias; the warning names aliases only and does not change routing, access, or expose ProjectId.
- `files` is derived from the configured path, normalizing separators for model readability but preserving relative-vs-absolute form; do not substitute the canonical path or expose other source roots.
- load the relation catalog per public tool invocation. Config edits therefore take effect without restarting the MCP process and mutation permission is never taken from a stale startup snapshot.

Project mapping gets a read-only exact lookup operation that returns an existing registered ProjectId or no match/conflict; it never creates metadata.

## 2. Public address model

Keep `ScopeRef` unchanged.

Add a public-address layer alongside existing logical cognition paths:

```ts
type PublicBrainRoot =
  | { kind: "builtin"; scope: ScopeRef }
  | { kind: "related"; alias: RelatedAlias };

type AddressedBrainPath = {
  root: PublicBrainRoot;
  path: LogicalBrainPath;
};
```

For a related address, `path.scope` is always internal `{ kind: "project" }`.

```text
#mobile/memories/knowledge/a.md
        ↓ parse public address
root = related("mobile")
path = @project/memories/knowledge/a.md   // internal cognition identity only
```

Parsing/formatting rules:

- existing `parsePublicPath` / `formatPublicPath` keep their built-in semantics.
- add addressed-path/resource-location parsing that recognizes `#alias` and delegates its suffix to project-scope parsing.
- related roots expose only project `core.md`, `memories/**`, and safe workspace descendants accepted by `brain_absolute_path`; no session form exists.
- add addressed formatting so a target reached through `#mobile` is rendered back as `#mobile/...`, never `@project/...`.
- unknown aliases are syntactically valid addresses; relation resolution later returns `unknown-related-project`.

## 3. Project self-references through related access

Project-owned cognition stores same-project references in their existing stable form:

```md
- Read `@project/memories/decision/architecture.md` immediately.
```

When read locally, `@project/...` already addresses the correct project. When the same cognition is read through a relation, Brain does not rewrite the Markdown. Instead, if the returned text contains `@project/...`, the related read/discovery result prepends a short, direct local note:

```text
This content comes from #brain.
To follow an `@project/...` reference in this content, use `#brain/...` when calling Brain tools.
When writing this content back, keep `@project/...` as `@project/...`; do not replace it with `#brain/...`.
```

The note is emitted only for related results that actually contain `@project/`, so ordinary reads do not carry extra guidance. It applies to `brain_cat`, `brain_ls`, explicit related discovery, and related results returned inside omitted-path workspace `brain_glob` / `brain_grep`.

This is presentation/access context, not a new path grammar and not hidden mutable state. Tool calls remain fully qualified. `brain_edit` exact text continues to match the original stored Markdown because the content itself is unchanged.

## 4. Lightweight project cognition access

Do not bootstrap a full target runtime for related access.

Create a lightweight access provider from an already resolved ProjectId:

```text
ProjectId
→ createStorageBinding(brainRoot, projectId)
→ CognitionStateStore
→ ReadDiscovery / CognitionMaintenance as needed
```

It must not:

- create target core/session state merely because the relation is read;
- prepare Git history;
- restore target anchor;
- load target relations.

A missing/malformed target cognition object is handled by normal object/storage errors after the relation itself resolved successfully.

## 5. Related read and public-path presentation

`ReadDiscovery` remains the single read/discovery engine, but receives a path-presentation function with the current built-in formatter as default.

For `#mobile`, formatting maps every internal project path to the alias root:

```text
internal @project/memories/a.md
→ public #mobile/memories/a.md
```

Use this presentation for:

- rendered ls/glob/grep/cat paths;
- glob matching against complete public paths;
- bounded-size rendering calculations and continuation affordances.

Within one project, state lookup may continue using logical project paths. Any result that can be combined across projects also carries its rendered public path (`@project/...` or `#alias/...`); cross-project ordering, grouping, deduplication, and tie-breaking use that public path so equal project-relative paths from different projects remain distinct.

### `brain_cat`

Expand exact read from archival-only to any concrete cognition document:

- core: load scope core, paginate/render it, no accessibility/companion learning update;
- archival: preserve current pagination/status/challenge behavior.

The cat result path is rendered through the current public-path presenter, so a related core remains `#alias/core.md`.

### read-only relation side effects

Current archival `brain_cat` performs a best-effort accessibility/companion update. A relation configured `read` must not mutate target cognition state.

Therefore related read access uses a no-op auxiliary-update port. The content read still succeeds, but no target companion/accessibility state is written. A `write` relation may use normal read-learning updates.

`ls`, `glob`, and `grep` already have no semantic mutation side effect and need no special suppression. They may read each memory's current accessibility state to calculate the same active-discovery priority used by single-project search, but they do not write accessibility, exposure, durability, epistemic state, or scope cycle.

For omitted-path workspace discovery, split `glob` / `grep` internally into two phases: each materialized project collects matching records plus the priority information derived from that project's own memory state without final application-level packing; a registered related project whose project scope is not materialized contributes an empty collection; then the current routed application combines those collections and calls the same final ranking/bounding/rendering logic once. Explicit related paths do not use that empty-scope fallback and retain existing `not-found` behavior. The underlying per-source search tool may itself report truncation (for example a grep match limit); combined ranking applies to the candidates actually collected, and source truncation remains propagated. Do not add a second ranking or packing implementation in the routing layer.

## 6. Anchor / brain_think projection

The current anchor still restores only:

```text
@global
@project
@session/<sid> (when present)
```

Before rendering, load the current invocation's relation catalog and pass only relation projection data to the anchor renderer:

```ts
type RelatedProjectProjection = {
  alias: string;
  access: "read" | "write";
  files: string;
  corePath: string; // #alias/core.md
};
```

Broken aliases/config contribute bounded errors. Duplicate available aliases for one target project contribute a bounded warning. No related core/memory content is read by `brain_think`, and neither diagnostic exposes ProjectId.

The renderer gives direct behavior guidance:

- file/project-specific work matching a relation → read that core first;
- overlapping matchers → all matching cores;
- mere listing/mention → do not preload;
- after reading a core, obey its `立即读取 ...` directives;
- related read/discovery output that contains `@project/...` states which `#alias/...` to use for Brain tool calls and tells the model to preserve `@project/...` in stored content.

Tests validate projection structure and model behavior semantically, not exact prose/order/whitespace.

## 7. Routed tool application

Add one application-level routed facade between MCP and existing single-binding engines.

```text
MCP raw args
→ parse AddressedBrainPath
→ load RelationCatalog
→ resolve target owner / permission
→ choose current or lightweight target access
→ call existing read/maintenance engine
→ render with original public root
```

MCP adapter should not own project-resolution rules; it only converts tool arguments/results and maps stable errors.

Built-in `@...` paths continue through the current services unchanged.

Omitted-path `brain_glob` / `brain_grep` collect the current built-in search set (`@global`, `@project`, current `@session` when present) plus `@project/memories/` from every available relation, then perform one combined final ranking/bounding/rendering pass. Explicit `path` continues to route only to the addressed memory tree.

`brain_absolute_path` resolves an addressed resource location and maps the selected target binding. It never applies the relation write gate.

## 8. Mutation permission

Permission is checked after address/relation resolution and before semantic mutation planning.

Single-target mutation:

```text
#alias target
→ access=read  → related-project-read-only
→ access=write → existing object semantics
```

Built-in targets have their existing mutation behavior.

For `brain_mv`, resolve both endpoints first. If they canonicalize to the same cognition address, return existing `same-source-destination` semantics; otherwise every related endpoint whose state changes must be `write`.

Permission is tied to the addressed relation, not merely target ProjectId. Two aliases may point to the same ProjectId with different access; using a read-only alias does not inherit permission from another alias.

## 9. Cross-project semantic mutation

Only cross-owner `brain_mv` needs a multi-project mutation plan. Keep normal single-project maintenance in `CognitionMaintenance`.

Refactor the existing move derivation only enough to share its semantic calculation (document bytes, epistemic state, accessibility rebase, destination replacement result). The routed move orchestrator loads source/target state through their own stores and returns one mutation batch.

Allow a resource mutation to carry an optional target storage binding. Existing mutations omit it and use the store's default binding. During preflight, the persistence resource port uses the mutation binding when supplied, producing absolute prepared paths. After preflight the current rollback machinery operates on prepared physical paths exactly as today.

This lets one existing semantic coordinator apply:

```text
put target document
put target companion
delete source document
```

across two ProjectIds in one preflight / before-state / apply / rollback batch.

Source companion cleanup remains auxiliary after the semantic move, preserving existing semantics.

### cross-process coordination

Cross-project access means more than one Brain process may mutate the same ProjectId. To make a cross-project atomic batch meaningful, every operation that writes Brain cognition state uses the existing brain-root file semantic lease: semantic mutations and auxiliary learning/accessibility updates share the same cross-process boundary.

This deliberately trades unused parallel write throughput for one simple correctness rule:

```text
all Brain semantic mutations under one brainRoot
→ one cross-process lease
```

Pure reads remain concurrent. A `read` related relation suppresses the archival `brain_cat` auxiliary update entirely, so that path remains side-effect free. A future measured contention problem may replace this with ordered per-project leases without changing public behavior.

## 10. Errors

Routing layer owns only three related-project codes:

- `unknown-related-project`
- `related-project-unavailable`
- `related-project-read-only`

Behavior:

- healthy config + missing alias → unknown;
- whole config unavailable → any `#alias` use → unavailable;
- known but invalid/unregistered/conflicting relation → unavailable;
- valid relation + normal missing cognition → existing `not-found` / `target-not-found` etc.;
- related read-only mutation → read-only before side effects.

Messages carry specific diagnostic reason but are not stable copy contracts.

## 11. Public tool schemas and guidance

Extend path schemas to accept `#alias` wherever project cognition is semantically valid.

- `brain_cat`: concrete core or archival cognition, built-in or related.
- `brain_ls/glob/grep.path`: memories directories, built-in or related.
- maintenance tools: same existing object-kind restrictions plus related roots.
- `brain_absolute_path`: built-in or related workspace location.

Remove guidance that forbids core reads merely because a core is resident. Keep real object-kind restrictions.

## 12. Implementation touchpoints

Expected primary files:

- `src/persistence/project-mapping.ts` — read-only registered-root lookup.
- `src/runtime/project-relations.ts` — config load/validation/resolution.
- `src/brain/namespace.ts` — addressed public path/resource model; `ScopeRef` unchanged.
- `src/application/read-discovery.ts`, `src/brain/discovery.ts` — core cat + configurable public path presentation.
- `src/application/anchor-restore.ts`, `src/application/anchor-renderer.ts` — relation projection only.
- `src/runtime/application.ts` / new routed application facade — per-project lightweight access and routing.
- `src/persistence/cognition-state-store.ts`, `src/persistence/operation-coordination.ts` — binding-aware cross-project mutation and brain-root mutation lease.
- `src/integration/public-tools.ts`, `src/integration/mcp-adapter.ts` — public schemas, descriptions, routing delegation/error mapping.
- `src/runtime/production.ts` — retain active source root in services.

Do not duplicate cognition document parsing, accessibility rules, discovery ranking, exact-edit logic, or normal maintenance semantics for related projects.

## 13. Test mechanisms

Tests should prove semantics, not prose.

- relation config parser/resolver: deterministic temp filesystem + project metadata; no network/real external resource.
- addressed namespace: table tests for built-in/related parse/format and invalid shapes.
- related read: same cognition returned with `#alias` presentation; read-only cat leaves companion bytes unchanged.
- core cat: built-in and related core exact read succeeds.
- discovery: omitted search includes all workspace project memories, preserves distinct `@project/...` / `#alias/...` identities, applies one combined bounded priority selection, and does not mutate memory state; explicit related search remains narrowed to that alias.
- permission: all mutation tools reject read-only relation before state change.
- move: cross-project write/write succeeds; read endpoint rejects; injected physical failure restores both projects.
- anchor projection: typed relation data/errors and absence of related core content; semantic prompt eval for guidance behavior/self-relative core references.
- regression: existing built-in scope tests remain green except tests whose old expectation was intentionally removed (`brain_cat` core prohibition / copy-sensitive guidance).

No exact prompt sentence, section order, punctuation, or error-message copy assertions.