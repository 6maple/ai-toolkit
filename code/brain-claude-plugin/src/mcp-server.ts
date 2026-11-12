import { runBrainMcpServer } from "../../brain/src/index.ts";
import { realpath } from "node:fs/promises";

async function main(): Promise<void> {
  const configuredRoot = process.env.CLAUDE_PROJECT_DIR;
  if (typeof configuredRoot !== "string" || configuredRoot.length === 0) {
    throw new Error("CLAUDE_PROJECT_DIR is unavailable");
  }
  const sourceRoot = await realpath(configuredRoot);
  process.chdir(sourceRoot);
  await runBrainMcpServer({
    exclude: ["brain_think"],
    restoreMode: "host",
  });
}

main().catch((error) => {
  console.error("brain Claude MCP fatal", error);
  process.exit(1);
});
