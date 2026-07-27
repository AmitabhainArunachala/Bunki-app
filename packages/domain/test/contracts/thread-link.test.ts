/**
 * The contract→thread projection (WP-06; Conductor W2 disposition).
 *
 * WP-02 left an open question: `ContractCreated` names a component, nothing
 * names the thread, and the gate needs the thread's promotion state. The
 * Conductor's disposition was a projection from `EncounterCaptured` with no
 * ADR-002 schema change, and this suite is the proof that the projection is
 * total, deterministic, and fails closed where it genuinely cannot know.
 *
 * The interesting cases are all in the last group: two threads capturing the
 * same text, a component nobody captured, and a component whose ownership was
 * unambiguous and then stopped being so. Each of those has a wrong answer that
 * would look completely normal in the data.
 */

import { describe, expect, it } from 'vitest';

import {
  COMPONENT_ID_PREFIX,
  buildTargetThreadIndex,
  componentIdForTargetKey,
  componentIdOfEncounter,
  emptyTargetThreadIndex,
  freezeTargetThreadIndex,
  indexEncounter,
  isCanonicalComponentId,
  parseEvent,
  parseEventLog,
  resolveComponentThread,
  targetKeyOfComponentId,
  targetKeyOfEncounter,
  type EncounterCapturedEvent,
} from '../../src/index.ts';
import { encounterCaptured } from '../support/events.ts';
import { COMPONENT, T, TARGET, TEXT, THREAD, capture } from '../support/wp06.ts';

const parseCapture = (raw: Record<string, unknown>): EncounterCapturedEvent =>
  parseEvent(raw) as EncounterCapturedEvent;

describe('component identity is derived from the captured target', () => {
  it('a span selects the target', () => {
    const event = parseCapture(capture());
    expect(targetKeyOfEncounter(event)).toBe(TARGET);
    expect(componentIdOfEncounter(event)).toBe(COMPONENT);
  });

  it('no span means the whole captured text is the target', () => {
    const event = parseCapture(
      encounterCaptured(
        { eventId: 'e', at: T.capture, encounterId: 'x', threadId: THREAD },
        { text: TEXT },
      ),
    );
    expect(targetKeyOfEncounter(event)).toBe(TEXT);
    expect(componentIdOfEncounter(event)).toBe(componentIdForTargetKey(TEXT));
  });

  it('the id round-trips to its target key', () => {
    expect(targetKeyOfComponentId(COMPONENT)).toBe(TARGET);
    expect(COMPONENT.startsWith(COMPONENT_ID_PREFIX)).toBe(true);
  });

  it('rejects ids that are not canonical', () => {
    expect(isCanonicalComponentId('component-0001')).toBe(false);
    expect(isCanonicalComponentId(COMPONENT_ID_PREFIX)).toBe(false);
    expect(targetKeyOfComponentId('component-0001')).toBeNull();
    expect(isCanonicalComponentId(COMPONENT)).toBe(true);
  });

  it('handles a target outside the BMP without splitting it', () => {
    // The span is bounded against `text.length` by the event schema, which is
    // UTF-16 code units; the projection uses the same unit so the two cannot
    // disagree about what a span means.
    const text = '𠮟られた。';
    const event = parseCapture(
      encounterCaptured(
        { eventId: 'e', at: T.capture, encounterId: 'x', threadId: THREAD },
        { text, span: { start: 0, end: 2 } },
      ),
    );
    expect(targetKeyOfEncounter(event)).toBe('𠮟');
  });
});

describe('the index binds a component to the thread that captured it', () => {
  it('resolves a captured component to its thread', () => {
    const index = buildTargetThreadIndex(parseEventLog([capture()]));
    expect(resolveComponentThread(index, COMPONENT)).toEqual({ linked: true, threadId: THREAD });
  });

  it('a re-encounter on the same thread changes nothing', () => {
    const index = buildTargetThreadIndex(
      parseEventLog([
        capture(),
        encounterCaptured(
          { eventId: 'ev-again', at: T.review1, encounterId: 'encounter-2', threadId: THREAD },
          { text: `また${TEXT}`, span: { start: 2, end: 2 + TARGET.length } },
        ),
      ]),
    );
    expect(resolveComponentThread(index, COMPONENT)).toEqual({ linked: true, threadId: THREAD });
  });

  it('refuses a component nobody captured', () => {
    const index = buildTargetThreadIndex(parseEventLog([capture()]));
    const resolution = resolveComponentThread(index, 'kc:未捕獲');
    expect(resolution.linked).toBe(false);
    if (!resolution.linked) expect(resolution.reason).toBe('component_never_captured');
  });

  it('refuses a component two threads claim, rather than picking one', () => {
    const index = buildTargetThreadIndex(
      parseEventLog([
        capture(),
        encounterCaptured(
          { eventId: 'ev-rival', at: T.review1, encounterId: 'encounter-2', threadId: 'thread-b' },
          { text: TEXT, span: { start: 0, end: TARGET.length } },
        ),
      ]),
    );

    const resolution = resolveComponentThread(index, COMPONENT);
    expect(resolution.linked).toBe(false);
    if (!resolution.linked) expect(resolution.reason).toBe('component_ambiguous');
  });

  it('does not un-forget a collision when a third capture arrives', () => {
    // The collision is stored, not dropped. Otherwise a later capture on the
    // first thread would re-establish a single owner that the log does not
    // actually support.
    const index = emptyTargetThreadIndex();
    const one = parseCapture(capture());
    const two = parseCapture(
      encounterCaptured(
        { eventId: 'ev-rival', at: T.review1, encounterId: 'e2', threadId: 'thread-b' },
        { text: TEXT, span: { start: 0, end: TARGET.length } },
      ),
    );
    const three = parseCapture(
      encounterCaptured(
        { eventId: 'ev-third', at: T.review2, encounterId: 'e3', threadId: THREAD },
        { text: TEXT, span: { start: 0, end: TARGET.length } },
      ),
    );

    [one, two, three].forEach((event) => indexEncounter(index, event));
    const resolution = resolveComponentThread(freezeTargetThreadIndex(index), COMPONENT);
    expect(resolution.linked).toBe(false);
  });

  it('is built forward: a capture after a review does not retroactively bind it', () => {
    // Asserted through the index rather than the gate, because the gate suite
    // covers the verdict; here the point is that the *index* at a prefix of the
    // log is the index that prefix earned.
    const events = parseEventLog([capture()]);
    const beforeAnything = buildTargetThreadIndex([]);
    expect(resolveComponentThread(beforeAnything, COMPONENT).linked).toBe(false);
    expect(resolveComponentThread(buildTargetThreadIndex(events), COMPONENT).linked).toBe(true);
  });

  it('resolves against a frozen index the same way as a mutable one', () => {
    const mutable = emptyTargetThreadIndex();
    indexEncounter(mutable, parseCapture(capture()));
    expect(resolveComponentThread(mutable, COMPONENT)).toEqual(
      resolveComponentThread(freezeTargetThreadIndex(mutable), COMPONENT),
    );
  });
});
