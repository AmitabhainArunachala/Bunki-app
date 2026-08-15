/**
 * Regression gate for the minimal 書の間 contract.
 *
 * This is intentionally narrower than verify-corridor.mjs: it proves the
 * operator's latest writing-room decisions at the real 390×844 phone size.
 * The rest of the product walk remains owned by the existing verifiers.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium \
 *     node prototypes/corridor/tools/verify-writing-room.mjs
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const PHONE = { width: 390, height: 844 };
const PUBLIC_WORLDS = [
  ['sumi', '墨'],
  ['shu', '朱'],
  ['iwa', '柿'],
  ['rokusho', '漆'],
  ['yoru', '金'],
  ['hokusai', '藍'],
  ['akafuji', '赤'],
  ['nami', '浪'],
  ['keyblock', '板'],
  ['hakuu', '雷'],
];

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
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

async function bootShelf(page, base, { clear = false } = {}) {
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
  if (clear) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
  }
}

async function openWritingRoom(page, base, kanji, { clear = false, beforeDoor = null } = {}) {
  await bootShelf(page, base, { clear });
  await page.locator('#search').fill(kanji);
  const result = page.locator(`[data-result="kanji:${kanji}"]`).first();
  await result.waitFor({ state: 'visible', timeout: 10_000 });
  await result.click();
  await page.waitForSelector('#sheet');
  await page.waitForSelector('#strokes-door');
  if (beforeDoor) await beforeDoor();
  await page.locator('#strokes-door').click();
  await page.waitForSelector('#stroke-page');
  return page.locator('#stroke-page');
}

async function roomSnapshot(page) {
  return page.evaluate(() => {
    const room = document.querySelector('#stroke-page');
    if (!room) return null;
    const visible = (node) => {
      if (!node || node.closest('[inert]')) return false;
      let current = node;
      while (current && current !== room.parentElement) {
        const style = getComputedStyle(current);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number.parseFloat(style.opacity || '1') <= 0.02
        )
          return false;
        current = current.parentElement;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const interactive = [
      ...room.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => !node.disabled && visible(node));
    const trigger = room.querySelector('.stroke-chrome-trigger');
    const field = room.querySelector('#stroke-awake-field');
    const stage = room.querySelector('.stroke-stage');
    const rectOf = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    const numberRoot = document.querySelector('.stroke-nums-lift') || room;
    const nums = [...numberRoot.querySelectorAll('.stroke-num')];
    const pips = [...room.querySelectorAll('.stroke-pip')];
    const lift = document.querySelector('.stroke-nums-lift');
    return {
      minimal: room.dataset.minimal,
      chrome: room.dataset.chrome,
      living: room.dataset.living,
      numbers: room.dataset.numbers,
      shown: Number(room.dataset.strokeShown || 0),
      total: nums.length,
      world: room.dataset.world,
      stageRect: rectOf(stage),
      // The Safari-safe lift remains mounted while number mode is off, but is
      // deliberately display:none.  A hidden element's 0x0 DOMRect is not an
      // alignment measurement; only compare the layer while it is painted.
      liftRect: lift && getComputedStyle(lift).display !== 'none' ? rectOf(lift) : null,
      describedBy: room.getAttribute('aria-describedby'),
      exitDescription:
        document.getElementById(room.getAttribute('aria-describedby') || '')?.textContent || '',
      trigger: trigger
        ? {
            text: trigger.textContent.trim(),
            controls: trigger.getAttribute('aria-controls'),
            expanded: trigger.getAttribute('aria-expanded'),
            label: trigger.getAttribute('aria-label'),
            visible: visible(trigger),
          }
        : null,
      field: field
        ? {
            inert: field.inert,
            hidden: field.getAttribute('aria-hidden'),
            visible: visible(field),
            rect: rectOf(field),
          }
        : null,
      interactive: interactive.map((node) => ({
        id: node.id,
        cls: node.className,
        inField: Boolean(field?.contains(node)),
        isTrigger: node === trigger,
        label: node.getAttribute('aria-label') || node.textContent.trim(),
      })),
      markerVisible: nums.filter(
        (node) => visible(node) && Number.parseFloat(getComputedStyle(node).opacity) > 0.5,
      ).length,
      pipTotal: pips.length,
      pipsFilled: pips.filter((node) => node.classList.contains('filled')).length,
      canvasCount: room.querySelectorAll('.ink-sheet').length,
    };
  });
}

async function wake(page) {
  const room = page.locator('#stroke-page');
  if ((await room.getAttribute('data-chrome')) !== 'awake') {
    await page.locator('.stroke-chrome-trigger').click();
  }
  await page.waitForFunction(
    `document.querySelector('#stroke-page')?.dataset.chrome === 'awake'`,
    null,
    { timeout: 5_000 },
  );
}

async function installStrokeTrace(page) {
  await page.evaluate(() => {
    window.__WRITING_ROOM_TRACE__?.observer?.disconnect();
    const room = document.querySelector('#stroke-page');
    const snap = (reason) => {
      if (!room) return;
      const numberRoot = document.querySelector('.stroke-nums-lift') || room;
      const nums = [...numberRoot.querySelectorAll('.stroke-num')];
      const pips = [...room.querySelectorAll('.stroke-pip')];
      window.__WRITING_ROOM_TRACE__.rows.push({
        at: performance.now(),
        reason,
        numbers: room.dataset.numbers,
        shown: Number(room.dataset.strokeShown || 0),
        visible: nums.filter((node) => Number.parseFloat(getComputedStyle(node).opacity) > 0.5)
          .length,
        pipTotal: pips.length,
        pips: pips.filter((node) => node.classList.contains('filled')).length,
      });
    };
    const observer = new MutationObserver(() => snap('mutation'));
    window.__WRITING_ROOM_TRACE__ = { rows: [], observer };
    observer.observe(room, {
      attributes: true,
      attributeFilter: ['data-numbers', 'data-stroke-shown'],
      subtree: true,
    });
    snap('installed');
  });
}

async function traceRows(page) {
  return page.evaluate(() => window.__WRITING_ROOM_TRACE__?.rows ?? []);
}

async function closeWritingRoom(page) {
  if ((await page.locator('#stroke-page').getAttribute('data-chrome')) === 'awake') {
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      `document.querySelector('#stroke-page')?.dataset.chrome === 'sleeping'`,
      null,
      { timeout: 5_000 },
    );
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('#stroke-page', { state: 'detached' });
}

async function main() {
  const { server, base, misses } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const noise = [];

  try {
    const context = await browser.newContext({
      viewport: PHONE,
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') noise.push(message.text());
    });
    page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`));

    let historyBase = null;
    await openWritingRoom(page, base, '永', {
      clear: true,
      beforeDoor: async () => {
        historyBase = await page.evaluate(() => {
          history.replaceState({ ...(history.state || {}), verifierKeep: 'kept' }, '', location.href);
          return { length: history.length, url: location.href };
        });
      },
    });

    console.log('\n— dormant room');
    const asleep = await roomSnapshot(page);
    check(
      'minimal room opens asleep',
      asleep?.minimal === 'on' && asleep.chrome === 'sleeping',
      JSON.stringify({ minimal: asleep?.minimal, chrome: asleep?.chrome }),
    );
    check(
      'the faint trigger is the only visible/focusable control',
      asleep?.interactive.length === 1 && asleep.interactive[0].isTrigger,
      JSON.stringify(asleep?.interactive),
    );
    check(
      'the trigger names a real dormant field and reports collapsed',
      asleep?.trigger?.visible &&
        asleep.trigger.text === '⋯' &&
        asleep.trigger.controls === 'stroke-awake-field' &&
        asleep.trigger.expanded === 'false' &&
        asleep.field,
      JSON.stringify({ trigger: asleep?.trigger, field: asleep?.field }),
    );
    check(
      'the dormant field is absent from sight and the accessibility tree',
      asleep?.field?.inert === true && asleep.field.hidden === 'true' && !asleep.field.visible,
      JSON.stringify(asleep?.field),
    );
    const historyOpen = await page.evaluate(() => ({
      length: history.length,
      url: location.href,
      kept: history.state?.verifierKeep,
      marker: history.state?.bunkiStrokeRoom,
    }));
    check(
      'quiet entry adds one same-URL Back sentinel and preserves host state',
      historyOpen.length === historyBase.length + 1 &&
        historyOpen.url === historyBase.url &&
        historyOpen.kept === 'kept' &&
        historyOpen.marker?.id === '永',
      JSON.stringify({ historyBase, historyOpen }),
    );
    check(
      'the dialog names the invisible platform Back exit',
      asleep?.describedBy === 'stroke-exit-description' && Boolean(asleep.exitDescription),
      JSON.stringify({ describedBy: asleep?.describedBy, text: asleep?.exitDescription }),
    );

    console.log('\n— awake field');
    await wake(page);
    const awake = await roomSnapshot(page);
    check(
      'one press wakes the allowed field without leaving the room',
      awake?.chrome === 'awake' &&
        awake.trigger?.expanded === 'true' &&
        awake.field?.inert === false &&
        (awake.field.hidden === null || awake.field.hidden === 'false') &&
        awake.field.visible,
      JSON.stringify({ chrome: awake?.chrome, trigger: awake?.trigger, field: awake?.field }),
    );
    check(
      'every visible control belongs to the awake field or is its trigger',
      awake?.interactive.length > 1 &&
        awake.interactive.every((node) => node.inField || node.isTrigger),
      JSON.stringify(awake?.interactive),
    );
    check(
      'the awake control field does not overlap the ink or lifted numerals',
      !!awake?.stageRect &&
        !!awake.field?.rect &&
        awake.stageRect.bottom <= awake.field.rect.top + 1,
      JSON.stringify({ stage: awake?.stageRect, field: awake?.field?.rect }),
    );
    const palettes = await page
      .locator('.stroke-palette-choice')
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          node.dataset.world,
          node.querySelector('.stroke-palette-seal')?.textContent?.trim() ||
            node.textContent.trim(),
        ]),
      );
    check(
      'the public palette is exactly 墨 朱 柿 漆 金 藍 赤 浪 板 雷 in that order',
      JSON.stringify(palettes) === JSON.stringify(PUBLIC_WORLDS),
      JSON.stringify(palettes),
    );
    const paletteGroup = await page.locator('.stroke-palette-field').evaluate((node) => ({
      role: node.getAttribute('role'),
      label: node.getAttribute('aria-label'),
    }));
    check(
      'the palette choices form one named accessibility group',
      paletteGroup.role === 'group' && Boolean(paletteGroup.label),
      JSON.stringify(paletteGroup),
    );

    // One public world from each side of the field proves the choices act,
    // persist, re-ink, and keep the field awake. The exact ten-entry/order
    // assertion above prevents a dead or extra public stone from hiding.
    for (const id of ['shu', 'hakuu']) {
      await page.locator(`.stroke-palette-choice[data-world="${id}"]`).click();
      await page.waitForFunction(
        (world) => document.querySelector('#stroke-page')?.dataset.world === world,
        id,
        { timeout: 15_000 },
      );
      const state = await page.evaluate(
        (world) => ({
          stored: localStorage.getItem('kairo-theme'),
          chrome: document.querySelector('#stroke-page')?.dataset.chrome,
          pressed: document.querySelectorAll(
            `.stroke-palette-choice[data-world="${world}"][aria-pressed="true"]`,
          ).length,
          canvases: document.querySelectorAll('#stroke-page .ink-sheet').length,
        }),
        id,
      );
      check(
        `${id} palette applies, persists, and keeps one live sheet`,
        state.stored === id &&
          state.chrome === 'awake' &&
          state.pressed === 1 &&
          state.canvases <= 1,
        JSON.stringify(state),
      );
    }
    check(
      'palette rerenders do not add history entries',
      (await page.evaluate(() => history.length)) === historyOpen.length,
      `history length=${await page.evaluate(() => history.length)}`,
    );

    // Native/browser Back closes directly even while the field is awake; the
    // same-document Forward sentinel can faithfully reopen the same room.
    await page.evaluate(() => history.back());
    await page.waitForSelector('#stroke-page', { state: 'detached' });
    const afterNativeBack = await page.evaluate(() => ({
      url: location.href,
      kept: history.state?.verifierKeep,
      orphans: document.querySelectorAll('.ink-sheet, .stroke-nums-lift').length,
    }));
    check(
      'platform Back exits directly and leaves no renderer orphan',
      afterNativeBack.url === historyBase.url &&
        afterNativeBack.kept === 'kept' &&
        afterNativeBack.orphans === 0,
      JSON.stringify(afterNativeBack),
    );
    await page.evaluate(() => history.forward());
    await page.waitForSelector('#stroke-page');
    const reopened = await roomSnapshot(page);
    check(
      'Forward reopens the same room without adding another entry',
      reopened?.chrome === 'sleeping' &&
        reopened?.minimal === 'on' &&
        (await page.locator('#stroke-page').getAttribute('data-kanji')) === '永' &&
        (await page.evaluate(() => history.length)) === historyOpen.length,
      JSON.stringify(reopened),
    );
    await page.evaluate(() => history.back());
    await page.waitForSelector('#stroke-page', { state: 'detached' });

    console.log('\n— labeled, complete readings');
    await openWritingRoom(page, base, '伐');
    await wake(page);
    const readings = await page.locator('.stroke-reading-row').evaluateAll((rows) =>
      rows.map((row) => ({
        label: row.querySelector('.stroke-reading-label')?.childNodes[0]?.textContent?.trim() || '',
        value: row.querySelector('.stroke-reading-value')?.textContent?.trim() || '',
        valueLabel: row.querySelector('.stroke-reading-value')?.getAttribute('aria-label') || '',
        lang: row.querySelector('.stroke-reading-value')?.getAttribute('lang') || '',
      })),
    );
    check(
      'readings are two properly labeled Japanese rows',
      readings.length === 2 &&
        readings[0].label === '音読み' &&
        readings[1].label === '訓読み' &&
        readings.every((row) => row.lang === 'ja'),
      JSON.stringify(readings),
    );
    check(
      'all on and kun readings render without two-item truncation',
      readings[0]?.value === 'バツ・ハツ・カ' &&
        readings[1]?.value === 'き（る）・そむ（く）・う（つ）',
      JSON.stringify(readings),
    );
    check(
      'kun okurigana is spoken naturally rather than as dictionary dots',
      readings[1]?.valueLabel === 'きる、そむく、うつ' && !readings[1]?.value.includes('.'),
      JSON.stringify(readings[1]),
    );

    console.log('\n— stroke-synchronized numbers');
    await closeWritingRoom(page);
    await openWritingRoom(page, base, '永');
    await page.waitForFunction(
      `(() => { const ready=document.querySelector('#stroke-page')?.dataset.inkReady;
        return ready && ready !== 'pending'; })()`,
      null,
      { timeout: 20_000 },
    );
    await wake(page);
    const living = await page.locator('#stroke-page').getAttribute('data-living');
    check(
      'normal motion reaches living ink or its honest SVG fallback',
      living === 'on' || living === 'off',
      `data-living=${living}`,
    );
    await installStrokeTrace(page);
    await page.locator('#stroke-numbers').click();
    await page.waitForFunction(
      `(() => { const p=document.querySelector('#stroke-page');
        return p?.dataset.numbers === 'on' && Number(p.dataset.strokeShown || 0) >= 3; })()`,
      null,
      { timeout: 30_000 },
    );
    const numberState = await roomSnapshot(page);
    const firstTrace = (await traceRows(page)).filter((row) => row.numbers === 'on');
    check(
      'number mode is one honest pressed choice',
      numberState?.numbers === 'on' &&
        (await page.locator('#stroke-numbers').getAttribute('aria-pressed')) === 'true',
      JSON.stringify(numberState),
    );
    check(
      'a visible live body-level number layer stays aligned with the ink stage',
      numberState?.living !== 'on' ||
        (!!numberState.stageRect &&
          !!numberState.liftRect &&
          numberState.liftRect.right > numberState.liftRect.left &&
          numberState.liftRect.bottom > numberState.liftRect.top &&
          Math.abs(numberState.liftRect.top - numberState.stageRect.top) <= 1 &&
          Math.abs(numberState.liftRect.left - numberState.stageRect.left) <= 1 &&
          Math.abs(numberState.liftRect.bottom - numberState.stageRect.bottom) <= 1 &&
          Math.abs(numberState.liftRect.right - numberState.stageRect.right) <= 1),
      JSON.stringify({ stage: numberState?.stageRect, lift: numberState?.liftRect }),
    );
    check(
      'each number and pip arises atomically with its stroke',
      firstTrace.some((row) => row.shown === 0) &&
        firstTrace.some((row) => row.shown >= 1) &&
        firstTrace.every(
          (row) => row.visible === row.shown && (row.pipTotal === 0 || row.pips === row.shown),
        ),
      JSON.stringify(firstTrace),
    );

    // Toggle while the hand is in flight. Re-enabling owns a clean rewrite,
    // so the visible sequence cannot resume halfway through an old gesture.
    await page.locator('#stroke-numbers').click();
    const off = await roomSnapshot(page);
    check(
      'turning numbers off removes every marker immediately',
      off?.numbers === 'off' && off.markerVisible === 0,
      JSON.stringify(off),
    );
    await installStrokeTrace(page);
    await page.locator('#stroke-numbers').click();
    await page.waitForFunction(
      `Number(document.querySelector('#stroke-page')?.dataset.strokeShown || 0) >= 2`,
      null,
      { timeout: 30_000 },
    );
    const toggledTrace = (await traceRows(page)).filter((row) => row.numbers === 'on');
    check(
      're-enabling mid-write resets to stroke zero and restarts in sync',
      toggledTrace.some((row) => row.shown === 0) &&
        toggledTrace.some((row) => row.shown >= 1) &&
        toggledTrace.every(
          (row) => row.visible === row.shown && (row.pipTotal === 0 || row.pips === row.shown),
        ),
      JSON.stringify(toggledTrace),
    );

    await installStrokeTrace(page);
    await page.locator('#ink-stage').click();
    await page.waitForFunction(
      `(() => (window.__WRITING_ROOM_TRACE__?.rows || []).some((row) => row.shown === 0) &&
        (window.__WRITING_ROOM_TRACE__?.rows || []).some((row) => row.shown >= 1))()`,
      null,
      { timeout: 15_000 },
    );
    const rewriteTrace = (await traceRows(page)).filter((row) => row.numbers === 'on');
    check(
      'touch-to-rewrite clears and restarts the numbered sequence',
      rewriteTrace.some((row) => row.shown === 0) &&
        rewriteTrace.some((row) => row.shown >= 1) &&
        rewriteTrace.every(
          (row) => row.visible === row.shown && (row.pipTotal === 0 || row.pips === row.shown),
        ),
      JSON.stringify(rewriteTrace),
    );

    // 衷 is the shipped count-mismatch sentinel: KanjiVG has nine paths while
    // the living AnimCJK hand has ten. The live marker layer must follow the
    // hand rather than silently dropping its final number.
    await closeWritingRoom(page);
    await openWritingRoom(page, base, '衷');
    await page.waitForFunction(
      `(() => { const ready=document.querySelector('#stroke-page')?.dataset.inkReady;
        return ready && ready !== 'pending'; })()`,
      null,
      { timeout: 20_000 },
    );
    const mismatch = await roomSnapshot(page);
    const finalMarker = await page.evaluate(() => {
      const root = document.querySelector('.stroke-nums-lift') || document;
      return [...root.querySelectorAll('.stroke-num')].at(-1)?.textContent || '';
    });
    if (mismatch?.living === 'on') {
      check(
        'living marker count follows AnimCJK when KanjiVG differs',
        mismatch.total === 10 && finalMarker === '10',
        `${mismatch.total} markers; last=${finalMarker}`,
      );
    } else {
      check(
        'SVG fallback keeps its complete KanjiVG marker set',
        mismatch?.living === 'off' && mismatch.total === 9 && finalMarker === '9',
        `${mismatch?.total} markers; last=${finalMarker}`,
      );
    }

    console.log('\n— sleep, close, and legacy state');
    await wake(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      `document.querySelector('#stroke-page')?.dataset.chrome === 'sleeping'`,
      null,
      { timeout: 5_000 },
    );
    const slept = await roomSnapshot(page);
    check(
      'Escape sleeps an awake field before it closes the room',
      slept?.chrome === 'sleeping' &&
        slept.interactive.length === 1 &&
        slept.interactive[0].isTrigger,
      JSON.stringify(slept),
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('#stroke-page', { state: 'detached' });
    check(
      'a second Escape closes cleanly with no detached ink sheet',
      (await page.locator('#stroke-page, .ink-sheet').count()) === 0,
      `rooms/canvases=${await page.locator('#stroke-page, .ink-sheet').count()}`,
    );

    await page.evaluate(() => localStorage.setItem('kairo-theme', 'kaku'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
    const legacy = await page.evaluate(() => ({
      stored: localStorage.getItem('kairo-theme'),
      attr: document.documentElement.getAttribute('data-theme'),
    }));
    check(
      'the retired public 殻 world still loads as an internal saved theme',
      legacy.stored === 'kaku' && legacy.attr === 'kaku',
      JSON.stringify(legacy),
    );

    console.log('\n— honest no-data room');
    await openWritingRoom(page, base, '丑');
    const noData = await roomSnapshot(page);
    const noDataProse = await page.evaluate(() => {
      const room = document.querySelector('#stroke-page');
      const painted = (node) => {
        if (!node) return false;
        let current = node;
        while (current && current !== room?.parentElement) {
          const style = getComputedStyle(current);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number.parseFloat(style.opacity || '1') <= 0.02
          )
            return false;
          current = current.parentElement;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      return {
        glyph: document.querySelector('.stroke-missing-glyph')?.textContent || '',
        line: painted(document.querySelector('.stroke-missing-line')),
        note: painted(document.querySelector('.stroke-missing-note')),
        target: Boolean(document.getElementById('stroke-awake-field')),
      };
    });
    check(
      'a no-stroke kanji keeps the same valid dormant trigger contract',
      noData?.minimal === 'on' &&
        noData.chrome === 'sleeping' &&
        noData.interactive.length === 1 &&
        noData.interactive[0].isTrigger &&
        noData.trigger?.controls === 'stroke-awake-field' &&
        noDataProse.target,
      JSON.stringify({ room: noData, noDataProse }),
    );
    check(
      'a no-stroke kanji stays glyph-only instead of leaking explanatory prose',
      noDataProse.glyph === '丑' && !noDataProse.line && !noDataProse.note,
      JSON.stringify(noDataProse),
    );

    await context.close();

    console.log('\n— reduced motion');
    const reducedContext = await browser.newContext({
      viewport: PHONE,
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    });
    const reducedPage = await reducedContext.newPage();
    reducedPage.on('console', (message) => {
      if (message.type() === 'error') noise.push(`reduced: ${message.text()}`);
    });
    reducedPage.on('pageerror', (error) => noise.push(`reduced pageerror: ${error.message}`));
    await bootShelf(reducedPage, base, { clear: true });
    await openWritingRoom(reducedPage, base, '永');
    await reducedPage.waitForFunction(
      `['still','off'].includes(document.querySelector('#stroke-page')?.dataset.living)`,
      null,
      { timeout: 20_000 },
    );
    await wake(reducedPage);
    await reducedPage.locator('#stroke-numbers').click();
    await reducedPage.waitForTimeout(250);
    const reduced = await roomSnapshot(reducedPage);
    const before = reduced?.shown;
    await reducedPage.waitForTimeout(800);
    const after = await roomSnapshot(reducedPage);
    check(
      'reduced motion is a coherent finished still, including all requested numbers',
      reduced?.living === 'still' &&
        reduced.numbers === 'on' &&
        reduced.shown === reduced.total &&
        reduced.markerVisible === reduced.total &&
        (reduced.pipTotal === 0 || reduced.pipsFilled === reduced.total),
      JSON.stringify(reduced),
    );
    check(
      'reduced motion does not advance behind the still',
      before === after?.shown && reduced?.canvasCount === 1,
      `${before} → ${after?.shown}; canvas=${reduced?.canvasCount}`,
    );
    await reducedContext.close();

    check(
      'the writing-room walk requested no missing assets',
      misses.length === 0,
      misses.join(', '),
    );
    check(
      'the writing-room walk emitted no console/page errors',
      noise.length === 0,
      noise.join(' | '),
    );
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
