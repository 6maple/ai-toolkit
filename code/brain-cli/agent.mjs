import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { BRAIN_AI_FILES, BRAIN_ROOT, installBrainAi } from "./memory.mjs";

const HOME = process.env.BRAIN_CLI_HOME ?? path.join(homedir(), ".brain-cli");
const PLUGINS = {
  codex: { directory: "brain-codex-plugin", name: "brain-codex-plugin", marketplace: "brain-cli-codex" },
  claude: { directory: "brain-claude-plugin", name: "brain-claude-plugin", marketplace: "brain-cli-claude" },
  dsh: { directory: "brain-dsh-plugin", name: "@dsh-external/brain-dsh-plugin" },
};

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 失败（${result.status}）：${capture ? (result.stderr || result.stdout).trim() : "查看上方输出"}`);
  }
  return capture ? result.stdout.trim() : "";
}
function validateGitHub(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.search || url.hash) {
    throw new Error("--repository 必须是无凭据的 GitHub HTTPS 仓库 URL");
  }
  return url.href;
}
async function copyProject(source, target) {
  const ignored = new Set(["node_modules", "dist", ".git", ".cache"]);
  await cp(source, target, {
    recursive: true,
    filter: (item) => !ignored.has(path.basename(item)),
  });
}
async function acquireSource(options, destination, execute) {
  if (options.source === "local") {
    if (!options.path || options.repository || options.ref) throw new Error("本地来源需 --path，且不能给 --repository/--ref");
    return { root: path.resolve(options.path), revision: "local" };
  }
  if (options.source !== "github" || !options.repository || options.path) {
    throw new Error("来源需显式指定 --source local --path 或 --source github --repository");
  }
  const url = validateGitHub(options.repository);
  await mkdir(path.dirname(destination), { recursive: true });
  execute("git", ["clone", "--no-checkout", url, destination]);
  if (options.ref) execute("git", ["-C", destination, "checkout", options.ref]);
  else execute("git", ["-C", destination, "checkout", "HEAD"]);
  const revision = execute("git", ["-C", destination, "rev-parse", "HEAD"], undefined, true);
  return { root: destination, revision };
}
async function prepare(options, execute, home) {
  const plugin = PLUGINS[options.agent];
  if (!plugin) throw new Error("--agent 必须为 codex、claude 或 dsh");
  if (options.agent === "dsh" && !options.profile) throw new Error("DSH 安装需要 --profile");
  if (options.profile && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.profile)) throw new Error("--profile 名称无效");
  if (options.agent !== "dsh" && options.profile) throw new Error("--profile 只用于 dsh");
  const version = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const installRoot = path.join(home, "installs", options.agent, version);
  const downloadRoot = path.join(installRoot, "download");
  await mkdir(installRoot, { recursive: true });
  const source = await acquireSource(options, downloadRoot, execute);
  const brainSource = path.join(source.root, "code", "brain");
  const pluginSource = path.join(source.root, "code", plugin.directory);
  for (const folder of [brainSource, pluginSource]) {
    const info = await readFile(path.join(folder, "package.json"), "utf8").catch(() => undefined);
    if (info === undefined) throw new Error(`来源缺少所需 package.json：${folder}`);
  }
  const brain = path.join(installRoot, "code", "brain");
  const pluginRoot = path.join(installRoot, "code", plugin.directory);
  await copyProject(brainSource, brain);
  await copyProject(pluginSource, pluginRoot);
  const packRoot = path.join(installRoot, "methods", "brain-ai");
  await mkdir(packRoot, { recursive: true });
  for (const name of BRAIN_AI_FILES) {
    await cp(path.join(source.root, "code", "brain-cli", "default-memories", "skill", "brain-ai", `${name}.md`), path.join(packRoot, `${name}.md`));
  }
  execute("pnpm", ["install", "--config.confirmModulesPurge=false"], brain);
  execute("pnpm", ["run", "build"], brain);
  execute("pnpm", ["install", "--config.confirmModulesPurge=false"], pluginRoot);
  if (options.agent === "dsh") execute("pnpm", ["run", "build"], pluginRoot);
  else {
    execute("pnpm", ["run", "stub"], pluginRoot);
    execute("pnpm", ["exec", "unbuild", "--config", "build.config.ts"], pluginRoot);
    const manifest = options.agent === "codex"
      ? path.join(pluginRoot, ".agents", "plugins", "marketplace.json")
      : path.join(pluginRoot, ".claude-plugin", "marketplace.json");
    const value = JSON.parse(await readFile(manifest, "utf8"));
    value.name = plugin.marketplace;
    if (options.agent === "codex") value.plugins[0].source.path = "./";
    await writeFile(manifest, JSON.stringify(value, null, 2) + "\n");
  }
  return { plugin, pluginRoot, installRoot, packRoot, sourceRoot: source.root, revision: source.revision };
}

export async function installAgent(mode, options, { execute = run, home = HOME, brainRoot = BRAIN_ROOT } = {}) {
  if (mode !== "install" && mode !== "update") throw new Error("命令应为 install 或 update");
  const prepared = await prepare(options, execute, home);
  const { plugin, pluginRoot } = prepared;
  const completed = [];
  const step = (label, command, args) => {
    execute(command, args);
    completed.push(label);
  };
  try {
    const methods = await installBrainAi({ packRoot: prepared.packRoot, brainRoot });
    if (methods.conflicts.length > 0) throw new Error(`方法包存在冲突，宿主接入未变更：${methods.conflicts.join("、")}`);
    completed.push("方法包与Global Core入口就绪");
    prepared.methods = methods;
    if (options.agent === "codex") {
      if (mode === "update") step("移除旧 marketplace", "codex", ["plugin", "marketplace", "remove", plugin.marketplace]);
      step("添加新 marketplace", "codex", ["plugin", "marketplace", "add", pluginRoot]);
      if (mode === "update") step("移除旧插件缓存", "codex", ["plugin", "remove", `${plugin.name}@${plugin.marketplace}`]);
      step("安装插件", "codex", ["plugin", "add", `${plugin.name}@${plugin.marketplace}`]);
    } else if (options.agent === "claude") {
      if (mode === "update") step("移除旧 marketplace", "claude", ["plugin", "marketplace", "remove", plugin.marketplace]);
      step("添加新 marketplace", "claude", ["plugin", "marketplace", "add", pluginRoot]);
      step("安装或更新插件", "claude", ["plugin", mode === "update" ? "update" : "install", `${plugin.name}@${plugin.marketplace}`]);
    } else {
      step("安装或更新 DSH 插件", "dsh", ["plugin", "--profile", options.profile, "add", pluginRoot]);
    }
  } catch (error) {
    throw new Error(`安装接入中断。已准备产物：${prepared.installRoot}；已完成步骤：${completed.join("、") || "无"}；${error instanceof Error ? error.message : String(error)}`);
  }
  const result = {
    mode,
    agent: options.agent,
    source: options.source,
    revision: prepared.revision,
    sourceRoot: prepared.sourceRoot,
    installedFrom: prepared.installRoot,
    brainRoot: path.resolve(brainRoot),
    methods: prepared.methods,
    profile: options.profile,
    next: "重启目标宿主，并按其提示完成插件信任或启用步骤",
  };
  await mkdir(path.join(home, "state"), { recursive: true });
  await writeFile(path.join(home, "state", `${options.agent}${options.profile ? `-${options.profile}` : ""}.json`), JSON.stringify(result, null, 2) + "\n");
  return result;
}
