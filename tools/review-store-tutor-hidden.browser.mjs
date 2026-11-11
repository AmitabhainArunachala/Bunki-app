#!/usr/bin/env node
/* global Buffer, console, document, DOMException, Event, HTMLMediaElement, localStorage, navigator, process, setTimeout, window */
/**
 * Review of voice/speech-lane-store-tutor-20261111 (independent reviewer, 2026-11-11), round 1: nothing speaks by itself
 * on a page he is not looking at, and nothing is asked for it (the coordinator's ruling 1). The one automatic voice left
 * in the package is the Speak room's: her line is said through the seam before the room listens. Here her reply arrives
 * while the page is hidden (he typed his line, then went to another tab while she thought).
 *
 *   visible  her opening, after his first tap: asked of the voice server and played (the control: the rig can hear her)
 *   hidden   her reply arriving on the hidden page: 0 requests for it, 0 clips played
 *   shown    the page shown again, the room still the one showing: her reply is said, once (one request per sentence)
 *
 * A browser check on a built site, silent by construction: Playwright's Chromium only, --mute-audio, media forced muted,
 * the device voice swallowed, the microphone refused (so the room offers its typed way). Hidden is emulated: document.
 * hidden and visibilityState report hidden and visibilitychange is sent (headless Chromium cannot hide a page). The voice
 * server is the repository's stand-in (prototypes/corridor/tools/fake-voice-server.mjs); the room's partner is a small
 * stand-in on this machine that the room honours for a page on 127.0.0.1 (window.__KAIRO_SPEAK_ENDPOINT__). Nothing
 * leaves this machine. Ports (each may be given): the site 19491 (REVIEW_SITE_PORT), the voice stand-in 19492
 * (REVIEW_VOICE_PORT), the partner stand-in 19493 (REVIEW_AI_PORT).
 *
 *   KAIRO_SITE_DIR=<a build of the head> node tools/review-store-tutor-hidden.browser.mjs
 * Exit 0 when all three hold; 1 when one fails; 2 when the control did not hear her (not run).
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

import { chromium } from 'playwright-core';

import { startFakeVoiceServer } from '../prototypes/corridor/tools/fake-voice-server.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../prototypes/bunki-desktop/lib/static-host.cjs');

const SITE = process.env.KAIRO_SITE_DIR;
if (!SITE) throw new Error('KAIRO_SITE_DIR must name a built site');
const SITE_PORT = Number(process.env.REVIEW_SITE_PORT || 19491);
const VOICE_PORT = Number(process.env.REVIEW_VOICE_PORT || 19492);
const AI_PORT = Number(process.env.REVIEW_AI_PORT || 19493);
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`;
const PARTNER = `http://127.0.0.1:${AI_PORT}`;
const OPENING = 'はじめまして。今日は何をしましたか。';
const OPENING_SENTENCES = ['はじめまして。', '今日は何をしましたか。'];
const REPLY = 'そうですか。それはよかったですね。';
const REPLY_SENTENCES = ['そうですか。', 'それはよかったですね。'];

// the room's partner: every generateContent answered with one turn; the reply to his typed line comes after 1.5 s
let turns = 0;
const partner = createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-goog-api-key',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const typed = /typed/iu.test(Buffer.concat(chunks).toString('utf8'));
    turns += 1;
    if (typed) await new Promise((done) => setTimeout(done, 1500));
    const turn = {
      heard: typed ? '楽しかったです。' : '',
      reply: { text: typed ? REPLY : OPENING, tokens: [], speaker: 'main' },
    };
    const body = JSON.stringify({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: JSON.stringify(turn) }] },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 80, totalTokenCount: 980 },
      modelVersion: 'stand-in',
    });
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(body);
  });
});
await new Promise((done) => partner.listen(AI_PORT, '127.0.0.1', done));
const host = await startStaticHost({ site: SITE, port: SITE_PORT });
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: VOICE_PORT });
const browser = await chromium.launch({
  headless: true,
  args: [
    '--mute-audio',
    '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost',
  ],
});

function before({ partner, month }) {
  const media = HTMLMediaElement.prototype;
  const play = media.play;
  media.play = function () {
    this.muted = true;
    this.volume = 0;
    return play.call(this);
  };
  if (window.speechSynthesis) Object.getPrototypeOf(window.speechSynthesis).speak = () => {};
  if (navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('refused', 'NotAllowedError'));
  window.__played = 0;
  document.addEventListener(
    'playing',
    (event) => {
      if (event.target?.matches?.('audio[data-speak-audio]') && event.target.duration > 0.2)
        window.__played += 1;
    },
    true,
  );
  const visibility = (hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  window.__hide = () => visibility(true);
  window.__show = () => visibility(false);
  window.__KAIRO_SPEAK_ENDPOINT__ = partner;
  const put = (key, value) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  };
  put(
    'kairo-speak-device-v1',
    JSON.stringify({ v: 1, credential: { origin: partner, key: 'stand-in-not-a-key' } }),
  );
  put('kairo-speak-spend-v1', JSON.stringify({ v: 1, month, usd: 0, cap: 5 }));
}

const now = new Date();
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const asked = (from, texts) =>
  fake
    .speaks()
    .slice(from)
    .filter((row) => texts.includes(row.text)).length;

let code = 1;
try {
  const context = await browser.newContext({
    viewport: { width: 1728, height: 1117 },
    serviceWorkers: 'block',
  });
  await context.addInitScript(before, { partner: PARTNER, month: MONTH });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const sky = async () => {
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
    await page.locator('#ginga-symbol').waitFor();
    const ok = page.locator('button', { hasText: /^OK$/ }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
  };
  const tab = async (name) => {
    await sky();
    await page.locator('#home-review').click();
    await page.locator(`#tab-${name}`).waitFor();
    await page.locator(`#tab-${name}`).click();
    await page.waitForTimeout(1200);
  };
  // paired with the stand-in voice server, through Settings
  await tab('me');
  await page.locator('#me-settings').first().click();
  await page.locator('#settings-voice-server').waitFor();
  await page
    .locator('#voice-pair-learner')
    .fill(
      `Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`,
    );
  await page.locator('#voice-pair-code').fill('');
  await page.locator('#voice-pair-submit').click();
  await page.waitForFunction(
    () => document.getElementById('settings-voice-server')?.dataset.paired === 'true',
  );
  // the Speak room; her opening arrives; his first tap says it (visible: the control)
  await tab('learn');
  await page
    .locator('.study-door', { hasText: /Speak|話す/ })
    .first()
    .click();
  await page.locator('.speak-script').waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll('.speak-line[data-who="kore"]').length > 0,
    null,
    {
      timeout: 15000,
    },
  );
  await page.waitForTimeout(600);
  const f0 = fake.speaks().length;
  await page.locator('#speak-enso').click();
  await page.waitForFunction(() => window.__played > 0, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const visible = {
    requests: asked(f0, OPENING_SENTENCES.concat(OPENING)),
    played: await page.evaluate(() => window.__played),
  };
  // his typed line (the microphone is refused), then the page goes hidden while she thinks
  const input = page.locator('.speak-type-input');
  await input.waitFor({ timeout: 10000 });
  await input.fill('たのしかったです');
  const f1 = fake.speaks().length;
  const p1 = await page.evaluate(() => window.__played);
  await input.press('Enter');
  await page.evaluate(() => window.__hide());
  await page.waitForFunction(
    () => document.querySelectorAll('.speak-line[data-who="kore"]').length >= 2,
    null,
    {
      timeout: 15000,
    },
  );
  await page.waitForTimeout(4000);
  const hidden = {
    requests: asked(f1, REPLY_SENTENCES.concat(REPLY)),
    played: (await page.evaluate(() => window.__played)) - p1,
  };
  // shown again: the room is still the one showing
  await page.evaluate(() => window.__show());
  await page
    .waitForFunction((n) => window.__played >= n, p1 + REPLY_SENTENCES.length, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(2500);
  const shown = {
    requests: asked(f1, REPLY_SENTENCES.concat(REPLY)),
    played: (await page.evaluate(() => window.__played)) - p1,
  };
  await context.close();
  console.log(JSON.stringify({ visible, hidden, shown, partnerTurns: turns }));
  if (!(visible.requests > 0 && visible.played > 0)) {
    console.log('NOT RUN: the control (her opening on a visible page) was not heard');
    code = 2;
  } else if (hidden.requests || hidden.played)
    console.log(
      `FAIL: her reply was said on the hidden page: ${hidden.requests} request(s), ${hidden.played} clip(s) played`,
    );
  else if (shown.requests !== REPLY_SENTENCES.length || shown.played !== REPLY_SENTENCES.length)
    console.log(
      `FAIL: shown again, her reply was not said once: ${shown.requests} request(s), ${shown.played} clip(s)`,
    );
  else {
    console.log('PASS: nothing asked or said while hidden; said once when shown again');
    code = 0;
  }
} finally {
  await browser.close();
  await fake.close();
  await host.close().catch(() => {});
  await new Promise((done) => partner.close(done));
}
process.exit(code);
