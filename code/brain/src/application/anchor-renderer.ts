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

export interface AnchorProjection {
  readonly currentSessionId?: SessionId;
  readonly cores: readonly AnchorCoreProjection[];
  readonly candidates: readonly AnchorCandidateProjection[];
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
          "Maintain this `<core>` with `brain_edit` when cross-project cognition that should remain visible in every applicable turn changes, such as stable user preferences, principles, or reusable working constraints.",
        archive:
          "When cognition no longer needs to remain resident but should still be preserved globally, write it under `@global/memories/<role>/...` before removing it from this `<core>`.",
      };
    case "project":
      return {
        heading: "### Project Core",
        maintain:
          "Maintain this `<core>` with `brain_edit` when project-scoped cognition that should remain visible across this project's sessions changes, such as its active goals, established working agreements, constraints, or architectural direction.",
        archive:
          "When cognition no longer needs to remain resident but should still be preserved for this project, write it under `@project/memories/<role>/...` before removing it from this `<core>`.",
      };
    case "session": {
      const root = `@session/${core.scope.sessionId}`;
      return {
        heading: "### Session Core",
        maintain:
          "Maintain this `<core>` with `brain_edit` when session-scoped working cognition changes, including the active goal, current progress, commitments, unresolved work, or intended next step.",
        archive: `When cognition no longer needs to remain resident but should still be preserved for this session, write it under \`${root}/memories/<role>/...\` before removing it from this \`<core>\`.`,
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
  return ["## Resident Working Cognition", "", cores.map(renderCore).join("\n\n")].join("\n");
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
    renderArchivalCognition(projection.candidates),
    "",
    PRESERVING_AND_MAINTAINING,
    "",
    "</brain_think_context>",
    "",
  ].join("\n");
}
