import { format } from "node:util";
import { readFile } from "node:fs/promises";
import { parseInvocation } from "./arguments.ts";
import { executeStep, stepPromptForProject } from "../../brain/step/index.mjs";
import { CliError, describeError } from "./errors.ts";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const warnings: string[] = [];
  const internalDiagnostics: string[] = [];
  let runtime: Awaited<ReturnType<typeof import("./runtime.ts").createCliRuntime>> | undefined;
  let project: string | undefined;
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
    project = invocation.project;
    // Internal Brain diagnostics are kept separate from model-facing results.
    console.error = (...args: unknown[]) => internalDiagnostics.push(format(...args));
    capture = true;
    if (invocation.command === "step" && invocation.args.action !== "start") {
      text = await executeStep(invocation.args);
    } else {
      const { createCliRuntime } = await import("./runtime.ts");
      runtime = await createCliRuntime(invocation, warnings, controller.signal);
      text = await runtime.execute();
    }
    if (invocation.command === "step")
      text = stepPromptForProject(text, runtime?.binding.sourceRoot ?? invocation.project);
    controller.signal.throwIfAborted();
  } catch (error) {
    failure = describeError(error);
    process.exitCode = interrupted || (error instanceof CliError ? error.exitCode : 1);
  } finally {
    try {
      runtime?.close();
    } catch (error) {
      internalDiagnostics.push(
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
  if (text !== "") process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
  if (failure !== undefined) {
    if (project !== undefined) process.stderr.write(`当前项目：${project.replaceAll("\\", "/")}\n`);
    process.stderr.write(`错误：${failure.code}\n${failure.message}\n`);
  }
  for (const warning of warnings) process.stderr.write(`警告：${warning}\n`);
}
