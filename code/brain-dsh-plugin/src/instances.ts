/**
 * InstanceManager — one brain process per source root, lazily spawned.
 *
 * - First `brain_*` call for a source root spawns its server (initialize +
 *   tools/list), later calls reuse it.
 * - Unexpected exits mark the instance dead: a 1s cooldown prevents respawn
 *   storms, and >3 restarts within 10s refuse to respawn with a clear error.
 * - dispose() (owned by the plugin's ctx.effect) kills every child.
 *
 * Requests multiplex over one stdio pipe by JSON-RPC id; the server serializes
 * its own writes via withStoreLock, so no client-side queue is needed.
 */
import { McpClient, type McpCallResult, type McpInvocationMeta, type McpToolInfo } from './mcp.js'

export interface InstanceConfig {
  command: string
  args: readonly string[]
  timeoutMs: number
}

interface Instance {
  client: McpClient
  /** tools/list cache of the live server. */
  tools: Map<string, McpToolInfo>
  /** Single-flight promise while this instance is starting. */
  starting: Promise<Instance> | undefined
  /** Timestamp until which respawn is refused. */
  deadUntil: number
  /** Recent unexpected-exit timestamps for the crash-storm guard. */
  restartTimes: number[]
  /** True once a failure has been accounted for (spawn catch or exit). */
  recordedFailure: boolean
}

const RESPAWN_COOLDOWN_MS = 1000
const STORM_WINDOW_MS = 10_000
const STORM_MAX_RESTARTS = 3

export class InstanceManager {
  private readonly config: InstanceConfig
  private readonly instances = new Map<string, Instance>()
  private disposed = false

  constructor(config: InstanceConfig) {
    this.config = config
  }

  /** Tools advertised by the live server for a source root (spawning on demand). */
  async tools(sourceRoot: string): Promise<Map<string, McpToolInfo>> {
    return (await this.ensure(sourceRoot)).tools
  }

  /** Forward one tool call to the instance running from the source root. */
  async call(
    sourceRoot: string,
    name: string,
    args: unknown,
    signal?: AbortSignal,
    meta?: McpInvocationMeta,
  ): Promise<McpCallResult> {
    const instance = await this.ensure(sourceRoot)
    return instance.client.call(name, args, signal, meta)
  }

  /** Kill every managed server. Idempotent; safe to call twice. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const instance of this.instances.values()) instance.client.kill()
    this.instances.clear()
  }

  private async ensure(sourceRoot: string): Promise<Instance> {
    if (this.disposed) throw new Error('brain: plugin disposed')
    const existing = this.instances.get(sourceRoot)
    if (existing?.client.running) return existing
    if (existing?.starting) return existing.starting
    this.guardRestart(existing)
    return this.spawnInstance(sourceRoot, existing)
  }

  /** Enforce cooldown and crash-storm limits before respawning a dead instance. */
  private guardRestart(existing: Instance | undefined): void {
    if (!existing) return
    const now = Date.now()
    if (now < existing.deadUntil) {
      const wait = Math.ceil((existing.deadUntil - now) / 1000)
      throw new Error(`brain: server restarted too recently — retry in ~${wait}s`)
    }
    const recent = existing.restartTimes.filter((t) => now - t < STORM_WINDOW_MS)
    if (recent.length >= STORM_MAX_RESTARTS) {
      throw new Error(
        'brain: server crashed repeatedly; refusing to restart (check that brain dist/index.mjs exists and is built)',
      )
    }
  }

  private spawnInstance(sourceRoot: string, previous: Instance | undefined): Promise<Instance> {
    const client = new McpClient({
      command: this.config.command,
      args: [...this.config.args],
      cwd: sourceRoot,
      env: { ...process.env },
      timeoutMs: this.config.timeoutMs,
      onExit: () => {
        const current = this.instances.get(sourceRoot)
        if (current?.client === client && !current.recordedFailure) {
          current.recordedFailure = true
          current.deadUntil = Date.now() + RESPAWN_COOLDOWN_MS
          current.restartTimes.push(Date.now())
          if (current.restartTimes.length > 8) current.restartTimes.shift()
        }
      },
    })
    const instance: Instance = {
      client,
      tools: new Map(),
      starting: undefined,
      deadUntil: 0,
      restartTimes: previous?.restartTimes ?? [],
      recordedFailure: false,
    }
    const starting = (async () => {
      try {
        const tools = await client.start()
        for (const tool of tools) instance.tools.set(tool.name, tool)
        return instance
      } catch (error) {
        client.kill()
        // The child's exit event may fire before or after this catch; either
        // path may record the failure, but only the first one should count it.
        if (!instance.recordedFailure) {
          instance.recordedFailure = true
          instance.deadUntil = Date.now() + RESPAWN_COOLDOWN_MS
          instance.restartTimes.push(Date.now())
        }
        throw error
      } finally {
        instance.starting = undefined
      }
    })()
    instance.starting = starting
    this.instances.set(sourceRoot, instance)
    return starting
  }
}
