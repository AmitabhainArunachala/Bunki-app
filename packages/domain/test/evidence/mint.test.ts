/**
 * The gate is the sole factory for evidence (WP-06; REQ-ARCH-04).
 *
 * Two claims, and the second is the one that has teeth:
 *
 *   1. `src/evidence/mint.ts` can build every evidence-class family;
 *   2. nothing else can — the generic factory refuses them at the type level
 *      and throws for a caller who arrived through `any`.
 *
 * Without (2), (1) is just a convenience module. The monopoly is what makes
 * "AI output cannot mutate memory state" and "reveal forces again" structural
 * facts rather than conventions somebody remembers to follow.
 */

import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_EVENT_TYPES,
  EvidenceFactoryBoundaryError,
  createDeterministicContext,
  createDomainEvent,
  mintEvidenceSuperseded,
  mintExposureLogged,
  mintLookupFrictionLogged,
  mintProductionObserved,
  mintReviewGraded,
  type DomainContext,
} from '../../src/index.ts';
import { COMPONENT, T } from '../support/wp06.ts';

const context = (): DomainContext =>
  createDeterministicContext({ instants: T.review1, idPrefix: 'mint-', seed: 7 });

describe('only the gate mints evidence', () => {
  it.each(EVIDENCE_EVENT_TYPES.map((type) => [type] as const))(
    'the generic factory refuses %s at runtime',
    (type) => {
      expect(() =>
        // Cast is the point: this is the `any` path the runtime guard exists for.
        createDomainEvent(context(), type as never, {} as never, { idempotencyKey: 'k' }),
      ).toThrow(EvidenceFactoryBoundaryError);
    },
  );

  it('and at compile time', () => {
    // @ts-expect-error ReviewGraded is an evidence-class family; the factory's
    // type parameter is NonEvidenceEventType and excludes it.
    const build = () => createDomainEvent(context(), 'ReviewGraded', {}, { idempotencyKey: 'k' });
    expect(build).toBeTypeOf('function');
  });
});

describe('minted evidence is stamped, validated, and deterministic', () => {
  it('stamps tier A on a graded review — the caller cannot choose the tier', () => {
    const event = mintReviewGraded(
      context(),
      {
        contractId: 'contract-meaning',
        grade: 'good',
        latencyMs: 3100,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'embedded',
      },
      { idempotencyKey: 'review:1' },
    );

    expect(event.tier).toBe('A');
    expect(event.probeContext).toBe('embedded');
    expect(event.eventId).toBe('mint-event-0001');
    expect(event.occurredAt).toBe(T.review1);
    expect(event.v).toBe(1);
  });

  it('stamps tier D on exposure', () => {
    const event = mintExposureLogged(
      context(),
      { componentIds: [COMPONENT], experienceId: 'experience-1' },
      { idempotencyKey: 'exposure:1' },
    );
    expect(event.tier).toBe('D');
  });

  it('keeps the tier a parameter for production, because B and C are the caller’s call', () => {
    const elicited = mintProductionObserved(
      context(),
      { elicited: true, rubricId: 'rubric-1', rubricVersion: '1.0.0', tier: 'B' },
      { idempotencyKey: 'production:1' },
    );
    const spontaneous = mintProductionObserved(
      context(),
      { elicited: false, tier: 'C' },
      { idempotencyKey: 'production:2' },
    );

    expect(elicited.tier).toBe('B');
    expect(spontaneous.tier).toBe('C');
  });

  it('mints a correction that names what it replaces', () => {
    const event = mintEvidenceSuperseded(
      context(),
      {
        supersededEventId: 'ev-review-1',
        reason: 'misgraded',
        correction: { note: 'graded the reading prompt against the meaning contract' },
      },
      { idempotencyKey: 'supersede:1' },
    );

    expect(event.supersededEventId).toBe('ev-review-1');
    expect(event.correction.note.length).toBeGreaterThan(0);
  });

  it('validates on the way out — a malformed observation never reaches the log', () => {
    expect(() =>
      mintLookupFrictionLogged(
        context(),
        // `targetType` is a closed list; 'sentence' is not in it.
        { targetRef: { targetType: 'sentence' as never, targetId: 'x' }, context: 'reading' },
        { idempotencyKey: 'lookup:bad' },
      ),
    ).toThrow(/failed v1 schema validation/);
  });

  it('takes the idempotency key from the caller and never invents one', () => {
    const first = mintReviewGraded(
      context(),
      {
        contractId: 'contract-meaning',
        grade: 'good',
        latencyMs: 1,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:same-action' },
    );
    const second = mintReviewGraded(
      context(),
      {
        contractId: 'contract-meaning',
        grade: 'good',
        latencyMs: 1,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:same-action', eventId: first.eventId },
    );

    // Same key, same id, same content: the double-tap case replay treats as a
    // no-op rather than as two reviews.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('an unconfirmed easy is minted, not thrown away — the ledger records the refusal', () => {
    const event = mintReviewGraded(
      context(),
      {
        contractId: 'contract-meaning',
        grade: 'easy',
        latencyMs: 900,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:unconfirmed-easy' },
    );

    expect(event.grade).toBe('easy');
    expect('userConfirmedEasy' in event).toBe(false);
  });

  it('a confirmed easy keeps its confirmation', () => {
    const event = mintReviewGraded(
      context(),
      {
        contractId: 'contract-meaning',
        grade: 'easy',
        userConfirmedEasy: true,
        latencyMs: 900,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:confirmed-easy' },
    );

    expect(event.userConfirmedEasy).toBe(true);
  });

  it('drops a confirmation attached to a grade it cannot describe', () => {
    const event = mintReviewGraded(
      context(),
      {
        contractId: 'contract-meaning',
        grade: 'good',
        userConfirmedEasy: true,
        latencyMs: 900,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:confused-confirmation' },
    );

    expect(event.grade).toBe('good');
    expect('userConfirmedEasy' in event).toBe(false);
  });
});
