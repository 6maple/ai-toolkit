# Brain v6 — Cognition Scope and Project Continuity Contract

Status: Frozen / Implemented in Brain v6.

v6 only reopens cognition scope, Project Core continuity, session coupling, default discovery, Scope Core mutation safety, and legacy session-cognition migration. Other Brain behavior continues from the current implemented baseline unless this document explicitly changes it.

## Goal

Brain keeps cognition according to where it must continue to be useful, not according to which chat/session produced it.

The public cognition model has two built-in continuity scopes:

```text
@global
@project
```

A host may still have a session/thread identifier for its own runtime behavior. That identifier is not a Brain cognition scope.

## Continuity ownership

### Global

Use `@global` for cognition that should continue across projects.

### Project

Use `@project` for cognition that belongs to the current project and should remain available to future work in that project.

This includes cognition formed in one session when another session, a later session, or a restored context may need it. The session where cognition was created does not determine its Brain scope.

Examples include:

- project decisions and constraints;
- reusable project knowledge and methods;
- active project goals, task progress, blockers, and remaining work that should survive the current conversation;
- state needed to continue an unfinished project task in another session.

### Transient conversation state

Information that only serves the current conversation and has no value after the current context is gone does not enter Brain.

A raw tool result, temporary scratch state, reply-planning detail, or unformed discussion is not persisted merely because context compression may occur. If the information becomes important enough that future project work must recover it, preserve the resulting cognition under `@project`.

## Project Core

`@project/core.md` is the resident entrypoint for project cognition.

It may contain:

- short project-wide guidance that must remain resident;
- the minimum trigger + exact memory path + usage guidance needed to make important project cognition reliably discoverable;
- routes for important active work that another session may need to continue.

Complete cognition remains in `@project/memories/<role>/...`.

For active work, prefer a direct route such as:

```text
继续设计或实现 Brain cognition scope 调整时，
立即读取 @project/memories/intention/brain-v6-cognition-scope.md。
```

Project Core is not a catalog of every project memory and does not duplicate full task history. When an active route is no longer needed, remove the route; keep any still-useful decision, knowledge, intention, or skill in its canonical project memory.

The same rule applies to a related project's `#alias/core.md`: it is that project's Project Core addressed through the caller-local alias.

## Public namespace

Valid built-in cognition paths are:

```text
@global/core.md
@global/memories/{decision,knowledge,intention,skill}/...

@project/core.md
@project/memories/{decision,knowledge,intention,skill}/...
```

Related-project cognition remains:

```text
#<alias>/core.md
#<alias>/memories/{decision,knowledge,intention,skill}/...
```

`@session/<sid>/...` is no longer a valid Brain public path.

This applies consistently to exact reads, discovery, mutation, `brain_absolute_path`, semantic indexing, anchor restore, and Brain Web presentation.

## brain_think and host sessions

`brain_think` restores applicable Global + current Project cognition, plus the existing related-project guidance.

It does not require or expose a cognition `session_id`.

A host/plugin may still know its current thread/session for host-owned concerns such as invocation binding, approval routing, logs, or UI state. Such identifiers must not select a Brain cognition scope, create Brain session storage, or change which Global/Project cognition is eligible.

Two different host sessions bound to the same Brain project therefore restore the same built-in Project Core and project memories. Existing source-root-local behavior, such as which relatedProjects configuration applies, continues to depend on the active source root rather than on session identity.

## Discovery

Omitted-path archival discovery searches:

```text
global memories once
+ current project memories
+ every available related project's materialized project memories
```

There is no current-session memory source.

Explicit `path` continues to search only the addressed Global, Project, or related-project memory tree.

Semantic discovery follows the same scope model. A derived semantic index must not expose or rank a session cognition scope.

## Cognition mutation

New archival cognition can be written only under Global, current Project, or a writable related Project.

Moving cognition between continuity scopes is therefore limited to Global ↔ Project or between project addresses allowed by the existing related-project access contract.

Session paths are rejected rather than silently redirected to Project.

### Shared Scope Core update safety

Project Core is shared by all sessions working on the same project. A model may therefore hold an older resident copy while another process has already changed the file.

To prevent a whole-document stale write from silently removing another session's route:

- an empty Scope Core may be initialized with `brain_edit(content=...)`;
- a non-empty Scope Core must be changed with exact edits;
- a deliberate whole-document rewrite of a non-empty Core is expressed as one exact edit whose `oldText` is the complete current document and whose `newText` is the complete replacement;
- if the expected old text has changed, the edit fails instead of overwriting the newer content.

This applies to Global Core, current Project Core, and related Project Core.

Attempting `brain_edit(content=...)` on a non-empty Scope Core fails with `nonempty-core-requires-exact-edit`.

Archival cognition keeps its existing `brain_edit(content=...)` behavior; this restriction is only for shared Scope Core documents.

## Legacy session cognition migration

v6 runtime does not retain compatibility support for `@session/<sid>/...` cognition paths after cutover.

Before removing legacy session storage:

- empty session directories/Core files may be discarded;
- every non-empty legacy Session Core and session archival memory must be inspected;
- project cognition that remains useful is merged or moved into the correct `@project/memories/<role>/...` canonical owner;
- important unfinished work receives the necessary Project Core route;
- purely transient or obsolete session state may be discarded;
- duplicate copies must be merged into the existing project owner rather than mechanically creating one memory per old session.

Migration is a one-time cutover activity, not a permanent runtime compatibility layer.

## Related projects

v6 does not change the ownership model introduced for related projects:

- related projects expose Project Core + project memories only;
- no related-session namespace exists;
- omitted-path discovery treats current + related project memories as one workspace while preserving each project's identity and access rules.

The v5 wording that also included the current session is superseded by this v6 contract.

## Non-goals

v6 does not make Brain responsible for preserving the host's raw conversation transcript or reconstructing arbitrary conversational state after context compression.

v6 does not introduce automatic task tracking from every conversation. Only cognition that should continue is persisted, and Project Core only routes cognition important enough to require reliable resident discovery.

v6 does not change the four archival cognitive roles or the existing related-project permission model except where session scope is removed.
