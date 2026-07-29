/**
 * Browse — the half of a dictionary that is not a search box.
 *
 * ## Why this exists
 *
 * The operator's judgement of the state of this build: *"It is a standalone
 * dictionary alone."* — meaning it has to be one. Frozen §10.1 measures that
 * against renzo, whose five-tab IA it credits, and §10.5 against the 類義漢字
 * synonym reference, whose semantic-field grouping it calls "the strongest
 * external validation of the Atlas contrast dimension".
 *
 * Both of those are *browsing* surfaces. Until this module the app had a query
 * box and nothing else, which means a learner could only ever reach a word they
 * had already thought of. A dictionary you can only query is a lookup box; the
 * thing that makes a reference book a reference book is that you can open it in
 * the middle.
 *
 * ## The rule every index here obeys
 *
 * **An index is a fact in the data, or it is not an index.** Every grouping
 * below is a field the licensors ship:
 *
 *   - **grade** — KANJIDIC2's `grade`, the Japanese school year a character is
 *     taught in. Not a difficulty score and not presented as one.
 *   - **stroke count** — KANJIDIC2's `strokeCount`.
 *   - **component** — KanjiVG's own `kvg:element` annotations, extracted from
 *     the verbatim SVG by the importer and re-derived from those bytes by
 *     `packages/seed/test/dictionary.test.ts`.
 *   - **frequency band** — KANJIDIC2's `freq`, its rank in a corpus of
 *     newspaper text, reported in bands because the individual rank is a false
 *     precision at this distance.
 *   - **the words that use a kanji** — a literal containment check over
 *     `kanjiUsed`, which is how `wordsUsingKanji` already works.
 *
 * Nothing here is inferred, scored, or ordered by a relevance model this project
 * invented. There is deliberately **no semantic-field index**: §10.5's
 * "arrange: 並比列陳羅揃整理" grouping is a curated editorial judgement from a
 * book this build does not have the rights to, and clustering KANJIDIC2 English
 * glosses to imitate it would produce a grouping that looks like scholarship and
 * is a string match. It is named in {@link INDEXES_NOT_BUILT} instead.
 *
 * **No JLPT.** KANJIDIC2 ships a `jlpt` field and this module does not offer it
 * as an axis. The level it records is from the pre-2010 four-level exam, the
 * product forbids JLPT claims about a learner, and a "browse by N3" shelf is one
 * short step from a learner reading their own position off it.
 */

import { IMPORTED_KANJI, importedExtras } from './imported-tier.ts';
import { seedDataset, type SeedKanji, type SeedLexeme } from './catalog.ts';
import { IMPORTED_LEXEMES } from './imported-tier.ts';

/** Every kanji this build can render a page for, fixture tier first. */
export const ALL_KANJI: readonly SeedKanji[] = (() => {
  const seen = new Set(seedDataset.kanji.map((kanji) => kanji.character));
  return [...seedDataset.kanji, ...IMPORTED_KANJI.filter((kanji) => !seen.has(kanji.character))];
})();

/** Every word this build can render a page for, fixture tier first. */
export const ALL_LEXEMES: readonly SeedLexeme[] = (() => {
  const seen = new Set(seedDataset.lexemes.map((lexeme) => lexeme.headword));
  return [
    ...seedDataset.lexemes,
    ...IMPORTED_LEXEMES.filter((lexeme) => !seen.has(lexeme.headword)),
  ];
})();

/**
 * What a browse axis offers: named shelves, each with its members.
 *
 * `count` is carried rather than derived at the call site so a surface can show
 * "12" beside a closed shelf without materialising it.
 */
export interface BrowseShelf {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly characters: readonly SeedKanji[];
}

export interface BrowseAxis {
  readonly id: string;
  readonly label: string;
  /** The licensor's own field this axis is read off. Rendered. */
  readonly derivation: string;
  readonly shelves: readonly BrowseShelf[];
}

/** Indices that would need data or rights this build does not have. */
export const INDEXES_NOT_BUILT =
  'Two axes a reference book would have are missing and are not faked. There is no semantic-field shelf — the “words for arranging: 並比列陳羅揃整理” grouping the frozen spec praises is one editor’s judgement in a book this build has no rights to, and clustering English glosses to imitate it would look like scholarship and be a string match. There is no JLPT shelf, on purpose: the level KANJIDIC2 records is from the pre-2010 exam, and a shelf you can stand on is one step from reading your own level off it.';

const byCharacter = (left: SeedKanji, right: SeedKanji): number =>
  left.character.localeCompare(right.character, 'ja');

/**
 * School grade, from KANJIDIC2.
 *
 * Grades 1–6 are the 教育漢字 taught year by year; grade 8 is the rest of the
 * 常用漢字 (there is no grade 7 in KANJIDIC2); grades 9 and 10 are 人名用漢字,
 * the characters permitted in names. Characters with no grade are the remainder
 * and get their own shelf rather than being dropped, because "not in the
 * standard list" is a real and useful fact about a character.
 */
const GRADE_LABELS: Readonly<Record<string, string>> = {
  '1': 'grade 1 — 教育漢字, first year',
  '2': 'grade 2 — 教育漢字, second year',
  '3': 'grade 3 — 教育漢字, third year',
  '4': 'grade 4 — 教育漢字, fourth year',
  '5': 'grade 5 — 教育漢字, fifth year',
  '6': 'grade 6 — 教育漢字, sixth year',
  '8': 'grade 8 — the rest of the 常用漢字',
  '9': 'grade 9 — 人名用漢字, permitted in names',
  '10': 'grade 10 — 人名用漢字 variants',
  none: 'no grade recorded — outside the standard lists',
};

export function gradeAxis(): BrowseAxis {
  const buckets = new Map<string, SeedKanji[]>();
  for (const kanji of ALL_KANJI) {
    const grade = importedExtras(kanji.id)?.grade ?? null;
    const key = grade === null ? 'none' : String(grade);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [kanji]);
    else bucket.push(kanji);
  }

  const order = (key: string): number => (key === 'none' ? 99 : Number(key));
  const shelves = [...buckets.entries()]
    .sort(([left], [right]) => order(left) - order(right))
    .map(([key, characters]) => ({
      id: `grade-${key}`,
      label: GRADE_LABELS[key] ?? `grade ${key}`,
      count: characters.length,
      characters: [...characters].sort(byCharacter),
    }));

  return {
    id: 'grade',
    label: 'By school grade',
    derivation:
      'KANJIDIC2’s own grade field — the Japanese school year a character is taught in. It is a curriculum position, not a difficulty score.',
    shelves,
  };
}

export function strokeAxis(): BrowseAxis {
  const buckets = new Map<number, SeedKanji[]>();
  for (const kanji of ALL_KANJI) {
    const bucket = buckets.get(kanji.strokeCount);
    if (bucket === undefined) buckets.set(kanji.strokeCount, [kanji]);
    else bucket.push(kanji);
  }

  const shelves = [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([strokes, characters]) => ({
      id: `strokes-${String(strokes)}`,
      label: strokes === 1 ? '1 stroke' : `${String(strokes)} strokes`,
      count: characters.length,
      characters: [...characters].sort(byCharacter),
    }));

  return {
    id: 'strokes',
    label: 'By stroke count',
    derivation: 'KANJIDIC2’s own stroke count for the character.',
    shelves,
  };
}

/**
 * Frequency, in bands.
 *
 * KANJIDIC2's `freq` is a rank in a corpus of newspaper text, from 1 to about
 * 2,500. Rendering the rank itself would be a false precision — the difference
 * between 812th and 830th is not a fact a learner can use — so it is banded, and
 * the band boundaries are round numbers rather than anything derived, which the
 * label says.
 */
const FREQUENCY_BANDS: readonly { readonly upper: number; readonly label: string }[] = [
  { upper: 100, label: 'the first 100 by newspaper frequency' },
  { upper: 500, label: '101–500' },
  { upper: 1000, label: '501–1,000' },
  { upper: 1500, label: '1,001–1,500' },
  { upper: 2500, label: '1,501–2,500' },
];

export function frequencyAxis(): BrowseAxis {
  const buckets = new Map<string, SeedKanji[]>();
  const push = (key: string, kanji: SeedKanji): void => {
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [kanji]);
    else bucket.push(kanji);
  };

  for (const kanji of ALL_KANJI) {
    const frequency = importedExtras(kanji.id)?.frequency ?? null;
    if (frequency === null) {
      push('none', kanji);
      continue;
    }
    const band = FREQUENCY_BANDS.find((entry) => frequency <= entry.upper);
    push(band?.label ?? 'beyond 2,500', kanji);
  }

  const rank = (label: string): number => {
    if (label === 'none') return 99;
    const index = FREQUENCY_BANDS.findIndex((entry) => entry.label === label);
    return index === -1 ? 98 : index;
  };

  const shelves = [...buckets.entries()]
    .sort(([left], [right]) => rank(left) - rank(right))
    .map(([label, characters]) => ({
      id: `frequency-${label.replace(/[^a-z0-9]+/gi, '-')}`,
      label: label === 'none' ? 'no frequency rank recorded' : label,
      count: characters.length,
      // Inside a band, by the rank itself — the one place the exact number is
      // useful, because it decides the order and is never printed.
      characters: [...characters].sort((left, right) => {
        const leftRank = importedExtras(left.id)?.frequency ?? Number.MAX_SAFE_INTEGER;
        const rightRank = importedExtras(right.id)?.frequency ?? Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank || byCharacter(left, right);
      }),
    }));

  return {
    id: 'frequency',
    label: 'By how often it appears',
    derivation:
      'KANJIDIC2’s frequency rank in a corpus of newspaper text, shown in bands. The exact rank decides the order inside a band and is never printed: the difference between 812th and 830th is not a fact you can use.',
    shelves,
  };
}

/**
 * Components, from KanjiVG.
 *
 * Only components that appear in more than one character are shelved: a
 * component with one member is the character itself with extra steps, and the
 * long tail of them would bury the ones that do the work.
 */
export const MIN_COMPONENT_SHELF = 2;

export function componentAxis(minMembers = MIN_COMPONENT_SHELF): BrowseAxis {
  const buckets = new Map<string, SeedKanji[]>();
  for (const kanji of ALL_KANJI) {
    for (const element of componentsOf(kanji)) {
      // A character is trivially "made of" itself in KanjiVG's decomposition;
      // shelving it there would make every component shelf contain its own name.
      if (element === kanji.character) continue;
      const bucket = buckets.get(element);
      if (bucket === undefined) buckets.set(element, [kanji]);
      else bucket.push(kanji);
    }
  }

  const shelves = [...buckets.entries()]
    .filter(([, characters]) => characters.length >= minMembers)
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        right.length - left.length || leftKey.localeCompare(rightKey, 'ja'),
    )
    .map(([element, characters]) => ({
      id: `component-${element}`,
      label: element,
      count: characters.length,
      characters: [...characters].sort(byCharacter),
    }));

  return {
    id: 'component',
    label: 'By component',
    derivation:
      'KanjiVG’s own element annotations, taken from the verbatim stroke files. A component that appears in only one of these characters is not shelved.',
    shelves,
  };
}

/** Every distinct component or radical element recorded for a character. */
export function componentsOf(kanji: SeedKanji): readonly string[] {
  return [...new Set([...kanji.components, ...kanji.radicals.map((radical) => radical.element)])];
}

/**
 * Characters that contain a given component or radical element.
 *
 * The lookup behind component search. Exact character match on the element —
 * never a substring or a visual-similarity guess, because "looks a bit like" is
 * the sort of relation this project does not assert.
 */
export function kanjiWithComponent(element: string): readonly SeedKanji[] {
  return ALL_KANJI.filter(
    (kanji) => kanji.character !== element && componentsOf(kanji).includes(element),
  ).sort(byCharacter);
}

/**
 * The four axes.
 *
 * Memoised at module scope, and that is a correctness-adjacent decision rather
 * than a micro-optimisation. `BrowsePanel` renders inside the capture screen,
 * which re-renders on **every keystroke** in the search box; an unmemoised
 * `browseAxes()` folded and sorted 1,241 characters four times per character
 * typed, which is work with no output — the axes are a pure function of data
 * that is frozen at build time and cannot change while the app is running.
 *
 * `componentAxis` takes a parameter, so the memo is only for the default call;
 * a caller asking for a different minimum still gets a fresh fold.
 */
let cachedAxes: readonly BrowseAxis[] | null = null;

export function browseAxes(): readonly BrowseAxis[] {
  cachedAxes ??= Object.freeze([gradeAxis(), strokeAxis(), frequencyAxis(), componentAxis()]);
  return cachedAxes;
}
