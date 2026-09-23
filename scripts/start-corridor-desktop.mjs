#!/usr/bin/env node
/** Prepare the same canonical runtime before launching the development host. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCorridorSite } from './resolve-corridor-site.mjs';
import hostStage from '../prototypes/bunki-desktop/tools/host-stage.cjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = resolve(root, 'prototypes/bunki-desktop');
try {
  assert(process.argv.length === 2, 'Usage: node scripts/start-corridor-desktop.mjs');
  assert(
    process.env.BUNKI_LIVE !== '1',
    'Development uses a verified immutable snapshot. Restart npm start after source edits instead of BUNKI_LIVE=1.',
  );
  const site = resolveCorridorSite();
  const require = createRequire(resolve(desktop, 'package.json'));
  const executable = require('electron');
  const stagingRoot = join(homedir(), '.dharma', 'bunki-desktop', 'development-hosts');
  mkdirSync(stagingRoot, { recursive: true });
  const run = mkdtempSync(join(stagingRoot, 'host-'));
  const staged = await hostStage.stageDesktopHost({
    root,
    desktop,
    output: join(run, 'runtime'),
  });
  writeFileSync(
    join(run, 'host-staging.json'),
    JSON.stringify(
      {
        hostSource: staged.hostSource,
        inputs: staged.inputs,
        nativeRpc: staged.nativeRpc,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  staged.verifyStaged();
  const env = { ...process.env, BUNKI_SRC_DIR: site };
  delete env.ELECTRON_RUN_AS_NODE;
  console.log('Bunki development snapshot: ' + site + '\nRestart this command after source edits.');
  const child = spawn(executable, ['.'], {
    cwd: staged.hostSource,
    env,
    stdio: 'inherit',
  });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  const cleanup = () => {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  child.once('error', (error) => {
    cleanup();
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
