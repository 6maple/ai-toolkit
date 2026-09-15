# Brain v5 — Acceptance Specification

Status: candidate acceptance baseline after Example / Coverage Design.

Verification avoids copy-sensitive prompt/message assertions. Stable public tokens may be asserted exactly; prose quality is reviewed semantically.

| ID | Given | When | Then | Verification |
|---|---|---|---|---|
| A01 | No `.brain/config.json` exists | Brain restores context | Built-in scopes work normally and no related project is created | Automated |
| A02 | Config has valid relative and absolute related `path` values | Relations are resolved | Each valid alias binds to the already registered ProjectId; no parent guessing or ProjectId creation occurs | Automated |
| A03 | A related `path` is missing, unregistered, or conflicting | Brain restores context or the alias is used | Only that alias is unavailable; built-ins and other valid aliases remain usable | Automated |
| A04 | Config JSON/schema is invalid | Brain restores context | Related configuration is reported as unavailable without breaking built-ins | Automated |
| A05 | A ProjectId has multiple source roots with different local configs | Brain runs from one source root | Only that active source root's `.brain/config.json` defines its relations | Automated |
| A06 | A valid relation is configured | `brain_think` restores context | The relation is discoverable by alias, access, configured-path-derived file matcher, and core address; related core content is not resident | Automated structure + AI Semantic Review |
| A07 | A relation path is relative or absolute | `brain_think` presents applicability | The matcher preserves the configured path form and does not expose canonical path, ProjectId, or unrelated source roots | Automated structure |
| A08 | Work targets files matching one relation | The model prepares project-specific file work or judgment | That relation's core is read before project-specific work; the model then follows the core's own read directives, immediately reading memories explicitly marked as mandatory and leaving other memories on-demand | AI Semantic Review / integration prompt eval |
| A09 | A project is only listed or mentioned | The model considers the turn | Its core is not loaded solely because of mention | AI Semantic Review / integration prompt eval |
| A10 | Two or more related file matchers overlap | Work targets a file matching all of them | All matching related cores apply; no hidden most-specific-wins behavior exists | Automated applicability logic + AI Semantic Review |
| A11 | A valid related project contains core and memories | Exact cognition paths are used | `brain_cat` can read both built-in/related core and archival cognition documents | Automated |
| A12 | Related memories exist | `brain_glob` or `brain_grep` omits `path` | Related memories are excluded from the default search corpus | Automated |
| A13 | Related memories exist | Discovery explicitly addresses `#alias/memories/...` | Only the explicitly addressed related memory tree is searched/listed | Automated |
| A14 | A relation is `read` | Read/discovery/cat/absolute-path operations target it | Reads work normally and `brain_absolute_path` is not blocked by relation access | Automated |
| A15 | A relation is `read` | A Brain operation would mutate its cognition | The operation fails with `related-project-read-only` and does not partially mutate state | Automated |
| A16 | A relation is `write` | A valid Brain cognition mutation targets it | Mutation follows the same object semantics as built-in project cognition | Automated |
| A17 | `brain_mv` changes multiple projects | One or more changed related projects lack `write` | The move is rejected atomically; every changed related project must be writable | Automated |
| A18 | `#alias` is not configured | A Brain tool addresses it | The operation fails with `unknown-related-project` | Automated |
| A19 | `#alias` is configured but unavailable | A Brain tool addresses it | The operation fails with `related-project-unavailable` while unrelated scopes remain usable | Automated |
| A20 | A valid related cognition path does not exist | It is read or mutated | Existing object-level errors such as `not-found` are reused; no relation-specific duplicate error taxonomy is introduced | Automated |
| A21 | A relates to B and B relates to C | A's Brain context is restored | A can address only relations explicitly configured by A; B's relation to C is not inherited | Automated |
| A22 | A related ProjectId has additional registered source roots not named by A's relation | `brain_think` restores context | The relation exposes only the configured-path-derived applicability matcher, not those other roots | Automated structure |
| A23 | A built-in core is already resident | The caller explicitly cats that core | Exact core read remains legal; residency does not become an access restriction | Automated |
| A24 | A project core declares a mandatory durable cognition | The core is read locally or through a related alias | The mandatory item is expressed as an explicit `立即读取 xxx` directive and is read before continuing project-specific work; the full durable cognition does not need to be duplicated into core | AI Semantic Review / focused prompt eval |
| A25 | Related project cognition contains `@project/memories/decision/x.md` | `brain_cat`, `brain_ls`, `brain_glob`, or `brain_grep` returns that text through `#alias` | The returned related content stays unchanged, while local output guidance tells the model to follow `@project/...` as `#alias/...` for Brain tool calls and to keep `@project/...` when writing back; a write/edit through the alias does not rewrite untouched `@project/...` text | Automated semantics + AI Semantic Review |
| A26 | A relation is `read` and an archival cognition has accessibility/companion state | `brain_cat` reads it through `#alias` | The content read succeeds without changing the target project's cognition or auxiliary learning/accessibility state | Automated |

## Coverage result

Covered dimensions:

- config absent/valid/invalid;
- relative/absolute path resolution and no auto-create;
- source-root-local relation ownership;
- related-project discovery and bounded loading;
- overlapping applicability;
- explicit vs omitted archival search;
- read/write permission and atomic multi-project mutation;
- one-hop/non-transitive relation semantics;
- local degradation and stable error codes;
- simplified core access semantics.

No current Requirement lacks a verification destination.

