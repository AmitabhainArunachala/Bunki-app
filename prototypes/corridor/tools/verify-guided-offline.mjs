/**
 * 案内つきの稽古 offline — the guided session opens without a network after one online visit.
 *
 * The room (S.view 'guided') is imported only when its door is pressed. One ordinary online
 * visit, which never opens the room, lets the app register its own service worker. Then the
 * browser context goes offline (Playwright's context.setOffline) and the fixture server severs
 * every socket as well, so no worker fetch can slip past the emulation. The app starts again
 * from its worker and the room is opened for the first time: its modules, styles, question
 * set and sprite sheet must all come from the install.
 *
 * Real Chromium, HTTPS (index.html registers the worker only on https:), a fresh context.
 * KAIRO_SITE_DIR / KAIRO_ARTIFACT_SHA256 / KAIRO_EVIDENCE_DIR as the other suites.
 * Usage: node verify-guided-offline.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { extname, join, resolve, sep } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const SITE = resolveCorridorSite();
const RUN = mkdtempSync(join(resolveCorridorEvidence(), 'guided-offline-'));
const HOST = 'kairo-guided-offline.test';
const APP = '/Bunki-app/';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.m4a': 'audio/mp4',
};

const results = [];
let failures = 0;
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

const state = { online: true, offlineRequests: [] };
function startServer() {
  const key = join(RUN, 'key.pem');
  const cert = join(RUN, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
    '-days', '1', '-subj', `/CN=${HOST}`], { stdio: 'ignore' });
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'https://fixture.invalid').pathname);
    if (!state.online) {
      state.offlineRequests.push(path);
      request.socket.destroy();
      return;
    }
    const file = resolve(SITE, path.startsWith(APP) ? path.slice(APP.length) || 'index.html' : '.missing');
    if (!file.startsWith(SITE + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
  rmSync(key);
  rmSync(cert);
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `https://${HOST}:${server.address().port}` }));
  });
}

const ready = (page) => page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 })
  .then(() => true, () => false);

async function main() {
  const identity = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
  console.log(`artifact ${identity.artifactSha256} · ${identity.gitSha}${identity.sourceDirty ? ' (dirty)' : ''}`);
  const { server, base } = await startServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, '--ignore-certificate-errors', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  context.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)));
  const url = `${base}${APP}index.html?entry=shelf&ui=bi`;
  const report = { artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty, site: SITE };
  try {
    // the one online visit: the app registers its own worker; the room is never opened
    let page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    const bootedOnline = await ready(page);
    const controlled = await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 90000 })
      .then(() => true, () => false);
    check('one online visit installs the app\'s own worker, and it controls the page', bootedOnline && controlled);
    report.installedGuided = await page.evaluate(async () => {
      const rows = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) {
          const path = new URL(request.url).pathname;
          if (/\/guided/.test(path)) rows.push(path.replace(/^.*\/Bunki-app\//, ''));
        }
      }
      return rows.sort();
    });
    console.log(`       installed guided assets: ${report.installedGuided.join(', ') || 'none'}`);
    await page.close();

    // offline: the emulation, and a server that answers nobody
    await context.setOffline(true);
    state.online = false;
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' }).catch(() => {});
    const bootedOffline = await ready(page);
    const fromWorker = await page.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false);
    check('the app starts offline from its worker', bootedOffline && fromWorker);
    const unreachable = await page.evaluate(async () => {
      try { return !(await fetch('never-cached-proof.json')).ok; } catch { return true; }
    });
    check('control: an uncached request really fails offline', unreachable);

    await page.locator('#chrome-dojo').click();
    await page.locator('button[data-study-door="guided"]').click();
    const opened = await Promise.race([
      page.waitForSelector('.guided-room .gs-main', { timeout: 20000 }).then(() => 'room'),
      page.waitForSelector('[data-guided-retry]', { timeout: 20000 }).then(() => 'failed'),
    ]).catch(() => 'timeout');
    const said = await page.evaluate(() => document.querySelector('main')?.innerText.slice(0, 160) || '');
    await page.screenshot({ path: join(RUN, '01-guided-room-offline.png') });
    check('offline, the guided room opens the first time its door is pressed', opened === 'room', `${opened} · ${said.replace(/\s+/g, ' ')}`);
    if (opened === 'room') {
      const styled = await page.evaluate(() => !!document.querySelector('link[data-guided-style]')?.sheet);
      check('its stylesheet came from the install', styled);
      await page.locator('.guided-room [data-action="setup"]').click();
      await page.locator('.guided-room [data-action="start"]').click();
      const stage = await page.locator('.guided-room').getAttribute('data-stage');
      check('its question set came from the install: the first question opens', stage === 'question', `stage=${stage}`);
      await page.screenshot({ path: join(RUN, '02-first-question-offline.png') });
      // a wrong answer plays the samurai cut: the moments module, its style and the sprite sheet
      await page.locator('.guided-room [name="answer"][value="1"]').check();
      await page.locator('.guided-room [data-action="check"]').first().click();
      const moment = await page.waitForSelector('.samurai-effect', { timeout: 8000 }).then(() => true, () => false);
      if (moment) await page.screenshot({ path: join(RUN, '03-samurai-offline.png') });
      const sprite = await page.evaluate(async () => {
        const image = new Image();
        image.src = 'guided/samurai-sprites-v2.png';
        try { await image.decode(); return image.naturalWidth; } catch { return 0; }
      });
      check('its moments play offline: module, style and sprite sheet from the install', moment && sprite > 0,
        `samurai=${moment} · sprite ${sprite}px wide`);
    }
    const guidedMisses = state.offlineRequests.filter((path) => /\/guided/.test(path));
    report.offlineRequests = state.offlineRequests;
    check('no guided asset was asked of the network while offline', opened === 'room' && guidedMisses.length === 0,
      guidedMisses.join(', ') || `${state.offlineRequests.length} other request(s) refused: ${[...new Set(state.offlineRequests)].slice(0, 6).join(', ') || 'none'}`);
    check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'clean');
  } finally {
    await browser.close();
    server.close();
  }
  report.summary = { total: results.length, failed: failures };
  report.results = results;
  writeFileSync(join(RUN, 'guided-offline.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  console.log(`evidence → ${RUN}`);
  return failures ? 1 : 0;
}

main().then((code) => process.exit(code), (error) => {
  console.error(error);
  process.exit(2);
});
