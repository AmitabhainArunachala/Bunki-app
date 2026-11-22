/* global process, document, URL, Buffer, localStorage, setTimeout, console */
/** The voice link in a real page (LEAN, 2026-11-22), Chromium and WebKit, silent, against the repository's stand-in
 * voice server on this machine (prototypes/corridor/tools/fake-voice-server.mjs); nothing leaves 127.0.0.1.
 *   node tools/voice-connect.browser.mjs                  both engines
 *   VOICE_LINK_SHOTS=<dir> node tools/voice-connect.browser.mjs    also pictures of the question and the Settings row
 * Per engine: the link asks one question and one click turns the voice on (the page opens again, Settings says
 * Connected, a tapped word is spoken through the stand-in); a second link on a voiced browser is told so and sends
 * nothing; Not now leaves nothing; the phone's field takes a pasted link; Disconnect, then a link again, works. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { silenceBrowserAudio } from '../prototypes/corridor/tools/browser-audio-silence.mjs';
import { startFakeVoiceServer } from '../prototypes/corridor/tools/fake-voice-server.mjs';

const CORRIDOR = fileURLToPath(new URL('../prototypes/corridor/', import.meta.url)).replace(
  /\/$/,
  '',
);
const playwright = createRequire(join(CORRIDOR, '../../package.json'))('playwright-core');
const SHOTS = process.env.VOICE_LINK_SHOTS || '';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};
const WORD = '?ui=bi&read=wikinews:1403&word=開催';
const MARK = '#sheet .voice-say[data-voice-say="entry-headword"]';

const server = createServer((request, response) => {
  const path = decodeURIComponent((request.url || '/').split('?')[0]);
  const file = resolve(CORRIDOR, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
  if (!file.startsWith(CORRIDOR) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;
const fake = await startFakeVoiceServer({ origins: [base.slice(0, -1)], missesPerMinute: 100000 });
const linkFor = () =>
  Buffer.from(
    JSON.stringify({
      v: 1,
      code: fake.issue({ learner: 'test-learner' }),
      learner: 'test-learner',
      server: fake.origin,
    }),
  ).toString('base64url');
const redeems = () =>
  fake.log.filter((row) => row.path === '/v1/pair/redeem-speak' && row.method === 'POST').length;

async function newContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1728, height: 1000 },
    locale: 'en-US',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
  });
  await silenceBrowserAudio(context);
  await context.addInitScript(() => {
    if (globalThis.speechSynthesis)
      Object.getPrototypeOf(globalThis.speechSynthesis).speak = function () {};
    globalThis.__plays = 0;
    document.addEventListener(
      'playing',
      (event) => {
        if (event.target?.matches?.('audio[data-speak-audio]')) globalThis.__plays += 1;
      },
      true,
    );
    try {
      localStorage.setItem('kairo-voice-by-itself-v1', 'off');
      localStorage.setItem('bunki-prototype:intro-dismissed:v1', '1');
    } catch {
      /* blocked */
    }
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message || error)));
  return { context, page };
}
const ready = (page) =>
  page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 120000 });
async function settings(page) {
  await page.goto(`${base}?ui=bi&room=me`, { waitUntil: 'load' });
  await ready(page);
  await page.locator('#me-settings').first().click();
  await page.locator('#settings-voice-server').waitFor();
  await page.waitForFunction(
    () => document.getElementById('settings-voice-server')?.dataset.paired !== undefined,
  );
}
const row = (page) =>
  page.evaluate(() => ({
    paired: document.getElementById('settings-voice-server')?.dataset.paired,
    state: document.getElementById('voice-state')?.textContent,
  }));
async function question(page, payload) {
  await page.goto(`${base}#voice-connect=${payload}`, { waitUntil: 'load' });
  await page.locator('#voice-link').waitFor();
  assert.equal(page.url().includes('voice-connect'), false, 'the link left the address');
  return page.locator('#voice-link').getAttribute('data-state');
}
async function turnOn(page) {
  const reloaded = page.waitForEvent('load', { timeout: 30000 });
  await page.locator('#voice-link-yes').click();
  await reloaded;
  await ready(page);
}
/** A picture once the page has stopped moving (a sheet that slides in is not caught half way). */
const shoot = async (page, name) => {
  if (!SHOTS) return;
  await page
    .waitForFunction(
      () => document.getAnimations().every((animation) => animation.playState !== 'running'),
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, name) });
};

async function walk(engine) {
  const browser = await playwright[engine].launch({
    headless: true,
    ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}),
  });
  const out = { engine };
  try {
    // the link, one click; Settings says Connected; a tapped word is spoken through the stand-in
    let { context, page } = await newContext(browser);
    const before = redeems();
    assert.equal(await question(page, linkFor()), 'offer');
    assert.equal(
      await page.locator('#voice-link-title').textContent(),
      'Turn on Bunki’s voice in this browser?',
    );
    assert.equal(redeems(), before, 'nothing is sent before Turn on');
    if (engine === 'chromium') {
      await shoot(page, 'question-1728x1000.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await shoot(page, 'question-390x844.png');
      await page.setViewportSize({ width: 1728, height: 1000 });
    }
    await turnOn(page);
    assert.equal(redeems(), before + 1);
    await settings(page);
    out.link = await row(page);
    assert.deepEqual(out.link, { paired: 'true', state: 'Connected' });
    if (engine === 'chromium') await shoot(page, 'settings-connected-1728x1000.png');
    await page.goto(base + WORD, { waitUntil: 'load' });
    await ready(page);
    const spoken = () =>
      fake.log.filter(
        (entry) => entry.path === '/v1/audio/speak' && entry.status === 200 && entry.authorized,
      ).length;
    const said = spoken();
    const spoke = () => spoken() > said;
    await page.locator(MARK).first().click();
    for (const until = Date.now() + 60000; !spoke() && Date.now() < until;)
      await new Promise((done) => setTimeout(done, 100));
    out.spoken = spoke();
    assert.equal(
      out.spoken,
      true,
      'the tapped word was asked of the stand-in with the token and answered 200',
    );
    // the clip's own 'playing' event, where the engine's muted element still fires it (Chromium does)
    out.plays = await page.evaluate(() => globalThis.__plays);
    // a second link on a voiced browser: told so, nothing sent
    const held = redeems();
    assert.equal(await question(page, linkFor()), 'held');
    assert.equal(await page.locator('#voice-link-no').textContent(), 'Close');
    assert.equal(redeems(), held);
    out.held = true;
    await context.close();
    // Not now leaves nothing; then the phone's field takes a pasted link
    ({ context, page } = await newContext(browser));
    const quiet = redeems();
    assert.equal(await question(page, linkFor()), 'offer');
    await page.locator('#voice-link-no').click();
    await page.locator('#voice-link').waitFor({ state: 'detached' });
    await settings(page);
    out.notNow = await row(page);
    assert.deepEqual(out.notNow, { paired: 'false', state: 'Not connected' });
    assert.equal(redeems(), quiet);
    await page.locator('#voice-connect').click();
    assert.equal(
      await page.locator('label[for="voice-pair-learner"]').textContent(),
      'Paste your voice link',
    );
    assert.deepEqual(
      [
        await page.locator('#voice-pair-code').count(),
        await page.locator('#voice-pair-how').count(),
      ],
      [0, 0],
    );
    if (engine === 'chromium') {
      await shoot(page, 'settings-field-1728x1000.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#voice-pair-learner').scrollIntoViewIfNeeded();
      await shoot(page, 'settings-field-390x844.png');
      await page.setViewportSize({ width: 1728, height: 1000 });
    }
    await page
      .locator('#voice-pair-learner')
      .fill(`https://test.example.pages.dev/#voice-connect=${linkFor()}`);
    await page.locator('#voice-pair-submit').click();
    await page.waitForFunction(
      () => document.getElementById('settings-voice-server')?.dataset.paired === 'true',
    );
    out.field = await row(page);
    assert.deepEqual(out.field, { paired: 'true', state: 'Connected' });
    // Disconnect, then a link again
    // the details stand open after a pairing made from the field; Details opens them otherwise
    if (!(await page.locator('#voice-unpair').isVisible()))
      await page.locator('#voice-details').click();
    await page.locator('#voice-unpair').click();
    await page.waitForFunction(
      () => document.getElementById('settings-voice-server')?.dataset.paired === 'false',
    );
    out.disconnected = await row(page);
    assert.deepEqual(out.disconnected, { paired: 'false', state: 'Not connected' });
    assert.equal(await question(page, linkFor()), 'offer');
    await turnOn(page);
    await settings(page);
    out.again = await row(page);
    assert.deepEqual(out.again, { paired: 'true', state: 'Connected' });
    out.pageErrors = page.errors.length;
    await context.close();
    out.ok = true;
  } catch (error) {
    out.ok = false;
    out.error = String(error?.message || error).slice(0, 600);
  } finally {
    await browser.close();
  }
  return out;
}

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
try {
  for (const engine of ['chromium', 'webkit']) results.push(await walk(engine));
} finally {
  await fake.close();
  await new Promise((done) => server.close(done));
}
console.log(JSON.stringify(results, null, 1));
process.exit(results.every((result) => result.ok) ? 0 : 1);
