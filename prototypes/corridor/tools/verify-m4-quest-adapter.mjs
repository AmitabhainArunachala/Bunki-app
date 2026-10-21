/** M4 S2 (lead 1835; W5 931f3c55, 1746, 1750; UX r4.2 §2.1–§3.3): the quest adapter over the S1 lifecycle, in Node. The real
 * record host, app and lifecycle (verify-m4-goal-bridge.mjs harness), the real kanji-course.js runs, and synthetic records only.
 * stdout only; no files are written.
 *   node tools/verify-m4-quest-adapter.mjs --modules=<dir> [--case=<id>] [--mutants]
 */
import assert from 'node:assert/strict';
import { readFileSync, statfsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load, memoryController, RECORD } from './verify-journey-record.mjs';
import { lifecycleOn, activeDay, closeGateDuring, journeyRows, must } from './verify-m4-goal-bridge.mjs';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const floor = () => { const s = statfsSync(DIR); assert.ok(s.bavail * s.bsize >= 1.2 * 1024 ** 3, 'DISK STOP: below 1.2 GiB'); };
const course = createRequire(import.meta.url)('../kanji-course.js');
export const ADAPTER = readFileSync(resolve(DIR, 'm4-quest.mjs'), 'utf8');
const adapterFrom = (text) => import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));

const OCCURRENCE = Object.freeze({ article: 'bunki-essay-n1-city', token: 26, span: [24, 41] });
let clock = Date.parse('2026-10-22T09:00:00+09:00'), serial = 0;
const at = () => ++clock;
const session = () => `quest-session-${++serial}`;
const runFor = (targets, mode = 'preview') => course.createRun('shiki-shoku', { mode, sessionId: session(), ...(targets ? { targets } : {}) });
/** act on the current prompt: right/wrong answers get feedback; a self-check of 'knew' or 'missed' follows when asked */
function step(run, how, check) {
  const attempt = course.currentAttempt(run), prompt = course.currentPrompt(run), meta = { attemptId: attempt.attemptId, at: at() };
  if (how === 'reveal') return course.reveal(run, meta);
  if (how === 'skip') return course.skip(run, meta);
  const value = how === 'right' ? (prompt.kind === 'reading' ? prompt.acceptedAnswers[0] : prompt.answerId)
    : (prompt.kind === 'reading' ? 'あああ' : prompt.choices.find((c) => c.id !== prompt.answerId).id);
  let next = course.showFeedback(course.answer(run, value, meta), attempt.attemptId, at());
  if (check) next = course.selfCheck(next, attempt.attemptId, check, at());
  return next;
}
const lastCheck = (run, check = 'knew') => course.selfCheck(run, run.attempts.at(-1).attemptId, check, at());
/** a qualified Reading run: 職業 right + knew, 知識 wrong + missed, 組織 right + knew */
const qualified = (run) => step(step(step(run, 'right', 'knew'), 'wrong', 'missed'), 'right', 'knew');

async function day(m, controller) {
  const d = await activeDay(m, controller), q = await adapterFrom(m.adapterText ?? ADAPTER);
  return { ...d, q, state: q.createQuestState(), seed: q.questSeed(OCCURRENCE) };
}
const root = (d) => d.lc.inspect().root;
const created = async (d, seed = d.seed) => {
  const out = await must(() => d.q.createQuest(d.lc, d.state, seed), 'the create');
  assert.equal(out.kind, 'published', `create: ${out.kind} ${out.reason || ''}`);
  return out.goalId;
};

export const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

test('Q1', 'a quest is one goal per occurrence with its exact seed; a second create for it is a no-write', async (m) => {
  const d = await day(m), commits = d.c.state.commits;
  const id = await created(d);
  const goal = root(d).goals.find((g) => g.id === id);
  assert.deepEqual([goal.status, goal.practiceSession, goal.inspected], ['unfinished', null, false]);
  assert.ok(d.q.sameSeed(goal.seed, { kind: 'reading', sourceOccurrence: OCCURRENCE }));
  assert.equal(d.c.state.commits, commits + 1);
  const again = await d.q.createQuest(d.lc, d.state, d.seed);
  assert.deepEqual([again.kind, again.goalId], ['exists', id]); assert.equal(d.c.state.commits, commits + 1);
});
test('Q2', 'only a Reading run started after the quest binds it: a quest made after the run started stays out, and Meaning and mixed runs bind nothing', async (m) => {
  const d = await day(m), a = await created(d);
  assert.equal(d.q.bindRun(d.state, d.lc, runFor(['meaning'])), null);
  assert.equal(d.q.bindRun(d.state, d.lc, runFor()), null, 'the mixed run binds nothing');
  const run = runFor(['reading']);
  assert.deepEqual(d.q.bindRun(d.state, d.lc, run)?.goals.map((g) => g.id), [a]);
  const b = await created(d, d.q.questSeed({ ...OCCURRENCE, token: 27 }));
  assert.equal(d.q.bindingFor(d.state, b), null, 'a quest made after the run started is not bound to it');
  assert.equal(d.q.bindingFor(d.state, a)?.sessionId, run.sessionId);
  const results = await d.q.settleRun(d.lc, d.state, qualified(run), { course });
  assert.deepEqual(results.map((r) => r.goalId), [a]);
  assert.equal(root(d).goals.find((g) => g.id === b).status, 'unfinished');
});
test('Q3', 'at the last self-check the bound quest completes, then retires as its own write; a wrong answer with an honest self-check counts', async (m) => {
  const d = await day(m), id = await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  const done = qualified(run), before = journeyRows(d.c).length;
  const results = await d.q.settleRun(d.lc, d.state, done, { course });
  assert.deepEqual(results.map((r) => [r.goalId, r.complete.kind, r.retire?.kind]), [[id, 'published', 'published']]);
  assert.deepEqual(journeyRows(d.c).slice(before).map((r) => r.journey.action), ['work', 'retire-work']);
  assert.equal(root(d).goals.find((g) => g.id === id), undefined); assert.equal(root(d).progress.retiredGoals, 1);
  assert.deepEqual(await d.q.settleRun(d.lc, d.state, done, { course }), [], 'one settlement per run');
});
test('Q4', 'no completion from a reveal, a skip, a missing self-check, or run.complete before the last self-check', async (m) => {
  const d = await day(m), id = await created(d), settle = (run) => d.q.settleRun(d.lc, d.state, run, { course });
  for (const how of ['reveal', 'skip']) {
    const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
    assert.deepEqual(await settle(step(step(step(run, 'right', 'knew'), how), 'right', 'knew')), []);
  }
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  const unchecked = step(step(step(run, 'right', 'knew'), 'wrong', 'missed'), 'right');
  assert.equal(unchecked.complete, true, 'the course marks the run complete at the last answer');
  assert.deepEqual(await settle(unchecked), [], 'run.complete without the last self-check is not enough');
  const forged = structuredClone(lastCheck(unchecked)); forged.responses[1] = { ...forged.responses[1], action: 'reveal' };
  assert.deepEqual(await settle(forged), [], 'an attempt that was not an answer never qualifies');
  assert.equal(root(d).goals.find((g) => g.id === id).status, 'unfinished');
  const results = await settle(lastCheck(unchecked));
  assert.deepEqual(results.map((r) => r.complete.kind), ['published']);
});
test('Q5', 'a repair round and a Meaning run never complete a quest', async (m) => {
  const d = await day(m); await created(d);
  const meaning = runFor(['meaning']); d.q.bindRun(d.state, d.lc, meaning);
  assert.deepEqual(await d.q.settleRun(d.lc, d.state, step(step(step(meaning, 'right', 'knew'), 'right', 'knew'), 'right', 'knew'), { course }), []);
  const run = runFor(['reading']), binding = d.q.bindRun(d.state, d.lc, run);
  // all three missed, so the repair round carries all three prompts in the same session; only its round and mode keep it out
  const repair = course.retry(step(step(step(run, 'wrong', 'missed'), 'wrong', 'missed'), 'wrong', 'missed'));
  assert.deepEqual([repair.promptIds.length, repair.sessionId, repair.mode], [3, run.sessionId, 'repair']);
  assert.equal(d.q.runQualifies(qualified(repair), binding, course), false);
});
test('Q6', 'a completion that is not published keeps the quest in progress and frees it for the next Reading run', async (m) => {
  const d = await day(m), id = await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  const results = await closeGateDuring(d, 'work', () => d.q.settleRun(d.lc, d.state, qualified(run), { course }));
  assert.deepEqual(results.map((r) => [r.complete.kind, r.retire]), [['not-published', undefined]]);
  assert.equal(root(d).goals.find((g) => g.id === id).status, 'unfinished'); assert.equal(d.lc.inspect().phase, 'publication-hold');
  assert.equal(d.state.pending.has(id), false);
  assert.deepEqual(d.q.bindRun(d.state, d.lc, runFor(['reading']))?.goals.map((g) => g.id), [id]);
});
test('Q7', 'an uncertain completion shows no Done, starts no retirement, and no later run can rebind that quest', async (m) => {
  const d = await day(m), id = await created(d), before = journeyRows(d.c).length;
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  d.lie.next = () => ({ outcome: 'uncertain', acknowledged: false });
  const results = await d.q.settleRun(d.lc, d.state, qualified(run), { course });
  assert.deepEqual(results.map((r) => [r.complete.kind, r.retire]), [['uncertain', undefined]]);
  assert.deepEqual(journeyRows(d.c).slice(before).map((r) => r.journey.action), ['work'], 'no retirement write');
  assert.equal(d.state.pending.get(id), 'uncertain');
  assert.equal(d.q.bindRun(d.state, d.lc, runFor(['reading'])), null, 'the pending quest keeps its earlier result');
});
test('Q8', 'a crash between completion and retirement: the next open shows it done and retires it once', async (m) => {
  const d = await day(m), id = await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  const results = await closeGateDuring(d, 'retire-work', () => d.q.settleRun(d.lc, d.state, qualified(run), { course }));
  assert.deepEqual(results.map((r) => [r.complete.kind, r.retire.kind]), [['published', 'not-published']]);
  assert.equal(root(d).goals.find((g) => g.id === id).status, 'completed', 'completion stays true');
  const open = lifecycleOn(m, d.app, { time: d.time, epoch: { v: 1 } }); await open.lc.ready;
  const state = d.q.createQuestState();
  assert.equal(open.lc.inspect().root.goals.find((g) => g.id === id).status, 'completed');
  const first = await closeGateDuring(open, 'retire-work', () => d.q.recoverCompleted(open.lc, state));
  assert.deepEqual(first.map((r) => [r.goalId, r.retire.kind]), [[id, 'not-published']]);
  const commits = d.c.state.commits;
  assert.deepEqual(await d.q.recoverCompleted(open.lc, state), [], 'tried once on this page, never in a loop');
  assert.equal(d.c.state.commits, commits);
  const next = lifecycleOn(m, d.app, { time: d.time, epoch: { v: 1 } }).lc; await next.ready;
  const again = await d.q.recoverCompleted(next, d.q.createQuestState());
  assert.deepEqual(again.map((r) => [r.goalId, r.retire.kind]), [[id, 'published']], 'the next open retries it');
});
test('Q9', 'a lost retirement reply claims no retirement, holds this runtime, and the reloaded page claims nothing from the goal\'s absence', async (m) => {
  const d = await day(m), id = await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  // the retirement commit lands, but the port reports it uncertain
  d.lie.action = 'retire-work'; d.lie.next = () => ({ outcome: 'uncertain', acknowledged: false });
  const out = await d.q.settleRun(d.lc, d.state, qualified(run), { course });
  assert.deepEqual(out.map((r) => [r.complete.kind, r.retire.kind]), [['published', 'uncertain']]);
  await assert.rejects(async () => d.lc.assertReviewable(), /day-hold/);
  const reloaded = lifecycleOn(m, d.app, { time: d.time, epoch: { v: 1 } }).lc; await reloaded.ready;
  assert.equal(reloaded.inspect().root.goals.find((g) => g.id === id), undefined, 'the retirement did land');
  assert.deepEqual(await d.q.recoverCompleted(reloaded, d.q.createQuestState()), [], 'absence proves only absence');
});
test('Q10', 'eight present quests fill the pool, a completed-but-unretired one included; a ninth is refused before commit and nothing is evicted', async (m) => {
  const d = await day(m), first = await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  await closeGateDuring(d, 'retire-work', () => d.q.settleRun(d.lc, d.state, qualified(run), { course }));
  assert.equal(root(d).goals.find((g) => g.id === first).status, 'completed');
  const ids = [first];
  for (let n = 0; n < 7; n++) ids.push(await created(d, d.q.questSeed({ ...OCCURRENCE, token: 100 + n })));
  const commits = d.c.state.commits, phase = d.lc.inspect().phase;
  const ninth = await d.q.createQuest(d.lc, d.state, d.q.questSeed({ ...OCCURRENCE, token: 200 }));
  assert.equal(ninth.kind, 'pool-full'); assert.equal(d.c.state.commits, commits); assert.equal(d.lc.inspect().phase, phase);
  assert.deepEqual(root(d).goals.map((g) => g.id).sort(), [...ids].sort());
});
test('Q11', 'End retires the quest; a new quest for the occurrence takes a new monotonic id and the old run counts for none', async (m) => {
  const d = await day(m), id = await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  const ended = await d.q.endQuest(d.lc, d.state, id);
  assert.equal(ended.kind, 'published'); assert.equal(root(d).goals.find((g) => g.id === id), undefined);
  assert.equal(d.q.bindingFor(d.state, id), null);
  const next = await created(d);
  assert.ok(Number(next.split('/').at(-1)) > Number(id.split('/').at(-1)));
  assert.deepEqual(await d.q.settleRun(d.lc, d.state, qualified(run), { course }), [], 'the old run binds no new quest');
  assert.equal(root(d).goals.find((g) => g.id === next).status, 'unfinished');
});
test('Q12', 'an End whose outcome is unknown blocks a second quest for the same occurrence', async (m) => {
  const d = await day(m), id = await created(d);
  d.lie.action = 'retire-work'; d.lie.next = () => ({ outcome: 'uncertain', acknowledged: false });
  assert.equal((await d.q.endQuest(d.lc, d.state, id)).kind, 'uncertain');
  assert.equal((await d.q.createQuest(d.lc, d.state, d.seed)).kind, 'pending-end');
});
test('Q13', 'nothing revives after a reload: a fresh page has no binding and the old run completes nothing', async (m) => {
  const d = await day(m), id = await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  const reloaded = lifecycleOn(m, d.app, { time: d.time, epoch: { v: 1 } }).lc; await reloaded.ready;
  assert.deepEqual(await d.q.settleRun(reloaded, d.q.createQuestState(), qualified(run), { course }), []);
  assert.equal(reloaded.inspect().root.goals.find((g) => g.id === id).status, 'unfinished');
});
test('Q14', 'an unconfirmed create is reconciled by occurrence before another create', async (m) => {
  const d = await day(m);
  d.lie.next = () => ({ outcome: 'uncertain', acknowledged: false });
  assert.equal((await d.q.createQuest(d.lc, d.state, d.seed)).kind, 'uncertain');
  const again = await d.q.createQuest(d.lc, d.state, d.seed);
  assert.equal(again.kind, 'exists');
  assert.equal(d.c.document(RECORD).m4Journey.goals.filter((g) => d.q.sameSeed(g.seed, d.seed)).length, 1);
});
test('Q15', 'two quests started before one Reading run both complete from it, each with its own ticket and write', async (m) => {
  const d = await day(m), a = await created(d), b = await created(d, d.q.questSeed({ ...OCCURRENCE, token: 27 }));
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  const results = await d.q.settleRun(d.lc, d.state, qualified(run), { course });
  assert.deepEqual(results.map((r) => [r.goalId, r.complete.kind, r.retire.kind]), [[a, 'published', 'published'], [b, 'published', 'published']]);
});
test('Q16', 'an owner change seen after the commit is reported as owner-changed, never as a definite failure', async (m) => {
  const d = await day(m); await created(d);
  const run = runFor(['reading']); d.q.bindRun(d.state, d.lc, run);
  let owned = true;
  const results = await closeGateDuring(d, 'work', () => {
    const pending = d.q.settleRun(d.lc, d.state, qualified(run), { course, owned: () => owned }); owned = false; return pending;
  });
  assert.deepEqual(results.map((r) => r.complete.kind), ['owner-changed']);
});

test('Q17', 'W5 F1: every bound quest is reserved before the first write, so a second Reading run started during it binds none of them', async (m) => {
  const d = await day(m), a = await created(d), b = await created(d, d.q.questSeed({ ...OCCURRENCE, token: 27 }));
  const r1 = runFor(['reading']); d.q.bindRun(d.state, d.lc, r1);
  let release; d.c.state.gate = new Promise((resolve) => { release = () => { d.c.state.gate = null; resolve(); }; });
  const settling = d.q.settleRun(d.lc, d.state, qualified(r1), { course });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual([...d.state.pending.keys()].sort(), [a, b].sort(), 'both quests reserved while the first write waits');
  const r2 = runFor(['reading']);
  assert.equal(d.q.bindRun(d.state, d.lc, r2), null, 'R2 cannot bind a quest R1 reserved');
  release();
  const results = await settling;
  assert.deepEqual(results.map((r) => [r.goalId, r.complete.kind, r.retire?.kind]), [[a, 'published', 'published'], [b, 'published', 'published']]);
  assert.deepEqual(await d.q.settleRun(d.lc, d.state, qualified(r2), { course }), []);
});
test('Q18', 'W5 F2: a run binds once when it starts; seen again, first seen answered, or after settlement, it attaches no later quest', async (m) => {
  const d = await day(m);
  const r0 = runFor(['reading']);
  assert.equal(d.q.bindRun(d.state, d.lc, r0), null, 'no quest yet: an empty binding is recorded');
  const a = await created(d);
  assert.equal(d.q.bindRun(d.state, d.lc, r0), null, 'seen again, it keeps its empty binding');
  assert.deepEqual(await d.q.settleRun(d.lc, d.state, qualified(r0), { course }), []);
  const late = step(runFor(['reading']), 'right', 'knew');
  assert.equal(d.q.bindRun(d.state, d.lc, late), null, 'an answered run is not a new start');
  const r1 = runFor(['reading']);
  assert.deepEqual(d.q.bindRun(d.state, d.lc, r1)?.goals.map((g) => g.id), [a]);
  await d.q.settleRun(d.lc, d.state, qualified(r1), { course });
  const c2 = await created(d, d.q.questSeed({ ...OCCURRENCE, token: 28 }));
  assert.equal(d.q.bindRun(d.state, d.lc, r1), null, 'a consumed binding never revives');
  assert.equal(root(d).goals.find((g) => g.id === c2).status, 'unfinished');
});
test('Q19', 'W5 F3: overlapping creates store one quest per occurrence, on one page and across two tabs', async (m) => {
  const d = await day(m), stored = () => d.c.document(RECORD).m4Journey.goals.filter((g) => d.q.sameSeed(g.seed, d.seed));
  const [x, y] = await Promise.all([d.q.createQuest(d.lc, d.state, d.seed), d.q.createQuest(d.lc, d.state, d.seed)]);
  assert.deepEqual([x.kind, y.kind].sort(), ['exists', 'published']); assert.equal(x.goalId, y.goalId);
  assert.equal(stored().length, 1);
  const e = await day(m), tab2 = lifecycleOn(m, e.app, { time: e.time, epoch: { v: 1 } }); await tab2.lc.ready;
  let other = null;
  // the other tab creates after this tab checked the occurrence and before its write runs
  const racing = { ...tab2.lc, work: async (...args) => { other = await e.q.createQuest(e.lc, e.state, e.seed); return tab2.lc.work(...args); } };
  const out = await e.q.createQuest(racing, e.q.createQuestState(), e.seed);
  assert.equal(other.kind, 'published'); assert.deepEqual([out.kind, out.goalId], ['exists', other.goalId]);
  assert.equal(e.c.document(RECORD).m4Journey.goals.filter((g) => e.q.sameSeed(g.seed, e.seed)).length, 1);
});
test('Q20', 'W5 F4: a throw after an observed publication is uncertain and holds this runtime, never a definite failure; no retirement follows', async (m) => {
  const d = await day(m);
  const lossy = { ...d.lc, work: async (...args) => { await d.lc.work(...args); throw new Error('lost-return-after-write'); } };
  const out = await d.q.createQuest(lossy, d.state, d.seed);
  assert.deepEqual([out.kind, out.observed?.outcome], ['uncertain', 'published']);
  await assert.rejects(async () => d.lc.assertReviewable(), /day-hold/);
  assert.equal(d.c.document(RECORD).m4Journey.goals.length, 1);
  const e = await day(m), id = await created(e), before = journeyRows(e.c).length;
  const run = runFor(['reading']); e.q.bindRun(e.state, e.lc, run);
  const lost = { ...e.lc, completeGoal: async (...args) => { await e.lc.completeGoal(...args); throw new Error('lost-return-after-write'); } };
  const results = await e.q.settleRun(lost, e.state, qualified(run), { course });
  assert.deepEqual(results.map((r) => [r.goalId, r.complete.kind, r.retire]), [[id, 'uncertain', undefined]]);
  assert.deepEqual(journeyRows(e.c).slice(before).map((r) => r.journey.action), ['work'], 'no retirement write');
  assert.equal(e.state.pending.get(id), 'uncertain');
  await assert.rejects(async () => e.lc.assertReviewable(), /day-hold/);
});
test('Q21', 'W5 1901 ruling: an unconfirmed create, End or retirement holds this runtime only; a refusal before commit holds nothing', async (m) => {
  const mismatch = (r) => ({ ...r, rootHash: 'f'.repeat(64) });
  const persisted = (d) => [d.device.saved.has('bunki-journey:hold'), d.c.document(RECORD).m4Journey.guard.reason];
  const a = await day(m);
  a.lie.next = mismatch;
  assert.equal((await a.q.createQuest(a.lc, a.state, a.seed)).kind, 'uncertain');
  await assert.rejects(async () => a.lc.assertReviewable(), /day-hold/);
  assert.deepEqual(persisted(a), [false, 'clear'], 'nothing persisted');
  const b = await day(m), idB = await created(b);
  b.lie.action = 'retire-work'; b.lie.next = mismatch;
  assert.equal((await b.q.endQuest(b.lc, b.state, idB)).kind, 'uncertain');
  await assert.rejects(async () => b.lc.assertReviewable(), /day-hold/);
  const c = await day(m), idC = await created(c);
  const run = runFor(['reading']); c.q.bindRun(c.state, c.lc, run);
  c.lie.action = 'retire-work'; c.lie.next = mismatch;
  const results = await c.q.settleRun(c.lc, c.state, qualified(run), { course });
  assert.deepEqual(results.map((r) => [r.goalId, r.complete.kind, r.retire.kind]), [[idC, 'published', 'uncertain']]);
  await assert.rejects(async () => c.lc.assertReviewable(), /day-hold/);
  const e = await day(m);
  assert.equal((await e.q.endQuest(e.lc, e.state, 'journey-x/goals/9')).kind, 'absent');
  await must(() => e.lc.assertReviewable(), 'a page with no unconfirmed write');
});

test('Q22', 'W2 1907 O1: without the owner no retirement is written, on the cached, the delayed no-write and the between-writes paths', async (m) => {
  const noRetire = (d, from) => assert.deepEqual(journeyRows(d.c).slice(from).filter((r) => r.journey.action === 'retire-work'), []);
  // cached: the local root already shows the bound quest completed by another tab
  const a = await day(m), idA = await created(a);
  const runA = runFor(['reading']); a.q.bindRun(a.state, a.lc, runA);
  const tab = lifecycleOn(m, a.app, { time: a.time, epoch: { v: 1 } }).lc; await tab.ready;
  await tab.completeGoal(idA, tab.completionTicket(idA, 'other-tab', a.seed));
  await a.lc.tick(); assert.equal(root(a).goals.find((g) => g.id === idA).status, 'completed');
  let from = journeyRows(a.c).length;
  const cached = await a.q.settleRun(a.lc, a.state, qualified(runA), { course, owned: () => false });
  assert.deepEqual(cached.map((r) => [r.complete.kind, r.retire]), [['owner-changed', undefined]]); noRetire(a, from);
  assert.deepEqual((await a.q.recoverCompleted(a.lc, a.state, { owned: () => false })).map((r) => r.retire.kind), ['owner-changed']); noRetire(a, from);
  // delayed: the completion call itself finds the quest completed and writes nothing
  const b = await day(m), idB = await created(b);
  const runB = runFor(['reading']); b.q.bindRun(b.state, b.lc, runB);
  const tabB = lifecycleOn(m, b.app, { time: b.time, epoch: { v: 1 } }).lc; await tabB.ready;
  await tabB.completeGoal(idB, tabB.completionTicket(idB, 'other-tab', b.seed));
  from = journeyRows(b.c).length;
  let calls = 0;
  const delayed = await b.q.settleRun(b.lc, b.state, qualified(runB), { course, owned: () => calls++ < 1 });
  assert.deepEqual(delayed.map((r) => [r.complete.kind, r.retire]), [['owner-changed', undefined]]); noRetire(b, from);
  // between writes: the completion is published, then the owner moves before retirement
  const c = await day(m), idC = await created(c);
  const runC = runFor(['reading']); c.q.bindRun(c.state, c.lc, runC);
  from = journeyRows(c.c).length; calls = 0;
  const between = await c.q.settleRun(c.lc, c.state, qualified(runC), { course, owned: () => calls++ < 2 });
  assert.deepEqual(between.map((r) => [r.goalId, r.complete.kind, r.retire.kind]), [[idC, 'published', 'owner-changed']]); noRetire(c, from);
  assert.equal(root(c).goals.find((g) => g.id === idC).status, 'completed');
});
test('Q23', 'W2 1907 custody: a binding made before a reboot or an OFF→ON switch completes nothing afterwards', async (m) => {
  const d = await day(m), id = await created(d);
  const r1 = runFor(['reading']); d.q.bindRun(d.state, d.lc, r1);
  await d.lc.boot();
  assert.deepEqual(await d.q.settleRun(d.lc, d.state, qualified(r1), { course }), []);
  const r2 = runFor(['reading']); assert.deepEqual(d.q.bindRun(d.state, d.lc, r2)?.goals.map((g) => g.id), [id]);
  await d.lc.setSwitch(false); await d.lc.setSwitch(true);
  assert.deepEqual(await d.q.settleRun(d.lc, d.state, qualified(r2), { course }), []);
  assert.equal(root(d).goals.find((g) => g.id === id).status, 'unfinished');
});

/** one targeted mutant per adapter rule; each must turn its own case red */
export const MUTANTS = {
  'meaning-binds': ['Q2', [["Array.isArray(run.targets) && run.targets.length === 1 && run.targets[0] === 'reading';", 'Array.isArray(run.targets);']]],
  'complete-on-run-complete': ['Q4', [['run.attempts.every((attempt, index) => run.responses[index]?.action', 'run.complete || run.attempts.every((attempt, index) => run.responses[index]?.action']]],
  'reveal-qualifies': ['Q4', [["run.responses[index]?.action === 'answer' && attempt.feedbackAt", 'attempt.feedbackAt']]],
  'rebind-pending': ['Q7', [["goal.status === 'unfinished' && !state.pending.has(goal.id)", "goal.status === 'unfinished'"]]],
  'retire-unconfirmed': ['Q7', [["if (complete.kind === 'uncertain') { state.pending.set(id, 'uncertain'); results.push({ goalId: id, complete }); continue; }", "if (complete.kind === 'uncertain') { state.pending.set(id, 'uncertain'); }"]]],
  'end-not-pending': ['Q12', [["if (out.kind !== 'uncertain') state.ending.delete(key);", 'state.ending.delete(key);']]],
  'recover-every-open': ['Q8', [["if (goal.status !== 'completed' || state.recovered.has(goal.id)) continue;", "if (goal.status !== 'completed') continue;"]]],
  'repair-qualifies': ['Q5', [["run?.unitId === QUEST_UNIT && run.round === 0 && ['check', 'preview']", "run?.unitId === QUEST_UNIT && ['check', 'preview', 'repair']"]]],
  'reserve-lazily': ['Q17', [["  for (const { id } of binding.goals) state.pending.set(id, 'completing');\n", ''],
    ['      try { ticket = lc.completionTicket(id, binding.sessionId, seed); }', "      state.pending.set(id, 'completing');\n      try { ticket = lc.completionTicket(id, binding.sessionId, seed); }"]]],
  'bind-every-call': ['Q18', [['  if (known) return known.consumed ? null : known.binding;\n', '']]],
  'admit-dropped': ['Q19', [['{ observe, admit }), owned);', '{ observe }), owned);']]],
  'thrown-publication-as-failure': ['Q20', [["    if (observed.outcome === 'not-published') return { kind: 'not-published', reason, observed };\n    return unconfirmed(lc, { reason, observed }, owned);",
    "    return { kind: observed.outcome === 'uncertain' ? 'uncertain' : 'not-published', reason, observed };"]]],
  'no-unconfirmed-hold': ['Q21', [["  if (out.observed?.outcome === 'published') lc.holdUnconfirmed();\n", '']]],
  'already-completed-overrides-owner': ['Q22', [["if (complete.value?.alreadyCompleted === true && complete.kind !== 'owner-changed')", 'if (complete.value?.alreadyCompleted === true)']]],
  'retire-without-owner': ['Q22', [["    const retire = owned() ? await questWrite(lc, (observe) => lc.retire('goals', id, 'retire-completed', { observe }), owned)\n      : { kind: 'owner-changed' };",
    "    const retire = await questWrite(lc, (observe) => lc.retire('goals', id, 'retire-completed', { observe }), owned);"]]],
  'binding-ignores-boot': ['Q23', [['  if (binding.boot !== lc.bootIdentity() || binding.journeyId', '  if (binding.journeyId']]],
  'owner-change-ignored': ['Q16', [["    if (!owned()) return { kind: 'owner-changed', reason, observed };\n", '']]],
};

async function main() {
  floor();
  const only = arg('case'), results = [], modules = await load();
  for (const t of CASES) {
    if (only && t.id !== only) continue;
    floor();
    try { await t.fn(modules); results.push({ id: t.id, passed: true }); }
    catch (error) { results.push({ id: t.id, passed: false, error: error.message.split('\n')[0] }); }
  }
  const controls = [];
  if (process.argv.includes('--mutants')) {
    for (const [name, [target, pairs]] of Object.entries(MUTANTS)) {
      floor();
      let text = ADAPTER;
      for (const [from, to] of pairs) { assert.equal(text.split(from).length, 2, 'mutant anchor not unique: ' + name); text = text.replace(from, to); }
      try { await CASES.find((entry) => entry.id === target).fn({ ...modules, adapterText: text }); controls.push({ name, target, killed: false }); }
      catch (error) { controls.push({ name, target, killed: error instanceof assert.AssertionError, witness: error.message.split('\n')[0] }); }
    }
  }
  const failed = results.filter((r) => !r.passed), survived = controls.filter((c) => !c.killed);
  console.log(JSON.stringify({ cases: `${results.length - failed.length}/${results.length}`, failed,
    controls: controls.length ? `${controls.length - survived.length}/${controls.length}` : 'not run', survived, controlDetails: controls }, null, 1));
  process.exitCode = failed.length || survived.length ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
