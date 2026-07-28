/**
 * Screenshot evidence for the nihonga ground layer (Campaign E, lane A1′).
 *
 *   npm run export:web --workspace @bunki/app
 *   node apps/app/scripts/capture-ground.mjs
 *
 * Photographs each of the three era registers — 古道 / 街道 / 鉄道 — in both
 * colour schemes, from the real `expo export --platform web` output, in
 * Chromium. Six register shots plus the two whole-page shots that show them in
 * the context of the rest of the specimen.
 *
 * ## Why a third capture script rather than a flag on the second
 *
 * `capture-style-guide.mjs` next door photographs the *whole* specimen at
 * whatever length it happens to be. That is the right shot for "is the system a
 * system" and the wrong shot for "are these three places different", which needs
 * each register framed on its own so a reviewer can put them side by side.
 * Different subject, different framing, different lifetime — the same argument
 * that script makes for not being a flag on `capture-evidence.mjs`.
 *
 * The fonts actually registered in the photographed page are read out of
 * `document.fonts` and written into the README beside the images, because a face
 * that failed to load looks like a design decision in a screenshot and like
 * nothing at all in a test.
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

import { coverageBase } from '../src/theme/fonts/coverage.mjs';
import { JOYO } from '../src/theme/fonts/joyo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_ROOT, '../..');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const DIST = resolve(argValue('--dist', join(APP_ROOT, 'dist')));
const OUT = resolve(argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-e-ground')));

/** A desktop reading width: the reviewer here is the operator at a laptop. */
const VIEWPORT = { width: 1100, height: 1400 };

/** Ceiling on the grown viewport, so one long page cannot produce a 40 MB PNG. */
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

const SCHEMES = ['light', 'dark'];

const ERAS = [
  {
    key: 'kodo',
    written: '古道',
    note: 'Nara / Heian → medieval. Base 鳥の子 torinoko by day and 藍海松茶 ai-mirucha by night, under a 白緑 byakuroku mist wash — coarse-to-fine malachite is the same mineral as 緑青 rokushō, which is why the road recedes rather than changes colour.',
  },
  {
    key: 'kaido',
    written: '街道',
    note: 'Edo. 砥粉 tonoko ground under a 瓶覗 kamenozoki bokashi sky; at night the register falls back on its own ink, 檳榔子染 binrōjizome, under 縹 hanada. The chart gives no dark ground for the highway, so the darkest value it does give is the one used, and that choice is recorded rather than smuggled.',
  },
  {
    key: 'tetsudo',
    written: '鉄道',
    note: 'Meiji → now. 素鼠 sunezumi concrete by day, 褐 kachi night ground under 消炭 keshizumi structure after dark. The only register where emitted light is permitted: four real signals are offered and three are lit, in 銀朱 ginshu and 山吹 yamabuki.',
  },
];

const FACES_INSTALLED = "document.getElementById('bunki-self-hosted-faces') !== null";

const LOADED_FAMILIES = `Array.from(document.fonts)
  .filter((face) => face.status === 'loaded')
  .map((face) => face.family + ' ' + face.weight)
  .filter((name, index, all) => all.indexOf(name) === index)
  .sort()`;

const CONTENT_HEIGHT = `(() => {
  const scroller = document.querySelector('[data-testid="style-guide"]');
  return scroller === null ? 0 : Math.ceil(scroller.scrollHeight);
})()`;

/** Every character the era section actually put on screen. */
const ERA_SECTION_TEXT = `(() => {
  const section = document.querySelector('[data-testid="specimen-ground"]');
  return section === null ? '' : section.innerText;
})()`;

/**
 * Which of those characters the self-hosted subsets do *not* contain.
 *
 * The point of a screenshot is to rule out a face that failed to register, and
 * the honest version of that claim is narrower than "the fonts loaded": the
 * faces in `src/theme/fonts/` are **subsets**, and `coverage.mjs` is explicit
 * that anything outside the contract falls back through the platform stack.
 * Saying "every glyph here is self-hosted" without checking would be exactly the
 * kind of doc claim this project has been bitten by, so it is computed from the
 * page's own text against the contract's own list, and whatever it finds goes in
 * the README.
 */
function fallbackCharacters(text) {
  const covered = new Set([...coverageBase(), ...JOYO]);
  const outside = new Set();
  for (const character of text) {
    if (/\s/u.test(character)) continue;
    if (!covered.has(character)) outside.add(character);
  }
  return [...outside].sort();
}

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

  const shots = [];
  let fontsSeen = [];
  let fellBack = [];
  try {
    for (const scheme of SCHEMES) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', (error) => failures.push(String(error)));

      await page.goto(`${server.origin}/style-guide?scheme=${scheme}`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid="style-guide"]', { timeout: 30_000 });
      fontsSeen = await waitForFaces(page);
      // The stroke specimen animates on mount; let it finish so nothing on the
      // page is mid-transition when the era sections are framed.
      await page.waitForTimeout(4_000);

      /*
        react-native-web renders a `ScrollView` as a fixed-height element with
        its own overflow, so the document is exactly one viewport tall however
        long the specimen is. Growing the viewport to the scroller's own height
        lays the whole page out at once, which is what makes both the full-page
        shot and the per-register element shots possible from one load.
      */
      const contentHeight = await page.evaluate(CONTENT_HEIGHT);
      if (contentHeight > VIEWPORT.height) {
        await page.setViewportSize({
          width: VIEWPORT.width,
          height: Math.min(contentHeight + 80, MAX_CAPTURE_HEIGHT),
        });
        await page.waitForTimeout(800);
      }

      fellBack = fallbackCharacters(await page.evaluate(ERA_SECTION_TEXT));

      for (const era of ERAS) {
        const file = `${era.key}-${scheme}.png`;
        const locator = page.locator(`[data-testid="specimen-era-${era.key}"]`);
        await locator.waitFor({ state: 'visible', timeout: 30_000 });
        await locator.screenshot({ path: join(OUT, file) });
        shots.push({ file, scheme, era });
        process.stdout.write(`${file}\n`);
      }

      const wholeFile = `style-guide-${scheme}.png`;
      await page.screenshot({ path: join(OUT, wholeFile), fullPage: true });
      shots.push({ file: wholeFile, scheme, era: null });
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

  const lines = [
    '# The nihonga ground layer — screenshot evidence (Campaign E, lane A1′)',
    '',
    'Captured by `apps/app/scripts/capture-ground.mjs` from the real',
    '`expo export --platform web` output, in Chromium, at',
    `${VIEWPORT.width} px wide, with the viewport grown to the specimen's own`,
    'scroll height so every register is laid out before it is framed.',
    '',
    '## Fonts that actually loaded in the photographed page',
    '',
    'Read out of `document.fonts` in the page itself, so this is evidence that',
    'the self-hosted faces registered rather than a claim that they were bundled.',
    '',
    ...fontsSeen.map((family) => `- \`${family}\``),
    '',
    'These faces are **subsets** — `src/theme/fonts/coverage.mjs` is the contract',
    'and jōyō is the line it draws. So "the fonts loaded" is not the same claim as',
    '"every glyph here is self-hosted", and the second one is the one worth',
    "checking. The characters below were read out of the era section's own",
    '`innerText` in the photographed page and are outside the subset; they render,',
    'in whatever the host stack supplies, not in Shippori Mincho or Noto Sans JP:',
    '',
    fellBack.length === 0
      ? '- none — every character in this section is inside the subset.'
      : fellBack.map((character) => `\`${character}\``).join(' '),
    '',
    ...(fellBack.length === 0
      ? []
      : [
          'Every **headword** on these cards is jōyō and therefore self-hosted; what',
          'falls back is chrome — a macron in a romanisation, and the odd character in',
          'a period note. The pigment names themselves (檳榔子染, 瓶覗) are *not* on',
          'this page at all: `GroundField` renders no text, which is the museum-card',
          'rule, so they live only in the source and in this README.',
          '',
        ]),
    '## What to look for',
    '',
    '- The three grounds are three different places. That is the whole point of',
    '  the redirect: the ground carries **when and where**, and says nothing at',
    '  all about the learner.',
    '- Every ground is a **stack**, not a flat colour — an opaque mineral base, a',
    '  translucent atmospheric wash, and a 胡粉/墨 mat under the content. There',
    '  is no drop shadow anywhere; depth is superposition, because that is what',
    '  iwa-enogu does.',
    '- **Text is always on a card**, never on the ground. That is the museum-card',
    '  rule doing double duty as the contrast guarantee, and it is enforced by a',
    '  scan rather than by convention (`test/theme-ground.test.ts`).',
    '- The marks above each card are the **figure** layer, unchanged from lane A1:',
    '  hue reserved for the one accent, luminance for recall strength, form for',
    '  fragility. Each clears 3:1 against the mat it sits on, in all six',
    '  combinations, and `test/theme-ground.test.ts` is what says so.',
    '- The same band appears twice per card, in two registers: a bare mark on the',
    '  ground, where a map node has no room for a word, and the bounded meter on',
    '  the card, where it arrives with its capability and its word attached.',
    '- Emitted light appears **only** in 鉄道, and only three points, however many',
    '  signals are offered.',
    "- The era placement of each word is the **specimen's own arrangement**, and",
    '  every card says so. The seed carries no era field yet.',
    '',
  ];
  for (const shot of shots) {
    if (shot.era === null) {
      lines.push(
        `## style-guide-${shot.scheme}.png — the whole specimen`,
        '',
        `- Scheme: ${shot.scheme}`,
        '- The era section in the context of the rest of the vocabulary.',
        '',
        `![the whole specimen, ${shot.scheme}](./${shot.file})`,
        '',
      );
      continue;
    }
    lines.push(
      `## ${shot.file} — ${shot.era.written}`,
      '',
      `- Scheme: ${shot.scheme}`,
      `- ${shot.era.note}`,
      '',
      `![${shot.era.written}, ${shot.scheme} scheme](./${shot.file})`,
      '',
    );
  }
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'), 'utf8');
  process.stdout.write(`wrote ${String(shots.length)} shots to ${OUT}\n`);
}

await main();
