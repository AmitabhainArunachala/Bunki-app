/* global process, window, localStorage, document, getComputedStyle, console */
// Run from repository root; set REVIEW_EVIDENCE_OUT to an existing scratch directory.
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { AxeBuilder } from '@axe-core/playwright';
const repo = process.cwd(),
  out = process.env.REVIEW_EVIDENCE_OUT;
mkdirSync(out, { recursive: true });
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
};
const server = createServer((req, res) => {
  let p = resolve(repo, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p)) {
    res.writeHead(404);
    return res.end('404');
  }
  res.setHeader('Content-Type', types[extname(p)] || 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }),
  p = await ctx.newPage();
await p.goto(`${base}/decks/kotoba-mine/release/study.html`);
await p.locator('#kp-to-settings').click();
let a = await new AxeBuilder({ page: p }).include('.kp').analyze();
results.push({
  case: 'settings',
  violations: a.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
});
await p.screenshot({ path: `${out}/settings-font.png`, fullPage: true });
await p.goto(`${base}/decks/kotoba-mine/release/study-mcd.html`);
const longest = await p.evaluate(() => {
  const d = window.__CORRIDOR_BUNDLE__['decks/kotoba-mine'],
    list = d.words
      .flatMap((w) => w.cards.filter((c) => c.type === 'word').map((c) => ({ w, c })))
      .sort((a, b) => b.c.ja.length - a.c.ja.length),
    { w, c } = list[0];
  localStorage.setItem(
    'bunki-cloze:kotoba-mcd',
    JSON.stringify({
      format: 'bunki-cloze-state',
      version: 1,
      deckId: 'kotoba-mcd',
      groupsOff: [],
      log: [],
      cards: {
        [c.id]: {
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
    JSON.stringify({ mode: 'self', newPerDay: 0 }),
  );
  return { term: w.term, id: c.id, length: c.ja.length, ja: c.ja };
});
await p.reload();
await p.locator('#kp-start').click();
await p.screenshot({ path: `${out}/longest-mcd-front.png`, fullPage: true });
await p.locator('#kp-reveal').click();
await p.screenshot({ path: `${out}/longest-mcd-back.png`, fullPage: true });
results.push({
  case: 'longest',
  ...longest,
  gradeTop: await p.locator('.kp-grades').evaluate((n) => n.getBoundingClientRect().y),
  termTop: await p.locator('.kp-term').evaluate((n) => n.getBoundingClientRect().y),
  scrollHeight: await p.evaluate(() => document.documentElement.scrollHeight),
});
const colors = await p.evaluate(() => {
  let r = [],
    root = document.querySelector('.kp'),
    card = document.querySelector('.kp-card');
  for (let look of ['dark', 'ai', 'matcha', 'kokuban', 'washi', 'sakura', 'light', 'contrast']) {
    root.dataset.look = look;
    for (let pos of ['noun', 'verb', 'adj', 'adv', 'expr', 'sound']) {
      card.className = `kp-card kp-pos-${pos}`;
      let s = getComputedStyle(document.querySelector('.kp-target'));
      r.push({ look, pos, fg: s.color, bg: getComputedStyle(card).backgroundColor });
    }
  }
  return r;
});
results.push({ case: 'pos-colors', colors });
await ctx.close();
writeFileSync(`${out}/extra-results.json`, JSON.stringify(results, null, 2));
await browser.close();
server.close();
console.log(results.slice(0, 2));
