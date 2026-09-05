import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "public-tools": "src/public-tools.ts",
    shared: "src/shared.ts",
  },
  // Declarations are emitted by the explicit `types` package script. tsdown
  // only owns the JavaScript artifacts here.
  dts: false,
  // package.json owns the conditional public-tools export; do not let pack
  // rewrite it to a JavaScript-only shorthand.
  exports: false,
});
