import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createBrainServicesForRoot } from "brain/shared";
import { installAgent } from "../agent.mjs";
import { BRAIN_AI_FILES, PACK_ROUTE } from "../memory.mjs";

const cli = fileURLToPath(new URL("../index.mjs", import.meta.url));
const bundled = fileURLToPath(new URL("../default-memories/skill/brain-ai", import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "brain-delivery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const pack = path.join(source, "code/brain-cli/default-memories/skill/brain-ai");
  await cp(bundled, pack, { recursive: true });
  for (const name of ["brain", "brain-codex-plugin", "brain-claude-plugin", "brain-dsh-plugin"]) {
    const dir = path.join(source, "code", name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name }));
    if (name.includes("codex") || name.includes("claude")) {
      const manifest = path.join(dir, name.includes("codex") ? ".agents/plugins" : ".claude-plugin");
      await mkdir(manifest, { recursive: true });
      await writeFile(path.join(manifest, "marketplace.json"), JSON.stringify({ plugins: [{ source: {} }] }));
    }
  }
  const brainRoot = path.join(root, "data");
  const hosts = [];
  const commands = [];
  const execute = (command, args) => {
    commands.push([command, ...args]);
    if (["codex", "claude", "dsh"].includes(command)) {
      // The host must only be touched after all formal methods and the route exist.
      for (const name of BRAIN_AI_FILES) assert.ok(readFileSync(path.join(brainRoot, "global/memories/skill/brain-ai", name + ".md"), "utf8"));
      assert.ok(readFileSync(path.join(brainRoot, "global/core.md"), "utf8").includes(PACK_ROUTE));
      hosts.push([command, ...args]);
    }
    return "";
  };
  return { root, source, pack, brainRoot, hosts, commands, dependencies: { execute, brainRoot, home: path.join(root, "home") } };
}
const options = (f, agent = "codex") => ({ agent, source: "local", path: f.source, ...(agent === "dsh" ? { profile: "test" } : {}) });

test("all hosts install and repeat-update a complete method package without replacing user Core", async (t) => {
  for (const agent of ["codex", "claude", "dsh"]) {
    const f = await fixture(t);
    await mkdir(path.join(f.brainRoot, "global"), { recursive: true });
    await writeFile(path.join(f.brainRoot, "global/core.md"), "user guidance\n");
    const first = await installAgent("install", options(f, agent), f.dependencies);
    assert.equal(first.brainRoot, f.brainRoot);
    assert.equal(first.methods.written.length, 7);
    const second = await installAgent("update", options(f, agent), f.dependencies);
    assert.equal(second.methods.written.length, 0);
    const core = await readFile(path.join(f.brainRoot, "global/core.md"), "utf8");
    assert.ok(core.startsWith("user guidance\n"));
    assert.equal(core.split(PACK_ROUTE).length, 2);
    assert.ok(f.hosts.length > 0);
  }
});

test("different methods or Core routes stop update before any host command", async (t) => {
  for (const conflict of ["memory", "route", "official-update"]) {
    const f = await fixture(t);
    await installAgent("install", options(f), f.dependencies);
    const file = path.join(f.brainRoot, conflict === "route" ? "global/core.md" : "global/memories/skill/brain-ai/software.md");
    const custom = conflict === "official-update" ? await readFile(file, "utf8") : conflict === "memory" ? "user revision\n" : "custom route @global/memories/skill/brain-ai/core.md\n";
    if (conflict === "official-update") await writeFile(path.join(f.pack, "software.md"), custom + "\nnew official version\n");
    else await writeFile(file, custom);
    f.hosts.length = 0;
    await assert.rejects(installAgent("update", options(f), f.dependencies), /冲突.*宿主接入未变更/);
    assert.deepEqual(f.hosts, []);
    assert.equal(await readFile(file, "utf8"), custom);
  }
});

test("GitHub ref supplies the actual method snapshot rather than the launcher bundle", async (t) => {
  const f = await fixture(t);
  const baseExecute = f.dependencies.execute;
  f.dependencies.execute = (command, args) => {
    if (command !== "git") return baseExecute(command, args);
    if (args[0] === "clone") cpSync(f.source, args.at(-1), { recursive: true });
    if (args[2] === "checkout") {
      assert.equal(args[3], "selected-ref");
      const file = path.join(args[1], "code/brain-cli/default-memories/skill/brain-ai/software.md");
      writeFileSync(file, readFileSync(file, "utf8") + "\nselected-ref content\n");
    }
    return args[2] === "rev-parse" ? "selected-revision" : "";
  };
  const result = await installAgent("install", { agent: "codex", source: "github", repository: "https://github.com/example/test", ref: "selected-ref" }, f.dependencies);
  assert.equal(result.revision, "selected-revision");
  assert.match(await readFile(path.join(f.brainRoot, "global/memories/skill/brain-ai/software.md"), "utf8"), /selected-ref content/);
  assert.match(await readFile(path.join(result.installedFrom, "methods/brain-ai/software.md"), "utf8"), /selected-ref content/);
});

test("a missing source method fails preparation without touching the host or Brain data", async (t) => {
  const f = await fixture(t);
  await rm(path.join(f.pack, "software.md"));
  await assert.rejects(installAgent("install", options(f), f.dependencies), /ENOENT/);
  assert.deepEqual(f.hosts, []);
  await assert.rejects(readFile(path.join(f.brainRoot, "global/core.md")), { code: "ENOENT" });
});

test("host failure reports that methods are already installed and does not record success", async (t) => {
  const f = await fixture(t);
  f.dependencies.execute = (command) => { if (command === "codex") throw new Error("synthetic host failure"); return ""; };
  await assert.rejects(installAgent("install", options(f), f.dependencies), /已完成步骤：方法包与Global Core入口就绪.*synthetic host failure/);
  assert.ok((await readFile(path.join(f.brainRoot, "global/core.md"), "utf8")).includes(PACK_ROUTE));
  await assert.rejects(readFile(path.join(f.dependencies.home, "state/codex.json")), { code: "ENOENT" });
});

test("pack --brain-root prepares only the explicitly selected data root", async (t) => {
  const f = await fixture(t);
  const unused = path.join(f.root, "unused");
  const result = spawnSync(process.execPath, [cli, "pack", "install", "brain-ai", "--brain-root", f.brainRoot], { encoding: "utf8", windowsHide: true, env: { ...process.env, BRAIN_CLI_ROOT: unused } });
  assert.equal(result.status, 0, result.stderr);
  assert.ok((await readFile(path.join(f.brainRoot, "global/core.md"), "utf8")).includes(PACK_ROUTE));
  await assert.rejects(readFile(path.join(unused, "global/core.md")), { code: "ENOENT" });
  const services = await createBrainServicesForRoot(f.brainRoot, f.source, { initializeSemantic: false });
  const view = await services.routed.readVirtual("@brain-virtual/deep-memory.md");
  assert.ok(view.context.includes(PACK_ROUTE));
  assert.equal(services.binding.brainRoot, f.brainRoot);
});
