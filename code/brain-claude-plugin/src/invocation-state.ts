import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

interface StoredInvocationState {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly turnId?: string;
  readonly sourceRoot: string;
  readonly transcriptPath: string;
  readonly historyCheckpointReady: boolean;
}

export interface ClaudeInvocationState {
  readonly sessionId: string;
  readonly turnId?: string;
  readonly sourceRoot: string;
  readonly transcriptPath: string;
  readonly historyCheckpointReady: boolean;
}

function stateRoot(): string {
  const root = process.env.CLAUDE_PLUGIN_DATA;
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    throw new Error("CLAUDE_PLUGIN_DATA must be an absolute directory");
  }
  return path.join(root, "invocations");
}

function statePath(sessionId: string): string {
  if (sessionId.length === 0) throw new Error("Claude session id is missing");
  return path.join(stateRoot(), `${createHash("sha256").update(sessionId).digest("hex")}.json`);
}

async function existingDirectory(value: string): Promise<string> {
  const resolved = await fs.realpath(value);
  if (!(await fs.stat(resolved)).isDirectory()) throw new Error("source root is not a directory");
  return resolved;
}

export async function writeClaudeInvocationState(input: ClaudeInvocationState): Promise<void> {
  const sourceRoot = await existingDirectory(input.sourceRoot);
  const target = statePath(input.sessionId);
  const temporary = path.join(stateRoot(), `.${path.basename(target)}.${randomUUID()}.tmp`);
  const stored: StoredInvocationState = {
    schemaVersion: 1,
    sessionId: input.sessionId,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
    sourceRoot,
    transcriptPath: input.transcriptPath,
    historyCheckpointReady: input.historyCheckpointReady,
  };
  await fs.mkdir(stateRoot(), { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(stored)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readClaudeInvocationState(sessionId: string): Promise<ClaudeInvocationState> {
  const value: unknown = JSON.parse(await fs.readFile(statePath(sessionId), "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Claude invocation state is invalid");
  }
  const state = value as Record<string, unknown>;
  if (
    state.schemaVersion !== 1 ||
    state.sessionId !== sessionId ||
    (state.turnId !== undefined && typeof state.turnId !== "string") ||
    typeof state.sourceRoot !== "string" ||
    typeof state.transcriptPath !== "string" ||
    typeof state.historyCheckpointReady !== "boolean"
  ) {
    throw new Error("Claude invocation state is invalid");
  }
  return {
    sessionId,
    ...(typeof state.turnId === "string" ? { turnId: state.turnId } : {}),
    sourceRoot: await existingDirectory(state.sourceRoot),
    transcriptPath: state.transcriptPath,
    historyCheckpointReady: state.historyCheckpointReady,
  };
}

export async function removeClaudeInvocationState(sessionId: string): Promise<void> {
  await fs.rm(statePath(sessionId), { force: true });
}
