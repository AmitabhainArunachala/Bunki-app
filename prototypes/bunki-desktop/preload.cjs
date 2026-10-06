'use strict';
/* global URL, location */

// Sandboxed preload: fixed feed operations expose no raw IPC, files, Node,
// credentials or renderer-selected network URLs.
const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('kairoFeeds', Object.freeze({
  listSources: () => ipcRenderer.invoke('bunki:feeds:list'),
  refresh: (sourceId) => ipcRenderer.invoke('bunki:feeds:refresh', sourceId),
  read: (selection) => ipcRenderer.invoke('bunki:feeds:read', selection),
}));

let syncRegistration = null;
let syncGeneration = 0;
ipcRenderer.on('bunki:sync:store-request', async (_event, input) => {
  const captured = syncRegistration;
  if (!captured || input?.registrationId !== captured.id ||
      typeof input.requestId !== 'string' ||
      !['snapshot', 'commitReceive', 'acknowledgeOutbox'].includes(input.method)) return;
  let response;
  try {
    response = await captured.handler({ requestId: input.requestId, method: input.method,
      ...(input.method === 'snapshot' ? {} : { request: input.request }) });
    if (syncRegistration !== captured) return;
    const text = JSON.stringify(response);
    // Bound before asking Electron to clone a renderer response. The main
    // process independently checks its UTF-8 bound and exact reply shape.
    if (typeof text !== 'string' || text.length > 32 * 1024 * 1024) throw new Error('invalid-response');
    ipcRenderer.send('bunki:sync:store-reply', { registrationId: captured.id, requestId: input.requestId, response });
  } catch {
    if (syncRegistration === captured) ipcRenderer.send('bunki:sync:store-reply', {
      registrationId: captured.id, requestId: input.requestId,
      response: { ok: false, error: { code: 'reopen-required' } },
    });
  }
});
contextBridge.exposeInMainWorld('kairoSync', Object.freeze({
  register: async (input, handler) => {
    if (typeof handler !== 'function') throw new Error('invalid-sync-handler');
    const generation = ++syncGeneration;
    syncRegistration = null;
    const result = await ipcRenderer.invoke('bunki:sync:register', input);
    if (generation !== syncGeneration) throw new Error('stale-sync-registration');
    syncRegistration = { id: result.registrationId, handler };
    return result;
  },
  unregister: (input) => {
    if (input?.registrationId === syncRegistration?.id) {
      ++syncGeneration;
      syncRegistration = null;
    }
    return ipcRenderer.invoke('bunki:sync:unregister', input);
  },
  status: (input) => ipcRenderer.invoke('bunki:sync:status', input),
  connect: (input) => ipcRenderer.invoke('bunki:sync:connect', input),
  sync: (input) => ipcRenderer.invoke('bunki:sync:sync', input),
  disconnect: (input) => ipcRenderer.invoke('bunki:sync:disconnect', input),
}));

// The isolated QA app retains its browser-download fixtures. Installed and
// development apps use the native dialog and report its actual save outcome.
async function enableNativeFiles() {
  try {
    if (await ipcRenderer.invoke('bunki:files:available')) {
      contextBridge.exposeInMainWorld('kairoFiles', Object.freeze({
        save: (input) => ipcRenderer.invoke('bunki:files:save', input),
      }));
    }
  } catch { /* The normal local browser download remains available. */ }
}
globalThis.addEventListener('DOMContentLoaded', () => { void enableNativeFiles(); }, { once: true });
contextBridge.exposeInMainWorld('kairoIntake', Object.freeze({
  available: () => ipcRenderer.invoke('bunki:intake:available'),
  choose: input => ipcRenderer.invoke('bunki:intake:choose', input),
  extract: input => ipcRenderer.invoke('bunki:intake:extract', input),
  openOriginal: input => ipcRenderer.invoke('bunki:intake:openOriginal', input),
}));

for (const type of ['pointerdown', 'keydown']) {
  globalThis.addEventListener(type, (event) => {
    if (event.isTrusted) ipcRenderer.send('bunki:trusted-input');
  }, true);
}

function linkGesture(event) {
  const anchor = event.target?.closest?.('a[href]');
  if (!anchor) return;
  let url;
  try {
    url = new URL(anchor.href);
  } catch {
    event.preventDefault();
    return;
  }
  // Export downloads are local blobs. They do not navigate or open a child.
  if (anchor.hasAttribute('download') && url.protocol === 'blob:' && url.origin === location.origin) return;
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    event.preventDefault();
    return;
  }
  if (url.origin !== location.origin || anchor.target === '_blank') {
    event.preventDefault();
    if (event.isTrusted && (event.button === 0 || event.button === 1)) {
      ipcRenderer.send(url.origin === location.origin ? 'bunki:navigate' : 'bunki:publisher', url.href);
    }
  }
}

globalThis.addEventListener('click', linkGesture, true);
globalThis.addEventListener('auxclick', linkGesture, true);
