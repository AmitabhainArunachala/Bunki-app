import {describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import {decodeSharedContent,SHARED_DECKS} from '../prototypes/corridor/shared-study-content.mjs';
import {createBunkiStudyAdapter,createBunkiAttempt} from '../prototypes/corridor/study-engine-adapter.mjs';
import {createStudyEngine,createMemoryAdapter,dayBounds,payloadHash,canonicalStringify} from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
import {buildSharedStudyBinding} from '../scripts/shared-study-binding.mjs';
const root=new URL('../prototypes/corridor/',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root)));
const binding=read('data/shared-study-content.json'),pin=read('vendor/shared-study-engine/client/vendor/fsrs-pin.json');
const decks=Object.fromEntries(SHARED_DECKS.map(id=>[id,read(`decks/${id}/deck.json`)]));
const content=decodeSharedContent(binding,decks,pin),NOW=Date.parse('2026-11-01T10:00:00Z');
const selected=[...content.catalog.filter(e=>e.module==='n2').slice(0,2),...content.catalog.filter(e=>e.module==='n1').slice(0,1),...content.catalog.filter(e=>e.module==='grammar').slice(0,1)];
const keys=new Set(selected.map(e=>e.taskKey)),guids=new Set(selected.map(e=>e.noteGuid)),passages=new Set(selected.map(e=>e.passageId));
const small={pin,catalog:selected,registry:{tasks:content.registry.tasks.filter(e=>keys.has(e.taskKey)),notes:content.registry.notes.filter(e=>guids.has(e.noteGuid)),passages:content.registry.passages.filter(e=>passages.has(e.passageId))}};
function memory(){let writes=0,failAfter=false;const adapter=createMemoryAdapter({afterCommit:()=>{writes++;if(failAfter){failAfter=false;throw Error('lost-ack');}}});return {...adapter,get writes(){return writes;},loseAck(){failAfter=true;}};}
function grant(installation,n=2,seq=1){const event={v:4,id:`@server:${seq}`,learner:'test-shared',install:'@server',dseq:seq,base:seq-1,ts:NOW,epoch:0,policy:'nsrs-policy-v1',type:'permit-grant',data:{install:installation,permitIds:Array.from({length:n},(_,i)=>`permit-${seq}-${i}`),...dayBounds(NOW,'Asia/Tokyo')}};return {seq,rt:NOW,authority:'server',event,bodyHash:payloadHash(event)};}
async function fixture(installation='test-bunki',storage=memory(),events=[grant(installation)]){let n=0;const adapter=await createBunkiStudyAdapter({content:small,storage,identity:{learner:'test-shared',environment:'test-shared',installation,mode:'fresh'},now:()=>NOW,uuid:()=>`${installation}-intent-${++n}`,initialize:async({store})=>store.reconcile({events,head:events.length})});return {adapter,storage};}
// Execute the product's actual function bodies with synthetic host dependencies.
// AST extraction avoids a second implementation of routing/authority decisions.
const parsedSources=new Map();
function productFunction(path,name){
  if(!parsedSources.has(path))parsedSources.set(path,ts.createSourceFile(path,readFileSync(new URL(path,root),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS));
  const declaration=parsedSources.get(path).statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  if(!declaration)throw Error(`Missing product function ${path}:${name}`);
  return declaration.getText().replace(/^export\s+/, '');
}
function productContext(path,names,dependencies){
  const context=vm.createContext({...dependencies,URLSearchParams});
  vm.runInContext(names.map(name=>productFunction(path,name)).join('\n'),context);
  return context;
}

describe('Bunki canonical shared study consumer',()=>{
  it('requires the existing artifact in CI and refuses tampered bytes before launching a browser',()=>{
    const script=new URL('../scripts/verify-shared-study-browser.mjs',import.meta.url).pathname;
    const env={...process.env,CI:'true'};delete env.KAIRO_SITE_DIR;delete env.KAIRO_EVIDENCE_DIR;delete env.KAIRO_ARTIFACT_SHA256;
    const missing=spawnSync(process.execPath,[script,'--if-ci'],{encoding:'utf8',env});
    expect(missing.status).not.toBe(0);expect(missing.stderr).toContain('Explicit built site and external evidence directory required');
    const local=spawnSync(process.execPath,[script,'--if-ci'],{encoding:'utf8',env:{...env,CI:''}});
    expect(local.status).toBe(0);expect(local.stdout).toContain('not requested locally');
    const direct=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...env,CI:''}});
    expect(direct.status).not.toBe(0);
    const temporary=mkdtempSync(join(tmpdir(),'bunki-browser-artifact-')),site=join(temporary,'site');
    try {
      mkdirSync(site);const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
      const assets={'index.html':'<!doctype html>','corridor.js':'original','manifest.webmanifest':'{}','sw.js':`self.KAIRO_ASSET_VERSION = "${'a'.repeat(64)}";\n`};
      const files=Object.entries(assets).sort().map(([path,bytes])=>{writeFileSync(join(site,path),bytes);return {path,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};});
      const artifactSha256=hash(JSON.stringify(files));
      writeFileSync(join(site,'build-identity.json'),JSON.stringify({schemaVersion:1,product:'KAIRO',gitSha:'b'.repeat(40),sourceDirty:false,sourceAssetSha256:'a'.repeat(64),artifactSha256,files}));
      writeFileSync(join(site,'corridor.js'),'tampered');
      const changed=spawnSync(process.execPath,[script,'--if-ci'],{encoding:'utf8',env:{...env,RUNNER_TEMP:temporary,KAIRO_SITE_DIR:site,KAIRO_EVIDENCE_DIR:join(temporary,'evidence'),KAIRO_ARTIFACT_SHA256:artifactSha256}});
      expect(changed.status).not.toBe(0);expect(changed.stderr).toContain('Asset digest mismatch: corridor.js');
    } finally {rmSync(temporary,{recursive:true,force:true});}
    const scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).scripts;
    expect(scripts.test).toContain('node scripts/verify-shared-study-browser.mjs --if-ci');
    expect(scripts['verify:shared-study:browser']).toBe('node scripts/verify-shared-study-browser.mjs');
  });
  it('ignores the grammar-only query unless preview or a bound host owns study, and recovers after a failed deck',()=>{
    const state={view:'dojo',deckPlay:'n1'};
    const c=productContext('corridor.js',['sharedStudyActive','queryDeckRoute','openDeck'],{
      window:{scrollTo(){}},location:{search:'',hash:''},S:state,roomTransitionUpdating:true,keepScroll(){},render(){},deckPlayerError:true,
    });
    const params=deck=>new URLSearchParams({deck});
    expect(c.queryDeckRoute(params('shared-grammar'))).toBe(null);
    c.openDeck('shared-grammar');expect(state).toEqual({view:'dojo',deckPlay:'n1'});
    for(const deck of SHARED_DECKS)expect(c.queryDeckRoute(params(deck))).toBe(deck);
    expect(c.queryDeckRoute(params('mcd'))).toBe('kotoba-mcd');expect(c.queryDeckRoute(params('kotoba'))).toBe('kotoba-mine');
    c.openDeck('n2');expect(state).toEqual({view:'deckplay',deckPlay:'n2'});expect(c.deckPlayerError).toBe(false);
    for(const mode of ['preview','host']){
      c.location.search=mode==='preview'?'?sharedStudy=preview':'';c.window.bunkiSharedStudyHost=mode==='host'?{}:null;
      expect(c.queryDeckRoute(params('shared-grammar'))).toBe('shared-grammar');
    }
  });
  it('retains normal legacy counts and missed terms while selecting shared authority only in shared mode',async()=>{
    let shared=false,sharedCalls=0;
    const storage={},deck={id:'n2',words:[{},{}],titleJa:'語',titleEn:'Words'},state={log:[['word-a-card',1,new Date(NOW).toISOString()]]};
    const p=productContext('decks/player/mount.js',['summary','missedTerms'],{
      isSharedStudyMode:()=>shared,isSharedDeck:id=>SHARED_DECKS.includes(id),window:{localStorage:storage},
      loadDeck:async()=>({deck,index:{cards:new Map([['word-a-card',{word:{term:'語',reading:'ご'}}]])}}),
      loadState:()=>({state}),prefsFor:()=>({newPerDay:5}),buildQueue:()=>({due:[1],fresh:[2,3],queue:[1,2,3]}),skipFor:()=>null,buriedToday:()=>[],RATINGS:{again:1},
      sharedPlayer:async()=>({summary:async()=>{sharedCalls++;return {authority:'shared'};},missedTerms:async()=>{sharedCalls++;return [{term:'shared'}];}}),
    });
    expect(await p.summary('n2')).toMatchObject({due:1,fresh:2,total:3,words:2});
    expect(await p.missedTerms('n2',storage,NOW)).toEqual([{term:'語',reading:'ご',at:NOW,deck:'n2'}]);expect(sharedCalls).toBe(0);
    shared=true;expect(await p.summary('n2')).toEqual({authority:'shared'});expect(await p.missedTerms('n2')).toEqual([{term:'shared'}]);expect(sharedCalls).toBe(2);
    expect(await p.summary('kotoba-mine')).toMatchObject({total:0,authority:'unmapped'});expect(await p.missedTerms('kotoba-mine')).toEqual([]);
  });
  it('preserves normal legacy save and begun counts but fences those paths when shared mode is bound',()=>{
    let shared=false;const writes=[],ctx={deck:{id:'n2'},storage:{}};
    const p=productContext('decks/player/mount.js',['save'],{ctx,isSharedStudyMode:()=>shared,stateKey:id=>`bunki-cloze:${id}`,writeRaw:(...args)=>{writes.push(args);return true;}});
    expect(p.save({cards:{one:{}}})).toBe(true);expect(writes).toHaveLength(1);expect(writes[0][1]).toBe('bunki-cloze:n2');
    shared=true;expect(p.save({cards:{two:{}}})).toBe(false);expect(writes).toHaveLength(1);
    const c=productContext('corridor.js',['deckWordsBegun'],{sharedStudyActive:()=>shared,deckSummaries:{n2:{begun:99}},localStorage:{getItem:()=>JSON.stringify({cards:{'first-a':{},'first-b':{},'second-a':{}}})}});
    shared=false;expect(c.deckWordsBegun('n2')).toBe(2);shared=true;expect(c.deckWordsBegun('n2')).toBe(99);
  });
  it('enters the real legacy render path normally and dynamically selects the shared mount only when bound',async()=>{
    let shared=false;const calls=[],p=productContext('decks/player/mount.js',['render'],{
      window:{localStorage:{}},isSharedStudyMode:()=>shared,isSharedDeck:id=>SHARED_DECKS.includes(id),mountRequest:0,ctx:null,pendingStart:null,
      ensureCss(){throw Error('legacy-render-entered');},sharedPlayer:async()=>({render:()=>calls.push('shared'),renderSharedFence:()=>calls.push('fenced')}),
    });
    await expect(p.render({}, {deckId:'n2'})).rejects.toThrow('legacy-render-entered');expect(calls).toEqual([]);
    shared=true;await p.render({}, {deckId:'n2'});await p.render({}, {deckId:'kotoba-mine'});expect(calls).toEqual(['shared','fenced']);
  });
  it('runs the independently pinned distribution/content verifier in the unit test lane',()=>{
    const result=spawnSync(process.execPath,[new URL('../scripts/verify-shared-study.mjs',import.meta.url).pathname],{encoding:'utf8'});
    expect(result.status,result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).tasks).toEqual({tasks:8508,vocabulary:7930,grammar:578});
  });
  it('authenticates the bundled verifier before a substituted successful no-op can execute',()=>{
    const fixture=mkdtempSync(join(tmpdir(),'bunki-verifier-mutation-')),scripts=join(fixture,'scripts'),vendor=join(fixture,'prototypes/corridor/vendor/shared-study-engine');
    try {
    mkdirSync(scripts,{recursive:true});mkdirSync(join(vendor,'tools'),{recursive:true});
    writeFileSync(join(scripts,'verify-shared-study.mjs'),readFileSync(new URL('../scripts/verify-shared-study.mjs',import.meta.url)));
    writeFileSync(join(scripts,'shared-study-pin.json'),readFileSync(new URL('../scripts/shared-study-pin.json',import.meta.url)));
    writeFileSync(join(vendor,'engine-manifest.json'),readFileSync(new URL('vendor/shared-study-engine/engine-manifest.json',root)));
    writeFileSync(join(vendor,'tools/verify_engine.mjs'),"console.log('UNTRUSTED_VERIFIER_EXECUTED'); export function verifyEngineDistribution(){return {verified:true};}\n");
    const result=spawnSync(process.execPath,[join(scripts,'verify-shared-study.mjs')],{encoding:'utf8'});
    expect(result.status).not.toBe(0);expect(result.stderr).toContain('Canonical verifier differs from reviewed Bunki pin');expect(result.stdout).not.toContain('UNTRUSTED_VERIFIER_EXECUTED');
    } finally {rmSync(fixture,{recursive:true,force:true});}
  });
  it('maps all 8508 frozen tasks with exact pack IDs and canonical projection identity',()=>{
    expect(content.catalog).toHaveLength(8508);expect(content.catalog.filter(e=>e.player)).toHaveLength(7930);
    const canonical=read('data/shared-study/registry.json');
    const a=createStudyEngine({content,learner:'test-full'}).replay([]);
    const b=createStudyEngine({content:{...content,registry:canonical},learner:'test-full'}).replay([]);
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    for(const[id,row]of Object.entries(binding.packs))expect(createHash('sha256').update(readFileSync(new URL(`decks/${id}/deck.json`,root))).digest('hex')).toBe(row.sha256);
  });
  it('refuses changed frozen card identity before opening a learner store',()=>{
    const broken=structuredClone(binding);broken.rows[0][8]='renamed-card';expect(()=>decodeSharedContent(broken,decks,pin)).toThrow('shared-card-identity');
  });
  it('refuses a changed frozen word identity even when its existing card ID still matches',()=>{
    const broken=structuredClone(binding);broken.rows[0][7]='different-word';expect(()=>decodeSharedContent(broken,decks,pin)).toThrow('shared-card-identity');
  });
  it('rebuilds a compact reviewed source excerpt with the same production generator',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/shared-study-content-source.json',import.meta.url)));
    const rebuilt=buildSharedStudyBinding(fixture.input);
    expect(createHash('sha256').update(JSON.stringify(rebuilt)+'\n').digest('hex')).toBe(fixture.expectedBindingSha256);
    expect(rebuilt.counts).toEqual({tasks:6,vocabulary:4,grammar:2});
    for(const change of [input=>{input.catalog[0].ja+='違う';},input=>{input.catalog[0].en+='changed';},input=>{input.catalog[0].rubySegments=[];},input=>{input.catalog.at(-1).form='wrong';}]){
      const changed=structuredClone(fixture.input);change(changed);expect(()=>buildSharedStudyBinding(changed)).toThrow();
    }
    const incomplete=structuredClone(fixture.input);delete incomplete.expected;expect(()=>buildSharedStudyBinding(incomplete)).toThrow('Incomplete frozen inventory');
  });
  it('refuses fixture initialization outside both test scopes before any storage write or callback',async()=>{
    for(const [learner,environment]of [['real-learner','test-shared'],['test-shared','production'],['real-learner','production']]){
      const storage=memory();let initialized=0;
      await expect(createBunkiStudyAdapter({content:small,storage,identity:{learner,environment,installation:'test-bunki',mode:'fresh'},initialize:()=>{initialized++;}})).rejects.toThrow('shared-fixture-scope-required');
      expect(initialized).toBe(0);expect(storage.writes).toBe(0);
    }
  });
  it('same actual backend command has byte-identical events and projection in both consumers',async()=>{
    const {adapter:a}=await fixture();const engine=createStudyEngine({content:small,learner:'test-shared'}),store=await engine.createFreshStore({adapter:memory(),environment:'test-shared',newInstallationId:()=> 'test-bunki',now:()=>NOW});
    await store.reconcile({events:[grant('test-bunki')],head:1});const b=await engine.connect({store,now:()=>NOW});
    const attempt=a.begin(selected[0].taskKey),intent=a.preview(attempt,1000).intents[3];
    expect((await a.submit(intent)).kind).toBe('durable');expect((await b.submitCommand(intent)).kind).toBe('durable');
    expect(canonicalStringify(await a.store.readState())).toBe(canonicalStringify(await store.readState()));
  });
  it('frozen intent retry after lost acknowledgement appends exactly one event',async()=>{
    const {adapter,storage}=await fixture(),attempt=createBunkiAttempt(adapter,selected[0].taskKey);attempt.reveal(1000);const before=storage.writes;storage.loseAck();
    const [a,b]=await Promise.all([attempt.grade(3),attempt.grade(3)]);expect(a.kind).toBe('durable');expect(b.eventId).toBe(a.eventId);expect(storage.writes-before).toBe(1);expect((await adapter.store.status()).locallyDurable).toBe(1);
    await expect(attempt.grade(1)).rejects.toThrow('retry-original-rating');
  });
  it('shares permits across decks and leaves practice schedules unchanged',async()=>{
    const {adapter}=await fixture();const first=createBunkiAttempt(adapter,selected[0].taskKey);first.reveal(1000);await first.grade(3);
    const second=createBunkiAttempt(adapter,selected[2].taskKey);second.reveal(1000);await second.grade(3);
    expect(Object.values(adapter.backend.readProjection().permits).filter(p=>!p.usedBy)).toHaveLength(0);
    expect(adapter.backend.queue().some(e=>e.taskKey===selected[1].taskKey)).toBe(false);
    const before=canonicalStringify(adapter.backend.readProjection().tasks),attempt=adapter.begin(selected[1].taskKey,{practice:true});
    expect((await adapter.backend.practice(attempt,3,1000)).kind).toBe('observation-only');expect(canonicalStringify(adapter.backend.readProjection().tasks)).toBe(before);
  });
  it('bounds deck summaries by owned permits and preserves begun/due after an undone introduction',async()=>{
    const {adapter}=await fixture('test-bunki',memory(),[grant('test-bunki',1)]);
    expect(adapter.backend.queue({module:'n2'})).toHaveLength(2);
    expect(await adapter.summary('n2')).toMatchObject({due:0,fresh:1,total:1,begun:0});
    const attempt=createBunkiAttempt(adapter,selected[0].taskKey);attempt.reveal(1000);const grade=await attempt.grade(3);
    const task=adapter.backend.readProjection().tasks[selected[0].taskKey];
    expect((await adapter.submit(adapter.backend.command('undo',{taskKey:task.taskKey,parent:task.head,target:grade.eventId}))).kind).toBe('durable');
    expect(adapter.backend.readProjection().tasks[task.taskKey].card).toBe(null);
    expect(await adapter.summary('n2')).toMatchObject({due:1,fresh:0,total:1,begun:1});
  });
  it('never includes another installation permits in a deck new-card count',async()=>{
    const {adapter}=await fixture('test-bunki',memory(),[grant('test-bunki',1,1),grant('test-phone',8,2)]);
    expect(adapter.backend.queue({module:'n2'})).toHaveLength(2);
    expect(await adapter.summary('n2')).toMatchObject({due:0,fresh:1,total:1});
  });
  it('keeps the grammar deck limited to the exact canonical grammar task IDs',async()=>{
    const {adapter}=await fixture();
    expect(adapter.entries('shared-grammar').map(entry=>entry.taskKey)).toEqual([selected[3].taskKey]);
    expect(await adapter.summary('shared-grammar')).toMatchObject({due:0,fresh:1,total:1,words:1});
    expect(adapter.sitting('shared-grammar').entry.taskKey).toBe(selected[3].taskKey);
  });
  it('missed terms exclude passing grades, other decks, old cutoffs and undone Again reviews',async()=>{
    const {adapter}=await fixture();
    const again=createBunkiAttempt(adapter,selected[0].taskKey);again.reveal(1000);const grade=await again.grade(1);
    expect(await adapter.missedTerms('n2')).toEqual([{term:selected[0].term,reading:selected[0].reading,at:NOW,deck:'n2'}]);
    expect(await adapter.missedTerms('n1')).toEqual([]);expect(await adapter.missedTerms('n2',NOW+1)).toEqual([]);
    const task=adapter.backend.readProjection().tasks[selected[0].taskKey];await adapter.submit(adapter.backend.command('undo',{taskKey:task.taskKey,parent:task.head,target:grade.eventId}));
    expect(await adapter.missedTerms('n2')).toEqual([]);
    const good=createBunkiAttempt(adapter,selected[0].taskKey);good.reveal(1000);await good.grade(3);expect(await adapter.missedTerms('n2')).toEqual([]);
  });
  it('refuses stale shown attempts and unbound legacy contract names',async()=>{
    const {adapter}=await fixture(),attempt=adapter.begin(selected[0].taskKey);await adapter.backend.mutate('suspend',attempt.taskKey,{on:true});
    expect(()=>adapter.preview(attempt,1000)).toThrow('stale-attempt');expect(()=>adapter.sitting('context-dense')).toThrow('unmapped-shared-contract');expect(()=>adapter.begin('word:木')).toThrow('unmapped-shared-task');
  });
  it('two offline installations converge on one admitted review and one shared history',async()=>{
    const events=[grant('test-bunki',2,1),grant('test-standalone',2,2)];
    const {adapter:a}=await fixture('test-bunki',memory(),events),{adapter:b}=await fixture('test-standalone',memory(),events);
    for(const adapter of[a,b]){const attempt=createBunkiAttempt(adapter,selected[0].taskKey);attempt.reveal(1000);expect((await attempt.grade(3)).kind).toBe('durable');}
    const localA=Object.values((await a.store.readState()).local)[0],localB=Object.values((await b.store.readState()).local)[0];
    const canonical=[...events,{event:localA.event,bodyHash:localA.bodyHash,seq:3,rt:NOW,authority:'device'},{event:localB.event,bodyHash:localB.bodyHash,seq:4,rt:NOW,authority:'device'}];
    for(const adapter of[a,b]){await adapter.store.reconcile({events:canonical,head:4});await adapter.backend.refresh();}
    expect(canonicalStringify(a.backend.readProjection())).toBe(canonicalStringify(b.backend.readProjection()));expect(a.backend.readProjection().reviews).toHaveLength(1);expect(a.backend.readProjection().outcomes[localB.event.id].status).toBe('observation');
  });
  it('reopens pending history without inventing new identity or granting new permits',async()=>{
    const {adapter,storage}=await fixture(),attempt=createBunkiAttempt(adapter,selected[0].taskKey);attempt.reveal(1000);await attempt.grade(3);
    const reopened=await createBunkiStudyAdapter({content:small,storage,identity:{learner:'test-shared',environment:'test-shared',installation:'test-bunki',mode:'open'},now:()=>NOW});
    expect(canonicalStringify(reopened.backend.readProjection())).toBe(canonicalStringify(adapter.backend.readProjection()));expect((await reopened.store.status()).pendingUpload).toBe(1);
  });
  it('fences corpus growth until exact host source history passes the canonical additive gate',async()=>{
    const {adapter,storage}=await fixture(),attempt=createBunkiAttempt(adapter,selected[0].taskKey);attempt.reveal(1000);await attempt.grade(3);
    const before=await adapter.store.readState(),expanded=structuredClone(small),noteGuid='test-factory-note',passageId='test-factory-passage',lexemeId='test-factory-lexeme';
    const task={...expanded.registry.tasks[0],noteGuid,passageId,lexemeId,player:{deckId:'kotoba-generated',wordId:'test-factory-word',cardId:passageId},taskKey:JSON.stringify([noteGuid,'vocabulary.read.v1',passageId])};
    expanded.registry.tasks.push(task);expanded.registry.notes.push({noteGuid,module:'kotoba'});expanded.registry.passages.push({passageId,sourceJaSha256:'f'.repeat(64)});
    expanded.catalog.push({...expanded.catalog[0],...task,module:'kotoba',contentRevision:'f'.repeat(64),factoryGenerated:true});
    const options={content:expanded,storage,identity:{...adapter.identity,mode:'open'},now:()=>NOW},writes=storage.writes;
    await expect(createBunkiStudyAdapter(options)).rejects.toThrow('Exact previous registry snapshot required');
    const altered=structuredClone(small.registry);altered.tasks[0].inventedHistoricalField=true;
    await expect(createBunkiStudyAdapter({...options,readPreviousRegistry:async()=>altered})).rejects.toThrow('Frozen identity row changed');
    const unsupported=structuredClone(expanded);unsupported.catalog.at(-1).factoryGenerated=false;
    await expect(createBunkiStudyAdapter({...options,content:unsupported,readPreviousRegistry:async()=>small.registry})).rejects.toThrow('Unknown added task identity');
    expect(storage.writes).toBe(writes);
    const reopened=await createBunkiStudyAdapter({...options,readPreviousRegistry:async()=>small.registry}),after=await reopened.store.readState();
    for(const field of ['scope','epoch','nextDseq','locallyDurable','acknowledged','appliedSeq','head','local','canonical'])expect(canonicalStringify(after[field])).toBe(canonicalStringify(before[field]));
    for(const[key,task]of Object.entries(before.projection.tasks))expect(after.projection.tasks[key]).toEqual(task);
    expect(after.projection.tasks[task.taskKey].card).toBe(null);expect((await reopened.store.status()).pendingUpload).toBe(1);
  });
});
