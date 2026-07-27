import Head from 'expo-router/head';
import { type ReactNode } from 'react';

import { DESTINATIONS } from './navigation.ts';

/**
 * The document title for one route (W5 P1-4; WCAG 2.4.2 Level A).
 *
 * ## The defect this closes
 *
 * Every exported page shipped `<title data-rh="true"></title>` — an empty title
 * element on all thirteen pre-rendered routes. The consequences are not
 * theoretical and they are not only about assistive technology: blank browser
 * tabs, blank bookmarks, blank history entries, blank window-switcher entries,
 * and a screen-reader user who hears nothing when the page loads. It was the
 * only axe violation across eighteen scans (`adv-a11y-audit.spec.ts`), and it
 * was Level A — the floor, not the stretch.
 *
 * ## Why `Head` and not `Stack.Screen options.title`
 *
 * `options.title` reaches `document.title` at runtime, after hydration. The
 * defect is in the *pre-rendered* bytes: a static export that a browser has not
 * yet hydrated still has to name itself, because a bookmark or a slow load is
 * exactly when a person needs the tab to say what it is. `expo-router/head`
 * renders through react-helmet-async, which is what writes the `data-rh` title
 * into the exported HTML — so fixing it there fixes both the static bytes and
 * the hydrated page. (`Head` renders only when its route is focused, which is
 * what keeps a stacked-but-hidden screen from stealing the title.)
 *
 * ## Why the label comes from the navigation map
 *
 * `DESTINATIONS` already names every route, and `navigation-reachability.test.ts`
 * already checks that table against the filesystem. Sourcing titles from it
 * means a new route cannot arrive with no title, and a renamed destination
 * cannot leave a stale title behind — the two ways this defect would otherwise
 * come back. A literal string per route file would have neither property.
 */
export interface RouteTitleProps {
  /** The destination's `href` in {@link DESTINATIONS}, dynamic segments included. */
  readonly href: string;
  /**
   * What this particular instance of a dynamic route is about — the headword,
   * the character. Two word pages that both say "Word" are a correct title and
   * a useless bookmark.
   */
  readonly detail?: string | undefined;
}

/** The product name, in both scripts, as it appears in the masthead. */
const SUFFIX = 'Bunki 分岐';

export function titleFor(href: string, detail?: string | undefined): string {
  const destination = DESTINATIONS.find((entry) => entry.href === href);
  // Falling back to the suffix alone rather than to an empty string: an unknown
  // route is a bug, but a page named "Bunki 分岐" is still a page that names
  // itself, and shipping the empty title again would be the worse failure.
  const label = destination?.label ?? null;
  const subject = detail !== undefined && detail !== '' ? `${label ?? 'Page'} — ${detail}` : label;
  return subject === null ? SUFFIX : `${subject} · ${SUFFIX}`;
}

export function RouteTitle({ href, detail }: RouteTitleProps): ReactNode {
  return (
    <Head>
      <title>{titleFor(href, detail)}</title>
    </Head>
  );
}
