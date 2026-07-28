/**
 * The app's navigation map (WP-10).
 *
 * ## Why a map exists at all
 *
 * Two verifier passes recorded the same P2 twice: screens existed in the tree
 * that no running app could reach. The definition-of-done calls that failure by
 * name — "tests pass but the app doesn't" — and it blocks T-17, because an
 * automated loop can only walk paths a person could walk. A route file is not a
 * path; a route file nothing links to is a page with no door.
 *
 * So reachability is data here rather than an emergent property of nine route
 * files. Every destination declares **how it is reached**, and
 * `test/navigation-reachability.test.ts` walks this table against the filesystem
 * and against the source of the screen said to link to it. A destination that
 * lies about its door fails the test; a route file absent from this table fails
 * the test; a screen no route renders fails the test. That is the whole point:
 * the claim "every screen is reachable" is checkable rather than asserted.
 *
 * ## Why some destinations are in the shell and most are not
 *
 * REQ-UI-08 asks for calm, typographic surfaces with generous ma. A navigation
 * bar listing every destination is a debug menu with better fonts, and it would
 * also be *wrong* about the product: a word page is about a particular word, and
 * a canvas is about a particular session. Those are reached from the thing they
 * belong to. What belongs in a persistent shell is the small set of places a
 * learner *starts* from, which is why most destinations declare a parent.
 *
 * {@link SHELL_DESTINATIONS} currently holds five — capture, session, evidence,
 * about & diagnostics, and the map, which Campaign E added. The count is
 * deliberately not repeated in prose here or anywhere else that renders it: the
 * previous version of this comment said "four entries" in two places and
 * `app/style-guide.tsx` said it in a third, and all three were still saying four
 * after the map landed. The list is derived by filter below, so the number is
 * `SHELL_DESTINATIONS.length` and a reader who wants it can count the table.
 */

/** How a learner arrives at a destination. */
export type Reach =
  /** Listed in the persistent navigation shell. */
  | { readonly kind: 'shell' }
  /**
   * A development surface, reached by typing its URL.
   *
   * Campaign E adds the design specimen (`/style-guide`), which is a real route
   * and so must be on this map — a route file absent from the table fails the
   * reachability test, and that rule is worth more than the convenience of an
   * exemption. But it is not a place a learner goes, so it is not in the shell
   * and it is not counted among the screens controller §10 names. `specimen`
   * is that distinction, stated rather than implied: `LEARNER_DESTINATIONS`
   * excludes it, and the reachability test asserts it stays out of the shell.
   */
  | { readonly kind: 'specimen' }
  /**
   * Reached from another screen, which must contain the link.
   *
   * `from` is a path under `apps/app/`, and `via` names the callback prop or the
   * literal the reachability test looks for in that file. Naming the mechanism
   * rather than just the parent is what keeps the test from passing on a screen
   * that merely mentions the destination in a comment.
   */
  | { readonly kind: 'from'; readonly from: string; readonly via: string };

export interface Destination {
  /** The expo-router href. Dynamic segments appear as `[param]`. */
  readonly href: string;
  /** Route file, relative to `apps/app/app/`. */
  readonly routeFile: string;
  /** The screen module this route renders, relative to `apps/app/src/`. */
  readonly screen: string;
  /** Short label. Sentence case; no title case, no ALL CAPS (REQ-UI-08). */
  readonly label: string;
  /** One line of orientation, shown under the label in the shell. */
  readonly blurb: string;
  readonly reach: Reach;
}

/**
 * Every screen in the app, with its route and its door.
 *
 * Ordered as the loop is walked (REQ-PH-01): capture, look it up, ask for a
 * candidate, sit a session, meet it in context, repair, inspect, export, and the
 * diagnostic surface last.
 */
export const DESTINATIONS: readonly Destination[] = [
  {
    href: '/',
    routeFile: 'index.tsx',
    screen: 'screens/capture-screen.tsx',
    label: 'Capture',
    blurb: 'Paste or search an encounter. Saving is one gesture.',
    reach: { kind: 'shell' },
  },
  {
    href: '/word/[lexemeId]',
    routeFile: 'word/[lexemeId].tsx',
    screen: 'screens/word-screen.tsx',
    label: 'Word',
    blurb: 'The layered word page, with its AI candidate panel.',
    reach: { kind: 'from', from: 'src/screens/capture-screen.tsx', via: 'onOpenWord' },
  },
  {
    href: '/kanji/[character]',
    routeFile: 'kanji/[character].tsx',
    screen: 'screens/kanji-screen.tsx',
    label: 'Kanji',
    blurb: 'Strokes and components for one character.',
    reach: { kind: 'from', from: 'src/screens/capture-screen.tsx', via: 'onOpenKanji' },
  },
  {
    href: '/session',
    routeFile: '(session)/session.tsx',
    screen: 'screens/session-screen.tsx',
    label: 'Session',
    blurb: 'A finite sitting that reaches an explicit end.',
    reach: { kind: 'shell' },
  },
  {
    href: '/canvas',
    routeFile: '(session)/canvas.tsx',
    screen: 'screens/canvas-screen.tsx',
    label: 'Integration canvas',
    blurb: 'Meet the target inside a passage.',
    reach: { kind: 'from', from: 'src/screens/session-screen.tsx', via: 'onOpenCanvas' },
  },
  {
    href: '/repair',
    routeFile: '(session)/repair.tsx',
    screen: 'screens/session-repair-screen.tsx',
    label: 'Repair branch',
    blurb: 'One diagnostic detour, then rejoin.',
    reach: { kind: 'from', from: 'src/screens/session-screen.tsx', via: 'onOpenRepair' },
  },
  {
    href: '/evidence',
    routeFile: 'evidence.tsx',
    screen: 'screens/evidence-inspector-screen.tsx',
    label: 'Evidence',
    blurb: 'Every state change, its cause, and the export.',
    reach: { kind: 'shell' },
  },
  {
    href: '/debug',
    routeFile: 'debug.tsx',
    screen: 'screens/inspector-debug-screen.tsx',
    label: 'About & diagnostics',
    blurb: 'What this build stores, and where it is honest about it.',
    reach: { kind: 'shell' },
  },
  {
    href: '/style-guide',
    routeFile: 'style-guide.tsx',
    screen: 'ui/style-guide/style-guide-page.tsx',
    label: 'Design specimen',
    blurb: 'Every token and component of the experience layer, in real Japanese.',
    reach: { kind: 'specimen' },
  },
  /**
   * The map (Campaign E, lane B1).
   *
   * In the shell rather than reached from a screen, and that placement is the
   * point rather than a convenience. The round-2 research found that the review
   * queue empties daily and shows nothing accumulated, so the map is *"the only
   * surface that answers 'what have I built' rather than 'what do I owe'"*. That
   * makes it a place a learner starts from, which is exactly what this shell is
   * for — the same test as capture, session, evidence and about.
   */
  {
    href: '/map',
    routeFile: 'map.tsx',
    screen: 'screens/map-screen.tsx',
    label: 'Map',
    blurb: 'What you have built, on the roads the language came in on.',
    reach: { kind: 'shell' },
  },
];

/**
 * The screens a learner has, as controller §10 lists them.
 *
 * Derived by subtraction rather than maintained as a second list, so a
 * destination cannot be a learner screen in one place and a development surface
 * in another.
 */
export const LEARNER_DESTINATIONS: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.reach.kind !== 'specimen',
);

/** Development surfaces: real routes, no door in the shell. */
export const SPECIMEN_DESTINATIONS: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.reach.kind === 'specimen',
);

/**
 * The places the shell offers — the ones a learner *starts* from.
 *
 * Derived rather than listed twice: a destination cannot be in the shell in one
 * file and reached-from-a-parent in another. No count is written here for the
 * same reason it is derived: the number changed when Campaign E added the map
 * and a written count would have gone stale, which is exactly what happened.
 */
export const SHELL_DESTINATIONS: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.reach.kind === 'shell',
);

/**
 * Destinations reached from inside another screen.
 *
 * Exported for the reachability test rather than for rendering: nothing renders
 * this list, and a screen that tried to would be building the debug menu this
 * design avoids.
 */
export const NESTED_DESTINATIONS: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.reach.kind === 'from',
);

/**
 * The candidate panel is a surface, not a route.
 *
 * WP-07 shipped it unmounted and filed a coordination request (WP-07 request 1)
 * because `word-screen.tsx` was not its surface. It is mounted now, on the word
 * page, which is where a learner is when they want an explanation. It is listed
 * here because "the candidate panel must be reachable" is one of WP-10's
 * reachability obligations, and a surface with no href would otherwise have no
 * entry in the map that the reachability test walks.
 */
export const EMBEDDED_SURFACES: readonly {
  readonly name: string;
  readonly module: string;
  readonly mountedIn: string;
  readonly via: string;
}[] = [
  {
    name: 'AI candidate panel',
    module: 'src/candidate/candidate-panel.tsx',
    mountedIn: 'src/screens/word-screen.tsx',
    via: 'CandidatePanel',
  },
];
