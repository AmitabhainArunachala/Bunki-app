/* global process, URL, Response, EventTarget, Buffer, console, setTimeout, queueMicrotask, fetch */
/** The paired study host against a double of the Nihongo Study server (ENGINE-ONE.3).
 *
 * Everything here is synthetic: a test learner, made-up codes and tokens, an in-process server that answers the
 * routes a study device uses (`/v1/pair`, `/v1/events`, `/v1/permits`), and memory storage. Nothing leaves the
 * process. The second device of the same learner is the engine's own sync client, driven directly, so a grade is
 * proven to cross between Bunki's host and a client that shares none of the host's code. A browser profile is one
 * credential store, one localStorage and one broadcast channel shared by its tabs; each tab has its own host.
 *
 * `BUNKI_PAIRED_HOST_ROOT` points the suite at another copy of prototypes/corridor: the negative controls
 * (tools/shared-study-paired-host-controls.test.mjs) plant one fault per guarantee there and require a red. */
import assert from 'node:assert/strict';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createBunkiStudyAdapter } from '../prototypes/corridor/study-engine-adapter.mjs';
import {
  createStudyEngine,
  createMemoryAdapter,
  createSyncTransport,
  sharedPermitRequest,
  dayBounds,
  payloadHash,
  canonicalStringify,
  SYNC_COMPATIBILITY,
} from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';

const source = new URL('../prototypes/corridor/', import.meta.url);
const root = process.env.BUNKI_PAIRED_HOST_ROOT
  ? pathToFileURL(`${process.env.BUNKI_PAIRED_HOST_ROOT.replace(/\/+$/, '')}/`)
  : source;
const pairingModule = await import(new URL('shared-study-pairing.mjs', root).href);
const hostModule = await import(new URL('shared-study-paired-host.mjs', root).href);
const {
  createStudyPairing,
  parseStudyPairing,
  isStudyServer,
  isStudyRow,
  studyRowChanges,
  studyMarker,
  studyEndedMark,
  PAIRED_MARKER,
  ENDED_MARKER,
  PAIRING_CHANNEL,
  studyPairingLine,
  studySyncedLine,
} = pairingModule;
const { openPairedStudyHost, studyTransportBridge, pairedReplicaName } = hostModule;

const fixture = JSON.parse(
  readFileSync(new URL('tools/fixtures/shared-srs-contracts.json', source)),
);
const catalog = fixture.cards;
const pin = JSON.parse(
  readFileSync(new URL('vendor/shared-study-engine/client/vendor/fsrs-pin.json', source)),
);
const content = {
  pin,
  catalog,
  registry: {
    tasks: catalog.map(({ taskKey, noteGuid, contractId, passageId, lexemeId }) => ({
      taskKey,
      noteGuid,
      contractId,
      passageId,
      lexemeId,
    })),
    notes: catalog.map(({ noteGuid, module }) => ({ noteGuid, module })),
    passages: [],
    examples: [],
  },
};

/** A stand-in on this machine: the only class of plain-http address the product accepts. Nothing listens there. */
const SERVER = 'http://127.0.0.1:8787';
const LEARNER = 'test-paired-learner';
/** What a server on this machine is taken to be when the pairing line names no environment. */
const ENVIRONMENT = 'dev';
/** A made-up pairing code that no device was given. */
const NO_SUCH_CODE = 'A0B0A0B0A0B0';
/** A test that starts a process gets room for a slow runner. */
const SLOW = { timeout: 30000 };
const hex = (bytes) => randomBytes(bytes).toString('hex');
const studyInstallation = () => `bunkiweb-${hex(16)}`;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(holds, what) {
  for (let turn = 0; turn < 200; turn++) {
    if (holds()) return;
    await tick();
  }
  assert.fail(`did not happen: ${what}`);
}
const tokenFor = (scope) =>
  `nsrs_${scope.environment === 'prod' ? 'prod' : 'dev'}_${Buffer.from(
    JSON.stringify([scope.environment, scope.learner, scope.installation]),
  ).toString('base64url')}.${hex(32)}`;

/** The server double: one learner's ledger, pairing codes, device tokens and permit grants. */
function createServer({ now }) {
  const rows = [];
  const codes = new Map();
  const tokens = new Map();
  const grants = new Map();
  const log = [];
  const knobs = {
    unreachable: false,
    loseUploadReply: false,
    reducer: SYNC_COMPATIBILITY.reducerSha256,
    answerScope: null,
    answerToken: null,
    refusePermits: false,
    /** When set, a request to the event route waits for this before it is answered (a reply still on its way). */
    gate: null,
  };
  const answer = (url, status, value) => {
    const response = new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    Object.defineProperty(response, 'url', { value: url, configurable: true });
    return response;
  };
  // the server's own events are numbered along the server's own stream: a grant that comes after a device's
  // review is still the next server event, not the next row of the ledger
  let serverEvents = 0;
  function grant(installation, count) {
    const seq = rows.length + 1;
    const dseq = ++serverEvents;
    const event = {
      v: 4,
      id: `@server:${dseq}`,
      learner: LEARNER,
      install: '@server',
      dseq,
      base: seq - 1,
      ts: now(),
      epoch: 0,
      policy: 'nsrs-policy-v1',
      type: 'permit-grant',
      data: {
        install: installation,
        permitIds: Array.from({ length: count }, (_, index) => `paired-host-${seq}-${index}`),
        ...dayBounds(now(), 'Asia/Tokyo'),
      },
    };
    rows.push({ seq, rt: now(), authority: 'server', event, bodyHash: payloadHash(event) });
    return seq;
  }
  async function fetch(url, init = {}) {
    const headers = { ...(init.headers || {}) };
    log.push({
      url,
      method: init.method || 'GET',
      headers,
      body: init.body ?? null,
      credentials: init.credentials,
      redirect: init.redirect,
      cache: init.cache,
    });
    if (knobs.unreachable) throw new TypeError('synthetic-unreachable');
    const target = new URL(url);
    if (target.origin !== SERVER) throw new TypeError('synthetic-other-origin');
    const stale = () =>
      headers['X-NSRS-Reducer-SHA256'] === knobs.reducer
        ? null
        : answer(url, 426, { error: 'update-required' });
    if (target.pathname === '/v1/pair' && init.method === 'POST') {
      const mismatch = stale();
      if (mismatch) return mismatch;
      const body = JSON.parse(init.body);
      const scope = body?.scope;
      if (
        Object.keys(body).sort().join('|') !== 'code|scope' ||
        Object.keys(scope || {})
          .sort()
          .join('|') !== 'environment|installation|learner' ||
        scope.environment !== ENVIRONMENT
      )
        return answer(url, 400, { error: 'invalid-pairing' });
      const code = codes.get(body.code);
      // the code belongs to one installation of one learner: any other scope is refused like a wrong code
      if (
        !code ||
        code.consumed ||
        code.expiresAt <= now() ||
        code.learner !== scope.learner ||
        code.installation !== scope.installation
      )
        return answer(url, 401, { error: 'authentication-required' });
      if ([...tokens.values()].some((row) => row.scope.installation === code.installation))
        return answer(url, 409, { error: 'installation-exists' });
      code.consumed = true;
      const token = tokenFor(scope);
      tokens.set(token, { scope, revoked: false });
      return answer(url, 200, {
        scope: knobs.answerScope ? { ...scope, ...knobs.answerScope } : scope,
        token: knobs.answerToken ?? token,
      });
    }
    const bearer = /^Bearer (.+)$/.exec(headers.Authorization || '')?.[1];
    if (target.pathname === '/v1/events') {
      if (knobs.gate) await knobs.gate;
      // looked up when the answer is made: a device may be revoked while its request is on its way
      const device = bearer ? tokens.get(bearer) : null;
      if (!device || device.revoked) return answer(url, 401, { error: 'authentication-required' });
      const mismatch = stale();
      if (mismatch) return mismatch;
      const scope = device.scope;
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        for (const row of body.events) {
          const existing = rows.find((kept) => kept.event.id === row.event.id);
          if (existing) assert.equal(existing.bodyHash, row.bodyHash);
          else rows.push({ ...row, seq: rows.length + 1, rt: now(), authority: 'device' });
        }
        if (knobs.loseUploadReply) {
          knobs.loseUploadReply = false;
          throw new TypeError('synthetic-lost-reply');
        }
        return answer(url, 200, {
          scope,
          head: rows.length,
          acks: body.events.map(({ event, bodyHash }) => ({
            id: event.id,
            bodyHash,
            seq: rows.find((kept) => kept.event.id === event.id).seq,
          })),
        });
      }
      const after = Number(target.searchParams.get('after'));
      return answer(url, 200, {
        scope,
        head: rows.length,
        events: rows.filter((row) => row.seq > after),
      });
    }
    const device = bearer ? tokens.get(bearer) : null;
    if (target.pathname === '/v1/permits' && init.method === 'POST') {
      if (!device || device.revoked || knobs.refusePermits)
        return answer(url, 401, { error: 'authentication-required' });
      const mismatch = stale();
      if (mismatch) return mismatch;
      const body = JSON.parse(init.body);
      const key = `${device.scope.installation}|${body.requestId}`;
      const earlier = grants.get(key);
      if (earlier && earlier.count !== body.count) return answer(url, 409, { error: 'conflict' });
      if (!earlier)
        grants.set(key, { count: body.count, seq: grant(device.scope.installation, body.count) });
      return answer(url, 200, {
        scope: device.scope,
        grant: { seq: grants.get(key).seq, count: body.count },
        head: rows.length,
      });
    }
    return answer(url, 404, { error: 'not-found' });
  }
  return {
    fetch,
    rows,
    log,
    knobs,
    tokens,
    /** An admin mints a code for one named installation of the learner. */
    code({ installation = studyInstallation(), learner = LEARNER, lastsMs = 600000 } = {}) {
      const code = hex(6).toUpperCase();
      codes.set(code, { learner, installation, expiresAt: now() + lastsMs, consumed: false });
      return { code, installation };
    },
    revoke(installation) {
      for (const row of tokens.values())
        if (row.scope.installation === installation) row.revoked = true;
    },
    tokenOf(installation) {
      for (const [token, row] of tokens) if (row.scope.installation === installation) return token;
      return null;
    },
    /** How many requests have carried this credential. */
    carried: (token) => log.filter((row) => row.headers.Authorization === `Bearer ${token}`).length,
  };
}

/** The device store's contract, in memory (the store itself needs a browser's IndexedDB). It changes its one row
 * through the product's own row changes, so a fault in those is a fault here too. `failing` makes the next writes
 * of a kind fail, as a full or broken disk would. */
function memoryCredentialStore() {
  let row = null;
  let address = null;
  let made = 0;
  const calls = [];
  const failing = { markReady: 0, end: 0, forget: 0, remove: 0 };
  const attempt = (name) => {
    calls.push(name);
    if (failing[name] > 0) {
      failing[name]--;
      throw new Error(`synthetic-${name}-failed`);
    }
  };
  const change = (name, next) => {
    attempt(name);
    if (next) row = next;
    return !!next;
  };
  return {
    available: true,
    calls,
    failing,
    peek: () => row,
    async read() {
      return {
        server: address,
        device: row
          ? Object.freeze({
              server: row.server,
              scope: Object.freeze({ ...row.scope }),
              generation: row.generation,
              pairedAt: row.pairedAt,
              phase: row.phase,
              ended: row.ended ? Object.freeze({ ...row.ended }) : null,
              syncedAt: row.syncedAt ?? null,
            })
          : null,
        token: row && !row.ended ? row.sealed : null,
      };
    },
    async probe() {
      return true;
    },
    async write(value) {
      calls.push('write');
      row = {
        format: 'bunki-study-device/v1',
        server: value.server,
        sealed: value.token,
        scope: { ...value.scope },
        generation: `generation-${++made}`,
        pairedAt: value.pairedAt,
        phase: 'allocated',
        ended: null,
      };
      address = value.server;
      return Object.freeze({ installation: value.scope.installation, generation: row.generation });
    },
    async markReady(ref) {
      return change('markReady', studyRowChanges.ready(row, ref));
    },
    async synced(ref, at) {
      return change('synced', studyRowChanges.synced(row, ref, at));
    },
    async end(ref, ending) {
      return change('end', studyRowChanges.end(row, ref, ending));
    },
    async forget(ref, ending) {
      return change('forget', studyRowChanges.forget(row, ref, ending));
    },
    async remove(ref) {
      attempt('remove');
      if (!isStudyRow(row, ref)) return false;
      row = null;
      return true;
    },
  };
}

/** The line the learner pastes: the code, the learner, the device the code was minted for, and the server. */
const pairLine = (minted, server = SERVER) => ({
  learner: `Bunki study code: ${minted.code} (10 minutes) · learner: ${LEARNER} · device: ${minted.installation} · server: ${server}`,
  code: '',
});

/** One browser profile: its credential store, its localStorage, its broadcast channel and its replica databases,
 * shared by its tabs, and a server. `world.tab()` opens another tab of the same profile; the world itself is the
 * first tab. A `deaf` tab hears neither the channel nor the storage events, as a tab that missed the message. */
function createWorld({ voiceServer = null, refuseFlag = false } = {}) {
  let clock = Date.parse('2026-11-21T03:00:00Z');
  const now = () => clock;
  const server = createServer({ now });
  const store = memoryCredentialStore();
  const kept = new Map();
  const writes = [];
  const replicas = new Map();
  const opened = [];
  const tabs = new Set();
  const channels = new Set();
  const compatibility = async () => ({ 'X-NSRS-Reducer-SHA256': SYNC_COMPATIBILITY.reducerSha256 });

  function tab({ deaf = false } = {}) {
    const hearing = new Set();
    const self = { deaf, hearing };
    tabs.add(self);
    // a change of localStorage is told to the other tabs of the profile, never to the tab that made it
    const changed = (key) => {
      for (const other of tabs)
        if (other !== self && !other.deaf)
          for (const listener of [...other.hearing]) queueMicrotask(() => listener({ key }));
    };
    const localStorage = {
      getItem: (key) => (kept.has(key) ? kept.get(key) : null),
      setItem(key, value) {
        writes.push([key, String(value)]);
        if (refuseFlag) throw new Error('synthetic-quota');
        const before = kept.get(key);
        kept.set(key, String(value));
        if (before !== String(value)) changed(key);
      },
      removeItem(key) {
        if (kept.delete(key)) changed(key);
      },
    };
    class Channel {
      constructor(name) {
        this.name = name;
        this.onmessage = null;
        channels.add(this);
      }
      postMessage(data) {
        for (const other of channels)
          if (other !== this && other.name === this.name)
            queueMicrotask(() => other.onmessage?.({ data }));
      }
      close() {
        channels.delete(this);
      }
    }
    const env = {
      localStorage,
      addEventListener: (type, listener) =>
        void (type === 'storage' && !deaf && hearing.add(listener)),
      removeEventListener: (type, listener) => void hearing.delete(listener),
      ...(deaf ? {} : { BroadcastChannel: Channel }),
    };
    const marker = studyMarker(env);
    const endedMark = studyEndedMark(env);
    const state = { online: true };
    const pairing = createStudyPairing({
      env,
      fetch: server.fetch,
      store,
      voiceAddress: async () => voiceServer,
      now,
      compatibility,
    });
    const openHost = (overrides = {}) =>
      openPairedStudyHost({
        env,
        store,
        fetch: server.fetch,
        now,
        presentation: 'desktop',
        endRetryMs: [1, 1],
        storageFactory: ({ databaseName }) => {
          opened.push(databaseName);
          if (!replicas.has(databaseName)) replicas.set(databaseName, createMemoryAdapter());
          return replicas.get(databaseName);
        },
        sync: {
          online: () => state.online,
          visible: () => true,
          automatic: false,
          eventTarget: new EventTarget(),
          transportOptions: { maxRetries: 0 },
        },
        ...overrides,
      });
    const bind = (host) =>
      host.withAdapter((binding) => createBunkiStudyAdapter({ ...binding, content }));
    return {
      env,
      now,
      marker,
      endedMark,
      state,
      pairing,
      openHost,
      bind,
      /** This tab opens the pairing the profile holds and fetches the record. */
      async study() {
        const host = await openHost();
        const adapter = await bind(host);
        return { host, adapter, installation: host.identity.installation };
      },
      /** Pair this profile with a fresh code in this tab, open its host and fetch the record once. */
      async paired() {
        const minted = server.code();
        const answer = await pairing.pair(pairLine(minted));
        assert.deepEqual(answer, { ok: true, learner: LEARNER, installation: minted.installation });
        const host = await openHost();
        const adapter = await bind(host);
        return { host, adapter, installation: minted.installation };
      },
    };
  }
  return {
    now,
    advance: (ms) => void (clock += ms),
    server,
    store,
    localStorage: { kept, writes },
    replicas,
    opened,
    compatibility,
    tab,
    ...tab(),
  };
}

async function grade(backend, key, rating) {
  const attempt = backend.snapshotAttempt(key);
  const preview = backend.preview(attempt, 1800);
  const result = await backend.submitCommand(preview.intents[rating]);
  assert.equal(result.kind, 'durable');
  return { result, preview };
}
/** An answer ready to be sent in, not yet sent. */
const intentFor = (backend, key, rating = 3) =>
  backend.preview(backend.snapshotAttempt(key), 1800).intents[rating];
const reviews = (backend) => backend.readProjection().reviews;
/** The refusal of an answer after the pairing has ended: its code and its plain words in both languages. */
const notSaved = (error) => {
  assert.equal(error.code, 'study-answer-not-saved');
  assert.match(error.bunkiLine[1], /no longer paired\. This answer was not saved\./);
  assert.match(error.bunkiLine[0], /保存されませんでした/);
  return true;
};
/** The engine's own view of a paired copy of the record, opened beside the host. */
async function replicaOf(world, installation) {
  const engine = createStudyEngine({ content, learner: LEARNER, timezone: 'Asia/Tokyo' });
  return engine.openStore({
    adapter: world.replicas.get(`bunki-shared-study-paired-${installation}`),
    scope: { learner: LEARNER, environment: ENVIRONMENT, installation },
    now: world.now,
  });
}

/** The second device of the same learner: the engine's own store, backend and sync client, with no Bunki host code. */
async function engineDevice(world) {
  const { server, now } = world;
  const minted = server.code({ installation: `iphone-${hex(16)}` });
  const paired = await (
    await server.fetch(`${SERVER}/v1/pair`, {
      method: 'POST',
      headers: { 'X-NSRS-Reducer-SHA256': SYNC_COMPATIBILITY.reducerSha256 },
      body: JSON.stringify({
        scope: { environment: ENVIRONMENT, learner: LEARNER, installation: minted.installation },
        code: minted.code,
      }),
    })
  ).json();
  const scope = paired.scope;
  const engine = createStudyEngine({ content, learner: scope.learner, timezone: 'Asia/Tokyo' });
  const store = await engine.createFreshStore({
    adapter: createMemoryAdapter(),
    environment: scope.environment,
    newInstallationId: () => scope.installation,
    now,
  });
  await engine.refreshCorpus(store, { readPreviousRegistry: null, allowQAExpansion: false });
  // the engine's client takes an https address only: the same address in that form, carried to the double
  const alias = SERVER.replace('http:', 'https:');
  const transport = createSyncTransport({
    store,
    origin: alias,
    getCredential: () => paired.token,
    now,
    maxRetries: 0,
    fetch: async (url, init) => {
      const response = await server.fetch(SERVER + url.slice(alias.length), init);
      Object.defineProperty(response, 'url', { value: url, configurable: true });
      return response;
    },
  });
  let backend = null;
  const sync = async () => {
    const result = await transport.sync();
    await backend?.refresh();
    return result;
  };
  const reserve = async () => {
    await sync();
    const request = sharedPermitRequest(await store.readState(), {
      now,
      prefix: 'engine-device',
      batchSize: 5,
    });
    if (request.count > 0) {
      const response = await server.fetch(`${SERVER}/v1/permits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paired.token}`,
          'X-NSRS-Reducer-SHA256': SYNC_COMPATIBILITY.reducerSha256,
        },
        body: JSON.stringify({
          scope,
          count: request.count,
          requestId: request.requestId,
          policy: request.policy,
        }),
      });
      assert.equal(response.status, 200);
    }
    return sync();
  };
  backend = await engine.connect({ store, transport: { reserveNewPermits: reserve }, now });
  return { scope, store, backend, sync, reserve };
}

test('pair: one request to the configured server, the credential kept, the host bound to the server’s identity', async () => {
  const world = createWorld();
  const minted = world.server.code();
  const answer = await world.pairing.pair(pairLine(minted));
  assert.deepEqual(answer, { ok: true, learner: LEARNER, installation: minted.installation });
  assert.equal(world.server.log.length, 1);
  const [request] = world.server.log;
  assert.equal(request.url, `${SERVER}/v1/pair`);
  assert.equal(request.method, 'POST');
  // exactly the two headers the server's preflight allows for this route, and no credential
  assert.deepEqual(Object.keys(request.headers).sort(), ['Content-Type', 'X-NSRS-Reducer-SHA256']);
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.equal(request.headers['X-NSRS-Reducer-SHA256'], SYNC_COMPATIBILITY.reducerSha256);
  // the installation is the one the code was minted for: the device sends it, it does not make one
  assert.deepEqual(JSON.parse(request.body), {
    scope: { environment: ENVIRONMENT, learner: LEARNER, installation: minted.installation },
    code: minted.code,
  });
  assert.deepEqual(
    [request.credentials, request.redirect, request.cache],
    ['omit', 'error', 'no-store'],
  );
  const kept = world.store.peek();
  assert.equal(kept.server, SERVER);
  assert.equal(kept.sealed, world.server.tokenOf(minted.installation));
  assert.deepEqual(kept.scope, {
    environment: ENVIRONMENT,
    learner: LEARNER,
    installation: minted.installation,
  });
  assert.equal(kept.phase, 'allocated');
  assert.equal(world.marker.get(), true);
  assert.equal(world.endedMark.get(), null);
  assert.deepEqual(world.localStorage.kept.get(PAIRED_MARKER), '1');

  const host = await world.openHost();
  assert.deepEqual(host.identity, {
    learner: LEARNER,
    environment: ENVIRONMENT,
    installation: minted.installation,
  });
  const adapter = await world.bind(host);
  assert.deepEqual(adapter.identity, {
    learner: LEARNER,
    environment: ENVIRONMENT,
    installation: minted.installation,
    mode: 'fresh',
  });
  assert.deepEqual(world.opened, [`bunki-shared-study-paired-${minted.installation}`]);
  assert.equal(pairedReplicaName(minted.installation), world.opened[0]);
  assert.notEqual(world.opened[0], 'bunki-shared-study-preview-v1');
  assert.equal(adapter.platform.isPaired(), true);
  assert.equal(adapter.platform.canRequestNewCards(), true);
  assert.equal(adapter.platform.getSyncState(), 'up-to-date');
  assert.equal(world.store.peek().phase, 'ready');
  assert.deepEqual(host.status(), {
    started: true,
    ended: false,
    closed: null,
    state: 'up-to-date',
    error: null,
    unsent: null,
    syncedAt: world.now(),
  });
  // when the record was last brought up to date is kept on the pairing's own row, for a page that has not opened study
  await until(
    () => world.store.peek().syncedAt === world.now(),
    'the row keeps the time of the last sync',
  );
  // every sync request carries the credential and the replica's capability, and a GET nothing more
  const pull = world.server.log.find((row) => row.url.startsWith(`${SERVER}/v1/events?`));
  assert.deepEqual(Object.keys(pull.headers).sort(), ['Authorization', 'X-NSRS-Reducer-SHA256']);
  await host.dispose();
});

test('the pairing line: the code, the learner and the device in any order, in one box or two; a code alone cannot pair', () => {
  const code = NO_SUCH_CODE;
  const device = studyInstallation();
  const whole = { code, learner: LEARNER, installation: device };
  assert.deepEqual(
    parseStudyPairing({
      learner: `Bunki study code: ${code} (10 minutes) · learner: ${LEARNER} · device: ${device} · server: ${SERVER}`,
      code: '',
    }),
    { ...whole, server: SERVER },
  );
  // the line without its code in the first box, the code typed with spaces and a hyphen in the second
  assert.deepEqual(
    parseStudyPairing({
      learner: `learner: ${LEARNER} · installation: ${device} · server: ${SERVER}/ · environment: dev`,
      code: 'a0b0 a0b0-a0b0',
    }),
    { ...whole, server: SERVER, environment: 'dev' },
  );
  // the parts with no labels: the learner id, the device by itself, the code in its own box
  assert.deepEqual(parseStudyPairing({ learner: `${LEARNER} ${device}`, code }), whole);
  assert.deepEqual(parseStudyPairing({ learner: LEARNER, code: `${device} ${code}` }), whole);
  // this machine over https is a server address too (the Nihongo Study repository's local server)
  assert.equal(
    parseStudyPairing({
      learner: `learner: ${LEARNER} · device: ${device} · server: https://127.0.0.1:8443`,
      code,
    }).server,
    'https://127.0.0.1:8443',
  );
  for (const address of [
    'https://127.0.0.1:8443',
    'https://localhost:8443',
    SERVER,
    'https://test.example.workers.dev',
  ])
    assert.equal(isStudyServer(address), true, address);
  for (const address of [
    'https://study.example.invalid',
    'https://127.0.0.1',
    'https://127.0.0.1:8443/path',
    'https://127.0.0.1.evil.example:8443',
    'http://192.168.1.20:8787',
    'https://user@localhost:8443',
  ])
    assert.equal(isStudyServer(address), false, address);
  // a code and a learner with no device: the installation is the admin's to name, never this device's to make up
  assert.deepEqual(parseStudyPairing({ learner: LEARNER, code }), {
    error: 'pairing-line-required',
  });
  assert.deepEqual(
    parseStudyPairing({ learner: `learner: ${LEARNER} · server: ${SERVER}`, code }),
    {
      error: 'pairing-line-required',
    },
  );
  // a device of another kind is not a study device
  for (const other of [`bunki-${hex(16)}`, `iphone-${hex(16)}`])
    assert.deepEqual(
      parseStudyPairing({ learner: `learner: ${LEARNER} · device: ${other}`, code }),
      {
        error: 'not-a-study-device',
      },
    );
  assert.deepEqual(parseStudyPairing({ learner: `${LEARNER} bunki-${hex(16)}`, code }), {
    error: 'not-a-study-device',
  });
  for (const input of [
    null,
    {},
    { learner: `learner: ${LEARNER} · device: ${device}`, code: 'A0B0A0B0A0B' },
    { learner: `learner: nsrs_x · device: ${device}`, code },
    {
      learner: `learner: ${LEARNER} · device: ${device} · server: https://study.example.invalid`,
      code,
    },
    { learner: `learner: ${LEARNER} · device: ${device} · environment: staging`, code },
  ])
    assert.deepEqual(parseStudyPairing(input), { error: 'invalid-pairing' });
  assert.equal(studyPairingLine('pairing-line-required').length, 2);
  assert.notDeepEqual(studyPairingLine('pairing-line-required'), studyPairingLine('no-such-code'));
});

test('pair: the two boxes work as well as the pasted line, on a device the voice pairing already set up', async () => {
  const world = createWorld({ voiceServer: SERVER });
  const minted = world.server.code();
  const spaced =
    `${minted.code.slice(0, 4)} ${minted.code.slice(4, 8)}-${minted.code.slice(8)}`.toLowerCase();
  // no server in what is typed: the address is the one the voice client keeps
  assert.deepEqual(
    await world.pairing.pair({
      learner: `learner: ${LEARNER} · device: ${minted.installation}`,
      code: spaced,
    }),
    { ok: true, learner: LEARNER, installation: minted.installation },
  );
  assert.equal(world.store.peek().server, SERVER);
  assert.equal(world.server.log[0].url, `${SERVER}/v1/pair`);
});

for (const [name, arrange, expected] of [
  [
    'a wrong code',
    (world) => ({ ...world.server.code(), code: NO_SUCH_CODE }),
    'code-invalid-or-expired',
  ],
  [
    'an expired code',
    (world) => {
      const minted = world.server.code({ lastsMs: 1000 });
      world.advance(2000);
      return minted;
    },
    'code-invalid-or-expired',
  ],
  [
    'a code presented for another device than the one it was minted for',
    (world) => ({ ...world.server.code(), installation: studyInstallation() }),
    'code-invalid-or-expired',
  ],
  [
    'a code that was already used',
    (world) => {
      const minted = world.server.code();
      world.server.tokens.set('other-device', {
        scope: { installation: minted.installation },
        revoked: false,
      });
      return minted;
    },
    'code-used',
  ],
  [
    'a server that cannot be reached',
    (world) => {
      world.server.knobs.unreachable = true;
      return world.server.code();
    },
    'server-unreachable',
  ],
  [
    'a server that needs a newer app (426)',
    (world) => {
      world.server.knobs.reducer = 'f'.repeat(64);
      return world.server.code();
    },
    'update-required',
  ],
  [
    'a code minted for a speak-only install',
    (world) => world.server.code({ installation: `bunki-${hex(16)}` }),
    'not-a-study-device',
  ],
  [
    'a token that names another scope',
    (world) => {
      world.server.knobs.answerToken = tokenFor({
        environment: ENVIRONMENT,
        learner: 'test-someone-else',
        installation: studyInstallation(),
      });
      return world.server.code();
    },
    'invalid-response',
  ],
  [
    'an answer for another learner than the one asked for',
    (world) => {
      // the answer agrees with itself (scope and token name the same other learner), only not with the question
      const minted = world.server.code();
      world.server.knobs.answerScope = { learner: 'test-someone-else' };
      world.server.knobs.answerToken = tokenFor({
        environment: ENVIRONMENT,
        learner: 'test-someone-else',
        installation: minted.installation,
      });
      return minted;
    },
    'invalid-response',
  ],
  [
    'an answer for another device than the one asked for',
    (world) => {
      const minted = world.server.code();
      const other = studyInstallation();
      world.server.knobs.answerScope = { installation: other };
      world.server.knobs.answerToken = tokenFor({
        environment: ENVIRONMENT,
        learner: LEARNER,
        installation: other,
      });
      return minted;
    },
    'invalid-response',
  ],
]) {
  test(`pair refused: ${name} says ${expected} and keeps nothing`, async () => {
    const world = createWorld();
    const minted = arrange(world);
    const answer = await world.pairing.pair(pairLine(minted));
    assert.deepEqual(answer, { ok: false, code: expected });
    assert.equal(world.store.peek(), null);
    assert.deepEqual(world.store.calls, []);
    assert.equal(world.marker.get(), false);
    assert.equal(world.localStorage.kept.has(PAIRED_MARKER), false);
    // every refusal has words in both languages; an answer the server should never give has the general line
    assert.equal(studyPairingLine(expected).length, 2);
    if (expected === 'invalid-response')
      assert.deepEqual(studyPairingLine(expected), studyPairingLine('no-such-code'));
    else assert.notDeepEqual(studyPairingLine(expected), studyPairingLine('no-such-code'));
    // a device of another kind is turned away before anything is sent
    if (expected === 'not-a-study-device') assert.equal(world.server.log.length, 0);
    await assert.rejects(world.openHost(), /study-pairing-missing/);
  });
}

test('pair refused: a flag this browser cannot keep undoes the pairing, so nothing is half kept', async () => {
  const world = createWorld({ refuseFlag: true });
  const minted = world.server.code();
  assert.deepEqual(await world.pairing.pair(pairLine(minted)), {
    ok: false,
    code: 'storage-unavailable',
  });
  // the storage check comes before the code is spent
  assert.equal(world.server.log.length, 0);
  assert.equal(world.store.peek(), null);

  // a flag that fails only after the code is spent: the kept credential is taken back
  const late = createWorld();
  const again = late.server.code();
  const flaky = { ...late.marker, probe: () => true, set: () => false };
  const pairing = createStudyPairing({
    env: late.env,
    fetch: late.server.fetch,
    store: late.store,
    voiceAddress: async () => null,
    marker: flaky,
    compatibility: late.compatibility,
  });
  assert.deepEqual(await pairing.pair(pairLine(again)), { ok: false, code: 'storage-unavailable' });
  assert.equal(late.store.peek(), null);
  assert.deepEqual(late.store.calls, ['write', 'remove']);
});

test('pairing goes to the server this device is set up for, or nowhere', async () => {
  const other = 'http://127.0.0.1:9999';
  // the voice client keeps one address: a line that names another is refused before anything is sent
  const voice = createWorld({ voiceServer: SERVER });
  const refused = await voice.pairing.pair(pairLine(voice.server.code(), other));
  assert.deepEqual(refused, { ok: false, code: 'server-mismatch' });
  assert.equal(voice.server.log.length, 0);
  assert.equal(voice.store.peek(), null);

  // a device that knows no server and is given none asks nobody
  const blank = createWorld();
  const unaddressed = blank.server.code();
  assert.deepEqual(
    await blank.pairing.pair({
      learner: `${LEARNER} ${unaddressed.installation}`,
      code: unaddressed.code,
    }),
    { ok: false, code: 'server-missing' },
  );
  assert.equal(blank.server.log.length, 0);

  // after an unpair the address this device paired with is the one it is set up for
  const kept = createWorld();
  const first = await kept.paired();
  await first.host.dispose();
  assert.deepEqual(await kept.pairing.unpair(), { ok: true });
  const before = kept.server.log.length;
  assert.deepEqual(await kept.pairing.pair(pairLine(kept.server.code(), other)), {
    ok: false,
    code: 'server-mismatch',
  });
  assert.equal(kept.server.log.length, before);
  // a device that is paired does not pair over itself
  const twice = createWorld();
  const held = await twice.paired();
  assert.deepEqual(await twice.pairing.pair(pairLine(twice.server.code())), {
    ok: false,
    code: 'already-paired',
  });
  assert.equal(twice.store.peek().scope.installation, held.installation);
  await held.host.dispose();
});

test('the transport carries the credential to the one server and refuses every other address', async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push(url);
    return { status: 200, headers: new Map(), body: null, redirected: false, url, init };
  };
  // the plain-http stand-in: the engine's https-only client is given the https form and carried to the real one
  const loopback = studyTransportBridge(SERVER, fetchFn);
  assert.equal(loopback.origin, 'https://127.0.0.1:8787');
  const carried = await loopback.fetch('https://127.0.0.1:8787/v1/events?after=0&limit=1000', {});
  assert.deepEqual(seen, [`${SERVER}/v1/events?after=0&limit=1000`]);
  assert.equal(carried.url, 'https://127.0.0.1:8787/v1/events?after=0&limit=1000');
  for (const elsewhere of [
    'https://127.0.0.1:8788/v1/events',
    'https://127.0.0.1:8787.evil.example/v1/events',
    'https://study.example.invalid/v1/events',
    `${SERVER}/v1/events`,
  ])
    await assert.rejects(loopback.fetch(elsewhere, {}), /study-origin-refused/);
  // a redirect that left the server is handed back as it is, so the engine's own check refuses it
  const moved = studyTransportBridge(SERVER, async () => ({
    status: 200,
    headers: new Map(),
    body: null,
    redirected: true,
    url: 'http://127.0.0.1:9999/elsewhere',
  }));
  const strayed = await moved.fetch('https://127.0.0.1:8787/v1/events', {});
  assert.equal(strayed.redirected, true);
  assert.equal(strayed.url, 'http://127.0.0.1:9999/elsewhere');

  // an https server, on this machine or the learner's own, is asked directly, and only it
  for (const direct of ['https://127.0.0.1:8443', 'https://test.example.workers.dev']) {
    const before = seen.length;
    const bridge = studyTransportBridge(direct, fetchFn);
    assert.equal(bridge.origin, direct);
    await bridge.fetch(`${direct}/v1/events`, {});
    assert.equal(seen.at(-1), `${direct}/v1/events`);
    await assert.rejects(
      bridge.fetch(`${direct}.evil.example/v1/events`, {}),
      /study-origin-refused/,
    );
    await assert.rejects(bridge.fetch(`${SERVER}/v1/events`, {}), /study-origin-refused/);
    assert.equal(seen.length, before + 1);
  }
  assert.throws(
    () => studyTransportBridge('https://study.example.invalid', fetchFn),
    /study-pairing-malformed/,
  );
});

test('a grade crosses both ways between Bunki and a second device of the same learner', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  const other = await engineDevice(world);
  // new-card permits come from the server, with the device's own credential
  const permits = () => world.server.log.filter((row) => row.url === `${SERVER}/v1/permits`);
  assert.equal(permits().length, 0);
  const reserved = await bunki.adapter.platform.requestNewCards();
  assert.equal(reserved.error ?? null, null);
  assert.equal(permits().length, 1);
  const permit = permits()[0];
  // the three headers the server's preflight allows for this route
  assert.deepEqual(Object.keys(permit.headers).sort(), [
    'Authorization',
    'Content-Type',
    'X-NSRS-Reducer-SHA256',
  ]);
  assert.equal(permit.headers.Authorization, `Bearer ${world.server.tokenOf(bunki.installation)}`);
  assert.equal(permit.headers['X-NSRS-Reducer-SHA256'], SYNC_COMPATIBILITY.reducerSha256);
  assert.deepEqual(JSON.parse(permit.body).scope, {
    environment: ENVIRONMENT,
    learner: LEARNER,
    installation: bunki.installation,
  });
  const [first, second] = catalog;

  const fromBunki = await grade(bunki.adapter.backend, first.taskKey, 3);
  assert.equal((await bunki.adapter.store.status()).pending, 1);
  assert.equal((await bunki.host.synchronize()).state, 'up-to-date');
  await other.sync();
  const arrived = reviews(other.backend).find((review) => review.id === fromBunki.result.eventId);
  assert.equal(arrived.taskKey, first.taskKey);
  assert.equal(arrived.rawRating, 3);
  assert.equal(
    canonicalStringify(other.backend.readProjection().tasks[first.taskKey].card),
    canonicalStringify(fromBunki.preview.cards[3]),
  );

  // the second device takes its permits only now, after Bunki's review is in the ledger: the server's grant is
  // then the server's second event and the ledger's third row, and both devices must replay it in its place
  const granted = await other.reserve();
  assert.equal(granted.state, 'up-to-date');
  const serverEvents = world.server.rows.filter((row) => row.authority === 'server');
  assert.deepEqual(
    serverEvents.map((row) => [row.seq, row.event.dseq, row.event.id]),
    [
      [1, 1, '@server:1'],
      [3, 2, '@server:2'],
    ],
  );
  const fromOther = await grade(other.backend, second.taskKey, 4);
  await other.sync();
  assert.equal((await bunki.host.synchronize()).state, 'up-to-date');
  const back = reviews(bunki.adapter.backend).find(
    (review) => review.id === fromOther.result.eventId,
  );
  assert.equal(back.taskKey, second.taskKey);
  assert.equal(back.rawRating, 4);
  assert.equal(
    canonicalStringify(bunki.adapter.backend.readProjection()),
    canonicalStringify(other.backend.readProjection()),
  );
  // each grade is in the server's record once, and the card the other device taught is not new here
  for (const id of [fromBunki.result.eventId, fromOther.result.eventId])
    assert.equal(world.server.rows.filter((row) => row.event.id === id).length, 1);
  assert.ok(bunki.adapter.backend.readProjection().introductions[second.taskKey]);
  await bunki.host.dispose();
});

test('offline then online: a grade made with no connection is kept and sent when the connection is back', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  const other = await engineDevice(world);
  await bunki.adapter.platform.requestNewCards();
  world.state.online = false;
  const asked = world.server.log.length;
  const made = await grade(bunki.adapter.backend, catalog[0].taskKey, 3);
  assert.equal((await bunki.host.synchronize()).state, 'offline');
  assert.equal(bunki.adapter.platform.getSyncState(), 'offline');
  assert.equal(world.server.log.length, asked);
  assert.equal((await bunki.adapter.store.status()).pending, 1);
  world.state.online = true;
  assert.equal((await bunki.host.synchronize()).state, 'up-to-date');
  assert.equal((await bunki.adapter.store.status()).pending, 0);
  await other.sync();
  assert.ok(reviews(other.backend).some((review) => review.id === made.result.eventId));
  await bunki.host.dispose();
});

test('a lost reply is retried and the grade is in the record once', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.adapter.platform.requestNewCards();
  const made = await grade(bunki.adapter.backend, catalog[0].taskKey, 2);
  world.server.knobs.loseUploadReply = true;
  const lost = await bunki.host.synchronize();
  assert.equal(lost.error, 'network-failed');
  assert.equal(world.server.rows.filter((row) => row.event.id === made.result.eventId).length, 1);
  assert.equal((await bunki.adapter.store.status()).pending, 1);
  assert.equal((await bunki.host.synchronize()).state, 'up-to-date');
  assert.equal(world.server.rows.filter((row) => row.event.id === made.result.eventId).length, 1);
  assert.equal((await bunki.adapter.store.status()).pending, 0);
  assert.equal(
    reviews(bunki.adapter.backend).filter((review) => review.id === made.result.eventId).length,
    1,
  );
  await bunki.host.dispose();
});

test('a restart keeps the installation and the journal, sent or not', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.adapter.platform.requestNewCards();
  const sent = await grade(bunki.adapter.backend, catalog[0].taskKey, 3);
  await bunki.host.synchronize();
  world.state.online = false;
  const unsent = await grade(bunki.adapter.backend, catalog[1].taskKey, 4);
  const before = canonicalStringify(bunki.adapter.backend.readProjection());
  await bunki.host.dispose();

  const asked = world.server.log.length;
  const again = await world.openHost();
  const adapter = await world.bind(again);
  assert.equal(adapter.identity.installation, bunki.installation);
  assert.equal(adapter.identity.mode, 'open');
  assert.deepEqual([...new Set(world.opened)], [`bunki-shared-study-paired-${bunki.installation}`]);
  assert.equal(world.replicas.size, 1);
  assert.equal(canonicalStringify(adapter.backend.readProjection()), before);
  assert.deepEqual(
    reviews(adapter.backend)
      .map((review) => review.id)
      .sort(),
    [sent.result.eventId, unsent.result.eventId].sort(),
  );
  assert.equal((await adapter.store.status()).pending, 1);
  assert.equal(world.server.log.length, asked);
  world.state.online = true;
  assert.equal((await again.synchronize()).state, 'up-to-date');
  assert.equal(world.server.rows.filter((row) => row.event.id === unsent.result.eventId).length, 1);
  await again.dispose();
});

test('a first open needs the record: with no connection it is refused, and the next try with one goes through', async () => {
  const world = createWorld();
  const minted = world.server.code();
  await world.pairing.pair(pairLine(minted));
  world.state.online = false;
  const host = await world.openHost();
  await assert.rejects(world.bind(host), (error) => {
    assert.equal(error.message, 'study-first-sync');
    assert.equal(error.detail, 'offline');
    assert.equal(error.bunkiLine.length, 2);
    return true;
  });
  assert.equal(world.store.peek().phase, 'allocated');
  assert.equal(host.status().started, false);
  assert.equal(host.status().closed, null);
  world.state.online = true;
  const adapter = await world.bind(host);
  assert.equal(adapter.identity.installation, minted.installation);
  assert.equal(adapter.identity.mode, 'open');
  assert.equal(world.store.peek().phase, 'ready');
  assert.equal(world.replicas.size, 1);
  await host.dispose();
});

test('a first open the server refuses ends the pairing: it says so, never “open this again while online”, and asks nothing more', async () => {
  const world = createWorld();
  const minted = world.server.code();
  await world.pairing.pair(pairLine(minted));
  // refused before the record ever arrived: revoked, or (the real server) a token presented from another origin
  world.server.revoke(minted.installation);
  // a browser's store answers a turn after the network does (IndexedDB), as it did when the real server refused a
  // first open: the refusal must still end the pairing, not wait on the store and report a missing connection
  const read = world.store.read.bind(world.store);
  world.store.read = async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return read();
  };
  const host = await world.openHost();
  await assert.rejects(world.bind(host), (error) => {
    assert.equal(error.message, 'study-pairing-ended');
    assert.equal(error.bunkiLine.length, 2);
    return true;
  });
  assert.equal(host.status().closed, 'study-pairing-ended');
  await until(() => world.store.peek().ended, 'the row was ended');
  assert.equal(world.store.peek().ended.by, 'server');
  assert.deepEqual(world.endedMark.get(), { installation: minted.installation, by: 'server' });
  const asked = world.server.log.length;
  await assert.rejects(world.bind(host));
  await host.dispose();
  await assert.rejects(world.openHost(), (error) => error.code === 'study-pairing-ended');
  assert.equal(world.server.log.length, asked);
});

test('the stand-in answers a page as the server does: a browser-class token paired with no listed origin answers no page', async () => {
  const { startStudyServerDouble } = await import(
    process.env.BUNKI_STUDY_DOUBLE
      ? pathToFileURL(process.env.BUNKI_STUDY_DOUBLE).href
      : './support/study-server-double.mjs'
  );
  const page = 'http://127.0.0.1:9';
  const double = await startStudyServerDouble({ allowedOrigins: [page] });
  const sha = SYNC_COMPATIBILITY.reducerSha256;
  try {
    // paired by a client that sends no Origin, as a code redeemed outside the page, or a ledger restored, leaves it
    const pairedWithoutOrigin = async (installation) => {
      const { code } = double.mint({ installation });
      const answer = await fetch(`${double.origin}/v1/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NSRS-Reducer-SHA256': sha },
        body: JSON.stringify({
          scope: { environment: double.environment, learner: double.learner, installation },
          code,
        }),
      });
      assert.equal(answer.status, 200);
      return (await answer.json()).token;
    };
    const read = async (token, origin) => {
      const answer = await fetch(`${double.origin}/v1/events?after=0&limit=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-NSRS-Reducer-SHA256': sha,
          ...(origin ? { Origin: origin } : {}),
        },
      });
      return [answer.status, (await answer.json()).error ?? null];
    };
    const web = await pairedWithoutOrigin(`bunkiweb-${hex(16)}`);
    assert.deepEqual(await read(web, page), [401, 'origin-mismatch']);
    assert.deepEqual(await read(web, null), [200, null]);
    // other classes paired without an origin are never checked
    const phone = await pairedWithoutOrigin(`iphone-${hex(16)}`);
    assert.deepEqual(await read(phone, page), [200, null]);
  } finally {
    await double.close();
  }
});

test('a copy of the record that has gone missing is not replaced by an empty one', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.host.dispose();
  world.replicas.clear();
  const host = await world.openHost();
  await assert.rejects(world.bind(host), (error) => {
    assert.equal(error.message, 'study-replica-missing');
    assert.equal(error.bunkiLine.length, 2);
    return true;
  });
});

test('426 while syncing: the screen is told an update is needed and the grades stay on the device', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.adapter.platform.requestNewCards();
  world.server.knobs.reducer = 'f'.repeat(64);
  const made = await grade(bunki.adapter.backend, catalog[0].taskKey, 3);
  const stale = await bunki.host.synchronize();
  assert.equal(stale.state, 'update-required');
  assert.equal(bunki.adapter.platform.getSyncState(), 'update-required');
  assert.equal(bunki.host.status().ended, false);
  assert.notEqual(world.store.peek().sealed, null);
  assert.equal((await bunki.adapter.store.status()).pending, 1);
  world.server.knobs.reducer = SYNC_COMPATIBILITY.reducerSha256;
  assert.equal((await bunki.host.synchronize()).state, 'up-to-date');
  assert.equal(world.server.rows.filter((row) => row.event.id === made.result.eventId).length, 1);
  await bunki.host.dispose();
});

test('401 after a revocation: sync stops, the credential is dropped, the screen says so, and nothing loops', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.adapter.platform.requestNewCards();
  const made = await grade(bunki.adapter.backend, catalog[0].taskKey, 3);
  world.server.revoke(bunki.installation);
  let told = 0;
  bunki.host.subscribe(() => void told++);
  const refused = await bunki.host.synchronize();
  assert.equal(refused.state, 'paused-auth');
  assert.equal(refused.error, 'authentication-required');
  await until(() => world.store.peek().ended, 'the row was ended');
  assert.equal(bunki.host.status().ended, true);
  assert.equal(bunki.host.status().closed, 'study-pairing-ended');
  assert.equal(bunki.adapter.platform.isPaired(), false);
  assert.equal(bunki.adapter.platform.canRequestNewCards(), false);
  assert.ok(told > 0);
  // the row says it ended, by the server, and keeps no credential
  assert.equal(world.store.peek().sealed, null);
  assert.equal(world.store.peek().ended.by, 'server');
  assert.deepEqual(world.endedMark.get(), { installation: bunki.installation, by: 'server' });
  assert.deepEqual(
    world.store.calls.filter((call) => call === 'end'),
    ['end'],
  );
  // the grade stays on the device
  assert.equal((await bunki.adapter.store.status()).pending, 1);
  assert.ok(reviews(bunki.adapter.backend).some((review) => review.id === made.result.eventId));
  // no loop: every later ask of the host is answered without the network
  const asked = world.server.log.length;
  for (let turn = 0; turn < 4; turn++)
    assert.equal((await bunki.host.synchronize()).state, 'paused-auth');
  await assert.rejects(bunki.adapter.platform.requestNewCards());
  assert.equal(world.server.log.length, asked);
  await bunki.host.dispose();
  // and none after a restart: an ended pairing is never bound again, and the server is asked nothing
  await assert.rejects(
    world.openHost(),
    (error) => error.code === 'study-pairing-ended' && error.bunkiLine.length === 2,
  );
  assert.equal(world.server.log.length, asked);
  const status = await world.pairing.status();
  assert.deepEqual([status.paired, status.ended], [true, true]);
});

test('401 on a permit request ends the pairing the same way', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  world.server.revoke(bunki.installation);
  // the sync inside the request is refused first; the host must not go on to ask for permits
  await bunki.adapter.platform.requestNewCards().catch(() => null);
  await until(() => world.store.peek().ended, 'the row was ended');
  assert.equal(bunki.host.status().closed, 'study-pairing-ended');
  assert.equal(world.store.peek().sealed, null);
  assert.equal(world.server.log.filter((row) => row.url === `${SERVER}/v1/permits`).length, 0);
  await bunki.host.dispose();

  // the permit route itself refuses a credential the event route still takes
  const late = createWorld();
  const device = await late.paired();
  late.server.knobs.refusePermits = true;
  await device.adapter.platform.requestNewCards().catch(() => null);
  await until(() => late.store.peek().ended, 'the row was ended');
  assert.equal(late.server.log.filter((row) => row.url === `${SERVER}/v1/permits`).length, 1);
  assert.equal(device.host.status().closed, 'study-pairing-ended');
  assert.equal(late.store.peek().sealed, null);
  assert.equal(device.adapter.platform.isPaired(), false);
  const asked = late.server.log.length;
  assert.equal((await device.host.synchronize()).state, 'paused-auth');
  assert.equal(late.server.log.length, asked);
  await device.host.dispose();
});

test('unpair: the credential and the flag go, sync stops, the copy of the record stays unused', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.adapter.platform.requestNewCards();
  const made = await grade(bunki.adapter.backend, catalog[0].taskKey, 3);
  await bunki.host.synchronize();
  await bunki.host.dispose();
  const asked = world.server.log.length;
  assert.deepEqual(await world.pairing.unpair(), { ok: true });
  assert.equal(world.store.peek(), null);
  assert.equal(world.marker.get(), false);
  assert.equal(world.endedMark.get(), null);
  assert.equal(world.localStorage.kept.has(PAIRED_MARKER), false);
  assert.equal(world.localStorage.kept.has(ENDED_MARKER), false);
  assert.equal((await world.store.read()).server, SERVER);
  assert.deepEqual(await world.pairing.status(), {
    available: true,
    failed: false,
    paired: false,
    ended: false,
    unsent: null,
    learner: null,
    installation: null,
    marked: false,
    syncedAt: null,
  });
  await assert.rejects(
    world.openHost(),
    (error) => error.code === 'study-pairing-missing' && error.bunkiLine.length === 2,
  );
  assert.equal((await bunki.host.synchronize()).error, 'study-host-not-started');
  assert.equal(world.server.log.length, asked);
  // the copy is still on the device, whole
  const state = await (await replicaOf(world, bunki.installation)).readState();
  assert.ok(Object.values(state.canonical).some((row) => row.event.id === made.result.eventId));
  // a new pairing is a new installation, the admin's again, with a copy of its own
  const next = await world.paired();
  assert.notEqual(next.installation, bunki.installation);
  assert.equal(world.replicas.size, 2);
  await next.host.dispose();
});

test('the credential is nowhere but the Authorization header of requests to its server', async () => {
  const printed = [];
  const originals = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[method] = console[method];
    console[method] = (...args) => void printed.push(args.map(String).join(' '));
  }
  try {
    const world = createWorld();
    const bunki = await world.paired();
    const token = world.server.tokenOf(bunki.installation);
    await bunki.adapter.platform.requestNewCards();
    await grade(bunki.adapter.backend, catalog[0].taskKey, 3);
    await bunki.host.synchronize();
    world.server.knobs.loseUploadReply = true;
    await grade(bunki.adapter.backend, catalog[1].taskKey, 3);
    await bunki.host.synchronize();
    world.server.revoke(bunki.installation);
    await bunki.host.synchronize();
    await until(() => world.store.peek().ended, 'the row was ended');
    assert.ok(token && token.length > 80);
    let carried = 0;
    for (const request of world.server.log) {
      assert.ok(request.url.startsWith(`${SERVER}/`));
      assert.equal(request.url.includes(token), false);
      assert.equal(String(request.body ?? '').includes(token), false);
      for (const [name, value] of Object.entries(request.headers)) {
        if (name === 'Authorization') {
          assert.equal(value, `Bearer ${token}`);
          carried++;
        } else assert.equal(String(value).includes(token), false);
      }
    }
    assert.ok(carried >= 4);
    // the two marks are all localStorage ever holds of the pairing, and neither is the credential
    assert.deepEqual(
      world.localStorage.writes.filter(([key]) => !key.endsWith(':probe')),
      [
        [PAIRED_MARKER, '1'],
        [ENDED_MARKER, `${bunki.installation}|server`],
      ],
    );
    for (const [key, value] of world.localStorage.writes)
      assert.equal(`${key}${value}`.includes(token), false);
    assert.equal(JSON.stringify(await world.pairing.status()).includes(token), false);
    assert.equal(JSON.stringify(bunki.host.status()).includes(token), false);
    assert.equal(JSON.stringify(bunki.host.identity).includes(token), false);
    assert.equal(
      printed.some((line) => line.includes(token)),
      false,
    );
    await bunki.host.dispose();
  } finally {
    Object.assign(console, originals);
  }
});

test('two tabs: a pairing forgotten in one tab stops the other at once, and a new pairing is out of its reach', async () => {
  const world = createWorld();
  const first = await world.paired();
  const second = await world.tab().study();
  assert.equal(second.installation, first.installation);
  await first.adapter.platform.requestNewCards();
  await second.host.synchronize();
  const old = world.server.tokenOf(first.installation);
  const answer = intentFor(second.adapter.backend, catalog[0].taskKey);
  let told = 0;
  second.host.subscribe(() => void told++);

  // the first tab forgets the pairing: the second tab hears it and stops, with nothing asked of it
  await first.host.dispose();
  assert.deepEqual(await world.pairing.unpair(), { ok: true });
  await until(() => second.host.status().closed, 'the other tab stopped');
  assert.equal(second.host.status().closed, 'study-pairing-changed');
  assert.ok(told > 0);
  assert.equal(second.adapter.platform.isPaired(), false);
  const carried = world.server.carried(old);
  assert.equal((await second.host.synchronize()).state, 'paused-auth');
  await assert.rejects(second.adapter.platform.requestNewCards());
  assert.equal(world.server.carried(old), carried);
  // an answer in the stopped tab is refused in plain words and nothing is saved
  const before = reviews(second.adapter.backend).length;
  await assert.rejects(second.adapter.submit(answer), notSaved);
  await assert.rejects(second.adapter.backend.submitCommand(answer), notSaved);
  assert.equal(reviews(second.adapter.backend).length, before);
  assert.equal((await second.adapter.store.status()).pending, 0);

  // the first tab pairs a new installation: the stopped tab cannot touch it
  const next = await world.paired();
  assert.notEqual(next.installation, first.installation);
  await tick();
  assert.equal(second.host.status().closed, 'study-pairing-changed');
  await assert.rejects(
    second.host.withAdapter(() => assert.fail('a stopped host opened')),
    /study-pairing-changed/,
  );
  await assert.rejects(second.adapter.submit(answer), notSaved);
  assert.equal((await second.host.synchronize()).state, 'paused-auth');
  assert.equal(world.server.carried(old), carried);
  const row = world.store.peek();
  assert.equal(row.scope.installation, next.installation);
  assert.equal(row.sealed, world.server.tokenOf(next.installation));
  assert.equal(row.ended, null);
  assert.equal(row.phase, 'ready');
  assert.equal(next.host.status().closed, null);
  assert.equal((await next.host.synchronize()).state, 'up-to-date');
  await next.host.dispose();
  await second.host.dispose();
});

test('a tab that heard nothing finds out before its next request and before its next answer', async () => {
  const world = createWorld();
  const first = await world.paired();
  await first.adapter.platform.requestNewCards();
  // two tabs that will hear neither the channel nor the marks changing
  const asking = await world.tab({ deaf: true }).study();
  const answering = await world.tab({ deaf: true }).study();
  await asking.host.synchronize();
  await answering.host.synchronize();
  const old = world.server.tokenOf(first.installation);
  const answer = intentFor(answering.adapter.backend, catalog[0].taskKey);
  await first.host.dispose();
  assert.deepEqual(await world.pairing.unpair(), { ok: true });
  const next = await world.paired();
  await tick();
  // neither heard a thing; the server would still take the old credential
  assert.equal(asking.host.status().closed, null);
  assert.equal(answering.host.status().closed, null);
  assert.equal(world.server.tokens.get(old).revoked, false);
  const carried = world.server.carried(old);

  // before a request: the stored row is no longer the pairing this tab opened, so nothing is sent
  const refused = await asking.host.synchronize();
  assert.equal(refused.error, 'authentication-required');
  assert.equal(world.server.carried(old), carried);
  assert.equal(asking.host.status().closed, 'study-pairing-changed');

  // before an answer: refused in plain words, nothing saved, and the tab stops
  const before = reviews(answering.adapter.backend).length;
  await assert.rejects(answering.adapter.submit(answer), notSaved);
  assert.equal(reviews(answering.adapter.backend).length, before);
  assert.equal((await answering.adapter.store.status()).pending, 0);
  assert.equal(answering.host.status().closed, 'study-pairing-changed');
  assert.equal(world.server.carried(old), carried);

  // the new pairing is as it was made
  assert.equal(world.store.peek().scope.installation, next.installation);
  assert.equal(world.store.peek().ended, null);
  assert.equal(world.marker.get(), true);
  assert.equal(world.endedMark.get(), null);
  await next.host.dispose();
  await asking.host.dispose();
  await answering.host.dispose();
});

test('a change to the stored pairing names the row it means: a late refusal and a late first open leave a new pairing alone', async () => {
  // the row changes themselves
  const scope = { environment: ENVIRONMENT, learner: LEARNER, installation: studyInstallation() };
  const row = {
    format: 'bunki-study-device/v1',
    server: SERVER,
    sealed: 'sealed',
    scope,
    generation: 'second',
    pairedAt: 1,
    phase: 'allocated',
    ended: null,
  };
  const mine = { installation: scope.installation, generation: 'second' };
  const earlier = { installation: scope.installation, generation: 'first' };
  const another = { installation: studyInstallation(), generation: 'second' };
  assert.equal(isStudyRow(row, mine), true);
  for (const ref of [earlier, another, null]) {
    assert.equal(isStudyRow(row, ref), false);
    assert.equal(studyRowChanges.ready(row, ref), null);
    assert.equal(studyRowChanges.end(row, ref, { at: 2, unsent: 1 }), null);
    assert.equal(studyRowChanges.forget(row, ref, { at: 2 }), null);
  }
  assert.equal(studyRowChanges.ready(row, mine).phase, 'ready');
  const ended = studyRowChanges.end(row, mine, { at: 2, unsent: 3 });
  assert.deepEqual([ended.sealed, ended.ended], [null, { at: 2, by: 'server', unsent: 3 }]);
  // an ended row is not ended again or made ready; forgetting it keeps what it knew
  assert.equal(studyRowChanges.end(ended, mine, { at: 9 }), null);
  assert.equal(studyRowChanges.end(ended, mine, { at: 9, unsent: 5 }), null);
  assert.equal(studyRowChanges.ready(ended, mine), null);
  // an ending written without a count (by a page that only found the mark) takes the count from the page that knows
  const uncounted = studyRowChanges.end(row, mine, { at: 2 });
  assert.deepEqual(uncounted.ended, { at: 2, by: 'server', unsent: null });
  assert.deepEqual(studyRowChanges.end(uncounted, mine, { at: 9, unsent: 4 }).ended, {
    at: 2,
    by: 'server',
    unsent: 4,
  });
  assert.equal(studyRowChanges.end(uncounted, another, { at: 9, unsent: 4 }), null);
  assert.deepEqual(studyRowChanges.forget(ended, mine, { at: 9 }).ended, {
    at: 2,
    by: 'learner',
    unsent: 3,
  });

  // a refusal that arrives after the pairing was replaced: the old tab's request was on its way when the first tab
  // forgot the pairing and made a new one
  const world = createWorld();
  const first = await world.paired();
  const stale = await world.tab({ deaf: true }).study();
  const old = world.server.tokenOf(first.installation);
  let release;
  world.server.knobs.gate = new Promise((resolve) => (release = resolve));
  const sent = world.server.carried(old);
  const late = stale.host.synchronize();
  await until(() => world.server.carried(old) > sent, 'the old tab’s request left');
  world.server.revoke(first.installation);
  await first.host.dispose();
  assert.deepEqual(await world.pairing.unpair(), { ok: true });
  world.server.knobs.gate = null;
  const next = await world.paired();
  release();
  assert.equal((await late).error, 'authentication-required');
  await until(() => stale.host.status().closed, 'the old tab stopped');
  assert.equal(stale.host.status().closed, 'study-pairing-changed');
  let kept = world.store.peek();
  assert.equal(kept.scope.installation, next.installation);
  assert.equal(kept.sealed, world.server.tokenOf(next.installation));
  assert.equal(kept.ended, null);
  assert.equal(world.endedMark.get(), null);
  assert.equal(world.marker.get(), true);
  assert.equal((await next.host.synchronize()).state, 'up-to-date');
  await next.host.dispose();
  await stale.host.dispose();

  // a first open that finishes after the pairing was replaced: the new, unfetched pairing is not marked ready
  const slow = createWorld();
  const minted = slow.server.code();
  await slow.pairing.pair(pairLine(minted));
  const opening = await slow.tab({ deaf: true }).openHost();
  const before = slow.server.log.length;
  let letGo;
  slow.server.knobs.gate = new Promise((resolve) => (letGo = resolve));
  const binding = slow.bind(opening);
  await until(() => slow.server.log.length > before, 'the first fetch left');
  assert.deepEqual(await slow.pairing.unpair(), { ok: true });
  const replaced = slow.server.code();
  slow.server.knobs.gate = null;
  assert.equal((await slow.pairing.pair(pairLine(replaced))).ok, true);
  letGo();
  await assert.rejects(binding, /study-pairing-changed/);
  kept = slow.store.peek();
  assert.equal(kept.scope.installation, replaced.installation);
  assert.equal(kept.phase, 'allocated');
  assert.equal(kept.ended, null);
  assert.equal(opening.status().closed, 'study-pairing-changed');
  await opening.dispose();
});

test('after the pairing has ended an answer is refused in plain words, nothing is saved, and what was waiting is counted and kept', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.adapter.platform.requestNewCards();
  // two answers given with no connection: they wait on the device
  world.state.online = false;
  const waiting = [
    await grade(bunki.adapter.backend, catalog[0].taskKey, 3),
    await grade(bunki.adapter.backend, catalog[1].taskKey, 4),
  ];
  const next = intentFor(bunki.adapter.backend, catalog[2].taskKey);
  world.state.online = true;
  world.server.revoke(bunki.installation);
  assert.equal((await bunki.host.synchronize()).state, 'paused-auth');
  await until(() => world.store.peek().ended, 'the row was ended');
  assert.equal(bunki.host.status().closed, 'study-pairing-ended');
  assert.equal(bunki.host.status().unsent, 2);

  // every way of giving an answer is refused, with the plain line, and none reports a success
  const before = canonicalStringify(bunki.adapter.backend.readProjection());
  for (const give of [
    () => bunki.adapter.submit(next),
    () => bunki.adapter.resume(next),
    () => bunki.adapter.backend.submitCommand(next),
    () => bunki.adapter.backend.resumeCommand(next),
    () => bunki.adapter.backend.mutate('review', catalog[2].taskKey),
  ])
    await assert.rejects(give(), notSaved);
  assert.equal(canonicalStringify(bunki.adapter.backend.readProjection()), before);
  assert.equal((await bunki.adapter.store.status()).pending, 2);

  // what was waiting stays on the device, and the device says how many answers never reached the server
  assert.deepEqual(world.store.peek().ended, { at: world.now(), by: 'server', unsent: 2 });
  const status = await world.pairing.status();
  assert.deepEqual([status.paired, status.ended, status.unsent], [true, true, 2]);
  const outbox = (await (await replicaOf(world, bunki.installation)).outbox(500)).map(
    (record) => record.event.id,
  );
  for (const made of waiting) assert.ok(outbox.includes(made.result.eventId));
  await bunki.host.dispose();
});

test('a server refusal on reopen counts the offline answer from the existing replica', async () => {
  const world = createWorld();
  const first = await world.paired();
  await first.adapter.platform.requestNewCards();
  world.state.online = false;
  await grade(first.adapter.backend, catalog[0].taskKey, 3);
  await first.host.dispose();

  world.server.revoke(first.installation);
  world.state.online = true;
  const reopened = await world.openHost();
  await assert.rejects(world.bind(reopened), /study-pairing-ended/);
  await until(() => world.store.peek().ended, 'the reopened installation was ended');
  assert.equal(world.store.peek().ended.unsent, 1);
  assert.equal((await (await replicaOf(world, first.installation)).status()).pendingUpload, 1);
  await reopened.dispose();
});

test('the ended-pairing count covers unacknowledged answers beyond one upload page', async () => {
  const world = createWorld();
  const minted = world.server.code();
  await world.pairing.pair(pairLine(minted));
  const host = await world.openHost();
  let refused = false;
  // Diagnostic fixture with two reviews beyond the 500-row wire window and
  // one acknowledged review. Sync still uses the canonical store until refusal.
  const rows = Array.from({ length: 503 }, (_, index) => ({
    event: { type: index < 500 ? 'settings' : 'review' },
    ackedSeq: index === 502 ? 7 : null,
  }));
  await host.withAdapter(async (binding) => {
    const adapter = await createBunkiStudyAdapter({ ...binding, content });
    return {
      ...adapter,
      store: {
        ...adapter.store,
        outbox: (...args) => (refused ? rows.slice(0, args[0]) : adapter.store.outbox(...args)),
        readState: (...args) => (refused ? { local: rows } : adapter.store.readState(...args)),
      },
    };
  });
  world.server.revoke(minted.installation);
  refused = true;
  await host.synchronize();
  await until(() => world.store.peek().ended, 'the installation was ended');
  assert.equal(world.store.peek().ended.unsent, 2);
  await host.dispose();
});

test('forgetting is made durable first: a page that closes midway leaves a pairing that is ended, never one that comes back', async () => {
  // the order, when nothing fails: the mark, the row ended, the row removed, the flag cleared
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.host.dispose();
  world.store.calls.length = 0;
  world.localStorage.writes.length = 0;
  assert.deepEqual(await world.pairing.unpair(), { ok: true });
  assert.deepEqual(world.store.calls, ['forget', 'remove']);
  assert.deepEqual(world.localStorage.writes, [[ENDED_MARKER, `${bunki.installation}|learner`]]);
  assert.equal(world.store.peek(), null);

  // the page closes after the row was ended and before it was removed
  const cut = createWorld();
  const held = await cut.paired();
  await held.host.dispose();
  cut.store.failing.remove = 1;
  assert.deepEqual(await cut.pairing.unpair(), { ok: false, code: 'storage-unavailable' });
  let row = cut.store.peek();
  assert.equal(row.sealed, null);
  assert.equal(row.ended.by, 'learner');
  assert.deepEqual(cut.endedMark.get(), { installation: held.installation, by: 'learner' });
  assert.equal(cut.marker.get(), true);
  // nothing brings it back: no host, no request, and no healing
  const asked = cut.server.log.length;
  await assert.rejects(cut.openHost(), /study-pairing-ended/);
  assert.equal(cut.server.log.length, asked);
  // the next look at the pairing finishes the forgetting
  assert.equal(await cut.pairing.heal(), false);
  assert.equal(cut.store.peek(), null);
  assert.equal(cut.marker.get(), false);
  assert.equal(cut.endedMark.get(), null);
  assert.equal((await cut.pairing.status()).paired, false);

  // the first write itself fails: the mark already says the pairing is being forgotten
  const early = createWorld();
  const kept = await early.paired();
  await kept.host.dispose();
  early.store.failing.forget = 1;
  assert.deepEqual(await early.pairing.unpair(), { ok: false, code: 'storage-unavailable' });
  row = early.store.peek();
  assert.notEqual(row.sealed, null);
  assert.deepEqual(early.endedMark.get(), { installation: kept.installation, by: 'learner' });
  const before = early.server.log.length;
  await assert.rejects(early.openHost(), /study-pairing-ended/);
  assert.equal(early.server.log.length, before);
  assert.equal(await early.pairing.heal(), false);
  assert.equal(early.store.peek(), null);

  // a pairing the server ended is not healed either, even with both its marks gone
  const refused = createWorld();
  const ended = await refused.paired();
  refused.server.revoke(ended.installation);
  await ended.host.synchronize();
  await until(() => refused.store.peek().ended, 'the row was ended');
  await ended.host.dispose();
  refused.marker.clear();
  refused.endedMark.clear();
  assert.equal(await refused.pairing.heal(), false);
  assert.equal(refused.marker.get(), false);
  // and the mark page start reads is put back for it
  assert.deepEqual(refused.endedMark.get(), { installation: ended.installation, by: 'server' });
  // a pairing that is still one does get its lost flag back
  const live = createWorld();
  const whole = await live.paired();
  live.marker.clear();
  assert.equal(await live.pairing.heal(), true);
  assert.equal(live.marker.get(), true);
  await whole.host.dispose();
});

test('a refusal the device could not write down stays a refusal: tried again, marked for page start, never asked again', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  world.server.revoke(bunki.installation);
  world.store.failing.end = 99;
  assert.equal((await bunki.host.synchronize()).state, 'paused-auth');
  // this page knows at once, and the mark page start reads is already written
  await until(() => bunki.host.status().closed, 'the host stopped');
  assert.equal(bunki.host.status().closed, 'study-pairing-ended');
  assert.deepEqual(world.endedMark.get(), { installation: bunki.installation, by: 'server' });
  // the row could not be written: the write is tried again, and again
  await until(() => world.store.calls.filter((call) => call === 'end').length === 3, 'three tries');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(world.store.calls.filter((call) => call === 'end').length, 3);
  assert.notEqual(world.store.peek().sealed, null);
  assert.equal(world.store.peek().ended, null);
  const asked = world.server.log.length;
  assert.equal((await bunki.host.synchronize()).state, 'paused-auth');
  assert.equal(world.server.log.length, asked);
  await bunki.host.dispose();

  // a reload: the credential is still in the row, and it is not used; the server is not asked again
  await assert.rejects(world.openHost(), /study-pairing-ended/);
  assert.equal(world.server.log.length, asked);
  assert.equal(world.store.peek().ended, null);
  let status = await world.pairing.status();
  assert.deepEqual([status.paired, status.ended], [true, true]);
  assert.equal(world.server.log.length, asked);
  // once the device can write again, the row is ended by whoever looks next
  world.store.failing.end = 0;
  await assert.rejects(world.openHost(), /study-pairing-ended/);
  assert.equal(world.store.peek().sealed, null);
  assert.equal(world.store.peek().ended.by, 'server');
  status = await world.pairing.status();
  assert.deepEqual([status.paired, status.ended], [true, true]);
  assert.equal(world.server.log.length, asked);

  // the same through Settings alone: the mark stands, the row is written when the block looks
  const later = createWorld();
  const device = await later.paired();
  later.server.revoke(device.installation);
  later.store.failing.end = 99;
  await device.host.synchronize();
  await until(() => later.store.calls.filter((call) => call === 'end').length === 3, 'three tries');
  await device.host.dispose();
  later.store.failing.end = 0;
  assert.equal((await later.pairing.status()).ended, true);
  assert.equal(later.store.peek().sealed, null);
});

/** shared-study-boot.mjs acts once, at import, on the page's globals: each case is a process of its own. */
function boot({ marked, ended = false }) {
  const marks = [
    ...(marked ? [[PAIRED_MARKER, '1']] : []),
    ...(ended ? [[ENDED_MARKER, `bunkiweb-${'a'.repeat(32)}|server`]] : []),
  ];
  const script = `
    const kept = new Map(${JSON.stringify(marks)});
    const reloads = [];
    const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    define('localStorage', { getItem: (key) => (kept.has(key) ? kept.get(key) : null), setItem: (key, value) => void kept.set(key, value), removeItem: (key) => void kept.delete(key) });
    define('location', { reload: () => void reloads.push(1) });
    await import(${JSON.stringify(new URL('shared-study-boot.mjs', root).href)});
    const host = globalThis.bunkiSharedStudyHost;
    const out = { bound: !!host, kind: host?.kind ?? null, block: typeof globalThis.bunkiStudyPairing?.settingsBlock };
    if (host) {
      out.status = host.status();
      out.closed = host.closed();
      out.refusal = await host.withAdapter(() => { throw new Error('unreachable'); }).then(() => 'opened', (error) => error.code);
      out.after = { bound: !!globalThis.bunkiSharedStudyHost, marked: kept.has(${JSON.stringify(PAIRED_MARKER)}), reloads: reloads.length };
    }
    console.log(JSON.stringify(out));
    // a page keeps its channel open; this process has said what it had to say
    process.exit(0);
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
    timeout: 25000,
  });
  return JSON.parse(output.trim().split('\n').at(-1));
}

test(
  'page start: no flag binds nothing; a flag binds the host; a flag with no pairing behind it is taken away',
  SLOW,
  () => {
    assert.deepEqual(boot({ marked: false }), { bound: false, kind: null, block: 'function' });
    const marked = boot({ marked: true });
    assert.equal(marked.bound, true);
    assert.equal(marked.kind, 'bunki-paired-study/v1');
    assert.deepEqual(marked.status, {
      started: false,
      ended: false,
      closed: null,
      state: 'idle',
      error: null,
      unsent: null,
    });
    assert.equal(marked.closed, null);
    assert.equal(marked.refusal, 'study-pairing-missing');
    assert.deepEqual(marked.after, { bound: false, marked: false, reloads: 1 });
  },
);

test(
  'page start honours the mark of an ended pairing: the flag alone does not bind it',
  SLOW,
  () => {
    assert.deepEqual(boot({ marked: true, ended: true }), {
      bound: false,
      kind: null,
      block: 'function',
    });
    assert.deepEqual(boot({ marked: false, ended: true }), {
      bound: false,
      kind: null,
      block: 'function',
    });
  },
);

/** Page start with `hash` in the address: what was done in what order, and the address afterwards. */
function bootWithLink(hash) {
  const script = `
    const order = [];
    let address = '/index.html?ui=ja' + ${JSON.stringify(hash)};
    const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    define('localStorage', { getItem: (key) => { order.push('read ' + key); return null; }, setItem: (key) => void order.push('write ' + key), removeItem: (key) => void order.push('remove ' + key) });
    define('sessionStorage', { getItem: () => null, setItem: (key) => void order.push('session ' + key), removeItem() {} });
    define('location', {
      get hash() { order.push('hash read'); const at = address.indexOf('#'); return at < 0 ? '' : address.slice(at); },
      pathname: '/index.html', search: '?ui=ja',
      reload: () => void order.push('reload'), replace: (url) => { order.push('replace'); address = url; },
    });
    define('history', { state: { kept: 1 }, replaceState(state, title, url) { order.push('replaceState'); this.kept = state; address = url; } });
    await import(${JSON.stringify(new URL('shared-study-boot.mjs', root).href)});
    console.log(JSON.stringify({ order, address, state: globalThis.history.kept ?? null }));
    process.exit(0);
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
    timeout: 25000,
  });
  return JSON.parse(output.trim().split('\n').at(-1));
}

test(
  'page start: a connect link leaves the address before anything else runs, a malformed one too, and no other address is touched',
  SLOW,
  () => {
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        code: NO_SUCH_CODE,
        learner: LEARNER,
        installation: studyInstallation(),
        server: SERVER,
        environment: ENVIRONMENT,
      }),
    ).toString('base64url');
    for (const hash of [
      `#study-connect=${payload}`,
      '#study-connect=%7B%22v%22%3A1!!',
      '#study-connect=',
    ]) {
      const started = bootWithLink(hash);
      // the first thing this page does with the address is take the link out of it, before any storage is read
      assert.deepEqual(started.order.slice(0, 2), ['hash read', 'replaceState'], hash);
      assert.equal(started.address, '/index.html?ui=ja', hash);
      assert.deepEqual(started.state, { kept: 1 });
      assert.equal(
        started.order.some((step) => /^(write|session) /.test(step)),
        false,
        hash,
      );
    }
    // an address of the app's own (a route) is left as it is
    const route = bootWithLink('#context');
    assert.equal(route.address, '/index.html?ui=ja#context');
    assert.equal(route.order.includes('replaceState'), false);
  },
);

/** As much of a page as the Settings block touches: elements that keep what is set on them, events that can be
 * fired, a timer that is held and a reload that is counted. The block in a real browser is the browser test's part. */
function pageDouble({ english = true, env = {} } = {}) {
  const element = (tag) => {
    const handlers = new Map();
    return {
      tag,
      className: '',
      id: '',
      textContent: '',
      value: '',
      hidden: false,
      disabled: false,
      isConnected: true,
      dataset: {},
      attributes: {},
      children: [],
      parent: null,
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      append(...nodes) {
        for (const node of nodes) {
          if (node.parent)
            node.parent.children = node.parent.children.filter((kept) => kept !== node);
          node.parent = this;
          this.children.push(node);
        }
      },
      replaceChildren(...nodes) {
        for (const node of this.children) node.parent = null;
        this.children = [];
        this.append(...nodes);
      },
      addEventListener(type, handler) {
        handlers.set(type, [...(handlers.get(type) || []), handler]);
      },
      fire(type) {
        return Promise.all(
          (handlers.get(type) || []).map((handler) => handler({ preventDefault() {} })),
        );
      },
    };
  };
  const timers = [];
  const intervals = [];
  const reloads = [];
  const find = (node, id) =>
    node.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean) || null;
  const said = (node) => [
    node.textContent,
    node.value,
    ...Object.values(node.dataset),
    ...node.children.flatMap((child) => said(child)),
  ];
  return {
    tx: (ja, en) => (english ? en : ja),
    el(tag, className, text) {
      const node = element(tag);
      node.className = className || '';
      if (text !== undefined && text !== null) node.textContent = text;
      return node;
    },
    env: {
      ...env,
      setTimeout: (run, ms) => void timers.push({ run, ms }),
      setInterval: (run, ms) => intervals.push({ run, ms }),
      clearInterval: (id) => void (intervals[id - 1] && (intervals[id - 1].cleared = true)),
      location: { reload: () => void reloads.push(1) },
    },
    timers,
    intervals,
    reloads,
    find,
    said: (node) => said(node).join('\n'),
  };
}
/** Whether the learner would see `node`: neither it nor anything it stands in is hidden. */
const seen = (node) => {
  for (let at = node; at; at = at.parent) if (at.hidden) return false;
  return true;
};
/** The Settings block of one tab: its page, its pairing, and the tab's own channel and storage events. */
async function settingsBlock(tab, host, english = true) {
  const page = pageDouble({ english, env: tab.env });
  const block = page.el('div', 'settings-study-device');
  await pairingModule.fillStudyPairingBlock(block, {
    tx: page.tx,
    el: page.el,
    env: page.env,
    pairing: tab.pairing,
    host,
    now: tab.now,
  });
  return { page, block, at: (id) => page.find(block, id) };
}
/** A connect link's payload, as the learner's own tools write it. */
const linkFor = (minted, fields = {}) =>
  Buffer.from(
    JSON.stringify({
      v: 1,
      code: minted.code,
      learner: LEARNER,
      installation: minted.installation,
      server: SERVER,
      environment: ENVIRONMENT,
      ...fields,
    }),
  ).toString('base64url');
/** The question a connect link asks, in one tab: its page, the panel, and whether it is on the page. */
async function connectPanel(tab, link, { english = true, env = {} } = {}) {
  const page = pageDouble({ english, env: { ...tab.env, ...env } });
  let mounted = null;
  const panel = await pairingModule.offerStudyConnect(link, {
    env: page.env,
    pairing: tab.pairing,
    english,
    el: page.el,
    mount: (node) => void (mounted = node),
    unmount: (node) => void (mounted = mounted === node ? null : mounted),
  });
  return { page, panel, at: (id) => page.find(panel, id), mounted: () => mounted };
}
/** Requests that spend a pairing code. */
const pairRequests = (world) => world.server.log.filter((row) => row.url.endsWith('/v1/pair'));
/** Let whatever was started run its course before something is said not to have happened. */
const settle = async () => {
  for (let turn = 0; turn < 25; turn++) await tick();
};
/** The shape shared-study-boot.mjs gives Settings for the page's host. */
function pageHost(study, order = []) {
  const listeners = new Set();
  study.host.subscribe(() => {
    for (const listener of [...listeners]) listener();
  });
  return {
    kind: 'bunki-paired-study/v1',
    status: () => study.host.status(),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async dispose() {
      order.push('sync stopped');
      await study.host.dispose();
    },
  };
}

test('Settings: Nihongo Study with no form, “Not connected” in the page’s language, and a connection made by a link shown at once', async () => {
  const world = createWorld();
  const { block, at } = await settingsBlock(world.tab(), null);
  assert.equal(block.dataset.state, 'unpaired');
  assert.equal(block.dataset.paired, 'false');
  assert.equal(block.children[0].textContent, 'Nihongo Study');
  assert.equal(
    at('study-pair-status').textContent,
    'Not connected. Study here stays on this device.',
  );
  // no form, no field, no code box: a device is connected by the link, never by typing
  const tags = (node) => [node.tag, ...node.children.flatMap(tags)];
  assert.deepEqual(
    tags(block).filter((tag) => ['form', 'input', 'textarea', 'label'].includes(tag)),
    [],
  );
  for (const id of ['study-pair-sync', 'study-unpair', 'study-unpair-what', 'study-pair-reopen'])
    assert.equal(seen(at(id)), false, id);
  const japanese = await settingsBlock(world.tab(), null, false);
  assert.equal(
    japanese.at('study-pair-status').textContent,
    '未接続。この端末の学習はこの端末だけに保存されます。',
  );
  assert.equal(japanese.at('study-unpair').textContent, '接続を解除');

  // a link opened in another tab connects this browser: the block hears it and says what is left to do
  const minted = world.server.code();
  assert.deepEqual(await world.pairing.pair({ link: linkFor(minted) }), {
    ok: true,
    learner: LEARNER,
    installation: minted.installation,
  });
  await until(() => block.dataset.state === 'reopen', 'the block heard of the connection');
  assert.equal(
    at('study-pair-status').textContent,
    'Connected. Reopen Bunki and study starts on your Nihongo Study record.',
  );
  assert.equal(seen(at('study-pair-reopen')), true);
  assert.equal(at('study-pair-sync').textContent, 'Not synced yet.');
  assert.equal(seen(at('study-unpair')), true);
  assert.equal(at('study-unpair').textContent, 'Disconnect');
  // what Disconnect does is said beside the second press, not before
  assert.equal(seen(at('study-unpair-what')), false);
  await until(() => japanese.block.dataset.state === 'reopen', 'the other block heard of it');
  assert.match(japanese.at('study-pair-status').textContent, /^接続済み。/);
});

test('a connect link asks one question: nothing is kept or sent before Connect, Not now keeps and sends nothing, and one click on Connect pairs', async () => {
  const world = createWorld();
  const minted = world.server.code();
  const link = linkFor(minted);
  const offer = await connectPanel(world, link);
  assert.equal(offer.panel.dataset.state, 'offer');
  assert.equal(offer.mounted(), offer.panel);
  assert.equal(
    offer.at('study-connect-title').textContent,
    'Connect this browser to your Nihongo Study record?',
  );
  assert.equal(offer.at('study-connect-server').textContent, `Server: ${new URL(SERVER).host}`);
  assert.equal(seen(offer.at('study-connect-yes')), true);
  assert.equal(offer.at('study-connect-yes').textContent, 'Connect');
  assert.equal(offer.at('study-connect-no').textContent, 'Not now');
  // before Connect: nothing sent, nothing kept, nothing written anywhere
  await settle();
  assert.deepEqual(world.server.log, []);
  assert.equal(world.store.peek(), null);
  assert.deepEqual(world.store.calls, []);
  assert.deepEqual(world.localStorage.writes, []);

  // Not now: the question goes away, and still nothing is sent or kept; a late press of Connect does nothing
  await offer.at('study-connect-no').fire('click');
  assert.equal(offer.mounted(), null);
  assert.equal(offer.panel.dataset.state, 'closed');
  await offer.at('study-connect-yes').fire('click');
  await settle();
  assert.deepEqual(world.server.log, []);
  assert.equal(world.store.peek(), null);
  assert.deepEqual(world.store.calls, []);
  assert.deepEqual(world.localStorage.writes, []);
  assert.deepEqual(offer.page.timers, []);
  assert.deepEqual(offer.page.reloads, []);

  // the same link opened again, and one click on Connect: one request, to the named server, and the page reopens
  const again = await connectPanel(world, link);
  await again.at('study-connect-yes').fire('click');
  assert.equal(again.panel.dataset.state, 'connected');
  assert.equal(again.at('study-connect-title').textContent, 'Connected');
  assert.equal(
    again.at('study-connect-note').textContent,
    'This browser now studies on your Nihongo Study record. Reopening Bunki…',
  );
  assert.equal(seen(again.at('study-connect-yes')), false);
  assert.equal(seen(again.at('study-connect-no')), false);
  assert.deepEqual(
    pairRequests(world).map((row) => row.url),
    [`${SERVER}/v1/pair`],
  );
  assert.equal(world.store.peek().scope.installation, minted.installation);
  assert.equal(world.marker.get(), true);
  assert.deepEqual(again.page.reloads, []);
  assert.equal(again.page.timers.length, 1);
  assert.ok(again.page.timers[0].ms >= 1000);
  again.page.timers[0].run();
  assert.deepEqual(again.page.reloads, [1]);

  // in Japanese, and a refusal from the server is one plain line with Close
  const other = createWorld();
  const japanese = await connectPanel(
    other,
    linkFor({ ...other.server.code(), code: NO_SUCH_CODE }),
    {
      english: false,
    },
  );
  assert.equal(
    japanese.at('study-connect-title').textContent,
    'このブラウザーを Nihongo Study の記録につなぎますか？',
  );
  assert.equal(japanese.at('study-connect-yes').textContent, '接続');
  assert.equal(japanese.at('study-connect-no').textContent, '今はしない');
  await japanese.at('study-connect-yes').fire('click');
  assert.equal(japanese.panel.dataset.state, 'failed');
  assert.equal(japanese.panel.dataset.refused, 'code-invalid-or-expired');
  assert.equal(
    japanese.at('study-connect-note').textContent,
    studyPairingLine('code-invalid-or-expired')[0],
  );
  assert.equal(seen(japanese.at('study-connect-yes')), false);
  assert.equal(japanese.at('study-connect-no').textContent, '閉じる');
  assert.equal(other.store.peek(), null);
  assert.deepEqual(japanese.page.reloads, []);
});

test('a connect link that names another server than the one this browser knows is refused with nothing sent', async () => {
  const world = createWorld({ voiceServer: SERVER });
  const minted = world.server.code();
  const elsewhere = linkFor(minted, { server: 'http://127.0.0.1:9' });
  const refused = await connectPanel(world, elsewhere);
  assert.equal(refused.panel.dataset.state, 'refused');
  assert.equal(refused.panel.dataset.refused, 'server-mismatch');
  assert.equal(
    refused.at('study-connect-title').textContent,
    'This link cannot connect this browser',
  );
  assert.match(
    refused.at('study-connect-note').textContent,
    /not the server this device is set up for\. Nothing was connected\./,
  );
  assert.equal(seen(refused.at('study-connect-yes')), false);
  assert.equal(refused.at('study-connect-no').textContent, 'Close');
  await refused.at('study-connect-yes').fire('click');
  // asked directly, the pairing call refuses it the same way
  assert.deepEqual(await world.pairing.pair({ link: elsewhere }), {
    ok: false,
    code: 'server-mismatch',
  });
  await settle();
  assert.deepEqual(world.server.log, []);
  assert.equal(world.store.peek(), null);
  assert.deepEqual(world.localStorage.writes, []);
  // a link that is not whole, or names a speak-only voice install, is refused the same way, before anything is sent
  const cut = await connectPanel(world, linkFor(minted).slice(0, 40));
  assert.equal(cut.panel.dataset.refused, 'invalid-link');
  const extra = await connectPanel(world, linkFor(minted, { token: 'x' }));
  assert.equal(extra.panel.dataset.refused, 'invalid-link');
  const voice = await connectPanel(
    world,
    linkFor({ ...minted, installation: `bunki-${'d'.repeat(32)}` }),
  );
  assert.equal(voice.panel.dataset.refused, 'not-a-study-device');
  assert.deepEqual(world.server.log, []);
});

test('an already-connected browser cannot be re-pointed by a link: it is told so and offered Close only', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await settle();
  const before = world.store.peek();
  const spent = pairRequests(world).length;
  const minted = world.server.code();
  const held = await connectPanel(world, linkFor(minted));
  assert.equal(held.panel.dataset.state, 'held');
  assert.equal(held.at('study-connect-title').textContent, 'This browser is already connected');
  assert.match(held.at('study-connect-note').textContent, /disconnect it in Settings first\.$/);
  assert.equal(seen(held.at('study-connect-yes')), false);
  assert.equal(held.at('study-connect-no').textContent, 'Close');
  // a press that reaches the hidden button does nothing, and the pairing call itself refuses
  await held.at('study-connect-yes').fire('click');
  assert.deepEqual(await world.pairing.pair({ link: linkFor(minted) }), {
    ok: false,
    code: 'already-paired',
  });
  await settle();
  assert.equal(pairRequests(world).length, spent);
  assert.equal(world.store.peek(), before);
  assert.equal(bunki.host.status().closed, null);
  await held.at('study-connect-no').fire('click');
  assert.equal(held.mounted(), null);
  await bunki.host.dispose();
});

test('the code of a connect link never reaches storage, a log or the words on the page', async () => {
  const world = createWorld();
  const minted = world.server.code();
  const link = linkFor(minted);
  const session = [];
  const sessionStorage = {
    getItem: () => null,
    setItem: (key, value) => void session.push([key, String(value)]),
    removeItem: () => {},
  };
  const printed = [];
  const kept = {};
  for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
    kept[name] = console[name];
    console[name] = (...args) => void printed.push(args.map(String).join(' '));
  }
  let offer;
  try {
    offer = await connectPanel(world, link, { env: { sessionStorage } });
    await offer.at('study-connect-yes').fire('click');
    await settle();
  } finally {
    Object.assign(console, kept);
  }
  assert.equal(offer.panel.dataset.state, 'connected');
  for (const [where, text] of [
    ['localStorage', JSON.stringify([...world.localStorage.kept, ...world.localStorage.writes])],
    ['sessionStorage', JSON.stringify(session)],
    ['the stored row', JSON.stringify(world.store.peek())],
    ['the panel', offer.page.said(offer.panel)],
    ['the console', printed.join('\n')],
  ]) {
    assert.equal(text.includes(minted.code), false, `the code reached ${where}`);
    assert.equal(text.includes(link), false, `the link reached ${where}`);
  }
  // the code went to the named server in the one request that spends it, and nowhere else
  const carrying = world.server.log.filter((row) => JSON.stringify(row).includes(minted.code));
  assert.deepEqual(
    carrying.map((row) => [row.method, row.url]),
    [['POST', `${SERVER}/v1/pair`]],
  );
});

test('Settings on a paired page: connected, when it last synced, a pairing the server ended, and Disconnect in two presses', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  await bunki.adapter.platform.requestNewCards();
  const synced = world.now();
  const order = [];
  const host = pageHost(bunki, order);
  const { page, block, at } = await settingsBlock(world, host);
  assert.equal(block.dataset.state, 'paired');
  assert.equal(block.dataset.bound, 'true');
  assert.equal(
    at('study-pair-status').textContent,
    'Connected. This device studies on your Nihongo Study record.',
  );
  assert.equal(at('study-pair-sync').textContent, 'Synced just now.');
  assert.equal(block.dataset.synced, String(synced));
  assert.equal(seen(at('study-pair-sync')), true);
  assert.equal(seen(at('study-unpair')), true);
  assert.equal(at('study-unpair').textContent, 'Disconnect');
  assert.equal(seen(at('study-unpair-what')), false);
  // the time is said again while Settings stays open, and in Japanese the same way
  world.advance(2 * 60000);
  assert.equal(page.intervals.length, 1);
  page.intervals[0].run();
  assert.equal(at('study-pair-sync').textContent, 'Synced 2 minutes ago.');
  assert.deepEqual(studySyncedLine(synced, synced + 2 * 60000), [
    '2分前に同期しました。',
    'Synced 2 minutes ago.',
  ]);
  assert.deepEqual(studySyncedLine(synced, synced + 3 * 3600000, true), [
    '最後の同期は3時間前です。',
    'Last synced 3 hours ago.',
  ]);
  // a page that has not opened study says it from the pairing's own row
  const elsewhere = await settingsBlock(world.tab(), null);
  assert.equal(elsewhere.block.dataset.state, 'reopen');
  assert.equal(elsewhere.at('study-pair-sync').textContent, 'Synced 2 minutes ago.');
  // that tab's Settings is closed again (a block no longer on its page stops listening)
  elsewhere.block.isConnected = false;
  // nothing the block holds is the credential or the server's address
  const shown = page.said(block);
  assert.equal(shown.includes(world.server.tokenOf(bunki.installation)), false);
  assert.equal(shown.includes(SERVER), false);

  world.state.online = false;
  await bunki.host.synchronize();
  assert.match(at('study-pair-sync').textContent, /^Offline\./);
  assert.match(at('study-pair-sync').textContent, / Last synced 2 minutes ago\.$/);
  // one answer given with no connection waits on the device
  await grade(bunki.adapter.backend, catalog[0].taskKey, 3);
  world.state.online = true;
  world.server.knobs.reducer = 'f'.repeat(64);
  await bunki.host.synchronize();
  assert.match(at('study-pair-sync').textContent, /needs an update/);
  world.server.knobs.reducer = SYNC_COMPATIBILITY.reducerSha256;

  // the server refuses the credential (a revocation, or a request from another origin than the one it was paired
  // from): the block says the pairing has ended and how many answers never reached the server; nothing is tried again
  world.server.revoke(bunki.installation);
  await bunki.host.synchronize();
  await until(() => block.dataset.unsent === '1', 'the block counted what was not sent');
  assert.equal(block.dataset.state, 'ended');
  assert.match(at('study-pair-status').textContent, /The server ended this device’s pairing/);
  assert.match(
    at('study-pair-status').textContent,
    /1 answer saved on this device was never uploaded\. It is still on this device\./,
  );
  assert.equal(seen(at('study-pair-sync')), false);
  assert.equal(seen(at('study-unpair')), true);
  const asked = world.server.log.length;
  await bunki.host.synchronize();
  assert.equal(world.server.log.length, asked);
  // a page opened afterwards, with no host, says the same from the device's own record
  await until(() => world.store.peek().ended?.unsent === 1, 'the row was ended, with its count');
  const reopened = await settingsBlock(world, null);
  assert.equal(reopened.block.dataset.state, 'ended');
  assert.equal(reopened.block.dataset.unsent, '1');
  assert.equal(seen(reopened.at('study-pair-sync')), false);
  assert.equal(seen(reopened.at('study-unpair')), true);

  await at('study-unpair').fire('click');
  assert.equal(at('study-unpair').textContent, 'Really disconnect (sync stops)');
  assert.equal(seen(at('study-unpair-what')), true);
  assert.match(at('study-unpair-what').textContent, /stays on the device, unused/);
  assert.notEqual(world.store.peek(), null);
  assert.deepEqual(order, []);
  world.store.calls.length = 0;
  await at('study-unpair').fire('click');
  // sync is stopped before anything of the pairing is touched
  assert.deepEqual(order, ['sync stopped']);
  assert.deepEqual(world.store.calls, ['forget', 'remove']);
  assert.equal(world.store.peek(), null);
  assert.equal(world.marker.get(), false);
  assert.match(at('study-pair-note').textContent, /still here, unused/);
  assert.equal(seen(at('study-pair-note')), true);
  assert.equal(seen(at('study-unpair')), false);
  assert.equal(world.replicas.size, 1);
  assert.equal(page.timers.length, 1);
  page.timers[0].run();
  assert.deepEqual(page.reloads, [1]);
  // the other block heard it and says the device is not connected
  await until(
    () => reopened.block.dataset.state === 'unpaired',
    'the other block heard of the forgetting',
  );
  assert.equal(
    reopened.at('study-pair-status').textContent,
    'Not connected. Study here stays on this device.',
  );
  assert.equal(seen(reopened.at('study-unpair')), false);
});

test('Settings in a tab whose pairing was changed elsewhere: it stops saying it is the pairing’s page', async () => {
  const world = createWorld();
  const first = await world.paired();
  const other = world.tab();
  const second = await other.study();
  const { block, at } = await settingsBlock(other, pageHost(second));
  assert.equal(block.dataset.state, 'paired');
  // the first tab forgets the pairing and makes another: this tab's block follows the device, not its old host
  await first.host.dispose();
  assert.deepEqual(await world.pairing.unpair(), { ok: true });
  await until(() => block.dataset.state === 'unpaired', 'the block heard of the forgetting');
  assert.equal(
    at('study-pair-status').textContent,
    'Not connected. Study here stays on this device.',
  );
  const next = await world.paired();
  await until(() => block.dataset.state === 'reopen', 'the block heard of the new pairing');
  assert.equal(block.dataset.bound, 'false');
  assert.equal(seen(at('study-pair-reopen')), true);
  // what it says of sync is the new pairing's own row, never the old host's
  assert.match(at('study-pair-sync').textContent, /^(Not synced yet|Synced just now)\.$/);
  assert.equal(at('study-pair-status').textContent.includes(next.installation.slice(-4)), false);
  await next.host.dispose();
  await second.host.dispose();
});

test('the channel and the marks: both tell the other tabs, and either alone is enough', async () => {
  assert.equal(PAIRING_CHANNEL, 'bunki-study-pairing');
  for (const without of ['the channel', 'the marks']) {
    const world = createWorld();
    const first = await world.paired();
    const other = world.tab();
    if (without === 'the channel') delete other.env.BroadcastChannel;
    else other.env.addEventListener = () => {};
    const second = await other.study();
    await first.host.dispose();
    assert.deepEqual(await world.pairing.unpair(), { ok: true });
    await until(() => second.host.status().closed, `the other tab stopped without ${without}`);
    assert.equal(second.host.status().closed, 'study-pairing-changed');
    await second.host.dispose();
  }
});
