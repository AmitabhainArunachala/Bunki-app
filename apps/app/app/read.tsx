import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { ReadingScreen } from '@/screens/reading-screen';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/read` — the reading surface (Campaign E, lane B4).
 *
 * The route owns navigation and nothing else, which on this screen is the whole
 * point: the reading surface's contract is that a lookup and a capture cost no
 * navigation at all, so the *only* callback it takes is the deliberate exit to
 * a word page. There is nothing else here for a router to do.
 */
export default function ReadingRoute(): ReactNode {
  const router = useRouter();

  return (
    <>
      <RouteTitle href="/read" />
      <ReadingScreen
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
      />
    </>
  );
}
