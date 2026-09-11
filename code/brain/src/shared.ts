/**
 * brain/shared — 给可信宿主适配器和同仓库消费方使用的共享导出。
 *
 * 这里只做透传（passthrough），不封装业务逻辑、不新增 read-only 层。
 * 暴露的是 brain 内部已有的读取/解析/状态模块，便于复用同一套 namespace、
 * document schema、companion codec 和 storage 语义。
 */

// --- host integration ---
export {
  registerBrainTools,
  type BrainApplicationServices,
  type BrainToolInvocation,
  type BrainToolInvocationResolver,
  type BrainToolRegistrar,
  type BrainToolRegistrationOptions,
  type HostInvocationAdapter,
} from "./integration/mcp-adapter.ts";
export {
  createProductionBrainServices,
  restoreProductionBrainContext,
  type ProductionBrainRestoreRequest,
} from "./runtime/production.ts";

// --- brain logical namespace ---
export {
  COGNITIVE_ROLES,
  formatPublicPath,
  formatScopePrefix,
  isSameLogicalPath,
  parsePublicPath,
  parseResourceLocation,
  parseSessionId,
  type CognitiveRole,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type LogicalCorePath,
  type LogicalDirectory,
  type LogicalResourceLocation,
  type ScopeRef,
  type SessionId,
} from "./brain/namespace.ts";

// --- document schema ---
export {
  CORE_DOC_MAX_CODE_POINTS,
  IMPORTANCE_LEVELS,
  extractFrontmatterEnvelope,
  parseArchivalDocument,
  validateCoreDocument,
  type ArchivalDocument,
  type CoreDocument,
  type FrontmatterEnvelope,
  type Importance,
} from "./brain/documents.ts";

// --- epistemic state ---
export {
  activeEpistemicState,
  clearChallenge,
  deriveEpistemicStatus,
  setChallenge,
  type EpistemicState,
  type EpistemicStatus,
} from "./brain/epistemic.ts";

// --- accessibility / learning state ---
export {
  ADOPT_DURABILITY_GAIN,
  INITIAL_DURABILITY,
  applyDirectEngagement,
  applyExactRetrieval,
  applyPassiveExposure,
  applyValidatedUse,
  createFreshAccessibilityState,
  initialScopeCycleState,
  projectAccessibility,
  rebaseAcrossScope,
  type AccessibilityPersistenceState,
  type AccessibilityProjection,
  type ScopeCycleState,
} from "./brain/accessibility.ts";

// --- persistence codecs ---
export {
  decodeCompanion,
  decodeMarkdown,
  decodeScopeState,
  encodeCompanion,
  encodeMarkdown,
  encodeScopeState,
  hashMarkdownContent,
  normalizeMarkdownInput,
  type DecodedCompanion,
  type MarkdownContentHash,
} from "./persistence/codecs.ts";

// --- cognition state store ---
export {
  CognitionStateStore,
  nodeCognitionStoreFs,
  persistentArchivalRef,
  persistentCompanionRef,
  persistentCoreRef,
  persistentScopeStateRef,
  type ArchivalSnapshot,
  type ArchivalPathListing,
  type LoadedArchivalSnapshot,
  type MaterializedScopeSnapshot,
} from "./persistence/cognition-state-store.ts";

// --- project mapping ---
export {
  addProjectSourceRoot,
  listProjectMetadata,
  removeProjectSourceRoot,
  resolveOrCreateProject,
  type ProjectMetadata,
} from "./persistence/project-mapping.ts";

// --- storage binding / physical projection ---
export {
  createStorageBinding,
  nodeStorageFs,
  projectAbsoluteLocation,
  projectPhysicalResource,
  projectScopeRoot,
  scopeRoot,
  type CanonicalBrainRoot,
  type ProjectedResource,
  type ProjectId,
  type ResolvedBrainResource,
  type StorageBinding,
  type StorageFs,
  type StorageStat,
} from "./persistence/storage.ts";
