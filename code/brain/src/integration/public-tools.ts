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
      "Optional current session identifier. Omit it when no reliable current session identity is available.",
    ),
});

export const absolutePathInputSchema = z.strictObject({
  path: z
    .string()
    .describe(
      "Brain workspace location to map. Accepts @global, @project, @session/<sid>, core.md, memories/, a fixed role root, and any safe descendant below a role root including non-.md assets.",
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
      "Optional canonical-path glob that further filters archival cognition documents in the selected memories corpus.",
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
      "Complete archival Markdown document. It must begin with YAML frontmatter delimited by --- lines, contain a non-empty string summary and importance set to low, medium, high, or critical, then contain the Markdown body. Example prefix: ---\\nsummary: Concise retrieval cue\\nimportance: medium\\n---\\n",
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
        "Complete replacement Markdown for the existing cognition document. Use this instead of edits when replacing or reorganizing the document as a whole. Archival content must retain valid summary/importance frontmatter; core content does not use archival frontmatter.",
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
        "adopt records validated successful use; question records a current unresolved challenge; resolve clears an existing current challenge.",
      ),
    challenge: z
      .string()
      .optional()
      .describe(
        "Required for feedback=question: the complete current unresolved challenge that should be preserved.",
      ),
  })
  .refine((value) => value.feedback !== "question" || value.challenge !== undefined, {
    message: "challenge is required for feedback=question",
    path: ["challenge"],
  });

export interface BrainToolDefinition {
  readonly name: BrainToolName;
  readonly description: string;
  readonly inputSchema: z.ZodTypeAny;
}

export const PUBLIC_BRAIN_TOOLS: readonly BrainToolDefinition[] = [
  {
    name: "brain_think",
    description:
      "Restore prior brain context for the current turn. Call once immediately after each new user message before substantive reasoning when no host hook performs this restore automatically.",
    inputSchema: thinkInputSchema,
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
      "List the direct children of one archival memories directory. Pass a path under <scope-root>/memories, optionally narrowed to a cognitive role or nested directory. Do not pass a bare scope such as @project, core.md, or a concrete .md document. Output is bounded and not pageable; when more entries exist, call again with a narrower directory.",
    inputSchema: lsInputSchema,
  },
  {
    name: "brain_glob",
    description:
      "Find archival cognition documents by canonical public path/name glob. Searches only the memories subtree, never core.md or arbitrary workspace files. Optionally provide a valid memories directory as path to narrow the search. Results are discovery summaries, not exact document content; use brain_cat on a returned concrete .md path when the full cognition matters.",
    inputSchema: globInputSchema,
  },
  {
    name: "brain_grep",
    description:
      "Search the content of archival cognition documents with bounded regex or literal matching. Searches only the memories subtree, never core.md or arbitrary workspace files. Use path and glob to narrow the corpus, literal=true for ordinary text, and context for nearby logical lines. Matches are discovery evidence; use brain_cat with a returned concrete .md path and line offset for exact content.",
    inputSchema: grepInputSchema,
  },
  {
    name: "brain_cat",
    description:
      "Read one concrete archival cognition Markdown document under <scope-root>/memories/{decision,knowledge,intention,skill}/...md. This tool cannot read core.md: applicable core content is already fully restored inside <brain_think_context>; use that resident content directly and use brain_edit to maintain it. Returns complete logical document lines with stable 1-based coordinates. Large documents are bounded; continue with offset until complete.",
    inputSchema: catInputSchema,
  },
  {
    name: "brain_write",
    description:
      "Write a complete archival cognition Markdown document. Creates the document when absent and fully overwrites its Markdown content when present. The path must be a concrete .md document under <scope-root>/memories/{decision,knowledge,intention,skill}; this tool cannot create or overwrite core.md. Content must include valid archival frontmatter with summary and importance, followed by the body.",
    inputSchema: writeInputSchema,
  },
  {
    name: "brain_edit",
    description:
      "Edit one existing core or archival cognition Markdown document. Provide exactly one mode: edits for one or more exact, unique, non-overlapping replacements matched against the same original document, or content for complete replacement. For core.md, use the content already restored in <brain_think_context>; do not call brain_cat first. This tool does not create missing documents; use brain_write only when creating an archival document.",
    inputSchema: editInputSchema,
  },
  {
    name: "brain_rm",
    description:
      "Remove one active archival cognition document. The path must be a concrete .md document under <scope-root>/memories/{decision,knowledge,intention,skill}. This tool cannot remove core.md, a memories directory, or an arbitrary workspace file.",
    inputSchema: rmInputSchema,
  },
  {
    name: "brain_mv",
    description:
      "Move one archival cognition document to another concrete archival cognition path, preserving the same cognition and its mechanism-owned state. Both src and dst must be .md paths under a memories role; core.md, directories, and arbitrary workspace files are invalid.",
    inputSchema: mvInputSchema,
  },
  {
    name: "brain_feedback",
    description:
      "Record validated use or a current epistemic question/resolve transition for one archival cognition.",
    inputSchema: feedbackInputSchema,
  },
];
