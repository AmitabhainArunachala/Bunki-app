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

import { seedDataset, type SeedPassage } from '../../data/catalog.ts';
import { type FrontierSpan } from '../frontier.tsx';

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
