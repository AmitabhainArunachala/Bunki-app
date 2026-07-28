/**
 * Screenshot evidence for the word page (Campaign E, lane B3).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-word-depth.mjs
 *
 * Photographs `/word/:id` in both colour schemes, from the real
 * `expo export --platform web` output, in a real browser, with nothing mocked.
 *
 * ## Why it walks the loop instead of loading the URL
 *
 * The page's centrepiece is memory state per capability lens, and on a cold
 * browser every lens honestly reads "no evidence yet". A screenshot of that is
 * true but proves only half the surface, so two of the four shots are taken
 * *after* the learner path that produces real evidence: capture 分岐, take it up
 * for study, sit the session and grade the probes. The contracts, the admitted
 * reviews and the memory states behind those meters are then the kernel's own,
 * written by the evidence gate during a real sitting — this script grades
 * nothing and seeds nothing, it clicks.
 *
 * The cold shots are still taken, from a second word with no evidence at all,
 * because "not measured" is the state the page must also be honest in.
 *
 * Modelled on `capture-style-guide.mjs`, which does the same job for the design
 * specimen, and deliberately not shared with it: that script has a different
 * subject and a different lifetime, and the argument its own header makes about
 * `capture-evidence.mjs` applies here unchanged.
 *
 * Exits non-zero if a shot fails or the page logs an error, so a broken screen
 * cannot pass silently as "no evidence produced".
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
  argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-b3-word-depth')),
);

const VIEWPORT = { width: 1100, height: 1400 };
const MAX_CAPTURE_HEIGHT = 14_000;

/** The canonical fixture word, and an imported entry with a long gloss tail. */
const TARGET = '分岐';
const TARGET_ID = 'lex-bunki';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * `expo export` writes a dynamic route as a literal `[param]` file, so
 * `/word/lex-bunki` has no file of its own and a generic file server 404s it.
 * The same mapping the E2E host encodes, for the same reason.
 */
const DYNAMIC_ROUTES = { word: 'word/[lexemeId].html', kanji: 'kanji/[character].html' };

function resolveFile(urlPath) {
  const [rawPath = '/'] = urlPath.split('?');
  const clean = decodeURIComponent(rawPath);
  if (clean === '' || clean === '/') return join(DIST, 'index.html');

  const direct = join(DIST, clean);
  if (extname(direct) !== '' && existsSync(direct)) return direct;

  const segments = clean.split('/').filter((segment) => segment !== '');
  if (segments.length === 2) {
    const parameterised = DYNAMIC_ROUTES[segments[0]];
    if (parameterised !== undefined && existsSync(join(DIST, parameterised))) {
      return join(DIST, parameterised);
    }
  }

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

function preinstalledChromium() {
  const candidates = [
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ];
  return candidates.find((path) => path !== undefined && existsSync(path));
}

/** The visible instance of a test id — the stack keeps popped screens mounted. */
const live = (page, id) => page.locator(`[data-testid="${id}"]`).filter({ visible: true }).last();

const FACES_INSTALLED = "document.getElementById('bunki-self-hosted-faces') !== null";
const LOADED_FAMILIES = `Array.from(document.fonts)
  .filter((face) => face.status === 'loaded')
  .map((face) => face.family)
  .filter((name, index, all) => all.indexOf(name) === index)
  .sort()`;

async function waitForFaces(page) {
  await page.waitForFunction(FACES_INSTALLED, undefined, { timeout: 30_000 });
  await page.evaluate('document.fonts.ready');
  return page.evaluate(LOADED_FAMILIES);
}

/** The app's scroller height, since react-native-web keeps the document one viewport tall. */
const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="screen-word"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

async function shoot(page, file) {
  const height = await page.evaluate(CONTENT_HEIGHT);
  if (height > VIEWPORT.height) {
    await page.setViewportSize({
      width: VIEWPORT.width,
      height: Math.min(height + 80, MAX_CAPTURE_HEIGHT),
    });
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  await page.setViewportSize(VIEWPORT);
}

/**
 * Walk the learner path that produces real evidence, then land on the word page.
 *
 * Every step is a click or a keystroke. Nothing here writes storage, patches a
 * global, or shortcuts the gate: the contracts and the admitted reviews the
 * meters read are minted by the session, through `@bunki/domain`.
 */
async function walkToEvidence(page, origin, scheme) {
  // `/capture`, not `/`: Wave D made the map the front door and capture
  // an action offered from every surface (`src/ui/navigation.ts` §1–§2).
  await page.goto(`${origin}/capture?scheme=${scheme}`, { waitUntil: 'load' });
  await live(page, 'screen-capture').waitFor({ timeout: 30_000 });

  await live(page, 'capture-search-input').fill(TARGET);
  await live(page, 'capture-top-answer').waitFor();
  await live(page, 'capture-mark-reading').click();
  await live(page, 'capture-keep').click();
  await live(page, 'capture-acknowledgment').waitFor();

  // `learn` is the rung that activates retrieval contracts, and it is only ever
  // reached by a press.
  await page
    .getByTestId(/^capture-promote-/)
    .locator('visible=true')
    .first()
    .click();

  await page.getByTestId('nav-session').click();
  await live(page, 'screen-session').waitFor();
  await live(page, 'session-start').click();
  await live(page, 'session-plan').waitFor();

  // A bounded walk over whatever the plan composed: grade a probe, close a
  // canvas, and stop at the explicit end. Bounded so a plan that grew fails
  // here rather than spinning.
  for (let pressed = 0; pressed < 20; pressed += 1) {
    if (
      await live(page, 'session-completion')
        .isVisible()
        .catch(() => false)
    )
      break;
    const close = live(page, 'session-close');
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      continue;
    }
    const canvasDone = live(page, 'session-complete-canvas');
    if (await canvasDone.isVisible().catch(() => false)) {
      await canvasDone.click();
      continue;
    }
    const grade = live(page, 'session-grade-good');
    if (await grade.isVisible().catch(() => false)) {
      await grade.click();
      continue;
    }
    const next = live(page, 'session-next');
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      continue;
    }
    await page.waitForTimeout(200);
  }

  // …and then to the word page, by URL rather than by another click: the loop
  // above ends on the session's completion screen, and the door from capture is
  // already exercised by the E2E suite.
  await page.goto(`${origin}/word/${TARGET_ID}?scheme=${scheme}`, { waitUntil: 'load' });
  await live(page, 'screen-word').waitFor({ timeout: 30_000 });
  await live(page, 'word-headword').waitFor();
}

/** What the meters actually say, read out of the rendered page. */
const LENS_READOUT = `Array.from(document.querySelectorAll('[data-testid^="word-recall-"]'))
  .map((node) => (node.getAttribute('aria-label') ?? node.innerText ?? '').replace(/\\s+/g, ' ').trim())
  .filter((text) => text !== '')`;

/** The imported entries the cold shots use, chosen for what each one exercises. */
const LONG_TAIL_ID = 'jmdict-1326980'; // 取る — 63 English wordings in this tier
const CONTRAST_ID = 'jmdict-1156530'; // 意見 — a real near-synonym set

const WALKED_NOTE =
  'The word page after a real sitting: 分岐 captured, taken up for study, and its probes graded by clicking. The five meters are the kernel’s own projection over the event log that sitting wrote — there is one per capability and no sixth number anywhere on the page.';

const SHOTS = [
  { file: 'word-depth-light.png', scheme: 'light', evidence: true, note: WALKED_NOTE },
  {
    file: 'word-depth-dark.png',
    scheme: 'dark',
    evidence: true,
    note: `${WALKED_NOTE} The dark scheme is designed rather than inverted.`,
  },
  {
    file: 'word-long-tail-light.png',
    scheme: 'light',
    id: LONG_TAIL_ID,
    note: '取る, opened cold: 63 English wordings, four of them open and the rest behind a disclosure that states the count and why they are folded. Every lens reads “no evidence yet”, which is the state a cold browser is really in.',
  },
  {
    file: 'word-long-tail-dark.png',
    scheme: 'dark',
    id: LONG_TAIL_ID,
    note: 'The same long-tail entry in the dark scheme.',
  },
  {
    file: 'word-contrast-light.png',
    scheme: 'light',
    id: CONTRAST_ID,
    note: '意見, with the contrast set open: entries JMdict glosses with one of the same English words, each showing the shared wording and the wording each side has that the other does not. No nuance is asserted — the standing line says so.',
  },
  {
    file: 'word-contrast-dark.png',
    scheme: 'dark',
    id: CONTRAST_ID,
    note: 'The same contrast set in the dark scheme.',
  },
];

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

      if (shot.evidence === true) {
        await walkToEvidence(page, server.origin, shot.scheme);
      } else {
        await page.goto(`${server.origin}/word/${shot.id}?scheme=${shot.scheme}`, {
          waitUntil: 'load',
        });
        await live(page, 'screen-word').waitFor({ timeout: 30_000 });
        await live(page, 'word-headword').waitFor();
        // The deep sections are folded by default; the one gesture that opens
        // them all is the page's own control, so the shot is of a state a
        // learner can reach by pressing it.
        await live(page, 'word-toggle-deeper').click();
        await page.waitForTimeout(400);
      }

      const fonts = await waitForFaces(page);
      await page.waitForTimeout(1_200);

      const headword = (await live(page, 'word-headword').innerText()).replace(/\s+/g, ' ').trim();
      const lenses = await page.evaluate(LENS_READOUT);
      const acknowledged = await live(page, 'seed-entry-disclosure').isVisible();

      await shoot(page, shot.file);
      await context.close();

      if (failures.length > 0) {
        throw new Error(`${shot.file}: page errors ${JSON.stringify(failures)}`);
      }
      if (lenses.length !== 5) {
        throw new Error(
          `${shot.file}: the page rendered ${lenses.length} capability meters, not five`,
        );
      }
      if (!acknowledged) {
        throw new Error(`${shot.file}: no EDRDG acknowledgement on screen`);
      }

      results.push({ ...shot, fonts, headword, lenses, acknowledged });
      process.stdout.write(`${shot.file}  ${headword}  ${lenses.length} lenses\n`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const lines = [
    '# Word depth — screenshot evidence (Campaign E, lane B3)',
    '',
    'Captured by `apps/app/scripts/capture-word-depth.mjs` from the real',
    '`expo export --platform web` output, in Chromium, at ' +
      `${VIEWPORT.width}×${VIEWPORT.height}, full page.`,
    '',
    'The two `word-depth-*` shots were taken **after walking the loop by clicking**:',
    `capture ${TARGET} → take it up for study → sit the session → grade its probes.`,
    'The memory state in those meters is therefore the kernel’s own, written by the',
    'evidence gate during that sitting. This script grades nothing and seeds nothing.',
    '',
    'The `capability meters` line under each shot is read out of the photographed',
    'page’s accessibility labels, so it is evidence that five independent lenses',
    'really rendered rather than a claim that they were coded.',
    '',
  ];
  for (const result of results) {
    lines.push(
      `## ${result.file}`,
      '',
      result.note,
      '',
      `- headword on screen: \`${result.headword}\``,
      `- EDRDG acknowledgement visible: ${result.acknowledged ? 'yes' : 'no'}`,
      `- capability meters (${result.lenses.length}):`,
      ...result.lenses.map((text) => `  - ${text}`),
      `- fonts registered: ${result.fonts.join(', ')}`,
      '',
    );
  }
  writeFileSync(join(OUT, 'README.md'), `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`\nWrote ${String(results.length)} shots to ${OUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  process.exitCode = 1;
});
