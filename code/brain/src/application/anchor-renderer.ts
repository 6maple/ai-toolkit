import {
  formatPublicPath,
  type LogicalArchivalPath,
  type LogicalCorePath,
  type ScopeRef,
  type SessionId,
} from "../brain/namespace.ts";
import type { LogicalMarkdownText } from "../persistence/codecs.ts";

export interface AnchorCoreProjection {
  readonly scope: ScopeRef;
  readonly path: LogicalCorePath;
  readonly text: LogicalMarkdownText;
}

export interface AnchorCandidateProjection {
  readonly path: LogicalArchivalPath;
  readonly summary: string;
  readonly status?: "questioned";
}

export interface RelatedProjectProjection {
  readonly alias: string;
  readonly access: "read" | "write";
  readonly files: string;
  readonly corePath: string;
}

export interface RelatedProjectErrorProjection {
  readonly alias?: string;
  readonly code: string;
  readonly message: string;
}

export interface RelatedProjectWarningProjection {
  readonly code: string;
  readonly message: string;
}

export interface AnchorProjection {
  readonly currentSessionId?: SessionId;
  readonly cores: readonly AnchorCoreProjection[];
  readonly candidates: readonly AnchorCandidateProjection[];
  readonly relatedProjects?: readonly RelatedProjectProjection[];
  readonly relatedProjectWarnings?: readonly RelatedProjectWarningProjection[];
  readonly relatedProjectErrors?: readonly RelatedProjectErrorProjection[];
}

export function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\t", "&#9;")
    .replaceAll("\n", "&#10;")
    .replaceAll("\r", "&#13;");
}

export function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderAnchorCandidateItem(candidate: AnchorCandidateProjection): string {
  const status = candidate.status === undefined ? "" : ` status="${candidate.status}"`;
  return [
    `<recalled_cognition_summary path="${escapeXmlAttribute(formatPublicPath(candidate.path))}"${status}>`,
    escapeXmlText(candidate.summary),
    "</recalled_cognition_summary>",
  ].join("\n");
}

interface CorePresentation {
  readonly heading: string;
  readonly maintain: string;
  readonly archive: string;
}

function corePresentation(core: AnchorCoreProjection): CorePresentation {
  switch (core.scope.kind) {
    case "global":
      return {
        heading: "### Global Core",
        maintain:
          "Maintain this `<core>` with `brain_edit`. Use it for direct cross-project guidance that must remain available in every applicable turn, especially instructions that tell the AI when to read or apply global memories.",
        archive:
          "Put detailed cross-project cognition under `@global/memories/<role>/...` whenever this `<core>` can still correctly direct the AI to read or apply it; keep the trigger, path, or usage instruction here instead of copying the detail into `<core>`.",
      };
    case "project":
      return {
        heading: "### Project Core",
        maintain:
          "Maintain this `<core>` with `brain_edit`. Use it for direct project guidance that must remain available across this project's sessions, especially instructions that tell the AI when to read or apply project memories.",
        archive:
          "Put detailed project cognition under `@project/memories/<role>/...` whenever this `<core>` can still correctly direct the AI to read or apply it; keep the trigger, path, or usage instruction here instead of copying the detail into `<core>`.",
      };
    case "session": {
      const root = `@session/${core.scope.sessionId}`;
      return {
        heading: "### Session Core",
        maintain:
          "Maintain this `<core>` with `brain_edit`. Use it for direct session guidance that must remain available every turn, especially instructions that tell the AI when to read or apply session memories. Session state that truly must remain visible every turn may also stay here.",
        archive: `Put detailed session cognition under \`${root}/memories/<role>/...\` whenever this \`<core>\` can still correctly direct the AI to read or apply it; keep the trigger, path, usage instruction, or truly resident session state here instead of copying the detail into \`<core>\`.`,
      };
    }
  }
}

function renderCore(core: AnchorCoreProjection): string {
  const presentation = corePresentation(core);
  const empty = core.text.length === 0 ? ' empty="true"' : "";
  const body = core.text.length > 0 && !core.text.endsWith("\n") ? `${core.text}\n` : core.text;
  return [
    presentation.heading,
    "",
    `<core path="${escapeXmlAttribute(formatPublicPath(core.path))}"${empty}>`,
    `${body}</core>`,
    "",
    presentation.maintain,
    presentation.archive,
  ].join("\n");
}

function renderContinuityScopes(sessionId?: SessionId): string {
  const lines = [
    "## Continuity Scopes",
    "",
    "- `@global` contains cognition that should continue across projects and sessions.",
    "- `@project` contains cognition that should continue for the current project across sessions.",
  ];
  if (sessionId !== undefined) {
    lines.push(
      `- \`@session/${sessionId}\` contains cognition that should continue only in the current reliable session.`,
    );
  }
  return lines.join("\n");
}

function renderResidentCognition(cores: readonly AnchorCoreProjection[]): string {
  return [
    "## Resident Working Cognition",
    "",
    "Use each `<core>` for direct guidance that must remain available in every applicable turn, especially instructions that tell the AI when to read or apply specific memories. Put detailed cognition in `memories` whenever the AI can still be correctly guided from `<core>` to read or apply it when needed.",
    "",
    cores.map(renderCore).join("\n\n"),
  ].join("\n");
}

function renderRelatedProjects(
  projects: readonly RelatedProjectProjection[] = [],
  warnings: readonly RelatedProjectWarningProjection[] = [],
  errors: readonly RelatedProjectErrorProjection[] = [],
): string {
  if (projects.length === 0 && warnings.length === 0 && errors.length === 0) return "";
  const lines = ["## Related Projects", ""];
  if (projects.length > 0) {
    lines.push(
      "These projects have separate Brain cognition. Their core is not loaded automatically.",
      "A listing or mention alone does not trigger reading.",
      "",
    );
    for (const project of projects) {
      lines.push(
        `#${project.alias} [${project.access}]`,
        `- files: ${project.files}`,
        `  - before reading, changing, or analyzing a matching file: call \`brain_cat(\"${project.corePath}\")\` first`,
        `- before making a decision based on this project's code, design, configuration, or current state: call \`brain_cat(\"${project.corePath}\")\` first`,
        "- after reading the core: follow it, and complete anything it requires now before continuing",
        "",
      );
    }
  }
  if (warnings.length > 0) {
    if (projects.length > 0) lines.push("");
    lines.push("### Related Project Warnings", "");
    for (const warning of warnings) {
      lines.push(`${warning.code}: ${warning.message}`);
    }
  }
  if (errors.length > 0) {
    if (projects.length > 0 || warnings.length > 0) lines.push("");
    lines.push("### Related Project Errors", "");
    for (const error of errors) {
      lines.push(
        `${error.alias === undefined ? "related-project config" : `#${error.alias}`} - ${error.code}: ${error.message}`,
      );
    }
  }
  return lines.join("\n");
}

function renderArchivalCognition(candidates: readonly AnchorCandidateProjection[]): string {
  const recalled =
    candidates.length === 0
      ? "No archival cognition was recalled in this bounded set."
      : candidates.map(renderAnchorCandidateItem).join("\n\n");
  return [
    "## Archival Cognition",
    "",
    "Archival means that cognition is not resident in every turn. It does not mean stale, unimportant, uncertain, or lower authority.",
    "",
    "### Cognitive Roles",
    "",
    "#### Decision",
    "",
    "A choice that has already been made. Continue from it unless a later decision replaces or cancels it. Do not turn an implementation result, completion state, proposal, or hypothesis into a decision.",
    "",
    "#### Knowledge",
    "",
    "A fact, rule, constraint, or understanding, including its conditions and uncertainty. Use it as a premise within its scope and update it when relevant evidence changes it. Do not overgeneralize it or turn a decision or reusable method into knowledge.",
    "",
    "#### Intention",
    "",
    "A goal or commitment that remains intended until fulfilled, cancelled, or replaced. Continue from its outcome, progress, blockers, and remaining work. Do not turn completion evidence or a proposal into an active intention.",
    "",
    "#### Skill",
    "",
    "A reusable method together with its trigger and prerequisites. Apply its procedure, checks, stopping conditions, and fallback when appropriate. Do not turn current facts, a one-time decision, progress, or result into a skill. An agent method is not automatically a product requirement.",
    "",
    "## Recalled Archival Cognition Summaries",
    "",
    "Use these summaries to identify saved cognition relevant to the current task. Preserve the decisions, facts, intentions, and constraints they express according to each cognition's role. A summary is not necessarily the complete cognition.",
    "",
    recalled,
    "",
    "### Questioned Cognition",
    "",
    'A `status="questioned"` marker applies only to that `<recalled_cognition_summary>`. Preserve and use what remains established, while treating the current challenge as unresolved.',
    "",
    "### Read Content for Application",
    "",
    "When applying a method or relying on a cognition's conditions, reasoning, or evidence, use `brain_cat` to obtain the needed content before proceeding. Simple cognition fully expressed by its summary can be used directly. Do not reread content already available in the current context.",
    "",
    "### Find Cognition Not Shown Here",
    "",
    "Use `brain_glob` or `brain_grep` when needed cognition is not present in this bounded recalled set.",
  ].join("\n");
}

const HOW_TO_USE = [
  "## How to Use This Context",
  "",
  "The latest user message defines what is being requested now. The following `<brain_think_context>` contains cognition the user asked Brain to keep available for this turn.",
  "",
  "- Use applicable restored cognition directly when interpreting the request, choosing tools, acting, and answering. Do not treat it as optional background or reconstruct the same understanding from other sources alone.",
  "- Combine the latest user message, applicable restored cognition, and relevant new information to form the current understanding.",
  "- Keep each cognition's meaning and cognitive role. New information updates the cognition it actually addresses; it does not silently replace a different decision, intention, preference, constraint, commitment, fact, or method.",
].join("\n");

const PRESERVING_AND_MAINTAINING = [
  "## Preserving Cognition",
  "",
  "Carry forward cognition that is formed or changed and should remain available beyond the current turn.",
  "",
  "### Choose Where It Lives",
  "",
  "- Put cognition in the narrowest continuity scope that matches where it should continue: global, project, or session.",
  "- Put cognition in `core.md` when it should remain visible in every applicable turn.",
  "- Otherwise preserve it as archival cognition under the matching cognitive role.",
  "- A raw tool result, tool call, or completed turn is not by itself cognition to persist.",
  "- If no cognition that should carry forward was formed or changed, do not mutate Brain.",
  "",
  "## Maintaining Cognition",
  "",
  "- If an existing document is still the correct owner of the same cognition, update it with `brain_edit` rather than creating a duplicate.",
  "- “The same cognition” means the same fact or understanding, choice, commitment, or reusable method—not merely the same topic.",
  "- Use `brain_write` for a new archival cognition or an intentional full overwrite that does not preserve the prior cognition's learning continuity.",
  "- Use `brain_mv` when the same archival cognition moves to a different scope, role, or path while preserving identity and appropriate learning continuity.",
  "- Use `brain_rm` only when an active archival cognition should no longer remain in Brain.",
].join("\n");

export function renderAnchorContext(projection: AnchorProjection): string {
  return [
    "# User-Requested Working Context",
    "",
    HOW_TO_USE,
    "",
    "<brain_think_context>",
    "",
    renderContinuityScopes(projection.currentSessionId),
    "",
    renderResidentCognition(projection.cores),
    "",
    ...(renderRelatedProjects(
      projection.relatedProjects,
      projection.relatedProjectWarnings,
      projection.relatedProjectErrors,
    )
      ? [
          renderRelatedProjects(
            projection.relatedProjects,
            projection.relatedProjectWarnings,
            projection.relatedProjectErrors,
          ),
          "",
        ]
      : []),
    renderArchivalCognition(projection.candidates),
    "",
    PRESERVING_AND_MAINTAINING,
    "",
    "</brain_think_context>",
    "",
  ].join("\n");
}
