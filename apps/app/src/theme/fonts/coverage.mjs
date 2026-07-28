/**
 * The coverage contract for the self-hosted Japanese faces.
 *
 * A self-hosted CJK face is a size decision before it is a design decision: the
 * full Shippori Mincho is several megabytes, which is not a thing to ship three
 * copies of. So the faces in this directory are **subsets**, and this file is
 * the definition of the subset — a contract rather than an accident, so that
 * "which characters render in real mincho" has an answer that can be read,
 * tested and regenerated instead of being whatever the generator happened to
 * ask for on the day.
 *
 * What is in it:
 *
 *   - ASCII, because every screen has Latin chrome;
 *   - the Latin punctuation the design language actually uses (em dash, ellipsis,
 *     the curly quotes, the arrow, the check mark);
 *   - all hiragana and katakana, plus CJK punctuation and the fullwidth forms —
 *     kana is not optional in a Japanese app and is small;
 *   - the Kangxi radical blocks, because component decomposition renders
 *     radicals (⻌, ⻏) that are not the unified ideographs they stand for;
 *   - the 2,136 jōyō kanji, as the honest line between "covered" and "falls back
 *     to the platform face";
 *   - every character in the shipped seed dataset, so nothing the app can
 *     actually display today is outside the subset.
 *
 * Characters outside the contract fall back through the platform stack in
 * `typography.ts` — Hiragino Mincho on Apple, Noto Serif CJK on Linux — and
 * ultimately to the generic `serif`/`sans-serif`. They render; they render in a
 * different face. `test/theme-fonts.test.ts` asserts the contract holds over the
 * seed dataset, which is the part that would be a visible defect.
 *
 * This module is plain `.mjs` with no imports so that the generator, the app-side
 * test and a human reading it all see the same list.
 */

/** Inclusive codepoint ranges, as `[first, last]`. */
export const COVERAGE_RANGES = Object.freeze([
  // Printable ASCII.
  [0x0020, 0x007e],
  // Latin-1 punctuation and symbols the UI uses: § © ° · × ÷ and friends.
  [0x00a0, 0x00ff],
  // General punctuation: en/em dash, curly quotes, ellipsis, bullet, prime.
  [0x2010, 0x2027],
  [0x2030, 0x203a],
  // Arrows (→ is the branch/derivation glyph).
  [0x2190, 0x2193],
  // Geometric marks used by the frontier/uncertainty vocabulary.
  [0x25a0, 0x25cf],
  // The check mark.
  [0x2713, 0x2714],
  // Kangxi radicals and their CJK-radical supplements (⻌, ⻏, ⺡ …).
  [0x2e80, 0x2ef3],
  [0x2f00, 0x2fd5],
  // Ideographic space, 、。〜「」【】〆 and the rest of CJK punctuation.
  [0x3000, 0x303f],
  // Hiragana, katakana, the prolonged sound mark, the iteration marks.
  [0x3041, 0x309f],
  [0x30a0, 0x30ff],
  // Fullwidth forms: ！？：；（）０-９Ａ-Ｚ and the halfwidth katakana tail.
  [0xff01, 0xff60],
]);

/**
 * Characters named one at a time because they sit outside any range worth
 * pulling in wholesale.
 */
export const COVERAGE_EXTRAS = Object.freeze([
  '─', // box drawing, used as a hairline glyph in the vertical specimen
  '〓', // the "geta" mark, which is what a missing glyph is *supposed* to look like
  '一', // also jōyō; listed so the file stays legible without opening the list
  // Kanji components that are not themselves jōyō characters. Decomposition is
  // a first-class fact in this product (frozen spec §2.1: which part carries
  // the sound and which the meaning), so a component page renders characters no
  // curriculum list contains. These three are the ones the shipped seed uses;
  // `test/theme-fonts.test.ts` checks the seed against the whole contract, so a
  // fourth arriving is a failing test rather than a mismatched glyph on a page.
  '灬', // the "fire" component in its bottom form
  '卜', // divination; a phonetic and semantic component
  '咅', // a phonetic component
]);

/** Expand the declared ranges and extras into a sorted, de-duplicated array. */
export function coverageBase() {
  const set = new Set(COVERAGE_EXTRAS);
  for (const [first, last] of COVERAGE_RANGES) {
    for (let point = first; point <= last; point += 1) set.add(String.fromCodePoint(point));
  }
  return [...set].sort();
}
