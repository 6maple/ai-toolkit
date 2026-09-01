import picomatch from "picomatch";

import type { LogicalMarkdownText } from "../persistence/codecs.ts";
import {
  COGNITIVE_ROLES,
  formatPublicPath,
  type LogicalArchivalPath,
  type LogicalDirectory,
  type ScopeRef,
} from "./namespace.ts";

export const DISCOVERY_MAX_RECORDS = 64 as const;
export const DISCOVERY_MAX_RENDERED_UTF8_BYTES = 8192 as const;

export type DiscoveryQueryErrorCode =
  | "invalid-glob"
  | "invalid-regex"
  | "invalid-offset"
  | "invalid-limit"
  | "invalid-context";

export class DiscoveryQueryError extends Error {
  readonly code: DiscoveryQueryErrorCode;
  constructor(code: DiscoveryQueryErrorCode, options?: { cause?: unknown }) {
    super(`brain discovery query failed: ${code}`, options);
    this.name = "DiscoveryQueryError";
    this.code = code;
  }
}

export type DiscoveryObjectErrorCode = "not-found" | "wrong-object-kind";
export class DiscoveryObjectError extends Error {
  readonly code: DiscoveryObjectErrorCode;
  constructor(code: DiscoveryObjectErrorCode) {
    super(`brain discovery object failed: ${code}`);
    this.name = "DiscoveryObjectError";
    this.code = code;
  }
}

export class DiscoveryRenderError extends Error {
  readonly code = "render-safety-bound-exceeded" as const;
  constructor() {
    super("brain discovery render safety bound exceeded");
    this.name = "DiscoveryRenderError";
  }
}

export type PublicDiscoveryNode = LogicalDirectory | LogicalArchivalPath;

export type DiscoveryNodeRecord =
  | { readonly kind: "directory"; readonly path: LogicalDirectory }
  | {
      readonly kind: "archival";
      readonly path: LogicalArchivalPath;
      readonly summary: string;
      readonly status?: "questioned";
    };

export interface LogicalLineExcerpt {
  readonly lineNumber: number;
  readonly text: string;
}

export interface GrepMatchRecord {
  readonly path: LogicalArchivalPath;
  readonly summary: string;
  readonly status?: "questioned";
  readonly lineNumber: number;
  readonly lineText: string;
  readonly contextBefore: readonly LogicalLineExcerpt[];
  readonly contextAfter: readonly LogicalLineExcerpt[];
}

export interface CatPage {
  readonly path: LogicalArchivalPath;
  readonly startLine: number;
  readonly lines: readonly string[];
  readonly nextOffset?: number;
  readonly status?: "questioned";
  readonly challenge?: string;
  readonly safetyTruncated: boolean;
  readonly blockedLineNumber?: number;
  readonly blockedLineUtf8Bytes?: number;
}

export interface PackedRecords<T> {
  readonly records: readonly T[];
  readonly truncated: boolean;
  readonly renderedText: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sameScope(a: ScopeRef, b: ScopeRef): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "session" || (b.kind === "session" && a.sessionId === b.sessionId);
}

function nodeKey(node: PublicDiscoveryNode): string {
  return formatPublicPath(node);
}

export function buildScopeDiscoveryNamespace(
  scope: ScopeRef,
  archivalPaths: readonly LogicalArchivalPath[],
): readonly PublicDiscoveryNode[] {
  const nodes = new Map<string, PublicDiscoveryNode>();
  const add = (node: PublicDiscoveryNode) => nodes.set(nodeKey(node), node);

  add({ kind: "directory", area: "memories-root", scope });
  for (const role of COGNITIVE_ROLES) add({ kind: "directory", area: "role-root", scope, role });

  for (const item of archivalPaths) {
    if (!sameScope(item.scope, scope)) continue;
    const directorySegments = item.itemSegments.slice(0, -1);
    for (let length = 1; length <= directorySegments.length; length++) {
      add({
        kind: "directory",
        area: "nested",
        scope,
        role: item.role,
        segments: directorySegments.slice(0, length) as [string, ...string[]],
      });
    }
    add(item);
  }

  return [...nodes.values()].sort((a, b) => compareText(nodeKey(a), nodeKey(b)));
}

function directoryContainsDirectory(parent: LogicalDirectory, child: LogicalDirectory): boolean {
  if (!sameScope(parent.scope, child.scope)) return false;
  if (parent.area === "memories-root") return child.area === "role-root";
  if (parent.area === "role-root") {
    return child.area === "nested" && child.role === parent.role && child.segments.length === 1;
  }
  if (child.area !== "nested" || child.role !== parent.role) return false;
  if (child.segments.length !== parent.segments.length + 1) return false;
  return parent.segments.every((segment, index) => child.segments[index] === segment);
}

function directoryContainsArchival(parent: LogicalDirectory, child: LogicalArchivalPath): boolean {
  if (!sameScope(parent.scope, child.scope)) return false;
  if (parent.area === "memories-root") return false;
  if (child.role !== parent.role) return false;
  const parentSegments = parent.area === "role-root" ? [] : parent.segments;
  if (child.itemSegments.length !== parentSegments.length + 1) return false;
  return parentSegments.every((segment, index) => child.itemSegments[index] === segment);
}

export function directChildren(
  directory: LogicalDirectory,
  namespace: readonly PublicDiscoveryNode[],
): readonly PublicDiscoveryNode[] {
  return namespace.filter((node) =>
    node.kind === "directory"
      ? directoryContainsDirectory(directory, node)
      : directoryContainsArchival(directory, node),
  );
}

export function isArchivalUnderDirectory(
  item: LogicalArchivalPath,
  directory: LogicalDirectory,
): boolean {
  if (!sameScope(item.scope, directory.scope)) return false;
  if (directory.area === "memories-root") return true;
  if (item.role !== directory.role) return false;
  if (directory.area === "role-root") return true;
  if (item.itemSegments.length <= directory.segments.length) return false;
  return directory.segments.every((segment, index) => item.itemSegments[index] === segment);
}

export function splitLogicalLines(text: LogicalMarkdownText): readonly string[] {
  if (text === "") return [];
  const parts = text.split("\n");
  if (text.endsWith("\n")) parts.pop();
  return parts;
}

function isSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value);
}

export function normalizeCatArguments(offset = 1, limit = 100): { offset: number; limit: number } {
  if (!isSafeInteger(offset) || offset <= 0) throw new DiscoveryQueryError("invalid-offset");
  if (!isSafeInteger(limit) || limit <= 0) throw new DiscoveryQueryError("invalid-limit");
  return { offset, limit };
}

export function normalizeGrepArguments(context = 0): { context: number } {
  if (!isSafeInteger(context) || context < 0) throw new DiscoveryQueryError("invalid-context");
  return { context };
}

export function compilePublicGlob(pattern: string): (publicPath: string) => boolean {
  try {
    const matcher = picomatch(pattern, {
      nobrace: true,
      noext: true,
      nonegate: true,
      strictBrackets: true,
      windows: false,
    });
    return (publicPath) => matcher(publicPath);
  } catch (error) {
    throw new DiscoveryQueryError("invalid-glob", { cause: error });
  }
}

function clipUtf8(value: string, maxBytes: number): { text: string; clipped: boolean } {
  if (utf8ByteLength(value) <= maxBytes) return { text: value, clipped: false };
  const suffix = "? [clipped]";
  const points = Array.from(value);
  let low = 0;
  let high = points.length;
  let best = suffix;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${points.slice(0, mid).join("")}${suffix}`;
    if (utf8ByteLength(candidate) <= maxBytes) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { text: best, clipped: true };
}

export function renderDiscoveryRecord(record: DiscoveryNodeRecord): string {
  if (record.kind === "directory") return `${formatPublicPath(record.path)}\tkind=directory`;
  const summary = clipUtf8(record.summary, 2048);
  const status = record.status === "questioned" ? "\tstatus=questioned" : "";
  const clipped = summary.clipped ? "\tsummary_clipped=true" : "";
  return `${formatPublicPath(record.path)}\tsummary=${summary.text}${status}${clipped}`;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function recordsFit<T>(
  records: readonly T[],
  renderer: (record: T) => string,
  trailer = "",
): boolean {
  if (records.length > DISCOVERY_MAX_RECORDS) return false;
  const rendered = [...records.map(renderer), ...(trailer ? [trailer] : [])].join("\n");
  return utf8ByteLength(rendered) <= DISCOVERY_MAX_RENDERED_UTF8_BYTES;
}

export function packDiscoveryRecords<T>(
  records: readonly T[],
  renderer: (record: T) => string,
  trailerWhenTruncated: string,
): PackedRecords<T> {
  const selected: T[] = [];
  for (const record of records) {
    if (selected.length >= DISCOVERY_MAX_RECORDS) break;
    const candidate = [...selected, record];
    const hasMore = candidate.length < records.length;
    const trailer = hasMore ? trailerWhenTruncated : "";
    const rendered = [...candidate.map(renderer), ...(trailer ? [trailer] : [])].join("\n");
    if (utf8ByteLength(rendered) > DISCOVERY_MAX_RENDERED_UTF8_BYTES) break;
    selected.push(record);
  }
  const truncated = selected.length < records.length;
  if (truncated && selected.length === 0 && records.length > 0) {
    throw new DiscoveryRenderError();
  }
  const renderedText = [
    ...selected.map(renderer),
    ...(truncated && trailerWhenTruncated ? [trailerWhenTruncated] : []),
  ].join("\n");
  return { records: selected, truncated, renderedText };
}

export function canonicalDiscoveryRecordOrder(
  records: readonly DiscoveryNodeRecord[],
): readonly DiscoveryNodeRecord[] {
  const directories = records
    .filter(
      (record): record is Extract<DiscoveryNodeRecord, { kind: "directory" }> =>
        record.kind === "directory",
    )
    .sort((a, b) => compareText(formatPublicPath(a.path), formatPublicPath(b.path)));
  const archival = records
    .filter(
      (record): record is Extract<DiscoveryNodeRecord, { kind: "archival" }> =>
        record.kind === "archival",
    )
    .sort((a, b) => compareText(formatPublicPath(a.path), formatPublicPath(b.path)));
  return [...directories, ...archival];
}

export function canonicalGrepOrder(
  records: readonly GrepMatchRecord[],
): readonly GrepMatchRecord[] {
  return [...records].sort((a, b) => {
    const byPath = compareText(formatPublicPath(a.path), formatPublicPath(b.path));
    return byPath !== 0 ? byPath : a.lineNumber - b.lineNumber;
  });
}

export function contextForLine(
  lines: readonly string[],
  lineNumber: number,
  context: number,
): { before: readonly LogicalLineExcerpt[]; after: readonly LogicalLineExcerpt[] } {
  const index = lineNumber - 1;
  const beforeStart = Math.max(0, index - context);
  const before = lines.slice(beforeStart, index).map((text, offset) => ({
    lineNumber: beforeStart + offset + 1,
    text,
  }));
  const after = lines.slice(index + 1, index + 1 + context).map((text, offset) => ({
    lineNumber: index + offset + 2,
    text,
  }));
  return { before, after };
}

export function renderGrepRecord(record: GrepMatchRecord): string {
  return renderGrepRecords([record]);
}

export function renderGrepRecords(records: readonly GrepMatchRecord[]): string {
  const groups = new Map<
    string,
    { header: GrepMatchRecord; lines: Map<number, { marker: ":" | "-"; text: string }> }
  >();
  for (const record of records) {
    const key = formatPublicPath(record.path);
    let group = groups.get(key);
    if (group === undefined) {
      group = { header: record, lines: new Map() };
      groups.set(key, group);
    }
    for (const line of record.contextBefore) {
      if (!group.lines.has(line.lineNumber))
        group.lines.set(line.lineNumber, { marker: "-", text: line.text });
    }
    group.lines.set(record.lineNumber, { marker: ":", text: record.lineText });
    for (const line of record.contextAfter) {
      if (!group.lines.has(line.lineNumber))
        group.lines.set(line.lineNumber, { marker: "-", text: line.text });
    }
  }

  const renderedGroups: string[] = [];
  for (const group of groups.values()) {
    const summary = clipUtf8(group.header.summary, 1536);
    const header = [
      formatPublicPath(group.header.path),
      `summary: ${summary.text}`,
      ...(summary.clipped ? ["summary_clipped=true"] : []),
      ...(group.header.status === "questioned" ? ["status: questioned"] : []),
    ];
    const lines = [...group.lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([lineNumber, value]) => {
        const excerpt = clipUtf8(value.text, value.marker === ":" ? 2048 : 1024);
        return `${lineNumber}${value.marker} ${excerpt.text}${excerpt.clipped ? " [excerpt clipped]" : ""}`;
      });
    renderedGroups.push([...header, ...lines].join("\n"));
  }
  return renderedGroups.join("\n\n");
}

export function grepRecordsFit(records: readonly GrepMatchRecord[]): boolean {
  return (
    records.length <= DISCOVERY_MAX_RECORDS &&
    utf8ByteLength(renderGrepRecords(records)) <= DISCOVERY_MAX_RENDERED_UTF8_BYTES
  );
}

export function packGrepRecords(records: readonly GrepMatchRecord[]): {
  records: readonly GrepMatchRecord[];
  truncated: boolean;
} {
  const selected: GrepMatchRecord[] = [];
  for (const record of records) {
    if (selected.length >= DISCOVERY_MAX_RECORDS) break;
    const candidate = [...selected, record];
    if (utf8ByteLength(renderGrepRecords(candidate)) > DISCOVERY_MAX_RENDERED_UTF8_BYTES) break;
    selected.push(record);
  }
  if (selected.length === 0 && records.length > 0) throw new DiscoveryRenderError();
  return { records: selected, truncated: selected.length < records.length };
}

function renderCatCandidate(
  path: LogicalArchivalPath,
  startLine: number,
  lines: readonly string[],
  status?: "questioned",
  challenge?: string,
  clipped = false,
): string {
  const header = [
    `path: ${formatPublicPath(path)}`,
    ...(status === "questioned" ? ["status: questioned"] : []),
    ...(challenge === undefined ? [] : [`challenge: ${challenge}`]),
    ...(clipped ? ["safety_truncated=true"] : []),
  ];
  const body = lines.map((line, index) => `${startLine + index}: ${line}`);
  return [...header, ...body].join("\n");
}

export function buildCatPageFromPiRead(
  path: LogicalArchivalPath,
  text: LogicalMarkdownText,
  offset: number,
  limit: number,
  piRead: {
    readonly outputLines: number;
    readonly truncated: boolean;
    readonly firstLineExceedsLimit: boolean;
  },
  status?: "questioned",
  challenge?: string,
): CatPage {
  const args = normalizeCatArguments(offset, limit);
  const allLines = splitLogicalLines(text);
  const startIndex = args.offset - 1;
  const requested = allLines.slice(startIndex, startIndex + args.limit);
  if (requested.length === 0) {
    return { path, startLine: args.offset, lines: [], status, challenge, safetyTruncated: false };
  }
  if (piRead.firstLineExceedsLimit || piRead.outputLines === 0) {
    return {
      path,
      startLine: args.offset,
      lines: [],
      status,
      challenge,
      safetyTruncated: true,
      blockedLineNumber: args.offset,
      blockedLineUtf8Bytes: utf8ByteLength(requested[0]!),
    };
  }
  const selected = requested.slice(0, Math.min(requested.length, piRead.outputLines));
  const consumed = selected.length;
  const nextOffset = startIndex + consumed < allLines.length ? args.offset + consumed : undefined;
  return {
    path,
    startLine: args.offset,
    lines: selected,
    nextOffset,
    status,
    challenge,
    safetyTruncated: piRead.truncated,
  };
}

export function renderCatPage(page: CatPage): string {
  const rendered = renderCatCandidate(
    page.path,
    page.startLine,
    page.lines,
    page.status,
    page.challenge,
    page.safetyTruncated,
  );
  if (page.blockedLineNumber === undefined) {
    if (page.nextOffset === undefined) return rendered;
    return [
      rendered,
      `next_offset: ${page.nextOffset}`,
      `continue_with: brain_cat(path=${formatPublicPath(page.path)}, offset=${page.nextOffset})`,
    ].join("\n");
  }
  return [
    rendered,
    `line ${page.blockedLineNumber} cannot be returned exactly: the complete logical line is ${page.blockedLineUtf8Bytes ?? "unknown"} UTF-8 bytes and exceeds the brain_cat transport budget`,
    `continue with brain_absolute_path(path=${formatPublicPath(page.path)}) and use the host filesystem read capability for that file`,
  ].join("\n");
}
