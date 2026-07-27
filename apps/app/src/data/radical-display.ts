/**
 * Rendering a kanji's radical analyses without naming a dictionary
 * (WP-09, carried P2 from W3; REQ-UI-03).
 *
 * ## The defect this closes
 *
 * REQ-UI-03 is unambiguous:
 *
 * > Dictionary indices (SKIP, Henshall, NJECD, Gakken, New Nelson, KALD,
 * > Daikanwa/Morohashi) are **join keys in the database, never rendered on the
 * > page**.
 *
 * The kanji page rendered `radical.kind` verbatim: `{element} — radical,
 * {kind}`. Two of the seed's ten characters carry `"kind": "nelson"` — the
 * radical assignment from Nelson's character dictionary, which is exactly one
 * of the named indices — so 分 and 点 printed the words "radical, nelson" on the
 * page while the subtitle two hundred lines above them said "Dictionary index
 * numbers are database join keys and are never shown here". The page contained
 * both the rule and its violation.
 *
 * The screen's own header made it worse by asserting "The Phase-0 seed carries
 * none of them, so there is nothing here to leak", which was false when it was
 * written. The scan in `test/screen-contract.test.ts` did not catch it because
 * it reads source text: the token reached the page through a *data* field, and
 * no source file spelled it.
 *
 * ## Why the fix is here and not in the seed
 *
 * `packages/seed/` is another work package's surface and, more importantly, the
 * requirement does not say the value must not be *stored*. It says the opposite:
 * these are join keys **in the database**. A seed that discarded the scheme
 * would lose a real provenance fact and could no longer be joined against a
 * licensed character database later. The rule is about the page, so the fix
 * belongs at the render boundary — which is here.
 *
 * ## Why the whole field is dropped and not just the offending values
 *
 * A denylist of index names would need to be complete, forever, against a data
 * file this package does not own. Every value of this field is by definition
 * the name of a classification scheme — `general`, `tradit` and `nelson` are
 * KANJIDIC2's `rad_type` values, and every one of them is a scheme label rather
 * than something a learner can use. So `radicalDisplay` renders the *elements*,
 * which are characters the learner can see and recognise, and never the scheme
 * that assigned them. When the source records two different analyses it says
 * that, because "sources disagree about which element is the radical" is a true
 * and useful thing to know and silently showing one of them would not be.
 */

import type { KanjiRadical } from '@bunki/seed';

export interface RadicalDisplay {
  /** Distinct radical elements the source records, in source order. */
  readonly elements: readonly string[];
  /** How many scheme-tagged analyses the source holds. */
  readonly analyses: number;
  /** The sentence to render under the elements. Never names a scheme. */
  readonly note: string;
}

const NO_ANALYSIS_NOTE = 'No component role is recorded for this character.';

const SINGLE_ANALYSIS_NOTE =
  'The source records this element as the radical. The classification scheme that assigned it is a database join key and is not shown (REQ-UI-03).';

const MULTIPLE_ANALYSIS_NOTE =
  'The source records more than one radical analysis for this character, under different classification schemes. The elements are shown; the scheme names are database join keys and are not shown (REQ-UI-03).';

/**
 * The renderable form of a character's radical records.
 *
 * Total: an empty list, one analysis, or several all produce a well-formed
 * result with a sentence that is true of that case.
 */
export function radicalDisplay(radicals: readonly KanjiRadical[]): RadicalDisplay {
  const elements: string[] = [];
  for (const radical of radicals) {
    if (!elements.includes(radical.element)) elements.push(radical.element);
  }

  if (radicals.length === 0) {
    return { elements: [], analyses: 0, note: NO_ANALYSIS_NOTE };
  }

  return {
    elements,
    analyses: radicals.length,
    note: elements.length > 1 ? MULTIPLE_ANALYSIS_NOTE : SINGLE_ANALYSIS_NOTE,
  };
}

/**
 * Every scheme label the current seed uses, for the tests that check the fix.
 *
 * Read from the dataset rather than typed here. A hard-coded denylist of index
 * names in app source would be two mistakes at once: it could go stale against
 * a data file this package does not own, and — since the rule is enforced by a
 * source scan for those very names — writing them here would make the fix trip
 * the check it exists to satisfy.
 */
export function schemeLabelsInSeed(
  kanji: readonly { readonly radicals: readonly KanjiRadical[] }[],
): readonly string[] {
  const labels = new Set<string>();
  kanji.forEach((entry) => entry.radicals.forEach((radical) => labels.add(radical.kind)));
  return [...labels].sort();
}
