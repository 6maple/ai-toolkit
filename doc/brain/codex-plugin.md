# Brain Codex plugin

> **Boundary:** this document owns the current Codex-specific lifecycle, trusted binding, transport, installation, and verification facts. Brain cognition behavior and model-visible anchor semantics are owned by [`v3/brain-tools-contract.md`](v3/brain-tools-contract.md), [`v3/design-brain-anchor-restore.md`](v3/design-brain-anchor-restore.md), and [`v3/design-brain-integration.md`](v3/design-brain-integration.md). The requirements below specialize those owners for Codex; they do not create a second Brain contract.

## Requirement and public contract

- **R1 — Required restore:** every `UserPromptSubmit` executes the same Brain restoration path as
  `brain_think` before Codex handles the submitted prompt.
- **R2 — One owner:** Brain remains the only owner of cognition selection, persistence, rendering,
  and learning semantics. The plugin is a Codex host adapter.
- **R3 — One restore owner:** the hook delivers Brain's unchanged rendered result as developer
  context, while the plugin MCP server omits `brain_think` to prevent duplicate restoration.
- **R4 — Explicit failure:** a restore failure makes the synchronous hook fail; it must not be
  replaced by fabricated empty context.
- **R5 — Host-owned invocation identity:** the synchronous hook binds its documented `session_id`
  and `cwd` together. Every MCP call resolves both project services and trusted session identity
  from that binding; model arguments cannot replace the trusted session.

The command hook returns Brain's rendered context unchanged in
`hookSpecificOutput.additionalContext`. Its handler sets `additionalContextLimit` to `0` so Codex
passes the complete result directly instead of spilling an oversized result to a temporary file.

## Acceptance examples

1. Given a Codex `UserPromptSubmit` event, when the hook runs, then it restores Brain with the
   documented `cwd` and `session_id` and returns the complete rendered context as developer context.
2. Given the plugin MCP server, when Codex lists tools, then it sees the remaining ten Brain tools
   and does not see `brain_think`.
3. Given the hook result is injected, then Codex receives the same rendered context that
   `brain_think` would return for that project and session.
4. Given two Codex sessions from different source roots share one long-lived MCP server, when each
   invokes a Brain tool, then each call uses its own project and session binding.

## Design evidence and alignment

- Codex plugin hooks are discovered from `hooks/hooks.json`; plugin commands receive `PLUGIN_ROOT`.
- `UserPromptSubmit` command-hook stdout becomes developer context before the model reasons about the
  submitted prompt.
- The hook uses Brain's programmatic host entry, which preserves the same application behavior and
  rendered context as `brain_think` without creating a model-issued tool call/result sequence.
- The plugin does not reframe Brain output as a competing request, prior/lower-priority background,
  or a Codex-specific memory format. It injects the unchanged B4 context; the linked v3 owners define
  how latest user input, applicable cognition, and evidence form current understanding.

## Implementation boundary

- Brain exports the MCP server and its existing `brain_think` implementation.
- Brain exposes a generic per-invocation resolver option that supplies project services and trusted
  session identity together; it does not implement Codex binding policy.
- The plugin bundles the Brain MCP server and one restoration hook. The hook owns Codex lifecycle
  triggering, automatic restoration, and the `session_id`/`cwd` binding, while the plugin MCP entry
  owns Codex metadata extraction and invocation resolution for the remaining tools.
- Brain remains the owner of restore behavior, rendering, and all other tool semantics.
