/**
 * A0.5 — one interaction meaning across every input substrate.
 *
 * These tests deliberately exercise the pure reducer without a DOM. Pointer,
 * keyboard, switch control, screen reader, and automation may explain where
 * an action came from; they may not change what the action means.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  INTERACTION_ACTION_KINDS,
  INTERACTION_MODALITIES,
  initialInteractionState,
  reduceInteraction,
  type InteractionAction,
  type InteractionEffect,
  type InteractionEnvelope,
  type InteractionModality,
  type InteractionState,
} from '../../src/index.ts';

const target = { kind: 'word', id: '静か' } as const;

const envelope = (
  action: InteractionAction,
  modality: InteractionModality = 'programmatic',
  sourceId?: string,
): InteractionEnvelope => ({
  action,
  provenance: sourceId === undefined ? { modality } : { modality, sourceId },
});

const representativeActions: Record<(typeof INTERACTION_ACTION_KINDS)[number], InteractionAction> =
  {
    'target.activate': { kind: 'target.activate', target },
    'quickLook.open': { kind: 'quickLook.open', target },
    'entry.open': { kind: 'entry.open', target },
    'selection.move': { kind: 'selection.move', direction: 'next', itemCount: 3 },
    'constellation.lock': { kind: 'constellation.lock', target },
    'tide.set': { kind: 'tide.set', level: 4 },
    'judgment.nominate': { kind: 'judgment.nominate', target, judgment: 'good' },
    'navigation.back': { kind: 'navigation.back' },
    'layer.dismiss': { kind: 'layer.dismiss' },
  };

describe('A0.5 interaction action vocabulary', () => {
  it('contains every ratified substrate-neutral action and no accidental aliases', () => {
    expect(INTERACTION_ACTION_KINDS).toEqual([
      'target.activate',
      'quickLook.open',
      'entry.open',
      'selection.move',
      'constellation.lock',
      'tide.set',
      'judgment.nominate',
      'navigation.back',
      'layer.dismiss',
    ]);
    expect(INTERACTION_MODALITIES).toEqual([
      'pointer',
      'keyboard',
      'switch',
      'screenReader',
      'programmatic',
    ]);
  });

  it.each(INTERACTION_ACTION_KINDS)('reduces %s through the common action envelope', (kind) => {
    expect(() =>
      reduceInteraction(initialInteractionState(), envelope(representativeActions[kind])),
    ).not.toThrow();
  });
});

describe('input modality is provenance, never behavior', () => {
  for (const kind of INTERACTION_ACTION_KINDS) {
    it.each<InteractionModality>(INTERACTION_MODALITIES)(
      `${kind} has the same result from %s (sourceId included)`,
      (modality) => {
        const baseline = reduceInteraction(
          initialInteractionState(),
          envelope(representativeActions[kind], 'programmatic', 'baseline-renderer'),
        );
        const actual = reduceInteraction(
          initialInteractionState(),
          envelope(representativeActions[kind], modality, `${modality}-renderer`),
        );

        expect(actual).toEqual(baseline);
      },
    );
  }

  it('keeps the staged reveal law: reading, gloss, then full entry', () => {
    const first = reduceInteraction(
      initialInteractionState(),
      envelope({ kind: 'target.activate', target }, 'pointer'),
    );
    const second = reduceInteraction(
      first.state,
      envelope({ kind: 'target.activate', target }, 'keyboard'),
    );
    const third = reduceInteraction(
      second.state,
      envelope({ kind: 'target.activate', target }, 'switch'),
    );

    expect(first.state.reveal).toEqual({ target, stage: 'reading' });
    expect(second.state.reveal).toEqual({ target, stage: 'gloss' });
    expect(third.state.entryPath).toEqual([target]);
    expect(third.effects).toEqual([{ authority: 'navigation', kind: 'entry.opened', target }]);
  });

  it('keeps particle target activation inert while entry.open remains available', () => {
    const particle = { kind: 'particle', id: 'wa' } as const;
    const tap = reduceInteraction(
      initialInteractionState(),
      envelope({ kind: 'target.activate', target: particle }, 'pointer'),
    );
    const directEntry = reduceInteraction(
      tap.state,
      envelope({ kind: 'entry.open', target: particle }, 'switch'),
    );

    expect(tap).toEqual({ state: initialInteractionState(), effects: [] });
    expect(directEntry.state.entryPath).toEqual([particle]);
  });
});

describe('runtime immutability', () => {
  it('freezes the initial state and every nested collection', () => {
    const state = initialInteractionState();

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.entryPath)).toBe(true);
    expect(Object.isFrozen(state.layers)).toBe(true);
  });

  it('freezes returned state, nested values, collections, effects, and targets', () => {
    const result = reduceInteraction(
      initialInteractionState(),
      envelope({ kind: 'entry.open', target }),
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.entryPath)).toBe(true);
    expect(Object.isFrozen(result.state.entryPath[0])).toBe(true);
    expect(Object.isFrozen(result.state.layers)).toBe(true);
    expect(Object.isFrozen(result.state.layers[0])).toBe(true);
    expect(Object.isFrozen(result.effects)).toBe(true);
    expect(Object.isFrozen(result.effects[0])).toBe(true);
  });
});

describe('judgment honesty boundary', () => {
  it('can nominate a probe but cannot produce FSRS or memory-update authority', () => {
    const result = reduceInteraction(
      initialInteractionState(),
      envelope({ kind: 'judgment.nominate', target, judgment: 'hard' }, 'pointer'),
    );

    expect(result.state.nomination).toEqual({ target, judgment: 'hard' });
    expect(result.effects).toEqual([
      { authority: 'probe_nomination', kind: 'probe.nominated', target, judgment: 'hard' },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/fsrs|memory[._-]?update/i);

    type MemoryAuthority = Extract<
      InteractionEffect,
      { readonly authority: 'fsrs' | 'memory_update' }
    >;
    expectTypeOf<MemoryAuthority>().toEqualTypeOf<never>();
  });

  it('is deterministic from explicit state and action only', () => {
    const state: InteractionState = {
      ...initialInteractionState(),
      tideLevel: 3,
      selectedIndex: 1,
    };
    const action = envelope(
      { kind: 'judgment.nominate', target, judgment: 'again' },
      'screenReader',
    );

    expect(reduceInteraction(state, action)).toEqual(reduceInteraction(state, action));
  });
});
