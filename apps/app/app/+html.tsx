import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren, type ReactNode } from 'react';

/**
 * The HTML shell every statically exported page is rendered into (W5 P1-4).
 *
 * ## Why this file exists at all
 *
 * Only for the `<title>`. Every exported page shipped
 * `<title data-rh="true"></title>` — an empty title on all thirteen pre-rendered
 * routes, which meant blank browser tabs, blank bookmarks, blank history
 * entries, blank window-switcher entries, and nothing announced to a screen
 * reader on load. It was WCAG 2.4.2 Level A and the only axe violation across
 * eighteen scans.
 *
 * This shell supplies the title the *pre-rendered bytes* carry, before any
 * JavaScript has run. `RouteTitle` (src/ui/route-title.tsx) then names the
 * specific route once the app hydrates. Both halves are needed and neither is
 * redundant: a bookmark saved from a cold load gets the shell's title, and a tab
 * the learner is actually looking at gets the route's.
 *
 * Everything else here is expo-router's default shell, reproduced because
 * providing this file replaces it wholesale rather than extending it. The
 * `ScrollViewStyleReset` and the three meta tags are that default; removing any
 * of them changes layout, not just markup.
 */
export default function Root({ children }: PropsWithChildren): ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta content="width=device-width, initial-scale=1, shrink-to-fit=no" name="viewport" />
        {/*
          No `<title>` here on purpose. expo-router's static renderer emits its
          own `<title data-rh="true">` through react-helmet-async, and it emits
          it *first* — so a title element added here would be the second one in
          tree order and `document.title` (and axe, and the browser tab) would
          keep reading the empty helmet element instead. The title is set through
          `RouteTitle`, which fills that helmet element rather than competing
          with it.
        */}
        <ScrollViewStyleReset />
        {/*
          The washi ground (Drift fusion §4). The body carries the theme's
          paper colour — set statically to the 北斎 prerender ground here and
          kept in sync by ThemeProvider once hydrated — and a laid-line
          texture (簀の目 every 4px, chain lines every 96px) drawn behind the
          content at ≤4% alpha: visible as paper grain under raking light,
          never as pattern. `z-index: -1` keeps it over the body's own
          background paint but under everything the app renders, and
          `pointer-events: none` means it can never eat a tap.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
body { background-color: #FBFAF5; }
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    repeating-linear-gradient(0deg, rgba(120,100,80,0.04) 0 1px, transparent 1px 4px),
    repeating-linear-gradient(90deg, rgba(120,100,80,0.03) 0 1px, transparent 1px 96px);
}
`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
