/**
 * The diagnostic buffer never holds content (WP-09; controller §12, §15,
 * REQ-ARCH-07).
 *
 * The closure predicate names one test explicitly — "add a test asserting the
 * ring serializer strips content fields" — and this file is it. It is written
 * as a *negative* proof rather than a field-list comparison: distinctive
 * strings are pushed at every entry point the ring has, and the serialised
 * bytes are searched for them. A field-list assertion would pass while a
 * content value leaked through an allowlisted slot; searching the output cannot.
 *
 * The canaries are deliberately unmistakable. A generic probe like `"secret"`
 * could match something incidental and make the assertion pass for the wrong
 * reason — and the repository's own pre-commit scan greps staged diffs for that
 * word (controller §15), so a fixture that trips it on every commit trains
 * everyone to ignore the scan.
 */

import { describe, expect, it } from 'vitest';

import { createDeterministicContext, DOMAIN_EVENT_TYPES } from '@bunki/domain';

import {
  ALLOWED_FIELDS,
  AI_ROUTE_FIELDS,
  CLOSED_ENUMS,
  coerceScalar,
  createElapsedCounter,
  createObservabilityRing,
  OBSERVABILITY_CHANNELS,
  projectRecord,
} from '../src/observability/index.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import { APP_COMMAND_KINDS } from '../src/state/store.ts';

/** Japanese, because that is what this product's content actually looks like. */
const ENCOUNTER_CANARY = '峠を越えると視界が開けた・RING-CANARY-7e2b';
const AI_PAYLOAD_CANARY = 'the model said this out loud・RING-CANARY-c41d';
/**
 * Deliberately **not** shaped like any provider's key prefix.
 *
 * The test needs a string that would be catastrophic to log, not one that looks
 * like a real credential. A fixture carrying a recognisable prefix would trip
 * GitHub's push protection and the repository's own §15 pre-commit scan on every
 * commit — and a scan everyone has learned to wave through protects nothing.
 */
const CREDENTIAL_CANARY = 'CREDENTIAL-SHAPED-RING-CANARY-9a77';

const CANARIES = [ENCOUNTER_CANARY, AI_PAYLOAD_CANARY, CREDENTIAL_CANARY];

const SOURCE = { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' } as const;
const PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

const INSTANTS = [
  '2026-07-27T09:00:00.000Z',
  '2026-07-27T09:00:01.000Z',
  '2026-07-27T09:00:02.000Z',
  '2026-07-27T09:00:03.000Z',
  '2026-07-27T09:00:04.000Z',
  '2026-07-27T09:00:05.000Z',
  '2026-07-27T09:00:06.000Z',
  '2026-07-27T09:00:07.000Z',
] as const;

const newContext = (): ReturnType<typeof createDeterministicContext> =>
  createDeterministicContext({ instants: INSTANTS, idPrefix: 'ring-' });

describe('the serializer strips content fields', () => {
  it('drops every unlisted field, whatever it is called', () => {
    const ring = createObservabilityRing();

    ring.append('command', {
      commandKind: 'capture',
      latencyMs: 12,
      appendedCount: 1,
      deduplicated: false,
      failed: false,
      // Six different names for the same mistake. A denylist would need all of
      // them; the rebuild needs none.
      text: ENCOUNTER_CANARY,
      excerpt: ENCOUNTER_CANARY,
      note: ENCOUNTER_CANARY,
      body: AI_PAYLOAD_CANARY,
      prompt: AI_PAYLOAD_CANARY,
      apiKey: CREDENTIAL_CANARY,
    });

    const serialized = ring.serialize();
    for (const canary of CANARIES) {
      expect(serialized, `a canary survived serialisation: ${canary}`).not.toContain(canary);
    }

    // The allowlisted fields did survive — otherwise the test would pass on a
    // ring that recorded nothing at all.
    expect(serialized).toContain('"commandKind": "capture"');
    expect(serialized).toContain('"latencyMs": 12');
  });

  it('counts what it removed without keeping the names', () => {
    const ring = createObservabilityRing();
    ring.append('command', {
      commandKind: 'promote',
      latencyMs: 3,
      appendedCount: 1,
      deduplicated: false,
      failed: false,
      [ENCOUNTER_CANARY]: 1,
    });

    const [entry] = ring.entries();
    expect(entry?.strippedFields).toBe(1);
    // The key itself is content too. It must not be anywhere in the output.
    expect(ring.serialize()).not.toContain(ENCOUNTER_CANARY);
    expect(JSON.stringify(ring.entries())).not.toContain(ENCOUNTER_CANARY);
  });

  it('refuses content arriving on the AI sink as well', () => {
    const ring = createObservabilityRing();
    ring.record({
      taskClass: 'T2',
      outcome: 'live',
      fallbackReason: null,
      provider: 'anthropic',
      model: 'claude-opus-5',
      promptFamilyId: 'pf-explain',
      promptVersion: '1',
      inputHash: 'abc123',
      latencyMs: 812,
      maxTokens: 400,
      inputTokens: 120,
      outputTokens: 88,
      targetFormPresent: true,
      createdAt: '2026-07-27T12:00:00.000Z',
      // What a careless integration would hand over.
      requestBody: AI_PAYLOAD_CANARY,
      responseText: AI_PAYLOAD_CANARY,
      authorization: CREDENTIAL_CANARY,
    });

    const serialized = ring.serialize();
    for (const canary of CANARIES) expect(serialized).not.toContain(canary);
    expect(serialized).toContain('"outcome": "live"');
    expect(serialized).toContain('"latencyMs": 812');
  });

  it('replaces a non-scalar in an allowlisted slot with its type, never its contents', () => {
    expect(coerceScalar({ text: ENCOUNTER_CANARY })).toBe('<non-scalar:object>');
    expect(coerceScalar([ENCOUNTER_CANARY])).toBe('<non-scalar:array>');
    expect(coerceScalar(() => ENCOUNTER_CANARY)).toBe('<non-scalar:function>');
    expect(coerceScalar(undefined)).toBeNull();
    expect(coerceScalar(0)).toBe(0);
    expect(coerceScalar(false)).toBe(false);
  });

  it('projects again on the way out, so a record that bypassed append is still caught', () => {
    // `projectRecord` is what `serialize` re-applies. Handing it a record with a
    // content field proves the second pass is real rather than a comment.
    const { record, strippedFields } = projectRecord('command', {
      channel: 'command',
      seq: 1,
      at: 0,
      commandKind: 'capture',
      smuggled: ENCOUNTER_CANARY,
    });
    expect(strippedFields).toBe(1);
    expect(JSON.stringify(record)).not.toContain(ENCOUNTER_CANARY);
  });
});

describe('the ring records what §12 asks for', () => {
  it('records a command latency and one event-append per appended event', () => {
    const ring = createObservabilityRing({ elapsedMs: createElapsedCounter() });
    const store = createMemoryAppStore({
      context: newContext(),
      observer: ring.commandObserver,
      elapsedMs: () => 0,
    });

    store.execute({
      kind: 'capture',
      text: ENCOUNTER_CANARY,
      sourceRef: SOURCE,
      provenance: PROVENANCE,
      uncertainty: null,
    });

    const commands = ring.entries().filter((entry) => entry.record.channel === 'command');
    const appends = ring.entries().filter((entry) => entry.record.channel === 'event-append');

    expect(commands).toHaveLength(1);
    expect(commands[0]?.record['commandKind']).toBe('capture');
    expect(typeof commands[0]?.record['latencyMs']).toBe('number');
    expect(appends).toHaveLength(1);
    expect(appends[0]?.record['eventType']).toBe('EncounterCaptured');

    // The captured text went through the store. It must not be in the buffer.
    expect(ring.serialize()).not.toContain(ENCOUNTER_CANARY);
  });

  it('records a failed command without recording why it failed', () => {
    const ring = createObservabilityRing();
    const store = createMemoryAppStore({
      context: newContext(),
      observer: ring.commandObserver,
    });

    expect(() =>
      store.execute({
        kind: 'correctEvidence',
        supersededEventId: 'no-such-event',
        reason: 'user_correction',
        note: ENCOUNTER_CANARY,
      }),
    ).toThrow();

    const [entry] = ring.entries();
    expect(entry?.record['failed']).toBe(true);
    expect(entry?.record['commandKind']).toBe('correctEvidence');
    expect(ring.serialize()).not.toContain(ENCOUNTER_CANARY);
  });

  it('is bounded, and says how many it has seen beyond what it kept', () => {
    const ring = createObservabilityRing({ capacity: 3 });
    for (let index = 0; index < 10; index += 1) {
      ring.append('command', {
        commandKind: 'promote',
        latencyMs: index,
        appendedCount: 0,
        deduplicated: false,
        failed: false,
      });
    }
    expect(ring.entries()).toHaveLength(3);
    expect(ring.appended()).toBe(10);
    // Oldest first, and the oldest kept is the eighth append.
    expect(ring.entries()[0]?.record['latencyMs']).toBe(7);
  });

  it('rejects a nonsensical capacity rather than silently picking one', () => {
    expect(() => createObservabilityRing({ capacity: 0 })).toThrow(RangeError);
    expect(() => createObservabilityRing({ capacity: 1.5 })).toThrow(RangeError);
  });

  it('serialises to stable bytes so two reads of one buffer compare as text', () => {
    const ring = createObservabilityRing();
    ring.append('command', {
      commandKind: 'capture',
      latencyMs: 1,
      failed: false,
      deduplicated: false,
      appendedCount: 1,
    });
    expect(ring.serialize()).toBe(ring.serialize());
  });
});

describe('the field table is the single source of truth', () => {
  it('covers every channel', () => {
    expect(Object.keys(ALLOWED_FIELDS).sort()).toEqual([...OBSERVABILITY_CHANNELS].sort());
  });

  it('gives every channel the three fields the ring itself stamps', () => {
    for (const channel of OBSERVABILITY_CHANNELS) {
      expect(ALLOWED_FIELDS[channel], channel).toEqual(
        expect.arrayContaining(['channel', 'seq', 'at']),
      );
    }
  });

  /**
   * The reconciliation B7 asked for (WP-07 coordination request 2).
   *
   * `@bunki/ai` is not a dependency of this build, so `AiRouteRecord` cannot be
   * imported and cannot be type-checked against. This asserts the shape we
   * recorded from B7's branch, so that at WP-10 — when the packages are joined
   * and `@bunki/ai` becomes importable — the assertion below is replaced by a
   * direct comparison and any drift shows up as a failure rather than as a
   * silently narrower record.
   */
  it('mirrors the AI route record B7 delivered', () => {
    expect([...AI_ROUTE_FIELDS].sort()).toEqual(
      [
        'createdAt',
        'fallbackReason',
        'inputHash',
        'inputTokens',
        'latencyMs',
        'maxTokens',
        'model',
        'outcome',
        'outputTokens',
        'promptFamilyId',
        'promptVersion',
        'provider',
        'targetFormPresent',
        'taskClass',
      ].sort(),
    );
  });

  it('draws its identifier fields from the domain’s own closed sets', () => {
    expect(CLOSED_ENUMS.eventType).toEqual(DOMAIN_EVENT_TYPES);
    expect(CLOSED_ENUMS.commandKind).toEqual(APP_COMMAND_KINDS);
  });
});

describe('the elapsed counter is monotonic and relative', () => {
  it('starts at zero and never carries an absolute epoch', () => {
    let value = 1000;
    const elapsed = createElapsedCounter({ now: () => value });
    expect(elapsed()).toBe(0);
    value = 1250;
    expect(elapsed()).toBe(250);
  });

  it('falls back when no performance source exists', () => {
    const elapsed = createElapsedCounter(undefined);
    expect(elapsed()).toBeGreaterThanOrEqual(0);
    expect(elapsed()).toBeLessThan(10_000);
  });
});
