/** Actual canonical-artifact publisher reading, durable save, and reload in both engines. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { verifyBundledArtifact } from '../../bunki-desktop/lib/artifact.cjs';
import { startStaticHost } from '../../bunki-desktop/lib/static-host.cjs';
import {
  resolveCorridorSite,
  resolveCorridorEvidence,
} from '../../../scripts/resolve-corridor-site.mjs';
import { prepareAlmaFixture } from '../../../tools/feed/alma-fixture.mjs';
import { preparePublisherFixture } from '../../../tools/feed/publisher-fixture.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

const verifierPath = fileURLToPath(import.meta.url);
const repo = resolve(dirname(verifierPath), '../../..');
const out = resolveCorridorEvidence();
const sha = (value) => createHash('sha256').update(value).digest('hex');
const engines = ['chromium', 'webkit'];
const results = [],
  errors = [],
  externalRequests = [];
const browserVersions = {};
const sources = [
  'prototypes/corridor/tools/verify-alma-reading.mjs',
  'prototypes/corridor/tools/record-test-support.mjs',
  'tools/feed/alma-fixture.mjs',
  'tools/feed/publisher-fixture.mjs',
  'packages/feed/test/full-reader/alma-fixtures.ts',
  'packages/feed/test/full-reader/alma/reviewed-rights-section.html',
  'packages/feed/test/full-reader/alma/policy-provenance.json',
  'packages/feed/test/full-reader/fixtures.ts',
].map((path) => ({ path, sha256: sha(readFileSync(resolve(repo, path))) }));
const verifierSha256 = sources[0].sha256;
let site, identity, host, fixtureReceipts;

function retain(file, bytes) {
  writeFileSync(resolve(out, file), bytes, { flag: 'wx' });
  return { path: file, sha256: sha(bytes) };
}

async function snapshot(page, name) {
  const state = await readAppRecordSnapshot(page);
  return { state, evidence: retain(name, JSON.stringify(state, null, 2) + '\n') };
}

async function screenshot(page, name) {
  const bytes = await page.screenshot({ fullPage: true });
  return retain(name, bytes);
}

async function journey(browser, engine, selected, core, now) {
  const name = `${selected.sourceId}-typed-credit-license-unknowns-save-and-reload`;
  const prefix = `${engine}-${selected.sourceId}`;
  const result = {
    engine,
    name,
    sourceId: selected.sourceId,
    pass: false,
    screenshots: [],
    snapshots: [],
  };
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) =>
    errors.push({
      engine,
      sourceId: selected.sourceId,
      message: error.message,
      stack: error.stack,
    }),
  );
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== host.origin) {
      externalRequests.push({ engine, sourceId: selected.sourceId, url: route.request().url() });
      return route.abort();
    }
    return route.continue();
  });
  try {
    const source = core.getFeedSource(selected.sourceId);
    const selection = core.publisherArticleRequest(selected.entry).selection;
    const refresh = core.parseFeedRefreshResult({
      sourceId: source.id,
      status: 'updated',
      entries: [selected.entry],
      checkedAt: now,
      lastSuccessAt: now,
      nextCheckAt: new Date(Date.parse(now) + source.cadence.minIntervalMs).toISOString(),
      latestPublishedAt: selected.entry.publishedAt,
      freshness: 'current',
      error: null,
    });
    const seed = {
      v: 1,
      taken: [],
      srs: {},
      revlog: [],
      obslog: [],
      feedLibrary: {
        v: 1,
        mutedSourceIds: core.SOURCE_REGISTRY.filter((row) => row.id !== source.id).map(
          (row) => row.id,
        ),
        savedReferences: [],
      },
    };
    await context.addInitScript(
      ({ selected, selection, refresh, seed }) => {
        // Only legacy migration input is seeded; the app creates and owns IndexedDB.
        if (!localStorage.getItem('kairo-alma-fixture-installed')) {
          localStorage.setItem('kairo-corridor-v1', JSON.stringify(seed));
          localStorage.setItem('kairo-alma-fixture-installed', '1');
        }
        window.publisherCalls = [];
        window.kairoFeeds = Object.freeze({
          async refresh(id) {
            if (id !== selected.sourceId) throw new Error('Unexpected synthetic source');
            return structuredClone(refresh);
          },
          async read(...args) {
            window.publisherCalls.push(args);
            if (args.length !== 1 || JSON.stringify(args[0]) !== JSON.stringify(selection))
              throw new Error('Unexpected synthetic publisher selection');
            return structuredClone(selected.result);
          },
        });
      },
      { selected, selection, refresh, seed },
    );
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    const before = await snapshot(page, `${prefix}-before.json`);
    result.snapshots.push(before.evidence);
    if (before.state.record.publisherLibrary !== undefined)
      assert.deepEqual(before.state.record.publisherLibrary.readings, []);
    await page.locator('#feed-link').click();
    await page.waitForSelector('[data-feed-read]');
    await page.locator('[data-feed-read]').click();
    await page.waitForSelector('#publisher-body');
    assert.equal(
      await page.locator('#publisher-body').textContent(),
      selected.result.candidate.article.body.text,
    );
    assert.equal(await page.locator('.publisher-license').textContent(), selected.license);
    assert.equal(
      await page.locator('.publisher-license').getAttribute('href'),
      selected.result.sourceDocument.license.url,
    );
    assert.equal(
      await page.locator('#publisher-original').getAttribute('href'),
      selected.entry.canonicalUrl,
    );
    for (const name of selected.names)
      assert((await page.locator('.publisher-credit-link').allTextContents()).includes(name));
    assert.equal(
      await page.locator('.publisher-author-unspecified').count(),
      selected.unknownAuthor ? 1 : 0,
    );
    if (selected.unknownAuthor)
      assert.match(
        await page.locator('.publisher-author-unspecified').innerText(),
        /Author not specified/u,
      );
    await page.locator('.publisher-details summary').click();
    const details = await page.locator('.publisher-details').innerText();
    if (selected.unknownUpdate) {
      assert.match(details, /Not supplied/u);
      assert.match(details, /\(RSS\)/u);
      assert(!details.includes('Invalid Date'));
    } else {
      assert(!details.includes('Not supplied'));
      assert(!details.includes('(RSS)'));
    }
    assert.equal(await page.locator('#publisher-body img,#publisher-body script').count(), 0);
    await waitForAppRecord(page, (record) => record.publisherLibrary.readings.length === 1, {
      description: 'selected original committed to native IndexedDB',
    });
    const saved = await snapshot(page, `${prefix}-saved.json`);
    assert.deepEqual(saved.state.record.publisherLibrary.readings, [selected.result]);
    assert.deepEqual(saved.state.installation, before.state.installation);
    assert(saved.state.revision > before.state.revision, 'Saving commits a native revision');
    assert.equal(
      saved.state.record.publisherLibrary.readings[0].candidate.editorial.status,
      'pending',
    );
    assert.deepEqual(await page.evaluate(() => window.publisherCalls), [[selection]]);
    result.snapshots.push(saved.evidence);
    result.screenshots.push(await screenshot(page, `${prefix}-credits.png`));

    await page.locator('#lang [data-lang="ja"]').click();
    assert.equal(await page.locator('#lang [data-lang="ja"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.publisher-license').textContent(), selected.license);
    await page.locator('.publisher-details summary').click();
    const japaneseDetails = await page.locator('.publisher-details').innerText();
    if (selected.unknownAuthor) {
      assert.equal(
        await page.locator('.publisher-author-unspecified').textContent(),
        '執筆者の記載なし',
      );
      assert.match(japaneseDetails, /更新: 記載なし/u);
      assert(
        (await page.locator('.publisher-credit-label').allTextContents()).includes('文章提供'),
      );
    } else {
      assert(!japaneseDetails.includes('記載なし'));
      for (const label of ['原文', '翻訳', '校正'])
        assert((await page.locator('.publisher-credit-label').allTextContents()).includes(label));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.locator('#publisher-body').textContent(),
      selected.result.candidate.article.body.text,
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    result.screenshots.push(await screenshot(page, `${prefix}-japanese-phone.png`));
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.locator('#publisher-back').click();
    await page.waitForSelector('[data-publisher-article]');
    await page.locator('[data-publisher-article]').click();
    await page.waitForSelector('#publisher-body');
    assert.equal(await page.locator('.publisher-license').textContent(), selected.license);
    assert.equal((await page.evaluate(() => window.publisherCalls)).length, 1);
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.locator('#feed-link').click();
    await page.locator('#feed-panel-articles').click();
    await page.locator('[data-publisher-article]').click();
    await page.waitForSelector('#publisher-body');
    assert.equal(await page.locator('.publisher-license').textContent(), selected.license);
    assert.equal(
      await page.locator('.publisher-license').getAttribute('href'),
      selected.result.sourceDocument.license.url,
    );
    assert.equal(
      await page.locator('#publisher-body').textContent(),
      selected.result.candidate.article.body.text,
    );
    assert.deepEqual(
      await page.evaluate(() => window.publisherCalls),
      [],
      'Reload reads the saved original without another publisher request',
    );
    const reloaded = await snapshot(page, `${prefix}-reloaded.json`);
    assert.deepEqual(reloaded.state.record.publisherLibrary.readings, [selected.result]);
    assert.deepEqual(reloaded.state.installation, saved.state.installation);
    result.snapshots.push(reloaded.evidence);
    Object.assign(result, {
      pass: true,
      details,
      japaneseDetails,
      receiptSha256: selected.result.receiptSha256,
      contentSha256: selected.result.candidate.article.body.contentSha256,
      nativeRevisions: {
        before: before.state.revision,
        saved: saved.state.revision,
        reloaded: reloaded.state.revision,
      },
    });
  } catch (error) {
    result.error = String(error.stack || error);
    try {
      result.screenshots.push(await screenshot(page, `${prefix}-failure.png`));
    } catch (error) {
      result.screenshotError = String(error.message);
    }
  } finally {
    await context.close();
    results.push(result);
    console.log(`${engine} ${name}: ${result.pass ? 'PASS' : result.error}`);
  }
}

try {
  site = resolveCorridorSite();
  identity = verifyBundledArtifact(site);
  const core = await import(pathToFileURL(resolve(site, 'modules/feed-core.mjs')).href);
  const fixtures = resolve(out, 'fixtures');
  mkdirSync(fixtures, { recursive: false });
  const alma = await prepareAlmaFixture({ repo, site, output: resolve(fixtures, 'alma') });
  const gv = await preparePublisherFixture({
    repo,
    site,
    output: resolve(fixtures, 'global-voices'),
  });
  const feedModule = identity.files.find((row) => row.path === 'modules/feed-core.mjs');
  for (const prepared of [alma, gv])
    assert.equal(prepared.receipt.stagedFeedModuleSha256, feedModule.sha256);
  fixtureReceipts = { alma: alma.receipt, globalVoices: gv.receipt };
  const gvEntry = gv.fixture.entry();
  const gvResult = core.createGlobalVoicesArticle(gvEntry, gv.fixture.response(gv.data.html));
  const almaResult = alma.fixture.make();
  for (const result of [gvResult, almaResult]) {
    assert.equal(result.status, 'full-reader');
    assert.equal(
      core.publisherReadingDetails(result).license.url,
      result.sourceDocument.license.url,
    );
  }
  const selections = [
    {
      sourceId: 'global-voices',
      entry: gvEntry,
      result: gvResult,
      license: 'CC BY 3.0',
      names: ['Fixture Author', '翻訳者', '校正者'],
      unknownAuthor: false,
      unknownUpdate: false,
    },
    {
      sourceId: 'alma-ja',
      entry: alma.fixture.entry(),
      result: almaResult,
      license: 'CC BY 4.0',
      names: ['国立天文台'],
      unknownAuthor: true,
      unknownUpdate: true,
    },
  ];
  host = await startStaticHost({ site, port: 0 });
  for (const engine of engines) {
    let browser;
    try {
      browser = await { chromium, webkit }[engine].launch();
      browserVersions[engine] = browser.version();
      for (const selected of selections)
        await journey(browser, engine, selected, core, alma.fixture.NOW);
    } catch (error) {
      errors.push({ engine, message: error.message, stack: error.stack });
    } finally {
      if (browser) await browser.close();
    }
  }
} catch (error) {
  errors.push({ phase: 'setup', message: error.message, stack: error.stack });
} finally {
  if (host)
    await host
      .close()
      .catch((error) => errors.push({ phase: 'server-close', message: error.message }));
  try {
    for (const source of sources)
      assert.equal(
        sha(readFileSync(resolve(repo, source.path))),
        source.sha256,
        `Test source stayed fixed: ${source.path}`,
      );
    if (identity)
      assert.equal(
        verifyBundledArtifact(site).artifactSha256,
        identity.artifactSha256,
        'Tested artifact stayed fixed',
      );
  } catch (error) {
    errors.push({ phase: 'final-integrity', message: error.message, stack: error.stack });
  }
  const receipt = {
    version: 1,
    suite: 'alma-reading',
    mode: 'full',
    engines,
    browserVersions,
    artifactSha256: identity?.artifactSha256 || null,
    runtimeOverridden: false,
    verifierSha256,
    sources,
    fixtureReceipts,
    artifact: identity
      ? {
          path: site,
          files: identity.files.length,
          sourceAssetSha256: identity.sourceAssetSha256,
          feedModule: identity.files.find((row) => row.path === 'modules/feed-core.mjs'),
        }
      : null,
    mechanism:
      'Complete verified canonical site; actual clicks, native IndexedDB readback, and reload. Synthetic renderer native port. No runtime overlays or live publisher requests.',
    results,
    errors,
    externalRequests,
    pass:
      results.length === 4 &&
      results.every((row) => row.pass) &&
      !errors.length &&
      !externalRequests.length,
    limitations: [
      'Synthetic article prose and reviewed policy fixture exercise UI and saved-record behavior, not current publisher availability',
      'Renderer transport is a synthetic native port; actual isolated TLS is covered by publisher-alma.test.cjs',
      'Receipt coherence does not confer source authority or editorial approval',
    ],
  };
  retain('receipt.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    JSON.stringify({
      pass: receipt.pass,
      results: results.length,
      errors,
      externalRequests,
      receipt: resolve(out, 'receipt.json'),
    }),
  );
  if (!receipt.pass) process.exitCode = 1;
}
