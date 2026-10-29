import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  SEMANTIC_DIMENSION,
  SEMANTIC_FASTEMBED_VERSION,
  SEMANTIC_FINGERPRINT,
  SEMANTIC_MODEL,
  semanticRuntimePaths,
} from "../../brain/src/runtime/semantic-runtime.ts";
import { createCliRuntime } from "../src/runtime.ts";
import { createBrainServicesForRoot } from "../../brain/src/runtime/production.ts";
import { registerBrainTools } from "../../brain/src/integration/mcp-adapter.ts";
import { definition as stepDefinition } from "../../brain/step/index.mjs";
import { createCliStepContext } from "../src/step-context.ts";
import { COMMANDS } from "../src/arguments.ts";
import { PUBLIC_BRAIN_TOOLS } from "../../brain/src/integration/public-tools.ts";

const entry = fileURLToPath(new URL("../dist/brain-skill.mjs", import.meta.url));
const mainModule = new URL("../src/main.ts", import.meta.url).href;
const memoryPath = "@project/memories/decision/release.md";
const markdown = (body = "中文正文\n`backtick` $value $(literal) 'single' \"double\"\n") =>
  `---\ndescription: 发布任务读取\nsummary: 已确认发布决定\nimportance: high\n---\n\n${body}`;

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-skill-cli-"));
  t.after(async () => {
    assert.equal(path.resolve(path.dirname(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith("brain-skill-cli-"));
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const project = path.join(temp, "project");
  const brain = path.join(temp, "brain");
  await fs.mkdir(project);
  return { temp, project, brain };
}

function run(f, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        entry,
        "--brain-root",
        f.brain,
        "--project",
        options.project ?? f.project,
        "--json",
        ...args,
      ],
      {
        cwd: options.cwd ?? f.project,
        windowsHide: true,
        env: {
          ...process.env,
          CODEX_THREAD_ID: "",
          CLAUDE_CODE_SESSION_ID: "",
          BRAIN_SESSION_ID: "cli-test-session",
          ...options.env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI timed out: ${args.join(" ")}\n${stderr}`));
    }, 45000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      let result;
      if (
        code !== 0 ||
        (!args.includes("--help") && !args.includes("--version") && !args.includes("--schema"))
      ) {
        try {
          result = JSON.parse(stdout);
        } catch {
          reject(new Error(`Invalid CLI JSON (${code}): ${stdout}\n${stderr}`));
          return;
        }
      }
      resolve({ code, stdout, stderr, result });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}

async function ok(f, args, options) {
  const response = await run(f, args, options);
  assert.equal(response.code, 0, response.stderr + response.stdout);
  assert.equal(response.result.ok, true);
  return response.result;
}

void test("CLI and existing MCP exchange cognition and current challenge state", async (t) => {
  const f = await fixture(t);
  await ok(f, ["write", memoryPath, "--content-file", "-"], { input: markdown() });
  const brainRequire = createRequire(new URL("../../brain/package.json", import.meta.url));
  const sdk = (name) =>
    import(pathToFileURL(brainRequire.resolve(`@modelcontextprotocol/sdk/${name}`)).href);
  const [{ McpServer }, { Client }, { InMemoryTransport }] = await Promise.all([
    sdk("server/mcp.js"),
    sdk("client/index.js"),
    sdk("inMemory.js"),
  ]);
  const services = await createBrainServicesForRoot(f.brain, f.project);
  const server = new McpServer({ name: "brain-skill-test", version: "0.0.0" });
  registerBrainTools(server, services);
  const client = new Client({ name: "brain-skill-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const textOf = (result) =>
    result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
  try {
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    assert.match(
      textOf(await client.callTool({ name: "brain_cat", arguments: { path: memoryPath } })),
      /中文正文/,
    );
    const edited = await client.callTool({
      name: "brain_edit",
      arguments: { path: memoryPath, content: markdown("由 MCP 修订\n") },
    });
    assert.notEqual(edited.isError, true);
    assert.match((await ok(f, ["cat", memoryPath])).text, /由 MCP 修订/);
    const questioned = await client.callTool({
      name: "brain_feedback",
      arguments: { path: memoryPath, feedback: "question", challenge: "MCP 记录的争议" },
    });
    assert.notEqual(questioned.isError, true);
    assert.match((await ok(f, ["cat", memoryPath])).text, /MCP 记录的争议/);
    await ok(f, ["feedback", memoryPath, "resolve"]);
    assert.doesNotMatch(
      textOf(await client.callTool({ name: "brain_cat", arguments: { path: memoryPath } })),
      /MCP 记录的争议/,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

void test("interrupting streamed input exits without initializing Brain", async (t) => {
  const f = await fixture(t);
  const argv = [
    "--brain-root",
    f.brain,
    "--project",
    f.project,
    "--json",
    "write",
    memoryPath,
    "--content-file",
    "-",
  ];
  const script = `import {main} from ${JSON.stringify(mainModule)}; setTimeout(() => process.emit('SIGINT'), 50); await main(${JSON.stringify(argv)});`;
  const response = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "--input-type=module", "--eval", script],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("streaming input did not stop"));
    }, 10000);
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on("error", () => {});
    // Leave the pipe open: the handler must abort the stream rather than wait for EOF.
    child.stdin.write("---\n");
  });
  assert.equal(response.code, 130, response.stderr);
  assert.equal(JSON.parse(response.stdout).ok, false);
  await assert.rejects(fs.stat(f.brain), { code: "ENOENT" });
});

void test("stub help/version and invalid arguments do not initialize Brain", async (t) => {
  const f = await fixture(t);
  const help = await run(f, ["cat", "--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /cat <path>/);
  const version = await run(f, ["--version"]);
  assert.equal(version.stdout.trim(), "0.1.0");
  const schema = await run(f, ["step", "--schema"]);
  assert.equal(schema.code, 0);
  assert.deepEqual(JSON.parse(schema.stdout), stepDefinition.inputSchema);
  assert.deepEqual(
    Object.values(COMMANDS)
      .map((command) => command.tool)
      .sort((a, b) => a.localeCompare(b)),
    PUBLIC_BRAIN_TOOLS.map((tool) => tool.name).sort((a, b) => a.localeCompare(b)),
  );
  for (const args of [
    ["unknown"],
    ["cat", "@project/core.md", "--limit", "0"],
    ["cat", "@project/core.md", "--literal"],
    ["edit", "@project/core.md", "--content-file", "-", "--edits-file", "-"],
    ["feedback", memoryPath, "question"],
    ["step"],
    ["step", "--input-file", "-", "--schema"],
  ]) {
    const response = await run(f, args);
    assert.equal(response.code, 2, response.stdout);
    assert.equal(response.result.error.code, "usage");
    assert.equal(response.result.binding, null);
  }
  await assert.rejects(fs.stat(f.brain), { code: "ENOENT" });
});

async function step(f, request, options = {}) {
  return ok(f, ["step", "--input-file", "-"], { ...options, input: JSON.stringify(request) });
}

void test("CLI step carries the same State through three phases across processes", async (t) => {
  const f = await fixture(t);
  await ok(f, ["think"]);
  const started = await step(f, { action: "start", message: "合成 CLI 契约检查" });
  assert.equal(JSON.parse(started.text).currentPhase, "intent");
  const notes = {
    intent: "合成意图与依据",
    scope: "只验证 CLI 接入",
    analysis: "合成事实与条件",
    research: "合成方法来源",
    method: "合成工程验证",
    acceptance: "跨进程状态承接",
    result: "合成结果",
  };
  await step(f, { action: "update", updates: notes, progress: "已保存合成资料" });
  const context = await createCliStepContext(
    f.brain,
    await fs.realpath(f.project),
    "cli-test-session",
  );
  const host = await context.current();
  const { statePathFor } = await import("../../brain/step/index.mjs");
  const file = statePathFor(host);
  const before = await fs.readFile(file, "utf8");
  await step(f, { action: "start", message: "合成 CLI 契约检查" });
  await step(f, { action: "status" });
  const overview = JSON.parse((await step(f, { action: "overview" })).text);
  assert.ok(overview.guidance.includes(notes.intent));
  assert.equal(await fs.readFile(file, "utf8"), before);
  const rejected = await run(f, ["step", "--input-file", "-"], {
    input: JSON.stringify({
      action: "submit",
      phase: "work",
      decision: "continue",
      assessment: "不正确阶段",
    }),
  });
  assert.equal(rejected.code, 1);
  assert.match(rejected.result.error.message, /当前阶段/);
  assert.equal(await fs.readFile(file, "utf8"), before);
  const invalid = await run(f, ["step", "--input-file", "-"], {
    input: JSON.stringify({ action: "update", taskChanges: [] }),
  });
  assert.equal(invalid.code, 2);
  assert.match(invalid.result.error.message, /updates/);
  assert.equal(await fs.readFile(file, "utf8"), before);
  for (const [phase, next] of [
    ["intent", "essence"],
    ["essence", "work"],
  ]) {
    const advanced = await step(f, {
      action: "submit",
      phase,
      decision: "advance",
      assessment: "合成检查已完成",
    });
    assert.equal(JSON.parse(advanced.text).currentPhase, next);
  }
  const finished = await step(f, {
    action: "submit",
    phase: "work",
    decision: "finish",
    completion: { outcome: "passed", assessment: "合成成果核对" },
    workflow: { outcome: "passed", assessment: "合成流程核对" },
  });
  const output = JSON.parse(finished.text);
  assert.equal(output.currentPhase, null);
  assert.ok(output.guidance.includes(file));
  const state = JSON.parse(await fs.readFile(file, "utf8")).state;
  assert.equal(state.notes.result, notes.result);
  assert.equal(state.phases.work.status, "done");
});

void test("CLI sessions and data roots isolate State; only new think starts a new turn", async (t) => {
  const f = await fixture(t);
  await ok(f, ["think"]);
  await step(f, { action: "start", message: "会话一第一轮" });
  await step(f, { action: "update", updates: { result: "旧成果" } });
  const other = { env: { BRAIN_SESSION_ID: "session-two" } };
  await ok(f, ["think"], other);
  await step(f, { action: "start", message: "会话二" }, other);
  await step(f, { action: "update", updates: { intent: "会话二独立认知" } }, other);
  assert.ok((await step(f, { action: "overview" })).text.includes("旧成果"));
  assert.ok(!(await step(f, { action: "overview" }, other)).text.includes("旧成果"));
  const secondRoot = { ...f, brain: path.join(f.temp, "other-brain") };
  await ok(secondRoot, ["think"]);
  await step(secondRoot, { action: "start", message: "同会话不同数据环境" });
  assert.ok((await step(f, { action: "overview" })).text.includes("旧成果"));
  assert.ok(!(await step(secondRoot, { action: "overview" })).text.includes("旧成果"));
  const secondProject = path.join(f.temp, "other-project");
  await fs.mkdir(secondProject);
  const unboundProject = await run(f, ["step", "--input-file", "-"], {
    project: secondProject,
    input: JSON.stringify({ action: "status" }),
  });
  assert.equal(unboundProject.result.error.code, "step-context-unavailable");
  await ok(f, ["think"]);
  const notStarted = await run(f, ["step", "--input-file", "-"], {
    input: JSON.stringify({ action: "status" }),
  });
  assert.equal(notStarted.code, 1);
  assert.match(notStarted.result.error.message, /start/);
  await step(f, { action: "start", message: "会话一第二轮" });
  assert.ok(!(await step(f, { action: "overview" })).text.includes("旧成果"));
  assert.ok((await step(f, { action: "overview" }, other)).text.includes("会话二独立认知"));
});

void test("CLI requires host identity, supports explicit/env bindings and invalidates failed turns", async (t) => {
  const f = await fixture(t);
  const missing = await run(f, ["think"], { env: { BRAIN_SESSION_ID: "" } });
  assert.equal(missing.code, 1);
  assert.equal(missing.result.error.code, "session-context-unavailable");
  await assert.rejects(fs.stat(f.brain), { code: "ENOENT" });
  const unbound = await run(f, ["step", "--input-file", "-"], {
    input: JSON.stringify({ action: "status" }),
  });
  assert.equal(unbound.result.error.code, "step-context-unavailable");
  const requestFile = path.join(f.temp, "步骤.json");
  await fs.writeFile(
    requestFile,
    "\uFEFF" + JSON.stringify({ action: "start", message: "显式会话" }),
  );
  await ok(f, ["think", "--session", "explicit-session"]);
  await ok(f, ["step", "--session", "explicit-session", "--input-file", requestFile]);
  const explicitContext = await createCliStepContext(
    f.brain,
    await fs.realpath(f.project),
    "explicit-session",
  );
  const original = await explicitContext.current();
  // A damaged mapping forces setup to fail after think invalidates its old binding.
  const metadata = path.join(
    f.brain,
    "projects",
    (await ok(f, ["cat", "@project/core.md"])).binding.projectId,
    "project.json",
  );
  const metadataBefore = await fs.readFile(metadata, "utf8");
  await fs.writeFile(metadata, "{}");
  const failedThink = await run(f, ["think", "--session", "explicit-session"]);
  assert.equal(failedThink.code, 1);
  await fs.writeFile(metadata, metadataBefore);
  const stale = await run(f, ["step", "--session", "explicit-session", "--input-file", "-"], {
    input: JSON.stringify({ action: "status" }),
  });
  assert.equal(stale.result.error.code, "step-context-unavailable");
  await ok(f, ["think", "--session", "explicit-session"]);
  assert.notEqual((await explicitContext.current()).turnId, original.turnId);
  for (const [variable, prefix] of [
    ["CODEX_THREAD_ID", "codex"],
    ["CLAUDE_CODE_SESSION_ID", "claude"],
  ]) {
    const env = { BRAIN_SESSION_ID: undefined, [variable]: "host-test-session" };
    await ok(f, ["think"], { env });
    await step(f, { action: "start", message: variable }, { env });
    // Explicit continuation uses the same canonical identity as the host environment.
    const status = await ok(
      f,
      ["step", "--session", `${prefix}:host-test-session`, "--input-file", "-"],
      {
        input: JSON.stringify({ action: "status" }),
      },
    );
    assert.equal(JSON.parse(status.text).currentPhase, "intent");
  }
});

void test("CLI first turn resolves a new data root through a directory link", async (t) => {
  const f = await fixture(t);
  const physicalParent = path.join(f.temp, "physical-data");
  const linkedParent = path.join(f.temp, "linked-data");
  await fs.mkdir(physicalParent);
  await fs.symlink(physicalParent, linkedParent, process.platform === "win32" ? "junction" : "dir");
  const linked = { ...f, brain: path.join(linkedParent, "new-brain") };
  await ok(linked, ["think"]);
  await step(linked, { action: "start", message: "通过目录链接首次建立轮次" });
  const physical = { ...f, brain: path.join(physicalParent, "new-brain") };
  assert.equal(
    JSON.parse((await step(physical, { action: "status" })).text).currentPhase,
    "intent",
  );
});

void test("UTF-8 file/stdin roundtrip, pagination and all discovery commands", async (t) => {
  const f = await fixture(t);
  const content = markdown();
  const file = path.join(f.temp, "中文记忆.md");
  await fs.writeFile(file, "\uFEFF" + content);
  const created = await ok(f, ["write", memoryPath, "--content-file", file]);
  const physical = (await ok(f, ["absolute-path", memoryPath])).text;
  assert.equal(await fs.readFile(physical, "utf8"), content);
  const first = await ok(f, ["cat", memoryPath, "--limit", "2"]);
  assert.match(first.text, /next_offset: 3/);
  const rest = await ok(f, ["cat", memoryPath, "--offset", "3"]);
  assert.match(rest.text, /中文正文/);
  assert.match((await ok(f, ["ls", "@project/memories/decision/"])).text, /release.md/);
  assert.match((await ok(f, ["glob", "**/release.md"])).text, /release.md/);
  assert.match(
    (await ok(f, ["grep", "$(literal)", "--literal", "--context", "1"])).text,
    /release.md/,
  );
  const empty = await ok(f, ["grep", "does-not-exist", "--literal"]);
  assert.equal(empty.ok, true);
  assert.equal(created.binding.projectId, rest.binding.projectId);
  await ok(f, ["edit", memoryPath, "--content-file", "-"], { input: markdown("修订后\n") });
  assert.equal(await fs.readFile(physical, "utf8"), markdown("修订后\n"));
});

void test("Core exact edits are atomic and stale edits fail across processes", async (t) => {
  const f = await fixture(t);
  await ok(f, ["edit", "@project/core.md", "--content-file", "-"], { input: "original\nkeep\n" });
  const refused = await run(f, ["edit", "@project/core.md", "--content-file", "-"], {
    input: "overwrite",
  });
  assert.equal(refused.code, 1);
  assert.equal(refused.result.error.code, "nonempty-core-requires-exact-edit");
  const edits = JSON.stringify([{ oldText: "original", newText: "updated" }]);
  const responses = await Promise.all([
    run(f, ["edit", "@project/core.md", "--edits-file", "-"], { input: edits }),
    run(f, ["edit", "@project/core.md", "--edits-file", "-"], { input: edits }),
  ]);
  assert.deepEqual(
    responses.map((item) => item.code).sort((a, b) => a - b),
    [0, 1],
  );
  const physical = (await ok(f, ["absolute-path", "@project/core.md"])).text;
  assert.equal(await fs.readFile(physical, "utf8"), "updated\nkeep\n");
  const atomic = await run(f, ["edit", "@project/core.md", "--edits-file", "-"], {
    input: JSON.stringify([
      { oldText: "updated", newText: "wrong" },
      { oldText: "missing", newText: "other" },
    ]),
  });
  assert.equal(atomic.code, 1);
  assert.equal(await fs.readFile(physical, "utf8"), "updated\nkeep\n");
});

void test("feedback, same-cognition editing, moving and removal preserve current state", async (t) => {
  const f = await fixture(t);
  await ok(f, ["write", memoryPath, "--content-file", "-"], { input: markdown() });
  await ok(f, ["feedback", memoryPath, "adopt"]);
  await ok(f, ["feedback", memoryPath, "question", "--challenge-file", "-"], {
    input: "当前环境已有具体反例\n仍待核实",
  });
  await ok(f, ["edit", memoryPath, "--edits-file", "-"], {
    input: JSON.stringify([{ oldText: "中文正文", newText: "修订正文" }]),
  });
  const moved = "@project/memories/knowledge/moved.md";
  await ok(f, ["mv", memoryPath, moved]);
  assert.match((await ok(f, ["cat", moved])).text, /当前环境已有具体反例/);
  await ok(f, ["feedback", moved, "resolve"]);
  assert.doesNotMatch((await ok(f, ["cat", moved])).text, /当前环境已有具体反例/);
  await ok(f, ["rm", moved]);
  assert.equal((await run(f, ["cat", moved])).code, 1);
});

void test("project binding stays explicit and related aliases retain permissions", async (t) => {
  const f = await fixture(t);
  const related = path.join(f.temp, "related");
  const subdirectory = path.join(f.project, "src");
  await fs.mkdir(related);
  await fs.mkdir(subdirectory);
  const current = await ok(f, ["cat", "@project/core.md"]);
  assert.equal(
    (await ok(f, ["cat", "@project/core.md"], { cwd: subdirectory })).binding.projectId,
    current.binding.projectId,
  );
  await ok(f, ["write", memoryPath, "--content-file", "-"], {
    project: related,
    input: markdown("关联项目独有词\n"),
  });
  await fs.mkdir(path.join(f.project, ".brain"));
  const configPath = path.join(f.project, ".brain", "config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({ relatedProjects: { related: { path: "../related", access: "read" } } }),
  );
  assert.match((await ok(f, ["grep", "关联项目独有词", "--literal"])).text, /#related\/memories/);
  const aliasPath = memoryPath.replace("@project", "#related");
  assert.match((await ok(f, ["cat", aliasPath])).text, /关联项目独有词/);
  const denied = await run(f, ["write", aliasPath, "--content-file", "-"], {
    input: markdown("denied"),
  });
  assert.equal(denied.result.error.code, "related-project-read-only");
  await fs.writeFile(
    configPath,
    JSON.stringify({ relatedProjects: { related: { path: "../related", access: "write" } } }),
  );
  await ok(f, ["write", aliasPath, "--content-file", "-"], { input: markdown("允许写入\n") });
  assert.match((await ok(f, ["cat", memoryPath], { project: related })).text, /允许写入/);
});

void test("think and virtual guidance use existing entry and configured workflow", async (t) => {
  const f = await fixture(t);
  assert.match((await ok(f, ["think"])).text, /处理流程/);
  const workflow = path.join(f.temp, "custom-flow.md");
  await fs.writeFile(workflow, "configured custom workflow\n");
  await fs.writeFile(
    path.join(f.brain, "config.json"),
    JSON.stringify({ thinkWorkflowFile: workflow }),
  );
  assert.match((await ok(f, ["cat", "@brain-virtual/normal.md"])).text, /常规流程/);
  assert.ok((await ok(f, ["cat", "@brain-virtual/deep.md"])).text.includes(workflow));
  assert.match((await ok(f, ["cat", "@brain-virtual/deep-memory.md"])).text, /Global Core/);
});

void test("semantic disabled/unavailable differs from an empty result and defers writes durably", async (t) => {
  const f = await fixture(t);
  const disabled = await run(f, ["ask-search", "发布决定"]);
  assert.equal(disabled.code, 1);
  assert.equal(disabled.result.error.code, "semantic-search-disabled");
  await fs.mkdir(f.brain, { recursive: true });
  await fs.writeFile(
    path.join(f.brain, "config.json"),
    JSON.stringify({ semanticSearch: { enabled: true } }),
  );
  const unavailable = await run(f, ["ask-search", "发布决定"]);
  assert.equal(unavailable.code, 1);
  assert.equal(unavailable.result.error.code, "semantic-search-unavailable");
  const saved = await ok(f, ["write", memoryPath, "--content-file", "-"], { input: markdown() });
  assert.ok(saved.warnings.some((warning) => warning.includes("Semantic index update deferred")));
  const pending = await fs.readdir(path.join(f.brain, ".runtime", "semantic-search", "pending"));
  assert.ok(pending.some((name) => name.endsWith(".pending")));
  const read = await ok(f, ["cat", memoryPath]);
  assert.match(read.text, /中文正文/);
  assert.ok(!read.warnings.some((warning) => warning.includes("Semantic index update deferred")));
});

void test("semantic worker protocol, indexed mutation and abort release owned resources", async (t) => {
  const f = await fixture(t);
  await ok(f, ["write", memoryPath, "--content-file", "-"], { input: markdown() });
  const paths = semanticRuntimePaths(f.brain);
  await fs.mkdir(path.dirname(paths.python), { recursive: true });
  // A deterministic local Node executable speaks the existing embedding worker
  // protocol. No Python package, model download or model inference is required.
  try {
    await fs.link(process.execPath, paths.python);
  } catch {
    await fs.copyFile(process.execPath, paths.python);
    await fs.chmod(paths.python, 0o755);
  }
  await fs.writeFile(
    paths.manifest,
    JSON.stringify({
      schemaVersion: 1,
      fastembedVersion: SEMANTIC_FASTEMBED_VERSION,
      model: SEMANTIC_MODEL,
      dimension: SEMANTIC_DIMENSION,
      fingerprint: SEMANTIC_FINGERPRINT,
    }),
  );
  const pidFile = path.join(paths.root, "worker.pid");
  const pendingFile = path.join(paths.root, "request.pending");
  const worker = (hang = false) => `
const fs = require('node:fs');
const readline = require('node:readline');
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
console.log(JSON.stringify({type:'ready',dimension:${SEMANTIC_DIMENSION},fingerprint:${JSON.stringify(SEMANTIC_FINGERPRINT)}}));
readline.createInterface({input:process.stdin}).on('line', line => {
  const request=JSON.parse(line);
  ${hang ? `fs.writeFileSync(${JSON.stringify(pendingFile)}, 'waiting');` : `console.log(JSON.stringify({id:request.id,vectors:request.texts.map(()=>[1,...Array(${SEMANTIC_DIMENSION - 1}).fill(0)])}));`}
});
`;
  await fs.writeFile(paths.worker, worker());
  await fs.writeFile(
    path.join(f.brain, "config.json"),
    JSON.stringify({ semanticSearch: { enabled: true } }),
  );
  assert.match((await ok(f, ["ask-search", "发布决定"])).text, /release.md/);
  const firstPid = Number(await fs.readFile(pidFile, "utf8"));
  const waitForExit = async (pid) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") return;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`Embedding worker ${pid} still running after CLI cleanup`);
  };
  await waitForExit(firstPid);
  await ok(f, ["edit", memoryPath, "--content-file", "-"], {
    input: markdown().replace("已确认发布决定", "新的发布规则"),
  });
  assert.match((await ok(f, ["ask-search", "新的发布规则"])).text, /release.md/);

  await fs.writeFile(paths.worker, worker(true));
  const controller = new AbortController();
  const runtime = await createCliRuntime(
    {
      command: "ask-search",
      tool: "brain_ask_search",
      project: f.project,
      brainRoot: f.brain,
      json: true,
      args: { query: "等待中断" },
    },
    [],
    controller.signal,
  );
  try {
    const operation = runtime.execute();
    // Attach rejection handling before aborting the in-flight local worker.
    const rejected = assert.rejects(operation);
    let pending = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await fs.access(pendingFile);
        pending = true;
        break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(pending, true, "query reached worker before interruption");
    const pid = Number(await fs.readFile(pidFile, "utf8"));
    controller.abort();
    await rejected;
    runtime.close();
    await waitForExit(pid);
  } finally {
    controller.abort();
    runtime.close();
  }
});
