import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { CaptureScreen } from '@/screens/capture-screen';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/capture` — capture and search (controller §10 screen 1).
 *
 * ## Why it is a route and not a modal
 *
 * `src/ui/navigation.ts` §2 has the argument in full. The short version: a modal
 * drawn over a live surface leaves every control behind it focusable, and making
 * them not-focusable means `aria-hidden` over a subtree containing the tab bar,
 * which is the defect `aria-hidden-focus` is named for. A route push restores
 * the previous surface exactly and is addressable — `?q=` makes a search a
 * shareable URL, and the evidence harness uses it to land on a state directly.
 *
 * ## `?from=`
 *
 * The shell's capture action records the surface it was opened from. Capture
 * then offers the way back **in words** rather than relying on the browser's
 * Back button, which is not a thing a learner reaches for on a phone. When it is
 * absent — a typed URL, a bookmark, a share — the way back is the map, which is
 * the front door and never the wrong answer.
 */
export default function CaptureRoute(): ReactNode {
  const router = useRouter();
  const { q, from } = useLocalSearchParams<{ q?: string; from?: string }>();

  // Only in-app paths, and only ones this app actually has. An unchecked
  // `?from=` is an open redirect written by hand; `startsWith('/')` alone would
  // still accept `//evil.example`, which a browser reads as protocol-relative.
  const back =
    typeof from === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(from) && !from.startsWith('//')
      ? from
      : '/';

  return (
    <>
      <RouteTitle href="/capture" />
      <CaptureScreen
        initialQuery={typeof q === 'string' ? q : ''}
        onDone={() => router.replace(back)}
        onOpenEvidence={() => router.push('/evidence')}
        onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
        onOpenReading={() => router.push('/read')}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
        returnTo={back}
      />
    </>
  );
}
