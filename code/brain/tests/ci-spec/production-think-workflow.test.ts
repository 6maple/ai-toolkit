import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { registerBrainTools } from "../../src/integration/mcp-adapter.ts";
import { createBrainServicesForRoot } from "../../src/runtime/production.ts";
import { DEFAULT_THINK_WORKFLOW, loadThinkWorkflow } from "../../src/runtime/think-workflow.ts";

const tempRoots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "brain-workflow-"));
  tempRoots.push(root);
  const brainRoot = path.join(root, "data");
  const internalRoot = path.join(root, "package");
  await fs.mkdir(brainRoot);
  await fs.mkdir(path.join(internalRoot, "think-workflow/brain-ai"), { recursive: true });
  await fs.writeFile(path.join(internalRoot, "think-workflow/brain-ai/index.md"), "DEFAULT FLOW\n");
  const warnings: string[] = [];
  return {
    root,
    brainRoot,
    internalRoot,
    warnings,
    load: () =>
      loadThinkWorkflow(brainRoot, { internalRoot, warn: (message) => warnings.push(message) }),
    config: (value: unknown) =>
      fs.writeFile(path.join(brainRoot, "config.json"), JSON.stringify(value)),
  };
}
afterEach(async () => {
  for (const root of tempRoots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("think-workflow runtime", () => {
  it("resolves default, internal, config-relative and absolute files; empty is a successful read", async () => {
    const f = await fixture();
    expect(await f.load()).toEqual({
      source: DEFAULT_THINK_WORKFLOW,
      absolutePath: path.join(f.internalRoot, "think-workflow/brain-ai/index.md"),
      text: "DEFAULT FLOW\n",
    });
    await fs.mkdir(path.join(f.internalRoot, "think-workflow/custom"));
    await fs.writeFile(path.join(f.internalRoot, "think-workflow/custom/index.md"), "INTERNAL");
    await f.config({ thinkWorkflowFile: "@internal/think-workflow/custom/index.md" });
    expect((await f.load())?.text).toBe("INTERNAL");
    const external = path.join(f.brainRoot, "mine.md");
    await fs.writeFile(external, "RELATIVE");
    await f.config({ thinkWorkflowFile: "./mine.md", semanticSearch: { enabled: false } });
    expect(await f.load()).toEqual({ source: external, absolutePath: external, text: "RELATIVE" });
    await f.config({ thinkWorkflowFile: external, semanticSearch: "invalid but independent" });
    expect((await f.load())?.text).toBe("RELATIVE");
    await fs.writeFile(external, "");
    expect((await f.load())?.text).toBe("");
    expect(f.warnings).toEqual([]);
  });

  it("falls back on invalid config, paths, missing files and directories, with log-only warnings", async () => {
    const f = await fixture();
    for (const value of [
      { thinkWorkflowFile: 4 },
      { thinkWorkflowFile: "" },
      { thinkWorkflowFile: "missing.md" },
      { thinkWorkflowFile: "." },
      { thinkWorkflowFile: "@internal/../../outside.md" },
      { thinkWorkflowFile: "@global/core.md" },
      [],
    ]) {
      await f.config(value);
      expect(await f.load()).toEqual({
        source: DEFAULT_THINK_WORKFLOW,
        absolutePath: path.join(f.internalRoot, "think-workflow/brain-ai/index.md"),
        text: "DEFAULT FLOW\n",
      });
    }
    await fs.writeFile(path.join(f.brainRoot, "config.json"), "{ invalid");
    expect((await f.load())?.text).toBe("DEFAULT FLOW\n");
    await fs.unlink(path.join(f.brainRoot, "config.json"));
    await fs.mkdir(path.join(f.brainRoot, "config.json"));
    expect((await f.load())?.text).toBe("DEFAULT FLOW\n");
    expect(f.warnings).toHaveLength(9);
    expect(
      f.warnings.every((message) => message.includes("warning") && message.includes("fallback=")),
    ).toBe(true);
    await fs.unlink(path.join(f.internalRoot, "think-workflow/brain-ai/index.md"));
    expect(await f.load()).toBeUndefined();
  });

  it("refreshes choice and body in the same MCP instance and shares automatic restore behavior", async () => {
    const f = await fixture();
    const project = path.join(f.root, "project");
    await fs.mkdir(project);
    await fs.writeFile(path.join(f.brainRoot, "a.md"), "FLOW A\ncomplete tail A");
    await fs.writeFile(path.join(f.brainRoot, "b.md"), "FLOW B\ncomplete tail B");
    await f.config({ thinkWorkflowFile: "a.md" });
    const services = await createBrainServicesForRoot(f.brainRoot, project, {
      initializeSemantic: false,
    });
    const server = new McpServer({ name: "workflow-test", version: "0" });
    registerBrainTools(server, services);
    const client = new Client({ name: "workflow-client", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const deep = async () => {
        const result = await client.callTool({
          name: "brain_cat",
          arguments: { path: "@brain-virtual/deep.md" },
        });
        expect(result.isError).not.toBe(true);
        return (result.content as Array<{ type: string; text: string }>)
          .map((block) => block.text)
          .join("\n");
      };
      const initial = await client.callTool({ name: "brain_think", arguments: {} });
      expect(JSON.stringify(initial.content)).toContain("# 处理流程");
      expect(JSON.stringify(initial.content)).not.toContain("FLOW A");
      expect(await deep()).toContain(path.join(f.brainRoot, "a.md"));
      await f.config({ thinkWorkflowFile: "b.md" });
      expect(await deep()).toContain(path.join(f.brainRoot, "b.md"));
      await fs.writeFile(path.join(f.brainRoot, "b.md"), "UPDATED B");
      const deepText = await deep();
      const workflowPath = deepText.match(/`([^`]+)`/)![1];
      expect(path.isAbsolute(workflowPath!)).toBe(true);
      expect(await fs.readFile(workflowPath!, "utf8")).toBe("UPDATED B");
      const restored =
        services.routed === undefined
          ? await services.anchor.runAnchor({})
          : await services.routed.think();
      expect(restored.context).toContain("# 处理流程");
      expect(restored.context).not.toContain("UPDATED B");
      expect(restored.context).not.toContain("## 本轮记忆上下文");
      await f.config({ thinkWorkflowFile: "missing.md" });
      const fallback = await deep();
      expect(fallback).toContain(path.join("think-workflow", "brain-ai", "index.md"));
      expect(fallback).not.toContain("ENOENT");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
