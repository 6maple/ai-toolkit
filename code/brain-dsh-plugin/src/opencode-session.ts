import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { AsyncLocalStorage } from 'node:async_hooks'

type FetchInput = Parameters<typeof fetch>[0]

export interface OpenCodeSessionConfig {
  enabled: boolean
  providers: string[]
  hosts: string[]
}

function requestUrl(input: FetchInput): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export function isOpenCodeUrl(url: string, hosts: readonly string[]): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return hosts.some((entry) => {
    const suffix = entry.trim().toLowerCase().replace(/^\./, '')
    return suffix.length > 0 && !suffix.includes('/') &&
      (hostname === suffix || hostname.endsWith(`.${suffix}`))
  })
}

function scopedIterable(
  sessions: AsyncLocalStorage<string>,
  sessionId: string,
  iterable: AsyncIterable<StreamChunk>,
): AsyncIterableIterator<StreamChunk> {
  const iterator = iterable[Symbol.asyncIterator]()
  const inside = <T>(method: 'next' | 'return' | 'throw', args: unknown[]): Promise<T> | undefined =>
    sessions.run(sessionId, () => {
      const fn = iterator[method]
      return typeof fn === 'function'
        ? Reflect.apply(fn, iterator, args) as Promise<T>
        : undefined
    })
  const done: Promise<IteratorResult<StreamChunk>> = Promise.resolve({
    done: true,
    value: undefined,
  })

  return {
    [Symbol.asyncIterator]() { return this },
    next: () => inside<IteratorResult<StreamChunk>>('next', []) ?? done,
    return: (value?: unknown) => inside<IteratorResult<StreamChunk>>('return', [value]) ?? done,
    throw: (error?: unknown) => inside<IteratorResult<StreamChunk>>('throw', [error]) ?? done,
  }
}

function addSessionHeader(
  input: FetchInput,
  init: RequestInit | undefined,
  sessionId: string,
): [FetchInput, RequestInit | undefined] | undefined {
  const source = init?.headers ?? (input instanceof Request ? input.headers : undefined)
  const headers = new Headers(source)
  if (headers.has('x-opencode-session')) return undefined
  headers.set('x-opencode-session', sessionId)

  if (init !== undefined) return [input, { ...init, headers }]
  if (input instanceof Request) {
    try {
      return [new Request(input, { headers }), undefined]
    } catch {
      return undefined
    }
  }
  return [input, { headers }]
}

/** Add OpenCode Go's required per-conversation header at the HTTP boundary. */
export function setupOpenCodeSessionHeader(
  ctx: Context,
  config: OpenCodeSessionConfig,
): () => void {
  if (!config.enabled) return () => {}

  const sessions = new AsyncLocalStorage<string>()
  const providers = new Set(config.providers)
  const originalFetch = globalThis.fetch

  const disposeStream = ctx.on('llm/stream', (options: GenerateOptions, next) => {
    const sessionId = options.sessionId
    if (!providers.has(options.provider) || sessionId === undefined || String(sessionId).length === 0) {
      return next()
    }
    return scopedIterable(sessions, String(sessionId), next())
  }, { global: true })

  const wrappedFetch: typeof fetch = (input, init) => {
    const sessionId = sessions.getStore()
    if (sessionId === undefined || !isOpenCodeUrl(requestUrl(input), config.hosts)) {
      return originalFetch(input, init)
    }
    const request = addSessionHeader(input, init, sessionId)
    return request === undefined
      ? originalFetch(input, init)
      : originalFetch(request[0], request[1])
  }
  globalThis.fetch = wrappedFetch

  return () => {
    disposeStream()
    sessions.disable()
    if (globalThis.fetch === wrappedFetch) globalThis.fetch = originalFetch
  }
}
