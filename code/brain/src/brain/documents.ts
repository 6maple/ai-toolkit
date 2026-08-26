import { isMap, isScalar, parseDocument } from "yaml";

import type { LogicalMarkdownText } from "../persistence/codecs.ts";

export const IMPORTANCE_LEVELS = ["low", "medium", "high", "critical"] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

export interface CoreDocument {
  readonly kind: "core";
  readonly text: LogicalMarkdownText;
}

export interface ArchivalDocument {
  readonly kind: "archival";
  readonly text: LogicalMarkdownText;
  readonly summary: string;
  readonly importance: Importance;
  readonly body: string;
}

export interface FrontmatterEnvelope {
  readonly yamlSource: string;
  readonly body: string;
}

export type DocumentSchemaErrorCode =
  | "missing-frontmatter"
  | "unterminated-frontmatter"
  | "invalid-frontmatter-yaml"
  | "frontmatter-not-map"
  | "missing-summary"
  | "invalid-summary"
  | "missing-importance"
  | "invalid-importance";

export class DocumentSchemaError extends Error {
  readonly code: DocumentSchemaErrorCode;

  constructor(code: DocumentSchemaErrorCode) {
    super(`brain document schema failed: ${code}`);
    this.name = "DocumentSchemaError";
    this.code = code;
  }
}

export const CORE_DOC_MAX_CODE_POINTS = 4000 as const;

export class CoreCapacityError extends Error {
  readonly code = "core-capacity-exceeded" as const;
  readonly actualCodePoints: number;
  readonly maxCodePoints = CORE_DOC_MAX_CODE_POINTS;

  constructor(actualCodePoints: number) {
    super(`brain core capacity exceeded: ${actualCodePoints} > ${CORE_DOC_MAX_CODE_POINTS}`);
    this.name = "CoreCapacityError";
    this.actualCodePoints = actualCodePoints;
  }
}

function isImportance(value: string): value is Importance {
  return (IMPORTANCE_LEVELS as readonly string[]).includes(value);
}

export function extractFrontmatterEnvelope(text: LogicalMarkdownText): FrontmatterEnvelope {
  if (!text.startsWith("---\n")) throw new DocumentSchemaError("missing-frontmatter");

  let lineStart = 4;
  while (lineStart <= text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);

    if (line === "---") {
      const yamlSource = text.slice(4, lineStart);
      const body = newline === -1 ? "" : text.slice(newline + 1);
      return { yamlSource, body };
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }

  throw new DocumentSchemaError("unterminated-frontmatter");
}

export function parseArchivalDocument(text: LogicalMarkdownText): ArchivalDocument {
  const { yamlSource, body } = extractFrontmatterEnvelope(text);

  const yaml = parseDocument(yamlSource);
  if (yaml.errors.length > 0) throw new DocumentSchemaError("invalid-frontmatter-yaml");
  if (!isMap(yaml.contents)) throw new DocumentSchemaError("frontmatter-not-map");

  const summaryNode = yaml.get("summary", true);
  if (summaryNode === undefined) throw new DocumentSchemaError("missing-summary");
  if (!isScalar(summaryNode) || typeof summaryNode.value !== "string") {
    throw new DocumentSchemaError("invalid-summary");
  }
  const summary = summaryNode.value.trim();
  if (summary.length === 0) throw new DocumentSchemaError("invalid-summary");

  const importanceNode = yaml.get("importance", true);
  if (importanceNode === undefined) throw new DocumentSchemaError("missing-importance");
  if (!isScalar(importanceNode) || typeof importanceNode.value !== "string") {
    throw new DocumentSchemaError("invalid-importance");
  }
  if (!isImportance(importanceNode.value)) throw new DocumentSchemaError("invalid-importance");

  return {
    kind: "archival",
    text,
    summary,
    importance: importanceNode.value,
    body,
  };
}

export function validateCoreDocument(text: LogicalMarkdownText): CoreDocument {
  const actualCodePoints = Array.from(text).length;
  if (actualCodePoints > CORE_DOC_MAX_CODE_POINTS) throw new CoreCapacityError(actualCodePoints);
  return { kind: "core", text };
}
