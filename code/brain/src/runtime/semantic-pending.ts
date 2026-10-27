import { mkdirSync } from "node:fs";
import { readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type SemanticPendingChange =
  | { readonly kind: "path"; readonly relativePath: string }
  | { readonly kind: "full" };

export interface SemanticPendingMarker {
  readonly filename: string;
  readonly change: SemanticPendingChange;
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function semanticMemoryPath(relativePath: string): boolean {
  const parts = relativePath.split("/");
  if (parts[0] === "global" && parts[1] === "memories" && parts.length >= 4) {
    return parts.at(-1)!.endsWith(".md");
  }
  if (parts[0] === "projects" && parts.length >= 5 && parts[2] === "memories") {
    return parts.at(-1)!.endsWith(".md");
  }
  return false;
}

/**
 * Classify one fs.watch path by its effect on the semantic projection.
 * Exact archival Markdown paths can be refreshed incrementally. Ambiguous changes
 * inside cognition roots require a metadata reconciliation. High-frequency .state
 * changes are intentionally left to periodic reconciliation because ordinary
 * accessibility/exposure updates do not affect semantic retrieval.
 */
export function classifySemanticWatchPath(
  filename: string | null,
): SemanticPendingChange | undefined {
  if (filename === null || filename === "") return { kind: "full" };
  const relativePath = normalizeRelativePath(filename);

  if (!relativePath.startsWith("global/") && !relativePath.startsWith("projects/")) {
    return undefined;
  }

  if (relativePath.includes("/.state/") || relativePath.endsWith("/.state")) {
    return undefined;
  }

  const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  if (basename.startsWith(".") && basename.includes(".brain-") && basename.endsWith(".tmp")) {
    return undefined;
  }
  if (
    basename === "core.md" ||
    basename === "project.json" ||
    basename.startsWith("project.json.tmp-")
  ) {
    return undefined;
  }

  if (semanticMemoryPath(relativePath)) {
    return { kind: "path", relativePath };
  }

  // Directory-level create/delete/rename events under cognition roots are ambiguous:
  // reconcile rather than assuming each child generated its own watcher event.
  return { kind: "full" };
}

export class SemanticPendingStore {
  constructor(private readonly directory: string) {}

  async record(change: SemanticPendingChange): Promise<void> {
    mkdirSync(this.directory, { recursive: true });
    const base = process.pid + "-" + Date.now() + "-" + randomUUID();
    const temporary = path.join(this.directory, "." + base + ".tmp");
    const target = path.join(this.directory, base + ".pending");
    await writeFile(temporary, JSON.stringify(change) + "\n", "utf8");
    await rename(temporary, target);
  }

  async list(): Promise<readonly SemanticPendingMarker[]> {
    let names: string[];
    try {
      names = (await readdir(this.directory))
        .filter((name) => name.endsWith(".pending"))
        .sort((a, b) => a.localeCompare(b));
    } catch (error) {
      if (isErrno(error, "ENOENT")) return [];
      throw error;
    }

    const result: SemanticPendingMarker[] = [];
    for (const filename of names) {
      try {
        const raw = JSON.parse(
          await readFile(path.join(this.directory, filename), "utf8"),
        ) as unknown;
        if (
          typeof raw === "object" &&
          raw !== null &&
          !Array.isArray(raw) &&
          (raw as Record<string, unknown>).kind === "path" &&
          typeof (raw as Record<string, unknown>).relativePath === "string"
        ) {
          result.push({
            filename,
            change: {
              kind: "path",
              relativePath: normalizeRelativePath(
                (raw as Record<string, unknown>).relativePath as string,
              ),
            },
          });
          continue;
        }
        if (
          typeof raw === "object" &&
          raw !== null &&
          !Array.isArray(raw) &&
          (raw as Record<string, unknown>).kind === "full"
        ) {
          result.push({ filename, change: { kind: "full" } });
          continue;
        }
      } catch {
        // A malformed marker means freshness is uncertain. Treat it as a full
        // reconciliation request and remove it only after that succeeds.
      }
      result.push({ filename, change: { kind: "full" } });
    }
    return result;
  }

  async clear(filenames: readonly string[]): Promise<void> {
    for (const filename of filenames) {
      try {
        await unlink(path.join(this.directory, filename));
      } catch (error) {
        if (!isErrno(error, "ENOENT")) throw error;
      }
    }
  }
}
