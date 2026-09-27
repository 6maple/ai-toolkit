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
import {
  BRAIN_MCP_RESTORE_MODE_ENV,
  brainMcpServerInstructions,
  resolveBrainMcpRestoreMode,
  type BrainMcpRestoreMode,
} from "./integration/server-instructions.ts";
import { createProductionBrainServices } from "./runtime/production.ts";
import { loadBrainGlobalConfig } from "./runtime/global-config.ts";

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
export {
  BRAIN_EXPLICIT_RESTORE_INSTRUCTIONS,
  BRAIN_MCP_RESTORE_MODE_ENV,
  brainMcpServerInstructions,
  resolveBrainMcpRestoreMode,
  type BrainMcpRestoreMode,
} from "./integration/server-instructions.ts";

export interface BrainMcpServerOptions extends BrainToolRegistrationOptions {
  readonly restoreMode?: BrainMcpRestoreMode;
}

export async function runBrainMcpServer(options: BrainMcpServerOptions = {}): Promise<void> {
  const config = loadBrainGlobalConfig();
  for (const diagnostic of config.diagnostics) {
    console.error("brain config diagnostic:", diagnostic.message);
  }
  const features = options.features ?? config.features;
  const restoreMode =
    options.restoreMode ?? resolveBrainMcpRestoreMode(process.env[BRAIN_MCP_RESTORE_MODE_ENV]);
  const { restoreMode: _restoreMode, ...toolOptions } = options;
  const registrationOptions = { ...toolOptions, features };
  const services =
    options.resolveInvocation === undefined
      ? await createProductionBrainServices(process.cwd(), { features })
      : undefined;
  const instructions = brainMcpServerInstructions(restoreMode);
  const server = new McpServer(
    { name: "brain", version: "0.2.0" },
    instructions === undefined ? {} : { instructions },
  );
  registerBrainTools(server, services, registrationOptions);
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
