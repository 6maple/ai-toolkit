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
  "Use a concrete brain cognition path: @global/core.md, @project/core.md, @session/<sid>/core.md, or <scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md as allowed by this tool.";
const archivalPath =
  "Use one concrete archival cognition path: @global/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md, @project/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md, or @session/<sid>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md.";
const discoveryPath =
  "Use a memories directory: <scope-root>/memories/, <scope-root>/memories/{decision,knowledge,intention,skill}/, or a nested directory below one role root.";

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
  path: z.string().describe(discoveryPath),
});

export const globInputSchema = z.strictObject({
  pattern: z
    .string()
    .min(1)
    .describe("Glob pattern matched against canonical public archival cognition paths."),
  path: z.string().optional().describe(`Optional search root. ${discoveryPath}`),
});

export const grepInputSchema = z.strictObject({
  pattern: z
    .string()
    .describe("Regex pattern by default; use literal=true to search ordinary text literally."),
  path: z.string().optional().describe(`Optional search root. ${discoveryPath}`),
  glob: z
    .string()
    .optional()
    .describe("Optional glob that further filters archival cognition paths in the search corpus."),
  ignoreCase: z.boolean().optional().describe("Use case-insensitive matching when true."),
  literal: z
    .boolean()
    .optional()
    .describe("Treat pattern as literal text instead of regex when true."),
  context: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of logical document lines to show before and after each match."),
});

export const catInputSchema = z.strictObject({
  path: z.string().describe(archivalPath),
  offset: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("1-based logical document line at which to start reading."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of complete logical document lines to return."),
});

export const writeInputSchema = z.strictObject({
  path: z.string().describe(archivalPath),
  content: z
    .string()
    .describe(
      "Complete archival Markdown document with frontmatter summary and importance (low|medium|high|critical), followed by the body.",
    ),
});

const exactEditSchema = z.strictObject({
  oldText: z
    .string()
    .min(1)
    .describe("Exact text that must identify one unique region in the original document."),
  newText: z.string().describe("Replacement text; it may be empty."),
});

export const editInputSchema = z
  .strictObject({
    path: z.string().describe(cognitionPath),
    edits: z
      .array(exactEditSchema)
      .min(1)
      .optional()
      .describe(
        "One or more non-overlapping exact-text replacements, all validated against the same original document.",
      ),
    content: z
      .string()
      .optional()
      .describe(
        "Complete replacement document when evolving the same existing cognition/document as a whole.",
      ),
  })
  .refine((value) => (value.edits === undefined) !== (value.content === undefined), {
    message: "Provide exactly one of edits or content.",
  });

export const rmInputSchema = z.strictObject({
  path: z.string().describe(archivalPath),
});

export const mvInputSchema = z.strictObject({
  src: z.string().describe(`Source. ${archivalPath}`),
  dst: z
    .string()
    .describe(`Destination at another concrete archival cognition path. ${archivalPath}`),
});

export const feedbackInputSchema = z
  .strictObject({
    path: z.string().describe(archivalPath),
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
    description: "List direct cognition children of one memories directory.",
    inputSchema: lsInputSchema,
  },
  {
    name: "brain_glob",
    description: "Find archival cognition by canonical path/name glob pattern.",
    inputSchema: globInputSchema,
  },
  {
    name: "brain_grep",
    description: "Search archival cognition content with Pi-style bounded regex or literal grep.",
    inputSchema: grepInputSchema,
  },
  {
    name: "brain_cat",
    description: "Read one concrete archival memory Markdown document by stable logical lines.",
    inputSchema: catInputSchema,
  },
  {
    name: "brain_write",
    description: "Create or fully overwrite one archival cognition document.",
    inputSchema: writeInputSchema,
  },
  {
    name: "brain_edit",
    description:
      "Evolve one existing core or archival cognition document with exact edits or complete content.",
    inputSchema: editInputSchema,
  },
  {
    name: "brain_rm",
    description: "Remove one active archival cognition from the current brain workspace.",
    inputSchema: rmInputSchema,
  },
  {
    name: "brain_mv",
    description: "Move the same archival cognition to another concrete archival path.",
    inputSchema: mvInputSchema,
  },
  {
    name: "brain_feedback",
    description:
      "Record validated use or a current epistemic question/resolve transition for one archival cognition.",
    inputSchema: feedbackInputSchema,
  },
];
