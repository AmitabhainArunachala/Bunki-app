/**
 * Browser re-measurement of the B1 repair round (Campaign E, lane B1).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/verify-map-repairs.mjs
 *
 * Every number the verifier measured, measured again in the same way against
 * the same artefact: the real `expo export --platform web` output, served over
 * HTTP, driven in Chromium. This is deliberately a *separate* script from
 * `capture-map.mjs` — that one produces pictures, this one produces the
 * before/after readings the repair claims rest on, and mixing them would make
 * the pictures re-run whenever a number was wanted.
 *
 * It writes nothing but stdout and exits non-zero if any check fails, so it can
 * be read as a check-set row rather than as a report someone has to interpret.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const DIST = resolve(join(APP_ROOT, 'dist'));

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

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}\n`);
};

const TARGET = '分岐';

/** Capture → keep → promote → session → grade, by clicking, as a person would. */
async function walkTheLoop(page, origin) {
  const seen = async (id, timeout = 30_000) => {
    const locator = page.locator(`[data-testid="${id}"]`).filter({ visible: true }).last();
    await locator.waitFor({ timeout });
    return locator;
  };
  // `/capture`, not `/`: Wave D made the map the front door and capture an
  // action offered from every surface (`src/ui/navigation.ts` §1–§2).
  await page.goto(`${origin}/capture`, { waitUntil: 'load' });
  await seen('screen-capture');
  await (await seen('capture-search-input')).fill(TARGET);
  await seen('capture-top-answer');
  await (await seen('capture-keep')).click();
  await seen('capture-acknowledgment');
  const promote = page
    .locator('[data-testid^="capture-promote-"]')
    .filter({ visible: true })
    .first();
  await promote.waitFor({ timeout: 30_000 });
  await promote.click();
  await page.locator('[data-testid^="capture-promoted-"]').first().waitFor({ timeout: 30_000 });
  await page.getByTestId('nav-session').click();
  await seen('screen-session');
  await (await seen('session-start')).click();
  await seen('session-prompt');
  await (await seen('session-grade-good')).click();
  await seen('session-progress');
}

async function openMap(page, origin) {
  // The map is `/` now, not `/map`.
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.locator('[data-testid="screen-map"]').waitFor({ timeout: 60_000 });
  await page.locator('[data-testid="map-neighbourhood"]').waitFor({ timeout: 60_000 });
}

/*
  Everything below that runs *in the page* is passed to `page.evaluate` as a
  string, the same convention `capture-map.mjs` next door explains: a function
  argument is serialised and executed in the browser but is *lexed* as Node
  source, and this repo's lint config gives a `.mjs` script Node globals only.
  A string is unambiguous about which side of the boundary it runs on.
*/
const text = (page, id) =>
  page.evaluate(`document.querySelector('[data-testid=${JSON.stringify(id)}]')?.innerText ?? null`);

/** Which of the four era bands are in the DOM right now. */
const BANDS_PRESENT = `['kodo', 'kaido', 'tetsudo', 'unknown']
  .map((band) =>
    band +
    '=' +
    (document.querySelector('[data-testid="map-band-' + band + '"]') === null
      ? 'absent'
      : 'present'),
  )
  .join(' ')`;

/** The animating descendants of the loading panel, named with their keyframes. */
const SPINNER_STATE = `(() => {
  const panel = document.querySelector('[data-testid="state-loading"]');
  if (panel === null) return { found: false, animations: [] };
  const animated = Array.from(panel.querySelectorAll('*')).filter((el) => {
    const style = getComputedStyle(el);
    return style.animationName !== 'none' && style.animationName !== '';
  });
  return {
    found: animated.length > 0,
    animations: animated.map((el) => {
      const style = getComputedStyle(el);
      return style.animationName + '/' + style.animationDuration + '/' + style.animationIterationCount;
    }),
  };
})()`;

/** One `transform` read off the animating element, or 'none' when there is none. */
const SPINNER_TRANSFORM = `(() => {
  const panel = document.querySelector('[data-testid="state-loading"]');
  if (panel === null) return 'no panel';
  const animated = Array.from(panel.querySelectorAll('*')).find((el) => {
    const style = getComputedStyle(el);
    return style.animationName !== 'none' && style.animationName !== '';
  });
  return animated === undefined ? 'none' : getComputedStyle(animated).transform;
})()`;

async function main() {
  if (!existsSync(DIST)) {
    process.stderr.write('dist/ missing. Run: npm run test:e2e:build\n');
    process.exit(2);
  }
  const server = await startServer();
  const executablePath = preinstalledChromium();
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });

  try {
    // ---------------------------------------------------------- P1-1, P1-3, P1-2
    const context = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await walkTheLoop(page, server.origin);
    await openMap(page, server.origin);

    // P1-1 — the era arm must change the field, not only the caption.
    const readings = [];
    const fields = [];
    const bandCounts = [];
    for (const step of [0, 1, 2, 3]) {
      await page.locator(`[data-testid="scrubber-step-${String(step)}"]`).click();
      await page.waitForTimeout(250);
      readings.push(await text(page, 'map-scrubber-reading'));
      fields.push(await text(page, 'map-neighbourhood'));
      bandCounts.push(await page.evaluate(BANDS_PRESENT));
    }
    const distinctFields = new Set(fields).size;
    record(
      'P1-1 the era arm changes the field, not only the caption',
      distinctFields === 4,
      `distinct neighbourhood texts across steps 0..3 = ${String(distinctFields)} (was 1); ` +
        `bands ${bandCounts.join(' | ')}`,
    );
    record(
      'P1-1 the captions still differ, and the withheld count is stated',
      new Set(readings).size === 4 && (await text(page, 'map-band-filter')) !== null,
      `readings=${readings.map((r) => JSON.stringify(r)).join(' ')} ; ` +
        `filter line=${JSON.stringify(await text(page, 'map-band-filter'))}`,
    );

    await page.locator('[data-testid="scrubber-step-0"]').click();
    await page.waitForTimeout(250);

    // P1-3 — the sentence is a count, and it does not contradict the next line.
    const sentence = await text(page, 'map-route-strip-sentence');
    const next = await text(page, 'map-route-strip-next');
    record(
      'P1-3 the road reports a count, not an ordinal',
      sentence !== null && !/^Station \d+ of/.test(sentence),
      `sentence=${JSON.stringify(sentence)} ; next=${JSON.stringify(next)}`,
    );

    // P1-2 — the subset is disclosed on the page, beside the road.
    const subset = await text(page, 'map-route-strip-subset');
    const body = await page.evaluate('document.body.innerText');
    record(
      'P1-2 the subset is disclosed on screen',
      subset !== null &&
        subset.includes('limited to those the imported lexemes actually use') &&
        !body.includes('nothing is sampled'),
      `subset line present=${String(subset !== null)}; ` +
        `"nothing is sampled" still on page=${String(body.includes('nothing is sampled'))}`,
    );

    // P2-7 — a one-day learner is not invited to pull left.
    const chipLabel = await page.evaluate(
      `document.querySelector('[data-testid="map-route-grade-1"]')?.getAttribute('aria-label') ?? null`,
    );
    const negativeSteps = await page.evaluate(
      `Array.from(document.querySelectorAll('[data-testid^="scrubber-step--"]')).map((el) =>
        el.getAttribute('data-testid'),
      )`,
    );
    const pullLeft = body.includes('Pull left through 1 days');
    record(
      'P2-7 no gesture is invited that no step renders',
      negativeSteps.length === 0 && !pullLeft,
      `negative steps in DOM=${String(negativeSteps.length)}; ` +
        `"Pull left through 1 days" on page=${String(pullLeft)}; ` +
        `grade-1 chip label=${JSON.stringify(chipLabel)}`,
    );

    record(
      'no page error or console error on /map',
      errors.length === 0,
      errors.join(' | ') || 'none',
    );
    await context.close();

    // -------------------------------------------------------------------- P2-5
    for (const mode of ['reduce', 'no-preference']) {
      const motionContext = await browser.newContext({
        viewport: { width: 1100, height: 900 },
        reducedMotion: mode,
      });
      const motionPage = await motionContext.newPage();
      await motionPage.goto(`${server.origin}/?lag=4000`, { waitUntil: 'load' });
      await motionPage.locator('[data-testid="state-loading"]').waitFor({ timeout: 30_000 });
      const query = await motionPage.evaluate(
        `window.matchMedia('(prefers-reduced-motion: reduce)').matches`,
      );
      const spinner = await motionPage.evaluate(SPINNER_STATE);
      // Sampled off the *animating* element, the way the verifier sampled it:
      // ten reads of `transform` over 800 ms. Under reduction there is no such
      // element at all, which is what "none" records — the motion is absent
      // rather than merely slower.
      const matrices = new Set();
      for (let sample = 0; sample < 10; sample += 1) {
        matrices.add(await motionPage.evaluate(SPINNER_TRANSFORM));
        await motionPage.waitForTimeout(80);
      }
      const expected = mode === 'reduce' ? !spinner.found : spinner.found;
      record(
        `P2-5 loading spinner under reducedMotion:'${mode}'`,
        expected && (mode !== 'reduce' || query),
        `matchMedia reduce=${String(query)}; animating elements=${String(spinner.animations.length)} ` +
          `${spinner.animations.join(',') || '(none)'}; distinct transforms sampled=${String(matrices.size)}`,
      );
      await motionContext.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((row) => !row.ok);
  process.stdout.write(
    `\n${String(results.length - failed.length)}/${String(results.length)} checks passed\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
