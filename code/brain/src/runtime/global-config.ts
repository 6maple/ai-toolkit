import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { DEFAULT_BRAIN_RUNTIME_FEATURES, type BrainRuntimeFeatures } from "./features.ts";

export const DEFAULT_BRAIN_HOME = path.join(homedir(), ".brain-data");

export interface BrainGlobalConfigDiagnostic {
  readonly code: "global-config-invalid" | "global-config-unavailable";
  readonly message: string;
}

export interface BrainGlobalConfigLoadResult {
  readonly features: BrainRuntimeFeatures;
  readonly diagnostics: readonly BrainGlobalConfigDiagnostic[];
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function readBrainGlobalConfig(brainRoot: string): Record<string, unknown> | undefined {
  let raw: string;
  try {
    raw = readFileSync(path.join(brainRoot, "config.json"), "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  }
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Brain global config must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function loadBrainGlobalConfig(
  brainRoot: string = DEFAULT_BRAIN_HOME,
): BrainGlobalConfigLoadResult {
  const configPath = path.join(brainRoot, "config.json");
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return { features: DEFAULT_BRAIN_RUNTIME_FEATURES, diagnostics: [] };
    }
    return {
      features: DEFAULT_BRAIN_RUNTIME_FEATURES,
      diagnostics: [
        {
          code: "global-config-unavailable",
          message: "Brain global config could not be read; semantic search is disabled",
        },
      ],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return {
      features: DEFAULT_BRAIN_RUNTIME_FEATURES,
      diagnostics: [
        {
          code: "global-config-invalid",
          message: "Brain global config is invalid JSON; semantic search is disabled",
        },
      ],
    };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      features: DEFAULT_BRAIN_RUNTIME_FEATURES,
      diagnostics: [
        {
          code: "global-config-invalid",
          message: "Brain global config must be a JSON object; semantic search is disabled",
        },
      ],
    };
  }

  const semantic = (value as Record<string, unknown>).semanticSearch;
  if (semantic === undefined) {
    return { features: DEFAULT_BRAIN_RUNTIME_FEATURES, diagnostics: [] };
  }
  if (typeof semantic !== "object" || semantic === null || Array.isArray(semantic)) {
    return {
      features: DEFAULT_BRAIN_RUNTIME_FEATURES,
      diagnostics: [
        {
          code: "global-config-invalid",
          message:
            "Brain global config semanticSearch must be an object; semantic search is disabled",
        },
      ],
    };
  }

  const enabled = (semantic as Record<string, unknown>).enabled;
  if (enabled === undefined) {
    return { features: DEFAULT_BRAIN_RUNTIME_FEATURES, diagnostics: [] };
  }
  if (typeof enabled !== "boolean") {
    return {
      features: DEFAULT_BRAIN_RUNTIME_FEATURES,
      diagnostics: [
        {
          code: "global-config-invalid",
          message:
            "Brain global config semanticSearch.enabled must be boolean; semantic search is disabled",
        },
      ],
    };
  }
  return {
    features: { semanticSearch: enabled },
    diagnostics: [],
  };
}
