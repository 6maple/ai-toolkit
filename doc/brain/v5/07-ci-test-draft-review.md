# Brain v5 — CI Test Draft / Review

Status: reviewed; ready for Production Baseline.

## Drafted verification

Primary new CI file: `code/brain/tests/ci-spec/production-v5-related-projects.test.ts`.

Covered behaviors:

- related `#alias` public address parses without creating a new `ScopeRef` kind;
- relation config exact-resolves only existing registered projects and never auto-creates;
- bad aliases degrade independently;
- `brain_think` exposes alias/access/applicability/core address but not related core content, ProjectId, or canonical source root;
- related core and archival cognition are readable with alias-rooted public paths;
- omitted discovery includes available related project memories, treats registered-but-unmaterialized related project cognition as empty, performs one combined bounded priority selection over collected candidates, and leaves search-only memory state unchanged; explicit related discovery stays in that alias and preserves `not-found`;
- multiple aliases targeting the same Brain project remain available and produce a `brain_think` warning without exposing ProjectId;
- read-only exact read does not mutate target accessibility/companion state;
- read-only Brain mutation fails with stable `related-project-read-only` code;
- relation config/permission is reloaded between tool invocations;
- `brain_absolute_path` maps a related address to the target project's physical Brain location without applying write permission;
- writable cross-project move succeeds; any read-only endpoint rejects before mutation;
- an injected physical failure after destination writes causes the cross-project semantic batch to roll both ProjectIds back to their before-state.

Existing public-contract tests are amended so `brain_cat` accepts core and related cognition paths. Copy-sensitive recovery-message assertions touched by this work were removed; tests retain stable error-code checks only.

## Review

Pass.

The tests do **not** assert prompt sentences, section ordering, punctuation, whitespace, or detailed error prose.

Exact string assertions are limited to stable semantic data:

- public cognition paths such as `#b/core.md`;
- configured applicability data such as `../b/**`;
- test-owned sentinel cognition content;
- stable public error codes.

The read-only side-effect check observes persisted domain state before/after the public read rather than helper calls or mock call counts.

The cross-project move tests observe source/destination cognition state rather than implementation sequencing. The rollback case injects failure only at the physical resource boundary after destination writes have begun, then verifies the source remains intact and the destination is absent.

## Fake Green decision

No separate reference implementation/Fake Green is introduced. The new tests use ordinary deterministic fixtures and existing real Brain application/storage code; their current expected Red can be established directly against production. Creating a fake cross-project implementation would duplicate the behavior under test and add no useful evidence.

Next: Production Baseline / Red.