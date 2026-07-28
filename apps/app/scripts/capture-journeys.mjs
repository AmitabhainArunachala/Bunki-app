/**
 * Screenshot evidence for the journey surface (Campaign E, lane B5).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-journeys.mjs
 *
 * Photographs `/journey` in both colour schemes, from the real
 * `expo export --platform web` output, in a real browser, with nothing mocked.
 *
 * ## Why it walks the loop rather than loading the URL
 *
 * A branch point does not exist until the evidence gate has counted a miss, and
 * there is no control anywhere in this app that opens one. A cold `/journey` is
 * therefore honestly empty, and a screenshot of the empty state proves only
 * that the empty state renders. So the branch shots are taken **after the
 * learner path that produces one**: capture 分岐, take it up for study, sit the
 * session, and answer a probe with Again. The stumble the fork is drawn from is
 * then the kernel's own — this script grades nothing, seeds nothing and writes
 * no storage, it clicks.
 *
 * The empty shot is still taken, from a cold browser, because "no branch is
 * open" is a state this surface must also be honest in and is the state most
 * learners will meet first.
 *
 * ## What is read back out of the page, and why
 *
 * Each shot records, from the photographed DOM: the phase line, the state word
 * beside every rail, and whether the EDRDG acknowledgement is visible. Those
 * are the three claims this lane makes that a picture alone cannot settle — in
 * particular "the untaken rails are still visible", which is a claim about six
 * elements being present rather than about how the screenshot looks.
 *
 * Modelled on `capture-style-guide.mjs`, and deliberately not shared with it:
 * different subject, different lifetime, and the argument that script's own
 * header makes about `capture-evidence.mjs` applies here unchanged.
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
  argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-b5-journeys')),
);

const VIEWPORT = { width: 1100, height: 1400 };
const MAX_CAPTURE_HEIGHT = 14_000;

const TARGET = '分岐';

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

/** `expo export` writes a dynamic route as a literal `[param]` file. */
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

/** react-native-web keeps the document one viewport tall; grow to the scroller. */
const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="screen-journey"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

/**
 * What the page actually says, read out of the rendered DOM.
 *
 * The rail readout is the load-bearing one. "The roads you are not taking stay
 * visible" is a claim about six elements being in the document with a state
 * word each, and that is checkable here in a way a picture is not.
 */
const READOUT = `(() => {
  const text = (node) => (node === null ? null : (node.innerText ?? '').replace(/\\s+/g, ' ').trim());
  const rails = Array.from(document.querySelectorAll('[data-testid^="journey-rail-state-"]')).map(
    (node) => ({
      family: (node.getAttribute('data-testid') ?? '').replace('journey-rail-state-', ''),
      state: text(node),
    }),
  );
  const forkPaths = document.querySelectorAll('[data-testid="journey-fork"] svg path').length;
  return {
    phase: text(document.querySelector('[data-testid="journey-phase"]')),
    lens: text(document.querySelector('[data-testid="journey-lens"]')),
    counts: text(document.querySelector('[data-testid="journey-condition-counts"]')),
    statement: text(document.querySelector('[data-testid="journey-condition-statement"]')),
    empty: text(document.querySelector('[data-testid="journey-empty"]')),
    rails,
    forkPaths,
    edrdg: document.querySelector('[data-testid="seed-entry-disclosure"]') !== null,
  };
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
 * Walk the learner path that produces a branch point.
 *
 * Every step is a click or a keystroke. The `again` is the whole point: it is
 * the only thing in this app that opens a branch, and it has to be the learner
 * who does it.
 */
async function walkToABranch(page, origin, scheme) {
  // `/capture`, not `/`: Wave D made the map the front door and capture
  // an action offered from every surface (`src/ui/navigation.ts` §1–§2).
  await page.goto(`${origin}/capture?scheme=${scheme}`, { waitUntil: 'load' });
  await live(page, 'screen-capture').waitFor({ timeout: 30_000 });

  await live(page, 'capture-search-input').fill(TARGET);
  await live(page, 'capture-top-answer').waitFor();
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

  // One Again on the first probe the plan offers. Bounded, so a plan that grew
  // fails here rather than spinning.
  let missed = false;
  for (let pressed = 0; pressed < 20 && !missed; pressed += 1) {
    const again = live(page, 'session-grade-again');
    if (await again.isVisible().catch(() => false)) {
      await again.click();
      missed = true;
      break;
    }
    const canvasDone = live(page, 'session-complete-canvas');
    if (await canvasDone.isVisible().catch(() => false)) {
      await canvasDone.click();
      continue;
    }
    const next = live(page, 'session-next');
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      continue;
    }
    await page.waitForTimeout(200);
  }
  if (!missed) throw new Error('the sitting never offered a grade, so no branch could open');

  await page.getByTestId('nav-journeys').click();
  await live(page, 'screen-journey').waitFor({ timeout: 30_000 });
  await live(page, 'journey-fork').waitFor({ timeout: 30_000 });
}

/** Take a road, so the fork can be photographed lit-and-dimmed rather than all-open. */
async function takeARoad(page) {
  const take = page.locator('[data-testid^="journey-take-"]').filter({ visible: true }).first();
  await take.waitFor({ timeout: 15_000 });
  await take.click();
  await page.waitForTimeout(900);
}

const SHOTS = [
  {
    file: 'journey-fork-light.png',
    scheme: 'light',
    walk: true,
    note: 'The fork, after a real miss: 分岐 captured by clicking, taken up for study, its first probe graded Again. All six route families are drawn — the two on offer, the ones the three-path ceiling held back, and the ones with nowhere to go for this word, each carrying the compiler’s own reason. Nothing here was opened by a control; the evidence gate counted the miss.',
  },
  {
    file: 'journey-fork-dark.png',
    scheme: 'dark',
    walk: true,
    note: 'The same fork in the dark scheme, which is designed rather than inverted.',
  },
  {
    file: 'journey-taken-light.png',
    scheme: 'light',
    walk: true,
    take: true,
    note: 'One road taken. It is lit; every other road is dimmed and still drawn, at an opacity floored by MIN_UNLIT_OPACITY so an untaken rail can never disappear. The open condition below states, before it is met, exactly what would end this branch.',
  },
  {
    file: 'journey-taken-dark.png',
    scheme: 'dark',
    walk: true,
    take: true,
    note: 'The same taken road in the dark scheme.',
  },
  {
    file: 'journey-empty-light.png',
    scheme: 'light',
    note: 'A cold browser. No branch is open, because nothing has been missed — and the empty state says that nothing on this screen can open one.',
  },
  {
    file: 'journey-empty-dark.png',
    scheme: 'dark',
    note: 'The same empty state in the dark scheme.',
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

      if (shot.walk === true) {
        await walkToABranch(page, server.origin, shot.scheme);
        if (shot.take === true) await takeARoad(page);
      } else {
        await page.goto(`${server.origin}/journey?scheme=${shot.scheme}`, { waitUntil: 'load' });
        await live(page, 'screen-journey').waitFor({ timeout: 30_000 });
      }

      const fonts = await waitForFaces(page);
      // The fork's rails are measured from the rows on layout, and the light
      // settles. Let both finish so the picture is of the settled surface.
      await page.waitForTimeout(2_000);

      const readout = await page.evaluate(READOUT);
      await shoot(page, shot.file);
      await context.close();

      if (failures.length > 0) {
        throw new Error(`${shot.file}: page errors ${JSON.stringify(failures)}`);
      }
      results.push({ ...shot, fonts, readout });
      process.stdout.write(
        `${shot.file}  rails: ${String(readout.rails.length)}  paths: ${String(readout.forkPaths)}  edrdg: ${String(readout.edrdg)}\n`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }

  const lines = [
    '# Journeys — screenshot evidence (Campaign E, lane B5)',
    '',
    'Captured by `apps/app/scripts/capture-journeys.mjs` from the real',
    `\`expo export --platform web\` output, in Chromium, at ${VIEWPORT.width}×${VIEWPORT.height}, full page.`,
    '',
    'The four `journey-fork-*` / `journey-taken-*` shots were taken **after walking',
    'the loop by clicking**: capture 分岐 → take it up for study → sit the session →',
    'grade its first probe **Again**. That Again is the only thing in this app that',
    'opens a branch, and the branch in these pictures is the kernel’s own — this',
    'script grades nothing and seeds nothing.',
    '',
    'The readout under each shot is taken from the photographed DOM, not from the',
    'source, so "six rails are present" is a measurement rather than a claim.',
    '',
    '## Why two shots of "the same" fork can differ',
    '',
    'They are not the same fork, and the reason is a carried defect this evidence',
    'found. `session-loop.ts` mints the reading and meaning contracts back to back',
    'off the wall clock; `compareDueContracts` orders by due instant and falls back',
    'to the contract id only on a tie. Two mints inside one millisecond therefore',
    'probe **meaning** first, and two that straddle a millisecond boundary probe',
    '**reading** first — so the miss lands on a different contract, the branch is',
    'about a different capability, and the compiler offers a different set of',
    'routes. Both forks are correct; which one you get is a race.',
    '',
    'That is not this lane’s code to change. It is reproduced and pinned in',
    '`apps/app/test/journey-surface.test.ts` under "carried defect", and the',
    '**Capability line** below is recorded on every shot so each picture states',
    'which contract its branch is about instead of leaving a reader to guess.',
    '',
  ];
  for (const result of results) {
    lines.push(
      `## ${result.file}`,
      '',
      `- Scheme: ${result.scheme}`,
      `- EDRDG acknowledgement present: ${String(result.readout.edrdg)}`,
      `- Fonts registered: ${result.fonts.join(', ')}`,
    );
    if (result.readout.phase !== null) lines.push(`- Phase line: \`${result.readout.phase}\``);
    if (result.readout.lens !== null) lines.push(`- Capability line: \`${result.readout.lens}\``);
    if (result.readout.empty !== null) lines.push(`- Empty state: \`${result.readout.empty}\``);
    if (result.readout.rails.length > 0) {
      lines.push(
        `- Rails drawn (${String(result.readout.rails.length)}), each with its state word:`,
      );
      for (const rail of result.readout.rails) {
        lines.push(`  - ${rail.family}: ${String(rail.state)}`);
      }
      lines.push(`- SVG paths in the fork drawing: ${String(result.readout.forkPaths)}`);
    }
    if (result.readout.counts !== null) {
      lines.push(`- Open condition: \`${result.readout.counts}\``);
    }
    lines.push('', `- ${result.note}`, '', `![${result.scheme} scheme](./${result.file})`, '');
  }
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'), 'utf8');
  process.stdout.write(`wrote ${String(results.length)} shots to ${OUT}\n`);
}

await main();
