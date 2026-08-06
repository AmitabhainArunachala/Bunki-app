/**
 * Shared executable harness for the Drift v10 red-team charter (PR #22).
 *
 * The artifact is stored as an HTML body fragment, so this module serves the
 * exact checked-in bytes inside the wrapper documented in ../README.md. Touch
 * helpers use the Chrome DevTools Protocol directly: mouse events are not
 * accepted as gesture evidence for this touch-first surface.
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
export const DRIFT_DIR = resolve(TOOL_DIR, '..');
export const ARTIFACT_PATH = resolve(DRIFT_DIR, 'drift-artifact.html');

const WRAPPER_HEAD =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">' +
  '</head><body>';

export function startArtifactServer() {
  const server = createServer((request, response) => {
    if ((request.url ?? '').split('?')[0] !== '/drift.html') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      'content-type': 'text/html; charset=utf-8',
    });
    response.end(`${WRAPPER_HEAD}${readFileSync(ARTIFACT_PATH, 'utf8')}</body></html>`);
  });

  return new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Drift test server did not expose a TCP address'));
        return;
      }
      resolveReady({
        close: () => new Promise((done) => server.close(done)),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

export async function launchDrift(options = {}) {
  const host = await startArtifactServer();
  const executablePath = [
    process.env['BUNKI_DRIFT_CHROMIUM'],
    options.executablePath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    chromium.executablePath(),
  ].find((candidate) => candidate !== undefined && existsSync(candidate));
  if (executablePath === undefined) {
    await host.close();
    throw new Error(
      'No Chromium executable found. Set BUNKI_DRIFT_CHROMIUM to an existing Chrome/Chromium binary.',
    );
  }
  const browser = await chromium.launch({
    executablePath,
    headless: options.headless ?? true,
  });
  const context = await browser.newContext({
    deviceScaleFactor: options.deviceScaleFactor ?? 2,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
    screen: options.viewport ?? { height: 844, width: 390 },
    viewport: options.viewport ?? { height: 844, width: 390 },
  });
  await context.addInitScript(() => {
    globalThis.__driftFillText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function instrumentedFillText(text, ...args) {
      globalThis.__driftFillText.push(String(text));
      if (globalThis.__driftFillText.length > 20_000) globalThis.__driftFillText.shift();
      return original.call(this, text, ...args);
    };
  });

  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));

  if (options.storage !== undefined) {
    await context.addInitScript((storage) => {
      if (storage === null) localStorage.removeItem('bunki-drift-v1');
      else localStorage.setItem('bunki-drift-v1', storage);
    }, options.storage);
  }

  await page.goto(`${host.origin}/drift.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.word').length >= 12, null, {
    timeout: 15_000,
  });
  const cdp = await context.newCDPSession(page);

  const close = async () => {
    await browser.close();
    await host.close();
  };

  return {
    browser,
    cdp,
    close,
    consoleErrors,
    context,
    executablePath,
    host,
    page,
    pageErrors,
    requests,
  };
}

const point = (x, y, id) => ({ id, radiusX: 1, radiusY: 1, x, y });

export async function dispatchTouches(cdp, type, touches) {
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: touches.map(({ id, x, y }) => point(x, y, id)),
    type,
  });
}

export async function touchTap(cdp, x, y, options = {}) {
  const id = options.id ?? 1;
  await dispatchTouches(cdp, 'touchStart', [{ id, x, y }]);
  await new Promise((done) => setTimeout(done, options.holdMs ?? 45));
  await dispatchTouches(cdp, 'touchEnd', []);
}

export async function touchPath(cdp, paths, options = {}) {
  const steps = options.steps ?? 12;
  const stepMs = options.stepMs ?? 12;
  await dispatchTouches(
    cdp,
    'touchStart',
    paths.map((path, id) => ({ id: id + 1, ...path.from })),
  );
  for (let step = 1; step <= steps; step += 1) {
    const fraction = step / steps;
    await dispatchTouches(
      cdp,
      'touchMove',
      paths.map((path, id) => ({
        id: id + 1,
        x: path.from.x + (path.to.x - path.from.x) * fraction,
        y: path.from.y + (path.to.y - path.from.y) * fraction,
      })),
    );
    if (stepMs > 0) await new Promise((done) => setTimeout(done, stepMs));
  }
  await dispatchTouches(cdp, 'touchEnd', []);
}

export async function touchLongPress(cdp, x, y, holdMs = 520) {
  await dispatchTouches(cdp, 'touchStart', [{ id: 1, x, y }]);
  await new Promise((done) => setTimeout(done, holdMs));
  await dispatchTouches(cdp, 'touchEnd', []);
}

export async function touchPinch(cdp, center, startGap, endGap, options = {}) {
  await touchPath(
    cdp,
    [
      {
        from: { x: center.x - startGap / 2, y: center.y },
        to: { x: center.x - endGap / 2, y: center.y },
      },
      {
        from: { x: center.x + startGap / 2, y: center.y },
        to: { x: center.x + endGap / 2, y: center.y },
      },
    ],
    options,
  );
}

export async function firstWordCenter(page) {
  const word = page.locator('.word').first();
  const box = await word.boundingBox();
  if (box === null) throw new Error('First rendered word has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function readPrivateState(page, expression) {
  return page.evaluate((source) => globalThis.eval(source), expression);
}
