/**
 * T4 — accessibility audit (controller §10 typography/accessibility, REQ-UI-08/09;
 * orchestration §4 lane T4).
 *
 * Run against the exported web bundle in Chromium, with axe-core. Every claim
 * below is scoped to that and says so, because "the accessibility scan passed"
 * with no engine and no assistive technology named is exactly the kind of
 * unqualified claim REQ-GATE-03 forbids. What this establishes:
 *
 *   - **automated** WCAG 2.0/2.1 A and AA rules, in light *and* dark, on every
 *     route the export produces;
 *   - focus order, focus visibility, and the absence of a keyboard trap;
 *   - an accessible name on every interactive element;
 *   - that a ruby column is spoken once, as a word, and not as its pieces;
 *   - that every toggle in the vocabulary exposes its *value* — which chip is
 *     on, which section is open, which destination you are on — read back out
 *     of Chrome's own accessibility tree rather than out of the source.
 *
 * What it does not establish: that a screen reader user can complete the loop.
 * No VoiceOver, NVDA, TalkBack or Orca ran here, no human tested it, and no
 * mobile browser was involved. Automated rules catch a minority of real
 * barriers; this is a floor, not a verdict.
 *
 * ## The known-finding split
 *
 * Two tests cover the axe scan, deliberately:
 *
 *   - **"no new violation"** allows exactly the rule ids in
 *     {@link KNOWN_AXE_FINDINGS} and nothing else, so any *other* violation
 *     introduced later turns this red.
 *   - **"no violation at all"** is the goal state. It carried a `test.fail()`
 *     while T4-1 was open; Playwright reports a surprise pass as a failure, so
 *     fixing the defect forced the annotation and the exemption to be deleted
 *     in the same change. That is what happened in the W5 closeout, and
 *     {@link KNOWN_AXE_FINDINGS} is now empty.
 *
 * That shape is why the exemption could not rot into a permanent excuse.
 *
 * ## What the axe scan measures, and what it therefore does not cover
 *
 * These scans run on the **hydrated** page, which is what a person interacts
 * with and what axe is defined against. It is not the same thing as the bytes
 * `expo export` writes: the static export still ships an empty `<title>`,
 * because expo-router's `Head` is focus-gated and does not render during static
 * pre-rendering. That residual is pinned separately, as its own annotated
 * expectation, in `adv-known-defects.spec.ts` (T4-1b). Nothing here should be
 * read as a claim about pre-hydration markup.
 */

import AxeBuilder from '@axe-core/playwright';
import type { CDPSession, Page } from '@playwright/test';

import { DESTINATIONS } from '../src/ui/navigation.ts';
import { expect, test, openApp, hydrated, keepWord, visibleTestId } from './support/adv-harness.ts';

/**
 * Real parameters for the routes that have a dynamic segment.
 *
 * Keyed by the `href` in the navigation map, so a dynamic route with no entry
 * here fails the guard below rather than being silently skipped. Two words
 * rather than one because the title-uniqueness test needs two instances of the
 * same route to prove titles are per-*word* and not per-route.
 */
const ROUTE_PARAMS: Readonly<Record<string, readonly string[]>> = {
  '/word/[lexemeId]': ['/word/lex-bunki', '/word/lex-wakareru'],
  '/kanji/[character]': [`/kanji/${encodeURIComponent('岐')}`],
};

/**
 * Every route the app has, **derived from the navigation map**.
 *
 * This used to be a hand-written array, and the header of this file blames a
 * hand-written list of routes for two prior EDRDG misses. It then made the same
 * mistake one layer down: lane B1 shipped `/map` — 24 pressable nodes, 18
 * scrubber steps, six route chips, five lens chips and four era grounds with
 * figure-on-ground contrast — and the array was not extended, so the map was
 * scanned by neither axe pass, neither contrast pass, nor the title-uniqueness
 * check, in either scheme. The title test's own comment claimed it was "written
 * against `ROUTES` rather than a fixed list, so a new route with no title fails
 * here", which was true of the loop and false of the list it looped over.
 *
 * `src/ui/navigation.ts` is the one place a route is declared, and
 * `test/navigation-reachability.test.ts` already walks it against the filesystem
 * — a route file absent from that table fails there. Reading it here makes the
 * two facts one fact: a destination that exists is a destination this sweep
 * visits, with no second list to remember.
 *
 * `/style-guide` is a development surface rather than a learner destination
 * (`reach: 'specimen'`), and it is scanned anyway — in fact it is the route
 * where a scan is worth the most. It renders every component in the vocabulary
 * at once, in both schemes, so an accessibility defect in a *component* fails
 * here before the surface lanes have built anything on it. A page that exists to
 * be looked at is exactly the page that should have to pass. So this takes every
 * destination, not the learner subset.
 */
// Derived from DESTINATIONS rather than listed, so the sweep cannot fall behind
// the app. Two lanes wrote this list in the same round — one appending '/read'
// to a hard-coded array, one replacing the array with this — and the hard-coded
// form is exactly the shape that lets a new route ship unscanned. The derivation
// is kept and the literal dropped: a sweep whose coverage is a maintained list
// is a sweep that silently shrinks.
const ROUTES: readonly string[] = DESTINATIONS.flatMap((destination) => {
  if (!destination.href.includes('[')) return [destination.href];
  const params = ROUTE_PARAMS[destination.href];
  if (params === undefined || params.length === 0) {
    // Thrown at module load, so the whole file goes red rather than one test
    // quietly scanning nine routes where the app has ten.
    throw new Error(
      `adv-a11y-audit: dynamic route ${destination.href} has no entry in ROUTE_PARAMS; ` +
        'add one so the sweep visits it rather than skipping it.',
    );
  }
  return [...params];
});

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/**
 * Rule ids currently violated by the shipped build, each with its finding id.
 *
 * This is an allow-list of *known defects*, not of acceptable behaviour. Adding
 * to it is how a lane stops being adversarial, so each entry names the finding
 * that has to be closed to remove it.
 *
 * **It is empty, and that is the point.** Its one entry was `document-title`
 * (finding T4-1: every page shipped `<title data-rh="true"></title>`, WCAG 2.4.2
 * Level A, the only axe violation across eighteen scans). The W5 closeout gave
 * every route a real title through `src/ui/route-title.tsx`, so the entry and
 * the `test.fail()` that guarded it were both deleted here. A future defect adds
 * a line back; nothing is grandfathered.
 */
const KNOWN_AXE_FINDINGS: Readonly<Record<string, string>> = {};

interface AxeSummary {
  readonly route: string;
  readonly scheme: string;
  readonly id: string;
  readonly impact: string;
  readonly nodes: number;
  readonly detail: string;
}

async function scanEveryRoute(
  page: Page,
  origin: string,
  scheme: 'light' | 'dark',
): Promise<readonly AxeSummary[]> {
  const found: AxeSummary[] = [];
  for (const route of ROUTES) {
    await openApp(page, origin, `${route}?scheme=${scheme}`);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    for (const violation of results.violations) {
      found.push({
        route,
        scheme,
        id: violation.id,
        impact: violation.impact ?? 'unknown',
        nodes: violation.nodes.length,
        detail: (violation.nodes[0]?.failureSummary ?? violation.help).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return found;
}

const render = (violations: readonly AxeSummary[]): string =>
  violations
    .map(
      (violation) =>
        `${violation.scheme} ${violation.route} — ${violation.id} (${violation.impact}, ${String(violation.nodes)} node(s)): ${violation.detail}`,
    )
    .join('\n');

for (const scheme of ['light', 'dark'] as const) {
  test(`axe (${scheme}): no violation outside the recorded known findings`, async ({
    page,
    app,
  }) => {
    const violations = await scanEveryRoute(page, app.origin, scheme);
    const unexpected = violations.filter(
      (violation) => KNOWN_AXE_FINDINGS[violation.id] === undefined,
    );
    expect(unexpected, `unrecorded WCAG A/AA violations:\n${render(unexpected)}`).toEqual([]);
  });

  test(`axe (${scheme}): AA contrast is clean on every route`, async ({ page, app }) => {
    // Called out on its own because contrast is the rule most likely to break
    // silently when a colour is nudged, and because the controller names WCAG AA
    // contrast "in both light/dark" specifically (REQ-UI-08/09).
    const violations = await scanEveryRoute(page, app.origin, scheme);
    const contrast = violations.filter((violation) => violation.id.includes('contrast'));
    expect(contrast, `contrast failures in ${scheme}:\n${render(contrast)}`).toEqual([]);
  });
}

/**
 * The same sweep, over every route **mid-load**.
 *
 * ## Why a second sweep exists
 *
 * The scans above walk routes in their *settled* state, and that is where a
 * whole class of defect hides. `react-native-web` renders `ActivityIndicator`
 * as its own `role="progressbar"` with no accessible name, so every loading
 * panel put two progressbars in the tree — one named, one anonymous — and the
 * anonymous one is `aria-progressbar-name`, WCAG 4.1.2, impact *critical*. It
 * survived the whole of Phase 0 because no scanned route was ever mid-load. It
 * was found by accident, when the design specimen happened to render the four
 * states side by side on a route the sweep visits.
 *
 * A defect that can only be found by accident is a defect the suite does not
 * cover. This closes that: `?lag=` holds the real loading state open — the
 * screens' own state machine, not a stand-in — long enough for axe to scan it.
 *
 * ## Non-vacuity
 *
 * Not every route has a lookup, so not every route has a loading state. The run
 * records which routes actually showed one and fails if that count collapses:
 * a sweep of loading states that found no loading state is a sweep that passes
 * for the wrong reason, which is exactly the shape being closed here.
 */
const LAG_MS = 5_000;

for (const scheme of ['light', 'dark'] as const) {
  test(`axe (${scheme}): no violation while a route is still loading`, async ({ page, app }) => {
    const violations: AxeSummary[] = [];
    const loading: string[] = [];

    for (const route of ROUTES) {
      const joiner = route.includes('?') ? '&' : '?';
      await openApp(page, app.origin, `${route}${joiner}lag=${String(LAG_MS)}&scheme=${scheme}`);

      // Scan whatever is on screen, whether or not this route has a lookup — a
      // route with no loading state still has a shell, and the shell is scanned
      // in that state too.
      const panel = visibleTestId(page, 'state-loading');
      if (await panel.isVisible().catch(() => false)) loading.push(route);

      const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
      for (const violation of results.violations) {
        violations.push({
          route,
          scheme: `${scheme} (loading)`,
          id: violation.id,
          impact: violation.impact ?? 'unknown',
          nodes: violation.nodes.length,
          detail: violation.nodes[0]?.failureSummary ?? '(no detail)',
        });
      }
    }

    expect(
      loading.length,
      'no route showed a loading panel, so this sweep scanned nothing it was written for — ' +
        'check that ?lag= still holds the state open',
    ).toBeGreaterThan(2);

    expect(
      violations,
      `WCAG A/AA violations while loading (${String(loading.length)} routes showed a loading panel):\n${render(
        violations,
      )}`,
    ).toEqual([]);
  });
}

test('axe: no violation at all, on any route, in either scheme', async ({ page, app }) => {
  const violations = [
    ...(await scanEveryRoute(page, app.origin, 'light')),
    ...(await scanEveryRoute(page, app.origin, 'dark')),
  ];
  expect(violations, `WCAG A/AA violations:\n${render(violations)}`).toEqual([]);
});

/* ------------------------------------------------------------------ *
 * Document titles (WCAG 2.4.2) — the closed T4-1, asserted positively
 * ------------------------------------------------------------------ */

/**
 * axe's `document-title` rule only asks whether a non-empty title exists. That
 * is a low bar and it is not the whole of what T4-1 was about: the harm was
 * blank tabs, blank bookmarks and blank history entries, which a single shared
 * title would technically satisfy while leaving a learner unable to tell two
 * saved pages apart.
 *
 * So this asserts the properties the rule does not: every route has a title,
 * every title names its route, and no two routes share one. Written against
 * `ROUTES` rather than a fixed list, so a new route with no title fails here
 * instead of being discovered by a person with thirteen identical tabs open.
 */
test('every route has its own non-empty document title (WCAG 2.4.2)', async ({ page, app }) => {
  const seen = new Map<string, string>();

  for (const route of ROUTES) {
    await openApp(page, app.origin, route);
    await hydrated(page);
    // The title is set by `RouteTitle` on mount, so it settles with hydration
    // rather than with load; `toHaveTitle` retries, a bare read would race it.
    await expect(page, `route ${route} has no usable document title`).not.toHaveTitle('');
    const title = await page.title();

    expect(title.trim(), `route ${route} has a blank title`).not.toBe('');
    expect(title, `route ${route} leaks an internal id into its title`).not.toMatch(
      /\b(contract|thread|component|session|step|canvas|lex)-[a-z0-9-]+/,
    );

    const collision = seen.get(title);
    expect(
      collision,
      `routes ${String(collision)} and ${route} share the title "${title}", so their tabs, ` +
        'bookmarks and history entries are indistinguishable',
    ).toBeUndefined();
    seen.set(title, route);
  }

  expect(seen.size, 'every route should have contributed a distinct title').toBe(ROUTES.length);
});

/* ------------------------------------------------------------------ *
 * Keyboard: order, visibility, and the absence of a trap
 * ------------------------------------------------------------------ */

interface FocusedElement {
  readonly testId: string;
  readonly name: string;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly outlineStyle: string;
  readonly tag: string;
  /** True when this element comes after the previously focused one in the DOM. */
  readonly follows: boolean;
}

/**
 * The focused element: its size, its focus ring, and whether it came *after* the
 * previous one in the document.
 *
 * ## Why reading order is measured in the DOM rather than in pixels
 *
 * It used to be a monotonic-`top` assertion over a scroll-corrected position.
 * That worked while every focusable thing lived in one scrolling column, and it
 * stopped the moment the shell put its tab bar at the *bottom of the viewport*,
 * outside the scroller: content inside the `ScrollView` reports a position in
 * the scrolled content (1626 px in), the tab bar reports a viewport position
 * (1348 px down), and comparing the two says focus jumped upwards when it did
 * not. Two coordinate systems, one comparison.
 *
 * Document order is what WCAG 2.4.3 is actually about — "focusable components
 * receive focus in an order that preserves meaning" — and it is invariant to
 * scrolling, to fixed positioning, and to a bar that is visually below the
 * content it follows in the tree. `compareDocumentPosition` states it directly.
 *
 * The geometric numbers are still returned, because the ≥44 pt touch-target
 * check below is genuinely about pixels.
 */
async function focused(page: Page): Promise<FocusedElement | null> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element === null || element === document.body) return null;
    const box = element.getBoundingClientRect();
    let top = box.top + window.scrollY;
    let left = box.left + window.scrollX;
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      top += node.scrollTop;
      left += node.scrollLeft;
    }
    const store = window as unknown as { __bunkiLastFocused?: Element | null };
    const previous = store.__bunkiLastFocused ?? null;
    const follows =
      previous === null ||
      (previous.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    store.__bunkiLastFocused = element;
    return {
      follows,
      testId: element.getAttribute('data-testid') ?? '',
      name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 60),
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(box.width),
      height: Math.round(box.height),
      outlineStyle: getComputedStyle(element).outlineStyle,
      tag: element.tagName.toLowerCase(),
    };
  });
}

test('keyboard: focus follows reading order, is always visible, and never traps', async ({
  page,
  app,
}) => {
  await openApp(page, app.origin);
  await keepWord(page, '分岐');

  // Start from the document, not from whatever the last click left focused.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.evaluate(() => {
    (window as unknown as { __bunkiLastFocused?: Element | null }).__bunkiLastFocused = null;
  });

  const order: FocusedElement[] = [];
  const seen = new Set<string>();
  let wrapped = false;

  for (let press = 0; press < 40; press += 1) {
    await page.keyboard.press('Tab');
    const current = await focused(page);
    if (current === null) {
      // Focus reached the document body: the tab ring closed rather than
      // trapping. One more press should re-enter the page.
      wrapped = true;
      continue;
    }
    const key = `${current.tag}|${current.testId}|${current.name}|${String(current.top)}|${String(current.left)}`;
    if (seen.has(key)) {
      wrapped = true;
      break;
    }
    seen.add(key);
    order.push(current);
  }

  expect(order.length, 'nothing was focusable on the capture screen').toBeGreaterThan(8);
  expect(
    wrapped,
    'tabbing never returned to an element it had already visited, so the focus ring does not ' +
      'close — either something is trapping focus or the ring is unbounded',
  ).toBe(true);

  // The first two stops are the shell's masthead: the capture action, then the
  // 案内人's rail. The five tabs are at the *end* of the tab order, because the
  // bar is at the bottom of the page — which is what keeps the reading-order
  // assertion below true rather than requiring an exemption for chrome.
  expect(order.slice(0, 2).map((element) => element.testId)).toEqual([
    'nav-capture',
    'guide-presence',
  ]);
  expect(order.slice(-5).map((element) => element.testId)).toEqual([
    'nav-map',
    'nav-session',
    'nav-evidence',
    'nav-journeys',
    'nav-reading',
  ]);

  // Reading order, in the document: every stop comes after the one before it.
  const backwards = order
    .slice(1)
    .filter((element) => !element.follows)
    .map((element) => element.testId || element.name || element.tag);
  expect(
    backwards,
    'focus moved backwards in the document at these stops, so the tab order does not follow the ' +
      'reading order',
  ).toEqual([]);

  for (const element of order) {
    // ≥44 pt touch targets (controller §10). Checked on the *smaller* dimension:
    // a 720×20 row is wide and still hard to hit.
    expect(
      Math.min(element.width, element.height),
      `${element.testId || element.name} is ${String(element.width)}×${String(element.height)}, ` +
        'under the 44 pt minimum',
    ).toBeGreaterThanOrEqual(44);

    // A focus ring exists. `outline: none` with nothing put back in its place is
    // the single most common way a keyboard user loses their position.
    expect(
      element.outlineStyle,
      `${element.testId || element.name} suppresses its focus outline`,
    ).not.toBe('none');
  }
});

test('keyboard: screens left mounted behind the current one take no focus', async ({
  page,
  app,
}) => {
  // Navigating leaves the previous screen mounted (finding T3-2). That is a
  // performance and DOM-hygiene defect on its own, and it would become an
  // accessibility defect if those stale screens were still reachable by keyboard
  // — a learner would tab into a copy of a screen they had left. They are not,
  // and this is the test that keeps it that way while T3-2 is open.
  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await visibleTestId(page, 'capture-open-word').click();
  await expect(visibleTestId(page, 'screen-word')).toBeVisible();
  await visibleTestId(page, 'nav-capture').click();
  await expect(visibleTestId(page, 'capture-search-input')).toBeVisible();

  expect(
    await page.getByTestId('screen-capture').count(),
    'the stacking this test guards against no longer happens — T3-2 may be fixed, in which ' +
      'case this test should be re-read rather than deleted',
  ).toBeGreaterThan(1);

  await page.locator('body').click({ position: { x: 2, y: 2 } });
  for (let press = 0; press < 30; press += 1) {
    await page.keyboard.press('Tab');
    const current = await focused(page);
    if (current === null) continue;
    const visible = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (element === null) return true;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    expect(
      visible,
      `focus landed on an off-screen element (${current.testId || current.name}) belonging to a ` +
        'screen the learner has already left',
    ).toBe(true);
  }
});

/* ------------------------------------------------------------------ *
 * Ruby: said once, as a word
 * ------------------------------------------------------------------ */

interface AxNode {
  readonly role: string;
  readonly name: string;
  readonly ignored: boolean;
}

/**
 * The accessibility subtree Chrome computes under one element.
 *
 * `Accessibility.queryAXTree` over CDP rather than a DOM query, because the
 * question is what an assistive technology is *offered*, and the difference
 * between "hidden from the tree" and "the prop meant to hide it was silently
 * dropped by react-native-web" is invisible in the DOM.
 *
 * `InlineTextBox` nodes are dropped: they are the layout fragments of a
 * `StaticText`, so counting them would report one text node several times and
 * turn a line wrap into a failure.
 */
async function axSubtree(cdp: CDPSession, testId: string): Promise<readonly AxNode[]> {
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `[data-testid="${testId}"]`,
  });
  if (nodeId === 0) throw new Error(`no element with data-testid="${testId}"`);

  const { nodes } = await cdp.send('Accessibility.queryAXTree', { nodeId });
  return nodes
    .filter((node) => (node.role?.value ?? '') !== 'InlineTextBox')
    .map((node) => ({
      role: String(node.role?.value ?? ''),
      name: String(node.name?.value ?? ''),
      ignored: node.ignored === true,
    }));
}

const RUBY_CASES = [
  {
    route: '/word/lex-bunki',
    label: '分岐（ぶんき）',
    // One segment: the whole reading sits over the whole written form.
    pieces: ['分岐', 'ぶんき'],
  },
  {
    route: '/word/lex-wakareru',
    label: '分かれる（わかれる）',
    // Two segments plus an empty-ruby placeholder — the shape that previously
    // produced four separate spoken nodes in DOM order.
    pieces: ['分', 'わ', 'かれる', '　'],
  },
] as const;

for (const rubyCase of RUBY_CASES) {
  test(`ruby: ${rubyCase.label} is spoken once, as a word`, async ({ page, app }) => {
    const cdp = await page.context().newCDPSession(page);
    await openApp(page, app.origin, rubyCase.route);
    await expect(visibleTestId(page, 'word-headword')).toBeVisible();

    const nodes = await axSubtree(cdp, 'word-headword');
    const named = nodes.filter((node) => !node.ignored && node.name !== '').map((n) => n.name);

    expect(
      named,
      'a ruby column must offer exactly one named node — more than one is the double-read defect, ' +
        'where a screen reader walks the visual columns and interleaves reading and written form',
    ).toEqual([rubyCase.label]);

    for (const piece of rubyCase.pieces) {
      expect(
        named.includes(piece),
        `“${piece}” is exposed on its own, so the word is read in pieces`,
      ).toBe(false);
    }

    // The empty-ruby spacer must not be in the tree at all — not even ignored.
    // An ideographic space is real content: it lands in a copied selection and
    // in some tools' output.
    expect(
      nodes.filter((node) => node.name.includes('　')).map((node) => node.name),
      'the empty-ruby placeholder reached the accessibility tree',
    ).toEqual([]);

    await cdp.detach();
  });
}

/* ------------------------------------------------------------------ *
 * Name, role, **value** — the third one, which was missing
 * ------------------------------------------------------------------ */

/**
 * The accessibility properties Chrome computes for one element.
 *
 * The same instrument as {@link axSubtree}, one level finer: `queryAXTree`'s
 * first node is the element itself, and its `properties` are what an assistive
 * technology is offered as that control's *value*.
 *
 * These tests exist because neither the source nor the DOM could answer the
 * question. Every chip in the app carried `accessibilityState={{ selected }}`,
 * which react-native-web has no reader for — `modules/forwardedProps` lists the
 * flat `aria-*` names and `pick()` removes the rest — so the prop never became
 * an attribute and every chip shipped as an identical
 * `<button aria-label="…" role="button">`, on and off distinguished by fill
 * colour alone (WCAG 2.1 SC 1.4.1 Use of Color, SC 4.1.2 Name/Role/Value). axe
 * stayed green, because axe never requires a button to expose selection, and
 * the unit test meant to prevent it grepped the source for the prop and passed.
 * Reading the runtime tree is the only test form in this repository that has
 * ever caught this class of defect; the ruby double-read above was its first
 * instance, and this is its second.
 */
async function axPropertiesOf(
  cdp: CDPSession,
  testId: string,
): Promise<Readonly<Record<string, string>>> {
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `[data-testid="${testId}"]`,
  });
  if (nodeId === 0) throw new Error(`no element with data-testid="${testId}"`);

  const { nodes } = await cdp.send('Accessibility.queryAXTree', { nodeId });
  const self = nodes[0];
  if (self === undefined) throw new Error(`no accessibility node for "${testId}"`);
  return Object.fromEntries(
    (self.properties ?? []).map((property) => [property.name, String(property.value.value)]),
  );
}

/**
 * Which of these controls tells Chrome it is pressed.
 *
 * Fails on a control that exposes no pressed state *at all*, separately from
 * failing on the wrong one being pressed. Those are different defects: the
 * first is the silent-drop failure this section was written for, and a plain
 * "expected ['x'] to equal ['y']" would not have said so.
 */
async function pressedAmong(
  cdp: CDPSession,
  testIds: readonly string[],
): Promise<readonly string[]> {
  const on: string[] = [];
  for (const testId of testIds) {
    const properties = await axPropertiesOf(cdp, testId);
    expect(
      properties['pressed'],
      `${testId} exposes no \`pressed\` state, so it is announced identically whether it is on ` +
        'or off and only its fill says otherwise (WCAG 2.1 SC 4.1.2, SC 1.4.1)',
    ).toBeDefined();
    if (properties['pressed'] === 'true') on.push(testId);
  }
  return on;
}

/** The accessible name Chrome computes for one element. */
async function axNameOf(cdp: CDPSession, testId: string): Promise<string> {
  return (await axSubtree(cdp, testId))[0]?.name ?? '';
}

const LENS_CHIPS = [
  'lens-reading',
  'lens-meaning',
  'lens-listening',
  'lens-production',
  'lens-writing',
] as const;

test('lenses: exactly one chip is exposed as the active one, and pressing another moves it', async ({
  page,
  app,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await openApp(page, app.origin, '/style-guide');
  await expect(visibleTestId(page, 'lens-reading')).toBeVisible();

  expect(
    await pressedAmong(cdp, LENS_CHIPS),
    'a lens row must name exactly one active lens — REQ-UI-07 forbids the blend two would be, ' +
      'and none at all leaves a learner arriving on the page unable to tell what the surface is ' +
      'currently about',
  ).toEqual(['lens-reading']);

  // The accessible name is *not* doing this job, and must not start to: it is
  // the same string on and off, which is precisely why the ✓ inside the button
  // never reached the name computation and why the state needs its own channel.
  const restingName = await axNameOf(cdp, 'lens-production');

  await visibleTestId(page, 'lens-production').click();

  expect(
    await pressedAmong(cdp, LENS_CHIPS),
    'pressing a lens did not move the exposed active state',
  ).toEqual(['lens-production']);
  expect(await axNameOf(cdp, 'lens-production')).toBe(restingName);

  await cdp.detach();
});

test('toggles: the furigana switch exposes on and off, not only a fill', async ({ page, app }) => {
  const cdp = await page.context().newCDPSession(page);
  await openApp(page, app.origin, '/style-guide');
  await expect(visibleTestId(page, 'specimen-furigana-toggle')).toBeVisible();

  // The specimen opens with furigana on.
  expect(await pressedAmong(cdp, ['specimen-furigana-toggle'])).toEqual([
    'specimen-furigana-toggle',
  ]);
  await visibleTestId(page, 'specimen-furigana-toggle').click();
  expect(await pressedAmong(cdp, ['specimen-furigana-toggle'])).toEqual([]);

  await cdp.detach();
});

test('disclosure: a folded section says whether it is open', async ({ page, app }) => {
  const cdp = await page.context().newCDPSession(page);
  await openApp(page, app.origin, '/style-guide');
  const header = visibleTestId(page, 'specimen-disclosure-readings-toggle');
  await expect(header).toBeVisible();

  const expandedState = async (): Promise<string | undefined> =>
    (await axPropertiesOf(cdp, 'specimen-disclosure-readings-toggle'))['expanded'];

  expect(
    await expandedState(),
    'the disclosure header exposes no expanded state, so the chevron — which is deliberately ' +
      'hidden from the tree — is the only thing saying whether the section is open',
  ).toBe('true');

  await header.click();
  expect(await expandedState()).toBe('false');

  await cdp.detach();
});

const UNCERTAINTY_CHIPS = [
  'capture-mark-meaning',
  'capture-mark-reading',
  'capture-mark-use',
  'capture-mark-kanji',
  'capture-mark-not-sure',
] as const;

test('capture: the uncertainty chips expose which dimension is marked', async ({ page, app }) => {
  const cdp = await page.context().newCDPSession(page);
  await openApp(page, app.origin);
  await visibleTestId(page, 'capture-search-input').fill('分岐');
  await expect(visibleTestId(page, 'capture-top-answer')).toBeVisible();
  await expect(visibleTestId(page, 'capture-mark-meaning')).toBeVisible();

  expect(await pressedAmong(cdp, UNCERTAINTY_CHIPS)).toEqual([]);
  await visibleTestId(page, 'capture-mark-reading').click();
  expect(await pressedAmong(cdp, UNCERTAINTY_CHIPS)).toEqual(['capture-mark-reading']);

  // The row that holds them is a `group`, not a `radiogroup`: ARIA requires a
  // radiogroup to own `role="radio"` children, and these are buttons. The route
  // sweep never caught the old role because these chips only exist once a word
  // has been searched for, and it scans the screen at rest.
  expect(
    await visibleTestId(page, 'capture-mark-reading').evaluate((element) =>
      element.parentElement?.getAttribute('role'),
    ),
  ).toBe('group');

  await cdp.detach();
});

test('shell: exactly one destination is marked as the page you are on', async ({ page, app }) => {
  // Asserted on the attribute rather than over CDP: `aria-current` is not one
  // of the properties `Accessibility.queryAXTree` reports. It is still the same
  // fix under test — the defect was `accessibilityState={{ selected }}`, a prop
  // react-native-web drops before it can become an attribute at all, so the
  // current destination shipped indistinguishable from the other three to
  // anything not looking at the vermilion underline.
  const current = async (): Promise<readonly string[]> =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="nav-"]'))
        .filter((element) => element.getAttribute('aria-current') === 'page')
        .map((element) => element.getAttribute('data-testid') ?? ''),
    );

  // The map, at `/`, since Wave D — and `nav-capture` is deliberately *not*
  // expected here: capture is an action the shell offers rather than a place
  // the shell is at, so it carries no `aria-current` at all.
  await openApp(page, app.origin, '/');
  expect(
    await current(),
    'the shell marks no destination, or more than one, as the current page',
  ).toEqual(['nav-map']);

  await visibleTestId(page, 'nav-evidence').click();
  await expect(visibleTestId(page, 'screen-evidence')).toBeVisible();
  expect(await current()).toEqual(['nav-evidence']);
});

test('labels: every interactive element on every route has an accessible name', async ({
  page,
  app,
}) => {
  const unnamed: string[] = [];

  for (const route of ROUTES) {
    await openApp(page, app.origin, route);
    await hydrated(page);
    const found = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          'button,[role="button"],[role="link"],a,input,textarea,select,[tabindex="0"]',
        ),
      )
        .filter((element) => {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return false;
          const name = (
            element.getAttribute('aria-label') ??
            element.getAttribute('aria-labelledby') ??
            element.textContent ??
            ''
          ).trim();
          return name === '';
        })
        .map((element) => element.outerHTML.slice(0, 160)),
    );
    unnamed.push(...found.map((html) => `${route}: ${html}`));
  }

  expect(
    unnamed,
    'interactive elements with no accessible name — a screen reader announces these as ' +
      `“button”, with nothing to distinguish them:\n${unnamed.join('\n')}`,
  ).toEqual([]);
});
