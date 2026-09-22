/** Selected publisher-original contracts and actual UI journeys. Fixtures are
 * synthetic; a full wrapper is never promoted to editorial approval. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, pathToFileURL, URL as WebUrl } from 'node:url';
import { preparePublisherFixture } from '../../../tools/feed/publisher-fixture.mjs';
import {
  readAppRecord,
  readAppRecordSnapshot,
  waitForAppRecord,
  armRecordWriteFailure,
  clearRecordWriteFailure,
} from './record-test-support.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const sourcePath = fileURLToPath(import.meta.url);
const repository = resolve(dirname(sourcePath), '../../..');
const mode = process.argv.includes('--ui') ? 'ui' : 'contracts';
const inside = (parent, child) => {
  const part = relative(parent, child);
  return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};
assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable KAIRO_SITE_DIR');
const site = realpathSync(process.env.KAIRO_SITE_DIR);
const expected = process.env.KAIRO_PUBLISHER_SITE_SHA256;
assert.match(expected || '', /^[a-f0-9]{64}$/u, 'Supply KAIRO_PUBLISHER_SITE_SHA256');
const out = resolve(
  process.env.KAIRO_EVIDENCE_DIR ||
    resolve(homedir(), '.dharma/bunki_audit/2026-09-10/publisher-reading'),
);
mkdirSync(out, { recursive: true });
const evidenceRoots = [resolve(homedir(), '.dharma')];
if (process.env.CI && process.env.RUNNER_TEMP) evidenceRoots.push(process.env.RUNNER_TEMP);
assert(evidenceRoots.some((path) => existsSync(path) && inside(realpathSync(path), realpathSync(out))),
  'Evidence belongs under ~/.dharma or CI RUNNER_TEMP');
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
assert.equal(manifest.product, 'KAIRO');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.artifactSha256, expected);
assert.equal(hash(JSON.stringify(manifest.files)), expected);
const walk = (directory) =>
  readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const file = resolve(directory, name);
      const stat = lstatSync(file);
      assert(!stat.isSymbolicLink(), 'Runtime artifact must not contain symlinks');
      if (stat.isDirectory()) return walk(file);
      assert(stat.isFile());
      return [file];
    });
const files = walk(site)
  .filter((file) => file !== resolve(site, 'build-identity.json'))
  .map((file) => {
    const bytes = readFileSync(file);
    return {
      path: relative(site, file).split(sep).join('/'),
      bytes: bytes.length,
      sha256: hash(bytes),
    };
  });
assert.deepEqual(files, manifest.files, 'Every runtime file belongs to the supplied artifact');
const controllerPath = resolve(repository, 'prototypes/corridor/publisher-controller.mjs');
const fixturePath = resolve(repository, 'packages/feed/test/full-reader/fixtures.ts');
const helperPath = resolve(repository, 'tools/feed/publisher-fixture.mjs');
const recordHelperPath = resolve(repository, 'prototypes/corridor/tools/record-test-support.mjs');
const sources = [sourcePath, controllerPath, fixturePath, helperPath, recordHelperPath].map((path) => ({
  path,
  sha256: hash(readFileSync(path)),
}));
const stage = mkdtempSync(resolve(out, 'contracts-runtime-'));
mkdirSync(resolve(stage, 'modules'));
writeFileSync(
  resolve(stage, 'modules/feed-core.mjs'),
  readFileSync(resolve(site, 'modules/feed-core.mjs')),
);
writeFileSync(resolve(stage, 'publisher-controller.mjs'), readFileSync(controllerPath));
const core = await import(pathToFileURL(resolve(stage, 'modules/feed-core.mjs')).href);
const controller = await import(pathToFileURL(resolve(stage, 'publisher-controller.mjs')).href);
const prepared = await preparePublisherFixture({
  repo: repository,
  site,
  output: resolve(stage, 'shared-fixture'),
});
const { fixture } = prepared;
assert.equal(
  prepared.receipt.stagedFeedModuleSha256,
  files.find((file) => file.path === 'modules/feed-core.mjs').sha256,
);
const results = [];
const observations = {};

const { NOW, BODY } = fixture;
const html = (body = BODY) =>
  fixture.html(
    `<p>${body}</p><h3>次の話</h3><p>小さな町の歴史を、みんなでゆっくり学びます。</p><div class="contributors">校正: <a href="https://jp.globalvoices.org/author/fixture-proofreader/">校正者</a></div>`,
  );
const entryFor = (number = 65560, title = '地域と図書館') =>
  fixture.entry({ title, url: `https://jp.globalvoices.org/2026/08/03/${number}/` });
const entry = entryFor();
const selection = controller.publisherSelection(entry);
const response = (content = prepared.data.html, fetchedAt = NOW) => ({
  ...fixture.response(content),
  fetchedAt,
});
const original = core.createGlobalVoicesArticle(entry, response());
assert.equal(
  original.status,
  'full-reader',
  'Synthetic licensed fixture must yield a complete body',
);
assert.equal(original.sourceDocument.otherCredits[0].name, '校正者');
const updated = core.createGlobalVoicesArticle(
  entry,
  response(html(`${BODY} 追加された一文です。`)),
);
const transportRevision = core.createGlobalVoicesArticle(
  entry,
  response(html(), '2026-09-10T04:00:00.000Z'),
);
const link = core.createPublisherLink(entry, 'license-missing', NOW);
const clone = (value) => JSON.parse(JSON.stringify(value));
async function check(name, run) {
  try {
    await run();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
const rejected = (run, code) =>
  assert.throws(run, code ? (error) => error.code === code : undefined);
function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function contracts() {
  await check('empty-library-strict-shape-and-owned-immutability', () => {
    const empty = controller.parsePublisherLibrary(null);
    assert.deepEqual(empty, { format: 'kairo-publisher-library', v: 1, readings: [] });
    assert(Object.isFrozen(empty.readings));
    for (const raw of [
      false,
      0,
      [],
      { ...empty, extra: true },
      { ...empty, v: 2 },
      { ...empty, readings: {} },
      { format: empty.format, readings: [] },
    ])
      rejected(() => controller.parsePublisherLibrary(raw));
    const raw = clone({ ...empty, readings: [original] });
    const parsed = controller.parsePublisherLibrary(raw);
    raw.readings[0].sourceDocument.translators[0].name = 'Changed caller';
    assert.equal(parsed.readings[0].sourceDocument.translators[0].name, '翻訳者');
    assert(Object.isFrozen(parsed.readings[0].sourceDocument.otherCredits[0]));
    assert.equal(controller.parsePublisherLibrary(parsed), parsed);
  });
  await check('complete-credits-rights-text-and-pending-editorial-survive-json', () => {
    const library = controller.acceptPublisherReading(null, original, selection);
    const restored = controller.parsePublisherLibrary(clone(library));
    assert.deepEqual(restored.readings[0], original);
    assert.equal(
      restored.readings[0].candidate.article.body.text,
      `${BODY}\n\n次の話\n\n小さな町の歴史を、みんなでゆっくり学びます。`,
    );
    assert.equal(restored.readings[0].candidate.editorial.status, 'pending');
    assert.deepEqual(restored.readings[0].sourceDocument.otherCredits, [
      {
        role: '校正',
        name: '校正者',
        url: 'https://jp.globalvoices.org/author/fixture-proofreader/',
      },
    ]);
    assert.match(restored.readings[0].candidate.article.source.attribution, /校正: 校正者/u);
    assert.equal(
      restored.readings[0].candidate.article.capabilities['ai-transform'].status,
      'unknown',
    );
    assert.equal(
      restored.readings[0].candidate.article.capabilities['synthesize-audio'].status,
      'unknown',
    );
  });
  await check('exact-receipt-dedup-keeps-body-and-transport-revisions', () => {
    let library = controller.acceptPublisherReading(null, original, selection);
    assert.equal(
      controller.acceptPublisherReading(library, clone(original), clone(selection)),
      library,
    );
    library = controller.acceptPublisherReading(library, updated, selection);
    library = controller.acceptPublisherReading(library, transportRevision, selection);
    assert.equal(library.readings.length, 3);
    assert.deepEqual(library.readings[0], original);
    assert.notEqual(updated.candidate.article.versionId, original.candidate.article.versionId);
    assert.equal(
      transportRevision.candidate.article.versionId,
      original.candidate.article.versionId,
    );
    assert.notEqual(transportRevision.receiptSha256, original.receiptSha256);
    assert.deepEqual(controller.selectPublisherReading(library, original.receiptSha256), original);
    assert.equal(controller.selectPublisherReading(library, '0'.repeat(64)), null);
    rejected(() => controller.selectPublisherReading(library, 'invalid'));
    rejected(
      () => controller.parsePublisherLibrary({ ...library, readings: [original, original] }),
      'duplicate-publisher-receipt',
    );
  });
  await check('link-fallback-denied-rights-and-false-approval-cannot-be-saved', () => {
    rejected(
      () => controller.acceptPublisherReading(null, link, selection),
      'publisher-body-unavailable',
    );
    rejected(() =>
      controller.parsePublisherLibrary({
        format: 'kairo-publisher-library',
        v: 1,
        readings: [link],
      }),
    );
    for (const operation of ['display-body', 'retain-offline']) {
      const denied = clone(original);
      denied.candidate.article.capabilities[operation] = { status: 'denied' };
      rejected(() => controller.acceptPublisherReading(null, denied, selection));
    }
    const falselyApproved = clone(original);
    falselyApproved.candidate.editorial = { status: 'approved' };
    rejected(() => controller.acceptPublisherReading(null, falselyApproved, selection));
    assert.equal(original.candidate.editorial.status, 'pending');
  });
  await check('selection-is-exact-three-ids-and-cannot-bind-a-foreign-reply', () => {
    assert.deepEqual(Object.keys(selection).sort(), ['entryId', 'revisionId', 'sourceId']);
    assert.deepEqual(selection, {
      sourceId: entry.sourceId,
      entryId: entry.id,
      revisionId: entry.revisionId,
    });
    const foreign = controller.publisherSelection(entryFor(65561));
    rejected(() => controller.acceptPublisherReading(null, original, foreign));
    const revision = controller.publisherSelection(entryFor(65560, 'Changed feed title'));
    assert.equal(revision.entryId, selection.entryId);
    assert.notEqual(revision.revisionId, selection.revisionId);
    rejected(() => controller.acceptPublisherReading(null, original, revision));
    rejected(() => controller.acceptPublisherReading(null, original));
    rejected(() =>
      controller.publisherSelection({ ...entry, canonicalUrl: 'http://127.0.0.1/private' }),
    );
    rejected(() => controller.publisherSelection({ ...entry, id: entryFor(65561).id }));
  });
  await check('tampered-text-blocks-credits-digests-and-unknown-fields-reject', () => {
    const mutations = [
      (raw) => {
        raw.candidate.article.body.text += 'changed';
      },
      (raw) => {
        raw.sourceDocument.blocks[0].end += 1;
      },
      (raw) => {
        raw.sourceDocument.translators[0].name = 'Wrong translator';
      },
      (raw) => {
        raw.sourceDocument.otherCredits = [];
      },
      (raw) => {
        raw.receiptSha256 = '0'.repeat(64);
      },
      (raw) => {
        raw.extra = true;
      },
    ];
    for (const mutate of mutations) {
      const raw = clone(original);
      mutate(raw);
      rejected(() => controller.acceptPublisherReading(null, raw, selection));
    }
  });
  await check('accessors-cycles-prototypes-sparse-arrays-and-json-overflow-reject', () => {
    let calls = 0;
    const getter = {
      format: 'kairo-publisher-library',
      v: 1,
      get readings() {
        calls += 1;
        return [];
      },
    };
    rejected(() => controller.parsePublisherLibrary(getter));
    assert.equal(calls, 0);
    const cycle = {};
    cycle.self = cycle;
    for (const raw of [
      cycle,
      new Date(),
      { format: 'kairo-publisher-library', v: 1, readings: new Array(1) },
      { format: 'kairo-publisher-library', v: 1, readings: [], [Symbol('unexpected')]: true },
    ])
      rejected(() => controller.parsePublisherLibrary(raw));
    const tooMany = {
      format: 'kairo-publisher-library',
      v: 1,
      readings: Array(controller.PUBLISHER_LIBRARY_LIMITS.readings + 1).fill(original),
    };
    rejected(() => controller.parsePublisherLibrary(tooMany), 'publisher-library-capacity');
    rejected(
      () =>
        controller.parsePublisherLibrary({
          padding: 'x'.repeat(controller.PUBLISHER_LIBRARY_LIMITS.jsonCharacters + 1),
        }),
      'publisher-library-capacity',
    );
    const shallow = Object.freeze(
      clone({ format: 'kairo-publisher-library', v: 1, readings: [original] }),
    );
    shallow.readings[0].candidate.article.body.text = 'Changed under shallow freeze';
    rejected(() => controller.parsePublisherLibrary(shallow));
  });
  await check('port-unavailable-has-no-read-or-storage-side-effects', async () => {
    const reader = controller.createPublisherReader(null);
    assert.equal(reader.available, false);
    assert.equal(await reader.read(entry), null);
    assert.equal(reader.busy(entry), false);
    assert.equal(reader.view(entry), null);
    assert.equal(reader.error(entry), null);
  });
  await check('duplicate-reads-share-promise-and-only-two-distinct-reads-start', async () => {
    const calls = [];
    const work = [deferred(), deferred()];
    const reader = controller.createPublisherReader({
      read: (value) => {
        calls.push(value);
        return work[calls.length - 1].promise;
      },
    });
    const secondEntry = entryFor(65561);
    const secondLink = core.createPublisherLink(secondEntry, 'network-error', NOW);
    const first = reader.read(entry);
    const repeated = reader.read(clone(entry));
    assert.equal(first, repeated);
    const second = reader.read(secondEntry);
    await assert.rejects(
      reader.read(entryFor(65562)),
      (error) => error.code === 'publisher-reader-busy',
    );
    assert.equal(reader.busy(entry), true);
    assert.equal(reader.busy(secondEntry), true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls, [selection, controller.publisherSelection(secondEntry)]);
    work[0].resolve(clone(original));
    work[1].resolve(clone(secondLink));
    assert.deepEqual(await first, original);
    assert.deepEqual(await second, secondLink);
    assert.equal(reader.busy(entry), false);
    assert.equal(reader.busy(secondEntry), false);
  });
  await check(
    'bad-or-foreign-native-reply-preserves-prior-success-and-retry-is-explicit',
    async () => {
      let reply = original;
      let calls = 0;
      const reader = controller.createPublisherReader({
        read: () => {
          calls += 1;
          return clone(reply);
        },
      });
      await reader.read(entry);
      const previous = reader.view(entry);
      reply = { malformed: true };
      await assert.rejects(reader.read(entry));
      assert.equal(reader.view(entry), previous);
      assert.equal(reader.error(entry), 'publisher-read-unavailable');
      assert.equal(reader.busy(entry), false);
      reply = core.createPublisherLink(entryFor(65561), 'network-error', NOW);
      await assert.rejects(reader.read(entry));
      assert.equal(reader.view(entry), previous);
      assert.equal(calls, 3, 'No automatic retry');
      reply = updated;
      assert.deepEqual(await reader.read(entry), updated);
      assert.equal(reader.error(entry), null);
      assert.equal(calls, 4);
    },
  );
  await check('rejected-transport-settles-busy-without-leaking-provider-error-text', async () => {
    const reader = controller.createPublisherReader({
      read: () => Promise.reject(new Error('synthetic private transport detail')),
    });
    await assert.rejects(reader.read(entry));
    assert.equal(reader.busy(entry), false);
    assert.equal(reader.error(entry), 'publisher-read-unavailable');
    assert.equal(reader.view(entry), null);
  });
  await check(
    'valid-publisher-link-is-visible-transport-fallback-without-body-admission',
    async () => {
      const reader = controller.createPublisherReader({ read: () => link });
      const result = await reader.read(entry);
      assert.equal(result.status, 'publisher-link');
      assert.equal(result.candidate.article.body, null);
      assert.equal(reader.view(entry).reason, 'license-missing');
      rejected(() => controller.acceptPublisherReading(null, result, selection));
    },
  );
  observations.synthetic = {
    fixtureReceipt: prepared.receipt,
    selection,
    originalReceiptSha256: original.receiptSha256,
    updatedReceiptSha256: updated.receiptSha256,
    sourceResponseSha256: original.sourceDocument.responseSha256,
    exactTextSha256: original.sourceDocument.contentSha256,
    editorial: 'pending',
    creditRoles: ['author', 'translator', '校正'],
  };
}

async function ui() {
  assert.equal(
    files.find((file) => file.path === 'publisher-controller.mjs')?.sha256,
    sources.find((source) => source.path === controllerPath).sha256,
    'Actual UI must use the frozen controller being handed back',
  );
  const { chromium, webkit } = await import('playwright-core');
  const browserName = process.env.KAIRO_BROWSER || 'chromium';
  assert(['chromium', 'webkit'].includes(browserName));
  const offlineFault = process.env.KAIRO_PUBLISHER_OFFLINE_FAULT || 'context-offline';
  assert(['context-offline', 'server-disconnected'].includes(offlineFault));
  const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
  let serverConnected = true;
  let responses = 0;
  const requests = [];
  const cert = resolve(out, 'synthetic-localhost-cert.pem');
  const key = resolve(out, 'synthetic-localhost-key.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'ignore' },
  );
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
  };
  const server = createServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      const pathname = decodeURIComponent(new WebUrl(request.url, 'https://localhost').pathname);
      requests.push(pathname);
      if (!serverConnected) {
        request.socket.destroy();
        return;
      }
      responses += 1;
      if (pathname === '/__publisher_probe') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html><title>Synthetic publisher reader probe</title>');
        return;
      }
      const file = resolve(site, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!inside(site, file) || !existsSync(file) || !lstatSync(file).isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'content-type': mime[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(readFileSync(file));
    },
  );
  rmSync(key);
  rmSync(cert);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `https://127.0.0.1:${server.address().port}`;
  const browser = await (browserName === 'webkit' ? webkit : chromium).launch(
    browserName === 'chromium'
      ? {
          executablePath: process.env.CHROMIUM_PATH || undefined,
          args: ['--ignore-certificate-errors'],
        }
      : {},
  );
  observations.runtime = {
    engine: browserName,
    version: browser.version(),
    protocol: 'https',
    offlineFault,
  };
  const source = core.getFeedSource('global-voices');
  const snapshot = core.parseFeedXml(
    `<rss version="2.0"><channel><title>Synthetic publisher UI</title><item><title>地域と図書館</title><link>${fixture.URL}</link><pubDate>Mon, 03 Aug 2026 02:27:56 GMT</pubDate></item></channel></rss>`,
    { sourceId: source.id, finalUrl: source.feed.url, fetchedAt: NOW },
  );
  assert.deepEqual(snapshot.entries[0], entry);
  const applied = core.applyFeedResult(
    source,
    core.initialFeedState(),
    { status: 200, headers: {}, snapshot },
    Date.parse(NOW),
  );
  const refreshReply = core.parseFeedRefreshResult(
    {
      sourceId: source.id,
      status: 'updated',
      entries: snapshot.entries,
      checkedAt: NOW,
      lastSuccessAt: NOW,
      nextCheckAt: new Date(applied.state.nextCheckAt).toISOString(),
      latestPublishedAt: snapshot.latestPublishedAt,
      freshness: applied.freshness,
      error: null,
    },
    source.id,
  );
  const foreignReply = core.createPublisherLink(entryFor(65561), 'network-error', NOW);
  const markupReply = core.createGlobalVoicesArticle(
    entry,
    response(html(`${BODY} &lt;img src=x onerror="window.publisherInjection=1"&gt;`)),
  );
  assert.equal(markupReply.status, 'full-reader');
  const unknown = {
    version: 7,
    nested: ['Synthetic future source preference', { retained: true }],
  };
  const seed = {
    v: 1,
    taken: [],
    srs: {},
    revlog: [],
    obslog: [],
    futurePublisherPrefs: unknown,
    feedLibrary: {
      v: 1,
      mutedSourceIds: core.SOURCE_REGISTRY.filter((source) => source.id !== 'global-voices').map(
        (source) => source.id,
      ),
      savedReferences: [],
    },
  };
  async function ready(page) {
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
      timeout: 30_000,
    });
  }
  async function fresh(options = {}) {
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1100, height: 900 },
      serviceWorkers: options.serviceWorkers || 'block',
      ignoreHTTPSErrors: true,
    });
    const diagnostics = [];
    const errors = [];
    context.on('page', (page) => {
      page.on('pageerror', (error) => {
        errors.push(error.message);
        diagnostics.push({ kind: 'pageerror', message: error.message, stack: error.stack });
      });
      page.on('requestfailed', (request) =>
        diagnostics.push({ kind: 'requestfailed', url: request.url(), failure: request.failure() }),
      );
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(`${base}/__publisher_probe`);
    await page.evaluate(
      (value) => localStorage.setItem('kairo-corridor-v1', JSON.stringify(value)),
      options.record || seed,
    );
    await context.addInitScript(
      ({ enabled, refreshReply, original, updated, link, foreignReply, markupReply }) => {
        window.publisherCalls = [];
        window.publisherRefreshCalls = [];
        if (!enabled) return;
        window.kairoFeeds = Object.freeze({
          async refresh(id) {
            window.publisherRefreshCalls.push(id);
            if (sessionStorage.getItem('publisher-ui-mode') === 'offline')
              throw new Error('Synthetic disconnected native feed');
            if (id !== 'global-voices') throw new Error('Unexpected synthetic source');
            return structuredClone(refreshReply);
          },
          async read(...args) {
            window.publisherCalls.push({ args });
            const mode = sessionStorage.getItem('publisher-ui-mode');
            if (mode === 'held')
              return new Promise((resolve) => {
                window.releasePublisherFixture = () => resolve(structuredClone(original));
              });
            if (mode === 'offline') throw new Error('Synthetic disconnected native article');
            return structuredClone(
              mode === 'invalid'
                ? { malformed: true }
                : mode === 'foreign'
                  ? foreignReply
                  : mode === 'link'
                    ? link
                    : mode === 'updated'
                      ? updated
                      : mode === 'markup'
                        ? markupReply
                        : original,
            );
          },
        });
      },
      {
        enabled: options.native !== false,
        refreshReply,
        original,
        updated,
        link,
        foreignReply,
        markupReply,
      },
    );
    await page.goto(`${base}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    return { context, page, errors, diagnostics };
  }
  const record = readAppRecord;
  async function shelf(page, native = true) {
    await page.locator('#feed-link').click();
    if (native) await page.waitForSelector('[data-feed-read]');
    else await page.waitForSelector('#feed-panel-articles');
  }
  async function readArticle(page) {
    await page.locator('[data-feed-read]').click();
    await page.waitForSelector('#publisher-body');
  }
  async function backToSavedArticles(page) {
    await page.locator('#publisher-back').click();
    await page.waitForSelector('[data-publisher-article]');
  }
  async function finishedState(page, pressed) {
    await page.waitForFunction((pressed) =>
      document.getElementById('publisher-finished')?.getAttribute('aria-pressed') === String(pressed), pressed);
    await waitForAppRecord(page, (record) => !!record.readDone?.[`publisher:${original.receiptSha256}`] === pressed,
      { description: `publisher completion ${pressed}` });
  }
  async function failedWrite(page) {
    await page.waitForFunction(() => window.__recordTestFault?.fired > 0 &&
      document.getElementById('store-alert')?.hidden === false);
  }
  async function inspectSavedSourceDetails(page, screenshot) {
    const details = page.locator('.publisher-details');
    assert.equal(await details.evaluate((node) => node.open), false);
    await details.locator('summary').click();
    assert.equal(await details.evaluate((node) => node.open), true);
    const paragraphs = details.locator('.feed-meta');
    assert.equal(await paragraphs.count(), 4);
    for (const paragraph of await paragraphs.all()) assert(await paragraph.isVisible());
    assert.equal(await paragraphs.nth(0).locator('span').innerText(),
      `Source: ${original.candidate.article.source.name}`);
    const policy = paragraphs.nth(0).locator('a.publisher-policy');
    assert.equal(await policy.count(), 1);
    assert.equal(await policy.innerText(), 'Reuse policy ↗');
    assert.equal(await policy.getAttribute('href'), original.sourceDocument.license.policyUrl);
    assert.match(await paragraphs.nth(1).innerText(), /Published:.+Updated:/u);
    assert.match(await paragraphs.nth(2).innerText(), /Version saved:/u);
    assert.equal(await details.locator('.publisher-extraction').count(), 1);
    assert.equal(await paragraphs.nth(3).innerText(),
      'Source wording retained; spacing normalized. Layout, images and embedded media omitted.');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Expanded source details fit the viewport',
    );
    await page.screenshot({ path: resolve(out, screenshot), fullPage: true });
    await details.locator('summary').click();
    assert.equal(await details.evaluate((node) => node.open), false);
  }
  async function modeIs(page, value) {
    await page.evaluate((value) => sessionStorage.setItem('publisher-ui-mode', value), value);
  }
  async function selectedContextRoundTrip(page, suffix = 'desktop') {
    const before = await record(page);
    // A real pointer double-click chooses the browser's word boundary. Reads
    // below observe that selection; no DOM selection or record is injected.
    const point = await page.locator('#publisher-body').evaluate((node) => {
      const offset = node.textContent.indexOf('町');
      if (offset < 0 || node.firstChild?.nodeType !== Node.TEXT_NODE) throw new Error('Missing late-word fixture');
      const range = document.createRange(); range.setStart(node.firstChild, offset); range.setEnd(node.firstChild, offset + 1);
      const glyph = range.getBoundingClientRect(), body = node.getBoundingClientRect();
      return { x: glyph.x - body.x + glyph.width / 2, y: glyph.y - body.y + glyph.height / 2 };
    });
    await page.locator('#publisher-body').dblclick({ position: point });
    const text = await page.evaluate(() => window.getSelection()?.toString());
    assert(text && prepared.data.expectedText.includes(text), 'Pointer selects actual article text');
    await page.waitForFunction(() => document.getElementById('publisher-context-save')?.disabled === false);
    await page.screenshot({ path: resolve(out, `publisher-selected-preview-${suffix}.png`), fullPage: true });
    await page.locator('#publisher-context-save').click();
    await page.waitForFunction(() => /Saved with its source/u.test(document.getElementById('publisher-context-status')?.textContent || ''));
    const kept = await record(page), selected = kept.teacherContexts.entries.at(-1);
    assert.equal(selected.sourceKind, 'publisher-reading');
    assert.equal(selected.sourceId, original.receiptSha256);
    assert.equal(selected.sourceDigest, hash(Buffer.from(prepared.data.expectedText)));
    assert.equal(selected.unit, 'utf16-code-unit');
    assert(selected.start > prepared.data.expectedText.indexOf('🚀'), 'Selection follows a surrogate pair and paragraph breaks');
    assert.equal(selected.quote, text);
    assert.equal(prepared.data.expectedText.slice(selected.start, selected.end), text);
    assert.equal(kept.teacherContexts.activeRef, before.teacherContexts?.activeRef || null);
    assert.deepEqual(kept.publisherLibrary, before.publisherLibrary);
    noDebt(kept);
    await page.locator('#publisher-context-open').click();
    await page.waitForSelector('#teacher-source-return');
    assert.equal(await page.locator('.teacher-context .teacher-source-quote').textContent(), text);
    assert.equal((await record(page)).teacherContexts.activeRef, selected.id);
    assert.match(await page.locator('#teacher-source-status').textContent(), /Tutor processing is not available/u);
    assert.equal(await page.locator('.teacher-source-details').evaluate((node) => node.open), false);
    assert.equal(await page.locator('.teacher-source-details .teacher-source-credit').textContent(), selected.attribution);
    await page.screenshot({ path: resolve(out, `publisher-saved-context-${suffix}.png`), fullPage: true });
    // Device settings are synthetic and supplied through the real controls.
    // Even with a key, the unchanged publisher policy must stop all egress.
    let providerRequests = 0;
    await page.context().route('https://source-context.synthetic.invalid/**', async (route) => {
      providerRequests += 1; await route.abort();
    });
    await page.locator('#ai-base-url').fill('https://source-context.synthetic.invalid');
    await page.locator('#ai-model-input').fill('synthetic-source-context-check');
    await page.locator('#ai-key-input').fill('synthetic-fixture-not-a-real-credential');
    await page.locator('#ai-key-save').click();
    const question = 'この文の言い方を教えてください。';
    await page.locator('#chat-input').fill(question);
    await page.waitForFunction(() => document.getElementById('teacher-draft-status')?.dataset.state === 'saved');
    const chatBefore = (await record(page)).aiChat;
    assert(await page.locator('#chat-send').isDisabled(), 'Known unavailable source processing has no usable send control');
    assert.match(await page.locator('#chat-status').textContent(), /cannot be sent to the tutor/u);
    // Explicit UI-tampering fault, separate from ordinary selection/navigation:
    // the transport must still refuse when a disabled button is re-enabled.
    await page.locator('#chat-send').evaluate((button) => { button.disabled = false; });
    await page.locator('#chat-send').click();
    await page.waitForFunction(() => /not available for tutor processing/u.test(document.getElementById('chat-status')?.textContent || ''));
    assert.equal(providerRequests, 0);
    assert.deepEqual((await record(page)).aiChat, chatBefore);
    assert.equal(await page.locator('#chat-input').inputValue(), question);
    await page.locator('#teacher-source-return').click();
    await page.waitForSelector('#publisher-context-return:focus');
    assert.equal(await page.locator('#publisher-context-return').textContent(), text);
    assert.equal(await page.locator('#publisher-body').textContent(), prepared.data.expectedText);
    const focused = await page.locator('#publisher-context-return').boundingBox();
    assert(focused.y >= 0 && focused.y < page.viewportSize().height);
    await page.screenshot({ path: resolve(out, `publisher-selected-source-return-${suffix}.png`), fullPage: true });
    await page.reload(); await ready(page);
    await page.locator('#ai-link').click();
    assert.equal(await page.locator('#chat-input').inputValue(), question);
    assert.equal(await page.locator('.teacher-context .teacher-source-quote').textContent(), text);
    await page.locator('#teacher-source-return').click();
    await page.waitForSelector('#publisher-context-return:focus');
    assert.equal(await page.locator('#publisher-context-return').textContent(), text);
    assert.deepEqual((await record(page)).publisherLibrary, before.publisherLibrary);
    noDebt(await record(page));
    return { context: selected, providerRequests, sourceBodyUnchanged: true,
      selectionMethod: 'native browser word selection via real pointer double-click',
      disabledSendObserved: true, syntheticFault: 'disabled send button re-enabled; transport still refuses source processing',
      ordinaryReload: true, cleanBrowserRestart: false };
  }
  async function quota(page, enabled) {
    if (enabled) return armRecordWriteFailure(page, 'quota');
    return clearRecordWriteFailure(page);
  }
  function noDebt(value) {
    assert.deepEqual(value.taken, []);
    assert.deepEqual(value.srs, {});
    assert.deepEqual(value.revlog, []);
    assert.deepEqual(value.obslog, []);
  }
  async function checkUi(name, run, options = {}) {
    if (filter && filter !== name) return;
    const context = await fresh(options);
    try {
      const detail = await run(context);
      assert.deepEqual(context.errors, [], 'No pageerror is filtered');
      results.push({ name, pass: true, detail });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, pass: false, error: error.stack });
      console.error(`FAIL ${name}: ${error.message}`);
      await context.page
        .screenshot({ path: resolve(out, `${name}-failure.png`), fullPage: true })
        .catch(() => {});
    } finally {
      writeFileSync(
        resolve(out, `${name}-diagnostics.json`),
        JSON.stringify(context.diagnostics, null, 2) + '\n',
      );
      await context.context.close();
    }
  }
  try {
    await checkUi(
      'selected-original-saves-exact-text-all-credits-and-no-learning-debt',
      async ({ page }) => {
        await shelf(page);
        await readArticle(page);
        assert.equal(
          await page.locator('#publisher-body').textContent(),
          prepared.data.expectedText,
        );
        assert.deepEqual((await record(page)).publisherLibrary.readings, [original]);
        assert.deepEqual(await page.evaluate(() => window.publisherCalls), [{ args: [selection] }]);
        for (const value of ['Fixture Author', '翻訳者', '校正者', 'CC BY 3.0'])
          assert((await page.locator('.publisher-credits').innerText()).includes(value));
        const firstBodyLine = await page.locator('#publisher-body').evaluate((node) => {
          const range = document.createRange();
          range.setStart(node.firstChild, 0);
          range.setEnd(node.firstChild, 1);
          const box = range.getBoundingClientRect();
          return {
            viewport: { width: innerWidth, height: innerHeight },
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
          };
        });
        assert(
          firstBodyLine.top >= 0 && firstBodyLine.bottom <= firstBodyLine.viewport.height,
          `The first body line is visible before scrolling:${JSON.stringify(firstBodyLine)}`,
        );
        assert(firstBodyLine.left >= 0 && firstBodyLine.right <= firstBodyLine.viewport.width);
        await inspectSavedSourceDetails(page, 'publisher-source-details-desktop.png');
        const credits = await page.locator('.publisher-credit-link').evaluateAll((links) =>
          links.map((link) => ({
            text: link.textContent,
            href: link.href,
            target: link.target,
            rel: link.rel,
          })),
        );
        assert.deepEqual(
          credits.map(({ text, href }) => ({ name: text, url: href })),
          [
            ...prepared.data.authors,
            ...prepared.data.translators,
            ...prepared.data.otherCredits.map(({ name, url }) => ({ name, url })),
          ],
        );
        assert(
          credits.every(
            (credit) =>
              credit.target === '_blank' &&
              credit.rel.includes('noreferrer') &&
              credit.rel.includes('noopener'),
          ),
        );
        assert.equal(await page.locator('#publisher-original').getAttribute('href'), fixture.URL);
        assert.equal(
          await page
            .locator('#publisher-body script, #publisher-body img, #publisher-body .tok')
            .count(),
          0,
        );
        assert.equal(
          (await record(page)).publisherLibrary.readings[0].candidate.editorial.status,
          'pending',
        );
        await page.locator('#publisher-finished').click();
        await finishedState(page, true);
        assert.equal(
          await page.locator('#publisher-finished').getAttribute('aria-pressed'),
          'true',
        );
        noDebt(await record(page));
        await backToSavedArticles(page);
        assert.equal(await page.locator('[data-publisher-article]').count(), 1);
        await page.locator('[data-publisher-article]').click();
        assert.equal(
          await page.locator('#publisher-body').textContent(),
          prepared.data.expectedText,
        );
        assert.equal(
          (await page.evaluate(() => window.publisherCalls)).length,
          1,
          'Reopening a saved original does not read the publisher again',
        );
        await page.screenshot({
          path: resolve(out, 'publisher-original-desktop.png'),
          fullPage: true,
        });
        const selectedContext = await selectedContextRoundTrip(page);
        return {
          exactReceipt: original.receiptSha256,
          nativeSelections: 1,
          creditRoles: ['author', 'translator', '校正'],
          editorial: 'pending',
          firstBodyLine,
          exactAttributionVisibleAfterDisclosure: true,
          selectedContext,
        };
      },
      { viewport: { width: 1280, height: 800 } },
    );
    await checkUi(
      'bad-foreign-and-link-native-results-never-publish-a-new-saved-body',
      async ({ page }) => {
        await shelf(page);
        await readArticle(page);
        await backToSavedArticles(page);
        const saved = (await record(page)).publisherLibrary;
        await page.locator('#feed-panel-latest').click();
        for (const kind of ['invalid', 'foreign', 'link']) {
          await modeIs(page, kind);
          await page.locator('[data-feed-read]').click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-feed-read]')?.disabled === false &&
              /could not/i.test(document.querySelector('#feed-notice')?.textContent || ''),
          );
          assert.equal(await page.locator('#publisher-body').count(), 0);
          assert.deepEqual((await record(page)).publisherLibrary, saved);
          assert.equal(
            (await page.locator('.feed-entry-link').count()) > 0 ||
              (await page.locator('.feed-entry a[href]').count()) > 0,
            true,
            'Publisher link stays available',
          );
        }
        await page.locator('#feed-panel-articles').click();
        await page.locator('[data-publisher-article]').click();
        assert.equal(
          await page.locator('#publisher-body').textContent(),
          prepared.data.expectedText,
        );
        noDebt(await record(page));
        return {
          refusedReplies: ['malformed', 'foreign-selection', 'publisher-link'],
          earlierOriginalUnchanged: true,
        };
      },
    );
    await checkUi(
      'new-source-version-preserves-earlier-body-and-renders-markup-as-text',
      async ({ page }) => {
        await shelf(page);
        await readArticle(page);
        await backToSavedArticles(page);
        await page.locator('#feed-panel-latest').click();
        await modeIs(page, 'updated');
        await readArticle(page);
        assert.equal(
          await page.locator('#publisher-body').textContent(),
          updated.candidate.article.body.text,
        );
        await backToSavedArticles(page);
        assert.equal(await page.locator('[data-publisher-article]').count(), 2);
        await page.locator(`[data-publisher-article="${original.receiptSha256}"]`).click();
        assert.equal(
          await page.locator('#publisher-body').textContent(),
          prepared.data.expectedText,
        );
        await backToSavedArticles(page);
        await page.locator('#feed-panel-latest').click();
        await modeIs(page, 'markup');
        await readArticle(page);
        assert.equal(
          await page.locator('#publisher-body').textContent(),
          markupReply.candidate.article.body.text,
        );
        assert.equal(await page.locator('#publisher-body img, #publisher-body script').count(), 0);
        assert.equal(await page.evaluate(() => window.publisherInjection), undefined);
        const saved = (await record(page)).publisherLibrary;
        assert.deepEqual(saved.readings, [original, updated, markupReply]);
        assert.equal(
          new Set(saved.readings.map((reading) => reading.candidate.article.versionId)).size,
          3,
        );
        return { retainedVersions: 3, originalUnchanged: true, textWasNotInterpretedAsHtml: true };
      },
    );
    await checkUi(
      'quota-failure-cannot-open-unsaved-body-or-falsely-mark-finished',
      async ({ page }) => {
        await shelf(page);
        const before = await record(page);
        const faults = [];
        await quota(page, true);
        try {
          await page.locator('[data-feed-read]').click();
          await failedWrite(page);
          assert.equal(await page.locator('#publisher-body').count(), 0);
          assert.deepEqual((await record(page)).publisherLibrary, before.publisherLibrary);
        } finally {
          faults.push(await quota(page, false));
        }
        // A host acknowledgment failure can protect the open application.
        // Reopen the durable record before issuing the next independent command.
        await page.reload(); await ready(page); await shelf(page);
        await readArticle(page);
        const saved = await record(page);
        await quota(page, true);
        try {
          await page.locator('#publisher-finished').click();
          await failedWrite(page);
          assert.equal(
            await page.locator('#publisher-finished').getAttribute('aria-pressed'),
            'false',
          );
          assert.deepEqual((await record(page)).readDone, saved.readDone);
        } finally {
          faults.push(await quota(page, false));
        }
        await page.reload(); await ready(page); await shelf(page);
        await page.locator('#feed-panel-articles').click();
        await page.locator(`[data-publisher-article="${original.receiptSha256}"]`).click();
        await page.locator('#publisher-finished').click();
        await finishedState(page, true);
        assert.equal(
          await page.locator('#publisher-finished').getAttribute('aria-pressed'),
          'true',
        );
        noDebt(await record(page));
        return { failedSaveStayedOnShelf: true, completionOnlyChangedAfterSave: true, recoveredByReload: true, faults };
      },
    );
    await checkUi(
      'changed-legacy-fence-during-native-read-cannot-mutate-the-active-record',
      async ({ context, page }) => {
        await shelf(page);
        await modeIs(page, 'held');
        await page.locator('[data-feed-read]').click();
        await page.waitForFunction(() => typeof window.releasePublisherFixture === 'function');
        const before = await readAppRecordSnapshot(page);
        const foreign = await context.newPage();
        await foreign.goto(`${base}/__publisher_probe`);
        const replacement = {
          ...(await record(page)),
          futureReplacement: { ownerChanged: true },
          publisherLibrary: null,
        };
        const bytes = JSON.stringify(replacement);
        await foreign.evaluate((bytes) => localStorage.setItem('kairo-corridor-v1', bytes), bytes);
        await page.waitForFunction(() => document.querySelector('#store-alert')?.hidden === false);
        await page.evaluate(() => window.releasePublisherFixture());
        await page.waitForFunction(() => document.querySelector('#publisher-body') === null);
        assert.equal(await page.evaluate(() => localStorage.getItem('kairo-corridor-v1')), bytes);
        assert.equal(await page.locator('#publisher-body').count(), 0);
        const after = await readAppRecordSnapshot(page);
        assert.deepEqual(after.record, before.record);
        assert.deepEqual(after.archive, before.archive);
        assert.equal(after.revision, before.revision);
        await foreign.close();
        return { obsoleteReplyDiscarded: true, replacementBytesUnchanged: true, nativeRecordUnchanged: true };
      },
    );
    await checkUi(
      'saved-original-reopens-after-offline-reload-without-native-read',
      async ({ context, page }) => {
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
          timeout: 30_000,
        });
        await shelf(page);
        await readArticle(page);
        await backToSavedArticles(page);
        const saved = (await record(page)).publisherLibrary;
        await modeIs(page, 'offline');
        const cachePaths = [
          'index.html',
          'corridor.js',
          'publisher-controller.mjs',
          'modules/feed-core.mjs',
          'modules/record-core.mjs',
        ];
        const cacheHashes = await page.evaluate(async (paths) => {
          const entries = [];
          for (const path of paths) {
            const response = await caches.match(new URL(path, location.href).href);
            if (!response) throw new Error(`Missing cached entry:${path}`);
            const bytes = await response.arrayBuffer();
            entries.push({
              path,
              bytes: bytes.byteLength,
              sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                .map((value) => value.toString(16).padStart(2, '0'))
                .join(''),
            });
          }
          return entries;
        }, cachePaths);
        for (const entry of cacheHashes)
          assert.deepEqual(
            entry,
            files.find((file) => file.path === entry.path),
          );
        if (offlineFault === 'context-offline') await context.setOffline(true);
        else serverConnected = false;
        const servedBefore = responses;
        try {
          await page.reload();
          await ready(page);
          await shelf(page, false);
          await page.locator('#feed-panel-articles').click();
          await page.locator(`[data-publisher-article="${original.receiptSha256}"]`).click();
          assert.equal(
            await page.locator('#publisher-body').textContent(),
            prepared.data.expectedText,
          );
          assert.deepEqual((await record(page)).publisherLibrary, saved);
          assert.deepEqual(await page.evaluate(() => window.publisherCalls), []);
          assert.equal(responses, servedBefore, 'No server response supplied the offline reader');
          const navigatorOnline = await page.evaluate(() => navigator.onLine);
          if (offlineFault === 'context-offline') assert.equal(navigatorOnline, false);
          await page.screenshot({
            path: resolve(out, 'publisher-offline-original.png'),
            fullPage: true,
          });
          return { offlineFault, navigatorOnline, nativeReads: 0, serverResponses: 0, cacheHashes };
        } finally {
          serverConnected = true;
          if (offlineFault === 'context-offline') await context.setOffline(false);
        }
      },
      { serviceWorkers: 'allow' },
    );
    await checkUi(
      'full-export-restore-keeps-all-original-versions-and-unknown-root',
      async ({ page }) => {
        await shelf(page);
        await readArticle(page);
        await backToSavedArticles(page);
        await page.locator('#feed-panel-latest').click();
        await modeIs(page, 'updated');
        await readArticle(page);
        await backToSavedArticles(page);
        const saved = await record(page);
        await page.locator('#tray').click();
        const pending = page.waitForEvent('download');
        await page.locator('#export-store').click();
        const chunks = [];
        for await (const chunk of await (await pending).createReadStream()) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        const backup = JSON.parse(bytes.toString('utf8'));
        assert.equal(backup.format, 'kairo-backup');
        assert.deepEqual(backup.record.publisherLibrary, saved.publisherLibrary);
        assert.deepEqual(backup.record.futurePublisherPrefs, unknown);
        writeFileSync(resolve(out, 'synthetic-publisher-backup.json'), bytes);
        const restored = await fresh({ native: false });
        try {
          await restored.page.locator('#tray').click();
          await restored.page.evaluate(() => {
            window.publisherBeforeImport = true;
          });
          await restored.page.locator('#import-file').setInputFiles({
            name: 'synthetic-publisher-backup.json',
            mimeType: 'application/json',
            buffer: bytes,
          });
          await restored.page.waitForFunction(() => window.publisherBeforeImport !== true, null, {
            timeout: 20_000,
          });
          await ready(restored.page);
          assert.deepEqual((await record(restored.page)).publisherLibrary, saved.publisherLibrary);
          assert.deepEqual((await record(restored.page)).futurePublisherPrefs, unknown);
          await shelf(restored.page, false);
          await restored.page.locator('#feed-panel-articles').click();
          assert.equal(await restored.page.locator('[data-publisher-article]').count(), 2);
          await restored.page
            .locator(`[data-publisher-article="${original.receiptSha256}"]`)
            .click();
          assert.equal(
            await restored.page.locator('#publisher-body').textContent(),
            prepared.data.expectedText,
          );
          assert.deepEqual(restored.errors, []);
          noDebt(await record(restored.page));
        } finally {
          await restored.context.close();
        }
        return {
          restoredVersions: 2,
          nativePortNeededToReopen: false,
          unknownRootPreserved: true,
          backupBytes: bytes.length,
          backupSha256: hash(bytes),
        };
      },
    );
    await checkUi(
      'phone-reader-links-and-controls-fit-and-meet-44px-targets',
      async ({ page }) => {
        await shelf(page);
        await readArticle(page);
        const sizes = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          targets: [
            ...document.querySelectorAll(
              '#publisher-back,#publisher-original,#publisher-finished,.publisher-credit-link,.publisher-license,.publisher-details summary,#publisher-context-save,#publisher-context-open',
            ),
          ].map((node) => {
            const box = node.getBoundingClientRect();
            return {
              id: node.id || node.className || node.tagName.toLowerCase(),
              width: box.width,
              height: box.height,
              left: box.left,
              right: box.right,
            };
          }),
        }));
        assert(sizes.scrollWidth <= sizes.width + 1);
        assert.equal(sizes.targets.length, 10);
        for (const target of sizes.targets) {
          assert(
            target.width >= 44 && target.height >= 44,
            `44px target:${JSON.stringify(target)}`,
          );
          assert(
            target.left >= -1 && target.right <= sizes.width + 1,
            `Phone fit:${JSON.stringify(target)}`,
          );
        }
        assert.equal(
          await page.locator('#publisher-body').textContent(),
          prepared.data.expectedText,
        );
        await inspectSavedSourceDetails(page, 'publisher-source-details-phone.png');
        await page.screenshot({
          path: resolve(out, 'publisher-phone-original.png'),
          fullPage: true,
        });
        const selectedContext = await selectedContextRoundTrip(page, 'phone');
        await backToSavedArticles(page);
        const open = await page.locator('[data-publisher-article]').boundingBox();
        assert(open.width >= 44 && open.height >= 44);
        return { ...sizes, selectedContext };
      },
      { viewport: { width: 390, height: 844 } },
    );
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
}

try {
  if (mode === 'contracts') await contracts();
  else await ui();
} finally {
  for (const source of sources)
    assert.equal(
      hash(readFileSync(source.path)),
      source.sha256,
      'Tested sources stayed fixed during the run',
    );
  writeFileSync(
    resolve(out, 'receipt.json'),
    JSON.stringify(
      {
        format: 'kairo-publisher-reading-verification',
        v: 1,
        mode,
        sources,
        artifact: {
          path: site,
          sha256: expected,
          files: files.length,
          feedCore: files.find((file) => file.path === 'modules/feed-core.mjs'),
        },
        runtime: { node: process.version },
        results,
        observations,
        passed: results.filter((result) => result.pass).length,
        failed: results.filter((result) => !result.pass).length,
        limitations: [
          'Synthetic selected publisher fixtures; no live publisher network in this verifier',
          'Receipt coherence is not independent source authority or editorial approval',
          'Contract mode runs exact compiled browser-target core in Node, not browser UI or native IPC',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  if (!results.length || results.some((result) => !result.pass)) process.exitCode = 1;
}
