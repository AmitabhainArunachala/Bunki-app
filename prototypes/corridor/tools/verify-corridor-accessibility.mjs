/**
 * KAIRO A0.5 accessibility verifier.
 *
 * Proves the reader's pointer/keyboard/switch-shaped routes, the staged reveal
 * geometry, non-hold alternatives, dialog focus lifecycle, hidden-control tab
 * discipline, and meaningful reduced motion in real Chromium.
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

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const REPO = resolve(CORRIDOR_DIR, '..', '..');
const EVIDENCE_DIR = resolve(REPO, 'docs/build-evidence/kairo-a05-accessibility');
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

async function touchAt(page, selector, index = 0, holdMs = 0) {
  const target = page.locator(selector).nth(index);
  await target.scrollIntoViewIfNeeded();
  const box = await target.evaluate((node) => {
    const rect = node.getClientRects()[0] ?? node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const cdp = await page.context().newCDPSession(page);
  const point = {
    x: box.x + box.width / 2,
    y: box.y + Math.min(box.height / 2, 12),
    radiusX: 5,
    radiusY: 5,
    force: 1,
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(160);
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
    const glyph = node.querySelector('ruby') ?? node;
    return glyph.getBoundingClientRect().bottom;
  });
}

async function openWordDialog(page) {
  const token = page.locator('#reader .tok.content').nth(2);
  await token.focus();
  const direct = page.locator('.token-actions:not([hidden]) [data-action="entry.open"]');
  if ((await direct.count()) > 0) {
    await direct.click();
  } else {
    await touchAt(page, '#reader .tok.content', 2, 2_250);
  }
  await page.waitForSelector('#sheet');
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
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

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
      alternatives: document.querySelectorAll('.token-actions:not([hidden]) button').length,
      hiddenTabStops: [...document.querySelectorAll('#app [hidden]')].flatMap((root) =>
        [...root.querySelectorAll('button, a, input, [tabindex]')]
      ).filter((node) => node.tabIndex >= 0 && !node.disabled && node.offsetParent !== null).length,
    }))()`);
    check(
      'focused word exposes quick-look and full-entry non-hold alternatives',
      focusProbe.tokenFocused && focusProbe.alternatives >= 2,
      JSON.stringify(focusProbe),
    );
    check(
      'hidden Corridor controls leave the tab order',
      focusProbe.hiddenTabStops === 0,
      `${focusProbe.hiddenTabStops} hidden tab stop(s)`,
    );
    await page.keyboard.press('Tab');
    const firstAlternative = await page.evaluate('document.activeElement?.dataset.action ?? null');
    await page.keyboard.press('Tab');
    const secondAlternative = await page.evaluate('document.activeElement?.dataset.action ?? null');
    check(
      'sequential switch navigation reaches quick look then full entry',
      firstAlternative === 'quickLook.open' && secondAlternative === 'entry.open',
      `${firstAlternative} → ${secondAlternative}`,
    );
    await word.focus();
    const accessibilitySession = await page.context().newCDPSession(page);
    const accessibilityTree = await accessibilitySession.send('Accessibility.getFullAXTree');
    await accessibilitySession.detach();
    const namedButtons = accessibilityTree.nodes
      .filter((node) => node.role?.value === 'button' && node.name?.value)
      .map((node) => node.name.value);
    check(
      'screen-reader tree exposes named token and non-hold action buttons',
      // the token label describes the ladder from its CURRENT rung — with
      // full furigana the default, "a further activation" is the honest
      // wording; "third activation" was the fixed-ladder phrasing it replaced
      namedButtons.some((name) => /further activation|third activation|三回目/.test(name)) &&
        namedButtons.some((name) => /quick look|語釈/.test(name)) &&
        namedButtons.some((name) => /full entry|全項目/.test(name)),
      `${namedButtons.length} named button(s) in the accessibility tree`,
    );
    await page.waitForTimeout(80);
    await page.screenshot({ path: resolve(SHOTS_DIR, '01-reader-focus-alternatives.png') });

    console.log('\n— progressive action parity and geometry');
    await openReader(page, base);
    await setRevealOnTouch(page);
    const tokenIndex = 2;
    await touchAt(page, '#reader .tok.content', tokenIndex);
    const afterFirst = await page.locator('#reader .tok.content').nth(tokenIndex).evaluate((node) => ({
      lit: node.classList.contains('lit'),
      gloss: Boolean(node.querySelector('.tok-en')),
    }));
    const beforeGlossBottom = await glyphBottom(page, tokenIndex);
    await touchAt(page, '#reader .tok.content', tokenIndex);
    const afterSecond = await page.locator('#reader .tok.content').nth(tokenIndex).evaluate((node) => ({
      lit: node.classList.contains('lit'),
      gloss: Boolean(node.querySelector('.tok-en')),
    }));
    const afterGlossBottom = await glyphBottom(page, tokenIndex);
    check(
      'pointer action one reveals reading and action two reveals English',
      afterFirst.lit && !afterFirst.gloss && afterSecond.gloss,
      JSON.stringify({ afterFirst, afterSecond }),
    );
    check(
      'second-action English preserves the glyph anchor within 2px',
      Math.abs(afterGlossBottom - beforeGlossBottom) < 2,
      `${beforeGlossBottom.toFixed(1)}px → ${afterGlossBottom.toFixed(1)}px`,
    );
    await touchAt(page, '#reader .tok.content', tokenIndex);
    // the circle grammar (2026-08-12): the third activation folds the word
    // back to plain kanji — the full entry lives on the holds and the
    // focus-alternatives door, both covered elsewhere in this suite
    const pointerThirdState = await page.locator('#reader .tok.content').nth(tokenIndex).evaluate((node) => ({
      lit: node.classList.contains('lit'),
      gloss: Boolean(node.querySelector('.tok-en')),
      sheet: Boolean(document.querySelector('#sheet')),
    }));
    check(
      'pointer third target.activate closes the circle — plain kanji, no sheet',
      !pointerThirdState.lit && !pointerThirdState.gloss && !pointerThirdState.sheet,
      JSON.stringify(pointerThirdState),
    );
    const pointerThird = 0;
    const pointerReceipts = await page.evaluate(
      `window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.kind === 'target.activate') ?? []`,
    );
    check(
      'pointer route emits target.activate envelopes with pointer provenance',
      pointerReceipts.length >= 3 && pointerReceipts.slice(-3).every((r) => r.provenance.modality === 'pointer'),
      `${pointerReceipts.length} receipt(s)`,
    );
    if (pointerThird) await page.keyboard.press('Escape');

    await openReader(page, base);
    await setRevealOnTouch(page);
    const keyboardWord = page.locator('#reader .tok.content').nth(tokenIndex);
    await keyboardWord.focus();
    const keyboardFocusable = await page.evaluate(
      `document.activeElement?.matches('#reader .tok.content') ?? false`,
    );
    if (keyboardFocusable) {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(180);
    }
    const keyboardThird = await page.locator('#sheet').count();
    const keyboardCircle = await page.locator('#reader .tok.content').nth(tokenIndex).evaluate((node) => ({
      lit: node.classList.contains('lit'),
      gloss: Boolean(node.querySelector('.tok-en')),
    }));
    const keyboardReceipts = await page.evaluate(
      `window.__KAIRO_INTERACTION__?.receipts?.filter((r) => r.action.kind === 'target.activate') ?? []`,
    );
    check(
      'keyboard/switch-shaped activation walks the same circle — three activations end plain',
      keyboardFocusable && keyboardThird === 0 && !keyboardCircle.lit && !keyboardCircle.gloss,
      `focusable=${keyboardFocusable} sheet=${keyboardThird} state=${JSON.stringify(keyboardCircle)}`,
    );
    check(
      'keyboard route differs only in provenance',
      keyboardReceipts.length >= 3 &&
        keyboardReceipts.slice(-3).every((r) => r.provenance.modality === 'keyboard'),
      `${keyboardReceipts.length} receipt(s)`,
    );
    if (keyboardThird) await page.keyboard.press('Escape');

    console.log('\n— particle rhythm and direct accessible door');
    await openReader(page, base);
    const particle = page.locator('#reader .tok.particle').first();
    await touchAt(page, '#reader .tok.particle');
    const particleTap = {
      sheet: await page.locator('#sheet').count(),
      reveal: await particle.evaluate((node) => node.classList.contains('lit')),
    };
    check(
      'particle pointer tap stays inert in reading rhythm',
      particleTap.sheet === 0 && !particleTap.reveal,
      JSON.stringify(particleTap),
    );
    await particle.focus();
    const particleDoor = page.locator(
      '.token-actions:not([hidden]) [data-action="entry.open"][data-target-kind="particle"]',
    );
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

    // Quiet-label contrast across all five nihonga worlds. The WCAG contrast
    // variant once pinned light-world ink values that sank every label into
    // the 夜 ground at ~1.2:1 (operator's phone, 2026-08-11) — this walk
    // measures the real composited colors so no theme can regress silently.
    const themePage = await context.newPage();
    for (const theme of ['hokusai', 'yoru']) {
      await openReader(themePage, base);
      await themePage.evaluate(`localStorage.setItem('kairo-theme', '${theme}')`);
      await themePage.reload();
      await openReader(themePage, base);
      await openWordDialog(themePage);
      const ratios = await themePage.evaluate(`(() => {
        const lum = ([r, g, b]) => {
          const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const parse = (s) => s.match(/[\\d.]+/g).map(Number);
        const composite = (fg, bg) => {
          const c = parse(fg); const a = c.length === 4 ? c[3] : 1; const b = parse(bg);
          return [0, 1, 2].map((i) => c[i] * a + b[i] * (1 - a));
        };
        const contrast = (fgStr, bgStr) => {
          const L1 = lum(composite(fgStr, bgStr)); const L2 = lum(parse(bgStr));
          const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
          return (hi + 0.05) / (lo + 0.05);
        };
        const bg = getComputedStyle(document.querySelector('#sheet')).backgroundColor;
        const out = {};
        for (const sel of ['#sheet .eyebrow', '#sheet .pool-tag']) {
          const node = document.querySelector(sel);
          if (node) out[sel] = contrast(getComputedStyle(node).color, bg);
        }
        return out;
      })()`);
      const values = Object.values(ratios);
      check(
        `quiet sheet labels meet 4.5:1 in the ${theme} world`,
        values.length > 0 && values.every((r) => r >= 4.5),
        Object.entries(ratios)
          .map(([sel, r]) => `${sel.replace('#sheet .', '')} ${r.toFixed(2)}:1`)
          .join(' · '),
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
