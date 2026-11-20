/**
 * HOOKS r8 install and wiring, the corridor half of verify-srs-hooks (window 4; lead 1117; W5 Codex 1131). The installed
 * W3 rule (help-relevance.mjs, byte-identical to W3's relevance.mjs), the shipped catalog, the one review caller
 * (review-caller.mjs) and corridor.js's course adapter — the visit's retained ledger, kanjiCourseAct,
 * kanjiCoursePrepareReview, custody and reportKanjiCourseAttempt — lifted into the C layer's vm sandbox, with the actual
 * kanji-course.js running in the same realm (as in the browser). The record app, storage and the Web Lock are the C
 * layer's doubles.
 *
 * Cases: I1 the install · R0–R3 grades through the course · W1–W4 W2's 0524 witnesses · X1–X3 W3's 0532 custody
 * controls · K3–K5 the binding · WA/WB W2's 0546 witnesses · L1–L6 W5's 1131 ledger contract, rule present and absent ·
 * L7 W3's 1200 F1 witnesses · L8 a full page ledger refuses in plain words · L9 how often a bound is reached (lead 1207).
 * Not proved here: the rendered course in a browser, and continuity across a reload or between entrances (the page ledger
 * is the in-memory view of W5's journey; lead 1207).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/** W3's relevance.mjs as frozen in KANJI-NEXT/relevance-r8-01/SHA256.json (78719626…) */
export const W3_RULE_SHA256 = '04ef105d9e37ace418295b95cc9355d3dcd4b595bd22277fe77864748591bdc7';

export function r8Sources(corridorDir) {
  const read = (path) => readFileSync(join(corridorDir, path), 'utf8');
  return { dir: corridorDir, course: read('kanji-course.js'), relevance: read('help-relevance.mjs'), caller: read('review-caller.mjs'),
    catalog: read('data/help-relevance-catalog.json'), corridor: read('corridor.js') };
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
const copy = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

/* helpers defined inside the sandbox, so every object the adapter sees is made in its own realm */
const VM_HELPERS = `
var __calls = [];
function tx(ja, en) { return en; }
const __report = reportHookAttempt;
window.__KAIRO_HOOKS__ = Object.freeze({ report: (evidence, binding) => { __calls.push(JSON.parse(JSON.stringify({ evidence, binding }))); return __report(evidence, binding); } });
function __visit(sessionId, priorHelp) {
  const v = { unitId: 'shiki-shoku', stage: 'check', index: 0, epoch: recordEpoch, run: null, draft: '', feedback: null, saved: false, pending: false };
  if (priorHelp) v.referenceHelp = JSON.parse(priorHelp);
  v.run = BunkiKanjiCourse.createRun('shiki-shoku', { sessionId });
  S.kanjiCourse = v; S.view = 'lessons';
  kanjiCourseApplyHelp(v);
  return v;
}
function __capture(v, rowsText, attemptId) { kanjiCourseRememberHelp(v, JSON.parse(rowsText), attemptId || null); kanjiCourseApplyHelp(v); }
function __act(v, action, wrong) {
  const prompt = BunkiKanjiCourse.currentPrompt(v.run);
  const value = action !== 'answer' ? undefined : wrong ? (prompt.choices.length ? prompt.choices.find((c) => !prompt.acceptedAnswers.includes(c.id)).id : 'まちがい') : prompt.acceptedAnswers[0];
  v.feedback = { prompt, result: kanjiCourseAct(v, action, value) };
  return v.feedback.result.attemptId;
}
function __next(v) { v.feedback = null; kanjiCourseApplyHelp(v); }
function __prepare(v, attemptId, check) {
  v.run = BunkiKanjiCourse.selfCheck(v.run, attemptId, check || 'knew', Date.now());
  return kanjiCoursePrepareReview(v, attemptId, BunkiKanjiCourse.hookCandidate(v.run, attemptId));
}
function __observe(attemptId, detailsText, bindingText) {
  return kanjiReviewCaller.observe({ type: 'PREPARE_REVIEW', attemptId }, { status: 'prepared', details: JSON.parse(detailsText), state: KANJI_REVIEW_STATE },
    JSON.parse(bindingText));
}
function __rule() { return helpRelevanceRule; }
`;

/**
 * r8 cases into verify-srs-hooks' check(). program: the lifted corridor.js (possibly an edited copy, for a control);
 * mods: { relevance, caller } modules (possibly edited copies); sources from r8Sources().
 */
/**
 * The course page harness (W5 1131 asked for the entry point): page({ rule, catalogOverride }) gives one sandboxed page
 * with the lifted adapter, the actual course and hook, and the caller adopted with or without W3's rule; it exposes
 * visit/capture/act/next/prepare/observe/report, the ledger and the retained records, the hook's calls and the record.
 */
export function r8Harness({ layer, program, core, fsrsApi, pin, mods, sources }) {
  const scheduler = core.createScheduler(fsrsApi, pin);
  const base = new Date('2026-10-10T09:00:00+09:00');
  let dueCard = fsrsApi.createEmptyCard(base);
  for (const offset of [0, 600000]) dueCard = scheduler.next(dueCard, new Date(+base + offset), 3).card;
  const dueAt = +new Date(dueCard.due) + 3600000;
  const entries = [['職', '職業', 'しょくぎょう'], ['識', '知識', 'ちしき'], ['織', '組織', 'そしき'], ['水', '水道', 'すいどう']];
  const learner = () => ({
    taken: entries.flatMap(([literal, term]) => [{ t: 'kanji', id: literal, started: 1 }, { t: 'word', id: term, started: 1 }]),
    srs: Object.fromEntries(entries.flatMap(([literal, term]) => [[`kanji:${literal}`, copy(dueCard)], [`word:${term}`, copy(dueCard)]])),
    revlog: [], obslog: [], lessonsDone: {}, stats: {}, suspended: {}, deepWords: {},
  });
  const dict = Object.fromEntries(entries.map(([, word, reading]) => [word, { r: reading, m: ['retained word meaning'] }]));
  const catalog = JSON.parse(sources.catalog);
  let serial = 0;
  const pages = [];

  /** one page: the lifted adapter, the actual course and hook, the caller adopted with (rule) or without W3's rule */
  function page({ rule = true, catalogOverride = null } = {}) {
    let now = dueAt - 60000;
    const h = layer.corridorSandbox(program, { core, fsrsApi, pin, record: learner(), dict, clock: () => new Date(now) });
    const ctx = h.sandbox;
    // the VM's own Object/JSON/Array, so object literals and the course's plain-data checks share one realm, as in the browser
    delete ctx.Object; delete ctx.JSON; delete ctx.Array;
    vm.runInContext(`${sources.course}\nwindow.BunkiKanjiCourse = BunkiKanjiCourse;\n${VM_HELPERS}`, ctx);
    const adopted = ctx.adoptHelpRelevance({ createRelevance: rule ? mods.relevance.createRelevance : null, createCaller: mods.caller.createCaller,
      catalog: catalogOverride || catalog });
    const run = (code) => vm.runInContext(code, ctx);
    const p = {
      h, ctx, adopted, run,
      get now() { return now; }, set now(value) { now = value; },
      writes: () => h.box.writes,
      record: () => JSON.stringify(h.box.record),
      calls: () => run('__calls.length'),
      lastCall: () => copy(run('__calls.at(-1)')),
      visit: (priorHelp) => ctx.__visit(`run${++serial}`, priorHelp ? JSON.stringify(priorHelp) : undefined),
      capture: (visit, rows, attemptId) => ctx.__capture(visit, JSON.stringify(rows), attemptId),
      act: (visit, action = 'answer', wrong = false) => { now += 1000; return ctx.__act(visit, action, wrong); },
      next: (visit) => ctx.__next(visit),
      prepare: (visit, id, check) => { now += 10; return copy(ctx.__prepare(visit, id, check)); },
      observe: (id, details, binding) => ctx.__observe(id, JSON.stringify(details), JSON.stringify(binding)),
      report: async (visit, id, check = 'knew') => { now += 10; await ctx.reportKanjiCourseAttempt(visit, id, check); await tick(); return copy(visit.hookOutcomes[id]); },
      ledger: (visit) => copy(visit.reviewLedger),
      retained: (visit, id) => visit.reviewLedger.records[id],
      journey: () => copy(run('kanjiCourseJourney')),
      line: (outcome) => ctx.kanjiCourseHookLine(outcome),
    };
    pages.push(p);
    return p;
  }
  return { page, catalog, dueAt, pages };
}

export async function r8Cases({ check, layer, program, core, fsrsApi, pin, mods, sources }) {
  const { page, catalog, pages } = r8Harness({ layer, program, core, fsrsApi, pin, mods, sources });
  const row = (what, about, reveals, at) => ({ what, ...(about ? { about } : {}), reveals, at });
  const kanji = (literal) => ({ kind: 'kanji', literal });
  const word = (term, reading) => ({ kind: 'word', term, reading });
  /** an answered, self-checked 職 meaning attempt prepared after the given help; returns its pieces */
  async function preparedAttempt(p, help = [], { check = 'knew' } = {}) {
    const visit = p.visit();
    if (help.length) p.capture(visit, help);
    const id = p.act(visit);
    const prepared = p.prepare(visit, id, check);
    assert.ok(prepared.details, `prepared: ${prepared.reason}`);
    return { visit, id, prepared };
  }
  const unrelated = (at) => row('dictionary-entry', kanji('水'), ['meaning', 'form'], at);
  const refusedBeforeCall = (p, outcome, before, reason = 'review-unverified') => {
    assert.deepEqual([outcome?.write, outcome?.reason], [false, reason]);
    assert.equal(p.calls(), 0, 'no hook call');
    assert.equal(p.writes(), 0, 'no write');
    assert.equal(p.record(), before, 'the record is unchanged byte for byte');
  };

  await check('I1', 'r8', async () => {
    assert.equal(sha(sources.relevance), W3_RULE_SHA256, 'help-relevance.mjs is W3’s relevance.mjs, byte for byte');
    const pinned = catalog.pins.map((entry) => ({ path: entry.path, sha256: sha(readFileSync(join(sources.dir, '..', '..', entry.path))) }));
    assert.deepEqual(pinned, catalog.pins, 'the catalog pins these exact source files');
    assert.equal(sha(JSON.stringify(canonical({ pins: catalog.pins, pairs: catalog.pairs }))), catalog.sourceVersion, 'its version is W3’s derivation');
    const policy = sources.corridor.match(/const HELP_RELEVANCE_POLICY = '([^']+)';/)[1];
    assert.equal(`${catalog.policy}:${catalog.sourceVersion}`, policy, 'corridor.js admits exactly this catalog');
    const installed = page();
    assert.equal(installed.adopted.rule?.policy, policy, 'the rule installs under the admitted policy');
    const stale = page({ catalogOverride: { ...catalog, sourceVersion: 'f'.repeat(64) } });
    assert.equal(stale.adopted.rule, null, 'a catalog of any other version installs no rule');
    assert.equal(page({ rule: false }).adopted.rule, null);
    return 'W3’s rule byte-identical; the catalog pins the shipped sources and recomputes; only the admitted policy installs';
  });

  await check('R0', 'r8', async () => {
    const p = page({ rule: false });
    const { prepared } = await preparedAttempt(p, [unrelated(1000)]);
    assert.equal(prepared.details.candidate.helpRelevance, undefined, 'without the rule the course prepares unannotated');
    const forged = { ...prepared.details.candidate, help: prepared.details.candidate.help.map((h) => ({ ...h, relevance: 'unrelated' })),
      helpRelevance: { policy: catalog.policy, attemptId: 'a', sessionId: 's', targetIdentity: 'x', tests: 'meaning', origins: [null] } };
    for (const admission of [undefined, { ...prepared.binding, raw: prepared.details.candidate }]) {
      const r = await p.ctx.window.__KAIRO_HOOKS__.report(forged, admission);
      assert.deepEqual([r.write, r.reason, p.writes()], [false, 'review-unverified', 0]);
    }
    return 'rule absent: the course prepares unannotated candidates, and an annotated one is refused with no write';
  });

  const grade = async (rule, help) => {
    const p = page({ rule });
    const visit = p.visit();
    if (help.length) p.capture(visit, help);
    const id = p.act(visit);
    const outcome = await p.report(visit, id);
    return { p, outcome };
  };
  await check('R1', 'r8', async () => {
    const admitted = await grade(true, [unrelated(1000)]);
    assert.deepEqual([admitted.outcome.write, admitted.outcome.rating, admitted.outcome.capped], [true, 3, false]);
    assert.equal(admitted.p.calls(), 1);
    const call = admitted.p.lastCall();
    assert.deepEqual(call.evidence.help.map((h) => h.relevance), ['unrelated']);
    assert.ok(call.binding?.raw && call.binding.origins.length === 1, 'the hook got the retained admission');
    const legacy = await grade(false, [unrelated(1000)]);
    assert.deepEqual([legacy.outcome.write, legacy.outcome.rating, legacy.outcome.capped], [true, 2, true]);
    return 'through the course: a 水 lookup before a 職 meaning check grades Good with the rule installed (Hard without it)';
  });
  await check('R2', 'r8', async () => {
    const { outcome } = await grade(true, [row('teaching-card', word('職業', 'しょくぎょう'), ['reading', 'meaning', 'form'], 1000)]);
    assert.deepEqual([outcome.write, outcome.rating, outcome.capped], [true, 2, true]);
    return 'a 職業 teaching card is related to 職: Hard';
  });
  await check('R3', 'r8', async () => {
    const { outcome } = await grade(true, [row('dictionary-entry', kanji('職'), ['meaning', 'form'], 1000)]);
    assert.deepEqual([outcome.write, outcome.rating], [true, 1]);
    return 'looking up 職 itself before its meaning check: Again';
  });

  await check('W1', 'r8', async () => {
    const p = page();
    const { id, prepared } = await preparedAttempt(p, [row('teaching-card', word('職業', 'しょくぎょう'), ['reading', 'meaning', 'form'], 1000)]);
    const before = p.record();
    const details = copy(prepared.details);
    details.candidate.help[0].relevance = 'unrelated';
    refusedBeforeCall(p, await p.observe(id, details, prepared.binding), before);
    const direct = await p.ctx.window.__KAIRO_HOOKS__.report(details.candidate, { ...prepared.binding, raw: copy(p.retained(p.h.S.kanjiCourse, id).rawCandidate) });
    assert.deepEqual([direct.write, direct.reason, p.writes()], [false, 'review-unverified', 0]);
    return 'a related row relabelled unrelated: zero calls through the caller; the hook refuses it with no write';
  });
  await check('W2', 'r8', async () => {
    const p = page();
    const { visit, id, prepared } = await preparedAttempt(p, [unrelated(1000)]);
    const raw = copy(p.retained(visit, id).rawCandidate);
    const candidate = prepared.details.candidate;
    const variants = [
      undefined,
      { ...prepared.binding, raw, attemptId: `${id}x` },
      { ...prepared.binding, raw, sessionId: 'another-session' },
    ];
    for (const admission of variants) {
      const r = await p.ctx.window.__KAIRO_HOOKS__.report(candidate, admission);
      assert.deepEqual([r.write, r.reason], [false, 'review-unverified']);
    }
    const otherPolicy = { ...candidate, helpRelevance: { ...candidate.helpRelevance, policy: `${catalog.policy}:${'f'.repeat(64)}` } };
    const r = await p.ctx.window.__KAIRO_HOOKS__.report(otherPolicy, { ...prepared.binding, raw });
    assert.deepEqual([r.write, r.reason, p.writes()], [false, 'review-unverified', 0]);
    return 'an annotation under another policy, attempt or session, or with no admission: refused, no write';
  });
  await check('W3', 'r8', async () => {
    const p = page();
    const { id, prepared } = await preparedAttempt(p, [row('dictionary-entry', null, ['reading', 'meaning', 'form'], 1000)]);
    assert.deepEqual(prepared.details.candidate.help.map((h) => h.relevance), ['target'], 'a row of this learning session is the target’s');
    const before = p.record();
    const stale = { ...prepared.binding, sessionId: 'earlier-session', origins: prepared.binding.origins.map((o) => ({ ...o, sessionId: 'earlier-session' })) };
    refusedBeforeCall(p, await p.observe(id, prepared.details, stale), before);
    return 'a stale learning session cannot turn this session’s hint into earlier-session help: zero calls';
  });
  await check('W4', 'r8', async () => {
    const p = page();
    const { visit, id, prepared } = await preparedAttempt(p, [unrelated(1000)]);
    const before = p.record();
    refusedBeforeCall(p, await p.observe(id, prepared.details, { ...prepared.binding, origins: [{ eventId: '' }] }), before);
    const r = await p.ctx.window.__KAIRO_HOOKS__.report(prepared.details.candidate,
      { ...prepared.binding, origins: [{ eventId: '', sessionId: 7 }], raw: copy(p.retained(visit, id).rawCandidate) });
    assert.deepEqual([r.write, r.reason, p.writes()], [false, 'review-unverified', 0]);
    return 'malformed origins: zero calls through the caller; the hook refuses them with no write';
  });

  await check('X1', 'r8', async () => {
    const p = page();
    // a legacy row (null origin), a dictionary row, then attempt 1's own feedback before attempt 2: three origin kinds
    const visit = p.visit([row('teaching-card', kanji('織'), ['meaning', 'form'], 900)]);
    p.capture(visit, [unrelated(1000)]);
    const first = p.act(visit);
    p.next(visit);
    const id = p.act(visit);
    const prepared = p.prepare(visit, id);
    assert.ok(prepared.details, prepared.reason);
    const origins = prepared.binding.origins;
    const at = (predicate) => origins.findIndex(predicate);
    const legacy = at((o) => o === null), dictionary = at((o) => o && !o.attemptId), feedback = at((o) => o?.attemptId === first);
    assert.ok(legacy >= 0 && dictionary >= 0 && feedback >= 0, JSON.stringify(origins));
    const before = p.record();
    const rule = p.adopted.rule;
    const forgedContext = { attemptId: id, sessionId: 'forged', origins: origins.map((o) => (o ? { ...o, sessionId: 'forged' } : o)) };
    const tamperings = {
      'stale session': (d, b) => { b.sessionId = 'stale'; },
      'origin event id': (d, b) => { b.origins[dictionary].eventId += 'x'; },
      'origin session': (d, b) => { b.origins[dictionary].sessionId = 'other'; },
      'origin attempt': (d, b) => { b.origins[feedback].attemptId = `${first}x`; },
      'origin dropped': (d, b) => { b.origins.pop(); },
      'origins reordered': (d, b) => { b.origins.reverse(); },
      'invented origin in a null slot': (d, b) => { b.origins[legacy] = { eventId: 'invented', sessionId: b.sessionId }; },
      'raw row body': (d) => { d.candidate.help[dictionary].at += 1; },
      'reveals': (d) => { d.candidate.help[dictionary].reveals = ['form']; },
      'forged context': (d, b) => { Object.assign(b, { sessionId: forgedContext.sessionId, origins: forgedContext.origins }); },
      'consistent forgery': (d, b) => {
        d.candidate = rule.labelCandidate({ ...copy(p.retained(visit, id).rawCandidate) }, forgedContext);
        Object.assign(b, { sessionId: forgedContext.sessionId, origins: forgedContext.origins });
      },
      'forged target label': (d) => { d.candidate.help[dictionary].relevance = 'target'; },
    };
    for (const [name, tamper] of Object.entries(tamperings)) {
      const details = copy(prepared.details), binding = copy(prepared.binding);
      tamper(details, binding);
      try { refusedBeforeCall(p, await p.observe(id, details, binding), before); }
      catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
    }
    const authentic = await p.observe(id, prepared.details, prepared.binding);
    assert.deepEqual([authentic.write, p.calls()], [true, 1], 'the authentic delivery then grades');
    return `${Object.keys(tamperings).length} tamperings of binding, origins, raw or candidate: each refused before any call, the record unchanged; the authentic delivery then grades`;
  });
  await check('X2', 'r8', async () => {
    const p = page();
    const { visit, id, prepared } = await preparedAttempt(p, [unrelated(1000)]);
    const before = p.record();
    const staleRule = mods.relevance.createRelevance({ itemIdentity: core.itemIdentity, validItem: core.validItem, catalog: { ...catalog, sourceVersion: 'e'.repeat(64) } });
    const details = { ...copy(prepared.details), candidate: staleRule.labelCandidate(copy(p.retained(visit, id).rawCandidate), copy(p.retained(visit, id).context)) };
    refusedBeforeCall(p, await p.observe(id, details, prepared.binding), before);
    return 'a candidate labelled under a stale policy is refused before the call, though custody holds the attempt';
  });
  await check('X3', 'r8', async () => {
    const p = page();
    const visit = p.visit();
    p.capture(visit, [unrelated(1000)]);
    p.capture(visit, [unrelated(1000)]);
    const ledger = p.ledger(visit);
    assert.equal(ledger.exposure.length, 2, 'two events');
    assert.notEqual(ledger.origins[0].eventId, ledger.origins[1].eventId);
    assert.equal(visit.referenceHelp.length, 1, 'the course projection keeps one');
    const id = p.act(visit);
    const outcome = await p.report(visit, id);
    assert.deepEqual([outcome.write, outcome.rating], [true, 3]);
    assert.deepEqual(p.lastCall().binding.origins.map((o) => o.eventId), ledger.origins.map((o) => o.eventId));
    return 'duplicate equal-body events stay two, with distinct event ids, and grade Good';
  });

  await check('K3', 'r8', async () => {
    const p = page();
    const { id, prepared } = await preparedAttempt(p, [unrelated(1000)]);
    const before = p.record();
    p.ctx.recordEpoch = 2;
    refusedBeforeCall(p, await p.observe(id, prepared.details, prepared.binding), before, 'owner-changed');
    return 'the record moved to another epoch between preparation and the call: owner-changed, zero calls';
  });
  await check('K4', 'r8', async () => {
    const p = page();
    const { id, prepared } = await preparedAttempt(p, [unrelated(1000)]);
    const before = p.record();
    refusedBeforeCall(p, await p.observe(id, prepared.details, { ...prepared.binding, attemptId: `${id}x` }), before, 'attempt-mismatch');
    refusedBeforeCall(p, await p.observe(`${id}x`, prepared.details, prepared.binding), before, 'attempt-mismatch');
    return 'action, prepared result and binding must name the same attempt, else no call';
  });
  await check('K5', 'r8', async () => {
    const p = page();
    const visit = p.visit();
    p.capture(visit, [unrelated(1000)]);
    const id = p.act(visit);
    const release = p.h.locks.hold();
    const pending = p.ctx.reportKanjiCourseAttempt(visit, id, 'knew');
    await tick();
    p.ctx.recordEpoch = 2;
    release();
    await pending; await tick();
    const outcome = copy(visit.hookOutcomes[id]);
    assert.deepEqual([outcome.write, p.calls(), p.writes()], [false, 1, 0], 'the late result does not publish into the new epoch');
    p.ctx.recordEpoch = 1;
    await p.ctx.reportKanjiCourseAttempt(visit, id, 'knew'); await tick();
    assert.equal(p.calls(), 1, 'the attempt is not regraded');
    return 'a late result from epoch 1 is not shown in epoch 2, and the attempt is not prepared or regraded again';
  });
  await check('WA', 'r8', async () => {
    const p = page();
    const { id, prepared } = await preparedAttempt(p, [unrelated(1000)]);
    const before = p.record();
    const details = { ...copy(prepared.details), owner: 'another-owner' };
    refusedBeforeCall(p, await p.observe(id, details, { ...prepared.binding, owner: 'another-owner' }), before);
    return 'retained owner A, the outer result and binding switched to owner B: zero calls, zero writes';
  });
  await check('WB', 'r8', async () => {
    const p = page();
    const { id, prepared } = await preparedAttempt(p, [unrelated(1000)]);
    const before = p.record();
    const binding = { ...copy(prepared.binding), sessionId: 'receiver', origins: [{ eventId: 'receiver/1', sessionId: 'receiver' }] };
    refusedBeforeCall(p, await p.observe(id, prepared.details, binding), before);
    return 'authentic retained context, the receiver’s session and origins in the binding: zero calls, no conservative write';
  });

  /* W5 Codex 1131: the ledger contract */
  await check('L1', 'r8', async () => {
    const results = [];
    for (const rule of [true, false]) {
      const p = page({ rule });
      const { visit, id, prepared } = await preparedAttempt(p, [unrelated(1000), row('teaching-card', kanji('織'), ['meaning'], 1001)]);
      const retainedBefore = JSON.stringify(p.retained(visit, id));
      prepared.details.candidate.help.length = 0;
      prepared.binding.origins[0].eventId = 'edited';
      assert.equal(JSON.stringify(p.retained(visit, id)), retainedBefore, 'editing what was handed out leaves the retained record');
      const fresh = await preparedAttempt(p, [unrelated(2000), row('teaching-card', kanji('織'), ['meaning'], 2001)]);
      const before = p.record();
      const edits = {
        'removed answer row': (d) => { d.candidate.help.splice(1, 1); },
        'edited origin': (d, b) => { b.origins[0].eventId += 'x'; },
        'consistently edited envelope': (d, b) => { d.candidate.help.splice(1, 1); b.origins.splice(1, 1);
          if (d.candidate.helpRelevance) d.candidate.helpRelevance.origins.splice(1, 1); },
      };
      for (const [name, edit] of Object.entries(edits)) {
        const details = copy(fresh.prepared.details), binding = copy(fresh.prepared.binding);
        edit(details, binding);
        try { refusedBeforeCall(p, await p.observe(fresh.id, details, binding), before); }
        catch (error) { throw new Error(`${rule ? 'rule' : 'no rule'}, ${name}: ${error.message}`, { cause: error }); }
      }
      assert.ok(Object.isFrozen(p.retained(fresh.visit, fresh.id).details.candidate.help), 'retained deep-frozen');
      results.push(rule ? 'rule' : 'no rule');
    }
    return `custody is independent and immutable (${results.join(', ')}): a removed row, an edited origin and a consistently edited envelope each refuse with zero calls and writes`;
  });
  await check('L2', 'r8', async () => {
    const p = page();
    const visit = p.visit();
    const id = p.act(visit);
    const feedback = copy(visit.feedback.result.exposure);
    const length = p.ledger(visit).exposure.length;
    p.capture(visit, feedback, id);
    assert.equal(p.ledger(visit).exposure.length, length, 'the same event again is idempotent');
    p.capture(visit, feedback.map((r) => ({ ...r, at: r.at + 1 })), id);
    assert.equal(p.ledger(visit).unavailable, 'help-event-reuse-conflict');
    const prepared = p.prepare(visit, id);
    assert.deepEqual([prepared.reason, p.calls()], ['review-unverified', 0], 'nothing from that ledger is prepared');
    return 'the same event id with the same row is idempotent; with another row it refuses, and the visit prepares nothing';
  });
  await check('L3', 'r8', async () => {
    const p = page();
    const visit = p.visit();
    p.capture(visit, [unrelated(2000)]);
    p.capture(visit, [row('dictionary-entry', kanji('識'), ['meaning'], 1500)]);
    const help = copy(p.h.S.kanjiCourse.run.attempts[visit.run.cursor].help);
    assert.deepEqual(help.map((h) => h.at), [1500, 2000], 'the open projection is rebuilt in time order');
    assert.deepEqual(p.ledger(visit).exposure.map((h) => h.at), [2000, 1500], 'the raw ledger keeps capture order');
    return 'a later capture with an older clock rebuilds the open attempt’s projection instead of breaking its order';
  });
  await check('L4', 'r8', async () => {
    const malformed = {
      'a Date clock': 'Object.assign(JSON.parse(text), { at: new Date(1000) })',
      'an accessor': 'Object.defineProperty(JSON.parse(text), "at", { get: () => 1000, enumerable: true })',
      'an extra field': 'Object.assign(JSON.parse(text), { secret: 1 })',
      'another prototype': 'Object.setPrototypeOf(JSON.parse(text), { inherited: true })',
      'a holey reveals list': '(() => { const r = JSON.parse(text); r.reveals = ["meaning", , "form"]; return r; })()',
    };
    for (const [name, make] of Object.entries(malformed)) {
      const p = page();
      const visit = p.visit();
      p.ctx.__row = JSON.stringify(unrelated(1000));
      p.run(`kanjiCourseRememberHelp(S.kanjiCourse, [(function (text) { return ${make}; })(__row)])`);
      assert.equal(p.ledger(visit).unavailable, 'help-row-invalid', name);
      assert.equal((visit.referenceHelp || []).length, 0, `${name}: kept nowhere`);
    }
    const p = page();
    p.deliberateBound = true;
    const visit = p.visit();
    p.capture(visit, Array.from({ length: 128 }, (_, i) => row('teaching-card', kanji('織'), ['meaning'], 1000 + i)));
    assert.equal(p.ledger(visit).exposure.length, 128);
    p.capture(visit, [unrelated(5000)]);
    assert.equal(p.ledger(visit).unavailable, 'help-limit');
    const q = page();
    q.deliberateBound = true;
    const other = q.visit();
    for (let i = 0; i < 97; i++) q.run(`kanjiCourseSnapshot(S.kanjiCourse, 'a${i}', kanjiCourseLedgerBefore(S.kanjiCourse))`);
    assert.equal(q.ledger(other).unavailable, 'attempt-input-limit');
    return 'a Date, accessor, extra field, foreign prototype or holey list refuses before any copy; 128 events and 96 attempts are the bounds';
  });
  await check('L5', 'r8', async () => {
    // W5 1159's counterexample: the answer shown in one visit, then the menu or a new unit, then a correct answer
    const p = page();
    const first = p.visit();
    p.capture(first, [row('dictionary-entry', kanji('職'), ['meaning', 'form'], 1000)]);
    const second = p.visit();
    const id = p.act(second);
    assert.equal(p.ledger(second).journeyId, p.ledger(first).journeyId, 'a new visit continues the page\u2019s ledger');
    assert.equal(p.ledger(second).sessionId, p.ledger(first).sessionId, 'and its learning session');
    const outcome = await p.report(second, id);
    assert.deepEqual([outcome.write, outcome.rating], [true, 1], 'the answer seen in the earlier visit still grades Again');
    // an owner change is the restart boundary: a new ledger with no claim to the old one
    const q = page();
    const before = q.visit();
    q.capture(before, [row('dictionary-entry', kanji('職'), ['meaning', 'form'], 1000)]);
    const oldSession = q.ledger(before).sessionId;
    q.ctx.recordEpoch = 2;
    const after = q.visit();
    q.capture(after, [unrelated(5000)]);
    assert.notEqual(q.ledger(after).sessionId, oldSession, 'a new record ownership starts a new learning session');
    assert.equal(q.ledger(before).unavailable, null, 'the earlier ledger is left as it was');
    // rows that predate the ledger keep a null origin
    const r = page();
    const legacy = r.visit([row('teaching-card', kanji('織'), ['meaning', 'form'], 900)]);
    const legacyId = r.act(legacy);
    assert.equal(r.ledger(legacy).origins[0], null, 'help from before the ledger keeps an unknown origin');
    assert.deepEqual(r.prepare(legacy, legacyId).binding.origins, [null]);
    return 'the ledger is the page\u2019s: help seen in one visit still counts after the menu or a new unit (W5\u2019s counterexample grades Again); an owner change starts a new one; older rows keep null origins';
  });
  await check('L6', 'r8', async () => {
    const p = page({ rule: false });
    const visit = p.visit();
    p.capture(visit, [unrelated(1000)]);
    const first = p.act(visit);
    const own = `course/${first}/answer-feedback`;
    assert.ok(!copy(visit.reviewLedger.inputs[first]).origins.some((o) => o?.eventId === own), 'its own feedback is not in its snapshot');
    const kept = JSON.stringify(visit.reviewLedger.inputs[first]);
    p.run(`kanjiCourseSnapshot(S.kanjiCourse, ${JSON.stringify(first)}, kanjiCourseLedgerBefore(S.kanjiCourse))`);
    assert.equal(JSON.stringify(visit.reviewLedger.inputs[first]), kept, 'a later snapshot never replaces it');
    p.next(visit);
    const second = p.act(visit);
    assert.ok(copy(visit.reviewLedger.inputs[second]).origins.some((o) => o?.eventId === own), 'the next attempt sees it');
    const prepared = p.prepare(visit, first);
    p.ctx.adoptHelpRelevance({ createRelevance: mods.relevance.createRelevance, createCaller: mods.caller.createCaller, catalog });
    assert.equal(p.retained(visit, first).details.candidate.helpRelevance, undefined, 'a rule loaded later does not relabel it');
    const outcome = await p.observe(first, prepared.details, prepared.binding);
    assert.equal(outcome.write, true, 'and it is delivered as first prepared');
    return 'the snapshot is kept once, after the action, without its own feedback; a rule that loads later leaves a prepared record as it was';
  });
  /* W3 1200 F1: the course projects only the ledger's accepted copies; W3's two witnesses */
  await check('L7', 'r8', async () => {
    const p = page();
    const result = copy(p.run(`(() => {
      const row = (literal) => ({ what: 'dictionary-entry', about: { kind: 'kanji', literal }, reveals: ['meaning'], at: 1000 });
      const a = __visit('l7alias'), supplied = row('水');
      kanjiCourseRememberHelp(a, [supplied]);
      supplied.about.literal = '職';
      kanjiCourseApplyHelp(a);
      return { retained: a.reviewLedger.exposure[0].about.literal, reference: a.referenceHelp[0].about.literal,
        projected: a.run.attempts[0].help[0].about.literal, unavailable: a.reviewLedger.unavailable };
    })()`));
    const q = page();
    const accessor = copy(q.run(`(() => {
      const row = (literal) => ({ what: 'dictionary-entry', about: { kind: 'kanji', literal }, reveals: ['meaning'], at: 1000 });
      const b = __visit('l7accessor'), batch = [];
      let reads = 0;
      Object.defineProperty(batch, '0', { enumerable: true, configurable: true, get() { return row(++reads === 1 ? '水' : '職'); } });
      kanjiCourseRememberHelp(b, batch);
      kanjiCourseApplyHelp(b);
      return { reads, kept: b.reviewLedger.exposure.length, reference: (b.referenceHelp || []).length,
        projected: b.run.attempts[0].help.length, unavailable: b.reviewLedger.unavailable };
    })()`));
    assert.deepEqual(result, { retained: '水', reference: '水', projected: '水', unavailable: null }, 'a row mutated after capture changes nothing');
    assert.deepEqual(accessor, { reads: 0, kept: 0, reference: 0, projected: 0, unavailable: 'help-batch-invalid' }, 'an accessor batch is refused unread');
    return 'the course projects only the ledger\u2019s frozen copies: a supplied row mutated after capture changes neither ledger nor projection; a batch with an accessor entry is refused before any read';
  });
  /* lead 1207: a full ledger refuses visibly, and how often anything reaches a bound */
  await check('L8', 'r8', async () => {
    const plain = 'This page has kept all the help history it can. Reload the page to record reviews again; practice still works.';
    const p = page();
    p.deliberateBound = true;
    const filled = p.visit();
    p.capture(filled, Array.from({ length: 128 }, (_, i) => row('teaching-card', kanji('織'), ['meaning'], 1000 + i)));
    p.capture(filled, [unrelated(5000)]);
    assert.equal(p.ledger(filled).unavailable, 'help-limit');
    const later = p.visit();
    const id = p.act(later);
    const before = p.record();
    const outcome = await p.report(later, id);
    assert.deepEqual([outcome.write, outcome.reason, p.calls(), p.writes(), p.record()], [false, 'review-history-full', 0, 0, before], 'nothing grades');
    assert.equal(p.line(outcome), plain, 'and the course says why, in plain words');
    const q = page();
    q.deliberateBound = true;
    const busy = q.visit();
    const busyId = q.act(busy);
    q.run(`for (let i = 0; i < 96; i++) S.kanjiCourse.reviewLedger.records['r' + i] = Object.freeze({})`);
    assert.deepEqual(q.prepare(busy, busyId).reason, 'review-history-full', '96 prepared reviews on one page: the same honest refusal');
    return `at 128 events (or 96 attempts or reviews) the course records nothing and says: \u201c${plain}\u201d`;
  });
  await check('L9', 'r8', async () => {
    const full = ['help-limit', 'attempt-input-limit', 'review-record-limit'];
    const ledgers = pages.map((p) => ({ p, journey: p.journey() })).filter(({ journey }) => journey);
    const reached = ledgers.filter(({ journey }) => full.includes(journey.unavailable));
    assert.ok(reached.every(({ p }) => p.deliberateBound), 'only the cases built to reach a bound reach one');
    const largest = Math.max(0, ...ledgers.filter(({ p }) => !p.deliberateBound).map(({ journey }) => journey.exposure.length));
    return `${reached.length} of ${ledgers.length} page ledgers reached a bound, all in L4/L8 by design; the largest other ledger held ${largest} events`;
  });
}

/* controls on review-caller.mjs (imported from the edited text) and on corridor.js (lifted from the edited text) */
export const CALLER_MUTANTS = {
  'caller-skips-binding-check': [["    if (binding.sessionId !== rec.context.sessionId || !same(binding.origins, rec.context.origins)) return settle(refusal('review-unverified'));\n", '']],
  'caller-skips-custody': [['      rec = custody.retained(attemptId, candidate);', '      rec = { details: result.details, rawCandidate: candidate, context: { attemptId, sessionId: binding.sessionId, origins: binding.origins } };']],
};
export const R8_CORRIDOR_MUTANTS = {
  'custody-trusts-received': [["  if (candidate !== undefined && JSON.stringify(record.details.candidate) !== JSON.stringify(candidate)) throw new Error('review-transport-changed');\n", '']],
  'custody-aliased': [
    ['  ledger.records[attemptId] = kanjiDeepFreeze(copy({ attemptId, rawCandidate, context, details }));', '  ledger.records[attemptId] = { attemptId, rawCandidate, context, details };'],
    ['  return { details: copy(details), binding:', '  return { details, binding:'],
  ],
  'capture-replay-by-id': [["      if (JSON.stringify(exposure[known]) === JSON.stringify(help) && JSON.stringify(origins[known]) === JSON.stringify(origin)) {\n", '      if (known >= 0) {\n']],
  'projection-appends': [["  run.attempts[run.cursor].help = [];\n", '']],
  'capture-unvalidated': [['function kanjiCourseRowValid(help) {\n', 'function kanjiCourseRowValid(help) {\n  return true;\n']],
  'snapshot-overwrites': [['  if (Object.hasOwn(ledger.inputs, attemptId)) return;\n', '']],
  'snapshot-after-feedback': [['  if (attempt) kanjiCourseRememberHelp(visit, result.exposure, attempt.attemptId);\n',
    '  if (attempt) kanjiCourseRememberHelp(visit, result.exposure, attempt.attemptId);\n  if (attempt) { delete visit.reviewLedger.inputs[attempt.attemptId]; kanjiCourseSnapshot(visit, attempt.attemptId, kanjiCourseLedgerBefore(visit)); }\n']],
  'rule-unpinned': [['    if (rule.policy !== HELP_RELEVANCE_POLICY) rule = null;\n', '']],
  'projection-rereads-input': [['  for (const help of kept) if (!visit.referenceHelp.some(', '  for (const help of helps) if (!visit.referenceHelp.some(']],
  'batch-unvalidated': [["  if (!kanjiPlainList(helps)) {\n    ledger.unavailable = 'help-batch-invalid';\n    return null;\n  }\n", '']],
  'ledger-per-visit': [['  let ledger = kanjiCourseJourney?.epoch === recordEpoch ? kanjiCourseJourney : null;', '  let ledger = visit.reviewLedger || null;']],
  'history-full-silent': [["  if (KANJI_LEDGER_FULL.includes(ledger?.unavailable)) return { reason: 'review-history-full' };\n", '']],
};
export const R8_EXPECT = {
  'caller-skips-binding-check': ['X1', 'WB'], 'caller-skips-custody': ['X1', 'R1'],
  'custody-trusts-received': ['L1'], 'custody-aliased': ['L1'], 'capture-replay-by-id': ['L2'], 'projection-appends': ['L3'],
  'capture-unvalidated': ['L4'], 'snapshot-overwrites': ['L6'], 'snapshot-after-feedback': ['L6'], 'rule-unpinned': ['I1'],
  'projection-rereads-input': ['L7'], 'batch-unvalidated': ['L7'], 'ledger-per-visit': ['L5'], 'history-full-silent': ['L8'],
};
