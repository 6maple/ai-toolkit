import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/lsh.mjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lsh-test-'));
 const lib=path.join(root,'library');fs.mkdirSync(lib);
 const skill=(name, description='example', deps='')=>{
  const dir=path.join(lib,name);fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: '+name+'\ndescription: '+JSON.stringify(description)+'\n'+deps+'---\n\n# '+name+'\n');
  return dir;
 };
 const run=(...args)=>{
  const p=spawnSync(process.execPath,[cli,...args,'--library',lib],{encoding:'utf8'});
  return {exit:p.status,data:JSON.parse(p.status===0?p.stdout:p.stderr)};
 };
 const clean=()=>fs.rmSync(root,{recursive:true,force:true});
 return {root,lib,skill,run,clean};
}
test('read-only index, find and declared dependencies work',()=>{
 const f=fixture();try{
  f.skill('lark-shared','Shared permissions');
  f.skill('lark-doc','读取飞书文档','metadata:\n  requires:\n    skills: ["lark-shared"]\n');
  assert.equal(f.run('list').data.count,2);
  assert.equal(f.run('find','飞书文档').data.candidates[0].dir,'lark-doc');
  assert.deepEqual(f.run('inspect','lark-doc').data.dependencies,['lark-shared']);
  assert.equal(f.run('inspect','lark-shared').data.incoming[0].name,'lark-doc');
  assert.equal(f.run('index','--check').data.current,false);
  assert.equal(f.run('index','--write').data.changed,true);
  assert.equal(f.run('index','--check').data.current,true);
  assert.equal(f.run('index','--write').data.changed,false);
 }finally{f.clean();}
});
test('supporting references are discovered and cited by source file; removal requires approval',()=>{
 const f=fixture();try{
  f.skill('target');const consumer=f.skill('consumer');
  fs.mkdirSync(path.join(consumer,'references'));
  fs.writeFileSync(path.join(consumer,'references','manual.md'),'See ../../target/SKILL.md');
  const rel=f.run('inspect','target');
  assert.equal(rel.data.incoming[0].name,'consumer');
  assert.deepEqual(rel.data.incoming[0].files,['consumer/references/manual.md']);
  assert.equal(f.run('remove','target').data.coupling.length,1);
  assert.equal(f.run('remove','target','--apply').exit,1);
  assert.ok(fs.existsSync(path.join(f.lib,'target','SKILL.md')));
  const approved=f.run('remove','target','--apply','--ack-coupling');
  assert.equal(approved.exit,0);
  assert.ok(fs.existsSync(path.join(approved.data.archive,'SKILL.md')));
  assert.deepEqual(f.run('inspect','consumer').data.missing,['target']);
 }finally{f.clean();}
});
test('relative links to non-Skill docs do not become missing Skill dependencies',()=>{
 const f=fixture();try{
  const d=f.skill('consumer');
  fs.appendFileSync(path.join(d,'SKILL.md'),'\nSee ../client/todo/task and ../wiki/ and ../sheets/shtXXX.\n');
  const report=f.run('inspect','consumer').data;
  assert.deepEqual(report.crossPath,[]);
  assert.deepEqual(report.missing,[]);
 }finally{f.clean();}
});
test('Windows junction and symlinks cannot be removed, renamed or updated',()=>{
 const f=fixture();try{
  const outside=path.join(f.root,'outside');fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside,'SKILL.md'),'---\nname: linked\ndescription: external\n---\n');
  fs.symlinkSync(outside,path.join(f.lib,'linked'),process.platform==='win32'?'junction':'dir');
  for(const args of [['remove','linked','--apply'],['rename','linked','renamed','--apply'],['update','linked','--from',outside,'--apply']])
   assert.equal(f.run(...args).exit,1);
  assert.ok(fs.existsSync(path.join(f.lib,'linked','SKILL.md')));
  assert.ok(fs.existsSync(path.join(outside,'SKILL.md')));
 }finally{f.clean();}
});
test('YAML folded text and block list dependencies are complete',()=>{
 const f=fixture();try{
  f.skill('other');
  const d=f.skill('folded');
  fs.writeFileSync(path.join(d,'SKILL.md'),'---\nname: folded\ndescription: >\n  First responsibility\n\n  Second responsibility\nmetadata:\n  requires:\n    skills:\n      - other\n---\n\n# Folded\n');
  const s=f.run('inspect','folded');
  assert.equal(s.data.description,'First responsibility\n\nSecond responsibility');
  assert.deepEqual(s.data.dependencies,['other']);
  assert.equal(f.run('inspect','other').data.incoming[0].kind,'declared dependency');
 }finally{f.clean();}
});
test('read-only index failure rolls back create and keeps original index',()=>{
 const f=fixture();try{
  f.skill('one');f.run('index','--write');
  const index=path.join(f.lib,'llm.txt');
  fs.chmodSync(index,0o444);
  const operation=f.run('create','child','--description','child','--apply');
  assert.equal(operation.exit,1);
  assert.equal(fs.existsSync(path.join(f.lib,'child')),false);
  assert.equal(f.run('index','--check').data.current,true);
  fs.chmodSync(index,0o666);
 }finally{f.clean();}
});
test('read-only index failure rolls back rename and remove',()=>{
 const f=fixture();try{
  f.skill('one');f.run('index','--write');
  const index=path.join(f.lib,'llm.txt');fs.chmodSync(index,0o444);
  assert.equal(f.run('rename','one','two','--apply').exit,1);
  assert.equal(fs.existsSync(path.join(f.lib,'two')),false);
  assert.ok(fs.existsSync(path.join(f.lib,'one','SKILL.md')));
  assert.equal(f.run('remove','one','--apply').exit,1);
  assert.ok(fs.existsSync(path.join(f.lib,'one','SKILL.md')));
  assert.equal(f.run('index','--check').data.current,true);
  fs.chmodSync(index,0o666);
 }finally{f.clean();}
});
test('read-only index failure rolls back update; successful update archives previous version',()=>{
 const f=fixture();try{
  f.skill('one');f.run('index','--write');
  const src=path.join(f.root,'version');fs.mkdirSync(src);
  fs.writeFileSync(path.join(src,'SKILL.md'),'---\nname: one\ndescription: version two\n---\n');
  const index=path.join(f.lib,'llm.txt');fs.chmodSync(index,0o444);
  assert.equal(f.run('update','one','--from',src,'--apply').exit,1);
  assert.ok(!fs.readFileSync(path.join(f.lib,'one','SKILL.md'),'utf8').includes('version two'));
  assert.equal(f.run('index','--check').data.current,true);
  fs.chmodSync(index,0o666);
  const out=f.run('update','one','--from',src,'--apply');
  assert.equal(out.exit,0);
  assert.equal(fs.existsSync(path.join(out.data.archived,'SKILL.md')),true);
 }finally{f.clean();}
});
test('create/add remain opt in and avoid overwriting existing skill',()=>{
 const f=fixture();try{
  assert.equal(f.run('create','x','--description','hi').data.applied,false);
  assert.equal(fs.existsSync(path.join(f.lib,'x')),false);
  assert.equal(f.run('create','x','--description','hi','--apply').exit,0);
  assert.equal(f.run('create','x','--description','hi','--apply').exit,1);
  const from=path.join(f.root,'source');fs.mkdirSync(from);
  fs.writeFileSync(path.join(from,'SKILL.md'),'---\nname: imported\ndescription: hi\n---\n');
  assert.equal(f.run('add','imported','--from',from,'--apply').exit,0);
  assert.ok(fs.existsSync(path.join(f.lib,'imported','SKILL.md')));
 }finally{f.clean();}
});
test('lock prevents concurrent writes',()=>{
 const f=fixture();try{
  f.skill('one');
  fs.writeFileSync(path.join(f.lib,'.lsh-operation.lock'),'another process');
  assert.equal(f.run('create','new','--description','test','--apply').exit,1);
  assert.equal(fs.existsSync(path.join(f.lib,'new')),false);
 }finally{f.clean();}
});
test('install requires library and links only lsh, stores fixed absolute scope config',()=>{
 const f=fixture();try{
  f.skill('one');
  const project=path.join(f.root,'project');fs.mkdirSync(project);
  const invoke=(...args)=>{
   const p=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
   return {exit:p.status,data:JSON.parse(p.status===0?p.stdout:p.stderr)};
  };
  assert.equal(invoke('install','--project',project).exit,1);
  const preview=invoke('install','--project',project,'--library',f.lib);
  assert.equal(preview.exit,0);
  assert.equal(fs.existsSync(path.join(project,'.agents')),false);
  const ok=invoke('install','--project',project,'--library',f.lib,'--apply');
  assert.equal(ok.exit,0);
  assert.equal(ok.data.after.configured.library,f.lib);
  assert.equal(invoke('status','--project',project).data.links.agents.state,'linked');
  assert.equal(invoke('index','--check','--project',project).data.current,true);
  assert.equal(fs.existsSync(path.join(project,'.agents','skills','one')),false);
  const other=path.join(f.root,'other');fs.mkdirSync(other);
  assert.equal(invoke('install','--project',project,'--library',other,'--apply').exit,1);
  assert.equal(invoke('uninstall','--project',project,'--apply').exit,0);
  assert.equal(fs.existsSync(path.join(project,'.agents','skills','lsh')),false);
 }finally{f.clean();}
});
test('two project installs have independent fixed scope configuration and uninstall',()=>{
 const f=fixture();try{
  f.skill('one');
  const first=path.join(f.root,'first'),second=path.join(f.root,'second');
  fs.mkdirSync(first);fs.mkdirSync(second);
  const call=(...args)=>{
   const p=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
   return {exit:p.status,data:JSON.parse(p.status===0?p.stdout:p.stderr)};
  };
  assert.equal(call('install','--project',first,'--library',f.lib,'--apply').exit,0);
  assert.equal(call('install','--project',second,'--library',f.lib,'--apply').exit,0);
  assert.equal(call('uninstall','--project',first,'--apply').exit,0);
  assert.equal(call('status','--project',second).data.links.agents.state,'linked');
  assert.equal(call('index','--check','--project',second).data.current,true);
 }finally{f.clean();}
});
test('install refuses occupied target and preserves foreign data',()=>{
 const f=fixture();try{
  f.skill('one');
  const project=path.join(f.root,'project');fs.mkdirSync(project);
  const occupied=path.join(project,'.agents','skills','lsh');fs.mkdirSync(occupied,{recursive:true});
  const p=spawnSync(process.execPath,[cli,'install','--project',project,'--library',f.lib,'--apply'],{encoding:'utf8'});
  assert.equal(p.status,1);
  assert.equal(fs.existsSync(occupied),true);
 }finally{f.clean();}
});
