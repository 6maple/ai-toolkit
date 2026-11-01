import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vite-plus/test";
import {
  registerBrainTools,
  type BrainApplicationServices,
} from "../../src/integration/mcp-adapter.ts";
import {
  createFileRuntime,
  definition,
  registerBrainStep,
  statePathFor,
  type BrainStepFileSystem,
  type BrainStepHost,
} from "../../step/index.mjs";

const passed = (assessment: string) => ({ outcome: "passed", assessment });
const deliveryPreparation = "准备最终回复或未完成交接前，先读取并严格执行下方交付指导：\n";

function guidance(result: unknown) {
  const response = result as { isError?: boolean; structuredContent: { guidance: string } };
  expect(response.isError).not.toBe(true);
  return response.structuredContent.guidance;
}

async function fixture(options: { fileSystem?: BrainStepFileSystem } = {}) {
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "brain-step-"));
  const host: BrainStepHost = { conversationId: "session-a", turnId: "turn-1", sourceRoot };
  let currentHost = host;
  let hostReads = 0;
  const server = new McpServer({ name: "brain-step-contract", version: "1.0.0" });
  const runtime = createFileRuntime({
    resolveHost() {
      hostReads++;
      return currentHost;
    },
    ...options,
  });
  registerBrainStep(server, runtime);
  const client = new Client({ name: "brain-step-check", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(left), client.connect(right)]);
  const call = (request: Record<string, unknown>) =>
    client.callTool({ name: "brain_step", arguments: request });
  const raw = () => fs.readFile(statePathFor(currentHost), "utf8");
  const state = async () => JSON.parse(await raw()).state;
  return {
    client,
    call,
    raw,
    state,
    host,
    hostReads: () => hostReads,
    setHost(value: BrainStepHost) {
      currentHost = value;
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

async function ready(
  f: Awaited<ReturnType<typeof fixture>>,
  phase: "intent" | "essence" | "work" = "work",
) {
  await f.call({ action: "start", message: "合成契约检查；不执行真实业务。" });
  await f.call({
    action: "update",
    updates: {
      intent: "合成意图及依据",
      scope: "仅合成契约核对",
      analysis: "合成关系和证明边界",
      research: "合成方法来源与适用条件",
      method: "合成核对方法",
      acceptance: "合成标准和核对方式",
      result: "合成核对结果",
      replyDraft: "草稿A",
    },
  });
  if (phase === "intent") return;
  await f.call({
    action: "submit",
    phase: "intent",
    decision: "advance",
    assessment: "合成意图范围已核对",
  });
  if (phase === "essence") return;
  await f.call({
    action: "submit",
    phase: "essence",
    decision: "advance",
    assessment: "合成关系已核对",
  });
}

describe("brain_step native MCP and persisted state", () => {
  it.each(["intent", "essence", "work"] as const)(
    "provides readable delivery guidance and restores drafts before finishing %s",
    async (phase) => {
      const f = await fixture();
      try {
        const started = await f.call({
          action: "start",
          message: "合成契约检查；不执行真实业务。",
        });
        expect(guidance(started)).toContain(deliveryPreparation);
        await ready(f, phase);
        const before = await f.raw();
        const status = await f.call({ action: "status" });
        expect(status.structuredContent).toMatchObject({ currentPhase: phase });
        const current = guidance(status);
        expect(current).toContain("草稿A");
        const resourcePath = current.split(deliveryPreparation)[1]?.split("\n")[0];
        expect(path.isAbsolute(resourcePath)).toBe(true);
        expect(await fs.readFile(resourcePath, "utf8")).toBe(
          await fs.readFile(
            new URL("../../step/guidance/delivery-rules.md", import.meta.url),
            "utf8",
          ),
        );
        const overview = guidance(await f.call({ action: "overview" }));
        expect(overview).toContain("用status读取完整文本");
        expect(overview).not.toContain("草稿A");
        expect(await f.raw()).toBe(before);
        const updated = guidance(await f.call({ action: "update", progress: "读取路径已核对" }));
        expect(updated).not.toContain(deliveryPreparation);
        expect(updated).not.toContain("# 本轮交付");
        await f.call({ action: "update", updates: { replyDraft: null } });
        expect(guidance(await f.call({ action: "status" }))).not.toContain("当前回复草稿：");
        expect(guidance(await f.call({ action: "overview" }))).not.toContain(
          "用status读取完整文本",
        );
      } finally {
        await f.close();
      }
    },
  );

  it.each(["intent", "essence", "work"] as const)(
    "restores the unfinished phase and its actual handoff reason in %s",
    async (phase) => {
      const f = await fixture();
      try {
        await ready(f, phase);
        const reason = "当前授权范围内的调查已完成，缺少用户才能提供的原始资料，取得后继续核对。";
        guidance(
          await f.call({
            action: "submit",
            phase,
            decision: "handoff",
            assessment: reason,
            workflow: passed("已核对当前应执行流程和无法继续的具体前提"),
          }),
        );
        const before = await f.raw();
        const overview = await f.call({ action: "overview" });
        expect(overview.structuredContent).toMatchObject({ currentPhase: phase });
        expect(guidance(overview)).toContain("原阶段尚未完成");
        expect(guidance(overview)).toContain(reason);
        const status = guidance(await f.call({ action: "status" }));
        expect(status).toContain(reason);
        expect(status).toContain("草稿A");
        expect(await f.raw()).toBe(before);
        const current = await f.state();
        expect(current.phases[phase].status).toBe("active");
        expect(current.reviews.completion).toBeNull();
      } finally {
        await f.close();
      }
    },
  );

  it("points to overview for completed task content without a separate artifact", async () => {
    const f = await fixture();
    try {
      await ready(f);
      guidance(
        await f.call({
          action: "update",
          updates: {
            taskChanges: [
              { kind: "add", scheduledFor: "current_round", description: "交付已核对的文字结论" },
            ],
          },
        }),
      );
      const taskId = (await f.state()).tasks[0].id as string;
      const content = "任务成品正文：核对依据支持的结论与未测范围。";
      guidance(
        await f.call({
          action: "update",
          updates: {
            taskChanges: [{ kind: "complete", taskId, result: { content, artifacts: [] } }],
          },
        }),
      );
      const finished = await f.call({
        action: "submit",
        phase: "work",
        decision: "finish",
        completion: passed("已核对实际文字成品及交付范围"),
        workflow: passed("已核对本轮实际流程"),
      });
      expect(finished.structuredContent).toMatchObject({ currentPhase: null });
      expect(guidance(finished)).toContain("调用overview");
      expect(guidance(finished)).not.toContain(content);
      const before = await f.raw();
      expect(guidance(await f.call({ action: "overview" }))).toContain(content);
      expect(guidance(await f.call({ action: "status" }))).toContain("调用overview");
      expect(await f.raw()).toBe(before);
    } finally {
      await f.close();
    }
  });

  it.each(["current_round", "future"] as const)(
    "lists only actual unfinished work for %s without changing task status",
    async (scheduledFor) => {
      const f = await fixture();
      const statuses = ["todo", "doing", "blocked", "deferred", "done", "cancelled"] as const;
      try {
        await ready(f);
        guidance(
          await f.call({
            action: "update",
            updates: {
              taskChanges: statuses.map((status) => ({
                kind: "add",
                scheduledFor,
                description: `fixture-${scheduledFor}-${status}`,
              })),
            },
          }),
        );
        const tasks = (await f.state()).tasks as Array<{ id: string; description: string }>;
        const taskChanges: Array<Record<string, unknown>> = [];
        for (const [index, status] of statuses.entries()) {
          const taskId = tasks[index].id;
          if (status === "doing")
            taskChanges.push({ kind: "progress", taskId, progress: "已取得部分进展" });
          else if (status === "done")
            taskChanges.push({
              kind: "complete",
              taskId,
              result: { content: "实际结果已核对", artifacts: [] },
            });
          else if (status !== "todo")
            taskChanges.push({
              kind: { blocked: "block", deferred: "defer", cancelled: "cancel" }[status],
              taskId,
              reason: "按当前实际前提和决定保存状态",
            });
        }
        guidance(await f.call({ action: "update", updates: { taskChanges } }));
        const handoff = guidance(
          await f.call({
            action: "submit",
            phase: "work",
            decision: "handoff",
            assessment: "本次仅获准核对任务展示，未获准执行业务任务；展示核对后交接现状。",
            workflow: passed("已核对实际权限和未完状态"),
          }),
        );
        const remaining = handoff
          .split("尚未完成及后续验收安排：\n")[1]
          ?.split("深度思考笔记实际位置：\n")[0];
        expect(remaining).toBeDefined();
        for (const status of statuses)
          if (["done", "cancelled"].includes(status))
            expect(remaining).not.toContain(`fixture-${scheduledFor}-${status}`);
          else expect(remaining).toContain(`fixture-${scheduledFor}-${status}`);
        const before = await f.raw();
        const overview = guidance(await f.call({ action: "overview" }));
        expect(overview).toContain(`fixture-${scheduledFor}-done`);
        expect(overview).toContain(`fixture-${scheduledFor}-cancelled`);
        const after = await f.state();
        expect(
          after.tasks.map((task: { execution: { status: string } }) => task.execution.status),
        ).toEqual(statuses);
        expect(await f.raw()).toBe(before);
      } finally {
        await f.close();
      }
    },
  );

  it("uses the common Brain registry with trusted per-call host identity and rejects absent identity", async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "brain-step-common-"));
    const services = { sourceRoot } as BrainApplicationServices;
    let host: BrainStepHost | undefined = {
      conversationId: "common-session",
      turnId: "one",
      sourceRoot,
    };
    const server = new McpServer({ name: "brain-common", version: "1" });
    registerBrainTools(server, undefined, {
      resolveInvocation: () => ({ services, stepHost: host }),
    });
    const client = new Client({ name: "common-check", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(left), client.connect(right)]);
    try {
      expect((await client.listTools()).tools.some((tool) => tool.name === "brain_step")).toBe(
        true,
      );
      const call = (arguments_: Record<string, unknown>) =>
        client.callTool({ name: "brain_step", arguments: arguments_ });
      const started = await call({ action: "start", message: "第一轮" });
      expect(started.isError).not.toBe(true);
      const file = statePathFor(host!);
      const before = await fs.readFile(file, "utf8");
      host = undefined;
      const missing = await call({ action: "start", message: "不应覆盖" });
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing.content)).toContain("宿主须提供");
      expect(await fs.readFile(file, "utf8")).toBe(before);
      host = { conversationId: "common-session", turnId: "two", sourceRoot };
      expect((await call({ action: "start", message: "第二轮" })).isError).not.toBe(true);
      expect(JSON.parse(await fs.readFile(file, "utf8")).state.message).toBe("第二轮");
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("publishes its contract and rejects invalid input before resolving or mutating host state", async () => {
    const f = await fixture();
    try {
      const listed = (await f.client.listTools()).tools;
      expect(listed).toHaveLength(1);
      expect(listed[0].name).toBe("brain_step");
      expect(listed[0].description).toBe(definition.description);
      expect(listed[0].outputSchema).toBeDefined();
      const result = await f.call({ action: "update", taskChanges: [] });
      expect(result.isError).toBe(true);
      expect(f.hostReads()).toBe(0);
      await expect(f.raw()).rejects.toMatchObject({ code: "ENOENT" });
      const unstarted = await f.call({ action: "status" });
      expect(unstarted.isError).toBe(true);
      await expect(f.raw()).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await f.close();
    }
  });

  it("preserves same-turn progress, isolates conversations and resets only on a real new turn", async () => {
    const f = await fixture();
    try {
      const started = await f.call({ action: "start", message: "第一轮" });
      expect(JSON.parse((started.content as { text: string }[])[0].text)).toEqual(
        started.structuredContent,
      );
      await f.call({
        action: "update",
        progress: "已核对一项",
        updates: { intent: "当前有据理解" },
      });
      const before = await f.raw();
      for (const request of [
        { action: "status" },
        { action: "overview" },
        { action: "start", message: "第一轮" },
      ]) {
        expect((await f.call(request)).isError).not.toBe(true);
        expect(await f.raw()).toBe(before);
      }
      expect((await f.call({ action: "start", message: "冒充同轮的新消息" })).isError).toBe(true);
      expect(await f.raw()).toBe(before);
      f.setHost({ ...f.host, conversationId: "session-b" });
      await f.call({ action: "start", message: "另一个会话" });
      expect(statePathFor(f.host)).not.toBe(
        statePathFor({ ...f.host, conversationId: "session-b" }),
      );
      f.setHost(f.host);
      expect(await f.raw()).toBe(before);
      f.setHost({ ...f.host, turnId: "turn-2" });
      await f.call({ action: "start", message: "第二轮" });
      const current = await f.state();
      expect(current.message).toBe("第二轮");
      expect(current.notes.intent).toBeNull();
      expect(current.tasks).toEqual([]);
      expect(current.phases.intent.status).toBe("active");
    } finally {
      await f.close();
    }
  });

  it("invalidates completed reviews after real draft changes and refuses finishing with stale acceptance", async () => {
    const f = await fixture();
    try {
      await ready(f);
      const finish = {
        action: "submit",
        phase: "work",
        decision: "finish",
        completion: passed("草稿A和成果已核对"),
        workflow: passed("合成流程已核对"),
      };
      expect((await f.call(finish)).isError).not.toBe(true);
      expect((await f.state()).phases.work.status).toBe("done");
      const before = await f.raw();
      await f.call({ action: "update", updates: { replyDraft: "草稿A" } });
      expect(await f.raw()).toBe(before);
      await f.call({ action: "update", updates: { replyDraft: "草稿B" } });
      const changed = await f.state();
      expect(changed.reviews.completion).toBeNull();
      expect(changed.reviews.workflow).toBeNull();
      expect(changed.notes.intent).toBe("合成意图及依据");
      expect(changed.phases.work.status).toBe("active");
      const afterUpdate = await f.raw();
      expect(
        (
          await f.call({
            action: "submit",
            phase: "work",
            decision: "finish",
            workflow: passed("仅流程核对"),
          })
        ).isError,
      ).toBe(true);
      expect(await f.raw()).toBe(afterUpdate);
      expect((await f.call({ ...finish, completion: passed("草稿B已重验") })).isError).not.toBe(
        true,
      );
      await f.call({ action: "update", updates: { replyDraft: null } });
      expect((await f.state()).reviews.completion).toBeNull();
    } finally {
      await f.close();
    }
  });

  it("returns upstream changes before finish and atomically rejects malformed submit fields", async () => {
    const f = await fixture();
    try {
      await ready(f);
      const before = await f.raw();
      const invalid = await f.call({
        action: "submit",
        phase: "work",
        decision: "continue",
        assessment: "继续",
        progress: "错误位置",
      });
      expect(invalid.isError).toBe(true);
      expect(await f.raw()).toBe(before);
      expect(JSON.stringify(invalid.content)).toContain("先用独立update");
      const response = await f.call({
        action: "submit",
        phase: "work",
        decision: "finish",
        updates: { intent: "新的意图依据" },
        impact: { areas: ["intent"], reason: "合成新证据改变意图", affectedTaskIds: [] },
        completion: passed("同次完成判断"),
        workflow: passed("同次流程判断"),
      });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ currentPhase: "intent" });
      const current = await f.state();
      expect(current.notes.intent).toBe("新的意图依据");
      expect(current.notes.result).toBe("合成核对结果");
      expect(current.reviews.completion).toBeNull();
    } finally {
      await f.close();
    }
  });

  it("retains the original state when atomic replacement fails and rejects missing host identity", async () => {
    let failRename = false;
    const f = await fixture({
      fileSystem: {
        ...fs,
        async rename(oldPath, newPath) {
          if (failRename)
            throw Object.assign(new Error("simulated disk replacement failure"), {
              code: "EACCES",
            });
          return fs.rename(oldPath, newPath);
        },
      },
    });
    try {
      await f.call({ action: "start", message: "保存失败检查" });
      const before = await f.raw();
      failRename = true;
      const response = await f.call({ action: "update", updates: { intent: "不得部分保存" } });
      expect(response.isError).toBe(true);
      expect(await f.raw()).toBe(before);
      expect(JSON.stringify(response.content)).toContain("尚未返回保存成功");
      expect(() => statePathFor({ ...f.host, turnId: "" })).toThrow("宿主须提供");
    } finally {
      await f.close();
    }
  });
});
