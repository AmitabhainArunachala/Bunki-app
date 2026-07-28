/**
 * The six levels and the one law (Campaign E, Wave C / lane B2).
 */

import { describe, expect, it } from 'vitest';

import {
  RELATION_BUCKETS,
  SCALE_DIRECTIONS,
  SCALE_LEVELS,
  SCALE_LEVEL_DEPTH,
  SCALE_LEVEL_NAMES,
  isScaleDirection,
  levelInwardOf,
  levelOutwardOf,
  relationDirectionBetween,
  scaleLevelAtDepth,
  type ScaleLevel,
} from '../../src/index.ts';

describe('the ladder has exactly the six levels the design document names', () => {
  it('runs stroke → component → kanji → word → collocation → sentence', () => {
    expect(SCALE_LEVELS).toEqual([
      'stroke',
      'component',
      'kanji',
      'word',
      'collocation',
      'sentence',
    ]);
  });

  it('numbers them L0 to L5, in that order', () => {
    expect(SCALE_LEVEL_DEPTH.stroke).toBe(0);
    expect(SCALE_LEVEL_DEPTH.component).toBe(1);
    expect(SCALE_LEVEL_DEPTH.kanji).toBe(2);
    expect(SCALE_LEVEL_DEPTH.word).toBe(3);
    expect(SCALE_LEVEL_DEPTH.collocation).toBe(4);
    expect(SCALE_LEVEL_DEPTH.sentence).toBe(5);
  });

  it('inverts the depth table exactly', () => {
    SCALE_LEVELS.forEach((level) => {
      expect(scaleLevelAtDepth(SCALE_LEVEL_DEPTH[level])).toBe(level);
    });
    expect(scaleLevelAtDepth(-1)).toBeNull();
    expect(scaleLevelAtDepth(6)).toBeNull();
  });

  it('names every level in Japanese and in English', () => {
    SCALE_LEVELS.forEach((level) => {
      const name = SCALE_LEVEL_NAMES[level];
      expect(name.level).toBe(level);
      expect(name.written.length).toBeGreaterThan(0);
      expect(name.reading.length).toBeGreaterThan(0);
      expect(name.gloss.length).toBeGreaterThan(0);
      expect(name.example.length).toBeGreaterThan(0);
    });
  });
});

describe('two scale directions, and a third bucket that is not one', () => {
  it('keeps `alongside` out of the directions a zoom can take', () => {
    expect(SCALE_DIRECTIONS).toEqual(['inward', 'outward']);
    expect(RELATION_BUCKETS).toEqual(['inward', 'outward', 'alongside']);
    expect(isScaleDirection('alongside')).toBe(false);
    expect(isScaleDirection('inward')).toBe(true);
    expect(isScaleDirection('outward')).toBe(true);
  });

  it('reads direction off the levels, not off the edge', () => {
    expect(relationDirectionBetween('kanji', 'component')).toBe('inward');
    expect(relationDirectionBetween('kanji', 'word')).toBe('outward');
    expect(relationDirectionBetween('kanji', 'kanji')).toBe('alongside');
    // The skip the shipped tier actually has: a word reaches a sentence past
    // the collocation level, and that is still outward.
    expect(relationDirectionBetween('word', 'sentence')).toBe('outward');
    expect(relationDirectionBetween('sentence', 'word')).toBe('inward');
  });

  it('is antisymmetric, which is the law stated as an equation', () => {
    // "INWARD = constituents, OUTWARD = participations, and they are the same
    // relationship from opposite ends" — so reversing the pair reverses the
    // bucket, at every pair of levels, with no exceptions.
    const flip = (bucket: string): string =>
      bucket === 'inward' ? 'outward' : bucket === 'outward' ? 'inward' : 'alongside';
    SCALE_LEVELS.forEach((from: ScaleLevel) => {
      SCALE_LEVELS.forEach((to: ScaleLevel) => {
        expect(relationDirectionBetween(to, from)).toBe(flip(relationDirectionBetween(from, to)));
      });
    });
  });

  it('has a floor and a ceiling and says so with null rather than wrapping', () => {
    expect(levelInwardOf('stroke')).toBeNull();
    expect(levelOutwardOf('sentence')).toBeNull();
    expect(levelInwardOf('kanji')).toBe('component');
    expect(levelOutwardOf('kanji')).toBe('word');
  });
});
