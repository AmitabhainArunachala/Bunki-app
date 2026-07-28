/**
 * The persist seam: sealed batches of kernel-minted events (WP-10; REQ-ARCH-04,
 * REQ-ARCH-08, controller §5, §11).
 *
 * ## The defect this closes
 *
 * Until WP-10's closeout, nothing a learner did inside a sitting reached the
 * durable log. The session workspace minted `SessionStarted`, `ContractCreated`,
 * `ReviewGraded`, `ExposureLogged` and `SessionClosed` correctly — through this
 * kernel's factories, with the evidence-class ones minted by the gate — and then
 * held them in a React screen's state, beside the store rather than in it. The
 * export therefore could not reproduce the inspected event history, which
 * REQ-ARCH-08 requires, and the evidence inspector could not show the sitting at
 * all.
 *
 * The join was left open for one reason, recorded as COORD-B8-2: making the
 * store accept events it did not mint sounded like an `ingest(events)` method,
 * and an `ingest` that took `DomainEvent[]` would accept an object literal with
 * `type: "ReviewGraded"` and `tier: "A"` typed by hand in a screen. That is the
 * evidence-gate bypass REQ-ARCH-04 forbids and controller §21.3(5) makes a stop
 * condition, so not doing it was right.
 *
 * ## What is different here
 *
 * The store still never mints these events, and it still cannot. What changed is
 * that "an event this kernel minted" became a checkable property *on the
 * in-process path*, held by `./mint-registry.ts` — read its header for why the
 * gate's "a brand does not survive JSON" argument is true and does not apply to
 * a heap-local handoff.
 *
 * On top of that this module adds a container the application cannot construct:
 *
 *   - {@link sealMintedEvents} is the only function that builds a
 *     {@link MintedEventBatch}, and it refuses any member the registry does not
 *     recognise;
 *   - {@link openMintedEventBatch} is the only function that reads one, and it
 *     re-checks the brand *and* every member — so a forged container fails, and
 *     so does a real container whose contents were swapped after sealing.
 *
 * Two independent guards over one mechanism, and both are load-bearing:
 * `apps/app/test/persist-minted-boundary.test.ts` deletes each of them in turn
 * and asserts the suite goes red.
 *
 * ## What this is deliberately not
 *
 * It is **not** a claim that an event is *true*, *admitted*, or *scheduled*.
 * Sealing carries no judgement: `admitToScheduler` still decides what reaches
 * FSRS, at replay, over whatever the log holds, exactly as before. A sealed
 * batch says one thing only — these objects came out of this kernel's minters
 * and have not been altered since.
 *
 * It is also **not** a durability or an ordering guarantee. The store appends in
 * the order the batch lists, and what that means for the bytes is
 * `@bunki/persistence`'s answer, not this file's.
 */

import { ForeignEventError } from '../errors.ts';
import type { DomainEvent } from './catalog.ts';
import { checkKernelMint } from './mint-registry.ts';

/**
 * Read-only provenance predicate.
 *
 * True when `value` is the very object one of this kernel's minters returned in
 * this process and its bytes are unchanged since. Exported because a surface may
 * legitimately want to *ask* — the debug screen does — and because a predicate
 * grants no ability the caller did not already have. The registry's write side
 * stays unexported; see `./mint-registry.ts`.
 */
export function isKernelMinted(value: unknown): value is DomainEvent {
  return checkKernelMint(value) === null;
}

/**
 * Assert provenance, or throw {@link ForeignEventError}.
 *
 * @throws ForeignEventError with `reason: "not_minted_here"` for a literal, a
 *   clone, or a parsed value; `reason: "mutated_after_mint"` for a real minted
 *   event that was changed after minting.
 */
export function assertKernelMinted(value: unknown): asserts value is DomainEvent {
  const failure = checkKernelMint(value);
  if (failure === null) return;
  const type =
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
      ? (value as { type: string }).type
      : null;
  throw new ForeignEventError(failure, type);
}

/**
 * The key the sealed container hides its payload under.
 *
 * A module-private `Symbol` — not `Symbol.for`, which would put it in the
 * cross-realm registry where any module could look it up by name. No module can
 * *name* this key, and the type system will not let one try.
 *
 * ## What that is worth, stated exactly rather than generously
 *
 * It is not a capability check. A holder of a real batch can recover the symbol
 * from the instance — `Object.getOwnPropertySymbols(batch)[0]` — and build a new
 * object carrying that key with a payload of its own. That is a two-line attack
 * and `test/events/provenance.test.ts` performs it, because a comment claiming
 * otherwise would be exactly the kind of unearned assurance this codebase keeps
 * failing builds over.
 *
 * So the brand is a *typing* device: it makes `persistMinted(literal)` a compile
 * error and makes the intent legible at every call site. The thing that actually
 * holds is {@link openMintedEventBatch}'s member re-check, which asks the mint
 * registry about every event on the way out and therefore does not care how the
 * container was assembled. Deleting the re-check is what opens the hole; deleting
 * the brand only makes the mistake easier to type.
 */
const SEALED: unique symbol = Symbol('bunki.mintedEventBatch');

/**
 * An opaque, sealed batch of kernel-minted events.
 *
 * The interface is deliberately almost empty: a holder can ask how many events
 * are inside and nothing else. Reading the events is `openMintedEventBatch`'s
 * job, and the only caller that needs to is the store's persist path. Typing the
 * store's entry point as this — rather than as `readonly DomainEvent[]` — is
 * what makes "the app cannot hand the store a literal" a statement the compiler
 * checks, before the runtime guard has to.
 */
export interface MintedEventBatch {
  readonly [SEALED]: readonly DomainEvent[];
  /** How many events this batch carries. Safe to render; carries no payload. */
  readonly size: number;
}

/**
 * Seal events for the persist path.
 *
 * Every member is checked against the mint registry, so this cannot be used to
 * launder a literal even from inside this package. The array is copied and
 * frozen, so a caller that keeps a reference to the array it passed in cannot
 * change what a sealed batch holds afterwards.
 *
 * An empty batch is legal and is the normal answer for a command that appended
 * nothing (a skip, a repeated tap). Callers should not have to special-case it.
 *
 * @throws ForeignEventError if any member was not minted by this kernel in this
 *   process, or was mutated after it was.
 */
export function sealMintedEvents(events: readonly DomainEvent[]): MintedEventBatch {
  const sealed: readonly DomainEvent[] = Object.freeze([...events]);
  for (const event of sealed) assertKernelMinted(event);
  return Object.freeze({ [SEALED]: sealed, size: sealed.length });
}

/**
 * Open a sealed batch.
 *
 * Re-checks both guards rather than trusting the type: the brand, because a
 * caller reaching this through `any` or across a boundary the compiler did not
 * see would otherwise hand in a plain object; and every member again, because
 * the type says nothing about what happened between the seal and here — and
 * because the brand is recoverable from an instance (see {@link SEALED}), so a
 * container carrying the right symbol is *not* evidence that this module filled
 * it. The member re-check is the guard that does not depend on that.
 *
 * @throws ForeignEventError with `reason: "unsealed_batch"` for a container this
 *   module did not produce, or the member's own reason for a bad member.
 */
export function openMintedEventBatch(batch: MintedEventBatch): readonly DomainEvent[] {
  if (typeof batch !== 'object' || batch === null || !(SEALED in batch)) {
    throw new ForeignEventError('unsealed_batch');
  }
  const events = (batch as { readonly [SEALED]: unknown })[SEALED];
  if (!Array.isArray(events)) throw new ForeignEventError('unsealed_batch');
  for (const event of events as readonly unknown[]) assertKernelMinted(event);
  return events as readonly DomainEvent[];
}
