/**
 * `src/ui/guide/` — the 案内人's surface (Campaign E / B6).
 *
 * The kernel half is `packages/domain/src/guide/`; this is what a learner sees
 * of it. Nothing here executes a command, and nothing here can: there is no
 * `store.execute` in this directory and `test/guide-boundary.test.ts` asserts
 * the absence rather than trusting it.
 */

export { GUIDE_PROMPTS, LAYER_ATTRIBUTION_NOTE, ROUTE_CANDIDATES } from './guide-content.ts';
export { progressFromSnapshot, progressWord, takenUpWaypointIds } from './guide-progress.ts';
export * from './guide-view-model.ts';
export { GuideBoundaryPanel } from './guide-boundary.tsx';
export { GuideConversationPanel } from './guide-conversation.tsx';
export { GuideEstimatePanel, GuideHistoryPanel, GuidePlanPanel } from './guide-records.tsx';
export { GuideRoad } from './guide-road.tsx';
export { GuideSpeech } from './guide-speech.tsx';
export { useGuide, type TurnSpeech, type UseGuideResult } from './use-guide.ts';
export { sendableOf, type GuidePromptWithId } from './guide-types.ts';
