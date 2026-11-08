import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if(!vm.SourceTextModule){
  test('actual verifier classifier fixture runs with VM module support',()=>{
    const child=spawnSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stdout+child.stderr);
  });
}else{
const url=new URL('../scripts/verify-shared-study-host-browser.mjs',import.meta.url);
const source=readFileSync(url,'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function observe(text=source){
  const html='<script src="shared-study-test-bootstrap.mjs"></script>',writes=[];
  let registration=0,stopped=false,closed=false;
  class Storage { setItem() {} }
  class IDBObjectStore { constructor(database){this.transaction={db:{name:database}};} }
  for(const method of ['put','add','delete','clear']) IDBObjectStore.prototype[method]=function(){};
  const context=vm.createContext({Storage,IDBObjectStore,console:{log(){}},URL,Buffer,process:{env:{BUNKI_QA_SITE:'/qa/site',BUNKI_QA_EVIDENCE:'/Users/dhyana/.dharma/qa-verifier-fixture',BUNKI_QA_ENGINE_CLOSURE:'a'.repeat(64)},exitCode:0}});
  const host={origin:'http://127.0.0.1:1',close:async()=>{closed=true;}};
  const chromium={launchPersistentContext:async()=>({browser:()=>({version:()=> 'fixture',close:async()=>{}}),route:async()=>{},addInitScript:async fn=>{registration++;fn();},newPage:async()=>{stopped=true;throw Error('fixture: registration observed before browser navigation');}})};
  const fs={readFileSync:(file,encoding)=>{const value=String(file).endsWith('qa-host-receipt.json')?JSON.stringify({derivedIndex:{sha256:hash(html)},modules:[]}):html;return encoding?value:Buffer.from(value);},writeFileSync:(_file,body)=>writes.push(JSON.parse(body)),mkdirSync:()=>{},existsSync:()=>false};
  const deps={
    'node:assert/strict':{default:assert},
    'node:module':{createRequire:()=>()=>({chromium})},
    'node:fs':fs,'node:path':{resolve},'node:crypto':{createHash},
    '../prototypes/bunki-desktop/lib/static-host.cjs':{startStaticHost:async()=>host},
    '../prototypes/corridor/vendor/shared-study-engine/tools/verify_engine.mjs':{verifyEngineDistribution:()=>({closureSha256:'a'.repeat(64),source:'fixture'})},
  };
  const module=new vm.SourceTextModule(text,{context,identifier:url.href,initializeImportMeta:meta=>{meta.url=url.href;}});
  await module.link(specifier=>{
    const values=deps[specifier];assert(values,`unexpected dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});
  });
  await module.evaluate();
  assert.equal(registration,1,'actual verifier must register its own init callback once');
  assert(stopped&&closed,'entry executes setup and final cleanup, without a real browser');
  assert.equal(writes.length,1);assert.match(writes[0].failure,/registration observed/);
  for(const database of ['bunki-shared-study-qa-fixture','nsrs-private-audio-demand-v1','legacy-grade-ledger']){
    const store=new IDBObjectStore(database);for(const method of ['put','add','delete','clear'])store[method]({fixture:true});
  }
  const storage=new Storage();storage.setItem('bunki-cloze:test','x');storage.setItem('kairo-corridor-v1','x');storage.setItem('unrelated','x');
  return JSON.parse(JSON.stringify(context.__qaLegacyWrites));
}
function assertClassifier(rows){
  assert.deepEqual(rows.filter(row=>row.kind==='indexedDB').map(row=>row.database),Array(4).fill('legacy-grade-ledger'));
  assert.deepEqual(rows.filter(row=>row.kind==='indexedDB').map(row=>row.method),['put','add','delete','clear']);
  assert.deepEqual(rows.filter(row=>row.kind==='localStorage').map(row=>row.key),['bunki-cloze:test','kairo-corridor-v1']);
}
function mutant(predicate){
  const changed=source.replace(/if\([^\n]+\)globalThis\.__qaLegacyWrites\.push\(\{kind:'indexedDB'/,`if(${predicate})globalThis.__qaLegacyWrites.push({kind:'indexedDB'`);
  return changed;
}
test('actual verifier registration excludes only canonical QA and private audio stores, retaining legacy ledgers',async()=>{assertClassifier(await observe());});
test('old audio misclassification is a failing behavioral negative',async()=>{const rows=await observe(mutant("!this.transaction.db.name.startsWith('bunki-shared-study-qa-')"));assert.throws(()=>assertClassifier(rows));assert.equal(rows.filter(row=>row.database==='nsrs-private-audio-demand-v1').length,4);});
test('silencing all legacy IDB writes is a failing behavioral negative',async()=>{const rows=await observe(mutant('false'));assert.throws(()=>assertClassifier(rows));assert.equal(rows.filter(row=>row.kind==='indexedDB').length,0);});

}
