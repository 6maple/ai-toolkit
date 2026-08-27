import { restoreProductionBrainContext } from "../../brain/src/index.ts";

interface UserPromptSubmitInput {
  readonly hook_event_name: "UserPromptSubmit";
  readonly session_id: string;
  readonly cwd: string;
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
  return {
    hook_event_name: value.hook_event_name,
    session_id: value.session_id,
    cwd: value.cwd,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function wrapContext(context: string): string {
  const inner = context.endsWith("\n") ? context : `${context}\n`;
  return [
    '<brain_context source="brain" delivery="codex-user-prompt-submit" authority="remembered-context">',
    inner,
    "</brain_context>\n",
  ].join("\n");
}

async function main(): Promise<void> {
  const input = parseInput(JSON.parse(await readStdin()));
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
        additionalContext: wrapContext(result.context),
      },
    })}\n`,
  );
}

main().catch((error) => {
  console.error(`brain restore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
