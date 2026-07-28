/**
 * The candidate UI slice (WP-07).
 *
 * `apps/app`'s half of the bounded AI path: what may be sent (OD-08), what the
 * labels say (T-12), how a request is wired to a component's lifecycle, and the
 * panel that renders it.
 *
 * ## Why this lives in `src/candidate/` rather than `src/screens/`
 *
 * A candidate panel is not a screen — it is a block a page embeds — and
 * `apps/app/test/screen-contract.test.ts` pins `src/screens/` to exactly the
 * three files WP-05 owns. Adding a fourth entry there would have meant editing
 * another builder's test in the same wave they are working in it, to add
 * something that is not a screen. A sibling directory keeps this slice
 * single-writer, leaves that contract untouched, and stays inside every scan
 * that matters: `screen-contract.test.ts` walks all of `src/`, so the boundary,
 * index-name and forbidden-claim checks cover these files exactly as they cover
 * the screens.
 */

export {
  NO_SEEDED_CONTEXT_NOTE,
  passageSentences,
  seededContentPolicy,
  seededContextFor,
} from './candidate-context.ts';
export {
  createCandidateClock,
  createCandidateRouteRing,
  createCandidateRuntime,
  hasApiKey,
  type CandidateRuntimeOptions,
} from './candidate-runtime.ts';
export {
  CANDIDATE_ACCEPT_NOTE,
  CANDIDATE_LABEL,
  CANDIDATE_STANDING_NOTE,
  OFFLINE_FALLBACK_LABEL,
  OFFLINE_FALLBACK_STANDING_NOTE,
  OFFLINE_PANEL_NOTE,
  checkLine,
  isOfflineFallbackCandidate,
  labelsFor,
  originLine,
  statusLine,
  type CandidateLabels,
  type CandidatePanelState,
} from './candidate-view-model.ts';
export {
  useCandidate,
  type UseCandidateOptions,
  type UseCandidateResult,
} from './use-candidate.ts';
export { CandidatePanel, type CandidatePanelProps } from './candidate-panel.tsx';
