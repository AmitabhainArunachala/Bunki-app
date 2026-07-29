/**
 * The demonstration strip's own contracts (lane L1).
 *
 * Two things this file exists for that no other suite covers.
 *
 * **A colour pair nothing else checks.** `CONTRAST_PAIRS` in `src/theme/color.ts`
 * enumerates the combinations the design system uses, and the strip introduces
 * one that was not among them: muted text on the accent tint. It is the only
 * surface that puts the quietest legible ink on `vermilionSoft`, because it is
 * the only surface whose *whole background* takes the accent. Rather than widen
 * another lane's table, the pair is measured here with the same helper, in both
 * schemes, against the same AA floor.
 *
 * **Copy that is load-bearing.** The strip's sentences are the labelling
 * requirement. "Not your history" and "never survives a reload" are not
 * decoration — they are what stops a demonstration from being mistaken for the
 * operator's own data, which is the failure mode the whole surface guards
 * against. A refactor that softened them would pass every other test in the
 * repository.
 *
 * The rest is a source scan for the same reason `design-vocabulary.test.ts`
 * gives: this repository installs no React Native renderer, and for rules of
 * the form "no component may ever…" a scan is the stronger statement anyway.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SCRIPTED_LEARNER_NOTE } from '@bunki/domain';

import { contrastRatio } from '../src/ui/contrast.ts';
import { createTheme, COLOR_SCHEMES, MIN_TOUCH_TARGET } from '../src/ui/theme.ts';
import {
  DEMONSTRATION_LABEL,
  OWN_DATA_LABEL,
  OWN_DATA_NOTE,
  RELOAD_NOTE,
} from '../src/ui/demo/demo-copy.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_UI = resolve(APP_ROOT, 'src/ui/demo');

const stripComments = (text: string): string =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const uiFiles = readdirSync(DEMO_UI).filter((name) => ['.ts', '.tsx'].includes(extname(name)));
const source = (name: string): string => stripComments(readFileSync(join(DEMO_UI, name), 'utf8'));
const banner = source('demo-banner.tsx');

/** WCAG 2.1 AA for normal-size text. The strip's type is all small. */
const AA_TEXT = 4.5;

describe('the strip is legible in both schemes', () => {
  it.each(COLOR_SCHEMES)('%s: every pair the strip draws clears AA for text', (scheme) => {
    const color = createTheme(scheme).color;
    const pairs: readonly [string, string, string][] = [
      // The quiet state: the strip sits in a well.
      ['headline, quiet', color.inkMuted, color.sunken],
      ['body, quiet', color.inkMuted, color.sunken],
      // The loaded state: the strip takes the one accent, so its whole
      // background is the tint. This is the pair no other surface has.
      ['headline, loaded', color.vermilion, color.vermilionSoft],
      ['body, loaded', color.ink, color.vermilionSoft],
      ['muted body, loaded', color.inkMuted, color.vermilionSoft],
      // The controls sit on cards in both states.
      ['control label', color.ink, color.raised],
      ['choice subtitle', color.inkMuted, color.raised],
      ['choice title, current', color.vermilion, color.raised],
    ];
    for (const [name, foreground, background] of pairs) {
      expect(
        contrastRatio(foreground, background),
        `${scheme}: ${name} is below AA`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('the strip says the things it exists to say', () => {
  it('names the demonstration as not the learner’s history', () => {
    expect(DEMONSTRATION_LABEL).toMatch(/not your history/i);
    expect(SCRIPTED_LEARNER_NOTE).toMatch(/None of this is your history/i);
    // The full sentence comes from the generator rather than being retyped
    // here, so the wording and the behaviour cannot drift apart.
    expect(banner).toContain('SCRIPTED_LEARNER_NOTE');
  });

  it('says what a reload does, before it happens', () => {
    expect(RELOAD_NOTE).toMatch(/never survives a reload/i);
    expect(RELOAD_NOTE).toMatch(/never written to this device/i);
  });

  it('says something in the quiet state too, rather than being absent', () => {
    // A strip that appeared only in the demonstration would train the eye to
    // ignore its absence. "Your own data" is a thing you read, not a thing you
    // assume — and it is the only door to the demonstration.
    expect(OWN_DATA_LABEL).not.toBe('');
    expect(OWN_DATA_NOTE).toMatch(/Nothing is simulated/i);
    expect(banner).toContain('OWN_DATA_LABEL');
  });

  it('makes no claim about a learner', () => {
    for (const sentence of [DEMONSTRATION_LABEL, OWN_DATA_NOTE, RELOAD_NOTE]) {
      expect(sentence).not.toMatch(/\b\d+\s*%/);
      expect(sentence).not.toMatch(/\blevel\b|\bmastery\b|\bscore\b/i);
    }
  });
});

describe('the strip is chrome, and behaves like chrome', () => {
  it.each(uiFiles)('%s writes no colour literal and does not branch on the scheme', (name) => {
    const body = source(name);
    expect(body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(body).not.toMatch(/scheme === '(light|dark)'/);
  });

  it.each(uiFiles)('%s carries no state on a prop the web target drops', (name) => {
    // react-native-web forwards no `accessibilityState`; a control setting it
    // ships with no exposed state at all. `design-vocabulary.test.ts` bans it
    // across `src/`, and this repeats the check at the file level so a failure
    // names the lane that caused it.
    expect(source(name)).not.toContain('accessibilityState');
  });

  it('exposes the panel as expanded and the choices as pressed', () => {
    expect(banner).toMatch(/aria-expanded=\{expanded\}/);
    expect(banner).toMatch(/aria-pressed=\{current\}/);
    // …and the state is in the spoken label as well, so it is not colour alone.
    expect(banner).toMatch(/showing now/);
  });

  it('reads no store, dispatches no command, and mints nothing', () => {
    for (const name of uiFiles) {
      const body = source(name);
      expect(body, `${name} reaches the store`).not.toMatch(/useAppStore|useAppSnapshot/);
      expect(body, `${name} mints an event`).not.toContain('createDomainEvent');
      expect(body, `${name} executes a command`).not.toMatch(/\.execute\(/);
    }
  });

  it('keeps its controls at the touch-target minimum', () => {
    // The numbers are in the component's own StyleSheet rather than in
    // `interactive-styles.ts`, because the strip's controls are chrome and are
    // not part of the design system's vocabulary. That is exactly why they are
    // asserted here: nothing else walks them.
    const heights = [...banner.matchAll(/minHeight:\s*MIN_TOUCH_TARGET/g)];
    expect(
      heights.length,
      'a strip control is not pinned to the touch minimum',
    ).toBeGreaterThanOrEqual(2);
    expect(MIN_TOUCH_TARGET).toBe(44);
  });
});
