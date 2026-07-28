import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { KanjiScreen } from '@/screens/kanji-screen';
import { importedStrokeSet } from '@/data/catalog';
import { strokeSvgFor } from '@/data/stroke-sources';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/kanji/:character` — the kanji page (controller §10 screen 3).
 *
 * The route is where the KanjiVG data is looked up, because
 * `src/data/stroke-sources.ts` can only be loaded by the bundler (it imports
 * `.svg` through the Metro transformer). Keeping that import here leaves
 * `KanjiScreen` renderable anywhere, which is what lets the parser and the
 * screen be reasoned about separately.
 *
 * ## Two tiers reach their strokes differently, and both are KanjiVG's
 *
 * The ten §8 fixture characters ship their **verbatim SVG text**, bundled by the
 * Metro transformer, and the screen parses it. That path is unchanged.
 *
 * The 1,241 imported characters cannot: their verbatim files are 4.7 MB, and
 * copying them into `apps/app` is forbidden outright (controller §4, DL-33 —
 * share-alike data is admitted into `packages/seed` and nowhere else). Their
 * geometry is extracted by the importer from those same committed bytes and
 * re-derived from them, stroke by stroke, by
 * `packages/seed/test/dictionary.test.ts`. So both paths render the licensor's
 * own drawing; they differ only in where the parse happened.
 *
 * The verbatim text wins when both exist, so nothing about the fixture tier's
 * rendering changes.
 */
export default function KanjiRoute(): ReactNode {
  const router = useRouter();
  const { character } = useLocalSearchParams<{ character: string }>();
  const resolved = typeof character === 'string' ? character : '';
  const svg = strokeSvgFor(resolved);

  return (
    <>
      {/* The character itself is the only useful thing a bookmark could say. */}
      <RouteTitle detail={resolved} href="/kanji/[character]" />
      <KanjiScreen
        character={resolved}
        onBack={() => router.replace('/')}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
        strokeSvg={svg}
        strokes={svg === null ? importedStrokeSet(resolved) : null}
      />
    </>
  );
}
