/** Full authored entries run with controlled module dependencies, never lifted listeners. */
import assert from 'node:assert/strict';
const {test}=await import(
  process.env.VITEST==='true'&&!process.env.NODE_TEST_CONTEXT?'vitest':'node:test'
);
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
const root=process.env.BUNKI_AUDIO_ROOT??fileURLToPath(new URL('../',import.meta.url));
const candidate=process.env.BUNKI_AUDIO_CANDIDATE??root;
if(!vm.SourceTextModule){
 test('actual full-module BFCache lifecycle fixture',()=>{
  const child=spawnSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env:process.env,encoding:'utf8',timeout:60000});
  assert.equal(child.status,0,child.stdout+child.stderr);
 });
}else{
 const require=createRequire(join(root,'package.json')),{parse}=require('acorn');
 const {createBunkiStudyAdapter}=await import(pathToFileURL(join(root,'prototypes/corridor/study-engine-adapter.mjs')));
 const {createSharedStudyTestHost}=await import(pathToFileURL(join(root,'prototypes/corridor/shared-study-test-host.mjs')));
 const {createMemoryAdapter}=await import(pathToFileURL(join(root,'prototypes/corridor/vendor/shared-study-engine/client/engine.mjs')));
 const fixture=JSON.parse(readFileSync(join(root,'prototypes/corridor/tools/fixtures/shared-srs-contracts.json')));
 const catalog=[fixture.cards.find(e=>e.contractId==='vocabulary.read.v1')];
 const pin=JSON.parse(readFileSync(join(root,'prototypes/corridor/vendor/shared-study-engine/client/vendor/fsrs-pin.json')));
 const content={pin,catalog,registry:{tasks:catalog.map(({taskKey,noteGuid,contractId,passageId,lexemeId})=>({taskKey,noteGuid,contractId,passageId,lexemeId})),notes:catalog.map(({noteGuid,module})=>({noteGuid,module})),passages:[],examples:[]}};
 const tick=()=>new Promise(r=>setImmediate(r));
 class TrackedEvents extends EventTarget{
  listeners=new Set();
  addEventListener(type,fn,options){if(type==='pagehide')this.listeners.add(fn);return super.addEventListener(type,fn,options);}
  removeEventListener(type,fn,options){if(type==='pagehide')this.listeners.delete(fn);return super.removeEventListener(type,fn,options);}
 }
 const transition=(type,persisted)=>{const e=new Event(type);Object.defineProperty(e,'persisted',{value:persisted});return e;};
 const source=rel=>readFileSync(existsSync(join(candidate,rel))?join(candidate,rel):join(root,rel),'utf8');
 const digest=async bytes=>Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 function mutant(text,kind,action){
  const nodes=[];const visit=n=>{if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&n.callee.property?.name==='addEventListener'&&n.arguments[0]?.value==='pagehide')nodes.push(n);for(const[k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(visit);else visit(v);}};
  visit(parse(text,{sourceType:'module',ecmaVersion:'latest'}));assert.equal(nodes.length,1,'one authored pagehide registration');const n=nodes[0],receiver=text.slice(n.callee.object.start,n.callee.object.end);
  const body=kind==='unconditional'?action:`{if(!event.persisted)${action};}`;
  return text.slice(0,n.start)+`${receiver}.addEventListener('pagehide',event=>${body},{once:true})`+text.slice(n.end);
 }
 async function adapterFixture(){
  const metadata=new Map(),storage=createMemoryAdapter();let backendClosed=0,storageClosed=0;
  const host=await createSharedStudyTestHost({marker:'bunki-isolated-shared-study-qa/v1',runId:'bfcache-lifecycle',uuid:()=> 'bfcache',now:()=>Date.parse('2026-11-09T03:00:00Z'),metadata:{getItem:k=>metadata.get(k)??null,setItem:(k,v)=>metadata.set(k,v)},locks:{request:async(_n,f)=>f()},storageFactory:()=>({...storage,close(){storageClosed++;}})});
  const adapter=await host.withAdapter(async binding=>{
   const real=await createBunkiStudyAdapter({...binding,content});
   return Object.freeze({...real,backend:Object.freeze({...real.backend,dispose(){backendClosed++;real.backend.dispose();}})});
  });
  let serial=0;
  const exercise=async()=>{
   const data={word:'検証'+(++serial),reading:'けんしょう',meaning:'合成された検証用の語',example:'これは状態の保持を検証するための合成文です。',note:''};
   const manual=await adapter.backend.createManualCard(data);assert.equal(manual.kind,'durable');assert(manual.eventId);
   const attempt=adapter.backend.snapshotAttempt(catalog[0].taskKey),preview=adapter.backend.preview(attempt,1000);
   const grade=await adapter.backend.submitCommand(preview.intents[3]);assert.equal(grade.kind,'durable');
   return{manual,grade};
  };
  return{host,adapter,exercise,get backendClosed(){return backendClosed;},get storageClosed(){return storageClosed;}};
 }
 const moduleFor=async(context,exports)=>{const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;};
 async function runBootstrap(text){
  const f=await adapterFixture(),events=new TrackedEvents();
  const sandbox={document:{querySelector:selector=>({getAttribute:()=>selector.includes('qa-run')?'bfcache-lifecycle':'bunki-isolated-shared-study-qa/v1'})},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),console};
  const context=vm.createContext(sandbox),hostModule=await moduleFor(context,{QA_HOST_MARKER:'bunki-isolated-shared-study-qa/v1',createSharedStudyTestHost:async()=>f.host}),corridor=await moduleFor(context,{});
  const entry=new vm.SourceTextModule(text,{context,identifier:'https://qa.invalid/shared-study-test-bootstrap.mjs',importModuleDynamically:async()=>corridor});
  await entry.link(()=>hostModule);await entry.evaluate();assert.equal(sandbox.bunkiSharedStudyHost,f.host);
  return{...f,fixture:f,events,close:()=>f.host.dispose()};
 }
 async function bootstrapOracle(text){
  const r=await runBootstrap(text);try{
   assert.equal(r.events.listeners.size,1);r.events.dispatchEvent(transition('pagehide',true));r.events.dispatchEvent(transition('pageshow',true));await tick();
   assert.equal(r.fixture.backendClosed,0,'persisted bootstrap must retain actual backend');assert.equal(r.fixture.storageClosed,0);await r.exercise();
   r.events.dispatchEvent(transition('pagehide',true));r.events.dispatchEvent(transition('pageshow',true));await tick();assert.equal(r.fixture.backendClosed,0);
   r.events.dispatchEvent(transition('pagehide',false));await tick();assert.equal(r.fixture.backendClosed,1,'final unload closes backend once');assert.equal(r.fixture.storageClosed,1);assert.equal(r.events.listeners.size,0,'final unload removes authored listener');
   r.events.dispatchEvent(transition('pagehide',false));await tick();assert.equal(r.fixture.backendClosed,1);
  }finally{await r.close();}
 }
 async function runFrame(text){
  const f=await adapterFixture(),events=new TrackedEvents(),appRoot={cleared:false,replaceChildren(){this.cleared=true;},append(){},querySelector(){return null;}};
  let appClosed=0;const app={async exercise(){assert.equal(appClosed,0,'restored app is usable');return f.exercise();},dispose(){appClosed++;appRoot.replaceChildren();}};
  const encode=x=>new TextEncoder().encode(JSON.stringify(x));const registry={tasks:[]},grammar={records:[],tasks:[]},reviews={};
  const [registryHash,grammarHash,reviewsHash]=await Promise.all([registry,grammar,reviews].map(x=>digest(encode(x))));
  const build={files:{'catalog.json':'a'.repeat(64),'registry.json':registryHash,'grammar.json':grammarHash}},buildHash=await digest(encode(build));
  const binding={dictionary:{buildSha256:buildHash},grammarAssets:{'registry.json':registryHash,'grammar.json':grammarHash,'grammar-reviews.json':reviewsHash},counts:{vocabulary:1,grammar:0}};
  const assets={'shared-study-content.json':binding,'registry.json':registry,'grammar.json':grammar,'grammar-reviews.json':reviews,'BUILD.json':build,'tokens.json':{}};
  const win={frameElement:{bunkiStudyPort:{adapter:f.adapter}},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
  const context=vm.createContext({window:win,document:{querySelector:()=>appRoot,createElement:()=>({setAttribute(){}})},location:new URL('https://qa.invalid/decks/player/shared-frame.html?deck=n2'),localStorage:{getItem:()=>null,setItem(){}},URL,URLSearchParams,TextDecoder,TextEncoder,structuredClone,crypto:webcrypto,console,fetch:async url=>{const value=assets[new URL(url).pathname.split('/').at(-1)];assert.notEqual(value,undefined);return{ok:true,arrayBuffer:async()=>encode(value).buffer};}});
  const modules={
   'app.mjs':{mountStudyApp:()=>app},'renderer.mjs':{prepareGrammarModule:async()=>grammar},
   'dictionary-loader.mjs':{loadOfflineDictionary:async()=>({})},'dictionary.mjs':{prepareOfflineDictionary:async()=>({})},
   'shared-study-presentation.mjs':{bindStudyPresentation:backend=>backend},'shared-study-content.mjs':{moduleForSharedDeck:()=> 'n2',sharedDictionaryBuild:(_binding,value)=>value},
  };
  const entry=new vm.SourceTextModule(text,{context,identifier:'https://qa.invalid/decks/player/shared-frame.mjs',initializeImportMeta:meta=>meta.url='https://qa.invalid/decks/player/shared-frame.mjs'});
  await entry.link(specifier=>moduleFor(context,modules[specifier.split('/').at(-1)]));await entry.evaluate();assert.equal(win.bunkiSharedStudy?.app,app,'actual full frame entry mounted');
  return{...f,events,app,appRoot,get appClosed(){return appClosed;},close:()=>f.host.dispose()};
 }
 async function frameOracle(text){
  const r=await runFrame(text);try{
   assert.equal(r.events.listeners.size,1);r.events.dispatchEvent(transition('pagehide',true));r.events.dispatchEvent(transition('pageshow',true));await tick();
   assert.equal(r.appClosed,0,'persisted frame must retain usable app');assert.equal(r.appRoot.cleared,false);await r.app.exercise();
   r.events.dispatchEvent(transition('pagehide',true));r.events.dispatchEvent(transition('pageshow',true));await tick();assert.equal(r.appClosed,0);
   r.events.dispatchEvent(transition('pagehide',false));assert.equal(r.appClosed,1,'final frame unload disposes once');assert.equal(r.appRoot.cleared,true);assert.equal(r.events.listeners.size,0,'final frame unload removes authored listener');
   r.events.dispatchEvent(transition('pagehide',false));assert.equal(r.appClosed,1);
  }finally{await r.close();}
 }
 const bootstrap=source('prototypes/corridor/shared-study-test-bootstrap.mjs'),frame=source('prototypes/corridor/decks/player/shared-frame.mjs');
 test('full QA bootstrap preserves actual canonical grade/manual backend through BFCache; final unload closes it',()=>bootstrapOracle(bootstrap));
 test('full shared-frame entry preserves usable app and canonical grade/manual actions through BFCache',()=>frameOracle(frame));
 for(const kind of ['unconditional','once']){
  test(`bootstrap original-${kind} cleanup mutation fails lifecycle oracle`,async()=>assert.rejects(()=>bootstrapOracle(mutant(bootstrap,kind,'host.dispose()')),kind==='unconditional'?/persisted bootstrap must retain actual backend/:/final unload closes backend once/));
  test(`frame original-${kind} cleanup mutation fails lifecycle oracle`,async()=>assert.rejects(()=>frameOracle(mutant(frame,kind,'app.dispose()')),kind==='unconditional'?/persisted frame must retain usable app/:/final frame unload disposes once/));
 }
 test('full bootstrap restore preserves one audio subscription for actual manual and grade store updates',async()=>{
  const {attachSharedStudyAudioPreparation,disposeSharedStudyAudioPreparation}=await import(pathToFileURL(join(root,'prototypes/corridor/shared-study-audio-preparation.mjs')));
  const r=await runBootstrap(bootstrap);let starts=0,stops=0,notifications=0;
  const hashes={catalogSha256:'a'.repeat(64),registrySha256:'b'.repeat(64)},pins={source:hashes,grammarAssets:{'grammar.json':'c'.repeat(64)},dictionary:{buildSha256:'d'.repeat(64)}},build={files:{'catalog.json':hashes.catalogSha256,'registry.json':hashes.registrySha256,'grammar.json':'c'.repeat(64)}};
  const attached=attachSharedStudyAudioPreparation({adapter:r.adapter,binding:pins,eventTarget:r.events,loadCanonical:async()=>({acceptedAudioSourceRevision:()=> 'synthetic-source',startAcceptedAudioHost({store}){starts++;const unsubscribe=store.subscribe(()=>notifications++);return{status:()=>({state:'pending'}),flush:async()=>{},dispose(){stops++;unsubscribe();}};}})});
  try{
   await attached.ensureAudioPreparation({build,grammarRecords:[]});assert.equal(starts,1);assert.equal(r.events.listeners.size,2);
   r.events.dispatchEvent(transition('pagehide',true));r.events.dispatchEvent(transition('pageshow',true));await tick();assert.equal(stops,0);assert.equal(r.fixture.backendClosed,0);
   await r.exercise();assert(notifications>=2,'actual manual-card and review append notifications still reach one observer');
   await attached.ensureAudioPreparation({build,grammarRecords:[]});assert.equal(starts,1);
   r.events.dispatchEvent(transition('pagehide',false));await tick();assert.equal(stops,1);assert.equal(r.fixture.backendClosed,1);assert.equal(r.events.listeners.size,0);
  }finally{disposeSharedStudyAudioPreparation(r.adapter);await r.close();}
 });

}
