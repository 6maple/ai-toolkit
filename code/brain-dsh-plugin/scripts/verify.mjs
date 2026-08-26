/**
 * brain-dsh-plugin 本地验证（构建后、注入前运行：node scripts/verify.mjs）。
 *
 * Part A — 假 server：验证 InstanceManager 的 spawn / tools/list / call /
 *   timeout / abort / 崩溃重启冷却 / 崩溃风暴熔断。
 * Part B — AutoThink hook：验证单边界、逐字注入、diagnostic 隔离与失败不重试。
 * Part C — 真 server：连接 brain dist，验证 v2 11-tool surface、trusted
 *   session metadata 及 write/glob/grep/feedback 转发。
 *
 * 通过输出 PASS 清单；任一失败 exit 1。
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCallArgs, extractAnchorContext, InstanceManager, PUBLIC_BRAIN_TOOLS, setupAutoThink, visibleToolDefinitions } from '../dist/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = join(HERE, '..')
const results = []
const ok = (name) => results.push(`PASS ${name}`)
const fail = (name, detail) => results.push(`FAIL ${name}: ${detail}`)

const hookVisible = visibleToolDefinitions(true, true)
const manualVisible = visibleToolDefinitions(false, true)
if (hookVisible.length === 10 && !hookVisible.some((tool) => tool.name === 'brain_think')) ok('A0 hook hides think')
else fail('A0 hook hides think', hookVisible.map((tool) => tool.name).join(','))
if (manualVisible.length === 11 && manualVisible.some((tool) => tool.name === 'brain_think')) ok('A0 manual exposes think')
else fail('A0 manual exposes think', manualVisible.map((tool) => tool.name).join(','))
const thinkDefinition = PUBLIC_BRAIN_TOOLS.find((tool) => tool.name === 'brain_think')
if (thinkDefinition?.inputSchema.safeParse({ unknown: true }).success === false) ok('A0 strict host contract source')
else fail('A0 strict host contract source', 'unknown argument accepted')
if (extractAnchorContext([{ type: 'text', text: '<context />' }, { type: 'text', text: 'warning: degraded' }]) === '<context />') ok('A0 anchor diagnostics stay separate')
else fail('A0 anchor diagnostics stay separate', 'warning leaked into context')
if (buildCallArgs({ session_id: 'explicit' }, { id: 'host-session' }, true).session_id === 'explicit') ok('A0 explicit session wins')
else fail('A0 explicit session wins', 'host session overwrote explicit session')
if (buildCallArgs({}, { id: 'host-session' }, true).session_id === 'host-session') ok('A0 trusted session injection')
else fail('A0 trusted session injection', 'host session was not injected')
if (!('session_id' in buildCallArgs({}, undefined, true))) ok('A0 no default session injection')
else fail('A0 no default session injection', 'session_id was invented')

/** Minimal MCP server used to exercise the client/manager without brain. */
function writeFakeServer(target) {
  const source = `import { createInterface } from 'node:readline'
const rl = createInterface({ input: process.stdin })
let id = 0
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
rl.on('line', (line) => {
  if (!line.trim()) return
  const msg = JSON.parse(line)
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake-brain', version: '0.0.1' } } })
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [
      { name: 'brain_think', description: 'fake think', inputSchema: { type: 'object', properties: { session_id: { type: 'string' } } } },
      { name: 'brain_write', description: 'fake write', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'brain_slow', description: 'sleeps', inputSchema: { type: 'object', properties: {} } },
      { name: 'brain_crash', description: 'exits', inputSchema: { type: 'object', properties: {} } },
    ] } })
  } else if (msg.method === 'tools/call') {
    const name = msg.params.name
    if (name === 'brain_crash') { process.exit(1) }
    if (name === 'brain_slow') { setTimeout(() => send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'slow done' }] } }), 5000); return }
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: '(session: fake; source: default) ' + name }] } })
  }
})`
  writeFileSync(target, source, 'utf8')
}

async function main() {
  const VERIFY_DIR = mkdtempSync(join(tmpdir(), 'brain-dsh-plugin-verify-'))
  const fakeServer = join(VERIFY_DIR, 'fake-server.mjs')
  writeFakeServer(fakeServer)
  const fakeRoot = join(VERIFY_DIR, 'fake-root')
  mkdirSync(fakeRoot, { recursive: true })

  // ---- Part A: fake server ----
  const mgr = new InstanceManager({
    command: process.execPath,
    args: [fakeServer],
    timeoutMs: 2000,
    home: join(VERIFY_DIR, 'fake-home'),
  })

  try {
    const tools = await mgr.tools(fakeRoot)
    const names = [...tools.keys()]
    if (names.join(',') === 'brain_think,brain_write,brain_slow,brain_crash') ok('A1 tools/list')
    else fail('A1 tools/list', names.join(','))
  } catch (e) { fail('A1 tools/list', String(e)) }

  try {
    const r = await mgr.call(fakeRoot, 'brain_think', {})
    const text = r.content?.[0]?.text ?? ''
    if (text === '(session: fake; source: default) brain_think') ok('A2 call roundtrip')
    else fail('A2 call roundtrip', text)
  } catch (e) { fail('A2 call roundtrip', String(e)) }

  // timeout: separate manager with a small budget
  const mgrTimeout = new InstanceManager({
    command: process.execPath, args: [fakeServer], timeoutMs: 300,
    home: join(VERIFY_DIR, 'fake-home'),
  })
  try {
    await mgrTimeout.call(fakeRoot, 'brain_slow', {})
    fail('A3 timeout', 'call unexpectedly succeeded')
  } catch (e) {
    if (/timed out/.test(String(e))) ok('A3 timeout')
    else fail('A3 timeout', String(e))
  }

  // abort: pre-aborted signal must reject immediately
  const aborted = new AbortController()
  aborted.abort()
  try {
    await mgr.call(fakeRoot, 'brain_slow', {}, aborted.signal)
    fail('A4 abort', 'call unexpectedly succeeded')
  } catch (e) {
    if (/aborted/.test(String(e))) ok('A4 abort')
    else fail('A4 abort', String(e))
  }

  // crash → cooldown → respawn → crash storm guard
  try {
    await mgr.call(fakeRoot, 'brain_crash', {})
    fail('A5 crash', 'call unexpectedly succeeded')
  } catch (e) {
    if (/exited/.test(String(e))) ok('A5 crash surfaced')
    else fail('A5 crash surfaced', String(e))
  }
  try {
    await mgr.call(fakeRoot, 'brain_crash', {})
    fail('A6 cooldown', 'call unexpectedly succeeded')
  } catch (e) {
    if (/restarted too recently/.test(String(e))) ok('A6 cooldown')
    else fail('A6 cooldown', String(e))
  }
  // respawn after cooldown works, then crash again twice → storm guard refuses
  let stormRefused = false
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 1100))
    try {
      await mgr.call(fakeRoot, 'brain_crash', {})
    } catch (e) {
      if (/refusing to restart/.test(String(e))) { stormRefused = true; break }
    }
  }
  if (stormRefused) ok('A7 crash storm guard')
  else fail('A7 crash storm guard', 'storm guard never refused')
  mgr.dispose()
  mgrTimeout.dispose()

  // ---- Part B: real AutoThink hook behavior ----
  const handlers = new Map()
  const warnings = []
  const agent = {
    id: 'host-session',
    session: {
      header: { cwd: fakeRoot },
      events: [{ type: 'agent/inbox/spliced', seq: 7, data: { inserted: [{ source: { kind: 'user' } }] } }],
    },
  }
  const ctx = {
    agents: { list: () => [], currentInitiator: () => agent },
    logger: { warn: (message) => warnings.push(message), debug: () => {} },
    on: (event, handler) => { handlers.set(event, handler); return () => handlers.delete(event) },
  }
  const calls = []
  const exactContext = '<brain_think_context>\n  exact bytes  \n</brain_think_context>'
  const autoManager = {
    call: async (...args) => {
      calls.push(args)
      return { content: [{ type: 'text', text: exactContext }, { type: 'text', text: 'degraded detail' }] }
    },
  }
  const disposeAuto = setupAutoThink(ctx, autoManager, { enabled: true, timeoutMs: 1000 }, () => fakeRoot)
  const assemble = handlers.get('system-prompt/assemble')
  const preStep = handlers.get('agent/pre-step')
  try {
    await assemble({}, { signal: new AbortController().signal }, async () => ({ contexts: [] }))
    await assemble({}, { signal: new AbortController().signal }, async () => ({ contexts: [] }))
    const decision = await preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))
    const injected = decision.messages?.[0]?.content?.[0]?.text
    if (calls.length === 1) ok('B1 one anchor per user splice')
    else fail('B1 one anchor per user splice', `${calls.length} calls`)
    if (calls[0]?.[2]?.session_id === agent.id && calls[0]?.[4]?.threadId === agent.id) ok('B2 AutoThink trusted session metadata')
    else fail('B2 AutoThink trusted session metadata', JSON.stringify(calls[0]))
    if (injected === exactContext) ok('B3 context injected byte-for-byte')
    else fail('B3 context injected byte-for-byte', JSON.stringify(injected))
    if (!String(injected).includes('degraded detail') && warnings.some((line) => line.includes('degraded detail'))) ok('B4 diagnostics log only')
    else fail('B4 diagnostics log only', JSON.stringify({ injected, warnings }))
  } catch (e) { fail('B AutoThink success hook', String(e)) }
  disposeAuto()

  const failedHandlers = new Map()
  let failedCalls = 0
  const failedCtx = {
    agents: { list: () => [], currentInitiator: () => agent },
    logger: { warn: () => {}, debug: () => {} },
    on: (event, handler) => { failedHandlers.set(event, handler); return () => failedHandlers.delete(event) },
  }
  const failedManager = {
    call: async (_root, _name, _args, signal) => {
      failedCalls++
      await new Promise((_, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('timeout signal was not propagated')), 1000)
        signal.addEventListener('abort', () => {
          clearTimeout(keepAlive)
          reject(new Error('aborted'))
        }, { once: true })
      })
    },
  }
  const disposeFailed = setupAutoThink(failedCtx, failedManager, { enabled: true, timeoutMs: 10 }, () => fakeRoot)
  const failedAssemble = failedHandlers.get('system-prompt/assemble')
  try {
    await failedAssemble({}, { signal: new AbortController().signal }, async () => ({ contexts: [] }))
    await failedAssemble({}, { signal: new AbortController().signal }, async () => ({ contexts: [] }))
    if (failedCalls === 1) ok('B5 failed boundary is not retried')
    else fail('B5 failed boundary is not retried', `${failedCalls} calls`)
  } catch (e) { fail('B5 failed boundary is not retried', String(e)) }
  disposeFailed()

  // ---- Part C: real brain ----
  const dist = createRequire(import.meta.url).resolve('brain')
  if (!existsSync(dist)) {
    fail('B0 brain dist', `missing: ${dist}`)
  } else {
    const realRoot = join(VERIFY_DIR, 'real-root')
    mkdirSync(realRoot, { recursive: true })
    const mgrReal = new InstanceManager({
      command: process.execPath, args: [dist], timeoutMs: 15_000,
      home: join(VERIFY_DIR, 'real-home'),
    })
    try {
      const tools = await mgrReal.tools(realRoot)
      const liveNames = [...tools.keys()].sort()
      const publicNames = PUBLIC_BRAIN_TOOLS.map((t) => t.name).sort()
      if (JSON.stringify(liveNames) === JSON.stringify(publicNames) && liveNames.length === 11) ok('C1 v2 public tool names')
      else fail('C1 v2 public tool names', `live=${liveNames.join(',')} public=${publicNames.join(',')}`)
      const liveThink = tools.get('brain_think')?.inputSchema ?? {}
      const props = Object.keys(liveThink.properties ?? {})
      if (props.length === 1 && props.includes('session_id') && liveThink.additionalProperties === false) ok('C2 brain_think v2 schema')
      else fail('C2 brain_think schema', JSON.stringify(liveThink))
      const r = await mgrReal.call(realRoot, 'brain_think', {}, undefined, { threadId: 'dsh-verify-session' })
      const text = r.content?.map((b) => b.text ?? '').join('\n') ?? ''
      if (!r.isError && text.includes('<brain_think_context') && text.includes('@session/dsh-verify-session')) ok('C3 brain_think metadata session anchor')
      else fail('C3 brain_think metadata session anchor', text.slice(0, 300))
      const absolute = await mgrReal.call(realRoot, 'brain_absolute_path', { path: '@project' })
      if (!absolute.isError && absolute.content?.[0]?.text) ok('C4 brain_absolute_path forwarding')
      else fail('C4 brain_absolute_path forwarding', JSON.stringify(absolute))
      const sessionPath = '@session/dsh-verify-session/memories/knowledge/plugin-session.md'
      const token = 'plugin-session-fact-826'
      const write = await mgrReal.call(realRoot, 'brain_write', {
        path: sessionPath,
        content: `---\nsummary: plugin session verification\nimportance: high\n---\n${token}\n`,
      }, undefined, { threadId: 'dsh-verify-session' })
      if (!write.isError) ok('C5 brain_write session forwarding')
      else fail('C5 brain_write session forwarding', JSON.stringify(write))
      const glob = await mgrReal.call(realRoot, 'brain_glob', { pattern: '**/plugin-session.md' }, undefined, { threadId: 'dsh-verify-session' })
      const globText = glob.content?.map((b) => b.text ?? '').join('\n') ?? ''
      if (!glob.isError && globText.includes(sessionPath)) ok('C6 omitted-path glob uses host session')
      else fail('C6 omitted-path glob uses host session', globText)
      const grep = await mgrReal.call(realRoot, 'brain_grep', { pattern: token, literal: true }, undefined, { threadId: 'dsh-verify-session' })
      const grepText = grep.content?.map((b) => b.text ?? '').join('\n') ?? ''
      if (!grep.isError && grepText.includes(sessionPath) && grepText.includes(token)) ok('C7 omitted-path grep uses host session')
      else fail('C7 omitted-path grep uses host session', grepText)
      const feedback = await mgrReal.call(realRoot, 'brain_feedback', { path: sessionPath, feedback: 'adopt' }, undefined, { threadId: 'dsh-verify-session' })
      if (!feedback.isError) ok('C8 brain_feedback success forwarding')
      else fail('C8 brain_feedback success forwarding', JSON.stringify(feedback))
    } catch (e) {
      fail('B real server', String(e))
    }
    mgrReal.dispose()
  }

  try {
    rmSync(VERIFY_DIR, { recursive: true, force: true })
  } catch (error) {
    console.warn(`verify: retained temporary directory ${VERIFY_DIR}: ${String(error)}`)
  }
  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL'))
  console.log(failed.length === 0 ? '\nALL PASS' : `\n${failed.length} FAILED`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
