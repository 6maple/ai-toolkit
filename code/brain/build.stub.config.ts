import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [
    { input: "src/stub-cli.ts", name: "index" },
    { input: "src/public-tools.ts", name: "public-tools" },
    { input: "src/shared.ts", name: "shared" },
  ],
  outDir: "dist",
  clean: true,
  declaration: false,
  rollup: {
    emitCJS: false,
  },
});
