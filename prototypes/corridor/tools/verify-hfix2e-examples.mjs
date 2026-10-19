/** Hfix-2e · KT-6: a word's examples are the word's own (auditor 2031, finding D). Immutable build, one engine, the real
 * app. Base and control runs require each row's intended assertion red; a branch run requires every row green.
 *   KT6-A  藍 → あい (indigo), full detail loaded and its bank fetched: no 愛 sentence is shown as its example, and every
 *          example shown holds 藍 or あい. Red on the base (「愛は盲目。」 leads). Control: the bank read keyed by the bare
 *          kana again.
 *   KT6-B  a kana-only word keeps its examples (えっと: ≥ 4, 「えっと。」 among them). Green on base and branch (a guard).
 *          Control: no token ever counts as the word.
 *   KT6-C  an inflected verb keeps its inflected examples (歩く: ≥ 4, one written 歩け/歩き/歩い). Green on base and
 *          branch (a guard). Control: as B.
 * KT-6's final rule (the lead's ruling after round 3: the word's own entry by reading and sense, and of it only the
 * spellings with the key's own kanji), against 1f790977 (round 1), a760b2ad (round 2) and 02c6f0f2 (round 3):
 *   KT6-D  MUST STAY IN: an okurigana variant of the word's own entry is the word's written form: 押える ← 押さえる (6),
 *          代る ← 代わる (6), 或 ← 或る (1). Red on 1f790977. Control: no own-entry spelling admitted.
 *   KT6-G  MUST STAY OUT: no example of 首 holds 頭 without 首, of 比 頃, of 画 絵, of 為る 成る, of 才 歳, of 開く 空く,
 *          of 器械 機械, of 現す 表; 問 (もん) shows no 問い sentence. Red on a760b2ad (homographs) and on 02c6f0f2 (other
 *          kanji of the own entry). Control: the own entry is again every entry that writes the key.
 *   KT6-H  因る shows no 依る/拠る/由る sentence (another kanji is not this word's written form). Red on a760b2ad and
 *          02c6f0f2. Control: every spelling of the own entry admitted, whatever its kanji.
 *   KT6-E  張る never stands under 貼る (one entry, 1427900, but a sense of its own): every example 貼る's page shows
 *          holds 貼. A guard, green on 1f790977 too. Control: every same-entry spelling admitted whatever its senses.
 *   KT6-F  藍 still shows no example at all. A guard, green on 1f790977 too. Control: the bank read by the bare kana.
 * KAIRO_SITE_DIR + KAIRO_ARTIFACT_SHA256 pin the build; KAIRO_BROWSER picks the engine (WebKit 390×844 touch, Chromium
 * 1440×900); HFIX2E_MODE = base | branch | control; HFIX2E_CASE runs one row. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';

const engine = process.env.KAIRO_BROWSER;
assert(['webkit', 'chromium'].includes(engine), 'Choose exactly one engine');
const mode = process.env.HFIX2E_MODE || 'branch';
assert(['base', 'branch', 'control'].includes(mode));
const only = process.env.HFIX2E_CASE;
const out = resolveCorridorEvidence(); mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const browser = await ({ webkit, chromium }[engine]).launch();
const version = browser.version();
const viewport = engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const results = []; const mutations = [];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const load = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const identity = JSON.parse(readFileSync(join(process.env.KAIRO_SITE_DIR, 'build-identity.json'), 'utf8'));
console.log(`${engine} ${version} ${viewport.width}×${viewport.height} mode=${mode} artifact=${identity.artifactSha256} git=${identity.gitSha}`);

const CONTROL = {
  // the bank read keyed by the bare kana again, as on the base
  'KT6-A': ['const banked = bankExamplesFor(id, node);', 'const banked = D.exampleBank?.get(id) || [];'],
  // no token ever counts as the word: a guard that cannot go red guards nothing
  'KT6-B': ['function exampleTokenIsWord(token, identity) {', 'function exampleTokenIsWord(token, identity) {\n  return false;'],
  'KT6-C': ['function exampleTokenIsWord(token, identity) {', 'function exampleTokenIsWord(token, identity) {\n  return false;'],
  // no spelling of the word's own entries is admitted, as on 1f790977
  'KT6-D': ['  for (const row of exampleOwnRows(key)) {', '  for (const row of []) {'],
  // the own entry is again every entry that writes the key, whatever its reading and sense (round 2)
  'KT6-G': ["  return dictionaryRowsForForm(key).filter((row) => Array.isArray(row?.[4]) && row[4].includes(key) &&\n", "  return dictionaryRowsForForm(key).filter((row) => Array.isArray(row?.[4]) && row[4].includes(key) || false &&\n"],
  // every spelling of the own entry admitted, whatever its kanji: 張る would stand under 貼る, 依る under 因る
  'KT6-E': ['    for (const form of row[4]) if (!forms.has(form) && exampleKanji(form) === exampleKanji(key)) forms.add(form);', '    for (const form of row[4]) if (!forms.has(form)) forms.add(form);'],
  'KT6-H': ['    for (const form of row[4]) if (!forms.has(form) && exampleKanji(form) === exampleKanji(key)) forms.add(form);', '    for (const form of row[4]) if (!forms.has(form)) forms.add(form);'],
  'KT6-F': ['const banked = bankExamplesFor(id, node);', 'const banked = D.exampleBank?.get(id) || [];'],
};
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !document.documentElement.dataset.roomTransition);
  await page.evaluate(() => document.fonts.ready);
}
async function context(row) {
  const ctx = await browser.newContext({ viewport, hasTouch: engine === 'webkit', deviceScaleFactor: 2,
    isMobile: engine === 'webkit', serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', (route) => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', (error) => errors.push(String(error)));
  // the bank's fetches, heard from outside the page (the page's own resource timing buffer fills long before them)
  const finished = []; page.on('requestfinished', (request) => finished.push(request.url()));
  page.finishedUrls = finished;
  if (mode === 'control') await page.route('**/corridor.js', async (route) => {
    const response = await route.fetch(); const original = await response.text();
    const [from, to] = CONTROL[row];
    const changed = original.replace(from, to);
    assert.notEqual(changed, original, `Mutation ${row} must fire`);
    mutations.push({ row, original: sha(original), served: sha(changed) });
    await route.fulfill({ response, body: changed });
  });
  return { ctx, page, errors };
}
async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${engine}-${mode}-${name}.png`) });
}
async function row(name, body) {
  if (only && only !== name) return;
  const session = await context(name); const before = load(); let passed = false; let error = null; let detail;
  try {
    await session.page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`); await ready(session.page);
    detail = await body(session); assert.deepEqual(session.errors, []); passed = true;
  } catch (problem) { error = String(problem.stack || problem); await shot(session.page, `${name}-failure`).catch(() => {}); }
  finally { await session.ctx.close(); }
  results.push({ name, pass: passed, detail, error, before, after: load() });
  console.log(`${name}: ${passed ? 'PASS' : 'FAIL'}${error ? ` ${error.split('\n')[0]}` : ''}`);
  if (detail) console.log(`  ${JSON.stringify(detail)}`);
}
/** The page has its full detail and the bank has answered for the word (its index and sentence shards fetched), and the
 * page has drawn again since: what it shows now is what the word's examples are. */
async function settled(page, shards) {
  await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening') &&
    !/Opening complete senses|詳しい意味を開いています/u.test(document.querySelector('#sheet')?.textContent || ''), null, { timeout: 20000 });
  const fetched = () => shards.every((name) => page.finishedUrls.some((url) => url.includes(`/examples/${name}`)));
  for (const until = Date.now() + 20000; !fetched(); await page.waitForTimeout(100)) {
    assert(Date.now() < until, `the bank never answered (${shards.join(', ')}; heard ${page.finishedUrls.filter((url) => url.includes('/examples/')).join(', ') || 'none'})`);
  }
  await page.waitForTimeout(900);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
// the sentence as printed: its readings (ruby, shown or hidden), its door and any English row left out
const exampleTexts = (page) => page.evaluate(() => [...document.querySelectorAll('#sheet .example .example-ja')].map((node) => {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('rt, rp, .sent-door, .tok-en, button').forEach((part) => part.remove());
  return clone.textContent.replace(/\s+/gu, '');
}));
async function searchWord(page, word) {
  await openShelfTools(page);
  await page.fill('#search', word);
  await page.waitForSelector(`[data-result="word:${word}"]`, { timeout: 15000 });
  await page.locator(`[data-result="word:${word}"]`).first().click();
  await page.waitForSelector('#sheet .headword');
}

/** A core word's own page, reached the way the Words room reaches it: its word web, then "Open the full entry". */
async function openWordPage(page, word) {
  // each word from a fresh start: no page from the word before stands over the web
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`); await ready(page);
  assert.equal(await page.evaluate((word) => window.openWordWeb(word, { type: 'word' }), word), true, `the word web opens on ${word}`);
  await page.waitForFunction((word) => document.querySelector('.ww-plate')?.dataset.wwCentre === `word:${word}`, word, { timeout: 15000 });
  await ready(page);
  await page.locator('.ww-open').first().click();
  await page.waitForFunction((word) => document.querySelector('#sheet')?.dataset.node === `word:${word}`, word, { timeout: 15000 });
}
/** A word page's examples once its detail, its bank and its own entries have answered: what it shows when it settles. */
async function settledExamples(page) {
  await page.waitForFunction(() => document.querySelectorAll('#sheet .example').length >= 1, null, { timeout: 12000 }).catch(() => {});
  await settled(page, ['ex-']);
  let last = '';
  for (const until = Date.now() + 6000; Date.now() < until; await page.waitForTimeout(400)) {
    const now = JSON.stringify(await exampleTexts(page));
    if (now === last) break;
    last = now;
  }
  return exampleTexts(page);
}
async function openIndigo(page) {
    await openShelfTools(page);
    await page.locator('#kanjidex-link').click();
    await page.locator('.kdx-lens').first().waitFor();
    await page.locator('.kdx-lens', { hasText: 'Kodansha number' }).first().click();
    await page.waitForTimeout(150);
    await page.locator('#kdx-kkld').fill('藍');
    await page.waitForTimeout(450);
    await page.locator('#kdx-kkld-results [data-kdx-hit="藍"]').click();
    await page.locator('#sheet .hero-glyph').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-kanji-readings="pending"], [data-kdx-readings="pending"]'));
    const door = page.locator('#sheet [data-word-spelling="藍"]');
    const doorText = await door.innerText();
    assert(doorText.includes('あい'), `KT6-A: 藍's word row reads あい (${doorText})`);
    await door.scrollIntoViewIfNeeded();
    await door.click();
    await page.waitForFunction(() => /indigo/u.test(document.querySelector('#sheet')?.textContent || ''), null, { timeout: 20000 });
    // あい's index shard (fnv1a32 & 15 = 3) and the two sentence shards its six bank lines live in
    await settled(page, ['ex-03.json', 's-00.json', 's-01.json']);
}
try {
  await row('KT6-A', async ({ page }) => {
    await openIndigo(page);
    const examples = await exampleTexts(page);
    const sheet = await page.evaluate(() => ({ node: document.querySelector('#sheet')?.dataset.node || '',
      headword: document.querySelector('#sheet .headword')?.textContent.trim() || '',
      reading: document.querySelector('#sheet .reading')?.textContent.trim() || '' }));
    const block = page.locator('#sheet .example').first();
    if (await block.count()) await block.scrollIntoViewIfNeeded();
    await shot(page, 'KT6-A-examples');
    assert.equal(sheet.node, 'word:あい', `KT6-A: the page is the word あい, not the kanji (${JSON.stringify(sheet)})`);
    assert(/あい/u.test(`${sheet.reading}${sheet.headword}`), `KT6-A: the page reads あい (${JSON.stringify(sheet)})`);
    const love = examples.filter((text) => text.includes('愛'));
    assert.deepEqual(love, [], `KT6-A: no 愛 sentence is shown as 藍's example (${love.join(' | ')})`);
    const strangers = examples.filter((text) => !text.includes('藍') && !text.includes('あい'));
    assert.deepEqual(strangers, [], `KT6-A: every example holds 藍 or あい (${strangers.join(' | ')})`);
    return { sheet, examples };
  });

  await row('KT6-B', async ({ page }) => {
    await searchWord(page, 'えっと');
    // えっと's index shard and the sentence shards its lines live in are fetched once the page asks
    await page.waitForFunction(() => document.querySelectorAll('#sheet .example').length >= 1, null, { timeout: 20000 }).catch(() => {});
    await settled(page, ['ex-']);
    const examples = await exampleTexts(page);
    await shot(page, 'KT6-B-examples');
    assert(examples.length >= 4, `KT6-B: a kana-only word keeps its examples (${examples.length}: ${examples.join(' | ')})`);
    assert(examples.includes('えっと。'), `KT6-B: 「えっと。」 is still among them (${examples.join(' | ')})`);
    return { examples };
  });

  await row('KT6-C', async ({ page }) => {
    await searchWord(page, '歩く');
    await page.waitForFunction(() => document.querySelectorAll('#sheet .example').length >= 1, null, { timeout: 20000 }).catch(() => {});
    await settled(page, ['ex-']);
    const examples = await exampleTexts(page);
    await shot(page, 'KT6-C-examples');
    assert(examples.length >= 4, `KT6-C: an inflected verb keeps its examples (${examples.length}: ${examples.join(' | ')})`);
    const inflected = examples.filter((text) => text.includes('歩') && !text.includes('歩く'));
    assert(inflected.length >= 1, `KT6-C: an inflected 歩く (歩け, 歩き, 歩い) is still its example (${examples.join(' | ')})`);
    return { examples, inflected };
  });
  await row('KT6-D', async ({ page }) => {
    const words = [['押える', /押さえ/u, 6], ['代る', /代わ/u, 6], ['或', /或る/u, 1]];
    const seen = {};
    for (const [word, own, least] of words) {
      await openWordPage(page, word);
      const examples = await settledExamples(page);
      seen[word] = { count: examples.length, least, own: examples.filter((text) => own.test(text)).length, first: examples[0] || null };
    }
    await shot(page, 'KT6-D-last');
    const short = Object.entries(seen).filter(([, row]) => row.count < row.least || !row.own);
    assert.deepEqual(short.map(([word]) => word), [], `KT6-D: each word shows its own sentences again (${JSON.stringify(seen)})`);
    return seen;
  });

  await row('KT6-G', async ({ page }) => {
    // [word, the homograph entry's spelling that must not stand under it, the word's own kanji]
    const pairs = [['首', '頭', '首'], ['比', '頃', '比'], ['画', '絵', '画'], ['為る', '成', '為'], ['才', '歳', '才'], ['開く', '空', '開'],
      ['器械', '機械', '器'], ['現す', '表', '現'], ['問', '問い', null]];
    const seen = {};
    for (const [word, stranger, own] of pairs) {
      await openWordPage(page, word);
      const examples = await settledExamples(page);
      const lent = examples.filter((text) => text.includes(stranger) && (!own || !text.includes(own)));
      seen[word] = { count: examples.length, lent };
    }
    await shot(page, 'KT6-G-last');
    const lending = Object.entries(seen).filter(([, row]) => row.lent.length);
    assert.deepEqual(lending.map(([word]) => word), [], `KT6-G: no homograph entry lends its sentences (${JSON.stringify(Object.fromEntries(lending))})`);
    return seen;
  });

  await row('KT6-H', async ({ page }) => {
    await openWordPage(page, '因る');
    const examples = await settledExamples(page);
    await shot(page, 'KT6-H-examples');
    const other = examples.filter((text) => /[依拠由]/u.test(text) && !text.includes('因'));
    assert.deepEqual(other, [], `KT6-H: 因る shows no 依る/拠る/由る sentence (${other.join(' | ')})`);
    return { examples };
  });

  await row('KT6-E', async ({ page }) => {
    await openWordPage(page, '貼る');
    const examples = await settledExamples(page);
    await shot(page, 'KT6-E-examples');
    const stretched = examples.filter((text) => text.includes('張') && !text.includes('貼'));
    assert.deepEqual(stretched, [], `KT6-E: 張る never stands under 貼る (${stretched.join(' | ')})`);
    return { examples };
  });

  await row('KT6-F', async ({ page }) => {
    await openIndigo(page);
    const examples = await exampleTexts(page);
    assert.deepEqual(examples, [], `KT6-F: 藍 shows no example (${examples.join(' | ')})`);
    return { examples };
  });
} finally {
  await browser.close(); await host.close();
  writeFileSync(join(out, 'result.json'), JSON.stringify({ engine, version, viewport, mode, identity: { gitSha: identity.gitSha,
    artifactSha256: identity.artifactSha256, sourceDirty: identity.sourceDirty }, verifierSha256: sha(readFileSync(new URL(import.meta.url))),
    results, mutations }, null, 2));
}
// base: A red on its own assertion, B and C green (guards); branch: all green; control: each row red on its own assertion
const intended = { 'KT6-A': /KT6-A: no 愛 sentence/u, 'KT6-B': /KT6-B: a kana-only word keeps/u, 'KT6-C': /KT6-C: an inflected verb keeps/u };
const wantPass = (name) => mode === 'branch' || (mode === 'base' && name !== 'KT6-A');
process.exitCode = results.length > 0 && results.every((r) => r.pass === wantPass(r.name) && (r.pass || intended[r.name].test(r.error))) ? 0 : 1;
console.log(`verdict ${process.exitCode === 0 ? 'AS EXPECTED' : 'NOT AS EXPECTED'} (${mode})`);
