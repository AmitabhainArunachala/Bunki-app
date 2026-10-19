#!/usr/bin/env node
/** H2-fix · the rows of Grok's H2 phone walk (DEFECTS.md items 3–8), walked in real browsers against a built site. One engine
 * per run: WebKit at 390×844 with touch (and 1024×768 for the report sheet), Chromium at 1440×900 (and 1024×768).
 *
 *   H2-3  the startup-awards article (kantei:…-25startup) opens on no warehouse picture; its shelf card shows its key
 *         kanji. Control: the other startup-awards article (MEXT, about a warehouse-robot maker) keeps its own picture.
 *   H2-4  Me's India field says its own subtitle (EN and 日本語), and the AI field's reads as the rest of his sentence.
 *         Control: the learning-psychology field's subtitle is unchanged.
 *   H2-5  Report a problem: Send and Return to lesson stand whole on the glass at open and with Details open; Details says
 *         in plain words what gets sent and where, with no JSON on show; the report and the GitHub issue it opens carry the
 *         served build's git and artifact digests (read from the site's build-identity.json). Controls: the where-sentence
 *         is unchanged and Return to lesson closes the sheet; a negative control unsticks the foot and must turn red.
 *   H2-6  JLPT practice's import line in plain words. Control: the import button and its .kairo-private-pack picker stay.
 *   H2-8  the reader byline's kanji grade in plain words (EN and 日本語). Control: a grade-5 story still says "Kanji grade 5".
 *   H2-7  (optional) Speak's and the tutor's key lines say first what each does. Controls: no request leaves the site; the
 *         tutor's save button is there.
 *
 * Usage:
 *   KAIRO_SITE_DIR=<built site> KAIRO_ARTIFACT_SHA256=<its digest> KAIRO_EVIDENCE_DIR=~/.dharma/… KAIRO_BROWSER=webkit|chromium \
 *     node prototypes/corridor/tools/verify-h2fix.mjs
 * Exit 0 only when every row and control is green. The base build (970d4a49) must be red on each item's row.
 * Claim boundary: headless engines with touch emulation at the stated sizes; not the iPhone itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfDoor, openShelfTools } from './shelf-tools-support.mjs';

const ENGINE = process.env.KAIRO_BROWSER;
if (!['webkit', 'chromium'].includes(ENGINE)) throw new Error('KAIRO_BROWSER must be webkit or chromium (one engine per run)');
const browserType = ENGINE === 'webkit' ? webkit : chromium;
const MAIN = ENGINE === 'webkit' ? { name: '390x844', width: 390, height: 844, touch: true } : { name: '1440x900', width: 1440, height: 900, touch: false };
const TABLET = { name: '1024x768', width: 1024, height: 768, touch: ENGINE === 'webkit' };
const out = resolveCorridorEvidence();
const shots = join(out, 'shots');
mkdirSync(shots, { recursive: true });
const host = await startCorridorDev(0);
const ORIGIN = host.origin;

const STARTUP = { id: 'kantei:jp-105-actions-202609-25startup', search: 'スタートアップ大賞２０２６表彰式' };
const MEXT = { id: 'mext:b_menu-houdou-2025-mext_00009', search: '受賞者を決定しました', picture: 'mext-b-menu-houdou-2025-mext-00009' };
const GUARDS = { id: 'global-voices:2026-08-03-65560', search: 'インドの野生動物' };
const RULE72 = { id: 'bunki-read-n3-rule-of-72', search: '72の法則' };
const WHERE_EN = 'This opens GitHub with your words and this screen filled in. Tap “Submit new issue” there to send it. Issues in this repository are public, so leave out anything private. A copy stays on this device.';

const rows = [];
const row = (item, name, pass, detail = '') => {
  rows.push({ item, name: `${ENGINE} · ${name}`, pass: pass === 'n/a' ? 'n/a' : !!pass, detail });
  console.log(`  ${pass === 'n/a' ? 'n/a ' : pass ? 'ok  ' : 'FAIL'} [${item}] ${name}  — ${(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function session(size = MAIN) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.touch ? 2 : 1,
    isMobile: size.touch, hasTouch: size.touch, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  await silenceBrowserAudio(context);
  // GitHub opens inside Send's tap: the address is kept, no window opens
  await context.addInitScript(() => { window.__h2Opened = []; window.open = (url) => { window.__h2Opened.push(String(url)); return null; }; });
  const seen = { external: [], pageErrors: [] };
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url === ORIGIN || url.startsWith(`${ORIGIN}/`)) return route.continue();
    seen.external.push(url.slice(0, 160));
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => seen.pageErrors.push(String(error?.message || error).slice(0, 200)));
  return { browser, page, seen, close: () => browser.close() };
}
async function boot(page, query = '?entry=shelf&ui=bi') {
  await page.goto(`${ORIGIN}/index.html${query}`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 60_000 });
  await sleep(900);
}
async function openArticle(page, story) {
  const direct = page.locator(`[data-passage="${story.id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(story.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await page.locator(`#shelf-reading-results [data-passage="${story.id}"] .shelf-open`).first().click();
  }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30_000 });
  await sleep(900);
}
const shot = (page, name) => page.screenshot({ path: join(shots, `${ENGINE}-${name}.png`) }).catch(() => {});
async function guarded(item, label, fn) {
  try { await fn(); } catch (error) { row(item, `${label} · the walk ran to its end`, false, String(error?.message || error).split('\n')[0]); }
}

/* ------------------------------------------------------------------------------------------------------------ H2-3 */
async function picture() {
  const s = await session();
  try {
    await boot(s.page);
    await openShelfTools(s.page);
    await s.page.locator('#shelf-reading-search').fill(STARTUP.search);
    await s.page.locator('#shelf-reading-search').press('Enter');
    const card = s.page.locator(`#shelf-reading-results [data-passage="${STARTUP.id}"]`).first();
    await card.waitFor({ timeout: 20_000 });
    await sleep(600);
    const onCard = await card.evaluate((node) => ({ imgs: [...node.querySelectorAll('img')].map((img) => img.getAttribute('src')),
      kanji: node.querySelector('.story-picture.is-kanji .story-hero-kanji')?.textContent || null }));
    await card.locator('.shelf-open').first().click();
    await s.page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30_000 });
    await sleep(900);
    const inReader = await s.page.evaluate(() => ({ figures: document.querySelectorAll('figure.reader-picture').length,
      warehouse: [...document.querySelectorAll('#app img')].map((img) => img.getAttribute('src') || '').filter((src) => src.includes('25startup')),
      headline: document.querySelector('h1.view-title, .reader-head h1, #app h1')?.textContent?.trim().slice(0, 40) || '' }));
    await shot(s.page, `${MAIN.name}-H2-3-startup-reader`);
    row('H2-3', 'the startup-awards article opens on no warehouse picture (reader and shelf card)',
      inReader.figures === 0 && inReader.warehouse.length === 0 && onCard.imgs.every((src) => !src?.includes('25startup')), { inReader, onCard });
    row('H2-3', 'its shelf card shows its key kanji 賞, as every picture-less story does', onCard.kanji === '賞' && onCard.imgs.length === 0, onCard);
    // control: the MEXT startup-awards article is about a warehouse-robot maker; its own picture stays
    await boot(s.page);
    await openArticle(s.page, MEXT);
    const control = await s.page.evaluate(() => {
      const img = document.querySelector('figure.reader-picture img');
      return img ? { src: img.currentSrc || img.src, loaded: img.complete && img.naturalWidth > 0 } : null;
    });
    await shot(s.page, `${MAIN.name}-H2-3-control-mext-reader`);
    row('H2-3', 'control · the MEXT startup-awards article keeps its own picture', !!control?.loaded && control.src.includes(MEXT.picture), control);
    row('H2-3', 'control · no page error, nothing left the site', !s.seen.pageErrors.length && !s.seen.external.length, s.seen);
  } finally { await s.close(); }
}

/* ------------------------------------------------------------------------------------------------------------ H2-4 */
async function fields() {
  const s = await session();
  try {
    const notes = async () => s.page.evaluate(() => Object.fromEntries(['mind', 'india', 'ai'].map((id) =>
      [id, { name: document.querySelector(`[data-horizon="field-${id}"] .me-hz-name`)?.textContent || null,
        note: document.querySelector(`[data-horizon="field-${id}"] .me-hz-note`)?.textContent || null }])));
    await boot(s.page, '?room=me&ui=bi');
    await s.page.locator('[data-horizon="field-india"]').waitFor({ timeout: 20_000 });
    const en = await notes();
    await s.page.locator('[data-horizon="field-india"]').scrollIntoViewIfNeeded();
    await sleep(300);
    await shot(s.page, `${MAIN.name}-H2-4-fields-en`);
    await boot(s.page, '?room=me&ui=ja');
    await s.page.locator('[data-horizon="field-india"]').waitFor({ timeout: 20_000 });
    const ja = await notes();
    row('H2-4', 'the India field says its own subtitle (EN)', en.india.name === 'Yoga, Buddhism, Jain and Hindu history' &&
      en.india.note === 'How they took root in Japan, and their ties to modern neuroscience' && !/Rooted in Japanese history/u.test(en.india.note), en.india);
    row('H2-4', 'the India field says its own subtitle (日本語)', ja.india.note === '日本にどう根づいたか、現代の脳科学とどうつながるか', ja.india);
    row('H2-4', 'the AI field\'s subtitle reads as the rest of his sentence (EN and 日本語)',
      en.ai.note === 'Also Hofstadter, recursion, computer science and tech' && ja.ai.note === 'そして、ホフスタッター・再帰・計算機科学・テクノロジー', { en: en.ai, ja: ja.ai });
    row('H2-4', 'control · the learning-psychology field\'s subtitle is unchanged',
      en.mind.note === 'Neuroplasticity, learning about learning, human potential' && ja.mind.note === '神経可塑性・学ぶことを学ぶ・人間の可能性', { en: en.mind, ja: ja.mind });
  } finally { await s.close(); }
}

/* ------------------------------------------------------------------------------------------------------------ H2-5 */
async function report(size) {
  const s = await session(size);
  const { page } = s;
  const actions = () => page.evaluate(() => {
    const visible = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(Math.min(Math.max(x, 0), innerWidth - 1), Math.min(Math.max(y, 0), innerHeight - 1));
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
        whole: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight - 8, hit: !!hit && (hit === node || node.contains(hit)) };
    };
    return { innerHeight, send: visible(document.querySelector('#br-form .br-primary')), back: visible(document.querySelector('#br-form [data-br="close"]')) };
  });
  const whole = (a) => !!a.send && !!a.back && a.send.whole && a.back.whole && a.send.hit && a.back.hit;
  try {
    await boot(page);
    await page.locator('#bunki-report-bug').click();
    await page.locator('#br-actual').waitFor({ timeout: 15_000 });
    await sleep(900);
    const atOpen = await actions();
    await shot(page, `${size.name}-H2-5-report-open`);
    await page.locator('.br-details > summary').first().click();
    await sleep(500);
    const withDetails = await actions();
    await shot(page, `${size.name}-H2-5-report-details`);
    row('H2-5', `${size.name} · Send and Return to lesson stand whole on the glass, at open and with Details open`,
      whole(atOpen) && whole(withDetails), { atOpen, withDetails });
    const details = await page.evaluate(() => {
      const box = document.querySelector('#br-form .br-details');
      const shownPre = [...box.querySelectorAll('pre')].filter((pre) => pre.getClientRects().length > 0).length;
      return { text: box.innerText, shownPre };
    });
    const served = await page.evaluate(async () => {
      const identity = await (await fetch('build-identity.json', { cache: 'no-store' })).json();
      return { gitSha: identity.gitSha, artifactSha256: identity.artifactSha256 };
    });
    const plain = /What gets sent/u.test(details.text) && /Which screen: Bookshelf/u.test(details.text) &&
      /Your words, and the kind of problem you chose/u.test(details.text) && details.text.includes(`build ${served.gitSha.slice(0, 12)}`);
    const noJson = details.shownPre === 0 && !/"\w+"\s*:/u.test(details.text) && !/[{}]/u.test(details.text);
    row('H2-5', `${size.name} · Details says in plain words what gets sent (the build named) and shows no JSON`, plain && noJson,
      { shownPre: details.shownPre, text: details.text.slice(0, 420) });
    row('H2-5', `${size.name} · control · the where-sentence stands in Details, unchanged`, details.text.includes(WHERE_EN), details.text.includes(WHERE_EN));
    // the exact data, as a report carries it (the same JSON the base printed, now one tap away)
    const exact = await page.evaluate(() => {
      const pre = document.querySelector('#br-form .br-details pre');
      try { return JSON.parse(pre?.textContent || 'null'); } catch { return null; }
    });
    await page.locator('#br-actual').fill('H2-fix verifier: the build travels with the report.');
    await page.locator('#br-form .br-primary').click();
    await page.waitForFunction(() => window.__h2Opened.length > 0, null, { timeout: 10_000 }).catch(() => {});
    const opened = await page.evaluate(() => window.__h2Opened.slice());
    let body = '';
    try { body = new URL(opened[0]).searchParams.get('body') || ''; } catch { body = ''; }
    const reportBuild = exact?.context?.build || null;
    row('H2-5', `${size.name} · the report and the GitHub issue it opens carry the served build's git and artifact digests`,
      reportBuild?.git_sha === served.gitSha && reportBuild?.artifact_sha256 === served.artifactSha256 &&
        body.includes(`- Build: \`${served.gitSha}\`, artifact \`${served.artifactSha256}\``),
      { served, reportBuild, issueBuildLine: body.split('\n').find((line) => line.startsWith('- Build:')) || null, opened: opened.length });
    await sleep(800);
    await shot(page, `${size.name}-H2-5-report-sent`);
    // control: Return to lesson closes the sheet
    await boot(page);
    await page.locator('#bunki-report-bug').click();
    await page.locator('#br-actual').waitFor({ timeout: 15_000 });
    await sleep(500);
    await page.locator('#br-form [data-br="close"]').click();
    await sleep(500);
    const closed = await page.evaluate(() => !document.querySelector('dialog.br-sheet')?.open);
    row('H2-5', `${size.name} · control · Return to lesson closes the sheet`, closed, closed);
    // negative control: the same measure with the foot unstuck must go red (the row can fail)
    await page.locator('#bunki-report-bug').click();
    await page.locator('#br-actual').waitFor({ timeout: 15_000 });
    await sleep(500);
    const hasFoot = await page.evaluate(() => !!document.querySelector('#br-form > .br-foot'));
    await page.addStyleTag({ content: '#bunki-reports-root #br-form > .br-foot { position: static !important; }' });
    await page.locator('.br-details > summary').first().click();
    await page.evaluate(() => { document.querySelector('.br-body').scrollTop = 0; });
    await sleep(400);
    const unstuck = await actions();
    row('H2-5', `${size.name} · negative control · with the foot unstuck and Details open, the actions leave the glass`,
      hasFoot ? !whole(unstuck) : 'n/a (no foot on this build)', { hasFoot, unstuck });
    row('H2-5', `${size.name} · control · no page error, nothing left the site`, !s.seen.pageErrors.length && !s.seen.external.length, s.seen);
  } finally { await s.close(); }
}

/* ------------------------------------------------------------------------------------------------------------ H2-6 */
async function importLine() {
  const s = await session();
  try {
    await boot(s.page);
    await openShelfDoor(s.page, '#mock-link');
    const status = s.page.locator('.exam-official .exam-status').first();
    await status.waitFor({ timeout: 20_000 });
    await status.scrollIntoViewIfNeeded();
    await sleep(500);
    const got = await s.page.evaluate(() => {
      const input = document.querySelector('#exam-official-file');
      const label = document.querySelector('.exam-official-import');
      const r = label?.getBoundingClientRect();
      return { text: document.querySelector('.exam-official .exam-status')?.textContent || '', accept: input?.accept || '',
        label: label?.textContent?.trim() || '', labelShown: !!r && r.width > 0 && r.height > 0 };
    });
    await shot(s.page, `${MAIN.name}-H2-6-import-line`);
    row('H2-6', 'JLPT practice\'s import line says it in plain words',
      /^No real N\d test here yet\. If you own an official JLPT workbook, you can turn it into a private file for yourself on your Mac and bring it in here\. It stays on this device\.$/u.test(got.text) &&
        !/\.kairo-private-pack/u.test(got.text), got.text);
    row('H2-6', 'control · the import button and its .kairo-private-pack picker stay',
      got.label === 'Import a real test' && got.labelShown && got.accept.split(',').includes('.kairo-private-pack'), got);
  } finally { await s.close(); }
}

/* ------------------------------------------------------------------------------------------------------------ H2-8 */
async function byline() {
  const s = await session();
  const tag = () => s.page.evaluate(() => {
    const node = document.querySelector('.reader-meta .grade-tag');
    return node ? { text: node.textContent, title: node.title, shown: node.getClientRects().length > 0 } : null;
  });
  try {
    await boot(s.page);
    await openArticle(s.page, GUARDS);
    const en = await tag();
    await shot(s.page, `${MAIN.name}-H2-8-byline-en`);
    await boot(s.page, '?entry=shelf&ui=ja');
    await openArticle(s.page, GUARDS);
    const ja = await tag();
    await boot(s.page);
    await openArticle(s.page, RULE72);
    const control = await tag();
    // phones keep the line short: the tag is not drawn under 520 px (read.css), so only its words are checked there
    const shownOk = MAIN.width > 520 ? !!en?.shown : en?.shown === false;
    row('H2-8', 'the byline\'s kanji grade is in plain words (EN and 日本語)',
      en?.text === 'Kanji beyond elementary school' && ja?.text === '中学以上の漢字' && shownOk && !/secondary/iu.test(`${en?.text} ${en?.title}`), { en, ja });
    row('H2-8', 'control · a grade-5 story still says "Kanji grade 5"', control?.text === 'Kanji grade 5', control);
  } finally { await s.close(); }
}

/* ------------------------------------------------------------------------------------------------------------ H2-7 */
async function keyLines() {
  const s = await session();
  try {
    await boot(s.page, '?dojo=1&ui=bi');
    const door = s.page.locator('[data-study-door="speak"]').first();
    await door.waitFor({ timeout: 20_000 });
    await door.click();
    const status = s.page.locator('.speak-status-t').first();
    await status.waitFor({ timeout: 20_000 });
    await sleep(500);
    const speak = await s.page.evaluate(() => ({ text: document.querySelector('.speak-status-t')?.textContent || '',
      doors: [...document.querySelectorAll('.speak-status button')].map((b) => b.textContent.trim()) }));
    await shot(s.page, `${MAIN.name}-H2-7-speak`);
    await boot(s.page);
    await openShelfDoor(s.page, '#ai-link');
    await s.page.locator('#ai-key-save').waitFor({ timeout: 20_000 });
    await sleep(500);
    const tutor = await s.page.evaluate(() => ({
      text: [...document.querySelectorAll('#app p.gloss')].map((p) => p.textContent).find((t) => /key/u.test(t)) || '',
      save: !!document.querySelector('#ai-key-save') }));
    await shot(s.page, `${MAIN.name}-H2-7-tutor`);
    row('H2-7', 'Speak says first what it is, then what it needs',
      speak.text === 'Speak is a spoken conversation in Japanese with Kore. It runs on a Google key, and this device has none yet.', speak);
    row('H2-7', 'the tutor says first what it does, then what it needs',
      tutor.text.startsWith('The tutor answers your questions through an AI service of your own (Anthropic, or one like it). To start, add that service’s key here.'), tutor.text);
    row('H2-7', 'control · Speak still offers Settings, the tutor its save button, and nothing left the site',
      speak.doors.some((d) => /Settings/u.test(d)) && tutor.save && !s.seen.external.length && !s.seen.pageErrors.length, { doors: speak.doors, ...s.seen });
  } finally { await s.close(); }
}

const identity = await (async () => {
  try { return JSON.parse(await (await fetch(`${ORIGIN}/build-identity.json`)).text()); } catch { return null; }
})();
console.log(`H2-fix verifier · ${ENGINE} · site ${host.site} · ${identity?.buildId} · artifact ${identity?.artifactSha256}`);
await guarded('H2-3', 'picture', picture);
await guarded('H2-4', 'fields', fields);
await guarded('H2-5', `report ${MAIN.name}`, () => report(MAIN));
await guarded('H2-5', `report ${TABLET.name}`, () => report(TABLET));
await guarded('H2-6', 'import line', importLine);
await guarded('H2-8', 'byline', byline);
await guarded('H2-7', 'key lines', keyLines);
await host.close();

const failed = rows.filter((r) => r.pass !== true && r.pass !== 'n/a');
const receipt = { schemaVersion: 1, verifier: 'verify-h2fix', engine: ENGINE, sizes: [MAIN, TABLET], site: host.site,
  buildId: identity?.buildId, gitSha: identity?.gitSha, sourceDirty: identity?.sourceDirty, artifactSha256: identity?.artifactSha256,
  finishedAt: new Date().toISOString(), rows, failed: failed.length };
writeFileSync(join(out, `h2fix-${ENGINE}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`\n${rows.length - failed.length}/${rows.length} green · ${failed.length} red · receipt ${join(out, `h2fix-${ENGINE}.json`)}`);
process.exit(failed.length ? 1 : 0);
