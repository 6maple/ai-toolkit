# Brain v5 — Test Design Review

Status: reviewed against the v5 Requirements and Public Contract.

## Review conclusion

The acceptance matrix is sufficient to freeze behavior. No material product ambiguity remains.

The test strategy must prove stable semantics, not generated wording or current implementation shape.

## Keep

Automated tests should focus on:

- config parsing and source-root-local ownership;
- exact existing-project resolution and no auto-create;
- namespace resolution for `#alias/...`;
- explicit/default discovery scope;
- read/write permission enforcement;
- atomicity for cross-project mutation;
- local degradation and stable error codes;
- cat access to concrete core documents;
- non-transitive relations;
- applicability data for overlapping matchers;
- absence of resolver internals from the model-facing projection.

Use fakes for filesystem/application boundaries where the behavior under test is semantic logic. Do not create real network, process, or unrelated IO resources in ordinary unit tests. Use focused filesystem integration tests only where canonical path/project mapping behavior itself is the claim.

## Do not add

Do not add tests that assert:

- exact `brain_think` prose, sentence order, punctuation, whitespace, or section copy;
- exact recovery-message wording when a stable error code/state already proves the contract;
- internal helper/module names, private data structures, call order, or wiring unless that order is itself public behavior;
- duplicate cases whose only difference is another alias/name/path string but the semantic branch is identical;
- model behavior by checking that a particular English instruction substring exists;
- implementation-specific canonical-path intermediates when the public claim is configured-path-derived applicability.

## Prompt/model-facing verification

The model-facing behavior in A08/A09/A10 cannot be proven by brittle string assertions.

Preferred verification split:

1. Automated tests prove the structured facts Brain supplies: alias, access, matcher, core address, overlap set, and absence of forbidden resolver internals.
2. AI Semantic Review / focused integration prompt eval checks whether rendered guidance reliably causes the intended behavior: read applicable core first, follow its mandatory-memory directives, avoid mention-only preload, apply all overlapping cores, and use a related result's local `@project/...` -> `#alias/...` access mapping without rewriting stored `@project/...` content.
3. Exact-string assertions are reserved only for stable public tokens such as `#alias/core.md` or public error codes where the exact token is itself the contract.

## Review changes from existing precedent

Existing tests that reject `brain_cat("@project/core.md")` or assert guidance such as `cannot read core.md` / `already fully present` represent the old resident-core restriction and should be replaced, not preserved as compatibility truth.

Existing project-mapping tests for stable ProjectId and multiple source roots remain useful precedent, but related-project relation behavior must be tested separately because `sourceRoots` still mean multiple filesystem roots for one ProjectId, not cross-project relations.

## Gate

- Every v5 Requirement has a verification destination.
- No Scenario depends on production internals as expected behavior.
- No text-copy assertion is required to prove the product contract.
- No unresolved product ambiguity remains.

Test Design Review: PASS.


## v5 amendment — core routing and read-only learning state

Review result: pass.

- Core mandatory-read behavior and the clarity of related `@project/...` access guidance are semantic prompt-eval concerns; do not lock exact prose. Automated tests should prove the alias mapping is present when needed and that stored `@project/...` text remains unchanged.
- Read-only related exact reads must verify persisted accessibility/companion state is unchanged. This is a state guarantee, not an implementation-call-count assertion.
- Public path tokens (`#alias/core.md`, `#alias/memories/...`) and stable error codes may be asserted exactly; surrounding prose may not.
