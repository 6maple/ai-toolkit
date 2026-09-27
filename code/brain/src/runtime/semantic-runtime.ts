import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

export const SEMANTIC_FASTEMBED_VERSION = "0.8.0";
export const SEMANTIC_MODEL =
  "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
export const SEMANTIC_DIMENSION = 384;
export const SEMANTIC_RUNTIME_SCHEMA_VERSION = 1;

export const SEMANTIC_FINGERPRINT = [
  `fastembed=${SEMANTIC_FASTEMBED_VERSION}`,
  `model=${SEMANTIC_MODEL}`,
  `dimension=${SEMANTIC_DIMENSION}`,
].join(";");

export class SemanticSearchUnavailableError extends Error {
  readonly code = "semantic-search-unavailable" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SemanticSearchUnavailableError";
  }
}

export interface EmbeddingPort {
  readonly fingerprint: string;
  embed(texts: readonly string[], signal?: AbortSignal): Promise<readonly Float32Array[]>;
}

interface SemanticRuntimeManifest {
  readonly schemaVersion: 1;
  readonly fastembedVersion: string;
  readonly model: string;
  readonly dimension: number;
  readonly fingerprint: string;
}

interface PendingEmbedding {
  readonly resolve: (vectors: readonly Float32Array[]) => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  abort?: () => void;
}

function runtimeRoot(brainRoot: string): string {
  return path.join(brainRoot, ".runtime", "semantic-search");
}

export function semanticRuntimePaths(brainRoot: string) {
  const root = runtimeRoot(brainRoot);
  return {
    root,
    manifest: path.join(root, "manifest.json"),
    worker: path.join(root, "worker.py"),
    models: path.join(root, "models"),
    database: path.join(root, "index.sqlite3"),
    pendingDirectory: path.join(root, "pending"),
    python:
      process.platform === "win32"
        ? path.join(root, "venv", "Scripts", "python.exe")
        : path.join(root, "venv", "bin", "python"),
  } as const;
}

function readManifest(brainRoot: string): SemanticRuntimeManifest {
  const paths = semanticRuntimePaths(brainRoot);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(paths.manifest, "utf8")) as unknown;
  } catch (error) {
    throw new SemanticSearchUnavailableError(
      "semantic runtime is not installed; run brain-cli semantic-search install",
      { cause: error },
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SemanticSearchUnavailableError("semantic runtime manifest is invalid");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== SEMANTIC_RUNTIME_SCHEMA_VERSION ||
    record.fastembedVersion !== SEMANTIC_FASTEMBED_VERSION ||
    record.model !== SEMANTIC_MODEL ||
    record.dimension !== SEMANTIC_DIMENSION ||
    record.fingerprint !== SEMANTIC_FINGERPRINT
  ) {
    throw new SemanticSearchUnavailableError(
      "semantic runtime manifest does not match this Brain build; reinstall semantic search",
    );
  }
  if (!existsSync(paths.python) || !existsSync(paths.worker)) {
    throw new SemanticSearchUnavailableError(
      "semantic runtime is incomplete; reinstall semantic search",
    );
  }
  return record as unknown as SemanticRuntimeManifest;
}

export function assertSemanticRuntimeReady(brainRoot: string): void {
  readManifest(brainRoot);
}

function parseWorkerVectors(value: unknown): readonly Float32Array[] {
  if (!Array.isArray(value)) {
    throw new SemanticSearchUnavailableError("embedding worker returned invalid vectors");
  }
  return value.map((candidate) => {
    if (
      !Array.isArray(candidate) ||
      candidate.length !== SEMANTIC_DIMENSION ||
      candidate.some((item) => typeof item !== "number" || !Number.isFinite(item))
    ) {
      throw new SemanticSearchUnavailableError("embedding worker returned invalid vector shape");
    }
    return Float32Array.from(candidate);
  });
}

const SEMANTIC_DEBUG = process.env.BRAIN_SEMANTIC_DEBUG === "1";
function semanticDebug(event: string, detail: Record<string, unknown> = {}): void {
  if (!SEMANTIC_DEBUG) return;
  console.error("brain semantic debug " + JSON.stringify({ event, pid: process.pid, ...detail }));
}

export class PythonEmbeddingRuntime implements EmbeddingPort {
  readonly fingerprint = SEMANTIC_FINGERPRINT;

  private child: ChildProcessWithoutNullStreams | undefined;
  private starting: Promise<void> | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, PendingEmbedding>();

  constructor(private readonly brainRoot: string) {}

  async embed(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly Float32Array[]> {
    if (texts.length === 0) return [];
    const startedAt = Date.now();
    semanticDebug("embedding.embed.start", { count: texts.length });
    signal?.throwIfAborted();
    await this.ensureStarted();
    semanticDebug("embedding.embed.worker-ready", { elapsedMs: Date.now() - startedAt });
    const child = this.child;
    if (child === undefined || child.exitCode !== null) {
      throw new SemanticSearchUnavailableError("embedding worker is not running");
    }
    const id = this.nextId++;
    semanticDebug("embedding.request.write", { id, count: texts.length });
    return new Promise<readonly Float32Array[]>((resolve, reject) => {
      const pending: PendingEmbedding = {
        resolve: (vectors) => {
          semanticDebug("embedding.request.resolve", {
            id,
            count: vectors.length,
            elapsedMs: Date.now() - startedAt,
          });
          resolve(vectors);
        },
        reject: (error) => {
          semanticDebug("embedding.request.reject", {
            id,
            elapsedMs: Date.now() - startedAt,
            error: error.message,
          });
          reject(error);
        },
        ...(signal === undefined ? {} : { signal }),
      };
      if (signal !== undefined) {
        const abort = () => {
          this.pending.delete(id);
          reject(new DOMException("Aborted", "AbortError"));
        };
        pending.abort = abort;
        signal.addEventListener("abort", abort, { once: true });
      }
      this.pending.set(id, pending);
      child.stdin.write(`${JSON.stringify({ id, texts })}\n`, (error) => {
        if (error === null || error === undefined) return;
        this.rejectPending(id, new SemanticSearchUnavailableError("embedding worker write failed", {
          cause: error,
        }));
      });
    });
  }

  dispose(): void {
    this.failAll(new SemanticSearchUnavailableError("embedding worker stopped"));
    this.child?.kill();
    this.child = undefined;
    this.starting = undefined;
  }

  private async ensureStarted(): Promise<void> {
    if (this.child !== undefined && this.child.exitCode === null) {
      semanticDebug("embedding.worker.reuse", { childPid: this.child.pid });
      return;
    }
    if (this.starting !== undefined) {
      semanticDebug("embedding.worker.await-existing-start");
      return this.starting;
    }
    semanticDebug("embedding.worker.start-requested");
    this.starting = this.startWorker();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private startWorker(): Promise<void> {
    readManifest(this.brainRoot);
    const paths = semanticRuntimePaths(this.brainRoot);
    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(paths.python, [paths.worker, "--serve"], {
        cwd: paths.root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
      this.child = child;
      semanticDebug("embedding.worker.spawned", { childPid: child.pid });
      let settled = false;
      const stderr: Buffer[] = [];
      child.stderr.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
        if (stderr.reduce((sum, item) => sum + item.length, 0) > 32_768) stderr.shift();
      });
      const lines = readline.createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        let message: unknown;
        try {
          message = JSON.parse(line) as unknown;
        } catch {
          this.failWorker(new SemanticSearchUnavailableError("embedding worker emitted invalid JSON"));
          return;
        }
        if (typeof message !== "object" || message === null || Array.isArray(message)) {
          this.failWorker(new SemanticSearchUnavailableError("embedding worker emitted invalid message"));
          return;
        }
        const record = message as Record<string, unknown>;
        if (record.type === "ready") {
          if (record.dimension !== SEMANTIC_DIMENSION || record.fingerprint !== SEMANTIC_FINGERPRINT) {
            const error = new SemanticSearchUnavailableError(
              "embedding worker identity does not match this Brain build",
            );
            if (!settled) {
              settled = true;
              reject(error);
            }
            this.failWorker(error);
            return;
          }
          if (!settled) {
            settled = true;
            semanticDebug("embedding.worker.ready", {
              childPid: child.pid,
              elapsedMs: Date.now() - startedAt,
            });
            resolve();
          }
          return;
        }
        const id = record.id;
        if (typeof id !== "number" || !Number.isInteger(id)) return;
        if (typeof record.error === "string") {
          this.rejectPending(id, new SemanticSearchUnavailableError(record.error));
          return;
        }
        try {
          this.resolvePending(id, parseWorkerVectors(record.vectors));
        } catch (error) {
          this.rejectPending(
            id,
            error instanceof Error
              ? error
              : new SemanticSearchUnavailableError("embedding worker response failed"),
          );
        }
      });
      child.once("error", (error) => {
        const wrapped = new SemanticSearchUnavailableError("embedding worker could not start", {
          cause: error,
        });
        if (!settled) {
          settled = true;
          reject(wrapped);
        }
        this.failWorker(wrapped);
      });
      child.once("exit", (code, signal) => {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        const wrapped = new SemanticSearchUnavailableError(
          `embedding worker exited (code=${code ?? "none"}, signal=${signal ?? "none"})${detail ? `: ${detail}` : ""}`,
        );
        if (!settled) {
          settled = true;
          reject(wrapped);
        }
        this.failWorker(wrapped);
      });
    });
  }

  private resolvePending(id: number, vectors: readonly Float32Array[]): void {
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    this.pending.delete(id);
    if (pending.signal !== undefined && pending.abort !== undefined) {
      pending.signal.removeEventListener("abort", pending.abort);
    }
    pending.resolve(vectors);
  }

  private rejectPending(id: number, error: Error): void {
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    this.pending.delete(id);
    if (pending.signal !== undefined && pending.abort !== undefined) {
      pending.signal.removeEventListener("abort", pending.abort);
    }
    pending.reject(error);
  }

  private failAll(error: Error): void {
    for (const id of [...this.pending.keys()]) this.rejectPending(id, error);
  }

  private failWorker(error: Error): void {
    this.failAll(error);
    const child = this.child;
    this.child = undefined;
    if (child !== undefined && child.exitCode === null) child.kill();
  }
}
