/**
 * What a candidate looks like on screen, as data (WP-07; T-12's structural
 * half, REQ-UI-09).
 *
 * The panel component below this is deliberately thin, because the part of
 * T-12 that can actually be proven without a browser is *what the labels say
 * and when they appear* — and that is a function, not a render. Everything here
 * is pure and is driven directly by `test/candidate-labeling.test.ts`; the
 * end-to-end half (that the label is visible in the DOM of the exported web
 * build) is WP-10's, which owns `apps/app/e2e/`.
 *
 * ## The labelling rule, in one place
 *
 * Every candidate carries `CANDIDATE_LABEL`. A fixture-served one carries
 * `OFFLINE_FALLBACK_LABEL` *as well* — never instead. There is no branch in
 * which a label is absent: `labelsFor` returns the primary label
 * unconditionally, so a caller cannot render a candidate without one by taking
 * a path nobody tested.
 *
 * All strings come from `@bunki/ai`, which is the package that knows what a
 * candidate is. Retyping them here is what lets "AI candidate" drift into "AI
 * explanation" one refactor later, and the difference between those two
 * phrasings is the whole claim (`test/candidate-labeling.test.ts` asserts no
 * screen holds a literal).
 */

import {
  CANDIDATE_ACCEPT_NOTE,
  CANDIDATE_LABEL,
  CANDIDATE_STANDING_NOTE,
  OFFLINE_FALLBACK_LABEL,
  OFFLINE_FALLBACK_PROVIDER,
  OFFLINE_FALLBACK_STANDING_NOTE,
} from '@bunki/ai';

import type { CandidateView } from '../state/store.ts';

export {
  CANDIDATE_ACCEPT_NOTE,
  CANDIDATE_LABEL,
  CANDIDATE_STANDING_NOTE,
  OFFLINE_FALLBACK_LABEL,
  OFFLINE_FALLBACK_STANDING_NOTE,
};

/**
 * The four REQ-UI-09 states, plus the two this panel genuinely has beyond them.
 *
 * `idle` is not "empty": nothing has been asked for yet, and a panel that
 * showed an empty state before the learner asked would report an absence that
 * is not one. `unavailable` is the OD-08 case — this word has no seeded
 * sentence, so there is nothing we may send.
 */
export type CandidatePanelState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly candidate: CandidateView }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string; readonly detail: string };

export interface CandidateLabels {
  /** Always present. */
  readonly primary: string;
  /** `offline-fallback`, or null for a live candidate. */
  readonly secondary: string | null;
  /** One sentence explaining what the learner is looking at. */
  readonly standingNote: string;
  /** The spoken label, for a screen reader that cannot see the badges. */
  readonly accessibilityLabel: string;
}

export function isOfflineFallbackCandidate(candidate: CandidateView): boolean {
  return candidate.envelope.provider === OFFLINE_FALLBACK_PROVIDER;
}

export function labelsFor(candidate: CandidateView): CandidateLabels {
  const fallback = isOfflineFallbackCandidate(candidate);
  return {
    primary: CANDIDATE_LABEL,
    secondary: fallback ? OFFLINE_FALLBACK_LABEL : null,
    standingNote: fallback ? OFFLINE_FALLBACK_STANDING_NOTE : CANDIDATE_STANDING_NOTE,
    accessibilityLabel: fallback
      ? `${CANDIDATE_LABEL}, ${OFFLINE_FALLBACK_LABEL}. ${OFFLINE_FALLBACK_STANDING_NOTE}`
      : `${CANDIDATE_LABEL}. ${CANDIDATE_STANDING_NOTE}`,
  };
}

/**
 * Where this candidate came from, in one line.
 *
 * The same four facts the event log keeps — provider, model, prompt version,
 * task class — rendered rather than summarised, so what the learner reads and
 * what the evidence inspector shows cannot disagree.
 */
export function originLine(candidate: CandidateView): string {
  const { provider, model, promptVersion, taskClass } = candidate.envelope;
  return `${provider} · ${model} · prompt ${promptVersion} · route ${taskClass}`;
}

/**
 * What the deterministic check found (REQ-AI-04).
 *
 * Rendered either way. A check that is only mentioned when it passes is a
 * badge, not a check — and the failing case is the one a reader most needs,
 * because it means the text may be about something other than the word.
 */
export function checkLine(candidate: CandidateView): string {
  return candidate.envelope.checks.targetFormPresent
    ? 'Automatic check: the note contains the word it is about.'
    : 'Automatic check failed: the note does not contain the word it is about, so it may be off-target.';
}

/** What the learner has done with it so far. Never a claim about the text. */
export function statusLine(candidate: CandidateView): string {
  return candidate.status === 'accepted'
    ? `Kept as your note at ${candidate.acceptedAt ?? 'an unrecorded time'}. It stays labelled as generated.`
    : 'Not kept. Nothing about this note is in your record yet.';
}

/**
 * The offline banner text for this panel.
 *
 * Rendered only when connectivity is *known* to be offline — the shell's rule
 * (`src/ui/screen-state.tsx`), applied here because a panel embedded in a page
 * does not get the shell's banner.
 */
export const OFFLINE_PANEL_NOTE =
  'You are offline. Asking for a note will use the app’s own pre-written text instead of a live model, and it will say so.';
