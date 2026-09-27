import { restoreProductionBrainContext } from "../../brain/src/index.ts";
import { brainRestoreFailureDiagnostic } from "../../brain/src/integration/server-instructions.ts";

import { writeCodexInvocationBinding } from "./invocation-binding.ts";

interface UserPromptSubmitInput {
  readonly hook_event_name: "UserPromptSubmit";
  readonly session_id: string;
  readonly cwd: string;
  readonly turn_id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInput(value: unknown): UserPromptSubmitInput {
  if (!isRecord(value)) throw new Error("hook input must be an object");
  if (value.hook_event_name !== "UserPromptSubmit") {
    throw new Error("hook_event_name must be UserPromptSubmit");
  }
  if (typeof value.session_id !== "string" || value.session_id.length === 0) {
    throw new Error("session_id must be a non-empty string");
  }
  if (typeof value.cwd !== "string" || value.cwd.length === 0) {
    throw new Error("cwd must be a non-empty string");
  }
  if (value.turn_id !== undefined && typeof value.turn_id !== "string") {
    throw new Error("turn_id must be a string when provided");
  }
  return {
    hook_event_name: value.hook_event_name,
    session_id: value.session_id,
    cwd: value.cwd,
    ...(typeof value.turn_id === "string" ? { turn_id: value.turn_id } : {}),
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const input = parseInput(JSON.parse(await readStdin()) as unknown);
  const result = await restoreProductionBrainContext({
    sourceRoot: input.cwd,
  });
  const historyCheckpointReady = !result.diagnostics.some(
    (diagnostic) => diagnostic.kind === "history-checkpoint-degraded",
  );
  await writeCodexInvocationBinding({
    sessionId: input.session_id,
    sourceRoot: input.cwd,
    ...(input.turn_id === undefined ? {} : { turnId: input.turn_id }),
    historyCheckpointReady,
  });
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
