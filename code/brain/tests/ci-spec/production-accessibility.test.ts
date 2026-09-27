import { describe, expect, it } from "vite-plus/test";

import {
  ADOPT_DURABILITY_GAIN,
  INITIAL_DURABILITY,
  AccessibilityStateError,
  advanceScopeCycle,
  applyDirectEngagement,
  applyExactRetrieval,
  applyPassiveExposure,
  applyValidatedUse,
  createFreshAccessibilityState,
  initialScopeCycleState,
  projectAccessibility,
  rebaseAcrossScope,
  type AccessibilityPersistenceState,
  type ScopeCycleState,
} from "../../src/brain/accessibility.ts";
import type { Importance } from "../../src/brain/documents.ts";
import type { EpistemicStatus } from "../../src/brain/epistemic.ts";
import { parsePublicPath, type LogicalArchivalPath } from "../../src/brain/namespace.ts";
import {
  IMPORTANCE_PROTECTION_FLOOR,
  activeDiscoveryScore,
  importanceProtectionFloor,
  passiveL0Score,
  protection,
  rankActiveDiscoveryCandidates,
  rankPassiveL0Candidates,
  type ScarcityCandidate,
} from "../../src/brain/scarcity.ts";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

function archival(raw: string): LogicalArchivalPath {
  const parsed = parsePublicPath(raw);
  if (parsed.kind !== "archival") throw new Error(`expected archival path: ${raw}`);
  return parsed;
}

function candidate(
  rawPath: string,
  options: {
    readonly retrievability?: number;
    readonly importance?: Importance;
    readonly exposure?: number;
    readonly status?: EpistemicStatus;
    readonly value?: string;
  } = {},
): ScarcityCandidate<string> {
  return {
    path: archival(rawPath),
    importance: options.importance ?? "low",
    epistemicStatus: options.status ?? "active",
    accessibility: {
      currentAge: 1,
      retrievability: options.retrievability ?? 0.5,
    },
    exposure: options.exposure ?? 0,
    value: options.value ?? rawPath,
  };
}

function expectRebaseContinuity(
  sourceCycle: ScopeCycleState,
  targetCycle: ScopeCycleState,
  state: AccessibilityPersistenceState,
): void {
  const before = projectAccessibility(sourceCycle, state);
  const rebased = rebaseAcrossScope(sourceCycle, targetCycle, state);
  const after = projectAccessibility(targetCycle, rebased);
  expect(after.currentAge).toBe(before.currentAge);
  expect(after.retrievability).toBeCloseTo(before.retrievability, 12);
  expect(rebased.ageCycles).toBe(before.currentAge);
  expect(Number.isInteger(rebased.ageCycles)).toBe(true);
  expect(rebased.durability).toBe(state.durability);
  expect(rebased.exposure).toBe(0);
  expect(rebased.anchorCycle).toBe(targetCycle.cycle);
}

describe("D1 accessibility", () => {
  it("starts cycle at zero and advances only by explicit cognition opportunity", () => {
    const initial = initialScopeCycleState();
    expect(initial).toEqual({ cycle: 0 });
    expect(advanceScopeCycle(initial)).toEqual({ cycle: 1 });
    expect(initial).toEqual({ cycle: 0 });
    expect(codeOf(() => advanceScopeCycle({ cycle: -1 }))).toBe("invalid-scope-cycle");
    expect(codeOf(() => advanceScopeCycle({ cycle: 0.5 }))).toBe("invalid-scope-cycle");
  });

  it("owns the frozen durability calibration without scope-specific decay constants", () => {
    expect(INITIAL_DURABILITY).toBe(1);
    expect(ADOPT_DURABILITY_GAIN).toBe(1);
  });

  it("projects fresh state to R=1 and currentAge=durability to R=0.5", () => {
    const scopeState = { cycle: 7 };
    const fresh = createFreshAccessibilityState(scopeState);
    expect(fresh).toEqual({ ageCycles: 0, anchorCycle: 7, durability: 1, exposure: 0 });
    expect(projectAccessibility(scopeState, fresh)).toEqual({ currentAge: 0, retrievability: 1 });
    expect(
      projectAccessibility(
        { cycle: 2 },
        { ageCycles: 0, anchorCycle: 0, durability: 2, exposure: 0 },
      ).retrievability,
    ).toBe(0.5);
  });

  it("uses the same cycle-space projection regardless of the caller scope", () => {
    const state = { ageCycles: 1, anchorCycle: 2, durability: 2, exposure: 0 };
    expect(projectAccessibility({ cycle: 5 }, state)).toEqual({
      currentAge: 4,
      retrievability: 1 / 3,
    });
  });

  it("decays monotonically with age and improves monotonically with durability", () => {
    const state = { ageCycles: 0, anchorCycle: 0, durability: 1, exposure: 0 };
    const r1 = projectAccessibility({ cycle: 1 }, state).retrievability;
    const r2 = projectAccessibility({ cycle: 2 }, state).retrievability;
    const stronger = projectAccessibility({ cycle: 2 }, { ...state, durability: 2 }).retrievability;
    expect(r2).toBeLessThan(r1);
    expect(stronger).toBeGreaterThan(r2);
  });

  it("fails loud on invalid coordinates instead of clamping or repairing", () => {
    expect(
      codeOf(() =>
        projectAccessibility(
          { cycle: 1 },
          { ageCycles: 0, anchorCycle: 2, durability: 1, exposure: 0 },
        ),
      ),
    ).toBe("anchor-cycle-ahead");
    for (const invalid of [
      { ageCycles: -1, anchorCycle: 0, durability: 1, exposure: 0 },
      { ageCycles: 0.5, anchorCycle: 0, durability: 1, exposure: 0 },
      { ageCycles: 0, anchorCycle: 0, durability: 0, exposure: 0 },
      { ageCycles: 0, anchorCycle: 0, durability: 1, exposure: 0.5 },
    ]) {
      expect(codeOf(() => projectAccessibility({ cycle: 1 }, invalid))).toBe(
        "invalid-accessibility-state",
      );
    }
  });

  it("exact retrieval resets age/exposure and preserves durability", () => {
    const current = { ageCycles: 3, anchorCycle: 2, durability: 4, exposure: 5 };
    const next = applyExactRetrieval({ cycle: 7 }, current);
    expect(next).toEqual({ ageCycles: 0, anchorCycle: 7, durability: 4, exposure: 0 });
    expect(current).toEqual({ ageCycles: 3, anchorCycle: 2, durability: 4, exposure: 5 });
  });

  it("validated use resets age/exposure and adds one durability per event", () => {
    const current = { ageCycles: 3, anchorCycle: 2, durability: 1, exposure: 2 };
    const once = applyValidatedUse({ cycle: 5 }, current);
    const twice = applyValidatedUse({ cycle: 5 }, once);
    expect(once).toEqual({ ageCycles: 0, anchorCycle: 5, durability: 2, exposure: 0 });
    expect(twice).toEqual({ ageCycles: 0, anchorCycle: 5, durability: 3, exposure: 0 });
  });

  it("passive shown changes exposure only; direct engagement clears exposure only", () => {
    const current = { ageCycles: 3, anchorCycle: 2, durability: 4, exposure: 2 };
    const exposed = applyPassiveExposure({ cycle: 7 }, current);
    expect(exposed).toEqual({ ...current, exposure: 3 });
    expect(applyDirectEngagement({ cycle: 7 }, exposed)).toEqual({ ...current, exposure: 0 });
  });

  it("rebases current integer age across arbitrary target cycle coordinates", () => {
    const current = { ageCycles: 2, anchorCycle: 3, durability: 2, exposure: 7 };
    expectRebaseContinuity({ cycle: 8 }, { cycle: 100 }, current);
    expectRebaseContinuity({ cycle: 8 }, { cycle: 0 }, current);
    expectRebaseContinuity({ cycle: 8 }, { cycle: 17 }, current);
  });

  it("rejects fractional age instead of creating fractional rebase state", () => {
    expect(() =>
      rebaseAcrossScope(
        { cycle: 1 },
        { cycle: 9 },
        { ageCycles: 0.5, anchorCycle: 0, durability: 1, exposure: 0 },
      ),
    ).toThrow(AccessibilityStateError);
  });
});

describe("D2 scarcity", () => {
  it("maps the frozen importance floors exhaustively", () => {
    expect(IMPORTANCE_PROTECTION_FLOOR).toEqual({
      low: 0.25,
      medium: 0.5,
      high: 0.75,
      critical: 1,
    });
    expect(importanceProtectionFloor("low")).toBe(0.25);
    expect(importanceProtectionFloor("medium")).toBe(0.5);
    expect(importanceProtectionFloor("high")).toBe(0.75);
    expect(importanceProtectionFloor("critical")).toBe(1);
  });

  it("uses one symmetric monotonic protection=max(R,I)", () => {
    expect(
      protection(
        candidate("@project/memories/knowledge/a.md", {
          retrievability: 0.75,
          importance: "medium",
        }),
      ),
    ).toBe(0.75);
    expect(
      protection(
        candidate("@project/memories/knowledge/b.md", { retrievability: 0.5, importance: "high" }),
      ),
    ).toBe(0.75);

    for (const r of [0.1, 0.3, 0.6, 0.9]) {
      const low = protection(
        candidate("@project/memories/knowledge/a.md", { retrievability: r, importance: "low" }),
      );
      const high = protection(
        candidate("@project/memories/knowledge/a.md", { retrievability: r, importance: "high" }),
      );
      expect(high).toBeGreaterThanOrEqual(low);
    }
  });

  it("does not reward the lower dimension when the same max protection already ties", () => {
    const low = candidate("@project/memories/knowledge/low.md", {
      retrievability: 0.8,
      importance: "low",
    });
    const high = candidate("@project/memories/knowledge/high.md", {
      retrievability: 0.8,
      importance: "high",
    });
    expect(protection(low)).toBe(0.8);
    expect(protection(high)).toBe(0.8);
    expect(rankActiveDiscoveryCandidates([low, high]).map((x) => x.value)).toEqual([
      high.value,
      low.value,
    ]);
    // Equal score falls back to canonical path, not hidden secondary protection.
    expect(high.path.itemSegments.at(-1)).toBe("high.md");
  });

  it("applies exposure and questioned pressure only to passive L0", () => {
    const active0 = candidate("@project/memories/knowledge/a.md", { retrievability: 0.8 });
    const active1 = candidate("@project/memories/knowledge/a.md", {
      retrievability: 0.8,
      exposure: 1,
    });
    const questioned = candidate("@project/memories/knowledge/a.md", {
      retrievability: 0.8,
      status: "questioned",
    });
    expect(passiveL0Score(active0)).toBe(0.8);
    expect(passiveL0Score(active1)).toBe(0.4);
    expect(passiveL0Score(questioned)).toBe(0.4);
    expect(activeDiscoveryScore(active0)).toBe(activeDiscoveryScore(active1));
    expect(activeDiscoveryScore(active0)).toBe(activeDiscoveryScore(questioned));
  });

  it("allows critical cognition to yield under enough passive exposure and never hard-filters questioned items", () => {
    const critical = candidate("@project/memories/knowledge/critical.md", {
      retrievability: 0.1,
      importance: "critical",
      exposure: 4,
    });
    const ordinary = candidate("@project/memories/knowledge/ordinary.md", {
      retrievability: 0.8,
      importance: "high",
    });
    const questioned = candidate("@project/memories/knowledge/questioned.md", {
      retrievability: 1,
      importance: "critical",
      status: "questioned",
    });
    expect(rankPassiveL0Candidates([critical, ordinary])[0]).toBe(ordinary);
    expect(rankPassiveL0Candidates([ordinary, questioned])).toContain(questioned);
  });

  it("ignores exposure, questioned status and scope as active-discovery score inputs", () => {
    const global = candidate("@global/memories/knowledge/a.md", {
      retrievability: 0.7,
      importance: "medium",
      exposure: 20,
      status: "questioned",
    });
    const project = candidate("@project/memories/knowledge/a.md", {
      retrievability: 0.7,
      importance: "medium",
      exposure: 0,
      status: "active",
    });
    expect(activeDiscoveryScore(global)).toBe(activeDiscoveryScore(project));
  });

  it("uses canonical JS lexical path tie-break independent of input order", () => {
    const a = candidate("@project/memories/knowledge/a.md");
    const umlaut = candidate("@project/memories/knowledge/ä.md");
    expect(rankActiveDiscoveryCandidates([umlaut, a]).map((x) => x.value)).toEqual([
      a.value,
      umlaut.value,
    ]);
    expect(rankActiveDiscoveryCandidates([a, umlaut]).map((x) => x.value)).toEqual([
      a.value,
      umlaut.value,
    ]);
  });

  it("rejects duplicate paths and invalid selection state instead of clamping", () => {
    const a = candidate("@project/memories/knowledge/a.md");
    expect(codeOf(() => rankPassiveL0Candidates([a, { ...a, value: "duplicate" }]))).toBe(
      "duplicate-candidate-path",
    );
    expect(
      codeOf(() => protection({ ...a, accessibility: { ...a.accessibility, retrievability: 0 } })),
    ).toBe("invalid-retrievability");
    expect(codeOf(() => protection({ ...a, exposure: -1 }))).toBe("invalid-exposure");
    expect(codeOf(() => protection({ ...a, importance: "urgent" as Importance }))).toBe(
      "invalid-selection-state",
    );
    expect(codeOf(() => protection({ ...a, epistemicStatus: "unknown" as EpistemicStatus }))).toBe(
      "invalid-selection-state",
    );
  });

  it("ranks by shallow copy without mutating candidates or D1 state", () => {
    const a = candidate("@project/memories/knowledge/a.md", { exposure: 2, retrievability: 0.4 });
    const b = candidate("@project/memories/knowledge/b.md", { exposure: 0, retrievability: 0.9 });
    const input = [a, b] as const;
    const beforeA = structuredClone(a);
    const ranked = rankPassiveL0Candidates(input);
    expect(ranked).not.toBe(input);
    expect(a).toEqual(beforeA);
    expect(input).toEqual([a, b]);
  });
});
