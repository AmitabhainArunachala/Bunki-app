/** Pure 3A-2 verifier. Real pinned lifecycle RULES; simulated record/CAS/device/
 * capture/owner adapters. The generated record-core import is substituted only
 * in memory by the explicit digest compatibility shim below. No build or I/O
 * writer, browser, real capture, learner record or activation is exercised. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as subject from '../m4-worldcraft.mjs';
const base = new URL('../', import.meta.url), sha = x => createHash('sha256').update(x).digest('hex');
const actual = r => { assert.equal(r.ok, true, r.reason); return r.value; };
const refuse = r => assert.equal(r.ok, false);
const copy = x => structuredClone(x), size = x => Buffer.byteLength(JSON.stringify(x));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
// Compatibility transcription of persistence/src/replication/json.ts encodeLocalJson.
// It is a test shim, NOT evidence of the built record-core or real host admission.
function encodeLocalJson(raw) {
  const ancestors = new Set(); let nodes = 0, characters = 0;
  function cp(value, depth) {
    if (++nodes > 1000000 || depth > 64 || characters > 33554432) throw Error('invalid-request');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { characters += value.length; return value; }
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value !== 'object' || value === null) throw Error('invalid-request');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (ancestors.has(value) || Object.getOwnPropertySymbols(value).length || (!array && proto !== Object.prototype && proto !== null)) throw Error('invalid-request');
    const ds = Object.getOwnPropertyDescriptors(value), keys = Object.keys(ds);
    if (keys.length > 1000000 || (array && keys.length !== value.length + 1)) throw Error('invalid-request');
    ancestors.add(value); const out = Object.create(null);
    for (const k of keys.sort()) {
      if (array && k === 'length') continue;
      const d = ds[k];
      if (!d || !('value' in d) || !d.enumerable || (array && (!/^(0|[1-9][0-9]*)$/u.test(k) || Number(k) >= value.length))) throw Error('invalid-request');
      characters += k.length; out[k] = cp(d.value, depth + 1);
    }
    ancestors.delete(value);
    return Object.freeze(array ? Array.from({ length: value.length }, (_, i) => out[String(i)]) : out);
  }
  const value = cp(raw, 0), text = JSON.stringify(value);
  if (characters > 33554432 || text.length > 33554432) throw Error('invalid-request');
  return { value, text, sha256: createHash('sha256').update(text).digest('hex') };
}
const dataURL = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const consumerSource = readFileSync(new URL('m4-worldcraft.mjs', base), 'utf8'), consumerHash = sha(consumerSource);
const lifecycleSource = readFileSync(new URL('journey-lifecycle.mjs', base), 'utf8');
const lifecycleHash = '59a523bcae9fa1d1d09312b3938cbaac6b1890be25a2cf15aff87f7698e4aaee';
assert.equal(sha(lifecycleSource), lifecycleHash);
const shimURL = dataURL("import {createHash} from 'node:crypto'; export " + encodeLocalJson.toString());
const loadLifecycle = source => import(dataURL(source.replace("'./modules/record-core.mjs'", JSON.stringify(shimURL))));
const { createLifecycle, digest, classify, authority, LIMITS } = await loadLifecycle(lifecycleSource);
const bytes = Object.fromEntries(Object.entries(subject.SOURCE_PINS).map(([k, v]) => [k, readFileSync(new URL('data/share_alike/' + v.file, base))]));
const catalogCache = new WeakMap();
async function catalogFor(api) { if (!catalogCache.has(api)) catalogCache.set(api, actual(await api.createWorldcraftCatalog(bytes))); return catalogCache.get(api); }
let fixtureSerial = 0;
async function fixture(api = subject, options = {}) {
  const catalog = await catalogFor(api), label = 'fixture-' + ++fixtureSerial;
  const saved = { status: 'active', migrationId: 'fixture-migration', scope: { profile: label, store: 'memory' }, revision: 0, commands: [], record: { untouched: 'sentinel' } };
  const binding = { epoch: 1 }, markers = new Map(), counts = { commit: 0, capture: 0, work: 0, retire: 0, hold: 0, tick: 0 };
  const c = { journeyWrites: true, worldcraftEnabled: true, owner: {}, record: {}, view: {}, navigation: {}, visit: null, carried: null,
    beforeRead: null, beforeCommit: null, capture: null, work: null, retire: null, observe: null, afterWork: null, afterRetire: null,
    settled: null, reflect: null, digest: null, query: null, commitGet: null, commitCall: null, dependency: null, mode: 'published',
    now: new Date('2026-10-27T12:00:00+09:00').getTime() };
  const invocations = [], queries = [], settlements = [], submissions = [];
  let id = 0, lc, state, owner;
  function receipt(type, journey) {
    saved.revision++;
    saved.commands.push({ format: 'kairo-local-command-receipt', version: 1, changeId: label + '-receipt-' + saved.revision,
      type, scope: copy(saved.scope), committedRevision: saved.revision, ...(journey ? { journey } : {}) });
  }
  const port = {
    snapshot: () => { if (c.dependency) c.dependency(); return copy(saved); }, binding: () => ({ ...binding }), nextId: () => label + '-journey-' + ++id,
    async commit(expected, next, meta) {
      if (c.beforeCommit) await c.beforeCommit(expected, next, meta);
      if (expected.epoch !== binding.epoch || expected.rootHash !== digest(saved.record.m4Journey ?? null) ||
        expected.generation !== authority(saved).generation) return { outcome: 'not-published', acknowledged: false };
      if (c.mode === 'not-published') return { outcome: 'not-published', acknowledged: false };
      if (c.mode === 'uncertain-absent') return { outcome: 'uncertain', acknowledged: false };
      saved.record.m4Journey = JSON.parse(encodeLocalJson(next).text); receipt('journey.lifecycle/1', meta);
      return { outcome: c.mode === 'uncertain-present' ? 'uncertain' : 'published', acknowledged: c.mode !== 'uncertain-present', rootHash: digest(next) };
    },
  };
  const commit = port.commit;
  Object.defineProperty(port, 'commit', { get() {
    if (c.commitGet) c.commitGet();
    return (...args) => { counts.commit++; submissions.push(args); return c.commitCall ? c.commitCall(...args, commit) : commit(...args); };
  } });
  const boot = async () => {
    lc = (options.lifecycleFactory ?? createLifecycle)({ port, device: { read: k => markers.get(k), write: (k, v) => { markers.set(k, copy(v)); return true; }, remove: k => markers.delete(k) || true },
      buildId: options.buildId ?? '3A-2-test', core: { endOfDay: d => d.setHours(23, 59, 59, 999), validItem: () => false },
      clock: () => c.now, enabled: true, validateCapture: () => { throw Error('not-a-real-capture-service'); } });
    await lc.ready;
  };
  await boot();
  const lifecycle = new Proxy({
    tick: async () => { counts.tick++; return lc.tick(); }, inspect: () => lc.inspect(),
    work: async (kind, data, opts) => {
      counts.work++; invocations.push({ action: 'work', operation: opts.operation }); if (c.work) await c.work(kind, data, opts);
      const wrapped = { ...opts, observe: r => { if (c.observe) c.observe(r, opts.observe); else opts.observe(r); } };
      const result = await lc.work(kind, data, wrapped); if (c.afterWork) c.afterWork(); return result;
    },
    retire: async (kind, projectId, decision, opts) => {
      counts.retire++; invocations.push({ action: 'retire-work', operation: opts.operation }); if (c.retire) await c.retire(kind, projectId, decision, opts);
      const result = await lc.retire(kind, projectId, decision, { ...opts, observe: r => c.observe ? c.observe(r, opts.observe) : opts.observe(r) });
      if (c.afterRetire) c.afterRetire(); return result;
    },
    holdUnconfirmed: () => { counts.hold++; return lc.holdUnconfirmed(); },
    preDispatchRefusal: (operation, error) => {
      const query = (...args) => lc.preDispatchRefusal(...(args.length ? args : [operation, error]));
      queries.push({ operation, error }); return c.query ? c.query(operation, error, query) : query();
    },
  }, { getPrototypeOf(target) { if (c.reflect) c.reflect(); return Object.getPrototypeOf(target); } });
  const ports = {
    read() {
      if (c.beforeRead) c.beforeRead();
      return { owner: c.owner, record: c.record, epoch: binding.epoch, boot: lc.bootIdentity(),
        journeyId: saved.record.m4Journey?.id ?? null, generation: authority(saved).generation,
        view: c.view, navigation: c.navigation, visit: c.visit, carried: c.carried,
        root: copy(saved.record.m4Journey ?? null), journeyWrites: c.journeyWrites, worldcraftEnabled: c.worldcraftEnabled };
    },
    capture: async (request, sink) => { counts.capture++; return c.capture ? c.capture(request, sink) : sink.kept(); },
    lifecycle, digest: root => { if (c.digest) c.digest(); return digest(root); },
    settledRead: async (target, signal) => { settlements.push(target); if (c.settled) return c.settled(target, signal); signal(target); },
  };
  owner = actual(api.createWorldOwner(catalog, ports)); state = actual(api.createWorldcraftState(owner));
  const reset = () => { for (const k of Object.keys(counts)) counts[k] = 0; };
  const draft = (host = '織') => actual(api.beginBuild(state, catalog, host));
  const assembled = async (host = '織') => { const d = draft(host); actual(await api.assembleBuild(state, d, actual(api.createWorldView(owner)))); return d; };
  reset();
  return { api, catalog, owner, state, saved, binding, c, counts, ports, lifecycle, draft, assembled, reset, invocations, queries, settlements, submissions,
    deliver: (...args) => commit(...args), // delayed completion of an already issued synthetic target, not another submission
    lc: () => lc, root: () => saved.record.m4Journey, bytes: () => JSON.stringify(saved.record),
    reload: async () => { binding.epoch++; await boot(); },
    restore: async () => { receipt('host.restore/2'); binding.epoch++; await boot(); },
    sync: async root => { saved.record.m4Journey = copy(root); await lc.tick(); },
  };
}
let cases = 0;
const unsupported = [];
async function test(name, body) { await body(); cases++; console.log('PASS ' + name); }
const kind = (r, expected) => assert.equal(r.kind, expected, JSON.stringify(r));
async function offOracle(api) {
  for (const flags of [[false,true],[true,false],[false,false],[undefined,true],[true,undefined],[undefined,undefined]]) {
    const f = await fixture(api), d = await f.assembled(), unassembled = f.draft(), ticket = actual(api.createWorldView(f.owner)), before = f.bytes(); f.reset();
    [f.c.journeyWrites, f.c.worldcraftEnabled] = flags;
    refuse(api.createWorldcraftState(f.owner)); refuse(api.beginBuild(f.state, f.catalog, '織'));
    refuse(await api.assembleBuild(f.state, unassembled, ticket));
    refuse(api.placeBuild(f.state, d, null)); kind(await api.keepBuild(f.state,d), 'refused');
    kind(await api.removeBuild(f.state,'unowned'), 'refused'); kind(await api.reconcileBuild(f.state,d), 'unresolved');
    assert.equal(f.bytes(), before); assert.deepEqual(f.counts, { commit:0,capture:0,work:0,retire:0,hold:0,tick:0 });
  }
}
await test('either flag OFF or missing is decisive: zero callbacks/writes and byte-identical root', () => offOracle(subject));
await test('only Keep publishes; held usable root accepts canonical recipe, listing, retirement and monotonic ID', async () => {
  const f = await fixture(), before = f.bytes();
  await assert.rejects(async () => f.lc().assertReviewable(), /day-hold/);
  const d = await f.assembled(); actual(subject.placeBuild(f.state,d,{x:0.25,y:-0.5}));
  assert.equal(f.bytes(),before); assert.equal(f.counts.commit,0);
  const r = await subject.keepBuild(f.state,d); kind(r,'published'); assert.equal(r.display,true);
  const p = f.root().projects[0];
  assert.deepEqual(Object.keys(p).sort(), ['buildKey','id','placement','recipe','status']);
  assert.equal(p.id,f.root().id+'/projects/1'); assert.equal(actual(subject.keptBuilds(f.root(),f.catalog))[0].actionable,true);
  kind(await subject.keepBuild(f.state,d),'exists'); assert.equal(f.counts.commit,1);
  kind(await subject.removeBuild(f.state,p.id),'published'); assert.equal(f.root().progress.retiredProjects,1);
  kind(await subject.removeBuild(f.state,p.id),'absent');
  kind(await subject.keepBuild(f.state,d),'refused');
  kind(await subject.keepBuild(f.state,await f.assembled()),'published'); assert.equal(f.root().projects[0].id,f.root().id+'/projects/2');
});
await test('private owner/state/draft/view custody and borrowed catalog refuse', async () => {
  const f = await fixture(), other = await fixture(), d = f.draft(), before = f.bytes();
  for (const fake of [{},Object.create(f.owner),new Proxy(f.owner,{})]) refuse(subject.createWorldcraftState(fake));
  for (const fake of [{},Object.create(d),new Proxy(d,{})]) kind(await subject.keepBuild(f.state,fake),'refused');
  kind(await subject.keepBuild(other.state,d),'refused'); refuse(subject.beginBuild(f.state,other.catalog===f.catalog?{}:other.catalog,'織'));
  refuse(await subject.assembleBuild(f.state,d,actual(subject.createWorldView(other.owner))));
  refuse(await subject.assembleBuild(f.state,d,{}));
  actual(await subject.assembleBuild(f.state,d,actual(subject.createWorldView(f.owner))));
  assert.equal(f.bytes(),before); assert.equal(f.counts.commit,0);
});
await test('host coercion/accessor placement never run; bounded drafts, exact finite placement and teardown fences', async () => {
  const f=await fixture(); let calls=0;
  refuse(subject.beginBuild(f.state,f.catalog,{toString(){calls++;return '織';}}));
  const d=await f.assembled();
  for (const v of [{x:NaN,y:0},{x:Infinity,y:0},{x:-0,y:0},{x:1001,y:0},{x:0,y:0,z:1}]) refuse(subject.placeBuild(f.state,d,v));
  refuse(subject.placeBuild(f.state,d,Object.defineProperty({y:0},'x',{get(){calls++;return 1;}}))); assert.equal(calls,0);
  actual(subject.placeBuild(f.state,d,{x:1000,y:-1000}));
  const p=new Proxy({x:0,y:0},{getPrototypeOf(t){subject.discardWorldcraftState(f.state);return Object.getPrototypeOf(t);}});
  refuse(subject.placeBuild(f.state,d,p)); kind(await subject.keepBuild(f.state,d),'refused');
  const bounded=await fixture(); for(let i=0;i<16;i++) bounded.draft(); refuse(subject.beginBuild(bounded.state,bounded.catalog,'織'));
});
await test('placement reflection cannot alter a draft reserved by reentrant Keep',async()=>{
  const f=await fixture(),d=await f.assembled();actual(subject.placeBuild(f.state,d,{x:2,y:3}));let pending;
  const placement=new Proxy({x:4,y:5},{getPrototypeOf(t){pending=subject.keepBuild(f.state,d);return Object.getPrototypeOf(t);}});
  refuse(subject.placeBuild(f.state,d,placement));kind(await pending,'published');assert.deepEqual(f.root().projects[0].placement,{x:2,y:3});
});
async function captureOracle(api) {
  for(const mode of ['missing','returned-duck','throw-after-proof','late','view','owner']) {
    const f=await fixture(api), d=f.draft(), v=actual(api.createWorldView(f.owner)); let late;
    f.c.capture=(_,sink)=>{ if(mode==='returned-duck')return {kept:true,held:true}; if(mode==='throw-after-proof'){sink.kept();throw Error('after');}
      if(mode==='late'){late=sink;return;} if(mode==='view'){sink.kept();f.c.view={};} if(mode==='owner'){sink.kept();f.c.record={};} };
    refuse(await api.assembleBuild(f.state,d,v)); if(late)late.kept(); kind(await api.keepBuild(f.state,d),'refused'); assert.equal(f.counts.commit,0);
  }
}
await test('missing/returned/late/throwing/stale disclosure never enables Keep',()=>captureOracle(subject));
await test('stale initial view can retry, authentic held sink enables assembly; state changes during pending capture refuse', async()=>{
  const f=await fixture(), d=f.draft(), v=actual(subject.createWorldView(f.owner)); f.c.view={};
  refuse(await subject.assembleBuild(f.state,d,v)); f.c.capture=(_,sink)=>sink.held();
  actual(await subject.assembleBuild(f.state,d,actual(subject.createWorldView(f.owner)))); kind(await subject.keepBuild(f.state,d),'published');
  const g=await fixture(), wait=deferred(), x=g.draft(); g.c.capture=async(_,sink)=>{await wait.promise;sink.kept();};
  const pending=subject.assembleBuild(g.state,x,actual(subject.createWorldView(g.owner)));
  subject.discardWorldcraftState(g.state); wait.resolve(); refuse(await pending); assert.equal(g.counts.commit,0);
});
async function overlapOracle(api) {
  const f=await fixture(api), d=await f.assembled(), wait=deferred(), entered=deferred();
  f.c.beforeCommit=async()=>{entered.resolve();await wait.promise;};
  const a=api.keepBuild(f.state,d), b=api.keepBuild(f.state,d); assert.strictEqual(a,b);
  await entered.promise; kind(await api.reconcileBuild(f.state,d),'unresolved'); refuse(api.placeBuild(f.state,d,{x:1,y:1}));
  wait.resolve(); kind(await a,'published'); kind(await b,'published'); assert.equal(f.counts.work,1); assert.equal(f.root().projects.length,1);
  f.c.beforeCommit=null;
  const x=await f.assembled(),y=await f.assembled(); assert.notEqual(actual(api.inspectBuild(f.state,x)).buildKey,actual(api.inspectBuild(f.state,y)).buildKey);
  const results=await Promise.all([api.keepBuild(f.state,x),api.keepBuild(f.state,y)]);
  assert.ok(results.every(r=>['published','uncertain'].includes(r.kind))); // a newer confirmed root can supersede the first observer hash
  assert.equal(f.root().projects.length,3); assert.equal(new Set(f.root().projects.map(p=>p.id)).size,3);
}
await test('same-key overlap joins once; distinct same-glyph builds retain distinct keys and projects',()=>overlapOracle(subject));
async function queuedOracle(api) {
  const f=await fixture(api),d=await f.assembled(); let proposed;
  f.c.work=async(k,data,opts)=>{f.c.work=null;await f.lc().work(k,data);const admit=opts.admit;opts.admit=root=>{proposed=root;admit(root);};};
  kind(await api.keepBuild(f.state,d),'exists'); assert.equal(f.root().projects.length,1); assert.equal(f.counts.commit,1);
  assert.equal(proposed.revision,f.root().revision+1);
}
await test('queued duplicate checks the incremented proposed root and does not append twice',()=>queuedOracle(subject));
async function observerOracle(api) {
  for(const mode of ['wrong-call','wrong-hash','missing-ack','missing','twice','post-publish-throw']) {
    const f=await fixture(api),d=await f.assembled();
    f.c.observe=(r,send)=>{if(mode==='missing')return;send(mode==='wrong-call'?{...r,action:'visit'}:mode==='wrong-hash'?{...r,rootHash:'0'.repeat(64)}:mode==='missing-ack'?{...r,acknowledged:false}:r);if(mode==='twice')send(r);};
    if(mode==='post-publish-throw')f.c.afterWork=()=>{throw Error('after publication');};
    kind(await api.keepBuild(f.state,d),'uncertain'); assert.equal(f.root().projects.length,1); assert.equal(f.counts.hold,1);
    kind(await api.keepBuild(f.state,d),'uncertain'); assert.equal(f.counts.commit,1);
    kind(await api.reconcileBuild(f.state,d),'present'); kind(await api.keepBuild(f.state,d),'exists'); assert.equal(f.counts.commit,1);
  }
}
await test('target observer action/hash/ack/exact-once and post-publication exception remain uncertain',()=>observerOracle(subject));
async function reconcileOracle(api) {
  const f=await fixture(api),d=await f.assembled(); f.c.mode='uncertain-absent';
  kind(await api.keepBuild(f.state,d),'uncertain'); const commits=f.counts.commit; let late;
  f.c.settled=(_,signal)=>{late=signal;return {settled:true};}; kind(await api.reconcileBuild(f.state,d),'unresolved'); late();
  kind(await api.keepBuild(f.state,d),'uncertain'); assert.equal(f.counts.commit,commits);
  f.c.settled=(target,signal)=>signal(target); kind(await api.reconcileBuild(f.state,d),'absent'); f.c.mode='published';
  kind(await api.keepBuild(f.state,d),'published'); assert.equal(f.root().projects.length,1);
}
await test('uncertain absent read cannot enable retry; own terminal reconciliation can; late signal ignored',()=>reconcileOracle(subject));
await test('uncertain present root reconciles without append or historical success; remove uncertainty reconciles too',async()=>{
  const f=await fixture(),d=await f.assembled();f.c.mode='uncertain-present';
  kind(await subject.keepBuild(f.state,d),'uncertain');kind(await subject.reconcileBuild(f.state,d),'present');
  kind(await subject.keepBuild(f.state,d),'exists');assert.equal(f.counts.commit,1);
  const id=f.root().projects[0].id;kind(await subject.removeBuild(f.state,id),'uncertain');
  kind(await subject.removeBuild(f.state,id),'absent');assert.equal(f.counts.commit,2);assert.equal(f.root().projects.length,0);
});
await test('confirmed nonpublication does not claim success; stale display suppresses toast after exact publication',async()=>{
  const f=await fixture(),d=await f.assembled();f.c.mode='not-published';const noPublication=await subject.keepBuild(f.state,d);
  kind(noPublication,'not-published');assert.equal(noPublication.reason,'publication-hold');assert.equal(f.counts.hold,0);
  assert.equal(f.root().projects.length,0);f.c.mode='published';f.c.afterWork=()=>{f.c.view={};};
  const r=await subject.keepBuild(f.state,d);kind(r,'published');assert.equal(r.display,false);
});
async function finalDisplayOracle(api){
  const f=await fixture(api),d=await f.assembled();
  f.c.digest=()=>{let reads=0;f.c.beforeRead=()=>{if(++reads===3)f.c.view={};};};
  const r=await api.keepBuild(f.state,d);kind(r,'published');assert.equal(r.display,false);
}
await test('departure during final Keep read suppresses previously eligible display',()=>finalDisplayOracle(subject));
await test('owner change during write and reflection/digest callbacks fail closed',async()=>{
  for(const mode of ['record','epoch','boot','reflection','digest']){
    const f=await fixture(),d=await f.assembled();
    if(mode==='record')f.c.afterWork=()=>{f.c.record={};};
    if(mode==='epoch')f.c.beforeCommit=()=>{f.binding.epoch++;};
    if(mode==='boot')f.c.afterWork=()=>{f.lc().boot();};
    if(mode==='reflection')f.c.reflect=()=>{subject.revokeWorldOwner(f.owner);};
    if(mode==='digest')f.c.digest=()=>{subject.revokeWorldOwner(f.owner);};
    kind(await subject.keepBuild(f.state,d),'owner-changed');if(mode==='reflection')assert.equal(f.counts.work,0);
  }
  const f=await fixture(),d=await f.assembled();f.c.mode='uncertain-absent';kind(await subject.keepBuild(f.state,d),'uncertain');f.reset();
  f.c.reflect=()=>{subject.revokeWorldOwner(f.owner);};kind(await subject.reconcileBuild(f.state,d),'unresolved');assert.equal(f.counts.tick,0);
});
await test('record read reentrancy cannot revive revoked state or leak nested owner access',async()=>{
  const f=await fixture(),d=await f.assembled();let nested;
  f.c.beforeRead=()=>{f.c.beforeRead=null;nested=subject.readWorldOwner(f.owner);subject.discardWorldcraftState(f.state);};
  kind(await subject.keepBuild(f.state,d),'refused');refuse(nested);assert.equal(f.counts.commit,0);
});
await test('invalid carried data cannot conceal owner replacement and revive old custody',async()=>{
  const f=await fixture(),d=await f.assembled(),prior=f.c.record;
  f.c.record={};f.c.carried={word:'invalid'};refuse(subject.readWorldOwner(f.owner));
  f.c.record=prior;f.c.carried=null;refuse(subject.readWorldOwner(f.owner));
  kind(await subject.keepBuild(f.state,d),'refused');assert.equal(f.counts.commit,0);
});
await test('throwing message accessor is never evaluated or allowed to bypass uncertainty',async()=>{
  const f=await fixture(),d=await f.assembled();let callbacks=0;
  f.c.afterWork=()=>{throw Object.defineProperty({},'message',{get(){callbacks++;throw Error('must not run');}});};
  kind(await subject.keepBuild(f.state,d),'uncertain');assert.equal(callbacks,0);assert.equal(f.counts.hold,1);
  kind(await subject.reconcileBuild(f.state,d),'present');assert.equal(f.root().projects.length,1);
});
await test('16 present projects, seventeenth refused, retirement releases slot without reusing ID',async()=>{
  const f=await fixture();for(let i=0;i<16;i++)kind(await subject.keepBuild(f.state,await f.assembled()),'published');
  const d=await f.assembled(),before=f.bytes();kind(await subject.keepBuild(f.state,d),'refused');assert.equal(f.bytes(),before);assert.equal(f.counts.commit,16);
  kind(await subject.removeBuild(f.state,f.root().projects[0].id),'published');kind(await subject.keepBuild(f.state,d),'published');
  assert.equal(f.root().nextProject,17);assert.equal(f.root().projects.at(-1).id,f.root().id+'/projects/17');
});
const nest=n=>n?{n:nest(n-1)}:null;
await test('actual lifecycle whole-root depth22 accepted, 23 refused before commit',async()=>{
  const f=await fixture();await f.lc().work('projects',{status:'completed',note:nest(19)});assert.equal(classify(f.root()),'valid');
  const before=f.bytes(),count=f.counts.commit;await assert.rejects(async()=>f.lc().work('projects',{status:'completed',note:nest(20)}),/root-invalid/);
  assert.equal(f.bytes(),before);assert.equal(f.counts.commit,count);
});
function sized(root,n){const r=copy(root);r.filler='';const len=n-size(r);assert.ok(len>=0);r.filler='x'.repeat(len);assert.equal(size(r),n);return r;}
const retirementObservations = [];
function beforeRetirement(f) {
  return { root: JSON.stringify(f.root()), record: f.bytes(), revision: f.saved.revision,
    receipts: JSON.stringify(f.saved.commands), authority: JSON.stringify(f.saved),
    bytes: size(f.root()), projectId: f.root().projects[0].id };
}
function unchangedRetirement(f, before) {
  assert.equal(f.counts.commit, 0, 'refused retirement never calls the commit port');
  assert.equal(f.counts.hold, 0, 'capacity refusal never enters a new runtime hold');
  assert.equal(JSON.stringify(f.root()), before.root);
  assert.equal(f.bytes(), before.record);
  assert.equal(f.saved.revision, before.revision);
  assert.equal(JSON.stringify(f.saved.commands), before.receipts);
  assert.equal(JSON.stringify(f.saved), before.authority);
  assert.equal(classify(f.root()), 'valid');
  assert.ok(f.root().projects.some(p => p.id === before.projectId));
  assert.equal(size(f.root()), before.bytes);
}
function retirementObservation(path, variant, f, before, result) {
  const row = { path, variant, before: before.bytes, after: size(f.root()),
    rootUnchanged: JSON.stringify(f.root()) === before.root, recordUnchanged: f.bytes() === before.record,
    commits: f.counts.commit, holds: f.counts.hold, result };
  retirementObservations.push(row); console.log('RETIREMENT ' + JSON.stringify(row));
}
async function directRestampOracle(lifecycleFactory = createLifecycle, variant = 'accepted-A') {
  const f = await fixture(subject, { buildId: 'b'.repeat(512), lifecycleFactory });
  await f.lc().work('projects', { status: 'completed' });
  let r = copy(f.root()); r.revision++; r.lastWriterBuild = 'x'; r = sized(r, LIMITS.dataBytes + 1);
  await f.sync(r); f.reset(); const before = beforeRetirement(f);
  let rejection = null;
  try { await f.lc().retire('projects', before.projectId, 'retire-completed'); } catch (error) { rejection = error; }
  retirementObservation('direct', variant, f, before, { rejected: rejection !== null, reason: rejection?.message ?? null });
  assert.equal(rejection?.message, 'byte-bound', 'direct retirement must reject byte-bound');
  assert.equal(before.bytes, 258049); unchangedRetirement(f, before);
}
async function canonicalRestampOracle(lifecycleFactory = createLifecycle, variant = 'accepted-A') {
  const f = await fixture(subject, { buildId: '\u0001'.repeat(512), lifecycleFactory }), d = await f.assembled();
  kind(await subject.keepBuild(f.state, d), 'published');
  let r = copy(f.root()); r.revision++; r.lastWriterBuild = 'x'; r = sized(r, LIMITS.dataBytes + 1);
  await f.sync(r); f.reset(); const before = beforeRetirement(f);
  assert.equal(actual(subject.keptBuilds(f.root(), f.catalog))[0].actionable, true);
  const result = await subject.removeBuild(f.state, before.projectId);
  retirementObservation('canonical-removeBuild', variant, f, before, result);
  assert.deepEqual(result, { kind: 'structural', reason: 'byte-bound', observed: null },
    'canonical removeBuild must refuse structural byte-bound');
  assert.equal(before.bytes, 258049); unchangedRetirement(f, before);
  assert.equal(actual(subject.keptBuilds(f.root(), f.catalog))[0].actionable, true);
}
await test('actual lifecycle 252KiB ordinary inclusive; 256KiB absolute inclusive; one byte over refused',async()=>{
  for(const over of [0,1]){
    const f=await fixture(),next=copy(f.root());next.revision++;next.nextProject++;next.projects.push({id:next.id+'/projects/1',status:'completed',filler:''});
    const data={status:'completed',filler:'x'.repeat(LIMITS.dataBytes+over-size(next))};
    if(over){await assert.rejects(async()=>f.lc().work('projects',data),/byte-bound/);assert.equal(f.counts.commit,0);}
    else{await f.lc().work('projects',data);assert.equal(size(f.root()),LIMITS.dataBytes);}
  }
  const f=await fixture();assert.equal(classify(sized(f.root(),LIMITS.bytes)),'valid');assert.equal(classify(sized(f.root(),LIMITS.bytes+1)),'oversize');
});
await test('strict final-shrink reserve succeeds; ordinary work and growing long-writer retirement refuse',async()=>{
  const f=await fixture();await f.lc().work('projects',{status:'completed'});let r=copy(f.root());r.revision++;r=sized(r,LIMITS.bytes);await f.sync(r);f.reset();
  const before=size(f.root());await f.lc().retire('projects',r.projects[0].id,'retire-completed');
  assert.ok(size(f.root())>LIMITS.dataBytes&&size(f.root())<before&&size(f.root())<=LIMITS.bytes);assert.equal(f.counts.commit,1);
  await assert.rejects(async()=>f.lc().work('projects',{status:'completed'}),/byte-bound/);assert.equal(f.counts.commit,1);
  await directRestampOracle();
});
await test('canonical removeBuild refuses growing escaped-writer retirement without publication or hold',()=>canonicalRestampOracle());
await test('structural and unsupported stored recipes stay diagnostic/nonactionable with no laundering',async()=>{
  const f=await fixture(),d=await f.assembled();kind(await subject.keepBuild(f.state,d),'published');
  let r=copy(f.root());r.revision++;r.projects[0].recipe.recipeDigest='unadmitted';await f.sync(r);f.reset();
  const listing=actual(subject.keptBuilds(f.root(),f.catalog));assert.equal(listing[0].actionable,false);
  kind(await subject.removeBuild(f.state,r.projects[0].id),'refused');assert.equal(f.counts.retire,0);
  r=copy(f.root());r.protocol='future';f.saved.record.m4Journey=r;const before=f.bytes();
  kind(await subject.keepBuild(f.state,await f.assembled()),'structural');assert.equal(f.bytes(),before);assert.equal(f.counts.commit,0);
});
await test('real lifecycle reload retains projects but invalidates model owner; confirmed restore retires generation',async()=>{
  const f=await fixture(),d=await f.assembled();kind(await subject.keepBuild(f.state,d),'published');const prior=copy(f.root());
  await f.reload();assert.deepEqual(f.root().projects,prior.projects);kind(await subject.keepBuild(f.state,d),'refused');
  const g=await fixture(),x=await g.assembled();kind(await subject.keepBuild(g.state,x),'published');const imported=copy(g.root());
  await g.restore();assert.notEqual(g.root().generation,imported.generation);assert.deepEqual(g.root().projects,[]);assert.equal(g.root().retired.hash,digest(imported));
  kind(await subject.keepBuild(g.state,x),'refused');
  const h=await fixture();h.saved.record.m4Journey.protocol='future';const before=h.bytes();h.reset();await h.reload();
  assert.equal(h.lc().inspect().phase,'invalid-root-hold');assert.equal(h.bytes(),before);assert.equal(h.counts.commit,0);
});
const oldLabels = ['project-exists','work-bound','root-invalid','byte-bound','root-unavailable','switch-off',
  'owner-epoch','generation-changed','stale-root','view-stale','draft-changed','work-missing','explicit-retirement'];
let textMatrixCases = 0;
async function unobserved(api, action = 'keep', edge = 'after', value = new Error('byte-bound')) {
  const f = await fixture(api), d = await f.assembled(); let id;
  if (action === 'remove') { kind(await api.keepBuild(f.state,d),'published'); id=f.root().projects[0].id; }
  f.reset(); f.c.observe=()=>{};
  const fail=()=>{throw value;};
  if(edge==='getter')f.c.commitGet=fail;
  if(edge==='call')f.c.commitCall=fail;
  if(edge==='await')f.c.beforeCommit=async()=>{throw value;};
  if(edge==='dependency')f.c.dependency=fail;
  if(edge==='after-dependency')f.c.commitCall=async(expected,next,meta,commit)=>{
    const result=await commit(expected,next,meta);f.c.dependency=fail;return result;
  };
  if(edge==='after')f.c[action==='keep'?'afterWork':'afterRetire']=fail;
  const invoke=()=>action==='keep'?api.keepBuild(f.state,d):api.removeBuild(f.state,id);
  const first=await invoke();
  assert.equal(first.kind,'uncertain','U1 unobserved failure remains uncertain');
  assert.equal(f.counts.hold,1,'U1 owned unobserved failure requests hold');
  if(action==='keep')assert.equal(actual(api.inspectBuild(f.state,d)).uncertain,true,'U1 Keep retains uncertainty');
  const originalOperation=f.invocations.at(-1).operation, counts={...f.counts};
  assert.ok(originalOperation && typeof originalOperation==='object');
  assert.strictEqual(f.queries.at(-1).operation,originalOperation);
  assert.strictEqual(f.queries.at(-1).error,value,'exact escaping value reaches query');
  for(const k of ['commitGet','commitCall','beforeCommit','dependency','afterWork','afterRetire','observe'])f.c[k]=null;
  f.c.settled=()=>{};
  const second=await invoke();
  assert.equal(second.kind,action==='keep'?'uncertain':'unresolved','U1 retry cannot bypass settlement');
  assert.equal(f.counts.work,counts.work,'U1 unresolved Keep cannot issue another work');
  assert.equal(f.counts.retire,counts.retire,'U1 unresolved removal cannot issue another retire');
  assert.equal(f.counts.commit,counts.commit,'U1 unresolved target cannot issue another commit');
  return {f,d,id,invoke,originalOperation,counts};
}
async function textOracle(api, labels = oldLabels, edges = ['getter','call','await','dependency','after-dependency','after']) {
  for(const action of ['keep','remove'])for(const label of labels)for(const edge of edges) {
    await unobserved(api,action,edge,new Error(label)); textMatrixCases++;
  }
}
await test('U1 all former refusal labels stay uncertain through getter/call/await/pre-and-post-dependency/after paths for Keep and remove',()=>textOracle(subject));
async function shortcutOracle(api) { await unobserved(api,'keep','after',new Error('project-exists')); }
await test('U1 raw project-exists after publication never becomes exists or saved',()=>shortcutOracle(subject));
await test('U1 falsy, copied and proxy thrown values are not inspected for authority',async()=>{
  let callbacks=0;
  const hostile=new Proxy(new Error('byte-bound'),{get(){callbacks++;throw Error('get');},getPrototypeOf(){callbacks++;throw Error('proto');},getOwnPropertyDescriptor(){callbacks++;throw Error('descriptor');},ownKeys(){callbacks++;throw Error('keys');}});
  for(const value of [undefined,null,false,0,'byte-bound',{name:'Error',message:'byte-bound'},hostile]) {
    // Explicit undefined must not select unobserved's default argument.
    const f=await fixture(),d=await f.assembled();f.c.observe=()=>{};f.c.afterWork=()=>{throw value;};
    kind(await subject.keepBuild(f.state,d),'uncertain');assert.strictEqual(f.queries.at(-1).error,value);
    assert.equal(f.counts.hold,1);kind(await subject.keepBuild(f.state,d),'uncertain');assert.equal(f.counts.commit,1);
  }
  assert.equal(callbacks,0,'U1 no callbacks on thrown value');
});
async function pendingOracle(api, action) {
  for(const edge of ['call','await'])for(const publishedLate of [false,true]) {
    const {f,d,invoke,originalOperation,counts}=await unobserved(api,action,edge);
    const issued=f.submissions.at(-1);let originalTarget,late;
    const reconcile=()=>action==='keep'?api.reconcileBuild(f.state,d):invoke();
    for(const mode of ['return-only','missing','copy','operation-only','wrong','late']) {
      f.c.settled=(target,signal)=>{
        assert.strictEqual(target.operation,originalOperation,'settlement receives original operation');
        if(originalTarget)assert.strictEqual(target,originalTarget,'settlement retains exact original target');else originalTarget=target;
        if(mode==='return-only')return {settled:true,target};
        if(mode==='missing')signal();
        if(mode==='copy')signal({...target});
        if(mode==='operation-only')signal({operation:target.operation});
        if(mode==='wrong')signal({});
        if(mode==='late')late=()=>signal(target);
      };
      assert.equal((await reconcile()).kind,'unresolved','U1 only exact timely target settles');if(late)late();
      assert.equal(f.counts.commit,counts.commit,'U1 no second submission before terminal signal');
    }
    if(publishedLate)await f.deliver(...issued);
    f.c.settled=(target,signal)=>{assert.strictEqual(target,originalTarget);signal(target);};
    const terminal=await reconcile();
    if(action==='keep') {
      kind(terminal,publishedLate?'present':'absent');kind(await invoke(),publishedLate?'exists':'published');
    } else kind(terminal,publishedLate?'absent':'published');
    assert.equal(f.counts.commit,counts.commit+(publishedLate?0:1),'only confirmed nonpublication permits a fresh submission');
    if(!publishedLate)assert.notStrictEqual(f.invocations.at(-1).operation,originalOperation);
    assert.equal(f.root().projects.length,action==='keep'?1:0);
  }
}
await test('U1 Keep retains exact target through sync/async failure and all nonterminal signals',()=>pendingOracle(subject,'keep'));
await test('U1 remove retains exact target through sync/async failure and all nonterminal signals',()=>pendingOracle(subject,'remove'));
async function guardFixture(api) {
  const f=await fixture(api),d=await f.assembled(),r=sized(f.root(),LIMITS.dataBytes);r.revision++;await f.sync(r);f.reset();return {f,d};
}
await test('U1 query exact operation/error/action/collection/instance; missing or throwing capability fails closed',async()=>{
  for(const mode of ['missing','throws','wrong-operation','wrong-error','proxy-error','other-instance','wrong-action','wrong-collection','wrong-source']) {
    const {f,d}=await guardFixture(subject),other=mode==='other-instance'?await fixture():null;let callbacks=0;
    if(mode==='missing')delete f.lifecycle.preDispatchRefusal;
    else f.c.query=(op,error,query)=>{
      if(mode==='throws')throw Error('byte-bound');
      if(mode==='wrong-operation')return query({},error);
      if(mode==='wrong-error')return query(op,new Error('byte-bound'));
      if(mode==='proxy-error')return query(op,new Proxy(error,{get(){callbacks++;},getOwnPropertyDescriptor(){callbacks++;},getPrototypeOf(){callbacks++;}}));
      if(mode==='other-instance')return other.lc().preDispatchRefusal(op,error);
      const proof=query();assert.equal(proof.reason,'byte-bound');
      return {...proof,...(mode==='wrong-action'?{action:'retire-work'}:mode==='wrong-collection'?{collection:'goals'}:{source:'copied-tag'})};
    };
    kind(await subject.keepBuild(f.state,d),mode==='missing'?'refused':'uncertain');
    assert.equal(f.counts.work,mode==='missing'?0:1);assert.equal(f.counts.commit,0);assert.equal(callbacks,0);
    assert.equal(f.counts.hold,mode==='missing'?0:1);
  }
  for(const firstRefused of [false,true]) {
    const f=await fixture(),d=await f.assembled();f.c.work=async(k,data,opts)=>{
      try{await f.lc().work(k,firstRefused?{padding:'x'.repeat(LIMITS.bytes)}:data,{operation:opts.operation});}catch{}
    };
    kind(await subject.keepBuild(f.state,d),'uncertain');assert.equal(f.counts.commit,firstRefused?0:1);
    kind(await subject.keepBuild(f.state,d),'uncertain');assert.equal(f.counts.work,1);
  }
});
async function admissionOracle(api, mode) {
  const f=await fixture(api),d=await f.assembled(),view=f.c.view;let priorError;
  if(mode==='replayed-target') {
    f.c.work=()=>{f.c.view={};};f.c.query=(op,error,query)=>{priorError=error;return query();};
    kind(await api.keepBuild(f.state,d),'refused');assert.equal(f.counts.hold,0);
    f.c.view=view;f.c.query=null;
  }
  f.c.work=(k,data,opts)=>{
    const admit=opts.admit;
    opts.admit=root=>{
      if(mode==='replayed-target')throw priorError;
      if(mode==='arbitrary')throw Error('project-exists');
      f.c.view={};
      try{admit(root);}catch(error){f.c.view=view;throw new Error(error.message,{cause:error});}
    };
  };
  const result=await api.keepBuild(f.state,d);
  assert.equal(result.kind,'uncertain',mode==='replayed-target'?'U1 admission error binds original target':'U1 admission requires exact private escaping error');
  assert.equal(f.counts.commit,0);assert.equal(f.counts.hold,1);
  assert.equal(actual(api.inspectBuild(f.state,d)).uncertain,true);
}
await test('U1 admission error is private to exact target/draft/version and exact escaping identity',async()=>{
  for(const mode of ['replayed-target','copied-error','arbitrary'])await admissionOracle(subject,mode);
});
async function queryFenceOracle(api) {
  const {f,d}=await guardFixture(api);f.c.query=(op,error,query)=>{const proof=query();f.c.record={};return proof;};
  assert.equal((await api.keepBuild(f.state,d)).kind,'owner-changed','U1 post-query owner fence');
  assert.equal(f.counts.hold,0);assert.equal(f.counts.commit,0);kind(await api.keepBuild(f.state,d),'refused');
}
await test('U1 owner fences before/after query and reentrant query never revive stale outcomes',async()=>{
  await queryFenceOracle(subject);
  const f=await fixture(),d=await f.assembled();f.c.work=(k,data,opts)=>{opts.admit=()=>{f.c.record={};throw Error('byte-bound');};};
  kind(await subject.keepBuild(f.state,d),'owner-changed');assert.equal(f.queries.length,0);assert.equal(f.counts.commit,0);
  const {f:g,d:x}=await guardFixture(subject);let joined;
  g.c.query=(op,error,query)=>{joined=subject.keepBuild(g.state,x);return query();};
  const pending=subject.keepBuild(g.state,x);kind(await pending,'structural');assert.strictEqual(joined,pending);assert.equal(g.counts.work,1);
});
await test('U1 reentrant admission joins its reserved target and fences owner or boot replacement',async()=>{
  for(const mode of ['join','owner','boot']) {
    const f=await fixture(),d=await f.assembled();let joined,boot;
    f.c.work=(k,data,opts)=>{const admit=opts.admit;opts.admit=root=>{
      joined=subject.keepBuild(f.state,d);
      if(mode==='owner')f.c.record={};
      if(mode==='boot')boot=f.lc().boot();
      return admit(root);
    };};
    const pending=subject.keepBuild(f.state,d);kind(await pending,mode==='join'?'published':'owner-changed');
    if(boot)await boot;assert.strictEqual(joined,pending);assert.equal(f.counts.work,1);
    assert.equal(f.counts.commit,mode==='join'?1:0);assert.equal(f.root().projects.length,mode==='join'?1:0);
    if(mode!=='join'){kind(await subject.keepBuild(f.state,d),'refused');assert.equal(f.counts.work,1);}
  }
});
await test('U1 post-entry getter reboot may publish but cannot revive old owner or issue a second target',async()=>{
  for(const action of ['keep','remove'])for(const throws of [false,true]) {
    const f=await fixture(),d=await f.assembled();let id;
    if(action==='remove'){kind(await subject.keepBuild(f.state,d),'published');id=f.root().projects[0].id;}
    f.reset();let boot;f.c.observe=()=>{};const escaping=new Error('byte-bound');
    f.c.commitGet=()=>{f.c.commitGet=null;boot=f.lc().boot();if(throws)throw escaping;};
    const invoke=()=>action==='keep'?subject.keepBuild(f.state,d):subject.removeBuild(f.state,id);
    kind(await invoke(),'owner-changed');await boot;
    assert.equal(f.counts.commit,throws?0:1);assert.equal(f.root().projects.length,action==='keep'?(throws?0:1):(throws?1:0));
    const op=f.invocations.at(-1).operation;assert.equal(f.lc().preDispatchRefusal(op,escaping),null,'exact post-entry escaping error is never pre-dispatch proof');
    kind(await invoke(),'refused');assert.equal(f.counts.commit,throws?0:1);assert.equal(f.counts.hold,0);
  }
});
await test('U1 queued boot/owner/generation replacement cannot publish a stale target',async()=>{
  for(const mode of ['boot','owner','generation']) {
    const f=await fixture(),d=await f.assembled(),gate=deferred(),entered=deferred(),invoked=deferred();
    f.c.beforeCommit=async()=>{entered.resolve();await gate.promise;};
    const busy=f.lc().work('goals',{status:'unfinished'});await entered.promise;
    const queued=mode==='boot'?f.lc().boot():null;
    f.c.work=()=>{invoked.resolve();};const pending=subject.keepBuild(f.state,d);await invoked.promise;await Promise.resolve();await Promise.resolve();
    if(mode==='owner')f.binding.epoch++;
    if(mode==='generation')f.saved.migrationId='changed-generation';
    gate.resolve();await Promise.allSettled([busy,queued]);
    kind(await pending,'owner-changed');assert.equal(f.counts.work,1);assert.equal(f.root().projects.length,0);
    const count=f.counts.commit;kind(await subject.keepBuild(f.state,d),'refused');assert.equal(f.counts.commit,count);
  }
});
await test('U1 witnessed refusal after day rotation proves zero target writes, not zero total writes',async()=>{
  const {f,d}=await guardFixture(subject),epoch=f.root().dayEpoch,receipts=f.saved.commands.length;
  f.c.now+=86400000;
  kind(await subject.keepBuild(f.state,d),'structural');assert.equal(f.root().dayEpoch,epoch+1);
  assert.equal(f.counts.commit,1);assert.equal(f.counts.hold,0);assert.equal(f.root().projects.length,0);
  assert.deepEqual(f.saved.commands.slice(receipts).map(r=>r.journey.action),['rotate']);
  const {operation,error}=f.queries.at(-1);assert.equal(f.lc().preDispatchRefusal(operation,error).reason,'byte-bound');
});
async function mutant(before,after,source=consumerSource){let s=source;assert.equal(s.split(before).length,2,'unique mutant target');s=s.replace(before,after);
  for(const f of ['kanji-family.js','kanji-structure.js'])s=s.replace("'./"+f+"'",JSON.stringify(new URL(f,base).href));return import(dataURL(s));}
let killed=0;
for(const [name,before,after,oracle] of [
  ['OFF guard removed',"if (!r.value.journeyWrites || !r.value.worldcraftEnabled) return no('worldcraft-off');\n  if (requireView","if (false) return no('worldcraft-off');\n  if (requireView",offOracle],
  ['capture proof omitted',"|| failed || !proof)","|| failed)",captureOracle],
  ['same-key reservation join removed',"if (s.inflight.has(key)) return s.inflight.get(key);","if (false) return s.inflight.get(key);",overlapOracle],
  ['queued duplicate admission removed',"if (next.projects.some(p => p.buildKey === d.key)) reject('project-exists');","if (false) reject('project-exists');",queuedOracle],
  ['target action verification removed',"observed?.action === target.action && observed.outcome === 'published'","observed?.action && observed.outcome === 'published'",observerOracle],
  ['publication exception ignored',"exact = !thrown && count === 1", "exact = count === 1",observerOracle],
  ['ack verification removed',"observed.acknowledged === true && /^[a-f0-9]{64}$/", "true && /^[a-f0-9]{64}$/",observerOracle],
  ['target hash verification removed',"observed.rootHash === observed.proposedHash && root.ok", "root.ok",observerOracle],
  ['final display view recheck removed',"result.display === true && views.get(d.view)?.view === final.value.snapshot.view","result.display === true",finalDisplayOracle],
  ['settlement signal ignored',"if (!signalled || !worldAccess(state).ok)","if (!worldAccess(state).ok)",reconcileOracle],
]){
  const api=await mutant(before,after);await assert.rejects(()=>oracle(api),{code:'ERR_ASSERTION'},name);killed++;console.log('KILLED '+name);
}
const u1Mutants=[];
for(const [name,before,after,oracle,message] of [
  ['error text whitelist restored','  if (count === 0 && thrown) {',
    "  if (count === 0 && thrown && "+JSON.stringify(oldLabels)+".includes(caught?.message)) return outcome('structural', caught.message);\n  if (count === 0 && thrown) {",
    api=>unobserved(api,'keep','after'), 'U1 unobserved failure remains uncertain'],
  ['private admission target ignored','own?.target === target','own?.target !== undefined',
    api=>admissionOracle(api,'replayed-target'),'U1 admission error binds original target'],
  ['private escaping error replaced by copied cause','admissionRefusals.get(caught)','admissionRefusals.get(caught?.cause)',
    api=>admissionOracle(api,'copied-error'),'U1 admission requires exact private escaping error'],
  ['post-query owner fence omitted',
    "    if (!worldAccess(state).ok) return outcome('owner-changed', 'owner-changed', observed); // after query and reflection",
    '    // mutant omits post-query ownership',queryFenceOracle,'U1 post-query owner fence'],
  ['Keep pending uncertainty cleared on throw',"d.uncertain = ['uncertain', 'owner-changed'].includes(result.kind);",'d.uncertain = false;',
    api=>unobserved(api,'keep','call'),'U1 Keep retains uncertainty'],
  ['remove pending target cleared on throw',"if (['uncertain', 'owner-changed'].includes(result.kind)) s.removals.set(projectId, target);",
    'if (false) s.removals.set(projectId, target);',api=>unobserved(api,'remove','call'),'U1 retry cannot bypass settlement'],
  ['settlement accepts wrong target','if (open && settled === target) signalled = true','if (open) signalled = true',
    api=>pendingOracle(api,'keep'),'U1 only exact timely target settles'],
]) {
  const api=await mutant(before,after);
  await assert.rejects(()=>oracle(api),e=>e.code==='ERR_ASSERTION'&&e.message.includes(message),name+' intended invariant');
  killed++;u1Mutants.push(name);console.log('KILLED U1 '+name);
}
// Diagnostic carrier only: production deliberately no longer copies thrown text.
// First prove an uncertain project-exists reason cannot bypass the private gate;
// then restore JUST that raw shortcut on identical carrier bytes. No whitelist.
const uncertainReturn="return outcome('uncertain', 'publication-unproved', observed);";
const carrierReturn="return outcome('uncertain', 'project-exists', observed);";
assert.equal(consumerSource.split(uncertainReturn).length,2);
const carrierSource=consumerSource.replace(uncertainReturn,carrierReturn);
await shortcutOracle(await mutant(uncertainReturn,carrierReturn));
const rawShortcut=await mutant("(result.kind === 'refused' && duplicateAdmissions.get(result) === target)","result.reason === 'project-exists'",carrierSource);
await assert.rejects(()=>shortcutOracle(rawShortcut),e=>e.code==='ERR_ASSERTION'&&e.message.includes('U1 unobserved failure remains uncertain'),'raw shortcut intended invariant');
killed++;u1Mutants.push('raw project-exists shortcut restored on passing diagnostic carrier');console.log('KILLED U1 raw project-exists shortcut');
// Only in memory: restore the parent's pre-stamp eligibility decision. Both
// independent fixtures must reach their own behavioral assertion, not a pin or
// setup failure. No protected file is edited, and the same digest shim is used.
const newOrder = 'write(next,action,{shrink:shrinkingControl,observe,attempt})';
const oldOrder = 'write(next,action,{control:shrinkingControl&&bytes(next)<bytes(root),observe,attempt})';
assert.equal(lifecycleSource.split(newOrder).length, 2, 'unique lifecycle mutation target');
const oldOrderSource = lifecycleSource.replace(newOrder, oldOrder);
const oldLifecycle = await loadLifecycle(oldOrderSource);
const oldOrderNegatives = [];
for (const [path, oracle, message] of [
  ['direct', directRestampOracle, 'direct retirement must reject byte-bound'],
  ['canonical-removeBuild', canonicalRestampOracle, 'canonical removeBuild must refuse structural byte-bound'],
]) {
  await assert.rejects(() => oracle(oldLifecycle.createLifecycle, 'old-order-mutant'),
    error => error.code === 'ERR_ASSERTION' && error.message.includes(message), path + ' must kill old-order behavior');
  const observed = retirementObservations.at(-1);
  assert.equal(observed.path, path); assert.equal(observed.variant, 'old-order-mutant');
  assert.equal(observed.commits, 1); assert.ok(observed.after > observed.before);
  assert.equal(observed.rootUnchanged, false); assert.equal(observed.recordUnchanged, false);
  oldOrderNegatives.push(path); console.log('KILLED old-order independently: ' + path);
}
killed++;
assert.equal(sha(readFileSync(new URL('m4-worldcraft.mjs',base))),consumerHash,'consumer bytes unchanged during probe');
console.log(JSON.stringify({verifier:'m4-worldcraft-projects',cases,mutantsKilled:killed,moduleMutantsKilled:killed-1,consumerHash,textMatrixCases,u1Mutants,
  lifecycleMutantsKilled:1,oldOrderNegatives,oldOrderSourceSHA256:sha(oldOrderSource),retirementObservations,
  passed:unsupported.length===0,controlsPassed:true,unsupported,lifecycleHash,
  evidence:'unchanged lifecycle rule body; in-memory record-core digest shim; simulated ON record/CAS/device/capture/settlement authority; no real host/storage/capture admission'}));

if (unsupported.length) process.exitCode = 1; // A known failed lease obligation is never a green process.
