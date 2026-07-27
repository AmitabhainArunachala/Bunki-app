/**
 * T-04 — unknown event versions fail closed (REQ-DM-04.1).
 *
 * The assertion is not merely "an unknown version is not accepted". It is that
 * rejection is *loud and typed*: a thrown `UnknownEventVersionError` carrying
 * the version it saw and the versions this build implements. The failure mode
 * this test exists to prevent is the quiet one — a parser that filters unknown
 * events out of a log and returns the rest, leaving a derived state that looks
 * healthy and is missing evidence nobody will notice is gone.
 */

import { describe, expect, it } from 'vitest';

import {
  DomainError,
  EventValidationError,
  isDomainError,
  MalformedEventError,
  parseEvent,
  parseEventLog,
  replayJson,
  safeParseEvent,
  SUPPORTED_EVENT_VERSIONS,
  UnknownEventTypeError,
  UnknownEventVersionError,
} from '../../src/index.ts';
import { AT, encounterCaptured, oneOfEachFamily } from '../support/events.ts';

const validEvent = () =>
  encounterCaptured({ eventId: 'e1', at: AT.t0, encounterId: 'encounter-1', threadId: 'thread-1' });

describe('T-04: unknown event versions fail closed', () => {
  it.each([2, 0, -1, 1.5, 99])('rejects v=%s with a typed UnknownEventVersionError', (version) => {
    let thrown: unknown;
    try {
      parseEvent({ ...validEvent(), v: version });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnknownEventVersionError);
    expect(thrown).toBeInstanceOf(DomainError);
    const error = thrown as UnknownEventVersionError;
    expect(error.code).toBe('UNKNOWN_EVENT_VERSION');
    expect(error.observedVersion).toBe(version);
    expect(error.supportedVersions).toEqual(SUPPORTED_EVENT_VERSIONS);
  });

  it.each([
    ['a string', '1'],
    ['null', null],
    ['undefined (field absent)', undefined],
    ['an object', { major: 1 }],
    ['a boolean', true],
  ])('rejects a non-numeric version (%s)', (_label, version) => {
    const raw: Record<string, unknown> = { ...validEvent() };
    if (version === undefined) {
      delete raw['v'];
    } else {
      raw['v'] = version;
    }
    expect(() => parseEvent(raw)).toThrow(UnknownEventVersionError);
  });

  it('checks the version before the payload, so a v2 event is diagnosed as a version problem', () => {
    // A v2 event with fields this build has never seen. If the parser looked at
    // the payload first it would report "unknown type" or a field error, which
    // invites the wrong fix (add the field) instead of the right one (write a
    // migration).
    let thrown: unknown;
    try {
      parseEvent({ v: 2, type: 'SomethingFromTheFuture', novelField: 42 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnknownEventVersionError);
    expect((thrown as UnknownEventVersionError).observedVersion).toBe(2);
  });

  it('rejects an unknown type at a known version, distinctly', () => {
    let thrown: unknown;
    try {
      parseEvent({ ...validEvent(), type: 'ThreadVaporised' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnknownEventTypeError);
    expect((thrown as UnknownEventTypeError).code).toBe('UNKNOWN_EVENT_TYPE');
    expect((thrown as UnknownEventTypeError).observedType).toBe('ThreadVaporised');
  });

  it.each([
    ['null', null],
    ['a string', 'EncounterCaptured'],
    ['a number', 7],
    ['an array', [{ v: 1 }]],
  ])('rejects a non-object event (%s)', (_label, raw) => {
    expect(() => parseEvent(raw)).toThrow(MalformedEventError);
  });
});

describe('T-04: a log with one bad event is not partially applied', () => {
  const good = validEvent();

  it('throws rather than skipping, and names the offending index', () => {
    const log = [good, { ...good, eventId: 'e2', v: 3 }, { ...good, eventId: 'e3' }];

    let thrown: unknown;
    try {
      parseEventLog(log);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnknownEventVersionError);
    expect((thrown as UnknownEventVersionError).index).toBe(1);
  });

  it('never returns a shorter log than it was given', () => {
    // The silent-skip shape, stated as an assertion: for any log the parser
    // accepts, it accepted every entry.
    const log = Object.values(oneOfEachFamily());
    expect(parseEventLog(log)).toHaveLength(log.length);
  });

  it('refuses to replay a log containing an unknown version', () => {
    const log = [good, { ...good, eventId: 'e2', idempotencyKey: 'idem-e2', v: 2 }];
    expect(() => replayJson(log)).toThrow(UnknownEventVersionError);
  });

  it('rejects a log that is not an array', () => {
    expect(() => parseEventLog({ events: [] })).toThrow(MalformedEventError);
  });
});

describe('safeParseEvent surfaces the same typed rejection as data', () => {
  it('reports success for a valid event', () => {
    const result = safeParseEvent(validEvent());
    expect(result.ok).toBe(true);
  });

  it('reports the typed error, not a bare null, for an unknown version', () => {
    const result = safeParseEvent({ ...validEvent(), v: 4 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(isDomainError(result.error)).toBe(true);
    expect(result.error.code).toBe('UNKNOWN_EVENT_VERSION');
  });

  it('reports schema failures with the offending path', () => {
    const result = safeParseEvent({ ...validEvent(), text: '' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBeInstanceOf(EventValidationError);
    expect((result.error as EventValidationError).issues.map((issue) => issue.path)).toContain(
      'text',
    );
  });
});
