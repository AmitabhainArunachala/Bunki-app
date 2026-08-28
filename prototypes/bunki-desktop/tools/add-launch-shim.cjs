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

const appPath = process.argv[2];
if (!appPath) {
  console.error('usage: node add-launch-shim.cjs <path/to/Bunki.app>');
  process.exit(1);
}

const macos = path.join(appPath, 'Contents', 'MacOS');
const main = path.join(macos, 'Bunki');
const real = path.join(macos, 'Bunki-bin');

const head = fs.readFileSync(main).subarray(0, 2).toString();
if (head === '#!') {
  console.log('shim already in place');
  process.exit(0);
}

fs.renameSync(main, real);
fs.writeFileSync(
  main,
  '#!/bin/bash\nunset ELECTRON_RUN_AS_NODE\nexec "${0%/*}/Bunki-bin" "$@"\n',
  { mode: 0o755 },
);
console.log('launch shim installed');
