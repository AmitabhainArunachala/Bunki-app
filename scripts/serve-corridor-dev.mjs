#!/usr/bin/env node
/** Foreground development server for one verified canonical snapshot. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticHost } from '../prototypes/bunki-desktop/lib/static-host.cjs';
import { resolveCorridorEvidence, resolveCorridorSite } from './resolve-corridor-site.mjs';

export async function startCorridorDev(port = 8000) {
  assert(
    Number.isInteger(port) && port >= 0 && port <= 65535,
    'Port must be an integer from 0 to 65535',
  );
  const site = resolveCorridorSite();
  const host = await startStaticHost({ site, port });
  const receipt = {
    status: 'ready',
    origin: host.origin,
    port: host.port,
    site,
    mode: 'immutable development snapshot',
    refresh: 'Restart this command after source edits.',
  };
  try {
    writeFileSync(
      join(resolveCorridorEvidence(), 'dev-server.json'),
      JSON.stringify(receipt, null, 2) + '\n',
    );
  } catch (error) {
    await host.close();
    throw error;
  }
  return { ...host, site, receipt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let host;
  try {
    const args = process.argv.slice(2);
    assert(
      args.length === 0 || (args.length === 2 && args[0] === '--port'),
      'Usage: serve-corridor-dev.mjs [--port <number>]',
    );
    host = await startCorridorDev(args.length ? Number(args[1]) : 8000);
    console.log(JSON.stringify(host.receipt));
    const stop = () => {
      void host.close().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    if (host) await host.close();
  }
}
