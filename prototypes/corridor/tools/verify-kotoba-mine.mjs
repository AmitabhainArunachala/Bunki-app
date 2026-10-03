/**
 * 単語帳 (言葉の鉱脈) verifier. Done = this is green.
 *
 * Half one reads the shipped deck as DATA: every card's anchor `i` must land
 * on a token of its module's article whose base form IS the card's headword
 * — the exact condition the review cloze (renderSentenceTokens, targetId ===
 * token.b) needs to blank the word inside its mined sentence — and every
 * module's article must stand on the shelf index as an original-lane text.
 *
 * Half two drives the room in real Chromium:
 *   · the shelf door opens the deck; a module lists every word;
 *   · nothing is enrolled until ぜんぶ覚える is pressed, and then every row
 *     is a started 覚える row carrying ctx into the module's article, and
 *     the module becomes a named list;
 *   · この鉱脈だけ復習 opens a review whose face is the mined sentence with
 *     the word blanked;
 *   · the record survives a reload without quarantine.
 *
 * Checks one immutable built artifact (KAIRO_SITE_DIR), including native
 * storage failure and responsive screenshots. No source-text assertion.
 * Usage: node verify-kotoba-mine.mjs   (regenerate data: python3 decks/kotoba-mine/tools/build_deck.py)
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecord, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const CORRIDOR_DIR = resolveCorridorSite();
const EVIDENCE_DIR = resolveCorridorEvidence();
const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');
const DECK_PATH = resolve(DATA_DIR, 'share_alike/decks/kotoba-mine.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function startServer(rootDir = CORRIDOR_DIR, refuse = () => false, refuseAfterMs = 0) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    if (refuse(rel)) {
      setTimeout(() => {
        response.writeHead(503, { 'cache-control': 'no-store', 'content-type': 'text/plain' });
        response.end('unavailable');
      }, refuseAfterMs);
      return;
    }
    const file = resolve(rootDir, rel);
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

let failures = 0;
const pageErrors = [];
function watchErrors(context, expected = () => false) {
  context.on('console', (m) => {
    if (m.type() === 'error' && !expected(m)) pageErrors.push(m.text());
  });
  context.on('weberror', (e) => pageErrors.push(e.error().stack || String(e.error())));
}
function check(name, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/* ------------------------------------------------- half one: the deck */
function verifyDeck() {
  const deck = readJson(DECK_PATH);
  const index = readJson(resolve(DATA_DIR, 'articles/index.json'));
  const rows = new Map(index.articles.map((a) => [a.id, a]));
  const receipts = readJson(resolve(DATA_DIR, 'articles/title-receipts.json'));
  check('the deck is schema 1, names its law and both licences', deck.schemaVersion === 1 && /door, not a schedule/u.test(deck.law) &&
    /JMdict/u.test(deck.licence.english_glosses) && /Bunki original/u.test(deck.licence.passages_sentences_definitions));
  const cards = deck.modules.flatMap((m) => m.cards);
  const heads = new Set(cards.map((c) => c.n));
  check('every mined word is one card — 323 in all, none twice', cards.length === 323 && heads.size === 323, `${cards.length} cards, ${heads.size} distinct`);
  const anchorProblems = [];
  const shapeProblems = [];
  const titleProblems = [];
  for (const m of deck.modules) {
    const row = rows.get(m.article);
    if (!row) {
      anchorProblems.push(`${m.id}: article ${m.article} not on the shelf index`);
      continue;
    }
    if (row.pool !== 'original' || row.licence !== 'Bunki original' || row.review) {
      shapeProblems.push(`${m.article}: index row provenance`);
    }
    const body = readJson(resolve(DATA_DIR, 'articles', row.file));
    const receipt = receipts.authored?.[m.article];
    const sourceModule = readJson(resolve(REPO_DIR, `decks/kotoba-mine/source/modules/${m.id}.json`));
    if (row.titleEnSource !== 'Bunki original, bilingual title' ||
        receipt?.path !== `decks/kotoba-mine/source/modules/${m.id}.json` ||
        !receipt.titleJa || !receipt.titleEn || receipt.titleJa !== row.title ||
        receipt.titleEn !== row.titleEn || body.title !== receipt.titleJa ||
        m.passageTitle !== receipt.titleJa || sourceModule.passage.title !== receipt.titleJa ||
        sourceModule.passage.title_en !== receipt.titleEn) {
      titleProblems.push(`${m.article}: bilingual title does not match its exact authored receipt`);
    }
    for (const c of m.cards) {
      if (!c.w || !c.r || !c.g || !c.d || !Array.isArray(c.s) || c.s.length < 2) shapeProblems.push(`${m.id}#${c.n}: fields`);
      for (const [ja, form, en] of c.s || []) if (!ja.includes(form) || !en) shapeProblems.push(`${m.id}#${c.n}: sentence`);
      const tok = body.tokens[c.i];
      if (!Number.isInteger(c.i) || !tok) anchorProblems.push(`${m.id}#${c.n} ${c.w}: no anchor`);
      else if (tok.b !== c.w || !tok.c || !tok.f?.length) anchorProblems.push(`${m.id}#${c.n} ${c.w}: token ${tok.s}/${tok.b}`);
    }
  }
  check('every module passage stands on the shelf as an original-lane text', shapeProblems.length === 0, shapeProblems.slice(0, 4).join(' | ') || `${deck.modules.length} passages`);
  check('every module’s bilingual shelf title matches its authored title receipt and built passage', titleProblems.length === 0,
    titleProblems.slice(0, 4).join(' | ') || `${deck.modules.length} exact receipts`);
  check('every card is anchored on a live token whose base form is its headword (the cloze can blank it)', anchorProblems.length === 0, anchorProblems.slice(0, 4).join(' | ') || `${cards.length}/${cards.length}`);
  return deck;
}

async function shelf(page, base) {
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  await openShelfTools(page);
}

async function moduleOverview(page, base, deck) {
  await shelf(page, base);
  await page.locator('#decks-link').click();
  await page.locator(`[data-deck-module="${deck.modules[0].id}"]`).waitFor({ timeout: 15000 });
}

async function openModule(page, mod) {
  await page.locator(`[data-deck-module="${mod.id}"]`).click();
  await page.locator('#deck-enroll-all').waitFor({ timeout: 8000 });
}

async function seedRecord(context, record) {
  await context.addInitScript((record) => {
    if (location.protocol === 'about:') return;
    if (!localStorage.getItem('__deck_seeded')) {
      localStorage.setItem('kairo-corridor-v1', JSON.stringify(record));
      localStorage.setItem('__deck_seeded', '1');
    }
  }, record);
}

const seedLegacyRow = (context, row) => seedRecord(context, { v: 1, taken: [row], srs: {} });

async function screenshot(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const layout = await page.evaluate(() => {
    const rect = (box) => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height });
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
    };
    const context = document.body.dataset.view === 'contextdeck';
    const level = document.querySelector(context ? '.level-chip.cd-level' : '.level-chip.deck-level');
    const levelBox = level?.getBoundingClientRect();
    const hit = levelBox && document.elementFromPoint(levelBox.left + levelBox.width / 2, levelBox.top + levelBox.height / 2);
    const levelState = {
      text: level?.textContent.trim() || '',
      visible: visible(level) && levelBox.left >= -1 && levelBox.right <= innerWidth + 1 &&
        levelBox.top >= -1 && levelBox.bottom <= innerHeight + 1 && !!hit && level.contains(hit),
      bounds: levelBox ? rect(levelBox) : null,
    };
    const column = document.querySelector('.cd-column');
    const dock = document.querySelector('.cd-dock');
    let textDock = null;
    if (column && dock) {
      const columnBox = column.getBoundingClientRect();
      const dockBox = dock.getBoundingClientRect();
      const walker = document.createTreeWalker(column, NodeFilter.SHOW_TEXT);
      const overlaps = [];
      let textRects = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || !visible(node.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          // Ranges retain off-screen parts of a scrolling column. Probe only
          // their painted intersection with the column and the viewport.
          const painted = {
            left: Math.max(box.left, columnBox.left, 0), top: Math.max(box.top, columnBox.top, 0),
            right: Math.min(box.right, columnBox.right, innerWidth), bottom: Math.min(box.bottom, columnBox.bottom, innerHeight),
          };
          if (painted.right <= painted.left || painted.bottom <= painted.top) continue;
          textRects += 1;
          if (painted.right > dockBox.left + 1 && painted.left < dockBox.right - 1 &&
              painted.bottom > dockBox.top + 1 && painted.top < dockBox.bottom - 1) {
            overlaps.push({ text: node.textContent.trim().slice(0, 60), bounds: rect(box), painted });
          }
        }
      }
      textDock = { column: rect(columnBox), dock: rect(dockBox), dockVisible: visible(dock), textRects, overlaps };
    }
    return {
      width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      view: document.body.dataset.view, level: levelState, textDock,
      outside: [...document.querySelectorAll('main button, main h1, main p')].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.left < -1 || box.right > innerWidth + 1);
      }).map((node) => ({ tag: node.tagName, className: node.className, text: node.textContent.slice(0, 60) })),
    };
  });
  check(`${name} has no horizontal overflow`, layout.documentWidth <= layout.width + 1 && layout.outside.length === 0,
    JSON.stringify(layout));
  check(`${name} shows its level without inventing a grade`, layout.level.visible &&
    (layout.view === 'contextdeck' ? /級未判定|Level ungraded/u.test(layout.level.text) : layout.level.text === 'N1'),
    JSON.stringify(layout.level));
  if (/-context-(front|answer)$/u.test(name)) {
    check(`${name} keeps visible context text clear of the grading dock`,
      !!layout.textDock?.dockVisible && layout.textDock.textRects > 0 && layout.textDock.overlaps.length === 0,
      JSON.stringify(layout.textDock));
  }
  writeFileSync(resolve(EVIDENCE_DIR, `${name}-layout.json`), JSON.stringify(layout, null, 2) + '\n');
  await page.screenshot({ path: resolve(EVIDENCE_DIR, `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function verifyResponsiveScreens(browser, base, deck) {
  for (const viewport of [{ width: 1368, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    watchErrors(context);
    await silenceBrowserAudio(context);
    const page = await context.newPage();
    const prefix = `kotoba-mine-${viewport.width}x${viewport.height}`;
    try {
      await moduleOverview(page, base, deck);
      await screenshot(page, `${prefix}-overview`);
      await openModule(page, deck.modules[0]);
      await screenshot(page, `${prefix}-module`);
      await shelf(page, base);
      await page.locator('#context-deck-link').click();
      await page.locator('#cd-start').waitFor({ timeout: 15000 });
      await page.waitForFunction(() => !!document.querySelector('link[data-context-deck]')?.sheet, null, { timeout: 8000 });
      await screenshot(page, `${prefix}-context-home`);
      await page.locator('.cd-room').getByRole('button', { name: '目次', exact: true }).click();
      await page.locator('.cd-toc-row').first().waitFor();
      await screenshot(page, `${prefix}-context-index`);
      const scrolled = await page.evaluate(() => { window.scrollTo(0, 400); return window.scrollY; });
      await page.locator('#lang [data-lang="bi"]').click();
      const kept = await page.evaluate(() => window.scrollY);
      check(`${prefix} the context index keeps its place when the app header re-renders the room`,
        scrolled > 0 && Math.abs(kept - scrolled) <= 1, `${scrolled} → ${kept}`);
      await page.locator('.cd-toc-row').first().click();
      await page.locator('.cd-backline').waitFor();
      await screenshot(page, `${prefix}-context-preview`);
      await page.locator('.cd-room').getByRole('button', { name: '目次へ', exact: true }).click();
      await page.locator('.cd-room').getByRole('button', { name: '戻る', exact: true }).click();
      await page.locator('#cd-start').waitFor();
      await page.locator('#cd-start').click();
      await page.locator('#cd-got').waitFor({ timeout: 8000 });
      await screenshot(page, `${prefix}-context-front`);
      await page.locator('#cd-got').click();
      await page.locator('#cd-good').waitFor({ timeout: 8000 });
      await screenshot(page, `${prefix}-context-answer`);
      // Leaving a card through the now-visible app header must release the
      // deck's focus flag, so ordinary navigation still works afterwards.
      await page.locator('#back').click();
      await page.waitForFunction(() => document.body.dataset.view === 'shelf');
      const header = await page.locator('.chrome').evaluate((node) => {
        const style = getComputedStyle(node);
        const search = node.querySelector('#chrome-search');
        const box = search.getBoundingClientRect();
        return {
          focus: document.documentElement.dataset.cdFocus ?? null,
          opacity: Number(style.opacity), pointerEvents: style.pointerEvents,
          searchHit: search.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
        };
      });
      check(`${prefix} leaving a context card restores a visible and clickable app header`,
        header.focus !== '1' && header.opacity > 0 && header.pointerEvents !== 'none' && header.searchHit,
        JSON.stringify(header));
      await page.locator('#chrome-search').click();
      await page.waitForFunction(() => document.body.dataset.view === 'search');
      await page.locator('#back').click();
      await page.waitForFunction(() => document.body.dataset.view === 'shelf');
      await openShelfTools(page);
      await page.locator('#context-deck-link').click();
      await page.locator('#cd-good').waitFor({ timeout: 8000 });
      check(`${prefix} context review resumes its current answer after using the app header`,
        await page.locator('#cd-good').isVisible());
      // Complete the fresh daily queue through real controls so its end screen
      // must keep the same visible, explicitly ungraded level label.
      for (let card = 0; card < 40; card += 1) {
        await page.locator('#cd-good').click();
        if (await page.getByRole('heading', { name: '今日の分はここまで', exact: true }).count()) break;
        await page.locator('#cd-got').click();
      }
      await page.getByRole('heading', { name: '今日の分はここまで', exact: true }).waitFor({ timeout: 8000 });
      await screenshot(page, `${prefix}-context-done`);
      check(`${prefix} opening, revealing and grading context cards enrolls no corridor words`, (await readAppRecord(page)).taken.length === 0);
    } finally {
      await context.close();
    }
  }
}

async function verifyGuardedEnrollment(browser, base, deck, preRow) {
  for (const choice of ['one', 'all']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    watchErrors(context);
    await silenceBrowserAudio(context);
    await seedLegacyRow(context, preRow);
    const page = await context.newPage();
    try {
      const mod = deck.modules[0];
      await moduleOverview(page, base, deck);
      await openModule(page, mod);
      const before = await readAppRecordSnapshot(page);
      await armRecordWriteFailure(page, 'quota', { roots: ['taken'] });
      const selector = choice === 'all' ? '#deck-enroll-all' : `[data-deck-enroll="${mod.cards[0].w}"]`;
      await page.locator(selector).click();
      await page.waitForFunction(() => window.__recordTestFault?.fired > 0, null, { timeout: 10000 });
      await page.locator('#record-reload').waitFor({ state: 'visible', timeout: 8000 });
      const after = await readAppRecordSnapshot(page);
      const fault = await clearRecordWriteFailure(page);
      const claimed = await page.locator('[data-deck-enroll]').evaluateAll((buttons) =>
        buttons.filter((button) => button.textContent.includes('✓')).map((button) => button.dataset.deckEnroll));
      check(`${choice}-word enrollment rejects a real native storage failure without changing the record or claiming new words`,
        fault.fired > 0 && JSON.stringify(after.record) === JSON.stringify(before.record) &&
        JSON.stringify(after.archive) === JSON.stringify(before.archive) && after.revision === before.revision &&
        claimed.length === 1 && claimed[0] === preRow.id, JSON.stringify({ fault, claimed, revision: after.revision }));
      writeFileSync(resolve(EVIDENCE_DIR, `kotoba-mine-${choice}-failed-write.json`), JSON.stringify({
        syntheticFault: 'QuotaExceededError after real native IndexedDB puts', fault, before, after, claimed,
      }, null, 2) + '\n');
      await Promise.all([page.waitForEvent('load'), page.locator('#record-reload').click()]);
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
      await moduleOverview(page, base, deck);
      await openModule(page, mod);
      await page.locator(selector).click();
      const expected = choice === 'all' ? mod.cards.length : 2;
      const recovered = await waitForAppRecord(page, (record) => record.taken.length === expected, { description: `${choice} enrollment after reload` });
      check(`${choice}-word enrollment recovers after the app’s reload control`, recovered.taken.length === expected);
    } finally {
      await context.close();
    }
  }
}

/* A word saved from the reader names its dictionary entry. The deck matches that card through
 * its module's dictionary rows: the module list counts it before the module is opened, and a
 * module whose rows failed to load holds enrollment, retrying on its own, from a held button,
 * and after reconnecting, until they load. */
async function verifyReaderEntryCards(browser, deck) {
  const mod = deck.modules.find((m) => m.cards.some((c) => c.w === '新体制'));
  const card = mod.cards.find((c) => c.w === '新体制');
  const other = { w: '県議会', seq: '1809820' };
  const record = { v: 1, srs: {},
    taken: [{ t: 'word', id: card.w, label: card.w, kind: '語', kindEn: 'word', from: null, ts: 1, entrySeq: '1362140', cueReading: card.r }],
    deepWords: { [card.w]: { r: card.r, m: ['new order', 'new system'], seq: '1362140' } } };
  let refusing = false;
  const { server, base } = await startServer(CORRIDOR_DIR, (rel) => refusing && rel.startsWith('data/share_alike/dict-v2/'), 800);
  // every 覚える and ぜんぶ覚える in the module, all held the same way
  const heldAs = (page, label, disabled, timeout) => page.waitForFunction(([label, disabled, count]) => {
    const buttons = [...document.querySelectorAll('[data-deck-enroll], #deck-enroll-all')];
    return buttons.length === count && buttons.every((b) => b.disabled === disabled && b.textContent.includes(label));
  }, [label, disabled, mod.cards.length + 1], { timeout }).then(() => true, () => false);
  const buttons = (page) => page.locator('[data-deck-enroll], #deck-enroll-all').evaluateAll((all) =>
    all.slice(0, 3).map((b) => ({ id: b.id || b.dataset.deckEnroll, disabled: b.disabled, text: b.textContent })));
  try {
    for (const phase of ['count', 'retry']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      watchErrors(context, (m) => phase === 'retry' && m.location().url.includes('/data/share_alike/dict-v2/'));
      await silenceBrowserAudio(context);
      await seedRecord(context, record);
      const page = await context.newPage();
      try {
        refusing = phase === 'retry';
        await moduleOverview(page, base, deck);
        if (phase === 'count') {
          const score = `[data-deck-module="${mod.id}"] .mock-score`;
          const counted = await page.waitForFunction(([sel, want]) => document.querySelector(sel)?.textContent === want,
            [score, `1 / ${mod.cards.length}`], { timeout: 15000 }).then(() => true, () => false);
          check('the module list counts a word saved from the reader before its module is opened', counted,
            await page.locator(score).textContent());
          continue;
        }
        await openModule(page, mod);
        check('a module whose dictionary rows failed to load holds every 覚える and ぜんぶ覚える behind a retry',
          await heldAs(page, '辞書に接続できません', false, 8000), JSON.stringify(await buttons(page)));
        const retried = await heldAs(page, '辞書を読み込み中', true, 8000) && await heldAs(page, '辞書に接続できません', false, 8000);
        check('it tries the dictionary again on its own, saying 読み込み中 only while that load is in flight',
          retried, JSON.stringify(await buttons(page)));
        await page.locator(`[data-deck-enroll="${other.w}"]`).click();
        const pressed = await heldAs(page, '辞書を読み込み中', true, 2000) && await heldAs(page, '辞書に接続できません', false, 8000);
        const untouched = !(await readAppRecord(page)).taken.some((row) => row.id === other.w);
        check('a held button retries at once and saves nothing while the dictionary stays unreachable',
          pressed && untouched, JSON.stringify({ pressed, untouched, buttons: await buttons(page) }));
        refusing = false;
        await context.setOffline(true);
        await context.setOffline(false);
        const recovered = await page.waitForFunction(([w, o]) => {
          const mine = document.querySelector(`[data-deck-enroll="${w}"]`);
          const next = document.querySelector(`[data-deck-enroll="${o}"]`);
          return !!mine?.textContent.includes('✓') && !!next && !next.disabled && !next.textContent.includes('辞書');
        }, [card.w, other.w], { timeout: 15000 }).then(() => true, () => false);
        check('reconnecting loads the module’s rows: the reader’s card is matched and 覚える is offered again', recovered,
          JSON.stringify({ mine: await page.locator(`[data-deck-enroll="${card.w}"]`).textContent(),
            next: await page.locator(`[data-deck-enroll="${other.w}"]`).textContent() }));
        await page.locator(`[data-deck-enroll="${other.w}"]`).click();
        const saved = await waitForAppRecord(page, (r) => r.taken.some((row) => row.id === other.w),
          { description: `${other.w} enrolled after the rows loaded` });
        const row = saved.taken.find((t) => t.id === other.w);
        check('a word enrolled after the rows load is saved as its dictionary entry, one identity with the reader',
          row?.entrySeq === other.seq, JSON.stringify(row));
      } finally {
        await context.close();
      }
    }
  } finally {
    server.close();
  }
}

/* --------------------------------------------------- half two: the room */
async function main() {
  console.log('— 単語帳: the deck as data');
  const deck = verifyDeck();
  const m1 = deck.modules[0];
  const m12 = deck.modules.find((m) => m.id === 'm12-kanji');
  // a word already in the record before the deck existed (a legacy row that
  // still waits for 始める, so the module review opens on a sentence card)
  const pre = m1.cards[1].w;
  const preRow = { t: 'word', id: pre, label: pre, kind: '語', kindEn: 'word', from: null, ts: 1 };

  console.log('\n— 単語帳: the room, in a real browser');
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  watchErrors(context);
  await silenceBrowserAudio(context);
  await seedLegacyRow(context, preRow);
  const page = await context.newPage();
  const store = () => readAppRecord(page);

  try {
    await moduleOverview(page, base, deck);
    const listed = await page.evaluate(`document.querySelectorAll('[data-deck-module]').length`);
    check('the shelf door opens the deck and lists every module', listed === deck.modules.length, `${listed}/${deck.modules.length}`);

    await openModule(page, m1);
    const before = await store();
    const words = await page.evaluate(`document.querySelectorAll('[data-deck-enroll]').length`);
    check('a module lists every word, and opening it enrolls nothing', words === m1.cards.length && before.taken.length === 1, `${words} words · ${before.taken.length} taken`);
    const readDoor = await page.evaluate(`!!document.getElementById('deck-read')`);
    check('the module’s passage is one tap away', readDoor);

    await page.click('#deck-enroll-all');
    await page.waitForFunction(`document.querySelectorAll('[data-deck-enroll]:disabled').length === ${m1.cards.length}`, null, { timeout: 8000 });
    const after = await waitForAppRecord(page, (record) => record.taken.length === m1.cards.length,
      { description: 'every module word durably enrolled' });
    const rows = after.taken.filter((t) => m1.cards.some((c) => c.w === t.id));
    const fresh = rows.filter((t) => t.id !== pre);
    const withCtx = fresh.filter((t) => t.t === 'word' && t.ctx?.p === m1.article && t.ctx.scope === 'sent' && Number.isInteger(t.ctx.i));
    const kept = rows.find((t) => t.id === pre);
    const listName = Object.keys(after.lists || {}).find((n) => n.includes(m1.title.ja.split(' — ')[0]));
    check('ぜんぶ覚える enrolls every new word as a started row with its mined sentence as context',
      rows.length === m1.cards.length && fresh.every((t) => Number.isFinite(t.started)) && withCtx.length === fresh.length,
      `${rows.length} rows · ${withCtx.length}/${fresh.length} new rows with ctx`);
    check('a word already taken from the reader keeps its own row untouched', isDeepStrictEqual(kept, preRow), JSON.stringify(kept));
    check('the module list holds every word, the earlier-taken one included', !!listName && after.lists[listName].length === m1.cards.length &&
      after.lists[listName].some((x) => x.id === pre), listName || 'no list');

    await page.waitForSelector('#deck-review', { timeout: 8000 });
    await page.click('#deck-review');
    await page.waitForSelector('.review-face', { timeout: 15000 });
    await page.waitForFunction(`!!document.querySelector('.review-cloze')`, null, { timeout: 15000 });
    const face = await page.evaluate(`(() => {
      const c = document.querySelector('.review-cloze');
      return { text: c ? c.textContent : '', blank: c ? c.textContent.includes('＿＿＿') : false };
    })()`);
    check('この鉱脈だけ復習 asks the word blanked inside its mined sentence', face.blank && face.text.length > 10, face.text.slice(0, 40));

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    const reloaded = { taken: (await store()).taken.length, quarantined: await page.evaluate(() => {
      const alert = document.getElementById('store-alert');
      return !!(alert && !alert.hidden && alert.textContent);
    }) };
    check('the enrolled rows survive a reload with no quarantine', reloaded.taken === m1.cards.length && !reloaded.quarantined, JSON.stringify(reloaded));

    // single-kanji cards are asked inside a compound in their passage too
    await moduleOverview(page, base, deck);
    await openModule(page, m12);
    await page.click('#deck-enroll-all');
    await page.waitForFunction(`document.querySelectorAll('[data-deck-enroll]:disabled').length === ${m12.cards.length}`, null, { timeout: 8000 });
    const kanjiRecord = await waitForAppRecord(page, (record) => m12.cards.every((card) => record.taken.some((row) => row.t === 'word' && row.id === card.w)),
      { description: 'single-kanji words durably enrolled' });
    const k = kanjiRecord.taken.filter((t) => m12.cards.some((c) => c.w === t.id));
    check('single-kanji cards enroll as sentence-anchored word rows, never bare-character rows',
      k.length === m12.cards.length && k.every((t) => t.t === 'word' && t.ctx?.p === m12.article), `${k.filter((t) => t.ctx).length}/${m12.cards.length} anchored`);
    console.log('\n— 単語帳: cards saved from the reader');
    await verifyReaderEntryCards(browser, deck);
    console.log('\n— 単語帳: native enrollment guard');
    await verifyGuardedEnrollment(browser, base, deck, preRow);
    console.log('\n— 単語帳 and 文脈札: desktop and phone screens');
    await verifyResponsiveScreens(browser, base, deck);
    check('no console or page errors in any browser context', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks green');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
