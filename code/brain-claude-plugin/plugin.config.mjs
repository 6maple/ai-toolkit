export const pluginConfig = {
  entries: {
    hook: { input: "src/user-prompt-submit.ts", name: "user-prompt-submit" },
    permissionHook: { input: "src/permission-request.ts", name: "permission-request" },
    mcp: { input: "src/mcp-server.ts", name: "mcp-server", serverName: "brain" },
  },
  hook: {
    description: "Restore Brain context before every user prompt.",
    timeout: 10,
  },
  permissionHook: {
    matcher: "^mcp__plugin_brain-claude-plugin_brain__brain_(absolute_path|ls|glob|grep|ask_search|cat|write|edit|rm|mv|feedback)$",
    timeout: 10,
  },
  marketplace: {
    name: "ai-toolkit-local",
    manifest: ".claude-plugin/marketplace.json",
    sourcePath: ".",
  },
};
