import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { pluginConfig } from "../plugin.config.mjs";

const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJsonPath = resolve(pluginRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

function portablePath(path) {
  return path.split(sep).join("/");
}

function localCachebuster() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function runUnbuild() {
  const cli = resolve(pluginRoot, "node_modules/unbuild/dist/cli.mjs");
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "--stub", "--config", resolve(pluginRoot, "build.config.ts")],
      { cwd: pluginRoot, stdio: "inherit", windowsHide: true },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`unbuild failed with code=${code} signal=${signal ?? "none"}`));
    });
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function validateMarketplace() {
  const marketplacePath = resolve(pluginRoot, pluginConfig.marketplace.manifest);
  const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
  if (marketplace.name !== pluginConfig.marketplace.name) {
    throw new Error(
      `marketplace name mismatch: expected ${pluginConfig.marketplace.name}, received ${marketplace.name}`,
    );
  }
  const entry = marketplace.plugins?.find((candidate) => candidate.name === packageJson.name);
  if (!entry) throw new Error(`marketplace entry missing for ${packageJson.name}`);
  if (entry.source?.source !== "local") throw new Error("marketplace source must be local");
  if (entry.source.path !== pluginConfig.marketplace.sourcePath) {
    throw new Error(
      `marketplace source mismatch: expected ${pluginConfig.marketplace.sourcePath}, received ${entry.source.path}`,
    );
  }
  const repositoryRoot = resolve(dirname(marketplacePath), "../..");
  const configuredPluginRoot = resolve(repositoryRoot, entry.source.path);
  if (configuredPluginRoot !== pluginRoot) {
    throw new Error(
      `marketplace source resolves to ${configuredPluginRoot}, expected ${pluginRoot}`,
    );
  }
}

async function generatePluginFiles() {
  const hookEntry = resolve(pluginRoot, "dist", `${pluginConfig.entries.hook.name}.mjs`);
  const permissionHookEntry = resolve(
    pluginRoot,
    "dist",
    `${pluginConfig.entries.permissionHook.name}.mjs`,
  );
  const mcpEntry = resolve(pluginRoot, "dist", `${pluginConfig.entries.mcp.name}.mjs`);
  const version = `${packageJson.version}+codex.local-${localCachebuster()}`;

  await writeJson(resolve(pluginRoot, ".codex-plugin/plugin.json"), {
    name: packageJson.name,
    version,
    description: packageJson.description,
    author: packageJson.author,
    license: packageJson.license,
    keywords: packageJson.keywords,
    ...pluginConfig.manifest,
    mcpServers: "./.mcp.json",
    hooks: "./hooks/hooks.json",
  });
  await writeJson(resolve(pluginRoot, ".mcp.json"), {
    mcpServers: {
      [pluginConfig.entries.mcp.serverName]: {
        command: "node",
        args: [portablePath(mcpEntry)],
      },
    },
  });
  await writeJson(resolve(pluginRoot, "hooks/hooks.json"), {
    description: pluginConfig.hook.description,
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: `node \"${portablePath(hookEntry)}\"`,
              commandWindows: `node \"${hookEntry}\"`,
              timeout: pluginConfig.hook.timeout,
              statusMessage: pluginConfig.hook.statusMessage,
              additionalContextLimit: pluginConfig.hook.additionalContextLimit,
            },
          ],
        },
      ],
      PermissionRequest: [
        {
          matcher: pluginConfig.permissionHook.matcher,
          hooks: [
            {
              type: "command",
              command: `node \"${portablePath(permissionHookEntry)}\"`,
              commandWindows: `node \"${permissionHookEntry}\"`,
              timeout: pluginConfig.permissionHook.timeout,
              statusMessage: pluginConfig.permissionHook.statusMessage,
            },
          ],
        },
      ],
    },
  });

  console.log(`Generated development plugin ${packageJson.name}@${version}`);
  console.log(`Plugin root: ${pluginRoot}`);
}

await validateMarketplace();
await runUnbuild();
await generatePluginFiles();
