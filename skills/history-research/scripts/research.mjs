#!/usr/bin/env node
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT, READER_VERSION, integer, inventory, beginning, readPage, readReference, findText,
  encodeCursor, decodeCursor, digest, parseRef } from './reader.mjs';

export const VERSION = '3.0.0';
const stages = new Set(['screen', 'group', 'study', 'audit', 'synthesis']);
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const method = stage => path.join(skillRoot, 'references', 'method.md') + '#' + stage;
function methodText(stage) {
  const text = readFileSync(path.join(skillRoot, 'references', 'method.md'), 'utf8');
  const section = text.split(new RegExp(`^## ${stage}\\s*$`, 'm'))[1];
  return section?.split(/^## /m)[0].trim();
}
const location = (root, name) => path.join(root, 'run', name);
async function atomic(file, value) {
  const temp = file + `.tmp-${process.pid}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fs.rename(temp, file);
}
function inside(root, file) {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
export async function load(root) {
  const p = JSON.parse(await fs.readFile(location(root, 'progress.json'), 'utf8'));
  if (p.format !== FORMAT) throw new Error('This run is not the on-demand format. Create a fresh run; this Skill has no migration workflow.');
  const sources = (await fs.readFile(location(root, 'sources.jsonl'), 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
  return { p, sources };
}
async function locked(root, fn) {
  const file = location(root, '.writer.lock');
  let handle;
  try { handle = await fs.open(file, 'wx'); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(await fs.readFile(file, 'utf8'));
    try { process.kill(pid, 0); }
    catch (err) {
      if (err.code === 'ESRCH') { await fs.unlink(file); return locked(root, fn); }
    }
    throw new Error(`Another writer owns this run (PID ${pid}); read/status may run concurrently.`);
  }
  await handle.writeFile(String(process.pid));
  try { return await fn(); }
  finally { await handle.close(); await fs.unlink(file).catch(() => {}); }
}
async function tailEvent(root) {
  let h;
  try { h = await fs.open(location(root, 'checkpoints.jsonl'), 'r'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try {
    const { size } = await h.stat();
    let end = size, data = Buffer.alloc(0);
    while (end > 0) {
      const length = Math.min(65536, end), b = Buffer.alloc(length);
      end -= length; await h.read(b, 0, length, end); data = Buffer.concat([b, data]);
      const t = data.toString('utf8').trimEnd(), pos = t.lastIndexOf('\n');
      if (pos >= 0 || end === 0) return t ? JSON.parse(t.slice(pos + 1)) : null;
    }
    return null;
  } finally { await h.close(); }
}
function applyEvent(p, event) {
  if (event.seq <= p.seq) return;
  if (event.seq !== p.seq + 1 || !p.pending || p.pending.id !== event.task) throw new Error('Checkpoint/progress mismatch; preserve files and inspect the pending submission.');
  p.seq = event.seq;
  p.lastAccepted = { task: event.task, kind: event.kind, hash: event.hash };
  if (event.kind === 'local') {
    p.pending.phase = 'review'; p.pending.result = event.result;
  } else {
    if (p.pending.autoScreen) p.screenCursor = p.pending.end;
    p.completed++;
    p.pending = null;
  }
}
async function reconcile(root, p) {
  const tail = await tailEvent(root);
  if (tail && tail.seq > p.seq) { applyEvent(p, tail); await atomic(location(root, 'progress.json'), p); }
}
function materials(root) { return { taskState: path.join(root, 'TaskState.md'), index: path.join(root, 'state', 'index.md') }; }
function guidance(root, p) {
  const task = p.pending;
  return { task: task?.id, stage: task?.stage, phase: task?.phase, label: task?.label,
    materials: materials(root), method: task ? method(task.phase === 'review' ? 'review' : task.stage) : undefined,
    stageGuidance: task ? methodText(task.phase === 'review' ? 'review' : task.stage) : undefined,
    nextAction: task?.phase === 'review'
      ? 'Read current overall map and affected State; check local→whole and whole→local, correct actual findings, prepare TaskState, then submit review for this task. No new task until accepted.'
      : 'Use current TaskState and stage method. Analyze supplied scope; fetch missing context only if the current decision needs it. Save actual results in State, then submit local. Supplied is not analyzed.' };
}
function mergeRanges(existing, additions) {
  for (const r of additions) {
    const last = existing.at(-1);
    if (last && last.source === r.source && last.view === r.view && r.from <= last.to + 1) {
      last.to = Math.max(last.to, r.to); last.end = r.end;
    }
    else existing.push({ ...r });
  }
}
function addMetrics(p, page) {
  for (const [k, v] of Object.entries(page.metrics ?? {})) if (typeof v === 'number') p.metrics[k] = (p.metrics[k] ?? 0) + v;
  p.metrics.calls++;
}

export async function init(root, specs) {
  root = path.resolve(root);
  try { await fs.access(root); throw new Error('Run directory already exists. Choose a fresh directory; existing research is not overwritten.'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!specs.length) throw new Error('Specify --codex PATH and/or --claude PATH (repeatable).');
  for (const spec of specs) {
    const st = await fs.lstat(spec.path).catch(() => null);
    if (st?.isDirectory() && inside(path.resolve(spec.path), root)) throw new Error('Run directory must be outside read-only input directories.');
  }
  const { sources, issues } = await inventory(specs);
  await fs.mkdir(location(root, ''), { recursive: true });
  await fs.mkdir(path.join(root, 'state'));
  await fs.writeFile(location(root, 'sources.jsonl'), sources.map(s => JSON.stringify(s)).join('\n') + (sources.length ? '\n' : ''));
  const p = { format: FORMAT, version: VERSION, readerVersion: READER_VERSION, seq: 0, createdAt: new Date().toISOString(),
    inputs: specs, sourceIssues: issues, screenCursor: beginning(), pending: null, nextTask: 1, completed: 0, metrics: { calls: 0 } };
  await atomic(location(root, 'progress.json'), p);
  await fs.writeFile(path.join(root, 'TaskState.md'), '# 当前任务\n\n尚未研究。恢复时先读本文件、state/index.md和程序当前阶段。首次任务：明确整体研究目标与范围，分批粗筛用户原话链，保留具体事项、出处和未知。\n');
  await fs.writeFile(path.join(root, 'state', 'index.md'), '# 研究索引\n\n目标：一次性尽可能完整理解实际工作、知识实践、判断原因与演变、跨领域联系及条件/矛盾/未知，有原始证据。\n\n尚未形成研究结论。按实际内容逐步组织正文；整体回看检查局部影响整体、整体反证影响局部。\n');
  return { version: VERSION, sources: sources.length, readable: sources.filter(s => s.supported).length, issues,
    ...materials(root), nextAction: 'Read the Skill and current materials, then next. Inventory contains metadata only; no history text has been copied or analyzed.' };
}

export async function next(root, options = {}) {
  return locked(root, async () => {
    const { p, sources } = await load(root); await reconcile(root, p);
    if (p.pending?.phase === 'review') {
      if (options.more || options.stage) throw new Error('Overall review is pending; submit review before assigning another task.');
      return guidance(root, p);
    }
    if (!p.pending) {
      const stage = options.stage ?? 'screen';
      if (!stages.has(stage)) throw new Error('stage must be screen, group, study, audit or synthesis');
      const autoScreen = stage === 'screen' && !options.sources?.length;
      if (autoScreen && p.screenCursor === null) return { ...materials(root), phase: 'screen-supply-exhausted',
        nextAction: 'Source supply is exhausted, not research complete. Use group/study/audit/synthesis tasks, address gaps and validate research outcomes.' };
      const selected = options.sources?.length ? sources.filter(s => options.sources.includes(s.id)) : autoScreen ? sources : [];
      if (options.sources?.some(id => !selected.some(s => s.id === id))) throw new Error('Unknown source in task selection');
      p.pending = { id: `t${p.nextTask++}`, stage, label: options.label ?? (autoScreen ? '当前连续范围用户链粗筛' : stage),
        phase: 'work', autoScreen, sourceIds: selected.map(s => s.id), view: options.view ?? (stage === 'screen' ? 'users' : 'dialogue'),
        start: autoScreen ? p.screenCursor : beginning(), end: autoScreen ? p.screenCursor : beginning(), ranges: [], gaps: [], observations: [], searches: [], lastFrom: null,
        lastLimit: integer(options.limit, 16000, 512) };
    } else if (options.stage || options.sources?.length) throw new Error('An unfinished task exists; finish its local result and overall review first.');
    const task = p.pending, selected = task.sourceIds.map(id => sources.find(s => s.id === id));
    if (!selected.length) { await atomic(location(root, 'progress.json'), p); return guidance(root, p); }
    if (options.more && task.end === null) throw new Error('Current task source supply is exhausted; save results and submit local.');
    const from = options.more || !task.lastFrom ? task.end : task.lastFrom;
    const page = await readPage(selected, { cursor: from, view: task.view,
      limit: options.limit === undefined ? task.lastLimit : integer(options.limit, 16000, 512) });
    task.lastFrom = from; task.lastLimit = options.limit === undefined ? task.lastLimit : integer(options.limit, 16000, 512);
    task.end = page.next; mergeRanges(task.ranges, page.ranges); mergeGaps(task.gaps, page.gaps); addMetrics(p, page);
    await atomic(location(root, 'progress.json'), p);
    return { ...guidance(root, p), page, more: page.next !== null,
      note: 'next repeats the last delivered chunk for recovery; next --more extends this same task. Neither accepts analysis.' };
  });
}

async function resultText(root, ref) {
  if (!ref) throw new Error('submit requires --result relative/analysis.md[#Heading]');
  const hash = ref.indexOf('#'), relative = hash < 0 ? ref : ref.slice(0, hash), heading = hash < 0 ? '' : ref.slice(hash + 1);
  const file = path.resolve(root, relative), realRoot = await fs.realpath(root), realFile = await fs.realpath(file);
  if (!inside(realRoot, realFile) || !file.endsWith('.md')) throw new Error('Result must be a Markdown file within the run directory.');
  let text = await fs.readFile(realFile, 'utf8');
  if (heading) {
    const rows = text.split('\n'), index = rows.findIndex(line => /^#{1,6} /.test(line) && line.replace(/^#+\s*/, '').trim() === heading);
    if (index < 0) throw new Error(`Result heading not found: ${heading}`);
    const level = rows[index].match(/^#+/)[0].length;
    let end = index + 1;
    while (end < rows.length && !(new RegExp(`^#{1,${level}} `)).test(rows[end])) end++;
    text = rows.slice(index, end).join('\n');
  }
  if (!text.replace(/^#+.*$/gm, '').trim()) throw new Error('Result has no analysis text.');
  return text;
}

export async function submit(root, options) {
  return locked(root, async () => {
    const { p } = await load(root); await reconcile(root, p);
    const kind = options.kind;
    if (!['local', 'review'].includes(kind) || !options.task) throw new Error('submit requires --task tN --kind local|review --result analysis.md');
    const body = await resultText(root, options.result), hash = digest(body);
    if (p.lastAccepted?.task === options.task && p.lastAccepted.kind === kind && p.lastAccepted.hash === hash) return { accepted: true, duplicate: true, ...guidance(root, p) };
    if (p.pending?.id !== options.task) throw new Error('Submission task is not the current unfinished task; no progress changed.');
    if ((kind === 'local' && p.pending.phase !== 'work') || (kind === 'review' && p.pending.phase !== 'review')) throw new Error('Submission is out of sequence: local → overall review → next task.');
    for (const file of Object.values(materials(root))) if (!(await fs.readFile(file, 'utf8')).trim()) throw new Error('TaskState and index must remain readable.');
    const event = { seq: p.seq + 1, time: new Date().toISOString(), task: p.pending.id, stage: p.pending.stage, kind,
      readerVersion: READER_VERSION, view: p.pending.view, ranges: p.pending.ranges, gaps: p.pending.gaps,
      observations: p.pending.observations, searches: p.pending.searches, result: options.result, hash, body };
    await fs.appendFile(location(root, 'checkpoints.jsonl'), JSON.stringify(event) + '\n');
    applyEvent(p, event); await atomic(location(root, 'progress.json'), p);
    return { accepted: true, ...guidance(root, p), phase: p.pending?.phase ?? 'task-completed',
      note: 'Only ordering/persistence is checked. The model owns semantic adequacy and exact processed scope.' };
  });
}

function mergeGaps(target, gaps) {
  const known = new Set(target.map(g => JSON.stringify(g)));
  for (const gap of gaps) if (!known.has(JSON.stringify(gap))) { target.push(gap); known.add(JSON.stringify(gap)); }
}
async function observe(root, task, page, search) {
  return locked(root, async () => {
    const { p } = await load(root); await reconcile(root, p); addMetrics(p, page);
    if (task && p.pending?.id === task) {
      mergeRanges(p.pending.observations, page.ranges ?? []); mergeGaps(p.pending.gaps, page.gaps ?? []);
      if (search) p.pending.searches.push(search);
    }
    await atomic(location(root, 'progress.json'), p);
  });
}
export async function read(root, options) {
  const { p, sources } = await load(root);
  const selected = options.sources?.length ? sources.filter(s => options.sources.includes(s.id)) : sources;
  if (options.sources?.some(id => !selected.some(s => s.id === id))) throw new Error('Unknown source');
  const key = digest(JSON.stringify({ root: path.resolve(root), ids: selected.map(s => s.id), view: options.view, ref: options.ref, before: options.before, after: options.after }));
  const saved = options.cursor ? decodeCursor(options.cursor) : null;
  if (saved && (saved.kind !== 'read' || saved.key !== key)) throw new Error('Cursor belongs to a different read request; reuse the same scope/view/ref.');
  const args = { ...options, cursor: saved?.position };
  const page = options.ref ? await readReference(sources, options.ref, args) : await readPage(selected, args);
  await observe(root, p.pending?.id, page);
  return { ...page, continuation: page.next ? encodeCursor({ kind: 'read', key, position: page.next }) : null };
}
export async function find(root, options) {
  const { p, sources } = await load(root);
  const selected = options.sources?.length ? sources.filter(s => options.sources.includes(s.id)) : sources;
  if (options.sources?.some(id => !selected.some(s => s.id === id))) throw new Error('Unknown source');
  const key = digest(JSON.stringify({ root: path.resolve(root), ids: selected.map(s => s.id), text: options.text }));
  const saved = options.cursor ? decodeCursor(options.cursor) : null;
  if (saved && (saved.kind !== 'find' || saved.key !== key)) throw new Error('Cursor belongs to a different search');
  const result = await findText(selected, options.text, { limit: options.limit, cursor: saved?.position });
  await observe(root, p.pending?.id, result, { text: options.text, sources: options.sources ?? 'all', matches: result.matches.map(m => m.ref) });
  return { ...result, continuation: result.next ? encodeCursor({ kind: 'find', key, position: result.next }) : null,
    boundary: 'Literal search of all decoded string fields, not semantic selection or proof of coverage.' };
}
export async function status(root, { offset = 0, limit = 20 } = {}) {
  const { p, sources } = await load(root);
  const tail = await tailEvent(root);
  const recoveryPending = !!tail && tail.seq > p.seq;
  if (recoveryPending) applyEvent(p, tail);
  return { version: VERSION, sourceCount: sources.length, readable: sources.filter(s => s.supported).length,
    sourceIssues: p.sourceIssues, screenCursor: p.screenCursor, completedTasks: p.completed, metrics: p.metrics,
    recoveryPending, ...guidance(root, p), pending: p.pending ? {
      id: p.pending.id, stage: p.pending.stage, phase: p.pending.phase, label: p.pending.label,
      sourceCount: p.pending.sourceIds.length, ranges: p.pending.ranges, gaps: p.pending.gaps,
      end: p.pending.end, result: p.pending.result
    } : null, sourceOffset: offset,
    sources: sources.slice(integer(offset, 0), integer(offset, 0) + integer(limit, 20, 1)),
    nextSourceOffset: offset + limit < sources.length ? offset + limit : null };
}

function parse(argv) {
  const [command, ...rest] = argv, options = {}, specs = [];
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--more') { options.more = true; continue; }
    if (!flag.startsWith('--') || rest[i + 1] === undefined || rest[i + 1].startsWith('--')) throw new Error(`Missing/invalid option: ${flag}`);
    const value = rest[++i], key = flag.slice(2);
    if (key === 'codex' || key === 'claude') specs.push({ provider: key, path: path.resolve(value) });
    else if (key === 'source') (options.sources ??= []).push(...value.split(','));
    else if (['root','stage','label','view','limit','ref','before','after','cursor','kind','result','task','text','offset'].includes(key)) options[key] = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  return { command, options, specs };
}
export async function main(argv = process.argv.slice(2)) {
  const { command, options, specs } = parse(argv);
  if (command === 'help' || !command) return { version: VERSION, commands: ['init --root RUN --codex PATH --claude PATH',
    'next --root RUN [--more | --stage group|study|audit|synthesis --label TEXT --source ID]',
    'read --root RUN [--source ID | --ref ID:LINE#/pointer] [--view users|dialogue|raw --cursor TOKEN]',
    'find --root RUN --text LITERAL [--source ID --cursor TOKEN]',
    'submit --root RUN --task tN --kind local|review --result state/analysis.md#Heading', 'status --root RUN [--offset N --limit N]'] };
  if (!options.root) throw new Error('--root RUN is required');
  const root = path.resolve(options.root);
  if (command === 'init') return init(root, specs);
  if (command === 'next') return next(root, options);
  if (command === 'read') return read(root, options);
  if (command === 'find') return find(root, options);
  if (command === 'submit') return submit(root, options);
  if (command === 'status') return status(root, { offset: integer(options.offset, 0), limit: integer(options.limit, 20, 1) });
  throw new Error(`Unknown command: ${command}. Use help.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: error.message, progressNotAssumed: true }) + '\n'); process.exitCode = 1;
  });
}
