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

export function renderAnchorCandidateItem(candidate: AnchorCandidateProjection): string {
  const status = candidate.status === undefined ? "" : ` status="${candidate.status}"`;
  return `<memory_candidate_item path="${escapeXmlAttribute(formatPublicPath(candidate.path))}" summary="${escapeXmlAttribute(candidate.summary)}"${status} />`;
}

function rootsValue(sessionId?: SessionId): string {
  return sessionId === undefined
    ? "{@project,@global}"
    : `{@session/${escapeXmlAttribute(sessionId)},@project,@global}`;
}

function renderNamespace(sessionId?: SessionId): string {
  const lines = [
    `  <brain_namespace continuity_roots="${rootsValue(sessionId)}" root_encodes="The contexts across which cognition is intended to carry forward.">`,
  ];
  if (sessionId !== undefined) {
    lines.push(
      `    <path_rule match="@session/${escapeXmlAttribute(sessionId)}/**" continuity_scope="This session only." />`,
    );
  }
  lines.push(
    '    <path_rule match="@project/**" continuity_scope="This project, across sessions." />',
    '    <path_rule match="@global/**" continuity_scope="Across projects and sessions." />',
    "  </brain_namespace>",
  );
  return lines.join("\n");
}

interface CoreGuidance {
  readonly updateWhen: string;
  readonly updateWith: string;
  readonly archiveWhen: string;
  readonly archiveWith: string;
}

function coreGuidance(core: AnchorCoreProjection): CoreGuidance {
  switch (core.scope.kind) {
    case "global":
      return {
        updateWhen:
          "The cross-project cognition that should remain resident is added, materially updated, or removed.",
        updateWith:
          "Use `brain_edit` to replace @global/core.md with the complete updated core document.",
        archiveWhen:
          "Cognition should remain preserved and available across projects but no longer needs to be resident on every turn.",
        archiveWith:
          "First use `brain_write` to preserve it at a concrete @global/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md path matching its cognitive role, then use `brain_edit` to replace @global/core.md with the complete core document after removing it.",
      };
    case "project":
      return {
        updateWhen:
          "Cognition scoped to this project that should remain resident across its sessions is added, materially updated, or removed.",
        updateWith:
          "Use `brain_edit` to replace @project/core.md with the complete updated core document.",
        archiveWhen:
          "Cognition should remain preserved and available in this project but no longer needs to be resident on every turn.",
        archiveWith:
          "First use `brain_write` to preserve it at a concrete @project/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md path matching its cognitive role, then use `brain_edit` to replace @project/core.md with the complete core document after removing it.",
      };
    case "session": {
      const root = `@session/${core.scope.sessionId}`;
      return {
        updateWhen:
          "Session-scoped cognition that should remain resident for subsequent turns is added, materially updated, or removed. Typical examples include the active goal, current progress, commitments, unresolved work, or intended next step.",
        updateWith: `Use \`brain_edit\` to replace ${root}/core.md with the complete updated core document.`,
        archiveWhen:
          "Cognition should remain preserved and available in this session but no longer needs to be resident on every turn.",
        archiveWith: `First use \`brain_write\` to preserve it at a concrete ${root}/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md path matching its cognitive role, then use \`brain_edit\` to replace ${root}/core.md with the complete core document after removing it.`,
      };
    }
  }
}

function renderCore(core: AnchorCoreProjection): string {
  const guidance = coreGuidance(core);
  const attrs = [
    `path="${escapeXmlAttribute(formatPublicPath(core.path))}"`,
    `update_when="${escapeXmlAttribute(guidance.updateWhen)}"`,
    `update_with="${escapeXmlAttribute(guidance.updateWith)}"`,
    `archive_when="${escapeXmlAttribute(guidance.archiveWhen)}"`,
    `archive_with="${escapeXmlAttribute(guidance.archiveWith)}"`,
  ].join(" ");
  const empty = core.text.length === 0 ? ' empty="true"' : "";
  return `    <core ${attrs}${empty}>\n${core.text}</core>`;
}

function renderCoreMemory(cores: readonly AnchorCoreProjection[]): string {
  const rendered = cores.map(renderCore).join("\n");
  return [
    '  <core_memory residency="Working cognition kept resident across turns within its continuity scope." restore_policy="Each core document is included in full inside its core element on every turn within that scope. Use non-empty content directly; `brain_cat` does not read core.md." empty_meaning="`empty=true` means the core exists and is intentionally empty, not omitted or truncated.">',
    rendered,
    "  </core_memory>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function roleRoots(sessionId?: SessionId): string {
  return rootsValue(sessionId);
}

function renderArchivalMemory(
  sessionId: SessionId | undefined,
  candidates: readonly AnchorCandidateProjection[],
): string {
  const roots = roleRoots(sessionId);
  const lines = [
    `  <archival_memory path_pattern="${roots}/memories/{decision,knowledge,intention,skill}/**/*.md" residency="Persistent cognition not restored on every turn, but available for recall within its continuity scope." preserve_when="Newly formed or materially updated cognition should remain available within its continuity scope because losing it could materially change future understanding, reasoning, decisions, or actions, but it does not need to remain resident on every turn." preserve_with="Use \`brain_write\` at a concrete path whose continuity root and cognitive-role directory match the cognition being preserved." maintenance_rule="If the same cognition already has an existing persistent owner, update that owner instead of creating a duplicate Brain item. A raw tool result, completed turn, or tool call alone is not a reason to persist cognition. If no durable cognition changed, do not mutate Brain.">`,
    '    <cognitive_role_rules directory_encodes="The directory immediately after memories/ encodes the cognitive role an item retains when restored: how it should participate in current understanding, reasoning, decisions, and actions when applicable. Restoration does not reduce it to generic background.">',
    `      <path_rule match="${roots}/memories/decision/**/*.md" role="An established choice that current work should continue from when applicable, unless materially revised, reversed, or superseded. It establishes the chosen direction or constraint, not that implementation or completion has occurred." />`,
    `      <path_rule match="${roots}/memories/knowledge/**/*.md" role="A fact, rule, constraint, or established understanding to use in current reasoning when its scope and conditions apply. Preserve the certainty it expresses and do not generalize it beyond what the item establishes." />`,
    `      <path_rule match="${roots}/memories/intention/**/*.md" role="An active goal or commitment to continue pursuing when applicable until it is fulfilled, cancelled, or replaced. It establishes work that remains intended, not that the work has been performed or completed." />`,
    `      <path_rule match="${roots}/memories/skill/**/*.md" role="A reusable method, procedure, or learned technique to apply when the current task matches its prerequisites and intended conditions. It guides how to act; prior examples or outcomes do not establish facts about the current task." />`,
    "    </cognitive_role_rules>",
    '    <memory_candidates purpose="A bounded, non-exhaustive set of archival cognition summaries surfaced as working context for this turn." when_to_use="Use a candidate when its summary is relevant to the latest user request or the cognition it represents may materially affect current understanding, reasoning, decisions, or actions." use_as="Use a sufficient summary directly according to the cognitive role encoded by its path, incorporating it into current understanding, reasoning, decisions, and actions it materially affects." inspect_only_when="The summary is insufficient for the current task, or its exact reasoning, qualifications, evidence, or details are needed." inspect_with="Use `brain_cat` on the candidate\'s concrete path." search_when="Cognition needed for the current task is not present in the surfaced candidates." search_with="Use `brain_glob` when the likely path, continuity root, cognitive role, or filename shape is known; use `brain_grep` when content clues are known. Start with the narrowest plausible path pattern and broaden only if needed." questioned_means="The item\'s cognitive role is preserved, but one or more material claims have unresolved uncertainty. This status does not by itself make the item false, irrelevant, cancelled, or superseded. Re-evaluate the affected claims against relevant evidence before relying on them.">',
  ];
  for (const candidate of candidates) lines.push(`      ${renderAnchorCandidateItem(candidate)}`);
  lines.push("    </memory_candidates>", "  </archival_memory>");
  return lines.join("\n");
}

export function renderAnchorContext(projection: AnchorProjection): string {
  const parts = [
    "# User-Requested Working Context",
    "",
    "The following brain_think_context is user-requested working context for this turn. The latest user message defines the current request. Use applicable cognition according to its meaning and cognitive role; do not treat it as optional background or reconstruct the same understanding from other sources alone.",
    "",
    '<brain_think_context context_role="Restored cognition that participates in the working context for this turn." form_current_understanding_from="Form current understanding from the latest user message, applicable restored cognition, and relevant evidence together." update_cognition_when="Update only cognition that the latest user message or relevant evidence materially confirms, refines, contradicts, fulfills, cancels, or replaces. Carry forward other applicable cognition; another source\'s silence does not change it." preserve_cognitive_semantics="Keep each cognition\'s meaning, certainty, commitment, and role unless materially updated. A proposal or hypothesis does not become a fact or decision because it was stored or recalled. An intention remains active until fulfilled, cancelled, or replaced.">',
    renderNamespace(projection.currentSessionId),
    renderCoreMemory(projection.cores),
    renderArchivalMemory(projection.currentSessionId, projection.candidates),
    "</brain_think_context>",
  ];
  return `${parts.join("\n")}\n`;
}
