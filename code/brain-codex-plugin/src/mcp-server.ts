import {
  createProductionBrainServices,
  runBrainMcpServer,
  type BrainApplicationServices,
  type BrainToolInvocation,
} from "../../brain/src/index.ts";

import {
  CodexInvocationBindingError,
  parseCodexSessionId,
  readCodexInvocationBinding,
  type CodexSessionId,
} from "./invocation-binding.ts";

const servicesBySourceRoot = new Map<string, Promise<BrainApplicationServices>>();

const SEMANTIC_DEBUG = process.env.BRAIN_SEMANTIC_DEBUG === "1";
function semanticDebug(event: string, detail: Record<string, unknown> = {}): void {
  if (!SEMANTIC_DEBUG) return;
  console.error("brain semantic debug " + JSON.stringify({ event, pid: process.pid, ...detail }));
}

function codexThreadId(extra: unknown): CodexSessionId {
  if (typeof extra !== "object" || extra === null || !("_meta" in extra)) {
    throw new CodexInvocationBindingError("Codex MCP invocation metadata is missing");
  }
  const meta = (extra as { _meta?: unknown })._meta;
  if (typeof meta !== "object" || meta === null) {
    throw new CodexInvocationBindingError("Codex MCP invocation metadata is missing");
  }
  const threadId = (meta as { threadId?: unknown }).threadId;
  if (typeof threadId !== "string") {
    throw new CodexInvocationBindingError("Codex MCP thread id is missing");
  }
  try {
    return parseCodexSessionId(threadId);
  } catch (error) {
    throw new CodexInvocationBindingError("Codex MCP thread id is invalid", { cause: error });
  }
}

async function servicesFor(sourceRoot: string): Promise<BrainApplicationServices> {
  const existing = servicesBySourceRoot.get(sourceRoot);
  if (existing !== undefined) {
    semanticDebug("codex.services.cache-hit", { sourceRoot });
    return existing;
  }
  const startedAt = Date.now();
  semanticDebug("codex.services.create.start", { sourceRoot });
  const created = createProductionBrainServices(sourceRoot);
  servicesBySourceRoot.set(sourceRoot, created);
  try {
    const services = await created;
    semanticDebug("codex.services.create.end", {
      sourceRoot,
      elapsedMs: Date.now() - startedAt,
      semantic: services.semantic !== undefined,
    });
    return services;
  } catch (error) {
    servicesBySourceRoot.delete(sourceRoot);
    semanticDebug("codex.services.create.error", {
      sourceRoot,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function resolveCodexInvocation(extra: unknown): Promise<BrainToolInvocation> {
  const threadId = codexThreadId(extra);
  const binding = await readCodexInvocationBinding(threadId);
  return {
    services: await servicesFor(binding.sourceRoot),
  };
}

async function main(): Promise<void> {
  await runBrainMcpServer({
    resolveInvocation: resolveCodexInvocation,
    exclude: ["brain_think"],
    restoreMode: "host",
  });
}

main().catch((error) => {
  console.error("brain Codex MCP fatal", error);
  process.exit(1);
});
