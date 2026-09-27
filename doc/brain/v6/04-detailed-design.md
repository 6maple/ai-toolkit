# Brain v6 — Detailed Design

Status: Implemented / Verified. Delivery evidence: `05-verification-delivery.md`.

## Parent contract

Implements:

- `01-requirements-contract.md`
- `02-acceptance-spec.md`
- `03-system-design.md`

The implementation should remove obsolete Session branches rather than leave them dormant behind flags.

## 1. Namespace and logical types

### ScopeRef

Change:

```ts
type ScopeRef =
  | { kind: "global" }
  | { kind: "project" }
  | { kind: "session"; sessionId: SessionId };
```

to:

```ts
type ScopeRef =
  | { kind: "global" }
  | { kind: "project" };
```

Remove from Brain cognition namespace:

- `SessionId`;
- `parseSessionId`;
- `invalid-session-id`;
- `@session` parsing;
- session branches in `formatScopePrefix`, path equality and related helpers.

After this change:

```text
parsePublicPath("@session/s1/core.md")
→ invalid-root
```

Related aliases keep their own existing safe alias validation. They do not depend on a Brain SessionId type.

### PublicBrainRoot

Keep the v5 addressed-root model:

```ts
type PublicBrainRoot =
  | { kind: "builtin"; scope: ScopeRef }
  | { kind: "related"; alias: RelatedProjectAlias };
```

A related root continues to map internally to Project scope.

### Shared exports

Remove `SessionId` and `parseSessionId` from `brain/shared` and Brain public/internal exports.

Any host that needs a session identifier owns its own local type/validation.

## 2. Physical storage

Simplify `scopeRoot(binding, scope)`:

```ts
switch (scope.kind) {
  case "global":
    return <brainRoot>/global;
  case "project":
    return <brainRoot>/projects/<projectId>;
}
```

No active Brain operation constructs:

```text
projects/<projectId>/sessions/<sid>
```

`projectPhysicalResource`, companion paths and scope state continue to derive from `ScopeRef`; they naturally become two-scope after the type change.

### CognitionStateStore

Remove session-specific prefix construction from archival enumeration. The only prefixes are:

```text
@global
@project
```

Do not add logic that automatically maps old physical Session paths into Project.

### Generic scope helpers

Any helper that currently distinguishes two Session scopes by `sessionId` becomes a normal two-kind comparison. In particular:

- `brain/discovery.ts` scope equality keeps only Global/Project kind equality;
- `application/cognition-maintenance.ts` removes Session from `sameScopeRef` and `scopeOrderKey`;
- `application/anchor-restore.ts` scope keys are simply `global | project`.

`brain_mv` still supports valid scope changes such as Global ↔ Project and routed moves between writable projects; only Session endpoints disappear.

## 3. Anchor restore

### Request and scope selection

Remove `currentSessionId` from `AnchorRequest`.

Replace dynamic `applicableScopes(request)` with the fixed active set:

```ts
[
  { kind: "global" },
  { kind: "project" },
]
```

Delete `ensureSessionCore` completely.

This removes the current side effect that creates an empty session directory/Core on first restore.

### Projection

Remove `currentSessionId` from `AnchorProjection`.

`cores` contains exactly Global Core and Project Core for a normal current project.

Accessibility/passive-exposure cycles continue independently for Global and Project exactly as today.

### Renderer

Remove Session branches from:

- `corePresentation`;
- continuity-scope rendering;
- preserving/maintaining guidance.

Use direct scope guidance:

```text
@global
→ cognition that should continue across projects

@project
→ cognition that belongs to this project and future project work may need

only current conversation, no future project value
→ do not persist in Brain
```

Project Core guidance explicitly says that important active work can be routed to Project memories, while complete task state belongs in those memories.

Do not introduce a separate "compression recovery" rule. Recovery follows normal Project cognition ownership.

## 4. Read / lexical discovery

### ReadDiscoveryContext

Change to:

```ts
interface ReadDiscoveryContext {
  signal?: AbortSignal;
}
```

Remove SessionId imports and `currentSessionId`.

### Default search scopes

```ts
function defaultSearchScopes(): readonly ScopeRef[] {
  return [
    { kind: "global" },
    { kind: "project" },
  ];
}
```

Explicit path discovery remains unchanged except that `@session` can no longer parse.

### RoutedBrainApplication

- `think()` takes no session argument.
- `glob/grep` keep the existing workspace merge logic.
- `askSearch` forwards only signal + related project identities.
- `ls/cat` no longer receive session context.

No new workspace-ranking code is introduced.

## 5. Semantic discovery and index

### Public semantic context

Change:

```ts
interface SemanticDiscoveryContext {
  relatedProjects?: RelatedSemanticProject[];
  signal?: AbortSignal;
}
```

Remove `currentSessionId`.

`recordFor` handles only:

- global;
- current project;
- related project.

A semantic row whose scope is neither global nor project is impossible under the v6 schema.

### Semantic index identity

Change scope unions in `SemanticIndexEntry`, `CatalogRow`, `PendingRow` to:

```ts
"global" | "project"
```

`keyFor` becomes:

```text
global|<role>/<path>
project|<ProjectId>|<role>/<path>
```

Remove all session-key/prefix branches.

### SQLite schema

Increment `INDEX_SCHEMA_VERSION` from `2` to `3`.

Recreate `cognitions` without `session_id`:

```sql
CREATE TABLE cognitions (
  cognition_key TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL,
  project_id TEXT,
  role TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  description TEXT NOT NULL,
  description_hash TEXT NOT NULL,
  status TEXT,
  content_hash TEXT NOT NULL,
  content_mtime_ms REAL NOT NULL,
  content_size INTEGER NOT NULL,
  state_mtime_ms REAL NOT NULL,
  state_size INTEGER NOT NULL,
  embedding BLOB NOT NULL
);

CREATE INDEX cognitions_scope_idx
ON cognitions(scope_kind, project_id);
```

The existing schema-version mismatch path drops/rebuilds the derived table, so no row-level migration is needed.

### Eligibility query

`listEligible` selects:

```sql
scope_kind = 'global'
OR
(scope_kind = 'project' AND project_id IN (...current + related...))
```

No session clause or parameter remains.

### Reconciliation

`collectUnknownCandidates` scans:

1. Global;
2. every registered Project's Project scope.

Delete `sessionIds()` and all session-directory scanning.

`resolvePendingTarget` recognizes only:

```text
global/memories/...
projects/<id>/memories/...
```

### Watch classification

`semanticMemoryPath` recognizes the current Global and Project memory path shapes.

The watcher contains no legacy-scope branch. Paths that are not a current semantic memory path follow the ordinary current reconciliation rules rather than being identified by a retired namespace.

## 6. Public tool schemas

### brain_think

Change input schema to:

```ts
z.strictObject({})
```

No `session_id` compatibility field is retained.

### Path patterns

Change built-in scope pattern from:

```text
@global | @project | @session/<sid>
```

to:

```text
@global | @project
```

Related `#alias` remains unchanged.

Update descriptions for:

- `brain_absolute_path`;
- `brain_ls`;
- `brain_glob`;
- `brain_grep`;
- `brain_cat`;
- `brain_write`;
- `brain_edit`;
- `brain_rm`;
- `brain_mv`;
- `brain_feedback`.

Default discovery descriptions say:

```text
global memories + all workspace project memories
(current + available related projects)
```

Remove references to Session Core/current-session memories.

## 7. MCP adapter and invocation model

### BrainToolInvocation

Change to:

```ts
interface BrainToolInvocation {
  services: BrainApplicationServices;
}
```

`BrainToolInvocationResolver(extra)` remains because Codex needs request metadata to select the correct sourceRoot-specific services.

Remove from Brain's MCP adapter:

- `HostInvocationAdapter`;
- `THREAD_META_HOST_INVOCATION`;
- `optionalSession`;
- `discoveryContext(hostSession,...)`;
- `session-id-conflict` guidance.

Use a simple signal context:

```ts
function discoveryContext(signal?: AbortSignal) {
  return signal === undefined ? {} : { signal };
}
```

### Tool handling

`brain_think` becomes:

```text
routed ? routed.think() : anchor.runAnchor({})
```

Lexical/semantic discovery receives signal only.

### registerBrainTools

Simplify signature from the current four-argument host-invocation form to:

```ts
registerBrainTools(
  server,
  services,
  options = {},
)
```

Update internal call sites/tests. No external host currently needs the removed positional `HostInvocationAdapter`; Codex already uses `resolveInvocation`.

## 8. Production restore API

Change:

```ts
interface ProductionBrainRestoreRequest {
  sourceRoot: string;
  sessionId?: string;
}
```

to:

```ts
interface ProductionBrainRestoreRequest {
  sourceRoot: string;
}
```

`restoreProductionBrainContext` creates services for the source root and calls `routed.think()` / `anchor.runAnchor({})`.

No Brain SessionId parsing remains.

## 9. Codex host integration

Codex continues to own its session/thread identity because it is needed to map MCP calls back to the correct source root.

### invocation-binding.ts

Move the current conservative session-id validation into the Codex plugin itself so v6 does not accidentally change Codex's accepted binding identifiers while removing the Brain type.

For example:

```ts
type CodexSessionId = string & { __brand: "CodexSessionId" };

const CODEX_SESSION_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
```

This is a host implementation detail, not a Brain cognition rule.

### UserPromptSubmit

Keep requiring `session_id` and `cwd` from Codex.

Change Brain restore call to:

```ts
restoreProductionBrainContext({
  sourceRoot: input.cwd,
});
```

Then keep writing:

```text
session_id → cwd/sourceRoot
```

to the Codex invocation binding for later MCP calls.

### MCP server

`codexThreadId(extra)` remains host-local.

Flow:

```text
threadId
→ readCodexInvocationBinding
→ servicesFor(binding.sourceRoot)
→ { services }
```

Do not return a current Brain session id.

## 10. DSH host integration

### Automatic brain_think

Change:

```ts
manager.call(
  sourceRoot,
  "brain_think",
  { session_id: agent.id },
  ...
)
```

to:

```ts
manager.call(
  sourceRoot,
  "brain_think",
  {},
  ...
)
```

### Visible tool calls

Remove the special `brain_think` argument injection from `buildCallArgs`.

Tool args pass through unchanged after normal object conversion.

DSH may still use agent/session state to determine `cwd`, manage OpenCode headers, approvals or other host behavior. Those concerns are outside Brain cognition and are not modified by v6.

Brain MCP calls no longer need DSH `threadId` metadata either. Remove that metadata from Brain calls unless a future host-owned feature independently requires it; source-root instance selection already provides the Brain project binding.

## 11. Scope Core stale-write protection

Add:

```text
nonempty-core-requires-exact-edit
```

to `MaintenanceInputErrorCode`.

In `CognitionMaintenance.edit`, after resolving/loading the current scope and identifying `path.kind === "core"`:

```ts
if (request.content !== undefined && scope.core.text.length > 0) {
  throw new MaintenanceInputError(
    "nonempty-core-requires-exact-edit",
  );
}
```

Then reuse the existing `deriveEditedText` + exact-edit implementation.

This check runs inside `runSemanticOperation`, under the existing brain-root semantic lease, against the latest persisted Core.

### Error guidance

MCP guidance:

```text
The Core already contains content. Read the current Core and update it with exact edits.
For a deliberate complete rewrite, use one exact edit whose oldText is the complete current Core.
```

### Why no version field

The existing exact-edit contract already provides the required compare-and-set behavior. A separate Core revision/version would duplicate this mechanism and add another state owner.

## 12. Brain Web

In `code/brain-web/lib/brain-pages.ts`:

- remove `SessionId`, `parseSessionId`, `listSessions`;
- change search scope union to `"global" | "project"`;
- remove `sessionId` search metadata;
- simplify `memoryPathKey` to Global/Project only;
- remove `renderSessionOverview`;
- remove the per-project session enumeration loop.

Brain Web then reflects the active v6 cognition model rather than exposing legacy filesystem data.

## 13. Legacy session migration

Migration happens before production code stops parsing Session paths.

### Inventory

Enumerate all:

```text
<brainRoot>/projects/<ProjectId>/sessions/<sid>/
```

and classify:

- empty Core + zero archival memories;
- non-empty Core;
- one or more archival memories.

The current observed local baseline is only migration evidence, not a product rule.

### Archival cognition

For each legacy session memory:

1. read the complete cognition and its role;
2. locate an existing Project canonical owner for the same cognition;
3. if the same cognition already exists in Project, merge the still-valid content into that owner and remove the old session copy;
4. otherwise move the cognition to an appropriate `@project/memories/<role>/...`;
5. preserve conditions/evidence and avoid copying transient session history that has no future value.

While v5 is still active, using Brain's existing move/edit semantics is preferred because companion/accessibility state is handled consistently.

### Session Core

For each non-empty Session Core:

1. identify any durable project guidance or active-work route;
2. move complete cognition into Project memories if it is not already there;
3. add only the necessary Project Core route;
4. discard content that only described the old session's transient state after its useful cognition has been preserved.

### Cleanup gate

Before switching to v6 code:

```text
all non-empty session cognition reviewed
+ no useful cognition remains under sessions/
+ affected Project Core routes verified
```

Then remove legacy `sessions/` trees.

Do not make v6 runtime read old session folders as a fallback.

## 14. Tests

Use temporary Brain roots and deterministic test fixtures. Do not use the user's real cognition files as test resources.

### Namespace / storage — A04, A19

Update `production-core-model.test.ts` and runtime integration tests to protect the current two-scope model directly:

- ScopeRef cases are Global / Project;
- public-path tests exercise the current built-in roots plus a generic unknown-root rejection;
- storage projection covers the canonical Global / Project roots;
- runtime bootstrap materializes the required Global / Project Scope Cores.

Do not keep regression cases whose only purpose is to name or simulate a removed legacy scope. Removal of obsolete code/path branches is checked during implementation/cutover review instead of becoming permanent CI vocabulary.

### Anchor — A01, A02, A03, A09–A12, A26–A27

Update `production-anchor.test.ts`:

- exactly Global + Project cores are resident;
- preserving guidance routes project-continuing cognition to Project;
- resident/archival selection continues to follow the current two-scope model.

Use AI Semantic Review or focused prompt evaluation for the model-choice scenarios around Project vs transient cognition; pair cross-session continuity claims with host integration evidence.

### Read discovery — A07

Update `production-read-discovery.test.ts` and related-project tests:

- omitted path collects Global + Project locally;
- routed workspace adds related Project memories.

### Semantic — A08

Update semantic discovery/index/reconcile tests around the current model:

- scope kind union is Global / Project;
- eligible query covers Global + current/related Projects;
- reconciliation scans the active Global / Project storage model;
- schema version rebuilds derived state for the current index shape.

Legacy storage cleanup is not represented as a permanent semantic-index regression fixture.

### Tool contract — A05, A06

Update `production-contract.test.ts`:

- `brain_think` has zero input keys;
- public schemas describe the current Global / Project / related-project addresses;
- resolver returns the selected project services;
- sourceRoot-scoped invocation routing still works through resolver.

### Core mutation — A13–A18

Update `production-maintenance.test.ts`:

- empty Core accepts `content`;
- non-empty Core rejects `content` with `nonempty-core-requires-exact-edit`;
- local exact edits preserve unrelated text;
- stale exact edit fails after another serialized change;
- complete-document exact edit succeeds only against exact current content;
- archival `content` edit still succeeds.

The stale-write test uses two operations/services against the same temporary brain root; it does not need real user data.

### Host integration — A02, A03

Codex plugin verification:

- two thread bindings for the same sourceRoot resolve to the same project cognition behavior;
- thread id still selects the correct sourceRoot binding;
- Brain restore receives only sourceRoot.

DSH plugin verification:

- auto-think sends `{}`;
- normal Brain tool arguments pass through unchanged;
- sourceRoot still comes from the current host cwd.

Host-specific session/thread behavior remains tested only where it is still an actual host feature, such as Codex invocation binding or OpenCode request headers.

### Brain Web — A24

Add/extend Brain Web catalog tests around a temporary Brain root:

- Global and Project pages/search docs are generated from the active storage model;
- projected Markdown preserves code text while escaping Vue-significant tag-like text where needed.

### Related projects — A25

Keep existing related-project tests around current Project ownership, permissions, routing, and workspace discovery behavior.

### One-time legacy cleanup verification

Legacy scope removal is an implementation/cutover concern, not a permanent regression vocabulary.

During the v6 cutover:

- inspect real non-empty legacy cognition and migrate/merge/discard it as required;
- scan active Brain source for obsolete namespace/storage/anchor/discovery/index branches;
- confirm old physical trees can be removed after useful cognition is preserved;
- record the evidence in delivery notes / Git history.

Do not keep long-lived tests that manufacture legacy paths, directories, tool arguments, or model-visible wording only to assert that the removed mechanism is still absent.

## 15. Implementation order

To avoid losing legacy cognition, implementation is not applied in arbitrary file order.

Use this sequence:

```text
1. Review/approve this Design
2. Inventory + migrate real legacy non-empty Session cognition while v5 can still read it
3. Add/update tests for frozen v6 behavior
4. Change namespace/storage/anchor/read contracts
5. Change semantic index + schema version
6. Change MCP/tool contracts
7. Change Codex/DSH host adapters
8. Change Brain Web
9. Run full verification
10. Remove now-empty legacy session trees if not already removed
11. Update project memories/docs that still describe current-session discovery
```

Step 2 is intentionally before the code cutover. Tests in later steps use temporary fixtures, not the migrated real data.

## 16. Expected primary touchpoints

Brain core:

- `src/brain/namespace.ts`
- `src/brain/discovery.ts`
- `src/persistence/storage.ts`
- `src/persistence/cognition-state-store.ts`
- `src/application/anchor-restore.ts`
- `src/application/anchor-renderer.ts`
- `src/application/read-discovery.ts`
- `src/application/semantic-discovery.ts`
- `src/application/routed-brain.ts`
- `src/application/cognition-maintenance.ts`
- `src/runtime/semantic-index.ts`
- `src/runtime/semantic-pending.ts`
- `src/runtime/production.ts`
- `src/integration/public-tools.ts`
- `src/integration/mcp-adapter.ts`
- `src/index.ts`
- `src/shared.ts`

Hosts / UI:

- `code/brain-codex-plugin/src/invocation-binding.ts`
- `code/brain-codex-plugin/src/user-prompt-submit.ts`
- `code/brain-codex-plugin/src/mcp-server.ts`
- `code/brain-dsh-plugin/src/autothink.ts`
- `code/brain-dsh-plugin/src/index.ts`
- `code/brain-web/lib/brain-pages.ts`

Current operational documentation that describes the tool/host contract must be updated with implementation:

- `code/brain/README.md`
- `code/brain/MCP_HOSTS.md`
- `code/brain-codex-plugin/README.md` — keep Codex session/thread binding where it remains host-owned, but state that it no longer selects Brain cognition scope;
- `code/brain-dsh-plugin/README.md` — remove Brain `session_id` injection guidance.

Frozen v5 design/spec files remain historical evidence and are not rewritten.

Tests:

- core model;
- anchor;
- read discovery;
- maintenance;
- public contract/integration;
- related projects;
- semantic discovery/freshness/reconcile;
- host plugin verification;
- Brain Web catalog behavior.

## 17. Design completion check

A lower-experience implementer following this design should not need to decide:

- whether Session remains a hidden Brain scope;
- whether host thread id affects cognition eligibility;
- whether old session paths redirect to Project;
- whether semantic session rows survive;
- how Core concurrency is protected;
- whether migration happens before or after namespace removal;
- whether archival full-document edits are restricted.

Those decisions are fixed here. Equivalent local code organization remains implementation freedom.
