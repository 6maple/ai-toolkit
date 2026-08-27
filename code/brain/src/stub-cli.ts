#!/usr/bin/env node
import { runBrainMcpServer } from "./index.ts";

runBrainMcpServer().catch((error) => {
  console.error("brain fatal", error);
  process.exit(1);
});
