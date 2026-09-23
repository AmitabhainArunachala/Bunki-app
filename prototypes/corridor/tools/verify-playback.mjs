/** Real reader navigation with deterministic browser audio doubles. These
 * probes establish playback lifecycle behavior, not voice or codec quality. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { CORRIDOR_DIR, startCorridorServer } from './verify-corridor.mjs';
import { readAppRecord } from './record-test-support.mjs';

const out = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/playback'));
mkdirSync(out, { recursive: true });
const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const { server, base } = await startCorridorServer();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
const manifest = { v: 1, words: {}, sentences: { 'yasashii:7': { have: [0, 1] }, 'yasashii:6': { have: [0, 1] } } };

async function fixture(mode) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
  let release;
  const ready = new Promise((done) => { release = done; });
  if (mode !== 'delayed') release();
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.endsWith('/audio/manifest.json')) {
      await ready;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'tts' ? null : manifest) });
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    const audio = { utterances: [], clips: [], cancels: 0 };
    window.__playbackFixture = audio;
    Object.defineProperty(window, '__KAIRO_AUDIO__', { value: true, writable: false });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [{ lang: 'ja-JP', name: 'Synthetic Japanese', voiceURI: 'fixture', localService: true }],
      addEventListener() {},
      speak(utterance) { audio.utterances.push(utterance); },
      cancel() { audio.cancels += 1; },
    } });
    window.Audio = class {
      constructor(src) { this.src = src; this.paused = true; audio.clips.push(this); }
      play() { this.paused = false; this.onplay?.(); return Promise.resolve(); }
      pause() { this.paused = true; }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('[data-passage="yasashii:7"] .shelf-open').click();
  await page.waitForSelector('#reader .glossary-ref');
  return { context, page, errors, release };
}

async function press(page) { await page.locator('#listen-toggle').click(); }
async function counts(page) {
  return page.evaluate(() => ({
    utterances: window.__playbackFixture.utterances.map((u) => u.text),
    clips: window.__playbackFixture.clips.map((a) => ({ src: a.src, paused: a.paused })),
    cancels: window.__playbackFixture.cancels,
    pressed: document.querySelector('#listen-toggle')?.getAttribute('aria-pressed'),
    note: document.querySelector('#listen-note')?.textContent,
  }));
}
async function switchPassage(page) {
  await page.locator('#reader [data-glossary-ref="yasashii:6"]').click();
  await page.waitForFunction(() => document.querySelector('h1.view-title')?.textContent === '印鑑登録証明書' && document.querySelector('#reader .tok'));
}
async function started(page, type, length = 1) {
  await page.waitForFunction(({ type, length }) => window.__playbackFixture[type].length === length, { type, length }, { timeout: 5000 });
}
async function check(name, mode, body) {
  if (filter && name !== filter) return;
  const f = await fixture(mode);
  try {
    await body(f);
    assert.deepEqual(f.errors, [], 'no uncaught application errors');
    const record = await readAppRecord(f.page);
    assert.deepEqual(record.taken || [], [], 'listening never promotes a card');
    assert.deepEqual(record.srs || {}, {}, 'listening never schedules a review');
    assert.deepEqual(record.revlog || [], [], 'listening never grades a review');
    results.push({ name, pass: true, observed: await counts(f.page) });
    console.log(`  ok  ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error: error.message, pageErrors: f.errors, observed: await counts(f.page) });
    console.error(` FAIL ${name}: ${error.message}`);
    await f.page.screenshot({ path: resolve(out, `${name}.png`) });
  } finally {
    f.release();
    await f.context.close();
  }
}

try {
  await check('passage-switch-cancels-tts', 'tts', async ({ page }) => {
    await press(page);
    await started(page, 'utterances');
    const before = await counts(page);
    await switchPassage(page);
    const after = await counts(page);
    assert.equal(after.pressed, 'false');
    assert.equal(after.cancels, before.cancels + 1);
    await page.evaluate(() => window.__playbackFixture.utterances[0].onend());
    await page.waitForTimeout(350); // exceed the reader's inter-sentence timer
    assert.equal((await counts(page)).utterances.length, 1);
  });
  await check('stale-tts-events-cannot-change-a-restarted-read', 'tts', async ({ page }) => {
    await press(page);
    await started(page, 'utterances');
    await press(page);
    await press(page);
    await started(page, 'utterances', 2);
    await page.evaluate(() => {
      const old = window.__playbackFixture.utterances[0];
      old.onend();
      old.onerror({ error: 'synthesis-failed' });
    });
    await page.waitForTimeout(350);
    const active = await counts(page);
    assert.equal(active.utterances.length, 2);
    assert.equal(active.pressed, 'true');
    assert.ok(!/no Japanese voice/.test(active.note));
    await page.evaluate(() => window.__playbackFixture.utterances[1].onend());
    await started(page, 'utterances', 3);
  });
  await check('reader-settings-keep-the-active-passage-playing', 'tts', async ({ page }) => {
    await press(page);
    await started(page, 'utterances');
    const before = await counts(page);
    await page.locator('#dials-toggle').click();
    const after = await counts(page);
    assert.equal(after.pressed, 'true');
    assert.equal(after.cancels, before.cancels);
    assert.equal(after.utterances.length, 1);
  });
  await check('passage-switch-pauses-recording-and-ignores-late-error', 'recorded', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await switchPassage(page);
    assert.equal((await counts(page)).clips[0].paused, true);
    assert.equal((await counts(page)).pressed, 'false');
    await press(page);
    await started(page, 'clips', 2);
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await page.waitForTimeout(350);
    const active = await counts(page);
    assert.equal(active.pressed, 'true');
    assert.equal(active.utterances.length, 0, 'old clip failure cannot start old-passage TTS');
    assert.equal(active.clips.length, 2);
    await page.evaluate(() => window.__playbackFixture.clips[1].onended());
    await started(page, 'clips', 3);
    assert.match((await counts(page)).clips[2].src, /yasashii_6-001\.m4a$/);
  });
  await check('late-manifest-starts-only-the-current-passage', 'delayed', async ({ page, release }) => {
    await press(page);
    await switchPassage(page);
    assert.equal((await counts(page)).pressed, 'false');
    await press(page);
    release();
    await started(page, 'clips');
    await page.waitForTimeout(350);
    const active = await counts(page);
    assert.equal(active.clips.length, 1);
    assert.match(active.clips[0].src, /yasashii_6-000\.m4a$/);
    assert.equal(active.pressed, 'true');
  });
  await check('stop-before-manifest-arrival-stays-stopped', 'delayed', async ({ page, release }) => {
    await press(page);
    await press(page);
    release();
    await page.waitForTimeout(350);
    const after = await counts(page);
    assert.equal(after.pressed, 'false');
    assert.equal(after.clips.length, 0);
    assert.equal(after.utterances.length, 0);
  });
  await check('current-recording-failure-falls-back-to-tts', 'recorded', async ({ page }) => {
    await press(page);
    await started(page, 'clips');
    await page.evaluate(() => window.__playbackFixture.clips[0].onerror());
    await started(page, 'utterances');
    assert.equal((await counts(page)).pressed, 'true');
    assert.match((await counts(page)).note, /interim device voice/, 'fallback names the voice actually in use');
  });
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
if (!results.length) results.push({ name: filter || 'playback', pass: false, error: 'No matching tests' });
const failures = results.filter((row) => !row.pass).length;
writeFileSync(resolve(out, 'verify-playback.json'), `${JSON.stringify({
  site: CORRIDOR_DIR,
  corridorSha256: createHash('sha256').update(readFileSync(resolve(CORRIDOR_DIR, 'corridor.js'))).digest('hex'),
  simulatedBrowser: 'Chromium', audio: 'deterministic speech and media doubles; no voice-quality claim',
  results, failures,
}, null, 2)}\n`);
console.log(`Playback lifecycle: ${results.length - failures}/${results.length} passed.`);
process.exitCode = failures ? 1 : 0;
