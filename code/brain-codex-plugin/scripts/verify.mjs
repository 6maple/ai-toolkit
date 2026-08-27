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

async function main() {
  const manifest = JSON.parse(
    await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
  );
  assert.equal(manifest.hooks, "./hooks/hooks.json");
  console.log("PASS manifest explicitly declares bundled hooks");

  const temp = await mkdtemp(join(tmpdir(), "brain-codex-plugin-"));
  const sourceRoot = join(temp, "project");
  await mkdir(sourceRoot, { recursive: true });
  const env = { ...process.env, HOME: temp, USERPROFILE: temp };

  try {
    const hookInput = {
      session_id: "codex-verify-session",
      turn_id: "turn-1",
      cwd: sourceRoot,
      hook_event_name: "UserPromptSubmit",
      prompt: "verify",
    };
    const hook = await runProcess(hookEntry, {
      cwd: pluginRoot,
      env,
      input: `${JSON.stringify(hookInput)}\n`,
    });
    assert.equal(hook.code, 0, hook.stderr);
    const output = JSON.parse(hook.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    const context = output.hookSpecificOutput.additionalContext;
    assert.match(context, /^<brain_context\b/);
    assert.match(context, /delivery="codex-user-prompt-submit"/);
    assert.match(context, /<brain_think_context\b/);
    assert.match(context, /@session\/codex-verify-session/);
    assert.match(context, /<\/brain_context>\n$/);
    console.log("PASS hook restores and wraps Brain context from stdin cwd/session");

    const request = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "brain-codex-verify", version: "0.1.0" },
      },
    })}\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`;
    const mcp = await runProcess(mcpEntry, {
      cwd: sourceRoot,
      env,
      input: request,
      stopWhen: (output) => output.includes('"id":2'),
    });
    const messages = mcp.stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const listed = messages.find((message) => message.id === 2);
    assert.ok(listed, `tools/list missing; stderr=${mcp.stderr}`);
    const names = listed.result.tools.map((tool) => tool.name);
    assert.equal(names.includes("brain_think"), false);
    assert.equal(names.includes("brain_write"), true);
    assert.equal(names.length, 10);
    console.log("PASS MCP exposes ten tools and hides brain_think");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
