import type { ScopeRef } from "../brain/namespace.ts";
import { GitCheckpoint, type PrepareHistoryOutcome } from "../git/checkpoint.ts";
import {
  SystemGitCommandRunner,
  nodeRepositoryFs,
  type GitCommandRunner,
  type RepositoryFs,
} from "../git/repository.ts";
import { encodeMarkdown, normalizeMarkdownInput } from "../persistence/codecs.ts";
import {
  CognitionStateStore,
  nodeCognitionStoreFs,
  persistentCoreRef,
  type CognitionStoreFs,
  type ResourceMutation,
} from "../persistence/cognition-state-store.ts";
import {
  FileGlobalSemanticLease,
  PersistentOperationCoordinator,
  type GlobalSemanticLeasePort,
} from "../persistence/operation-coordination.ts";
import {
  createStorageBinding,
  type CreateStorageBindingOptions,
  type StorageBinding,
} from "../persistence/storage.ts";

const GLOBAL_SCOPE: ScopeRef = { kind: "global" };
const PROJECT_SCOPE: ScopeRef = { kind: "project" };

export interface BrainRuntimeInfrastructure {
  readonly binding: StorageBinding;
  readonly store: CognitionStateStore;
  readonly operations: PersistentOperationCoordinator;
  readonly checkpoint: GitCheckpoint;
  readonly historyPreparation: PrepareHistoryOutcome;
  readonly globalLease: GlobalSemanticLeasePort;
}

export interface BootstrapDependencies {
  readonly storeFs?: CognitionStoreFs;
  readonly historyFs?: RepositoryFs;
  readonly gitRunner?: GitCommandRunner;
  readonly globalLease?: GlobalSemanticLeasePort;
}

export async function bootstrapBrainRuntimeInfrastructure(
  options: Omit<CreateStorageBindingOptions, "fs">,
  dependencies: BootstrapDependencies = {},
): Promise<BrainRuntimeInfrastructure> {
  const storeFs = dependencies.storeFs ?? nodeCognitionStoreFs;
  const binding = await createStorageBinding({ ...options, fs: storeFs });
  const globalLease = dependencies.globalLease ?? new FileGlobalSemanticLease(binding.brainRoot);
  const store = new CognitionStateStore(binding, storeFs);
  const operations = new PersistentOperationCoordinator(store, globalLease);

  await operations.runSemanticOperation({
    name: "runtime-required-cores",
    scopes: [GLOBAL_SCOPE, PROJECT_SCOPE],
    derive: async () => {
      const [global, project] = await Promise.all([
        store.loadScope(GLOBAL_SCOPE),
        store.loadScope(PROJECT_SCOPE),
      ]);
      const mutations: ResourceMutation[] = [];
      const emptyCore = encodeMarkdown(normalizeMarkdownInput(""));
      if (global === undefined) {
        mutations.push({ kind: "put", ref: persistentCoreRef(GLOBAL_SCOPE), bytes: emptyCore });
      }
      if (project === undefined) {
        mutations.push({ kind: "put", ref: persistentCoreRef(PROJECT_SCOPE), bytes: emptyCore });
      }
      return mutations.length === 0
        ? { kind: "no-change", result: undefined }
        : { kind: "change", mutations, result: undefined };
    },
  });

  const runner = dependencies.gitRunner ?? new SystemGitCommandRunner(binding.brainRoot);
  const checkpoint = new GitCheckpoint(binding, runner, dependencies.historyFs ?? nodeRepositoryFs);
  // E3 is auxiliary. Its setup outcome is retained for diagnostics/integration,
  // but never gates cognition Tool serving.
  const historyPreparation = await checkpoint.prepareRepository();

  return { binding, store, operations, checkpoint, historyPreparation, globalLease };
}
