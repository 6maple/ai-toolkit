export const pluginConfig = {
  manifest: {
    interface: {
      displayName: "Brain",
      shortDescription: "Restore persistent cognition before every Codex turn.",
      longDescription:
        "Brain restores global, project, and session cognition before each user prompt and exposes memory discovery and maintenance tools without exposing the automatic restore operation.",
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
    description: "Restore Brain cognition before every user prompt.",
    timeout: 10,
    statusMessage: "Restoring Brain context",
  },
  marketplace: {
    manifest: ".agents/plugins/marketplace.json",
    name: "ai-toolkit-local",
    sourcePath: ".",
  },
};
