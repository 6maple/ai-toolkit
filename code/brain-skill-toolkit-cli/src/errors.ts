export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function describeError(error: unknown): { code: string; message: string } {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof Error && error.name === "AbortError"
        ? "aborted"
        : "operation-failed";
  let message = error instanceof Error ? error.message : String(error);
  if (code === "mutation-partially-applied") {
    message +=
      "; partial changes may persist. Re-read the target (both paths for mv) before repair or retry.";
  } else if (code === "mutation-failed") {
    message += "; the operation failed and earlier changes from this operation were restored.";
  } else if (code === "nonempty-core-requires-exact-edit") {
    message += "; re-read the Core and use --edits-file with its current exact text.";
  } else if (code === "semantic-search-unavailable") {
    message += "; use grep/glob, or repair the existing Brain semantic-search setup.";
  }
  return { code, message };
}
