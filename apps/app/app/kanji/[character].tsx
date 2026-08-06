import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { findKanjiByCharacter } from '@/data/catalog';
import { driftKanjiInfo } from '@/data/drift-lexicon';
import { DriftKanjiScreen } from '@/screens/drift-kanji-screen';
import { KanjiScreen } from '@/screens/kanji-screen';
import { strokeSvgFor } from '@/data/stroke-sources';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/kanji/:character` — the kanji page (controller §10 screen 3).
 *
 * The route is where the KanjiVG text is looked up, because
 * `src/data/stroke-sources.ts` can only be loaded by the bundler (it imports
 * `.svg` through the Metro transformer). Keeping that import here leaves
 * `KanjiScreen` renderable anywhere, which is what lets the parser and the
 * screen be reasoned about separately.
 */
export default function KanjiRoute(): ReactNode {
  const router = useRouter();
  const { character } = useLocalSearchParams<{ character: string }>();
  const resolved = typeof character === 'string' ? character : '';

  // Seed first (ten curated kanji, stroke-order animation); any other
  // character the Drift tier can render falls through to its page
  // (BUNKI_ONE_APP_CONVERGENCE_SPEC_2026-08-06.md §2).
  if (findKanjiByCharacter(resolved) === null && driftKanjiInfo(resolved) !== null) {
    return (
      <>
        <RouteTitle detail={resolved} href="/kanji/[character]" />
        <DriftKanjiScreen
          character={resolved}
          onBack={() => router.push('/')}
          onOpenKanji={(next) => router.push(`/kanji/${encodeURIComponent(next)}`)}
          onOpenWord={(headword) => router.push(`/word/${encodeURIComponent(headword)}`)}
        />
      </>
    );
  }

  return (
    <>
      {/* The character itself is the only useful thing a bookmark could say. */}
      <RouteTitle detail={resolved} href="/kanji/[character]" />
      <KanjiScreen
        character={resolved}
        onBack={() => router.push('/')}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
        strokeSvg={strokeSvgFor(resolved)}
      />
    </>
  );
}
