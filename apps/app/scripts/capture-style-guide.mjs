/**
 * Screenshot evidence for the design specimen (Campaign E, lane A1).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-style-guide.mjs
 *
 * Photographs `/style-guide` in both colour schemes, from the real
 * `expo export --platform web` output, in a real browser. Nothing is mocked: the
 * page is the exported bundle, the scheme comes from the app's own `?scheme=`
 * flag rather than from a screenshot filter, and the fonts are the ones the
 * bundle carries — which is the point of taking the picture at all, because a
 * font that failed to register looks like a design decision in a screenshot and
 * like nothing at all in a test.
 *
 * ## Why this is a second script rather than a flag on `capture-evidence.mjs`
 *
 * That script is WP-05's evidence harness, driving CDP by hand to avoid adding a
 * dependency, with a fixed shot list for the three Phase-0 screens and an
 * accessibility audit tied to them. This has a different subject, a different
 * lifetime, and a different owner. Sharing them would make one change for the
 * other's reasons — the same argument `e2e/support/export-server.ts` makes about
 * itself, in the same words.
 *
 * Playwright is already in the dependency register (controller §14) and its
 * browser is already installed for the E2E suite, so this needs nothing new.
 *
 * Exits non-zero if a shot fails, so a broken specimen cannot pass silently as
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
const OUT = resolve(argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-e-design')));

/**
 * Tall enough that the specimen lays out in one column and every section is in
 * the full-page capture. Width is a desktop reading width rather than a phone,
 * because the reviewer here is the operator at a laptop.
 */
const VIEWPORT = { width: 1100, height: 1400 };

/** Ceiling on the grown viewport, so one long page cannot produce a 40 MB PNG. */
const MAX_CAPTURE_HEIGHT = 12_000;

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

const SHOTS = [
  {
    file: 'style-guide-light.png',
    scheme: 'light',
    note: 'The whole vocabulary on unbleached paper. Reading surfaces are Shippori Mincho, chrome is Noto Sans JP — both self-hosted subsets carried by the bundle, so this is what a machine with no CJK font installed sees.',
  },
  {
    file: 'style-guide-dark.png',
    scheme: 'dark',
    note: 'The same page in the dark scheme, which is designed rather than inverted: the recall ramp runs the other way because on a dark ground presence is light. Both schemes are asserted against WCAG AA in test/theme-contrast.test.ts.',
  },
];

/**
 * Wait until the self-hosted faces are actually registered.
 *
 * Without this, a fast capture photographs the fallback stack — the exact defect
 * the screenshot exists to rule out. The check reads the DOM for the stylesheet
 * this build injects and then waits on `document.fonts.ready`, so the picture is
 * of the faces rather than of whatever the host had.
 *
 * The page functions below are *strings* rather than arrow functions. They run
 * in the browser, where `document` exists, and this file is linted as Node,
 * where it does not — an arrow function referencing `document` here is a
 * `no-undef` error and suppressing it would be suppressing a true statement.
 * `capture-evidence.mjs` next door reaches the same conclusion from the same
 * constraint; it passes CDP expression strings for the same reason.
 */
const FACES_INSTALLED = "document.getElementById('bunki-self-hosted-faces') !== null";

const LOADED_FAMILIES = `Array.from(document.fonts)
  .filter((face) => face.status === 'loaded')
  .map((face) => face.family + ' ' + face.weight)
  .filter((name, index, all) => all.indexOf(name) === index)
  .sort()`;

/** The scroller's own height; see the note at the capture for why it is needed. */
const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="style-guide"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

async function waitForFaces(page) {
  await page.waitForFunction(FACES_INSTALLED, undefined, { timeout: 30_000 });
  await page.evaluate('document.fonts.ready');
  return page.evaluate(LOADED_FAMILIES);
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

      await page.goto(`${server.origin}/style-guide?scheme=${shot.scheme}`, {
        waitUntil: 'load',
      });
      await page.waitForSelector('[data-testid="style-guide"]', { timeout: 30_000 });
      const fonts = await waitForFaces(page);
      // The stroke specimen animates on mount; let it finish so the capture
      // shows a drawn character rather than a half-written one.
      await page.waitForTimeout(4_000);

      /*
        `fullPage` is not enough here, and the reason is structural rather than a
        Playwright quirk: react-native-web renders a `ScrollView` as a fixed-height
        element with its own overflow, so the *document* is exactly one viewport
        tall no matter how long the specimen is. A full-page capture of it is a
        capture of the first screen.

        So the viewport is grown to the scroller's own `scrollHeight` and the shot
        is taken again. That produces one continuous image of the whole page,
        which is what a specimen has to be — a reviewer comparing the type scale
        to the recall marks should not have to stitch four screenshots together.
      */
      const contentHeight = await page.evaluate(CONTENT_HEIGHT);
      if (contentHeight > VIEWPORT.height) {
        await page.setViewportSize({
          width: VIEWPORT.width,
          height: Math.min(contentHeight + 80, MAX_CAPTURE_HEIGHT),
        });
        await page.waitForTimeout(600);
      }

      await page.screenshot({ path: join(OUT, shot.file), fullPage: true });
      await context.close();

      if (failures.length > 0) {
        throw new Error(`${shot.file}: page errors ${JSON.stringify(failures)}`);
      }
      results.push({ ...shot, fonts });
      process.stdout.write(`${shot.file}  fonts: ${fonts.join(', ')}\n`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const lines = [
    '# Design specimen — screenshot evidence (Campaign E, lane A1)',
    '',
    'Captured by `apps/app/scripts/capture-style-guide.mjs` from the real',
    '`expo export --platform web` output, in Chromium, at ' +
      `${VIEWPORT.width}×${VIEWPORT.height}, full page.`,
    '',
    'The `fonts` line under each shot is read out of `document.fonts` in the',
    'photographed page, so it is evidence that the self-hosted faces really',
    'registered rather than a claim that they were bundled.',
    '',
  ];
  for (const result of results) {
    lines.push(
      `## ${result.file}`,
      '',
      `- Scheme: ${result.scheme}`,
      `- Fonts loaded: ${result.fonts.join(', ')}`,
      `- ${result.note}`,
      '',
      `![${result.scheme} scheme](./${result.file})`,
      '',
    );
  }
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'), 'utf8');
  process.stdout.write(`wrote ${results.length} shots to ${OUT}\n`);
}

await main();
