import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren, type ReactNode } from 'react';

/**
 * The static HTML shell preserves Expo's metadata and scroll defaults and adds
 * the app's deep-link recovery and paper background. RouteTitle in _layout
 * provides application route metadata before the asynchronous store opens.
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
          keep reading the empty helmet element instead. The root layout mounts
          `RouteTitle` outside AppProvider so export can fill the helmet element
          before any storage effects run.
        */}
        <ScrollViewStyleReset />
        {/*
          Deep links on a static host (one-app convergence §5). GitHub Pages
          serves ONE site-root 404 for every miss; it cannot serve this app's
          own fallback. So the site 404 stores the requested path in
          sessionStorage and replaces to /app/, and this script — running
          before the bundle boots — puts the real path back with
          `history.replaceState`, so expo-router wakes up on the deep route
          the learner actually asked for. A no-op everywhere the key is absent.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="bunki-deep-link",p=sessionStorage.getItem(k);if(p){sessionStorage.removeItem(k);history.replaceState(null,"",p);}}catch(e){}})();`,
          }}
        />
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
