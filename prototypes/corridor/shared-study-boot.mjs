/** Study pairing, page start (ENGINE-ONE.3). index.html loads this module before corridor.js.
 *
 * A browser that holds a study pairing gets `globalThis.bunkiSharedStudyHost` here, before corridor.js is read, so
 * Bunki's ordinary Learn routes open the shared study engine on the learner's synced record. A browser that holds
 * none gets nothing: no host, no request, no engine code, and the app is as it was.
 *
 * Page start cannot wait for IndexedDB, where the credential is. So the answer comes from one flag in localStorage
 * (`bunki-shared-study:paired:v1`, written and removed by shared-study-pairing.mjs together with the credential).
 * The flag is not the credential and opens nothing by itself: the host bound here is a shell that loads the real one
 * (shared-study-paired-host.mjs) and its credential only when a study surface first asks. A flag with no credential
 * behind it is taken away at that moment and the page is opened again as an unpaired one.
 *
 * It also gives Settings its study block (`globalThis.bunkiStudyPairing.settingsBlock`), filled by
 * shared-study-pairing.mjs when Settings is drawn. This file imports nothing, so that it costs an unpaired page one
 * small request and travels with the install. */
const MARKER = 'bunki-shared-study:paired:v1';
const KIND = 'bunki-paired-study/v1';
const env = globalThis;

const marked = () => { try { return env.localStorage?.getItem(MARKER) === '1'; } catch { return false; } };
let hostModule = null, pairingModule = null;
const loadHost = () => (hostModule ||= import('./shared-study-paired-host.mjs').catch((error) => { hostModule = null; throw error; }));
const loadPairing = () => (pairingModule ||= import('./shared-study-pairing.mjs').catch((error) => { pairingModule = null; throw error; }));

function createLazyHost() {
  let opening = null, live = null, gone = false;
  const listeners = new Set();
  const tell = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* an observer cannot undo anything */ } } };
  const open = () => (opening ||= loadHost().then(async (module) => {
    const host = await module.openPairedStudyHost();
    if (gone) { await host.dispose(); throw new Error('study-host-disposed'); }
    host.subscribe(tell);
    live = host;
    return host;
  }).catch((error) => { opening = null; throw error; }));
  const lazy = Object.freeze({
    kind: KIND,
    async withAdapter(callback) {
      let host;
      try { host = await open(); } catch (error) {
        // the flag says paired and the device keeps no pairing: take the flag away and open the page again unpaired
        if (error?.code === 'study-pairing-missing') unbind(lazy);
        throw error;
      }
      return host.withAdapter(callback);
    },
    status: () => (live ? live.status() : { started: false, ended: false, state: 'idle', error: null }),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async dispose() {
      gone = true;
      listeners.clear();
      const host = live; live = null;
      if (host) await host.dispose();
    },
  });
  return lazy;
}

function unbind(host) {
  try { env.localStorage?.removeItem(MARKER); } catch { /* checked below */ }
  if (marked()) return; // the flag would bind again at once: leave the page as it is, with its plain refusal
  if (env.bunkiSharedStudyHost === host) delete env.bunkiSharedStudyHost;
  try { env.location?.reload?.(); } catch { /* the next page start is unpaired either way */ }
}

if (!env.bunkiSharedStudyHost && marked()) {
  const host = createLazyHost();
  env.bunkiSharedStudyHost = host;
  env.addEventListener?.('pagehide', (event) => { if (event?.persisted !== true) void host.dispose().catch(() => {}); });
}

env.bunkiStudyPairing = Object.freeze({
  /** Settings, beside the voice pairing: this device's study pairing. `tx` and `el` are the app's own helpers. */
  settingsBlock({ tx, el }) {
    const block = el('div', 'settings-study-device');
    block.id = 'settings-study-device';
    block.dataset.state = 'loading';
    const bound = env.bunkiSharedStudyHost?.kind === KIND ? env.bunkiSharedStudyHost : null;
    void loadPairing().then((module) => module.fillStudyPairingBlock(block, { tx, el, host: bound }))
      .catch(() => { block.dataset.state = 'unavailable'; block.hidden = true; });
    return block;
  },
});
