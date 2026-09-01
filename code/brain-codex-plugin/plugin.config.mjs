export const pluginConfig = {
  manifest: {
    interface: {
      displayName: "Brain",
      shortDescription: "Restore persistent cognition before every Codex turn.",
      longDescription:
        "Brain requires Codex to restore global, project, and session cognition at the start of every user turn and exposes the complete memory toolset.",
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
  marketplace: {
    manifest: ".agents/plugins/marketplace.json",
    name: "ai-toolkit-local",
    sourcePath: ".",
  },
};
