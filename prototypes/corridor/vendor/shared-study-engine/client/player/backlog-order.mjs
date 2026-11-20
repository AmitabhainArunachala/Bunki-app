/** Order an already-eligible, introduced review set; this is not admission.
 * The caller supplies a scheduler constructed from the accepted FSRS pin and
 * owns module/content/sibling/permit filtering. No entries are added or dropped
 * except by the explicit limit, which is applied after ranking the entire set.
 * Equal retrievability retains the caller's existing queue order.
 */
export function orderBacklogReviews(projection, entries, {scheduler, now = Date.now, limit = Infinity} = {}) {
  if (!projection?.tasks || !Array.isArray(entries) || typeof scheduler?.get_retrievability !== 'function' || typeof now !== 'function') {
    throw new TypeError('backlog-order-input-required');
  }
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) throw new RangeError('backlog-order-limit');
  const at = now();
  if (!Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) throw new RangeError('backlog-order-time');
  const ranked = entries.map((entry, index) => {
    const card = projection.tasks[entry.taskKey]?.card;
    if (!card || !projection.introductions?.[entry.taskKey]) throw new TypeError('backlog-order-introduced-review-required');
    // The numeric API performs the pinned elapsed-time/stability calculation;
    // never duplicate its formula or compare formatted percentage strings.
    const retrievability = scheduler.get_retrievability(card, new Date(at), false);
    if (!Number.isFinite(retrievability) || retrievability < 0 || retrievability > 1) throw new RangeError('backlog-order-retrievability');
    return {entry, index, retrievability};
  });
  ranked.sort((a, b) => a.retrievability - b.retrievability || a.index - b.index);
  return ranked.slice(0, limit).map(row => row.entry);
}
