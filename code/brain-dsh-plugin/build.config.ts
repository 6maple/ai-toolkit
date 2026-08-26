/**
 * unbuild 构建配置（参考 pi-mp packages/workflow/build.config 同款；注意 unbuild 3.x
 * 的标准配置文件名是 build.config.ts —— 不是 unbuild.config.ts，后者不会被加载）。
 *
 * - 单入口 dist/index.mjs + dist/index.d.mts（declaration 由 rollup-plugin-dts 产出）
 * - externals：宿主运行时服务包与独立安装的 brain 均保持外部；依赖由
 *   profile/package manager 管理，构建本身不修改 node_modules
 * - emitCJS: false — 纯 ESM 插件
 */
import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [{ input: 'src/index.ts', name: 'index' }],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: false,
    inlineDependencies: false,
  },
  externals: [
    '@deepseek-ai/schemastery',
    '@deepseek-ai/cordis',
    '@deepseek-ai/cosmokit',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-brand',
    '@standard-schema/spec',
    'brain',
  ],
})
