#!/usr/bin/env node
/* global console, document, DOMException, Event, HTMLMediaElement, localStorage, navigator, process, setTimeout, window */
/**
 * Review of voice/speech-lane-store-tutor-20261111 at c6d588d44 (independent reviewer, 2026-11-11): a tutor's reply that
 * arrives while the page is hidden (he asked, then went to another tab or app while the tutor was thinking) must not be
 * said there, where he cannot hear it and it is paid for. The card's answer already holds this rule (speakCardReading
 * returns when document.hidden); the reply path does not.
 *
 * A browser check on a built site, silent by construction: Playwright's Chromium only, --mute-audio, media forced muted,
 * the device voice swallowed, the microphone refused. The voice server is the repository's stand-in
 * (prototypes/corridor/tools/fake-voice-server.mjs); the tutor's endpoint is answered by a Playwright route, so nothing
 * leaves this machine. Ports: the site on 127.0.0.1:19491, the stand-in voice server on 19492.
 *
 *   KAIRO_SITE_DIR=<a build of the head> node tools/review-store-tutor-hidden.browser.mjs
 * Exit 0 when the reply is not said while hidden (and the control, a visible page, does say it); 1 otherwise.
 */
import { createRequire } from 'node:module';

import { chromium } from 'playwright-core';

import { startFakeVoiceServer } from '../prototypes/corridor/tools/fake-voice-server.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../prototypes/bunki-desktop/lib/static-host.cjs');

const SITE = process.env.KAIRO_SITE_DIR;
if (!SITE) throw new Error('KAIRO_SITE_DIR must name a built site');
const ORIGIN = 'http://127.0.0.1:19491';
const AI = 'https://tutor.invalid';
const REPLY = '雨が降っているのに、出かけました。頑張ったのに、試験に落ちた。';

const host = await startStaticHost({ site: SITE, port: 19491 });
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: 19492 });
const browser = await chromium.launch({
  headless: true,
  args: [
    '--mute-audio',
    '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost',
  ],
});

function before({ ai }) {
  // silence: media muted, the device voice swallowed, no microphone
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
  // a clip of the voice that plays (not the short silence that primes the element)
  window.__played = 0;
  document.addEventListener(
    'playing',
    (event) => {
      if (event.target?.matches?.('audio[data-speak-audio]') && event.target.duration > 0.2)
        window.__played += 1;
    },
    true,
  );
  // the page hidden, as when he goes to another tab or app: what the browser reports, and the event it sends
  window.__hide = () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  if (localStorage.getItem('kairo-ai-provider-v1') === null)
    localStorage.setItem(
      'kairo-ai-provider-v1',
      JSON.stringify({
        v: 1,
        baseUrl: ai,
        model: 'stand-in-model',
        credential: { origin: ai, key: 'stand-in-not-a-key' },
      }),
    );
}

async function run({ hide }) {
  const context = await browser.newContext({
    viewport: { width: 1728, height: 1117 },
    serviceWorkers: 'block',
  });
  await context.addInitScript(before, { ai: AI });
  await context.route(`${AI}/v1/messages`, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const chat = /tutor inside a Japanese-learning app/u.test(String(body.system || ''));
    if (chat) await new Promise((done) => setTimeout(done, 1500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
      },
      body: JSON.stringify({
        id: 'msg_review',
        type: 'message',
        role: 'assistant',
        model: 'stand-in-model',
        content: [{ type: 'text', text: chat ? REPLY : '[]' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const sky = async () => {
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
    await page.locator('#ginga-symbol').waitFor();
    const ok = page.locator('button', { hasText: /^OK$/ }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
  };
  // pair with the stand-in voice server, through Settings
  await sky();
  await page.locator('#home-review').click();
  await page.locator('#tab-me').click();
  await page.waitForTimeout(1200);
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
  // the written tutor: ask, then (in the case under test) leave the page while she thinks
  await sky();
  await page.locator('#ginga-symbol').click();
  await page.locator('.bubble-sensei').first().click();
  await page.locator('.chat-log').waitFor();
  await page.locator('#chat-input').fill('のにはどう使いますか');
  await page.waitForTimeout(250);
  const from = fake.speaks().length;
  await page.locator('#chat-send').click();
  if (hide) await page.evaluate(() => window.__hide());
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.chat-log > p.chat-turn.tutor:not(.thinking)')].some((p) =>
        p.textContent.includes('頑張った'),
      ),
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(5000);
  const out = {
    hidden: await page.evaluate(() => document.hidden),
    requests: fake.speaks().length - from,
    played: await page.evaluate(() => window.__played),
  };
  await context.close();
  return out;
}

let code = 1;
try {
  const control = await run({ hide: false });
  const hidden = await run({ hide: true });
  console.log(JSON.stringify({ control, hidden }));
  if (!(control.requests > 0 && control.played > 0))
    console.log('NOT RUN: the control (a visible page) did not say the reply');
  else if (hidden.requests || hidden.played)
    console.log(
      `FAIL: the reply was said while the page was hidden: ${hidden.requests} request(s) to the voice server, ${hidden.played} clip(s) played`,
    );
  else {
    console.log('PASS: a reply that arrives while the page is hidden is not said');
    code = 0;
  }
} finally {
  await browser.close();
  await fake.close();
  await host.close().catch(() => {});
}
process.exit(code);
