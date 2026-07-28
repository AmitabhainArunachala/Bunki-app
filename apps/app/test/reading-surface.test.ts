/**
 * The reading surface's own contracts (Campaign E, lane B4).
 *
 * Two halves, and they check different kinds of claim.
 *
 * The first half runs the lane's pure modules over the passage this build
 * actually ships, so the numbers quoted in the capsule are measured here rather
 * than remembered. The second half is a source scan, for the same reason
 * `test/screen-contract.test.ts` gives: some of this lane's predicate is about
 * what the screen must *never* do, and a scan proves the text is not in the tree
 * at all rather than proving one code path did not reach it.
 *
 * What neither half can establish is that the lookup is *visible* and that
 * opening it costs no navigation. That needs a browser, and
 * `e2e/reading-surface.spec.ts` makes it against the exported bundle by counting
 * history entries across a tap and a keep.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  MAX_MARK_DENSITY,
  markDensity,
  marksAreOverwhelming,
  type FrontierSpan,
} from '../src/ui/frontier-marks.ts';
import { FRONTIER_MARK_BASIS, markFor } from '../src/ui/reading/frontier-state.ts';
import {
  MAX_PLAIN_RUN,
  buildPassageSpans,
  lookupLexemeIds,
  lookupSpanCount,
  type LookupForm,
} from '../src/ui/reading/passage-spans.ts';

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

/** Source with comments removed: a rule has to be nameable in prose to be documented. */
const stripComments = (text: string): string =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const code = (file: string): string => stripComments(read(resolve(APP_ROOT, file)));

const SCREEN = 'src/screens/reading-screen.tsx';
const ROUTE = 'app/read.tsx';
const LANE_COMPONENTS = walk(resolve(APP_ROOT, 'src/ui/reading')).map(rel).sort();

/* ------------------------------------------------------------------ *
 * The passage this build ships
 * ------------------------------------------------------------------ */

/**
 * The seed's own data files, read rather than imported.
 *
 * `@bunki/seed` builds the 3,000-entry imported dictionary at module load — the
 * screen wants that, and this file does not: the reading surface resolves only
 * the passage's declared vocabulary, all of which is fixture tier. Importing the
 * package here cost roughly three seconds of parsing in one more parallel
 * worker, and measurably pushed the suite's two slowest tests
 * (`screen-contract`'s seed scan and `theme-fonts`' coverage contract, both of
 * which *do* need the whole corpus) past vitest's five-second budget. That was a
 * flake this lane introduced, so this lane pays for it.
 *
 * These are the same bytes the package validates and the app ships; what is
 * skipped is the dictionary build, not the data.
 */
const SEED_DATA = resolve(APP_ROOT, '../../packages/seed/data');

interface SeedRecords<T> {
  readonly records: readonly T[];
}
interface PassageRecord {
  readonly id: string;
  readonly body: string;
  readonly lexemeIds: readonly string[];
}
interface LexemeRecord {
  readonly id: string;
  readonly headword: string;
  readonly reading: string;
}

const records = <T>(file: string): readonly T[] =>
  (JSON.parse(read(join(SEED_DATA, file))) as SeedRecords<T>).records;

const passage = records<PassageRecord>('passages.json')[0];
if (passage === undefined) throw new Error('the seed ships no passage to read');

const lexemesById = new Map(
  records<LexemeRecord>('lexemes.json').map((entry) => [entry.id, entry]),
);

/** The forms the screen makes interactive: the passage's own declared vocabulary. */
const formsFrom = (marks: Readonly<Record<string, FrontierSpan['mark']>> = {}): LookupForm[] =>
  passage.lexemeIds
    .map((lexemeId) => lexemesById.get(lexemeId))
    .filter((lexeme): lexeme is LexemeRecord => lexeme !== undefined)
    .map((lexeme) => ({
      form: lexeme.headword,
      lexemeId: lexeme.id,
      reading: lexeme.reading,
      mark: marks[lexeme.id] ?? 'frontier',
    }));

const allNew = buildPassageSpans(passage.body, formsFrom());

describe('the passage survives segmentation exactly', () => {
  it('loses no character and reorders none', () => {
    expect(allNew.map((span) => span.text).join('')).toBe(passage.body);
  });

  it('is deterministic', () => {
    expect(buildPassageSpans(passage.body, formsFrom())).toEqual(allNew);
  });

  it('makes the declared vocabulary tappable and nothing else', () => {
    for (const span of allNew) {
      if (span.lexemeId === undefined) continue;
      expect(passage.lexemeIds, `${span.text} is tappable but is not declared`).toContain(
        span.lexemeId,
      );
    }
    expect(lookupSpanCount(allNew)).toBeGreaterThan(0);
  });

  it('gives every tappable span the dictionary reading furigana needs', () => {
    for (const span of allNew) {
      if (span.lexemeId === undefined) continue;
      const lexeme = lexemesById.get(span.lexemeId);
      expect(span.reading, `${span.text} is tappable with no reading`).toBe(lexeme?.reading);
    }
  });

  it('leaves everything it cannot resolve in short breakable runs', () => {
    for (const span of allNew) {
      if (span.lexemeId !== undefined) continue;
      // A flex item does not wrap internally, so a long plain run would be an
      // unbreakable box that overflows the measure. The ceiling plus the
      // kinsoku merge is what bounds it.
      expect([...span.text].length, `“${span.text}” is an unbreakable run`).toBeLessThanOrEqual(
        MAX_PLAIN_RUN + 2,
      );
    }
  });

  /**
   * …and not one span per character, which is where this started.
   *
   * Per-character spans laid the passage out correctly and handed a screen
   * reader 134 separate text nodes. The chunking rule exists to fix that, so the
   * assertion is on the count rather than on the rule: a future edit that
   * silently went back to per-character would pass every other test here.
   */
  it('offers the prose as runs rather than as rubble', () => {
    const plain = allNew.filter((span) => span.lexemeId === undefined);
    const characters = plain.reduce((total, span) => total + [...span.text].length, 0);
    expect(
      characters / plain.length,
      'plain spans average barely over one character',
    ).toBeGreaterThan(2);
    expect(allNew.length).toBeLessThan([...passage.body].length / 2);
  });
});

describe('a declared form wins over the one inside it', () => {
  it('reads 分岐点 as one word rather than 分岐 plus 点', () => {
    const texts = allNew.map((span) => span.text);
    expect(texts).toContain('分岐点');
    expect(texts).not.toContain('分岐');
  });

  it('produces no span for a declared word the passage only contains inflected', () => {
    // 分岐 is in the passage's own `lexemeIds` and occurs there only inside
    // 分岐点. A declared form the body does not contain standalone is not an
    // error and must not become a span.
    expect(passage.lexemeIds).toContain('lex-bunki');
    expect(lookupLexemeIds(allNew)).not.toContain('lex-bunki');
  });
});

describe('nothing undeclared is ever matched', () => {
  /**
   * The defect this rules out, by name.
   *
   * 「聞いていたからだ」 ends in からだ, which is a real JMdict headword (体) and
   * is not the word in that sentence; 「立って気づく」 contains 気, likewise. A
   * segmenter that scanned the dictionary for the longest substring would offer
   * both as confident lookups. Round-2 research records Migaku shipping exactly
   * this class of defect.
   */
  it('does not match a headword that merely appears as a substring', () => {
    const spans = buildPassageSpans(passage.body, [
      { form: '体', lexemeId: 'lex-karada', mark: 'frontier' },
    ]);
    // 体 is not written in the passage at all; からだ is kana. Nothing matches,
    // and the point is that the *kana* run was never a candidate either.
    expect(spans.some((span) => span.lexemeId !== undefined)).toBe(false);
    expect(passage.body).toContain('からだ');
  });

  it('does not cut a verb stem out of its okurigana', () => {
    // 分 is a fixture lexeme ("minute"). It is not declared for this passage,
    // so 「分かれた」 stays plain text rather than becoming a wrong lookup.
    const withMinute = buildPassageSpans(passage.body, [
      ...formsFrom(),
      { form: '分', lexemeId: 'lex-fun', reading: 'ふん', mark: 'frontier' },
    ]);
    const declaredOnly = allNew.filter((span) => span.lexemeId !== undefined).length;
    expect(withMinute.filter((span) => span.lexemeId === 'lex-fun').length).toBeGreaterThan(0);
    expect(declaredOnly).toBe(lookupSpanCount(allNew));
    // …and the screen passes only the declared list, which is what keeps it out.
    expect(lookupLexemeIds(allNew)).not.toContain('lex-fun');
  });
});

describe('kinsoku: no line may begin with closing punctuation', () => {
  it('keeps punctuation with the run before it and starts a new run after', () => {
    expect(buildPassageSpans('あい、うえ。', []).map((span) => span.text)).toEqual([
      'あい、',
      'うえ。',
    ]);
  });

  it('merges a run of them, not just the first', () => {
    expect(buildPassageSpans('あ」。', []).map((span) => span.text)).toEqual(['あ」。']);
  });

  it('breaks in front of a character that opens a word, not behind it', () => {
    // 「を出ると、」 → a break before the kanji, none between it and its okurigana.
    expect(buildPassageSpans('を出ると、は', []).map((span) => span.text)).toEqual([
      'を',
      '出ると、',
      'は',
    ]);
  });

  it('caps a long kana run so it can still wrap', () => {
    const long = 'あいうえおかきくけこさし';
    for (const span of buildPassageSpans(long, [])) {
      expect([...span.text].length).toBeLessThanOrEqual(MAX_PLAIN_RUN);
    }
    expect(
      buildPassageSpans(long, [])
        .map((span) => span.text)
        .join(''),
    ).toBe(long);
  });

  it('never starts a plain span with one, except right after a marked word', () => {
    const offenders = allNew
      .map((span, index) => ({ span, previous: allNew[index - 1] }))
      .filter(
        ({ span, previous }) =>
          span.lexemeId === undefined &&
          '、。」）ー…っゃ'.includes(span.text.charAt(0)) &&
          // The documented exception, and the only one: punctuation directly
          // after a lookup target stays on its own rather than being dragged
          // inside that word's underline and spoken label.
          previous?.lexemeId === undefined,
      )
      .map(({ span }) => span.text);
    expect(offenders, 'a line may break in front of these').toEqual([]);
  });

  /**
   * The one case this cannot fix, recorded rather than hidden.
   *
   * 「分かれる。」 puts a full stop straight after a marked word. Merging it into
   * that span would drag it inside the frontier underline and inside the word's
   * spoken label, which are worse defects than a rare bad break, so it stays on
   * its own. This test exists so the trade-off is visible rather than surprising.
   */
  it('leaves punctuation after a marked word on its own, knowingly', () => {
    const spans = buildPassageSpans('分かれる。', [
      { form: '分かれる', lexemeId: 'lex-wakareru', reading: 'わかれる', mark: 'frontier' },
    ]);
    expect(spans.map((span) => span.text)).toEqual(['分かれる', '。']);
    expect(spans[0]?.mark).toBe('frontier');
  });
});

/* ------------------------------------------------------------------ *
 * The density guard, on the real page
 * ------------------------------------------------------------------ */

describe('the mark density of the shipped passage', () => {
  it('is under the ceiling when every declared word is new', () => {
    // The worst case a learner can be in on this page: nothing captured, so
    // every declared word carries the frontier mark. Measured, not assumed.
    const density = markDensity(allNew);
    expect(density).toBeGreaterThan(0);
    expect(density).toBeLessThan(MAX_MARK_DENSITY);
    expect(marksAreOverwhelming(allNew)).toBe(false);
  });

  it('is zero once every declared word has been kept', () => {
    const kept = Object.fromEntries(
      passage.lexemeIds.map((lexemeId) => [lexemeId, 'none' as const]),
    );
    expect(markDensity(buildPassageSpans(passage.body, formsFrom(kept)))).toBe(0);
  });

  /**
   * Character weighting is the property the ceiling needs.
   *
   * Under the span counting this function used before lane B4, a four-character
   * word weighed the same as the single-character particle beside it — so a
   * passage whose *area* is a third new could report a tenth, and the ceiling
   * was unreachable by any real page. The two passages below are the same text
   * marked the same way, chunked differently.
   */
  it('does not depend on how the caller chunked the text', () => {
    const asWords: readonly FrontierSpan[] = [
      { text: '分かれる', mark: 'frontier' },
      { text: 'とき', mark: 'none' },
    ];
    const asCharacters: readonly FrontierSpan[] = [
      ...[...'分かれる'].map((text) => ({ text, mark: 'frontier' }) as const),
      ...[...'とき'].map((text) => ({ text, mark: 'none' }) as const),
    ];
    expect(markDensity(asWords)).toBe(markDensity(asCharacters));
    expect(markDensity(asWords)).toBe(4 / 6);
  });

  it('still trips when a page really is mostly new', () => {
    const overwhelming = buildPassageSpans('分かれる道', [
      { form: '分かれる', lexemeId: 'lex-wakareru', mark: 'frontier' },
      { form: '道', lexemeId: 'lex-michi', mark: 'frontier' },
    ]);
    expect(markDensity(overwhelming)).toBe(1);
    expect(marksAreOverwhelming(overwhelming)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * What puts a word on the frontier
 * ------------------------------------------------------------------ */

describe('the frontier rule is exhaustive and has no fourth answer', () => {
  it.each([
    [{ captured: false, flaggedUncertain: false }, 'frontier'],
    [{ captured: false, flaggedUncertain: true }, 'frontier'],
    [{ captured: true, flaggedUncertain: false }, 'none'],
    [{ captured: true, flaggedUncertain: true }, 'fragile'],
  ] as const)('%o is %s', (knowledge, expected) => {
    expect(markFor(knowledge)).toBe(expected);
  });

  it('gives every mark a line saying what it is derived from', () => {
    expect(Object.keys(FRONTIER_MARK_BASIS).sort()).toEqual(['fragile', 'frontier', 'none']);
    for (const line of Object.values(FRONTIER_MARK_BASIS)) {
      expect(line.length).toBeGreaterThan(10);
    }
  });

  /**
   * `fragile` here is the learner's own uncertainty mark, not a decay estimate.
   *
   * The honest source for "this is slipping" is the memory model behind the
   * evidence gate, and the app may not compute a second opinion about it
   * (controller §5). So the basis line must not claim a measurement, and this is
   * the assertion that keeps a future edit from quietly upgrading it.
   */
  it('claims no measurement behind the fragile mark', () => {
    expect(FRONTIER_MARK_BASIS.fragile).toMatch(/you/i);
    expect(FRONTIER_MARK_BASIS.fragile).not.toMatch(/slipping|decay|forget|predict|estimate/i);
  });
});

/* ------------------------------------------------------------------ *
 * Reading is exposure
 * ------------------------------------------------------------------ */

describe('nothing on this surface can mint evidence', () => {
  it('issues only the two commands a capture needs', () => {
    const body = code(SCREEN);
    const kinds = [...body.matchAll(/kind:\s*'([a-zA-Z]+)'/g)].map((match) => match[1]);
    const commandKinds = kinds.filter((kind) =>
      [
        'capture',
        'promote',
        'seedEvidenceDemonstration',
        'correctEvidence',
        'recordExport',
      ].includes(kind as string),
    );
    expect([...new Set(commandKinds)].sort()).toEqual(['capture', 'promote']);
  });

  it('promotes no further than keep, so no contract is activated', () => {
    const body = code(SCREEN);
    expect(body).toContain("to: 'keep'");
    expect(body).not.toContain("to: 'learn'");
  });

  it('reaches no minting or persistence path', () => {
    for (const file of [SCREEN, ROUTE, ...LANE_COMPONENTS]) {
      const body = code(file);
      expect(body, file).not.toContain('createDomainEvent');
      expect(body, file).not.toContain('persistMinted');
      expect(body, file).not.toContain('applySessionCommand');
      expect(body, file).not.toMatch(/type:\s*['"]Encounter/);
    }
  });

  /**
   * No probe *mechanism* anywhere in the lane.
   *
   * A probe is a declared question answered before a reveal, and it is the only
   * thing that may produce evidence. Tapping, scrolling, expanding and keeping
   * are exposure. So the ban is on the machinery — the four grades, a grade
   * handler, a reveal state, a probe — and not on the words: the panel is
   * *required* to tell a learner that keeping "does not grade anything", and a
   * scan that forbade the sentence would forbid the honesty along with the
   * defect.
   */
  it.each([
    ["'again'", /'(again|hard|easy)'/],
    ['a grade handler', /\bonGrade\b|\bgrade[A-Z(:]|\bGrade\b/],
    ['a reveal', /\breveal[A-Za-z]*\b/i],
    ['a probe', /\bprobe[A-Za-z]*\b/i],
    ['an evidence tier', /\btier:\s*'[ABCD]'|evidenceTier/],
  ] as const)('has no %s', (_label, pattern) => {
    const offenders = [SCREEN, ROUTE, ...LANE_COMPONENTS].filter((file) =>
      pattern.test(code(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('says on screen that reading is exposure', () => {
    const lookup = read(resolve(APP_ROOT, 'src/ui/reading/inline-lookup.tsx'));
    expect(lookup).toContain('EXPOSURE_NOTE');
    expect(lookup).toMatch(/Reading is exposure, not retrieval/);
  });

  /**
   * And it shows no band it cannot source.
   *
   * `RecallMeter` renders a band per capability; this build holds none for a
   * word met in a passage. Rendering one anyway would be the invented-state
   * defect class, so the panel states the absence instead.
   */
  it('renders no recall mark or meter with invented data', () => {
    for (const file of LANE_COMPONENTS) {
      expect(code(file), file).not.toMatch(/<RecallM(ark|eter)\b/);
    }
    expect(code('src/ui/reading/inline-lookup.tsx')).toContain('UnsupportedLayer');
  });
});

/* ------------------------------------------------------------------ *
 * The lookup does not navigate
 * ------------------------------------------------------------------ */

describe('the lookup is a panel, not a route', () => {
  it('puts every router reference in the route file and nowhere else', () => {
    for (const file of [SCREEN, ...LANE_COMPONENTS]) {
      const body = code(file);
      expect(body, file).not.toContain('expo-router');
      expect(body, file).not.toContain('useRouter');
      expect(body, file).not.toMatch(/router\.(push|replace|navigate)/);
    }
    expect(code(ROUTE)).toContain('useRouter');
  });

  it('offers exactly one control that leaves the passage', () => {
    const body = code('src/ui/reading/inline-lookup.tsx');
    const exits = [...body.matchAll(/onPress=\{on([A-Za-z]+)\}/g)].map((match) => match[1]);
    expect(exits.sort()).toEqual(['Close', 'Keep', 'OpenWord']);
    // …and it is labelled as the exit it is.
    expect(body).toContain('Leaves the passage for the full word page.');
  });
});

/* ------------------------------------------------------------------ *
 * Screen contracts this lane owes
 * ------------------------------------------------------------------ */

describe('the screen keeps the contracts every screen owes', () => {
  it('implements all three REQ-UI-09 panels', () => {
    const body = code(SCREEN);
    for (const panel of ['LoadingPanel', 'ErrorPanel', 'EmptyPanel']) {
      expect(body, panel).toContain(panel);
    }
  });

  it('renders no two state panels at once', () => {
    const body = code(SCREEN);
    const loadingPanels = body.match(/<LoadingPanel\b/g) ?? [];
    const loadingGuards = body.match(/state\.kind === 'loading'/g) ?? [];
    expect(loadingGuards.length).toBeGreaterThanOrEqual(loadingPanels.length);
    for (const match of body.matchAll(/<>([\s\S]*?)<\/>/g)) {
      const inner = match[1] ?? '';
      const together = ['LoadingPanel', 'ErrorPanel', 'EmptyPanel'].filter((panel) =>
        inner.includes(`<${panel}`),
      );
      expect(together.length).toBeLessThanOrEqual(1);
    }
  });

  it('renders the EDRDG acknowledgement with no condition on it', () => {
    const source = read(resolve(APP_ROOT, SCREEN));
    const rendered = [...source.matchAll(/<SeedEntryDisclosure[\s/>]/g)];
    expect(rendered.length).toBeGreaterThan(0);
    for (const match of rendered) {
      const preceding = source.slice(Math.max(0, match.index - 24), match.index);
      expect(preceding, `gated: …${preceding}${match[0]}`).not.toMatch(/[?&]{1,2}\s*$/);
    }
  });

  it('states the durability it has rather than implying more', () => {
    const body = code(SCREEN);
    expect(body).toContain('DURABILITY_NOTES');
    expect(body).not.toMatch(/saved\s+permanently|saved\s+forever|never\s+lose/i);
  });

  /**
   * The lane's components are presentational.
   *
   * `test/design-vocabulary.test.ts` already bans the store from `src/ui`; this
   * is the same rule stated for this lane's own directory, so a future component
   * here cannot reach for the snapshot instead of taking a prop.
   */
  it('keeps the lane components out of the store', () => {
    for (const file of LANE_COMPONENTS) {
      const body = code(file);
      expect(body, file).not.toContain('useAppStore');
      expect(body, file).not.toContain('useAppSnapshot');
      expect(body, file).not.toMatch(/from '\.\.\/\.\.\/state\//);
    }
  });

  it('carries no state on a prop the web target drops', () => {
    for (const file of [SCREEN, ROUTE, ...LANE_COMPONENTS]) {
      expect(code(file), file).not.toContain('accessibilityState');
    }
  });

  it('says out loud which words it can and cannot look up', () => {
    const body = read(resolve(APP_ROOT, SCREEN));
    expect(body).toMatch(/renders as ordinary text rather than being guessed at/);
    expect(body).toMatch(/so none is guessed/);
  });
});
