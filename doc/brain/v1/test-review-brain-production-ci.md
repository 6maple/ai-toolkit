# brain Production CI Compliance Review

> **Date:** 2026-08-20  
> **Scope:** brain core only  
> **Inputs:** Frozen BDD + Frozen Acceptance Specification + confirmed Engineering Design + Production CI tests  
> **Purpose:** record the dated implementation/test result without turning BDD/Acceptance/Design into an execution log.

## 1. Review conclusion

The reviewed Production CI baseline is Green.

- Default project command: `pnpm test`
- Production CI: **9 files / 60 tests / 60 pass**
- Fake Green self-validation (temporary pre-production scripts): **5 files / 80 tests / 80 pass** when explicitly enabled; scripts were removed from the current test tree after Production CI baseline
- `pnpm run typecheck`: pass
- `pnpm run build`: pass
- `pnpm exec vp lint`: pass

The default CI suite executes real brain production business/application logic while filesystem/persistence/process/network/LLM resource boundaries remain deterministic fake/stub resources.

No real temp directory, filesystem adapter, MCP stdio transport, child process, network call, LLM call, or wall-clock sleep is created by the default Production CI tests.

## 2. Specification traceability

Machine-assisted review plus Test Design Review currently shows:

- Frozen BDD: **43 REQ / 72 Scenario**
- BDD Scenario → Acceptance Specification: **72/72 traced**
- Frozen Acceptance/Fault/Invariant cases: **47/47 have an explicit CI or project-selected non-CI destination**
- Production CI behavior flows / invariants are represented directly in the Production CI suite
- `TRACE-RYW-01` remains a cross-cutting trace and intentionally does not create a duplicate test.

Test counts are execution facts, not the definition of coverage. Coverage evidence remains the BDD → Example → Acceptance → Production tests trace plus review of scenario quality and abstraction boundaries.

## 3. Production test boundary

### Normal Acceptance

Normal Production CI tests drive real handlers through the stable application/tool facade. They do not read or assert state/index/UUID/lock/helper internals.

The main production seam introduced for CI is deliberately small:

- `registerBrainTools(...)` registers real public handlers without creating an MCP stdio transport;
- the CLI path creates `StdioServerTransport` only when the module is directly executed;
- `ls/grep` can receive the existing pi tool execution seam during tests, while production defaults remain the real pi tool definitions.

### Fault / Invariant

White-box knowledge is restricted to the level already allowed by the frozen test strategy:

- Fault Given may seed fake persisted state or inject one deterministic fake resource failure;
- Invariant/Mechanism tests may read Design parameters or call an existing pure mechanism function;
- Then/observable behavior remains public or a stable Design invariant.

The fake filesystem is a resource test double only. It implements generic file operations over Map/Set and contains no brain path, learning, approval, move, or memory-domain rules.

## 4. Real Production Reds found by the frozen tests

The Production CI connection exposed five implementation defects. In each case the existing Frozen expectation remained unchanged; only production implementation was corrected.

### R1. Windows physical path leakage from grep output

`rewriteBrainPaths()` tokenized on `:`, splitting a Windows drive prefix such as `C:` before it could be converted to an `@` address.

Correction: preserve the drive-letter colon, separate grep-style `:<line>:` suffix from the path, then resolve/rewrite the physical memory path.

### R2. Feedback-only `brain_edit` was rejected

The current edit implementation always delegated `edits=[]` to the targeted-edit primitive, which rejects an empty edit list.

Correction: when feedback exists, an empty edit list keeps the document unchanged and proceeds to feedback handling. Ordinary edit without feedback still requires an actual edit. Zero-delta `correct` remains invalid through the confirmed feedback-direction rule.

### R3. `brain_mv file -> directory` shorthand remained implemented

The lifecycle implementation still appended the source basename when an archival destination was a memory type directory.

Correction: any directory destination is rejected; source and destination use explicit file-level public paths, matching confirmed A10.

### R4. Feedback clamp created two visible truths

When a requested importance delta was clamped, state/index used the applied importance while the Markdown frontmatter retained the requested importance. A later L1 read therefore disagreed with mechanism state.

Correction: after feedback resolution, the applied importance is also written back into the same Markdown document before the mutation commit completes. Markdown, index, and learning state now expose one coherent result.

### R5. `questioned` status was ranked but not rendered

The mechanism stored `questioned` and applied its ranking penalty, but `renderCorePayload()` omitted the status from the candidate line.

Correction: candidate output now includes the existing public `questioned` status. The Acceptance test verifies the stable relation: an otherwise-equivalent active memory ranks before the questioned memory, without fixing a numeric score coefficient.

## 5. Behaviors that connected directly Green

The current implementation already satisfied the frozen behavior for representative areas including:

- legal write boundaries and invalid create/overwrite atomicity;
- targeted edit success and invalid-result rollback;
- feedback direction rejection;
- core full-document read/replace;
- protect approval pending + confirmed retry;
- same-process concurrent successful writes without lost update;
- EOF L2 not counting as an effective learning read;
- L0/L2 exposure not substituting for adopt;
- promotion and demotion as signals only;
- core ↔ archival, core ↔ core, same/cross-layer archival move, replace semantics, and learning-history round-trip;
- predictable commit rollback;
- corrupt persisted input fail-loud;
- conflicting active learning identity fail-loud;
- candidate bound by current Design limit;
- core capacity enforcement;
- repeated `brain_think` calls not being deduplicated into one event;
- wall clock alone not changing event-time decay;
- rm recoverability/audit evidence at the fake resource/domain boundary.

## 6. Default CI entry

`vite.config.ts` now limits the default `vp test` collection to:

`tests/ci-spec/production-*.test.ts`

Therefore `pnpm test` is the reviewed resource-free Production CI entry.

The following remain outside the default CI signal:

- Fake Green self-validation files;
- pre-existing legacy/internal tests;
- tests that create real filesystem/process/MCP resources.

Those files were not deleted or relabeled as automatically verified Manual/E2E cases. Future treatment is a project Test Strategy decision.

## 7. Frozen cases intentionally not proven by default CI

The following behavior remains specified but is not claimed as default CI verified:

- natural-language semantic quality of `brain_think` description and other actionable guidance where AI/manual review is the stronger verifier;
- real two-process global concurrency;
- real process restart/persistence;
- real filesystem adapter / MCP stdio wiring;
- real physical rm recycle/audit evidence.

This is intentional. The generic `design-rule.md` does not require Manual/E2E as a universal phase; brain may choose additional verification according to project maturity/release needs.

## 8. Compliance result

The current baseline satisfies the agreed process boundary:

1. BDD and Examples were frozen before production became the work object.
2. Acceptance Test Design was reviewed independently of current production internals.
3. Fake Green validated test scripts with minimal local stubs rather than a reference implementation.
4. Production connection changed Arrange/wiring where needed while preserving frozen behavior expectations.
5. Default CI uses real production business logic with fake resource boundaries.
6. Fault/Invariant white-box access remains narrow and purpose-specific.
7. Real resource verification is not falsely claimed by stub/fake CI results.
8. Production implementation now has a Green resource-free CI baseline suitable for the outer loop of subsequent refactor/TDD.

