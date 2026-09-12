import { describe, expect, test, vi } from "vite-plus/test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  registerBrainTools,
  type BrainApplicationServices,
  type BrainToolRegistrationOptions,
} from "../../src/index.ts";
import { PUBLIC_BRAIN_TOOLS, type BrainToolName } from "../../src/public-tools.ts";
import { parsePublicPath } from "../../src/brain/namespace.ts";

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
  "brain_think",
  "brain_write",
] as const;

function fakeServices(projectId = "project-1") {
  const calls: Array<{ name: string; args: unknown }> = [];
  const services = {
    binding: {
      brainRoot: "/brain",
      projectId,
      platform: "posix",
    },
    anchor: {
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
        outputSchema: {
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
  registerBrainTools(server as never, services, undefined, options);
  return registered;
}

describe("brain v2 generic MCP public contract", () => {
  test("registers exactly the Frozen 11-tool surface from one in-code definition source", () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services);
    expect([...registered.keys()].sort()).toEqual([...EXPECTED_TOOLS]);
    expect(PUBLIC_BRAIN_TOOLS.map((tool) => tool.name).sort()).toEqual([...EXPECTED_TOOLS]);
    expect(new Set(PUBLIC_BRAIN_TOOLS.map((tool) => tool.name)).size).toBe(11);
    for (const tool of PUBLIC_BRAIN_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(registered.get(tool.name)?.config.inputSchema).toBe(tool.inputSchema);
      expect(registered.get(tool.name)?.config.outputSchema).toBe(tool.outputSchema);
      expect(registered.get(tool.name)?.config.annotations).toBe(tool.annotations);
    }
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
    expect(PUBLIC_BRAIN_TOOLS.map((tool) => tool.name).sort()).toEqual([...EXPECTED_TOOLS]);
  });

  test("the real MCP SDK can list and call the registered v2 tools", async () => {
    const { services, calls } = fakeServices();
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
        properties: { path: { type: "string", pattern: expect.any(String) } },
      });
      expect(listedCat.outputSchema).toMatchObject({
        properties: { text: { type: "string" } },
      });
      const called = await client.callTool({
        name: "brain_write",
        arguments: {
          path: "@project/memories/knowledge/sdk.md",
          content: "---\nsummary: sdk\nimportance: medium\n---\nbody\n",
        },
      });
      expect(called.isError).not.toBe(true);
      expect(called.structuredContent).toEqual({ text: expect.any(String) });
      expect(calls.at(-1)).toMatchObject({ name: "write" });
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
    expect(keys("brain_think")).toEqual(["session_id"]);
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

  test("schemas distinguish resident core, archival documents, and memories directories", () => {
    const byName = new Map(PUBLIC_BRAIN_TOOLS.map((tool) => [tool.name, tool]));
    const validMemory = "@project/memories/knowledge/tool-contracts.md";
    const validDirectory = "@project/memories/knowledge/";

    expect(byName.get("brain_cat")!.inputSchema.safeParse({ path: validMemory }).success).toBe(
      true,
    );
    expect(
      byName.get("brain_cat")!.inputSchema.safeParse({ path: "@project/core.md" }).success,
    ).toBe(false);
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
      const shape = (
        tool.inputSchema as unknown as { shape: Record<string, { description?: string }> }
      ).shape;
      for (const schema of Object.values(shape)) {
        expect(schema.description?.length).toBeGreaterThan(0);
      }
    }
  });

  test("path errors include tool-specific recovery guidance", async () => {
    const { services } = fakeServices();
    const registered = captureRegistration(services);

    const lsResult = await registered.get("brain_ls")!.handler({ path: "@project" });
    expect(lsResult.isError).toBe(true);
    expect(lsResult.content[0].text).toContain("@project/memories/");
    expect(lsResult.content[0].text).toContain("Do not pass @project");

    services.reads.cat = vi.fn(async () => {
      const error = new Error("wrong kind") as Error & { code: string };
      error.code = "wrong-object-kind";
      throw error;
    }) as never;
    const catResult = await registered.get("brain_cat")!.handler({ path: "@project/core.md" });
    expect(catResult.isError).toBe(true);
    expect(catResult.content[0].text).toContain("cannot read core.md");
    expect(catResult.content[0].text).toContain("already fully present");
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
    expect(edit.content[0].text).toContain("unique region");

    services.maintenance.write = vi.fn(async () => {
      const error = new Error("missing metadata") as Error & { code: string };
      error.code = "missing-importance";
      throw error;
    }) as never;
    const write = await registered.get("brain_write")!.handler({
      path: "@project/memories/knowledge/a.md",
      content: "---\nsummary: a\n---\n",
    });
    expect(write.content[0].text).toMatch(/^error: missing-importance\n/);
    expect(write.content[0].text).toContain("summary and importance frontmatter");
  });

  test("maintenance results describe execution facts without implying cognition adoption", async () => {
    const { services } = fakeServices();
    services.maintenance.feedback = vi.fn(async (path, feedback) =>
      feedback === "question"
        ? { action: "questioned", path, changed: false }
        : { action: "adopted", path },
    ) as never;
    services.maintenance.edit = vi.fn(async (request) => ({
      action: "edited",
      path: request.path,
      changed: false,
    })) as never;
    const registered = captureRegistration(services);
    const path = "@project/memories/knowledge/a.md";

    const adopt = await registered.get("brain_feedback")!.handler({ path, feedback: "adopt" });
    expect(adopt.content[0].text).toContain("validated use");
    expect(adopt.content[0].text).toContain(path);

    const question = await registered
      .get("brain_feedback")!
      .handler({ path, feedback: "question", challenge: "basis" });
    expect(question.content[0].text).toContain("challenge unchanged");
    expect(question.content[0].text).toContain(path);

    const edit = await registered.get("brain_edit")!.handler({ path, content: "same" });
    expect(edit.content[0].text).toMatch(/^no changes:/);
    expect(edit.content[0].text).toContain(path);
  });

  test("trusted host session wins, conflicts are rejected, and explicit session remains a fallback", async () => {
    const { services, calls } = fakeServices();
    const registered = captureRegistration(services);
    const think = registered.get("brain_think")!.handler;

    await think({ session_id: "trusted" }, { _meta: { threadId: "trusted" } });
    await think({}, { _meta: { threadId: "trusted" } });
    await think({ session_id: "explicit" }, {});
    await think({}, {});
    const conflict = await think({ session_id: "different" }, { _meta: { threadId: "trusted" } });
    expect(calls.filter((call) => call.name === "think").map((call) => call.args)).toEqual([
      { currentSessionId: "trusted" },
      { currentSessionId: "trusted" },
      { currentSessionId: "explicit" },
      {},
    ]);
    expect(conflict.isError).toBe(true);
    expect(conflict.content[0].text).toMatch(/^error: session-id-conflict\n/);
    expect(conflict.content[0].text).toContain("session_id");
  });

  test("an invocation resolver keeps project services and trusted session identity together", async () => {
    const first = fakeServices("project-1");
    const second = fakeServices("project-2");
    const registered = captureRegistration(first.services, {
      resolveInvocation: async (extra) => {
        const route = (extra as { route?: unknown }).route;
        return route === "second"
          ? { services: second.services, currentSessionId: "session-2" as never }
          : { services: first.services, currentSessionId: "session-1" as never };
      },
    });

    await registered.get("brain_think")!.handler({}, { route: "first" });
    await registered.get("brain_think")!.handler({}, { route: "second" });
    await registered.get("brain_glob")!.handler({ pattern: "**/*.md" }, { route: "second" });

    expect(first.calls.filter((call) => call.name === "think").map((call) => call.args)).toEqual([
      { currentSessionId: "session-1" },
    ]);
    expect(second.calls.filter((call) => call.name === "think").map((call) => call.args)).toEqual([
      { currentSessionId: "session-2" },
    ]);
    expect(second.calls.find((call) => call.name === "glob")?.args).toMatchObject({
      context: { currentSessionId: "session-2" },
    });
  });

  test("omitted glob/grep path can consume trusted current session without mutating model args", async () => {
    const { services, calls } = fakeServices();
    const registered = captureRegistration(services);
    await registered
      .get("brain_glob")!
      .handler({ pattern: "**/*.md" }, { _meta: { threadId: "s1" } });
    await registered
      .get("brain_grep")!
      .handler({ pattern: "needle" }, { _meta: { threadId: "s1" } });
    const discovery = calls.filter((call) => call.name === "glob" || call.name === "grep");
    expect(discovery).toEqual([
      expect.objectContaining({
        args: expect.objectContaining({ context: { currentSessionId: "s1" } }),
      }),
      expect.objectContaining({
        args: expect.objectContaining({ context: { currentSessionId: "s1" } }),
      }),
    ]);
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
      content: "---\nsummary: a\nimportance: medium\n---\nbody\n",
    });
    expect(calls.at(-1)).toMatchObject({
      name: "write",
      args: { path: parsePublicPath("@project/memories/knowledge/a.md") },
    });
    expect(result.content[0].text).toContain("created @project/memories/knowledge/a.md");
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
