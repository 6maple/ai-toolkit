# Brain Codex plugin

## Requirement and public contract

- **R1 — Automatic restore:** every `UserPromptSubmit` restores the current global, project, and
  session cognition before the model starts substantive reasoning.
- **R2 — One owner:** Brain remains the only owner of cognition selection, persistence, rendering,
  and learning semantics. The plugin is a Codex host adapter.
- **R3 — No duplicate restore tool:** when automatic restore is enabled, `brain_think` is not part
  of the model-visible MCP tool list. The remaining Brain discovery and maintenance tools remain
  available.
- **R4 — Non-blocking failure:** a restore failure is reported through hook diagnostics and must not
  turn the user prompt into a policy block.

The hook injects one developer-context value with this outer contract while preserving Brain's
existing inner XML byte-for-byte:

```xml
<brain_context source="brain" delivery="codex-user-prompt-submit" authority="remembered-context">
  <brain_think_context>...</brain_think_context>
</brain_context>
```

## Acceptance examples

1. Given a Codex `UserPromptSubmit` event with a task `cwd` and `session_id`, when the hook runs,
   then it invokes Brain application code directly for that project/session and returns the wrapped
   context through `hookSpecificOutput.additionalContext`.
2. Given the plugin MCP server, when Codex lists tools, then it sees the ten discovery/maintenance
   tools and does not see `brain_think`.
3. Given Brain cannot restore context, when the hook runs, then it exits as a failed hook rather than
   returning a blocking decision.

## Design evidence and alignment

- Codex plugin hooks are discovered from `hooks/hooks.json`; plugin commands receive `PLUGIN_ROOT`.
- `UserPromptSubmit` command hooks receive `session_id` and `cwd` on stdin, and their
  `additionalContext` becomes developer context.
- Unlike an `mcp_tool` hook, the command adapter can call Brain's application layer directly and
  wrap its result without keeping `brain_think` model-visible.
- The existing DSH adapter is the same responsibility precedent: automatic restore owns triggering
  and hides the manual restore tool to prevent duplicate invocation.

## Implementation boundary

- Brain exports a typed programmatic restore entry and configurable MCP registration.
- The plugin bundles two runtime programs: the `UserPromptSubmit` adapter and a filtered MCP server.
- The hook owns only Codex event parsing, outer wrapping, and hook-result serialization.
- The MCP adapter owns only Codex-visible tool selection; all tool behavior remains in Brain.
