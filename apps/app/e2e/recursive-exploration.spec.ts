/**
 * Recursive exploration, and the absence of dead ends — the master
 * definition-of-done's other structural clause.
 *
 * > **Recursively explorable** — from any word: kanji → components → compounds →
 * > related/contrasting words → sentences → back; no dead-end screens.
 * > *Final test:* the operator runs a 10-minute free exploration from one seed
 * > word and never hits a dead end or a context loss.
 *
 * A person's ten minutes is not something a suite can reproduce, and pretending
 * otherwise would be the stubbed step. What this file does is the half a machine
 * can do honestly and a person cannot do exhaustively: it walks **many hops from
 * a seed word, across surfaces**, and at every landing asserts —
 *
 *   1. **the hop landed somewhere real** — a screen this app names, with a
 *      subject on it, and no error panel;
 *   2. **the screen offers a way onward** — at least one link out.
 *
 * The second is the whole of "no dead-end screens", stated as a property of
 * every screen the walk reaches rather than as a claim about the design.
 *
 * ## Two kinds of hop, and why the difference matters
 *
 * The app moves through the graph in two ways, and a test that knew only one of
 * them would call the other a dead end:
 *
 *   - **A route hop** pushes a page. `word-kanji-…`, `kanji-compound-…`,
 *     `word-family-…`, `word-contrast-…`. The way back is the browser's history.
 *   - **A dive hop** re-centres the dive *in place*, without navigating.
 *     `kanji-component-…`, `kanji-family-…`, `kanji-shared-…`, and every node on
 *     the dive canvas. The way back is `dive-back`, and the way all the way out
 *     is `dive-surface` — the fractal-dive document's own requirement that there
 *     is "always a visible answer to where am I and a single gesture for take me
 *     back out".
 *
 * The first draft of this file knew only route hops, called `kanji-component-刀`
 * a route hop, found the page unchanged, and reported a dead end at hop 2. The
 * page was not dead; the walk was half-sighted. Both kinds are walked now and
 * the back assertions are split accordingly.
 *
 * ## Context loss
 *
 * The clause names two failures. "No dead end" is the onward-link assertion.
 * "No context loss" is the *back* assertion: after a hop, the way back returns
 * to the exact screen — and the exact dive centre — the hop was taken from.
 */

import { expect, test, live } from './support/app.ts';
import type { Locator, Page } from '@playwright/test';

const v = (page: Page, id: string) => live(page, id);

/**
 * The seed word the walk starts from.
 *
 * The canonical fixture, and the one the passage is written around, so a hop
 * into a sentence has somewhere real to land.
 */
const SEED = '/word/lex-bunki';

/** How many hops. Long enough that a shallow tree runs out; bounded so it ends. */
const HOPS = 14;

/**
 * The screens a hop may land on.
 *
 * A landing that matches none of these is a dead end by definition — the walk
 * arrived somewhere the app does not name. Listing them rather than accepting
 * "any non-blank page" is what makes the check mean something.
 */
const LANDINGS = ['screen-word', 'screen-kanji', 'screen-reading', 'screen-map'] as const;

/** Hops that push a page. The way back is the browser's history. */
const ROUTE_HOPS = [
  /^word-kanji-/, // word → the characters it is written with
  /^kanji-compound-/, // kanji → the words written with it
  /^word-family-/, // word → its word family
  /^word-contrast-/, // word → what it is confused with
] as const;

/** Hops that re-centre the dive in place. The way back is `dive-back`. */
const DIVE_HOPS = [
  /^kanji-component-/, // character → what it is made of
  /^kanji-family-/, // character → what shares its reading
  /^kanji-shared-/, // character → what shares a shape with it
  /^dive-node-/, // the neighbourhood at the current scale
] as const;

/**
 * The way out of a dive, which is a way onward in the clause's sense.
 *
 * "…→ back" is part of the required cycle, not an escape from it: a screen whose
 * only affordance is the way back is still not a dead end, and a dive level with
 * neither would be.
 */
const DIVE_EXITS = [/^dive-back$/, /^dive-surface$/] as const;

interface Landing {
  readonly screen: string;
  readonly subject: string;
}

/** Which known screen is on the page, and what it is about. */
async function landing(page: Page): Promise<Landing | null> {
  for (const screen of LANDINGS) {
    const found = v(page, screen);
    if (!(await found.isVisible().catch(() => false))) continue;
    const text = (await found.innerText()).trim();
    return { screen, subject: text.slice(0, 90).replace(/\s+/g, ' ') };
  }
  return null;
}

/**
 * Controls that share a prefix with a hop but are not one.
 *
 * `word-family-toggle` is a progressive-disclosure header; it opens a section
 * and navigates nowhere. It matched `/^word-family-/` in the first draft, which
 * made the walk "hop" to the page it was already on and then report that going
 * back had lost the address — a failure invented by the selector rather than
 * found in the app. A hop is a thing that moves you.
 */
const NOT_A_HOP = /(-toggle|-cut|-missing-)/;

async function matching(page: Page, patterns: readonly RegExp[]): Promise<readonly Locator[]> {
  const out: Locator[] = [];
  for (const pattern of patterns) {
    const found = page.getByTestId(pattern).locator('visible=true');
    const count = await found.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = found.nth(index);
      const id = (await candidate.getAttribute('data-testid')) ?? '';
      if (NOT_A_HOP.test(id)) continue;
      out.push(candidate);
    }
  }
  return out;
}

/** Every way onward the current page offers, of any kind. */
async function onwardLinks(page: Page): Promise<readonly Locator[]> {
  return [
    ...(await matching(page, ROUTE_HOPS)),
    ...(await matching(page, DIVE_HOPS)),
    ...(await matching(page, DIVE_EXITS)),
  ];
}

/** What the dive is centred on right now, or `null` off a dive surface. */
async function diveCentre(page: Page): Promise<string | null> {
  const glyph = v(page, 'dive-centre-card-glyph');
  if (!(await glyph.isVisible().catch(() => false))) return null;
  return (await glyph.innerText()).trim();
}

test('a walk of many hops from one word never lands nowhere and never runs out of road', async ({
  app,
}) => {
  const page = app.page;
  await page.goto(`${app.baseUrl}${SEED}`);
  await v(page, 'nav-shell').waitFor({ timeout: 30_000 });
  await expect(v(page, 'screen-word')).toBeVisible();

  const walk: string[] = [];
  /** Which onward link to take at each depth — rotated, so the walk fans out. */
  let choice = 0;

  for (let hop = 0; hop < HOPS; hop += 1) {
    const here = await landing(page);
    expect(here, `hop ${String(hop)} landed on no screen this app names`).not.toBeNull();
    if (here === null) break;

    // A screen that rendered its failure state is a landing, but it is not a
    // *real* one.
    await expect(
      page.getByTestId('state-error').locator('visible=true'),
      `hop ${String(hop)} landed on an error panel:\n${walk.join('\n')}`,
    ).toHaveCount(0);

    const links = await onwardLinks(page);
    expect(
      links.length,
      `dead end at hop ${String(hop)} — ${here.screen} offered no way onward.\n` +
        `The walk was:\n${walk.join('\n')}`,
    ).toBeGreaterThan(0);

    const next = links[choice % links.length] as Locator;
    const label = (await next.getAttribute('data-testid')) ?? '?';
    walk.push(`${String(hop)}. ${here.screen} — ${here.subject} → ${label}`);
    choice += 1;

    await next.click();

    // The hop landed, and it landed on something with a subject.
    const arrived = await landing(page);
    expect(
      arrived,
      `hop ${String(hop)} clicked ${label} and landed on no screen.\nThe walk was:\n${walk.join('\n')}`,
    ).not.toBeNull();
    expect(
      arrived?.subject.length ?? 0,
      `hop ${String(hop)} landed on ${String(arrived?.screen)} with nothing on it`,
    ).toBeGreaterThan(0);
  }

  // Non-vacuity: the walk crossed surfaces rather than circling one screen.
  const screens = new Set(walk.map((line) => line.split(' — ')[0]?.split('. ')[1] ?? ''));
  expect([...screens], `the walk never left one kind of screen:\n${walk.join('\n')}`).toContain(
    'screen-kanji',
  );
  expect([...screens]).toContain('screen-word');
  expect(walk.length, 'the walk ended early').toBe(HOPS);
});

test('a route hop can be undone: the browser’s back is the screen it was taken from', async ({
  app,
}) => {
  // "No context loss", stated as the property that fails when a link replaces
  // instead of pushing: after going back, the screen and its subject are the
  // ones the hop started on rather than a re-derived guess at them.
  const page = app.page;
  await page.goto(`${app.baseUrl}${SEED}`);
  await v(page, 'nav-shell').waitFor({ timeout: 30_000 });

  let taken = 0;
  const trail: string[] = [];
  for (let hop = 0; hop < 6; hop += 1) {
    const before = await landing(page);
    expect(before).not.toBeNull();
    const beforeUrl = page.url();
    const links = await matching(page, ROUTE_HOPS);
    if (links.length === 0) break;

    const next = links[hop % links.length] as Locator;
    const label = (await next.getAttribute('data-testid')) ?? '?';
    await next.click();
    const arrived = await landing(page);
    expect(arrived, `route hop ${String(hop)} went nowhere`).not.toBeNull();
    const arrivedUrl = page.url();
    trail.push(`${String(hop)}. ${beforeUrl} → ${label} → ${arrivedUrl}`);
    taken += 1;

    /*
      The assertion is on the URL, not on which screen is on top.

      Screen kind is the wrong instrument here for a reason worth recording:
      expo-router keeps the screen you came from mounted (finding T3-2), so two
      screens of different kinds can be in the tree at once and "which one is
      visible" is a question about a transition rather than about where the
      browser is. The URL is unambiguous and it is the thing "context loss"
      actually means — the address you were at is the address you get back.
    */
    await page.goBack();
    await expect
      .poll(() => page.url(), {
        message:
          `going back from hop ${String(hop)} did not return to the address it was taken ` +
          `from.\nThe trail was:\n${trail.join('\n')}`,
      })
      .toBe(beforeUrl);

    // …and the page there is the same one, not a re-derived guess at it.
    await expect
      .poll(async () => (await landing(page))?.subject, {
        message: `hop ${String(hop)} returned to the right address with a different page on it`,
      })
      .toBe(before?.subject);

    // Forward again, so the next hop starts from where this one arrived.
    await page.goForward();
    await expect.poll(() => page.url()).toBe(arrivedUrl);
  }

  expect(
    taken,
    'no route hop was available from the seed word, so nothing was tested',
  ).toBeGreaterThan(2);
});

test('a dive hop can be undone: dive-back returns to the centre it was taken from', async ({
  app,
}) => {
  // The dive's own requirement, from the fractal-dive document §8.3: "there must
  // always be a visible answer to *where am I* and a single gesture for *take me
  // back out*." A zoom that could not be undone is a context loss with no
  // browser history to rescue it.
  const page = app.page;
  await page.goto(`${app.baseUrl}/kanji/${encodeURIComponent('分')}`);
  await v(page, 'nav-shell').waitFor({ timeout: 30_000 });
  await expect(v(page, 'screen-kanji')).toBeVisible();

  const surface = await diveCentre(page);
  expect(surface, 'the kanji page rendered no dive centre').not.toBeNull();

  // At the surface there is nothing to go back to, and the chrome says so
  // rather than offering a control that would do nothing.
  await expect(v(page, 'dive-at-surface')).toBeVisible();

  let dived = 0;
  for (let hop = 0; hop < 4; hop += 1) {
    const before = await diveCentre(page);
    const links = await matching(page, DIVE_HOPS);
    if (links.length === 0) break;

    await (links[hop % links.length] as Locator).click();
    const inner = await diveCentre(page);
    expect(inner, `dive hop ${String(hop)} left no centre`).not.toBeNull();
    dived += 1;

    await v(page, 'dive-back').click();
    expect(
      await diveCentre(page),
      `dive-back after hop ${String(hop)} did not return to the centre it was taken from`,
    ).toBe(before);

    // Go in again so the next hop starts one level down.
    await (links[hop % links.length] as Locator).click();
  }

  expect(dived, 'no dive hop was available from 分, so nothing was tested').toBeGreaterThan(1);

  // One gesture takes the whole way out, however deep the walk went.
  await v(page, 'dive-surface').click();
  expect(await diveCentre(page), 'dive-surface did not return to the surface').toBe(surface);
  await expect(v(page, 'dive-at-surface')).toBeVisible();
});

test('the walk is capable of finding a dead end', async ({ app }) => {
  // Without this, `onwardLinks` could return something on every page for a
  // reason unrelated to the app — a selector that matched the nav shell, say —
  // and the assertions above would hold on a genuinely dead screen.
  //
  // The probe is a page that really has no onward link of any of the kinds the
  // clause names: the diagnostics screen. It is a legitimate leaf — it is about
  // the build rather than about a word — and it is exactly what a false positive
  // would look like, so it is the right thing to check the detector against.
  const page = app.page;
  await page.goto(`${app.baseUrl}/debug`);
  await v(page, 'nav-shell').waitFor({ timeout: 30_000 });
  await expect(v(page, 'screen-inspector-debug')).toBeVisible();

  expect(
    (await onwardLinks(page)).length,
    'the diagnostics screen offered a word-graph link, so the detector matches something it ' +
      'should not — re-read it before trusting the walk above',
  ).toBe(0);
  expect(
    await landing(page),
    'the diagnostics screen counted as a walk landing, so the landing list is too loose',
  ).toBeNull();
});
