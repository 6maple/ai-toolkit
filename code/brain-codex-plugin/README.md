# Brain Codex plugin

Codex host adapter for `../brain`.

- `UserPromptSubmit` executes Brain restore code directly and adds the unchanged
  `<brain_think_context>` inside a `<brain_context>` envelope as developer context.
- The bundled MCP server exposes the remaining ten Brain tools and omits
  `brain_think`, preventing duplicate model-triggered restoration.
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
hooks. Open `/hooks`, review the `UserPromptSubmit` command contributed by
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
leaving `cwd` unset. Codex therefore starts it from the active task directory,
which Brain uses as the project root.

Both the MCP server and hook execute the checkout's absolute stub paths during
development. If the checkout moves, update `.mcp.json` and `hooks/hooks.json`,
then regenerate the stubs.

The production distribution model is intentionally not represented by this
development build. It will use installed global commands rather than shipping
these source-backed stubs.
