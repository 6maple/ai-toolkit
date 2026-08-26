import { describe, expect, it } from "vite-plus/test";

import {
  projectAccessibility,
  type AccessibilityPersistenceState,
} from "../../src/brain/accessibility.ts";
import { parseArchivalDocument, validateCoreDocument } from "../../src/brain/documents.ts";
import {
  formatPublicPath,
  parsePublicPath,
  parseSessionId,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type ScopeRef,
} from "../../src/brain/namespace.ts";
import {
  CognitionMaintenance,
  MaintenanceInputError,
  MaintenanceStateInvariantError,
  MaintenanceTargetError,
  type MaintenanceOperationPort,
  type MaintenancePersistencePort,
} from "../../src/application/cognition-maintenance.ts";
import { applyExactEdits, ExactEditError } from "../../src/application/exact-edits.ts";
import {
  decodeCompanion,
  decodeMarkdown,
  decodeScopeState,
  encodeCompanion,
  encodeMarkdown,
  encodeScopeState,
  hashMarkdownContent,
  normalizeMarkdownInput,
} from "../../src/persistence/codecs.ts";
import type {
  ArchivalSnapshot,
  MaintenanceStatePort,
  MaterializedScopeSnapshot,
  ResourceMutation,
} from "../../src/persistence/cognition-state-store.ts";
import type {
  AuxiliaryUpdateRequest,
  SemanticOperationRequest,
} from "../../src/persistence/operation-coordination.ts";

const globalScope: ScopeRef = { kind: "global" };
const projectScope: ScopeRef = { kind: "project" };
const session1: ScopeRef = { kind: "session", sessionId: parseSessionId("s1") };
const session2: ScopeRef = { kind: "session", sessionId: parseSessionId("s2") };

function archival(raw: string): LogicalArchivalPath {
  const parsed = parsePublicPath(raw);
  if (parsed.kind !== "archival") throw new Error(`expected archival: ${raw}`);
  return parsed;
}

function memory(summary: string, body: string, importance = "medium"): string {
  return `---\nsummary: ${summary}\nimportance: ${importance}\n---\n${body}`;
}

function scopeKey(scope: ScopeRef): string {
  return scope.kind === "session" ? `session:${scope.sessionId}` : scope.kind;
}

class InMemoryMaintenanceHarness
  implements MaintenanceStatePort, MaintenancePersistencePort, MaintenanceOperationPort
{
  readonly cores = new Map<string, Uint8Array>();
  readonly scopeStates = new Map<string, Uint8Array>();
  readonly documents = new Map<string, Uint8Array>();
  readonly companions = new Map<string, Uint8Array>();
  readonly aliases = new Map<string, LogicalBrainPath>();
  changePlans = 0;
  noChangePlans = 0;
  auxiliaryAttempts = 0;
  lastMutations: readonly ResourceMutation[] = [];

  seedScope(scope: ScopeRef, cycle = 0, core = ""): void {
    const key = scopeKey(scope);
    this.cores.set(key, encodeMarkdown(normalizeMarkdownInput(core)));
    this.scopeStates.set(key, encodeScopeState({ cycle }));
  }

  seedArchival(
    path: LogicalArchivalPath,
    text: string,
    options: {
      readonly challenge?: string;
      readonly ageCycles?: number;
      readonly anchorCycle?: number;
      readonly durability?: number;
      readonly exposure?: number;
    } = {},
  ): void {
    if (!this.cores.has(scopeKey(path.scope))) this.seedScope(path.scope);
    const key = formatPublicPath(path);
    this.documents.set(key, encodeMarkdown(normalizeMarkdownInput(text)));
    this.companions.set(
      key,
      encodeCompanion({
        contentHash: hashMarkdownContent(normalizeMarkdownInput(text)),
        epistemic: options.challenge === undefined ? {} : { challenge: options.challenge },
        accessibility: {
          ageCycles: options.ageCycles ?? 0,
          anchorCycle: options.anchorCycle ?? 0,
          durability: options.durability ?? 1,
          exposure: options.exposure ?? 0,
        },
      }),
    );
  }

  alias(requested: LogicalBrainPath, target: LogicalBrainPath): void {
    this.aliases.set(formatPublicPath(requested), target);
  }

  async resolveExisting(path: LogicalBrainPath) {
    const target = this.aliases.get(formatPublicPath(path)) ?? path;
    const exists =
      target.kind === "core"
        ? this.cores.has(scopeKey(target.scope))
        : target.kind === "archival"
          ? this.documents.has(formatPublicPath(target))
          : false;
    if (!exists) throw new MaintenanceTargetError("target-not-found");
    return { requested: path, path: target, aliasFollowed: target !== path };
  }

  async resolveCreateTarget(path: LogicalBrainPath) {
    const target = this.aliases.get(formatPublicPath(path)) ?? path;
    return { requested: path, path: target, aliasFollowed: target !== path };
  }

  async deleteCompanion(path: LogicalArchivalPath): Promise<void> {
    this.companions.delete(formatPublicPath(path));
  }

  async loadScope(scope: ScopeRef): Promise<MaterializedScopeSnapshot | undefined> {
    const key = scopeKey(scope);
    const core = this.cores.get(key);
    const cycle = this.scopeStates.get(key);
    if (core === undefined) return undefined;
    return {
      scope,
      core: validateCoreDocument(decodeMarkdown(core)),
      cycle: cycle === undefined ? { cycle: 0 } : decodeScopeState(cycle),
    };
  }

  async loadArchival(path: LogicalArchivalPath): Promise<ArchivalSnapshot | undefined> {
    const key = formatPublicPath(path);
    const document = this.documents.get(key);
    const companion = this.companions.get(key);
    if (document === undefined) return undefined;
    const scope = await this.loadScope(path.scope);
    if (scope === undefined) throw new Error("scope missing in test harness");
    if (companion === undefined) {
      return {
        path,
        document: parseArchivalDocument(decodeMarkdown(document)),
        epistemic: {},
        accessibility: { ageCycles: 0, anchorCycle: scope.cycle.cycle, durability: 1, exposure: 0 },
        companionState: "fresh",
      };
    }
    const state = decodeCompanion(companion);
    return {
      path,
      document: parseArchivalDocument(decodeMarkdown(document)),
      epistemic: state.epistemic,
      accessibility: state.accessibility,
      companionState: "persisted",
    };
  }

  async runSemanticOperation<T>(request: SemanticOperationRequest<T>): Promise<T> {
    const plan = await request.derive();
    if (plan.kind === "no-change") {
      this.noChangePlans += 1;
      this.lastMutations = [];
      return plan.result;
    }
    this.changePlans += 1;
    this.lastMutations = [...plan.mutations];
    for (const mutation of plan.mutations) this.applyMutation(mutation);
    return plan.result;
  }

  async tryApplyAuxiliaryUpdate(request: AuxiliaryUpdateRequest) {
    this.auxiliaryAttempts += 1;
    try {
      await request.deriveAndApply();
      return { kind: "applied" as const };
    } catch {
      return {
        kind: "degraded" as const,
        diagnostic: { code: "auxiliary-update-failed", message: "test auxiliary failure" },
      };
    }
  }

  private applyMutation(mutation: ResourceMutation): void {
    const ref = mutation.ref;
    let map: Map<string, Uint8Array>;
    let key: string;
    switch (ref.kind) {
      case "scope-state":
        map = this.scopeStates;
        key = scopeKey(ref.scope);
        break;
      case "companion":
        map = this.companions;
        key = formatPublicPath(ref.item);
        break;
      case "public":
        if (ref.path.kind === "core") {
          map = this.cores;
          key = scopeKey(ref.path.scope);
        } else {
          map = this.documents;
          key = formatPublicPath(ref.path);
        }
        break;
    }
    if (mutation.kind === "put") map.set(key, Uint8Array.from(mutation.bytes));
    else map.delete(key);
  }
}

function createHarness(): { harness: InMemoryMaintenanceHarness; app: CognitionMaintenance } {
  const harness = new InMemoryMaintenanceHarness();
  return { harness, app: new CognitionMaintenance(harness, harness) };
}

function expectAccessibility(
  actual: AccessibilityPersistenceState,
  expected: Partial<AccessibilityPersistenceState>,
): void {
  expect(actual).toMatchObject(expected);
}

describe("T4 exact edit engine", () => {
  it("validates every replacement against the original document and applies a complete deterministic result", () => {
    expect(
      applyExactEdits("alpha beta gamma", [
        { oldText: "alpha", newText: "A" },
        { oldText: "gamma", newText: "G" },
      ]),
    ).toBe("A beta G");
  });

  it("rejects an empty edit array", () => {
    expect(() => applyExactEdits("same", [])).toThrowError(ExactEditError);
    expect(() => applyExactEdits("same", [])).toThrowError(/empty-edits/);
  });

  it.each([
    [[{ oldText: "", newText: "x" }], "empty-old-text"],
    [[{ oldText: "missing", newText: "x" }], "old-text-not-found"],
    [[{ oldText: "a", newText: "x" }], "old-text-not-unique"],
  ] as const)("fails atomically for %s", (edits, code) => {
    try {
      applyExactEdits("a a", edits);
      throw new Error("expected exact edit failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ExactEditError);
      expect((error as ExactEditError).code).toBe(code);
    }
  });

  it("rejects overlapping original regions", () => {
    expect(() =>
      applyExactEdits("abcde", [
        { oldText: "abc", newText: "A" },
        { oldText: "cde", newText: "B" },
      ]),
    ).toThrowError(expect.objectContaining({ code: "overlapping-edits" }));
  });
});

describe("T4 cognition maintenance", () => {
  it("write create builds fresh active cognition; overwrite replaces prior challenge and learning", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 5);
    const path = archival("@project/memories/knowledge/a.md");

    expect(await app.write(path, memory("first", "one"))).toMatchObject({
      action: "created",
      path,
    });
    let snapshot = await harness.loadArchival(path);
    expect(snapshot?.epistemic).toEqual({});
    expect(snapshot?.accessibility).toEqual({
      ageCycles: 0,
      anchorCycle: 5,
      durability: 1,
      exposure: 0,
    });

    harness.seedArchival(path, memory("old", "old"), {
      challenge: "old challenge",
      ageCycles: 3,
      anchorCycle: 2,
      durability: 7,
      exposure: 4,
    });
    expect(await app.write(path, memory("replacement", "new"))).toMatchObject({
      action: "overwrote",
      path,
    });
    snapshot = await harness.loadArchival(path);
    expect(snapshot?.document.summary).toBe("replacement");
    expect(snapshot?.epistemic).toEqual({});
    expect(snapshot?.accessibility).toEqual({
      ageCycles: 0,
      anchorCycle: 5,
      durability: 1,
      exposure: 0,
    });
  });

  it("identical write still reports overwrite while allowing physical no-change", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 0);
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("same", "body"));
    const beforeChanges = harness.changePlans;
    expect(await app.write(path, memory("same", "body"))).toMatchObject({ action: "overwrote" });
    expect(harness.changePlans).toBe(beforeChanges);
    expect(harness.noChangePlans).toBe(1);
  });

  it("write to fresh session requires empty core while cycle0 remains a fresh auxiliary fallback", async () => {
    const { harness, app } = createHarness();
    const path = archival("@session/s1/memories/intention/next.md");
    expect(await app.write(path, memory("next", "do it"))).toMatchObject({ action: "created" });
    expect(await harness.loadScope(session1)).toMatchObject({
      cycle: { cycle: 0 },
      core: { text: "" },
    });
    expect(harness.lastMutations).toHaveLength(3);
    expect(harness.lastMutations.some((m) => m.ref.kind === "scope-state")).toBe(false);
  });

  it("write refuses to repair absent global/project runtime scopes", async () => {
    const { app } = createHarness();
    await expect(
      app.write(archival("@project/memories/knowledge/a.md"), memory("a", "b")),
    ).rejects.toBeInstanceOf(MaintenanceStateInvariantError);
  });

  it("edit whole-content preserves cognition state and clears exposure only when document changes", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 8);
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("old", "body"), {
      challenge: "still unresolved",
      ageCycles: 2,
      anchorCycle: 5,
      durability: 4,
      exposure: 3,
    });

    expect(await app.edit({ path, content: memory("new", "changed") })).toMatchObject({
      action: "edited",
      changed: true,
    });
    const snapshot = await harness.loadArchival(path);
    expect(snapshot?.epistemic).toEqual({ challenge: "still unresolved" });
    expect(snapshot?.accessibility).toEqual({
      ageCycles: 2,
      anchorCycle: 5,
      durability: 4,
      exposure: 0,
    });
  });

  it("same-content whole-document edit is durable no-change and does not clear exposure", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 3);
    const path = archival("@project/memories/knowledge/a.md");
    const text = memory("same", "body");
    harness.seedArchival(path, text, { exposure: 5 });

    expect(await app.edit({ path, content: text })).toMatchObject({
      action: "edited",
      changed: false,
    });
    expect((await harness.loadArchival(path))?.accessibility.exposure).toBe(5);
  });

  it("rejects edits=[] before creating a persistent plan", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 3);
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("same", "body"), { exposure: 5 });
    const before = harness.changePlans;

    await expect(app.edit({ path, edits: [] })).rejects.toMatchObject({ code: "empty-edits" });
    expect(harness.changePlans).toBe(before);
    expect((await harness.loadArchival(path))?.accessibility.exposure).toBe(5);
  });

  it("exact-edit validation failure produces zero persistent plan", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 0);
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("same", "x x"));
    const before = harness.changePlans;
    await expect(
      app.edit({ path, edits: [{ oldText: "x", newText: "y" }] }),
    ).rejects.toBeInstanceOf(MaintenanceInputError);
    expect(harness.changePlans).toBe(before);
  });

  it("core edit supports empty resident content and enforces capacity without lazy creation", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 0, "resident");
    const core = parsePublicPath("@project/core.md");
    if (core.kind !== "core") throw new Error("expected core");
    expect(await app.edit({ path: core, content: "" })).toMatchObject({
      action: "edited",
      changed: true,
    });
    expect((await harness.loadScope(projectScope))?.core.text).toBe("");
    await expect(app.edit({ path: core, content: "x".repeat(4001) })).rejects.toMatchObject({
      code: "core-capacity-exceeded",
    });

    const missingSessionCore = parsePublicPath("@session/s2/core.md");
    if (missingSessionCore.kind !== "core") throw new Error("expected core");
    await expect(app.edit({ path: missingSessionCore, content: "x" })).rejects.toBeInstanceOf(
      MaintenanceTargetError,
    );
    expect(await harness.loadScope(session2)).toBeUndefined();
  });

  it("edit mode requires exactly one of edits/content", async () => {
    const { app } = createHarness();
    const path = archival("@project/memories/knowledge/a.md");
    await expect(app.edit({ path })).rejects.toMatchObject({ code: "edit-mode" });
    await expect(app.edit({ path, edits: [], content: "x" })).rejects.toMatchObject({
      code: "edit-mode",
    });
  });

  it("same-scope move preserves document/challenge/age/durability, clears exposure, and replaces destination", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 9);
    const src = archival("@project/memories/decision/src.md");
    const dst = archival("@project/memories/skill/dst.md");
    harness.seedArchival(src, memory("source", "S"), {
      challenge: "source challenge",
      ageCycles: 2,
      anchorCycle: 4,
      durability: 5,
      exposure: 3,
    });
    harness.seedArchival(dst, memory("destination", "D"), {
      challenge: "dest challenge",
      durability: 99,
    });

    expect(await app.move(src, dst)).toMatchObject({
      action: "moved",
      replacedExistingDestination: true,
    });
    expect(await harness.loadArchival(src)).toBeUndefined();
    const moved = await harness.loadArchival(dst);
    expect(moved?.document.summary).toBe("source");
    expect(moved?.epistemic).toEqual({ challenge: "source challenge" });
    expect(moved?.accessibility).toEqual({
      ageCycles: 2,
      anchorCycle: 4,
      durability: 5,
      exposure: 0,
    });
  });

  it("cross-scope move preserves instantaneous retrievability and can initialize fresh session destination", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 10);
    const src = archival("@project/memories/knowledge/src.md");
    const dst = archival("@session/s1/memories/knowledge/dst.md");
    harness.seedArchival(src, memory("source", "S"), {
      ageCycles: 1,
      anchorCycle: 6,
      durability: 3,
      exposure: 2,
    });
    const before = await harness.loadArchival(src);
    const beforeProjection = projectAccessibility({ cycle: 10 }, before!.accessibility);

    expect(await app.move(src, dst)).toMatchObject({
      action: "moved",
      replacedExistingDestination: false,
    });
    const targetScope = await harness.loadScope(session1);
    const moved = await harness.loadArchival(dst);
    expect(targetScope?.cycle).toEqual({ cycle: 0 });
    const afterProjection = projectAccessibility(targetScope!.cycle, moved!.accessibility);
    expect(afterProjection.retrievability).toBeCloseTo(beforeProjection.retrievability, 12);
    expect(moved?.accessibility.durability).toBe(3);
    expect(moved?.accessibility.exposure).toBe(0);
  });

  it("move refuses to repair an absent runtime-required destination scope", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 2);
    const src = archival("@project/memories/knowledge/src.md");
    const dst = archival("@global/memories/knowledge/dst.md");
    harness.seedArchival(src, memory("source", "body"));
    expect(await harness.loadScope(globalScope)).toBeUndefined();
    await expect(app.move(src, dst)).rejects.toBeInstanceOf(MaintenanceStateInvariantError);
    expect(await harness.loadArchival(src)).toBeDefined();
    expect(await harness.loadScope(globalScope)).toBeUndefined();
  });

  it("move rejects same existing canonical path and any core endpoint", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 0);
    const item = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(item, memory("same", "body"));
    await expect(app.move(item, item)).rejects.toMatchObject({ code: "same-source-destination" });
    const core = parsePublicPath("@project/core.md");
    await expect(app.move(core, item)).rejects.toMatchObject({
      code: "mv-requires-archival-source",
    });
    await expect(app.move(item, core)).rejects.toMatchObject({
      code: "mv-requires-archival-destination",
    });
  });

  it("remove deletes only active archival document+companion and leaves scope/core", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 2, "core remains");
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("a", "b"), { durability: 4 });
    expect(await app.remove(path)).toMatchObject({ action: "removed" });
    expect(await harness.loadArchival(path)).toBeUndefined();
    expect((await harness.loadScope(projectScope))?.core.text).toBe("core remains");
    expect(harness.lastMutations).toHaveLength(1);
    expect(harness.lastMutations[0]?.ref.kind).toBe("public");
    expect(harness.auxiliaryAttempts).toBe(1);
  });

  it("adopt reinforces exactly once while preserving document, importance and challenge", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 7);
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("a", "body", "high"), {
      challenge: "open",
      ageCycles: 3,
      anchorCycle: 2,
      durability: 4,
      exposure: 2,
    });
    expect(await app.feedback(path, "adopt")).toMatchObject({ action: "adopted" });
    const snapshot = await harness.loadArchival(path);
    expect(snapshot?.document.importance).toBe("high");
    expect(snapshot?.document.body).toBe("body");
    expect(snapshot?.epistemic).toEqual({ challenge: "open" });
    expect(snapshot?.accessibility).toEqual({
      ageCycles: 0,
      anchorCycle: 7,
      durability: 5,
      exposure: 0,
    });
  });

  it("question requires challenge, trims/replaces it, and repeated identical question can no-change", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 4);
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("a", "body"), { challenge: "old", exposure: 3 });

    await expect(app.feedback(path, "question")).rejects.toMatchObject({
      code: "question-challenge-required",
    });
    await expect(app.feedback(path, "question", "   ")).rejects.toMatchObject({
      code: "empty-challenge",
    });
    expect(await app.feedback(path, "question", "  new current challenge  ")).toMatchObject({
      action: "questioned",
      changed: true,
    });
    expect((await harness.loadArchival(path))?.epistemic).toEqual({
      challenge: "new current challenge",
    });
    expect((await harness.loadArchival(path))?.accessibility.exposure).toBe(0);
    expect(await app.feedback(path, "question", "new current challenge")).toMatchObject({
      action: "questioned",
      changed: false,
    });
  });

  it("resolve requires a current challenge, clears it, and never reinforces durability", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 6);
    const path = archival("@project/memories/knowledge/a.md");
    harness.seedArchival(path, memory("a", "body"), {
      challenge: "open",
      durability: 8,
      ageCycles: 2,
      anchorCycle: 3,
      exposure: 2,
    });
    expect(await app.feedback(path, "resolve", "ignored extra challenge")).toMatchObject({
      action: "resolved",
    });
    const resolved = await harness.loadArchival(path);
    expect(resolved?.epistemic).toEqual({});
    expectAccessibility(resolved!.accessibility, {
      durability: 8,
      ageCycles: 2,
      anchorCycle: 3,
      exposure: 0,
    });
    await expect(app.feedback(path, "resolve")).rejects.toMatchObject({
      code: "no-current-challenge",
    });
  });

  it("uses resolved canonical identity for edit/remove/feedback results", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 4);
    const target = archival("@project/memories/decision/real.md");
    const alias = archival("@project/memories/knowledge/alias.md");
    harness.seedArchival(target, memory("real", "body"), { durability: 3, exposure: 2 });
    harness.alias(alias, target);

    expect(await app.edit({ path: alias, content: memory("edited", "body") })).toMatchObject({
      action: "edited",
      path: target,
    });
    expect(await app.feedback(alias, "adopt")).toMatchObject({ action: "adopted", path: target });
    expect(await app.remove(alias)).toMatchObject({ action: "removed", path: target });
    expect(await harness.loadArchival(target)).toBeUndefined();
  });

  it("resolves aliases before mv same-path and canonical object-kind decisions", async () => {
    const { harness, app } = createHarness();
    harness.seedScope(projectScope, 1);
    const target = archival("@project/memories/decision/real.md");
    const alias = archival("@project/memories/knowledge/alias.md");
    harness.seedArchival(target, memory("real", "body"));
    harness.alias(alias, target);
    await expect(app.move(alias, target)).rejects.toMatchObject({
      code: "same-source-destination",
    });

    const core = parsePublicPath("@project/core.md");
    if (core.kind !== "core") throw new Error("expected core");
    const looksArchival = archival("@project/memories/knowledge/core-alias.md");
    harness.alias(looksArchival, core);
    expect(await app.edit({ path: looksArchival, content: "changed core" })).toMatchObject({
      action: "edited",
      path: core,
    });
    await expect(app.remove(looksArchival)).rejects.toMatchObject({ code: "rm-requires-archival" });
    await expect(app.feedback(looksArchival, "adopt")).rejects.toMatchObject({
      code: "feedback-requires-archival",
    });
  });

  it("write/rm/feedback reject core or non-archival targets without entering a change plan", async () => {
    const { harness, app } = createHarness();
    const core = parsePublicPath("@project/core.md");
    await expect(app.write(core, "x")).rejects.toMatchObject({ code: "write-requires-archival" });
    await expect(app.remove(core)).rejects.toMatchObject({ code: "rm-requires-archival" });
    await expect(app.feedback(core, "adopt")).rejects.toMatchObject({
      code: "feedback-requires-archival",
    });
    expect(harness.changePlans).toBe(0);
  });
});
