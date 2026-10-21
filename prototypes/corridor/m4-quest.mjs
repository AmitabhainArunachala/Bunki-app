/** M4 v0 quests over the journey lifecycle (lead 1709/1835; W5 931f3c55, 1746, 1750; UX r4.2 7eae4438 §2–§3). A quest is a
 * goal in the journey root: take part in the 職・識・織 unit's whole-word Reading run, answering, seeing feedback and saying
 * whether you knew each word. It exists only with the switch ON. Binding, tickets and pending writes live in this page's
 * memory only; a reload keeps nothing but the confirmed root. Every write reports its own outcome for the §2.3 lines. */

export const QUEST_UNIT = 'shiki-shoku';
const canonical = (value) => JSON.stringify(value, (key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
export const sameSeed = (a, b) => canonical(a) === canonical(b);
const seedKey = (seed) => canonical(seed);

/** a reading seed names its exact source occurrence; nothing else seeds a v0 quest (decision 2: kept/due seeds are LATER) */
export function questSeed(sourceOccurrence) {
  return { kind: 'reading', sourceOccurrence: structuredClone(sourceOccurrence) };
}
export function quests(root) {
  return (root?.goals || []).filter((goal) => goal?.seed?.kind === 'reading');
}
export function questFor(root, seed) {
  return quests(root).find((goal) => sameSeed(goal.seed, seed)) || null;
}

/** one page's quest memory; the corridor makes a new one for each record owner */
export function createQuestState() {
  return { binding: null, pending: new Map(), ending: new Set(), recovered: new Set() };
}

// refusals raised before any commit: nothing was written and no new hold was set (§2.3)
const BEFORE_COMMIT = {
  'owner-epoch': 'owner-changed', 'generation-changed': 'owner-changed', 'stale-root': 'owner-changed',
  'root-unavailable': 'structural', 'switch-off': 'structural', 'root-invalid': 'structural', 'byte-bound': 'structural',
  'authority-unavailable': 'structural', 'work-bound': 'pool-full',
};
/** one goal write with its own observer: published only with the exact-root acknowledgement and the same owner */
async function questWrite(start, owned) {
  let observed = null;
  try {
    const value = await start((result) => { observed = result; });
    const confirmed = observed?.outcome === 'published' && observed.acknowledged === true &&
      observed.rootHash === observed.proposedHash && owned();
    return { kind: confirmed ? 'published' : owned() ? 'uncertain' : 'owner-changed', value, observed };
  } catch (error) {
    const reason = error?.message || 'refused';
    if (!observed) return { kind: BEFORE_COMMIT[reason] || 'refused', reason, observed };
    if (!owned()) return { kind: 'owner-changed', reason, observed };
    return { kind: observed.outcome === 'uncertain' ? 'uncertain' : 'not-published', reason, observed };
  }
}

/** Q-05: one quest per occurrence. An unconfirmed create is reconciled by occurrence first, and a pending End blocks a second */
export async function createQuest(lc, state, seed, { owned = () => true } = {}) {
  if (state.ending.has(seedKey(seed))) return { kind: 'pending-end' };
  await lc.tick();
  const existing = questFor(lc.inspect().root, seed);
  if (existing) return { kind: 'exists', goalId: existing.id, status: existing.status };
  const out = await questWrite((observe) => lc.work('goals', { seed: structuredClone(seed), inspected: false, practiceSession: null },
    { observe }), owned);
  if (out.kind === 'published') out.goalId = questFor(lc.inspect().root, seed)?.id ?? null;
  return out;
}

const readingRun = (run) => run?.unitId === QUEST_UNIT && run.round === 0 && ['check', 'preview'].includes(run.mode) &&
  Array.isArray(run.targets) && run.targets.length === 1 && run.targets[0] === 'reading';
/** a successfully started Reading run binds the unfinished quests present now; Meaning and mixed runs bind none (decision 10),
 * and a quest whose completion is still pending keeps its earlier result */
export function bindRun(state, root, run) {
  state.binding = null;
  if (!readingRun(run)) return null;
  const goals = quests(root).filter((goal) => goal.status === 'unfinished' && !state.pending.has(goal.id));
  if (!goals.length) return null;
  state.binding = { sessionId: run.sessionId, journeyId: root.id, goals: goals.map((goal) => ({ id: goal.id, seed: structuredClone(goal.seed) })) };
  return state.binding;
}
export function bindingFor(state, goalId) {
  return state.binding?.goals.some((goal) => goal.id === goalId) ? state.binding : null;
}

/** every prompt of the bound Reading run answered, with feedback and an explicit self-check; run.complete alone is not enough */
export function runQualifies(run, binding, course) {
  if (!binding || !readingRun(run) || run.sessionId !== binding.sessionId) return false;
  const expected = course.getUnit(QUEST_UNIT).targets.map((target) => `${QUEST_UNIT}/${target.id}/reading`);
  return run.promptIds.length === expected.length && run.promptIds.every((id, index) => id === expected[index]) &&
    run.attempts.every((attempt, index) => run.responses[index]?.action === 'answer' && attempt.feedbackAt !== null &&
      attempt.selfCheck !== null);
}

/** at the last self-check: complete each bound quest, then retire it as its own write. Done is never shown before its write is
 * published; an unknown completion starts no retirement and keeps the quest out of later bindings */
export async function settleRun(lc, state, run, { course, owned = () => true } = {}) {
  const binding = state.binding;
  if (!runQualifies(run, binding, course)) return [];
  state.binding = null;
  const results = [];
  for (const { id, seed } of binding.goals) {
    const goal = quests(lc.inspect().root).find((g) => g.id === id);
    if (!goal) { results.push({ goalId: id, complete: { kind: 'absent' } }); continue; }
    let complete;
    if (goal.status === 'completed') complete = { kind: 'already-completed' };
    else {
      let ticket;
      try { ticket = lc.completionTicket(id, binding.sessionId, seed); }
      catch (error) { results.push({ goalId: id, complete: { kind: BEFORE_COMMIT[error.message] || 'refused', reason: error.message } }); continue; }
      state.pending.set(id, 'completing');
      complete = await questWrite((observe) => lc.completeGoal(id, ticket, { observe }), owned);
      // no commit was made for an already-completed goal, so there is no observation to read
      if (complete.value?.alreadyCompleted === true) complete.kind = 'already-completed';
      else if (complete.kind === 'published' && complete.value?.confirmed !== true) complete.kind = 'uncertain';
    }
    if (complete.kind === 'uncertain') { state.pending.set(id, 'uncertain'); results.push({ goalId: id, complete }); continue; }
    state.pending.delete(id);
    if (!['published', 'already-completed'].includes(complete.kind)) { results.push({ goalId: id, complete }); continue; }
    state.recovered.add(id);
    const retire = await questWrite((observe) => lc.retire('goals', id, 'retire-completed', { observe }), owned);
    results.push({ goalId: id, complete, retire });
  }
  return results;
}

/** Q-11b: End is abandon-and-retire. Until its outcome is known the occurrence takes no second quest; the run is left as it is */
export async function endQuest(lc, state, goalId, { owned = () => true } = {}) {
  const goal = quests(lc.inspect().root).find((g) => g.id === goalId);
  if (!goal) return { kind: 'absent' };
  const key = seedKey(goal.seed);
  state.ending.add(key);
  const out = await questWrite((observe) => lc.retire('goals', goalId, 'abandon-and-retire', { observe }), owned);
  if (out.kind !== 'uncertain') state.ending.delete(key);
  if (out.kind === 'published' && state.binding) {
    state.binding.goals = state.binding.goals.filter((g) => g.id !== goalId);
    if (!state.binding.goals.length) state.binding = null;
  }
  return out;
}

/** on open: a completed quest still in the pool is done, and its retirement is tried once on this page (never in a loop) */
export async function recoverCompleted(lc, state, { owned = () => true } = {}) {
  const results = [];
  for (const goal of quests(lc.inspect().root)) {
    if (goal.status !== 'completed' || state.recovered.has(goal.id)) continue;
    state.recovered.add(goal.id);
    results.push({ goalId: goal.id, retire: await questWrite((observe) => lc.retire('goals', goal.id, 'retire-completed', { observe }), owned) });
  }
  return results;
}
