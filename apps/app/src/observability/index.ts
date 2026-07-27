/**
 * Local observability for the app (WP-09; controller §12, REQ-ARCH-07).
 *
 * Two things live here and nothing else: the ring buffer (`./ring.ts`) and the
 * monotonic counter that stamps it.
 *
 * ## The second ambient-clock reader in `apps/app`, declared
 *
 * `src/state/runtime.ts` says it is the app's only reader of the ambient clock.
 * That is still true of the *domain* clock — the one that produces an event's
 * `occurredAt` — and it must stay true, because every event in the log has to
 * come from the injected `DomainContext`. This module reads a different thing
 * for a different purpose: a **monotonic counter**, which is not a clock and
 * cannot become one. `performance.now()` returns milliseconds since the page or
 * process started; it has no epoch, no timezone, and no meaning outside this
 * process, so it cannot be written into an event even by accident.
 *
 * The distinction is not pedantry. A wall clock can step backwards (an NTP
 * correction, a user changing the time), and a duration measured across a step
 * is a negative or wildly inflated number in the one surface whose whole job is
 * to tell you whether something was slow (REQ-ARCH-06's budget misses). A
 * monotonic source is the only honest instrument for a latency figure.
 */

export * from './ring.ts';

/**
 * Milliseconds since this counter was created.
 *
 * `performance.now()` where it exists — every browser, Hermes, and Node ≥16 —
 * and `Date.now()` as a last resort, with the origin subtracted so the
 * fallback's absolute epoch never reaches a record. The fallback is not
 * monotonic and the code says so rather than presenting both paths as equal.
 */
export function createElapsedCounter(
  source: { readonly now: () => number } | undefined = globalThis.performance,
): () => number {
  if (source !== undefined && typeof source.now === 'function') {
    const origin = source.now();
    return () => source.now() - origin;
  }
  const origin = Date.now();
  return () => Date.now() - origin;
}
