import { removeClaudeInvocationState } from "./invocation-state.ts";

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof input !== "object" || input === null || !("session_id" in input)
    || typeof input.session_id !== "string" || !("hook_event_name" in input)
    || input.hook_event_name !== "SessionEnd") throw new Error("Claude SessionEnd input is invalid");
  // A reused MCP process must not keep using the ended session's turn binding.
  await removeClaudeInvocationState(input.session_id);
}

main().catch(error => {
  console.error(`brain session cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
