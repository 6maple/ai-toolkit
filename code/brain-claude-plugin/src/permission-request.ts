import { readClaudeInvocationState } from "./invocation-state.ts";

const PREFIX = "mcp__plugin_brain-claude-plugin_brain__";
const READ_TOOLS = new Set([
  "brain_absolute_path", "brain_ls", "brain_glob", "brain_grep", "brain_ask_search", "brain_cat",
].map((name) => `${PREFIX}${name}`));
const MUTATION_TOOLS = new Set([
  "brain_write", "brain_edit", "brain_rm", "brain_mv", "brain_feedback",
].map((name) => `${PREFIX}${name}`));

interface PermissionRequestInput {
  readonly session_id: string;
  readonly transcript_path: string;
  readonly permission_mode: string;
  readonly tool_name: string;
}

function parseInput(value: unknown): PermissionRequestInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (input.hook_event_name !== "PermissionRequest") return undefined;
  if (typeof input.tool_name !== "string") return undefined;
  if (!READ_TOOLS.has(input.tool_name) && !MUTATION_TOOLS.has(input.tool_name)) return undefined;
  if (
    typeof input.session_id !== "string" || input.session_id.length === 0 ||
    typeof input.transcript_path !== "string" || input.transcript_path.length === 0 ||
    typeof input.permission_mode !== "string"
  ) return undefined;
  return {
    session_id: input.session_id,
    transcript_path: input.transcript_path,
    permission_mode: input.permission_mode,
    tool_name: input.tool_name,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function allow(): void {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    })}\n`,
  );
}

async function main(): Promise<void> {
  let input: PermissionRequestInput | undefined;
  try {
    input = parseInput(JSON.parse(await readStdin()) as unknown);
  } catch {
    return;
  }
  if (input === undefined) return;

  if (READ_TOOLS.has(input.tool_name)) {
    allow();
    return;
  }
  if (input.permission_mode !== "default" && input.permission_mode !== "manual" && input.permission_mode !== "acceptEdits") {
    return;
  }
  try {
    const state = await readClaudeInvocationState(input.session_id);
    if (state.transcriptPath !== input.transcript_path || !state.historyCheckpointReady) return;
    if (process.env.CLAUDE_PROJECT_DIR !== state.sourceRoot) {
      // realpath normalization is handled below for Windows path spelling.
      const { realpath } = await import("node:fs/promises");
      if (await realpath(process.env.CLAUDE_PROJECT_DIR ?? "") !== state.sourceRoot) return;
    }
    allow();
  } catch {
    // Missing or degraded turn state leaves Claude's permission flow in control.
  }
}

void main();
