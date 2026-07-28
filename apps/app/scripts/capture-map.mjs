/**
 * Screenshot evidence for the map (Campaign E, lane B1).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-map.mjs
 *
 * Drives `/map` in Chromium against the real `expo export --platform web`
 * output and photographs each era band in both colour schemes, plus the whole
 * page in both. Nothing here is rendered by a test double: the page is served
 * from `dist/`, loaded over HTTP, and the shots are of what a learner would see.
 *
 * ## What it also measures, because a screenshot cannot
 *
 * A picture proves the map drew. It does not prove the map is *affordable*, and
 * this lane was named as the one most likely to repeat A2's "the time scrubber
 * rebuilt the whole index on every frame". So the run also measures, in the real
 * browser:
 *
 *   - how long the page takes to become interactive from a cold load, which
 *     includes the one-off Atlas build over the whole dictionary;
 *   - the wall-clock cost of a **lens change** and of a **scrubber step**, both
 *     of which redraw every node on screen.
 *
 * Those two interactions are the ones that would show a per-frame rebuild. The
 * numbers go into the README beside the images, and they are Chromium on a build
 * machine rather than a phone — which the README says, because a build-machine
 * number presented as a device number is the kind of claim this project has been
 * caught making before.
 *
 * Exits non-zero if a shot fails or the page logs an error, so a broken map
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
const OUT = resolve(argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-b1-map')));

const VIEWPORT = { width: 1100, height: 1400 };
const MAX_CAPTURE_HEIGHT = 16_000;

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

const SCHEMES = ['light', 'dark'];

/**
 * The four bands, including the one that is not a road.
 *
 * `unknown` is photographed alongside the three era layers on purpose: over this
 * dictionary it is the *largest* band, and a set of evidence that showed only
 * the three inhabited-looking layers would misrepresent the surface.
 */
const BANDS = [
  {
    key: 'kodo',
    written: '古道',
    note: 'The ancient road. The only layer this dictionary can populate: a single native (訓) morpheme is 和語, the oldest lexical stratum. Base 鳥の子 torinoko by day and 藍海松茶 ai-mirucha by night, under a 白緑 byakuroku mist wash.',
  },
  {
    key: 'kaido',
    written: '街道',
    note: 'The Edo highway. Rendered, and empty, and it says so on screen. 漢語 spans all three layers and nothing in this dictionary dates it, so no rule places a word here that would not be a guess.',
  },
  {
    key: 'tetsudo',
    written: '鉄道',
    note: 'The rail era. Same situation as 街道: real ground, no members, stated plainly. This is also the only register where emitted light is permitted, which in this build means no lit point can appear — there is nothing here to light.',
  },
  {
    key: 'unknown',
    written: '—',
    note: 'Not a road, and drawn on no era ground at all. A node whose era we cannot establish sits on a plain card, because defaulting it onto a layer is the guessed era the whole era module exists to refuse. Over this dictionary it is the largest band.',
  },
];

const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="screen-map"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

/**
 * Time one interaction, in the page, to the frame after it settles.
 *
 * The body is a **string** rather than a function, as in `capture-ground.mjs`
 * next door. A function passed to `page.evaluate` is serialised and run in the
 * browser, so its `document` and `requestAnimationFrame` are the page's — but it
 * is *lexed* as Node source, and this repo's lint config gives a `.mjs` script
 * Node globals only. A string is unambiguous about which side of the boundary it
 * runs on, which is the honest reading anyway.
 *
 * Two `requestAnimationFrame`s: one gets to the frame the click scheduled, the
 * second to the frame after it has been painted.
 */
async function timeInteraction(page, selector) {
  return page.evaluate(`(async () => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (element === null) return null;
    const started = performance.now();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((done) => {
      requestAnimationFrame(() => { requestAnimationFrame(() => { done(); }); });
    });
    return Math.round((performance.now() - started) * 100) / 100;
  })()`);
}

/**
 * The word the loop is walked with. The seed's canonical target.
 *
 * Kept as a literal rather than imported from `@bunki/seed`: this is a Node
 * script and the seed is a TypeScript package, and `DEFAULT_CANONICAL_TARGET` is
 * asserted against this same string by the app's own suite, so the two cannot
 * drift silently.
 */
const TARGET = '分岐';

/**
 * Walk the real closed loop in the browser, so the map has something to draw.
 *
 * ## Why this is here and not a seeded store
 *
 * A cold load has an empty event log, so every lens on every node is
 * "nothing observed" and the road reads station 0. That is the *correct*
 * rendering of an empty ledger — and it is also a picture in which the lane's
 * central claim, that brightness is real FSRS retrievability, cannot be seen at
 * all. Photographing only that state would be filing evidence for the one thing
 * the pictures do not show.
 *
 * So the loop is walked the way a person walks it, by clicking: capture the
 * seed's canonical target, keep it, take it up for study, sit the session the
 * promotion planned, and answer one probe. Nothing here reaches past a rendered
 * control, nothing seeds a store, and nothing writes an event — the app's own
 * evidence gate mints every one of them, which is the point. What the map then
 * draws is a memory state the pinned scheduler produced from a review the gate
 * admitted.
 *
 * Returns `null` when a step is not on screen, and the caller records that in
 * the README rather than pretending the walk happened.
 */
async function walkTheLoop(page, origin) {
  const seen = async (id, timeout = 30_000) => {
    const locator = page.locator(`[data-testid="${id}"]`).filter({ visible: true }).last();
    await locator.waitFor({ timeout });
    return locator;
  };
  try {
    // `/capture`, not `/`: Wave D made the map the front door and capture
    // an action offered from every surface (`src/ui/navigation.ts` §1–§2).
    await page.goto(`${origin}/capture`, { waitUntil: 'load' });
    await seen('screen-capture');

    // 1. capture and keep
    await (await seen('capture-search-input')).fill(TARGET);
    await seen('capture-top-answer');
    await (await seen('capture-keep')).click();
    await seen('capture-acknowledgment');

    // 2. take it up for study — the explicit promotion that activates a contract
    const promote = page
      .locator('[data-testid^="capture-promote-"]')
      .filter({ visible: true })
      .first();
    await promote.waitFor({ timeout: 30_000 });
    await promote.click();
    await page.locator('[data-testid^="capture-promoted-"]').first().waitFor({ timeout: 30_000 });

    // 3. sit the session and answer one declared probe
    await page.getByTestId('nav-session').click();
    await seen('screen-session');
    await (await seen('session-start')).click();
    await seen('session-prompt');
    await (await seen('session-grade-good')).click();
    await seen('session-progress');

    return (await seen('session-progress')).innerText();
  } catch (error) {
    process.stderr.write(`[loop] not walked: ${String(error)}\n`);
    return null;
  }
}

/**
 * One node, read through each of the five lenses in turn.
 *
 * This is the no-collapsed-light rule made photographable. REQ-UI-07 forbids one
 * mastery light for a node, and the way to *show* that rather than assert it is
 * to hold the node still, move the lens, and read what the node says about
 * itself each time. The label is the app's own accessible name, taken out of the
 * DOM after each chip is pressed, so it is what a screen reader would say.
 *
 * The origin node is used because it is the one the walked loop attached a
 * contract to; every other node stays unmeasured on every lens, which is also
 * part of the answer.
 */
async function readEveryLens(page, nodeTestId) {
  const lenses = ['reading', 'meaning', 'listening', 'production', 'writing'];
  const out = [];
  for (const lens of lenses) {
    const chip = page.locator(`[data-testid="lens-${lens}"]`).filter({ visible: true }).last();
    if ((await chip.count()) === 0) continue;
    await chip.click();
    await page.waitForTimeout(250);
    const node = page.locator(`[data-testid="${nodeTestId}"]`).filter({ visible: true }).first();
    const label = (await node.count()) === 0 ? null : await node.getAttribute('aria-label');
    out.push({ lens, label });
  }
  const back = page.locator('[data-testid="lens-reading"]').filter({ visible: true }).last();
  if ((await back.count()) > 0) await back.click();
  await page.waitForTimeout(250);
  return out;
}

/** What the page says about itself, read out of the loaded DOM. */
const OBSERVED = `(() => {
  const text = (id) => {
    const node = document.querySelector('[data-testid="' + id + '"]');
    return node === null ? '' : node.textContent;
  };
  /*
    The origin's own node, found by what the map says about it rather than by
    DOM order or by the target string. The centre of a neighbourhood is the node
    at depth 0, and every node's accessible name ends with its own hop count —
    so "0 hops away" is the map's own statement of which node is the centre.

    Taking the first map-node-lexeme element instead was wrong and the README
    caught it: the bands are stacked oldest road first, so the first lexeme in
    the document is whichever word landed on 古道, two hops from the centre.
  */
  const origin =
    Array.from(document.querySelectorAll('[data-testid^="map-node-"]')).find((node) =>
      (node.getAttribute('aria-label') || '').includes('0 hops away'),
    ) || null;
  const originId = origin === null ? '' : (origin.getAttribute('data-testid') || '');
  return {
    routes: document.querySelectorAll('[data-testid^="map-route-grade-"]').length,
    standing: text('map-standing'),
    today: text('map-today'),
    station: text('map-route-strip-sentence'),
    scrubber: text('map-scrubber-reading'),
    originTestId: originId,
    originLabel: origin === null ? '' : (origin.getAttribute('aria-label') || ''),
  };
})()`;

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
  const measurements = [];
  let observed = {
    routes: 0,
    standing: '',
    today: '',
    station: '',
    scrubber: '',
    originTestId: '',
    originLabel: '',
  };
  let loopProgress = null;
  let perLens = [];

  try {
    for (const scheme of SCHEMES) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', (error) => failures.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') failures.push(`console: ${message.text()}`);
      });

      // The map draws a ledger, so there has to be one. This is the app's own
      // loop, clicked; see `walkTheLoop`.
      const walked = await walkTheLoop(page, server.origin);
      if (scheme === 'light') loopProgress = walked;

      const loadStarted = Date.now();
      await page.goto(`${server.origin}/?scheme=${scheme}`, { waitUntil: 'load' });
      // The map is interactive when its own field has drawn, which is after the
      // one-off Atlas build over the whole dictionary.
      await page.waitForSelector('[data-testid="map-route-strip"]', { timeout: 60_000 });
      const interactiveMs = Date.now() - loadStarted;
      await page.evaluate('document.fonts.ready');
      await page.waitForTimeout(1_500);

      // --- what the page actually says, read back out of it -----------------
      if (scheme === 'light') {
        observed = await page.evaluate(OBSERVED);
        perLens =
          observed.originTestId === '' ? [] : await readEveryLens(page, observed.originTestId);
      }

      // --- the two interactions that would show a per-frame rebuild ---------
      const lensMs = await timeInteraction(page, '[data-testid="lens-production"]');
      const scrubMs = await timeInteraction(page, '[data-testid="scrubber-step-2"]');
      measurements.push({ scheme, interactiveMs, lensMs, scrubMs });
      // Put the surface back where the shots expect it.
      await timeInteraction(page, '[data-testid="scrubber-step-0"]');
      await timeInteraction(page, '[data-testid="lens-reading"]');
      await page.waitForTimeout(500);

      const contentHeight = await page.evaluate(CONTENT_HEIGHT);
      if (contentHeight > VIEWPORT.height) {
        await page.setViewportSize({
          width: VIEWPORT.width,
          height: Math.min(contentHeight + 80, MAX_CAPTURE_HEIGHT),
        });
        await page.waitForTimeout(800);
      }

      for (const band of BANDS) {
        const file = `${band.key}-${scheme}.png`;
        const locator = page.locator(`[data-testid="map-band-${band.key}"]`).first();
        const ground = page.locator(`[data-testid="map-ground-${band.key}"]`).first();
        const target = (await ground.count()) > 0 ? ground : locator;
        if ((await target.count()) === 0) {
          throw new Error(`no element for band ${band.key} in ${scheme}`);
        }
        await target.scrollIntoViewIfNeeded();
        await target.screenshot({ path: join(OUT, file) });
        shots.push({ file, scheme, band });
        process.stdout.write(`${file}\n`);
      }

      const wholeFile = `map-${scheme}.png`;
      await page.screenshot({ path: join(OUT, wholeFile), fullPage: true });
      shots.push({ file: wholeFile, scheme, band: null });
      process.stdout.write(`${wholeFile}\n`);

      await context.close();
      if (failures.length > 0) {
        throw new Error(`${scheme}: page errors ${JSON.stringify(failures)}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const row = (m) =>
    `| ${m.scheme} | ${String(m.interactiveMs)} ms | ${m.lensMs === null ? 'n/a' : `${String(m.lensMs)} ms`} | ${m.scrubMs === null ? 'n/a' : `${String(m.scrubMs)} ms`} |`;

  const lines = [
    '# The map — screenshot evidence (Campaign E, lane B1)',
    '',
    'Captured by `apps/app/scripts/capture-map.mjs`, which serves the real',
    '`expo export --platform web` output over HTTP and drives `/map` in Chromium',
    `at ${String(VIEWPORT.width)} px wide, growing the viewport to the screen's own scroll`,
    'height so every band is laid out before it is framed. The run fails if the',
    'page throws or logs an error, so these images cannot be of a broken screen.',
    '',
    '## The four bands',
    '',
    'Three era layers and one state that is not a layer. **街道 and 鉄道 are',
    'photographed empty, and that is the finding rather than a gap.** Lane A2′',
    'measured that 9.8% of the dictionary can be placed and all of it lands on',
    '古道; nothing in the data dates a 漢語 word, so a rule that filled the other',
    'two would be a guess. `unknown` is drawn on no era ground at all.',
    '',
    ...BANDS.flatMap((band) => [
      `### ${band.written} \`${band.key}\``,
      '',
      band.note,
      '',
      `| light | dark |`,
      `| --- | --- |`,
      `| ![${band.key} light](${band.key}-light.png) | ![${band.key} dark](${band.key}-dark.png) |`,
      '',
    ]),
    '## The whole screen',
    '',
    '| light | dark |',
    '| --- | --- |',
    '| ![map light](map-light.png) | ![map dark](map-dark.png) |',
    '',
    '## What the page said when it was photographed',
    '',
    'Read out of the loaded DOM rather than retyped from the source, so these are',
    'the strings a learner saw.',
    '',
    `- routes offered: **${String(observed.routes)}**`,
    `- standing: ${observed.standing === '' ? '_(not found)_' : `“${observed.standing}”`}`,
    `- today: ${observed.today === '' ? '_(not found)_' : `“${observed.today}”`}`,
    `- position on the road: ${observed.station === '' ? '_(not found)_' : `“${observed.station}”`}`,
    `- scrubber: ${observed.scrubber === '' ? '_(not found)_' : `“${observed.scrubber}”`}`,
    '',
    '## One node, five lenses — the no-collapsed-light rule, photographed',
    '',
    'REQ-UI-07 forbids collapsing reading, meaning, listening, production and',
    'writing into one mastery light. The way to *show* that rather than assert it',
    'is to hold one node still, move the lens, and read what the node says about',
    'itself each time. Below is the map’s own accessible name for the origin node',
    'after each lens chip was pressed, taken out of the loaded DOM — so it is what',
    'a screen reader would say, not what the source claims it would say.',
    '',
    ...(perLens.length === 0
      ? ['_(the origin node was not found, so nothing was read)_', '']
      : [
          '| lens | what the node says |',
          '| --- | --- |',
          ...perLens.map(
            (row) => `| ${row.lens} | ${row.label === null ? '_(no label)_' : row.label} |`,
          ),
          '',
          /*
            Derived from the table above, never asserted beside it. The first
            version of this paragraph said "the lens that skill belongs to reads
            differently from the other four" over a table in which all five rows
            were identical, because the origin node had been picked by DOM order
            and was the wrong node. A sentence about a measurement has to be
            computed from it.
          */
          ...(new Set(perLens.map((row) => row.label)).size > 1
            ? [
                'The five rows are **not** the same, and that is the rule holding: one',
                'review was admitted, on one contract, for one skill, and only the lens',
                'that skill belongs to has anything to report. The others read "No',
                'evidence yet" rather than reading weak — the unknown-is-not-zero',
                'distinction the projection is built around. `writing` has no contract',
                'in this build at all and can never read anything else.',
              ]
            : [
                'All five rows read the same here, and that is worth stating plainly',
                'rather than glossing: the walked loop put its review on a contract',
                'this node does not carry, so this node is unmeasured on every lens.',
                'The rule that the five are computed separately is held by the unit',
                'suite; this table did not get to show it.',
              ]),
          '',
        ]),
    '## The ledger these pictures were taken over',
    '',
    loopProgress === null
      ? [
          '**The loop was not walked.** A step of the capture → keep → promote →',
          'sit → grade path was not on screen, so these images are of a map over an',
          'empty event log: every lens reads "nothing observed" and the road reads',
          'station 0. That is the correct rendering of an empty ledger, and it is',
          'also a picture in which brightness-is-retrievability cannot be seen.',
          'Treat the lit-node claim as held by the unit suite alone.',
        ].join('\n')
      : [
          'Before each capture the script walked the app’s own closed loop by',
          `clicking: search ${TARGET}, keep it, take it up for study, start the`,
          'session the promotion planned, and answer one declared probe. No store',
          'was seeded and no event was written by this script — the evidence gate',
          'minted every one of them, and the pinned scheduler produced the memory',
          'state the map then draws. The session reported:',
          '',
          `> ${loopProgress.replace(/\n+/g, ' · ')}`,
          '',
          'So the counts and the marks below are over one real admitted review, on',
          'one contract, for one lens. Every *other* lens on that node is still',
          'unmeasured, and the map draws it as unmeasured — which is the',
          'no-collapsed-light rule visible in a picture rather than asserted.',
        ].join('\n'),
    '',
    '## Measured cost, in this browser',
    '',
    '| scheme | cold load to interactive | lens change | scrubber step |',
    '| --- | --- | --- | --- |',
    ...measurements.map(row),
    '',
    '**Cold load to interactive** is navigation start until the road has drawn,',
    'which includes the one-off Atlas build over the whole shipped dictionary',
    '(9,245 nodes). It is paid once per session.',
    '',
    '**Lens change** and **scrubber step** are the two interactions that redraw',
    'every node on screen, and they are the ones that would expose a per-frame',
    'index rebuild — the defect lane A2 had to repair. Each is measured in the',
    'page from the click to two animation frames later.',
    '',
    '**These are Chromium on a build machine, not a phone.** They are a floor on',
    'what a device will do, not a prediction of it. No device, no Safari, no',
    'Firefox, and no screen reader was used for any of this.',
    '',
  ];

  writeFileSync(join(OUT, 'README.md'), `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`\n${String(shots.length)} shots → ${OUT}\n`);
  for (const m of measurements) {
    process.stdout.write(
      `[browser] ${m.scheme}: interactive ${String(m.interactiveMs)}ms, lens ${String(m.lensMs)}ms, scrub ${String(m.scrubMs)}ms\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
