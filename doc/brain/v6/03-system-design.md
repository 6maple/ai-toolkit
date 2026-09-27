# Brain v6 — System Design

Status: Implemented / Verified. Delivery evidence: `05-verification-delivery.md`.

## Parent baseline

This design implements:

- `01-requirements-contract.md`
- `02-acceptance-spec.md`

v6 only reopens cognition scope, Project Core continuity, session coupling, discovery/tool contract affected by that scope, shared Scope Core mutation safety, Brain Web projection, and legacy session-cognition migration. Related-project ownership/access and other unaffected Brain behavior continue from the current implemented baseline.

## Design goal

Make Brain cognition ownership match where cognition must continue to be useful:

```text
cross-project cognition
→ Global

current-project cognition
→ Project

host conversation/session identity
→ host runtime only
```

The smallest sufficient architecture is to remove Session from Brain's cognition domain instead of adding more routing rules around it.

```text
Current

Host session
   │
   ├─ selects @session cognition
   └─ also helps host find current sourceRoot
          │
          ▼
Global / Project / Session Brain scopes

v6

Host session
   │
   └─ host-owned invocation binding only
          │
          ▼
     sourceRoot / services
          │
          ▼
Global / Project Brain scopes
```

## Design Evidence & Alignment

### User intent

The confirmed direction is:

- long-lived cognition is scoped by future reuse, not by the chat that produced it;
- Project owns cognition needed by later work in the same project, including work started in one session and continued in another;
- Session Core and Session Memories are removed from Brain cognition;
- Project Core keeps only resident guidance and routes to complete Project Memories;
- transient conversation state stays outside Brain.

### Current implementation evidence

The current Session cognition concept is not isolated. It appears in:

- `ScopeRef`, public parsing and formatting;
- physical storage under `projects/<id>/sessions/<sid>`;
- anchor scope selection and automatic empty Session Core creation;
- omitted-path read discovery;
- semantic index identity, SQLite schema, reconciliation and watcher paths;
- public tool schemas and MCP guidance;
- Brain Web pages/search;
- Codex/DSH integration arguments;
- tests.

The existing related-project design is a useful precedent: related projects already expose only Project Core + project memories and do not create a related Session scope.

The existing brain-root semantic lease already serializes cognition mutations across processes. It is sufficient for exact-edit compare-and-apply semantics, but a stale whole-document Core replacement can still remove a newer route unless whole-document Core replacement is restricted.

### Material design choices

1. Brain's cognition domain becomes two-scope: Global + Project.
2. Host session identity is removed from Brain application/tool contracts but may remain inside host adapters to find the correct source root or host state.
3. No `@session` compatibility alias is retained after cutover.
4. Legacy non-empty session cognition is migrated before the namespace removal is activated.
5. Shared Scope Core stale-write protection reuses existing exact-edit semantics instead of introducing version fields or a merge subsystem.
6. Semantic index is rebuilt as a derived two-scope index instead of migrating old session rows in place.

No remaining user-owned context is required to complete Detailed Design. Production implementation remains gated on owner review of this Design.

## Responsibility black boxes

### 1. Cognition Namespace

Owns Brain cognition identity.

Public built-in roots:

```text
@global
@project
```

Related project roots remain public routing aliases:

```text
#alias
```

Responsibilities:

- parse/format Global and Project cognition paths;
- reject `@session/...` as an invalid public Brain root;
- expose only Global/Project `ScopeRef`;
- keep related alias syntax outside `ScopeRef`, as today.

Host session identifiers are not defined here.

### 2. Cognition Storage

Owns physical locations for active Brain cognition.

```text
<brainRoot>/global
<brainRoot>/projects/<ProjectId>
```

It no longer maps any active `ScopeRef` to:

```text
projects/<ProjectId>/sessions/<sid>
```

Old session directories are legacy migration input only and are not part of the v6 active storage model.

### 3. Anchor Restore and Projection

Owns resident cognition restored by `brain_think`.

Always restores exactly:

```text
Global Core + Global passive candidates
Project Core + Project passive candidates
```

Related-project projection remains metadata-only and continues to route applicable work to `#alias/core.md`.

Anchor no longer:

- accepts a current Brain session;
- creates an empty Session Core;
- advances a session scope cycle;
- renders Session Core or session-preservation guidance.

Project Core projection is strengthened to explain that important active project work may be routed from Core to Project Memories.

### 4. Read / Active Discovery

Owns exact reads and lexical discovery after public path routing.

Default built-in search set becomes:

```text
Global memories
+ current Project memories
```

The routed workspace layer then adds every available related project's materialized Project memories exactly as in v5.

No Session identity is needed to calculate the default search set.

### 5. Semantic Discovery and Derived Index

Owns semantic recall over the same cognition universe as lexical discovery.

Eligible scope kinds become:

```text
global
project
```

The semantic database remains derived state. v6 increments its schema version and rebuilds it without session columns/rows rather than preserving obsolete Session identity.

Reconciliation scans:

- Global memories once;
- every registered Project's Project memories.

Legacy `projects/<id>/sessions/**` changes do not participate in semantic indexing after cutover.

### 6. Public Tool / MCP Application Contract

Owns model-visible Brain tool schemas and application invocation.

Changes:

- `brain_think` input becomes an empty strict object;
- all path schemas advertise Global / Project / `#alias` only;
- default discovery guidance no longer mentions current-session memories;
- Brain MCP application services and read/semantic contexts no longer carry `currentSessionId`;
- error/guidance surface removes session-id-specific errors.

The invocation resolver may still inspect host metadata to choose the correct `BrainApplicationServices`, but Brain receives only the resolved services, not the host session identity.

### 7. Host Invocation Binding

Owned by each host adapter, not Brain cognition.

#### Codex

Codex still needs `session_id/threadId` to map an MCP invocation back to the correct hook-created `sourceRoot` binding.

The flow becomes:

```text
Codex threadId
→ Codex invocation binding
→ sourceRoot
→ BrainApplicationServices for that sourceRoot
→ Brain tool call
```

The threadId never enters Brain cognition scope, anchor restore or discovery.

#### DSH

DSH still obtains the current source root from the current agent/session cwd.

It no longer injects `session_id` into `brain_think`. Brain calls are already routed to an InstanceManager entry selected by source root.

Other DSH session mechanisms unrelated to Brain cognition remain unchanged.

### 8. Scope Core Mutation Safety

Owns safe shared Core mutation across multiple sessions/processes.

The existing brain-root semantic lease remains the cross-process serialization boundary.

Inside that serialized mutation:

- empty Core + `content` → allowed initialization;
- non-empty Core + `content` → reject;
- exact edits → compare against the current Core inside the operation and apply only on an exact match;
- full rewrite of a non-empty Core → one exact edit with the complete current document as `oldText`.

No Core version number, patch-merging protocol or CRDT is added.

This rule applies to Global Core, current Project Core and writable related Project Core.

### 9. Legacy Session Cognition Cutover

Owns safe removal of the old Session cognition model.

Migration runs while the current implementation can still understand `@session` paths.

For every non-empty legacy Session Core / memory:

```text
inspect meaning
→ identify existing Project canonical owner if any
→ merge or move useful cognition
→ add/remove Project Core route as needed
→ discard only confirmed transient/obsolete/duplicate content
```

Empty session artifacts may be removed directly.

After all non-empty legacy cognition is handled, the physical `sessions/` trees are removed. Only then is the v6 namespace/runtime activated.

This is a release/cutover sequence, not a permanent runtime compatibility layer.

### 10. Brain Web Projection

Owns browsing/searching active Brain cognition.

It presents:

- Global Core/memories;
- each Project Core/memories.

It no longer enumerates `projects/<id>/sessions`, generates Session pages, or emits session search metadata.

## Ownership summary

| Concern | Canonical owner |
|---|---|
| cross-project cognition | Global |
| current-project cognition | Project |
| active-work full state | applicable Project memory |
| active-work resident route | Project Core |
| host session/thread identity | host adapter |
| active Brain scope identity | Cognition Namespace |
| physical active cognition location | Cognition Storage |
| passive restore | Anchor Restore |
| lexical discovery eligibility | Read Discovery + Routed Brain |
| semantic eligibility/index | Semantic Discovery / Semantic Index |
| related-project access | existing v5 relation/routing layer |
| shared Core compare-and-apply | Cognition Maintenance + existing semantic lease |
| legacy Session cleanup | one-time v6 cutover |
| browser/search projection | Brain Web |

## Main flows

### Normal brain_think

```text
sourceRoot
→ resolve/create ProjectId
→ load Global + Project
→ load related-project catalog
→ render Global Core + Project Core + bounded archival descriptions + related routing
```

No session value enters this flow.

### Codex automatic restore

```text
UserPromptSubmit(session_id, cwd)
→ restore Brain using cwd only
→ write Codex host binding session_id → cwd
→ inject Brain context
```

The binding exists so later MCP calls from the same Codex thread can resolve the correct source root.

### Codex MCP tool call

```text
MCP _meta.threadId
→ Codex reads its invocation binding
→ chooses BrainApplicationServices for bound sourceRoot
→ Brain handles tool args without session cognition
```

### DSH automatic restore

```text
current agent
→ host obtains cwd
→ manager chooses Brain instance/services by sourceRoot
→ brain_think({})
→ inject context
```

Agent/session identity remains host-local.

### Omitted-path discovery

```text
current ReadDiscovery
→ Global + current Project candidates
+
RoutedBrain
→ each available related Project candidates
→ one existing combined final ranking/bounding pass
```

### Shared Project Core edit

```text
model read current Core
→ submit exact edit
→ global semantic lease acquired
→ reload current Core
→ oldText still matches?
   yes → write
   no  → existing exact-edit mismatch error
```

### v6 cutover

```text
inventory legacy sessions
→ migrate/review every non-empty cognition
→ verify no useful cognition remains
→ remove legacy session trees
→ switch code/tests/docs to two-scope model
→ rebuild derived semantic index
```

## Failure and recovery boundaries

### Host binding failure

If Codex cannot resolve its thread binding, the error remains a Codex host-integration failure. Brain must not recreate Session cognition as a fallback.

### Stale Core edit

A stale exact edit fails without mutation. The caller rereads the Core and reapplies its intended local change against the new content.

### Legacy session path after cutover

`@session/...` fails as an invalid Brain path. It is never redirected to Project, because silent redirection could assign cognition to the wrong owner.

### Semantic index upgrade

A schema-version mismatch drops/rebuilds the derived cognition table. Markdown/companion cognition remains authoritative.

### Unmigrated old session data

The cutover process must complete migration before v6 production is activated. v6 runtime does not inspect old session cognition as a fallback.

## Detailed Design leaves

Detailed Design must specify:

1. namespace/type/export removal;
2. storage and state-store simplification;
3. anchor restore/renderer changes;
4. read/routed/semantic context simplification;
5. semantic schema/reconciliation/watcher changes;
6. public tools/MCP adapter changes;
7. Codex and DSH host decoupling;
8. Core edit guard/error semantics;
9. Brain Web removal of Session projection;
10. migration order;
11. test changes mapped to v6 Acceptance.
