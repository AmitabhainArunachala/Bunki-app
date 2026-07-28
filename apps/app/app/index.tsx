import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { MapScreen } from '@/screens/map-screen';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/` — the map, and the app's front door (Wave D).
 *
 * It used to be capture. The argument for the swap is in `src/ui/navigation.ts`
 * §1 and it is the round-2 research's own: the map is the only surface that
 * answers "what have I built" rather than "what do I owe", and a learner who
 * opens the app to a search box is asked to do work before being shown anything
 * they own. Capture is at `/capture` and is offered as an action from every
 * surface, which is what it always was in use.
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
      <RouteTitle href="/" />
      <MapScreen
        onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
      />
    </>
  );
}
