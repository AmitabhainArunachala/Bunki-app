/**
 * KAIRO A0.5 accessibility verifier.
 *
 * Proves the reader's pointer/keyboard/switch-shaped routes, the one-tap popup's
 * geometry, non-hold alternatives (the word menu), dialog focus lifecycle,
 * hidden-control tab discipline, and meaningful reduced motion in real Chromium.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium node verify-corridor-accessibility.mjs
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolveCorridorSite();
const REPO = resolve(TOOL_DIR, '..', '..', '..');
const EVIDENCE_DIR = resolveCorridorEvidence();
const SHOTS_DIR = resolve(EVIDENCE_DIR, 'screenshots');
const VIEWPORT = { width: 390, height: 844 };

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

const results = [];
let failures = 0;

function check(name, pass, detail = '') {
  const result = { name, pass: Boolean(pass), detail: String(detail) };
  results.push(result);
  if (!result.pass) failures += 1;
  console.log(`${result.pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

function startServer() {
  const misses = [];
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(CORRIDOR_DIR, rel);
    if (!file.startsWith(CORRIDOR_DIR) || !existsSync(file)) {
      misses.push(pathname);
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
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      accept({ server, base: `http://127.0.0.1:${address.port}`, misses });
    });
  });
}

// The reader's own hold threshold (GESTURE.MENU_MS in corridor.js): a touch this long opens the word menu.
const APP_HOLD_MS = 500;
const tapAttempts = [];

async function tapGeometry(page, selector, index = 0) {
  return page.locator(selector).nth(index).evaluate((node) => {
    const rect = node.getClientRects()[0] ?? node.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + Math.min(rect.height / 2, 12);
    const hit = document.elementFromPoint(x, y);
    return {
      x, y, reachesTarget: hit === node || node.contains(hit),
      hit: hit ? { tag: hit.tagName, id: hit.id, tokenIndex: hit.closest('.tok')?.dataset.index } : null,
      scrollY: window.scrollY,
      offsetLeft: window.visualViewport?.offsetLeft ?? 0,
      offsetTop: window.visualViewport?.offsetTop ?? 0,
    };
  });
}

async function touchAt(page, selector, index = 0, holdMs = 0, scroll = true) {
  for (let attempt = 1; ; attempt += 1) {
    const target = page.locator(selector).nth(index);
    if (scroll) await target.scrollIntoViewIfNeeded();
    const geometry = await tapGeometry(page, selector, index);
    if (!geometry.reachesTarget) {
      tapAttempts.push({ selector, index, attempt, geometry, obstructed: true });
      check('a pointer touch reaches its intended control', false, JSON.stringify(tapAttempts.at(-1)));
      return;
    }
    await target.evaluate((node) => { window.__a11yIntendedTarget = node; });
    const [clicks, ups] = await page.evaluate(() => [window.__a11yTargetClicks ?? 0, window.__a11yPointerUps ?? 0]);
    const cdp = await page.context().newCDPSession(page);
    const point = {
      x: geometry.x - geometry.offsetLeft,
      y: geometry.y - geometry.offsetTop,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    if (holdMs > 0) await page.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    if (holdMs > 0) {
      await page.waitForTimeout(160);
      return;
    }
    await page.waitForFunction((before) => (window.__a11yPointerUps ?? 0) > before, ups, { timeout: 5000 });
    const pressed = await lastPressMs(page);
    tapAttempts.push({ selector, index, attempt, pressedMs: pressed, geometry });
    if (pressed >= APP_HOLD_MS) {
      // A slow runner delivered the release only after the app's hold threshold: that press was a
      // hold (the word menu), not the tap under test. Put the menu away and tap again.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      if (attempt < 3) continue;
      return;
    }
    // A click elsewhere on the page is not delivery to the intended control.
    await page.waitForFunction((before) => (window.__a11yTargetClicks ?? 0) > before, clicks, { timeout: 5000 });
    tapAttempts.at(-1).click = await page.evaluate(() => window.__a11yLastClick);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    return;
  }
}

/** How long the page held the last touch down (pointerdown → pointerup), as the app measures it. */
async function lastPressMs(page) {
  return page.evaluate(() => window.__a11yLastPressMs ?? null);
}

async function openReader(page, base) {
  await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
  await page.locator('.shelf-item').first().click();
  await page.waitForSelector('#reader .tok.content');
  await page.waitForFunction('document.querySelectorAll("#reader .tok.content").length > 10');
}

async function setRevealOnTouch(page) {
  await page.locator('#dials-toggle').click();
  await page.locator('[data-dial="furigana:1"]').click();
  await page.waitForTimeout(120);
}

async function glyphBottom(page, index) {
  return page.locator('#reader .tok.content').nth(index).evaluate((node) => {
    // the base glyphs themselves: a reading (rt) is not the anchor, nor is the button's touch box
    const row = node.querySelector(':scope > .tok-word') ?? node;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
      acceptNode: (text) => (text.parentElement.closest('rt') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let bottom = null;
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) if (rect.width > 0) bottom = Math.max(bottom ?? rect.bottom, rect.bottom);
    }
    if (bottom === null) throw new Error('Reader token is missing its glyph row');
    return bottom;
  });
}
/** Put a reader word mid-screen, clear of the phone's foot dock, before a no-scroll gesture is measured. */
async function centreWord(page, index) {
  await page.locator('#reader .tok.content').nth(index).evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(120);
}

async function openWordDialog(page) {
  // the full entry's non-hold door from the word itself: Ctrl+Enter (the word menu's Full entry is the other)
  const token = page.locator('#reader .tok.content').nth(2);
  await token.focus();
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('#sheet');
}

async function openQuietLabelDialog(page) {
  // The reader's third token can open a choice panel without these labels.
  // 学校 is a core N5 entry with a kanji-section eyebrow and a JLPT pool tag.
  await page.locator('#chrome-search').click();
  await page.locator('#nav-search-input').fill('学校');
  await page.locator('#nav-search-input').press('Enter');
  const sheet = page.locator('#sheet[data-node="word:学校"]');
  await sheet.locator('.eyebrow').filter({ hasText: 'この語の漢字' }).waitFor({ state: 'visible' });
  await sheet.locator('.pool-tag[data-reference-door="jlpt:N5"]').waitFor({ state: 'visible' });
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  const { server, base, misses } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [];

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    // a passive observer: how long each press was held, as the app's own Date.now() clock sees it
    await context.addInitScript(() => {
      let downAt = 0;
      addEventListener('pointerdown', () => { downAt = Date.now(); }, true);
      // a press ends in pointerup, or pointercancel where the browser takes the touch for scrolling
      for (const kind of ['pointerup', 'pointercancel']) addEventListener(kind, () => {
        window.__a11yLastPressMs = Date.now() - downAt;
        window.__a11yPointerUps = (window.__a11yPointerUps ?? 0) + 1;
      }, true);
      addEventListener('click', (event) => {
        const intended = window.__a11yIntendedTarget;
        const reachesTarget = Boolean(intended && (event.target === intended || intended.contains(event.target)));
        if (reachesTarget) window.__a11yTargetClicks = (window.__a11yTargetClicks ?? 0) + 1;
        window.__a11yLastClick = { reachesTarget, tag: event.target.tagName, id: event.target.id,
          tokenIndex: event.target.closest('.tok')?.dataset.index };
      }, true);
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    console.log('\n— shelf cards: parallel doors, never nested controls');
    await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
    const shelfStructure = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.shelf-item')];
      return {
        cards: cards.length,
        nestedInteractive: document.querySelectorAll(
          'button button, button a, button input, a button, a a',
        ).length,
        cardsWithOwnDoor: cards.filter((card) => card.querySelector('button.shelf-open')).length,
        cardsWithSiblingDetails: cards.filter((card) => {
          const toggle = card.querySelector('button.details-toggle');
          return !!toggle && toggle.closest('button') === toggle;
        }).length,
      };
    })()`);
    check(
      'no interactive control nests inside another anywhere on the shelf',
      shelfStructure.cards > 0 && shelfStructure.nestedInteractive === 0,
      JSON.stringify(shelfStructure),
    );
    // Since the design pass of 2026-09-30 a card is one door and carries no diagnostics: 詳細
    // unfolds in the article's own footer, so no card may carry a toggle of its own either.
    check(
      'every card is one reachable text door, with 詳細 left to the article footer',
      shelfStructure.cardsWithOwnDoor === shelfStructure.cards &&
        shelfStructure.cardsWithSiblingDetails === 0,
      `${shelfStructure.cardsWithOwnDoor}/${shelfStructure.cards} text doors · ` +
        `${shelfStructure.cardsWithSiblingDetails} card toggles`,
    );

    console.log('\n— 銀河 home: the tab order names only visible controls');
    // R3-B: the drift layer's radical explainer rests at opacity:0 — invisible
    // to fingers yet its 閉じる × button stayed in the tab order, so the FIRST
    // Tab at the galaxy home landed on a control no eye can find. The layer
    // must be inert while hidden; more generally, nothing invisible anywhere
    // in the fused document may keep a tab stop.
    await page.goto(`${base}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
    await page.waitForFunction(
      `document.getElementById('drift-layer')?.classList.contains('active')`,
      null,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(1400);
    const hiddenTabbables = await page.evaluate(`(() => {
      const offenders = [];
      for (const node of document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')) {
        if (node.tabIndex < 0 || node.disabled) continue;
        if (node.closest('[inert]')) continue; // honestly out of the order
        const rect = node.getBoundingClientRect();
        if (!rect.width && !rect.height) continue; // collapsed: unfocusable anyway
        let invisible = false;
        for (let anc = node; anc; anc = anc.parentElement) {
          const style = getComputedStyle(anc);
          // display:none / visibility:hidden already remove focusability
          if (style.display === 'none' || style.visibility === 'hidden') break;
          if (Number.parseFloat(style.opacity) === 0) {
            invisible = true;
            break;
          }
        }
        if (invisible) {
          offenders.push({ id: node.id || null, cls: String(node.className).slice(0, 40) });
        }
      }
      return offenders;
    })()`);
    check(
      'hidden layers keep no tabbable control (the invisible 閉じる × discipline)',
      hiddenTabbables.length === 0,
      hiddenTabbables.length ? JSON.stringify(hiddenTabbables) : 'every tab stop is visible',
    );
    await page.evaluate(
      'document.activeElement instanceof HTMLElement && document.activeElement.blur()',
    );
    await page.keyboard.press('Tab');
    const firstStop = await page.evaluate(`(() => {
      const node = document.activeElement;
      if (!node || node === document.body) return { none: true };
      let opacity = 1;
      for (let anc = node; anc; anc = anc.parentElement) {
        opacity = Math.min(opacity, Number.parseFloat(getComputedStyle(anc).opacity) || 0);
      }
      const rect = node.getBoundingClientRect();
      return {
        id: node.id || String(node.className).slice(0, 40),
        opacity: Number(opacity.toFixed(3)),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    })()`);
    check(
      'first Tab at the galaxy home lands on a real, visible control',
      !firstStop.none && firstStop.opacity > 0.05 && firstStop.w > 0 && firstStop.h > 0,
      JSON.stringify(firstStop),
    );

    console.log('\n— reader semantics and non-hold alternatives');
    await openReader(page, base);
    const semantics = await page.evaluate(`(() => {
      const words = [...document.querySelectorAll('#reader .tok.content')];
      const particles = [...document.querySelectorAll('#reader .tok.particle')];
      return {
        words: words.length,
        particles: particles.length,
        nativeButtons: words.filter((node) => node.matches('button')).length,
        named: words.filter((node) => !!node.getAttribute('aria-label')).length,
        actionKinds: [...new Set(words.map((node) => node.dataset.action).filter(Boolean))],
        hitFloor: [...words, ...particles].reduce((floor, node) => {
          const rect = node.getBoundingClientRect();
          const expanded = getComputedStyle(node, '::before');
          const width = Math.max(rect.width, parseFloat(expanded.width) || 0);
          const height = Math.max(rect.height, parseFloat(expanded.height) || 0);
          return Math.min(floor, width, height);
        }, Infinity),
      };
    })()`);
    check(
      'reader words are named native controls on the common target.activate action',
      semantics.words > 10 &&
        semantics.nativeButtons === semantics.words &&
        semantics.named === semantics.words &&
        semantics.actionKinds.join(',') === 'target.activate',
      JSON.stringify(semantics),
    );
    check(
      'inline reader controls retain a real 44px hit region without widening print',
      semantics.hitFloor >= 44,
      `minimum effective hit dimension ${semantics.hitFloor.toFixed(1)}px`,
    );

    const word = page.locator('#reader .tok.content').nth(2);
    await word.focus();
    const focusProbe = await page.evaluate(`(() => ({
      tokenFocused: document.activeElement?.matches('#reader .tok.content') ?? false,
      shortcuts: document.activeElement?.getAttribute('aria-keyshortcuts') ?? '',
      hiddenTabStops: [...document.querySelectorAll('#app [hidden]')].flatMap((root) =>
        [...root.querySelectorAll('button, a, input, [tabindex]')]
      ).filter((node) => node.tabIndex >= 0 && !node.disabled && node.offsetParent !== null).length,
    }))()`);
    // reader lane 2026-10-02: the press-and-hold's non-hold doors are the word menu (Shift+F10 or the
    // ContextMenu key) and the full entry (Ctrl+Enter), declared on the word itself
    await page.keyboard.press('Shift+F10');
    const menuProbe = await page.evaluate(`(() => ({
      menu: document.getElementById('reader-word-menu')?.getAttribute('role') ?? null,
      items: [...document.querySelectorAll('#reader-word-menu [role="menuitem"]')].map((node) => node.textContent),
      focusInMenu: !!document.activeElement?.closest('#reader-word-menu'),
    }))()`);
    await page.keyboard.press('Escape');
    const menuBack = await page.evaluate('document.activeElement?.matches("#reader .tok.content") && !document.getElementById("reader-word-menu")');
    check(
      'focused word exposes the word menu (Shift+F10) and the full entry (Ctrl+Enter) as non-hold alternatives',
      focusProbe.tokenFocused && /Shift\+F10/.test(focusProbe.shortcuts) && /Control\+Enter/.test(focusProbe.shortcuts) &&
        menuProbe.menu === 'menu' && menuProbe.focusInMenu && menuProbe.items.includes('Full entry') && menuProbe.items.includes('Save word') && menuBack,
      JSON.stringify({ ...focusProbe, ...menuProbe, menuBack }),
    );
    check(
      'hidden Corridor controls leave the tab order',
      focusProbe.hiddenTabStops === 0,
      `${focusProbe.hiddenTabStops} hidden tab stop(s)`,
    );
    // R4 (2026-09-30): the pill's buttons left the Tab order (one stop per paragraph); the keyboard
    // reaches them from the word itself, and assistive technology still finds them in the tree
    await page.keyboard.press('Shift+Enter');
    const firstAlternative = await page.evaluate('document.querySelector("#mini") ? "quickLook.open" : null');
    await page.keyboard.press('Escape');
    const backOnWord = await page.evaluate('document.activeElement?.matches("#reader .tok.content") && !document.querySelector("#mini")');
    await word.focus();
    await page.keyboard.press('Control+Enter');
    const secondAlternative = await page.evaluate('document.querySelector("#sheet") ? "entry.open" : null');
    check(
      'the keyboard reaches quick look (Shift+Enter) and full entry (Ctrl+Enter); Escape returns to the word',
      firstAlternative === 'quickLook.open' && backOnWord && secondAlternative === 'entry.open',
      `${firstAlternative} → back on word ${backOnWord} → ${secondAlternative}`,
    );
    if (await page.locator('#sheet').count()) await page.keyboard.press('Escape');
    await word.focus();
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('#reader-word-menu');
    const accessibilitySession = await page.context().newCDPSession(page);
    const accessibilityTree = await accessibilitySession.send('Accessibility.getFullAXTree');
    await accessibilitySession.detach();
    const menuItems = accessibilityTree.nodes
      .filter((node) => node.role?.value === 'menuitem' && node.name?.value)
      .map((node) => node.name.value);
    // R4: a word is named by itself; how to work it (Enter, Shift+F10, Ctrl+Enter) is its shared description
    const describedButtons = accessibilityTree.nodes
      .filter((node) => node.role?.value === 'button' && node.description?.value)
      .map((node) => node.description.value);
    check(
      'screen-reader tree exposes named token, its keyboard help and the word menu items',
      describedButtons.some((text) => /Shift\+F10/.test(text) && /Enter/.test(text)) &&
        menuItems.includes('Save word') && menuItems.includes('Full entry') &&
        menuItems.includes('Ask the tutor about this sentence'),
      `${menuItems.length} menu item(s): ${menuItems.join(' · ')}`,
    );
    await page.keyboard.press('Escape');
    await word.focus();
    await page.waitForTimeout(80);
    await page.screenshot({ path: resolve(SHOTS_DIR, '01-reader-focus-alternatives.png') });

    console.log('\n— one action, the meaning: parity and geometry');
    // reader lane 2026-10-02 (John #8): one tap opens the word's popup — reading and meaning at once;
    // there is no tap ladder, no English line under the word and no floating sentence bar
    const tokenIndex = 2;
    const popupProbe = () => page.evaluate(`(() => {
      const mini = document.getElementById('mini');
      const box = mini?.getBoundingClientRect();
      return { open: !!mini, reading: mini?.querySelector('.mini-reading')?.textContent ?? '', gloss: mini?.querySelector('.mini-gloss')?.textContent ?? '',
        save: mini?.querySelector('#mini-take')?.textContent ?? null, sentence: !!mini?.querySelector('.mini-sentence'),
        inside: !!box && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        under: document.querySelectorAll('#reader .tok-en').length,
        bar: [...document.querySelectorAll('.reader-actions, .teacher-door')].filter((node) => node.getClientRects().length).length };
    })()`);
    await openReader(page, base);
    await setRevealOnTouch(page);
    await centreWord(page, tokenIndex);
    const anchorBefore = await glyphBottom(page, tokenIndex);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await touchAt(page, '#reader .tok.content', tokenIndex, 0, false);
    const firstPopup = await popupProbe();
    const firstReach = await tapGeometry(page, '#reader .tok.content', tokenIndex);
    check(
      'pointer action one opens the popup with the reading and the meaning, and writes nothing under the word',
      firstPopup.open && firstPopup.reading && firstPopup.gloss && firstPopup.save === 'Save' && firstPopup.under === 0 && firstPopup.inside,
      JSON.stringify({ firstPopup, taps: tapAttempts.slice(-2) }),
    );
    // the word stays where it is on the screen. (A phone's sticky header grows by the chrome's 覚える door when a
    // word is chosen; the browser's scroll anchoring moves scrollY to keep the text still, so scrollY is not the measure.)
    const anchorAfter = await glyphBottom(page, tokenIndex);
    check(
      'the touched word stays reachable beside its popup, its glyph anchor on screen within 2px',
      firstReach.reachesTarget && Math.abs(anchorAfter - anchorBefore) < 2,
      JSON.stringify({ firstReach, anchorBefore, anchorAfter, scrollBefore }),
    );
    check('no sentence bar floats over the text; the sentence actions ride in the popup', firstPopup.bar === 0 && firstPopup.sentence,
      JSON.stringify(firstPopup));
    await touchAt(page, '#reader .tok.content', tokenIndex, 0, false);
    const secondState = await page.locator('#reader .tok.content').nth(tokenIndex).evaluate((node) => ({
      popup: Boolean(document.querySelector('#mini')), sheet: Boolean(document.querySelector('#sheet')),
      current: node.classList.contains('tok-current'), gloss: Boolean(node.querySelector('.tok-en')),
    }));
    check(
      'a second action on the same word puts its popup away — no sheet, no English, the word still the chosen one',
      !secondState.popup && !secondState.sheet && !secondState.gloss && secondState.current,
      JSON.stringify(secondState),
    );
    await touchAt(page, '#reader .tok.content', tokenIndex, 0, false);
    const reopened = await popupProbe();
    check('a third action opens it again: one tap is always the meaning', reopened.open && reopened.gloss, JSON.stringify(reopened));
    const pointerReceipts = await page.evaluate(
      `window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.kind === 'target.activate') ?? []`,
    );
    // two taps opened the popup (the closing tap between them only put it away)
    check(
      'pointer route emits target.activate envelopes with pointer provenance',
      pointerReceipts.length >= 2 && pointerReceipts.slice(-2).every((r) => r.provenance.modality === 'pointer'),
      `${pointerReceipts.length} receipt(s)`,
    );
    await page.keyboard.press('Escape');

    for (const scenario of [{ width: 320, settingsOpen: true }, { width: 390, settingsOpen: false }]) {
      await page.setViewportSize({ width: scenario.width, height: VIEWPORT.height });
      await openReader(page, base);
      await setRevealOnTouch(page);
      if (!scenario.settingsOpen) await page.locator('#dials-toggle').click();
      await centreWord(page, tokenIndex);
      const before = await glyphBottom(page, tokenIndex);
      await touchAt(page, '#reader .tok.content', tokenIndex, 0, false);
      const reach = await tapGeometry(page, '#reader .tok.content', tokenIndex);
      const shown = await popupProbe();
      const held = await glyphBottom(page, tokenIndex);
      check(`${scenario.width}px settings-${scenario.settingsOpen ? 'open' : 'closed'} selection stays reachable and still, and its popup fits the screen`,
        reach.reachesTarget && Math.abs(held - before) < 2 && shown.open && shown.inside, JSON.stringify({ before, held, reach, shown }));
      const anchor = await glyphBottom(page, tokenIndex);
      await touchAt(page, '#reader .tok.content', tokenIndex + 1, 0, false);
      const moved = await popupProbe();
      const after = await tapGeometry(page, '#reader .tok.content', tokenIndex + 1);
      check(`${scenario.width}px a tap on the next word moves the popup there and keeps both words still`,
        moved.open && moved.inside && after.reachesTarget && after.scrollY === reach.scrollY &&
          Math.abs(await glyphBottom(page, tokenIndex) - anchor) < 2, JSON.stringify({ moved, reach, after }));
    }
    await page.setViewportSize(VIEWPORT);

    await openReader(page, base);
    await setRevealOnTouch(page);
    const keyboardWord = page.locator('#reader .tok.content').nth(tokenIndex);
    await keyboardWord.focus();
    const keyboardFocusable = await page.evaluate(
      `document.activeElement?.matches('#reader .tok.content') ?? false`,
    );
    let keyboardPopup = null;
    if (keyboardFocusable) {
      await page.keyboard.press('Enter');
      await page.waitForSelector('#mini');
      keyboardPopup = await page.evaluate(`({ focus: document.activeElement?.id ?? null, gloss: document.querySelector('#mini .mini-gloss')?.textContent ?? '' })`);
      await page.keyboard.press('Escape');
    }
    const keyboardBack = await page.evaluate(`({ word: document.activeElement?.matches('#reader .tok.content') ?? false,
      popup: !!document.getElementById('mini'), sheet: !!document.getElementById('sheet') })`);
    const keyboardReceipts = await page.evaluate(
      `window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.kind === 'target.activate') ?? []`,
    );
    check(
      'keyboard/switch-shaped activation opens the same popup, focus on Save; Escape returns to the word',
      keyboardFocusable && keyboardPopup?.focus === 'mini-take' && keyboardPopup.gloss && keyboardBack.word && !keyboardBack.popup && !keyboardBack.sheet,
      `focusable=${keyboardFocusable} popup=${JSON.stringify(keyboardPopup)} back=${JSON.stringify(keyboardBack)}`,
    );
    check(
      'keyboard route differs only in provenance',
      keyboardReceipts.length >= 1 && keyboardReceipts.at(-1).provenance.modality === 'keyboard',
      `${keyboardReceipts.length} receipt(s)`,
    );

    console.log('\n— particle rhythm and direct accessible door');
    await openReader(page, base);
    const particle = page.locator('#reader .tok.particle').first();
    await touchAt(page, '#reader .tok.particle');
    // R4 (09b5e2a7): a particle uses the same quick-lookup door as every word — a tap opens its
    // role and 助詞へ; it never opens the sheet and never lights a reading
    const particleTap = {
      sheet: await page.locator('#sheet').count(),
      reveal: await particle.evaluate((node) => node.classList.contains('lit')),
      quickLook: await page.locator('#mini [data-action="entry.open"][data-target-kind="particle"]').count(),
    };
    check(
      'particle pointer tap opens its quick look, never the sheet or a reveal',
      particleTap.sheet === 0 && !particleTap.reveal && particleTap.quickLook === 1,
      JSON.stringify(particleTap),
    );
    // Escape on the particle puts its quick look away, as a learner would, before the next door
    await particle.press('Escape');
    check('Escape on the particle closes its quick look', (await page.locator('#mini').count()) === 0);
    // a fresh particle, from the keyboard: the word menu (Shift+F10) carries its full entry
    await page.locator('#reader .tok.particle').nth(1).focus();
    await page.keyboard.press('Shift+F10');
    const particleDoor = page.locator('#reader-word-menu [data-menu-action="entry"]');
    const hasParticleDoor = (await particleDoor.count()) === 1;
    if (hasParticleDoor) await particleDoor.click();
    check(
      'particle exposes a keyboard/switch/screen-reader full-entry alternative',
      hasParticleDoor && (await page.locator('#sheet[data-node^="particle:"]').count()) === 1,
      `direct door=${hasParticleDoor}`,
    );
    if (await page.locator('#sheet').count()) await page.keyboard.press('Escape');

    console.log('\n— named modal sheet focus lifecycle');
    await openReader(page, base);
    const invoker = page.locator('#reader .tok.content').nth(2);
    await invoker.focus();
    const invokerIndex = await invoker.getAttribute('data-index');
    await openWordDialog(page);
    const dialog = await page.evaluate(`(() => {
      const sheet = document.querySelector('#sheet');
      const focusables = [...sheet.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.disabled && node.offsetParent !== null);
      return {
        role: sheet.getAttribute('role'),
        modal: sheet.getAttribute('aria-modal'),
        name: sheet.getAttribute('aria-label') || sheet.getAttribute('aria-labelledby'),
        focusInside: sheet.contains(document.activeElement),
        focusables: focusables.length,
      };
    })()`);
    check(
      'entry sheet is a named modal dialog and receives focus',
      dialog.role === 'dialog' && dialog.modal === 'true' && Boolean(dialog.name) && dialog.focusInside,
      JSON.stringify(dialog),
    );
    await page.evaluate(`(() => {
      const sheet = document.querySelector('#sheet');
      const nodes = [...sheet.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.disabled && node.offsetParent !== null);
      nodes.at(-1)?.focus();
    })()`);
    await page.keyboard.press('Tab');
    const trapped = await page.evaluate(
      `document.querySelector('#sheet')?.contains(document.activeElement) ?? false`,
    );
    check('Tab is contained inside the modal sheet', trapped);
    await page.waitForTimeout(280);
    await page.screenshot({ path: resolve(SHOTS_DIR, '02-named-entry-dialog.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const returnProbe = await page.evaluate(`({
      closed: !document.querySelector('#sheet'),
      returned: document.activeElement?.matches('#reader .tok.content[data-index="${invokerIndex}"]') ?? false,
    })`);
    check(
      'Escape dismisses the sheet and returns focus to its invoking token',
      returnProbe.closed && returnProbe.returned,
      JSON.stringify(returnProbe),
    );

    console.log('\n— meaningful reduced motion');
    const reducedContext = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    });
    const reducedPage = await reducedContext.newPage();
    await openReader(reducedPage, base);
    await openWordDialog(reducedPage);
    const motion = await reducedPage.evaluate(`(() => {
      const describe = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
          scrollBehavior: style.scrollBehavior,
        };
      };
      return { sheet: describe('#sheet'), scrim: describe('.scrim'), ruby: describe('#reader rt') };
    })()`);
    const still = Object.values(motion)
      .filter(Boolean)
      .every(
        (entry) =>
          (entry.animationName === 'none' || entry.animationDuration === '0s') &&
          entry.transitionDuration === '0s' &&
          entry.scrollBehavior !== 'smooth',
      );
    check('reduced-motion removes Corridor animation and transition motion', still, JSON.stringify(motion));
    await reducedPage.screenshot({ path: resolve(SHOTS_DIR, '03-reduced-motion-dialog.png') });
    await reducedContext.close();

    // Quiet-label contrast across the exact ten public worlds and the retained
    // legacy-only 殻 world. The WCAG contrast
    // variant once pinned light-world ink values that sank every label into
    // the 夜 ground at ~1.2:1 (operator's phone, 2026-08-11) — this walk
    // measures the real composited colors so no world can regress silently.
    // Since P1 the walk ALSO measures the S1 living-paper amplitude law
    // (rebuild spec §2 S1): the grown texture's luminance must stay within
    // ±3% of the flat --ground it hangs over — measured as RMS deviation on
    // the WCAG relative-luminance scale — so the ratios measured here keep
    // describing what the eye actually meets.
    const themePage = await context.newPage();
    const WORLDS = [
      'sumi',
      'shu',
      'iwa',
      'rokusho',
      'yoru',
      'hokusai',
      'akafuji',
      'nami',
      'keyblock',
      'hakuu',
      'kaku',
    ];
    for (const theme of WORLDS) {
      await openReader(themePage, base);
      await themePage.evaluate(`localStorage.setItem('kairo-theme', '${theme}')`);
      await themePage.reload();
      await openReader(themePage, base);
      await openQuietLabelDialog(themePage);
      const ratios = await themePage.evaluate(`(() => {
        const lum = ([r, g, b]) => {
          const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        // Chromium preserves color-mix() results as color(srgb 0..1 / a),
        // while legacy rgb()/rgba() computed values use 0..255 channels.
        // Normalize both serializations before doing WCAG luminance math;
        // treating color(srgb) fractions as 8-bit values produced false
        // failures in every dark world even though the rendered ink is AA.
        const parse = (s) => {
          const values = s.match(/-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?/gi)?.map(Number) ?? [];
          if (values.length < 3) throw new Error('Unsupported computed color: ' + s);
          const scale = /^color\\(\\s*srgb(?:\\s|\\/)/i.test(s) ? 255 : 1;
          const channel = (value) => Math.max(0, Math.min(255, value * scale));
          return [channel(values[0]), channel(values[1]), channel(values[2]), values[3] ?? 1];
        };
        const composite = (fg, bg) => {
          const c = parse(fg); const a = c.length === 4 ? c[3] : 1; const b = parse(bg);
          return [0, 1, 2].map((i) => c[i] * a + b[i] * (1 - a));
        };
        const contrast = (fgStr, bgStr) => {
          const L1 = lum(composite(fgStr, bgStr)); const L2 = lum(parse(bgStr));
          const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
          return (hi + 0.05) / (lo + 0.05);
        };
        const sheet = document.querySelector('#sheet[data-node="word:学校"]');
        if (!sheet) return {};
        const bg = getComputedStyle(sheet).backgroundColor;
        const out = {};
        const labels = [
          ['#sheet .eyebrow', [...sheet.querySelectorAll('.eyebrow')].find(node => node.textContent.includes('この語の漢字'))],
          ['#sheet .pool-tag', sheet.querySelector('.pool-tag[data-reference-door="jlpt:N5"]')],
        ];
        for (const [sel, node] of labels) {
          if (node) out[sel] = contrast(getComputedStyle(node).color, bg);
        }
        return out;
      })()`);
      const values = Object.values(ratios);
      check(
        `quiet sheet labels meet 4.5:1 in the ${theme} world`,
        values.length === 2 && values.every((r) => r >= 4.5),
        Object.entries(ratios)
          .map(([sel, r]) => `${sel.replace('#sheet .', '')} ${r.toFixed(2)}:1`)
          .join(' · '),
      );
      // the paper grows off the interaction beat — wait for the data-URL
      await themePage
        .waitForFunction(
          `getComputedStyle(document.documentElement).getPropertyValue('--paper-url').includes('data:')`,
          null,
          { timeout: 15000 },
        )
        .catch(() => {});
      const paper = await themePage.evaluate(`(async () => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--paper-url').trim();
        const m = raw.match(/url\\("?(data:[^")]+)"?\\)/);
        if (!m) return { missing: true };
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = m[1]; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const data = g.getImageData(0, 0, cv.width, cv.height).data;
        const f = new Float64Array(256);
        for (let i = 0; i < 256; i++) {
          const c = i / 255;
          f[i] = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }
        const groundRgb = getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g).map(Number);
        const L0 = 0.2126 * f[groundRgb[0]] + 0.7152 * f[groundRgb[1]] + 0.0722 * f[groundRgb[2]];
        let sum = 0; let sumSq = 0; let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const L = 0.2126 * f[data[i]] + 0.7152 * f[data[i + 1]] + 0.0722 * f[data[i + 2]];
          const d = L - L0;
          sum += d; sumSq += d * d; n += 1;
        }
        return { mean: sum / n, rms: Math.sqrt(sumSq / n), ground: groundRgb.join(','), px: n };
      })()`);
      check(
        `living paper stays within ±3% of --ground in the ${theme} world`,
        !paper.missing && Math.abs(paper.mean) <= 0.03 && paper.rms <= 0.03,
        paper.missing
          ? 'no --paper-url grown'
          : `mean ${(paper.mean * 100).toFixed(2)}% · rms ${(paper.rms * 100).toFixed(2)}% vs ground rgb(${paper.ground}) over ${paper.px}px`,
      );
    }
    await themePage.close();

    check('real walk requested no missing Corridor assets', misses.length === 0, misses.join(', '));
    check('real walk emitted no console/page errors', errors.length === 0, errors.join(' | '));

    await context.close();
  } finally {
    await browser.close();
    server.close();
  }

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const report = {
    schemaVersion: 1,
    verifier: 'verify-corridor-accessibility.mjs',
    head,
    chromium: process.env.CHROMIUM_PATH || 'playwright-default',
    viewport: VIEWPORT,
    summary: { total: results.length, passed: results.length - failures, failed: failures },
    results,
    screenshots: [
      'screenshots/01-reader-focus-alternatives.png',
      'screenshots/02-named-entry-dialog.png',
      'screenshots/03-reduced-motion-dialog.png',
    ],
  };
  writeFileSync(resolve(EVIDENCE_DIR, 'verification-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${report.summary.passed}/${report.summary.total} checks passed`);
  console.log(`report → ${resolve(EVIDENCE_DIR, 'verification-report.json')}`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
