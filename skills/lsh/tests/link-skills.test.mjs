import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/link-skills.mjs', import.meta.url));
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

function fixture(t) {
  const tempParent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempParent, 'skill-links-test-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'project', 'skills');
  fs.mkdirSync(source);
  t.after(() => {
    // Only recursively remove this test's own generated directory.
    assert.equal(path.dirname(root), tempParent);
    assert.ok(path.basename(root).startsWith('skill-links-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const skill = (name, library = source) => {
    const dir = path.join(library, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`);
    return dir;
  };
  const run = (command, args = [], expected = 0) => {
    const result = spawnSync(process.execPath, [script, command, '--source', source, '--target', target, ...args], {
      encoding: 'utf8', cwd: root,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, expected, result.stdout + result.stderr);
    return result.stdout + result.stderr;
  };
  const manifest = () => JSON.parse(fs.readFileSync(path.join(target, '.skill-links.json'), 'utf8'));
  return { root, source, target, skill, run, manifest };
}

test('install shares content, is idempotent, and uninstall preserves source', t => {
  const f = fixture(t);
  const source = f.skill('alpha');
  assert.match(f.run('install', ['--skill', 'alpha']), /create/);
  assert.equal(fs.lstatSync(path.join(f.target, 'alpha')).isSymbolicLink(), true);
  assert.match(f.run('install', ['--skill', 'alpha']), /skip/);
  fs.writeFileSync(path.join(source, 'extra.txt'), 'changed');
  assert.equal(fs.readFileSync(path.join(f.target, 'alpha', 'extra.txt'), 'utf8'), 'changed');
  f.run('status');
  f.run('uninstall', ['--skill', 'alpha']);
  assert.equal(fs.existsSync(path.join(source, 'SKILL.md')), true);
  assert.deepEqual(f.manifest().skills, {});
  f.run('uninstall', ['--skill', 'alpha']);
});

test('dry-run never creates target; all ignores folders without SKILL.md', t => {
  const f = fixture(t);
  f.skill('alpha');
  fs.mkdirSync(path.join(f.source, 'support'));
  assert.match(f.run('install', ['--all', '--dry-run']), /dry-run create/);
  assert.equal(fs.existsSync(f.target), false);
  f.run('install', ['--all']);
  assert.deepEqual(Object.keys(f.manifest().skills), ['alpha']);
  const before = fs.readFileSync(path.join(f.target, '.skill-links.json'), 'utf8');
  f.run('uninstall', ['--all', '--dry-run']);
  assert.equal(fs.readFileSync(path.join(f.target, '.skill-links.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(f.target, 'alpha', 'SKILL.md')), true);
});

test('update repairs missing links without installing newly discovered skills', t => {
  const f = fixture(t);
  f.skill('alpha');
  f.run('install', ['--all']);
  fs.unlinkSync(path.join(f.target, 'alpha'));
  f.skill('beta');
  f.run('status', [], 1);
  assert.match(f.run('update', ['--all']), /repair/);
  assert.equal(fs.existsSync(path.join(f.target, 'alpha', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(f.target, 'beta')), false);
});

test('update repoints links after a library move', t => {
  const f = fixture(t);
  f.skill('alpha');
  f.run('install', ['--all']);
  const moved = path.join(f.root, 'moved');
  fs.renameSync(f.source, moved);
  const result = spawnSync(process.execPath, [script, 'update', '--target', f.target, '--source', moved, '--all'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /repoint/);
  assert.equal(f.manifest().skills.alpha.source, path.join(moved, 'alpha'));
  f.run('status');
});

test('missing source is reported; broken links can still be uninstalled', t => {
  const f = fixture(t);
  f.skill('alpha');
  f.run('install', ['--all']);
  fs.renameSync(f.source, path.join(f.root, 'moved'));
  const record = f.manifest();
  f.run('update', ['--all'], 1);
  assert.deepEqual(f.manifest(), record);
  f.run('status', [], 1);
  f.run('uninstall', ['--all']);
  assert.equal(fs.existsSync(path.join(f.root, 'moved', 'alpha', 'SKILL.md')), true);
});

test('real directories and unmanaged links are preserved', t => {
  const f = fixture(t);
  const alpha = f.skill('alpha');
  f.skill('beta');
  fs.mkdirSync(path.join(f.target, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(f.target, 'alpha', 'keep.txt'), 'keep');
  fs.symlinkSync(path.join(f.source, 'beta'), path.join(f.target, 'beta'), linkType);
  f.run('install', ['--all'], 1);
  assert.equal(fs.readFileSync(path.join(f.target, 'alpha', 'keep.txt'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(alpha, 'SKILL.md')), true);
  f.run('uninstall', ['--skill', 'beta']);
  assert.equal(fs.lstatSync(path.join(f.target, 'beta')).isSymbolicLink(), true);
});

test('modified managed links and replacements are preserved', t => {
  const f = fixture(t);
  f.skill('alpha');
  f.run('install', ['--all']);
  const other = f.skill('other');
  const link = path.join(f.target, 'alpha');
  fs.unlinkSync(link);
  fs.symlinkSync(other, link, linkType);
  const before = f.manifest();
  f.run('update', ['--all'], 1);
  f.run('uninstall', ['--all'], 1);
  assert.equal(fs.realpathSync(link), fs.realpathSync(other));
  assert.deepEqual(f.manifest(), before);
  fs.unlinkSync(link);
  fs.mkdirSync(link);
  fs.writeFileSync(path.join(link, 'keep.txt'), 'keep');
  f.run('uninstall', ['--all'], 1);
  assert.equal(fs.readFileSync(path.join(link, 'keep.txt'), 'utf8'), 'keep');
});

test('forget removes missing-link records and is repeatable', t => {
  const f = fixture(t);
  f.skill('alpha');
  f.run('install', ['--all']);
  fs.unlinkSync(path.join(f.target, 'alpha'));
  assert.match(f.run('uninstall', ['--all']), /forget/);
  f.run('uninstall', ['--all']);
});

test('invalid names, corrupt manifests and overlapping paths fail before mutation', t => {
  const f = fixture(t);
  f.skill('alpha');
  f.run('install', ['--skill', '../alpha'], 1);
  assert.equal(fs.existsSync(f.target), false);
  const result = spawnSync(process.execPath, [script, 'install', '--source', f.source, '--target', path.join(f.source, 'target'), '--all'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(path.join(f.source, 'target')), false);
  fs.mkdirSync(f.target, { recursive: true });
  fs.writeFileSync(path.join(f.target, '.skill-links.json'), '{bad json');
  f.run('install', ['--all'], 1);
  assert.equal(fs.existsSync(path.join(f.target, 'alpha')), false);
});

test('other valid items complete despite a conflict', t => {
  const f = fixture(t);
  f.skill('alpha');
  f.skill('beta');
  fs.mkdirSync(path.join(f.target, 'alpha'), { recursive: true });
  f.run('install', ['--all'], 1);
  assert.deepEqual(Object.keys(f.manifest().skills), ['beta']);
});

test('lock and manifest-write failure leave links and source intact', t => {
  const f = fixture(t);
  const alpha = f.skill('alpha');
  fs.mkdirSync(f.target, { recursive: true });
  const lock = path.join(f.target, '.skill-links.lock');
  fs.writeFileSync(lock, 'another operation');
  f.run('install', ['--all'], 1);
  assert.equal(fs.existsSync(path.join(f.target, 'alpha')), false);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'another operation');
  fs.unlinkSync(lock);
  f.run('install', ['--all']);
  // Force manifest replacement to fail after link removal, to exercise rollback.
  const fake = path.join(f.root, 'fake-fs.mjs');
  fs.writeFileSync(fake, `import fs from 'node:fs'; const original = fs.renameSync; fs.renameSync = (...args) => { if (args[1].endsWith('.skill-links.json')) throw new Error('test write failure'); return original(...args); };`);
  const result = spawnSync(process.execPath, ['--import', fake, script, 'uninstall', '--source', f.source, '--target', f.target, '--all'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(path.join(f.target, 'alpha', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(alpha, 'SKILL.md')), true);
  assert.equal(f.manifest().skills.alpha.source, alpha);
});

test('source must be explicit regardless of script location or cwd', t => {
  const f = fixture(t);
  f.skill('alpha');
  const copy = path.join(f.source, 'link-skills.mjs');
  fs.copyFileSync(script, copy);
  const missing = spawnSync(process.execPath, [copy, 'install', '--target', f.target, '--all'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--source/);
  assert.equal(fs.existsSync(f.target), false);
  const ok = spawnSync(process.execPath, [copy, 'install', '--source', f.source, '--target', f.target, '--all'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(f.manifest().skills.alpha.source, path.join(f.source, 'alpha'));
});

test('path aliases cannot bypass overlap checks', t => {
  const f = fixture(t);
  f.skill('alpha');
  const alias = path.join(f.root, 'alias');
  fs.symlinkSync(f.source, alias, linkType);
  const result = spawnSync(process.execPath, [script, 'install', '--source', f.source, '--target', path.join(alias, 'target'), '--all'], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(fs.existsSync(path.join(f.source, 'target')), false);
});

test('failed manifest writes roll back new installs and source changes', t => {
  const f = fixture(t);
  f.skill('alpha');
  const fake = path.join(f.root, 'fail-save.mjs');
  fs.writeFileSync(fake, `import fs from 'node:fs'; fs.renameSync = () => { throw new Error('test write failure'); };`);
  const failRun = (command, source) => spawnSync(process.execPath, ['--import', fake, script, command, '--source', source, '--target', f.target, '--all'], { encoding: 'utf8' });
  const install = failRun('install', f.source);
  assert.equal(install.status, 1, install.stdout + install.stderr);
  assert.equal(fs.existsSync(path.join(f.target, 'alpha')), false);
  assert.equal(fs.existsSync(path.join(f.source, 'alpha', 'SKILL.md')), true);
  f.run('install', ['--all']);
  const newLibrary = path.join(f.root, 'new-library');
  f.skill('alpha', newLibrary);
  const update = failRun('update', newLibrary);
  assert.equal(update.status, 1, update.stdout + update.stderr);
  assert.equal(fs.realpathSync(path.join(f.target, 'alpha')), fs.realpathSync(path.join(f.source, 'alpha')));
  assert.equal(f.manifest().skills.alpha.source, path.join(f.source, 'alpha'));
  f.run('status');
});

test('Windows case collisions preserve the existing installation record', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  f.skill('alpha');
  f.run('install', ['--all']);
  f.run('install', ['--skill', 'Alpha'], 1);
  f.run('uninstall', ['--skill', 'Alpha'], 1);
  assert.deepEqual(Object.keys(f.manifest().skills), ['alpha']);
  f.run('status');
});
