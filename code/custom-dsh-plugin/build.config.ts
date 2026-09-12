/**
 * unbuild 构建配置（照 brain-dsh-plugin/code 的同款形态；unbuild 3.x 只认 build.config.ts，
 * 不认 unbuild.config.ts）。
 *
 * - 单入口 dist/index.mjs + dist/index.d.mts（declaration 由 rollup-plugin-dts 产出）
 * - externals 为空：host 半边零外部运行时 import（类型依赖都是 import type，编译期擦除），
 *   相对 import 由 rollup 内联成单文件 —— 产物自包含，junction 注入路径下没有 node_modules 也能跑
 * - emitCJS: false —— 纯 ESM 插件
 * - 客户端半边不在这里：lib/client.js 必须由 tsdown 打成 __ModuleLoader__ bundle，
 *   注入器的产物校验会 block 任何不是 bundle 的 lib/client.js
 */
import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [{ input: "src/index.ts", name: "index" }],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: false,
    inlineDependencies: false,
  },
  externals: [],
});
