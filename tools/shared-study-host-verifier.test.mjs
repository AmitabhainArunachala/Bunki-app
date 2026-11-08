const {test}=await import(
  process.env.VITEST==='true'&&!process.env.NODE_TEST_CONTEXT?'vitest':'node:test'
);
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,extname,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

if(!vm.SourceTextModule){
  test('actual verifier classifier fixture runs with VM module support',()=>{
    const child=spawnSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stdout+child.stderr);
  });
}else{
const verifiers=['browser','audio'].map(kind=>{
  const url=new URL(`../scripts/verify-shared-study-host-${kind}.mjs`,import.meta.url);
  return {kind,url,source:readFileSync(url,'utf8')};
});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const methods=['put','add','delete','clear'];
const legacyDatabases=['legacy-grade-ledger','nsrs-private-audio-demand-v1-extra','nsrs-private-audio-demand-v10'];
async function observe(verifier,text=verifier.source){
  const html='<script src="shared-study-test-bootstrap.mjs"></script>',writes=[],operations=[];
  let registration=0,stopped=false,closed=false;
  const operation=function(method,args){const result={operation:operations.length};operations.push({receiver:this,method,args,result});return result;};
  class Storage { setItem(...args) { return operation.call(this,'setItem',args); } }
  class IDBObjectStore { constructor(database){this.transaction={db:{name:database}};} }
  for(const method of methods) IDBObjectStore.prototype[method]=function(...args){return operation.call(this,method,args);};
  const context=vm.createContext({Storage,IDBObjectStore,AudioContext:class {},console:{log(){}},URL,Buffer,process:{env:{
    BUNKI_QA_SITE:'/qa/site',BUNKI_QA_EVIDENCE:'/Users/dhyana/.dharma/qa-verifier-fixture',BUNKI_QA_ENGINE_CLOSURE:'a'.repeat(64),
    BUNKI_QA_BASE:'/qa/site',BUNKI_ENGINE_EXPORT:'/qa/export',BUNKI_AUDIO_MEDIA:'/qa/media',BUNKI_AUDIO_OUT:'/Users/dhyana/.dharma/qa-audio-verifier-fixture',
  },exitCode:0}});
  context.window=context;
  const host={origin:'http://127.0.0.1:1',close:async()=>{closed=true;}};
  const server={listen:(_port,_address,ready)=>ready(),address:()=>({port:1}),close:done=>{closed=true;done();},closeAllConnections(){}};
  const chromium={launchPersistentContext:async()=>({browser:()=>({version:()=> 'fixture',close:async()=>{}}),close:async()=>{},route:async()=>{},addInitScript:async fn=>{registration++;fn();},newPage:async()=>{stopped=true;throw Error('fixture: registration observed before browser navigation');}})};
  const fs={readFileSync:(file,encoding)=>{const value=String(file).endsWith('qa-host-receipt.json')?JSON.stringify({derivedIndex:{sha256:hash(html)},modules:[]}):html;return encoding?value:Buffer.from(value);},writeFileSync:(file,body)=>writes.push({file:String(file),body}),mkdirSync:()=>{},existsSync:()=>false,realpathSync:path=>path,lstatSync:()=>{throw Error('unexpected resource access');}};
  const deps={
    'node:assert/strict':{default:assert},
    'node:module':{createRequire:()=>()=>({chromium})},
    'node:fs':fs,'node:path':{resolve,join,extname,dirname},'node:crypto':{createHash},
    'node:url':{fileURLToPath,pathToFileURL},'node:http':{createServer:()=>server},
    'node:child_process':{execFileSync:()=>{throw Error('unexpected baseline access');}},
    './shared-study-audio-fixture.mjs':{createBunkiAudioFixture:async()=>({release:{root:{sha256:'a'.repeat(64)}}})},
    '../prototypes/bunki-desktop/lib/static-host.cjs':{startStaticHost:async()=>host},
    '../prototypes/corridor/vendor/shared-study-engine/tools/verify_engine.mjs':{verifyEngineDistribution:()=>({closureSha256:'a'.repeat(64),source:'fixture'})},
  };
  const module=new vm.SourceTextModule(text,{context,identifier:verifier.url.href,initializeImportMeta:meta=>{meta.url=verifier.url.href;}});
  await module.link(specifier=>{
    const values=deps[specifier];assert(values,`unexpected dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});
  });
  await module.evaluate();
  assert.equal(registration,1,'actual verifier must register its own init callback once');
  assert(stopped&&closed,'entry executes setup and final cleanup, without a real browser');
  const receipts=writes.filter(write=>write.file.endsWith('.json'));
  assert.equal(receipts.length,1);assert.match(JSON.parse(receipts[0].body).failure,/registration observed/);
  const invoke=(receiver,method,args)=>{
    const before=operations.length,result=receiver[method](...args),observed=operations.at(-1);
    assert.equal(operations.length,before+1);
    assert.equal(observed.receiver,receiver);assert.equal(observed.method,method);
    assert.equal(observed.args.length,args.length);
    args.forEach((arg,index)=>assert.equal(observed.args[index],arg));
    assert.equal(result,observed.result);
  };
  for(const database of ['bunki-shared-study-qa-fixture','nsrs-private-audio-demand-v1',...legacyDatabases]){
    const store=new IDBObjectStore(database);
    for(const method of methods)invoke(store,method,method==='clear'?[]:method==='delete'?['key']:[{fixture:true},'key']);
  }
  const storage=new Storage();
  for(const key of ['bunki-cloze:test','kairo-corridor-v1','unrelated'])invoke(storage,'setItem',[key,'x']);
  const rows=verifier.kind==='audio'?context.__bunkiAudioProbe.legacy:context.__qaLegacyWrites;
  return JSON.parse(JSON.stringify(rows)).map(row=>({...row,kind:row.kind??row.type}));
}
function assertClassifier(rows){
  assert.deepEqual(rows.filter(row=>row.kind==='indexedDB').map(row=>row.database),legacyDatabases.flatMap(database=>Array(4).fill(database)));
  assert.deepEqual(rows.filter(row=>row.kind==='indexedDB').map(row=>row.method),legacyDatabases.flatMap(()=>methods));
  assert.deepEqual(rows.filter(row=>row.kind==='localStorage').map(row=>row.key),['bunki-cloze:test','kairo-corridor-v1']);
}
function mutant(verifier,predicate){
  const hook=verifier.kind==='audio'?"__bunkiAudioProbe.legacy.push({type:'indexedDB'":"globalThis.__qaLegacyWrites.push({kind:'indexedDB'";
  const marker="if(!this.transaction.db.name.startsWith('bunki-shared-study-qa-')&&this.transaction.db.name!=='nsrs-private-audio-demand-v1')"+hook;
  return verifier.source.replace(marker,`if(${predicate})${hook}`);
}
for(const verifier of verifiers){
  test(`${verifier.kind} verifier excludes only canonical QA and private audio stores, preserving legacy operations`,async()=>{assertClassifier(await observe(verifier));});
  test(`${verifier.kind} verifier rejects the old audio misclassification`,async()=>{const rows=await observe(verifier,mutant(verifier,"!this.transaction.db.name.startsWith('bunki-shared-study-qa-')"));assert.throws(()=>assertClassifier(rows));assert.equal(rows.filter(row=>row.database==='nsrs-private-audio-demand-v1').length,4);});
  test(`${verifier.kind} verifier rejects a broader private audio allowlist`,async()=>{const rows=await observe(verifier,mutant(verifier,"!this.transaction.db.name.startsWith('bunki-shared-study-qa-')&&!this.transaction.db.name.startsWith('nsrs-private-audio-demand-v1')"));assert.throws(()=>assertClassifier(rows));assert.equal(rows.filter(row=>row.database==='nsrs-private-audio-demand-v1-extra').length,0);});
  test(`${verifier.kind} verifier rejects silencing all legacy IDB writes`,async()=>{const rows=await observe(verifier,mutant(verifier,'false'));assert.throws(()=>assertClassifier(rows));assert.equal(rows.filter(row=>row.kind==='indexedDB').length,0);});
}

}
