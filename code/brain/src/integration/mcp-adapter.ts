import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { AnchorRestore } from "../application/anchor-restore.ts";
import type {
  CognitionMaintenance,
  MaintenanceResult,
} from "../application/cognition-maintenance.ts";
import type { ReadDiscovery } from "../application/read-discovery.ts";
import type { RoutedBrainApplication } from "../application/routed-brain.ts";
import {
  formatPublicPath,
  parsePublicPath,
  parseResourceLocation,
} from "../brain/namespace.ts";
import { projectAbsoluteLocation, type StorageBinding } from "../persistence/storage.ts";
import type { BrainRuntimeFeatures } from "../runtime/features.ts";
import { selectPublicBrainTools, type BrainToolName } from "./public-tools.ts";

export interface BrainApplicationServices {
  readonly binding: StorageBinding;
  readonly anchor: Pick<AnchorRestore, "runAnchor">;
  readonly reads: Pick<ReadDiscovery, "ls" | "glob" | "grep" | "cat">;
  readonly maintenance: Pick<
    CognitionMaintenance,
    "write" | "edit" | "remove" | "move" | "feedback"
  >;
  readonly semantic?: {
    search(
      query: string,
      context?: { readonly signal?: AbortSignal },
    ): Promise<{ readonly text: string }>;
  };
  readonly routed?: RoutedBrainApplication;
}

export interface BrainToolInvocation {
  readonly services: BrainApplicationServices;
}

export type BrainToolInvocationResolver = (
  extra: unknown,
) => BrainToolInvocation | Promise<BrainToolInvocation>;

/** Structural MCP host boundary that avoids coupling consumers to Brain's SDK instance. */
export type BrainToolRegistrar = Pick<McpServer, "registerTool">;

export type BrainToolResult = CallToolResult;

export interface BrainToolRegistrationOptions {
  /** Tools owned by a host lifecycle integration and therefore hidden from the model. */
  readonly exclude?: readonly BrainToolName[];
  /** Optional runtime capabilities selected from Brain's global config. */
  readonly features?: BrainRuntimeFeatures;
  /** Resolve the project services for each tool invocation when the host owns dynamic routing. */
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
    "brain_ls accepts only a memories directory under a built-in root or configured #alias, for example @project/memories/ or #mobile/memories/knowledge/. Do not pass a bare root, a Scope Core path matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or a concrete .md document.",
  brain_glob:
    "When path is provided, brain_glob accepts only a memories directory under a built-in root or configured #alias. Omit path to search global memories and all workspace project memories (current + available related projects). This tool discovers archival memories, not a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`.",
  brain_grep:
    "When path is provided, brain_grep accepts only a memories directory under a built-in root or configured #alias. Omit path to search global memories and all workspace project memories (current + available related projects). This tool searches archival memories, not a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`.",
  brain_cat:
    "brain_cat accepts one concrete Scope Core path matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or one archival cognition .md document; bare roots and directories are invalid.",
  brain_write:
    "brain_write accepts only a concrete archival .md path under a memories role, including configured #alias paths. It cannot write a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`; maintain an existing Scope Core with brain_edit.",
  brain_edit:
    "brain_edit accepts one existing Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or one concrete archival .md document, not a bare root or memories directory.",
  brain_rm:
    "brain_rm accepts only a concrete archival .md path under a memories role, including configured #alias paths; it cannot remove a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or a directory.",
  brain_mv:
    "brain_mv requires concrete archival .md paths under memories roles for both src and dst; either endpoint may use a configured #alias. Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, and directories are invalid.",
  brain_feedback:
    "brain_feedback accepts only a concrete archival .md path under a memories role, including configured #alias paths; Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, and directories are invalid.",
};

const PATH_ERROR_CODES = new Set([
  "invalid-root",
  "invalid-separator",
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
  "semantic-search-unavailable":
    "Semantic Search is enabled but its runtime is unavailable. Check the semantic runtime installation and restart the host after repairing it.",
  "core-capacity-exceeded":
    "Move complete cognition into the matching archival memory and keep only the necessary trigger, exact memory path, and usage guidance in the applicable Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md` before retrying.",
  "edit-mode": "Provide exactly one of edits or content.",
  "empty-edits": "Provide at least one exact replacement.",
  "empty-old-text": "Each edits[].oldText must be non-empty.",
  "old-text-not-found":
    "Read the current document and use text that exists exactly in that document.",
  "old-text-not-unique": "Include more surrounding text so oldText identifies one unique region.",
  "overlapping-edits":
    "Merge overlapping changes into one replacement or make the edited regions disjoint.",
  "nonempty-core-requires-exact-edit":
    "The Scope Core already contains content. Read the current Core and update it with exact edits. For a deliberate complete rewrite, use one exact edit whose oldText is the complete current Core.",
  "same-source-destination": "Choose a dst path different from src.",
  "question-challenge-required":
    "feedback=question requires a non-empty complete current unresolved challenge.",
  "empty-challenge":
    "feedback=question requires a non-empty complete current unresolved challenge.",
  "no-current-challenge":
    "feedback=resolve is valid only for a cognition that currently has an unresolved challenge.",
  "missing-frontmatter":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "unterminated-frontmatter":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "invalid-frontmatter-yaml":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "frontmatter-not-map":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "missing-description":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "invalid-description":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "missing-importance":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "invalid-importance":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
  "empty-body":
    "Supply a complete archival Markdown document with valid description and importance frontmatter and a non-empty cognition body.",
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

function invocationSignal(extra: unknown): AbortSignal | undefined {
  if (typeof extra !== "object" || extra === null || !("signal" in extra)) return undefined;
  const signal = (extra as { signal?: unknown }).signal;
  return signal instanceof AbortSignal ? signal : undefined;
}

function discoveryContext(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
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
  resolveInvocation?: BrainToolInvocationResolver,
): (args: unknown, extra?: unknown) => Promise<BrainToolResult> {
  return async (rawArgs: unknown, extra) => {
    try {
      const args = toolArgsRecord(rawArgs);
      const invocation =
        resolveInvocation === undefined
          ? services === undefined
            ? undefined
            : { services }
          : await resolveInvocation(extra);
      if (invocation === undefined) {
        const error = new Error("brain invocation context is unavailable") as Error & {
          code: string;
        };
        error.code = "invocation-context-unavailable";
        throw error;
      }
      const invocationServices = invocation.services;
      const signal = invocationSignal(extra);
      const routed = invocationServices.routed;
      switch (name) {
        case "brain_think": {
          const result =
            routed === undefined
              ? await invocationServices.anchor.runAnchor({})
              : await routed.think();
          return textResult(
            result.context,
            result.diagnostics.map((diagnostic) => diagnostic.message),
          );
        }
        case "brain_absolute_path": {
          if (routed !== undefined) return textResult(await routed.absolutePath(String(args.path)));
          const location = parseResourceLocation(String(args.path));
          return textResult(projectAbsoluteLocation(invocationServices.binding, location));
        }
        case "brain_ls": {
          const result =
            routed === undefined
              ? await invocationServices.reads.ls(
                  parsePublicPath(String(args.path)),
                  discoveryContext(signal),
                )
              : await routed.ls(String(args.path), discoveryContext(signal));
          return textResult(result.text);
        }
        case "brain_glob": {
          const context = discoveryContext(signal);
          const result =
            routed === undefined
              ? await invocationServices.reads.glob(
                  {
                    pattern: String(args.pattern),
                    ...(typeof args.path === "string" ? { path: parsePublicPath(args.path) } : {}),
                  },
                  context,
                )
              : await routed.glob(
                  {
                    pattern: String(args.pattern),
                    ...(typeof args.path === "string" ? { path: args.path } : {}),
                  },
                  context,
                );
          return textResult(result.text);
        }
        case "brain_grep": {
          const context = discoveryContext(signal);
          const common = {
            pattern: String(args.pattern),
            ...(typeof args.glob === "string" ? { glob: args.glob } : {}),
            ...(typeof args.ignoreCase === "boolean" ? { ignoreCase: args.ignoreCase } : {}),
            ...(typeof args.literal === "boolean" ? { literal: args.literal } : {}),
            ...(typeof args.context === "number" ? { context: args.context } : {}),
            ...(signal === undefined ? {} : { signal }),
          };
          const result =
            routed === undefined
              ? await invocationServices.reads.grep(
                  {
                    ...common,
                    ...(typeof args.path === "string" ? { path: parsePublicPath(args.path) } : {}),
                  },
                  context,
                )
              : await routed.grep(
                  {
                    ...common,
                    ...(typeof args.path === "string" ? { path: args.path } : {}),
                  },
                  context,
                );
          return textResult(result.text);
        }
        case "brain_ask_search": {
          const context = discoveryContext(signal);
          const semantic = invocationServices.semantic;
          if (routed !== undefined) {
            const result = await routed.askSearch(String(args.query), context);
            return textResult(result.text);
          }
          if (semantic === undefined) {
            const error = new Error("semantic search is unavailable") as Error & { code: string };
            error.code = "semantic-search-unavailable";
            throw error;
          }
          const result = await semantic.search(String(args.query), context);
          return textResult(result.text);
        }
        case "brain_cat": {
          const result =
            routed === undefined
              ? await invocationServices.reads.cat({
                  path: parsePublicPath(String(args.path)),
                  ...(typeof args.offset === "number" ? { offset: args.offset } : {}),
                  ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
                  ...(signal === undefined ? {} : { signal }),
                })
              : await routed.cat({
                  path: String(args.path),
                  ...(typeof args.offset === "number" ? { offset: args.offset } : {}),
                  ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
                  ...(signal === undefined ? {} : { signal }),
                });
          return textResult(result.text);
        }
        case "brain_write": {
          if (routed !== undefined) {
            return textResult(await routed.write(String(args.path), String(args.content)));
          }
          const result = await invocationServices.maintenance.write(
            parsePublicPath(String(args.path)),
            String(args.content),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_edit": {
          const edits = Array.isArray(args.edits)
            ? args.edits.map((edit) => {
                const record = edit as { oldText: string; newText: string };
                return { oldText: record.oldText, newText: record.newText };
              })
            : undefined;
          if (routed !== undefined) {
            return textResult(
              await routed.edit({
                path: String(args.path),
                ...(edits === undefined ? {} : { edits }),
                ...(typeof args.content === "string" ? { content: args.content } : {}),
              }),
            );
          }
          const result = await invocationServices.maintenance.edit({
            path: editPath(String(args.path)),
            ...(edits === undefined ? {} : { edits }),
            ...(typeof args.content === "string" ? { content: args.content } : {}),
          });
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_rm": {
          if (routed !== undefined) return textResult(await routed.remove(String(args.path)));
          const result = await invocationServices.maintenance.remove(
            parsePublicPath(String(args.path)),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_mv": {
          if (routed !== undefined) {
            return textResult(await routed.move(String(args.src), String(args.dst)));
          }
          const result = await invocationServices.maintenance.move(
            parsePublicPath(String(args.src)),
            parsePublicPath(String(args.dst)),
          );
          return textResult(renderMaintenanceResult(result));
        }
        case "brain_feedback": {
          if (routed !== undefined) {
            return textResult(
              await routed.feedback(
                String(args.path),
                args.feedback as "adopt" | "question" | "resolve",
                typeof args.challenge === "string" ? args.challenge : undefined,
              ),
            );
          }
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
  options: BrainToolRegistrationOptions = {},
): void {
  const excluded = new Set(options.exclude ?? []);
  for (const definition of selectPublicBrainTools(options.features)) {
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
      handlerFor(definition.name, services, options.resolveInvocation),
    );
  }
}
