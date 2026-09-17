#!/usr/bin/env node
/** Mac-only checks of the supported development launcher, with isolated data. */
/* global document */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from './resolve-corridor-site.mjs';
import hostStage from '../prototypes/bunki-desktop/tools/host-stage.cjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = join(ROOT, 'prototypes/bunki-desktop');
assert.equal(process.platform, 'darwin', 'This verifier exercises the actual local Mac host');
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 2 && args[0] === '--out'),
  'Usage: verify-corridor-desktop-dev.mjs [--out <external-evidence>]',
);
if (args.length) process.env.KAIRO_EVIDENCE_DIR = args[1];
const OUT = resolveCorridorEvidence();
const site = resolveCorridorSite();
const executable = createRequire(join(DESKTOP, 'package.json'))('electron');
const results = [];
let command;
let commandExit;
let application;

async function check(name, run) {
  try {
    const detail = await run();
    results.push({ name, pass: true, detail: detail ?? null });
    console.log('ok ' + name);
  } catch (error) {
    results.push({ name, pass: false, detail: error.message });
    throw error;
  }
}

async function environment(name, source = site) {
  const directory = join(OUT, name);
  mkdirSync(directory, { recursive: true });
  const listener = createServer();
  await new Promise((ok, fail) => {
    listener.once('error', fail);
    listener.listen(0, '127.0.0.1', ok);
  });
  const port = listener.address().port;
  await new Promise((ok) => listener.close(ok));
  assert.notEqual(port, 5198);
  const env = {
    ...process.env,
    KAIRO_SITE_DIR: site,
    KAIRO_EVIDENCE_DIR: directory,
    BUNKI_SRC_DIR: source,
    BUNKI_TEST_MODE: '1',
    BUNKI_TEST_PROFILE: join(directory, 'profile'),
    BUNKI_TEST_EVIDENCE: directory,
    BUNKI_TEST_PORT: String(port),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BUNKI_LIVE;
  return { directory, env, port };
}

const events = (directory) => {
  const file = join(directory, 'events.jsonl');
  return existsSync(file)
    ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : [];
};
async function stopCommand() {
  if (!command) return;
  try {
    process.kill(-command.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  const code = await Promise.race([commandExit, delay(5000).then(() => 'timeout')]);
  if (code === 'timeout') {
    process.kill(-command.pid, 'SIGKILL');
    await commandExit;
    throw Error('npm start process group did not stop');
  }
  command = undefined;
}

try {
  await check(
    'supported desktop npm start prepares and serves the supplied canonical artifact',
    async () => {
      const { directory, env } = await environment('npm-start');
      command = spawn('npm', ['start'], {
        cwd: DESKTOP,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let exited = false;
      command.stdout.on('data', (bytes) => {
        output += bytes;
      });
      command.stderr.on('data', (bytes) => {
        output += bytes;
      });
      commandExit = new Promise((ok) => {
        command.once('error', (error) => {
          output += error.message;
          exited = true;
          ok(1);
        });
        command.once('exit', (code) => {
          exited = true;
          ok(code);
        });
      });
      let ready;
      for (let attempt = 0; attempt < 600 && !exited; attempt += 1) {
        ready = events(directory).find((event) => event.event === 'window-ready');
        if (ready) break;
        await delay(100);
      }
      writeFileSync(join(directory, 'command.log'), output);
      assert(ready, output || 'The isolated window did not become ready');
      assert.equal(ready.packaged, false);
      assert.equal(ready.site, site);
      assert.equal(ready.profile, env.BUNKI_TEST_PROFILE);
      assert.equal(ready.live, false);
      assert.notEqual(ready.origin, 'http://localhost:5198');
      const response = await globalThis.fetch(ready.origin + '/modules/reading-core.mjs');
      assert.equal(response.status, 200);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        readFileSync(join(site, 'modules/reading-core.mjs')),
      );
      await stopCommand();
      await assert.rejects(globalThis.fetch(ready.origin + '/index.html'));
      return ready;
    },
  );
  await check('actual development Electron renderer boots the compiled reader', async () => {
    const { directory, env } = await environment('renderer');
    const staged = await hostStage.stageDesktopHost({
      root: ROOT,
      desktop: DESKTOP,
      output: join(directory, 'host-source'),
    });
    staged.verifyStaged();
    application = await _electron.launch({
      executablePath: executable,
      args: ['.'],
      cwd: staged.hostSource,
      env,
      timeout: 60_000,
      tracesDir: directory,
    });
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(() => document.body?.dataset.ready === '1', null, {
      timeout: 45_000,
    });
    const result = await page.evaluate(async () => {
      const controller = await import('/reading-controller.mjs');
      const core = await import('/modules/reading-core.mjs');
      return {
        length: controller.readingSettings().length,
        canonical: core.canonicalWebUrl('https://example.com/japan#news'),
        ready: document.body.dataset.ready,
      };
    });
    assert.deepEqual(result, {
      length: 'medium',
      canonical: 'https://example.com/japan',
      ready: '1',
    });
    assert.deepEqual(errors, []);
    assert.equal(await application.evaluate(({ app }) => app.getAppPath()), staged.hostSource);
    await page.screenshot({ path: join(directory, 'compiled-reader.png') });
    await application.close();
    application = undefined;
    return result;
  });
  await check(
    'raw Electron source startup fails clearly before opening an uncompiled app',
    async () => {
      const { directory, env } = await environment('raw-source', join(ROOT, 'prototypes/corridor'));
      const child = spawnSync(executable, ['.'], {
        cwd: DESKTOP,
        env,
        encoding: 'utf8',
        timeout: 45_000,
      });
      writeFileSync(join(directory, 'command.log'), child.stdout + child.stderr);
      assert.equal(child.status, 1, child.stderr || String(child.error));
      const history = events(directory);
      const failure = history.find((event) => event.event === 'startup-failed');
      assert(failure);
      assert.match(failure.message, /Development requires a compiled canonical site/u);
      assert(!history.some((event) => event.event === 'window-ready'));
    },
  );
  await check('unsupported live reload fails before staging or launching', async () => {
    const { directory, env } = await environment('live-guard');
    env.BUNKI_LIVE = '1';
    const child = spawnSync(process.execPath, ['scripts/start-corridor-desktop.mjs'], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    writeFileSync(join(directory, 'command.log'), child.stdout + child.stderr);
    assert.equal(child.status, 1, child.stderr || String(child.error));
    assert.match(child.stderr, /immutable snapshot/u);
    assert.deepEqual(events(directory), []);
  });
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (application) await application.close();
  if (command)
    await stopCommand().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  writeFileSync(
    join(OUT, 'verification-report.json'),
    JSON.stringify(
      {
        site,
        summary: {
          total: results.length,
          failed: results.filter((row) => !row.pass).length,
        },
        results,
        limits: [
          'Isolated development host and compiled-module boot only; packaged QA, real microphone and sync remain separate checks.',
        ],
      },
      null,
      2,
    ) + '\n',
  );
}
