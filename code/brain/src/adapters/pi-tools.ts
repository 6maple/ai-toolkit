import { promises as fs } from "node:fs";
import path from "node:path";

import {
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  type FindOperations,
  type GrepToolDetails,
  type LsOperations,
  type LsToolDetails,
  type ReadOperations,
  type ReadToolDetails,
  type TruncationResult,
} from "@earendil-works/pi-coding-agent";

import type { LogicalDirectory } from "../brain/namespace.ts";
import { projectPhysicalResource, scopeRoot, type StorageBinding } from "../persistence/storage.ts";

/**
 * Thin execution adapter around Pi's published Agent Tool definitions.
 *
 * Pi owns generic Tool behavior (cancellation, subprocess lifecycle, read/grep
 * truncation, familiar ls/find control flow). brain supplies only virtual
 * cognition operations or outer cognition mapping.
 */

interface PiToolLike {
  execute(
    toolCallId: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: unknown,
  ): Promise<{
    content: Array<{ type: string; text?: string }>;
    details?: unknown;
  }>;
}

function asPiTool(value: unknown): PiToolLike {
  return value as PiToolLike;
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(
      (block): block is { type: string; text: string } =>
        block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

export type PiExecutionErrorCode = "invalid-regex" | "aborted" | "execution-failed";

export class PiExecutionError extends Error {
  readonly code: PiExecutionErrorCode;
  constructor(code: PiExecutionErrorCode, options?: { cause?: unknown }) {
    super(`Pi Tool execution failed: ${code}`, options);
    this.name = "PiExecutionError";
    this.code = code;
  }
}

function isInvalidRegexMessage(message: string): boolean {
  return /regex parse error|error parsing regex|invalid regex|regex error/i.test(message);
}

function mapPiError(error: unknown, signal?: AbortSignal): never {
  if (signal?.aborted) throw new PiExecutionError("aborted", { cause: error });
  const message = error instanceof Error ? error.message : String(error);
  if (/operation aborted|\baborted\b/i.test(message)) {
    throw new PiExecutionError("aborted", { cause: error });
  }
  if (isInvalidRegexMessage(message)) {
    throw new PiExecutionError("invalid-regex", { cause: error });
  }
  throw new PiExecutionError("execution-failed", { cause: error });
}

export interface PiLsEntry {
  readonly key: string;
  readonly name: string;
  readonly directory: boolean;
}

export interface PiOrderedKeysResult {
  readonly keys: readonly string[];
  readonly truncated: boolean;
}

export interface PiFindEntry {
  readonly key: string;
  readonly publicPath: string;
}

export interface PiReadResult {
  readonly outputLines: number;
  readonly truncated: boolean;
  readonly firstLineExceedsLimit: boolean;
}

export interface PiGrepHit {
  readonly relativePath: string;
  readonly lineNumber: number;
}

export interface PiGrepResult {
  readonly hits: readonly PiGrepHit[];
  readonly truncated: boolean;
}

export interface PiDiscoveryToolPort {
  ls(entries: readonly PiLsEntry[], signal?: AbortSignal): Promise<PiOrderedKeysResult>;
  find(
    entries: readonly PiFindEntry[],
    pattern: string,
    matches: (pattern: string, publicPath: string) => boolean,
    signal?: AbortSignal,
  ): Promise<PiOrderedKeysResult>;
  read(text: string, offset: number, limit: number, signal?: AbortSignal): Promise<PiReadResult>;
  grepRoot(
    root: LogicalDirectory,
    request: {
      readonly pattern: string;
      readonly glob?: string;
      readonly ignoreCase: boolean;
      readonly literal: boolean;
      readonly limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<PiGrepResult>;
}

function detailsTruncated(details: { truncation?: TruncationResult } | undefined): boolean {
  return details?.truncation?.truncated === true;
}

function directoryRelativePrefix(root: LogicalDirectory): string {
  switch (root.area) {
    case "memories-root":
      return "memories";
    case "role-root":
      return `memories/${root.role}`;
    case "nested":
      return `memories/${root.role}/${root.segments.join("/")}`;
  }
}

function grepGlob(userGlob: string | undefined): string {
  return userGlob === undefined || userGlob === "" ? "**/*.md" : userGlob;
}

async function existingDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function normalizeRelative(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export class PiDiscoveryTools implements PiDiscoveryToolPort {
  constructor(private readonly binding: StorageBinding) {}

  async ls(entries: readonly PiLsEntry[], signal?: AbortSignal): Promise<PiOrderedKeysResult> {
    const virtualRoot = path.resolve(process.cwd(), ".brain-pi-ls");
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    const operations: LsOperations = {
      exists: () => true,
      stat: (target) => {
        if (path.resolve(target) === virtualRoot) return { isDirectory: () => true };
        const entry = byName.get(path.basename(target));
        if (entry === undefined) throw new Error("virtual ls entry not found");
        return { isDirectory: () => entry.directory };
      },
      readdir: () => entries.map((entry) => entry.name),
    };
    const tool = asPiTool(createLsToolDefinition(virtualRoot, { operations }));
    try {
      const result = await tool.execute(
        "brain:ls",
        { path: ".", limit: Math.max(1, entries.length + 1) },
        signal,
      );
      const details = result.details as LsToolDetails | undefined;
      const keys: string[] = [];
      for (const rawLine of extractText(result.content).split("\n")) {
        const name = rawLine.endsWith("/") ? rawLine.slice(0, -1) : rawLine;
        const entry = byName.get(name);
        if (entry !== undefined) keys.push(entry.key);
      }
      return {
        keys,
        truncated: details?.entryLimitReached !== undefined || detailsTruncated(details),
      };
    } catch (error) {
      return mapPiError(error, signal);
    }
  }

  async find(
    entries: readonly PiFindEntry[],
    pattern: string,
    matches: (pattern: string, publicPath: string) => boolean,
    signal?: AbortSignal,
  ): Promise<PiOrderedKeysResult> {
    const virtualRoot = path.resolve(process.cwd(), ".brain-pi-find");
    const tokenToKey = new Map<string, string>();
    const keyToToken = new Map<string, string>();
    entries.forEach((entry, index) => {
      const token = `m${index.toString(36).padStart(6, "0")}`;
      tokenToKey.set(token, entry.key);
      keyToToken.set(entry.key, token);
    });
    const operations: FindOperations = {
      exists: () => true,
      glob: (receivedPattern, _cwd, options) =>
        entries
          .filter((entry) => matches(receivedPattern, entry.publicPath))
          .slice(0, options.limit)
          .map((entry) => keyToToken.get(entry.key)!),
    };
    const tool = asPiTool(createFindToolDefinition(virtualRoot, { operations }));
    try {
      const result = await tool.execute(
        "brain:glob",
        { pattern, path: ".", limit: Math.max(1, entries.length + 1) },
        signal,
      );
      const details = result.details as
        | { truncation?: TruncationResult; resultLimitReached?: number }
        | undefined;
      const keys = extractText(result.content)
        .split("\n")
        .map((line) => tokenToKey.get(path.posix.basename(normalizeRelative(line.trim()))))
        .filter((key): key is string => key !== undefined);
      return {
        keys,
        truncated: details?.resultLimitReached !== undefined || detailsTruncated(details),
      };
    } catch (error) {
      return mapPiError(error, signal);
    }
  }

  async read(
    text: string,
    offset: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<PiReadResult> {
    const virtualRoot = path.resolve(process.cwd(), ".brain-pi-read");
    const operations: ReadOperations = {
      readFile: async () => Buffer.from(text, "utf8"),
      access: async () => {},
      detectImageMimeType: async () => null,
    };
    const tool = asPiTool(
      createReadToolDefinition(virtualRoot, { operations, autoResizeImages: false }),
    );
    try {
      const result = await tool.execute("brain:cat", { path: "memory.md", offset, limit }, signal);
      const details = result.details as ReadToolDetails | undefined;
      const truncation = details?.truncation;
      if (truncation !== undefined) {
        return {
          outputLines: truncation.outputLines,
          truncated: truncation.truncated,
          firstLineExceedsLimit: truncation.firstLineExceedsLimit,
        };
      }
      const lines = text === "" ? [] : text.split("\n");
      if (text.endsWith("\n")) lines.pop();
      const start = offset - 1;
      return {
        outputLines: Math.max(0, Math.min(limit, lines.length - start)),
        truncated: false,
        firstLineExceedsLimit: false,
      };
    } catch (error) {
      return mapPiError(error, signal);
    }
  }

  async grepRoot(
    root: LogicalDirectory,
    request: {
      readonly pattern: string;
      readonly glob?: string;
      readonly ignoreCase: boolean;
      readonly literal: boolean;
      readonly limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<PiGrepResult> {
    const physicalScopeRoot = scopeRoot(this.binding, root.scope);
    const projectedRoot = projectPhysicalResource(this.binding, {
      kind: "public",
      path: root,
    }).absolutePath;
    const rootExists = await existingDirectory(projectedRoot);
    const searchPath = rootExists ? projectedRoot : physicalScopeRoot;
    const tool = asPiTool(createGrepToolDefinition(physicalScopeRoot));
    try {
      const result = await tool.execute(
        "brain:grep",
        {
          pattern: request.pattern,
          path: searchPath,
          glob: rootExists ? grepGlob(request.glob) : "__brain_dsh_empty_logical_root__",
          ignoreCase: request.ignoreCase,
          literal: request.literal,
          context: 0,
          ...(request.limit === undefined ? {} : { limit: request.limit }),
        },
        signal,
      );
      const details = result.details as GrepToolDetails | undefined;
      const hits: PiGrepHit[] = [];
      for (const line of extractText(result.content).split("\n")) {
        const match = /^(.+?):(\d+):\s?(.*)$/.exec(line);
        if (match === null) continue;
        const relativeToSearchRoot = normalizeRelative(match[1]!);
        const base = directoryRelativePrefix(root);
        hits.push({
          relativePath: `${base}/${relativeToSearchRoot}`.replaceAll("//", "/"),
          lineNumber: Number(match[2]),
        });
      }
      return {
        hits,
        truncated: details?.matchLimitReached !== undefined || detailsTruncated(details),
      };
    } catch (error) {
      return mapPiError(error, signal);
    }
  }
}
