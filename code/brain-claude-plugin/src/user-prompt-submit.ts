import { restoreProductionBrainContext } from "../../brain/src/index.ts";
import { brainRestoreFailureDiagnostic } from "../../brain/src/integration/server-instructions.ts";
import { writeClaudeInvocationState } from "./invocation-state.ts";

interface UserPromptSubmitInput {
  readonly hook_event_name: "UserPromptSubmit";
  readonly session_id: string;
  readonly transcript_path: string;
}

function parseInput(value: unknown): UserPromptSubmitInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("hook input must be an object");
  }
  const record = value as Record<string, unknown>;
  if (
    record.hook_event_name !== "UserPromptSubmit" ||
    typeof record.session_id !== "string" ||
    record.session_id.length === 0 ||
    typeof record.transcript_path !== "string" ||
    record.transcript_path.length === 0
  ) {
    throw new Error("Claude UserPromptSubmit input is invalid");
  }
  return {
    hook_event_name: "UserPromptSubmit",
    session_id: record.session_id,
    transcript_path: record.transcript_path,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const input = parseInput(JSON.parse(await readStdin()) as unknown);
  const sourceRoot = process.env.CLAUDE_PROJECT_DIR;
  if (typeof sourceRoot !== "string" || sourceRoot.length === 0) {
    throw new Error("CLAUDE_PROJECT_DIR is unavailable");
  }
  const state = {
    sessionId: input.session_id,
    sourceRoot,
    transcriptPath: input.transcript_path,
  };
  // Clear any previous turn's approval before restoration begins.
  await writeClaudeInvocationState({ ...state, historyCheckpointReady: false });
  const result = await restoreProductionBrainContext({ sourceRoot });
  const historyCheckpointReady = !result.diagnostics.some(
    (diagnostic) => diagnostic.kind === "history-checkpoint-degraded",
  );
  await writeClaudeInvocationState({ ...state, historyCheckpointReady });
  for (const diagnostic of result.diagnostics) {
    console.error(`brain restore diagnostic: ${diagnostic.message}`);
  }
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: result.context,
      },
    })}\n`,
  );
}

main().catch((error) => {
  console.error(`brain restore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: brainRestoreFailureDiagnostic(error),
    },
  })}\n`);
});
