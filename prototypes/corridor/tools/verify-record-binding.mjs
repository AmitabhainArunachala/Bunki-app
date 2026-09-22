/** Isolated installation-binding fixtures. No operator origin, profile,
 * credential, user record, live migration, or backup import is used. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const sourcePath = fileURLToPath(import.meta.url);
const repository = resolve(dirname(sourcePath), '../../..');
const modulePath = resolve(repository, 'prototypes/corridor/record-binding.mjs');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sources = [sourcePath, modulePath].map((path) => ({
  path,
  sha256: hash(readFileSync(path)),
}));
const out = resolveCorridorEvidence();
const binding = await import(pathToFileURL(modulePath).href);
const {
  LOCAL_RECORD_BINDING_KEY: KEY,
  openLocalRecordBinding: open,
  parseLocalRecordBindingText: parse,
} = binding;
const mode = process.argv.includes('--browser') ? 'browser' : 'controlled-storage';
const results = [];
const observations = {};
const rejects = (run, code) =>
  assert.throws(
    run,
    (error) => error instanceof binding.LocalRecordBindingError && error.code === code,
  );
const clone = (value) => JSON.parse(JSON.stringify(value));
const uuid = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const unownedKeys = {
  'kairo-corridor-v1': '{"v":2,"accountId":"SYNTHETIC-FENCE-IS-NOT-AUTHORITY"}',
  'kairo-ai-key': 'SYNTHETIC-NON-OPERATOR-CREDENTIAL',
  'kairo-ai-provider-v1': '{"credential":"SYNTHETIC-UNRELATED"}',
};
function fixture(initial = null) {
  const values = new Map(Object.entries(unownedKeys));
  if (initial !== null) values.set(KEY, initial);
  const calls = [];
  let generated = 0;
  const state = { held: true, getFault: null, setFault: null, uuidFault: null };
  const storage = Object.freeze({
    getItem(key) {
      assert.equal(key, KEY, 'Only the installation key may be read');
      calls.push({ kind: 'get', key });
      if (state.getFault) return state.getFault(key);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      assert.equal(key, KEY, 'Only the installation key may be written');
      calls.push({ kind: 'set', key, value });
      if (state.setFault) return state.setFault(key, value);
      values.set(key, value);
    },
    get length() {
      throw new Error('Do not enumerate localStorage');
    },
    key() {
      throw new Error('Do not enumerate localStorage');
    },
    clear() {
      throw new Error('Do not clear localStorage');
    },
    removeItem() {
      throw new Error('Do not roll back localStorage');
    },
  });
  const crypto = {
    randomUUID() {
      generated += 1;
      return state.uuidFault ? state.uuidFault(generated) : uuid(generated);
    },
  };
  return {
    values,
    calls,
    state,
    storage,
    crypto,
    generated: () => generated,
    options: { storage, crypto, assertOwner: () => state.held === true },
  };
}
function sample() {
  const f = fixture();
  return open({ ...f.options, allowCreate: true }).text;
}
const ORIGINAL = sample();
function foreignText() {
  const raw = JSON.parse(ORIGINAL);
  raw.binding.accountId = `local-account:${uuid(99)}`;
  return JSON.stringify(raw);
}
async function check(name, run) {
  try {
    const detail = await run();
    results.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function controlled() {
  await check('missing-binding-refuses-implicit-creation-without-reading-fence-or-backup', () => {
    for (const extra of [{}, { allowCreate: false }]) {
      const f = fixture();
      rejects(() => open({ ...f.options, ...extra }), 'binding-missing');
      assert.equal(f.generated(), 0);
      assert.equal(f.calls.filter((call) => call.kind === 'set').length, 0);
      assert.deepEqual(Object.fromEntries(f.values), unownedKeys);
    }
    for (const value of [null, 'true', 1]) {
      const f = fixture();
      rejects(() => open({ ...f.options, allowCreate: value }), 'invalid-options');
      assert.deepEqual(f.calls, []);
    }
  });
  await check('explicit-creation-produces-six-distinct-local-identities-and-closed-policy', () => {
    const f = fixture();
    const value = open({ ...f.options, allowCreate: true });
    assert.equal(value.created, true);
    assert.equal(f.generated(), 6);
    assert.equal(value.text, ORIGINAL);
    assert.equal(f.values.get(KEY), value.text);
    assert.deepEqual(value.policy, {
      binding: value.installation.binding,
      schemaEpoch: 1,
      deletionEpoch: 0,
      mergePolicy: 'kairo-conservative-merge/1',
    });
    assert.equal(value.actor, value.installation.actor);
    assert.equal(value.databaseName, value.installation.databaseName);
    for (const node of [
      value,
      value.installation,
      value.installation.binding,
      value.actor,
      value.policy,
    ])
      assert(Object.isFrozen(node));
    assert.equal(value.assertCurrent(), true);
    assert.equal(f.calls.filter((call) => call.kind === 'set').length, 1);
    for (const [key, text] of Object.entries(unownedKeys)) assert.equal(f.values.get(key), text);
    return { generatedUuidCount: 6, storageKey: KEY, importedAuthority: false };
  });
  await check('reopen-keeps-exact-stored-text-and-all-identities-without-uuid-or-rewrite', () => {
    for (const text of [ORIGINAL, JSON.stringify(JSON.parse(ORIGINAL), null, 2)]) {
      const f = fixture(text);
      f.state.uuidFault = () => {
        throw new Error('A reload must not create identity');
      };
      const first = open({ ...f.options, crypto: undefined });
      const second = open({ ...f.options, allowCreate: true });
      assert.equal(first.created, false);
      assert.equal(first.text, text);
      assert.deepEqual(first.installation, second.installation);
      assert.deepEqual(first.policy, second.policy);
      assert.equal(f.values.get(KEY), text);
      assert.equal(f.generated(), 0);
      assert.equal(f.calls.filter((call) => call.kind === 'set').length, 0);
    }
  });
  await check('invalid-future-foreign-and-unknown-fields-refuse-without-overwriting', () => {
    const changed = (edit) => {
      const value = JSON.parse(ORIGINAL);
      edit(value);
      return JSON.stringify(value);
    };
    const bad = [
      '',
      'null',
      '[]',
      '{}',
      'false',
      '"string"',
      '{',
      'x'.repeat(2049),
      changed((value) => {
        value.v = 2;
      }),
      changed((value) => {
        value.format = 'kairo-backup';
      }),
      changed((value) => {
        value.future = true;
      }),
      changed((value) => {
        value.binding.authenticated = true;
      }),
      changed((value) => {
        value.actor.future = true;
      }),
      changed((value) => {
        value.actor = [];
      }),
      changed((value) => {
        value.binding = null;
      }),
      changed((value) => {
        value.binding.accountId = 'copied-backup-account';
      }),
      changed((value) => {
        value.binding.accountId = `local-account:${uuid(2)}`;
      }),
      changed((value) => {
        value.binding.sessionId = `local-session:${uuid(3).replace('-4000-', '-7000-')}`;
      }),
      changed((value) => {
        value.databaseName = 'kairo-ai-log';
      }),
      changed((value) => {
        delete value.databaseName;
      }),
      changed((value) => {
        value.databaseName = `kairo-local-record:${uuid(9).toUpperCase().replace('9', 'A')}`;
      }),
    ];
    for (const text of bad) {
      const f = fixture(text);
      assert.throws(
        () => open({ ...f.options, allowCreate: true }),
        binding.LocalRecordBindingError,
      );
      assert.equal(f.values.get(KEY), text);
      assert.equal(f.generated(), 0);
      assert.equal(f.calls.filter((call) => call.kind === 'set').length, 0);
    }
    return { refusedFixtures: bad.length };
  });
  await check('backup-fence-unknown-and-inherited-options-cannot-supply-creation-authority', () => {
    const f = fixture();
    for (const field of ['backup', 'fence', 'binding', 'policy', 'accountId'])
      rejects(
        () => open({ ...f.options, allowCreate: true, [field]: JSON.parse(ORIGINAL) }),
        'invalid-options',
      );
    rejects(() => open(Object.create({ ...f.options, allowCreate: true })), 'invalid-options');
    const accessor = { ...f.options };
    Object.defineProperty(accessor, 'allowCreate', {
      enumerable: true,
      get() {
        throw new Error('Do not invoke an option accessor');
      },
    });
    rejects(() => open(accessor), 'invalid-options');
    assert.deepEqual(f.calls, []);
    assert.equal(f.generated(), 0);
  });
  await check('missing-broken-non-v4-or-repeated-secure-random-refuses-before-write', () => {
    for (const random of [
      undefined,
      {},
      {
        randomUUID: () => {
          throw new Error('Synthetic crypto unavailable');
        },
      },
      { randomUUID: () => 'Math.random-fallback' },
      { randomUUID: () => uuid(1).replace('-4000-', '-7000-') },
    ]) {
      const f = fixture();
      rejects(
        () => open({ ...f.options, crypto: random, allowCreate: true }),
        'secure-random-unavailable',
      );
      assert.equal(f.values.has(KEY), false);
      assert.equal(f.calls.filter((call) => call.kind === 'set').length, 0);
    }
    const f = fixture();
    rejects(
      () => open({ ...f.options, crypto: { randomUUID: () => uuid(1) }, allowCreate: true }),
      'invalid-binding',
    );
    assert.equal(f.values.has(KEY), false);
  });
  await check('absent-throwing-or-async-owner-refuses-before-any-storage-read', () => {
    for (const assertOwner of [
      () => false,
      () => {
        throw new Error('Lost lock');
      },
      () => Promise.resolve(true),
    ]) {
      const f = fixture();
      rejects(() => open({ ...f.options, assertOwner, allowCreate: true }), 'owner-required');
      assert.deepEqual(f.calls, []);
      assert.equal(f.generated(), 0);
    }
  });
  await check('owner-loss-during-read-or-uuid-generation-cannot-create', () => {
    const onRead = fixture();
    onRead.state.getFault = () => {
      onRead.state.held = false;
      return null;
    };
    rejects(() => open({ ...onRead.options, allowCreate: true }), 'owner-required');
    assert.equal(onRead.generated(), 0);
    const onRandom = fixture();
    onRandom.state.uuidFault = (n) => {
      onRandom.state.held = false;
      return uuid(n);
    };
    rejects(() => open({ ...onRandom.options, allowCreate: true }), 'owner-required');
    for (const f of [onRead, onRandom]) assert.equal(f.values.has(KEY), false);
  });
  await check('competing-creation-is-refused-without-adopting-or-replacing-its-bytes', () => {
    const f = fixture();
    const other = foreignText();
    f.state.uuidFault = (n) => {
      if (n === 6) f.values.set(KEY, other);
      return uuid(n);
    };
    rejects(() => open({ ...f.options, allowCreate: true }), 'binding-changed');
    assert.equal(f.values.get(KEY), other);
    assert.equal(f.calls.filter((call) => call.kind === 'set').length, 0);
  });
  await check('quota-and-after-write-throw-never-publish-or-pretend-to-roll-back', () => {
    for (const afterWrite of [false, true]) {
      const f = fixture();
      f.state.setFault = (key, text) => {
        if (afterWrite) f.values.set(key, text);
        throw new Error('Synthetic quota or uncertain write');
      };
      let published = false;
      rejects(() => {
        open({ ...f.options, allowCreate: true });
        published = true;
      }, 'binding-write-failed');
      assert.equal(published, false);
      assert.equal(f.values.has(KEY), afterWrite);
      assert.equal(f.calls.filter((call) => call.kind === 'set').length, 1);
      if (afterWrite) {
        f.state.setFault = null;
        const existing = open({ ...f.options, crypto: undefined });
        assert.equal(existing.created, false);
        assert.equal(existing.text, ORIGINAL);
        assert.equal(f.calls.filter((call) => call.kind === 'set').length, 1);
      }
    }
  });
  await check(
    'owner-loss-or-foreign-bytes-after-write-preserve-disk-but-refuse-publication',
    () => {
      for (const loss of ['owner', 'bytes']) {
        const f = fixture();
        f.state.setFault = (key, text) => {
          f.values.set(key, loss === 'bytes' ? foreignText() : text);
          if (loss === 'owner') f.state.held = false;
        };
        rejects(
          () => open({ ...f.options, allowCreate: true }),
          loss === 'owner' ? 'owner-required' : 'binding-changed',
        );
        assert.equal(f.values.get(KEY), loss === 'bytes' ? foreignText() : ORIGINAL);
        assert.equal(f.calls.filter((call) => call.kind === 'set').length, 1);
      }
    },
  );
  await check('second-read-rejects-even-whitespace-only-replacement', () => {
    const f = fixture(ORIGINAL);
    let reads = 0;
    const changed = JSON.stringify(JSON.parse(ORIGINAL), null, 2);
    f.state.getFault = () => {
      reads += 1;
      if (reads === 2) f.values.set(KEY, changed);
      return f.values.get(KEY);
    };
    rejects(() => open(f.options), 'binding-changed');
    assert.equal(f.values.get(KEY), changed);
    assert.equal(f.calls.filter((call) => call.kind === 'set').length, 0);
  });
  await check(
    'read-failures-or-invalid-storage-values-do-not-fabricate-an-empty-installation',
    () => {
      for (const value of [undefined, false, 7, {}]) {
        const f = fixture();
        f.state.getFault = () => value;
        rejects(() => open({ ...f.options, allowCreate: true }), 'invalid-binding');
        assert.equal(f.generated(), 0);
        assert.equal(f.values.has(KEY), false);
      }
      for (const afterWrite of [false, true]) {
        const f = fixture();
        f.state.getFault = () => {
          if (!afterWrite || f.values.has(KEY)) throw new Error('Synthetic storage read failure');
          return null;
        };
        rejects(() => open({ ...f.options, allowCreate: true }), 'binding-storage-unavailable');
        assert.equal(f.values.has(KEY), afterWrite);
      }
    },
  );
  await check('guard-after-async-work-refuses-changed-storage-or-released-owner', async () => {
    for (const change of ['bytes', 'owner', 'missing']) {
      const f = fixture(ORIGINAL);
      const value = open(f.options);
      await Promise.resolve();
      if (change === 'bytes') f.values.set(KEY, foreignText());
      else if (change === 'missing') f.values.delete(KEY);
      else f.state.held = false;
      const readsBefore = f.calls.length;
      let published = false;
      rejects(
        () => {
          value.assertCurrent();
          published = true;
        },
        change === 'owner' ? 'owner-required' : 'binding-changed',
      );
      assert.equal(published, false);
      assert.equal(value.text, ORIGINAL);
      if (change === 'owner') assert.equal(f.calls.length, readsBefore);
    }
  });
}

async function browser() {
  const { chromium, webkit } = await import('playwright-core');
  const engine = process.env.KAIRO_BROWSER || 'chromium';
  assert(['chromium', 'webkit'].includes(engine));
  assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an exact staged KAIRO_SITE_DIR');
  const site = realpathSync(process.env.KAIRO_SITE_DIR);
  const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
  assert.match(process.env.KAIRO_BINDING_SITE_SHA256 || '', /^[a-f0-9]{64}$/u);
  assert.equal(manifest.artifactSha256, process.env.KAIRO_BINDING_SITE_SHA256);
  assert.equal(hash(JSON.stringify(manifest.files)), manifest.artifactSha256);
  const staged = (name) => {
    const bytes = readFileSync(resolve(site, name));
    assert.deepEqual(
      manifest.files.find((file) => file.path === name),
      { path: name, bytes: bytes.length, sha256: hash(bytes) },
    );
    return bytes;
  };
  const module = staged('record-binding.mjs');
  assert.equal(
    hash(module),
    sources.find((source) => source.path === modulePath).sha256,
    'Browser must use the exact owned module',
  );
  const core = staged('modules/record-core.mjs');
  observations.artifact = {
    path: site,
    sha256: manifest.artifactSha256,
    verifiedEntries: ['record-binding.mjs', 'modules/record-core.mjs'].map((name) =>
      manifest.files.find((file) => file.path === name),
    ),
  };
  const html =
    '<!doctype html><meta charset="utf-8"><title>Synthetic local binding fixture</title><script type="module">import * as binding from "/record-binding.mjs";import * as core from "/modules/record-core.mjs";window.fixture={binding,core};</script>';
  const server = createServer((request, response) => {
    response.setHeader('cache-control', 'no-store');
    if (request.url === '/record-binding.mjs') {
      response.setHeader('content-type', 'text/javascript');
      response.end(module);
    } else if (request.url === '/modules/record-core.mjs') {
      response.setHeader('content-type', 'text/javascript');
      response.end(core);
    } else if (request.url === '/fixture') {
      response.setHeader('content-type', 'text/html');
      response.end(html);
    } else response.writeHead(404).end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const instance = await { chromium, webkit }[engine].launch(
    engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {},
  );
  observations.runtime = {
    engine,
    version: instance.version(),
    originKind: 'isolated loopback secure context',
    playwright: JSON.parse(
      readFileSync(resolve(repository, 'node_modules/playwright-core/package.json')),
    ).version,
  };
  async function pageFor(context) {
    const page = await context.newPage();
    await page.goto(`${origin}/fixture`);
    await page.waitForFunction(() => !!window.fixture);
    return page;
  }
  async function claim(page) {
    return page.evaluate(async () => {
      const f = window.fixture;
      f.held = false;
      return new Promise((done, fail) => {
        navigator.locks
          .request(
            'kairo-record:kairo-corridor-v1:kairo-ai-log',
            { mode: 'exclusive', ifAvailable: true },
            async (lock) => {
              if (!lock) {
                done(false);
                return;
              }
              f.held = true;
              let finish;
              const lifetime = new Promise((resolve) => {
                finish = resolve;
              });
              f.release = () => {
                f.held = false;
                finish();
              };
              window.addEventListener('pagehide', f.release, { once: true });
              done(true);
              await lifetime;
            },
          )
          .catch(fail);
      });
    });
  }
  async function install(page, allowCreate = false) {
    return page.evaluate((allowCreate) => {
      const f = window.fixture;
      f.calls = [];
      f.handle = f.binding.openLocalRecordBinding({
        allowCreate,
        crypto,
        assertOwner: () => f.held,
        storage: {
          getItem(key) {
            f.calls.push({ kind: 'get', key });
            return localStorage.getItem(key);
          },
          setItem(key, text) {
            f.calls.push({ kind: 'set', key });
            localStorage.setItem(key, text);
          },
        },
      });
      return {
        created: f.handle.created,
        text: f.handle.text,
        installation: f.handle.installation,
        policy: f.handle.policy,
        actor: f.handle.actor,
        databaseName: f.handle.databaseName,
        calls: f.calls,
      };
    }, allowCreate);
  }
  async function browserCheck(name, run) {
    await check(name, async () => {
      const context = await instance.newContext({ serviceWorkers: 'block' });
      const errors = [];
      context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
      try {
        const detail = await run(context);
        assert.deepEqual(errors, [], 'No pageerror is filtered');
        return detail;
      } finally {
        await context.close();
      }
    });
  }
  try {
    await browserCheck(
      'real-web-lock-and-localstorage-reload-keep-identities-and-open-compatible-idb',
      async (context) => {
        const page = await pageFor(context);
        await page.evaluate((values) => {
          for (const [key, text] of Object.entries(values)) localStorage.setItem(key, text);
        }, unownedKeys);
        assert.equal(await claim(page), true);
        const before = await install(page, true);
        assert.equal(before.created, true);
        parse(before.text);
        assert(before.calls.every((call) => call.key === KEY));
        await page.reload();
        await page.waitForFunction(() => !!window.fixture);
        assert.equal(await claim(page), true);
        const after = await install(page);
        assert.equal(after.created, false);
        assert.equal(after.text, before.text);
        assert.deepEqual(after.installation, before.installation);
        assert.deepEqual(after.policy, before.policy);
        assert(after.calls.every((call) => call.key === KEY && call.kind === 'get'));
        const checked = await page.evaluate(async (keys) => {
          const f = window.fixture;
          const store = await f.core.IndexedDbReplicationStore.open({
            policy: f.handle.policy,
            actor: f.handle.actor,
            databaseName: f.handle.databaseName,
          });
          const snapshot = await store.snapshot();
          await store.close();
          f.handle.assertCurrent();
          return {
            policy: snapshot.policy,
            actor: {
              deviceId: snapshot.actor.deviceId,
              incarnationId: snapshot.actor.incarnationId,
            },
            unrelated: Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
          };
        }, Object.keys(unownedKeys));
        assert.deepEqual(checked.policy, before.policy);
        assert.deepEqual(checked.actor, before.actor);
        assert.deepEqual(checked.unrelated, unownedKeys);
        return {
          stableTextSha256: hash(before.text),
          createdOnce: true,
          compatibleIndexedDbPolicy: checked.policy,
          keysReadOrWrittenByBinding: [KEY],
        };
      },
    );
    await browserCheck(
      'second-tab-without-held-lock-cannot-read-or-create-and-then-reopens-same-binding',
      async (context) => {
        const first = await pageFor(context);
        assert.equal(await claim(first), true);
        const original = await install(first, true);
        const second = await pageFor(context);
        assert.equal(await claim(second), false);
        const refused = await second.evaluate(() => {
          const f = window.fixture;
          let reads = 0;
          try {
            f.binding.openLocalRecordBinding({
              storage: {
                getItem() {
                  reads += 1;
                  return null;
                },
                setItem() {
                  throw new Error('Do not write');
                },
              },
              crypto,
              assertOwner: () => f.held,
              allowCreate: true,
            });
          } catch (error) {
            return { code: error.code, reads };
          }
          throw new Error('Missing Web Lock must refuse');
        });
        assert.deepEqual(refused, { code: 'owner-required', reads: 0 });
        await first.evaluate(() => window.fixture.release());
        assert.equal(await claim(second), true);
        const reopened = await install(second);
        assert.equal(reopened.text, original.text);
        assert.equal(reopened.created, false);
        return { concurrentReadPrevented: true, sameInstallationAfterTransfer: true };
      },
    );
    await browserCheck(
      'lock-release-after-async-work-blocks-final-publication-with-bytes-retained',
      async (context) => {
        const page = await pageFor(context);
        assert.equal(await claim(page), true);
        const original = await install(page, true);
        const refusal = await page.evaluate(async () => {
          const f = window.fixture;
          await Promise.resolve();
          f.release();
          try {
            f.handle.assertCurrent();
          } catch (error) {
            return {
              published: false,
              code: error.code,
              text: localStorage.getItem(f.binding.LOCAL_RECORD_BINDING_KEY),
            };
          }
          return { published: true };
        });
        assert.equal(refusal.published, false);
        assert.equal(refusal.code, 'owner-required');
        assert.equal(refusal.text, original.text);
        return { published: false, bytesRetained: true };
      },
    );
    await browserCheck(
      'uncooperative-tab-replacement-is-detected-before-publish-without-localstorage-cas-claim',
      async (context) => {
        const first = await pageFor(context);
        assert.equal(await claim(first), true);
        const original = await install(first, true);
        const other = clone(original.installation);
        other.binding.accountId = `local-account:${uuid(99)}`;
        const replacement = JSON.stringify(other);
        parse(replacement);
        const second = await pageFor(context);
        await second.evaluate(({ key, text }) => localStorage.setItem(key, text), {
          key: KEY,
          text: replacement,
        });
        const refusal = await first.evaluate(async () => {
          const f = window.fixture;
          await Promise.resolve();
          try {
            f.handle.assertCurrent();
          } catch (error) {
            return {
              published: false,
              code: error.code,
              text: localStorage.getItem(f.binding.LOCAL_RECORD_BINDING_KEY),
              originalText: f.handle.text,
            };
          }
          return { published: true };
        });
        assert.equal(refusal.published, false);
        assert.equal(refusal.code, 'binding-changed');
        assert.equal(refusal.text, replacement);
        assert.equal(refusal.originalText, original.text);
        return {
          observedReplacementRefused: true,
          replacementBytesRetained: true,
          compareAndSwap: false,
        };
      },
    );
  } finally {
    await instance.close();
    await new Promise((done) => server.close(done));
  }
}

try {
  if (mode === 'browser') await browser();
  else await controlled();
} finally {
  for (const source of sources)
    assert.equal(
      hash(readFileSync(source.path)),
      source.sha256,
      'Owned sources stayed fixed during the run',
    );
  writeFileSync(
    resolve(out, 'receipt.json'),
    JSON.stringify(
      {
        format: 'kairo-local-record-binding-verification',
        v: 1,
        mode,
        sources,
        runtime: { node: process.version },
        results,
        observations,
        passed: results.filter((result) => result.pass).length,
        failed: results.filter((result) => !result.pass).length,
        limitations: [
          'Installation identifiers are not authentication or backup import authority',
          'Host must continuously hold its cooperative Web Lock and call assertCurrent after async work before publication',
          'Observed byte equality is not localStorage compare-and-swap or protection against a later uncooperative write',
          'Browser mode verifies only the two stated staged modules in an isolated fixture, not full Corridor boot integration',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  if (!results.length || results.some((result) => !result.pass)) process.exitCode = 1;
}
