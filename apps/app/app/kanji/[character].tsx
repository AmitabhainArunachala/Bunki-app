import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { KanjiScreen } from '@/screens/kanji-screen';
import { strokeSvgFor } from '@/data/stroke-sources';

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

  return (
    <KanjiScreen
      character={resolved}
      onBack={() => router.push('/')}
      onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
      strokeSvg={strokeSvgFor(resolved)}
    />
  );
}
