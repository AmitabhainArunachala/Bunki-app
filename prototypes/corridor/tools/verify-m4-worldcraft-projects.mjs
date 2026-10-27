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
const lifecycleSource = readFileSync(new URL('journey-lifecycle.mjs', base), 'utf8');
const lifecycleHash = 'f21912d6f04bed041291c41d03ea52c723fe0ee316361448eb4eb30fec8d2a09';
assert.equal(sha(lifecycleSource), lifecycleHash);
const shimURL = dataURL("import {createHash} from 'node:crypto'; export " + encodeLocalJson.toString());
const { createLifecycle, digest, classify, authority, LIMITS } = await import(dataURL(
  lifecycleSource.replace("'./modules/record-core.mjs'", JSON.stringify(shimURL))));
const bytes = Object.fromEntries(Object.entries(subject.SOURCE_PINS).map(([k, v]) => [k, readFileSync(new URL('data/share_alike/' + v.file, base))]));
const catalogCache = new WeakMap();
async function catalogFor(api) { if (!catalogCache.has(api)) catalogCache.set(api, actual(await api.createWorldcraftCatalog(bytes))); return catalogCache.get(api); }
let fixtureSerial = 0;
async function fixture(api = subject, options = {}) {
  const catalog = await catalogFor(api), label = 'fixture-' + ++fixtureSerial;
  const saved = { status: 'active', migrationId: 'fixture-migration', scope: { profile: label, store: 'memory' }, revision: 0, commands: [], record: { untouched: 'sentinel' } };
  const binding = { epoch: 1 }, markers = new Map(), counts = { commit: 0, capture: 0, work: 0, retire: 0, hold: 0, tick: 0 };
  const c = { journeyWrites: true, worldcraftEnabled: true, owner: {}, record: {}, view: {}, navigation: {}, visit: null, carried: null,
    beforeRead: null, beforeCommit: null, capture: null, work: null, observe: null, afterWork: null, settled: null, reflect: null, digest: null, mode: 'published' };
  let id = 0, lc, state, owner;
  function receipt(type, journey) {
    saved.revision++;
    saved.commands.push({ format: 'kairo-local-command-receipt', version: 1, changeId: label + '-receipt-' + saved.revision,
      type, scope: copy(saved.scope), committedRevision: saved.revision, ...(journey ? { journey } : {}) });
  }
  const port = {
    snapshot: () => copy(saved), binding: () => ({ ...binding }), nextId: () => label + '-journey-' + ++id,
    async commit(expected, next, meta) {
      counts.commit++; if (c.beforeCommit) await c.beforeCommit(expected, next, meta);
      if (expected.epoch !== binding.epoch || expected.rootHash !== digest(saved.record.m4Journey ?? null) ||
        expected.generation !== authority(saved).generation) return { outcome: 'not-published', acknowledged: false };
      if (c.mode === 'not-published') return { outcome: 'not-published', acknowledged: false };
      if (c.mode === 'uncertain-absent') return { outcome: 'uncertain', acknowledged: false };
      saved.record.m4Journey = JSON.parse(encodeLocalJson(next).text); receipt('journey.lifecycle/1', meta);
      return { outcome: c.mode === 'uncertain-present' ? 'uncertain' : 'published', acknowledged: c.mode !== 'uncertain-present', rootHash: digest(next) };
    },
  };
  const boot = async () => {
    lc = createLifecycle({ port, device: { read: k => markers.get(k), write: (k, v) => { markers.set(k, copy(v)); return true; }, remove: k => markers.delete(k) || true },
      buildId: options.buildId ?? '3A-2-test', core: { endOfDay: d => d.setHours(23, 59, 59, 999), validItem: () => false },
      clock: () => new Date('2026-10-27T12:00:00+09:00').getTime(), enabled: true, validateCapture: () => { throw Error('not-a-real-capture-service'); } });
    await lc.ready;
  };
  await boot();
  const lifecycle = new Proxy({
    tick: async () => { counts.tick++; return lc.tick(); }, inspect: () => lc.inspect(),
    work: async (kind, data, opts) => {
      counts.work++; if (c.work) await c.work(kind, data, opts);
      const wrapped = { ...opts, observe: r => { if (c.observe) c.observe(r, opts.observe); else opts.observe(r); } };
      const result = await lc.work(kind, data, wrapped); if (c.afterWork) c.afterWork(); return result;
    },
    retire: async (kind, projectId, decision, opts) => {
      counts.retire++; return lc.retire(kind, projectId, decision, { ...opts, observe: r => c.observe ? c.observe(r, opts.observe) : opts.observe(r) });
    },
    holdUnconfirmed: () => { counts.hold++; return lc.holdUnconfirmed(); },
  }, { getPrototypeOf(target) { if (c.reflect) c.reflect(); return Object.getPrototypeOf(target); } });
  const ports = {
    read() {
      if (c.beforeRead) c.beforeRead();
      return { owner: c.owner, record: c.record, epoch: binding.epoch, boot: lc.bootIdentity(),
        journeyId: saved.record.m4Journey?.id ?? null, generation: saved.record.m4Journey?.generation ?? null,
        view: c.view, navigation: c.navigation, visit: c.visit, carried: c.carried,
        root: copy(saved.record.m4Journey ?? null), journeyWrites: c.journeyWrites, worldcraftEnabled: c.worldcraftEnabled };
    },
    capture: async (request, sink) => { counts.capture++; return c.capture ? c.capture(request, sink) : sink.kept(); },
    lifecycle, digest: root => { if (c.digest) c.digest(); return digest(root); },
    settledRead: async (target, signal) => { if (c.settled) return c.settled(target, signal); signal(); },
  };
  owner = actual(api.createWorldOwner(catalog, ports)); state = actual(api.createWorldcraftState(owner));
  const reset = () => { for (const k of Object.keys(counts)) counts[k] = 0; };
  const draft = (host = '織') => actual(api.beginBuild(state, catalog, host));
  const assembled = async (host = '織') => { const d = draft(host); actual(await api.assembleBuild(state, d, actual(api.createWorldView(owner)))); return d; };
  reset();
  return { api, catalog, owner, state, saved, binding, c, counts, ports, lifecycle, draft, assembled, reset,
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
  f.c.settled=(_,signal)=>signal(); kind(await api.reconcileBuild(f.state,d),'absent'); f.c.mode='published';
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
  const f=await fixture(),d=await f.assembled();f.c.mode='not-published';kind(await subject.keepBuild(f.state,d),'not-published');
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
await test('actual lifecycle 252KiB ordinary inclusive; 256KiB absolute inclusive; one byte over refused',async()=>{
  for(const over of [0,1]){
    const f=await fixture(),next=copy(f.root());next.revision++;next.nextProject++;next.projects.push({id:next.id+'/projects/1',status:'completed',filler:''});
    const data={status:'completed',filler:'x'.repeat(LIMITS.dataBytes+over-size(next))};
    if(over){await assert.rejects(async()=>f.lc().work('projects',data),/byte-bound/);assert.equal(f.counts.commit,0);}
    else{await f.lc().work('projects',data);assert.equal(size(f.root()),LIMITS.dataBytes);}
  }
  const f=await fixture();assert.equal(classify(sized(f.root(),LIMITS.bytes)),'valid');assert.equal(classify(sized(f.root(),LIMITS.bytes+1)),'oversize');
});
await test('strict-shrink reserve baseline; ordinary work refused; writer-restamp counterexample reported',async()=>{
  const f=await fixture();await f.lc().work('projects',{status:'completed'});let r=copy(f.root());r.revision++;r=sized(r,LIMITS.bytes);await f.sync(r);f.reset();
  await f.lc().retire('projects',r.projects[0].id,'retire-completed');assert.ok(size(f.root())>LIMITS.dataBytes&&size(f.root())<LIMITS.bytes);
  await assert.rejects(async()=>f.lc().work('projects',{status:'completed'}),/byte-bound/);assert.equal(f.counts.commit,1);
  const g=await fixture(subject,{buildId:'b'.repeat(512)});await g.lc().work('projects',{status:'completed'});r=copy(g.root());r.revision++;r.lastWriterBuild='x';r=sized(r,LIMITS.dataBytes+1);await g.sync(r);g.reset();
  const before=size(g.root());await g.lc().retire('projects',r.projects[0].id,'retire-completed');
  assert.ok(size(g.root())>before);assert.equal(g.counts.commit,1);
  unsupported.push('LIFECYCLE-SHRINK: protected change() tests shrink before write() stamps lastWriterBuild; longer build ID can grow a reserve retirement. Requires W4 authoritative queued fix; model-only PASS cannot establish final strict shrink.');
  console.log('BOUNDARY '+unsupported.at(-1));
});
await test('module retirement reproduces protected writer-restamp boundary with an admitted project',async()=>{
  const f=await fixture(subject,{buildId:'\u0001'.repeat(512)}),d=await f.assembled();
  kind(await subject.keepBuild(f.state,d),'published');let r=copy(f.root());r.revision++;r.lastWriterBuild='x';r=sized(r,LIMITS.dataBytes+1);await f.sync(r);f.reset();
  const before=size(f.root()),result=await subject.removeBuild(f.state,r.projects[0].id);
  kind(result,'published');assert.ok(size(f.root())>before);assert.ok(size(f.root())<=LIMITS.bytes);
  console.log('BOUNDARY model removeBuild also reaches LIFECYCLE-SHRINK: before='+before+' after='+size(f.root())+'; not an actionable PASS');
});
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
async function mutant(before,after){let s=readFileSync(new URL('m4-worldcraft.mjs',base),'utf8');assert.equal(s.split(before).length,2,'unique mutant target');s=s.replace(before,after);
  for(const f of ['kanji-family.js','kanji-structure.js'])s=s.replace("'./"+f+"'",JSON.stringify(new URL(f,base).href));return import(dataURL(s));}
let killed=0;
for(const [name,before,after,oracle] of [
  ['OFF guard removed',"if (!r.value.journeyWrites || !r.value.worldcraftEnabled) return no('worldcraft-off');\n  if (requireView","if (false) return no('worldcraft-off');\n  if (requireView",offOracle],
  ['capture proof omitted',"|| failed || !proof)","|| failed)",captureOracle],
  ['same-key reservation join removed',"if (s.inflight.has(key)) return s.inflight.get(key);","if (false) return s.inflight.get(key);",overlapOracle],
  ['queued duplicate admission removed',"if (next.projects.some(p => p.buildKey === d.key)) throw new Error('project-exists');","if (false) throw new Error('project-exists');",queuedOracle],
  ['target action verification removed',"observed?.action === target.action && observed.outcome === 'published'","observed?.action && observed.outcome === 'published'",observerOracle],
  ['publication exception ignored',"exact = !thrown && count === 1", "exact = count === 1",observerOracle],
  ['ack verification removed',"observed.acknowledged === true && /^[a-f0-9]{64}$/", "true && /^[a-f0-9]{64}$/",observerOracle],
  ['target hash verification removed',"observed.rootHash === observed.proposedHash && root.ok", "root.ok",observerOracle],
  ['final display view recheck removed',"result.display === true && views.get(d.view)?.view === final.value.snapshot.view","result.display === true",finalDisplayOracle],
  ['settlement signal ignored',"if (!signalled || !worldAccess(state).ok)","if (!worldAccess(state).ok)",reconcileOracle],
]){
  const api=await mutant(before,after);await assert.rejects(()=>oracle(api),{code:'ERR_ASSERTION'},name);killed++;console.log('KILLED '+name);
}
console.log(JSON.stringify({verifier:'m4-worldcraft-projects',cases,mutantsKilled:killed,passed:unsupported.length===0,controlsPassed:true,unsupported,lifecycleHash,
  evidence:'unchanged lifecycle rule body; in-memory record-core digest shim; simulated ON record/CAS/device/capture/settlement authority; no real host/storage/capture admission'}));

if (unsupported.length) process.exitCode = 1; // A known failed lease obligation is never a green process.
