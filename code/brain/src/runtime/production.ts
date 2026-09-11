import { homedir } from "node:os";
import { join } from "node:path";

import type { AnchorResult } from "../application/anchor-restore.ts";
import { parseSessionId } from "../brain/namespace.ts";
import type { BrainApplicationServices } from "../integration/mcp-adapter.ts";
import { resolveOrCreateProject } from "../persistence/project-mapping.ts";
import { createBrainApplicationServices } from "./application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "./bootstrap.ts";

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
