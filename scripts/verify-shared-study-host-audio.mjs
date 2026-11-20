#!/usr/bin/env node
/** Actual ordinary Corridor route + admitted synthetic AAC. Real decode, silent output.
 * No provider, production publication, learner profile, or parallel study UI. */
/* global URL, window, crypto, Storage, IDBObjectStore, document, structuredClone, frameElement, AbortController */
/* global __bunkiAudioProbe, bunkiSharedStudy, __bunkiAudioBridgeProbe, __qaAbortRead, __qaReadResult, bunkiSharedStudyHost */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBunkiAudioFixture } from './shared-study-audio-fixture.mjs';

const repo = resolve(
  process.env.BUNKI_SOURCE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'),
);
const baseSite = process.env.BUNKI_QA_BASE,
  engineExport = process.env.BUNKI_ENGINE_EXPORT,
  mediaDirectory = process.env.BUNKI_AUDIO_MEDIA,
  output = process.env.BUNKI_AUDIO_OUT,
  expectedClosure = process.env.BUNKI_QA_ENGINE_CLOSURE;
assert(
  baseSite && engineExport && mediaDirectory && output && expectedClosure,
  'Explicit QA source/export/media/output/closure required',
);
assert(
  resolve(output).startsWith('/Users/dhyana/.dharma/'),
  'Runtime must be external under ~/.dharma',
);
assert(!existsSync(output), 'Fresh runtime required');
mkdirSync(output, { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixture = await createBunkiAudioFixture({
  repo,
  engineExport,
  mediaDirectory,
  output: join(output, 'fixture'),
  expectedClosure,
});
const source = join(repo, 'prototypes/corridor'),
  runId = `audio-${Date.now()}`;
const overlays = [
  'corridor.js',
  'study-engine-adapter.mjs',
  'shared-study-runtime.mjs',
  'shared-study-test-host.mjs',
  'shared-study-sync.mjs',
  'shared-study-storage.mjs',
  'shared-study-content.mjs',
  'decks/player/shared-mount.mjs',
  'decks/player/shared-frame.mjs',
];
const baseline = process.env.BUNKI_AUDIO_BASELINE === '1';
const baselineRef = 'ea0279210';
const overlayBytes = new Map(
  overlays.map((path) => [
    path,
    baseline && ['decks/player/shared-mount.mjs', 'decks/player/shared-frame.mjs'].includes(path)
      ? execFileSync('git', ['show', `${baselineRef}:prototypes/corridor/${path}`], { cwd: repo })
      : readFileSync(join(source, path)),
  ]),
);
let html = readFileSync(join(baseSite, 'index.html'), 'utf8');
assert.match(html, /shared-study-test-bootstrap\.mjs/);
html = html
  .replace('shared-study-test-bootstrap.mjs', 'shared-study-audio-proof-bootstrap.mjs')
  .replace(/(<meta name="bunki-shared-study-qa-run" content=")[^"]+/, `$1${runId}`);
const bootstrap = `import {createSharedStudyTestHost,QA_HOST_MARKER} from './shared-study-test-host.mjs';
import {createHttpAudioResources} from './vendor/shared-study-engine/client/app/audio-resources.mjs';
import {createAudioReleaseReader} from './vendor/shared-study-engine/client/app/audio-release.mjs';
const fixture=await fetch('./__qa_audio_fixture.json').then(r=>{if(!r.ok)throw Error('qa-audio-fixture-missing');return r.json();});
const marker=document.querySelector('meta[name="bunki-shared-study-qa"]')?.content;
if(marker!==QA_HOST_MARKER)throw Error('qa-audio-marker-required');
const release=fixture.release,admitted=createHttpAudioResources({origin:location.origin,release});
const inspector=createAudioReleaseReader({capability:{protocol:'nsrs-audio-resources/v1',release,resources:admitted}});
await inspector.inspectPack(fixture.packId);await inspector.dispose();
globalThis.__bunkiAudioBridgeProbe={realmChecks:[],views:[],pending:[],holdMedia:false,lateReturns:0};
const resources={packState:id=>admitted.packState(id),async read(ref,options){
 const probe=globalThis.__bunkiAudioBridgeProbe,local=Object.getPrototypeOf(ref)===Object.prototype;
 probe.realmChecks.push(local);if(!local)throw Error('qa-parent-descriptor-realm');
 const bytes=await admitted.read(ref,options),padding=new Uint8Array(bytes.length+11);padding.fill(173);padding.set(bytes,4);
 const view=padding.subarray(4,4+bytes.length);probe.views.push({key:ref.key,offset:view.byteOffset,length:view.byteLength,total:padding.byteLength});
 if(probe.holdMedia&&ref.key.endsWith('.m4a'))return new Promise(resolve=>probe.pending.push({signal:options?.signal,release(){probe.lateReturns++;resolve(view);}}));
 return view;
}};
const audio={protocol:'nsrs-audio-resources/v1',release,resources};
const host=await createSharedStudyTestHost({marker,runId:${JSON.stringify(runId)},audio});
globalThis.bunkiSharedStudyHost=host;globalThis.__bunkiAudioFixture=fixture;
addEventListener('pagehide',()=>host.dispose(),{once:true});await import('./corridor.js');`;
writeFileSync(join(output, 'derived-index.html'), html);
writeFileSync(join(output, 'audio-bootstrap.mjs'), bootstrap);
const sourcePins = overlays.map((path) => ({ path, sha256: sha(overlayBytes.get(path)) }));
const receipt = {
  kind: 'actual-bunki-route-source-bound-silent-aac',
  catalogFixture: false,
  audioFixture: true,
  sourceRoot: repo,
  baseSite: realpathSync(baseSite),
  engineExport: realpathSync(engineExport),
  engineClosure: expectedClosure,
  taskKey: fixture.taskKey,
  release: fixture.release,
  sourcePlan: fixture.sourcePlan,
  sourcePins,
  indexSha256: sha(Buffer.from(html)),
  bootstrapSha256: sha(Buffer.from(bootstrap)),
  checks: [],
  errors: [],
  requests: [],
  physicalAudibility: false,
  speech: false,
  providerCalls: false,
  packPersistence: 'nonpersistent-http-capability',
};
if (baseline)
  receipt.negativeControl = {
    baselineRef,
    expected: 'unsupported-capability',
    bridgeFilesOnly: true,
  };
const mime = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.gz': 'application/octet-stream',
  '.m4a': 'audio/mp4',
};
const safeFile = (root, key) => {
  const segments = key.split('/');
  assert(
    segments.every((s) => s && s !== '.' && s !== '..' && !s.startsWith('.')),
    'Unsafe QA path',
  );
  let path = resolve(root);
  assert.equal(realpathSync(path), path, 'No symlink QA root');
  for (const part of segments) {
    path = join(path, part);
    assert(!lstatSync(path).isSymbolicLink(), 'No symlink QA resource');
  }
  assert(lstatSync(path).isFile(), 'Regular QA resource required');
  return path;
};
const prefix = `audio/v2/${fixture.release.root.sha256}/`;
const server = createServer((req, res) => {
  try {
    assert(['GET', 'HEAD'].includes(req.method), 'Read-only QA host');
    const path =
      decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') ||
      'index.html';
    // eslint-disable-next-line no-control-regex -- Reject ASCII controls in decoded resource paths.
    assert(!/[\\\x00-\x1f]/u.test(path));
    let bytes, type;
    if (path === 'index.html') {
      bytes = Buffer.from(html);
      type = 'text/html';
    } else if (path === 'shared-study-audio-proof-bootstrap.mjs') {
      bytes = Buffer.from(bootstrap);
      type = 'text/javascript';
    } else if (path === '__qa_audio_fixture.json') {
      bytes = Buffer.from(JSON.stringify(fixture));
      type = 'application/json';
    } else {
      let file;
      if (path.startsWith(prefix))
        file = safeFile(join(output, 'fixture/pack'), path.slice(prefix.length));
      else if (path.startsWith('vendor/shared-study-engine/'))
        file = safeFile(engineExport, path.slice('vendor/shared-study-engine/'.length));
      else if (overlayBytes.has(path)) {
        bytes = overlayBytes.get(path);
        type = mime[extname(path)];
      } else file = safeFile(baseSite, path);
      if (file) {
        bytes = readFileSync(file);
        type = mime[extname(file)] || 'application/octet-stream';
      }
    }
    if (path.startsWith(prefix)) receipt.requests.push(path);
    res.writeHead(200, {
      'content-type': type,
      'content-length': bytes.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://localhost:${server.address().port}`;
const { chromium } = createRequire(join(process.env.BUNKI_DEPENDENCY_ROOT || repo, 'package.json'))(
  'playwright-core',
);
let context, page;
try {
  context = await chromium.launchPersistentContext(join(output, 'synthetic-profile'), {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--mute-audio'],
    serviceWorkers: 'block',
    viewport: { width: 1200, height: 850 },
  });
  receipt.browser = context.browser().version();
  await context.route('**/*', (route) =>
    route
      .request()
      .url()
      .startsWith(origin + '/')
      ? route.continue()
      : route.abort(),
  );
  await context.addInitScript(() => {
    globalThis.__bunkiAudioProbe = {
      decodes: [],
      starts: [],
      ends: [],
      stops: [],
      muted: 0,
      durations: [],
      legacy: [],
    };
    const Base = window.AudioContext || window.webkitAudioContext;
    class SilentContext extends Base {
      constructor(...args) {
        super(...args);
        const p = globalThis.__bunkiAudioProbe;
        const mute = this.createGain();
        mute.gain.value = 0;
        mute.connect(this.destination);
        const decode = this.decodeAudioData.bind(this),
          create = this.createBufferSource.bind(this);
        this.decodeAudioData = (bytes, done, failed) => {
          const flight = (async () => {
            const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('');
            const buffer = await decode(bytes);
            buffer.__qaDigest = digest;
            p.decodes.push(digest);
            p.durations.push(buffer.duration);
            done?.(buffer);
            return buffer;
          })();
          if (failed) flight.catch(failed);
          return flight;
        };
        this.createBufferSource = () => {
          const node = create(),
            connect = node.connect.bind(node),
            start = node.start.bind(node),
            stop = node.stop.bind(node);
          node.connect = (destination, ...args) => {
            if (destination === this.destination) {
              p.muted++;
              return connect(mute, ...args);
            }
            return connect(destination, ...args);
          };
          node.start = (...args) => {
            p.starts.push(node.buffer.__qaDigest);
            return start(...args);
          };
          node.stop = (...args) => {
            p.stops.push(node.buffer.__qaDigest);
            return stop(...args);
          };
          node.addEventListener('ended', () => p.ends.push(node.buffer.__qaDigest));
          return node;
        };
      }
    }
    window.AudioContext = SilentContext;
    window.webkitAudioContext = SilentContext;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('bunki-cloze:') || key === 'kairo-corridor-v1')
        __bunkiAudioProbe.legacy.push({ type: 'localStorage', key });
      return set.call(this, key, value);
    };
    for (const method of ['put', 'add', 'delete', 'clear']) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args) {
        if (
          !this.transaction.db.name.startsWith('bunki-shared-study-qa-') &&
          this.transaction.db.name !== 'nsrs-private-audio-demand-v1'
        )
          __bunkiAudioProbe.legacy.push({
            type: 'indexedDB',
            database: this.transaction.db.name,
            method,
          });
        return original.apply(this, args);
      };
    }
  });
  page = await context.newPage();
  page.on('pageerror', (e) => receipt.errors.push(e.message));
  async function mount() {
    await page.locator('[data-shared-study-frame]').waitFor({ timeout: 90000 });
    const frame = await (
      await page.locator('[data-shared-study-frame]').elementHandle()
    ).contentFrame();
    await frame.waitForFunction(
      () => !!window.bunkiSharedStudy || !!document.querySelector('[role=alert]'),
      null,
      { timeout: 90000 },
    );
    assert(
      await frame.evaluate(() => !!window.bunkiSharedStudy),
      await frame.locator('body').innerText(),
    );
    assert.equal(await frame.evaluate(() => bunkiSharedStudy.app.read().module), 'n2');
    return frame;
  }
  const journal = (frame) => frame.evaluate(() => bunkiSharedStudy.store.readState());
  const probe = (frame) => frame.evaluate(() => structuredClone(__bunkiAudioProbe));
  const select = async (frame, practice = false) =>
    frame.evaluate(
      ({ key, practice }) => {
        const e = bunkiSharedStudy.catalog.find((e) => e.taskKey === key);
        if (!e) throw Error('Bound task absent');
        bunkiSharedStudy.app.showTask(e, practice);
        return bunkiSharedStudy.app.read().current.entry;
      },
      { key: fixture.taskKey, practice },
    );
  await page.goto(`${origin}/?deck=n2&ui=en`, { waitUntil: 'domcontentloaded' });
  let frame = await mount();
  assert.equal(new URL(page.url()).searchParams.has('sharedStudy'), false);
  await frame.locator('[data-start]:not(:disabled)').click();
  const mounted = await frame.evaluate(() => bunkiSharedStudy.app.read().current.entry);
  assert.deepEqual(mounted, fixture.entry);
  const localSource = await frame.evaluate(() => {
    const e = bunkiSharedStudy.app.read().current.entry;
    return {
      record: Object.getPrototypeOf(e) === Object.prototype,
      ruby: !e.rubySegments || Object.getPrototypeOf(e.rubySegments) === Array.prototype,
    };
  });
  if (!baseline) assert.deepEqual(localSource, { record: true, ruby: true });
  const before = await journal(frame),
    legacy = await page.evaluate(() => structuredClone(__bunkiAudioProbe.legacy));
  const preFrontRequests = receipt.requests.filter((path) => path.endsWith('.m4a')).length;
  await frame.locator('[data-card]').focus();
  await page.keyboard.press('p');
  await page.waitForTimeout(100);
  assert.equal((await probe(frame)).starts.length, 0);
  assert.equal((await probe(frame)).decodes.length, 0);
  assert.equal(receipt.requests.filter((path) => path.endsWith('.m4a')).length, preFrontRequests);
  receipt.checks.push('front-P-cannot-request-or-play-answer-audio-after-explicit-pack-admission');
  await frame.locator('[data-reveal]').click();
  await frame
    .locator('[data-study-audio]:not(:disabled)')
    .waitFor({ timeout: baseline ? 5000 : 15000 });
  const unauthorizedBefore = receipt.requests.length;
  const denied = await frame.evaluate(async () => {
    try {
      await frameElement.bunkiStudyPort.audio.read({
        key: 'media/not-admitted.m4a',
        sha256: '0'.repeat(64),
        bytes: 1,
      });
      return { denied: false };
    } catch (error) {
      return { denied: true, message: error.message };
    }
  });
  assert.equal(denied.denied, true);
  assert.equal(receipt.requests.length, unauthorizedBefore);
  receipt.unauthorizedRead = denied;
  receipt.checks.push('parent-canonical-resource-admission-refuses-unknown-key-without-request');
  const rootManifest = JSON.parse(readFileSync(join(output, 'fixture/pack/root.json')));
  const clipRef = rootManifest.clipShards.flatMap(
    (shard) => JSON.parse(readFileSync(join(output, 'fixture/pack', shard.ref.key))).rows,
  )[0].ref;
  await page.evaluate(() => (__bunkiAudioBridgeProbe.holdMedia = true));
  await frame.evaluate((ref) => {
    const controller = new AbortController();
    globalThis.__qaAbortRead = () => controller.abort();
    globalThis.__qaReadResult = frameElement.bunkiStudyPort.audio
      .read(ref, { signal: controller.signal })
      .then(
        () => ({ ok: true }),
        (error) => ({ ok: false, name: error.name, message: error.message }),
      );
  }, clipRef);
  await page.waitForFunction(() => __bunkiAudioBridgeProbe.pending.length === 1);
  await frame.evaluate(() => __qaAbortRead());
  assert.equal(await page.evaluate(() => __bunkiAudioBridgeProbe.pending[0].signal.aborted), true);
  await page.evaluate(() => {
    __bunkiAudioBridgeProbe.holdMedia = false;
    for (const held of __bunkiAudioBridgeProbe.pending.splice(0)) held.release();
  });
  const aborted = await frame.evaluate(() => __qaReadResult);
  assert.equal(aborted.ok, false);
  assert.equal(aborted.name, 'AbortError');
  receipt.abortRead = aborted;
  receipt.checks.push('child-AbortSignal-reaches-parent-and-late-byte-result-is-rejected');
  await page.evaluate(() => (__bunkiAudioBridgeProbe.holdMedia = true));
  await frame.locator('[data-study-audio]').click();
  await page.waitForFunction(() => __bunkiAudioBridgeProbe.pending.length === 1);
  await frame.locator('[data-study-audio]').click();
  assert.equal(await page.evaluate(() => __bunkiAudioBridgeProbe.pending[0].signal.aborted), true);
  await page.evaluate(() => {
    __bunkiAudioBridgeProbe.holdMedia = false;
    for (const held of __bunkiAudioBridgeProbe.pending.splice(0)) held.release();
  });
  await page.waitForTimeout(200);
  assert.equal((await probe(frame)).decodes.length, 0);
  assert.equal((await probe(frame)).starts.length, 0);
  assert.deepEqual(await journal(frame), before);
  receipt.checks.push('mounted-stop-during-pending-read-aborts-and-suppresses-late-decode');
  await frame.locator('[data-study-audio]').click();
  await frame.waitForFunction(() => __bunkiAudioProbe.ends.length === 3, null, { timeout: 10000 });
  const first = await probe(frame);
  assert.deepEqual(first.decodes, fixture.expectedClipSha256);
  assert.deepEqual(first.starts, fixture.expectedClipSha256);
  assert.deepEqual(first.ends, fixture.expectedClipSha256);
  assert.equal(first.muted, 3);
  assert(first.durations.every((duration) => duration > 0));
  assert.deepEqual(await journal(frame), before);
  receipt.firstPlayback = first;
  receipt.checks.push(
    'real-AAC-decode-and-ordered-term-plus-complete-passage-start-end',
    'audio-only-whole-canonical-journal-unchanged',
    'every-output-connection-muted',
  );
  const bridge = await page.evaluate(() => ({
    realmChecks: __bunkiAudioBridgeProbe.realmChecks,
    views: __bunkiAudioBridgeProbe.views,
    lateReturns: __bunkiAudioBridgeProbe.lateReturns,
  }));
  assert(bridge.realmChecks.every(Boolean));
  assert(bridge.views.every((view) => view.offset === 4 && view.total === view.length + 11));
  assert.equal(bridge.lateReturns, 2);
  receipt.realmBridge = bridge;
  receipt.checks.push('parent-descriptors-local-and-exact-offset-length-byte-views-copy-to-child');
  const requestsBefore = receipt.requests.length;
  await context.setOffline(true);
  await frame.locator('[data-study-audio]').click();
  await frame.waitForFunction(() => __bunkiAudioProbe.ends.length === 6, null, { timeout: 10000 });
  assert.equal(receipt.requests.length, requestsBefore);
  assert.deepEqual((await probe(frame)).starts.slice(3), fixture.expectedClipSha256);
  assert.deepEqual(await journal(frame), before);
  await context.setOffline(false);
  receipt.checks.push('warm-in-session-offline-admitted-media-replay-without-network');
  await frame.locator('[data-study-audio]').click();
  await frame.waitForFunction(() => __bunkiAudioProbe.starts.length >= 8, null, { timeout: 10000 });
  const atGrade = await probe(frame);
  assert.equal(atGrade.starts.length, 8);
  await frame.locator('[data-grade="3"]').click();
  await frame.waitForFunction(
    () =>
      bunkiSharedStudy.backend.readProjection().reviews.length === 1 &&
      !bunkiSharedStudy.app.read().busy,
    null,
    { timeout: 10000 },
  );
  await page.waitForTimeout(
    Math.min(4000, Math.ceil(first.durations.reduce((a, b) => a + b, 0) * 1000) + 200),
  );
  const cancelled = await probe(frame),
    after = await journal(frame);
  assert.equal(cancelled.starts.length, 8);
  assert(cancelled.stops.length >= 1);
  assert.equal(after.projection.reviews[0].rawRating, 3);
  assert.equal(after.projection.reviews[0].effectiveRating, 3);
  assert.equal(Object.keys(after.local).length, 1);
  assert.deepEqual(await page.evaluate(() => structuredClone(__bunkiAudioProbe.legacy)), legacy);
  receipt.grade = {
    review: after.projection.reviews[0],
    task: after.projection.tasks[fixture.taskKey],
    stops: cancelled.stops,
    startsAtGrade: atGrade.starts.length,
    startsAfterSettle: cancelled.starts.length,
  };
  receipt.checks.push(
    'grade-during-second-clip-stops-and-saves-one-canonical-review',
    'no-late-third-clip-or-legacy-grade-write',
  );
  const identity = await page.evaluate(() => ({ ...bunkiSharedStudyHost.identity }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  frame = await mount();
  assert.deepEqual(await journal(frame), after);
  assert.equal(
    await page.evaluate(() => bunkiSharedStudyHost.identity.installation),
    identity.installation,
  );
  await select(frame, true);
  await frame.locator('[data-reveal]').click();
  await frame.locator('[data-study-audio]:not(:disabled)').waitFor({ timeout: 15000 });
  await frame.locator('[data-study-audio]').click();
  await frame.waitForFunction(() => __bunkiAudioProbe.ends.length === 3, null, { timeout: 10000 });
  assert.deepEqual((await probe(frame)).starts, fixture.expectedClipSha256);
  assert.deepEqual(await journal(frame), after);
  receipt.checks.push(
    'online-reload-reopens-identical-installation-journal-release-and-real-media',
  );
  receipt.reload = {
    installation: identity.installation,
    releaseId: fixture.release.releaseId,
    starts: (await probe(frame)).starts,
  };
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack;
  receipt.lastPage = page
    ? {
        url: page.url(),
        body: await page
          .locator('body')
          .innerText()
          .catch(() => null),
        frames: await Promise.all(
          page.frames().map(async (f) => ({
            url: f.url(),
            body: await f
              .locator('body')
              .innerText()
              .catch(() => null),
            probe: await f.evaluate(() => globalThis.__bunkiAudioProbe).catch(() => null),
            diagnostic: await f
              .evaluate(async () => {
                const api = globalThis.bunkiSharedStudy;
                if (!api) return null;
                const { studyAudioSourcePlan } =
                  await import('/vendor/shared-study-engine/client/app/study-audio.mjs');
                const entry = api.app.read().current?.entry;
                const plan = (value) => {
                  try {
                    return studyAudioSourcePlan(value);
                  } catch (error) {
                    return { error: error.message };
                  }
                };
                return {
                  status: api.app.read().current?.audioStatus,
                  originalPlan: plan(entry),
                  clonedPlan: plan(structuredClone(entry)),
                };
              })
              .catch(() => null),
          })),
        ),
      }
    : null;
  process.exitCode = 1;
  if (baseline) {
    const child = receipt.lastPage?.frames.find((f) => f.url.includes('shared-frame.html'));
    if (
      child?.diagnostic?.status === 'unsupported-capability' &&
      child.probe?.starts.length === 0 &&
      child.probe?.decodes.length === 0 &&
      receipt.errors.length === 0
    ) {
      receipt.status = 'negative-control-passed';
      receipt.negativeControl.observed = child.diagnostic.status;
      receipt.negativeControl.failure = error.stack;
      delete receipt.failure;
      process.exitCode = 0;
    }
  }
} finally {
  await context?.close();
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
}
console.log(
  JSON.stringify({
    status: receipt.status,
    checks: receipt.checks,
    taskKey: receipt.taskKey,
    release: receipt.release.releaseId,
    failure: receipt.failure,
  }),
);
