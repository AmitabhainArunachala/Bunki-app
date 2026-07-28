/**
 * Cutting a passage into the spans a reading surface renders (Campaign E, lane
 * B4).
 *
 * Pure: no React, no store, no dataset import. The reading screen supplies the
 * vocabulary and this decides where the pieces are, so the segmentation can be
 * tested exhaustively without a renderer and the screen stays a renderer.
 *
 * ## The rule, and the failure it is written against
 *
 * **A form is matched only if the caller declared it.** There is no tokeniser,
 * no morphological analysis, and no scan of the dictionary for the longest
 * substring that happens to be a headword. That last one is the tempting version
 * and it is the one that produces plausible wrong answers: 「聞いていたからだ」
 * ends in からだ, which is a real JMdict headword (体, "body") and is not the
 * word in the sentence; 「立って気づく」 contains 気, which is a real word and is
 * not what is being read there. Round-2 research records Migaku shipping exactly
 * this class of defect — "context-dependent kanji readings coming back wrong" —
 * and `src/screens/canvas-passage.ts` reached the same conclusion for the same
 * reason: a literal match either finds a declared form or does not, and "does
 * not" is plain text rather than a confident mistake.
 *
 * The consequence is stated on the screen rather than hidden: only the words
 * this build has an entry for are tappable, and the rest of the passage renders
 * as ordinary text.
 *
 * ## Why unmatched text is chunked at all, and why not per character
 *
 * `FrontierPassage` lays its spans out in a wrapping flex row, and a flex item
 * does not wrap internally — React Native's `flexShrink` default is 0 — so a
 * line can only break *between* spans. Japanese has no word spaces, so a
 * 47-character unmatched run emitted as one span is a 47-character unbreakable
 * box that overflows the measure.
 *
 * The obvious answer is one span per character, and it was the first one here.
 * It is wrong, and the reason is only visible in a browser: every span is its
 * own `StaticText` in the accessibility tree, so the passage was offered to a
 * screen reader as 134 separate nodes — 「駅」「を」「出」「る」「と、」— which is
 * the prose taken apart into rubble. Measured over CDP against the export.
 *
 * So plain text is chunked into short runs at the places a Japanese line may
 * break anyway: after closing punctuation, and in front of a character that
 * starts a word rather than continues one (kanji, Latin, a digit). That gives
 * roughly 「を」「出ると、」「は」「すぐに」「二つに」 — a third of the nodes, each
 * of them something a reader would recognise as a piece of the sentence, and
 * still a break opportunity every few characters.
 *
 * It is not morphological analysis and does not pretend to be: 「出ると、」 is a
 * run of characters that happens to be a verb and its particle, and nothing here
 * claims to know that. It is a typographic rule about where a line may break.
 *
 * That chunking freedom is also why {@link markDensity} is weighted by
 * characters rather than by spans — see its own note; a span count over this
 * output would be a count of how the text was chunked rather than of how much of
 * it is new.
 *
 * ## Kinsoku (禁則処理), as far as this can honestly go
 *
 * A Japanese line may not *begin* with 、。」 or a small kana. Those characters
 * are therefore merged onto the plain span before them, so no break opportunity
 * exists in front of them.
 *
 * The one case this cannot fix is a forbidden character immediately after a
 * matched word — 「分かれる。」 in the seed passage. Merging the 。 into that span
 * would put it inside the frontier underline and inside the word's spoken label,
 * which are worse defects than a rare bad break, so the character stays on its
 * own and a break may fall in front of it. Recorded here rather than left for a
 * reader to notice.
 */

import { type FrontierMarkKind, type FrontierSpan } from '../frontier-marks.ts';

/** One form the surface is willing to make interactive. */
export interface LookupForm {
  /** The literal surface form, exactly as it appears in the passage body. */
  readonly form: string;
  /** What tapping it opens. */
  readonly lexemeId: string;
  /** The dictionary reading, for furigana. Absent when none is recorded. */
  readonly reading?: string | undefined;
  /** Where this form sits relative to the learner's own frontier. */
  readonly mark: FrontierMarkKind;
}

/**
 * Characters that may not begin a line (行頭禁則).
 *
 * The closing half of the standard set: sentence and clause punctuation, closing
 * brackets and quotes, the small kana, the repeat marks, and the long-vowel bar.
 * Opening brackets — the 行末禁則 half — are deliberately absent: the seed
 * passage contains none, and an untested branch is worth less than a documented
 * gap.
 */
const NO_LINE_START = new Set([
  ...'、。，．,.・：；:;？！?!ー〜～…‥',
  ...'）〕］｝〉》」』】〙〗｣)]}',
  ...'”’〟',
  ...'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ',
  ...'々ゝゞヽヾ',
]);

/** Whether every character of `text` is forbidden at the start of a line. */
function cannotStartLine(text: string): boolean {
  const characters = [...text];
  return characters.length > 0 && characters.every((character) => NO_LINE_START.has(character));
}

/**
 * Characters that begin a word rather than continue one.
 *
 * Kanji, Latin letters and digits. Kana are excluded because a kana following a
 * kanji is usually okurigana or a particle, and breaking in front of it is the
 * break this rule exists to avoid — 「出」「ると、」 reads worse than 「出ると、」
 * to a screen reader and looks worse on the page.
 *
 * A range test rather than a Unicode property escape: the repository targets a
 * bundler and a React Native runtime as well as Node, and a `\p{Script=Han}`
 * class is the kind of thing that quietly costs a polyfill.
 */
function opensARun(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  const isKanji =
    (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // extension A
    (code >= 0xf900 && code <= 0xfaff); // compatibility ideographs
  const isLatin =
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xff21 && code <= 0xff5a);
  const isDigit = (code >= 0x30 && code <= 0x39) || (code >= 0xff10 && code <= 0xff19);
  return isKanji || isLatin || isDigit;
}

/**
 * The longest a plain run may get, in characters.
 *
 * A ceiling rather than the rule: the script test above already breaks a
 * Japanese sentence every few characters, and this only catches the case it
 * cannot — a long unbroken kana run, of which the seed passage's
 * 「いていたからだ。」 is the worst at eight. Eight characters of running text at
 * `TYPE.body` is roughly 136 pt inside a measure of about 650, so a run at the
 * ceiling still has somewhere to go.
 */
export const MAX_PLAIN_RUN = 8;

/**
 * Split `body` into spans, making every declared form a lookup target.
 *
 * Longest form first, then by `lexemeId`, so the order is total and a rerun over
 * the same inputs produces the same spans. Longest-first is what keeps 分岐点
 * from being cut into 分岐 + 点 when both are declared.
 *
 * A form the body does not contain simply produces no span. That is not an
 * error: the caller declares the passage's whole vocabulary, and a word can be
 * declared for a passage it only appears in inflected — 分岐 is in the seed
 * passage's own `lexemeIds` and occurs there only inside 分岐点.
 */
export function buildPassageSpans(
  body: string,
  forms: readonly LookupForm[],
): readonly FrontierSpan[] {
  const ordered = [...forms]
    .filter((candidate) => candidate.form.length > 0)
    .sort((left, right) => {
      const byLength = right.form.length - left.form.length;
      if (byLength !== 0) return byLength;
      return left.lexemeId.localeCompare(right.lexemeId, 'en');
    });

  const spans: FrontierSpan[] = [];

  /**
   * Append one plain character to the run in progress, or start a new run.
   *
   * A new run starts when the previous character was closing punctuation (a line
   * may break after it), when this character opens a word (a line may break
   * before it), or when the run has reached {@link MAX_PLAIN_RUN}. Closing
   * punctuation never starts a run, which is the kinsoku rule.
   */
  const pushPlain = (character: string): void => {
    const previous = spans[spans.length - 1];
    const openRun =
      previous !== undefined && previous.lexemeId === undefined && previous.mark === 'none'
        ? previous
        : null;

    if (openRun === null) {
      spans.push({ text: character, mark: 'none' });
      return;
    }

    const characters = [...openRun.text];
    const last = characters[characters.length - 1] ?? '';
    const mustJoin = cannotStartLine(character);
    const breakHere =
      !mustJoin &&
      (NO_LINE_START.has(last) || opensARun(character) || characters.length >= MAX_PLAIN_RUN);

    if (breakHere) {
      spans.push({ text: character, mark: 'none' });
      return;
    }
    spans[spans.length - 1] = { ...openRun, text: openRun.text + character };
  };

  let index = 0;
  while (index < body.length) {
    const hit = ordered.find((candidate) => body.startsWith(candidate.form, index));
    if (hit === undefined) {
      // Iterate by code point, so a character outside the basic plane is one
      // span rather than two halves of a surrogate pair.
      const character = String.fromCodePoint(body.codePointAt(index) as number);
      pushPlain(character);
      index += character.length;
      continue;
    }
    spans.push({
      text: hit.form,
      mark: hit.mark,
      lexemeId: hit.lexemeId,
      ...(hit.reading === undefined ? {} : { reading: hit.reading }),
    });
    index += hit.form.length;
  }

  return spans;
}

/** How many spans in a passage are lookup targets. Used for the honest count. */
export function lookupSpanCount(spans: readonly FrontierSpan[]): number {
  return spans.filter((span) => span.lexemeId !== undefined).length;
}

/** The distinct lexeme ids a passage offers, in reading order. */
export function lookupLexemeIds(spans: readonly FrontierSpan[]): readonly string[] {
  const seen: string[] = [];
  for (const span of spans) {
    if (span.lexemeId !== undefined && !seen.includes(span.lexemeId)) seen.push(span.lexemeId);
  }
  return seen;
}
