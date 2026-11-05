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
test('live paths, bounded results and declared dependencies work without an index file',()=>{
 const f=fixture();try{
  f.skill('doc-core','Shared document permissions');
  f.skill('doc-reader','读取在线文档','metadata:\n  requires:\n    skills: ["doc-core"]\n');
  const paths=f.run('list').data;
  assert.equal(paths.count,2);
  assert.deepEqual(paths.paths,['doc-core/SKILL.md','doc-reader/SKILL.md']);
  const match=f.run('find','在线文档').data.candidates[0];
  assert.equal(match.path,'doc-reader/SKILL.md');
  assert.deepEqual(Object.keys(match).sort(),['path','reason']);
  assert.deepEqual(f.run('inspect','doc-reader').data.dependencies,['doc-core']);
  assert.equal(f.run('inspect','doc-core').data.incoming[0].path,'doc-reader/SKILL.md');
  assert.equal(fs.existsSync(path.join(f.lib,'llm.txt')),false);
  assert.equal(f.run('index').exit,1);
 }finally{f.clean();}
});
test('supporting references are discovered and cited by source file; removal requires approval',()=>{
 const f=fixture();try{
  f.skill('target');const consumer=f.skill('consumer');
  fs.mkdirSync(path.join(consumer,'references'));
  fs.writeFileSync(path.join(consumer,'references','manual.md'),'See ../../target/SKILL.md');
  const rel=f.run('inspect','target');
  assert.equal(rel.data.incoming[0].path,'consumer/SKILL.md');
  const details=f.run('audit','target').data.reports[0];
  assert.deepEqual(details.incoming[0].files,['consumer/references/manual.md']);
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
test('search uses library metadata and limits generic text matches to five brief paths',()=>{
 const f=fixture();try{
  f.skill('doc-reader','文档读取与访问权限配置');
  f.skill('asset-manager','素材文件上传与管理');
  f.skill('diagram-editor','Draw technical diagrams');
  for(let i=0;i<7;i++)f.skill('conversion-tool'+i,'文档格式转换工具');
  const specific=f.run('find','访问权限').data;
  assert.deepEqual(specific.candidates.map(c=>c.path),['doc-reader/SKILL.md']);
  assert.equal(specific.count,1);
  assert.equal(specific.more,false);
  const english=f.run('find','diagram').data;
  assert.deepEqual(english.candidates.map(c=>c.path),['diagram-editor/SKILL.md']);
  const broad=f.run('find','文档').data;
  assert.equal(broad.count,8);
  assert.equal(broad.candidates.length,5);
  assert.equal(broad.more,true);
  for(const c of broad.candidates)assert.deepEqual(Object.keys(c).sort(),['path','reason']);
  assert.ok(JSON.stringify(broad).length<1000);
 }finally{f.clean();}
});
test('legacy llm.txt is untouched by install and private library mutations',()=>{
 const f=fixture();try{
  const old=path.join(f.lib,'llm.txt'),text='personal notes, never overwrite';
  fs.writeFileSync(old,text);
  f.skill('one');
  assert.equal(f.run('create','child','--description','child','--apply').exit,0);
  assert.equal(f.run('rename','child','kid','--apply').exit,0);
  const removed=f.run('remove','kid','--apply');
  assert.equal(removed.exit,0);
  assert.ok(fs.existsSync(path.join(removed.data.archive,'SKILL.md')));
  assert.equal(fs.readFileSync(old,'utf8'),text);
  const src=path.join(f.root,'version');fs.mkdirSync(src);
  fs.writeFileSync(path.join(src,'SKILL.md'),'---\nname: one\ndescription: version two\n---\n');
  const out=f.run('update','one','--from',src,'--apply');
  assert.equal(out.exit,0);
  assert.equal(fs.existsSync(path.join(out.data.archived,'SKILL.md')),true);
  assert.equal(fs.readFileSync(old,'utf8'),text);
 }finally{f.clean();}
});
test('no index file is created while managing Skills',()=>{
 const f=fixture();try{
  f.skill('one');
  assert.equal(f.run('create','two','--description','test','--apply').exit,0);
  assert.equal(f.run('rename','two','three','--apply').exit,0);
  assert.equal(f.run('remove','three','--apply').exit,0);
  assert.equal(fs.existsSync(path.join(f.lib,'llm.txt')),false);
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
  assert.equal(ok.data.after.libraryState,'available');
  assert.equal(invoke('status','--project',project).data.links.agents.state,'linked');
  assert.equal(fs.existsSync(path.join(project,'.agents','skills','lsh','scripts','link-skills.mjs')),true);
  assert.equal(fs.existsSync(path.join(project,'.claude','skills','lsh','scripts','link-skills.mjs')),true);
  assert.equal(fs.existsSync(path.join(f.lib,'llm.txt')),false);
  assert.equal(fs.existsSync(path.join(project,'.agents','skills','one')),false);
  const other=path.join(f.root,'other');fs.mkdirSync(other);
  assert.equal(invoke('install','--project',project,'--library',other,'--apply').exit,1);
  assert.equal(invoke('uninstall','--project',project,'--apply').exit,0);
  assert.equal(fs.existsSync(path.join(project,'.agents','skills','lsh')),false);
 }finally{f.clean();}
});
test('missing private library remains inspectable and can be safely uninstalled',()=>{
 const f=fixture();try{
  const project=path.join(f.root,'project'),changed=path.join(f.root,'changed');
  fs.mkdirSync(project);fs.mkdirSync(changed);
  const call=(scope,...args)=>{
   const p=spawnSync(process.execPath,[cli,...args,'--project',scope],{encoding:'utf8'});
   return {exit:p.status,data:JSON.parse(p.status===0?p.stdout:p.stderr)};
  };
  assert.equal(call(project,'install','--library',f.lib,'--apply').exit,0);
  assert.equal(call(changed,'install','--library',f.lib,'--apply').exit,0);
  const moved=path.join(f.root,'moved-library');
  fs.renameSync(f.lib,moved);
  const status=call(project,'status');
  assert.equal(status.exit,0);
  assert.equal(status.data.configured.library,f.lib);
  assert.equal(status.data.libraryState,'unavailable');
  assert.equal(status.data.links.agents.state,'linked');
  assert.equal(status.data.links.claude.state,'linked');
  const unavailable=call(project,'list');
  assert.equal(unavailable.exit,1);
  assert.match(unavailable.data.error,/Private library missing/);
  assert.equal(call(project,'install','--library',moved,'--apply').exit,1);

  const preview=call(project,'uninstall');
  assert.equal(preview.exit,0);
  assert.equal(preview.data.applied,false);
  assert.ok(fs.existsSync(path.join(project,'.agents','lsh.json')));

  const foreign=path.join(changed,'.claude','skills','lsh');
  fs.unlinkSync(foreign);
  fs.symlinkSync(moved,foreign,process.platform==='win32'?'junction':'dir');
  const refused=call(changed,'uninstall','--apply');
  assert.equal(refused.exit,1);
  assert.match(refused.data.error,/Changed or missing link/);
  assert.equal(fs.realpathSync(foreign),fs.realpathSync(moved));
  assert.ok(fs.existsSync(path.join(changed,'.agents','lsh.json')));

  assert.equal(call(project,'uninstall','--apply').exit,0);
  assert.ok(!fs.existsSync(path.join(project,'.agents','lsh.json')));
  assert.ok(!fs.existsSync(path.join(project,'.agents','skills','lsh')));
  assert.ok(!fs.existsSync(path.join(project,'.claude','skills','lsh')));
  assert.ok(fs.existsSync(moved));
 }finally{f.clean();}
});

test('malformed lsh installation config still blocks status and uninstall',()=>{
 const f=fixture();try{
  const project=path.join(f.root,'project'),agents=path.join(project,'.agents');
  fs.mkdirSync(agents,{recursive:true});
  const config=path.join(agents,'lsh.json');
  fs.writeFileSync(config,JSON.stringify({version:1,library:42}));
  for(const command of ['status','uninstall']){
   const p=spawnSync(process.execPath,[cli,command,'--project',project,'--apply'],{encoding:'utf8'});
   assert.equal(p.status,1);
   assert.match(JSON.parse(p.stderr).error,/Invalid lsh installation config/);
  }
  assert.ok(fs.existsSync(config));
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
  assert.equal(fs.existsSync(path.join(f.lib,'llm.txt')),false);
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

test('skill router references task-specific guides without embedding management steps',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const entry=fs.readFileSync(path.join(root,'SKILL.md'),'utf8');
 const use=fs.readFileSync(path.join(root,'references','use.md'),'utf8');
 const manage=fs.readFileSync(path.join(root,'references','manage.md'),'utf8');
 assert.match(entry,/references\/use\.md/);
 assert.match(entry,/references\/manage\.md/);
 assert.match(entry,/把普通 Skill 链接到宿主或解除链接/);
 assert.match(entry,/安装、卸载 `lsh` 自身入口/);
 assert.doesNotMatch(entry,/--apply|--ack-coupling|index --check|llm\.txt/);
 assert.doesNotMatch(use,/--apply|--ack-coupling|index --check|llm\.txt/);
 assert.match(manage,/--ack-coupling/);
 assert.match(manage,/scripts\/link-skills\.mjs/);
 assert.match(manage,/--source/);
});

test('bundled link manager is self-contained and requires the configured source',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const script=path.join(root,'scripts','link-skills.mjs');
 const guide=path.join(root,'LINK-SKILLS.md');
 assert.ok(fs.statSync(script).isFile());
 assert.ok(fs.statSync(guide).isFile());
 const f=fixture();try{
  f.skill('sample','sample fixture');
  const target=path.join(f.root,'host','skills');
  const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
  const help=run('--help');
  assert.equal(help.status,0);
  assert.match(help.stdout,/--source/);
  const missing=run('install','--target',target,'--skill','sample','--dry-run');
  assert.equal(missing.status,1);
  assert.ok(!fs.existsSync(target));
  const preview=run('install','--source',f.lib,'--target',target,'--skill','sample','--dry-run');
  assert.equal(preview.status,0,preview.stderr);
  assert.match(preview.stdout,/dry-run create/);
  assert.ok(!fs.existsSync(target));
 }finally{f.clean();}
});
