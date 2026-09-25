/**
 * Voice honesty: no device voice, no automatic voice, a reason whenever nothing can play.
 *
 * The operator's words are the specification:
 *   2026-09-17 "the basic computer voice needs to NOT BE AN OPTION AT ALL!!! it is
 *              terrible and grating and needs to be cut."
 *   2026-09-19 "ami was the shitty voice"
 * Every roster voice is interim until his audition; nothing plays unless the learner
 * explicitly chose it. This file previously asserted the device-voice picker these
 * rulings removed; its name is kept so every caller still runs it.
 *
 *   V0 identity: the served build is the commit under test.
 *   V1 a build whose recordings are absent (manifest 404): listen is shut, the note
 *      says there are no recorded voices, no picker, zero device speech.
 *   V2 recordings present, no choice: on a recorded passage listen is shut, the note
 *      says the passage is recorded only in アミ, the picker preselects "Choose a
 *      voice…" and labels every voice interim; zero device speech.
 *   V3 choosing アミ opens listen and plays her recorded sentence (a real audio/s/ami
 *      request); zero device speech.
 *   V4 a recording that fails to load stops honestly with a visible reason; no
 *      fallback voice of any kind.
 *   V5 the review card's 音 door with no choice: a visible role=status reason and no
 *      sound; after choosing ずんだもん it requests audio/w/zundamon/…; zero device speech.
 * Every case spies speechSynthesis.speak: a single call anywhere is a failure.
 *
 * Claim boundary: proves wiring and honesty in Chromium; it cannot judge how any voice
 * sounds — that is the operator's audition (JOHN-DECISIONS #4).
 *
 * Usage: node verify-voice-picker.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const results = [];
const pageErrors = []; // bounded: the first 20 uncaught page errors, each tagged with its case
let currentCase = 'setup';
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};
const host = await startStaticHost({ site: SITE, port: 0 });
const origin = host.origin;
const browser = await chromium.launch();
const manifest = JSON.parse(readFileSync(resolve(SITE, 'audio/manifest.json'), 'utf8'));
const recordedPassage = Object.keys(manifest.sentences).find((id) => manifest.sentences[id].have?.length);
const recordedWord = Object.keys(manifest.words).find((w) => manifest.words[w].voices.includes('zundamon'));

// A device engine that records every attempt to speak — the rulings allow none.
const SPY = `(() => {
  const spoken = [];
  const synth = { getVoices: () => [{ name: 'Kyoko', voiceURI: 'kyoko', lang: 'ja-JP', localService: true, default: true }],
    speak: (u) => { spoken.push(String(u && u.text || '')); }, cancel() {}, pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.voice = null; this.lang = ''; };
  window.__deviceSpoken = spoken;
})();`;
const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
const deviceSpoken = (page) => page.evaluate(() => window.__deviceSpoken.length);
async function openContext({ absent = false, pref = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await silenceBrowserAudio(context);
  await context.addInitScript(SPY);
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (pageErrors.length < 20) pageErrors.push({ case: currentCase, message: error.message });
  }));
  if (pref) await context.addInitScript((value) => { try { localStorage.setItem('kairo-rec-voice-v1', value); } catch { /* spy */ } }, pref);
  if (absent) await context.route('**/audio/manifest.json', (route) => route.fulfill({ status: 404, body: '' }));
  const requests = [];
  context.on('request', (request) => { const path = new URL(request.url()).pathname; if (path.startsWith('/audio/')) requests.push(path); });
  return { context, requests };
}
async function openRecordedReader(page) {
  await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
  const door = page.locator(`[data-passage="${recordedPassage}"]:not([data-recommendation]) .shelf-open`).first();
  await door.click();
  await page.waitForSelector('#listen-toggle', { timeout: 15_000 });
  await page.waitForFunction(() => !/Checking for recordings|収録音声を確認/u.test(document.querySelector('#listen-note')?.textContent || ''), null, { timeout: 10_000 }).catch(() => {});
  return page.evaluate(() => ({ disabled: document.querySelector('#listen-toggle')?.disabled ?? null,
    note: document.querySelector('#listen-note')?.textContent || '',
    picker: !!document.querySelector('#listen-voice'),
    selected: document.querySelector('#listen-voice')?.value ?? null,
    options: [...document.querySelectorAll('#listen-voice option')].map((o) => ({ value: o.value, text: o.textContent })) }));
}

try {
  // V0
  {
    currentCase = 'V0';
    const context = await browser.newContext(); const page = await context.newPage();
    const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
    let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
    const expected = process.env.KAIRO_EXPECT_GITSHA || head;
    const served = createHash('sha256').update(Buffer.from(await (await page.request.get(`${origin}/corridor.js`)).body())).digest('hex');
    check('V0 served build is the expected clean commit', identity.gitSha === expected && identity.sourceDirty === false
      && served === new Map(identity.files.map((row) => [row.path, row.sha256])).get('corridor.js'), `served=${identity.gitSha} expected=${expected}`);
    await context.close();
    if (results.some((r) => !r.pass)) throw new Error('identity failed');
  }
  check('fixture: a recorded passage and a word recorded in ずんだもん exist in the manifest', !!recordedPassage && !!recordedWord,
    `${recordedPassage} · ${recordedWord}`);

  // V1 recordings absent
  {
    currentCase = 'V1';
    const { context } = await openContext({ absent: true }); const page = await context.newPage();
    const state = await openRecordedReader(page);
    await page.locator('#listen-toggle').click({ force: false, trial: false }).catch(() => {});
    check('V1 absent recordings: listen is shut', state.disabled === true, JSON.stringify(state));
    check('V1 absent recordings: the note says there are none', /no recorded voices|収録音声がありません/u.test(state.note), state.note);
    check('V1 absent recordings: no voice picker is offered', state.picker === false);
    check('V1 absent recordings: zero device speech', (await deviceSpoken(page)) === 0);
    await context.close();
  }

  // V2 present, no choice
  {
    currentCase = 'V2';
    const { context, requests } = await openContext(); const page = await context.newPage();
    const state = await openRecordedReader(page);
    check('V2 no choice: listen is shut on a recorded passage', state.disabled === true, JSON.stringify(state));
    check('V2 no choice: the note says it is recorded only in アミ and to choose', /recorded only in Koharune Ami|小春音アミ（仮の声・検収前）の収録だけ/u.test(state.note), state.note);
    check('V2 no choice: the picker preselects "Choose a voice…"', state.selected === '' && state.options[0]?.value === '', JSON.stringify(state.options[0]));
    const roster = state.options.filter((o) => o.value);
    check('V2 no choice: every voice is labelled interim', roster.length === 5 && roster.every((o) => /interim|仮/u.test(o.text)), JSON.stringify(roster.map((o) => o.text)));
    check('V2 no choice: nothing requested from the recordings', !requests.some((path) => path.startsWith('/audio/s/') || path.startsWith('/audio/w/')), requests.join(','));
    check('V2 no choice: zero device speech', (await deviceSpoken(page)) === 0);

    // V3 choose アミ explicitly
    currentCase = 'V3';
    await page.locator('#listen-voice').selectOption('ami');
    await page.waitForFunction(() => document.querySelector('#listen-toggle') && !document.querySelector('#listen-toggle').disabled, null, { timeout: 5_000 }).catch(() => {});
    const opened = await page.evaluate(() => !document.querySelector('#listen-toggle')?.disabled);
    check('V3 choosing アミ opens listen', opened);
    if (opened) await page.locator('#listen-toggle').click();
    const played = await page.waitForFunction((prefix) => performance.getEntriesByType('resource').some((e) => new URL(e.name).pathname.startsWith(prefix)),
      `/audio/s/ami/`, { timeout: 5_000 }).then(() => true, () => false);
    check('V3 listen plays her recorded sentence', played || requests.some((path) => path.startsWith('/audio/s/ami/')), requests.slice(-3).join(','));
    check('V3 zero device speech', (await deviceSpoken(page)) === 0);
    await context.close();
  }

  // V4 a recording that fails to load
  {
    currentCase = 'V4';
    const { context } = await openContext({ pref: 'ami' });
    await context.route('**/audio/s/**', (route) => route.fulfill({ status: 404, body: '' }));
    const page = await context.newPage();
    const state = await openRecordedReader(page);
    if (!state.disabled) await page.locator('#listen-toggle').click();
    const stopped = await page.waitForFunction(() => /could not play|再生できません/u.test(document.querySelector('#listen-note')?.textContent || ''), null, { timeout: 10_000 })
      .then(() => true, () => false);
    check('V4 a failed recording stops with a visible reason', stopped, await page.evaluate(() => document.querySelector('#listen-note')?.textContent || ''));
    check('V4 no fallback voice: zero device speech', (await deviceSpoken(page)) === 0);
    await context.close();
  }

  // V5 the review card's 音 door
  {
    currentCase = 'V5';
    const { context, requests } = await openContext();
    await context.addInitScript((word) => {
      if (localStorage.getItem('voice-honesty-seeded')) return;
      const t = 1700000000000;
      localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [{ t: 'word', id: word, label: word, ts: t, started: t }], srs: {}, revlog: [], obslog: [] }));
      localStorage.setItem('voice-honesty-seeded', '1');
    }, recordedWord);
    const page = await context.newPage();
    await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
    await page.locator('#tray').click();
    await page.locator('#review-start').click();
    await page.locator('#declare-notyet').click().catch(() => {});
    const door = await page.waitForSelector('#card-say', { timeout: 10_000 }).then(() => true, () => false);
    check('V5 the card carries its 音 door', door);
    if (door) {
      await page.locator('#card-say').click();
      const reason = await page.waitForFunction(() => (document.querySelector('#card-say-note')?.textContent || '').length > 0, null, { timeout: 5_000 })
        .then(() => page.evaluate(() => document.querySelector('#card-say-note').textContent), () => '');
      check('V5 with no choice the door says why, visibly', /No voice chosen|声がまだ選ばれていません/u.test(reason), reason);
      check('V5 with no choice nothing is requested', !requests.some((path) => path.startsWith('/audio/w/')), requests.join(','));
      await page.evaluate(() => localStorage.setItem('kairo-rec-voice-v1', 'zundamon'));
      await page.locator('#card-say').click();
      const asked = await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => new URL(e.name).pathname.startsWith('/audio/w/zundamon/')), null, { timeout: 5_000 })
        .then(() => true, () => false);
      check('V5 after choosing ずんだもん the door plays her recording', asked || requests.some((path) => path.startsWith('/audio/w/zundamon/')), requests.slice(-3).join(','));
    }
    check('V5 zero device speech', (await deviceSpoken(page)) === 0);
    await context.close();
  }
} catch (error) {
  // a setup or click exception is a named, failed row with its stack, not a silently short receipt
  results.push({ name: `terminal (${currentCase})`, pass: false, detail: error.stack || String(error) });
  console.log(`  FAIL terminal in ${currentCase} — ${error.message}`);
} finally {
  writeFileSync(resolve(EVIDENCE, 'voice-picker.json'), JSON.stringify({ origin, results, pageErrors, lastCase: currentCase }, null, 2) + '\n');
  await browser.close();
  await host.close();
}
if (pageErrors.length) results.push({ name: 'no uncaught page errors', pass: false, detail: JSON.stringify(pageErrors) });
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
