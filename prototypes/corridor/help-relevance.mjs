// W3 r8 proposal. Pure classification only; no scheduling, storage or product install.
const FACETS = ['meaning', 'reading', 'form'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const insist = (ok, reason) => { if (!ok) throw new Error(reason); };
const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, sort(value[key])]),
  );
  return value;
}
const han = item => [...(item.kind === 'kanji' ? item.literal : item.term)]
  .filter(character => /^\p{Script=Han}$/u.test(character));
const pair = (a, b) => stable([a, b].sort());

/** Inject the actual pinned srs-core identities and the pinned relation catalog.
 * The caller must verify source hashes before creating this classifier.
 * Catalog pairs mean direct component/host only, never a transitive family graph.
 */
export function createRelevance({ itemIdentity, validItem, catalog }) {
  insist(typeof itemIdentity === 'function' && typeof validItem === 'function', 'identity-required');
  insist(catalog?.policy === 'w3-help-relevance-r8-v1' && Array.isArray(catalog.pairs) &&
    /^[a-f0-9]{64}$/.test(catalog.sourceVersion), 'pinned-catalog-required');
  const pairs = new Set(catalog.pairs.map(row => {
    insist(Array.isArray(row.items) && row.items.length === 2 &&
      row.items.every(value => text(value) && [...value].length === 1) &&
      Array.isArray(row.evidence) && row.evidence.length > 0, 'component-pair-invalid');
    return pair(...row.items);
  }));
  const policy = `${catalog.policy}:${catalog.sourceVersion}`;
  const identity = item => {
    insist(validItem(item), 'item-invalid');
    return `${item.kind}:${itemIdentity(item)}`;
  };
  function checkAttempt(attempt) {
    insist(attempt && text(attempt.attemptId) && text(attempt.sessionId) &&
      FACETS.includes(attempt.tests), 'attempt-binding-required');
    identity(attempt.item);
  }
  function checkRow(row) {
    insist(row && text(row.what) && Array.isArray(row.reveals) &&
      row.reveals.every(facet => FACETS.includes(facet)) &&
      new Set(row.reveals).size === row.reveals.length &&
      (row.at == null || Number.isFinite(row.at)) &&
      !Object.hasOwn(row, 'relevance'), 'raw-help-required');
    if (row.about != null) identity(row.about);
  }
  function checkOrigin(origin) {
    if (origin == null) return;
    insist(text(origin.eventId) && text(origin.sessionId) &&
      (origin.attemptId == null || text(origin.attemptId)), 'origin-invalid');
  }
  function relevance(row, attempt, origin = null) {
    checkAttempt(attempt); checkRow(row); checkOrigin(origin);
    if (row.about == null) {
      // A clock threshold cannot establish the session in which a row arose.
      if (origin == null) return undefined;
      if (origin.sessionId === attempt.sessionId) return 'target';
      // A legacy general answer may have shown THIS target: never infer safety.
      // New answer-bearing rows must name their actual item at capture time.
      return row.reveals.length ? undefined : 'unrelated';
    }
    if (identity(row.about) === identity(attempt.item)) return 'target';
    if (row.about.kind === 'word' && attempt.item.kind === 'word' &&
      row.about.term === attempt.item.term) return 'related';
    const left = han(row.about), right = han(attempt.item);
    if (left.some(a => right.some(b => a === b || pairs.has(pair(a, b))))) return 'related';
    return 'unrelated';
  }
  function labelCandidate(candidate, { attemptId, sessionId, origins }) {
    const attempt = { attemptId, sessionId, item: candidate.item, tests: candidate.tests };
    checkAttempt(attempt);
    const rows = candidate.help ?? [];
    insist(Array.isArray(rows) && Array.isArray(origins) && origins.length === rows.length,
      'one-origin-slot-per-row-required');
    const ids = origins.filter(Boolean).map(origin => origin.eventId);
    insist(new Set(ids).size === ids.length, 'duplicate-exposure-id');
    const help = rows.map((row, index) => {
      const label = relevance(row, attempt, origins[index]);
      return { ...structuredClone(row), ...(label ? { relevance: label } : {}) };
    });
    return {
      ...structuredClone(candidate), help,
      helpRelevance: { policy, attemptId, sessionId, targetIdentity: identity(attempt.item),
        tests: attempt.tests, origins: structuredClone(origins) },
    };
  }
  /** Consumer control: compare to the retained source, never to its own edited copy.
   * A new target/session/attempt gets a newly bound annotation from the same raw rows.
   * Transport of an already prepared candidate must not annotate again.
   */
  function assertPreserved(rawCandidate, context, observed) {
    const expected = labelCandidate(rawCandidate, context);
    insist(stable(expected) === stable(observed), 'relevance-or-exposure-binding-changed');
    return true;
  }
  return Object.freeze({ relevance, labelCandidate, assertPreserved, policy });
}
