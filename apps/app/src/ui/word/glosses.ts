/**
 * The word's glosses, and the honest name for what they are (Campaign E / B3).
 *
 * ## The thing this module refuses to do
 *
 * A word page wants to say "sense 1, sense 2", each with its own part of
 * speech. JMdict really does carry that structure. **This build does not.**
 * The importer flattens every `<gloss>` of every `<sense>` into one deduped
 * list in upstream order and collects the parts of speech into a second list at
 * the entry level (`packages/seed/scripts/import-sources.mjs`, which says so in
 * its own comment), and `SEED_ENTRY_DISCLOSURE` warns the reader that "sense and
 * reading lists are flattened here and may not show every distinction upstream
 * draws".
 *
 * So this module calls them **glosses**, not senses, and the part of speech is
 * labelled as belonging to the entry rather than to a line. Numbering the list
 * "1., 2., 3." and captioning each with a part of speech would be a page that
 * looks like a dictionary while asserting a grouping the data lost — the exact
 * false standing REQ-GATE-03 forbids, one field down.
 *
 * ## Progressive disclosure, with a reason rather than a chevron
 *
 * 取る carries 63 glosses in this tier. Rendering all of them is the wall of
 * text §10.1 rejects; hiding them behind an unlabelled arrow is the dead list
 * inbox it also rejects. {@link splitGlosses} takes the third option: the
 * opening few are the page, the rest are counted and described, and
 * `Disclosure` states both before it is opened.
 */

/**
 * How many glosses stay open.
 *
 * Four rather than one, because a single English word is rarely enough to fix a
 * Japanese word's meaning, and rarely more than four because past that the card
 * stops being a card. It is a display constant with no claim attached: nothing
 * here says the first four are the *common* ones — upstream order is the only
 * ordering this build has, and {@link tailReason} says so.
 */
export const OPEN_GLOSS_COUNT = 4;

/**
 * A tail this short is not worth folding.
 *
 * A disclosure that hides two lines costs a tap and saves nothing; it is the
 * chevron-over-nothing failure with a different number. Below this, everything
 * opens.
 */
export const MIN_FOLDED_TAIL = 3;

export interface GlossSplit {
  /** Rendered open, in upstream order. */
  readonly opening: readonly string[];
  /** Folded behind a disclosure. Empty when everything opens. */
  readonly tail: readonly string[];
  /** True when the entry has no glosses at all. */
  readonly empty: boolean;
}

export function splitGlosses(glosses: readonly string[]): GlossSplit {
  if (glosses.length === 0) return { opening: [], tail: [], empty: true };
  if (glosses.length <= OPEN_GLOSS_COUNT + MIN_FOLDED_TAIL) {
    return { opening: [...glosses], tail: [], empty: false };
  }
  return {
    opening: glosses.slice(0, OPEN_GLOSS_COUNT),
    tail: glosses.slice(OPEN_GLOSS_COUNT),
    empty: false,
  };
}

/**
 * Why the tail is folded — the sentence the disclosure header carries.
 *
 * Written from the count rather than kept as a constant so it can never say
 * "12 more" over a list of nine.
 */
export function tailReason(count: number): string {
  return (
    `${String(count)} more English wordings for the same entry, in the order the dictionary ` +
    'gives them. They are wordings, not numbered senses: this build flattens every sense’s ' +
    'glosses into one list, so which of them belong together upstream is not recorded here.'
  );
}

/**
 * What the part-of-speech line may claim.
 *
 * Kept beside the glosses because it is the same lost distinction seen from the
 * other side: the list is the union across the entry's senses, so pinning one
 * of its members to one gloss would be an invention.
 */
export const PART_OF_SPEECH_STANDING =
  'Parts of speech are listed for the whole entry, in upstream order. This build does not record which sense each one belongs to.';

/** The standing line for the gloss list itself. */
export const GLOSS_STANDING =
  'English wordings from JMdict, in upstream order, duplicates removed. Sense grouping is not carried in this build.';
