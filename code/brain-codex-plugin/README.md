# Brain Codex plugin

Codex host adapter for `../brain`.

- `UserPromptSubmit` executes the same restoration path as `brain_think` and adds
  its unchanged result as developer context before Codex handles the user prompt.
- The same synchronous hook records Codex's documented `session_id` and `cwd` as
  one host-owned invocation binding before the restored context reaches the model.
- The bundled MCP server exposes the remaining ten Brain tools and omits
  `brain_think`, preventing duplicate model-triggered restoration.
- Each MCP call resolves project services and trusted session identity from that
  binding, so one long-lived server can safely serve tasks from different projects.
- Brain remains the owner of cognition, persistence, ranking, and tool semantics.

## Development

```powershell
pnpm install
pnpm run stub
pnpm test
```

`plugin.config.mjs` and `package.json` are the maintained plugin sources.
`pnpm run stub` regenerates `dist/`, `.codex-plugin/plugin.json`, `.mcp.json`,
and `hooks/hooks.json` from them, including checkout-specific absolute command
paths and a development cachebuster. The generated plugin manifest explicitly
declares `./hooks/hooks.json` so install surfaces can identify the bundled
lifecycle capability. Do not edit those generated files by hand.

The plugin-level `.agents/plugins/marketplace.json` remains static because it
owns marketplace identity and install policy. Its source path is `.`, so the
marketplace and plugin can move together without configuration changes. The
stub script validates that entry before generating the plugin.

## Manual installation

Generate the stubs, register this plugin as a local marketplace, and
install the plugin:

```powershell
pnpm run stub
codex plugin marketplace add D:\Workspace\ai-projects\ai-toolkit\code\brain-codex-plugin
codex plugin add brain-codex-plugin@ai-toolkit-local
```

Installing or enabling a plugin does not automatically trust its lifecycle
hooks. Open `/hooks`, review the `UserPromptSubmit` command hook contributed by
`brain-codex-plugin@ai-toolkit-local`, and trust its current definition. Codex
stores trust against the definition hash, so a changed hook may require another
review after reinstalling.

Start a new Codex task after trusting the hook. To uninstall the plugin:

```powershell
codex plugin remove brain-codex-plugin@ai-toolkit-local
```

Removing the marketplace itself is optional:

```powershell
codex plugin marketplace remove ai-toolkit-local
```

After changing the plugin, regenerate its cache identity and reinstall:

```powershell
pnpm run stub
codex plugin add brain-codex-plugin@ai-toolkit-local
```

Open `/hooks` again if Codex marks the regenerated definition as changed, then
start another new task.

## Local command paths

This first version is a local development plugin. The legacy Codex
`.codex-plugin` MCP loader does not expand `${PLUGIN_ROOT}` in `.mcp.json`, so
the MCP entry uses this checkout's absolute `dist/mcp-server.mjs` path while
leaving `cwd` unset. The MCP process working directory is deliberately not used
as project identity; `UserPromptSubmit` supplies the current task's binding.

Both the MCP server and restoration hook execute checkout-specific absolute stub
paths during development. If the checkout moves, regenerate `.mcp.json` and
`hooks/hooks.json` with the stub command.

The production distribution model is intentionally not represented by this
development build. It will use installed global commands rather than shipping
these source-backed stubs.
