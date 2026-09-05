import { promises as fs } from "node:fs";

import { createProductionBrainServices } from "../../brain/src/index.ts";
import { parsePublicPath } from "../../brain/src/brain/namespace.ts";
import { resolveExistingResource } from "../../brain/src/persistence/storage.ts";

import { readCodexInvocationBinding } from "./invocation-binding.ts";

interface PermissionRequestInput {
  readonly hook_event_name: "PermissionRequest";
  readonly session_id: string;
  readonly turn_id: string;
  readonly permission_mode: string;
  readonly tool_name: "mcp__brain__brain_edit";
  readonly tool_input: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInput(value: unknown): PermissionRequestInput | undefined {
  if (!isRecord(value)) return undefined;
  if (value.hook_event_name !== "PermissionRequest") return undefined;
  if (value.tool_name !== "mcp__brain__brain_edit") return undefined;
  if (typeof value.session_id !== "string" || value.session_id.length === 0) return undefined;
  if (typeof value.turn_id !== "string" || value.turn_id.length === 0) return undefined;
  if (typeof value.permission_mode !== "string") return undefined;
  if (!isRecord(value.tool_input)) return undefined;
  return {
    hook_event_name: value.hook_event_name,
    session_id: value.session_id,
    turn_id: value.turn_id,
    permission_mode: value.permission_mode,
    tool_name: value.tool_name,
    tool_input: value.tool_input,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function isSafeInitialization(input: PermissionRequestInput): Promise<boolean> {
  if (input.permission_mode !== "default" && input.permission_mode !== "acceptEdits") {
    return false;
  }

  const args = input.tool_input;
  if (typeof args.path !== "string" || typeof args.content !== "string") return false;
  if (args.edits !== undefined) return false;

  const path = parsePublicPath(args.path);
  if (path.kind !== "core") return false;
  if (path.scope.kind === "session" && path.scope.sessionId !== input.session_id) return false;

  const invocation = await readCodexInvocationBinding(input.session_id);
  if (invocation.turnId !== input.turn_id) return false;
  const services = await createProductionBrainServices(invocation.sourceRoot);
  const resource = await resolveExistingResource(services.binding, { kind: "public", path });
  if (resource.aliasFollowed) return false;

  const current = await fs.readFile(resource.canonicalPath, "utf8");
  return current === args.content || current.trim().length === 0;
}

async function main(): Promise<void> {
  let input: PermissionRequestInput | undefined;
  try {
    input = parseInput(JSON.parse(await readStdin()) as unknown);
  } catch {
    return;
  }
  if (input === undefined) return;

  try {
    if (!(await isSafeInitialization(input))) return;
  } catch {
    return;
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    })}\n`,
  );
}

void main();
