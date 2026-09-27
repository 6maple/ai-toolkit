# Brain v6 — Acceptance Specification

Status: Frozen / Verified. Delivery evidence: `05-verification-delivery.md`.

2026-09-22 post-implementation review corrected only the verification method for A11/A12 from a generic integration prompt-eval label to `AI Semantic Review + host integration`; the Given/When/Then behavior did not change.

Verification should protect stable behavior and structure, not exact prose except for public path/error tokens that are themselves contract.

| ID | Given | When | Then | Verification |
|---|---|---|---|---|
| A01 | Brain starts for a normal project | `brain_think` restores context | The resident built-in Core set is Global Core + Project Core | Automated |
| A02 | Two different host sessions use the same active source root / Brain project | Each restores Brain context | Both receive the same built-in Project cognition eligibility; host session identity does not select another Brain scope | Automated integration |
| A03 | A host provides no session identity | Brain restores context | Restore behavior remains complete for Global + Project cognition | Automated |
| A04 | A caller uses a built-in Brain public path | The public path parser/tool validates it | `@global` and `@project` are the complete built-in root set; other roots are rejected by the generic invalid-root contract | Automated |
| A05 | Tool definitions are exposed to a model | Schemas/descriptions are inspected | Public path guidance names the current Global, Project, and related-project address forms | Automated structure |
| A06 | `brain_think` is model-visible | Its input schema is inspected/called | Its model-visible input is the strict empty object | Automated contract |
| A07 | Global and Project memories exist | Omitted-path `brain_glob` or `brain_grep` runs | Global memory is searched once; current Project and available related Project memories are searched | Automated |
| A08 | Semantic search is enabled | A query runs from a project | Eligible cognition comes from Global, current Project, and available related Projects | Automated |
| A09 | A project task starts in Session A and should be continuable later | The model persists the task cognition | Complete task cognition is written to the applicable `@project/memories/<role>/...`, not to a session address | AI Semantic Review |
| A10 | That unfinished task needs reliable continuation | The Project Core is maintained | Core contains only the necessary trigger/path/usage route to the project memory; complete task detail is not duplicated there | AI Semantic Review |
| A11 | Session B later continues the same project task | It restores Project Core and follows the applicable route | Session B can recover the canonical project cognition without access to Session A state | AI Semantic Review + host integration |
| A12 | Multiple different project tasks are active in different host sessions | Each task is persisted | Their canonical cognition coexists under Project memories and Project Core can contain the necessary independent routes without one task becoming session-private | AI Semantic Review + host integration |
| A13 | A Scope Core is empty | `brain_edit(content=...)` initializes it | Initialization succeeds | Automated |
| A14 | A Scope Core is non-empty | `brain_edit(content=...)` attempts a whole-document replacement | The operation fails with `nonempty-core-requires-exact-edit` and leaves the Core unchanged | Automated |
| A15 | A non-empty Scope Core contains the expected exact region | `brain_edit(edits=[...])` changes that region | The change succeeds while preserving unrelated content | Automated |
| A16 | Another process changes the exact region before a stale edit runs | The stale exact edit executes | The edit fails with the existing exact-edit mismatch behavior and does not overwrite the newer Core | Automated concurrency/integration |
| A17 | A deliberate full rewrite of a non-empty Scope Core is needed | One exact edit uses the complete current Core as `oldText` | Rewrite succeeds only if the complete expected document is still current | Automated |
| A18 | An archival memory is non-empty | `brain_edit(content=...)` revises that same cognition | Existing archival full-document edit semantics remain available; the Core-only restriction does not apply | Automated |
| A19 | A new project runtime is initialized | Brain materializes its required built-in resident state | The Global and Project Scope Cores are available in their canonical storage roots | Automated filesystem integration |
| A20 | Legacy session storage is empty | v6 cutover migration runs | Empty session artifacts can be removed without creating Project memories | Migration verification |
| A21 | A legacy Session Core or session memory contains still-useful project cognition | v6 cutover migration is performed | The cognition is reviewed and merged/moved to the correct Project canonical owner; unfinished important work has a Project Core route when needed | Manual/AI-assisted migration review |
| A22 | Legacy session content is transient, obsolete, or duplicated by an existing project owner | Migration is performed | It is discarded or merged instead of being mechanically copied into new duplicate Project memories | Manual/AI-assisted migration review |
| A23 | Migration has completed | v6 production starts | The active runtime/public namespace matches the two-scope v6 contract without a migration compatibility layer | One-time cutover inspection |
| A24 | Brain Web presents cognition | Pages/search are generated | Global and Project cognition are projected into their current page/search forms | Automated/UI structure |
| A25 | Related projects are configured | `brain_think` and omitted-path discovery run | Existing related Project Core/memory ownership and access rules remain intact | Regression automated + AI Semantic Review |
| A26 | A model has temporary tool output, scratch reasoning, or reply-planning state with no future project value | It decides whether to persist | No Brain mutation is required solely to protect transient conversation state | AI Semantic Review |
| A27 | Information becomes necessary for future project work, even though it arose in one session | The model decides where it belongs | It is preserved under Project cognition; creation session is not used as the scope criterion | AI Semantic Review |

## Coverage result

Covered dimensions:

- two-scope cognition ownership;
- Session removal from public namespace and tool guidance;
- host session identity decoupled from cognition selection;
- Project Core active-work routing;
- cross-session continuation through Project cognition;
- default and semantic discovery without a session source;
- shared Core stale-write protection;
- no new session cognition storage;
- one-time legacy migration and no permanent compatibility path;
- related-project regression boundary;
- transient conversation state staying outside Brain.

The implemented v6 design maps these expectations onto namespace types, storage, anchor restore/rendering, tool schemas, discovery, semantic index, host integrations, Brain Web, and the one-time migration procedure. Permanent regression tests protect the current two-scope behavior; legacy-removal evidence remains in delivery notes and Git history rather than in long-lived fixtures.
