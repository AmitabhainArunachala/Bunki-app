/* global window, document, bunkiSharedStudy, localStorage, indexedDB, Event, TextDecoder */
/** Shared steps of the paired-study browser proofs (ENGINE-ONE.3): the page-side moves a learner makes (pair in
 * Settings, open a deck, grade a card, unpair) and a second device of the same learner that is the engine's own
 * store and sync client, driven from Node with none of Bunki's host code. Used by the suite's source-tree test
 * (tools/shared-study-paired-browser.test.mjs) and by the local verifier on a built site
 * (scripts/verify-paired-study-browser.mjs). Test learners and made-up codes only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    /** Teach itself one card nobody has met and send the grade. Resolves { eventId, taskKey, rating }. */
    async gradeNew(module, rating = 3) {
      const first = await reserve();
      assert.equal(
        first.state,
        'up-to-date',
        `the second device could not bring its record up to date: ${first.error ?? first.state}`,
      );
      const projection = backend.readProjection();
      const entry = backend
        .queue({ module })
        .find((candidate) => !projection.introductions[candidate.taskKey]);
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
      formShown: shown('study-pair-form'),
      unpairShown: shown('study-unpair'),
      text: block.innerText,
    };
  }, settings);
}

/** Type what the learner types (the pairing line in the first box, a separate code in the second) and press Pair.
 * Resolves { paired, refused, note } as the block stood right after the answer. A pairing says so and then opens
 * the page again: this waits for that reload; where the new page lands is the caller's to follow. */
export async function pairInSettings(page, { line = '', code = '' }, { timeout = 60000 } = {}) {
  await studyBlock(page, { timeout });
  await page.locator('#study-pair-learner').fill(line);
  await page.locator('#study-pair-code').fill(code);
  await page.evaluate(
    (selector) => delete document.querySelector(selector).dataset.refused,
    settings,
  );
  const reloaded = page.waitForEvent('load', { timeout }).catch(() => null);
  await page.locator('#study-pair-submit').click();
  await page.waitForFunction(
    (selector) => {
      const block = document.querySelector(selector);
      return !!block && (block.dataset.paired === 'true' || !!block.dataset.refused);
    },
    settings,
    { timeout },
  );
  const answer = await page.evaluate((selector) => {
    const block = document.querySelector(selector);
    return {
      paired: block.dataset.paired === 'true',
      refused: block.dataset.refused || '',
      note: document.getElementById('study-pair-note')?.textContent || '',
    };
  }, settings);
  if (answer.paired) {
    await reloaded;
    await page.waitForLoadState('load', { timeout });
  }
  return answer;
}

/** Press Forget twice (the second press is the learner's "really"), read what the block says, wait for the reload. */
export async function unpairInSettings(page, { timeout = 60000 } = {}) {
  await studyBlock(page, { timeout });
  const what = await page.locator('#study-unpair-what').innerText();
  await page.locator('#study-unpair').click();
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

/** Start (when the screen is not already on a card), reveal, grade. Resolves the review the engine recorded. */
export async function gradeInFrame(frame, rating = 3, { timeout = 60000 } = {}) {
  const count = await frame.evaluate(
    () => bunkiSharedStudy.backend.readProjection().reviews.length,
  );
  // the screen is on a card (its answer still to be shown) or on Today (its start waiting): whichever comes up
  const reveal = frame.locator('[data-reveal]');
  const start = frame.locator('[data-start]:not(:disabled)');
  await reveal.or(start).first().waitFor({ state: 'visible', timeout });
  if (!(await reveal.isVisible())) await start.click({ timeout });
  await reveal.click({ timeout });
  await frame.locator(`[data-grade="${rating}"]`).click({ timeout });
  await frame.waitForFunction(
    (expected) => bunkiSharedStudy.backend.readProjection().reviews.length === expected + 1,
    count,
    { timeout },
  );
  return frame.evaluate(() => {
    const review = bunkiSharedStudy.backend.readProjection().reviews.at(-1);
    return { eventId: review.id, taskKey: review.taskKey, rating: review.rawRating };
  });
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
