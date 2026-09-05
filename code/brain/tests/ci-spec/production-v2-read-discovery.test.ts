import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vite-plus/test";

import {
  PiDiscoveryTools,
  PiExecutionError,
  type PiDiscoveryToolPort,
  type PiFindEntry,
  type PiGrepHit,
  type PiGrepResult,
  type PiLsEntry,
  type PiOrderedKeysResult,
  type PiReadResult,
} from "../../src/adapters/pi-tools.ts";
import {
  ReadDiscovery,
  type ReadDiscoveryOperationPort,
  type ReadDiscoveryStatePort,
} from "../../src/application/read-discovery.ts";
import {
  buildScopeDiscoveryNamespace,
  CAT_MAX_RENDERED_UTF8_BYTES,
  compilePublicGlob,
  directChildren,
  DiscoveryObjectError,
  splitLogicalLines,
} from "../../src/brain/discovery.ts";
import { parseArchivalDocument } from "../../src/brain/documents.ts";
import {
  formatPublicPath,
  parsePublicPath,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type LogicalDirectory,
  type ScopeRef,
} from "../../src/brain/namespace.ts";
import {
  CognitionStateStore,
  type ArchivalSnapshot,
} from "../../src/persistence/cognition-state-store.ts";
import {
  decodeCompanion,
  encodeMarkdown,
  encodeScopeState,
  normalizeMarkdownInput,
} from "../../src/persistence/codecs.ts";
import type {
  AuxiliaryUpdateOutcome,
  AuxiliaryUpdateRequest,
} from "../../src/persistence/operation-coordination.ts";
import { createStorageBinding, scopeRoot } from "../../src/persistence/storage.ts";

function archival(raw: string): LogicalArchivalPath {
  const parsed = parsePublicPath(raw);
  if (parsed.kind !== "archival") throw new Error("expected archival");
  return parsed;
}

function directory(raw: string): LogicalDirectory {
  const parsed = parsePublicPath(raw);
  if (parsed.kind !== "directory") throw new Error("expected directory");
  return parsed;
}

function memoryText(summary: string, body: string, importance = "medium"): string {
  return normalizeMarkdownInput(
    `---\nsummary: ${summary}\nimportance: ${importance}\n---\n${body}`,
  );
}

function scopeKey(scope: ScopeRef): string {
  return scope.kind === "session" ? `session:${scope.sessionId}` : scope.kind;
}

class FakeState implements ReadDiscoveryStatePort {
  readonly materialized = new Set<string>();
  readonly paths = new Map<string, LogicalArchivalPath[]>();
  readonly snapshots = new Map<string, ArchivalSnapshot>();
  readonly cycles = new Map<string, { cycle: number }>();
  readonly aliases = new Map<string, LogicalBrainPath>();
  readonly companionWrites: Array<{ path: LogicalArchivalPath; bytes: Uint8Array }> = [];
  listingDiagnostics: Array<{
    kind: "alias-followed" | "entry-skipped";
    path?: LogicalBrainPath;
    message: string;
  }> = [];

  add(
    pathValue: LogicalArchivalPath,
    options: {
      summary?: string;
      body?: string;
      questioned?: boolean;
      challenge?: string;
      exposure?: number;
      durability?: number;
      companionState?: "persisted" | "fresh";
    } = {},
  ): void {
    const key = scopeKey(pathValue.scope);
    this.materialized.add(key);
    this.cycles.set(key, { cycle: 3 });
    const paths = this.paths.get(key) ?? [];
    if (!paths.some((item) => formatPublicPath(item) === formatPublicPath(pathValue)))
      paths.push(pathValue);
    this.paths.set(key, paths);
    this.snapshots.set(formatPublicPath(pathValue), {
      path: pathValue,
      document: parseArchivalDocument(
        memoryText(options.summary ?? pathValue.itemSegments.at(-1)!, options.body ?? "body\n"),
      ),
      epistemic:
        options.questioned || options.challenge !== undefined
          ? { challenge: options.challenge ?? "verify premise" }
          : {},
      accessibility: {
        ageCycles: 0,
        anchorCycle: 3,
        durability: options.durability ?? 1,
        exposure: options.exposure ?? 0,
      },
      companionState: options.companionState ?? "persisted",
    });
  }

  alias(requested: LogicalBrainPath, target: LogicalBrainPath): void {
    this.aliases.set(formatPublicPath(requested), target);
  }

  materializeEmpty(scope: ScopeRef): void {
    const key = scopeKey(scope);
    this.materialized.add(key);
    this.cycles.set(key, { cycle: 3 });
    this.paths.set(key, []);
  }

  async isScopeMaterialized(scope: ScopeRef): Promise<boolean> {
    return this.materialized.has(scopeKey(scope));
  }

  async resolveDiscoveryRoot(pathValue: LogicalDirectory) {
    const resolved = this.aliases.get(formatPublicPath(pathValue)) ?? pathValue;
    if (resolved.kind !== "directory") throw new DiscoveryObjectError("wrong-object-kind");
    return {
      requested: pathValue,
      path: resolved,
      aliasFollowed: resolved !== pathValue,
    };
  }

  async listActiveArchivalPaths(scope: ScopeRef) {
    return {
      paths: this.paths.get(scopeKey(scope)) ?? [],
      diagnostics: [...this.listingDiagnostics],
    };
  }

  async loadArchival(pathValue: LogicalArchivalPath) {
    const resolved = this.aliases.get(formatPublicPath(pathValue)) ?? pathValue;
    if (resolved.kind !== "archival") throw new DiscoveryObjectError("wrong-object-kind");
    const snapshot = this.snapshots.get(formatPublicPath(resolved));
    if (!snapshot) return undefined;
    return {
      ...snapshot,
      requestedPath: pathValue,
      path: resolved,
      aliasFollowed: resolved !== pathValue,
    };
  }

  async readScopeCycle(scope: ScopeRef): Promise<{ cycle: number }> {
    const cycle = this.cycles.get(scopeKey(scope));
    if (!cycle) throw new Error("scope missing");
    return cycle;
  }

  async putCompanion(pathValue: LogicalArchivalPath, bytes: Uint8Array): Promise<void> {
    this.companionWrites.push({ path: pathValue, bytes: Uint8Array.from(bytes) });
    const current = this.snapshots.get(formatPublicPath(pathValue));
    if (!current) throw new Error("snapshot disappeared");
    const decoded = decodeCompanion(bytes);
    this.snapshots.set(formatPublicPath(pathValue), {
      ...current,
      epistemic: decoded.epistemic,
      accessibility: decoded.accessibility,
      companionState: "persisted",
    });
  }
}

class FakePiTools implements PiDiscoveryToolPort {
  grepHits: readonly PiGrepHit[] = [];
  grepTruncated = false;
  grepError?: PiExecutionError;
  readResult?: PiReadResult;
  readonly grepCalls: Array<{
    root: LogicalDirectory;
    request: {
      pattern: string;
      glob?: string;
      ignoreCase: boolean;
      literal: boolean;
      limit?: number;
    };
  }> = [];

  async ls(entries: readonly PiLsEntry[], signal?: AbortSignal): Promise<PiOrderedKeysResult> {
    signal?.throwIfAborted();
    return {
      keys: [...entries]
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map((entry) => entry.key),
      truncated: false,
    };
  }

  async find(
    entries: readonly PiFindEntry[],
    pattern: string,
    matches: (pattern: string, publicPath: string) => boolean,
    signal?: AbortSignal,
  ): Promise<PiOrderedKeysResult> {
    signal?.throwIfAborted();
    return {
      keys: entries.filter((entry) => matches(pattern, entry.publicPath)).map((entry) => entry.key),
      truncated: false,
    };
  }

  async read(
    text: string,
    offset: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<PiReadResult> {
    signal?.throwIfAborted();
    if (this.readResult !== undefined) return this.readResult;
    const lines = text === "" ? [] : text.split("\n");
    if (text.endsWith("\n")) lines.pop();
    return {
      outputLines: Math.max(0, Math.min(limit, lines.length - (offset - 1))),
      truncated: false,
      firstLineExceedsLimit: false,
    };
  }

  async grepRoot(
    root: LogicalDirectory,
    request: {
      pattern: string;
      glob?: string;
      ignoreCase: boolean;
      literal: boolean;
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<PiGrepResult> {
    signal?.throwIfAborted();
    this.grepCalls.push({ root, request });
    if (this.grepError !== undefined) throw this.grepError;
    return { hits: this.grepHits, truncated: this.grepTruncated };
  }
}

class FakeOperations implements ReadDiscoveryOperationPort {
  calls = 0;
  fail = false;
  beforeApply?: () => void;

  async tryApplyAuxiliaryUpdate(request: AuxiliaryUpdateRequest): Promise<AuxiliaryUpdateOutcome> {
    this.calls += 1;
    if (this.fail) {
      return {
        kind: "degraded",
        diagnostic: { code: "auxiliary-update-failed", message: "test learning failure" },
      };
    }
    this.beforeApply?.();
    try {
      await request.deriveAndApply();
      return { kind: "applied" };
    } catch {
      return {
        kind: "degraded",
        diagnostic: { code: "auxiliary-update-failed", message: "test learning failure" },
      };
    }
  }
}

describe("T5 pure discovery semantics", () => {
  it("uses one stable logical line coordinate", () => {
    expect(splitLogicalLines("" as never)).toEqual([]);
    expect(splitLogicalLines("a" as never)).toEqual(["a"]);
    expect(splitLogicalLines("a\n" as never)).toEqual(["a"]);
    expect(splitLogicalLines("a\n\n" as never)).toEqual(["a", ""]);
    expect(splitLogicalLines("\n" as never)).toEqual([""]);
  });

  it("builds only cognition directories derived from .md paths plus the four static role roots", () => {
    const scope: ScopeRef = { kind: "project" };
    const paths = [
      archival("@project/memories/skill/report/workflow.md"),
      archival("@project/memories/knowledge/direct.md"),
    ];
    const namespace = buildScopeDiscoveryNamespace(scope, paths);
    expect(namespace.map(formatPublicPath)).toContain("@project/memories/skill/report/");
    expect(namespace.map(formatPublicPath)).not.toContain("@project/memories/skill/assets-only/");
    const root = directory("@project/memories/");
    expect(directChildren(root, namespace).map(formatPublicPath)).toEqual([
      "@project/memories/decision/",
      "@project/memories/intention/",
      "@project/memories/knowledge/",
      "@project/memories/skill/",
    ]);
  });

  it("matches canonical full public paths with baseline glob features and no brace expansion", () => {
    const matcher = compilePublicGlob("@project/memories/skill/**/work?.md");
    expect(matcher("@project/memories/skill/report/work1.md")).toBe(true);
    expect(matcher("@project/memories/skill/report/work10.md")).toBe(false);
    const noBrace = compilePublicGlob("**/{a,b}.md");
    expect(noBrace("@project/memories/knowledge/a.md")).toBe(false);
    expect(() => compilePublicGlob("[")).toThrow(expect.objectContaining({ code: "invalid-glob" }));
    const flagLike = compilePublicGlob("--help");
    expect(flagLike("@project/memories/knowledge/a.md")).toBe(false);
  });
});

describe("T5 read/discovery application", () => {
  function setup(): { state: FakeState; pi: FakePiTools; ops: FakeOperations; app: ReadDiscovery } {
    const state = new FakeState();
    state.materializeEmpty({ kind: "global" });
    state.materializeEmpty({ kind: "project" });
    const pi = new FakePiTools();
    const ops = new FakeOperations();
    return { state, pi, ops, app: new ReadDiscovery(state, pi, ops) };
  }

  it("ls returns direct cognition children and glob returns questioned memory matches without auxiliary mutation", async () => {
    const { state, ops, app } = setup();
    state.add(archival("@project/memories/skill/report/workflow.md"), { summary: "workflow" });
    state.add(archival("@project/memories/skill/direct.md"), {
      summary: "direct",
      questioned: true,
    });

    const role = directory("@project/memories/skill/");
    const ls = await app.ls(role);
    expect(ls.records.map((record) => formatPublicPath(record.path))).toEqual([
      "@project/memories/skill/direct.md",
      "@project/memories/skill/report/",
    ]);

    const glob = await app.glob({ pattern: "@project/memories/skill/**/*.md" });
    expect(glob.records).toHaveLength(2);
    expect(
      glob.records.find((record) => record.kind === "archival" && record.status === "questioned"),
    ).toBeTruthy();
    expect(ops.calls).toBe(0);
  });

  it("returns explicit non-error text when discovery finds no cognition", async () => {
    const { app } = setup();
    const ls = await app.ls(directory("@project/memories/decision/"));
    const glob = await app.glob({ pattern: "**/absent-*.md" });
    const grep = await app.grep({ pattern: "absent", literal: true });

    expect(ls).toMatchObject({ records: [], truncated: false });
    expect(glob).toMatchObject({ records: [], truncated: false });
    expect(grep).toMatchObject({ records: [], truncated: false });
    for (const result of [ls, glob, grep]) {
      expect(result.text.trim().length).toBeGreaterThan(0);
      expect(result.text).not.toMatch(/^error:/);
    }
  });

  it("ls and glob honor an already-aborted internal execution signal", async () => {
    const { app } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      app.ls(directory("@project/memories/"), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      app.glob({ pattern: "**/*.md" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("canonicalizes explicit discovery root aliases before namespace narrowing", async () => {
    const { state, app } = setup();
    state.add(archival("@project/memories/decision/real/a.md"), { summary: "canonical" });
    const requested = directory("@project/memories/knowledge/alias/");
    const canonical = directory("@project/memories/decision/real/");
    state.alias(requested, canonical);

    const ls = await app.ls(requested);
    expect(ls.records.map((record) => formatPublicPath(record.path))).toEqual([
      "@project/memories/decision/real/a.md",
    ]);
    const glob = await app.glob({ pattern: "**/*.md", path: requested });
    expect(glob.records.map((record) => formatPublicPath(record.path))).toEqual([
      "@project/memories/decision/real/a.md",
    ]);
  });

  it("grep delegates bounded execution to Pi, then restores canonical cognition evidence without learning", async () => {
    const { state, pi, ops, app } = setup();
    const item = archival("@project/memories/knowledge/lines.md");
    const body = Array.from({ length: 70 }, (_, index) => `line-${index + 1}`).join("\n") + "\n";
    state.add(item, { summary: "many lines", body });
    pi.grepHits = Array.from({ length: 70 }, (_, index) => ({
      relativePath: "memories/knowledge/lines.md",
      lineNumber: index + 5,
    }));
    pi.grepTruncated = true;

    const root = directory("@project/memories/knowledge/");
    const result = await app.grep({ pattern: "line", path: root, glob: "**/*.md", context: 1 });
    expect(pi.grepCalls).toEqual([
      {
        root,
        request: { pattern: "line", glob: "**/*.md", ignoreCase: false, literal: false },
      },
    ]);
    expect(result.records).toHaveLength(64);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("truncated=true");
    expect(result.text).toContain("narrow pattern/path/glob and search again");
    expect(result.records[0]?.lineNumber).toBe(5);
    expect(result.records[0]?.contextBefore.at(-1)?.lineNumber).toBe(4);
    expect(ops.calls).toBe(0);
  });

  it("maps invalid regex from Pi grep to the public query error", async () => {
    const { state, pi, app } = setup();
    state.add(archival("@project/memories/knowledge/a.md"));
    pi.grepError = new PiExecutionError("invalid-regex");
    await expect(app.grep({ pattern: "(" })).rejects.toMatchObject({ code: "invalid-regex" });
  });

  it("cat returns canonical exact content first, then best-effort reloads and records exact retrieval", async () => {
    const { state, ops, app } = setup();
    const target = archival("@project/memories/decision/a.md");
    const alias = archival("@project/memories/knowledge/alias.md");
    state.add(target, {
      summary: "a",
      body: "one\ntwo\n",
      companionState: "fresh",
      durability: 2,
    });
    state.alias(alias, target);

    ops.beforeApply = () => {
      const current = state.snapshots.get(formatPublicPath(target))!;
      state.snapshots.set(formatPublicPath(target), {
        ...current,
        epistemic: { challenge: "concurrent challenge" },
        accessibility: { ...current.accessibility, exposure: 7 },
        companionState: "persisted",
      });
    };

    const read = await app.cat({ path: alias, offset: 1, limit: 2 });
    expect(read.page.path).toEqual(target);
    expect(read.page.lines).toHaveLength(2);
    expect(read.page.nextOffset).toBe(3);
    expect(read.text).toContain("next_offset: 3");
    expect(read.text).toContain(
      "continue_with: brain_cat(path=@project/memories/decision/a.md, offset=3)",
    );
    expect(ops.calls).toBe(1);
    expect(state.companionWrites).toHaveLength(1);
    expect(state.companionWrites[0]?.path).toEqual(target);
    const saved = decodeCompanion(state.companionWrites[0]!.bytes);
    expect(saved.epistemic).toEqual({ challenge: "concurrent challenge" });
    expect(saved.accessibility).toMatchObject({ durability: 2, exposure: 0, ageCycles: 0 });

    const before = ops.calls;
    const beyond = await app.cat({ path: alias, offset: 999, limit: 1 });
    expect(beyond.page.lines).toEqual([]);
    expect(beyond.text).not.toContain("next_offset:");
    expect(beyond.text).not.toContain("continue_with:");
    expect(ops.calls).toBe(before);
  });

  it("cat marks an oversized prefix, continues after that line, and does not learn the excerpt", async () => {
    const { state, pi, ops, app } = setup();
    const item = archival("@project/memories/knowledge/oversized.md");
    state.add(item, { body: `${"界".repeat(Math.ceil(DEFAULT_MAX_BYTES / 3) + 10)}\nafter\n` });
    pi.readResult = { outputLines: 0, truncated: true, firstLineExceedsLimit: true };

    const result = await app.cat({ path: item, offset: 5, limit: 2 });
    expect(result.page.lines).toEqual([]);
    expect(result.page.nextOffset).toBe(6);
    expect(result.page.oversizedLine?.lineNumber).toBe(5);
    expect(result.page.oversizedLine?.prefix.startsWith("界")).toBe(true);
    expect(result.page.oversizedLine!.shownUtf8Bytes).toBeLessThan(
      result.page.oversizedLine!.fullUtf8Bytes,
    );
    expect(result.text).toContain("line 5");
    expect(result.text).toContain("shown_utf8_bytes:");
    expect(result.text).toContain("full_line_utf8_bytes:");
    expect(result.text).toContain("brain_absolute_path");
    expect(result.text).toContain("next_offset: 6");
    expect(ops.calls).toBe(0);
    expect(state.companionWrites).toHaveLength(0);
  });

  it("cat does not invent continuation after an oversized final line", async () => {
    const { state, pi, ops, app } = setup();
    const item = archival("@project/memories/knowledge/oversized-final.md");
    state.add(item, { body: `${"界".repeat(Math.ceil(DEFAULT_MAX_BYTES / 3) + 10)}\n` });
    pi.readResult = { outputLines: 0, truncated: true, firstLineExceedsLimit: true };

    const result = await app.cat({ path: item, offset: 5, limit: 1 });
    expect(result.page.oversizedLine?.lineNumber).toBe(5);
    expect(result.page.nextOffset).toBeUndefined();
    expect(result.text).not.toContain("next_offset:");
    expect(result.text).not.toContain("continue_with: brain_cat");
    expect(result.text).toContain("brain_absolute_path");
    expect(ops.calls).toBe(0);
  });

  it("cat content stays successful when auxiliary coordination/persistence degrades", async () => {
    const { state, ops, app } = setup();
    const item = archival("@project/memories/knowledge/a.md");
    state.add(item, { body: "substantive\n" });
    ops.fail = true;
    const result = await app.cat({ path: item });
    expect(result.page.lines).toContain("substantive");
    expect(ops.calls).toBe(1);
    expect(state.companionWrites).toHaveLength(0);
  });

  it("cat rejects archival-looking alias whose canonical object is core", async () => {
    const { state, app } = setup();
    const alias = archival("@project/memories/knowledge/core-alias.md");
    const core = parsePublicPath("@project/core.md");
    state.alias(alias, core);
    await expect(app.cat({ path: alias })).rejects.toMatchObject({ code: "wrong-object-kind" });
  });
});

describe("T5 real filesystem enumeration and direct Pi Tool adapter", () => {
  it("uses Pi ls/find/read/grep while brain keeps cognition membership outside", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-t5-pi-"));
    const brainRoot = path.join(temp, "brain");
    try {
      const binding = await createStorageBinding({ projectId: "project-1", brainRoot });
      const scope: ScopeRef = { kind: "project" };
      const root = scopeRoot(binding, scope);
      const item = archival("@project/memories/skill/report/workflow.md");
      const document = memoryText("workflow", "alpha a.b\nbeta 123:456: payload\n");
      await fs.mkdir(path.join(root, ".state"), { recursive: true });
      await fs.mkdir(path.join(root, "memories", "skill", "report"), { recursive: true });
      await fs.mkdir(path.join(root, "memories", "other"), { recursive: true });
      await fs.writeFile(path.join(root, "core.md"), encodeMarkdown(normalizeMarkdownInput("")));
      await fs.writeFile(path.join(root, ".state", "scope.json"), encodeScopeState({ cycle: 0 }));
      await fs.writeFile(
        path.join(root, "memories", "skill", "report", "workflow.md"),
        encodeMarkdown(document),
      );
      await fs.writeFile(
        path.join(root, "memories", "skill", "report", "run.py"),
        "print('asset')\n",
      );
      await fs.writeFile(path.join(root, "memories", "skill", "report", "template.csv"), "a,b\n");
      await fs.writeFile(path.join(root, "memories", "other", "rogue.md"), "not cognition\n");

      const store = new CognitionStateStore(binding);
      expect((await store.listActiveArchivalPaths(scope)).paths.map(formatPublicPath)).toEqual([
        formatPublicPath(item),
      ]);

      const pi = new PiDiscoveryTools(binding);
      await expect(
        pi.ls([
          { key: "b", name: "Beta", directory: false },
          { key: "a", name: "alpha", directory: true },
        ]),
      ).resolves.toMatchObject({ keys: ["a", "b"], truncated: false });
      await expect(
        pi.find(
          [
            { key: "a", publicPath: "@project/memories/skill/a.md" },
            { key: "b", publicPath: "@project/memories/knowledge/b.md" },
          ],
          "**/skill/*.md",
          (pattern, publicPath) => pattern === "**/skill/*.md" && publicPath.includes("/skill/"),
        ),
      ).resolves.toMatchObject({ keys: ["a"], truncated: false });

      await expect(pi.read("one\ntwo\nthree\n", 2, 1)).resolves.toMatchObject({
        outputLines: 1,
        firstLineExceedsLimit: false,
      });
      await expect(
        pi.read(`${"界".repeat(Math.ceil(DEFAULT_MAX_BYTES / 3) + 10)}\nafter\n`, 1, 2),
      ).resolves.toMatchObject({ outputLines: 0, truncated: true, firstLineExceedsLimit: true });

      const searchRoot = directory("@project/memories/skill/report/");
      await expect(
        pi.grepRoot(searchRoot, {
          pattern: "a.b",
          ignoreCase: false,
          literal: true,
        }),
      ).resolves.toMatchObject({
        hits: [{ relativePath: "memories/skill/report/workflow.md", lineNumber: 5 }],
      });
      await expect(
        pi.grepRoot(searchRoot, {
          pattern: "[0-9]+",
          ignoreCase: false,
          literal: false,
        }),
      ).resolves.toMatchObject({
        hits: [{ relativePath: "memories/skill/report/workflow.md", lineNumber: 6 }],
      });
      await expect(
        pi.grepRoot(searchRoot, {
          pattern: "(",
          ignoreCase: false,
          literal: false,
        }),
      ).rejects.toMatchObject({ code: "invalid-regex" });
      await expect(
        pi.grepRoot(searchRoot, {
          pattern: "--help",
          ignoreCase: false,
          literal: false,
        }),
      ).resolves.toMatchObject({ hits: [] });

      const controller = new AbortController();
      controller.abort();
      await expect(pi.ls([], controller.signal)).rejects.toMatchObject({ code: "aborted" });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("dedupes direct and same-scope aliases to one canonical archival identity and skips broken aliases", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-t5-alias-"));
    const brainRoot = path.join(temp, "brain");
    try {
      const binding = await createStorageBinding({ projectId: "project-1", brainRoot });
      const scope: ScopeRef = { kind: "project" };
      const root = scopeRoot(binding, scope);
      await fs.mkdir(path.join(root, "memories", "decision", "real"), { recursive: true });
      await fs.mkdir(path.join(root, "memories", "knowledge"), { recursive: true });
      await fs.writeFile(path.join(root, "core.md"), "");
      await fs.writeFile(
        path.join(root, "memories", "decision", "real", "a.md"),
        encodeMarkdown(memoryText("real", "body\n")),
      );
      await fs.symlink(
        path.join(root, "memories", "decision", "real", "a.md"),
        path.join(root, "memories", "knowledge", "alias.md"),
      );
      await fs.symlink(
        path.join(root, "memories", "decision", "missing.md"),
        path.join(root, "memories", "knowledge", "broken.md"),
      );

      const listing = await new CognitionStateStore(binding).listActiveArchivalPaths(scope);
      expect(listing.paths.map(formatPublicPath)).toEqual(["@project/memories/decision/real/a.md"]);
      expect(listing.diagnostics.some((d) => d.kind === "alias-followed")).toBe(true);
      expect(listing.diagnostics.some((d) => d.kind === "entry-skipped")).toBe(true);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
});
