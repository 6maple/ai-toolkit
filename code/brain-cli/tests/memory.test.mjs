import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = fileURLToPath(new URL("../index.mjs", import.meta.url));
function call(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, BRAIN_CLI_ROOT: root },
  });
}

test("brain-ai package keeps one Core route and rejects edited package contents", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "brain-cli-pack-"));
  const root = path.join(temp, "brain");
  try {
    const first = call(root, ["pack", "install", "brain-ai"]);
    assert.equal(first.status, 0, first.stderr);
    const second = call(root, ["pack", "install", "brain-ai"]);
    assert.equal(second.status, 0, second.stderr);
    const core = await readFile(path.join(root, "global", "core.md"), "utf8");
    assert.equal(core.match(/brain-ai\/core\.md/g)?.length, 1);

    const installed = path.join(root, "global", "memories", "skill", "brain-ai");
    const names = ["agentic-software", "core", "instructions", "report-writing", "software", "user-facing-expression"];
    assert.deepEqual(await readdir(installed), names.map((name) => name + ".md"));
    for (const name of names) {
      const bundled = new URL("../default-memories/skill/brain-ai/" + name + ".md", import.meta.url);
      assert.equal(await readFile(path.join(installed, name + ".md"), "utf8"), await readFile(bundled, "utf8"));
    }

    const target = path.join(installed, "software.md");
    await writeFile(target, "user revision\n");
    const third = call(root, ["pack", "install", "brain-ai"]);
    assert.notEqual(third.status, 0);
    assert.match(third.stderr, /路径冲突/);
    assert.equal(await readFile(target, "utf8"), "user revision\n");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Global export/import preserves paths, warns on invalid state, and preflights conflicts", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "brain-cli-migrate-"));
  const source = path.join(temp, "source");
  const destination = path.join(temp, "destination");
  const exportPath = path.join(temp, "export");
  try {
    assert.equal(call(source, ["pack", "install", "brain-ai"]).status, 0);
    const statePath = path.join(source, "global", ".state", "memories", "skill", "brain-ai", "core.json");
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, "broken state\n");
    const validStatePath = path.join(source, "global", ".state", "memories", "skill", "brain-ai", "software.json");
    const software = await readFile(path.join(source, "global", "memories", "skill", "brain-ai", "software.md"), "utf8");
    await writeFile(validStatePath, JSON.stringify({
      contentHash: createHash("sha256").update(software).digest("hex"),
      challenge: "仍需核对一个旧规则的适用范围",
      ageCycles: 8,
      anchorCycle: 3,
      durability: 5,
      exposure: 2,
    }));
    const exported = call(source, ["memory", "export", "--output", exportPath]);
    assert.equal(exported.status, 0, exported.stderr);
    assert.match(exported.stdout, /状态或正文损坏/);
    assert.deepEqual(await readdir(path.join(exportPath, "global", "memories", "skill", "brain-ai")), ["agentic-software.md", "core.md", "instructions.md", "report-writing.md", "software.md", "user-facing-expression.md"]);
    assert.equal(call(destination, ["memory", "import", exportPath]).status, 0);
    const importedState = JSON.parse(await readFile(path.join(destination, "global", ".state", "memories", "skill", "brain-ai", "software.json"), "utf8"));
    assert.equal(importedState.challenge, "仍需核对一个旧规则的适用范围");
    assert.equal(importedState.ageCycles, 0);
    assert.equal(importedState.exposure, 0);

    const revision = path.join(destination, "global", "memories", "skill", "brain-ai", "core.md");
    await writeFile(revision, "user revision\n");
    const newFile = path.join(exportPath, "global", "memories", "knowledge", "new.md");
    await mkdir(path.dirname(newFile), { recursive: true });
    await writeFile(newFile, "---\ndescription: test\nsummary: test\nimportance: low\n---\nbody\n");
    const conflict = call(destination, ["memory", "import", exportPath]);
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /路径冲突/);
    await assert.rejects(readFile(path.join(destination, "global", "memories", "knowledge", "new.md")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
