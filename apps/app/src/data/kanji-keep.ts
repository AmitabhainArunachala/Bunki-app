/**
 * Command builders for the kanji pages' Keep gesture (RENKAN R4-A, P2-18).
 *
 * Kept beside the other command adapters in `src/data/` (the golden source
 * builds its commands the same way) and deliberately free of React Native
 * imports, so the flow is testable in the plain Node unit runner without a
 * renderer. The component that renders the gesture is
 * `src/screens/kanji-keep.tsx`.
 */

import { findLexemeByHeadword } from './catalog.ts';
import type { CaptureCommand, UncertaintyDimension } from '../state/store.ts';

/** Which kanji surface the encounter happened on; travels in the source ref. */
export type KanjiPageTier = 'seed' | 'drift';

/**
 * Where a kanji-page Keep says it came from (REQ-SRC-01, T-15).
 *
 * The *encounter* is the learner's — they met the character and chose to keep
 * it — so the provenance mirrors the capture screen's manual entry: the
 * captured text is the single character of their encounter, owned by them. The
 * source ref is what differs: it names the page the gesture happened on, so an
 * export reader can tell a kanji-page keep from a typed search.
 */
export const KANJI_PAGE_PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

export const KANJI_PAGE_SOURCE_IDS: Readonly<Record<KanjiPageTier, string>> = {
  seed: 'seed-kanji-page',
  drift: 'drift-kanji-page',
};

/**
 * The exact capture command the panel dispatches, exported so the flow is
 * testable without a renderer (this project has no React Native test renderer;
 * see `test/kanji-capture.test.ts`).
 *
 * `lexemeId` is attached only when the character is itself a seed headword —
 * the same exact-match rule rehydration uses — never fuzzily, because linking a
 * thread to a different word than the learner kept is worse than no link.
 */
export function kanjiKeepCaptureCommand(
  character: string,
  tier: KanjiPageTier,
  uncertainty: UncertaintyDimension | null,
): CaptureCommand {
  const lexeme = findLexemeByHeadword(character);
  return {
    kind: 'capture',
    text: character,
    sourceRef: {
      sourceId: KANJI_PAGE_SOURCE_IDS[tier],
      kind: 'text',
      locator: `kanji:${character}`,
    },
    provenance: KANJI_PAGE_PROVENANCE,
    uncertainty,
    ...(lexeme === null ? {} : { lexemeId: lexeme.id }),
  };
}
