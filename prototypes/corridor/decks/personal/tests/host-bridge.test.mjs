import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHostBridge} from '../host-bridge.mjs';

const paragraph = '本を読んだ。';
function fixture(overrides = {}) {
  let loads = 0, opened = null;
  const host = {
    async load() { loads++; },
    lookup: term => ['本','読む'].includes(term) ? {r:term === '本' ? 'ほん' : 'よむ',m:['fixture']} : null,
    grammars: () => [{id:'tari',p:'〜たり〜たりする'}],
    particles: () => [{id:'wo',p:'を'}],
    kanji: c => ['本','読'].includes(c),
    baseFor: surface => surface === '読んだ' ? '読む' : null,
    open(node, options) { opened = {node,options}; return Promise.resolve(); },
    close() {},
    ...overrides,
  };
  return {bridge:createHostBridge(host),get loads(){return loads;},get opened(){return opened;}};
}

test('front-side access cannot initialize or open host dictionary',async () => {
  const f = fixture(), denied = {canInteract:() => false};
  await assert.rejects(f.bridge.prepareLesson({ja:paragraph},denied),/Reveal/);
  await assert.rejects(f.bridge.lookup({t:'word',id:'本'},denied),/Reveal/);
  await assert.rejects(f.bridge.prepareLesson({ja:paragraph},{}),/Reveal/);
  assert.equal(f.loads,0); assert.equal(f.opened,null);
});

test('an in-flight load cannot reveal dictionary controls on the next front',async () => {
  let finish, access = true;
  const f = fixture({load:() => new Promise(resolve => {finish = resolve;})});
  const promise = f.bridge.lookup({t:'word',id:'本'},{canInteract:() => access});
  access = false; finish();
  await assert.rejects(promise,/Reveal/); assert.equal(f.opened,null);
});

test('reviewed segments preserve exact text, offsets and supplied readings',async () => {
  const f = fixture();
  const data = await f.bridge.prepareLesson({ja:paragraph,segments:[{text:'本',reading:'ほん'},{text:'を'},{text:'読んだ',lemma:'読む',reading:'よんだ'},{text:'。'}]}, {canInteract:() => true});
  assert.equal(data.segments.map(s => s.text).join(''),paragraph);
  assert.equal(data.coverage.authored,true);
  assert.deepEqual(data.segments[2].node,{t:'word',id:'読む'});
  assert.equal(data.segments[2].reading,'よんだ');
  assert.equal(data.segments[2].start,2); assert.equal(data.segments[2].end,5);
  assert.deepEqual(data.kanji.map(x => x.label),['本','読']);
  assert.deepEqual(data.segments[1].node,{t:'particle',id:'wo'});
});

test('unmatched sidecar falls back honestly, without invented readings',async () => {
  const f = fixture();
  const data = await f.bridge.prepareLesson({ja:'未知語。',segments:[{text:'別文',reading:'べつぶん'}]}, {canInteract:() => true});
  assert.equal(data.coverage.authored,false); assert.ok(data.coverage.unresolved > 0);
  assert.equal(data.segments.map(s => s.text).join(''),'未知語。');
  assert.ok(data.segments.every(s => !s.reading));
});

test('known surface survives an unrecognized tokenizer lemma and keeps its contextual reading',async () => {
  const f = fixture();
  const data = await f.bridge.prepareLesson({ja:'本',segments:[{text:'本',reading:'ほん',lemma:'未知の見出し'}]}, {canInteract:() => true});
  assert.deepEqual(data.segments[0].node,{t:'word',id:'本',reading:'ほん'});
});

test('only canonical identities enter the shared host; private content is omitted',async () => {
  const f = fixture();
  await f.bridge.lookup({t:'word',id:'本',privateParagraph:paragraph,from:{passage:'private',index:0},ctxScope:'para'}, {canInteract:() => true});
  assert.deepEqual(f.opened.node,{t:'word',id:'本'});
});

test('unsupported grammar stays honest and does not create a replacement entry',async () => {
  const f = fixture();
  await assert.rejects(f.bridge.lookup({kind:'grammar',grammarKey:'〜架空の文法'}, {canInteract:() => true}),/not in Bunki/);
  assert.equal(f.opened,null);
  await f.bridge.lookup({kind:'grammar',grammarKey:'〜たり〜たりする'}, {canInteract:() => true});
  assert.deepEqual(f.opened.node,{t:'grammar',id:'tari'});
});

test('a missing packaged dictionary can be retried after reconnecting',async () => {
  let attempts = 0;
  const f = fixture({async load() {if (++attempts === 1) throw new Error('offline');}});
  await assert.rejects(f.bridge.prepareLesson({ja:paragraph},{canInteract:() => true}),/offline/);
  await f.bridge.prepareLesson({ja:paragraph},{canInteract:() => true});
  assert.equal(attempts,2);
});

test('host final write boundary rejects stale capture and every assessment/history patch',() => {
  const source = readFileSync(new URL('../../../corridor.js',import.meta.url),'utf8');
  const start = source.indexOf('function commitStorePatch(patch) {');
  const end = source.indexOf('\n}\n',start) + 2;
  const state = {taken:[],lists:{},deepWords:{},srs:{original:true},revlog:[['original']]};
  let allowed = true, writes = 0;
  const commit = vm.runInNewContext(source.slice(start,end) + ';commitStorePatch', {
    S:state, personalHost:{allowed:() => allowed}, writeStore:() => {writes++;return true;},
  });
  assert.equal(commit({srs:{}}),false);
  assert.equal(commit({revlog:[]}),false);
  assert.equal(commit({taken:[{id:'本'}],obslog:[]}),false);
  assert.equal(writes,0);
  assert.equal(commit({taken:[{id:'本'}],lists:{test:[]}}),true);
  assert.equal(writes,1);
  allowed = false;
  assert.equal(commit({taken:[]}),false);
  assert.equal(writes,1);
  assert.deepEqual(state.srs,{original:true}); assert.deepEqual(state.revlog,[['original']]);
  assert.deepEqual(state.taken,[{id:'本'}]);
});
