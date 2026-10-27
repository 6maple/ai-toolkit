import { createProductionBrainServices, runBrainMcpServer } from "../../brain/src/index.ts";
import { readClaudeInvocationState } from "./invocation-state.ts";
import { realpath } from "node:fs/promises";

async function main(): Promise<void> {
  const configuredRoot = process.env.CLAUDE_PROJECT_DIR;
  if (typeof configuredRoot !== "string" || configuredRoot.length === 0) {
    throw new Error("CLAUDE_PROJECT_DIR is unavailable");
  }
  const sourceRoot = await realpath(configuredRoot);
  process.chdir(sourceRoot);
  const services = await createProductionBrainServices(sourceRoot);
  await runBrainMcpServer({
    async resolveInvocation(extra) {
      const meta = typeof extra === "object" && extra !== null && "_meta" in extra
        && typeof extra._meta === "object" && extra._meta !== null
        ? extra._meta as Record<string, unknown> : {};
      const sessionId = typeof meta.threadId === "string" ? meta.threadId : process.env.CLAUDE_CODE_SESSION_ID;
      if (!sessionId) return { services };
      try {
        const binding = await readClaudeInvocationState(sessionId);
        if (!binding.turnId || binding.sourceRoot !== sourceRoot) return { services };
        return { services, stepHost: {
          conversationId: binding.sessionId,
          turnId: binding.turnId,
          sourceRoot: binding.sourceRoot,
        } };
      } catch {
        // A missing turn binding disables only brain_step, not cognition tools.
        return { services };
      }
    },
    exclude: ["brain_think"],
    restoreMode: "host",
  });
}

main().catch((error) => {
  console.error("brain Claude MCP fatal", error);
  process.exit(1);
});
