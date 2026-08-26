import z from '@deepseek-ai/schemastery';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PUBLIC_BRAIN_TOOLS } from 'brain/public-tools';
export { PUBLIC_BRAIN_TOOLS } from 'brain/public-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { spawn } from 'node:child_process';

class McpClient {
  opts;
  child;
  buffer = "";
  pending = /* @__PURE__ */ new Map();
  nextId = 1;
  closed = false;
  stderrTail = "";
  constructor(opts) {
    this.opts = opts;
  }
  get running() {
    return this.child !== void 0 && !this.closed;
  }
  /** Spawn the server, run initialize, send initialized, fetch tools/list. */
  async start() {
    if (this.running) throw new Error("brain mcp: already started");
    this.closed = false;
    const child = spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      env: this.opts.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    this.child = child;
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      this.stderrTail = (this.stderrTail + text).slice(-4096);
      this.opts.onStderr?.(text);
    });
    child.stdout?.on("data", (chunk) => this.onData(chunk.toString("utf8")));
    child.on("exit", (code, signal) => this.onExit({ code, signal }));
    child.on("error", (error) => this.onExit({ code: null, signal: null, error }));
    try {
      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "brain-dsh-plugin", version: "0.0.1" }
      });
      this.notify("notifications/initialized");
      const list = await this.request("tools/list", {});
      return list.tools ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `brain mcp: server failed to start: ${message}${this.stderrTail ? `
stderr:
${this.stderrTail}` : ""}`
      );
    }
  }
  /** Invoke one server tool. Rejects on timeout, caller abort, or server error. */
  async call(name, args, signal, meta) {
    const result = await this.request(
      "tools/call",
      {
        name,
        arguments: args,
        ...meta?.threadId === void 0 ? {} : { _meta: { threadId: meta.threadId } }
      },
      signal
    );
    return result;
  }
  /** Terminate the child and reject everything in flight. Idempotent. */
  kill() {
    if (!this.child) return;
    this.closed = true;
    const child = this.child;
    this.child = void 0;
    try {
      child.kill();
    } catch {
    }
    this.rejectAll(new Error("brain mcp: client disposed"));
  }
  request(method, params, signal) {
    if (!this.running || !this.child) return Promise.reject(new Error("brain mcp: server not running"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`brain mcp: ${method} timed out after ${this.opts.timeoutMs}ms`));
      }, this.opts.timeoutMs);
      const onAbort = () => {
        this.pending.delete(id);
        clearTimeout(timer);
        this.notify("notifications/cancelled", { requestId: id, reason: "caller aborted" });
        reject(new Error("brain mcp: tool call aborted"));
      };
      if (signal?.aborted) {
        clearTimeout(timer);
        reject(new Error("brain mcp: tool call aborted"));
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener("abort", onAbort);
          clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          signal?.removeEventListener("abort", onAbort);
          clearTimeout(timer);
          reject(reason);
        },
        timer
      });
      this.child?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  notify(method, params = {}) {
    this.child?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      this.onMessage(message);
    }
  }
  onMessage(message) {
    if (typeof message !== "object" || message === null) return;
    const record = message;
    if (typeof record.id !== "number") return;
    const pending = this.pending.get(record.id);
    if (!pending) return;
    this.pending.delete(record.id);
    if (record.error !== void 0 && record.error !== null) {
      const error = record.error;
      pending.reject(new Error(`brain mcp: server error: ${String(error.message ?? JSON.stringify(error))}`));
      return;
    }
    pending.resolve(record.result);
  }
  onExit(info) {
    const wasRunning = this.running;
    this.child = void 0;
    this.closed = true;
    if (this.opts.onExit) {
      try {
        this.opts.onExit(info);
      } catch {
      }
    }
    if (wasRunning) {
      const detail = info.error ? String(info.error) : `exit code ${info.code ?? "null"}, signal ${info.signal ?? "null"}`;
      this.rejectAll(
        new Error(
          `brain mcp: server exited (${detail})${this.stderrTail ? `
stderr:
${this.stderrTail}` : ""}`
        )
      );
    }
  }
  rejectAll(reason) {
    for (const pending of this.pending.values()) pending.reject(reason);
    this.pending.clear();
  }
}
function extractText(content, toolName) {
  if (!Array.isArray(content)) return "(no output)";
  const parts = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) {
      parts.push("[unsupported content type]");
      continue;
    }
    switch (block.type) {
      case "text":
        parts.push(block.text ?? "");
        break;
      case "image":
        parts.push(`[image: ${"mimeType" in block ? String(block.mimeType) : "unknown"}, content discarded]`);
        break;
      case "audio":
        parts.push("[audio: content discarded]");
        break;
      case "resource":
      case "resource_link":
        parts.push("[resource: content discarded]");
        break;
      default:
        parts.push(`[unsupported content type: ${block.type}]`);
    }
  }
  return parts.join("\n");
}
function extractAnchorContext(content) {
  if (!Array.isArray(content)) return "";
  const first = content.find((block) => block?.type === "text");
  return first?.text ?? "";
}

const SOURCE_PLUGIN = "@dsh-external/brain-dsh-plugin";
function lastUserMessageSeq(agent) {
  let last = 0;
  for (const event of agent.session.events) {
    if (event.type !== "agent/inbox/spliced") continue;
    const inserted = event.data?.inserted;
    if (Array.isArray(inserted) && inserted.some((message) => message?.source?.kind === "user")) {
      if (typeof event.seq === "number") last = event.seq;
    }
  }
  return last;
}
function setupAutoThink(ctx, manager, config, resolveProjectRoot) {
  if (!config.enabled) return () => {
  };
  const injectedSeq = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  for (const agent of ctx.agents?.list?.() ?? []) {
    injectedSeq.set(agent.id, lastUserMessageSeq(agent));
  }
  const disposeAssemble = ctx.on("system-prompt/assemble", async (assembly, context, next) => {
    const assembled = await next();
    const agent = ctx.agents?.currentInitiator?.();
    if (!agent) return assembled;
    const last = lastUserMessageSeq(agent);
    if (last <= 0) return assembled;
    const baseline = injectedSeq.get(agent.id) ?? 0;
    if (last <= baseline) return assembled;
    injectedSeq.set(agent.id, last);
    try {
      const signal = timeoutSignal(context.signal, config.timeoutMs);
      const result = await manager.call(
        resolveProjectRoot(agent),
        "brain_think",
        { session_id: agent.id },
        signal,
        { threadId: agent.id }
      );
      const text = extractAnchorContext(result.content);
      if (result.isError === true) {
        ctx.logger.warn(`brain: auto think rejected for ${agent.id}: ${extractText(result.content, "brain_think")}`);
        return assembled;
      }
      if (!text) {
        ctx.logger.warn(`brain: auto think returned no cognition context for ${agent.id}`);
        return assembled;
      }
      const warnings = result.content.slice(1).filter((block) => block.type === "text" && block.text);
      for (const warning of warnings) ctx.logger.warn(`brain: auto think diagnostic for ${agent.id}: ${warning.text}`);
      pending.set(
        agent.id,
        createUserMessage({
          content: [{ type: "text", text }],
          // 自定义来源：GUI 显示"上下文注入 @dsh-external/brain-dsh-plugin"。
          // 不声明 form（undeclared context 是文档默认，GUI 用普通文本展示正文）。
          source: { kind: "plugin", plugin: SOURCE_PLUGIN }
        })
      );
      ctx.logger.debug(`brain: auto think staged for ${agent.id} (splice seq ${last})`);
    } catch (error) {
      ctx.logger.warn(`brain: auto think failed for ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return assembled;
  });
  const disposePreStep = ctx.on("agent/pre-step", async (payload, next) => {
    const decision = await next();
    if (decision?.kind === "enter" && Array.isArray(decision.messages)) {
      const message = pending.get(payload.agent.id);
      if (message) {
        pending.delete(payload.agent.id);
        decision.messages.push(message);
      }
    }
    return decision;
  });
  return () => {
    disposeAssemble();
    disposePreStep();
  };
}
function timeoutSignal(parent, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return parent;
  const timeout = AbortSignal.timeout(ms);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

const RESPAWN_COOLDOWN_MS = 1e3;
const STORM_WINDOW_MS = 1e4;
const STORM_MAX_RESTARTS = 3;
class InstanceManager {
  config;
  instances = /* @__PURE__ */ new Map();
  disposed = false;
  constructor(config) {
    this.config = config;
  }
  /** Tools advertised by the live server for a project root (spawning on demand). */
  async tools(projectRoot) {
    return (await this.ensure(projectRoot)).tools;
  }
  /** Forward one tool call to the instance owning the project root. */
  async call(projectRoot, name, args, signal, meta) {
    const instance = await this.ensure(projectRoot);
    return instance.client.call(name, args, signal, meta);
  }
  /** Kill every managed server. Idempotent; safe to call twice. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const instance of this.instances.values()) instance.client.kill();
    this.instances.clear();
  }
  async ensure(projectRoot) {
    if (this.disposed) throw new Error("brain: plugin disposed");
    const existing = this.instances.get(projectRoot);
    if (existing?.client.running) return existing;
    if (existing?.starting) return existing.starting;
    this.guardRestart(existing);
    return this.spawnInstance(projectRoot, existing);
  }
  /** Enforce cooldown and crash-storm limits before respawning a dead instance. */
  guardRestart(existing) {
    if (!existing) return;
    const now = Date.now();
    if (now < existing.deadUntil) {
      const wait = Math.ceil((existing.deadUntil - now) / 1e3);
      throw new Error(`brain: server restarted too recently \u2014 retry in ~${wait}s`);
    }
    const recent = existing.restartTimes.filter((t) => now - t < STORM_WINDOW_MS);
    if (recent.length >= STORM_MAX_RESTARTS) {
      throw new Error(
        "brain: server crashed repeatedly; refusing to restart (check that brain dist/index.mjs exists and is built)"
      );
    }
  }
  spawnInstance(projectRoot, previous) {
    const client = new McpClient({
      command: this.config.command,
      args: [...this.config.args],
      cwd: projectRoot,
      env: {
        ...process.env,
        BRAIN_PROJECT_ROOT: projectRoot,
        BRAIN_HOME: this.config.home
      },
      timeoutMs: this.config.timeoutMs,
      onExit: () => {
        const current = this.instances.get(projectRoot);
        if (current?.client === client && !current.recordedFailure) {
          current.recordedFailure = true;
          current.deadUntil = Date.now() + RESPAWN_COOLDOWN_MS;
          current.restartTimes.push(Date.now());
          if (current.restartTimes.length > 8) current.restartTimes.shift();
        }
      }
    });
    const instance = {
      client,
      tools: /* @__PURE__ */ new Map(),
      starting: void 0,
      deadUntil: 0,
      restartTimes: previous?.restartTimes ?? [],
      recordedFailure: false
    };
    const starting = (async () => {
      try {
        const tools = await client.start();
        for (const tool of tools) instance.tools.set(tool.name, tool);
        return instance;
      } catch (error) {
        client.kill();
        if (!instance.recordedFailure) {
          instance.recordedFailure = true;
          instance.deadUntil = Date.now() + RESPAWN_COOLDOWN_MS;
          instance.restartTimes.push(Date.now());
        }
        throw error;
      } finally {
        instance.starting = void 0;
      }
    })();
    instance.starting = starting;
    this.instances.set(projectRoot, instance);
    return starting;
  }
}

const name = "@dsh-external/brain-dsh-plugin";
const inject = ["tools", "agents"];
const Config = z.object({
  server: z.object({
    command: z.string().default("node"),
    args: z.array(z.string()).default([]),
    timeoutMs: z.number().default(3e4)
  }),
  brain: z.object({
    projectRoot: z.string().default(""),
    home: z.string().default("")
  }),
  exposeThink: z.boolean().default(true),
  autoThink: z.object({
    enabled: z.boolean().default(true),
    timeoutMs: z.number().default(5e3)
  })
});
const OUTPUT_SCHEMA = {
  type: "object",
  properties: { content: { type: "array", items: {} } },
  required: ["content"],
  additionalProperties: false
};
function toHostSchema(definition) {
  return definition.inputSchema.toJSONSchema({ target: "draft-07" });
}
function visibleToolDefinitions(autoThinkEnabled, exposeThink) {
  return PUBLIC_BRAIN_TOOLS.filter(
    (definition) => definition.name !== "brain_think" || exposeThink && !autoThinkEnabled
  );
}
function resolveProjectRoot(agent, config) {
  const cwd = agent?.session?.header?.cwd;
  if (cwd) return cwd;
  if (config.brain.projectRoot) return config.brain.projectRoot;
  throw new Error(
    "brain: cannot determine project root \u2014 no session cwd available and brain.projectRoot is not configured"
  );
}
function buildCallArgs(args, agent, injectable) {
  const raw = typeof args === "object" && args !== null ? args : {};
  const out = { ...raw };
  if (injectable && agent && typeof out.session_id !== "string") {
    out.session_id = agent.id;
  }
  return out;
}
function apply(ctx, config) {
  const require = createRequire(import.meta.url);
  const defaultServerPath = require.resolve("brain");
  const serverArgs = config.server.args.length > 0 ? [...config.server.args] : [defaultServerPath];
  if (config.server.args.length === 0 && !existsSync(defaultServerPath)) {
    throw new Error(
      `brain-dsh-plugin: brain dist not found at ${defaultServerPath} \u2014 build brain first (install the matching brain package, or point server.args at the built entry explicitly)`
    );
  }
  const command = config.server.command === "node" ? process.execPath : config.server.command;
  const home = config.brain.home || join(homedir(), ".brain-data");
  const manager = new InstanceManager({
    command,
    args: serverArgs,
    timeoutMs: config.server.timeoutMs,
    home
  });
  ctx.effect(() => () => manager.dispose(), "brain: instances");
  const exposeThink = config.exposeThink && !config.autoThink.enabled;
  const registered = [];
  for (const definition of visibleToolDefinitions(config.autoThink.enabled, config.exposeThink)) {
    const injectable = definition.name === "brain_think";
    registered.push(definition.name);
    ctx.effect(
      () => ctx.tools.register({
        name: definition.name,
        description: definition.description,
        parameters: toHostSchema(definition),
        output: {
          schema: OUTPUT_SCHEMA,
          render: (_args, value) => [
            { type: "text", text: extractText(value.content, definition.name) }
          ]
        },
        async execute(args, exec) {
          const projectRoot = resolveProjectRoot(exec.agent, config);
          const callArgs = buildCallArgs(args, exec.agent, injectable);
          const result = await manager.call(projectRoot, definition.name, callArgs, exec.signal, {
            ...exec.agent?.id === void 0 ? {} : { threadId: exec.agent.id }
          });
          if (result.isError === true) throw new Error(extractText(result.content, definition.name));
          return { content: result.content };
        }
      }),
      `brain: ${definition.name}`
    );
  }
  ctx.effect(
    () => setupAutoThink(
      ctx,
      manager,
      { enabled: config.autoThink.enabled, timeoutMs: config.autoThink.timeoutMs },
      (agent) => resolveProjectRoot(agent, config)
    ),
    "brain: auto-think"
  );
  ctx.logger.info(
    `brain-dsh-plugin: ${registered.length} tools registered (${registered.join(", ")}); server ${command} ${serverArgs.join(" ")}, home=${home}, exposeThink=${exposeThink}, autoThink=${config.autoThink.enabled}`
  );
}

export { Config, InstanceManager, apply, buildCallArgs, extractAnchorContext, extractText, inject, name, resolveProjectRoot, setupAutoThink, visibleToolDefinitions };
