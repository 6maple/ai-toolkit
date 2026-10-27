import type { AnchorResult } from "../application/anchor-restore.ts";
import type { BrainApplicationServices } from "../integration/mcp-adapter.ts";
import { resolveOrCreateProject } from "../persistence/project-mapping.ts";
import { createBrainApplicationServices, type BrainSemanticRuntime } from "./application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "./bootstrap.ts";
import type { BrainRuntimeFeatures } from "./features.ts";
import { DEFAULT_BRAIN_HOME, loadBrainGlobalConfig } from "./global-config.ts";
import { SemanticIndex } from "./semantic-index.ts";
import { assertSemanticRuntimeReady, PythonEmbeddingRuntime } from "./semantic-runtime.ts";

const semanticRuntimeByRoot = new Map<string, Promise<BrainSemanticRuntime | undefined>>();

const SEMANTIC_DEBUG = process.env.BRAIN_SEMANTIC_DEBUG === "1";
function semanticDebug(event: string, detail: Record<string, unknown> = {}): void {
  if (!SEMANTIC_DEBUG) return;
  console.error("brain semantic debug " + JSON.stringify({ event, pid: process.pid, ...detail }));
}

export interface ProductionBrainRestoreRequest {
  readonly sourceRoot: string;
  readonly brainRoot?: string;
}

export interface CreateBrainServicesOptions {
  readonly features?: BrainRuntimeFeatures;
  readonly initializeSemantic?: boolean;
}

async function semanticRuntimeFor(
  brainRoot: string,
  binding: Awaited<ReturnType<typeof bootstrapBrainRuntimeInfrastructure>>["binding"],
): Promise<BrainSemanticRuntime | undefined> {
  const existing = semanticRuntimeByRoot.get(brainRoot);
  if (existing !== undefined) {
    semanticDebug("runtime.cache-hit", { brainRoot });
    return existing;
  }

  const created = (async (): Promise<BrainSemanticRuntime | undefined> => {
    const startedAt = Date.now();
    let embeddings: PythonEmbeddingRuntime | undefined;
    let index: SemanticIndex | undefined;
    try {
      semanticDebug("runtime.initialize.start", { brainRoot, projectId: binding.projectId });
      assertSemanticRuntimeReady(brainRoot);
      semanticDebug("runtime.manifest.ready", { elapsedMs: Date.now() - startedAt });
      embeddings = new PythonEmbeddingRuntime(brainRoot);
      index = new SemanticIndex(brainRoot, binding, embeddings);
      await index.initialize();
      semanticDebug("runtime.initialize.end", { elapsedMs: Date.now() - startedAt });
      return { index, embeddings };
    } catch (error) {
      semanticDebug("runtime.initialize.error", {
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      index?.close();
      embeddings?.dispose();
      console.error(
        "brain semantic search unavailable:",
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  })();
  semanticRuntimeByRoot.set(brainRoot, created);
  return created;
}

export async function createBrainServicesForRoot(
  brainRoot: string,
  sourceRoot: string,
  options: CreateBrainServicesOptions = {},
): Promise<BrainApplicationServices> {
  let features = options.features;
  if (features === undefined) {
    const config = loadBrainGlobalConfig(brainRoot);
    for (const diagnostic of config.diagnostics) {
      console.error("brain config diagnostic:", diagnostic.message);
    }
    features = config.features;
  }
  const project = await resolveOrCreateProject({ brainRoot, sourceRoot });
  const infrastructure = await bootstrapBrainRuntimeInfrastructure({
    brainRoot,
    projectId: project.projectId,
  });
  if (infrastructure.historyPreparation.kind !== "available") {
    console.error(
      "brain history unavailable: " + infrastructure.historyPreparation.diagnostic.code,
    );
  }

  const semanticRuntime =
    features.semanticSearch && options.initializeSemantic !== false
      ? await semanticRuntimeFor(brainRoot, infrastructure.binding)
      : undefined;

  return createBrainApplicationServices(infrastructure, {
    sourceRoot,
    features,
    ...(semanticRuntime === undefined ? {} : { semanticRuntime }),
  });
}

export async function createProductionBrainServices(
  sourceRoot: string = process.cwd(),
  options: CreateBrainServicesOptions = {},
): Promise<BrainApplicationServices> {
  return createBrainServicesForRoot(DEFAULT_BRAIN_HOME, sourceRoot, options);
}

/**
 * Programmatic host entry for lifecycle adapters that own automatic restoration.
 * It preserves the same application behavior and rendered context as brain_think
 * without requiring the operation to be model-visible.
 */
export async function restoreProductionBrainContext(
  request: ProductionBrainRestoreRequest,
): Promise<AnchorResult> {
  const services = await createBrainServicesForRoot(
    request.brainRoot ?? DEFAULT_BRAIN_HOME,
    request.sourceRoot,
    {
      initializeSemantic: false,
    },
  );
  return services.routed === undefined ? services.anchor.runAnchor({}) : services.routed.think();
}
