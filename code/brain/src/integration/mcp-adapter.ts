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

export interface HostInvocationAdapter {
  currentSessionId(extra: unknown): SessionId | undefined;
}

export const CODEX_THREAD_HOST_INVOCATION: HostInvocationAdapter = {
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
}

function textResult(text: string, warnings: readonly string[] = []): BrainToolResult {
  return {
    content: [
      { type: "text", text },
      ...warnings.map((warning) => ({ type: "text" as const, text: `warning: ${warning}` })),
    ],
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
]);

function errorResult(toolName: BrainToolName, error: unknown): BrainToolResult {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { content: [{ type: "text", text: "error: aborted" }], isError: true };
  }
  const code = typedCode(error);
  if (code !== undefined) {
    const guidance = PATH_ERROR_CODES.has(code) ? OBJECT_PATH_GUIDANCE[toolName] : undefined;
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
  if (typeof explicit === "string") return parseSessionId(explicit);
  return host;
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
      return `${result.changed ? "edited" : "no changes to"} ${formatPublicPath(result.path)}`;
    case "moved":
      return `moved ${formatPublicPath(result.from)} -> ${formatPublicPath(result.to)}${result.replacedExistingDestination ? "; replaced existing destination" : ""}`;
    case "removed":
      return `removed ${formatPublicPath(result.path)}`;
    case "adopted":
      return `adopted ${formatPublicPath(result.path)}`;
    case "questioned":
      return `${result.changed ? "questioned" : "no change to question on"} ${formatPublicPath(result.path)}`;
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
  services: BrainApplicationServices,
  hostInvocation: HostInvocationAdapter,
): (args: unknown, extra?: unknown) => Promise<BrainToolResult> {
  return async (rawArgs: unknown, extra) => {
    try {
      const args = toolArgsRecord(rawArgs);
      const hostSession = hostInvocation.currentSessionId(extra);
      const signal = invocationSignal(extra);
      switch (name) {
        case "brain_think": {
          const session = optionalSession(args.session_id, hostSession);
          const result = await services.anchor.runAnchor(
            session === undefined ? {} : { currentSessionId: session },
          );
          return textResult(
            result.context,
            result.diagnostics.map((diagnostic) => diagnostic.message),
          );
        }
        case "brain_absolute_path": {
          const location = parseResourceLocation(String(args.path));
          return textResult(projectAbsoluteLocation(services.binding, location));
        }
        case "brain_ls": {
          const result = await services.reads.ls(
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
          const result = await services.reads.glob(request, discoveryContext(hostSession, signal));
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
          const result = await services.reads.grep(request, discoveryContext(hostSession, signal));
          return textResult(result.text);
        }
        case "brain_cat": {
          const result = await services.reads.cat({
            path: parsePublicPath(String(args.path)),
            ...(typeof args.offset === "number" ? { offset: args.offset } : {}),
            ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
            ...(signal === undefined ? {} : { signal }),
          });
          return textResult(result.text);
        }
        case "brain_write": {
          const result = await services.maintenance.write(
            parsePublicPath(String(args.path)),
            String(args.content),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_edit": {
          const result = await services.maintenance.edit({
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
          const result = await services.maintenance.remove(parsePublicPath(String(args.path)));
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_mv": {
          const result = await services.maintenance.move(
            parsePublicPath(String(args.src)),
            parsePublicPath(String(args.dst)),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_feedback": {
          const result = await services.maintenance.feedback(
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
  server: McpServer,
  services: BrainApplicationServices,
  hostInvocation: HostInvocationAdapter = CODEX_THREAD_HOST_INVOCATION,
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
      },
      handlerFor(definition.name, services, hostInvocation),
    );
  }
}
