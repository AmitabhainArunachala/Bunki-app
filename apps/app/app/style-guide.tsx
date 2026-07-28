import { type ReactNode } from 'react';

import { strokeSvgFor } from '@/data/stroke-sources';
import { RouteTitle } from '@/ui/route-title';
import { SPECIMEN_KANJI } from '@/ui/style-guide/specimen-content';
import { StyleGuidePage } from '@/ui/style-guide/style-guide-page';

/**
 * Route `/style-guide` — the design specimen (Campaign E, lane A1).
 *
 * A development surface rather than a learner destination: it is on the map in
 * `src/ui/navigation.ts` (every route must be, or the reachability test fails
 * and rightly so) but declares `reach: { kind: 'specimen' }`, which keeps it out
 * of the navigation shell. The shell holds the places a learner *starts* from,
 * and a specimen is not one of them — putting it there would make the shell a
 * debug menu, the exact thing REQ-UI-08 and that file's own header argue
 * against. (This comment used to name the shell's size. It went stale the day
 * Campaign E added the map; the size is `SHELL_DESTINATIONS.length` and is not
 * written down in prose anywhere now.)
 *
 * The KanjiVG text is looked up here, for the same reason the kanji route does
 * it: `src/data/stroke-sources.ts` is loadable only by the bundler, and keeping
 * that import at the route leaves the page renderable anywhere.
 */
export default function StyleGuideRoute(): ReactNode {
  return (
    <>
      <RouteTitle href="/style-guide" />
      <StyleGuidePage strokeSvg={strokeSvgFor(SPECIMEN_KANJI)} />
    </>
  );
}
