/* VERIFIER claim 2: the FIRST BASE CHARACTER of a stem-ruby token must not
 * move across rest -> furigana reveal -> English gloss, on both dial paths.
 *
 * Measured with a DOM Range over that one character (not the token border box,
 * which legitimately grows when a gloss mounts). Document coordinates, so a
 * scroll caused by the tap cannot fake a pass. Every sample carries witnesses
 * (ruby present, gloss present, token height, base char) so a 0px delta from a
 * state that never changed is visible as such.
 *
 * Usage: node v2-anchor.mjs [--root DIR] [--article ID] [--n 8] [--json OUT]
 */
/* global console */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { serve, phone, openArticle, CORRIDOR } from './lib.mjs';

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : d;
};
const root = arg('--root', CORRIDOR);
const article = arg('--article', 'wikinews:1403');
const want = Number(arg('--n', '8'));
const out = arg('--json', null);

const PROBE = `
  window.__wordBox = (tok) => tok.querySelector('.tok-word') || tok;
  window.__baseRect = (tok) => {
    const scope = window.__wordBox(tok);
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      if (n.parentElement.closest('rt')) continue;
      if (n.parentElement.closest('.tok-en')) continue;
      if (!n.textContent.length) continue;
      const r = document.createRange();
      r.setStart(n, 0);
      r.setEnd(n, 1);
      const b = r.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      return {
        x: +(b.left + window.scrollX).toFixed(3),
        y: +(b.top + window.scrollY).toFixed(3),
        w: +b.width.toFixed(3),
        h: +b.height.toFixed(3),
        ch: n.textContent[0],
      };
    }
    return null;
  };
  window.__sample = (i) => {
    const tok = document.querySelector('#reader button.tok[data-index="' + i + '"]');
    if (!tok) return null;
    const scope = window.__wordBox(tok);
    const bare = [...scope.childNodes].filter(
      (n) => n.nodeType === 3 && n.textContent.trim().length,
    ).length;
    const box = tok.getBoundingClientRect();
    return {
      base: window.__baseRect(tok),
      hasRuby: !!tok.querySelector('ruby'),
      rubyCount: tok.querySelectorAll('ruby').length,
      visibleRt: [...tok.querySelectorAll('rt')].filter((r) => !r.classList.contains('hidden-rt'))
        .length,
      hasEn: !!tok.querySelector('.tok-en'),
      enText: tok.querySelector('.tok-en')?.textContent ?? null,
      hasEnClass: tok.classList.contains('has-en'),
      lit: tok.classList.contains('lit'),
      bareSiblings: bare,
      wordRows: tok.querySelectorAll('.tok-word').length,
      childOrder: [...tok.children].map((c) => c.className || c.tagName.toLowerCase()),
      tokH: +box.height.toFixed(2),
      tokW: +box.width.toFixed(2),
      text: tok.textContent,
    };
  };
`;

const { server, base: origin } = await serve(root);
const { browser, page, errors } = await phone();

async function load(dials) {
  await openArticle(page, origin, article, `dials=${dials}`);
  await page.evaluate(PROBE);
}

// candidates are chosen with furigana ON (2), where stem-ruby is visible:
// a content token whose word holds >=1 <ruby> AND >=1 bare text sibling.
await load('0,2,0');
const candidates = await page.evaluate(`(() => {
  const found = [];
  for (const tok of document.querySelectorAll('#reader button.tok.content')) {
    const scope = window.__wordBox(tok);
    const ruby = scope.querySelectorAll(':scope > ruby').length;
    const bare = [...scope.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length).length;
    if (ruby >= 1 && bare >= 1) found.push({ index: +tok.dataset.index, text: tok.textContent, word: tok.dataset.word });
  }
  return found;
})()`);

const seen = new Set();
const picked = [];
for (const c of candidates) {
  if (seen.has(c.word)) continue;
  seen.add(c.word);
  picked.push(c);
  if (picked.length >= want) break;
}
console.log(`stem-ruby candidates: ${candidates.length}, distinct picked: ${picked.length}`);
console.log(picked.map((p) => `${p.text}@${p.index}`).join('  '));

async function walk(dials, index) {
  await load(dials);
  const sel = `#reader button.tok[data-index="${index}"]`;
  await page.locator(sel).scrollIntoViewIfNeeded();
  const states = [];
  states.push({ state: 'rest', ...(await page.evaluate(`window.__sample(${index})`)) });
  for (const label of ['tap1', 'tap2']) {
    await page.locator(sel).tap();
    await page.waitForTimeout(120);
    states.push({ state: label, ...(await page.evaluate(`window.__sample(${index})`)) });
  }
  return states;
}

const results = [];
for (const dials of ['0,2,0', '0,0,0']) {
  for (const c of picked) {
    const states = await walk(dials, c.index);
    const b0 = states[0].base;
    const deltas = states.slice(1).map((s) => ({
      state: s.state,
      dx: s.base && b0 ? +(s.base.x - b0.x).toFixed(3) : null,
      dy: s.base && b0 ? +(s.base.y - b0.y).toFixed(3) : null,
    }));
    const shift = Math.max(
      ...deltas.map((d) => (d.dx == null ? 0 : Math.hypot(d.dx, d.dy))),
      0,
    );
    // did anything actually happen? a vacuous 0px must be visible
    const rubyChanged = states.some((s) => s.hasRuby !== states[0].hasRuby) ||
      states.some((s) => s.visibleRt !== states[0].visibleRt);
    const glossMounted = states.some((s) => s.hasEn);
    results.push({
      dials,
      index: c.index,
      word: c.word,
      text: c.text,
      shift: +shift.toFixed(3),
      deltas,
      rubyChanged,
      glossMounted,
      states,
    });
    const flag = glossMounted ? '' : '  [NO GLOSS — no dictionary entry]';
    console.log(
      `dials=${dials} ${c.text.padEnd(10)} shift=${shift.toFixed(3)}px  ruby${states.map((s) => (s.hasRuby ? '1' : '0')).join('')} en${states.map((s) => (s.hasEn ? '1' : '0')).join('')} h=${states.map((s) => s.tokH).join('/')} rows=${states.map((s) => s.wordRows).join('/')} order=${JSON.stringify(states.at(-1).childOrder)}${flag}`,
    );
  }
}

const worst = results.reduce((a, b) => (b.shift > a.shift ? b : a), results[0]);
const glossless = results.filter((r) => !r.glossMounted);
console.log(
  `\nWORST anchor shift ${worst.shift}px on ${worst.text} (dials ${worst.dials}); samples=${results.length}; samples with no gloss=${glossless.length}`,
);
console.log(`consoleErr=${errors.console.length} pageErr=${errors.page.length}`);
if (errors.console.length) console.log(errors.console.slice(0, 5));
if (errors.page.length) console.log(errors.page.slice(0, 5));

if (out)
  writeFileSync(
    out,
    JSON.stringify(
      { root, article, worstShift: worst.shift, samples: results.length, errors, results },
      null,
      2,
    ),
  );

await browser.close();
server.close();
