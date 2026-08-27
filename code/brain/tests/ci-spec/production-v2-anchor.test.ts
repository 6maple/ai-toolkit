import { describe, expect, it } from "vite-plus/test";

import {
  AnchorRestore,
  AnchorStateInvariantError,
  L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES,
  L0_MAX_CANDIDATES,
  type AnchorOperationPort,
  type AnchorPersistencePort,
} from "../../src/application/anchor-restore.ts";
import {
  escapeXmlAttribute,
  renderAnchorCandidateItem,
  renderAnchorContext,
  type AnchorProjection,
} from "../../src/application/anchor-renderer.ts";
import { parseArchivalDocument, validateCoreDocument } from "../../src/brain/documents.ts";
import {
  formatPublicPath,
  parsePublicPath,
  parseSessionId,
  type LogicalArchivalPath,
  type ScopeRef,
} from "../../src/brain/namespace.ts";
import type { CheckpointOutcome } from "../../src/git/checkpoint.ts";
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
import type { ResourceMutation } from "../../src/persistence/cognition-state-store.ts";
import type {
  AuxiliaryUpdateOutcome,
  AuxiliaryUpdateRequest,
  SemanticOperationRequest,
} from "../../src/persistence/operation-coordination.ts";

const globalScope: ScopeRef = { kind: "global" };
const projectScope: ScopeRef = { kind: "project" };
const session1: ScopeRef = { kind: "session", sessionId: parseSessionId("s1") };

function scopeKey(scope: ScopeRef): string {
  return scope.kind === "session" ? `session:${scope.sessionId}` : scope.kind;
}

function archival(raw: string): LogicalArchivalPath {
  const parsed = parsePublicPath(raw);
  if (parsed.kind !== "archival") throw new Error(`expected archival: ${raw}`);
  return parsed;
}

function memory(summary: string, body = "body", importance = "medium") {
  return parseArchivalDocument(
    normalizeMarkdownInput(`---\nsummary: ${summary}\nimportance: ${importance}\n---\n${body}\n`),
  );
}

class FakeAnchorState implements AnchorPersistencePort {
  readonly cores = new Map<string, string>();
  readonly cycles = new Map<string, { cycle: number }>();
  readonly items = new Map<
    string,
    {
      path: LogicalArchivalPath;
      document: ReturnType<typeof memory>;
      epistemic: { challenge?: string };
      accessibility: {
        ageCycles: number;
        anchorCycle: number;
        durability: number;
        exposure: number;
      };
      companionState: "persisted" | "fresh";
    }
  >();
  readonly listingDiagnostics = new Map<
    string,
    Array<{
      kind: "archival-item-skipped";
      path?: LogicalArchivalPath;
      message: string;
    }>
  >();
  readonly scopeWrites: Array<{ scope: ScopeRef; cycle: number }> = [];
  readonly companionWrites: Array<{
    path: LogicalArchivalPath;
    exposure: number;
    challenge?: string;
  }> = [];

  seedScope(scope: ScopeRef, core = "", cycle?: number): void {
    this.cores.set(scopeKey(scope), core);
    if (cycle !== undefined) this.cycles.set(scopeKey(scope), { cycle });
  }

  add(
    path: LogicalArchivalPath,
    options: {
      summary?: string;
      body?: string;
      importance?: "low" | "medium" | "high" | "critical";
      challenge?: string;
      ageCycles?: number;
      anchorCycle?: number;
      durability?: number;
      exposure?: number;
      companionState?: "persisted" | "fresh";
    } = {},
  ): void {
    if (!this.cores.has(scopeKey(path.scope))) this.seedScope(path.scope, "", 0);
    this.items.set(formatPublicPath(path), {
      path,
      document: memory(
        options.summary ?? path.itemSegments.at(-1)!,
        options.body ?? "body",
        options.importance ?? "medium",
      ),
      epistemic: options.challenge === undefined ? {} : { challenge: options.challenge },
      accessibility: {
        ageCycles: options.ageCycles ?? 0,
        anchorCycle: options.anchorCycle ?? 0,
        durability: options.durability ?? 1,
        exposure: options.exposure ?? 0,
      },
      companionState: options.companionState ?? "persisted",
    });
  }

  async loadScope(scope: ScopeRef) {
    const core = this.cores.get(scopeKey(scope));
    if (core === undefined) return undefined;
    const cycle = this.cycles.get(scopeKey(scope));
    return {
      scope,
      core: validateCoreDocument(normalizeMarkdownInput(core)),
      cycle: cycle ?? { cycle: 0 },
      cycleWasFresh: cycle === undefined,
    };
  }

  async listArchival(scope: ScopeRef) {
    return {
      items: [...this.items.values()].filter(
        (item) => scopeKey(item.path.scope) === scopeKey(scope),
      ),
      diagnostics: [...(this.listingDiagnostics.get(scopeKey(scope)) ?? [])],
    };
  }

  async loadArchival(path: LogicalArchivalPath) {
    return this.items.get(formatPublicPath(path));
  }

  async putScopeCycle(scope: ScopeRef, bytes: Uint8Array): Promise<void> {
    const cycle = decodeScopeState(bytes);
    this.scopeWrites.push({ scope, cycle: cycle.cycle });
    this.cycles.set(scopeKey(scope), cycle);
  }

  async putCompanion(path: LogicalArchivalPath, bytes: Uint8Array): Promise<void> {
    const decoded = decodeCompanion(bytes);
    const current = this.items.get(formatPublicPath(path));
    if (!current) throw new Error("item disappeared");
    this.companionWrites.push({
      path,
      exposure: decoded.accessibility.exposure,
      ...(decoded.epistemic.challenge === undefined
        ? {}
        : { challenge: decoded.epistemic.challenge }),
    });
    this.items.set(formatPublicPath(path), {
      ...current,
      epistemic: decoded.epistemic,
      accessibility: decoded.accessibility,
      companionState: "persisted",
    });
  }

  applyMutation(mutation: ResourceMutation): void {
    if (mutation.ref.kind !== "public" || mutation.ref.path.kind !== "core") {
      throw new Error("anchor semantic init may only create core in this fake");
    }
    const key = scopeKey(mutation.ref.path.scope);
    if (mutation.kind === "delete") this.cores.delete(key);
    else this.cores.set(key, decodeMarkdown(mutation.bytes));
  }
}

class FakeAnchorOperations implements AnchorOperationPort {
  readonly semanticMutations: ResourceMutation[][] = [];
  readonly auxiliaryScopes: string[] = [];
  readonly failAuxiliary = new Set<string>();
  beforeAuxiliary?: (scope: ScopeRef) => void;

  constructor(private readonly state: FakeAnchorState) {}

  async runSemanticOperation<T>(request: SemanticOperationRequest<T>): Promise<T> {
    const plan = await request.derive();
    if (plan.kind === "no-change") return plan.result;
    this.semanticMutations.push([...plan.mutations]);
    for (const mutation of plan.mutations) this.state.applyMutation(mutation);
    return plan.result;
  }

  async tryApplyAuxiliaryUpdate(request: AuxiliaryUpdateRequest): Promise<AuxiliaryUpdateOutcome> {
    const scope = request.scopes[0]!;
    const key = scopeKey(scope);
    this.auxiliaryScopes.push(key);
    if (this.failAuxiliary.has(key)) {
      return {
        kind: "degraded",
        diagnostic: { code: "test-auxiliary-failure", message: `auxiliary failed for ${key}` },
      };
    }
    this.beforeAuxiliary?.(scope);
    try {
      await request.deriveAndApply();
      return { kind: "applied" };
    } catch {
      return {
        kind: "degraded",
        diagnostic: { code: "test-auxiliary-failure", message: `auxiliary failed for ${key}` },
      };
    }
  }
}

class FakeCheckpoint {
  calls = 0;
  outcome: CheckpointOutcome = { kind: "no-change" };

  async checkpointWorkspace(): Promise<CheckpointOutcome> {
    this.calls += 1;
    return this.outcome;
  }
}

function setup() {
  const state = new FakeAnchorState();
  state.seedScope(globalScope, "GLOBAL", 0);
  state.seedScope(projectScope, "PROJECT", 0);
  const operations = new FakeAnchorOperations(state);
  const checkpoint = new FakeCheckpoint();
  return {
    state,
    operations,
    checkpoint,
    app: new AnchorRestore(state, operations, checkpoint),
  };
}

describe("T6 anchor renderer", () => {
  it("escapes dynamic attributes while preserving core Markdown verbatim", () => {
    expect(escapeXmlAttribute('a&<b>"\t\n\r')).toBe("a&amp;&lt;b&gt;&quot;&#9;&#10;&#13;");
    const projection: AnchorProjection = {
      currentSessionId: parseSessionId("s1"),
      cores: [
        {
          scope: globalScope,
          path: { kind: "core", scope: globalScope },
          text: normalizeMarkdownInput("<tag>&value\n"),
        },
        {
          scope: projectScope,
          path: { kind: "core", scope: projectScope },
          text: normalizeMarkdownInput("PROJECT\n"),
        },
        {
          scope: session1,
          path: { kind: "core", scope: session1 },
          text: normalizeMarkdownInput(""),
        },
      ],
      candidates: [
        {
          path: archival("@project/memories/knowledge/a.md"),
          summary: 'a "quote" & <fact>\nnext',
          status: "questioned",
        },
      ],
    };
    const rendered = renderAnchorContext(projection);
    expect(rendered.endsWith("\n")).toBe(true);
    expect(rendered).toContain("<tag>&value\n</core>");
    expect(rendered).toContain('read_policy="Each core document is fully restored');
    expect(rendered).toContain('path="@session/s1/core.md"');
    expect(rendered).toContain('empty="true">\n</core>');
    expect(rendered).toContain("brain_cat cannot read core.md");
    expect(rendered).toContain('summary="a &quot;quote&quot; &amp; &lt;fact&gt;&#10;next"');
    expect(rendered).toContain('roots="{@session/s1,@project,@global}"');
    expect(rendered).not.toContain("<sid>");
    expect(rendered).not.toContain("importance=");
    expect(rendered).not.toContain("challenge=");
    expect(rendered).not.toContain("durability=");
  });

  it("renders candidate attributes only as path, summary, status in frozen order", () => {
    const active = renderAnchorCandidateItem({
      path: archival("@project/memories/knowledge/a.md"),
      summary: "A",
    });
    const questioned = renderAnchorCandidateItem({
      path: archival("@project/memories/knowledge/b.md"),
      summary: "B",
      status: "questioned",
    });
    expect(active).toBe(
      '<memory_candidate_item path="@project/memories/knowledge/a.md" summary="A" />',
    );
    expect(questioned).toBe(
      '<memory_candidate_item path="@project/memories/knowledge/b.md" summary="B" status="questioned" />',
    );
  });
});

describe("T6 anchor restore", () => {
  it("restores global/project only when no reliable session exists", async () => {
    const { app, operations } = setup();
    const result = await app.runAnchor({});
    expect(result.context.indexOf("@global/core.md")).toBeLessThan(
      result.context.indexOf("@project/core.md"),
    );
    expect(result.context).not.toContain("@session/");
    expect(result.context).toContain('roots="{@project,@global}"');
    expect(operations.auxiliaryScopes).toEqual(["global", "project"]);
  });

  it("materializes a fresh session core as required state, then persists final cycle1 only as auxiliary learning", async () => {
    const { state, operations, app } = setup();
    expect(await state.loadScope(session1)).toBeUndefined();

    const result = await app.runAnchor({ currentSessionId: parseSessionId("s1") });
    expect(result.context).toContain('path="@session/s1/core.md"');
    expect(result.context).toContain('roots="{@session/s1,@project,@global}"');
    expect(operations.semanticMutations).toHaveLength(1);
    expect(operations.semanticMutations[0]).toHaveLength(1);
    expect(operations.semanticMutations[0]?.[0]?.ref).toMatchObject({
      kind: "public",
      path: { kind: "core", scope: { kind: "session", sessionId: "s1" } },
    });
    expect(operations.semanticMutations[0]?.some((m) => m.ref.kind === "scope-state")).toBe(false);
    expect(state.scopeWrites.find((write) => scopeKey(write.scope) === "session:s1")?.cycle).toBe(
      1,
    );
  });

  it("uses the in-memory advanced cycle before D1/D2 ranking", async () => {
    const { state, app } = setup();
    const freshLow = archival("@project/memories/knowledge/a-fresh-low.md");
    const protectedHigh = archival("@project/memories/knowledge/z-protected-high.md");
    state.add(freshLow, { importance: "low", durability: 1, ageCycles: 0, anchorCycle: 0 });
    state.add(protectedHigh, { importance: "high", durability: 1, ageCycles: 1, anchorCycle: 0 });

    const result = await app.runAnchor({});
    const first = result.context.indexOf(formatPublicPath(protectedHigh));
    const second = result.context.indexOf(formatPublicPath(freshLow));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(second);
  });

  it("merges one pool, shows at most top10, and increments exposure only for shown candidates", async () => {
    const { state, app } = setup();
    const paths: LogicalArchivalPath[] = [];
    for (let i = 0; i < 11; i += 1) {
      const item = archival(`@project/memories/knowledge/${String(i).padStart(2, "0")}.md`);
      paths.push(item);
      state.add(item, { importance: "critical", exposure: 0 });
    }

    const result = await app.runAnchor({});
    const surfaced = paths.filter((item) => result.context.includes(formatPublicPath(item)));
    expect(L0_MAX_CANDIDATES).toBe(10);
    expect(surfaced).toHaveLength(10);
    expect(result.context).not.toContain(formatPublicPath(paths[10]!));
    expect(state.items.get(formatPublicPath(paths[0]!))?.accessibility.exposure).toBe(1);
    expect(state.items.get(formatPublicPath(paths[9]!))?.accessibility.exposure).toBe(1);
    expect(state.items.get(formatPublicPath(paths[10]!))?.accessibility.exposure).toBe(0);
  });

  it("keeps questioned cognition recallable but exposes status only, not challenge", async () => {
    const { state, app } = setup();
    const item = archival("@project/memories/decision/questioned.md");
    state.add(item, { importance: "critical", challenge: "private unresolved basis" });
    const result = await app.runAnchor({});
    expect(result.context).toContain(`path="${formatPublicPath(item)}"`);
    expect(result.context).toContain('status="questioned"');
    expect(result.context).not.toContain("private unresolved basis");
  });

  it("omits an individually oversized candidate, continues to the next representable candidate, and gives no exposure to omitted item", async () => {
    const { state, app } = setup();
    const huge = archival("@project/memories/knowledge/a-huge.md");
    const normal = archival("@project/memories/knowledge/b-normal.md");
    state.add(huge, {
      importance: "critical",
      summary: "x".repeat(L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES + 200),
    });
    state.add(normal, { importance: "high", summary: "normal" });

    const result = await app.runAnchor({});
    expect(result.context).not.toContain(formatPublicPath(huge));
    expect(result.context).toContain(formatPublicPath(normal));
    expect(state.items.get(formatPublicPath(huge))?.accessibility.exposure).toBe(0);
    expect(state.items.get(formatPublicPath(normal))?.accessibility.exposure).toBe(1);
  });

  it("stops on cumulative candidate byte ceiling instead of filling with lower-ranked shorter items", async () => {
    const { state, app } = setup();
    const first = archival("@project/memories/knowledge/a-first.md");
    const second = archival("@project/memories/knowledge/b-second.md");
    const third = archival("@project/memories/knowledge/c-third.md");
    state.add(first, { importance: "critical", summary: "a".repeat(5000) });
    state.add(second, { importance: "critical", summary: "b".repeat(5000) });
    state.add(third, { importance: "critical", summary: "short" });
    const result = await app.runAnchor({});
    expect(result.context).toContain(formatPublicPath(first));
    expect(result.context).not.toContain(formatPublicPath(second));
    expect(result.context).not.toContain(formatPublicPath(third));
  });

  it("reloads current companion inside auxiliary coordination before exposure write", async () => {
    const { state, operations, app } = setup();
    const item = archival("@project/memories/knowledge/reload.md");
    state.add(item, { importance: "critical", exposure: 0, durability: 2 });
    let mutated = false;
    operations.beforeAuxiliary = (scope) => {
      if (mutated || scopeKey(scope) !== "project") return;
      mutated = true;
      const current = state.items.get(formatPublicPath(item))!;
      state.items.set(formatPublicPath(item), {
        ...current,
        epistemic: { challenge: "concurrent challenge" },
        accessibility: { ...current.accessibility, exposure: 7 },
      });
    };

    await app.runAnchor({});
    const updated = state.items.get(formatPublicPath(item))!;
    expect(updated.epistemic).toEqual({ challenge: "concurrent challenge" });
    expect(updated.accessibility.exposure).toBe(8);
  });

  it("localizes auxiliary degradation by scope and still returns the already formed context", async () => {
    const { operations, app } = setup();
    operations.failAuxiliary.add("global");
    const result = await app.runAnchor({});
    expect(result.context).toContain("GLOBAL");
    expect(result.context).toContain("PROJECT");
    expect(operations.auxiliaryScopes).toEqual(["global", "project"]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ kind: "auxiliary-learning-degraded" }),
    );
  });

  it("attempts one checkpoint after restore/learning and history failure never changes context", async () => {
    const { checkpoint, app } = setup();
    checkpoint.outcome = {
      kind: "failed",
      diagnostic: { code: "commit-failed", message: "checkpoint missing" },
    };
    const result = await app.runAnchor({});
    expect(checkpoint.calls).toBe(1);
    expect(result.context).toContain("GLOBAL");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ kind: "history-checkpoint-degraded" }),
    );
  });

  it("keeps per-item broad restore failure local and restores other cognition", async () => {
    const { state, app } = setup();
    const bad = archival("@project/memories/knowledge/bad.md");
    const good = archival("@project/memories/knowledge/good.md");
    state.add(good, { importance: "critical", summary: "good" });
    state.listingDiagnostics.set("project", [
      { kind: "archival-item-skipped", path: bad, message: "malformed archival item" },
    ]);
    const result = await app.runAnchor({});
    expect(result.context).toContain(formatPublicPath(good));
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ kind: "archival-item-skipped", path: bad }),
    );
  });

  it("fails primary restore when a required global/project core is absent", async () => {
    const { state, app } = setup();
    state.cores.delete("project");
    await expect(app.runAnchor({})).rejects.toBeInstanceOf(AnchorStateInvariantError);
    await expect(app.runAnchor({})).rejects.toMatchObject({ code: "required-core-unavailable" });
  });

  it("rejects duplicate canonical archival identity rather than silently ranking two copies", async () => {
    const { state, app } = setup();
    const item = archival("@project/memories/knowledge/dup.md");
    state.add(item, { importance: "critical" });
    const original = state.listArchival.bind(state);
    state.listArchival = async (scope: ScopeRef) => {
      const listing = await original(scope);
      return scopeKey(scope) === "project"
        ? { ...listing, items: [...listing.items, ...listing.items] }
        : listing;
    };
    await expect(app.runAnchor({})).rejects.toMatchObject({ code: "duplicate-archival-path" });
  });
});
