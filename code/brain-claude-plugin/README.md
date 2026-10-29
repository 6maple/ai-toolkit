# Brain Claude Code plugin

Claude Code adapter for `../brain`. Brain owns cognition and tool behavior. This plugin provides the Brain processing entry before every user prompt and exposes Brain's remaining tools through MCP.

## Behavior

- `UserPromptSubmit` runs the same restoration path as `brain_think` and injects the resulting context before Claude handles the prompt.
- The hook and MCP server use Claude Code's `CLAUDE_PROJECT_DIR` as the source root. Claude's session ID remains host state and does not enter Brain cognition.
- The MCP server hides `brain_think`. With Semantic Search disabled it exposes eleven Brain tools, including `brain_step`; enabling Semantic Search in `~/.brain-data/config.json` adds `brain_ask_search` after restarting Claude Code.
- Brain reads are automatically allowed. Brain mutations are automatically allowed in normal edit modes only after the current prompt's restoration completed with a Git history checkpoint. If the checkpoint degrades, Claude handles the permission request normally. Explicit read-only modes stay in control.
- The permission hook records its state in `CLAUDE_PLUGIN_DATA` and checks the current session and transcript before allowing a mutation.

Flow and memory requirements are loaded on demand from dedicated `@brain-virtual/` paths with `brain_cat`, returned in full. The deep flow points to the actual workflow file; the default is the full brain-ai workflow.

## Local development

This first version loads from this checkout and imports the adjacent Brain package source. Run the Brain stub once, then install and generate this plugin:

```powershell
cd D:\Workspace\ai-projects\ai-toolkit\code\brain
pnpm install
pnpm run stub

cd ..\brain-claude-plugin
pnpm install
pnpm run stub
pnpm test
claude plugin validate . --strict
```

`pnpm run stub` regenerates `dist/`, `.claude-plugin/plugin.json`, `.mcp.json`, and `hooks/hooks.json`. Edit `plugin.config.mjs`, `package.json`, or `src/` and rerun `stub` after changes. The marketplace file stays static.

Add the checkout as a local Claude Code marketplace and install the plugin:

```powershell
claude plugin marketplace add D:\Workspace\ai-projects\ai-toolkit\code\brain-claude-plugin
claude plugin install brain-claude-plugin@ai-toolkit-local
```

Start a new Claude Code session, then inspect `/hooks` and `/mcp`. Claude Code may request trust for the plugin MCP server. To pick up local edits in an existing session, run `/reload-plugins`.

## Distribution boundary

The local marketplace loads this plugin in place. The current source import from `../brain` depends on this checkout layout. A copied or remote marketplace release must package Brain inside the plugin or depend on a published Brain package before distribution.
