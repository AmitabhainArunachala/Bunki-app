import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import { TextEncoder } from 'node:util';

const source = readFileSync(new URL('../App/HostBridge.js', import.meta.url), 'utf8');
function harness({
  origin = 'http://localhost:43187',
  mainFrame = true,
  reply = async () => ({ status: 'cancelled' }),
} = {}) {
  const window = {},
    calls = [];
  const context = vm.createContext({
    window,
    top: mainFrame ? window : {},
    location: { origin },
    TextEncoder,
    navigator: {},
    addEventListener() {},
    webkit: {
      messageHandlers: {
        kairoIntake: {
          postMessage: async (request) => {
            calls.push(JSON.parse(JSON.stringify(request)));
            return await reply(request);
          },
        },
        kairoFiles: {
          postMessage: async (request) => {
            calls.push(JSON.parse(JSON.stringify(request)));
            return true;
          },
        },
        kairoSync: {
          postMessage: async (request) => ({
            registrationId: request.method === 'register' ? 'owned-registration' : null,
          }),
        },
      },
    },
  });
  vm.runInContext(source, context);
  return { window, calls, run: (expression) => vm.runInContext(expression, context) };
}

test('native bridges exist only in the canonical top-level installation origin', () => {
  for (const options of [
    { origin: 'https://example.org' },
    { origin: 'http://127.0.0.1:43187' },
    { origin: 'http://localhost:43188' },
    { origin: 'https://localhost:43187' },
    { mainFrame: false },
  ]) {
    const { window, calls } = harness(options);
    assert.equal(window.kairoIntake, undefined);
    assert.equal(window.kairoFiles, undefined);
    assert.equal(window.kairoSync, undefined);
    assert.equal(calls.length, 0);
  }
  assert.equal(harness().window.kairoIOSHost.storage, 'webkit-persistent');
});

test('availability requires the native boolean and treats missing or failed handlers as unavailable', async () => {
  for (const value of [false, null, 1, 'true', { status: 'available' }]) {
    assert.equal(
      await harness({ reply: async () => value }).run('window.kairoIntake.available()'),
      false,
    );
  }
  assert.equal(
    await harness({ reply: async () => true }).run('window.kairoIntake.available()'),
    true,
  );
  assert.equal(
    await harness({
      reply: async () => {
        throw new Error('revoked');
      },
    }).run('window.kairoIntake.available()'),
    false,
  );
  const h = harness();
  h.run('delete webkit.messageHandlers.kairoIntake');
  assert.equal(await h.run('window.kairoIntake.available()'), false);
});

test('four fixed methods preserve native responses and exact request fields', async () => {
  const h = harness({
    reply: async (request) =>
      request.method === 'available' ? true : { status: 'native-fixture', method: request.method },
  });
  assert.equal(await h.run('window.kairoIntake.available()'), true);
  assert.equal((await h.run('window.kairoIntake.choose({expected:null})')).method, 'choose');
  assert.equal(
    (await h.run('window.kairoIntake.extract({token:"selection",firstPage:2,lastPage:3})')).method,
    'extract',
  );
  assert.equal(
    (await h.run('window.kairoIntake.openOriginal({file:{sha256:"candidate-only"}})')).method,
    'openOriginal',
  );
  assert.deepEqual(h.calls, [
    { method: 'available' },
    { method: 'choose', expected: null },
    { method: 'extract', token: 'selection', firstPage: 2, lastPage: 3 },
    { method: 'openOriginal', file: { sha256: 'candidate-only' } },
  ]);
  assert.deepEqual(
    Object.keys(h.window.kairoIntake).sort(),
    ['available', 'choose', 'extract', 'openOriginal'].sort(),
  );
});

test('path, method substitution, inherited fields, accessors and symbols cannot widen a request', async () => {
  const h = harness();
  h.run('window.accessorReads=0');
  for (const input of [
    'null',
    '[]',
    '"choose"',
    '{}',
    '{expected:null,path:"/private/source.pdf"}',
    '{expected:null,method:"openOriginal"}',
    'Object.create({expected:null})',
    '{get expected(){window.accessorReads++;return null}}',
    '{expected:null,[Symbol("path")]:"secret"}',
  ]) {
    await assert.rejects(h.run(`window.kairoIntake.choose(${input})`), /invalid-input/u);
  }
  await assert.rejects(
    h.run(
      'window.kairoIntake.extract({token:"x",firstPage:1,lastPage:2,url:"file:///private/source"})',
    ),
    /invalid-input/u,
  );
  await assert.rejects(
    h.run('window.kairoIntake.openOriginal({file:null,expected:null})'),
    /invalid-input/u,
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.run('window.accessorReads'), 0);
});

test('the page cannot replace the fixed bridge with another native operation', () => {
  const h = harness();
  assert.equal(Object.isFrozen(h.window.kairoIntake), true);
  assert.throws(() => h.run('"use strict"; window.kairoIntake = {}'), /read only|readonly|assign/u);
  assert.throws(
    () => h.run('"use strict"; window.kairoIntake.choose = () => {}'),
    /read only|readonly|assign/u,
  );
  assert.equal(Object.getOwnPropertyDescriptor(h.window, 'kairoIntake').configurable, false);
});

test('adding intake preserves export and registration-bound store dispatch', async () => {
  const h = harness();
  assert.equal(
    await h.run(
      'window.kairoFiles.save({filename:"record.json",mimeType:"application/json",text:"{}"})',
    ),
    true,
  );
  await h.run(
    'window.kairoSync.register({binding:{}}, async request => ({ok:true,method:request.method}))',
  );
  assert.equal(
    (await h.run('window.__kairoIOSStoreDispatch("old-registration",{method:"snapshot"})')).ok,
    false,
  );
  assert.equal(
    (await h.run('window.__kairoIOSStoreDispatch("owned-registration",{method:"snapshot"})')).ok,
    true,
  );
  assert.equal(
    (await h.run('window.__kairoIOSStoreDispatch("owned-registration",{method:"arbitrary-read"})'))
      .ok,
    false,
  );
  await h.run('window.kairoSync.unregister({registrationId:"owned-registration"})');
  assert.equal(
    (await h.run('window.__kairoIOSStoreDispatch("owned-registration",{method:"snapshot"})')).ok,
    false,
  );
});
