/** HOOKS r8 rev 3.2 §7: the journey's record host path, in Node. The real record-host, record-app and journey-lifecycle
 * sources over the built record-core (--modules=<site>/modules, from any site built from these packages), an in-memory
 * controller, and synthetic records only. Test-only: the four replica view readers return empty views for the fixture's
 * replica (a genuine replica needs IndexedDB, which waits for the browser slot). stdout only; no files are written.
 *   node tools/verify-journey-record.mjs --modules=<dir> [--case=<id>] [--mutants]
 */
import assert from 'node:assert/strict';
import { readFileSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const MODULES = arg('modules') || process.env.KAIRO_MODULES_DIR;
const floor = () => { const s = statfsSync(DIR); assert.ok(s.bavail * s.bsize >= 1.5 * 1024 ** 3, 'DISK STOP: below 1.5 GiB'); };
const url = (text) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const built = (name) => pathToFileURL(resolve(MODULES, name)).href;
const read = (name) => readFileSync(resolve(DIR, name), 'utf8');
export const SOURCES = Object.freeze({ host: read('record-host.mjs'), app: read('record-app.mjs'), lifecycle: read('journey-lifecycle.mjs'),
  inbox: read('source-inbox.mjs') });

/** one in-memory module graph per source set (a mutant gets its own) */
export async function load(sources = SOURCES) {
  assert.ok(MODULES, 'pass --modules=<dir> holding a built record-core.mjs and reading-core.mjs');
  const core = url(`export * from '${built('record-core.mjs')}';
import * as real from '${built('record-core.mjs')}';
const fixture = (replica) => replica && replica.journeyFixture === true;
export const readNoteViews = (replica) => fixture(replica) ? [] : real.readNoteViews(replica);
export const readReadingViews = (replica) => fixture(replica) ? [] : real.readReadingViews(replica);
export const readSourceReferenceViews = (replica) => fixture(replica) ? [] : real.readSourceReferenceViews(replica);
export const readExamAttemptViews = (replica) => fixture(replica) ? [] : real.readExamAttemptViews(replica);`);
  const swap = (text, pairs) => pairs.reduce((value, [from, to]) => {
    assert.equal(value.split(from).length, 2, 'import not found: ' + from); return value.replace(from, to);
  }, text);
  const inbox = url(swap(sources.inbox, [["from './modules/reading-core.mjs'", `from '${built('reading-core.mjs')}'`],
    ["from './modules/record-core.mjs'", `from '${core}'`]]));
  const host = url(swap(sources.host, [["from './modules/record-core.mjs'", `from '${core}'`], ["from './source-inbox.mjs'", `from '${inbox}'`]]));
  const app = url(swap(sources.app, [["from './modules/record-core.mjs'", `from '${core}'`], ["from './record-host.mjs'", `from '${host}'`],
    ["from './source-inbox.mjs'", `from '${inbox}'`]]));
  const lifecycle = url(swap(sources.lifecycle, [["from './modules/record-core.mjs'", `from '${core}'`]]));
  const [coreModule, appModule, lifecycleModule] = await Promise.all([import(core), import(app), import(lifecycle)]);
  canonical = (value) => coreModule.encodeLocalJson(value).text;
  return { core: coreModule, app: appModule, lifecycle: lifecycleModule };
}

export const binding = Object.freeze({ accountId: 'synthetic-account', learnerId: 'synthetic-learner', sessionId: 'synthetic-session' });
const scope = { accountId: binding.accountId, learnerId: binding.learnerId };
export const RECORD = 'learner-record', COMMANDS = 'kairo:record-host-commands';
const ARCHIVE = 'learner-archive', CURRENT = 'current';
/** a small learner record with an unknown root; P1 uses the 36-root synthetic copy */
export const baseRecord = () => ({ v: 1, taken: [], srs: { 'k:職': { due: '2026-10-20T00:00:00.000Z', state: 2, reps: 3 } },
  revlog: [{ k: 'k:職', r: 3 }], obslog: [], stats: { '2026-10-20': { n: 1, again: 0 } }, futureRoot: { nested: { keep: 'unknown-json' } } });

/** the controller seam the host uses: snapshot and commitLocal over one in-memory store; a test can fail or delay a commit */
export function memoryController({ record = baseRecord(), rows = [], migrationId = 'synthetic-migration', revision: start = 1 } = {}) {
  let revision = start, documents = [{ collection: RECORD, id: CURRENT, value: record }, { collection: ARCHIVE, id: CURRENT, value: { version: 1, turns: [] } }, ...rows];
  const state = { mode: 'ok', delay: 0, commits: 0, gate: null };
  return {
    state,
    get revision() { return revision; },
    document: (collection, id = CURRENT) => structuredClone(documents.find((row) => row.collection === collection && row.id === id)?.value),
    rows: (collection) => documents.filter((row) => row.collection === collection).map((row) => structuredClone(row.value)),
    async snapshot() {
      return { status: 'active', migrationId, snapshot: { revision, documents: structuredClone(documents), policy: { binding },
        replica: { journeyFixture: true, operations: [], ready: [] }, runtimeLabel: 'node-journey', actor: { deviceId: 'd', incarnationId: 'i' } } };
    },
    async commitLocal(request) {
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      if (state.gate) await state.gate;
      if (state.mode === 'fail') return { status: 'recovery-required', reason: 'storage-or-source-failure' };
      assert.equal(request.expectedRevision, revision);
      for (const m of request.mutations) {
        documents = documents.filter((row) => !(row.collection === m.collection && row.id === m.id));
        documents.push({ collection: m.collection, id: m.id, value: structuredClone(m.value) });
      }
      revision++; state.commits++;
      return { status: 'active', receipt: { committedRevision: revision, outcome: 'committed' } };
    },
  };
}
export async function openApp(modules, controller) {
  return modules.app.createRecordApp({ controller, binding, writer: { capture: () => ({ ownerId: 'owner', epoch: 1, sessionId: binding.sessionId }), assert: () => true },
    validateRecord: () => true, validateArchive: () => true });
}
export const ON = '2026-10-21T12:00:00+09:00';
export const corePort = () => ({ endOfDay: (date) => { const d = new Date(date); d.setHours(23, 59, 59, 999); return d.getTime(); },
  validItem: (item) => !!item && typeof item === 'object' });
export const memoryDevice = () => { const saved = new Map();
  return { saved, read: (k) => structuredClone(saved.get(k)), write: (k, v) => (saved.set(k, structuredClone(v)), true), remove: (k) => saved.delete(k) }; };
// the host stores and exports records canonically (sorted keys, as every write already does), so a root is unchanged when
// its canonical text is
let canonical = null;
const others = (record) => canonical(Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'm4Journey')));
const refused = (promise, code) => assert.rejects(promise, (error) => error.code === code);

export const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

test('H1', 'a bootstrap writes only m4Journey and its typed receipt in one commit; the authority sees the creation', async (m) => {
  const c = memoryController(), app = await openApp(m, c), before = c.document(RECORD);
  const auth = m.lifecycle.authority(app.journeyAuthority());
  const root = { version: 1, protocol: 'journey-r2', id: 'journey-1', generation: auth.generation, lastWriterBuild: 'build-a', marker: 1 };
  const out = await app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(null), generation: auth.generation }, root,
    journey: { action: 'bootstrap', journeyId: 'journey-1' } });
  assert.equal(out.status, 'active'); assert.equal(out.receipt.type, 'journey.lifecycle/1'); assert.equal(out.receipt.outcome, 'committed');
  assert.equal(out.journey.rootSha256, m.lifecycle.digest(root)); assert.equal(c.state.commits, 1);
  const after = c.document(RECORD); assert.deepEqual(after.m4Journey, root); assert.equal(others(after), others(before));
  const rows = c.rows(COMMANDS); assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].journey, { action: 'bootstrap', generation: auth.generation, journeyId: 'journey-1', rootSha256: m.lifecycle.digest(root) });
  const next = m.lifecycle.authority(app.journeyAuthority());
  assert.equal(next.everCreated, true); assert.equal(next.activated.length, 1); assert.equal(next.generation, auth.generation);
  assert.ok(Object.isFrozen(app.journeyAuthority()) && Object.isFrozen(app.journeyAuthority().record));
});
async function bootstrapped(m, record) {
  const c = memoryController(record ? { record } : {}), app = await openApp(m, c);
  const generation = m.lifecycle.authority(app.journeyAuthority()).generation;
  const root = { version: 1, protocol: 'journey-r2', id: 'journey-1', generation, lastWriterBuild: 'build-a', marker: 1 };
  await app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(null), generation }, root, journey: { action: 'bootstrap', journeyId: 'journey-1' } });
  return { c, app, generation, root };
}
test('H2', 'a stale root hash is refused before any commit, and the host stays active', async (m) => {
  const { c, app, generation, root } = await bootstrapped(m), commits = c.state.commits, before = c.document(RECORD);
  await refused(app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(null), generation }, root: { ...root, marker: 2 },
    journey: { action: 'hold', journeyId: 'journey-1' } }), 'journey-root-moved');
  assert.equal(c.state.commits, commits); assert.deepEqual(c.document(RECORD), before); assert.equal(app.current().status, 'active');
});
test('H3', 'another generation is refused', async (m) => {
  const { c, app, root } = await bootstrapped(m), commits = c.state.commits;
  await refused(app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(root), generation: 'f'.repeat(64) }, root: { ...root, generation: 'f'.repeat(64) },
    journey: { action: 'hold', journeyId: 'journey-1' } }), 'journey-generation-changed');
  assert.equal(c.state.commits, commits); assert.equal(app.current().status, 'active');
});
test('H4', 'a closed gate at the commit boundary cancels the write', async (m) => {
  const { c, app, generation, root } = await bootstrapped(m), commits = c.state.commits;
  await refused(app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(root), generation }, root: { ...root, marker: 2 },
    journey: { action: 'help', journeyId: 'journey-1' } }, () => false), 'journey-gate-closed');
  assert.equal(c.state.commits, commits); assert.deepEqual(c.document(RECORD).m4Journey, root); assert.equal(app.current().status, 'active');
});
test('H5', 'an ordinary grade between journey writes does not refuse the next one (the precondition is the root, not the revision)', async (m) => {
  const { c, app, generation, root } = await bootstrapped(m);
  const graded = await app.write((record) => ({ patch: { srs: { ...record.srs, 'k:業': { due: 'x', state: 0 } } } }));
  assert.equal(graded.status, 'active');
  const out = await app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(root), generation }, root: { ...root, marker: 2 },
    journey: { action: 'hold', journeyId: 'journey-1' } }).catch((error) => ({ refused: error.code }));
  assert.equal(out.receipt?.outcome, 'committed', JSON.stringify(out.refused)); assert.ok(c.document(RECORD).srs['k:業']); assert.equal(c.document(RECORD).m4Journey.marker, 2);
});
test('H6', 'an ordinary patch naming m4Journey is refused; only the typed command writes the root', async (m) => {
  const { c, app, root } = await bootstrapped(m), commits = c.state.commits;
  await refused(app.write(() => ({ patch: { m4Journey: { forged: true } } })), 'journey-root-reserved');
  assert.equal(c.state.commits, commits); assert.deepEqual(c.document(RECORD).m4Journey, root);
});
test('H7', 'the receipt check is explicit: a journey receipt with a bad action, an extra key or no proof stops the host, never filtered', async (m) => {
  const good = { format: 'kairo-local-command-receipt', version: 1, changeId: 'j-1', type: 'journey.lifecycle/1', occurredAt: '2026-10-21T03:00:00.000Z',
    scope, commandSha256: 'a'.repeat(64), beforeRevision: 0, committedRevision: 1, recordSha256: 'b'.repeat(64), archiveSha256: 'c'.repeat(64),
    journey: { action: 'bootstrap', generation: 'd'.repeat(64), journeyId: 'journey-1', rootSha256: 'e'.repeat(64) } };
  const open = async (row) => (await openApp(m, memoryController({ rows: [{ collection: COMMANDS, id: 'j-1', value: row }] }))).current();
  assert.equal((await open(good)).status, 'active');
  for (const bad of [{ ...good, journey: { ...good.journey, action: 'repair' } }, { ...good, journey: { ...good.journey, extra: 1 } },
    (({ journey, ...rest }) => rest)(good), { ...good, journey: { ...good.journey, rootSha256: 'raw' } }, { ...good, type: 'app.patch/1' }]) {
    const state = await open(bad); assert.equal(state.status, 'recovery-required'); assert.equal(state.reason, 'unsupported-command-receipt');
  }
});
test('H8', 'the projection keeps restores and creations only, and authority reads it exactly as the whole journal', async (m) => {
  const { c, app, generation, root } = await bootstrapped(m);
  let current = root;
  for (let index = 2; index <= 30; index++) {
    const next = { ...current, marker: index };
    await app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(current), generation }, root: next, journey: { action: 'help', journeyId: 'journey-1' } });
    current = next;
  }
  const projection = app.journeyAuthority(), journal = c.rows(COMMANDS);
  assert.equal(journal.length, 30); assert.equal(projection.commands.length, 1);
  assert.deepEqual(m.lifecycle.authority({ ...projection, commands: journal }), m.lifecycle.authority(projection));
});

function lifecycleOn(m, app, { time, epoch = () => 1 } = {}) {
  let serial = 0;
  const device = memoryDevice();
  const port = m.lifecycle.recordPort({ app, binding: () => ({ epoch: epoch() }), nextId: () => `journey-${++serial}-${crypto.randomUUID()}` });
  const lc = m.lifecycle.createLifecycle({ port, device, buildId: 'build-a', core: corePort(), clock: () => time.now, enabled: true,
    validateCapture: (entries) => entries });
  return { lc, device };
}
const helpBatch = (key, raw, origin = null) => Object.freeze([Object.freeze({ receiptKey: key, raw: Object.freeze(raw), origin })]);
test('L1', 'on the real app: ON fresh bootstraps a held day; the next day rotates; help acknowledged in time is kept', async (m) => {
  const c = memoryController(), app = await openApp(m, c), time = { now: Date.parse(ON) };
  const { lc } = lifecycleOn(m, app, { time });
  const booted = await lc.ready;
  assert.equal(booted.phase, 'cold-activation'); assert.equal(c.document(RECORD).m4Journey.guard.reason, 'cold-activation');
  assert.deepEqual(c.rows(COMMANDS).map((row) => row.journey.action), ['bootstrap']);
  time.now = corePort().endOfDay(new Date(time.now)) + 60_000;
  assert.equal((await lc.tick()).phase, 'active'); assert.equal(c.document(RECORD).m4Journey.dayEpoch, 2);
  const token = await lc.beginHelp(helpBatch('atlas:1', { what: 'reference', about: { kind: 'kanji', literal: '職' }, reveals: ['meaning'], at: 10 },
    Object.freeze({ eventId: 'atlas:1', sessionId: 'earlier' })));
  const shown = await lc.awaitHelp(token);
  assert.equal(shown.accepted, true); assert.equal(shown.display, true);
  assert.equal(c.document(RECORD).m4Journey.daily.events.length, 1);
  assert.deepEqual(c.rows(COMMANDS).map((row) => row.journey.action), ['bootstrap', 'rotate', 'help']);
  assert.equal(others(c.document(RECORD)), others(baseRecord()));
});
test('L2', 'help not acknowledged within 300 ms displays once and holds the day with W-hold; the late commit is data only', async (m) => {
  const c = memoryController(), app = await openApp(m, c), time = { now: Date.parse(ON) };
  const { lc, device } = lifecycleOn(m, app, { time });
  await lc.ready; time.now = corePort().endOfDay(new Date(time.now)) + 60_000; await lc.tick();
  const base = time.now, wall = Date.now();
  const clock = setInterval(() => { time.now = base + (Date.now() - wall); }, 5);
  c.state.delay = 450;
  try {
    const token = await lc.beginHelp(helpBatch('atlas:2', { what: 'reference', reveals: ['reading'], at: 11 }));
    const shown = await lc.awaitHelp(token);
    assert.equal(shown.display, true); assert.equal(shown.held, true); assert.notEqual(shown.accepted, true);
    const marker = device.saved.get('bunki-journey:hold');
    assert.equal(marker.reason, 'help-write-hold'); assert.deepEqual(Object.keys(marker).sort(), ['day', 'journeyId', 'reason']);
    assert.notEqual(lc.inspect().phase, 'active');
    await new Promise((r) => setTimeout(r, 600));
    assert.equal((await lc.finishHelp(token)).late, true); assert.ok(device.saved.has('bunki-journey:hold')); assert.notEqual(lc.inspect().phase, 'active');
  } finally { clearInterval(clock); }
});

test('L3', 'the exact boundary (J2): an acknowledgement seen at 299 ms is kept; the same acknowledgement seen at 300 ms holds', async (m) => {
  for (const [elapsed, kept] of [[299, true], [300, false]]) {
    const c = memoryController(), app = await openApp(m, c), time = { now: Date.parse(ON) };
    const { lc, device } = lifecycleOn(m, app, { time });
    await lc.ready; time.now = corePort().endOfDay(new Date(time.now)) + 60_000; await lc.tick();
    const started = time.now, token = await lc.beginHelp(helpBatch('atlas:3', { what: 'reference', reveals: ['form'], at: 12 }));
    while (c.rows(COMMANDS).length < 3) await new Promise((r) => setTimeout(r, 2));
    await new Promise((r) => setTimeout(r, 5));
    time.now = started + elapsed;
    const shown = await lc.finishHelp(token);
    assert.equal(shown.display, true); assert.equal(shown.accepted === true, kept, `${elapsed} ms`);
    assert.equal(device.saved.has('bunki-journey:hold'), !kept); assert.equal(lc.inspect().phase === 'active', kept);
  }
});

/** hold the next commits until release() (W5 1441's blocked-commit reproduction) */
const blockCommits = (c) => { let release; c.state.gate = new Promise((resolve) => { release = () => { c.state.gate = null; resolve(); }; }); return release; };
const within = (promise, ms) => Promise.race([promise.then((value) => ({ value })), new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
async function activeDay(m, record) {
  const c = memoryController(record ? { record } : {}), app = await openApp(m, c), time = { now: Date.parse(ON) };
  const { lc, device } = lifecycleOn(m, app, { time });
  await lc.ready; time.now = corePort().endOfDay(new Date(time.now)) + 60_000; await lc.tick();
  return { c, app, time, lc, device };
}
test('L4', 'W5 1441: with the help commit blocked, the held display resolves at the deadline, before storage is released; the late commit stays inert', async (m) => {
  const { c, lc, device, time } = await activeDay(m);
  const base = time.now, wall = Date.now(), clock = setInterval(() => { time.now = base + (Date.now() - wall); }, 5);
  const release = blockCommits(c);
  try {
    const token = await lc.beginHelp(helpBatch('atlas:4', { what: 'reference', reveals: ['meaning'], at: 4 }));
    const shown = await within(lc.awaitHelp(token), 1500);
    assert.ok(shown, 'the display waited on the blocked commit');
    assert.deepEqual([shown.value.display, shown.value.held], [true, true]);
    assert.equal(device.saved.get('bunki-journey:hold').reason, 'help-write-hold'); assert.equal(lc.inspect().phase, 'help-write-hold');
    release();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await lc.finishHelp(token)).late, true); assert.notEqual(lc.inspect().phase, 'active');
    await assert.rejects(async () => lc.assertReviewable());
  } finally { clearInterval(clock); c.state.gate = null; }
});
test('L4b', 'the held display also beats another journey write already queued in front of it (the race in awaitHelp)', async (m) => {
  const { c, lc, device, time } = await activeDay(m);
  const base = time.now, wall = Date.now(), clock = setInterval(() => { time.now = base + (Date.now() - wall); }, 5);
  const release = blockCommits(c);
  try {
    const token = await lc.beginHelp(helpBatch('atlas:4b', { what: 'reference', reveals: ['form'], at: 41 }));
    const queued = lc.enter('lessons');
    const shown = await within(lc.awaitHelp(token), 1500);
    assert.ok(shown, 'the display waited behind the queued write');
    assert.deepEqual([shown.value.display, shown.value.held], [true, true]); assert.ok(device.saved.has('bunki-journey:hold'));
    release(); await Promise.resolve(queued).catch(() => {});
  } finally { clearInterval(clock); c.state.gate = null; }
});
test('L4c', 'finishHelp itself decides a held display without waiting on the queued root guard', async (m) => {
  const { c, lc, time } = await activeDay(m);
  const release = blockCommits(c);
  try {
    const token = await lc.beginHelp(helpBatch('atlas:4c', { what: 'reference', reveals: ['meaning'], at: 42 }));
    time.now += 300;
    const shown = await within(Promise.resolve(lc.finishHelp(token)), 1000);
    assert.ok(shown, 'finishHelp waited on the blocked write');
    assert.deepEqual([shown.value.display, shown.value.held], [true, true]);
    release(); await new Promise((r) => setTimeout(r, 20));
  } finally { c.state.gate = null; }
});
test('L5', 'F6 (lead 1443): after a late acknowledgement the same session reconciles at the next day\'s rollover and resumes, with no reload', async (m) => {
  const { c, lc, device, time } = await activeDay(m);
  const base = time.now, wall = Date.now(), clock = setInterval(() => { time.now = base + (Date.now() - wall); }, 5);
  c.state.delay = 450;
  let token;
  try {
    token = await lc.beginHelp(helpBatch('atlas:5', { what: 'reference', reveals: ['reading'], at: 5 }));
    assert.equal((await lc.awaitHelp(token)).held, true);
    await new Promise((r) => setTimeout(r, 600));
  } finally { clearInterval(clock); c.state.delay = 0; }
  const late = c.document(RECORD).m4Journey;
  assert.equal(late.daily.events.length, 1);
  await assert.rejects(async () => lc.assertReviewable());
  assert.equal((await lc.finishHelp(token)).late, true);
  time.now = corePort().endOfDay(new Date(time.now)) + 60_000;
  const next = await lc.tick();
  assert.equal(next.phase, 'active'); assert.equal(c.document(RECORD).m4Journey.dayEpoch, late.dayEpoch + 1);
  assert.equal(device.saved.has('bunki-journey:hold'), false);
  await lc.assertReviewable();
});
test('L6', 'a rotation still being written cannot clear a hold set meanwhile (the deadline hold survives its acknowledgement)', async (m) => {
  const { c, lc, time } = await activeDay(m);
  time.now = corePort().endOfDay(new Date(time.now)) + 60_000;
  const release = blockCommits(c);
  const rotating = lc.tick();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(lc.holdAtDeadline(null), { display: true, held: true, phase: 'help-write-hold' });
  release(); await rotating; await new Promise((r) => setTimeout(r, 20));
  assert.equal(lc.inspect().phase, 'help-write-hold');
  await assert.rejects(async () => lc.assertReviewable());
});
test('D1', 'rev 3.3 §7.6 (F4): a whole root of depth 22 commits; depth 23 refuses before the port, with nothing written', async (m) => {
  const { c, lc } = await activeDay(m);
  const nest = (n) => { let v = 'leaf'; for (let i = 0; i < n; i++) v = { d: v }; return v; };
  await lc.work('goals', { status: 'unfinished', note: nest(19) });
  const commits = c.state.commits, before = c.document(RECORD).m4Journey;
  await assert.rejects(async () => lc.work('projects', { status: 'unfinished', note: nest(20) }), /root-invalid/);
  assert.equal(c.state.commits, commits); assert.deepEqual(c.document(RECORD).m4Journey, before);
});

/** P1–P6 (rev 3.2 §7) run on copies of a synthetic learner record shaped like John's: every one of corridor's 36 known
 * roots but 'ai' (the record host never holds it), with representative content, and an unknown root. Never his store */
export const johnShaped = () => ({ v: 1,
  taken: Array.from({ length: 40 }, (_, i) => ({ t: i % 2 ? 'word' : 'kanji', id: `id-${i}`, started: 1700000000000 + i })),
  lists: { 'n3-core': ['id-1', 'id-2'] }, srs: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`kanji:id-${i}`,
    { due: '2026-10-20T00:00:00.000Z', stability: 3.1 + i, difficulty: 5.2, elapsed_days: 1, scheduled_days: 3, reps: 4, lapses: 0, state: 2, last_review: '2026-10-17T00:00:00.000Z' }])),
  revlog: Array.from({ length: 120 }, (_, i) => ({ k: `kanji:id-${i % 40}`, r: 1 + (i % 4), t: 1700000000000 + i * 60000 })),
  obslog: Array.from({ length: 60 }, (_, i) => [1700000000000 + i, 'tap', `word:w${i}`, 1 + (i % 3), 'article-1']),
  deepWords: { 職業: { seen: 3 } }, lessonsDone: { 'shiki-shoku': 1 }, mockDone: {}, mockRun: null, assessmentLibrary: null,
  assessmentLibraryV2: null, assessmentLearning: null, assessmentReceived: null, assessmentQuestionPractice: null,
  aiReading: null, aiReadings: [], readingSettings: { size: 2 }, feedLibrary: { feeds: [] }, publisherLibrary: { items: [] },
  sourceInbox: { items: [] }, sentencePractice: { done: [] }, sentenceDrafts: [], suspended: { 'kanji:id-3': true },
  aiChat: [], teacherContexts: [], teacherDrafts: [], aiQuiz: null, stats: { '2026-10-20': { n: 12, again: 2, nnew: 3 } },
  srsPrefs: { newPerDay: 20, reviewsPerDay: 200 }, readDone: { 'p-1': 1 }, readerPos: { 'p-1': 120 }, dials: { kanji: 1, furigana: 1, spacing: 0 },
  met: { 職: 1 }, readHelp: { gloss: 2 }, futureRoot: { nested: { keep: 'unknown-json' } } });
const byRoot = (m, record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, m.core.encodeLocalJson(value).text]));
async function restoreInto(app, backup) {
  const current = await app.snapshot(); assert.equal(current.status, 'active');
  return app.restore(backup, { expectedRevision: current.snapshot.revision });
}
/** a full ON day on the real app: bootstrap, the next day's rotation, help, an attempt prepared, dispatched, admitted, settled */
async function fullDay(m, app, time, rule) {
  const { lc, device } = lifecycleOn(m, app, { time });
  await lc.ready; time.now = corePort().endOfDay(new Date(time.now)) + 60_000; await lc.tick();
  const shown = await lc.awaitHelp(await lc.beginHelp(helpBatch('atlas:9', { what: 'reference', about: { kind: 'kanji', literal: '職' }, reveals: ['meaning'], at: 9 },
    Object.freeze({ eventId: 'atlas:9', sessionId: 'earlier' }))));
  assert.equal(shown.accepted, true);
  const snap = await lc.beforeAnswer(lc.namespace() + 'course-attempt');
  const prepared = await lc.prepare(snap, { kind: 'attempt', item: { kind: 'kanji', literal: '職' }, surface: 'course:kanji-shiki-shoku-r1', tests: 'meaning',
    answer: { selfCheck: 'knew' }, revealed: false, answeredAt: time.now, help: [] }, rule);
  const dispatch = await lc.reserve(prepared);
  assert.equal(lc.admitAtLock(dispatch), true); await lc.settle(dispatch, { write: true, rating: 1 });
  return { lc, device };
}
const passRule = { policy: 'test-policy', labelCandidate: (source) => ({ ...source, helpRelevance: { policy: 'test-policy' } }), assertPreserved: () => true };

test('P1', 'a full ON day changes only m4Journey: every other root and the envelope v stay byte-identical (36-root synthetic copy)', async (m) => {
  const c = memoryController({ record: johnShaped() }), app = await openApp(m, c), before = byRoot(m, c.document(RECORD)), time = { now: Date.parse(ON) };
  await fullDay(m, app, time, passRule);
  const after = byRoot(m, c.document(RECORD));
  assert.deepEqual(Object.keys(after).filter((k) => k !== 'm4Journey').sort(), Object.keys(before).sort());
  for (const key of Object.keys(before)) assert.equal(after[key], before[key], key);
  assert.ok(after.m4Journey); assert.equal(Object.keys(before).length, 36);
});
test('P2', 'export and restore: the root returns byte-identical, is validated, then retired under the new generation, never merged', async (m) => {
  const a = memoryController({ record: johnShaped() }), appA = await openApp(m, a), time = { now: Date.parse(ON) };
  await fullDay(m, appA, time, passRule);
  const exported = await appA.exportBackup(); assert.equal(exported.status, 'active');
  const root = a.document(RECORD).m4Journey;
  assert.equal(m.core.encodeLocalJson(exported.backup.record.m4Journey).text, m.core.encodeLocalJson(root).text);
  const b = memoryController({ record: johnShaped(), migrationId: 'other-installation' }), appB = await openApp(m, b);
  const restored = await restoreInto(appB, exported.backup); assert.equal(restored.status, 'active');
  assert.equal(m.core.encodeLocalJson(b.document(RECORD).m4Journey).text, m.core.encodeLocalJson(root).text);
  const { lc } = lifecycleOn(m, appB, { time });
  const booted = await lc.ready;
  assert.equal(booted.phase, 'cold-activation');
  const fresh = b.document(RECORD).m4Journey;
  assert.notEqual(fresh.id, root.id); assert.deepEqual(fresh.retired, { id: root.id, generation: root.generation, hash: m.lifecycle.digest(root),
    restore: b.rows(COMMANDS).find((row) => row.type === 'host.restore/1').changeId });
  assert.deepEqual(fresh.daily.events, []); assert.deepEqual(b.rows(COMMANDS).filter((row) => row.type === 'journey.lifecycle/1').map((row) => row.journey.action), ['retire-generation']);
});
test('P3', 'the release build (a8b9cbff host) keeps a root through writes and export; this head OFF opens a journaled record', async (m) => {
  const old = await load({ ...SOURCES, host: RELEASE.host, app: RELEASE.app });
  const withRoot = { ...johnShaped(), m4Journey: { version: 1, protocol: 'journey-r2', id: 'journey-x', marker: 'keep' } };
  const c = memoryController({ record: withRoot }), app = await openApp(old, c);
  assert.equal((await app.write((record) => ({ patch: { srs: { ...record.srs, 'kanji:new': { due: 'x', state: 0 } } } }))).status, 'active');
  const same = (a, b) => assert.equal(m.core.encodeLocalJson(a).text, m.core.encodeLocalJson(b).text);
  same(c.document(RECORD).m4Journey, withRoot.m4Journey);
  same((await app.exportBackup()).backup.record.m4Journey, withRoot.m4Journey);
  const journaled = memoryController({ record: johnShaped() }), onApp = await openApp(m, journaled);
  await fullDay(m, onApp, { now: Date.parse(ON) }, passRule);
  const rows = journaled.rows(COMMANDS).map((row) => ({ collection: COMMANDS, id: row.changeId, value: row }));
  const reopen = (modules) => openApp(modules, memoryController({ record: journaled.document(RECORD), rows, revision: journaled.revision }));
  assert.equal((await reopen(m)).current().status, 'active');
  RELEASE.rollback = (await reopen(old)).current();
});
test('P4', 'a globally valid backup with an invalid journey root restores the rest and holds reviews (ON), keeping the root byte for byte', async (m) => {
  const a = memoryController({ record: { ...johnShaped(), m4Journey: { version: 7, protocol: 'journey-r9', future: [1, 2, 3] } } }), appA = await openApp(m, a);
  const exported = await appA.exportBackup(); assert.equal(exported.status, 'active');
  const b = memoryController({ record: baseRecord() }), appB = await openApp(m, b);
  assert.equal((await restoreInto(appB, exported.backup)).status, 'active');
  assert.equal(b.document(RECORD).srsPrefs.newPerDay, 20);
  const { lc } = lifecycleOn(m, appB, { time: { now: Date.parse(ON) } });
  assert.equal((await lc.ready).phase, 'invalid-root-hold');
  assert.deepEqual(b.document(RECORD).m4Journey, { version: 7, protocol: 'journey-r9', future: [1, 2, 3] });
  await assert.rejects(async () => lc.assertReviewable());
});
test('P5', 'restoring an older backup over a newer record retires the restored root and never merges either journey', async (m) => {
  const time = { now: Date.parse(ON) };
  const a = memoryController({ record: johnShaped() }), appA = await openApp(m, a);
  await fullDay(m, appA, time, passRule);
  const older = (await appA.exportBackup()).backup, olderRoot = a.document(RECORD).m4Journey;
  const b = memoryController({ record: johnShaped(), migrationId: 'newer' }), appB = await openApp(m, b), later = { now: time.now + 3 * 86400000 };
  await fullDay(m, appB, later, passRule);
  const newerRoot = b.document(RECORD).m4Journey;
  assert.equal((await restoreInto(appB, older)).status, 'active');
  const { lc } = lifecycleOn(m, appB, { time: later });
  assert.equal((await lc.ready).phase, 'cold-activation');
  const fresh = b.document(RECORD).m4Journey;
  assert.equal(fresh.retired.id, olderRoot.id); assert.notEqual(fresh.id, newerRoot.id); assert.notEqual(fresh.id, olderRoot.id);
  assert.deepEqual(fresh.daily.events, []); assert.equal(fresh.progress.participated, 0);
});
test('P6', 'a full root (128 events, 96 attempts, 32 visits, 8 goals, 16 projects, near 252 KiB) survives export and restore; counts and limits', async (m) => {
  const c = memoryController({ record: johnShaped() }), app = await openApp(m, c), time = { now: Date.parse(ON) };
  const { lc } = lifecycleOn(m, app, { time });
  await lc.ready; time.now = corePort().endOfDay(new Date(time.now)) + 60_000; await lc.tick();
  const filler = 'あ'.repeat(3000);
  for (let n = 0; n < 8; n++) await lc.work('goals', { status: 'unfinished', note: filler });
  for (let n = 0; n < 16; n++) await lc.work('projects', { status: 'unfinished', note: filler });
  for (let n = 0; n < 31; n++) await lc.enter('lessons');
  for (let n = 0; n < 128; n += 8) {
    const batch = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze({ receiptKey: `e:${n + i}`, raw: Object.freeze({ what: 'reference', reveals: Object.freeze(['meaning']), at: n + i }),
      origin: Object.freeze({ eventId: `e:${n + i}`, sessionId: 's' }) })));
    assert.equal((await lc.awaitHelp(await lc.beginHelp(batch))).accepted, true);
  }
  for (let n = 0; n < 96; n++) await lc.beforeAnswer(lc.namespace() + `a${n}`);
  const root = c.document(RECORD).m4Journey, bytes = new TextEncoder().encode(JSON.stringify(root)).byteLength;
  assert.equal(root.daily.events.length, 128); assert.equal(root.daily.attempts.length, 96); assert.equal(root.daily.visits, 31);
  assert.ok(bytes <= m.lifecycle.LIMITS.dataBytes, String(bytes));
  await assert.rejects(async () => lc.work('goals', { status: 'unfinished' }), /work-bound/);
  await assert.rejects(async () => lc.beforeAnswer(lc.namespace() + 'a96'), /attempt-bound/);
  const exported = await app.exportBackup(); assert.equal(exported.status, 'active');
  const text = JSON.stringify(exported.backup);
  assert.ok(new TextEncoder().encode(text).byteLength < 32 * 1024 * 1024);
  const other = memoryController({ record: baseRecord(), migrationId: 'other' }), appB = await openApp(m, other);
  assert.equal((await restoreInto(appB, exported.backup)).status, 'active');
  assert.equal(m.core.encodeLocalJson(other.document(RECORD).m4Journey).text, m.core.encodeLocalJson(root).text);
  assert.equal(Object.hasOwn(exported.backup.counts, 'journey'), false);
  RELEASE.p6 = { rootBytes: bytes, backupBytes: new TextEncoder().encode(text).byteLength, journeyReceipts: c.rows(COMMANDS).filter((r) => r.type === 'journey.lifecycle/1').length,
    receiptBytesEach: Math.round(c.rows(COMMANDS).filter((r) => r.type === 'journey.lifecycle/1').reduce((sum, r) => sum + JSON.stringify(r).length, 0) / c.rows(COMMANDS).filter((r) => r.type === 'journey.lifecycle/1').length) };
});
/** the release build (a8b9cbff, the same host and app bytes as 87dededd) for P3, and the measured findings */
const RELEASE = {};
for (const name of ['host', 'app']) RELEASE[name] = (await import('node:child_process')).execFileSync('git',
  ['show', `a8b9cbff1157766ff56f722612e75a5515a58f38:prototypes/corridor/record-${name}.mjs`], { cwd: DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
export const FINDINGS = RELEASE;

/** one targeted mutant per host guard; each must turn its own case red (an assertion, not a crash) */
export const MUTANTS = {
  'cas-ignored': ['H2', 'host', [["insist(expected.rootSha256 === digest(own(state.record, 'm4Journey') ? state.record.m4Journey : null), 'journey-root-moved');", '']]],
  'generation-ignored': ['H3', 'host', [["insist(expected.generation === generation && root.generation === generation, 'journey-generation-changed');", '']]],
  'gate-ignored': ['H4', 'host', [["insist(gate() === true, 'journey-gate-closed');", '']]],
  'revision-precondition': ['H5', 'host', [["insist(gate() === true, 'journey-gate-closed');",
    "insist(gate() === true, 'journey-gate-closed'); insist(state.snapshot.revision === 1 + [...state.receipts.values()].filter((row) => row.type === JOURNEY_LIFECYCLE).length, 'stale-patch');"]]],
  'patch-not-reserved': ['H6', 'app', [["insist(!own(input.patch, 'm4Journey'), 'journey-root-reserved');", '']]],
  'receipt-unchecked': ['H7', 'host', [["insist(own(value, 'journey'), 'unsupported-command-receipt'); journeyEvidence(value.journey);", '']]],
  'projection-drops-creation': ['H1', 'host', [["(row.type === JOURNEY_LIFECYCLE && JOURNEY_CREATION.has(row.journey.action))", 'false']]],
  'ack-deadline-ignored': ['L3', 'lifecycle', [['if(t.preflight||clock()-t.started>=300||', 'if(t.preflight||']]],
  'display-waits-on-queue': ['L4b', 'lifecycle', [['   if(result===deadline)return holdAtDeadline(token);', '   if(result===deadline)return await step;']]],
  'held-display-awaits-guard': ['L4c', 'lifecycle', [["{t.shown=true;holdForDisplay('help-write-hold');return {display:true,held:true,phase};}", "{yield* hold('help-write-hold');t.shown=true;return {display:true,held:true,phase};}"]]],
  'no-reconcile': ['L5', 'lifecycle', [['  reconcile();\n', '']]],
  'rotation-clears-hold': ['L6', 'lifecycle', [["if(holdEpoch===holds){phase='active';holdUntil=-Infinity;}", "phase='active';holdUntil=-Infinity;"]]],
  'depth-24': ['D1', 'lifecycle', [[' if(depth>22)return false;', ' if(depth>24)return false;']]],
};

async function main() {
  floor();
  const only = arg('case'), results = [], modules = await load();
  for (const t of CASES) {
    if (only && t.id !== only) continue;
    floor();
    try { await t.fn(modules); results.push({ id: t.id, passed: true }); }
    catch (error) { results.push({ id: t.id, passed: false, error: error.message }); }
  }
  const controls = [];
  if (process.argv.includes('--mutants')) {
    for (const [name, [target, unit, pairs]] of Object.entries(MUTANTS)) {
      floor();
      let text = SOURCES[unit];
      for (const [from, to] of pairs) { assert.equal(text.split(from).length, 2, 'mutant anchor not unique: ' + name); text = text.replace(from, to); }
      const mutated = await load({ ...SOURCES, [unit]: text });
      try { await CASES.find((entry) => entry.id === target).fn(mutated); controls.push({ name, target, killed: false }); }
      catch (error) { controls.push({ name, target, killed: error instanceof assert.AssertionError, witness: error.message.split('\n')[0] }); }
    }
  }
  const failed = results.filter((r) => !r.passed), survived = controls.filter((c) => !c.killed);
  console.log(JSON.stringify({ cases: `${results.length - failed.length}/${results.length}`, failed,
    findings: { releaseHostOpensJournaledRecord: RELEASE.rollback ? { status: RELEASE.rollback.status, reason: RELEASE.rollback.reason } : null, p6: RELEASE.p6 ?? null },
    controls: controls.length ? `${controls.length - survived.length}/${controls.length}` : 'not run', survived, controlDetails: controls }, null, 1));
  process.exitCode = failed.length || survived.length ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
