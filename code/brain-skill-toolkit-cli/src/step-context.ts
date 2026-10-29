import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BrainStepHost } from "../../brain/step/index.mjs";
import { CliError } from "./errors.ts";

export function cliSessionId(explicit?: string): string {
  const value =
    explicit ??
    process.env.BRAIN_SESSION_ID ??
    (process.env.CODEX_THREAD_ID ? `codex:${process.env.CODEX_THREAD_ID}` : undefined) ??
    (process.env.CLAUDE_CODE_SESSION_ID
      ? `claude:${process.env.CLAUDE_CODE_SESSION_ID}`
      : undefined);
  if (!value?.trim())
    throw new CliError(
      "session-context-unavailable",
      "A real host conversation ID is required for think/step. Supply --session or BRAIN_SESSION_ID; Codex CODEX_THREAD_ID and Claude CLAUDE_CODE_SESSION_ID are also supported. Do not invent an ID or use the project path.",
    );
  return value;
}

// The host supplies the conversation. A successful explicit think creates the
// CLI turn; subsequent short-lived step processes resolve it without model IDs.
export async function createCliStepContext(
  brainRoot: string,
  sourceRoot: string,
  sessionId: string,
) {
  // Resolve only after creation, so a new root under a directory link has the
  // same identity on its first and subsequent command processes.
  await fs.mkdir(brainRoot, { recursive: true });
  const canonicalBrainRoot = await fs.realpath(brainRoot);
  const conversationId = JSON.stringify(["brain-skill", canonicalBrainRoot, sessionId]);
  const key = createHash("sha256")
    .update(JSON.stringify([sourceRoot, conversationId]))
    .digest("hex");
  const file = path.join(canonicalBrainRoot, ".runtime", "skill-invocations", `${key}.json`);
  return {
    async clear(): Promise<void> {
      await fs.rm(file, { force: true });
    },
    async begin(): Promise<void> {
      const host: BrainStepHost = { conversationId, sourceRoot, turnId: randomUUID() };
      const temporary = `${file}.${randomUUID()}.tmp`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        await fs.writeFile(temporary, JSON.stringify(host) + "\n", { flag: "wx", mode: 0o600 });
        await fs.rename(temporary, file);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    },
    async current(): Promise<BrainStepHost> {
      try {
        const host = JSON.parse(await fs.readFile(file, "utf8"));
        if (
          host?.conversationId !== conversationId ||
          host?.sourceRoot !== sourceRoot ||
          typeof host?.turnId !== "string" ||
          !host.turnId.trim()
        )
          throw new Error("Invalid stored CLI turn binding.");
        return { conversationId, sourceRoot, turnId: host.turnId };
      } catch (error) {
        throw new CliError(
          "step-context-unavailable",
          `No usable CLI turn is bound to this conversation/project/data root. Run think once for the current user message with the same session and roots, then follow its guidance. State was not modified. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
