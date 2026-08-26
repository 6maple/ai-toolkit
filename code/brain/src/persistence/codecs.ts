import { createHash } from "node:crypto";

import { z } from "zod";

import type { ScopeCycleState } from "../brain/accessibility.ts";
import type { EpistemicState } from "../brain/epistemic.ts";

export type LogicalMarkdownText = string & { readonly __brand: "LogicalMarkdownText" };

export type CodecErrorCode =
  | "invalid-utf8"
  | "invalid-json"
  | "invalid-scope-state"
  | "invalid-companion-state";

export class CodecError extends Error {
  readonly code: CodecErrorCode;

  constructor(code: CodecErrorCode, options?: { cause?: unknown }) {
    super(`brain codec failed: ${code}`, options);
    this.name = "CodecError";
    this.code = code;
  }
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

function decodeUtf8Strict(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch (error) {
    throw new CodecError("invalid-utf8", { cause: error });
  }
}

function normalizeLogicalMarkdown(text: string): LogicalMarkdownText {
  let normalized = text.startsWith("\uFEFF") ? text.slice(1) : text;
  normalized = normalized.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return normalized as LogicalMarkdownText;
}

export function decodeMarkdown(bytes: Uint8Array): LogicalMarkdownText {
  return normalizeLogicalMarkdown(decodeUtf8Strict(bytes));
}

export function normalizeMarkdownInput(text: string): LogicalMarkdownText {
  return normalizeLogicalMarkdown(text);
}

export function encodeMarkdown(text: LogicalMarkdownText): Uint8Array {
  return utf8Encoder.encode(text);
}

const scopeStateRecordSchema = z.strictObject({
  cycle: z.number().int().nonnegative(),
});

const companionRecordSchema = z.strictObject({
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  challenge: z.string().optional(),
  ageCycles: z.number().int().nonnegative(),
  anchorCycle: z.number().int().nonnegative(),
  durability: z.number().finite().positive(),
  exposure: z.number().int().nonnegative(),
});

type CompanionRecord = z.infer<typeof companionRecordSchema>;

function parseJson(bytes: Uint8Array): unknown {
  const text = decodeUtf8Strict(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CodecError("invalid-json", { cause: error });
  }
}

export function decodeScopeState(bytes: Uint8Array): ScopeCycleState {
  const parsed = parseJson(bytes);
  const result = scopeStateRecordSchema.safeParse(parsed);
  if (!result.success) throw new CodecError("invalid-scope-state", { cause: result.error });
  return { cycle: result.data.cycle };
}

export function encodeScopeState(state: ScopeCycleState): Uint8Array {
  const result = scopeStateRecordSchema.safeParse(state);
  if (!result.success) throw new CodecError("invalid-scope-state", { cause: result.error });
  return utf8Encoder.encode(`${JSON.stringify({ cycle: result.data.cycle }, null, 2)}\n`);
}

export type MarkdownContentHash = string & { readonly __brand: "MarkdownContentHash" };

export function hashMarkdownContent(text: string): MarkdownContentHash {
  return createHash("sha256").update(text, "utf8").digest("hex") as MarkdownContentHash;
}

export interface CompanionAccessibilityState {
  readonly ageCycles: number;
  readonly anchorCycle: number;
  readonly durability: number;
  readonly exposure: number;
}

export interface DecodedCompanion {
  readonly contentHash: MarkdownContentHash;
  readonly epistemic: EpistemicState;
  readonly accessibility: CompanionAccessibilityState;
}

function validateCanonicalChallenge(record: CompanionRecord): void {
  if (record.challenge === undefined) return;
  if (record.challenge.length === 0 || record.challenge !== record.challenge.trim()) {
    throw new CodecError("invalid-companion-state");
  }
}

export function decodeCompanion(bytes: Uint8Array): DecodedCompanion {
  const parsed = parseJson(bytes);
  const result = companionRecordSchema.safeParse(parsed);
  if (!result.success) throw new CodecError("invalid-companion-state", { cause: result.error });
  validateCanonicalChallenge(result.data);

  return {
    contentHash: result.data.contentHash as MarkdownContentHash,
    epistemic: result.data.challenge === undefined ? {} : { challenge: result.data.challenge },
    accessibility: {
      ageCycles: result.data.ageCycles,
      anchorCycle: result.data.anchorCycle,
      durability: result.data.durability,
      exposure: result.data.exposure,
    },
  };
}

export function encodeCompanion(input: {
  readonly contentHash: MarkdownContentHash;
  readonly epistemic: EpistemicState;
  readonly accessibility: CompanionAccessibilityState;
}): Uint8Array {
  const record: CompanionRecord = {
    contentHash: input.contentHash,
    ...(input.epistemic.challenge === undefined ? {} : { challenge: input.epistemic.challenge }),
    ageCycles: input.accessibility.ageCycles,
    anchorCycle: input.accessibility.anchorCycle,
    durability: input.accessibility.durability,
    exposure: input.accessibility.exposure,
  };
  const result = companionRecordSchema.safeParse(record);
  if (!result.success) throw new CodecError("invalid-companion-state", { cause: result.error });
  validateCanonicalChallenge(result.data);

  const ordered = {
    contentHash: result.data.contentHash,
    ...(result.data.challenge === undefined ? {} : { challenge: result.data.challenge }),
    ageCycles: result.data.ageCycles,
    anchorCycle: result.data.anchorCycle,
    durability: result.data.durability,
    exposure: result.data.exposure,
  };
  return utf8Encoder.encode(`${JSON.stringify(ordered, null, 2)}\n`);
}
