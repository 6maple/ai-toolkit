import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import properLockfile from "proper-lockfile";
import { describe, expect, it } from "vite-plus/test";

import { FileGlobalSemanticLease } from "../../src/persistence/operation-coordination.ts";
import {
  ProjectMappingError,
  addProjectSourceRoot,
  removeProjectSourceRoot,
  resolveOrCreateProject,
} from "../../src/persistence/project-mapping.ts";

describe("v2 project mapping", () => {
  it("keeps project-mapping and semantic lock ownership independent in one process", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-independent-locks-"));
    const brainRoot = path.join(temp, "brain");
    await fs.mkdir(brainRoot, { recursive: true });
    let releaseMapping: (() => Promise<void>) | undefined;
    try {
      releaseMapping = await properLockfile.lock(brainRoot, {
        lockfilePath: path.join(brainRoot, ".brain-project-mapping.lock"),
        retries: 0,
        stale: 10_000,
        update: 5_000,
        realpath: true,
        onCompromised: () => undefined,
      });

      const semantic = new FileGlobalSemanticLease(brainRoot);
      await expect(semantic.runExclusive(undefined, async () => "ok")).resolves.toBe("ok");
      await expect(releaseMapping()).resolves.toBeUndefined();
      releaseMapping = undefined;
    } finally {
      await releaseMapping?.().catch(() => undefined);
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("creates one stable project mapping for a source directory", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-project-mapping-"));
    const brainRoot = path.join(temp, "brain");
    const sourceRoot = path.join(temp, "source");
    await fs.mkdir(sourceRoot, { recursive: true });
    try {
      const created = await resolveOrCreateProject({ brainRoot, sourceRoot });
      const resolved = await resolveOrCreateProject({ brainRoot, sourceRoot });

      expect(resolved).toEqual(created);
      expect(created.name).toBe("source");
      expect(created.sourceRoots).toEqual([await fs.realpath(sourceRoot)]);
      const stored = JSON.parse(
        await fs.readFile(
          path.join(brainRoot, "projects", created.projectId, "project.json"),
          "utf8",
        ),
      ) as unknown;
      expect(stored).toEqual(created);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("serializes concurrent project creation for the same source directory", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-project-mapping-race-"));
    const brainRoot = path.join(temp, "brain");
    const sourceRoot = path.join(temp, "source");
    await fs.mkdir(sourceRoot, { recursive: true });
    try {
      const resolved = await Promise.all(
        Array.from({ length: 12 }, () => resolveOrCreateProject({ brainRoot, sourceRoot })),
      );

      expect(new Set(resolved.map((project) => project.projectId)).size).toBe(1);
      const projectDirectories = await fs.readdir(path.join(brainRoot, "projects"));
      expect(projectDirectories).toEqual([resolved[0]!.projectId]);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("adds and removes multiple source directories without changing project identity", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-project-roots-"));
    const brainRoot = path.join(temp, "brain");
    const first = path.join(temp, "first");
    const second = path.join(temp, "second");
    await Promise.all([fs.mkdir(first), fs.mkdir(second)]);
    try {
      const project = await resolveOrCreateProject({ brainRoot, sourceRoot: first });
      const added = await addProjectSourceRoot(brainRoot, project.projectId, second);
      expect(added.projectId).toBe(project.projectId);
      expect(added.sourceRoots).toEqual([await fs.realpath(first), await fs.realpath(second)]);

      const resolvedFromSecond = await resolveOrCreateProject({ brainRoot, sourceRoot: second });
      expect(resolvedFromSecond.projectId).toBe(project.projectId);

      const removed = await removeProjectSourceRoot(brainRoot, project.projectId, first);
      expect(removed.projectId).toBe(project.projectId);
      expect(removed.sourceRoots).toEqual([await fs.realpath(second)]);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects assigning one source directory to two projects", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-project-conflict-"));
    const brainRoot = path.join(temp, "brain");
    const first = path.join(temp, "first");
    const second = path.join(temp, "second");
    await Promise.all([fs.mkdir(first), fs.mkdir(second)]);
    try {
      const firstProject = await resolveOrCreateProject({ brainRoot, sourceRoot: first });
      const secondProject = await resolveOrCreateProject({ brainRoot, sourceRoot: second });
      await expect(
        addProjectSourceRoot(brainRoot, secondProject.projectId, first),
      ).rejects.toBeInstanceOf(ProjectMappingError);
      expect((await resolveOrCreateProject({ brainRoot, sourceRoot: first })).projectId).toBe(
        firstProject.projectId,
      );
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
});
