/**
 * Canonical instants and the exact-optional type rewrite (WP-02).
 */

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  compareInstants,
  daysInMonth,
  isLeapYear,
  isValidIsoInstant,
  parseEvent,
  type ExactOptional,
  type ReviewGradedEvent,
} from '../src/index.ts';
import { AT, encounterCaptured, reviewGraded } from './support/events.ts';

describe('canonical ISO-8601 instants', () => {
  it.each(['2026-07-27T09:00:00.000Z', '2000-02-29T23:59:59.999Z', '1970-01-01T00:00:00.000Z'])(
    'accepts %s',
    (value) => {
      expect(isValidIsoInstant(value)).toBe(true);
    },
  );

  it.each([
    ['second precision', '2026-07-27T09:00:00Z'],
    ['a local offset', '2026-07-27T09:00:00.000+09:00'],
    ['no timezone', '2026-07-27T09:00:00.000'],
    ['a lowercase z', '2026-07-27T09:00:00.000z'],
    ['a space separator', '2026-07-27 09:00:00.000Z'],
    ['month 13', '2026-13-01T00:00:00.000Z'],
    ['day 31 in June', '2026-06-31T00:00:00.000Z'],
    ['29 February in a common year', '2026-02-29T00:00:00.000Z'],
    ['29 February in 1900', '1900-02-29T00:00:00.000Z'],
    ['hour 24', '2026-07-27T24:00:00.000Z'],
    ['a leap second', '2026-07-27T23:59:60.000Z'],
    ['epoch millis', 1785000000000],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isValidIsoInstant(value)).toBe(false);
  });

  it('accepts 29 February in a leap year', () => {
    expect(isValidIsoInstant('2028-02-29T00:00:00.000Z')).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('orders lexicographically, which is why byte comparison is time comparison', () => {
    expect(compareInstants(AT.t0, AT.t1)).toBe(-1);
    expect(compareInstants(AT.t1, AT.t0)).toBe(1);
    expect(compareInstants(AT.t1, AT.t1)).toBe(0);

    const shuffled = [AT.t3, AT.t0, AT.t2, AT.t1];
    expect([...shuffled].sort()).toEqual([AT.t0, AT.t1, AT.t2, AT.t3]);
  });

  it('is enforced by the event schemas, not merely available to them', () => {
    expect(() =>
      parseEvent(
        encounterCaptured(
          { eventId: 'e1', at: AT.t0, encounterId: 'x', threadId: 't' },
          { occurredAt: '2026-07-27' },
        ),
      ),
    ).toThrow(/canonical ISO-8601/);
  });
});

describe('ExactOptional keeps "absent" distinct from "present and undefined"', () => {
  it('rewrites optional properties so an explicit undefined is a type error', () => {
    type Inferred = { a: string; b?: number | undefined };
    type Rewritten = ExactOptional<Inferred>;

    expectTypeOf<Rewritten>().toMatchObjectType<{ a: string; b?: number }>();

    const present: Rewritten = { a: 'x', b: 1 };
    const absent: Rewritten = { a: 'x' };
    expect(present.b).toBe(1);
    expect(absent.b).toBeUndefined();

    // @ts-expect-error `b` is optional, not nullable: passing undefined explicitly
    // is the third state ADR-002 says must not exist.
    const explicitlyUndefined: Rewritten = { a: 'x', b: undefined };
    expect(explicitlyUndefined.a).toBe('x');
  });

  it('applies the same rule to the event types (ADR-002 on userConfirmedEasy)', () => {
    const event = parseEvent(
      reviewGraded(
        { eventId: 'e1', at: AT.t0, contractId: 'c1', grade: 'easy' },
        { userConfirmedEasy: true },
      ),
    ) as ReviewGradedEvent;

    expect(event.userConfirmedEasy).toBe(true);
    expectTypeOf<ReviewGradedEvent['userConfirmedEasy']>().toEqualTypeOf<true | undefined>();

    // @ts-expect-error the field records a confirmation; there is no explicit
    // "present and undefined" spelling of "the user was never asked".
    const withExplicitUndefined: ReviewGradedEvent = { ...event, userConfirmedEasy: undefined };
    expect(withExplicitUndefined.eventId).toBe('e1');
  });
});
