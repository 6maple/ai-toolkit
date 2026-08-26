import { randomUUID } from "node:crypto";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

import {
  createFreshAccessibilityState,
  initialScopeCycleState,
  projectAccessibility,
  type AccessibilityPersistenceState,
  type ScopeCycleState,
} from "../brain/accessibility.ts";
import {
  parseArchivalDocument,
  validateCoreDocument,
  type ArchivalDocument,
  type CoreDocument,
} from "../brain/documents.ts";
import { activeEpistemicState, type EpistemicState } from "../brain/epistemic.ts";
import {
  COGNITIVE_ROLES,
  formatPublicPath,
  parsePublicPath,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type LogicalCorePath,
  type LogicalDirectory,
  type ScopeRef,
} from "../brain/namespace.ts";
import {
  decodeCompanion,
  decodeMarkdown,
  decodeScopeState,
  hashMarkdownContent,
} from "./codecs.ts";
import {
  companionRef,
  nodeStorageFs,
  projectPhysicalResource,
  resolveCreateTarget,
  resolveExistingResource,
  StorageNotFoundError,
  type PhysicalResourceRef,
  type StorageBinding,
  type StorageFs,
} from "./storage.ts";

export type PersistentFileRef =
  | { readonly kind: "public"; readonly path: LogicalCorePath | LogicalArchivalPath }
  | { readonly kind: "scope-state"; readonly scope: ScopeRef }
  | { readonly kind: "companion"; readonly item: LogicalArchivalPath };

export type ResourceMutation =
  | { readonly kind: "put"; readonly ref: PersistentFileRef; readonly bytes: Uint8Array }
  | { readonly kind: "delete"; readonly ref: PersistentFileRef };

export type ResourceBeforeState =
  | { readonly existed: false }
  | { readonly existed: true; readonly bytes: Uint8Array };

export interface PreparedPhysicalMutation {
  readonly ref: PersistentFileRef;
  readonly operation: "put" | "delete";
  readonly absolutePath: string;
}

export interface PersistentResourcePort {
  preflight(mutation: ResourceMutation): Promise<PreparedPhysicalMutation>;
  readBefore(prepared: PreparedPhysicalMutation): Promise<ResourceBeforeState>;
  putWhole(prepared: PreparedPhysicalMutation, bytes: Uint8Array): Promise<void>;
  deleteFile(prepared: PreparedPhysicalMutation): Promise<void>;
  restoreBefore(prepared: PreparedPhysicalMutation, before: ResourceBeforeState): Promise<void>;
}

export interface MaterializedScopeSnapshot {
  readonly scope: ScopeRef;
  readonly cycle: ScopeCycleState;
  readonly cycleWasFresh: boolean;
  readonly core: CoreDocument;
}

export interface ArchivalSnapshot {
  readonly path: LogicalArchivalPath;
  readonly document: ArchivalDocument;
  readonly epistemic: EpistemicState;
  readonly accessibility: AccessibilityPersistenceState;
  readonly companionState: "persisted" | "fresh";
}

export interface LoadedArchivalSnapshot extends ArchivalSnapshot {
  readonly requestedPath: LogicalArchivalPath;
  readonly aliasFollowed: boolean;
}

export interface DiscoveryStorageDiagnostic {
  readonly kind: "alias-followed" | "entry-skipped";
  readonly path?: LogicalBrainPath;
  readonly message: string;
}

export interface ArchivalPathListing {
  readonly paths: readonly LogicalArchivalPath[];
  readonly diagnostics: readonly DiscoveryStorageDiagnostic[];
}

export class PersistentResourceObjectKindError extends Error {
  readonly code = "wrong-object-kind" as const;

  constructor() {
    super("brain persistent public resource resolved to a different logical object kind");
    this.name = "PersistentResourceObjectKindError";
  }
}

export interface MaintenanceStatePort {
  loadScope(scope: ScopeRef): Promise<MaterializedScopeSnapshot | undefined>;
  loadArchival(path: LogicalArchivalPath): Promise<ArchivalSnapshot | undefined>;
}

export type PersistentStateInvariantErrorCode = "malformed-persistent-state";

export class PersistentStateInvariantError extends Error {
  readonly code: PersistentStateInvariantErrorCode;

  constructor(code: PersistentStateInvariantErrorCode, options?: { cause?: unknown }) {
    super(`brain persistent state invariant failed: ${code}`, options);
    this.name = "PersistentStateInvariantError";
    this.code = code;
  }
}

export interface ManagedDirectoryEntry {
  readonly name: string;
  readonly kind: "file" | "directory" | "symlink" | "other";
}

export interface CognitionStoreFs extends StorageFs {
  readFile(target: string): Promise<Uint8Array>;
  writeFileExclusive(target: string, bytes: Uint8Array): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  unlink(target: string): Promise<void>;
  readDirectory(target: string): Promise<readonly ManagedDirectoryEntry[]>;
}

function direntKind(entry: import("node:fs").Dirent): ManagedDirectoryEntry["kind"] {
  if (entry.isSymbolicLink()) return "symlink";
  if (entry.isFile()) return "file";
  if (entry.isDirectory()) return "directory";
  return "other";
}

export const nodeCognitionStoreFs: CognitionStoreFs = {
  ...nodeStorageFs,
  readFile: (target) => fsPromises.readFile(target),
  writeFileExclusive: (target, bytes) => fsPromises.writeFile(target, bytes, { flag: "wx" }),
  rename: (source, destination) => fsPromises.rename(source, destination),
  unlink: (target) => fsPromises.unlink(target),
  readDirectory: async (target) => {
    const entries = await fsPromises.readdir(target, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, kind: direntKind(entry) }));
  },
};

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function corePath(scope: ScopeRef): LogicalCorePath {
  return { kind: "core", scope };
}

function scopeStateRef(scope: ScopeRef): PersistentFileRef {
  return { kind: "scope-state", scope };
}

export class CognitionStateStore implements MaintenanceStatePort, PersistentResourcePort {
  constructor(
    readonly binding: StorageBinding,
    private readonly fs: CognitionStoreFs = nodeCognitionStoreFs,
  ) {}

  async loadScope(scope: ScopeRef): Promise<MaterializedScopeSnapshot | undefined> {
    let resolvedCore;
    try {
      resolvedCore = await resolveExistingResource(
        this.binding,
        { kind: "public", path: corePath(scope) },
        this.fs,
      );
    } catch (error) {
      if (error instanceof StorageNotFoundError) return undefined;
      throw error;
    }
    if (
      resolvedCore.canonicalRef.kind !== "public" ||
      resolvedCore.canonicalRef.path.kind !== "core"
    ) {
      throw new PersistentResourceObjectKindError();
    }

    let core: CoreDocument;
    try {
      core = validateCoreDocument(
        decodeMarkdown(Uint8Array.from(await this.fs.readFile(resolvedCore.canonicalPath))),
      );
    } catch (error) {
      throw new PersistentStateInvariantError("malformed-persistent-state", { cause: error });
    }

    let cycle = initialScopeCycleState();
    let cycleWasFresh = true;
    const stateBytes = await this.readOptional(scopeStateRef(scope));
    if (stateBytes !== undefined) {
      try {
        cycle = decodeScopeState(stateBytes);
        cycleWasFresh = false;
      } catch {
        // Auxiliary cycle state may restart from the fresh baseline without
        // invalidating the real resident core.
      }
    }
    return { scope, cycle, cycleWasFresh, core };
  }

  async loadArchival(item: LogicalArchivalPath): Promise<LoadedArchivalSnapshot | undefined> {
    let resolvedDocument;
    try {
      resolvedDocument = await resolveExistingResource(
        this.binding,
        { kind: "public", path: item },
        this.fs,
      );
    } catch (error) {
      if (error instanceof StorageNotFoundError) return undefined;
      throw error;
    }
    if (
      resolvedDocument.canonicalRef.kind !== "public" ||
      resolvedDocument.canonicalRef.path.kind !== "archival"
    ) {
      throw new PersistentResourceObjectKindError();
    }
    const canonicalItem = resolvedDocument.canonicalRef.path;

    let documentBytes: Uint8Array;
    try {
      documentBytes = Uint8Array.from(await this.fs.readFile(resolvedDocument.canonicalPath));
    } catch (error) {
      throw new PersistentStateInvariantError("malformed-persistent-state", { cause: error });
    }

    const [companionBytes, scopeSnapshot] = await Promise.all([
      this.readOptional(companionRef(canonicalItem) as PersistentFileRef),
      this.loadScope(canonicalItem.scope),
    ]);
    if (scopeSnapshot === undefined) {
      throw new PersistentStateInvariantError("malformed-persistent-state");
    }

    let document: ArchivalDocument;
    try {
      document = parseArchivalDocument(decodeMarkdown(documentBytes));
    } catch (error) {
      throw new PersistentStateInvariantError("malformed-persistent-state", { cause: error });
    }
    const scopeCycle = scopeSnapshot.cycle;

    if (companionBytes !== undefined) {
      try {
        const companion = decodeCompanion(companionBytes);
        if (companion.contentHash === hashMarkdownContent(document.text)) {
          projectAccessibility(scopeCycle, companion.accessibility);
          return {
            requestedPath: item,
            path: canonicalItem,
            aliasFollowed: resolvedDocument.aliasFollowed,
            document,
            epistemic: companion.epistemic,
            accessibility: companion.accessibility,
            companionState: "persisted",
          };
        }
      } catch {
        // Auxiliary state is disposable. Missing, malformed, stale, or otherwise
        // incompatible companion data falls back to a fresh state for this Markdown.
      }
    }

    return {
      requestedPath: item,
      path: canonicalItem,
      aliasFollowed: resolvedDocument.aliasFollowed,
      document,
      epistemic: activeEpistemicState(),
      accessibility: createFreshAccessibilityState(scopeCycle),
      companionState: "fresh",
    };
  }

  async isScopeMaterialized(scope: ScopeRef): Promise<boolean> {
    return (await this.loadScope(scope)) !== undefined;
  }

  async readScopeCycle(scope: ScopeRef): Promise<ScopeCycleState> {
    const snapshot = await this.loadScope(scope);
    if (snapshot === undefined) {
      throw new PersistentStateInvariantError("malformed-persistent-state");
    }
    return snapshot.cycle;
  }

  async resolveDiscoveryRoot(pathValue: LogicalDirectory): Promise<
    | {
        readonly requested: LogicalDirectory;
        readonly path: LogicalDirectory;
        readonly aliasFollowed: boolean;
      }
    | undefined
  > {
    try {
      const resolved = await resolveExistingResource(
        this.binding,
        { kind: "public", path: pathValue },
        this.fs,
      );
      if (
        resolved.canonicalRef.kind !== "public" ||
        resolved.canonicalRef.path.kind !== "directory"
      ) {
        throw new PersistentResourceObjectKindError();
      }
      return {
        requested: pathValue,
        path: resolved.canonicalRef.path,
        aliasFollowed: resolved.aliasFollowed,
      };
    } catch (error) {
      if (error instanceof StorageNotFoundError) {
        // memories-root and role-root are logical namespace affordances whenever
        // the scope exists, even before their physical directories are created.
        if (pathValue.area === "memories-root" || pathValue.area === "role-root") {
          return { requested: pathValue, path: pathValue, aliasFollowed: false };
        }
        return undefined;
      }
      throw error;
    }
  }

  async listActiveArchivalPaths(scope: ScopeRef): Promise<ArchivalPathListing> {
    if (!(await this.isScopeMaterialized(scope))) return { paths: [], diagnostics: [] };

    const diagnostics: DiscoveryStorageDiagnostic[] = [];
    const found = new Map<string, LogicalArchivalPath>();
    const visitedDirectories = new Set<string>();

    const recordSkip = (pathValue: LogicalBrainPath | undefined, error: unknown): void => {
      diagnostics.push({
        kind: "entry-skipped",
        ...(pathValue === undefined ? {} : { path: pathValue }),
        message:
          typeof error === "object" && error !== null && "code" in error
            ? `skipped current entry: ${String(error.code)}`
            : "skipped current entry",
      });
    };

    const resolveDirectoryAndVisit = async (requested: LogicalDirectory): Promise<void> => {
      let resolved;
      try {
        resolved = await resolveExistingResource(
          this.binding,
          { kind: "public", path: requested },
          this.fs,
        );
      } catch (error) {
        if (error instanceof StorageNotFoundError) return;
        recordSkip(requested, error);
        return;
      }
      if (
        resolved.canonicalRef.kind !== "public" ||
        resolved.canonicalRef.path.kind !== "directory"
      ) {
        recordSkip(requested, new PersistentResourceObjectKindError());
        return;
      }
      const canonicalDirectory = resolved.canonicalRef.path;
      if (resolved.aliasFollowed) {
        diagnostics.push({
          kind: "alias-followed",
          path: requested,
          message: `followed alias to ${formatPublicPath(canonicalDirectory)}`,
        });
      }
      if (visitedDirectories.has(resolved.canonicalPath)) return;
      visitedDirectories.add(resolved.canonicalPath);

      let entries: readonly ManagedDirectoryEntry[];
      try {
        entries = await this.fs.readDirectory(resolved.canonicalPath);
      } catch (error) {
        recordSkip(canonicalDirectory, error);
        return;
      }
      const ordered = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const base = formatPublicPath(canonicalDirectory);

      for (const entry of ordered) {
        if (entry.kind === "file" || entry.kind === "symlink") {
          if (entry.name.endsWith(".md") && entry.name !== ".md") {
            let requestedItem: LogicalBrainPath;
            try {
              requestedItem = parsePublicPath(`${base}${entry.name}`);
            } catch {
              continue;
            }
            if (requestedItem.kind !== "archival") continue;
            try {
              const itemResolved = await resolveExistingResource(
                this.binding,
                { kind: "public", path: requestedItem },
                this.fs,
              );
              if (
                itemResolved.canonicalRef.kind !== "public" ||
                itemResolved.canonicalRef.path.kind !== "archival"
              ) {
                recordSkip(requestedItem, new PersistentResourceObjectKindError());
                continue;
              }
              const canonicalItem = itemResolved.canonicalRef.path;
              if (itemResolved.aliasFollowed) {
                diagnostics.push({
                  kind: "alias-followed",
                  path: requestedItem,
                  message: `followed alias to ${formatPublicPath(canonicalItem)}`,
                });
              }
              found.set(formatPublicPath(canonicalItem), canonicalItem);
              continue;
            } catch (error) {
              recordSkip(requestedItem, error);
              continue;
            }
          }
          if (entry.kind !== "symlink") continue;
        }

        if (entry.kind === "directory" || entry.kind === "symlink") {
          let child: LogicalBrainPath;
          try {
            child = parsePublicPath(`${base}${entry.name}/`);
          } catch {
            continue;
          }
          if (child.kind !== "directory") continue;
          await resolveDirectoryAndVisit(child);
        }
      }
    };

    const prefix =
      scope.kind === "global"
        ? "@global"
        : scope.kind === "project"
          ? "@project"
          : `@session/${scope.sessionId}`;
    for (const role of COGNITIVE_ROLES) {
      const parsed = parsePublicPath(`${prefix}/memories/${role}/`);
      if (parsed.kind === "directory") await resolveDirectoryAndVisit(parsed);
    }

    const paths = [...found.values()].sort((a, b) => {
      const left = formatPublicPath(a);
      const right = formatPublicPath(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    return { paths, diagnostics };
  }

  async resolveExisting(pathValue: LogicalBrainPath): Promise<{
    readonly requested: LogicalBrainPath;
    readonly path: LogicalBrainPath;
    readonly aliasFollowed: boolean;
  }> {
    const resolved = await resolveExistingResource(
      this.binding,
      { kind: "public", path: pathValue },
      this.fs,
    );
    if (resolved.canonicalRef.kind !== "public") {
      throw new PersistentStateInvariantError("malformed-persistent-state");
    }
    return {
      requested: pathValue,
      path: resolved.canonicalRef.path,
      aliasFollowed: resolved.aliasFollowed,
    };
  }

  async resolveCreateTarget(pathValue: LogicalBrainPath): Promise<{
    readonly requested: LogicalBrainPath;
    readonly path: LogicalBrainPath;
    readonly aliasFollowed: boolean;
  }> {
    const resolved = await resolveCreateTarget(
      this.binding,
      { kind: "public", path: pathValue },
      this.fs,
    );
    if (resolved.canonicalRef.kind !== "public") {
      throw new PersistentStateInvariantError("malformed-persistent-state");
    }
    return {
      requested: pathValue,
      path: resolved.canonicalRef.path,
      aliasFollowed: resolved.aliasFollowed,
    };
  }

  async deleteCompanion(pathValue: LogicalArchivalPath): Promise<void> {
    try {
      const resolved = await resolveExistingResource(
        this.binding,
        companionRef(pathValue),
        this.fs,
      );
      await this.fs.unlink(resolved.canonicalPath);
    } catch (error) {
      if (error instanceof StorageNotFoundError || isErrno(error, "ENOENT")) return;
      throw error;
    }
  }

  async listArchival(scope: ScopeRef): Promise<{
    readonly items: readonly LoadedArchivalSnapshot[];
    readonly diagnostics: ReadonlyArray<{
      readonly kind: "archival-item-skipped";
      readonly path?: LogicalArchivalPath;
      readonly message: string;
    }>;
  }> {
    const listing = await this.listActiveArchivalPaths(scope);
    const items: LoadedArchivalSnapshot[] = [];
    const diagnostics: Array<{
      readonly kind: "archival-item-skipped";
      readonly path?: LogicalArchivalPath;
      readonly message: string;
    }> = [];

    for (const diagnostic of listing.diagnostics) {
      if (diagnostic.kind !== "entry-skipped") continue;
      diagnostics.push({
        kind: "archival-item-skipped",
        ...(diagnostic.path?.kind === "archival" ? { path: diagnostic.path } : {}),
        message: diagnostic.message,
      });
    }

    for (const pathValue of listing.paths) {
      try {
        const item = await this.loadArchival(pathValue);
        if (item !== undefined) items.push(item);
      } catch (error) {
        diagnostics.push({
          kind: "archival-item-skipped",
          path: pathValue,
          message:
            typeof error === "object" && error !== null && "code" in error
              ? `skipped archival item: ${String(error.code)}`
              : "skipped archival item",
        });
      }
    }
    return { items, diagnostics };
  }

  async putScopeCycle(scope: ScopeRef, bytes: Uint8Array): Promise<void> {
    const prepared = await this.preflight({
      kind: "put",
      ref: persistentScopeStateRef(scope),
      bytes,
    });
    await this.putWhole(prepared, bytes);
  }

  async putCompanion(pathValue: LogicalArchivalPath, bytes: Uint8Array): Promise<void> {
    const prepared = await this.preflight({
      kind: "put",
      ref: persistentCompanionRef(pathValue),
      bytes,
    });
    await this.putWhole(prepared, bytes);
  }

  async preflight(mutation: ResourceMutation): Promise<PreparedPhysicalMutation> {
    const resolved =
      mutation.kind === "put"
        ? await resolveCreateTarget(this.binding, mutation.ref as PhysicalResourceRef, this.fs)
        : await resolveExistingResource(this.binding, mutation.ref as PhysicalResourceRef, this.fs);
    return {
      ref: this.toPersistentFileRef(resolved.canonicalRef),
      operation: mutation.kind,
      absolutePath: resolved.canonicalPath,
    };
  }

  async readBefore(prepared: PreparedPhysicalMutation): Promise<ResourceBeforeState> {
    try {
      return {
        existed: true,
        bytes: Uint8Array.from(await this.fs.readFile(prepared.absolutePath)),
      };
    } catch (error) {
      if (isErrno(error, "ENOENT")) return { existed: false };
      throw error;
    }
  }

  async putWhole(prepared: PreparedPhysicalMutation, bytes: Uint8Array): Promise<void> {
    const pathApi = this.binding.platform === "win32" ? path.win32 : path.posix;
    const parent = pathApi.dirname(prepared.absolutePath);
    await this.fs.mkdir(parent, { recursive: true });
    const temporary = pathApi.join(
      parent,
      `.${pathApi.basename(prepared.absolutePath)}.brain-${process.pid}-${randomUUID()}.tmp`,
    );
    try {
      await this.fs.writeFileExclusive(temporary, bytes);
      await this.fs.rename(temporary, prepared.absolutePath);
    } catch (error) {
      try {
        await this.fs.unlink(temporary);
      } catch (cleanupError) {
        if (!isErrno(cleanupError, "ENOENT")) {
          // The original mutation error remains the operation result; temp residue is internal/non-public state.
        }
      }
      throw error;
    }
  }

  async deleteFile(prepared: PreparedPhysicalMutation): Promise<void> {
    await this.fs.unlink(prepared.absolutePath);
  }

  async restoreBefore(
    prepared: PreparedPhysicalMutation,
    before: ResourceBeforeState,
  ): Promise<void> {
    if (before.existed) {
      await this.putWhole(prepared, before.bytes);
      return;
    }
    try {
      await this.fs.unlink(prepared.absolutePath);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
  }
  private toPersistentFileRef(ref: PhysicalResourceRef): PersistentFileRef {
    if (ref.kind === "scope-state") return { kind: "scope-state", scope: ref.scope };
    if (ref.kind === "companion") return { kind: "companion", item: ref.item };
    if (ref.path.kind === "core" || ref.path.kind === "archival") {
      return { kind: "public", path: ref.path };
    }
    throw new PersistentStateInvariantError("malformed-persistent-state");
  }

  private async readOptional(ref: PersistentFileRef): Promise<Uint8Array | undefined> {
    try {
      const resolved = await resolveExistingResource(
        this.binding,
        ref as PhysicalResourceRef,
        this.fs,
      );
      return Uint8Array.from(await this.fs.readFile(resolved.canonicalPath));
    } catch (error) {
      if (error instanceof StorageNotFoundError) return undefined;
      throw error;
    }
  }
}

export function persistentCoreRef(scope: ScopeRef): PersistentFileRef {
  return { kind: "public", path: corePath(scope) };
}

export function persistentScopeStateRef(scope: ScopeRef): PersistentFileRef {
  return scopeStateRef(scope);
}

export function persistentArchivalRef(item: LogicalArchivalPath): PersistentFileRef {
  return { kind: "public", path: item };
}

export function persistentCompanionRef(item: LogicalArchivalPath): PersistentFileRef {
  return companionRef(item) as PersistentFileRef;
}

export function projectedPersistentPath(binding: StorageBinding, ref: PersistentFileRef): string {
  return projectPhysicalResource(binding, ref as PhysicalResourceRef).absolutePath;
}
