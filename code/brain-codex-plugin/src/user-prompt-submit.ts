import { restoreProductionBrainContext } from "../../brain/src/index.ts";

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

const brainThinkInstructions = [
  "<brain_think_instructions>",
  "The user explicitly requires the following `<brain_think_context>` to be used as current context for this turn.",
  "The latest user message defines the request. Treat every relevant `<core>` and `<recalled_cognition>` item as already established working cognition, not as background, a search lead, or material that must first be reconstructed from project files.",
  "You must let every relevant item materially determine your interpretation, tool choices, actions, and final answer according to its stated cognitive role. Use a `<recalled_cognition>` item's `summary` directly when it is sufficient; use `brain_cat` when its details are needed.",
  "Other evidence may add facts or update the cognition it directly addresses. It must not replace, downgrade, or cause you to omit a relevant decision, intention, preference, constraint, or commitment merely because files, commits, timestamps, or other sources are newer or silent.",
  "Before completing the turn, ensure that your actions and answer reflect every relevant item.",
  "</brain_think_instructions>",
  "",
].join("\n");

async function main(): Promise<void> {
  const input = parseInput(JSON.parse(await readStdin()) as unknown);
  await writeCodexInvocationBinding({
    sessionId: input.session_id,
    sourceRoot: input.cwd,
    ...(input.turn_id === undefined ? {} : { turnId: input.turn_id }),
  });
  const result = await restoreProductionBrainContext({
    sourceRoot: input.cwd,
    sessionId: input.session_id,
  });
  for (const diagnostic of result.diagnostics) {
    console.error(`brain restore diagnostic: ${diagnostic.message}`);
  }
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: `${brainThinkInstructions}${result.context}`,
      },
    })}\n`,
  );
}

main().catch((error) => {
  console.error(`brain restore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
