import {
  createProductionBrainServices,
  runBrainMcpServer,
  type BrainApplicationServices,
  type BrainToolInvocation,
} from "../../brain/src/index.ts";
import { parseSessionId, type SessionId } from "../../brain/src/brain/namespace.ts";

import { CodexInvocationBindingError, readCodexInvocationBinding } from "./invocation-binding.ts";

const servicesBySourceRoot = new Map<string, Promise<BrainApplicationServices>>();

function codexThreadId(extra: unknown): SessionId {
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
    return parseSessionId(threadId);
  } catch (error) {
    throw new CodexInvocationBindingError("Codex MCP thread id is invalid", { cause: error });
  }
}

async function servicesFor(sourceRoot: string): Promise<BrainApplicationServices> {
  const existing = servicesBySourceRoot.get(sourceRoot);
  if (existing !== undefined) return existing;
  const created = createProductionBrainServices(sourceRoot);
  servicesBySourceRoot.set(sourceRoot, created);
  try {
    return await created;
  } catch (error) {
    servicesBySourceRoot.delete(sourceRoot);
    throw error;
  }
}

async function resolveCodexInvocation(extra: unknown): Promise<BrainToolInvocation> {
  const currentSessionId = codexThreadId(extra);
  const binding = await readCodexInvocationBinding(currentSessionId);
  return {
    services: await servicesFor(binding.sourceRoot),
    currentSessionId,
  };
}

async function main(): Promise<void> {
  await runBrainMcpServer({
    resolveInvocation: resolveCodexInvocation,
    exclude: ["brain_think"],
  });
}

main().catch((error) => {
  console.error("brain Codex MCP fatal", error);
  process.exit(1);
});
