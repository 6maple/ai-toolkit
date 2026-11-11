import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

export const READER_VERSION = '1';
export const FORMAT = 'history-research-on-demand-v1';
export const integer = (v, fallback, min = 0) => {
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`Expected safe integer >= ${min}: ${v}`);
  return n;
};
const escapePointer = s => String(s).replaceAll('~', '~0').replaceAll('/', '~1');
export const refFor = (source, line, pointer = '') => `${source.id}:${line}${pointer ? '#' + pointer : ''}`;
export function parseRef(ref) {
  const m = /^(s\d+):(\d+)(?:#(\/.*))?$/.exec(ref ?? '');
  if (!m) throw new Error('Reference must be s000001:LINE[#/json/pointer]');
  return { source: m[1], line: integer(m[2], 1, 1), pointer: m[3] ?? '' };
}
export function atPointer(value, pointer) {
  if (!pointer) return value;
  for (const key of pointer.slice(1).split('/').map(s => s.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!value || !Object.hasOwn(value, key)) throw new Error(`Missing JSON pointer: ${pointer}`);
    value = value[key];
  }
  return value;
}
export const digest = value => createHash('sha256').update(value).digest('hex');

export async function inventory(specs) {
  const sources = [], issues = [], seen = new Set();
  async function walk(file, provider) {
    const absolute = path.resolve(file);
    let st;
    try { st = await fsp.lstat(absolute); }
    catch (e) { issues.push({ path: absolute, error: e.code }); return; }
    if (st.isSymbolicLink()) { issues.push({ path: absolute, error: 'link-not-followed; add resolved source explicitly' }); return; }
    if (st.isDirectory()) {
      let entries;
      try { entries = await fsp.readdir(absolute); }
      catch (e) { issues.push({ path: absolute, error: e.code }); return; }
      for (const name of entries.sort()) await walk(path.join(absolute, name), provider);
      return;
    }
    if (!st.isFile() || seen.has(absolute)) return;
    seen.add(absolute);
    const supported = /\.jsonl(?:\.zst|\.gz)?$/i.test(absolute);
    sources.push({ id: '', path: absolute, provider, bytes: st.size, mtimeMs: st.mtimeMs,
      encoding: absolute.endsWith('.zst') ? 'zstd' : absolute.endsWith('.gz') ? 'gzip' : 'plain', supported });
  }
  for (const spec of specs) await walk(spec.path, spec.provider);
  sources.sort((a, b) => a.path.localeCompare(b.path));
  sources.forEach((s, i) => { s.id = `s${String(i + 1).padStart(6, '0')}`; });
  return { sources, issues };
}

// Holds at most the current JSONL record and stream buffers, never a source body.
export async function* lines(source, { line = 1, byte = 0 } = {}, metrics = {}) {
  if (!source.supported) throw new Error(`Unsupported source; no content discarded: ${source.path}`);
  const st = await fsp.stat(source.path);
  if (st.size < source.bytes || (st.size === source.bytes && st.mtimeMs !== source.mtimeMs)) {
    throw new Error(`Source changed since inventory; references need rechecking: ${source.id}`);
  }
  if (st.size > source.bytes) metrics.appendedBeyondBoundary = true;
  const start = source.encoding === 'plain' ? byte : 0;
  let number = source.encoding === 'plain' && start > 0 ? line : 1, base = start;
  if (source.bytes === 0 || start >= source.bytes) return;
  const raw = fs.createReadStream(source.path, { start, end: source.bytes - 1 });
  raw.on('data', chunk => { metrics.sourceBytes = (metrics.sourceBytes ?? 0) + chunk.length; });
  let decoder;
  if (source.encoding === 'zstd') {
    if (!zlib.createZstdDecompress) throw new Error('Reading .zst needs Node with native createZstdDecompress (>=22.15)');
    decoder = zlib.createZstdDecompress();
  } else if (source.encoding === 'gzip') decoder = zlib.createGunzip();
  if (decoder) raw.on('error', e => decoder.destroy(e));
  const stream = decoder ? raw.pipe(decoder) : raw;
  let buffer = Buffer.alloc(0);
  try {
    for await (const chunk of stream) {
      metrics.decodedBytes = (metrics.decodedBytes ?? 0) + chunk.length;
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      let pos;
      while ((pos = buffer.indexOf(10)) !== -1) {
        const end = base + pos + 1;
        const row = { line: number++, byte: base, nextByte: end, raw: buffer.subarray(0, pos).toString('utf8').replace(/\r$/, '') };
        buffer = buffer.subarray(pos + 1); base = end;
        if (row.line >= line) yield row;
      }
    }
    if (buffer.length && number >= line) yield { line: number, byte: base, nextByte: base + buffer.length, raw: buffer.toString('utf8').replace(/\r$/, '') };
  } finally { stream.destroy(); raw.destroy(); }
}

function textBlocks(content, pointer, emit, meta) {
  if (typeof content === 'string') emit(content, pointer, meta);
  else if (Array.isArray(content)) content.forEach((block, i) => {
    const p = `${pointer}/${i}`;
    if (typeof block === 'string') emit(block, p, meta);
    else if (block && typeof block.text === 'string') emit(block.text, `${p}/text`, { ...meta, block: block.type });
    // Other content blocks stay reachable by their raw JSON pointer.
  });
}

export function messages(record, provider) {
  const items = [], notices = [];
  const rootMeta = { time: record.timestamp, id: record.uuid, parent: record.parentUuid,
    turn: record.turn_id ?? record.payload?.turn_id,
    branch: record.isSidechain ? 'sidechain' : undefined };
  const emit = (text, pointer, meta) => items.push({ ...rootMeta, ...meta, pointer, text });
  function message(value, pointer, origin) {
    if (!value || typeof value !== 'object') return false;
    const role = value.role ?? ({ user_message: 'user', usermessage: 'user', agent_message: 'assistant', agentmessage: 'assistant', assistant_message: 'assistant' })[String(value.type).toLowerCase()];
    if (!role) return false;
    const retainedId = value.metadata?.retained_source?.id;
    const meta = { role, origin: retainedId ? 'retained-message' : origin, id: value.id ?? value.uuid ?? rootMeta.id,
      parent: value.parentUuid ?? rootMeta.parent, turn: retainedId?.turn_id ?? rootMeta.turn, phase: value.phase };
    if (Object.hasOwn(value, 'content')) textBlocks(value.content, `${pointer}/content`, emit, meta);
    else if (typeof value.message === 'string') emit(value.message, `${pointer}/message`, meta);
    else if (typeof value.text === 'string') emit(value.text, `${pointer}/text`, meta);
    else return false;
    return true;
  }
  function retained(value, pointer) {
    if (!value || typeof value !== 'object') return;
    if (message(value, pointer, 'retained-container')) return;
    for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') retained(child, `${pointer}/${escapePointer(key)}`);
  }
  if (provider === 'claude') {
    if (record.message && typeof record.message === 'object') {
      const origin = record.isCompactSummary ? 'compaction-summary' : record.isMeta ? 'meta-container' : 'message';
      message(record.message, '/message', origin);
    }
    if (record.type === 'system' && /compact/i.test(record.subtype ?? '')) notices.push('compaction-boundary');
    for (const key of ['preservedMessages', 'preserved_messages']) if (record[key]) retained(record[key], `/${key}`);
  } else {
    const p = record.payload ?? record;
    if (record.type === 'response_item') message(p.item ?? p, p.item ? '/payload/item' : '/payload', 'message');
    else if (record.type === 'event_msg') {
      if (!message(p, '/payload', 'event')) message(p.item, '/payload/item', 'event');
    }
    if ((p.item ?? p).encrypted_content) notices.push('encrypted-context; no plaintext recovery promised');
    if (record.type === 'retained_context') {
      notices.push('retained-context; authorship follows fields, not inferred');
      for (const value of strings(p, '/payload')) if (/\/(question|answer)$/.test(value.pointer)) {
        emit(value.text, value.pointer, { role: 'context', origin: 'retained-context-unattributed' });
      }
      retained(p, '/payload');
    }
    if (record.type === 'compacted' || p.type === 'context_compacted') {
      notices.push('compaction-boundary');
      if (typeof p.message === 'string') emit(p.message, '/payload/message', { role: 'context', origin: 'compaction-summary' });
      for (const key of ['replacement_history', 'retained_context', 'history', 'messages', 'original_items']) {
        if (p[key]) retained(p[key], `/payload/${key}`);
      }
    }
  }
  if (!items.length) notices.push(`unexpanded:${record.type ?? 'unknown'}`);
  return { items, notices };
}

export function* strings(value, pointer = '') {
  if (typeof value === 'string') yield { pointer, text: value };
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) yield* strings(child, `${pointer}/${escapePointer(key)}`);
}
export function encodeCursor(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
export function decodeCursor(value) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new Error('Invalid continuation cursor'); }
}
const cut = (text, start, length) => {
  let end = Math.min(text.length, start + length);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return end;
};
export const beginning = () => ({ source: 0, line: 1, byte: 0, part: 0, offset: 0 });

export async function readPage(sources, options = {}) {
  const view = options.view ?? 'users', limit = integer(options.limit, 16000, 512);
  if (!['users', 'dialogue', 'raw'].includes(view)) throw new Error('view must be users, dialogue or raw');
  const from = options.cursor ?? beginning();
  const items = [], gaps = [], notices = {}, ranges = [], metrics = { sourceBytes: 0, decodedBytes: 0, records: 0 };
  let used = 0, lastRecordKey;
  const note = (name, ref) => {
    const n = notices[name] ??= { count: 0, examples: [] }; n.count++;
    if (n.examples.length < 3) n.examples.push(ref);
  };
  for (let i = from.source; i < sources.length; i++) {
    const source = sources[i];
    const start = i === from.source ? from : beginning();
    const range = { source: source.id, view, from: start.line, to: start.line - 1,
      start: { line: start.line, part: start.part, offset: start.offset }, end: null };
    ranges.push(range);
    if (!source.supported) { gaps.push({ source: source.id, kind: 'unsupported-file', path: source.path }); continue; }
    try {
      for await (const row of lines(source, start, metrics)) {
        if (options.endLine && row.line > options.endLine) return finish(null);
        metrics.records++;
        if (!row.raw.trim()) { range.to = row.line; continue; }
        let record;
        try { record = JSON.parse(row.raw.replace(/^\uFEFF/, '')); }
        catch { gaps.push({ ref: refFor(source, row.line), kind: 'invalid-json', bytes: Buffer.byteLength(row.raw) }); range.to = row.line; continue; }
        const parsed = view === 'raw'
          ? { items: [{ role: 'raw', origin: 'physical-record', pointer: options.pointer ?? '', text: options.pointer ? (() => { const x = atPointer(record, options.pointer); return typeof x === 'string' ? x : JSON.stringify(x); })() : row.raw }], notices: [] }
          : messages(record, source.provider);
        for (const n of parsed.notices) note(n, refFor(source, row.line));
        const eligible = parsed.items.filter(m => view !== 'users' || (m.role === 'user' && m.origin !== 'compaction-summary'));
        // Only a whole identical physical record with recorded message identity is
        // a proven replay here. Equal text blocks inside one message are real data.
        const recordKey = eligible.some(m => m.id) ? `${source.id}:${digest(row.raw)}` : undefined;
        if (recordKey && recordKey === lastRecordKey && !(row.line === start.line && (start.part || start.offset))) {
          note('identical-record-presentation', refFor(source, row.line)); range.to = row.line; continue;
        }
        for (let j = row.line === start.line ? start.part : 0; j < eligible.length; j++) {
          const m = eligible[j], offset = row.line === start.line && j === start.part ? start.offset : 0;
          const ref = refFor(source, row.line, m.pointer);
          const header = { ref, role: m.role, origin: m.origin, time: m.time, id: m.id, parent: m.parent, turn: m.turn, phase: m.phase, branch: m.branch };
          const overhead = JSON.stringify(header).length + 70;
          if (used + overhead >= limit && items.length) return finish({ source: i, line: row.line, byte: row.byte, part: j, offset });
          const end = cut(m.text, offset, Math.max(2, limit - used - overhead));
          items.push({ ...header, offset, text: m.text.slice(offset, end), continued: end < m.text.length });
          used += overhead + end - offset;
          if (end < m.text.length) return finish({ source: i, line: row.line, byte: row.byte, part: j, offset: end });
        }
        lastRecordKey = recordKey;
        range.to = row.line;
      }
    } catch (e) { gaps.push({ source: source.id, kind: 'read-error', message: e.message }); }
    if (used >= limit) return finish(i + 1 < sources.length ? { ...beginning(), source: i + 1 } : null);
  }
  return finish(null);
  function finish(next) {
    if (next && ranges.at(-1)?.source === sources[next.source]?.id) {
      ranges.at(-1).end = { line: next.line, part: next.part, offset: next.offset };
    }
    return { view, from, next, items, ranges, notices, gaps, metrics,
      boundary: 'Only this view/range was supplied; tool/attachment/unknown fields remain available via raw references. Supplied is not analyzed.' };
  }
}

export async function readReference(sources, ref, options = {}) {
  const target = parseRef(ref), source = sources.find(s => s.id === target.source);
  if (!source) throw new Error(`Unknown source ${target.source}`);
  const before = integer(options.before, 0), after = integer(options.after, 0);
  const start = Math.max(1, target.line - before), endLine = target.line + after;
  const view = options.view ?? (target.pointer ? 'raw' : 'dialogue');
  const page = await readPage([source], { ...options, view, endLine, pointer: before || after ? undefined : target.pointer,
    cursor: options.cursor ?? { ...beginning(), line: start } });
  if (page.metrics.records === 0 && !page.gaps.length) page.gaps.push({ ref, kind: 'missing-line', message: 'Reference is outside the recorded source boundary.' });
  return page;
}

export async function findText(sources, text, { limit = 20, cursor } = {}) {
  if (!text) throw new Error('find needs a nonempty literal text');
  limit = integer(limit, 20, 1);
  const start = cursor ?? { source: 0, line: 1, field: 0 };
  const matches = [], gaps = [], metrics = {};
  for (let i = start.source; i < sources.length; i++) {
    const source = sources[i];
    if (!source.supported) { gaps.push({ source: source.id, kind: 'unsupported-file' }); continue; }
    try {
      for await (const row of lines(source, { line: i === start.source ? start.line : 1 }, metrics)) {
        let record;
        try { record = JSON.parse(row.raw.replace(/^\uFEFF/, '')); }
        catch { gaps.push({ ref: refFor(source, row.line), kind: 'invalid-json' }); continue; }
        let field = -1;
        for (const value of strings(record)) {
          field++;
          if (i === start.source && row.line === start.line && field < start.field) continue;
          const pos = value.text.indexOf(text);
          if (pos === -1) continue;
          if (matches.length === limit) return { matches, gaps, metrics, next: { source: i, line: row.line, field } };
          matches.push({ ref: refFor(source, row.line, value.pointer), length: value.text.length,
            excerpt: value.text.slice(Math.max(0, pos - 80), pos + text.length + 160) });
        }
      }
    } catch (e) { gaps.push({ source: source.id, kind: 'read-error', message: e.message }); }
  }
  return { matches, gaps, metrics, next: null };
}
