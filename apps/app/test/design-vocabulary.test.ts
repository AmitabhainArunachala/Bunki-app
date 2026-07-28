/**
 * The component vocabulary's own contracts.
 *
 * `theme-tokens.test.ts` is about the token layer; this is about the components
 * built on it. Everything here is a source scan for the reason
 * `navigation-reachability.test.ts` gives: the repository installs no React
 * Native renderer, and for rules of the form "no component may ever…" a scan is
 * the stronger statement anyway — it proves the text is not in the tree at all.
 *
 * The accessibility half of this file exists because of a specific past defect.
 * `ruby.tsx` claimed its pieces were hidden and, on the actual web runtime, they
 * were not: 分かれる（わかれる）was announced as "わ 分 かれる". Nothing failed,
 * because no test read what the platform really forwards. Every new component
 * that hides a decoration is therefore checked here, so the same class of defect
 * cannot re-enter through a different file.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MAX_MARK_DENSITY, markDensity, marksAreOverwhelming } from '../src/ui/frontier-marks.ts';
import { INTERACTIVE_STYLES } from '../src/ui/interactive-styles.ts';
import { MIN_TOUCH_TARGET } from '../src/ui/theme.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(APP_ROOT, file);
const stripComments = (text: string): string =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const source = (file: string): string => stripComments(read(resolve(APP_ROOT, file)));

/** The components this lane added. Listed so a new one has to be registered. */
const VOCABULARY = [
  'src/ui/attribution.tsx',
  'src/ui/disclosure.tsx',
  'src/ui/frontier.tsx',
  'src/ui/lens.tsx',
  'src/ui/motion.tsx',
  'src/ui/recall.tsx',
  'src/ui/surface.tsx',
  'src/ui/vertical.tsx',
] as const;

describe('the vocabulary is complete and registered', () => {
  it('registers every component file this lane owns', () => {
    const present = readdirSync(resolve(APP_ROOT, 'src/ui'))
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => `src/ui/${name}`);
    const unregistered = VOCABULARY.filter((file) => !present.includes(file));
    expect(unregistered, 'a registered component file is missing').toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Decorations are hidden; meaning is spoken once
 * ------------------------------------------------------------------ */

describe('no decoration reaches the accessibility tree twice', () => {
  /**
   * The prop has to be one the web runtime forwards.
   *
   * `importantForAccessibility` and `accessibilityElementsHidden` are
   * Android/iOS-only and are silently dropped by react-native-web — which is
   * exactly how the ruby defect shipped. `aria-hidden` is forwarded on the web
   * and is mapped onto both native props by React Native ≥0.71, so it is
   * strictly more portable rather than a web-only concession.
   */
  it.each(VOCABULARY)('%s hides decorations with a prop the web target honours', (file) => {
    const body = source(file);
    expect(body).not.toContain('importantForAccessibility');
    expect(body).not.toContain('accessibilityElementsHidden');
  });

  it('hides the frontier underline, which the pressable already speaks', () => {
    const body = source('src/ui/frontier.tsx');
    const markTag = body.slice(body.indexOf('underline === null ? null : ('));
    expect(markTag.slice(0, 400)).toContain('aria-hidden');
    // The state is in the spoken label instead.
    expect(body).toMatch(/accessibilityLabel=\{`\$\{span\.text\}\$\{state\}`\}/);
  });

  it('hides the meter track, which its container already speaks', () => {
    const body = source('src/ui/recall.tsx');
    const trackTag = body.slice(body.indexOf('RECALL_BANDS.map'));
    expect(body.slice(body.indexOf('styles.track') - 200, body.indexOf('styles.track'))).toContain(
      'aria-hidden',
    );
    // Five unlabelled segments would otherwise be five stops for a screen reader.
    expect(trackTag).not.toContain('accessibilityLabel');
  });

  it('hides the disclosure chevron, because expanded state is already announced', () => {
    const body = source('src/ui/disclosure.tsx');
    expect(body).toMatch(/accessibilityState=\{\{ expanded: open \}\}/);
    const chevron = body.slice(
      body.indexOf('styles.chevron') - 200,
      body.indexOf('styles.chevron'),
    );
    expect(chevron).toContain('aria-hidden');
  });
});

/* ------------------------------------------------------------------ *
 * Everything interactive is labelled and reachable
 * ------------------------------------------------------------------ */

describe('every control is labelled', () => {
  it.each(VOCABULARY)('%s labels every pressable it renders', (file) => {
    const body = source(file);
    const pressables = body.match(/<Pressable\b[\s\S]*?>/g) ?? [];
    for (const tag of pressables) {
      expect(tag, `${file} renders an unlabelled Pressable`).toMatch(
        /accessibilityLabel|accessibilityRole="button"/,
      );
    }
  });

  it('keeps the disclosure header at the touch-target minimum', () => {
    // The header takes its size from `interactive-styles.ts` rather than from an
    // inline number, which is what puts it inside `touch-targets.test.ts`'s walk.
    expect(INTERACTIVE_STYLES.DisclosureHeader.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(source('src/ui/disclosure.tsx')).toContain('disclosureHeaderStyle');
  });

  it('states the active lens in words, not only in fill', () => {
    const body = source('src/ui/lens.tsx');
    expect(body).toContain('accessibilityLiveRegion="polite"');
    expect(body).toMatch(/selected=\{capability\.id === active\}/);
    // Exactly one lens is active: a set-valued prop would be a blend, and a
    // blend of five capabilities is the mastery light REQ-UI-07 forbids.
    expect(body).not.toMatch(/active:\s*(?:readonly\s+)?(?:Set|CapabilityId\[\])/);
  });
});

/* ------------------------------------------------------------------ *
 * The frontier density guard
 * ------------------------------------------------------------------ */

describe('the density guard', () => {
  const span = (mark: 'none' | 'frontier' | 'fragile') => ({ text: '道', mark }) as const;

  it('is zero for an empty passage rather than NaN', () => {
    expect(markDensity([])).toBe(0);
  });

  it('counts both mark kinds', () => {
    expect(markDensity([span('none'), span('frontier'), span('fragile'), span('none')])).toBe(0.5);
  });

  it('sits where comprehensible input stops being comprehensible', () => {
    // The frozen spec §4 targets 95–98% known. A third of a passage marked is
    // far past that, which is the point at which marks stop pointing.
    expect(MAX_MARK_DENSITY).toBeGreaterThan(0.2);
    expect(MAX_MARK_DENSITY).toBeLessThan(0.5);
  });

  it('trips only above the ceiling, not at it', () => {
    const third = [span('frontier'), span('none'), span('none')];
    expect(markDensity(third)).toBeCloseTo(MAX_MARK_DENSITY, 10);
    expect(marksAreOverwhelming(third)).toBe(false);
    expect(marksAreOverwhelming([span('frontier'), span('frontier'), span('none')])).toBe(true);
  });

  it('suppresses the marks rather than the words when it trips', () => {
    const body = source('src/ui/frontier.tsx');
    // Every span is still rendered and still tappable; only the mark is dropped.
    expect(body).toMatch(/mark=\{overwhelmed \? 'none' : span\.mark\}/);
    expect(body).toContain('OVERWHELMED_NOTE');
  });
});

/* ------------------------------------------------------------------ *
 * Nothing in the vocabulary writes state
 * ------------------------------------------------------------------ */

describe('the vocabulary renders state and never writes it', () => {
  it.each(VOCABULARY)('%s dispatches no command and mints no event', (file) => {
    const body = source(file);
    expect(body).not.toContain('createDomainEvent');
    expect(body).not.toMatch(/useAppStore|dispatch\(|appendEvent/);
  });

  it('reaches no store or persistence module from src/ui', () => {
    const offenders = walk(resolve(APP_ROOT, 'src/ui'))
      .filter((file) =>
        /from '\.\.\/state\/(?!app-context|view-state)/.test(stripComments(read(file))),
      )
      .map(rel);
    // `app-context` is the theme/connectivity seam the shell already uses and
    // `view-state` is a pure module of state *names* and copy. A reach past
    // those into the store or the persistence seam would make a presentational
    // component a participant in the write path.
    expect(offenders).toEqual([]);
  });
});
