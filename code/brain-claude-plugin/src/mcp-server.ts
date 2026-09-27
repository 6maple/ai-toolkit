import { runBrainMcpServer } from "../../brain/src/index.ts";

async function main(): Promise<void> {
  const sourceRoot = process.env.CLAUDE_PROJECT_DIR;
  if (typeof sourceRoot !== "string" || sourceRoot.length === 0) {
    throw new Error("CLAUDE_PROJECT_DIR is unavailable");
  }
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
