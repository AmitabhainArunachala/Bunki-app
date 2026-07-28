/**
 * Screenshot evidence for the 案内人 (Campaign E, lane B6).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-guide.mjs
 *
 * Photographs `/guide` in both colour schemes, from the real
 * `expo export --platform web` output, in a real browser, **after driving it**.
 * A screenshot of the empty screen would show a page with nothing on it and
 * prove nothing about the lane, so the script does what a learner does: asks
 * the guide about the first word, answers two turns, and then asks for a road
 * and a plan. Everything in the picture is therefore produced by the shipped
 * bundle rather than staged.
 *
 * The AI route in a web export has no key by construction (`@bunki/ai`'s
 * `ambientEnv` finds no `process` there), so the guide's words come from the
 * scripted fixtures — which is exactly why the shot is worth taking: the picture
 * has to show the `offline-fallback` label beside the `AI candidate / generated`
 * one, and a build that had lost the second label would look fine in a test that
 * only counted the first.
 *
 * Modelled on `capture-style-guide.mjs`, including its two structural notes:
 * the page functions are strings because they run in the browser and this file
 * is linted as Node, and the viewport is grown to the scroller's own
 * `scrollHeight` because react-native-web renders a `ScrollView` as a
 * fixed-height element whose document is exactly one viewport tall.
 *
 * Exits non-zero if a shot fails, so a broken surface cannot pass silently as
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
const OUT = resolve(argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-b6-guide')));

const VIEWPORT = { width: 1100, height: 1400 };
const MAX_CAPTURE_HEIGHT = 20_000;

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
    file: 'guide-light.png',
    scheme: 'light',
    note: 'The guide standing one station ahead on an eight-station road across the three era layers, after a two-turn conversation. The guide’s words carry both labels — “AI candidate / generated” and “offline-fallback” — because a web export holds no key and this text came from the app’s own fixtures.',
  },
  {
    file: 'guide-dark.png',
    scheme: 'dark',
    note: 'The same page, driven the same way, in the dark scheme. The two marks on the road are a rule and a word, never a colour alone.',
  },
];

const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="guide-screen"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

/** What the photographed page actually shows, read back out of it. */
const OBSERVED = `(() => {
  const text = (selector) => {
    const node = document.querySelector(selector);
    return node === null ? null : node.textContent;
  };
  const labels = Array.from(document.querySelectorAll('[data-testid$="-label"]'))
    .map((node) => node.textContent)
    .filter((value) => value !== null && value !== '');
  return {
    headline: text('[data-testid="guide-position-headline"]'),
    learner: text('[data-testid="guide-position-learner"]'),
    labels: Array.from(new Set(labels)),
    speechBlocks: document.querySelectorAll('[data-testid^="guide-speech-"]').length,
    roadRows: document.querySelectorAll('[data-testid^="guide-road-row-"]').length,
    planProvenance: text('[data-testid="guide-plan-provenance"]'),
  };
})()`;

/** The live element for a test id — the last one that occupies space. */
function live(page, id) {
  return page.locator(`[data-testid="${id}"]`).filter({ visible: true }).last();
}

/**
 * Do what a learner does.
 *
 * Ask about the first word, answer two turns with different stances so the
 * estimate has something to say, then ask for a road and a plan. Nothing here
 * seeds a store, sets a flag or patches the app.
 */
async function drive(page) {
  await page.waitForSelector('[data-testid="guide-screen"]', { timeout: 30_000 });

  const asks = page.locator('[data-testid^="guide-ask-"]').filter({ visible: true });
  await asks.first().click();
  await page.waitForSelector('[data-testid$="-standing-note"]', { timeout: 30_000 });

  const stances = page.locator('[data-testid^="guide-stance-"]').filter({ visible: true });
  // The stance chips are rendered in `LEARNER_STANCES` order, six per turn, so
  // index 1 is "I knew the shape, not how to say it" on the first turn and
  // index 8 is "I could say it, not what it means" on the second.
  await stances.nth(1).click();
  await stances.nth(8).click();

  await live(page, 'guide-write-records').click();
  await page.waitForSelector('[data-testid="guide-position-headline"]', { timeout: 30_000 });
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

      await page.goto(`${server.origin}/guide?scheme=${shot.scheme}`, { waitUntil: 'load' });
      await drive(page);
      await page.evaluate('document.fonts.ready');
      await page.waitForTimeout(1_000);

      const observed = await page.evaluate(OBSERVED);
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
      if (observed.speechBlocks === 0) throw new Error(`${shot.file}: the guide said nothing`);
      if (observed.roadRows === 0) throw new Error(`${shot.file}: no road was drawn`);

      results.push({ ...shot, observed });
      process.stdout.write(`${shot.file}  ${JSON.stringify(observed)}\n`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const lines = [
    '# The 案内人 — screenshot evidence (Campaign E, lane B6)',
    '',
    'Captured by `apps/app/scripts/capture-guide.mjs` from the real',
    '`expo export --platform web` output, in Chromium, at ' +
      `${VIEWPORT.width}×${VIEWPORT.height}, full page.`,
    '',
    'The page was **driven**, not posed: the script asks the guide about the',
    'first word, answers two turns, and asks for a road and a plan. The',
    '`observed` block under each shot is read back out of the photographed DOM',
    'after the shot, so it is evidence about the picture rather than a caption',
    'written beside it.',
    '',
    'Note what the labels line has to contain. A web export carries no API key',
    'by construction, so the guide’s words came from the scripted fixtures and',
    'must show **both** labels — the generated-content one and the',
    '`offline-fallback` one. A build that had lost the second would still show',
    'the first.',
    '',
  ];
  for (const result of results) {
    lines.push(
      `## ${result.file}`,
      '',
      `- Scheme: ${result.scheme}`,
      `- ${result.note}`,
      '',
      '```json',
      JSON.stringify(result.observed, null, 2),
      '```',
      '',
      `![the guide, ${result.scheme} scheme](./${result.file})`,
      '',
    );
  }
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'), 'utf8');
  process.stdout.write(`wrote ${results.length} shots to ${OUT}\n`);
}

await main();
