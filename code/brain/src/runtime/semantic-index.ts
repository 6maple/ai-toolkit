import { createHash } from "node:crypto";
import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { deriveEpistemicStatus } from "../brain/epistemic.ts";
import {
  COGNITIVE_ROLES,
  parsePublicPath,
  type CognitiveRole,
  type LogicalArchivalPath,
  type ScopeRef,
} from "../brain/namespace.ts";
import { hashMarkdownContent } from "../persistence/codecs.ts";
import { CognitionStateStore } from "../persistence/cognition-state-store.ts";
import { listProjectMetadata } from "../persistence/project-mapping.ts";
import {
  createStorageBinding,
  parseProjectId,
  projectPhysicalResource,
  scopeRoot,
  type ProjectId,
  type StorageBinding,
} from "../persistence/storage.ts";
import {
  classifySemanticWatchPath,
  SemanticPendingStore,
  type SemanticPendingMarker,
} from "./semantic-pending.ts";
import {
  SEMANTIC_DIMENSION,
  type EmbeddingPort,
  semanticRuntimePaths,
} from "./semantic-runtime.ts";

const INDEX_SCHEMA_VERSION = "4";
const RECONCILE_INTERVAL_MS = 60_000;
const WATCH_DEBOUNCE_MS = 2_000;
const EMBEDDING_BATCH_SIZE = 64;

const SEMANTIC_DEBUG = process.env.BRAIN_SEMANTIC_DEBUG === "1";
function semanticDebug(event: string, detail: Record<string, unknown> = {}): void {
  if (!SEMANTIC_DEBUG) return;
  console.error("brain semantic debug " + JSON.stringify({ event, pid: process.pid, ...detail }));
}

export interface SemanticIndexEntry {
  readonly key: string;
  readonly scopeKind: "global" | "project";
  readonly projectId?: string;
  readonly role: CognitiveRole;
  readonly relativePath: string;
  readonly description: string;
  readonly summary: string;
  readonly status?: "questioned";
  readonly embedding: Float32Array;
}

export interface SemanticFileMetadata {
  readonly exists: boolean;
  readonly symbolicLink: boolean;
  readonly mtimeMs: number;
  readonly size: number;
}

export interface SemanticCatalogMetadata {
  readonly contentMtimeMs: number;
  readonly contentSize: number;
  readonly stateMtimeMs: number;
  readonly stateSize: number;
  readonly embeddingPresent: boolean;
}

export type SemanticCatalogDecision = "unchanged" | "refresh" | "remove";

interface ExistingMetadata {
  readonly summaryHash: string;
  readonly contentMtimeMs: number;
  readonly contentSize: number;
  readonly stateMtimeMs: number;
  readonly stateSize: number;
  readonly embedding: Uint8Array | null;
}

interface CatalogRow extends SemanticCatalogMetadata {
  readonly key: string;
  readonly scopeKind: "global" | "project";
  readonly projectId?: string;
  readonly role: CognitiveRole;
  readonly relativePath: string;
  readonly summaryHash: string;
}

interface ReconcileStats {
  known: number;
  unchanged: number;
  refreshed: number;
  removed: number;
  discovered: number;
  formalDiscoveryScopes: number;
}

interface PendingRow {
  readonly key: string;
  readonly scopeKind: "global" | "project";
  readonly projectId?: string;
  readonly role: CognitiveRole;
  readonly relativePath: string;
  readonly description: string;
  readonly summary: string;
  readonly summaryHash: string;
  readonly status?: "questioned";
  readonly contentHash: string;
  readonly contentMtimeMs: number;
  readonly contentSize: number;
  readonly stateMtimeMs: number;
  readonly stateSize: number;
  embedding?: Float32Array;
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function summaryHash(summary: string): string {
  return createHash("sha256").update(summary, "utf8").digest("hex");
}

function keyFor(binding: StorageBinding, item: LogicalArchivalPath): string {
  const suffix = item.role + "/" + item.itemSegments.join("/");
  switch (item.scope.kind) {
    case "global":
      return "global|" + suffix;
    case "project":
      return "project|" + binding.projectId + "|" + suffix;
  }
}

function itemRelativePath(item: LogicalArchivalPath): string {
  return item.itemSegments.join("/");
}

function blobFromVector(vector: Float32Array): Uint8Array {
  return Uint8Array.from(new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength));
}

function vectorFromBlob(value: Uint8Array): Float32Array {
  const bytes = Uint8Array.from(value);
  if (bytes.byteLength !== SEMANTIC_DIMENSION * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error("semantic index vector has invalid dimension");
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, SEMANTIC_DIMENSION);
}

async function fileMetadata(
  target: string,
  detectSymbolicLink = false,
): Promise<SemanticFileMetadata> {
  try {
    const value = detectSymbolicLink ? await lstat(target) : await stat(target);
    return {
      exists: true,
      symbolicLink: detectSymbolicLink && value.isSymbolicLink(),
      mtimeMs: value.mtimeMs,
      size: value.size,
    };
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return { exists: false, symbolicLink: false, mtimeMs: 0, size: 0 };
    }
    throw error;
  }
}

export function decideSemanticCatalogRow(
  existing: SemanticCatalogMetadata,
  content: SemanticFileMetadata,
  state: SemanticFileMetadata,
): SemanticCatalogDecision {
  if (!content.exists) return "remove";
  if (content.symbolicLink || state.symbolicLink) return "refresh";
  if (
    existing.embeddingPresent &&
    existing.contentMtimeMs === content.mtimeMs &&
    existing.contentSize === content.size &&
    existing.stateMtimeMs === state.mtimeMs &&
    existing.stateSize === state.size
  ) {
    return "unchanged";
  }
  return "refresh";
}

function pendingRelativePath(
  brainRoot: string,
  binding: StorageBinding,
  item: LogicalArchivalPath,
): string {
  const resource = projectPhysicalResource(binding, { kind: "public", path: item });
  return path.relative(brainRoot, resource.absolutePath).replaceAll("\\", "/");
}

function scopePrefix(scope: ScopeRef): string {
  switch (scope.kind) {
    case "global":
      return "@global";
    case "project":
      return "@project";
  }
}

function semanticKeyPrefix(binding: StorageBinding, scope: ScopeRef): string {
  switch (scope.kind) {
    case "global":
      return "global|";
    case "project":
      return "project|" + binding.projectId + "|";
  }
}

async function scanPhysicalArchivalCandidates(
  binding: StorageBinding,
  scope: ScopeRef,
): Promise<{
  readonly paths: readonly LogicalArchivalPath[];
  readonly requiresFormalDiscovery: boolean;
}> {
  const root = scopeRoot(binding, scope);
  const memoriesRoot = path.join(root, "memories");

  for (const target of [root, memoriesRoot]) {
    try {
      const value = await lstat(target);
      if (value.isSymbolicLink()) {
        return { paths: [], requiresFormalDiscovery: true };
      }
    } catch (error) {
      if (isErrno(error, "ENOENT")) return { paths: [], requiresFormalDiscovery: false };
      return { paths: [], requiresFormalDiscovery: true };
    }
  }

  const found: LogicalArchivalPath[] = [];
  let requiresFormalDiscovery = false;

  const visit = async (
    role: CognitiveRole,
    directory: string,
    relativeSegments: readonly string[],
  ): Promise<void> => {
    if (requiresFormalDiscovery) return;

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isErrno(error, "ENOENT")) return;
      requiresFormalDiscovery = true;
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        if (entry.name.endsWith(".md") && entry.name !== ".md") {
          const raw =
            scopePrefix(scope) +
            "/memories/" +
            role +
            "/" +
            [...relativeSegments, entry.name].join("/");
          try {
            const parsed = parsePublicPath(raw);
            if (parsed.kind === "archival") found.push(parsed);
          } catch {
            // Invalid public-path names are not Brain cognition candidates.
          }
          continue;
        }
        requiresFormalDiscovery = true;
        return;
      }

      if (entry.isDirectory()) {
        await visit(role, path.join(directory, entry.name), [...relativeSegments, entry.name]);
        if (requiresFormalDiscovery) return;
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === ".md") continue;
      const raw =
        scopePrefix(scope) +
        "/memories/" +
        role +
        "/" +
        [...relativeSegments, entry.name].join("/");
      try {
        const parsed = parsePublicPath(raw);
        if (parsed.kind === "archival") found.push(parsed);
      } catch {
        // Invalid public-path names are not Brain cognition candidates.
      }
    }
  };

  for (const role of COGNITIVE_ROLES) {
    const roleRoot = path.join(memoriesRoot, role);
    try {
      const value = await lstat(roleRoot);
      if (value.isSymbolicLink() || !value.isDirectory()) {
        return { paths: [], requiresFormalDiscovery: true };
      }
    } catch (error) {
      if (isErrno(error, "ENOENT")) continue;
      return { paths: [], requiresFormalDiscovery: true };
    }
    await visit(role, roleRoot, []);
    if (requiresFormalDiscovery) {
      return { paths: [], requiresFormalDiscovery: true };
    }
  }

  return {
    paths: found.sort((a, b) => {
      const left = keyFor(binding, a);
      const right = keyFor(binding, b);
      return left < right ? -1 : left > right ? 1 : 0;
    }),
    requiresFormalDiscovery: false,
  };
}

export class SemanticIndex {
  private readonly paths;
  private readonly pending: SemanticPendingStore;
  private readonly db: DatabaseSync;
  private readonly projectBindings = new Map<ProjectId, Promise<StorageBinding>>();
  private watcher: FSWatcher | undefined;
  private watcherReliable = true;
  private interval: NodeJS.Timeout | undefined;
  private maintenancePromise: Promise<void> | undefined;
  private debounce: NodeJS.Timeout | undefined;

  constructor(
    private readonly brainRoot: string,
    private readonly seedBinding: StorageBinding,
    private readonly embeddings: EmbeddingPort,
  ) {
    this.paths = semanticRuntimePaths(brainRoot);
    this.pending = new SemanticPendingStore(this.paths.pendingDirectory);
    mkdirSync(this.paths.root, { recursive: true });
    let sqlite: typeof import("node:sqlite");
    try {
      sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    } catch (error) {
      throw new Error("semantic search requires a Node runtime with node:sqlite support", {
        cause: error,
      });
    }
    this.db = new sqlite.DatabaseSync(this.paths.database);
    this.configureDatabase();
  }

  async initialize(): Promise<void> {
    const startedAt = Date.now();
    semanticDebug("index.initialize.start", { brainRoot: this.brainRoot });
    this.startWatcher();
    semanticDebug("index.initialize.watcher-started", { elapsedMs: Date.now() - startedAt });
    await this.reconcile();
    semanticDebug("index.initialize.reconcile-done", { elapsedMs: Date.now() - startedAt });
    await this.ensureFresh();
    semanticDebug("index.initialize.ensure-fresh-done", { elapsedMs: Date.now() - startedAt });
    this.interval = setInterval(() => {
      void this.reconcileKnownCatalog().catch((error) => {
        console.error("brain semantic reconciliation failed", error);
      });
    }, RECONCILE_INTERVAL_MS);
    this.interval.unref();
  }

  close(): void {
    if (this.debounce !== undefined) clearTimeout(this.debounce);
    if (this.interval !== undefined) clearInterval(this.interval);
    this.watcher?.close();
    this.db.close();
  }

  async ensureFresh(): Promise<void> {
    const startedAt = Date.now();
    semanticDebug("index.ensure-fresh.start", { watcherReliable: this.watcherReliable });
    if (!this.watcherReliable) {
      await this.reconcile();
      semanticDebug("index.ensure-fresh.end", {
        mode: "reconcile",
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }
    await this.flushPending();
    semanticDebug("index.ensure-fresh.end", {
      mode: "pending",
      elapsedMs: Date.now() - startedAt,
    });
  }

  async refreshPath(binding: StorageBinding, item: LogicalArchivalPath): Promise<void> {
    try {
      await this.runMaintenance(() => this.refreshOne(binding, item));
    } catch (error) {
      try {
        await this.pending.record({
          kind: "path",
          relativePath: pendingRelativePath(this.brainRoot, binding, item),
        });
      } catch {
        // The mutation remains committed in Markdown; periodic reconciliation is
        // still a recovery path when persisting the pending marker also fails.
      }
      throw error;
    }
  }

  listEligible(input: {
    readonly currentProjectId: string;
    readonly relatedProjectIds?: readonly string[];
  }): readonly SemanticIndexEntry[] {
    const projectIds = [
      input.currentProjectId,
      ...(input.relatedProjectIds ?? []).filter((id) => id !== input.currentProjectId),
    ];
    const projectPlaceholders = projectIds.map(() => "?").join(",");
    const clauses = [
      "scope_kind = 'global'",
      "(scope_kind = 'project' AND project_id IN (" + projectPlaceholders + "))",
    ];
    const sql = [
      "SELECT cognition_key, scope_kind, project_id, role, relative_path, description, summary, status, embedding",
      "FROM cognitions",
      "WHERE " + clauses.join(" OR "),
      "ORDER BY cognition_key",
    ].join("\n");
    const rows = this.db.prepare(sql).all(...projectIds) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      key: String(row.cognition_key),
      scopeKind: row.scope_kind as SemanticIndexEntry["scopeKind"],
      ...(typeof row.project_id === "string" ? { projectId: row.project_id } : {}),
      role: row.role as CognitiveRole,
      relativePath: String(row.relative_path),
      description: String(row.description),
      summary: String(row.summary),
      ...(row.status === "questioned" ? { status: "questioned" as const } : {}),
      embedding: vectorFromBlob(row.embedding as Uint8Array),
    }));
  }

  async reconcile(): Promise<void> {
    await this.runReconcile({ discoverUnknown: true, clearPendingMarkers: true });
  }

  private async reconcileKnownCatalog(): Promise<void> {
    await this.runReconcile({ discoverUnknown: false, clearPendingMarkers: false });
  }

  private async runReconcile(options: {
    readonly discoverUnknown: boolean;
    readonly clearPendingMarkers: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    semanticDebug("index.reconcile.start", options);
    try {
      await this.runMaintenance(() => this.performReconcile(options));
      semanticDebug("index.reconcile.end", {
        ...options,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      semanticDebug("index.reconcile.error", {
        ...options,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        await this.pending.record({ kind: "full" });
      } catch {
        // A failed reconciliation already prevents this call from claiming freshness.
      }
      throw error;
    }
  }

  private async flushPending(): Promise<void> {
    const startedAt = Date.now();
    semanticDebug("index.flush-pending.start");
    await this.runMaintenance(async () => {
      for (;;) {
        const markers = await this.pending.list();
        semanticDebug("index.flush-pending.markers", { count: markers.length });
        if (markers.length === 0) return;

        if (markers.some((marker) => marker.change.kind === "full")) {
          await this.performReconcile({
            discoverUnknown: true,
            clearPendingMarkers: true,
          });
          continue;
        }

        const byPath = new Map<string, SemanticPendingMarker[]>();
        for (const marker of markers) {
          if (marker.change.kind !== "path") continue;
          const existing = byPath.get(marker.change.relativePath);
          if (existing === undefined) {
            byPath.set(marker.change.relativePath, [marker]);
          } else {
            existing.push(marker);
          }
        }

        for (const [relativePath, pathMarkers] of byPath) {
          const target = await this.resolvePendingTarget(relativePath);
          if (target === undefined) {
            await this.performReconcile({
              discoverUnknown: true,
              clearPendingMarkers: true,
            });
            break;
          }
          await this.refreshOne(target.binding, target.item);
          await this.pending.clear(pathMarkers.map((marker) => marker.filename));
        }
      }
    });
    semanticDebug("index.flush-pending.end", { elapsedMs: Date.now() - startedAt });
  }

  private async runMaintenance(operation: () => Promise<void>): Promise<void> {
    const previous = this.maintenancePromise;
    const current = (async () => {
      if (previous !== undefined) {
        try {
          await previous;
        } catch {
          // The previous caller already receives that failure. A queued freshness
          // operation must still get its own chance to repair/retry.
        }
      }
      await operation();
    })();
    this.maintenancePromise = current;
    try {
      await current;
    } finally {
      if (this.maintenancePromise === current) this.maintenancePromise = undefined;
    }
  }

  private configureDatabase(): void {
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec([
      "CREATE TABLE IF NOT EXISTS meta (",
      "  key TEXT PRIMARY KEY,",
      "  value TEXT NOT NULL",
      ");",
    ].join("\n"));

    const schema = this.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as
      | { value?: unknown }
      | undefined;
    const fingerprint = this.db
      .prepare("SELECT value FROM meta WHERE key='embedding_fingerprint'")
      .get() as { value?: unknown } | undefined;
    const rebuild =
      schema?.value !== INDEX_SCHEMA_VERSION ||
      fingerprint?.value !== this.embeddings.fingerprint;
    if (rebuild) this.db.exec("DROP TABLE IF EXISTS cognitions");

    this.db.exec([
      "CREATE TABLE IF NOT EXISTS cognitions (",
      "  cognition_key TEXT PRIMARY KEY,",
      "  scope_kind TEXT NOT NULL,",
      "  project_id TEXT,",
      "  role TEXT NOT NULL,",
      "  relative_path TEXT NOT NULL,",
      "  description TEXT NOT NULL,",
      "  summary TEXT NOT NULL,",
      "  summary_hash TEXT NOT NULL,",
      "  status TEXT,",
      "  content_hash TEXT NOT NULL,",
      "  content_mtime_ms REAL NOT NULL,",
      "  content_size INTEGER NOT NULL,",
      "  state_mtime_ms REAL NOT NULL,",
      "  state_size INTEGER NOT NULL,",
      "  embedding BLOB NOT NULL",
      ");",
      "CREATE INDEX IF NOT EXISTS cognitions_scope_idx",
      "  ON cognitions(scope_kind, project_id);",
    ].join("\n"));

    if (rebuild) {
      const upsert = this.db.prepare(
        "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      );
      upsert.run("schema_version", INDEX_SCHEMA_VERSION);
      upsert.run("embedding_fingerprint", this.embeddings.fingerprint);
    }
  }

  private startWatcher(): void {
    try {
      this.watcher = watch(
        this.brainRoot,
        { recursive: true },
        (_event, filename) => {
          const change = classifySemanticWatchPath(
            typeof filename === "string" ? filename : null,
          );
          if (change === undefined) return;
          void this.pending
            .record(change)
            .then(() => this.schedulePendingFlush())
            .catch((error) => this.degradeWatcher(error));
        },
      );
      this.watcher.on("error", (error) => this.degradeWatcher(error));
    } catch (error) {
      this.degradeWatcher(error);
    }
  }

  private schedulePendingFlush(): void {
    if (!this.watcherReliable) return;
    if (this.debounce !== undefined) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = undefined;
      void this.flushPending().catch((error) => {
        console.error("brain semantic watcher sync failed", error);
      });
    }, WATCH_DEBOUNCE_MS);
    this.debounce.unref();
  }

  private degradeWatcher(error: unknown): void {
    if (!this.watcherReliable) return;
    this.watcherReliable = false;
    if (this.debounce !== undefined) {
      clearTimeout(this.debounce);
      this.debounce = undefined;
    }
    this.watcher?.close();
    this.watcher = undefined;
    console.error(
      "brain semantic watcher disabled; ask_search will reconcile before each query",
      error,
    );
    void this.pending.record({ kind: "full" }).catch(() => {
      // watcherReliable=false already forces query-time reconciliation.
    });
  }

  private async performReconcile(options: {
    readonly discoverUnknown: boolean;
    readonly clearPendingMarkers: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    const markersAtStart = options.clearPendingMarkers ? await this.pending.list() : [];
    const pending: PendingRow[] = [];
    const removed = new Set<string>();
    const catalogRows = this.catalogRows();
    const activeKeys = new Set(catalogRows.map((row) => row.key));
    const stats: ReconcileStats = {
      known: catalogRows.length,
      unchanged: 0,
      refreshed: 0,
      removed: 0,
      discovered: 0,
      formalDiscoveryScopes: 0,
    };

    semanticDebug("index.perform-reconcile.start", {
      ...options,
      pendingMarkers: markersAtStart.length,
      catalogRows: catalogRows.length,
    });

    await this.collectKnownCatalogRows(catalogRows, pending, removed, activeKeys, stats);
    if (options.discoverUnknown) {
      await this.collectUnknownCandidates(pending, removed, activeKeys, stats);
    }

    const needsEmbedding = pending.filter((row) => row.embedding === undefined);
    semanticDebug("index.perform-reconcile.collected", {
      ...stats,
      changed: pending.length,
      needsEmbedding: needsEmbedding.length,
      elapsedMs: Date.now() - startedAt,
    });
    for (let offset = 0; offset < needsEmbedding.length; offset += EMBEDDING_BATCH_SIZE) {
      const batch = needsEmbedding.slice(offset, offset + EMBEDDING_BATCH_SIZE);
      const vectors = await this.embeddings.embed(batch.map((row) => row.summary));
      if (vectors.length !== batch.length) {
        throw new Error("embedding runtime returned wrong batch size");
      }
      for (let index = 0; index < batch.length; index += 1) {
        batch[index]!.embedding = vectors[index]!;
      }
    }

    const upsertSql = [
      "INSERT INTO cognitions (",
      "  cognition_key, scope_kind, project_id, role, relative_path,",
      "  description, summary, summary_hash, status, content_hash,",
      "  content_mtime_ms, content_size, state_mtime_ms, state_size, embedding",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "ON CONFLICT(cognition_key) DO UPDATE SET",
      "  scope_kind=excluded.scope_kind,",
      "  project_id=excluded.project_id,",
      "  role=excluded.role,",
      "  relative_path=excluded.relative_path,",
      "  description=excluded.description,",
      "  summary=excluded.summary,",
      "  summary_hash=excluded.summary_hash,",
      "  status=excluded.status,",
      "  content_hash=excluded.content_hash,",
      "  content_mtime_ms=excluded.content_mtime_ms,",
      "  content_size=excluded.content_size,",
      "  state_mtime_ms=excluded.state_mtime_ms,",
      "  state_size=excluded.state_size,",
      "  embedding=excluded.embedding",
    ].join("\n");
    const upsert = this.db.prepare(upsertSql);
    const remove = this.db.prepare("DELETE FROM cognitions WHERE cognition_key=?");

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of pending) {
        if (row.embedding === undefined) throw new Error("missing semantic embedding");
        upsert.run(
          row.key,
          row.scopeKind,
          row.projectId ?? null,
          row.role,
          row.relativePath,
          row.description,
          row.summary,
          row.summaryHash,
          row.status ?? null,
          row.contentHash,
          row.contentMtimeMs,
          row.contentSize,
          row.stateMtimeMs,
          row.stateSize,
          blobFromVector(row.embedding),
        );
      }
      for (const key of removed) remove.run(key);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    if (options.clearPendingMarkers) {
      await this.pending.clear(markersAtStart.map((marker) => marker.filename));
    }
    semanticDebug("index.perform-reconcile.end", {
      ...options,
      ...stats,
      changed: pending.length,
      elapsedMs: Date.now() - startedAt,
    });
  }

  private async resolvePendingTarget(
    relativePath: string,
  ): Promise<{ readonly binding: StorageBinding; readonly item: LogicalArchivalPath } | undefined> {
    const parts = relativePath.replaceAll("\\", "/").split("/");
    try {
      if (parts[0] === "global" && parts[1] === "memories" && parts.length >= 4) {
        const parsed = parsePublicPath("@global/" + parts.slice(1).join("/"));
        return parsed.kind === "archival"
          ? { binding: this.seedBinding, item: parsed }
          : undefined;
      }

      if (parts[0] !== "projects" || parts.length < 5) return undefined;
      const projectId = parseProjectId(parts[1]!);
      const binding = await this.bindingForProject(projectId);

      if (parts[2] === "memories") {
        const parsed = parsePublicPath("@project/" + parts.slice(2).join("/"));
        return parsed.kind === "archival" ? { binding, item: parsed } : undefined;
      }

    } catch {
      return undefined;
    }
    return undefined;
  }

  private async bindingForProject(projectId: ProjectId): Promise<StorageBinding> {
    if (projectId === this.seedBinding.projectId) return this.seedBinding;
    let binding = this.projectBindings.get(projectId);
    if (binding === undefined) {
      binding = createStorageBinding({ brainRoot: this.brainRoot, projectId });
      this.projectBindings.set(projectId, binding);
    }
    try {
      return await binding;
    } catch (error) {
      this.projectBindings.delete(projectId);
      throw error;
    }
  }

  private catalogRows(): readonly CatalogRow[] {
    const records = this.db
      .prepare(
        [
          "SELECT cognition_key, scope_kind, project_id, role, relative_path,",
          "       summary_hash, content_mtime_ms, content_size, state_mtime_ms, state_size,",
          "       CASE WHEN embedding IS NULL THEN 0 ELSE 1 END AS embedding_present",
          "FROM cognitions",
          "ORDER BY cognition_key",
        ].join("\n"),
      )
      .all() as Array<Record<string, unknown>>;

    return records.map((record) => {
      const scopeKind = String(record.scope_kind);
      if (scopeKind !== "global" && scopeKind !== "project") {
        throw new Error("semantic index catalog row has invalid scope");
      }
      return {
        key: String(record.cognition_key),
        scopeKind,
        ...(typeof record.project_id === "string" ? { projectId: record.project_id } : {}),
        role: record.role as CognitiveRole,
        relativePath: String(record.relative_path),
        summaryHash: String(record.summary_hash),
        contentMtimeMs: Number(record.content_mtime_ms),
        contentSize: Number(record.content_size),
        stateMtimeMs: Number(record.state_mtime_ms),
        stateSize: Number(record.state_size),
        embeddingPresent: Number(record.embedding_present) === 1,
      };
    });
  }

  private async catalogTarget(
    row: CatalogRow,
  ): Promise<{ readonly binding: StorageBinding; readonly item: LogicalArchivalPath }> {
    let binding: StorageBinding;
    let prefix: string;

    switch (row.scopeKind) {
      case "global":
        binding = this.seedBinding;
        prefix = "@global";
        break;
      case "project": {
        if (row.projectId === undefined) throw new Error("semantic project row is missing project id");
        binding = await this.bindingForProject(parseProjectId(row.projectId));
        prefix = "@project";
        break;
      }
    }

    const parsed = parsePublicPath(
      prefix + "/memories/" + row.role + "/" + row.relativePath,
    );
    if (parsed.kind !== "archival" || keyFor(binding, parsed) !== row.key) {
      throw new Error("semantic index catalog row has invalid path identity");
    }
    return { binding, item: parsed };
  }

  private existingMetadata(row: CatalogRow): ExistingMetadata {
    const record = this.db
      .prepare("SELECT embedding FROM cognitions WHERE cognition_key=?")
      .get(row.key) as { embedding?: unknown } | undefined;
    return {
      summaryHash: row.summaryHash,
      contentMtimeMs: row.contentMtimeMs,
      contentSize: row.contentSize,
      stateMtimeMs: row.stateMtimeMs,
      stateSize: row.stateSize,
      embedding:
        record?.embedding === null || record?.embedding === undefined
          ? null
          : (record.embedding as Uint8Array),
    };
  }

  private async collectKnownCatalogRows(
    rows: readonly CatalogRow[],
    pending: PendingRow[],
    removed: Set<string>,
    activeKeys: Set<string>,
    stats: ReconcileStats,
  ): Promise<void> {
    const startedAt = Date.now();
    let metadataElapsedMs = 0;
    let snapshotElapsedMs = 0;

    for (const row of rows) {
      let target: { readonly binding: StorageBinding; readonly item: LogicalArchivalPath };
      try {
        target = await this.catalogTarget(row);
      } catch {
        removed.add(row.key);
        activeKeys.delete(row.key);
        stats.removed += 1;
        continue;
      }

      const documentResource = projectPhysicalResource(target.binding, {
        kind: "public",
        path: target.item,
      });
      const companionResource = projectPhysicalResource(target.binding, {
        kind: "companion",
        item: target.item,
      });
      const metadataStartedAt = Date.now();
      const [contentMeta, stateMeta] = await Promise.all([
        fileMetadata(documentResource.absolutePath, true),
        fileMetadata(companionResource.absolutePath),
      ]);
      metadataElapsedMs += Date.now() - metadataStartedAt;

      const decision = decideSemanticCatalogRow(row, contentMeta, stateMeta);
      if (decision === "unchanged") {
        stats.unchanged += 1;
        continue;
      }
      if (decision === "remove") {
        removed.add(row.key);
        activeKeys.delete(row.key);
        stats.removed += 1;
        continue;
      }

      const snapshotStartedAt = Date.now();
      const next = await this.pendingRowForItem(
        target.binding,
        target.item,
        this.existingMetadata(row),
        contentMeta,
        stateMeta,
      );
      snapshotElapsedMs += Date.now() - snapshotStartedAt;
      if (next === undefined) {
        removed.add(row.key);
        activeKeys.delete(row.key);
        stats.removed += 1;
        continue;
      }

      if (next.key !== row.key) {
        removed.add(row.key);
        activeKeys.delete(row.key);
      }
      removed.delete(next.key);
      activeKeys.add(next.key);
      pending.push(next);
      stats.refreshed += 1;
    }

    semanticDebug("index.perform-reconcile.known", {
      count: rows.length,
      unchanged: stats.unchanged,
      refreshed: stats.refreshed,
      removed: stats.removed,
      metadataElapsedMs,
      snapshotElapsedMs,
      elapsedMs: Date.now() - startedAt,
    });
  }

  private async collectUnknownCandidates(
    pending: PendingRow[],
    removed: Set<string>,
    activeKeys: Set<string>,
    stats: ReconcileStats,
  ): Promise<void> {
    const startedAt = Date.now();

    await this.collectUnknownScope(
      this.seedBinding,
      { kind: "global" },
      pending,
      removed,
      activeKeys,
      stats,
    );

    const projects = await listProjectMetadata(this.brainRoot);
    for (const project of projects) {
      const binding = await this.bindingForProject(project.projectId);
      await this.collectUnknownScope(
        binding,
        { kind: "project" },
        pending,
        removed,
        activeKeys,
        stats,
      );
    }

    semanticDebug("index.perform-reconcile.unknown", {
      discovered: stats.discovered,
      formalDiscoveryScopes: stats.formalDiscoveryScopes,
      elapsedMs: Date.now() - startedAt,
    });
  }

  private async collectUnknownScope(
    binding: StorageBinding,
    scope: ScopeRef,
    pending: PendingRow[],
    removed: Set<string>,
    activeKeys: Set<string>,
    stats: ReconcileStats,
  ): Promise<void> {
    const scan = await scanPhysicalArchivalCandidates(binding, scope);
    const store = new CognitionStateStore(binding);
    let candidates = scan.paths;
    if (scan.requiresFormalDiscovery) {
      const listing = await store.listActiveArchivalPaths(scope);
      candidates = listing.paths;
      stats.formalDiscoveryScopes += 1;

      const authoritativeKeys = new Set(candidates.map((item) => keyFor(binding, item)));
      const prefix = semanticKeyPrefix(binding, scope);
      for (const key of [...activeKeys]) {
        if (!key.startsWith(prefix) || authoritativeKeys.has(key)) continue;
        if (!removed.has(key)) stats.removed += 1;
        removed.add(key);
        activeKeys.delete(key);
      }
    }

    for (const candidate of candidates) {
      if (activeKeys.has(keyFor(binding, candidate))) continue;

      let item = candidate;
      if (!scan.requiresFormalDiscovery) {
        try {
          const resolved = await store.resolveExisting(candidate);
          if (resolved.path.kind !== "archival") continue;
          item = resolved.path;
        } catch {
          continue;
        }
      }

      const key = keyFor(binding, item);
      if (activeKeys.has(key)) continue;

      const next = await this.pendingRowForItem(binding, item);
      if (next === undefined || activeKeys.has(next.key)) continue;

      removed.delete(next.key);
      activeKeys.add(next.key);
      pending.push(next);
      stats.discovered += 1;
    }
  }

  private async pendingRowForItem(
    binding: StorageBinding,
    item: LogicalArchivalPath,
    existing?: ExistingMetadata,
    observedContent?: SemanticFileMetadata,
    observedState?: SemanticFileMetadata,
  ): Promise<PendingRow | undefined> {
    const store = new CognitionStateStore(binding);
    const snapshot = await store.loadArchival(item);
    if (snapshot === undefined) return undefined;

    const canonicalItem = snapshot.path;
    const sameIdentity = keyFor(binding, canonicalItem) === keyFor(binding, item);
    const documentResource = projectPhysicalResource(binding, {
      kind: "public",
      path: canonicalItem,
    });
    const companionResource = projectPhysicalResource(binding, {
      kind: "companion",
      item: canonicalItem,
    });
    const [contentMeta, stateMeta] =
      sameIdentity &&
      observedContent !== undefined &&
      observedState !== undefined &&
      !observedContent.symbolicLink &&
      !observedState.symbolicLink
        ? [observedContent, observedState]
        : await Promise.all([
            fileMetadata(documentResource.absolutePath, true),
            fileMetadata(companionResource.absolutePath),
          ]);
    if (!contentMeta.exists) return undefined;

    const summary = snapshot.document.summary;
    if (summary === undefined) return undefined;
    const nextSummaryHash = summaryHash(summary);
    const status = deriveEpistemicStatus(snapshot.epistemic);
    return {
      key: keyFor(binding, canonicalItem),
      scopeKind: canonicalItem.scope.kind,
      ...(canonicalItem.scope.kind === "global" ? {} : { projectId: binding.projectId }),
      role: canonicalItem.role,
      relativePath: itemRelativePath(canonicalItem),
      description: snapshot.document.description,
      summary,
      summaryHash: nextSummaryHash,
      ...(status === "questioned" ? { status: "questioned" } : {}),
      contentHash: hashMarkdownContent(snapshot.document.text),
      contentMtimeMs: contentMeta.mtimeMs,
      contentSize: contentMeta.size,
      stateMtimeMs: stateMeta.mtimeMs,
      stateSize: stateMeta.size,
      ...(existing !== undefined &&
      existing.summaryHash === nextSummaryHash &&
      existing.embedding !== null
        ? { embedding: vectorFromBlob(existing.embedding) }
        : {}),
    };
  }

  private async refreshOne(binding: StorageBinding, item: LogicalArchivalPath): Promise<void> {
    const requestedKey = keyFor(binding, item);
    const store = new CognitionStateStore(binding);
    const snapshot = await store.loadArchival(item);
    if (snapshot === undefined) {
      this.db.prepare("DELETE FROM cognitions WHERE cognition_key=?").run(requestedKey);
      return;
    }
    if (snapshot.document.summary === undefined) {
      this.db.prepare("DELETE FROM cognitions WHERE cognition_key=?").run(requestedKey);
      return;
    }

    const key = keyFor(binding, snapshot.path);
    const documentResource = projectPhysicalResource(binding, {
      kind: "public",
      path: snapshot.path,
    });
    const companionResource = projectPhysicalResource(binding, {
      kind: "companion",
      item: snapshot.path,
    });
    const [contentMeta, stateMeta] = await Promise.all([
      fileMetadata(documentResource.absolutePath, true),
      fileMetadata(companionResource.absolutePath),
    ]);
    const nextSummaryHash = summaryHash(snapshot.document.summary);
    const selectPrevious = this.db.prepare(
      "SELECT summary_hash, embedding FROM cognitions WHERE cognition_key=?",
    );
    const previous =
      (selectPrevious.get(key) as { summary_hash?: unknown; embedding?: unknown } | undefined) ??
      (requestedKey === key
        ? undefined
        : (selectPrevious.get(requestedKey) as
            | { summary_hash?: unknown; embedding?: unknown }
            | undefined));
    const embedding =
      previous !== undefined &&
      previous.summary_hash === nextSummaryHash &&
      previous.embedding !== undefined &&
      previous.embedding !== null
        ? vectorFromBlob(previous.embedding as Uint8Array)
        : (await this.embeddings.embed([snapshot.document.summary]))[0];
    if (embedding === undefined) throw new Error("embedding runtime returned no vector");

    const status = deriveEpistemicStatus(snapshot.epistemic);
    const sql = [
      "INSERT INTO cognitions (",
      "  cognition_key, scope_kind, project_id, role, relative_path,",
      "  description, summary, summary_hash, status, content_hash,",
      "  content_mtime_ms, content_size, state_mtime_ms, state_size, embedding",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "ON CONFLICT(cognition_key) DO UPDATE SET",
      "  scope_kind=excluded.scope_kind,",
      "  project_id=excluded.project_id,",
      "  role=excluded.role,",
      "  relative_path=excluded.relative_path,",
      "  description=excluded.description,",
      "  summary=excluded.summary,",
      "  summary_hash=excluded.summary_hash,",
      "  status=excluded.status,",
      "  content_hash=excluded.content_hash,",
      "  content_mtime_ms=excluded.content_mtime_ms,",
      "  content_size=excluded.content_size,",
      "  state_mtime_ms=excluded.state_mtime_ms,",
      "  state_size=excluded.state_size,",
      "  embedding=excluded.embedding",
    ].join("\n");
    const upsert = this.db.prepare(sql);
    const remove = this.db.prepare("DELETE FROM cognitions WHERE cognition_key=?");

    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (requestedKey !== key) remove.run(requestedKey);
      upsert.run(
        key,
        snapshot.path.scope.kind,
        snapshot.path.scope.kind === "global" ? null : binding.projectId,
        snapshot.path.role,
        itemRelativePath(snapshot.path),
        snapshot.document.description,
        snapshot.document.summary,
        nextSummaryHash,
        status === "questioned" ? "questioned" : null,
        hashMarkdownContent(snapshot.document.text),
        contentMeta.mtimeMs,
        contentMeta.size,
        stateMeta.mtimeMs,
        stateMeta.size,
        blobFromVector(embedding),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
