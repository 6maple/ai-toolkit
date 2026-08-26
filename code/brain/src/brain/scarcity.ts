import type { Importance } from "./documents.ts";
import type { EpistemicStatus } from "./epistemic.ts";
import { formatPublicPath, type LogicalArchivalPath } from "./namespace.ts";
import type { AccessibilityProjection } from "./accessibility.ts";

export const IMPORTANCE_PROTECTION_FLOOR = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
} as const;

export interface ScarcityCandidate<T = unknown> {
  readonly path: LogicalArchivalPath;
  readonly importance: Importance;
  readonly epistemicStatus: EpistemicStatus;
  readonly accessibility: AccessibilityProjection;
  readonly exposure: number;
  readonly value: T;
}

export type ScarcitySelectionErrorCode =
  | "invalid-retrievability"
  | "invalid-exposure"
  | "duplicate-candidate-path"
  | "invalid-selection-state";

export class ScarcitySelectionError extends Error {
  readonly code: ScarcitySelectionErrorCode;

  constructor(code: ScarcitySelectionErrorCode) {
    super(`brain scarcity selection failed: ${code}`);
    this.name = "ScarcitySelectionError";
    this.code = code;
  }
}

function assertNever(_value: never): never {
  throw new ScarcitySelectionError("invalid-selection-state");
}

export function importanceProtectionFloor(importance: Importance): number {
  switch (importance) {
    case "low":
      return IMPORTANCE_PROTECTION_FLOOR.low;
    case "medium":
      return IMPORTANCE_PROTECTION_FLOOR.medium;
    case "high":
      return IMPORTANCE_PROTECTION_FLOOR.high;
    case "critical":
      return IMPORTANCE_PROTECTION_FLOOR.critical;
  }
  return assertNever(importance);
}

function validateCandidate(candidate: ScarcityCandidate<unknown>): void {
  const retrievability = candidate.accessibility.retrievability;
  if (!Number.isFinite(retrievability) || retrievability <= 0 || retrievability > 1) {
    throw new ScarcitySelectionError("invalid-retrievability");
  }
  if (
    !Number.isFinite(candidate.exposure) ||
    !Number.isInteger(candidate.exposure) ||
    candidate.exposure < 0
  ) {
    throw new ScarcitySelectionError("invalid-exposure");
  }
  if (!(candidate.importance in IMPORTANCE_PROTECTION_FLOOR)) {
    throw new ScarcitySelectionError("invalid-selection-state");
  }
  if (candidate.epistemicStatus !== "active" && candidate.epistemicStatus !== "questioned") {
    throw new ScarcitySelectionError("invalid-selection-state");
  }
  if (candidate.path.kind !== "archival") {
    throw new ScarcitySelectionError("invalid-selection-state");
  }
}

export function protection(candidate: ScarcityCandidate<unknown>): number {
  validateCandidate(candidate);
  return Math.max(
    candidate.accessibility.retrievability,
    importanceProtectionFloor(candidate.importance),
  );
}

function passivePressure(candidate: ScarcityCandidate<unknown>): number {
  validateCandidate(candidate);
  const questionedFactor = candidate.epistemicStatus === "questioned" ? 2 : 1;
  return (1 + candidate.exposure) * questionedFactor;
}

export function passiveL0Score(candidate: ScarcityCandidate<unknown>): number {
  return protection(candidate) / passivePressure(candidate);
}

export function activeDiscoveryScore(candidate: ScarcityCandidate<unknown>): number {
  return protection(candidate);
}

export function compareScoreDesc(a: number, b: number): number {
  if (a > b) return -1;
  if (a < b) return 1;
  return 0;
}

function compareCanonicalPath(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function comparePassiveL0Candidates<T>(
  a: ScarcityCandidate<T>,
  b: ScarcityCandidate<T>,
): number {
  validateCandidate(a);
  validateCandidate(b);
  const byScore = compareScoreDesc(passiveL0Score(a), passiveL0Score(b));
  if (byScore !== 0) return byScore;
  return compareCanonicalPath(formatPublicPath(a.path), formatPublicPath(b.path));
}

export function compareActiveDiscoveryCandidates<T>(
  a: ScarcityCandidate<T>,
  b: ScarcityCandidate<T>,
): number {
  validateCandidate(a);
  validateCandidate(b);
  const byScore = compareScoreDesc(activeDiscoveryScore(a), activeDiscoveryScore(b));
  if (byScore !== 0) return byScore;
  return compareCanonicalPath(formatPublicPath(a.path), formatPublicPath(b.path));
}

function validateUniqueCandidatePaths<T>(candidates: readonly ScarcityCandidate<T>[]): void {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    validateCandidate(candidate);
    const publicPath = formatPublicPath(candidate.path);
    if (seen.has(publicPath)) throw new ScarcitySelectionError("duplicate-candidate-path");
    seen.add(publicPath);
  }
}

export function rankPassiveL0Candidates<T>(
  candidates: readonly ScarcityCandidate<T>[],
): readonly ScarcityCandidate<T>[] {
  validateUniqueCandidatePaths(candidates);
  return [...candidates].sort(comparePassiveL0Candidates);
}

export function rankActiveDiscoveryCandidates<T>(
  candidates: readonly ScarcityCandidate<T>[],
): readonly ScarcityCandidate<T>[] {
  validateUniqueCandidatePaths(candidates);
  return [...candidates].sort(compareActiveDiscoveryCandidates);
}
