/**
 * Screenshot evidence for the scripted learner (lane L1).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-lived-in.mjs
 *
 * ## What this evidence has to show, and why it is one run rather than six
 *
 * The lane's claim is not "the map draws" or "the session plans". It is that
 * **one learner state lights every surface at once** — that the map, the dive,
 * the sitting, the branches, the ledger and the reading page are six views of
 * the same log rather than six screens that each happen to render. So the
 * flagship set below is one stage, loaded once, photographed on six surfaces in
 * one browser session, with the demonstration strip visible in every frame.
 * Six separate runs would have produced six pictures and left the interconnexion
 * — the actual subject — unphotographed.
 *
 * The four stage cards that follow are the second claim: that the stages differ
 * **in kind**. One frame each of the map is enough to see it, because the map is
 * the surface that answers "what have I built".
 *
 * ## Reproducibility
 *
 * A stage is generated backwards from today so a two-year learner ends on
 * today's date. That makes the log a function of the date, which is right for a
 * person and useless for evidence, so every URL here pins the day with
 * `demoToday`. Two runs on two days produce the same bytes and therefore the
 * same pictures.
 *
 * Nothing here seeds a store, patches a global, or renders a component in a
 * harness. The pages are served from `dist/`, loaded over HTTP, and the
 * demonstration is built by the app's own code in the browser — which is also
 * where the build timings in the README come from.
 *
 * Exits non-zero if a shot fails or the page logs an error, so a broken surface
 * cannot pass silently as "no evidence produced".
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const OUT = resolve(argValue('--out', join(REPO_ROOT, 'docs/build-evidence/lived-in')));

/** Pinned, so this script produces the same pictures on any day it is run. */
const PINNED_DAY = argValue('--day', '2026-07-29');

/**
 * The stage the six-surface set is taken from.
 *
 * Month 8 rather than Year 2, and the reason is what the pictures are for: the
 * plateau is the state the operator complained about in every other tool, and it
 * is the one a queue cannot show. It is also small enough to build inside a
 * page load without the frames being of a progress state.
 */
const FLAGSHIP = 'month-8';

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
  // Expo writes literal bracket filenames for dynamic routes; a real static
  // host resolves `/kanji/分` to `kanji/[character].html` and lets the client
  // router read the parameter. Nothing else is rewritten.
  const bracket = bracketFileIn(dirname(direct));
  if (bracket !== null) return bracket;
  return join(DIST, '+not-found.html');
}

function bracketFileIn(directory) {
  if (!existsSync(directory)) return null;
  const found = readdirSync(directory).find(
    (name) => name.startsWith('[') && name.endsWith('.html'),
  );
  return found === undefined ? null : join(directory, found);
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

/**
 * The six surfaces, and what each frame is evidence *of*.
 *
 * `note` is written into the README beside the image. A directory of PNGs with
 * no statement of what each one is meant to show is a directory nobody reads.
 */
const SURFACES = [
  {
    key: 'map',
    tab: 'nav-map',
    path: '/',
    screen: 'screen-map',
    title: 'The map',
    note: 'What has been built, counted off the ledger — “N of M contracts have evidence behind them”, one capability lens at a time, on the era ground. On an empty install this line reads “nothing built yet”; here it reads the plateau.',
  },
  {
    key: 'session',
    tab: 'nav-session',
    path: '/session',
    screen: 'screen-session',
    title: 'The sitting',
    note: 'A finite plan over contracts the pinned model had already made due, with an explicit end. On an empty install this screen says nothing is on an active rung; here it has a target the scripted learner promoted.',
  },
  {
    key: 'journey',
    tab: 'nav-journeys',
    path: '/journey',
    screen: 'screen-journey',
    title: 'The branches',
    note: 'Branch points opened by misses the evidence gate counted — never declared by this script and never by the screen. On an empty install: “No branch is open.”',
  },
  {
    key: 'evidence',
    tab: 'nav-evidence',
    path: '/evidence',
    screen: 'screen-evidence',
    title: 'The ledger',
    note: 'The chain behind one thread: what was observed, what the gate decided, and why the refusals did not count. This is the surface that is worth nothing without a populated state.',
  },
  {
    key: 'reading',
    tab: 'nav-reading',
    path: '/read',
    screen: 'screen-reading',
    title: 'Reading',
    note: 'The one shipped passage, with the quiet marks on this learner’s own frontier rather than a global level rainbow (frozen §10.4).',
  },
  {
    // Last, and reached by *tapping a node on the map* rather than by a URL.
    // The dive has no tab — `navigation.ts` §3: a page about a particular thing
    // cannot be a tab — so a URL load would have been a second page load and
    // would have dropped the stage, which is precisely how the first run of
    // this script produced five frames labelled "Your own data".
    key: 'dive',
    tab: null,
    path: `/kanji/${encodeURIComponent('分')}`,
    screen: 'screen-kanji',
    title: 'The fractal dive',
    note: 'Reached by tapping a kanji on the map, in the same session. Scale as an axis: the same node graph at word, kanji and component depth, with the learner’s own marks on it. Flying it is exposure and writes nothing (T-08); the frames here are of a surface that has something to be bright and dim about.',
  },
];

const STAGES = ['day-3', 'month-2', 'month-8', 'year-2'];

const errors = [];

async function shoot(page, file, screen) {
  const scroller = page.locator(`[data-testid="${screen}"]`).filter({ visible: true }).last();
  await scroller.waitFor({ timeout: 60_000 });
  // Let the surface settle before it is framed: the map builds its Atlas and
  // the dive materialises its neighbourhood after first paint.
  await page.waitForTimeout(900);

  const height = await page.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(`[data-testid="${screen}"]`)});
    return node === null ? 0 : Math.ceil(node.scrollHeight);
  })()`);
  const framed = Math.min(Math.max(height + 260, VIEWPORT.height), MAX_CAPTURE_HEIGHT);
  await page.setViewportSize({ width: VIEWPORT.width, height: framed });
  await page.waitForTimeout(350);
  await page.screenshot({ path: file });
  await page.setViewportSize(VIEWPORT);
}

/**
 * Reach the dive the way a learner does: by tapping a kanji on the map.
 *
 * The map is a live, tappable surface (frozen §8) and a node is the door to the
 * page about that character. Going through it keeps the browser session — and
 * therefore the loaded stage — which a `page.goto` would not.
 */
async function openDiveFromMap(page) {
  await page.locator('[data-testid="nav-map"]').first().click();
  await page.locator('[data-testid="screen-map"]').filter({ visible: true }).last().waitFor();
  await page.waitForTimeout(900);
  const node = page.locator('[data-testid^="map-node-kanji:"]').filter({ visible: true }).first();
  const count = await node.count();
  if (count === 0) {
    throw new Error(
      'the map drew no kanji node to tap through to the dive; the frame would have been a second page load and would have dropped the stage',
    );
  }
  await node.click();
  await page.locator('[data-testid="screen-kanji"]').filter({ visible: true }).last().waitFor({
    timeout: 60_000,
  });
}

/** Wait until the strip says a stage is loaded, and read what it says. */
async function loadedHeadline(page) {
  const headline = page
    .locator('[data-testid="demo-banner-headline"]')
    .filter({ visible: true })
    .last();
  await headline.waitFor({ timeout: 90_000 });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const text = await headline.innerText();
    if (text.includes('Demonstration data')) return text;
    await page.waitForTimeout(1000);
  }
  throw new Error('the demonstration strip never reported a loaded stage');
}

/** The build note the app measured for itself, read out of its own panel. */
async function buildNote(page) {
  const toggle = page
    .locator('[data-testid="demo-banner-toggle"]')
    .filter({ visible: true })
    .last();
  await toggle.click();
  const banner = page.locator('[data-testid="demo-banner"]').filter({ visible: true }).last();
  await page.waitForTimeout(300);
  const text = await banner.innerText();
  await toggle.click();
  await page.waitForTimeout(200);
  return text;
}

async function main() {
  if (!existsSync(DIST)) {
    process.stderr.write(`No export at ${DIST}. Run: npm run export:web --workspace @bunki/app\n`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  const server = await startServer();
  const executablePath = preinstalledChromium();
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });

  const rows = [];
  const stageCards = [];
  let flagshipPanel;

  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    // --- the flagship: one stage, six surfaces, one browser session ----------
    const first = SURFACES[0];
    await page.goto(
      `${server.origin}${first.path}?demo=${FLAGSHIP}&demoToday=${PINNED_DAY}&scheme=light`,
      { waitUntil: 'load' },
    );
    const headline = await loadedHeadline(page);
    flagshipPanel = await buildNote(page);

    for (const surface of SURFACES) {
      if (surface !== first) {
        // Navigate the way a learner does — through the shell, or by tapping a
        // node — so the frames are of one continuous session rather than six
        // cold loads. The shell uses `replace`, which drops the query string,
        // which is also the proof that the stage lives in state rather than in
        // the URL.
        if (surface.tab === null) {
          await openDiveFromMap(page);
        } else {
          await page.locator(`[data-testid="${surface.tab}"]`).first().click();
        }
      }
      const file = join(OUT, `${FLAGSHIP}-${surface.key}.png`);
      await shoot(page, file, surface.screen);
      const strip = await page
        .locator('[data-testid="demo-banner-headline"]')
        .filter({ visible: true })
        .last()
        .innerText();
      rows.push({ ...surface, file: `${FLAGSHIP}-${surface.key}.png`, strip });
    }

    // One dark frame of the flagship map, because the visual language has two
    // schemes and evidence in one is evidence for one.
    await page.goto(`${server.origin}/?demo=${FLAGSHIP}&demoToday=${PINNED_DAY}&scheme=dark`, {
      waitUntil: 'load',
    });
    await loadedHeadline(page);
    await shoot(page, join(OUT, `${FLAGSHIP}-map-dark.png`), 'screen-map');

    // --- the four stages, one map frame each --------------------------------
    for (const stage of STAGES) {
      await page.goto(`${server.origin}/?demo=${stage}&demoToday=${PINNED_DAY}&scheme=light`, {
        waitUntil: 'load',
      });
      const stripText = await loadedHeadline(page);
      const panel = await buildNote(page);
      await shoot(page, join(OUT, `stage-${stage}-map.png`), 'screen-map');
      const standing = await page
        .locator('[data-testid="map-standing"]')
        .filter({ visible: true })
        .last()
        .innerText();
      stageCards.push({ stage, strip: stripText, standing, panel });
    }

    // --- and the one frame that is not a demonstration ----------------------
    await page.goto(`${server.origin}/?scheme=light`, { waitUntil: 'load' });
    await page.locator('[data-testid="demo-banner"]').filter({ visible: true }).last().waitFor();
    await shoot(page, join(OUT, 'own-data-map.png'), 'screen-map');
    const ownStrip = await page
      .locator('[data-testid="demo-banner-headline"]')
      .filter({ visible: true })
      .last()
      .innerText();

    writeFileSync(
      join(OUT, 'README.md'),
      readme({ rows, stageCards, headline, flagshipPanel, ownStrip }),
      'utf8',
    );
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }

  if (errors.length > 0) {
    process.stderr.write(`The pages logged ${String(errors.length)} error(s):\n`);
    for (const line of errors.slice(0, 20)) process.stderr.write(`  ${line}\n`);
    process.exit(1);
  }
  process.stdout.write(`Wrote ${String(rows.length + STAGES.length + 2)} frames to ${OUT}\n`);
}

function readme({ rows, stageCards, headline, flagshipPanel, ownStrip }) {
  const surfaceRows = rows
    .map(
      (row) =>
        `### ${row.title} — \`${row.file}\`\n\n${row.note}\n\nThe strip in this frame reads: **${row.strip.trim()}**\n\n![${row.title}](${row.file})\n`,
    )
    .join('\n');

  const stageRows = stageCards
    .map(
      (card) =>
        `### ${card.stage} — \`stage-${card.stage}-map.png\`\n\nThe map's own line: **${card.standing.trim()}**\n\n![${card.stage}](stage-${card.stage}-map.png)\n`,
    )
    .join('\n');

  return `# A learner at every stage — screenshot evidence (lane L1)

Captured by \`apps/app/scripts/capture-lived-in.mjs\` from the real
\`expo export --platform web\` output, in Chromium, at ${VIEWPORT.width} px wide, with
the viewport grown to each screen's own scroll height so the whole surface is
laid out before it is framed.

**Every stage in these pictures is generated, not seeded.** The events were
minted by \`@bunki/domain\`'s own factories, the evidence-class ones by the
evidence gate that is their sole factory, judged by \`admitToScheduler\`, and
scheduled by the pinned memory model. The log replays to the same state the
generator folded forward, exports, and verifies — see
\`packages/domain/test/demo/\` and \`packages/export/test/scripted-learner-export.test.ts\`.
The learner is invented; the ledger is not.

Every URL pins the end date (\`demoToday=${PINNED_DAY}\`), so this script produces the
same pictures on any day it is run.

Scope: Chromium on Expo Web, one engine, on a build machine. No phone, no other
browser, no assistive technology (REQ-GATE-03).

---

## One stage, six surfaces, one browser session

The flagship set is \`${FLAGSHIP}\` — the plateau — loaded **once** and then walked
through the shell, so these six frames are six views of one log rather than six
screens that each happen to render. The strip is in every frame.

The strip reported: **${headline.trim()}**

What the app measured about its own build, read out of its own panel:

\`\`\`
${flagshipPanel.trim()}
\`\`\`

${surfaceRows}

### The same map in the dark scheme — \`${FLAGSHIP}-map-dark.png\`

![dark](${FLAGSHIP}-map-dark.png)

---

## Four stages, four different learners

One frame of the map each, because the map is the surface that answers "what
have I built". The stages differ in kind rather than in count — the day-3
learner has nothing settled, the month-8 learner has stopped taking anything
new, and the year-2 learner has been away and come back.

${stageRows}

---

## …and the state a demonstration is never confused with

\`own-data-map.png\` is the same route with nothing loaded. The strip reads
**${ownStrip.trim()}**, and the map says what is true of a fresh install.

![own data](own-data-map.png)
`;
}

await main();
