/** Standalone Node verifier: trust the closure hash pinned by the consumer,
 * never a hash supplied solely by the untrusted distribution being checked. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const MANIFEST='engine-manifest.json';
const BEHAVIOR=['client/engine.mjs','client/replay.mjs','client/player/replica-backend.mjs','client/store.mjs','client/player/study-sessions.mjs','client/app/local-budget.mjs','client/app/corpus-inventory.mjs','client/storage/indexeddb.mjs','client/sync.mjs'];
export const canonicalManifest=value=>JSON.stringify(sortObject(value));
function sortObject(value){return Array.isArray(value)?value.map(sortObject):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort(compare).map(key=>[key,sortObject(value[key])])):value;}
export function verifyEngineDistribution(directory,{expectedClosureSha256,requireCommitted=true}={}) {
 const root=resolve(directory);
 check(/^[a-f0-9]{64}$/.test(expectedClosureSha256??''),'engine-expected-closure-required');
 check(realpathSync(root)===root&&lstatSync(root).isDirectory(),'engine-distribution-root');
 const inventory=(path=root)=>readdirSync(path,{withFileTypes:true}).flatMap(entry=>{
  const full=resolve(path,entry.name);check(!entry.isSymbolicLink(),'engine-distribution-symlink');
  if(entry.isDirectory())return inventory(full);
  check(entry.isFile(),'engine-distribution-nonfile');return [relative(root,full).replaceAll('\\','/')];
 }).sort(compare);
 const actual=inventory(),manifest=JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8'));
 check(manifest.format==='nihongo-study-engine-distribution/v1'&&Array.isArray(manifest.files),'engine-manifest-format');
 check(!requireCommitted||(manifest.source?.mode==='committed'&&Array.isArray(manifest.source.changedFiles)&&manifest.source.changedFiles.length===0&&/^[a-f0-9]{40}$/.test(manifest.source.commit)),'engine-uncommitted-distribution');
 const paths=[];
 for(const record of manifest.files){
  check(record&&typeof record.path==='string'&&/^[A-Za-z0-9._/-]+$/.test(record.path)&&!record.path.startsWith('/')&&!record.path.split('/').some(p=>!p||p==='.'||p==='..')&&record.path!==MANIFEST,'engine-manifest-path');
  check(Number.isSafeInteger(record.bytes)&&record.bytes>=0&&/^[a-f0-9]{64}$/.test(record.sha256),'engine-manifest-record');
  paths.push(record.path);
 }
 check(new Set(paths).size===paths.length&&JSON.stringify(paths)===JSON.stringify([...paths].sort(compare)),'engine-manifest-order');
 check(JSON.stringify(actual)===JSON.stringify([...paths,MANIFEST].sort(compare)),'engine-distribution-file-set');
 for(const record of manifest.files){const bytes=readFileSync(resolve(root,record.path));check(bytes.length===record.bytes&&sha(bytes)===record.sha256,`engine-distribution-byte-mismatch:${record.path}`);}
 const {closureSha256,...signedManifest}=manifest;
 check(manifest.closureFormat==='nihongo-study-engine-manifest/v2','engine-manifest-identity-format');
 const closure=sha(canonicalManifest(signedManifest));
 check(closure===manifest.closureSha256&&closure===expectedClosureSha256,'engine-distribution-closure-mismatch');
 check(paths.includes(manifest.entry)&&JSON.stringify(Object.keys(manifest.behavior??{}).sort(compare))===JSON.stringify([...BEHAVIOR].sort(compare))&&Object.entries(manifest.behavior??{}).every(([path,hash])=>manifest.files.some(file=>file.path===path&&file.sha256===hash)),'engine-manifest-behavior');
 return manifest;
}
const HERE=fileURLToPath(import.meta.url);
if(process.argv[1]&&resolve(process.argv[1])===HERE)try{
 const args=process.argv.slice(2),options={};let directory=resolve(dirname(HERE),'..');
 while(args.length){const arg=args.shift();if(arg==='--directory')directory=args.shift();else if(arg==='--expected-closure')options.expectedClosureSha256=args.shift();else if(arg==='--allow-development')options.requireCommitted=false;else throw Error('engine-verifier-arguments');}
 const manifest=verifyEngineDistribution(directory,options);console.log(JSON.stringify({verified:true,source:manifest.source,closureSha256:manifest.closureSha256,files:manifest.files.length}));
}catch(error){console.error(error.message);process.exitCode=1;}
