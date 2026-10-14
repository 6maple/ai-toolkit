import { readFile, readdir, lstat, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DEFAULT_BRAIN_HOME,
  FileGlobalSemanticLease,
  INITIAL_DURABILITY,
  decodeCompanion,
  decodeMarkdown,
  decodeScopeState,
  encodeCompanion,
  hashMarkdownContent,
  parseArchivalDocument,
  parsePublicPath,
  validateCoreDocument,
} from "brain/shared";

const ROLES = new Set(["decision", "knowledge", "intention", "skill"]);
export const BRAIN_ROOT = process.env.BRAIN_CLI_ROOT ?? DEFAULT_BRAIN_HOME;
const PACK_ROOT = fileURLToPath(new URL("./default-memories/skill/brain-ai/", import.meta.url));
export const PACK_ROUTE = "- 立即读取 `@global/memories/skill/brain-ai/core.md` 的完整原文，按其中记忆读取方法和路线取得适用认知。";

function isMissing(error) { return error?.code === "ENOENT"; }
async function readMaybe(target) {
  try { return await readFile(target); } catch (error) { if (isMissing(error)) return undefined; throw error; }
}
function portable(relative) { return relative.split(path.sep).join("/"); }
function stateMemoryPath(relative) {
  const match = /^global\/\.state\/memories\/(decision|knowledge|intention|skill)\/(.+)\.json$/.exec(relative);
  return match === null ? undefined : `global/memories/${match[1]}/${match[2]}.md`;
}
function validateRelative(relative) {
  if (relative === "global/core.md") return "core";
  const bits = relative.split("/");
  if (bits[0] !== "global" || bits.length < 4) throw new Error(`不支持的导入路径：${relative}`);
  if (bits[1] === ".state") {
    if (stateMemoryPath(relative) === undefined) throw new Error(`不支持的状态路径：${relative}`);
    return "state";
  }
  if (bits[1] !== "memories" || !ROLES.has(bits[2])) throw new Error(`不支持的导入路径：${relative}`);
  if (relative.endsWith(".md")) {
    const parsed = parsePublicPath(`@global/${bits.slice(1).join("/")}`);
    if (parsed.kind !== "archival") throw new Error(`不是记忆路径：${relative}`);
    return "memory";
  }
  return "asset";
}
async function listFiles(root) {
  const found = [];
  const globalRoot = path.join(root, "global");
  const globalInfo = await lstat(globalRoot);
  if (!globalInfo.isDirectory() || globalInfo.isSymbolicLink()) throw new Error("global 必须是普通目录");
  async function visit(dir, parts) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (item.isSymbolicLink()) throw new Error(`不接受符号链接：${portable(path.join(...parts, item.name))}`);
      const next = [...parts, item.name];
      if (item.isDirectory()) await visit(path.join(dir, item.name), next);
      else if (item.isFile()) found.push(portable(next.join(path.sep)));
      else throw new Error(`不支持的文件类型：${portable(next.join(path.sep))}`);
    }
  }
  await visit(globalRoot, ["global"]);
  return found.sort();
}
function validateDocument(relative, bytes) {
  const kind = validateRelative(relative);
  if (kind === "core") validateCoreDocument(decodeMarkdown(bytes));
  if (kind === "memory") parseArchivalDocument(decodeMarkdown(bytes));
  return kind;
}
async function validPortableState(root, relative, bytes) {
  const memoryRelative = stateMemoryPath(relative);
  if (memoryRelative === undefined) return { warning: `${relative}: 不支持的状态文件` };
  const markdown = await readMaybe(path.join(root, ...memoryRelative.split("/")));
  if (markdown === undefined) return { warning: `${relative}: 对应正文不存在` };
  try {
    const cognition = parseArchivalDocument(decodeMarkdown(markdown));
    const state = decodeCompanion(bytes);
    if (state.contentHash !== hashMarkdownContent(cognition.text)) {
      return { warning: `${relative}: 状态与正文不匹配` };
    }
    if (state.epistemic.challenge === undefined) return { skip: true };
    return {
      bytes: encodeCompanion({
        contentHash: state.contentHash,
        epistemic: state.epistemic,
        accessibility: { ageCycles: 0, anchorCycle: 0, durability: INITIAL_DURABILITY, exposure: 0 },
      }),
    };
  } catch (error) {
    return { warning: `${relative}: 状态或正文损坏（${error instanceof Error ? error.message : String(error)}）` };
  }
}

export async function exportGlobal(output) {
  const source = path.resolve(BRAIN_ROOT);
  const destination = path.resolve(output);
  if (destination === source || destination.startsWith(source + path.sep)) {
    throw new Error("导出目录不能位于 Brain 数据目录中");
  }
  const files = await listFiles(source);
  const written = [], warnings = [];
  try {
    for (const relative of files) {
      let kind;
      try { kind = validateRelative(relative); } catch { continue; }
      if (relative.startsWith("global/.state/") && kind !== "state") continue;
      const bytes = await readFile(path.join(source, ...relative.split("/")));
      if (kind === "state") {
        const result = await validPortableState(source, relative, bytes);
        if (result.warning) { warnings.push(result.warning); continue; }
        if (result.skip) continue;
        await writeExportFile(destination, relative, result.bytes);
      } else {
        validateDocument(relative, bytes);
        await writeExportFile(destination, relative, bytes);
      }
      written.push(relative);
    }
  } catch (error) {
    throw new Error(`导出中断；已写出 ${written.join(", ") || "无"}；${error instanceof Error ? error.message : String(error)}`);
  }
  return { written, warnings };
}
async function writeExportFile(root, relative, bytes) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  const prior = await readMaybe(target);
  if (prior !== undefined && !prior.equals(bytes)) throw new Error(`导出目标已有不同内容：${relative}`);
  if (prior === undefined) await writeFile(target, bytes, { flag: "wx" });
}

async function coordinatedInstall(entries, route) {
  await mkdir(BRAIN_ROOT, { recursive: true });
  const lease = new FileGlobalSemanticLease(BRAIN_ROOT);
  return lease.runExclusive(undefined, async () => {
    const planned = [];
    const same = [], conflicts = [];
    const all = new Map(entries);
    const scopeBytes = await readMaybe(path.join(BRAIN_ROOT, "global", ".state", "scope.json"));
    const cycle = scopeBytes === undefined ? 0 : decodeScopeState(scopeBytes).cycle;
    if (route !== undefined) {
      const coreRelative = "global/core.md";
      const incoming = all.get(coreRelative);
      if (incoming !== undefined) throw new Error("记忆包输入不能自行包含 Global Core");
      const current = await readMaybe(path.join(BRAIN_ROOT, "global", "core.md"));
      const original = current === undefined ? "" : decodeMarkdown(current);
      const hasRoute = original.split("\n").includes(route);
      if (!hasRoute && original.includes("@global/memories/skill/brain-ai/core.md")) {
        conflicts.push(coreRelative + "（已有不同的 brain-ai 入口）");
      } else {
        const result = hasRoute ? original : `${original.trimEnd()}${original.trim().length === 0 ? "" : "\n"}${route}\n`;
        validateCoreDocument(result);
        all.set(coreRelative, Buffer.from(result, "utf8"));
      }
    }
    for (const [relative, raw] of all) {
      const kind = validateDocument(relative, raw);
      const incoming = kind === "state"
        ? encodeCompanion({
            contentHash: decodeCompanion(raw).contentHash,
            epistemic: decodeCompanion(raw).epistemic,
            accessibility: { ageCycles: 0, anchorCycle: cycle, durability: INITIAL_DURABILITY, exposure: 0 },
          })
        : raw;
      const target = path.join(BRAIN_ROOT, ...relative.split("/"));
      const stat = await lstat(target).catch((error) => { if (isMissing(error)) return undefined; throw error; });
      if (stat !== undefined && !stat.isFile()) { conflicts.push(relative + "（目标不是普通文件）"); continue; }
      const current = stat === undefined ? undefined : await readFile(target);
      if (current === undefined) planned.push({ relative, target, incoming, missing: true });
      else if (current.equals(incoming) || (kind === "state" && (() => {
        try {
          const existing = decodeCompanion(current);
          const wanted = decodeCompanion(incoming);
          return existing.contentHash === wanted.contentHash && existing.epistemic.challenge === wanted.epistemic.challenge;
        } catch { return false; }
      })())) same.push(relative);
      else if (route !== undefined && relative === "global/core.md") planned.push({ relative, target, incoming, missing: false });
      else conflicts.push(relative);
    }
    if (conflicts.length > 0) return { written: [], same, conflicts };
    planned.sort((a, b) => (a.relative === "global/core.md" ? 1 : b.relative === "global/core.md" ? -1 : a.relative.localeCompare(b.relative)));
    const written = [];
    try {
      for (const item of planned) {
        await mkdir(path.dirname(item.target), { recursive: true });
        await writeFile(item.target, item.incoming, item.missing ? { flag: "wx" } : undefined);
        written.push(item.relative);
      }
    } catch (error) {
      throw new Error(`写入中断；已完成 ${written.join(", ") || "无"}；未完成 ${planned.filter((item) => !written.includes(item.relative)).map((item) => item.relative).join(", ")}：${error instanceof Error ? error.message : String(error)}`);
    }
    return { written, same, conflicts: [] };
  });
}

export async function importGlobal(input) {
  const source = path.resolve(input);
  const files = await listFiles(source);
  const entries = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(source, ...relative.split("/")));
    const kind = validateDocument(relative, bytes);
    if (kind === "state") {
      const state = await validPortableState(source, relative, bytes);
      if (state.warning) throw new Error(`导入状态无效：${state.warning}`);
      if (state.skip) continue;
      entries.push([relative, state.bytes]);
    } else entries.push([relative, bytes]);
  }
  return coordinatedInstall(entries);
}

export async function installBrainAi() {
  const entries = [];
  for (const name of ["core", "software", "agentic-software", "instructions", "user-facing-expression", "report-writing"]) {
    const relative = `global/memories/skill/brain-ai/${name}.md`;
    const bytes = await readFile(path.join(PACK_ROOT, `${name}.md`));
    validateDocument(relative, bytes);
    entries.push([relative, bytes]);
  }
  return coordinatedInstall(entries, PACK_ROUTE);
}
