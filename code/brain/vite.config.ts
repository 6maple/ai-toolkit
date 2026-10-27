import tsdownConfig from "./tsdown.config.ts";

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: tsdownConfig,
  fmt: {
    // Keep reviewed model-visible guidance byte-for-byte; format its assembly code normally.
    ignorePatterns: ["step/guidance/**", "think-workflow/brain-ai/**"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  // Windows sandbox workaround: with preserveSymlinks vite skips
  // safeRealpathSync entirely, which avoids the one-time `net use` child
  // spawn (optimizeSafeRealPathSync) that the DSH file sandbox blocks with
  // EPERM. Side effect: dependencies resolve through their symlink paths,
  // which is standard for pnpm layouts.
  resolve: { preserveSymlinks: true },
  // Vitest: run tests in worker threads instead of forked child processes,
  // so the sandbox (which blocks piped-stdio spawns) does not block the pool.
  test: {
    pool: "threads",
    // Default project CI executes only the reviewed production-facing suite:
    // real brain business logic with deterministic fake resource boundaries.
    include: ["tests/ci-spec/production-*.test.ts"],
  },
});
