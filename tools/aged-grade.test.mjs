/* global process, console, document, window, performance, requestAnimationFrame, URL */
/** A saved answer on a year of history comes back in time (DISC-141, 2026-11-20).
 *
 * A grade waits for its durable save before the next card is shown. The save used to copy, serialize and hash the
 * learner's whole record about a dozen times, so with a year of history (21,900 reviews and 54,750 observations,
 * 6.2 MB) the next card came 26.6 s after the grade on a phone-class CPU, where a new learner waited a tenth of a
 * second. The store now reuses what it has already normalized (packages/persistence/src/replication/json.ts), and the
 * same grade takes under a second.
 *
 * The app runs here as the production builder assembles it (KAIRO_SITE_DIR, else assembled once for this file), at
 * 390 px, silent, with Chromium's CPU slowed four times. The history is written into the real store with the app
 * closed, as the repository's aged-record measurement does; the grade is the visible one, from the tap on 良い to the
 * next card's front. Each grade is then read back from the store and again after a reload: the new review is there
 * and every earlier row is unchanged.
 *
 * The bound is relative, so that it means the same on a fast Mac and on a hosted runner: the year-sized grade may
 * take BUDGET_MS, or RATIO times this machine's own small-record grade, whichever is more. On the day of the fix
 * the two were about 0.1 s and 0.8 s here (26.6 s before it, which the bound refuses on any machine).
 *
 * AGED_GRADE_COMMANDS=<n> also seeds n command receipts, one small row for each past save as a year of real use
 * leaves them (21,900 measured 2.0 s on that day, 3.0 s before the per-row checks were kept). It is a measurement
 * for a person to run, not part of the default run: seeding takes a while.
 *
 * Chromium only: the CPU slowdown is a DevTools command. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolveCorridorSite } from '../scripts/resolve-corridor-site.mjs';
import { readAppRecord } from '../prototypes/corridor/tools/record-test-support.mjs';

const BUDGET_MS = 2000;
const RATIO = 25;
const SLOWDOWN = 4;
const COMMANDS = Number(process.env.AGED_GRADE_COMMANDS || 0);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};

/** Every learner byte is synthetic. Six due words, and with `aged` a year of reviews and observations behind them. */
function syntheticRecord(aged) {
  const now = Date.now();
  const day = 86_400_000;
  const iso = (ms) => new Date(ms).toISOString();
  const terms = ['学校', '先生', '電車', '日本', '学生', '音楽'];
  const taken = terms.map((term, i) => ({
    t: 'word',
    id: term,
    label: term,
    ts: now - day + i,
    started: now - day + i,
  }));
  const srs = Object.fromEntries(
    terms.map((term, i) => [
      'word:' + term,
      {
        due: iso(now - (7 - i) * day),
        last_review: iso(now - 9 * day),
        stability: 6,
        difficulty: 5,
        elapsed_days: 4,
        scheduled_days: 5,
        reps: 3,
        lapses: 0,
        learning_steps: 0,
        state: 2,
      },
    ]),
  );
  const start = now - 369 * day;
  const word = (i) => 'word:合成履歴' + String(i % 1470).padStart(4, '0');
  const revlog = Array.from({ length: aged ? 21_900 : 0 }, (_, i) => [
    start + i * 1_200_000,
    word(i),
    3,
    2,
    3,
    0.9375,
    6,
    5,
    8.25,
    4.8,
    8,
    6,
  ]);
  const obslog = Array.from({ length: aged ? 54_750 : 0 }, (_, i) => [
    start + i * 540_000,
    'tap',
    word(i),
    2,
    'bunki-synthetic-study-passage-' + String(i % 800).padStart(4, '0'),
  ]);
  return { v: 1, taken, srs, revlog, obslog };
}

/** Runs in the page with the app closed: write the history into the installation's own store, and as many command
 * receipts as asked. Kept as text, because the test runner rewrites an `import()` in a function it can see. */
const SEED = `async ({ recordText, commands }) => {
  const { IndexedDbReplicationStore, encodeLocalJson } = await import('/modules/record-core.mjs');
  const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
  const policy = {
    binding: installation.binding,
    schemaEpoch: 1,
    deletionEpoch: 0,
    mergePolicy: 'kairo-conservative-merge/1',
  };
  const store = await IndexedDbReplicationStore.open({
    databaseName: installation.databaseName,
    policy,
    actor: installation.actor,
  });
  try {
    let before = await store.snapshot();
    await store.commitLocal({
      changeId: 'synthetic-age-' + crypto.randomUUID(),
      binding: policy.binding,
      expectedRevision: before.revision,
      occurredAt: new Date().toISOString(),
      mutations: [
        { kind: 'put', collection: 'learner-record', id: 'current', value: JSON.parse(recordText) },
      ],
      operations: [],
    });
    // A receipt as the record host writes one for each command (record-host.mjs).
    const scope = { accountId: policy.binding.accountId, learnerId: policy.binding.learnerId };
    const zero = '0'.repeat(64);
    for (let from = 0; from < commands; from += 250) {
      before = await store.snapshot();
      const mutations = [];
      for (let index = from; index < Math.min(commands, from + 250); index += 1) {
        const changeId = 'synthetic-command-' + String(index).padStart(6, '0');
        mutations.push({
          kind: 'put',
          collection: 'kairo:record-host-commands',
          id: changeId,
          value: {
            format: 'kairo-local-command-receipt',
            version: 1,
            changeId,
            type: 'app.patch/1',
            occurredAt: new Date(Date.now() - (commands - index) * 60000).toISOString(),
            scope,
            commandSha256: encodeLocalJson([scope, changeId]).sha256,
            beforeRevision: before.revision,
            committedRevision: before.revision + 1,
            recordSha256: zero,
            archiveSha256: zero,
          },
        });
      }
      await store.commitLocal({
        changeId: 'synthetic-commands-' + from + '-' + crypto.randomUUID(),
        binding: policy.binding,
        expectedRevision: before.revision,
        occurredAt: new Date().toISOString(),
        mutations,
        operations: [],
      });
    }
    return (await store.snapshot()).documents.length;
  } finally {
    await store.close();
  }
}`;
function seed(page, record, commands) {
  // The blank page carries no content policy, so the text can be evaluated there.
  return page.evaluate(
    ([source, input]) => (0, eval)('(' + source + ')')(input),
    [SEED, { recordText: JSON.stringify(record), commands }],
  );
}

const worst = (values) => Math.max(...values);

describe('a grade on a year of history, in chromium at a quarter of the speed', () => {
  let server;
  let origin;
  let browser;
  const measured = {};

  beforeAll(async () => {
    const site = resolveCorridorSite();
    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname === '/fixture-blank') {
          response.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
          response.end('<!doctype html><title>Bunki test, app closed</title>');
          return;
        }
        const file = resolve(site, '.' + pathname);
        if (!file.startsWith(site + sep)) throw new Error('outside the site');
        const bytes = await readFile(file);
        response.writeHead(200, {
          'content-type': TYPES[extname(file)] || 'application/octet-stream',
          'cache-control': 'no-store',
        });
        response.end(bytes);
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((done, fail) => {
      server.once('error', fail);
      server.listen(0, '127.0.0.1', done);
    });
    origin = 'http://127.0.0.1:' + server.address().port;
    // No sound from tests (John, 2026-11-10).
    browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  }, 300_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((done) => (server ? server.close(done) : done()));
  });

  /** Three visible grades on a fresh installation holding `fixture`; each timed from the tap to the next front. */
  async function grades(aged, commands) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    try {
      // Nothing leaves this machine: only the test's own server answers.
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const open = async () => {
        await page.goto(origin + '/index.html?entry=shelf&ui=bi', {
          waitUntil: 'load',
          timeout: 120_000,
        });
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
          timeout: 120_000,
        });
      };
      await open();
      await page.waitForFunction(() => window.__KAIRO_RECORD_SAFETY__?.state().writable, null, {
        timeout: 120_000,
      });
      const fixture = { ...(await readAppRecord(page)), ...syntheticRecord(aged) };
      await page.goto(origin + '/fixture-blank');
      const documents = await seed(page, fixture, commands);
      await open();
      expect(await readAppRecord(page), 'the app reopens the seeded history').toEqual(fixture);
      await page.locator('#tray, #tab-today').click();
      await page.locator('#review-start').click();
      const devtools = await context.newCDPSession(page);
      const elapsed = [];
      for (let index = 0; index < 3; index += 1) {
        await page.locator('#reveal').click({ timeout: 120_000 });
        await page.locator('.grade-row .grade.g-good').waitFor({ timeout: 120_000 });
        await devtools.send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });
        try {
          const result = await page.evaluate(
            () =>
              new Promise((done, fail) => {
                const grade = document.querySelector('.grade-row .grade.g-good');
                const face = () => document.querySelector('.review-face')?.textContent.trim();
                const current = face();
                if (!grade || grade.disabled || !current) {
                  fail(new Error('no gradable answer on the screen'));
                  return;
                }
                const start = performance.now();
                const turn = () => {
                  if (performance.now() - start > 90_000) {
                    fail(new Error('no next card within 90 seconds'));
                    return;
                  }
                  const next = face();
                  if (document.querySelector('#reveal') && next && next !== current)
                    requestAnimationFrame(() => done(performance.now() - start));
                  else requestAnimationFrame(turn);
                };
                grade.click();
                requestAnimationFrame(turn);
              }),
          );
          elapsed.push(Math.round(result));
        } finally {
          await devtools.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        }
      }
      const saved = await readAppRecord(page);
      await open();
      expect(await readAppRecord(page), 'the record reopens as it was saved').toEqual(saved);
      expect(saved.revlog.slice(0, -3), 'earlier reviews are unchanged').toEqual(fixture.revlog);
      expect(saved.obslog, 'earlier observations are unchanged').toEqual(fixture.obslog);
      expect(
        saved.revlog.slice(-3).map((row) => [row[1], row[2]]),
        'the three grades are in the review log, in order',
      ).toEqual([
        ['word:学校', 3],
        ['word:先生', 3],
        ['word:電車', 3],
      ]);
      expect(errors, 'no page error').toEqual([]);
      return { elapsed, documents };
    } finally {
      await context.close();
    }
  }

  test('a new learner: three grades are saved and read back', async () => {
    measured.small = await grades(false, 0);
    expect(measured.small.elapsed).toHaveLength(3);
  }, 600_000);

  test('a year of history: the next card comes within the bound, and nothing earlier is touched', async () => {
    measured.aged = await grades(true, 0);
    const bound = Math.max(BUDGET_MS, RATIO * worst(measured.small.elapsed));
    console.log(
      `aged grade ${measured.aged.elapsed.join(', ')} ms; small ${measured.small.elapsed.join(', ')} ms; bound ${bound} ms`,
    );
    expect(worst(measured.aged.elapsed)).toBeLessThanOrEqual(bound);
  }, 600_000);

  test('control: the bound refuses the wait this was written for, on a slow machine too', () => {
    const bound = (small) => Math.max(BUDGET_MS, RATIO * small);
    // f32ccfc6f on the lead's Mac: 129 ms small, 26,620 ms aged. The first two partial repairs: 17,870 and 11,750 ms.
    for (const before of [26_620, 17_870, 11_750]) expect(before).toBeGreaterThan(bound(129));
    // The same build on a machine three times slower still fails; today's build on that machine still passes.
    expect(3 * 26_620).toBeGreaterThan(bound(3 * 129));
    expect(3 * 854).toBeLessThanOrEqual(bound(3 * 113));
  });

  test.runIf(COMMANDS > 0)(
    'a year of history with a receipt row for each past save (a measurement, on request)',
    async () => {
      const run = await grades(true, COMMANDS);
      console.log(
        `aged grade with ${run.documents} document rows: ${run.elapsed.join(', ')} ms; small ${measured.small.elapsed.join(', ')} ms`,
      );
      expect(run.documents).toBeGreaterThan(COMMANDS);
      expect(worst(run.elapsed)).toBeLessThanOrEqual(
        Math.max(2 * BUDGET_MS, 2 * RATIO * worst(measured.small.elapsed)),
      );
    },
    1_800_000,
  );
});
