# Brain v5 — Requirements and Public Contract

Status: stable baseline for v5 multi-project cognition.

## Goal

Allow the active source root to explicitly relate independent Brain projects and use their **project cognition** without merging ProjectId, ownership, or sessions.

## Requirements

- A relation is declared by the active source root and is directional, local, and one-hop only.
- A related project exposes only its project cognition: `core.md` and `memories/**`.
- Related sessions are never exposed. Related-project relations are never inherited transitively.
- Each relation has `read | write` access; omitted access defaults to `read`.
- Brain enforces relation write permission only for Brain cognition mutation operations. `brain_absolute_path` remains available; later host filesystem access is outside this permission boundary.
- Related cores are not resident by default. The model loads them only when the related project becomes applicable to the current work.
- Omitted-path active discovery treats the current project and available related projects as one workspace: global memories and the current session are searched once, while project memories are searched across the current project and every available relation. A registered related project whose project cognition has never been materialized contributes no memories to this default search. This does not automatically load related cores or memories into `brain_think`.

## Source-root-local config

Config file:

```text
<sourceRoot>/.brain/config.json
```

Schema:

```json
{
  "relatedProjects": {
    "mobile": {
      "path": "../mobile",
      "access": "read"
    }
  }
}
```

Rules:

- `relatedProjects.<alias>` is an object; no shorthand form.
- `path` is required.
- `access` is optional and is `read | write`; default is `read`.
- Unknown fields and malformed config are errors, not silently ignored.
- Missing `.brain/config.json` means no related projects and is not an error.
- Relative `path` resolves from the active source root; absolute paths are allowed.
- The resolved existing directory must exactly match an already registered Brain `sourceRoot`.
- Do not search parents and do not auto-create a ProjectId from relation config.
- Invalid/unregistered/conflicting targets make only that alias unavailable; built-in scopes and other valid aliases continue working.
- If one ProjectId has multiple source roots, each source root may have its own `.brain/config.json`.
- Multiple aliases may intentionally resolve to the same other ProjectId and keep independent access settings; `brain_think` warns about that configuration without exposing the ProjectId.

## Public namespace

Built-ins remain:

```text
@global/...
@project/...
@session/<sid>/...
```

Related-project cognition uses:

```text
#<alias>/core.md
#<alias>/memories/...
```

`#<alias>` is a current-source-root-local public alias. Stable internal identity remains ProjectId.

There is no related-session namespace and no recursive relation namespace.

## brain_think experience

For each valid relation, `brain_think` exposes only the information the model needs to apply related cognition:

```text
#mobile [read]
- files: ../mobile/**
- core: #mobile/core.md
```

The `files` matcher is derived only from the configured `path` and preserves whether that path was relative or absolute. Brain must not expose the canonical/resolved source root, ProjectId, `project.json`, or other source roots belonging to the same ProjectId.

Behavior rule:

- Before reading, changing, or analyzing a file matching a relation's `files`, read that relation's `core` first.
- Before making a project-specific decision about a related project, read that relation's `core` first.
- A relation being listed or merely mentioned does not trigger a core read.
- After the core is read, follow the core's own memory-read directives. Memories marked by the core as mandatory must be read immediately; other memories remain on-demand.
- Core should stay a small, direct cognition entrypoint like the global core. A mandatory memory is expressed explicitly as `立即读取 xxx`; do not duplicate the full durable cognition into core merely to make it resident.
- Project-owned cognition keeps same-project references in stored content as `@project/...`. Do not migrate or rewrite them to caller-local aliases.
- When related read/discovery returns text containing `@project/...`, the result must clearly tell the model to use the current `#alias/...` when following that reference with Brain tools, and to keep `@project/...` unchanged when writing the cognition back.
- This is output-local access guidance only. Brain does not rewrite the returned Markdown, and tool inputs remain fully qualified public paths.
- If multiple relation matchers apply, all matching related cores apply; there is no hidden precedence rule.
- If multiple available aliases resolve to the same Brain project, `brain_think` shows a warning naming the aliases but not the ProjectId; the aliases remain usable.
- If there are no relations, relation warnings, or relation errors, no related-project section is needed.

## Tool semantics

Residency controls proactive loading only; it does not define access capability.

- `brain_cat` may read any concrete cognition document, including built-in and related `core.md`.
- `brain_ls`, `brain_glob`, and `brain_grep` remain archival-memory discovery tools.
- Omitted-path `brain_glob` / `brain_grep` search global memories, current-session memories when present, current-project memories, and every available related project's materialized project memories. A related project with no materialized project cognition contributes an empty result to omitted-path discovery. Explicit `path` still narrows discovery to exactly the addressed memory tree and preserves existing `not-found` behavior.
- `brain_write`, `brain_edit`, `brain_rm`, `brain_mv`, and `brain_feedback` keep their existing object semantics, extended to `#alias/...` where the object kind is valid.
- Restrictions that only existed because a core was resident should be removed. Restrictions with real object semantics remain; e.g. removing/moving core or applying archival feedback state to core remains invalid.
- A Brain operation that changes related-project cognition requires that relation to have `write` access.
- `brain_mv` requires write permission for every related project whose cognition state it changes.
- `brain_absolute_path` accepts related paths regardless of relation access.

## Error surface

Use a small stable public error surface:

- `unknown-related-project` — `#alias` is not configured.
- `related-project-unavailable` — alias is configured but its relation cannot currently resolve/use its target.
- `related-project-read-only` — a Brain cognition mutation targets a relation with read-only access.
- Otherwise reuse existing object errors such as `not-found`, `wrong-object-kind`, etc.

Detailed config failure belongs in the diagnostic message rather than creating many public error codes. One bad relation must not break built-in scopes or other valid relations.

