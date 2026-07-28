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

/** The marked proportion of a passage, counting spans rather than characters. */
export function markDensity(spans: readonly FrontierSpan[]): number {
  if (spans.length === 0) return 0;
  const marked = spans.filter((span) => span.mark !== 'none').length;
  return marked / spans.length;
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
