/** Hfix-2c: native Undo/coach/layout/review rows and every numeric date card.
 * Each process pins one built artifact. Controls change served bytes with page.route;
 * a timeout is a harness failure, never a caught control. KT fixtures stay explicit; real
 * Kanji-trust data must complete and repaint without a learner-record write.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord } from './record-test-support.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(join(ROOT, 'package.json'));
const { startStaticHost } = require(join(ROOT, 'prototypes/bunki-desktop/lib/static-host.cjs'));
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
const BASE = process.env.HFIX2C_BASE || '/Users/dhyana/.dharma/bunki_review/2026-10-15/juncture/one-hand/INTG4/site-1';
const engine = process.env.KAIRO_BROWSER || 'webkit', mode = process.env.HFIX2C_MODE || 'branch';
assert(['webkit', 'chromium'].includes(engine)); assert(['base', 'branch', 'control'].includes(mode));
const only = process.env.HFIX2C_CASE;
assert(!only || ['X20','X8','X4','X4-return','readings','KT1','X21'].includes(only), 'Known selected case');
const hash = s => createHash('sha256').update(s).digest('hex');
const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const read = (file, base = SITE) => readFileSync(join(base, file), 'utf8');
const identity = JSON.parse(read('build-identity.json'));
mkdirSync(join(OUT, 'shots'), { recursive: true });
const receipt = { schemaVersion: 2, suite: 'hfix2c', runId: process.env.KAIRO_GATE_RUN_ID || randomUUID(),
  scope: only ? 'partial:' + only : 'full', selectedCase: only || null,
  helperSha256: Object.fromEntries(['record-test-support.mjs', 'hfix2c-diversity.json'].map(file => [file, hash(readFileSync(new URL(file, import.meta.url)))])),
  sources: { nativeRecordHelper: hash(readFileSync(new URL('./record-test-support.mjs', import.meta.url))) },
  identity, engine, mode, uptimeStart: uptime(), rows: [], mutations: [], errors: [],
  boundary: 'Automated isolated browsers, not a physical phone. Date rows use the shipped public sentence renderer on unchanged built cards. Five kanji rows use explicit display-contract fixtures; the real-data rows verify complete readings and a held-response pending-to-complete repaint.' };
const check = (group, name, pass, observed) => { receipt.rows.push({ group, name, pass: !!pass, observed, uptime: uptime() }); console.log(`${pass ? 'PASS' : 'RED'} ${group} ${name}`); };
const host = await startStaticHost({ site: SITE, port: 0 });
const browser = await ({ chromium, webkit })[engine].launch(); receipt.browserVersion = browser.version();
function replaceOne(source, old, next) { assert.equal(source.split(old).length - 1, 1, `unique mutation seam: ${old.slice(0, 70)}`); return source.replace(old, next); }
async function routeFile(page, file, change, label) {
  const source = read(file), body = change(source);
  assert.notEqual(body, source, `effective route mutation ${label}`);
  receipt.mutations.push({ label, file, originalSha256: hash(source), servedSha256: hash(body) });
  await page.route(`**/${file}*`, route => route.fulfill({ body, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'application/javascript' }));
}
async function newPage(group, width = 390, height = 844) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width <= 390, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => receipt.errors.push({ group, message: String(e) }));
  if (mode === 'control') {
    if (group === 'X20') await routeFile(page, 'editorial.css', s => s + '\n#app .kp .kp-study > #kp-undo { pointer-events: none !important; }\n', 'Undo label loses its own pointer target');
    if (group === 'X4-return') await routeFile(page, 'decks/player/mount.js', s => replaceOne(s, "foldSeatGap: face.querySelector('.kp-folds')?.style.marginTop || '',", "foldSeatGap: '',"), 'lose transient fold spacing on remount');
    if (group === 'X8') await routeFile(page, 'decks/player/mount.js', s => replaceOne(s, 'if (!ctx.prefs.againCoachSeen)', 'if (!ctx.prefs.ruleSeen)'), 'old coach flag');
    if (group === 'X4') await routeFile(page, 'decks/player/mount.js', s => replaceOne(replaceOne(replaceOne(s, 'if (!fitsEdges(dy)) {', 'if (false) {'), 'rBottom - d <= bottomLimit + 0.5 || rTop - d >= dockTop - 0.5', '!(rTop - d < barTop - 0.5 && rBottom - d > barTop + 0.5)'), 'return row.bottom - lift <= bottom + 0.5 || row.top - lift >= dockTop - 0.5;', 'return !(row.top - lift < barTop - 0.5 && row.bottom - lift > barTop + 0.5);'), 'restore old edge conditions; scheduling and coach untouched');
    if (group === 'readings') for (const d of ['kotoba-mine', 'kotoba-mcd']) for (const f of ['deck.json', 'tokens.json']) await routeFile(page, `decks/${d}/${f}`, s => {
      const data = JSON.parse(s);
      if (f === 'deck.json') { for (const card of data.words.flatMap(w => w.cards)) for (const row of card.ruby) if (/[0-9０-９].*[日月]/u.test(row[0])) row[1] = 'まちがい'; }
      else { for (const row of data.defs['徹夜']) if (row[0] === '一晩中') row[2] = 'ひとばんちゅう'; delete data.defs['ラピダス']; }
      return JSON.stringify(data);
    }, 'every numeric date reading and custom gloss corrupted');
  }
  // A blank same-origin seed page avoids booting and aborting the app during fixture setup.
  await page.route('**/__hfix-seed', route => route.fulfill({body:'<!doctype html><title>Fixture seed</title>',contentType:'text/html'}));
  await page.goto(host.origin + '/__hfix-seed');
  return { context, page };
}
async function resting(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.querySelector('.kp, .review-card')?.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished) || []);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(250);
}
async function deckStart(page, deck = 'n2', prefs = {}) {
  const id = ({ mcd: 'kotoba-mcd', kotoba: 'kotoba-mine' })[deck] || deck;
  await page.evaluate(({ id, prefs }) => localStorage.setItem(`bunki-cloze:prefs:v3:${id}`, JSON.stringify({ newPerDay: 4, mode: 'read', sittings: 4, ruleSeen: true, againCoachSeen: true, ...prefs })), { id, prefs });
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi&deck=${deck}`);
  await page.locator('#kp-start').click(); await page.locator('#kp-reveal').waitFor(); await resting(page);
}
const ledger = page => page.evaluate(() => JSON.parse(localStorage.getItem('bunki-cloze:n2') || 'null'));
async function undoRows() {
  for (const width of [390, 1024, 1280, 1440]) {
    const { context, page } = await newPage('X20', width, width === 390 ? 844 : 900);
    try {
      await deckStart(page); const first = await page.locator('#kp-card').getAttribute('data-card');
      const before = await ledger(page);
      await page.locator('#kp-reveal').click(); await page.locator('#kp-grade-good').click(); await page.locator('#kp-reveal').waitFor(); await resting(page);
      const geometry = await page.evaluate(() => {
        const u = document.querySelector('#kp-undo'), k = document.querySelector('#kp-reveal');
        const box = n => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const a = box(u), b = box(k), hit = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
        return { undo: a, reveal: b, hit: hit?.id, ownHit: u === hit || u.contains(hit), disjoint: a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top };
      });
      await page.screenshot({ path: join(OUT, 'shots', `undo-${width}.png`) });
      // A coordinate click tests the visible label, even when another element wrongly covers it.
      await page.mouse.click((geometry.undo.left + geometry.undo.right) / 2, (geometry.undo.top + geometry.undo.bottom) / 2); await resting(page);
      const after = await ledger(page), id = await page.locator('#kp-card').getAttribute('data-card');
      const restored = JSON.stringify(after?.cards || {}) === JSON.stringify(before?.cards || {}) && JSON.stringify(after?.log || []) === JSON.stringify(before?.log || []);
      check('X20', `${width}: geometry and pointer Undo restore exact card/schedule`, geometry.ownHit && geometry.disjoint && geometry.undo.height >= 44 && geometry.undo.width >= 44 && restored && id === first && await page.locator('.kp-grade').count() === 4, { geometry, first, id, before, after });
    } finally { await context.close(); }
    const next = await newPage('X20', width, width === 390 ? 844 : 900);
    try {
      await deckStart(next.page); const first = await next.page.locator('#kp-card').getAttribute('data-card'), before = await ledger(next.page);
      await next.page.locator('#kp-reveal').click(); await next.page.locator('#kp-grade-good').click(); await next.page.locator('#kp-reveal').waitFor(); await resting(next.page); await next.page.keyboard.press('u'); await resting(next.page);
      const after = await ledger(next.page);
      check('X20-key', `${width}: u restores`, await next.page.locator('#kp-card').getAttribute('data-card') === first && JSON.stringify(after?.cards || {}) === JSON.stringify(before?.cards || {}) && JSON.stringify(after?.log || []) === JSON.stringify(before?.log || []), { before, after });
    } finally { await next.context.close(); }
  }
}
async function coachRows() {
  for (const deck of ['n2', 'n1', 'senmon', 'mcd', 'kotoba']) for (const action of ['dismiss','grade']) {
    const { context, page } = await newPage('X8');
    try {
      await deckStart(page, deck, { ruleSeen: true, againCoachSeen: undefined, sittings: 8 });
      await page.locator('#kp-reveal').click(); await resting(page);
      const first = await page.locator('#kp-rule').count();
      await page.screenshot({ path: join(OUT, 'shots', `coach-${deck}-${action}.png`) });
      const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => /^bunki-cloze:[^:]+$/.test(k))));
      if (action === 'grade') { await page.locator('#kp-grade-good').click(); await page.locator('#kp-reveal').waitFor(); }
      else if (first) await page.locator('#kp-rule-dismiss').click();
      const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => /^bunki-cloze:[^:]+$/.test(k))));
      await page.reload(); await page.locator('#kp-start').click(); await page.locator('#kp-reveal').click(); await resting(page);
      const later = await page.locator('#kp-rule').count();
      check('X8', `${deck}/${action}: old seen flag gets coach, retirement survives reload`, first === 1 && later === 0 && (action === 'dismiss' ? JSON.stringify(before) === JSON.stringify(after) : Object.values(after).some(value => JSON.parse(value).log?.length === 1)), { first, later, ledgerUnchanged: JSON.stringify(before) === JSON.stringify(after) });
    } finally { await context.close(); }
  }
}
function layoutCensus() {
  const rect = n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  const p = document.querySelector('.kp-sentence'), header = document.querySelector('.kp-top-study'), bar = document.querySelector('.kp-grades');
  const h = rect(header), b = rect(bar), view = rect(p), opaque = b.top + parseFloat(getComputedStyle(bar).paddingTop) - 1;
  const lines = [];
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim() || n.parentElement.closest('rp')) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width && r.height) lines.push({ text: n.textContent, top: r.top, bottom: r.bottom });
  }
  for (const ruby of p.querySelectorAll('ruby')) {
    const boxes = [...ruby.childNodes].flatMap(n => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()]; }).filter(r => r.width && r.height);
    if (boxes.length) lines.push({text:ruby.textContent,top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom)),wholeRuby:true});
  }
  const cut = lines.filter(r => r.top < h.bottom - 0.5 && r.bottom > h.bottom + 0.5 && r.bottom > view.top && r.top < view.bottom);
  const folds = [...document.querySelectorAll('.kp-folds > details > summary, .kp-folds > :not(details)')].map(n => ({ text: n.textContent, ...rect(n) }));
  const foldBad = folds.filter(r => r.bottom > b.top - 12 + 0.5 && r.top < opaque - 0.5);
  const answer = [...document.querySelector('.kp-answer').children].filter(n => !n.matches('.kp-folds, .kp-ladder')).map(rect);
  const target = rect(document.querySelector('.kp-target')), toggle = document.querySelector('.kp-zoom') && rect(document.querySelector('.kp-zoom'));
  return { header: h, bar: b, view, target, toggle, opaque, cut, folds, foldBad, answer, scroll: scrollY, inner: p.scrollTop, overflow: document.documentElement.scrollWidth - innerWidth };
}
async function layoutRows() {
  for (const [width, height] of [[320, 568], [390, 844]]) for (const fresh of [false, true]) {
    const { context, page } = await newPage('X4', width, height);
    try {
      await deckStart(page, 'n2', { sittings: fresh ? 0 : 4, ruleSeen: !fresh, againCoachSeen: !fresh });
      await page.locator('#kp-reveal').click(); await resting(page);
      const g = await page.evaluate(layoutCensus);
      g.targetCanFit = Math.max(g.target.bottom, g.answer.at(-1).bottom, g.toggle?.bottom || 0) - Math.min(g.target.top, g.answer[0].top, g.toggle?.top ?? Infinity) <= g.bar.top - 12 - (g.header.bottom + 12);
      await page.screenshot({ path: join(OUT, 'shots', `settled-${width}-${fresh ? 'fresh' : 'returning'}.png`) });
      check('X4', `${width}x${height} ${fresh ? 'fresh' : 'returning'}: whole header line and clear grade band`, g.cut.length === 0 && g.foldBad.length === 0 && g.answer[0].top >= g.header.bottom + 12 - 1 && g.answer.at(-1).bottom <= g.bar.top - 12 + 1 && (!g.targetCanFit || (g.target.top >= Math.max(g.header.bottom + 12, g.view.top) - 1 && g.target.bottom <= Math.min(g.bar.top - 12, g.view.bottom) + 1 && (!g.toggle || g.toggle.top >= g.header.bottom + 12 - 1))) && g.overflow === 0, g);
    } finally { await context.close(); }
  }
}
/** The public player remount contract also serves non-corridor hosts. In a deliberately
 * off-window pose it must restore the extra fold spacing without a fresh fit. */
async function remountRow() {
  const {context,page} = await newPage('X4-return',320,568);
  try {
    await deckStart(page,'n2',{sittings:0,ruleSeen:false,againCoachSeen:false});
    await page.locator('#kp-reveal').click(); await resting(page);
    const observed = await page.evaluate(async () => {
      const player = await import('./decks/player/mount.js');
      const old = document.querySelector('.kp'), main = old.parentElement;
      // A learner may scroll their target out of view; returning must preserve that choice.
      window.scrollBy({top:24,behavior:'instant'});
      const saved = player.capturePresentation(), host = player.hostAdapter();
      const gap = old.querySelector('.kp-folds').style.marginTop;
      const ledger = localStorage.getItem('bunki-cloze:n2');
      old.remove();
      await player.render(main,{deckId:'n2',storage:localStorage,host,english:true,focusRoom:true,presentation:saved});
      const after = player.capturePresentation();
      return {gap,restoredGap:document.querySelector('.kp-folds').style.marginTop,saved,after,
        rebuilt:!old.isConnected,ledgerUnchanged:ledger===localStorage.getItem('bunki-cloze:n2')};
    });
    check('X4-return','320x568 public remount preserves an off-window fold gap',
      parseFloat(observed.gap)>12 && observed.saved.fitted===false && observed.rebuilt &&
      observed.restoredGap===observed.gap && observed.after.card===observed.saved.card &&
      observed.after.inner===observed.saved.inner && Math.abs(observed.after.anchor-observed.saved.anchor)<1 && observed.ledgerUnchanged,observed);
    await page.screenshot({path:join(OUT,'shots','remounted-short-card.png')});
  } finally {await context.close();}
}
const DAYS = 'ついたち ふつか みっか よっか いつか むいか なのか ようか ここのか とおか じゅういちにち じゅうににち じゅうさんにち じゅうよっか じゅうごにち じゅうろくにち じゅうしちにち じゅうはちにち じゅうくにち はつか にじゅういちにち にじゅうににち にじゅうさんにち にじゅうよっか にじゅうごにち にじゅうろくにち にじゅうしちにち にじゅうはちにち にじゅうくにち さんじゅうにち さんじゅういちにち'.split(' ');
const MONTHS = 'いちがつ にがつ さんがつ しがつ ごがつ ろくがつ しちがつ はちがつ くがつ じゅうがつ じゅういちがつ じゅうにがつ'.split(' ');
function expectedDates(card) {
  return [...card.ja.matchAll(/(?<![0-9０-９])([0-9０-９]+)(日|月)(間?)/gu)].flatMap(m => {
    const n = Number(m[1].normalize('NFKC'));
    let expected = m[2] === '月' ? MONTHS[n - 1] : n === 100 ? 'ひゃくにち' : DAYS[n - 1];
    if (!expected) return [];
    if (m[2] === '日' && n === 1 && (m[3] || ['km-300-m04', 'km-228-m05'].includes(card.id))) expected = 'いちにち';
    return [{ surface: m[0], expected: expected + (m[3] ? 'かん' : ''), at: m.index }];
  });
}
async function readingRows() {
  const { context, page } = await newPage('readings');
  try {
    await deckStart(page, 'mcd'); await page.locator('#kp-reveal').click(); await resting(page);
    let dayCards = 0, asciiCards = 0;
    for (const deck of ['kotoba-mine', 'kotoba-mcd']) {
      const data = await page.evaluate(async deck => ({ deck: await (await fetch(`decks/${deck}/deck.json`)).json(), tokens: await (await fetch(`decks/${deck}/tokens.json`)).json() }), deck);
      for (const card of data.deck.words.flatMap(w => w.cards)) {
        const expected = expectedDates(card);
        if (!expected.length) continue;
        if (expected.some(r => /日/.test(r.surface))) dayCards++;
        if ([...card.ja.matchAll(/(?<![0-9])([0-9]+)日/g)].some(m => Number(m[1]) >= 1 && Number(m[1]) <= 31)) asciiCards++;
        const rendered = await page.evaluate(async ({ card, expected }) => {
          const m = await import('./decks/player/mount.js');
          const p = m.sentenceNodes(Object.freeze(structuredClone(card)), { front: false });
          document.querySelector('#hfix-reading-probe')?.remove(); p.id = 'hfix-reading-probe'; document.querySelector('.kp').append(p);
          const ruby = [...p.querySelectorAll('ruby')].map(n => ({ surface: [...n.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''), reading: n.querySelector('rt')?.textContent }));
          return { ruby, expected: expected.map(e => ({ ...e, found: ruby.some(r => r.surface === e.surface && r.reading === e.expected) })) };
        }, { card, expected });
        check('readings', `${deck}/${card.id}: numeric dates and months`, rendered.expected.every(e => e.found), rendered);
      }
      const night = data.tokens.defs['徹夜'];
      check('readings', `${deck}: 一晩中 in 徹夜 definition`, night.some(r => r[0] === '一晩中' && r[2] === 'ひとばんじゅう'), { night });
      if (deck === 'kotoba-mcd') {
        const gloss = data.tokens.defs['ラピダス'];
        check('readings', 'ラピダス custom gloss is shipped and token is a lookup word', gloss?.map(r => r[0]).join('') === '最先端の半導体の量産を目指す日本の企業。' && data.tokens.passages.some(rows => rows.some(r => r[0] === 'ラピダス' && r[3] === '語')), { gloss });
      }
    }
    check('inventory', '54 ASCII day cards plus full-width dates and 100-day duration', asciiCards === 54 && dayCards === 57, { asciiCards, dayCards });
    await page.locator('#hfix-reading-probe').evaluate(n => n.remove());
    // The custom definition must also survive the native word lookup, on both occurrences.
    for (const id of ['km-063-m07', 'km-051-m07']) {
      await page.evaluate(id => localStorage.setItem('bunki-cloze:kotoba-mcd', JSON.stringify({format:'bunki-cloze-state',version:1,deckId:'kotoba-mcd',groupsOff:[],log:[],cards:{[id]:{due:'2020-01-01T00:00:00.000Z',stability:20,difficulty:5,state:2,reps:3,lapses:0,elapsed_days:20,scheduled_days:20}}})), id);
      await deckStart(page, 'mcd', {newPerDay:0,readings:'on',zoom:'full'});
      assert.equal(await page.locator('#kp-card').getAttribute('data-card'), id, 'Native Rapidus fixture card');
      await page.locator('#kp-reveal').click(); await resting(page);
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mcd')));
      const token = page.locator('#kp-card .kp-sentence .kp-tok').filter({hasText:'ラピダス'}).first();
      const count = await token.count();
      if (count) { await token.click(); await resting(page); if (await token.getAttribute('data-ladder-rung') === 'reading') { await token.click(); await resting(page); } }
      const shown = await page.locator('#mini[data-from="deck"] .mini-gloss').allTextContents();
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mcd')));
      check('readings', `native ラピダス ${id}: custom definition opens without grading`, count === 1 && shown.includes('最先端の半導体の量産を目指す日本の企業。') && JSON.stringify(before.cards) === JSON.stringify(after.cards) && JSON.stringify(before.log) === JSON.stringify(after.log), {count,shown,before,after});
      await page.screenshot({path:join(OUT,'shots',`rapidus-${id}.png`)});
    }

  } finally { await context.close(); }
}
const KANJI = {
  '生': { on: ['セイ', 'ショウ'], kun: ['い.きる', 'い.かす', 'い.ける', 'う.まれる', 'うま.れる', 'う.まれ', 'うまれ', 'う.む', 'お.う', 'は.える', 'は.やす', 'き', 'なま', 'なま-', 'な.る', 'な.す', 'む.す', '-う'], lessonOn: ['セイ', 'ショウ'], lessonKun: ['い.きる', 'い.かす', 'い.ける'], officialReadings: [], readingsState: 'complete' },
  '中': { on: ['チュウ', 'ジュウ'], kun: ['なか', 'うち', 'あた.る'], lessonOn: ['チュウ'], lessonKun: ['なか', 'うち', 'あた.る'], officialReadings: ['ジュウ'], readingsState: 'complete' }
};
// Independent expected display, built from the pinned lesson/sidecar bytes rather than the UI helper.
function actualKanjiContract(id) {
  const lesson = JSON.parse(read('data/share_alike/kanji.json')).kanji[id];
  const extra = JSON.parse(read('data/share_alike/reference-extra.json'));
  const row = extra.kanjiReadings?.find(([glyph]) => glyph === id);
  if (!lesson || !row) return null;
  const officialReadings = (extra.officialReadings || []).filter(([glyph]) => glyph === id).map(([,reading]) => reading);
  const isOn = reading => /[ァ-ヺ]/u.test(reading.replace(/[.-]/gu, ''));
  return { on: [...new Set([...(lesson.on || []), ...row[1], ...officialReadings.filter(isOn)])],
    kun: [...new Set([...(lesson.kun || []), ...row[2], ...officialReadings.filter(reading => !isOn(reading))])],
    lessonOn: [...(lesson.on || [])], lessonKun: [...(lesson.kun || [])], officialReadings, readingsState: 'complete' };
}
function readKanjiReview() {
  return { lines: [...document.querySelectorAll('.review-kanji-readings')].map(n => ({
    label: n.querySelector('.sense-pos')?.textContent,
    readings: [...n.querySelectorAll('.review-kanji-reading')].map(r => r.dataset.reading) })),
    text: document.querySelector('.review-reading-row')?.textContent || '',
    state: document.querySelector('[data-kanji-readings]')?.dataset.kanjiReadings || null,
    readings: [...document.querySelectorAll('.review-kanji-reading')].map(n => ({
      reading: n.dataset.reading, text: n.textContent, lesson: n.dataset.lessonSelection === 'true' })),
    overflow: document.documentElement.scrollWidth - innerWidth,
    document: { url: location.href, timeOrigin: performance.timeOrigin }, view: document.body.dataset.view };
}
function kanjiReviewMatches(observed, record, state) {
  const expected = record.on.concat(record.kun).map(reading => {
    const lesson = record.lessonOn.concat(record.lessonKun).includes(reading);
    return { reading, text: reading + (lesson ? ' (lesson)' : '') + (record.officialReadings.includes(reading) ? '*' : ''), lesson };
  });
  return observed.state === state && observed.lines.length === 2 && observed.lines.every((line,i) =>
    line.label === (i ? 'Kun readings · ' : 'On readings · ') && JSON.stringify(line.readings) === JSON.stringify(record[i ? 'kun' : 'on'])) &&
    JSON.stringify(observed.readings) === JSON.stringify(expected) && observed.text.includes('On readings') && observed.text.includes('Kun readings') &&
    (state === 'complete' ? !/unavailable|Loading/u.test(observed.text)
      : state === 'pending' ? observed.text.includes('Loading the complete reading set') : observed.text.includes('complete reading set is unavailable')) &&
    (!record.officialReadings.length || observed.text.includes('* Reading supplied by the Jōyō Kanji Table.')) && observed.overflow === 0;
}
async function kanjiRepaintRow() {
  const name = '生/390/pending-to-complete: real reference bytes repaint the same review without writes';
  const canonical = actualKanjiContract('生');
  // A retained pre-Kanji-trust base lacks this capability; name that red without accepting a harness failure.
  if (mode === 'base' && !canonical) { check('KT1', name, false, { canonicalReadingsAbsent: true }); return; }
  assert(canonical, 'Merged build contains the complete canonical 生 reading set');
  assert(canonical.on.length + canonical.kun.length > canonical.lessonOn.length + canonical.lessonKun.length,
    'Real complete set contains readings beyond the lesson selection');
  const file = 'data/share_alike/reference-extra.json', body = readFileSync(join(SITE, file));
  const expectedSha256 = identity.files.find(entry => entry.path === file)?.sha256;
  assert.equal(hash(body), expectedSha256, 'Held response is the exact pinned artifact file');
  const protectedKeys = ['srs', 'taken', 'revlog', 'obslog', 'stats', 'suspended'];
  const roots = record => Object.fromEntries(protectedKeys.map(key => [key, record[key]]));
  const { context, page } = await newPage('KT1', 390, 844);
  let release, watchdog, requests = 0, forcedRelease = false, released = false, heldAt = null, servedSha256 = null;
  const held = new Promise(resolve => { release = () => { released = true; clearTimeout(watchdog); resolve(); }; });
  try {
    if (mode === 'control') await routeFile(page, 'corridor.js', source => replaceOne(source,
      "if (item.t === 'kanji') {\n      // Kanji-trust owns", "if (false) {\n      // Kanji-trust owns"), 'restore flat short reading output for real repaint control');
    await page.route('**/data/share_alike/reference-extra.json', async route => {
      requests += 1; heldAt = Date.now();
      // The product aborts this optional request after 8 s. Release genuine bytes before that bound;
      // any watchdog release fails the row, so a slow setup cannot masquerade as the intended transition.
      watchdog = setTimeout(() => { forcedRelease = true; release(); }, 6500);
      await held;
      servedSha256 = hash(body);
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
    const seed = { v: 1, taken: [{ t: 'kanji', id: '生', label: '生', ts: 1, started: 1 }],
      srs: {}, revlog: [], obslog: [], stats: {}, suspended: {}, srsPrefs: { newPerDay: 20 } };
    await page.evaluate(seed => localStorage.setItem('kairo-corridor-v1', JSON.stringify(seed)), seed);
    await page.goto(host.origin + '/index.html?entry=shelf&ui=bi', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    const before = roots(await readAppRecord(page));
    assert(before.taken.some(item => item.t === 'kanji' && item.id === '生'), 'Real repaint fixture imported');
    await page.locator('#tray').click(); await page.locator('#review-start').click(); await page.locator('#reveal').click();
    const pending = await page.evaluate(readKanjiReview), during = roots(await readAppRecord(page));
    const wasHeld = requests === 1 && !released && !forcedRelease;
    const pendingRecord = { ...canonical, on: canonical.lessonOn, kun: canonical.lessonKun, officialReadings: [] };
    const pendingPass = kanjiReviewMatches(pending, pendingRecord, 'pending');
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/' + file);
    const releasedAfterMs = Date.now() - heldAt;
    release();
    const response = await responsePromise, receivedSha256 = hash(await response.body());
    if (mode === 'branch') await page.locator('[data-kanji-readings="complete"]').waitFor();
    // No click, reload, navigation or UI helper call after release. The control need not have a completion marker:
    // it is judged on its returned DOM, never on a timeout being mistaken for a killed mutation.
    await resting(page);
    const complete = await page.evaluate(readKanjiReview), after = roots(await readAppRecord(page));
    const unchanged = JSON.stringify(before) === JSON.stringify(during) && JSON.stringify(before) === JSON.stringify(after);
    const sameDocument = JSON.stringify(pending.document) === JSON.stringify(complete.document);
    const pass = wasHeld && !forcedRelease && pendingPass && response.status() === 200 && requests === 1 &&
      expectedSha256 === servedSha256 && expectedSha256 === receivedSha256 &&
      kanjiReviewMatches(complete, canonical, 'complete') && sameDocument && pending.view === 'review' && complete.view === 'review' && unchanged;
    check('KT1', name, pass, { pending, complete, expected: canonical, protectedKeys, roots: { before, during, after },
      unchanged, sameDocument, wasHeld, forcedRelease, requests, releasedAfterMs,
      response: { file, bytes: body.length, expectedSha256, servedSha256, receivedSha256, status: response.status() },
      afterReleaseActions: 'wait for public completion, observe; no click, reload, navigation or app helper' });
  } finally { release(); clearTimeout(watchdog); await context.close(); }
}
async function kanjiRows() {
  for (const spec of [{id:'生',fixture:false,state:mode === 'base' ? 'listed' : 'complete'}, {id:'生',fixture:true,state:'complete'}, {id:'中',fixture:true,state:'complete'}, {id:'生',fixture:true,state:'complete',width:320}, {id:'生',fixture:true,state:'pending'}, {id:'生',fixture:true,state:'failed'}]) {
    const {id,fixture,state,width=390} = spec;
    const contract = structuredClone(KANJI);
    if (state !== 'complete') for (const k of Object.values(contract)) Object.assign(k, {on:k.lessonOn,kun:k.lessonKun,officialReadings:[],readingsState:state});
    const { context, page } = await newPage('KT1', width, 844);
    try {
      if (fixture || mode === 'control') await routeFile(page, 'corridor.js', source => {
        let s = source;
        if (fixture) s = replaceOne(s, 'function kanjiDisplayRecord(id, reference = null) {', `function kanjiDisplayRecord(id, reference = null) {\n  const hfixContract = ${JSON.stringify(contract)}; if (hfixContract[id]) return hfixContract[id];`);
        if (mode === 'control') s = replaceOne(s, "if (item.t === 'kanji') {\n      // Kanji-trust owns", "if (false) {\n      // Kanji-trust owns");
        return s;
      }, fixture ? 'canonical Kanji-trust display contract fixture' : 'restore flat short reading output');
      const seed = { v: 1, taken: [{ t: 'kanji', id, label: id, ts: Date.now() - 1e6, started: Date.now() - 1e6 }], srs: {}, revlog: [], obslog: [], stats: {}, suspended: {}, srsPrefs: { newPerDay: 20 } };
      await page.evaluate(seed => localStorage.setItem('kairo-corridor-v1', JSON.stringify(seed)), seed);
      await page.goto(host.origin + '/index.html?entry=shelf&ui=bi'); await page.waitForFunction(() => document.body.dataset.ready === '1');
      const before = await readAppRecord(page); assert(before.taken.some(t => t.id === id && t.t === 'kanji'), 'fixture imported');
      await page.locator('#tray').click(); await page.locator('#review-start').click(); await page.locator('#reveal').click();
      if (!fixture && mode === 'branch') await page.locator('[data-kanji-readings="complete"]').waitFor();
      await resting(page);
      const observed = await page.evaluate(() => ({ lines: [...document.querySelectorAll('.review-kanji-readings')].map(n => ({label:n.querySelector('.sense-pos')?.textContent, readings:[...n.querySelectorAll('.review-kanji-reading')].map(r=>r.dataset.reading)})), text: document.querySelector('.review-reading-row')?.textContent, state: document.querySelector('[data-kanji-readings]')?.dataset.kanjiReadings, readings: [...document.querySelectorAll('.review-kanji-reading')].map(n => ({ reading: n.dataset.reading, text: n.textContent, lesson: n.dataset.lessonSelection === 'true' })), overflow: document.documentElement.scrollWidth - innerWidth }));
      const after = await readAppRecord(page);
      const unchanged = ['srs','taken','revlog','obslog','stats'].every(key => JSON.stringify(before[key]) === JSON.stringify(after[key]));
      const actualLesson = JSON.parse(read('data/share_alike/kanji.json')).kanji[id];
      const expectedRecord = fixture ? contract[id] : mode === 'base'
        ? { ...actualLesson, lessonOn: actualLesson.on, lessonKun: actualLesson.kun, officialReadings: [] } : actualKanjiContract(id);
      assert(expectedRecord, 'Actual merged kanji has complete canonical data');
      const expected = expectedRecord.on.concat(expectedRecord.kun).map(reading => {
        const lesson = expectedRecord.lessonOn.concat(expectedRecord.lessonKun).includes(reading);
        return { reading, lesson, text: reading + (lesson ? ' (lesson)' : '') + (expectedRecord.officialReadings.includes(reading) ? '*' : '') };
      });
      const statusHonest = observed.state === state && (state === 'complete' ? !/unavailable|Loading/.test(observed.text) : state === 'pending' ? observed.text.includes('Loading the complete reading set') : observed.text.includes('complete reading set is unavailable'));
      const linesCorrect = observed.lines.length === 2 && observed.lines.every((line,i) => line.label === (i ? 'Kun readings · ' : 'On readings · ') && JSON.stringify(line.readings) === JSON.stringify(expectedRecord[i ? 'kun' : 'on']));
      const pass = linesCorrect && statusHonest && observed.text.includes('On readings') && observed.text.includes('Kun readings') &&
        JSON.stringify(observed.readings) === JSON.stringify(expected.map(({reading,text,lesson})=>({reading,text,lesson}))) &&
        (!expectedRecord.officialReadings.length || observed.text.includes('* Reading supplied by the Jōyō Kanji Table.'));
      check('KT1', `${id}/${width}/${state}: ${fixture ? 'canonical-contract fixture' : mode === 'base' ? 'actual base lacks complete set' : 'actual merged canonical readings'}`, pass && unchanged && observed.overflow === 0, { observed, unchanged });
      await page.screenshot({ path: join(OUT, 'shots', `kanji-${id}-${width}-${state}-${fixture ? 'contract-fixture' : 'actual'}.png`) });
    } finally { await context.close(); }
  }
  await kanjiRepaintRow();
}
async function diversityRows() {
  const { context, page } = await newPage('X21');
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'prototypes/corridor/tools/hfix2c-diversity.json'), 'utf8'));
    if (mode === 'control') await routeFile(page, `decks/${manifest[0].deck}/deck.json`, s => { const d = JSON.parse(s); const c = d.words.flatMap(w => w.cards).find(c => c.id === manifest[0].id); assert(c); c.ja = '古い共通の終わりにほかならない。'; return JSON.stringify(d); }, 'repeated old prose introduced');
    const decks = {};
    for (const d of [...new Set(manifest.map(r => r.deck))]) decks[d] = await page.evaluate(async d => (await (await fetch(`/decks/${d}/deck.json`)).json()).words.flatMap(w => w.cards), d);
    const rows = manifest.map(r => ({ ...r, actual: hash(decks[r.deck].find(c => c.id === r.id)?.ja || '') }));
    check('X21', 'all 52 accepted diversity passages already landed', rows.length === 52 && rows.every(r => r.actual === r.sha256), rows);
  } finally { await context.close(); }
}
try {
  for (const [key, fn] of [['X20', undoRows], ['X8', coachRows], ['X4', layoutRows], ['X4-return', remountRow], ['readings', readingRows], ['KT1', kanjiRows], ['X21', diversityRows]]) {
    if (only && only !== key) continue;
    try { await fn(); } catch (error) { receipt.errors.push({ group: key, error: error.stack }); console.error(error); }
  }
} finally { await browser.close(); await host.close(); }
const groups = [...new Set(receipt.rows.map(r => r.group))];
receipt.groups = Object.fromEntries(groups.map(g => [g, { rows: receipt.rows.filter(r => r.group === g).length, red: receipt.rows.filter(r => r.group === g && !r.pass).length }]));
const expectedCounts = {X20:4,'X20-key':4,X8:10,X4:4,'X4-return':1,KT1:7,X21:1,inventory:1,readings:104};
const selectedGroups = only ? (only === 'X20' ? ['X20','X20-key'] : only === 'readings' ? ['readings','inventory'] : [only]) : Object.keys(expectedCounts);
function expectedBase(row) {
  if (['inventory','X20-key','X21'].includes(row.group)) return true;
  if (row.group === 'X20') return row.name.startsWith('390:');
  if (row.group !== 'readings') return false;
  const match = row.name.match(/^(kotoba-(?:mine|mcd))\/([^:]+):/);
  if (!match) return false; // the night suffix and custom gloss are both defective on base
  const card = JSON.parse(read(`decks/${match[1]}/deck.json`, BASE)).words.flatMap(w => w.cards).find(c => c.id === match[2]);
  assert(card);
  return expectedDates(card).every(e => card.ruby.some(([surface,reading]) => surface === e.surface && reading === e.expected));
}
if (mode === 'base') for (const row of receipt.rows) row.expectedBase = expectedBase(row);
const complete = selectedGroups.every(g => receipt.groups[g]?.rows === expectedCounts[g]) &&
  new Set(receipt.rows.map(row => row.group + '/' + row.name)).size === receipt.rows.length &&
  (only || receipt.rows.length === 136);
receipt.pass = complete && !receipt.errors.length && (mode === 'branch' ? receipt.rows.every(r => r.pass) : mode === 'control'
  ? receipt.rows.every(r => ['inventory','X20-key'].includes(r.group) ? r.pass : !r.pass)
  : receipt.rows.every(row => row.pass === row.expectedBase));
receipt.uptimeEnd = uptime(); receipt.verifierSha256 = hash(readFileSync(fileURLToPath(import.meta.url)));
writeFileSync(join(OUT, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ pass: receipt.pass, groups: receipt.groups, errors: receipt.errors.length }));
process.exitCode = receipt.pass ? 0 : 1;
