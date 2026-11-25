/* global process, URL, window, fetch, setTimeout, document, location */
/** The study pairing in a real browser, from the source tree (ENGINE-ONE.3).
 *
 * What only a browser can show: the credential's place in IndexedDB, the page-start flag, the Settings block as a
 * learner uses it, the engine's own study screen on a paired record, and real cross-origin requests to a server.
 * The server is the stand-in of tools/support/study-server-double.mjs on a loopback port. The page is a small
 * harness in place of corridor.js: it loads shared-study-boot.mjs exactly as index.html does, shows the Settings
 * block the boot module hands over, and opens a deck through the product's own gate (isSharedStudyMode) and the
 * product's own shared mount. The ordinary routes of the built app, and the Nihongo Study repository's own local
 * server, are the local verifiers' part: scripts/verify-paired-study-browser.mjs on a built site, and
 * scripts/verify-paired-study-real-server.mjs, which drives this same harness page against that real server.
 *
 * The first test needs no browser: the stand-in server and the second device over real HTTP. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SYNC_COMPATIBILITY } from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
import { startStudyServerDouble } from './support/study-server-double.mjs';
import {
  createEngineClient,
  frameState,
  gradeInFrame,
  connectByLink,
  connectPayload,
  loadStudyContent,
  readablePlaces,
  startHarnessSite,
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
/** The two marks localStorage holds of a pairing, as [key, value], in order (the study screen keeps its own
 * appearance settings under the same prefix; they are not marks). */
const marks = (places) =>
  places.localStorage
    .filter(([key]) =>
      ['bunki-shared-study:paired:v1', 'bunki-shared-study:ended:v1'].includes(key),
    )
    .sort();

async function until(holds, { timeout = 60000, every = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (!holds()) {
    assert(Date.now() < deadline, 'the awaited change did not come');
    await new Promise((resolve) => setTimeout(resolve, every));
  }
}

test(
  'the stand-in server over HTTP: preflights for a listed origin alone, a token that belongs to its origin, a second device that studies',
  { timeout: 30000 },
  async () => {
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
      // and teaches itself a card of its own after the first device's grade is in the ledger: its permits are the
      // server's next grant, numbered along the server's own stream, and the grade reaches the first device
      const answered = await phone.gradeNew('n2', 4);
      assert.notEqual(answered.taskKey, graded.taskKey);
      await device.sync();
      assert.ok(device.reviews().some((review) => review.id === answered.eventId));
      // a device the server has revoked is refused
      server.revoke(device.scope.installation);
      assert.equal((await ask(pageOrigin)).status, 401);
      assert.equal((await device.sync()).error, 'authentication-required');
    } finally {
      await server.close();
    }
  },
);

/** Where the page's files come from: the source tree; for the negative controls, a folder with a planted fault
 * first (tools/shared-study-paired-host-controls.test.mjs), and the source tree for everything it does not hold. */
const roots = [
  process.env.BUNKI_PAIRED_HOST_ROOT
    ? `${process.env.BUNKI_PAIRED_HOST_ROOT.replace(/\/+$/, '')}/`
    : null,
  corridor,
].filter(Boolean);

const startSource = () => startHarnessSite(roots);

test(
  'a browser connects from a link with one click, studies on the paired record, exchanges a grade both ways, restarts, loses its pairing to the server and to the learner',
  { skip: !acceptance && !process.env.BUNKI_TEST_CHROME, timeout: 420000 },
  async () => {
    const { chromium, webkit } = createRequire(import.meta.url)('playwright-core');
    const executable =
      process.env.CHROMIUM_PATH || (!acceptance && process.env.BUNKI_TEST_CHROME) || '';
    const site = await startSource();
    const server = await startStudyServerDouble({ allowedOrigins: [site.origin] });
    const settings = `${site.origin}/harness.html?view=settings`;
    // pictures of the panel and the question, asked for with BUNKI_CONNECT_SHOTS=<folder> (the app's own styles on)
    const shoot = async (target, name) => {
      const folder = process.env.BUNKI_CONNECT_SHOTS;
      if (!folder) return;
      mkdirSync(folder, { recursive: true });
      for (const [width, height] of [
        [1728, 1000],
        [390, 844],
      ]) {
        await target.setViewportSize({ width, height });
        await target.evaluate(
          (sheets) =>
            Promise.all(
              sheets
                .filter((href) => !document.querySelector(`link[href="${href}"]`))
                .map(
                  (href) =>
                    new Promise((resolve) => {
                      const link = Object.assign(document.createElement('link'), {
                        rel: 'stylesheet',
                        href,
                      });
                      link.onload = link.onerror = resolve;
                      document.head.append(link);
                    }),
                ),
            ),
          ['fonts.css', 'corridor.css', 'tighten.css'],
        );
        await target.screenshot({ path: `${folder}/${name}-${width}.png` });
      }
      await target.setViewportSize({ width: 1280, height: 900 });
    };
    const deck = `${site.origin}/harness.html?deck=n2`;
    let browser;
    try {
      // Chromium unless BUNKI_PAIRED_BROWSER_ENGINE=webkit asks for the other engine (a local run: the suite's
      // runner installs Chromium only)
      const webkitAsked = process.env.BUNKI_PAIRED_BROWSER_ENGINE === 'webkit';
      browser = await (webkitAsked ? webkit : chromium).launch({
        headless: true,
        ...(!webkitAsked && executable && executable !== '1' ? { executablePath: executable } : {}),
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
            body: request.postData() || '',
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

      // Settings, unpaired: Nihongo Study, one line, and no form
      await page.goto(settings, { waitUntil: 'load' });
      const first = await studyBlock(page);
      assert.equal(first.state, 'unpaired');
      assert.equal(first.status, 'Not connected. Study here stays on this device.');
      assert.equal(first.fields, 0);
      assert.equal(first.unpairShown, false);
      await shoot(page, 'settings-not-connected');
      const linkOf = (minted, fields = {}) =>
        connectPayload({
          code: minted.code,
          learner: server.learner,
          installation: minted.installation,
          server: server.origin,
          environment: server.environment,
          ...fields,
        });
      // a link the learner does not want: it leaves the address at once, and Not now sends and keeps nothing
      const unused = server.mint();
      const declined = await connectByLink(page, settings, linkOf(unused), {
        answer: 'not-now',
        beforeAnswer: () => shoot(page, 'connect-question'),
      });
      assert.equal(declined.first.state, 'offer');
      assert.equal(declined.first.title, 'Connect this browser to your Nihongo Study record?');
      assert.equal(declined.first.server, `Server: ${new URL(server.origin).host}`);
      assert.equal(declined.first.connectShown, true);
      assert.equal(declined.first.address, settings);
      assert.equal(declined.state, 'gone');
      assert.equal(server.log.length, 0);
      // a wrong code is refused in plain words, after the one click, and nothing is kept
      const wrong = await connectByLink(
        page,
        settings,
        linkOf({ ...unused, code: 'A0B0A0B0A0B0' }),
      );
      assert.equal(wrong.refused, 'code-invalid-or-expired');
      assert.match(wrong.note, /wrong, already used or expired/);
      assert.equal(wrong.address, settings);
      // a link that is not whole is refused before anything is sent
      const beforeCut = server.log.length;
      const cut = await connectByLink(page, settings, linkOf(unused).slice(0, 30));
      assert.equal(cut.refused, 'invalid-link');
      assert.equal(cut.connectShown, false);
      assert.equal(server.log.length, beforeCut);
      let places = await readablePlaces(page);
      assert.equal(places.device, null);
      assert.deepEqual(
        places.localStorage.filter(([key]) => key.startsWith('bunki-shared-study:')),
        [],
      );

      // the server is the one the voice client is set up for: the voice client's own store says which
      // Handed to the page as text, not as a function: the test runner rewrites `import(...)` inside this file's
      // own functions into a helper of its own, which no page has. Text reaches the page as written.
      const voice = await page.evaluate(`(async (address) => {
        const { createDeviceTokenStore } = await import('./modules/voice-client.mjs');
        const { readVoiceServerAddress } = await import('./shared-study-pairing.mjs');
        const before = await readVoiceServerAddress();
        await createDeviceTokenStore(globalThis).write({
          server: address,
          token: 'nsrs_prod_AAAA.' + 'a'.repeat(64),
          scope: { environment: 'prod', learner: 'test-voice', installation: 'bunki-' + 'b'.repeat(32) },
        });
        return { before, after: await readVoiceServerAddress() };
      })(${JSON.stringify(server.origin)})`);
      assert.deepEqual(voice, { before: null, after: server.origin });
      const asked = server.log.length;
      const elsewhere = await connectByLink(
        page,
        settings,
        linkOf(unused, { server: 'http://127.0.0.1:9' }),
      );
      assert.equal(elsewhere.refused, 'server-mismatch');
      assert.equal(elsewhere.connectShown, false);
      assert.match(elsewhere.note, /not the server this device is set up for/);
      assert.equal(server.log.length, asked);

      // one click on Connect: the page says so and opens again, paired
      const minted = server.mint();
      const paired = await connectByLink(page, settings, linkOf(minted));
      assert.equal(paired.state, 'connected', JSON.stringify(paired));
      assert.equal(paired.title, 'Connected');
      assert.match(paired.note, /now studies on your Nihongo Study record/);
      const after = await studyBlock(page);
      assert.equal(after.state, 'paired');
      assert.equal(after.bound, 'true');
      assert.equal(after.status, 'Connected. This device studies on your Nihongo Study record.');
      assert.equal(after.fields, 0);
      assert.equal(after.unpairShown, true);
      assert.equal(await page.evaluate(() => location.hash), '');
      // a link opened in an already-connected browser cannot point it elsewhere: Close only, nothing sent
      const spent = server.log.length;
      const repoint = await connectByLink(page, settings, linkOf(server.mint()), {
        answer: null,
        beforeAnswer: () => shoot(page, 'connect-already-connected'),
      });
      assert.equal(repoint.state, 'held');
      assert.equal(repoint.connectShown, false);
      assert.equal(repoint.other, 'Close');
      assert.equal(server.log.length, spent);
      assert.equal(
        await page.evaluate(() => globalThis.bunkiSharedStudyHost?.kind),
        'bunki-paired-study/v1',
      );
      const token = server.tokenOf(minted.installation);
      assert.ok(token && token.length > 80);
      // the code went to the named server in the one request that spends it; never into the page's own storage
      const spending = requests.filter((request) =>
        `${request.url} ${request.body}`.includes(minted.code),
      );
      assert.deepEqual(
        spending.map((request) => `${request.method} ${request.url}`),
        [`POST ${server.origin}/v1/pair`],
      );

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
      ]) {
        assert.equal(text.includes(token), false);
        assert.equal(text.includes(minted.code), false);
        assert.equal(text.includes(linkOf(minted)), false);
      }
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
      requests.length = 0;

      // TWO PAGES OF ONE PROFILE. A second page studies on the same pairing; the first forgets the pairing.
      const second = await context.newPage();
      watch(second);
      const secondAsked = [];
      second.on('request', (request) => {
        if (request.headers().authorization) secondAsked.push(request.url());
      });
      await second.goto(deck, { waitUntil: 'load' });
      const secondFrame = await studyFrame(second);
      assert.equal((await frameState(secondFrame)).installation, minted.installation);
      await page.goto(settings, { waitUntil: 'load' });
      await studyBlock(page);
      await shoot(page, 'settings-connected');
      const forgotten = await unpairInSettings(page);
      assert.match(forgotten.what, /stays on the device, unused/);
      assert.match(forgotten.sure, /Really disconnect/);
      assert.match(forgotten.note, /still here, unused/);
      assert.equal((await studyBlock(page)).state, 'unpaired');
      // the second page is told at once, with nothing asked of it: its study screen closes and says why
      const closedSurface = second.locator('main section[data-shared-study="ended"]');
      await closedSurface.waitFor({ timeout: 15000 });
      assert.equal(
        await closedSurface.getAttribute('data-shared-study-reason'),
        'study-pairing-changed',
      );
      assert.match(
        await closedSurface.innerText(),
        /pairing has changed\. Study here has stopped\./,
      );
      assert.equal(await second.locator('[data-shared-study-frame]').count(), 0);
      assert.equal(
        await second.evaluate(() => globalThis.bunkiSharedStudyHost?.closed()?.code ?? null),
        'study-pairing-changed',
      );
      const secondQuiet = secondAsked.length;

      // the first page pairs a NEW installation; the second page, still open, cannot touch it
      const renewed = server.mint();
      const pairedAgain = await connectByLink(page, settings, linkOf(renewed));
      assert.equal(pairedAgain.state, 'connected', JSON.stringify(pairedAgain));
      assert.equal((await studyBlock(page)).state, 'paired');
      const renewedToken = server.tokenOf(renewed.installation);
      for (let turn = 0; turn < 3; turn++) {
        await wake(second);
        await second.waitForTimeout(150);
      }
      assert.equal(secondAsked.length, secondQuiet);
      // a study surface opened again on the stopped page says the same and opens nothing
      const reopenedThere = await second.evaluate(`(async () => {
        const main = document.querySelector('main');
        main.replaceChildren();
        await (await import('./decks/player/shared-mount.mjs')).render(main, { deckId: 'n2', english: true });
        const root = main.querySelector('section');
        return { state: root?.dataset.sharedStudy ?? null, reason: root?.dataset.sharedStudyReason ?? null,
          frames: document.querySelectorAll('[data-shared-study-frame]').length };
      })()`);
      assert.deepEqual(reopenedThere, {
        state: 'ended',
        reason: 'study-pairing-changed',
        frames: 0,
      });
      // and a change that names another row than the stored one changes nothing, in the browser's own store:
      // not the old installation's row, and not this installation's under another generation
      const strayChanges = await second.evaluate(`(async (refs) => {
        const { createStudyCredentialStore } = await import('./shared-study-pairing.mjs');
        const store = createStudyCredentialStore();
        const done = [];
        for (const ref of refs) done.push(await store.end(ref, { at: Date.now(), unsent: 0 }), await store.markReady(ref),
          await store.forget(ref, { at: Date.now() }), await store.remove(ref));
        return done;
      })(${JSON.stringify([
        { installation: minted.installation, generation: 'first' },
        { installation: renewed.installation, generation: 'not-this-pairing' },
      ])})`);
      assert.deepEqual(strayChanges, Array(8).fill(false));
      assert.equal(secondAsked.length, secondQuiet);
      places = await readablePlaces(page);
      assert.equal(places.device.sealed.extractable, false);
      assert.ok(places.device.plain.includes(renewed.installation));
      assert.equal(places.device.plain.includes('"ended":null'), true);
      assert.deepEqual(marks(places), [['bunki-shared-study:paired:v1', '1']]);
      await second.close();

      // a restart keeps the installation and the journal (the new pairing fetched the learner's whole record)
      await page.close();
      const again = await context.newPage();
      watch(again);
      await again.goto(deck, { waitUntil: 'load' });
      frame = await studyFrame(again);
      state = await frameState(frame);
      assert.equal(state.installation, renewed.installation);
      assert.ok(state.reviews.includes(mine.eventId) && state.reviews.includes(theirs.eventId));

      // the server ends the pairing while an answer is being given: the answer waits on the device, sync stops,
      // the study screen closes and says why, and the page stops asking
      const sentFirst = await gradeInFrame(frame);
      await until(() => server.rows.some((row) => row.event.id === sentFirst.eventId));
      await context.setOffline(true);
      await again.waitForFunction(() => globalThis.navigator.onLine === false);
      const stranded = await gradeInFrame(frame);
      server.revoke(renewed.installation);
      await context.setOffline(false);
      const endedSurface = again.locator('main section[data-shared-study="ended"]');
      await endedSurface.waitFor({ timeout: 30000 });
      assert.equal(
        await endedSurface.getAttribute('data-shared-study-reason'),
        'study-pairing-ended',
      );
      assert.match(await endedSurface.innerText(), /The server ended this device’s pairing/);
      assert.equal(await again.locator('[data-shared-study-frame]').count(), 0);
      assert.equal(
        server.rows.some((row) => row.event.id === stranded.eventId),
        false,
      );
      const quiet = server.log.length;
      for (let turn = 0; turn < 3; turn++) {
        await wake(again);
        await again.waitForTimeout(150);
      }
      assert.equal(server.log.length, quiet);
      // a reload: the ended pairing is not bound again, the server is not asked again, and Settings says what
      // happened and how many answers never reached the server
      await again.goto(settings, { waitUntil: 'load' });
      assert.equal(await again.evaluate(() => typeof globalThis.bunkiSharedStudyHost), 'undefined');
      const ended = await studyBlock(again);
      assert.equal(ended.state, 'ended');
      assert.match(ended.status, /The server ended this device’s pairing/);
      assert.match(ended.status, /could not confirm that the server received 1 saved answer/);
      assert.equal(ended.unpairShown, true);
      assert.equal(ended.fields, 0);
      await shoot(again, 'settings-ended');
      places = await readablePlaces(again);
      assert.equal(places.device.sealed, null);
      assert.deepEqual(marks(places), [
        ['bunki-shared-study:ended:v1', `${renewed.installation}|server`],
        ['bunki-shared-study:paired:v1', '1'],
      ]);
      await again.goto(deck, { waitUntil: 'load' });
      await again.locator('#old-player').waitFor();
      assert.equal(server.log.length, quiet);
      assert.equal(renewedToken === token, false);
      assert.equal(printed.join('\n').includes(renewedToken), false);

      // the learner forgets the ended pairing: both marks and the record of it go, the copies of the record stay
      await again.goto(settings, { waitUntil: 'load' });
      await unpairInSettings(again);
      const unpaired = await studyBlock(again);
      assert.equal(unpaired.state, 'unpaired');
      assert.equal(await again.evaluate(() => typeof globalThis.bunkiSharedStudyHost), 'undefined');
      places = await readablePlaces(again);
      assert.equal(places.device, null);
      assert.deepEqual(marks(places), []);
      for (const installation of [minted.installation, renewed.installation])
        assert.ok(places.databases.includes(`bunki-shared-study-paired-${installation}`));
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
