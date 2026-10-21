/** HOOKS r8 rev 3.2 §7 in the corridor: corridor.js's journey seams (JOURNEY_NAMES) and the r8 course adapter
 * (CORRIDOR_NAMES), lifted into the r8 vm sandbox with the actual kanji-course.js, over the REAL record app, record host
 * and journey-lifecycle.mjs (tools/verify-journey-record.mjs's loader; --modules=<dir> holds a built record-core). Each
 * switch position is the authored source with its one constant: OFF as written, ON with JOURNEY_WRITES = true (test-only).
 * Test-only realm adapters: the sandbox makes its objects in its own realm, so a batch the corridor's producer admitted, and
 * a grade's patch, are re-created in the module's and host's realm before their plain-data checks (in the browser there
 * is one realm).
 * stdout only; no files are written.
 *   node tools/verify-journey-corridor.mjs --modules=<dir> [--case=<id>] [--vectors] [--mutants]
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statfsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as layer from './srs-hooks-corridor-layer.mjs';
import { load, memoryController, openApp, RECORD, COMMANDS } from './verify-journey-record.mjs';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const floor = () => { const s = statfsSync(DIR); assert.ok(s.bavail * s.bsize >= 1.5 * 1024 ** 3, 'DISK STOP: below 1.5 GiB'); };
const read = (path) => readFileSync(join(DIR, path), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
process.env.TZ = 'Asia/Tokyo';

const core = await import(pathToFileURL(join(DIR, 'srs-core.mjs')));
const fsrsApi = await import(pathToFileURL(join(DIR, 'vendor/ts-fsrs.mjs')));
const pin = JSON.parse(read('data/fsrs-pin.json'));
const relevance = await import(pathToFileURL(join(DIR, 'help-relevance.mjs')));
const caller = await import(pathToFileURL(join(DIR, 'review-caller.mjs')));
const catalog = JSON.parse(read('data/help-relevance-catalog.json'));
const COURSE = read('kanji-course.js');
export const SOURCE = read('corridor.js');
const SWITCH = 'const JOURNEY_WRITES = false;';
assert.equal(SOURCE.split(SWITCH).length, 2, 'the one switch');
const NAMES = [...layer.CORRIDOR_NAMES, ...layer.JOURNEY_NAMES];
export const programs = (source = SOURCE) => ({ off: layer.liftCorridor(source, NAMES), on: layer.liftCorridor(source.replace(SWITCH, 'const JOURNEY_WRITES = true;'), NAMES) });
const BASE = 'a8b9cbff1157766ff56f722612e75a5515a58f38';
const baseProgram = () => layer.liftCorridor(execFileSync('git', ['show', `${BASE}:prototypes/corridor/corridor.js`], { cwd: DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

class JourneyStorage {
  constructor() { this.m = new Map(); this.refuse = false; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.refuse) throw new Error('storage refused'); this.m.set(k, String(v)); }
  removeItem(k) { if (this.refuse) throw new Error('storage refused'); this.m.delete(k); }
  journey() { return Object.fromEntries([...this.m].filter(([k]) => k.startsWith('bunki-journey:'))); }
}

const HELPERS = `
var __calls = [];
function tx(ja, en) { return en; }
const __report = reportHookAttempt;
window.__KAIRO_HOOKS__ = Object.freeze({ report: (evidence, binding) => {
  __calls.push(JSON.parse(JSON.stringify({ evidence, binding: binding && { ...binding, journey: binding.journey ? 'dispatch' : null } })));
  return __report(evidence, binding);
} });
const __on = () => typeof JOURNEY_WRITES !== 'undefined' && JOURNEY_WRITES;
function __visit(sessionId) {
  const v = { unitId: 'shiki-shoku', stage: 'check', index: 0, epoch: recordEpoch, run: null, draft: '', feedback: null, saved: false, pending: false };
  v.run = BunkiKanjiCourse.createRun('shiki-shoku', { sessionId });
  S.kanjiCourse = v; S.view = 'lessons';
  kanjiCourseApplyHelp(v);
  return v;
}
async function __capture(v, rowsText, attemptId) { await kanjiCourseRememberHelp(v, JSON.parse(rowsText), attemptId || null); kanjiCourseApplyHelp(v); }
async function __act(v, action, wrong) {
  const prompt = BunkiKanjiCourse.currentPrompt(v.run);
  const value = action !== 'answer' ? undefined : wrong ? (prompt.choices.length ? prompt.choices.find((c) => !prompt.acceptedAnswers.includes(c.id)).id : 'まちがい') : prompt.acceptedAnswers[0];
  const result = __on() ? await kanjiJourneyAct(v, action, value) : kanjiCourseAct(v, action, value);
  v.feedback = { prompt, result };
  return result.attemptId;
}
function __next(v) { v.feedback = null; kanjiCourseApplyHelp(v); }
async function __reportAttempt(v, attemptId, check) { await reportKanjiCourseAttempt(v, attemptId, check || 'knew'); return v.hookOutcomes[attemptId]; }
async function __prepare(v, attemptId, check) {
  v.run = BunkiKanjiCourse.selfCheck(v.run, attemptId, check || 'knew', Date.now());
  return __on() ? kanjiJourneyPrepare(v, attemptId, BunkiKanjiCourse.hookCandidate(v.run, attemptId))
    : kanjiCoursePrepareReview(v, attemptId, BunkiKanjiCourse.hookCandidate(v.run, attemptId));
}
function __observe(attemptId, detailsText, bindingText) {
  return kanjiReviewCaller.observe({ type: 'PREPARE_REVIEW', attemptId }, { status: 'prepared', details: JSON.parse(detailsText), state: KANJI_REVIEW_STATE },
    JSON.parse(bindingText));
}
/** the test as one registered producer of the journey, with the vector's own origins (W5's r2.1 import path; no preload) */
function __import(rowsText, originsText) {
  const journey = kanjiJourney, rows = JSON.parse(rowsText), origins = JSON.parse(originsText);
  return kanjiJourneyRun(journey, async () => {
    const batch = kanjiDeepFreeze(rows.map((raw, n) => ({ receiptKey: origins[n]?.eventId ?? 'legacy:' + n, raw, origin: origins[n] ?? null })));
    journey.batches.add(batch);
    return journey.lifecycle.awaitHelp(await journey.lifecycle.beginHelp(batch));
  });
}
`;

const entries = [['職', '職業', 'しょくぎょう'], ['識', '知識', 'ちしき'], ['織', '組織', 'そしき'], ['水', '水道', 'すいどう']];
const dict = Object.fromEntries(entries.map(([, word, reading]) => [word, { r: reading, m: ['retained word meaning'] }]));
const scheduler = core.createScheduler(fsrsApi, pin);
const base = new Date('2026-10-10T09:00:00+09:00');
let dueCard = fsrsApi.createEmptyCard(base);
for (const offset of [0, 600000]) dueCard = scheduler.next(dueCard, new Date(+base + offset), 3).card;
export const DUE = +new Date(dueCard.due) + 3600000;
export const DAY = 24 * 3600000;
/** a learner record for the host: due 職/識/織/水 cards and words, and an unknown root */
export const learner = () => ({ v: 1,
  taken: entries.flatMap(([literal, term]) => [{ t: 'kanji', id: literal, started: 1 }, { t: 'word', id: term, started: 1 }]),
  srs: Object.fromEntries(entries.flatMap(([literal, term]) => [[`kanji:${literal}`, copy(dueCard)], [`word:${term}`, copy(dueCard)]])),
  revlog: [], obslog: [], lessonsDone: {}, stats: {}, suspended: {}, deepWords: {}, futureRoot: { keep: 'unknown-json' } });

let modules = null;
/** the journey module as corridor imports it, behind the test-only realm adapter */
const journeyModule = () => ({ ...modules.lifecycle, createLifecycle: (options) => modules.lifecycle.createLifecycle({ ...options,
  device: { ...options.device, read: (key) => structuredClone(options.device.read(key)) },
  validateCapture: (entries) => deepFreeze(structuredClone(options.validateCapture(entries))) }) });

/** one page (one load of the app): the lifted corridor, the actual course, the real record app; adoption as at boot */
export async function page(program, { controller, storage, time, served = { git_sha: 'a'.repeat(40), artifact_sha256: 'b'.repeat(64) },
  journey = true } = {}) {
  const h = layer.corridorSandbox(program, { core, fsrsApi, pin, record: {}, dict, clock: () => new Date(time.now), storage });
  const ctx = h.sandbox;
  delete ctx.Object; delete ctx.JSON; delete ctx.Array;
  vm.runInContext(`${COURSE}\nwindow.BunkiKanjiCourse = BunkiKanjiCourse;\n${HELPERS}`, ctx);
  const app = await openApp(modules, controller);
  // test-only realm adapter: a producer's patch, made in the sandbox's realm, reaches the host as plain data of its own
  ctx.recordApp = { write: (producer) => app.write((record, snapshot) => structuredClone(producer(record, snapshot))),
    journeyAuthority: () => app.journeyAuthority(), commitJourney: (input, gate) => app.commitJourney(input, gate),
    current: () => app.current(), snapshot: () => app.snapshot() };
  ctx.maintenanceServedBuild = async () => served;
  ctx.adoptHelpRelevance({ createRelevance: relevance.createRelevance, createCaller: caller.createCaller, catalog });
  if (journey) {
    ctx.__journeyModule = journeyModule();
    vm.runInContext('kanjiJourneyModule = Promise.resolve(__journeyModule);', ctx);
    // as at boot (void adoptJourney): a failed adoption leaves no journey, never a crashed page
    await ctx.adoptJourney(ctx.recordEpoch, ctx.recordApp).catch(() => {});
  }
  const run = (code) => vm.runInContext(code, ctx);
  const serial = { n: 0 };
  return {
    h, ctx, app, run, controller, storage,
    record: () => controller.document(RECORD),
    journeyRows: () => controller.rows(COMMANDS).filter((row) => row.type === 'journey.lifecycle/1').map((row) => row.journey.action),
    lifecycle: () => run('kanjiJourney?.lifecycle?.inspect() ?? null'),
    calls: () => run('__calls.length'),
    lastCall: () => copy(run('__calls.at(-1)')),
    visit: () => ctx.__visit(`run${++serial.n}`),
    capture: (visit, rows, attemptId) => ctx.__capture(visit, JSON.stringify(rows), attemptId),
    act: async (visit, action = 'answer', wrong = false) => { time.now += 1000; return ctx.__act(visit, action, wrong); },
    next: (visit) => ctx.__next(visit),
    report: async (visit, id, check = 'knew') => { time.now += 10; return copy(await ctx.__reportAttempt(visit, id, check)); },
    prepare: async (visit, id, check) => { time.now += 10; return copy(await ctx.__prepare(visit, id, check)); },
    observe: (id, details, binding) => ctx.__observe(id, JSON.stringify(details), JSON.stringify(binding)),
    import: (rows, origins) => ctx.__import(JSON.stringify(rows), JSON.stringify(origins)),
    line: (outcome) => ctx.kanjiCourseHookLine(outcome),
  };
}
/** a learner's store across loads: one controller (the record) and one device storage */
export const store = (record = learner()) => ({ controller: memoryController({ record }), storage: new JourneyStorage() });
const row = (what, about, reveals, at) => ({ what, ...(about ? { about } : {}), reveals, at });
const kanji = (literal) => ({ kind: 'kanji', literal });
const graded = (o) => assert.equal(o?.write, true, JSON.stringify(o));
const today = (t) => new Date(t).toLocaleDateString('sv-SE');
const others = (record) => modules.core.encodeLocalJson(Object.fromEntries(Object.entries(record).filter(([k]) => !['m4Journey', 'srs', 'revlog', 'stats'].includes(k)))).text;

export const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

/** day 1 creates the journey (a held first day); the returned clock is the next day, the course's card due */
async function journeyOnNextDay(P, s, extra = {}) {
  const time = { now: DUE - DAY };
  const first = await page(P.on, { ...s, time, ...extra });
  assert.equal(first.lifecycle().phase, 'cold-activation');
  time.now = DUE;
  return { time, first };
}

test('S1', 'OFF, no root: grading is a8b9cbff\'s page ledger exactly; the only journey trace is the date marker', async (P) => {
  const script = async (p) => {
    const v = p.visit();
    await p.capture(v, [row('dictionary-entry', kanji('水'), ['meaning', 'form'], 10)]);
    const id = await p.act(v); const first = await p.report(v, id);
    const w = p.visit();
    await p.capture(w, [row('dictionary-entry', kanji('職'), ['meaning', 'form'], 20)]);
    const id2 = await p.act(w); const second = await p.report(w, id2);
    return { outcomes: [first, second], record: modules.core.encodeLocalJson(p.record()).text };
  };
  const a = store(), b = store(), time = { now: DUE }, time2 = { now: DUE };
  const baseline = await script(await page(P.base, { ...a, time, journey: false }));
  const off = await page(P.off, { ...b, time: time2 });
  const offRun = await script(off);
  assert.deepEqual(offRun.outcomes, baseline.outcomes); assert.equal(offRun.record, baseline.record);
  assert.deepEqual(baseline.outcomes.map((o) => o.rating ?? o.reason), [3, 'answered-today']);
  assert.deepEqual(b.storage.journey(), { 'bunki-journey:off-day': today(DUE) }); assert.deepEqual(a.storage.journey(), {});
  assert.equal(off.record().m4Journey, undefined); assert.deepEqual(off.journeyRows(), []);
  assert.equal(off.lifecycle().phase, 'off-page-ledger');
});
test('S2', 'OFF keeps a valid root and a malformed root byte for byte; a malformed one is a diagnostic, never a hold', async (P) => {
  const valid = store(), time = { now: DUE - DAY };
  await page(P.on, { ...valid, time });
  const root = valid.controller.document(RECORD).m4Journey;
  time.now = DUE;
  for (const [s, expectRoot, note] of [[valid, root, []], [store({ ...learner(), m4Journey: { version: 9, future: true } }), { version: 9, future: true }, ['invalid-journey-root']]]) {
    const p = await page(P.off, { ...s, time });
    assert.deepEqual(p.lifecycle().diagnostics, note);
    const v = p.visit(); const id = await p.act(v); graded(await p.report(v, id));
    assert.deepEqual(p.record().m4Journey, expectRoot);
  }
});
test('S3', 'OFF then OFF the same day writes nothing more; an open page crossing midnight refreshes the marker at its next capture', async (P) => {
  const s = store(), time = { now: DUE };
  const p = await page(P.off, { ...s, time });
  const marker = s.storage.journey();
  await page(P.off, { ...s, time });
  assert.deepEqual(s.storage.journey(), marker);
  time.now = DUE + DAY;
  const v = p.visit(); await p.capture(v, [row('dictionary-entry', kanji('水'), ['meaning'], 30)]);
  assert.deepEqual(s.storage.journey(), { 'bunki-journey:off-day': today(DUE + DAY) });
});
test('S4', 'ON fresh: the first day is held (a creation receipt and root); a course review refuses with the plain line, nothing graded', async (P) => {
  const s = store(), time = { now: DUE };
  const p = await page(P.on, { ...s, time });
  assert.equal(p.lifecycle().phase, 'cold-activation'); assert.deepEqual(p.journeyRows(), ['bootstrap']);
  const before = p.record().srs;
  const v = p.visit(); const id = await p.act(v); const o = await p.report(v, id);
  assert.deepEqual([o.write, o.reason], [false, 'not-recorded']); assert.equal(p.calls(), 0); assert.deepEqual(p.record().srs, before);
  assert.equal(others(p.record()), others(learner()));
});
test('S5', 'ON the next day: a clean start rotates; help is kept before it shows; the review grades through the fence and settles', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const p = await page(P.on, { ...s, time });
  assert.equal(p.lifecycle().phase, 'active'); assert.deepEqual(p.journeyRows(), ['bootstrap', 'rotate']);
  const v = p.visit();
  await assert.doesNotReject(p.capture(v, [row('dictionary-entry', kanji('職'), ['meaning', 'form'], 40)]));
  assert.equal(p.record().m4Journey.daily.events.length, 1); assert.equal(v.referenceHelp.length, 1);
  const id = await p.act(v); const o = await p.report(v, id);
  graded(o); assert.equal(o.rating, 1);
  const root = p.record().m4Journey;
  assert.equal(root.daily.events.length >= 2, true); assert.deepEqual(root.daily.attempts.map((a) => a.status), ['settled']);
  assert.deepEqual(p.journeyRows().slice(0, 2), ['bootstrap', 'rotate']);
  assert.ok(['visit', 'help', 'snapshot', 'prepare', 'dispatch', 'settlement'].every((a) => p.journeyRows().includes(a)));
  assert.equal(p.lastCall().binding.journey, 'dispatch');
  assert.equal(others(p.record()), others(learner()));
});
test('S6', 'ON then ON (a reload, same build and day): a clean cold start resumes at once with no write, and grades', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  await page(P.on, { ...s, time });
  const commits = s.controller.state.commits;
  const p = await page(P.on, { ...s, time });
  assert.equal(p.lifecycle().phase, 'active'); assert.equal(s.controller.state.commits, commits);
  const v = p.visit(); const id = await p.act(v); graded(await p.report(v, id));
});
test('S7', 'OFF earlier today, then ON: today\'s W-off holds the day', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  await page(P.off, { ...s, time });
  const p = await page(P.on, { ...s, time });
  assert.equal(p.lifecycle().phase, 'off-day');
  const v = p.visit(); const id = await p.act(v); const o = await p.report(v, id);
  assert.deepEqual([o.write, o.reason], [false, 'not-recorded']); assert.equal(p.calls(), 0);
});
test('S8', 'ON then OFF: the root is kept byte for byte; OFF writes only W-off; old ON work is inert', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const on = await page(P.on, { ...s, time });
  const root = on.record().m4Journey;
  const off = await page(P.off, { ...s, time });
  off.ctx.recordEpoch = 2; on.ctx.recordEpoch = 2;
  const v = off.visit(); const id = await off.act(v); graded(await off.report(v, id));
  assert.deepEqual(off.record().m4Journey, root); assert.deepEqual(Object.keys(s.storage.journey()), ['bunki-journey:off-day']);
});
test('S9', 'the lock fence (S1): a W-hold for today arriving after the reservation refuses at the lock, read-only', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const p = await page(P.on, { ...s, time });
  const v = p.visit(); const id = await p.act(v);
  const prepared = await p.prepare(v, id);
  assert.ok(prepared.details, prepared.reason);
  const rootBefore = p.record().m4Journey, srsBefore = p.record().srs;
  s.storage.setItem('bunki-journey:hold', JSON.stringify({ day: today(time.now), journeyId: rootBefore.id, reason: 'help-write-hold' }));
  const o = await p.observe(prepared.details.attemptId, prepared.details, prepared.binding);
  assert.deepEqual([o.write, o.reason], [false, 'not-recorded']); assert.equal(p.calls(), 1);
  assert.deepEqual(p.record().m4Journey, rootBefore); assert.deepEqual(p.record().srs, srsBefore);
});
test('S10', 'the lock fence: an owner change after the reservation refuses as publish-failed', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const p = await page(P.on, { ...s, time });
  const v = p.visit(); const id = await p.act(v);
  const prepared = await p.prepare(v, id);
  // the caller and custody already refuse an owner change before the hook; the fence's own check is defense in depth
  assert.equal(p.run(`kanjiJourneyFence({ journey: kanjiJourney.dispatches.get(${JSON.stringify(prepared.details.attemptId)}) }, 2)`), 'publish-failed');
  p.ctx.recordEpoch = 2;
  const o = await p.observe(prepared.details.attemptId, prepared.details, prepared.binding);
  assert.deepEqual([o.write, o.reason], [false, 'owner-changed']); assert.equal(p.calls(), 0);
});
test('S11', 'another build last wrote the root: the day is held and the hold stamps this build; the next day resumes (W2 1336)', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const other = { git_sha: 'c'.repeat(40), artifact_sha256: 'd'.repeat(64) };
  const p = await page(P.on, { ...s, time, served: other });
  assert.equal(p.lifecycle().phase, 'build-changed'); assert.equal(p.record().m4Journey.lastWriterBuild, `${'c'.repeat(40)}/${'d'.repeat(64)}`);
  const v = p.visit(); const id = await p.act(v); assert.deepEqual((await p.report(v, id)).reason, 'not-recorded');
  time.now += DAY;
  assert.equal((await page(P.on, { ...s, time, served: other })).lifecycle().phase, 'active');
});
test('S12', 'no build identity: ON cannot start; a course review refuses with the plain line', async (P) => {
  const s = store(), time = { now: DUE };
  const p = await page(P.on, { ...s, time, served: null });
  assert.equal(p.run('kanjiJourney?.unavailable ?? null'), 'build-unidentified');
  const v = p.visit(); const id = await p.act(v); const o = await p.report(v, id);
  assert.deepEqual([o.write, o.reason], [false, 'not-recorded']); assert.equal(p.record().m4Journey, undefined);
});
test('S13', 'a full review day (96 attempts) refuses with the until-tomorrow line; it lifts at the next day', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const p = await page(P.on, { ...s, time });
  let v = p.visit();
  for (let n = 0; n < 96; n++) { if (v.run.complete) v = p.visit(); await p.act(v, 'skip'); p.next(v); }
  assert.equal(p.record().m4Journey.daily.attempts.length, 96);
  if (v.run.complete) v = p.visit();
  const id = await p.act(v); const o = await p.report(v, id);
  assert.deepEqual([o.write, o.reason], [false, 'journey-day-full']);
  assert.match(p.line(o), /tomorrow/);
  assert.doesNotMatch(p.line({ write: false, reason: 'not-recorded' }), /tomorrow/);
});

test('S14', 'help not acknowledged within 300 ms shows once, holds the day with W-hold, and is projected nowhere', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const p = await page(P.on, { ...s, time });
  const v = p.visit();
  s.controller.state.delay = 450;
  const started = time.now, wall = Date.now(), clock = setInterval(() => { time.now = started + (Date.now() - wall); }, 5);
  try { await p.capture(v, [row('dictionary-entry', kanji('職'), ['meaning', 'form'], 50)]); }
  finally { clearInterval(clock); }
  assert.equal((v.referenceHelp || []).length, 0);
  assert.equal(JSON.parse(s.storage.getItem('bunki-journey:hold')).reason, 'help-write-hold');
  assert.notEqual(p.lifecycle().phase, 'active');
  s.controller.state.delay = 0;
  await new Promise((r) => setTimeout(r, 500));
  const w = p.visit(); const id = await p.act(w); const o = await p.report(w, id);
  assert.deepEqual([o.write, o.reason], [false, 'not-recorded']); assert.equal(p.calls(), 0);
});
test('S15', 'custody with the journey on: a candidate stripped of its labels (past the rule\'s re-derivation) is refused before the hook', async (P) => {
  const s = store(), { time } = await journeyOnNextDay(P, s);
  const p = await page(P.on, { ...s, time });
  const v = p.visit();
  await p.capture(v, [row('dictionary-entry', kanji('職'), ['meaning', 'form'], 60)]);
  const id = await p.act(v), prepared = await p.prepare(v, id);
  const forged = copy(prepared.details);
  delete forged.candidate.helpRelevance; forged.candidate.help = forged.candidate.help.map(({ relevance, ...raw }) => raw);
  const o = await p.observe(prepared.details.attemptId, forged, prepared.binding);
  assert.deepEqual([o.write, o.reason], [false, 'review-unverified']); assert.equal(p.calls(), 0);
});

/** W5's 70 vectors: their help rows and original origins imported into the root through a registered producer, a reload,
 * then the actual course attempt, preparation from the root, the caller, the fence and the hook. No preload */
async function vectorRuns(P, { skipImport = false } = {}) {
  const vectors = JSON.parse(readFileSync('/Users/dhyana/.dharma/bunki/LEAD/design/m4-contracts/r2/W4-JOURNEY-VECTORS.json', 'utf8')).vectors;
  assert.equal(vectors.length, 70);
  const policy = `${catalog.policy}:${catalog.sourceVersion}`, oldPolicy = vectors[0].prepared.candidate.helpRelevance.policy;
  const results = [];
  for (const [index, vector] of vectors.entries()) {
    if (index % 10 === 0) floor();
    const result = { index, case: vector.case, entrance: vector.entrance };
    try {
      const s = store(), { time } = await journeyOnNextDay(P, s);
      const importer = await page(P.on, { ...s, time });
      if (!skipImport) assert.equal((await importer.import(vector.producerRaw.help, vector.producerContext.origins)).accepted, true);
      const p = await page(P.on, { ...s, time });
      assert.equal(p.lifecycle().phase, 'active');
      const before = p.record();
      const old = await p.observe(vector.prepared.attemptId, vector.prepared, { owner: vector.prepared.owner, journeyId: vector.prepared.journeyId, epoch: 1,
        attemptId: vector.prepared.attemptId, sessionId: vector.producerContext.sessionId, origins: vector.producerContext.origins });
      assert.deepEqual([old.write, old.reason], [false, 'review-unverified']); assert.equal(p.calls(), 0);
      result.oldRefused = true;
      const v = p.visit();
      for (let guard = 0; ; guard++) {
        assert.ok(guard < 8, 'target missing from the authored course');
        const current = p.ctx.BunkiKanjiCourse.currentAttempt(v.run);
        if (current.tests === vector.producerRaw.tests && core.itemIdentity(current.item) === core.itemIdentity(vector.producerRaw.item) && current.item.kind === vector.producerRaw.item.kind) break;
        await p.act(v, 'skip'); p.next(v);
      }
      const id = await p.act(v), prepared = await p.prepare(v, id);
      assert.ok(prepared.details, prepared.reason);
      const retained = copy(p.run(`kanjiJourney.retained.get(${JSON.stringify(prepared.details.attemptId)})`));
      assert.deepEqual(retained.rawCandidate.help, vector.producerRaw.help); assert.deepEqual(retained.context.origins, vector.producerContext.origins);
      assert.deepEqual(prepared.details.candidate.help.map((h) => h.relevance ?? null), vector.prepared.candidate.help.map((h) => h.relevance ?? null));
      assert.equal(prepared.details.candidate.helpRelevance.policy, policy);
      const stale = copy(prepared.details); stale.candidate.helpRelevance.policy = oldPolicy;
      const refused = await p.observe(prepared.details.attemptId, stale, prepared.binding);
      assert.deepEqual([refused.write, refused.reason], [false, 'review-unverified']); assert.equal(p.calls(), 0);
      result.policyOnlyRefused = true;
      const outcome = await p.observe(prepared.details.attemptId, prepared.details, prepared.binding);
      graded(outcome);
      const want = vector.requiredW4Decision;
      if (want === 'Good') assert.equal(outcome.rating, 3); else if (want === 'Again') assert.equal(outcome.rating, 1);
      else assert.ok(outcome.rating >= 1 && outcome.rating <= 2);
      assert.equal(p.calls(), 1); assert.equal(p.lastCall().binding.journey, 'dispatch');
      assert.deepEqual(p.lastCall().binding.origins, vector.producerContext.origins); assert.deepEqual(p.lastCall().binding.raw.help, vector.producerRaw.help);
      await p.run(`kanjiJourneySettle(${JSON.stringify(prepared.details.attemptId)}, ${JSON.stringify(outcome)})`);
      assert.equal(others(p.record()), others(before));
      result.parity = true; result.rating = outcome.rating;
    } catch (error) { result.error = error.message.split('\n')[0]; }
    results.push(result);
  }
  return results;
}

/** one mutant per corridor journey guard; each must turn its own case red */
export const MUTANTS = {
  'fence-skipped': ['S9', [["        if (fenced) { decision = { write: false, reason: fenced }; return { outcome: 'not-published' }; }\n", '']]],
  'fence-owner-as-stale': ['S10', [["  if (!journey?.lifecycle || journey.epoch !== epoch || epoch !== recordEpoch) return 'publish-failed';", "  if (!journey?.lifecycle) return 'publish-failed';"]]],
  'off-switched-on': ['S1', [["      device: kanjiJourneyDevice, buildId, core: srsCore, clock: Date.now, enabled: JOURNEY_WRITES,", "      device: kanjiJourneyDevice, buildId, core: srsCore, clock: Date.now, enabled: true,"]]],
  'off-device-unwired': ['S1', [["      device: kanjiJourneyDevice, buildId,", "      device: { read() {}, write() { return true; }, remove() { return true; } }, buildId,"]]],
  'off-tick-missing': ['S3', [["  if (typeof kanjiJourneyTick === 'function') kanjiJourneyTick();\n", '']]],
  'build-unchecked': ['S12', [["    if (!served) { kanjiJourney = { epoch, unavailable: 'build-unidentified' }; return; }\n", '']]],
  'projected-before-kept': ['S14', [["    if (shown?.accepted !== true) return;\n", '']]],
  'custody-trusts-received-on': ['S15', [["  if (candidate !== undefined && JSON.stringify(candidate) !== JSON.stringify(record.details.candidate)) throw new Error('review-transport-changed');\n", '']]],
  'day-full-not-told': ['S13', [["  if (KANJI_JOURNEY_DAY_FULL.includes(error?.message)) journey.fullDay = day;\n", '']]],
};

export async function init() { modules ||= await load(); return modules; }
async function main() {
  floor();
  assert.ok(arg('modules') || process.env.KAIRO_MODULES_DIR, 'pass --modules=<dir> holding a built record-core.mjs and reading-core.mjs');
  modules = await load();
  const P = { ...programs(), base: baseProgram() };
  const only = arg('case'), results = [];
  for (const t of CASES) {
    if (only && t.id !== only) continue;
    floor();
    try { await t.fn(P); results.push({ id: t.id, passed: true }); }
    catch (error) { results.push({ id: t.id, passed: false, error: error.message.split('\n').slice(0, 12).join(' ') }); }
  }
  let vectors = null;
  if (process.argv.includes('--vectors')) {
    const runs = await vectorRuns(P);
    // negative control: the same runs without the import must lose every case whose decision depends on the imported help
    const control = await vectorRuns(P, { skipImport: true });
    const vectorsFile = JSON.parse(readFileSync('/Users/dhyana/.dharma/bunki/LEAD/design/m4-contracts/r2/W4-JOURNEY-VECTORS.json', 'utf8')).vectors;
    const dependent = vectorsFile.map((v, i) => [v, i]).filter(([v]) => v.requiredW4Decision !== 'Good').map(([, i]) => i);
    vectors = { total: runs.length, oldRefused: runs.filter((r) => r.oldRefused).length, policyOnlyRefused: runs.filter((r) => r.policyOnlyRefused).length,
      parity: runs.filter((r) => r.parity).length, errors: runs.filter((r) => r.error),
      withoutImport: { helpDependent: dependent.length, lost: dependent.filter((i) => !control[i].parity).length,
        unexpectedlyKept: dependent.filter((i) => control[i].parity).map((i) => control[i].case) } };
    assert.equal(vectors.withoutImport.lost, dependent.length, 'the vectors must detect a missing import');
  }
  const controls = [];
  if (process.argv.includes('--mutants')) {
    for (const [name, [target, pairs]] of Object.entries(MUTANTS)) {
      floor();
      let text = SOURCE;
      for (const [from, to] of pairs) { assert.equal(text.split(from).length, 2, 'mutant anchor not unique: ' + name); text = text.replace(from, to); }
      const mutated = { ...programs(text), base: P.base };
      try { await CASES.find((entry) => entry.id === target).fn(mutated); controls.push({ name, target, killed: false }); }
      catch (error) { controls.push({ name, target, killed: error instanceof assert.AssertionError, witness: error.message.split('\n')[0] }); }
    }
  }
  const failed = results.filter((r) => !r.passed), survived = controls.filter((c) => !c.killed);
  console.log(JSON.stringify({ cases: `${results.length - failed.length}/${results.length}`, failed, vectors,
    controls: controls.length ? `${controls.length - survived.length}/${controls.length}` : 'not run', survived, controlDetails: controls }, null, 1));
  process.exitCode = failed.length || survived.length || vectors?.errors.length ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
