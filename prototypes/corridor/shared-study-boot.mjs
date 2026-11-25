/** Study pairing, page start (ENGINE-ONE.3). index.html loads this module before corridor.js.
 *
 * A browser that holds a study pairing gets `globalThis.bunkiSharedStudyHost` here, before corridor.js is read, so
 * Bunki's ordinary Learn routes open the shared study engine on the learner's synced record. A browser that holds
 * none gets nothing: no host, no request, no engine code, and the app is as it was.
 *
 * Page start cannot wait for IndexedDB, where the credential is. So the answer comes from two marks in localStorage,
 * written by shared-study-pairing.mjs and shared-study-paired-host.mjs together with the credential's own record:
 * `bunki-shared-study:paired:v1` (this device holds a pairing) and `bunki-shared-study:ended:v1` (that pairing has
 * ended: the server refused it, or the learner is forgetting it). A host is bound when the first stands and the
 * second does not. Neither mark is the credential and neither opens anything by itself: the host bound here is a
 * shell that loads the real one (shared-study-paired-host.mjs) and its credential only when a study surface first
 * asks. A flag with no pairing behind it is taken away at that moment and the page is opened again as an unpaired
 * one.
 *
 * A page is one tab of several. When the pairing ends or changes in another tab, this one is told over a channel and
 * by the marks changing. A tab whose study surface is open stops there and says so (the real host does that); a tab
 * that has not opened study yet simply stops being a paired page.
 *
 * It also gives Settings its Nihongo Study panel (`globalThis.bunkiStudyPairing.settingsBlock`), filled by
 * shared-study-pairing.mjs when Settings is drawn. This file imports nothing, so that it costs an unpaired page one
 * small request and travels with the install.
 *
 * A one-time connect link (`#study-connect=<payload>`, see shared-study-pairing.mjs) carries a pairing code. It is
 * taken out of the address first of all, before this page reads anything else, whether or not the payload is any
 * good; the payload is then held in memory only and handed to the confirmation the pairing module shows. A voice link
 * (`#voice-connect=<payload>`, see modules/voice-connect.mjs) is taken out in the same place and the same way, and its
 * payload goes to the voice's own question. */
const LINK = '#study-connect=';
const VOICE_LINK = '#voice-connect=';
const env = globalThis;
/** The links' payloads, or null. Nothing else in this file runs before these lines. */
let offered = null, offeredVoice = null;
{
  let address = '';
  try { address = String(env.location?.hash || ''); } catch { address = ''; }
  if (address.startsWith(LINK)) {
    try { env.history.replaceState(env.history.state, '', `${env.location.pathname}${env.location.search}`); offered = address.slice(LINK.length); } catch {
      // an address that cannot be rewritten in place is left by loading the page again without the link
      try { env.location.replace(`${env.location.pathname}${env.location.search}`); } catch { /* nothing more can be done */ }
    }
  } else if (address.startsWith(VOICE_LINK)) {
    try { env.history.replaceState(env.history.state, '', `${env.location.pathname}${env.location.search}`); offeredVoice = address.slice(VOICE_LINK.length); } catch {
      try { env.location.replace(`${env.location.pathname}${env.location.search}`); } catch { /* nothing more can be done */ }
    }
  }
}
const MARKER = 'bunki-shared-study:paired:v1';
const ENDED = 'bunki-shared-study:ended:v1';
const CHANNEL = 'bunki-study-pairing';
const KIND = 'bunki-paired-study/v1';

const kept = (key) => { try { return env.localStorage?.getItem(key) || ''; } catch { return ''; } };
/** A pairing this device holds and that has not ended. */
const marked = () => kept(MARKER) === '1' && kept(ENDED) === '';
let hostModule = null, pairingModule = null;
const loadHost = () => (hostModule ||= import('./shared-study-paired-host.mjs').catch((error) => { hostModule = null; throw error; }));
const loadPairing = () => (pairingModule ||= import('./shared-study-pairing.mjs').catch((error) => { pairingModule = null; throw error; }));

function createLazyHost() {
  let opening = null, live = null, gone = false;
  /** Why this page's host has stopped ({ code, line }), or null. It does not start again: the page is reopened. */
  let closed = null;
  const listeners = new Set(), closers = new Set();
  const tell = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* an observer cannot undo anything */ } } };
  const shut = (code, line) => {
    if (closed) return;
    closed = Object.freeze({ code, line });
    for (const listener of [...closers]) { try { listener(closed); } catch { /* same */ } }
    tell();
  };
  const refusal = () => Object.assign(new Error(closed.code), { code: closed.code, bunkiLine: closed.line });
  const open = () => (opening ||= loadHost().then(async (module) => {
    const host = await module.openPairedStudyHost();
    if (gone) { await host.dispose(); throw new Error('study-host-disposed'); }
    host.subscribe(() => {
      const code = host.status().closed;
      if (code && !closed) void loadPairing().then((pairing) => shut(code, pairing.studyClosedLine(code)), () => shut(code, [code, code]));
      tell();
    });
    live = host;
    return host;
  }).catch((error) => { opening = null; throw error; }));
  const lazy = Object.freeze({
    kind: KIND,
    async withAdapter(callback) {
      if (closed) throw refusal();
      let host;
      try { host = await open(); } catch (error) {
        // the flag says paired and the device keeps no pairing that still is one: take the flag away and open the
        // page again unpaired
        if (error?.code === 'study-pairing-missing' || error?.code === 'study-pairing-ended') unbind(lazy);
        throw error;
      }
      return host.withAdapter(callback);
    },
    status: () => (live ? live.status() : { started: false, ended: closed !== null, closed: closed?.code ?? null, state: 'idle', error: null, unsent: null }),
    /** Why study has stopped on this page ({ code, line: [ja, en] }), or null. */
    closed: () => closed,
    /** Hear it stop: the study surface closes and says the line. Resolves a function that stops listening. */
    onClosed(listener) { closers.add(listener); return () => { closers.delete(listener); }; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Another tab said the pairing changed. An opened host asks the device itself; a tab that has not opened
     * study yet just stops being a paired page when the pairing is no more. */
    recheck() {
      if (closed || gone) return;
      if (live) { void live.verify(); return; }
      if (opening) return;
      void loadPairing().then((pairing) => pairing.studyPairingLive()).then((alive) => {
        if (alive || live || opening || closed) return;
        void loadPairing().then((pairing) => shut('study-pairing-changed', pairing.studyClosedLine('study-pairing-changed')));
        if (env.bunkiSharedStudyHost === lazy) delete env.bunkiSharedStudyHost;
      }).catch(() => { /* the device could not be read: nothing is concluded from that */ });
    },
    synchronize: () => live?.synchronize(),
    flushBeforeClose: () => live?.flushBeforeClose() ?? Promise.resolve(false),
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
  if (kept(MARKER) === '1') return; // the flag would bind again at once: leave the page as it is, with its plain refusal
  if (env.bunkiSharedStudyHost === host) delete env.bunkiSharedStudyHost;
  try { env.location?.reload?.(); } catch { /* the next page start is unpaired either way */ }
}

if (!env.bunkiSharedStudyHost && marked()) {
  const host = createLazyHost();
  env.bunkiSharedStudyHost = host;
  env.addEventListener?.('pagehide', (event) => {
    const closing = host.flushBeforeClose();
    if (event?.persisted !== true) void closing.finally(() => host.dispose()).catch(() => {});
  });
  // the other tabs of this browser: a channel, and the two marks changing (either alone reaches this tab)
  try { new env.BroadcastChannel(CHANNEL).onmessage = () => host.recheck(); } catch { /* no channel here */ }
  env.addEventListener?.('storage', (event) => { if (!event || event.key === null || event.key === MARKER || event.key === ENDED) host.recheck(); });
}

// the connect link's one question, shown once the page is there to show it in; the payload leaves this file with it
if (offered !== null) {
  const payload = offered;
  offered = null;
  void loadPairing().then((module) => module.offerStudyConnect(payload, { env })).catch(() => { /* no question, nothing kept */ });
}
// the voice link's one question, the same way
if (offeredVoice !== null) {
  const payload = offeredVoice;
  offeredVoice = null;
  void import('./modules/voice-connect.mjs').then((module) => module.offerVoiceConnect(payload, { env })).catch(() => { /* no question, nothing kept */ });
}

env.bunkiStudyPairing = Object.freeze({
  /** Settings, above the voice pairing: Nihongo Study on this device. `tx` and `el` are the app's own helpers. */
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
