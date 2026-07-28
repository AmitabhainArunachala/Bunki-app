/**
 * The capability vocabulary — the display half of REQ-LM-02, and the reason
 * there is no single number anywhere in this design system.
 *
 * ## Why a list of five and not a score
 *
 * REQ-LM-03 forbids a global scalar: no universal level, no mastery percentage.
 * REQ-UI-07 forbids the map from collapsing reading/meaning/listening/
 * production/writing into one mastery light. The operator's own calibration
 * (frozen spec §11) is the evidence for both — listening around N2+, formal
 * written grammar around N3, from the same person on the same day. A single
 * number would have had to be wrong about at least one of those.
 *
 * So capability is a *dimension*, not a rollup, and every component in this
 * system that shows recall strength requires a capability alongside it. That is
 * enforced by the type: `RecallMark` and `RecallMeter` take `capability` as a
 * required prop, there is no `'overall'` member of `CapabilityId`, and
 * `test/theme-tokens.test.ts` asserts both — a union that grew an aggregate
 * member would fail before anything rendered it.
 *
 * ## What this module is not
 *
 * It is not the domain's model of a retrieval contract. The domain owns what a
 * contract *is*, what evidence updates it and what the update is worth; this is
 * a label, a short spoken form and an ordering for a chip row. Nothing here is
 * imported by anything that decides anything.
 */

export const CAPABILITY_IDS = ['reading', 'meaning', 'listening', 'production', 'writing'] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export interface Capability {
  readonly id: CapabilityId;
  /** Chip label. Sentence case, one word where possible (REQ-UI-08: calm). */
  readonly label: string;
  /**
   * What the lens actually filters to, in a learner's words. Shown under a lens
   * row and used as the spoken description, so a screen reader user gets the
   * same disambiguation a sighted user gets from context.
   */
  readonly blurb: string;
  /** The Japanese label, for the surfaces that set their chrome in Japanese. */
  readonly japanese: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'reading',
    label: 'Reading',
    blurb: 'Seeing the written form and knowing how it sounds.',
    japanese: '読み',
  },
  {
    id: 'meaning',
    label: 'Meaning',
    blurb: 'Knowing what it means when you meet it.',
    japanese: '意味',
  },
  {
    id: 'listening',
    label: 'Listening',
    blurb: 'Catching it in speech, at speech speed.',
    japanese: '聴き取り',
  },
  {
    id: 'production',
    label: 'Production',
    blurb: 'Reaching for it yourself, in your own sentence.',
    japanese: '産出',
  },
  {
    id: 'writing',
    label: 'Writing',
    blurb: 'Writing the form by hand, stroke by stroke.',
    japanese: '書き',
  },
];

export function capabilityOf(id: CapabilityId): Capability {
  const found = CAPABILITIES.find((capability) => capability.id === id);
  if (found === undefined) throw new Error(`unknown capability '${id}'`);
  return found;
}
