/** Parent capability composition only; real canonical receiver is browser-qualified separately. */
import assert from 'node:assert/strict';
const {test}=await import(process.env.VITEST==='true'&&!process.env.NODE_TEST_CONTEXT?'vitest':'node:test');
import vm from 'node:vm';
import ts from 'typescript';
import {canonicalStringify} from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
import {readFileSync} from 'node:fs';
import {attachSharedStudyAudioPacks,disposeSharedStudyAudioPacks} from '../prototypes/corridor/shared-study-audio-packs.mjs';
import {createSharedStudyTestHost,QA_HOST_MARKER} from '../prototypes/corridor/shared-study-test-host.mjs';
const hash=c=>c.repeat(64),binding={source:{catalogSha256:hash('a'),registrySha256:hash('b')},grammarAssets:{'grammar.json':hash('c')},dictionary:{buildSha256:hash('d')}};
const build={format:'nihongo-mnow-content',version:1,files:{'catalog.json':hash('a'),'registry.json':hash('b'),'grammar.json':hash('c')},dictionarySha256:hash('e')};
const request=()=>({build:structuredClone(build),buildSha256:hash('d'),registry:{tasks:[],passages:[],examples:[]},grammarRecords:[{guid:'selected',examples:[{ja:'全文の例文。'}]}]});
const configuration=()=>({release:{releaseId:'sha256:'+hash('f'),projectionId:'private:qa',contentRelease:'sha256:'+hash('d'),root:{key:'root.json',bytes:1,sha256:hash('f')}},authority:{identities:{catalog:hash('a'),registry:hash('b'),grammar:hash('c'),dictionary:hash('e')},correctionLedgerRevision:'qa',profiles:[],defaultProfileId:null},scope:{accessScope:'private:qa',licenseScope:'synthetic-only'},packIds:['first','second'],transport:{read(){throw Error('not a receiver unit test');}},authorize(){throw Error('must not invent unit-test grants');}});
function fixture(extra={}){
 const events=new EventTarget(),store={scope:{environment:'test-pack',learner:'test-pack',installation:'test-pack'},readState(){throw Error('wrapper must not read journal');}},catalog=[{taskKey:'accepted-current',meaning:'existing'}],backend=Object.freeze({});
 const adapter=Object.freeze({store,catalog,backend,platform:Object.freeze({storageKind:'bunki-shared'})});let calls=0,args,stopped=0;
 const controls=Object.freeze({read:()=>({state:'idle',selectedPacks:2,installedPacks:0}),subscribe:()=>()=>{},acquire:async()=>{},cancel(){},refresh:async()=>{},authorizePlayback:async()=>{}});
 const audio={protocol:'nsrs-audio-resources/v1',release:configuration().release,resources:{read:async()=>new Uint8Array([1]),packState:async()=> 'missing'}};
 const canonical={async createBrowserAudioPackHost(value){calls++;args=value;return Object.freeze({audio,audioDownloads:controls,dispose:async()=>{stopped++;}});}};
 const options={adapter,binding,configuration:configuration(),eventTarget:events,loadCanonical:async()=>canonical,...extra};
 const attached=attachSharedStudyAudioPacks(options);
 return{adapter,attached,store,catalog,backend,events,canonical,options,audio,controls,get calls(){return calls;},get args(){return args;},get stopped(){return stopped;}};
}
test('absent config is exact original adapter with no loader/source/store side effects',()=>{
 const adapter=Object.freeze({});assert.equal(attachSharedStudyAudioPacks({adapter,configuration:null,loadCanonical(){throw Error('absent config import');}}),adapter);
});
test('actual parent clone + original store and one configured host per store/frame',async()=>{
 const f=fixture(),again=attachSharedStudyAudioPacks({...f.options});
 const input=vm.runInNewContext('('+JSON.stringify(request())+')');const before=JSON.stringify(input);
 const first=f.attached.ensureAudioPacks(input),second=again.ensureAudioPacks(input);input.grammarRecords[0].examples[0].ja='changed caller';
 const [a,b]=await Promise.all([first,second]);assert.equal(f.calls,1);assert.equal(a.audio.protocol,f.audio.protocol);assert.deepEqual(a.audio.release,f.audio.release);assert.deepEqual(a.audioDownloads.read(),f.controls.read());assert.equal(a,b);
 assert.equal(f.attached.store,f.store);assert.equal(f.attached.backend,f.backend);assert.equal(f.attached.catalog,f.catalog);
 assert.equal(f.args.store,f.store);assert.equal(f.args.buildSha256,hash('d'));assert.equal(f.args.eventTarget,f.events);
 assert.notEqual(f.args.grammarRecords,input.grammarRecords);assert.equal(Object.getPrototypeOf(f.args.grammarRecords),Array.prototype);assert.equal(Object.getPrototypeOf(f.args.grammarRecords[0]),Object.prototype);
 assert.equal(f.args.grammarRecords[0].examples[0].ja,JSON.parse(before).grammarRecords[0].examples[0].ja);assert.deepEqual(f.args.catalog,f.catalog);assert.notEqual(f.args.catalog,f.catalog);
 await assert.rejects(async()=>f.args.configuration.authorize({}),/must not invent/);await assert.rejects(async()=>f.args.configuration.transport.read({}),/not a receiver/);
 await f.attached.disposeAudioPacks();await disposeSharedStudyAudioPacks(f.adapter);assert.equal(f.stopped,1);await assert.rejects(()=>again.ensureAudioPacks(request()),/disposed/);
});
test('foreign frame refs and preflight snapshots are parent-cloned before strict canonical callbacks',async()=>{
 const f=fixture();let incomingRef,incomingSnapshot,incomingOptions;
 const signal=new AbortController().signal,ref={key:'media/qa.m4a',sha256:hash('f'),bytes:1};
 f.audio.resources.read=async(value,options)=>{canonicalStringify(value);assert.equal(Object.getPrototypeOf(value),Object.prototype);incomingRef=value;incomingOptions=options;return new Uint8Array([1]);};
 const controls={...f.controls,authorizePlayback:async(value,options)=>{canonicalStringify(value);canonicalStringify(options.ref);assert.equal(Object.getPrototypeOf(value),Object.prototype);assert.equal(Object.getPrototypeOf(value.segments),Array.prototype);assert.equal(Object.getPrototypeOf(options.ref),Object.prototype);incomingSnapshot=value;incomingOptions=options;}};
 const g=fixture({loadCanonical:async()=>({createBrowserAudioPackHost:async()=>({audio:f.audio,audioDownloads:controls,dispose:async()=>{}})})});
 const host=await g.attached.ensureAudioPacks(request()),foreign=vm.runInNewContext('('+JSON.stringify({ref,snapshot:{status:'ready',segments:[{ref}]}})+')');
 const read=host.audio.resources.read(foreign.ref,{signal});foreign.ref.key='mutated-after-call';await read;assert.deepEqual(incomingRef,ref);assert.equal(incomingOptions.signal,signal);
 await host.audioDownloads.authorizePlayback(foreign.snapshot,{signal,ref:foreign.snapshot.segments[0].ref});assert.notEqual(incomingSnapshot,foreign.snapshot);assert.equal(incomingOptions.signal,signal);assert.deepEqual(incomingOptions.ref,ref);await g.attached.disposeAudioPacks();await f.attached.disposeAudioPacks();
});
test('each source pin and actual BUILD byte hash rejects before canonical creation',async()=>{
 for(const key of ['catalog.json','registry.json','grammar.json','buildSha256']){
  const f=fixture(),bad=request();if(key==='buildSha256')bad.buildSha256=hash('1');else bad.build.files[key]=hash('1');
  await assert.rejects(()=>f.attached.ensureAudioPacks(bad),/pin|binding|hash|source/);assert.equal(f.calls,0);await f.attached.ensureAudioPacks(request());assert.equal(f.calls,1);await f.attached.disposeAudioPacks();
 }
});
test('hard pagehide fences pending setup and awaited dispose drains late host',async()=>{
 let release;const pending=new Promise(r=>release=r),f=fixture({loadCanonical:()=>pending});const opening=f.attached.ensureAudioPacks(request());f.events.dispatchEvent(new Event('pagehide'));release(f.canonical);await assert.rejects(()=>opening,/disposed/);assert.equal(f.calls,0);await f.attached.disposeAudioPacks();
 let giveHost,started;const creating=new Promise(r=>started=r),waiting=new Promise(r=>giveHost=r),g=fixture({loadCanonical:async()=>({createBrowserAudioPackHost(){started();return waiting;}})});const operation=g.attached.ensureAudioPacks(request());await creating;
 let drained=false;const disposal=g.attached.disposeAudioPacks().then(()=>drained=true);await Promise.resolve();assert.equal(drained,false);let closes=0;giveHost({audio:g.audio,audioDownloads:g.controls,dispose:async()=>{closes++;}});await assert.rejects(()=>operation,/disposed/);await disposal;assert.equal(closes,1);
});
test('persisted pagehide delegates cache lifecycle without retiring parent setup',async()=>{
 const f=fixture();const active=await f.attached.ensureAudioPacks(request());const event=new Event('pagehide');Object.defineProperty(event,'persisted',{value:true});f.events.dispatchEvent(event);assert.equal(f.stopped,0);assert.equal(await f.attached.ensureAudioPacks(request()),active);await f.attached.disposeAudioPacks();
});
async function qaHost({sync=null,order,closeFailure=false}={}){
 const data=new Map();return createSharedStudyTestHost({marker:QA_HOST_MARKER,runId:'pack-lifecycle-'+Math.random().toString(36).slice(2),metadata:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},locks:{request:async(_name,fn)=>fn()},uuid:()=> 'pack-lifecycle',sync,storageFactory:()=>({read(){throw Error('unexpected learner read');},compareAndSwap(){throw Error('unexpected learner write');},close:async()=>{order.push('storage');if(closeFailure)throw Error('storage failure');}})});
}
test('actual QA owner awaits pack disposal before closing backend/storage',async()=>{
 const order=[];let release;const held=new Promise(r=>release=r),host=await qaHost({order});
 await host.withAdapter(()=>({store:{},catalog:[],backend:{dispose(){order.push('backend');}},disposeAudioPacks:async()=>{order.push('packs-start');await held;order.push('packs-end');}}));
 const pending=host.dispose();await Promise.resolve();assert.deepEqual(order,['packs-start']);release();await pending;assert.deepEqual(order,['packs-start','packs-end','backend','storage']);
});
test('pack cleanup rejection preserves storage cleanup and operation error precedence',async()=>{
 const order=[],packError=Error('pack failure'),host=await qaHost({order});await host.withAdapter(()=>({store:{},catalog:[],backend:{dispose(){order.push('backend');}},disposeAudioPacks:async()=>{order.push('packs');throw packError;}}));
 await assert.rejects(()=>host.dispose(),error=>error===packError);assert.deepEqual(order,['packs','backend','storage']);
 const failed=[],operationError=Error('original attach failure'),sync={hooks:{},attach:async()=>{throw operationError;},dispose(){},drain:async()=>{}};
 const other=await qaHost({order:failed,sync});await assert.rejects(()=>other.withAdapter(()=>({store:{},catalog:[],backend:{dispose(){failed.push('backend');}},disposeAudioPacks:async()=>{failed.push('packs');throw packError;}})),error=>error===operationError);assert.deepEqual(failed,['packs','backend','storage']);
});
test('complete runtime only attaches configured parent capability and preserves adapter authority',async()=>{
 const adapter=Object.freeze({store:{},catalog:[],backend:{},platform:{}}),config=configuration(),content={},bound={source:binding.source},calls=[];
 const imports={'./study-engine-adapter.mjs':{createBunkiStudyAdapter:async options=>{calls.push(options);return adapter;}},'./shared-study-audio-preparation.mjs':{attachSharedStudyAudioPreparation:({adapter})=>adapter},'./shared-study-content.mjs':{loadSharedContent:async()=>({content,binding:bound})},'./shared-study-storage.mjs':{createSharedStudyStorage(){throw Error('bound host cannot invent store');}},'./vendor/shared-study-engine/client/engine.mjs':{dayBounds(){},payloadHash(){}},'./shared-study-audio-packs.mjs':{attachSharedStudyAudioPacks:options=>{assert.equal(options.adapter,adapter);assert.equal(options.configuration,config);return Object.freeze({...adapter,ensureAudioPacks:async()=>{}});}}};
 const path=new URL('../prototypes/corridor/shared-study-runtime.mjs',import.meta.url),compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};
 new vm.Script(compiled,{filename:'actual-shared-study-runtime.mjs'}).runInNewContext({exports,URLSearchParams,require:key=>{assert(Object.hasOwn(imports,key),key);return imports[key];},bunkiSharedStudyHost:{identity:{learner:'real-host-scope'},audioPackConfiguration:config},location:{search:''}});
 const mounted=await exports.sharedStudyRuntime();assert.equal(await exports.sharedStudyRuntime(),mounted);assert.equal(calls.length,1);assert.equal(calls[0].content,content);assert.equal(mounted.store,adapter.store);assert.equal(mounted.backend,adapter.backend);assert.equal(typeof mounted.ensureAudioPacks,'function');
});

test('failed setup cleanup does not retire the reusable sync port',async()=>{
 const order=[],failure=Error('first attach failed');let attempts=0,retired=false;
 const sync={hooks:{},attach:async()=>{if(retired)throw Error('sync was retired');if(++attempts===1)throw failure;},dispose(){retired=true;},drain:async()=>{}};
 const host=await qaHost({order,sync});const adapter=()=>({store:{},catalog:[],backend:{dispose(){}},disposeAudioPacks:async()=>{}});
 await assert.rejects(()=>host.withAdapter(adapter),error=>error===failure);await host.withAdapter(adapter);assert.equal(attempts,2);assert.equal(retired,false);await host.dispose();assert.equal(retired,true);
});
