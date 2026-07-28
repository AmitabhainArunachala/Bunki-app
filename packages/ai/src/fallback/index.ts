/**
 * Serving the scripted fallback (WP-07; controller §9, T-10, T-11).
 *
 * The fallback is not an error path with a nicer face on it. It produces a
 * *complete, valid candidate envelope* — same schema, same deterministic
 * checks, same candidate id minted from the same injected id source — because
 * everything downstream of this module must be unable to tell which route ran
 * except by reading the label. If the fallback produced a differently-shaped
 * value, every consumer would grow a branch, and the branch a screen forgot
 * would be the one that renders a fixture as a live answer.
 *
 * What differs, and only this, is `provider`. It is `offline-fallback`, which
 * flows into `CandidateAttached.envelope.provider`, into the export, and into
 * the evidence inspector — so "was this live?" is answerable from the log
 * afterwards, not just from the screen at the time.
 */

import {
  parseAiCandidateEnvelope,
  targetFormPresent,
  type AiCandidateEnvelope,
  type AiRequestEnvelope,
} from '../envelope.ts';
import { OFFLINE_FALLBACK_PROVIDER } from '../labels.ts';
import { fallbackFixtureFor } from './fixtures.ts';

export {
  FALLBACK_EXCERPTS,
  FALLBACK_FIXTURES,
  FALLBACK_TARGET_FORMS,
  fallbackFixtureFor,
  type FallbackCandidateFixture,
} from './fixtures.ts';

/** Identifies the fixture set in the envelope's `model` field. Bump when they change. */
export const FALLBACK_MODEL_ID = 'scripted-fixture@2026-07-27';

/**
 * The text used when no fixture covers the requested form.
 *
 * Serving *something* still beats serving nothing: the learner needs to know the
 * route was unavailable and that the app is otherwise working (T-10). What it
 * must not do is invent an explanation, so it says exactly what it knows —
 * which is nothing about this word.
 */
export function noFixtureText(targetForm: string): string {
  return `No pre-written note covers ${targetForm}, and the AI route was unavailable, so there is nothing to show here. Everything else — saving, looking up, reviewing and exporting — works without it.`;
}

export interface FallbackContext {
  /** Injected clock; the fallback is as deterministic as the rest of the kernel. */
  readonly now: () => string;
  readonly nextCandidateId: () => string;
}

/**
 * Build a fixture-served candidate for one request.
 *
 * Never throws for a missing fixture — an unavailable route that then failed
 * would leave the caller with two problems and the learner with none of the
 * loop (T-10 is precisely the requirement that the rest keeps working).
 */
export function serveFallbackCandidate(
  request: AiRequestEnvelope,
  context: FallbackContext,
): AiCandidateEnvelope {
  const { targetForm } = request.threadContext;
  const fixture = fallbackFixtureFor(targetForm);
  const payload = {
    targetForm,
    explanation: fixture?.explanation ?? noFixtureText(targetForm),
  };

  return parseAiCandidateEnvelope({
    candidateId: context.nextCandidateId(),
    payload,
    model: FALLBACK_MODEL_ID,
    provider: OFFLINE_FALLBACK_PROVIDER,
    promptVersion: request.promptVersion,
    createdAt: context.now(),
    checks: {
      // Computed, not assumed. The no-fixture text does contain the form, but
      // asserting that rather than checking it would make the one envelope
      // field a reader most needs to trust the one field nobody verified.
      targetFormPresent: targetFormPresent(payload),
      isLabeled: true,
    },
  });
}

/** True when this envelope came from the scripted fixtures rather than a provider. */
export function isOfflineFallback(envelope: AiCandidateEnvelope): boolean {
  return envelope.provider === OFFLINE_FALLBACK_PROVIDER;
}
