/**
 * The proposed M4 review caller, r3.1 (window 4 design for R2; not product code). One function turns a prepared M4/W3
 * attempt into the one hook call; every entrance reaches it only through a practice room's PREPARE_REVIEW.
 *   r2/r3: owner/epoch/journey/attempt binding, rechecked before the call; at most once per prepared identity; results
 *   owned per record epoch.
 *   r3.1 (W3 0532, for W2 0524 C1): the producer's retained record is the only authority. custody.retained() returns it
 *   from the model-owned state, only after transportReview accepts the received candidate. Before any hook call the
 *   caller checks the attempt, owner and journey against that record, and the binding's learning session and origins
 *   against its context, exactly; then the admitted rule's assertPreserved(retained raw, retained context, received)
 *   re-derives the whole annotation. Any failure: zero calls. The hook gets a private admission (the retained raw and
 *   context) and refuses an annotated candidate without one.
 * Everything is injected (no imports), so the probe can test edits of this file.
 *   core: srs-core · hook: { report(candidate, admission) } · lines: { forReason } · ownership(): { owner, journeyId, epoch }
 *   custody: { retained(attemptId, candidate) } → { details, rawCandidate, context }, throwing unless transport is intact
 *   admit: the admitted relevance rule ({ assertPreserved }) · course: W3 (unused by the design)
 */
export function createCaller({ core, hook, lines, ownership, custody, admit, course }) {
  const consumed = new Set();
  const results = new Map();
  const calls = [];
  const preparedKey = (owner, journeyId, attemptId) => `${owner}/${journeyId}/${attemptId}`;
  const resultKey = (owner, journeyId, epoch, attemptId) => `${owner}/${journeyId}/${epoch}/${attemptId}`;
  const refusal = (reason) => ({ write: false, reason });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const annotated = (c) => c?.helpRelevance != null || (Array.isArray(c?.help) && c.help.some((row) => row && Object.hasOwn(row, 'relevance')));
  /**
   * observe one journey dispatch. binding: what the host captured when it dispatched this PREPARE_REVIEW —
   * { owner, journeyId, epoch, attemptId, sessionId, origins }. Returns the outcome, or null.
   */
  async function observe(action, result, binding, prev) {
    void prev; void course; // the prior state is never consulted: nothing but a prepared attempt reaches the hook
    if (action?.type !== 'PREPARE_REVIEW' || result?.status !== 'prepared') return null;
    const { attemptId, journeyId, owner, candidate } = result.details;
    if (!binding || action.attemptId !== attemptId || binding.attemptId !== attemptId) return refusal('attempt-mismatch');
    if (binding.owner !== owner || binding.journeyId !== journeyId || !Number.isSafeInteger(binding.epoch)) return refusal('owner-unbound');
    const key = preparedKey(owner, journeyId, attemptId);
    if (consumed.has(key)) return null;
    const rkey = resultKey(owner, journeyId, binding.epoch, attemptId);
    const settle = (outcome) => { results.set(rkey, outcome); return outcome; };
    if (!core.trustedSurface(candidate?.surface)) return settle(refusal('untrusted-surface'));
    let rec;
    try {
      rec = custody.retained(attemptId, candidate);
    } catch {
      return settle(refusal('review-unverified'));
    }
    if (!rec || rec.details?.attemptId !== attemptId || rec.details.owner !== owner || rec.details.journeyId !== journeyId ||
      rec.context?.attemptId !== attemptId) return settle(refusal('review-unverified'));
    if (binding.sessionId !== rec.context.sessionId || !same(binding.origins, rec.context.origins)) return settle(refusal('review-unverified'));
    if (annotated(candidate)) {
      try {
        admit.assertPreserved(rec.rawCandidate, rec.context, candidate);
      } catch {
        return settle(refusal('review-unverified'));
      }
    }
    const live = ownership();
    if (live.owner !== owner || live.journeyId !== journeyId || live.epoch !== binding.epoch) {
      consumed.add(key);
      return settle(refusal('owner-changed'));
    }
    consumed.add(key);
    calls.push({ key: rkey, surface: candidate.surface, entrance: result.state.journey.location.entrance });
    let outcome;
    try {
      outcome = await hook.report(candidate, { epoch: binding.epoch, attemptId, sessionId: rec.context.sessionId, origins: rec.context.origins, raw: rec.rawCandidate });
    } catch {
      outcome = { write: false, reason: 'publish-uncertain' };
    }
    if (!outcome || typeof outcome.write !== 'boolean') outcome = { write: false, reason: 'publish-uncertain' };
    return settle(outcome);
  }
  /** what a view shows for one of its attempts: only the view of the same owner, journey and record epoch sees it */
  function resultFor(view, attemptId) {
    return results.get(resultKey(view.owner, view.journeyId, view.epoch, attemptId)) ?? null;
  }
  /** the one visible line for an outcome: the hook's own line, else the shared line for its reason (never empty) */
  function lineFor(outcome, lang = 'en') {
    if (!outcome || outcome.write) return null;
    return outcome.line || lines.forReason(outcome.reason, lang);
  }
  return { observe, resultFor, lineFor, calls };
}
