import {describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {decodeSharedContent,SHARED_DECKS} from '../prototypes/corridor/shared-study-content.mjs';
import {createBunkiStudyAdapter,createBunkiAttempt} from '../prototypes/corridor/study-engine-adapter.mjs';
import {createStudyEngine,createMemoryAdapter,dayBounds,payloadHash,canonicalStringify} from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
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

describe('Bunki canonical shared study consumer',()=>{
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
