import { PiDiscoveryTools } from "../adapters/pi-tools.ts";
import { AnchorRestore } from "../application/anchor-restore.ts";
import { CognitionMaintenance } from "../application/cognition-maintenance.ts";
import { ReadDiscovery } from "../application/read-discovery.ts";
import { RoutedBrainApplication } from "../application/routed-brain.ts";
import { SemanticDiscovery } from "../application/semantic-discovery.ts";
import { SemanticAwareMaintenance } from "../application/semantic-maintenance.ts";
import type { BrainRuntimeInfrastructure } from "./bootstrap.ts";
import { DEFAULT_BRAIN_RUNTIME_FEATURES, type BrainRuntimeFeatures } from "./features.ts";
import type { SemanticIndex } from "./semantic-index.ts";
import type { EmbeddingPort } from "./semantic-runtime.ts";
import { loadThinkWorkflow } from "./think-workflow.ts";

export interface BrainSemanticRuntime {
  readonly index: SemanticIndex;
  readonly embeddings: EmbeddingPort;
}

export function createBrainApplicationServices(
  infrastructure: BrainRuntimeInfrastructure,
  options: {
    sourceRoot?: string;
    features?: BrainRuntimeFeatures;
    semanticRuntime?: BrainSemanticRuntime;
  } = {},
) {
  const features = options.features ?? DEFAULT_BRAIN_RUNTIME_FEATURES;
  const anchor = new AnchorRestore(
    infrastructure.store,
    infrastructure.operations,
    infrastructure.checkpoint,
    features,
    () => loadThinkWorkflow(infrastructure.binding.brainRoot),
  );
  const reads = new ReadDiscovery(
    infrastructure.store,
    new PiDiscoveryTools(infrastructure.binding),
    infrastructure.operations,
  );
  const baseMaintenance = new CognitionMaintenance(infrastructure.store, infrastructure.operations);
  const maintenance =
    options.semanticRuntime === undefined
      ? baseMaintenance
      : new SemanticAwareMaintenance(
          baseMaintenance,
          infrastructure.binding,
          options.semanticRuntime.index,
        );
  const semantic =
    options.semanticRuntime === undefined
      ? undefined
      : new SemanticDiscovery(
          infrastructure.binding.projectId,
          options.semanticRuntime.index,
          options.semanticRuntime.embeddings,
        );
  const base = {
    ...(options.sourceRoot === undefined ? {} : { sourceRoot: options.sourceRoot }),
    binding: infrastructure.binding,
    anchor,
    reads,
    maintenance,
    ...(semantic === undefined ? {} : { semantic }),
    ...(options.semanticRuntime === undefined
      ? {}
      : { semanticIndex: options.semanticRuntime.index }),
    store: infrastructure.store,
    operations: infrastructure.operations,
  };
  return {
    ...base,
    ...(options.sourceRoot === undefined
      ? {}
      : {
          routed: new RoutedBrainApplication({
            sourceRoot: options.sourceRoot,
            ...base,
          }),
        }),
  };
}
