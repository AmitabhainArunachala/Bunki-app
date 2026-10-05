import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
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

function hostWriteFixture({paused = false} = {}) {
  const source = readFileSync(new URL('../../../corridor.js',import.meta.url),'utf8');
  const start = source.indexOf('async function commitStorePatch(');
  assert.notEqual(start,-1,'The shared host must use the current asynchronous record writer');
  const end = source.indexOf('\n}\n',start) + 2;
  const clone = value => JSON.parse(JSON.stringify(value));
  const state = {taken:[],lists:{},deepWords:{},srs:{original:true},revlog:[['original']],obslog:[]};
  let record = clone(state), allowed = true, writes = 0, queued = 0, release;
  const barrier = paused ? new Promise(resolve => {release = resolve;}) : null;
  const commit = vm.runInNewContext(source.slice(start,end) + ';commitStorePatch', {
    S:state, personalHost:{allowed:() => allowed}, recordEpoch:1,
    recordWritable:() => true, publishedRecord:clone(state), DEFAULT_LEARNER_RECORD:{},
    canonicalRecordJson:JSON.stringify, safelySyncStoreAlert() {}, recordFailure() {},
    recordApp:{async write(produce) {
      queued++;
      if (barrier) await barrier;
      const result = produce(clone(record),{revision:queued});
      record = {...record,...clone(result.patch)};
      Object.assign(state,clone(record));
      writes++;
      return {status:'active',replayUiEffects:true};
    }},
  });
  return {commit,state,get record(){return record;},get writes(){return writes;},get queued(){return queued;},
    revoke(){allowed = false;},resume(){release();},replaceRecord(value){record = clone(value);}};
}

test('host final write boundary rejects stale capture and every assessment/history patch',async () => {
  const f = hostWriteFixture();
  for (const key of ['srs','revlog','obslog','assessmentLibraryV2','lessonsDone','stats','aiChat']) {
    assert.equal(await f.commit({taken:[{id:'本'}],[key]:{}}),false,`${key} cannot cross the personal host`);
  }
  assert.equal(f.writes,0);
  assert.equal(await f.commit({taken:[{id:'本'}],lists:{test:[]},deepWords:{'本':{r:'ほん'}}}),true);
  assert.equal(f.writes,1);
  f.revoke();
  const queued = f.queued;
  assert.equal(await f.commit({taken:[]}),false);
  assert.equal(f.queued,queued,'A closed personal answer must not queue a write');
  assert.equal(f.writes,1);
  assert.deepEqual(f.state.srs,{original:true}); assert.deepEqual(f.state.revlog,[['original']]);
  assert.deepEqual(f.state.taken,[{id:'本'}]);
});

test('host producers cannot smuggle assessment/history roots or archive appends',async () => {
  const f = hostWriteFixture();
  for (const key of ['srs','revlog','obslog','assessmentLibraryV2','lessonsDone','stats','aiChat']) {
    assert.equal(await f.commit(latest => ({taken:[...latest.taken,{id:'本'}],[key]:{}})),false,
      `The resolved producer patch must reject ${key}`);
  }
  assert.equal(await f.commit({taken:[{id:'本'}]},[{role:'user',text:'private'}]),false);
  assert.equal(await f.commit(() => ({taken:[{id:'本'}]}),[{role:'user',text:'private'}]),false);
  assert.equal(f.writes,0);
  assert.deepEqual(f.state.taken,[]);
  assert.deepEqual(f.state.srs,{original:true}); assert.deepEqual(f.state.revlog,[['original']]);
});

test('queued personal capture rechecks access before evaluating its producer or writing',async () => {
  const f = hostWriteFixture({paused:true});
  let produced = 0;
  const pending = f.commit(latest => {produced++; return {taken:[...latest.taken,{id:'本'}]};});
  assert.equal(f.queued,1); assert.equal(f.writes,0); assert.equal(produced,0);
  f.revoke(); f.resume();
  assert.equal(await pending,false);
  assert.equal(produced,0,'A stale answer must not evaluate its capture producer');
  assert.equal(f.writes,0); assert.deepEqual(f.state.taken,[]);
});

test('personal capture producers use the latest queued authority and publish after acknowledgment',async () => {
  const f = hostWriteFixture({paused:true});
  const pending = f.commit(latest => ({taken:[...latest.taken,{id:'本'}],lists:{...latest.lists,saved:[]}}));
  assert.deepEqual(f.state.taken,[]); assert.equal(f.writes,0);
  f.replaceRecord({...f.record,taken:[{id:'海'}],lists:{existing:[{id:'海'}]}});
  f.resume();
  assert.equal(await pending,true); assert.equal(f.writes,1);
  assert.deepEqual(f.state.taken,[{id:'海'},{id:'本'}]);
  assert.deepEqual(f.state.lists,{existing:[{id:'海'}],saved:[]});
});

test('dictionary worker error is canceled while pending requests reject and the worker resets',async () => {
  const source = readFileSync(new URL('../../../corridor.js',import.meta.url),'utf8');
  const functionSource = name => {
    const prefix = name === 'startDictionaryWorker' ? 'async function ' : 'function ';
    const start = source.indexOf(prefix + name + '(');
    assert.notEqual(start,-1,`Missing host function ${name}`);
    const end = source.indexOf('\n}\n',start) + 2;
    return source.slice(start,end);
  };
  class TestWorker extends EventTarget {
    terminated = false;
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  const requests = new Map();
  const context = vm.createContext({
    Worker:TestWorker, URL, dictionaryWorker:null,
    dictionaryWorkerRequestId:0, dictionaryWorkerRequests:requests,
  });
  // The host functions execute unchanged; only import.meta's module URL is
  // supplied explicitly because this isolated harness uses a classic VM script.
  const api = vm.runInContext([
    functionSource('stopDictionaryWorker'),
    functionSource('dictionaryWorkerRequest'),
    functionSource('startDictionaryWorker').replace('import.meta.url',JSON.stringify('https://example.invalid/corridor.js')),
    '({startDictionaryWorker,dictionaryWorkerRequest})',
  ].join('\n'),context);
  const worker = await api.startDictionaryWorker();
  const pending = ['init','rowsForForm'].map(type => api.dictionaryWorkerRequest(type).then(
    () => assert.fail('A failed worker request must reject'),
    error => error.message,
  ));
  assert.equal(requests.size,2);
  const errorEvent = new Event('error',{cancelable:true});
  Object.defineProperty(errorEvent,'message',{value:'Load failed'});
  assert.equal(worker.dispatchEvent(errorEvent),false,'The handled worker error must cancel default reporting');
  assert.equal(errorEvent.defaultPrevented,true);
  assert.deepEqual(await Promise.all(pending),['Load failed','Load failed']);
  assert.equal(requests.size,0);
  assert.equal(worker.terminated,true);
  assert.equal(context.dictionaryWorker,null);
  await assert.rejects(api.dictionaryWorkerRequest('init'),/dictionary worker is unavailable/);
  const retryWorker = await api.startDictionaryWorker();
  assert.notEqual(retryWorker,worker,'Retry must create a fresh worker');
  assert.equal(retryWorker.terminated,false);
});

test('stamped service worker returns an uncached 503 for missing offline content and serves cached core without network',async () => {
  const source = readFileSync(new URL('../../../sw.js',import.meta.url),'utf8');
  const scope = 'https://example.invalid/bunki/';
  const handlers = new Map();
  const context = vm.createContext({
    self:{registration:{scope},location:{origin:new URL(scope).origin},
      addEventListener(type,handler) { handlers.set(type,handler); }},
    URL,Request,Response,Headers,TextEncoder,TextDecoder,crypto:webcrypto,
  });
  // Derive a valid small installed generation from the actual worker's boot
  // contract. Its identity and stamped worker are validated unchanged at fetch.
  vm.runInContext(source,context);
  const required = vm.runInContext('[...new Set([...SHELL,...BOOT_DATA,...GUIDED_ROOM].filter(path => path !== "."))]',context);
  const files = new Map(required.map(path => [path,Buffer.from('fixture')]));
  const core = 'data/share_alike/dict.json', shard = 'data/share_alike/dict-v2/index.json';
  files.set(core,Buffer.from(JSON.stringify({words:{'本':{r:'ほん',m:['book']}}})));
  files.set(shard,Buffer.from('{"shards":[]}'));
  files.set('sw.js',Buffer.from(source));
  files.set('404.html',files.get('index.html'));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const inputs = [...files].filter(([path]) => path !== '404.html')
    .map(([path,bytes]) => ({path,sha256:hash(bytes)}))
    .sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const stamp = hash(JSON.stringify(inputs));
  const worker = `self.KAIRO_ASSET_VERSION = "${stamp}";\n${source}`;
  files.set('sw.js',Buffer.from(worker));
  const entries = [...files].map(([path,bytes]) => ({path,bytes:bytes.length,sha256:hash(bytes)}));
  const manifest = {schemaVersion:1,product:'KAIRO',sourceAssetSha256:stamp,
    artifactSha256:hash(JSON.stringify(entries)),files:entries};
  const cached = new Map([
    [new URL('build-identity.json',scope).href,new Response(JSON.stringify(manifest))],
    [new URL('sw.js',scope).href,new Response(worker)],
    [new URL(core,scope).href,new Response(files.get(core),{headers:{'Content-Type':'application/json'}})],
  ]);
  let networkRequests = 0, cacheWrites = 0;
  const installedContext = {
    ...context,
    self:{registration:{scope},location:{origin:new URL(scope).origin},
      addEventListener(type,handler) { handlers.set(type,handler); }},
    caches:{async open(name) {
      assert.equal(name,`kairo:${scope}:kairo-${stamp}`,'Read only the installed generation cache');
      return {async match(url) {return cached.get(typeof url === 'string' ? url : url.url)?.clone();},
        async put() {cacheWrites++;}};
    }},
    async fetch() {networkRequests++; throw new TypeError('Load failed');},
  };
  vm.runInNewContext(worker,installedContext);
  const fetchHandler = handlers.get('fetch');
  assert.equal(typeof fetchHandler,'function');
  const requestContent = async path => {
    let responsePromise, lifetime;
    fetchHandler({request:new Request(new URL(path,scope)),
      respondWith(response) {responsePromise = response;},
      waitUntil(promise) {lifetime = promise;},
    });
    assert.ok(responsePromise,'The actual service worker must handle same-origin content');
    const response = await responsePromise;
    await lifetime;
    return response;
  };
  const unavailable = await requestContent(shard);
  assert.equal(unavailable.status,503); assert.equal(unavailable.ok,false);
  assert.equal(unavailable.headers.get('Cache-Control'),'no-store');
  assert.equal(unavailable.headers.get('x-kairo-update-needed'),'1');
  assert.match(await unavailable.text(),/unavailable.*installed KAIRO version/);
  assert.equal(networkRequests,1); assert.equal(cacheWrites,0);
  const response = await requestContent(core);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{words:{'本':{r:'ほん',m:['book']}}});
  assert.equal(networkRequests,1,'A cached core dictionary must not attempt another fetch');
  assert.equal(cacheWrites,0,'An unavailable shard must not be cached');
});
