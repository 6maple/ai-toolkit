export type SessionId = string & { readonly __brand: "SessionId" };

export type ScopeRef =
  | { readonly kind: "global" }
  | { readonly kind: "project" }
  | { readonly kind: "session"; readonly sessionId: SessionId };

export const COGNITIVE_ROLES = ["decision", "knowledge", "intention", "skill"] as const;
export type CognitiveRole = (typeof COGNITIVE_ROLES)[number];

export type LogicalDirectory =
  | { readonly kind: "directory"; readonly area: "memories-root"; readonly scope: ScopeRef }
  | {
      readonly kind: "directory";
      readonly area: "role-root";
      readonly scope: ScopeRef;
      readonly role: CognitiveRole;
    }
  | {
      readonly kind: "directory";
      readonly area: "nested";
      readonly scope: ScopeRef;
      readonly role: CognitiveRole;
      readonly segments: readonly [string, ...string[]];
    };

export type LogicalCorePath = { readonly kind: "core"; readonly scope: ScopeRef };

export type LogicalArchivalPath = {
  readonly kind: "archival";
  readonly scope: ScopeRef;
  readonly role: CognitiveRole;
  readonly itemSegments: readonly [string, ...string[]];
};

export type LogicalBrainPath = LogicalDirectory | LogicalCorePath | LogicalArchivalPath;
export type LogicalGlobSearchRoot = LogicalDirectory;
export type LogicalGrepSearchRoot = LogicalDirectory;

export type LogicalResourceLocation = {
  readonly scope: ScopeRef;
  readonly relativeSegments: readonly string[];
};

export type NamespaceParseErrorCode =
  | "invalid-root"
  | "invalid-separator"
  | "invalid-session-id"
  | "invalid-role"
  | "traversal-segment"
  | "invalid-segment"
  | "invalid-object-shape";

export class NamespaceParseError extends Error {
  readonly code: NamespaceParseErrorCode;
  readonly publicPath?: string;

  constructor(code: NamespaceParseErrorCode, publicPath?: string) {
    super(`brain namespace parse failed: ${code}`);
    this.name = "NamespaceParseError";
    this.code = code;
    this.publicPath = publicPath;
  }
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function parseSessionId(raw: string): SessionId {
  if (!SESSION_ID_PATTERN.test(raw) || raw === "." || raw === "..") {
    throw new NamespaceParseError("invalid-session-id", raw);
  }
  return raw as SessionId;
}

function isCognitiveRole(value: string): value is CognitiveRole {
  return (COGNITIVE_ROLES as readonly string[]).includes(value);
}

function validatePathSegment(segment: string, raw: string): void {
  if (segment === "." || segment === "..") {
    throw new NamespaceParseError("traversal-segment", raw);
  }
  if (segment.length === 0 || segment.includes("/") || segment.includes("\\")) {
    throw new NamespaceParseError("invalid-segment", raw);
  }
}

function isArchivalBasename(segment: string): boolean {
  return segment.endsWith(".md") && segment.length > ".md".length;
}

function parseRoot(
  rawWithoutTrailingSlash: string,
  raw: string,
): {
  readonly scope: ScopeRef;
  readonly remaining: string[];
} {
  if (rawWithoutTrailingSlash === "@global") return { scope: { kind: "global" }, remaining: [] };
  if (rawWithoutTrailingSlash.startsWith("@global/")) {
    return {
      scope: { kind: "global" },
      remaining: rawWithoutTrailingSlash.slice("@global/".length).split("/"),
    };
  }

  if (rawWithoutTrailingSlash === "@project") return { scope: { kind: "project" }, remaining: [] };
  if (rawWithoutTrailingSlash.startsWith("@project/")) {
    return {
      scope: { kind: "project" },
      remaining: rawWithoutTrailingSlash.slice("@project/".length).split("/"),
    };
  }

  if (rawWithoutTrailingSlash.startsWith("@session/")) {
    const tail = rawWithoutTrailingSlash.slice("@session/".length);
    const segments = tail.split("/");
    const sessionIdRaw = segments.shift();
    if (!sessionIdRaw) throw new NamespaceParseError("invalid-session-id", raw);
    return {
      scope: { kind: "session", sessionId: parseSessionId(sessionIdRaw) },
      remaining: segments,
    };
  }

  throw new NamespaceParseError("invalid-root", raw);
}

export function parseResourceLocation(raw: string): LogicalResourceLocation {
  if (raw.includes("\\")) throw new NamespaceParseError("invalid-separator", raw);
  if (raw.includes("//")) throw new NamespaceParseError("invalid-segment", raw);

  const withoutTrailingSlash = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const { scope, remaining } = parseRoot(withoutTrailingSlash, raw);
  for (const segment of remaining) validatePathSegment(segment, raw);

  if (remaining.length === 0) return { scope, relativeSegments: [] };
  if (remaining[0] === "core.md") {
    if (remaining.length !== 1) throw new NamespaceParseError("invalid-object-shape", raw);
    return { scope, relativeSegments: ["core.md"] };
  }
  if (remaining[0] !== "memories") throw new NamespaceParseError("invalid-object-shape", raw);
  if (remaining.length >= 2 && !isCognitiveRole(remaining[1]!)) {
    throw new NamespaceParseError("invalid-role", raw);
  }
  return { scope, relativeSegments: remaining };
}

export function parsePublicPath(raw: string): LogicalBrainPath {
  if (raw.includes("\\")) throw new NamespaceParseError("invalid-separator", raw);
  if (raw.includes("//")) throw new NamespaceParseError("invalid-segment", raw);

  const hasTrailingSlash = raw.endsWith("/");
  const withoutTrailingSlash = hasTrailingSlash ? raw.slice(0, -1) : raw;
  const { scope, remaining } = parseRoot(withoutTrailingSlash, raw);

  if (remaining.length === 0) throw new NamespaceParseError("invalid-object-shape", raw);
  if (remaining.some((segment) => segment.length === 0)) {
    throw new NamespaceParseError("invalid-segment", raw);
  }

  if (remaining.length === 1 && remaining[0] === "core.md") {
    if (hasTrailingSlash) throw new NamespaceParseError("invalid-object-shape", raw);
    return { kind: "core", scope };
  }

  if (remaining[0] !== "memories") throw new NamespaceParseError("invalid-object-shape", raw);
  if (remaining.length === 1) return { kind: "directory", area: "memories-root", scope };

  const roleRaw = remaining[1]!;
  if (!isCognitiveRole(roleRaw)) throw new NamespaceParseError("invalid-role", raw);
  if (remaining.length === 2) return { kind: "directory", area: "role-root", scope, role: roleRaw };

  const rest = remaining.slice(2);
  for (const segment of rest) validatePathSegment(segment, raw);
  const last = rest.at(-1)!;

  if (last.endsWith(".md")) {
    if (!isArchivalBasename(last) || hasTrailingSlash) {
      throw new NamespaceParseError("invalid-object-shape", raw);
    }
    return {
      kind: "archival",
      scope,
      role: roleRaw,
      itemSegments: rest as [string, ...string[]],
    };
  }

  return {
    kind: "directory",
    area: "nested",
    scope,
    role: roleRaw,
    segments: rest as [string, ...string[]],
  };
}

export function formatScopePrefix(scope: ScopeRef): string {
  switch (scope.kind) {
    case "global":
      return "@global";
    case "project":
      return "@project";
    case "session":
      return `@session/${scope.sessionId}`;
  }
}

export function formatPublicPath(path: LogicalBrainPath): string {
  const root = formatScopePrefix(path.scope);
  switch (path.kind) {
    case "core":
      return `${root}/core.md`;
    case "archival":
      return `${root}/memories/${path.role}/${path.itemSegments.join("/")}`;
    case "directory":
      switch (path.area) {
        case "memories-root":
          return `${root}/memories/`;
        case "role-root":
          return `${root}/memories/${path.role}/`;
        case "nested":
          return `${root}/memories/${path.role}/${path.segments.join("/")}/`;
      }
  }
}

function isSameScope(a: ScopeRef, b: ScopeRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "session" && b.kind === "session") return a.sessionId === b.sessionId;
  return true;
}

function equalSegments(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function isSameLogicalPath(a: LogicalBrainPath, b: LogicalBrainPath): boolean {
  if (a.kind !== b.kind || !isSameScope(a.scope, b.scope)) return false;
  if (a.kind === "core" && b.kind === "core") return true;
  if (a.kind === "archival" && b.kind === "archival") {
    return a.role === b.role && equalSegments(a.itemSegments, b.itemSegments);
  }
  if (a.kind === "directory" && b.kind === "directory") {
    if (a.area !== b.area) return false;
    if (a.area === "memories-root" && b.area === "memories-root") return true;
    if (a.area === "role-root" && b.area === "role-root") return a.role === b.role;
    if (a.area === "nested" && b.area === "nested") {
      return a.role === b.role && equalSegments(a.segments, b.segments);
    }
  }
  return false;
}
