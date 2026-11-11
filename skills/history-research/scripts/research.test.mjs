import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { inventory, readPage, readReference, findText, beginning, messages } from './reader.mjs';
import { init, next, read, find, submit, status, load } from './research.mjs';

async function fixture(t, content, provider = 'codex', suffix = '.jsonl') {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'history-greenfield-'));
  t.after(async () => {
    const resolved = path.resolve(base);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('history-greenfield-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const source = path.join(base, 'source' + suffix), root = path.join(base, 'run');
  const raw = typeof content === 'string' ? content : content.map(v => JSON.stringify(v)).join('\n') + '\n';
  await fs.writeFile(source, suffix.endsWith('.zst') ? zlib.zstdCompressSync(Buffer.from(raw)) : suffix.endsWith('.gz') ? zlib.gzipSync(raw) : raw);
  const specs = [{ path: source, provider }];
  const { sources } = await inventory(specs);
  return { base, source, root, raw, specs, sources };
}
const user = (text, id) => ({ type: 'response_item', timestamp: '2026-01-01', payload: { type: 'message', role: 'user', id, content: [{ type: 'input_text', text }] } });
const assistant = (text, id) => ({ type: 'response_item', payload: { type: 'message', role: 'assistant', id, content: [{ type: 'output_text', text }] } });
async function all(sources, options = {}) {
  const output = []; let cursor = beginning(), pages = 0;
  do { const page = await readPage(sources, { ...options, cursor }); output.push(...page.items); assert.equal(page.gaps.length, 0); cursor = page.next; assert.ok(++pages < 1000); } while (cursor);
  return output;
}

test('ordinary/zstd/gzip preserve all pre/post-compaction and retained user text', async t => {
  const records = [user('压缩前：逐字保留\n第二行'), assistant('建议'),
    { type: 'compacted', payload: { message: 'AI summary', replacement_history: [user('保留窗口用户原文').payload] } },
    user('压缩后'), { type: 'retained_context', payload: { type: 'verified_answer', questions: [{ question: 'Q', answer: 'not-attributed-to-human' }] } }];
  for (const ext of ['.jsonl', '.jsonl.zst', '.jsonl.gz']) {
    const f = await fixture(t, records, 'codex', ext);
    const output = await all(f.sources, { limit: 1024 });
    assert.deepEqual(output.map(m => m.text), ['压缩前：逐字保留\n第二行', '保留窗口用户原文', '压缩后']);
    const dialogue = await all(f.sources, { view: 'dialogue', limit: 2048 });
    assert.ok(dialogue.some(m => m.text === 'not-attributed-to-human' && m.role === 'context'));
    assert.ok(!output.some(m => m.text === 'AI summary'));
  }
});

test('Claude user containers distinguish text, tools, meta and explicit compaction summaries', async t => {
  const f = await fixture(t, [
    { type: 'user', uuid: 'u1', parentUuid: 'p', message: { role: 'user', content: [{ type: 'text', text: '真实用户链' }, { type: 'tool_result', content: 'tool-only-text' }] } },
    { type: 'user', isCompactSummary: true, message: { role: 'user', content: 'summary-only' } },
    { type: 'user', isMeta: true, message: { role: 'user', content: 'meta-text' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'assistant-text' }] } }
  ], 'claude');
  const values = await all(f.sources);
  assert.deepEqual(values.map(m => m.text), ['真实用户链', 'meta-text']);
  assert.equal(values[0].parent, 'p'); assert.equal(values[1].origin, 'meta-container');
  const tool = await findText(f.sources, 'tool-only-text');
  assert.equal(tool.matches.length, 1);
  const raw = await readReference(f.sources, tool.matches[0].ref);
  assert.equal(raw.items[0].text, 'tool-only-text');
});

test('long messages above one million characters page exactly without splitting emoji', async t => {
  const text = '原话🙂'.repeat(240000) + '\nEND';
  const f = await fixture(t, [user(text)]);
  const parts = await all(f.sources, { limit: 65536 });
  assert.ok(parts.length > 10); assert.equal(parts.map(p => p.text).join(''), text);
  assert.ok(parts.every(p => !/[\uD800-\uDBFF]$/.test(p.text)));
});

test('explicit line references and physical context use actual lines, not relabelled first record', async t => {
  const f = await fixture(t, [user('first'), user('second'), user('third')]);
  const r = await readReference(f.sources, `${f.sources[0].id}:2`);
  assert.deepEqual(r.items.map(m => m.text), ['second']);
  const context = await readReference(f.sources, `${f.sources[0].id}:2`, { before: 1, after: 1 });
  assert.deepEqual(context.items.map(m => m.text), ['first', 'second', 'third']);
  const missing = await readReference(f.sources, `${f.sources[0].id}:999`);
  assert.equal(missing.gaps[0].kind, 'missing-line');
});

test('all decoded fields are searchable and find continuation neither loses nor repeats fields', async t => {
  const f = await fixture(t, [user('visible'), { type: 'custom', note: 'unique-extra-field' },
    { type: 'custom', a: '命中一', b: { x: '命中二' } }, { type: 'custom', c: '命中三' }]);
  assert.equal((await findText(f.sources, 'unique-extra-field')).matches.length, 1);
  const seen = []; let cursor;
  do { const page = await findText(f.sources, '命中', { limit: 1, cursor }); seen.push(...page.matches.map(m => m.ref)); cursor = page.next; } while (cursor);
  assert.equal(seen.length, 3); assert.equal(new Set(seen).size, 3);
});

test('only complete identical physical replay collapses; equal text in distinct representations stays', async t => {
  const replay = assistant('identical-record', 'replay-id');
  const f = await fixture(t, [user('相同原话', 'a'), user('相同原话', 'b'), replay, replay, assistant('same-event', 'm'),
    { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'AgentMessage', id: 'm', content: [{ type: 'Text', text: 'same-event' }] } } }]);
  const p = await readPage(f.sources, { view: 'dialogue' });
  assert.deepEqual(p.items.map(m => m.text), ['相同原话', '相同原话', 'identical-record', 'same-event', 'same-event']);
  assert.equal(p.notices['identical-record-presentation'].count, 1);
});

test('distinct identical content blocks inside one Claude message are never dropped', async t => {
  const f = await fixture(t, [{ type: 'user', uuid: 'u1', message: { role: 'user', content: [
    { type: 'text', text: '重复' }, { type: 'text', text: '重复' }
  ] } }], 'claude');
  for (const view of ['users', 'dialogue']) assert.deepEqual((await all(f.sources, { view })).map(m => m.text), ['重复', '重复']);
});

test('malformed/unknown/encrypted records remain explicit gaps or raw-accessible notices', async t => {
  const raw = JSON.stringify(user('before')) + '\n{broken\n' + JSON.stringify({ type: 'response_item', payload: { type: 'compaction', encrypted_content: 'cipher' } }) + '\n' + JSON.stringify(user('after'));
  const f = await fixture(t, raw);
  const page = await readPage(f.sources);
  assert.deepEqual(page.items.map(m => m.text), ['before', 'after']);
  assert.equal(page.gaps[0].kind, 'invalid-json');
  assert.ok(Object.keys(page.notices).some(k => k.startsWith('encrypted-context')));
});

test('init only stores metadata; next does not materialize raw bodies or page files', async t => {
  const f = await fixture(t, [user('raw-secret-not-to-store'), assistant('large-unneeded-answer'.repeat(10000))]);
  await init(f.root, f.specs); await next(f.root);
  const files = await fs.readdir(path.join(f.root, 'run'));
  assert.deepEqual(files.sort(), ['progress.json', 'sources.jsonl']);
  for (const file of files) assert.ok(!(await fs.readFile(path.join(f.root, 'run', file), 'utf8')).includes('raw-secret-not-to-store'));
});

test('source/body size does not force whole-file reading before first output', async t => {
  const f = await fixture(t, [user('first'.repeat(2000))]);
  const h = await fs.open(f.source, 'a');
  const chunk = JSON.stringify(assistant('tool-like-reply'.repeat(200))) + '\n';
  for (let i = 0; i < 2000; i++) await h.write(chunk);
  await h.close();
  const { sources } = await inventory(f.specs);
  const page = await readPage(sources, { limit: 1024 });
  assert.ok(page.metrics.sourceBytes < sources[0].bytes / 10);
  assert.ok(page.next); assert.equal(page.items[0].continued, true);
});

test('task recovery, local/review gate, idempotency and non-screen source reuse', async t => {
  const f = await fixture(t, [user('一'.repeat(2000)), user('二')]);
  await init(f.root, f.specs);
  const first = await next(f.root, { limit: 512 });
  assert.equal(first.task, 't1');
  assert.deepEqual((await next(f.root)).page.items, first.page.items);
  const continued = await next(f.root, { more: true });
  assert.ok(continued.page.items[0].offset > 0);
  await fs.writeFile(path.join(f.root, 'state', 'work.md'), '# Local\n实际处理本次范围，尚有待查。\n# Review\n已对照整体问题，下一步继续粗筛。\n');
  const before = (await load(f.root)).p;
  await submit(f.root, { task: 't1', kind: 'local', result: 'state/work.md#Local' });
  assert.equal((await next(f.root)).phase, 'review');
  await assert.rejects(next(f.root, { stage: 'study' }), /review is pending/);
  // A real interruption can leave the append-only accepted event ahead of the cache.
  await fs.writeFile(path.join(f.root, 'run', 'progress.json'), JSON.stringify(before));
  assert.equal((await status(f.root)).recoveryPending, true);
  assert.equal((await next(f.root)).phase, 'review');
  assert.equal((await submit(f.root, { task: 't1', kind: 'local', result: 'state/work.md#Local' })).duplicate, true);
  await submit(f.root, { task: 't1', kind: 'review', result: 'state/work.md#Review' });
  const s = await status(f.root); assert.equal(s.completedTasks, 1);
  const cursor = s.screenCursor;
  await fs.rename(f.source, f.source + '.offline');
  const grouped = await next(f.root, { stage: 'group', label: '只归并现有研究结果' });
  assert.equal(grouped.stage, 'group'); assert.ok(!grouped.page); // must not open missing history
  assert.deepEqual((await status(f.root)).screenCursor, cursor);
});

test('read/find do not advance coarse coverage and cursors are bound to request', async t => {
  const f = await fixture(t, [user('x'.repeat(3000)), { type: 'other', a: 'needle' }]);
  await init(f.root, f.specs);
  const before = (await status(f.root)).screenCursor;
  const first = await read(f.root, { view: 'users', limit: 512 });
  assert.ok(first.continuation);
  await assert.rejects(read(f.root, { view: 'dialogue', cursor: first.continuation }), /different read request/);
  const otherRoot = path.join(f.base, 'other-run');
  await init(otherRoot, f.specs);
  await assert.rejects(read(otherRoot, { view: 'users', cursor: first.continuation }), /different read request/);
  assert.ok((await find(f.root, { text: 'needle' })).matches.length);
  assert.deepEqual((await status(f.root)).screenCursor, before);
});

test('status stays compact instead of returning all bound source identities', async t => {
  const f = await fixture(t, [user('one')]);
  await init(f.root, f.specs); await next(f.root);
  const s = await status(f.root);
  assert.equal(s.pending.sourceCount, 1);
  assert.ok(!Object.hasOwn(s.pending, 'sourceIds'));
});
