/**
 * JMdict's own commonness tags, said in words (Campaign E / B3).
 *
 * ## Why these are rendered at all, and why they are not an index
 *
 * The frozen spec §5 bans *dictionary indices* — SKIP, Henshall, New Nelson,
 * Daikanwa — from a reference page, because they are "join keys, not
 * curriculum": a number whose only meaning is "where this sits in someone
 * else's book". `test/screen-contract.test.ts` enforces that ban across the
 * whole app.
 *
 * A `ke_pri`/`re_pri` tag is a different kind of thing. It is a statement about
 * how often the word is used, taken from a named corpus, and "this is one of
 * the five hundred commonest words in a newspaper" is exactly the sort of fact
 * a learner deciding whether to take a word up wants. So the tags are shown —
 * but never as their codes alone, because `nf01` at learner weight is precisely
 * the renzo failure §10.1 diagnoses (a database rendered as table views, with
 * no hierarchy between headword and index number).
 *
 * The rule this file encodes: **the sentence is the surface, the code is the
 * footnote.** {@link describePriorityTag} returns the sentence; the caller may
 * show the code beside it at `meta` weight and never on its own.
 *
 * ## Where the wording comes from
 *
 * The JMdict DTD's own description of `ke_pri`, which ships in the file this
 * project imported and is quoted in `packages/seed/LICENSES.md`'s source notes.
 * Nothing here is inferred from the data: an unrecognised tag is returned as
 * `null` and the caller says it is unrecognised rather than guessing a meaning.
 */

export interface PriorityTagNote {
  /** The upstream code, e.g. `nf01`. Shown small, beside the sentence. */
  readonly code: string;
  /** What the code says, in a learner's words. Never omitted. */
  readonly note: string;
}

/**
 * The corpus behind `news*` and `nf*`, named once.
 *
 * The tags are a JMdict-side judgement about frequency in a specific body of
 * text; a page that said "common" without saying "common where" would be making
 * the register-blind claim the operator's own calibration (frozen §11) shows to
 * be wrong for them personally.
 */
export const PRIORITY_TAG_SOURCE =
  'JMdict marks each entry with its own commonness tags. They describe how often the word appears in the corpora listed below — a newspaper, a published frequency list — not how well you know it.';

const FIXED_NOTES: Readonly<Record<string, string>> = {
  ichi1: 'In the first tier of the published “Ichimango goi bunruishuu” common-word list.',
  ichi2: 'In that same list, in the tier JMdict demoted as less common.',
  news1: 'In the first 12,000 words of a Mainichi Shimbun newspaper frequency list.',
  news2: 'In the second 12,000 words of that newspaper frequency list.',
  spec1: 'Marked common by JMdict itself, having not been caught by the other lists.',
  spec2: 'Marked somewhat common by JMdict itself, outside the other lists.',
  gai1: 'A common loanword, in the first tier of the same frequency list.',
  gai2: 'A common loanword, in the second tier of that list.',
};

/** `nf07` → the 7th block of 500 words. Returns `null` for anything else. */
function frequencyBlockNote(code: string): string | null {
  const match = /^nf(\d{2})$/.exec(code);
  if (match === null) return null;
  const block = Number.parseInt(match[1] as string, 10);
  if (!Number.isFinite(block) || block < 1) return null;
  const from = (block - 1) * 500 + 1;
  const to = block * 500;
  return `Ranks between ${String(from)} and ${String(to)} in that newspaper frequency list.`;
}

/** The sentence for one tag, or `null` when this build does not know the code. */
export function describePriorityTag(code: string): PriorityTagNote | null {
  const fixed = FIXED_NOTES[code];
  if (fixed !== undefined) return { code, note: fixed };
  const block = frequencyBlockNote(code);
  return block === null ? null : { code, note: block };
}

export interface PriorityTagReading {
  /** Tags this build can put a sentence to, in upstream order. */
  readonly described: readonly PriorityTagNote[];
  /**
   * Tags carried by the entry that this build has no wording for.
   *
   * Surfaced rather than dropped: a code silently discarded is a field the
   * learner cannot tell was ever there, and the next importer would have no
   * reason to notice the gap.
   */
  readonly unrecognised: readonly string[];
}

export function readPriorityTags(tags: readonly string[]): PriorityTagReading {
  const described: PriorityTagNote[] = [];
  const unrecognised: string[] = [];
  for (const tag of tags) {
    const note = describePriorityTag(tag);
    if (note === null) unrecognised.push(tag);
    else described.push(note);
  }
  return { described, unrecognised };
}
