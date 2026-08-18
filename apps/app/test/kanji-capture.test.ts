/**
 * The kanji pages can put an encounter into the loop (RENKAN R4-A, P2-18).
 *
 * Until R4-A both kanji screens had zero `store.execute` — a learner could meet
 * a character and have no gesture that reached the domain command handler.
 * These probes drive the exact commands `KanjiKeepPanel` dispatches (no React
 * Native test renderer exists in this project, so the flow is tested at the
 * seam the component calls), and they hold the constitution's line while doing
 * it: **capture creates no review debt**. A keep from a kanji page produces an
 * `EncounterCaptured` through the kernel's validated factory and a promotion to
 * the `keep` rung — no contract, no grade, no memory state, and no plannable
 * sitting.
 */

import { describe, expect, it } from 'vitest';

import { createDeterministicContext, isEvidenceEventType, parseEvent } from '@bunki/domain';

import { findLexemeByHeadword } from '../src/data/catalog.ts';
import {
  KANJI_PAGE_PROVENANCE,
  KANJI_PAGE_SOURCE_IDS,
  kanjiKeepCaptureCommand,
} from '../src/data/kanji-keep.ts';
import { bootstrapSessionWorkspace } from '../src/screens/session-loop.ts';
import { createDurableAppStore } from '../src/state/durable-store.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';

const INSTANTS = Array.from(
  { length: 60 },
  (_value, index) =>
    `2026-08-16T10:00:${String(index % 60).padStart(2, '0')}.${String(Math.floor(index / 60)).padStart(3, '0')}Z`,
);

function newContext(prefix: string): ReturnType<typeof createDeterministicContext> {
  return createDeterministicContext({ instants: INSTANTS, idPrefix: prefix });
}

describe('the command the kanji Keep dispatches', () => {
  it('captures the character with page provenance and an honest source ref', () => {
    const command = kanjiKeepCaptureCommand('岐', 'seed', null);
    expect(command).toMatchObject({
      kind: 'capture',
      text: '岐',
      sourceRef: { sourceId: 'seed-kanji-page', kind: 'text', locator: 'kanji:岐' },
      provenance: KANJI_PAGE_PROVENANCE,
      uncertainty: null,
    });
    // The lexeme link follows the same exact-headword rule rehydration uses —
    // attached when the character is itself a seed headword, absent otherwise.
    const lexeme = findLexemeByHeadword('岐');
    if (lexeme === null) {
      expect('lexemeId' in command).toBe(false);
    } else {
      expect(command.lexemeId).toBe(lexeme.id);
    }
  });

  it('names the drift page when the encounter happened there', () => {
    const command = kanjiKeepCaptureCommand('峠', 'drift', 'kanji');
    expect(command.sourceRef.sourceId).toBe(KANJI_PAGE_SOURCE_IDS.drift);
    expect(command.uncertainty).toBe('kanji');
  });
});

describe('a kanji-page keep creates no review debt (DL-05, constitution §4)', () => {
  it('produces a thread at keep, and nothing the scheduler could ever see', () => {
    const context = newContext('kanji-keep-');
    const store = createMemoryAppStore({ context });

    const captureAck = store.execute(kanjiKeepCaptureCommand('岐', 'seed', 'kanji'));
    expect(captureAck.events.map((event) => event.type)).toEqual(['EncounterCaptured']);
    store.execute({ kind: 'promote', threadId: captureAck.threadId, to: 'keep' });

    const thread = store.getSnapshot().threadsById[captureAck.threadId];
    expect(thread?.displayText).toBe('岐');
    expect(thread?.state.promotion).toBe('keep');
    expect(thread?.uncertainty?.dimension).toBe('kanji');

    // The no-debt half, asserted at every layer it could leak through: no
    // contract exists, no evidence-class event exists, no memory state exists,
    // and every event in the log came out of the kernel's validated factory.
    expect(store.readAll().filter((event) => event.type === 'ContractCreated')).toEqual([]);
    for (const event of store.readAll()) {
      expect(isEvidenceEventType(event.type)).toBe(false);
      expect(() => parseEvent(event)).not.toThrow();
    }
    expect(store.readDerived().memoryStates).toEqual([]);

    // …and no sitting can be planned over it: `keep` activates nothing.
    const boot = bootstrapSessionWorkspace(store, context);
    expect(boot.target).toBeNull();
  });

  it('collapses a double-tapped keep into one thread, like every capture', () => {
    const store = createMemoryAppStore({ context: newContext('kanji-dedupe-') });
    const first = store.execute(kanjiKeepCaptureCommand('岐', 'seed', null));
    const repeat = store.execute(kanjiKeepCaptureCommand('岐', 'seed', null));
    expect(repeat).toMatchObject({ deduplicated: true, threadId: first.threadId, events: [] });
    expect(store.getSnapshot().threads).toHaveLength(1);
  });

  it('joins the thread the capture screen already made for the same character', () => {
    const store = createMemoryAppStore({ context: newContext('kanji-join-') });
    const typed = store.execute({
      kind: 'capture',
      text: '岐',
      sourceRef: { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' },
      provenance: KANJI_PAGE_PROVENANCE,
      uncertainty: null,
    });
    const fromPage = store.execute(kanjiKeepCaptureCommand('岐', 'seed', null));
    // One thread, two encounters: the page keep is a re-encounter, not a fork.
    expect(fromPage.threadId).toBe(typed.threadId);
    expect(store.getSnapshot().threads).toHaveLength(1);
    expect(store.getSnapshot().threadsById[typed.threadId]?.state.encounterIds).toHaveLength(2);
  });
});

describe('a kanji-page keep is durable like any other capture', () => {
  it('survives a reload, mark and all', async () => {
    const map = new Map<string, string>();
    const snapshotStore = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    const open = async (prefix: string) => {
      const context = newContext(prefix);
      return createDurableAppStore({
        appVersions: { domain: '@bunki/domain@0.0.0', fsrs: null },
        clock: context.clock,
        context,
        snapshotKey: 'kanji-capture-test',
        snapshotStore,
      });
    };

    const first = await open('kanji-run1-');
    const ack = first.store.execute(kanjiKeepCaptureCommand('岐', 'seed', 'kanji'));
    first.store.execute({ kind: 'promote', threadId: ack.threadId, to: 'keep' });
    await first.flush();

    const second = await open('kanji-run2-');
    const thread = second.store.getSnapshot().threadsById[ack.threadId];
    expect(thread?.displayText).toBe('岐');
    expect(thread?.state.promotion).toBe('keep');
    expect(thread?.uncertainty?.dimension).toBe('kanji');
    expect(second.store.readDerived().memoryStates).toEqual([]);
  });
});
