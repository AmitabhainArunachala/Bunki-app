/**
 * Which era layer of the map a node belongs on — and, far more often, the
 * honest admission that the dictionary tier does not say (Campaign E / A2′).
 *
 * ## What the map wants
 *
 * `docs/design/BUNKI_THE_MAP_AS_VOYAGE_THROUGH_TIME_2026-07-28.md` §2 lays the
 * map on three era layers, and asks that a node's *place* be meaningful:
 *
 *   - **古道 `kodo`**    — Nara/Heian → medieval. 訓読み, native vocabulary.
 *   - **街道 `kaido`**   — Edo. 漢語 in daily use, trade and travel vocabulary.
 *   - **鉄道 `tetsudo`** — Meiji → now. 和製漢語, katakana loans, signage.
 *
 * ## What the dictionary tier can actually support
 *
 * Almost none of that, and saying so is this file's main job.
 *
 * The shipped tier (`packages/seed/data/dictionary/`, imported from JMdict,
 * KANJIDIC2 and Tatoeba) carries, per lexeme: `headword`, `reading`,
 * `partOfSpeech`, `senses`, `kanjiUsed`, `priorityTags`. Per kanji:
 * `strokeCount`, `grade`, `frequency`, `jlpt`, `onReadings`, `kunReadings`,
 * `meanings`, `components`, `radicals`. **Not one of those fields is a date**,
 * and the two JMdict fields that would have carried era information —
 * `<lsource>` (the source language of a loanword) and `<misc>` (which carries
 * `arch`, `obs`, `rare`) — are not parsed by the importer, so they are not in
 * the shipped bytes at all. There is therefore no field to read a century off.
 *
 * What *is* derivable is the **lexical stratum**: whether a word is being read
 * with a native (訓) reading or a Sino-Japanese (音) one. That is computable
 * exactly, by matching the lexeme's reading against the KANJIDIC2 reading lists
 * of the characters it is written with. It is a fact about the word, not a
 * guess.
 *
 * ## The one rule that places anything, and why only that one
 *
 * A **single native morpheme** — one ideograph, optionally with its KANJIDIC2
 * okurigana, read with that character's kun reading — is 和語 (yamato-kotoba).
 * 山 やま, 手 て, 話す はなす. The native lexical stratum predates every road on
 * the map, and the design document assigns "訓読み, native vocabulary" to 古道.
 * So that, and only that, is placed on `kodo`.
 *
 * Everything else refuses, each for a stated reason:
 *
 *   - **Sino-Japanese readings are not placed.** 漢語 spans all three layers:
 *     the first Chinese imports (古道), Edo commoner vocabulary (街道), and
 *     Meiji 和製漢語 coinages (鉄道). 電話 and 世界 are indistinguishable in
 *     this data — both are two on-readings — yet one is a Meiji coinage and the
 *     other is a Buddhist import a millennium older. Placing them would be
 *     invention.
 *   - **Native *compounds* are not placed.** Morpheme stratum does not transfer
 *     to a compound: 取締役 とりしまりやく is native morphemes throughout and is
 *     a Meiji office. Only the single-morpheme case is safe.
 *   - **Katakana spelling is not placed.** Orthography is not etymology. パン
 *     and ガラス are Edo-period Portuguese and Dutch, ドキドキ is native
 *     onomatopoeia, イヌ is native. Mapping "written in katakana" to the rail
 *     layer would put Edo bread on a Meiji train.
 *   - **A kanji character is never placed at all.** 駅 is the design document's
 *     own worked example precisely because it lives on all three layers at once
 *     — 駅家 post-station, 宿場, railway station, and 駅伝 still carrying the
 *     original sense. A character has no single era, so `kanji` nodes are
 *     `unknown` by rule rather than by missing data.
 *
 * `unknown` is therefore a **first-class placement with a reason attached**, not
 * a null that a renderer can quietly default onto a layer. Every attribution
 * carries the {@link EraBasis} that produced it, so the map can say "we do not
 * know when this entered the language" and, where it matters, *why* not.
 *
 * ## Measured coverage
 *
 * Over the real 3,000-lexeme tier, the placing rule reaches **295 lexemes,
 * 9.8%**. See `docs/build-evidence/era-coverage/` for the run and the numbers
 * per basis. That number is low, it is honest, and it is the finding: the map's
 * 街道 and 鉄道 layers cannot be populated from this data at all.
 *
 * ## Purity
 *
 * No clock, no I/O, no randomness. The caller supplies {@link EraSource}
 * records; this file supplies the rules. `@bunki/domain` may not import
 * `@bunki/seed` (ADR-001 boundary 1), which is also why the dictionary is an
 * input here rather than a dependency.
 *
 * ## This says nothing about the learner
 *
 * An era layer is a property of the *language*, never of the person. It is the
 * ground layer of the visual language (`BUNKI_VISUAL_LANGUAGE_NIHONGA` §5), and
 * the ground never encodes learner state. Nothing in this file reads a memory
 * state, a retrievability, or a contract.
 */

import type { KnowledgeGraph } from './build.ts';
import type { GraphNode, GraphNodeId } from './model.ts';

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/** The three route layers the map draws. */
export const ERA_LAYERS = ['kodo', 'kaido', 'tetsudo'] as const;
export type EraLayer = (typeof ERA_LAYERS)[number];

/**
 * Where a node sits — including `unknown`, which is a real answer.
 *
 * `unknown` is a member of this union rather than `EraLayer | null` so that a
 * renderer has to handle it explicitly. A nullable layer invites `?? 'kodo'`,
 * and a default layer is exactly the invented confidence this file exists to
 * refuse.
 */
export const ERA_PLACEMENTS = ['kodo', 'kaido', 'tetsudo', 'unknown'] as const;
export type EraPlacement = (typeof ERA_PLACEMENTS)[number];

/**
 * The lexical stratum a rule identified, independent of any date.
 *
 * This is the axis the data really supports, and Wave B can render it honestly
 * — "native", "Sino-Japanese", "mixed reading" — without any claim about when
 * the word entered the language. `null` means no rule identified one.
 */
export const LEXICAL_STRATA = ['native', 'sino_japanese', 'mixed'] as const;
export type LexicalStratum = (typeof LEXICAL_STRATA)[number];

/**
 * Why this node landed where it did. Every attribution names one.
 *
 * The refusing bases are not one bucket because they are not one situation: a
 * word we identified as 漢語 but cannot date is a different state of knowledge
 * from a word whose reading we could not resolve at all, and a surface that
 * conflated them would be unable to say the true thing about either.
 */
export const ERA_BASES = [
  /** Placed. One ideograph (+ its okurigana) read with that character's kun reading. */
  'native_single_morpheme',
  /** Refused. Sino-Japanese reading; 漢語 spans all three layers and nothing here dates it. */
  'sino_japanese_reading',
  /** Refused. Native morphemes, but a compound's coinage date is not its parts' stratum. */
  'native_compound',
  /** Refused. 重箱/湯桶 — the reading mixes on and kun; undated either way. */
  'mixed_reading',
  /** Refused. The reading is both an on and a kun reading of the character. */
  'reading_ambiguous',
  /** Refused. Written in katakana. Orthography is not etymology and not a date. */
  'foreign_script',
  /** Refused. The reading could not be reconstructed from the characters' readings. */
  'reading_unresolved',
  /** Refused. The caller supplied no readings for at least one character. */
  'no_reading_evidence',
  /** Refused by rule. A kanji character spans eras — 駅 is on all three at once. */
  'character_spans_eras',
  /** Refused by rule. Readings, senses, sentences and encounters have no lexical era. */
  'not_a_lexical_node',
] as const;
export type EraBasis = (typeof ERA_BASES)[number];

/** Which bases place a node. Exactly one, and that is the point. */
const PLACING_BASES: Readonly<Record<EraBasis, EraPlacement>> = Object.freeze({
  native_single_morpheme: 'kodo',
  sino_japanese_reading: 'unknown',
  native_compound: 'unknown',
  mixed_reading: 'unknown',
  reading_ambiguous: 'unknown',
  foreign_script: 'unknown',
  reading_unresolved: 'unknown',
  no_reading_evidence: 'unknown',
  character_spans_eras: 'unknown',
  not_a_lexical_node: 'unknown',
});

/** The placement a basis always yields. A basis cannot mean two things. */
export function placementForBasis(basis: EraBasis): EraPlacement {
  return PLACING_BASES[basis];
}

export interface EraAttribution {
  readonly placement: EraPlacement;
  readonly basis: EraBasis;
  /** The stratum the rule identified, or `null` when it identified none. */
  readonly stratum: LexicalStratum | null;
  /** One sentence a museum card or a debug screen can print verbatim. */
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// The caller's evidence
// ---------------------------------------------------------------------------

/**
 * KANJIDIC2's two reading lists for one character, as the dictionary ships them.
 *
 * On-readings arrive in katakana (`イチ`), kun-readings in hiragana with the
 * okurigana split off by a full stop (`ひと.つ`) and affix position marked with
 * a hyphen (`ひと-`). Both conventions are handled here rather than pushed onto
 * the caller, because a caller that had to normalise them would be a second
 * place the normalisation could drift.
 */
export interface CharacterReadings {
  readonly on: readonly string[];
  readonly kun: readonly string[];
}

/** What the dictionary tier knows about one lexeme. */
export interface EraSource {
  readonly headword: string;
  readonly reading: string;
  /** Readings for each ideograph of `headword`. A missing entry is honest, not fatal. */
  readonly characterReadings: ReadonlyMap<string, CharacterReadings>;
}

// ---------------------------------------------------------------------------
// Script primitives
// ---------------------------------------------------------------------------

const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;
const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KATAKANA_TO_HIRAGANA_OFFSET = KATAKANA_START - HIRAGANA_START;

function isIdeograph(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  // CJK Unified Ideographs and Extension A. Deliberately not the compatibility
  // block: those characters are canonical duplicates and KANJIDIC2 keys on the
  // unified form, so admitting them would produce lookups that always miss.
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

function isHiragana(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  // `ー` (U+30FC) is the katakana-block prolonged mark but occurs inside
  // hiragana readings, so it counts as kana here.
  return (code >= HIRAGANA_START && code <= HIRAGANA_END) || code === 0x30fc;
}

function isKatakana(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  return (code >= KATAKANA_START && code <= KATAKANA_END) || code === 0x30fc || code === 0x30fb;
}

/** Katakana → hiragana, leaving everything else alone. */
export function toHiragana(text: string): string {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code !== undefined && code >= KATAKANA_START && code <= KATAKANA_END) {
      out += String.fromCodePoint(code - KATAKANA_TO_HIRAGANA_OFFSET);
      continue;
    }
    out += character;
  }
  return out;
}

/** KANJIDIC2 on-reading → the hiragana form a lexeme reading would show. */
function normaliseOnReading(raw: string): string {
  return toHiragana(raw.replaceAll('-', '').replaceAll('.', ''));
}

interface KunReading {
  /** The part the character itself covers — `ひと` of `ひと.つ`. */
  readonly base: string;
  /** The okurigana — `つ` of `ひと.つ`, or `''` when there is none. */
  readonly okurigana: string;
}

/** KANJIDIC2 kun-reading → its base and okurigana halves. */
function parseKunReading(raw: string): KunReading {
  const stripped = raw.replaceAll('-', '');
  const stop = stripped.indexOf('.');
  if (stop === -1) return { base: stripped, okurigana: '' };
  return { base: stripped.slice(0, stop), okurigana: stripped.slice(stop + 1) };
}

// ---------------------------------------------------------------------------
// Sino-Japanese compounding phonology
// ---------------------------------------------------------------------------

/**
 * 連濁 rendaku: the voicing a non-initial morpheme's first mora may take.
 *
 * These are the documented alternations, listed rather than computed so that
 * every pair a match can rely on is visible in review. Rendaku is optional in
 * the language, so both the plain and the voiced form are tried — the rule
 * widens what can match, and a match is still an exact reconstruction of the
 * whole reading.
 */
const RENDAKU: Readonly<Record<string, readonly string[]>> = Object.freeze({
  か: ['が'],
  き: ['ぎ'],
  く: ['ぐ'],
  け: ['げ'],
  こ: ['ご'],
  さ: ['ざ'],
  し: ['じ'],
  す: ['ず'],
  せ: ['ぜ'],
  そ: ['ぞ'],
  た: ['だ'],
  ち: ['ぢ'],
  つ: ['づ'],
  て: ['で'],
  と: ['ど'],
  は: ['ば', 'ぱ'],
  ひ: ['び', 'ぴ'],
  ふ: ['ぶ', 'ぷ'],
  へ: ['べ', 'ぺ'],
  ほ: ['ぼ', 'ぽ'],
});

/** 促音便: on-reading finals that assimilate to `っ` before another morpheme. */
const GEMINATING_FINALS = Object.freeze(['ち', 'つ', 'き', 'く']);

/**
 * The surface forms one morpheme reading may take inside a compound.
 *
 * `first` suppresses rendaku (a compound's first morpheme does not voice) and
 * `last` suppresses gemination (nothing follows to assimilate to).
 */
function surfaceForms(reading: string, first: boolean, last: boolean): readonly string[] {
  const forms = new Set<string>([reading]);
  if (!first) {
    const head = reading.slice(0, 1);
    for (const voiced of RENDAKU[head] ?? []) forms.add(voiced + reading.slice(1));
  }
  if (!last) {
    const tail = reading.slice(-1);
    if (GEMINATING_FINALS.includes(tail)) forms.add(`${reading.slice(0, -1)}っ`);
  }
  return [...forms];
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

/** Which reading list a morpheme may be drawn from during a segmentation. */
type MorphemeSource = 'on' | 'kun' | 'either';

function morphemeReadings(
  readings: CharacterReadings,
  source: MorphemeSource,
): readonly { readonly reading: string; readonly kind: 'on' | 'kun' }[] {
  const out: { readonly reading: string; readonly kind: 'on' | 'kun' }[] = [];
  if (source === 'on' || source === 'either') {
    for (const raw of readings.on) {
      const reading = normaliseOnReading(raw);
      if (reading.length > 0) out.push({ reading, kind: 'on' });
    }
  }
  if (source === 'kun' || source === 'either') {
    for (const raw of readings.kun) {
      // Only the base is usable inside an all-ideograph compound: the okurigana
      // of `ひと.つ` is written as kana, so a compound spelled without kana
      // cannot be carrying it.
      const { base } = parseKunReading(raw);
      if (base.length > 0) out.push({ reading: base, kind: 'kun' });
    }
  }
  return out;
}

/**
 * Can `reading` be reconstructed as exactly one morpheme per character?
 *
 * Depth-first with a memo of failed `(character index, reading offset)` pairs,
 * so a headword whose characters have many readings costs
 * O(characters x reading length x readings) rather than exponential time. The
 * search is over *exact* reconstructions: a partial or approximate match is not
 * a match, which is what keeps a positive answer a fact rather than a guess.
 */
function reconstructs(
  characters: readonly string[],
  reading: string,
  readingsOf: (character: string) => CharacterReadings | undefined,
  source: MorphemeSource,
): boolean {
  const failed = new Set<string>();

  const walk = (index: number, offset: number): boolean => {
    if (index === characters.length) return offset === reading.length;
    const key = `${index}:${offset}`;
    if (failed.has(key)) return false;

    const character = characters[index];
    const readings = character === undefined ? undefined : readingsOf(character);
    if (readings !== undefined) {
      const last = index === characters.length - 1;
      for (const morpheme of morphemeReadings(readings, source)) {
        for (const form of surfaceForms(morpheme.reading, index === 0, last)) {
          if (!reading.startsWith(form, offset)) continue;
          if (walk(index + 1, offset + form.length)) return true;
        }
      }
    }
    failed.add(key);
    return false;
  };

  return walk(0, 0);
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

function attribution(
  basis: EraBasis,
  stratum: LexicalStratum | null,
  detail: string,
): EraAttribution {
  return Object.freeze({ placement: placementForBasis(basis), basis, stratum, detail });
}

/**
 * The most characters a segmentation is attempted over.
 *
 * Beyond this the answer would still be `unknown` whichever way it went — no
 * compound is placed — so the search is simply not worth running, and a bound
 * stated here is better than a pathological input found later.
 */
const MAX_SEGMENTED_CHARACTERS = 8;

/**
 * Place one lexeme, or state why it cannot be placed.
 *
 * Order matters and is fixed: the single-morpheme test runs first because it is
 * the only one that can place anything; the compound tests then run
 * on-only, kun-only, mixed, so the most specific description of the reading
 * wins and the answer never depends on which rule happened to be tried first.
 */
export function attributeLexemeEra(source: EraSource): EraAttribution {
  const headword = [...source.headword];
  const reading = source.reading;
  const readingsOf = (character: string): CharacterReadings | undefined =>
    source.characterReadings.get(character);

  if (headword.length === 0 || reading.length === 0) {
    return attribution(
      'reading_unresolved',
      null,
      'the entry has no headword or no reading, so nothing can be read off it',
    );
  }

  if (headword.every((character) => isKatakana(character))) {
    return attribution(
      'foreign_script',
      null,
      'written in katakana; katakana spelling is an orthographic fact and not a date — パン and ガラス are Edo-period loans and ドキドキ is native, so the script alone places nothing',
    );
  }

  if (!reading.split('').every((character) => isHiragana(character))) {
    return attribution(
      'reading_unresolved',
      null,
      'the reading is not written in hiragana, so it cannot be matched against the characters’ reading lists',
    );
  }

  const leading = headword[0];
  const tail = headword.slice(1);

  // Rule 1 — the only rule that places. One ideograph, optionally carrying its
  // own okurigana, read with that character's kun reading.
  if (leading !== undefined && isIdeograph(leading) && tail.every((c) => isHiragana(c))) {
    const readings = readingsOf(leading);
    if (readings === undefined) {
      return attribution(
        'no_reading_evidence',
        null,
        `no reading list was supplied for ${leading}, so its stratum is unknown rather than absent`,
      );
    }
    const okurigana = tail.join('');
    const kunHit = readings.kun.some((raw) => {
      const kun = parseKunReading(raw);
      return kun.okurigana === okurigana && kun.base + kun.okurigana === reading;
    });
    const onHit =
      okurigana.length === 0 && readings.on.some((raw) => normaliseOnReading(raw) === reading);

    if (kunHit && onHit) {
      return attribution(
        'reading_ambiguous',
        null,
        `${reading} is listed as both an on and a kun reading of ${leading}; the stratum is genuinely undetermined and is not decided by picking one`,
      );
    }
    if (kunHit) {
      return attribution(
        'native_single_morpheme',
        'native',
        `read with the native (kun) reading of ${leading}; 和語 is the oldest lexical stratum, which is the 古道 layer. This places the stratum, not a date — it does not claim a first attestation`,
      );
    }
    if (onHit) {
      return attribution(
        'sino_japanese_reading',
        'sino_japanese',
        `read with the Sino-Japanese (on) reading of ${leading}; 漢語 runs from the first Chinese imports through Edo to Meiji coinages, and nothing in the dictionary tier dates it`,
      );
    }
    return attribution(
      'reading_unresolved',
      null,
      `${reading} matches neither the on nor the kun readings recorded for ${leading}`,
    );
  }

  // Rule 2 — all-ideograph compounds. Nothing here is placed; the tests exist to
  // say which stratum the reading is in, which is a true thing the map can show.
  if (headword.every((character) => isIdeograph(character))) {
    if (headword.some((character) => readingsOf(character) === undefined)) {
      return attribution(
        'no_reading_evidence',
        null,
        'at least one character of this compound has no reading list, so its stratum cannot be resolved',
      );
    }
    if (headword.length > MAX_SEGMENTED_CHARACTERS) {
      return attribution(
        'reading_unresolved',
        null,
        `headwords longer than ${MAX_SEGMENTED_CHARACTERS} characters are not segmented; no compound is placed on a layer either way`,
      );
    }
    if (reconstructs(headword, reading, readingsOf, 'on')) {
      return attribution(
        'sino_japanese_reading',
        'sino_japanese',
        'every morpheme is read with an on reading, so this is 漢語 — a stratum that spans 古道, 街道 and 鉄道 alike, and the tier carries nothing that separates them',
      );
    }
    if (reconstructs(headword, reading, readingsOf, 'kun')) {
      return attribution(
        'native_compound',
        'native',
        'every morpheme is native, but a compound is a new word whose coinage date is not its parts’ stratum — 取締役 is native throughout and is a Meiji office',
      );
    }
    if (reconstructs(headword, reading, readingsOf, 'either')) {
      return attribution(
        'mixed_reading',
        'mixed',
        'the reading mixes on and kun morphemes (重箱/湯桶読み); mixed readings are undated here for the same reason the pure ones are',
      );
    }
    return attribution(
      'reading_unresolved',
      null,
      'the reading could not be reconstructed from the characters’ recorded readings',
    );
  }

  return attribution(
    'reading_unresolved',
    null,
    'the headword is not a shape this file segments — a single ideograph with okurigana, or an all-ideograph compound',
  );
}

/**
 * Place one graph node.
 *
 * Only `lexeme` nodes are ever candidates. `kanji` nodes refuse by rule rather
 * than for want of data: 駅 is a post-station on the ancient road, a 宿場 on the
 * Edo highway and a railway station in Meiji, all at once, so a single layer for
 * the character would be false however much data we had.
 */
export function attributeNodeEra(node: GraphNode, source: EraSource | undefined): EraAttribution {
  if (node.kind === 'kanji') {
    return attribution(
      'character_spans_eras',
      null,
      'a kanji character has no single era — 駅 is a 駅家 post-station, a 宿場 and a railway station at once — so the character is never placed on one layer',
    );
  }
  if (node.kind !== 'lexeme') {
    return attribution(
      'not_a_lexical_node',
      null,
      `a ${node.kind} node has no lexical era of its own`,
    );
  }
  if (source === undefined) {
    return attribution(
      'no_reading_evidence',
      null,
      'no dictionary record was supplied for this lexeme, so its stratum is unknown rather than absent',
    );
  }
  return attributeLexemeEra(source);
}

/**
 * The era attribute for every node in the graph.
 *
 * Every node gets an entry — a node missing from `sources` is `unknown` with
 * `no_reading_evidence`, never absent from the map. An absent key would let a
 * renderer treat "we have no record" and "we placed it on the default layer" as
 * the same lookup miss, which is the failure this whole file is arranged to
 * prevent.
 */
export function projectNodeEras(
  graph: KnowledgeGraph,
  sources: ReadonlyMap<GraphNodeId, EraSource>,
): ReadonlyMap<GraphNodeId, EraAttribution> {
  const out = new Map<GraphNodeId, EraAttribution>();
  graph.nodes.forEach((node, id) => {
    out.set(id, attributeNodeEra(node, sources.get(id)));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Honesty instrument
// ---------------------------------------------------------------------------

export interface EraCoverage {
  readonly total: number;
  readonly byPlacement: Readonly<Record<EraPlacement, number>>;
  readonly byBasis: Readonly<Record<EraBasis, number>>;
  /** Placed on a layer, over total. `0` for an empty input. */
  readonly placedFraction: number;
}

/**
 * How much of a corpus this file could actually place.
 *
 * Shipped and tested rather than computed once in a throwaway script, because
 * the coverage number is a claim about the product and a claim about the product
 * should be re-derivable by anyone who runs the code. When the dictionary tier
 * grows or the importer starts carrying `<lsource>`, this is the function that
 * says whether anything improved.
 */
export function summariseEraCoverage(attributions: Iterable<EraAttribution>): EraCoverage {
  const byPlacement = new Map<EraPlacement, number>(ERA_PLACEMENTS.map((p) => [p, 0]));
  const byBasis = new Map<EraBasis, number>(ERA_BASES.map((b) => [b, 0]));
  let total = 0;
  let placed = 0;

  for (const attributed of attributions) {
    total += 1;
    byPlacement.set(attributed.placement, (byPlacement.get(attributed.placement) ?? 0) + 1);
    byBasis.set(attributed.basis, (byBasis.get(attributed.basis) ?? 0) + 1);
    if (attributed.placement !== 'unknown') placed += 1;
  }

  return Object.freeze({
    total,
    byPlacement: Object.freeze(Object.fromEntries(byPlacement)) as Readonly<
      Record<EraPlacement, number>
    >,
    byBasis: Object.freeze(Object.fromEntries(byBasis)) as Readonly<Record<EraBasis, number>>,
    placedFraction: total === 0 ? 0 : placed / total,
  });
}
