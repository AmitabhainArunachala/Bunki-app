/**
 * Measures the two controller §13 budgets that a web runtime can honestly
 * report: **local save ack p95** and **warm lookup p95** (WP-10, REQ-ARCH-06).
 *
 *     npm run test:e2e:build          # the export this measures
 *     node scripts/measure-web-latency.mjs
 *
 * ## What this is, and the much larger thing it is not
 *
 * Controller §13 says: "Measure and record; never claim achieved numbers
 * without measurement, and label all results with the runtime they were
 * measured on… **Web measurements are demonstration data only.**" This script
 * exists so the numbers in `docs/build-evidence/PERF_WEB.md` are recorded rather
 * than asserted — definition-of-done §2 item 8 makes "latency by assertion" an
 * explicit failure of done.
 *
 * It measures **Chromium on this machine, against the static export**. It is
 * not, and may never be reported as:
 *
 *   - an iPhone measurement — `capture-to-durable median ≤2 s / p95 ≤4 s` is
 *     native, WP-11, on a device, and nothing here bears on it (P0-CAP-15);
 *   - a claim that the ≤150 ms / ≤200 ms budgets are *met*, since those budgets
 *     are written for the runtime the operator will actually use;
 *   - a benchmark. One machine, one engine, no thermal control, no repetition
 *     across sessions. Definition-of-done §2 item 2 calls passing web off as
 *     native an explicit failure, and that is the mistake this header exists to
 *     make hard.
 *
 * ## Why it drives the UI instead of timing a function
 *
 * "Local save ack" is a promise to a person: the gap between pressing Keep and
 * the screen confirming the encounter is safe. Timing `store.execute` would
 * measure a substring of that and would keep looking good while React, layout
 * and the storage adapter got slower. So every sample here is bounded by a real
 * gesture on the real exported bundle: fill the field, press the control, wait
 * for the acknowledgment the learner reads.
 *
 * "Warm" means the store, the seed index and the bundle are already loaded: the
 * first interactions are discarded as warm-up, because a cold first paint is a
 * different question (and a different budget) from the one §13 asks.
 *
 * Percentiles use nearest-rank on the sorted samples — no interpolation, so
 * every reported number is a measurement that actually happened.
 */

import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(REPO_ROOT, 'apps/app/dist');

const WARMUP = Number(process.env['BUNKI_PERF_WARMUP'] ?? 3);
const SAMPLES = Number(process.env['BUNKI_PERF_SAMPLES'] ?? 15);
/** Cold loads are the slow measurement; fewer samples, and the count is reported. */
const COLD_SAMPLES = Number(process.env['BUNKI_PERF_COLD_SAMPLES'] ?? 8);

/** Progress to stderr, so stdout stays a single parseable JSON document. */
const progress = (line) => {
  if (process.env['BUNKI_PERF_QUIET'] === undefined) process.stderr.write(`${line}\n`);
};

/**
 * Words that exist **only** in the imported tier, and an English gloss.
 *
 * The fixture-tier list below is sixteen records; searching it says nothing
 * about whether 3,000 makes the app slow. These queries are the ones that have
 * to scan the imported tier to find anything: two written forms, one reading,
 * and one gloss — the gloss deliberately, because that is the query that cannot
 * use an exact-match index and must touch every sense of every record.
 */
const IMPORTED_QUERIES = ['図書館', '経済', 'せんせい', 'library'];

/** Distinct seed headwords, so every capture is a new thread rather than a no-op. */
const WORDS = [
  '分岐',
  '分岐点',
  '岐路',
  '分かれる',
  '分ける',
  '分かる',
  '自分',
  '部分',
  '線路',
  '道路',
  '車道',
  '車',
  '駅',
  '点',
  '道',
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** The export's routing policy: static files, then `.html`, then the two dynamic routes. */
function resolveExportPath(urlPath) {
  const clean = urlPath.split('?')[0].replace(/^\/+/, '');
  const parts = clean.split('/');
  const candidates = [
    clean === '' ? join(DIST, 'index.html') : join(DIST, clean),
    join(DIST, `${clean}.html`),
    join(DIST, clean, 'index.html'),
  ];
  if (parts.length === 2 && parts[0] === 'word')
    candidates.push(join(DIST, 'word/[lexemeId].html'));
  if (parts.length === 2 && parts[0] === 'kanji') {
    candidates.push(join(DIST, 'kanji/[character].html'));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function startHost() {
  if (!existsSync(DIST)) {
    throw new Error(
      `No web export at ${DIST}. Build it first:\n\n    npm run test:e2e:build\n\n` +
        '(the controller §17.5 spelling is: cd apps/app && npx expo export --platform web)',
    );
  }
  const server = createServer((request, response) => {
    const file = resolveExportPath(decodeURIComponent(request.url ?? '/'));
    if (file === null) {
      response.writeHead(404);
      response.end('no export artefact for this path');
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      ready({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/** Nearest-rank percentile: always an observed sample, never an interpolation. */
function percentile(samples, p) {
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

function summarise(name, samples) {
  return {
    measurement: name,
    n: samples.length,
    min: Number(Math.min(...samples).toFixed(1)),
    median: Number(percentile(samples, 50).toFixed(1)),
    p95: Number(percentile(samples, 95).toFixed(1)),
    max: Number(Math.max(...samples).toFixed(1)),
  };
}

const visible = (page, id) => page.getByTestId(id).locator('visible=true').last();

/**
 * One capture, timed from the press to the acknowledgment the learner reads.
 *
 * The acknowledgment stays on screen between captures, so waiting for it to be
 * *visible* would return instantly and measure nothing. This waits for its text
 * to differ from the text already there — the transition, not the presence.
 */
async function measureSaveAck(page, word) {
  await visible(page, 'capture-search-input').fill(word);
  await visible(page, 'capture-top-answer').waitFor({ state: 'visible' });

  const previous = await visible(page, 'capture-acknowledgment')
    .innerText()
    .catch(() => null);

  const started = performance.now();
  await visible(page, 'capture-keep').click();
  await page.waitForFunction(
    ([before]) => {
      // `globalThis.document`, not a bare `document`: this callback is
      // serialised and evaluated in the *page*, not in Node, and spelling the
      // global explicitly is how the rest of the harness marks that crossing.
      const nodes = [
        ...globalThis.document.querySelectorAll('[data-testid="capture-acknowledgment"]'),
      ];
      const shown = nodes.filter((node) => node.getClientRects().length > 0).at(-1);
      return shown != null && shown.textContent?.trim() !== '' && shown.textContent !== before;
    },
    [previous],
    { timeout: 15_000 },
  );
  return performance.now() - started;
}

/** One warm lookup, timed from the query landing to the answer being on screen. */
async function measureWarmLookup(page, word) {
  await visible(page, 'capture-search-input').fill('');
  await page
    .waitForFunction(
      () =>
        [...globalThis.document.querySelectorAll('[data-testid="capture-top-answer"]')].filter(
          (node) => node.getClientRects().length > 0,
        ).length === 0,
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);

  const started = performance.now();
  await visible(page, 'capture-search-input').fill(word);
  await visible(page, 'capture-top-answer').waitFor({ state: 'visible', timeout: 15_000 });
  return performance.now() - started;
}

/**
 * One **cold** load: a fresh browser context, an empty cache, timed from
 * `goto` to the capture screen being on screen.
 *
 * This measurement exists because the imported tier is 3,000 lexemes, 1,241
 * kanji and 2,000 sentence pairs, and putting them in the bundle is exactly the
 * kind of change that buys a feature with a slower first paint. Every other
 * number in this script is explicitly *warm* — bundle parsed, indexes built —
 * so none of them would move if the bundle doubled, and reporting only those
 * would be a way of not answering the question.
 *
 * A new context per sample, not a reload: `page.reload()` keeps the HTTP cache
 * and the compiled script, which is the opposite of cold.
 */
async function measureColdLoad(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
  const page = await context.newPage();
  try {
    const started = performance.now();
    await page.goto(origin, { waitUntil: 'load' });
    await visible(page, 'screen-capture').waitFor({ state: 'visible', timeout: 60_000 });
    return performance.now() - started;
  } finally {
    await context.close();
  }
}

/** The bytes a cold visitor actually downloads, from the export on disk. */
function bundleBytes() {
  const dir = join(DIST, '_expo/static/js/web');
  if (!existsSync(dir)) return null;
  let total = 0;
  const files = [];
  for (const name of readdirSync(dir)) {
    const size = statSync(join(dir, name)).size;
    total += size;
    files.push({ file: name, bytes: size });
  }
  return { totalBytes: total, files };
}

async function main() {
  const { server, origin } = await startHost();
  const executablePath = existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : undefined;
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });

  try {
    await page.goto(origin, { waitUntil: 'load' });
    await visible(page, 'screen-capture').waitFor({ state: 'visible', timeout: 30_000 });

    const lookups = [];
    const saves = [];
    const importedLookups = [];

    // Warm-up: bundle parsed, seed index built, React settled. Discarded.
    progress(`warm-up (${String(WARMUP)} discarded)`);
    for (let index = 0; index < WARMUP; index += 1) {
      await measureWarmLookup(page, WORDS[index % WORDS.length]);
      await measureSaveAck(page, WORDS[index % WORDS.length]);
    }
    progress(`measuring (${String(SAMPLES)} samples)`);

    for (let index = 0; index < SAMPLES; index += 1) {
      const word = WORDS[index % WORDS.length];
      const lookup = await measureWarmLookup(page, word);
      const save = await measureSaveAck(page, word);
      const importedQuery = IMPORTED_QUERIES[index % IMPORTED_QUERIES.length];
      const importedLookup = await measureWarmLookup(page, importedQuery);
      lookups.push(lookup);
      saves.push(save);
      importedLookups.push(importedLookup);
      progress(
        `  ${String(index + 1).padStart(2)}/${String(SAMPLES)} ${word}` +
          `  lookup ${lookup.toFixed(1)} ms  save ${save.toFixed(1)} ms` +
          `  imported(${importedQuery}) ${importedLookup.toFixed(1)} ms`,
      );
    }

    progress('cold loads (fresh context each, no cache)');
    const coldLoads = [];
    for (let index = 0; index < COLD_SAMPLES; index += 1) {
      const cold = await measureColdLoad(browser, origin);
      coldLoads.push(cold);
      progress(`  ${String(index + 1).padStart(2)}/${String(COLD_SAMPLES)} ${cold.toFixed(1)} ms`);
    }

    const results = {
      runtime: 'web (Expo Web static export) — Chromium, NOT native, NOT an iPhone',
      chromium: browser.version(),
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      measuredAt: new Date().toISOString(),
      warmupDiscarded: WARMUP,
      bundle: bundleBytes(),
      measurements: [
        summarise('local save ack (press Keep → acknowledgment on screen)', saves),
        summarise('warm lookup, fixture tier (query entered → top answer on screen)', lookups),
        summarise(
          'warm lookup, imported tier — 3,000 lexemes, incl. an English-gloss query',
          importedLookups,
        ),
        summarise('cold load (fresh context, empty cache → capture screen on screen)', coldLoads),
      ],
    };
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
