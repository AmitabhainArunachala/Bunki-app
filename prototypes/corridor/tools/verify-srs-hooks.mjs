#!/usr/bin/env node
/**
 * Review hooks (HOOKS-SPEC r7, W2 PASS 4fae8c1b; lead 0057, 0128). The five approved rules, proved on the product's
 * srs-core: only a real attempt reschedules; help counts (answer-showing help is Again, other help caps at Hard); "tap
 * when you know" grades only after the reveal and a self-check; a word is graded once a day across every surface,
 * under one Web Lock with a confirmed reservation and owned rollback; leaving costs nothing. Refusals are visible.
 *
 * What is product here: decideReview, validAttempt, trustedSurface, bindTarget, reserveAnswered, releaseAnswered,
 * admitAnswer and refusalWords from prototypes/corridor/srs-core.mjs, with the pinned ts-fsrs scheduler. What is a test
 * model: the in-memory record and deck ledgers, storage, the Web Lock, and the thin surface glue each case uses to call
 * admitAnswer (the corridor adapter's and the deck engines' real glue is proved by their own layer below as it lands).
 *
 * Negative controls: in-memory edits of srs-core.mjs (imported from a data: URL; no disk copies), plus three edits of
 * the test glue for rules that live in surface glue (marked GLUE). Each must turn its named cases red, or this fails.
 *
 * Usage: node verify-srs-hooks.mjs [--no-controls] [--out report.json]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = join(HERE, '..');
const CORE_PATH = join(CORRIDOR, 'srs-core.mjs');
const CORE_SOURCE = readFileSync(CORE_PATH, 'utf8');
const fsrsApi = await import(pathToFileURL(join(CORRIDOR, 'vendor/ts-fsrs.mjs')));
const pin = JSON.parse(readFileSync(join(CORRIDOR, 'data/fsrs-pin.json'), 'utf8'));
const args = process.argv.slice(2);
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const sha = (text) => createHash('sha256').update(text).digest('hex');
const importSource = (text) => import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);

/* ------------------------------------------------------------------ test models (not product) */
class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}
class RefusingStorage extends MemoryStorage { setItem() { throw new Error('storage refused'); } }
class FailingAfter extends MemoryStorage {
  constructor(n) { super(); this.n = n; }
  setItem(k, v) { if (this.n-- <= 0) throw new Error('storage refused'); super.setItem(k, v); }
}
/** a ledger with the three publication outcomes of a real save: failNext 'before' (nothing applied), 'after-ack'
 * (applied, acknowledgment lost), 'uncertain' (applied, then the outcome is unknown); `applied` counts landed grades */
class Ledger {
  constructor() { this.records = new Map(); this.failNext = null; this.applied = 0; }
  read(id) { return this.records.has(id) ? structuredClone(this.records.get(id)) : null; }
  write(id, record) {
    const mode = this.failNext;
    this.failNext = null;
    if (mode === 'before') throw Object.assign(new Error('refused before publication'), { outcome: 'not-published' });
    this.records.set(id, record);
    this.applied += 1;
    if (mode === 'after-ack') return { published: true, acknowledged: false };
    if (mode === 'uncertain') throw Object.assign(new Error('acknowledgment lost'), { outcome: 'uncertain' });
    return { published: true, acknowledged: true };
  }
}
/** navigator.locks, modelled: one holder at a time across every page of the origin */
class Locks {
  constructor() { this.tail = Promise.resolve(); }
  request(name, fn) { const r = this.tail.then(fn); this.tail = r.catch(() => {}); return r; }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

function suite(core, glue = {}) {
  const scheduler = core.createScheduler(fsrsApi, pin);
  const no = (reason) => ({ write: false, reason });
  const D = (s) => new Date(s);
  const DAY = 864e5;
  const MIN = 60e3;
  function reviewCard(firstISO) {
    let card = fsrsApi.createEmptyCard(D(firstISO));
    for (const [t, r] of [[0, 3], [10 * MIN, 3]]) card = scheduler.next(card, new Date(D(firstISO).getTime() + t), r).card;
    return card;
  }
  const CARD = reviewCard('2026-10-10T09:00:00');
  const dueNow = new Date(new Date(CARD.due).getTime() + 3600e3);
  const WORD = { kind: 'word', term: '組織', reading: 'そしき' };
  const T = 'word:組織';
  const json = (x) => JSON.stringify(x);
  const days = (card, now) => Math.round(((new Date(card.due).getTime() - now.getTime()) / DAY) * 10) / 10;
  const clockOf = (when) => (typeof when === 'function' ? when : () => when);

  /* the record owner (model): its srs ledger, taken rows (key → { reading, seq }) and suspended keys */
  const owner = (storage = new MemoryStorage()) => ({ ledger: new Ledger(), taken: new Map(), suspended: new Set(), storage, revlog: [] });
  const enroll = (e, key, card, reading = null, seq = null) => {
    e.taken.set(key, { reading, seq });
    e.ledger.records.set(key, structuredClone(card));
  };
  const seeded = (storage) => {
    const e = owner(storage);
    enroll(e, T, CARD, 'そしき');
    return e;
  };
  /* the owner's facts about the card an item names (the corridor computes sameEntry with sameWordIdentity) */
  function facts(e, item, key) {
    const row = e.taken.get(key);
    if (!row || e.suspended.has(key)) return null;
    const sameEntry = item.kind !== 'word' ? true : item.seq == null ? true : row.seq != null && String(item.seq) === String(row.seq);
    return { enrolled: true, reading: row.reading, sameEntry };
  }
  /** a save's outcome from the write itself (GLUE: the corridor's commitStorePatchOutcome) */
  function publish(ledger, id, record) {
    try {
      const ack = ledger.write(id, record);
      if (glue.falseAckReleases && ack.acknowledged === false) return 'not-published';
      return 'published';
    } catch (err) {
      const outcome = err.outcome || 'uncertain';
      return glue.falseAckReleases && outcome === 'uncertain' ? 'not-published' : outcome;
    }
  }

  /** the hook's commit through the product admitAnswer (GLUE model of the corridor adapter) */
  async function hook(locks, e, evidence, when = dueNow) {
    const res = await core.admitAnswer({
      locks, clock: clockOf(when), storage: e.storage, where: evidence.surface,
      commit: async ({ now, answered, reserve }) => {
        const item = evidence.item;
        const named = evidence.card ?? null;
        const keyOf = item && (item.kind === 'word' ? `word:${item.term}` : `kanji:${item.literal}`);
        const bound = core.bindTarget(item, named, item ? facts(e, item, named ?? keyOf) : null);
        if (bound.refuse) return { outcome: 'not-published', decision: no(bound.refuse) };
        const record = bound.eligible ? e.ledger.read(bound.key) : null;
        const decision = core.decideReview(evidence, record, { now, answered });
        if (!decision.write) return { outcome: 'not-published', decision };
        const identity = item.kind === 'word' ? core.itemIdentity(item) : null;
        await tick(); // another page may run between this page's check and its reservation (two processes, no transaction)
        if (!glue.markAfterPublish && !reserve(identity)) return { outcome: 'not-published', decision: no('mark-unavailable') };
        await tick();
        const outcome = publish(e.ledger, bound.key, scheduler.next(record, core.reviewInstant(record.last_review, now), decision.rating).card);
        if (outcome === 'published') {
          e.revlog.push({ id: bound.key, rating: decision.rating, surface: evidence.surface });
          if (glue.markAfterPublish && identity) core.noteAnswered(e.storage, identity, evidence.surface, now);
          return { outcome, decision };
        }
        return { outcome, decision: no(outcome === 'uncertain' ? 'publish-uncertain' : 'publish-failed') };
      },
    });
    return res.admitted === false ? no(res.reason) : res.decision;
  }
  /** a deck page's word commit through the product admitAnswer (GLUE model of the deck engine): its own due gate, the
   * fresh answered re-check for the card on screen, the reservation, the write */
  async function deck(locks, d, cardId, word, rating, when = dueNow) {
    const where = `deck:${d.id}`;
    const res = await core.admitAnswer({
      locks, clock: clockOf(when), storage: d.storage, where,
      commit: async ({ now, answered, reserve }) => {
        const stored = d.ledger.read(cardId);
        if (!core.servable(stored, now, { learnAhead: true })) return { outcome: 'not-published', result: 'refused' };
        if (core.buriedHere(answered, word.term, word.reading, where)) return { outcome: 'not-published', result: 'answered-elsewhere' };
        const identity = core.wordIdentity(word.term, word.reading);
        await tick(); // another page may run between this page's check and its reservation
        if (!glue.markAfterPublish && !reserve(identity)) return { outcome: 'not-published', result: 'mark-unavailable' };
        await tick();
        const outcome = publish(d.ledger, cardId, scheduler.next(stored, now, rating).card);
        if (outcome === 'published' && glue.markAfterPublish) core.noteAnswered(d.storage, identity, where, now);
        return { outcome, result: outcome === 'published' ? 'graded' : outcome === 'uncertain' ? 'save-uncertain' : 'save-failed' };
      },
    });
    return res.admitted === false ? res.reason : res.result;
  }
  const deckOf = (storage, id = 'n2') => {
    const d = { id, ledger: new Ledger(), storage };
    d.ledger.records.set(`${id}:組織`, structuredClone(CARD));
    return d;
  };
  /** GLUE model of a quest's leave path: an item drawn but never attempted was only seen */
  const questLeave = (quest) => quest.drawn.filter((d) => !quest.attempted.includes(d.id)).map((d) =>
    glue.abandonPenalty
      ? { item: d.item, surface: `quest:${quest.id}`, kind: 'attempt', tests: 'reading', revealed: true, answer: { rating: 1 } }
      : { item: d.item, surface: `quest:${quest.id}`, kind: 'seen' });
  const attempt = (surface, extra) => ({ item: WORD, surface, kind: 'attempt', tests: 'reading', revealed: true, ...extra });
  const L = () => new Locks();

  const cases = [];
  const check = async (id, rule, fn) => {
    try {
      cases.push({ id, rule, pass: true, detail: await fn() });
    } catch (err) {
      cases.push({ id, rule, pass: false, error: err.message.split('\n')[0] });
    }
  };

  return (async () => {
    /* rule 1 */
    await check('P1', 1, async () => {
      const e = seeded();
      const before = json(e.ledger.records.get(T));
      const locks = L();
      for (const kind of ['seen', 'opened', 'saved', 'built']) await hook(locks, e, { item: WORD, surface: 'world:loom', kind });
      await hook(locks, e, { item: WORD, surface: 'ride:shiki', kind: 'seen', answer: { rating: 3 } });
      assert.equal(json(e.ledger.records.get(T)), before, 'the schedule record must not change');
      assert.equal(e.ledger.applied, 0);
      assert.equal(e.storage.getItem(core.ANSWERED_KEY), null);
      return 'seen, opened, saved, built and ride-watching: nothing written';
    });
    await check('P2', 1, async () => {
      const e = seeded();
      const d = await hook(L(), e, attempt('quest:q1', { answer: { rating: 3 } }));
      assert.deepEqual(d, { write: true, rating: 3, from: 3, capped: false });
      assert.equal(e.ledger.applied, 1);
      for (const r of [1, 2, 3, 4]) assert.equal(json(scheduler.next(CARD, dueNow, r).card), json(scheduler.repeat(CARD, dueNow)[r].card));
      return `unaided Good committed once (next due in ${days(e.ledger.records.get(T), dueNow)} days); next() equals the corridor's repeat()[r]`;
    });
    await check('P9', 1, async () => {
      const e = seeded();
      assert.deepEqual(await hook(L(), e, { item: { kind: 'kanji', literal: '戠' }, surface: 'room:parts', kind: 'attempt', tests: 'form', revealed: true, answer: { rating: 3 } }), no('no-schedule'));
      e.suspended.add(T);
      assert.deepEqual(await hook(L(), e, attempt('quest:q1', { answer: { rating: 3 } })), no('no-schedule'));
      assert.equal(e.ledger.applied, 0);
      return 'a part with no card, and a suspended card: no-schedule, nothing written';
    });
    await check('P14', 1, async () => {
      const e = seeded();
      enroll(e, 'word:記憶', CARD, 'きおく');
      const locks = L();
      assert.deepEqual(await hook(locks, e, { ...attempt('quest:q1', { answer: { rating: 3 } }), item: { kind: 'word', term: '記憶', reading: 'きおく' }, card: T }), no('target-mismatch'));
      assert.deepEqual(await hook(locks, e, attempt('quest:q1', { item: { kind: 'word', term: '組織', reading: 'くみおり' }, answer: { rating: 3 } })), no('target-mismatch'));
      assert.equal(e.ledger.applied, 0);
      assert.equal(e.storage.getItem(core.ANSWERED_KEY), null);
      assert.equal((await hook(locks, e, { ...attempt('quest:q1', { answer: { rating: 3 } }), card: T })).write, true);
      const f = owner();
      enroll(f, 'word:生', CARD, 'なま', '1590240');
      assert.deepEqual(await hook(L(), f, attempt('quest:q2', { item: { kind: 'word', term: '生', reading: 'なま', seq: '2001930' }, answer: { rating: 3 } })), no('target-mismatch'));
      assert.equal((await hook(L(), f, attempt('quest:q2', { item: { kind: 'word', term: '生', reading: 'なま', seq: '1590240' }, answer: { rating: 3 } }))).write, true);
      return 'another card, another reading, or another dictionary entry: target-mismatch, nothing written; the matching card and entry grade';
    });
    /* rule 2 */
    await check('P3', 2, async () => {
      const e = seeded();
      assert.deepEqual(await hook(L(), e, attempt('quest:q1', { answer: { rating: 3 }, help: [{ what: 'reading', about: WORD, reveals: ['reading'] }] })), { write: true, rating: 1, from: 3, capped: true });
      assert.equal(e.ledger.records.get(T).state, core.RELEARNING);
      assert.equal((await hook(L(), seeded(), attempt('quest:q1', { answer: { rating: 4 }, help: [{ what: 'part-name', about: WORD, reveals: ['form'] }, { what: 'reading', reveals: ['reading'] }] }))).rating, 1);
      assert.equal((await hook(L(), seeded(), attempt('quest:q1', { answer: { rating: 3 }, help: [{ what: 'audio', reveals: ['reading'] }] }))).rating, 1);
      assert.equal((await hook(L(), seeded(), attempt('quest:q1', { answer: { rating: 3 }, help: [{ what: 'reading', about: { kind: 'word', term: '記憶', reading: 'きおく' }, reveals: ['reading'] }] }))).rating, 2);
      return 'answer-showing help → Again (outranks other help and Easy; audio of the tested reading counts); a neighbour’s reading → Hard';
    });
    await check('P4', 2, async () => {
      const e = seeded();
      assert.deepEqual(await hook(L(), e, attempt('room:sound', { answer: { rating: 4 }, help: [{ what: 'part-name', about: WORD, reveals: ['form'] }] })), { write: true, rating: 2, from: 4, capped: true });
      assert.ok(new Date(e.ledger.records.get(T).due) < new Date(scheduler.next(CARD, dueNow, 3).card.due));
      const t = dueNow.getTime();
      assert.deepEqual(await hook(L(), seeded(), attempt('quest:q1', { answer: { rating: 3 }, answeredAt: t, help: [{ what: 'reading', about: WORD, reveals: ['reading'], at: t + 4000 }] })), { write: true, rating: 3, from: 3, capped: false });
      return 'other help caps Easy at Hard; help after the answer changes nothing';
    });
    await check('P5', 2, async () => {
      const e = seeded();
      const early = new Date(new Date(CARD.last_review).getTime() + DAY);
      assert.ok(early < new Date(CARD.due) && core.dayOf(early) !== core.dayOf(new Date(CARD.last_review)));
      assert.deepEqual(await hook(L(), e, attempt('quest:q1', { tests: 'meaning', answer: { rating: 3 }, help: [{ what: 'gloss', reveals: ['meaning'] }] }), early), no('not-due'));
      assert.deepEqual(await hook(L(), e, { item: { kind: 'word', term: '幟', reading: 'のぼり' }, surface: 'quest:q1', kind: 'attempt', tests: 'reading', revealed: true, answer: { rating: 3 } }, early), no('no-schedule'));
      assert.equal(e.ledger.applied, 0);
      assert.equal(e.storage.getItem(core.ANSWERED_KEY), null);
      return 'helped attempts on a card not due and on an unscheduled word: nothing written';
    });
    await check('P13', 2, async () => {
      const e = seeded();
      const t = dueNow.getTime();
      const shown = [{ what: 'reading', about: WORD, reveals: ['reading'] }];
      const locks = L();
      for (const ev of [
        attempt('quest:q1', { tests: undefined, answer: { rating: 4 }, help: shown }),
        attempt('quest:q1', { tests: 'sound', answer: { rating: 4 }, help: shown }),
        attempt('quest:q1', { answer: { rating: 3 }, help: [{ what: 'reading', reveals: ['sound'] }] }),
        attempt('quest:q1', { answer: { rating: 3 }, help: 'reading' }),
        attempt('quest:q1', { answeredAt: NaN, answer: { rating: 4 }, help: [{ what: 'reading', about: WORD, reveals: ['reading'], at: t - 1000 }] }),
        attempt('quest:q1', { answeredAt: Infinity, answer: { rating: 3 } }),
        attempt('quest:q1', { answer: { rating: 5 } }),
        attempt('quest:q1', { answer: { selfCheck: 'maybe' } }),
        attempt('quest:q1', { answer: { rating: 3, claim: true } }),
        attempt('quest:q1', { revealed: 'yes', answer: { rating: 3 } }),
      ]) assert.deepEqual(await hook(locks, e, ev), no('invalid-task'));
      assert.deepEqual(await hook(locks, e, { ...attempt('quest:q1', { answer: { rating: 3 } }), item: { kind: 'word', term: '組織' } }), no('invalid-task'));
      for (const surface of ['deck:n2', 'corridor', 'course', 'lesson:N5-1', 'quest:', 'world:loom quarter', undefined, 'course:../deck', 'course:a\u0000b', 'course:a/b', 'quest:.x', 'room:a..b', `ride:${'x'.repeat(65)}`, 'world:a\\b']) {
        assert.deepEqual(await hook(locks, e, attempt(surface, { answer: { rating: 3 } })), no('untrusted-surface'), `surface ${JSON.stringify(surface)}`);
      }
      assert.equal(e.ledger.applied, 0);
      for (const ok of ['course:shiki', 'quest:q1', 'world:織の街', 'room:sound-2', 'ride:line_1.a']) assert.equal(core.trustedSurface(ok), true, ok);
      return 'malformed facet, help, answer, item, a NaN or infinite answer time, a non-boolean reveal: invalid-task; unknown or unsafe surfaces (../, NUL, /, \\, leading dot, .., over 64): untrusted-surface; nothing written; safe ids pass';
    });
    /* rule 3 */
    await check('P6', 3, async () => {
      const e = seeded();
      const locks = L();
      const ride = (extra) => hook(locks, e, { item: WORD, surface: 'ride:shiki', kind: 'attempt', tests: 'meaning', ...extra });
      assert.deepEqual(await ride({ answer: { claim: true } }), no('claim-without-check'));
      assert.deepEqual(await ride({ answer: { selfCheck: 'knew' } }), no('claim-without-check'));
      assert.deepEqual(await ride({ revealed: true }), no('no-answer'));
      assert.deepEqual(await ride({ answer: { rating: 3 } }), no('claim-without-check'));
      assert.equal(e.ledger.applied, 0);
      assert.equal((await ride({ revealed: true, answer: { selfCheck: 'knew' } })).rating, 3);
      assert.deepEqual(await ride({ revealed: true, answer: { selfCheck: 'knew' } }), no('answered-today'));
      assert.equal((await hook(L(), seeded(), { item: WORD, surface: 'ride:shiki', kind: 'attempt', tests: 'meaning', revealed: true, answer: { selfCheck: 'missed' } })).rating, 1);
      return 'a tap, a self-check or rating before the reveal, the reveal alone: nothing written; reveal + knew → Good once; missed → Again';
    });
    /* rule 4 */
    await check('P7', 4, async () => {
      const e = seeded();
      core.noteAnswered(e.storage, core.wordIdentity('組織', 'ソシキ'), 'deck:n2', dueNow);
      assert.deepEqual(await hook(L(), e, attempt('world:loom', { answer: { rating: 3 } })), no('answered-today'));
      const f = seeded();
      const locks = L();
      await hook(locks, f, attempt('quest:q1', { answer: { rating: 1 } }));
      const soon = new Date(dueNow.getTime() + 20 * MIN);
      assert.equal(core.servable(f.ledger.records.get(T), soon), true);
      assert.deepEqual(await hook(locks, f, attempt('room:sound', { answer: { rating: 3 } }), soon), no('answered-today'));
      const lastSecond = D(`${core.dayOf(dueNow)}T23:59:59`);
      assert.deepEqual(await hook(locks, f, attempt('world:loom', { answer: { rating: 3 } }), lastSecond), no('answered-today'));
      assert.equal((await hook(locks, f, attempt('world:loom', { answer: { rating: 3 } }), new Date(lastSecond.getTime() + 2000))).write, true);
      const c = seeded();
      assert.equal((await hook(locks, c, attempt('course:shiki', { answer: { rating: 1 } }))).write, true);
      assert.deepEqual(await hook(locks, c, attempt('course:shiki', { answer: { rating: 1 } }), soon), no('answered-today'));
      return 'a katakana alias blocks the world; after an Again a room is refused; 23:59:59 refused, 00:00:01 graded; course under the same cap';
    });
    await check('P8', 4, async () => {
      const e = owner();
      enroll(e, 'kanji:織', CARD);
      core.noteAnswered(e.storage, core.wordIdentity('織物', 'おりもの'), 'deck:n2', dueNow);
      const locks = L();
      const k = (surface, now) => hook(locks, e, { item: { kind: 'kanji', literal: '織' }, surface, kind: 'attempt', tests: 'form', revealed: true, answer: { rating: 1 } }, now);
      assert.equal((await k('world:loom', dueNow)).write, true);
      assert.deepEqual(await k('quest:q2', new Date(dueNow.getTime() + 20 * MIN)), no('answered-today'));
      assert.equal(Object.keys(core.answeredToday(e.storage, dueNow)).length, 1);
      return 'a kanji is not blocked by a word and grades once a day by its own last review; it marks no word';
    });
    await check('P12', 4, async () => {
      const e = seeded();
      const locks = L();
      const [a, b] = await Promise.all([hook(locks, e, attempt('quest:q1', { answer: { rating: 3 } })), hook(locks, e, attempt('world:loom', { answer: { rating: 4 } }))]);
      assert.equal([a, b].filter((d) => d.write).length, 1);
      assert.equal(e.ledger.applied, 1);
      return 'two hook attempts on one card issued at once: decided inside the admission, one grade';
    });
    await check('P15', 4, async () => {
      const run = async (order) => {
        const storage = new MemoryStorage();
        const world = seeded(storage);
        const dk = deckOf(storage);
        const locks = L();
        const surface = order.endsWith('course') ? 'course:shiki' : 'quest:q1';
        const w = () => hook(locks, world, attempt(surface, { answer: { rating: 3 } }));
        const k = () => deck(locks, dk, 'n2:組織', WORD, 3);
        if (order.startsWith('world-then-deck')) { await w(); await k(); }
        else await Promise.all([w(), k()]);
        return world.ledger.applied + dk.ledger.applied;
      };
      assert.equal(await run('world-then-deck'), 1);
      assert.equal(await run('world-then-deck-course'), 1);
      for (let i = 0; i < 5; i++) assert.equal(await run(i % 2 ? 'simultaneous-course' : 'simultaneous'), 1);
      return 'a deck card on screen while a quest or course grades is refused; hook and deck at once (×5) give one grade';
    });
    await check('P16', 4, async () => {
      const refusing = new RefusingStorage();
      const L1 = L();
      assert.deepEqual(await hook(L1, seeded(refusing), attempt('quest:q1', { answer: { rating: 3 } })), no('mark-unavailable'));
      assert.equal(await deck(L1, deckOf(refusing), 'n2:組織', WORD, 3), 'mark-unavailable');
      assert.deepEqual(await hook(null, seeded(), attempt('quest:q1', { answer: { rating: 3 } })), no('no-shared-admission'));
      assert.equal(await deck(null, deckOf(new MemoryStorage()), 'n2:組織', WORD, 3), 'no-shared-admission');
      const s3 = new MemoryStorage();
      const w3 = seeded(s3);
      const L3 = L();
      w3.ledger.failNext = 'before';
      assert.deepEqual(await hook(L3, w3, attempt('quest:q1', { answer: { rating: 3 } })), no('publish-failed'));
      assert.deepEqual(core.answeredToday(s3, dueNow), {});
      assert.equal(await deck(L3, deckOf(s3), 'n2:組織', WORD, 3), 'graded');
      const s4 = new FailingAfter(1);
      const w4 = seeded(s4);
      const d4 = deckOf(s4);
      const L4 = L();
      w4.ledger.failNext = 'before';
      assert.deepEqual(await hook(L4, w4, attempt('quest:q1', { answer: { rating: 3 } })), no('publish-failed'));
      assert.equal(await deck(L4, d4, 'n2:組織', WORD, 3), 'answered-elsewhere');
      assert.equal(w4.ledger.applied + d4.ledger.applied, 0);
      return 'a refused mark → no grade; no Web Locks → nothing; a failed publication releases its own reservation; a refused release leaves the word resting; never two grades';
    });
    await check('P17', 4, async () => {
      const storage = new MemoryStorage();
      const dk = deckOf(storage);
      const world = seeded(storage);
      const locks = L();
      assert.equal(await deck(locks, dk, 'n2:組織', WORD, 1), 'graded');
      const soon = new Date(dueNow.getTime() + 20 * MIN);
      dk.ledger.failNext = 'before';
      assert.equal(await deck(locks, dk, 'n2:組織', WORD, 3, soon), 'save-failed');
      assert.deepEqual(core.answeredToday(storage, soon), { [core.wordIdentity('組織', 'そしき')]: ['deck:n2'] });
      assert.deepEqual(await hook(locks, world, attempt('quest:q1', { answer: { rating: 3 } }), soon), no('answered-today'));
      assert.equal(await deck(locks, dk, 'n2:組織', WORD, 3, new Date(soon.getTime() + MIN)), 'graded');
      return 'W2’s 0125 sequence: an earlier successful mark survives a failed home step; the quest is refused; the home step still grades';
    });
    await check('P18', 4, async () => {
      const run = async (mode) => {
        const storage = new MemoryStorage();
        const world = seeded(storage);
        const dk = deckOf(storage);
        const locks = L();
        world.ledger.failNext = mode;
        const w = await hook(locks, world, attempt('quest:q1', { answer: { rating: 3 } }));
        const k = await deck(locks, dk, 'n2:組織', WORD, 3);
        return { w, k, landed: world.ledger.applied + dk.ledger.applied };
      };
      const lost = await run('after-ack');
      assert.equal(lost.w.write, true);
      assert.equal(lost.k, 'answered-elsewhere');
      assert.equal(lost.landed, 1);
      const unknown = await run('uncertain');
      assert.deepEqual(unknown.w, no('publish-uncertain'));
      assert.equal(unknown.k, 'answered-elsewhere');
      assert.equal(unknown.landed, 1);
      const refusedRun = await run('before');
      assert.deepEqual(refusedRun.w, no('publish-failed'));
      assert.equal(refusedRun.k, 'graded');
      assert.equal(refusedRun.landed, 1);
      return 'published with the acknowledgment lost keeps the mark; uncertain keeps the reservation; confirmed not-published releases its own; never two';
    });
    await check('P19', 4, async () => {
      const storage = new MemoryStorage();
      const world = seeded(storage);
      const dk = deckOf(storage);
      const dk2 = deckOf(storage, 'n1');
      const locks = L();
      const midnight = D(`${core.dayOf(dueNow)}T23:59:59.999`).getTime() + 1;
      let t = midnight - 50;
      const clock = () => new Date(t);
      const d1 = deck(locks, dk, 'n2:組織', WORD, 3, new Date(midnight + 50));
      const w1 = hook(locks, world, attempt('quest:q1', { answer: { rating: 3 } }), clock);
      t = midnight + 50;
      assert.equal(await d1, 'graded');
      assert.deepEqual(await w1, no('answered-today'));
      t = midnight + 100;
      assert.equal(await deck(locks, dk2, 'n1:組織', WORD, 3, clock), 'answered-elsewhere');
      assert.equal(world.ledger.applied + dk.ledger.applied + dk2.ledger.applied, 1);
      return 'midnight while waiting for the lock: the day is sampled inside the admission; the new day’s key survives; one grade';
    });
    await check('P20', 4, async () => {
      for (const surface of ['world:loom', 'quest:q1', 'room:sound', 'ride:shiki', 'course:shiki']) {
        const d = await hook(null, seeded(), attempt(surface, { answer: { rating: 3 } }));
        assert.deepEqual(d, no('no-shared-admission'), surface);
        for (const lang of ['en', 'ja']) assert.ok((core.refusalWords(d.reason, lang) || '').length > 20, `${surface} ${lang}`);
      }
      assert.equal(await deck(null, deckOf(new MemoryStorage()), 'n2:組織', WORD, 3), 'no-shared-admission');
      for (const reason of ['no-shared-admission', 'mark-unavailable', 'publish-failed', 'publish-uncertain']) {
        for (const lang of ['en', 'ja']) assert.ok(core.refusalWords(reason, lang), `${reason} ${lang}`);
      }
      assert.ok(!/won’t change|didn’t change/.test(core.refusalWords('publish-uncertain', 'en')));
      assert.equal(core.refusalWords('answered-today', 'en'), null);
      return 'without Web Locks every hook surface and the deck refuse with an English and a Japanese line; the uncertain line never claims the schedule is unchanged';
    });
    await check('P21', 4, async () => {
      const storage = new MemoryStorage();
      const dk = deckOf(storage);
      const world = seeded(storage);
      const locks = L();
      dk.ledger.failNext = 'uncertain';
      assert.equal(await deck(locks, dk, 'n2:組織', WORD, 1), 'save-uncertain');
      const soon = new Date(dueNow.getTime() + 20 * MIN);
      assert.equal(await deck(locks, dk, 'n2:組織', WORD, 3, soon), 'graded');
      assert.deepEqual(await hook(locks, world, attempt('quest:q1', { answer: { rating: 3 } }), soon), no('answered-today'));
      const en = core.refusalWords('publish-uncertain', 'en');
      const ja = core.refusalWords('publish-uncertain', 'ja');
      assert.ok(!/today|again/i.test(en) && !/今日|もう採点/.test(ja));
      assert.ok(/couldn’t confirm/.test(en) && /practis/.test(en) && /確かめられません/.test(ja) && /練習/.test(ja));
      return 'W2’s 0150 sequence: after an uncertain deck Again the home step grades and the quest is refused; the uncertain line promises nothing about today';
    });
    /* rule 5 */
    await check('P10', 5, async () => {
      const e = seeded();
      const locks = L();
      for (const ev of questLeave({ id: 'q3', drawn: [{ id: T, item: WORD }], attempted: [] })) await hook(locks, e, ev);
      assert.equal(e.ledger.applied, 0);
      assert.equal(e.storage.getItem(core.ANSWERED_KEY), null);
      return 'a quest left unattempted writes nothing';
    });
    await check('P11', 5, async () => {
      const e = seeded();
      const locks = L();
      await hook(locks, e, attempt('quest:q4', { answer: { rating: 3 } }));
      const committed = json(e.ledger.records.get(T));
      for (const ev of questLeave({ id: 'q4', drawn: [{ id: T, item: WORD }], attempted: [T] })) await hook(locks, e, ev);
      assert.equal(json(e.ledger.records.get(T)), committed);
      assert.deepEqual(await hook(locks, e, attempt('quest:q4', { answer: { rating: 4 } }), new Date(dueNow.getTime() + 5 * MIN)), no('answered-today'));
      assert.equal(e.ledger.applied, 1);
      return 'graded, left, back the same day: the grade stays, the re-entry is refused';
    });
    return cases;
  })();
}

/* ------------------------------------------------------------------ negative controls */
const CORE_MUTANTS = {
  'grade-passive': [
    ["if (!plainObject(evidence) || evidence.kind !== 'attempt') return refused('evidence-only');", "if (!plainObject(evidence)) return refused('evidence-only');"],
    ["if (!validAttempt(evidence)) return refused('invalid-task');", "if (evidence.kind === 'attempt' && !validAttempt(evidence)) return refused('invalid-task');"],
    ["  } else return refused('no-answer');", '  } else rating = 3;'],
  ],
  'trust-target': [
    ["if (named != null && named !== key) return { refuse: 'target-mismatch' };", 'if (named != null && named !== key) return { key: named, eligible: true };'],
    ["if (item.kind === 'word' && (wordIdentity(item.term, card.reading) !== itemIdentity(item) || card.sameEntry === false)) {", 'if (false) {'],
  ],
  'open-surface': [["const HOOK_SURFACE = /^(world|quest|room|ride|course):(?!.*\\.\\.)[\\p{L}\\p{N}][\\p{L}\\p{N}._-]{0,63}$/u;", 'const HOOK_SURFACE = /^.+$/u;']],
  'ignore-help': [['const help = (evidence.help || []).filter(', 'const help = [].filter(']],
  'late-help-counts': [['.filter((h) => evidence.answeredAt == null || h.at == null || h.at <= evidence.answeredAt);', '.filter(() => true);']],
  'facet-optional': [['!validItem(evidence.item) || !FACETS.includes(evidence.tests) ||', '!validItem(evidence.item) ||']],
  'loose-time': [['  if (evidence.answeredAt != null && !Number.isFinite(evidence.answeredAt)) return false;\n', '']],
  'trust-tap': [
    ["  if (answer.claim) return refused('claim-without-check');\n  if (answer.selfCheck) {", '  if (answer.claim) rating = 3;\n  else if (answer.selfCheck) {'],
    ["    if (!evidence.revealed) return refused('claim-without-check');\n    rating = answer.rating;", '    rating = answer.rating;'],
  ],
  'reveal-is-recall': [["  } else return refused('no-answer');", "  } else if (evidence.revealed) rating = 3;\n  else return refused('no-answer');"]],
  'no-day-cap': [
    ["  if (gradedToday(record, now)) return refused('answered-today');\n", ''],
    ["  if (evidence.item.kind === 'word' && (answered[itemIdentity(evidence.item)] || []).length) return refused('answered-today');\n", ''],
  ],
  'stale-commit': [
    ['  return locks.request(ANSWER_LOCK, async () => {\n    const now = clock();', '  const early = answeredToday(storage, clock());\n  return locks.request(ANSWER_LOCK, async () => {\n    const now = clock();'],
    ['commit({ now, answered: answeredToday(storage, now), reserve })', 'commit({ now, answered: early, reserve })'],
  ],
  'no-shared-boundary': [['  return locks.request(ANSWER_LOCK, async () => {', '  return (async (run) => run())(async () => {']],
  'unlocked-fallback': [["  if (!locks || typeof locks.request !== 'function') return { admitted: false, reason: 'no-shared-admission' };", "  if (!locks || typeof locks.request !== 'function') locks = { request: (name, run) => run() };"]],
  'release-any': [["if (result.outcome === 'not-published' && reservation?.inserted)", "if (result.outcome === 'not-published' && reservation)"]],
  'uncertain-releases': [["if (result.outcome === 'not-published' && reservation?.inserted)", "if ((result.outcome === 'not-published' || result.outcome === 'uncertain') && reservation?.inserted)"]],
  'loose-id': [["const HOOK_SURFACE = /^(world|quest|room|ride|course):(?!.*\\.\\.)[\\p{L}\\p{N}][\\p{L}\\p{N}._-]{0,63}$/u;", 'const HOOK_SURFACE = /^(world|quest|room|ride|course):[^\\s:]+$/u;']],
  'stale-clock': [['  return locks.request(ANSWER_LOCK, async () => {\n    const now = clock();', '  const now = clock();\n  return locks.request(ANSWER_LOCK, async () => {']],
  'silent-refusal': [['  const words = REFUSAL_WORDS[reason];\n  return words ?', '  const words = null;\n  return words ?']],
  'banning-uncertain-line': [
    ["    en: 'We couldn’t confirm this answer was saved. You can keep practising.',", "    en: 'We couldn’t confirm this answer was saved. This card won’t be graded again today; you can keep practising.',"],
    ["    ja: 'この答えが保存されたか確かめられませんでした。このまま練習を続けられます。',", "    ja: 'この答えが保存されたか確かめられませんでした。この札は今日はもう採点されませんが、練習は続けられます。',"],
  ],
};
/** rules that live in surface glue: proved here on the test glue, and on the product glue by its own layer */
const GLUE_MUTANTS = {
  'mark-after-publish': { markAfterPublish: true },
  'false-ack-releases': { falseAckReleases: true },
  'abandon-penalty': { abandonPenalty: true },
};
const EXPECT = {
  'grade-passive': ['P1'], 'trust-target': ['P14'], 'open-surface': ['P13'], 'ignore-help': ['P3', 'P4'], 'late-help-counts': ['P4'],
  'facet-optional': ['P13'], 'loose-time': ['P13'], 'trust-tap': ['P6'], 'reveal-is-recall': ['P6'], 'no-day-cap': ['P7', 'P8'],
  'stale-commit': ['P15'], 'no-shared-boundary': ['P15'], 'unlocked-fallback': ['P16', 'P20'], 'release-any': ['P17'],
  'uncertain-releases': ['P18'], 'loose-id': ['P13'], 'stale-clock': ['P19'], 'silent-refusal': ['P20'],
  'banning-uncertain-line': ['P21'], 'mark-after-publish': ['P16'], 'false-ack-releases': ['P18'], 'abandon-penalty': ['P10'],
};

function mutate(source, edits, name) {
  let out = source;
  for (const [find, replace] of edits) {
    const at = out.indexOf(find);
    if (at < 0 || out.indexOf(find, at + 1) >= 0) throw new Error(`control ${name}: its edit does not match srs-core exactly once (${find.slice(0, 60)}…)`);
    out = out.replace(find, replace);
  }
  return out;
}

const core = await import(pathToFileURL(CORE_PATH));
const baseline = await suite(core);
const report = {
  format: 'kairo-srs-hooks-verification',
  spec: { path: 'one-hand/SRS/HOOKS-SPEC.md', sha256: '4fae8c1b14f844e6d6491fe4c3e7b520280f568f12ad1260ed4a02c902198a20', verdict: 'W2 PASS (design model), 2026-10-21T02:01' },
  sources: { 'srs-core.mjs': sha(CORE_SOURCE), 'vendor/ts-fsrs.mjs': sha(readFileSync(join(CORRIDOR, 'vendor/ts-fsrs.mjs'))), 'data/fsrs-pin.json': sha(readFileSync(join(CORRIDOR, 'data/fsrs-pin.json'))) },
  scope: 'product srs-core decisions, binding, reservation, admission order and refusal words; in-memory ledgers, storage and lock; surface glue modelled (GLUE controls) until the corridor and deck layers land',
  node: process.version,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  cases: baseline,
  controls: [],
};
for (const c of baseline) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} (rule ${c.rule}) ${c.pass ? c.detail : c.error}`);
let ok = baseline.every((c) => c.pass);
if (!args.includes('--no-controls')) {
  for (const [name, edits] of Object.entries(CORE_MUTANTS)) {
    const mutated = await importSource(mutate(CORE_SOURCE, edits, name));
    const failed = (await suite(mutated)).filter((c) => !c.pass).map((c) => c.id);
    const caught = EXPECT[name].every((id) => failed.includes(id));
    report.controls.push({ name, layer: 'srs-core', failed, expected: EXPECT[name], caught });
    console.log(`${caught ? 'CAUGHT' : 'MISSED'} control ${name}: red ${failed.join(', ') || 'none'} (expects ${EXPECT[name].join(', ')})`);
    ok &&= caught;
  }
  for (const [name, glue] of Object.entries(GLUE_MUTANTS)) {
    const failed = (await suite(core, glue)).filter((c) => !c.pass).map((c) => c.id);
    const caught = EXPECT[name].every((id) => failed.includes(id));
    report.controls.push({ name, layer: 'glue', failed, expected: EXPECT[name], caught });
    console.log(`${caught ? 'CAUGHT' : 'MISSED'} control ${name} (GLUE): red ${failed.join(', ') || 'none'} (expects ${EXPECT[name].join(', ')})`);
    ok &&= caught;
  }
}
report.status = ok ? 'passed' : 'failed';
report.passed = baseline.filter((c) => c.pass).length;
report.total = baseline.length;
if (outPath) writeFileSync(outPath, `${JSON.stringify(report, null, 1)}\n`);
console.log(`${report.passed}/${report.total} cases · ${report.controls.filter((c) => c.caught).length}/${report.controls.length} controls caught · ${report.status}`);
process.exitCode = ok ? 0 : 1;
