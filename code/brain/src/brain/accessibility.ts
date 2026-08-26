export interface ScopeCycleState {
  readonly cycle: number;
}

export interface AccessibilityPersistenceState {
  readonly ageCycles: number;
  readonly anchorCycle: number;
  readonly durability: number;
  readonly exposure: number;
}

export interface AccessibilityProjection {
  readonly currentAge: number;
  readonly retrievability: number;
}

export const INITIAL_DURABILITY = 1;
export const ADOPT_DURABILITY_GAIN = 1;

export type AccessibilityStateErrorCode =
  | "invalid-scope-cycle"
  | "invalid-accessibility-state"
  | "anchor-cycle-ahead"
  | "non-finite-derived-value";

export class AccessibilityStateError extends Error {
  readonly code: AccessibilityStateErrorCode;

  constructor(code: AccessibilityStateErrorCode) {
    super(`brain accessibility state failed: ${code}`);
    this.name = "AccessibilityStateError";
    this.code = code;
  }
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertScopeCycle(state: ScopeCycleState): void {
  if (!isNonNegativeSafeInteger(state.cycle)) {
    throw new AccessibilityStateError("invalid-scope-cycle");
  }
}

function assertAccessibilityState(state: AccessibilityPersistenceState): void {
  if (
    !isNonNegativeSafeInteger(state.ageCycles) ||
    !isNonNegativeSafeInteger(state.anchorCycle) ||
    !Number.isFinite(state.durability) ||
    state.durability <= 0 ||
    !isNonNegativeSafeInteger(state.exposure)
  ) {
    throw new AccessibilityStateError("invalid-accessibility-state");
  }
}

function assertFiniteNonNegative(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new AccessibilityStateError("non-finite-derived-value");
  }
}

export function initialScopeCycleState(): ScopeCycleState {
  return { cycle: 0 };
}

export function advanceScopeCycle(current: ScopeCycleState): ScopeCycleState {
  assertScopeCycle(current);
  const cycle = current.cycle + 1;
  if (!isNonNegativeSafeInteger(cycle)) {
    throw new AccessibilityStateError("invalid-scope-cycle");
  }
  return { cycle };
}

export function projectAccessibility(
  scopeState: ScopeCycleState,
  itemState: AccessibilityPersistenceState,
): AccessibilityProjection {
  assertScopeCycle(scopeState);
  assertAccessibilityState(itemState);
  if (itemState.anchorCycle > scopeState.cycle) {
    throw new AccessibilityStateError("anchor-cycle-ahead");
  }

  const currentAge = itemState.ageCycles + (scopeState.cycle - itemState.anchorCycle);
  if (!isNonNegativeSafeInteger(currentAge)) {
    throw new AccessibilityStateError("non-finite-derived-value");
  }
  const denominator = itemState.durability + currentAge;
  const retrievability = itemState.durability / denominator;

  assertFiniteNonNegative(denominator);
  if (!Number.isFinite(retrievability) || retrievability <= 0 || retrievability > 1) {
    throw new AccessibilityStateError("non-finite-derived-value");
  }

  return { currentAge, retrievability };
}

export function createFreshAccessibilityState(
  scopeState: ScopeCycleState,
): AccessibilityPersistenceState {
  assertScopeCycle(scopeState);
  return {
    ageCycles: 0,
    anchorCycle: scopeState.cycle,
    durability: INITIAL_DURABILITY,
    exposure: 0,
  };
}

export function applyExactRetrieval(
  scopeState: ScopeCycleState,
  current: AccessibilityPersistenceState,
): AccessibilityPersistenceState {
  projectAccessibility(scopeState, current);
  return {
    ageCycles: 0,
    anchorCycle: scopeState.cycle,
    durability: current.durability,
    exposure: 0,
  };
}

export function applyValidatedUse(
  scopeState: ScopeCycleState,
  current: AccessibilityPersistenceState,
): AccessibilityPersistenceState {
  projectAccessibility(scopeState, current);
  const durability = current.durability + ADOPT_DURABILITY_GAIN;
  if (!Number.isFinite(durability) || durability <= 0) {
    throw new AccessibilityStateError("non-finite-derived-value");
  }
  return {
    ageCycles: 0,
    anchorCycle: scopeState.cycle,
    durability,
    exposure: 0,
  };
}

export function applyPassiveExposure(
  scopeState: ScopeCycleState,
  current: AccessibilityPersistenceState,
): AccessibilityPersistenceState {
  projectAccessibility(scopeState, current);
  const exposure = current.exposure + 1;
  if (!isNonNegativeSafeInteger(exposure)) {
    throw new AccessibilityStateError("non-finite-derived-value");
  }
  return { ...current, exposure };
}

export function applyDirectEngagement(
  scopeState: ScopeCycleState,
  current: AccessibilityPersistenceState,
): AccessibilityPersistenceState {
  projectAccessibility(scopeState, current);
  return { ...current, exposure: 0 };
}

export function rebaseAcrossScope(
  sourceScopeState: ScopeCycleState,
  targetScopeState: ScopeCycleState,
  current: AccessibilityPersistenceState,
): AccessibilityPersistenceState {
  assertScopeCycle(targetScopeState);
  const sourceProjection = projectAccessibility(sourceScopeState, current);
  if (!isNonNegativeSafeInteger(sourceProjection.currentAge)) {
    throw new AccessibilityStateError("non-finite-derived-value");
  }
  return {
    ageCycles: sourceProjection.currentAge,
    anchorCycle: targetScopeState.cycle,
    durability: current.durability,
    exposure: 0,
  };
}
