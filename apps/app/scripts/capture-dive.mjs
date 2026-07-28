/**
 * Screenshot evidence for the fractal dive (Campaign E, lane B2).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-dive.mjs
 *
 * Photographs the character page — which is the dive stopped at L2 — and then
 * **drives it**, zooming down the ladder and photographing each level, in both
 * colour schemes and once more with `prefers-reduced-motion: reduce`.
 *
 * ## Why it drives rather than loads
 *
 * A screenshot of a URL proves the route renders. The claim this lane has to
 * support is that *zooming works and is the same gesture at every level*, and
 * the only way to photograph that is to press the thing. So each shot after the
 * first is taken after a real click on a real node, and the level the page says
 * it is on is read out of the page and written into the README beside the image.
 * A shot whose page disagrees with its filename fails the run.
 *
 * ## The reduced-motion pass is not a duplicate
 *
 * `prefers-reduced-motion: reduce` is a WCAG obligation here, not a preference:
 * continuous zoom is a known vertigo trigger. Under reduction the dive is
 * stepped — `resolveDuration` returns 0, the flight never runs, each level
 * simply arrives — and the surface *says so on screen*. The reduced pass
 * photographs that sentence, so "the stepped variant exists" is a picture rather
 * than a paragraph.
 *
 * ## What is also read out of the page
 *
 * The cost line the dive renders — how many nodes it materialised out of how
 * many the build indexes — is read from the DOM and written into the README.
 * That is the level-of-detail claim measured in the shipped bundle rather than
 * in a unit test.
 *
 * Exits non-zero if a shot fails, so a broken dive cannot pass silently as
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
const OUT = resolve(argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-b2-dive')));

/** A desktop reading width: the reviewer here is the operator at a laptop. */
const VIEWPORT = { width: 1100, height: 1500 };
const MAX_CAPTURE_HEIGHT = 16_000;

/**
 * 分 — the character the whole closed loop is built around (OD-02, 分岐).
 *
 * Chosen because it is the one character every other lane's evidence also uses,
 * so a reviewer can put these shots beside theirs; and because it has real
 * components, real compounds and real geometry, so no level is empty for a
 * reason that is about the choice of character rather than about the data.
 */
const CHARACTER = '分';

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
  // A dynamic route: the static export writes `kanji/[character].html` and a
  // real host resolves `/kanji/分` to it, letting the client router read the
  // parameter. Nothing is rewritten or synthesised — a path with no bracketed
  // counterpart still 404s.
  const segments = clean.split('/').filter((part) => part !== '');
  if (segments.length === 2) {
    const dynamic = join(DIST, segments[0], '[character].html');
    if (existsSync(dynamic)) return dynamic;
  }
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

/** The level the page itself says it is on — read, never assumed. */
const CENTRE_LEVEL = `(() => {
  const ladder = document.querySelector('[data-testid="dive-ladder"]');
  if (ladder === null) return '';
  const label = ladder.getAttribute('aria-label') ?? '';
  const match = /Scale: ([a-z ]+), level (\\d)/.exec(label);
  return match === null ? '' : match[1] + '|' + match[2];
})()`;

const DIVE_PATH = `(() => {
  const node = document.querySelector('[data-testid="dive-path"]');
  return node === null ? '' : node.innerText.replace(/\\s+/g, ' ').trim();
})()`;

const DIVE_COST = `(() => {
  const node = document.querySelector('[data-testid="dive-cost"]');
  return node === null ? '' : node.innerText.replace(/\\s+/g, ' ').trim();
})()`;

const MOTION_MODE = `(() => {
  const node = document.querySelector('[data-testid="dive-motion-mode"]');
  return node === null ? '' : node.innerText.replace(/\\s+/g, ' ').trim();
})()`;

const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="screen-kanji"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

async function growToContent(page) {
  const height = await page.evaluate(CONTENT_HEIGHT);
  if (height > VIEWPORT.height) {
    await page.setViewportSize({
      width: VIEWPORT.width,
      height: Math.min(height + 80, MAX_CAPTURE_HEIGHT),
    });
    await page.waitForTimeout(600);
  }
}

/**
 * Click the first visible node of a given ring, and wait for the centre to move.
 *
 * Returns `false` when the ring is not on the page, so a caller can record an
 * honest "this level was not reachable from here" rather than pretending.
 */
async function zoomInto(page, bucket, level) {
  const ring = page.locator(`[data-testid="dive-ring-${bucket}-${level}"]`).first();
  if ((await ring.count()) === 0) return false;
  const node = ring.locator('[data-testid^="dive-node-"]').first();
  if ((await node.count()) === 0) return false;
  const before = await page.evaluate(DIVE_PATH);
  await node.scrollIntoViewIfNeeded();
  await node.click();
  await page.waitForFunction(`${DIVE_PATH} !== ${JSON.stringify(before)}`, undefined, {
    timeout: 15_000,
  });
  // Let the flight settle so nothing is mid-transition in the frame.
  await page.waitForTimeout(900);
  return true;
}

async function shoot(page, file, expectedLevel) {
  const [level, depth] = (await page.evaluate(CENTRE_LEVEL)).split('|');
  if (expectedLevel !== null && level !== expectedLevel) {
    throw new Error(`${file}: the page says the centre is '${level}', not '${expectedLevel}'`);
  }
  await growToContent(page);
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  process.stdout.write(`${file}\n`);
  return {
    file,
    level,
    depth,
    path: await page.evaluate(DIVE_PATH),
    cost: await page.evaluate(DIVE_COST),
    motion: await page.evaluate(MOTION_MODE),
  };
}

/**
 * One pass: open the character page, photograph it, then dive and photograph.
 *
 * The three levels are the character itself (L2), a component of it (L1), and
 * one of its strokes (L0) — inward, which is the direction the shipped data is
 * densest in and the one the diagnosis is about. The outward ring is in every
 * frame, so a reviewer can see both directions in each shot.
 */
async function pass(browser, server, { scheme, reducedMotion, prefix }) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(String(error)));

  const url = `${server.origin}/kanji/${encodeURIComponent(CHARACTER)}?scheme=${scheme}&strokes=all`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="screen-kanji"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="dive-ladder"]', { timeout: 30_000 });
  await page.evaluate('document.fonts.ready');
  await page.waitForTimeout(2_000);

  const shots = [];
  shots.push(await shoot(page, `${prefix}-l2-kanji.png`, 'character'));

  if (await zoomInto(page, 'inward', 'component')) {
    shots.push(await shoot(page, `${prefix}-l1-component.png`, 'component'));
  } else {
    throw new Error(`${prefix}: no component ring to dive into`);
  }

  // Back out one, then into a stroke of the character rather than of the
  // component — the character is the node that has geometry in this build.
  await page.locator('[data-testid="dive-back"]').first().click();
  await page.waitForTimeout(900);
  if (await zoomInto(page, 'inward', 'stroke')) {
    shots.push(await shoot(page, `${prefix}-l0-stroke.png`, 'stroke'));
  } else {
    throw new Error(`${prefix}: no stroke ring to dive into`);
  }

  // And out in one gesture, which is the affordance risk 3 asks for.
  await page.locator('[data-testid="dive-surface"]').first().click();
  await page.waitForTimeout(900);
  const surfaced = await page.evaluate(CENTRE_LEVEL);
  if (!surfaced.startsWith('character')) {
    throw new Error(`${prefix}: one gesture out landed on '${surfaced}', not the character`);
  }

  await context.close();
  if (failures.length > 0) throw new Error(`${prefix}: page errors ${JSON.stringify(failures)}`);
  return shots;
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

  const passes = [
    { scheme: 'light', reducedMotion: false, prefix: 'light' },
    { scheme: 'dark', reducedMotion: false, prefix: 'dark' },
    { scheme: 'light', reducedMotion: true, prefix: 'stepped-light' },
  ];

  let all = [];
  try {
    for (const spec of passes) {
      all = [...all, ...(await pass(browser, server, spec)).map((shot) => ({ ...shot, ...spec }))];
    }
  } finally {
    await browser.close();
    server.close();
  }

  const flight = all.find((shot) => !shot.reducedMotion);
  const stepped = all.find((shot) => shot.reducedMotion);

  const lines = [
    '# The fractal dive — screenshot evidence (Campaign E, lane B2)',
    '',
    'Captured by `apps/app/scripts/capture-dive.mjs` from the real',
    '`expo export --platform web` output, in Chromium, at',
    `${VIEWPORT.width} px wide with the viewport grown to the page's own scroll`,
    'height. Every shot after the first was taken **after a real click on a real',
    'node**: the script drives the dive rather than loading three URLs, because',
    'the claim is that zooming works and is the same gesture at every level.',
    '',
    `Subject: ${CHARACTER}, the character the closed loop is built around.`,
    '',
    '## What each shot is',
    '',
    '| file | scheme | motion | level the page reports | path the page shows |',
    '| --- | --- | --- | --- | --- |',
    ...all.map(
      (shot) =>
        `| \`${shot.file}\` | ${shot.scheme} | ${shot.reducedMotion ? 'reduced' : 'full'} | ${shot.level} (L${shot.depth}) | ${shot.path} |`,
    ),
    '',
    'The level column is read out of the photographed page rather than derived',
    'from the filename, and the script fails if the two disagree. A screenshot',
    'whose caption is a guess is not evidence.',
    '',
    '## Level of detail, measured in the shipped bundle',
    '',
    'The dive renders what it materialised, and this is that line read out of the',
    'page at the character level:',
    '',
    `> ${flight?.cost ?? '(not captured)'}`,
    '',
    'That is the whole level-of-detail contract in one sentence, and it came from',
    'the browser rather than from a unit test.',
    '',
    '## The stepped variant',
    '',
    'Under `prefers-reduced-motion: reduce` the dive is stepped: `resolveDuration`',
    'returns 0, the flight never runs, and each level arrives in place. Continuous',
    'zoom is a known vertigo trigger and a WCAG obligation, not a preference — so',
    'the surface also *says* which mode it is running, and that sentence is in the',
    'shot. Read out of the page:',
    '',
    `- full motion: > ${flight?.motion ?? '(not captured)'}`,
    `- reduced: > ${stepped?.motion ?? '(not captured)'}`,
    '',
    '## What these shots do not show',
    '',
    '- **A phone.** Chromium on Linux at a desktop width. Nothing here is a claim',
    '  about a device, and the primary target is a phone.',
    '- **The flight itself.** A still cannot photograph motion. What is shown is',
    '  that each level arrives and that the surface states its own mode; the',
    '  animation is asserted by `resolveDuration` returning 0 under reduction,',
    '  which `test/theme-motion.test.ts` holds.',
    '- **A learner with any recorded state.** These are captured in a fresh',
    '  context, so every mark is at the no-evidence end of the ramp. That is the',
    '  honest default view, and it is why the diagnosis panel says there is not',
    '  enough recorded for the comparison to say anything.',
    '- **L3 to L5.** The outward rings are in every frame, but the dive was driven',
    '  inward, which is the direction this dictionary tier is densest in and the',
    '  one the surface-bright/interior-dark diagnosis is about.',
    '',
  ];

  writeFileSync(join(OUT, 'README.md'), `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`README.md\n${String(all.length)} shots in ${OUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
