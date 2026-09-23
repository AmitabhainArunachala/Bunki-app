'use strict';

/**
 * Wrap the packaged app's main executable in a tiny shell shim that strips
 * ELECTRON_RUN_AS_NODE before exec. Electron-host environments (Cursor,
 * Claude Desktop, VS Code terminals) leak that variable into child shells;
 * with it set, the Electron binary boots as plain node and exits silently.
 * Idempotent: safe to run after every electron-builder pass.
 */

const fs = require('node:fs');
const path = require('node:path');
const { externalPath } = require('../lib/paths.cjs');

const appPath = process.argv[2];
if (!appPath) {
  console.error('usage: node add-launch-shim.cjs <path/to/Bunki.app>');
  process.exit(1);
}
externalPath(appPath);

const macos = path.join(appPath, 'Contents', 'MacOS');
const main = path.join(macos, 'Bunki');
const real = path.join(macos, 'Bunki-bin');

const shim = '#!/bin/bash\nunset ELECTRON_RUN_AS_NODE\nexec "${0%/*}/Bunki-bin" "$@"\n';
if (fs.lstatSync(main).isSymbolicLink()) throw new Error('The launch executable must not be a symlink.');
const original = fs.readFileSync(main);
const head = original.subarray(0, 2).toString();
if (head === '#!') {
  if (original.toString() !== shim || !fs.statSync(real).isFile()) throw new Error('Unexpected existing launch shim.');
  console.log('shim already in place');
  process.exit(0);
}
if (fs.existsSync(real)) throw new Error('The backing executable already exists; no files were replaced.');
if (original.length < 4 || ![0xfeedfacf, 0xcafebabe, 0xbebafeca].includes(original.readUInt32LE(0))) {
  throw new Error('The app does not contain an expected Mach-O executable.');
}

fs.renameSync(main, real);
fs.writeFileSync(
  main,
  shim,
  { mode: 0o755 },
);
console.log('launch shim installed');
