#!/usr/bin/env node
/*
 * 本地 skill 链接管理：Node.js 18+，无需依赖。
 * 本文件可独立使用；完整用法见下方 HELP，或运行 node "本脚本路径" --help。
 *
 * 给执行安装的 AI：
 * 1. 从用户请求、项目配置或客户端说明确定目标项目实际使用的 skill 目录。
 *    --target 传该目录，不是项目根目录；无法确定时询问用户。
 * 2. 按用户指定范围使用 --skill；只有要求安装全部时使用 --all。
 * 3. 用相同参数先 install --dry-run，再 install，最后 status --skill 检查安装项。
 * 4. 冲突时保留现场并报告，避免自行删除真实目录、修改记录或绕过脚本。
 * 必须通过 --source 指定原 Skill 库；本脚本位于 lsh 内，不能从脚本目录猜测源库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST = '.skill-links.json';
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';
const EXAMPLE_COMMAND = `node "${fileURLToPath(import.meta.url).replaceAll('\\', '/')}"`;
const HELP = `本地 skill 链接管理（Node.js 18+，无需依赖）

node link-skills.mjs <install|update|uninstall|status> --source <私有Skill库> --target <客户端Skill目录> [选项]

  --skill <名称>   指定 skill，可重复传入
  --all            install: 源目录所有 skill；其他命令: 所有已管理项
  --source <目录>  必填：原始 Skill 库目录
  --dry-run        只显示操作，不写入文件
  --help           显示帮助

install/update/uninstall 必须指定 --skill 或 --all；status 默认查看所有已管理项。
内容通过链接实时共享；update 修复缺失链接或调整源路径。
Windows 使用 junction，其他平台使用目录符号链接。

源库请从 lsh 安装配置中的 configured.library 读取，或让用户明确指定。
--target 必须是目标项目实际使用的 skill 目录，不是项目根目录。
请按用户请求、项目配置或客户端说明确定目录；无法确定时询问用户。

示例（将 <私有Skill库>、<项目的skill目录> 和 example-skill 换为实际值；包含空格时保留引号）：
  ${EXAMPLE_COMMAND} --help
  ${EXAMPLE_COMMAND} install --source "<私有Skill库>" --target "<项目的skill目录>" --skill example-skill --dry-run
  ${EXAMPLE_COMMAND} install --source "<私有Skill库>" --target "<项目的skill目录>" --skill example-skill
  ${EXAMPLE_COMMAND} status --source "<私有Skill库>" --target "<项目的skill目录>" --skill example-skill
  ${EXAMPLE_COMMAND} update --source "<私有Skill库>" --target "<项目的skill目录>" --all
  ${EXAMPLE_COMMAND} uninstall --source "<私有Skill库>" --target "<项目的skill目录>" --skill example-skill

安装全部：install --all；多个指定项：重复传入 --skill。
源库搬家：update --all --source "<新的源库目录>"（同时传入 --target）。
本脚本随 lsh 源码交付，不能使用其所在目录作为默认 Skill 来源。
install --all 发现源库直接子目录中含 SKILL.md 的 skill。
update/uninstall --all 只处理已有安装记录；update 不自动加入新的 skill。

目标目录中的 .skill-links.json 是安装记录，请保留以支持后续管理。
真实目录、未记录的链接或已改变指向的链接会报告冲突并保留现场。
卸载解除脚本管理的链接并清理记录，保留源 skill；源已丢失时仍可卸载。
退出码 0 表示成功；1 表示异常、冲突或状态不正常，批量操作可能部分成功。
操作完成后用 status 查看指定安装项，按实际结果报告。
`;

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const options = { command: args.shift(), skills: [] };
  if (!['install', 'update', 'uninstall', 'status'].includes(options.command)) {
    throw new Error('请指定 install、update、uninstall 或 status；用 --help 查看用法。');
  }
  const seen = new Set();
  while (args.length) {
    const flag = args.shift();
    if (['--all', '--dry-run'].includes(flag)) {
      options[flag === '--all' ? 'all' : 'dryRun'] = true;
    } else if (['--target', '--source', '--skill'].includes(flag)) {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`${flag} 缺少参数。`);
      if (flag === '--skill') options.skills.push(value);
      else {
        if (seen.has(flag)) throw new Error(`${flag} 不能重复。`);
        seen.add(flag);
        options[flag.slice(2)] = value;
      }
    } else throw new Error(`未知参数：${flag}`);
  }
  if (!options.source) throw new Error('必须通过 --source 指定私有 Skill 库目录。');
  if (!options.target) throw new Error('必须通过 --target 指定项目的 skill 目录。');
  if (options.all && options.skills.length) throw new Error('--all 和 --skill 不能同时使用。');
  if (options.command !== 'status' && !options.all && !options.skills.length) {
    throw new Error('请通过 --skill 或 --all 指定操作范围。');
  }
  options.source = path.resolve(options.source);
  options.target = path.resolve(options.target);
  options.skills = [...new Set(options.skills)];
  options.skills.forEach(validateName);
  return options;
}

function validateName(name) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || name.endsWith('.') ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error(`无效 skill 名称：${name}（使用字母、数字、点、下划线或连字符）。`);
  }
}

function statOrNull(file, follow = false) {
  try { return follow ? fs.statSync(file) : fs.lstatSync(file); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function pathKey(file) {
  const normalized = path.normalize(path.resolve(file));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function samePath(a, b) { return pathKey(a) === pathKey(b); }

// Resolve existing ancestors too, so a project path through a junction cannot hide overlap.
function canonicalPath(file) {
  try { return fs.realpathSync.native(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(canonicalPath(parent), path.basename(file));
  }
}

function inside(parent, child) {
  const relative = path.relative(pathKey(parent), pathKey(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertSeparate(source, target) {
  const a = canonicalPath(source);
  const b = canonicalPath(target);
  if (inside(a, b) || inside(b, a)) throw new Error('源库与目标目录不能相同或互相包含。');
}

function validSkill(file) {
  return statOrNull(file, true)?.isDirectory() && statOrNull(path.join(file, 'SKILL.md'), true)?.isFile();
}

function loadManifest(target) {
  const file = path.join(target, MANIFEST);
  const stats = statOrNull(file);
  if (!stats) return { version: 1, skills: Object.create(null) };
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${MANIFEST} 必须是普通文件。`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data?.version !== 1 || !data.skills || typeof data.skills !== 'object' || Array.isArray(data.skills)) {
    throw new Error(`${MANIFEST} 格式或版本不正确。`);
  }
  const keys = new Set();
  for (const [name, entry] of Object.entries(data.skills)) {
    validateName(name);
    const key = pathKey(path.join(target, name));
    if (keys.has(key)) throw new Error(`${MANIFEST} 包含重名项：${name}`);
    keys.add(key);
    if (typeof entry?.source !== 'string' || !path.isAbsolute(entry.source)) {
      throw new Error(`${MANIFEST} 的 ${name} 缺少绝对源路径。`);
    }
  }
  return data;
}

function saveManifest(target, data) {
  const file = path.join(target, MANIFEST);
  const temp = `${file}.${process.pid}.tmp`;
  let created = false;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
    created = true;
    fs.renameSync(temp, file);
  } finally {
    if (created && statOrNull(temp)) fs.unlinkSync(temp);
  }
}

function inspectLink(file) {
  const stats = statOrNull(file);
  if (!stats) return { kind: 'missing' };
  if (!stats.isSymbolicLink()) return { kind: 'conflict', detail: '已有真实文件或目录' };
  return { kind: 'link', source: path.resolve(path.dirname(file), fs.readlinkSync(file)) };
}

function removeVerifiedLink(file, source) {
  const actual = inspectLink(file);
  if (actual.kind !== 'link' || !samePath(actual.source, source)) {
    throw new Error(`链接发生变化，保留现场：${file}`);
  }
  // unlink removes the junction/symlink itself; never recursively remove a skill directory.
  fs.unlinkSync(file);
}

function selectNames(options, data) {
  let names = options.skills;
  if (options.all || (!names.length && options.command === 'status')) {
    names = options.command === 'install'
      ? fs.readdirSync(options.source).filter(name => validSkill(path.join(options.source, name)))
      : Object.keys(data.skills);
  }
  const keys = new Set();
  for (const name of names) {
    validateName(name);
    const key = pathKey(path.join(options.target, name));
    if (keys.has(key)) throw new Error(`操作范围包含重名项：${name}`);
    keys.add(key);
  }
  return names.sort();
}

function planItem(options, data, name) {
  const file = path.join(options.target, name);
  const source = path.join(options.source, name);
  const entry = Object.hasOwn(data.skills, name) ? data.skills[name] : undefined;
  const actual = inspectLink(file);
  // A case-only spelling difference on Windows must not create a second ownership record.
  const alias = Object.keys(data.skills).find(key => key !== name && samePath(path.join(options.target, key), file));
  if (alias) return { kind: 'conflict', detail: `请使用安装记录中的名称 ${alias}` };
  if (actual.kind === 'conflict') return actual;
  if (entry && actual.kind === 'link' && !samePath(actual.source, entry.source)) {
    return { kind: 'conflict', detail: `链接指向已变化：${actual.source}` };
  }
  if (options.command === 'status') {
    if (!entry) return { kind: 'unmanaged', detail: '无安装记录' };
    if (actual.kind === 'missing') return { kind: 'missing', detail: entry.source };
    return { kind: validSkill(entry.source) ? 'ok' : 'source-missing', detail: entry.source };
  }
  if (options.command === 'uninstall') {
    if (!entry) return { kind: 'skip', detail: '未安装；保留已有链接' };
    return { kind: actual.kind === 'missing' ? 'forget' : 'remove', oldSource: entry.source };
  }
  if (options.command === 'update' && !entry) return { kind: 'error', detail: '未安装，请先 install' };
  if (!validSkill(source)) return { kind: 'error', detail: `源目录不存在或缺少 SKILL.md：${source}` };
  assertSeparate(source, options.target);
  if (!entry && actual.kind === 'link') return { kind: 'conflict', detail: '已有非本脚本管理的链接' };
  if (actual.kind === 'missing') return { kind: entry ? 'repair' : 'create', source, oldSource: entry?.source };
  if (samePath(entry.source, source)) return { kind: 'skip', detail: '链接正常，内容随源文件实时更新' };
  if (options.command === 'install') return { kind: 'conflict', detail: '已从其他源安装；请使用 update 调整源路径' };
  return { kind: 'repoint', source, oldSource: entry.source };
}

function applyItem(options, data, name, plan) {
  const file = path.join(options.target, name);
  const previous = data.skills[name];
  let removed = false;
  let created = false;
  try {
    if (['remove', 'repoint'].includes(plan.kind)) {
      removeVerifiedLink(file, plan.oldSource);
      removed = true;
    }
    if (['create', 'repair', 'repoint'].includes(plan.kind)) {
      fs.symlinkSync(plan.source, file, LINK_TYPE);
      created = true;
      data.skills[name] = { source: plan.source };
    } else delete data.skills[name];
    saveManifest(options.target, data);
  } catch (error) {
    if (previous) data.skills[name] = previous;
    else delete data.skills[name];
    try {
      if (created) removeVerifiedLink(file, plan.source);
      if (removed) fs.symlinkSync(plan.oldSource, file, LINK_TYPE);
    } catch (rollbackError) {
      throw new Error(`${error.message}；恢复链接失败：${rollbackError.message}`);
    }
    throw error;
  }
}

function run(options) {
  assertSeparate(options.source, options.target);
  const targetStats = statOrNull(options.target, true);
  if (targetStats && !targetStats.isDirectory()) throw new Error('目标路径必须是目录。');
  const mutate = !options.dryRun && options.command !== 'status';
  let lock;
  const lockFile = path.join(options.target, '.skill-links.lock');
  try {
    if (mutate) {
      // Validate inputs before creating a previously absent target directory.
      const before = loadManifest(options.target);
      const names = selectNames(options, before);
      if (!names.length) { console.log('没有可操作的 skill。'); return; }
      const plans = names.map(name => planItem(options, before, name));
      if (!plans.some(plan => ['create', 'repair', 'repoint', 'remove', 'forget'].includes(plan.kind))) {
        report(options, names, plans);
        return;
      }
      fs.mkdirSync(options.target, { recursive: true });
      try { lock = fs.openSync(lockFile, 'wx'); }
      catch (error) {
        if (error.code === 'EEXIST') throw new Error(`目标目录正被其他操作占用；若上次异常退出，确认无运行中的脚本后删除 ${lockFile}`);
        throw error;
      }
    }
    const data = loadManifest(options.target);
    const names = selectNames(options, data);
    if (!names.length) { console.log('没有可操作的 skill。'); return; }
    for (const name of names) {
      try {
        const plan = planItem(options, data, name);
        if (mutate && ['create', 'repair', 'repoint', 'remove', 'forget'].includes(plan.kind)) {
          applyItem(options, data, name, plan);
        }
        report(options, [name], [plan]);
      } catch (error) {
        console.error(`[error] ${name}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  } finally {
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.unlinkSync(lockFile);
    }
  }
}

function report(options, names, plans) {
  plans.forEach((plan, i) => {
    const prefix = options.dryRun ? 'dry-run ' : '';
    console.log(`[${prefix}${plan.kind}] ${names[i]}${plan.detail ? `: ${plan.detail}` : ''}${plan.source ? ` -> ${plan.source}` : ''}`);
    if (['conflict', 'error', 'missing', 'source-missing', 'unmanaged'].includes(plan.kind)) process.exitCode = 1;
  });
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) console.log(HELP);
  else run(options);
} catch (error) {
  console.error(`错误：${error.message}`);
  process.exitCode = 1;
}
