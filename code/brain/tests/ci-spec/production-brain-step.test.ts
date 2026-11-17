import { readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vite-plus/test";
import {
  definition,
  executeStep,
  initialPrompt,
  registerBrainStep,
  stepPromptForProject,
} from "../../step/index.mjs";
import { registerBrainTools } from "../../src/integration/mcp-adapter.ts";

const prompt = (i: number) =>
  readFileSync(new URL(`../../step/prompts/step${i}.md`, import.meta.url), "utf8");

async function workspace(test: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "brain-step-"));
  try {
    await test(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withClient(
  register: (server: McpServer) => void,
  test: (client: Client) => Promise<void>,
) {
  const server = new McpServer({ name: "brain-step-contract", version: "1" });
  register(server);
  const client = new Client({ name: "brain-step-test", version: "1" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(left), server.connect(right)]);
    await test(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("brain_step: fixed prompts without step state", () => {
  it("reloads edited prompts within the same process after metadata changes", async () => {
    await workspace(async (root) => {
      const promptsDirectory = path.join(root, "prompts");
      await mkdir(promptsDirectory);
      await copyFile(
        new URL("../../step/views.mjs", import.meta.url),
        path.join(root, "views.mjs"),
      );
      for (const number of [1, 2, 3, 4]) {
        await writeFile(path.join(promptsDirectory, `step${number}.md`), prompt(number));
      }

      const { initialPrompt: loadedInitial, taskView } = await import(
        pathToFileURL(path.join(root, "views.mjs")).href
      );
      expect(loadedInitial).toBe(prompt(1));
      expect(taskView("start")).toBe(prompt(2));
      expect(taskView("ready")).toBe(prompt(3));
      expect(taskView("review")).toBe(prompt(4));
      expect(taskView("review")).toBe(prompt(4));

      const file = path.join(promptsDirectory, "step4.md");
      const updated = "x".repeat(Buffer.byteLength(prompt(4), "utf8"));
      await writeFile(file, updated);
      await utimes(file, new Date("2030-01-01"), new Date("2030-01-01"));
      expect(taskView("review")).toBe(updated);
      expect(taskView("review")).toBe(updated);

      const updatedAgain = "y".repeat(updated.length);
      await writeFile(file, updatedAgain);
      await utimes(file, new Date("2031-01-01"), new Date("2031-01-01"));
      expect(taskView("review")).toBe(updatedAgain);
      expect(taskView("ready")).toBe(prompt(3));
      expect(taskView("start")).toBe(prompt(2));
      expect(loadedInitial).toBe(prompt(1));
    });
  });

  it("returns the official prompts without appending a turn ID", async () => {
    expect(initialPrompt).toBe(prompt(1));
    expect(await executeStep({ action: "start", thought: "初步考虑背景和目的" })).toBe(prompt(2));
    expect(await executeStep({ action: "ready", thought: "进一步核对目标和资料" })).toBe(prompt(3));
    expect(await executeStep({ action: "review", thought: "完成工作和复检" })).toBe(prompt(4));
    expect(await executeStep({ action: "ready", thought: "继续改进" })).toBe(prompt(3));
  });

  it("requires thought and rejects the removed read and turnId parameters", async () => {
    for (const value of [
      { action: "start" },
      { action: "ready" },
      { action: "review" },
      { action: "start", thought: "  " },
      { action: "read" },
      { action: "read", thought: "旧记录" },
      { action: "start", thought: "x", turnId: "old-id" },
      { action: "ready", thought: "x", turnId: "old-id" },
    ]) {
      await expect(executeStep(value)).rejects.toThrow();
    }
  });

  it("exposes the two-field schema and returns prompts via MCP", async () => {
    await withClient(
      (server) => registerBrainStep(server, "D:/Workspace/test-project"),
      async (client) => {
        const tools = (await client.listTools()).tools;
        expect(tools).toHaveLength(1);
        expect(tools[0]?.name).toBe("brain_step");
        expect(tools[0]?.description).toBe(definition.description);
        expect(tools[0]?.inputSchema).toMatchObject({
          required: ["action", "thought"],
          additionalProperties: false,
          properties: { action: { enum: ["start", "ready", "review"] } },
        });
        const call = (args: Record<string, string>) =>
          client.callTool({ name: "brain_step", arguments: args });
        const started = await call({ action: "start", thought: "MCP 思考" });
        expect(started.isError).not.toBe(true);
        expect(started).toMatchObject({
          content: [
            { type: "text", text: stepPromptForProject(prompt(2), "D:/Workspace/test-project") },
          ],
        });
        const continued = await call({ action: "ready", thought: "MCP 深化" });
        expect(continued).toMatchObject({
          content: [
            { type: "text", text: stepPromptForProject(prompt(3), "D:/Workspace/test-project") },
          ],
        });
        const reviewed = await call({ action: "review", thought: "MCP 复检" });
        expect(reviewed).toMatchObject({
          content: [
            { type: "text", text: stepPromptForProject(prompt(4), "D:/Workspace/test-project") },
          ],
        });
        expect((await call({ action: "read", thought: "x" })).isError).toBe(true);
        expect((await call({ action: "ready" })).isError).toBe(true);
      },
    );
  });

  it("returns prompts via the routed MCP adapter", async () => {
    await workspace(async (root) => {
      await withClient(
        (server) =>
          registerBrainTools(server, undefined, {
            restoreMode: "host",
            resolveInvocation: () => ({
              services: { binding: {}, sourceRoot: root } as never,
            }),
          }),
        async (client) => {
          const call = (args: Record<string, string>) =>
            client.callTool({ name: "brain_step", arguments: args });
          const started = await call({ action: "start", thought: "host start" });
          expect(started.isError).not.toBe(true);
          expect(started).toMatchObject({
            content: [{ type: "text", text: stepPromptForProject(prompt(2), root) }],
          });
          const ready = await call({ action: "ready", thought: "host ready" });
          expect(ready).toMatchObject({
            content: [{ type: "text", text: stepPromptForProject(prompt(3), root) }],
          });
          await expect(stat(path.join(root, ".brain-working", "brain-step"))).rejects.toMatchObject(
            {
              code: "ENOENT",
            },
          );
        },
      );
    });
  });
});
