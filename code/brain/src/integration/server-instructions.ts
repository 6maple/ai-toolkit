import { BRAIN_EXPLICIT_INSTRUCTION, BRAIN_FAILURE_TEMPLATE } from "./model-facing-text.ts";

export type BrainMcpRestoreMode = "explicit" | "host";

export const BRAIN_MCP_RESTORE_MODE_ENV = "BRAIN_MCP_RESTORE_MODE";

export const BRAIN_EXPLICIT_RESTORE_INSTRUCTIONS = BRAIN_EXPLICIT_INSTRUCTION;

export function brainRestoreFailureDiagnostic(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const detail = raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, 300) || "未知错误";
  return BRAIN_FAILURE_TEMPLATE.replace("<可公开的简短错误说明>", detail);
}

export function resolveBrainMcpRestoreMode(value: string | undefined): BrainMcpRestoreMode {
  if (value === undefined || value === "") return "explicit";
  if (value === "explicit" || value === "host") return value;
  throw new Error(`${BRAIN_MCP_RESTORE_MODE_ENV} must be explicit or host`);
}

export function brainMcpServerInstructions(
  restoreMode: BrainMcpRestoreMode,
): string | undefined {
  return restoreMode === "explicit" ? BRAIN_EXPLICIT_RESTORE_INSTRUCTIONS : undefined;
}
