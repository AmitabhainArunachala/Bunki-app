import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {CORRIDOR_REQUIRED_ROOTS,corridorAssetFiles} from '../../../scripts/corridor-assets.mjs';
import * as api from '../vendor/ts-fsrs.mjs';
import {createEngine} from '../decks/personal/engine.mjs';
import {validateCollection,validateEnrichment,parseImport,backup,digest,safeURL} from '../decks/personal/schema.mjs';
import {mergeEnrichment} from '../decks/personal/enrichment.mjs';
import {fixture,enrichmentFixture} from './personal-fixture.mjs';

const data = await fixture(), engine = createEngine(data,api), checks=[];
const test = async (name,fn) => { await fn(); checks.push(name); };
const now=Date.parse('2026-10-04T02:00:00.000Z');
let counter=0; const id=()=>`test-${++counter}`, fresh=()=>engine.fresh('fixture-device');
const first=engine.queue(fresh(),now).next;
const one=engine.grade(fresh(),first.id,3,id(),1000,now);
await test('original collection and exported bundle validate',async()=>{
  assert.equal((await validateCollection(data)).id,data.id);
  assert.equal((await parseImport(backup({collection:data,progress:one}))).progress.events.length,1);
});
await test('answer enrichment binds to original text without changing assessment IDs, hashes or history',async()=>{
  const enrichment=await enrichmentFixture(data), original=JSON.stringify(data);
  assert.equal((await validateEnrichment(enrichment,data)).lessons.length,8);
  const enriched={...data,enrichment};await validateCollection(enriched);
  assert.equal(enriched.contentDigest,data.contentDigest);
  assert.equal(JSON.stringify(data),original);
  assert.deepEqual(createEngine(enriched,api).cards.map(c=>c.id),engine.cards.map(c=>c.id));
  const restored=await parseImport(backup({collection:data,progress:one,enrichment}));
  assert.deepEqual(restored.progress.events,one.events);assert.deepEqual(restored.enrichment,enrichment);
  assert.deepEqual((await parseImport(enrichment)).enrichment,enrichment);
});
await test('bad readings, changed text, missing kanji coverage and incorrect edition bindings reject atomically',async()=>{
  const enrichment=await enrichmentFixture(data);
  for(const mutate of [e=>e.collectionId='foreign',e=>e.contentDigest='a'.repeat(64),e=>e.lessons[0].contentHash='b'.repeat(64),e=>e.lessons[0].segments[0].text='村',e=>delete e.lessons[0].segments[0].reading,e=>e.lessons[0].segments[0].reading='not kana',e=>e.lessons[1].id=e.lessons[0].id]) {
    const bad=structuredClone(enrichment);mutate(bad);
    const {enrichmentHash,...content}=bad;bad.enrichmentHash=await digest(content);
    await assert.rejects(()=>validateEnrichment(bad,data));
  }
  const changed=structuredClone(enrichment);changed.lessons[0].explanationJa+='別の説明。';
  await assert.rejects(()=>validateEnrichment(changed,data),/integrity/);
});
await test('answer revisions cannot downgrade or silently replace conflicting saved explanations',async()=>{
  const current=await enrichmentFixture(data);
  assert.deepEqual(mergeEnrichment(current,undefined),current);
  assert.deepEqual(mergeEnrichment(current,structuredClone(current)),current);
  assert.throws(()=>mergeEnrichment(current,{...current,enrichmentHash:'a'.repeat(64)}),/older or conflicts/);
  const next={...current,revision:2,enrichmentHash:'b'.repeat(64)};
  assert.equal(mergeEnrichment(current,next).revision,2);
  assert.throws(()=>mergeEnrichment(next,current),/older or conflicts/);
});
await test('reject malformed input, tampering, duplicate identities, unsafe sources and foreign references',async()=>{
  for (const value of [{},null,[],{...data,version:2}]) await assert.rejects(()=>parseImport(value));
  for (const mutate of [d=>d.lessons[0].ja+='別の文。',d=>d.lessons[1].id=d.lessons[0].id,d=>d.sources[0].url='javascript:alert(1)',d=>d.routes[0].ids.push('missing'),d=>d.worlds[0].id='x" onmouseover="alert(1)']) {
    const bad=structuredClone(data); mutate(bad); await assert.rejects(()=>validateCollection(bad));
  }
  assert.equal(safeURL('data:text/html,hi'),''); assert.equal(safeURL('https://user:password@example.com'),'');
});
await test('four modalities have stable, independent identities',()=>{
  assert.equal(engine.cards.length,32); assert.equal(new Set(engine.cards.map(c=>c.id)).size,32);
  assert.equal(engine.derive(one).states.size,1); assert.equal(first.id,'passage-0:meaning:v1');
  assert.match(api.FSRSVersion,/5\.4\.1.*FSRS-6/);
});
await test('view and preview create no evidence; exact due time gates reviews',()=>{
  const state=fresh(),before=JSON.stringify(state); engine.queue(state,now); engine.intervals(state,first.id,now);
  assert.equal(JSON.stringify(state),before);
  assert.equal(engine.derive(one).states.get(first.id).due.getTime(),now+600000);
  assert(!engine.queue(one,now+599999).due.some(c=>c.id===first.id));
  assert(engine.queue(one,now+600000).due.some(c=>c.id===first.id));
  assert.throws(()=>engine.grade(one,first.id,3,id(),0,now+5000),/not due/);
});
await test('related-card burial survives reload and expires on the Japan study day',()=>{
  const loaded=engine.validate(JSON.parse(JSON.stringify(one)),now);
  assert(!engine.queue(loaded,now+1000).newCards.some(c=>c.family===first.family));
  assert(engine.queue(loaded,now+86400000).newCards.some(c=>c.family===first.family&&c.id!==first.id));
  assert(engine.queue(loaded,now+600000).due.some(c=>c.id===first.id));
});
await test('undo is append-only, replay restores the prior memory state',()=>{
  const result=engine.undo(one,id(),now+1000);
  assert.equal(result.events.length,2); assert.equal(result.events[0].type,'grade'); assert.equal(result.events[1].type,'undo');
  assert.equal(engine.derive(result).states.size,0); assert.equal(engine.queue(result,now+1000).startedToday,0);
});
await test('daily new limit is shared across themes and task types',()=>{
  let state=fresh(); state.settings.newLimit=2;
  for(let i=0;i<2;i++) state=engine.grade(state,engine.queue(state,now+i).next.id,3,id(),0,now+i);
  assert.equal(engine.queue(state,now+10).newCards.length,0);
  state.settings.worlds=['city']; assert.equal(engine.queue(state,now+10).newCards.length,0);
});
await test('old or invalid backups cannot erase events; compatible history extends',()=>{
  for(const bad of [{},null,[],{...one,deck:'wrong'},{...one,scheduler:'other'},{...one,events:null}]) assert.throws(()=>engine.previewImport(one,bad,now+1000));
  assert.equal(engine.previewImport(one,fresh(),now+1000).result.events.length,1);
  const local=fresh(); local.settings.newLimit=2;
  const result=engine.previewImport(local,one,now+1000); assert.equal(result.added,1); assert.equal(result.result.settings.newLimit,2);
  const fork=engine.grade(fresh(),first.id,1,id(),0,now);
  assert.throws(()=>engine.previewImport(one,fork,now+1000),/branched/);
});
await test('invalid ratings, unknown cards, sequence gaps and backwards clocks are blocked',()=>{
  for (const mutate of [e=>e.card='unknown',e=>e.rating=5,e=>e.seq=9,e=>e.at='not a date']) {
    const bad=structuredClone(one);mutate(bad.events[0]);assert.throws(()=>engine.validate(bad,now));
  }
  assert.throws(()=>engine.pause(one,first.id,true,id(),now-600001),/clock/);
});
await test('six failures pause a card, explicit resume permits review',()=>{
  let state=fresh(),at=now;
  for(let i=0;i<6;i++){state=engine.grade(state,first.id,1,id(),0,at);at=engine.derive(state).states.get(first.id).due.getTime();}
  assert(engine.derive(state).paused(first));state=engine.pause(state,first.id,false,id(),at);
  assert(!engine.derive(state).paused(first));
});
await test('long history is never truncated and export replay is deterministic',()=>{
  const state=fresh();
  for(let i=0;i<5010;i++)state.events.push({type:'pause',card:first.id,value:i%2===0,id:`long-${i}`,seq:i+1,at:new Date(now+i).toISOString(),observedAt:new Date(now+i).toISOString()});
  assert.equal(engine.pause(engine.validate(state,now+6000),first.id,false,id(),now+7000).events.length,5011);
  const imported=engine.previewImport(fresh(),JSON.parse(JSON.stringify(one)),now).result;
  assert.deepEqual(engine.derive(imported).states,engine.derive(one).states);
});
await test('private route and all module dependencies are packaged and precached',()=>{
  const corridorDir=fileURLToPath(new URL('..',import.meta.url));
  const assembled=new Set(corridorAssetFiles(corridorDir).map(file=>relative(corridorDir,file).split(sep).join('/')));
  const scope='https://example.invalid/bunki/';
  const worker=vm.createContext({self:{registration:{scope},location:{origin:new URL(scope).origin},addEventListener(){}},
    URL,Request,Response,Headers,TextEncoder,TextDecoder,crypto:webcrypto});
  vm.runInContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),worker);
  const precached=new Set(vm.runInContext('[...SHELL,...BOOT_DATA,...GUIDED_ROOM]',worker));
  for(const path of [...['mount.mjs','engine.mjs','schema.mjs','store.mjs','enrichment.mjs','host-bridge.mjs','personal.css'].map(file=>`decks/personal/${file}`),'vendor/ts-fsrs.mjs','fonts.css']) {
    assert(CORRIDOR_REQUIRED_ROOTS.some(root=>path===root||path.startsWith(`${root}/`)),`${path} is a required release asset`);
    assert(assembled.has(path),`${path} is assembled into the release`);
    assert(precached.has(path),`${path} is precached by the service worker`);
  }
});
console.log(JSON.stringify({suite:'personal-collections',passed:checks.length,checks},null,2));
