/**
 * The scale ladder — six levels, and the one law that makes them recursive
 * (Campaign E, Wave C / lane B2; `docs/design/BUNKI_THE_FRACTAL_DIVE_2026-07-28.md` §1).
 *
 * ## Why scale is a real axis and not a metaphor
 *
 * Japanese orthography is self-similar in the literal sense: the same unit is a
 * whole at one scale and a part at another, recursively. 木 is a kanji and a
 * component of 林; 林 is a kanji and a component of 森; 森 is a kanji and a
 * constituent of 森林. So a ladder over scale is a faithful rendering of how the
 * writing system is built rather than a visual conceit laid over it.
 *
 * ## The law
 *
 * At **every** level a node has exactly two scale directions, and they are the
 * same relationship seen from opposite ends:
 *
 *   - **inward** — its constituents, what it is made of. 森 → 木 木 木.
 *   - **outward** — its participations, what it makes. 森 → 森林, 青森.
 *
 * There is a third bucket in this package, `alongside`, and it is deliberately
 * *not* a scale direction: a contrast pair and a reading family sit at the same
 * level, so zooming toward one would not change scale. Naming it separately is
 * what stops "two directions" from quietly becoming three.
 *
 * ## Direction is computed from the levels, never declared per edge
 *
 * {@link relationDirectionBetween} decides inward/outward/alongside by comparing
 * the two nodes' depths on this ladder. That is what makes the ladder honest
 * about the gaps: nothing has to be told that a word reaches a sentence *past*
 * the collocation level, because the depths say so and the skipped level is
 * reported rather than papered over.
 *
 * ## Purity
 *
 * Tables and total functions. No clock, no randomness, no I/O — `test/purity`
 * scans this directory with everything else under `src/`.
 */

/**
 * The six levels, coarsest-grained last.
 *
 * The names are the *unit*, not the data source, because a level outlives the
 * dataset that happens to populate it: `stroke` is a stroke whether it arrives
 * from KanjiVG or from somewhere else later.
 */
export const SCALE_LEVELS = [
  'stroke',
  'component',
  'kanji',
  'word',
  'collocation',
  'sentence',
] as const;

export type ScaleLevel = (typeof SCALE_LEVELS)[number];

/**
 * How deep a level sits — L0 through L5, exactly the design document's numbering.
 *
 * Derived from {@link SCALE_LEVELS} rather than written out a second time, so
 * the two cannot disagree about what L3 is.
 */
export const SCALE_LEVEL_DEPTH: Readonly<Record<ScaleLevel, number>> = Object.freeze(
  Object.fromEntries(SCALE_LEVELS.map((level, index) => [level, index])) as Record<
    ScaleLevel,
    number
  >,
);

/** The level at a given depth, or `null` past either end of the ladder. */
export function scaleLevelAtDepth(depth: number): ScaleLevel | null {
  return SCALE_LEVELS[depth] ?? null;
}

/**
 * How a level is named, in Japanese and in English.
 *
 * Carried with the level so a surface can say *which* scale it is showing
 * without keeping its own table. This is vocabulary about the writing system,
 * not about any learner.
 */
export interface ScaleLevelName {
  readonly level: ScaleLevel;
  /** 画 — how it is written. */
  readonly written: string;
  /** kaku — how it is read. */
  readonly reading: string;
  /** "stroke" — one word, in English. */
  readonly gloss: string;
  /** The design document's own example at this level. */
  readonly example: string;
}

export const SCALE_LEVEL_NAMES: Readonly<Record<ScaleLevel, ScaleLevelName>> = Object.freeze({
  stroke: {
    level: 'stroke',
    written: '画',
    reading: 'kaku',
    gloss: 'stroke',
    example: 'the seven strokes of 車, in order',
  },
  component: {
    level: 'component',
    written: '部首・構成要素',
    reading: 'bushu / kōsei-yōso',
    gloss: 'component',
    example: '氵, 木, 亻, 灬',
  },
  kanji: {
    level: 'kanji',
    written: '漢字',
    reading: 'kanji',
    gloss: 'character',
    example: '森, 駅, 分',
  },
  word: {
    level: 'word',
    written: '熟語・語',
    reading: 'jukugo / go',
    gloss: 'word',
    example: '森林, 分岐, 駅前',
  },
  collocation: {
    level: 'collocation',
    written: '連語',
    reading: 'rengo',
    gloss: 'collocation or phrase',
    example: '道が分かれる, 分岐点に立つ',
  },
  sentence: {
    level: 'sentence',
    written: '文',
    reading: 'bun',
    gloss: 'sentence',
    example: 'the sentence you actually met it in',
  },
});

/**
 * The two scale directions, plus the same-level bucket that is not one.
 *
 * `alongside` is in this union because every relation the ladder returns has to
 * say which bucket it is in, and a relation between two nodes at one level is a
 * real relation the domain holds. It is excluded from {@link SCALE_DIRECTIONS}
 * so that "one gesture, two directions" stays exactly true.
 */
export const RELATION_BUCKETS = ['inward', 'outward', 'alongside'] as const;
export type RelationBucket = (typeof RELATION_BUCKETS)[number];

/** The two directions a zoom can go. `alongside` is not one of them. */
export const SCALE_DIRECTIONS = ['inward', 'outward'] as const;
export type ScaleDirection = (typeof SCALE_DIRECTIONS)[number];

export function isScaleDirection(bucket: RelationBucket): bucket is ScaleDirection {
  return bucket !== 'alongside';
}

/**
 * Which bucket a relation between two levels falls in.
 *
 * Total, and the only place the question is answered. A caller that wanted to
 * label an edge by its *kind* — "`component_of` is always inward" — would be
 * right today and wrong the first time a dataset put two components in a
 * containment relation, so the levels decide.
 */
export function relationDirectionBetween(from: ScaleLevel, to: ScaleLevel): RelationBucket {
  const here = SCALE_LEVEL_DEPTH[from];
  const there = SCALE_LEVEL_DEPTH[to];
  if (there < here) return 'inward';
  if (there > here) return 'outward';
  return 'alongside';
}

/**
 * The level one step inward, or `null` at the floor.
 *
 * "One step" is the *nominal* neighbour, which is not always the level a
 * relation actually lands on: a word's constituents are kanji, one step in, but
 * a word's participations are sentences, two steps out, because the shipped
 * dictionary tier carries no collocations. {@link import('./dive.ts').diveAt}
 * reports the skipped level as a gap rather than pretending the ladder is dense.
 */
export function levelInwardOf(level: ScaleLevel): ScaleLevel | null {
  return scaleLevelAtDepth(SCALE_LEVEL_DEPTH[level] - 1);
}

/** The level one step outward, or `null` at the ceiling. */
export function levelOutwardOf(level: ScaleLevel): ScaleLevel | null {
  return scaleLevelAtDepth(SCALE_LEVEL_DEPTH[level] + 1);
}
