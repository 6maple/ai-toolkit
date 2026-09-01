import {
  applyExactRetrieval,
  projectAccessibility,
  type ScopeCycleState,
} from "../brain/accessibility.ts";
import { PiExecutionError, type PiDiscoveryToolPort } from "../adapters/pi-tools.ts";
import {
  buildCatPageFromPiRead,
  buildScopeDiscoveryNamespace,
  canonicalGrepOrder,
  compilePublicGlob,
  contextForLine,
  directChildren,
  DiscoveryObjectError,
  DiscoveryQueryError,
  grepRecordsFit,
  isArchivalUnderDirectory,
  normalizeCatArguments,
  normalizeGrepArguments,
  packDiscoveryRecords,
  packGrepRecords,
  recordsFit,
  renderCatPage,
  renderDiscoveryRecord,
  renderGrepRecords,
  splitLogicalLines,
  type CatPage,
  type DiscoveryNodeRecord,
  type GrepMatchRecord,
} from "../brain/discovery.ts";
import { deriveEpistemicStatus } from "../brain/epistemic.ts";
import {
  formatPublicPath,
  formatScopePrefix,
  parsePublicPath,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type LogicalDirectory,
  type ScopeRef,
  type SessionId,
} from "../brain/namespace.ts";
import { rankActiveDiscoveryCandidates, type ScarcityCandidate } from "../brain/scarcity.ts";
import type { ArchivalSnapshot } from "../persistence/cognition-state-store.ts";
import { encodeCompanion, hashMarkdownContent } from "../persistence/codecs.ts";
import type {
  AuxiliaryUpdateOutcome,
  AuxiliaryUpdateRequest,
} from "../persistence/operation-coordination.ts";

export interface ReadDiscoveryContext {
  readonly currentSessionId?: SessionId;
  readonly signal?: AbortSignal;
}

export interface DiscoveryDiagnostic {
  readonly kind: "alias-followed" | "entry-skipped";
  readonly path?: LogicalBrainPath;
  readonly message: string;
}

export interface CanonicalDiscoveryRoot {
  readonly requested: LogicalDirectory;
  readonly path: LogicalDirectory;
  readonly aliasFollowed: boolean;
}

export interface ArchivalPathListing {
  readonly paths: readonly LogicalArchivalPath[];
  readonly diagnostics: readonly DiscoveryDiagnostic[];
}

export interface LoadedArchival extends ArchivalSnapshot {
  readonly requestedPath: LogicalArchivalPath;
  readonly path: LogicalArchivalPath;
  readonly aliasFollowed: boolean;
}

export interface ReadDiscoveryStatePort {
  isScopeMaterialized(scope: ScopeRef): Promise<boolean>;
  resolveDiscoveryRoot(path: LogicalDirectory): Promise<CanonicalDiscoveryRoot | undefined>;
  listActiveArchivalPaths(scope: ScopeRef): Promise<ArchivalPathListing>;
  loadArchival(path: LogicalArchivalPath): Promise<LoadedArchival | undefined>;
  readScopeCycle(scope: ScopeRef): Promise<ScopeCycleState>;
}

export interface ReadDiscoveryAuxiliaryPersistencePort {
  putCompanion(path: LogicalArchivalPath, bytes: Uint8Array): Promise<void>;
}

export interface ReadDiscoveryOperationPort {
  tryApplyAuxiliaryUpdate(request: AuxiliaryUpdateRequest): Promise<AuxiliaryUpdateOutcome>;
}

export interface DiscoveryListResult {
  readonly records: readonly DiscoveryNodeRecord[];
  readonly truncated: boolean;
  readonly text: string;
}

export interface GrepResult {
  readonly records: readonly GrepMatchRecord[];
  readonly truncated: boolean;
  readonly text: string;
}

export interface CatResult {
  readonly page: CatPage;
  readonly text: string;
}

export interface GlobRequest {
  readonly pattern: string;
  readonly path?: LogicalBrainPath;
}

export interface GrepRequest {
  readonly pattern: string;
  readonly path?: LogicalBrainPath;
  readonly glob?: string;
  readonly ignoreCase?: boolean;
  readonly literal?: boolean;
  readonly context?: number;
  readonly signal?: AbortSignal;
}

export interface CatRequest {
  readonly path: LogicalBrainPath;
  readonly offset?: number;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

interface EnrichedArchival {
  readonly snapshot: ArchivalSnapshot;
  readonly record: Extract<DiscoveryNodeRecord, { kind: "archival" }>;
  readonly scarcity: ScarcityCandidate<Extract<DiscoveryNodeRecord, { kind: "archival" }>>;
}

function defaultSearchScopes(context: ReadDiscoveryContext): readonly ScopeRef[] {
  return [
    { kind: "global" },
    { kind: "project" },
    ...(context.currentSessionId === undefined
      ? []
      : [{ kind: "session", sessionId: context.currentSessionId } as const]),
  ];
}

function requireDirectory(path: LogicalBrainPath): LogicalDirectory {
  if (path.kind !== "directory") throw new DiscoveryObjectError("wrong-object-kind");
  return path;
}

function comparePath(a: LogicalArchivalPath, b: LogicalArchivalPath): number {
  const ap = formatPublicPath(a);
  const bp = formatPublicPath(b);
  return ap < bp ? -1 : ap > bp ? 1 : 0;
}

function directChildName(path: LogicalBrainPath): string {
  const rendered = formatPublicPath(path).replace(/\/$/, "");
  return rendered.slice(rendered.lastIndexOf("/") + 1);
}

function memoriesRoot(scope: ScopeRef): LogicalDirectory {
  return { kind: "directory", area: "memories-root", scope };
}

function publicArchivalFromScopeRelative(
  scope: ScopeRef,
  relativePath: string,
): LogicalArchivalPath | undefined {
  try {
    const parsed = parsePublicPath(
      `${formatScopePrefix(scope)}/${relativePath.replaceAll("\\", "/").replace(/^\/+/, "")}`,
    );
    return parsed.kind === "archival" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sameAccessibility(
  a: ArchivalSnapshot["accessibility"],
  b: ArchivalSnapshot["accessibility"],
): boolean {
  return (
    a.ageCycles === b.ageCycles &&
    a.anchorCycle === b.anchorCycle &&
    a.durability === b.durability &&
    a.exposure === b.exposure
  );
}

function appendTruncation(text: string, truncated: boolean, affordance: string): string {
  if (!truncated) return text;
  return [text, `truncated=true; ${affordance}`].filter(Boolean).join("\n");
}

export class ReadDiscovery {
  constructor(
    private readonly state: ReadDiscoveryStatePort & ReadDiscoveryAuxiliaryPersistencePort,
    private readonly piTools: PiDiscoveryToolPort,
    private readonly operations: ReadDiscoveryOperationPort,
  ) {}

  async ls(
    path: LogicalBrainPath,
    context: ReadDiscoveryContext = {},
  ): Promise<DiscoveryListResult> {
    context.signal?.throwIfAborted();
    const requested = requireDirectory(path);
    if (!(await this.state.isScopeMaterialized(requested.scope))) {
      throw new DiscoveryObjectError("not-found");
    }
    const resolved = await this.resolveRoot(requested);
    const directory = resolved.path;
    const listing = await this.state.listActiveArchivalPaths(directory.scope);
    context.signal?.throwIfAborted();
    const namespace = buildScopeDiscoveryNamespace(directory.scope, listing.paths);
    if (
      directory.area === "nested" &&
      !namespace.some(
        (node) =>
          node.kind === "directory" && formatPublicPath(node) === formatPublicPath(directory),
      )
    ) {
      throw new DiscoveryObjectError("not-found");
    }
    const children = directChildren(directory, namespace);
    const childByKey = new Map(children.map((child) => [formatPublicPath(child), child]));
    const pi = await this.piTools.ls(
      children.map((child) => ({
        key: formatPublicPath(child),
        name: directChildName(child),
        directory: child.kind === "directory",
      })),
      context.signal,
    );

    const records: DiscoveryNodeRecord[] = [];
    const enriched: EnrichedArchival[] = [];
    for (const key of pi.keys) {
      const child = childByKey.get(key);
      if (child === undefined) continue;
      if (child.kind === "directory") {
        records.push({ kind: "directory", path: child });
      } else {
        const item = await this.enrich(child);
        enriched.push(item);
        records.push(item.record);
      }
    }

    const ordered = recordsFit(records, renderDiscoveryRecord)
      ? records
      : [
          ...records.filter((record) => record.kind === "directory"),
          ...rankActiveDiscoveryCandidates(enriched.map((item) => item.scarcity)).map(
            (candidate) => candidate.value,
          ),
        ];
    const trailer = "narrow path or use brain_glob/brain_grep; brain_ls is not pageable";
    const packed = packDiscoveryRecords(
      ordered,
      renderDiscoveryRecord,
      `truncated=true; ${trailer}`,
    );
    const truncated = pi.truncated || packed.truncated;
    return {
      records: packed.records,
      truncated,
      text: this.withDiagnostics(
        appendTruncation(
          packed.renderedText || "no archival cognition entries",
          pi.truncated && !packed.truncated,
          trailer,
        ),
        listing.diagnostics,
      ),
    };
  }

  async glob(
    request: GlobRequest,
    context: ReadDiscoveryContext = {},
  ): Promise<DiscoveryListResult> {
    context.signal?.throwIfAborted();
    const matcher = compilePublicGlob(request.pattern);
    const candidates = await this.resolveCandidates(request.path, context);
    const candidateByKey = new Map(
      candidates.map((candidate) => [formatPublicPath(candidate), candidate]),
    );
    const pi = await this.piTools.find(
      candidates.map((candidate) => ({
        key: formatPublicPath(candidate),
        publicPath: formatPublicPath(candidate),
      })),
      request.pattern,
      (_pattern, publicPath) => matcher(publicPath),
      context.signal,
    );
    context.signal?.throwIfAborted();
    const enriched = await Promise.all(
      pi.keys
        .map((key) => candidateByKey.get(key))
        .filter((candidate): candidate is LogicalArchivalPath => candidate !== undefined)
        .map((candidate) => this.enrich(candidate)),
    );
    const records = enriched.map((item) => item.record);
    const ordered = recordsFit(records, renderDiscoveryRecord)
      ? records
      : rankActiveDiscoveryCandidates(enriched.map((item) => item.scarcity)).map(
          (candidate) => candidate.value,
        );
    const trailer = "narrow pattern/path and search again; brain_glob is not pageable";
    const packed = packDiscoveryRecords(
      ordered,
      renderDiscoveryRecord,
      `truncated=true; ${trailer}`,
    );
    const truncated = pi.truncated || packed.truncated;
    return {
      records: packed.records,
      truncated,
      text: appendTruncation(
        packed.renderedText || "no matching archival cognition paths",
        pi.truncated && !packed.truncated,
        trailer,
      ),
    };
  }

  async grep(request: GrepRequest, context: ReadDiscoveryContext = {}): Promise<GrepResult> {
    const args = normalizeGrepArguments(request.context);
    const roots = await this.resolveSearchRoots(request.path, context);
    const byPath = new Map<string, { enriched: EnrichedArchival; lines: readonly string[] }>();
    const dedup = new Map<string, GrepMatchRecord>();
    let piTruncated = false;

    for (const root of roots) {
      let pi;
      try {
        pi = await this.piTools.grepRoot(
          root,
          {
            pattern: request.pattern,
            ...(request.glob === undefined ? {} : { glob: request.glob }),
            ignoreCase: request.ignoreCase ?? false,
            literal: request.literal ?? false,
          },
          request.signal ?? context.signal,
        );
      } catch (error) {
        if (error instanceof PiExecutionError && error.code === "invalid-regex") {
          throw new DiscoveryQueryError("invalid-regex", { cause: error });
        }
        throw error;
      }
      piTruncated ||= pi.truncated;

      for (const hit of pi.hits) {
        const requestedPath = publicArchivalFromScopeRelative(root.scope, hit.relativePath);
        if (requestedPath === undefined) continue;
        let current = byPath.get(formatPublicPath(requestedPath));
        if (current === undefined) {
          let enriched: EnrichedArchival;
          try {
            enriched = await this.enrich(requestedPath);
          } catch {
            // Broad grep is failure-local: filesystem entries that are not valid
            // active cognition do not poison the rest of the search.
            continue;
          }
          const canonicalKey = formatPublicPath(enriched.snapshot.path);
          current = { enriched, lines: splitLogicalLines(enriched.snapshot.document.text) };
          byPath.set(formatPublicPath(requestedPath), current);
          byPath.set(canonicalKey, current);
        }
        const canonicalPath = current.enriched.snapshot.path;
        const lineText = current.lines[hit.lineNumber - 1];
        if (lineText === undefined) continue;
        const contextLines = contextForLine(current.lines, hit.lineNumber, args.context);
        const record: GrepMatchRecord = {
          path: canonicalPath,
          summary: current.enriched.snapshot.document.summary,
          ...(current.enriched.record.status === "questioned"
            ? { status: "questioned" as const }
            : {}),
          lineNumber: hit.lineNumber,
          lineText,
          contextBefore: contextLines.before,
          contextAfter: contextLines.after,
        };
        dedup.set(`${formatPublicPath(canonicalPath)}\0${hit.lineNumber}`, record);
      }
    }

    const canonical = canonicalGrepOrder([...dedup.values()]);
    let sequence: readonly GrepMatchRecord[] = canonical;
    if (!grepRecordsFit(canonical)) {
      const unique = new Map<string, EnrichedArchival>();
      for (const item of byPath.values()) {
        unique.set(formatPublicPath(item.enriched.snapshot.path), item.enriched);
      }
      const documentOrder = rankActiveDiscoveryCandidates(
        [...unique.values()].map((item) => ({
          ...item.scarcity,
          value: formatPublicPath(item.snapshot.path),
        })),
      ).map((candidate) => candidate.value);
      const orderIndex = new Map(documentOrder.map((key, index) => [key, index]));
      sequence = [...canonical].sort((a, b) => {
        const byDocument =
          (orderIndex.get(formatPublicPath(a.path)) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(formatPublicPath(b.path)) ?? Number.MAX_SAFE_INTEGER);
        return byDocument !== 0 ? byDocument : a.lineNumber - b.lineNumber;
      });
    }

    const packed = packGrepRecords(sequence);
    const truncated = piTruncated || packed.truncated;
    const text = appendTruncation(
      renderGrepRecords(packed.records) || "no matching archival cognition content",
      truncated,
      "narrow pattern/path/glob and search again",
    );
    return { records: packed.records, truncated, text };
  }

  async cat(request: CatRequest): Promise<CatResult> {
    request.signal?.throwIfAborted();
    if (request.path.kind !== "archival") throw new DiscoveryObjectError("wrong-object-kind");
    const initial = await this.loadExactArchival(request.path);
    request.signal?.throwIfAborted();
    if (initial === undefined) throw new DiscoveryObjectError("not-found");
    const pathValue = initial.path;
    const status = deriveEpistemicStatus(initial.epistemic);
    const args = normalizeCatArguments(request.offset ?? 1, request.limit ?? 100);
    const logicalLines = splitLogicalLines(initial.document.text);
    const piRead =
      args.offset - 1 >= logicalLines.length
        ? { outputLines: 0, truncated: false, firstLineExceedsLimit: false }
        : await this.piTools.read(initial.document.text, args.offset, args.limit, request.signal);
    const page = buildCatPageFromPiRead(
      pathValue,
      initial.document.text,
      args.offset,
      args.limit,
      piRead,
      status === "questioned" ? "questioned" : undefined,
      initial.epistemic.challenge,
    );
    const result = { page, text: renderCatPage(page) };
    if (page.lines.length === 0) return result;

    // Exact content already exists as a valid result. Learning persistence is a
    // separate best-effort effect and cannot reverse the read on failure.
    await this.operations.tryApplyAuxiliaryUpdate({
      scopes: [pathValue.scope],
      deriveAndApply: async () => {
        const cycle = await this.state.readScopeCycle(pathValue.scope);
        const current = await this.loadExactArchival(pathValue);
        if (current === undefined) throw new DiscoveryObjectError("not-found");
        const accessibility = applyExactRetrieval(cycle, current.accessibility);
        const needsWrite =
          current.companionState === "fresh" ||
          !sameAccessibility(accessibility, current.accessibility);
        if (!needsWrite) return;
        await this.state.putCompanion(
          current.path,
          encodeCompanion({
            contentHash: hashMarkdownContent(current.document.text),
            epistemic: current.epistemic,
            accessibility,
          }),
        );
      },
    });
    return result;
  }

  private async resolveSearchRoots(
    path: LogicalBrainPath | undefined,
    context: ReadDiscoveryContext,
  ): Promise<LogicalDirectory[]> {
    context.signal?.throwIfAborted();
    if (path !== undefined) {
      const requested = requireDirectory(path);
      if (!(await this.state.isScopeMaterialized(requested.scope))) {
        throw new DiscoveryObjectError("not-found");
      }
      return [(await this.resolveRoot(requested)).path];
    }

    const roots: LogicalDirectory[] = [];
    for (const scope of defaultSearchScopes(context)) {
      context.signal?.throwIfAborted();
      const materialized = await this.state.isScopeMaterialized(scope);
      if (!materialized) {
        if (scope.kind === "session") continue;
        throw new DiscoveryObjectError("not-found");
      }
      roots.push(memoriesRoot(scope));
    }
    return roots;
  }

  private async resolveCandidates(
    path: LogicalBrainPath | undefined,
    context: ReadDiscoveryContext,
  ): Promise<LogicalArchivalPath[]> {
    context.signal?.throwIfAborted();
    if (path !== undefined) {
      const requested = requireDirectory(path);
      if (!(await this.state.isScopeMaterialized(requested.scope))) {
        throw new DiscoveryObjectError("not-found");
      }
      const resolved = await this.resolveRoot(requested);
      const directory = resolved.path;
      const listing = await this.state.listActiveArchivalPaths(directory.scope);
      context.signal?.throwIfAborted();
      if (
        directory.area === "nested" &&
        !listing.paths.some((item) => isArchivalUnderDirectory(item, directory))
      ) {
        throw new DiscoveryObjectError("not-found");
      }
      return listing.paths
        .filter((item) => isArchivalUnderDirectory(item, directory))
        .sort(comparePath);
    }

    const dedup = new Map<string, LogicalArchivalPath>();
    for (const scope of defaultSearchScopes(context)) {
      context.signal?.throwIfAborted();
      const materialized = await this.state.isScopeMaterialized(scope);
      if (!materialized) {
        if (scope.kind === "session") continue;
        throw new DiscoveryObjectError("not-found");
      }
      const listing = await this.state.listActiveArchivalPaths(scope);
      context.signal?.throwIfAborted();
      for (const item of listing.paths) dedup.set(formatPublicPath(item), item);
    }
    return [...dedup.values()].sort(comparePath);
  }

  private async enrich(path: LogicalArchivalPath): Promise<EnrichedArchival> {
    const snapshot = await this.loadExactArchival(path);
    if (snapshot === undefined) throw new DiscoveryObjectError("not-found");
    const canonicalPath = snapshot.path;
    const cycle = await this.scopeCycle(canonicalPath.scope);
    const status = deriveEpistemicStatus(snapshot.epistemic);
    const record: Extract<DiscoveryNodeRecord, { kind: "archival" }> = {
      kind: "archival",
      path: canonicalPath,
      summary: snapshot.document.summary,
      ...(status === "questioned" ? { status: "questioned" as const } : {}),
    };
    return {
      snapshot,
      record,
      scarcity: {
        path: canonicalPath,
        importance: snapshot.document.importance,
        epistemicStatus: status,
        accessibility: projectAccessibility(cycle, snapshot.accessibility),
        exposure: snapshot.accessibility.exposure,
        value: record,
      },
    };
  }

  private async resolveRoot(path: LogicalDirectory): Promise<CanonicalDiscoveryRoot> {
    try {
      const resolved = await this.state.resolveDiscoveryRoot(path);
      if (resolved === undefined) throw new DiscoveryObjectError("not-found");
      return resolved;
    } catch (error) {
      return this.mapExactObjectError(error);
    }
  }

  private async loadExactArchival(path: LogicalArchivalPath): Promise<LoadedArchival | undefined> {
    try {
      return await this.state.loadArchival(path);
    } catch (error) {
      return this.mapExactObjectError(error);
    }
  }

  private mapExactObjectError(error: unknown): never {
    if (error instanceof DiscoveryObjectError) throw error;
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "wrong-object-kind" || error.code === "wrong-resource-kind") {
        throw new DiscoveryObjectError("wrong-object-kind");
      }
      if (error.code === "not-found") throw new DiscoveryObjectError("not-found");
    }
    throw error;
  }

  private withDiagnostics(text: string, diagnostics: readonly DiscoveryDiagnostic[]): string {
    if (diagnostics.length === 0) return text;
    const warnings = diagnostics.map((diagnostic) => `warning: ${diagnostic.message}`);
    return [text, ...warnings].filter(Boolean).join("\n");
  }

  private scopeCycle(scope: ScopeRef): Promise<ScopeCycleState> {
    return this.state.readScopeCycle(scope);
  }
}
