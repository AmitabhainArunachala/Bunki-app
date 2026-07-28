/**
 * `persistMinted` writes down evidence; it cannot create any (WP-10;
 * REQ-ARCH-04, controller §5, §21.3(5)).
 *
 * ## Why this file is the price of closing COORD-B8-2
 *
 * WP-10's closeout refused to join the session log to the store, and gave a
 * precise reason: making `AppStore` accept events it did not mint sounds like an
 * `ingest(events)` method, and an `ingest` typed on `DomainEvent[]` would take an
 * object literal that a screen typed by hand — a hole straight through the
 * evidence boundary, which controller §21.3(5) makes a stop condition. That
 * refusal was right, and the seam that replaced it is only defensible if the hole
 * really is closed rather than relocated.
 *
 * So this file attacks the new path the way a verifier should. Every test below
 * is an attempt to get a `ReviewGraded` that no learner produced into the durable
 * log through `persistMinted`, and every one of them is a *plausible* attempt:
 * a well-formed literal, a real event round-tripped through JSON, a real event
 * edited in place, a hand-built container. None of them is malformed; schema
 * validation would accept all four.
 *
 * ## The guards, and how to check they are load-bearing
 *
 * Two, both in `@bunki/domain`:
 *
 *   1. `sealMintedEvents` refuses a member the mint registry does not recognise;
 *   2. `openMintedEventBatch` refuses a container it did not build, and re-checks
 *      every member.
 *
 * Delete either and this file goes red. `packages/domain/test/events/
 * provenance.test.ts` holds the same property at the kernel end; this one holds
 * it at the surface the app actually calls, because a guard that the store
 * happens to route around is not a guard.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ForeignEventError,
  createDeterministicContext,
  mintReviewGraded,
  sealMintedEvents,
  type DomainContext,
  type DomainEvent,
  type MintedEventBatch,
} from '@bunki/domain';

import { SESSION_INTEGRATION_NOTE } from '../src/screens/session-loop.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';

const ASOF = '2026-07-27T10:00:00.000Z';

const newContext = (prefix: string): DomainContext =>
  createDeterministicContext({ instants: ASOF, idPrefix: prefix });

function newStore(prefix: string): { store: AppStore; context: DomainContext } {
  const context = newContext(prefix);
  return { store: createMemoryAppStore({ context }), context };
}

/**
 * A tier-A `ReviewGraded` that would satisfy the parser and mislead a reader.
 *
 * This is the attack, stated plainly: not a broken event, a *convincing* one.
 * `easy`, confirmed, fast, nothing revealed — the shape of a learner recalling
 * something perfectly. If this reaches the log, the export and the inspector both
 * report a review that never happened, which is definition-of-done §2 item 6.
 */
const FORGED_REVIEW = {
  type: 'ReviewGraded',
  eventId: 'ev-forged-0001',
  v: 1,
  occurredAt: ASOF,
  idempotencyKey: 'forged:review:1',
  contractId: 'contract-reading-lex-bunki',
  grade: 'easy',
  latencyMs: 40,
  hintsUsed: 0,
  revealedBeforeRecall: false,
  userConfirmedEasy: true,
  probeContext: 'standalone',
  tier: 'A',
} as unknown as DomainEvent;

function aRealReview(context: DomainContext, key = 'review:real:1'): DomainEvent {
  return mintReviewGraded(
    context,
    {
      contractId: 'contract-reading-lex-bunki',
      grade: 'good',
      latencyMs: 2100,
      hintsUsed: 0,
      revealedBeforeRecall: false,
      probeContext: 'standalone',
    },
    { idempotencyKey: key },
  );
}

describe('the persist seam accepts what the kernel minted', () => {
  it('appends a gate-minted review and makes it part of the log and the derived state', () => {
    const { store, context } = newStore('persist-ok-');
    const review = aRealReview(context);

    const ack = store.persistMinted(sealMintedEvents([review]));

    expect(ack.appended).toEqual([review]);
    expect(ack.alreadyPresent).toEqual([]);
    expect(store.readAll()).toEqual([review]);
    // The gate still judges it, and still refuses it — there is no contract in
    // this log. That refusal is the point: persisting is not admitting.
    const decision = store.readDerived().gateDecisions.find((d) => d.eventId === review.eventId);
    expect(decision?.admitted).toBe(false);
  });

  it('is idempotent by each event’s own key, so re-offering a workspace appends nothing', () => {
    const { store, context } = newStore('persist-idem-');
    const review = aRealReview(context);

    store.persistMinted(sealMintedEvents([review]));
    const second = store.persistMinted(sealMintedEvents([review]));

    expect(second.appended).toEqual([]);
    expect(second.alreadyPresent).toEqual([review]);
    expect(store.readAll()).toHaveLength(1);
  });

  it('accepts an empty batch without appending or notifying', () => {
    const { store } = newStore('persist-empty-');
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    expect(store.persistMinted(sealMintedEvents([])).appended).toEqual([]);
    expect(notifications).toBe(0);
  });
});

describe('the persist seam refuses everything the kernel did not mint', () => {
  it('refuses a hand-written tier-A review that would pass the schema', () => {
    const { store } = newStore('persist-forged-');

    expect(() => store.persistMinted(sealMintedEvents([FORGED_REVIEW]))).toThrow(ForeignEventError);
    expect(store.readAll()).toEqual([]);
  });

  it('refuses it at the seal, before the store is reached at all', () => {
    // Isolated on purpose. The line above cannot tell which of the two guards
    // stopped the forgery, so deleting the seal's member check leaves it green
    // (the store's re-check catches it). This one exercises only the seal, so the
    // seal is falsifiable on its own — the same reason
    // `refuses a container built with the real seal symbol` below isolates the
    // store's re-check.
    expect(() => sealMintedEvents([FORGED_REVIEW])).toThrow(ForeignEventError);
  });

  it('refuses a container built with the real seal symbol and a forged payload', () => {
    // The seal symbol cannot be named by any module, but it can be *recovered
    // from an instance*, so a holder of one genuine batch can build a container
    // that passes the brand check and fill it with anything. This is the attack
    // the store's member re-check exists for, and the only test in this file that
    // reaches it: the brand is a typing device, the re-check is the guarantee.
    const { store, context } = newStore('persist-branded-');
    const genuine = sealMintedEvents([aRealReview(context)]);
    const [seal] = Object.getOwnPropertySymbols(genuine);
    expect(seal).toBeDefined();

    const brandedForgery = {
      [seal as symbol]: [FORGED_REVIEW],
      size: 1,
    } as unknown as MintedEventBatch;

    try {
      store.persistMinted(brandedForgery);
      expect.unreachable('a branded container with a forged member must not reach the log');
    } catch (error) {
      expect((error as ForeignEventError).reason).toBe('not_minted_here');
    }
    expect(store.readAll()).toEqual([]);
  });

  it('refuses a forged review smuggled in beside a genuine one', () => {
    // The interesting case: a batch that is *mostly* real. Nothing may be
    // appended — a partial write would leave the log holding half a gesture, and
    // the half it kept would be the attacker's choice.
    const { store, context } = newStore('persist-mixed-');
    const real = aRealReview(context);

    expect(() => store.persistMinted(sealMintedEvents([real, FORGED_REVIEW]))).toThrow(
      ForeignEventError,
    );
    expect(store.readAll()).toEqual([]);
  });

  it('refuses a genuine event that made a JSON round trip', () => {
    // The gate's standing argument — a brand does not survive JSON — asserted at
    // the app end. It does not survive, and that is the correct answer here: the
    // persist path is in-process, and a value that arrived as bytes belongs to
    // the rehydration path, which uses `parseEvent` and the adapter's authority.
    const { store, context } = newStore('persist-json-');
    const parsed = JSON.parse(JSON.stringify(aRealReview(context))) as DomainEvent;

    expect(() => store.persistMinted(sealMintedEvents([parsed]))).toThrow(ForeignEventError);
    expect(store.readAll()).toEqual([]);
  });

  it('refuses a genuine event whose grade was rewritten after minting', () => {
    const { store, context } = newStore('persist-tamper-');
    const review = mintReviewGraded(
      context,
      {
        contractId: 'contract-reading-lex-bunki',
        grade: 'good',
        latencyMs: 800,
        hintsUsed: 0,
        // The reveal rule forces `again` at the mint (T-06).
        revealedBeforeRecall: true,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:tamper:1' },
    );
    expect(review.grade).toBe('again');

    // The app really does hold minted events — `applySessionCommand` returns them
    // in the workspace log — so this is reachable, not theoretical.
    (review as { grade: string }).grade = 'good';

    try {
      store.persistMinted(sealMintedEvents([review]));
      expect.unreachable('a mutated event must not reach the log');
    } catch (error) {
      expect((error as ForeignEventError).reason).toBe('mutated_after_mint');
    }
    expect(store.readAll()).toEqual([]);
  });

  it('refuses a container the kernel did not seal', () => {
    // A caller who reached `persistMinted` through `any` — the shape of the hole
    // an `ingest(events)` method would have been.
    const { store } = newStore('persist-unsealed-');
    const forgedBatch = {
      size: 1,
      events: [FORGED_REVIEW],
    } as unknown as MintedEventBatch;

    try {
      store.persistMinted(forgedBatch);
      expect.unreachable('an unsealed batch must not be opened');
    } catch (error) {
      expect((error as ForeignEventError).reason).toBe('unsealed_batch');
    }
    expect(store.readAll()).toEqual([]);
  });

  it('refuses a plain array of genuine events, because an array is not a batch', () => {
    const { store, context } = newStore('persist-array-');
    const real = aRealReview(context);

    expect(() => store.persistMinted([real] as unknown as MintedEventBatch)).toThrow(
      ForeignEventError,
    );
    expect(store.readAll()).toEqual([]);
  });
});

describe('the persist seam is persist-only', () => {
  it('takes one opaque argument and nothing that could describe an observation', () => {
    // A source assertion, because the property is about the *signature* rather
    // than about any one call. `persistMinted` takes a sealed batch and nothing
    // else; if it ever grew a payload-shaped parameter — a grade, a tier, a
    // contract id — it would have become a minter, and the thing that makes it
    // safe would be gone.
    const declaration = /persistMinted:\s*\(batch:\s*MintedEventBatch\)\s*=>\s*PersistAck;/;
    expect(declaration.test(readSource('../src/state/store.ts'))).toBe(true);
  });

  it('reaches no factory and no minter inside the persist function', () => {
    // `memory-store.ts` legitimately mints for its *own* commands, so the check
    // is narrower than "no minters in the file": the persist function's body must
    // reach none of them. Sliced rather than grepped whole so a later edit inside
    // it is covered by the same assertion.
    const source = readSource('../src/state/memory-store.ts');
    const start = source.indexOf('function persistMinted(');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('if (initialEvents !== undefined)', start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);

    for (const forbidden of [
      'createDomainEvent',
      'mintReviewGraded',
      'mintExposureLogged',
      'mintEvidenceSuperseded',
      'replay(',
    ]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    // It does open the batch, which is where both guards run.
    expect(body).toContain('openMintedEventBatch(batch)');
  });
});

describe('the session note describes what is now true', () => {
  it('no longer claims the sitting is missing from the log', () => {
    // The note used to say a sitting's observations "do not survive a reload and
    // do not appear in an export". That was true and is not any more, and a
    // stale disclosure is its own honesty defect (REQ-GATE-03): a learner who
    // read it would under-trust their own record.
    expect(SESSION_INTEGRATION_NOTE).not.toMatch(/do not appear in an export/i);
    expect(SESSION_INTEGRATION_NOTE).not.toMatch(/COORD-B8-2/);
    expect(SESSION_INTEGRATION_NOTE).toMatch(/durable log/i);
    expect(SESSION_INTEGRATION_NOTE).toMatch(/evidence inspector/i);
    // …and it still names what is *not* in the log, which is the plan.
    expect(SESSION_INTEGRATION_NOTE).toMatch(/plan/i);
  });
});

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}
