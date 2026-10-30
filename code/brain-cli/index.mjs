#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { installAgent } from "./agent.mjs";
import { exportGlobal, importGlobal, installBrainAi } from "./memory.mjs";
import { installSemanticSearch } from "./semantic-search.mjs";

const HELP = `Brain CLI

brain-cli install|update --agent codex|claude|dsh --source local --path <ai-toolkit目录> [--profile <名称>]
brain-cli install|update --agent codex|claude|dsh --source github --repository <GitHub HTTPS URL> [--ref <版本>] [--profile <名称>]
brain-cli semantic-search install|update
brain-cli memory export --output <目录>
brain-cli memory import <目录>
brain-cli pack install brain-ai [--brain-root <数据目录>]

只有 dsh 要求 --profile。Brain 数据根目录默认 ~/.brain-data；测试可通过 BRAIN_CLI_ROOT 指定。
`;

function optionsFrom(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(`参数需要值：${key}`);
    const name = key.slice(2);
    if (!["agent", "source", "path", "repository", "ref", "profile", "output", "brain-root"].includes(name)) throw new Error(`未知参数：${key}`);
    if (options[name] !== undefined) throw new Error(`重复参数：${key}`);
    options[name] = value;
  }
  return options;
}
function display(result) {
  if (result === undefined) return;
  console.log(JSON.stringify(result, null, 2));
}
function displayInstall(result) {
  display(result);
  if (result.conflicts.length > 0) throw new Error(`发现路径冲突，未开始写入：${result.conflicts.join(", ")}`);
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || args.includes("--help") || args[0] === "help") {
    console.log(HELP);
    return;
  }
  const [command, action, ...rest] = args;
  if (command === "install" || command === "update") {
    const options = optionsFrom(args.slice(1));
    if (options["brain-root"] !== undefined) throw new Error("--brain-root 仅用于 pack install；宿主使用默认 Brain 数据根");
    display(await installAgent(command, options));
    return;
  }
  if (command === "semantic-search" && ["install", "update"].includes(action) && rest.length === 0) {
    await installSemanticSearch(action);
    return;
  }
  if (command === "memory" && action === "export") {
    const options = optionsFrom(rest);
    if (!options.output || Object.keys(options).length !== 1) throw new Error("memory export 需要 --output <目录>");
    display(await exportGlobal(options.output));
    return;
  }
  if (command === "memory" && action === "import" && rest.length === 1) {
    displayInstall(await importGlobal(rest[0]));
    return;
  }
  if (command === "pack" && action === "install" && rest[0] === "brain-ai") {
    const options = optionsFrom(rest.slice(1));
    if (Object.keys(options).some((key) => key !== "brain-root")) throw new Error("pack install 只接受 --brain-root <目录>");
    displayInstall(await installBrainAi(options["brain-root"] === undefined ? {} : { brainRoot: resolve(options["brain-root"]) }));
    return;
  }
  throw new Error(`未知命令或参数。\n${HELP}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
