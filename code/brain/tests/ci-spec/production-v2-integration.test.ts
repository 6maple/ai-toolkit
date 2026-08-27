import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vite-plus/test";

import { registerBrainTools } from "../../src/integration/mcp-adapter.ts";
import { createBrainApplicationServices } from "../../src/runtime/application.ts";
import { bootstrapBrainRuntimeInfrastructure } from "../../src/runtime/bootstrap.ts";

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

describe("v2 real runtime + MCP integration", () => {
  it("serves write/cat/think on real storage even when Git history is unavailable", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-v2-integration-"));
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
          content: "---\nsummary: real integration memory\nimportance: high\n---\nreal body\n",
        },
      });
      expect(write.isError).not.toBe(true);
      expect(textOf(write)).toContain("created @project/memories/knowledge/real.md");

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
      expect(textOf(think)).toContain("<brain_think_context");
      expect(textOf(think)).toContain("@project/memories/knowledge/real.md");
    } finally {
      await client.close();
      await server.close();
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
});
