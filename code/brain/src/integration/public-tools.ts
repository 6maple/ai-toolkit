import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const BRAIN_TOOL_NAMES = [
  "brain_think",
  "brain_absolute_path",
  "brain_ls",
  "brain_glob",
  "brain_grep",
  "brain_cat",
  "brain_write",
  "brain_edit",
  "brain_rm",
  "brain_mv",
  "brain_feedback",
] as const;

export type BrainToolName = (typeof BRAIN_TOOL_NAMES)[number];

const cognitionPath =
  "Concrete existing cognition document. Valid forms are @global/core.md, @project/core.md, @session/<sid>/core.md, or <scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md. A bare scope such as @project, a memories directory, and backslash-separated paths are invalid.";
const archivalPath =
  "Concrete archival cognition Markdown document. Use @global/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md, @project/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md, or @session/<sid>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md. core.md, bare scopes, directories, non-.md paths, and backslashes are invalid.";
const discoveryPath =
  "Archival memories directory. Valid forms are <scope-root>/memories/, <scope-root>/memories/{decision,knowledge,intention,skill}/, or a nested directory below one role root. A bare scope such as @project, core.md, a concrete .md document, and backslashes are invalid.";

const scopePattern = "(?:@global|@project|@session/[A-Za-z0-9][A-Za-z0-9._-]{0,127})";
const rolePattern = "(?:decision|knowledge|intention|skill)";
const safeSegmentPattern = "(?!\\.{1,2}(?:/|$))[^/\\\\]+";
const archivalPathPattern = new RegExp(
  `^${scopePattern}/memories/${rolePattern}/(?:${safeSegmentPattern}/)*${safeSegmentPattern}\\.md$`,
);
const discoveryPathPattern = new RegExp(
  `^(?!.*\\.md/?$)${scopePattern}/memories(?:/${rolePattern}(?:/${safeSegmentPattern})*)?/?$`,
);
const cognitionPathPattern = new RegExp(
  `^(?:${scopePattern}/core\\.md|${scopePattern}/memories/${rolePattern}/(?:${safeSegmentPattern}/)*${safeSegmentPattern}\\.md)$`,
);

function archivalDocumentPath() {
  return z.string().regex(archivalPathPattern).describe(archivalPath);
}

function memoriesDirectoryPath() {
  return z.string().regex(discoveryPathPattern).describe(discoveryPath);
}

function cognitionDocumentPath() {
  return z.string().regex(cognitionPathPattern).describe(cognitionPath);
}

export const thinkInputSchema = z.strictObject({
  session_id: z
    .string()
    .optional()
    .describe(
      "Optional exact current session identifier supplied by the host. Do not invent, shorten, derive, or reuse an identifier from another session. Omit it when no reliable current session identity is available.",
    ),
});

export const absolutePathInputSchema = z.strictObject({
  path: z
    .string()
    .describe(
      "Brain workspace location to map. Use a scope root (@global, @project, or @session/<sid>), <scope-root>/core.md, <scope-root>/memories/, a fixed role root, or any safe descendant below a role root, including non-.md assets.",
    ),
});

export const lsInputSchema = z.strictObject({
  path: memoriesDirectoryPath(),
});

export const globInputSchema = z.strictObject({
  pattern: z
    .string()
    .min(1)
    .describe(
      "Non-empty glob matched against canonical public archival cognition paths, for example **/*.md or **/testing-*.md. It does not match core.md or arbitrary workspace files.",
    ),
  path: memoriesDirectoryPath().optional().describe(`Optional search root. ${discoveryPath}`),
});

export const grepInputSchema = z.strictObject({
  pattern: z
    .string()
    .describe(
      "Search expression. Interpreted as a regular expression by default; set literal=true when the value is ordinary text that must not be parsed as regex.",
    ),
  path: memoriesDirectoryPath().optional().describe(`Optional search root. ${discoveryPath}`),
  glob: z
    .string()
    .optional()
    .describe(
      "Optional file glob relative to the selected search root. Use it to narrow which archival Markdown documents are searched.",
    ),
  ignoreCase: z
    .boolean()
    .optional()
    .describe("When true, match text without distinguishing uppercase and lowercase."),
  literal: z
    .boolean()
    .optional()
    .describe("Treat pattern as literal text instead of regex when true."),
  context: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Number of complete logical document lines to return before and after each matching line. Omit for matches without surrounding lines.",
    ),
});

export const catInputSchema = z.strictObject({
  path: archivalDocumentPath(),
  offset: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "1-based logical document line at which to start reading. Omit to start at line 1; use the continuation offset reported by a bounded result to continue a large document.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Maximum number of complete logical document lines to return. Omit to use the tool default. A line is never clipped and then counted as fully read.",
    ),
});

export const writeInputSchema = z.strictObject({
  path: archivalDocumentPath(),
  content: z
    .string()
    .describe(
      "Complete archival Markdown document. Start with YAML frontmatter containing a non-empty summary and importance set to low, medium, high, or critical. summary is the current gist used for recall and discovery; keep it consistent with the cognition. The body may be empty when the summary already preserves the complete meaning. importance is the reasonably expected consequence if this cognition applies but is not recalled: low means little material effect and easy recovery; medium means meaningful but usually recoverable rework or worse judgment; high means a material change to an important result or significant cost, harm, or rework; critical means a severe, irreversible, or otherwise unacceptable consequence. Do not use importance for recency, frequency, scope, confidence, retrievability, or current-query relevance. Example prefix: ---\\nsummary: Concise retrieval cue\\nimportance: medium\\n---\\n",
    ),
});

const exactEditSchema = z.strictObject({
  oldText: z
    .string()
    .min(1)
    .describe(
      "Exact text for one targeted replacement. It must identify one unique region in the original document and must not overlap or nest with another edits[].oldText in the same call.",
    ),
  newText: z
    .string()
    .describe("Replacement text for this targeted edit. Use an empty string to delete oldText."),
});

export const editInputSchema = z
  .strictObject({
    path: cognitionDocumentPath(),
    edits: z
      .array(exactEditSchema)
      .min(1)
      .optional()
      .describe(
        "One or more targeted replacements. Every edit is matched against the same original document, not incrementally. Do not submit overlapping or nested edits; merge changes that affect the same block.",
      ),
    content: z
      .string()
      .optional()
      .describe(
        "Complete replacement Markdown for the existing cognition document. Use this instead of edits when replacing or reorganizing the document as a whole. For an archival document, retain valid summary/importance frontmatter, keep the resulting summary consistent with the resulting cognition, and treat importance as the expected consequence if applicable cognition is not recalled; change importance only when that omission consequence changes. Core content does not use archival frontmatter.",
      ),
  })
  .refine((value) => (value.edits === undefined) !== (value.content === undefined), {
    message: "Provide exactly one of edits or content.",
  });

export const rmInputSchema = z.strictObject({
  path: archivalDocumentPath(),
});

export const mvInputSchema = z.strictObject({
  src: archivalDocumentPath().describe(`Source document. ${archivalPath}`),
  dst: archivalDocumentPath().describe(
    `Destination at another concrete archival cognition path. ${archivalPath}`,
  ),
});

export const feedbackInputSchema = z
  .strictObject({
    path: archivalDocumentPath(),
    feedback: z
      .enum(["adopt", "question", "resolve"])
      .describe(
        "adopt: use only after this cognition actually guided a decision or action and the observed outcome supports its continued validity; reading, mentioning, or agreeing with it is not enough. question: set or replace the complete current unresolved material challenge; challenge is required. resolve: clear an existing current challenge after it has been resolved. If the cognition's stored meaning must change, edit the document first. resolve does not record successful use.",
      ),
    challenge: z
      .string()
      .optional()
      .describe(
        "For feedback=question, the complete non-empty description of what is currently challenged and what remains unresolved. It replaces the previous current challenge rather than appending a history.",
      ),
  })
  .refine(
    (value) =>
      value.feedback !== "question" ||
      (value.challenge !== undefined && value.challenge.trim().length > 0),
    {
      message: "feedback=question requires a non-empty challenge",
      path: ["challenge"],
    },
  );

export interface BrainToolDefinition {
  readonly name: BrainToolName;
  readonly description: string;
  readonly inputSchema: z.ZodTypeAny;
  readonly annotations?: ToolAnnotations;
}

export const PUBLIC_BRAIN_TOOLS: readonly BrainToolDefinition[] = [
  {
    name: "brain_think",
    description:
      "Restore persistent Brain cognition as working context for the current turn. Call exactly once immediately after each new user message, before substantive reasoning, responding, or using any other tool, when the host has not already supplied a brain_think result. If a host hook instructs this call, obey it immediately. Never call more than once in the same turn.",
    inputSchema: thinkInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "brain_absolute_path",
    description:
      "Map one brain workspace location to its absolute filesystem path without reading or creating it.",
    inputSchema: absolutePathInputSchema,
  },
  {
    name: "brain_ls",
    description:
      "List the direct children of one archival memories directory. The bounded, non-pageable result contains subdirectories and archival cognition summaries. If truncated, narrow path or use brain_glob or brain_grep.",
    inputSchema: lsInputSchema,
  },
  {
    name: "brain_glob",
    description:
      "Find active archival cognition documents by public path or name glob. Omit path to search all applicable memories trees; provide a memories directory to narrow the search. Results are summaries, not exact document content; use brain_cat only when the summary is insufficient or exact details matter.",
    inputSchema: globInputSchema,
  },
  {
    name: "brain_grep",
    description:
      "Search active archival Markdown content by regular expression or literal text. Omit path to search all applicable memories trees; use path and glob to narrow the corpus. Results include real matching lines plus each document's summary and status; use brain_cat only when the full document or exact qualifications matter.",
    inputSchema: grepInputSchema,
  },
  {
    name: "brain_cat",
    description:
      "Read one concrete active archival cognition Markdown document. core.md is not a valid target because applicable core content is already fully present in <brain_think_context>; use that resident content directly and brain_edit to maintain it. Results use stable 1-based document lines. If more lines remain, continue from next_offset. If a complete line cannot fit, follow the returned brain_absolute_path recovery instruction.",
    inputSchema: catInputSchema,
  },
  {
    name: "brain_write",
    description:
      "Create a new archival cognition or fully replace the cognition at an existing archival path. Replacing an existing cognition does not preserve that cognition's learning continuity. This tool never writes core.md. Content must be a complete archival Markdown document with a current summary and omission-cost importance. Use brain_edit when the same existing cognition is being updated.",
    inputSchema: writeInputSchema,
  },
  {
    name: "brain_edit",
    description:
      "Update one existing core or archival cognition while preserving its identity and appropriate learning continuity. Provide exactly one mode: edits for exact, unique, non-overlapping replacements against the same original document, or content for complete replacement. For core.md, use the content already restored in <brain_think_context>; do not call brain_cat first. This tool does not create missing documents; use brain_write to create a new archival cognition.",
    inputSchema: editInputSchema,
  },
  {
    name: "brain_rm",
    description:
      "Remove one active archival cognition document. The target must be one concrete .md document under a memories role. core.md, directories, and arbitrary workspace files are invalid.",
    inputSchema: rmInputSchema,
  },
  {
    name: "brain_mv",
    description:
      "Move the same archival cognition to another concrete archival cognition path while preserving its identity and appropriate learning continuity. Changing the path can change its continuity scope or cognitive role. If dst already exists, that destination cognition is replaced. core.md, directories, and arbitrary workspace files are invalid.",
    inputSchema: mvInputSchema,
  },
  {
    name: "brain_feedback",
    description:
      "Record validated successful use or maintain the current unresolved epistemic challenge for one active archival cognition. This tool does not edit the cognition document or change its importance.",
    inputSchema: feedbackInputSchema,
  },
];
