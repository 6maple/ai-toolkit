/**
 * @dsh-external/brain-dsh-plugin — brain 记忆系统 DSH 原生插件。
 *
 * 薄包装：按source root懒spawn brain（MCP stdio），把core唯一public
 * contract 注册进 dsh-tools，并转发可信的 DSH session fact。
 *
 * 会话/项目解析（宿主直读，无需 _meta）：
 * - 会话 id：exec.agent.id
 * - source root：exec.agent.session.header.cwd（DSH 会话创建时校验写入）
 *
 * 资源注册全部挂 ctx.effect（热重载/卸载自动清理）。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { PUBLIC_BRAIN_TOOLS, type BrainToolDefinition } from 'brain/public-tools'
import { setupAutoThink } from './autothink.js'
import { InstanceManager } from './instances.js'
import { extractText } from './mcp.js'
import { setupOpenCodeSessionHeader } from './opencode-session.js'

// Programmatic surface for verification and embedding. The contract itself is
// re-exported from core; this package does not own a copy.
export { InstanceManager } from './instances.js'
export { PUBLIC_BRAIN_TOOLS } from 'brain/public-tools'
export { setupAutoThink } from './autothink.js'
export { extractAnchorContext, extractText } from './mcp.js'
export { isOpenCodeUrl, setupOpenCodeSessionHeader } from './opencode-session.js'

export const name = '@dsh-external/brain-dsh-plugin'
export const inject = ['tools', 'agents']

export interface Config {
  server: {
    command: string
    args: string[]
    timeoutMs: number
  }
  /**
   * 是否把 brain_think 注册给模型（默认开放）。
   * 注意：当 autoThink.enabled 开启（宿主自动注入）时，brain_think 自动对模型隐藏
   * （避免模型重复调用），即实际注册条件 = exposeThink && !autoThink.enabled。
   * DSH 部署下 autoThink 默认开启 → brain_think 默认不开放，由自动注入接管。
   */
  exposeThink: boolean
  autoThink: {
    /** 收到用户消息后自动调用 brain_think 并注入模型上下文（默认开启）。 */
    enabled: boolean
    /** 自动注入的单次调用超时（默认 5s；超时静默跳过，不阻塞 step）。 */
    timeoutMs: number
  }
  opencodeSession: {
    /** 为 OpenCode Go 请求注入当前 DSH 会话 ID（默认开启）。 */
    enabled: boolean
    /** 需要注入的 DSH provider 名称。 */
    providers: string[]
    /** 允许注入请求头的目标域名及其子域名。 */
    hosts: string[]
  }
}

export const Config = z.object({
  server: z.object({
    command: z.string().default('node'),
    args: z.array(z.string()).default([]),
    timeoutMs: z.number().default(30_000),
  }),
  exposeThink: z.boolean().default(true),
  autoThink: z.object({
    enabled: z.boolean().default(true),
    timeoutMs: z.number().default(5000),
  }),
  opencodeSession: z.object({
    enabled: z.boolean().default(true),
    providers: z.array(z.string()).default(['opencode', 'opencode-go']),
    hosts: z.array(z.string()).default(['opencode.ai']),
  }),
})

const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { content: { type: 'array', items: {} } },
  required: ['content'],
  additionalProperties: false,
}

export function toHostSchema(definition: BrainToolDefinition): Record<string, unknown> {
  // Zod attaches a non-enumerable `~standard` property to the generated root.
  // DSH 0.1.5 deliberately rejects such objects when projecting tool schemas,
  // so cross the adapter boundary through JSON to produce the wire value that
  // the JSON Schema generator represents.
  const encoded = JSON.stringify(definition.inputSchema.toJSONSchema({ target: 'draft-07' }))
  const schema: unknown = JSON.parse(encoded)
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error(`brain-dsh-plugin: ${definition.name} produced a non-object input schema`)
  }
  return schema as Record<string, unknown>
}

/** The hook owns anchor triggering, so it is the only mode that hides think. */
export function visibleToolDefinitions(
  autoThinkEnabled: boolean,
  exposeThink: boolean,
): readonly BrainToolDefinition[] {
  return PUBLIC_BRAIN_TOOLS.filter(
    (definition) => definition.name !== 'brain_think' || (exposeThink && !autoThinkEnabled),
  )
}

/** Per-call source root comes from the trusted session cwd. */
export function resolveSourceRoot(agent: Agent | undefined): string {
  const cwd = agent?.session?.header?.cwd
  if (cwd) return cwd
  throw new Error('brain: cannot determine source root — no session cwd available')
}

/**
 * Model args → wire args. brain_think receives the trusted DSH session only
 * when the model did not explicitly choose a session.
 */
export function buildCallArgs(
  args: unknown,
  agent: Agent | undefined,
  injectable: boolean,
): Record<string, unknown> {
  const raw = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
  const out: Record<string, unknown> = { ...raw }
  if (injectable && agent && typeof out.session_id !== 'string') {
    out.session_id = agent.id
  }
  return out
}

export function apply(ctx: Context, config: Config): void {
  ctx.effect(
    () => setupOpenCodeSessionHeader(ctx, config.opencodeSession),
    'brain: OpenCode session header',
  )

  // ---- resolve the brain server entry ----
  const require = createRequire(import.meta.url)
  const defaultServerPath = require.resolve('brain')
  const serverArgs = config.server.args.length > 0 ? [...config.server.args] : [defaultServerPath]
  if (config.server.args.length === 0 && !existsSync(defaultServerPath)) {
    throw new Error(
      `brain-dsh-plugin: brain dist not found at ${defaultServerPath} — build brain first ` +
        '(install the matching brain package, or point server.args at the built entry explicitly)',
    )
  }
  const command = config.server.command === 'node' ? process.execPath : config.server.command
  const manager = new InstanceManager({
    command,
    args: serverArgs,
    timeoutMs: config.server.timeoutMs,
  })
  ctx.effect(() => () => manager.dispose(), 'brain: instances')

  // ---- register the core-owned public contract (lazy instances) ----
  // brain_think 的实际注册条件 = exposeThink && !autoThink.enabled：
  // 自动注入开启时它对模型隐藏（宿主接管），关闭时才开放给模型手动调。
  const exposeThink = config.exposeThink && !config.autoThink.enabled
  const registered: string[] = []
  for (const definition of visibleToolDefinitions(config.autoThink.enabled, config.exposeThink)) {
    const injectable = definition.name === 'brain_think'
    registered.push(definition.name)
    ctx.effect(
      () =>
        ctx.tools.register({
          name: definition.name,
          description: definition.description,
          parameters: toHostSchema(definition),
          output: {
            schema: OUTPUT_SCHEMA,
            render: (_args: unknown, value: { content?: Array<{ type: string; text?: string }> }) => [
              { type: 'text' as const, text: extractText(value.content, definition.name) },
            ],
          },
          async execute(args: unknown, exec: ToolRunContext) {
            const sourceRoot = resolveSourceRoot(exec.agent)
            const callArgs = buildCallArgs(args, exec.agent, injectable)
            const result = await manager.call(sourceRoot, definition.name, callArgs, exec.signal, {
              ...(exec.agent?.id === undefined ? {} : { threadId: exec.agent.id }),
            })
            if (result.isError === true) throw new Error(extractText(result.content, definition.name))
            return { content: result.content }
          },
        }),
      `brain: ${definition.name}`,
    )
  }

  // ---- 自动注入：收到用户消息后自动 brain_think + 注入模型上下文 ----
  ctx.effect(
    () =>
      setupAutoThink(
        ctx,
        manager,
        { enabled: config.autoThink.enabled, timeoutMs: config.autoThink.timeoutMs },
        (agent) => resolveSourceRoot(agent),
      ),
    'brain: auto-think',
  )

  ctx.logger.info(
    `brain-dsh-plugin: ${registered.length} tools registered (${registered.join(', ')}); ` +
      `server ${command} ${serverArgs.join(' ')}, ` +
      `exposeThink=${exposeThink}, autoThink=${config.autoThink.enabled}`,
  )
}
