/* global process, URL, Response, EventTarget, Buffer, console, setTimeout */
/** The paired study host against a double of the Nihongo Study server (ENGINE-ONE.3).
 *
 * Everything here is synthetic: a test learner, made-up codes and tokens, an in-process server that answers the
 * routes a study device uses (`/v1/pair`, `/v1/events`, `/v1/permits`), and memory storage. Nothing leaves the
 * process. The second device of the same learner is the engine's own sync client, driven directly, so a grade is
 * proven to cross between Bunki's host and a client that shares none of the host's code.
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
  studyMarker,
  PAIRED_MARKER,
  studyPairingLine,
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
const hex = (bytes) => randomBytes(bytes).toString('hex');
const studyInstallation = () => `bunkiweb-${hex(16)}`;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
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
    const device = bearer ? tokens.get(bearer) : null;
    if (target.pathname === '/v1/events') {
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
  };
}

/** The credential store's contract, in memory (the device store itself needs a browser's IndexedDB). */
function memoryCredentialStore() {
  let row = null;
  let address = null;
  const calls = [];
  return {
    available: true,
    calls,
    peek: () => row,
    async read() {
      return {
        server: address,
        device: row
          ? Object.freeze({
              server: row.server,
              scope: Object.freeze({ ...row.scope }),
              pairedAt: row.pairedAt,
              phase: row.phase,
              ended: row.ended,
            })
          : null,
        token: row && !row.ended ? row.token : null,
      };
    },
    async probe() {
      return true;
    },
    async write(value) {
      calls.push('write');
      row = {
        server: value.server,
        token: value.token,
        scope: { ...value.scope },
        pairedAt: value.pairedAt,
        phase: 'allocated',
        ended: null,
      };
      address = value.server;
    },
    async markReady() {
      calls.push('markReady');
      if (row) row.phase = 'ready';
    },
    async end({ at }) {
      calls.push('end');
      if (row) {
        row.token = null;
        row.ended = { at };
      }
    },
    async clear() {
      calls.push('clear');
      row = null;
    },
  };
}

function memoryLocalStorage({ refuse = false } = {}) {
  const kept = new Map();
  const writes = [];
  return {
    writes,
    kept,
    getItem: (key) => (kept.has(key) ? kept.get(key) : null),
    setItem(key, value) {
      writes.push([key, String(value)]);
      if (refuse) throw new Error('synthetic-quota');
      kept.set(key, String(value));
    },
    removeItem: (key) => void kept.delete(key),
  };
}

/** The line the learner pastes: the code, the learner, the device the code was minted for, and the server. */
const pairLine = (minted, server = SERVER) => ({
  learner: `Bunki study code: ${minted.code} (10 minutes) · learner: ${LEARNER} · device: ${minted.installation} · server: ${server}`,
  code: '',
});

/** One browser profile: its credential store, flag, replica databases, and a network that can be cut. */
function createWorld({ voiceServer = null, refuseFlag = false } = {}) {
  let clock = Date.parse('2026-11-21T03:00:00Z');
  const now = () => clock;
  const server = createServer({ now });
  const store = memoryCredentialStore();
  const localStorage = memoryLocalStorage({ refuse: refuseFlag });
  const marker = studyMarker({ localStorage });
  const replicas = new Map();
  const opened = [];
  const state = { online: true };
  const compatibility = async () => ({ 'X-NSRS-Reducer-SHA256': SYNC_COMPATIBILITY.reducerSha256 });
  const pairing = createStudyPairing({
    env: {},
    fetch: server.fetch,
    store,
    voiceAddress: async () => voiceServer,
    marker,
    now,
    compatibility,
  });
  const openHost = (overrides = {}) =>
    openPairedStudyHost({
      env: {},
      store,
      fetch: server.fetch,
      now,
      presentation: 'desktop',
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
    now,
    advance: (ms) => void (clock += ms),
    server,
    store,
    localStorage,
    marker,
    replicas,
    opened,
    state,
    pairing,
    compatibility,
    openHost,
    bind,
    /** Pair this profile with a fresh code, open its host and fetch the record once. */
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

async function grade(backend, key, rating) {
  const attempt = backend.snapshotAttempt(key);
  const preview = backend.preview(attempt, 1800);
  const result = await backend.submitCommand(preview.intents[rating]);
  assert.equal(result.kind, 'durable');
  return { result, preview };
}
const reviews = (backend) => backend.readProjection().reviews;

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
  assert.equal(kept.token, world.server.tokenOf(minted.installation));
  assert.deepEqual(kept.scope, {
    environment: ENVIRONMENT,
    learner: LEARNER,
    installation: minted.installation,
  });
  assert.equal(kept.phase, 'allocated');
  assert.equal(world.marker.get(), true);
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
    state: 'up-to-date',
    error: null,
  });
  // every sync request carries the credential and the replica's capability, and a GET nothing more
  const pull = world.server.log.find((row) => row.url.startsWith(`${SERVER}/v1/events?`));
  assert.deepEqual(Object.keys(pull.headers).sort(), ['Authorization', 'X-NSRS-Reducer-SHA256']);
  await host.dispose();
});

test('the pairing line: the code, the learner and the device in any order, in one box or two; a code alone cannot pair', () => {
  const code = 'A0B0A0B0A0B0';
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
    { learner: `learner: ${LEARNER} · device: ${device}`, code: 'ABCDEF01234' },
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
    (world) => ({ ...world.server.code(), code: 'A0B0A0B0A0B0' }),
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
    env: {},
    fetch: late.server.fetch,
    store: late.store,
    voiceAddress: async () => null,
    marker: flaky,
    compatibility: late.compatibility,
  });
  assert.deepEqual(await pairing.pair(pairLine(again)), { ok: false, code: 'storage-unavailable' });
  assert.equal(late.store.peek(), null);
  assert.deepEqual(late.store.calls, ['write', 'clear']);
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
  assert.deepEqual(host.status(), { started: false, ended: false, state: 'idle', error: null });
  world.state.online = true;
  const adapter = await world.bind(host);
  assert.equal(adapter.identity.installation, minted.installation);
  assert.equal(adapter.identity.mode, 'open');
  assert.equal(world.store.peek().phase, 'ready');
  assert.equal(world.replicas.size, 1);
  await host.dispose();
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
  assert.notEqual(world.store.peek().token, null);
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
  await tick();
  assert.equal(bunki.host.status().ended, true);
  assert.equal(bunki.adapter.platform.getSyncError(), 'authentication-required');
  assert.equal(bunki.adapter.platform.isPaired(), false);
  assert.equal(bunki.adapter.platform.canRequestNewCards(), false);
  assert.ok(told > 0);
  assert.equal(world.store.peek().token, null);
  assert.ok(world.store.peek().ended);
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
  // and none after a restart: the next page finds the pairing ended and asks nobody
  const again = await world.openHost();
  assert.equal(again.status().ended, true);
  const adapter = await world.bind(again);
  assert.equal(adapter.platform.isPaired(), false);
  assert.equal((await again.synchronize()).state, 'paused-auth');
  assert.equal(world.server.log.length, asked);
  assert.equal((await adapter.store.status()).pending, 1);
  await again.dispose();
});

test('401 on a permit request ends the pairing the same way', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  world.server.revoke(bunki.installation);
  // the sync inside the request is refused first; the host must not go on to ask for permits
  await bunki.adapter.platform.requestNewCards().catch(() => null);
  await tick();
  assert.equal(bunki.host.status().ended, true);
  assert.equal(world.store.peek().token, null);
  assert.equal(world.server.log.filter((row) => row.url === `${SERVER}/v1/permits`).length, 0);
  await bunki.host.dispose();

  // the permit route itself refuses a credential the event route still takes
  const late = createWorld();
  const device = await late.paired();
  late.server.knobs.refusePermits = true;
  await device.adapter.platform.requestNewCards().catch(() => null);
  await tick();
  assert.equal(late.server.log.filter((row) => row.url === `${SERVER}/v1/permits`).length, 1);
  assert.equal(device.host.status().ended, true);
  assert.equal(late.store.peek().token, null);
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
  assert.equal(world.localStorage.kept.has(PAIRED_MARKER), false);
  assert.equal((await world.store.read()).server, SERVER);
  assert.deepEqual(await world.pairing.status(), {
    available: true,
    failed: false,
    paired: false,
    ended: false,
    learner: null,
    installation: null,
    marked: false,
  });
  await assert.rejects(
    world.openHost(),
    (error) => error.code === 'study-pairing-missing' && error.bunkiLine.length === 2,
  );
  assert.equal((await bunki.host.synchronize()).error, 'study-host-not-started');
  assert.equal(world.server.log.length, asked);
  // the copy is still on the device, whole
  const replica = world.replicas.get(`bunki-shared-study-paired-${bunki.installation}`);
  const engine = createStudyEngine({ content, learner: LEARNER, timezone: 'Asia/Tokyo' });
  const store = await engine.openStore({
    adapter: replica,
    scope: { learner: LEARNER, environment: ENVIRONMENT, installation: bunki.installation },
    now: world.now,
  });
  const state = await store.readState();
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
    await tick();
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
    assert.deepEqual(
      world.localStorage.writes.filter(([key]) => key === PAIRED_MARKER),
      [[PAIRED_MARKER, '1']],
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

/** shared-study-boot.mjs acts once, at import, on the page's globals: each case is a process of its own. */
function boot({ marked }) {
  const script = `
    const kept = new Map(${marked ? `[[${JSON.stringify(PAIRED_MARKER)}, '1']]` : ''});
    const reloads = [];
    const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    define('localStorage', { getItem: (key) => (kept.has(key) ? kept.get(key) : null), setItem: (key, value) => void kept.set(key, value), removeItem: (key) => void kept.delete(key) });
    define('location', { reload: () => void reloads.push(1) });
    await import(${JSON.stringify(new URL('shared-study-boot.mjs', root).href)});
    const host = globalThis.bunkiSharedStudyHost;
    const out = { bound: !!host, kind: host?.kind ?? null, block: typeof globalThis.bunkiStudyPairing?.settingsBlock };
    if (host) {
      out.status = host.status();
      out.refusal = await host.withAdapter(() => { throw new Error('unreachable'); }).then(() => 'opened', (error) => error.code);
      out.after = { bound: !!globalThis.bunkiSharedStudyHost, marked: kept.has(${JSON.stringify(PAIRED_MARKER)}), reloads: reloads.length };
    }
    console.log(JSON.stringify(out));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
  return JSON.parse(output.trim().split('\n').at(-1));
}

test('page start: no flag binds nothing; a flag binds the host; a flag with no pairing behind it is taken away', () => {
  assert.deepEqual(boot({ marked: false }), { bound: false, kind: null, block: 'function' });
  const marked = boot({ marked: true });
  assert.equal(marked.bound, true);
  assert.equal(marked.kind, 'bunki-paired-study/v1');
  assert.deepEqual(marked.status, { started: false, ended: false, state: 'idle', error: null });
  assert.equal(marked.refusal, 'study-pairing-missing');
  assert.deepEqual(marked.after, { bound: false, marked: false, reloads: 1 });
});

/** As much of a page as the Settings block touches: elements that keep what is set on them, events that can be
 * fired, a timer that is held and a reload that is counted. The block in a real browser is the browser test's part. */
function pageDouble({ english = true } = {}) {
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
      setTimeout: (run, ms) => void timers.push({ run, ms }),
      location: { reload: () => void reloads.push(1) },
    },
    timers,
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
async function settingsBlock(world, host, english = true) {
  const page = pageDouble({ english });
  const block = page.el('div', 'settings-study-device');
  await pairingModule.fillStudyPairingBlock(block, {
    tx: page.tx,
    el: page.el,
    env: page.env,
    pairing: world.pairing,
    host,
  });
  return { page, block, at: (id) => page.find(block, id) };
}

test('Settings: the form, a refusal in plain words in the page’s language, and a pairing that says so and reopens the page', async () => {
  const world = createWorld();
  const { page, block, at } = await settingsBlock(world, null);
  assert.equal(block.dataset.state, 'unpaired');
  assert.equal(block.dataset.paired, 'false');
  assert.equal(seen(at('study-pair-form')), true);
  assert.equal(seen(at('study-unpair')), false);
  assert.equal(seen(at('study-pair-reopen')), false);
  assert.match(at('study-pair-status').textContent, /not connected to a Nihongo Study record yet/);

  const wrong = pairLine({ ...world.server.code(), code: 'A0B0A0B0A0B0' }).learner;
  at('study-pair-learner').value = wrong;
  await at('study-pair-form').fire('submit');
  assert.equal(block.dataset.refused, 'code-invalid-or-expired');
  assert.equal(at('study-pair-note').textContent, studyPairingLine('code-invalid-or-expired')[1]);
  assert.equal(block.dataset.state, 'unpaired');
  assert.equal(seen(at('study-pair-form')), true);
  assert.equal(world.store.peek(), null);
  assert.deepEqual(page.timers, []);
  // a code typed alone, as the form's second box invites: the block says what is missing
  at('study-pair-learner').value = '';
  at('study-pair-code').value = 'A0B0A0B0A0B0';
  await at('study-pair-form').fire('submit');
  assert.equal(block.dataset.refused, 'invalid-pairing');
  at('study-pair-learner').value = LEARNER;
  await at('study-pair-form').fire('submit');
  assert.equal(block.dataset.refused, 'pairing-line-required');
  assert.match(at('study-pair-note').textContent, /A code alone cannot pair/);
  at('study-pair-code').value = '';

  const japanese = await settingsBlock(world, null, false);
  japanese.at('study-pair-learner').value = wrong;
  await japanese.at('study-pair-form').fire('submit');
  assert.equal(
    japanese.at('study-pair-note').textContent,
    studyPairingLine('code-invalid-or-expired')[0],
  );
  assert.match(
    japanese.at('study-pair-status').textContent,
    /Nihongo Study の記録につながっていません/,
  );
  assert.notEqual(
    studyPairingLine('code-invalid-or-expired')[0],
    studyPairingLine('code-invalid-or-expired')[1],
  );

  const minted = world.server.code();
  at('study-pair-learner').value = pairLine(minted).learner;
  await at('study-pair-form').fire('submit');
  assert.equal(block.dataset.paired, 'true');
  assert.match(
    at('study-pair-note').textContent,
    new RegExp(`now studies on ${LEARNER}’s Nihongo Study record`),
  );
  assert.equal(seen(at('study-pair-note')), true);
  assert.equal(seen(at('study-pair-form')), false);
  assert.equal(at('study-pair-learner').value, '');
  assert.equal(world.store.peek().scope.installation, minted.installation);
  // the page is opened again only after it has said so
  assert.deepEqual(page.reloads, []);
  assert.equal(page.timers.length, 1);
  assert.ok(page.timers[0].ms >= 1000);
  page.timers[0].run();
  assert.deepEqual(page.reloads, [1]);
  // a page that has not been opened again yet says what is left to do
  const waiting = await settingsBlock(world, null);
  assert.equal(waiting.block.dataset.state, 'reopen');
  assert.equal(seen(waiting.at('study-pair-reopen')), true);
  assert.equal(seen(waiting.at('study-pair-form')), false);
});

test('Settings on a paired page: whose record, how sync stands, a pairing the server ended, and forgetting in two presses', async () => {
  const world = createWorld();
  const bunki = await world.paired();
  const order = [];
  const listeners = new Set();
  bunki.host.subscribe(() => {
    for (const listener of [...listeners]) listener();
  });
  // the shape shared-study-boot.mjs gives Settings for the page's host
  const host = {
    kind: 'bunki-paired-study/v1',
    status: () => bunki.host.status(),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async dispose() {
      order.push(
        world.store.peek() ? 'sync stopped while the credential was kept' : 'sync stopped late',
      );
      await bunki.host.dispose();
    },
  };
  const { page, block, at } = await settingsBlock(world, host);
  assert.equal(block.dataset.state, 'paired');
  assert.equal(block.dataset.bound, 'true');
  assert.equal(
    at('study-pair-status').textContent,
    `This device studies on ${LEARNER}’s Nihongo Study record (device …${bunki.installation.slice(-4)}).`,
  );
  assert.equal(at('study-pair-sync').textContent, 'Synced.');
  assert.equal(seen(at('study-pair-sync')), true);
  assert.equal(seen(at('study-pair-form')), false);
  assert.equal(seen(at('study-unpair')), true);
  assert.match(at('study-unpair-what').textContent, /stays on the device, unused/);
  // nothing the block holds is the credential or the server's address
  const shown = page.said(block);
  assert.equal(shown.includes(world.server.tokenOf(bunki.installation)), false);
  assert.equal(shown.includes(SERVER), false);

  world.state.online = false;
  await bunki.host.synchronize();
  assert.match(at('study-pair-sync').textContent, /^Offline\./);
  world.state.online = true;
  world.server.knobs.reducer = 'f'.repeat(64);
  await bunki.host.synchronize();
  assert.match(at('study-pair-sync').textContent, /needs an update/);
  world.server.knobs.reducer = SYNC_COMPATIBILITY.reducerSha256;
  await bunki.host.synchronize();
  assert.equal(at('study-pair-sync').textContent, 'Synced.');

  // the server refuses the credential (a revocation, or a request from another origin than the one it was paired
  // from): the block says the pairing has ended, in plain words, and nothing is tried again
  world.server.revoke(bunki.installation);
  await bunki.host.synchronize();
  await tick();
  assert.equal(block.dataset.state, 'ended');
  assert.match(at('study-pair-status').textContent, /The server ended this device’s pairing/);
  assert.equal(seen(at('study-pair-sync')), false);
  assert.equal(seen(at('study-unpair')), true);
  const asked = world.server.log.length;
  await bunki.host.synchronize();
  assert.equal(world.server.log.length, asked);

  await at('study-unpair').fire('click');
  assert.match(at('study-unpair').textContent, /Really forget it/);
  assert.notEqual(world.store.peek(), null);
  assert.deepEqual(order, []);
  await at('study-unpair').fire('click');
  assert.deepEqual(order, ['sync stopped while the credential was kept']);
  assert.equal(world.store.peek(), null);
  assert.equal(world.marker.get(), false);
  assert.match(at('study-pair-note').textContent, /still here, unused/);
  assert.equal(seen(at('study-pair-note')), true);
  assert.equal(seen(at('study-unpair')), false);
  assert.equal(world.replicas.size, 1);
  assert.equal(page.timers.length, 1);
  page.timers[0].run();
  assert.deepEqual(page.reloads, [1]);
});
