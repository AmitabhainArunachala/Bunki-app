/**
 * The persist seam holds (WP-10; REQ-ARCH-04, controller §5, §21.3(5)).
 *
 * The defect this seam closes was a real one — no session event of any kind
 * reached the durable, exportable log — and the reason it stayed open was also a
 * real one: making a store accept events it did not mint sounds exactly like an
 * evidence-gate bypass. This file is the argument that the seam shipped is not
 * that bypass, made as executable assertions rather than as prose.
 *
 * Four properties, and every one of them fails if the corresponding guard is
 * deleted:
 *
 *   1. what the kernel mints is accepted;
 *   2. what the kernel did not mint is refused — literals, clones, JSON round
 *      trips, and events from a *different* kernel realm;
 *   3. a real minted event that was altered after minting is refused;
 *   4. the registry's write side is unreachable from outside this package, so
 *      "minted" cannot be claimed, only earned.
 *
 * Property 4 is the one that makes the other three worth anything. A guard whose
 * key is exported is a lock with the key taped to it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ForeignEventError,
  assertKernelMinted,
  createDeterministicContext,
  createDomainEvent,
  isKernelMinted,
  mintEvidenceSuperseded,
  mintExposureLogged,
  mintLookupFrictionLogged,
  mintProductionObserved,
  mintReviewGraded,
  openMintedEventBatch,
  sealMintedEvents,
  type DomainEvent,
  type MintedEventBatch,
} from '../../src/index.ts';
import { AT, READER_SOURCE, USER_PROVENANCE } from '../support/events.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A *fixed* clock, not a scripted one: this suite mints freely and the number
// of mints is not the property under test. Ids still advance, so no two events
// collide.
const context = createDeterministicContext({ instants: AT.t0, idPrefix: 'prov-', seed: 7 });

function aCapture(): DomainEvent {
  return createDomainEvent(
    context,
    'EncounterCaptured',
    {
      encounterId: 'enc-1',
      threadId: 'thr-1',
      text: '分岐',
      sourceRef: READER_SOURCE,
      provenance: USER_PROVENANCE,
    },
    { idempotencyKey: 'capture:1' },
  );
}

function aReview(): DomainEvent {
  return mintReviewGraded(
    context,
    {
      contractId: 'con-1',
      grade: 'good',
      latencyMs: 1200,
      hintsUsed: 0,
      revealedBeforeRecall: false,
      probeContext: 'standalone',
    },
    { idempotencyKey: 'review:1' },
  );
}

describe('mint provenance — what the kernel minted', () => {
  it('recognises an event from the generic factory', () => {
    expect(isKernelMinted(aCapture())).toBe(true);
  });

  it('recognises an event from every evidence-gate minter', () => {
    // Enumerated rather than sampled: the gate's monopoly is only as good as its
    // least-used door, and a family added later that skipped registration would
    // produce events the persist path silently refused.
    const minted: readonly DomainEvent[] = [
      aReview(),
      mintExposureLogged(
        context,
        { componentIds: ['component-0001'], experienceId: 'experience-0001' },
        { idempotencyKey: 'exposure:1' },
      ),
      mintLookupFrictionLogged(
        context,
        { targetRef: { targetType: 'lexeme', targetId: 'lexeme-0001' }, context: 'reading' },
        { idempotencyKey: 'lookup:1' },
      ),
      mintProductionObserved(
        context,
        { elicited: false, tier: 'C' as const },
        { idempotencyKey: 'production:1' },
      ),
      mintEvidenceSuperseded(
        context,
        {
          supersededEventId: 'ev-1',
          reason: 'user_correction',
          correction: { note: 'I had already seen it.' },
        },
        { idempotencyKey: 'supersede:1' },
      ),
    ];

    for (const event of minted) expect(isKernelMinted(event)).toBe(true);
    expect(sealMintedEvents(minted).size).toBe(minted.length);
    expect(openMintedEventBatch(sealMintedEvents(minted))).toEqual(minted);
  });
});

describe('mint provenance — what the kernel did not mint', () => {
  /**
   * A `ReviewGraded` that would pass the parser, the schema, and a reader.
   *
   * This is the actual attack the seam exists to stop: not a malformed object,
   * but a *well-formed* tier-A review with a good grade that no learner produced.
   * `parseEvent` accepts it — it is schema-valid — which is precisely why schema
   * validation is not the guard here.
   */
  const forgedReview = {
    type: 'ReviewGraded',
    eventId: 'ev-forged',
    v: 1,
    occurredAt: '2026-07-27T00:00:00.000Z',
    idempotencyKey: 'forged:1',
    contractId: 'con-1',
    grade: 'easy',
    latencyMs: 10,
    hintsUsed: 0,
    revealedBeforeRecall: false,
    userConfirmedEasy: true,
    probeContext: 'standalone',
    tier: 'A',
  } as unknown as DomainEvent;

  it('refuses a hand-written object literal', () => {
    expect(isKernelMinted(forgedReview)).toBe(false);
    expect(() => sealMintedEvents([forgedReview])).toThrow(ForeignEventError);
    expect(() => {
      assertKernelMinted(forgedReview);
    }).toThrow(/not minted by this kernel in this process/);
  });

  it('names the reason and the offered type rather than throwing a bare error', () => {
    try {
      sealMintedEvents([forgedReview]);
      expect.unreachable('sealing a forged event must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForeignEventError);
      const foreign = error as ForeignEventError;
      expect(foreign.code).toBe('FOREIGN_EVENT_PROVENANCE');
      expect(foreign.reason).toBe('not_minted_here');
      expect(foreign.eventType).toBe('ReviewGraded');
    }
  });

  it('refuses a JSON round trip of a genuinely minted event', () => {
    // The gate's own comment says a brand does not survive JSON. It does not,
    // and this is that fact asserted rather than assumed: the same bytes, a
    // different object, refused. The persist path is in-process by construction,
    // so this is the correct answer and not a limitation.
    const real = aReview();
    const copy = JSON.parse(JSON.stringify(real)) as DomainEvent;
    expect(copy).toEqual(real);
    expect(isKernelMinted(real)).toBe(true);
    expect(isKernelMinted(copy)).toBe(false);
    expect(() => sealMintedEvents([copy])).toThrow(ForeignEventError);
  });

  it('refuses a shallow clone that shares every field', () => {
    const real = aReview();
    expect(isKernelMinted({ ...real })).toBe(false);
  });

  it('refuses non-objects offered where an event is expected', () => {
    for (const value of [null, undefined, 'ReviewGraded', 42, [] as unknown]) {
      expect(isKernelMinted(value)).toBe(false);
    }
  });
});

describe('mint provenance — tampering after the mint', () => {
  it('refuses an event whose grade was rewritten after minting', () => {
    // The app legitimately *holds* minted events: `applySessionCommand` returns
    // them in the workspace log. Object identity alone would therefore let a
    // holder edit one and persist the edit, so the registry records the bytes
    // and re-compares them. Rewriting `again` to `good` is the concrete abuse.
    const real = mintReviewGraded(
      context,
      {
        contractId: 'con-1',
        grade: 'good',
        latencyMs: 900,
        hintsUsed: 0,
        // Reveal forces `again` at the mint (T-06); the tamper below tries to
        // put the submitted grade back.
        revealedBeforeRecall: true,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:tamper' },
    );
    expect(real.grade).toBe('again');
    expect(isKernelMinted(real)).toBe(true);

    (real as { grade: string }).grade = 'good';

    expect(isKernelMinted(real)).toBe(false);
    try {
      sealMintedEvents([real]);
      expect.unreachable('sealing a mutated event must throw');
    } catch (error) {
      expect((error as ForeignEventError).reason).toBe('mutated_after_mint');
    }
  });
});

describe('mint provenance — the sealed container', () => {
  it('refuses a container this module did not build', () => {
    const forgedBatch = { size: 1 } as unknown as MintedEventBatch;
    try {
      openMintedEventBatch(forgedBatch);
      expect.unreachable('opening a forged batch must throw');
    } catch (error) {
      expect((error as ForeignEventError).reason).toBe('unsealed_batch');
    }
  });

  it('refuses a container whose symbol key holds something else', () => {
    // The seal symbol is module-private, so this cannot even be attempted by
    // name — the nearest an attacker gets is copying the shape of a real batch,
    // which copies the *value* under a symbol they cannot reference. Both
    // spreads below therefore lose the payload, which is the property being
    // pinned: a batch cannot be rebuilt from outside.
    const real = sealMintedEvents([aReview()]);
    const shallow = { ...real } as MintedEventBatch;
    // A spread *does* copy own enumerable symbol keys, so this one still opens —
    // and it opens to the same frozen array, which is why that is harmless.
    expect(openMintedEventBatch(shallow)).toEqual(openMintedEventBatch(real));

    const rebuilt = JSON.parse(JSON.stringify(real)) as MintedEventBatch;
    expect(() => openMintedEventBatch(rebuilt)).toThrow(ForeignEventError);
  });

  it('does not let a caller change a batch after sealing it', () => {
    const events = [aReview()];
    const batch = sealMintedEvents(events);
    events.push(aCapture());
    expect(openMintedEventBatch(batch)).toHaveLength(1);
    expect(batch.size).toBe(1);
  });

  it('accepts an empty batch, because a command that appended nothing is normal', () => {
    expect(openMintedEventBatch(sealMintedEvents([]))).toEqual([]);
  });
});

describe('mint provenance — the registry has no public write side', () => {
  const read = (path: string): string => readFileSync(join(PACKAGE_ROOT, path), 'utf8');

  it('is not re-exported from the events barrel', () => {
    // Deleting this assertion is not enough to open the hole; deleting the *fact*
    // it pins is. `export * from './mint-registry.ts'` in the barrel would put
    // `recordKernelMint` on `@bunki/domain`'s public surface, and any screen
    // could then launder a literal into "minted".
    expect(read('src/events/index.ts')).not.toMatch(/from '\.\/mint-registry\.ts'/);
  });

  it('is not reachable through the package exports map', () => {
    const manifest = JSON.parse(read('package.json')) as { exports: Record<string, string> };
    expect(Object.keys(manifest.exports)).toEqual(['.']);
    expect(manifest.exports['.']).toBe('./src/index.ts');
  });

  it('has exactly two callers, both of them minters', () => {
    // The registration is what makes an event persistable, so a third caller
    // would be a third way to become "minted" — reviewed here rather than
    // discovered later. `factories.ts` and `mint.ts` are the same pair
    // `test/purity/no-ambient-nondeterminism.test.ts` already pins as the
    // complete set of files that read the injected clock and id generator.
    const callers = ['src/events/factories.ts', 'src/evidence/mint.ts'];
    for (const caller of callers) expect(read(caller)).toContain('recordKernelMint');

    const all = [
      'src/events/provenance.ts',
      'src/events/parse.ts',
      'src/events/catalog.ts',
      'src/session/commands.ts',
      'src/session/canvas.ts',
      'src/session/runtime.ts',
      'src/replay/replay.ts',
      'src/evidence/gate.ts',
    ];
    for (const other of all) expect(read(other)).not.toContain('recordKernelMint(');
  });
});
