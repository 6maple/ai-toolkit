import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pluginConfig } from "../plugin.config.mjs";

const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(await readFile(resolve(pluginRoot, "package.json"), "utf8"));

async function writeJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function validateMarketplace() {
  const marketplace = JSON.parse(
    await readFile(resolve(pluginRoot, pluginConfig.marketplace.manifest), "utf8"),
  );
  if (marketplace.name !== pluginConfig.marketplace.name) {
    throw new Error("Claude marketplace name does not match plugin configuration");
  }
  const entries = marketplace.plugins?.filter((entry) => entry.name === packageJson.name);
  if (entries?.length !== 1 || entries[0].source !== pluginConfig.marketplace.sourcePath) {
    throw new Error("Claude marketplace must contain exactly one local plugin entry");
  }
}

async function runUnbuildStub() {
  const cli = resolve(pluginRoot, "node_modules/unbuild/dist/cli.mjs");
  await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "--stub", "--config", resolve(pluginRoot, "build.config.ts")],
      { cwd: pluginRoot, stdio: "inherit", windowsHide: true },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) done();
      else reject(new Error(`unbuild stub failed: code=${code} signal=${signal ?? "none"}`));
    });
  });
}

await validateMarketplace();
await runUnbuildStub();

await writeJson(resolve(pluginRoot, ".claude-plugin/plugin.json"), {
  name: packageJson.name,
  displayName: "Brain",
  version: packageJson.version,
  description: packageJson.description,
  author: packageJson.author,
  license: packageJson.license,
  keywords: packageJson.keywords,
  hooks: "./hooks/hooks.json",
  mcpServers: "./.mcp.json",
});

await writeJson(resolve(pluginRoot, ".mcp.json"), {
  mcpServers: {
    [pluginConfig.entries.mcp.serverName]: {
      command: "node",
      args: [`${"${CLAUDE_PLUGIN_ROOT}"}/dist/${pluginConfig.entries.mcp.name}.mjs`],
    },
  },
});

function commandHook(name, timeout) {
  return {
    type: "command",
    command: "node",
    args: [`${"${CLAUDE_PLUGIN_ROOT}"}/dist/${name}.mjs`],
    timeout,
  };
}

await writeJson(resolve(pluginRoot, "hooks/hooks.json"), {
  description: pluginConfig.hook.description,
  hooks: {
    UserPromptSubmit: [{ hooks: [commandHook(pluginConfig.entries.hook.name, pluginConfig.hook.timeout)] }],
    PermissionRequest: [{
      matcher: pluginConfig.permissionHook.matcher,
      hooks: [commandHook(pluginConfig.entries.permissionHook.name, pluginConfig.permissionHook.timeout)],
    }],
  },
});

console.log(`Generated Claude Code stub plugin ${packageJson.name}`);
