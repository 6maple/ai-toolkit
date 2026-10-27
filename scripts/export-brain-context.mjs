#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "hook" },
    project: { type: "string", default: process.cwd() },
    output: { type: "string" },
    "brain-root": { type: "string" },
    layers: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Export the complete Brain context to Markdown.

Usage:
  node scripts/export-brain-context.mjs [options]

Options:
  --mode hook|tool   hook: shared restore entry used by Codex/Claude hooks (default)
                    tool: registered brain_think MCP handler, also used by DSH
  --project PATH    Project source root (default: current working directory)
  --output PATH     Markdown destination (default: PROJECT/.brain-working/brain-think-MODE.md)
  --brain-root PATH Use a specified Brain data root (for isolated fixtures)
  --layers          Also export A/B, workflow, memory views and a combined review
  --help, -h        Show this help

Uses the existing code/brain/dist/shared.mjs build or development stub.
Performs one fresh Brain restoration using the current configuration and memories.
This advances normal Brain recall state and may create a Brain history checkpoint.
With --layers, each memory view also records its displayed candidates.
No Codex, Claude, DSH agent, or generation model is started.

The Markdown contains the complete returned text without an added wrapper.
An adjacent .json file preserves the raw result, diagnostics, and capture metadata.
This captures the shared Brain output, not historical messages or other host instructions.`);
  process.exit(0);
}

async function main() {
  if (!new Set(["hook", "tool"]).has(values.mode)) {
    throw new Error("--mode must be hook or tool");
  }
  const project = path.resolve(values.project);
  if (!(await stat(project)).isDirectory()) {
    throw new Error(`Project source root is not a directory: ${project}`);
  }
  const output = path.resolve(
    values.output ?? path.join(project, ".brain-working", `brain-think-${values.mode}.md`),
  );
  if (path.extname(output).toLowerCase() !== ".md") {
    throw new Error("--output must end in .md");
  }
  const jsonOutput = output.slice(0, -3) + ".json";
  await mkdir(path.dirname(output), { recursive: true });

  const sharedUrl = new URL("../code/brain/dist/shared.mjs", import.meta.url);
  let shared;
  try {
    shared = await import(sharedUrl.href);
  } catch (error) {
    throw new Error("Cannot load Brain. Run pnpm run stub in code/brain first.", { cause: error });
  }

  const brainRoot = values["brain-root"] === undefined
    ? shared.DEFAULT_BRAIN_HOME
    : path.resolve(values["brain-root"]);
  const services = values.mode === "tool" || values.layers
    ? await shared.createBrainServicesForRoot(brainRoot, project, { initializeSemantic: false })
    : undefined;
  const handlers = new Map();
  if (services) shared.registerBrainTools({
    registerTool(name, _options, handler) { handlers.set(name, handler); },
  }, services);
  const resultText = (result) => result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
  let rawResult;
  let text;
  if (values.mode === "hook") {
    // Both UserPromptSubmit adapters inject this result.context unchanged.
    rawResult = await shared.restoreProductionBrainContext({ sourceRoot: project, brainRoot });
    text = rawResult.context;
  } else {
    const think = handlers.get("brain_think");
    if (!think) throw new Error("Brain did not register brain_think");
    rawResult = await think({});
    if (rawResult.isError) {
      throw new Error(`brain_think failed: ${JSON.stringify(rawResult)}`);
    }
    // Preserve every text block, including model-visible diagnostic blocks.
    text = resultText(rawResult);
  }
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("Brain returned no context; no capture was written");
  }

  let layerDirectory;
  const layers = [];
  if (values.layers) {
    layerDirectory = output.slice(0, -3) + ".layers";
    await mkdir(layerDirectory, { recursive: true });
    for (const name of ["normal", "deep", "normal-memory", "deep-memory"]) {
      const virtualPath = `@brain-virtual/${name}.md`;
      const result = await handlers.get("brain_cat")({ path: virtualPath });
      if (result.isError) throw new Error(`Cannot read ${virtualPath}: ${resultText(result)}`);
      const content = resultText(result);
      const file = path.join(layerDirectory, `${name}.md`);
      await writeFile(file, content, "utf8");
      layers.push({ path: virtualPath, file, characters: [...content].length, rawResult: result });
      if (name === "deep") {
        const workflowPath = content.match(/`([^`]+)`/)?.[1];
        if (!workflowPath || !path.isAbsolute(workflowPath)) throw new Error("Deep flow returned no absolute workflow path");
        const workflow = await readFile(workflowPath, "utf8");
        const workflowFile = path.join(layerDirectory, "think-workflow.md");
        await writeFile(workflowFile, workflow, "utf8");
        layers.push({ path: workflowPath, file: workflowFile, characters: [...workflow].length });
      }
    }
    const parts = await Promise.all(layers.map(async (layer) => `## ${layer.path}\n\n${await readFile(layer.file, "utf8")}`));
    await writeFile(path.join(layerDirectory, "review.md"),
      "# Brain 各层审查稿\n\n以下合并内容供人工审查，不表示模型一次实际取得全部内容。每份记忆视图由独立读取生成。\n\n## 初始返回\n\n" + text + "\n\n" + parts.join("\n\n"), "utf8");
  }
  const metadata = {
    capturedAt: new Date().toISOString(),
    mode: values.mode,
    sourceRoot: project,
    brainRoot,
    sharedEntry: sharedUrl.href,
    characters: [...text].length,
    utf8Bytes: Buffer.byteLength(text, "utf8"),
    lines: text.split("\n").length,
    sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    rawResult,
    ...(values.layers ? { layers } : {}),
  };
  await writeFile(jsonOutput, JSON.stringify(metadata, null, 2) + "\n", "utf8");
  await writeFile(output, text, "utf8");
  console.log(JSON.stringify({
    markdown: output,
    rawResult: jsonOutput,
    mode: metadata.mode,
    characters: metadata.characters,
    utf8Bytes: metadata.utf8Bytes,
    lines: metadata.lines,
    sha256: metadata.sha256,
    ...(layerDirectory ? { layers: layerDirectory } : {}),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
