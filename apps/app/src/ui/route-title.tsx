import Head from 'expo-router/head';
import { type ReactNode } from 'react';

import { DESTINATIONS } from './navigation.ts';

/**
 * The document title for one route (WCAG 2.4.2 Level A).
 *
 * The root layout mounts this outside AppProvider, whose asynchronous storage
 * boot otherwise suppresses all route metadata during static export. Individual
 * routes add the resolved word or character after boot. Expo's Head keeps a
 * hidden stacked screen from replacing the active screen's title.
 *
 * Labels come from the navigation map, which is checked against route files by
 * navigation-reachability.test.ts. The exported HTML and hydrated titles are
 * exercised separately in the browser suites.
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
  const label = href === '/+not-found' ? 'Page not found' : (destination?.label ?? null);
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
