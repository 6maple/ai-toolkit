import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vite-plus/test";
import {
  definition,
  executeStep,
  initialPrompt,
  registerBrainStep,
} from "../../step/index.mjs";
import { registerBrainTools } from "../../src/integration/mcp-adapter.ts";

const prompt = (i: number) => readFileSync(new URL(`../../step/prompts/step${i}.md`, import.meta.url), "utf8");

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

describe("brain_step: stateless fixed prompts", () => {
  it("loads the four official prompts and returns their complete text", () => {
    expect(initialPrompt).toBe(prompt(1));
    expect(executeStep({ action: "start" })).toBe(prompt(2));
    expect(executeStep({ action: "ready" })).toBe(prompt(3));
    expect(executeStep({ action: "review" })).toBe(prompt(4));
  });

  it("maps each action to fixed text without turn state", () => {
    expect(executeStep({ action: "start" })).toBe(prompt(2));
    expect(executeStep({ action: "ready" })).toBe(prompt(3));
    expect(executeStep({ action: "review" })).toBe(prompt(4));
    expect(executeStep({ action: "ready" })).toBe(prompt(3));
    expect(executeStep({ action: "review" })).toBe(prompt(4));
    expect(() => executeStep({ action: "read" })).toThrow();
    expect(() => executeStep({ action: "start", turnId: "legacy" })).toThrow();
    expect(() => executeStep({ action: "start", message: "legacy" })).toThrow();
    expect(() => executeStep({ action: "review", result: "legacy" })).toThrow();
    expect(() => executeStep({})).toThrow();
  });

  it("exposes only one action field through the MCP schema", async () => {
    await withClient((server) => registerBrainStep(server), async (client) => {
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("brain_step");
      expect(tools[0]?.description).toBe(definition.description);
      expect(tools[0]?.inputSchema).toMatchObject({
        required: ["action"],
        additionalProperties: false,
        properties: { action: { enum: ["start", "ready", "review"] } },
      });
      const call = (action: string) => client.callTool({ name: "brain_step", arguments: { action } });
      for (const [action, i] of [["start", 2], ["ready", 3], ["review", 4], ["ready", 3]] as const) {
        const response = await call(action);
        expect(response.isError).not.toBe(true);
        expect(response.content).toEqual([{ type: "text", text: prompt(i) }]);
      }
      expect((await call("invalid")).isError).toBe(true);
    });
  });

  it("returns the same text from the shared MCP adapter without a host Step state", async () => {
    await withClient((server) => registerBrainTools(server, undefined, {
      restoreMode: "host",
      resolveInvocation: () => ({
        services: { binding: {}, sourceRoot: "irrelevant" } as never,
      }),
    }), async (client) => {
      for (const action of ["review", "ready", "start", "review"] as const) {
        const response = await client.callTool({ name: "brain_step", arguments: { action } });
        expect(response.isError).not.toBe(true);
        expect(response.content).toEqual([{ type: "text", text: executeStep({ action }) }]);
      }
    });
  });
});
