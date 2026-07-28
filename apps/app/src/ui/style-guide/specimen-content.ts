/**
 * The Japanese the specimen page is set in.
 *
 * Every string here is real: the passage and the words come from
 * `@bunki/seed`, which is project-authored, labelled as such, and shipped with
 * its own disclosures. Nothing is lorem, nothing is placeholder kana, and
 * nothing was invented for the specimen — a type specimen set in filler cannot
 * be judged, because the whole question a specimen answers is how the actual
 * content looks.
 *
 * The one thing this module *does* invent is the frontier state: which spans
 * are marked as new or fragile. Those are illustrative, and they are illustrative
 * on purpose rather than read from the store — a specimen page must render the
 * same way on every machine to be reviewable, and it must not depend on a
 * learner having any history. Nothing here writes anything, and nothing here is
 * evidence: the spans are display data for a display page.
 */

import {
  findLexemeById,
  seedDataset,
  type SeedLexeme,
  type SeedPassage,
} from '../../data/catalog.ts';
import { type FrontierSpan } from '../frontier.tsx';
import { type EraKey } from '../theme.ts';
import { type GroundCard } from './ground-field.tsx';

/**
 * The seed's one hand-written passage.
 *
 * Thrown rather than defaulted if it is missing. The seed asserts in its own
 * tests that exactly one passage exists, so an absence here means the dataset
 * changed shape — and a specimen that silently fell back to an empty string
 * would look like a rendering bug in the type scale rather than like the data
 * problem it is.
 */
function requirePassage(): SeedPassage {
  const passage = seedDataset.passages[0];
  if (passage === undefined) {
    throw new Error('the seed has no passage: the design specimen has nothing to set');
  }
  return passage;
}

export const PASSAGE: SeedPassage = requirePassage();

/**
 * The passage's opening, segmented for the reading surface.
 *
 * Segmented by hand rather than by a tokenizer: `@bunki/domain` owns
 * tokenization, this lane owns the vocabulary, and a specimen that pulled in a
 * morphological analyser to draw two underlines would be the wrong dependency
 * in the wrong direction.
 */
export const PASSAGE_SPANS: readonly FrontierSpan[] = [
  { text: '駅', reading: 'えき', mark: 'none', lexemeId: 'lex-eki' },
  { text: 'を', mark: 'none' },
  { text: '出る', reading: 'でる', mark: 'none' },
  { text: 'と、', mark: 'none' },
  { text: '線路', reading: 'せんろ', mark: 'fragile', lexemeId: 'lex-senro' },
  { text: 'は', mark: 'none' },
  { text: 'すぐに', mark: 'none' },
  { text: '二つ', reading: 'ふたつ', mark: 'none' },
  { text: 'に', mark: 'none' },
  { text: '分かれる', reading: 'わかれる', mark: 'none', lexemeId: 'lex-wakareru' },
  { text: '。', mark: 'none' },
  { text: '左', reading: 'ひだり', mark: 'none' },
  { text: 'は', mark: 'none' },
  { text: '海', reading: 'うみ', mark: 'none' },
  { text: 'へ、', mark: 'none' },
  { text: '右', reading: 'みぎ', mark: 'none' },
  { text: 'は', mark: 'none' },
  { text: '山', reading: 'やま', mark: 'none' },
  { text: 'へ', mark: 'none' },
  { text: '続く', reading: 'つづく', mark: 'frontier' },
  { text: '。', mark: 'none' },
];

/**
 * The same shape, past the density ceiling.
 *
 * Here so the specimen can show the guard working rather than describing it:
 * this is what a passage looks like when it is far beyond the learner's edge,
 * and the point is that it looks *clean*, with one sentence of explanation,
 * rather than looking like a highlighter accident.
 */
export const OVERWHELMED_SPANS: readonly FrontierSpan[] = [
  { text: '人生', reading: 'じんせい', mark: 'frontier' },
  { text: 'の', mark: 'none' },
  { text: '岐路', reading: 'きろ', mark: 'frontier', lexemeId: 'lex-kiro' },
  { text: 'も、', mark: 'none' },
  { text: 'たぶん', mark: 'fragile' },
  { text: 'これと', mark: 'none' },
  { text: '同じ', reading: 'おなじ', mark: 'frontier' },
  { text: 'だ', mark: 'none' },
  { text: '。', mark: 'none' },
];

/** The vertical specimen: two sentences, long enough to show a real column. */
export const VERTICAL_SPECIMEN =
  '分かれた道が、どこかでまた出会うとはかぎらない。それでも、自分で選んだ道だけが自分の道になる。';

/** The word the museum card is about, and the kanji the stroke specimen draws. */
export const SPECIMEN_LEXEME_ID = 'lex-bunki';
export const SPECIMEN_KANJI = '岐';

/* ------------------------------------------------------------------ *
 * The three era registers, set in real seed words
 * ------------------------------------------------------------------ */

/**
 * The honesty note that travels on every card in the era sections.
 *
 * It matters more here than anywhere else on this page. The map's whole thesis
 * is that a word's *position* is meaningful — which era it entered the language
 * in, by what road — and the seed carries **no era metadata at all**. Sourcing
 * that attribute honestly is lane A2′'s work, and until it exists any placement
 * a specimen makes is the specimen's own arrangement.
 *
 * So the placements below are grouping by an obvious property of the words
 * themselves (a native reading, a 漢語 compound, a rail term), stated as such,
 * and never rendered as though the dataset said so. A specimen that quietly
 * implied a sourced era would be teaching the reader to trust a field that does
 * not exist yet.
 */
export const ERA_PLACEMENT_STANDING =
  'Placed on this layer by the specimen, not by the data. The seed carries no era field; sourcing one honestly is a separate piece of work. Nothing on this card is measured and nothing here is evidence.';

/** Pull a seed word, or say which one is missing rather than rendering a blank. */
function requireLexeme(id: string): SeedLexeme {
  const lexeme = findLexemeById(id);
  if (lexeme === null) throw new Error(`the seed has no '${id}': the era specimen cannot be set`);
  return lexeme;
}

/**
 * Two seed words per register, and one line each about why they sit there.
 *
 * Every headword, reading and sense is real seed content. The one-line reasons
 * are the specimen's own — they are the kind of sentence the design documents
 * call "the character explaining itself", written from what the word plainly is
 * rather than from an encyclopedia.
 *
 * 駅 is on the rail layer here because that is where a learner meets it today,
 * and it is the design's own worked example precisely because it did not start
 * there: 駅家 was a post-station on the ancient road and 宿場 was its Edo
 * successor, and the Meiji railways took the old word back up. The map is what
 * will eventually be able to show that; a flat specimen can only say it.
 */
const ERA_WORDS: Readonly<Record<EraKey, readonly { id: string; why: string }[]>> = {
  kodo: [
    { id: 'lex-michi', why: 'みち — a native reading, and a road you walk rather than drive.' },
    { id: 'lex-kiro', why: '岐 the fork and 路 the road: the place a path divides.' },
  ],
  kaido: [
    { id: 'lex-douro', why: '道 and 路 compounded — a 漢語 word for a made road.' },
    { id: 'lex-shadou', why: '車 the vehicle and 道 the road: the lane the traffic takes.' },
  ],
  tetsudo: [
    { id: 'lex-eki', why: '駅家 on the old road, 宿場 on the highway, and a station since Meiji.' },
    { id: 'lex-senro', why: '線 the line and 路 the road: the rails themselves.' },
  ],
};

function cardsFor(era: EraKey): readonly GroundCard[] {
  return ERA_WORDS[era].map(({ id, why }, index) => {
    const lexeme = requireLexeme(id);
    return {
      written: lexeme.headword,
      reading: lexeme.reading,
      caption: lexeme.senses.slice(0, 2).join(' · '),
      catalogue: [why, `${lexeme.partOfSpeech.join(', ')} · seed entry ${lexeme.id}`],
      capability: index === 0 ? 'reading' : 'meaning',
      // Two bands per register, so each ground shows both a bare mark and the
      // bounded meter landing on it rather than one kind of figure twice.
      band: index === 0 ? 'settled' : 'emerging',
      standing: ERA_PLACEMENT_STANDING,
    } satisfies GroundCard;
  });
}

/** The cards each era ground carries, built from the seed at module load. */
export const ERA_CARDS: Readonly<Record<EraKey, readonly GroundCard[]>> = {
  kodo: cardsFor('kodo'),
  kaido: cardsFor('kaido'),
  tetsudo: cardsFor('tetsudo'),
};

/**
 * The signals the rail register is asked to light, and the count is deliberate.
 *
 * Four are passed and the cap is three, so the specimen shows the ration doing
 * its job rather than describing it — the fourth is reported as suppressed and
 * the page says so in prose.
 */
export const RAIL_SIGNALS = [
  { kind: 'due-now', basis: 'Due now, according to the plan this surface only displays.' },
  { kind: 'branch-open', basis: 'A branch is open here after a stumble.' },
  { kind: 'evidence-stale', basis: 'The last direct evidence is old enough to doubt.' },
  { kind: 'due-now', basis: 'Also due now — past the ration, so it is not lit.' },
] as const;
