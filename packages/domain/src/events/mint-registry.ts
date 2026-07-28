/**
 * The in-process mint registry (WP-10; REQ-ARCH-04).
 *
 * ## What this file is, in one sentence
 *
 * A module-private record of the exact event objects this kernel's two minters
 * produced during the life of this process, and of the bytes each one had when
 * it was produced.
 *
 * ## Why it exists, and why the earlier objection does not apply to it
 *
 * `src/evidence/gate.ts` says, correctly, that a brand is worthless as a *trust*
 * marker at a JSON boundary: `CANDIDATE_MARKERS` checks shape rather than a
 * class or a symbol precisely because a value crossing JSON arrives as a plain
 * object with no identity left. WP-10's integrator drew the conclusion that a
 * store could therefore never tell a gate-minted `ReviewGraded` from a literal
 * shaped like one, and closed the durable-session join as impossible without a
 * gate bypass (COORD-B8-2).
 *
 * The conclusion holds for the boundary it was made about and not for this one.
 * The persist path is **in-process by construction**: the session workspace
 * mints an event and hands that same object, in the same JavaScript heap, to the
 * store, which appends it and journals it. Nothing crosses JSON on the way *in*.
 * The one place bytes come back across JSON is the rehydration path, which does
 * not use this registry at all — it uses `parseEvent`, the fail-closed parser,
 * because the durable adapter is the authority for what it already holds.
 *
 * So the question this registry answers is not "was this value ever minted by
 * some kernel somewhere", which no marker can answer, but "is this the very
 * object my minters returned a moment ago", which object identity answers
 * exactly. A literal is not; a `structuredClone` is not; a `JSON.parse` of a
 * real event is not.
 *
 * ## Why the bytes are recorded too
 *
 * Identity alone would let a holder of a real minted event mutate it in place
 * and persist the mutation — the app *does* hold real minted events, because
 * `applySessionCommand` returns them in the workspace log. Recording the
 * canonical bytes at mint time and re-comparing on the way out closes that:
 * `grade` cannot be rewritten from `again` to `good` between the mint and the
 * append. The comparison is over canonical JSON (sorted keys) so it depends on
 * content and not on property insertion order.
 *
 * ## Why nothing here is exported from the package barrel
 *
 * `recordKernelMint` is the write side of the registry. A module outside this
 * kernel that could call it could launder any literal into "minted", which is
 * the hole this whole file exists to close. `src/events/index.ts` therefore does
 * not re-export this module, and `@bunki/domain`'s `exports` map publishes only
 * `src/index.ts`, so there is no specifier an application could use to reach it.
 * `packages/domain/test/events/provenance.test.ts` asserts both of those facts.
 *
 * The registry is a `WeakMap`, so a minted event that nothing else references is
 * collected normally; this adds no lifetime to anything.
 */

import { canonicalJson } from '../replay/canonical-json.ts';
import type { DomainEvent } from './catalog.ts';

/** minted event object → its canonical JSON at the instant it was minted. */
const MINTED: WeakMap<object, string> = new WeakMap<object, string>();

/**
 * Record that this kernel minted `event`, and return it unchanged.
 *
 * Called from exactly two places — `src/events/factories.ts` and
 * `src/evidence/mint.ts` — which are the same two files
 * `test/purity/no-ambient-nondeterminism.test.ts` already pins as the complete
 * set of minters. `test/events/provenance.test.ts` pins that this function has
 * no third caller, so a new minter cannot appear without joining the registry.
 */
export function recordKernelMint<TEvent extends DomainEvent>(event: TEvent): TEvent {
  MINTED.set(event, canonicalJson(event));
  return event;
}

/** Why a value is not an acceptable minted event, or `null` when it is one. */
export type MintCheckFailure = 'not_minted_here' | 'mutated_after_mint';

/**
 * Check one value against the registry.
 *
 * Returns the failure rather than throwing, so the two public callers can
 * decide how to report it and so this file holds no error-message policy.
 */
export function checkKernelMint(value: unknown): MintCheckFailure | null {
  if (typeof value !== 'object' || value === null) return 'not_minted_here';
  const recorded = MINTED.get(value);
  if (recorded === undefined) return 'not_minted_here';
  return canonicalJson(value) === recorded ? null : 'mutated_after_mint';
}
