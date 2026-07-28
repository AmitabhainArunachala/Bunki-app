import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { JourneyScreen } from '@/screens/journey-screen';
import { createRuntimeContext } from '@/state/runtime';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/journey` — the branch point (Campaign E, lane B5).
 *
 * The route owns navigation and nothing else; the screen takes callbacks so it
 * can be rendered without a router.
 *
 * The `context` is used for one thing: the instant recorded when a road is
 * taken, which the rejoin criterion compares every later answer against. The
 * screen appends nothing to the log, so this context never reaches an event
 * factory from here.
 */
const context = createRuntimeContext();

export default function JourneyRoute(): ReactNode {
  const router = useRouter();

  return (
    <>
      <RouteTitle href="/journey" />
      <JourneyScreen
        context={context}
        onBack={() => router.replace('/')}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
      />
    </>
  );
}
