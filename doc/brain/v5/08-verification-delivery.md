# Brain v5 ? Verification / Delivery

Status: implementation verified.

## Delivered

- source-root-local `relatedProjects` config with exact registered-project resolution and per-alias `read | write` access;
- `#alias/...` public routing without adding a related cognition `ScopeRef`;
- related-project projection in `brain_think` without preloading related cognition or exposing resolver internals;
- explicit related discovery/read, including `core.md`, plus omitted `glob` / `grep` over global/current-session memory and all materialized workspace project memories with one combined bounded selection over collected candidates; registered-but-unmaterialized related cognition contributes an empty default-search result;
- read-only related `brain_cat` with no target cognition/accessibility mutation;
- related mutation permission enforcement and `brain_absolute_path` permission independence;
- one semantic cross-project move transaction with binding-aware preflight, before-state, rollback, and shared move-domain derivation;
- one project-metadata snapshot per relation-catalog load, while config and access are still reloaded per public tool invocation;
- model-facing tool guidance aligned with configured `#alias` capability;
- project-core mandatory-memory routing remains explicit; related reads keep stored `@project/...` text unchanged and add local `#alias/...` follow guidance only when that text is returned.

## Verification evidence

From `code/brain` after the final changes:

```text
pnpm run typecheck
? pass

pnpm test --run
? 10 test files passed
? 161 tests passed

pnpm run build
? package build pass
? public/shared declaration generation pass

git diff --check
? no whitespace errors
```

The v5 suite includes an injected physical failure after cross-project destination writes begin. The semantic operation fails, the source cognition remains intact, and the destination cognition is absent afterward, proving rollback across distinct ProjectIds/bindings rather than only the successful path.

## Deliberate boundary

All Brain cognition-state writes under one `brainRoot` currently share the brain-root semantic lease, including auxiliary learning/accessibility writes. This favors correctness over unused write parallelism. Pure reads remain concurrent; a `read` related relation suppresses archival-cat auxiliary writes.

If rollback itself fails, Brain continues to use the existing `restore-failed` fatal invariant of the executing coordinator. v5 does not add a distributed/persistent corruption marker across independent Brain processes; that would be a separate recovery capability and is not required by the frozen v5 contract.
