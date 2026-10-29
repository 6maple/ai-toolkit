import { realpath } from "node:fs/promises";
import {
  DEFAULT_BRAIN_HOME,
  loadBrainGlobalConfig,
} from "../../brain/src/runtime/global-config.ts";
import { resolveOrCreateProject } from "../../brain/src/persistence/project-mapping.ts";
import { bootstrapBrainRuntimeInfrastructure } from "../../brain/src/runtime/bootstrap.ts";
import { createBrainApplicationServices } from "../../brain/src/runtime/application.ts";
import { SemanticIndex } from "../../brain/src/runtime/semantic-index.ts";
import { SemanticPendingStore } from "../../brain/src/runtime/semantic-pending.ts";
import {
  assertSemanticRuntimeReady,
  PythonEmbeddingRuntime,
  semanticRuntimePaths,
} from "../../brain/src/runtime/semantic-runtime.ts";
import { isBrainVirtualPath } from "../../brain/src/application/think-context.ts";
import type { Invocation } from "./arguments.ts";
import { CliError } from "./errors.ts";
import { createFileRuntime } from "../../brain/step/index.mjs";
import { cliSessionId, createCliStepContext } from "./step-context.ts";

const MUTATIONS = new Set(["write", "edit", "rm", "mv", "feedback"]);

export async function createCliRuntime(
  invocation: Invocation,
  warnings: string[],
  signal: AbortSignal,
) {
  const brainRoot = invocation.brainRoot ?? DEFAULT_BRAIN_HOME;
  const sourceRoot = await realpath(invocation.project);
  signal.throwIfAborted();
  const stepContext = ["think", "step"].includes(invocation.command)
    ? await createCliStepContext(brainRoot, sourceRoot, cliSessionId(invocation.sessionId))
    : undefined;
  // Invalidate the previous CLI turn before attempting think, including setup failures.
  if (invocation.command === "think") await stepContext!.clear();
  const config = loadBrainGlobalConfig(brainRoot);
  warnings.push(...config.diagnostics.map((item) => item.message));
  if (invocation.command === "ask-search" && !config.features.semanticSearch) {
    throw new CliError(
      "semantic-search-disabled",
      "Semantic search is disabled in this Brain configuration. Use grep/glob.",
    );
  }
  const project = await resolveOrCreateProject({ brainRoot, sourceRoot });
  const infrastructure = await bootstrapBrainRuntimeInfrastructure({
    brainRoot,
    projectId: project.projectId,
  });
  if (infrastructure.historyPreparation.kind !== "available")
    warnings.push(infrastructure.historyPreparation.diagnostic.message);
  signal.throwIfAborted();

  let embeddings: PythonEmbeddingRuntime | undefined;
  let index: SemanticIndex | undefined;
  const abort = () => embeddings?.dispose();
  signal.addEventListener("abort", abort, { once: true });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", abort);
    try {
      index?.close();
    } finally {
      embeddings?.dispose();
    }
  };
  try {
    // Read-only CLI operations need no embedding runtime. Mutation services retain
    // Brain's SemanticAwareMaintenance; a durable marker also covers unavailable runtimes.
    if (
      config.features.semanticSearch &&
      (invocation.command === "ask-search" || MUTATIONS.has(invocation.command))
    ) {
      try {
        assertSemanticRuntimeReady(brainRoot);
        embeddings = new PythonEmbeddingRuntime(brainRoot);
        index = new SemanticIndex(brainRoot, infrastructure.binding, embeddings);
        // One-shot commands reconcile using existing methods without installing a watcher
        // or timer that could enqueue work while the CLI closes its database.
        await index.reconcile();
        await index.ensureFresh();
      } catch (error) {
        index?.close();
        index = undefined;
        embeddings?.dispose();
        embeddings = undefined;
        signal.throwIfAborted();
        if (invocation.command === "ask-search") throw error;
        warnings.push(
          `Semantic index update deferred: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    signal.throwIfAborted();
    const services = createBrainApplicationServices(infrastructure, {
      sourceRoot,
      features: config.features,
      ...(index === undefined || embeddings === undefined
        ? {}
        : { semanticRuntime: { index, embeddings } }),
    });
    return {
      binding: { sourceRoot, brainRoot, projectId: project.projectId },
      async execute(): Promise<string> {
        signal.throwIfAborted();
        if (config.features.semanticSearch && MUTATIONS.has(invocation.command)) {
          // Mark before mutation: failures and partial writes cannot silently leave a
          // persistent index stale for another CLI/MCP process.
          await new SemanticPendingStore(semanticRuntimePaths(brainRoot).pendingDirectory).record({
            kind: "full",
          });
        }
        const routed = services.routed!;
        const args = invocation.args;
        const path = String(args.path);
        const context = { signal };
        switch (invocation.command) {
          case "think": {
            const result = await routed.think();
            warnings.push(...result.diagnostics.map((item) => item.message));
            signal.throwIfAborted();
            await stepContext!.begin();
            return result.context;
          }
          case "step": {
            const host = await stepContext!.current();
            const runtime = await createFileRuntime({ resolveHost: () => host })(undefined);
            const result = await runtime.execute(args);
            return JSON.stringify(result);
          }
          case "cat": {
            if (isBrainVirtualPath(path)) {
              const result = await routed.readVirtual(path);
              warnings.push(...result.diagnostics.map((item) => item.message));
              return result.context;
            }
            return (
              await routed.cat({
                path,
                offset: args.offset as number | undefined,
                limit: args.limit as number | undefined,
                signal,
              })
            ).text;
          }
          case "ls":
            return (await routed.ls(path, context)).text;
          case "glob":
            return (
              await routed.glob(
                { pattern: String(args.pattern), path: args.path as string | undefined },
                context,
              )
            ).text;
          case "grep":
            return (
              await routed.grep(
                {
                  pattern: String(args.pattern),
                  path: args.path as string | undefined,
                  glob: args.glob as string | undefined,
                  literal: args.literal as boolean | undefined,
                  ignoreCase: args.ignoreCase as boolean | undefined,
                  context: args.context as number | undefined,
                },
                context,
              )
            ).text;
          case "ask-search":
            return (await routed.askSearch(String(args.query), context)).text;
          case "absolute-path":
            return await routed.absolutePath(path);
          case "write":
            return await routed.write(path, String(args.content));
          case "edit":
            return await routed.edit({
              path,
              content: args.content as string | undefined,
              edits: args.edits as { oldText: string; newText: string }[] | undefined,
            });
          case "rm":
            return await routed.remove(path);
          case "mv":
            return await routed.move(String(args.src), String(args.dst));
          case "feedback":
            return await routed.feedback(
              path,
              args.feedback as "adopt" | "question" | "resolve",
              args.challenge as string | undefined,
            );
          default:
            throw new CliError("usage", "Unknown command.", 2);
        }
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
