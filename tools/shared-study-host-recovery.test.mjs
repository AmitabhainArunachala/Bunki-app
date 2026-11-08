/** Allocation-before-create and failclosed reopen are host identity obligations. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createSharedStudyTestHost,QA_HOST_MARKER} from '../prototypes/corridor/shared-study-test-host.mjs';
import {createBunkiStudyAdapter} from '../prototypes/corridor/study-engine-adapter.mjs';
import {createMemoryAdapter} from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
const root=new URL('../prototypes/corridor/',import.meta.url),fixture=JSON.parse(readFileSync(new URL('tools/fixtures/shared-srs-contracts.json',root)));
const catalog=fixture.cards,pin=JSON.parse(readFileSync(new URL('vendor/shared-study-engine/client/vendor/fsrs-pin.json',root)));
const content={pin,catalog,registry:{tasks:catalog.map(({taskKey,noteGuid,contractId,passageId,lexemeId})=>({taskKey,noteGuid,contractId,passageId,lexemeId})),notes:catalog.map(({noteGuid,module})=>({noteGuid,module})),passages:[],examples:[]}};
const locks={request:async(_name,callback)=>callback()};
const options=(metadata,storage,uuid)=>({marker:QA_HOST_MARKER,runId:'recovery-judge',metadata,locks,storageFactory:()=>storage,uuid,now:()=>Date.parse('2026-11-08T10:00:00Z')});

test('public QA marker cannot activate real learner identity or legacy storage',async()=>{
 const values=new Map(),metadata={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const config=options(metadata,createMemoryAdapter(),()=> 'qa-scope');
 await assert.rejects(()=>createSharedStudyTestHost({...config,marker:'query-string'}),/qa/);
 await assert.rejects(()=>createSharedStudyTestHost({...config,learner:'real-learner'}),/qa/);
 await assert.rejects(()=>createSharedStudyTestHost({...config,environment:'prod'}),/qa/);
 await assert.rejects(()=>createSharedStudyTestHost({...config,identity:{learner:'real-learner'}}),/qa/);
 const host=await createSharedStudyTestHost(config),adapter=await host.withAdapter(binding=>createBunkiStudyAdapter({...binding,content}));
 assert.equal(adapter.identity.learner,'test-shared-audio');assert.equal(adapter.identity.environment,'test-shared-audio');
 assert.equal(adapter.platform.isPaired(),false);assert.equal(adapter.platform.canRequestNewCards(),false);
 assert.ok([...values.keys()].every(key=>key.startsWith('bunki-shared-study:qa:')));
 const reopened=await createSharedStudyTestHost(config);assert.equal(reopened.identity.installation,host.identity.installation);assert.equal(reopened.identity.mode,'open');
 await host.dispose();await reopened.dispose();
});

test('metadata finalization failure retains allocated installation, never creates another learner',async()=>{
 const values=new Map();let writes=0,fail=true,counter=0;
 const metadata={getItem:key=>values.get(key)??null,setItem(key,value){writes++;if(fail&&writes===2)throw Error('synthetic-metadata-finalize-failure');values.set(key,value);}};
 const storage=createMemoryAdapter(),config=options(metadata,storage,()=>`recovery-${++counter}`);
 const first=await createSharedStudyTestHost(config),installation=first.identity.installation;
 await assert.rejects(()=>first.withAdapter(binding=>createBunkiStudyAdapter({...binding,content})),/metadata|finalize/);
 fail=false;
 const restarted=await createSharedStudyTestHost(config);
 assert.equal(restarted.identity.installation,installation);
 assert.equal(restarted.identity.mode,'open');
 const adapter=await restarted.withAdapter(binding=>createBunkiStudyAdapter({...binding,content}));
 assert.equal(adapter.identity.installation,installation);
 assert.ok((await adapter.store.status()).applied>0);
 adapter.backend.dispose();restarted.dispose?.();first.dispose?.();
});

test('interrupted allocation with no canonical store is a blocked open, never a fresh fallback',async()=>{
 const values=new Map(),metadata={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const config=options(metadata,createMemoryAdapter(),()=> 'interrupted');
 const host=await createSharedStudyTestHost(config);
 await assert.rejects(()=>host.withAdapter(async()=>{throw Error('synthetic-crash-before-store');}),/synthetic-crash/);
 const restarted=await createSharedStudyTestHost(config);
 assert.equal(restarted.identity.installation,host.identity.installation);
 assert.equal(restarted.identity.mode,'open');
 await assert.rejects(()=>restarted.withAdapter(binding=>createBunkiStudyAdapter({...binding,content})),/missing-store/);
 assert.equal((await createSharedStudyTestHost(config)).identity.installation,host.identity.installation);
});

test('failed allocation metadata write prevents canonical store construction',async()=>{
 const metadata={getItem:()=>null,setItem(){throw Error('synthetic-metadata-unavailable');}},config=options(metadata,createMemoryAdapter(),()=> 'allocation-failed');
 let constructed=false;
 const host=await createSharedStudyTestHost(config);
 await assert.rejects(()=>host.withAdapter(async()=>{constructed=true;throw Error('must-not-create');}),/metadata/);
 assert.equal(constructed,false);
});

test('dispose during asynchronous adapter creation fences publication and closes its storage',async()=>{
 const values=new Map(),metadata={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 let closed=0,release,created;
 const memory=createMemoryAdapter(),storage={...memory,async close(){closed++;}};
 const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{created=resolve;});
 const host=await createSharedStudyTestHost(options(metadata,storage,()=> 'dispose-creation'));
 const opening=host.withAdapter(async binding=>{const adapter=await createBunkiStudyAdapter({...binding,content});created();await gate;return adapter;});
 await ready;await host.dispose();release();await assert.rejects(()=>opening,/disposed/);assert.equal(closed,1);
});
