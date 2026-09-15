import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseRelatedProjectAlias, type RelatedProjectAlias } from "../brain/namespace.ts";
import { resolveRegisteredProjects } from "../persistence/project-mapping.ts";
import type { ProjectId } from "../persistence/storage.ts";

export type RelatedAccess = "read" | "write";

export interface RelatedProjectConfigDiagnostic {
  readonly code: "related-project-config-invalid";
  readonly message: string;
}

export interface AvailableProjectRelation {
  readonly kind: "available";
  readonly alias: RelatedProjectAlias;
  readonly configuredPath: string;
  readonly files: string;
  readonly access: RelatedAccess;
  readonly projectId: ProjectId;
}

export interface UnavailableProjectRelation {
  readonly kind: "unavailable";
  readonly alias?: RelatedProjectAlias;
  readonly rawAlias: string;
  readonly configuredPath?: string;
  readonly access?: RelatedAccess;
  readonly reason: string;
}

export type ProjectRelationEntry = AvailableProjectRelation | UnavailableProjectRelation;

export interface ProjectRelationCatalog {
  readonly byAlias: ReadonlyMap<string, ProjectRelationEntry>;
  readonly entries: readonly ProjectRelationEntry[];
  readonly configError?: RelatedProjectConfigDiagnostic;
}

export interface LoadProjectRelationCatalogOptions {
  readonly brainRoot: string;
  readonly sourceRoot: string;
  readonly projectId: ProjectId;
}

const relationSchema = z.strictObject({
  path: z.string().min(1),
  access: z.enum(["read", "write"]).optional(),
});

function filesPattern(configuredPath: string): string {
  const normalized = configuredPath.replaceAll("\\", "/");
  return normalized.endsWith("/") ? `${normalized}**` : `${normalized}/**`;
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function unavailable(
  rawAlias: string,
  reason: string,
  options: { alias?: RelatedProjectAlias; configuredPath?: string; access?: RelatedAccess } = {},
): UnavailableProjectRelation {
  return {
    kind: "unavailable",
    rawAlias,
    reason,
    ...(options.alias === undefined ? {} : { alias: options.alias }),
    ...(options.configuredPath === undefined ? {} : { configuredPath: options.configuredPath }),
    ...(options.access === undefined ? {} : { access: options.access }),
  };
}

function wholeConfigError(message: string): ProjectRelationCatalog {
  return {
    byAlias: new Map(),
    entries: [],
    configError: { code: "related-project-config-invalid", message },
  };
}

export async function loadProjectRelationCatalog(
  options: LoadProjectRelationCatalogOptions,
): Promise<ProjectRelationCatalog> {
  const configPath = path.join(options.sourceRoot, ".brain", "config.json");
  let text: string;
  try {
    text = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { byAlias: new Map(), entries: [] };
    return wholeConfigError(".brain/config.json could not be read");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return wholeConfigError(".brain/config.json is invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return wholeConfigError(".brain/config.json must contain a JSON object");
  }
  const top = parsed as Record<string, unknown>;
  if (Object.keys(top).some((key) => key !== "relatedProjects")) {
    return wholeConfigError(".brain/config.json contains an unknown top-level field");
  }
  if (top.relatedProjects === undefined) return { byAlias: new Map(), entries: [] };
  if (
    typeof top.relatedProjects !== "object" ||
    top.relatedProjects === null ||
    Array.isArray(top.relatedProjects)
  ) {
    return wholeConfigError("relatedProjects must be an object");
  }

  type PendingRelation =
    | { readonly kind: "fixed"; readonly entry: UnavailableProjectRelation }
    | {
        readonly kind: "candidate";
        readonly rawAlias: string;
        readonly alias: RelatedProjectAlias;
        readonly configuredPath: string;
        readonly access: RelatedAccess;
        readonly lookupIndex: number;
      };

  const pending: PendingRelation[] = [];
  const targetPaths: string[] = [];
  for (const [rawAlias, rawValue] of Object.entries(top.relatedProjects)) {
    let alias: RelatedProjectAlias;
    try {
      alias = parseRelatedProjectAlias(rawAlias);
    } catch {
      pending.push({
        kind: "fixed",
        entry: unavailable(rawAlias, "alias is not one safe public path segment"),
      });
      continue;
    }

    const validated = relationSchema.safeParse(rawValue);
    if (!validated.success) {
      const record =
        typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue)
          ? (rawValue as Record<string, unknown>)
          : undefined;
      const configuredPath = typeof record?.path === "string" ? record.path : undefined;
      const access = record?.access === "read" || record?.access === "write" ? record.access : undefined;
      pending.push({
        kind: "fixed",
        entry: unavailable(rawAlias, "relation entry is invalid", {
          alias,
          ...(configuredPath === undefined ? {} : { configuredPath }),
          ...(access === undefined ? {} : { access }),
        }),
      });
      continue;
    }

    const configuredPath = validated.data.path;
    const access = validated.data.access ?? "read";
    const targetPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(options.sourceRoot, configuredPath);
    const lookupIndex = targetPaths.length;
    targetPaths.push(targetPath);
    pending.push({ kind: "candidate", rawAlias, alias, configuredPath, access, lookupIndex });
  }

  const lookups = await resolveRegisteredProjects({
    brainRoot: options.brainRoot,
    sourceRoots: targetPaths,
  });
  const entries = pending.map((item): ProjectRelationEntry => {
    if (item.kind === "fixed") return item.entry;
    const lookup = lookups[item.lookupIndex];
    if (lookup === undefined || lookup.kind === "not-found") {
      return unavailable(item.rawAlias, "source root is not registered as a Brain project", {
        alias: item.alias,
        configuredPath: item.configuredPath,
        access: item.access,
      });
    }
    if (lookup.kind === "error") {
      return unavailable(item.rawAlias, lookup.error.code, {
        alias: item.alias,
        configuredPath: item.configuredPath,
        access: item.access,
      });
    }
    if (lookup.project.projectId === options.projectId) {
      return unavailable(item.rawAlias, "relation resolves to the active Brain project", {
        alias: item.alias,
        configuredPath: item.configuredPath,
        access: item.access,
      });
    }
    return {
      kind: "available",
      alias: item.alias,
      configuredPath: item.configuredPath,
      files: filesPattern(item.configuredPath),
      access: item.access,
      projectId: lookup.project.projectId,
    };
  });
  const byAlias = new Map<string, ProjectRelationEntry>();
  for (const entry of entries) {
    if (entry.alias !== undefined) byAlias.set(entry.alias, entry);
  }

  return { byAlias, entries };
}