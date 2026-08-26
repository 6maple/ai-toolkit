/**
 * Minimal MCP (JSON-RPC 2.0 over stdio) client for brain.
 *
 * Why not the @modelcontextprotocol/sdk: the plugin speaks to exactly one
 * server it owns, over a tiny protocol surface (initialize / tools-list /
 * tools-call + one notification), and a dependency-free client avoids linking
 * another package and SDK-version coupling. The wire format was verified
 * directly against brain before this plugin existed.
 *
 * Semantics follow dsh-mcp-client's bridge: `tools/call` carries the caller
 * abort signal and a per-call timeout; `isError` surfaces as a thrown error;
 * stderr is tail-captured for diagnostics.
 */
import { spawn, type ChildProcess } from 'node:child_process'

export interface McpSpawnOptions {
  command: string
  args: readonly string[]
  cwd: string
  env: NodeJS.ProcessEnv
  /** Per-request timeout for initialize / tools/list / tools/call. */
  timeoutMs: number
  /** Raw stderr chunks (tail capture happens internally as well). */
  onStderr?: (chunk: string) => void
  /** Invoked when the child exits (including spawn failure). */
  onExit?: (info: { code: number | null; signal: string | null; error?: Error }) => void
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>
  isError?: boolean
}

/** Trusted host invocation facts forwarded in the MCP request envelope. */
export interface McpInvocationMeta {
  threadId?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

export class McpClient {
  private readonly opts: McpSpawnOptions
  private child: ChildProcess | undefined
  private buffer = ''
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 1
  private closed = false
  private stderrTail = ''

  constructor(opts: McpSpawnOptions) {
    this.opts = opts
  }

  get running(): boolean {
    return this.child !== undefined && !this.closed
  }

  /** Spawn the server, run initialize, send initialized, fetch tools/list. */
  async start(): Promise<McpToolInfo[]> {
    if (this.running) throw new Error('brain mcp: already started')
    this.closed = false
    const child = spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      env: this.opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      this.stderrTail = (this.stderrTail + text).slice(-4096)
      this.opts.onStderr?.(text)
    })
    child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')))
    child.on('exit', (code, signal) => this.onExit({ code, signal }))
    child.on('error', (error) => this.onExit({ code: null, signal: null, error }))

    try {
      await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'brain-dsh-plugin', version: '0.0.1' },
      })
      this.notify('notifications/initialized')
      const list = (await this.request('tools/list', {})) as { tools?: McpToolInfo[] }
      return list.tools ?? []
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `brain mcp: server failed to start: ${message}${this.stderrTail ? `\nstderr:\n${this.stderrTail}` : ''}`,
      )
    }
  }

  /** Invoke one server tool. Rejects on timeout, caller abort, or server error. */
  async call(
    name: string,
    args: unknown,
    signal?: AbortSignal,
    meta?: McpInvocationMeta,
  ): Promise<McpCallResult> {
    const result = (await this.request(
      'tools/call',
      {
        name,
        arguments: args,
        ...(meta?.threadId === undefined ? {} : { _meta: { threadId: meta.threadId } }),
      },
      signal,
    )) as McpCallResult
    return result
  }

  /** Terminate the child and reject everything in flight. Idempotent. */
  kill(): void {
    if (!this.child) return
    this.closed = true
    const child = this.child
    this.child = undefined
    try {
      child.kill()
    } catch {
      // already dead
    }
    this.rejectAll(new Error('brain mcp: client disposed'))
  }

  private request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!this.running || !this.child) return Promise.reject(new Error('brain mcp: server not running'))
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`brain mcp: ${method} timed out after ${this.opts.timeoutMs}ms`))
      }, this.opts.timeoutMs)
      const onAbort = () => {
        this.pending.delete(id)
        clearTimeout(timer)
        this.notify('notifications/cancelled', { requestId: id, reason: 'caller aborted' })
        reject(new Error('brain mcp: tool call aborted'))
      }
      if (signal?.aborted) {
        clearTimeout(timer)
        reject(new Error('brain mcp: tool call aborted'))
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener('abort', onAbort)
          clearTimeout(timer)
          resolve(value)
        },
        reject: (reason) => {
          signal?.removeEventListener('abort', onAbort)
          clearTimeout(timer)
          reject(reason)
        },
        timer,
      })
      this.child?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  private notify(method: string, params: unknown = {}): void {
    this.child?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (!line) continue
      let message: unknown
      try {
        message = JSON.parse(line)
      } catch {
        continue // non-JSON server chatter — ignore
      }
      this.onMessage(message)
    }
  }

  private onMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) return
    const record = message as Record<string, unknown>
    if (typeof record.id !== 'number') return // notification / server request — ignore
    const pending = this.pending.get(record.id)
    if (!pending) return
    this.pending.delete(record.id)
    if (record.error !== undefined && record.error !== null) {
      const error = record.error as Record<string, unknown>
      pending.reject(new Error(`brain mcp: server error: ${String(error.message ?? JSON.stringify(error))}`))
      return
    }
    pending.resolve(record.result)
  }

  private onExit(info: { code: number | null; signal: string | null; error?: Error }): void {
    const wasRunning = this.running
    this.child = undefined
    this.closed = true
    if (this.opts.onExit) {
      try {
        this.opts.onExit(info)
      } catch {
        // observer failures must not break teardown
      }
    }
    if (wasRunning) {
      const detail = info.error ? String(info.error) : `exit code ${info.code ?? 'null'}, signal ${info.signal ?? 'null'}`
      this.rejectAll(
        new Error(
          `brain mcp: server exited (${detail})${this.stderrTail ? `\nstderr:\n${this.stderrTail}` : ''}`,
        ),
      )
    }
  }

  private rejectAll(reason: Error): void {
    for (const pending of this.pending.values()) pending.reject(reason)
    this.pending.clear()
  }
}

/** Join MCP text content blocks into one string; non-text blocks get placeholders. */
export function extractText(content: Array<{ type: string; text?: string }> | undefined, toolName: string): string {
  if (!Array.isArray(content)) return '(no output)'
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      parts.push('[unsupported content type]')
      continue
    }
    switch (block.type) {
      case 'text':
        parts.push(block.text ?? '')
        break
      case 'image':
        parts.push(`[image: ${'mimeType' in block ? String(block.mimeType) : 'unknown'}, content discarded]`)
        break
      case 'audio':
        parts.push('[audio: content discarded]')
        break
      case 'resource':
      case 'resource_link':
        parts.push('[resource: content discarded]')
        break
      default:
        parts.push(`[unsupported content type: ${block.type}]`)
    }
  }
  return parts.join('\n')
}

/** The anchor context is always the first text block; later blocks are warnings. */
export function extractAnchorContext(content: Array<{ type: string; text?: string }> | undefined): string {
  if (!Array.isArray(content)) return ''
  const first = content.find((block) => block?.type === 'text')
  return first?.text ?? ''
}
