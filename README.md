# ai-toolkit

中文文档：[README.zh-CN.md](README.zh-CN.md).

Tools, skills, and host plugins for AI agents. The main component is **Brain**, which provides persistent Global and Project memory, discovery and maintenance commands, and guidance for continuing work across conversations.

## Brain setup

### Host plugin / MCP

Integrate Brain with Codex, Claude Code, or DSH to restore context at user-message boundaries and expose memory tools. From the repository root:

```sh
pnpm --dir code/brain install
pnpm --dir code/brain stub
pnpm --dir code/brain-cli install
node code/brain-cli/index.mjs install --agent codex --source local --path .
```

Use `--agent claude` for Claude Code, or `--agent dsh --profile <name>` for DSH. Follow the install result to restart the host and complete trust or enablement steps. Prerequisites and update commands are in the [installer README](code/brain-cli/README.md).

### CLI + skill

Explicitly select the [brain skill](skills/brain/SKILL.md) for a task, or use individual memory commands through `brain-skill`. Prepare the local command from the repository root:

```sh
pnpm --dir code/brain install
pnpm --dir code/brain-skill-toolkit-cli install
pnpm --dir code/brain-skill-toolkit-cli stub
node code/brain-skill-toolkit-cli/dist/brain-skill.mjs --help
```

Follow the [CLI README](code/brain-skill-toolkit-cli/README.md) to link `brain-skill`, then the [project setup guide](code/brain-skill-toolkit-cli/INSTALL.md) to install the skill. Copying the skill alone does not install the CLI. Full `think` / `step` workflows require a real host conversation ID; individual memory commands can run separately. See the [command reference](skills/brain/references/commands.md).

Brain data defaults to `~/.brain-data`. Configuration, memory semantics, and optional semantic search are documented in the [runtime README](code/brain/README.md).

## Components

| Path | Purpose |
| --- | --- |
| [code/brain](code/brain/README.md) | Brain runtime, MCP tools, memory, and thinking workflow. |
| [code/brain-cli](code/brain-cli/README.md) | Host installation, updates, memory migration, and optional dependencies. |
| [code/brain-skill-toolkit-cli](code/brain-skill-toolkit-cli/README.md) | The brain-skill command and setup guide. |
| [code/brain-codex-plugin](code/brain-codex-plugin/README.md) | Brain integration for Codex. |
| [code/brain-claude-plugin](code/brain-claude-plugin/README.md) | Brain integration for Claude Code. |
| [code/brain-dsh-plugin](code/brain-dsh-plugin/README.md) | Brain integration for DSH. |
| [code/brain-web](code/brain-web/README.md) | Local browser for Brain data. |
| [code/custom-dsh-plugin](code/custom-dsh-plugin/README.md) | DSH approval review plugin. |
| [code/router-creator](code/router-creator/README.md) | DSH creator-mode agent preset and supporting tools. |

## Documentation and development

- [Documentation index](doc/README.md) and [Brain design history](doc/brain/README.md).
- [AI-readable entry](llm.txt).
- [Project collaboration and change process](AGENTS.md); Claude reads the same rules through [CLAUDE.md](CLAUDE.md).
- Each component documents its dependencies and checks in its README and package scripts.
- [License](LICENSE).
