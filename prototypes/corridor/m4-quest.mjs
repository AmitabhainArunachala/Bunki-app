/** M4 v0 quests over the journey lifecycle (lead 1709/1835; W5 931f3c55, 1746, 1750, 1901; UX r4.2 7eae4438 §2–§3). A quest is
 * a goal in the journey root: take part in the 職・識・織 unit's whole-word Reading run, answering, seeing feedback and saying
 * whether you knew each word. It exists only with the switch ON. Bindings, tickets and pending writes live in this page's
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
const isQuest = (goal) => goal?.seed?.kind === 'reading';
export function quests(root) {
  return (root?.goals || []).filter(isQuest);
}
export function questFor(root, seed) {
  return quests(root).find((goal) => sameSeed(goal.seed, seed)) || null;
}

/** one page's quest memory; the corridor makes a new one for each record owner. `sessions` holds every started run's binding,
 * an empty one included, so a run binds once; `pending` holds each quest whose completion has not resolved */
export function createQuestState() {
  return { binding: null, sessions: new Map(), pending: new Map(), creating: new Map(), ending: new Set(), recovered: new Set() };
}

// refusals raised before any commit: nothing was written and no new hold was set (§2.3)
const BEFORE_COMMIT = {
  'owner-epoch': 'owner-changed', 'generation-changed': 'owner-changed', 'stale-root': 'owner-changed',
  'root-unavailable': 'structural', 'switch-off': 'structural', 'root-invalid': 'structural', 'byte-bound': 'structural',
  'authority-unavailable': 'structural', 'work-bound': 'pool-full',
};
/** an attempt whose publication is not proved: owner-changed when the owner moved, otherwise uncertain. A raw uncertain or
 * not-published commit already held this runtime in write(); a published reply that cannot be confirmed is held here (W5 1901) */
function unconfirmed(lc, out, owned) {
  if (!owned()) return { ...out, kind: 'owner-changed' };
  if (out.observed?.outcome === 'published') lc.holdUnconfirmed();
  return { ...out, kind: 'uncertain' };
}
/** one goal write with its own observer: published only with the exact-root acknowledgement and the same owner; a definite
 * failure only on the port's own not-published */
async function questWrite(lc, start, owned) {
  let observed = null;
  try {
    const value = await start((result) => { observed = result; });
    const exact = observed?.outcome === 'published' && observed.acknowledged === true && observed.rootHash === observed.proposedHash;
    if (exact && owned()) return { kind: 'published', value, observed };
    return unconfirmed(lc, { value, observed }, owned);
  } catch (error) {
    const reason = error?.message || 'refused';
    if (!observed) return { kind: BEFORE_COMMIT[reason] || 'refused', reason, observed };
    if (!owned()) return { kind: 'owner-changed', reason, observed };
    if (observed.outcome === 'not-published') return { kind: 'not-published', reason, observed };
    return unconfirmed(lc, { reason, observed }, owned);
  }
}

/** Q-05: one quest per occurrence. A pending End blocks a second, a create already in flight for it is joined, and the
 * occurrence is checked inside the queued mutation against the reconciled root, which also settles an unconfirmed create */
export async function createQuest(lc, state, seed, { owned = () => true } = {}) {
  const key = seedKey(seed);
  if (state.ending.has(key)) return { kind: 'pending-end' };
  const exists = () => {
    const goal = questFor(lc.inspect().root, seed);
    return goal ? { kind: 'exists', goalId: goal.id, status: goal.status } : null;
  };
  const inflight = state.creating.get(key);
  if (inflight) { await inflight; return exists() || { kind: 'refused', reason: 'create-unresolved' }; }
  const attempt = (async () => {
    const known = exists();
    if (known) return known;
    if (!owned()) return { kind: 'owner-changed' };
    const admit = (root) => { if (root.goals.some((goal) => isQuest(goal) && sameSeed(goal.seed, seed))) throw new Error('quest-exists'); };
    const out = await questWrite(lc, (observe) => lc.work('goals', { seed: structuredClone(seed), inspected: false, practiceSession: null },
      { observe, admit }), owned);
    if (out.reason === 'quest-exists') return exists() || out;
    if (out.kind === 'published') out.goalId = questFor(lc.inspect().root, seed)?.id ?? null;
    return out;
  })();
  state.creating.set(key, attempt);
  try { return await attempt; } finally { if (state.creating.get(key) === attempt) state.creating.delete(key); }
}

const readingRun = (run) => run?.unitId === QUEST_UNIT && run.round === 0 && ['check', 'preview'].includes(run.mode) &&
  Array.isArray(run.targets) && run.targets.length === 1 && run.targets[0] === 'reading';
const freshRun = (run) => run.cursor === 0 && run.responses.length === 0 && !run.complete;
/** once per started run: a fresh Reading run binds the unfinished quests present now that the caller finds eligible (a quest whose
 * source sentence changed is not: lead 2005); Meaning, mixed and repair runs bind none (decision 10). A run seen again, or first seen already answered, keeps what it had (W5 1901 F2), and a quest whose
 * completion is still pending keeps its earlier result. The binding keeps the lifecycle activation, journey and generation it
 * was made under (W2 1907), so a reboot or a switch retires it */
export function bindRun(state, lc, run, { eligible = () => true } = {}) {
  if (typeof run?.sessionId !== 'string') return null;
  const known = state.sessions.get(run.sessionId);
  if (known) return known.consumed ? null : known.binding;
  const root = lc.inspect().root;
  let binding = null;
  if (root && readingRun(run) && freshRun(run)) {
    const goals = quests(root).filter((goal) => goal.status === 'unfinished' && !state.pending.has(goal.id) && eligible(goal));
    if (goals.length) binding = { sessionId: run.sessionId, boot: lc.bootIdentity(), journeyId: root.id, generation: root.generation,
      goals: goals.map((goal) => ({ id: goal.id, seed: structuredClone(goal.seed) })) };
  }
  state.sessions.set(run.sessionId, { binding, consumed: false });
  state.binding = binding;
  return binding;
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

/** at the last self-check: complete each bound quest, then retire it as its own write. Every bound quest is reserved before the
 * first write starts (W5 1901 F1). Done is never shown before its write is published; an unknown completion starts no
 * retirement and keeps the quest out of later bindings */
export async function settleRun(lc, state, run, { course, owned = () => true } = {}) {
  const entry = state.sessions.get(run?.sessionId);
  const binding = entry && !entry.consumed ? entry.binding : null;
  if (!runQualifies(run, binding, course)) return [];
  entry.consumed = true;
  if (state.binding === binding) state.binding = null;
  const now = lc.inspect().root;
  if (binding.boot !== lc.bootIdentity() || binding.journeyId !== now?.id || binding.generation !== now?.generation) return [];
  for (const { id } of binding.goals) state.pending.set(id, 'completing');
  const results = [];
  for (const { id, seed } of binding.goals) {
    const goal = quests(lc.inspect().root).find((g) => g.id === id);
    if (!goal) { state.pending.delete(id); results.push({ goalId: id, complete: { kind: 'absent' } }); continue; }
    let complete;
    if (!owned()) complete = { kind: 'owner-changed' };
    else if (goal.status === 'completed') complete = { kind: 'already-completed' };
    else {
      let ticket;
      try { ticket = lc.completionTicket(id, binding.sessionId, seed); }
      catch (error) {
        state.pending.delete(id);
        results.push({ goalId: id, complete: { kind: BEFORE_COMMIT[error.message] || 'refused', reason: error.message } });
        continue;
      }
      complete = await questWrite(lc, (observe) => lc.completeGoal(id, ticket, { observe }), owned);
      // no commit was made for an already-completed goal, so there is no observation to read
      if (complete.value?.alreadyCompleted === true && complete.kind !== 'owner-changed') complete.kind = 'already-completed';
      else if (complete.kind === 'published' && complete.value?.confirmed !== true) complete.kind = 'uncertain';
    }
    if (complete.kind === 'uncertain') { state.pending.set(id, 'uncertain'); results.push({ goalId: id, complete }); continue; }
    state.pending.delete(id);
    if (!['published', 'already-completed'].includes(complete.kind)) { results.push({ goalId: id, complete }); continue; }
    state.recovered.add(id);
    const retire = owned() ? await questWrite(lc, (observe) => lc.retire('goals', id, 'retire-completed', { observe }), owned)
      : { kind: 'owner-changed' };
    results.push({ goalId: id, complete, retire });
  }
  return results;
}

/** Q-11b: End is abandon-and-retire. Until its outcome is known the occurrence takes no second quest; the run is left as it is */
export async function endQuest(lc, state, goalId, { owned = () => true } = {}) {
  const goal = quests(lc.inspect().root).find((g) => g.id === goalId);
  if (!goal) return { kind: 'absent' };
  if (!owned()) return { kind: 'owner-changed' };
  const key = seedKey(goal.seed);
  state.ending.add(key);
  const out = await questWrite(lc, (observe) => lc.retire('goals', goalId, 'abandon-and-retire', { observe }), owned);
  if (out.kind !== 'uncertain') state.ending.delete(key);
  if (out.kind === 'published' && state.binding) state.binding.goals = state.binding.goals.filter((g) => g.id !== goalId);
  return out;
}

/** on open: a completed quest still in the pool is done, and its retirement is tried once on this page (never in a loop) */
export async function recoverCompleted(lc, state, { owned = () => true } = {}) {
  const results = [];
  for (const goal of quests(lc.inspect().root)) {
    if (goal.status !== 'completed' || state.recovered.has(goal.id)) continue;
    if (!owned()) { results.push({ goalId: goal.id, retire: { kind: 'owner-changed' } }); continue; }
    state.recovered.add(goal.id);
    results.push({ goalId: goal.id, retire: await questWrite(lc, (observe) => lc.retire('goals', goal.id, 'retire-completed', { observe }), owned) });
  }
  return results;
}
/** Q-26: the learner clears one finished quest still in the pool, an explicit retry of its retirement (never automatic) */
export async function clearCompleted(lc, state, goalId, { owned = () => true } = {}) {
  const goal = quests(lc.inspect().root).find((g) => g.id === goalId);
  if (!goal || goal.status !== 'completed') return { kind: 'absent' };
  if (!owned()) return { kind: 'owner-changed' };
  state.recovered.add(goalId);
  return questWrite(lc, (observe) => lc.retire('goals', goalId, 'retire-completed', { observe }), owned);
}
