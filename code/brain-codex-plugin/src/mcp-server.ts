import { runBrainMcpServer } from "../../brain/src/index.ts";

async function main(): Promise<void> {
  await runBrainMcpServer({ exclude: ["brain_think"] });
}

main().catch((error) => {
  console.error("brain Codex MCP fatal", error);
  process.exit(1);
});
