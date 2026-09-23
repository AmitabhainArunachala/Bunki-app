#!/usr/bin/env node
/* global document, window, localStorage -- evaluated inside the isolated Electron renderer */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { preparePublisherFixture } from './publisher-fixture.mjs';

const require = createRequire(import.meta.url);
const { externalPath } = require('../../prototypes/bunki-desktop/lib/paths.cjs');
const { verifyBundledArtifact } = require('../../prototypes/bunki-desktop/lib/artifact.cjs');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checks = [];
let output;
let application;
let identity;
let fixtureIdentity;
let hostSources;
const pageErrors = [];
async function check(name, action) {
  try {
    const detail = await action();
    checks.push({ name, status: 'passed', detail });
    console.log('PASS ' + name);
    return detail;
  } catch (error) {
    checks.push({ name, status: 'failed', error: error.message });
    throw error;
  }
}
function events(directory, filename = 'feed-requests.jsonl') {
  const file = join(directory, filename);
  return existsSync(file)
    ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : [];
}

try {
  const args = process.argv.slice(2);
  assert(
    args.length === 4 && args[0] === '--site' && args[2] === '--out',
    'Usage: node tools/feed/verify-native.mjs --site <canonical-site> --out <fresh-external-evidence>',
  );
  const site = resolve(args[1]);
  output = externalPath(args[3], { fresh: true });
  identity = verifyBundledArtifact(site);
  assert(identity.files.some((row) => row.path === 'modules/feed-core.mjs'));
  const core = await import(pathToFileURL(join(site, 'modules/feed-core.mjs')).href);
  const { SOURCE_REGISTRY } = core;
  assert(
    identity.files.some((row) => row.path === 'publisher-controller.mjs'),
    'Stage must include the publisher reader UI/controller',
  );
  mkdirSync(output, { recursive: true });
  const publisherFixture = await preparePublisherFixture({
    repo: ROOT,
    site,
    output: join(output, 'fixture'),
  });
  fixtureIdentity = publisherFixture.receipt;
  const sourcePaths = [
    'tools/feed/verify-native.mjs',
    'tools/feed/qa-electron-main.cjs',
    'tools/feed/publisher-fixture.mjs',
    'prototypes/bunki-desktop/main.cjs',
    'prototypes/bunki-desktop/preload.cjs',
    ...[
      'feed-service',
      'feed-ipc',
      'publisher-reader',
      'publisher-network',
      'feed-network',
      'paths',
      'artifact',
      'static-host',
      'navigation-policy',
    ].map((name) => `prototypes/bunki-desktop/lib/${name}.cjs`),
  ];
  hostSources = sourcePaths.map((path) => ({
    path,
    sha256: createHash('sha256')
      .update(readFileSync(join(ROOT, path)))
      .digest('hex'),
  }));
  process.env.TMPDIR = join(output, 'temporary');
  mkdirSync(process.env.TMPDIR);
  const { _electron } = await import('playwright-core');
  const listener = createServer();
  await new Promise((ok) => listener.listen(0, '127.0.0.1', ok));
  const port = listener.address().port;
  await new Promise((ok) => listener.close(ok));
  assert.notEqual(port, 5198);
  const profile = join(output, 'profile');

  async function boot(name, advance = 0, mode = 'normal') {
    const directory = join(output, name);
    mkdirSync(directory);
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR,
      BUNKI_TEST_MODE: '1',
      BUNKI_TEST_PROFILE: profile,
      BUNKI_TEST_EVIDENCE: directory,
      BUNKI_TEST_PORT: String(port),
      BUNKI_SRC_DIR: site,
      KAIRO_FEED_QA_ADVANCE_MS: String(advance),
      KAIRO_FEED_QA_MODE: mode,
      KAIRO_PUBLISHER_QA_FIXTURE: publisherFixture.file,
    };
    application = await _electron.launch({
      executablePath: require(join(ROOT, 'prototypes/bunki-desktop/node_modules/electron')),
      args: [join(ROOT, 'tools/feed/qa-electron-main.cjs')],
      cwd: directory,
      env,
      timeout: 60_000,
      tracesDir: directory,
    });
    application
      .process()
      .stdout.on('data', (chunk) =>
        writeFileSync(join(directory, 'electron.log'), chunk, { flag: 'a' }),
      );
    application
      .process()
      .stderr.on('data', (chunk) =>
        writeFileSync(join(directory, 'electron.log'), chunk, { flag: 'a' }),
      );
    const page = await application.firstWindow();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => document.body?.dataset.ready === '1', null, {
      timeout: 45_000,
    });
    return { page, directory };
  }
  let current = await boot('first');
  await check(
    'actual sandboxed Electron exposes only the fixed feed bridge and immutable source catalog',
    async () => {
      const result = await current.page.evaluate(async () => ({
        keys: Object.keys(window.kairoFeeds),
        require: typeof require,
        ipc: typeof ipcRenderer,
        node: typeof process,
        sources: (await window.kairoFeeds.listSources()).map((source) => ({
          id: source.id,
          mode: source.mode,
        })),
      }));
      assert.deepEqual(result.keys.sort(), ['listSources', 'read', 'refresh']);
      assert.equal(result.require, 'undefined');
      assert.equal(result.ipc, 'undefined');
      assert.equal(result.node, 'undefined');
      assert.deepEqual(
        result.sources,
        SOURCE_REGISTRY.map((source) => ({ id: source.id, mode: source.mode })),
      );
      return result;
    },
  );
  const first = await check(
    'renderer receives strictly parsed inert metadata through the real IPC service',
    async () => {
      const result = await current.page.evaluate(async () => {
        const response = await window.kairoFeeds.refresh('asahi');
        const article = document.createElement('p');
        article.id = 'feed-qa-headline';
        article.textContent = response.entries[0]?.title;
        document.body.append(article);
        return {
          response,
          hasImage: article.querySelector('img') !== null,
          injected: window.feedInjected === 1,
        };
      });
      assert.equal(result.response.status, 'updated');
      assert.equal(result.response.entries.length, 1);
      assert.equal(result.response.entries[0].body, null);
      assert.equal(result.hasImage, false);
      assert.equal(result.injected, false);
      assert.equal(events(current.directory).length, 1);
      return {
        status: result.response.status,
        entryId: result.response.entries[0].id,
        lastSuccessAt: result.response.lastSuccessAt,
      };
    },
  );
  await check(
    'bad source arguments and publisher-only rows cannot turn IPC into arbitrary networking',
    async () => {
      const result = await current.page.evaluate(async () => {
        const errors = [];
        for (const value of [
          { url: 'https://attacker.invalid/' },
          'https://attacker.invalid/',
          'unknown-source',
          null,
        ]) {
          try {
            await window.kairoFeeds.refresh(value);
            errors.push(null);
          } catch (error) {
            errors.push(error.message);
          }
        }
        return { errors, publisher: await window.kairoFeeds.refresh('newton') };
      });
      assert(result.errors.every(Boolean));
      assert.equal(result.publisher.status, 'publisher-window');
      assert.equal(events(current.directory).length, 1);
      return { rejections: result.errors.length, publisherStatus: result.publisher.status };
    },
  );
  await check('a child frame has neither the feed bridge nor Node/IPC access', async () => {
    await current.page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'feed-qa-frame';
      frame.srcdoc = '<p>Unprivileged frame</p>';
      document.body.append(frame);
    });
    const frame = current.page.frameLocator('#feed-qa-frame');
    await frame.locator('p').waitFor();
    const result = await frame.locator('body').evaluate(() => ({
      feeds: typeof window.kairoFeeds,
      require: typeof require,
      ipc: typeof ipcRenderer,
    }));
    assert.deepEqual(result, { feeds: 'undefined', require: 'undefined', ipc: 'undefined' });
    return result;
  });
  await current.page.screenshot({ path: join(output, 'native-bridge.png') });
  let savedReference;
  await check(
    'the real source shelf saves an IPC headline as a reference without creating review debt',
    async () => {
      const url = new URL(current.page.url());
      url.searchParams.set('entry', 'shelf');
      url.searchParams.set('ui', 'bi');
      await current.page.goto(url.href);
      await current.page.waitForFunction(() => document.body.dataset.ready === '1');
      await current.page.locator('#feed-link').click();
      await current.page.waitForFunction(
        () => document.querySelector('#feed-refresh-all')?.disabled === false,
      );
      await current.page.locator('.feed-save').first().click();
      await current.page.locator('#feed-panel-saved').click();
      assert.equal(await current.page.locator('.feed-entry').count(), 1);
      assert.equal(await current.page.locator('.feed-entry img, .feed-entry script').count(), 0);
      const record = await current.page.evaluate(() =>
        JSON.parse(localStorage.getItem('kairo-corridor-v1')),
      );
      assert.equal(record.feedLibrary.savedReferences.length, 1);
      savedReference = record.feedLibrary.savedReferences[0];
      assert.deepEqual(
        Object.keys(savedReference).sort(),
        ['format', 'v', 'sourceId', 'publisherId', 'entryId', 'canonicalUrl'].sort(),
      );
      assert(!JSON.stringify(record).includes('日本語のニュース'));
      assert.deepEqual(record.taken, []);
      assert.deepEqual(record.revlog, []);
      assert.deepEqual(record.obslog, []);
      await current.page.screenshot({ path: join(output, 'native-source-shelf.png') });
      return { savedReference, learningDebt: 0, requests: events(current.directory).length };
    },
  );
  let savedPublisher;
  let publisherSelection;
  await check(
    'the refreshed Global Voices card selects the existing native feed entry',
    async () => {
      await current.page.locator('#feed-panel-sources').click();
      await current.page.locator('[data-feed-refresh="global-voices"]').click();
      await current.page.waitForFunction(
        () => document.querySelector('[data-feed-refresh="global-voices"]')?.disabled === false,
      );
      const reply = await current.page.evaluate(() => window.kairoFeeds.refresh('global-voices'));
      const parsed = core.parseFeedRefreshResult(reply, 'global-voices');
      assert.equal(parsed.entries.length, 1);
      const entry = parsed.entries[0];
      assert.equal(entry.canonicalUrl, publisherFixture.data.url);
      publisherSelection = core.publisherArticleRequest(entry).selection;
      assert.equal(
        events(current.directory).filter((event) => event.sourceId === 'global-voices').length,
        1,
      );
      assert.equal(events(current.directory, 'publisher-requests.jsonl').length, 0);
      await current.page.locator('#feed-panel-latest').click();
      await current.page.locator(`[data-feed-read="${entry.id}"]`).waitFor();
      return {
        entryId: entry.id,
        revisionId: entry.revisionId,
        headlineRequests: 1,
        bodyRequests: 0,
      };
    },
  );
  await check(
    'unknown entries, stale revisions and renderer URL fields are rejected by actual publisher IPC before fetching',
    async () => {
      const result = await current.page.evaluate(async (selection) => {
        const errors = [];
        for (const value of [
          { ...selection, entryId: 'feed:' + '0'.repeat(64) },
          { ...selection, revisionId: 'feedv:' + '0'.repeat(64) },
          { ...selection, url: 'https://attacker.invalid/' },
          { ...selection, sourceId: 'asahi' },
          null,
        ]) {
          try {
            await window.kairoFeeds.read(value);
            errors.push(null);
          } catch (error) {
            errors.push(error.message);
          }
        }
        return errors;
      }, publisherSelection);
      assert(result.every(Boolean));
      assert.match(result[0], /entry-unavailable/u);
      assert.match(result[1], /entry-(?:unavailable|revised)/u);
      for (const error of result.slice(2)) assert.match(error, /invalid-reader-selection/u);
      assert.equal(events(current.directory, 'publisher-requests.jsonl').length, 0);
      return { rejections: result.length, bodyRequests: 0 };
    },
  );
  await check('a child frame cannot directly call the privileged publisher read port', async () => {
    await current.page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'publisher-qa-frame';
      frame.srcdoc = '<p>Unprivileged reader frame</p>';
      document.body.append(frame);
    });
    const frame = current.page.frameLocator('#publisher-qa-frame');
    await frame.locator('p').waitFor();
    const result = await frame.locator('body').evaluate(async (_element, selection) => {
      try {
        await window.kairoFeeds.read(selection);
        return { rejected: false };
      } catch {
        return {
          rejected: true,
          bridge: typeof window.kairoFeeds,
          ipc: typeof ipcRenderer,
          node: typeof require,
        };
      }
    }, publisherSelection);
    assert.deepEqual(result, {
      rejected: true,
      bridge: 'undefined',
      ipc: 'undefined',
      node: 'undefined',
    });
    assert.equal(events(current.directory, 'publisher-requests.jsonl').length, 0);
    await current.page.locator('#publisher-qa-frame').evaluate((element) => element.remove());
    return result;
  });
  await check(
    'clicking an admitted publisher article commits exact text and credits before opening the reader',
    async () => {
      await current.page.locator(`[data-feed-read="${publisherSelection.entryId}"]`).click();
      await current.page.locator('#publisher-body').waitFor();
      assert.equal(
        await current.page.locator('#publisher-body').textContent(),
        publisherFixture.data.expectedText,
      );
      assert.equal(
        await current.page
          .locator('#publisher-body img, #publisher-body script, #publisher-body iframe')
          .count(),
        0,
      );
      assert.equal(
        await current.page.locator('#publisher-original').getAttribute('href'),
        publisherFixture.data.url,
      );
      const record = await current.page.evaluate(() =>
        JSON.parse(localStorage.getItem('kairo-corridor-v1')),
      );
      assert.equal(record.publisherLibrary.readings.length, 1);
      savedPublisher = core.parsePublisherReadResult(
        record.publisherLibrary.readings[0],
        publisherSelection,
      );
      assert.equal(savedPublisher.candidate.article.body.text, publisherFixture.data.expectedText);
      assert.equal(
        savedPublisher.candidate.article.body.contentSha256,
        publisherFixture.data.contentSha256,
      );
      assert.equal(savedPublisher.candidate.article.title, publisherFixture.data.title);
      for (const key of ['authors', 'translators', 'otherCredits'])
        assert.deepEqual(savedPublisher.sourceDocument[key], publisherFixture.data[key]);
      assert.equal(savedPublisher.sourceDocument.publishedAt, publisherFixture.data.publishedAt);
      assert.equal(savedPublisher.sourceDocument.updatedAt, publisherFixture.data.updatedAt);
      assert.equal(savedPublisher.sourceDocument.license.id, 'CC-BY-3.0');
      const credits = await current.page.locator('.publisher-credits').textContent();
      assert(credits.includes(savedPublisher.candidate.article.source.attribution));
      for (const credit of [
        ...publisherFixture.data.authors,
        ...publisherFixture.data.translators,
        ...publisherFixture.data.otherCredits,
      ]) {
        assert(credits.includes(credit.name));
        assert.equal(
          await current.page.locator(`.publisher-credits a[href="${credit.url}"]`).count(),
          1,
        );
      }
      assert(credits.includes(savedPublisher.sourceDocument.modification));
      const details = current.page.locator('.publisher-details');
      assert.equal(await details.getAttribute('open'), null);
      await details.locator('summary').click();
      assert(
        (await details.innerText()).includes(savedPublisher.candidate.article.source.attribution),
      );
      assert((await details.innerText()).includes(savedPublisher.sourceDocument.modification));
      await details.locator('summary').click();
      const readingPosition = await current.page.locator('#publisher-body').evaluate((element) => ({
        top: element.getBoundingClientRect().top,
        viewport: window.innerHeight,
      }));
      assert(
        readingPosition.top < readingPosition.viewport - 44,
        'The article begins within the initial Mac viewport',
      );
      assert.deepEqual(savedPublisher.candidate.editorial, { status: 'pending' });
      for (const name of ['taken', 'revlog', 'obslog']) assert.deepEqual(record[name], []);
      assert.deepEqual(record.feedLibrary.savedReferences, [savedReference]);
      assert.equal(events(current.directory, 'publisher-requests.jsonl').length, 1);
      await current.page.screenshot({ path: join(output, 'native-publisher-reader.png') });
      return {
        receiptSha256: savedPublisher.receiptSha256,
        versionId: savedPublisher.candidate.article.versionId,
        bodyHash: savedPublisher.candidate.article.body.contentSha256,
        characters: publisherFixture.data.expectedText.length,
        exactCredits: true,
        committedBeforePresentation: true,
        sourceDetailsDisclosure: true,
        readingPosition,
        learningDebt: 0,
        bodyRequests: 1,
      };
    },
  );
  await check(
    'the original publisher link is deliberately simulated and saved-reader navigation does not refetch',
    async () => {
      const appUrl = current.page.url();
      await current.page.locator('#publisher-original').click();
      const deadline = Date.now() + 3000;
      while (
        !events(current.directory, 'events.jsonl').some(
          (event) =>
            event.event === 'publisher-open-simulated' && event.url === publisherFixture.data.url,
        ) &&
        Date.now() < deadline
      )
        await pause(25);
      assert(
        events(current.directory, 'events.jsonl').some(
          (event) =>
            event.event === 'publisher-open-simulated' && event.url === publisherFixture.data.url,
        ),
      );
      assert.equal(current.page.url(), appUrl);
      assert.equal(application.windows().length, 1);
      await current.page.locator('#publisher-back').click();
      await current.page.locator('#feed-panel-articles').click();
      assert.equal(await current.page.locator('[data-publisher-article]').count(), 1);
      await current.page
        .locator(`[data-publisher-article="${savedPublisher.receiptSha256}"]`)
        .click();
      assert.equal(
        await current.page.locator('#publisher-body').textContent(),
        publisherFixture.data.expectedText,
      );
      assert.equal(events(current.directory, 'publisher-requests.jsonl').length, 1);
      return {
        externalBrowserOpened: false,
        restoredReceipt: savedPublisher.receiptSha256,
        bodyRequests: 1,
      };
    },
  );
  await application.close();
  application = undefined;
  current = await boot('restart');
  await check(
    'restart preserves request cadence and independently retains only policy state',
    async () => {
      const result = await current.page.evaluate(() => window.kairoFeeds.refresh('asahi'));
      assert.equal(result.status, 'deferred');
      assert.equal(result.entries.length, 0);
      assert.equal(result.lastSuccessAt, first.lastSuccessAt);
      assert.equal(events(current.directory).length, 0);
      const saved = readFileSync(join(profile, 'feed-request-state-v1.json'), 'utf8');
      assert(!saved.includes('日本語'));
      assert(!saved.includes('https://'));
      assert(!saved.includes('synthetic body'));
      const url = new URL(current.page.url());
      url.searchParams.set('entry', 'shelf');
      url.searchParams.set('ui', 'bi');
      await current.page.goto(url.href);
      await current.page.waitForFunction(() => document.body.dataset.ready === '1');
      await current.page.locator('#feed-link').click();
      await current.page.waitForFunction(
        () => document.querySelector('#feed-refresh-all')?.disabled === false,
      );
      await current.page.locator('#feed-panel-saved').click();
      assert.equal(await current.page.locator('.feed-entry').count(), 1);
      assert.match(
        await current.page.locator('.feed-entry').textContent(),
        /headline are not stored/u,
      );
      const restored = await current.page.evaluate(() =>
        JSON.parse(localStorage.getItem('kairo-corridor-v1')),
      );
      assert.deepEqual(restored.feedLibrary.savedReferences, [savedReference]);
      return { status: result.status, lastSuccessAt: result.lastSuccessAt, itemCount: 0 };
    },
  );
  await check(
    'after a real app restart the saved full reader opens from local storage with exact credits and no publisher request',
    async () => {
      const before = events(current.directory).length;
      await current.page.locator('#feed-panel-articles').click();
      assert.equal(await current.page.locator('[data-publisher-article]').count(), 1);
      await current.page
        .locator(`[data-publisher-article="${savedPublisher.receiptSha256}"]`)
        .click();
      await current.page.locator('#publisher-body').waitFor();
      assert.equal(
        await current.page.locator('#publisher-body').textContent(),
        publisherFixture.data.expectedText,
      );
      assert(
        (await current.page.locator('.publisher-credits').textContent()).includes(
          savedPublisher.candidate.article.source.attribution,
        ),
      );
      assert.equal(events(current.directory, 'publisher-requests.jsonl').length, 0);
      assert.equal(events(current.directory).length, before);
      const record = await current.page.evaluate(() =>
        JSON.parse(localStorage.getItem('kairo-corridor-v1')),
      );
      assert.deepEqual(
        core.parsePublisherReadResult(record.publisherLibrary.readings[0]),
        savedPublisher,
      );
      assert.equal(record.publisherLibrary.readings.length, 1);
      for (const name of ['taken', 'revlog', 'obslog']) assert.deepEqual(record[name], []);
      await current.page.screenshot({ path: join(output, 'native-publisher-restarted.png') });
      const finishedAfter = Date.now();
      await current.page.locator('#publisher-finished').click();
      assert.equal(
        await current.page.locator('#publisher-finished').getAttribute('aria-pressed'),
        'true',
      );
      const finished = await current.page.evaluate(() =>
        JSON.parse(localStorage.getItem('kairo-corridor-v1')),
      );
      const finishedAt = finished.readDone[`publisher:${savedPublisher.receiptSha256}`];
      assert(
        Number.isSafeInteger(finishedAt) && finishedAt >= finishedAfter && finishedAt <= Date.now(),
      );
      for (const name of ['taken', 'revlog', 'obslog']) assert.deepEqual(finished[name], []);
      await current.page.locator('#publisher-back').click();
      await current.page.locator('#feed-panel-articles').waitFor();
      assert.equal(events(current.directory, 'publisher-requests.jsonl').length, 0);
      return {
        exactPersistedWrapper: true,
        receiptSha256: savedPublisher.receiptSha256,
        newBodyRequests: 0,
        newHeadlineRequests: 0,
      };
    },
  );
  await application.close();
  application = undefined;
  current = await boot('rate-limited', 3_600_100, 'rate-limited');
  await check('rate limiting is truthful and isolated from another usable publisher', async () => {
    const result = await current.page.evaluate(async () => ({
      limited: await window.kairoFeeds.refresh('asahi'),
      other: await window.kairoFeeds.refresh('mainichi'),
    }));
    assert.equal(result.limited.status, 'rate-limited');
    assert.equal(result.limited.lastSuccessAt, first.lastSuccessAt);
    assert.equal(result.other.status, 'updated');
    assert.equal(result.other.entries.length, 1);
    assert.deepEqual(
      events(current.directory).map((event) => event.headers),
      [{}, {}],
    );
    return { limited: result.limited.status, other: result.other.status };
  });
  assert.deepEqual(pageErrors, []);
  for (const source of hostSources)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(ROOT, source.path)))
        .digest('hex'),
      source.sha256,
      `Source changed during native journey: ${source.path}`,
    );
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
  if (!checks.some((check) => check.status === 'failed'))
    checks.push({
      name: 'verifier initialization/completion',
      status: 'failed',
      error: error.message,
    });
} finally {
  await application?.close().catch(() => {});
  if (output)
    writeFileSync(
      join(output, 'receipt.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          mode: 'actual-Electron-IPC-with-synthetic-publisher-transport',
          status: process.exitCode ? 'failed' : 'passed',
          artifactSha256: identity?.artifactSha256,
          fixtureIdentity,
          hostSources,
          checks,
          pageErrors,
          limits: [
            'This tests the native bridge, compiled parser, source shelf and publisher read/save/restart journeys with original synthetic replies.',
            'No publisher network, installed operator app, user profile or external browser is used.',
          ],
        },
        null,
        2,
      ) + '\n',
    );
}
