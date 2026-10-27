import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vite-plus/test";

import { parsePublicPath } from "../../src/brain/namespace.ts";
import { registerBrainTools } from "../../src/integration/mcp-adapter.ts";
import { createBrainApplicationServices } from "../../src/runtime/application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "../../src/runtime/bootstrap.ts";

function textOf(result: unknown): string {
  const content =
    typeof result === "object" && result !== null
      ? (result as { content?: unknown }).content
      : undefined;
  if (!Array.isArray(content)) return "";
  return content
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

describe("real runtime + MCP integration", () => {
  it("serves write/cat/think on real storage even when Git history is unavailable", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-integration-"));
    const brainRoot = path.join(temp, "brain");

    const infrastructure = await bootstrapBrainRuntimeInfrastructure(
      { projectId: "project-1", brainRoot },
      {
        gitRunner: {
          async run() {
            throw new Error("git intentionally unavailable in integration test");
          },
        },
      },
    );
    expect(infrastructure.historyPreparation.kind).toBe("unavailable");

    const services = createBrainApplicationServices(infrastructure);
    const server = new McpServer({ name: "brain-integration", version: "0.0.0" });
    registerBrainTools(server, services);
    const client = new Client({ name: "brain-integration-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const write = await client.callTool({
        name: "brain_write",
        arguments: {
          path: "@project/memories/knowledge/real.md",
          content: "---\ndescription: real integration memory\nimportance: high\n---\nreal body\n",
        },
      });
      expect(write.isError).not.toBe(true);

      const cat = await client.callTool({
        name: "brain_cat",
        arguments: { path: "@project/memories/knowledge/real.md" },
      });
      expect(cat.isError).not.toBe(true);
      expect(textOf(cat)).toContain("real body");

      const absolute = await client.callTool({
        name: "brain_absolute_path",
        arguments: { path: "@project/memories/knowledge/real.md" },
      });
      const physical = textOf(absolute).trim();
      expect(await fs.readFile(physical, "utf8")).toContain("real body");

      const think = await client.callTool({ name: "brain_think", arguments: {} });
      expect(think.isError).not.toBe(true);
      expect(textOf(think)).toContain("# 处理流程");
      expect(textOf(think)).not.toContain("@project/memories/knowledge/real.md");
      const view = await client.callTool({
        name: "brain_cat",
        arguments: { path: "@brain-virtual/deep-memory.md" },
      });
      expect(view.isError).not.toBe(true);
      expect(textOf(view)).toContain("@project/memories/knowledge/real.md");
    } finally {
      await client.close();
      await server.close();
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects a stale shared-Core exact edit from another runtime instance", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-stale-core-"));
    const brainRoot = path.join(temp, "brain");
    const gitRunner = {
      async run() {
        throw new Error("git intentionally unavailable in integration test");
      },
    };

    try {
      const firstInfrastructure = await bootstrapBrainRuntimeInfrastructure(
        { projectId: "project-1", brainRoot },
        { gitRunner },
      );
      const secondInfrastructure = await bootstrapBrainRuntimeInfrastructure(
        { projectId: "project-1", brainRoot },
        { gitRunner },
      );
      const first = createBrainApplicationServices(firstInfrastructure);
      const second = createBrainApplicationServices(secondInfrastructure);
      const core = parsePublicPath("@project/core.md");
      if (core.kind !== "core") throw new Error("expected Project Core");

      await first.maintenance.edit({ path: core, content: "route-a" });
      await second.maintenance.edit({
        path: core,
        edits: [{ oldText: "route-a", newText: "route-b" }],
      });

      await expect(
        first.maintenance.edit({
          path: core,
          edits: [{ oldText: "route-a", newText: "route-c" }],
        }),
      ).rejects.toMatchObject({ code: "old-text-not-found" });

      expect((await first.store.loadScope({ kind: "project" }))?.core.text).toBe("route-b");
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
});
