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

function archivalDocumentPath(description: string) {
  return z.string().regex(archivalPathPattern).describe(description);
}

function memoriesDirectoryPath(description: string) {
  return z.string().regex(discoveryPathPattern).describe(description);
}

function cognitionDocumentPath(description: string) {
  return z.string().regex(cognitionPathPattern).describe(description);
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
      "Brain workspace location to map. Use a scope root (`@global`, `@project`, or `@session/<sid>`), `<scope-root>/core.md`, `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or any safe descendant below one of those role roots, including non-`.md` supporting assets. Use forward slashes; traversal and scope-level internal paths are invalid.",
    ),
});

export const lsInputSchema = z.strictObject({
  path: memoriesDirectoryPath(
    "Archival cognition directory to list. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a directory this tool can list.",
  ),
});

export const globInputSchema = z.strictObject({
  pattern: z
    .string()
    .min(1)
    .describe(
      "Non-empty glob matched against each candidate document's complete canonical public path, including its scope root and `.md` filename. Familiar operators include `*`, `**`, `?`, and character classes such as `[ab]`. For example, use `**/*.md` for all candidate documents, `**/testing-*.md` for matching filenames at any depth, or `@project/memories/decision/**/*.md` for a path-shaped subset. Use forward slashes. Only active archival cognition documents are candidates; directories, `core.md`, and arbitrary workspace files are not matched.",
    ),
  path: memoriesDirectoryPath(
    "Optional archival cognition directory used to narrow candidates before `pattern` is matched against their complete public paths. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Omit `path` to search all applicable memories trees. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
  )
    .optional()
    .describe(
      "Optional archival cognition directory used to narrow candidates before `pattern` is matched against their complete public paths. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Omit `path` to search all applicable memories trees. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
    ),
});

export const grepInputSchema = z.strictObject({
  pattern: z
    .string()
    .describe(
      "Search expression applied to archival Markdown document content. It is parsed as a regular expression by default; set `literal=true` when its characters should be searched as ordinary text instead of regex syntax. Matching is case-sensitive unless `ignoreCase=true`. An invalid regular expression is an input error, not a successful search with no matches.",
    ),
  path: memoriesDirectoryPath(
    "Optional archival cognition directory used as the content-search root. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Omit `path` to search all applicable memories trees. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
  )
    .optional()
    .describe(
      "Optional archival cognition directory used as the content-search root. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Omit `path` to search all applicable memories trees. Use forward slashes. A bare scope, `core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
    ),
  glob: z
    .string()
    .optional()
    .describe(
      "Optional file glob relative to each selected search root. Use it to filter which archival Markdown documents are searched; unlike `brain_glob`'s `pattern`, it is not matched against complete canonical public paths. Omit it to search all archival `.md` documents below each selected root. Use forward slashes.",
    ),
  ignoreCase: z
    .boolean()
    .optional()
    .describe(
      "When `true`, match text without distinguishing uppercase and lowercase. Omit or set `false` for case-sensitive matching.",
    ),
  literal: z
    .boolean()
    .optional()
    .describe(
      "When `true`, treat `pattern` characters as ordinary text rather than regular-expression syntax. Omit or set `false` to use regular-expression matching.",
    ),
  context: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Non-negative integer number of surrounding logical document line excerpts to include before and after each matching line. Omit or use `0` to return matching-line excerpts without surrounding lines.",
    ),
});

export const catInputSchema = z.strictObject({
  path: archivalDocumentPath(
    "Concrete active archival cognition Markdown document to read. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. This tool does not read `core.md` because applicable core content is already resident in `<brain_think_context>` and is maintained with `brain_edit`. A bare scope, directory, or non-`.md` path is not a readable cognition document for this tool.",
  ),
  offset: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Positive 1-based logical document line at which reading begins. Omit it to start at line `1`. To continue a bounded read, pass the exact `next_offset` returned by the preceding result. An `offset` beyond the end of the document returns no lines and no continuation.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Positive integer maximum number of logical document lines to return. Omit it to use the tool default. The transport budget may return fewer lines than this `limit`. A line that fits is returned in full; an oversized line is returned as a marked excerpt and does not prevent later lines from being read.",
    ),
});

export const writeInputSchema = z.strictObject({
  path: archivalDocumentPath(
    "Concrete archival cognition path to create or replace. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. The scope root selects where the cognition continues, and the role directory records its cognitive role. Use forward slashes. `core.md`, bare scopes, directories, and non-`.md` paths are invalid.",
  ),
  content: z
    .string()
    .describe(
      [
        "Complete archival Markdown document.",
        "",
        "Required YAML frontmatter:",
        "",
        "---",
        "summary: <non-empty current gist>",
        "importance: low | medium | high | critical",
        "---",
        "",
        "`summary` supports bounded recall and active discovery. State the cognition's current meaning and when it applies; when useful, indicate which procedures, conditions, or evidence the body provides. Preserve its cognitive role and key qualifications so the summary is not misleading. Keep it consistent with the document. The body may be empty when the summary expresses the complete cognition.",
        "",
        "`importance` is the reasonably expected consequence if this cognition applies but is not recalled, considering how recoverable the omission would be:",
        "",
        "- low: little material effect and easy recovery.",
        "- medium: meaningful but usually recoverable rework or worse judgment.",
        "- high: a material change to an important result, or significant cost, harm, or rework.",
        "- critical: a severe, irreversible, or otherwise unacceptable consequence.",
        "",
        "Choose the reasonably expected consequence, not a remote worst case. `importance` does not mean recency, frequency, continuity scope, confidence, retrievability, or relevance to the current request.",
      ].join("\n"),
    ),
});

const exactEditSchema = z.strictObject({
  oldText: z
    .string()
    .min(1)
    .describe(
      "Non-empty exact text from the original current document to replace. It must occur exactly once. Matching is literal, including spaces and line breaks; `oldText` is not trimmed or fuzzy-matched. Include enough surrounding text to identify one unique region.",
    ),
  newText: z
    .string()
    .describe(
      'Replacement text for the matched region. It may contain Markdown and line breaks. Use `""` to delete the matched text.',
    ),
});

export const editInputSchema = z
  .strictObject({
    path: cognitionDocumentPath(
      "Concrete existing cognition document to update. Use `<scope-root>/core.md` or `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. A bare scope, directory, non-`.md` archival path, or missing document is not an editable target.",
    ),
    edits: z
      .array(exactEditSchema)
      .min(1)
      .optional()
      .describe(
        "Non-empty list of exact targeted replacements. Form each `oldText` from the current exact document content, not from a recalled or discovered `summary`. Every `edits[].oldText` is matched against the same original document before any replacement is applied; no edit sees another edit's `newText`. Each `oldText` must identify one unique region, and the matched regions must not overlap. If any replacement is invalid, none are applied. When changing archival meaning or applicability, update `summary` in the same edit so it preserves the cognitive role, key qualifications, and useful body-reading cues. Use `content` instead when supplying the complete resulting document is clearer than a set of targeted replacements.",
      ),
    content: z
      .string()
      .optional()
      .describe(
        "Complete resulting Markdown for the same existing cognition document. Use this mode when revising or reorganizing the document as a whole; it still preserves the cognition's identity.\n\nFor `core.md`, provide the complete resulting core Markdown. Core does not use archival `summary`/`importance` frontmatter.\n\nFor an archival cognition, provide the complete resulting archival document with YAML frontmatter containing a non-empty `summary` and `importance` set to `low`, `medium`, `high`, or `critical`. Keep `summary` consistent with the resulting cognition, including its meaning, applicability, key qualifications, and useful body-reading cues. `importance` remains the reasonably expected consequence if this cognition applies but is not recalled; change it only when that omission consequence changes.",
      ),
  })
  .refine((value) => (value.edits === undefined) !== (value.content === undefined), {
    message: "Provide exactly one of edits or content.",
  });

export const rmInputSchema = z.strictObject({
  path: archivalDocumentPath(
    "Concrete existing active archival cognition to remove. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. `core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid targets.",
  ),
});

export const mvInputSchema = z.strictObject({
  src: archivalDocumentPath(
    "Concrete existing active archival cognition to move. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. `core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid sources.",
  ),
  dst: archivalDocumentPath(
    "Different concrete archival cognition path where `src` will continue. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. The destination may use a different continuity scope, cognitive role, or relative path. It need not exist; if it already contains another cognition, that cognition is replaced. `dst` must resolve to a different canonical address from `src`. Use forward slashes. `core.md`, bare scopes, directories, and non-`.md` paths are invalid destinations.",
  ),
});

export const feedbackInputSchema = z
  .strictObject({
    path: archivalDocumentPath(
      "Concrete existing active archival cognition to receive feedback. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or `@session/<sid>`. Use forward slashes. `core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid targets.",
    ),
    feedback: z
      .enum(["adopt", "question", "resolve"])
      .describe(
        [
          "Choose one feedback event:",
          "",
          "- `adopt`: Record validated successful use only after this cognition actually guided a decision or action and the observed outcome supports its continued validity. Reading, recalling, mentioning, agreeing with, or planning to use it is not enough. `adopt` preserves any current unresolved challenge and does not change `importance`.",
          "- `question`: Set or replace the complete current unresolved material challenge. Use it when the cognition's stored meaning, basis, conditions, certainty, or commitment is materially challenged and the issue remains unresolved. `challenge` is required and must be non-empty.",
          "- `resolve`: Clear an existing current challenge after that challenge has been resolved. It is valid only when a current unresolved challenge exists. If resolving the challenge changes the stored cognition, update the document first with `brain_edit`, then resolve it. `resolve` does not record validated successful use.",
        ].join("\n"),
      ),
    challenge: z
      .string()
      .optional()
      .describe(
        "For `feedback=question`, the required complete non-empty description of what is currently challenged and what remains unresolved. Leading and trailing whitespace is removed. This value replaces the previous current challenge; it does not append a challenge history. Omit it for `adopt` and `resolve`; if supplied with either, it is ignored.",
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
  /** Structured MCP output retained alongside the backwards-compatible text content. */
  readonly outputSchema: z.ZodTypeAny;
  readonly annotations?: ToolAnnotations;
}

/** All public Brain tools currently expose their rendered result as text. */
export const brainTextOutputSchema = z.strictObject({
  text: z.string().describe("Rendered result text returned by the Brain tool."),
});

export const PUBLIC_BRAIN_TOOLS: readonly BrainToolDefinition[] = [
  {
    name: "brain_think",
    description:
      "Restore the user's Brain working context for the current turn. When available, call this tool exactly once immediately after each new user message, before substantive interpretation, planning, responding, or calling another tool. Use the returned `<brain_think_context>` as working cognition for the turn and follow its instructions. Do not call this tool again in the same turn.",
    inputSchema: thinkInputSchema,
    outputSchema: brainTextOutputSchema,
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
      "Map a valid Brain workspace location to its absolute filesystem path for use with the host's filesystem, code, or data tools. Use this tool for cognition documents or supporting assets, including when an exact-read result directs you to filesystem recovery. It returns only the mapped path; the target does not need to exist, and this tool does not read or create it.",
    inputSchema: absolutePathInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_ls",
    description:
      "List the direct children of one archival cognition directory. Use this tool when the directory is known and its immediate structure is needed. The bounded, non-pageable result contains subdirectories and cognition entries with public `path`, current `summary`, and `status` when present. If truncated, narrow `path`, or use `brain_glob` for path/name clues and `brain_grep` for content clues.",
    inputSchema: lsInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_glob",
    description:
      "Find active archival cognition documents by matching a glob against their complete public paths. Use this tool when a scope, cognitive role, directory, or filename clue is known but the exact path is not. The bounded, non-pageable result contains public `path`, current `summary`, and `status` when present. If truncated, narrow `pattern` or `path` and search again.",
    inputSchema: globInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_grep",
    description:
      "Search active archival cognition Markdown content for matching lines. Use this tool when words or text patterns are known but the exact document path is not. The bounded, non-pageable result groups matches by document and includes public `path`, current `summary`, `status` when present, and 1-based matching/context line excerpts. If truncated, narrow `pattern`, `path`, or `glob` and search again.",
    inputSchema: grepInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_cat",
    description:
      "Read one concrete active archival cognition Markdown document to obtain the method, conditions, reasoning, or evidence needed for the current task beyond its recalled or discovered summary. The bounded result uses stable 1-based logical lines and includes current `status` and unresolved challenge when present. Continue from `next_offset` when returned. An oversized line is returned as a marked excerpt with instructions for reading the complete file.",
    inputSchema: catInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_write",
    description:
      "Create a new archival cognition at a concrete path, or intentionally replace the cognition already at that path with a different cognition. Use `brain_edit` when revising the same existing cognition, including a complete-document revision. A replacement does not inherit the previous cognition's unresolved challenge or learning continuity. This tool does not write `core.md`; `content` is one complete archival Markdown document.",
    inputSchema: writeInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_edit",
    description:
      "Update one existing core or archival cognition document while preserving its cognition identity. Provide exactly one of `edits` or `content`; both modes preserve an archival target's current unresolved challenge and appropriate learning continuity. For `core.md`, use the complete content already resident in `<brain_think_context>` rather than calling `brain_cat`. This tool does not create missing documents; use `brain_write` for a new archival cognition.",
    inputSchema: editInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_rm",
    description:
      "Remove one existing active archival cognition from Brain. After success, it no longer participates in working-context restore, archival discovery, or exact archival read. This tool removes only one concrete archival `.md` document; it does not remove `core.md`, directories, or supporting assets.",
    inputSchema: rmInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_mv",
    description:
      "Move one existing archival cognition to a different concrete archival path while preserving its identity, current unresolved challenge, and appropriate learning continuity. Use this tool when the same cognition should continue at a different relative path, continuity scope, or cognitive role. Its document content is not rewritten. If `dst` already contains another cognition, that destination cognition is replaced, not merged. This tool does not move `core.md`, directories, or supporting assets.",
    inputSchema: mvInputSchema,
    outputSchema: brainTextOutputSchema,
  },
  {
    name: "brain_feedback",
    description:
      "Record validated successful use or maintain the current unresolved challenge for one existing active archival cognition. Choose `adopt`, `question`, or `resolve` according to the `feedback` definitions. This tool changes only learning or challenge state; it does not edit the cognition document, `summary`, `importance`, `path`, continuity scope, or cognitive role.",
    inputSchema: feedbackInputSchema,
    outputSchema: brainTextOutputSchema,
  },
];
