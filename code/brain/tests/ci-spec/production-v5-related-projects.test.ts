import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vite-plus/test";

import {
  formatAddressedPublicPath,
  parseAddressedPublicPath,
  parsePublicPath,
  parseResourceLocation,
} from "../../src/brain/namespace.ts";
import { RoutedBrainApplication } from "../../src/application/routed-brain.ts";
import { registerBrainTools } from "../../src/integration/mcp-adapter.ts";
import {
  type PersistentResourcePort,
  type PreparedPhysicalMutation,
  type ResourceBeforeState,
  type ResourceMutation,
} from "../../src/persistence/cognition-state-store.ts";
import {
  FileGlobalSemanticLease,
  PersistentOperationCoordinator,
} from "../../src/persistence/operation-coordination.ts";
import {
  listProjectMetadata,
  resolveOrCreateProject,
} from "../../src/persistence/project-mapping.ts";
import { encodeScopeState } from "../../src/persistence/codecs.ts";
import { projectAbsoluteLocation } from "../../src/persistence/storage.ts";
import { createBrainApplicationServices } from "../../src/runtime/application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "../../src/runtime/bootstrap.ts";
import { createBrainServicesForRoot } from "../../src/runtime/production.ts";
import { loadProjectRelationCatalog } from "../../src/runtime/project-relations.ts";

function textOf(result: { content?: unknown }): string {
  if (!Array.isArray(result.content)) return "";
  return result.content
    .filter(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

async function writeConfig(sourceRoot: string, value: unknown): Promise<void> {
  const directory = path.join(sourceRoot, ".brain");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "config.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function bootstrapProject(brainRoot: string, sourceRoot: string) {
  const project = await resolveOrCreateProject({ brainRoot, sourceRoot });
  const infrastructure = await bootstrapBrainRuntimeInfrastructure({
    brainRoot,
    projectId: project.projectId,
  });
  return {
    project,
    infrastructure,
    services: createBrainApplicationServices(infrastructure),
  };
}

async function withClient<T>(
  services: Awaited<ReturnType<typeof createBrainServicesForRoot>>,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const server = new McpServer({ name: "brain-v5-test", version: "0.0.0" });
  registerBrainTools(server, services);
  const client = new Client({ name: "brain-v5-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("v5 related project cognition", () => {
  it("parses related public addresses without adding a related cognition scope", () => {
    const core = parseAddressedPublicPath("#mobile/core.md");
    expect(core.root).toEqual({ kind: "related", alias: "mobile" });
    expect(core.path).toEqual({ kind: "core", scope: { kind: "project" } });
    expect(formatAddressedPublicPath(core)).toBe("#mobile/core.md");

    const memory = parseAddressedPublicPath("#mobile/memories/decision/a.md");
    expect(memory.root).toEqual({ kind: "related", alias: "mobile" });
    expect(memory.path.scope).toEqual({ kind: "project" });
    expect(formatAddressedPublicPath(memory)).toBe("#mobile/memories/decision/a.md");

    expect(() => parseAddressedPublicPath("#mobile/session/s1/core.md")).toThrow();
  });

  it("resolves only already-registered related projects and degrades aliases independently", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-relations-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const b = path.join(temp, "b");
    await Promise.all([fs.mkdir(a), fs.mkdir(b)]);
    try {
      const active = await resolveOrCreateProject({ brainRoot, sourceRoot: a });
      const related = await resolveOrCreateProject({ brainRoot, sourceRoot: b });
      await writeConfig(a, {
        relatedProjects: {
          b: { path: "../b" },
          missing: { path: "../missing", access: "write" },
          malformed: { path: "../b", acess: "write" },
          self: { path: "." },
        },
      });

      const before = await listProjectMetadata(brainRoot);
      const catalog = await loadProjectRelationCatalog({ brainRoot, sourceRoot: a, projectId: active.projectId });
      const after = await listProjectMetadata(brainRoot);

      expect(after).toEqual(before);
      expect(catalog.configError).toBeUndefined();
      expect(catalog.byAlias.get("b")).toMatchObject({
        kind: "available",
        access: "read",
        configuredPath: "../b",
        files: "../b/**",
        projectId: related.projectId,
      });
      expect(catalog.byAlias.get("missing")?.kind).toBe("unavailable");
      expect(catalog.byAlias.get("malformed")?.kind).toBe("unavailable");
      expect(catalog.byAlias.get("self")?.kind).toBe("unavailable");
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("treats a registered but unmaterialized related project as empty only in omitted-path discovery", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-empty-related-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const empty = path.join(temp, "empty");
    await Promise.all([fs.mkdir(a), fs.mkdir(empty)]);
    try {
      const current = await bootstrapProject(brainRoot, a);
      await resolveOrCreateProject({ brainRoot, sourceRoot: empty });
      const memoryPath = parsePublicPath("@project/memories/knowledge/current.md");
      if (memoryPath.kind !== "archival") throw new Error("expected archival");
      await current.services.maintenance.write(
        memoryPath,
        "---\nsummary: current\nimportance: medium\n---\nCURRENT_ONLY_SENTINEL\n",
      );
      await writeConfig(a, { relatedProjects: { empty: { path: "../empty", access: "write" } } });
      const services = await createBrainServicesForRoot(brainRoot, a);

      await withClient(services, async (client) => {
        const glob = await client.callTool({
          name: "brain_glob",
          arguments: { pattern: "**/*.md" },
        });
        expect(glob.isError).not.toBe(true);
        expect(textOf(glob)).toContain("@project/memories/knowledge/current.md");

        const grep = await client.callTool({
          name: "brain_grep",
          arguments: { pattern: "CURRENT_ONLY_SENTINEL", literal: true },
        });
        expect(grep.isError).not.toBe(true);
        expect(textOf(grep)).toContain("@project/memories/knowledge/current.md");

        const explicit = await client.callTool({
          name: "brain_glob",
          arguments: { path: "#empty/memories/", pattern: "#empty/memories/**/*.md" },
        });
        expect(explicit.isError).toBe(true);
        expect(textOf(explicit)).toMatch(/^error: not-found(?:\n|$)/);
      });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("warns when multiple aliases resolve to the same related Brain project", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-duplicate-related-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const b = path.join(temp, "b");
    await Promise.all([fs.mkdir(a), fs.mkdir(b)]);
    try {
      await bootstrapProject(brainRoot, a);
      const target = await bootstrapProject(brainRoot, b);
      await writeConfig(a, {
        relatedProjects: {
          first: { path: "../b", access: "read" },
          second: { path: "../b", access: "write" },
        },
      });
      const services = await createBrainServicesForRoot(brainRoot, a);

      await withClient(services, async (client) => {
        const think = await client.callTool({ name: "brain_think", arguments: {} });
        const text = textOf(think);
        expect(think.isError).not.toBe(true);
        expect(text).toContain("### Related Project Warnings");
        expect(text).toContain("related-project-duplicate-target");
        expect(text).toContain("#first");
        expect(text).toContain("#second");
        expect(text).not.toContain(target.project.projectId);
      });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("reads related cognition with alias presentation and keeps read-only retrieval side-effect free", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-read-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const b = path.join(temp, "b");
    await Promise.all([fs.mkdir(a), fs.mkdir(b)]);
    try {
      const current = await bootstrapProject(brainRoot, a);
      const target = await bootstrapProject(brainRoot, b);
      await target.services.maintenance.edit({
        path: parsePublicPath("@project/core.md"),
        content:
          "# B core\nB_CORE_SENTINEL\n- Read `@project/memories/knowledge/b.md`.\n",
      });
      const memoryPath = parsePublicPath("@project/memories/knowledge/b.md");
      if (memoryPath.kind !== "archival") throw new Error("expected archival");
      await target.services.maintenance.write(
        memoryPath,
        "---\nsummary: b memory referencing @project/memories/knowledge/b.md\nimportance: high\n---\nB_MEMORY_SENTINEL\nREF @project/memories/knowledge/b.md\n",
      );
      await current.services.maintenance.write(
        memoryPath,
        "---\nsummary: current memory\nimportance: high\n---\nCURRENT_MEMORY_SENTINEL\n",
      );
      const before = await target.infrastructure.store.loadArchival(memoryPath);

      await writeConfig(a, { relatedProjects: { b: { path: "../b", access: "read" } } });
      const services = await createBrainServicesForRoot(brainRoot, a);

      await withClient(services, async (client) => {
        const think = await client.callTool({ name: "brain_think", arguments: {} });
        const thinkText = textOf(think);
        expect(think.isError).not.toBe(true);
        expect(thinkText).toContain("#b/core.md");
        expect(thinkText).toContain("../b/**");
        expect(thinkText).not.toContain("B_CORE_SENTINEL");
        expect(thinkText).not.toContain(target.project.projectId);

        const core = await client.callTool({
          name: "brain_cat",
          arguments: { path: "#b/core.md" },
        });
        expect(core.isError).not.toBe(true);
        const coreText = textOf(core);
        expect(coreText).toContain("#b/core.md");
        expect(coreText).toContain("B_CORE_SENTINEL");
        expect(coreText).toContain("@project/memories/knowledge/b.md");
        expect(coreText).toMatch(/@project\/\.\.\.[\s\S]*#b\/\.\.\./);

        const cat = await client.callTool({
          name: "brain_cat",
          arguments: { path: "#b/memories/knowledge/b.md" },
        });
        expect(cat.isError).not.toBe(true);
        const catText = textOf(cat);
        expect(catText).toContain("#b/memories/knowledge/b.md");
        expect(catText).toContain("B_MEMORY_SENTINEL");
        expect(catText).toMatch(/@project\/\.\.\.[\s\S]*#b\/\.\.\./);

        const listed = await client.callTool({
          name: "brain_ls",
          arguments: { path: "#b/memories/knowledge/" },
        });
        expect(listed.isError).not.toBe(true);
        expect(textOf(listed)).toMatch(/@project\/\.\.\.[\s\S]*#b\/\.\.\./);

        const grepped = await client.callTool({
          name: "brain_grep",
          arguments: { path: "#b/memories/", pattern: "@project/", literal: true },
        });
        expect(grepped.isError).not.toBe(true);
        expect(textOf(grepped)).toMatch(/@project\/\.\.\.[\s\S]*#b\/\.\.\./);

        const discovered = await client.callTool({
          name: "brain_glob",
          arguments: { pattern: "**/*.md" },
        });
        expect(discovered.isError).not.toBe(true);
        expect(textOf(discovered)).toContain("@project/memories/knowledge/b.md");
        expect(textOf(discovered)).toContain("#b/memories/knowledge/b.md");

        const sharedRelativePathGrep = await client.callTool({
          name: "brain_grep",
          arguments: { pattern: "MEMORY_SENTINEL", literal: true },
        });
        expect(sharedRelativePathGrep.isError).not.toBe(true);
        expect(textOf(sharedRelativePathGrep)).toContain("@project/memories/knowledge/b.md");
        expect(textOf(sharedRelativePathGrep)).toContain("#b/memories/knowledge/b.md");

        const discoveredByContent = await client.callTool({
          name: "brain_grep",
          arguments: { pattern: "B_MEMORY_SENTINEL", literal: true },
        });
        expect(discoveredByContent.isError).not.toBe(true);
        expect(textOf(discoveredByContent)).toContain("#b/memories/knowledge/b.md");
        expect(textOf(discoveredByContent)).toContain("B_MEMORY_SENTINEL");

        const explicit = await client.callTool({
          name: "brain_glob",
          arguments: { path: "#b/memories/", pattern: "#b/memories/**/*.md" },
        });
        expect(explicit.isError).not.toBe(true);
        expect(textOf(explicit)).toContain("#b/memories/knowledge/b.md");
        expect(textOf(explicit)).toMatch(/@project\/\.\.\.[\s\S]*#b\/\.\.\./);

        const denied = await client.callTool({
          name: "brain_edit",
          arguments: { path: "#b/core.md", content: "changed\n" },
        });
        expect(denied.isError).toBe(true);
        expect(textOf(denied)).toMatch(/^error: related-project-read-only(?:\n|$)/);

        const unknown = await client.callTool({
          name: "brain_cat",
          arguments: { path: "#missing/core.md" },
        });
        expect(unknown.isError).toBe(true);
        expect(textOf(unknown)).toMatch(/^error: unknown-related-project(?:\n|$)/);

        const absolute = await client.callTool({
          name: "brain_absolute_path",
          arguments: { path: "#b/core.md" },
        });
        expect(textOf(absolute).trim()).toBe(
          projectAbsoluteLocation(target.infrastructure.binding, parseResourceLocation("@project/core.md")),
        );
      });

      const after = await target.infrastructure.store.loadArchival(memoryPath);
      expect(after?.accessibility).toEqual(before?.accessibility);
      expect(after?.epistemic).toEqual(before?.epistemic);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("ranks default discovery across related projects without changing search-only memory state", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-workspace-discovery-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const lowRoot = path.join(temp, "low");
    const highRoot = path.join(temp, "high");
    await Promise.all([fs.mkdir(a), fs.mkdir(lowRoot), fs.mkdir(highRoot)]);
    try {
      await resolveOrCreateProject({ brainRoot, sourceRoot: a });
      const low = await bootstrapProject(brainRoot, lowRoot);
      const high = await bootstrapProject(brainRoot, highRoot);

      const lowPaths = Array.from({ length: 8 }, (_, index) =>
        parsePublicPath(
          `@project/memories/knowledge/ranking-${index.toString().padStart(2, "0")}.md`,
        ),
      );
      const longLowSummary = `low ${"x".repeat(1200)}`;
      for (const item of lowPaths) {
        if (item.kind !== "archival") throw new Error("expected archival");
        await low.services.maintenance.write(
          item,
          `---\nsummary: ${longLowSummary}\nimportance: low\n---\nWORKSPACE_RANKING_SENTINEL\n`,
        );
      }
      await low.infrastructure.store.putScopeCycle(
        { kind: "project" },
        encodeScopeState({ cycle: 10 }),
      );

      const highPath = parsePublicPath("@project/memories/knowledge/ranking-high.md");
      if (highPath.kind !== "archival") throw new Error("expected archival");
      await high.services.maintenance.write(
        highPath,
        "---\nsummary: high\nimportance: critical\n---\nWORKSPACE_RANKING_SENTINEL\n",
      );

      const firstLowPath = lowPaths[0]!;
      if (firstLowPath.kind !== "archival") throw new Error("expected archival");
      const lowBefore = await low.infrastructure.store.loadArchival(firstLowPath);
      const highBefore = await high.infrastructure.store.loadArchival(highPath);

      await writeConfig(a, {
        relatedProjects: {
          aaa: { path: "../low", access: "write" },
          zzz: { path: "../high", access: "write" },
        },
      });
      const services = await createBrainServicesForRoot(brainRoot, a);

      await withClient(services, async (client) => {
        const glob = await client.callTool({
          name: "brain_glob",
          arguments: { pattern: "**/ranking-*.md" },
        });
        expect(glob.isError).not.toBe(true);
        expect(textOf(glob)).toContain("#zzz/memories/knowledge/ranking-high.md");
        expect(textOf(glob)).toContain("truncated=true");

        const grep = await client.callTool({
          name: "brain_grep",
          arguments: { pattern: "WORKSPACE_RANKING_SENTINEL", literal: true },
        });
        expect(grep.isError).not.toBe(true);
        expect(textOf(grep)).toContain("#zzz/memories/knowledge/ranking-high.md");
        expect(textOf(grep)).toContain("truncated=true");
      });

      const lowAfter = await low.infrastructure.store.loadArchival(firstLowPath);
      const highAfter = await high.infrastructure.store.loadArchival(highPath);
      expect(lowAfter?.accessibility).toEqual(lowBefore?.accessibility);
      expect(highAfter?.accessibility).toEqual(highBefore?.accessibility);
      expect(lowAfter?.epistemic).toEqual(lowBefore?.epistemic);
      expect(highAfter?.epistemic).toEqual(highBefore?.epistemic);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("reloads relation permission per invocation and degrades a bad sibling alias locally", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-reload-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const b = path.join(temp, "b");
    await Promise.all([fs.mkdir(a), fs.mkdir(b)]);
    try {
      await resolveOrCreateProject({ brainRoot, sourceRoot: a });
      const target = await bootstrapProject(brainRoot, b);
      await target.services.maintenance.edit({
        path: parsePublicPath("@project/core.md"),
        content: "before\nref @project/memories/knowledge/x.md\n",
      });

      await writeConfig(a, {
        relatedProjects: {
          b: { path: "../b", access: "read" },
          bad: { path: "../missing" },
        },
      });
      const services = await createBrainServicesForRoot(brainRoot, a);

      await withClient(services, async (client) => {
        const bad = await client.callTool({ name: "brain_cat", arguments: { path: "#bad/core.md" } });
        expect(bad.isError).toBe(true);
        expect(textOf(bad)).toMatch(/^error: related-project-unavailable(?:\n|$)/);

        const good = await client.callTool({ name: "brain_cat", arguments: { path: "#b/core.md" } });
        expect(good.isError).not.toBe(true);

        await writeConfig(a, {
          relatedProjects: {
            b: { path: "../b", access: "write" },
            bad: { path: "../missing" },
          },
        });

        const edited = await client.callTool({
          name: "brain_edit",
          arguments: {
            path: "#b/core.md",
            edits: [{ oldText: "before", newText: "after" }],
          },
        });
        expect(edited.isError).not.toBe(true);
      });

      expect((await target.infrastructure.store.loadScope({ kind: "project" }))?.core.text).toBe(
        "after\nref @project/memories/knowledge/x.md\n",
      );
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("moves cognition across writable related projects and rejects any read-only endpoint before mutation", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-move-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const b = path.join(temp, "b");
    const c = path.join(temp, "c");
    await Promise.all([fs.mkdir(a), fs.mkdir(b), fs.mkdir(c)]);
    try {
      await resolveOrCreateProject({ brainRoot, sourceRoot: a });
      const source = await bootstrapProject(brainRoot, b);
      const destination = await bootstrapProject(brainRoot, c);
      const first = parsePublicPath("@project/memories/decision/first.md");
      const second = parsePublicPath("@project/memories/decision/second.md");
      if (first.kind !== "archival" || second.kind !== "archival") throw new Error("expected archival");
      await source.services.maintenance.write(
        first,
        "---\nsummary: first\nimportance: high\n---\nFIRST_BODY\n",
      );
      await source.services.maintenance.write(
        second,
        "---\nsummary: second\nimportance: high\n---\nSECOND_BODY\n",
      );

      await writeConfig(a, {
        relatedProjects: {
          b: { path: "../b", access: "write" },
          c: { path: "../c", access: "write" },
        },
      });
      const services = await createBrainServicesForRoot(brainRoot, a);

      await withClient(services, async (client) => {
        const moved = await client.callTool({
          name: "brain_mv",
          arguments: {
            src: "#b/memories/decision/first.md",
            dst: "#c/memories/decision/first.md",
          },
        });
        expect(moved.isError).not.toBe(true);

        expect(await source.infrastructure.store.loadArchival(first)).toBeUndefined();
        expect((await destination.infrastructure.store.loadArchival(first))?.document.text).toContain(
          "FIRST_BODY",
        );

        await writeConfig(a, {
          relatedProjects: {
            b: { path: "../b", access: "write" },
            c: { path: "../c", access: "read" },
          },
        });
        const denied = await client.callTool({
          name: "brain_mv",
          arguments: {
            src: "#b/memories/decision/second.md",
            dst: "#c/memories/decision/second.md",
          },
        });
        expect(denied.isError).toBe(true);
        expect(textOf(denied)).toMatch(/^error: related-project-read-only(?:\n|$)/);
      });

      expect(await source.infrastructure.store.loadArchival(second)).toBeDefined();
      expect(await destination.infrastructure.store.loadArchival(second)).toBeUndefined();
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("rolls back both projects when a cross-project physical apply fails after destination writes", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v5-rollback-"));
    const brainRoot = path.join(temp, "brain");
    const a = path.join(temp, "a");
    const b = path.join(temp, "b");
    const c = path.join(temp, "c");
    await Promise.all([fs.mkdir(a), fs.mkdir(b), fs.mkdir(c)]);
    try {
      const current = await bootstrapProject(brainRoot, a);
      const source = await bootstrapProject(brainRoot, b);
      const destination = await bootstrapProject(brainRoot, c);
      const item = parsePublicPath("@project/memories/decision/rollback.md");
      if (item.kind !== "archival") throw new Error("expected archival");
      await source.services.maintenance.write(
        item,
        "---\nsummary: rollback\nimportance: high\n---\nSOURCE_BODY\n",
      );
      await writeConfig(a, {
        relatedProjects: {
          b: { path: "../b", access: "write" },
          c: { path: "../c", access: "write" },
        },
      });

      const delegate = current.infrastructure.store;
      const sourceDocumentPath = projectAbsoluteLocation(
        source.infrastructure.binding,
        parseResourceLocation("@project/memories/decision/rollback.md"),
      );
      const failingResources: PersistentResourcePort = {
        preflight: (mutation: ResourceMutation) => delegate.preflight(mutation),
        readBefore: (prepared: PreparedPhysicalMutation) => delegate.readBefore(prepared),
        putWhole: (prepared: PreparedPhysicalMutation, bytes: Uint8Array) =>
          delegate.putWhole(prepared, bytes),
        deleteFile: async (prepared: PreparedPhysicalMutation) => {
          if (prepared.absolutePath === sourceDocumentPath) throw new Error("injected delete failure");
          await delegate.deleteFile(prepared);
        },
        restoreBefore: (prepared: PreparedPhysicalMutation, before: ResourceBeforeState) =>
          delegate.restoreBefore(prepared, before),
      };
      const failingOperations = new PersistentOperationCoordinator(
        failingResources,
        new FileGlobalSemanticLease(brainRoot),
      );
      const routed = new RoutedBrainApplication({
        sourceRoot: a,
        binding: current.infrastructure.binding,
        anchor: current.services.anchor,
        reads: current.services.reads,
        maintenance: current.services.maintenance,
        store: current.infrastructure.store,
        operations: failingOperations,
      });

      await expect(
        routed.move(
          "#b/memories/decision/rollback.md",
          "#c/memories/decision/rollback.md",
        ),
      ).rejects.toThrow("injected delete failure");

      expect((await source.infrastructure.store.loadArchival(item))?.document.text).toContain(
        "SOURCE_BODY",
      );
      expect(await destination.infrastructure.store.loadArchival(item)).toBeUndefined();
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

});
