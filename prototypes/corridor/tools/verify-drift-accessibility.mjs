/**
 * Drift A0.5 accessibility verifier.
 *
 * Exercises the authoritative standalone Drift source and its fused Corridor
 * emission in real Chromium. The checks cover semantic staging, keyboard and
 * switch-shaped routes, non-hold constellation/surface/judgment alternatives,
 * tide/theme semantics, focus lifecycle, hidden-tab suspension, reduced
 * motion, and the boundary that keeps Drift nominations out of Corridor/FSRS
 * state.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium \
 *   DRIFT_A11Y_EVIDENCE_PHASE=green node verify-drift-accessibility.mjs
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const PROTOTYPES_DIR = resolve(CORRIDOR_DIR, '..');
const REPO = resolve(PROTOTYPES_DIR, '..');
const PHASE = (process.env.DRIFT_A11Y_EVIDENCE_PHASE || 'current').replace(/[^a-z0-9_-]/gi, '');
const EVIDENCE_DIR = resolve(REPO, 'docs/build-evidence/kairo-a05-drift-accessibility');
const SHOTS_DIR = resolve(EVIDENCE_DIR, 'screenshots');
const VIEWPORT = { width: 390, height: 844 };
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

const results = [];
const errors = [];
const misses = [];
let failures = 0;

function check(name, pass, detail = '') {
  const result = { name, pass: Boolean(pass), detail: String(detail) };
  results.push(result);
  if (!result.pass) failures += 1;
  console.log(`${result.pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

function startServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    const rel = pathname === '/' ? 'corridor/index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(PROTOTYPES_DIR, rel);
    if (!file.startsWith(PROTOTYPES_DIR) || !existsSync(file)) {
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
      accept({ server, base: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function newContext(browser, reducedMotion = 'no-preference') {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    reducedMotion,
  });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      const original = Storage.prototype.setItem;
      window.__driftStorageWrites = [];
      Storage.prototype.setItem = function (key, value) {
        window.__driftStorageWrites.push({ key: String(key), value: String(value) });
        return original.call(this, key, value);
      };
    } catch {}
  });
  return context;
}

function watch(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: console: ${message.text()}`);
  });
}

async function bootFused(context, base) {
  const page = await context.newPage();
  watch(page, 'fused');
  await page.goto(`${base}/corridor/index.html?entry=drift`, { waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
  await page.waitForFunction('document.querySelectorAll("#drift-layer .word").length >= 20');
  await page.waitForTimeout(1_500);
  return page;
}

async function bootSource(context, base) {
  const page = await context.newPage();
  watch(page, 'source');
  await page.goto(`${base}/drift/drift-artifact.html`, { waitUntil: 'load' });
  await page.waitForFunction('document.querySelectorAll("#sky .word").length >= 20');
  await page.waitForTimeout(1_500);
  return page;
}

async function visibleWord(page, root = '#drift-layer') {
  const handles = await page.locator(`${root} .word`).elementHandles();
  for (const handle of handles) {
    const probe = await handle.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        opacity: Number.parseFloat(getComputedStyle(node).opacity || '1'),
        pointer: getComputedStyle(node).pointerEvents,
        directHit: hit === node || hit?.closest?.('.word,.glyph,.part') === node,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      };
    });
    if (
      probe.opacity >= 0.4 &&
      probe.pointer !== 'none' &&
      probe.directHit &&
      probe.rect.left > 55 &&
      probe.rect.right < VIEWPORT.width - 55 &&
      probe.rect.top > 165 &&
      probe.rect.bottom < VIEWPORT.height - 150
    ) {
      return handle;
    }
    await handle.dispose();
  }
  throw new Error('no stable visible Drift word');
}

async function touchHandle(page, handle, holdMs = 60) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('target has no box');
  const cdp = await page.context().newCDPSession(page);
  const point = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    radiusX: 5,
    radiusY: 5,
    force: 1,
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(180);
}

async function wordAX(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  const document = await cdp.send('DOM.getDocument', { depth: -1 });
  const query = await cdp.send('DOM.querySelector', { nodeId: document.root.nodeId, selector });
  const tree = query.nodeId
    ? await cdp.send('Accessibility.queryAXTree', { nodeId: query.nodeId })
    : { nodes: [] };
  await cdp.detach();
  return tree.nodes
    .filter((node) => !node.ignored)
    .map((node) => ({ role: node.role?.value ?? '', name: node.name?.value ?? '' }));
}

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16);

async function inspectSemanticSurface(page, root) {
  return page.evaluate((scope) => {
    const nodes = [...document.querySelectorAll(`${scope} .word,${scope} .glyph,${scope} .part`)];
    return {
      count: nodes.length,
      native: nodes.filter((node) => node.matches('button')).length,
      named: nodes.filter((node) => Boolean(node.getAttribute('aria-label'))).length,
      targetActions: nodes.filter((node) => node.dataset.action === 'target.activate').length,
      tabStops: nodes.filter((node) => node.tabIndex >= 0 && node.getAttribute('aria-hidden') !== 'true').length,
      minHit: nodes.reduce((floor, node) => {
        if (node.tabIndex < 0 || node.getAttribute('aria-hidden') === 'true') return floor;
        const rect = node.getBoundingClientRect();
        return Math.min(floor, rect.width, rect.height);
      }, Infinity),
    };
  }, root);
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM });

  try {
    console.log('\n— authoritative source and fused semantic bodies');
    const context = await newContext(browser);
    const fused = await bootFused(context, base);
    const source = await bootSource(context, base);
    const fusedSemantics = await inspectSemanticSurface(fused, '#drift-layer');
    const sourceSemantics = await inspectSemanticSurface(source, 'body');
    for (const [label, semantics] of [
      ['fused', fusedSemantics],
      ['source', sourceSemantics],
    ]) {
      check(
        `${label} Drift bodies are named native target.activate controls`,
        semantics.count >= 20 &&
          semantics.native === semantics.count &&
          semantics.named === semantics.count &&
          semantics.targetActions === semantics.count &&
          semantics.tabStops > 0,
        JSON.stringify(semantics),
      );
      check(
        `${label} actionable Drift bodies retain a 44px hit floor`,
        Number.isFinite(semantics.minHit) && semantics.minHit >= 44,
        `minimum ${Number.isFinite(semantics.minHit) ? semantics.minHit.toFixed(1) : 'none'}px`,
      );
    }

    const first = await fused.locator('#drift-layer .word').first().evaluate((node) => ({
      reading: node.querySelector('.yomi')?.textContent ?? '',
      surface: node.querySelector('.base')?.textContent ?? '',
      gloss: node.querySelector('.gloss')?.textContent ?? '',
    }));
    const initialAX = await wordAX(fused, '#drift-layer .word');
    const spoken = initialAX.map((node) => node.name).join(' ');
    check(
      'unrevealed word exposes only its surface in the accessibility tree',
      spoken.includes(first.surface) &&
        (!first.reading || !spoken.includes(first.reading)) &&
        (!first.gloss || !spoken.includes(first.gloss)),
      JSON.stringify({ first, initialAX }),
    );

    console.log('\n— keyboard/switch progressive action and non-hold lock');
    const word = await visibleWord(fused);
    const target = await word.evaluate((node) => node.querySelector('.base')?.textContent ?? '');
    await word.focus();
    const focusable = await word.evaluate((node) => document.activeElement === node);
    await fused.keyboard.press('Enter');
    await fused.waitForTimeout(180);
    const firstStage = await word.evaluate((node) => ({
      unfolded: node.classList.contains('unfolded'),
      glossed: node.classList.contains('glossed'),
      name: node.getAttribute('aria-label'),
    }));
    await fused.keyboard.press('Enter');
    await fused.waitForTimeout(180);
    const secondStage = await word.evaluate((node) => ({
      unfolded: node.classList.contains('unfolded'),
      glossed: node.classList.contains('glossed'),
      name: node.getAttribute('aria-label'),
    }));
    const targetReceipts = await fused.evaluate(
      `window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.kind === 'target.activate') ?? []`,
    );
    check(
      'Enter follows the same reading-then-English staging as pointer activation',
      focusable && firstStage.unfolded && !firstStage.glossed && secondStage.glossed,
      JSON.stringify({ target, focusable, firstStage, secondStage }),
    );
    check(
      'keyboard target activation emits neutral envelopes with keyboard provenance',
      targetReceipts.length >= 2 && targetReceipts.slice(-2).every((r) => r.provenance.modality === 'keyboard'),
      `${targetReceipts.length} receipt(s)`,
    );
    await word.focus();
    await fused.keyboard.press('Tab');
    const nextAction = await fused.evaluate('document.activeElement?.dataset.action ?? null');
    check(
      'sequential switch navigation reaches the discoverable non-hold constellation action',
      nextAction === 'constellation.lock',
      String(nextAction),
    );
    if (nextAction === 'constellation.lock') await fused.keyboard.press('Space');
    await fused.waitForTimeout(600);
    const lock = await fused.evaluate(`(() => {
      const members = [...document.querySelectorAll('#drift-layer .word.bsat')];
      const centerNode = document.querySelector('#drift-layer .word.bctr,#drift-layer .glyph.bctr');
      const bodies = [centerNode, ...members, ...document.querySelectorAll('#drift-layer .glyph.lockpin')].filter(Boolean);
      const rects = bodies.map((node) => {
        const rect = node.getBoundingClientRect();
        const label = node.querySelector('.base,.g');
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          direct: hit === node || hit?.closest?.('.word,.glyph,.part') === node,
          isolated: getComputedStyle(label).backgroundColor !== 'rgba(0, 0, 0, 0)',
        };
      });
      let overlaps = 0;
      for (let a = 0; a < rects.length; a += 1) for (let b = a + 1; b < rects.length; b += 1) {
        const width = Math.min(rects[a].right, rects[b].right) - Math.max(rects[a].left, rects[b].left);
        const height = Math.min(rects[a].bottom, rects[b].bottom) - Math.max(rects[a].top, rects[b].top);
        if (width > 1 && height > 1) overlaps += 1;
      }
      const actions = document.querySelector('#drift-layer #driftActions');
      const actionRect = actions.getBoundingClientRect();
      const doorRect = document.querySelector('#enter-shelf-door').getBoundingClientRect();
      const actionDoorOverlap = Math.max(0, Math.min(actionRect.right, doorRect.right) - Math.max(actionRect.left, doorRect.left)) *
        Math.max(0, Math.min(actionRect.bottom, doorRect.bottom) - Math.max(actionRect.top, doorRect.top));
      const controls = [...actions.querySelectorAll('button:not([hidden])')];
      const directControls = controls.filter((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === button || hit?.closest?.('button') === button;
      }).length;
      return {
        center: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? '',
        members: members.length,
        named: members.filter((node) => Boolean(node.getAttribute('aria-label'))).length,
        typed: members.filter((node) => Boolean(node.dataset.relation)).length,
        geometry: {
          bodies: bodies.length,
          overlaps,
          direct: rects.filter((rect) => rect.direct).length,
          isolated: rects.filter((rect) => rect.isolated).length,
        },
        actions: {
          controls: controls.length,
          direct: directControls,
          doorOverlap: actionDoorOverlap,
          inViewport: actionRect.left >= 0 && actionRect.right <= innerWidth &&
            actionRect.top >= 0 && actionRect.bottom <= innerHeight,
          hintOpacity: Number.parseFloat(getComputedStyle(document.querySelector('#drift-layer #hint')).opacity),
        },
        receipt: window.__KAIRO_INTERACTION__?.receipts?.at(-1) ?? null,
      };
    })()`);
    check(
      'non-hold lock preserves the real ≥12-member constellation',
      lock.center === target && lock.members >= 12 && lock.named === lock.members,
      JSON.stringify(lock),
    );
    check(
      'constellation relation types are semantic, not color-only',
      lock.members >= 12 && lock.typed > 0,
      `${lock.typed}/${lock.members} typed member(s)`,
    );
    check(
      'constellation lock emits the same neutral action with keyboard provenance',
      lock.receipt?.action?.kind === 'constellation.lock' && lock.receipt?.provenance?.modality === 'keyboard',
      JSON.stringify(lock.receipt),
    );
    check(
      'locked graph bodies remain separated, directly hittable, and isolated from edge ink',
      lock.geometry.bodies >= 12 && lock.geometry.overlaps === 0 &&
        lock.geometry.direct === lock.geometry.bodies && lock.geometry.isolated === lock.geometry.bodies,
      JSON.stringify(lock.geometry),
    );
    check(
      'non-hold action strip is fully visible and unobscured by Corridor chrome',
      lock.actions.controls === 3 && lock.actions.direct === 3 && lock.actions.doorOverlap === 0 &&
        lock.actions.inViewport && lock.actions.hintOpacity < 0.1,
      JSON.stringify(lock.actions),
    );
    await fused.screenshot({ path: resolve(SHOTS_DIR, `${PHASE}-01-keyboard-constellation.png`) });

    console.log('\n— meaningful tide and theme semantics');
    await fused.reload({ waitUntil: 'load' });
    await fused.waitForFunction('document.body.dataset.ready === "1"');
    await fused.waitForTimeout(1_200);
    const tideBefore = await fused.locator('#drift-layer #lvl').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        role: node.getAttribute('role'),
        tabIndex: node.tabIndex,
        min: node.getAttribute('aria-valuemin'),
        max: node.getAttribute('aria-valuemax'),
        now: node.getAttribute('aria-valuenow'),
        text: node.getAttribute('aria-valuetext'),
        width: rect.width,
      };
    });
    await fused.locator('#drift-layer #lvl').focus();
    await fused.keyboard.press('ArrowUp');
    await fused.waitForTimeout(1_100);
    const tideAfter = await fused.locator('#drift-layer #lvl').evaluate((node) => ({
      now: node.getAttribute('aria-valuenow'),
      text: node.getAttribute('aria-valuetext'),
    }));
    const tideReceipt = await fused.evaluate(
      `window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.kind === 'tide.set').at(-1) ?? null`,
    );
    check(
      'tide is a named vertical slider with value semantics and a 44px target',
      tideBefore.role === 'slider' &&
        tideBefore.tabIndex === 0 &&
        tideBefore.min != null &&
        tideBefore.max != null &&
        tideBefore.now != null &&
        Boolean(tideBefore.text) &&
        tideBefore.width >= 44,
      JSON.stringify(tideBefore),
    );
    check(
      'tide arrow keys commit a new stop through tide.set',
      tideAfter.now !== tideBefore.now && tideReceipt?.provenance?.modality === 'keyboard',
      JSON.stringify({ tideAfter, tideReceipt }),
    );

    const theme = fused.locator('#drift-layer #theme');
    const themeBefore = await theme.evaluate((node) => ({ text: node.textContent, name: node.getAttribute('aria-label') }));
    await theme.focus();
    await fused.keyboard.press('Enter');
    await fused.waitForTimeout(120);
    const themeAfter = await theme.evaluate((node) => ({ text: node.textContent, name: node.getAttribute('aria-label') }));
    const themeReceipt = await fused.evaluate(
      `window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.target?.kind === 'theme').at(-1) ?? null`,
    );
    check(
      'theme control names its current value and updates it after keyboard activation',
      themeBefore.name?.includes(themeBefore.text) &&
        themeAfter.text !== themeBefore.text &&
        themeAfter.name?.includes(themeAfter.text),
      JSON.stringify({ themeBefore, themeAfter }),
    );
    check(
      'theme activation also travels through the neutral target action',
      themeReceipt?.action?.kind === 'target.activate' && themeReceipt?.provenance?.modality === 'keyboard',
      JSON.stringify(themeReceipt),
    );

    console.log('\n— depth, card, hidden controls, and focus lifecycle');
    await fused.reload({ waitUntil: 'load' });
    await fused.waitForFunction('document.body.dataset.ready === "1"');
    await fused.waitForTimeout(1_300);
    const diveWord = await visibleWord(fused);
    await touchHandle(fused, diveWord);
    await touchHandle(fused, diveWord);
    await touchHandle(fused, diveWord);
    const depthProbe = await fused.evaluate(`(() => ({
      depth: document.querySelector('#drift-layer #depth')?.textContent ?? '',
      back: [...document.querySelectorAll('#drift-layer [data-action="navigation.back"]')]
        .find((node) => !node.hidden && node.tabIndex >= 0)?.getAttribute('aria-label') ?? '',
    }))()`);
    check(
      'a discoverable navigation.back alternative appears at dive depth',
      Boolean(depthProbe.depth) && Boolean(depthProbe.back),
      JSON.stringify(depthProbe),
    );
    const center = fused.locator('#drift-layer .word.center,#drift-layer .glyph.center,#drift-layer .part.center').first();
    if ((await center.count()) > 0) await touchHandle(fused, await center.elementHandle());
    const card = await fused.evaluate(`(() => {
      const node = document.querySelector('#drift-layer #card');
      return {
        open: node.classList.contains('open'),
        role: node.getAttribute('role'),
        modal: node.getAttribute('aria-modal'),
        name: node.getAttribute('aria-label') || node.getAttribute('aria-labelledby'),
        focusInside: node.contains(document.activeElement),
        close: Boolean(node.querySelector('[data-action="layer.dismiss"]')),
      };
    })()`);
    check(
      'Drift card is a named dialog with close semantics and focus entry',
      card.open && card.role === 'dialog' && Boolean(card.name) && card.focusInside && card.close,
      JSON.stringify(card),
    );
    if (card.open) await fused.keyboard.press('Escape');
    await fused.waitForTimeout(120);
    const cardReturn = await fused.evaluate(`(() => ({
      closed: !document.querySelector('#drift-layer #card').classList.contains('open'),
      hidden: document.querySelector('#drift-layer #card').getAttribute('aria-hidden'),
      focusOnBody: document.activeElement?.matches('#drift-layer .word,#drift-layer .glyph,#drift-layer .part') ?? false,
    }))()`);
    check(
      'Escape closes the card, removes it from AT, and returns focus to its body',
      cardReturn.closed && cardReturn.hidden === 'true' && cardReturn.focusOnBody,
      JSON.stringify(cardReturn),
    );
    const closedOverlays = await fused.evaluate(`(() => {
      const roots = ['#card:not(.open)', '#radoc:not(.open)'].map((selector) =>
        document.querySelector('#drift-layer ' + selector)).filter(Boolean);
      const leaks = roots.flatMap((root) => [...root.querySelectorAll('button,a[href],input,[tabindex]')]
        .filter((node) => node.tabIndex >= 0 && !node.disabled));
      return {
        leaks: leaks.map((node) => node.id || node.textContent.trim()),
        roots: roots.map((node) => ({ id: node.id, hidden: node.getAttribute('aria-hidden'), inert: node.inert })),
      };
    })()`);
    check(
      'closed Drift overlays are inert, AT-hidden, and absent from tab order',
      closedOverlays.leaks.length === 0 && closedOverlays.roots.every((root) => root.hidden === 'true' && root.inert),
      JSON.stringify(closedOverlays),
    );

    await fused.locator('#drift-layer #theme').focus();
    await fused.evaluate('window.__DRIFT__.hide()');
    const hiddenFocus = await fused.evaluate(`(() => {
      const layer = document.querySelector('#drift-layer');
      return {
        active: document.activeElement?.id ?? '',
        inside: layer.contains(document.activeElement),
        inert: layer.inert,
        hidden: layer.getAttribute('aria-hidden'),
      };
    })()`);
    check(
      'hiding the fused layer evacuates focus and makes the whole surface inert',
      !hiddenFocus.inside && hiddenFocus.inert && hiddenFocus.hidden === 'true',
      JSON.stringify(hiddenFocus),
    );
    await fused.evaluate('window.__DRIFT__.show()');

    console.log('\n— action authority and learner-state boundary');
    await fused.reload({ waitUntil: 'load' });
    await fused.waitForFunction('document.body.dataset.ready === "1"');
    await fused.waitForTimeout(1_200);
    const authorityWord = await visibleWord(fused);
    await authorityWord.focus();
    await fused.keyboard.press('Enter');
    await fused.keyboard.press('Tab');
    const nonJudgmentWrites = await fused.evaluate(`({
      writes: window.__driftStorageWrites ?? [],
      drift: localStorage.getItem('bunki-drift-v1'),
      corridor: localStorage.getItem('kairo-corridor-v1'),
    })`);
    check(
      'accessibility reveal/selection actions write neither Drift judgment nor Corridor/FSRS state',
      nonJudgmentWrites.writes.length === 0 && nonJudgmentWrites.drift == null && nonJudgmentWrites.corridor == null,
      JSON.stringify(nonJudgmentWrites),
    );
    const known = fused.locator('#drift-layer [data-action="judgment.nominate"][data-judgment="known"]');
    const hasKnown = (await known.count()) > 0 && (await known.first().isVisible());
    if (hasKnown) {
      await known.first().focus();
      await fused.keyboard.press('Enter');
      await fused.waitForTimeout(160);
    }
    const judgmentBoundary = await fused.evaluate(`(() => ({
      receipt: window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.kind === 'judgment.nominate').at(-1) ?? null,
      writes: window.__driftStorageWrites ?? [],
      drift: localStorage.getItem('bunki-drift-v1'),
      corridor: localStorage.getItem('kairo-corridor-v1'),
    }))()`);
    check(
      'explicit judgment alternative only nominates locally and cannot write Corridor/FSRS state',
      hasKnown &&
        judgmentBoundary.receipt?.provenance?.modality === 'keyboard' &&
        Boolean(judgmentBoundary.drift) &&
        judgmentBoundary.corridor == null &&
        judgmentBoundary.writes.every((write) => write.key === 'bunki-drift-v1'),
      JSON.stringify(judgmentBoundary),
    );
    await fused.screenshot({ path: resolve(SHOTS_DIR, `${PHASE}-02-semantic-controls.png`) });

    console.log('\n— hidden-tab lifetime');
    await fused.reload({ waitUntil: 'load' });
    await fused.waitForFunction('document.body.dataset.ready === "1"');
    await fused.waitForTimeout(1_200);
    const bloomWord = await visibleWord(fused);
    await touchHandle(fused, bloomWord);
    const bloomBefore = await fused.locator('#drift-layer .word.bsat').count();
    const hiddenState = await fused.evaluate(`(() => {
      window.__driftVisibilityFixture = 'visible';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => window.__driftVisibilityFixture,
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => window.__driftVisibilityFixture === 'hidden',
      });
      window.__driftVisibilityFixture = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      return document.visibilityState;
    })()`);
    await fused.waitForTimeout(10_500);
    await fused.evaluate(`(() => {
      window.__driftVisibilityFixture = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    await fused.waitForTimeout(500);
    const bloomAfter = await fused.locator('#drift-layer .word.bsat').count();
    check(
      'background-tab time is suspended and does not consume the 10s constellation TTL',
      hiddenState === 'hidden' && bloomBefore > 0 && bloomAfter > 0,
      JSON.stringify({ hiddenState, bloomBefore, bloomAfter }),
    );

    console.log('\n— meaningful and live reduced motion');
    const reducedContext = await newContext(browser, 'reduce');
    const reduced = await bootFused(reducedContext, base);
    const motion = await reduced.evaluate(`(() => {
      const describe = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
          scrollBehavior: style.scrollBehavior,
        };
      };
      return {
        root: describe('#drift-layer'),
        word: describe('#drift-layer .word'),
        yomi: describe('#drift-layer .word .yomi'),
        card: describe('#drift-layer #card'),
        tide: describe('#drift-layer #lvl'),
      };
    })()`);
    const transitionsStill = Object.values(motion)
      .filter(Boolean)
      .every((entry) => entry.animationDuration === '0s' && entry.transitionDuration.split(', ').every((v) => v === '0s'));
    const shotA = digest(await reduced.screenshot());
    await reduced.waitForTimeout(650);
    const shotB = digest(await reduced.screenshot());
    check(
      'reduced motion removes Drift transitions and animation durations',
      transitionsStill,
      JSON.stringify(motion),
    );
    check(
      'settled reduced-motion Drift is visually stationary across frames',
      shotA === shotB,
      `${shotA} → ${shotB}`,
    );
    await reduced.screenshot({ path: resolve(SHOTS_DIR, `${PHASE}-03-reduced-motion.png`) });
    await reducedContext.close();

    const liveContext = await newContext(browser);
    const liveMotion = await bootFused(liveContext, base);
    await liveMotion.emulateMedia({ reducedMotion: 'reduce' });
    await liveMotion.waitForTimeout(120);
    const livePreference = await liveMotion.evaluate(`(() => ({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      marked: document.querySelector('#drift-layer')?.classList.contains('drift-reduced') ?? false,
      transition: getComputedStyle(document.querySelector('#drift-layer .word')).transitionDuration,
    }))()`);
    check(
      'runtime reduced-motion preference changes take effect without reload',
      livePreference.matches && livePreference.marked && livePreference.transition.split(', ').every((v) => v === '0s'),
      JSON.stringify(livePreference),
    );
    await liveContext.close();

    console.log('\n— generated-source parity and clean walk');
    let layerParity = false;
    let standaloneParity = false;
    try {
      execFileSync(process.execPath, [resolve(TOOL_DIR, 'build-drift-layer.mjs'), '--check'], {
        cwd: REPO,
        stdio: 'pipe',
      });
      layerParity = true;
    } catch (error) {
      errors.push(`layer parity: ${error.stderr?.toString().trim() || error.message}`);
    }
    try {
      execFileSync(process.execPath, [resolve(TOOL_DIR, 'build-standalone.mjs'), '--check'], {
        cwd: REPO,
        stdio: 'pipe',
      });
      standaloneParity = true;
    } catch (error) {
      errors.push(`standalone parity: ${error.stderr?.toString().trim() || error.message}`);
    }
    check('committed fused Drift outputs match the authoritative artifact', layerParity);
    check('committed standalone matches the authoritative fused inputs', standaloneParity);
    check('real walks requested no missing assets', misses.length === 0, misses.join(', '));
    check('real walks emitted no page/console/parity errors', errors.length === 0, errors.join(' | '));

    await source.screenshot({ path: resolve(SHOTS_DIR, `${PHASE}-04-source-authority.png`) });
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const report = {
    schemaVersion: 1,
    verifier: 'verify-drift-accessibility.mjs',
    evidencePhase: PHASE,
    head,
    chromium: CHROMIUM || 'playwright-default',
    viewport: VIEWPORT,
    summary: { total: results.length, passed: results.length - failures, failed: failures },
    results,
    screenshots: [
      `screenshots/${PHASE}-01-keyboard-constellation.png`,
      `screenshots/${PHASE}-02-semantic-controls.png`,
      `screenshots/${PHASE}-03-reduced-motion.png`,
      `screenshots/${PHASE}-04-source-authority.png`,
    ],
    errors,
    misses,
  };
  const reportFile = resolve(EVIDENCE_DIR, `${PHASE}-verification-report.json`);
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${report.summary.passed}/${report.summary.total} checks passed`);
  console.log(`report → ${reportFile}`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
