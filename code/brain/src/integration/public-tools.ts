import { BRAIN_VIRTUAL_PATHS } from "../application/think-context.ts";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  definition as stepDefinition,
  inputSchema as stepInputSchema,
  outputSchema as stepOutputSchema,
} from "brain/step";
import { BRAIN_TOOL_DESCRIPTIONS, BRAIN_TOOL_FIELDS } from "./approved-tool-descriptions.ts";

import { DEFAULT_BRAIN_RUNTIME_FEATURES, type BrainRuntimeFeatures } from "../runtime/features.ts";

export const BRAIN_TOOL_NAMES = [
  "brain_think",
  "brain_step",
  "brain_absolute_path",
  "brain_ls",
  "brain_glob",
  "brain_grep",
  "brain_ask_search",
  "brain_cat",
  "brain_write",
  "brain_edit",
  "brain_rm",
  "brain_mv",
  "brain_feedback",
] as const;

export type BrainToolName = (typeof BRAIN_TOOL_NAMES)[number];

const builtinScopePattern = "(?:@global|@project)";
const relatedProjectRootPattern = "#[A-Za-z0-9][A-Za-z0-9._-]{0,127}";
const scopePattern = `(?:${builtinScopePattern}|${relatedProjectRootPattern})`;
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

export const thinkInputSchema = z.strictObject({});

export const absolutePathInputSchema = z.strictObject({
  path: z
    .string()
    .describe(
      "Brain workspace location to map. Use a built-in scope root (`@global` or `@project`) or configured related `#alias`, plus its core, memories tree, or safe descendant below a memory role. Use forward slashes; traversal and scope-level internal paths are invalid.",
    ),
});

export const lsInputSchema = z.strictObject({
  path: memoriesDirectoryPath(
    "Archival cognition directory to list. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Use forward slashes. A bare scope, a Scope Core path matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or a concrete `.md` cognition document is not a directory this tool can list.",
  ),
});

export const globInputSchema = z.strictObject({
  pattern: z
    .string()
    .min(1)
    .describe(
      "Non-empty glob matched against each candidate document's complete canonical public path, including its scope root and `.md` filename. Familiar operators include `*`, `**`, `?`, and character classes such as `[ab]`. For example, use `**/*.md` for all candidate documents, `**/testing-*.md` for matching filenames at any depth, or `@project/memories/decision/**/*.md` for a path-shaped subset. Use forward slashes. Only active archival cognition documents are candidates; directories, Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, and arbitrary workspace files are not matched.",
    ),
  path: memoriesDirectoryPath(
    "Optional archival cognition directory used to narrow candidates before `pattern` is matched against their complete public paths. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Omit `path` to search global memories and all workspace project memories (current + available related projects). Use forward slashes. A bare scope, a Scope Core path matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
  )
    .optional()
    .describe(
      "Optional archival cognition directory used to narrow candidates before `pattern` is matched against their complete public paths. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Omit `path` to search global memories and all workspace project memories (current + available related projects). Use forward slashes. A bare scope, a Scope Core path matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
    ),
});

export const grepInputSchema = z.strictObject({
  pattern: z
    .string()
    .describe(
      "Search expression applied to archival Markdown document content. It is parsed as a regular expression by default; set `literal=true` when its characters should be searched as ordinary text instead of regex syntax. Matching is case-sensitive unless `ignoreCase=true`. An invalid regular expression is an input error, not a successful search with no matches.",
    ),
  path: memoriesDirectoryPath(
    "Optional archival cognition directory used as the content-search root. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Omit `path` to search global memories and all workspace project memories (current + available related projects). Use forward slashes. A bare scope, a Scope Core path matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
  )
    .optional()
    .describe(
      "Optional archival cognition directory used as the content-search root. Use `<scope-root>/memories/`, `<scope-root>/memories/{decision,knowledge,intention,skill}/`, or a nested directory below one role root, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Omit `path` to search global memories and all workspace project memories (current + available related projects). Use forward slashes. A bare scope, a Scope Core path matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or a concrete `.md` cognition document is not a search root for this tool.",
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

export const askSearchInputSchema = z.strictObject({
  query: z
    .string()
    .min(1)
    .describe(
      "Natural-language description of the relevant past cognition to recall, formed from your current understanding of the task rather than mechanically copying the user's message.",
    ),
});

export const catInputSchema = z.strictObject({
  path: z
    .union([
      cognitionDocumentPath("Concrete Scope Core or archival cognition Markdown."),
      z.enum(BRAIN_VIRTUAL_PATHS),
    ])
    .describe(
      "Concrete cognition document, or a built-in @brain-virtual/{normal,deep,normal-memory,deep-memory}.md view. Built-in views are generated fresh and returned in full.",
    ),
  offset: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "For cognition documents only; ignored for built-in virtual views, which return in full. Positive 1-based logical document line at which reading begins. Omit it to start at line `1`. To continue a bounded read, pass the exact `next_offset` returned by the preceding result. An `offset` beyond the end of the document returns no lines and no continuation.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "For cognition documents only; ignored for built-in virtual views, which return in full. Positive integer maximum number of logical document lines to return. Omit it to use the tool default. The transport budget may return fewer lines than this `limit`. A line that fits is returned in full; an oversized line is returned as a marked excerpt and does not prevent later lines from being read.",
    ),
});

export const writeInputSchema = z.strictObject({
  path: archivalDocumentPath(
    "Concrete archival cognition path to create or replace. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. The scope root selects where the cognition continues, and the role directory records its cognitive role. Use forward slashes. Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, bare scopes, directories, and non-`.md` paths are invalid.",
  ),
  content: z
    .string()
    .describe(
      [
        "Complete archival Markdown document.",
        "",
        "Write complete YAML frontmatter:",
        "",
        "---",
        "description: <when this cognition should be read>",
        "summary: <current cognition and necessary boundaries>",
        "importance: low | medium | high | critical",
        "---",
        "",
        "`description` supports bounded recall and active discovery by stating when this cognition should be read; `summary` describes the current cognition and its necessary boundaries for semantic discovery. Provide both when writing. The parser still accepts older documents without a summary, but they cannot participate in semantic discovery. Describe the situations, tasks, questions, or conditions that make the cognition relevant, with enough topic or responsibility cues to recognize applicability. Keep the fields current when their meanings change. The Markdown body contains the cognition itself and must be non-empty. Include the known conditions and evidence needed to use it correctly; keep unknown causes unconfirmed.",
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
      "Concrete existing cognition document to update. Scope Core paths match `@global/core.md`, `@project/core.md`, or `#*/core.md`; archival paths use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`. Replace `*` with the actual related-project alias. Use forward slashes. A bare scope, directory, non-`.md` archival path, or missing document is not an editable target.",
    ),
    edits: z
      .array(exactEditSchema)
      .min(1)
      .optional()
      .describe(
        "Non-empty list of exact targeted replacements. Form each `oldText` from the current exact document content. Every `edits[].oldText` is matched against the same original document before any replacement is applied; no edit sees another edit's `newText`. Each `oldText` must identify one unique region, and the matched regions must not overlap. If any replacement is invalid, none are applied. Use exact edits for every non-empty Scope Core; for a deliberate whole-Core rewrite, use one exact edit whose `oldText` is the complete current Core. When changing archival applicability, update `description` in the same edit so it continues to state when the cognition should be read. Update `summary` when the current cognition or its necessary boundaries change.",
      ),
    content: z
      .string()
      .optional()
      .describe(
        "Complete resulting Markdown for the same existing cognition document. For a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, `content` is allowed only when the Core is currently empty; initialize it with only the minimal trigger, exact memory path, and usage guidance. A non-empty Core must be changed with `edits`. Scope Core does not use archival `description`/`summary`/`importance` frontmatter.\n\nFor an archival cognition, use `content` when revising or reorganizing the document as a whole. Provide the complete resulting archival document with YAML frontmatter containing a non-empty `description` that states when the cognition should be read, a `summary` of the current cognition and its necessary boundaries, `importance` set to `low`, `medium`, `high`, or `critical`, and a non-empty Markdown body containing the cognition itself. Update changed conclusions together with their conditions and evidence. Keep `description` current when applicability changes and `summary` current when the cognition changes. `importance` remains the reasonably expected consequence if this cognition applies but is not recalled; change it only when that omission consequence changes.",
      ),
  })
  .refine((value) => (value.edits === undefined) !== (value.content === undefined), {
    message: "Provide exactly one of edits or content.",
  });

export const rmInputSchema = z.strictObject({
  path: archivalDocumentPath(
    "Concrete existing active archival cognition to remove. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Use forward slashes. Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid targets.",
  ),
});

export const mvInputSchema = z.strictObject({
  src: archivalDocumentPath(
    "Concrete existing active archival cognition to move. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Use forward slashes. Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid sources.",
  ),
  dst: archivalDocumentPath(
    "Different concrete archival cognition path where `src` will continue. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. The destination may use a different continuity scope, cognitive role, or relative path. It need not exist; if it already contains another cognition, that cognition is replaced. `dst` must resolve to a different canonical address from `src`. Use forward slashes. Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, bare scopes, directories, and non-`.md` paths are invalid destinations.",
  ),
});

export const feedbackInputSchema = z
  .strictObject({
    path: archivalDocumentPath(
      "Concrete existing active archival cognition to receive feedback. Use `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`, where `<scope-root>` is `@global`, `@project`, or a configured related `#alias`. Use forward slashes. Scope Core paths matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, bare scopes, directories, non-`.md` paths, and missing documents are invalid targets.",
    ),
    feedback: z
      .enum(["adopt", "question", "resolve"])
      .describe(
        [
          "Choose one feedback event:",
          "",
          "- `adopt`: Record validated successful use only after this cognition actually guided a decision or action and the observed outcome supports its use within the tested conditions. Reading, recalling, mentioning, agreeing with, planning to use it, or overall task success alone is not enough. Success does not extend its scope. If the result changes the understanding, record that change with `brain_edit`. `adopt` preserves any current unresolved challenge and does not change `importance`.",
          "- `question`: Set or replace the complete current unresolved material challenge. Use it when specific evidence, such as a contradiction or counterexample, materially challenges the cognition's stored meaning, basis, conditions, certainty, or commitment and the issue remains unresolved. If only a current applicability condition is unknown, investigate that condition first. `challenge` is required and must be non-empty.",
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
  readonly outputSchema?: z.ZodTypeAny;
  readonly annotations?: ToolAnnotations;
}

// Cognition tools return text; brain_step retains its reviewed structured result contract.
const rawPublicBrainTools: readonly BrainToolDefinition[] = [
  {
    name: "brain_step",
    description: stepDefinition.description,
    inputSchema: stepInputSchema,
    outputSchema: stepOutputSchema,
  },
  {
    name: "brain_think",
    description:
      "Establish the user's Brain working context for the current turn, automatically including the selected think-workflow in full, Scope Cores, candidates and diagnostics. Call once after each new user message before other substantive actions in explicit mode.",
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
      "Map a valid Brain workspace location to its absolute filesystem path for use with the host's filesystem, code, or data tools. Use this tool for cognition documents or supporting assets, including when an exact-read result directs you to filesystem recovery. It returns only the mapped path; the target does not need to exist, and this tool does not read or create it.",
    inputSchema: absolutePathInputSchema,
  },
  {
    name: "brain_ls",
    description:
      "List the direct children of one archival cognition directory. Use this tool when the directory is known and its immediate structure is needed. The bounded, non-pageable result contains subdirectories and cognition entries with public `path`, current `description`, and `status` when present. Use each description to identify candidates; read full cognition with `brain_cat` by default, skipping only clearly unrelated entries and reading when unsure. If truncated, narrow `path`, or use `brain_glob` for path/name clues and `brain_grep` for content clues.",
    inputSchema: lsInputSchema,
  },
  {
    name: "brain_glob",
    description:
      "Find active archival cognition documents by matching a glob against their complete public paths. Use this tool when a scope, cognitive role, directory, or filename clue is known but the exact path is not. The bounded, non-pageable result contains public `path`, current `description`, and `status` when present. Use each description to identify candidates; read full cognition with `brain_cat` by default, skipping only clearly unrelated entries and reading when unsure. If truncated, narrow `pattern` or `path` and search again.",
    inputSchema: globInputSchema,
  },
  {
    name: "brain_grep",
    description:
      "Search active archival cognition Markdown content for matching lines. Use this tool when words or text patterns are known but the exact document path is not. The bounded, non-pageable result groups matches by document and includes public `path`, current `description`, `status` when present, and 1-based matching/context line excerpts. Use the description and matched content to identify candidates; read full cognition with `brain_cat` by default, skipping only clearly unrelated entries and reading when unsure. If truncated, narrow `pattern`, `path`, or `glob` and search again.",
    inputSchema: grepInputSchema,
  },
  {
    name: "brain_ask_search",
    description:
      "Search active archival cognition by semantic meaning after you understand the current task. Describe the relevant past cognition you want to recall in natural language based on that understanding rather than mechanically copying the user's message. Use brain_grep when you have known words or text patterns, brain_glob when you have path, directory, role, or filename clues, and brain_cat when exact cognition content is needed. Results are bounded cognition descriptions. Read candidate paths with `brain_cat` by default, skipping only clearly unrelated results and reading when unsure. Search again when later understanding reveals another need for past cognition.",
    inputSchema: askSearchInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "brain_cat",
    description:
      "Read one concrete cognition Markdown document, including a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, or an archival memory. The bounded result uses stable 1-based logical lines; archival reads also include current status/challenge when present. Continue from `next_offset` when returned.",
    inputSchema: catInputSchema,
  },
  {
    name: "brain_write",
    description:
      "Create a new archival cognition at a concrete path, or intentionally replace the cognition already at that path with a different cognition. Use `brain_edit` when revising the same existing cognition, including a complete-document revision. A replacement does not inherit the previous cognition's unresolved challenge or learning continuity. This tool does not write a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`; `content` is one complete archival Markdown document.",
    inputSchema: writeInputSchema,
  },
  {
    name: "brain_edit",
    description:
      "Update one existing Scope Core or archival cognition document while preserving its cognition identity. For `@global/core.md`, `@project/core.md`, or `#*/core.md`, keep only the minimal trigger, exact memory path, and usage guidance needed to make relevant cognition available; keep complete cognition in archival memories. A non-empty Scope Core must use exact `edits`; `content` may only initialize an empty Core. To deliberately rewrite a non-empty Core completely, use one exact edit whose `oldText` is the complete current Core. Archival cognition may use either exact `edits` or complete `content`. This tool does not create missing documents; use `brain_write` for a new archival cognition.",
    inputSchema: editInputSchema,
  },
  {
    name: "brain_rm",
    description:
      "Remove one existing active archival cognition from Brain. After success, it no longer participates in working-context restore, archival discovery, or exact archival read. This tool removes only one concrete archival `.md` document; it does not remove a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, directories, or supporting assets.",
    inputSchema: rmInputSchema,
  },
  {
    name: "brain_mv",
    description:
      "Move one existing archival cognition to a different concrete archival path while preserving its identity, current unresolved challenge, and appropriate learning continuity. Use this tool when the same cognition should continue at a different relative path, continuity scope, or cognitive role. Its document content is not rewritten. If `dst` already contains another cognition, that destination cognition is replaced, not merged. This tool does not move a Scope Core matching `@global/core.md`, `@project/core.md`, or `#*/core.md`, directories, or supporting assets.",
    inputSchema: mvInputSchema,
  },
  {
    name: "brain_feedback",
    description:
      "Record validated successful use or maintain the current unresolved challenge for one existing active archival cognition. Choose `adopt`, `question`, or `resolve` according to the `feedback` definitions. This tool changes only learning or challenge state; it does not edit the cognition document, `description`, `importance`, `path`, continuity scope, or cognitive role.",
    inputSchema: feedbackInputSchema,
  },
];

export const PUBLIC_BRAIN_TOOLS: readonly BrainToolDefinition[] = rawPublicBrainTools.map(
  (definition) => {
    const fields = BRAIN_TOOL_FIELDS[definition.name] ?? {};
    const schema = definition.inputSchema as z.ZodObject<Record<string, z.ZodTypeAny>>;
    const extension: Record<string, z.ZodTypeAny> = {};
    for (const [field, description] of Object.entries(fields)) {
      const original = schema.shape[field];
      if (original !== undefined) extension[field] = original.describe(description);
    }
    return {
      ...definition,
      description: BRAIN_TOOL_DESCRIPTIONS[definition.name] ?? definition.description,
      inputSchema: Object.keys(extension).length === 0 ? schema : schema.safeExtend(extension),
    };
  },
);

export function selectPublicBrainTools(
  features: BrainRuntimeFeatures = DEFAULT_BRAIN_RUNTIME_FEATURES,
): readonly BrainToolDefinition[] {
  return features.semanticSearch
    ? PUBLIC_BRAIN_TOOLS
    : PUBLIC_BRAIN_TOOLS.filter((definition) => definition.name !== "brain_ask_search");
}
