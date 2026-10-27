import {
  formatPublicPath,
  type LogicalArchivalPath,
  type LogicalCorePath,
  type ScopeRef,
} from "../brain/namespace.ts";
import {
  BRAIN_CONTEXT_PREFIX,
  BRAIN_DISCOVERY_COMMON,
  BRAIN_MAINTENANCE,
  BRAIN_NO_SEMANTIC_BRANCH,
  BRAIN_ROLES,
  BRAIN_SCOPE,
  BRAIN_SEMANTIC_BRANCH,
} from "../integration/model-facing-text.ts";
import type { LogicalMarkdownText } from "../persistence/codecs.ts";

export interface AnchorCoreProjection {
  readonly scope: ScopeRef;
  readonly path: LogicalCorePath;
  readonly text: LogicalMarkdownText;
}
export interface AnchorCandidateProjection {
  readonly path: LogicalArchivalPath;
  readonly description: string;
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
  readonly cores: readonly AnchorCoreProjection[];
  readonly candidates: readonly AnchorCandidateProjection[];
  readonly semanticSearchEnabled?: boolean;
  readonly relatedProjects?: readonly RelatedProjectProjection[];
  readonly relatedProjectWarnings?: readonly RelatedProjectWarningProjection[];
  readonly relatedProjectErrors?: readonly RelatedProjectErrorProjection[];
}

export interface ThinkWorkflowProjection {
  readonly source: string;
  readonly absolutePath: string;
  readonly text: string;
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
    `<recalled_cognition_description path="${escapeXmlAttribute(formatPublicPath(candidate.path))}"${status}>`,
    escapeXmlText(candidate.description),
    "</recalled_cognition_description>",
  ].join("\n");
}
function renderCore(core: AnchorCoreProjection): string {
  const empty = core.text.length === 0 ? ' empty="true"' : "";
  const body = core.text.length > 0 && !core.text.endsWith("\n") ? `${core.text}\n` : core.text;
  return `<core path="${escapeXmlAttribute(formatPublicPath(core.path))}"${empty}>\n${body}</core>`;
}
function renderRelatedProjects(projection: AnchorProjection): string {
  const projects = projection.relatedProjects ?? [];
  const warnings = projection.relatedProjectWarnings ?? [];
  const errors = projection.relatedProjectErrors ?? [];
  if (projects.length === 0 && warnings.length === 0 && errors.length === 0) return "";
  const sections: string[] = [];
  if (projects.length > 0)
    sections.push(
      [
        "### 相关项目",
        "相关项目 Core 不自动加载；以下为实际配置的路径、文件范围与权限。",
        "",
        ...projects.flatMap((item) => [
          `#${item.alias} [${item.access}]`,
          `- 文件范围：${item.files}`,
          `- Core：\`${item.corePath}\``,
          "",
        ]),
      ]
        .join("\n")
        .trimEnd(),
    );
  if (warnings.length > 0)
    sections.push(
      ["### 相关项目警告", ...warnings.map((item) => `${item.code}：${item.message}`)].join("\n"),
    );
  if (errors.length > 0)
    sections.push(
      [
        "### 相关项目错误",
        ...errors.map(
          (item) =>
            `${item.alias === undefined ? "相关项目配置" : item.alias}：${item.code}：${item.message}`,
        ),
      ].join("\n"),
    );
  return sections.join("\n\n");
}
export function renderAnchorContext(projection: AnchorProjection): string {
  const global = projection.cores.find((core) => core.scope.kind === "global");
  const project = projection.cores.find((core) => core.scope.kind === "project");
  if (global === undefined || project === undefined)
    throw new Error("Brain context requires Global and Project Core");
  const related = renderRelatedProjects(projection);
  const candidates =
    projection.candidates.length === 0
      ? "本轮有限候选集合为空。"
      : projection.candidates.map(renderAnchorCandidateItem).join("\n\n");
  return [
    BRAIN_CONTEXT_PREFIX,
    "",
    "## 本轮记忆上下文",
    "",
    "### Global Core",
    renderCore(global),
    "",
    "### Project Core",
    renderCore(project),
    ...(related.length === 0 ? [] : ["", related]),
    "",
    "### 本轮候选记忆",
    candidates,
    "",
    BRAIN_ROLES,
    "",
    BRAIN_MAINTENANCE,
    "",
    BRAIN_DISCOVERY_COMMON,
    "",
    projection.semanticSearchEnabled ? BRAIN_SEMANTIC_BRANCH : BRAIN_NO_SEMANTIC_BRANCH,
    "",
    BRAIN_SCOPE,
    "",
  ].join("\n");
}
