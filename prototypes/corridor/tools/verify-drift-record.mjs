/** Hosted Drift gestures against an immutable runtime and an isolated bridge.
 * The fixture bridge uses real IndexedDB, but does not claim to exercise the
 * Corridor host reducer, migration, origin lock, or operator record. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { verifyBundledArtifact } from '../../bunki-desktop/lib/artifact.cjs';

const EVIDENCE = resolveCorridorEvidence();
const expectedArtifact = process.env.KAIRO_ARTIFACT_SHA256;
let SITE;
if (expectedArtifact === undefined) SITE = resolveCorridorSite();
else {
  assert(/^[0-9a-f]{64}$/u.test(expectedArtifact), 'Explicit immutable artifact digest must be SHA256');
  assert(process.env.KAIRO_SITE_DIR && isAbsolute(process.env.KAIRO_SITE_DIR), 'Explicit artifact verification needs an absolute staged site');
  SITE = resolve(process.env.KAIRO_SITE_DIR);
  assert.equal(verifyBundledArtifact(SITE).artifactSha256, expectedArtifact);
}
const ENGINES = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(ENGINES.every((name) => ['chromium', 'webkit'].includes(name)));
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const names = ['drift-layer.js', 'drift-layer.css', 'record-controller.mjs', 'modules/record-core.mjs'];
const assets = new Map(names.map((name) => [name, readFileSync(resolve(SITE, name))]));
for (const [name, bytes] of assets) assert.equal(manifest.files.find((file) => file.path === name)?.sha256, sha(bytes));
const script = assets.get('drift-layer.js').toString();
const seedText = script.slice(script.indexOf('const W=[') + 'const W='.length, script.indexOf('];', script.indexOf('const W=[')) + 1);
const particleWords = JSON.parse(seedText).filter((entry) => entry[4]).map((entry) => entry[0]);

function installFixture() {
  const f = window.fixture = { calls: [], cueCalls: [], cueFaults: 0, reads: 0, owner: true, mode: 'hold', cueMode: 'hold', depth: 0, depthLog: [], legacyCalls: [] };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const key = 'bunki-drift-v1';
  f.legacyText = '{"known":{"LEGACY-NOT-ACTIVE":99},"unknown":{},"lk":999,"lu":999,"synthetic":"untouched"}';
  const originalGet = Storage.prototype.getItem;
  const originalSet = Storage.prototype.setItem;
  originalSet.call(localStorage, key, f.legacyText);
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (...args) {
      if (this === localStorage && args[0] === key) {
        f.legacyCalls.push({ method, key: args[0] });
        throw new Error('The hosted layer touched legacy Drift storage');
      }
      return original.apply(this, args);
    };
  }
  f.legacyUnchanged = () => originalGet.call(localStorage, key) === f.legacyText;
  f.scopeId = 'synthetic-drift-installation-and-session';
  const initial = {
    status: 'active', scopeId: f.scopeId, revision: 1,
    driftState: { format: 'kairo-drift-state', version: 1, store: {
      known: { 'synthetic-known': 2 }, unknown: { 'synthetic-unknown': 1 }, lk: 7, lu: 5,
      cue: new URL(location.href).searchParams.get('cue') === '0' ? 0 : 1,
      future: { exact: '日本🧪', array: [null, 7, true] },
    } }, observations: [], judgments: {},
  };
  f.ready = new Promise((done, fail) => {
    const request = indexedDB.open('synthetic-drift-host', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('record');
      request.result.createObjectStore('cue-commands');
    };
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      f.db = request.result;
      const tx = f.db.transaction('record', 'readwrite');
      const store = tx.objectStore('record');
      const get = store.get('current');
      get.onsuccess = () => { if (!get.result) store.put(initial, 'current'); };
      tx.oncomplete = done;
      tx.onabort = () => fail(tx.error);
    };
  });
  f.snapshot = async () => {
    await f.ready;
    return new Promise((done, fail) => {
      const tx = f.db.transaction('record');
      const request = tx.objectStore('record').get('current');
      let value;
      request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => done(value);
      tx.onabort = () => fail(tx.error);
    });
  };
  f.bridge = {
    version: 1,
    isCurrent: (scopeId) => f.owner && scopeId === f.scopeId,
    async read() {
      f.reads++;
      if (f.readFailure) return { status: 'recovery-required' };
      const view = await f.snapshot();
      if (f.holdRead) {
        f.holdRead = false;
        await new Promise((done) => { f.releaseRead = done; });
      }
      return view;
    },
    async retireCue(intent) {
      f.cueCalls.push(clone(intent));
      let mode = f.cueMode;
      if (mode === 'hold') mode = await new Promise((done) => { f.releaseCue = done; });
      if (mode === 'non-active') return { status: 'recovery-required' };
      await f.ready;
      const result = await new Promise((done, fail) => {
        const tx = f.db.transaction(['record', 'cue-commands'], 'readwrite');
        const store = tx.objectStore('record');
        const commands = tx.objectStore('cue-commands');
        const request = store.get('current');
        let view, fault, duplicate = false;
        request.onsuccess = () => {
          view = request.result;
          const prior = commands.get(intent.changeId);
          prior.onsuccess = () => {
            duplicate = !!prior.result;
            if (duplicate && JSON.stringify(prior.result) !== JSON.stringify(intent)) {
              fault = new Error('Conflicting cue gesture identity'); tx.abort(); return;
            }
            if (!duplicate) {
              view.driftState.store.cue = 1;
              view.revision++;
              store.put(view, 'current');
              commands.put(clone(intent), intent.changeId);
            }
            if (mode === 'quota') {
              f.cueFaults++;
              fault = new DOMException('Synthetic quota after queued native puts', 'QuotaExceededError');
              tx.abort();
            }
          };
        };
        tx.oncomplete = () => done({ ...view, receipt: { changeId: intent.changeId, outcome: duplicate ? 'duplicate' : 'committed' } });
        tx.onabort = () => fail(fault || tx.error || new Error('Synthetic cue transaction abort'));
      });
      if (mode === 'commit-non-active') result.status = 'recovery-required';
      if (mode === 'wrong-id') result.receipt.changeId = crypto.randomUUID();
      if (mode === 'wrong-scope') result.scopeId = 'other-synthetic-installation-and-session';
      if (mode === 'unretired-state') result.driftState.store.cue = 0;
      if (mode === 'revoked-owner') f.owner = false;
      return result;
    },
    async commit(intent) {
      f.calls.push(clone(intent));
      let mode = f.mode;
      if (mode === 'hold') mode = await new Promise((done) => { f.release = done; });
      if (mode === 'throw') throw new Error('Synthetic unavailable writer');
      if (mode === 'non-active') return { status: 'recovery-required', receipt: { changeId: intent.changeId, outcome: 'committed' } };
      await f.ready;
      const result = await new Promise((done, fail) => {
        const tx = f.db.transaction('record', 'readwrite');
        const store = tx.objectStore('record');
        const request = store.get('current');
        let view;
        let duplicate = false;
        request.onsuccess = () => {
          view = request.result;
          duplicate = !!view.judgments[intent.changeId];
          if (!duplicate) {
            const drift = view.driftState.store;
            if (intent.direction > 0) {
              drift.known[intent.key] = (drift.known[intent.key] || 0) + 1;
              if (drift.unknown[intent.key]) delete drift.unknown[intent.key];
              drift.lk++;
            } else {
              drift.unknown[intent.key] = (drift.unknown[intent.key] || 0) + 1;
              if (drift.known[intent.key]) delete drift.known[intent.key];
              drift.lu++;
            }
            view.judgments[intent.changeId] = clone(intent);
            view.observations.push({ kind: intent.kind, key: intent.key, direction: intent.direction });
            view.revision++;
            store.put(view, 'current');
          }
          if (mode === 'abort') tx.abort();
        };
        tx.oncomplete = () => done({ ...view, receipt: { changeId: intent.changeId, outcome: duplicate ? 'duplicate' : 'committed' } });
        tx.onabort = () => fail(tx.error || new Error('Synthetic transaction abort'));
      });
      if (mode === 'commit-non-active') result.status = 'recovery-required';
      if (mode === 'wrong-id') result.receipt.changeId = crypto.randomUUID();
      if (mode === 'wrong-scope') result.scopeId = 'other-synthetic-installation-and-session';
      if (mode === 'stale-revision') result.revision = 0;
      if (mode === 'conflicting-revision') result.revision = 1;
      if (mode === 'invalid-state') result.driftState.version = 99;
      if (mode === 'revoked-owner') f.owner = false;
      return result;
    },
  };
  window.bunkiDriftChrome = '#fixture-nav';
  window.bunkiDriftDepth = (depth) => { f.depth = depth; f.depthLog.push(depth); };
  f.install = () => window.__DRIFT__.setRecordBridge(f.bridge);
}

const html = `<!doctype html><meta charset="utf-8"><title>Synthetic hosted Drift gesture fixture</title>
<link rel="stylesheet" href="/drift-layer.css">
<style>body{margin:0}#fixture-nav{position:fixed;z-index:30;top:0;left:0;background:white}#fixture-nav button{min-height:44px}</style>
<nav id="fixture-nav"><button id="leave">Leave Drift</button><button id="return">Return to Drift</button><button id="back">Surface one level</button></nav>
<script>(${installFixture})();</script><script src="/drift-layer.js"></script>
<script>
document.getElementById('leave').onclick=()=>window.__DRIFT__.hide();
document.getElementById('return').onclick=()=>window.__DRIFT__.show();
document.getElementById('back').onclick=()=>window.bunkiDriftSurface();
window.__DRIFT__.show();
</script>`;
const server = createServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  if (request.url?.split('?')[0] === '/fixture') {
    response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html); return;
  }
  const name = request.url?.slice(1);
  const bytes = assets.get(name);
  if (!bytes) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', name.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(bytes);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const errors = [];
let targetSequence = 0;

async function boot(page, { install = true, cue = 1 } = {}) {
  await page.goto(`${origin}/fixture?cue=${cue}`);
  await page.waitForFunction(() => window.__DRIFT__ && document.querySelector('#drift-layer .word'));
  await page.evaluate(() => window.fixture.ready);
  if (install) {
    assert.equal((await page.evaluate(() => window.fixture.install())).status, 'active');
    await page.waitForFunction(() => document.getElementById('drift-layer').dataset.recordState === 'active');
  }
  await page.waitForTimeout(1300);
}
async function snapshot(page) { return page.evaluate(() => window.fixture.snapshot()); }
async function ui(page, target) {
  return page.evaluate((target) => {
    const el = target ? document.querySelector(`[data-drift-probe="${target}"]`) : null;
    return {
      state: document.getElementById('drift-layer').dataset.recordState,
      tray: document.getElementById('drift-tray').textContent,
      hint: document.getElementById('hint').textContent,
      calls: window.fixture.calls, depth: window.fixture.depth,
      cueCalls: window.fixture.cueCalls,
      cuePending: document.getElementById('drift-layer').dataset.recordCuePending ?? null,
      firstCue: document.getElementById('hint').classList.contains('first-cue'),
      node: el ? { exists: el.isConnected, pending: el.getAttribute('aria-busy'), pointerEvents: el.style.pointerEvents, transition: el.style.transition, opacity: el.style.opacity } : null,
    };
  }, target);
}
async function pick(page, selector = '.word', allowed = null, required = true) {
  const id = String(++targetSequence);
  const found = await page.evaluate(({ id, selector, allowed }) => {
    const candidates = [...document.querySelectorAll(`#drift-layer ${selector}`)].map((el) => {
      const box = el.getBoundingClientRect();
      const label = el.querySelector('.base,.g,.pch')?.textContent;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const hit = document.elementFromPoint(x, y)?.closest('.word,.glyph,.part');
      return { el, label, x, y, hit, opacity: Number(el.style.opacity) };
    }).filter((c) => c.hit === c.el && c.el.style.pointerEvents !== 'none' && c.opacity > (allowed ? 0.05 : 0.3) && c.x > 110 && c.x < innerWidth - 110 && c.y > 150 && c.y < innerHeight - 190 && (!allowed || allowed.includes(c.label)));
    candidates.sort((a, b) => b.opacity - a.opacity);
    const chosen = candidates[0];
    if (!chosen) return null;
    chosen.el.dataset.driftProbe = id;
    return { id, label: chosen.label, x: chosen.x, y: chosen.y };
  }, { id, selector, allowed });
  if (required) assert(found, `A visible, hit-tested ${selector} must be reachable`);
  return found;
}
async function aim(page, target) {
  const value = await page.evaluate((id) => {
    const el = document.querySelector(`[data-drift-probe="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { x, y, hit: document.elementFromPoint(x, y)?.closest('.word,.glyph,.part') === el };
  }, target.id);
  assert(value?.hit, `The browser must hit the selected word ${target.label}`);
  return value;
}
async function flick(page, target, dir = 1) {
  const at = await aim(page, target);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + dir * 65, at.y, { steps: 1 });
  await page.mouse.move(at.x + dir * 105, at.y, { steps: 1 });
  await page.mouse.up();
}
async function tap(page, target) {
  const at = await aim(page, target);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1000);
}
async function pending(page, target) {
  await page.waitForFunction((id) => document.querySelector(`[data-drift-probe="${id}"]`)?.getAttribute('aria-busy') === 'true', target.id);
}
async function release(page, mode) {
  await page.evaluate((mode) => window.fixture.release(mode), mode);
  await page.waitForFunction(() => !document.querySelector('#drift-layer [aria-busy="true"]'));
}
async function releaseCue(page, mode) {
  await page.evaluate((mode) => window.fixture.releaseCue(mode), mode);
  await page.waitForFunction(() => !document.getElementById('drift-layer').dataset.recordCuePending);
}
function onlyCueCommitted(before, after) {
  const expected = structuredClone(before);
  expected.driftState.store.cue = 1;
  expected.revision++;
  assert.deepEqual(after, expected, 'A cue command changes only the cue and storage revision');
}
function present(value) {
  assert(value.node?.exists, 'The encountered node stays in the DOM');
  assert.notEqual(value.node.pointerEvents, 'none', 'An unconfirmed word remains interactive');
  assert(!value.node.transition.includes('0.95s'), 'An unconfirmed word does not start its departure');
}

const cases = [
  ['held-ring-edge-satellites-remain-hit-owned', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      let state = 1729;
      Math.random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
    });
    await boot(page);
    const before = await snapshot(page);
    // The existing fixture entry brings the exact failing lexical subject
    // into view. All release, placement, and bloom actions use real pointers.
    assert.equal(await page.evaluate(() => window.__lockWord('順')), true);
    await page.waitForTimeout(1500);
    const water = await page.evaluate(() => {
      const bodies = [...document.querySelectorAll('#drift-layer .word.bctr, #drift-layer .word.bsat, #drift-layer .glyph')].map((el) => {
        const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      for (let y = 170; y < innerHeight - 170; y += 20) for (let x = 60; x < innerWidth - 50; x += 20) {
        if (document.elementFromPoint(x, y)?.closest('.word,.glyph,.part,#lvl,#theme,#fixture-nav')) continue;
        if (bodies.some((body) => Math.hypot(body.x - x, body.y - y) < 60)) continue;
        return { x, y };
      }
      return null;
    });
    assert(water, 'The staged lock needs a real open-water release');
    await page.mouse.click(water.x, water.y);
    await page.waitForFunction(() => !document.querySelector('#drift-layer .bctr'));
    const word = await pick(page, '.word', ['順']);
    const panFrom = await page.evaluate(() => {
      for (let y = 180; y <= 440; y += 20) for (let x = 180; x <= 320; x += 20) {
        if (!document.elementFromPoint(x, y)?.closest('.word,.glyph,.part,#lvl,#theme,#fixture-nav')) return { x, y };
      }
      return null;
    });
    assert(panFrom, 'The fixed edge fixture needs a real open-water camera pan');
    const pan = [];
    let pointerX = panFrom.x, pointerY = panFrom.y;
    await page.mouse.move(pointerX, pointerY); await page.mouse.down();
    for (let step = 0; step < 40; step++) {
      const r = await page.locator(`[data-drift-probe="${word.id}"]`).boundingBox();
      assert(r, 'The encountered subject must survive the camera pan');
      const dx = 108 - (r.x + r.width / 2), dy = 560 - (r.y + r.height / 2);
      if (Math.hypot(dx, dy) < 1.5) break;
      pointerX += Math.max(-15, Math.min(15, dx * 0.45));
      pointerY += Math.max(-15, Math.min(15, dy * 0.45));
      pan.push({ x: pointerX, y: pointerY });
      await page.mouse.move(pointerX, pointerY);
      await page.waitForTimeout(20);
      // An event at the parked finger ends momentum before the next sample.
      await page.mouse.move(pointerX, pointerY);
      await page.waitForTimeout(90);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
    await tap(page, word);
    await page.waitForTimeout(1600);
    const edge = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height }; };
      const center = document.querySelector('#drift-layer .word.bctr');
      return { center: center && { word: center.querySelector('.base').textContent, ...box(center) },
        satellites: [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
          const r = box(el), hit = document.elementFromPoint(r.x, r.y);
          return { word: el.querySelector('.base').textContent, ...r, owned: !!hit && el.contains(hit), under: hit?.closest('.word')?.querySelector('.base')?.textContent };
        }) };
    });
    assert.equal(edge.center?.word, '順');
    assert(Math.hypot(edge.center.x - 108, edge.center.y - 560) < 4, 'The real pan must reproduce the recorded edge anchor');
    assert.equal(edge.satellites.length, 14, 'The fix may not discard a member to make the ring fit');
    assert.deepEqual(await snapshot(page), before, 'Moving and blooming the ring must never change the record');
    assert(edge.satellites.every((satellite) => satellite.owned && satellite.x >= 0 && satellite.x < 390 && satellite.y >= 0 && satellite.y < 844), JSON.stringify(edge));
    assert(edge.satellites.every((satellite) => satellite.x - satellite.width / 2 >= 44 && satellite.x + satellite.width / 2 <= 390), 'Every complete satellite body must fit past the tide rail and inside the glass');
    return { seed: 1729, panFrom, pan, ...edge };
  }],
  ['cue-pending-double-input-and-confirmed-retirement', async (page) => {
    await boot(page, { cue: 0 });
    const before = await snapshot(page), beforeUi = await ui(page);
    const word = await pick(page);
    await tap(page, word);
    await page.waitForFunction(() => !!document.getElementById('drift-layer').dataset.recordCuePending);
    await tap(page, word); await flick(page, word);
    const held = await ui(page, word.id);
    present(held); assert.equal(held.cueCalls.length, 1); assert.equal(held.calls.length, 0);
    assert.equal(held.depth, 0); assert.equal(held.tray, beforeUi.tray);
    assert.deepEqual(await snapshot(page), before);
    assert.equal(held.cueCalls[0].key, word.label); assert.equal(held.cueCalls[0].kind, 'word');
    assert.equal(held.cueCalls[0].gesture, 'tap'); assert.equal(held.cueCalls[0].scopeId, before.scopeId);
    assert.equal(await page.evaluate(async () => {
      try { await window.__DRIFT__.setRecordBridge({ ...window.fixture.bridge }); return 'replaced'; }
      catch (error) { return error.message; }
    }), 'record-cue-pending');
    await releaseCue(page, 'success');
    const committed = await snapshot(page), after = await ui(page, word.id);
    onlyCueCommitted(before, committed); present(after);
    assert.equal(after.firstCue, false); assert.equal(after.tray, beforeUi.tray); assert.equal(after.calls.length, 0);
    await boot(page, { cue: 0 });
    assert.deepEqual(await snapshot(page), committed); assert.equal((await ui(page)).firstCue, false);
    assert.equal((await ui(page)).cueCalls.length, 0);
    return { changeId: held.cueCalls[0].changeId, gesture: 'tap', judgments: 0 };
  }],
  ['cue-quota-failure-retains-state-and-retry-identity', async (page) => {
    await boot(page, { cue: 0 });
    const before = await snapshot(page), word = await pick(page);
    await tap(page, word); await releaseCue(page, 'quota');
    const failed = await ui(page, word.id);
    present(failed); assert.equal(failed.state, 'recovery-required'); assert.equal(failed.firstCue, true);
    assert.match(failed.hint, /再読み込み/u); assert.deepEqual(await snapshot(page), before);
    assert.equal(await page.evaluate(() => window.fixture.cueFaults), 1);
    await page.evaluate(() => { window.fixture.cueMode = 'success'; });
    await tap(page, word);
    await page.waitForFunction(() => window.fixture.cueCalls.length === 2 && !document.getElementById('drift-layer').dataset.recordCuePending);
    const after = await ui(page, word.id);
    onlyCueCommitted(before, await snapshot(page)); present(after);
    assert.equal(after.state, 'active'); assert.equal(after.firstCue, false);
    assert.equal(after.cueCalls[0].changeId, after.cueCalls[1].changeId); assert.equal(after.calls.length, 0);
  }],
  ['cue-lost-ack-restart-hydrates-retired-hint', async (page) => {
    await boot(page, { cue: 0 });
    const before = await snapshot(page), word = await pick(page);
    await tap(page, word); await releaseCue(page, 'commit-non-active');
    const unacknowledged = await ui(page, word.id);
    present(unacknowledged); assert.equal(unacknowledged.state, 'recovery-required'); assert.equal(unacknowledged.firstCue, true);
    const committed = await snapshot(page); onlyCueCommitted(before, committed);
    await boot(page, { cue: 0 });
    assert.deepEqual(await snapshot(page), committed);
    assert.equal((await ui(page)).firstCue, false); assert.equal((await ui(page)).cueCalls.length, 0);
    assert.equal((await ui(page)).calls.length, 0);
  }],
  ['cue-hold-retirement-does-not-grade-word', async (page) => {
    await boot(page, { cue: 0 });
    const before = await snapshot(page), word = await pick(page);
    await page.evaluate(() => { window.fixture.cueMode = 'success'; });
    const at = await aim(page, word);
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    await page.waitForFunction(() => window.fixture.cueCalls.length === 1, null, { timeout: 4000 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.getElementById('drift-layer').dataset.recordCuePending);
    const after = await ui(page, word.id);
    onlyCueCommitted(before, await snapshot(page)); present(after);
    assert.equal(after.cueCalls[0].gesture, 'hold'); assert.equal(after.cueCalls[0].key, word.label);
    assert.equal(after.calls.length, 0); assert.equal(after.firstCue, false);
  }],
  ...['wrong-id', 'wrong-scope', 'non-active', 'unretired-state', 'revoked-owner'].map((mode) => [`cue-refuses-${mode}-acknowledgment`, async (page) => {
    await boot(page, { cue: 0 });
    const before = await snapshot(page), word = await pick(page);
    await tap(page, word); await releaseCue(page, mode);
    const failed = await ui(page, word.id);
    present(failed); assert.equal(failed.state, 'recovery-required'); assert.equal(failed.firstCue, true);
    assert.equal(failed.cueCalls.length, 1); assert.equal(failed.calls.length, 0); assert.match(failed.hint, /再読み込み/u);
    if (mode === 'non-active') assert.deepEqual(await snapshot(page), before);
    else onlyCueCommitted(before, await snapshot(page));
    return { mode, published: false, recordMayHaveCommitted: mode !== 'non-active' };
  }]),
  ['boot-without-bridge-fails-closed', async (page) => {
    await boot(page, { install: false });
    const word = await pick(page);
    await flick(page, word);
    await page.waitForTimeout(1250);
    const state = await ui(page, word.id);
    present(state); assert.equal(state.state, 'loading'); assert.equal(state.calls.length, 0);
    assert.match(state.hint, /再読み込み/u);
    assert.equal((await page.evaluate(() => window.fixture.install())).status, 'active');
    assert.match((await ui(page)).tray, /済み 7/u);
  }],
  ['pending-double-input-navigation-and-confirmed-departure', async (page) => {
    await boot(page);
    const before = await snapshot(page), beforeUi = await ui(page);
    const word = await pick(page);
    await flick(page, word); await pending(page, word);
    await flick(page, word);
    await page.getByRole('button', { name: 'Leave Drift', exact: true }).click();
    await page.waitForTimeout(1250);
    await page.getByRole('button', { name: 'Return to Drift', exact: true }).click();
    const state = await ui(page, word.id);
    present(state); assert.equal(state.calls.length, 1); assert.equal(state.node.pending, 'true');
    assert.equal(state.tray, beforeUi.tray); assert.deepEqual(await snapshot(page), before);
    assert.equal(await page.evaluate(async () => {
      try { await window.__DRIFT__.setRecordBridge({ ...window.fixture.bridge }); return 'replaced'; }
      catch (error) { return error.message; }
    }), 'record-judgment-pending');
    await release(page, 'success');
    const committed = await snapshot(page), departing = await ui(page, word.id);
    assert.equal(committed.driftState.store.lk, 8); assert.equal(committed.observations.length, 1);
    assert.equal(committed.observations[0].key, word.label);
    assert.deepEqual(committed.driftState.store.future, before.driftState.store.future);
    assert.match(departing.tray, /済み 8/u); assert.equal(departing.node.pointerEvents, 'none');
    await page.waitForFunction((id) => !document.querySelector(`[data-drift-probe="${id}"]`), word.id);
    return { gesture: 'browser mouse flick right', judgments: committed.observations.length, changeId: state.calls[0].changeId };
  }],
  ['aborted-transaction-retains-word-and-retry-identity', async (page) => {
    await boot(page);
    const before = await snapshot(page), tray = (await ui(page)).tray;
    const word = await pick(page);
    await flick(page, word, -1); await pending(page, word); await release(page, 'abort');
    await page.waitForTimeout(1250);
    const failed = await ui(page, word.id);
    present(failed); assert.equal(failed.state, 'recovery-required'); assert.equal(failed.tray, tray);
    assert.deepEqual(await snapshot(page), before); assert.match(failed.hint, /再読み込み/u);
    await page.evaluate(() => { window.fixture.mode = 'success'; });
    await flick(page, word, -1);
    await page.waitForFunction(() => window.fixture.calls.length === 2 && document.getElementById('drift-layer').dataset.recordState === 'active');
    const after = await snapshot(page), calls = (await ui(page)).calls;
    assert.equal(calls[0].changeId, calls[1].changeId); assert.equal(after.driftState.store.lu, 6); assert.equal(after.observations.length, 1);
  }],
  ...['throw', 'non-active', 'wrong-id', 'wrong-scope', 'stale-revision', 'conflicting-revision', 'invalid-state', 'revoked-owner'].map((mode) => [`refuses-${mode}-acknowledgment`, async (page) => {
    await boot(page);
    const before = await snapshot(page), tray = (await ui(page)).tray;
    const word = await pick(page);
    await flick(page, word); await pending(page, word); await release(page, mode);
    await page.waitForTimeout(1250);
    const failed = await ui(page, word.id);
    present(failed); assert.equal(failed.state, 'recovery-required'); assert.equal(failed.tray, tray); assert.match(failed.hint, /再読み込み/u);
    if (['throw', 'non-active'].includes(mode)) assert.deepEqual(await snapshot(page), before);
    return { mode, recordMayHaveCommitted: !['throw', 'non-active'].includes(mode), published: false };
  }]),
  ['unacknowledged-commit-restart-hydrates-once', async (page) => {
    await boot(page);
    const tray = (await ui(page)).tray;
    const word = await pick(page);
    await flick(page, word, -1); await pending(page, word); await release(page, 'commit-non-active');
    present(await ui(page, word.id)); assert.equal((await ui(page)).tray, tray);
    const committed = await snapshot(page);
    assert.equal(committed.driftState.store.lu, 6); assert.equal(committed.observations.length, 1);
    await boot(page);
    const after = await snapshot(page);
    assert.deepEqual(after, committed); assert.match((await ui(page)).tray, /拾った 6/u);
    assert.equal((await ui(page)).calls.length, 0);
  }],
  ['recovered-duplicate-acknowledges-the-original-gesture-once', async (page) => {
    await boot(page);
    const word = await pick(page);
    await flick(page, word); await pending(page, word); await release(page, 'commit-non-active');
    const committed = await snapshot(page);
    await page.evaluate(() => { window.fixture.mode = 'success'; });
    await flick(page, word);
    await page.waitForFunction(() => window.fixture.calls.length === 2 && document.getElementById('drift-layer').dataset.recordState === 'active');
    const calls = (await ui(page)).calls;
    assert.equal(calls[0].changeId, calls[1].changeId); assert.deepEqual(await snapshot(page), committed);
    assert.equal((await ui(page, word.id)).node.pointerEvents, 'none');
  }],
  ['late-background-read-cannot-demote-a-newer-committed-view', async (page) => {
    await boot(page);
    const word = await pick(page);
    await flick(page, word); await pending(page, word);
    await page.evaluate(() => { window.fixture.holdRead = true; });
    await page.getByRole('button', { name: 'Leave Drift', exact: true }).click();
    await page.getByRole('button', { name: 'Return to Drift', exact: true }).click();
    await page.waitForFunction(() => typeof window.fixture.releaseRead === 'function');
    await release(page, 'success');
    const before = await ui(page);
    const view = await page.evaluate(() => { window.fixture.releaseRead(); return window.__DRIFT__.refreshRecord(); });
    assert.equal(view.status, 'active'); assert.equal(view.revision, 2);
    const after = await ui(page);
    assert.equal(after.state, 'active'); assert.equal(after.tray, before.tray); assert.match(after.tray, /済み 8/u);
  }],
  ['tap-depth-pending-surface-and-glyph-particle-judgments', async (page) => {
    await boot(page);
    const before = await snapshot(page);
    const tide = await page.locator('#lvl').boundingBox();
    await page.mouse.click(tide.x + tide.width / 2, tide.y + tide.height * 0.6);
    await page.waitForTimeout(1400);
    let word = await pick(page, '.word', particleWords, false);
    const pans = [[0, 1], [0, 1], [0, 1], [1, 0], [1, 0], [1, 0], [0, -1], [0, -1], [0, -1], [-1, 0], [-1, 0], [-1, 0]];
    for (let attempts = 0; !word && attempts < pans.length; attempts++) {
      const at = await page.evaluate(() => {
        for (const y of [360, 400, 440]) for (const x of [450, 400, 350, 300]) {
          if (!document.elementFromPoint(x, y)?.closest('.word,.glyph,.part,#lvl,#theme,#fixture-nav')) return { x, y };
        }
        return null;
      });
      assert(at, 'Reachable open water is required to bring a particle-bearing word into view');
      await page.mouse.move(at.x, at.y); await page.mouse.down();
      for (let step = 1; step <= 6; step++) {
        await page.mouse.move(at.x + pans[attempts][0] * step * 35, at.y + pans[attempts][1] * step * 35);
        await page.waitForTimeout(80);
      }
      await page.mouse.up(); await page.waitForTimeout(1100);
      word = await pick(page, '.word', particleWords, false);
    }
    assert(word, 'A particle-bearing word must be reached through the real tide and pan controls');
    await tap(page, word);
    assert.equal(await page.locator(`[data-drift-probe="${word.id}"]`).evaluate((el) => el.classList.contains('unfolded')), true);
    await tap(page, word);
    assert.equal(await page.locator(`[data-drift-probe="${word.id}"]`).evaluate((el) => el.classList.contains('glossed')), true);
    await tap(page, word);
    assert.equal((await ui(page)).depth, 1); assert.deepEqual(await snapshot(page), before);
    const glyph = await pick(page, '.glyph');
    await tap(page, glyph); assert.equal((await ui(page)).depth, 2);
    await page.getByRole('button', { name: 'Surface one level' }).click();
    await page.waitForTimeout(1100); assert.equal((await ui(page)).depth, 1);
    const part = await pick(page, '.part');
    await flick(page, part, -1); await pending(page, part);
    await page.getByRole('button', { name: 'Surface one level' }).click();
    assert.equal((await ui(page)).depth, 1); present(await ui(page, part.id));
    await release(page, 'success'); await page.waitForTimeout(1100);
    const activeGlyph = await pick(page, '.glyph');
    await flick(page, activeGlyph); await pending(page, activeGlyph); await release(page, 'success');
    await page.waitForTimeout(1100);
    const after = await snapshot(page);
    assert.deepEqual(after.observations.map((o) => o.kind), ['part', 'glyph']);
    assert.equal(after.driftState.store.unknown[part.label], 1); assert.equal(after.driftState.store.known[activeGlyph.label], 1);
    await page.getByRole('button', { name: 'Surface one level' }).click();
    assert.equal((await ui(page)).depth, 0);
    return { depthLog: await page.evaluate(() => window.fixture.depthLog), keys: after.observations.map((o) => o.key) };
  }],
];

try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit })[engine].launch(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    try {
      for (const [name, run] of cases) {
        if (FILTER && !name.includes(FILTER)) continue;
        const context = await browser.newContext({ viewport: { width: 800, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        const started = Date.now();
        try {
          const detail = await run(page);
          assert.deepEqual(await page.evaluate(() => window.fixture.legacyCalls), []);
          assert.equal(await page.evaluate(() => window.fixture.legacyUnchanged()), true);
          assert.deepEqual(pageErrors, []);
          const row = { engine, name, pass: true, elapsedMs: Date.now() - started, detail };
          results.push(row); console.log(`PASS ${engine} ${name}`);
          if (name.includes('pending-double')) await page.screenshot({ path: resolve(EVIDENCE, `${engine}-committed-field.png`) });
        } catch (error) {
          const screenshot = resolve(EVIDENCE, `${engine}-${name}.png`);
          await page.screenshot({ path: screenshot }).catch(() => {});
          const row = { engine, name, pass: false, elapsedMs: Date.now() - started, error: error.stack, pageErrors, screenshot, state: await ui(page).catch(() => null) };
          results.push(row); errors.push(row); console.error(`FAIL ${engine} ${name}: ${error.message}`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  server.close();
  const here = dirname(fileURLToPath(import.meta.url));
  const sources = ['verify-drift-record.mjs', 'build-drift-layer.mjs'].map((name) => ({ path: resolve(here, name), sha256: sha(readFileSync(resolve(here, name))) }));
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(resolve(EVIDENCE, 'drift-record-report.json'), JSON.stringify({
    schemaVersion: 1, artifactSha256: manifest.artifactSha256, site: SITE, sources,
    assets: names.map((name) => ({ name, sha256: sha(assets.get(name)) })), fixtureSha256: sha(html),
    scope: 'Real browser gestures and animations against the staged hosted Drift layer, controller codec, and synthetic IndexedDB bridge',
    limits: ['The production Corridor reducer and boot integration are separate checks.', 'Reduced-motion disables ambient drift; real CSS judgment departure still runs.', 'The fixture acknowledgment proves only its command and synthetic installation/session, never external truth or authority.'],
    engines: ENGINES, results, pass: results.length > 0 && errors.length === 0,
  }, null, 2) + '\n');
}
assert(results.length > 0, 'At least one browser case must run');
if (errors.length) process.exitCode = 1;
