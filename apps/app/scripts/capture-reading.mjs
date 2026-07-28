/**
 * Screenshot and measurement evidence for the reading surface (Campaign E, lane
 * B4).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-reading.mjs
 *
 * Photographs `/read` in both colour schemes, from the real
 * `expo export --platform web` output, in a real browser — and, unlike the
 * specimen script next door, it **drives** the surface rather than only opening
 * it: it turns furigana on, taps a word in the passage, and keeps that word,
 * because a lookup panel that nobody opened is not evidence that a lookup works.
 *
 * ## What it measures while it is there
 *
 * Round-2 research §5 tells this lane to measure the claim rather than assert
 * it: *"Lookup and capture must not leave the passage. Measure it: if capturing
 * costs a navigation, it is wrong."* So before touching anything the script
 * installs counters on `history.pushState`, `history.replaceState` and
 * `popstate`, and it records:
 *
 *   - how many navigations opening the lookup cost;
 *   - how many keeping the word cost;
 *   - how long the keep took, wall clock, from the click to the
 *     acknowledgement appearing;
 *   - how many text nodes the passage offers a screen reader, read out of
 *     Chrome's own accessibility tree over CDP.
 *
 * Every number in the README this writes comes from those readings. Nothing is
 * typed in by hand, and a shot whose page logged an error fails the run rather
 * than being filed as evidence.
 *
 * ## Why a third capture script
 *
 * `capture-evidence.mjs` is WP-05's harness with a fixed shot list for the
 * Phase-0 screens; `capture-style-guide.mjs` photographs a specimen that is
 * deliberately static. This one has a different subject, a different owner, and
 * — the part that matters — it has to *interact*. Sharing them would make one
 * change for the other's reasons.
 *
 * Exits non-zero if anything fails, so a broken surface cannot pass silently as
 * "no evidence produced".
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_ROOT, '../..');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const DIST = resolve(argValue('--dist', join(APP_ROOT, 'dist')));
const OUT = resolve(
  argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-b4-reading')),
);

/** A desktop reading width, because the reviewer here is the operator at a laptop. */
const VIEWPORT = { width: 1100, height: 1400 };
const MAX_CAPTURE_HEIGHT = 12_000;

/** The word driven in every shot. Declared in the seed passage's own vocabulary. */
const WORD = '線路';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function resolveFile(urlPath) {
  const [rawPath = '/'] = urlPath.split('?');
  const clean = decodeURIComponent(rawPath);
  if (clean === '' || clean === '/') return join(DIST, 'index.html');
  const direct = join(DIST, clean);
  if (extname(direct) !== '' && existsSync(direct)) return direct;
  const asHtml = `${direct}.html`;
  if (existsSync(asHtml)) return asHtml;
  const asIndex = join(direct, 'index.html');
  if (existsSync(asIndex)) return asIndex;
  return join(DIST, '+not-found.html');
}

function startServer() {
  const server = createServer((request, response) => {
    const file = resolveFile(request.url ?? '/');
    if (!existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(file));
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      done({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

/** The preinstalled Chromium this environment ships, when it has one. */
function preinstalledChromium() {
  const candidates = [
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ];
  return candidates.find((path) => path !== undefined && existsSync(path));
}

/*
  Page functions are strings rather than arrow functions, for the reason
  `capture-style-guide.mjs` gives: they run in the browser where `document`
  exists, and this file is linted as Node where it does not.
*/
const FACES_INSTALLED = "document.getElementById('bunki-self-hosted-faces') !== null";

const LOADED_FAMILIES = `Array.from(document.fonts)
  .filter((face) => face.status === 'loaded')
  .map((face) => face.family + ' ' + face.weight)
  .filter((name, index, all) => all.indexOf(name) === index)
  .sort()`;

const INSTALL_NAVIGATION_COUNTER = `(() => {
  window.__bunkiNav = { push: 0, replace: 0, pop: 0, href: location.href };
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = function (...a) { window.__bunkiNav.push += 1; return push(...a); };
  history.replaceState = function (...a) { window.__bunkiNav.replace += 1; return replace(...a); };
  window.addEventListener('popstate', () => { window.__bunkiNav.pop += 1; });
  return true;
})()`;

const READ_NAVIGATION_COUNTER = `({ ...window.__bunkiNav, now: location.href })`;

const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="screen-reading"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

/**
 * The words the passage is currently marking, read off their spoken labels.
 *
 * The mark and the label come from the same `mark` value, so counting labels is
 * counting marks. Recorded before and after the keep because "a kept word leaves
 * the frontier" is a claim about the page in front of the learner, and a
 * screenshot of underlines is not something a reader can count reliably.
 */
const MARKED_WORDS = `Array.from(
  document.querySelectorAll('[data-testid="reading-passage"] [aria-label]'),
)
  .map((node) => node.getAttribute('aria-label') || '')
  .filter((label) => label.indexOf(', new to you') !== -1 || label.indexOf(', fragile') !== -1)`;

const SHOTS = [
  {
    file: 'reading-light.png',
    scheme: 'light',
    note: 'The passage on unbleached paper, furigana on, with the inline lookup for 線路 open underneath it and the word kept. The passage has not moved and the address bar has not changed — the counters under this shot are the proof.',
  },
  {
    file: 'reading-dark.png',
    scheme: 'dark',
    note: 'The same page and the same interaction in the dark scheme, which is designed rather than inverted. The frontier hairline is the one accent on the page; everything else is ink on ground.',
  },
];

async function waitForFaces(page) {
  await page.waitForFunction(FACES_INSTALLED, undefined, { timeout: 30_000 });
  await page.evaluate('document.fonts.ready');
  return page.evaluate(LOADED_FAMILIES);
}

/** How many text nodes the passage offers a screen reader, from Chrome's own tree. */
async function passageTextNodes(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '[data-testid="reading-passage"]',
  });
  if (nodeId === 0) throw new Error('no passage element to audit');
  const { nodes } = await cdp.send('Accessibility.queryAXTree', { nodeId });
  const kept = nodes.filter((node) => (node.role?.value ?? '') !== 'InlineTextBox');
  const named = kept.filter((node) => node.ignored !== true && (node.name?.value ?? '') !== '');
  await cdp.detach();
  return {
    textNodes: named.filter((node) => node.role?.value === 'StaticText').length,
    links: named.filter((node) => node.role?.value === 'link').length,
    doubleReadNames: named
      .map((node) => String(node.name?.value ?? ''))
      .filter((name) => name.includes('（') && name.includes(WORD)),
  };
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error(
      `No web export at ${DIST}. Build it first:\n  npm run export:web --workspace @bunki/app`,
    );
  }
  mkdirSync(OUT, { recursive: true });

  const server = await startServer();
  const executablePath = preinstalledChromium();
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });

  const results = [];
  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', (error) => failures.push(String(error)));

      // Reached through its own door, not by typing the URL: a screenshot of a
      // page nobody could navigate to is a screenshot of a page with no door.
      await page.goto(`${server.origin}/?scheme=${shot.scheme}`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid="capture-open-reading"]', { timeout: 30_000 });
      await page.locator('[data-testid="capture-open-reading"]').locator('visible=true').click();
      await page.waitForSelector('[data-testid="reading-passage"]', { timeout: 30_000 });
      const fonts = await waitForFaces(page);

      await page.evaluate(INSTALL_NAVIGATION_COUNTER);

      // Furigana on, so the shot shows the ruby the toggle exists for.
      await page.locator('[data-testid="reading-furigana-toggle"]').locator('visible=true').click();
      await page.waitForTimeout(300);

      const accessibility = await passageTextNodes(context, page);
      const markedBefore = await page.evaluate(MARKED_WORDS);

      // Tap the word. This must cost no navigation.
      const span = page
        .locator(`[data-testid="reading-passage"] [aria-label^="${WORD}"]`)
        .locator('visible=true')
        .first();
      await span.click();
      await page.waitForSelector('[data-testid="reading-lookup"]', { timeout: 10_000 });
      const afterLookup = await page.evaluate(READ_NAVIGATION_COUNTER);

      // Keep it. This must cost no navigation either, and is timed.
      const startedAt = Date.now();
      await page.locator('[data-testid="reading-lookup-keep"]').locator('visible=true').click();
      await page.waitForSelector('[data-testid="reading-lookup-kept"]', { timeout: 10_000 });
      const keepMs = Date.now() - startedAt;
      const afterKeep = await page.evaluate(READ_NAVIGATION_COUNTER);
      const markedAfter = await page.evaluate(MARKED_WORDS);

      const passageStillVisible = await page
        .locator('[data-testid="reading-passage"]')
        .locator('visible=true')
        .isVisible();

      const acknowledgement = (
        await page
          .locator('[data-testid="reading-lookup-kept"]')
          .locator('visible=true')
          .innerText()
      ).trim();

      /*
        `fullPage` is not enough: react-native-web renders a `ScrollView` as a
        fixed-height element with its own overflow, so the document is exactly
        one viewport tall however long the screen is. The viewport is grown to
        the scroller's own height and the shot retaken, which is the same
        reasoning `capture-style-guide.mjs` sets out.
      */
      const contentHeight = await page.evaluate(CONTENT_HEIGHT);
      if (contentHeight > VIEWPORT.height) {
        await page.setViewportSize({
          width: VIEWPORT.width,
          height: Math.min(contentHeight + 80, MAX_CAPTURE_HEIGHT),
        });
        await page.waitForTimeout(400);
      }

      await page.screenshot({ path: join(OUT, shot.file), fullPage: true });
      await context.close();

      if (failures.length > 0) {
        throw new Error(`${shot.file}: page errors ${JSON.stringify(failures)}`);
      }

      const navigations = afterKeep.push + afterKeep.replace + afterKeep.pop;
      if (navigations !== 0) {
        throw new Error(
          `${shot.file}: the lookup and keep cost ${navigations} navigation(s) — this lane's whole claim is that they cost none`,
        );
      }
      if (!passageStillVisible) {
        throw new Error(`${shot.file}: the passage left the screen when the lookup opened`);
      }
      if (accessibility.doubleReadNames.length > 0) {
        throw new Error(
          `${shot.file}: the ruby column is offered as its own node — ${JSON.stringify(accessibility.doubleReadNames)}`,
        );
      }
      if (markedAfter.length !== markedBefore.length - 1) {
        throw new Error(
          `${shot.file}: keeping a word did not take it off the frontier — ` +
            `${String(markedBefore.length)} marked before, ${String(markedAfter.length)} after`,
        );
      }

      results.push({
        ...shot,
        fonts,
        keepMs,
        acknowledgement,
        afterLookup,
        afterKeep,
        accessibility,
        markedBefore,
        markedAfter,
      });
      process.stdout.write(
        `${shot.file}  keep ${String(keepMs)} ms  navigations ${String(navigations)}  ` +
          `text nodes ${String(accessibility.textNodes)}  links ${String(accessibility.links)}\n`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }

  const lines = [
    '# Reading surface — screenshot and measurement evidence (Campaign E, lane B4)',
    '',
    'Captured by `apps/app/scripts/capture-reading.mjs` from the real',
    '`expo export --platform web` output, in Chromium, at ' +
      `${VIEWPORT.width}×${VIEWPORT.height}, full page.`,
    '',
    'The page was **driven**, not merely opened: the script walks in through the',
    'capture screen’s own door, turns furigana on, taps 線路 in the passage, and',
    'keeps it. Every number below was read out of that page — the navigation',
    'counters from patched `history` methods, the keep latency from the wall clock',
    'between the click and the acknowledgement, the accessibility counts from',
    'Chrome’s own tree over CDP. None of them is typed in by hand.',
    '',
    'Scope: Chromium on the Expo Web export, on one machine. No other engine, no',
    'assistive technology, and no mobile browser was involved.',
    '',
  ];
  for (const result of results) {
    lines.push(
      `## ${result.file}`,
      '',
      `- Scheme: ${result.scheme}`,
      `- Fonts loaded: ${result.fonts.join(', ')}`,
      `- Navigations to open the lookup: ${String(result.afterLookup.push + result.afterLookup.replace + result.afterLookup.pop)}`,
      `- Navigations to open the lookup **and** keep the word: ${String(result.afterKeep.push + result.afterKeep.replace + result.afterKeep.pop)}`,
      `- URL before and after: \`${result.afterKeep.href}\` → \`${result.afterKeep.now}\``,
      `- Keep latency, click to acknowledgement: ${String(result.keepMs)} ms`,
      `- The store’s own acknowledgement: “${result.acknowledgement}”`,
      `- Passage as offered to a screen reader: ${String(result.accessibility.textNodes)} text nodes, ${String(result.accessibility.links)} links, ${String(result.accessibility.doubleReadNames.length)} words announced twice`,
      `- Marked words before the keep (${String(result.markedBefore.length)}): ${result.markedBefore.join('; ')}`,
      `- Marked words after the keep (${String(result.markedAfter.length)}): ${result.markedAfter.join('; ')}`,
      `- ${result.note}`,
      '',
      `![${result.scheme} scheme](./${result.file})`,
      '',
    );
  }
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'), 'utf8');
  process.stdout.write(`wrote ${String(results.length)} shots to ${OUT}\n`);
}

await main();
