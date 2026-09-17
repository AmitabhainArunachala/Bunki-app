/** Actual UI save-failure regressions on a supplied, byte-verified artifact.
 * Questions, credentials and learner records are synthetic; no public network. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, armRecordWriteFailure, clearRecordWriteFailure } from './record-test-support.mjs';

const require = createRequire(import.meta.url);
const { verifyBundledArtifact } = require('../../bunki-desktop/lib/artifact.cjs');
const SITE = resolve(process.env.KAIRO_SITE_DIR || '');
const identity = verifyBundledArtifact(SITE);
assert.equal(identity.artifactSha256, process.env.KAIRO_VERIFIED_ARTIFACT_SHA256, 'Supply the expected artifact digest');
const OUT = resolveCorridorEvidence();
const engine = process.env.KAIRO_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const questions = [
  { q: '朝、学校へ行きます。', opts: ['学校', '電話', '時計', '空'], right: 0, why: 'Synthetic answer explanation one.' },
  { q: '友達に電話をかけます。', opts: ['電話', '学校', '時計', '空'], right: 0, why: 'Synthetic answer explanation two.' },
  { q: '今日はいい天気です。', opts: ['天気', '電話', '時計', '学校'], right: 0, why: 'Synthetic answer explanation three.' },
];
const initialRun = { qs: questions, ix: 0, picked: null, correct: 0, ts: 1_785_000_000_000 };
const results = [];
const errors = [];
const external = [];
const server = createServer((request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(SITE, name === '/' ? 'index.html' : name.slice(1));
    assert(file.startsWith(SITE + sep) && statSync(file).isFile());
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await ({ chromium, webkit }[engine]).launch(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
const version = browser.version();
const textHash = (text) => createHash('sha256').update(text).digest('hex');

async function check(name, run, action) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const beforeErrors = errors.length;
  try {
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await context.addInitScript(({ quiz, questions }) => {
      const storageKey = 'kairo-corridor-v1';
      if (!sessionStorage.getItem('quiz-storage-seeded')) {
        localStorage.setItem(storageKey, JSON.stringify({ v: 1,
          taken: ['学校', '電話', '先生', '時間', '天気'].map((id, index) => ({ t: 'word', id, label: id, ts: 1_785_000_000_000 + index })),
          aiQuiz: quiz, revlog: [], obslog: [], srs: {}, unknownFuture: { original: 'keep this' },
        }));
        localStorage.setItem('kairo-ai-provider-v1', JSON.stringify({ v: 1, baseUrl: 'https://api.anthropic.com', model: 'quiz-fixture',
          credential: { origin: 'https://api.anthropic.com', key: 'sk-ant-synthetic-not-a-credential' } }));
        sessionStorage.setItem('quiz-storage-seeded', '1');
      }
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url !== 'https://api.anthropic.com/v1/messages') return fetchOriginal(input, init);
        const body = JSON.parse(init.body);
        const reply = String(body.system).includes('observations about the LEARNER') ? [] : questions;
        return Promise.resolve(new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }), { headers: { 'content-type': 'application/json' } }));
      };
    }, { quiz: run, questions });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/?entry=shelf&ui=bi');
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.locator('#tray').click();
    if (run && name !== 'discard') {
      await page.locator('#aiq-resume').click();
      await page.locator(run.ix === questions.length ? '#aiq-close' : '.aiq-q').waitFor();
    }
    const before = JSON.stringify(await readAppRecord(page));
    await armRecordWriteFailure(page, 'quota', { roots: ['aiQuiz'] });
    await action(page, run);
    assert.equal(JSON.stringify(await readAppRecord(page)), before, 'The rejected native transaction preserves the complete acknowledged learner record');
    assert.equal(errors.length, beforeErrors, 'No unhandled page error');
    results.push({ name, pass: true, storedBeforeSha256: textHash(before) });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, reason: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}

async function rejected(page) {
  await page.waitForFunction(() => window.__recordTestFault?.fired > 0);
  await page.locator('#store-alert').waitFor({ state: 'visible' });
}

try {
  await check('answer', initialRun, async (page) => {
    await page.locator('.lesson-option').first().click();
    await rejected(page);
    assert.equal(await page.locator('.aiq-why').count(), 0, 'A failed save does not reveal an answer or update the score');
    assert.equal(await page.locator('#aiq-next').count(), 0);
    const fault = await clearRecordWriteFailure(page);
    assert(fault.fired > 0, 'The native quiz save actually encountered the injected fault');
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.locator('#tray').click();
    await page.locator('#aiq-resume').click();
    assert.equal(await page.locator('.aiq-q').textContent(), questions[0].q);
    assert.equal(await page.locator('.aiq-why').count(), 0);
  });
  await check('next', { ...initialRun, picked: 0, correct: 1 }, async (page) => {
    await page.locator('#aiq-next').click();
    await rejected(page);
    assert.equal(await page.locator('.aiq-q').textContent(), questions[0].q, 'Failed Next stays on the saved question');
    assert.equal(await page.locator('.aiq-why').textContent(), questions[0].why);
  });
  await check('close', { ...initialRun, ix: questions.length, correct: questions.length }, async (page) => {
    await page.locator('#aiq-close').click();
    await rejected(page);
    assert.equal(await page.locator('#aiq-close').count(), 1, 'Failed Close leaves the saved result open');
  });
  await check('discard', initialRun, async (page) => {
    await page.locator('#aiq-drop').click();
    await rejected(page);
    assert.equal(await page.locator('#aiq-resume').count(), 1, 'Failed discard retains the saved run and its resume door');
  });
  await check('generate', null, async (page) => {
    await page.locator('#aiq-start').click();
    await rejected(page);
    await page.waitForFunction(() => document.querySelector('.aiq-q') || document.querySelector('#aiq-start')?.disabled === false);
    assert.equal(await page.locator('.aiq-q').count(), 0, 'Failed generation save cannot open an unsaved quiz');
    assert.equal(await page.locator('#aiq-start').count(), 1);
    assert.equal(await page.locator('#aiq-resume').count(), 0);
  });
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  const receipt = { format: 'kairo-tutor-quiz-storage-verification', v: 1,
    artifactSha256: identity.artifactSha256, engine, version, results, errors, external,
    limits: ['Synthetic questions/provider and injected quota; no Japanese quality or physical device acceptance claim'],
  };
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (results.length !== 5 || results.some((row) => !row.pass) || errors.length || external.length) process.exitCode = 1;
}
