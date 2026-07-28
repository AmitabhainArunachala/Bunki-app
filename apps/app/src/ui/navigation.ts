/**
 * The app's information architecture (Wave D — the weave).
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
 * the test; a screen no route renders fails the test.
 *
 * ---
 *
 * # The argument, written down so it can be disagreed with
 *
 * The previous version of this file was a **list**, and a list has no opinion.
 * Three surface lanes each appended one entry to the shell, each with a
 * defensible case for exactly one addition, none able to see the other two. The
 * shell reached seven destinations, laid out at 699 CSS px, and every route in
 * the app overflowed an iPhone-width viewport by 309 px. That is what a list
 * with no argument costs: not a debate, a horizontal scrollbar.
 *
 * What follows is an architecture. It can be wrong. It cannot be *appended to*
 * without answering it.
 *
 * ## 1. The map is home, not a tab
 *
 * The round-2 research is the load-bearing finding, and it is about retention
 * rather than aesthetics:
 *
 * > The queue empties daily and shows nothing accumulated. The map only ever
 * > accumulates. **It is the only surface that answers "what have I built"
 * > rather than "what do I owe."**
 *
 * Every other destination in this app answers "what do I owe" — a sitting to
 * sit, a branch to close, a ledger of what happened. If the first thing the app
 * shows is a bill, the app is Anki with better type, and the operator's own
 * complaint ("hard to sense or feel progress; easy to plateau") is reproduced
 * rather than answered.
 *
 * So `/` is the map. Not `/map` linked first in a row of seven — the front
 * door. Capture moved off `/` to make room, and that is the second decision.
 *
 * ## 2. Capture is an action, not a destination
 *
 * Capture was the front door because it was built first, not because a learner
 * starts there. In use it is an interruption: you are reading, or sitting, or
 * looking at the map, and a word arrives. The thing you need is a way to put it
 * somewhere **without leaving where you are**.
 *
 * That is an action. {@link ACTION_DESTINATIONS} holds it, the shell offers it
 * from every surface, and it returns you to the surface you were on — the
 * route's own `?from=` records where that was, so the return is exact rather
 * than a guess at history depth.
 *
 * It is a real route rather than an in-place overlay, and that is a decision
 * with a cost, so here is the reason: a modal drawn over a live surface leaves
 * every control behind it focusable. Making it not-focusable means `aria-hidden`
 * over a subtree that contains the tab bar, which is the WCAG defect
 * `aria-hidden-focus` exists to name. A route push has no such problem, restores
 * the previous surface exactly, and is addressable — `/capture?q=…` is a
 * shareable search, which an overlay could never be.
 *
 * ## 3. Five destinations, grouped by what the learner is doing
 *
 * Frozen §10 records that renzo's five-tab IA "validates the IA; missing piece
 * is *circulation* between tabs". Five is a guide rather than a quota; what
 * makes it five here is that there are five distinct things a learner does, and
 * grouping by activity rather than by data type is what stops the count from
 * growing every time a lane lands.
 *
 * | 地図 Map      | see what I have built, and the country it sits in |
 * | 稽古 Practice | sit the finite session; canvas and repair are steps inside it |
 * | 分岐 Branches | what the evidence opened, and what must hold to rejoin |
 * | 読む Reading  | meet the language whole, in a passage |
 * | 記録 Record   | what happened, why, and the export — About & sources inside it |
 *
 * The grouping is by **verb**. A "data" grouping would have given us Words,
 * Kanji, Sentences, Evidence, Settings — which is renzo's failure mode
 * (§10.1: "a database rendered as table views") and is exactly how the shell
 * grew to seven, because every new data type earned a tab.
 *
 * Three consequences worth stating, because each removes a destination:
 *
 * - **The canvas and the repair branch are steps of a sitting**, not siblings of
 *   it. They keep their routes and are reached from the session screen.
 * - **About & diagnostics is part of the record.** It carries the EDRDG §3
 *   clause-2 obligation ("a separate screen accessed from a menu, such as one
 *   labelled About, Sources") and 記録 is that menu. It is one tap from a
 *   persistent destination on every route, which is what the clause asks for.
 * - **Word and kanji pages are reached from whatever mentioned the word.** They
 *   are about a particular thing; a tab cannot be about a particular thing.
 *
 * ## 4. The 案内人 has a position; it is not a tab and not a bubble
 *
 * The map document, §4.1: *"The guide is not a bubble in the corner. It is
 * somewhere on the road, ahead of you. It walks."*
 *
 * A tab contradicts that — a tab is a place you go and leave, which makes the
 * guide a room rather than a companion. A floating chat bubble contradicts it
 * harder: it is the Todaii "Tomo Chat" placement the frozen spec rejects by name
 * (§10.4, "AI as bolt-on").
 *
 * The resolution is {@link PRESENCE_DESTINATIONS}: the guide is carried by the
 * shell on **every** surface as one quiet line that says where it is standing
 * relative to the surface you are on — and that line is the door to its full
 * surface. Reading the line costs nothing and asks nothing. Opening it is a
 * deliberate act. That is a presence with a position, and it is one line of
 * chrome rather than a seventh tab.
 *
 * The line never carries learner state and never grades: it names a place on the
 * road. `test/navigation-reachability.test.ts` asserts the guide is not in the
 * shell, so a later lane cannot promote it back to a tab without deleting an
 * assertion and this paragraph.
 *
 * ## 5. What the count is allowed to become
 *
 * {@link SHELL_DESTINATIONS} is five and the reachability test pins it as an
 * equality. Adding a sixth is permitted and is not a merge conflict to resolve
 * quietly: it requires editing the equality, which requires reading §3 and
 * saying which verb the new tab is, and which existing tab it is not a step of.
 * That is the whole mechanism. It is deliberately annoying.
 */

/** How a learner arrives at a destination. */
export type Reach =
  /** One of the five tabs in the persistent shell. */
  | { readonly kind: 'shell' }
  /**
   * An action the shell offers from every surface, which returns the learner to
   * the surface they were on.
   *
   * `via` names the control in `nav-shell.tsx` the reachability test looks for,
   * so "the shell offers it" is checked rather than asserted. Distinct from
   * `shell` because an action is not a place: it does not appear in the tab bar,
   * it does not take `aria-current`, and leaving it puts you back where you
   * were rather than somewhere new.
   */
  | { readonly kind: 'action'; readonly via: string }
  /**
   * Carried by the shell as a presence on every surface — see §4 above.
   *
   * The one member is the 案内人. Structurally it is close to `action`, and it
   * is a separate kind because the *reason* differs and the reason is the thing
   * a later reader needs: an action is something you do, a presence is something
   * that is there. Collapsing them would lose §4.
   */
  | { readonly kind: 'presence'; readonly via: string }
  /**
   * A development surface, reached by typing its URL.
   *
   * The design specimen (`/style-guide`) is a real route and so must be on this
   * map — a route file absent from the table fails the reachability test, and
   * that rule is worth more than the convenience of an exemption. But it is not
   * a place a learner goes, so it is not in the shell and it is not counted
   * among the screens controller §10 names.
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
  /**
   * The destination's name in Japanese, set in mincho beside the English.
   *
   * Typography-first is the frozen §8 rule and it applies to the chrome, not
   * only to reading surfaces: an app for learning Japanese whose own navigation
   * is English-only teaches that Japanese is the content and English is the
   * frame. Every name here is a real word a learner meets — 稽古 is the word a
   * dojo uses for practice, 分岐 is the product's own name and the seed's
   * canonical target — so the chrome is itself a small, permanent exposure.
   *
   * Exposure, and nothing more: reading a tab label is never retrieval and
   * nothing here reaches the evidence gate.
   */
  readonly ja: string;
  /** Kana reading of {@link ja}, for the spoken label. */
  readonly yomi: string;
  /** One line of orientation, shown under the label in the shell. */
  readonly blurb: string;
  readonly reach: Reach;
}

/**
 * Every screen in the app, with its route and its door.
 *
 * The map is first, because it is `/`. After it the Phase-0 loop is listed in
 * the order controller §10 walks it — capture, look it up, sit a session, meet
 * it in context, repair, inspect, the diagnostic surface — and the Campaign E
 * surfaces follow. `navigation-reachability.test.ts` pins that relative order,
 * so the list stays readable as the loop rather than drifting into an
 * arrival-order pile.
 */
export const DESTINATIONS: readonly Destination[] = [
  {
    /*
      `/`, and this is the decision the whole file is about — see §1.

      It used to be capture. The map earned the front door on the round-2
      research's own finding: it is the only surface that answers "what have I
      built". A learner who opens the app and is shown a search box is being
      asked to do work before being shown anything they own.
    */
    href: '/',
    routeFile: 'index.tsx',
    screen: 'screens/map-screen.tsx',
    label: 'Map',
    ja: '地図',
    yomi: 'ちず',
    blurb: 'What you have built, on the roads the language came in on.',
    reach: { kind: 'shell' },
  },
  {
    href: '/capture',
    routeFile: 'capture.tsx',
    screen: 'screens/capture-screen.tsx',
    label: 'Capture',
    ja: '拾う',
    yomi: 'ひろう',
    blurb: 'Paste or search an encounter. Saving is one gesture, from anywhere.',
    reach: { kind: 'action', via: 'CaptureAction' },
  },
  {
    href: '/word/[lexemeId]',
    routeFile: 'word/[lexemeId].tsx',
    screen: 'screens/word-screen.tsx',
    label: 'Word',
    ja: '語',
    yomi: 'ご',
    blurb: 'The layered word page, with its AI candidate panel.',
    reach: { kind: 'from', from: 'src/screens/capture-screen.tsx', via: 'onOpenWord' },
  },
  {
    href: '/kanji/[character]',
    routeFile: 'kanji/[character].tsx',
    screen: 'screens/kanji-screen.tsx',
    label: 'Kanji',
    ja: '漢字',
    yomi: 'かんじ',
    blurb: 'Strokes and components for one character.',
    reach: { kind: 'from', from: 'src/screens/capture-screen.tsx', via: 'onOpenKanji' },
  },
  {
    href: '/session',
    routeFile: '(session)/session.tsx',
    screen: 'screens/session-screen.tsx',
    label: 'Session',
    ja: '稽古',
    yomi: 'けいこ',
    blurb: 'A finite sitting that reaches an explicit end.',
    reach: { kind: 'shell' },
  },
  {
    href: '/canvas',
    routeFile: '(session)/canvas.tsx',
    screen: 'screens/canvas-screen.tsx',
    label: 'Integration canvas',
    ja: '文脈',
    yomi: 'ぶんみゃく',
    blurb: 'Meet the target inside a passage.',
    reach: { kind: 'from', from: 'src/screens/session-screen.tsx', via: 'onOpenCanvas' },
  },
  {
    href: '/repair',
    routeFile: '(session)/repair.tsx',
    screen: 'screens/session-repair-screen.tsx',
    label: 'Repair branch',
    ja: '修復',
    yomi: 'しゅうふく',
    blurb: 'One diagnostic detour, then rejoin.',
    reach: { kind: 'from', from: 'src/screens/session-screen.tsx', via: 'onOpenRepair' },
  },
  {
    href: '/evidence',
    routeFile: 'evidence.tsx',
    screen: 'screens/evidence-inspector-screen.tsx',
    label: 'Evidence',
    ja: '記録',
    yomi: 'きろく',
    blurb: 'Every state change, its cause, and the export.',
    reach: { kind: 'shell' },
  },
  {
    /*
      Reached from the record rather than from the shell.

      The EDRDG licence statement §3 clause 2 asks for the acknowledgement "on a
      separate screen accessed from a menu, such as one labelled About, Sources".
      記録 is that menu, it is a tab on every route, and this screen is one tap
      from it — `evidence-open-debug` is the door and the reachability test
      checks the evidence screen contains it. The acknowledgement additionally
      renders on every screen in the app (`test/edrdg-acknowledgement.test.ts`
      derives that from the seed's own provenance and exempts nothing), so the
      clause-1 obligation does not depend on this placement at all.
    */
    href: '/debug',
    routeFile: 'debug.tsx',
    screen: 'screens/inspector-debug-screen.tsx',
    label: 'About & diagnostics',
    ja: '典拠',
    yomi: 'てんきょ',
    blurb: 'Sources, licences, and what this build stores.',
    reach: {
      kind: 'from',
      from: 'src/screens/evidence-inspector-screen.tsx',
      via: 'onOpenDebug',
    },
  },
  {
    /*
      Branch points, in the shell — see §3.

      A branch point does not belong to any one screen. It is opened by a fact
      about a *contract* — a miss the evidence gate counted — and that fact
      outlives the sitting it happened in, survives a reload, and is still true
      tomorrow. There is no screen it could be a step of, which is the test
      §3 applies to every tab.

      It is also the surface where finitude is literal: a branch has a stated
      rejoin condition, so "what is open" has an answer with an end. The round-2
      research argues that is the reply to "it never ends".
    */
    href: '/journey',
    routeFile: 'journey.tsx',
    screen: 'screens/journey-screen.tsx',
    label: 'Journeys',
    ja: '分岐',
    yomi: 'ぶんき',
    blurb: 'Branch points the evidence opened, and what still has to hold to rejoin.',
    reach: { kind: 'shell' },
  },
  {
    /*
      Reading, in the shell.

      It was previously reached from the capture screen, on the argument that a
      passage is something you go *to* from where you already are. That argument
      was downstream of capture being the front door; with capture demoted to an
      action, reading had no door at all. It is also a verb in its own right and
      the surface the Migaku finding is about (§4 of the round-2 research: lookup
      and capture must not leave the passage), which is exactly why the capture
      action being available *inside* the reading surface matters.
    */
    href: '/read',
    routeFile: 'read.tsx',
    screen: 'screens/reading-screen.tsx',
    label: 'Reading',
    ja: '読む',
    yomi: 'よむ',
    blurb: 'A passage, read whole. Lookups happen in place.',
    reach: { kind: 'shell' },
  },
  {
    /*
      The 案内人 — see §4. Carried by the shell as a presence, not as a tab.
    */
    href: '/guide',
    routeFile: 'guide.tsx',
    screen: 'screens/guide-screen.tsx',
    label: 'The guide',
    ja: '案内人',
    yomi: 'あんないにん',
    blurb: 'Where the road goes next, and where the guide is standing on it.',
    reach: { kind: 'presence', via: 'GuidePresence' },
  },
  {
    href: '/style-guide',
    routeFile: 'style-guide.tsx',
    screen: 'ui/style-guide/style-guide-page.tsx',
    label: 'Design specimen',
    ja: '見本',
    yomi: 'みほん',
    blurb: 'Every token and component of the experience layer, in real Japanese.',
    reach: { kind: 'specimen' },
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
 * The five tabs — the places a learner *is*, grouped by what they are doing.
 *
 * Derived rather than listed twice: a destination cannot be a tab in one file
 * and reached-from-a-parent in another. The count is asserted as an equality in
 * `test/navigation-reachability.test.ts` rather than written here as prose,
 * because the previous version of this file said "four entries" in two places
 * and a third file said it in a third, and all three were still saying four
 * after two more had landed.
 */
export const SHELL_DESTINATIONS: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.reach.kind === 'shell',
);

/**
 * Actions the shell offers everywhere — see §2. Currently capture, alone.
 *
 * An action is not a tab: it takes no `aria-current`, and leaving it returns the
 * learner to the surface they were on rather than to a new place.
 */
export const ACTION_DESTINATIONS: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.reach.kind === 'action',
);

/**
 * Presences the shell carries everywhere — see §4. Currently the 案内人, alone.
 */
export const PRESENCE_DESTINATIONS: readonly Destination[] = DESTINATIONS.filter(
  (destination) => destination.reach.kind === 'presence',
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

/** Look one destination up by href. Used by the shell and by `RouteTitle`. */
export function destinationFor(href: string): Destination | null {
  return DESTINATIONS.find((destination) => destination.href === href) ?? null;
}

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
