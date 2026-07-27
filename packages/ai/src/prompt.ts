/**
 * The one prompt family this build has (WP-07; REQ-AI-04, controller §9).
 *
 * Phase 0 makes exactly one bounded exchange (P0-CAP-10), so there is one
 * family and one version. Both are recorded on every candidate envelope and on
 * `CandidateAttached`, because a candidate whose prompt version is unknown
 * cannot be re-derived, compared, or retired — REQ-AI-04 requires the stored
 * item to carry "prompt/template version" for exactly that reason.
 *
 * ## What the prompt is allowed to contain
 *
 * Only `AiThreadContext`: the target form, one seeded excerpt, and the seed
 * reference. That is the "minimal thread context" of controller §9 and the
 * "minimum context for the requested operation" of REQ-ARCH-07. The learner's
 * own encounter text, their thread history, their promotion state, and their
 * uncertainty marks are all absent, and the request schema has no field that
 * could carry them.
 *
 * ## Why the instructions read the way they do
 *
 * Every constraint in the system prompt maps to a rule this project is already
 * bound by, so the prompt cannot ask for something the rest of the build then
 * has to refuse:
 *
 *   - no etymology (REQ-SRC-05 forbids generated etymology outright);
 *   - no claim about the learner and no grade (REQ-ARCH-04: candidates are not
 *     evidence, and nothing here may express a judgement of what they know);
 *   - no dictionary-completeness claim (controller §8: the seed is a seed);
 *   - the target form must appear in the answer, which is the deterministic
 *     check `targetFormPresent` then verifies independently.
 *
 * Bounding a model with prose is not a security boundary and is not treated as
 * one. It is the cheap first layer; the schema, the length ceilings, the
 * deterministic checks, and the evidence gate are the layers that actually
 * hold. A model that ignores all of this produces a response that fails
 * validation and takes the fallback route.
 */

import type { AiThreadContext } from './envelope.ts';

export const PROMPT_FAMILY_ID = 'bunki.candidate.bounded-explanation';

/**
 * Bump on any edit to the text below.
 *
 * The version is part of the input hash and is recorded on every candidate, so
 * changing the wording without changing this would make two different prompts
 * indistinguishable in the evidence log.
 */
export const PROMPT_VERSION = '2026-07-27.1';

/**
 * Default response ceiling.
 *
 * Sized for one short gloss *plus* the model's own reasoning, which the
 * configured model does by default and which counts against the same budget —
 * see `MAX_TOKENS_CEILING` in `./envelope.ts`. A caller that wants a tighter cap
 * passes one; nothing may exceed the ceiling.
 */
export const DEFAULT_MAX_TOKENS = 1500;

export const SYSTEM_PROMPT = [
  'You help a single learner of Japanese understand one word or phrase they have just met.',
  'Answer with one short explanation in English, at most about 120 words.',
  '',
  'Rules:',
  '- Write about the given target form only. Include the target form itself, in Japanese, in your answer.',
  '- Explain what it means and how it is used in the excerpt you are given.',
  '- Do not give etymology, character origin stories, or historical derivations.',
  '- Do not say anything about the learner, their level, their progress, or how well they know this.',
  '- Do not grade, score, rate, or assess anything.',
  '- Do not claim your answer is complete or authoritative, and do not cite a dictionary.',
  '- Do not add headings, lists, JSON, or any preamble. Return the explanation text only.',
].join('\n');

/**
 * The user turn.
 *
 * A pure function of the context, so the same context always produces the same
 * bytes — which is what makes `inputHash` a stable identity and what lets the
 * fixture tests compare request bodies exactly.
 */
export function buildUserPrompt(context: AiThreadContext): string {
  return [
    `Target form: ${context.targetForm}`,
    `It appears here: ${context.excerpt}`,
    '',
    'Explain the target form as it is used in that excerpt.',
  ].join('\n');
}

/**
 * The value `inputHash` is taken over.
 *
 * The prompt family and version are included, not just the context: the same
 * excerpt asked under a revised prompt is a different input, and a hash that
 * said otherwise would make a re-run of an old candidate look like a repeat of
 * the new one.
 */
export function hashableInputOf(context: AiThreadContext): {
  readonly promptFamilyId: string;
  readonly promptVersion: string;
  readonly context: AiThreadContext;
} {
  return { promptFamilyId: PROMPT_FAMILY_ID, promptVersion: PROMPT_VERSION, context };
}
