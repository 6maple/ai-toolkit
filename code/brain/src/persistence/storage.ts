import * as nodeFs from "node:fs";
import { promises as fsPromises } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  formatScopePrefix,
  parsePublicPath,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type LogicalResourceLocation,
  type ScopeRef,
} from "../brain/namespace.ts";

export type CanonicalBrainRoot = string & { readonly __brand: "CanonicalBrainRoot" };
export type CanonicalProjectRoot = string & { readonly __brand: "CanonicalProjectRoot" };
export type StoragePlatform = "win32" | "posix";

export interface StorageBinding {
  readonly brainRoot: CanonicalBrainRoot;
  readonly projectRoot: CanonicalProjectRoot;
  readonly platform: StoragePlatform;
}

export type PhysicalResourceRef =
  | { readonly kind: "public"; readonly path: LogicalBrainPath }
  | { readonly kind: "scope-state"; readonly scope: ScopeRef }
  | { readonly kind: "companion"; readonly item: LogicalArchivalPath };

export interface ProjectedResource {
  readonly ref: PhysicalResourceRef;
  readonly scopeRoot: string;
  readonly absolutePath: string;
  readonly expectedKind: "directory" | "file";
}

export interface ResolvedBrainResource extends ProjectedResource {
  readonly requestedRef: PhysicalResourceRef;
  readonly canonicalRef: PhysicalResourceRef;
  readonly canonicalScopeRoot: string;
  readonly canonicalPath: string;
  readonly aliasFollowed: boolean;
}

export interface StorageStat {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink?(): boolean;
}

export interface StorageFs {
  mkdir(target: string, options: { recursive: true }): Promise<unknown>;
  realpathNative(target: string): Promise<string>;
  stat(target: string): Promise<StorageStat>;
  lstat(target: string): Promise<StorageStat>;
}

function nodeRealpathNative(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    nodeFs.realpath.native(target, (error, resolved) => {
      if (error) reject(error);
      else resolve(resolved);
    });
  });
}

export const nodeStorageFs: StorageFs = {
  mkdir: (target, options) => fsPromises.mkdir(target, options),
  realpathNative: nodeRealpathNative,
  stat: (target) => fsPromises.stat(target),
  lstat: (target) => fsPromises.lstat(target),
};

export type StorageBindingErrorCode =
  | "project-root-invalid"
  | "brain-root-unavailable"
  | "project-root-shape-unsupported";

export class StorageBindingError extends Error {
  readonly code: StorageBindingErrorCode;

  constructor(code: StorageBindingErrorCode, options?: { cause?: unknown }) {
    super(`brain storage binding failed: ${code}`, options);
    this.name = "StorageBindingError";
    this.code = code;
  }
}

export class StorageNotFoundError extends Error {
  readonly code = "not-found" as const;

  constructor(options?: { cause?: unknown }) {
    super("brain storage resource not found", options);
    this.name = "StorageNotFoundError";
  }
}

export class StorageResourceKindError extends Error {
  readonly code = "wrong-resource-kind" as const;
  readonly expectedKind: "directory" | "file";

  constructor(expectedKind: "directory" | "file") {
    super(`brain storage resource has wrong kind; expected ${expectedKind}`);
    this.name = "StorageResourceKindError";
    this.expectedKind = expectedKind;
  }
}

export class StorageContainmentError extends Error {
  readonly code = "containment-failed" as const;

  constructor(options?: { cause?: unknown }) {
    super("brain storage containment invariant failed", options);
    this.name = "StorageContainmentError";
  }
}

export class StorageAliasResolutionError extends Error {
  readonly code = "alias-resolution-failed" as const;

  constructor(options?: { cause?: unknown }) {
    super("brain public filesystem alias could not be resolved", options);
    this.name = "StorageAliasResolutionError";
  }
}

export class StorageIoError extends Error {
  readonly code = "storage-io" as const;

  constructor(options?: { cause?: unknown }) {
    super("brain storage I/O failed", options);
    this.name = "StorageIoError";
  }
}

function pathApi(platform: StoragePlatform): typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

function currentStoragePlatform(): StoragePlatform {
  return process.platform === "win32" ? "win32" : "posix";
}

function normalizeCanonicalPath(value: string, platform: StoragePlatform): string {
  if (platform === "win32" && /^[A-Za-z]:\\/.test(value)) {
    return `${value[0]!.toUpperCase()}${value.slice(1)}`;
  }
  return value;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function lstatIfExists(fs: StorageFs, target: string): Promise<StorageStat | undefined> {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw new StorageIoError({ cause: error });
  }
}

function assertRealDirectory(stat: StorageStat): void {
  if (stat.isSymbolicLink?.()) throw new StorageContainmentError();
  if (!stat.isDirectory()) throw new StorageResourceKindError("directory");
}

function isContained(platform: StoragePlatform, root: string, target: string): boolean {
  const p = pathApi(platform);
  const relative = p.relative(root, target);
  if (relative === "") return true;
  if (p.isAbsolute(relative)) return false;
  return relative !== ".." && !relative.startsWith(`..${p.sep}`);
}

function splitRelative(relative: string, platform: StoragePlatform): string[] {
  if (relative === "") return [];
  const segments = relative.split(pathApi(platform).sep);
  if (segments.some((segment) => segment.length === 0)) {
    throw new StorageBindingError("project-root-shape-unsupported");
  }
  return segments;
}

export function deriveProjectProjectionSegments(
  projectRoot: CanonicalProjectRoot,
  platform: StoragePlatform,
): readonly string[] {
  if (platform === "win32") {
    const parsed = path.win32.parse(projectRoot);
    const root = parsed.root;
    if (/^[A-Za-z]:\\$/.test(root)) {
      const drive = root[0]!.toUpperCase();
      const relative = path.win32.relative(root, projectRoot);
      const segments = splitRelative(relative, platform);
      return ["root=win-drive", `p=${drive}`, ...segments.map((segment) => `p=${segment}`)];
    }

    const unc = /^\\\\([^\\]+)\\([^\\]+)\\$/.exec(root);
    if (!unc) throw new StorageBindingError("project-root-shape-unsupported");
    const relative = path.win32.relative(root, projectRoot);
    const segments = splitRelative(relative, platform);
    return [
      "root=win-unc",
      `p=${unc[1]!}`,
      `p=${unc[2]!}`,
      ...segments.map((segment) => `p=${segment}`),
    ];
  }

  const parsed = path.posix.parse(projectRoot);
  if (parsed.root !== "/") throw new StorageBindingError("project-root-shape-unsupported");
  const relative = path.posix.relative("/", projectRoot);
  const segments = splitRelative(relative, platform);
  return ["root=posix", ...segments.map((segment) => `p=${segment}`)];
}

export interface CreateStorageBindingOptions {
  readonly brainRoot?: string;
  readonly projectRoot: string;
  readonly homeDir?: string;
  /** Internal test seam; production omits this. */
  readonly fs?: StorageFs;
  /** Internal test seam; production uses the current Node platform. */
  readonly platform?: StoragePlatform;
}

export async function createStorageBinding(
  options: CreateStorageBindingOptions,
): Promise<StorageBinding> {
  const fs = options.fs ?? nodeStorageFs;
  const platform = options.platform ?? currentStoragePlatform();
  const p = pathApi(platform);

  let canonicalProjectRoot: string;
  try {
    if (!options.projectRoot) throw new Error("missing project root");
    const resolved = p.resolve(options.projectRoot);
    canonicalProjectRoot = normalizeCanonicalPath(await fs.realpathNative(resolved), platform);
    const stat = await fs.stat(canonicalProjectRoot);
    if (!stat.isDirectory()) throw new Error("project root is not a directory");
    deriveProjectProjectionSegments(canonicalProjectRoot as CanonicalProjectRoot, platform);
  } catch (error) {
    if (error instanceof StorageBindingError) throw error;
    throw new StorageBindingError("project-root-invalid", { cause: error });
  }

  let canonicalBrainRoot: string;
  try {
    const configured = options.brainRoot ?? p.join(options.homeDir ?? homedir(), ".brain-data");
    const resolved = p.resolve(configured);
    await fs.mkdir(resolved, { recursive: true });
    canonicalBrainRoot = normalizeCanonicalPath(await fs.realpathNative(resolved), platform);
    const stat = await fs.stat(canonicalBrainRoot);
    if (!stat.isDirectory()) throw new Error("brain root is not a directory");
  } catch (error) {
    throw new StorageBindingError("brain-root-unavailable", { cause: error });
  }

  return {
    brainRoot: canonicalBrainRoot as CanonicalBrainRoot,
    projectRoot: canonicalProjectRoot as CanonicalProjectRoot,
    platform,
  };
}

export function projectScopeRoot(binding: StorageBinding): string {
  const p = pathApi(binding.platform);
  return p.join(
    binding.brainRoot,
    "projects",
    ...deriveProjectProjectionSegments(binding.projectRoot, binding.platform),
    "scope",
  );
}

export function scopeRoot(binding: StorageBinding, scope: ScopeRef): string {
  const p = pathApi(binding.platform);
  switch (scope.kind) {
    case "global":
      return p.join(binding.brainRoot, "global");
    case "project":
      return projectScopeRoot(binding);
    case "session":
      return p.join(projectScopeRoot(binding), "sessions", scope.sessionId);
  }
}

export function projectAbsoluteLocation(
  binding: StorageBinding,
  location: LogicalResourceLocation,
): string {
  const p = pathApi(binding.platform);
  return p.join(scopeRoot(binding, location.scope), ...location.relativeSegments);
}

function archivalCompanionSegments(item: LogicalArchivalPath): string[] {
  const segments = [...item.itemSegments];
  const last = segments.at(-1)!;
  segments[segments.length - 1] = `${last.slice(0, -3)}.json`;
  return segments;
}

export function projectPhysicalResource(
  binding: StorageBinding,
  ref: PhysicalResourceRef,
): ProjectedResource {
  const p = pathApi(binding.platform);
  const scope =
    ref.kind === "public"
      ? ref.path.scope
      : ref.kind === "scope-state"
        ? ref.scope
        : ref.item.scope;
  const root = scopeRoot(binding, scope);

  if (ref.kind === "scope-state") {
    return {
      ref,
      scopeRoot: root,
      absolutePath: p.join(root, ".state", "scope.json"),
      expectedKind: "file",
    };
  }
  if (ref.kind === "companion") {
    return {
      ref,
      scopeRoot: root,
      absolutePath: p.join(
        root,
        ".state",
        "memories",
        ref.item.role,
        ...archivalCompanionSegments(ref.item),
      ),
      expectedKind: "file",
    };
  }

  const logical = ref.path;
  switch (logical.kind) {
    case "core":
      return { ref, scopeRoot: root, absolutePath: p.join(root, "core.md"), expectedKind: "file" };
    case "archival":
      return {
        ref,
        scopeRoot: root,
        absolutePath: p.join(root, "memories", logical.role, ...logical.itemSegments),
        expectedKind: "file",
      };
    case "directory":
      switch (logical.area) {
        case "memories-root":
          return {
            ref,
            scopeRoot: root,
            absolutePath: p.join(root, "memories"),
            expectedKind: "directory",
          };
        case "role-root":
          return {
            ref,
            scopeRoot: root,
            absolutePath: p.join(root, "memories", logical.role),
            expectedKind: "directory",
          };
        case "nested":
          return {
            ref,
            scopeRoot: root,
            absolutePath: p.join(root, "memories", logical.role, ...logical.segments),
            expectedKind: "directory",
          };
      }
  }
}

function assertExpectedKind(stat: StorageStat, expectedKind: "directory" | "file"): void {
  const matches = expectedKind === "directory" ? stat.isDirectory() : stat.isFile();
  if (!matches) throw new StorageResourceKindError(expectedKind);
}

function samePhysicalPath(platform: StoragePlatform, a: string, b: string): boolean {
  return pathApi(platform).relative(a, b) === "";
}

async function resolveCanonicalScopeRoot(
  binding: StorageBinding,
  projectedScopeRoot: string,
  fs: StorageFs,
): Promise<string> {
  let canonical: string;
  try {
    canonical = normalizeCanonicalPath(
      await fs.realpathNative(projectedScopeRoot),
      binding.platform,
    );
  } catch (error) {
    if (isNotFound(error)) throw new StorageNotFoundError({ cause: error });
    throw new StorageIoError({ cause: error });
  }
  if (!isContained(binding.platform, binding.brainRoot, canonical)) {
    throw new StorageContainmentError();
  }
  return canonical;
}

function canonicalPublicRefForResolvedTarget(
  binding: StorageBinding,
  requestedRef: Extract<PhysicalResourceRef, { readonly kind: "public" }>,
  canonicalScopeRoot: string,
  canonicalTarget: string,
  expectedKind: "directory" | "file",
): PhysicalResourceRef {
  const p = pathApi(binding.platform);
  const relative = p.relative(canonicalScopeRoot, canonicalTarget);
  if (p.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${p.sep}`)) {
    throw new StorageContainmentError();
  }

  const publicPrefix = formatScopePrefix(requestedRef.path.scope);
  const relativePublic = relative.split(p.sep).join("/");
  let raw: string;
  if (relativePublic === "core.md") {
    raw = `${publicPrefix}/core.md`;
  } else if (relativePublic === "memories") {
    raw = `${publicPrefix}/memories/`;
  } else if (relativePublic.startsWith("memories/")) {
    raw = `${publicPrefix}/${relativePublic}${expectedKind === "directory" ? "/" : ""}`;
  } else {
    throw new StorageContainmentError();
  }

  let logical: LogicalBrainPath;
  try {
    logical = parsePublicPath(raw);
  } catch (error) {
    throw new StorageContainmentError({ cause: error });
  }
  if (expectedKind === "directory" && logical.kind !== "directory") {
    throw new StorageResourceKindError("directory");
  }
  if (expectedKind === "file" && logical.kind === "directory") {
    throw new StorageContainmentError();
  }
  return { kind: "public", path: logical };
}

async function publicPrefixContainsAlias(
  binding: StorageBinding,
  scopeRootPath: string,
  target: string,
  fs: StorageFs,
): Promise<boolean> {
  const p = pathApi(binding.platform);
  const relative = p.relative(scopeRootPath, target);
  if (relative === "") return false;
  if (p.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${p.sep}`)) {
    throw new StorageContainmentError();
  }
  let current = scopeRootPath;
  for (const segment of relative.split(p.sep)) {
    current = p.join(current, segment);
    const stat = await lstatIfExists(fs, current);
    if (!stat) return false;
    if (stat.isSymbolicLink?.()) return true;
  }
  return false;
}

async function resolvePublicExistingResource(
  binding: StorageBinding,
  projected: ProjectedResource,
  ref: Extract<PhysicalResourceRef, { readonly kind: "public" }>,
  canonicalScopeRoot: string,
  fs: StorageFs,
): Promise<ResolvedBrainResource> {
  let canonicalTarget: string;
  try {
    canonicalTarget = normalizeCanonicalPath(
      await fs.realpathNative(projected.absolutePath),
      binding.platform,
    );
  } catch (error) {
    const throughAlias = await publicPrefixContainsAlias(
      binding,
      projected.scopeRoot,
      projected.absolutePath,
      fs,
    );
    if (throughAlias) throw new StorageAliasResolutionError({ cause: error });
    if (isNotFound(error)) throw new StorageNotFoundError({ cause: error });
    throw new StorageIoError({ cause: error });
  }

  if (!isContained(binding.platform, canonicalScopeRoot, canonicalTarget)) {
    throw new StorageContainmentError();
  }

  let targetStat: StorageStat;
  try {
    targetStat = await fs.stat(canonicalTarget);
  } catch (error) {
    throw new StorageIoError({ cause: error });
  }
  assertExpectedKind(targetStat, projected.expectedKind);

  const aliasFollowed = !samePhysicalPath(
    binding.platform,
    projected.absolutePath,
    canonicalTarget,
  );
  const canonicalRef = aliasFollowed
    ? canonicalPublicRefForResolvedTarget(
        binding,
        ref,
        canonicalScopeRoot,
        canonicalTarget,
        projected.expectedKind,
      )
    : ref;

  return {
    ...projected,
    requestedRef: ref,
    canonicalRef,
    canonicalScopeRoot,
    canonicalPath: canonicalTarget,
    aliasFollowed,
  };
}

export async function resolveExistingResource(
  binding: StorageBinding,
  ref: PhysicalResourceRef,
  fs: StorageFs = nodeStorageFs,
): Promise<ResolvedBrainResource> {
  const projected = projectPhysicalResource(binding, ref);
  await validateManagedStructuralChain(binding, projected.scopeRoot, fs, false);
  const scopeStat = await lstatIfExists(fs, projected.scopeRoot);
  if (!scopeStat) throw new StorageNotFoundError();
  assertRealDirectory(scopeStat);
  const canonicalScopeRoot = await resolveCanonicalScopeRoot(binding, projected.scopeRoot, fs);

  if (ref.kind === "public") {
    return resolvePublicExistingResource(binding, projected, ref, canonicalScopeRoot, fs);
  }

  await validateManagedTargetChain(
    binding,
    projected.scopeRoot,
    projected.absolutePath,
    projected.expectedKind,
    fs,
    false,
  );

  let canonicalTarget: string;
  try {
    canonicalTarget = normalizeCanonicalPath(
      await fs.realpathNative(projected.absolutePath),
      binding.platform,
    );
  } catch (error) {
    if (isNotFound(error)) throw new StorageNotFoundError({ cause: error });
    throw new StorageIoError({ cause: error });
  }
  if (!isContained(binding.platform, canonicalScopeRoot, canonicalTarget)) {
    throw new StorageContainmentError();
  }

  return {
    ...projected,
    requestedRef: ref,
    canonicalRef: ref,
    canonicalScopeRoot,
    canonicalPath: canonicalTarget,
    aliasFollowed: false,
  };
}

async function validateManagedStructuralChain(
  binding: StorageBinding,
  projectedScopeRoot: string,
  fs: StorageFs,
  allowMissingSuffix: boolean,
): Promise<void> {
  const p = pathApi(binding.platform);
  const relative = p.relative(binding.brainRoot, projectedScopeRoot);
  if (
    relative === "" ||
    p.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${p.sep}`)
  ) {
    throw new StorageContainmentError();
  }

  const segments = relative.split(p.sep);
  let current = binding.brainRoot as string;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") throw new StorageContainmentError();
    const next = p.join(current, segment);
    const stat = await lstatIfExists(fs, next);
    if (!stat) {
      if (allowMissingSuffix) break;
      throw new StorageNotFoundError();
    }
    assertRealDirectory(stat);
    let canonical: string;
    try {
      canonical = await fs.realpathNative(next);
    } catch (error) {
      throw new StorageIoError({ cause: error });
    }
    if (!isContained(binding.platform, binding.brainRoot, canonical))
      throw new StorageContainmentError();
    current = next;
  }
}

async function validateManagedTargetChain(
  binding: StorageBinding,
  scopeRootPath: string,
  target: string,
  expectedKind: "directory" | "file",
  fs: StorageFs,
  allowMissingSuffix: boolean,
): Promise<void> {
  const p = pathApi(binding.platform);
  const relative = p.relative(scopeRootPath, target);
  if (p.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${p.sep}`)) {
    throw new StorageContainmentError();
  }
  if (relative === "") return;

  const segments = relative.split(p.sep);
  let current = scopeRootPath;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (!segment || segment === "." || segment === "..") throw new StorageContainmentError();
    current = p.join(current, segment);
    const stat = await lstatIfExists(fs, current);
    if (!stat) {
      if (allowMissingSuffix) return;
      throw new StorageNotFoundError();
    }
    if (stat.isSymbolicLink?.()) throw new StorageContainmentError();
    const isLast = index === segments.length - 1;
    if (!isLast) {
      if (!stat.isDirectory()) throw new StorageResourceKindError("directory");
      continue;
    }
    assertExpectedKind(stat, expectedKind);
  }
}

async function resolvePublicCreateResource(
  binding: StorageBinding,
  projected: ProjectedResource,
  ref: Extract<PhysicalResourceRef, { readonly kind: "public" }>,
  canonicalScopeRoot: string,
  fs: StorageFs,
): Promise<ResolvedBrainResource> {
  const p = pathApi(binding.platform);
  const relative = p.relative(projected.scopeRoot, projected.absolutePath);
  if (p.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${p.sep}`)) {
    throw new StorageContainmentError();
  }

  const segments = relative === "" ? [] : relative.split(p.sep);
  let lexicalCurrent = projected.scopeRoot;
  let canonicalCurrent = canonicalScopeRoot;
  let aliasFollowed = false;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const lexicalNext = p.join(lexicalCurrent, segment);
    const lstat = await lstatIfExists(fs, lexicalNext);
    if (!lstat) {
      const canonicalTarget = p.join(canonicalCurrent, ...segments.slice(index));
      if (!isContained(binding.platform, canonicalScopeRoot, canonicalTarget)) {
        throw new StorageContainmentError();
      }
      const canonicalRef = aliasFollowed
        ? canonicalPublicRefForResolvedTarget(
            binding,
            ref,
            canonicalScopeRoot,
            canonicalTarget,
            projected.expectedKind,
          )
        : ref;
      return {
        ...projected,
        requestedRef: ref,
        canonicalRef,
        canonicalScopeRoot,
        canonicalPath: canonicalTarget,
        aliasFollowed,
      };
    }

    if (lstat.isSymbolicLink?.()) aliasFollowed = true;
    let resolvedNext: string;
    try {
      resolvedNext = normalizeCanonicalPath(await fs.realpathNative(lexicalNext), binding.platform);
    } catch (error) {
      if (aliasFollowed) throw new StorageAliasResolutionError({ cause: error });
      throw new StorageIoError({ cause: error });
    }
    if (!isContained(binding.platform, canonicalScopeRoot, resolvedNext)) {
      throw new StorageContainmentError();
    }

    let resolvedStat: StorageStat;
    try {
      resolvedStat = await fs.stat(resolvedNext);
    } catch (error) {
      throw new StorageIoError({ cause: error });
    }
    const isLast = index === segments.length - 1;
    if (isLast) assertExpectedKind(resolvedStat, projected.expectedKind);
    else if (!resolvedStat.isDirectory()) throw new StorageResourceKindError("directory");

    lexicalCurrent = lexicalNext;
    canonicalCurrent = resolvedNext;
  }

  const canonicalTarget = canonicalCurrent;
  const canonicalRef = aliasFollowed
    ? canonicalPublicRefForResolvedTarget(
        binding,
        ref,
        canonicalScopeRoot,
        canonicalTarget,
        projected.expectedKind,
      )
    : ref;
  return {
    ...projected,
    requestedRef: ref,
    canonicalRef,
    canonicalScopeRoot,
    canonicalPath: canonicalTarget,
    aliasFollowed,
  };
}

export async function resolveCreateTarget(
  binding: StorageBinding,
  ref: PhysicalResourceRef,
  fs: StorageFs = nodeStorageFs,
): Promise<ResolvedBrainResource> {
  const projected = projectPhysicalResource(binding, ref);
  const scopeStat = await lstatIfExists(fs, projected.scopeRoot);

  if (!scopeStat) {
    await validateManagedStructuralChain(binding, projected.scopeRoot, fs, true);
    return {
      ...projected,
      requestedRef: ref,
      canonicalRef: ref,
      canonicalScopeRoot: projected.scopeRoot,
      canonicalPath: projected.absolutePath,
      aliasFollowed: false,
    };
  }

  await validateManagedStructuralChain(binding, projected.scopeRoot, fs, false);
  assertRealDirectory(scopeStat);
  const canonicalScopeRoot = await resolveCanonicalScopeRoot(binding, projected.scopeRoot, fs);

  if (ref.kind === "public") {
    return resolvePublicCreateResource(binding, projected, ref, canonicalScopeRoot, fs);
  }

  await validateManagedTargetChain(
    binding,
    projected.scopeRoot,
    projected.absolutePath,
    projected.expectedKind,
    fs,
    true,
  );
  return {
    ...projected,
    requestedRef: ref,
    canonicalRef: ref,
    canonicalScopeRoot,
    canonicalPath: projected.absolutePath,
    aliasFollowed: false,
  };
}

export function companionRef(item: LogicalArchivalPath): PhysicalResourceRef {
  return { kind: "companion", item };
}
