/**
 * Primitive value types shared by every event family and reducer (WP-02).
 *
 * Everything here is pure and total. In particular there is no `Date` in this
 * file — instant validation and comparison are done on the canonical string
 * form directly, so the kernel never reaches for the ambient calendar. Time
 * enters the domain only through an injected `DomainClock` (REQ-ARCH-02).
 */

/**
 * An instant in the canonical Bunki wire form: ISO-8601, UTC, exactly
 * millisecond precision — `YYYY-MM-DDTHH:mm:ss.sssZ`.
 *
 * The format is deliberately fixed-width and single-timezone. Two consequences
 * the rest of the kernel relies on:
 *
 *   1. lexicographic string order equals chronological order, so ordering
 *      needs no parsing (`compareInstants` below);
 *   2. there is exactly one spelling of any instant, so a replayed log and a
 *      re-exported log are byte-identical (T-03, REQ-DM-04.5).
 *
 * Offsets like `+09:00`, second-precision forms, and lowercase `z` are all
 * rejected rather than normalised. Normalising would mean the store could hold
 * two spellings of one instant, and equality of derived state would depend on
 * which one arrived.
 */
export type IsoInstant = string;

const ISO_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Proleptic Gregorian leap-year rule, spelled out so no library is needed. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month1Based: number): number {
  if (month1Based === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month1Based - 1] ?? 0;
}

/**
 * Is this string a canonical `IsoInstant`?
 *
 * Shape is checked by pattern, then the calendar is checked by arithmetic —
 * `2025-02-30T00:00:00.000Z` matches the pattern and is not a date. Leap
 * seconds are rejected (`:60`): the wire format is a timestamp, not a clock
 * reading, and no downstream reducer could do anything sensible with one.
 */
export function isValidIsoInstant(value: unknown): value is IsoInstant {
  if (typeof value !== 'string') return false;
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (match === null) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return true;
}

/**
 * Chronological comparison of two canonical instants.
 *
 * This is a string comparison on purpose. See `IsoInstant` — the canonical form
 * is fixed-width UTC, so byte order is time order, and no parse step can
 * disagree with the stored bytes.
 */
export function compareInstants(left: IsoInstant, right: IsoInstant): -1 | 0 | 1 {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Identifier aliases.
 *
 * These are documentation, not brands. Branding would buy compile-time
 * protection against passing a `ThreadId` where a `ContractId` belongs, at the
 * cost of a cast at every JSON boundary — and this kernel's whole job is to
 * cross JSON boundaries losslessly (fixtures, export, replay). The invariant is
 * enforced at runtime by the reducers instead: an event naming a thread that
 * does not exist is rejected, not coerced.
 */
export type EventId = string;
export type ThreadId = string;
export type EncounterId = string;
export type ContractId = string;
export type ComponentId = string;
export type CandidateId = string;
export type SessionId = string;
export type ExperienceId = string;
export type RubricId = string;
export type SourceId = string;

/** Flattens an intersection into a single object type so editor output is readable. */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Rewrites `prop?: T | undefined` into `prop?: T`, recursively.
 *
 * `tsconfig.base.json` sets `exactOptionalPropertyTypes` (ADR-001) precisely so
 * that "absent" and "present and undefined" stay distinguishable — for
 * `userConfirmedEasy` the difference is "the user was never asked" versus "the
 * user declined to confirm", which is different evidence (ADR-002). Schema
 * inference does not preserve that distinction: an inferred optional always
 * admits an explicit `undefined`. Applying this to the inferred event types
 * restores it, so `{ userConfirmedEasy: undefined }` is a compile error rather
 * than a quiet third state.
 */
export type ExactOptional<T> = T extends readonly (infer Element)[]
  ? readonly ExactOptional<Element>[]
  : T extends object
    ? Simplify<
        {
          [K in keyof T as undefined extends T[K] ? never : K]: ExactOptional<T[K]>;
        } & {
          [K in keyof T as undefined extends T[K] ? K : never]?: ExactOptional<
            Exclude<T[K], undefined>
          >;
        }
      >
    : T;
