export const pluginConfig = {
  manifest: {
    interface: {
      displayName: "Brain",
      shortDescription: "Restore persistent cognition before every Codex turn.",
      longDescription:
        "Brain restores Global and Project cognition at the start of every user turn and exposes the complete cognition toolset.",
      developerName: "Maple",
      category: "Productivity",
      capabilities: ["Read", "Write"],
      defaultPrompt: ["Show me what Brain remembers about this project."],
    },
  },
  entries: {
    hook: {
      input: "src/user-prompt-submit.ts",
      name: "user-prompt-submit",
    },
    permissionHook: {
      input: "src/permission-request.ts",
      name: "permission-request",
    },
    mcp: {
      input: "src/mcp-server.ts",
      name: "mcp-server",
      serverName: "brain",
    },
  },
  hook: {
    description: "Restore Brain context before every user prompt.",
    timeout: 10,
    statusMessage: "Preparing Brain context",
    additionalContextLimit: 0,
  },
  mcp: {
    omitToolsFrom: ["deferred"],
  },
  permissionHook: {
    matcher: "^mcp__brain__brain_(absolute_path|ls|glob|grep|ask_search|cat|write|edit|rm|mv|feedback|step)$",
    timeout: 10,
    statusMessage: "Checking Brain permission",
  },
  marketplace: {
    manifest: ".agents/plugins/marketplace.json",
    name: "ai-toolkit-local",
    sourcePath: ".",
  },
};
