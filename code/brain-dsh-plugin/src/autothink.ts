/**
 * AutoThink — 宿主自动注入：收到用户消息后自动调用 brain_think，把结果作为
 * **消息**注入模型输入（AGENTS.md 同款消息通道，非 contexts 条目）。
 *
 * 为什么是消息通道而不是 contexts：
 * - contexts 条目每次 assemble 都在注入列表里（每次消息刷屏）且快照消息的
 *   source 被 agent-loop 硬编码归因到 dsh-system-prompt；
 * - 消息通道可自定义 source（显示 brain-dsh-plugin）、内容不变不重复注入、
 *   进历史可恢复，与 agent-instructions（AGENTS.md）机制一致。
 *
 * 识别"真正收到用户消息"（已用真实会话数据验证）：
 * - 用户消息在 session 事件流里落盘为 `agent/inbox/spliced` 事件，
 *   `data.inserted[].source.kind === 'user'`（带 rpcId/clientTimeZone 的客户端消息）
 * - steer（用户中途指导）同样触发（新指令刷新记忆）；inject/plugin 注入不触发；
 *   消息被 step 取走的 `removedCount` splice 不触发。
 *
 * 时序（agent-loop 源码确认）：send → splice 落盘 → preStep →
 * inbox.claim → systemPrompt.assemble（本模块触发 think + 缓存）→
 * agent/pre-step（本模块消费缓存并 push 进 messages）→ 落盘 user/message。
 *
 * 去重：仅按**用户消息**去重（同一条消息的多个 step 只注入一次）；
 * 每条新用户消息必定注入（内容相同也输出，think 每次调用推进 tick）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { extractAnchorContext, extractText } from './mcp.js'
import type { InstanceManager } from './instances.js'

export interface AutoThinkConfig {
  enabled: boolean
  timeoutMs: number
}

/** 注入消息的来源标识（GUI 显示"上下文注入 @dsh-external/brain-dsh-plugin"）。 */
export const SOURCE_PLUGIN = '@dsh-external/brain-dsh-plugin'

interface SpliceEvent {
  type: string
  seq?: number
  data?: {
    inserted?: Array<{ source?: { kind?: string } }>
  }
}

/** 会话事件流中最后一条"插入过 user 消息"的 splice 事件 seq。 */
function lastUserMessageSeq(agent: Agent): number {
  let last = 0
  for (const event of agent.session.events as unknown as SpliceEvent[]) {
    if (event.type !== 'agent/inbox/spliced') continue
    const inserted = event.data?.inserted
    if (Array.isArray(inserted) && inserted.some((message) => message?.source?.kind === 'user')) {
      if (typeof event.seq === 'number') last = event.seq
    }
  }
  return last
}

/** 历史中最后一条本插件注入消息的文本（resume 基线，避免重复注入）。 */

export function setupAutoThink(
  ctx: Context,
  manager: InstanceManager,
  config: AutoThinkConfig,
  resolveSourceRoot: (agent: Agent | undefined) => string,
): () => void {
  if (!config.enabled) return () => {}
  /** 上次已注入的用户消息 splice seq（新消息 seq 更大才触发；同一条消息只注入一次）。 */
  const injectedSeq = new Map<string, number>()
  /** assemble 缓存 → pre-step 消费的待注入消息。 */
  const pending = new Map<string, ReturnType<typeof createUserMessage>>()

  // 基线快照：现存 agent 以其当前最后用户消息 seq 为基线（不重复注入历史消息）。
  for (const agent of ctx.agents?.list?.() ?? []) {
    injectedSeq.set(agent.id, lastUserMessageSeq(agent))
  }

  const disposeAssemble = ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const assembled = await next()
    const agent = ctx.agents?.currentInitiator?.()
    if (!agent) return assembled
    const last = lastUserMessageSeq(agent)
    if (last <= 0) return assembled
    const baseline = injectedSeq.get(agent.id) ?? 0 // 新 agent：0 → 首条消息触发
    if (last <= baseline) return assembled
    injectedSeq.set(agent.id, last)
    try {
      const signal = timeoutSignal(context.signal, config.timeoutMs)
      const result = await manager.call(
          resolveSourceRoot(agent),
          'brain_think',
          { session_id: agent.id },
          signal,
          { threadId: agent.id },
      )
      const text = extractAnchorContext(result.content)
      if (result.isError === true) {
        ctx.logger.warn(`brain: auto think rejected for ${agent.id}: ${extractText(result.content, 'brain_think')}`)
        return assembled
      }
      if (!text) {
        ctx.logger.warn(`brain: auto think returned no cognition context for ${agent.id}`)
        return assembled
      }
      const warnings = result.content.slice(1).filter((block) => block.type === 'text' && block.text)
      for (const warning of warnings) ctx.logger.warn(`brain: auto think diagnostic for ${agent.id}: ${warning.text}`)
      pending.set(
        agent.id,
        createUserMessage({
          content: [{ type: 'text', text }],
          // 自定义来源：GUI 显示"上下文注入 @dsh-external/brain-dsh-plugin"。
          // 不声明 form（undeclared context 是文档默认，GUI 用普通文本展示正文）。
          source: { kind: 'plugin', plugin: SOURCE_PLUGIN },
        }),
      )
      ctx.logger.debug(`brain: auto think staged for ${agent.id} (splice seq ${last})`)
    } catch (error) {
      ctx.logger.warn(`brain: auto think failed for ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return assembled
  })

  const disposePreStep = ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision?.kind === 'enter' && Array.isArray(decision.messages)) {
      const message = pending.get(payload.agent.id)
      if (message) {
        pending.delete(payload.agent.id)
        decision.messages.push(message)
      }
    }
    return decision
  })

  return () => {
    disposeAssemble()
    disposePreStep()
  }
}

function timeoutSignal(parent: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return parent
  const timeout = AbortSignal.timeout(ms)
  return parent ? AbortSignal.any([parent, timeout]) : timeout
}
