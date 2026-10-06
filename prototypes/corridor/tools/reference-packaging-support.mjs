/** Exercise installation of the actual stamped runtime without a browser. */
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

export function packagedSite() { return resolveCorridorSite(); }

export async function installPackagedWorker({ corrupt = null } = {}) {
  const site = packagedSite();
  const scope = 'https://packaging.invalid/bunki/';
  const stores = new Map();
  const events = {};
  const requested = [];
  // Node 22 can finalize the consumed clone's tee while the original branch
  // is still waiting for the remaining assets. Keep response copies alive
  // for this install, as a browser owns them until the event settles.
  const responseCopies = [];
  class InstallResponse extends Response {
    clone() {
      const copy = super.clone();
      responseCopies.push(copy);
      return copy;
    }
  }
  const context = {
    self: { registration: { scope }, addEventListener: (name, callback) => { events[name] = callback; } },
    URL, Request, Response: InstallResponse, Headers, TextEncoder, TextDecoder, crypto: webcrypto,
    caches: {
      keys: async () => [...stores.keys()],
      delete: async name => stores.delete(name),
      open: async name => {
        if (!stores.has(name)) stores.set(name, new Map());
        const entries = stores.get(name);
        return {
          put: async (url, response) => { entries.set(url, response.clone()); },
          match: async url => entries.get(url)?.clone(),
        };
      },
    },
    fetch: async request => {
      const url = new URL(request.url);
      assert(url.href.startsWith(scope), 'No external network is available to this verifier');
      const path = decodeURIComponent(url.href.slice(scope.length));
      assert(path && !path.split('/').some(part => part === '..' || part === '.'));
      requested.push(path);
      let bytes = readFileSync(resolve(site, path));
      if (path === corrupt) bytes = Buffer.concat([bytes, Buffer.from(' ')]);
      return new Response(bytes, { status: 200 });
    },
  };
  vm.runInNewContext(readFileSync(resolve(site, 'sw.js'), 'utf8'), context);
  let pending;
  events.install({ waitUntil: task => { pending = task; } });
  assert(pending, 'The actual worker must own an install completion');
  if (corrupt) {
    await assert.rejects(pending, /asset exceeds declared length|asset does not belong to installed release/);
    assert.equal(stores.size, 0, 'An invalid generation must not publish a candidate cache');
    return { requested, cached: [] };
  }
  await pending;
  assert(responseCopies.length > 0, 'The unchanged worker must clone its verified responses');
  assert.equal(stores.size, 1);
  const [cacheName, entries] = [...stores][0];
  assert(cacheName.startsWith(`kairo:${scope}:kairo-`));
  const cached = [...entries.keys()].map(url => url.slice(scope.length));
  return { requested, cached };
}
