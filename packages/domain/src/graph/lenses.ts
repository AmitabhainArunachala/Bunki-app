/**
 * Capability lenses (Campaign E / A2; REQ-UI-07, REQ-LM-02, REQ-LM-03).
 *
 * REQ-UI-07: the Observatory *"must never collapse reading/meaning/listening/
 * production/writing contracts into one mastery light: capability lenses or
 * distinct marks preserve stability, retrievability, uncertainty, and
 * coverage."* This file is the first half of that sentence — the five lenses —
 * and `retrievability.ts` is the second.
 *
 * ## Why the mapping is data and why one lens is empty
 *
 * The five lenses are the *learner-facing* names REQ-UI-07 uses. The kernel
 * schedules `RETRIEVAL_SKILLS`, which is a different list for a good reason
 * (REQ-LM-02: labels are product labels, not orthogonal axes; scheduling stays
 * per contract). So the mapping between them has to be written down somewhere,
 * and written down as data, so that a reader can check it rather than infer it
 * from a `switch`.
 *
 * Two consequences are deliberate and neither is a gap to be filled by
 * guessing:
 *
 * **`writing` maps to nothing.** Phase 0 has no handwriting or kanji-
 * construction contract skill, and REQ-LM-02 says handwriting is surfaced *only
 * when activated*. So every node reports `writing` as `unknown`, forever, until
 * a contract skill exists for it. That is the honest answer. Folding writing
 * into `reading` because both involve orthography would make a learner who has
 * never written a stroke look like a learner who writes fluently.
 *
 * **`discrimination` maps to no lens.** It is REQ-LM-02's capability 8 and it
 * is not one of REQ-UI-07's five. Putting it under `meaning` would make a
 * contrast contract's evidence read as meaning evidence, which is exactly the
 * collapse REQ-UI-07 forbids, one level down. It is listed in
 * {@link SKILLS_OUTSIDE_THE_FIVE_LENSES} so it is visibly excluded rather than
 * quietly lost, and a surface that wants it can read the contracts directly.
 */

import type { RetrievalSkill } from '../contracts/retrieval-contract.ts';

/** REQ-UI-07's five, in the order the requirement names them. */
export const CAPABILITY_LENSES = [
  'reading',
  'meaning',
  'listening',
  'production',
  'writing',
] as const;

export type CapabilityLens = (typeof CAPABILITY_LENSES)[number];

/**
 * Which scheduled skills each lens is allowed to read.
 *
 * A lens is a *view over contracts*; it never aggregates across lenses, and no
 * skill appears under two lenses. Both properties are asserted in
 * `test/graph/lenses.test.ts`, because either one failing would silently
 * reintroduce a single mastery light under a different name.
 */
export const LENS_SKILLS: Readonly<Record<CapabilityLens, readonly RetrievalSkill[]>> =
  Object.freeze({
    reading: Object.freeze(['orthography_to_reading'] as const),
    meaning: Object.freeze(['form_to_meaning'] as const),
    listening: Object.freeze(['audio_to_meaning'] as const),
    production: Object.freeze(['meaning_to_production'] as const),
    writing: Object.freeze([] as const),
  });

/**
 * Skills the five lenses deliberately do not cover.
 *
 * Exported so the exclusion is inspectable. A test asserts this list plus the
 * union of `LENS_SKILLS` covers `RETRIEVAL_SKILLS` exactly, so a skill added
 * later cannot fall through the floor unnoticed.
 */
export const SKILLS_OUTSIDE_THE_FIVE_LENSES: readonly RetrievalSkill[] = Object.freeze([
  'discrimination',
]);

const LENS_BY_SKILL: ReadonlyMap<RetrievalSkill, CapabilityLens> = new Map(
  CAPABILITY_LENSES.flatMap((lens) => LENS_SKILLS[lens].map((skill) => [skill, lens] as const)),
);

/** The lens a scheduled skill shows under, or `null` if it shows under none. */
export function lensForSkill(skill: RetrievalSkill): CapabilityLens | null {
  return LENS_BY_SKILL.get(skill) ?? null;
}

/**
 * Why `writing` is always unknown in Phase 0, in the words a surface renders.
 *
 * Kept next to the mapping it explains so a legend cannot drift from the data.
 */
export const WRITING_LENS_DISCLOSURE =
  'Writing has no contract in this build, so nothing has been observed about it. This is “not measured”, not “not known”.';

/**
 * The rule this whole module exists to keep, in one sentence.
 *
 * Rendered verbatim by the map's legend. If a surface ever needs to explain why
 * there is no single number, this is the explanation, and it lives with the code
 * that makes it true rather than in a design file.
 */
export const NO_COLLAPSED_LIGHT_RULE =
  'Reading, meaning, listening, production and writing are measured separately and never averaged. There is no single score for a word, a kanji, or a learner.';
