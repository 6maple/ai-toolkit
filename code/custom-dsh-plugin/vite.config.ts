/**
 * Vite+ 配置。生产构建走 `vp pack`（内部是 tsdown），静态校验走 `vp check`。
 *
 * 两半各一份 pack 配置，一条 `vp pack` 全出：host → dist/（自包含 ESM + dts），
 * client → lib/client.js（浏览器按 <script> 执行的 __ModuleLoader__ bundle）。
 * 形态差得太远，不合成一份：host 是纯 ESM，客户端必须带包壳与 CJS 语义。
 *
 * `unbuild` 不在这条生产链路上，它只为 `npm run stub` 服务（把 dist/index.mjs 换成按
 * src 现编的 jiti 加载器，用于免构建迭代）。
 */
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  pack: [
    {
      // host：零外部运行时 import（类型依赖都是 import type，编译期擦除），相对模块被内联成单文件，
      // 所以 junction 注入路径下没有 node_modules 也能加载。
      name: "host",
      entry: ["src/index.ts"],
      outDir: "dist",
      format: ["esm"],
      platform: "node",
      dts: true,
      clean: true,
      deps: { neverBundle: [] },
    },
    {
      // client：注入器硬校验要求它是真 bundle，且内容含 `inject = ['slots']` 与字面量 slot 名。
      // clean 必须关：lib/ 里还躺着 host 的兼容垫片 index.js。
      name: "client",
      entry: ["src/client/index.ts"],
      outDir: "lib",
      format: "cjs",
      platform: "browser",
      dts: false,
      clean: false,
      sourcemap: true,
      tsconfig: "tsconfig.client.json",
      deps: {
        neverBundle: [
          "react",
          "react-dom",
          "cordis",
          "@deepseek-ai/dsh-client-runtime",
          "@deepseek-ai/dsh-client-ui-slots",
        ],
      },
      outputOptions: {
        entryFileNames: "client.js",
        codeSplitting: false,
        intro: "var module = { exports: {} }; var exports = module.exports;",
        banner:
          'window.__ModuleLoader__.load({ id: "@dsh-external/dsh-approve-for-me", factory: (require) => {',
        footer: "return module.exports; } });",
      },
    },
  ],
});
