/** Reviewed VH-1 visual admission obligations at 5f6c2055: the full design and reading case
 * rosters, the exact comparator and the line-break oracle that admission recomputes.
 * Independent admission policy, never imported from the producer's schedule helpers.
 */
export const DESIGN_CASES = Object.freeze([
  'R1-flush-tokens-1368',
  'R1-flush-tokens-390',
  'R2-readability-1368',
  'R2-readability-390',
  'R3-first-sentence-1368',
  'R3-first-sentence-390',
  'S1-learner-wording',
  'S2-first-story-above-fold-390',
  'S3-counts-agree',
  'S4-picture-cards-1368',
  'S4-picture-cards-390',
  'T1-tools-behind-one-button-1368',
  'T1-tools-behind-one-button-390',
  'M1-title-block-1368',
  'M1-title-block-390',
  'O1-no-clipped-row-320',
  'O1-no-clipped-row-390',
  'O1-no-clipped-row-1368',
  'P1-fresh-word-demo-1368',
  'P1-fresh-word-demo-390',
  'P1-history-only-no-demo',
  'W1-damascus-can-be-saved-1368',
  'W1-damascus-can-be-saved-390',
  'W2-one-word-one-card',
  'W2-one-word-one-card-reverse',
  'G1-stage-meaning-1368',
  'G1-stage-meaning-390',
  'G2-menu-save-one-card',
  'G3-save-and-undo-1368',
  'G3-save-and-undo-390',
  'G4-keyboard-menu',
  'G5-lists-popover-1368',
  'G5-lists-popover-390',
  'G5-galaxy-one-path',
  'G6-sentence-row',
  'G6-sentence-below-seat-390',
  'G6-sentence-pane-seat-390',
  'G6-sentence-pane-seat-320',
  'G6-sentence-return-motion-390',
  'G6-sentence-return-motion-320',
  'G7-version-switch',
  'G7-version-switch-hit-390',
  'G7-version-switch-hit-320',
  'G8-reader-popup-motion-390',
  'G8-reader-popup-motion-320',
  'G9-japanese-line-breaks-390',
  'G9-japanese-line-breaks-320',
  'J1-jlpt-room-wording',
  'K1-keyboard-roving',
  'A1-no-f1-audio',
]);
export const READING_CASES = Object.freeze([
  'reader',
  'stable',
  'sentence',
  'deck',
  'guided',
  'r2',
  'aux',
  'auxsweep',
  'capture',
  'cold',
  'unread',
  'sweep',
  'special',
]);
export function exactRoster(expected, observed) {
  return (
    Array.isArray(expected) &&
    expected.length > 0 &&
    Array.isArray(observed) &&
    expected.length === observed.length &&
    new Set(expected).size === expected.length &&
    new Set(observed).size === observed.length &&
    expected.every((id) => observed.includes(id))
  );
}
export const MIXED_LEXEMES = Object.freeze([
  Object.freeze({ seq: '1057580', form: 'サボる' }),
  Object.freeze({ seq: '1925180', form: 'メモる' }),
  Object.freeze({ seq: '2018460', form: 'ググる' }),
]);
const GODAN_R_ENDINGS = Object.freeze([
  'らなかった',
  'らない',
  'りました',
  'ります',
  'られる',
  'らせる',
  'れば',
  'ろう',
  'った',
  'って',
  'ら',
  'り',
  'る',
  'れ',
  'ろ',
]);
function mixedLexicalSpans(text, lexemes) {
  const spans = [];
  for (const { seq, form } of lexemes) {
    const stem = form.slice(0, -1);
    for (let at = text.indexOf(stem); at >= 0; at = text.indexOf(stem, at + 1)) {
      if (at && /[\p{Script=Katakana}ー]/u.test(text[at - 1])) continue;
      const suffix = GODAN_R_ENDINGS.find((end) => text.startsWith(end, at + stem.length));
      if (suffix) spans.push({ start: at, end: at + stem.length + suffix.length, seq, form });
    }
  }
  return spans;
}
export function plainBadBreak(text, i, lexemes = MIXED_LEXEMES) {
  const a = text[i - 1],
    b = text[i];
  if (!a || !b || /\s/u.test(a) || /\s/u.test(b)) return '';
  const digit = /[0-9０-９]/u,
    kata = /[ァ-ヺー]/u;
  if (digit.test(a) && digit.test(b)) return 'inside a number';
  if (a === '第' && digit.test(b)) return 'between 第 and its number';
  if (
    digit.test(a) &&
    /[年月日時分秒回号人本件個円歳条位度階巻章話部点名社台枚冊匹頭羽杯軒週代種目期次世紀万億兆割倍％%]/u.test(
      b,
    )
  )
    return 'between a number and its counter';
  if (mixedLexicalSpans(text, lexemes).some((span) => i > span.start && i < span.end))
    return 'inside an independently evidenced mixed-script word';
  if (kata.test(a) && kata.test(b)) return 'inside a katakana word';
  if (/[ぁ-ゖ]/u.test(b) && /[一-鿿々ァ-ヺー]/u.test(a)) {
    const stem = /[\p{Script=Han}々]+$/u.exec(text.slice(0, i))?.[0] || '';
    const kana = /^\p{Script=Hiragana}+/u.exec(text.slice(i))?.[0] || '';
    if (
      ([...stem].length === 1 && !/\p{Script=Han}/u.test(text[i - 2] || '')) ||
      (/[はがをにでとのもへや]/u.test(kana[0] || '') && kana.length === 1)
    )
      return "before a word's kana ending";
  }
  if (/[、。，．！？」』）〉》〕］｝ー〜…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/u.test(b))
    return 'before a closing mark';
  if (/[「『（〈《〔［｛]/u.test(a)) return 'after an opening mark';
  return '';
}

// Reviewed full drop membership from feed-review-queue.json at 5f6c2055;
// queue SHA-256 9fd27f5e9023d470da5c117eeb26b550e61415732ed3c6d61ffd348095cbd3e4.
// Admission must never derive this obligation from a producer-declared prefix length.
export const SWEEP_DROP_IDS = Object.freeze([
  'aozora:000772-1',
  'aozora:002359-1',
  'aozora:004668-1',
  'aozora:049966-1',
  'aozora:049966-2',
  'aozora:053224-1',
  'aozora:058059-1',
  'bunki-read-n1-kukai-sanskrit',
  'bunki-read-n1-neocognitron',
  'bunki-read-n1-nobel-economics',
  'bunki-read-n1-optogenetics-nobel',
  'bunki-read-n1-soai-nobel',
  'bunki-read-n1-strange-loop',
  'bunki-read-n1-suzuki-zen',
  'bunki-read-n1-zazen-brainwaves',
  'bunki-read-n2-benzaiten',
  'bunki-read-n2-bodhisena',
  'bunki-read-n2-carson-nobel',
  'bunki-read-n2-forgetting-curve',
  'bunki-read-n2-grit-checked',
  'bunki-read-n2-hofstadter-law',
  'bunki-read-n2-icecube-nobel',
  'bunki-read-n2-imf-outlook',
  'bunki-read-n2-japan-us-chip-fab',
  'bunki-read-n2-kobe-jain',
  'bunki-read-n2-kokugo-survey',
  'bunki-read-n2-pillay-peace-nobel',
  'bunki-read-n2-shima-4004',
  'bunki-read-n2-shosoin-names',
  'bunki-read-n2-shoten-ganesha',
  'bunki-read-n2-sleep-memory',
  'bunki-read-n3-felt-prices',
  'bunki-read-n3-gojuon-sanskrit',
  'bunki-read-n3-honda-quarter',
  'bunki-read-n3-rule-of-72',
  'bunki-read-n3-transistor-class',
  'global-voices:2026-07-28-65374',
  'global-voices:2026-08-03-65560',
  'govonline:202403-entry-5920-column',
  'mext:b_menu-hakusho-html-hpaa202601-1421221_00020-column2-3',
]);
