import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [{ input: "src/cli.ts", name: "brain-skill" }],
  outDir: "dist",
  clean: true,
  declaration: false,
  rollup: { emitCJS: false },
});
