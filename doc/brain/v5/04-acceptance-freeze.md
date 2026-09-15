# Brain v5 — Acceptance Freeze

Status: FROZEN for Engineering Design; re-frozen after the core-routing clarification.

## Frozen inputs

- `01-requirements-contract.md`
- `02-acceptance-spec.md`
- `03-test-design-review.md`

These files define the current v5 behavioral baseline. Engineering Design, tests, and implementation must conform to them rather than redefining behavior from current source structure.

## Verification ownership

- Automated: config, namespace, mapping, discovery scope, permissions, atomic mutations, errors, tool object semantics, applicability data.
- AI Semantic Review / focused prompt eval: whether model-facing guidance produces the intended related-core loading behavior without relying on exact prose.
- Existing tests/source: evidence and regression context only; they do not override the frozen v5 contract.

## Non-goals retained

- No merging of independent ProjectIds.
- No related-session exposure.
- No transitive relation inheritance.
- No automatic loading of all related cores or memories. Mandatory follow-up reads are declared by the loaded project core itself with explicit mandatory-read directives. Stored same-project references remain `@project/...`; when related output exposes such text, Brain gives local guidance to follow it through the current `#alias/...` and to preserve `@project/...` on writeback.
- No default-search expansion into related projects.
- No filesystem ACL/security boundary after `brain_absolute_path` returns a host path.
- No requirement to preserve old restrictions that existed only because built-in core was resident.

## Gate result

Requirements: stable.
Public Contract: stable.
Example / Coverage: complete.
Test Design Review: pass.
Acceptance: frozen.

System Design: stable.
Current stage: Detailed Design.

