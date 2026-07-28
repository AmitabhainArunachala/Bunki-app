/**
 * What a frontier mark is, and when there are too many of them.
 *
 * Split out of `frontier.tsx` for the reason `interactive-styles.ts` was split
 * out of `primitives.tsx`: that file imports `react-native`, which the unit-test
 * runner cannot resolve, and a density ceiling that nothing can assert is a
 * claim rather than a property. Here it is plain arithmetic over plain data.
 *
 * ## The rule these types encode
 *
 * Todaii underlines nearly every content word in global-JLPT colours. The
 * operator's verdict, in the frozen spec §10.4: "when everything is highlighted
 * nothing is." Bunki inverts it — the text renders clean, and only words on this
 * learner's own frontier carry a mark (REQ-UI-08: "personal frontier, never
 * global-JLPT rainbow highlighting").
 *
 * So the union below has exactly three members and will not grow: two marks and
 * the absence of one. A fourth member would be a level scale arriving by the
 * back door, and `test/theme-tokens.test.ts` reads this union to make sure it
 * has not.
 */

export type FrontierMarkKind =
  /** Renders clean. The overwhelming majority of a good passage. */
  | 'none'
  /** No evidence for this item yet: the learner's edge. */
  | 'frontier'
  /** Met before, and the projection says it is slipping. */
  | 'fragile';

export interface FrontierSpan {
  /** The text as written. Never altered — a reading surface shows the real text. */
  readonly text: string;
  /** Reading, when furigana is on and this span has one. */
  readonly reading?: string | undefined;
  readonly mark: FrontierMarkKind;
  /** What tapping this span opens. Absent means the span is not a lookup target. */
  readonly lexemeId?: string | undefined;
}

/**
 * Past this proportion of marked spans, the marks stop helping and start being
 * wallpaper.
 *
 * Chosen at a third rather than at a half: by the time one word in three is new,
 * a learner is decoding rather than reading, and the frozen spec's i+1 target
 * (§4, 95–98% known) is far behind.
 */
export const MAX_MARK_DENSITY = 1 / 3;

export const OVERWHELMED_NOTE =
  'Most of this passage is new to you, so the marks are hidden — they would cover the text rather than point at it. Every word is still tappable.';

/**
 * The marked proportion of a passage, weighted by characters.
 *
 * ## Why characters and not spans
 *
 * This counted spans until lane B4 built a real reading surface on it, and span
 * counting turned out to measure the wrong thing — it measures how the caller
 * chose to chunk the text rather than how much of the text is new.
 *
 * A reading surface has to split the run between its marked words into small
 * pieces, because a flex row breaks between items and Japanese has no word
 * spaces to break at; `src/ui/reading/passage-spans.ts` emits one span per
 * unmatched character for exactly that reason. Under span counting, 分かれる —
 * four characters, the widest thing on the line — weighed the same as the
 * particle は beside it, so a passage that is 11% new by area reported 5% and a
 * ceiling set at a third could never be reached by any real passage.
 *
 * Character weighting is invariant to that choice: the same text marked the same
 * way gives the same number whether the caller emitted one span per word, one
 * per character, or one per sentence. That invariance is the property a ceiling
 * needs, because the thing the ceiling is about — how much of the page is
 * underlined — is a fact about area, not about the span list.
 *
 * The existing behaviour is unchanged for every single-character span, which is
 * what the specimen and `test/design-vocabulary.test.ts` are written against.
 */
export function markDensity(spans: readonly FrontierSpan[]): number {
  let total = 0;
  let marked = 0;
  for (const span of spans) {
    // `[...text]` and not `.length`: a surrogate pair is one character to a
    // reader, and counting it as two would let a passage of rare characters
    // report a different density from the same passage in the basic plane.
    const width = [...span.text].length;
    total += width;
    if (span.mark !== 'none') marked += width;
  }
  if (total === 0) return 0;
  return marked / total;
}

/**
 * Whether a passage is past the ceiling.
 *
 * A named predicate rather than a comparison at the call site, so "what counts
 * as too many" has one definition and the component cannot drift from the test.
 */
export function marksAreOverwhelming(spans: readonly FrontierSpan[]): boolean {
  return markDensity(spans) > MAX_MARK_DENSITY;
}
