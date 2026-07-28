import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { CaptureScreen } from '@/screens/capture-screen';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/` — capture and search (controller §10 screen 1).
 *
 * The route owns navigation and nothing else; the screen takes callbacks so it
 * can be rendered without a router. `?q=` seeds the query so the evidence
 * harness can land on a state directly, and so a search is a shareable URL.
 */
export default function CaptureRoute(): ReactNode {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();

  return (
    <>
      <RouteTitle href="/" />
      <CaptureScreen
        initialQuery={typeof q === 'string' ? q : ''}
        onOpenEvidence={() => router.push('/evidence')}
        onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
        onOpenReading={() => router.push('/read')}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
      />
    </>
  );
}
