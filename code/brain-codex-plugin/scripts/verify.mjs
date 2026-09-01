import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hookEntry = join(pluginRoot, "dist", "user-prompt-submit.mjs");
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

  const hookConfig = JSON.parse(await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8"));
  const hook = hookConfig.hooks.UserPromptSubmit[0].hooks[0];
  assert.equal(hook.type, "command");
  assert.match(hook.command, /dist\/user-prompt-submit\.mjs/);
  assert.match(hook.commandWindows, /dist\\user-prompt-submit\.mjs/);
  assert.equal(hook.timeout, 10);
  assert.equal(hook.statusMessage, "Preparing Brain context");
  assert.equal(hook.additionalContextLimit, 0);
  console.log("PASS UserPromptSubmit is configured to deliver complete Brain context");

  const temp = await mkdtemp(join(tmpdir(), "brain-codex-plugin-"));
  const firstSourceRoot = join(temp, "project-one");
  const secondSourceRoot = join(temp, "project-two");
  await mkdir(firstSourceRoot, { recursive: true });
  await mkdir(secondSourceRoot, { recursive: true });
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
    assert.match(firstContext, /<brain_think_context\b/);
    assert.match(firstContext, /@session\/codex-verify-session-one/);
    assert.doesNotMatch(firstContext, /<brain_context\b/);
    console.log("PASS hook restores Brain directly for the documented cwd/session input");

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
            content: "---\nsummary: first route\nimportance: high\n---\nfirst project\n",
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
            content: "---\nsummary: second route\nimportance: high\n---\nsecond project\n",
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
    const mcp = await runMcpSession(mcpEntry, {
      cwd: pluginRoot,
      env,
      requests,
    });
    const messages = mcp.messages;
    const listed = messages.find((message) => message.id === 2);
    assert.ok(listed, `tools/list missing; stderr=${mcp.stderr}`);
    const names = listed.result.tools.map((tool) => tool.name);
    assert.equal(names.includes("brain_think"), false);
    assert.equal(names.includes("brain_write"), true);
    assert.equal(names.length, 10);
    console.log("PASS MCP omits brain_think after host-owned restoration");

    const firstCat = messages.find((message) => message.id === 6);
    const secondCat = messages.find((message) => message.id === 7);
    assert.match(firstCat.result.content[0].text, /first project/);
    assert.doesNotMatch(firstCat.result.content[0].text, /second project/);
    assert.match(secondCat.result.content[0].text, /second project/);
    assert.doesNotMatch(secondCat.result.content[0].text, /first project/);
    console.log("PASS one long-lived MCP server routes two sessions to distinct projects");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
