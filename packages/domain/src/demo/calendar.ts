/**
 * Instant arithmetic without a `Date` (lane L1 — the scripted learner).
 *
 * The kernel is forbidden from constructing a `Date` at all — `new Date`,
 * `Date.parse` and `Date.UTC` are each a named failure in
 * `test/purity/no-ambient-nondeterminism.test.ts`, because a zero-argument
 * `Date` reads the ambient clock and the others carry an engine's calendar
 * implementation into a value the whole product's replay claim rests on.
 *
 * A learner script has to move through two years of calendar time, so it needs
 * arithmetic on instants. This module is that arithmetic, spelled out: the
 * proleptic-Gregorian day-number conversion in both directions, and a renderer
 * that emits exactly the canonical `YYYY-MM-DDTHH:mm:ss.sssZ` form
 * `primitives.ts` defines.
 *
 * The conversion is the standard civil/day-number pair (Howard Hinnant's
 * `days_from_civil` / `civil_from_days`), which is exact for every year this
 * project can represent and uses integer arithmetic only — no floating point,
 * so two runtimes cannot disagree on a day boundary.
 *
 * `daysInMonth` and `isLeapYear` are imported from `primitives.ts` rather than
 * re-derived: the validator and this generator have to agree about what a date
 * is, and two copies of the leap rule is exactly how they would stop agreeing.
 */

import { daysInMonth, isValidIsoInstant, type IsoInstant } from '../primitives.ts';

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

/**
 * Days from 1970-01-01 to a civil date, for the proleptic Gregorian calendar.
 *
 * The era-shifted form: the calendar is re-based on 0000-03-01 so that the
 * leap day falls at the end of a "year", which removes every special case from
 * the day-of-year term. It is exact and integral.
 */
export function epochDayOf(year: number, month: number, day: number): number {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** The inverse of {@link epochDayOf}. */
export function civilFromEpochDay(epochDay: number): CivilDate {
  const shifted = epochDay + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex + (monthIndex < 10 ? 3 : -9);
  return { year: month <= 2 ? year + 1 : year, month, day };
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/**
 * Render milliseconds-since-epoch as a canonical instant.
 *
 * Negative epoch values are representable and are rendered correctly, because
 * both halves of the split use `Math.floor` rather than truncation — the bug
 * that would otherwise put a pre-1970 instant one day late with a positive
 * time-of-day.
 */
export function instantOfEpochMs(epochMs: number): IsoInstant {
  const epochDay = Math.floor(epochMs / MS_PER_DAY);
  const msOfDay = epochMs - epochDay * MS_PER_DAY;
  const { year, month, day } = civilFromEpochDay(epochDay);
  const hour = Math.floor(msOfDay / MS_PER_HOUR);
  const minute = Math.floor((msOfDay % MS_PER_HOUR) / MS_PER_MINUTE);
  const second = Math.floor((msOfDay % MS_PER_MINUTE) / MS_PER_SECOND);
  const millisecond = msOfDay % MS_PER_SECOND;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}.${pad(millisecond, 3)}Z`;
}

/**
 * Parse a canonical instant to milliseconds since the epoch.
 *
 * Throws on anything that is not the canonical form. Accepting a near-miss and
 * normalising it would mean the generator could be handed two spellings of one
 * instant and produce two different logs, which is the property the fixed-width
 * wire form exists to prevent (`primitives.ts`).
 */
export function epochMsOfInstant(instant: IsoInstant): number {
  const match = INSTANT_PATTERN.exec(instant);
  if (match === null || !isValidIsoInstant(instant)) {
    throw new RangeError(
      `${JSON.stringify(instant)} is not a canonical ISO-8601 UTC instant of the form YYYY-MM-DDTHH:mm:ss.sssZ`,
    );
  }
  const [, year, month, day, hour, minute, second, millisecond] = match;
  return (
    epochDayOf(Number(year), Number(month), Number(day)) * MS_PER_DAY +
    Number(hour) * MS_PER_HOUR +
    Number(minute) * MS_PER_MINUTE +
    Number(second) * MS_PER_SECOND +
    Number(millisecond)
  );
}

/** Midnight UTC on the day an instant falls in. */
export function startOfUtcDay(instant: IsoInstant): IsoInstant {
  const epochMs = epochMsOfInstant(instant);
  return instantOfEpochMs(Math.floor(epochMs / MS_PER_DAY) * MS_PER_DAY);
}

/** Advance an instant by a whole number of milliseconds. */
export function addMs(instant: IsoInstant, ms: number): IsoInstant {
  return instantOfEpochMs(epochMsOfInstant(instant) + Math.trunc(ms));
}

/**
 * Whole days between two instants, rounded towards zero.
 *
 * Used only for reporting the span a generated log covers; nothing schedules on
 * it. `daysInMonth` is re-exported alongside it so a caller that wants calendar
 * facts has one import rather than two.
 */
export function wholeDaysBetween(from: IsoInstant, to: IsoInstant): number {
  return Math.trunc((epochMsOfInstant(to) - epochMsOfInstant(from)) / MS_PER_DAY);
}

export { daysInMonth };
