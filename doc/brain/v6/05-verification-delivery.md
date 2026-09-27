# Brain v6 — Verification and Delivery

Status: Implemented / Verified on 2026-09-22.

## Delivered behavior

Brain production now uses two built-in cognition scopes:

```text
@global
@project
```

Host session/thread identifiers remain host-owned routing data where needed, but they do not select Brain cognition, enter Brain tool arguments, or create Session Core / Session Memories.

The implementation also includes:

- Project Core routing for project cognition without a Session cognition layer;
- omitted-path lexical and semantic discovery over Global + current/related Project cognition;
- `brain_think({})` with no cognition session parameter;
- rejection of `@session/...` as an invalid Brain public root;
- exact-edit protection for non-empty shared Scope Core documents;
- semantic-index scope/schema simplification to Global / Project;
- Codex host thread/session binding retained only for source-root/service resolution;
- DSH host session retained only for host/runtime concerns such as cwd and OpenCode request headers;
- Brain Web projection of Global / Project cognition only.

## Automated verification

### Brain core

Executed from `code/brain`:

```text
pnpm run typecheck
pnpm test
pnpm run build
```

Result:

```text
typecheck: passed
tests: 14 files, 175 tests passed
build: passed
```

The suite covers the current namespace/tool contract, Global/Project anchor restore, lexical discovery, related-project behavior, semantic discovery/index/reconciliation, maintenance semantics, and non-empty Scope Core exact-edit requirements. Real-filesystem integration also verifies that a stale Core exact edit from one runtime instance fails after another runtime instance has changed the same shared Core.

### Codex host adapter

Executed from `code/brain-codex-plugin`:

```text
pnpm run build
pnpm test
```

Result: passed.

The verification includes:

- hook restoration by cwd/source root;
- host session/thread retained for invocation binding;
- Global / Project cognition restored from the bound source root;
- one long-lived MCP server routing different host sessions to their bound projects;
- host-restored MCP hiding `brain_think`.

### DSH host adapter

Executed from `code/brain-dsh-plugin`:

```text
pnpm run typecheck
pnpm test
pnpm run build
```

Result: all verification cases passed and build succeeded.

The verification checks the current empty `brain_think` schema, Project cognition restore/search/write behavior, and the separate OpenCode request-header behavior owned by the host adapter.

### Brain Web

Executed from `code/brain-web`:

```text
pnpm test
pnpm run typecheck
pnpm run build
```

Result: 2 tests passed; typecheck and build passed.

During verification, real cognition containing angle-bracket text exposed a VitePress/Vue parsing failure. Brain Web now escapes Vue-significant angle brackets only in ordinary projected Markdown text while preserving inline, fenced, and indented code text. The underlying search document continues to retain the original cognition text. Deterministic catalog tests verify the current Global / Project page/search projection and this rendering behavior.

## Legacy Session cognition cutover

Immediately before final cleanup, the live Brain root contained two legacy Session directories under one project.

Both had:

```text
Core bytes: 0
archival memory Markdown files: 0
```

Only empty/internal state artifacts remained. No cognition required merge or move.

The containing legacy `sessions/` tree was removed. Verification immediately after removal reported:

```text
remainingSessionTrees=0
```

No runtime compatibility alias for `@session` is retained. This was verified as a one-time cutover/code-cleanup fact; permanent CI does not manufacture legacy paths or directories just to assert their absence.

## Semantic / continuity review

The v6 implementation work itself used the intended Project continuity model:

- complete v6 scope decisions and implementation state lived in Project Memories;
- Project Core contained only the active route needed to resume the work;
- complete task state stayed in Project Memories while Project Core held only the active route;
- after completion, the active Project Core route is removed while durable decision knowledge remains in Project Memory.

This provides a direct review of the A09–A12 and A26–A27 ownership intent in addition to deterministic contract tests.

A post-implementation review also corrected the A11/A12 verification label to `AI Semantic Review + host integration`. This changes only how those model-semantic continuity claims are evidenced; their required behavior is unchanged.

## Acceptance coverage summary

- A01–A08: automated Brain contract/anchor/discovery/semantic verification.
- A09–A12: AI Semantic Review of Project Memory/Core continuity plus host integration verification.
- A13–A15, A17–A18: maintenance/exact-edit tests.
- A16: two independent runtime instances against one real Brain root verify stale shared-Core exact edit rejection.
- A19: runtime/bootstrap integration verifies the required Global / Project resident storage is materialized correctly.
- A20–A23: one-time live migration/cutover inspection; these legacy-cleanup checks are intentionally not retained as regression fixtures.
- A24: deterministic Brain Web catalog test verifies current Global / Project projection, plus Brain Web typecheck/build.
- A25: existing related-project regression suite remained green.
- A26–A27: Project-vs-transient cognition semantic review during this implementation.

## Remaining operational note

Already-running host processes that loaded an older Brain build must be restarted before they can observe the new v6 runtime. This is ordinary process lifecycle behavior, not a v6 compatibility layer or remaining Session cognition support.
