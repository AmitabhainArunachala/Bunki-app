import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { MapScreen } from '@/screens/map-screen';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/map` — the map (Campaign E, lane B1).
 *
 * A shell destination rather than a page reached from another screen, because
 * the map is where a learner *starts*: it is the surface that answers "what have
 * I built", and a starting place is exactly what `SHELL_DESTINATIONS` is for.
 *
 * The route stays thin, as every route in this app does. It owns navigation —
 * a node tap becomes a push to the word or kanji page — and nothing else; the
 * screen is renderable without a router, which is what lets it be reasoned about
 * and tested on its own.
 */
export default function MapRoute(): ReactNode {
  const router = useRouter();

  return (
    <>
      <RouteTitle href="/map" />
      <MapScreen
        onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
      />
    </>
  );
}
