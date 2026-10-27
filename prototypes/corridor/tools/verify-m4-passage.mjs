/** Executable finite-route model controls; no host, learner, timer or browser. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldcraftCatalog, SOURCE_PINS } from '../m4-worldcraft.mjs';
import * as subject from '../m4-passage.mjs';

const base = new URL('../', import.meta.url);
const bytes = Object.fromEntries(Object.entries(SOURCE_PINS).map(([key, row]) =>
  [key, readFileSync(new URL('data/share_alike/' + row.file, base))]));
const actual = result => { assert.equal(result.ok, true, result.reason); return result.value; };
const refuse = (result, reason) => { assert.equal(result.ok, false); if (reason) assert.equal(result.reason, reason); };
const catalog = actual(await createWorldcraftCatalog(bytes));
const route = actual(subject.resolvePassage(catalog));
const view = (api, page) => actual(api.inspectPassage(page));
let returnedEffects = 0;
const step = (api, page, command) => {
  const value = actual(api.reducePassage(page, command));
  assert.deepEqual(value.effects, []);
  returnedEffects += value.effects.length;
  assert.strictEqual(value.page, page);
  return value.snapshot;
};
function unchanged(api, page, command, reason) {
  const before = view(api, page);
  refuse(api.reducePassage(page, command), reason);
  const after = view(api, page);
  assert.deepEqual(after, before);
  assert.strictEqual(after.motionTicket, before.motionTicket);
}
const newPage = (motion = 'full') => actual(subject.createPassage(catalog, route, { motion }));
let cases = 0;
async function test(name, body) { await body(); cases++; console.log('PASS ' + name); }

await test('seven indexed stops and six independently expected authored edges', () => {
  const r = actual(subject.inspectRoute(catalog, route));
  assert.equal(r.id, 'shiki-shoku-source-route'); assert.equal(r.revision, 1);
  assert.deepEqual(r.stops.map(s => s.reference.id), ['職', '戠', '識', '戠', '織', '糸', '織']);
  assert.equal(new Set(r.stops.map(s => s.stopId)).size, 7);
  assert.deepEqual(r.hops.map(h => [h.edgeId, h.direction]), [
    ['戠:phonetic-component-of:職', 'incoming'], ['戠:phonetic-component-of:識', 'outgoing'],
    ['戠:phonetic-component-of:識', 'incoming'], ['戠:phonetic-component-of:織', 'outgoing'],
    ['糸:semantic-component-of:織', 'incoming'], ['糸:semantic-component-of:織', 'outgoing'],
  ]);
  r.hops.forEach((hop, i) => {
    assert.deepEqual(hop.from, r.stops[i].reference); assert.deepEqual(hop.to, r.stops[i + 1].reference);
    assert.ok(hop.evidence.length);
  });
  assert.throws(() => { r.stops[0].reference.id = 'invented'; }, TypeError);
});
await test('route/page capability forgery and borrowed catalog reject', async () => {
  const otherCatalog = actual(await createWorldcraftCatalog(bytes));
  refuse(subject.resolvePassage({}));
  refuse(subject.inspectRoute(otherCatalog, route), 'route-not-admitted');
  refuse(subject.createPassage(otherCatalog, route, { motion: 'full' }), 'route-not-admitted');
  for (const forged of [{}, { ...route }, actual(subject.inspectRoute(catalog, route)),
    new Proxy(route, {}), Object.create(route)]) {
    refuse(subject.createPassage(catalog, forged, { motion: 'full' }));
  }
  const page = newPage();
  for (const forged of [{}, { ...page }, view(subject, page), new Proxy(page, {})]) {
    refuse(subject.reducePassage(forged, { type: 'next' }), 'page-not-live');
  }
  refuse(subject.createPassage(catalog, route, { motion: 'automatic' }), 'motion-unsupported');
});
function nextTrace(motion) {
  const page = newPage(motion), sequence = [view(subject, page).stop.reference.id];
  assert.deepEqual(view(subject, page).cursor, {
    routeId: 'shiki-shoku-source-route', revision: 1, index: 0, phase: 0, status: 'paused', motion,
  });
  for (let i = 1; i <= 6; i++) {
    const current = step(subject, page, { type: 'next' });
    assert.equal(current.cursor.index, i); assert.equal(current.cursor.status, 'paused');
    assert.equal(current.cursor.phase, 0); assert.equal(current.motionTicket, null);
    sequence.push(current.stop.reference.id);
  }
  const end = step(subject, page, { type: 'next' });
  assert.equal(end.cursor.index, 6); assert.equal(end.cursor.phase, 1); assert.equal(end.cursor.status, 'complete');
  unchanged(subject, page, { type: 'next' }, 'ride-complete');
  unchanged(subject, page, { type: 'play' }, 'ride-complete');
  step(subject, page, { type: 'replay' });
  assert.equal(view(subject, page).cursor.index, 0);
  assert.equal(view(subject, page).cursor.phase, 0);
  assert.equal(view(subject, page).cursor.status, 'paused');
  assert.equal(view(subject, page).motionTicket, null);
  return sequence;
}
await test('full/reduced Next traces agree, paused Next stays paused, finish never loops', () => {
  assert.deepEqual(nextTrace('full'), nextTrace('reduced'));
});
function unfinishedReplay(api, admittedRoute) {
  const page = actual(api.createPassage(catalog, admittedRoute, { motion: 'full' }));
  unchanged(api, page, { type: 'replay' }, 'existing-ride-use-resume');
  step(api, page, { type: 'next' });
  unchanged(api, page, { type: 'start' }, 'existing-ride-use-resume');
}
await test('unfinished start/replay refuse at first and middle stop', () => unfinishedReplay(subject, route));
await test('playing Next retains status and invalidates an older tick', () => {
  const page = newPage();
  const before = step(subject, page, { type: 'play' });
  const again = step(subject, page, { type: 'play' });
  assert.strictEqual(again.motionTicket, before.motionTicket);
  const next = step(subject, page, { type: 'next' });
  assert.equal(next.cursor.status, 'playing');
  assert.notStrictEqual(next.motionTicket, before.motionTicket);
  unchanged(subject, page, { type: 'progress', ticket: before.motionTicket, phase: 1 }, 'motion-ticket-stale');
});
await test('phase bounds and invalid commands refuse without changing cursor or ticket', () => {
  const page = newPage();
  unchanged(subject, page, { type: 'progress', ticket: null, phase: 0.2 }, 'motion-progress-refused');
  const ticket = step(subject, page, { type: 'play' }).motionTicket;
  for (const phase of [-1, 1.01, NaN, Infinity, -Infinity, '0.2']) {
    unchanged(subject, page, { type: 'progress', ticket, phase }, 'phase-invalid');
  }
  step(subject, page, { type: 'progress', ticket, phase: 0.6 });
  unchanged(subject, page, { type: 'progress', ticket, phase: 0.5 }, 'phase-invalid');
  unchanged(subject, page, { type: 'finish-step', ticket }, 'phase-incomplete');
  unchanged(subject, page, { type: 'teleport' }, 'command-shape');
  unchanged(subject, page, { type: 'next', index: 99 }, 'command-shape');
});
await test('command and option getters never run; revoked proxies refuse unchanged', () => {
  const page = newPage();
  step(subject, page, { type: 'play' });
  let called = 0;
  const getter = () => { called++; subject.reducePassage(page, { type: 'next' }); return 'next'; };
  const command = Object.defineProperty({}, 'type', { get: getter });
  unchanged(subject, page, command, 'command-shape');
  unchanged(subject, page, { type: { toString: getter } }, 'command-shape');
  const progress = { type: 'progress', ticket: view(subject, page).motionTicket };
  Object.defineProperty(progress, 'phase', { get: getter });
  unchanged(subject, page, progress, 'command-shape');
  const options = Object.defineProperty({}, 'motion', { get: getter });
  refuse(subject.createPassage(catalog, route, options), 'motion-unsupported');
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
  unchanged(subject, page, proxy, 'command-shape');
  assert.equal(called, 0);
});
await test('progress1 is distinct from finish; scheduled completion is exact-once', () => {
  const page = newPage(), ticket = step(subject, page, { type: 'play' }).motionTicket;
  const progress = step(subject, page, { type: 'progress', ticket, phase: 1 });
  assert.equal(progress.cursor.index, 0);
  const next = step(subject, page, { type: 'finish-step', ticket });
  assert.equal(next.cursor.index, 1); assert.equal(next.cursor.phase, 0);
  unchanged(subject, page, { type: 'finish-step', ticket }, 'motion-ticket-stale');
  for (let i = 1; i <= 6; i++) {
    const t = view(subject, page).motionTicket;
    step(subject, page, { type: 'progress', ticket: t, phase: 1 });
    const current = step(subject, page, { type: 'finish-step', ticket: t });
    assert.equal(current.cursor.index, Math.min(i + 1, 6));
    assert.equal(current.cursor.status, i === 6 ? 'complete' : 'playing');
  }
  const final = view(subject, page);
  assert.equal(final.cursor.index, 6); assert.equal(final.cursor.phase, 1); assert.equal(final.motionTicket, null);
});
function reducedTimer(api, admittedRoute) {
  const page = actual(api.createPassage(catalog, admittedRoute, { motion: 'reduced' }));
  step(api, page, { type: 'play' });
  unchanged(api, page, { type: 'progress', ticket: null, phase: 1 }, 'motion-progress-refused');
  unchanged(api, page, { type: 'finish-step', ticket: null }, 'motion-progress-refused');
}
await test('reduced motion refuses progress/timer completion, explicit Next still works', () => {
  reducedTimer(subject, route);
  const page = newPage('reduced');
  step(subject, page, { type: 'play' });
  const result = step(subject, page, { type: 'next' });
  assert.equal(result.cursor.index, 1); assert.equal(result.cursor.status, 'playing');
  assert.equal(result.motionTicket, null);
});
await test('pause, motion switch and foreign page invalidate tick ownership', () => {
  const page = newPage(), other = newPage();
  const ticket = step(subject, page, { type: 'play' }).motionTicket;
  step(subject, other, { type: 'play' });
  unchanged(subject, other, { type: 'progress', ticket, phase: 1 }, 'motion-ticket-stale');
  step(subject, page, { type: 'progress', ticket, phase: 0.6 });
  const reduced = step(subject, page, { type: 'motion', motion: 'reduced' });
  assert.equal(reduced.cursor.phase, 0.6); assert.equal(reduced.cursor.status, 'paused');
  step(subject, page, { type: 'motion', motion: 'full' });
  assert.equal(view(subject, page).cursor.status, 'paused');
  step(subject, page, { type: 'play' });
  unchanged(subject, page, { type: 'progress', ticket, phase: 1 }, 'motion-ticket-stale');
  const t2 = view(subject, page).motionTicket;
  step(subject, page, { type: 'pause' }); step(subject, page, { type: 'play' });
  unchanged(subject, page, { type: 'progress', ticket: t2, phase: 1 }, 'motion-ticket-stale');
});
await test('snapshots immutable; discard idempotent and late actions refused', () => {
  const page = newPage(), snapshot = view(subject, page);
  assert.throws(() => { snapshot.cursor.index = 6; }, TypeError);
  assert.equal(view(subject, page).cursor.index, 0);
  assert.equal(subject.discardPassage(page), true);
  assert.equal(subject.discardPassage(page), false);
  refuse(subject.inspectPassage(page), 'page-not-live');
  refuse(subject.reducePassage(page, { type: 'next' }), 'page-not-live');
  assert.equal(subject.discardPassage({}), false);
});
async function mutant(replacements) {
  let source = readFileSync(new URL('m4-passage.mjs', base), 'utf8');
  for (const [before, after] of replacements) {
    assert.equal(source.split(before).length, 2, 'mutation target unique'); source = source.replace(before, after);
  }
  source = source.replace("'./m4-worldcraft.mjs'", JSON.stringify(new URL('m4-worldcraft.mjs', base).href));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
let killed = 0;
for (const [name, replacements, oracle] of [
  ['unfinished replay guard removed', [["if (current.status !== 'complete') return no('existing-ride-use-resume');", 'if (false) return no(\'existing-ride-use-resume\');']], unfinishedReplay],
  ['reduced timer progress admitted', [
    ["if (current.motion !== 'full' || current.status !== 'playing') return no('motion-progress-refused');", "if (current.status !== 'playing') return no('motion-progress-refused');"],
    ["if (!ticket || command.ticket !== ticket) return no('motion-ticket-stale');", "if (current.motion === 'full' && (!ticket || command.ticket !== ticket)) return no('motion-ticket-stale');"],
  ], reducedTimer],
]) {
  const api = await mutant(replacements), admittedRoute = actual(api.resolvePassage(catalog));
  assert.throws(() => oracle(api, admittedRoute), { code: 'ERR_ASSERTION' }, name);
  killed++; console.log('KILLED ' + name);
}
console.log(JSON.stringify({ verifier: 'm4-passage', cases, mutantsKilled: killed,
  stops: 7, hops: 6, returnedEffects, passed: true }));
