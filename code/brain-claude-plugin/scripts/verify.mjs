import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hookEntry = join(pluginRoot, "dist", "user-prompt-submit.mjs");
const permissionEntry = join(pluginRoot, "dist", "permission-request.mjs");
const mcpEntry = join(pluginRoot, "dist", "mcp-server.mjs");
const sessionEndEntry = join(pluginRoot, "dist", "session-end.mjs");
const toolPrefix = "mcp__plugin_brain-claude-plugin_brain__";

function runProcess(entry, { cwd, env, input }) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [entry], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("exit", (code) => done({ code, stdout, stderr }));
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

async function mcpSession({ env, requests }) {
  const child = spawn(process.execPath, [mcpEntry], {
    cwd: pluginRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let buffer = "";
  let stderr = "";
  const pending = new Map();
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const response = JSON.parse(line);
      const waiter = pending.get(response.id);
      if (waiter) {
        pending.delete(response.id);
        clearTimeout(waiter.timer);
        waiter.resolve(response);
      }
    }
  });
  child.on("exit", (code) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`MCP exited with ${code}: ${stderr}`));
    }
    pending.clear();
  });
  async function send(request) {
    if (request.id === undefined) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
      return undefined;
    }
    const response = new Promise((done, reject) => {
      const timer = setTimeout(() => {
        pending.delete(request.id);
        reject(new Error(`MCP response ${request.id} timed out: ${stderr}`));
      }, 20000);
      pending.set(request.id, { resolve: done, reject, timer });
    });
    child.stdin.write(`${JSON.stringify(request)}\n`);
    return response;
  }
  try {
    const responses = [];
    for (const request of requests) responses.push(await send(request));
    return responses;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((done) => {
        child.once("exit", done);
        child.kill();
      });
    }
  }
}

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "brain-claude-verify", version: "0.1.0" },
  },
};
const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };
const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
function call(id, name, args) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

async function main() {
  const manifest = JSON.parse(await readFile(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, "brain-claude-plugin");
  assert.equal(manifest.hooks, "./hooks/hooks.json");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  const mcpConfig = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
  assert.deepEqual(mcpConfig.mcpServers.brain.args, ["${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.mjs"]);
  const hookConfig = JSON.parse(await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8"));
  assert.deepEqual(hookConfig.hooks.UserPromptSubmit[0].hooks[0].args, ["${CLAUDE_PLUGIN_ROOT}/dist/user-prompt-submit.mjs"]);
  assert.match(hookConfig.hooks.PermissionRequest[0].matcher, /plugin_brain-claude-plugin_brain/);
  console.log("PASS Claude plugin paths and scoped tool matcher");

  const temp = await mkdtemp(join(tmpdir(), "brain-claude-verify-"));
  const firstRoot = join(temp, "first-project");
  const secondRoot = join(temp, "second-project");
  const data = join(temp, "plugin-data");
  await mkdir(firstRoot);
  await mkdir(secondRoot);
  await mkdir(data);
  const baseEnv = { ...process.env, HOME: temp, USERPROFILE: temp, CLAUDE_PLUGIN_DATA: data };
  const firstEnv = { ...baseEnv, CLAUDE_PROJECT_DIR: firstRoot, CLAUDE_CODE_SESSION_ID: "claude-verify-one" };
  const secondEnv = { ...baseEnv, CLAUDE_PROJECT_DIR: secondRoot };
  const prompt = {
    hook_event_name: "UserPromptSubmit",
    session_id: "claude-verify-one",
    transcript_path: join(temp, "first.jsonl"),
    cwd: join(firstRoot, "nested"),
    prompt: "Verify restoration",
  };
  const permission = {
    hook_event_name: "PermissionRequest",
    session_id: prompt.session_id,
    transcript_path: prompt.transcript_path,
    cwd: prompt.cwd,
    permission_mode: "default",
    tool_name: `${toolPrefix}brain_write`,
    tool_input: {},
  };
  try {
    const beforeRestore = await runProcess(permissionEntry, { cwd: pluginRoot, env: firstEnv, input: permission });
    assert.equal(beforeRestore.stdout, "");
    const restored = await runProcess(hookEntry, { cwd: pluginRoot, env: firstEnv, input: prompt });
    assert.equal(restored.code, 0, restored.stderr);
    const context = JSON.parse(restored.stdout).hookSpecificOutput.additionalContext;
    assert.match(context, /# 处理流程/);
    assert.match(context, /@brain-virtual\/normal\.md/);
    assert.match(context, /@brain-virtual\/deep\.md/);
    assert.doesNotMatch(context, /<core\b/);
    console.log("PASS hook provides processing entry from Claude project root");

    const readPermission = await runProcess(permissionEntry, {
      cwd: pluginRoot,
      env: firstEnv,
      input: { ...permission, tool_name: `${toolPrefix}brain_cat` },
    });
    assert.equal(JSON.parse(readPermission.stdout).hookSpecificOutput.decision.behavior, "allow");
    const writePermission = await runProcess(permissionEntry, { cwd: pluginRoot, env: firstEnv, input: permission });
    assert.equal(JSON.parse(writePermission.stdout).hookSpecificOutput.decision.behavior, "allow");
    for (const changed of [
      { ...permission, permission_mode: "plan" },
      { ...permission, transcript_path: join(temp, "other.jsonl") },
    ]) {
      const result = await runProcess(permissionEntry, { cwd: pluginRoot, env: firstEnv, input: changed });
      assert.equal(result.stdout, "");
    }
    console.log("PASS read and checkpoint backed write permission; plan and mismatched transcript defer");

    const firstMcp = await mcpSession({
      env: firstEnv,
      requests: [
        init,
        initialized,
        list,
        call(3, "brain_write", {
          path: "@project/memories/knowledge/routed.md",
          content: "---\ndescription: Claude first project\nimportance: high\n---\nFirst project only.\n",
        }),
        call(4, "brain_cat", { path: "@project/memories/knowledge/routed.md" }),
        call(5, "brain_step", { action: "start", message: "当前真实会话轮次" }),
        call(6, "brain_step", { action: "update", updates: { intent: "本轮有据理解" } }),
      ],
    });
    assert.equal(firstMcp[0].result.instructions, undefined);
    const names = firstMcp[2].result.tools.map((tool) => tool.name);
    assert.equal(names.includes("brain_think"), false);
    assert.equal(names.length, 11);
    assert.equal(names.includes("brain_step"), true);
    assert.notEqual(firstMcp[5].result.isError, true);
    assert.notEqual(firstMcp[6].result.isError, true);
    const stepFile = join(firstRoot, ".brain-working", "brain-step-three-phase", createHash("sha256").update(prompt.session_id).digest("hex") + ".json");
    const firstStep = JSON.parse(await readFile(stepFile, "utf8"));
    assert.equal(firstStep.state.notes.intent, "本轮有据理解");
    assert.ok(firstStep.turnId);
    const nextPrompt = await runProcess(hookEntry, { cwd: pluginRoot, env: firstEnv, input: { ...prompt, prompt: "下一轮" } });
    assert.equal(nextPrompt.code, 0, nextPrompt.stderr);
    const nextStep = await mcpSession({ env: firstEnv, requests: [init, initialized, call(3, "brain_step", { action: "start", message: "下一轮" })] });
    assert.notEqual(nextStep[2].result.isError, true);
    const refreshedStep = JSON.parse(await readFile(stepFile, "utf8"));
    assert.notEqual(refreshedStep.turnId, firstStep.turnId);
    assert.equal(refreshedStep.state.notes.intent, null);
    const ended = await runProcess(sessionEndEntry, { cwd: pluginRoot, env: firstEnv, input: { hook_event_name: "SessionEnd", session_id: prompt.session_id, reason: "clear" } });
    assert.equal(ended.code, 0, ended.stderr);
    const stale = await mcpSession({ env: firstEnv, requests: [init, initialized, call(3, "brain_step", { action: "start", message: "不得串用已结束会话" })] });
    assert.equal(stale[2].result.isError, true);
    assert.equal(await readFile(stepFile, "utf8"), JSON.stringify(refreshedStep, null, 2) + "\n");
    console.log("PASS native brain_step resets trusted hook turns and refuses ended session bindings");
    assert.match(firstMcp[4].result.content[0].text, /First project only/);
    const secondMcp = await mcpSession({
      env: secondEnv,
      requests: [init, initialized, list, call(3, "brain_cat", { path: "@project/memories/knowledge/routed.md" })],
    });
    assert.equal(secondMcp[3].result.isError, true);
    console.log("PASS MCP hides brain_think and separates two projects");

    const degradedRoot = join(temp, "degraded-project");
    await mkdir(degradedRoot);
    const degradedEnv = { ...baseEnv, CLAUDE_PROJECT_DIR: degradedRoot };
    for (const key of Object.keys(degradedEnv)) {
      if (key.toLowerCase() === "path") degradedEnv[key] = "";
    }
    const degradedPrompt = {
      ...prompt,
      session_id: "claude-verify-degraded",
      transcript_path: join(temp, "degraded.jsonl"),
    };
    const degradedRestore = await runProcess(hookEntry, {
      cwd: pluginRoot,
      env: degradedEnv,
      input: degradedPrompt,
    });
    assert.equal(degradedRestore.code, 0, degradedRestore.stderr);
    assert.match(degradedRestore.stderr, /history/i);
    const degradedPermission = await runProcess(permissionEntry, {
      cwd: pluginRoot,
      env: degradedEnv,
      input: { ...permission, session_id: degradedPrompt.session_id, transcript_path: degradedPrompt.transcript_path },
    });
    assert.equal(degradedPermission.stdout, "");
    console.log("PASS degraded checkpoint leaves writes to Claude permission flow");

    const brainConfigDir = join(temp, ".brain-data");
    await mkdir(brainConfigDir, { recursive: true });
    await writeFile(join(brainConfigDir, "config.json"), JSON.stringify({ semanticSearch: { enabled: true } }));
    const semanticMcp = await mcpSession({ env: firstEnv, requests: [init, initialized, list] });
    const semanticNames = semanticMcp[2].result.tools.map((tool) => tool.name);
    assert.equal(semanticNames.includes("brain_ask_search"), true);
    assert.equal(semanticNames.length, 12);
    console.log("PASS global Semantic Search config adds brain_ask_search");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
