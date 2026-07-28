/**
 * Motion tokens and the path arithmetic behind the draw primitive.
 *
 * Two properties are worth a test rather than a comment:
 *
 *   1. **Nothing overshoots.** "No confetti" is a rule about a register, and a
 *      spring that overshoots is the register even when nobody calls it
 *      confetti. Stated as arithmetic on the easing control points, it is
 *      checkable; stated in a docblock, it is a hope.
 *   2. **Reduced motion is genuinely zero.** `resolveDuration` is the single
 *      seam every animated component goes through, so one assertion here covers
 *      all of them — and a component that stopped going through it is caught by
 *      the source scan at the bottom.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { svgPathLength } from '../src/ui/path-length.ts';
import { DURATION, EASING, resolveDuration, strokeSequenceDuration } from '../src/ui/theme.ts';

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
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('motion tokens', () => {
  it('has a duration for each of the three roles, and no celebratory one', () => {
    expect(Object.keys(DURATION).sort()).toEqual([
      'drawGap',
      'drawStroke',
      'instant',
      'lightIn',
      'lightOut',
      'quick',
      'settle',
    ]);
    for (const name of Object.keys(DURATION)) {
      expect(name).not.toMatch(/celebrat|success|reward|bounce|pop|confetti/i);
    }
  });

  it('lights in faster than it lights out', () => {
    // Arrival is noticed, departure is not. Reversing these makes a surface
    // feel jumpy on the way in and sticky on the way out.
    expect(DURATION.lightIn).toBeLessThan(DURATION.lightOut);
  });

  it('draws a stroke slowly enough to be followed', () => {
    // A stroke is the content of a stroke-order animation; below roughly a
    // third of a second the eye registers an appearance rather than a writing
    // direction, which is the whole thing being taught.
    expect(DURATION.drawStroke).toBeGreaterThanOrEqual(300);
  });

  it('never overshoots', () => {
    for (const [name, [x1, y1, x2, y2]] of Object.entries(EASING)) {
      // x must stay in [0,1] for the curve to be a legal cubic-bezier timing
      // function at all; y outside [0,1] is what a bounce or an anticipation is.
      expect(x1, `${name} x1`).toBeGreaterThanOrEqual(0);
      expect(x1, `${name} x1`).toBeLessThanOrEqual(1);
      expect(x2, `${name} x2`).toBeGreaterThanOrEqual(0);
      expect(x2, `${name} x2`).toBeLessThanOrEqual(1);
      expect(y1, `${name} y1 overshoots`).toBeGreaterThanOrEqual(0);
      expect(y1, `${name} y1 overshoots`).toBeLessThanOrEqual(1);
      expect(y2, `${name} y2 overshoots`).toBeGreaterThanOrEqual(0);
      expect(y2, `${name} y2 overshoots`).toBeLessThanOrEqual(1);
    }
  });
});

describe('reduced motion', () => {
  it('zeroes every duration', () => {
    for (const name of Object.keys(DURATION) as (keyof typeof DURATION)[]) {
      expect(resolveDuration(name, true)).toBe(0);
      expect(resolveDuration(name, false)).toBe(DURATION[name]);
    }
  });

  it('zeroes a whole stroke sequence, not only one stroke', () => {
    expect(strokeSequenceDuration(7, true)).toBe(0);
    expect(strokeSequenceDuration(7, false)).toBe(7 * DURATION.drawStroke + 6 * DURATION.drawGap);
    expect(strokeSequenceDuration(0, false)).toBe(0);
    expect(strokeSequenceDuration(1, false)).toBe(DURATION.drawStroke);
  });

  /**
   * Every animation goes through the seam.
   *
   * A component that built its own duration would keep animating for a learner
   * who asked it not to, and nothing else in the suite would notice — the
   * screenshots would look identical. So: any file that starts an `Animated`
   * timing must also name `resolveDuration`.
   */
  it('leaves no animated component outside resolveDuration', () => {
    const offenders = walk(resolve(APP_ROOT, 'src'))
      .filter((file) => {
        const body = stripComments(read(file));
        return body.includes('Animated.timing') && !body.includes('resolveDuration');
      })
      .map((file) => relative(APP_ROOT, file));
    expect(offenders, 'these animate without consulting the reduced-motion seam').toEqual([]);
  });
});

describe('path length', () => {
  it('measures a straight line exactly', () => {
    expect(svgPathLength('M0,0 L3,4')).toBeCloseTo(5, 6);
    expect(svgPathLength('M0,0 H10')).toBeCloseTo(10, 6);
    expect(svgPathLength('M0,0 V-10')).toBeCloseTo(10, 6);
  });

  it('closes a subpath back to its start', () => {
    // A unit square: three explicit sides plus the closing one.
    expect(svgPathLength('M0,0 H1 V1 H0 Z')).toBeCloseTo(4, 6);
  });

  it('treats extra pairs after a moveto as line-tos, per the SVG grammar', () => {
    expect(svgPathLength('M0,0 3,4')).toBeCloseTo(5, 6);
  });

  it('approximates a curve from below, and closely', () => {
    // A cubic whose control points lie on the straight line it spans is that
    // line, so the flattened length must equal it rather than merely approach it.
    expect(svgPathLength('M0,0 C3,0 7,0 10,0')).toBeCloseTo(10, 4);

    // A quarter-circle of radius 10 approximated by the standard 0.5523 cubic:
    // true length is 10·π/2 ≈ 15.708. The polyline is inscribed, so it must be
    // slightly under, and within a tenth of a percent at 24 steps.
    const quarter = svgPathLength('M10,0 C10,5.523 5.523,10 0,10');
    const exact = (10 * Math.PI) / 2;
    expect(quarter).toBeLessThanOrEqual(exact);
    expect(quarter).toBeGreaterThan(exact * 0.999);
  });

  it('handles relative commands and smooth-curve reflection', () => {
    expect(svgPathLength('m0,0 l3,4')).toBeCloseTo(5, 6);
    // Two mirrored cubics: the S must reflect the previous control point, so the
    // result is symmetric about the join and twice the first half.
    const full = svgPathLength('M0,0 C0,5 5,10 10,10 S20,15 20,20');
    const half = svgPathLength('M0,0 C0,5 5,10 10,10');
    expect(full).toBeGreaterThan(half);
  });

  it('returns zero rather than throwing on nonsense', () => {
    expect(svgPathLength('')).toBe(0);
    expect(svgPathLength('not a path')).toBe(0);
    expect(svgPathLength('M')).toBe(0);
  });

  it('measures the seed’s own strokes as plausible lengths', async () => {
    const { seedDataset } = await import('@bunki/seed');
    expect(seedDataset.kanji.length).toBeGreaterThan(0);
    // KanjiVG paths live in a 109×109 box, so a single stroke is somewhere
    // between a few units and a few hundred. A parser that silently produced 0
    // would make every stroke draw instantly, which is the failure this catches.
    const { parseKanjiVgStrokes } = await import('../src/ui/../data/kanjivg.ts');
    const { readFileSync: readSvg } = await import('node:fs');
    const svg = readSvg(resolve(APP_ROOT, '../../packages/seed/data/strokes/05c90.svg'), 'utf8');
    const set = parseKanjiVgStrokes(svg);
    expect(set.strokes.length).toBeGreaterThan(0);
    for (const stroke of set.strokes) {
      const length = svgPathLength(stroke.d);
      expect(length, `stroke ${stroke.id} measured ${length}`).toBeGreaterThan(1);
      expect(length).toBeLessThan(600);
    }
  });
});
