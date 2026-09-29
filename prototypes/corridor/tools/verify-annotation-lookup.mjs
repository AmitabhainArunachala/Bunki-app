/** Shared lookup/list integration over one immutable Corridor artifact.
 * A server-only export shim exposes existing functions without replacing their
 * implementations. Synthetic anchors and deliberate native IDB faults are
 * fixture inputs; all saved learner records are read from the actual database.
 * This verifies behavior, not editorial correctness or a production release.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, waitForAppRecord, armRecordWriteFailure, clearRecordWriteFailure } from './record-test-support.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = readFileSync(resolve(site, 'corridor.js'));
const expose = ['S', 'D', 'openJapaneseLookup', 'appendJapaneseLookup', 'enhanceJapaneseProse',
  'openVocabularyListChooser', 'showMini', 'removeMini', 'ensureDictionaryRowsForForm',
  'toggleTaken', 'wordCaptureState', 'wordCardIdentity', 'recordWritable'];
const shim = '\nObject.defineProperty(window,"annotationFixture",{value:{' + expose.map(name => `get ${name}(){return ${name}}`).join(',') + '}});\n';
const fixture = Buffer.concat([original, Buffer.from(shim)]);
const sourceFiles = new Map(identity.files.map(file => [file.path, file.sha256]));
assert.equal(sha(original), sourceFiles.get('corridor.js'));
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)));
const host = await startStaticHost({ site, port: 0 });
const results = [], failures = [];
const state = page => readAppRecordSnapshot(page);
const targetRows = record => ({ taken: record.taken, srs: record.srs, revlog: record.revlog, deepWords: record.deepWords });

async function openLookup(page, text = '電車') {
  await page.evaluate(async text => {
    window.annotationFixture.removeMini();
    document.getElementById('annotation-anchor')?.remove();
    const anchor = document.createElement('button'); anchor.id = 'annotation-anchor'; anchor.textContent = text;
    anchor.style.cssText = 'position:fixed;left:120px;top:150px';
    document.body.append(anchor);
    await window.annotationFixture.openJapaneseLookup(anchor, text);
  }, text);
  await page.locator('#mini').waitFor();
}
async function chooser(page, text = '電車') {
  await openLookup(page, text); await page.locator('#mini-take').click();
  await page.locator('#vocabulary-list-dialog[open]').waitFor();
}
async function createList(page, name) {
  await page.locator('#vocabulary-list-dialog .search-field').fill(name);
  await page.locator('#vocabulary-list-dialog [type="submit"]').click();
}
async function closeChooser(page) {
  await page.locator('#vocabulary-list-dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('#vocabulary-list-dialog').waitFor({ state: 'detached' });
}
const member = (record, list, word) => record.lists?.[list]?.some(row => row.t === 'word' && row.id === word);
const cases = [
  ['list-new-existing-and-retained-card', async page => {
    await chooser(page); await createList(page, 'Morning Japanese');
    await waitForAppRecord(page, record => member(record, 'Morning Japanese', '電車'));
    const enrolled = await state(page);
    assert.equal(enrolled.record.taken.filter(row => row.t === 'word' && row.id === '電車').length, 1);
    await page.locator('.vocabulary-list-choices').getByRole('button', { name: 'Save for review', exact: true }).click();
    assert.deepEqual(targetRows((await state(page)).record), targetRows(enrolled.record), 'Saving an already enrolled card must not unenroll or reset it');
    await createList(page, 'Evening Japanese');
    await waitForAppRecord(page, record => member(record, 'Evening Japanese', '電車'));
    assert.deepEqual(targetRows((await state(page)).record), targetRows(enrolled.record));
    await closeChooser(page);
    await chooser(page, '駅');
    await page.locator('.vocabulary-list-choices').getByRole('button', { name: 'Morning Japanese', exact: true }).click();
    const withStation = await waitForAppRecord(page, record => member(record, 'Morning Japanese', '駅'));
    assert(member(withStation, 'Morning Japanese', '電車'));
    const beforeReload = await state(page);
    await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
    const afterReload = await state(page);
    assert.deepEqual(afterReload.record.lists, beforeReload.record.lists, 'List membership survives a full document reload');
    assert.deepEqual(targetRows(afterReload.record), targetRows(beforeReload.record));
    assert.deepEqual(afterReload.installation, beforeReload.installation);
  }],
  ['failed-list-write-is-honest-and-recoverable', async page => {
    await chooser(page);
    await page.locator('.vocabulary-list-choices').getByRole('button', { name: 'Save for review', exact: true }).click();
    await waitForAppRecord(page, record => record.taken.some(row => row.id === '電車'));
    const before = await state(page);
    await armRecordWriteFailure(page, 'abort', { roots: ['lists'] });
    await createList(page, 'Retry this list');
    await page.waitForFunction(() => /retry|could not|not ready/i.test(document.querySelector('.vocabulary-list-status')?.textContent || ''));
    assert.equal(await page.locator('.vocabulary-list-form input').inputValue(), 'Retry this list');
    assert.deepEqual((await state(page)).record, before.record, 'Failed list commit cannot claim or keep an optimistic membership');
    const fault = await clearRecordWriteFailure(page); assert(fault.fired > 0, 'The native transaction fault must actually fire');
    assert.equal(await page.locator('.vocabulary-list-form [type="submit"]').isDisabled(), false);
    // Record failures can require explicit recovery. The modal must remain
    // dismissible so the real store recovery control can be reached.
    await closeChooser(page);
    if (await page.locator('#record-reload').isVisible()) {
      await page.locator('#record-reload').click(); await page.waitForFunction(() => document.body.dataset.ready === '1');
    }
    assert(await page.evaluate(() => window.annotationFixture.recordWritable()), 'Record can recover after the native fault is removed');
    await chooser(page); await createList(page, 'Retry this list');
    await waitForAppRecord(page, record => member(record, 'Retry this list', '電車'));
    assert.deepEqual(targetRows((await state(page)).record), targetRows(before.record));
  }],
  ['exact-entry-mini-and-conflict-protection', async page => {
    await page.evaluate(async () => {
      const f = window.annotationFixture;
      await f.ensureDictionaryRowsForForm('上手');
      const anchor = document.createElement('button'); anchor.id = 'annotation-anchor'; anchor.textContent = '上手';
      anchor.style.cssText = 'position:fixed;left:120px;top:150px'; document.body.append(anchor);
      f.showMini(anchor, { s: '上手', b: '上手', r: 'うわて', seq: '1580400', c: true }, () => {});
    });
    assert.equal(await page.locator('#mini .mini-reading').textContent(), 'うわて', 'The explicit JMdict entry must survive the quick look');
    assert.match(await page.locator('#mini .mini-gloss').textContent(), /upper part/);
    await page.locator('#mini-take').click(); await createList(page, 'Exact reading');
    const saved = await waitForAppRecord(page, record => member(record, 'Exact reading', '上手'));
    const card = saved.taken.find(row => row.id === '上手');
    assert.equal(card.entrySeq, '1580400'); assert.equal(card.cueReading, 'うわて');
    await closeChooser(page);
    const before = await state(page);
    await openLookup(page, '上手');
    assert.equal(await page.locator('#mini .mini-reading').textContent(), 'じょうず');
    assert.equal(await page.locator('#mini-take').isDisabled(), true, 'The different core homograph cannot overwrite the existing card');
    // Also exercise the chooser’s own guard; a stale caller cannot bypass it.
    await page.evaluate(() => window.annotationFixture.openVocabularyListChooser({ t: 'word', id: '上手' }, '上手', document.getElementById('annotation-anchor')));
    await createList(page, 'Wrong homograph');
    assert.match(await page.locator('.vocabulary-list-status').textContent(), /different|another|reading|entry|saved|cannot|not/i);
    assert.deepEqual((await state(page)).record, before.record);
  }],
  ['assistance-commit-precedes-hints', async page => {
    await page.evaluate(() => {
      window.annotationFixture.removeMini();
      const host = document.createElement('p'); host.id = 'assistance-fixture'; document.body.append(host);
      window.annotationGate = { calls: 0 };
      window.annotationFixture.appendJapaneseLookup(host, '電車', { itemId: 'fixture:item', beforeOpen: () => {
        window.annotationGate.calls += 1;
        return new Promise(resolve => { window.annotationGate.resolve = resolve; });
      } });
    });
    const word = page.locator('#assistance-fixture [data-lookup-text="電車"]');
    await word.click(); await page.waitForFunction(() => window.annotationGate.calls === 1);
    assert.equal(await page.locator('#mini').count(), 0, 'No hint may appear while assistance persistence is pending');
    await page.evaluate(() => window.annotationGate.resolve(false));
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#mini').count(), 0, 'Rejected assistance cannot reveal a hint');
    await word.click(); await page.waitForFunction(() => window.annotationGate.calls === 2);
    await page.evaluate(() => {
      const old = document.querySelector('#assistance-fixture [data-lookup-text="電車"]');
      const replacement = old.cloneNode(true); old.replaceWith(replacement);
      window.annotationGate.resolve(true);
    });
    await page.locator('#mini').waitFor();
    assert.equal(await page.locator('#mini .mini-reading').textContent(), 'でんしゃ');
  }],
  ['skip-search-stroke-door', async page => {
    await page.locator('#chrome-search').click();
    await page.locator('#nav-search-input').fill('1-3-8');
    await page.locator('.skip-hit').first().click();
    await page.locator('#strokes-door').waitFor();
    const diagnostic = await page.evaluate(() => {
      const old = document.querySelector('#sheet button[aria-label*="stroke order"], #sheet button[aria-label*="筆順"]');
      const current = document.getElementById('strokes-door');
      return { oldSelector: old && { id: old.id, className: old.className, label: old.getAttribute('aria-label') },
        strokeDoor: { id: current.id, label: current.getAttribute('aria-label') } };
    });
    await page.locator('#strokes-door').click();
    await page.locator('#stroke-page #stroke-speed-range').waitFor();
    const range = page.locator('#stroke-speed-range');
    assert.equal(await range.count(), 1); assert.equal(await range.inputValue(), '1');
    assert.equal(await range.getAttribute('min'), '0'); assert.equal(await range.getAttribute('max'), '2');
    assert.equal(await page.locator('#stroke-speed, #stroke-slow').count(), 0);
    return diagnostic;
  }],
  ['shelf-filters-match-and-survive-navigation', async page => {
    const readings = await page.evaluate(() => window.annotationFixture.D.passages
      .filter(row => !String(row.file || '').startsWith('archive/'))
      .map(row => ({ id: row.id, title: row.title, titleEn: row.titleEn || '', snippet: row.snippet || '', facets: row.readingFacets || {}, basedOn: row.adaptation?.basedOn || null })))
      // one card per story (design pass 2026-09-30): an N3 rewrite whose original stands on the
      // shelf is that story's やさしい版 inside the article, not a card of its own
      .then(rows => rows.filter(row => !(row.basedOn && rows.some(other => other.id === row.basedOn))));
    const topic = ['science', 'culture', 'news', 'society'].find(topic => {
      const matches = readings.filter(row => row.facets.topics?.includes(topic));
      return matches.length > 0 && matches.length < readings.length;
    });
    assert(topic, 'The staged library must supply at least one bounded topic fixture');
    const expected = readings.filter(row => row.facets.topics?.includes(topic));
    const ids = () => page.locator('#shelf-reading-results > [data-passage]').evaluateAll(rows => rows.map(row => row.dataset.passage));
    await page.locator('#shelf-filter-topic').focus();
    await page.locator('#shelf-filter-topic').selectOption(topic);
    await page.waitForFunction(topic => document.getElementById('shelf-filter-topic')?.value === topic &&
      document.activeElement?.id === 'shelf-filter-topic', topic);
    assert.deepEqual((await ids()).sort(), expected.map(row => row.id).sort(), 'Topic change must rerender the actual matches, not just update the select');
    await page.locator('#shelf-filter-sort').selectOption('title');
    const sorted = [...expected].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    assert.deepEqual(await ids(), sorted.map(row => row.id));
    const chosen = sorted[0];
    await page.locator('#shelf-reading-search').fill(chosen.title);
    await page.locator('#shelf-reading-search').press('Enter');
    const textExpected = sorted.filter(row => `${row.title} ${row.titleEn} ${row.snippet} ${(row.facets.topics || []).join(' ')}`.toLocaleLowerCase().includes(chosen.title.toLocaleLowerCase()));
    assert.deepEqual(await ids(), textExpected.map(row => row.id));
    await page.locator('#shelf-reading-results .shelf-open').first().click();
    await page.waitForFunction(() => document.body.dataset.view === 'reader');
    await page.locator('#back').click();
    await page.locator('#shelf-filter-topic').waitFor();
    assert.equal(await page.locator('#shelf-filter-topic').inputValue(), topic);
    assert.equal(await page.locator('#shelf-filter-sort').inputValue(), 'title');
    assert.equal(await page.locator('#shelf-reading-search').inputValue(), chosen.title);
    assert.deepEqual(await ids(), textExpected.map(row => row.id), 'A reading round trip retains the active shelf selection');
  }],
  ['enhancement-preserves-prose-and-protected-rooms', async page => {
    const observed = await page.evaluate(() => {
      const f = window.annotationFixture;
      const make = () => {
        const box = document.createElement('section');
        box.innerHTML = '<p class="fixture-paragraph">電車で学校へ行く。</p><div class="publisher-body">\n駅で電車を待つ。\n  日本語を読む。</div><button class="fixture-control"><span>戻る</span></button>';
        document.body.append(box); return box;
      };
      const room = f.S.view; f.S.view = 'shelf';
      const prose = make(), before = prose.textContent; f.enhanceJapaneseProse(prose);
      const normal = { sameText: prose.textContent === before, paragraph: prose.querySelectorAll('.fixture-paragraph .japanese-lookup-word').length,
        source: prose.querySelectorAll('.publisher-body .japanese-lookup-word').length, nestedControls: prose.querySelectorAll('button button').length };
      f.S.view = 'mock'; const timed = make(); f.enhanceJapaneseProse(timed);
      const protectedCount = timed.querySelectorAll('.japanese-lookup-word').length;
      f.S.view = room; prose.remove(); timed.remove();
      return { normal, protectedCount };
    });
    assert(observed.normal.sameText, 'Lookup wrapping preserves exact source text and whitespace');
    assert(observed.normal.paragraph > 0);
    assert(observed.normal.source > 0, 'The entire imported/publisher reading body must support lookup');
    assert.equal(observed.normal.nestedControls, 0);
    assert.equal(observed.protectedCount, 0, 'Global enhancement cannot silently add hints to a timed/mock assessment');
  }],
];
const filter = new Set(process.argv.slice(2).map(arg => { assert(arg.startsWith('--case=')); return arg.slice(7); }));
for (const name of filter) assert(cases.some(([candidate]) => candidate === name), `Unknown case: ${name}`);
let browser;
try {
  for (const engine of engines) {
    browser = await ({ chromium, webkit })[engine].launch();
    for (const [name, run] of cases.filter(([name]) => !filter.size || filter.has(name))) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US', serviceWorkers: 'block' });
      await silenceBrowserAudio(context);
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== host.origin) return route.abort();
        if (url.pathname === '/corridor.js') return route.fulfill({ contentType: 'text/javascript', body: fixture });
        return route.continue();
      });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.stack || String(error)));
      try {
        await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
        const observations = await run(page);
        assert.deepEqual(errors, [], 'The interaction must not leave an unhandled application error');
        results.push({ engine, name, passed: true, ...(observations ? { observations } : {}) }); console.log(`ok ${engine}: ${name}`);
      } catch (error) {
        const detail = { engine, name, passed: false, error: String(error), stack: error.stack, errors };
        failures.push(detail); console.error(`FAIL ${engine}: ${name}: ${error.message}`);
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}-failure.png`), fullPage: true }).catch(() => {});
        const saved = await state(page).catch(() => null);
        if (saved) writeFileSync(resolve(evidence, `${engine}-${name}-record.json`), JSON.stringify(saved, null, 2) + '\n');
      } finally { await context.close(); }
    }
    await browser.close(); browser = null;
  }
} finally {
  await browser?.close(); await host.close();
  writeFileSync(resolve(evidence, 'annotation-lookup.json'), JSON.stringify({ passed: failures.length === 0, identity,
    sourceSha256: sha(original), fixtureSha256: sha(fixture), shimSha256: sha(shim), verifierSha256: sha(readFileSync(new URL(import.meta.url))),
    results, failures, limits: ['Test-only export shim and synthetic anchors; no operator profile or external service.', 'Native database writes and reload durability are exercised; visual acceptance belongs to the uninstrumented app.'] }, null, 2) + '\n');
}
console.log(`${results.length}/${results.length + failures.length} annotation lookup cases passed. Evidence: ${evidence}`);
if (failures.length) process.exitCode = 1;
