import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import properLockfile from "proper-lockfile";

import { parseProjectId, type ProjectId } from "./storage.ts";

export interface ProjectMetadata {
  readonly schemaVersion: 1;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly sourceRoots: readonly string[];
}

export type ProjectMappingErrorCode =
  | "source-root-invalid"
  | "project-metadata-invalid"
  | "project-mapping-unavailable"
  | "project-not-found"
  | "source-root-conflict";

export class ProjectMappingError extends Error {
  readonly code: ProjectMappingErrorCode;

  constructor(code: ProjectMappingErrorCode, options?: { cause?: unknown }) {
    super(`brain project mapping failed: ${code}`, options);
    this.name = "ProjectMappingError";
    this.code = code;
  }
}

export interface ResolveProjectOptions {
  readonly brainRoot: string;
  readonly sourceRoot: string;
}

function normalizeCanonicalPath(value: string): string {
  if (process.platform === "win32" && /^[A-Za-z]:\\/.test(value)) {
    return `${value[0]!.toUpperCase()}${value.slice(1)}`;
  }
  return value;
}

function samePath(a: string, b: string): boolean {
  return path.relative(a, b) === "";
}

async function canonicalExistingDirectory(value: string): Promise<string> {
  try {
    const canonical = normalizeCanonicalPath(await fs.realpath(path.resolve(value)));
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch (error) {
    throw new ProjectMappingError("source-root-invalid", { cause: error });
  }
}

function parseMetadata(value: unknown, expectedProjectId: string): ProjectMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProjectMappingError("project-metadata-invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || record.projectId !== expectedProjectId) {
    throw new ProjectMappingError("project-metadata-invalid");
  }
  let projectId: ProjectId;
  try {
    projectId = parseProjectId(expectedProjectId);
  } catch (error) {
    throw new ProjectMappingError("project-metadata-invalid", { cause: error });
  }
  if (typeof record.name !== "string" || record.name.trim() === "") {
    throw new ProjectMappingError("project-metadata-invalid");
  }
  if (
    !Array.isArray(record.sourceRoots) ||
    record.sourceRoots.some((root) => typeof root !== "string")
  ) {
    throw new ProjectMappingError("project-metadata-invalid");
  }
  const sourceRoots = record.sourceRoots as string[];
  if (
    sourceRoots.some((root) => !path.isAbsolute(root)) ||
    sourceRoots.some((root, index) =>
      sourceRoots.slice(0, index).some((seen) => samePath(seen, root)),
    )
  ) {
    throw new ProjectMappingError("project-metadata-invalid");
  }
  return {
    schemaVersion: 1,
    projectId,
    name: record.name,
    sourceRoots: [...sourceRoots],
  };
}

function projectsRoot(brainRoot: string): string {
  return path.join(path.resolve(brainRoot), "projects");
}

function metadataPath(brainRoot: string, projectId: string): string {
  return path.join(projectsRoot(brainRoot), projectId, "project.json");
}

const PROJECT_MAPPING_LOCK_STALE_MS = 10_000;
const PROJECT_MAPPING_LOCK_UPDATE_MS = 5_000;
const PROJECT_MAPPING_LOCK_RETRIES = 100;
const PROJECT_MAPPING_LOCK_RETRY_MS = 25;

async function withProjectMappingLock<T>(
  brainRootValue: string,
  operation: () => Promise<T>,
): Promise<T> {
  const brainRoot = path.resolve(brainRootValue);
  try {
    await fs.mkdir(brainRoot, { recursive: true });
  } catch (error) {
    throw new ProjectMappingError("project-mapping-unavailable", { cause: error });
  }

  let compromised: Error | undefined;
  let release: (() => Promise<void>) | undefined;
  let acquireError: unknown;
  const lockPath = path.join(brainRoot, ".brain-project-mapping.lock");
  for (let attempt = 0; attempt < PROJECT_MAPPING_LOCK_RETRIES; attempt += 1) {
    try {
      release = await properLockfile.lock(lockPath, {
        lockfilePath: lockPath,
        retries: 0,
        stale: PROJECT_MAPPING_LOCK_STALE_MS,
        update: PROJECT_MAPPING_LOCK_UPDATE_MS,
        realpath: false,
        onCompromised: (error) => {
          compromised = error;
        },
      });
      break;
    } catch (error) {
      acquireError = error;
      if (!isErrno(error, "ELOCKED")) break;
      if (attempt + 1 < PROJECT_MAPPING_LOCK_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, PROJECT_MAPPING_LOCK_RETRY_MS));
      }
    }
  }
  if (!release) {
    throw new ProjectMappingError("project-mapping-unavailable", { cause: acquireError });
  }

  let result: T | undefined;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }

  let releaseError: unknown;
  try {
    if (compromised) throw compromised;
    await release();
  } catch (error) {
    releaseError = error;
  }

  if (operationError !== undefined) throw operationError;
  if (releaseError !== undefined) {
    throw new ProjectMappingError("project-mapping-unavailable", { cause: releaseError });
  }
  return result as T;
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function readMetadata(brainRoot: string, projectId: string): Promise<ProjectMetadata> {
  try {
    const text = await fs.readFile(metadataPath(brainRoot, projectId), "utf8");
    return parseMetadata(JSON.parse(text) as unknown, projectId);
  } catch (error) {
    if (error instanceof ProjectMappingError) throw error;
    throw new ProjectMappingError("project-metadata-invalid", { cause: error });
  }
}

export async function listProjectMetadata(brainRoot: string): Promise<readonly ProjectMetadata[]> {
  const root = projectsRoot(brainRoot);
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projectIds = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  return Promise.all(projectIds.map((projectId) => readMetadata(brainRoot, projectId)));
}

async function writeMetadata(brainRoot: string, metadata: ProjectMetadata): Promise<void> {
  const target = metadataPath(brainRoot, metadata.projectId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomUUID()}`;
  await fs.writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function resolveOrCreateProject(
  options: ResolveProjectOptions,
): Promise<ProjectMetadata> {
  const sourceRoot = await canonicalExistingDirectory(options.sourceRoot);
  return withProjectMappingLock(options.brainRoot, async () => {
    const projects = await listProjectMetadata(options.brainRoot);
    const matches = projects.filter((project) =>
      project.sourceRoots.some((candidate) => samePath(candidate, sourceRoot)),
    );
    if (matches.length > 1) throw new ProjectMappingError("source-root-conflict");
    if (matches.length === 1) return matches[0]!;

    const metadata: ProjectMetadata = {
      schemaVersion: 1,
      projectId: parseProjectId(randomUUID()),
      name: path.basename(sourceRoot) || sourceRoot,
      sourceRoots: [sourceRoot],
    };
    await writeMetadata(options.brainRoot, metadata);
    return metadata;
  });
}

export async function addProjectSourceRoot(
  brainRoot: string,
  projectId: string,
  sourceRootValue: string,
): Promise<ProjectMetadata> {
  const sourceRoot = await canonicalExistingDirectory(sourceRootValue);
  return withProjectMappingLock(brainRoot, async () => {
    const projects = await listProjectMetadata(brainRoot);
    const target = projects.find((project) => project.projectId === projectId);
    if (!target) throw new ProjectMappingError("project-not-found");
    const owner = projects.find((project) =>
      project.sourceRoots.some((candidate) => samePath(candidate, sourceRoot)),
    );
    if (owner && owner.projectId !== target.projectId) {
      throw new ProjectMappingError("source-root-conflict");
    }
    if (owner) return target;

    const updated = { ...target, sourceRoots: [...target.sourceRoots, sourceRoot] };
    await writeMetadata(brainRoot, updated);
    return updated;
  });
}

export async function removeProjectSourceRoot(
  brainRoot: string,
  projectId: string,
  sourceRootValue: string,
): Promise<ProjectMetadata> {
  const resolved = normalizeCanonicalPath(path.resolve(sourceRootValue));
  return withProjectMappingLock(brainRoot, async () => {
    const projects = await listProjectMetadata(brainRoot);
    const target = projects.find((project) => project.projectId === projectId);
    if (!target) throw new ProjectMappingError("project-not-found");
    const updated = {
      ...target,
      sourceRoots: target.sourceRoots.filter((candidate) => !samePath(candidate, resolved)),
    };
    await writeMetadata(brainRoot, updated);
    return updated;
  });
}
