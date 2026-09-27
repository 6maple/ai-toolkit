import { describe, expect, test, vi } from "vite-plus/test";

import { SemanticDiscovery, SEMANTIC_TOP_K } from "../../src/application/semantic-discovery.ts";
import type { SemanticIndex } from "../../src/runtime/semantic-index.ts";
import type { EmbeddingPort } from "../../src/runtime/semantic-runtime.ts";

function unitVector(index: number): Float32Array {
  const vector = new Float32Array(384);
  vector[index] = 1;
  return vector;
}

describe("Brain semantic discovery", () => {
  test("ranks exact semantic vectors and renders current, related, and global paths", async () => {
    const entries = [
      {
        key: "global|knowledge/global.md",
        scopeKind: "global" as const,
        role: "knowledge" as const,
        relativePath: "global.md",
        description: "global description",
        summary: "global summary",
        embedding: unitVector(1),
      },
      {
        key: "project|current|decision/current.md",
        scopeKind: "project" as const,
        projectId: "current",
        role: "decision" as const,
        relativePath: "current.md",
        description: "current description",
        summary: "current summary",
        status: "questioned" as const,
        embedding: unitVector(0),
      },
      {
        key: "project|related|skill/related.md",
        scopeKind: "project" as const,
        projectId: "related",
        role: "skill" as const,
        relativePath: "related.md",
        description: "related description",
        summary: "related summary",
        embedding: Float32Array.from(unitVector(0), (value, index) =>
          index === 1 ? 0.1 : value * 0.9,
        ),
      },
    ];

    const ensureFresh = vi.fn(async () => undefined);
    const listEligible = vi.fn(() => entries);
    const index = { ensureFresh, listEligible } as unknown as SemanticIndex;
    const embeddings: EmbeddingPort = {
      fingerprint: "fake",
      embed: vi.fn(async () => [unitVector(0)]),
    };
    const discovery = new SemanticDiscovery("current", index, embeddings);

    const result = await discovery.search("find the relevant cognition", {
      relatedProjects: [{ projectId: "related", alias: "other" }],
    });

    expect(ensureFresh).toHaveBeenCalledOnce();
    expect(listEligible).toHaveBeenCalledWith({
      currentProjectId: "current",
      relatedProjectIds: ["related"],
    });
    expect(result.records.map((record) => record.publicPath)).toEqual([
      "@project/memories/decision/current.md",
      "#other/memories/skill/related.md",
      "@global/memories/knowledge/global.md",
    ]);
    expect(result.text).toContain("status=questioned");
    expect(result.text).toContain("description=current description\tsummary=current summary");
    expect(result.text).not.toContain("score=");
  });

  test("returns at most the fixed top-K without a similarity threshold", async () => {
    const entries = Array.from({ length: SEMANTIC_TOP_K + 5 }, (_, index) => ({
      key: "project|current|knowledge/" + index + ".md",
      scopeKind: "project" as const,
      projectId: "current",
      role: "knowledge" as const,
      relativePath: index + ".md",
      description: "description " + index,
      summary: "summary " + index,
      embedding: unitVector(index % 4),
    }));
    const index = {
      ensureFresh: vi.fn(async () => undefined),
      listEligible: vi.fn(() => entries),
    } as unknown as SemanticIndex;
    const embeddings: EmbeddingPort = {
      fingerprint: "fake",
      embed: vi.fn(async () => [unitVector(0)]),
    };
    const result = await new SemanticDiscovery("current", index, embeddings).search("query");
    expect(result.records).toHaveLength(SEMANTIC_TOP_K);
  });
});
