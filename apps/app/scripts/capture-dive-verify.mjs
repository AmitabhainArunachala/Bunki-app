/**
 * Second-pass screenshot evidence for the fractal dive (lane B2, verification).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-dive-verify.mjs
 *
 * ## Why this script exists beside `capture-ground.mjs`
 *
 * The ground script photographs a *specimen page* that lays everything out at
 * once. The dive has no such page: the only way to see L1 is to be at L1, which
 * means the camera has to **fly the dive** — press a node, wait for the centre
 * to become that node, and photograph what arrived. So this is a driver, not a
 * framer, and that is the whole difference.
 *
 * ## What it photographs, and why those shots
 *
 * Four scale levels rather than the three asked for, in both schemes, plus the
 * reduced-motion variant of each level in light:
 *
 *   - **L2 漢字** — the landing. A kanji page *is* the dive stopped here, so
 *     this shot is the one that has to show the whole §5 contract present.
 *   - **L1 部首** — one zoom inward. Same vocabulary, different centre; that is
 *     the claim the fractal design rests on and a screenshot can carry it.
 *   - **L0 画** — two zooms inward, to a single stroke drawn inside its ghosted
 *     character. The floor of the ladder.
 *   - **L3 熟語** — one zoom *outward* from the landing, to a word. Proves the
 *     two directions are the same gesture.
 *
 * ## What is read out of the live page, rather than asserted
 *
 * Three numbers travel with the images into the README because a screenshot
 * cannot carry them and a comment must not claim them:
 *
 *   - the **level-of-detail cost** the page prints for each centre — nodes
 *     materialised, adjacency lists read, and the ladder's own total;
 *   - the **motion mode** the chrome says is running, in each variant, so the
 *     "reduced motion is stepped" claim is evidence rather than intent;
 *   - the **durable event log** before and after the flight, so this run also
 *     witnesses the exposure boundary in the browser rather than in a scan.
 *
 * Exits non-zero if any of that fails, so a broken dive cannot pass silently as
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
  argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-b2-dive-verify')),
);

const VIEWPORT = { width: 1100, height: 1400 };
const MAX_CAPTURE_HEIGHT = 16_000;

/** Where the web adapter keeps its snapshot (`src/state/persistence/shared.ts`). */
const SNAPSHOT_KEY = 'bunki-phase0';

/** 分 — the canonical fixture character, and the one the e2e suite uses. */
const START = '/kanji/%E5%88%86';

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

/** The `data-testid` react-native-web writes for a `testID`. */
const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`).locator('visible=true');

const COST_TEXT = `(() => {
  const node = document.querySelector('[data-testid="dive-cost"]');
  return node === null ? '' : node.innerText.replace(/\\s+/g, ' ').trim();
})()`;

const MOTION_TEXT = `(() => {
  const node = document.querySelector('[data-testid="dive-motion-mode"]');
  return node === null ? '' : node.innerText.replace(/\\s+/g, ' ').trim();
})()`;

const PATH_TEXT = `(() => {
  const node = document.querySelector('[data-testid="dive-path"]');
  return node === null ? '' : node.innerText.replace(/\\s+/g, ' ').trim();
})()`;

const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="screen-kanji"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

/** Grow the viewport to the page's own scroll height so a full-page shot works. */
async function layOutWholePage(page) {
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
 * Press the first ring member whose level matches, and wait for it to land.
 *
 * The ring's `testID` carries the bucket and the level — `dive-ring-inward-
 * component` — so this asks the page for a real ring rather than guessing at an
 * index, and fails loudly when the ring is not there. A camera that silently
 * photographed the wrong level would be the fabrication this whole file exists
 * to avoid.
 */
async function zoomInto(page, bucket, level) {
  const ring = byTestId(page, `dive-ring-${bucket}-${level}`);
  if ((await ring.count()) === 0) {
    throw new Error(`no ${bucket} ring at the ${level} level to zoom into`);
  }
  const before = await page.evaluate(PATH_TEXT);
  const node = ring.first().locator('[data-testid^="dive-node-"]').first();
  await node.waitFor({ state: 'visible', timeout: 30_000 });
  await node.click();
  /*
    The predicate is a string rather than a closure, like every other evaluation
    in this file: a function body would be linted as Node source, where
    `document` is undefined, and the workaround for that is to write the browser
    code as browser code.
  */
  await page.waitForFunction(`${PATH_TEXT} !== ${JSON.stringify(before)}`, undefined, {
    timeout: 30_000,
  });
  await page.waitForTimeout(700);
}

/**
 * Each shot is one zoom from a fresh landing, and that is not laziness.
 *
 * The first version of this script tried to reach L0 by zooming *through* L1,
 * and the browser refused: a component has no inward stroke ring, because
 * KanjiVG's geometry hangs off a **character** and `diveAt` mints strokes only
 * when the centre is a kanji. That refusal is the ladder being honest — 八 as a
 * shape is not a thing this build carries strokes for — and the camera was
 * wrong, not the dive. Recorded here because a script quietly rerouted around a
 * real finding is how a finding gets lost.
 */
const LEVELS = [
  { key: 'l2-kanji', title: 'L2 漢字 — the landing', zoom: null },
  {
    key: 'l1-component',
    title: 'L1 部首 — one zoom inward, to a shape',
    zoom: ['inward', 'component'],
  },
  {
    key: 'l0-stroke',
    title: 'L0 画 — one zoom inward, to a single stroke',
    zoom: ['inward', 'stroke'],
  },
  { key: 'l3-word', title: 'L3 熟語 — one zoom outward, to a word', zoom: ['outward', 'word'] },
];

/** One pass over the ladder, each shot one gesture from the same landing. */
async function flyAndShoot(page, origin, prefix, shots, readings) {
  for (const level of LEVELS) {
    await page.goto(`${origin}${START}`, { waitUntil: 'load' });
    if (level.zoom !== null) {
      await byTestId(page, 'screen-kanji').waitFor({ state: 'visible', timeout: 60_000 });
      await byTestId(page, 'dive-ladder').waitFor({ state: 'visible', timeout: 30_000 });
      await zoomInto(page, level.zoom[0], level.zoom[1]);
    }

    await byTestId(page, 'screen-kanji').waitFor({ state: 'visible', timeout: 60_000 });
    await byTestId(page, 'dive-ladder').waitFor({ state: 'visible', timeout: 30_000 });
    await page.evaluate('document.fonts.ready');
    // The stroke panel draws on mount; let it land so nothing is mid-brush.
    await page.waitForTimeout(2_500);
    await layOutWholePage(page);

    const cost = await page.evaluate(COST_TEXT);
    const motion = await page.evaluate(MOTION_TEXT);
    const where = await page.evaluate(PATH_TEXT);
    if (cost === '' || motion === '' || where === '') {
      throw new Error(`${prefix}/${level.key}: the page did not print cost, motion mode and path`);
    }

    const file = `${prefix}-${level.key}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    shots.push({ file, level, prefix });
    readings.push({ prefix, level: level.key, cost, motion, where });
    process.stdout.write(`${file}  ${where}\n`);
  }
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

  const shots = [];
  const readings = [];
  const pageErrors = [];
  let logBefore = null;
  let logAfter = null;

  /**
   * The one page error this environment already has, recorded rather than
   * swallowed.
   *
   * React 19's minified #418 is a hydration mismatch. It fires once per load on
   * `/kanji/:character` **and** on `/word/:lexemeId`, and on none of `/`,
   * `/style-guide`, `/evidence` or `/session` — so it tracks the dynamic-segment
   * route shape rather than the dive, and lane B3's page has it too. React
   * recovers by discarding the server markup and rendering on the client, which
   * is why every shot below is a real page.
   *
   * It is allowed through this gate so the evidence can be produced at all, and
   * it is written into the README beside the images so it cannot be lost. It is
   * **not** fixed here: the cause was not established, and a lane that quietly
   * suppressed an error it did not understand would be doing the opposite of
   * what this script is for.
   */
  const KNOWN_HYDRATION_ERROR = /Minified React error #418/;

  const variants = [
    { prefix: 'light', colorScheme: 'light', reducedMotion: 'no-preference' },
    { prefix: 'dark', colorScheme: 'dark', reducedMotion: 'no-preference' },
    { prefix: 'stepped-light', colorScheme: 'light', reducedMotion: 'reduce' },
  ];

  try {
    for (const variant of variants) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: variant.colorScheme,
        reducedMotion: variant.reducedMotion,
      });
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', (error) => failures.push(String(error)));

      if (variant.prefix === 'light') {
        // The durable log, read on the way in and again on the way out. An
        // empty log would make the comparison vacuous, so whatever the app has
        // already written is what this witnesses; the e2e spec is the one that
        // seeds a capture first.
        await page.goto(`${server.origin}${START}`, { waitUntil: 'load' });
        await byTestId(page, 'screen-kanji').waitFor({ state: 'visible', timeout: 60_000 });
        logBefore = await page.evaluate(
          (key) => globalThis.localStorage.getItem(key),
          SNAPSHOT_KEY,
        );
      }

      await flyAndShoot(page, server.origin, variant.prefix, shots, readings);

      if (variant.prefix === 'light') {
        logAfter = await page.evaluate((key) => globalThis.localStorage.getItem(key), SNAPSHOT_KEY);
      }

      await context.close();
      for (const failure of failures) pageErrors.push({ variant: variant.prefix, failure });
      const unexpected = failures.filter((failure) => !KNOWN_HYDRATION_ERROR.test(failure));
      if (unexpected.length > 0) {
        throw new Error(`${variant.prefix}: unexpected page errors ${JSON.stringify(unexpected)}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (logBefore !== logAfter) {
    throw new Error(
      'flying the dive changed the durable event log; exposure became a write — ' +
        `before ${String(logBefore)} after ${String(logAfter)}`,
    );
  }

  const stepped = readings.filter((entry) => entry.prefix === 'stepped-light');
  const flown = readings.filter((entry) => entry.prefix === 'light');
  if (!stepped.every((entry) => /stepped/i.test(entry.motion))) {
    throw new Error('reduced motion did not produce the stepped note the chrome promises');
  }
  if (!flown.every((entry) => /flies in/i.test(entry.motion))) {
    throw new Error('the default variant did not report the flight');
  }

  const lines = [
    '# The fractal dive — second-pass screenshot evidence (lane B2)',
    '',
    'Captured by `apps/app/scripts/capture-dive-verify.mjs` from the real',
    '`expo export --platform web` output, in Chromium, at',
    `${VIEWPORT.width} px wide, by **flying the dive** — the camera presses a`,
    'ring member and waits for the path to change before it photographs. There is',
    'no specimen page for a dive: the only way to see L1 is to be at L1.',
    '',
    'This is a *second* set beside `screenshots-b2-dive/`. It exists because a',
    'verification pass that reported on somebody else’s screenshots would be',
    'reporting a check it did not run.',
    '',
    '## What the live page said, per shot',
    '',
    'Read out of the photographed page rather than written here. The cost line is',
    'the dive’s own level-of-detail measurement; the motion line is the chrome',
    'saying which of the two modes is running.',
    '',
    '| shot | where | level-of-detail cost | motion mode |',
    '| --- | --- | --- | --- |',
    ...readings.map(
      (entry) =>
        `| \`${entry.prefix}-${entry.level}.png\` | ${entry.where} | ${entry.cost} | ${entry.motion.slice(0, 90)}… |`,
    ),
    '',
    '## The exposure boundary, witnessed in the browser',
    '',
    'The durable snapshot (`localStorage["bunki-phase0"]`) was read before the',
    'flight and again after it, in the same page, and the two are byte-identical.',
    `Before: ${logBefore === null ? '`null` — nothing had been written' : `${String(logBefore.length)} bytes`}.`,
    'This script fails if they differ.',
    '',
    'That is a weaker witness than `e2e/dive-exposure.spec.ts`, which keeps a word',
    'first so the log is non-empty and the comparison cannot be trivially true.',
    'Both are run; neither replaces the other.',
    '',
    '## Page errors seen while photographing',
    '',
    pageErrors.length === 0
      ? '- none.'
      : [
          `Every one of the ${String(pageErrors.length)} errors below is React 19's minified`,
          '**#418 — a hydration mismatch**, one per page load. It fires on',
          '`/kanji/:character` *and* on `/word/:lexemeId`, and on none of `/`,',
          '`/style-guide`, `/evidence` or `/session`, so it tracks the',
          'dynamic-segment route shape rather than this lane. React recovers by',
          'discarding the server markup and rendering on the client, which is why',
          'every shot above is a real page.',
          '',
          '**The cause was not established and it is not fixed here.** It is',
          'recorded because a page error nobody wrote down is a page error that',
          'ships.',
        ].join('\n'),
    '',
    '## What to look for',
    '',
    '- **The vocabulary does not change with depth.** The ladder, the path, the',
    '  way out, the lens row and the interior strips are in every shot. There is',
    '  no mode, and no control appears at one level and not another.',
    '- **The layout follows the real graph.** No mirror symmetry, and no line',
    '  between two ring members — the only connector drawn is the centre-to-ring',
    '  rule, which is an edge every member actually has.',
    '- **An empty level says so.** The dashed panels carry the domain’s own',
    '  sentence about *why* a level is empty. L4 連語 is empty in every build this',
    '  repository can produce and the page says that rather than leaving a blank.',
    '- **The interior strip under each node is the diagnosis.** A lit node above a',
    '  row of dark marks is a whole-word memory without a component memory.',
    '- **Luminance is recall, form is fragility, hue is attention.** The only',
    '  accent on the page marks where you are on the ladder.',
    '- **The stepped variant is the same page.** Compare `stepped-light-*` with',
    '  `light-*`: the difference is the motion note and the absence of a flight,',
    '  not a second rendering.',
    '',
  ];

  for (const shot of shots) {
    lines.push(
      `## ${shot.file} — ${shot.level.title}`,
      '',
      `- Variant: ${shot.prefix}`,
      '',
      `![${shot.level.title}, ${shot.prefix}](./${shot.file})`,
      '',
    );
  }

  writeFileSync(join(OUT, 'README.md'), `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`\n${String(shots.length)} shots → ${OUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  process.exitCode = 1;
});
