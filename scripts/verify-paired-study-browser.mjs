#!/usr/bin/env node
/* global document, setTimeout, fetch, URL */
/** The paired study host on a built site, in real browsers, against a local study server (ENGINE-ONE.3, layer 5b).
 *
 * Not part of CI: it needs a built Bunki site and a study server on this machine. It serves the site on a loopback
 * port, and for each engine (Chromium, WebKit) and each width (390, 1440) it shows that
 *   - a profile that was never paired still gets the old player on the ordinary route `?deck=n2`;
 *   - a one-time connect link, confirmed with one click, pairs the browser, and Settings says it is connected;
 *   - the same ordinary route (no `sharedStudy` in the address) then opens the shared study engine, with no
 *     "Sync is not set up" and no "Trial copy";
 *   - a grade made in Bunki arrives at a second device of the same learner, and a grade made there arrives in Bunki;
 *   - the same holds through a time with no connection and through a restart of the browser.
 * The second device is the engine's own store and sync client driven from Node (tools/support/paired-study-proof.mjs),
 * which shares none of Bunki's host code. Receipts: `<out>/receipt.json` and screenshots under `<out>/shots/`.
 *
 * The server, one of:
 *   --server-command "<cmd>"  start the Nihongo Study repository's local server (tests/worker/study-origin-server.mjs)
 *                             with this command and read the JSON object it prints: baseUrl (https on loopback, a
 *                             self-signed certificate, which the browsers here are told to accept), httpUrl,
 *                             environment, learner, devices [{ installation, code }], adminToken. `{origin}` in
 *                             the command is replaced by the site's origin, which the server must list. Give the
 *                             command as one program with its arguments (no `cd`, no `&&`), with --server-cwd for
 *                             its folder and its environment exported beforehand: the stop signal then reaches it.
 *   --server-json <file>      the same JSON object, saved from a server someone else started (its `server.json`)
 *   --server double           the stand-in of tools/support/study-server-double.mjs (a rehearsal, not layer 5b)
 * Devices: the first `bunkiweb-` device of the JSON pairs the first browser run, the first device of another kind
 * (`iphone-…`) is the second device. Every further run gets a fresh `bunkiweb-` code minted with the run's admin
 * token (`POST /v1/pair/code`); without a token the later runs are listed as not run.
 *
 * Fences, in code: only a loopback server and a `test-` learner are accepted; the browsers may reach the site and
 * the server and nothing else; the site's port is never 18841, 19610 or 19612; no code, admin token or credential
 * is written to the receipt or printed.
 *
 * Usage:
 *   node scripts/verify-paired-study-browser.mjs --site <built site> --out <fresh folder under ~/.dharma> \
 *     (--server-command "<cmd>" [--server-cwd <folder>] | --server-json <file> | --server double) \
 *     [--site-port 18930] [--site-host 127.0.0.1] [--engines chromium,webkit] [--widths 390,1440] [--server-wait 120] */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { startStaticHost } from '../prototypes/bunki-desktop/lib/static-host.cjs';
import { startStudyServerDouble } from '../tools/support/study-server-double.mjs';
import {
  createEngineClient,
  frameState,
  gradeInFrame,
  loadStudyContent,
  connectByLink,
  connectPayload,
  readablePlaces,
  studyBlock,
  studyFrame,
  waitForReview,
  wake,
} from '../tools/support/paired-study-proof.mjs';

const LOOPBACK = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/;
const PLAIN_LOOPBACK = /^http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/;
const STUDY_DEVICE = /^bunkiweb-[a-f0-9]{32}$/;
const CODE = /^[A-F0-9]{12}$/;
const OWNERS_PORTS = new Set([18841, 19610, 19612]);
const FLAGS = new Set([
  '--site',
  '--out',
  '--site-port',
  '--site-host',
  '--server',
  '--server-command',
  '--server-cwd',
  '--server-json',
  '--engines',
  '--widths',
  '--server-wait',
]);
const USAGE =
  'Usage: node scripts/verify-paired-study-browser.mjs --site <built site> --out <fresh folder under ~/.dharma> ' +
  '(--server-command "<cmd>" [--server-cwd <folder>] | --server-json <file> | --server double) ' +
  '[--site-port 18930] [--site-host 127.0.0.1] [--engines chromium,webkit] [--widths 390,1440] [--server-wait 120]';

function usage(message) {
  if (message) console.error(message);
  console.error(USAGE);
  process.exit(2);
}
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  const value = process.argv[index + 1];
  if (!FLAGS.has(flag) || value === undefined || args.has(flag))
    usage(`Unexpected argument: ${flag ?? ''}`);
  args.set(flag, value);
}
const site = args.has('--site') ? resolve(args.get('--site')) : null;
const out = args.has('--out') ? resolve(args.get('--out')) : null;
if (!site || !out) usage('--site and --out are required.');
if (!existsSync(join(site, 'index.html')) || !existsSync(join(site, 'shared-study-boot.mjs')))
  usage('The site has no index.html or no shared-study-boot.mjs: build this branch first.');
if (!out.startsWith(join(homedir(), '.dharma') + sep))
  usage('Evidence goes to a folder under ~/.dharma.');
if (existsSync(out)) usage('The evidence folder exists already: choose a fresh one.');
const sitePort = Number(args.get('--site-port') ?? 18930);
if (
  !Number.isInteger(sitePort) ||
  sitePort < 1024 ||
  sitePort > 65535 ||
  OWNERS_PORTS.has(sitePort)
)
  usage('The site port is a free port from 1024 to 65535, and never 18841, 19610 or 19612.');
const siteHost = args.get('--site-host') ?? '127.0.0.1';
if (!['localhost', '127.0.0.1'].includes(siteHost)) usage('--site-host is 127.0.0.1 or localhost.');
const modes = ['--server', '--server-command', '--server-json'].filter((flag) => args.has(flag));
if (modes.length !== 1 || (args.has('--server') && args.get('--server') !== 'double'))
  usage('Name the server once: --server-command, --server-json, or --server double.');
if (args.has('--server-cwd') && !args.has('--server-command'))
  usage('--server-cwd goes with --server-command.');
const engines = (args.get('--engines') ?? 'chromium,webkit').split(',').filter(Boolean);
const widths = (args.get('--widths') ?? '390,1440').split(',').map(Number);
if (!engines.length || engines.some((name) => !['chromium', 'webkit'].includes(name)))
  usage('--engines names chromium, webkit or both.');
if (
  !widths.length ||
  widths.some((width) => !Number.isInteger(width) || width < 320 || width > 3840)
)
  usage('--widths are whole numbers of pixels.');
const serverWaitMs = Number(args.get('--server-wait') ?? 120) * 1000;
const siteOrigin = `http://${siteHost}:${sitePort}`;

const receipt = {
  kind: 'bunki-paired-study-browser-proof/v1',
  startedAt: new Date().toISOString(),
  site,
  siteOrigin,
  servers: [],
  runs: [],
  notRun: [],
  engineEvents: [],
  errors: [],
  result: 'running',
};
const hex = (bytes) => randomBytes(bytes).toString('hex');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(holds, what, { timeout = 60000, every = 200 } = {}) {
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

/** Start or adopt the server. Resolves { mode, browserUrl, nodeUrl, learner, environment, second, nextStudyDevice, stop }. */
async function openServer() {
  if (args.has('--server')) {
    const double = await startStudyServerDouble({ allowedOrigins: [siteOrigin] });
    return {
      mode: 'stand-in',
      browserUrl: double.origin,
      nodeUrl: double.origin,
      learner: double.learner,
      environment: double.environment,
      second: double.mint({ installation: `iphone-${hex(16)}` }),
      nextStudyDevice: async () => double.mint(),
      stop: () => double.close(),
    };
  }
  let report = null;
  let stop = async () => true;
  if (args.has('--server-json')) {
    report = JSON.parse(readFileSync(resolve(args.get('--server-json')), 'utf8'));
  } else {
    const command = args.get('--server-command').replaceAll('{origin}', siteOrigin);
    // one program with its arguments is run in the shell's place, so that the stop signal reaches the server itself
    const simple = !/[;&|<>]|\bcd\b/.test(command);
    const child = spawn(simple ? `exec ${command}` : command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NSRS_STUDY_ORIGINS: siteOrigin },
      ...(args.has('--server-cwd') ? { cwd: resolve(args.get('--server-cwd')) } : {}),
    });
    let exited = null;
    child.on('exit', (code, signal) => (exited = { code, signal }));
    // the output carries pairing codes and an admin token: it is read here and never written down
    let text = '';
    let noise = '';
    child.stdout.on('data', (chunk) => (text += chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => (noise = (noise + chunk.toString('utf8')).slice(-600)));
    // only this one process is signalled, by its own handle, and only while it is still the one that was started
    stop = async () => {
      if (exited === null) child.kill('SIGTERM');
      await until(() => exited !== null, 'the server command ended', { timeout: 20000 }).catch(
        () => {},
      );
      return exited !== null;
    };
    try {
      await until(
        () => {
          assert(
            exited === null,
            `the server command ended early (${JSON.stringify(exited)}): ${noise.replace(/\s+/g, ' ').slice(-300)}`,
          );
          report = reportIn(text);
          return report !== null;
        },
        'the server command printed its JSON report',
        { timeout: serverWaitMs },
      );
    } catch (error) {
      await stop();
      throw error;
    }
  }
  const nodeUrl = report.httpUrl;
  const browserUrl = report.baseUrl || report.httpUrl;
  assert(
    PLAIN_LOOPBACK.test(nodeUrl || ''),
    'the report has no plain-http loopback address (httpUrl)',
  );
  assert(
    LOOPBACK.test(browserUrl || ''),
    'the report has no loopback address for the browser (baseUrl)',
  );
  const devices = (report.devices || []).filter(
    (device) => typeof device?.installation === 'string' && CODE.test(device?.code || ''),
  );
  const study = devices.filter((device) => STUDY_DEVICE.test(device.installation));
  const second = devices.find((device) => !/^bunki(?:web)?-/.test(device.installation)) ?? null;
  const admin = typeof report.adminToken === 'string' ? report.adminToken : null;
  return {
    mode: args.has('--server-command') ? 'local-server-command' : 'local-server-json',
    browserUrl,
    nodeUrl,
    learner: report.learner,
    environment: report.environment,
    second,
    /** The next `bunkiweb-` device with an unused code: one the server printed, then fresh ones from the admin. */
    async nextStudyDevice() {
      if (study.length) return study.shift();
      if (!admin) return null;
      const scope = {
        environment: report.environment,
        learner: report.learner,
        installation: `bunkiweb-${hex(16)}`,
      };
      const response = await fetch(`${nodeUrl}/v1/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ scope }),
      });
      assert.equal(response.status, 200, `the server minted no further code: ${response.status}`);
      const minted = await response.json();
      return { installation: minted.scope.installation, code: minted.code };
    },
    stop,
  };
}

const shotsDir = join(out, 'shots');
async function shot(page, name) {
  const path = join(shotsDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function main() {
  mkdirSync(shotsDir, { recursive: true });
  const { chromium, webkit } = createRequire(import.meta.url)('playwright-core');
  const launchers = { chromium, webkit };
  const host = await startStaticHost({ site, port: sitePort });
  let server = null;
  let second = null;
  const stopServer = async () => {
    const stopped = await Promise.resolve(server.stop()).catch(() => false);
    receipt.servers.at(-1).stopped = stopped !== false;
    server = null;
  };
  // the one-time connect link the learner's own tools open for him
  const linkFor = (device) =>
    connectPayload({
      code: device.code,
      learner: server.learner,
      installation: device.installation,
      server: server.browserUrl,
      environment: server.environment,
    });
  const connectIn = async (page, device) => {
    const answer = await connectByLink(page, page.url().replace(/#.*$/u, ''), linkFor(device));
    return { paired: answer.state === 'connected', refused: answer.refused, note: answer.note };
  };
  try {
    for (const engine of engines) {
      // A server this starts is started afresh for each engine, with a fresh learner: a learner's new cards are 20 a
      // day shared by all its devices (past them the server refuses, 'daily-permit-budget'), and one engine's two
      // widths spend all 20, Bunki and the second device each asking for five at a time as the engine's own app does.
      // A server given by its report (--server-json) is adopted once.
      if (server && !args.has('--server-json')) await stopServer();
      if (!server) {
        server = await openServer();
        receipt.servers.push({
          engine,
          mode: server.mode,
          address: server.browserUrl,
          learner: server.learner,
          environment: server.environment,
        });
        assert(server.browserUrl !== siteOrigin, 'the server and the site are different addresses');
        assert(
          /^test-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(server.learner || ''),
          'only a test- learner is paired here',
        );
        // the second device of the same learner: the engine's own client, from Node, a client that is no page
        assert(server.second, 'the server gave no device for the second client');
        second = await createEngineClient({
          content: loadStudyContent(site),
          server: server.nodeUrl,
          learner: server.learner,
          environment: server.environment,
          installation: server.second.installation,
          code: server.second.code,
        });
        receipt.servers.at(-1).secondDevice = {
          installation: second.scope.installation,
          kind: 'the engine’s store and sync client, from Node',
        };
      }
      let pairedProfile = null;
      for (const width of widths) {
        const run = { engine, width, checks: [], shots: [], pageErrors: [], result: 'running' };
        receipt.runs.push(run);
        const check = (name, detail = null) =>
          run.checks.push(detail === null ? { name } : { name, detail });
        const viewport = { width, height: width < 600 ? 844 : 900 };
        const tag = `${engine}-${width}`;
        const open = async (folder) => {
          const context = await launchers[engine].launchPersistentContext(folder, {
            headless: true,
            viewport,
            serviceWorkers: 'block',
            // the local server's https address has a certificate it made for itself
            ignoreHTTPSErrors: true,
          });
          await context.route('**/*', (route) =>
            [siteOrigin, server.browserUrl].some((origin) =>
              route.request().url().startsWith(`${origin}/`),
            )
              ? route.continue()
              : route.abort(),
          );
          return context;
        };
        const seen = { requests: [], printed: [], token: null };
        const watch = (page) => {
          page.on('request', (request) =>
            seen.requests.push({ url: request.url(), headers: request.headers() }),
          );
          page.on('console', (message) => seen.printed.push(message.text()));
          page.on('pageerror', (error) => run.pageErrors.push(String(error.message).slice(0, 300)));
          // the credential is read here once, to prove it is nowhere it should not be; it is never written down
          page.on('response', (response) => {
            if (response.url() === `${server.browserUrl}/v1/pair` && response.status() === 200)
              response.json().then(
                (body) => (seen.token = typeof body?.token === 'string' ? body.token : seen.token),
                () => {},
              );
          });
        };
        /** Open an address and wait for the app. A renderer that never answers is an engine event: it is recorded
         * and the step retried in a fresh page, at most twice; it is never taken for the app's own answer. */
        const visit = async (context, address) => {
          for (let attempt = 0; ; attempt++) {
            const page = await context.newPage();
            watch(page);
            try {
              await page.goto(address, { waitUntil: 'load', timeout: 45000 });
              await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
                timeout: 45000,
              });
              return page;
            } catch (error) {
              receipt.engineEvents.push({
                engine,
                width,
                address,
                attempt,
                message: String(error.message).slice(0, 200),
              });
              await page.close().catch(() => {});
              if (attempt >= 2) throw error;
            }
          }
        };
        /** Me, then its Settings door, then the study block. */
        const openSettings = async (context) => {
          const page = await visit(context, `${siteOrigin}/?room=me&ui=en`);
          await page.locator('#me-settings').first().click({ timeout: 30000 });
          const block = await studyBlock(page);
          // LEAN (2026-11-22): Settings shows Nihongo Study only while this device is connected
          if (block.state !== 'unpaired') await page.locator('#settings-study-device').scrollIntoViewIfNeeded();
          return { page, block };
        };
        const deck = `${siteOrigin}/?deck=n2&ui=en`;
        try {
          // 1. a profile that was never paired: the old player, nothing bound, not a word to the server
          {
            const context = await open(join(out, `${tag}-unpaired-profile`));
            try {
              const page = await visit(context, deck);
              await page.locator('.kp').first().waitFor({ timeout: 45000 });
              assert.equal(await page.locator('[data-shared-study-frame]').count(), 0);
              assert.equal(
                await page.evaluate(() => typeof globalThis.bunkiSharedStudyHost),
                'undefined',
              );
              assert.equal(
                seen.requests.some((request) => request.url.startsWith(`${server.browserUrl}/`)),
                false,
              );
              run.shots.push(await shot(page, `${tag}-1-unpaired-old-player`));
              check(
                'an unpaired profile gets the old player on ?deck=n2, and asks the server nothing',
              );
            } finally {
              await context.close();
            }
          }

          // 2. pair in Settings; when no code is left for this run, the engine's earlier pairing is used
          const device = await server.nextStudyDevice();
          if (!device && !pairedProfile) {
            run.result = 'not-run';
            receipt.notRun.push({ engine, width, why: 'no pairing code for this run' });
            continue;
          }
          const profile = device ? join(out, `${tag}-profile`) : pairedProfile;
          let context = await open(profile);
          let { page, block } = await openSettings(context);
          if (device) {
            assert.equal(block.state, 'unpaired');
            run.shots.push(await shot(page, `${tag}-2-settings-unpaired`));
            let paired = await connectIn(page, device);
            if (paired.refused === 'too-many-attempts') {
              // the server counts pairing calls by the minute: wait the minute out, once
              check('the server asked for a pause between pairings; waited a minute');
              await sleep(61000);
              paired = await connectIn(page, device);
            }
            assert.equal(paired.paired, true, `pairing was refused: ${paired.refused}`);
            check('a connect link and one click on Connect pair the browser', {
              said: paired.note,
            });
            pairedProfile = profile;
            await page.close();
            ({ page, block } = await openSettings(context));
          } else check('this width uses the profile this engine paired at an earlier width');
          assert.equal(block.state, 'paired');
          assert.equal(block.bound, 'true');
          run.shots.push(await shot(page, `${tag}-3-settings-paired`));
          check('Settings says whose record this device studies on', { said: block.status });
          await page.close();

          // 3. the ordinary route opens the engine on the paired record
          page = await visit(context, deck);
          assert.equal(new URL(page.url()).searchParams.has('sharedStudy'), false);
          let frame = await studyFrame(page);
          let state = await frameState(frame);
          assert.equal(state.learner, server.learner);
          assert.match(state.installation, STUDY_DEVICE);
          if (device) assert.equal(state.installation, device.installation);
          const installation = state.installation;
          assert.equal(/Sync is not set up|同期は未設定/.test(state.text), false);
          assert.equal(/Trial copy|試しの写し/.test(await page.locator('body').innerText()), false);
          run.shots.push(await shot(page, `${tag}-4-deck-n2-engine`));
          check(
            '?deck=n2 opens the shared study engine, with no "Sync is not set up" and no "Trial copy"',
            {
              installation,
              oldPlayerNodes: await page.locator('.kp').count(),
            },
          );

          // 4. a grade crosses both ways
          const exchange = async (label) => {
            const mine = await gradeInFrame(frame);
            await until(async () => {
              await second.sync();
              return second.reviews().some((review) => review.id === mine.eventId);
            }, `${label}: Bunki's grade at the second device`);
            const theirs = await second.gradeNew('n2', 4);
            await waitForReview(page, frame, theirs.eventId);
            check(
              `${label}: a grade made in Bunki arrives at the second device, and one made there arrives in Bunki`,
              {
                fromBunki: mine.eventId,
                fromSecondDevice: theirs.eventId,
                cardsPassedOver: mine.passedOver,
              },
            );
          };
          await exchange('online');
          run.shots.push(await shot(page, `${tag}-5-after-exchange`));

          // 5. a time with no connection: both sides grade, and both grades cross when it is back. The card this screen
          // shows next is the one the second device graded in 4; the engine refuses it and Bunki takes the next card
          // (see gradeInFrame). The second device grades a card of another word: two grades of one card made apart
          // keep only the first to reach the server (see gradeNew)
          await context.setOffline(true);
          await page.waitForFunction(() => globalThis.navigator.onLine === false);
          const offline = await gradeInFrame(frame);
          state = await frameState(frame);
          assert.ok(state.pending >= 1);
          const away = await second.gradeNew('n2', 3, { except: [offline.taskKey] });
          run.shots.push(await shot(page, `${tag}-6-offline`));
          await context.setOffline(false);
          await until(async () => {
            await wake(page);
            await second.sync();
            return second.reviews().some((review) => review.id === offline.eventId);
          }, 'the offline grade at the second device once the connection is back');
          await waitForReview(page, frame, away.eventId);
          await until(async () => (await frameState(frame)).pending === 0, 'nothing left unsent');
          check('through a time with no connection: both grades cross once it is back', {
            fromBunki: offline.eventId,
            fromSecondDevice: away.eventId,
            cardsPassedOver: offline.passedOver,
          });

          // 6. a restart of the browser keeps the installation and the journal
          const before = await frameState(frame);
          await context.close();
          context = await open(profile);
          page = await visit(context, deck);
          frame = await studyFrame(page);
          state = await frameState(frame);
          assert.equal(state.installation, installation);
          for (const id of before.reviews)
            assert.ok(state.reviews.includes(id), `lost over the restart: ${id}`);
          await exchange('after a restart');
          run.shots.push(await shot(page, `${tag}-7-after-restart`));
          check('a restart of the browser keeps the installation and the journal', {
            installation,
            reviews: state.reviews.length,
          });

          // the credential is nowhere a script, an address or a log can read it
          const places = await readablePlaces(page);
          assert.equal(places.device?.sealed?.extractable, false);
          if (seen.token) {
            for (const text of [
              places.device.plain,
              places.device.sealed.bytesAsText,
              places.cookie,
              JSON.stringify(places.localStorage),
              seen.printed.join('\n'),
            ])
              assert.equal(text.includes(seen.token), false);
            for (const request of seen.requests) {
              assert.equal(request.url.includes(seen.token), false);
              if (request.headers.authorization)
                assert.ok(request.url.startsWith(`${server.browserUrl}/`), request.url);
            }
            check(
              'the credential is in no address, log, cookie or localStorage, and goes to the server alone',
            );
          } else
            check(
              'this run did not see the credential (paired at an earlier width); its device record is sealed',
            );
          await context.close();
          run.result = 'passed';
        } catch (error) {
          run.result = 'failed';
          run.error = String(error?.stack || error).slice(0, 2000);
          throw error;
        }
      }
    }
    receipt.result = receipt.notRun.length ? 'partial' : 'passed';
  } finally {
    if (server) await stopServer();
    await host.close();
  }
}

try {
  await main();
} catch (error) {
  receipt.result = 'failed';
  receipt.errors.push(String(error?.stack || error).slice(0, 2000));
}
receipt.finishedAt = new Date().toISOString();
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  JSON.stringify({
    result: receipt.result,
    server: receipt.servers[0]?.mode ?? null,
    runs: receipt.runs.map((run) => `${run.engine}-${run.width}:${run.result}`),
    notRun: receipt.notRun.length,
    receipt: join(out, 'receipt.json'),
  }),
);
process.exit(receipt.result === 'passed' ? 0 : receipt.result === 'partial' ? 3 : 1);
