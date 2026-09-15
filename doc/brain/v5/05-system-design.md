# Brain v5 — System Design

Status: stable system design for v5 multi-project cognition.

## Parent baseline

This design implements the frozen behavior in:

- `01-requirements-contract.md`
- `02-acceptance-spec.md`
- `03-test-design-review.md`
- `04-acceptance-freeze.md`

It must not redefine those behaviors from current implementation constraints.

## Design goal

Add cross-project cognition access while preserving each project's existing Brain identity and cognition semantics.

The smallest sufficient architectural change is:

```text
existing cognition model
@global / @project / @session
        ▲
        │ unchanged
        │
relation + routing + access
        │
        ▼
#alias → target ProjectId
```

A related project is a routing target, not a new cognition scope.

## Responsibility black boxes

### 1. Project Relation Catalog

Owns the current source root's relation configuration and resolution.

Input:

- active `sourceRoot`
- `<sourceRoot>/.brain/config.json`
- registered Brain project metadata

Output per configured alias:

- alias
- configured `path`
- model-visible `files` matcher derived from that path
- `read | write` access
- resolved target ProjectId, or unavailable diagnostic

Responsibilities:

- strict config validation
- relative/absolute path resolution
- exact lookup against already registered source roots
- no parent guessing
- no ProjectId auto-create
- local degradation for broken aliases
- one-hop relation semantics

It does not load target cognition and does not bootstrap a target runtime.

### 2. Public Namespace Router

Owns binding a public Brain path to a cognition owner.

```text
@global/...       → current global scope
@project/...      → current ProjectId / project scope
@session/<sid>/...→ current ProjectId / session scope
#mobile/...       → relation lookup → target ProjectId / project scope
```

The router keeps public addressing separate from cognition semantics:

```text
#mobile/memories/knowledge/a.md
     │
     ├─ relation identity: #mobile → ProjectId B
     └─ cognition identity: project/memories/knowledge/a.md
```

`#alias` therefore does not become a `ScopeRef` kind and does not participate in session, accessibility, cycle, or other scope-domain rules.

### 3. Project Cognition Access

Owns lightweight storage access for any known ProjectId.

It provides the target project's existing project cognition through the same storage/document semantics already used by the current project.

For related projects it must not perform runtime bootstrap side effects merely to read cognition:

```text
related read
→ bind target ProjectId
→ open cognition store/access
→ read

NOT:
→ create missing core
→ initialize runtime state
→ prepare Git history
```

Mutation may use the same project storage primitives, but only after permission and target validation have succeeded.

### 4. Anchor Relation Projection

Owns the related-project portion of `brain_think` output.

Normal resident restoration remains:

```text
@global core
@project core
@session core (when applicable)
```

Related projection contributes relation metadata only:

```text
#mobile [read]
files: ../mobile/**
core: #mobile/core.md
```

It does not read or inject related core/memories.

Once a related core is explicitly read, that core owns its project-local cognition routing: keep core small and direct, use explicit 立即读取 xxx directives for mandatory durable cognition, and leave non-mandatory memories on-demand. Relation projection must not duplicate or second-guess those directives.

Project-owned cognition keeps same-project references as `@project/...` in storage. When a related read/discovery result contains such a reference, the routed read layer adds short local guidance: follow `@project/...` through the current `#alias/...` for Brain tool calls, but keep `@project/...` unchanged in stored content. The Markdown itself is never rewritten.

Broken aliases become bounded diagnostics; they do not prevent normal built-in restoration or valid relations from being projected.

### 5. Routed Read / Discovery

Owns applying existing read semantics after public namespace routing.

Rules:

- explicit `#alias/...` routes to that project's project cognition
- `brain_cat` may read concrete core or archival cognition documents
- related `brain_ls`, `brain_glob`, `brain_grep` require explicit related addressing
- omitted-path discovery builds its search set only from built-in applicable scopes; relations are not appended to it

The read layer should not need a second implementation of cognition parsing, pagination, summaries, or discovery semantics.

### 6. Mutation Permission Gate

Owns relation-level Brain mutation authorization.

Before any related cognition state can change:

```text
resolve all public targets
→ identify every related ProjectId whose state would change
→ require access=write for each
→ only then prepare/apply mutations
```

This is a Brain API semantic boundary, not a filesystem ACL.

`brain_absolute_path` bypasses this mutation gate because mapping a path is not a Brain cognition mutation.

### 7. Multi-project Semantic Operation

Owns atomic Brain mutations that span more than one project, especially `brain_mv`.

A cross-project operation must be one semantic operation:

```text
resolve + authorize all targets
→ preflight all physical mutations
→ capture all before-state
→ apply complete mutation set
→ rollback all touched resources on failure
```

Do not implement cross-project move as independent source-delete and destination-write operations.

The existing operation-coordination model is the precedent: preflight, before-state, deterministic mutation ordering, and rollback remain the mechanism to extend. Coordination must cover all touched project resources in one transaction boundary.

## Ownership

| Concern | Owner |
|---|---|
| relation declaration | active source root `.brain/config.json` |
| alias / access / configured path | Project Relation Catalog |
| stable target identity | existing ProjectId mapping |
| public `#alias` binding | Public Namespace Router |
| project cognition content | target project's existing project cognition store |
| proactive resident content | current anchor restore only |
| related applicability projection | Anchor Relation Projection |
| Brain mutation permission | Mutation Permission Gate |
| mutation atomicity / rollback | Multi-project Semantic Operation |
| host filesystem actions after absolute path | host, outside Brain permission ownership |

## Main flows

### brain_think

```text
active sourceRoot
→ restore built-in cognition as today
→ load relation catalog
→ project valid aliases + local errors
→ render one bounded context
```

Relation loading does not read target cognition.

### Explicit related read

```text
brain_cat("#mobile/core.md")
→ namespace route #mobile
→ validate relation is available
→ bind ProjectId B project cognition
→ use existing concrete-document read semantics
→ return content
```

Read access does not require `write`.

### Explicit related discovery

```text
brain_grep(path="#mobile/memories/", ...)
→ route #mobile
→ search only B project memories
```

Omitting `path` never adds B to the search set.

### Related mutation

```text
brain_edit("#mobile/core.md", ...)
→ route #mobile
→ relation available?
→ access=write?
→ execute existing edit semantics against B project cognition
```

### Cross-project move

```text
brain_mv("#brain/memories/a.md", "#mobile/memories/a.md")
→ resolve both aliases
→ both available
→ require write on both
→ derive one multi-project mutation plan
→ atomic apply / rollback
```

## Failure and degradation boundaries

```text
alias absent
→ unknown-related-project

alias configured but unusable
→ related-project-unavailable

mutation through read relation
→ related-project-read-only

relation valid but cognition object absent/wrong
→ existing object errors
```

Config/relation failure is bounded to relation access and projection. It must not invalidate current built-in cognition services.

A mutation authorization or preflight failure happens before side effects. A failure after side effects begin must restore all touched project resources or surface the existing fatal restore invariant.

## Concurrency / recovery

The Brain repository remains the common physical persistence domain. Multi-project cognition mutation therefore uses a shared semantic coordination boundary rather than independent per-related-project transactions.

No new distributed-transaction model is needed: v5 only needs the existing local persistence rollback guarantee to cover resources belonging to multiple ProjectIds.

Read-only related access does not acquire mutation permission or initialize project runtime state.

## Guarantees → mechanisms

| Required result | Failure to prevent | Minimal mechanism |
|---|---|---|
| related projects stay independent | alias becomes a new/merged scope | route alias to existing ProjectId project scope |
| read relation has no mutation side effect | read initializes/changes target Brain state | lightweight project cognition access, no bootstrap |
| bad relation does not break Brain | config resolution globally aborts invocation | relation catalog with per-alias unavailable result |
| related cognition stays bounded | all relations enter resident/default search | metadata-only anchor projection + explicit routing |
| read-only relation cannot mutate through Brain | mutation reaches store before permission check | permission gate before mutation planning |
| cross-project move cannot half-complete | separate project transactions diverge | one semantic mutation plan with shared rollback |
| resolver details stay hidden | canonical paths/ProjectId leak into model | separate internal resolved relation from model projection |

## Design Evidence & Alignment

### Frozen behavior

The v5 Requirements / Contract / Acceptance documents are the behavior owners. This design does not infer new behavior from current code.

### Existing implementation evidence

- `StorageBinding` currently binds one `projectId`; `CognitionStateStore`, `ReadDiscovery`, and `CognitionMaintenance` are built around that binding.
- `resolveOrCreateProject` already establishes stable ProjectId ↔ source-root mapping, including multiple source roots per project.
- current runtime bootstrap creates required cores and prepares history, so using full bootstrap for a related read would add unnecessary side effects.
- `PersistentOperationCoordinator` already performs mutation preflight, captures before-state, orders mutations, and rolls all resources back if apply fails.
- current MCP adapter is already a central public-tool routing seam.

These facts support adding relation/routing/access seams around the existing cognition model rather than copying the cognition domain for related projects.

### Precedent decision

Strictly preserve:

- existing project cognition object semantics
- ProjectId ownership
- storage containment / document parsing
- read/discovery behavior after routing
- semantic-operation preflight and rollback model

Intentionally extend:

- public namespace root resolution
- per-invocation access to multiple project bindings/stores
- mutation coordination across resources owned by different ProjectIds

Do not preserve old restrictions whose only reason was resident core content, per the frozen v5 Contract.

### Rejected alternatives

**Related as a new `ScopeRef` kind** — rejected because relation is routing identity, not a new cognition continuity scope. It would leak relation concepts into session/cycle/accessibility semantics.

**Full runtime bootstrap per related project** — rejected because read relations would trigger core/history initialization and broaden failure coupling.

**One independent coordinator per target project** — rejected because a cross-project move could partially commit.

## Detailed Design leaves

Only these areas still contain material implementation choices:

1. relation config loading + exact ProjectId lookup + model projection data shape;
2. public namespace parsing/routing and target binding representation;
3. lightweight per-ProjectId cognition access construction and reuse;
4. mutation permission checking plus multi-project semantic-operation resource coordination;
5. application/MCP wiring that gives anchor, reads, maintenance, and `brain_absolute_path` the same relation context.

Existing document semantics, accessibility/epistemic rules, ordinary single-project read/mutation algorithms, and Git checkpoint behavior do not need redesign unless leaf analysis exposes a real incompatibility.

## System Design Gate

Every frozen v5 behavior has an owner and an end-to-end flow. Major state, failure, and atomicity responsibilities are unique. No unresolved user-owned context remains.

Next stage: Detailed Design for the five leaves above.

