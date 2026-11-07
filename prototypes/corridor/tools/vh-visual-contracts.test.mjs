import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactRoster, selection, scopeResult, DESIGN_CASES, designSelection, READING_CASES, plainBadBreak,
  loadMixedLexemes, classEvidence, specialEvidence, loadSpecialProofs, shelfEvidence, sweepSelection, blockRosterHolds, shelfContract,
  shelfDropOrder, shelfNeighborViolations, shelfMutationControls, shelfOrderCollection, shelfOrderVerdict, shelfDriftControl } from './vh-visual-contracts.mjs';
const site = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./vh-reading-special-fixtures.json', import.meta.url)));
const proofs = loadSpecialProofs(site, fixture);

test('V01 mixed-script-verb-split: lexical oracle rejects real inflections and allows interword boundaries', () => {
  const lexemes = loadMixedLexemes(site);
  for (const text of ['サボ|る', 'サボ|った', 'メモ|ります', 'ググ|らない', '並|ぶ', '熟語|の', '12|月']) {
    assert(plainBadBreak(text.replace('|', ''), text.indexOf('|'), lexemes), text);
  }
  for (const text of ['先生|ことば', '通常版|この', '1.2.1|通常版', 'サービス|ことば']) {
    assert.equal(plainBadBreak(text.replace('|', ''), text.indexOf('|'), lexemes), '', text);
  }
});

test('V05 drop-duplicate-hides-omission preserves old count/membership yet exact predicate bites', () => {
  const expectedIds = ['A', 'B', 'C', 'D', 'tail'];
  const candidate = { expectedIds, blocks: [['A', 'B', 'C', 'D']], series: [], ids: expectedIds };
  assert.deepEqual(shelfEvidence(candidate), { roster: true, blocks: true, series: true, adjustedPrefix: ['A','B','C','D'], order: true });
  const duplicate = ['A','B','A','D','tail'];
  assert.equal(duplicate.slice(0,4).length, candidate.blocks[0].length);
  assert(duplicate.slice(0,4).every(id => candidate.blocks[0].includes(id)));
  assert.equal(shelfEvidence({ ...candidate, ids: duplicate }).roster, false);
  assert.equal(shelfEvidence({ ...candidate, ids: duplicate }).blocks, false);
  assert(shelfEvidence(candidate).roster);
});

test('V05 series-book-order-swapped and day-two-drop-order-drift; legal pulled members/tails retained', () => {
  const ids = ['A','aozora:049966-1','aozora:049966-2','B','C','tail1','tail2'];
  const base = { expectedIds: ids, blocks: [['A','aozora:049966-1','aozora:049966-2','B'],['C']],
    series: [['aozora:049966-1','aozora:049966-2']], ids, prefix: ids.slice(0,5) };
  assert(Object.entries(shelfEvidence(base)).filter(([key]) => key !== 'adjustedPrefix').every(([, value]) => value));
  const swap = [...ids]; [swap[1],swap[2]] = [swap[2],swap[1]];
  assert.equal(shelfEvidence({...base,ids:swap}).series,false);
  const dayTwo = [...ids]; [dayTwo[0],dayTwo[3]] = [dayTwo[3],dayTwo[0]];
  const changed = shelfEvidence({...base,ids:dayTwo});
  assert(changed.roster && changed.blocks && changed.series && !changed.order);
  const legalTail = [...ids]; [legalTail[5],legalTail[6]]=[legalTail[6],legalTail[5]];
  assert(shelfEvidence({...base,ids:legalTail}).order);
});

const classEntry = { seq:'1221270', proofs:[{ seq:'1221270',form:'かえる',reading:'かえる',gloss:'to return',senseIndex:0,pos:['v5r','vi'] }] };
test('V06 class-proof-missing is unproved; noun substitution fails; exact v5r restores', () => {
  assert(classEvidence('動詞',classEntry).proved);
  const missing = classEvidence('動詞',{...classEntry,p:'verb',pos:['v5r'],proofs:[]});
  assert(missing.unknown && !missing.proved, 'quick dictionary prose POS does not lend proof');
  const noun = classEvidence('動詞',{...classEntry,proofs:[{...classEntry.proofs[0],pos:['n']}]});
  assert(!noun.unknown && !noun.proved);
  assert(classEvidence('動詞',classEntry).proved);
  assert(!classEvidence('動詞',{...classEntry,proofs:[]},true).proved, 'expression spelling alone is not POS proof');
  assert(classEvidence('動詞',{...classEntry,proofs:[{...classEntry.proofs[0],pos:['exp']}]},true).proved);
});

test('V07 source-bound positive name/reading fixtures; enabled or unexplained Save fails', () => {
  assert.equal(proofs.size,56);
  for (const key of ['aozora:000628#76','bunki-graded-n3-hashira-counter#242']) {
    const proof = proofs.get(key), token = {s:proof.surface,r:proof.reading};
    const card = {word:token.s,reading:token.r,gloss:`a ${proof.kind} in this text`,take:{disabled:true},reason:'So it can’t be saved here.',reasonVisible:true};
    const args={article:proof.article,index:proof.index,token,proof,card};
    assert.deepEqual(specialEvidence(args),{classification:true,asWritten:true,held:true});
    assert.equal(specialEvidence({...args,card:{...card,take:{disabled:false}}}).held,false);
    assert.equal(specialEvidence({...args,card:{...card,reason:''}}).held,false);
    assert.equal(specialEvidence({...args,card:{...card,reasonVisible:false}}).held,false);
    assert.equal(specialEvidence({...args,proof:{...proof,index:proof.index+1}}).classification,false);
  }
});

test('V07 ordinary-verb-labeled-name/reading: exact as-written and held Save cannot authorize classification', () => {
  const article=JSON.parse(readFileSync(resolve(site,'data/articles/aozora-000628.json')));
  const token=article.tokens[2117]; assert.equal(token.s,'かえり');
  for (const kind of ['name','reading']) {
    const judged=specialEvidence({article:article.id,index:2117,token,proof:proofs.get(`${article.id}#2117`),
      card:{word:'かえり',reading:'かえり',gloss:`a ${kind} in this text`,take:{disabled:true},reason:'held',reasonVisible:true}});
    assert.deepEqual(judged,{classification:false,asWritten:true,held:true});
  }
});

test('ROSTER empty, unknown and duplicate selectors fail before browser work', () => {
  for(const value of ['',',','special,','bogus','special,special']) assert.throws(()=>selection(value,READING_CASES,'READING_TRUTH_ONLY'));
  assert.equal(selection(undefined,READING_CASES,'READING_TRUTH_ONLY'),null);
  assert.deepEqual(selection('special,sweep',READING_CASES,'READING_TRUTH_ONLY'),['special','sweep']);
  for(const argv of [['--g3-only','--spacing-only'],['--g3-only','--g3-only'],['--only'],['--wat']]) assert.throws(()=>designSelection(argv));
});

test('ROSTER exact declaration and same-count duplicate/missing/filtered controls', () => {
  assert.equal(DESIGN_CASES.length,50);
  for(const [argv,count] of [[[],50],[['--g3-only'],7],[['--spacing-only'],2],[['--design-fixes-only'],6]]) {
    const selected=designSelection(argv); assert.equal(selected.cases.length,count);
    const result=scopeResult({expected:selected.cases,observed:selected.cases,passed:true,diagnostic:selected.diagnostic});
    assert.equal(result.fullAcceptance,argv.length===0); assert.equal(result.exitCode,argv.length?3:0);
  }
  const observed=[...DESIGN_CASES]; observed[2]=observed[1];
  assert.equal(scopeResult({expected:DESIGN_CASES,observed,passed:true}).exitCode,1);
  assert.equal(exactRoster([],[]),false);
  assert.equal(scopeResult({expected:['chromium/a','webkit/a'],observed:['chromium/a'],passed:true}).fullAcceptance,false);
  assert.equal(scopeResult({expected:DESIGN_CASES,observed:DESIGN_CASES,passed:true,diagnostic:true}).fullAcceptance,false);
});

test('SWEEP an explicit selector, even KAIRO_SWEEP_MODE=verify, keeps the sweep diagnostic', () => {
  const plain = sweepSelection({});
  assert.deepEqual(plain, { mode:'verify', negative:'', selectors:{}, diagnostic:false });
  const expected=['S01/a','S02/a'];
  assert.equal(scopeResult({expected,observed:expected,passed:true,diagnostic:plain.diagnostic}).fullAcceptance,true);
  for (const [env,mode] of [[{KAIRO_SWEEP_MODE:'verify'},'verify'],[{KAIRO_SWEEP_MODE:'inventory'},'inventory'],[{KAIRO_SWEEP_NEGATIVE:'chip'},'verify']]) {
    const scope=sweepSelection(env);
    assert.equal(scope.mode,mode); assert.deepEqual(scope.selectors,env); assert.equal(scope.diagnostic,true);
    const verdict=scopeResult({expected,observed:expected,passed:true,diagnostic:scope.diagnostic});
    assert.equal(verdict.fullAcceptance,false); assert.equal(verdict.exitCode,3);
  }
  for (const env of [{KAIRO_SWEEP_MODE:''},{KAIRO_SWEEP_MODE:'full'},{KAIRO_SWEEP_NEGATIVE:''},{KAIRO_SWEEP_NEGATIVE:'all'}]) assert.throws(()=>sweepSelection(env));
});

const SHELF_DAYS=['2026-10-19','2026-10-20','2026-10-21','2026-10-22'];
const DROP=['n0','n1','n2','n3','aozora:049966-1','aozora:049966-2'],OLDER=['o0','o1','o2'],TAIL=['t0','t1','t2','t3'];
const shelfFixture=(()=>{
  const queued=[...DROP,...OLDER],expectedIds=[...queued,...TAIL];
  return {contract:{expectedIds,blocks:[DROP,OLDER],series:[['aozora:049966-1','aozora:049966-2']],
    originals:queued.map(id=>({id,fields:[`field-${id}`],style:`style-${id}`}))},rows:expectedIds.map(id=>({id,lane:'feature'}))};
})();
const DROP_LENGTH=DROP.length+OLDER.length;
const drawnOn=(index,edit=ids=>ids)=>edit([...DROP,...OLDER,...TAIL.slice(index),...TAIL.slice(0,index)]);
const naturalDays=(edit={})=>SHELF_DAYS.map((day,i)=>({day,ids:drawnOn(i,edit[i])}));
const swapAt=(a,b)=>ids=>{const next=[...ids];[next[a],next[b]]=[next[b],next[a]];return next;};
const alwaysGreen=(shelves,prefixLength)=>({...shelfDropOrder(shelves,prefixLength),passed:true});

test('S09 shelfDropOrder: four scheduled days with one drop prefix pass while their inherited tails rotate', () => {
  const natural=naturalDays();
  assert.notDeepEqual(natural[0].ids,natural[1].ids);
  const order=shelfDropOrder(natural,DROP_LENGTH);
  assert.equal(order.passed,true);
  assert.deepEqual(order.days,SHELF_DAYS);
  assert.deepEqual(order.prefixes,SHELF_DAYS.map(()=>[...DROP,...OLDER]));
});

test('S09 a day-two-only swap of two independent drop members fails the order while roster, blocks, series and neighbours hold; restore passes', () => {
  const {contract,rows}=shelfFixture,dayTwo=swapAt(1,3);
  const mutant=naturalDays({1:dayTwo}),judged=shelfEvidence({...contract,ids:mutant[1].ids});
  assert(judged.roster&&judged.blocks&&judged.series);
  assert.deepEqual(shelfNeighborViolations(mutant[1].ids,contract,rows),[]);
  assert.equal(shelfDropOrder(mutant,DROP_LENGTH).passed,false);
  const restored=naturalDays({1:ids=>dayTwo(dayTwo(ids))});
  assert.deepEqual(restored,naturalDays());
  assert.equal(shelfDropOrder(restored,DROP_LENGTH).passed,true);
});

test('S09 a missing, duplicate, unscheduled or day-one-only matrix and an empty or overlong prefix fail', () => {
  const natural=naturalDays();
  for (const [label,shelves,length] of [
    ['three days',natural.slice(0,3),DROP_LENGTH],
    ['five days',[...natural,{day:'2026-10-23',ids:drawnOn(0)}],DROP_LENGTH],
    ['duplicate day',[natural[0],natural[1],natural[1],natural[3]],DROP_LENGTH],
    ['day-one-only',[natural[0]],DROP_LENGTH],
    ['day one four times',SHELF_DAYS.map(()=>natural[0]),DROP_LENGTH],
    ['a skipped day',[natural[0],natural[1],natural[2],{...natural[3],day:'2026-10-23'}],DROP_LENGTH],
    ['days out of order',[natural[1],natural[0],natural[2],natural[3]],DROP_LENGTH],
    ['undated day',natural.map((shelf,i)=>i===2?{ids:shelf.ids}:shelf),DROP_LENGTH],
    ['zero-length prefix',natural,0],
    ['undefined prefix length',natural,undefined],
    ['fractional prefix length',natural,4.5],
    ['prefix longer than a drawn shelf',natural.map((shelf,i)=>i===3?{...shelf,ids:shelf.ids.slice(0,DROP_LENGTH-1)}:shelf),DROP_LENGTH],
    ['blank id inside the prefix',naturalDays({2:ids=>ids.map((id,i)=>i===4?'':id)}),DROP_LENGTH],
  ]) assert.equal(shelfDropOrder(shelves,length).passed,false,label);
});

function fakeShelfPage() {
  const children=[];
  const attach=node=>Object.assign(node,{replaceWith(other){const from=children.indexOf(other);if(from>=0)children.splice(from,1);children.splice(children.indexOf(this),1,other);}});
  const item=passage=>attach({item:true,dataset:{passage},cloneNode(){return item(passage);}});
  const root={querySelectorAll:()=>children.filter(node=>node.item),
    get innerHTML(){return JSON.stringify(children.map(node=>node.item?node.dataset.passage:null));},
    set innerHTML(html){children.splice(0,children.length,...JSON.parse(html).map(item));}};
  const page={locator(selector){
    if(selector==='#shelf-reading-results .shelf-item') return {evaluateAll:async fn=>fn(root.querySelectorAll('.shelf-item'))};
    assert.equal(selector,'#shelf-reading-results');
    return {innerHTML:async()=>root.innerHTML,evaluate:async(fn,arg)=>fn(root,structuredClone(arg))};
  }};
  return {page,document:{createComment:()=>attach({comment:true})},drawn:()=>root.querySelectorAll().map(node=>node.dataset.passage),
    show:ids=>{root.innerHTML=JSON.stringify(ids);return root.querySelectorAll().map(node=>({id:node.dataset.passage}));}};
}
async function collectShelves(edit={}) {
  const fake=fakeShelfPage(),{contract,rows}=shelfFixture,previous=globalThis.document;
  globalThis.document=fake.document;
  try {
    const collection=await shelfOrderCollection(fake.page,contract,rows,{days:SHELF_DAYS,engine:'chromium',lang:'bi',
      visit:async day=>fake.show(drawnOn(SHELF_DAYS.indexOf(day),edit[SHELF_DAYS.indexOf(day)]))});
    return {collection,drawn:fake.drawn()};
  } finally { globalThis.document=previous; }
}

test('S01 day-two-drop-order-drift: the real DOM swap waits for the four-day collection and S09 judges natural, mutant and restored sets', async () => {
  const {collection,drawn}=await collectShelves();
  assert.deepEqual(drawn,drawnOn(3));
  assert.equal(collection.settled.length,8);
  assert(collection.settled.every(row=>row.passed===true&&row.id!=='day-two-drop-order-drift'),JSON.stringify(collection.settled.map(row=>[row.id,row.failures])));
  assert.equal(collection.held.length,1);
  const [held]=collection.held;
  assert.equal(held.awaiting,'S09'); assert.equal(held.passed,false); assert.equal(held.judged.order,null);
  assert.equal(held.day,SHELF_DAYS[1]); assert.deepEqual(held.mutation.pair,{a:'n1',b:'n3'});
  assert.deepEqual(held.changed,swapAt(1,3)(drawnOn(1))); assert.deepEqual(held.restored,drawnOn(1)); assert.equal(held.restoredBytes,true);
  const verdict=shelfOrderVerdict(collection,DROP_LENGTH);
  assert.equal(verdict.order.passed,true);
  const drift=verdict.controls.find(row=>row.id==='day-two-drop-order-drift');
  assert.equal(verdict.controls.length,9); assert(verdict.controls.every(row=>row.passed===true));
  assert(!Object.hasOwn(drift,'awaiting'));
  assert.equal(drift.premise.naturalBaseline,true);
  assert.deepEqual([drift.s09.natural.passed,drift.s09.mutant.passed,drift.s09.restored.passed],[true,false,true]);
  assert.deepEqual(drift.s09.natural.prefixes,verdict.order.prefixes);
  assert.deepEqual(drift.s09.mutant.prefixes,verdict.order.prefixes.map((prefix,i)=>i===1?swapAt(1,3)(prefix):prefix));
  assert.deepEqual(drift.s09.restored.prefixes,verdict.order.prefixes);
  assert.deepEqual(drift.failures,['order']); assert.deepEqual(drift.unrelated,[]);
  assert.deepEqual([drift.judged.roster,drift.judged.blocks,drift.judged.series,drift.judged.order],[true,true,true,false]);
});

test('S01 day-two-drop-order-drift is rejected when its S09 consumer is always green, or when the natural four days already drift', async () => {
  const {collection}=await collectShelves();
  const broken=shelfOrderVerdict(collection,DROP_LENGTH,alwaysGreen);
  assert.equal(broken.order.passed,true);
  const drift=broken.controls.find(row=>row.id==='day-two-drop-order-drift');
  assert.equal(drift.passed,false); assert.equal(drift.s09.mutant.passed,true); assert.deepEqual(drift.failures,[]);
  assert(broken.controls.filter(row=>row!==drift).every(row=>row.passed===true));
  const late=await collectShelves({2:swapAt(0,2)});
  const judged=shelfOrderVerdict(late.collection,DROP_LENGTH);
  assert.equal(judged.order.passed,false);
  const lateDrift=judged.controls.find(row=>row.id==='day-two-drop-order-drift');
  assert.equal(lateDrift.s09.natural.passed,false); assert.equal(lateDrift.s09.mutant.passed,false); assert.equal(lateDrift.passed,false);
  assert(late.collection.settled.every(row=>row.passed===true));
});

test('S01 day-two-drop-order-drift fails closed on a foreign baseline, a missing day or an unfinished row', async () => {
  const {collection}=await collectShelves();
  const [held]=collection.held,natural=collection.shelves.map(({day,cards})=>({day,ids:cards.map(card=>card.id)}));
  assert.equal(shelfDriftControl(held,natural,DROP_LENGTH).passed,true);
  assert.equal(shelfDriftControl(held,natural.slice(0,3),DROP_LENGTH).passed,false);
  assert.equal(shelfDriftControl(held,natural.map((shelf,i)=>i===1?{...shelf,ids:drawnOn(2)}:shelf),DROP_LENGTH).passed,false);
  assert.equal(shelfDriftControl({...held,day:SHELF_DAYS[2]},natural,DROP_LENGTH).passed,false);
  const {awaiting,...unfinished}=held;
  assert.equal(awaiting,'S09');
  assert.equal(shelfDriftControl(unfinished,natural,DROP_LENGTH).passed,false);
  assert.equal(shelfDriftControl(held,natural,0).passed,false);
});

test('S04/S06 an old drop emptied by series pulls is a legal empty block; duplicate or omitted members still fail', () => {
  const queue=[{id:'n0',kind:'original',addedAt:'2026-10-18',fields:['a'],style:'essay'},
    {id:'aozora:000001-2',kind:'aozora',addedAt:'2026-10-18',fields:['b'],style:'column'},
    {id:'aozora:000001-1',kind:'aozora',addedAt:'2026-10-10',fields:['c'],style:'dialogue'}];
  const articles=[{id:'n0'},{id:'aozora:000001-1',attribution:'青空文庫 寺田寅彦「一」',addedAt:'2026-10-10'},
    {id:'aozora:000001-2',attribution:'青空文庫 寺田寅彦「二」',addedAt:'2026-10-18'},{id:'t0'},{id:'t1'}];
  const contract=shelfContract(articles,queue);
  assert.deepEqual(contract.blocks,[['n0','aozora:000001-2','aozora:000001-1'],[]]);
  assert.deepEqual(contract.series,[['aozora:000001-1','aozora:000001-2']]);
  const drawn=ids=>{let at=0;return contract.blocks.map(block=>ids.slice(at,at+=block.length));};
  const holds=ids=>contract.blocks.every((block,i)=>blockRosterHolds(block,drawn(ids)[i]));
  const legal=['n0','aozora:000001-1','aozora:000001-2','t0','t1'];
  assert.equal(holds(legal),true);
  assert.equal(contract.blocks.every((block,i)=>exactRoster(block,drawn(legal)[i])),false);
  assert.equal(exactRoster([],[]),false);
  const evidence=shelfEvidence({...contract,ids:legal});
  assert(evidence.roster&&evidence.blocks&&evidence.series);
  assert.equal(holds(['n0','aozora:000001-1','aozora:000001-1','t0','t1']),false);
  assert.equal(holds(['n0','aozora:000001-1','t0','aozora:000001-2','t1']),false);
  assert.equal(blockRosterHolds([],['t0']),false);
  assert.equal(blockRosterHolds(['n0'],[]),false);
  assert.equal(blockRosterHolds(['n0','n0'],['n0','n0']),false);
  assert.equal(blockRosterHolds(undefined,[]),false);
});
