#!/usr/bin/env node
/**
 * R3-D · the demonstrated optimizer loop (terminal T7 close-out).
 *
 * export-shaped store → tools/fsrs-optimize.mjs → parameter file → the
 * corridor's quiet import door → the LIVE scheduler grades a card with the
 * learner's own fitted weights.
 *
 * The walk proves, end to end, in real Chromium against the real corridor:
 *   1. the optimizer is deterministic: a fresh run over the committed fixture
 *      reproduces the committed candidate BYTE FOR BYTE;
 *   2. the parameter file enters through the app's own 読み込む door
 *      (no server, no console poking — the same file input a learner uses);
 *   3. the rebuilt scheduler is honest about itself (instrument + footer);
 *   4. a graded card's stored schedule matches the CUSTOM-weights prediction
 *      to 8 decimal places and DIFFERS from the default-weights prediction —
 *      replayed independently in Node on the vendored ts-fsrs.
 *
 * Usage: node docs/build-evidence/renkan/optimizer-roundtrip/walk.mjs
 * Writes: walk-output.json + 2 screenshots beside this file.
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..');
const CORRIDOR = resolve(REPO, 'prototypes/corridor');
const FIXTURE = resolve(REPO, 'tools/fixtures/fsrs/synthetic-retention-085.json');
const COMMITTED_CANDIDATE = resolve(HERE, 'candidate-fsrs-pin.json');
const STORE_KEY = 'kairo-corridor-v1';
const DAY = 86400000;

const failures = [];
const steps = [];
function check(name, pass, detail = '') {
  steps.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
  if (!pass) failures.push(name);
}

/* 1 · determinism: rerun the optimizer, byte-compare with the commit */
const scratch = mkdtempSync(join(tmpdir(), 'r3d-walk-'));
const rerunCandidate = join(scratch, 'candidate.json');
const optimizer = spawnSync(
  process.execPath,
  [resolve(REPO, 'tools/fsrs-optimize.mjs'), FIXTURE, '--candidate-out', rerunCandidate],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
check('optimizer exits 0 over the committed fixture', optimizer.status === 0, `exit ${optimizer.status}`);
const committedBytes = readFileSync(COMMITTED_CANDIDATE, 'utf8');
check(
  'a fresh run reproduces the committed candidate byte for byte',
  readFileSync(rerunCandidate, 'utf8') === committedBytes,
  'deterministic full-batch Adam — no clock, no shuffle',
);
const candidate = JSON.parse(committedBytes);
const report = JSON.parse(readFileSync(resolve(HERE, 'fsrs-dry-run.json'), 'utf8'));
const pin = JSON.parse(readFileSync(resolve(CORRIDOR, 'data/fsrs-pin.json'), 'utf8'));
check(
  'the fitted weights genuinely differ from the pinned defaults',
  candidate.w.some((w, i) => w !== pin.w[i]),
  `${candidate.w.filter((w, i) => w !== pin.w[i]).length}/21 weights moved`,
);

/* 2 · serve the real corridor */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const server = createServer((request, response) => {
  const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const file = resolve(CORRIDOR, rel);
  if (!file.startsWith(CORRIDOR) || !existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
  });
  response.end(readFileSync(file));
});
const base = await new Promise((ok, fail) => {
  server.once('error', fail);
  server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`));
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

/* 3 · seed one due review card: stability 5, difficulty 5, last graded ten
 * days ago — a state where the fitted and the default weights disagree about
 * the next Good interval (25 d vs 24 d), so the demonstration cannot pass by
 * coincidence. */
const T = Date.now();
const seededCard = {
  due: new Date(T - 4 * DAY).toISOString(),
  last_review: new Date(T - 10 * DAY).toISOString(),
  stability: 5,
  difficulty: 5,
  elapsed_days: 6,
  scheduled_days: 6,
  reps: 3,
  lapses: 0,
  learning_steps: 0,
  state: 2,
};
await page.goto(`${base}/?entry=shelf`);
await page.evaluate(
  ([key, card, t]) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        taken: [{ t: 'word', id: '学校', label: '学校', ts: t, started: t }],
        srs: { 'word:学校': card },
      }),
    );
  },
  [STORE_KEY, seededCard, T - 10 * DAY],
);
await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray');
const before = await page.evaluate(`window.__KAIRO_SRS__.params()`);
check(
  'before the import the pinned defaults rule',
  before.custom === false && JSON.stringify(before.w) === JSON.stringify(pin.w),
  'params() custom=false, w = pin.w',
);

/* 4 · the learner's door: 読み込む accepts the optimizer's parameter file */
await page.locator('#tray').click();
await page.waitForSelector('#import-file', { state: 'attached' });
await page.setInputFiles('#import-file', COMMITTED_CANDIDATE);
await page.waitForFunction(
  `(() => { try { return !!JSON.parse(localStorage.getItem('${STORE_KEY}')).srsPrefs.fsrs; } catch { return false; } })()`,
  { timeout: 8000 },
);
await page.waitForSelector('#tray'); // the app rebooted on the imported state
const after = await page.evaluate(`window.__KAIRO_SRS__.params()`);
check(
  'the import door installs the fitted weights into the live scheduler',
  after.custom === true && JSON.stringify(after.w) === JSON.stringify(candidate.w),
  `source: ${after.source}`,
);
check(
  'the stored field carries honest provenance',
  typeof after.source === 'string' && after.source.startsWith(candidate.parameterSetId),
  after.source,
);
await page.locator('#tray').click();
await page.waitForSelector('.tray-line');
await page.locator('.tray-line').first().click();
await page.waitForSelector('#sheet');
const footer = await page.evaluate(
  `[...document.querySelectorAll('#sheet p.card-kind')].map((n) => n.textContent).find((t) => t.includes('FSRS-6')) ?? ''`,
);
check(
  'the entry footer says the truth — tuned, never passed off as the default',
  footer.includes('FSRS-6') && footer.includes('tuned from your record'),
  JSON.stringify(footer),
);
await page.screenshot({ path: resolve(HERE, 'shot-1-imported-footer.png') });

/* 5 · grade the card in the real review flow */
const preGrade = await page.evaluate(
  `JSON.parse(localStorage.getItem('${STORE_KEY}')).srs['word:学校']`,
);
await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray');
await page.locator('#tray').click();
await page.waitForSelector('#review-start');
await page.locator('#review-start').click();
await page.waitForSelector('#reveal');
await page.locator('#reveal').click();
await page.waitForSelector('.grade.g-good');
await page.locator('.grade.g-good').click();
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(HERE, 'shot-2-graded.png') });
const graded = await page.evaluate(`(() => {
  const e = JSON.parse(localStorage.getItem('${STORE_KEY}'));
  return { rec: e.srs['word:学校'], row: e.revlog[e.revlog.length - 1] };
})()`);
check('one grade, one revlog row', graded.row[1] === 'word:学校' && graded.row[2] === 3, `g=${graded.row[2]}`);

/* 6 · the independent Node replay on the vendored scheduler, both weight
 * sets, from the exact press instant the revlog kept as audit truth */
const fsrs = await import(resolve(CORRIDOR, 'vendor/ts-fsrs.mjs'));
const engine = (w) =>
  fsrs.fsrs(
    fsrs.generatorParameters({
      w,
      request_retention: pin.requestRetention,
      maximum_interval: pin.maximumInterval,
      enable_fuzz: pin.enableFuzz,
      enable_short_term: pin.enableShortTerm,
      learning_steps: pin.learningSteps,
      relearning_steps: pin.relearningSteps,
    }),
  );
const pressInstant = new Date(graded.row[0]);
const reviveCard = (rec) => ({
  ...rec,
  due: new Date(rec.due),
  last_review: rec.last_review ? new Date(rec.last_review) : undefined,
});
const predict = (w) => engine(w).repeat(reviveCard(preGrade), pressInstant)[fsrs.Rating.Good].card;
const custom = predict(candidate.w);
const dflt = predict(pin.w);
const stabilityDelta = Math.abs(graded.rec.stability - custom.stability);
check(
  'stored stability matches the CUSTOM-weights prediction to 8 dp',
  stabilityDelta < 5e-9,
  `stored ${graded.rec.stability} vs custom ${custom.stability} (|Δ| = ${stabilityDelta})`,
);
check(
  'stored interval and due match the CUSTOM-weights prediction exactly',
  graded.rec.scheduled_days === custom.scheduled_days &&
    Date.parse(graded.rec.due) === custom.due.getTime() &&
    graded.row[10] === custom.scheduled_days,
  `ivl ${graded.rec.scheduled_days} d · due ${graded.rec.due}`,
);
check(
  'the DEFAULT-weights prediction is a different schedule — the fit is real',
  graded.rec.scheduled_days !== dflt.scheduled_days &&
    Math.abs(graded.rec.stability - dflt.stability) > 1e-6,
  `custom ivl ${custom.scheduled_days} d vs default ivl ${dflt.scheduled_days} d · stability Δ ${Math.abs(
    graded.rec.stability - dflt.stability,
  ).toFixed(8)}`,
);
check('the walk leaves no console errors', consoleErrors.length === 0, consoleErrors.join(' | ') || 'clean');

await browser.close();
server.close();
rmSync(scratch, { recursive: true, force: true });

const output = {
  walkedAt: new Date().toISOString(),
  fixture: 'tools/fixtures/fsrs/synthetic-retention-085.json',
  optimizer: {
    command: 'node tools/fsrs-optimize.mjs tools/fixtures/fsrs/synthetic-retention-085.json',
    trainingReviews: report.input.trainingReviews,
    logLossBefore: report.before.logLoss,
    logLossAfter: report.after.logLoss,
    parameterSetId: candidate.parameterSetId,
  },
  seededCard,
  pressInstant: pressInstant.toISOString(),
  stored: { stability: graded.rec.stability, scheduledDays: graded.rec.scheduled_days, due: graded.rec.due },
  customPrediction: {
    stability: custom.stability,
    scheduledDays: custom.scheduled_days,
    due: custom.due.toISOString(),
  },
  defaultPrediction: {
    stability: dflt.stability,
    scheduledDays: dflt.scheduled_days,
    due: dflt.due.toISOString(),
  },
  stabilityDeltaFromCustom: stabilityDelta,
  revlogRow: graded.row,
  steps,
  status: failures.length ? 'FAIL' : 'PASS',
};
writeFileSync(resolve(HERE, 'walk-output.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`\n${steps.length - failures.length}/${steps.length} checks passed → walk-output.json`);
process.exit(failures.length ? 1 : 0);
