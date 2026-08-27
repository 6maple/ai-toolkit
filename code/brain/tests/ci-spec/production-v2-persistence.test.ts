import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  parsePublicPath,
  type LogicalArchivalPath,
  type ScopeRef,
} from "../../src/brain/namespace.ts";
import { GitCheckpoint } from "../../src/git/checkpoint.ts";
import {
  type GitCommandResult,
  type GitCommandRunner,
  type RepositoryFs,
} from "../../src/git/repository.ts";
import {
  CognitionStateStore,
  persistentArchivalRef,
  persistentCompanionRef,
  persistentCoreRef,
  type CognitionStoreFs,
  type ManagedDirectoryEntry,
  type PersistentFileRef,
  type PersistentResourcePort,
  type PreparedPhysicalMutation,
  type ResourceBeforeState,
  type ResourceMutation,
} from "../../src/persistence/cognition-state-store.ts";
import {
  encodeCompanion,
  encodeMarkdown,
  encodeScopeState,
  hashMarkdownContent,
  normalizeMarkdownInput,
} from "../../src/persistence/codecs.ts";
import {
  CoordinationError,
  PersistentOperationCoordinator,
  StoreInvariantError,
  type GlobalSemanticLeasePort,
} from "../../src/persistence/operation-coordination.ts";
import type { StorageStat } from "../../src/persistence/storage.ts";
import { bootstrapBrainRuntimeInfrastructure } from "../../src/runtime/bootstrap.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const projectScope: ScopeRef = { kind: "project" };
const globalScope: ScopeRef = { kind: "global" };

function archival(raw: string): LogicalArchivalPath {
  const parsed = parsePublicPath(raw);
  if (parsed.kind !== "archival") throw new Error(`expected archival path: ${raw}`);
  return parsed;
}

function refKey(ref: PersistentFileRef): string {
  if (ref.kind === "scope-state") return `${ref.scope.kind}/scope.json`;
  if (ref.kind === "companion")
    return `${ref.item.scope.kind}/${ref.item.itemSegments.join("/")}.json`;
  if (ref.path.kind === "core") return `${ref.path.scope.kind}/core.md`;
  return `${ref.path.scope.kind}/${ref.path.itemSegments.join("/")}`;
}

class FakeResourcePort implements PersistentResourcePort {
  readonly files = new Map<string, Uint8Array>();
  readonly events: string[] = [];
  failPreflightFor: string | undefined;
  failPutFor: string | undefined;
  failRestore = false;

  async preflight(mutation: ResourceMutation): Promise<PreparedPhysicalMutation> {
    const key = refKey(mutation.ref);
    this.events.push(`preflight:${key}`);
    if (this.failPreflightFor === key) throw new Error("preflight failed");
    return {
      ref: mutation.ref,
      operation: mutation.kind,
      absolutePath: `/${key}`,
    };
  }

  async readBefore(prepared: PreparedPhysicalMutation): Promise<ResourceBeforeState> {
    const key = prepared.absolutePath.slice(1);
    this.events.push(`before:${key}`);
    const bytes = this.files.get(key);
    return bytes === undefined
      ? { existed: false }
      : { existed: true, bytes: Uint8Array.from(bytes) };
  }

  async putWhole(prepared: PreparedPhysicalMutation, bytes: Uint8Array): Promise<void> {
    const key = prepared.absolutePath.slice(1);
    this.events.push(`put:${key}`);
    if (this.failPutFor === key) throw new Error("put failed");
    this.files.set(key, Uint8Array.from(bytes));
  }

  async deleteFile(prepared: PreparedPhysicalMutation): Promise<void> {
    const key = prepared.absolutePath.slice(1);
    this.events.push(`delete:${key}`);
    this.files.delete(key);
  }

  async restoreBefore(
    prepared: PreparedPhysicalMutation,
    before: ResourceBeforeState,
  ): Promise<void> {
    const key = prepared.absolutePath.slice(1);
    this.events.push(`restore:${key}`);
    if (this.failRestore) throw new Error("restore failed");
    if (before.existed) this.files.set(key, Uint8Array.from(before.bytes));
    else this.files.delete(key);
  }
}

class FakeLease implements GlobalSemanticLeasePort {
  calls = 0;
  active = false;
  fail = false;

  async runExclusive<T>(_signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
    this.calls += 1;
    if (this.fail) throw new CoordinationError("global-coordination-unavailable");
    this.active = true;
    try {
      return await operation();
    } finally {
      this.active = false;
    }
  }
}

function mutation(raw: string, text: string): ResourceMutation {
  return { kind: "put", ref: persistentArchivalRef(archival(raw)), bytes: encoder.encode(text) };
}

describe("T3 E2 semantic vs auxiliary coordination", () => {
  it("preflight failure makes zero semantic write without any Git collaborator", async () => {
    const resources = new FakeResourcePort();
    const coordinator = new PersistentOperationCoordinator(resources, new FakeLease());
    resources.failPreflightFor = "project/b.md";

    await expect(
      coordinator.runSemanticOperation({
        name: "preflight-failure",
        scopes: [projectScope],
        derive: async () => ({
          kind: "change",
          mutations: [
            mutation("@project/memories/knowledge/a.md", "A"),
            mutation("@project/memories/knowledge/b.md", "B"),
          ],
          result: undefined,
        }),
      }),
    ).rejects.toThrow("preflight failed");
    expect(resources.files.size).toBe(0);
    expect(resources.events.some((event) => event.startsWith("put:"))).toBe(false);
  });

  it("restores required resources when a later required file apply fails", async () => {
    const resources = new FakeResourcePort();
    const coordinator = new PersistentOperationCoordinator(resources, new FakeLease());
    resources.files.set("project/a.md", encoder.encode("old-a"));
    resources.failPutFor = "project/b.md";

    await expect(
      coordinator.runSemanticOperation({
        name: "required-rollback",
        scopes: [projectScope],
        derive: async () => ({
          kind: "change",
          mutations: [
            mutation("@project/memories/knowledge/a.md", "new-a"),
            mutation("@project/memories/knowledge/b.md", "new-b"),
          ],
          result: undefined,
        }),
      }),
    ).rejects.toThrow("put failed");

    expect(decoder.decode(resources.files.get("project/a.md")!)).toBe("old-a");
    expect(resources.files.has("project/b.md")).toBe(false);
    expect(resources.events.some((event) => event.startsWith("restore:"))).toBe(true);
  });

  it("restore failure becomes an invariant failure and blocks later state-changing work", async () => {
    const resources = new FakeResourcePort();
    resources.files.set("project/a.md", encoder.encode("old-a"));
    resources.failPutFor = "project/b.md";
    resources.failRestore = true;
    const coordinator = new PersistentOperationCoordinator(resources, new FakeLease());

    await expect(
      coordinator.runSemanticOperation({
        name: "restore-failure",
        scopes: [projectScope],
        derive: async () => ({
          kind: "change",
          mutations: [
            mutation("@project/memories/knowledge/a.md", "new-a"),
            mutation("@project/memories/knowledge/b.md", "new-b"),
          ],
          result: undefined,
        }),
      }),
    ).rejects.toMatchObject({ code: "restore-failed" });

    resources.failPutFor = undefined;
    resources.failRestore = false;
    await expect(
      coordinator.runSemanticOperation({
        name: "after-invariant",
        scopes: [projectScope],
        derive: async () => ({ kind: "no-change", result: undefined }),
      }),
    ).rejects.toBeInstanceOf(StoreInvariantError);
    await expect(
      coordinator.tryApplyAuxiliaryUpdate({
        scopes: [projectScope],
        deriveAndApply: async () => undefined,
      }),
    ).resolves.toMatchObject({ kind: "degraded" });
  });

  it("applies puts before deletes in canonical physical-path order", async () => {
    const resources = new FakeResourcePort();
    const coordinator = new PersistentOperationCoordinator(resources, new FakeLease());
    const source = persistentArchivalRef(archival("@project/memories/knowledge/z.md"));
    resources.files.set("project/z.md", encoder.encode("old"));

    await coordinator.runSemanticOperation({
      name: "ordered-plan",
      scopes: [projectScope],
      derive: async () => ({
        kind: "change",
        mutations: [
          { kind: "delete", ref: source },
          mutation("@project/memories/knowledge/b.md", "B"),
          mutation("@project/memories/knowledge/a.md", "A"),
        ],
        result: undefined,
      }),
    });

    expect(resources.events.filter((e) => e.startsWith("put:") || e.startsWith("delete:"))).toEqual(
      ["put:project/a.md", "put:project/b.md", "delete:project/z.md"],
    );
  });

  it("serializes same-process read-modify-write derives", async () => {
    const resources = new FakeResourcePort();
    const coordinator = new PersistentOperationCoordinator(resources, new FakeLease());

    const increment = (name: string) =>
      coordinator.runSemanticOperation({
        name,
        scopes: [projectScope],
        derive: async () => {
          const current = resources.files.get("project/a.md");
          const value = current === undefined ? 0 : Number(decoder.decode(current));
          await Promise.resolve();
          return {
            kind: "change" as const,
            mutations: [mutation("@project/memories/knowledge/a.md", String(value + 1))],
            result: value + 1,
          };
        },
      });

    const [a, b] = await Promise.all([increment("a"), increment("b")]);
    expect([a, b].sort((x, y) => x - y)).toEqual([1, 2]);
    expect(decoder.decode(resources.files.get("project/a.md")!)).toBe("2");
  });

  it("uses the cross-process lease only when current state includes global scope", async () => {
    const resources = new FakeResourcePort();
    const lease = new FakeLease();
    const coordinator = new PersistentOperationCoordinator(resources, lease);

    await coordinator.runSemanticOperation({
      name: "project-only",
      scopes: [projectScope],
      derive: async () => ({ kind: "no-change", result: undefined }),
    });
    expect(lease.calls).toBe(0);

    await coordinator.runSemanticOperation({
      name: "global",
      scopes: [globalScope],
      derive: async () => ({ kind: "no-change", result: undefined }),
    });
    expect(lease.calls).toBe(1);
  });

  it("degrades auxiliary persistence/coordination failure without semantic rollback", async () => {
    const resources = new FakeResourcePort();
    const lease = new FakeLease();
    const coordinator = new PersistentOperationCoordinator(resources, lease);
    let projectApplied = false;

    const failedWrite = await coordinator.tryApplyAuxiliaryUpdate({
      scopes: [projectScope],
      deriveAndApply: async () => {
        projectApplied = true;
        throw new Error("aux write failed");
      },
    });
    expect(failedWrite).toMatchObject({ kind: "degraded" });
    expect(projectApplied).toBe(true);

    lease.fail = true;
    const failedGlobalLease = await coordinator.tryApplyAuxiliaryUpdate({
      scopes: [globalScope],
      deriveAndApply: async () => {
        throw new Error("must not run");
      },
    });
    expect(failedGlobalLease).toMatchObject({ kind: "degraded" });
  });

  it("reload/update callbacks for concurrent auxiliary events run inside the same process serial boundary", async () => {
    const resources = new FakeResourcePort();
    const coordinator = new PersistentOperationCoordinator(resources, new FakeLease());
    let value = 0;
    const update = () =>
      coordinator.tryApplyAuxiliaryUpdate({
        scopes: [projectScope],
        deriveAndApply: async () => {
          const current = value;
          await Promise.resolve();
          value = current + 1;
        },
      });
    const results = await Promise.all([update(), update()]);
    expect(results.map((x) => x.kind)).toEqual(["applied", "applied"]);
    expect(value).toBe(2);
  });
});

interface FsEntry {
  kind: "directory" | "file" | "symlink";
  bytes?: Uint8Array;
  target?: string;
}

function enoent(target: string): NodeJS.ErrnoException {
  const error = new Error(`ENOENT: ${target}`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

class FakeCognitionFs implements CognitionStoreFs, RepositoryFs {
  readonly entries = new Map<string, FsEntry>([["/", { kind: "directory" }]]);

  constructor() {
    this.dir("/work");
    this.dir("/work/project");
  }

  dir(target: string): void {
    const normalized = path.posix.normalize(target);
    this.ensureParents(normalized);
    this.entries.set(normalized, { kind: "directory" });
  }

  file(target: string, bytes: Uint8Array): void {
    const normalized = path.posix.normalize(target);
    this.ensureParents(normalized);
    this.entries.set(normalized, { kind: "file", bytes: Uint8Array.from(bytes) });
  }

  symlink(target: string, destination: string): void {
    const normalized = path.posix.normalize(target);
    this.ensureParents(normalized);
    this.entries.set(normalized, { kind: "symlink", target: path.posix.normalize(destination) });
  }

  async mkdir(target: string): Promise<void> {
    this.dir(target);
  }

  async realpathNative(target: string): Promise<string> {
    const normalized = path.posix.normalize(target);
    const entry = this.entries.get(normalized);
    if (!entry) throw enoent(normalized);
    if (entry.kind === "symlink") return this.realpathNative(entry.target!);
    return normalized;
  }

  async stat(target: string): Promise<StorageStat> {
    const canonical = await this.realpathNative(target);
    return this.toStat(this.entries.get(canonical)!);
  }

  async lstat(target: string): Promise<StorageStat> {
    const entry = this.entries.get(path.posix.normalize(target));
    if (!entry) throw enoent(target);
    return this.toStat(entry);
  }

  async readFile(target: string): Promise<Uint8Array> {
    const canonical = await this.realpathNative(target);
    const entry = this.entries.get(canonical);
    if (!entry || entry.kind !== "file") throw enoent(target);
    return Uint8Array.from(entry.bytes!);
  }

  async writeFileExclusive(target: string, bytes: Uint8Array): Promise<void> {
    const normalized = path.posix.normalize(target);
    if (this.entries.has(normalized)) {
      const error = new Error(`EEXIST: ${normalized}`) as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    }
    this.file(normalized, bytes);
  }

  async rename(source: string, destination: string): Promise<void> {
    const sourcePath = path.posix.normalize(source);
    const entry = this.entries.get(sourcePath);
    if (!entry) throw enoent(sourcePath);
    this.ensureParents(destination);
    this.entries.set(path.posix.normalize(destination), entry);
    this.entries.delete(sourcePath);
  }

  async unlink(target: string): Promise<void> {
    const normalized = path.posix.normalize(target);
    const entry = this.entries.get(normalized);
    if (!entry || entry.kind === "directory") throw enoent(normalized);
    this.entries.delete(normalized);
  }

  async readDirectory(target: string): Promise<readonly ManagedDirectoryEntry[]> {
    const normalized = path.posix.normalize(target);
    const root = this.entries.get(normalized);
    if (!root || root.kind !== "directory") throw enoent(normalized);
    return (await this.readdir(normalized)).map((name) => {
      const entry = this.entries.get(path.posix.join(normalized, name))!;
      return { name, kind: entry.kind };
    });
  }

  async readdir(target: string): Promise<readonly string[]> {
    const normalized = path.posix.normalize(target);
    const root = this.entries.get(normalized);
    if (!root || root.kind !== "directory") throw enoent(normalized);
    const prefix = normalized === "/" ? "/" : `${normalized}/`;
    const names = new Set<string>();
    for (const key of this.entries.keys()) {
      if (!key.startsWith(prefix) || key === normalized) continue;
      const rest = key.slice(prefix.length);
      if (rest && !rest.includes("/")) names.add(rest);
    }
    return [...names];
  }

  async exists(target: string): Promise<boolean> {
    return this.entries.has(path.posix.normalize(target));
  }

  private ensureParents(target: string): void {
    let current = path.posix.dirname(path.posix.normalize(target));
    const missing: string[] = [];
    while (!this.entries.has(current)) {
      missing.push(current);
      const parent = path.posix.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    for (const dir of missing.reverse()) this.entries.set(dir, { kind: "directory" });
  }

  private toStat(entry: FsEntry): StorageStat {
    return {
      isDirectory: () => entry.kind === "directory",
      isFile: () => entry.kind === "file",
      isSymbolicLink: () => entry.kind === "symlink",
    };
  }
}

const repositoryBinding = {
  brainRoot: "/brain",
  projectId: "project-1",
  platform: "posix" as const,
} as never;

const projectScopePath = "/brain/projects/project-1";
const projectCorePath = `${projectScopePath}/core.md`;
const documentPath = `${projectScopePath}/memories/knowledge/a.md`;
const companionPath = `${projectScopePath}/.state/memories/knowledge/a.json`;
const scopeStatePath = `${projectScopePath}/.state/scope.json`;
const item = archival("@project/memories/knowledge/a.md");
const documentText = normalizeMarkdownInput(
  "---\nsummary: current truth\nimportance: medium\n---\nbody\n",
);

function seededStore(options: { scopeState?: Uint8Array } = {}): {
  fs: FakeCognitionFs;
  store: CognitionStateStore;
} {
  const fs = new FakeCognitionFs();
  fs.dir("/brain");
  fs.file(projectCorePath, encodeMarkdown(normalizeMarkdownInput("")));
  fs.file(documentPath, encodeMarkdown(documentText));
  if (options.scopeState !== undefined) fs.file(scopeStatePath, options.scopeState);
  return { fs, store: new CognitionStateStore(repositoryBinding, fs) };
}

describe("T3 cognition store truth/fallback boundary", () => {
  it("uses core as scope existence truth and fresh cycle when scope state is missing/malformed", async () => {
    for (const scopeState of [undefined, encoder.encode("{bad")]) {
      const { store } = seededStore({ scopeState });
      await expect(store.loadScope(projectScope)).resolves.toMatchObject({
        core: { text: "" },
        cycle: { cycle: 0 },
      });
    }

    const { fs, store } = seededStore({ scopeState: encodeScopeState({ cycle: 9 }) });
    fs.entries.delete(projectCorePath);
    await expect(store.loadScope(projectScope)).resolves.toBeUndefined();
    await expect(store.readScopeCycle(projectScope)).rejects.toBeDefined();
  });

  it("uses fresh companion state when companion is missing/malformed/stale/or ahead of current cycle", async () => {
    for (const companion of [
      undefined,
      encoder.encode("{bad"),
      encodeCompanion({
        contentHash: hashMarkdownContent("old text"),
        epistemic: { challenge: "old" },
        accessibility: { ageCycles: 2, anchorCycle: 5, durability: 4, exposure: 3 },
      }),
      encodeCompanion({
        contentHash: hashMarkdownContent(documentText),
        epistemic: { challenge: "old" },
        accessibility: { ageCycles: 2, anchorCycle: 8, durability: 4, exposure: 3 },
      }),
    ]) {
      const { fs, store } = seededStore({ scopeState: encodeScopeState({ cycle: 7 }) });
      if (companion !== undefined) fs.file(companionPath, companion);
      await expect(store.loadArchival(item)).resolves.toMatchObject({
        companionState: "fresh",
        epistemic: {},
        accessibility: { ageCycles: 0, anchorCycle: 7, durability: 1, exposure: 0 },
      });
    }
  });

  it("restores current companion and ignores orphan companion without Markdown", async () => {
    const { fs, store } = seededStore({ scopeState: encodeScopeState({ cycle: 7 }) });
    fs.file(
      companionPath,
      encodeCompanion({
        contentHash: hashMarkdownContent(documentText),
        epistemic: { challenge: "verify this" },
        accessibility: { ageCycles: 2, anchorCycle: 5, durability: 4, exposure: 3 },
      }),
    );
    await expect(store.loadArchival(item)).resolves.toMatchObject({
      companionState: "persisted",
      epistemic: { challenge: "verify this" },
      accessibility: { ageCycles: 2, anchorCycle: 5, durability: 4, exposure: 3 },
    });

    fs.entries.delete(documentPath);
    await expect(store.loadArchival(item)).resolves.toBeUndefined();
  });

  it("preflight mutates the E1 canonical target rather than an alias locator", async () => {
    const { fs, store } = seededStore();
    fs.file(`${projectScopePath}/memories/decision/real.md`, encodeMarkdown(documentText));
    fs.symlink(
      `${projectScopePath}/memories/knowledge/alias.md`,
      `${projectScopePath}/memories/decision/real.md`,
    );
    const alias = archival("@project/memories/knowledge/alias.md");
    const prepared = await store.preflight({
      kind: "put",
      ref: persistentArchivalRef(alias),
      bytes: encodeMarkdown(documentText),
    });
    expect(prepared.absolutePath).toBe(`${projectScopePath}/memories/decision/real.md`);
    expect(prepared.ref).toEqual(
      persistentArchivalRef(archival("@project/memories/decision/real.md")),
    );
  });
});

class ScriptedGitRunner implements GitCommandRunner {
  readonly calls: Array<{
    readonly args: readonly string[];
    readonly stdin?: string | Uint8Array;
  }> = [];
  throwOnRun = false;
  initExit = 0;
  addExit = 0;
  diffExit = 1;
  commitExit = 0;
  top = "/brain";

  constructor(private readonly fs?: FakeCognitionFs) {}

  async run(
    args: readonly string[],
    options: { readonly stdin?: string | Uint8Array } = {},
  ): Promise<GitCommandResult> {
    this.calls.push({ args: [...args], stdin: options.stdin });
    if (this.throwOnRun) throw new Error("git unavailable");
    if (args[0] === "init") {
      if (this.initExit === 0) this.fs?.dir("/brain/.git");
      return { exitCode: this.initExit, stdout: "", stderr: "" };
    }
    if (args.join(" ") === "rev-parse --show-toplevel") {
      return { exitCode: 0, stdout: `${this.top}\n`, stderr: "" };
    }
    if (args[0] === "add") return { exitCode: this.addExit, stdout: "", stderr: "" };
    if (args.join(" ") === "diff --cached --quiet --exit-code") {
      return { exitCode: this.diffExit, stdout: "", stderr: "" };
    }
    if (args.includes("commit")) return { exitCode: this.commitExit, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  }
}

describe("T3 E3 optional workspace history", () => {
  it("initializes a non-empty app-owned brainRoot and checkpoints current global/projects workspace", async () => {
    const fs = new FakeCognitionFs();
    fs.dir("/brain");
    fs.file("/brain/global/core.md", encodeMarkdown(normalizeMarkdownInput("global")));
    fs.file("/brain/projects/p/assets/template.xlsx", encoder.encode("asset"));
    const runner = new ScriptedGitRunner(fs);
    const checkpoint = new GitCheckpoint(repositoryBinding, runner, fs);

    await expect(checkpoint.checkpointWorkspace()).resolves.toEqual({ kind: "committed" });
    expect(runner.calls.some((c) => c.args[0] === "init")).toBe(true);
    expect(runner.calls.some((c) => c.args.join(" ") === "add -A -- global projects")).toBe(true);
    expect(runner.calls.some((c) => c.args.includes("symbolic-ref"))).toBe(false);
  });

  it("returns no-change without an empty commit", async () => {
    const fs = new FakeCognitionFs();
    fs.dir("/brain");
    fs.dir("/brain/.git");
    const runner = new ScriptedGitRunner(fs);
    runner.diffExit = 0;
    const checkpoint = new GitCheckpoint(repositoryBinding, runner, fs);
    await expect(checkpoint.checkpointWorkspace()).resolves.toEqual({ kind: "no-change" });
    expect(runner.calls.some((c) => c.args.includes("commit"))).toBe(false);
  });

  it("localizes unavailable/add/commit failures and never repairs working files", async () => {
    const fs = new FakeCognitionFs();
    fs.dir("/brain");
    fs.file("/brain/global/core.md", encoder.encode("current"));

    const unavailable = new ScriptedGitRunner(fs);
    unavailable.throwOnRun = true;
    await expect(
      new GitCheckpoint(repositoryBinding, unavailable, fs).checkpointWorkspace(),
    ).resolves.toMatchObject({
      kind: "unavailable",
    });
    expect(decoder.decode(await fs.readFile("/brain/global/core.md"))).toBe("current");

    fs.dir("/brain/.git");
    const addFailure = new ScriptedGitRunner(fs);
    addFailure.addExit = 1;
    await expect(
      new GitCheckpoint(repositoryBinding, addFailure, fs).checkpointWorkspace(),
    ).resolves.toMatchObject({
      kind: "failed",
    });
    expect(decoder.decode(await fs.readFile("/brain/global/core.md"))).toBe("current");

    const commitFailure = new ScriptedGitRunner(fs);
    commitFailure.commitExit = 1;
    await expect(
      new GitCheckpoint(repositoryBinding, commitFailure, fs).checkpointWorkspace(),
    ).resolves.toMatchObject({
      kind: "failed",
    });
    expect(decoder.decode(await fs.readFile("/brain/global/core.md"))).toBe("current");
  });

  it("refuses to checkpoint through an unexpected repository root without touching the parent repository", async () => {
    const fs = new FakeCognitionFs();
    fs.dir("/brain");
    fs.dir("/brain/.git");
    const runner = new ScriptedGitRunner(fs);
    runner.top = "/work";
    const outcome = await new GitCheckpoint(repositoryBinding, runner, fs).checkpointWorkspace();
    expect(outcome).toMatchObject({ kind: "failed" });
    expect(runner.calls.some((c) => c.args[0] === "add")).toBe(false);
  });
});

describe("T3 runtime bootstrap composition", () => {
  it("requires real global/project cores while scope cycle stays fresh/auxiliary", async () => {
    const fs = new FakeCognitionFs();
    const runner = new ScriptedGitRunner(fs);
    const lease = new FakeLease();
    const runtime = await bootstrapBrainRuntimeInfrastructure(
      {
        brainRoot: "/brain",
        projectId: "project-1",
        platform: "posix",
      },
      { storeFs: fs, historyFs: fs, gitRunner: runner, globalLease: lease },
    );
    await expect(runtime.store.loadScope(globalScope)).resolves.toMatchObject({
      core: { text: "" },
      cycle: { cycle: 0 },
    });
    await expect(runtime.store.loadScope(projectScope)).resolves.toMatchObject({
      core: { text: "" },
      cycle: { cycle: 0 },
    });
    expect(fs.entries.has("/brain/global/.state/scope.json")).toBe(false);
    expect(lease.calls).toBe(1);
  });

  it("keeps runtime usable when optional Git setup is unavailable", async () => {
    const fs = new FakeCognitionFs();
    const runner = new ScriptedGitRunner(fs);
    runner.throwOnRun = true;
    const runtime = await bootstrapBrainRuntimeInfrastructure(
      {
        brainRoot: "/brain",
        projectId: "project-1",
        platform: "posix",
      },
      { storeFs: fs, historyFs: fs, gitRunner: runner, globalLease: new FakeLease() },
    );
    expect((await runtime.store.loadScope(globalScope))?.core.text).toBe("");
    expect((await runtime.store.loadScope(projectScope))?.core.text).toBe("");
  });
});
