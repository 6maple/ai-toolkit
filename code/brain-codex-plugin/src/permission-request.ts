import { readCodexInvocationBinding } from "./invocation-binding.ts";

const READ_TOOLS = new Set([
  "mcp__brain__brain_absolute_path",
  "mcp__brain__brain_ls",
  "mcp__brain__brain_glob",
  "mcp__brain__brain_grep",
  "mcp__brain__brain_cat",
]);

const MUTATION_TOOLS = new Set([
  "mcp__brain__brain_write",
  "mcp__brain__brain_edit",
  "mcp__brain__brain_rm",
  "mcp__brain__brain_mv",
  "mcp__brain__brain_feedback",
]);

interface PermissionRequestInput {
  readonly hook_event_name: "PermissionRequest";
  readonly session_id: string;
  readonly turn_id: string;
  readonly permission_mode: string;
  readonly tool_name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInput(value: unknown): PermissionRequestInput | undefined {
  if (!isRecord(value)) return undefined;
  if (value.hook_event_name !== "PermissionRequest") return undefined;
  if (typeof value.tool_name !== "string") return undefined;
  if (!READ_TOOLS.has(value.tool_name) && !MUTATION_TOOLS.has(value.tool_name)) return undefined;
  if (typeof value.session_id !== "string" || value.session_id.length === 0) return undefined;
  if (typeof value.turn_id !== "string" || value.turn_id.length === 0) return undefined;
  if (typeof value.permission_mode !== "string") return undefined;
  return {
    hook_event_name: value.hook_event_name,
    session_id: value.session_id,
    turn_id: value.turn_id,
    permission_mode: value.permission_mode,
    tool_name: value.tool_name,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
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

async function shouldAutoAllowMutation(input: PermissionRequestInput): Promise<boolean> {
  // Respect an explicit no-edit host mode. In normal edit-capable modes, Git recovery is the
  // reason Brain mutations may proceed without interrupting the user for each operation.
  if (input.permission_mode !== "default" && input.permission_mode !== "acceptEdits") return false;

  const invocation = await readCodexInvocationBinding(input.session_id);
  if (invocation.turnId !== input.turn_id) return false;
  return invocation.historyCheckpointReady;
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

  try {
    if (await shouldAutoAllowMutation(input)) allow();
  } catch {
    // No current-turn recovery guarantee: leave the request to Codex's normal approval flow.
  }
}

void main();
