import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  registerBrainTools,
  type BrainApplicationServices,
} from "../../src/integration/mcp-adapter.ts";
import { createBrainServicesForRoot } from "../../src/runtime/production.ts";
import { parsePublicPath } from "../../src/brain/namespace.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "brain-virtual-"));
  roots.push(root);
  const sourceRoot = path.join(root, "project");
  await fs.mkdir(sourceRoot);
  const services = await createBrainServicesForRoot(path.join(root, "brain"), sourceRoot, {
    initializeSemantic: false,
  });
  return { services };
}

function textOf(result: unknown): string {
  return (result as { content: Array<{ type: string; text: string }> }).content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

async function withClient(
  services: BrainApplicationServices,
  run: (client: Client) => Promise<void>,
) {
  const server = new McpServer({ name: "virtual-test", version: "0" });
  registerBrainTools(server, services);
  const client = new Client({ name: "virtual-client", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(b), client.connect(a)]);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("built-in virtual context", () => {
  it("returns long memory views in full in routed and direct modes and recalculates after edits", async () => {
    const { services } = await fixture();
    const core = parsePublicPath("@project/core.md");
    if (core.kind !== "core") throw new Error("expected core");
    const longCore = `${"完整段落\n".repeat(12_000)}CORE_TAIL`;
    await services.maintenance.edit({ path: core, content: longCore });
    const { routed: _routed, ...direct } = services;
    for (const mode of [services, direct]) {
      await withClient(mode, async (client) => {
        const view = await client.callTool({
          name: "brain_cat",
          arguments: { path: "@brain-virtual/deep-memory.md", offset: 999_999, limit: 1 },
        });
        expect(view.isError).not.toBe(true);
        expect(textOf(view)).toContain(longCore);
        expect(textOf(view)).not.toContain("next_offset:");
        expect(textOf(view)).not.toContain("safety_truncated");
      });
    }
    await services.maintenance.edit({
      path: core,
      edits: [{ oldText: longCore, newText: "UPDATED_CORE" }],
    });
    await withClient(services, async (client) => {
      const view = await client.callTool({
        name: "brain_cat",
        arguments: { path: "@brain-virtual/normal-memory.md" },
      });
      expect(textOf(view)).toContain("UPDATED_CORE");
      expect(textOf(view)).not.toContain("CORE_TAIL");
    });
  });

  it("keeps views out of cognition mapping and mutation while exposing only the four known paths", async () => {
    const { services } = await fixture();
    await withClient(services, async (client) => {
      for (const name of ["brain_absolute_path", "brain_rm", "brain_edit"]) {
        const result = await client.callTool({
          name,
          arguments: {
            path: "@brain-virtual/normal.md",
            ...(name === "brain_edit" ? { content: "changed" } : {}),
          },
        });
        expect(result.isError).toBe(true);
      }
      for (const invalid of ["@brain-virtual/unknown.md", "@brain-virtual/../core.md"]) {
        const result = await client.callTool({ name: "brain_cat", arguments: { path: invalid } });
        expect(result.isError).toBe(true);
      }
      const normal = await client.callTool({
        name: "brain_cat",
        arguments: { path: "@brain-virtual/normal.md" },
      });
      expect(normal.isError).not.toBe(true);
      expect(textOf(normal)).toContain("@brain-virtual/normal-memory.md");
      expect(textOf(normal)).not.toContain("deep-memory");
    });
  });

  it("resolves fresh views for each invocation's project in the same MCP server", async () => {
    const first = (await fixture()).services;
    const second = (await fixture()).services;
    const core = parsePublicPath("@project/core.md");
    if (core.kind !== "core") throw new Error("expected core");
    await first.maintenance.edit({ path: core, content: "FIRST_PROJECT" });
    await second.maintenance.edit({ path: core, content: "SECOND_PROJECT" });
    const server = new McpServer({ name: "virtual-routing-test", version: "0" });
    registerBrainTools(server, undefined, {
      resolveInvocation: (extra) => ({
        services:
          (extra as { _meta?: { project?: string } })._meta?.project === "second" ? second : first,
      }),
    });
    const client = new Client({ name: "virtual-routing-client", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(b), client.connect(a)]);
      for (const project of ["first", "second", "first"]) {
        const result = await client.callTool({
          name: "brain_cat",
          arguments: { path: "@brain-virtual/deep-memory.md" },
          _meta: { project },
        });
        expect(result.isError).not.toBe(true);
        expect(textOf(result)).toContain(project === "first" ? "FIRST_PROJECT" : "SECOND_PROJECT");
        expect(textOf(result)).not.toContain(
          project === "first" ? "SECOND_PROJECT" : "FIRST_PROJECT",
        );
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
