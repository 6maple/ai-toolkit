import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { parseSessionId, type SessionId } from "../../brain/src/brain/namespace.ts";

interface StoredCodexInvocationBinding {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly sourceRoot: string;
  readonly turnId?: string;
  readonly updatedAt: string;
}

export interface CodexInvocationBinding {
  readonly sessionId: SessionId;
  readonly sourceRoot: string;
  readonly turnId?: string;
}

export class CodexInvocationBindingError extends Error {
  readonly code = "codex-invocation-context-unavailable";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CodexInvocationBindingError";
  }
}

function bindingRoot(): string {
  return path.join(homedir(), ".brain-codex-plugin", "invocations");
}

function bindingPath(sessionId: SessionId): string {
  const key = createHash("sha256").update(sessionId).digest("hex");
  return path.join(bindingRoot(), `${key}.json`);
}

async function canonicalExistingDirectory(value: string): Promise<string> {
  try {
    const canonical = await fs.realpath(path.resolve(value));
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch (error) {
    throw new CodexInvocationBindingError("Codex invocation cwd is not an existing directory", {
      cause: error,
    });
  }
}

function validatedSessionId(value: string): SessionId {
  try {
    return parseSessionId(value);
  } catch (error) {
    throw new CodexInvocationBindingError("Codex invocation session id is invalid", {
      cause: error,
    });
  }
}

export async function writeCodexInvocationBinding(input: {
  readonly sessionId: string;
  readonly sourceRoot: string;
  readonly turnId?: string;
}): Promise<CodexInvocationBinding> {
  const sessionId = validatedSessionId(input.sessionId);
  const sourceRoot = await canonicalExistingDirectory(input.sourceRoot);
  const root = bindingRoot();
  const target = bindingPath(sessionId);
  const temporary = path.join(root, `.${path.basename(target)}.${randomUUID()}.tmp`);
  const stored: StoredCodexInvocationBinding = {
    schemaVersion: 1,
    sessionId,
    sourceRoot,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(root, { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(stored)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw new CodexInvocationBindingError("Could not persist Codex invocation context", {
      cause: error,
    });
  }

  return {
    sessionId,
    sourceRoot,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
  };
}

export async function readCodexInvocationBinding(
  requestedSessionId: string,
): Promise<CodexInvocationBinding> {
  const sessionId = validatedSessionId(requestedSessionId);
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(bindingPath(sessionId), "utf8")) as unknown;
  } catch (error) {
    throw new CodexInvocationBindingError("No Codex invocation context is bound to this session", {
      cause: error,
    });
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CodexInvocationBindingError("Stored Codex invocation context is invalid");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.sessionId !== sessionId ||
    typeof record.sourceRoot !== "string" ||
    (record.turnId !== undefined && typeof record.turnId !== "string") ||
    typeof record.updatedAt !== "string"
  ) {
    throw new CodexInvocationBindingError("Stored Codex invocation context is invalid");
  }

  const sourceRoot = await canonicalExistingDirectory(record.sourceRoot);
  return {
    sessionId,
    sourceRoot,
    ...(typeof record.turnId === "string" ? { turnId: record.turnId } : {}),
  };
}
