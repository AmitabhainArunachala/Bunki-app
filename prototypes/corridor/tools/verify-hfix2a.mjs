/** Hfix-2a: immutable build, one engine, exact positive contracts and routed
 * negative controls. Base/control runs require each intended assertion red. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';
import { restoreAppFixture, selectBackupFile } from './record-fixture-support.mjs';
import { openShelfDoor } from './shelf-tools-support.mjs';

const engine = process.env.KAIRO_BROWSER;
assert(['webkit', 'chromium'].includes(engine), 'Choose exactly one engine');
const mode = process.env.HFIX2A_MODE || 'branch';
assert(['base', 'branch', 'control'].includes(mode));
const only = process.env.HFIX2A_CASE;
const out = resolveCorridorEvidence(); mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const browser = await ({ webkit, chromium }[engine]).launch();
const version = browser.version();
const viewport = engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const results = []; const mutations = [];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const load = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const identity = JSON.parse(readFileSync(join(process.env.KAIRO_SITE_DIR, 'build-identity.json'), 'utf8'));
const file = (backup) => ({ name: 'hfix2a-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !document.documentElement.dataset.roomTransition);
  await page.evaluate(() => document.fonts.ready);
}
async function boot(page) { await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`); await ready(page); }
async function context(row) {
  const ctx = await browser.newContext({ viewport, hasTouch: engine === 'webkit', deviceScaleFactor: 2,
    isMobile: engine === 'webkit', serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', (error) => errors.push(String(error)));
  if (mode === 'control') await page.route('**/corridor.js', async (route) => {
    const response = await route.fetch(); const original = await response.text(); let changed = original;
    if (row === 'X11') changed = changed.replace("openSlip({ t: 'word', id: c.key, reading: c.reading }", "openSlip({ t: 'word', id: c.reading, reading: c.reading }");
    if (row === 'X16') changed += `\nconst badTabs=document.createElement('style');badTabs.textContent='.primary-tabs[data-wrapped] {display:grid!important;grid-template-columns:repeat(5,1fr)!important;height:60px!important;min-height:60px!important}.primary-tabs .primary-tab {min-width:0!important;padding:0!important}.primary-tabs .primary-tab-label {white-space:nowrap!important}';document.head.append(badTabs);`;
    if (row === 'KT2') changed = changed.replace('if (shown < hits.length) {', 'if (false && shown < hits.length) {');
    if (row === 'M1') changed = changed.replace('adoption = true;', "throw Object.assign(new Error('ownership-mismatch'), {code:'ownership-mismatch'});");
    assert.notEqual(changed, original, `Mutation ${row} must fire`);
    mutations.push({ row, original: sha(original), served: sha(changed) });
    await route.fulfill({ response, body: changed });
  });
  return { ctx, page, errors };
}
async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `${engine}-${mode}-${name}.png`) });
}
async function row(name, body) {
  if (only && only !== name) return;
  const session = await context(name); const before = load(); let passed = false; let error = null; let detail;
  try { await boot(session.page); detail = await body(session); assert.deepEqual(session.errors, []); passed = true; }
  catch (problem) { error = String(problem.stack || problem); await shot(session.page, `${name}-failure`).catch(() => {}); }
  finally { await session.ctx.close(); }
  results.push({ name, pass: passed, detail, error, before, after: load() });
  console.log(`${name}: ${passed ? 'PASS' : 'FAIL'}${error ? ` ${error.split('\n')[0]}` : ''}`);
}
async function openWords(page, word) {
  await page.evaluate((word) => window.openWordWeb(word, { type: 'word' }), word);
  await page.locator('.ww-c-glyph').waitFor(); await ready(page);
  // The existing headword entrance is composited. Wait for its completion before
  // testing the newly navigated reading's hit target (the reading itself is stable).
  await page.locator('.ww-c-glyph').evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function slip(page, word) {
  await page.waitForFunction(() => !!document.querySelector('#mini .mini-word'), null, { timeout: 3000 }).catch(() => {});
  const facts = await page.evaluate(() => ({ word: document.querySelector('#mini .mini-word')?.textContent.trim(), reading: document.querySelector('#mini .mini-reading')?.textContent.trim(),
    text: document.querySelector('#mini')?.textContent, disabled: document.querySelector('#mini-take')?.disabled }));
  assert.equal(facts.word, word, 'X11: reading opens its listed owner');
  assert.equal(facts.disabled, false, 'X11: Save enabled');
  assert.equal(facts.reading, word === '元気' ? 'げんき' : 'はし', 'X11: selected reading preserved');
  await page.locator('#mini').waitFor({ state: 'visible' });
  assert(!/No dictionary entry/u.test(facts.text), 'X11: no false absence'); return facts;
}
async function closeSlip(page) { await page.keyboard.press('Escape'); await page.locator('#mini').waitFor({ state: 'detached' }); }
async function tray(page) {
  if (!await page.locator('#import-file').count()) await page.locator('#tray').click();
  await page.locator('#import-file').waitFor({ state: 'attached' }); await ready(page);
}
async function syntheticJournal(page) {
  return JSON.parse(await page.evaluate(async () => {
    const core = await import('./modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: `hfix2a-source:${crypto.randomUUID()}`, policy,
      actor: { deviceId: 'hfix2a-donor', incarnationId: crypto.randomUUID() } });
    try {
      await store.commitLocal({ changeId: 'hfix2a-original-note', binding: policy.binding, expectedRevision: (await store.snapshot()).revision,
        occurredAt: '2026-10-19T01:00:00.000Z', mutations: [], operations: [{ dependencies: [], payload: {
          kind: 'note.version', noteId: 'hfix2a-note', versionId: 'hfix2a-note-v1', generation: null, supersedes: [],
          segments: [{ kind: 'original', text: 'Keep this complete original note across phones.' }],
        } }] });
      return JSON.stringify(core.exportOperationJournal((await store.snapshot()).replica));
    } finally { await store.close(); }
  }));
}
async function exportBackup(page, suffix) {
  await tray(page); const downloading = page.waitForEvent('download'); await page.locator('#export-store').click();
  const download = await downloading; const path = join(out, `backup-${suffix}.json`); await download.saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function adoptionSafety(backup) {
  const checks = [];
  // A cancelled confirmation cannot change either identity or data.
  const cancelled = await context('M1');
  try {
    await boot(cancelled.page); await tray(cancelled.page);
    const before = await readAppRecordSnapshot(cancelled.page); let confirmations = 0;
    cancelled.page.on('dialog', async (dialog) => {
      assert.match(dialog.message(), /empty browser will adopt the backup’s learner/u); confirmations += 1; await dialog.dismiss();
    });
    await cancelled.page.locator('#import-file').setInputFiles(file(backup));
    await cancelled.page.waitForFunction(() => !document.querySelector('#import-file').value);
    assert.equal(confirmations, 1); assert.deepEqual(await readAppRecordSnapshot(cancelled.page), before);
    checks.push('cancel-preserves-record-and-binding');
  } finally { await cancelled.ctx.close(); }
  // Retained source text and external deck progress are activity even when
  // portable roots still equal the defaults. These bytes are never imported.
  for (const kind of ['source-draft', 'deck-ledger', 'malformed-backup']) {
    const refused = await context('M1');
    try {
      await boot(refused.page); await tray(refused.page);
      if (kind !== 'malformed-backup') await refused.page.evaluate((kind) => {
        const db = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')).databaseName;
        localStorage.setItem(kind === 'source-draft' ? `kairo-source-capture-draft-v1:${db}` : 'bunki-cloze:hfix2a', 'synthetic retained activity');
      }, kind);
      const before = await readAppRecordSnapshot(refused.page);
      const submitted = structuredClone(backup); if (kind === 'malformed-backup') submitted.record.obslog.push([1700000000999, 'note', 'op', 'tampered']);
      await selectBackupFile(refused.page, file(submitted));
      assert.match(await refused.page.locator('#record-portability-status').textContent(), kind === 'malformed-backup' ? /Import could not finish/u : /different learner/u);
      assert.deepEqual(await readAppRecordSnapshot(refused.page), before); checks.push(kind);
    } finally { await refused.ctx.close(); }
  }
  for (const boundary of [-1, 0, 1, 2]) {
    const interrupted = await context('M1'); const page = interrupted.page;
    try {
      let fired = 0;
      await page.route('**/record-binding.mjs', async (route) => {
        const response = await route.fetch(); const original = await response.text();
        const needle = boundary === -1 ? 'await recoverLocalRecordAdoption({ storage, assertOwner: guard });' : 'storage.setItem(ADOPTION_KEYS[i], intent.after[i]);';
        assert.equal(original.split(needle).length, 2, 'Exact interruption seam');
        const pause = `window.__hfixAdoptionPaused = ${boundary}; await new Promise(() => {});`;
        const changed = original.replace(needle, boundary === -1 ? `${pause}\n${needle}` : `${needle}\nif (i === ${boundary}) { ${pause} }`);
        fired += 1; mutations.push({ row: `M1-interrupt-${boundary}`, original: sha(original), served: sha(changed) });
        await route.fulfill({ response, body: changed });
      });
      await boot(page); await tray(page); const old = await readAppRecordSnapshot(page);
      page.on('dialog', async (dialog) => { assert.match(dialog.message(), /empty browser will adopt/u); await dialog.accept(); });
      await page.locator('#import-file').setInputFiles(file(backup));
      await page.waitForFunction((boundary) => window.__hfixAdoptionPaused === boundary, boundary);
      assert.equal(fired, 1);
      const crossing = await page.evaluate(() => ({ intent: JSON.parse(localStorage.getItem('kairo-local-record-adoption-v1')),
        keys: ['kairo-corridor-v1', 'bunki-drift-v1', 'kairo-local-record-binding-v1'].map((key) => localStorage.getItem(key)) }));
      assert.deepEqual(crossing.keys, crossing.intent.before.map((value, i) => i <= boundary ? crossing.intent.after[i] : value));
      await page.close();
      const resumed = await interrupted.ctx.newPage(); resumed.setDefaultTimeout(15000); await boot(resumed);
      const restored = await readAppRecordSnapshot(resumed);
      assert.deepEqual(restored.record, backup.record); assert.deepEqual(restored.archive, backup.archive);
      assert.equal(await resumed.evaluate(() => localStorage.getItem('kairo-local-record-adoption-v1')), null);
      const oldRows = await resumed.evaluate(async (name) => {
        const db = await new Promise((done, fail) => { const q = indexedDB.open(name); q.onsuccess = () => done(q.result); q.onerror = () => fail(q.error); });
        try { return await new Promise((done, fail) => { const tx = db.transaction('kairo_replication_rows'); const q = tx.objectStore('kairo_replication_rows').getAll(); tx.oncomplete = () => done(q.result); tx.onabort = () => fail(tx.error); }); }
        finally { db.close(); }
      }, old.installation.databaseName);
      assert.deepEqual(oldRows, old.rows, 'Retired database is intact after recovery');
      assert.deepEqual((await exportBackup(resumed, `recovery-${boundary}`)).journal, backup.journal);
      checks.push(`interruption-prefix-${boundary + 1}`);
    } finally { await interrupted.ctx.close(); }
  }
  return checks;
}
try {
  await row('X11', async ({ page }) => {
    await openWords(page, '元気'); const readings = [];
    for (const selector of ['.ww-marks dd', '.ww-c-r']) {
      const reading = selector === '.ww-c-r' ? page.locator(selector) : page.locator('.ww-marks').getByText('げんき', { exact: true });
      await reading.first().click();
      readings.push(await slip(page, '元気')); await shot(page, `X11-${readings.length}`); await closeSlip(page);
    }
    await openWords(page, '橋');
    await page.locator('.ww-c-r').click(); await slip(page, '橋'); await closeSlip(page);
    await page.locator('.ww-reading-choice').first().waitFor();
    const choices = await page.locator('.ww-reading-choice').evaluateAll((nodes) => nodes.map((n) => ({ seq: n.dataset.seq, text: n.textContent })));
    for (const [seq, word] of [['1237410', '橋'], ['1476410', '箸'], ['1565560', '嘴'], ['1581610', '端']]) {
      assert(choices.some((item) => item.seq === seq && item.text.includes(word)), `X11: reachable homophone ${word}`);
      await page.locator(`.ww-reading-choice[data-seq='${seq}']`).click(); await slip(page, word); await closeSlip(page);
    }
    return { readings, choices };
  });
  await row('X16', async ({ page }) => {
    const measurements = [];
    for (const language of ['bi', 'ja']) {
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=${language}`); await ready(page);
    for (const width of [...new Set([viewport.width, 390, 320])]) {
      await page.setViewportSize({ width, height: viewport.height });
      // Text-only enlargement doubles actual type without shrinking labels.
      await page.evaluate(() => {
        for (const button of document.querySelectorAll('.primary-tab')) {
          button.style.fontSize = ''; button.style.fontSize = `${parseFloat(getComputedStyle(button).fontSize) * 2}px`;
        }
      });
      await page.waitForTimeout(180);
      const facts = await page.locator('#primary-tabs').evaluate((nav) => {
        const bounds = (node) => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
        return { bar: bounds(nav), wrapped: nav.dataset.wrapped, labels: [...nav.querySelectorAll('.primary-tab')].map((button) => {
          const label = button.querySelector('.primary-tab-label'); const range = document.createRange();
          range.selectNodeContents(label || [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE));
          const r = range.getBoundingClientRect(); return { text: label?.textContent || button.textContent, font: getComputedStyle(button).fontSize,
            left: r.left, right: r.right, top: r.top, bottom: r.bottom, button: bounds(button) };
        }) };
      });
      await shot(page, `X16-${language}-${width}`); assert.equal(facts.labels.length, 5, 'X16: all five destination words');
      for (const [i, label] of facts.labels.entries()) {
        assert(label.left >= -1 && label.right <= width + 1 && label.top >= facts.bar.top - 1 && label.bottom <= facts.bar.bottom + 1, `X16: unclipped ${label.text}`);
        assert(label.left >= label.button.left - 1 && label.right <= label.button.right + 1, `X16: unclipped inside button ${label.text}`);
        for (const other of facts.labels.slice(i + 1)) assert(!(label.left < other.right - 1 && label.right > other.left + 1 && label.top < other.bottom - 1 && label.bottom > other.top + 1), `X16: separate ${label.text}/${other.text}`);
      }
      measurements.push({ language, width, ...facts });
    }
    }
    return measurements;
  });
  await row('KT2', async ({ page }) => {
    await openShelfDoor(page, '#yoji-link'); await page.locator('[data-yoji]').first().waitFor();
    const data = await page.evaluate(async () => (await (await fetch('./data/share_alike/idioms.json')).json()));
    const idioms = data.idioms.filter((i) => i.yoji).sort((a, b) => a.r < b.r ? -1 : a.r > b.r ? 1 : 0);
    assert(idioms.length > 80, 'KT2: full pinned population'); assert.equal(await page.locator('[data-yoji]').count(), 80);
    await shot(page, 'KT2-before-expand'); assert.equal(await page.locator('#yoji-show-all').count(), 1, 'KT2: continuation exists');
    await page.locator('#yoji-show-all').click();
    assert.deepEqual(await page.locator('[data-yoji]').evaluateAll((nodes) => nodes.map((n) => n.dataset.yoji)), idioms.map((i) => i.w), 'KT2: every counted idiom in order');
    for (const index of [80, idioms.length - 1]) {
      const word = idioms[index].w; const target = page.locator(`[data-yoji='${word}']`);
      await target.scrollIntoViewIfNeeded(); const y = await page.evaluate(() => scrollY);
      await target.click(); await page.locator('#sheet').waitFor(); assert((await page.locator('#sheet').textContent()).includes(word));
      await page.locator('#sheet-back').click(); await page.locator('#sheet').waitFor({ state: 'detached' });
      await page.waitForFunction((word) => document.activeElement?.dataset.yoji === word, word);
      assert.equal(await page.locator('[data-yoji]').count(), idioms.length);
      assert(Math.abs(await page.evaluate(() => scrollY) - y) < 3, 'KT2: Back restores scroll');
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.yoji), word, 'KT2: Back restores row focus');
    }
    await shot(page, 'KT2-all-last');
    await page.locator('#yoji-filter').fill('一');
    await page.locator('#yoji-show-all').waitFor(); await page.locator('#yoji-show-all').click();
    const filtered = idioms.filter((i) => i.w.includes('一') || i.r.includes('一'));
    assert(filtered.length > 80); assert.equal(await page.locator('[data-yoji]').count(), filtered.length);
    await page.locator('[data-lang="ja"]').click(); await ready(page);
    assert.equal(await page.locator('#yoji-filter').inputValue(), '一', 'KT2: query survives room rerender');
    assert.equal(await page.locator('[data-yoji]').count(), filtered.length, 'KT2: expansion survives room rerender');
    const last = page.locator('[data-yoji]').last(); await last.scrollIntoViewIfNeeded(); const y = await page.evaluate(() => scrollY);
    await last.click(); await page.locator('#sheet').waitFor(); await page.locator('#sheet-back').click();
    await page.waitForFunction((word) => document.activeElement?.dataset.yoji === word, filtered.at(-1).w);
    assert(Math.abs(await page.evaluate(() => scrollY) - y) < 3, 'KT2: Back restores filtered scroll');
    assert.equal(await page.locator('#yoji-filter').inputValue(), '一');
    return { count: idioms.length, row81: idioms[80].w, last: idioms.at(-1).w, filtered: filtered.length };
  });
  await row('M1', async ({ page }) => {
    const initial = await readAppRecordSnapshot(page); const journal = await syntheticJournal(page);
    const record = { ...initial.record, taken: [{ t: 'word', id: '元気', ts: 1700000000000 }],
      lists: { Journey: [{ t: 'word', id: '元気', ts: 1700000000000 }] }, obslog: [[1700000000001, 'note', 'op', 'A retained note for the next phone.']] };
    const turns = [{ id: 'hfix2a-conversation', surface: 'chat', role: 'user', content: 'Original conversation '.repeat(40), ts: 1700000000002 }];
    await restoreAppFixture(page, record, { archive: turns, journal }); const backup = await exportBackup(page, 'donor');
    assert.equal(backup.version, 2); assert.equal(backup.journal.operations.length, 1);
    const destination = await context('M1');
    try {
      await boot(destination.page); await tray(destination.page); const empty = await readAppRecordSnapshot(destination.page);
      const pointer = await destination.page.evaluate(() => localStorage.getItem('kairo-local-record-binding-v1'));
      const confirmations = []; destination.page.on('dialog', (dialog) => confirmations.push(dialog.message()));
      await shot(destination.page, 'M1-before'); await selectBackupFile(destination.page, file(backup));
      await destination.page.waitForFunction((old) => localStorage.getItem('kairo-local-record-binding-v1') !== old ||
        !!document.querySelector('#record-portability-status')?.textContent, pointer);
      const status = await destination.page.evaluate(() => document.querySelector('#record-portability-status')?.textContent || '');
      await shot(destination.page, 'M1-result');
      assert(!status, `M1: fresh browser accepts backup (${status})`); await ready(destination.page);
      assert.equal(confirmations.length, 1, 'M1: explicit confirmation required');
      assert.match(confirmations[0], /empty browser will adopt the backup’s learner/u);
      const restored = await readAppRecordSnapshot(destination.page);
      assert.deepEqual(restored.record, backup.record, 'M1: exact portable roots'); assert.deepEqual(restored.archive, backup.archive, 'M1: full conversation bytes');
      assert.equal(restored.installation.binding.accountId, initial.installation.binding.accountId, 'M1: adopt account');
      assert.equal(restored.installation.binding.learnerId, initial.installation.binding.learnerId, 'M1: adopt learner');
      assert.notEqual(restored.installation.binding.sessionId, initial.installation.binding.sessionId);
      assert.notDeepEqual(restored.installation.actor, initial.installation.actor);
      assert.notEqual(restored.installation.databaseName, empty.installation.databaseName);
      const exported = await exportBackup(destination.page, 'restored'); assert.deepEqual(exported.journal, backup.journal, 'M1: operation history identities');
      await shot(destination.page, 'M1-after'); await destination.page.reload(); await ready(destination.page);
      assert.equal((await readAppRecordSnapshot(destination.page)).installation.databaseName, restored.installation.databaseName);
      assert.deepEqual(destination.errors, []);
    } finally { await destination.ctx.close(); }
    const occupied = await context('M1');
    try {
      await boot(occupied.page); const own = await readAppRecordSnapshot(occupied.page);
      await restoreAppFixture(occupied.page, { ...own.record, obslog: [[1700000000003, 'note', 'op', 'My local work must survive.']] });
      await tray(occupied.page); const before = await readAppRecordSnapshot(occupied.page);
      await selectBackupFile(occupied.page, file(backup));
      await occupied.page.waitForFunction(() => /This backup belongs to a different learner/u.test(document.querySelector('#record-portability-status')?.textContent || ''));
      assert.match(await occupied.page.locator('#record-portability-status').textContent(), /This backup belongs to a different learner/u);
      assert.deepEqual(await readAppRecordSnapshot(occupied.page), before, 'M1: local-activity refusal preserves every byte');
      assert.deepEqual(occupied.errors, []);
    } finally { await occupied.ctx.close(); }
    const safety = mode === 'branch' ? await adoptionSafety(backup) : [];
    return { words: backup.record.taken.length, conversationBytes: backup.archive.turns[0].content.length, operations: backup.journal.operations.length, occupiedRefused: true, safety };
  });
} finally {
  await browser.close(); await host.close();
  writeFileSync(join(out, 'result.json'), JSON.stringify({ engine, version, viewport, mode, identity,
    verifierSha256: sha(readFileSync(new URL(import.meta.url))), results, mutations }, null, 2));
}
const expected = mode === 'branch';
const intended = { X11: /X11: reading opens/, X16: /X16: (unclipped|separate)/, KT2: /KT2: continuation exists/, M1: /M1: fresh browser accepts backup/ };
process.exitCode = results.length > 0 && results.every((r) => r.pass === expected && (expected || intended[r.name].test(r.error))) ? 0 : 1;
