/**
 * The reading surface, in a browser, against the exported bundle (Campaign E,
 * lane B4).
 *
 * ## The claim this lane is judged on
 *
 * Round-2 research §5: *"B4 (reading surface). Lookup and capture must not leave
 * the passage. Measure it: if capturing costs a navigation, it is wrong."*
 *
 * That is not a claim a source scan can settle, and it is not a claim a comment
 * should be allowed to make. So this spec installs counters on
 * `history.pushState`, `history.replaceState` and `popstate` before touching
 * anything, then taps a word and keeps it, and requires the counters to still
 * read zero and the URL to be byte-identical. A router call that navigated
 * would move at least one of them.
 *
 * The word-page button is checked from the other side: it *does* navigate, and
 * it is the only thing here that may.
 *
 * ## Scope
 *
 * Chromium on the Expo Web export, on this machine. Every number reported here
 * is scoped to that and to no other engine or platform.
 */

import { expect, test, openApp, hydrated, visibleTestId } from './support/adv-harness.ts';
import type { CDPSession, Page } from '@playwright/test';

/**
 * A word that is written in the passage and declared in its vocabulary.
 *
 * Spelled out here rather than imported from the seed, for the reason the other
 * specs give: the point of an E2E is that the *shipped bundle* knows this word.
 */
const WORD = '線路';
const WORD_READING = 'せんろ';

/** Every way a single-page app can change the address bar, counted. */
const INSTALL_NAVIGATION_COUNTER = `(() => {
  window.__bunkiNav = { push: 0, replace: 0, pop: 0, href: location.href };
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = function (...args) { window.__bunkiNav.push += 1; return push(...args); };
  history.replaceState = function (...args) { window.__bunkiNav.replace += 1; return replace(...args); };
  window.addEventListener('popstate', () => { window.__bunkiNav.pop += 1; });
  return true;
})()`;

const READ_NAVIGATION_COUNTER = `({ ...window.__bunkiNav, now: location.href })`;

interface NavigationCounter {
  readonly push: number;
  readonly replace: number;
  readonly pop: number;
  readonly href: string;
  readonly now: string;
}

async function navigationCounter(page: Page): Promise<NavigationCounter> {
  return (await page.evaluate(READ_NAVIGATION_COUNTER)) as NavigationCounter;
}

/** Reach the reading surface the way a learner does: through its door. */
async function openReading(page: Page, origin: string): Promise<void> {
  await openApp(page, origin);
  await visibleTestId(page, 'capture-open-reading').click();
  await expect(visibleTestId(page, 'screen-reading')).toBeVisible();
  await expect(visibleTestId(page, 'reading-passage')).toBeVisible();
}

/**
 * The tappable span for a word, found by the name a screen reader would hear.
 *
 * By `aria-label` rather than by a test id: `FrontierPassage` gives its spans no
 * per-span id, and the label is the thing worth locating by anyway — a span that
 * lost its accessible name would fail to be found here rather than being clicked
 * anonymously.
 */
function wordInPassage(page: Page, word: string) {
  return page
    .locator(`[data-testid="reading-passage"] [aria-label^="${word}"]`)
    .locator('visible=true')
    .first();
}

test('the passage is reachable from the front door and renders whole', async ({ page, app }) => {
  await openReading(page, app.origin);

  const passage = visibleTestId(page, 'reading-passage');
  const text = (await passage.innerText()).replace(/\s+/g, '');

  // The seed's own opening and closing clauses, so a truncated or reordered
  // render fails rather than passing on "some Japanese is present".
  expect(text).toContain('駅を出ると、線路はすぐに二つに分かれる');
  expect(text).toContain('自分で選んだ道だけが自分の道になる');

  // …and the acknowledgement the licence requires on a screen that displays
  // JMdict readings and senses.
  await expect(visibleTestId(page, 'seed-entry-disclosure')).toBeVisible();
});

test('the lookup opens in place: no navigation, and the passage stays on screen', async ({
  page,
  app,
}) => {
  await openReading(page, app.origin);
  await page.evaluate(INSTALL_NAVIGATION_COUNTER);

  const before = await navigationCounter(page);

  await wordInPassage(page, WORD).click();
  await expect(visibleTestId(page, 'reading-lookup')).toBeVisible();

  // The lookup answered with the entry, not with a spinner or a stub.
  await expect(visibleTestId(page, 'reading-lookup-headword')).toContainText(WORD);
  await expect(visibleTestId(page, 'reading-lookup-senses')).toContainText('railway');

  // The content did not go anywhere. This is the whole point of the lane.
  await expect(visibleTestId(page, 'reading-passage')).toBeVisible();
  await expect(visibleTestId(page, 'reading-passage')).toContainText('分かれる');

  const after = await navigationCounter(page);
  expect(
    { push: after.push, replace: after.replace, pop: after.pop },
    'opening a lookup moved the router — the lookup must not cost a navigation',
  ).toEqual({ push: 0, replace: 0, pop: 0 });
  expect(after.now).toBe(before.href);
});

test('keeping from the lookup costs no navigation either, and is measured', async ({
  page,
  app,
}) => {
  await openReading(page, app.origin);
  await page.evaluate(INSTALL_NAVIGATION_COUNTER);

  await wordInPassage(page, WORD).click();
  const keep = visibleTestId(page, 'reading-lookup-keep');
  await expect(keep).toBeVisible();

  const started = Date.now();
  await keep.click();
  const kept = visibleTestId(page, 'reading-lookup-kept');
  await expect(kept).toBeVisible();
  const elapsed = Date.now() - started;

  // What the store actually reported, rather than a word this screen chose.
  // Two events and no more: the encounter, and the move out of `captured` to
  // `keep`. Nothing evidence-class, because nothing was asked and nothing
  // answered.
  await expect(kept).toContainText('2 event(s): EncounterCaptured, ThreadPromotionChanged');

  await expect(visibleTestId(page, 'reading-passage')).toBeVisible();

  const after = await navigationCounter(page);
  expect(
    { push: after.push, replace: after.replace, pop: after.pop },
    'capturing cost a navigation, which is the defect this lane exists to avoid',
  ).toEqual({ push: 0, replace: 0, pop: 0 });

  // A generous ceiling: the assertion is "a keep is a local, synchronous
  // acknowledgement", not a benchmark. `scripts/capture-reading.mjs` records the
  // measured figure on this machine into the evidence README.
  expect(elapsed, `keeping took ${String(elapsed)} ms`).toBeLessThan(2_000);
});

test('a kept word leaves this learner’s frontier, on the page they are reading', async ({
  page,
  app,
}) => {
  await openReading(page, app.origin);

  // Before: the word is on the frontier, because nothing in the log mentions it.
  await wordInPassage(page, WORD).click();
  await expect(visibleTestId(page, 'reading-lookup-basis')).toContainText(
    'Nothing in your log mentions this word yet',
  );
  await expect(wordInPassage(page, WORD)).toHaveAttribute(
    'aria-label',
    new RegExp(`^${WORD}, new to you$`),
  );

  await visibleTestId(page, 'reading-lookup-keep').click();
  await expect(visibleTestId(page, 'reading-lookup-kept')).toBeVisible();

  // After: the mark is gone from the passage itself, with no reload.
  await expect(wordInPassage(page, WORD)).toHaveAttribute('aria-label', new RegExp(`^${WORD}$`));
});

test('the furigana toggle exposes its state and annotates only sourced words', async ({
  page,
  app,
}) => {
  await openReading(page, app.origin);

  const toggle = visibleTestId(page, 'reading-furigana-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  /*
    The *visual* ruby line, not the spoken one.

    `RubyText` carries its accessible name as clipped real text, so a passage's
    `innerText` contains the reading whether or not the annotation is drawn. The
    drawn ruby is the `aria-hidden` node above the written form — asserting on
    that is the difference between "the reading is somewhere in the DOM" and
    "the furigana rendered".
  */
  const drawnRuby = page.locator(
    `[data-testid="reading-passage"] [aria-hidden="true"]:text-is("${WORD_READING}")`,
  );
  await expect(drawnRuby, 'furigana was drawn while the toggle was off').toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(drawnRuby, 'the reading did not appear over the word').toHaveCount(1);

  // …and the surface says out loud which words carry one, rather than leaving a
  // learner to conclude the toggle is broken on the rest of the page.
  await expect(visibleTestId(page, 'reading-furigana-scope')).toContainText(
    'The rest carries no reading data, so none is guessed.',
  );
});

/* ------------------------------------------------------------------ *
 * Ruby: said once, even when the word is a link
 * ------------------------------------------------------------------ */

interface AxNode {
  readonly role: string;
  readonly name: string;
  readonly ignored: boolean;
}

/**
 * The accessibility subtree Chrome computes under one element.
 *
 * Over CDP rather than from the DOM, for the reason `adv-a11y-audit.spec.ts`
 * gives: the difference between "hidden from the tree" and "the prop meant to
 * hide it was silently dropped by react-native-web" is invisible in the DOM and
 * is exactly the defect class this project keeps finding.
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

test('a tappable ruby word is announced once, not as a link and a column', async ({
  page,
  app,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await openReading(page, app.origin);
  await visibleTestId(page, 'reading-furigana-toggle').click();
  await expect(
    page.locator(`[data-testid="reading-passage"] [aria-hidden="true"]:text-is("${WORD_READING}")`),
  ).toHaveCount(1);

  const named = (await axSubtree(cdp, 'reading-passage'))
    .filter((node) => !node.ignored && node.name !== '')
    .map((node) => node.name);

  // The link is there, named the way the frontier rule words it.
  expect(named).toContain(`${WORD}, new to you`);

  /*
    …and the ruby column inside it is not a node of its own.

    This failed when the surface was first driven: Chrome offered
    `link "線路, new to you"` *and* `StaticText "線路（せんろ）"`, because `link`
    is not a children-presentational role and `RubyText` carries its label as
    real clipped text. `frontier.tsx` now hides an interactive span's visual
    column; this is the assertion that keeps it hidden.
  */
  const doubled = named.filter((name) => name.includes('（') && name.includes(WORD));
  expect(
    doubled,
    'the reading is offered as a second node, so the word is announced twice',
  ).toEqual([]);

  await cdp.detach();
});

test('the passage is offered as prose rather than as one node per character', async ({
  page,
  app,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await openReading(page, app.origin);

  const nodes = await axSubtree(cdp, 'reading-passage');
  const text = nodes.filter((node) => !node.ignored && node.role === 'StaticText');

  /*
    The passage body is 160 characters. One span per character — which is what
    this surface shipped before it was driven — produced 100-plus separate text
    nodes, and a screen reader walking 「駅」「を」「出」「る」 is being handed the
    prose as rubble. The chunking rule in `passage-spans.ts` is what bounds this;
    the ceiling is generous so the test is about the failure, not the tuning.
  */
  expect(text.length, `the passage is ${String(text.length)} separate text nodes`).toBeLessThan(60);
  expect(text.length, 'no text reached the tree at all').toBeGreaterThan(5);
});

test('the word page is the one deliberate exit, and it does navigate', async ({ page, app }) => {
  await openReading(page, app.origin);
  await wordInPassage(page, WORD).click();

  await visibleTestId(page, 'reading-lookup-word-page').click();
  await hydrated(page);
  await expect(visibleTestId(page, 'word-headword')).toBeVisible();
  expect(page.url()).toContain('/word/lex-senro');
});
