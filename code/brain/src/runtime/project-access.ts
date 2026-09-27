import { PiDiscoveryTools } from "../adapters/pi-tools.ts";
import { CognitionMaintenance } from "../application/cognition-maintenance.ts";
import { ReadDiscovery } from "../application/read-discovery.ts";
import { SemanticAwareMaintenance } from "../application/semantic-maintenance.ts";
import {
  formatAddressedPublicPath,
  type LogicalBrainPath,
  type RelatedProjectAlias,
} from "../brain/namespace.ts";
import { CognitionStateStore, nodeCognitionStoreFs } from "../persistence/cognition-state-store.ts";
import {
  FileGlobalSemanticLease,
  PersistentOperationCoordinator,
  type AuxiliaryUpdateOutcome,
  type AuxiliaryUpdateRequest,
} from "../persistence/operation-coordination.ts";
import { createStorageBinding, type ProjectId } from "../persistence/storage.ts";
import type { RelatedAccess } from "./project-relations.ts";
import type { SemanticIndex } from "./semantic-index.ts";

export interface ProjectCognitionAccess {
  readonly binding: Awaited<ReturnType<typeof createStorageBinding>>;
  readonly store: CognitionStateStore;
  readonly operations: PersistentOperationCoordinator;
  readonly reads: ReadDiscovery;
  readonly maintenance: Pick<
    CognitionMaintenance,
    "write" | "edit" | "remove" | "move" | "feedback"
  >;
}

const READ_ONLY_AUXILIARY = {
  async tryApplyAuxiliaryUpdate(_request: AuxiliaryUpdateRequest): Promise<AuxiliaryUpdateOutcome> {
    return { kind: "applied" };
  },
};

export async function createRelatedProjectAccess(options: {
  brainRoot: string;
  projectId: ProjectId;
  alias: RelatedProjectAlias;
  access: RelatedAccess;
  semanticIndex?: SemanticIndex;
}): Promise<ProjectCognitionAccess> {
  const binding = await createStorageBinding({
    brainRoot: options.brainRoot,
    projectId: options.projectId,
  });
  const store = new CognitionStateStore(binding, nodeCognitionStoreFs);
  const operations = new PersistentOperationCoordinator(
    store,
    new FileGlobalSemanticLease(binding.brainRoot),
  );
  const formatPath = (path: LogicalBrainPath) =>
    formatAddressedPublicPath({ root: { kind: "related", alias: options.alias }, path });
  const reads = new ReadDiscovery(
    store,
    new PiDiscoveryTools(binding),
    options.access === "write" ? operations : READ_ONLY_AUXILIARY,
    formatPath,
  );
  const baseMaintenance = new CognitionMaintenance(store, operations);
  return {
    binding,
    store,
    operations,
    reads,
    maintenance:
      options.semanticIndex === undefined
        ? baseMaintenance
        : new SemanticAwareMaintenance(baseMaintenance, binding, options.semanticIndex),
  };
}