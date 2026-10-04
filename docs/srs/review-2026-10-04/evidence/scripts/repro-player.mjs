/* global process, Storage, DOMException, localStorage, document, PointerEvent, navigator, caches, URL, fetch, window, console */
// Run from repository root; set REVIEW_EVIDENCE_OUT to an existing scratch directory.
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
const repo = process.cwd(),
  out = process.env.REVIEW_EVIDENCE_OUT,
  types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
  };
let networkDown = false;
const server = createServer((req, res) => {
  if (networkDown) {
    req.socket.destroy();
    return;
  }
  let u = req.url.split('?')[0];
  if (u.endsWith('/harness.html')) {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<html lang="ja"><body><main id="app"></main></body></html>');
  }
  let p = resolve(repo, '.' + decodeURIComponent(u));
  if (existsSync(p) && statSync(p).isDirectory()) p = resolve(p, 'index.html');
  if (!existsSync(p)) {
    res.writeHead(404);
    return res.end('404');
  }
  res.setHeader('Content-Type', types[extname(p)] || 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({ args: ['--no-sandbox'] });
let results = {};
const fresh = async (init) => {
  let c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (init) await c.addInitScript(init);
  let p = await c.newPage();
  return { c, p };
};
const start = async (p) => {
  await p.goto(`${base}/decks/kotoba-mine/release/study.html`);
  await p.locator('#kp-start').click();
  await p.locator('#kp-reveal').click();
};
{
  let { c, p } = await fresh();
  await start(p);
  await p.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await p.locator('#kp-grade-good').click();
  results.storageFailure = {
    count: await p.locator('.kp-count').textContent(),
    undoVisible: await p.locator('#kp-undo').count(),
    ledger: await p.evaluate(() => localStorage.getItem('bunki-cloze:kotoba-mine')),
    ui: await p.locator('.kp').innerText(),
  };
  await p.screenshot({ path: `${out}/storage-failure.png`, fullPage: true });
  await c.close();
}
{
  let { c, p } = await fresh();
  await start(p);
  await p.locator('#kp-grade-good').click();
  await p.locator('#kp-quit').click();
  await p.locator('#kp-to-settings').click();
  await p.locator('#kp-backup').fill('{}');
  await p.getByRole('button', { name: '復元', exact: true }).click();
  results.invalidRestore = {
    ui: await p.locator('.kp-settings').innerText(),
    ledger: await p.evaluate(() => JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine'))),
  };
  await p.screenshot({ path: `${out}/invalid-backup-restore.png`, fullPage: true });
  await c.close();
}
{
  let { c, p } = await fresh();
  await start(p);
  await p.evaluate(() => {
    let n = document.querySelector('#kp-card');
    n.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, clientY: 100, bubbles: true }));
    n.dispatchEvent(new PointerEvent('pointermove', { clientX: 255, clientY: 400, bubbles: true }));
    n.dispatchEvent(
      new PointerEvent('pointercancel', { clientX: 255, clientY: 400, bubbles: true }),
    );
  });
  results.pointerCancel = {
    count: await p.locator('.kp-count').textContent(),
    // nothing stored yet reads as an empty log
    ledger: await p.evaluate(() => {
      const raw = localStorage.getItem('bunki-cloze:kotoba-mine');
      return { stored: raw !== null, log: raw ? JSON.parse(raw).log : [] };
    }),
  };
  await c.close();
}
{
  let { c, p } = await fresh(() =>
    localStorage.setItem(
      'bunki-cloze:prefs:v3:kotoba-mine',
      // 簡単 (easy) is one of the four buttons, shown only when the learner turns them on
      JSON.stringify({ newPerDay: 1, grades: 'four' }),
    ),
  );
  await start(p);
  await p.locator('#kp-grade-easy').click();
  results.doneUndo = {
    done: await p.locator('.kp-done').count(),
    undo: await p.locator('#kp-undo').count(),
    text: await p.locator('.kp').innerText(),
  };
  await p.screenshot({ path: `${out}/done-no-undo.png`, fullPage: true });
  await c.close();
}
{
  let { c, p } = await fresh();
  await p.goto(`${base}/prototypes/corridor/harness.html`);
  results.coldOffline = await p.evaluate(async () => {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    await new Promise((r) => {
      if (navigator.serviceWorker.controller) r();
      else navigator.serviceWorker.addEventListener('controllerchange', r, { once: true });
    });
    let keys = await caches.open('kairo-v11-closure').then((x) => x.keys());
    return {
      cached: keys.map((x) => new URL(x.url).pathname),
      controlled: !!navigator.serviceWorker.controller,
    };
  });
  networkDown = true;
  await c.setOffline(true);
  results.coldOffline.importResult = await p.evaluate(async () => {
    try {
      await import('./decks/player/mount.js');
      return 'loaded';
    } catch (e) {
      return String(e);
    }
  });
  results.coldOffline.pinFetch = await p.evaluate(async () => {
    try {
      let x = await fetch('./data/fsrs-pin.json');
      return x.status;
    } catch (e) {
      return String(e);
    }
  });
  await c.close();
  networkDown = false;
}
{
  let { c, p } = await fresh();
  await p.goto(`${base}/decks/kotoba-mine/release/study-mcd.html`);
  await p.locator('#kp-to-settings').click();
  await p.locator('[data-pref="mode:choice"]').click();
  await p.locator('.kp-icon').click();
  await p.evaluate(() => {
    const d = window.__CORRIDOR_BUNDLE__['decks/kotoba-mine'];
    const w = d.words[0],
      id = w.cards.find((x) => x.type === 'kanji').id;
    localStorage.setItem(
      'bunki-cloze:kotoba-mcd',
      JSON.stringify({
        format: 'bunki-cloze-state',
        version: 1,
        deckId: 'kotoba-mcd',
        groupsOff: [],
        log: [],
        cards: {
          [id]: {
            due: '2020-01-01T00:00:00.000Z',
            stability: 1,
            difficulty: 5,
            state: 2,
            reps: 1,
            lapses: 0,
            elapsed_days: 1,
            scheduled_days: 1,
          },
        },
      }),
    );
    localStorage.setItem(
      'bunki-cloze:prefs:v3:kotoba-mcd',
      JSON.stringify({ mode: 'choice', look: 'ai', newPerDay: 0 }),
    );
  });
  await p.reload();
  await p.locator('#kp-start').click();
  results.kanjiChoice = await p.locator('#kp-card').innerText();
  await p.screenshot({ path: `${out}/kanji-choice-front.png`, fullPage: true });
  await c.close();
}
writeFileSync(`${out}/repro-results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();
