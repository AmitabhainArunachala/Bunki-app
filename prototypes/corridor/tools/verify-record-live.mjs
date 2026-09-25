/** Actual staged app journeys over its installation's native IndexedDB store.
 * Setup seeds an isolated origin before the app starts. Every action thereafter
 * uses rendered UI; no app/controller instance or replacement runtime is used.
 * Native IDB faults are scoped to the actual host-command transaction, and each
 * assertion reads committed rows independently of the app's publication state.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import {
  resolveCorridorEvidence,
  resolveCorridorSite,
} from '../../../scripts/resolve-corridor-site.mjs';
import { verifyBundledArtifact } from '../../bunki-desktop/lib/artifact.cjs';

const OUT = resolveCorridorEvidence();
const verifierSha256 = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const expectedArtifact = process.env.KAIRO_ARTIFACT_SHA256;
let SITE;
if (expectedArtifact === undefined) SITE = resolveCorridorSite();
else {
  assert(/^[0-9a-f]{64}$/u.test(expectedArtifact), 'Expected artifact must be SHA256');
  assert(
    process.env.KAIRO_SITE_DIR && isAbsolute(process.env.KAIRO_SITE_DIR),
    'Explicit artifact verification requires an absolute staged site',
  );
  SITE = resolve(process.env.KAIRO_SITE_DIR);
  assert.equal(verifyBundledArtifact(SITE).artifactSha256, expectedArtifact);
}
const artifact = verifyBundledArtifact(SITE);
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const selection = process.env.KAIRO_BROWSER || 'all';
assert(['chromium', 'webkit', 'all'].includes(selection));
const ENGINES = selection === 'all' ? ['chromium', 'webkit'] : [selection];
const FILTERS = new Set(
  process.argv.filter((arg) => arg.startsWith('--case=')).map((arg) => arg.slice(7)),
);

const LEGACY_KEY = 'kairo-corridor-v1';
const DRIFT_KEY = 'bunki-drift-v1';
const BINDING_KEY = 'kairo-local-record-binding-v1';
const HOST_COMMANDS = 'kairo:record-host-commands';
const record = JSON.parse(
  '{"v":1,"taken":[{"t":"word","id":"犬","label":"犬","ts":1700000000000}],"srs":{},"revlog":[],"obslog":[],"readDone":{},"__proto__":{"keep":"record-own-key"},"constructor":{"keep":"record-constructor"},"futureRoot":{"日本🧪":[null,false,{"keep":"future-data"}]}}',
);
const recordText = JSON.stringify(record, null, 2);
const driftText =
  '{\n "known":{"犬":2},"unknown":{"猫":1},"lk":"41","lu":7,"cue":1,"__proto__":{"keep":"drift-own-key"},"constructor":{"keep":"drift-constructor"},"future":{"values":[null,false,"future-drift"]}\n}';
const drift = JSON.parse(driftText);
drift.lk = 41;
const rows = [Number.MAX_SAFE_INTEGER, '__proto__', 'constructor'].map((id, index) => ({
  format: 'kairo-archive-row',
  v: 1,
  id: index * 2 + 1,
  turn: {
    id,
    surface: index === 2 ? 'word-tutor' : 'chat',
    role: index % 2 ? 'assistant' : 'user',
    content: `Synthetic complete archive ${index}`,
    ts: 1700000000000 + (2 - index),
    xid: `synthetic-exchange-${index}`,
    future: { keep: index },
  },
}));
const providerText = JSON.stringify({
  v: 1,
  baseUrl: 'https://record-live-provider.invalid',
  model: 'synthetic-never-requested',
  credential: {
    origin: 'https://record-live-provider.invalid',
    key: 'SYNTHETIC-LOCAL-PROVIDER-KEY-NEVER-EXPORT',
  },
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/record-live-setup') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<!doctype html><meta charset="utf-8"><title>Isolated origin setup</title>');
    return;
  }
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  if (!file.startsWith(`${SITE}/`) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

// JSON text preserves own __proto__ keys that Playwright's object codec omits.
async function disk(page) {
  const text = await page.evaluate(async ({ LEGACY_KEY, DRIFT_KEY, BINDING_KEY }) => {
    const installationText = localStorage.getItem(BINDING_KEY);
    const installation = installationText ? JSON.parse(installationText) : null;
    const read = async (name, store) => {
      const db = await new Promise((done, fail) => {
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => {
          request.transaction.abort();
          fail(new Error(`Expected existing database: ${name}`));
        };
        request.onsuccess = () => done(request.result);
        request.onerror = () => fail(request.error);
        request.onblocked = () => fail(new Error(`Database blocked: ${name}`));
      });
      try {
        return await new Promise((done, fail) => {
          const tx = db.transaction(store, 'readonly');
          const request = tx.objectStore(store).getAll();
          tx.oncomplete = () => done(request.result);
          tx.onabort = () => fail(tx.error);
        });
      } finally {
        db.close();
      }
    };
    const target = installation
      ? await read(installation.databaseName, 'kairo_replication_rows')
      : [];
    const documents = target.filter((row) => row.kind === 'document').map((row) => JSON.parse(row.text));
    const select = (collection, id = 'current') =>
      documents.find((row) => row.collection === collection && row.id === id)?.value;
    return JSON.stringify({
      installationText,
      installation,
      legacyText: localStorage.getItem(LEGACY_KEY),
      driftText: localStorage.getItem(DRIFT_KEY),
      providerText: localStorage.getItem('kairo-ai-provider-v1'),
      target,
      documents,
      record: select('learner-record'),
      archive: select('learner-archive'),
      migration: select('kairo:migration', 'manifest'),
      legacyRows: await read('kairo-ai-log', 'turns'),
    });
  }, { LEGACY_KEY, DRIFT_KEY, BINDING_KEY });
  return JSON.parse(text);
}

async function boot(page, { fresh = false, entry = 'shelf' } = {}) {
  await page.goto(`${origin}/record-live-setup`);
  await page.evaluate(async ({ fresh, recordText, driftText, rowsText, providerText }) => {
    localStorage.setItem('kairo-ai-provider-v1', providerText);
    if (fresh) return;
    localStorage.setItem('kairo-corridor-v1', recordText);
    localStorage.setItem('bunki-drift-v1', driftText);
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open('kairo-ai-log', 3);
      request.onupgradeneeded = () => {
        const turns = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
        turns.createIndex('logical-id', 'turn.id');
        request.result.createObjectStore('imports', { keyPath: 'id' });
      };
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    try {
      await new Promise((done, fail) => {
        const tx = db.transaction('turns', 'readwrite', { durability: 'strict' });
        for (const row of JSON.parse(rowsText)) tx.objectStore('turns').put(row);
        tx.oncomplete = done;
        tx.onabort = () => fail(tx.error);
      });
    } finally {
      db.close();
    }
  }, { fresh, recordText, driftText, rowsText: JSON.stringify(rows), providerText });
  await page.goto(`${origin}/index.html?entry=${entry}&ui=bi`);
  await ready(page);
  const state = await disk(page);
  assert(state.installation, 'Rendered app must install its local record binding');
  assert.equal(state.migration?.phase, 'active', 'Actual app target migration must be active');
  assert(state.record, 'Actual app must persist its learner record in the target database');
  assert.equal(await page.locator('#store-alert').isVisible(), false, 'Healthy boot has no storage warning');
  return state;
}

async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
}

async function reload(page) {
  await page.reload();
  await ready(page);
  assert.equal(await page.locator('#store-alert').isVisible(), false, 'Confirmed disk state reopens without a warning');
  return disk(page);
}

async function openCapture(page) {
  await page.locator('#thesaurus-link').click();
  const head = page.locator('.thes-head').filter({ has: page.locator('.thes-word', { hasText: '時間' }) }).first();
  await head.click();
  await page.locator('#sheet #take').waitFor();
  await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'));
  assert.equal(await page.locator('#sheet #take').getAttribute('aria-pressed'), 'false');
  return '時間';
}

async function openReading(page, articleId) {
  const item = articleId
    ? page.locator(`.shelf-item:not([data-recommendation])[data-passage=${JSON.stringify(articleId)}]`)
    : page.locator('.shelf-item:not([data-recommendation])').first();
  await item.waitFor();
  assert.equal(await item.count(), 1, 'Reading action targets one canonical bookshelf item');
  const id = await item.getAttribute('data-passage');
  await item.locator('.shelf-open').click();
  await page.locator('#reader .tok').first().waitFor();
  await page.locator('#read-fin').waitFor();
  return id;
}

const hostCommands = (state) => state.documents.filter((row) => row.collection === HOST_COMMANDS);
function preserved(state) {
  for (const root of ['__proto__', 'constructor', 'futureRoot']) {
    assert(Object.hasOwn(state.record, root), `Record still owns ${root}`);
    assert.deepEqual(state.record[root], record[root]);
  }
  assert.deepEqual(state.archive.turns, rows.map((row) => row.turn));
  assert.deepEqual(state.legacyRows, rows);
  assert.deepEqual(state.record.srs, record.srs, 'These journeys never schedule cards');
  assert.deepEqual(state.record.revlog, record.revlog, 'These journeys create no review grades');
}

async function armFault(page, mode, root) {
  await page.evaluate(({ mode, root }) => {
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const databaseName = installation.databaseName;
    const nativePut = IDBObjectStore.prototype.put;
    const nativeTransaction = IDBDatabase.prototype.transaction;
    let armed = true;
    let rejectReads = false;
    const matched = new WeakSet();
    const fault = { mode, root, databaseName, fired: false, completed: false, blockedReads: 0 };
    window.__recordLiveFault = fault;
    IDBDatabase.prototype.transaction = function (...args) {
      if (armed && rejectReads && this.name === databaseName && (!args[1] || args[1] === 'readonly')) {
        fault.blockedReads++;
        throw new DOMException('Synthetic missing post-commit acknowledgement', 'InvalidStateError');
      }
      const tx = nativeTransaction.apply(this, args);
      if (this.name === databaseName && args[1] === 'readwrite') {
        tx.addEventListener('complete', () => {
          if (armed && mode === 'uncertain' && matched.has(tx)) {
            fault.fired = true;
            fault.completed = true;
            rejectReads = true;
          }
        });
      }
      return tx;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (!armed || this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || args[0]?.kind !== 'document') return request;
      const row = JSON.parse(args[0].text);
      if (row.collection === 'learner-record') {
        const changed = root === 'taken'
          ? row.value.taken.some((item) => item.t === 'word' && item.id === '時間')
          : root === 'obslog'
            ? row.value.obslog.some((row) => row[1] === 'note' && row[3] === 'Synthetic note held after quota failure')
            : Object.keys(row.value.readDone || {}).length > 0;
        if (changed) matched.add(this.transaction);
      }
      if (row.collection === 'kairo:record-host-commands' && matched.has(this.transaction) && mode === 'quota') {
        armed = false;
        fault.fired = true;
        throw new DOMException('Synthetic quota after real learner-record and archive puts', 'QuotaExceededError');
      }
      return request;
    };
    fault.disarm = () => {
      armed = false;
      rejectReads = false;
      IDBObjectStore.prototype.put = nativePut;
      IDBDatabase.prototype.transaction = nativeTransaction;
    };
  }, { mode, root });
}

async function faultState(page) {
  return page.evaluate(() => {
    const { disarm, ...state } = window.__recordLiveFault;
    void disarm;
    return state;
  });
}

async function flickWord(page) {
  await page.waitForSelector('#drift-layer.active[data-record-state="active"]');
  await page.waitForFunction(() => [...document.querySelectorAll('#drift-layer .word')].some((node) => {
    const box = node.getBoundingClientRect();
    return box.left > 40 && box.right < innerWidth - 180 && box.top > 120 && box.bottom < innerHeight - 120 && Number(getComputedStyle(node).opacity) > 0.15;
  }));
  const target = await page.evaluate(() => {
    for (const node of document.querySelectorAll('#drift-layer .word')) {
      const box = node.getBoundingClientRect();
      if (box.left <= 40 || box.right >= innerWidth - 180 || box.top <= 120 || box.bottom >= innerHeight - 120 || Number(getComputedStyle(node).opacity) <= 0.15) continue;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      if (document.elementFromPoint(x, y)?.closest('.word') !== node) continue;
      return { word: node.querySelector('.base').textContent, x, y };
    }
    return null;
  });
  assert(target, 'A real rendered Drift word has an unobstructed flick path');
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 130, target.y, { steps: 3 });
  await page.mouse.up();
  return target.word;
}

async function holdLocalResponse(page, pathname) {
  let release;
  let observed;
  const released = new Promise((resolve) => { release = resolve; });
  const seen = new Promise((resolve) => { observed = resolve; });
  await page.route(`${origin}${pathname}`, async (route) => {
    observed();
    await released;
    await route.continue();
  });
  return { pathname, seen, release };
}

async function deliverHeldResponse(page, held) {
  const response = page.waitForResponse((entry) => new URL(entry.url()).pathname === held.pathname);
  held.release();
  assert.equal(await (await response).finished(), null);
  // Let fetch/json promise continuations and the browser's following paint
  // complete while the actual mouse button is still down. No app state hook.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function pressListHeader(page) {
  const header = page.locator('#sheet .list-picker .fold-head');
  await header.scrollIntoViewIfNeeded();
  const point = await header.boundingBox();
  assert(point);
  await page.evaluate(() => {
    window.__recordPressedHeader = document.querySelector('#sheet .list-picker .fold-head');
    window.__recordPressedSheet = document.getElementById('sheet');
  });
  await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
  await page.mouse.down();
}

async function assertPressedListHeader(page) {
  assert.deepEqual(await page.evaluate(() => ({
    headerConnected: window.__recordPressedHeader.isConnected,
    sameSheet: window.__recordPressedSheet === document.getElementById('sheet'),
    expanded: window.__recordPressedHeader.getAttribute('aria-expanded'),
  })), { headerConnected: true, sameSheet: true, expanded: 'false' },
  'Arriving word data cannot replace a pressed control before its click');
}

const all = [];
try {
  for (const engine of ENGINES) {
    const engineOut = resolve(OUT, engine);
    mkdirSync(engineOut, { recursive: true });
    const browser = await { chromium, webkit }[engine].launch(
      engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {},
    );
    const results = [];
    const errors = [];
    const network = [];
    const startedAt = new Date().toISOString();
    const newContext = async (name) => {
      const context = await browser.newContext({
        viewport: { width: 1100, height: 900 },
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
        acceptDownloads: true,
      });
      context.setDefaultTimeout(15_000);
      context.on('page', (page) => page.on('pageerror', (error) => errors.push({ name, message: error.message })));
      await context.route('**/*', (route) => {
        const requested = new URL(route.request().url());
        if (requested.origin === origin) return route.continue();
        network.push({ name, origin: requested.origin, blocked: true });
        return route.abort();
      });
      return context;
    };
    async function test(name, action) {
      if (FILTERS.size && !FILTERS.has(name)) return;
      const start = Date.now();
      const context = await newContext(name);
      const page = await context.newPage();
      const extraContexts = [];
      const details = {};
      const caseOut = resolve(engineOut, name);
      mkdirSync(caseOut, { recursive: true });
      let timer;
      try {
        await Promise.race([
          action({ page, details, caseOut, newPage: async () => {
            const extra = await newContext(name);
            extraContexts.push(extra);
            return extra.newPage();
          } }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Actual app journey timed out')), 80_000);
          }),
        ]);
        assert.equal(errors.filter((error) => error.name === name).length, 0, 'Journey has no uncaught page errors');
        await page.screenshot({ path: resolve(caseOut, 'completed.png'), fullPage: true });
        results.push({ name, status: 'passed', elapsedMs: Date.now() - start, ...details });
      } catch (error) {
        await page.screenshot({ path: resolve(caseOut, 'failure.png'), fullPage: true }).catch(() => {});
        const rendered = await page.evaluate(() => ({
          ready: document.body.dataset.ready || null,
          title: document.querySelector('.view-title')?.textContent || null,
          storeWarning: document.querySelector('#store-alert')?.textContent || null,
          driftRecordState: document.querySelector('#drift-layer')?.dataset.recordState || null,
          listPickers: [...document.querySelectorAll('#sheet .list-picker')].map((node) => ({
            expanded: node.querySelector('.fold-head')?.getAttribute('aria-expanded'),
            chips: [...node.querySelectorAll('.chip.wide')].map((chip) => ({ text: chip.textContent, className: chip.className, disabled: chip.disabled })),
          })),
        })).catch((problem) => ({ unavailable: problem.message }));
        const committed = await disk(page).catch((problem) => ({ unavailable: problem.message }));
        writeFileSync(resolve(caseOut, 'failure-record.json'), `${JSON.stringify(committed, null, 2)}\n`);
        results.push({ name, status: 'failed', elapsedMs: Date.now() - start, error: String(error.stack || error), rendered, ...details });
      } finally {
        clearTimeout(timer);
        for (const extra of extraContexts) await extra.close();
        await context.close();
        writeFileSync(resolve(caseOut, 'receipt.json'), `${JSON.stringify(results.at(-1), null, 2)}\n`);
        process.stdout.write(`${engine} ${results.at(-1).status}: ${name}\n`);
        if (results.at(-1).status === 'failed') process.stdout.write(`${results.at(-1).error}\n`);
      }
    }
    try {
      await test('legacy-record-archive-and-drift-migrate-through-app-boot', async ({ page, details }) => {
        const before = await boot(page, { entry: 'drift' });
        preserved(before);
        assert.equal(before.migration.version, 2);
        assert.equal(JSON.parse(before.legacyText).v, 2);
        assert.equal(JSON.parse(before.driftText).v, 2);
        assert.deepEqual(before.record.driftState, { format: 'kairo-drift-state', version: 1, store: drift });
        const custody = before.documents.find((row) => row.collection === 'kairo:migration-custody')?.value;
        assert.equal(custody?.source.recordText, recordText, 'Custody preserves exact pre-migration record bytes');
        assert.equal(custody?.source.legacyDriftText, driftText, 'Custody preserves exact pre-migration Drift bytes');
        assert.deepEqual(custody?.source.archive.rows, rows);
        await page.waitForSelector('#drift-layer[data-record-state="active"]');
        assert.match(await page.locator('#drift-tray').textContent(), /拾った\s*7/u);
        assert.match(await page.locator('#drift-tray').textContent(), /済み\s*41/u);
        const after = await reload(page);
        preserved(after);
        assert.equal(after.installationText, before.installationText);
        assert.equal(after.legacyText, before.legacyText);
        assert.equal(after.driftText, before.driftText);
        assert.deepEqual(after.record.driftState, before.record.driftState);
        assert.equal(after.documents.filter((row) => row.collection === 'kairo:migration-custody').length, 1);
        details.databaseName = after.installation.databaseName;
        details.sourceCoverage = ['record', 'archive', 'drift'];
      });

      await test('capture-and-reading-completion-publish-durable-state-and-reload', async ({ page, details }) => {
        const initial = await boot(page);
        const word = await openCapture(page);
        await page.locator('#sheet #take').click();
        await page.waitForFunction(() => document.querySelector('#sheet #take')?.getAttribute('aria-pressed') === 'true');
        const captured = await disk(page);
        assert.equal(captured.record.taken.filter((item) => item.t === 'word' && item.id === word).length, 1);
        preserved(captured);
        await page.locator('#sheet-close').click();
        await page.locator('#back').click();
        const articleId = await openReading(page);
        await page.locator('#read-fin').click();
        await page.waitForFunction(() => document.querySelector('#read-fin')?.classList.contains('finished'));
        const completed = await disk(page);
        assert(Number.isFinite(completed.record.readDone[articleId]));
        assert.equal(completed.record.taken.length, initial.record.taken.length + 1);
        preserved(completed);
        const after = await reload(page);
        preserved(after);
        assert.deepEqual(after.record.taken, completed.record.taken);
        assert.deepEqual(after.record.readDone, completed.record.readDone);
        assert.equal(after.legacyText, initial.legacyText, 'Target changes never overwrite the legacy fence');
        assert.equal(after.driftText, initial.driftText);
        await openReading(page, articleId);
        assert.equal(await page.locator('#read-fin').evaluate((node) => node.classList.contains('finished')), true);
        details.word = word;
        details.articleId = articleId;
        details.commandReceipts = hostCommands(after).length;
      });

      await test('rendered-drift-flick-commits-judgment-and-observation-together', async ({ page, details }) => {
        const initial = await boot(page, { entry: 'drift' });
        const word = await flickWord(page);
        await page.waitForFunction(() => /済み\s*42/u.test(document.querySelector('#drift-tray')?.textContent || ''));
        const after = await disk(page);
        assert.equal(after.record.driftState.store.lk, initial.record.driftState.store.lk + 1);
        assert.equal(after.record.driftState.store.known[word], (initial.record.driftState.store.known[word] || 0) + 1);
        assert.equal(after.record.obslog.length, initial.record.obslog.length + 1, 'One flick appends one learner observation');
        assert.equal(hostCommands(after).length, hostCommands(initial).length + 1, 'Judgment and observation share one host command');
        assert.deepEqual(after.record.taken, initial.record.taken);
        preserved(after);
        assert.equal(after.driftText, initial.driftText, 'Hosted Drift keeps the source fence intact');
        const reloaded = await reload(page);
        assert.deepEqual(reloaded.record.driftState, after.record.driftState);
        assert.deepEqual(reloaded.record.obslog, after.record.obslog);
        details.word = word;
        details.input = 'real mouse pointer flick in the rendered app';
      });

      await test('list-edits-and-note-append-commit-without-losing-own-keys', async ({ page, details }) => {
        await boot(page);
        await page.locator('#tray').click();
        await page.locator('#list-maker-field').fill('__proto__');
        await page.locator('#list-maker-make').click();
        await page.getByRole('button', { name: 'rename __proto__', exact: true }).waitFor();
        const created = await disk(page);
        assert(Object.hasOwn(created.record.lists, '__proto__'));
        assert.deepEqual(created.record.lists.__proto__, []);
        assert.equal(await page.locator('#list-maker-make').isDisabled(), false, 'Confirmed list creation releases its input guard');
        const note = 'Synthetic note confirmed through the rendered app';
        await page.locator('#note-input').fill(note);
        await page.locator('#note-send').click();
        await page.locator('.note-row').filter({ hasText: note }).waitFor();
        assert.equal(await page.locator('#note-input').inputValue(), '');
        await page.getByRole('button', { name: 'rename __proto__', exact: true }).click();
        await page.locator('.list-rename .list-maker-field').fill('旅の記録');
        await page.locator('.list-rename .list-maker-make').click();
        await page.getByRole('button', { name: 'rename 旅の記録', exact: true }).waitFor();
        await page.locator('.tray-line').filter({ has: page.locator('.w', { hasText: '犬' }) }).first().click();
        await page.locator('#sheet .list-picker .fold-head').click();
        await page.locator('#sheet .list-picker .chip.wide').filter({ hasText: '旅の記録' }).click();
        await page.locator('#sheet .list-picker .chip.wide.on-list').filter({ hasText: '旅の記録' }).waitFor();
        await page.locator('#new-list').click();
        await page.locator('#sheet .list-maker-field').fill('__proto__');
        await page.locator('#sheet .list-maker-make').click();
        await page.locator('#sheet .list-picker .chip.wide.on-list').filter({ hasText: '__proto__' }).waitFor();
        await page.locator('#sheet-close').click();
        await page.getByRole('button', { name: 'delete __proto__', exact: true }).click();
        await page.getByRole('button', { name: 'really delete __proto__', exact: true }).click();
        await page.getByRole('button', { name: 'really delete __proto__', exact: true }).waitFor({ state: 'detached' });
        const after = await disk(page);
        assert(!Object.hasOwn(after.record.lists, '__proto__'));
        assert.equal(after.record.lists['旅の記録'].filter((row) => row.id === '犬').length, 1);
        assert.equal(after.record.obslog.filter((row) => row[1] === 'note' && row[3] === note).length, 1);
        assert.deepEqual(after.record.taken, record.taken, 'List curation never enrolls or removes the captured row');
        preserved(after);
        const reloaded = await reload(page);
        assert.deepEqual(reloaded.record.lists, after.record.lists);
        assert.deepEqual(reloaded.record.obslog, after.record.obslog);
        details.namedList = '旅の記録';
      });

      await test('word-sheet-example-arrival-keeps-pressed-list-control-and-draft', async ({ page, details }) => {
        const initial = await boot(page);
        const examples = await holdLocalResponse(page, '/data/proprietary_safe/examples/s-01.json');
        const dictionary = await holdLocalResponse(page, '/data/share_alike/dict-v2/0f.json');
        try {
          await page.locator('#tray').click();
          await page.locator('.tray-line').filter({ has: page.locator('.w', { hasText: '犬' }) }).first().click();
          await Promise.all([examples.seen, dictionary.seen]);
          const beforeExamples = await page.locator('#sheet .example').allTextContents();
          await pressListHeader(page);
          await deliverHeldResponse(page, examples);
          await assertPressedListHeader(page);
          await page.mouse.up();
          await page.locator('#sheet .list-picker .fold-head[aria-expanded="true"]').waitFor();
          assert.notDeepEqual(await page.locator('#sheet .example').allTextContents(), beforeExamples,
            'The completed click renders the newly arrived examples');
          await page.locator('#new-list').click();
          const field = page.locator('#sheet .list-maker-field');
          const draft = '未送信のリスト';
          await field.fill(draft);
          await deliverHeldResponse(page, dictionary);
          await page.locator('#sheet .dictionary-opening').waitFor({ state: 'detached' });
          assert.equal(await field.inputValue(), draft);
          assert.equal(await field.evaluate((node) => node === document.activeElement), true);
          assert.equal(await page.locator('#sheet .list-picker .fold-head').getAttribute('aria-expanded'), 'true');
          assert.deepEqual(await disk(page), initial, 'Background hydration and an unsubmitted draft write no learner evidence');
          details.delivery = 'Real example and dictionary responses held until observed native mouse/input gestures';
          details.pressedControlRetained = true;
          details.unsentDraftAndFocusRetained = true;
        } finally {
          examples.release();
          dictionary.release();
          await page.mouse.up();
        }
      });

      await test('word-sheet-dictionary-arrival-clears-outside-release-and-ignores-dismissed-entry', async ({ page, details }) => {
        const initial = await boot(page);
        const examples = await holdLocalResponse(page, '/data/proprietary_safe/examples/s-01.json');
        const dictionary = await holdLocalResponse(page, '/data/share_alike/dict-v2/0f.json');
        try {
          await page.locator('#tray').click();
          await page.locator('.tray-line').filter({ has: page.locator('.w', { hasText: '犬' }) }).first().click();
          await Promise.all([examples.seen, dictionary.seen]);
          await pressListHeader(page);
          await deliverHeldResponse(page, dictionary);
          await assertPressedListHeader(page);
          await page.mouse.move(1, 1);
          await page.mouse.up();
          await page.locator('#sheet .dictionary-opening').waitFor({ state: 'detached' });
          assert.equal(await page.locator('#sheet .list-picker .fold-head').getAttribute('aria-expanded'), 'false');
          await page.locator('#sheet .list-picker .fold-head').focus();
          await page.keyboard.press('Enter');
          await page.locator('#sheet .list-picker .fold-head[aria-expanded="true"]').waitFor();
          await page.locator('#sheet-close').click();
          await deliverHeldResponse(page, examples);
          assert.equal(await page.locator('#sheet').count(), 0, 'A late response never reopens a dismissed entry');
          assert.deepEqual(await disk(page), initial, 'Cancelled activation and late responses write no learner evidence');
          details.outsideReleaseUnblockedRefresh = true;
          details.keyboardActivationWorks = true;
          details.dismissedEntryRemainsClosed = true;
        } finally {
          examples.release();
          dictionary.release();
          await page.mouse.up();
        }
      });

      await test('native-quota-abort-retains-note-input-and-session-draft', async ({ page, details }) => {
        await boot(page);
        await page.locator('#tray').click();
        const note = 'Synthetic note held after quota failure';
        await page.locator('#note-input').fill(note);
        const before = await disk(page);
        await armFault(page, 'quota', 'obslog');
        await page.locator('#note-send').click();
        await page.waitForFunction(() => window.__recordLiveFault?.fired === true);
        await page.locator('#store-alert').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#note-input').inputValue(), note);
        assert.equal(await page.locator('.note-row').filter({ hasText: note }).count(), 0);
        assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('kairo-record-drafts-v1'))['note-input']), note);
        details.fault = await faultState(page);
        await page.evaluate(() => window.__recordLiveFault.disarm());
        const after = await disk(page);
        assert.deepEqual(after.record.obslog, before.record.obslog);
        assert.equal(hostCommands(after).length, hostCommands(before).length);
        await reload(page);
        await page.locator('#tray').click();
        assert.equal(await page.locator('#note-input').inputValue(), note, 'Reload restores the uncommitted draft');
      });

      await test('list-membership-survives-render-during-native-commit', async ({ page, details }) => {
        await boot(page);
        await page.locator('#tray').click();
        await page.locator('#list-maker-field').fill('Concurrent list');
        await page.locator('#list-maker-make').click();
        await page.getByRole('button', { name: 'rename Concurrent list', exact: true }).waitFor();
        await page.locator('.tray-line').filter({ has: page.locator('.w', { hasText: '犬' }) }).first().click();
        await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'));
        await page.waitForLoadState('networkidle');
        await page.locator('#sheet .list-picker .fold-head').click();
        await page.locator('#new-list').waitFor();
        // Both are real displayed controls. Issue the second UI action in the
        // same task, before the first native IDB transaction can acknowledge.
        // No app function, store adapter, or replacement runtime is called.
        await page.evaluate(() => {
          const membership = [...document.querySelectorAll('#sheet .list-picker .chip.wide')]
            .find((button) => button.querySelector('.big')?.textContent === 'Concurrent list');
          if (!membership || membership.disabled) throw new Error('Visible membership control unavailable');
          membership.click();
          document.querySelector('#new-list').click();
          const input = document.querySelector('#sheet .list-maker-field');
          input.value = 'Unsent next list';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.locator('#sheet .list-maker-field').waitFor();
        await page.locator('#sheet .list-picker .chip.wide.on-list').filter({ hasText: 'Concurrent list' }).waitFor();
        const after = await disk(page);
        assert.equal(after.record.lists['Concurrent list'].filter((row) => row.id === '犬').length, 1);
        assert.equal(await page.locator('#sheet .list-picker .chip.wide.on-list').filter({ hasText: 'Concurrent list' }).isDisabled(), false);
        assert.equal(await page.locator('#sheet .list-maker-field').inputValue(), 'Unsent next list', 'The acknowledged repaint preserves a newer list draft');
        details.input = 'Two displayed controls activated before the native IDB acknowledgement';
      });

      await test('note-receipt-repaints-current-tray-and-preserves-unrelated-list-draft', async ({ page, details }) => {
        await boot(page);
        await page.locator('#tray').click();
        const note = 'Synthetic note acknowledged after a tray render';
        await page.locator('#note-input').fill(note);
        await page.locator('#list-maker-field').fill('Unsent tray list');
        await page.locator('#srs-prefs-toggle').waitFor();
        await page.evaluate(() => {
          document.querySelector('#note-send').click();
          document.querySelector('#srs-prefs-toggle').click();
        });
        await page.locator('.note-row').filter({ hasText: note }).waitFor();
        assert.equal(await page.locator('#note-input').inputValue(), '');
        assert.equal(await page.locator('#note-send').isDisabled(), false);
        assert.equal(await page.locator('#list-maker-field').inputValue(), 'Unsent tray list');
        const after = await disk(page);
        assert.equal(after.record.obslog.filter((row) => row[1] === 'note' && row[3] === note).length, 1);
        assert(!Object.hasOwn(after.record.lists || {}, 'Unsent tray list'), 'A draft list is not committed by the note');
        preserved(after);
        details.input = 'Note submit and pacing control before native IDB acknowledgement';
      });

      await test('ui-export-and-restore-preserve-portable-record-with-local-binding', async ({ page, newPage, caseOut, details }) => {
        const initial = await boot(page);
        const word = await openCapture(page);
        await page.locator('#sheet #take').click();
        await page.waitForFunction(() => document.querySelector('#sheet #take')?.getAttribute('aria-pressed') === 'true');
        await page.locator('#sheet-close').click();
        await page.locator('#tray').click();
        const downloaded = page.waitForEvent('download');
        await page.locator('#export-store').click();
        const download = await downloaded;
        const path = resolve(caseOut, 'synthetic-record.json');
        await download.saveAs(path);
        const exportedText = readFileSync(path, 'utf8');
        const backup = JSON.parse(exportedText);
        assert.equal(backup.format, 'kairo-backup');
        assert.equal(backup.version, 1);
        assert.equal(backup.completeness, 'complete');
        assert.equal(backup.record.taken.filter((item) => item.id === word).length, 1);
        assert.deepEqual(backup.record.driftState, initial.record.driftState);
        assert.deepEqual(backup.archive.turns, rows.map((row) => row.turn));
        for (const forbidden of ['SYNTHETIC-LOCAL-PROVIDER-KEY', 'kairo-local-record-binding', initial.installation.databaseName, initial.installation.actor.deviceId]) {
          assert(!exportedText.includes(forbidden), `Portable backup excludes ${forbidden}`);
        }
        const destination = await newPage();
        const fresh = await boot(destination, { fresh: true });
        assert.notEqual(fresh.installationText, initial.installationText);
        assert.notEqual(fresh.installation.databaseName, initial.installation.databaseName);
        await destination.locator('#tray').click();
        const tampered = JSON.parse(exportedText);
        tampered.record.futureRoot = { overwritten: true };
        await destination.locator('#import-file').setInputFiles({
          name: 'tampered-synthetic-record.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)),
        });
        await destination.waitForFunction(() => !!document.querySelector('.port-row:has(#import-file) + .airead-note')?.textContent);
        const rejected = await disk(destination);
        assert.deepEqual(rejected.record, fresh.record, 'A hash-inconsistent backup cannot replace the destination');
        assert.deepEqual(rejected.archive, fresh.archive);
        await destination.locator('#import-file').setInputFiles(path);
        await destination.waitForFunction(() => document.body.dataset.ready === '1' && !document.querySelector('#import-file'));
        await ready(destination);
        const restored = await disk(destination);
        assert.deepEqual(restored.record, backup.record);
        assert.deepEqual(restored.archive, backup.archive);
        assert.equal(restored.installationText, fresh.installationText, 'Restore preserves the destination installation authority');
        assert.equal(restored.providerText, providerText, 'Restore preserves local provider configuration');
        assert.equal(restored.legacyText, fresh.legacyText);
        assert.equal(restored.driftText, fresh.driftText);
        const reloaded = await reload(destination);
        assert.deepEqual(reloaded.record, backup.record);
        assert.deepEqual(reloaded.archive, backup.archive);
        await destination.locator('#tray').click();
        assert.match(await destination.locator('.view-title').textContent(), /2/u);
        await destination.screenshot({ path: resolve(caseOut, 'restored.png'), fullPage: true });
        details.download = 'synthetic-record.json';
        details.sourceDatabaseName = initial.installation.databaseName;
        details.destinationDatabaseName = restored.installation.databaseName;
      });

      for (const mode of ['quota', 'uncertain']) {
        for (const action of ['capture', 'read-finish']) {
          await test(`${mode}-target-commit-keeps-${action}-ui-unpublished`, async ({ page, details }) => {
            const initial = await boot(page);
            const root = action === 'capture' ? 'taken' : 'readDone';
            const id = action === 'capture' ? await openCapture(page) : await openReading(page);
            const before = await disk(page);
            await armFault(page, mode, root);
            await page.locator(action === 'capture' ? '#sheet #take' : '#read-fin').click();
            await page.waitForFunction(() => window.__recordLiveFault?.fired === true);
            await page.locator('#store-alert').waitFor({ state: 'visible' });
            if (action === 'capture') {
              assert.equal(await page.locator('#sheet #take').getAttribute('aria-pressed'), 'false', 'Unconfirmed capture cannot publish its pressed state');
              assert.equal(await page.locator('#sheet .list-picker').count(), 0, 'Unconfirmed capture cannot open its success drawer');
            } else {
              assert.equal(await page.locator('#read-fin').evaluate((node) => node.classList.contains('finished')), false, 'Unconfirmed completion cannot show a finished mark');
            }
            const fault = await faultState(page);
            assert.equal(fault.fired, true);
            if (mode === 'uncertain') {
              assert.equal(fault.completed, true, 'The native target transaction completed durably');
              assert(fault.blockedReads > 0, 'Only its post-commit acknowledgement was lost');
            }
            await page.evaluate(() => window.__recordLiveFault.disarm());
            const after = await disk(page);
            if (mode === 'quota') {
              assert.deepEqual(after.record[root], before.record[root]);
              assert.equal(hostCommands(after).length, hostCommands(before).length, 'Aborted native transaction leaves no command receipt');
            } else {
              assert.equal(hostCommands(after).length, hostCommands(before).length + 1, 'Uncertain transaction committed exactly once');
              if (action === 'capture') assert.equal(after.record.taken.filter((item) => item.id === id).length, 1);
              else assert(Number.isFinite(after.record.readDone[id]));
            }
            preserved(after);
            assert.equal(after.legacyText, initial.legacyText);
            assert.equal(after.driftText, initial.driftText);
            const reloaded = await reload(page);
            assert.deepEqual(reloaded.record[root], after.record[root]);
            assert.equal(hostCommands(reloaded).length, hostCommands(after).length, 'Reload never retries an unconfirmed command');
            if (action === 'read-finish') {
              await openReading(page, id);
              assert.equal(await page.locator('#read-fin').evaluate((node) => node.classList.contains('finished')), mode === 'uncertain');
            } else {
              await page.locator('#tray').click();
              assert.match(await page.locator('.view-title').textContent(), mode === 'uncertain' ? /2/u : /1/u);
            }
            details.fault = fault;
            details.id = id;
            details.expectedDurable = mode === 'uncertain';
          });
        }
      }
    } finally {
      await browser.close();
      assert.equal(verifyBundledArtifact(SITE).artifactSha256, artifact.artifactSha256, 'Tested runtime stayed immutable');
      const receipt = {
        suite: 'record-live', site: SITE, startedAt, finishedAt: new Date().toISOString(),
        browser: { name: engine, version: browser.version() },
        artifactSha256: artifact.artifactSha256, verifierSha256,
        runtimeAssets: ['corridor.js', 'drift-layer.js', 'record-app.mjs', 'record-host.mjs', 'record-controller.mjs', 'record-binding.mjs', 'modules/record-core.mjs'].map((path) => manifest.files.find((file) => file.path === path)),
        results, failures: results.filter((result) => result.status !== 'passed').length,
        pageErrors: errors, blockedExternalRequests: network, externalRequestsSent: 0,
        limitation: 'Synthetic isolated origins and desktop browser input; no live operator data, physical mobile gesture, cross-device sync or live provider acceptance.',
      };
      writeFileSync(resolve(engineOut, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
      all.push(receipt);
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
const failures = all.reduce((sum, receipt) => sum + receipt.failures, 0);
const count = all.reduce((sum, receipt) => sum + receipt.results.length, 0);
assert(count > 0, 'At least one requested actual app journey must run');
writeFileSync(resolve(OUT, 'receipt.json'), `${JSON.stringify({ suite: 'record-live', site: SITE, artifactSha256: artifact.artifactSha256, verifierSha256, cases: count, failures, engines: all.map((receipt) => ({ name: receipt.browser.name, failures: receipt.failures })) }, null, 2)}\n`);
process.stdout.write(`Actual record app journeys: ${count - failures}/${count} passed.\n`);
process.exitCode = failures ? 1 : 0;
