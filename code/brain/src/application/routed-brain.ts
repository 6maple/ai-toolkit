import {
  formatAddressedPublicPath,
  isSameLogicalPath,
  parseAddressedPublicPath,
  parseAddressedResourceLocation,
  parsePublicPath,
  type AddressedBrainPath,
  type AddressedResourceLocation,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type LogicalCorePath,
  type PublicBrainRoot,
  type SessionId,
} from "../brain/namespace.ts";
import { CognitionStateStore } from "../persistence/cognition-state-store.ts";
import type { PersistentOperationCoordinator } from "../persistence/operation-coordination.ts";
import { projectAbsoluteLocation, type StorageBinding } from "../persistence/storage.ts";
import type {
  AnchorRequest,
  AnchorRestore,
  AnchorResult,
} from "./anchor-restore.ts";
import {
  CognitionMaintenance,
  deriveMovePlan,
  MaintenanceInputError,
  MaintenanceTargetError,
  type FeedbackKind,
  type MaintenanceResult,
} from "./cognition-maintenance.ts";
import type {
  CatResult,
  CollectedGlobResult,
  CollectedGrepResult,
  DiscoveryListResult,
  GrepResult,
  ReadDiscovery,
  ReadDiscoveryContext,
} from "./read-discovery.ts";
import { createRelatedProjectAccess, type ProjectCognitionAccess } from "../runtime/project-access.ts";
import {
  loadProjectRelationCatalog,
  type AvailableProjectRelation,
  type ProjectRelationCatalog,
} from "../runtime/project-relations.ts";

export type RelatedProjectAccessErrorCode =
  | "unknown-related-project"
  | "related-project-unavailable"
  | "related-project-read-only";

export class RelatedProjectAccessError extends Error {
  readonly code: RelatedProjectAccessErrorCode;

  constructor(
    code: RelatedProjectAccessErrorCode,
    readonly alias: string,
    options: { cause?: unknown; detail?: string } = {},
  ) {
    super(options.detail ?? code, options);
    this.name = "RelatedProjectAccessError";
    this.code = code;
  }
}

export interface RoutedBrainCurrentServices {
  readonly sourceRoot: string;
  readonly binding: StorageBinding;
  readonly anchor: Pick<AnchorRestore, "runAnchor">;
  readonly reads: Pick<
    ReadDiscovery,
    "ls" | "glob" | "grep" | "cat" | "collectGlob" | "finalizeGlob" | "collectGrep" | "finalizeGrep"
  >;
  readonly maintenance: Pick<
    CognitionMaintenance,
    "write" | "edit" | "remove" | "move" | "feedback"
  >;
  readonly store: CognitionStateStore;
  readonly operations: PersistentOperationCoordinator;
}

interface ResolvedPathTarget {
  readonly address: AddressedBrainPath;
  readonly binding: StorageBinding;
  readonly store: CognitionStateStore;
  readonly operations: PersistentOperationCoordinator;
  readonly reads: Pick<ReadDiscovery, "ls" | "glob" | "grep" | "cat">;
  readonly maintenance: Pick<
    CognitionMaintenance,
    "write" | "edit" | "remove" | "move" | "feedback"
  >;
  readonly relation?: AvailableProjectRelation;
}

interface ResolvedResourceTarget {
  readonly address: AddressedResourceLocation;
  readonly binding: StorageBinding;
}

function requireArchival(path: LogicalBrainPath, code: "mv-requires-archival-source" | "mv-requires-archival-destination"): LogicalArchivalPath {
  if (path.kind !== "archival") throw new MaintenanceTargetError(code);
  return path;
}

function requireCognitionDocument(path: LogicalBrainPath): LogicalCorePath | LogicalArchivalPath {
  if (path.kind === "directory") throw new MaintenanceTargetError("target-not-found");
  return path;
}

function sameBinding(a: StorageBinding, b: StorageBinding): boolean {
  return a.brainRoot === b.brainRoot && a.projectId === b.projectId;
}

function formatThrough(root: PublicBrainRoot, path: LogicalBrainPath): string {
  return formatAddressedPublicPath({ root, path });
}

function withRelatedProjectReferenceNote<T extends { readonly text: string }>(
  result: T,
  root: PublicBrainRoot,
): T {
  if (root.kind !== "related" || !result.text.includes("@project/")) return result;
  const relatedRoot = `#${root.alias}`;
  const note = [
    `This content comes from ${relatedRoot}.`,
    `To follow an \`@project/...\` reference in this content, use \`${relatedRoot}/...\` when calling Brain tools.`,
    `When writing this content back, keep \`@project/...\` as \`@project/...\`; do not replace it with \`${relatedRoot}/...\`.`,
  ].join("\n");
  return { ...result, text: `${note}\n\n${result.text}` };
}

const RELATED_PROJECT_MEMORIES = parsePublicPath("@project/memories/");
const EMPTY_RELATED_GLOB: CollectedGlobResult = { items: [], sourceTruncated: false };
const EMPTY_RELATED_GREP: CollectedGrepResult = { documents: [], sourceTruncated: false };

function duplicateTargetWarnings(relations: readonly AvailableProjectRelation[]) {
  const aliasesByProject = new Map<string, string[]>();
  for (const relation of relations) {
    const aliases = aliasesByProject.get(relation.projectId);
    if (aliases === undefined) aliasesByProject.set(relation.projectId, [relation.alias]);
    else aliases.push(relation.alias);
  }
  return [...aliasesByProject.values()]
    .filter((aliases) => aliases.length > 1)
    .map((aliases) => {
      const rendered = aliases
        .slice()
        .sort()
        .map((alias) => `#${alias}`)
        .join(", ");
      return {
        code: "related-project-duplicate-target",
        message: `${rendered} resolve to the same Brain project; multiple aliases are allowed, but omitted-path discovery may return that project's memories through each alias.`,
      };
    });
}

function withWorkspaceRelatedReferenceNote<T extends DiscoveryListResult | GrepResult>(result: T): T {
  const containsRelatedProjectReference = result.records.some((record) => {
    if (!record.publicPath.startsWith("#")) return false;
    return "lineText" in record
      ? [
          record.summary,
          record.lineText,
          ...record.contextBefore.map((line) => line.text),
          ...record.contextAfter.map((line) => line.text),
        ].some((text) => text.includes("@project/"))
      : record.kind === "archival" && record.summary.includes("@project/");
  });
  if (!containsRelatedProjectReference) return result;
  const note =
    "For a related result under `#alias/...`, follow an `@project/...` reference with that same `#alias/...` in Brain tools; keep `@project/...` unchanged when writing back.";
  return { ...result, text: `${note}

${result.text}` };
}

function renderSingleMaintenanceResult(result: MaintenanceResult, root: PublicBrainRoot): string {
  switch (result.action) {
    case "created":
      return `created ${formatThrough(root, result.path)}`;
    case "overwrote":
      return `overwrote ${formatThrough(root, result.path)}`;
    case "edited":
      return result.changed
        ? `edited ${formatThrough(root, result.path)}`
        : `no changes: ${formatThrough(root, result.path)}`;
    case "removed":
      return `removed ${formatThrough(root, result.path)}`;
    case "adopted":
      return `recorded validated use for ${formatThrough(root, result.path)}`;
    case "questioned":
      return result.changed
        ? `questioned ${formatThrough(root, result.path)}`
        : `current challenge unchanged for ${formatThrough(root, result.path)}`;
    case "resolved":
      return `resolved ${formatThrough(root, result.path)}`;
    case "moved":
      return `moved ${formatThrough(root, result.from)} -> ${formatThrough(root, result.to)}${result.replacedExistingDestination ? "; replaced existing destination" : ""}`;
  }
}

export class RoutedBrainApplication {
  constructor(private readonly current: RoutedBrainCurrentServices) {}

  private loadCatalog(): Promise<ProjectRelationCatalog> {
    return loadProjectRelationCatalog({
      brainRoot: this.current.binding.brainRoot,
      sourceRoot: this.current.sourceRoot,
      projectId: this.current.binding.projectId,
    });
  }

  private relationFor(catalog: ProjectRelationCatalog, alias: string): AvailableProjectRelation {
    if (catalog.configError !== undefined) {
      throw new RelatedProjectAccessError("related-project-unavailable", alias, {
        detail: catalog.configError.message,
      });
    }
    const entry = catalog.byAlias.get(alias);
    if (entry === undefined) {
      throw new RelatedProjectAccessError("unknown-related-project", alias);
    }
    if (entry.kind === "unavailable") {
      throw new RelatedProjectAccessError("related-project-unavailable", alias, {
        detail: entry.reason,
      });
    }
    return entry;
  }

  private async accessForRelation(relation: AvailableProjectRelation): Promise<ProjectCognitionAccess> {
    return createRelatedProjectAccess({
      brainRoot: this.current.binding.brainRoot,
      projectId: relation.projectId,
      alias: relation.alias,
      access: relation.access,
    });
  }

  private async resolvePath(
    raw: string,
    catalog: ProjectRelationCatalog,
  ): Promise<ResolvedPathTarget> {
    const address = parseAddressedPublicPath(raw);
    if (address.root.kind === "builtin") {
      return {
        address,
        binding: this.current.binding,
        store: this.current.store,
        operations: this.current.operations,
        reads: this.current.reads,
        maintenance: this.current.maintenance,
      };
    }
    const relation = this.relationFor(catalog, address.root.alias);
    const access = await this.accessForRelation(relation);
    return { address, relation, ...access };
  }

  private async resolveResource(
    raw: string,
    catalog: ProjectRelationCatalog,
  ): Promise<ResolvedResourceTarget> {
    const address = parseAddressedResourceLocation(raw);
    if (address.root.kind === "builtin") return { address, binding: this.current.binding };
    const relation = this.relationFor(catalog, address.root.alias);
    const access = await this.accessForRelation(relation);
    return { address, binding: access.binding };
  }

  private requireWrite(target: ResolvedPathTarget): void {
    if (target.relation !== undefined && target.relation.access !== "write") {
      throw new RelatedProjectAccessError("related-project-read-only", target.relation.alias);
    }
  }

  async think(currentSessionId?: SessionId): Promise<AnchorResult> {
    const catalog = await this.loadCatalog();
    const availableRelations = catalog.entries.filter(
      (entry): entry is AvailableProjectRelation => entry.kind === "available",
    );
    const relatedProjects = availableRelations.map((entry) => ({
      alias: entry.alias,
      access: entry.access,
      files: entry.files,
      corePath: `#${entry.alias}/core.md`,
    }));
    const relatedProjectWarnings = duplicateTargetWarnings(availableRelations);
    const relatedProjectErrors = [
      ...(catalog.configError === undefined
        ? []
        : [
            {
              code: "related-project-unavailable",
              message: catalog.configError.message,
            },
          ]),
      ...catalog.entries
        .filter((entry) => entry.kind === "unavailable")
        .map((entry) => ({
          ...(entry.alias === undefined ? {} : { alias: entry.alias }),
          code: "related-project-unavailable",
          message: entry.reason,
        })),
    ];
    const request: AnchorRequest = {
      ...(currentSessionId === undefined ? {} : { currentSessionId }),
      ...(relatedProjects.length === 0 ? {} : { relatedProjects }),
      ...(relatedProjectWarnings.length === 0 ? {} : { relatedProjectWarnings }),
      ...(relatedProjectErrors.length === 0 ? {} : { relatedProjectErrors }),
    };
    return this.current.anchor.runAnchor(request);
  }

  async absolutePath(raw: string): Promise<string> {
    const catalog = await this.loadCatalog();
    const target = await this.resolveResource(raw, catalog);
    return projectAbsoluteLocation(target.binding, target.address.location);
  }

  async ls(rawPath: string, context: ReadDiscoveryContext = {}): Promise<DiscoveryListResult> {
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(rawPath, catalog);
    const result = await target.reads.ls(target.address.path, context);
    return withRelatedProjectReferenceNote(result, target.address.root);
  }

  async glob(
    request: { pattern: string; path?: string },
    context: ReadDiscoveryContext = {},
  ): Promise<DiscoveryListResult> {
    if (request.path === undefined) {
      const catalog = await this.loadCatalog();
      const current = await this.current.reads.collectGlob({ pattern: request.pattern }, context);
      const related = await Promise.all(
        catalog.entries
          .filter((entry): entry is AvailableProjectRelation => entry.kind === "available")
          .map(async (relation) => {
            const access = await this.accessForRelation(relation);
            if (!(await access.store.isScopeMaterialized({ kind: "project" }))) {
              return EMPTY_RELATED_GLOB;
            }
            return access.reads.collectGlob(
              { pattern: request.pattern, path: RELATED_PROJECT_MEMORIES },
              context,
            );
          }),
      );
      return withWorkspaceRelatedReferenceNote(
        this.current.reads.finalizeGlob([current, ...related]),
      );
    }
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(request.path, catalog);
    const result = await target.reads.glob({ pattern: request.pattern, path: target.address.path }, context);
    return withRelatedProjectReferenceNote(result, target.address.root);
  }

  async grep(
    request: {
      pattern: string;
      path?: string;
      glob?: string;
      ignoreCase?: boolean;
      literal?: boolean;
      context?: number;
      signal?: AbortSignal;
    },
    context: ReadDiscoveryContext = {},
  ): Promise<GrepResult> {
    const common = {
      pattern: request.pattern,
      ...(request.glob === undefined ? {} : { glob: request.glob }),
      ...(request.ignoreCase === undefined ? {} : { ignoreCase: request.ignoreCase }),
      ...(request.literal === undefined ? {} : { literal: request.literal }),
      ...(request.context === undefined ? {} : { context: request.context }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    };
    if (request.path === undefined) {
      const catalog = await this.loadCatalog();
      const current = await this.current.reads.collectGrep(common, context);
      const related = await Promise.all(
        catalog.entries
          .filter((entry): entry is AvailableProjectRelation => entry.kind === "available")
          .map(async (relation) => {
            const access = await this.accessForRelation(relation);
            if (!(await access.store.isScopeMaterialized({ kind: "project" }))) {
              return EMPTY_RELATED_GREP;
            }
            return access.reads.collectGrep({ ...common, path: RELATED_PROJECT_MEMORIES }, context);
          }),
      );
      return withWorkspaceRelatedReferenceNote(
        this.current.reads.finalizeGrep([current, ...related]),
      );
    }
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(request.path, catalog);
    const result = await target.reads.grep(
      {
        ...common,
        path: target.address.path,
      },
      context,
    );
    return withRelatedProjectReferenceNote(result, target.address.root);
  }

  async cat(request: { path: string; offset?: number; limit?: number; signal?: AbortSignal }): Promise<CatResult> {
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(request.path, catalog);
    const result = await target.reads.cat({
      path: target.address.path,
      ...(request.offset === undefined ? {} : { offset: request.offset }),
      ...(request.limit === undefined ? {} : { limit: request.limit }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    return withRelatedProjectReferenceNote(result, target.address.root);
  }

  async write(path: string, content: string): Promise<string> {
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(path, catalog);
    this.requireWrite(target);
    const result = await target.maintenance.write(target.address.path, content);
    return renderSingleMaintenanceResult(result, target.address.root);
  }

  async edit(request: {
    path: string;
    edits?: readonly { oldText: string; newText: string }[];
    content?: string;
  }): Promise<string> {
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(request.path, catalog);
    this.requireWrite(target);
    const result = await target.maintenance.edit({
      path: requireCognitionDocument(target.address.path),
      ...(request.edits === undefined ? {} : { edits: request.edits }),
      ...(request.content === undefined ? {} : { content: request.content }),
    });
    return renderSingleMaintenanceResult(result, target.address.root);
  }

  async remove(path: string): Promise<string> {
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(path, catalog);
    this.requireWrite(target);
    const result = await target.maintenance.remove(target.address.path);
    return renderSingleMaintenanceResult(result, target.address.root);
  }

  async feedback(path: string, feedback: FeedbackKind, challenge?: string): Promise<string> {
    const catalog = await this.loadCatalog();
    const target = await this.resolvePath(path, catalog);
    this.requireWrite(target);
    const result = await target.maintenance.feedback(target.address.path, feedback, challenge);
    return renderSingleMaintenanceResult(result, target.address.root);
  }

  async move(srcRaw: string, dstRaw: string): Promise<string> {
    const catalog = await this.loadCatalog();
    const [sourceTarget, destinationTarget] = await Promise.all([
      this.resolvePath(srcRaw, catalog),
      this.resolvePath(dstRaw, catalog),
    ]);
    const src = requireArchival(sourceTarget.address.path, "mv-requires-archival-source");
    const dst = requireArchival(destinationTarget.address.path, "mv-requires-archival-destination");

    if (sameBinding(sourceTarget.binding, destinationTarget.binding) && isSameLogicalPath(src, dst)) {
      throw new MaintenanceInputError("same-source-destination");
    }

    this.requireWrite(sourceTarget);
    this.requireWrite(destinationTarget);

    if (sameBinding(sourceTarget.binding, destinationTarget.binding)) {
      const result = await sourceTarget.maintenance.move(src, dst);
      if (result.action !== "moved") throw new Error("unexpected maintenance result");
      return `moved ${formatThrough(sourceTarget.address.root, result.from)} -> ${formatThrough(destinationTarget.address.root, result.to)}${result.replacedExistingDestination ? "; replaced existing destination" : ""}`;
    }

    const result = await this.current.operations.runSemanticOperation({
      name: "brain-mv-cross-project",
      scopes: [src.scope, dst.scope],
      derive: async () => {
        const plan = await deriveMovePlan({
          sourcePersistence: sourceTarget.store,
          destinationPersistence: destinationTarget.store,
          requestedSrc: src,
          requestedDst: dst,
          sameOwner: false,
        });
        return {
          kind: "change" as const,
          mutations: plan.mutations.map((entry) => ({
            ...entry.mutation,
            binding:
              entry.owner === "source" ? sourceTarget.binding : destinationTarget.binding,
          })),
          result: plan.result,
        };
      },
    });

    await sourceTarget.operations.tryApplyAuxiliaryUpdate({
      scopes: [result.from.scope],
      deriveAndApply: () => sourceTarget.store.deleteCompanion(result.from),
    });

    return `moved ${formatThrough(sourceTarget.address.root, result.from)} -> ${formatThrough(destinationTarget.address.root, result.to)}${result.replacedExistingDestination ? "; replaced existing destination" : ""}`;
  }
}