import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  CoreCapacityError,
  DocumentSchemaError,
  parseArchivalDocument,
  validateCoreDocument,
} from "../../src/brain/documents.ts";
import {
  EpistemicStateError,
  activeEpistemicState,
  clearChallenge,
  deriveEpistemicStatus,
  setChallenge,
} from "../../src/brain/epistemic.ts";
import {
  COGNITIVE_ROLES,
  NamespaceParseError,
  formatPublicPath,
  isSameLogicalPath,
  parsePublicPath,
  parseResourceLocation,
  parseSessionId,
  type LogicalArchivalPath,
} from "../../src/brain/namespace.ts";
import {
  CodecError,
  decodeCompanion,
  decodeMarkdown,
  decodeScopeState,
  encodeCompanion,
  encodeMarkdown,
  encodeScopeState,
  hashMarkdownContent,
  normalizeMarkdownInput,
} from "../../src/persistence/codecs.ts";
import {
  StorageAliasResolutionError,
  StorageContainmentError,
  StorageNotFoundError,
  companionRef,
  createStorageBinding,
  deriveProjectProjectionSegments,
  projectAbsoluteLocation,
  projectPhysicalResource,
  projectScopeRoot,
  resolveCreateTarget,
  resolveExistingResource,
  scopeRoot,
  type CanonicalProjectRoot,
  type StorageFs,
  type StorageStat,
} from "../../src/persistence/storage.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function errorCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("v2 namespace", () => {
  it("parses canonical memories directories, core, nested directories and archival paths", () => {
    const cases = [
      ["@project/memories", "@project/memories/"],
      ["@session/abc-123/core.md", "@session/abc-123/core.md"],
      ["@project/memories/skill/coding/typescript", "@project/memories/skill/coding/typescript/"],
      [
        "@project/memories/skill/coding/typescript/refactor.md",
        "@project/memories/skill/coding/typescript/refactor.md",
      ],
    ] as const;

    for (const [raw, canonical] of cases) {
      expect(formatPublicPath(parsePublicPath(raw))).toBe(canonical);
    }
  });

  it("keeps one logical identity across directory trailing slash variants", () => {
    expect(
      isSameLogicalPath(
        parsePublicPath("@project/memories/knowledge"),
        parsePublicPath("@project/memories/knowledge/"),
      ),
    ).toBe(true);
  });

  it("rejects invalid session ids, separators, traversal, roles, empty segments and item trailing slash", () => {
    expect(() => parseSessionId("default/other")).toThrow(NamespaceParseError);
    expect(errorCode(() => parsePublicPath("@project\\core.md"))).toBe("invalid-separator");
    expect(errorCode(() => parsePublicPath("@global"))).toBe("invalid-object-shape");
    expect(errorCode(() => parsePublicPath("@project/"))).toBe("invalid-object-shape");
    expect(errorCode(() => parsePublicPath("@session/s1"))).toBe("invalid-object-shape");
    expect(errorCode(() => parsePublicPath("@project//memories"))).toBe("invalid-segment");
    expect(errorCode(() => parsePublicPath("@project/memories/nope/a.md"))).toBe("invalid-role");
    expect(errorCode(() => parsePublicPath("@project/memories/knowledge/../a.md"))).toBe(
      "traversal-segment",
    );
    expect(errorCode(() => parsePublicPath("@project/core.md/"))).toBe("invalid-object-shape");
    expect(errorCode(() => parsePublicPath("@project/memories/knowledge/.md"))).toBe(
      "invalid-object-shape",
    );
  });

  it("keeps the four cognitive roles as a closed top-level ontology", () => {
    expect(COGNITIVE_ROLES).toEqual(["decision", "knowledge", "intention", "skill"]);
    expect(errorCode(() => parsePublicPath("@project/memories/other/x.md"))).toBe("invalid-role");
  });

  it("accepts the frozen session-id baseline only", () => {
    expect(parseSessionId("01a02871-e448-7bb1-b50c-3525cd2da5da")).toBe(
      "01a02871-e448-7bb1-b50c-3525cd2da5da",
    );
    expect(() => parseSessionId(".")).toThrow(NamespaceParseError);
    expect(() => parseSessionId("..")).toThrow(NamespaceParseError);
    expect(() => parseSessionId("x".repeat(129))).toThrow(NamespaceParseError);
  });
});

describe("v2 markdown and cognition codecs", () => {
  it("normalizes BOM/CRLF/lone CR once and writes UTF-8 without BOM", () => {
    const logical = decodeMarkdown(encoder.encode("\uFEFFa\r\nb\rc"));
    expect(logical).toBe("a\nb\nc");
    expect(decoder.decode(encodeMarkdown(logical))).toBe("a\nb\nc");
    expect(normalizeMarkdownInput("\uFEFFx\r\ny")).toBe("x\ny");
  });

  it("rejects invalid UTF-8 instead of replacement-character decoding", () => {
    expect(() => decodeMarkdown(Uint8Array.from([0xff]))).toThrow(CodecError);
    expect(errorCode(() => decodeMarkdown(Uint8Array.from([0xff])))).toBe("invalid-utf8");
  });

  it("parses archival summary/importance as the only mechanism frontmatter keys", () => {
    const text = normalizeMarkdownInput(
      "---\nsummary: '  Current gist  '\nimportance: high\ntype: knowledge\ncustom:\n  x: 1\n---\n\nBody\n",
    );
    const doc = parseArchivalDocument(text);
    expect(doc.summary).toBe("Current gist");
    expect(doc.importance).toBe("high");
    expect(doc.body).toBe("\nBody\n");
    expect(doc.text).toBe(text);
  });

  it("rejects malformed archival envelopes and semantic fields without repairing them", () => {
    const invalid = [
      ["body", "missing-frontmatter"],
      ["---\nsummary: x\nimportance: high", "unterminated-frontmatter"],
      ["---\n- x\n---\n", "frontmatter-not-map"],
      ["---\nimportance: high\n---\n", "missing-summary"],
      ["---\nsummary: '   '\nimportance: high\n---\n", "invalid-summary"],
      ["---\nsummary: x\n---\n", "missing-importance"],
      ["---\nsummary: x\nimportance: HIGH\n---\n", "invalid-importance"],
    ] as const;

    for (const [raw, code] of invalid) {
      try {
        parseArchivalDocument(normalizeMarkdownInput(raw));
        throw new Error("expected parse failure");
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentSchemaError);
        expect((error as DocumentSchemaError).code).toBe(code);
      }
    }
  });

  it("counts core capacity in Unicode code points", () => {
    expect(validateCoreDocument(normalizeMarkdownInput("😀".repeat(4000))).kind).toBe("core");
    expect(() => validateCoreDocument(normalizeMarkdownInput("😀".repeat(4001)))).toThrow(
      CoreCapacityError,
    );
  });

  it("keeps C2 as challenge-only state", () => {
    const active = activeEpistemicState();
    expect(deriveEpistemicStatus(active)).toBe("active");
    const questioned = setChallenge(active, "  unresolved issue  ");
    expect(questioned).toEqual({ challenge: "unresolved issue" });
    expect(deriveEpistemicStatus(questioned)).toBe("questioned");
    expect(clearChallenge(questioned)).toEqual({});
    expect(() => setChallenge(active, "   ")).toThrow(EpistemicStateError);
    expect(() => clearChallenge(active)).toThrow(EpistemicStateError);
  });

  it("strictly round-trips scope and companion JSON with deterministic fields", () => {
    expect(decoder.decode(encodeScopeState({ cycle: 42 }))).toBe('{\n  "cycle": 42\n}\n');
    expect(decodeScopeState(encodeScopeState({ cycle: 42 }))).toEqual({ cycle: 42 });
    expect(errorCode(() => decodeScopeState(encoder.encode('{"cycle":1,"extra":true}')))).toBe(
      "invalid-scope-state",
    );

    const contentHash = hashMarkdownContent("doc");
    const bytes = encodeCompanion({
      contentHash,
      epistemic: { challenge: "Check premise" },
      accessibility: { ageCycles: 3, anchorCycle: 42, durability: 2, exposure: 1 },
    });
    expect(decoder.decode(bytes)).toBe(
      `{\n  "contentHash": "${contentHash}",\n  "challenge": "Check premise",\n  "ageCycles": 3,\n  "anchorCycle": 42,\n  "durability": 2,\n  "exposure": 1\n}\n`,
    );
    expect(decodeCompanion(bytes)).toEqual({
      contentHash,
      epistemic: { challenge: "Check premise" },
      accessibility: { ageCycles: 3, anchorCycle: 42, durability: 2, exposure: 1 },
    });
    expect(
      errorCode(() =>
        decodeCompanion(
          encoder.encode(
            `{"contentHash":"${contentHash}","challenge":"  bad  ","ageCycles":0,"anchorCycle":0,"durability":1,"exposure":0}`,
          ),
        ),
      ),
    ).toBe("invalid-companion-state");
  });
});

type Entry =
  | { readonly kind: "directory" }
  | { readonly kind: "file" }
  | { readonly kind: "symlink"; readonly target: string };

class FakePosixStorageFs implements StorageFs {
  private readonly entries = new Map<string, Entry>([["/", { kind: "directory" }]]);

  constructor() {
    this.dir("/work");
    this.dir("/work/project");
  }

  dir(target: string): void {
    this.ensureParents(target);
    this.entries.set(path.posix.normalize(target), { kind: "directory" });
  }

  file(target: string): void {
    this.ensureParents(target);
    this.entries.set(path.posix.normalize(target), { kind: "file" });
  }

  symlink(target: string, destination: string): void {
    this.ensureParents(target);
    this.entries.set(path.posix.normalize(target), {
      kind: "symlink",
      target: path.posix.normalize(destination),
    });
  }

  mkdir = async (target: string): Promise<void> => {
    this.dir(target);
  };

  realpathNative = async (target: string): Promise<string> => {
    return this.resolveRealPath(path.posix.normalize(target), new Set());
  };

  private async resolveRealPath(target: string, seen: Set<string>): Promise<string> {
    if (seen.has(target)) {
      const error = new Error(`ELOOP: ${target}`) as NodeJS.ErrnoException;
      error.code = "ELOOP";
      throw error;
    }
    seen.add(target);

    if (target === "/") return "/";
    const segments = target.split("/").filter(Boolean);
    let current = "/";
    for (let index = 0; index < segments.length; index += 1) {
      const candidate = path.posix.join(current, segments[index]!);
      const entry = this.entries.get(candidate);
      if (!entry) throw this.enoent(candidate);
      if (entry.kind === "symlink") {
        const resolvedTarget = await this.resolveRealPath(entry.target, seen);
        const remainder = segments.slice(index + 1);
        if (remainder.length === 0) return resolvedTarget;
        return this.resolveRealPath(path.posix.join(resolvedTarget, ...remainder), seen);
      }
      current = candidate;
    }
    return current;
  }

  stat = async (target: string): Promise<StorageStat> => {
    const canonical = await this.realpathNative(target);
    const entry = this.entries.get(canonical);
    if (!entry || entry.kind === "symlink") throw this.enoent(canonical);
    return this.stats(entry.kind);
  };

  lstat = async (target: string): Promise<StorageStat> => {
    const normalized = path.posix.normalize(target);
    const entry = this.entries.get(normalized);
    if (!entry) throw this.enoent(normalized);
    if (entry.kind === "symlink") {
      return { isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true };
    }
    return this.stats(entry.kind);
  };

  private stats(kind: "directory" | "file"): StorageStat {
    return {
      isDirectory: () => kind === "directory",
      isFile: () => kind === "file",
      isSymbolicLink: () => false,
    };
  }

  private ensureParents(target: string): void {
    let current = path.posix.dirname(path.posix.normalize(target));
    while (!this.entries.has(current)) {
      this.entries.set(current, { kind: "directory" });
      const parent = path.posix.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  private enoent(target: string): NodeJS.ErrnoException {
    const error = new Error(`ENOENT: ${target}`) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    return error;
  }
}

describe("v2 storage projection and containment", () => {
  it("derives deterministic win-drive, UNC and POSIX project projections", () => {
    expect(
      deriveProjectProjectionSegments(
        "d:\\Workspace\\ai-projects\\c-skills" as CanonicalProjectRoot,
        "win32",
      ),
    ).toEqual(["root=win-drive", "p=D", "p=Workspace", "p=ai-projects", "p=c-skills"]);
    expect(
      deriveProjectProjectionSegments(
        "\\\\server\\share\\team\\project" as CanonicalProjectRoot,
        "win32",
      ),
    ).toEqual(["root=win-unc", "p=server", "p=share", "p=team", "p=project"]);
    expect(
      deriveProjectProjectionSegments("/home/maple/project" as CanonicalProjectRoot, "posix"),
    ).toEqual(["root=posix", "p=home", "p=maple", "p=project"]);
  });

  it("binds a project and projects public/hidden resources without raw hidden paths", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      homeDir: "/home/test",
      platform: "posix",
      fs,
    });
    expect(projectScopeRoot(binding)).toBe("/brain/projects/root=posix/p=work/p=project/scope");
    expect(scopeRoot(binding, { kind: "global" })).toBe("/brain/global");

    const item = parsePublicPath(
      "@session/s1/memories/skill/coding/refactor.md",
    ) as LogicalArchivalPath;
    expect(projectPhysicalResource(binding, { kind: "public", path: item }).absolutePath).toBe(
      "/brain/projects/root=posix/p=work/p=project/scope/sessions/s1/memories/skill/coding/refactor.md",
    );
    expect(projectPhysicalResource(binding, companionRef(item)).absolutePath).toBe(
      "/brain/projects/root=posix/p=work/p=project/scope/sessions/s1/.state/memories/skill/coding/refactor.json",
    );
  });

  it("maps permissive brain workspace locations to absolute paths without requiring existence", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      homeDir: "/home/test",
      platform: "posix",
      fs,
    });

    expect(projectAbsoluteLocation(binding, parseResourceLocation("@project"))).toBe(
      "/brain/projects/root=posix/p=work/p=project/scope",
    );
    expect(
      projectAbsoluteLocation(
        binding,
        parseResourceLocation("@project/memories/skill/report/template.xlsx"),
      ),
    ).toBe("/brain/projects/root=posix/p=work/p=project/scope/memories/skill/report/template.xlsx");
    expect(
      projectAbsoluteLocation(
        binding,
        parseResourceLocation("@session/s1/memories/skill/report/future/run.py"),
      ),
    ).toBe(
      "/brain/projects/root=posix/p=work/p=project/scope/sessions/s1/memories/skill/report/future/run.py",
    );

    expect(() => parseResourceLocation("@project/.state/scope.json")).toThrow(NamespaceParseError);
    expect(() => parseResourceLocation("@project/memories/skill/../secret.txt")).toThrow(
      NamespaceParseError,
    );
    expect(() => parsePublicPath("@project/memories/skill/report/template.xlsx")).not.toThrow();
    expect(parsePublicPath("@project/memories/skill/report/template.xlsx")).toMatchObject({
      kind: "directory",
    });
  });

  it("rejects a symlink in an absent-scope managed structural chain", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    fs.dir("/outside");
    fs.symlink("/brain/projects", "/outside");
    const core = parsePublicPath("@project/core.md");
    await expect(
      resolveCreateTarget(binding, { kind: "public", path: core }, fs),
    ).rejects.toBeInstanceOf(StorageContainmentError);
  });

  it("rejects an existing scope when a managed parent structural directory is a symlink", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    fs.dir("/outside/projects");
    fs.symlink("/brain/projects", "/outside/projects");
    const core = parsePublicPath("@project/core.md");
    await expect(
      resolveExistingResource(binding, { kind: "public", path: core }, fs),
    ).rejects.toBeInstanceOf(StorageContainmentError);
  });
  it("rejects create into an existing scope when a managed parent structural directory is a symlink", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    fs.dir("/outside/projects/root=posix/p=work/p=project/scope");
    fs.symlink("/brain/projects", "/outside/projects");
    const item = parsePublicPath("@project/memories/knowledge/new.md");
    await expect(
      resolveCreateTarget(binding, { kind: "public", path: item }, fs),
    ).rejects.toBeInstanceOf(StorageContainmentError);
  });
  it("rejects an existing target whose real path escapes its scope", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir(root);
    fs.dir("/outside");
    fs.file("/outside/core.md");
    fs.symlink(`${root}/core.md`, "/outside/core.md");
    const core = parsePublicPath("@project/core.md");
    await expect(
      resolveExistingResource(binding, { kind: "public", path: core }, fs),
    ).rejects.toBeInstanceOf(StorageContainmentError);
  });
});
describe("v2 frozen foundation seam coverage", () => {
  it("round-trips all public ontology shapes and keeps hidden state outside the grammar", () => {
    const paths = [
      "@global/core.md",
      "@global/memories/",
      "@project/memories/decision/",
      "@project/memories/knowledge/topic/",
      "@project/memories/intention/roadmap/next.md",
      "@session/s1/core.md",
      "@session/s1/memories/skill/coding/refactor.md",
    ];
    for (const raw of paths) expect(formatPublicPath(parsePublicPath(raw))).toBe(raw);
    expect(errorCode(() => parsePublicPath("@global/"))).toBe("invalid-object-shape");
    expect(errorCode(() => parsePublicPath("@session/s1/"))).toBe("invalid-object-shape");
    expect(errorCode(() => parsePublicPath("@project/.state/"))).toBe("invalid-object-shape");
    expect(errorCode(() => parsePublicPath("@session/s1/memories/skill/a.md/"))).toBe(
      "invalid-object-shape",
    );
  });

  it("keeps project projection segments collision-free by structural prefixes", () => {
    const parent = deriveProjectProjectionSegments(
      "D:\\scope\\global\\projects" as CanonicalProjectRoot,
      "win32",
    );
    const child = deriveProjectProjectionSegments(
      "D:\\scope\\global\\projects\\scope" as CanonicalProjectRoot,
      "win32",
    );
    expect(parent).toEqual(["root=win-drive", "p=D", "p=scope", "p=global", "p=projects"]);
    expect(child).toEqual([...parent, "p=scope"]);
  });

  it("maps global, project and session roots symmetrically", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    expect(scopeRoot(binding, { kind: "global" })).toBe("/brain/global");
    expect(scopeRoot(binding, { kind: "project" })).toBe(
      "/brain/projects/root=posix/p=work/p=project/scope",
    );
    expect(scopeRoot(binding, { kind: "session", sessionId: parseSessionId("s1") })).toBe(
      "/brain/projects/root=posix/p=work/p=project/scope/sessions/s1",
    );
  });

  it("normalizes projectRoot through realpath once", async () => {
    const fs = new FakePosixStorageFs();
    fs.symlink("/work/link", "/work/project");
    const binding = await createStorageBinding({
      projectRoot: "/work/link",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    expect(binding.projectRoot).toBe("/work/project");
  });

  it("resolves an existing contained file and rejects a missing existing file", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir(root);
    fs.file(`${root}/core.md`);
    const core = parsePublicPath("@project/core.md");
    const resolved = await resolveExistingResource(binding, { kind: "public", path: core }, fs);
    expect(resolved.canonicalPath).toBe(`${root}/core.md`);
    expect(resolved.aliasFollowed).toBe(false);
    expect(resolved.requestedRef).toEqual({ kind: "public", path: core });
    expect(resolved.canonicalRef).toEqual({ kind: "public", path: core });

    const missing = parsePublicPath("@project/memories/knowledge/missing.md");
    await expect(
      resolveExistingResource(binding, { kind: "public", path: missing }, fs),
    ).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it("resolves create targets from the nearest contained parent and rejects cross-scope parent symlinks", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const projectRoot = projectScopeRoot(binding);
    fs.dir(projectRoot);
    const item = parsePublicPath("@project/memories/knowledge/nested/new.md");
    expect(
      (await resolveCreateTarget(binding, { kind: "public", path: item }, fs)).absolutePath,
    ).toBe(`${projectRoot}/memories/knowledge/nested/new.md`);

    fs.dir("/brain/global/memories");
    fs.symlink(`${projectRoot}/memories`, "/brain/global/memories");
    await expect(
      resolveCreateTarget(binding, { kind: "public", path: item }, fs),
    ).rejects.toBeInstanceOf(StorageContainmentError);
  });

  it("follows same-scope public aliases and returns the resolved canonical cognition identity", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir(`${root}/memories/knowledge`);
    fs.dir(`${root}/memories/decision`);
    fs.file(`${root}/memories/decision/real.md`);
    fs.symlink(`${root}/memories/knowledge/alias.md`, `${root}/memories/decision/real.md`);

    const requested = parsePublicPath("@project/memories/knowledge/alias.md");
    const resolved = await resolveExistingResource(
      binding,
      { kind: "public", path: requested },
      fs,
    );
    expect(resolved.aliasFollowed).toBe(true);
    expect(resolved.canonicalPath).toBe(`${root}/memories/decision/real.md`);
    expect(resolved.canonicalRef.kind).toBe("public");
    if (resolved.canonicalRef.kind !== "public") throw new Error("expected public canonical ref");
    expect(formatPublicPath(resolved.canonicalRef.path)).toBe("@project/memories/decision/real.md");
  });

  it("follows a same-scope public directory alias for create targets", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir(`${root}/memories/skill`);
    fs.dir(`${root}/memories/decision/real-dir`);
    fs.symlink(`${root}/memories/skill/alias-dir`, `${root}/memories/decision/real-dir`);

    const requested = parsePublicPath("@project/memories/skill/alias-dir/new.md");
    const resolved = await resolveCreateTarget(binding, { kind: "public", path: requested }, fs);
    expect(resolved.aliasFollowed).toBe(true);
    expect(resolved.canonicalPath).toBe(`${root}/memories/decision/real-dir/new.md`);
    expect(resolved.canonicalRef.kind).toBe("public");
    if (resolved.canonicalRef.kind !== "public") throw new Error("expected public canonical ref");
    expect(formatPublicPath(resolved.canonicalRef.path)).toBe(
      "@project/memories/decision/real-dir/new.md",
    );
  });

  it("keeps the resolved target object kind instead of the alias entry shape", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir(`${root}/memories/knowledge`);
    fs.file(`${root}/core.md`);
    fs.symlink(`${root}/memories/knowledge/looks-archival.md`, `${root}/core.md`);

    const requested = parsePublicPath("@project/memories/knowledge/looks-archival.md");
    const resolved = await resolveExistingResource(
      binding,
      { kind: "public", path: requested },
      fs,
    );
    expect(resolved.canonicalRef.kind).toBe("public");
    if (resolved.canonicalRef.kind !== "public") throw new Error("expected public canonical ref");
    expect(resolved.canonicalRef.path.kind).toBe("core");
    expect(formatPublicPath(resolved.canonicalRef.path)).toBe("@project/core.md");
  });
  it("reports a broken public alias as an alias-resolution failure", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir(`${root}/memories/knowledge`);
    fs.symlink(
      `${root}/memories/knowledge/broken.md`,
      `${root}/memories/knowledge/missing-target.md`,
    );
    const requested = parsePublicPath("@project/memories/knowledge/broken.md");
    await expect(
      resolveExistingResource(binding, { kind: "public", path: requested }, fs),
    ).rejects.toBeInstanceOf(StorageAliasResolutionError);
  });

  it("keeps hidden companion paths strict even when the public workspace allows aliases", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir(`${root}/.state/memories/knowledge`);
    fs.file(`${root}/.state/memories/knowledge/real.json`);
    fs.symlink(
      `${root}/.state/memories/knowledge/item.json`,
      `${root}/.state/memories/knowledge/real.json`,
    );
    const item = parsePublicPath("@project/memories/knowledge/item.md") as LogicalArchivalPath;
    await expect(resolveExistingResource(binding, companionRef(item), fs)).rejects.toBeInstanceOf(
      StorageContainmentError,
    );
  });

  it("rejects a materialized scope root that is itself a symlink", async () => {
    const fs = new FakePosixStorageFs();
    const binding = await createStorageBinding({
      projectRoot: "/work/project",
      brainRoot: "/brain",
      platform: "posix",
      fs,
    });
    const root = projectScopeRoot(binding);
    fs.dir("/outside/project-scope");
    fs.symlink(root, "/outside/project-scope");
    const core = parsePublicPath("@project/core.md");
    await expect(
      resolveCreateTarget(binding, { kind: "public", path: core }, fs),
    ).rejects.toBeInstanceOf(StorageContainmentError);
  });

  it("preserves archival YAML text while handling comments and indented delimiter-like block content", () => {
    const text = normalizeMarkdownInput(
      "---\n# comment\nsummary: |\n  Current gist\n  ---\nimportance: critical\ncustom:\n  nested: true\n---\nBody",
    );
    const doc = parseArchivalDocument(text);
    expect(doc.summary).toBe("Current gist\n---");
    expect(doc.importance).toBe("critical");
    expect(doc.body).toBe("Body");
    expect(doc.text).toBe(text);
  });

  it("accepts all four importance values and rejects numeric, boolean and unknown values", () => {
    for (const importance of ["low", "medium", "high", "critical"] as const) {
      expect(
        parseArchivalDocument(
          normalizeMarkdownInput(`---\nsummary: x\nimportance: ${importance}\n---`),
        ).importance,
      ).toBe(importance);
    }
    for (const value of ["0.5", "true", "urgent"]) {
      expect(
        errorCode(() =>
          parseArchivalDocument(
            normalizeMarkdownInput(`---\nsummary: x\nimportance: ${value}\n---`),
          ),
        ),
      ).toBe("invalid-importance");
    }
  });

  it("rejects non-string summary and accepts a minimal archival document with empty body", () => {
    expect(
      errorCode(() =>
        parseArchivalDocument(normalizeMarkdownInput("---\nsummary: 42\nimportance: low\n---")),
      ),
    ).toBe("invalid-summary");
    const minimal = parseArchivalDocument(
      normalizeMarkdownInput("---\nsummary: x\nimportance: low\n---"),
    );
    expect(minimal.body).toBe("");
  });

  it("normalizes core newlines before applying the code-point boundary and keeps empty core valid", () => {
    expect(validateCoreDocument(normalizeMarkdownInput("")).text).toBe("");
    const raw = `${"a".repeat(3999)}\r\n`;
    expect(validateCoreDocument(normalizeMarkdownInput(raw)).text.endsWith("\n")).toBe(true);
  });

  it("replaces repeated challenges instead of accumulating history", () => {
    const first = setChallenge(activeEpistemicState(), "first");
    expect(setChallenge(first, " second ")).toEqual({ challenge: "second" });
  });

  it("round-trips active companion and rejects missing, unknown and invalid numeric fields", () => {
    const activeHash = hashMarkdownContent("active");
    const activeBytes = encodeCompanion({
      contentHash: activeHash,
      epistemic: {},
      accessibility: { ageCycles: 0, anchorCycle: 0, durability: 1, exposure: 0 },
    });
    expect(decodeCompanion(activeBytes)).toEqual({
      contentHash: activeHash,
      epistemic: {},
      accessibility: { ageCycles: 0, anchorCycle: 0, durability: 1, exposure: 0 },
    });

    const invalidRecords = [
      '{"anchorCycle":0,"durability":1,"exposure":0}',
      '{"ageCycles":0,"anchorCycle":0,"durability":1,"exposure":0,"extra":1}',
      '{"ageCycles":-1,"anchorCycle":0,"durability":1,"exposure":0}',
      '{"ageCycles":0.5,"anchorCycle":0,"durability":1,"exposure":0}',
      '{"ageCycles":0,"anchorCycle":0.5,"durability":1,"exposure":0}',
      '{"ageCycles":0,"anchorCycle":0,"durability":0,"exposure":0}',
      '{"ageCycles":0,"anchorCycle":0,"durability":1,"exposure":-1}',
    ];
    for (const record of invalidRecords) {
      expect(errorCode(() => decodeCompanion(encoder.encode(record)))).toBe(
        "invalid-companion-state",
      );
    }
  });
});
