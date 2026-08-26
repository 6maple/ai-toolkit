#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { registerBrainTools, type BrainApplicationServices } from "./integration/mcp-adapter.ts";
import { createBrainApplicationServices } from "./runtime/application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "./runtime/bootstrap.ts";

export { registerBrainTools };
export type { BrainApplicationServices };

export async function createProductionBrainServices(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrainApplicationServices> {
  const projectRoot = env.BRAIN_PROJECT_ROOT?.trim() || process.cwd();
  const brainHome = env.BRAIN_HOME?.trim();
  const infrastructure = await bootstrapBrainRuntimeInfrastructure({
    projectRoot,
    ...(brainHome === undefined || brainHome === "" ? {} : { brainRoot: brainHome }),
  });
  if (infrastructure.historyPreparation.kind !== "available") {
    console.error(
      `brain history unavailable: ${infrastructure.historyPreparation.diagnostic.code}`,
    );
  }
  return createBrainApplicationServices(infrastructure);
}

async function main(): Promise<void> {
  const services = await createProductionBrainServices();
  const server = new McpServer({ name: "brain", version: "0.2.0" });
  registerBrainTools(server, services);
  await server.connect(new StdioServerTransport());
  console.error(`brain ready: project=${services.binding.projectRoot}`);
}

const invokedAsCli =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsCli) {
  main().catch((error) => {
    console.error("brain fatal", error);
    process.exit(1);
  });
}
