#!/usr/bin/env node
/** Behavioral controls for canonical staging and the supported web dev command. */
/* global document, window */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { chromium } from 'playwright-core';
import {
  silenceBrowserAudio,
  TEST_AUDIO_OUTPUT,
} from '../prototypes/corridor/tools/browser-audio-silence.mjs';
import { resolveCorridorEvidence } from './resolve-corridor-site.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 2 && args[0] === '--out'),
  'Usage: verify-corridor-build.mjs [--out <external-evidence>]',
);
if (args.length) process.env.KAIRO_EVIDENCE_DIR = args[1];
const OUT = resolveCorridorEvidence();
const results = [];
let server;
let serverExit;
let browser;
let site;
let originalModule;

function check(name, run) {
  return Promise.resolve()
    .then(run)
    .then((detail) => {
      results.push({ name, pass: true, detail: detail ?? null });
      console.log('ok ' + name);
      return detail;
    })
    .catch((error) => {
      results.push({ name, pass: false, detail: error.message });
      throw error;
    });
}
function environment(directory, runtime) {
  mkdirSync(directory, { recursive: true });
  const env = { ...process.env, KAIRO_EVIDENCE_DIR: directory };
  // These controls assemble and mutate their own disposable artifacts. A
  // parent battery's pin names a different candidate, never this fixture.
  delete env.KAIRO_ARTIFACT_SHA256;
  delete env.KAIRO_VERIFIED_ARTIFACT_SHA256;
  if (runtime === undefined) delete env.KAIRO_SITE_DIR;
  else env.KAIRO_SITE_DIR = runtime;
  return env;
}
function resolveInChild(directory, runtime) {
  const code = `import {resolveCorridorSite} from ${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/resolve-corridor-site.mjs')).href)};
    const first=resolveCorridorSite(); const second=resolveCorridorSite();
    if(first!==second)throw Error('Runtime changed within a process'); console.log(JSON.stringify({site:first}));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: ROOT,
    env: environment(directory, runtime),
    encoding: 'utf8',
    timeout: 120_000,
  });
  writeFileSync(join(directory, 'child.log'), child.stdout + child.stderr);
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const selections = readdirSync(directory).filter((name) => name.startsWith('runtime-'));
  assert.equal(selections.length, 1, 'Only one runtime may be selected per process');
  const receipt = JSON.parse(readFileSync(join(directory, selections[0], 'selection.json')));
  return {
    site: JSON.parse(child.stdout).site,
    receipt,
    selection: join(directory, selections[0]),
  };
}
async function stopServer() {
  if (!server) return;
  try {
    if (process.platform === 'win32') server.kill('SIGTERM');
    else if (server.pid) process.kill(-server.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  const result = await Promise.race([serverExit, delay(5000).then(() => 'timeout')]);
  if (result === 'timeout') {
    if (process.platform === 'win32') server.kill('SIGKILL');
    else process.kill(-server.pid, 'SIGKILL');
    await serverExit;
    throw new Error('Foreground dev server did not stop');
  }
  server = undefined;
}

try {
  const assembled = await check(
    'default resolver assembles one complete runtime outside the checkout',
    () => {
      const result = resolveInChild(join(OUT, 'default-selection'));
      assert.equal(result.receipt.mode, 'assembled');
      assert.equal(result.receipt.status, 'passed');
      assert(result.site.startsWith(OUT + '/'));
      assert(existsSync(join(result.site, 'modules/reading-core.mjs')));
      assert(existsSync(join(result.site, 'reading-controller.mjs')));
      assert(result.receipt.modules[0].inputs.length > 0);
      return result;
    },
  );
  site = assembled.site;
  originalModule = readFileSync(join(site, 'modules/reading-core.mjs'));
  await check('supplied artifact is reused without a second build', () => {
    const result = resolveInChild(join(OUT, 'supplied-selection'), site);
    assert.equal(result.site, site);
    assert.equal(result.receipt.mode, 'supplied');
    assert.equal(result.receipt.artifactSha256, assembled.receipt.artifactSha256);
    assert(!existsSync(join(result.selection, 'site')));
    return result.receipt;
  });
  const devDirectory = join(OUT, 'web-dev');
  const readyFile = join(devDirectory, 'dev-server.json');
  await check('supported npm web dev command serves exact compiled bytes', async () => {
    server = spawn('npm', ['run', 'bunki:web:dev', '--', '--port', '0'], {
      cwd: ROOT,
      env: environment(devDirectory, site),
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    server.stdout.on('data', (bytes) => {
      output += bytes;
    });
    server.stderr.on('data', (bytes) => {
      output += bytes;
    });
    let exited = false;
    serverExit = new Promise((accept) => {
      server.once('error', (error) => {
        exited = true;
        output += error.message;
        accept(1);
      });
      server.once('exit', (code) => {
        exited = true;
        accept(code);
      });
    });
    for (let attempt = 0; attempt < 600 && !existsSync(readyFile) && !exited; attempt += 1)
      await delay(100);
    writeFileSync(join(devDirectory, 'command.log'), output);
    assert(existsSync(readyFile), output || 'Dev server never became ready');
    const ready = JSON.parse(readFileSync(readyFile));
    assert.equal(ready.site, site);
    const response = await globalThis.fetch(ready.origin + '/modules/reading-core.mjs');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/u);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), originalModule);
    assert.equal((await globalThis.fetch(ready.origin + '/modules/missing.mjs')).status, 404);
    return ready;
  });
  const { origin } = JSON.parse(readFileSync(readyFile));
  await check(
    'real browser boots and executes the compiled core plus authored controller',
    async () => {
      browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
      const context = await browser.newContext();
      await silenceBrowserAudio(context);
      const errors = [];
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin + '/?entry=shelf');
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
        timeout: 30000,
      });
      const result = await page.evaluate(async () => {
        const core = await import('/modules/reading-core.mjs');
        const controller = await import('/reading-controller.mjs');
        const feed = await import('/modules/feed-core.mjs');
        const sourceController = await import('/feed-controller.mjs');
        const assessments = await import('/assessment-controller.mjs');
        const recordCore = await import('/modules/record-core.mjs');
        const publishers = await import('/publisher-controller.mjs');
        const recordController = await import('/record-controller.mjs');
        const recordHost = await import('/record-host.mjs');
        let rejected = false;
        try {
          core.canonicalWebUrl('javascript:alert(1)');
        } catch {
          rejected = true;
        }
        return {
          canonical: core.canonicalWebUrl('https://www.asahi.com/articles/example#part'),
          rejected,
          length: controller.readingSettings().length,
          sources: Object.keys(feed.SOURCE_REGISTRY).length,
          feedParser: typeof feed.parseFeedXml,
          sourceLibrary: sourceController.parseFeedLibrary(null).v,
          assessmentLibrary: assessments.createLibrary({
            scope: { accountId: 'dev-fixture', learnerId: 'learner' },
          }).v,
          recordStore: typeof recordCore.IndexedDbReplicationStore.open,
          recordController: typeof recordController.createRecordController,
          recordHost: typeof recordHost.createRecordHost,
          publisherLibrary: publishers.parsePublisherLibrary(null).v,
          articles: document.querySelectorAll('.shelf-item').length,
        };
      });
      assert.equal(result.canonical, 'https://www.asahi.com/articles/example');
      assert.equal(result.rejected, true);
      assert.equal(result.length, 'medium');
      assert.equal(result.feedParser, 'function');
      assert.equal(result.sourceLibrary, 1);
      assert.equal(result.assessmentLibrary, 1);
      assert.equal(result.recordStore, 'function');
      assert.equal(result.recordController, 'function');
      assert.equal(result.recordHost, 'function');
      assert.equal(result.publisherLibrary, 1);
      assert(result.sources >= 5);
      assert(result.articles >= 24);
      await page.locator('#feed-link').click();
      await page.locator('#feed-panel-sources').click();
      assert.equal(await page.locator('.feed-source').count(), result.sources);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(OUT, 'dev-compiled-runtime.png') });
      await browser.close();
      browser = undefined;
      return result;
    },
  );
  await check(
    'standalone boots offline with the bundled controller and strict shared parser',
    async () => {
      const output = join(OUT, 'corridor-standalone.html');
      const directory = join(OUT, 'standalone-build');
      const child = spawnSync(
        process.execPath,
        ['prototypes/corridor/tools/build-standalone.mjs', output],
        { cwd: ROOT, env: environment(directory, site), encoding: 'utf8', timeout: 120_000 },
      );
      writeFileSync(join(directory, 'child.log'), child.stdout + child.stderr);
      assert.equal(child.status, 0, child.stderr || String(child.error));
      const bundleReceipt = JSON.parse(readFileSync(output + '.build.json'));
      browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
      const context = await browser.newContext();
      await silenceBrowserAudio(context);
      await context.setOffline(true);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const standaloneUrl = pathToFileURL(output);
      standaloneUrl.searchParams.set('entry', 'shelf');
      await page.goto(standaloneUrl.href);
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
        timeout: 30000,
      });
      const result = await page.evaluate(async () => {
        const url = window.__KAIRO_READING_CONTROLLER_URL__;
        const controller = await import(url);
        const sources = await import(window.__KAIRO_FEED_CONTROLLER_URL__);
        const assessments = await import(window.__KAIRO_ASSESSMENT_CONTROLLER_URL__);
        const publishers = await import(window.__KAIRO_PUBLISHER_CONTROLLER_URL__);
        const controllerBytes = await (await window.fetch(url)).arrayBuffer();
        const controllerSha256 = [
          ...new Uint8Array(await window.crypto.subtle.digest('SHA-256', controllerBytes)),
        ]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        let rejected = false;
        try {
          controller.parseArticleCandidate({});
        } catch {
          rejected = true;
        }
        return {
          embedded: url.startsWith('blob:'),
          controllerSha256,
          length: controller.readingSettings().length,
          rejected,
          ready: document.body.dataset.ready,
          sourceLibrary: sources.parseFeedLibrary(null).v,
          assessmentLibrary: assessments.createLibrary({
            scope: { accountId: 'standalone-fixture', learnerId: 'learner' },
          }).v,
          publisherLibrary: publishers.parsePublisherLibrary(null).v,
        };
      });
      assert.deepEqual(result, {
        embedded: true,
        controllerSha256: bundleReceipt.controllerSha256,
        length: 'medium',
        rejected: true,
        ready: '1',
        sourceLibrary: 1,
        assessmentLibrary: 1,
        publisherLibrary: 1,
      });
      await page.locator('#feed-link').click();
      await page.locator('#feed-panel-sources').click();
      assert((await page.locator('.feed-source').count()) >= 5);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(OUT, 'standalone-offline.png') });
      await browser.close();
      browser = undefined;
      return bundleReceipt;
    },
  );
  await stopServer();
  for (const defect of ['missing', 'stale']) {
    await check(defect + ' compiled module fails dev startup without rebuilding or serving', () => {
      if (defect === 'missing') unlinkSync(join(site, 'modules/reading-core.mjs'));
      else
        writeFileSync(
          join(site, 'modules/reading-core.mjs'),
          Buffer.concat([originalModule, Buffer.from('\nexport const staleFixture = true;\n')]),
        );
      const directory = join(OUT, defect);
      try {
        const child = spawnSync(
          process.execPath,
          ['scripts/serve-corridor-dev.mjs', '--port', '0'],
          { cwd: ROOT, env: environment(directory, site), encoding: 'utf8', timeout: 30_000 },
        );
        writeFileSync(join(directory, 'child.log'), child.stdout + child.stderr);
        assert.equal(child.status, 1, child.stderr || String(child.error));
        assert.match(child.stderr, /Artifact contents differ/u);
        assert(!existsSync(join(directory, 'dev-server.json')));
        const selection = readdirSync(directory).find((name) => name.startsWith('runtime-'));
        assert(selection);
        assert.equal(
          JSON.parse(readFileSync(join(directory, selection, 'selection.json'))).status,
          'failed',
        );
        assert(!existsSync(join(directory, selection, 'site')));
      } finally {
        writeFileSync(join(site, 'modules/reading-core.mjs'), originalModule);
      }
    });
  }
  await check('raw source and in-repo evidence are rejected before serving', () => {
    for (const [directory, runtime] of [
      [join(OUT, 'raw-source'), join(ROOT, 'prototypes/corridor')],
      [ROOT, site],
    ]) {
      const child = spawnSync(process.execPath, ['scripts/serve-corridor-dev.mjs', '--port', '0'], {
        cwd: ROOT,
        env:
          directory === ROOT
            ? { ...process.env, KAIRO_EVIDENCE_DIR: ROOT, KAIRO_SITE_DIR: runtime }
            : environment(directory, runtime),
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.equal(child.status, 1, child.stderr || String(child.error));
      assert(!child.stdout.includes('"status":"ready"'));
    }
    assert(!existsSync(join(ROOT, 'prototypes/corridor/modules/reading-core.mjs')));
  });
  await check('builders reject unsafe or pre-existing output without replacement', () => {
    const directory = join(OUT, 'output-boundaries');
    const env = environment(directory, site);
    const outside = join(tmpdir(), `kairo-build-must-not-exist-${process.pid}`);
    assert(!existsSync(outside));
    for (const output of [ROOT, outside, site]) {
      const child = spawnSync(
        process.execPath,
        ['scripts/build-corridor-site.mjs', '--out', output],
        { cwd: ROOT, env, encoding: 'utf8', timeout: 30_000 },
      );
      assert.equal(child.status, 1, child.stderr || String(child.error));
    }
    const html = join(OUT, 'corridor-standalone.html');
    const original = readFileSync(html);
    const child = spawnSync(
      process.execPath,
      ['prototypes/corridor/tools/build-standalone.mjs', html],
      { cwd: ROOT, env, encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(child.status, 1, child.stderr || String(child.error));
    assert.deepEqual(readFileSync(html), original);
    assert(!existsSync(outside));
    assert.deepEqual(readFileSync(join(site, 'modules/reading-core.mjs')), originalModule);
  });
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server)
    await stopServer().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  if (site && originalModule) writeFileSync(join(site, 'modules/reading-core.mjs'), originalModule);
  writeFileSync(
    join(OUT, 'verification-report.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        site,
        testAudioOutput: TEST_AUDIO_OUTPUT,
        audioSilenceHelperSha256: createHash('sha256')
          .update(readFileSync(join(ROOT, 'prototypes/corridor/tools/browser-audio-silence.mjs')))
          .digest('hex'),
        summary: {
          total: results.length,
          failed:
            results.filter((row) => !row.pass).length +
            (process.exitCode && results.every((row) => row.pass) ? 1 : 0),
        },
        results,
        limits: [
          'Build/dev-module execution only; no provider generation or article quality claim.',
        ],
      },
      null,
      2,
    ) + '\n',
  );
}
