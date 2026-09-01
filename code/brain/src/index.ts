#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AnchorResult } from "./application/anchor-restore.ts";
import { parseSessionId } from "./brain/namespace.ts";
import {
  registerBrainTools,
  type BrainApplicationServices,
  type BrainToolInvocation,
  type BrainToolInvocationResolver,
  type BrainToolRegistrationOptions,
} from "./integration/mcp-adapter.ts";
import { resolveOrCreateProject } from "./persistence/project-mapping.ts";
import { createBrainApplicationServices } from "./runtime/application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "./runtime/bootstrap.ts";

export { registerBrainTools };
export type {
  BrainApplicationServices,
  BrainToolInvocation,
  BrainToolInvocationResolver,
  BrainToolRegistrationOptions,
};

const BRAIN_HOME = join(homedir(), ".brain-data");

export interface ProductionBrainRestoreRequest {
  readonly sourceRoot: string;
  readonly sessionId?: string;
}

async function createBrainServices(
  brainRoot: string,
  sourceRoot: string,
): Promise<BrainApplicationServices> {
  const project = await resolveOrCreateProject({ brainRoot, sourceRoot });
  const infrastructure = await bootstrapBrainRuntimeInfrastructure({
    brainRoot,
    projectId: project.projectId,
  });
  if (infrastructure.historyPreparation.kind !== "available") {
    console.error(
      `brain history unavailable: ${infrastructure.historyPreparation.diagnostic.code}`,
    );
  }
  return createBrainApplicationServices(infrastructure);
}

export async function createProductionBrainServices(
  sourceRoot: string = process.cwd(),
): Promise<BrainApplicationServices> {
  return createBrainServices(BRAIN_HOME, sourceRoot);
}

/**
 * Programmatic host entry for lifecycle adapters that own automatic restoration.
 * It preserves the same application behavior and rendered context as brain_think
 * without requiring the operation to be model-visible.
 */
export async function restoreProductionBrainContext(
  request: ProductionBrainRestoreRequest,
): Promise<AnchorResult> {
  const services = await createProductionBrainServices(request.sourceRoot);
  const currentSessionId =
    request.sessionId === undefined ? undefined : parseSessionId(request.sessionId);
  return services.anchor.runAnchor(currentSessionId === undefined ? {} : { currentSessionId });
}

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
