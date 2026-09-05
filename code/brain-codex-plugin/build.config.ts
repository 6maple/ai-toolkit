import { defineBuildConfig } from "unbuild";
import { pluginConfig } from "./plugin.config.mjs";

export default defineBuildConfig({
  entries: [
    pluginConfig.entries.hook,
    pluginConfig.entries.permissionHook,
    pluginConfig.entries.mcp,
  ],
  outDir: "dist",
  clean: true,
  declaration: false,
  rollup: {
    emitCJS: false,
  },
});
