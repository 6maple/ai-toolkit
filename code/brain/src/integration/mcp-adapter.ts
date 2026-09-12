import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { AnchorRestore } from "../application/anchor-restore.ts";
import type {
  CognitionMaintenance,
  MaintenanceResult,
} from "../application/cognition-maintenance.ts";
import type { ReadDiscovery } from "../application/read-discovery.ts";
import {
  formatPublicPath,
  parsePublicPath,
  parseResourceLocation,
  parseSessionId,
  type SessionId,
} from "../brain/namespace.ts";
import { projectAbsoluteLocation, type StorageBinding } from "../persistence/storage.ts";
import { PUBLIC_BRAIN_TOOLS, type BrainToolName } from "./public-tools.ts";

export interface BrainApplicationServices {
  readonly binding: StorageBinding;
  readonly anchor: Pick<AnchorRestore, "runAnchor">;
  readonly reads: Pick<ReadDiscovery, "ls" | "glob" | "grep" | "cat">;
  readonly maintenance: Pick<
    CognitionMaintenance,
    "write" | "edit" | "remove" | "move" | "feedback"
  >;
}

export interface BrainToolInvocation {
  readonly services: BrainApplicationServices;
  readonly currentSessionId?: SessionId;
}

export type BrainToolInvocationResolver = (
  extra: unknown,
) => BrainToolInvocation | Promise<BrainToolInvocation>;

export interface HostInvocationAdapter {
  currentSessionId(extra: unknown): SessionId | undefined;
}

/** Structural MCP host boundary that avoids coupling consumers to Brain's SDK instance. */
export type BrainToolRegistrar = Pick<McpServer, "registerTool">;

/** Compatibility adapter for hosts that forward a trusted thread id in MCP request metadata. */
export const THREAD_META_HOST_INVOCATION: HostInvocationAdapter = {
  currentSessionId(extra: unknown): SessionId | undefined {
    if (typeof extra !== "object" || extra === null || !("_meta" in extra)) return undefined;
    const meta = (extra as { _meta?: unknown })._meta;
    if (typeof meta !== "object" || meta === null) return undefined;
    const raw = (meta as { threadId?: unknown }).threadId;
    if (typeof raw !== "string") return undefined;
    try {
      return parseSessionId(raw);
    } catch {
      return undefined;
    }
  },
};

export type BrainToolResult = CallToolResult;

export interface BrainToolRegistrationOptions {
  /** Tools owned by a host lifecycle integration and therefore hidden from the model. */
  readonly exclude?: readonly BrainToolName[];
  /** Resolve project services and trusted session identity together for each tool invocation. */
  readonly resolveInvocation?: BrainToolInvocationResolver;
}

function textResult(text: string, warnings: readonly string[] = []): BrainToolResult {
  return {
    content: [
      { type: "text", text },
      ...warnings.map((warning) => ({ type: "text" as const, text: `warning: ${warning}` })),
    ],
    structuredContent: { text },
  };
}

function typedCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

const OBJECT_PATH_GUIDANCE: Partial<Record<BrainToolName, string>> = {
  brain_ls:
    "brain_ls accepts only a memories directory, for example @project/memories/ or @project/memories/knowledge/. Do not pass @project, core.md, or a concrete .md document.",
  brain_glob:
    "When path is provided, brain_glob accepts only a memories directory such as @project/memories/. Omit path to search all applicable memories; core.md is already resident and is not discoverable.",
  brain_grep:
    "When path is provided, brain_grep accepts only a memories directory such as @project/memories/. Omit path to search all applicable memories; core.md is already resident and is not searchable here.",
  brain_cat:
    "brain_cat accepts only a concrete archival .md path under <scope-root>/memories/{decision,knowledge,intention,skill}/. It cannot read core.md because applicable core content is already fully present in <brain_think_context>.",
  brain_write:
    "brain_write accepts only a concrete archival .md path under a memories role. It cannot write core.md; maintain an existing core with brain_edit.",
  brain_edit:
    "brain_edit accepts one existing core.md or one concrete archival .md document, not a bare scope or memories directory.",
  brain_rm:
    "brain_rm accepts only a concrete archival .md path under a memories role; it cannot remove core.md or a directory.",
  brain_mv:
    "brain_mv requires concrete archival .md paths under memories roles for both src and dst; core.md and directories are invalid.",
  brain_feedback:
    "brain_feedback accepts only a concrete archival .md path under a memories role; core.md and directories are invalid.",
};

const PATH_ERROR_CODES = new Set([
  "invalid-root",
  "invalid-separator",
  "invalid-session-id",
  "invalid-role",
  "traversal-segment",
  "invalid-segment",
  "invalid-object-shape",
  "wrong-object-kind",
  "not-found",
  "target-not-found",
  "write-requires-archival",
  "rm-requires-archival",
  "feedback-requires-archival",
  "mv-requires-archival-source",
  "mv-requires-archival-destination",
]);

const ACTION_GUIDANCE: Readonly<Record<string, string>> = {
  "invalid-glob": "Fix the glob pattern and try again.",
  "invalid-regex":
    "pattern is parsed as a regular expression by default; fix the expression or set literal=true to search ordinary text.",
  "invalid-offset": "offset must be a positive 1-based document line.",
  "invalid-limit": "limit must be a positive integer.",
  "invalid-context": "context must be a non-negative integer.",
  "session-id-conflict":
    "Omit session_id to use the trusted host session, or provide that exact same current session identifier.",
  "core-capacity-exceeded":
    "Curate or compress the complete core document before retrying; archive durable cognition first when it no longer needs to remain resident.",
  "edit-mode": "Provide exactly one of edits or content.",
  "empty-edits": "Provide at least one exact replacement.",
  "empty-old-text": "Each edits[].oldText must be non-empty.",
  "old-text-not-found":
    "Read the current document and use text that exists exactly in that document.",
  "old-text-not-unique": "Include more surrounding text so oldText identifies one unique region.",
  "overlapping-edits":
    "Merge overlapping changes into one replacement or make the edited regions disjoint.",
  "same-source-destination": "Choose a dst path different from src.",
  "question-challenge-required":
    "feedback=question requires a non-empty complete current unresolved challenge.",
  "empty-challenge":
    "feedback=question requires a non-empty complete current unresolved challenge.",
  "no-current-challenge":
    "feedback=resolve is valid only for a cognition that currently has an unresolved challenge.",
  "missing-frontmatter":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
  "unterminated-frontmatter":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
  "invalid-frontmatter-yaml":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
  "frontmatter-not-map":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
  "missing-summary":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
  "invalid-summary":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
  "missing-importance":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
  "invalid-importance":
    "Supply a complete archival Markdown document with valid summary and importance frontmatter.",
};

function errorResult(toolName: BrainToolName, error: unknown): BrainToolResult {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { content: [{ type: "text", text: "error: aborted" }], isError: true };
  }
  const code = typedCode(error);
  if (code !== undefined) {
    const guidance = PATH_ERROR_CODES.has(code)
      ? OBJECT_PATH_GUIDANCE[toolName]
      : ACTION_GUIDANCE[code];
    return {
      content: [
        {
          type: "text",
          text: guidance === undefined ? `error: ${code}` : `error: ${code}\n${guidance}`,
        },
      ],
      isError: true,
    };
  }
  console.error("brain infrastructure failure", error);
  return {
    content: [
      {
        type: "text",
        text: "error: brain operation failed due to an internal infrastructure problem",
      },
    ],
    isError: true,
  };
}

function optionalSession(explicit: unknown, host: SessionId | undefined): SessionId | undefined {
  const parsed = typeof explicit === "string" ? parseSessionId(explicit) : undefined;
  if (host !== undefined && parsed !== undefined && host !== parsed) {
    const error = new Error("explicit session conflicts with trusted host session") as Error & {
      code: string;
    };
    error.code = "session-id-conflict";
    throw error;
  }
  return host ?? parsed;
}

function invocationSignal(extra: unknown): AbortSignal | undefined {
  if (typeof extra !== "object" || extra === null || !("signal" in extra)) return undefined;
  const signal = (extra as { signal?: unknown }).signal;
  return signal instanceof AbortSignal ? signal : undefined;
}

function discoveryContext(
  host: SessionId | undefined,
  signal?: AbortSignal,
): { currentSessionId?: SessionId; signal?: AbortSignal } {
  return {
    ...(host === undefined ? {} : { currentSessionId: host }),
    ...(signal === undefined ? {} : { signal }),
  };
}

function renderMaintenanceResult(result: MaintenanceResult): string {
  switch (result.action) {
    case "created":
      return `created ${formatPublicPath(result.path)}`;
    case "overwrote":
      return `overwrote ${formatPublicPath(result.path)}`;
    case "edited":
      return result.changed
        ? `edited ${formatPublicPath(result.path)}`
        : `no changes: ${formatPublicPath(result.path)}`;
    case "moved":
      return `moved ${formatPublicPath(result.from)} -> ${formatPublicPath(result.to)}${result.replacedExistingDestination ? "; replaced existing destination" : ""}`;
    case "removed":
      return `removed ${formatPublicPath(result.path)}`;
    case "adopted":
      return `recorded validated use for ${formatPublicPath(result.path)}`;
    case "questioned":
      return result.changed
        ? `questioned ${formatPublicPath(result.path)}`
        : `current challenge unchanged for ${formatPublicPath(result.path)}`;
    case "resolved":
      return `resolved ${formatPublicPath(result.path)}`;
  }
}

function toolArgsRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    const error = new Error("invalid tool arguments") as Error & { code: string };
    error.code = "invalid-arguments";
    throw error;
  }
  return value as Record<string, unknown>;
}

function editPath(raw: string) {
  const path = parsePublicPath(raw);
  if (path.kind === "directory") {
    const error = new Error("wrong object kind") as Error & { code: string };
    error.code = "wrong-object-kind";
    throw error;
  }
  return path;
}

function handlerFor(
  name: BrainToolName,
  services: BrainApplicationServices | undefined,
  hostInvocation: HostInvocationAdapter,
  resolveInvocation?: BrainToolInvocationResolver,
): (args: unknown, extra?: unknown) => Promise<BrainToolResult> {
  return async (rawArgs: unknown, extra) => {
    try {
      const args = toolArgsRecord(rawArgs);
      const invocation =
        resolveInvocation === undefined
          ? services === undefined
            ? undefined
            : {
                services,
                currentSessionId: hostInvocation.currentSessionId(extra),
              }
          : await resolveInvocation(extra);
      if (invocation === undefined) {
        const error = new Error("brain invocation context is unavailable") as Error & {
          code: string;
        };
        error.code = "invocation-context-unavailable";
        throw error;
      }
      const invocationServices = invocation.services;
      const hostSession = invocation.currentSessionId;
      const signal = invocationSignal(extra);
      switch (name) {
        case "brain_think": {
          const session = optionalSession(args.session_id, hostSession);
          const result = await invocationServices.anchor.runAnchor(
            session === undefined ? {} : { currentSessionId: session },
          );
          return textResult(
            result.context,
            result.diagnostics.map((diagnostic) => diagnostic.message),
          );
        }
        case "brain_absolute_path": {
          const location = parseResourceLocation(String(args.path));
          return textResult(projectAbsoluteLocation(invocationServices.binding, location));
        }
        case "brain_ls": {
          const result = await invocationServices.reads.ls(
            parsePublicPath(String(args.path)),
            discoveryContext(hostSession, signal),
          );
          return textResult(result.text);
        }
        case "brain_glob": {
          const request = {
            pattern: String(args.pattern),
            ...(typeof args.path === "string" ? { path: parsePublicPath(args.path) } : {}),
          };
          const result = await invocationServices.reads.glob(
            request,
            discoveryContext(hostSession, signal),
          );
          return textResult(result.text);
        }
        case "brain_grep": {
          const request = {
            pattern: String(args.pattern),
            ...(typeof args.path === "string" ? { path: parsePublicPath(args.path) } : {}),
            ...(typeof args.glob === "string" ? { glob: args.glob } : {}),
            ...(typeof args.ignoreCase === "boolean" ? { ignoreCase: args.ignoreCase } : {}),
            ...(typeof args.literal === "boolean" ? { literal: args.literal } : {}),
            ...(typeof args.context === "number" ? { context: args.context } : {}),
            ...(signal === undefined ? {} : { signal }),
          };
          const result = await invocationServices.reads.grep(
            request,
            discoveryContext(hostSession, signal),
          );
          return textResult(result.text);
        }
        case "brain_cat": {
          const result = await invocationServices.reads.cat({
            path: parsePublicPath(String(args.path)),
            ...(typeof args.offset === "number" ? { offset: args.offset } : {}),
            ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
            ...(signal === undefined ? {} : { signal }),
          });
          return textResult(result.text);
        }
        case "brain_write": {
          const result = await invocationServices.maintenance.write(
            parsePublicPath(String(args.path)),
            String(args.content),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_edit": {
          const result = await invocationServices.maintenance.edit({
            path: editPath(String(args.path)),
            ...(Array.isArray(args.edits)
              ? {
                  edits: args.edits.map((edit) => {
                    const record = edit as { oldText: string; newText: string };
                    return { oldText: record.oldText, newText: record.newText };
                  }),
                }
              : {}),
            ...(typeof args.content === "string" ? { content: args.content } : {}),
          });
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_rm": {
          const result = await invocationServices.maintenance.remove(
            parsePublicPath(String(args.path)),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_mv": {
          const result = await invocationServices.maintenance.move(
            parsePublicPath(String(args.src)),
            parsePublicPath(String(args.dst)),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_feedback": {
          const result = await invocationServices.maintenance.feedback(
            parsePublicPath(String(args.path)),
            args.feedback as "adopt" | "question" | "resolve",
            typeof args.challenge === "string" ? args.challenge : undefined,
          );
          return textResult(renderMaintenanceResult(result));
        }
      }
    } catch (error) {
      return errorResult(name, error);
    }
  };
}

export function registerBrainTools(
  server: BrainToolRegistrar,
  services: BrainApplicationServices | undefined,
  hostInvocation: HostInvocationAdapter = THREAD_META_HOST_INVOCATION,
  options: BrainToolRegistrationOptions = {},
): void {
  const excluded = new Set(options.exclude ?? []);
  for (const definition of PUBLIC_BRAIN_TOOLS) {
    if (excluded.has(definition.name)) continue;
    server.registerTool(
      definition.name,
      {
        title: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        annotations: definition.annotations,
      },
      handlerFor(definition.name, services, hostInvocation, options.resolveInvocation),
    );
  }
}
