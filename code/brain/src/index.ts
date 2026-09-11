#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerBrainTools,
  type BrainApplicationServices,
  type BrainToolInvocation,
  type BrainToolInvocationResolver,
  type BrainToolRegistrationOptions,
} from "./integration/mcp-adapter.ts";
import { createProductionBrainServices } from "./runtime/production.ts";

export { registerBrainTools };
export {
  createProductionBrainServices,
  restoreProductionBrainContext,
  type ProductionBrainRestoreRequest,
} from "./runtime/production.ts";
export type {
  BrainApplicationServices,
  BrainToolInvocation,
  BrainToolInvocationResolver,
  BrainToolRegistrationOptions,
};

export async function runBrainMcpServer(options: BrainToolRegistrationOptions = {}): Promise<void> {
  const services =
    options.resolveInvocation === undefined ? await createProductionBrainServices() : undefined;
  const server = new McpServer({ name: "brain", version: "0.2.0" });
  registerBrainTools(server, services, undefined, options);
  await server.connect(new StdioServerTransport());
  console.error(
    services === undefined
      ? "brain ready: invocation-scoped project binding"
      : `brain ready: project=${services.binding.projectId}`,
  );
}

const invokedAsCli =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsCli) {
  runBrainMcpServer().catch((error) => {
    console.error("brain fatal", error);
    process.exit(1);
  });
}
