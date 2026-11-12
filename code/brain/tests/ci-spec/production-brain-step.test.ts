import { randomUUID } from "node:crypto";
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
} from "../../step/index.mjs";

type CallResult = Awaited<ReturnType<Client["callTool"]>>;
function markdown(result: CallResult) {
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeUndefined();
  return (result.content[0] as { text: string }).text;
}
function errorText(result: CallResult) {
  expect(result.isError).toBe(true);
  return (result.content as Array<{ type: string; text: string }>).map((x) => x.text).join("\n");
}

function responseTurnId(result: CallResult) {
  const content = result.content[1] as { text: string };
  const match = /[0-9a-f-]{36}/.exec(content.text);
  expect(match).not.toBeNull();
  return match![0];
}

async function fixture(options: {
  fileSystem?: BrainStepFileSystem;
  onNewTurn?: () => Promise<readonly string[]>;
} = {}) {
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "brain-step-"));
  let turnId: string | undefined;
  const server = new McpServer({ name: "brain-step-contract", version: "1.0.0" });
  const runtime = createFileRuntime({ sourceRoot, ...options });
  registerBrainStep(server, () => runtime);
  const client = new Client({ name: "brain-step-test", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(left), client.connect(right)]);
  const send = (request: Record<string, unknown>) =>
    client.callTool({ name: "brain_step", arguments: request });
  const call = async (request: Record<string, unknown>) => {
    const selected = request.turnId ?? turnId;
    const result = await send({ ...(selected ? { turnId: selected } : {}), ...request });
    if (!result.isError) {
      const returned = responseTurnId(result);
      if (selected) expect(returned).toBe(selected);
      else turnId = returned;
    }
    return result;
  };
  const file = () => statePathFor({ sourceRoot, turnId: turnId! });
  return {
    client,
    call,
    send,
    sourceRoot,
    file,
    turnId: () => turnId!,
    newTurn: async (message: string) => {
      const result = await send({ action: "start", message });
      turnId = responseTurnId(result);
      return result;
    },
    raw: () => fs.readFile(file(), "utf8"),
    state: async () => {
      const stored = (JSON.parse(await fs.readFile(file(), "utf8")) as { state: any }).state;
      return {
        ...stored,
        content: await fs.readFile(path.join(path.dirname(file()), stored.contentFile), "utf8"),
      };
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
  it("runs host lifecycle once per new turn and surfaces maintenance diagnostics", async () => {
    let cycles = 0;
    const f = await fixture({
      onNewTurn: async () => {
        cycles++;
        return ["Git history checkpoint was not recorded"];
      },
    });
    try {
      const first = markdown(await f.call({ action: "start", message: "初始工作" }));
      expect(first).toContain("Background + Goal / Work");
      expect(first).toContain("warning: Git history checkpoint was not recorded");
      expect(cycles).toBe(1);
      const retry = markdown(await f.call({ action: "start", message: "初始工作" }));
      expect(retry).not.toContain("warning: Git history checkpoint was not recorded");
      expect(cycles).toBe(1);
      markdown(await f.call({ action: "submit_work", result: "已提交结果" }));
      expect(cycles).toBe(1);
      const firstId = f.turnId();
      const next = markdown(await f.newTurn("第二轮工作"));
      expect(next).toContain("Background + Goal / Work");
      expect(cycles).toBe(2);
      markdown(await f.call({ action: "submit_work", result: "第二轮成果" }));
      const committed = await f.raw();
      expect(markdown(await f.call({ action: "start", message: "初始工作", turnId: firstId }))).toContain("/ Review");
      expect(cycles).toBe(2);
      expect(await f.raw()).toBe(committed);
      expect(markdown(await f.call({ action: "read" }))).toContain("第二轮成果");
    } finally {
      await f.close();
    }
  });

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
      expect(first).toContain("# 当前任务：Background + Goal / Work");
      expect(first).toContain("用 brain_cat 读取本轮尚未取得的 Global Core（@global/core.md）和 Project Core（@project/core.md）");
      expect(first).toContain("## 本次提交");
      expect(first).not.toContain("当前意图：已");
      const state = await f.state();
      expect(state.mode).toBe("work");
      expect(state.phase).toBe("background_goal");
      expect(state.content).toBe("# 当前 State\n");
      expect(state.contentFile).toMatch(/\.md$/);
      expect(
        await fs.readFile(path.join(path.dirname(f.file()), state.contentFile), "utf8"),
      ).toBe(state.content);
      expect(await f.raw()).not.toContain('"content":');
      expect(state.saved).toEqual({ background_goal: false, method: false, plan: false, execute: false });
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

  it("advances through four stages with a full review and brief confirmation each", async () => {
    const f = await fixture();
    try {
      const essence = await reachEssence(f);
      expect(essence).toContain("# 当前任务：Method / Work");
      const work = markdown(
        await f.call({
          action: "submit_work",
          result: "事实：多个串行接口造成主要等待，有实际调用轨迹。",
        }),
      );
      expect(work).toContain("## 本次检视要求");
      expect(work).toContain("「Method 成果」");
      const confirm = markdown(await f.call({ action: "submit_review" }));
      expect(confirm).toContain("「Brain 的背景与目的」");
      expect(confirm).toContain("「本次检视要求」");
      const actual = markdown(await f.call({ action: "confirm_review" }));
      expect(actual).toContain("Plan / Work");
      markdown(await f.call({ action: "submit_work", result: "安排实际工作的依赖与验收" }));
      markdown(await f.call({ action: "submit_review" }));
      expect(markdown(await f.call({ action: "confirm_review" }))).toContain("Execute / Work");
      const review = markdown(
        await f.call({
          action: "submit_work",
          result: "已调整调用方案并验收结果；真实成果位置和未完成约束见项目文件。",
        }),
      );
      expect(review).toContain("## 本次检视要求");
      expect(review).toContain("真实执行");
      markdown(await f.call({ action: "submit_review" }));
      expect(markdown(await f.call({ action: "confirm_review" }))).toContain(
        "本轮工作及一次最终确认已完成",
      );
      const state = await f.state();
      expect(state.mode).toBe("done");
      expect(state.saved).toEqual({ background_goal: true, method: true, plan: true, execute: true });
      const raw = markdown(await f.call({ action: "read" }));
      for (const title of ["## Background + Goal 成果", "## Method 成果", "## Plan 成果", "## Execute 成果"])
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
      expect(review).toContain("/ Review");
      const correction = markdown(
        await f.call({
          action: "submit_review",
          result: "把缓存办法误当用户目标；实际目标是及时得到可靠报价。",
        }),
      );
      expect(correction).toContain("当前任务：Background + Goal / Fix");
      expect(correction).toContain("「当前任务：Background + Goal / Review」中提交的「检视问题」");
      expect(correction).toContain("保留经核实仍成立的目标");
      expect(correction).toContain("若检视证据改变了对整体目标的认识，修订「Background + Goal 成果」中受影响的部分");
      expect(correction).not.toContain("把缓存办法误当用户目标");
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
      expect(fresh).toContain("/ Review");
      expect((await f.state()).mode).toBe("review");
      const confirm = markdown(await f.call({ action: "submit_review" }));
      expect(confirm).toContain("/ Confirm");
      expect(markdown(await f.call({ action: "confirm_review" }))).toContain("Method / Work");
      expect((await f.state()).content).toContain("可靠报价");
    } finally {
      await f.close();
    }
  });

  it("a problem discovered at brief confirmation also repairs through update and a new full review", async () => {
    const f = await fixture();
    try {
      const start = { action: "start", message: "用户消息" };
      markdown(await f.call(start));
      markdown(await f.call({ action: "submit_work", result: "当前完整意图结论A" }));
      markdown(await f.call({ action: "submit_review" }));
      const issue = "最后发现依据A实际上无效，应修正为B。";
      const correction = markdown(await f.call({ action: "confirm_review", result: issue }));
      expect(correction).toContain("Background + Goal / Fix");
      expect(correction).toContain(
        "「当前任务：Background + Goal / Confirm」中通过 confirm_review(result) 提交的问题",
      );
      expect(correction).not.toContain("「检视问题」");
      expect(correction).not.toContain(issue);
      expect((await f.state()).issue).toEqual({ source: "confirm_review", text: issue });
      expect(markdown(await f.call(start))).toBe(correction);

      markdown(
        await f.call({
          action: "update",
          edits: [{ old_text: "结论A", new_text: "结论B" }],
        }),
      );
      expect(markdown(await f.call({ action: "submit_work" }))).toContain("## 本次检视要求");
      markdown(await f.call({ action: "submit_review" }));
      expect(markdown(await f.call({ action: "confirm_review" }))).toContain("Method / Work");
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
      expect(markdown(await f.call({ action: "submit_work" }))).toContain("/ Review");
    } finally {
      await f.close();
    }
  });

  it("rejects illegal actions and fields before changing State", async () => {
    const f = await fixture();
    try {
      expect(errorText(await f.call({ action: "read" }))).toContain("turnId");
      const invalid = await f.call({ action: "update", taskChanges: [] });
      expect(errorText(invalid).length).toBeGreaterThan(0);
      await expect(fs.stat(path.join(f.sourceRoot, ".brain-working"))).rejects.toMatchObject({ code: "ENOENT" });
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

  it("isolates identical messages, rejects unknown IDs and serializes same-turn calls", async () => {
    const f = await fixture();
    try {
      const first = responseTurnId(await f.newTurn("同一条原文"));
      const second = responseTurnId(await f.newTurn("同一条原文"));
      expect(first).not.toBe(second);
      const firstWrites = await Promise.all([
        f.call({ action: "submit_work", turnId: first, result: "第一份成果" }),
        f.call({ action: "submit_work", turnId: first, result: "重复提交" }),
      ]);
      expect(firstWrites.filter((r) => r.isError)).toHaveLength(1);
      expect(markdown(await f.call({ action: "read", turnId: first }))).toMatch(/第一份成果|重复提交/);
      expect(markdown(await f.call({ action: "read", turnId: second }))).toBe("# 当前 State\n");
      expect(errorText(await f.call({ action: "start", turnId: randomUUID(), message: "未知轮次" }))).toContain("找不到");
      expect(errorText(await f.call({ action: "read", turnId: "../invalid" }))).toBeTruthy();
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
      expect(() => statePathFor({ sourceRoot: f.sourceRoot, turnId: "" })).toThrow("有效 turnId");
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

  it("registers through the common adapter and rejects a turn ID from another project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "brain-step-host-"));
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "brain-step-other-"));
    let sourceRoot = root;
    const server = new McpServer({ name: "common-brain", version: "1" });
    registerBrainTools(server, undefined, {
      restoreMode: "host",
      resolveInvocation: () => ({ services: { sourceRoot, binding: {} } as BrainApplicationServices }),
    });
    const client = new Client({ name: "host-test", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(left), client.connect(right)]);
    try {
      const call = (request: Record<string, unknown>) =>
        client.callTool({ name: "brain_step", arguments: request });
      const started = await call({ action: "start", message: "原消息" });
      expect(markdown(started)).toContain("Background + Goal");
      const turnId = responseTurnId(started);
      sourceRoot = other;
      expect(errorText(await call({ action: "read", turnId }))).toContain("找不到");
      sourceRoot = root;
      expect(markdown(await call({ action: "read", turnId }))).toContain("# 当前 State");
    } finally {
      await client.close();
      await server.close();
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(other, { recursive: true, force: true });
    }
  });
});
