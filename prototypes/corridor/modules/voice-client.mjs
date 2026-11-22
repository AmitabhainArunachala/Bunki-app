/** Bunki's client for the voice server: the three speak routes of the Nihongo Worker, client contract v1 (speech
 * team, 2026-11-10). It pairs once, keeps the speak-only token on this device, sends one sentence a request and
 * names every failure by the contract's own code. It decides nothing about fallback; modules/voice-seam.mjs does.
 *
 * The request is built with the speech team's own functions, carried unchanged in ./nihongo-speech (SOURCE.json):
 * `createSpeechInput` computes the input key, `SPEAK_PROFILE` is the one approved profile, and the text and voice-key
 * rules are theirs. Nothing here chooses a voice.
 *
 * The server's address is not in this code: this repository is public and the Worker is the learner's own. The
 * address arrives with the pairing line the learner pastes ("… · server: https://….workers.dev") and is kept on this
 * device beside the token. Until then the client knows no server and can ask nothing of anyone.
 *
 * The token: it works on /v1/audio/speak and /v1/audio/budget only and does not expire; a 401 ends it. It is kept per
 * origin in IndexedDB, encrypted with a key this browser will not export, in a database of its own that no backup or
 * export of the learner record reads. It is never logged, shown, or returned by any function here. */
import { createSpeechInput } from './nihongo-speech/audio/speech-input.mjs';
import { SPEAK_PROFILE } from './nihongo-speech/audio/speak-keys.mjs';
import { MAX_DYNAMIC_CODEPOINTS, isJapaneseEnough, isVoiceKey, normaliseSpeechText } from './nihongo-speech/audio/speech-text.mjs';

const CODE = /^[A-F0-9]{12}$/;
const LEARNER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TOKEN = /^nsrs_prod_[A-Za-z0-9_-]{4,512}\.[a-f0-9]{64}$/;
const INSTALLATION = /^bunki-[a-f0-9]{32}$/;
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
/** A voice server is a Cloudflare Worker's own https origin, no path; or a stand-in on this machine, for tests. */
const SERVER = new RegExp(`^(?:https://(?:${LABEL}\\.)+workers\\.dev|http://(?:127\\.0\\.0\\.1|localhost):\\d{1,5})$`);
export const isVoiceServer = (value) => typeof value === 'string' && value.length <= 200 && SERVER.test(value);

const PAIR_CODES = new Set(['invalid-pairing', 'authentication-required', 'installation-exists', 'authentication-rate-limit', 'pairing-unavailable']);
const SPEAK_CODES = new Set(['speech-input-invalid', 'speech-input-not-normal', 'japanese-only', 'profile-not-approved',
  'authentication-required', 'budget-exhausted', 'not-in-release', 'speech-input-too-large', 'day-budget', 'request-rate-limit',
  'voice-unavailable', 'server-failed', 'upgrade-required']);
/** The code an answer carries when its body names none the contract knows: a 401 ends the pairing, a 426 asks for a newer
 * app (its line says to update, not to tap again), anything else is the server's failure. */
const STATUS_CODES = new Map([[401, 'authentication-required'], [426, 'upgrade-required']]);

export class VoiceError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.name = 'VoiceError';
    this.code = code;
    this.status = status;
  }
}

/** What John gives: the 12-character code and his learner id, typed, or one pasted line that fills everything.
 * The line the pairing step of the speech team's "Bunki Voice" launcher prints is
 *   Bunki voice code: XXXXXXXXXXXX (10 minutes) · learner: <id> · server: https://<worker>.workers.dev
 * and "<learner> <code>" is taken too. The code is upper-cased; the learner id is taken as written. `server` is in
 * the answer only when the text carried one. */
export function parsePairing(input) {
  const bad = { error: 'invalid-pairing' };
  if (!input || typeof input !== 'object') return bad;
  let code = typeof input.code === 'string' ? input.code : '';
  let learner = typeof input.learner === 'string' ? input.learner.trim() : '';
  let both = `${learner} ${code}`;
  let server = null;
  const address = /server:\s*(\S+)/i.exec(both);
  if (address) {
    server = address[1].replace(/[·,;.)\]]+$/u, '').replace(/\/+$/u, '');
    if (!isVoiceServer(server)) return bad;
    both = both.replace(address[0], ' ');
    learner = learner.replace(address[0], ' ').trim();
    code = code.replace(address[0], ' ');
  }
  const printed = /learner:\s*([A-Za-z0-9][A-Za-z0-9._-]*)/i.exec(both);
  if (printed) {
    learner = printed[1];
    code = /(?:^|[^A-Za-z0-9])([A-Fa-f0-9]{12})(?![A-Za-z0-9])/.exec(both.replace(printed[0], ' '))?.[1] || '';
  } else {
    const line = /^(\S+)\s+(\S.*)$/.exec(learner);
    if (line && !code.trim()) { learner = line[1]; code = line[2]; }
  }
  code = code.replace(/[\s-]+/gu, '').toUpperCase();
  if (!CODE.test(code) || !LEARNER.test(learner) || /^nsrs_/i.test(learner)) return bad;
  return server ? { code, learner, server } : { code, learner };
}

/** The voice link (LEAN, 2026-11-22): `<bunki origin>/#voice-connect=<payload>`, the payload base64url of the JSON
 * {"v":1,"code","learner","server"}. The learner's own "Bunki Voice" opens it or hands it to him; nobody types it.
 * shared-study-boot.mjs takes it out of the address before anything else runs, and the payload is held in memory only. */
export const VOICE_CONNECT_FRAGMENT = 'voice-connect';
const LINK_FIELDS = 'code,learner,server,v';
/** Read a voice link's payload under the pairing line's own rules: the code's form, the learner id and the server's
 * form. Resolves { code, learner, server } or { error: 'invalid-link' } for anything that is not a whole payload of
 * version 1. */
export function parseVoiceConnect(text) {
  const bad = { error: 'invalid-link' };
  if (typeof text !== 'string' || text.length > 2000 || !/^[A-Za-z0-9_-]+={0,2}$/.test(text)) return bad;
  let value;
  try {
    const plain = text.replace(/=+$/u, '').replace(/-/g, '+').replace(/_/g, '/');
    value = JSON.parse(atob(plain.padEnd(Math.ceil(plain.length / 4) * 4, '=')));
  } catch { return bad; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1 || Object.keys(value).sort().join() !== LINK_FIELDS) return bad;
  const code = typeof value.code === 'string' ? value.code.replace(/[\s-]+/gu, '').toUpperCase() : '';
  const { learner } = value;
  const server = typeof value.server === 'string' ? value.server.replace(/\/+$/u, '') : '';
  if (!CODE.test(code) || typeof learner !== 'string' || !LEARNER.test(learner) || /^nsrs_/i.test(learner) || !isVoiceServer(server)) return bad;
  return { code, learner, server };
}
/** What the one field under Settings takes: a voice link, for the home-screen app, which cannot be handed one (the
 * whole address, or anything from `#voice-connect=` on); or the line an older "Bunki Voice" prints. */
export function voicePairingInput(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  const mark = `#${VOICE_CONNECT_FRAGMENT}=`;
  const at = value.indexOf(mark);
  return at >= 0 ? { link: value.slice(at + mark.length) } : { learner: value, code: '' };
}

/** A store that lasts as long as the page: for tests, and for a browser that offers nothing better.
 * read() answers { server, token, scope, ended } with nulls for what is not kept; write() keeps a pairing; clear() drops
 * the token (he removed it) and keeps the address; end(marker) drops the token because the server ended the pairing and
 * keeps `marker` ({ ended: true, at }) where a store can keep it. This one cannot keep a pairing past the page
 * (durable false), so it keeps no marker either: the client knows it for this page only. */
export function createMemoryTokenStore() {
  let kept = { server: null, token: null, scope: null };
  return {
    durable: false,
    async read() { return { server: kept.server, token: kept.token, scope: kept.scope ? { ...kept.scope } : null, ended: null }; },
    async write(value) { kept = { server: value.server, token: value.token, scope: { ...value.scope } }; },
    async clear() { kept = { server: kept.server, token: null, scope: null }; },
    async end() { kept = { server: kept.server, token: null, scope: null }; },
  };
}

/** The device store: IndexedDB database `bunki-voice`, the token encrypted with a non-extractable AES-GCM key that is
 * kept beside it. Another page of this origin could still use it; a copy of the stored bytes alone cannot. The server's
 * address is kept in the same place, in the clear: it is an address, not a credential.
 * A pairing the server ended (a 401) leaves a plain marker under a key of its own, `ended`: { ended: true, at } and
 * nothing else (never the token, the learner, the installation or the address). A fresh page reads it, so the cause
 * still reads "pair again"; pairing again or his own removal deletes it. An older build reads only `speak` and
 * `server`, so it neither trips on the marker nor loses anything. */
export function createDeviceTokenStore(env = globalThis) {
  const idb = env.indexedDB, subtle = env.crypto?.subtle;
  const memory = createMemoryTokenStore();
  if (!idb || !subtle || typeof env.crypto.getRandomValues !== 'function') return memory;
  const NAME = 'bunki-voice', STORE = 'pairing', KEY = 'speak', ADDRESS = 'server', ENDED = 'ended';
  const markerOf = (row) => (row && row.ended === true && Number.isFinite(row.at) ? { ended: true, at: row.at } : null);
  const open = () => new Promise((resolve, reject) => {
    const request = idb.open(NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
  const run = async (mode, work) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const out = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(Array.isArray(out) ? out.map((request) => request.result) : out?.result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
    } finally { db.close(); }
  };
  let broken = false;
  return {
    get durable() { return !broken; },
    async read() {
      if (broken) return memory.read();
      try {
        // a device that was never paired keeps nothing, not even an empty database (where the browser can tell)
        if (typeof idb.databases === 'function' && !(await idb.databases()).some((db) => db.name === NAME)) return { server: null, token: null, scope: null, ended: null };
        const [row, server, ended] = await run('readonly', (store) => [store.get(KEY), store.get(ADDRESS), store.get(ENDED)]);
        const address = typeof server === 'string' ? server : null;
        if (!row) return { server: address, token: null, scope: null, ended: markerOf(ended) };
        const plain = await subtle.decrypt({ name: 'AES-GCM', iv: row.iv }, row.key, row.data);
        return { server: address, token: new TextDecoder().decode(plain), scope: { ...row.scope }, ended: null };
      } catch { broken = true; return memory.read(); }
    },
    async write(value) {
      if (!broken) {
        try {
          const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          const iv = env.crypto.getRandomValues(new Uint8Array(12));
          const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value.token));
          await run('readwrite', (store) => [store.put({ key, iv, data, scope: { ...value.scope } }, KEY), store.put(value.server, ADDRESS), store.delete(ENDED)]);
          return;
        } catch { broken = true; }
      }
      await memory.write(value);
    },
    async clear() {
      await memory.clear();
      if (broken) return;
      try { await run('readwrite', (store) => [store.delete(KEY), store.delete(ENDED)]); } catch { broken = true; }
    },
    /** The server ended the pairing: the token goes and the plain marker stays in its place, in one step. A store that
     * could not keep the pairing keeps no marker either. */
    async end(marker) {
      await memory.end();
      if (broken) return;
      const kept = markerOf(marker);
      try { await run('readwrite', (store) => (kept ? [store.delete(KEY), store.put(kept, ENDED)] : [store.delete(KEY)])); } catch { broken = true; }
    },
  };
}

/** `after(ms, run)` is the clock of the request's deadline (timeoutMs) and returns a cancel; the reader's page gives one
 * that a hidden page's held timers cannot hold (reader-pocket.mjs, pageTimer; L1 fix round 1). */
export function createVoiceClient({ fetch: fetchFn = globalThis.fetch?.bind(globalThis), store = createMemoryTokenStore(), timeoutMs = 20000,
  after = (ms, run) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer); } } = {}) {
  let server = '';  // the voice server's origin, once a pairing line has brought it
  let pairing;      // undefined = not read yet · null = unpaired · { token, scope }
  let reading = null;
  // the server ended the pairing (a 401), whoever asked: the dropped token keeps its reason until a new pairing, so a
  // later tap and Settings say "the voice server ended this pairing", not "not paired" (the combine's I13); a device
  // that keeps its pairing keeps that too, as a plain marker, so a fresh page says so as well (the first review's C1)
  let ended = false;
  const ready = () => {
    if (pairing !== undefined) return Promise.resolve();
    reading ||= Promise.resolve().then(() => store.read()).catch(() => null).then((kept) => {
      if (pairing !== undefined) return;
      server = isVoiceServer(kept?.server) ? kept.server : '';
      pairing = server && TOKEN.test(kept?.token || '') && INSTALLATION.test(kept?.scope?.installation || '')
        ? { token: kept.token, scope: kept.scope } : null;
      if (!pairing && kept?.ended?.ended === true) ended = true;
    });
    return reading;
  };
  /** He removes the pairing himself: not paired (C1), and no marker of an ended pairing is left. */
  const forget = async () => { pairing = null; ended = false; try { await store.clear(); } catch { /* nothing kept */ } };
  const endedByServer = async () => {
    pairing = null;
    ended = true;
    // that it ended, and when: nothing else (never the token, the learner, the installation or the address)
    // (a device that could not keep its pairing keeps no marker either)
    const keeps = store.durable !== false && typeof store.end === 'function';
    try { await (keeps ? store.end({ ended: true, at: Date.now() }) : store.clear()); } catch { /* this page knows */ }
  };

  /** One request with the client's own deadline; a caller's stop is an AbortError, never an error code. */
  async function ask(origin, path, init, signal) {
    if (!isVoiceServer(origin) || typeof fetchFn !== 'function') throw new VoiceError('server-missing');
    const controller = new AbortController();
    const stop = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', stop, { once: true });
    let late = false;
    const cancel = after(timeoutMs, () => { late = true; controller.abort(); });
    try {
      return await fetchFn(`${origin}${path}`, { ...init, signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    } catch (error) {
      if (signal?.aborted && !late) { const aborted = new Error('aborted'); aborted.name = 'AbortError'; throw aborted; }
      throw new VoiceError(late ? 'voice-timeout' : 'network-failed');
    } finally {
      cancel();
      signal?.removeEventListener('abort', stop);
    }
  }
  /** A refusal's code, and any ceiling it names in whole cents (`figures`: dayCapCents, capCents). The Worker sends no
   * figure with a refusal today; one that does is taken as it says, and nothing is ever made up. */
  const refusal = async (response, known, fallback) => {
    let body = null;
    try { body = await response.json(); } catch { /* not JSON */ }
    const code = typeof body?.error === 'string' && known.has(body.error) ? body.error : fallback;
    const figures = {};
    for (const name of ['dayCapCents', 'capCents']) if (Number.isSafeInteger(body?.[name]) && body[name] >= 0) figures[name] = body[name];
    return { code, figures };
  };
  const errorCode = async (response, known, fallback) => (await refusal(response, known, fallback)).code;
  /** The checks that send nothing: the input's form and, for a voice link, this device. A link is refused on a device
   * that is paired already (a new pairing would replace this one and never revoke its install), and when it names
   * another server than the one this device is set up for: its own voice server, else `known` (the study server it
   * keeps). The code is a secret for ten minutes: it goes to that server, or nowhere. */
  async function vet(input, known) {
    const link = !!input && typeof input === 'object' && Object.hasOwn(input, 'link');
    const parsed = link ? parseVoiceConnect(input.link) : parsePairing(input);
    if (parsed.error) return { ok: false, code: parsed.error };
    await ready();
    if (link && pairing) return { ok: false, code: 'already-paired' };
    const configured = server || (typeof known === 'string' ? known : '');
    if (link && configured && parsed.server !== configured) return { ok: false, code: 'server-mismatch' };
    const target = parsed.server || server;
    if (!target) return { ok: false, code: 'server-missing' };
    return { ok: true, parsed, target };
  }

  return {
    /** True once this device has been given a voice server's address. */
    configured: () => !!server,
    ready,
    paired: () => !!pairing,
    /** Whether the server ended this device's pairing (a 401) since it was last paired. */
    ended: () => ended && !pairing,
    /** What may be shown: which install this is. Never the token. */
    scope: () => (pairing ? { installation: pairing.scope.installation, learner: pairing.scope.learner } : null),
    durable: () => store.durable !== false,
    forget,

    /** Whether a pairing could go ahead, with nothing sent and nothing kept. Resolves { ok: true, host } (the server's
     * host name, to show) or { ok: false, code }. */
    async check(input, { known = null } = {}) {
      const vetted = await vet(input, known);
      return vetted.ok ? { ok: true, host: new URL(vetted.target).host } : { ok: false, code: vetted.code };
    },
    /** Redeem a pairing code: the pairing line ({ learner, code }) or a voice link's payload ({ link }), each checked
     * as check() does first. Resolves { ok: true, installation } or { ok: false, code }. */
    async pair(input, { known = null } = {}) {
      const vetted = await vet(input, known);
      if (!vetted.ok) return { ok: false, code: vetted.code };
      const { parsed, target } = vetted;
      let response;
      try {
        response = await ask(target, '/v1/pair/redeem-speak', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: parsed.code, environment: 'prod', learner: parsed.learner }) });
      } catch (error) { return { ok: false, code: error instanceof VoiceError ? error.code : 'network-failed' }; }
      if (response.status !== 200) return { ok: false, code: await errorCode(response, PAIR_CODES, 'pairing-failed') };
      let body;
      try { body = await response.json(); } catch { return { ok: false, code: 'invalid-response' }; }
      const scope = body?.scope;
      if (typeof body?.token !== 'string' || !TOKEN.test(body.token) || scope?.environment !== 'prod' ||
          typeof scope.learner !== 'string' || !INSTALLATION.test(scope.installation || '')) return { ok: false, code: 'invalid-response' };
      server = target;
      pairing = { token: body.token, scope: { environment: 'prod', learner: scope.learner, installation: scope.installation } };
      ended = false;
      try { await store.write({ server, token: pairing.token, scope: pairing.scope }); } catch { /* paired for this page only */ }
      return { ok: true, installation: scope.installation };
    },

    /** One sentence. Resolves { bytes, contentType, voiceId, inputKey }; rejects with a VoiceError code or an AbortError. */
    async speak({ text, voiceKey, signal } = {}) {
      await ready();
      if (!pairing) throw new VoiceError('not-paired');
      let normal = null;
      try { normal = normaliseSpeechText(text); } catch { /* not a string */ }
      if (!normal || normal !== text || !isJapaneseEnough(normal) || [...normal].length > MAX_DYNAMIC_CODEPOINTS || !isVoiceKey(voiceKey))
        throw new VoiceError('not-speakable');
      const input = createSpeechInput({ segments: [{ language: 'ja', text: normal, pronunciationDirectives: [] }], profile: SPEAK_PROFILE });
      const response = await ask(server, '/v1/audio/speak', { method: 'POST',
        headers: { Authorization: `Bearer ${pairing.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: input.format, version: input.version, inputKey: input.inputKey, segments: input.segments, profile: input.profile, voiceKey }) }, signal);
      if (response.status !== 200) {
        const { code, figures } = await refusal(response, SPEAK_CODES, STATUS_CODES.get(response.status) || 'speak-failed');
        if (response.status === 401) await endedByServer();
        throw Object.assign(new VoiceError(code, response.status), { figures });
      }
      const contentType = response.headers.get('Content-Type') || '';
      let bytes;
      try { bytes = new Uint8Array(await response.arrayBuffer()); } catch {
        if (signal?.aborted) { const aborted = new Error('aborted'); aborted.name = 'AbortError'; throw aborted; }
        throw new VoiceError('network-failed');
      }
      if (!/^audio\//i.test(contentType) || !bytes.length) throw new VoiceError('invalid-response', 200);
      return { bytes, contentType, voiceId: response.headers.get('X-NSRS-Audio-Voice-Id') || null, inputKey: input.inputKey };
    },

    /** The shared budget: { capCents, spentCents, reservedCents, remainingCents } and, when the server sends them,
     * { dayCapCents, daySpentCents }. */
    async budget({ signal } = {}) {
      await ready();
      if (!pairing) throw new VoiceError('not-paired');
      const response = await ask(server, '/v1/audio/budget', { method: 'GET', headers: { Authorization: `Bearer ${pairing.token}` } }, signal);
      if (response.status !== 200) {
        if (response.status === 401) await endedByServer();
        throw new VoiceError(response.status === 401 ? 'authentication-required' : 'budget-unavailable', response.status);
      }
      let body;
      try { body = await response.json(); } catch { throw new VoiceError('invalid-response', 200); }
      const fields = ['capCents', 'spentCents', 'reservedCents', 'remainingCents'];
      if (!fields.every((name) => Number.isSafeInteger(body?.[name]))) throw new VoiceError('invalid-response', 200);
      const budget = Object.fromEntries(fields.map((name) => [name, body[name]]));
      // the day's own figures, once the server sends them (the speech team's next build); until then the total only
      for (const name of ['dayCapCents', 'daySpentCents']) if (Number.isSafeInteger(body[name]) && body[name] >= 0) budget[name] = body[name];
      return budget;
    },

    toJSON: () => ({ configured: !!server, paired: !!pairing }),
  };
}
