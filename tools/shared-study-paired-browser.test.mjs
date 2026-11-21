/* global process, URL, window, fetch, setTimeout */
/** The study pairing in a real browser, from the source tree (ENGINE-ONE.3).
 *
 * What only a browser can show: the credential's place in IndexedDB, the page-start flag, the Settings block as a
 * learner uses it, the engine's own study screen on a paired record, and real cross-origin requests to a server.
 * The server is the stand-in of tools/support/study-server-double.mjs on a loopback port. The page is a small
 * harness in place of corridor.js: it loads shared-study-boot.mjs exactly as index.html does, shows the Settings
 * block the boot module hands over, and opens a deck through the product's own gate (isSharedStudyMode) and the
 * product's own shared mount. The ordinary routes of the built app, and the Nihongo Study repository's own local
 * server, are the local verifier's part (scripts/verify-paired-study-browser.mjs).
 *
 * The first test needs no browser: the stand-in server and the second device over real HTTP. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNC_COMPATIBILITY } from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
import { startStudyServerDouble } from './support/study-server-double.mjs';
import {
  createEngineClient,
  frameState,
  gradeInFrame,
  loadStudyContent,
  pairInSettings,
  readablePlaces,
  studyBlock,
  studyFrame,
  unpairInSettings,
  waitForReview,
  wake,
} from './support/paired-study-proof.mjs';

const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
const acceptance = Boolean(process.env.CI || process.env.KAIRO_SITE_DIR);
const corridor = fileURLToPath(new URL('../prototypes/corridor/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const HARNESS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>paired study harness</title></head><body><main></main>
<script type="module" src="shared-study-boot.mjs"></script>
<script type="module">
  import { isSharedDeck, isSharedStudyMode } from './shared-study-content.mjs';
  const params = new URLSearchParams(location.search), main = document.querySelector('main');
  const english = params.get('ui') !== 'ja';
  const tx = (ja, en) => (english ? en : ja);
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
  if (params.get('view') === 'settings') main.append(globalThis.bunkiStudyPairing.settingsBlock({ tx, el }));
  const deck = params.get('deck');
  if (deck) {
    if (isSharedStudyMode() && isSharedDeck(deck)) void (await import('./decks/player/shared-mount.mjs')).render(main, { deckId: deck, english, onLeave() {} });
    else { const old = el('p', '', 'the old player'); old.id = 'old-player'; main.append(old); }
  }
  document.documentElement.dataset.ready = '1';
</script></body></html>`;

async function until(holds, { timeout = 60000, every = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (!holds()) {
    assert(Date.now() < deadline, 'the awaited change did not come');
    await new Promise((resolve) => setTimeout(resolve, every));
  }
}

test('the stand-in server over HTTP: preflights for a listed origin alone, a token that belongs to its origin, a second device that studies', async () => {
  // only the names matter: nothing listens at these addresses and nothing is sent to them
  const pageOrigin = 'http://127.0.0.1:18999';
  const otherListed = 'http://127.0.0.1:18997';
  const server = await startStudyServerDouble({ allowedOrigins: [pageOrigin, otherListed] });
  try {
    const preflight = (path, origin) =>
      fetch(`${server.origin}${path}`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });
    // each route allows exactly what a study device sends to it
    for (const [path, headers] of [
      ['/v1/pair', 'content-type, x-nsrs-reducer-sha256'],
      ['/v1/events', 'authorization, content-type, x-nsrs-reducer-sha256'],
      ['/v1/permits', 'authorization, content-type, x-nsrs-reducer-sha256'],
    ]) {
      const answer = await preflight(path, pageOrigin);
      assert.equal(answer.status, 204);
      assert.equal(answer.headers.get('access-control-allow-origin'), pageOrigin);
      assert.equal(answer.headers.get('access-control-allow-headers'), headers);
    }
    for (const [path, origin] of [
      ['/v1/events', 'http://127.0.0.1:18998'],
      ['/v1/pair/redeem', pageOrigin],
    ]) {
      const stranger = await preflight(path, origin);
      assert.equal(stranger.status, 403);
      assert.equal(stranger.headers.get('access-control-allow-origin'), null);
    }
    const content = loadStudyContent(corridor);
    const join = (origin) => {
      const minted = server.mint({ installation: `iphone-${'d'.repeat(31)}${origin ? 1 : 2}` });
      return createEngineClient({
        content,
        server: server.origin,
        learner: server.learner,
        environment: server.environment,
        installation: minted.installation,
        code: minted.code,
        pageOrigin: origin,
      });
    };
    // a device paired by a page at a listed origin
    const device = await join(pageOrigin);
    const graded = await device.gradeNew('n2', 3);
    assert.equal(server.rows.filter((row) => row.event.id === graded.eventId).length, 1);
    const token = server.tokenOf(device.scope.installation);
    const ask = (origin) =>
      fetch(`${server.origin}/v1/events?after=0&limit=1000`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-NSRS-Reducer-SHA256': SYNC_COMPATIBILITY.reducerSha256,
          ...(origin ? { Origin: origin } : {}),
        },
      });
    assert.equal((await ask(pageOrigin)).status, 200);
    // the token belongs to its origin: from another listed origin it is refused, and the page can read why
    const elsewhere = await ask(otherListed);
    assert.equal(elsewhere.status, 401);
    assert.equal(elsewhere.headers.get('access-control-allow-origin'), otherListed);
    assert.deepEqual(await elsewhere.json(), { error: 'origin-mismatch' });
    // a client that is no page sends no Origin and is answered as before
    assert.equal((await ask(null)).status, 200);
    // a second device that is no page sees the grade
    const phone = await join(null);
    await phone.sync();
    assert.ok(phone.reviews().some((review) => review.id === graded.eventId));
    assert.notEqual(phone.scope.installation, device.scope.installation);
    // a device the server has revoked is refused
    server.revoke(device.scope.installation);
    assert.equal((await ask(pageOrigin)).status, 401);
    assert.equal((await device.sync()).error, 'authentication-required');
  } finally {
    await server.close();
  }
});

function startSource() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (path === '/harness.html') {
      response.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      response.end(HARNESS);
      return;
    }
    const file = join(corridor, normalize(path));
    if (!file.startsWith(corridor) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.close(done);
            server.closeAllConnections();
          }),
      }),
    ),
  );
}

test(
  'a browser pairs in Settings, studies on the paired record, exchanges a grade both ways, restarts, loses its pairing to the server and to the learner',
  { skip: !acceptance && !process.env.BUNKI_TEST_CHROME, timeout: 420000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)('playwright-core');
    const executable =
      process.env.CHROMIUM_PATH || (!acceptance && process.env.BUNKI_TEST_CHROME) || '';
    const site = await startSource();
    const server = await startStudyServerDouble({ allowedOrigins: [site.origin] });
    const settings = `${site.origin}/harness.html?view=settings`;
    const deck = `${site.origin}/harness.html?deck=n2`;
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(executable && executable !== '1' ? { executablePath: executable } : {}),
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      // nothing but this machine: the source tree and the stand-in server
      await context.route('**/*', (route) =>
        [site.origin, server.origin].some((origin) =>
          route.request().url().startsWith(`${origin}/`),
        )
          ? route.continue()
          : route.abort(),
      );
      const requests = [];
      const printed = [];
      const errors = [];
      const watch = (target) => {
        target.on('request', (request) =>
          requests.push({
            url: request.url(),
            method: request.method(),
            headers: request.headers(),
          }),
        );
        target.on('console', (message) => printed.push(message.text()));
        target.on('pageerror', (error) => errors.push(error.message));
      };
      const page = await context.newPage();
      watch(page);

      // an unpaired browser: nothing bound, the old player, and not one request to the server
      await page.goto(deck, { waitUntil: 'load' });
      await page.locator('#old-player').waitFor();
      assert.equal(await page.evaluate(() => typeof globalThis.bunkiSharedStudyHost), 'undefined');
      assert.equal(await page.locator('[data-shared-study-frame]').count(), 0);
      assert.equal(server.log.length, 0);

      // Settings, unpaired: a wrong code is refused in plain words and nothing is kept
      await page.goto(settings, { waitUntil: 'load' });
      const first = await studyBlock(page);
      assert.equal(first.state, 'unpaired');
      assert.equal(first.formShown, true);
      assert.equal(first.unpairShown, false);
      const unused = server.mint();
      const wrong = await pairInSettings(page, {
        line: unused.line.replace(unused.code, 'ABCDEF012345'),
      });
      assert.equal(wrong.refused, 'code-invalid-or-expired');
      assert.match(wrong.note, /wrong, already used or expired/);
      // a code alone names no device: the block says what is missing and sends nothing
      const beforeAlone = server.log.length;
      const alone = await pairInSettings(page, { line: server.learner, code: unused.code });
      assert.equal(alone.refused, 'pairing-line-required');
      assert.equal(server.log.length, beforeAlone);
      let places = await readablePlaces(page);
      assert.equal(places.device, null);
      assert.deepEqual(
        places.localStorage.filter(([key]) => key.startsWith('bunki-shared-study:')),
        [],
      );

      // the server is the one the voice client is set up for: the voice client's own store says which
      const voice = await page.evaluate(async (address) => {
        const { createDeviceTokenStore } = await import('./modules/voice-client.mjs');
        const { readVoiceServerAddress } = await import('./shared-study-pairing.mjs');
        const before = await readVoiceServerAddress();
        await createDeviceTokenStore(globalThis).write({
          server: address,
          token: `nsrs_prod_AAAA.${'a'.repeat(64)}`,
          scope: {
            environment: 'prod',
            learner: 'test-voice',
            installation: `bunki-${'b'.repeat(32)}`,
          },
        });
        return { before, after: await readVoiceServerAddress() };
      }, server.origin);
      assert.deepEqual(voice, { before: null, after: server.origin });
      const asked = server.log.length;
      const elsewhere = await pairInSettings(page, {
        line: unused.line.replace(server.origin, 'http://127.0.0.1:9'),
      });
      assert.equal(elsewhere.refused, 'server-mismatch');
      assert.match(elsewhere.note, /not the server this device is set up for/);
      assert.equal(server.log.length, asked);

      // pair with a line that names no server (the address is the voice client's) and the code in its own box
      const minted = server.mint();
      const paired = await pairInSettings(page, {
        line: `learner: ${server.learner} · device: ${minted.installation}`,
        code: minted.code,
      });
      assert.equal(paired.paired, true, JSON.stringify(paired));
      assert.match(
        paired.note,
        new RegExp(`now studies on ${server.learner}’s Nihongo Study record`),
      );
      const after = await studyBlock(page);
      assert.equal(after.state, 'paired');
      assert.equal(after.bound, 'true');
      assert.match(after.status, new RegExp(`studies on ${server.learner}’s Nihongo Study record`));
      assert.equal(after.formShown, false);
      assert.equal(after.unpairShown, true);
      assert.equal(
        await page.evaluate(() => globalThis.bunkiSharedStudyHost?.kind),
        'bunki-paired-study/v1',
      );
      const token = server.tokenOf(minted.installation);
      assert.ok(token && token.length > 80);

      // the ordinary gate now opens the engine's own screen on the paired record
      await page.goto(deck, { waitUntil: 'load' });
      let frame = await studyFrame(page);
      let state = await frameState(frame);
      assert.equal(state.installation, minted.installation);
      assert.equal(state.learner, server.learner);
      assert.equal(state.environment, server.environment);
      assert.equal(await page.locator('#old-player').count(), 0);
      const shell = await page.locator('main').innerText();
      assert.equal(/Trial copy/.test(shell), false);
      assert.equal(/Sync is not set up|同期は未設定/.test(state.text), false);
      assert.equal(
        await frame.evaluate(() => window.frameElement.bunkiStudyPort.adapter.platform.isPaired()),
        true,
      );

      // a grade made here reaches the server, and a second device of the same learner
      const mine = await gradeInFrame(frame);
      await until(() => server.rows.some((row) => row.event.id === mine.eventId));
      assert.equal(server.rows.filter((row) => row.event.id === mine.eventId).length, 1);
      const phone = server.mint({ installation: `iphone-${'c'.repeat(32)}` });
      const other = await createEngineClient({
        content: loadStudyContent(corridor),
        server: server.origin,
        learner: server.learner,
        environment: server.environment,
        installation: phone.installation,
        code: phone.code,
      });
      await other.sync();
      const arrived = other.reviews().find((review) => review.id === mine.eventId);
      assert.equal(arrived?.taskKey, mine.taskKey);
      assert.equal(arrived?.rawRating, 3);
      // and a grade made on the second device reaches this one
      const theirs = await other.gradeNew('n2', 4);
      await waitForReview(page, frame, theirs.eventId);
      state = await frameState(frame);
      assert.ok(state.reviews.includes(theirs.eventId) && state.reviews.includes(mine.eventId));

      // the credential: in IndexedDB under a key the browser will not export, and nowhere a script or a log can read
      places = await readablePlaces(page);
      assert.deepEqual(places.device.sealed, {
        extractable: false,
        algorithm: 'AES-GCM',
        usages: ['decrypt', 'encrypt'],
        bytesAsText: places.device.sealed.bytesAsText,
      });
      for (const text of [
        places.device.plain,
        places.device.sealed.bytesAsText,
        places.cookie,
        JSON.stringify(places.localStorage),
        printed.join('\n'),
      ])
        assert.equal(text.includes(token), false);
      assert.deepEqual(
        places.localStorage.filter(([key]) => key.startsWith('bunki-shared-study:paired')),
        [['bunki-shared-study:paired:v1', '1']],
      );
      assert.ok(places.databases.includes(`bunki-shared-study-paired-${minted.installation}`));
      assert.equal(places.databases.includes('bunki-shared-study-preview-v1'), false);
      let carried = 0;
      for (const request of requests) {
        assert.equal(request.url.includes(token), false);
        if (request.headers.authorization) {
          assert.equal(request.headers.authorization, `Bearer ${token}`);
          assert.ok(request.url.startsWith(`${server.origin}/`), request.url);
          carried++;
        }
      }
      assert.ok(carried >= 3);

      // a restart keeps the installation and the journal
      await page.close();
      const again = await context.newPage();
      watch(again);
      await again.goto(deck, { waitUntil: 'load' });
      frame = await studyFrame(again);
      state = await frameState(frame);
      assert.equal(state.installation, minted.installation);
      assert.ok(state.reviews.includes(mine.eventId) && state.reviews.includes(theirs.eventId));

      // the server ends the pairing: sync stops, Settings says so, and the page stops asking
      server.revoke(minted.installation);
      await wake(again);
      await again.waitForFunction(() => globalThis.bunkiSharedStudyHost.status().ended === true);
      const quiet = server.log.length;
      for (let turn = 0; turn < 3; turn++) {
        await wake(again);
        await again.waitForTimeout(150);
      }
      assert.equal(server.log.length, quiet);
      await again.goto(settings, { waitUntil: 'load' });
      const ended = await studyBlock(again);
      assert.equal(ended.state, 'ended');
      assert.match(ended.status, /The server ended this device’s pairing/);
      assert.equal(ended.unpairShown, true);
      assert.equal(server.log.length, quiet);
      places = await readablePlaces(again);
      assert.equal(places.device.sealed, null);

      // the learner forgets the pairing: the flag and the credential go, the copy of the record stays, unused
      const forgotten = await unpairInSettings(again);
      assert.match(forgotten.what, /stays on the device, unused/);
      assert.match(forgotten.sure, /Really forget it/);
      assert.match(forgotten.note, /still here, unused/);
      const unpaired = await studyBlock(again);
      assert.equal(unpaired.state, 'unpaired');
      assert.equal(await again.evaluate(() => typeof globalThis.bunkiSharedStudyHost), 'undefined');
      places = await readablePlaces(again);
      assert.equal(places.device, null);
      assert.deepEqual(
        places.localStorage.filter(([key]) => key.startsWith('bunki-shared-study:paired')),
        [],
      );
      assert.ok(places.databases.includes(`bunki-shared-study-paired-${minted.installation}`));
      await again.goto(deck, { waitUntil: 'load' });
      await again.locator('#old-player').waitFor();
      assert.equal(await again.locator('[data-shared-study-frame]').count(), 0);
      assert.equal(server.log.length, quiet);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      await site.close();
    }
  },
);
