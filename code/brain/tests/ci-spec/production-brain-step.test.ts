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

type CallResult = Awaited<ReturnType<Client["callTool"]>>;
function markdown(result: CallResult) {
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeUndefined();
  return (result.content as Array<{ type: string; text: string }>).map((x) => x.text).join("\n");
}
function errorText(result: CallResult) {
  expect(result.isError).toBe(true);
  return (result.content as Array<{ type: string; text: string }>).map((x) => x.text).join("\n");
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
  const client = new Client({ name: "brain-step-test", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(left), client.connect(right)]);
  const call = (request: Record<string, unknown>) =>
    client.callTool({ name: "brain_step", arguments: request });
  return {
    client,
    call,
    raw: () => fs.readFile(statePathFor(currentHost), "utf8"),
    state: async () => {
      const file = statePathFor(currentHost);
      const stored = (JSON.parse(await fs.readFile(file, "utf8")) as { state: any }).state;
      return {
        ...stored,
        content: await fs.readFile(path.join(path.dirname(file), stored.contentFile), "utf8"),
      };
    },
    host,
    hostReads: () => hostReads,
    setHost(value: BrainStepHost) {
      currentHost = value;
    },
    async close() {
      await client.close();
      await server.close();
      await fs.rm(sourceRoot, { recursive: true, force: true });
    },
  };
}

async function reachEssence(f: Awaited<ReturnType<typeof fixture>>) {
  markdown(await f.call({ action: "start", message: "用户要求解决页面慢" }));
  markdown(
    await f.call({ action: "submit_work", result: "目标：及时而准确地报价；缓存只是办法。" }),
  );
  markdown(await f.call({ action: "submit_review" }));
  return markdown(await f.call({ action: "confirm_review" }));
}
async function reachFinalWork(f: Awaited<ReturnType<typeof fixture>>) {
  await reachEssence(f);
  markdown(
    await f.call({
      action: "submit_work",
      result: "事实：多个串行接口造成主要等待，有调用链依据。",
    }),
  );
  markdown(await f.call({ action: "submit_review" }));
  return markdown(await f.call({ action: "confirm_review" }));
}

describe("brain_step: six actions, one current State and focused Markdown", () => {
  it("publishes a minimal schema and the first task without invented findings", async () => {
    const f = await fixture();
    try {
      const tools = (await f.client.listTools()).tools;
      expect(tools).toHaveLength(1);
      expect(tools[0]?.description).toBe(definition.description);
      expect(tools[0]?.outputSchema).toBeUndefined();
      expect(tools[0]?.inputSchema).toMatchObject({
        properties: {
          action: {
            enum: ["start", "submit_work", "submit_review", "confirm_review", "update", "read"],
          },
        },
      });
      const first = markdown(await f.call({ action: "start", message: "商品页太慢，帮我加缓存" }));
      expect(first).toContain("# Brain 的背景与目的");
      expect(first).toContain("# 当前任务：查清用户的完整意图");
      expect(first).toContain("## 本次提交");
      expect(first).not.toContain("当前意图：已");
      const state = await f.state();
      expect(state.mode).toBe("work");
      expect(state.phase).toBe("intent");
      expect(state.content).toBe("# 当前 State\n");
      expect(state.contentFile).toMatch(/\.md$/);
      expect(
        await fs.readFile(path.join(path.dirname(statePathFor(f.host)), state.contentFile), "utf8"),
      ).toBe(state.content);
      expect(await f.raw()).not.toContain('"content":');
      expect(state.saved).toEqual({ intent: false, essence: false, work: false });
      const before = await f.raw();
      expect(markdown(await f.call({ action: "start", message: "商品页太慢，帮我加缓存" }))).toBe(
        first,
      );
      expect(markdown(await f.call({ action: "read" }))).toBe(state.content);
      expect(await f.raw()).toBe(before);
      expect(
        errorText(await f.call({ action: "start", message: "冒充本轮另一用户消息" })),
      ).toContain("不同");
      expect(await f.raw()).toBe(before);
    } finally {
      await f.close();
    }
  });

  it("advances from intent through essence and actual work, reviewing mature outcomes", async () => {
    const f = await fixture();
    try {
      const essence = await reachEssence(f);
      expect(essence).toContain("# 当前任务：查清决定结果的事实本质");
      const work = markdown(
        await f.call({
          action: "submit_work",
          result: "事实：多个串行接口造成主要等待，有实际调用轨迹。",
        }),
      );
      expect(work).toContain("## 本次检视要求");
      expect(work).toContain("事实形成关系");
      const confirm = markdown(await f.call({ action: "submit_review" }));
      expect(confirm).toContain("「Brain 的背景与目的」");
      expect(confirm).toContain("「本次检视要求」");
      const actual = markdown(await f.call({ action: "confirm_review" }));
      expect(actual).toContain("完成用户工作");
      const review = markdown(
        await f.call({
          action: "submit_work",
          result: "已调整调用方案并验收结果；真实成果位置和未完成约束见项目文件。",
        }),
      );
      expect(review).toContain("## 本次检视要求");
      expect(review).toContain("最终回复");
      markdown(await f.call({ action: "submit_review" }));
      expect(markdown(await f.call({ action: "confirm_review" }))).toContain(
        "本轮工作及一次最终确认已完成",
      );
      const state = await f.state();
      expect(state.mode).toBe("done");
      expect(state.saved).toEqual({ intent: true, essence: true, work: true });
      const raw = markdown(await f.call({ action: "read" }));
      for (const title of ["## 完整意图", "## 事实本质", "## 实际工作与交付"])
        expect(raw).toContain(title);
      expect(raw).toBe(state.content);
      expect(errorText(await f.call({ action: "submit_work", result: "重复" }))).toContain(
        "已经完成",
      );
    } finally {
      await f.close();
    }
  });

  it("requires complete current results; a review issue opens correction work and a fresh full review", async () => {
    const f = await fixture();
    try {
      await f.call({ action: "start", message: "处理报价问题" });
      expect(errorText(await f.call({ action: "submit_work" }))).toContain("完整新成果");
      const review = markdown(
        await f.call({
          action: "submit_work",
          result: "用户真正的目标是加缓存。",
        }),
      );
      expect(review).toContain("完整客观检视");
      const correction = markdown(
        await f.call({
          action: "submit_review",
          result: "把缓存办法误当用户目标；实际目标是及时得到可靠报价。",
        }),
      );
      expect(correction).toContain("当前任务：修正完整意图");
      expect(correction).toContain("把缓存办法误当用户目标");
      expect(errorText(await f.call({ action: "submit_review" }))).toContain("不能调用");
      expect(errorText(await f.call({ action: "submit_work" }))).toContain("尚未通过 update");
      expect(
        markdown(
          await f.call({
            action: "update",
            edits: [
              {
                old_text: "用户真正的目标是加缓存。",
                new_text: "用户真正的目标是及时得到可靠报价；缓存是候选办法。",
              },
            ],
          }),
        ),
      ).toBe("更新已保存。");
      const before = await f.state();
      expect(before.content).not.toContain("用户真正的目标是加缓存。");
      expect(
        errorText(
          await f.call({
            action: "submit_work",
            result: "仅给出修正完成说明",
          }),
        ),
      ).toContain("请用 update");
      const fresh = markdown(await f.call({ action: "submit_work" }));
      expect(fresh).toContain("完整客观检视");
      expect((await f.state()).mode).toBe("review");
      const confirm = markdown(await f.call({ action: "submit_review" }));
      expect(confirm).toContain("简短确认");
      expect(markdown(await f.call({ action: "confirm_review" }))).toContain("事实本质");
      expect((await f.state()).content).toContain("可靠报价");
    } finally {
      await f.close();
    }
  });

  it("a problem discovered at brief confirmation also repairs through update and a new full review", async () => {
    const f = await fixture();
    try {
      markdown(await f.call({ action: "start", message: "用户消息" }));
      markdown(await f.call({ action: "submit_work", result: "当前完整意图结论A" }));
      markdown(await f.call({ action: "submit_review" }));
      const correction = markdown(
        await f.call({
          action: "confirm_review",
          result: "最后发现依据A实际上无效，应修正为B。",
        }),
      );
      expect(correction).toContain("修正完整意图");
      markdown(
        await f.call({
          action: "update",
          edits: [{ old_text: "结论A", new_text: "结论B" }],
        }),
      );
      expect(markdown(await f.call({ action: "submit_work" }))).toContain("## 本次检视要求");
      markdown(await f.call({ action: "submit_review" }));
      expect(markdown(await f.call({ action: "confirm_review" }))).toContain("事实本质");
    } finally {
      await f.close();
    }
  });

  it("Pi edits are atomic, reject missing/ambiguous matches and preserve previously submitted results", async () => {
    const f = await fixture();
    try {
      await reachFinalWork(f);
      const before = await f.raw();
      expect(
        errorText(
          await f.call({
            action: "update",
            edits: [{ old_text: "不存在", new_text: "修改" }],
          }),
        ),
      ).toContain("Could not find");
      expect(
        markdown(
          await f.call({
            action: "update",
            edits: [{ old_text: "报价", new_text: "更新" }],
          }),
        ),
      ).toBe("更新已保存。");
      const after = await f.state();
      expect(after.content).toContain("及时而准确地更新");
      const beforeAmbiguous = await f.raw();
      expect(
        errorText(
          await f.call({
            action: "update",
            edits: [
              { old_text: "多个串行接口", new_text: "并行调用" },
              { old_text: "不存在", new_text: "新内容" },
            ],
          }),
        ),
      ).toContain("Could not find");
      expect(await f.raw()).toBe(beforeAmbiguous);
      const r = markdown(
        await f.call({
          action: "update",
          edits: [
            { old_text: "多个串行接口", new_text: "并行调用" },
            { old_text: "缓存只是办法", new_text: "缓存仅是候选办法" },
          ],
        }),
      );
      expect(r).toBe("更新已保存。");
      const current = await f.state();
      expect(current.content).toContain("并行调用");
      expect(current.content).toContain("缓存仅是候选办法");
      expect(await f.raw()).not.toBe(before);
      expect(markdown(await f.call({ action: "read" }))).toBe(current.content);
      markdown(
        await f.call({
          action: "update",
          edits: [{ old_text: "并行调用", new_text: "并行接口与备用接口" }],
        }),
      );
      const beforeDuplicate = await f.raw();
      expect(
        errorText(
          await f.call({
            action: "update",
            edits: [{ old_text: "接口", new_text: "网络" }],
          }),
        ),
      ).toContain("Found 2 occurrences");
      expect(await f.raw()).toBe(beforeDuplicate);
    } finally {
      await f.close();
    }
  });

  it("uses Pi's fuzzy Unicode matching to update Markdown without embedding it in JSON", async () => {
    const f = await fixture();
    try {
      markdown(await f.call({ action: "start", message: "说明方案" }));
      markdown(
        await f.call({
          action: "submit_work",
          result: "status: “Plan A” works.",
        }),
      );
      markdown(await f.call({ action: "submit_review", result: "需改为 Plan B" }));
      const before = await f.state();
      expect(
        markdown(
          await f.call({
            action: "update",
            edits: [{ old_text: '"Plan A" works', new_text: "Plan B works" }],
          }),
        ),
      ).toBe("更新已保存。");
      const after = await f.state();
      expect(after.content).toContain("Plan B works");
      expect(after.content).not.toContain("“Plan A”");
      expect(after.contentFile).not.toBe(before.contentFile);
      expect(markdown(await f.call({ action: "read" }))).toBe(after.content);
      const stored = await f.raw();
      expect(stored).toContain('"contentFile"');
      expect(stored).not.toContain("Plan B works");
      expect(stored).not.toContain('"content":');
      expect(markdown(await f.call({ action: "submit_work" }))).toContain("完整客观检视");
    } finally {
      await f.close();
    }
  });

  it("rejects illegal actions and fields before changing State", async () => {
    const f = await fixture();
    try {
      expect(errorText(await f.call({ action: "read" }))).toContain("尚未 start");
      const invalid = await f.call({ action: "update", taskChanges: [] });
      expect(errorText(invalid).length).toBeGreaterThan(0);
      expect(f.hostReads()).toBe(1); // prior read resolves a host
      await expect(f.raw()).rejects.toMatchObject({ code: "ENOENT" });
      markdown(await f.call({ action: "start", message: "核对输入" }));
      const before = await f.raw();
      for (const request of [
        { action: "status" },
        { action: "submit", phase: "intent", decision: "advance" },
        { action: "submit_review" },
        { action: "confirm_review" },
        { action: "submit_work", result: "" },
        { action: "update", edits: [{ old_text: "缺失", new_text: "修改" }] },
        { action: "start", message: "核对输入", phase: "intent" },
      ])
        expect((await f.call(request)).isError).toBe(true);
      expect(await f.raw()).toBe(before);
    } finally {
      await f.close();
    }
  });

  it("binds State to trusted host identity, isolates sessions and resets on new turn", async () => {
    const f = await fixture();
    try {
      markdown(await f.call({ action: "start", message: "第一轮" }));
      markdown(await f.call({ action: "submit_work", result: "第一轮有效认识" }));
      const before = await f.raw();
      f.setHost({ ...f.host, conversationId: "other-session" });
      markdown(await f.call({ action: "start", message: "另一个会话" }));
      expect(statePathFor(f.host)).not.toBe(
        statePathFor({ ...f.host, conversationId: "other-session" }),
      );
      f.setHost(f.host);
      expect(await f.raw()).toBe(before);
      f.setHost({ ...f.host, turnId: "turn-2" });
      expect(errorText(await f.call({ action: "read" }))).toContain("尚未 start");
      markdown(await f.call({ action: "start", message: "第二轮" }));
      const state = await f.state();
      expect(state.message).toBe("第二轮");
      expect(state.content).not.toContain("第一轮有效认识");
      expect(state.saved.intent).toBe(false);
    } finally {
      await f.close();
    }
  });

  it("does not acknowledge a failed atomic save", async () => {
    let failRename = false;
    const f = await fixture({
      fileSystem: {
        ...fs,
        async rename(source, target) {
          if (failRename) throw Object.assign(new Error("simulated failure"), { code: "EACCES" });
          return fs.rename(source, target);
        },
      },
    });
    try {
      markdown(await f.call({ action: "start", message: "保存失败核查" }));
      const before = await f.raw();
      failRename = true;
      expect(
        errorText(
          await f.call({
            action: "submit_work",
            result: "这份结果不能被认为已保存",
          }),
        ),
      ).toContain("未能持久保存");
      expect(await f.raw()).toBe(before);
      expect(() => statePathFor({ ...f.host, turnId: "" })).toThrow("宿主须提供");
    } finally {
      await f.close();
    }
  });

  it("keeps the previous JSON to Markdown reference when JSON commit fails", async () => {
    let failJsonCommit = false;
    const f = await fixture({
      fileSystem: {
        ...fs,
        async rename(source, target) {
          if (failJsonCommit && String(target).endsWith(".json"))
            throw Object.assign(new Error("JSON commit failed"), { code: "EACCES" });
          return fs.rename(source, target);
        },
      },
    });
    try {
      markdown(await f.call({ action: "start", message: "保持状态一致" }));
      const before = await f.state();
      const stored = await f.raw();
      failJsonCommit = true;
      expect(
        errorText(
          await f.call({
            action: "submit_work",
            result: "尚未完成持久化的新结论",
          }),
        ),
      ).toContain("未能持久保存");
      expect(await f.raw()).toBe(stored);
      expect((await f.state()).content).toBe(before.content);
      expect(markdown(await f.call({ action: "read" }))).toBe(before.content);
    } finally {
      await f.close();
    }
  });

  it("registers through the common Brain adapter, using the host instead of model identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "brain-step-host-"));
    const services = { sourceRoot: root } as BrainApplicationServices;
    let host: BrainStepHost | undefined = {
      conversationId: "common",
      turnId: "t1",
      sourceRoot: root,
    };
    const server = new McpServer({ name: "common-brain", version: "1" });
    registerBrainTools(server, undefined, {
      resolveInvocation: () => ({ services, stepHost: host }),
    });
    const client = new Client({ name: "host-test", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(left), client.connect(right)]);
    try {
      const call = (request: Record<string, unknown>) =>
        client.callTool({ name: "brain_step", arguments: request });
      expect(markdown(await call({ action: "start", message: "原消息" }))).toContain("完整意图");
      const before = await fs.readFile(statePathFor(host!), "utf8");
      host = undefined;
      expect(errorText(await call({ action: "start", message: "其它" }))).toContain("宿主须提供");
      expect(
        await fs.readFile(
          statePathFor({ conversationId: "common", turnId: "t1", sourceRoot: root }),
          "utf8",
        ),
      ).toBe(before);
      host = { conversationId: "common", turnId: "t2", sourceRoot: root };
      expect(markdown(await call({ action: "start", message: "新消息" }))).toContain("完整意图");
      expect(JSON.parse(await fs.readFile(statePathFor(host), "utf8")).state.message).toBe(
        "新消息",
      );
    } finally {
      await client.close();
      await server.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
