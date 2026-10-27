import { describe, expect, test, vi } from "vite-plus/test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  BRAIN_EXPLICIT_RESTORE_INSTRUCTIONS,
  brainMcpServerInstructions,
  registerBrainTools,
  resolveBrainMcpRestoreMode,
  type BrainApplicationServices,
  type BrainToolRegistrationOptions,
} from "../../src/index.ts";
import { PUBLIC_BRAIN_TOOLS, type BrainToolName } from "../../src/public-tools.ts";
import { parsePublicPath } from "../../src/brain/namespace.ts";
import { MutationApplyError } from "../../src/persistence/operation-coordination.ts";

const EXPECTED_TOOLS = [
  "brain_absolute_path",
  "brain_cat",
  "brain_edit",
  "brain_feedback",
  "brain_glob",
  "brain_grep",
  "brain_ls",
  "brain_mv",
  "brain_rm",
  "brain_step",
  "brain_think",
  "brain_write",
] as const;

const EXPECTED_SEMANTIC_TOOLS = [...EXPECTED_TOOLS, "brain_ask_search"].sort();

function fakeServices(projectId = "project-1") {
  const calls: Array<{ name: string; args: unknown }> = [];
  const services = {
    binding: {
      brainRoot: "/brain",
      projectId,
      platform: "posix",
    },
    anchor: {
      readVirtual: vi.fn(async () => ({ context: "virtual-result", diagnostics: [] })),
      runAnchor: vi.fn(async (request) => {
        calls.push({ name: "think", args: request });
        return { context: "<brain_think_context />\n", diagnostics: [] };
      }),
    },
    reads: {
      ls: vi.fn(async (path, context) => {
        calls.push({ name: "ls", args: { path, context } });
        return { records: [], truncated: false, text: "ls-result" };
      }),
      glob: vi.fn(async (request, context) => {
        calls.push({ name: "glob", args: { request, context } });
        return { records: [], truncated: false, text: "glob-result" };
      }),
      grep: vi.fn(async (request, context) => {
        calls.push({ name: "grep", args: { request, context } });
        return { records: [], text: "grep-result" };
      }),
      cat: vi.fn(async (request) => {
        calls.push({ name: "cat", args: request });
        return { page: {}, text: "cat-result" };
      }),
    },
    maintenance: {
      write: vi.fn(async (path, content) => {
        calls.push({ name: "write", args: { path, content } });
        return { action: "created", path };
      }),
      edit: vi.fn(async (request) => {
        calls.push({ name: "edit", args: request });
        return { action: "edited", path: request.path, changed: true };
      }),
      remove: vi.fn(async (path) => {
        calls.push({ name: "rm", args: path });
        return { action: "removed", path };
      }),
      move: vi.fn(async (src, dst) => {
        calls.push({ name: "mv", args: { src, dst } });
        return { action: "moved", from: src, to: dst, replacedExistingDestination: false };
      }),
      feedback: vi.fn(async (path, feedback, challenge) => {
        calls.push({ name: "feedback", args: { path, feedback, challenge } });
        return feedback === "question"
          ? { action: "questioned", path, changed: true }
          : feedback === "resolve"
            ? { action: "resolved", path }
            : { action: "adopted", path };
      }),
    },
  } as unknown as BrainApplicationServices;
  return { services, calls };
}

function captureRegistration(
  services: BrainApplicationServices,
  options: BrainToolRegistrationOptions = {},
) {
  const registered = new Map<
    string,
    {
      config: {
        inputSchema: {
          safeParse(value: unknown): { success: boolean };
          shape?: Record<string, unknown>;
        };
        description: string;
        annotations?: {
          readOnlyHint?: boolean;
          destructiveHint?: boolean;
          idempotentHint?: boolean;
          openWorldHint?: boolean;
        };
      };
      handler: Function;
    }
  >();
  const server = {
    registerTool: vi.fn((name: string, config: never, handler: Function) => {
      registered.set(name, { config: config as never, handler });
    }),
  };
  registerBrainTools(server as never, services, options);
  return registered;
}

describe("generic MCP public contract", () => {
  test("explicit MCP restore advertises turn bootstrap guidance while host restore does not", () => {
    expect(brainMcpServerInstructions("explicit")).toBe(BRAIN_EXPLICIT_RESTORE_INSTRUCTIONS);
    expect(brainMcpServerInstructions("host")).toBeUndefined();
    expect(resolveBrainMcpRestoreMode(undefined)).toBe("explicit");
    expect(resolveBrainMcpRestoreMode("host")).toBe("host");
    expect(() => resolveBrainMcpRestoreMode("unknown")).toThrow(
      "BRAIN_MCP_RESTORE_MODE must be explicit or host",
    );
  });

  test("keeps semantic search off by default while the canonical tool source contains the optional definition", () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services);
    expect([...registered.keys()].sort()).toEqual([...EXPECTED_TOOLS]);
    expect(PUBLIC_BRAIN_TOOLS.map((tool) => tool.name).sort()).toEqual(EXPECTED_SEMANTIC_TOOLS);
    expect(new Set(PUBLIC_BRAIN_TOOLS.map((tool) => tool.name)).size).toBe(13);
    for (const tool of PUBLIC_BRAIN_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
      if (tool.name === "brain_ask_search") continue;
      expect(registered.get(tool.name)?.config.inputSchema).toBe(tool.inputSchema);
      if (tool.name !== "brain_step") {
        expect(tool).not.toHaveProperty("outputSchema");
        expect(registered.get(tool.name)?.config).not.toHaveProperty("outputSchema");
      }
      expect(registered.get(tool.name)?.config.annotations).toBe(tool.annotations);
    }
  });

  test("semantic feature exposes brain_ask_search from the same canonical tool source", () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services, {
      features: { semanticSearch: true },
    } as BrainToolRegistrationOptions);
    expect([...registered.keys()].sort()).toEqual(EXPECTED_SEMANTIC_TOOLS);
  });

  test("declares brain_think as closed-world and non-destructive without claiming read-only or idempotent behavior", () => {
    const think = PUBLIC_BRAIN_TOOLS.find((tool) => tool.name === "brain_think")!;
    expect(think.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  test("a host-owned lifecycle operation can be omitted without changing the canonical tool source", () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services, { exclude: ["brain_think"] });
    expect([...registered.keys()].sort()).toEqual(
      EXPECTED_TOOLS.filter((name) => name !== "brain_think"),
    );
    expect(PUBLIC_BRAIN_TOOLS.map((tool) => tool.name).sort()).toEqual(EXPECTED_SEMANTIC_TOOLS);
  });

  test("the real MCP SDK can list and call the registered Brain tools", async () => {
    const { services, calls } = fakeServices();
    const context = `<brain_think_context>\n${"完整认知正文\n".repeat(2_000)}</brain_think_context>\n`;
    services.anchor.runAnchor = vi.fn(async () => ({
      context,
      diagnostics: [{ code: "test-warning", message: "restore warning" }],
    })) as never;
    const pageText = "1: first line\nnext_offset: 2\n";
    services.reads.cat = vi.fn(async () => ({ page: {}, text: pageText })) as never;
    const server = new McpServer({ name: "brain-test", version: "0.0.0" });
    registerBrainTools(server, services);
    const client = new Client({ name: "brain-test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...EXPECTED_TOOLS]);
      const listedThink = listed.tools.find((tool) => tool.name === "brain_think")!;
      expect(listedThink.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
      const listedCat = listed.tools.find((tool) => tool.name === "brain_cat")!;
      expect(listedCat.description?.length).toBeGreaterThan(0);
      expect(listedCat.inputSchema).toMatchObject({
        properties: { path: { anyOf: expect.any(Array) } },
      });
      for (const tool of listed.tools) {
        if (tool.name === "brain_step") expect(tool.outputSchema).toBeDefined();
        else expect(tool.outputSchema).toBeUndefined();
      }
      const called = await client.callTool({
        name: "brain_write",
        arguments: {
          path: "@project/memories/knowledge/sdk.md",
          content: "---\ndescription: sdk\nimportance: medium\n---\nbody\n",
        },
      });
      expect(called.isError).not.toBe(true);
      expect(called.structuredContent).toBeUndefined();
      expect(called.content).toEqual([{ type: "text", text: expect.any(String) }]);
      expect(calls.at(-1)).toMatchObject({ name: "write" });
      const restored = await client.callTool({ name: "brain_think", arguments: {} });
      expect(restored.isError).not.toBe(true);
      expect(restored.structuredContent).toBeUndefined();
      expect(restored.content).toEqual([
        { type: "text", text: context },
        { type: "text", text: "warning: restore warning" },
      ]);
      const page = await client.callTool({
        name: "brain_cat",
        arguments: { path: "@project/core.md", limit: 1 },
      });
      expect(page.content).toEqual([{ type: "text", text: pageText }]);
      expect(page.structuredContent).toBeUndefined();
      services.reads.cat = vi.fn(async () => {
        throw Object.assign(new Error("not found"), { code: "not-found" });
      }) as never;
      const failed = await client.callTool({
        name: "brain_cat",
        arguments: { path: "@project/core.md" },
      });
      expect(failed.isError).toBe(true);
      expect(failed.structuredContent).toBeUndefined();
      expect(failed.content).toMatchObject([
        { type: "text", text: expect.stringContaining("not-found") },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("schemas expose only current arguments and reject hidden/legacy arguments", () => {
    const byName = new Map(PUBLIC_BRAIN_TOOLS.map((tool) => [tool.name, tool]));
    const keys = (name: BrainToolName) =>
      Object.keys(
        (byName.get(name)!.inputSchema as unknown as { shape: Record<string, unknown> }).shape,
      );
    expect(keys("brain_think")).toEqual([]);
    expect(keys("brain_absolute_path")).toEqual(["path"]);
    expect(keys("brain_ls")).toEqual(["path"]);
    expect(keys("brain_glob")).toEqual(["pattern", "path"]);
    expect(keys("brain_grep")).toEqual([
      "pattern",
      "path",
      "glob",
      "ignoreCase",
      "literal",
      "context",
    ]);
    expect(keys("brain_cat")).toEqual(["path", "offset", "limit"]);
    expect(keys("brain_write")).toEqual(["path", "content"]);
    expect(keys("brain_edit")).toEqual(["path", "edits", "content"]);
    expect(keys("brain_rm")).toEqual(["path"]);
    expect(keys("brain_mv")).toEqual(["src", "dst"]);
    expect(keys("brain_feedback")).toEqual(["path", "feedback", "challenge"]);

    for (const tool of PUBLIC_BRAIN_TOOLS) {
      expect(tool.inputSchema.safeParse({ unexpected: true }).success).toBe(false);
    }
    expect(
      byName.get("brain_write")!.inputSchema.safeParse({
        path: "@project/memories/knowledge/a.md",
        content: "x",
        confirmed: true,
      }).success,
    ).toBe(false);
    expect(
      byName.get("brain_rm")!.inputSchema.safeParse({
        path: "@project/memories/knowledge/a.md",
        reason: "legacy",
      }).success,
    ).toBe(false);
    expect(
      byName.get("brain_grep")!.inputSchema.safeParse({
        pattern: "needle",
        offset: 10,
      }).success,
    ).toBe(false);
  });

  test("edit schema enforces exactly one mode and feedback enum is current", () => {
    const byName = new Map(PUBLIC_BRAIN_TOOLS.map((tool) => [tool.name, tool]));
    const edit = byName.get("brain_edit")!.inputSchema;
    expect(edit.safeParse({ path: "@project/core.md", content: "" }).success).toBe(true);
    expect(
      edit.safeParse({
        path: "@project/memories/knowledge/a.md",
        edits: [{ oldText: "a", newText: "b" }],
      }).success,
    ).toBe(true);
    expect(edit.safeParse({ path: "@project/core.md" }).success).toBe(false);
    expect(edit.safeParse({ path: "@project/core.md", content: "x", edits: [] }).success).toBe(
      false,
    );
    expect(edit.safeParse({ path: "@project/core.md", edits: [] }).success).toBe(false);

    const feedback = byName.get("brain_feedback")!.inputSchema;
    expect(
      feedback.safeParse({ path: "@project/memories/knowledge/a.md", feedback: "adopt" }).success,
    ).toBe(true);
    expect(
      feedback.safeParse({
        path: "@project/memories/knowledge/a.md",
        feedback: "question",
        challenge: "why",
      }).success,
    ).toBe(true);
    expect(
      feedback.safeParse({
        path: "@project/memories/knowledge/a.md",
        feedback: "question",
      }).success,
    ).toBe(false);
    expect(
      feedback.safeParse({
        path: "@project/memories/knowledge/a.md",
        feedback: "question",
        challenge: "   ",
      }).success,
    ).toBe(false);
    expect(
      feedback.safeParse({
        path: "@project/memories/knowledge/a.md",
        feedback: "adopt",
        challenge: "ignored by the frozen signature",
      }).success,
    ).toBe(true);
    expect(
      feedback.safeParse({ path: "@project/memories/knowledge/a.md", feedback: "correct" }).success,
    ).toBe(false);
  });

  test("schemas distinguish cognition documents and memories directories across built-in and related roots", () => {
    const byName = new Map(PUBLIC_BRAIN_TOOLS.map((tool) => [tool.name, tool]));
    const validMemory = "@project/memories/knowledge/tool-contracts.md";
    const validDirectory = "@project/memories/knowledge/";

    expect(byName.get("brain_cat")!.inputSchema.safeParse({ path: validMemory }).success).toBe(
      true,
    );
    expect(
      byName.get("brain_cat")!.inputSchema.safeParse({ path: "@project/core.md" }).success,
    ).toBe(true);
    expect(byName.get("brain_cat")!.inputSchema.safeParse({ path: "#brain/core.md" }).success).toBe(
      true,
    );
    expect(
      byName.get("brain_cat")!.inputSchema.safeParse({
        path: "#brain/memories/knowledge/tool-contracts.md",
      }).success,
    ).toBe(true);
    expect(byName.get("brain_cat")!.inputSchema.safeParse({ path: "@project" }).success).toBe(
      false,
    );

    expect(byName.get("brain_ls")!.inputSchema.safeParse({ path: validDirectory }).success).toBe(
      true,
    );
    expect(
      byName.get("brain_ls")!.inputSchema.safeParse({ path: "@project/memories" }).success,
    ).toBe(true);
    expect(byName.get("brain_ls")!.inputSchema.safeParse({ path: "@project" }).success).toBe(false);
    expect(byName.get("brain_ls")!.inputSchema.safeParse({ path: validMemory }).success).toBe(
      false,
    );

    expect(
      byName.get("brain_write")!.inputSchema.safeParse({ path: "@project/core.md", content: "x" })
        .success,
    ).toBe(false);
    expect(
      byName.get("brain_edit")!.inputSchema.safeParse({
        path: "@project/core.md",
        content: "project cognition",
      }).success,
    ).toBe(true);
  });

  test("every public argument has model-facing schema guidance without locking copy", () => {
    for (const tool of PUBLIC_BRAIN_TOOLS) {
      const jsonSchema = tool.inputSchema.toJSONSchema() as {
        properties: Record<string, { description?: string }>;
      };
      for (const schema of Object.values(jsonSchema.properties)) {
        expect(schema.description?.length).toBeGreaterThan(0);
      }
    }
  });

  test("path errors retain stable error codes without locking recovery prose", async () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services);

    const lsResult = await registered.get("brain_ls")!.handler({ path: "@project" });
    expect(lsResult.isError).toBe(true);
    expect(lsResult.content[0].text).toMatch(/^error: invalid-object-shape(?:\n|$)/);

    services.reads.cat = vi.fn(async () => {
      const error = new Error("wrong kind") as Error & { code: string };
      error.code = "wrong-object-kind";
      throw error;
    }) as never;
    const catResult = await registered.get("brain_cat")!.handler({ path: "@project/core.md" });
    expect(catResult.isError).toBe(true);
    expect(catResult.content[0].text).toMatch(/^error: wrong-object-kind(?:\n|$)/);
  });

  test("model-correctable errors retain their code and include an actionable affordance", async () => {
    const { services } = fakeServices();
    services.reads.grep = vi.fn(async () => {
      const error = new Error("bad regex") as Error & { code: string };
      error.code = "invalid-regex";
      throw error;
    }) as never;
    const registered = captureRegistration(services);
    const regex = await registered.get("brain_grep")!.handler({ pattern: "(" });
    expect(regex.isError).toBe(true);
    expect(regex.content[0].text).toMatch(/^error: invalid-regex\n/);
    expect(regex.content[0].text).toContain("literal=true");

    services.maintenance.edit = vi.fn(async () => {
      const error = new Error("ambiguous edit") as Error & { code: string };
      error.code = "old-text-not-unique";
      throw error;
    }) as never;
    const edit = await registered.get("brain_edit")!.handler({
      path: "@project/core.md",
      edits: [{ oldText: "a", newText: "b" }],
    });
    expect(edit.content[0].text).toMatch(/^error: old-text-not-unique\n/);

    services.maintenance.write = vi.fn(async () => {
      const error = new Error("missing metadata") as Error & { code: string };
      error.code = "missing-importance";
      throw error;
    }) as never;
    const write = await registered.get("brain_write")!.handler({
      path: "@project/memories/knowledge/a.md",
      content: "---\ndescription: a\n---\n",
    });
    expect(write.content[0].text).toMatch(/^error: missing-importance\n/);
  });

  test("persistence mutation failures expose cause category, state and next action", async () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const busy = Object.assign(new Error("locked by another process"), { code: "EBUSY" });
      services.maintenance.edit = vi.fn(async () => {
        throw new MutationApplyError("mutation-failed", {
          operationName: "brain-edit",
          originalError: busy,
        });
      }) as never;

      const failed = await registered.get("brain_edit")!.handler({
        path: "@project/core.md",
        edits: [{ oldText: "a", newText: "b" }],
      });
      expect(failed.content[0].text).toContain("error: mutation-failed");
      expect(failed.content[0].text).toContain("reason: file-busy");
      expect(failed.content[0].text).toContain("state:");
      expect(failed.content[0].text).toContain("action:");

      const denied = Object.assign(new Error("access denied"), { code: "EACCES" });
      const restoreBusy = Object.assign(new Error("restore locked"), { code: "EBUSY" });
      services.maintenance.move = vi.fn(async () => {
        throw new MutationApplyError("mutation-partially-applied", {
          operationName: "brain-mv",
          originalError: denied,
          compensationErrors: [restoreBusy],
        });
      }) as never;

      const partial = await registered.get("brain_mv")!.handler({
        src: "@project/memories/knowledge/a.md",
        dst: "@project/memories/knowledge/b.md",
      });
      expect(partial.content[0].text).toContain("error: mutation-partially-applied");
      expect(partial.content[0].text).toContain("reason: permission-denied");
      expect(partial.content[0].text).toContain("compensation_reason: file-busy");
      expect(partial.content[0].text).toContain("Re-read both src and dst");
    } finally {
      log.mockRestore();
    }
  });

  test("an invocation resolver selects project services for each call", async () => {
    const first = fakeServices("project-1");
    const second = fakeServices("project-2");
    const registered = captureRegistration(first.services, {
      resolveInvocation: async (extra) => {
        const route = (extra as { route?: unknown }).route;
        return { services: route === "second" ? second.services : first.services };
      },
    });

    await registered.get("brain_think")!.handler({}, { route: "first" });
    await registered.get("brain_think")!.handler({}, { route: "second" });
    await registered.get("brain_glob")!.handler({ pattern: "**/*.md" }, { route: "second" });

    expect(first.calls.filter((call) => call.name === "think").map((call) => call.args)).toEqual([
      {},
    ]);
    expect(second.calls.filter((call) => call.name === "think").map((call) => call.args)).toEqual([
      {},
    ]);
    expect(second.calls.find((call) => call.name === "glob")?.args).toMatchObject({
      context: {},
    });
  });

  test("MCP cancellation signal is forwarded internally to ls and glob without becoming a model argument", async () => {
    const { services, calls } = fakeServices();
    const registered = captureRegistration(services);
    const controller = new AbortController();
    await registered
      .get("brain_ls")!
      .handler({ path: "@project/memories/" }, { signal: controller.signal });
    await registered
      .get("brain_glob")!
      .handler({ pattern: "**/*.md" }, { signal: controller.signal });
    const lsCall = calls.find((call) => call.name === "ls")!;
    const globCall = calls.find((call) => call.name === "glob")!;
    expect((lsCall.args as { context?: { signal?: AbortSignal } }).context?.signal).toBe(
      controller.signal,
    );
    expect(
      (globCall.args as { request: unknown; context: { signal?: AbortSignal } }).context.signal,
    ).toBe(controller.signal);
  });

  test("MCP cancellation signal is forwarded to grep execution", async () => {
    const { services, calls } = fakeServices();
    const registered = captureRegistration(services);
    const controller = new AbortController();
    await registered
      .get("brain_grep")!
      .handler({ pattern: "needle" }, { signal: controller.signal });
    const grepCall = calls.find((call) => call.name === "grep")!;
    expect((grepCall.args as { request: { signal?: AbortSignal } }).request.signal).toBe(
      controller.signal,
    );
  });

  test("dispatch parses current logical grammar and returns application output without alternate semantics", async () => {
    const { services, calls } = fakeServices();
    const registered = captureRegistration(services);
    const write = registered.get("brain_write")!.handler;
    const result = await write({
      path: "@project/memories/knowledge/a.md",
      content: "---\ndescription: a\nimportance: medium\n---\nbody\n",
    });
    expect(calls.at(-1)).toMatchObject({
      name: "write",
      args: { path: parsePublicPath("@project/memories/knowledge/a.md") },
    });
    expect(result.isError).not.toBe(true);
  });

  test("brain_absolute_path projects a wide workspace location without requiring it to exist", async () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services);
    const result = await registered.get("brain_absolute_path")!.handler({
      path: "@project/memories/skill/report/template.xlsx",
    });
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("template.xlsx");
    expect(result.content[0].text.startsWith("/")).toBe(true);
  });

  test("unknown infrastructure failures return a generic safe failure instead of raw internals", async () => {
    const { services } = fakeServices();
    services.reads.cat = vi.fn(async () => {
      throw new Error("secret physical path /brain/projects/private/.state/a.json");
    }) as never;
    const registered = captureRegistration(services);
    const result = await registered.get("brain_cat")!.handler({
      path: "@project/memories/knowledge/a.md",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("/brain/");
    expect(result.content[0].text).not.toContain(".state");
  });
});
