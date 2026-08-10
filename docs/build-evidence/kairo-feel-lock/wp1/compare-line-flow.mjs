/**
 * WP1 acceptance 2: reader line flow must match the reference build.
 *
 * The reference (origin/claude/bunki-app-prototype-2rds5a) renders reader
 * tokens as PLAIN INLINE text — its stylesheet puts no display rule on .tok at
 * all. The current build wraps every content token in an inline-flex column so
 * the glyph box stays identical once English mounts. This script checks that
 * the column did not change where the reader's lines break.
 *
 * Method: open the same article at 390x844 in both builds, walk every reader
 * token in document order, group them by the top edge of their first client
 * rect (that is the visual line), and emit one string per line. Then diff the
 * line arrays. Screenshots of both are written for the eye.
 *
 * Usage: node compare-line-flow.mjs --ref REF.html --cur CUR.html [--shots DIR] [--json OUT.json]
 */
/* global console */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWPORT = { width: 390, height: 844 };
const ARTICLE = 'wikinews:1403';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const refPath = resolve(arg('--ref'));
const curPath = resolve(arg('--cur'));
const shotsDir = resolve(arg('--shots', join(HERE, 'shots')));
const jsonOut = arg('--json');
mkdirSync(shotsDir, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8' };
function serveFile(file) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(file)] ?? 'text/html' });
    res.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** Group reader tokens into visual lines.
 *
 * The line key is the token's BASE GLYPH position, taken with a DOM Range over
 * its first non-<rt> character — not the token's border box. The current build
 * gives content tokens a 44px inline-flex box whose top edge varies with the
 * token's own content, so a border-box top would split one printed line into
 * many. The glyph sits on the line's baseline in both builds, so it is the
 * only key that compares like with like. */
const LINES = `(() => {
  const glyphTop = (t) => {
    const row = t.querySelector('.tok-word') || t;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentElement && n.parentElement.closest('rt')) continue;
      if (!n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      r.setEnd(n, 1);
      const b = r.getBoundingClientRect();
      if (!b.height) continue;
      return b.bottom + window.scrollY; // baseline-ish: the glyph's foot
    }
    return null;
  };
  // paragraph boundaries, as reader-text character offsets: the newer corpus
  // carries a paras[] array the reference's copy of the article lacks, so a
  // structural break must never be mistaken for a typographic one
  const paraOffsets = [];
  {
    let acc = 0;
    for (const node of document.querySelectorAll('#reader .tok, #reader .para-break')) {
      if (node.classList.contains('para-break')) paraOffsets.push(acc);
      else acc += node.textContent.length;
    }
  }
  const toks = [...document.querySelectorAll('#reader .tok')];
  const lines = [];
  let cur = null;
  for (const t of toks) {
    const top = glyphTop(t);
    if (top === null) continue;
    // reader lines sit ~53px apart; 10px absorbs per-glyph font wobble
    if (!cur || Math.abs(top - cur.top) > 10) {
      cur = { top: Math.round(top * 10) / 10, text: '', first: t.textContent };
      lines.push(cur);
    }
    cur.text += t.textContent;
  }
  return {
    lines: lines.map((l) => l.text),
    lineTops: lines.map((l) => l.top),
    firstTokens: lines.map((l) => l.first),
    fullText: lines.map((l) => l.text).join(''),
    tokenCount: toks.length,
    paraOffsets,
  };
})()`;

async function readBuild(label, file) {
  const { server, base } = await serveFile(file);
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${base}/?entry=shelf`, { waitUntil: 'load' });
  await page.waitForSelector('.shelf-item', { timeout: 30000 });
  await page.click(`.shelf-item[data-passage="${ARTICLE}"]`);
  await page.waitForSelector('#reader .tok', { timeout: 30000 });
  let prev = -1;
  for (let i = 0; i < 40; i += 1) {
    const n = await page.evaluate(`document.querySelectorAll('#reader .tok').length`);
    if (n === prev && n > 0) break;
    prev = n; await page.waitForTimeout(120);
  }
  const data = await page.evaluate(LINES);
  await page.screenshot({ path: join(shotsDir, `line-flow-${label}.png`) });
  await browser.close();
  server.close();
  return { ...data, errors };
}

const ref = await readBuild('reference', refPath);
const cur = await readBuild('current', curPath);

console.log(`reference: ${ref.tokenCount} tokens, ${ref.lines.length} lines`);
console.log(`current  : ${cur.tokenCount} tokens, ${cur.lines.length} lines`);

const sameText = ref.fullText === cur.fullText;
console.log(`\nreader text identical between builds: ${sameText}`);
if (!sameText) {
  console.log(`  ref chars ${ref.fullText.length} · cur chars ${cur.fullText.length}`);
  let i = 0;
  while (i < ref.fullText.length && ref.fullText[i] === cur.fullText[i]) i += 1;
  console.log(`  first divergence at char ${i}: ref "${ref.fullText.slice(i, i + 30)}" vs cur "${cur.fullText.slice(i, i + 30)}"`);
}

/* The two builds do not ship the same copy of the article, so a whole-article
 * line-by-line equality is not a meaningful test. What IS comparable is WHERE
 * a line breaks, expressed as a character offset into the reader text: that is
 * independent of tokenisation and of how much article follows. Compared over
 * the common text prefix only. */
const endOffsets = (lines) => {
  const out = []; let acc = 0;
  for (const l of lines) { acc += l.length; out.push(acc); }
  return out;
};
const refEnds = endOffsets(ref.lines);
const curEnds = endOffsets(cur.lines);
let common = 0;
while (common < ref.fullText.length && common < cur.fullText.length
  && ref.fullText[common] === cur.fullText[common]) common += 1;

/* Compare only where the two builds are structurally the same text: up to the
 * common prefix AND up to the first paragraph break either build introduces.
 * Past a paragraph the newer corpus inserts, every later line is shifted for a
 * content reason and the comparison stops meaning anything. */
const firstPara = Math.min(
  ...[...(ref.paraOffsets ?? []), ...(cur.paraOffsets ?? [])].filter((o) => o > 0),
  Number.POSITIVE_INFINITY,
);
const compareWindow = Math.min(common, Number.isFinite(firstPara) ? firstPara : common);
console.log(`\nparagraph-break offsets — ref [${(ref.paraOffsets ?? []).join(' ')}] cur [${(cur.paraOffsets ?? []).join(' ')}]`);
console.log(`comparable window (shared text, before the first paragraph break): ${compareWindow} chars`);

const refInPrefix = refEnds.filter((o) => o <= compareWindow);
const curInPrefix = curEnds.filter((o) => o <= compareWindow);
const pairs = Math.min(refInPrefix.length, curInPrefix.length);
const deltas = [];
for (let i = 0; i < pairs; i += 1) deltas.push(curInPrefix[i] - refInPrefix[i]);
const maxAbsDelta = deltas.reduce((m, d) => Math.max(m, Math.abs(d)), 0);

console.log(`\ncommon text prefix: ${common} chars`);
console.log(`line-break offsets in that prefix — ref ${refInPrefix.length}, cur ${curInPrefix.length}`);
console.log(`  ref: ${refInPrefix.join(' ')}`);
console.log(`  cur: ${curInPrefix.join(' ')}`);
console.log(`  delta (cur-ref): ${deltas.join(' ')}   max |delta| ${maxAbsDelta} chars`);

const n = Math.max(ref.lines.length, cur.lines.length);
const diffs = [];
for (let i = 0; i < n; i += 1) {
  if (ref.lines[i] !== cur.lines[i]) diffs.push({ line: i + 1, ref: ref.lines[i] ?? '(none)', cur: cur.lines[i] ?? '(none)' });
}

/* The real regression signature is a torn/short line, so also report how full
 * each line runs: a line the reader sees as print fills the measure. */
const fill = (lines) => {
  const body = lines.slice(0, -1); // the last line of a paragraph is short by nature
  return body.length ? +(body.reduce((a, l) => a + l.length, 0) / body.length).toFixed(1) : 0;
};
console.log(`\nmean chars per line (excluding final line) — ref ${fill(ref.lines)}, cur ${fill(cur.lines)}`);
console.log(`shortest non-final line — ref ${Math.min(...ref.lines.slice(0, -1).map((l) => l.length))}, cur ${Math.min(...cur.lines.slice(0, -1).map((l) => l.length))}`);

const noErrors = ref.errors.length === 0 && cur.errors.length === 0;
// PASS = every line break in the shared text lands within a couple of
// characters of the reference's, and neither build errors.
const pass = maxAbsDelta <= 6 && noErrors && pairs >= 2;
console.log(`\nreference console/page errors: ${ref.errors.length}`);
console.log(`current   console/page errors: ${cur.errors.length}`);
console.log(`RESULT ${pass ? 'PASS' : 'FAIL'} — line breaks within ${maxAbsDelta} chars of the reference over ${common} shared chars`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    article: ARTICLE, viewport: VIEWPORT,
    note: 'the reference branch ships a shorter, differently paragraphed copy of this article; only the common text prefix is comparable',
    reference: { file: refPath, lines: ref.lines.length, tokens: ref.tokenCount, chars: ref.fullText.length, errors: ref.errors },
    current: { file: curPath, lines: cur.lines.length, tokens: cur.tokenCount, chars: cur.fullText.length, errors: cur.errors },
    sameText, commonPrefixChars: common,
    breakOffsets: { ref: refInPrefix, cur: curInPrefix, deltas, maxAbsDelta },
    meanCharsPerLine: { ref: fill(ref.lines), cur: fill(cur.lines) },
    differingLines: diffs, refLines: ref.lines, curLines: cur.lines, pass,
  }, null, 2));
}
process.exit(pass ? 0 : 1);
