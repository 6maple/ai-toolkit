import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ThinkWorkflowProjection } from "../application/anchor-renderer.ts";
import { readBrainGlobalConfig } from "./global-config.ts";

export const DEFAULT_THINK_WORKFLOW = "@internal/think-workflow/brain-ai/index.md";
const INTERNAL_ROOT = path.dirname(fileURLToPath(import.meta.resolve("brain/package.json")));

function resolveWorkflowFile(entry: string, brainRoot: string, internalRoot: string): string {
  if (entry.startsWith("@internal/")) {
    const target = path.resolve(internalRoot, entry.slice("@internal/".length));
    const relative = path.relative(internalRoot, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("think-workflow internal path is outside the resource root");
    }
    return target;
  }
  if (entry.startsWith("@")) throw new Error("Unknown think-workflow resource address");
  return path.resolve(brainRoot, entry);
}

export async function loadThinkWorkflow(
  brainRoot: string,
  options: { internalRoot?: string; warn?: (message: string) => void } = {},
): Promise<ThinkWorkflowProjection | undefined> {
  const internalRoot = options.internalRoot ?? INTERNAL_ROOT;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  let entry = DEFAULT_THINK_WORKFLOW;
  let attemptedSource = path.join(brainRoot, "config.json");
  const read = async (source: string): Promise<ThinkWorkflowProjection> => {
    const target = resolveWorkflowFile(source, brainRoot, internalRoot);
    return {
      source: source.startsWith("@internal/") ? source : target,
      absolutePath: target,
      text: await readFile(target, "utf8"),
    };
  };
  const warning = (error: unknown, source: string): void => {
    const reason = error instanceof Error ? error.message : String(error);
    warn(`brain think-workflow warning: ${source}: ${reason}; fallback=${DEFAULT_THINK_WORKFLOW}`);
  };
  try {
    const selected = readBrainGlobalConfig(brainRoot)?.thinkWorkflowFile;
    if (selected !== undefined) {
      if (typeof selected !== "string" || selected.trim().length === 0) {
        throw new Error("thinkWorkflowFile must be a non-empty path string");
      }
      entry = selected;
    }
    attemptedSource = entry;
    return await read(entry);
  } catch (error) {
    warning(error, attemptedSource);
    if (attemptedSource === DEFAULT_THINK_WORKFLOW) return undefined;
  }
  try {
    return await read(DEFAULT_THINK_WORKFLOW);
  } catch (error) {
    warning(error, DEFAULT_THINK_WORKFLOW);
    return undefined;
  }
}
