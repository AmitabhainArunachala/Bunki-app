'use strict';

/** Register a fixed vocabulary, with no URL, headers, disk or raw IPC port. */
function installFeedIPC({ ipcMain, fromApp, service, reader }) {
  ipcMain.handle('bunki:feeds:list', (event, ...args) => {
    if (!fromApp(event)) throw new Error('feed-frame-forbidden');
    if (args.length) throw new Error('invalid-feed-arguments');
    return service.listSources();
  });
  ipcMain.handle('bunki:feeds:refresh', (event, ...args) => {
    if (!fromApp(event)) throw new Error('feed-frame-forbidden');
    if (args.length !== 1 || typeof args[0] !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/u.test(args[0])) throw new Error('invalid-feed-arguments');
    return service.refresh(args[0]);
  });
  ipcMain.handle('bunki:feeds:read', (event, ...args) => {
    if (!fromApp(event)) throw new Error('feed-frame-forbidden');
    if (args.length !== 1) throw new Error('invalid-feed-arguments');
    if (!reader) throw new Error('publisher-reader-unavailable');
    // The native reader validates the closed ID-only selection before it
    // consults trusted feed memory or derives any network URL.
    return reader.read(args[0]);
  });
}

module.exports = { installFeedIPC };
