#!/usr/bin/env node
/*
 * lsh — manual-only local Skill helper (Node.js 18+; no npm dependencies).
 * AI/HUMAN: run --help, inspect INSTALL.md; install with
 * node "<lsh-script>" install --user --library "<private-library>" [--apply]
 * or replace --user with --project "<project-root>".
 * Install stores the absolute library path at scope/.agents/lsh.json.
 * lsh never deploys ordinary private Skills into an Agent discovery folder.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const NAME='lsh',SOURCE=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LINK_TYPE=process.platform==='win32'?'junction':'dir';
const ARCHIVE='.lsh-archive',LOCK='.lsh-operation.lock';
const TEXT_EXT=new Set(['.md','.txt','.yaml','.yml','.json','.mjs','.js']);
const EXCLUDED=new Set(['.git','node_modules','dist','__pycache__']);
const HELP=[
 'lsh (Node.js 18+, no npm dependencies)',
 'node "<lsh>/scripts/lsh.mjs" <command> [args] [options]',
 'Install and fix the private Skill library path:',
 '  install --user --library "<private-library>" [--apply]',
 '  install --project "<project-root>" --library "<private-library>" [--apply]',
 '  status | uninstall [--user | --project "<project-root>"] [--apply]',
 'Read: list | find "<query>" | inspect <skill> | audit [skill]',
 'Manage: create <name> --description "<purpose>" [--apply]',
 '        add <name> --from "<skill-dir>" [--apply]',
 '        update <name> --from "<skill-dir>" [--apply]',
 '        rename <old> <new> [--apply] [--ack-coupling]',
 '        remove <name> [--apply] [--ack-coupling]',
 'The selected user/project scope stores .agents/lsh.json with its absolute library.',
 'All changes preview until --apply. Skills are discovered directly from the private library.',
 '--library overrides the installed library on read/manage commands only if specified.',
 'Only lsh is exposed to host discovery; normal Skills remain in the private library.',
 'Extra: scripts/link-skills.mjs install|update|uninstall|status --source <private-library> --target <host-skill-dir>',
 'Read INSTALL.md and LINK-SKILLS.md for full human/AI instructions.'
].join('\n');
function parseArgs(argv) {
 const o={positional:[]},keys=new Set(['--library','--from','--description','--project']);
 const flags=new Set(['--apply','--ack-coupling','--user','--help','-h']);
 for(let i=0;i<argv.length;i++){
  const s=argv[i];
  if(keys.has(s)){const k=s.slice(2),v=argv[++i];if(!v||v.startsWith('--')||Object.hasOwn(o,k))throw Error('Invalid or duplicate '+s);o[k]=v;}
  else if(flags.has(s))o[s.replace(/^-+/,'')]=true;
  else if(s.startsWith('-'))throw Error('Unknown option: '+s);
  else o.positional.push(s);
 }
 if(o.user&&o.project)throw Error('Choose --user or --project');
 if(o.library)o.library=path.resolve(o.library);
 return o;
}
function checkName(n){
 if(typeof n!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(n)||n.endsWith('.')||
 /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(n))throw Error('Invalid Skill name: '+n);
 return n;
}
function stat(f){try{return fs.lstatSync(f);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function isDir(f){try{return fs.statSync(f).isDirectory();}catch{return false;}}
function isSkill(f){return isDir(f)&&!!stat(path.join(f,'SKILL.md'))?.isFile();}
function key(f){const n=path.normalize(path.resolve(f));return process.platform==='win32'?n.toLowerCase():n;}
function within(a,b){const r=path.relative(key(a),key(b));return r===''||(r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r));}
function yamlScalar(v){
 const t=v.trim();
 if(t.startsWith('"')){try{return JSON.parse(t);}catch{throw Error('Malformed quoted YAML value: '+t.slice(0,50));}}
 if(t.startsWith("'")){if(!t.endsWith("'"))throw Error('Malformed single-quoted YAML value');return t.slice(1,-1).replaceAll("''","'");}
 if(t.startsWith('[')||t.startsWith('{'))throw Error('Unsupported YAML scalar: '+t.slice(0,50));
 return t.replace(/\s+#.*$/,'');
}
function yamlInlineArray(v){
 const s=v.trim();
 if(!s.startsWith('[')||!s.endsWith(']'))throw Error('Unsupported YAML inline skills list');
 const raw=s.slice(1,-1).trim();
 if(!raw)return [];
 return (raw.match(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,]+/g)||[]).map(yamlScalar).filter(Boolean);
}
function meta(body){
 const m=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
 if(!m)throw Error('Missing YAML frontmatter');
 const lines=m[1].split(/\r?\n/);
 const fields={};
 for(let i=0;i<lines.length;i++){
  const x=/^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(lines[i]);
  if(!x||!['name','description'].includes(x[1]))continue;
  const v=(x[2]||'').trim();
  if(/^[>|][-+0-9]*$/.test(v)){
   const chunks=[];
   while(i+1<lines.length&&(!lines[i+1].trim()||/^\s/.test(lines[i+1])))chunks.push(lines[++i]);
   const populated=chunks.filter(s=>s.trim());
   const indent=populated.length?Math.min(...populated.map(s=>/^\s*/.exec(s)[0].length)):0;
   const dedent=chunks.map(s=>s.trim()?s.slice(indent):'');
   if(v[0]==='|')fields[x[1]]=dedent.join('\n').trimEnd();
   else{
    let par=[],words=[];
    for(const line of dedent){
     if(line===''){par.push(words.join(' '),'');words=[];}
     else words.push(line.trim());
    }
    par.push(words.join(' '));fields[x[1]]=par.join('\n').trim();
   }
  }else fields[x[1]]=yamlScalar(v);
 }
 const deps=[];
 const req=lines.findIndex(x=>/^\s+requires:\s*(?:#.*)?$/.test(x));
 if(req>=0){
  const reqIndent=/^\s*/.exec(lines[req])[0].length;
  for(let i=req+1;i<lines.length;i++){
   const line=lines[i],level=/^\s*/.exec(line)[0].length;
   if(line.trim()&&level<=reqIndent)break;
   const k=/^\s+skills:\s*(.*)$/.exec(line);if(!k)continue;
   const spec=k[1].trim();
   if(spec.startsWith('['))deps.push(...yamlInlineArray(spec));
   else if(!spec||spec.startsWith('#')){
    for(let j=i+1;j<lines.length;j++){
     if(!lines[j].trim())continue;
     if(/^\s*/.exec(lines[j])[0].length<=level)break;
     const item=/^\s*-\s+(.+)$/.exec(lines[j]);
     if(!item)throw Error('Unsupported metadata.requires.skills block list');
     deps.push(yamlScalar(item[1]));
    }
   }else throw Error('Unsupported metadata.requires.skills format');
   break;
  }
 }
 if(!fields.name)throw Error('YAML frontmatter requires name');
 checkName(fields.name);
 return {name:fields.name,description:fields.description||'',dependencies:[...new Set(deps)]};
}
function filesIn(dir){
 const out=[];
 const visit=d=>{
  for(const entry of fs.readdirSync(d,{withFileTypes:true})){
   if(entry.name.startsWith('.')||EXCLUDED.has(entry.name))continue;
   const f=path.join(d,entry.name),s=stat(f);
   if(s.isSymbolicLink())continue;
   if(s.isDirectory())visit(f);
   else if(s.isFile()&&s.size<=1024*1024&&TEXT_EXT.has(path.extname(f).toLowerCase()))out.push(f);
  }
 };
 visit(dir);return out;
}
function scan(root,detailed=true){
 if(!isDir(root))throw Error('Private library missing: '+root);
 const result=[];
 for(const item of fs.readdirSync(root,{withFileTypes:true})){
  if(item.name.startsWith('.')||['lsh','local-skill-helper'].includes(item.name))continue;
  const d=path.join(root,item.name);
  if(!isSkill(d))continue;
  const body=fs.readFileSync(path.join(d,'SKILL.md'),'utf8');
  let data;try{data=meta(body);}catch(e){throw Error(item.name+'/SKILL.md: '+e.message);}
  if(data.name!==item.name)throw Error('Skill directory/frontmatter name mismatch: '+item.name+' / '+data.name);
  result.push({dir:item.name,name:data.name,description:data.description,
   path:path.join(d,'SKILL.md'),sourcePath:path.join(fs.realpathSync(d),'SKILL.md'),
   dependencies:data.dependencies,texts:detailed?filesIn(d).map(f=>({file:f,body:fs.readFileSync(f,'utf8')})):[],
   crossPath:[],mentions:[],related:[],references:[]});
 }
 result.sort((a,b)=>a.dir.localeCompare(b.dir,'en'));
 if(!detailed)return result;
 const names=result.map(s=>s.dir);
 for(const skill of result){
  const refs=[],mentions=new Set();
  for(const item of skill.texts){
   const source=path.relative(root,item.file).replaceAll(path.sep,'/');
   for(const m of item.body.matchAll(/(?:\.\.\/)+[a-zA-Z0-9][a-zA-Z0-9._/-]*/g)){
    const dest=path.resolve(path.dirname(item.file),m[0].replaceAll('/',path.sep));
    if(!within(root,dest))continue;
    const part=path.relative(root,dest).split(path.sep)[0];
    if(!part||part===skill.dir||part.startsWith('.'))continue;
    // Relative URLs like ../wiki/ and ../client/... are not necessarily Skills.
    // A target is a Skill when it exists, or when a missing target is named by
    // an explicit SKILL.md reference. Declared requires.skills are separate.
    if(!names.includes(part)&&!/(?:^|\/)SKILL\.md(?:$|[#?])/i.test(m[0]))continue;
    refs.push({target:part,file:source,path:m[0]});
   }
   for(const n of names)if(n!==skill.dir&&item.body.includes(n))mentions.add(n);
  }
  skill.references=[...new Map(refs.map(r=>[r.file+'|'+r.target+'|'+r.path,r])).values()];
  skill.crossPath=[...new Set(refs.map(r=>r.target))];
  skill.mentions=[...mentions];
  skill.related=[...new Set([...skill.dependencies,...skill.crossPath,...skill.mentions])];
 }
 return result;
}
function info(s){const {texts,...rest}=s;return rest;}
function searchTerms(query){
 const input=query.toLowerCase().trim(),out=new Set([input]);
 for(const chunk of input.match(/[\p{Script=Han}]+|[a-z0-9_-]+/gu)||[]){
  out.add(chunk);
  if(/^\p{Script=Han}+$/u.test(chunk)&&chunk.length>2)
   for(let i=0;i<chunk.length-1;i++)out.add(chunk.slice(i,i+2));
 }
 return [...out].filter(word=>word.length>1);
}
function briefInspect(skills,name){
 const r=inspect(skills,name);
 return {path:r.dir+'/SKILL.md',sourcePath:r.sourcePath,
  description:r.description.slice(0,200),dependencies:r.dependencies,
  crossPath:r.crossPath,related:r.related,incoming:r.incoming.map(({name,kind})=>({path:name+'/SKILL.md',kind})),
  missing:r.missing,warning:r.warning};
}
function inspect(skills,name){
 const t=skills.find(s=>s.dir.toLowerCase()===String(name).toLowerCase());
 if(!t)throw Error('Skill not found: '+name);
 const incoming=skills.filter(s=>s.dir!==t.dir&&s.related.includes(t.dir)).map(s=>({
  name:s.dir,
  kind:s.dependencies.includes(t.dir)?'declared dependency':s.crossPath.includes(t.dir)?'relative path':'mention',
  files:s.references.filter(r=>r.target===t.dir).map(r=>r.file)
 }));
 const missing=[...new Set([...t.dependencies,...t.crossPath])].filter(n=>!skills.some(s=>s.dir===n));
 return {...info(t),incoming,missing,warning:'Textual evidence only; examine original files for semantic coupling.'};
}
function available(root,name){
 checkName(name);
 const conflict=fs.readdirSync(root).find(n=>n.toLowerCase()===name.toLowerCase());
 if(conflict)throw Error('Name already exists: '+conflict);
}
function skillPath(root,name){return path.join(root,checkName(name));}
function original(root,name){
 const d=skillPath(root,name);
 if(!isSkill(d))throw Error('Skill missing: '+name);
 if(stat(d).isSymbolicLink())
  throw Error('Skill is a linked directory: '+d+'. For links recorded in .skill-links.json, use the bundled scripts/link-skills.mjs with explicit --source and --target; otherwise use the original link manager. Edit Skill content at its source.');
 return d;
}
function sourceFolder(from,dest,name){
 if(!from)throw Error('Missing --from');
 const src=path.resolve(from);
 if(!isSkill(src)||stat(src).isSymbolicLink())throw Error('Source must be an original Skill directory');
 if(within(fs.realpathSync(src),dest))throw Error('Destination must be outside source');
 if(meta(fs.readFileSync(path.join(src,'SKILL.md'),'utf8')).name!==name)throw Error('Source Skill name mismatch: '+name);
 return src;
}
function requireApproval(skills,name,o){
 const r=inspect(skills,name);
 if(o.apply&&r.incoming.length&&!o['ack-coupling'])
  throw Error('References exist; inspect incoming files and receive explicit approval before --ack-coupling');
 return r;
}
function withLock(root,fn){
 const file=path.join(root,'.lsh-operation.lock');
 let fd;try{fd=fs.openSync(file,'wx');}
 catch(e){if(e.code==='EEXIST')throw Error('Private library is locked: '+file);throw e;}
 try{fs.writeSync(fd,String(process.pid));return fn();}
 finally{fs.closeSync(fd);fs.unlinkSync(file);}
}
function stagePath(root){return path.join(root,'.lsh-stage-'+process.pid+'-'+Math.random().toString(36).slice(2));}
function archivePath(root,name){return path.join(root,'.lsh-archive',name+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);}
function clean(file){if(stat(file))fs.rmSync(file,{recursive:true,force:true});}
function rollback(error,undo){
 try{undo();}catch(e){throw Error(error.message+'; rollback failed: '+e.message+'; manual recovery required');}
 throw error;
}
function create(root,name,o){
 available(root,name);if(!o.description)throw Error('create needs --description');
 const dest=skillPath(root,name),res={action:'create',target:dest,applied:!!o.apply};
 if(!o.apply)return res;
 const tmp=stagePath(root);
 try{
  fs.mkdirSync(tmp);
  fs.writeFileSync(path.join(tmp,'SKILL.md'),'---\nname: '+name+'\ndescription: '+JSON.stringify(o.description)+
    '\n---\n\n# '+name+'\n\n## 适用范围\n\n'+o.description+
    '\n\n## 使用方法\n\n（填写步骤和依赖）\n');
  fs.renameSync(tmp,dest);
  return res;
 }finally{clean(tmp);}
}
function add(root,name,o){
 available(root,name);
 const dest=skillPath(root,name),src=sourceFolder(o.from,dest,name);
 const res={action:'add',from:src,dest,applied:!!o.apply};if(!o.apply)return res;
 const tmp=stagePath(root);
 try{
  fs.cpSync(src,tmp,{recursive:true,force:false,errorOnExist:true});
  fs.renameSync(tmp,dest);
  return res;
 }finally{clean(tmp);}
}
function update(root,name,o,skills){
 const dest=original(root,name),src=sourceFolder(o.from,dest,name),before=inspect(skills,name);
 const res={action:'update',from:src,dest,existing:before,applied:!!o.apply};
 if(!o.apply)return res;
 const tmp=stagePath(root),archive=archivePath(root,name);
 let archived=false,published=false;
 try{
  fs.cpSync(src,tmp,{recursive:true,force:false,errorOnExist:true});
  fs.mkdirSync(path.dirname(archive),{recursive:true});
  fs.renameSync(dest,archive);archived=true;
  fs.renameSync(tmp,dest);published=true;
  res.archived=archive;
  return res;
 }catch(e){
  if(archived)rollback(e,()=>{
   if(published)fs.renameSync(dest,tmp);
   fs.renameSync(archive,dest);
  });
  throw e;
 }finally{clean(tmp);}
}
function rename(root,oldName,newName,o,skills){
 const from=original(root,oldName);available(root,newName);
 const rel=requireApproval(skills,oldName,o),to=skillPath(root,newName);
 const res={action:'rename',from,to,coupling:rel.incoming,applied:!!o.apply};
 if(!o.apply)return res;
 const body=fs.readFileSync(path.join(from,'SKILL.md'),'utf8');
 const next=body.replace(/^(---\r?\n[\s\S]*?^name:\s*).+$/m,(_,prefix)=>prefix+newName);
 if(next===body)throw Error('Could not update frontmatter name');
 fs.renameSync(from,to);
 try{fs.writeFileSync(path.join(to,'SKILL.md'),next);}
 catch(e){rollback(e,()=>{
  fs.writeFileSync(path.join(to,'SKILL.md'),body);
  fs.renameSync(to,from);
 });}
 return res;
}
function remove(root,name,o,skills){
 const from=original(root,name),rel=requireApproval(skills,name,o),archive=archivePath(root,name);
 const res={action:'remove',from,archive,coupling:rel.incoming,applied:!!o.apply};
 if(!o.apply)return res;
 fs.mkdirSync(path.dirname(archive),{recursive:true});
 fs.renameSync(from,archive);
 return res;
}
function cfgPath(o){
 const base=o.project?path.resolve(o.project):os.homedir();
 return path.join(base,'.agents','lsh.json');
}
function getConfig(o){
 const f=cfgPath(o);if(!stat(f))return null;
 if(stat(f).isSymbolicLink())throw Error('Config must be regular file: '+f);
 const c=JSON.parse(fs.readFileSync(f,'utf8'));
 if(c?.version!==1||typeof c.library!=='string'||!path.isAbsolute(c.library))
  throw Error('Invalid lsh installation config: '+f);
 return c;
}
function resolveLibrary(o){
 if(o.library)return o.library;
 const c=getConfig(o);
 if(!c)throw Error('lsh is not installed for this scope. Run install --library <private-folder> --user --apply');
 if(!isDir(c.library))throw Error('Private library missing or not a directory: '+c.library);
 return c.library;
}
function linkStatus(file){
 const s=stat(file);if(!s)return {path:file,state:'absent'};
 if(!s.isSymbolicLink())return {path:file,state:'conflict-real-path'};
 try{
  const target=fs.realpathSync(file);
  return {path:file,state:key(target)===key(SOURCE)?'linked':'conflict-link',target};
 }catch(e){return {path:file,state:'broken-link',error:e.message};}
}
function targets(o){
 const root=o.project?path.resolve(o.project):os.homedir();
 return {agents:path.join(root,'.agents','skills','lsh'),claude:path.join(root,'.claude','skills','lsh')};
}
function installState(o){
 const links=targets(o),configured=getConfig(o);
 return {configPath:cfgPath(o),configured,
  libraryState:configured?(isDir(configured.library)?'available':'unavailable'):'unconfigured',targets:links,
  links:{agents:linkStatus(links.agents),claude:linkStatus(links.claude)}};
}
function install(o){
 if(!o.library)throw Error('install requires --library <private-library>');
 if(!isDir(o.library))throw Error('Library not found: '+o.library);
 if(o.project&&!isDir(path.resolve(o.project)))throw Error('Project root not found');
 const state=installState(o);
 if(state.configured&&key(state.configured.library)!==key(o.library))
  throw Error('Installed library is '+state.configured.library+'; uninstall before changing it');
 for(const s of Object.values(state.links))
  if(!['absent','linked'].includes(s.state))throw Error('Conflicting link: '+s.path+' ('+s.state+')');
 const res={action:'install',library:o.library,config:state.configPath,links:state.links,applied:!!o.apply};
 if(!o.apply)return res;
 const created=[];
 try{
  const a=state.targets.agents,c=state.targets.claude;
  if(state.links.agents.state==='absent'){fs.mkdirSync(path.dirname(a),{recursive:true});fs.symlinkSync(SOURCE,a,LINK_TYPE);created.push(a);}
  if(state.links.claude.state==='absent'){fs.mkdirSync(path.dirname(c),{recursive:true});fs.symlinkSync(a,c,LINK_TYPE);created.push(c);}
  if(!state.configured){
   fs.mkdirSync(path.dirname(state.configPath),{recursive:true});
   fs.writeFileSync(state.configPath,JSON.stringify({version:1,library:o.library},null,2)+'\n',{flag:'wx'});
   created.push(state.configPath);
  }
 }catch(e){
  for(const f of created.reverse()){
   if(f===state.configPath){if(stat(f))fs.unlinkSync(f);}
   else if(linkStatus(f).state==='linked')fs.unlinkSync(f);
  }
  throw e;
 }
 res.after=installState(o);
 return res;
}
function uninstall(o){
 const state=installState(o);
 const res={action:'uninstall',config:state.configPath,links:state.links,applied:!!o.apply};
 if(!o.apply)return res;
 if(!state.configured)throw Error('No lsh installation config');
 for(const s of Object.values(state.links))
  if(s?.state!=='linked')throw Error('Changed or missing link; refusing to uninstall: '+s?.path);
 for(const f of [state.targets.claude,state.targets.agents])fs.unlinkSync(f);
 fs.unlinkSync(state.configPath);
 return res;
}
function run(o){
 const [command,...args]=o.positional;
 if(!command||o.help||command==='help')return {help:HELP};
 if(command==='install')return install(o);
 if(command==='uninstall')return uninstall(o);
 if(command==='status'){
  const state=installState(o);
  return {action:'status',...state};
 }
 const root=resolveLibrary(o);
 if(command==='list'){
  const skills=scan(root,false);
  return {library:root,count:skills.length,paths:skills.map(s=>s.dir+'/SKILL.md')};
 }
 if(command==='find'){
  const q=args.join(' ').trim();if(!q)throw Error('find needs a query');
  const skills=scan(root,false),terms=searchTerms(q);
  const ranked=skills.map(s=>{
   const name=s.dir.toLowerCase(),description=s.description.toLowerCase(),raw=q.toLowerCase();
   let score=(name.includes(raw)?40:0)+(description.includes(raw)?24:0);
   let pathMatch=false,descriptionMatch=false;
   for(const t of terms){
    if(name.includes(t)){score+=7+Math.min(t.length,5);pathMatch=true;}
    else if(description.includes(t)){score+=2+Math.min(t.length,4);descriptionMatch=true;}
   }
   return {path:s.dir+'/SKILL.md',score,
    reason:pathMatch&&descriptionMatch?'路径和用途匹配':pathMatch?'路径匹配':'用途匹配'};
  }).filter(s=>s.score>0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path,'en'));
  return {query:q,count:ranked.length,candidates:ranked.slice(0,5).map(({path,reason})=>({path,reason})),
   more:ranked.length>5};
 }
 const skills=scan(root);
 if(command==='inspect'){if(args.length!==1)throw Error('inspect needs one Skill');return briefInspect(skills,args[0]);}
 if(command==='audit'){
  const relevant=args.length?skills.filter(s=>s.dir===args[0]):skills;
  if(args.length&&!relevant.length)throw Error('Unknown Skill: '+args[0]);
  return {library:root,checked:relevant.length,reports:relevant.map(s=>inspect(skills,s.dir))};
 }
 if(['create','add','update','rename','remove'].includes(command)){
  const action=()=>{
   const current=o.apply?scan(root):skills;
   if(command==='create')return create(root,args[0],o);
   if(command==='add')return add(root,args[0],o);
   if(command==='update')return update(root,args[0],o,current);
   if(command==='rename')return rename(root,args[0],args[1],o,current);
   return remove(root,args[0],o,current);
  };
  return o.apply?withLock(root,action):action();
 }
 throw Error('Unknown command: '+command);
}
try{
 const out=run(parseArgs(process.argv.slice(2)));
 console.log(JSON.stringify(out,null,2).replace(/[^\x00-\x7F]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
}catch(e){
 console.error(JSON.stringify({ok:false,error:e.message},null,2).replace(/[^\x00-\x7F]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
 process.exitCode=1;
}
