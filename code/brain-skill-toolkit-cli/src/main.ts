import { format } from "node:util";
import { readFile } from "node:fs/promises";
import { parseInvocation } from "./arguments.ts";
import { CliError, describeError } from "./errors.ts";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const warnings: string[] = [];
  let json = argv.includes("--json");
  let binding: { sourceRoot: string; brainRoot: string; projectId: string } | null = null;
  let runtime: Awaited<ReturnType<typeof import("./runtime.ts").createCliRuntime>> | undefined;
  const controller = new AbortController();
  let interrupted = 0;
  const onInterrupt = () => {
    interrupted = 130;
    controller.abort();
  };
  const onTerminate = () => {
    interrupted = 143;
    controller.abort();
  };
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  const originalError = console.error;
  let capture = false;
  let text = "";
  let failure: ReturnType<typeof describeError> | undefined;
  try {
    const invocation = await parseInvocation(argv, controller.signal);
    if ("help" in invocation) {
      process.stdout.write(invocation.help + "\n");
      return;
    }
    if ("version" in invocation) {
      const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
      process.stdout.write(pkg.version + "\n");
      return;
    }
    json = invocation.json;
    // Existing Brain services report auxiliary degradation through console.error.
    // This process executes one action; collect those diagnostics without scraping
    // rendered cognition text or mixing logs into JSON stdout.
    console.error = (...args: unknown[]) => warnings.push(format(...args));
    capture = true;
    const { createCliRuntime } = await import("./runtime.ts");
    runtime = await createCliRuntime(invocation, warnings, controller.signal);
    binding = runtime.binding;
    text = await runtime.execute();
    controller.signal.throwIfAborted();
  } catch (error) {
    failure = describeError(error);
    process.exitCode = interrupted || (error instanceof CliError ? error.exitCode : 1);
  } finally {
    try {
      runtime?.close();
    } catch (error) {
      warnings.push(
        `Resource cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (failure === undefined) {
        failure = describeError(error);
        process.exitCode = interrupted || 1;
      }
    }
    if (capture) console.error = originalError;
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
  if (json)
    process.stdout.write(
      JSON.stringify({
        ok: failure === undefined,
        text,
        warnings,
        binding,
        ...(failure === undefined ? {} : { error: failure }),
      }) + "\n",
    );
  else {
    if (text !== "") process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
    if (failure !== undefined) process.stderr.write(`error: ${failure.code}\n${failure.message}\n`);
  }
  for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`);
}
