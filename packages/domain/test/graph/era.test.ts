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
 *
 * That sentence used to be an assertion and is now a checked property, because it
 * was false. Five of the seventeen entries were not KANJIDIC2's lists: 電, 校 and
 * 岐 were each given kun readings KANJIDIC2 does not record at all, 世 gained
 * `さんじゅう`, and 手 was missing `-て`. A verifier caught it. The suite still
 * passed after the correction — the invented readings were not load-bearing for
 * any assertion — which is exactly why nothing would ever have contradicted the
 * sentence: a fixture that claims to be upstream data and is not can sit in a
 * green suite indefinitely.
 *
 * `matches the shipped KANJIDIC2 tier, character for character` below now derives
 * the obligation from the data instead of restating it. It is skipped when the
 * imported tier is absent, since that tier arrives on its own branch.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

import { randomFrom, type Random } from '../adversarial/support/fuzz.ts';

// ---------------------------------------------------------------------------
// Real KANJIDIC2 reading lists, in KANJIDIC2 notation
// ---------------------------------------------------------------------------

const READINGS: Readonly<Record<string, CharacterReadings>> = Object.freeze({
  山: { on: ['サン', 'セン'], kun: ['やま'] },
  手: { on: ['シュ', 'ズ'], kun: ['て', 'て-', '-て', 'た-'] },
  話: { on: ['ワ'], kun: ['はな.す', 'はなし'] },
  一: { on: ['イチ', 'イツ'], kun: ['ひと-', 'ひと.つ'] },
  般: { on: ['ハン'], kun: [] },
  電: { on: ['デン'], kun: [] },
  世: { on: ['セイ', 'セ', 'ソウ'], kun: ['よ'] },
  界: { on: ['カイ'], kun: [] },
  学: { on: ['ガク'], kun: ['まな.ぶ'] },
  校: { on: ['コウ', 'キョウ'], kun: [] },
  言: { on: ['ゲン', 'ゴン'], kun: ['い.う', 'こと'] },
  葉: { on: ['ヨウ'], kun: ['は'] },
  現: { on: ['ゲン'], kun: ['あらわ.れる', 'あらわ.す', 'うつつ', 'うつ.つ'] },
  場: { on: ['ジョウ', 'チョウ'], kun: ['ば'] },
  駅: { on: ['エキ'], kun: [] },
  分: { on: ['ブン', 'フン', 'ブ'], kun: ['わ.ける', 'わ.け', 'わ.かれる', 'わ.かる', 'わ.かつ'] },
  岐: { on: ['キ', 'ギ'], kun: [] },
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
   * KANJIDIC2 kun notation split into the part the character covers and the
   * okurigana that follows it — `はな.す` → `はな` + `す`, `ひと-` → `ひと` + ``.
   *
   * Re-derived here rather than imported from `era.ts`. This function builds
   * *inputs*; an input assembled by the very parser the classifier uses would
   * agree with that parser however it drifted, which is not a generator, it is
   * a mirror. (`toHiragana` is imported instead of copied because it is a public
   * export with its own direct tests further down this file.)
   */
  function splitKun(raw: string): { readonly base: string; readonly okurigana: string } {
    const stripped = raw.replaceAll('-', '');
    const stop = stripped.indexOf('.');
    if (stop === -1) return { base: stripped, okurigana: '' };
    return { base: stripped.slice(0, stop), okurigana: stripped.slice(stop + 1) };
  }

  const kunListOf = (character: string): readonly string[] => READINGS[character]?.kun ?? [];
  const onListOf = (character: string): readonly string[] => READINGS[character]?.on ?? [];

  const WITH_KUN = CHARACTERS.filter((character) => kunListOf(character).length > 0);
  const WITH_ON = CHARACTERS.filter((character) => onListOf(character).length > 0);

  /** The kun form of a character, headword and reading together: 話 → 話す/はなす. */
  function kunOf(
    character: string,
    random: Random,
  ): { readonly headword: string; readonly reading: string } {
    const { base, okurigana } = splitKun(random.pick(kunListOf(character)));
    return { headword: character + okurigana, reading: base + okurigana };
  }

  /** The on form, in the hiragana a lexeme reading is written in: 電 → でん. */
  function onOf(character: string, random: Random): string {
    return toHiragana(random.pick(onListOf(character)).replaceAll('-', ''));
  }

  /**
   * One morpheme of a compound: the character's on or kun base, whichever it
   * has. Several characters here record no kun reading at all (般, 界, 駅), so
   * "pick a list at random" has to mean "pick from the lists that exist".
   */
  function morphemeOf(character: string, random: Random): string {
    const on = onListOf(character);
    const kun = kunListOf(character);
    const useOn = kun.length === 0 || (on.length > 0 && random.bool());
    return useOn ? onOf(character, random) : splitKun(random.pick(kun)).base;
  }

  /**
   * Generated headwords and readings, most of them nonsense — but not *all* of
   * them, and that distinction is the repair.
   *
   * The point of this corpus is that the classifier never *invents* an answer
   * and that its answer is always internally consistent. But three of the
   * properties below are about what a **placed** attribution looks like, and a
   * generator that never produces one asserts nothing while passing. The
   * original drew readings as uniform random kana, which matches a KANJIDIC2
   * reading essentially never: instrumented over 4,000 cases per seed it placed
   * 0, 2, 1 and 1 — and 0 of the multi-character headwords the second property
   * is named after. Deleting the only rule that places left all three green.
   *
   * So the shapes are drawn deliberately now. `kun` and `on` assemble a reading
   * out of the character's own recorded readings, `compound` concatenates two or
   * three of them, and `noise` is the original uniform kana. Every shape is then
   * *perturbed* a fifth of the time — a kana appended to the reading — so the
   * near-misses that must come back `reading_unresolved` stay in the corpus
   * beside the hits. What comes out is still not a claim about what the
   * classifier should say; it is a corpus that reaches the branch under test.
   */
  function* fuzzed(seedBase: number, count: number): Generator<EraSource> {
    for (let index = 0; index < count; index += 1) {
      const random = randomFrom(seedBase + index);
      const shape = random.int(10);
      let headword: string;
      let reading: string;

      if (shape < 3) {
        ({ headword, reading } = kunOf(random.pick(WITH_KUN), random));
      } else if (shape < 5) {
        headword = random.pick(WITH_ON);
        reading = onOf(headword, random);
      } else if (shape < 8) {
        const characters = Array.from({ length: 2 + random.int(2) }, () => random.pick(CHARACTERS));
        headword = characters.join('');
        reading = characters.map((character) => morphemeOf(character, random)).join('');
      } else {
        const length = 1 + random.int(4);
        headword = Array.from({ length }, () => random.pick(CHARACTERS)).join('');
        reading = Array.from({ length: random.int(8) }, () => random.pick(KANA)).join('');
      }

      // A near miss is as much a case as a hit: it is what makes
      // `reading_unresolved` the majority answer rather than an unreached branch.
      if (random.bool(0.2)) reading += random.pick(KANA);

      yield { headword, reading, characterReadings: readingsFor(headword) };
    }
  }

  /**
   * How many of a corpus were placed, and how many of *those* were longer than
   * one character.
   *
   * Every property below whose subject is a placed attribution asserts on this
   * first. A guarded assertion that never runs is not a weak test, it is a green
   * light wired to nothing, and the only defence is for the test to check that
   * its own subject occurred.
   */
  function placementCensus(corpus: Iterable<EraSource>): {
    readonly total: number;
    readonly placed: number;
    readonly placedMultiCharacter: number;
  } {
    let total = 0;
    let placed = 0;
    let placedMultiCharacter = 0;
    for (const source of corpus) {
      total += 1;
      if (attributeLexemeEra(source).placement === 'unknown') continue;
      placed += 1;
      if ([...source.headword].length > 1) placedMultiCharacter += 1;
    }
    return { total, placed, placedMultiCharacter };
  }

  it('generates a corpus that actually reaches the rule that places', () => {
    // The guard on the three properties that follow. It is stated as a floor
    // rather than an exact count so that adding a character to READINGS is not a
    // test edit, but it is high enough that the decorative corpus this replaced
    // — 0 to 2 placements per 4,000 — could not satisfy it.
    const census = placementCensus(fuzzed(0x9d0, 4000));
    expect(census.placed).toBeGreaterThan(300);
    expect(census.placedMultiCharacter).toBeGreaterThan(100);
  });

  it('only ever places on 古道, and only ever by the single-morpheme rule', () => {
    let placed = 0;
    for (const source of fuzzed(0x9d0, 4000)) {
      const attributed = attributeLexemeEra(source);
      if (attributed.placement === 'unknown') continue;
      placed += 1;
      expect(attributed.placement).toBe('kodo');
      expect(attributed.basis).toBe('native_single_morpheme');
    }
    expect(placed).toBeGreaterThan(300);
  });

  it('never places a headword of more than one character', () => {
    let placedMultiCharacter = 0;
    for (const source of fuzzed(0x1a1d0, 4000)) {
      if ([...source.headword].length <= 1) continue;
      // A kun stem with okurigana is more than one *character* but one morpheme;
      // it is the single documented exception and it is still `kodo`.
      const attributed = attributeLexemeEra(source);
      if (attributed.placement === 'unknown') continue;
      placedMultiCharacter += 1;
      expect(attributed.basis).toBe('native_single_morpheme');
      expect([...source.headword].slice(1).join('')).not.toBe('');
    }
    expect(placedMultiCharacter).toBeGreaterThan(100);
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
    let placed = 0;
    for (const source of fuzzed(0x5713a7, 4000)) {
      const attributed = attributeLexemeEra(source);
      if (attributed.placement === 'unknown') continue;
      placed += 1;
      expect(attributed.stratum).toBe('native');
    }
    expect(placed).toBeGreaterThan(300);
  });

  it('still refuses far more than it places, and says why each time', () => {
    // The corpus is not stacked: near misses and compounds are the bulk of it,
    // so the negative branches this file is mostly about are still exercised.
    const bases = new Map<string, number>();
    for (const source of fuzzed(0x7e75d0, 4000)) {
      const { basis } = attributeLexemeEra(source);
      bases.set(basis, (bases.get(basis) ?? 0) + 1);
    }
    expect(bases.get('reading_unresolved') ?? 0).toBeGreaterThan(500);
    expect(bases.get('sino_japanese_reading') ?? 0).toBeGreaterThan(100);
    expect(bases.get('native_compound') ?? 0).toBeGreaterThan(0);
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

/* ------------------------------------------------------------------ *
 * The fixture is upstream's, and this is what makes that true
 * ------------------------------------------------------------------ */

/**
 * ADR-001 boundary 1 forbids `@bunki/domain` from *importing* `@bunki/seed`, so
 * this reads the emitted file by path — the same escape `era-corpus.test.ts`
 * uses, and for the same reason: nothing is imported and no seed record is
 * copied into the package.
 */
const SEED_KANJI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'seed',
  'data',
  'dictionary',
  'kanji.json',
);

describe('the reading fixture is KANJIDIC2, not a plausible imitation', () => {
  it('matches the shipped KANJIDIC2 tier, character for character', () => {
    if (!existsSync(SEED_KANJI)) {
      // The imported tier arrives on its own branch. Absent is not a failure —
      // but it is also not a pass, so say which happened rather than going green.
      expect(existsSync(SEED_KANJI), 'imported tier absent; fixture unchecked this run').toBe(
        false,
      );
      return;
    }

    const tier = JSON.parse(readFileSync(SEED_KANJI, 'utf8')) as {
      records: readonly {
        character: string;
        onReadings?: readonly string[];
        kunReadings?: readonly string[];
      }[];
    };
    const upstream = new Map(tier.records.map((record) => [record.character, record]));

    let checked = 0;
    for (const [character, readings] of Object.entries(READINGS)) {
      const real = upstream.get(character);
      if (real === undefined) continue;
      checked += 1;
      expect([...readings.on], `${character} on-readings are not KANJIDIC2's`).toEqual([
        ...(real.onReadings ?? []),
      ]);
      expect([...readings.kun], `${character} kun-readings are not KANJIDIC2's`).toEqual([
        ...(real.kunReadings ?? []),
      ]);
    }

    // Non-vacuity: a fixture whose characters had all fallen out of the tier
    // would pass every comparison above by making none of them.
    expect(checked, 'no fixture character is in the tier, so nothing was compared').toBeGreaterThan(
      10,
    );
  });
});
