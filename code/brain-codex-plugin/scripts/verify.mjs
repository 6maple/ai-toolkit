import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hookEntry = join(pluginRoot, "dist", "user-prompt-submit.mjs");
const permissionHookEntry = join(pluginRoot, "dist", "permission-request.mjs");
const mcpEntry = join(pluginRoot, "dist", "mcp-server.mjs");

function runProcess(entry, { cwd, env, input, stopWhen }) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(process.execPath, [entry], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stopWhen?.(stdout)) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolveProcess({ code, signal, stdout, stderr }));
    child.stdin.end(input);
  });
}

function runMcpSession(entry, { cwd, env, requests }) {
  return new Promise((resolveSession, rejectSession) => {
    const child = spawn(process.execPath, [entry], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const messages = [];
    const pending = new Map();
    let buffer = "";
    let stderr = "";
    let settled = false;

    function rejectPending(error) {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
      pending.clear();
    }

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        messages.push(message);
        const waiter = pending.get(message.id);
        if (waiter !== undefined) {
          pending.delete(message.id);
          clearTimeout(waiter.timer);
          waiter.resolve(message);
        }
      }
    });
    child.on("error", (error) => {
      rejectPending(error);
      if (!settled) {
        settled = true;
        rejectSession(error);
      }
    });
    child.on("exit", (code, signal) => {
      const error = new Error(
        `MCP server exited before verification completed: code=${code} signal=${signal}\n${stderr}`,
      );
      rejectPending(error);
    });

    async function send(message) {
      let response;
      if (message.id !== undefined) {
        response = new Promise((resolveResponse, rejectResponse) => {
          const timer = setTimeout(() => {
            pending.delete(message.id);
            rejectResponse(
              new Error(`timed out waiting for MCP response ${message.id}\n${stderr}`),
            );
          }, 20_000);
          pending.set(message.id, { resolve: resolveResponse, reject: rejectResponse, timer });
        });
      }
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return response;
    }

    (async () => {
      try {
        for (const request of requests) await send(request);
        settled = true;
        child.kill();
        resolveSession({ messages, stderr });
      } catch (error) {
        settled = true;
        child.kill();
        rejectSession(error);
      }
    })();
  });
}

async function main() {
  const manifest = JSON.parse(
    await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
  );
  assert.equal(manifest.hooks, "./hooks/hooks.json");
  console.log("PASS manifest explicitly declares bundled hooks");

  const mcpConfig = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
  assert.deepEqual(mcpConfig.mcpServers.brain.omit_tools_from, ["deferred"]);
  console.log("PASS Brain MCP tools stay directly visible instead of entering deferred tool search");

  const hookConfig = JSON.parse(await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8"));
  const hook = hookConfig.hooks.UserPromptSubmit[0].hooks[0];
  assert.equal(hook.type, "command");
  assert.match(hook.command, /dist\/user-prompt-submit\.mjs/);
  assert.match(hook.commandWindows, /dist\\user-prompt-submit\.mjs/);
  assert.equal(hook.timeout, 10);
  assert.equal(hook.statusMessage, "Preparing Brain context");
  assert.equal(hook.additionalContextLimit, 0);
  console.log("PASS UserPromptSubmit is configured to deliver complete Brain context");

  const permissionHook = hookConfig.hooks.PermissionRequest[0];
  assert.equal(
    permissionHook.matcher,
    "^mcp__brain__brain_(absolute_path|ls|glob|grep|ask_search|cat|write|edit|rm|mv|feedback|step)$",
  );
  assert.match(permissionHook.hooks[0].command, /dist\/permission-request\.mjs/);
  assert.match(permissionHook.hooks[0].commandWindows, /dist\\permission-request\.mjs/);
  console.log("PASS PermissionRequest covers the complete Brain MCP surface");

  const temp = await mkdtemp(join(tmpdir(), "brain-codex-plugin-"));
  const firstSourceRoot = join(temp, "project-one");
  const secondSourceRoot = join(temp, "project-two");
  const degradedSourceRoot = join(temp, "project-no-history");
  await mkdir(firstSourceRoot, { recursive: true });
  await mkdir(secondSourceRoot, { recursive: true });
  await mkdir(degradedSourceRoot, { recursive: true });
  const env = { ...process.env, HOME: temp, USERPROFILE: temp };

  try {
    const firstHookInput = {
      session_id: "codex-verify-session-one",
      turn_id: "turn-1",
      cwd: firstSourceRoot,
      hook_event_name: "UserPromptSubmit",
      prompt: "verify one",
    };
    const prompted = await runProcess(hookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify(firstHookInput)}\n`,
    });
    assert.equal(prompted.code, 0, prompted.stderr);
    const firstHookOutput = JSON.parse(prompted.stdout);
    assert.equal(firstHookOutput.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    const firstContext = firstHookOutput.hookSpecificOutput.additionalContext;
    assert.equal(typeof firstContext, "string");
    assert.match(firstContext, /# 处理流程/);
    assert.match(firstContext, /@brain-virtual\/deep\.md/);
    assert.doesNotMatch(firstContext, /<core\b/);
    assert.doesNotMatch(firstContext, /<brain_context\b/);
    console.log("PASS hook provides processing entry and records the host binding");

    const permissionInput = {
      session_id: firstHookInput.session_id,
      turn_id: firstHookInput.turn_id,
      cwd: firstSourceRoot,
      hook_event_name: "PermissionRequest",
      permission_mode: "default",
      tool_name: "mcp__brain__brain_cat",
      tool_input: { path: "@global/core.md" },
    };
    const readPermission = await runProcess(permissionHookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify(permissionInput)}\n`,
    });
    assert.equal(readPermission.code, 0, readPermission.stderr);
    assert.equal(JSON.parse(readPermission.stdout).hookSpecificOutput.decision.behavior, "allow");

    const mutationInput = {
      ...permissionInput,
      tool_name: "mcp__brain__brain_rm",
      tool_input: { path: "@global/memories/knowledge/example.md" },
    };
    const mutationPermission = await runProcess(permissionHookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify(mutationInput)}\n`,
    });
    assert.equal(mutationPermission.code, 0, mutationPermission.stderr);
    assert.equal(
      JSON.parse(mutationPermission.stdout).hookSpecificOutput.decision.behavior,
      "allow",
    );

    const planPermission = await runProcess(permissionHookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify({ ...mutationInput, permission_mode: "plan" })}\n`,
    });
    assert.equal(planPermission.code, 0, planPermission.stderr);
    assert.equal(planPermission.stdout, "");

    const staleTurnPermission = await runProcess(permissionHookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify({ ...mutationInput, turn_id: "stale-turn" })}\n`,
    });
    assert.equal(staleTurnPermission.code, 0, staleTurnPermission.stderr);
    assert.equal(staleTurnPermission.stdout, "");
    console.log("PASS current-turn Git recovery auto-allows Brain reads and mutations");

    const degradedEnv = { ...env };
    for (const key of Object.keys(degradedEnv)) {
      if (key.toLowerCase() === "path") degradedEnv[key] = "";
    }
    const degradedHookInput = {
      session_id: "codex-verify-session-no-history",
      turn_id: "turn-no-history",
      cwd: degradedSourceRoot,
      hook_event_name: "UserPromptSubmit",
      prompt: "verify degraded history",
    };
    const degradedPrompted = await runProcess(hookEntry, {
      cwd: degradedSourceRoot,
      env: degradedEnv,
      input: `${JSON.stringify(degradedHookInput)}\n`,
    });
    assert.equal(degradedPrompted.code, 0, degradedPrompted.stderr);
    assert.match(degradedPrompted.stderr, /history/i);

    const degradedReadPermission = await runProcess(permissionHookEntry, {
      cwd: degradedSourceRoot,
      env,
      input: `${JSON.stringify({
        ...permissionInput,
        session_id: degradedHookInput.session_id,
        turn_id: degradedHookInput.turn_id,
        cwd: degradedSourceRoot,
      })}\n`,
    });
    assert.equal(degradedReadPermission.code, 0, degradedReadPermission.stderr);
    assert.equal(
      JSON.parse(degradedReadPermission.stdout).hookSpecificOutput.decision.behavior,
      "allow",
    );

    const degradedMutationPermission = await runProcess(permissionHookEntry, {
      cwd: degradedSourceRoot,
      env,
      input: `${JSON.stringify({
        ...mutationInput,
        session_id: degradedHookInput.session_id,
        turn_id: degradedHookInput.turn_id,
        cwd: degradedSourceRoot,
      })}\n`,
    });
    assert.equal(degradedMutationPermission.code, 0, degradedMutationPermission.stderr);
    assert.equal(degradedMutationPermission.stdout, "");
    console.log("PASS degraded Git history keeps reads automatic but mutations in normal approval flow");
    const refreshed = await runProcess(hookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify({ ...firstHookInput, turn_id: "turn-1b" })}\n`,
    });
    assert.equal(refreshed.code, 0, refreshed.stderr);
    console.log("PASS a later prompt atomically refreshes the same session binding");

    const secondHookInput = {
      session_id: "codex-verify-session-two",
      turn_id: "turn-2",
      cwd: secondSourceRoot,
      hook_event_name: "UserPromptSubmit",
      prompt: "verify two",
    };
    const secondPrompted = await runProcess(hookEntry, {
      cwd: secondSourceRoot,
      env,
      input: `${JSON.stringify(secondHookInput)}\n`,
    });
    assert.equal(secondPrompted.code, 0, secondPrompted.stderr);

    const requests = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "brain-codex-verify", version: "0.1.0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          _meta: { threadId: "codex-verify-session-one" },
          name: "brain_write",
          arguments: {
            path: "@project/memories/knowledge/routed.md",
            content: "---\ndescription: first route\nimportance: high\n---\nfirst project\n",
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          _meta: { threadId: "codex-verify-session-two" },
          name: "brain_write",
          arguments: {
            path: "@project/memories/knowledge/routed.md",
            content: "---\ndescription: second route\nimportance: high\n---\nsecond project\n",
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          _meta: { threadId: "codex-verify-session-one" },
          name: "brain_cat",
          arguments: { path: "@project/memories/knowledge/routed.md" },
        },
      },
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          _meta: { threadId: "codex-verify-session-two" },
          name: "brain_cat",
          arguments: { path: "@project/memories/knowledge/routed.md" },
        },
      },
    ];
    requests.push(...["codex-verify-session-one", "codex-verify-session-two"].map((threadId, index) => ({
      jsonrpc: "2.0", id: 8 + index, method: "tools/call", params: { _meta: { threadId }, name: "brain_cat", arguments: { path: "@brain-virtual/deep-memory.md" } },
    })));
    const stepCall = (id, threadId, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { _meta: { threadId }, name: "brain_step", arguments: args } });
    requests.push(
      stepCall(100, firstHookInput.session_id, { action: "start", message: "第一会话实际轮次" }),
      stepCall(101, firstHookInput.session_id, { action: "update", updates: { intent: "本轮已保存" } }),
      stepCall(102, secondHookInput.session_id, { action: "start", message: "第二会话独立内容" }),
      stepCall(103, firstHookInput.session_id, { action: "status" }),
    );
    const mcp = await runMcpSession(mcpEntry, {
      cwd: pluginRoot,
      env,
      requests,
    });
    const messages = mcp.messages;
    const initialized = messages.find((message) => message.id === 1);
    assert.ok(initialized, `initialize missing; stderr=${mcp.stderr}`);
    assert.equal(initialized.result.instructions, undefined);
    console.log("PASS host-restored MCP does not instruct the model to call brain_think");

    const listed = messages.find((message) => message.id === 2);
    assert.ok(listed, `tools/list missing; stderr=${mcp.stderr}`);
    const names = listed.result.tools.map((tool) => tool.name);
    assert.equal(names.includes("brain_think"), false);
    assert.equal(names.includes("brain_write"), true);
    assert.equal(names.length, 11);
    assert.equal(names.includes("brain_step"), true);
    console.log("PASS MCP omits brain_think after host-owned restoration");
    for (const id of [100, 101, 102, 103]) assert.notEqual(messages.find(message => message.id === id)?.result?.isError, true);
    const stepFile = (root, sessionId) => join(root, ".brain-working", "brain-step-three-phase", createHash("sha256").update(sessionId).digest("hex") + ".json");
    const firstStep = JSON.parse(await readFile(stepFile(firstSourceRoot, firstHookInput.session_id), "utf8"));
    const secondStep = JSON.parse(await readFile(stepFile(secondSourceRoot, secondHookInput.session_id), "utf8"));
    assert.equal(firstStep.turnId, "turn-1b");
    assert.equal(firstStep.state.notes.intent, "本轮已保存");
    assert.equal(secondStep.state.message, "第二会话独立内容");
    const newPrompt = await runProcess(hookEntry, { cwd: firstSourceRoot, env, input: `${JSON.stringify({ ...firstHookInput, turn_id: "turn-1c" })}\n` });
    assert.equal(newPrompt.code, 0, newPrompt.stderr);
    const nextStep = await runMcpSession(mcpEntry, { cwd: pluginRoot, env, requests: [requests[0], requests[1], stepCall(104, firstHookInput.session_id, { action: "start", message: "同会话下一轮" })] });
    assert.notEqual(nextStep.messages.find(message => message.id === 104)?.result?.isError, true);
    const refreshedStep = JSON.parse(await readFile(stepFile(firstSourceRoot, firstHookInput.session_id), "utf8"));
    assert.equal(refreshedStep.turnId, "turn-1c");
    assert.equal(refreshedStep.state.notes.intent, null);
    console.log("PASS native brain_step follows trusted Codex turns and isolates conversations");

    const firstCat = messages.find((message) => message.id === 6);
    const secondCat = messages.find((message) => message.id === 7);
    assert.match(firstCat.result.content[0].text, /first project/);
    assert.doesNotMatch(firstCat.result.content[0].text, /second project/);
    assert.match(secondCat.result.content[0].text, /second project/);
    assert.doesNotMatch(secondCat.result.content[0].text, /first project/);
    const firstView = messages.find((message) => message.id === 8).result.content[0].text;
    const secondView = messages.find((message) => message.id === 9).result.content[0].text;
    assert.match(firstView, /first route/);
    assert.doesNotMatch(firstView, /second route/);
    assert.match(secondView, /second route/);
    assert.doesNotMatch(secondView, /first route/);
    console.log("PASS one long-lived MCP server routes cognition and virtual views to distinct projects");

    const brainConfigDir = join(temp, ".brain-data");
    await mkdir(brainConfigDir, { recursive: true });
    await writeFile(
      join(brainConfigDir, "config.json"),
      JSON.stringify({ semanticSearch: { enabled: true } }),
      "utf8",
    );

    const semanticPrompted = await runProcess(hookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify({
        ...firstHookInput,
        turn_id: "turn-semantic",
        prompt: "verify semantic guidance",
      })}\n`,
    });
    assert.equal(semanticPrompted.code, 0, semanticPrompted.stderr);
    const semanticContext = JSON.parse(
      semanticPrompted.stdout,
    ).hookSpecificOutput.additionalContext;
    assert.match(semanticContext, /# 处理流程/);
    assert.doesNotMatch(semanticContext, /## 候选与发现/);

    const semanticPermission = await runProcess(permissionHookEntry, {
      cwd: firstSourceRoot,
      env,
      input: `${JSON.stringify({
        ...permissionInput,
        turn_id: "turn-semantic",
        tool_name: "mcp__brain__brain_ask_search",
        tool_input: { query: "relevant past cognition" },
      })}\n`,
    });
    assert.equal(semanticPermission.code, 0, semanticPermission.stderr);
    assert.equal(
      JSON.parse(semanticPermission.stdout).hookSpecificOutput.decision.behavior,
      "allow",
    );

    const semanticMcp = await runMcpSession(mcpEntry, {
      cwd: pluginRoot,
      env,
      requests: [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "brain-codex-semantic-verify", version: "0.1.0" },
          },
        },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { _meta: { threadId: firstHookInput.session_id }, name: "brain_cat", arguments: { path: "@brain-virtual/deep-memory.md" } } },
      ],
    });
    const semanticListed = semanticMcp.messages.find((message) => message.id === 2);
    assert.ok(semanticListed, `semantic tools/list missing; stderr=${semanticMcp.stderr}`);
    const semanticNames = semanticListed.result.tools.map((tool) => tool.name);
    assert.equal(semanticNames.includes("brain_think"), false);
    assert.equal(semanticNames.includes("brain_ask_search"), true);
    assert.equal(semanticNames.length, 12);
    const semanticView = semanticMcp.messages.find((message) => message.id === 3).result;
    assert.notEqual(semanticView.isError, true);
    assert.match(semanticView.content[0].text, /## 候选与发现/);
    assert.match(semanticView.content[0].text, /brain_ask_search/);
    console.log("PASS global Brain semantic config aligns Codex hook, permissions, and MCP surface");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
