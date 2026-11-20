/** Service-level Worldcraft integration: actual App/Host/lifecycle and the pinned
 * E6 generated core, synthetic controller/records and disclosure adapter only.
 * No browser, filesystem writes, network or real learner data. This does NOT
 * prove production corridor admission, real IndexedDB or native abort custody.
 * node .../verify-m4-worldcraft-host.mjs --modules=<E6 site>/modules
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as world from '../m4-worldcraft.mjs';
import { load, memoryController, memoryDevice, baseRecord, binding, corePort, RECORD, COMMANDS, SOURCES } from './verify-journey-record.mjs';

const modulesPath = process.argv.find(x => x.startsWith('--modules='))?.slice(10);
assert(modulesPath, '--modules=<E6 site>/modules is required; no automatic build');
const sha = x => createHash('sha256').update(x).digest('hex');
const coreBytes = readFileSync(resolve(modulesPath, 'record-core.mjs'));
assert.equal(sha(coreBytes), '257065eb60b2ed0cf8c1043d1e71764b8b9dc04977db830b61025854e26d2b9e');
const manifest = JSON.parse(readFileSync(resolve(modulesPath, '../build-identity.json'), 'utf8'));
assert.equal(manifest.gitSha, '013fd0767d084a0f777259b90069af1fe8ae33e8');
assert.equal(manifest.files.find(x => x.path === 'modules/record-core.mjs').sha256, sha(coreBytes));
let m = await load();
const good = x => { assert.equal(x.ok, true, x.reason); return x.value; };
const kind = (x, expected) => assert.equal(x.kind, expected, JSON.stringify(x));
const canonical = x => m.core.encodeLocalJson(x).text;
const otherRoots = x => canonical(Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'm4Journey')));
const deepFreeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const bytes = Object.fromEntries(Object.entries(world.SOURCE_PINS).map(([key, pin]) =>
  [key, readFileSync(new URL('../data/share_alike/' + pin.file, import.meta.url))]));
const catalog = good(await world.createWorldcraftCatalog(bytes));
let serial = 0;

async function fixture({ enabled = true, response = 'normal' } = {}) {
  const id = ++serial, ownerState = { active: true, epoch: 1 }, control = { response, afterWork: false, beforeTarget: null };
  const controller = memoryController(), actions = [];
  const rawSnapshot = controller.snapshot.bind(controller);
  controller.snapshot = async () => { const snapshot = await rawSnapshot(); return control.snapshotTransform ? control.snapshotTransform(snapshot) : snapshot; };
  const rawCommit = controller.commitLocal.bind(controller);
  controller.commitLocal = async request => {
    const row = request.mutations.find(x => x.collection === COMMANDS)?.value;
    actions.push(row?.journey?.action ?? row?.type ?? 'unknown');
    if (['work', 'retire-work'].includes(row?.journey?.action) && control.beforeTarget) await control.beforeTarget(request);
    return rawCommit(request);
  };
  const writer = {
    capture: () => ({ ownerId: 'owner-' + id, epoch: ownerState.epoch, sessionId: binding.sessionId }),
    assert: captured => ownerState.active && captured.ownerId === 'owner-' + id && captured.epoch === ownerState.epoch,
  };
  const app = await m.app.createRecordApp({ controller, binding, writer, validateRecord: () => true, validateArchive: () => true });
  const beginnings = [];
  // Fault injection at the observation boundary only. The real App allocates and
  // owns every handle; a test response cannot create terminal authority.
  const portApp = {
    journeyAuthority: () => app.journeyAuthority(), commitJourney: (...args) => app.commitJourney(...args),
    settleJourneyCommit: handle => app.settleJourneyCommit(handle),
    beginJourneyCommit(...args) {
      const begun = app.beginJourneyCommit(...args); beginnings.push(begun);
      return { handle: begun.handle, completion: begun.completion.then(outcome => {
        if (control.response === 'throw') throw new Error('byte-bound');
        if (control.response === 'bare') return { status: 'active' };
        if (control.response === 'recovery') return { status: 'recovery-required' };
        return outcome;
      }) };
    },
  };
  const port = m.lifecycle.recordPort({ app: portApp, binding: () => ({ epoch: ownerState.epoch }), nextId: () => 'journey-' + id });
  const batches = new WeakSet(), clock = { now: Date.parse('2026-10-29T12:00:00+09:00') };
  const lc = m.lifecycle.createLifecycle({ port, device: memoryDevice(), buildId: 'worldcraft-service-e6', core: corePort(),
    clock: () => clock.now, enabled, validateCapture: entries => { assert(batches.has(entries)); return entries; } });
  await lc.ready;
  const view = { current: {} }, navigation = {}, recordToken = {}, operations = [];
  const lifecycle = {
    tick: () => lc.tick(), inspect: () => lc.inspect(), holdUnconfirmed: () => lc.holdUnconfirmed(),
    preDispatchRefusal: (...args) => lc.preDispatchRefusal(...args),
    async work(collection, data, options) {
      operations.push(options.target);
      const result = await lc.work(collection, data, options);
      if (control.afterWork) throw new Error('project-exists');
      return result;
    },
    async retire(collection, projectId, decision, options) {
      operations.push(options.target); return lc.retire(collection, projectId, decision, options);
    },
  };
  let captured = 0;
  const read = () => {
    assert.equal(app.current().status, 'active');
    const snapshot = app.journeyAuthority(), generation = m.lifecycle.authority(snapshot).generation;
    assert.equal(ownerState.active, true);
    return { owner: app, record: recordToken, epoch: ownerState.epoch, boot: lc.bootIdentity(), generation,
      journeyId: snapshot.record.m4Journey?.id ?? null, root: snapshot.record.m4Journey ?? null,
      view: view.current, navigation, visit: null, carried: null, journeyWrites: enabled, worldcraftEnabled: enabled };
  };
  const ports = { read, lifecycle, digest: m.lifecycle.digest, settledRead: port.settledRead,
    async capture(request, proof) {
      captured++;
      const batch = deepFreeze([{ raw: { what: 'worldcraft-build', about: { kind: 'kanji', literal: request.host },
        reveals: ['form'], at: clock.now }, origin: { eventId: `worldcraft/${id}/${captured}`, sessionId: `worldcraft/${id}` } }]);
      batches.add(batch);
      const shown = await lc.awaitHelp(await lc.beginHelp(batch));
      if (shown.display && shown.accepted) proof.kept();
      else if (shown.display && shown.held) proof.held();
    } };
  const owner = good(world.createWorldOwner(catalog, ports));
  const stateResult = world.createWorldcraftState(owner);
  const state = enabled ? good(stateResult) : null;
  const assemble = async (host = '織') => {
    const draft = good(world.beginBuild(state, catalog, host));
    good(await world.assembleBuild(state, draft, good(world.createWorldView(owner)))); return draft;
  };
  return { app, controller, actions, port, lc, owner, ownerState, state, stateResult, assemble, control, beginnings,
    operations, view, clock, ports, read, root: () => app.journeyAuthority().record.m4Journey,
    targetDispatches: () => actions.filter(x => ['work', 'retire-work'].includes(x)).length };
}

const results = [], checks = new Map();
async function test(name, body) {
  checks.set(name, body); await body(); results.push(name); console.log('PASS ' + name);
}
await test('OFF: no state, target or capture; no learner root created', async () => {
  const f = await fixture({ enabled: false });
  assert.equal(f.stateResult.reason, 'worldcraft-off'); assert.equal(f.actions.length, 0);
  assert.equal(f.root(), undefined); assert.equal(otherRoots(f.controller.document(RECORD)), otherRoots(baseRecord()));
});
await test('three source recipes: assemble, Keep, inspect, retire; no grading or ID reuse', async () => {
  const f = await fixture(), untouched = otherRoots(f.controller.document(RECORD));
  let lastId = 0;
  for (const host of ['織', '識', '職']) {
    const d = await f.assemble(host), kept = await world.keepBuild(f.state, d); kind(kept, 'published');
    const rows = good(world.keptBuilds(f.root(), catalog)); assert.equal(rows.length, 1); assert.equal(rows[0].recipe.host, host);
    const nextId = Number(kept.projectId.split('/').at(-1)); assert(nextId > lastId); lastId = nextId;
    assert.equal(f.root().projects[0].placement, null);
    kind(await world.removeBuild(f.state, kept.projectId), 'published'); assert.equal(f.root().projects.length, 0);
  }
  assert.equal(f.root().progress.retiredProjects, 3); assert.equal(f.targetDispatches(), 6);
  assert.equal(otherRoots(f.controller.document(RECORD)), untouched);
  assert.equal(f.root().daily.events.length, 3);
});
await test('same-key concurrent Keep dispatches once and repeated Keep is exists', async () => {
  const f = await fixture(), d = await f.assemble(), a = world.keepBuild(f.state, d), b = world.keepBuild(f.state, d);
  const both = await Promise.all([a, b]); both.forEach(x => kind(x, 'published'));
  assert.equal(f.targetDispatches(), 1); kind(await world.keepBuild(f.state, d), 'exists'); assert.equal(f.targetDispatches(), 1);
});
for (const response of ['throw', 'bare', 'recovery']) await test('published then ' + response + ': uncertainty, exact receipt reconciliation, no retry', async () => {
  const f = await fixture({ response }), d = await f.assemble();
  kind(await world.keepBuild(f.state, d), 'uncertain'); assert.equal(f.root().projects.length, 1);
  kind(await world.keepBuild(f.state, d), 'uncertain'); assert.equal(f.targetDispatches(), 1);
  let signals = 0; const target = f.operations[0];
  await f.port.settledRead({ ...target }, () => signals++);
  await f.port.settledRead({ ...target, action: 'retire-work' }, () => signals++);
  await f.port.settledRead({ ...target, operation: {} }, () => signals++);
  assert.equal(signals, 0, 'cloned/wrong targets never signal');
  kind(await world.reconcileBuild(f.state, d), 'present'); assert.equal(f.targetDispatches(), 1);
  assert.equal(f.app.journeyAuthority().commands.some(x => ['work', 'retire-work'].includes(x.journey?.action)), false);
});
await test('post-lifecycle throw and uncertain retirement settle original commands only', async () => {
  const f = await fixture(), d = await f.assemble(); f.control.afterWork = true;
  kind(await world.keepBuild(f.state, d), 'uncertain'); kind(await world.reconcileBuild(f.state, d), 'present');
  f.control.response = 'throw'; const id = f.root().projects[0].id;
  kind(await world.removeBuild(f.state, id), 'uncertain');
  kind(await world.removeBuild(f.state, id), 'absent'); assert.equal(f.targetDispatches(), 2);
});
await test('post-dispatch absent row stays unresolved; no manufactured abort proof', async () => {
  const f = await fixture(), d = await f.assemble(); f.controller.state.mode = 'fail';
  const out = await world.keepBuild(f.state, d); assert(['owner-changed', 'uncertain'].includes(out.kind));
  f.controller.state.mode = 'ok'; await f.app.snapshot();
  kind(await world.reconcileBuild(f.state, d), 'unresolved');
  kind(await world.keepBuild(f.state, d), 'uncertain'); assert.equal(f.targetDispatches(), 1);
});
await test('foreign, cloned and old-owner handles never settle', async () => {
  const f = await fixture({ response: 'throw' }), d = await f.assemble(); await world.keepBuild(f.state, d);
  const h = f.beginnings[0].handle, other = await fixture();
  assert.equal((await other.app.settleJourneyCommit(h)).state, 'unresolved');
  assert.equal((await f.app.settleJourneyCommit({ ...h })).state, 'unresolved');
  f.ownerState.epoch++;
  assert.equal((await f.app.settleJourneyCommit(h)).state, 'unresolved');
  kind(await world.reconcileBuild(f.state, d), 'unresolved'); assert.equal(f.targetDispatches(), 1);
});
await test('unsettled target cannot be released by queue inspection or another receipt', async () => {
  const f = await fixture({ response: 'throw' }), d = await f.assemble(), block = deferred();
  f.control.beforeTarget = () => block.promise;
  const keep = world.keepBuild(f.state, d);
  for (let i = 0; i < 20 && !f.beginnings.length; i++) await Promise.resolve();
  assert.equal(f.beginnings.length, 1);
  assert.equal((await f.app.settleJourneyCommit(f.beginnings[0].handle)).state, 'unresolved');
  kind(await world.reconcileBuild(f.state, d), 'unresolved');
  block.resolve(); await keep; kind(await world.reconcileBuild(f.state, d), 'present');
});
await test('ordinary record revision movement preserves journey CAS; current root movement refuses', async () => {
  const f = await fixture(), root = structuredClone(f.root());
  await f.app.write(record => ({ patch: { futureRoot: { ...record.futureRoot, ordinary: true } } }));
  const next = { ...root, revision: root.revision + 1 };
  const input = { expected: { rootSha256: m.lifecycle.digest(root), generation: root.generation }, root: next,
    journey: { action: 'visit', journeyId: root.id } };
  assert.equal((await f.app.commitJourney(input)).status, 'active');
  const stale = f.app.beginJourneyCommit(input); await assert.rejects(stale.completion, /journey-root-moved/);
  const settled = await f.app.settleJourneyCommit(stale.handle);
  assert.equal(settled.state, 'terminal'); assert.equal(settled.publication, 'not-published');
});
await test('historical target receipt survives a later owned root change', async () => {
  const f = await fixture({ response: 'throw' }), d = await f.assemble();
  kind(await world.keepBuild(f.state, d), 'uncertain'); const rootBefore = m.lifecycle.digest(f.root());
  await f.lc.enter('worldcraft'); assert.notEqual(m.lifecycle.digest(f.root()), rootBefore);
  kind(await world.reconcileBuild(f.state, d), 'present'); assert.equal(f.targetDispatches(), 1);
});
await test('wrong receipt root, command identity, owner scope and generation cannot settle', async () => {
  for (const bad of ['root', 'changeId', 'scope', 'generation']) {
    const f = await fixture({ response: 'throw' }), d = await f.assemble(); await world.keepBuild(f.state, d);
    f.control.snapshotTransform = snapshot => {
      const row = snapshot.snapshot.documents.find(x => x.collection === COMMANDS && x.value.journey?.action === 'work');
      assert(row);
      if (bad === 'root') row.value.journey.rootSha256 = '0'.repeat(64);
      if (bad === 'changeId') { row.id += '-wrong'; row.value.changeId = row.id; }
      if (bad === 'scope') row.value.scope.learnerId = 'foreign';
      if (bad === 'generation') snapshot.migrationId += '-replacement';
      return snapshot;
    };
    assert.equal((await f.app.settleJourneyCommit(f.beginnings[0].handle)).state, 'unresolved', bad);
    kind(await world.reconcileBuild(f.state, d), 'unresolved'); assert.equal(f.targetDispatches(), 1);
  }
});
await test('private C2 refusal stays exact and control-day writes never inherit target handle', async () => {
  const f = await fixture(), op = {}, wrong = {}, before = f.targetDispatches();
  const thrown = new Error('private-admission');
  f.clock.now += 2 * 24 * 60 * 60 * 1000;
  await assert.rejects(f.lc.work('projects', {}, { operation: op, admit() { throw thrown; } }), e => e === thrown);
  assert.equal(f.lc.preDispatchRefusal(op, thrown).source, 'admission');
  assert.equal(f.lc.preDispatchRefusal(wrong, thrown), null);
  assert.equal(f.lc.preDispatchRefusal(op, new Error('private-admission')), null);
  assert.equal(f.targetDispatches(), before); assert.equal(f.beginnings.length, 0);
  assert(f.actions.some(x => !['work', 'retire-work'].includes(x)));
});
await test('late publication never repaints a departed view', async () => {
  const f = await fixture(), d = await f.assemble(), gate = deferred();
  f.control.beforeTarget = () => gate.promise;
  const pending = world.keepBuild(f.state, d);
  for (let i = 0; i < 25 && f.targetDispatches() === 0; i++) await Promise.resolve();
  f.view.current = {}; gate.resolve(); const result = await pending;
  assert(['published', 'refused'].includes(result.kind)); assert.notEqual(result.display, true);
});
await test('real core canonical digest and absolute root bound; no compatibility encoder', async () => {
  assert.equal(m.lifecycle.digest({ b: 2, a: 1 }), m.core.encodeLocalJson({ a: 1, b: 2 }).sha256);
  const f = await fixture(), root = f.root(), before = f.targetDispatches();
  const huge = { ...root, revision: root.revision + 1, filler: 'x'.repeat(262144) };
  await assert.rejects(f.app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(root), generation: root.generation },
    root: huge, journey: { action: 'work', journeyId: root.id } }), /invalid-journey-command/);
  assert.equal(f.targetDispatches(), before);
});
const mutants = [];
if (process.argv.includes('--mutants')) {
  const definitions = [
    ['missing-durability-is-absence', 'lifecycle', ":{outcome:'uncertain',acknowledged:false};", ":{outcome:'not-published',acknowledged:false};", 'published then bare: uncertainty, exact receipt reconciliation, no retry'],
    ['rejection-is-absence', 'lifecycle', "const uncertain=()=>({outcome:'uncertain',acknowledged:false});", "const uncertain=()=>({outcome:'not-published',acknowledged:false});", 'published then throw: uncertainty, exact receipt reconciliation, no retry'],
    ['borrowed-target-signals', 'lifecycle', 'target.originalTarget!==originalTarget||', '', 'published then throw: uncertainty, exact receipt reconciliation, no retry'],
    ['post-dispatch-absence-is-abort', 'host', "} else if (!custody.dispatched) publication = 'not-published';\n      else return unresolved();", "} else publication = 'not-published';", 'post-dispatch absent row stays unresolved; no manufactured abort proof'],
    ['receipt-root-unbound', 'host', 'row.journey.rootSha256 !== digest(root)', 'false', 'wrong receipt root, command identity, owner scope and generation cannot settle'],
    ['receipt-bound-to-current-root', 'host', 'row.journey.rootSha256 !== digest(root)', 'row.journey.rootSha256 !== digest(state.record.m4Journey)', 'historical target receipt survives a later owned root change'],
  ];
  for (const [name, unit, before, after, check] of definitions) {
    assert.equal(SOURCES[unit].split(before).length, 2, 'unique mutant: ' + name);
    m = await load({ ...SOURCES, [unit]: SOURCES[unit].replace(before, after) });
    await assert.rejects(checks.get(check), error => error instanceof assert.AssertionError, 'specific assertion kills ' + name);
    mutants.push(name); console.log('KILLED ' + name);
  }
  m = await load();
}
console.log(JSON.stringify({ verifier: 'm4-worldcraft-host-service', passed: results.length,
  mutantsKilled: mutants, coreSha256: sha(coreBytes), source: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, sha(v)])),
  limitations: ['synthetic controller and disclosure producer', 'four existing fixture replica view-reader overrides',
    'no corridor factory, native IndexedDB, browser, activation or authenticated abort proof'] }, null, 2));
