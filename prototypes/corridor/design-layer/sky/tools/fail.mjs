import { webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
// negative controls: (1) the data file refused, (2) no graphics context: the old first screen must come back; (3) ?sky=0 and a driven browser without ?sky=1 keep the old screen
const b = await webkit.launch();
const run = async (name, url, prep) => { const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); if (prep) await prep(c); const p = await c.newPage(); await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1'); await p.waitForTimeout(5000);
  console.log(name, JSON.stringify(await p.evaluate(() => ({ attr: document.documentElement.getAttribute('data-bunki-sky'), host: !!document.getElementById('bunki-sky'), oldVisible: getComputedStyle(document.querySelector('#drift-layer #sky')).visibility, words: document.querySelectorAll('#drift-layer #sky > .word').length, sky: !!window.__SKY__ })))); await c.close(); };
await run('data refused   ', 'http://127.0.0.1:18841/?sky=1', (c) => c.route('**/design/sky/sky-data.json*', (r) => r.abort()));
await run('no graphics    ', 'http://127.0.0.1:18841/?sky=1', (c) => c.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; }));
await run('?sky=0         ', 'http://127.0.0.1:18841/?sky=0');
await run('driven, no flag', 'http://127.0.0.1:18841/');
await run('?sky=1 (works) ', 'http://127.0.0.1:18841/?sky=1');
await b.close();
