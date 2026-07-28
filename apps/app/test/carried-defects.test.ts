/**
 * Regressions for the three defects Wave A verification carried forward.
 *
 * Each one is here rather than in the file that owns the component, because
 * what is being pinned is not the component's behaviour in general but the
 * *specific* wrong thing it used to do. A test named after the defect survives a
 * refactor of the surrounding suite, and tells the next reader why the shape of
 * the code is what it is.
 *
 *   - **P2-1** `RecallMark` threw from inside render when handed one of the two
 *     meter-only bands. Those bands are declared data — `RECALL_BAND_MARKS` —
 *     and Wave B's map and kanji lanes read a band off a projection, so three of
 *     the five values rendered and two crashed the screen.
 *   - **P2-2** `OVERWHELMED_NOTE` ended with the unconditional sentence "Every
 *     word is still tappable", which is false whenever `FrontierPassage` is
 *     rendered without an `onOpen` handler or over spans with no `lexemeId`.
 *   - **P2-3** `nav-shell.tsx` set `aria-current` twice, having "fixed" a defect
 *     that was not present.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  OVERWHELMED_NOTE,
  OVERWHELMED_NOTE_ALL_TAPPABLE,
  OVERWHELMED_NOTE_SOME_TAPPABLE,
  overwhelmedNote,
  spanIsOpenable,
  type FrontierSpan,
} from '../src/ui/frontier-marks.ts';
import {
  RECALL_BANDS,
  RECALL_BAND_MARKS,
  isStandaloneRecallBand,
  type MeterOnlyRecallBand,
  type RecallBand,
  type StandaloneRecallBand,
} from '../src/ui/theme.ts';
/*
  Type-only, and it has to stay that way: `recall.tsx` imports `react-native`,
  which this runner cannot resolve. A type import is erased before the module
  ever loads, so the props type can be checked by `tsc` without the suite
  needing a renderer — which is the same constraint every other test in this
  directory works under.
*/
import type { RecallMarkProps, RecallIndicatorProps } from '../src/ui/recall.tsx';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path: string): string => readFileSync(resolve(APP_ROOT, path), 'utf8');

/* ------------------------------------------------------------------ *
 * P2-1 — a meter-only band is a type error, not a render-time throw
 * ------------------------------------------------------------------ */

describe('P2-1: RecallMark cannot be handed a band it cannot draw', () => {
  /**
   * The fix is a type, so the proof is a directive.
   *
   * An unused `@ts-expect-error` is itself a compile error, so if `band` were
   * widened back to `RecallBand` this file would fail `npm run typecheck`
   * instead of failing silently.
   */
  it('rejects a meter-only band at the call site', () => {
    const drawable: RecallMarkProps = { capability: 'reading', band: 'settled' };
    // @ts-expect-error 'unseen' falls under 3:1 and may only appear in the meter
    const undrawable: RecallMarkProps = { capability: 'reading', band: 'unseen' };
    // @ts-expect-error so does 'faint'
    const alsoUndrawable: RecallMarkProps = { capability: 'reading', band: 'faint' };

    expect(drawable.band).toBe('settled');
    expect([undrawable, alsoUndrawable]).toHaveLength(2);
  });

  it('accepts every band on the indicator, which is the total one', () => {
    const anyBand: RecallBand = 'unseen';
    const props: RecallIndicatorProps = { capability: 'reading', band: anyBand };
    expect(props.band).toBe('unseen');
  });

  it('derives the standalone type from the declaration rather than a copy', () => {
    const standalone: StandaloneRecallBand[] = ['emerging', 'settled', 'durable'];
    const meterOnly: MeterOnlyRecallBand[] = ['unseen', 'faint'];
    expect([...standalone, ...meterOnly].sort()).toEqual([...RECALL_BANDS].sort());
    for (const band of standalone) expect(RECALL_BAND_MARKS[band].standalone).toBe(true);
    for (const band of meterOnly) expect(RECALL_BAND_MARKS[band].standalone).toBe(false);
  });

  it('narrows an unnarrowed band rather than making the caller cast', () => {
    for (const band of RECALL_BANDS) {
      expect(isStandaloneRecallBand(band)).toBe(RECALL_BAND_MARKS[band].standalone);
    }
  });

  it('no longer throws from inside render', () => {
    const body = source('src/ui/recall.tsx');
    // The exact wording of the old guard, which is what the surface lanes would
    // have hit. Its absence is the defect being fixed rather than moved.
    expect(body).not.toContain('is a meter-only band: draw it inside');
    // And no throw at all remains in this module's render paths.
    expect(body).not.toMatch(/\bthrow new Error\b/);
  });
});

/* ------------------------------------------------------------------ *
 * P2-2 — the note only claims what the passage actually does
 * ------------------------------------------------------------------ */

describe('P2-2: the overwhelmed note claims only what is true', () => {
  const span = (text: string, lexemeId?: string): FrontierSpan => ({
    text,
    mark: 'frontier',
    ...(lexemeId === undefined ? {} : { lexemeId }),
  });

  it('never asserts tappability in the base sentence', () => {
    expect(OVERWHELMED_NOTE).not.toContain('tappable');
    expect(OVERWHELMED_NOTE).not.toContain('tap');
  });

  it('says nothing about tapping when the passage is read-only', () => {
    const spans = [span('人生', 'lex-a'), span('岐路', 'lex-b')];
    // Every span has a lexemeId, but no `onOpen`: nothing is pressable.
    expect(overwhelmedNote(spans, false)).toBe(OVERWHELMED_NOTE);
  });

  it('says nothing about tapping when no span is a lookup target', () => {
    const spans = [span('の'), span('も、')];
    expect(overwhelmedNote(spans, true)).toBe(OVERWHELMED_NOTE);
  });

  it('claims every word only when every word really can be opened', () => {
    const spans = [span('人生', 'lex-a'), span('岐路', 'lex-b')];
    expect(overwhelmedNote(spans, true)).toBe(
      `${OVERWHELMED_NOTE} ${OVERWHELMED_NOTE_ALL_TAPPABLE}`,
    );
  });

  it('makes the weaker claim when only some spans can be opened', () => {
    const spans = [span('人生', 'lex-a'), span('の'), span('岐路', 'lex-b')];
    expect(overwhelmedNote(spans, true)).toBe(
      `${OVERWHELMED_NOTE} ${OVERWHELMED_NOTE_SOME_TAPPABLE}`,
    );
  });

  it('uses one definition of "tappable" for the note and for the component', () => {
    expect(spanIsOpenable(span('駅', 'lex-eki'))).toBe(true);
    expect(spanIsOpenable(span('を'))).toBe(false);
    // The component gates its `Pressable` on the same predicate, so the sentence
    // and the behaviour cannot drift apart again.
    //
    // Asserted as the *property* rather than as one expression's exact text.
    // The original form pinned `!spanIsOpenable(span) || onOpen === undefined`,
    // and lane B4 independently wrote the same condition as a named
    // `interactive` local (it also needs it for the aria-hidden decision). The
    // merge kept the shared predicate and the local name, which satisfies this
    // test's intent exactly — and failed it, because the test was checking a
    // string. What actually matters is the pair below: the file reaches
    // tappability through `spanIsOpenable`, and never re-derives it inline from
    // `span.lexemeId`, which is the drift the predicate exists to prevent.
    // Comments stripped first, as every other source scan in this repo does:
    // the sentence explaining why the inline form is banned would otherwise be
    // the thing that trips the ban.
    const frontier = source('src/ui/frontier.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(frontier).toMatch(/\bspanIsOpenable\(span\)/);
    expect(
      frontier,
      'frontier.tsx re-derives tappability inline instead of using spanIsOpenable',
    ).not.toMatch(/span\.lexemeId !== undefined/);
    expect(source('src/ui/frontier.tsx')).toContain('overwhelmedNote(spans, onOpen !== undefined)');
  });
});

/* ------------------------------------------------------------------ *
 * P2-3 — aria-current is set once
 * ------------------------------------------------------------------ */

describe('P2-3: the navigation shell sets aria-current once', () => {
  it('has exactly one aria-current in the whole file', () => {
    const body = source('src/ui/nav-shell.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const occurrences = body.match(/aria-current/g) ?? [];
    expect(occurrences, 'aria-current is set more than once').toHaveLength(1);
  });

  it('keeps the one that omits the attribute when it is not current', () => {
    const body = source('src/ui/nav-shell.tsx');
    // `aria-current="false"` is announced by some screen readers, so the
    // surviving form must be the conditional-to-undefined one.
    expect(body).toContain("aria-current={current ? 'page' : undefined}");
  });
});
