import {
  packDiscoveryRecords,
  renderDiscoveryRecord,
  type DiscoveryNodeRecord,
} from "../brain/discovery.ts";
import { parsePublicPath, type LogicalArchivalPath } from "../brain/namespace.ts";
import type { SemanticIndex, SemanticIndexEntry } from "../runtime/semantic-index.ts";
import type { EmbeddingPort } from "../runtime/semantic-runtime.ts";

export const SEMANTIC_TOP_K = 10;

const SEMANTIC_DEBUG = process.env.BRAIN_SEMANTIC_DEBUG === "1";
function semanticDebug(event: string, detail: Record<string, unknown> = {}): void {
  if (!SEMANTIC_DEBUG) return;
  console.error("brain semantic debug " + JSON.stringify({ event, pid: process.pid, ...detail }));
}

export interface RelatedSemanticProject {
  readonly projectId: string;
  readonly alias: string;
}

export interface SemanticDiscoveryContext {
  readonly relatedProjects?: readonly RelatedSemanticProject[];
  readonly signal?: AbortSignal;
}

export interface SemanticSearchResult {
  readonly records: readonly Extract<DiscoveryNodeRecord, { kind: "archival" }>[];
  readonly truncated: boolean;
  readonly text: string;
}

function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("semantic vector dimension mismatch");
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result += a[index]! * b[index]!;
  return result;
}

function archivalPath(root: string, entry: SemanticIndexEntry): LogicalArchivalPath {
  const parsed = parsePublicPath(root + "/memories/" + entry.role + "/" + entry.relativePath);
  if (parsed.kind !== "archival") throw new Error("semantic index produced invalid archival path");
  return parsed;
}

function recordFor(
  entry: SemanticIndexEntry,
  currentProjectId: string,
  related: ReadonlyMap<string, string>,
): Extract<DiscoveryNodeRecord, { kind: "archival" }> {
  if (entry.scopeKind === "global") {
    const path = archivalPath("@global", entry);
    return {
      kind: "archival",
      path,
      publicPath: "@global/memories/" + entry.role + "/" + entry.relativePath,
      description: entry.description,
      summary: entry.summary,
      ...(entry.status === undefined ? {} : { status: entry.status }),
    };
  }
  if (entry.projectId === currentProjectId) {
    const path = archivalPath("@project", entry);
    return {
      kind: "archival",
      path,
      publicPath: "@project/memories/" + entry.role + "/" + entry.relativePath,
      description: entry.description,
      summary: entry.summary,
      ...(entry.status === undefined ? {} : { status: entry.status }),
    };
  }
  const alias = entry.projectId === undefined ? undefined : related.get(entry.projectId);
  if (alias === undefined) throw new Error("semantic index returned ineligible related project");
  const path = archivalPath("@project", entry);
  return {
    kind: "archival",
    path,
    publicPath: "#" + alias + "/memories/" + entry.role + "/" + entry.relativePath,
    description: entry.description,
    summary: entry.summary,
    ...(entry.status === undefined ? {} : { status: entry.status }),
  };
}

export class SemanticDiscovery {
  constructor(
    private readonly currentProjectId: string,
    private readonly index: SemanticIndex,
    private readonly embeddings: EmbeddingPort,
  ) {}

  async search(
    query: string,
    context: SemanticDiscoveryContext = {},
  ): Promise<SemanticSearchResult> {
    const startedAt = Date.now();
    semanticDebug("search.start", {
      queryLength: query.length,
      currentProjectId: this.currentProjectId,
      relatedProjects: context.relatedProjects?.length ?? 0,
    });
    context.signal?.throwIfAborted();
    await this.index.ensureFresh();
    semanticDebug("search.ensure-fresh.done", { elapsedMs: Date.now() - startedAt });
    context.signal?.throwIfAborted();
    const vectors = await this.embeddings.embed([query], context.signal);
    semanticDebug("search.query-embedding.done", { elapsedMs: Date.now() - startedAt });
    const queryVector = vectors[0];
    if (queryVector === undefined) throw new Error("embedding runtime returned no query vector");

    const relatedProjects = context.relatedProjects ?? [];
    const relatedByProjectId = new Map(
      relatedProjects.map((project) => [project.projectId, project.alias] as const),
    );
    const candidates = this.index.listEligible({
      currentProjectId: this.currentProjectId,
      ...(relatedProjects.length === 0
        ? {}
        : { relatedProjectIds: relatedProjects.map((project) => project.projectId) }),
    });

    semanticDebug("search.candidates.ready", {
      count: candidates.length,
      elapsedMs: Date.now() - startedAt,
    });

    const ranked = candidates
      .map((entry) => ({
        entry,
        score: dot(queryVector, entry.embedding),
      }))
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.entry.key.localeCompare(b.entry.key);
      })
      .slice(0, SEMANTIC_TOP_K)
      .map((item) => recordFor(item.entry, this.currentProjectId, relatedByProjectId));

    const trailer = "semantic results truncated; refine the query and search again";
    const packed = packDiscoveryRecords(ranked, renderDiscoveryRecord, trailer);
    semanticDebug("search.end", {
      records: packed.records.length,
      truncated: packed.truncated,
      elapsedMs: Date.now() - startedAt,
    });
    return {
      records: packed.records,
      truncated: packed.truncated,
      text: packed.renderedText || "no semantically matching archival cognition",
    };
  }
}
