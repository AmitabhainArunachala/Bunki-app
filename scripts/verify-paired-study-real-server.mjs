#!/usr/bin/env node
/* global navigator, window, setTimeout, fetch, URL, Headers, Response */
/** The paired-study harness page against the REAL Nihongo Study server on this machine (ENGINE-ONE.3).
 *
 * Local only, never in CI: it needs a checkout of the Nihongo Study repository, which CI does not have, and it builds
 * nothing. It serves the source tree with the harness page of tools/shared-study-paired-browser.test.mjs on two
 * loopback origins, starts that repository's local server (tests/worker/study-origin-server.mjs: the dev Worker on
 * local Wrangler behind an https front with a self-signed certificate) with both origins listed, and for each engine
 * (Chromium, then WebKit) shows that
 *   a. Settings pairs a `bunkiweb-` device, the code redeemed by the page itself (so the server binds the token to
 *      the page's origin; a browser-class token without one answers no browser);
 *   b. the study screen opens on the paired record: no "Trial copy", no "Sync is not set up";
 *   c. a grade made in the page reaches the server and a second device of the same learner (the engine's own store
 *      and sync client from Node, an `iphone-` device that sends no Origin), and a grade made there reaches the page;
 *   handoff. a grade saved offline reaches the other client on pagehide while a foreground pull is interrupted;
 *      creating a new page reconciles the original event exactly once;
 *   d. a new page of the same profile keeps the installation and the journal;
 *   f. the same token presented from the second listed origin is refused (401 `origin-mismatch`), and a page there
 *      that holds it shows the ended state;
 *   e. the server ends the pairing (`POST /v1/admin/revoke`): the page stops syncing, says so, and takes no answer.
 * The browsers reach the two harness origins and the server and nothing else; they accept the server's self-signed
 * certificate. The second device skips certificate checks for that one loopback address, through an agent of its
 * own; nothing process-wide changes. Receipts: `<out>/receipt-<engine>.json`, screenshots `<out>/shots/`. No pairing
 * code, token or admin token is written or printed: the script checks its own files for them before it ends.
 *
 * Usage (Node 22, from this repository; environment the server needs exported beforehand):
 *   node scripts/verify-paired-study-real-server.mjs --out <empty folder under ~/.dharma> \
 *     --server-cwd <Nihongo Study checkout> \
 *     --server-command "node tests/worker/study-origin-server.mjs --origins {origins} --out <scratch folder>" \
 *     [--engines chromium,webkit] [--server-wait 180]
 * The command is one program with its arguments (a sandbox wrapper in front is fine; no `cd`, no `&&`): the stop
 * signal then reaches the server itself. `{origins}` becomes the two harness origins, comma separated. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Agent, request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { SYNC_COMPATIBILITY } from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
import {
  createEngineClient,
  frameState,
  gradeInFrame,
  loadStudyContent,
  connectByLink,
  connectPayload,
  readablePlaces,
  startHarnessSite,
  studyBlock,
  studyFrame,
  waitForReview,
  wake,
} from '../tools/support/paired-study-proof.mjs';

const corridor = fileURLToPath(new URL('../prototypes/corridor/', import.meta.url));
const HTTPS_LOOPBACK = /^https:\/\/127\.0\.0\.1:\d{1,5}$/;
const PLAIN_LOOPBACK = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;
const STUDY_DEVICE = /^bunkiweb-[a-f0-9]{32}$/;
const CODE = /^[A-F0-9]{12}$/;
const MADE_UP_CODE = 'A0B0A0B0A0B0';
const OWNERS_PORTS = new Set([18841, 19610, 19612]);
const FLAGS = ['--out', '--server-cwd', '--server-command', '--engines', '--server-wait'];
const USAGE =
  'Usage: node scripts/verify-paired-study-real-server.mjs --out <empty folder under ~/.dharma> ' +
  '--server-cwd <Nihongo Study checkout> --server-command "<one program with its arguments; {origins} is replaced>" ' +
  '[--engines chromium,webkit] [--server-wait 180]';

function usage(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const [flag, value] = [process.argv[index], process.argv[index + 1]];
  if (!FLAGS.includes(flag) || value === undefined || args.has(flag))
    usage(`Unexpected argument: ${flag ?? ''}`);
  args.set(flag, value);
}
const out = args.has('--out') ? resolve(args.get('--out')) : null;
if (!out || !args.has('--server-cwd') || !args.has('--server-command'))
  usage('--out, --server-cwd and --server-command are required.');
if (!out.startsWith(join(homedir(), '.dharma') + sep))
  usage('Evidence goes to a folder under ~/.dharma.');
if (existsSync(out) && readdirSync(out).length)
  usage('The evidence folder is not empty: choose a fresh one.');
const command = args.get('--server-command');
if (!command.includes('{origins}') || /[;&|<>`$]|\bcd\b/.test(command))
  usage('The server command is one program with its arguments, and names {origins}.');
const engines = (args.get('--engines') ?? 'chromium,webkit').split(',').filter(Boolean);
if (!engines.length || engines.some((name) => !['chromium', 'webkit'].includes(name)))
  usage('--engines names chromium, webkit or both.');
const serverWaitMs = Number(args.get('--server-wait') ?? 180) * 1000;

const hex = (bytes) => randomBytes(bytes).toString('hex');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
/** Text that may be kept: a token or a real pairing code never is. */
const scrub = (text) =>
  String(text)
    .replace(/nsrs_[A-Za-z0-9_.-]+/g, 'nsrs_<withheld>')
    .replace(/\b[A-F0-9]{12}\b/g, (code) => (code === MADE_UP_CODE ? code : '<code>'));
async function until(holds, what, { timeout = 60000, every = 250 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await holds()) return;
    assert(Date.now() < deadline, `did not happen in time: ${what}`);
    await sleep(every);
  }
}
/** The first whole JSON object in `text` that has a `devices` list, or null while it has not all arrived. */
function reportIn(text) {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
      try {
        const value = JSON.parse(text.slice(start, end + 1));
        if (value && Array.isArray(value.devices)) return value;
      } catch {
        /* not a whole object yet, or not this one */
      }
    }
  }
  return null;
}

/** Start the server with the harness origins listed. Its output carries codes and an admin token: read, never kept. */
async function startServer(origins) {
  const child = spawn(`exec ${command.replaceAll('{origins}', origins.join(','))}`, {
    shell: true,
    cwd: resolve(args.get('--server-cwd')),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exited = null;
  let text = '';
  let noise = '';
  child.on('exit', (code, signal) => (exited = { code, signal }));
  child.stdout.on('data', (chunk) => (text += chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => (noise = (noise + chunk.toString('utf8')).slice(-1200)));
  // only this process is signalled, by its own handle, and only while it is still running
  const stop = async () => {
    if (exited === null) child.kill('SIGTERM');
    await until(() => exited !== null, 'the server stopped', { timeout: 30000 }).catch(() => {});
    return exited;
  };
  try {
    let report = null;
    await until(
      () => {
        assert(
          exited === null,
          `the server ended early: ${scrub(noise.replace(/\s+/g, ' ').slice(-400))}`,
        );
        report = reportIn(text);
        return report !== null;
      },
      'the server printed its report',
      { timeout: serverWaitMs },
    );
    return { report, stop, noise: () => scrub(noise.replace(/\s+/g, ' ').slice(-600)) };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** fetch for the second device: the server's https front on loopback and no other address. Its certificate is
 * self-signed for this run, so this agent alone skips verification; the process's own TLS settings stay as they are. */
function loopbackFetch(base) {
  assert.match(base, HTTPS_LOOPBACK);
  const agent = new Agent({ rejectUnauthorized: false });
  return (url, init = {}) =>
    new Promise((answer, fail) => {
      if (typeof url !== 'string' || !url.startsWith(`${base}/`)) {
        fail(new Error('the second device talks to the local server only'));
        return;
      }
      const method = init.method ?? 'GET';
      const request = httpsRequest(
        url,
        { method, headers: Object.fromEntries(new Headers(init.headers ?? {})), agent },
        (reply) => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(reply.headers))
            for (const one of [].concat(value)) headers.append(name, one);
          const empty = method === 'HEAD' || [204, 205, 304].includes(reply.statusCode);
          if (empty) reply.resume();
          const response = new Response(empty ? null : Readable.toWeb(reply), {
            status: reply.statusCode,
            headers,
          });
          Object.defineProperty(response, 'url', { value: url });
          answer(response);
        },
      );
      request.on('error', fail);
      init.signal?.addEventListener('abort', () => request.destroy(new Error('aborted')), {
        once: true,
      });
      if (init.body !== undefined && init.body !== null) request.write(init.body);
      request.end();
    });
}

/** An admin call, from Node over the plain-http address (the admin routes are never cross-origin). */
async function admin(report, path, body) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${report.httpUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${report.adminToken}` },
      body: JSON.stringify(body),
    });
    const answer = { status: response.status, body: await response.json().catch(() => null) };
    if (answer.status !== 429 || attempt > 0) return answer;
    await sleep((Number(response.headers.get('retry-after')) || 60) * 1000);
  }
}

async function runEngine(engine, launcher, { report, device, second, siteA, siteB, secrets }) {
  const S = report.baseUrl;
  const scope = {
    environment: report.environment,
    learner: report.learner,
    installation: device.installation,
  };
  const run = {
    kind: 'bunki-paired-study-real-server-proof/v1',
    engine,
    startedAt: new Date().toISOString(),
    page: {
      origin: siteA.origin,
      secondListedOrigin: siteB.origin,
      harness: 'HARNESS of tools/support/paired-study-proof.mjs',
    },
    server: {
      program:
        'tests/worker/study-origin-server.mjs (Nihongo Study repository): dev Worker on local Wrangler, https front',
      address: S,
      environment: report.environment,
      learner: report.learner,
      studyOrigins: report.studyOrigins,
      reducerSha256: report.reducerSha256,
    },
    device: device.installation,
    secondDevice: second.scope.installation,
    steps: {},
    shots: [],
    serverRequests: {},
    serverRefusals: [],
    pageErrors: [],
    consoleErrors: [],
    result: 'running',
  };
  let current = 'launch';
  let latest = null;
  const done = (id, detail = {}) => (run.steps[id] = { ok: true, ...detail });
  const shot = async (page, name) => {
    const file = `${engine}-${name}.png`;
    await page.screenshot({ path: join(out, 'shots', file) });
    run.shots.push(`shots/${file}`);
  };
  const browser = await launcher.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    });
    const allowed = [siteA.origin, siteB.origin, S];
    await context.route('**/*', (route) =>
      allowed.some((origin) => route.request().url().startsWith(`${origin}/`))
        ? route.continue()
        : route.abort(),
    );
    const toServer = [];
    const printed = [];
    const tokens = [];
    context.on('request', (request) => {
      if (!request.url().startsWith(`${S}/`)) return;
      const path = new URL(request.url()).pathname;
      const key = `${request.method()} ${path}`;
      run.serverRequests[key] = (run.serverRequests[key] ?? 0) + 1;
      toServer.push({
        request,
        url: request.url(),
        method: request.method(),
        authorization: request.headers().authorization ?? null,
      });
    });
    context.on('response', async (response) => {
      if (!response.url().startsWith(`${S}/`)) return;
      const path = new URL(response.url()).pathname;
      if (
        path === '/v1/pair' &&
        response.request().method() === 'POST' &&
        response.status() === 200
      ) {
        const body = await response.json().catch(() => null);
        if (typeof body?.token === 'string') {
          tokens.push(body.token);
          secrets.add(body.token);
        }
      } else if (response.status() >= 400) {
        const body = await response.json().catch(() => null);
        const from =
          (
            await response
              .request()
              .allHeaders()
              .catch(() => ({}))
          ).origin ?? null;
        run.serverRefusals.push({
          step: current,
          from,
          method: response.request().method(),
          path,
          status: response.status(),
          error: body?.error ?? null,
        });
      }
    });
    const watch = (page) => {
      latest = page;
      page.on('console', (message) => {
        printed.push(message.text());
        if (message.type() === 'error' && run.consoleErrors.length < 30)
          run.consoleErrors.push(`${current}: ${scrub(message.text()).slice(0, 300)}`);
      });
      page.on('pageerror', (error) => run.pageErrors.push(`${current}: ${scrub(error.message)}`));
      return page;
    };
    // the one-time connect link the learner's own tools open for him
    const linkWith = (code) =>
      connectPayload({
        code,
        learner: report.learner,
        installation: device.installation,
        server: S,
        environment: report.environment,
      });
    const connectIn = async (page, code) => {
      const answer = await connectByLink(page, page.url().replace(/#.*$/u, ''), linkWith(code));
      return { paired: answer.state === 'connected', refused: answer.refused, note: answer.note };
    };

    // a. pairing in Settings, the code redeemed by the page
    current = 'a';
    const page = watch(await context.newPage());
    await page.goto(`${siteA.origin}/harness.html?view=settings`, { waitUntil: 'load' });
    assert.equal((await studyBlock(page)).state, 'unpaired');
    const wrong = await connectIn(page, MADE_UP_CODE);
    assert.equal(wrong.refused, 'code-invalid-or-expired', scrub(JSON.stringify(wrong)));
    const paired = await connectIn(page, device.code);
    assert.equal(paired.paired, true, scrub(JSON.stringify(paired)));
    const block = await studyBlock(page);
    assert.equal(block.state, 'paired');
    assert.equal(block.bound, 'true');
    assert.match(block.status, /Connected\. This device studies on your Nihongo Study record\./);
    assert.equal(
      tokens.length,
      1,
      'the page itself got the token: one 200 answer to its POST /v1/pair',
    );
    const pairRequests = toServer.filter(
      (entry) => entry.method === 'POST' && entry.url === `${S}/v1/pair`,
    );
    const sentFrom = await Promise.all(
      pairRequests.map(async (entry) => (await entry.request.allHeaders()).origin ?? null),
    );
    assert.deepEqual(sentFrom, [siteA.origin, siteA.origin]);
    done('a', {
      wrongCode: { refused: wrong.refused, note: scrub(wrong.note) },
      pairedNote: scrub(paired.note),
      settingsStatus: scrub(block.status),
      pairRequestsSentWithOrigin: sentFrom,
    });
    await shot(page, 'a-paired-settings');

    // b. the study surface on the paired record
    current = 'b';
    await page.goto(`${siteA.origin}/harness.html?deck=n2`, { waitUntil: 'load' });
    let frame = await studyFrame(page);
    let state = await frameState(frame);
    assert.equal(state.installation, device.installation);
    assert.equal(state.learner, report.learner);
    assert.equal(state.environment, report.environment);
    assert.equal(/Trial copy/.test(await page.locator('main').innerText()), false);
    assert.equal(/Sync is not set up|同期は未設定/.test(state.text), false);
    assert.equal(
      await frame.evaluate(() => window.frameElement.bunkiStudyPort.adapter.platform.isPaired()),
      true,
    );
    done('b', {
      installation: state.installation,
      learner: state.learner,
      environment: state.environment,
      trialCopy: false,
      syncNotSetUp: false,
    });
    await shot(page, 'b-study');

    // c. a grade each way through the server
    current = 'c';
    const mine = await gradeInFrame(frame);
    await until(
      async () => {
        await second.sync();
        return second.reviews().some((review) => review.id === mine.eventId);
      },
      'the page’s grade reached the second device',
      { timeout: 90000, every: 1500 },
    );
    const arrived = second.reviews().find((review) => review.id === mine.eventId);
    assert.equal(arrived.taskKey, mine.taskKey);
    assert.equal(arrived.rawRating, 3);
    const theirs = await second.gradeNew('n2', 4);
    await waitForReview(page, frame, theirs.eventId, { timeout: 90000 });
    state = await frameState(frame);
    assert.ok(state.reviews.includes(theirs.eventId) && state.reviews.includes(mine.eventId));
    const [token] = tokens;
    const places = await readablePlaces(page);
    for (const text of [
      places.device.plain,
      places.device.sealed?.bytesAsText ?? '',
      places.cookie,
      JSON.stringify(places.localStorage),
      printed.join('\n'),
    ])
      assert.equal(text.includes(token), false, 'the credential is readable where it must not be');
    let carried = 0;
    for (const entry of toServer) {
      assert.equal(entry.url.includes(token), false);
      if (entry.authorization) {
        assert.equal(entry.authorization, `Bearer ${token}`);
        carried++;
      }
    }
    assert.ok(carried >= 3, `requests that carried the credential: ${carried}`);
    done('c', {
      pageGrade: {
        eventId: mine.eventId,
        taskKey: mine.taskKey,
        rating: 3,
        pulledBySecondDevice: true,
      },
      secondDeviceGrade: {
        eventId: theirs.eventId,
        taskKey: theirs.taskKey,
        rating: 4,
        arrivedInPage: true,
      },
      requestsThatCarriedTheCredential: carried,
      credentialReadableByScriptOrLog: false,
    });
    await shot(page, 'c-exchanged');

    // Isolate the departure upload. The browser has a real unsent answer in
    // IndexedDB; the reconnecting foreground GET is held before it reaches
    // the server, so it cannot account for any accepted POST.
    current = 'handoff';
    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
    const interrupted = await gradeInFrame(frame);
    const locallyUnconfirmed = () =>
      frame.evaluate(async (id) => {
        const journal = await window.bunkiSharedStudy.store.readState({ requireCompatible: true });
        return Object.values(journal.local).some(
          (row) => row.event.id === id && row.ackedSeq === null,
        );
      }, interrupted.eventId);
    assert.ok(await locallyUnconfirmed());
    await shot(page, 'handoff-offline');

    const isPull = (url) =>
      url.origin === S && url.pathname === '/v1/events' && url.searchParams.has('after');
    let heldPull;
    await page.route(isPull, (route) => {
      heldPull = route;
    });
    try {
      await context.setOffline(false);
      await until(() => !!heldPull, 'foreground reconnect reached the held pull');
      await page.evaluate(() =>
        window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true })),
      );
      await until(
        async () => {
          await second.sync();
          return second.reviews().some((review) => review.id === interrupted.eventId);
        },
        'the other client received the departure upload',
        { timeout: 10000 },
      );
      assert.ok(await locallyUnconfirmed(), 'departure never acknowledges the local answer');
    } finally {
      await page.unroute(isPull);
      await heldPull?.abort().catch(() => {});
    }
    done('handoff', {
      grade: interrupted.eventId,
      savedOffline: true,
      foregroundPullHeld: true,
      lifecycle: 'dispatched persisted pagehide',
      confirmedBySecondClient: true,
      stillPendingLocally: true,
    });

    // d. a restart: a new page of the same profile
    current = 'd';
    await page.close();
    const again = watch(await context.newPage());
    await again.goto(`${siteA.origin}/harness.html?deck=n2`, { waitUntil: 'load' });
    frame = await studyFrame(again);
    state = await frameState(frame);
    assert.equal(state.installation, device.installation);
    assert.ok(state.reviews.includes(mine.eventId) && state.reviews.includes(theirs.eventId));
    assert.equal(state.reviews.filter((id) => id === interrupted.eventId).length, 1);
    assert.equal(state.pending, 0);
    assert.equal(second.reviews().filter((review) => review.id === interrupted.eventId).length, 1);
    done('d', {
      installationKept: state.installation,
      journalHolds: [mine.eventId, theirs.eventId, interrupted.eventId],
      recoveredOfflineAnswerCopies: 1,
      pendingAfterReopen: state.pending,
      reviewsInJournal: state.reviews.length,
    });
    await shot(again, 'd-restart');

    // f. the same token from the second listed origin
    current = 'f';
    const there = watch(await context.newPage());
    await there.goto(`${siteB.origin}/harness.html?view=settings`, { waitUntil: 'load' });
    const direct = await there.evaluate(
      async ([server, credential, sha]) => {
        const response = await fetch(`${server}/v1/events?after=0&limit=1`, {
          headers: { Authorization: `Bearer ${credential}`, 'X-NSRS-Reducer-SHA256': sha },
          credentials: 'omit',
          cache: 'no-store',
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      },
      [S, token, SYNC_COMPATIBILITY.reducerSha256],
    );
    assert.equal(direct.status, 401);
    assert.deepEqual(direct.body, { error: 'origin-mismatch' });
    // a page at that origin that holds the token (as if it had been carried there): it studies on nothing
    await there.evaluate(`(async (row) => {
      const { createStudyCredentialStore, PAIRED_MARKER } = await import('./shared-study-pairing.mjs');
      await createStudyCredentialStore().write(row);
      localStorage.setItem(PAIRED_MARKER, '1');
    })(${JSON.stringify({ server: S, token, scope, pairedAt: Date.now() })})`);
    await there.goto(`${siteB.origin}/harness.html?deck=n2`, { waitUntil: 'load' });
    // the first open is refused before any record arrives: the surface says the pairing ended (not "open again online")
    const elsewhere = there.locator('main section[data-shared-study-reason="study-pairing-ended"]');
    await elsewhere.waitFor({ timeout: 90000 });
    const elsewhereState = await elsewhere.getAttribute('data-shared-study');
    const elsewhereText = await elsewhere.innerText();
    assert.match(elsewhereText, /The server ended this device’s pairing/);
    assert.equal(await there.locator('[data-shared-study-frame]').count(), 0);
    assert.equal(
      await there.evaluate(() => globalThis.bunkiSharedStudyHost?.closed()?.code ?? null),
      'study-pairing-ended',
    );
    await shot(there, 'f-second-origin-ended');
    const askedThere = toServer.length;
    for (let turn = 0; turn < 3; turn++) {
      await wake(there);
      await there.waitForTimeout(300);
    }
    await there.goto(`${siteB.origin}/harness.html?deck=n2`, { waitUntil: 'load' });
    await there.locator('#old-player').waitFor();
    assert.equal(
      toServer.length,
      askedThere,
      'the page at the second origin asked again after the refusal',
    );
    done('f', {
      directRequestFromSecondOrigin: direct,
      pageAtSecondOrigin: {
        surface: elsewhereState,
        reason: 'study-pairing-ended',
        text: scrub(elsewhereText),
        requestsAfterTheRefusal: 0,
        afterReload: 'the old player: the ended pairing is not bound again',
      },
    });
    await there.close();
    latest = again;

    // e. the server ends the pairing while an answer waits on the device
    current = 'e';
    const sentFirst = await gradeInFrame(frame);
    await until(
      async () => {
        await second.sync();
        return second.reviews().some((review) => review.id === sentFirst.eventId);
      },
      'the first origin still syncs after the refusal at the second',
      { timeout: 90000, every: 1500 },
    );
    await context.setOffline(true);
    await again.waitForFunction(() => navigator.onLine === false);
    const stranded = await gradeInFrame(frame);
    const revoked = await admin(report, '/v1/admin/revoke', { scope });
    assert.equal(revoked.status, 200, JSON.stringify(revoked));
    assert.equal(revoked.body?.status, 'revoked');
    await context.setOffline(false);
    const endedSurface = again.locator('main section[data-shared-study="ended"]');
    await endedSurface.waitFor({ timeout: 90000 });
    const reason = await endedSurface.getAttribute('data-shared-study-reason');
    const endedText = await endedSurface.innerText();
    assert.equal(reason, 'study-pairing-ended');
    assert.match(endedText, /The server ended this device’s pairing/);
    assert.equal(await again.locator('[data-shared-study-frame]').count(), 0);
    assert.equal(
      await again.evaluate(() => globalThis.bunkiSharedStudyHost?.closed()?.code ?? null),
      'study-pairing-ended',
    );
    await shot(again, 'e-ended');
    await second.sync();
    assert.equal(
      second.reviews().some((review) => review.id === stranded.eventId),
      false,
    );
    const quiet = toServer.length;
    for (let turn = 0; turn < 3; turn++) {
      await wake(again);
      await again.waitForTimeout(300);
    }
    assert.equal(toServer.length, quiet, 'the page asked the server again after its pairing ended');
    await again.goto(`${siteA.origin}/harness.html?view=settings`, { waitUntil: 'load' });
    const ended = await studyBlock(again);
    assert.equal(ended.state, 'ended');
    assert.match(ended.status, /The server ended this device’s pairing/);
    assert.match(ended.status, /could not confirm that the server received 1 saved answer/);
    await shot(again, 'e-settings-ended');
    await again.goto(`${siteA.origin}/harness.html?deck=n2`, { waitUntil: 'load' });
    await again.locator('#old-player').waitFor();
    assert.equal(await again.locator('[data-shared-study-frame]').count(), 0);
    assert.equal(toServer.length, quiet, 'a reload asked the server again');
    done('e', {
      endedBy: 'POST /v1/admin/revoke with the run’s admin bearer and {scope} of this installation',
      revokeAnswer: revoked.body,
      gradeSentBeforeTheEnd: { eventId: sentFirst.eventId, pulledBySecondDevice: true },
      answerWaitingOnTheDevice: { eventId: stranded.eventId, reachedServer: false },
      surface: { reason, text: scrub(endedText) },
      settings: { state: ended.state, status: scrub(ended.status) },
      requestsToServerAfterTheEnd: 0,
      afterReload: 'the old player; no study surface, so no answer can be given',
    });
    run.result = 'pass';
  } catch (error) {
    run.result = 'fail';
    run.failedAt = current;
    run.error = scrub(error?.stack ?? error);
    if (latest && !latest.isClosed()) await shot(latest, `failed-${current}`).catch(() => {});
  } finally {
    await browser.close();
    run.finishedAt = new Date().toISOString();
  }
  return run;
}

async function main() {
  mkdirSync(join(out, 'shots'), { recursive: true });
  const { chromium, webkit } = createRequire(import.meta.url)('playwright-core');
  const launchers = { chromium, webkit };
  const siteA = await startHarnessSite([corridor]);
  const siteB = await startHarnessSite([corridor]);
  for (const site of [siteA, siteB]) assert(!OWNERS_PORTS.has(Number(new URL(site.origin).port)));
  const secrets = new Set();
  const runs = [];
  const notes = { startedAt: new Date().toISOString(), runs: [], notRun: [] };
  let server = null;
  try {
    server = await startServer([siteA.origin, siteB.origin]);
    const { report } = server;
    for (const value of [
      report.adminToken,
      ...(report.devices ?? []).map((device) => device?.code),
    ])
      if (typeof value === 'string' && value) secrets.add(value);
    assert.match(report.baseUrl ?? '', HTTPS_LOOPBACK, 'the server has no https loopback front');
    assert.match(
      report.httpUrl ?? '',
      PLAIN_LOOPBACK,
      'the server has no plain-http loopback address',
    );
    assert.match(report.learner ?? '', /^test-[A-Za-z0-9][A-Za-z0-9._-]*$/, 'a test- learner only');
    assert.equal(report.environment, 'dev');
    const phone = report.devices.find(
      (device) => /^iphone-/.test(device.installation) && CODE.test(device.code),
    );
    let device = report.devices.find(
      (device) => STUDY_DEVICE.test(device.installation) && CODE.test(device.code),
    );
    assert(phone && device, 'the server printed no bunkiweb- and iphone- devices');
    const second = await createEngineClient({
      content: loadStudyContent(corridor),
      server: report.baseUrl,
      learner: report.learner,
      environment: report.environment,
      installation: phone.installation,
      code: phone.code,
      fetch: loopbackFetch(report.baseUrl),
    });
    for (const engine of engines) {
      if (!device) {
        const minted = await admin(report, '/v1/pair/code', {
          scope: {
            environment: report.environment,
            learner: report.learner,
            installation: `bunkiweb-${hex(16)}`,
          },
        });
        assert.equal(minted.status, 200, `no further code: ${minted.status}`);
        secrets.add(minted.body.code);
        device = { installation: minted.body.scope.installation, code: minted.body.code };
      }
      const run = await runEngine(engine, launchers[engine], {
        report,
        device,
        second,
        siteA,
        siteB,
        secrets,
      });
      if (run.result !== 'pass') run.serverOutputTail = server.noise();
      runs.push(run);
      device = null;
    }
  } catch (error) {
    notes.error = scrub(error?.stack ?? error);
    notes.serverOutputTail = server?.noise() ?? null;
  } finally {
    const stopped = server ? await server.stop() : null;
    await siteA.close();
    await siteB.close();
    for (const run of runs) {
      run.serverStopped = stopped;
      writeFileSync(join(out, `receipt-${run.engine}.json`), `${JSON.stringify(run, null, 2)}\n`);
      notes.runs.push({ engine: run.engine, result: run.result, failedAt: run.failedAt ?? null });
    }
    notes.notRun = engines.filter((engine) => !runs.some((run) => run.engine === engine));
    notes.serverStopped = stopped;
    writeFileSync(join(out, 'summary.json'), `${JSON.stringify(notes, null, 2)}\n`);
    // the fence, checked: nothing written here holds a code, a token or the admin token
    for (const file of readdirSync(out).filter((name) => name.endsWith('.json'))) {
      const text = readFileSync(join(out, file), 'utf8');
      for (const secret of secrets)
        assert.equal(text.includes(secret), false, `${file} holds a secret`);
    }
  }
  const passed =
    runs.length === engines.length && runs.every((run) => run.result === 'pass') && !notes.error;
  console.log(JSON.stringify(notes.runs.concat(notes.error ? [{ error: notes.error }] : [])));
  process.exitCode = passed ? 0 : 1;
}

await main();
