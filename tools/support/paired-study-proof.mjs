/* global window, document, location, Buffer, bunkiSharedStudy, localStorage, indexedDB, Event, TextDecoder */
/** Shared steps of the paired-study browser proofs (ENGINE-ONE.3): the page-side moves a learner makes (pair in
 * Settings, open a deck, grade a card, unpair) and a second device of the same learner that is the engine's own
 * store and sync client, driven from Node with none of Bunki's host code. Used by the suite's source-tree test
 * (tools/shared-study-paired-browser.test.mjs) and by the local verifier on a built site
 * (scripts/verify-paired-study-browser.mjs). Test learners and made-up codes only. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { URL } from 'node:url';
import {
  createStudyEngine,
  createMemoryAdapter,
  createSyncTransport,
  sharedPermitRequest,
  SYNC_COMPATIBILITY,
} from '../../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
import {
  decodeSharedContent,
  SHARED_DECKS,
} from '../../prototypes/corridor/shared-study-content.mjs';

/** The whole bound content (8,508 tasks) of a corridor folder: the source tree's or a built site's. */
export function loadStudyContent(corridor) {
  const read = (path) => JSON.parse(readFileSync(join(corridor, path), 'utf8'));
  return decodeSharedContent(
    read('data/shared-study-content.json'),
    Object.fromEntries(SHARED_DECKS.map((id) => [id, read(`decks/${id}/deck.json`)])),
    read('vendor/shared-study-engine/client/vendor/fsrs-pin.json'),
  );
}

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

/** The page the source-tree proofs drive, in place of corridor.js: it loads shared-study-boot.mjs exactly as
 * index.html does, shows the Settings block the boot module hands over (`?view=settings`), and opens a deck through
 * the product's own gate and shared mount (`?deck=<id>`). */
export const HARNESS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>paired study harness</title></head><body><main></main>
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

/** Serve `/harness.html` and the files of `roots` (folders ending in a slash; the first that holds a path answers)
 * on loopback. `port` 0 takes any free port. Resolves { origin, close }. */
export function startHarnessSite(roots, { port = 0 } = {}) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (path === '/harness.html') {
      response.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      response.end(HARNESS);
      return;
    }
    const file = roots
      .map((root) => ({ root, at: join(root, normalize(path)) }))
      .find(({ root, at }) => at.startsWith(root) && existsSync(at) && statSync(at).isFile())?.at;
    if (!file) {
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
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.close(done);
            server.closeAllConnections();
          }),
      }),
    );
  });
}

/** A second device of the same learner: presents `code` for `installation` (`POST /v1/pair`, as the engine's own
 * pairing client does), then studies and syncs with the engine's own store and sync client. `server` is a plain
 * http address on this machine. `pageOrigin`, when given, is sent as the Origin of every request (a page's
 * device); without it this is a client that is no page, as a phone or a desktop app is. */
export async function createEngineClient({
  content,
  server,
  learner,
  environment,
  installation,
  code,
  pageOrigin = null,
  fetch: fetchFn = globalThis.fetch,
  now = Date.now,
}) {
  const base = {
    'X-NSRS-Reducer-SHA256': SYNC_COMPATIBILITY.reducerSha256,
    ...(pageOrigin ? { Origin: pageOrigin } : {}),
  };
  const json = { ...base, 'Content-Type': 'application/json' };
  const paired = await fetchFn(`${server}/v1/pair`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ scope: { environment, learner, installation }, code }),
  });
  assert.equal(paired.status, 200, `the second device could not pair: ${paired.status}`);
  const { scope, token } = await paired.json();
  assert.equal(scope.installation, installation);
  const engine = createStudyEngine({ content, learner: scope.learner, timezone: 'Asia/Tokyo' });
  const store = await engine.createFreshStore({
    adapter: createMemoryAdapter(),
    environment: scope.environment,
    newInstallationId: () => scope.installation,
    now,
  });
  await engine.refreshCorpus(store, { readPreviousRegistry: null, allowQAExpansion: false });
  // the engine's client takes an https address only; the plain-http address is carried there in that form
  const alias = server.replace(/^http:/, 'https:');
  const transport = createSyncTransport({
    store,
    origin: alias,
    getCredential: () => token,
    now,
    maxRetries: 1,
    fetch: async (url, init) => {
      const real = server + url.slice(alias.length);
      const response = await fetchFn(real, { ...init, headers: { ...init.headers, ...base } });
      return {
        status: response.status,
        headers: response.headers,
        body: response.body,
        redirected: response.redirected,
        url: response.url === real ? url : response.url,
      };
    },
  });
  let backend = null;
  const sync = async () => {
    const result = await transport.sync();
    await backend?.refresh();
    return result;
  };
  const reserve = async () => {
    await sync();
    const request = sharedPermitRequest(await store.readState(), {
      now,
      prefix: 'second-device',
      batchSize: 5,
    });
    if (request.count > 0) {
      const response = await fetchFn(`${server}/v1/permits`, {
        method: 'POST',
        headers: { ...json, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scope,
          count: request.count,
          requestId: request.requestId,
          policy: request.policy,
        }),
      });
      assert.equal(response.status, 200, `the second device got no permits: ${response.status}`);
    }
    return sync();
  };
  backend = await engine.connect({ store, transport: { reserveNewPermits: reserve }, now });
  return {
    scope,
    store,
    backend,
    sync,
    reviews: () => backend.readProjection().reviews,
    /** Teach itself one card nobody has met and send the grade. Resolves { eventId, taskKey, rating }.
     *
     * `except` names cards another device graded where this one cannot see it yet (that device is offline). This one
     * leaves those cards and their word's other cards alone: of two grades of one card made apart, the engine keeps
     * the first to reach the server and replays the later as an observation, 'stale-parent'
     * (vendor/shared-study-engine/client/replay.mjs:223), and a word's other cards rest for the day (replay.mjs:199). */
    async gradeNew(module, rating = 3, { except = [] } = {}) {
      const first = await reserve();
      assert.equal(
        first.state,
        'up-to-date',
        `the second device could not bring its record up to date: ${first.error ?? first.state}`,
      );
      const projection = backend.readProjection();
      const word = (taskKey) => projection.tasks[taskKey]?.lexicalKey ?? taskKey;
      const avoided = new Set(except.map(word));
      const entry = backend
        .queue({ module })
        .find(
          (candidate) =>
            !projection.introductions[candidate.taskKey] && !avoided.has(word(candidate.taskKey)),
        );
      assert(entry, 'the second device found no new card');
      const preview = backend.preview(backend.snapshotAttempt(entry.taskKey), 1800);
      const result = await backend.submitCommand(preview.intents[rating]);
      assert.equal(result.kind, 'durable');
      const sent = await sync();
      assert.equal(
        sent.state,
        'up-to-date',
        `the second device's grade was not sent: ${sent.error}`,
      );
      return { eventId: result.eventId, taskKey: entry.taskKey, rating };
    },
  };
}

/* ------------------------------------------------------------------------------------------- the page's side */

const settings = '#settings-study-device';

/** The Settings block as it stands: its state and the words it shows. */
export async function studyBlock(page, { timeout = 60000 } = {}) {
  await page.locator(`${settings}:not([data-state="loading"])`).waitFor({ timeout });
  return page.evaluate((selector) => {
    const block = document.querySelector(selector);
    const text = (id) => document.getElementById(id)?.textContent || '';
    const shown = (id) => {
      const node = document.getElementById(id);
      return !!node && !node.hidden && node.getClientRects().length > 0;
    };
    return {
      state: block.dataset.state,
      paired: block.dataset.paired,
      bound: block.dataset.bound,
      sync: block.dataset.sync || '',
      refused: block.dataset.refused || '',
      status: text('study-pair-status'),
      syncLine: text('study-pair-sync'),
      note: text('study-pair-note'),
      fields: block.querySelectorAll('form, input, textarea').length,
      unpairShown: shown('study-unpair'),
      text: block.innerText,
    };
  }, settings);
}

/** A one-time connect link's payload, as the learner's own tools write it: base64url of the JSON
 * {"v":1,"code","learner","installation","server","environment"}. */
export const connectPayload = ({ code, learner, installation, server, environment, ...rest }) =>
  Buffer.from(
    JSON.stringify({ v: 1, code, learner, installation, server, environment, ...rest }),
  ).toString('base64url');

/** The question a connect link asks, as the page shows it. */
const readConnect = (page) =>
  page.evaluate(() => {
    const panel = document.getElementById('study-connect');
    const text = (id) => document.getElementById(id)?.textContent || '';
    const shown = (id) => {
      const node = document.getElementById(id);
      return !!node && !node.hidden && node.getClientRects().length > 0;
    };
    return {
      state: panel?.dataset.state ?? 'gone',
      refused: panel?.dataset.refused || '',
      title: text('study-connect-title'),
      server: text('study-connect-server'),
      note: text('study-connect-note'),
      connectShown: shown('study-connect-yes'),
      other: text('study-connect-no'),
      address: location.href,
    };
  });

/** Open `url` the way the learner's own tools do, with a connect link's payload in its fragment, and answer the one
 * question the page asks: `answer` 'connect' (one click on Connect), 'not-now', or null (only look). Resolves
 * { first, state, refused, title, server, note, connectShown, other, address }: `first` as the question was asked, the
 * rest as it stood after the answer. A connection says so and opens the page again: this waits for that reload. */
export async function connectByLink(
  page,
  url,
  payload,
  { answer = 'connect', beforeAnswer = null, timeout = 60000 } = {},
) {
  // a fresh load: a fragment alone added to the page's own address would not start the page again
  await page.goto('about:blank');
  await page.goto(`${url}#study-connect=${payload}`, { waitUntil: 'load', timeout });
  await page.locator('#study-connect[data-state]').waitFor({ timeout });
  const first = await readConnect(page);
  // the question as it was asked, before it is answered (a picture of it, for one)
  await beforeAnswer?.(first);
  if (answer === null || first.state !== 'offer') return { first, ...first };
  if (answer === 'not-now') {
    await page.locator('#study-connect-no').click();
    return { first, ...(await readConnect(page)) };
  }
  const reloaded = page.waitForEvent('load', { timeout }).catch(() => null);
  await page.locator('#study-connect-yes').click();
  await page.waitForFunction(
    () => ['connected', 'failed'].includes(document.getElementById('study-connect')?.dataset.state),
    null,
    { timeout },
  );
  const after = await readConnect(page);
  if (after.state === 'connected') {
    await reloaded;
    await page.waitForLoadState('load', { timeout });
  }
  return { first, ...after };
}

/** Press Disconnect twice (the second press is the learner's "really", beside what it does), read what the block
 * says, wait for the reload. */
export async function unpairInSettings(page, { timeout = 60000 } = {}) {
  await studyBlock(page, { timeout });
  await page.locator('#study-unpair').click();
  const what = await page.locator('#study-unpair-what').innerText();
  const sure = await page.locator('#study-unpair').innerText();
  const reloaded = page.waitForEvent('load', { timeout }).catch(() => null);
  await page.locator('#study-unpair').click();
  await page.locator('#study-pair-note').waitFor({ state: 'visible', timeout });
  const note = await page.locator('#study-pair-note').innerText();
  await reloaded;
  await page.waitForLoadState('load', { timeout });
  return { what, sure, note };
}

/** The shared study screen inside the page, once the engine's own app is up in it. */
export async function studyFrame(page, { timeout = 150000 } = {}) {
  await page.locator('[data-shared-study-frame]').waitFor({ timeout });
  const frame = await (
    await page.locator('[data-shared-study-frame]').elementHandle()
  ).contentFrame();
  await frame.waitForFunction(
    () => !!window.bunkiSharedStudy || !!document.querySelector('[role=alert]'),
    null,
    { timeout },
  );
  assert(
    await frame.evaluate(() => !!window.bunkiSharedStudy),
    `the study screen did not open: ${await frame.locator('body').innerText()}`,
  );
  return frame;
}

export const frameState = (frame) =>
  frame.evaluate(async () => {
    const projection = bunkiSharedStudy.backend.readProjection();
    const status = await bunkiSharedStudy.store.status();
    return {
      installation: bunkiSharedStudy.store.scope.installation,
      learner: bunkiSharedStudy.store.scope.learner,
      environment: bunkiSharedStudy.store.scope.environment,
      reviews: projection.reviews.map((review) => review.id),
      introduced: Object.keys(projection.introductions).length,
      pending: status.pending,
      upToDate: status.upToDate,
      text: document.body.innerText,
    };
  });

const UPDATED_ELSEWHERE =
  /このカードの記録が更新されました。今回の評価は送信していません。|This card’s record was updated\. Your rating was not sent\./;

/** Start (when the screen is not already on a card), reveal, grade. Resolves the review the engine recorded.
 *
 * A card that another device graded while it waited in this screen's session is not graded here. After the reveal the
 * released engine finds that the card's record moved past the open attempt and shows only "This card's record was
 * updated. Your rating was not sent." with "Next card", no grades (vendor/shared-study-engine/client/app/app.mjs:2361,
 * the panel at app.mjs:2391). A learner takes the next card, and so does this; `passedOver` counts those cards. */
export async function gradeInFrame(frame, rating = 3, { timeout = 60000 } = {}) {
  const count = await frame.evaluate(
    () => bunkiSharedStudy.backend.readProjection().reviews.length,
  );
  // the screen is on a card (its answer still to be shown) or on Today (its start waiting): whichever comes up
  const reveal = frame.locator('[data-reveal]');
  const start = frame.locator('[data-start]:not(:disabled)');
  const grade = frame.locator(`[data-grade="${rating}"]`);
  const updated = frame.locator('[data-stale-attempt]');
  let passedOver = 0;
  for (;;) {
    await reveal.or(start).first().waitFor({ state: 'visible', timeout });
    if (!(await reveal.isVisible())) await start.click({ timeout });
    await reveal.click({ timeout });
    try {
      await grade.or(updated).first().waitFor({ state: 'visible', timeout });
    } catch (error) {
      const screen = (await frame.locator('body').innerText()).slice(0, 400);
      throw new Error(`${error.message}\nthe study screen showed: ${screen}`, { cause: error });
    }
    if (await grade.isVisible()) break;
    assert.match(await updated.innerText(), UPDATED_ELSEWHERE);
    assert(++passedOver <= 2, 'the study screen refused three cards in a row as updated elsewhere');
    await updated.locator('[data-next-card]').click({ timeout });
  }
  await grade.click({ timeout });
  await frame.waitForFunction(
    (expected) => bunkiSharedStudy.backend.readProjection().reviews.length === expected + 1,
    count,
    { timeout },
  );
  const review = await frame.evaluate(() => {
    const last = bunkiSharedStudy.backend.readProjection().reviews.at(-1);
    return { eventId: last.id, taskKey: last.taskKey, rating: last.rawRating };
  });
  return { ...review, passedOver };
}

/** What a page that comes back to the front does: the host's sync wakes on it. */
export const wake = (page) => page.evaluate(() => void window.dispatchEvent(new Event('focus')));

/** Wait until this device holds review `eventId`, waking its sync while waiting. */
export async function waitForReview(page, frame, eventId, { timeout = 60000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    await wake(page);
    const held = await frame.evaluate(
      (id) => bunkiSharedStudy.backend.readProjection().reviews.some((review) => review.id === id),
      eventId,
    );
    if (held) return true;
    assert(Date.now() < deadline, `review ${eventId} did not arrive on this device`);
    await page.waitForTimeout(250);
  }
}

/** Everything of this origin a script can read where a credential must never be: localStorage, cookies, and the
 * device record in IndexedDB as a copy of the stored bytes would show it. */
export const readablePlaces = (page) =>
  page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((db) => db.name).sort();
    // opening a database that is not there would make an empty one: look only at one that exists
    const device = await new Promise((resolve) => {
      if (!names.includes('bunki-study-device')) return resolve(null);
      const open = indexedDB.open('bunki-study-device');
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('pairing')) {
          db.close();
          resolve(null);
          return;
        }
        const get = db.transaction('pairing').objectStore('pairing').get('device');
        get.onerror = () => resolve(null);
        get.onsuccess = () => {
          const row = get.result;
          db.close();
          if (!row) return resolve(null);
          resolve({
            fields: Object.keys(row).sort(),
            plain: JSON.stringify({ ...row, sealed: null }),
            sealed: row.sealed
              ? {
                  extractable: row.sealed.key.extractable,
                  algorithm: row.sealed.key.algorithm.name,
                  usages: [...row.sealed.key.usages].sort(),
                  bytesAsText: new TextDecoder().decode(row.sealed.data),
                }
              : null,
          });
        };
      };
    });
    return {
      localStorage: Object.entries(localStorage),
      cookie: document.cookie,
      databases: names,
      device,
    };
  });
