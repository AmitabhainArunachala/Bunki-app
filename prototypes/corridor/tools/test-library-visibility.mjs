/** Actual source helpers, synthetic records/DOM ports. No browser or editorial approval. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const selection = JSON.parse(readFileSync(new URL('../../../docs/content/library-20261003-selection.json', import.meta.url)));
const index = JSON.parse(readFileSync(new URL('../data/articles/index.json', import.meta.url)));
const clone = value => JSON.parse(JSON.stringify(value));
function actual(name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
  assert(match, name); return match[0];
}
function fixture() {
  const c = vm.createContext({ D: { passages: index.articles }, S: {}, Set, Object, JSON });
  vm.runInContext(['libraryVisibilityPolicy', 'libraryDiscoverable', 'installLibraryVisibility'].map(actual).join('\n'), c);
  return c;
}
// This synthetic decision is never written to a catalogue or passed as John approval.
function active() {
  const policy = clone(selection.visibility); policy.active = true;
  policy.activationDecision = { authority: 'John', synthetic: false, policyId: policy.id,
    evidenceSha256: '0'.repeat(64), sourceParent: selection.parent.head,
    selectedIds: [], textHashes: {}, hideIds: policy.hideIds };
  return policy;
}
test('absent/inactive policy preserves ordered discovery and all exact source objects', () => {
  for (const raw of [undefined, selection.visibility]) {
    const c = fixture(), before = c.D.passages;
    c.installLibraryVisibility({ libraryVisibility: raw });
    assert.strictEqual(c.D.passages, before);
    assert.deepEqual(before.filter(c.D.libraryDiscoverable), before);
  }
});
test('active synthetic catalogue hides exactly99; 17 keeps and40 later rows remain;10 absent stay absent', () => {
  const c = fixture(); c.installLibraryVisibility({ libraryVisibility: active() });
  const visible = c.D.passages.filter(c.D.libraryDiscoverable);
  assert.equal(visible.length, 57);
  assert.equal(c.D.passages.filter(p => !c.D.libraryDiscoverable(p)).length, 99);
  for (const id of [...selection.visibility.keepIds, ...selection.visibility.laterIds]) assert(visible.some(p => p.id === id), id);
  for (const id of selection.visibility.alreadyAbsentIds) assert(!c.D.passages.some(p => p.id === id));
  for (const id of selection.visibility.hideIds) assert(c.D.passages.find(p => p.id === id), 'hidden source still resolvable');
});
test('malformed, synthetic and overlapping activation refuses before installing a capability', () => {
  for (const change of [p => p.activationDecision = null, p => p.activationDecision.synthetic = true,
    p => p.activationDecision.sourceParent = 'latest', p => p.hideIds.push(p.keepIds[0]),
    p => p.hideIds.push(p.hideIds[0]), p => p.activationDecision.textHashes.extra = '0'.repeat(64)]) {
    const c = fixture(), policy = active(); change(policy);
    assert.throws(() => c.installLibraryVisibility({ libraryVisibility: policy }));
    assert.equal(c.D.libraryDiscoverable, undefined);
    assert.strictEqual(c.D.passages, index.articles);
  }
});
test('shelf/search/encounters/daily and Today pass a filtered local projection to the real folding boundary', () => {
  for (const name of ['renderShelfBody', 'todayReadPick']) for (const enabled of [false, true]) {
    const c = fixture(); c.installLibraryVisibility({ libraryVisibility: enabled ? active() : undefined });
    const stop = new Error('fold boundary'), seen = [];
    Object.assign(c, { el: () => ({ dataset: {} }), shelfBodyToken: () => 'test', shelfStories: rows => { seen.push(...rows); throw stop; } });
    vm.runInContext(actual(name), c);
    assert.throws(() => c[name](), error => error === stop);
    assert.deepEqual(seen, index.articles.filter(c.D.libraryDiscoverable));
  }
});
test('versions retain the open source but do not offer hidden alternatives', () => {
  const c = fixture(); c.installLibraryVisibility({ libraryVisibility: active() }); vm.runInContext(actual('storyVersions'), c);
  const adaptations = index.articles.filter(p => p.adaptation?.basedOn);
  assert.equal(adaptations.length, 6);
  for (const easy of adaptations) {
    const original = index.articles.find(p => p.id === easy.adaptation.basedOn);
    if (original) assert.equal(c.storyVersions(original), null);
    if (original && c.D.libraryDiscoverable(original)) assert.strictEqual(c.storyVersions(easy).easy, easy);
  }
});
test('word, kanji and dictionary examples exclude hidden bodies before caps', () => {
  for (const name of ['wwPassages', 'wwKanjiPassage', 'findExamples']) {
    const c = fixture(); c.installLibraryVisibility({ libraryVisibility: active() });
    const hidden = { ...index.articles.find(p => selection.visibility.hideIds.includes(p.id)), tokens: [{s:'窓',b:'窓',c:true},{s:'。'}] };
    const visible = { ...index.articles.find(p => selection.visibility.keepIds.includes(p.id)), tokens: [{s:'窓',b:'窓',c:true},{s:'。'}] };
    c.D.passages = [hidden, visible];
    Object.assign(c, { wwPassageIndex: () => ({bases:new Set(['窓']),text:'窓。'}),
      wwSentences: (p, _pred, _cap, out) => out.push({passage:p.id}), bankExamplesFor: () => [],
      learnerSourceLabel: p => p.title });
    vm.runInContext(actual(name), c);
    const result = c[name]('窓', 1); assert.equal((Array.isArray(result) ? result[0] : result).passage, visible.id);
  }
});
test('automatic sky defaults exclude hidden sources; explicit hidden destination remains valid', () => {
  const c = fixture(); c.installLibraryVisibility({libraryVisibility:active()});
  const stop = new Error('render boundary'), chosen=[];
  Object.assign(c,{ recordEpoch:1, scaleNavigationAllowed:()=>true,scaleName:()=> 'sky',scalePassage:()=>null,
    passage:()=>null,window:{},retireScaleTransients(){},scaleShelfView:p=>{chosen.push(p.id);throw stop;} });
  vm.runInContext(actual('scaleIn'),c);
  assert.throws(()=>c.scaleIn(),e=>e===stop); assert(c.D.libraryDiscoverable(index.articles.find(p=>p.id===chosen[0])));
  assert.throws(()=>c.scaleIn({articleId:selection.visibility.hideIds[0]}),e=>e===stop);
  assert.equal(chosen[1],selection.visibility.hideIds[0]);
});
test('entry seeds and practice options use the same capability; captured originals preload independently', () => {
  const c=fixture();c.installLibraryVisibility({libraryVisibility:active()});
  c.readingModule={readingSettings:()=>({startingLevel:'N5',challenge:'comfortable'})};
  vm.runInContext(actual('sentenceReadingOptions'),c);
  assert.deepEqual(clone(c.sentenceReadingOptions(null).candidateIds),index.articles.filter(c.D.libraryDiscoverable).map(p=>p.id));
  const seeds=[];c.S.variants={contrast:'wcag'};c.tx=(_ja,en)=>en;
  c.el=(tag,cls,text)=>{if(cls==='field-word')seeds.push(text);return {style:{},dataset:{},append(){},addEventListener(){}};};c.D.passages=[
    {...index.articles.find(p=>!c.D.libraryDiscoverable(p)),seeds:['hidden']},
    {...index.articles.find(c.D.libraryDiscoverable),seeds:['visible']}];
  vm.runInContext(actual('renderEntry'),c);
  c.renderEntry({style:{},append(){}});
  assert.deepEqual(seeds,['visible']);
  assert.match(actual('renderSentenceReadingSuggestions'),/originals\.has\(p\.id\) \|\|\s*\(D\.libraryDiscoverable/);
});

// Exact changed source modules are staged outside the repository with accepted,
// unchanged compiled domain dependencies. The receipt names this source proof;
// it is not a new build or a native test.
const proof = process.env.KAIRO_LIBRARY_SOURCE_PROOF;
assert(proof, 'KAIRO_LIBRARY_SOURCE_PROOF required');
const api = await import(pathToFileURL(resolve(proof,'sentence-practice.mjs')));
const {createTeacherContext}=await import(pathToFileURL(resolve(proof,'teacher-context.mjs')));
const hash=text=>createHash('sha256').update(text).digest('hex');
const articles=index.articles.map(p=>({...p,...JSON.parse(readFileSync(new URL('../data/articles/'+p.file,import.meta.url)))}));
const morning=articles.find(p=>p.id==='bunki-graded-n5-morning'),station=articles.find(p=>p.id==='bunki-graded-n5-station');
let serial=0;const uuid=()=>`90000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
const time=()=>new Date(Date.UTC(2026,8,13)+ ++serial*1000).toISOString();
async function recordFor(p=morning){
  const index=p.tokens.findIndex(t=>t.s==='窓');let start=index,end=index+1;
  while(start>0&&!['。','！','？'].includes(p.tokens[start-1].s))start--;
  while(end<p.tokens.length&&!['。','！','？'].includes(p.tokens[end-1].s))end++;
  const surfaces=p.tokens.map(t=>t.s);
  const context=await createTeacherContext({sourceKind:'bundled-passage',sourceId:p.id,sourceDigest:hash(JSON.stringify(surfaces)),
    unit:'token-index',start,end,index,quote:surfaces.slice(start,end).join(''),title:p.title,attribution:p.attribution,url:p.url||null,target:{type:'word',id:'窓'}});
  const prepared=api.prepareBundledSentencePractice(context,surfaces);
  return {sentencePractice:api.acceptSentencePractice(null,api.createSentencePractice({...prepared,modes:['cloze','production'],at:time(),id:uuid()})),
    teacherContexts:{entries:[context]},taken:[],revlog:[],readDone:{},readerPos:{[p.id]:{y:125}},returnTicket:{sourceId:p.id}};
}
test('default equals null eligibility; hidden history validates; visible next survives limit1',async()=>{
  const record=await recordFor(),before=clone(record);
  const alternative={...clone(station),id:'visible-alternative',title:'Visible alternative',chars:station.chars+100,
    tokens:[...clone(station.tokens),{s:'別',b:'別',r:'べつ',c:true,p:'名詞',f:[]}]};
  const sources=[morning,station,alternative];
  assert.deepEqual(api.recommendSentenceReadings(record,sources),api.recommendSentenceReadings(record,sources,{candidateIds:null}));
  assert.equal(api.recommendSentenceReadings(record,sources)[0].context.sourceId,station.id);
  const result=api.recommendSentenceReadings(record,sources,{candidateIds:[alternative.id],limit:1});
  assert.equal(result[0].context.sourceId,alternative.id);assert.equal(result[0].fromContext.sourceId,morning.id);
  assert.deepEqual(api.recommendSentenceReadings(record,sources,{candidateIds:[]}),[]);assert.deepEqual(record,before);
  for(const bad of ['all',[station.id,station.id],['missing'],{},[null]])assert.throws(()=>api.recommendSentenceReadings(record,sources,{candidateIds:bad}));
  assert.deepEqual(record,before);
});
test('hidden saved-practice revisit survives empty new-context eligibility and keeps exact source',async()=>{
  const record=await recordFor(),entryId=record.sentencePractice.entries[0].plan.id,responseId=uuid();
  record.sentencePractice=api.appendSentenceResponse(record.sentencePractice,{entryId,mode:'cloze',at:time(),id:responseId,text:'戸',revealed:false,latencyMs:1500});
  const at=time();record.sentencePractice=api.appendSentenceGrade(record.sentencePractice,{responseId,grade:'again',at,id:uuid(),revlogIndex:0}).root;
  record.revlog.push([Date.parse(at),`sentence:${entryId}`,1]);const before=clone(record);
  const next=api.recommendSentenceReadings(record,[morning,station],{candidateIds:[]})[0];
  assert.equal(next.kind,'revisit');assert.equal(next.context.sourceId,morning.id);assert.deepEqual(record,before);
  assert.deepEqual(api.verifyBundledSentenceSource(next.context,morning.tokens.map(t=>t.s)),next.context);
});
