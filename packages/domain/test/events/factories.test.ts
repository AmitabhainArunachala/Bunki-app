/**
 * Event construction goes through the injected context, and cannot mint
 * evidence (WP-02; REQ-ARCH-02, REQ-ARCH-04).
 */

import { describe, expect, it } from 'vitest';

import {
  createDeterministicContext,
  createDomainEvent,
  createFixedClock,
  createScriptedClock,
  createSeededRandom,
  createSequentialIdGenerator,
  EvidenceFactoryBoundaryError,
  type DomainContext,
  type NonEvidenceEventType,
} from '../../src/index.ts';
import { AT, USER_PROVENANCE, READER_SOURCE } from '../support/events.ts';

const context = (): DomainContext =>
  createDeterministicContext({ instants: [AT.t0, AT.t1, AT.t2], idPrefix: 'ctx-', seed: 1 });

describe('createDomainEvent stamps the envelope from the context', () => {
  it('takes eventId and occurredAt from the injected id source and clock', () => {
    const event = createDomainEvent(
      context(),
      'EncounterCaptured',
      {
        encounterId: 'encounter-1',
        threadId: 'thread-1',
        text: '峠',
        sourceRef: READER_SOURCE,
        provenance: USER_PROVENANCE,
      },
      { idempotencyKey: 'capture:thread-1:1' },
    );

    expect(event.eventId).toBe('ctx-event-0001');
    expect(event.occurredAt).toBe(AT.t0);
    expect(event.v).toBe(1);
    expect(event.idempotencyKey).toBe('capture:thread-1:1');
  });

  it('produces the identical event twice from two identically-configured contexts', () => {
    const build = () =>
      createDomainEvent(
        context(),
        'ThreadPromotionChanged',
        { threadId: 'thread-1', from: 'captured', to: 'keep', origin: 'user' },
        { idempotencyKey: 'promote:thread-1:keep' },
      );

    expect(build()).toEqual(build());
  });

  it('lets a caller pin eventId and occurredAt, for replaying a recorded event verbatim', () => {
    const event = createDomainEvent(
      context(),
      'SessionStarted',
      { sessionId: 'session-1', budget: { timeBudgetMin: 12, newBudget: 1 } },
      { idempotencyKey: 'session:1', eventId: 'imported-1', occurredAt: AT.t5 },
    );
    expect(event.eventId).toBe('imported-1');
    expect(event.occurredAt).toBe(AT.t5);
  });

  it('validates its own output, so a factory cannot emit what the parser would reject', () => {
    expect(() =>
      createDomainEvent(
        context(),
        'EncounterCaptured',
        {
          encounterId: 'encounter-1',
          threadId: 'thread-1',
          text: '',
          sourceRef: READER_SOURCE,
          provenance: USER_PROVENANCE,
        },
        { idempotencyKey: 'capture:empty' },
      ),
    ).toThrow(/text/);
  });
});

describe('the evidence factory boundary (REQ-ARCH-04)', () => {
  it.each([
    'ReviewGraded',
    'ProductionObserved',
    'ExposureLogged',
    'LookupFrictionLogged',
    'EvidenceSuperseded',
  ])('refuses to construct %s — only the evidence gate may', (type) => {
    // The type parameter already excludes these at compile time; the cast is
    // how a caller would reach the runtime backstop, and the backstop holds.
    const construct = () =>
      createDomainEvent(context(), type as NonEvidenceEventType, {} as never, {
        idempotencyKey: 'should-not-matter',
      });

    expect(construct).toThrow(EvidenceFactoryBoundaryError);
    expect(construct).toThrow(/evidence gate/);
  });

  it('rejects before touching the clock, so a refused call cannot consume an instant', () => {
    const shared = context();
    expect(() =>
      createDomainEvent(shared, 'ReviewGraded' as NonEvidenceEventType, {} as never, {
        idempotencyKey: 'x',
      }),
    ).toThrow(EvidenceFactoryBoundaryError);

    const next = createDomainEvent(
      shared,
      'DataExported',
      { exportVersion: '1', scope: { kind: 'all' } },
      { idempotencyKey: 'export:1' },
    );
    expect(next.occurredAt).toBe(AT.t0);
    expect(next.eventId).toBe('ctx-event-0001');
  });
});

describe('deterministic context implementations', () => {
  it('freezes a fixed clock at one instant', () => {
    const clock = createFixedClock(AT.t0);
    expect(clock.now()).toBe(AT.t0);
    expect(clock.now()).toBe(AT.t0);
  });

  it('rejects a clock configured with a non-canonical instant', () => {
    expect(() => createFixedClock('2026-07-27T09:00:00Z')).toThrow(/canonical ISO-8601/);
    expect(() => createScriptedClock([AT.t0, '2026-13-01T00:00:00.000Z'])).toThrow(
      /canonical ISO-8601/,
    );
  });

  it('hands out scripted instants in order and then refuses to invent one', () => {
    const clock = createScriptedClock([AT.t0, AT.t1]);
    expect(clock.now()).toBe(AT.t0);
    expect(clock.now()).toBe(AT.t1);
    expect(() => clock.now()).toThrow(/exhausted/);
  });

  it('numbers ids per kind, so adding an event does not renumber every thread', () => {
    const ids = createSequentialIdGenerator({ prefix: 'p-' });
    expect(ids.nextId('thread')).toBe('p-thread-0001');
    expect(ids.nextId('event')).toBe('p-event-0001');
    expect(ids.nextId('thread')).toBe('p-thread-0002');
  });

  it('produces an identical random sequence for a given seed', () => {
    const draw = (seed: number) => {
      const random = createSeededRandom(seed);
      return [random.nextUnitInterval(), random.nextUnitInterval(), random.nextUnitInterval()];
    };

    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
    draw(7).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });
});
