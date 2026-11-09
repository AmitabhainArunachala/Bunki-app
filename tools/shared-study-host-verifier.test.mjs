const {test}=await import(
  process.env.VITEST==='true'&&!process.env.NODE_TEST_CONTEXT?'vitest':'node:test'
);
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,existsSync,rmSync,cpSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,extname,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {observeSharedStudyLegacyWrites} from '../scripts/shared-study-legacy-observer.mjs';

async function observePreview(source=observeSharedStudyLegacyWrites.toString()){
  const values=new Map([['bunki-cloze:n2','preserved history']]),operations=[];
  class IDBObjectStore {
    constructor(database){this.transaction={db:{name:database}};this.name='records';}
  }
  const methods=['put','add','delete','clear'];
  for(const method of methods)IDBObjectStore.prototype[method]=function(...args){
    const request={receiver:this,method,args};operations.push(request);return request;
  };
  const context=vm.createContext({IDBObjectStore,localStorage:{
    getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),
  }});
  context.window=context;context.top=context;
  vm.runInContext(`(${source})()`,context);
  const snapshot=()=>({keys:Object.fromEntries([...values].filter(([key])=>key.startsWith('bunki-cloze:')||key==='kairo-corridor-v1')),
    writes:JSON.parse(JSON.stringify(context.__legacyWrites))});
  assert.equal(values.get('bunki-cloze:n2'),'preserved history');
  const unchanged=snapshot();
  for(const database of ['bunki-shared-study-preview','nsrs-private-audio-demand-v1',
    'nsrs-private-audio-demand-v1-extra','nsrs-private-audio-demand-v10','legacy-grade-ledger']){
    const before=snapshot();let release;
    const barrier=new Promise(resolve=>{release=resolve;});
    const pending=barrier.then(()=>{
      const store=new IDBObjectStore(database);
      for(const method of methods){
        const args=method==='clear'?[]:method==='delete'?['key']:[{value:'durable'},'key'];
        const count=operations.length,request=store[method](...args);
        assert.equal(operations.length,count+1);assert.equal(request,operations.at(-1));
        assert.equal(request.receiver,store);assert.equal(request.method,method);assert.deepEqual(request.args,args);
      }
    });
    assert.deepEqual(snapshot(),before);release();await pending;
    if(['bunki-shared-study-preview','nsrs-private-audio-demand-v1'].includes(database))
      assert.deepEqual(snapshot(),unchanged,'delayed canonical or exact sidecar writes leave the legacy baseline unchanged');
    else{
      assert.throws(()=>assert.deepEqual(snapshot(),before),'real legacy writes must invalidate the baseline');
      assert.deepEqual(snapshot().writes.slice(-4),methods.map(method=>({database,store:'records',method})));
    }
  }
  for(const key of ['bunki-cloze:n2','kairo-corridor-v1']){
    const before=snapshot();context.localStorage.setItem(key,'unexpected legacy change');
    assert.throws(()=>assert.deepEqual(snapshot(),before),'legacy localStorage changes must invalidate the baseline');
  }
}

test('preview observer ignores delayed exact sidecar writes and catches every legacy mutation',()=>observePreview());
test('preview observer oracle rejects the original sidecar misclassification',async()=>{
  const original=observeSharedStudyLegacyWrites.toString().replace(/\s*&&\s*this\.transaction\.db\.name\s*!==\s*(['"])nsrs-private-audio-demand-v1\1/u,'');
  await assert.rejects(observePreview(original),/delayed canonical or exact sidecar/);
});
test('preview observer oracle rejects prefix exclusions and suppressed legacy writes',async()=>{
  for(const source of [
    observeSharedStudyLegacyWrites.toString().replace(/this\.transaction\.db\.name\s*!==\s*(['"])nsrs-private-audio-demand-v1\1/u,"!this.transaction.db.name.startsWith('nsrs-private-audio-demand-v1')"),
    observeSharedStudyLegacyWrites.toString().replace('window.__legacyWrites.push({','void ({'),
  ])await assert.rejects(observePreview(source),/real legacy writes must invalidate/);
});

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

test('audio fixture authenticates external verifier before execution and preserves full export admission',async()=>{
  const repo=fileURLToPath(new URL('..',import.meta.url));
  const parent=join(repo,'node_modules/.cache');mkdirSync(parent,{recursive:true});
  const temporary=mkdtempSync(join(parent,'shared-audio-verifier-'));
  const runtime=join(temporary,'.dharma'),media=join(temporary,'media');
  mkdirSync(runtime);mkdirSync(media);
  for(let index=0;index<3;index++)writeFileSync(join(media,`${index}.m4a`),Buffer.from(`opaque synthetic resource ${index}`));
  const url=new URL('../scripts/shared-study-audio-fixture.mjs',import.meta.url);
  const module=new vm.SourceTextModule(readFileSync(url,'utf8'),{
    identifier:url.href,initializeImportMeta:meta=>{meta.url=url.href;},
    importModuleDynamically:specifier=>import(specifier),
  });
  await module.link(async specifier=>{
    const values={...await import(specifier)};
    if(specifier==='node:os')values.homedir=()=>temporary;
    return new vm.SyntheticModule(Object.keys(values),function(){
      for(const [key,value] of Object.entries(values))this.setExport(key,value);
    });
  });
  await module.evaluate();
  const create=module.namespace.createBunkiAudioFixture;
  const pin=JSON.parse(readFileSync(join(repo,'scripts/shared-study-pin.json')));
  const canonical=join(repo,'prototypes/corridor/vendor/shared-study-engine');
  const options={repo,mediaDirectory:media,expectedClosure:pin.closureSha256};
  try{
    const malicious=join(temporary,'malicious'),sideEffect=join(temporary,'untrusted-executed');
    mkdirSync(join(malicious,'tools'),{recursive:true});
    writeFileSync(join(malicious,'tools/verify_engine.mjs'),
      `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(sideEffect)},'executed');\nexport function verifyEngineDistribution(_root,{expectedClosureSha256}){return {closureSha256:expectedClosureSha256,files:[]};}\n`);
    const rejectedOutput=join(runtime,'rejected');
    let rejection;
    try{await create({...options,engineExport:malicious,output:rejectedOutput});}catch(error){rejection=error;}
    assert.equal(existsSync(sideEffect),false,'untrusted verifier must not execute before authentication');
    assert.equal(existsSync(rejectedOutput),false,'failed authentication must not emit a fixture');
    assert.match(rejection?.message??'',/Canonical verifier differs from reviewed Bunki pin/);

    const wrongClosureOutput=join(runtime,'wrong-closure');
    await assert.rejects(create({...options,engineExport:canonical,expectedClosure:'0'.repeat(64),output:wrongClosureOutput}),/engine-distribution-closure-mismatch/);
    assert.equal(existsSync(wrongClosureOutput),false);

    const altered=join(temporary,'altered');cpSync(canonical,altered,{recursive:true});
    const alteredModule=join(altered,'client/app/study-audio.mjs');
    writeFileSync(alteredModule,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(sideEffect)},'runtime executed');\n`);
    const alteredOutput=join(runtime,'altered');
    await assert.rejects(create({...options,engineExport:altered,output:alteredOutput}),/engine-distribution-byte-mismatch:client\/app\/study-audio.mjs/);
    assert.equal(existsSync(sideEffect),false,'full manifest validation must precede runtime imports');
    assert.equal(existsSync(alteredOutput),false);

    const output=join(runtime,'authenticated');
    const fixture=await create({...options,engineExport:canonical,output});
    const emitted=JSON.parse(readFileSync(join(output,'fixture.json')));
    assert.equal(emitted.taskKey,fixture.taskKey);
    assert.equal(emitted.provenance.export.closureSha256,pin.closureSha256);
    assert.equal(emitted.provenance.export.expectedClosureSha256,pin.closureSha256);
    assert.equal(emitted.provenance.source.binding.sha256,pin.contentBindingSha256);
    assert.equal(emitted.provenance.source.pin.verifierSha256,pin.verifierSha256);
    assert.equal(hash(readFileSync(join(output,'pack',fixture.release.root.key))),fixture.release.root.sha256);
    assert.equal(emitted.provenance.pack.fullCatalogCoverage,false);
    assert.equal(emitted.provenance.guarantees.providerRequests,false);
    assert.equal(existsSync(sideEffect),false);
  }finally{rmSync(temporary,{recursive:true,force:true});}
});

}
