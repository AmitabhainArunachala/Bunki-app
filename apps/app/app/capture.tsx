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
 * ## `?from=` names the way back; `router.back()` takes it
 *
 * Two halves, and they do different jobs. `?from=` is what lets the control on
 * the screen say *"Done — back to 地図 Map"* rather than a generic "back", which
 * matters because the browser's own Back button is not a thing a learner reaches
 * for on a phone. The *navigation* is `router.back()`, which pops the pushed
 * entry.
 *
 * That split was measured rather than chosen. `router.replace(from)` reads more
 * directly and it left screens mounted: five capture round trips from the map
 * grew the mounted map screens from two to six, because `replace` swaps the
 * current entry for a *new* instance of the destination rather than returning to
 * the one already on the stack. Each of those was a live map screen subscribed
 * to the store and re-rendered on every write — finding T3-2's exact shape,
 * reintroduced by the new action. `adv-known-defects.spec.ts` pins the round
 * trip at a flat count.
 *
 * `canGoBack()` guards the case with no stack to pop — a typed URL, a bookmark,
 * a share — where the way back is `?from=` if it is trustworthy and the map
 * otherwise. The map is the front door and never the wrong answer.
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
        onDone={() => {
          if (router.canGoBack()) router.back();
          else router.replace(back);
        }}
        onOpenEvidence={() => router.push('/evidence')}
        onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
        onOpenReading={() => router.push('/read')}
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
        returnTo={back}
      />
    </>
  );
}
