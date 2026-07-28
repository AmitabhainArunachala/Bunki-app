/**
 * The era attribute, and the refusals that are most of it (Campaign E / A2′).
 *
 * The interesting assertions in this file are the *negative* ones. A test suite
 * that only proved 山 lands on 古道 would pass just as happily against a version
 * that guessed, so the bulk of what follows pins the cases where the honest
 * answer is `unknown` and checks that the stated reason is the one that came
 * back. `docs/design/BUNKI_THE_MAP_AS_VOYAGE_THROUGH_TIME_2026-07-28.md` §5 asks
 * for the attribute to be "sourced honestly … marked as unknown where it does
 * not [exist]", and "unknown where it does not" is a testable claim only if the
 * unknowns are enumerated.
 *
 * The readings used below are the real KANJIDIC2 lists for those characters, in
 * KANJIDIC2's own notation (`ひと.つ`, `ひと-`, katakana on-readings), because the
 * normalisation of that notation is part of what is under test.
 */

import { describe, expect, it } from 'vitest';

import {
  ERA_BASES,
  ERA_PLACEMENTS,
  attributeLexemeEra,
  attributeNodeEra,
  placementForBasis,
  projectNodeEras,
  summariseEraCoverage,
  toHiragana,
  buildKnowledgeGraph,
  type CharacterReadings,
  type EraAttribution,
  type EraSource,
  type GraphNode,
} from '../../src/index.ts';

import { randomFrom } from '../adversarial/support/fuzz.ts';

// ---------------------------------------------------------------------------
// Real KANJIDIC2 reading lists, in KANJIDIC2 notation
// ---------------------------------------------------------------------------

const READINGS: Readonly<Record<string, CharacterReadings>> = Object.freeze({
  山: { on: ['サン', 'セン'], kun: ['やま'] },
  手: { on: ['シュ', 'ズ'], kun: ['て', 'て-', 'た-'] },
  話: { on: ['ワ'], kun: ['はな.す', 'はなし'] },
  一: { on: ['イチ', 'イツ'], kun: ['ひと-', 'ひと.つ'] },
  般: { on: ['ハン'], kun: [] },
  電: { on: ['デン'], kun: ['いなずま'] },
  世: { on: ['セイ', 'セ', 'ソウ'], kun: ['よ', 'さんじゅう'] },
  界: { on: ['カイ'], kun: [] },
  学: { on: ['ガク'], kun: ['まな.ぶ'] },
  校: { on: ['コウ', 'キョウ'], kun: ['かせ', 'とやが.う', 'かんが.える'] },
  言: { on: ['ゲン', 'ゴン'], kun: ['い.う', 'こと'] },
  葉: { on: ['ヨウ'], kun: ['は'] },
  現: { on: ['ゲン'], kun: ['あらわ.れる', 'あらわ.す', 'うつつ', 'うつ.つ'] },
  場: { on: ['ジョウ', 'チョウ'], kun: ['ば'] },
  駅: { on: ['エキ'], kun: [] },
  分: { on: ['ブン', 'フン', 'ブ'], kun: ['わ.ける', 'わ.け', 'わ.かれる', 'わ.かる', 'わ.かつ'] },
  岐: { on: ['キ', 'ギ'], kun: ['わか.れる', 'えだ.になる', 'ちまた'] },
});

function readingsFor(characters: string): ReadonlyMap<string, CharacterReadings> {
  const map = new Map<string, CharacterReadings>();
  for (const character of characters) {
    const entry = READINGS[character];
    if (entry !== undefined) map.set(character, entry);
  }
  return map;
}

function lexeme(headword: string, reading: string): EraSource {
  return { headword, reading, characterReadings: readingsFor(headword) };
}

function node(id: string, kind: GraphNode['kind'], label: string): GraphNode {
  return { id, kind, label, componentIds: [] };
}

// ---------------------------------------------------------------------------
// The one placing rule
// ---------------------------------------------------------------------------

describe('the single native morpheme is the only thing that is placed', () => {
  it.each([
    ['山', 'やま'],
    ['手', 'て'],
  ])('places the bare kun reading %s/%s on 古道', (headword, reading) => {
    const attributed = attributeLexemeEra(lexeme(headword, reading));
    expect(attributed.placement).toBe('kodo');
    expect(attributed.basis).toBe('native_single_morpheme');
    expect(attributed.stratum).toBe('native');
  });

  it('places a kun stem carrying its own okurigana — 話す/はなす', () => {
    const attributed = attributeLexemeEra(lexeme('話す', 'はなす'));
    expect(attributed.placement).toBe('kodo');
    expect(attributed.basis).toBe('native_single_morpheme');
  });

  it('requires the okurigana to be the one KANJIDIC2 records', () => {
    // KANJIDIC2 lists `はな.す`, so `話し` (okurigana し) is not that entry. The
    // rule refuses rather than accepting a near miss.
    const attributed = attributeLexemeEra(lexeme('話し', 'はなし'));
    expect(attributed.placement).toBe('unknown');
    expect(attributed.basis).toBe('reading_unresolved');
  });

  it('does not place a Sino-Japanese single character — 分/ぶん', () => {
    const attributed = attributeLexemeEra(lexeme('分', 'ぶん'));
    expect(attributed.placement).toBe('unknown');
    expect(attributed.basis).toBe('sino_japanese_reading');
    expect(attributed.stratum).toBe('sino_japanese');
  });

  it('refuses when the reading is both an on and a kun reading', () => {
    const both: EraSource = {
      headword: '仮',
      reading: 'かり',
      characterReadings: new Map([['仮', { on: ['カリ'], kun: ['かり'] }]]),
    };
    const attributed = attributeLexemeEra(both);
    expect(attributed.placement).toBe('unknown');
    expect(attributed.basis).toBe('reading_ambiguous');
    expect(attributed.stratum).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The refusals, one by one
// ---------------------------------------------------------------------------

describe('漢語 is identified and deliberately not placed', () => {
  it.each([
    ['世界', 'せかい'],
    ['電話', 'でんわ'],
  ])('identifies %s/%s as Sino-Japanese and leaves it unplaced', (headword, reading) => {
    const attributed = attributeLexemeEra(lexeme(headword, reading));
    expect(attributed.stratum).toBe('sino_japanese');
    expect(attributed.basis).toBe('sino_japanese_reading');
    expect(attributed.placement).toBe('unknown');
  });

  /**
   * The load-bearing case, and the reason no on-reading is ever placed. 電話 is
   * a Meiji coinage; 世界 is a Buddhist import a millennium older. In the
   * shipped dictionary tier they are the same object — two on-readings — so any
   * rule that separated them would be inventing the difference.
   */
  it('cannot tell a Meiji coinage from an ancient Buddhist import', () => {
    const meiji = attributeLexemeEra(lexeme('電話', 'でんわ'));
    const ancient = attributeLexemeEra(lexeme('世界', 'せかい'));
    expect(meiji.placement).toBe(ancient.placement);
    expect(meiji.basis).toBe(ancient.basis);
  });

  it('resolves gemination and rendaku — 一般/いっぱん, 学校/がっこう', () => {
    expect(attributeLexemeEra(lexeme('一般', 'いっぱん')).stratum).toBe('sino_japanese');
    expect(attributeLexemeEra(lexeme('学校', 'がっこう')).stratum).toBe('sino_japanese');
  });
});

describe('native compounds are identified and deliberately not placed', () => {
  it('identifies 言葉/ことば as native and still refuses to place it', () => {
    const attributed = attributeLexemeEra(lexeme('言葉', 'ことば'));
    expect(attributed.stratum).toBe('native');
    expect(attributed.basis).toBe('native_compound');
    expect(attributed.placement).toBe('unknown');
  });

  it('places a native morpheme but not a compound of native morphemes', () => {
    expect(attributeLexemeEra(lexeme('山', 'やま')).placement).toBe('kodo');
    expect(attributeLexemeEra(lexeme('言葉', 'ことば')).placement).toBe('unknown');
  });
});

describe('mixed readings are identified and deliberately not placed', () => {
  it('identifies 現場/げんば (重箱読み) as mixed', () => {
    const attributed = attributeLexemeEra(lexeme('現場', 'げんば'));
    expect(attributed.stratum).toBe('mixed');
    expect(attributed.basis).toBe('mixed_reading');
    expect(attributed.placement).toBe('unknown');
  });
});

describe('katakana spelling places nothing', () => {
  it.each(['パン', 'ガラス', 'ドキドキ', 'コンピューター'])('refuses %s', (headword) => {
    const attributed = attributeLexemeEra({
      headword,
      reading: headword,
      characterReadings: new Map(),
    });
    expect(attributed.placement).toBe('unknown');
    expect(attributed.basis).toBe('foreign_script');
    expect(attributed.stratum).toBeNull();
  });

  /**
   * The specific failure this refusal exists to prevent: a katakana→鉄道 rule
   * would put Edo-period Portuguese bread and native onomatopoeia on the Meiji
   * rail layer, and nothing in the data would ever contradict it.
   */
  it('treats an Edo loan and a native onomatopoeia the same as a modern loan', () => {
    const forms = ['パン', 'ドキドキ', 'コンピューター'].map((headword) =>
      attributeLexemeEra({ headword, reading: headword, characterReadings: new Map() }),
    );
    expect(new Set(forms.map((f) => f.placement))).toEqual(new Set(['unknown']));
  });
});

describe('missing evidence is unknown-with-a-reason, never a default', () => {
  it('says so when a character has no reading list', () => {
    const attributed = attributeLexemeEra({
      headword: '峠',
      reading: 'とうげ',
      characterReadings: new Map(),
    });
    expect(attributed.basis).toBe('no_reading_evidence');
    expect(attributed.placement).toBe('unknown');
  });

  it('says so when one character of a compound has no reading list', () => {
    const attributed = attributeLexemeEra({
      headword: '世界',
      reading: 'せかい',
      characterReadings: readingsFor('世'),
    });
    expect(attributed.basis).toBe('no_reading_evidence');
  });

  it('refuses a reading it cannot reconstruct', () => {
    const attributed = attributeLexemeEra(lexeme('世界', 'ぜんぜんちがう'));
    expect(attributed.basis).toBe('reading_unresolved');
  });

  it('refuses a non-hiragana reading rather than guessing at it', () => {
    const attributed = attributeLexemeEra(lexeme('世界', 'セカイ'));
    expect(attributed.basis).toBe('reading_unresolved');
  });

  it('refuses an empty headword or reading', () => {
    expect(attributeLexemeEra(lexeme('', 'やま')).basis).toBe('reading_unresolved');
    expect(attributeLexemeEra(lexeme('山', '')).basis).toBe('reading_unresolved');
  });
});

// ---------------------------------------------------------------------------
// Node kinds
// ---------------------------------------------------------------------------

describe('a kanji character is never placed on one layer', () => {
  it('refuses 駅 by rule, not for want of data', () => {
    const attributed = attributeNodeEra(node('kanji:駅', 'kanji', '駅'), lexeme('駅', 'えき'));
    expect(attributed.placement).toBe('unknown');
    expect(attributed.basis).toBe('character_spans_eras');
  });

  it('refuses a kanji even when full evidence is supplied', () => {
    // 山 as a *word* is placed; 山 as a *character* is not. Same evidence, two
    // different questions, and only one of them has an answer.
    expect(attributeLexemeEra(lexeme('山', 'やま')).placement).toBe('kodo');
    expect(attributeNodeEra(node('kanji:山', 'kanji', '山'), lexeme('山', 'やま')).basis).toBe(
      'character_spans_eras',
    );
  });

  it.each(['reading', 'sense', 'sentence', 'encounter', 'component', 'grammar_construction'])(
    'gives a %s node no lexical era',
    (kind) => {
      const attributed = attributeNodeEra(
        node(`x:${kind}`, kind as GraphNode['kind'], 'x'),
        undefined,
      );
      expect(attributed.basis).toBe('not_a_lexical_node');
      expect(attributed.placement).toBe('unknown');
    },
  );

  it('says a lexeme with no dictionary record is unknown for lack of evidence', () => {
    const attributed = attributeNodeEra(node('lex:x', 'lexeme', 'x'), undefined);
    expect(attributed.basis).toBe('no_reading_evidence');
  });
});

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

describe('projectNodeEras', () => {
  const graph = buildKnowledgeGraph({
    nodes: [
      node('lex:yama', 'lexeme', '山'),
      node('lex:sekai', 'lexeme', '世界'),
      node('lex:missing', 'lexeme', '峠'),
      node('kanji:山', 'kanji', '山'),
      node('reading:やま', 'reading', 'やま'),
    ],
    edges: [],
  });
  const sources = new Map<string, EraSource>([
    ['lex:yama', lexeme('山', 'やま')],
    ['lex:sekai', lexeme('世界', 'せかい')],
  ]);

  it('returns an entry for every node, so a lookup miss cannot mean a default layer', () => {
    const projected = projectNodeEras(graph, sources);
    expect([...projected.keys()].sort()).toEqual([...graph.nodes.keys()].sort());
  });

  it('marks the node with no source as unknown for lack of evidence', () => {
    const projected = projectNodeEras(graph, sources);
    expect(projected.get('lex:missing')?.basis).toBe('no_reading_evidence');
  });

  it('is deterministic — two projections of one graph are deeply equal', () => {
    expect(projectNodeEras(graph, sources)).toEqual(projectNodeEras(graph, sources));
  });
});

// ---------------------------------------------------------------------------
// The coverage instrument
// ---------------------------------------------------------------------------

describe('summariseEraCoverage', () => {
  const attributions: readonly EraAttribution[] = [
    attributeLexemeEra(lexeme('山', 'やま')),
    attributeLexemeEra(lexeme('手', 'て')),
    attributeLexemeEra(lexeme('世界', 'せかい')),
    attributeLexemeEra(lexeme('言葉', 'ことば')),
  ];

  it('counts placements and bases, and reports the placed fraction', () => {
    const coverage = summariseEraCoverage(attributions);
    expect(coverage.total).toBe(4);
    expect(coverage.byPlacement.kodo).toBe(2);
    expect(coverage.byPlacement.unknown).toBe(2);
    expect(coverage.byBasis.native_single_morpheme).toBe(2);
    expect(coverage.placedFraction).toBeCloseTo(0.5, 10);
  });

  it('reports zero rather than dividing by zero on an empty corpus', () => {
    const coverage = summariseEraCoverage([]);
    expect(coverage.total).toBe(0);
    expect(coverage.placedFraction).toBe(0);
  });

  it('names every placement and every basis, so a zero is visible as a zero', () => {
    const coverage = summariseEraCoverage([]);
    expect(Object.keys(coverage.byPlacement).sort()).toEqual([...ERA_PLACEMENTS].sort());
    expect(Object.keys(coverage.byBasis).sort()).toEqual([...ERA_BASES].sort());
  });
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('properties that must hold whatever is thrown at it', () => {
  const CHARACTERS = Object.keys(READINGS);
  const KANA = [
    ...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽっゃゅょー',
  ];

  /**
   * Generated headwords and readings, most of them nonsense. The point is not
   * that the classifier gets them right — most have no right answer — it is that
   * it never *invents* one, and that its answer is always internally consistent.
   */
  function* fuzzed(seedBase: number, count: number): Generator<EraSource> {
    for (let index = 0; index < count; index += 1) {
      const random = randomFrom(seedBase + index);
      const length = 1 + random.int(4);
      const headword = Array.from({ length }, () => random.pick(CHARACTERS)).join('');
      const readingLength = random.int(8);
      const reading = Array.from({ length: readingLength }, () => random.pick(KANA)).join('');
      yield { headword, reading, characterReadings: readingsFor(headword) };
    }
  }

  it('only ever places on 古道, and only ever by the single-morpheme rule', () => {
    for (const source of fuzzed(0x9d0, 4000)) {
      const attributed = attributeLexemeEra(source);
      if (attributed.placement === 'unknown') continue;
      expect(attributed.placement).toBe('kodo');
      expect(attributed.basis).toBe('native_single_morpheme');
    }
  });

  it('never places a headword of more than one character', () => {
    for (const source of fuzzed(0x1a1d0, 4000)) {
      if ([...source.headword].length <= 1) continue;
      // A kun stem with okurigana is more than one *character* but one morpheme;
      // it is the single documented exception and it is still `kodo`.
      const attributed = attributeLexemeEra(source);
      if (attributed.placement !== 'unknown') {
        expect(attributed.basis).toBe('native_single_morpheme');
      }
    }
  });

  it('always returns a declared placement, a declared basis, and a non-empty reason', () => {
    for (const source of fuzzed(0x7e75d0, 4000)) {
      const attributed = attributeLexemeEra(source);
      expect(ERA_PLACEMENTS).toContain(attributed.placement);
      expect(ERA_BASES).toContain(attributed.basis);
      expect(attributed.detail.length).toBeGreaterThan(0);
      expect(attributed.placement).toBe(placementForBasis(attributed.basis));
    }
  });

  it('is a pure function of its input — two calls agree', () => {
    for (const source of fuzzed(0xd0ab1e, 1500)) {
      expect(attributeLexemeEra(source)).toEqual(attributeLexemeEra(source));
    }
  });

  it('a placed attribution always carries the native stratum', () => {
    for (const source of fuzzed(0x5713a7, 4000)) {
      const attributed = attributeLexemeEra(source);
      if (attributed.placement !== 'unknown') expect(attributed.stratum).toBe('native');
    }
  });
});

describe('toHiragana', () => {
  it('converts the katakana block and leaves everything else alone', () => {
    expect(toHiragana('イチ')).toBe('いち');
    expect(toHiragana('ジョウ')).toBe('じょう');
    expect(toHiragana('やま')).toBe('やま');
    expect(toHiragana('山')).toBe('山');
    // The prolonged-sound mark is in the katakana block but has no hiragana
    // counterpart, so it must survive unchanged rather than shift by 0x60.
    expect(toHiragana('コーヒー')).toBe('こーひー');
  });
});
