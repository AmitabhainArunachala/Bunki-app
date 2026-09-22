/* global window, top, location, TextEncoder, webkit, navigator, addEventListener */
(() => {
  'use strict';
  if (window !== top || location.origin !== 'http://localhost:43187') return;
  const intakeRequest = async (method, input, keys) => {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('invalid-input');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const names = Reflect.ownKeys(descriptors);
    if (names.length !== keys.length || names.some(name => !keys.includes(name) || !('value' in descriptors[name]))) {
      throw new Error('invalid-input');
    }
    const request = { method };
    for (const key of keys) request[key] = descriptors[key].value;
    return await webkit.messageHandlers.kairoIntake.postMessage(request);
  };
  Object.defineProperty(window, 'kairoIntake', {
    value: Object.freeze({
      available: () => intakeRequest('available', {}, []).then(value => value === true).catch(() => false),
      choose: input => intakeRequest('choose', input, ['expected']),
      extract: input => intakeRequest('extract', input, ['token', 'firstPage', 'lastPage']),
      openOriginal: input => intakeRequest('openOriginal', input, ['file']),
    }),
    configurable: false,
    writable: false,
  });
  const save = async ({ filename, mimeType, text }) => {
    if (
      typeof filename !== 'string' ||
      typeof mimeType !== 'string' ||
      typeof text !== 'string' ||
      new TextEncoder().encode(text).byteLength > 32 * 1024 * 1024
    ) {
      throw new Error('file-export-unavailable');
    }
    const result = await webkit.messageHandlers.kairoFiles.postMessage({
      filename,
      mimeType,
      text,
    });
    return result === true;
  };
  Object.defineProperty(window, 'kairoFiles', {
    value: Object.freeze({ save }),
    configurable: false,
    writable: false,
  });
  let storeHandler = null;
  let registrationId = null;
  const invoke = (method, args = {}) =>
    webkit.messageHandlers.kairoSync.postMessage({ method, ...args });
  const sync = {
    initialScope: () => invoke('initialScope'),
    async register({ binding }, handler) {
      if (typeof handler !== 'function') throw new Error('invalid-request');
      storeHandler = null;
      registrationId = null;
      const result = await invoke('register', { binding });
      registrationId = result.registrationId;
      storeHandler = handler;
      return result;
    },
    async unregister(args) {
      if (args.registrationId === registrationId) {
        storeHandler = null;
        registrationId = null;
      }
      return invoke('unregister', args);
    },
    status: (args) => invoke('status', args),
    connect: (args) => invoke('connect', args),
    sync: (args) => invoke('sync', args),
    disconnect: (args) => invoke('disconnect', args),
  };
  Object.defineProperty(window, 'kairoSync', {
    value: Object.freeze(sync),
    configurable: false,
    writable: false,
  });
  Object.defineProperty(window, '__kairoIOSStoreDispatch', {
    value: async (id, request) => {
      if (
        id !== registrationId ||
        !storeHandler ||
        !['snapshot', 'prepareNativeSnapshot', 'commitReceive', 'acknowledgeOutbox'].includes(
          request?.method,
        )
      ) {
        return { ok: false, error: { code: 'closed' } };
      }
      return await storeHandler(request);
    },
    configurable: false,
    writable: false,
  });
  Object.defineProperty(window, 'kairoIOSHost', {
    value: Object.freeze({ version: 1, storage: 'webkit-persistent', liveFeeds: false }),
    configurable: false,
    writable: false,
  });
  // Requesting persistence is advisory in WebKit. No success claim or storage
  // rewrite follows a declined request; file backups remain the portable copy.
  addEventListener(
    'load',
    () => {
      void navigator.storage?.persist?.().catch(() => {});
    },
    { once: true },
  );
})();
