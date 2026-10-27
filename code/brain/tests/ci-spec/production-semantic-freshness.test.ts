import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { parsePublicPath } from "../../src/brain/namespace.ts";
import { createBrainApplicationServices } from "../../src/runtime/application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "../../src/runtime/bootstrap.ts";
import { SemanticIndex } from "../../src/runtime/semantic-index.ts";
import {
  classifySemanticWatchPath,
  SemanticPendingStore,
} from "../../src/runtime/semantic-pending.ts";
import { type EmbeddingPort, semanticRuntimePaths } from "../../src/runtime/semantic-runtime.ts";
import { resolveOrCreateProject } from "../../src/persistence/project-mapping.ts";
import { projectPhysicalResource } from "../../src/persistence/storage.ts";

function memory(description: string, summary = description): string {
  return `---\ndescription: ${description}\nsummary: ${summary}\nimportance: high\n---\nbody\n`;
}

class FakeEmbeddings implements EmbeddingPort {
  readonly fingerprint = "semantic-freshness-test";
  failuresRemaining = 0;

  async embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("embedding intentionally unavailable");
    }
    return texts.map((text) => {
      const vector = new Float32Array(384);
      vector[text.length % 384] = 1;
      return vector;
    });
  }
}

async function setupIndexedMemory() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-semantic-freshness-"));
  const brainRoot = path.join(temp, "brain");
  const sourceRoot = path.join(temp, "source");
  await fs.mkdir(sourceRoot, { recursive: true });
  const project = await resolveOrCreateProject({ brainRoot, sourceRoot });
  const infrastructure = await bootstrapBrainRuntimeInfrastructure(
    { projectId: project.projectId, brainRoot },
    {
      gitRunner: {
        async run() {
          throw new Error("git intentionally unavailable in semantic freshness test");
        },
      },
    },
  );
  const services = createBrainApplicationServices(infrastructure);
  const item = parsePublicPath("@project/memories/knowledge/fresh.md");
  if (item.kind !== "archival") throw new Error("test path must be archival");
  await services.maintenance.write(item, memory("old description"));

  const embeddings = new FakeEmbeddings();
  const index = new SemanticIndex(brainRoot, infrastructure.binding, embeddings);
  await index.reconcile();

  const physical = projectPhysicalResource(infrastructure.binding, {
    kind: "public",
    path: item,
  }).absolutePath;
  const pending = new SemanticPendingStore(semanticRuntimePaths(brainRoot).pendingDirectory);

  return {
    temp,
    brainRoot,
    infrastructure,
    item,
    physical,
    pending,
    embeddings,
    index,
    projectId: project.projectId,
  };
}

describe("Brain semantic freshness", () => {
  test("uses summary for vectors while description remains the reading guide", async () => {
    const setup = await setupIndexedMemory();
    try {
      await fs.writeFile(setup.physical, memory("new reading guide", "old description"), "utf8");
      await setup.pending.record({
        kind: "path",
        relativePath: "projects/" + setup.projectId + "/memories/knowledge/fresh.md",
      });
      setup.embeddings.failuresRemaining = 1;
      await setup.index.ensureFresh();
      const result = setup.index.listEligible({ currentProjectId: setup.projectId })[0];
      expect(result?.description).toBe("new reading guide");
      expect(result?.summary).toBe("old description");
      expect(setup.embeddings.failuresRemaining).toBe(1);

      await fs.writeFile(setup.physical, memory("new reading guide", "new summary"), "utf8");
      await setup.pending.record({
        kind: "path",
        relativePath: "projects/" + setup.projectId + "/memories/knowledge/fresh.md",
      });
      await expect(setup.index.ensureFresh()).rejects.toThrow(
        "embedding intentionally unavailable",
      );
      await setup.index.ensureFresh();
      expect(setup.index.listEligible({ currentProjectId: setup.projectId })[0]?.summary).toBe(
        "new summary",
      );
    } finally {
      setup.index.close();
      await fs.rm(setup.temp, { recursive: true, force: true });
    }
  });

  test("keeps old memories without summary out of semantic results", async () => {
    const setup = await setupIndexedMemory();
    try {
      await fs.writeFile(
        setup.physical,
        "---\ndescription: still readable\nimportance: high\n---\nbody\n",
        "utf8",
      );
      await setup.index.refreshPath(setup.infrastructure.binding, setup.item);
      expect(setup.index.listEligible({ currentProjectId: setup.projectId })).toHaveLength(0);
      expect(await fs.readFile(setup.physical, "utf8")).toContain("still readable");
    } finally {
      setup.index.close();
      await fs.rm(setup.temp, { recursive: true, force: true });
    }
  });

  test("classifies exact archival changes separately from ambiguous or irrelevant changes", () => {
    expect(classifySemanticWatchPath("projects/project-1/memories/knowledge/fresh.md")).toEqual({
      kind: "path",
      relativePath: "projects/project-1/memories/knowledge/fresh.md",
    });
    expect(
      classifySemanticWatchPath("projects/project-1/.state/memories/knowledge/fresh.json"),
    ).toBeUndefined();
    expect(
      classifySemanticWatchPath("projects/project-1/memories/knowledge/.fresh.md.brain-1-x.tmp"),
    ).toBeUndefined();
    expect(classifySemanticWatchPath("projects/project-1/memories/knowledge")).toEqual({
      kind: "full",
    });
  });

  test("flushes an observed external path change before semantic query data is read", async () => {
    const setup = await setupIndexedMemory();
    try {
      expect(setup.index.listEligible({ currentProjectId: setup.projectId })[0]?.description).toBe(
        "old description",
      );

      await fs.writeFile(setup.physical, memory("updated description"), "utf8");
      await setup.pending.record({
        kind: "path",
        relativePath: "projects/" + setup.projectId + "/memories/knowledge/fresh.md",
      });

      await setup.index.ensureFresh();

      expect(setup.index.listEligible({ currentProjectId: setup.projectId })[0]?.description).toBe(
        "updated description",
      );
      expect(await setup.pending.list()).toHaveLength(0);
    } finally {
      setup.index.close();
      await fs.rm(setup.temp, { recursive: true, force: true });
    }
  });

  test("keeps pending work when an incremental refresh fails and retries it later", async () => {
    const setup = await setupIndexedMemory();
    try {
      await fs.writeFile(setup.physical, memory("retry description"), "utf8");
      await setup.pending.record({
        kind: "path",
        relativePath: "projects/" + setup.projectId + "/memories/knowledge/fresh.md",
      });

      setup.embeddings.failuresRemaining = 1;
      await expect(setup.index.ensureFresh()).rejects.toThrow(
        "embedding intentionally unavailable",
      );
      expect(await setup.pending.list()).toHaveLength(1);
      expect(setup.index.listEligible({ currentProjectId: setup.projectId })[0]?.description).toBe(
        "old description",
      );

      await setup.index.ensureFresh();
      expect(await setup.pending.list()).toHaveLength(0);
      expect(setup.index.listEligible({ currentProjectId: setup.projectId })[0]?.description).toBe(
        "retry description",
      );
    } finally {
      setup.index.close();
      await fs.rm(setup.temp, { recursive: true, force: true });
    }
  });

  test("a queued freshness request retries after a concurrent refresh failure", async () => {
    const setup = await setupIndexedMemory();
    try {
      await fs.writeFile(setup.physical, memory("concurrent retry"), "utf8");
      await setup.pending.record({
        kind: "path",
        relativePath: "projects/" + setup.projectId + "/memories/knowledge/fresh.md",
      });
      setup.embeddings.failuresRemaining = 1;

      const first = setup.index.ensureFresh();
      const second = setup.index.ensureFresh();

      await expect(first).rejects.toThrow("embedding intentionally unavailable");
      await expect(second).resolves.toBeUndefined();
      expect(await setup.pending.list()).toHaveLength(0);
      expect(setup.index.listEligible({ currentProjectId: setup.projectId })[0]?.description).toBe(
        "concurrent retry",
      );
    } finally {
      setup.index.close();
      await fs.rm(setup.temp, { recursive: true, force: true });
    }
  });

  test("full pending reconciliation catches changes that cannot be mapped to one path", async () => {
    const setup = await setupIndexedMemory();
    try {
      await fs.writeFile(setup.physical, memory("full catch-up"), "utf8");
      await setup.pending.record({ kind: "full" });

      await setup.index.ensureFresh();

      expect(await setup.pending.list()).toHaveLength(0);
      expect(setup.index.listEligible({ currentProjectId: setup.projectId })[0]?.description).toBe(
        "full catch-up",
      );
    } finally {
      setup.index.close();
      await fs.rm(setup.temp, { recursive: true, force: true });
    }
  });
});
