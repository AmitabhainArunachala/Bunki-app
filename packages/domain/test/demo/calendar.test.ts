/**
 * The calendar the scripted learner walks (lane L1).
 *
 * The kernel may not construct a `Date`, so this arithmetic is written out —
 * and arithmetic that is written out has to be checked against something. It is
 * checked here against `Date.UTC`, which is available in *tests* (the purity
 * scan covers `src/` only) and is the only independent implementation to hand.
 * A round-trip against itself would prove the two directions are inverses and
 * nothing about whether either is the Gregorian calendar.
 */

import { describe, expect, it } from 'vitest';

import { isValidIsoInstant } from '../../src/index.ts';
import {
  addMs,
  civilFromEpochDay,
  epochDayOf,
  epochMsOfInstant,
  instantOfEpochMs,
  MS_PER_DAY,
  startOfUtcDay,
  wholeDaysBetween,
} from '../../src/demo/calendar.ts';

describe('day numbers agree with the platform calendar', () => {
  it('matches Date.UTC across four centuries of month starts', () => {
    for (let year = 1700; year <= 2100; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const expected = Date.UTC(year, month - 1, 1) / MS_PER_DAY;
        expect(epochDayOf(year, month, 1), `${String(year)}-${String(month)}`).toBe(expected);
      }
    }
  });

  it('round-trips every day of four leap years and their neighbours', () => {
    for (const year of [1896, 1900, 1904, 2000, 2023, 2024, 2100]) {
      for (let month = 1; month <= 12; month += 1) {
        for (const day of [1, 15, 28]) {
          const epochDay = epochDayOf(year, month, day);
          expect(civilFromEpochDay(epochDay)).toEqual({ year, month, day });
        }
      }
    }
    // 29 February exists in 2024 and does not in 2023 or 1900.
    expect(civilFromEpochDay(epochDayOf(2024, 2, 29))).toEqual({ year: 2024, month: 2, day: 29 });
    expect(civilFromEpochDay(epochDayOf(1900, 2, 29))).toEqual({ year: 1900, month: 3, day: 1 });
  });
});

describe('instants render and parse in the canonical form only', () => {
  it('renders exactly what the kernel calls canonical', () => {
    const instant = instantOfEpochMs(Date.UTC(2026, 6, 29, 13, 4, 5) + 678);
    expect(instant).toBe('2026-07-29T13:04:05.678Z');
    expect(isValidIsoInstant(instant)).toBe(true);
  });

  it('round-trips a spread of instants against Date.UTC', () => {
    for (const parts of [
      [1970, 0, 1, 0, 0, 0, 0],
      [1999, 11, 31, 23, 59, 59, 999],
      [2024, 1, 29, 12, 0, 0, 500],
      [2026, 6, 29, 7, 30, 0, 0],
      [2400, 5, 15, 18, 45, 12, 34],
    ] as const) {
      const epochMs =
        Date.UTC(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]) + parts[6];
      const instant = instantOfEpochMs(epochMs);
      expect(epochMsOfInstant(instant)).toBe(epochMs);
      expect(instant).toBe(new Date(epochMs).toISOString());
    }
  });

  it('refuses a non-canonical spelling rather than normalising it', () => {
    for (const bad of [
      '2026-07-29T13:04:05Z',
      '2026-07-29T13:04:05.678+09:00',
      '2026-07-29t13:04:05.678z',
      '2026-02-30T00:00:00.000Z',
      'yesterday',
    ]) {
      expect(() => epochMsOfInstant(bad)).toThrow(RangeError);
    }
  });

  it('renders pre-epoch instants without slipping a day', () => {
    const epochMs = Date.UTC(1965, 0, 2, 3, 4, 5) + 6;
    expect(instantOfEpochMs(epochMs)).toBe(new Date(epochMs).toISOString());
  });
});

describe('arithmetic', () => {
  it('advances across a leap day', () => {
    expect(addMs('2024-02-28T23:00:00.000Z', 2 * 60 * 60 * 1000)).toBe('2024-02-29T01:00:00.000Z');
    expect(addMs('2023-02-28T23:00:00.000Z', 2 * 60 * 60 * 1000)).toBe('2023-03-01T01:00:00.000Z');
  });

  it('truncates to midnight UTC', () => {
    expect(startOfUtcDay('2026-07-29T23:59:59.999Z')).toBe('2026-07-29T00:00:00.000Z');
    expect(startOfUtcDay('2026-07-29T00:00:00.000Z')).toBe('2026-07-29T00:00:00.000Z');
  });

  it('counts whole days between instants', () => {
    expect(wholeDaysBetween('2024-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(731);
    expect(wholeDaysBetween('2024-01-01T00:00:00.000Z', '2024-01-01T23:59:59.999Z')).toBe(0);
  });
});
