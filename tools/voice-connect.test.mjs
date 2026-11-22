/* global process, URL, Buffer, setTimeout, console */
/** The voice link (LEAN, 2026-11-22): `<bunki origin>/#voice-connect=<payload>` turns Bunki's voice on with one
 * click. These cases hold its guarantees: the parser keeps the pairing line's rules; page start takes the link out of
 * the address before anything else, a malformed one too; the question sends nothing before Turn on and nothing on Not
 * now; a browser whose voice is on already is told so and never paired again; a link naming another server is refused
 * with nothing sent; the code never reaches storage, a log or the panel's words. tools/voice-connect-controls.test.mjs
 * plants one fault per guarantee and holds each of these tests to going red on it.
 *
 * No request leaves this process: the voice client is the real one, over a fetch double and a store double. Every
 * value is made up. BUNKI_VOICE_LINK_ROOT points the suite at a copy of the corridor folder (the controls' copy). */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
const root = process.env.BUNKI_VOICE_LINK_ROOT
  ? pathToFileURL(`${process.env.BUNKI_VOICE_LINK_ROOT.replace(/\/+$/, '')}/`)
  : new URL('../prototypes/corridor/', import.meta.url);
const client = await import(new URL('modules/voice-client.mjs', root).href);
const { offerVoiceConnect } = await import(new URL('modules/voice-connect.mjs', root).href);
const lines = await import(new URL('modules/voice-lines.mjs', root).href);
const SLOW = { timeout: 60000 };

const CODE = 'A0B0A0B0A0B0';
const LEARNER = 'test-learner';
const SERVER = 'https://test.example.workers.dev';
const OTHER = 'https://other.example.workers.dev';
const payloadOf = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const LINK = payloadOf({ v: 1, code: CODE, learner: LEARNER, server: SERVER });
const token = () => `${'nsrs'}_prod_${'x'.repeat(8)}.${'0'.repeat(64)}`;

test("a voice link is read under the pairing line's rules, and anything else is refused", () => {
  assert.deepEqual(client.parseVoiceConnect(LINK), {
    code: CODE,
    learner: LEARNER,
    server: SERVER,
  });
  assert.deepEqual(
    client.parseVoiceConnect(
      payloadOf({ v: 1, code: 'a0b0-a0b0 a0b0', learner: LEARNER, server: `${SERVER}/` }),
    ),
    { code: CODE, learner: LEARNER, server: SERVER },
  );
  const bad = [
    payloadOf({ v: 2, code: CODE, learner: LEARNER, server: SERVER }),
    payloadOf({ v: 1, code: CODE, learner: LEARNER }),
    payloadOf({ v: 1, code: CODE, learner: LEARNER, server: SERVER, extra: 1 }),
    payloadOf({ v: 1, code: 'A0B0A0B0A0', learner: LEARNER, server: SERVER }),
    payloadOf({ v: 1, code: CODE, learner: 'nsrs_test', server: SERVER }),
    payloadOf({ v: 1, code: CODE, learner: LEARNER, server: 'https://test.example.com' }),
    payloadOf({ v: 1, code: CODE, learner: LEARNER, server: 'http://test.example.workers.dev' }),
    payloadOf({ v: 1, code: CODE, learner: LEARNER, server: `${SERVER}/v1` }),
    payloadOf([1]),
    `${LINK}!`,
    '',
    'x'.repeat(2001),
    null,
  ];
  for (const text of bad)
    assert.deepEqual(
      client.parseVoiceConnect(text),
      { error: 'invalid-link' },
      String(text).slice(0, 80),
    );
});

test('the one Settings field takes a voice link or the line an older launcher prints', async () => {
  assert.deepEqual(
    client.voicePairingInput(`  https://bunki.example.pages.dev/#voice-connect=${LINK}\n`),
    { link: LINK },
  );
  assert.deepEqual(client.voicePairingInput(`#voice-connect=${LINK}`), { link: LINK });
  const line = `Bunki voice code: ${CODE} (10 minutes) · learner: ${LEARNER} · server: ${SERVER}`;
  assert.deepEqual(client.parsePairing(client.voicePairingInput(line)), {
    code: CODE,
    learner: LEARNER,
    server: SERVER,
  });
  for (const input of [{ link: LINK }, client.voicePairingInput(line)]) {
    const world = createWorld();
    assert.deepEqual(await world.client.pair(input), {
      ok: true,
      installation: world.installation,
    });
    assert.equal(world.calls.length, 1);
  }
});

/** Page start with `hash` in the address, in a process of its own: what was done in what order, and the address after. */
function bootWithLink(hash) {
  const script = `
    const order = [];
    let address = '/index.html?ui=ja' + ${JSON.stringify(hash)};
    const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    define('localStorage', { getItem: (key) => { order.push('read ' + key); return null; }, setItem: (key) => void order.push('write ' + key), removeItem: (key) => void order.push('remove ' + key) });
    define('sessionStorage', { getItem: () => null, setItem: (key) => void order.push('session ' + key), removeItem() {} });
    define('fetch', (url) => { order.push('fetch'); return Promise.reject(new Error('no network here')); });
    define('location', {
      get hash() { order.push('hash read'); const at = address.indexOf('#'); return at < 0 ? '' : address.slice(at); },
      pathname: '/index.html', search: '?ui=ja',
      reload: () => void order.push('reload'), replace: (url) => { order.push('replace'); address = url; },
    });
    define('history', { state: { kept: 1 }, replaceState(state, title, url) { order.push('replaceState'); this.kept = state; address = url; } });
    await import(${JSON.stringify(new URL('shared-study-boot.mjs', root).href)});
    await new Promise((resolve) => setTimeout(resolve, 300));
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
  'page start: a voice link leaves the address before anything else runs, a malformed one too',
  SLOW,
  () => {
    for (const hash of [
      `#voice-connect=${LINK}`,
      '#voice-connect=%7B%22v%22%3A1!!',
      '#voice-connect=',
    ]) {
      const started = bootWithLink(hash);
      assert.deepEqual(started.order.slice(0, 2), ['hash read', 'replaceState'], hash);
      assert.equal(started.address, '/index.html?ui=ja', hash);
      assert.deepEqual(started.state, { kept: 1 });
      assert.equal(
        started.order.some((step) => /^(write|session) |^fetch$/.test(step)),
        false,
        hash,
      );
    }
    const route = bootWithLink('#context');
    assert.equal(route.address, '/index.html?ui=ja#context');
    assert.equal(route.order.includes('replaceState'), false);
  },
);

/** The real voice client over a fetch double and a store double: what was asked, and what was kept. */
function createWorld({ paired = false, kept = null, answer = null } = {}) {
  const installation = `bunki-${'0'.repeat(32)}`;
  const calls = [],
    writes = [];
  let row = paired
    ? {
        server: SERVER,
        token: token(),
        scope: { environment: 'prod', learner: LEARNER, installation },
      }
    : { server: kept, token: null, scope: null };
  const store = {
    durable: true,
    async read() {
      return {
        server: row.server,
        token: row.token,
        scope: row.scope ? { ...row.scope } : null,
        ended: null,
      };
    },
    async write(value) {
      writes.push(JSON.parse(JSON.stringify(value)));
      row = { ...value };
    },
    async clear() {
      row = { server: row.server, token: null, scope: null };
    },
    async end() {
      row = { server: row.server, token: null, scope: null };
    },
  };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const [status, body] = answer || [
      200,
      { token: token(), scope: { environment: 'prod', learner: LEARNER, installation } },
    ];
    return { status, json: async () => body, headers: { get: () => null } };
  };
  return { installation, calls, writes, client: client.createVoiceClient({ fetch, store }) };
}

/** As much of a page as the panel touches: elements that keep what is set on them, a clock that is held. */
function pageDouble() {
  const nodes = [],
    timers = [],
    mounted = [],
    storage = [];
  let reloads = 0;
  const el = (tag, className, text) => {
    const listeners = new Map();
    const node = {
      tag,
      id: '',
      className: className || '',
      textContent: text ?? '',
      hidden: false,
      disabled: false,
      type: '',
      dataset: {},
      attributes: {},
      children: [],
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      append(...kids) {
        this.children.push(...kids);
      },
      addEventListener(type, listener) {
        listeners.set(type, [...(listeners.get(type) || []), listener]);
      },
      async fire(type, event = {}) {
        for (const listener of listeners.get(type) || []) await listener(event);
      },
      focus() {},
    };
    nodes.push(node);
    return node;
  };
  const kept = (name) => ({
    getItem: () => null,
    setItem: (key, value) => void storage.push([name, key, value]),
    removeItem() {},
  });
  const env = {
    location: { search: '' },
    setTimeout: (run, ms) => void timers.push({ run, ms }),
    localStorage: kept('local'),
    sessionStorage: kept('session'),
  };
  const byId = (id) => nodes.find((node) => node.id === id);
  const words = () =>
    nodes
      .flatMap((node) => [
        node.textContent,
        ...Object.values(node.attributes),
        ...Object.values(node.dataset),
      ])
      .join('\n');
  return {
    env,
    el,
    nodes,
    timers,
    storage,
    byId,
    words,
    mounted,
    mount: (panel) => void mounted.push(panel),
    unmount: (panel) => void mounted.splice(mounted.indexOf(panel), 1),
    reload: () => void (reloads += 1),
    reloads: () => reloads,
  };
}
/** The panel, once everything it started has run: a request started without a click has been made by then. */
const offer = async (world, page, text = LINK, known = null) => {
  const panel = await offerVoiceConnect(text, {
    env: page.env,
    client: world.client,
    known: async () => known,
    el: page.el,
    mount: page.mount,
    unmount: page.unmount,
    reload: page.reload,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return panel;
};

test('a voice link asks one question: nothing is sent before Turn on, and one click turns the voice on', async () => {
  const world = createWorld(),
    page = pageDouble();
  const panel = await offer(world, page);
  assert.equal(panel.dataset.state, 'offer');
  assert.deepEqual([world.calls.length, world.writes.length, page.mounted.length], [0, 0, 1]);
  assert.equal(page.byId('voice-link-title').textContent, lines.VOICE_PAIRING.ask[1]);
  assert.equal(
    page.byId('voice-link-server').textContent,
    'Voice server: test.example.workers.dev',
  );
  assert.equal(page.byId('voice-link-yes').hidden, false);
  await page.byId('voice-link-yes').fire('click');
  assert.equal(world.calls.length, 1);
  const [{ url, init }] = world.calls;
  assert.equal(url, `${SERVER}/v1/pair/redeem-speak`);
  assert.deepEqual(JSON.parse(init.body), { code: CODE, environment: 'prod', learner: LEARNER });
  assert.deepEqual(
    [init.method, init.credentials, init.referrerPolicy],
    ['POST', 'omit', 'no-referrer'],
  );
  assert.equal(panel.dataset.state, 'on');
  assert.equal(world.client.paired(), true);
  assert.equal(world.writes.length, 1);
  assert.deepEqual(
    page.timers.map((timer) => timer.ms),
    [1500],
  );
  page.timers[0].run();
  assert.equal(page.reloads(), 1);
  // the code is spent: a second click sends nothing
  await page.byId('voice-link-yes').fire('click');
  assert.equal(world.calls.length, 1);
});

test('Not now keeps nothing and sends nothing', async () => {
  const world = createWorld(),
    page = pageDouble();
  const panel = await offer(world, page);
  await page.byId('voice-link-no').fire('click');
  assert.equal(panel.dataset.state, 'closed');
  assert.deepEqual(
    [page.mounted.length, world.calls.length, world.writes.length, page.storage.length],
    [0, 0, 0, 0],
  );
  await page.byId('voice-link-yes').fire('click');
  assert.deepEqual([world.calls.length, world.writes.length, world.client.paired()], [0, 0, false]);
});

test('a browser whose voice is on already is told so, with Close, and is never paired again', async () => {
  const world = createWorld({ paired: true }),
    page = pageDouble();
  const panel = await offer(world, page);
  assert.equal(panel.dataset.state, 'held');
  assert.equal(page.byId('voice-link-title').textContent, lines.VOICE_PAIRING.held[1]);
  assert.equal(
    page.byId('voice-link-note').textContent,
    lines.voicePairingLine('already-paired')[1],
  );
  assert.deepEqual(
    [page.byId('voice-link-yes').hidden, page.byId('voice-link-no').hidden],
    [true, false],
  );
  assert.equal(page.byId('voice-link-no').textContent, lines.VOICE_PAIRING.close[1]);
  await page.byId('voice-link-yes').fire('click');
  assert.deepEqual(await world.client.pair({ link: LINK }), { ok: false, code: 'already-paired' });
  assert.deepEqual([world.calls.length, world.writes.length], [0, 0]);
});

test("a voice link naming another server than this browser's voice or study server is refused with nothing sent", async () => {
  for (const [world, known] of [
    [createWorld({ kept: OTHER }), null],
    [createWorld(), OTHER],
  ]) {
    const page = pageDouble();
    const panel = await offer(world, page, LINK, known);
    assert.deepEqual([panel.dataset.state, panel.dataset.refused], ['refused', 'server-mismatch']);
    assert.equal(
      page.byId('voice-link-note').textContent,
      lines.voicePairingLine('server-mismatch')[1],
    );
    await page.byId('voice-link-yes').fire('click');
    assert.deepEqual(await world.client.pair({ link: LINK }, { known }), {
      ok: false,
      code: 'server-mismatch',
    });
    assert.deepEqual([world.calls.length, world.writes.length], [0, 0]);
  }
  // the same server as this browser's own is asked as usual
  const same = createWorld({ kept: SERVER });
  assert.deepEqual(await same.client.pair({ link: LINK }, { known: OTHER }), {
    ok: true,
    installation: same.installation,
  });
});

test('the code never reaches storage, a log or the words on the panel', async () => {
  const said = [];
  const saved = {};
  for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[name] = console[name];
    console[name] = (...args) => void said.push(args.map(String).join(' '));
  }
  try {
    for (const english of [true, false]) {
      const world = createWorld(),
        page = pageDouble();
      const panel = await offerVoiceConnect(LINK, {
        env: page.env,
        client: world.client,
        known: async () => null,
        english,
        el: page.el,
        mount: page.mount,
        unmount: page.unmount,
        reload: page.reload,
      });
      await page.byId('voice-link-yes').fire('click');
      assert.equal(panel.dataset.state, 'on');
      for (const seen of [
        page.words(),
        JSON.stringify(world.writes),
        JSON.stringify(page.storage),
        said.join('\n'),
      ]) {
        assert.equal(
          seen.includes(CODE) ||
            seen.toLowerCase().includes(CODE.toLowerCase()) ||
            seen.includes(LINK),
          false,
        );
      }
      assert.deepEqual(page.storage, []);
    }
  } finally {
    Object.assign(console, saved);
  }
  assert.deepEqual(said, []);
});

test("a refused code is said in the voice client's own words and the link is spent", async () => {
  const world = createWorld({ answer: [401, { error: 'authentication-required' }] }),
    page = pageDouble();
  const panel = await offer(world, page);
  await page.byId('voice-link-yes').fire('click');
  assert.deepEqual(
    [panel.dataset.state, panel.dataset.refused],
    ['failed', 'authentication-required'],
  );
  assert.equal(
    page.byId('voice-link-note').textContent,
    lines.voicePairingLine('authentication-required')[1],
  );
  assert.equal(page.byId('voice-link-no').textContent, lines.VOICE_PAIRING.close[1]);
  await page.byId('voice-link-yes').fire('click');
  assert.deepEqual([world.calls.length, world.writes.length, page.reloads()], [1, 0, 0]);
});
