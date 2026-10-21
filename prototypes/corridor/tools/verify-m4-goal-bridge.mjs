/** M4 S1 (lead 1835; W5 1746/1750; window 4 1748/1750/1840): the quest goal bridge in the journey lifecycle, in Node. The real
 * record host, app and lifecycle over the built record-core (--modules=<site>/modules), the in-memory controller of
 * verify-journey-record.mjs, and synthetic records only. stdout only; no files are written.
 *   node tools/verify-m4-goal-bridge.mjs --modules=<dir> [--case=<id>] [--mutants]
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load, SOURCES, memoryController, openApp, ON, corePort, memoryDevice, RECORD, COMMANDS } from './verify-journey-record.mjs';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
// rule 1725: pure probes run down to 1.2 GiB
const floor = () => { const s = statfsSync(DIR); assert.ok(s.bavail * s.bsize >= 1.2 * 1024 ** 3, 'DISK STOP: below 1.2 GiB'); };
const SEED = Object.freeze({ kind: 'reading', sourceOccurrence: { article: 'bunki-essay-n1-city', token: 26 } });
const goalData = () => ({ seed: structuredClone(SEED), inspected: false, practiceSession: null });

/** the record port, with two test seams: `gate.close` names the action whose next commit meets a closed host gate (the host
 * refuses it, journey-gate-closed); `lie.next` rewrites the next 'work' commit's result after the commit itself happened */
export function lifecycleOn(m, app, { time, epoch }) {
  let serial = 0;
  const device = memoryDevice(), lie = { next: null }, gate = { close: null };
  const real = m.lifecycle.recordPort({ app, binding: () => ({ epoch: epoch.v }), nextId: () => `journey-${++serial}-${crypto.randomUUID()}` });
  const port = { ...real, commit: async (expected, next, meta, open) => {
    if (gate.close === meta.action) { gate.close = null; return real.commit(expected, next, meta, () => false); }
    const result = await real.commit(expected, next, meta, open);
    if (meta.action !== 'work' || !lie.next) return result;
    const swap = lie.next; lie.next = null; return swap(result);
  } };
  const lc = m.lifecycle.createLifecycle({ port, device, buildId: 'build-a', core: corePort(), clock: () => time.now, enabled: true,
    validateCapture: (entries) => entries });
  return { lc, device, lie, gate };
}
export async function activeDay(m, controller = memoryController()) {
  const app = await openApp(m, controller), time = { now: Date.parse(ON) }, epoch = { v: 1 };
  const { lc, device, lie, gate } = lifecycleOn(m, app, { time, epoch });
  await lc.ready; time.now = corePort().endOfDay(new Date(time.now)) + 60_000; await lc.tick();
  assert.equal(lc.inspect().phase, 'active');
  return { c: controller, app, time, epoch, lc, device, lie, gate };
}
const goalOf = (lc, id) => lc.inspect().root.goals.find((g) => g.id === id);
async function withGoal(m) {
  const day = await activeDay(m), seen = [];
  await day.lc.work('goals', goalData(), { observe: (r) => seen.push(r) });
  assert.deepEqual(seen.map((r) => [r.action, r.outcome]), [['work', 'published']]);
  return { ...day, goal: day.lc.inspect().root.goals.at(-1) };
}
/** the next commit of `action` meets a closed host gate: the host refuses it and the port reports not-published */
export const closeGateDuring = async (day, action, start) => { day.gate.close = action; try { return await start(); } finally { day.gate.close = null; } };
export const journeyRows = (c) => c.rows(COMMANDS).filter((r) => r.type === 'journey.lifecycle/1');
/** a refusal where success is expected is a failed assertion, so a mutant that throws is counted as killed, not as a crash */
export const must = async (start, what) => { try { return await start(); } catch (error) { return assert.fail(`${what} was refused: ${error.message}`); } };

export const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

test('B1', 'a qualified completion is one work receipt, changes only status and practiceSession, and is confirmed', async (m) => {
  const { c, lc, goal } = await withGoal(m), before = c.document(RECORD).m4Journey, commits = c.state.commits, seen = [];
  const ticket = lc.completionTicket(goal.id, 'session-1', SEED);
  const result = await must(() => lc.completeGoal(goal.id, ticket, { observe: (r) => seen.push(r) }), 'the completion');
  assert.deepEqual([result.write, result.confirmed], [true, true]);
  assert.deepEqual(seen.map((r) => [r.action, r.outcome, r.acknowledged, r.rootHash === r.proposedHash]), [['work', 'published', true, true]]);
  assert.equal(c.state.commits, commits + 1);
  assert.equal(journeyRows(c).at(-1).journey.action, 'work');
  const after = c.document(RECORD).m4Journey, expected = structuredClone(before);
  Object.assign(expected.goals.find((g) => g.id === goal.id), { status: 'completed', practiceSession: 'session-1' });
  expected.revision = after.revision;
  assert.equal(m.core.encodeLocalJson(after).text, m.core.encodeLocalJson(expected).text);
  assert.equal(after.revision, before.revision + 1);
});
test('B2', 'not-published throws publication-hold, holds this runtime, keeps the goal unfinished; an explicit retry of the same ticket succeeds', async (m) => {
  const day = await withGoal(m), { lc, goal } = day, seen = [];
  const ticket = lc.completionTicket(goal.id, 'session-1', SEED);
  await assert.rejects(closeGateDuring(day, 'work', () => lc.completeGoal(goal.id, ticket, { observe: (r) => seen.push(r) })), /publication-hold/);
  assert.deepEqual(seen.map((r) => r.outcome), ['not-published']);
  assert.equal(lc.inspect().phase, 'publication-hold'); assert.equal(goalOf(lc, goal.id).status, 'unfinished');
  await assert.rejects(async () => lc.assertReviewable(), /day-hold/);
  const again = [], retry = await must(() => lc.completeGoal(goal.id, ticket, { observe: (r) => again.push(r) }), 'the explicit retry');
  assert.deepEqual([retry.write, retry.confirmed], [true, true]); assert.equal(goalOf(lc, goal.id).status, 'completed');
  assert.deepEqual([seen.map((r) => r.outcome), again.map((r) => r.outcome)], [['not-published'], ['published']]);
});
test('B3', 'uncertain throws publication-hold and blocks both a retry and a second ticket for the goal', async (m) => {
  const { lc, lie, goal } = await withGoal(m), seen = [];
  const ticket = lc.completionTicket(goal.id, 'session-1', SEED);
  lie.next = () => ({ outcome: 'uncertain', acknowledged: false });
  await assert.rejects(async () => lc.completeGoal(goal.id, ticket, { observe: (r) => seen.push(r) }), /publication-hold/);
  assert.deepEqual(seen.map((r) => r.outcome), ['uncertain']); assert.equal(lc.inspect().phase, 'publication-hold');
  await assert.rejects(async () => lc.completeGoal(goal.id, ticket), /completion-pending/);
  assert.throws(() => lc.completionTicket(goal.id, 'session-2', SEED), /completion-pending|completion-mismatch/);
});
test('B4', 'a refusal before commit reaches no port and sets no new hold', async (m) => {
  const { lc, goal } = await withGoal(m), seen = [];
  await assert.rejects(async () => lc.retire('goals', goal.id, 'retire-completed', { observe: (r) => seen.push(r) }), /explicit-retirement/);
  const ticket = lc.completionTicket(goal.id, 'session-1', SEED);
  await lc.retire('goals', goal.id, 'abandon-and-retire');
  await assert.rejects(async () => lc.completeGoal(goal.id, ticket, { observe: (r) => seen.push(r) }), /work-missing/);
  assert.deepEqual(seen, []); assert.equal(lc.inspect().phase, 'active');
});
test('B5', 'a goal another writer already completed returns already-completed with no commit', async (m) => {
  const day = await withGoal(m), { c, app, lc, goal, time, epoch } = day;
  const ticket = lc.completionTicket(goal.id, 'session-1', SEED);
  const other = lifecycleOn(m, app, { time, epoch }).lc; await other.ready;
  assert.equal((await other.completeGoal(goal.id, other.completionTicket(goal.id, 'session-9', SEED))).confirmed, true);
  const commits = c.state.commits, seen = [];
  const result = await must(() => lc.completeGoal(goal.id, ticket, { observe: (r) => seen.push(r) }), 'the already-completed call');
  assert.deepEqual([result.write, result.alreadyCompleted, result.confirmed], [false, true, undefined]);
  assert.equal(c.state.commits, commits); assert.deepEqual(seen, []);
  assert.equal(goalOf(lc, goal.id).practiceSession, 'session-9');
});
test('B6', 'a published reply whose root hash differs from the proposed root is not confirmed and holds this runtime', async (m) => {
  const { lc, lie, goal } = await withGoal(m);
  lie.next = (r) => ({ ...r, rootHash: 'f'.repeat(64) });
  const result = await lc.completeGoal(goal.id, lc.completionTicket(goal.id, 'session-1', SEED));
  assert.deepEqual([result.write, result.confirmed], [true, false]); assert.equal(lc.inspect().phase, 'publication-hold');
  await assert.rejects(async () => lc.completeGoal(goal.id, lc.completionTicket(goal.id, 'session-2', SEED)), /completion-pending|completion-mismatch/);
});
test('B7', 'each call sees only its own write: an incidental hold write inside usable() never reaches the observer, and an observer that throws changes nothing', async (m) => {
  const { c, lc, device, goal, time } = await withGoal(m), seen = [], done = [];
  // today's hold marker makes change()'s usable() write the root's hold guard before the target write (the create path)
  device.saved.set('bunki-journey:hold', { day: m.lifecycle.dayKey(time.now), journeyId: 'elsewhere', reason: 'help-write-hold' });
  const commits = c.state.commits;
  await must(() => lc.work('goals', goalData(), { observe: (r) => seen.push(r) }), 'the create');
  assert.equal(c.state.commits, commits + 2, 'one hold write, then the target write');
  assert.deepEqual(journeyRows(c).slice(-2).map((r) => r.journey.action), ['hold', 'work']);
  assert.deepEqual(seen.map((r) => r.action), ['work']);
  await must(() => lc.completeGoal(goal.id, lc.completionTicket(goal.id, 'session-1', SEED), { observe: (r) => done.push(r) }), 'the completion');
  assert.deepEqual(done.map((r) => [r.action, r.outcome]), [['work', 'published']]);
  const after = await must(() => lc.work('goals', goalData(), { observe: () => { throw new Error('observer-bug'); } }), 'a write whose observer throws');
  assert.equal(after.root.goals.length, 3);
});
test('B8', 'boot() and a switch both retire every ticket', async (m) => {
  const { lc, goal } = await withGoal(m);
  const a = lc.completionTicket(goal.id, 'session-1', SEED);
  await lc.boot();
  await assert.rejects(async () => lc.completeGoal(goal.id, a), /stale-completion/);
  const b = lc.completionTicket(goal.id, 'session-2', SEED);
  await lc.setSwitch(false); await lc.setSwitch(true);
  await assert.rejects(async () => lc.completeGoal(goal.id, b), /stale-completion/);
});
test('B9', 'retirement is its own acknowledged write; a failed retirement keeps the goal completed', async (m) => {
  const day = await withGoal(m), { c, lc, goal } = day;
  await lc.completeGoal(goal.id, lc.completionTicket(goal.id, 'session-1', SEED));
  const seen = [];
  await assert.rejects(closeGateDuring(day, 'retire-work', () => lc.retire('goals', goal.id, 'retire-completed', { observe: (r) => seen.push(r) })), /publication-hold/);
  assert.deepEqual(seen.map((r) => [r.action, r.outcome]), [['retire-work', 'not-published']]);
  assert.equal(goalOf(lc, goal.id).status, 'completed');
  const ok = [], retired = c.document(RECORD).m4Journey.progress.retiredGoals;
  await lc.retire('goals', goal.id, 'retire-completed', { observe: (r) => ok.push(r) });
  assert.deepEqual(ok.map((r) => [r.action, r.outcome]), [['retire-work', 'published']]);
  assert.equal(goalOf(lc, goal.id), undefined); assert.equal(c.document(RECORD).m4Journey.progress.retiredGoals, retired + 1);
});
test('B10', 'old-reader and host limits: raw done is invalid, a new action is refused, an unknown stored action closes the record, the c7b89c1c host opens a work completion', async (m) => {
  const { c, app, lc, goal } = await withGoal(m);
  await assert.rejects(async () => lc.work('goals', { ...goalData(), status: 'done' }), /root-invalid/);
  const auth = m.lifecycle.authority(app.journeyAuthority()), root = c.document(RECORD).m4Journey;
  await assert.rejects(app.commitJourney({ expected: { rootSha256: m.lifecycle.digest(root), generation: auth.generation },
    root: { ...root, revision: root.revision + 1 }, journey: { action: 'complete-work', journeyId: root.id } }),
  (error) => error.code === 'invalid-journey-command');
  await lc.completeGoal(goal.id, lc.completionTicket(goal.id, 'session-1', SEED));
  const rows = c.rows(COMMANDS).map((row) => ({ collection: COMMANDS, id: row.changeId, value: row }));
  const reopen = (modules, list = rows) => openApp(modules, memoryController({ record: c.document(RECORD), rows: list, revision: c.revision }));
  assert.equal((await reopen(m)).current().status, 'active');
  const floorBuild = { host: 'record-host.mjs', app: 'record-app.mjs' };
  const old = await load({ ...SOURCES, ...Object.fromEntries(Object.entries(floorBuild).map(([k, f]) => [k,
    execFileSync('git', ['show', `c7b89c1c60daab78b9c7c78de6ceb0b7f67c9678:prototypes/corridor/${f}`], { cwd: DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })])) });
  assert.equal((await reopen(old)).current().status, 'active');
  const forged = rows.map((row) => row.value.journey?.action === 'work'
    ? { ...row, value: { ...row.value, journey: { ...row.value.journey, action: 'complete-work' } } } : row);
  assert.notEqual((await reopen(m, forged)).current().status, 'active');
});
test('B11', 'legacy calls without an observer keep their exact results and throws', async (m) => {
  const day = await withGoal(m), { lc } = day;
  const entered = await must(() => lc.enter('lessons'), 'a legacy enter');
  assert.deepEqual(Object.keys(entered).sort(), ['diagnostics', 'holdUntil', 'on', 'phase', 'root']);
  await assert.rejects(closeGateDuring(day, 'work', () => lc.work('goals', goalData())), /^Error: publication-hold$/);
});
test('B12', 'UX4: a failed commit holds this runtime only; a fresh lifecycle on the clean root records again', async (m) => {
  const day = await withGoal(m), { app, lc, goal, time } = day;
  await assert.rejects(closeGateDuring(day, 'work', () => lc.completeGoal(goal.id, lc.completionTicket(goal.id, 'session-1', SEED))), /publication-hold/);
  await assert.rejects(async () => lc.assertReviewable(), /day-hold/);
  const reloaded = lifecycleOn(m, app, { time, epoch: { v: 1 } }).lc; await reloaded.ready;
  assert.equal(reloaded.inspect().phase, 'active'); await reloaded.assertReviewable();
});

/** one targeted mutant per bridge rule; each must turn its own case red (an assertion, not a crash) */
export const MUTANTS = {
  'uncertain-as-refused': ['B3', [["t.state=seen?.outcome==='uncertain'?'uncertain':'refused';", "t.state='refused';"]]],
  'root-hash-unchecked': ['B6', [['seen.rootHash===seen.proposedHash&&', '']]],
  'repeat-writes': ['B5', [["if(goal.status==='completed'){t.state='settled';return {write:false,alreadyCompleted:true,phase};}", '']]],
  'ticket-survives-boot': ['B8', [['bootToken=Object.freeze({});pendingByGoal=new Map();', 'pendingByGoal=new Map();']]],
  'pending-allows-mint': ['B3', [["insist(!prior||completions.get(prior)?.state==='refused','completion-pending');", '']]],
  'new-action-name': ['B1', [["try{yield* change('work',s=>{const g=", "try{yield* change('complete-work',s=>{const g="]]],
  'raw-done': ['B1', [["g.status='completed';g.practiceSession", "g.status='done';g.practiceSession"]]],
  'observer-throw-escapes': ['B7', [["rootHash:result?.rootHash??null,proposedHash:digest(sent)}));}catch{}", 'rootHash:result?.rootHash??null,proposedHash:digest(sent)}));}finally{}']]],
  'observer-catches-hold-write': ['B7', [
    [' let bootToken=null,pendingByGoal=new Map();', ' let bootToken=null,pendingByGoal=new Map(),currentObserver=null;'],
    ['function* change(action,fn,{shrinkingControl=false,observe=null}={}){yield* usable();', 'function* change(action,fn,{shrinkingControl=false,observe=null}={}){currentObserver=observe;yield* usable();currentObserver=null;'],
    ["if(root&&classify(root)==='valid')try{const next=nextRoot();next.guard={reason,until:holdUntil};yield* write(next,'hold',{control:true});}",
      "if(root&&classify(root)==='valid')try{const next=nextRoot();next.guard={reason,until:holdUntil};yield* write(next,'hold',{control:true,observe:currentObserver});}"]]],
  'legacy-observer-required': ['B11', [["function* enter(entrance,{observe=null}={}){", 'function* enter(entrance,{observe}){']]],
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
      let text = SOURCES.lifecycle;
      for (const [from, to] of pairs) { assert.equal(text.split(from).length, 2, 'mutant anchor not unique: ' + name); text = text.replace(from, to); }
      const mutated = await load({ ...SOURCES, lifecycle: text });
      try { await CASES.find((entry) => entry.id === target).fn(mutated); controls.push({ name, target, killed: false }); }
      catch (error) { controls.push({ name, target, killed: error instanceof assert.AssertionError, witness: error.message.split('\n')[0] }); }
    }
  }
  const failed = results.filter((r) => !r.passed), survived = controls.filter((c) => !c.killed);
  console.log(JSON.stringify({ cases: `${results.length - failed.length}/${results.length}`, failed,
    controls: controls.length ? `${controls.length - survived.length}/${controls.length}` : 'not run', survived, controlDetails: controls }, null, 1));
  process.exitCode = failed.length || survived.length ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
