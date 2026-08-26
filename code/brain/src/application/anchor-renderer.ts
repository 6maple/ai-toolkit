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
    `  <brain_namespace roots="${rootsValue(sessionId)}" root_meaning="The root of a brain path states the future context in which that cognition should continue to apply.">`,
  ];
  if (sessionId !== undefined) {
    lines.push(
      `    <path_rule match="@session/${escapeXmlAttribute(sessionId)}/**" meaning="Applies within the current session." />`,
    );
  }
  lines.push(
    '    <path_rule match="@project/**" meaning="Applies across sessions in the current project." />',
    '    <path_rule match="@global/**" meaning="Applies across projects and future sessions." />',
    "  </brain_namespace>",
  );
  return lines.join("\n");
}

interface CoreGuidance {
  readonly maintainWhen: string;
  readonly maintainWith: string;
  readonly archiveWhen: string;
  readonly archiveWith: string;
}

function coreGuidance(core: AnchorCoreProjection): CoreGuidance {
  switch (core.scope.kind) {
    case "global":
      return {
        maintainWhen:
          "Cross-project working cognition changes and future work across projects should carry that change directly.",
        maintainWith:
          "Use `brain_edit` on @global/core.md with the updated complete core document.",
        archiveWhen:
          "Some cognition should remain remembered across projects but no longer needs to stay resident every turn.",
        archiveWith:
          "First use `brain_write` on @global/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md to preserve the archival cognition, then use `brain_edit` on @global/core.md to remove what no longer needs to remain resident.",
      };
    case "project":
      return {
        maintainWhen:
          "Project working cognition changes and future sessions in this project should carry that change directly.",
        maintainWith:
          "Use `brain_edit` on @project/core.md with the updated complete core document.",
        archiveWhen:
          "Some cognition should remain remembered in this project but no longer needs to stay resident every turn.",
        archiveWith:
          "First use `brain_write` on @project/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md to preserve the archival cognition, then use `brain_edit` on @project/core.md to remove what no longer needs to remain resident.",
      };
    case "session": {
      const root = `@session/${core.scope.sessionId}`;
      return {
        maintainWhen:
          "The current session's active goal, progress, commitments, unresolved work, or other resident working cognition changes and later turns in this session need that change to continue correctly.",
        maintainWith: `Use \`brain_edit\` on ${root}/core.md with the updated complete core document.`,
        archiveWhen:
          "Some cognition from this session should remain recoverable later in the session but no longer needs to stay resident every turn.",
        archiveWith: `First use \`brain_write\` on ${root}/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md to preserve the archival cognition, then use \`brain_edit\` on ${root}/core.md to remove what no longer needs to remain resident.`,
      };
    }
  }
}

function renderCore(core: AnchorCoreProjection): string {
  const guidance = coreGuidance(core);
  const attrs = [
    `path="${escapeXmlAttribute(formatPublicPath(core.path))}"`,
    `maintain_when="${escapeXmlAttribute(guidance.maintainWhen)}"`,
    `maintain_with="${escapeXmlAttribute(guidance.maintainWith)}"`,
    `archive_when="${escapeXmlAttribute(guidance.archiveWhen)}"`,
    `archive_with="${escapeXmlAttribute(guidance.archiveWith)}"`,
  ].join(" ");
  return `    <core ${attrs}>\n${core.text}</core>`;
}

function renderCoreMemory(cores: readonly AnchorCoreProjection[]): string {
  const rendered = cores.map(renderCore).join("\n");
  return [
    '  <core_memory purpose="Resident working cognition restored every applicable turn so ongoing work can continue without depending on archival retrieval.">',
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
    `  <archival_memory path_space="${roots}/memories/{decision,knowledge,intention,skill}/**/*.md" purpose="Persistent cognition that does not need to stay resident every turn and can be recalled when useful." remember_when="Preserve newly formed or materially updated cognition when forgetting it could materially change future reasoning or behavior, but it does not need to remain resident in core." remember_with="Use \`brain_write\` at a concrete path whose applicability root and cognitive-role directory match the cognition being preserved.">`,
    '    <cognitive_role_rules role_meaning="The directory after memories/ states how recalled cognition should participate in future reasoning or action.">',
    `      <path_rule match="${roots}/memories/decision/**/*.md" meaning="An established choice that future work should continue from while its basis remains valid." />`,
    `      <path_rule match="${roots}/memories/knowledge/**/*.md" meaning="A fact, rule, constraint, or established understanding to reason with when its conditions apply." />`,
    `      <path_rule match="${roots}/memories/intention/**/*.md" meaning="An active goal or commitment whose remaining work should continue until fulfilled, cancelled, or replaced." />`,
    `      <path_rule match="${roots}/memories/skill/**/*.md" meaning="A reusable method to apply when similar task conditions recur." />`,
    "    </cognitive_role_rules>",
    '    <memory_candidates purpose="Archival recall cues surfaced for this turn; being listed does not mean a memory is currently relevant or correct." choose="Use the current task to decide which summaries may materially affect the current judgment." inspect_when="A summary may materially affect the current judgment, or its exact reasoning, qualifications, evidence, or details matter." inspect_with="Use `brain_cat` on that item\'s concrete path." search_when="The prior cognition you need is not surfaced here." search_with="Use `brain_glob` when you remember its path/name shape, or `brain_grep` when you remember content clues; narrow or generalize the memory path patterns above to select the appropriate search space." questioned_status="An item marked `questioned` remains recallable, but its current cognition has unresolved epistemic uncertainty and should be re-evaluated before relying on it.">',
  ];
  for (const candidate of candidates) lines.push(`      ${renderAnchorCandidateItem(candidate)}`);
  lines.push("    </memory_candidates>", "  </archival_memory>");
  return lines.join("\n");
}

export function renderAnchorContext(projection: AnchorProjection): string {
  const parts = [
    '<brain_think_context purpose="Restore prior working context as the starting point for this turn." reconcile_with="The user\'s latest message and current evidence." update_rule="Update prior context where they change it; carry forward what remains valid." preserve_rule="Use remembered content with the same meaning, certainty, and commitment it had when formed.">',
    renderNamespace(projection.currentSessionId),
    renderCoreMemory(projection.cores),
    renderArchivalMemory(projection.currentSessionId, projection.candidates),
    "</brain_think_context>",
  ];
  return `${parts.join("\n")}\n`;
}
