/** DOTS: actual raster visibility, independent of the CSS pigment proxy.
 * Delta-E 76 >= 10 is a conservative engineering separation, not a WCAG rule.
 * Evidence-only --worlds may narrow a diagnostic, never the full 22-context claim.
 * The ladder contract is exercised as an attribute, not claimed as a ladder interaction.
 * Lead 1940's title rows use real first and second taps on fresh native profiles; they
 * measure the title's layout through the first state, not the Ladder's own behaviour.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { startStaticHost } from '../../bunki-desktop/lib/static-host.cjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';

const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const PARA = { unmet: 23, met: 14, again: 18, recalled: 20, owned: 13, listed: 21, notYet: 31 };
const DAY = 86400000;
const STORY = 'kantei:jp-105-actions-202609-25startup';
const CONTEXT_STORY = 'aozora:000772-1';
const LIVE = [{ name: 'live-daisho', id: STORY, query: 'スタートアップ大賞', word: '大賞' }, { name: 'live-watashi', id: CONTEXT_STORY, query: '私の個人主義', word: '私' }];
const savedWord = (id, now) => ({ t: 'word', id, label: id, ts: now - 40 * DAY, started: now - 40 * DAY });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const option = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const allowedArgs = new Set(['--worlds', '--control-current-paint']);
for (let i = 2; i < process.argv.length; i++) { if (process.argv[i] === '--diagnostic-inline-end') continue; assert(allowedArgs.has(process.argv[i]) && process.argv[i + 1], `Invalid option ${process.argv[i]}`); i++; }
const diagnosticInlineEnd = process.argv.includes('--diagnostic-inline-end');
const worlds = option('--worlds')?.split(',') || WORLDS;
assert(worlds.length && new Set(worlds).size === worlds.length && worlds.every((w) => WORLDS.includes(w)), 'Named, unique public worlds required');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['webkit', 'chromium'];
assert(engines.every((e) => ['webkit', 'chromium'].includes(e)), 'Unknown engine');
const evidence = resolveCorridorEvidence();
const controlFile = option('--control-current-paint');
const controlBytes = controlFile ? readFileSync(resolve(controlFile)) : null;
const report = { schemaVersion: 1, runId: process.env.KAIRO_GATE_RUN_ID || randomUUID(), startedAt: new Date().toISOString(),
  verifierSha256: hash(readFileSync(fileURLToPath(import.meta.url))), command: [process.execPath, ...process.argv.slice(1)],
  scope: { engines, worlds, full: engines.length === 2 && worlds.length === 11, rooms: ['slip', 'basis', 'tray', 'today', 'mirror'],
    card: { title: STORY, context: `${CONTEXT_STORY} 講演 met+saved`, live: LIVE.map((l) => `${l.id} ${l.word}: fresh profile, real first and second input`) },
    fixture: 'G2 first paragraph; native installation record; exact dictionary identities', ladder: 'attribute contract only' },
  thresholds: { fillCssPx: 6, actualFillExtentCssPx: 5, actualFillAreaCssPx2: 18, actualFillNote: 'Interior mask excludes 0.25px radius edge; extent allows circle antialiasing, area rejects clipped stripes', keptOuterCssPx: 10, knownContrast: 3, savedContrast: 3, metContrast: 1.5, semanticDeltaE76: 10,
    deltaEStatus: 'conservative engineering bound, not WCAG', measurement: 'actual device pixels: painted screenshot vs identical geometry with only dots hidden; paper is the hidden pixel' },
  diagnosticInlineEnd,
  control: { file: controlFile, sha256: controlBytes ? hash(controlBytes) : null, served: [], setupError: null }, contexts: [], errors: [], passed: false, fullAcceptance: false };
const save = () => writeFileSync(resolve(evidence, 'verify-depth-visibility.json'), JSON.stringify(report, null, 2));
const row = (out, id, passed, detail) => { out.rows.push({ id, passed: Boolean(passed), detail }); if (!passed) console.log(`FAIL ${out.engine}/${out.world} ${id}`); };
let host;
let base;
function png(buffer) {
  let at = 8, width, height, depth, type, interlace; const chunks = [];
  while (at < buffer.length) { const n = buffer.readUInt32BE(at), kind = buffer.toString('latin1', at + 4, at + 8), d = buffer.subarray(at + 8, at + 8 + n);
    if (kind === 'IHDR') { width = d.readUInt32BE(0); height = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    if (kind === 'IDAT') chunks.push(d); if (kind === 'IEND') break; at += n + 12; }
  assert(depth === 8 && [2, 6].includes(type) && interlace === 0, 'Unsupported PNG');
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(chunks)), pixels = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride), line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) { const f = raw[y * (stride + 1)], bytes = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = bytes[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } else assert(f === 0, 'Unsupported PNG filter'); line[x] = v & 255; }
    for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) pixels[(y * width + x) * 3 + k] = line[x * bpp + k]; [prev, line] = [line, prev]; }
  return { width, height, pixels };
}
const pix = (im, x, y) => { assert(x >= 0 && y >= 0 && x < im.width && y < im.height, 'Pixel outside screenshot'); const i = (y * im.width + x) * 3; return Array.from(im.pixels.subarray(i, i + 3)); };
const linear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => rgb.map(linear).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const lab = (rgb) => { const [r, g, b] = rgb.map(linear); const f = (t) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047), y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b), z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883); return [116 * y - 16, 500 * (x - y), 200 * (y - z)]; };
const delta = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const median = (colors) => colors.length ? [0, 1, 2].map((i) => colors.map((x) => x[i]).sort((a, b) => a - b)[Math.floor(colors.length / 2)]) : null;
const hideCss = '#reader .tok > .tok-word::after,.japanese-lookup-word::after,#mini .mini-word::after,.today-star::after{visibility:hidden!important}.depth-dot{visibility:hidden!important}';
async function boot(page) {
  await page.goto(new URL('index.html?entry=shelf&ui=bi', base).href);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
}
async function story(page, id = STORY, query = 'スタートアップ大賞') {
  await boot(page);
  const direct = page.locator(`[data-passage="${id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click(); else { await openShelfTools(page); await page.locator('#shelf-reading-search').fill(query); await page.locator('#shelf-reading-search').press('Enter'); await page.locator(`#shelf-reading-results [data-passage="${id}"] .shelf-open`).first().click(); }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30000 }); await delay(1000);
}
/** The title as laid out now, with the native depth of every card word read
 * through the app's own resolver, independent of painted attributes. */
const titleLayout = (page) => page.evaluate(async () => {
  await document.fonts.ready;
  const h1 = document.querySelector('.reader-card > h1.view-title');
  if (!h1) return null;
  const style = getComputedStyle(h1);
  const words = [...document.querySelectorAll('.reader-card .japanese-lookup-word[data-lookup-text]')].map((w) => {
    const d = window.__KAIRO_DEPTH__.depth({ t: 'word', id: w.dataset.lookupText });
    return { text: w.dataset.lookupText, title: h1.contains(w), painted: w.dataset.depth != null || w.dataset.kept != null, nativeActive: Boolean(d && (d.depth !== 'unmet' || d.kept)) };
  });
  return { fontSize: style.fontSize, lineHeight: style.lineHeight, paddingBottom: style.paddingBottom, height: h1.getBoundingClientRect().height, titleWords: words.filter((w) => w.title).length, words };
});
const stateless = (layout, where = () => true) => Boolean(layout) && !layout.words.some((w) => where(w) && (w.painted || w.nativeActive));
const sameRhythm = (a, b) => Boolean(a && b) && ['fontSize', 'lineHeight', 'paddingBottom', 'height'].every((k) => a[k] === b[k]);
/** Commit a whole learner record through the app's own replication store. */
async function commitRecord(page, value, tag) {
  const blank = new URL(`__dots-${tag}-blank`, base).href;
  await page.route(blank, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Native fixture</title>' }));
  await page.goto(blank);
  await page.evaluate(async ({ text, moduleUrl, tag }) => { const core = await import(moduleUrl); const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')); const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { const before = await store.snapshot(); await store.commitLocal({ changeId: `dots-${tag}-${crypto.randomUUID()}`, binding: policy.binding, expectedRevision: before.revision, occurredAt: new Date().toISOString(), mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: JSON.parse(text) }], operations: [] }); } finally { await store.close(); }
  }, { text: JSON.stringify(value), moduleUrl: new URL('modules/record-core.mjs', base).href, tag });
}
async function seed(page, out) {
  await story(page);
  out.freshTitle = await titleLayout(page);
  const nodes = await page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, at]) => { const node = window.__KAIRO_DEPTH__.readerNode(at); return [name, { node, key: window.__KAIRO_DEPTH__.key(node || {}), kind: window.__KAIRO_DEPTH__.identity(node || {})?.kind }]; })), PARA);
  const wanted = { unmet: '出席', met: '官邸', again: '大賞', recalled: '表彰', owned: '大臣', listed: '式', notYet: '挨拶' };
  assert(Object.entries(wanted).every(([k, v]) => nodes[k]?.node?.id === v && nodes[k].kind === 'core'), `Fixture identity mismatch: ${JSON.stringify(nodes)}`);
  const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day()), now = Date.now();
  const value = (await readAppRecordSnapshot(page)).record;
  const item = (id) => savedWord(id, now);
  const card = (stability, daysAgo) => ({ due: new Date(now + Math.round(stability * 0.6) * DAY).toISOString(), last_review: new Date(now - daysAgo * DAY).toISOString(), stability, difficulty: 5.1, elapsed_days: daysAgo, scheduled_days: Math.round(stability * 0.6) + daysAgo, reps: 7, lapses: 0, learning_steps: 0, state: 2 });
  value.taken = [...value.taken, ...['大臣', '挨拶', '日', '年', '官邸', '大賞', '表彰'].map(item)];
  value.lists = { ...value.lists, 式典: [{ t: 'word', id: '式', label: '式', ts: now - 3 * DAY }] };
  value.srs = { ...value.srs, 'word:大臣': card(64, 3), 'word:表彰': card(12, 1), 'word:挨拶': card(48, 2), 'word:日': card(80, 4), 'word:年': card(90, 5) };
  const rev = (t, g) => [t, 'word:大臣', g, 2, 3, 0.95, 40, 5, 42, 5, 30, t + 30 * DAY];
  value.revlog = [...value.revlog, rev(now - 3 * DAY, 1), rev(now - 2 * DAY, 3)];
  // Native history reaches real Today looked/due variants, including the due
  // star's authored breathing opacity; no DOM state or paint is manufactured.
  value.obslog = [...(value.obslog || []), ...['官邸', '大賞', '表彰'].flatMap((word) => [[now - 30 * 60000, 'tap', `word:${word}`, 2, STORY], [now - 15 * 60000, 'tap', `word:${word}`, 2, STORY], [now - 6 * DAY, 'dojo', `word:${word}`, 1], [now - 5 * DAY, 'dojo', `word:${word}`, 3]])];
  value.srs['word:挨拶'].due = new Date(now - 60000).toISOString();
  value.met = { version: 1, entries: Object.fromEntries([['met', 0, 0, 1], ['again', 9, 1, 3], ['recalled', 30, 4, 6], ['owned', 60, 2, 11], ['notYet', 20, 1, 4]].map(([k, first, last, days]) => [nodes[k].key, { first: today - first, last: today - last, days, ...(k === 'notYet' ? { said: { value: 'not-yet', at: now - DAY, cursor: value.revlog.length } } : {}) }])) };
  // The title's first word, met today and saved: on the phone its ring sits on
  // the first title line, over the second line's glyphs.
  const nativeTitle = await page.evaluate(() => { const node = { t: 'word', id: '日本' }; return { node, key: window.__KAIRO_DEPTH__.key(node), kind: window.__KAIRO_DEPTH__.identity(node)?.kind }; });
  assert.equal(nativeTitle.kind, 'core', 'Native title 日本 identity is core');
  value.met.entries[nativeTitle.key] = { first: today, last: today, days: 1 };
  value.taken.push(item('日本'));
  await commitRecord(page, value, 'seed');
  await story(page); await page.waitForFunction(() => document.querySelector('#reader .tok[data-depth]')); await delay(700); return nodes;
}
/** Geometry is read before hiding paint; pixels decide whether paint exists. */
async function facts(page, selector, pseudo = true) {
  return page.locator(selector).evaluateAll((elements, pseudo) => { const dots = elements.map((el) => {
    const owner = el.closest('#reader .tok') || (el.matches('.mini-word') ? el.closest('#mini') : el);
    const c = getComputedStyle(el, pseudo ? '::after' : null), r = el.getBoundingClientRect(), style = getComputedStyle(el);
    const fragments = [...el.getClientRects()];
    const first = fragments[0] || r, last = fragments[fragments.length - 1] || r;
    const inline = style.display === 'inline';
    const originLeft = inline ? first.left : r.left;
    const originTop = inline ? first.top : r.top;
    const originBottom = inline ? last.bottom : r.bottom;
    const containingWidth = inline ? Math.max(0, last.right - first.left) : r.width;
    const width = parseFloat(c.width) || 0, height = parseFloat(c.height) || 0;
    const px = (value, size) => String(value).trim().endsWith('%') ? parseFloat(value) * size / 100 : parseFloat(value) || 0;
    let left = r.left, top = r.top;
    if (pseudo && c.position === 'absolute') {
      left = c.left === 'auto' && c.right === 'auto' ? last.right : c.left === 'auto' ? (inline ? last.right : r.right) - px(c.right, containingWidth) - width - (parseFloat(c.marginRight) || 0) : originLeft + (parseFloat(style.borderLeftWidth) || 0) + px(c.left, containingWidth) + (parseFloat(c.marginLeft) || 0);
      top = c.top !== 'auto' ? originTop + px(c.top, originBottom - originTop) : originBottom - (parseFloat(style.borderBottomWidth) || 0) - (parseFloat(c.bottom) || 0) - height;
      if (c.transform !== 'none') { const m = new DOMMatrix(c.transform); left += m.m41; top += m.m42; }
    } else if (pseudo) { left = r.right - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(c.marginRight) || 0) - width; top = r.top + r.height / 2 - height / 2; }
    const spreads = [...c.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g)].map((m) => Number(m[4]));
    const spread = Math.max(0, ...spreads);
    return { probeId: el.dataset.dotsNode || null, index: owner.dataset.index ?? null, text: el.textContent, depth: owner.dataset.depth || null, kept: owner.dataset.kept != null,
      content: c.content, display: c.display, visibility: c.visibility, opacity: c.opacity, background: c.backgroundColor, shadow: c.boxShadow,
      width, height, spread, outer: Math.min(width, height) + 2 * spread,
      left: left + scrollX, top: top + scrollY, right: left + width + scrollX, bottom: top + height + scrollY,
      fragments: fragments.map((box) => ({ left: box.left + scrollX, top: box.top + scrollY, right: box.right + scrollX, bottom: box.bottom + scrollY })),
      cssGeometry: { left: c.left, right: c.right, fontSize: c.fontSize, top: c.top, bottom: c.bottom, transform: c.transform, position: c.position }, html: el.outerHTML.slice(0, 700),
      className: owner.className, parentOpacity: getComputedStyle(owner).opacity,
      host: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }, readerPaper: getComputedStyle(document.querySelector('#reader') || document.body).getPropertyValue('--reader-paper') };
  });
    const glyphs = [];
    const roots = [...new Set(elements.map((el) => el.matches('.japanese-lookup-word') && el.closest('#sheet, .reader-card')).filter(Boolean))];
    if (roots.length) {
      // Each containing prose block includes ordinary Japanese, English,
      // punctuation and ruby. Lookup spans are owners, never the glyph census.
      const blocks = new Set(roots.flatMap((root) => root.matches('.reader-card') ? [root] : [...root.querySelectorAll('.japanese-lookup-word')].map((el) => {
        let block = el.parentElement;
        while (block && block !== root && getComputedStyle(block).display === 'inline') block = block.parentElement;
        return block;
      })).filter(Boolean));
      const seen = new Set();
      for (const block of blocks) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let text;
        while ((text = walker.nextNode())) {
          if (seen.has(text)) continue; seen.add(text);
          const parent = text.parentElement, owner = parent.closest('.japanese-lookup-word');
          const lane = block.matches('.reader-card') ? [...block.children].find((child) => child.contains(parent)) || block : block;
          const folded = parent.closest('details:not([open])');
          if (parent.closest('[hidden]') || (folded && !folded.querySelector(':scope > summary')?.contains(parent))) continue;
          const style = getComputedStyle(parent);
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
          for (let i = 0; i < text.length; i++) { if (!text.textContent[i].trim()) continue; const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1); for (const r of range.getClientRects()) if (r.width && r.height) glyphs.push({ owner: owner?.dataset.dotsNode || null, text: text.textContent[i], rt: !!parent.closest('rt'), block: lane.className || lane.tagName, left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY }); }
        }
      }
    }
    return { dots, frame: { at: performance.now(), scrollX, scrollY, glyphs } };
  }, pseudo).then(({ dots, frame }) => { dots.captureFrame = frame; return dots; });
}
async function capture(page, out, name, selector, pseudo = true, confirm = true) {
  await delay(180);
  const captureId = randomUUID();
  await page.locator(selector).evaluateAll((els, id) => { els.forEach((el, i) => { el.dataset.dotsCapture = id; el.dataset.dotsNode ||= `${id}-${i}`; }); }, captureId);
  const factSelector = `[data-dots-capture="${captureId}"]`;
  const f = await facts(page, factSelector, pseudo);
  assert(f.length, `No real ${name} dot targets`);
  out.captureFrames ||= {}; out.captureFrames[name] = f.captureFrame;
  for (const d of f) d.captureFrame = name;
  const beforeGeometry = JSON.stringify(f.map((x) => [x.host, x.left, x.top]));
  const fullPage = name === 'reader';
  const offset = fullPage ? { x: 0, y: 0 } : await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const shownBytes = await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-${name}.png`), fullPage, animations: 'allow' });
  const css = await page.addStyleTag({ content: hideCss });
  const hiddenBytes = await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-${name}-paper.png`), fullPage, animations: 'allow' });
  const hiddenFacts = await facts(page, factSelector, pseudo);
  await css.evaluate((s) => s.remove());
  assert.equal(beforeGeometry, JSON.stringify(hiddenFacts.map((x) => [x.host, x.left, x.top])), 'Hiding only paint changed geometry');
  const shown = png(shownBytes), hidden = png(hiddenBytes), dpr = await page.evaluate(() => devicePixelRatio);
  assert(shown.width === hidden.width && shown.height === hidden.height, 'Screenshot dimensions changed');
  for (const dot of f) {
    const cx = (dot.left + dot.right) / 2 - offset.x, cy = (dot.top + dot.bottom) / 2 - offset.y, radius = Math.min(dot.width, dot.height) / 2;
    const fill = [], papers = [], ring = [], ringPapers = [], changed = [], fillChanged = [];
    const loX = Math.max(0, Math.floor((dot.left - offset.x - dot.spread - 1) * dpr)), hiX = Math.min(shown.width, Math.ceil((dot.right - offset.x + dot.spread + 1) * dpr));
    const loY = Math.max(0, Math.floor((dot.top - offset.y - dot.spread - 1) * dpr)), hiY = Math.min(shown.height, Math.ceil((dot.bottom - offset.y + dot.spread + 1) * dpr));
    for (let y = loY; y < hiY; y++) for (let x = loX; x < hiX; x++) {
      const a = pix(shown, x, y), b = pix(hidden, x, y), distance = Math.hypot((x + 0.5) / dpr - cx, (y + 0.5) / dpr - cy);
      if (Math.max(...a.map((v, i) => Math.abs(v - b[i]))) > 3) { changed.push([x, y]); if (distance <= radius - 0.25) fillChanged.push([x, y]); }
      if (distance <= Math.max(0.6, radius - 1)) { fill.push(a); papers.push(b); }
      if (dot.kept && distance >= radius + Math.max(0, dot.spread - 1) && distance <= radius + dot.spread - 0.25) { ring.push(a); ringPapers.push(b); }
    }
    dot.raster = { screenshot: `${out.engine}-${out.world}-${name}.png`, fullPage, offset, fillChangedPixels: fillChanged.length,
      fillPaintedWidth: fillChanged.length ? (Math.max(...fillChanged.map((p) => p[0])) - Math.min(...fillChanged.map((p) => p[0])) + 1) / dpr : 0,
      fillPaintedHeight: fillChanged.length ? (Math.max(...fillChanged.map((p) => p[1])) - Math.min(...fillChanged.map((p) => p[1])) + 1) / dpr : 0,
      fillPaintedAreaCssPx2: fillChanged.length / (dpr * dpr), changedPixels: changed.length, fill: median(fill), paper: median(papers), ring: median(ring), ringPaper: median(ringPapers),
      paintedWidth: changed.length ? (Math.max(...changed.map((p) => p[0])) - Math.min(...changed.map((p) => p[0])) + 1) / dpr : 0,
      paintedHeight: changed.length ? (Math.max(...changed.map((p) => p[1])) - Math.min(...changed.map((p) => p[1])) + 1) / dpr : 0 };
    dot.raster.fillContrast = dot.raster.fill && dot.raster.paper ? contrast(dot.raster.fill, dot.raster.paper) : null;
    dot.raster.ringContrast = dot.raster.ring && dot.raster.ringPaper ? contrast(dot.raster.ring, dot.raster.ringPaper) : null;
  }
  if (confirm) {
    // Full-page captures can contain the fixed footer over an offscreen word.
    // Recheck zero-paint targets with that occurrence centered in the viewport;
    // preserve the first observation and its image, never call occlusion a kill.
    for (let i = 0; i < f.length; i++) if (f[i].raster.changedPixels < 4 || (f[i].depth && f[i].depth !== 'unmet' && f[i].raster.fillPaintedAreaCssPx2 < 18)) {
      const marker = `${name}-${i}`;
      await page.locator(selector).nth(i).evaluate((el, marker) => { el.dataset.dotsMeasure = marker; el.scrollIntoView({ block: 'center', inline: 'nearest' }); }, marker);
      const target = `[data-dots-measure="${marker}"]`;
      await delay(220);
      const [confirmed] = await capture(page, out, `${name}-centered-${i}`, target, pseudo, false);
      confirmed.initialFullPageObservation = f[i];
      confirmed.measurementCapture = `${name}-centered-${i}`;
      f[i] = confirmed;
    }
  }
  out.measurements[name] = f;
  save();
  return f;
}
function checkPaint(out, name, dots) {
  const active = dots.filter((d) => d.depth || d.kept);
  row(out, `${name}.nonempty`, active.length > 0 && active.every((d) => d.raster.changedPixels >= 4 && d.display !== 'none' && d.visibility !== 'hidden'), active.map((d) => ({ index: d.index, depth: d.depth, changed: d.raster.changedPixels })));
  row(out, `${name}.size`, active.every((d) => (d.depth === 'unmet' || !d.depth || (Math.min(d.width, d.height) >= 6 && d.raster.fillPaintedWidth >= 5 && d.raster.fillPaintedHeight >= 5 && d.raster.fillPaintedAreaCssPx2 >= 18)) && (!d.kept || (d.outer >= 10 && Math.min(d.raster.paintedWidth, d.raster.paintedHeight) >= 9))), active.map((d) => ({ index: d.index, width: d.width, outer: d.outer, raster: [d.raster.paintedWidth, d.raster.paintedHeight] })));
  row(out, `${name}.contrast`, active.every((d) => (!['owned', 'recalled'].includes(d.depth) || d.raster.fillContrast >= 3) && (!['met', 'again'].includes(d.depth) || d.raster.fillContrast >= 1.5) && (!d.kept || d.raster.ringContrast >= 3)), active.map((d) => ({ index: d.index, depth: d.depth, fill: d.raster.fillContrast, ring: d.raster.ringContrast })));
}
/** Enumerate the native surface before looking at painter output. A deleted
 * data-depth/data-kept attribute cannot delete its obligation from this census. */
async function surfaceCapture(page, out, name, selector, pseudo = true) {
  const censusId = randomUUID();
  const census = await page.locator(selector).evaluateAll((els, censusId) => els.map((el, i) => {
    const owner = el.matches('.mini-word') ? el.closest('#mini') : el;
    el.dataset.dotsNode ||= `${censusId}-${i}`;
    let node = null, exclusion = null;
    if (owner.dataset.depthNode) {
      try { node = { t: 'word', ...JSON.parse(owner.dataset.depthNode) }; } catch { exclusion = 'invalid native identity'; }
    } else if (el.matches('.japanese-lookup-word')) {
      if (el.closest('.headword')) exclusion = 'headword: basis line owns the dot';
      else {
        const candidate = { t: 'word', id: el.dataset.lookupText };
        const identity = window.__KAIRO_DEPTH__.identity(candidate);
        if (/[\p{Script=Han}\p{Script=Katakana}]/u.test(candidate.id) || identity?.kind === 'core') node = candidate;
        else exclusion = 'outside Japanese word painter eligibility';
      }
    }
    if (!node && !exclusion && el.matches('.today-star.glyph') && [...el.textContent.trim()].length === 1) exclusion = 'native Today kanji glyph: not a word';
    if (!node && !exclusion) exclusion = 'invalid native identity';
    const expected = node ? window.__KAIRO_DEPTH__.depth(node) : null;
    const folded = el.closest('details:not([open])');
    const notRendered = el.closest('[hidden]') ? 'native hidden ancestor' : folded && !folded.querySelector(':scope > summary')?.contains(el) ? 'closed native details body' : null;
    const active = Boolean(!notRendered && expected && (expected.depth !== 'unmet' || expected.kept));
    if (active) el.dataset.dotsExpected = censusId;
    return { probeId: el.dataset.dotsNode, text: el.textContent, className: el.className, node, exclusion, notRendered, expectedDepth: expected?.depth || null, expectedKept: expected?.kept || false, active, actualDepth: owner.dataset.depth || null, actualKept: owner.dataset.kept != null };
  }), censusId);
  out.nativeCensus ||= {}; out.nativeCensus[name] = census;
  const active = census.filter((r) => r.active);
  row(out, `${name}.native-painter-census`, active.length > 0 && census.every((r) => r.exclusion !== 'invalid native identity') && active.every((r) => r.expectedDepth === r.actualDepth && r.expectedKept === r.actualKept), census);
  // Empty eligible scope is a recorded failure, not a silent or setup pass.
  const dots = active.length ? await capture(page, out, name, `[data-dots-expected="${censusId}"]`, pseudo) : [];
  row(out, `${name}.all-expected-painted`, active.length > 0 && active.every((r) => dots.some((d) => d.probeId === r.probeId && d.raster.changedPixels >= 4)), { expected: active.map((r) => r.probeId), observed: dots.map((d) => ({ probeId: d.probeId, changedPixels: d.raster.changedPixels })) });
  return dots;
}
function semanticFamily(out, family, samples) {
  const met = samples.filter((d) => d.depth === 'met' && d.raster.fill);
  const known = samples.filter((d) => ['owned', 'recalled'].includes(d.depth) && d.raster.fill);
  const saved = samples.filter((d) => d.kept && d.raster.ring);
  const pairs = { metKnown: met.flatMap((a) => known.map((b) => delta(a.raster.fill, b.raster.fill))), metSaved: met.flatMap((a) => saved.map((b) => delta(a.raster.fill, b.raster.ring))), knownSaved: known.flatMap((a) => saved.map((b) => delta(a.raster.fill, b.raster.ring))) };
  const coverage = { met: met.length, known: known.length, saved: saved.length, knownStates: [...new Set(known.map((d) => d.depth))], unavailable: ['met', 'known', 'saved'].filter((k) => !({ met, known, saved })[k].length) };
  out.semanticCoverage ||= {}; out.semanticCoverage[family] = coverage;
  row(out, `${family}.semantic-separation`, !coverage.unavailable.length && Object.values(pairs).every((values) => values.length && values.every((v) => v >= 10)) && met.every((a) => known.every((b) => a.raster.fillContrast < b.raster.fillContrast)), { coverage, minimumDeltaE76: Object.fromEntries(Object.entries(pairs).map(([key, values]) => [key, values.length ? Math.min(...values) : null])), metContrast: met.map((d) => d.raster.fillContrast), knownContrast: known.map((d) => d.raster.fillContrast) });
}
async function worldBinding(page, out, phase) {
  const actual = await page.evaluate(() => ({ stored: localStorage.getItem('kairo-theme'), rendered: document.documentElement.dataset.theme ?? null, inlineScheme: document.documentElement.style.colorScheme, computedScheme: getComputedStyle(document.documentElement).colorScheme, metaScheme: document.querySelector('meta[name="color-scheme"]')?.content || null }));
  const expectedTheme = out.world === 'hokusai' ? '' : out.world;
  const expectedScheme = ['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'].includes(out.world) ? 'dark' : 'light';
  row(out, `world.${phase}`, actual.stored === out.world && actual.rendered === expectedTheme && actual.inlineScheme === expectedScheme && actual.computedScheme === expectedScheme && actual.metaScheme === expectedScheme, { requested: out.world, expectedTheme, expectedScheme, ...actual });
}
async function ladderContract(page, out) {
  const target = page.locator(`#reader .tok[data-index="${PARA.owned}"]`);
  await target.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => Math.round(scrollY));
  await waitForAppRecord(page, (value) => value.readerPos?.[STORY] === position, { description: 'the real prior scroll is durably saved before the attribute-only contract' });
  await delay(100);
  const beforeRecord = JSON.stringify((await readAppRecordSnapshot(page)).record);
  const before = await facts(page, '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
  const beforeImage = png(await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-hook-before.png`) }));
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY, dpr: devicePixelRatio }));
  await target.evaluate((e) => { e.dataset.depthAside = 'meaning'; }); await delay(100);
  const during = await facts(page, '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
  const duringImage = png(await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-hook-meaning.png`) }));
  await target.evaluate((e) => { delete e.dataset.depthAside; }); await delay(100);
  const after = await facts(page, '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
  const afterImage = png(await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-hook-restored.png`) }));
  const afterRecord = JSON.stringify((await readAppRecordSnapshot(page)).record);
  const isHidden = (d) => d.visibility === 'hidden' || d.display === 'none' || Number(d.opacity) === 0 || ['none', 'normal'].includes(d.content);
  const at = before.findIndex((d) => d.index === String(PARA.owned));
  let withinChanged = 0, outsideChanged = 0, unrestored = 0;
  assert(beforeImage.width === duringImage.width && beforeImage.height === duringImage.height && beforeImage.width === afterImage.width && beforeImage.height === afterImage.height, 'Ladder screenshots retain dimensions');
  const box = before[at]; assert(box, 'Owned target occurrence exists');
  for (let y = 0; y < beforeImage.height; y++) for (let x = 0; x < beforeImage.width; x++) {
    const i = (y * beforeImage.width + x) * 3;
    const changed = [0, 1, 2].some((k) => Math.abs(beforeImage.pixels[i + k] - duringImage.pixels[i + k]) > 3);
    const inside = x / scroll.dpr >= box.left - scroll.x - box.spread - 1 && x / scroll.dpr <= box.right - scroll.x + box.spread + 1 && y / scroll.dpr >= box.top - scroll.y - box.spread - 1 && y / scroll.dpr <= box.bottom - scroll.y + box.spread + 1;
    if (changed) { if (inside) withinChanged++; else outsideChanged++; }
    if ([0, 1, 2].some((k) => Math.abs(beforeImage.pixels[i + k] - afterImage.pixels[i + k]) > 3)) unrestored++;
  }
  row(out, 'ladder.actual-painted-scope', withinChanged >= 4 && outsideChanged === 0 && unrestored === 0, { withinChanged, outsideChanged, unrestored, scroll, box });
  row(out, 'ladder.target-only', at >= 0 && !isHidden(before[at]) && isHidden(during[at]) && !isHidden(after[at]) && during.every((d, i) => i === at || JSON.stringify(d) === JSON.stringify(before[i])), { before: before[at], during: during[at], after: after[at] });
  row(out, 'ladder.no-geometry-or-record-change', beforeRecord === afterRecord && JSON.stringify(before.map((d) => d.host)) === JSON.stringify(during.map((d) => d.host)) && JSON.stringify(before) === JSON.stringify(after), { recordBefore: hash(beforeRecord), recordAfter: hash(afterRecord), changedKeys: [...new Set([...Object.keys(JSON.parse(beforeRecord)), ...Object.keys(JSON.parse(afterRecord))])].filter((key) => JSON.stringify(JSON.parse(beforeRecord)[key]) !== JSON.stringify(JSON.parse(afterRecord)[key])).map((key) => ({ key, before: JSON.parse(beforeRecord)[key], after: JSON.parse(afterRecord)[key] })) });
}
function lineGeometry(out, name, dots) {
  row(out, `${name}.fragment-alignment`, dots.every((d) => d.fragments.some((f) => (d.left + d.right) / 2 >= f.left - 0.5 && (d.left + d.right) / 2 <= f.right + 0.5 && (d.top + d.bottom) / 2 >= f.bottom - 2 && (d.top + d.bottom) / 2 <= f.bottom + 12)), dots.map((d) => ({ text: d.text, dot: [d.left, d.top, d.right, d.bottom], fragments: d.fragments, cssGeometry: d.cssGeometry })));
  const clashes = dots.flatMap((d) => out.captureFrames[d.captureFrame].glyphs.filter((g) => g.owner !== d.probeId && d.left - d.spread < g.right && d.right + d.spread > g.left && d.top - d.spread < g.bottom && d.bottom + d.spread > g.top).map((g) => ({ captureFrame: d.captureFrame, dot: d.text, dotBox: [d.left - d.spread, d.top - d.spread, d.right + d.spread, d.bottom + d.spread], host: d.host, fragments: d.fragments, cssGeometry: d.cssGeometry, glyph: g })));
  row(out, `${name}.no-other-glyph-overlap`, clashes.length === 0, clashes);
}
/** The reader's title words sit on the raised title card, not the reader's
 * paper. The native fixture's saved and reviewed words hold state there too.
 * Every visible glyph on the card, the English caption included, is text a
 * title dot must not overlap. */
async function titleCard(page, out) {
  const heading = page.locator('.reader-card h1.view-title');
  if (await heading.count()) { await heading.first().evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await delay(250); }
  const title = await surfaceCapture(page, out, 'title', '.reader-card .japanese-lookup-word[data-lookup-text]');
  checkPaint(out, 'title', title);
  lineGeometry(out, 'title', title);
  const census = out.captureFrames?.title?.glyphs || [];
  const captionCharacters = (await page.locator('.reader-card > .view-title-en').allTextContents()).join('').replace(/\s/gu, '').length;
  const captionGlyphs = census.filter((g) => String(g.block).split(/\s+/).includes('view-title-en')).length;
  out.titleCoverage = { words: title.map((d) => ({ text: d.text, depth: d.depth, kept: d.kept, fragments: d.fragments.length, wrapped: d.fragments.length > 1 })),
    glyphCensus: census.reduce((lanes, g) => ({ ...lanes, [g.block]: (lanes[g.block] || 0) + 1 }), {}), captionCharacters, captionGlyphs };
  row(out, 'title.card-glyph-census', census.length > 0 && captionGlyphs === captionCharacters, out.titleCoverage);
  row(out, 'title.fixture-states', title.some((d) => ['met', 'again', 'recalled', 'owned'].includes(d.depth)) && title.some((d) => d.kept), out.titleCoverage);
  const nihon = (out.nativeCensus?.title || []).find((r) => r.text === '日本');
  const nihonKind = await page.evaluate(() => window.__KAIRO_DEPTH__.identity({ t: 'word', id: '日本' })?.kind ?? null);
  row(out, 'title.native-nihon', nihonKind === 'core' && nihon?.active === true && nihon.expectedDepth === 'met' && nihon.expectedKept && nihon.actualDepth === 'met' && nihon.actualKept, { kind: nihonKind, census: nihon || null });
  if (out.engine === 'webkit') {
    const first = title.find((d) => d.text === '日本'), second = title.find((d) => d.text === '大賞');
    const a = first?.fragments.at(-1), b = second?.fragments[0];
    const distinct = Boolean(a && b) && b.top - a.top > (a.bottom - a.top) / 2 && a.top <= Math.min(...title.flatMap((d) => d.fragments.map((f) => f.top))) + 0.5;
    const underRing = distinct ? out.captureFrames[first.captureFrame].glyphs.filter((g) => g.owner !== first.probeId && Math.abs(g.top - b.top) <= 1 && g.left < first.right + first.spread && g.right > first.left - first.spread) : [];
    row(out, 'title.first-line-ring', distinct && first.kept && underRing.length > 0, { first: first && { fragments: first.fragments, dot: [first.left, first.top, first.right, first.bottom], spread: first.spread, kept: first.kept }, second: second && { fragments: second.fragments }, underRing });
  }
  const fresh = out.freshTitle, stateful = await titleLayout(page);
  row(out, 'title.same-rhythm-fresh-and-stateful', fresh?.titleWords > 0 && stateless(fresh) && stateful?.words.some((w) => w.title && w.painted) && sameRhythm(fresh, stateful),
    { law: 'lead 1940: a title holding lookup words reserves its line space before any state', fresh, stateful });
}
/** A real context line (aozora:000772-1) under the title: its word holds
 * native met+saved history while no title word does. Its dot is measured like
 * every other card dot, and the title keeps its fresh layout. */
async function contextCard(page, out) {
  await story(page, CONTEXT_STORY, '私の個人主義');
  const fresh = await titleLayout(page);
  const word = await page.evaluate(() => { const node = { t: 'word', id: '講演' }; return { present: Boolean(document.querySelector('.reader-card .reader-context .japanese-lookup-word[data-lookup-text="講演"]')), key: window.__KAIRO_DEPTH__.key(node), kind: window.__KAIRO_DEPTH__.identity(node)?.kind ?? null }; });
  assert(word.present && word.kind === 'core', `Native context word 講演: ${JSON.stringify(word)}`);
  const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day()), now = Date.now();
  const value = (await readAppRecordSnapshot(page)).record;
  value.met = { version: 1, entries: { ...(value.met?.entries || {}), [word.key]: { first: today, last: today, days: 1 } } };
  value.taken = [...(value.taken || []), savedWord('講演', now)];
  await commitRecord(page, value, 'context');
  await story(page, CONTEXT_STORY, '私の個人主義');
  await page.waitForFunction(() => document.querySelector('.reader-card .reader-context .japanese-lookup-word[data-lookup-text="講演"][data-depth]'));
  const contextOnly = await titleLayout(page);
  row(out, 'context.title-unchanged', fresh?.titleWords > 0 && stateless(fresh) && stateless(contextOnly, (w) => w.title) && contextOnly?.words.some((w) => !w.title && w.text === '講演' && w.painted) && sameRhythm(fresh, contextOnly), { fresh, contextOnly });
  await page.locator('.reader-card').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await delay(250);
  const card = await surfaceCapture(page, out, 'context', '.reader-card .japanese-lookup-word[data-lookup-text]');
  checkPaint(out, 'context', card);
  lineGeometry(out, 'context', card);
  const kouen = (out.nativeCensus?.context || []).find((r) => r.text === '講演');
  row(out, 'context.native-kouen', kouen?.active === true && kouen.expectedDepth === 'met' && kouen.expectedKept && kouen.actualDepth === 'met' && kouen.actualKept && card.some((d) => d.probeId === kouen.probeId && d.raster.changedPixels >= 4), { kind: word.kind, census: kouen || null });
}
/** Lead 1940: on a fresh native profile, the first input on a title word
 * shows its reading without an encounter, the second opens its stage and
 * records the first state. Through both, the word stays put, the open slip
 * stays seated beside the word and its reading, and the title keeps its height. */
async function liveFirstState(page, out, { name, id, query, word }) {
  await story(page, id, query);
  await page.locator('.reader-card').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await delay(250);
  const selector = `.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${word}"]`, target = page.locator(selector).first();
  const native = await page.evaluate((word) => { const node = { t: 'word', id: word }; return { key: window.__KAIRO_DEPTH__.key(node), kind: window.__KAIRO_DEPTH__.identity(node)?.kind ?? null }; }, word);
  const lines = await page.evaluate(() => [...document.querySelectorAll('.reader-card > h1.view-title .japanese-lookup-word')].map((w) => { const r = w.getClientRects()[0]; return { text: w.dataset.lookupText, top: r?.top ?? null, bottom: r?.bottom ?? null }; }));
  const sample = (label) => page.evaluate(async ({ selector, label }) => {
    await document.fonts.ready;
    const el = document.querySelector(selector);
    const plain = (b) => ({ x: b.x, y: b.y, width: b.width, height: b.height });
    const h1 = el.closest('h1.view-title'), heading = getComputedStyle(h1), r = el.getBoundingClientRect(), glyphs = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let text;
    while ((text = walker.nextNode())) for (let i = 0; i < text.length; i++) { if (!text.textContent[i].trim()) continue; const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1); for (const b of range.getClientRects()) if (b.width && b.height) glyphs.push(b); }
    const union = glyphs.length ? { left: Math.min(...glyphs.map((b) => b.left)), top: Math.min(...glyphs.map((b) => b.top)), right: Math.max(...glyphs.map((b) => b.right)), bottom: Math.max(...glyphs.map((b) => b.bottom)) } : null;
    const mini = document.getElementById('mini'), m = mini?.getBoundingClientRect(), ms = mini && getComputedStyle(mini);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label, scrollX, scrollY, source: plain(r), union, rung: el.dataset.ladderRung || null, depth: el.dataset.depth || null, kept: el.dataset.kept != null,
      reading: [...el.querySelectorAll('rt')].filter((rt) => { const s = getComputedStyle(rt); return !rt.classList.contains('hidden-rt') && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; }).map((rt) => rt.textContent).join(''),
      title: { height: h1.getBoundingClientRect().height, lineHeight: heading.lineHeight, paddingBottom: heading.paddingBottom, fontSize: heading.fontSize },
      mini: m && m.width > 0 && m.height > 0 && ms.display !== 'none' && ms.visibility !== 'hidden' ? plain(m) : null, hitOwned: Boolean(hit && (hit === el || el.contains(hit))) };
  }, { selector, label });
  const input = () => (out.engine === 'webkit' ? target.tap() : target.click());
  const shift = (a, b) => (a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : Infinity);
  const unionShift = (a, b) => (a && b ? Math.max(...['left', 'top', 'right', 'bottom'].map((k) => Math.abs(a[k] - b[k]))) : Infinity);
  const gap = (s) => (s.mini && s.union ? Math.max(s.union.top - (s.mini.y + s.mini.height), s.mini.y - s.union.bottom) : null);
  const fresh = await titleLayout(page);
  const before = await sample('before');
  const first = lines.find((l) => l.text === '日本'), daisho = lines.find((l) => l.text === '大賞');
  const twoLine = Boolean(first && daisho && first.top != null && daisho.top != null && daisho.top - first.top > (first.bottom - first.top) / 2);
  row(out, `${name}.fresh`, native.kind === 'core' && fresh?.titleWords > 0 && stateless(fresh) && !before.rung && !before.mini && (out.engine !== 'webkit' || id !== STORY || twoLine), { native, lines, twoLine, fresh, before });
  await input();
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.ladderRung != null, selector); await delay(350);
  const reading = await sample('reading');
  const firstEncounter = (await readAppRecordSnapshot(page)).record.met?.entries?.[native.key] ?? null;
  row(out, `${name}.reading-without-encounter`, reading.rung === 'reading' && reading.reading.length > 0 && !firstEncounter && !reading.mini, { reading, firstEncounter });
  row(out, `${name}.source-input-1`, shift(before.source, reading.source) <= 1, { shift: shift(before.source, reading.source), before: before.source, reading: reading.source, scrollY: [before.scrollY, reading.scrollY], hitOwned: [before.hitOwned, reading.hitOwned] });
  await input();
  await page.locator('#mini').waitFor({ state: 'visible' });
  const opened = await sample('stage-open');
  const miniHandle = await page.$('#mini');
  const committed = await waitForAppRecord(page, (value) => Boolean(value.met?.entries?.[native.key]), { description: `native first encounter for ${word}` });
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.depth === 'met', selector); await delay(350);
  const met = await sample('stage-met');
  const sameMini = Boolean(miniHandle) && await miniHandle.evaluate((el) => el.isConnected && el === document.getElementById('mini'));
  const expected = await page.evaluate((word) => window.__KAIRO_DEPTH__.depth({ t: 'word', id: word }), word);
  row(out, `${name}.stage-commits-met`, opened.rung === 'stage' && met.rung === 'stage' && committed.met.entries[native.key]?.days >= 1 && expected?.depth === 'met' && met.depth === 'met', { encounter: committed.met.entries[native.key], expected, opened: { rung: opened.rung, depth: opened.depth }, met: { rung: met.rung, depth: met.depth } });
  row(out, `${name}.source-input-2`, shift(reading.source, met.source) <= 1 && unionShift(reading.union, met.union) <= 1, { shift: shift(reading.source, met.source), unionShift: unionShift(reading.union, met.union), reading: { source: reading.source, union: reading.union }, met: { source: met.source, union: met.union }, scrollY: [reading.scrollY, met.scrollY], hitOwned: [reading.hitOwned, met.hitOwned] });
  row(out, `${name}.title-height-first-state`, JSON.stringify(reading.title) === JSON.stringify(met.title) && JSON.stringify(opened.title) === JSON.stringify(met.title), { reading: reading.title, opened: opened.title, met: met.title, openedBeforeState: !opened.depth });
  row(out, `${name}.slip-seated`, sameMini && shift(opened.mini, met.mini) <= 1 && Number.isFinite(gap(opened)) && Number.isFinite(gap(met)) && gap(opened) >= 0 && gap(met) >= 0 && Math.abs(gap(met) - gap(opened)) <= 1, { sameMini, opened: { mini: opened.mini, union: opened.union, gap: gap(opened) }, met: { mini: met.mini, union: met.union, gap: gap(met) }, openedBeforeState: !opened.depth });
}
async function rooms(page, out) {
  out.roomStateCoverage = {};
  const familySamples = { slip: [], basis: [], prose: [] };
  // Traverse actual doors for all four fills. These are independently seeded
  // native identities; opening a slip can add today's encounter naturally.
  for (const name of ['owned', 'met', 'again', 'recalled']) {
    const word = page.locator(`#reader .tok[data-index="${PARA[name]}"]`);
    await word.scrollIntoViewIfNeeded(); await word.click();
    await page.waitForFunction((e) => document.getElementById('mini') || e?.dataset.ladderRung === 'reading', await word.elementHandle());
    if (!await page.locator('#mini').count()) await word.click();
    await page.locator('#mini .mini-word').waitFor(); await delay(200);
    const slip = await surfaceCapture(page, out, `slip-${name}`, '#mini .mini-word');
    checkPaint(out, `slip-${name}`, slip);
    await page.locator('#mini .mini-word').click(); await page.locator('#depth-basis .depth-dot').waitFor(); await delay(300);
    const basis = await surfaceCapture(page, out, `basis-${name}`, '#sheet .depth-dot', false);
    checkPaint(out, `basis-${name}`, basis);
    familySamples.slip.push(...slip); familySamples.basis.push(...basis);
    out.roomStateCoverage[name] = { slip: slip.map((d) => d.depth), basis: basis.map((d) => d.depth) };
    const proseSelector = '#sheet .japanese-lookup-word[data-lookup-text]:not(.headword .japanese-lookup-word)';
    if (await page.locator(proseSelector).count()) {
      const prose = await surfaceCapture(page, out, `prose-${name}`, proseSelector);
      checkPaint(out, `prose-${name}`, prose); familySamples.prose.push(...prose);
      lineGeometry(out, `prose-${name}`, prose);
      out.proseCoverage = [...(out.proseCoverage || []), ...prose.map((d) => ({ text: d.text, depth: d.depth, kept: d.kept }))];
    }
    await page.locator('#sheet-back').click(); await page.waitForFunction(() => !document.getElementById('sheet')); await delay(250);
    if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(150); }
  }
  row(out, 'room.native-fill-coverage', ['owned', 'met', 'again', 'recalled'].every((name) => out.roomStateCoverage[name].slip.includes(name) && out.roomStateCoverage[name].basis.includes(name)), out.roomStateCoverage);
  row(out, 'room.generic-prose-covered', (out.proseCoverage || []).length > 0, out.proseCoverage || []);
  for (const [family, samples] of Object.entries(familySamples)) semanticFamily(out, family, samples);
  await page.locator('#tray').click(); await page.locator('.tray-line').first().waitFor(); await delay(300);
  const tray = await surfaceCapture(page, out, 'tray', '.tray-line .depth-dot', false);
  checkPaint(out, 'tray', tray); semanticFamily(out, 'tray', tray);
  await page.locator('#tab-today').click(); await page.locator('.today-star').first().waitFor(); await delay(350);
  const today = await surfaceCapture(page, out, 'today', '.today-star:not([hidden])');
  checkPaint(out, 'today', today); semanticFamily(out, 'today', today);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  out.todayAnimation = await page.evaluate(() => {
    const found = [];
    for (const animation of document.getAnimations()) {
      const timing = animation.effect.getTiming(); animation.pause();
      if (animation.animationName === 'today-breath') {
        animation.currentTime = Number(timing.delay || 0) + Number(timing.duration);
        found.push({ name: animation.animationName, currentTime: animation.currentTime, timing, frames: animation.effect.getKeyframes() });
      }
    }
    return found;
  });
  row(out, 'today.native-breath-reached', out.todayAnimation.length > 0, out.todayAnimation);
  checkPaint(out, 'today-minimum-breath', await surfaceCapture(page, out, 'today-minimum-breath', '.today-star.due:not([hidden])'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#tab-me, #tab-progress').first().click(); await page.locator('#me-progress').waitFor(); await page.locator('#me-progress').click();
  await page.waitForFunction(() => document.body.dataset.view === 'kagami'); await delay(300);
  const mirror = await surfaceCapture(page, out, 'mirror', '.kagami-row .depth-dot', false);
  checkPaint(out, 'mirror', mirror); semanticFamily(out, 'mirror', mirror);
}

/** A fresh native profile for this engine and world, served the same CSS as every other page of the run. */
async function openContext(browser, engine, world) {
  const context = await browser.newContext({ viewport: engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: engine === 'webkit', hasTouch: engine === 'webkit', reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block' });
  await context.addInitScript((world) => { localStorage.setItem('kairo-theme', world); localStorage.setItem('kairo-word-ladder-demo-v1', '1'); }, world);
  if (controlBytes || diagnosticInlineEnd || process.env.DOTS_BASE_URL) await context.route(new URL('editorial.css', base).href + '*', async (route) => { try { const response = await route.fetch(); const original = await response.body(); const expected = report.identity.files?.find((f) => f.path === 'editorial.css')?.sha256; assert(expected && hash(original) === expected, 'Control fetched CSS does not match artifact'); const servedBytes = controlBytes || (process.env.DOTS_BASE_URL ? original : Buffer.concat([original, Buffer.from('\n.japanese-lookup-word:is([data-depth],[data-kept])::after { left:auto; right:auto; transform:translateX(calc(-0.5em - var(--depth-size)/2)); }\n')])); if (!process.env.DOTS_BASE_URL) assert(hash(original) !== hash(servedBytes), 'Control must change CSS'); (process.env.DOTS_BASE_URL ? (report.remoteCssServed ||= []) : report.control.served).push({ url: route.request().url(), candidateSha256: hash(original), servedSha256: hash(servedBytes) }); await route.fulfill({ response, body: servedBytes, headers: { ...response.headers(), 'content-length': String(servedBytes.length), 'content-type': 'text/css' } }); } catch (e) { report.control.setupError = String(e.stack); await route.abort(); } });
  return context;
}
async function freshWalk(browser, out, walk) {
  const context = await openContext(browser, out.engine, out.world);
  try { const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (e) => out.errors.push(String(e))); await walk(page); }
  finally { await context.close(); }
}
async function one(browser, engine, world) {
  const out = { engine, version: browser.version(), world, viewport: engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 2, touch: engine === 'webkit', startedAt: new Date().toISOString(), rows: [], measurements: {}, errors: [] };
  report.contexts.push(out); save();
  const context = await openContext(browser, engine, world);
  try {
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (e) => out.errors.push(String(e)));
    await seed(page, out);
    await worldBinding(page, out, 'reader');
    await page.evaluate(() => { const el = document.querySelector('#reader .tok[data-index]'); window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - 160)); });
    await delay(400);
    await page.screenshot({ path: resolve(evidence, `${engine}-${world}-reader-viewport.png`), fullPage: false });
    const dots = await capture(page, out, 'reader', '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
    checkPaint(out, 'reader', dots);
    const stateAudit = await page.evaluate(() => [...document.querySelectorAll('#reader .tok[data-index]')].flatMap((el) => {
      const node = window.__KAIRO_DEPTH__.readerNode(Number(el.dataset.index));
      const expected = node ? window.__KAIRO_DEPTH__.depth(node) : null;
      if (!expected || (expected.depth === 'unmet' && !expected.kept)) return [];
      return [{ index: el.dataset.index, expectedDepth: expected.depth, expectedKept: expected.kept, actualDepth: el.dataset.depth || null, actualKept: el.dataset.kept != null }];
    }));
    row(out, 'reader.all-stateful', stateAudit.length > 0 && stateAudit.every((r) => r.expectedDepth === r.actualDepth && r.expectedKept === r.actualKept && dots.some((d) => d.index === r.index && d.raster.changedPixels >= 4)), stateAudit);
    const byIndex = (id) => dots.find((d) => d.index === String(PARA[id]));
    const met = byIndex('met'), owned = byIndex('owned'), recalled = byIndex('recalled');
    row(out, 'reader.fixture-states', met?.depth === 'met' && owned?.depth === 'owned' && recalled?.depth === 'recalled' && owned.kept && byIndex('listed')?.kept, { met: met?.depth, owned: owned?.depth, recalled: recalled?.depth });
    const states = met?.raster.fill && owned?.raster.fill && owned?.raster.ring ? { metKnown: delta(met.raster.fill, owned.raster.fill), metSaved: delta(met.raster.fill, owned.raster.ring), knownSaved: delta(owned.raster.fill, owned.raster.ring) } : {};
    row(out, 'reader.semantic-separation', Object.keys(states).length === 3 && Object.values(states).every((d) => d >= 10) && met.raster.fillContrast < recalled.raster.fillContrast && met.raster.fillContrast < owned.raster.fillContrast, states);
    const collisions = await page.evaluate((dots) => {
      const glyphs = [];
      for (const tok of document.querySelectorAll('#reader .tok')) {
        const walker = document.createTreeWalker(tok, NodeFilter.SHOW_TEXT); let text;
        while ((text = walker.nextNode())) { const p = text.parentElement; if (!p || !text.textContent.trim()) continue; const style = getComputedStyle(p); if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
          for (let i = 0; i < text.length; i++) { const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1); for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) glyphs.push({ index: tok.dataset.index, rt: !!p.closest('rt'), left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY }); }
        }
      }
      return dots.flatMap((d) => glyphs.filter((g) => g.index !== d.index && d.left - d.spread < g.right && d.right + d.spread > g.left && d.top - d.spread < g.bottom && d.bottom + d.spread > g.top).map((g) => ({ dot: d.index, glyph: g })));
    }, dots);
    row(out, 'reader.no-next-line-overlap', collisions.length === 0, collisions);
    await ladderContract(page, out);
    await titleCard(page, out);
    console.log(JSON.stringify({ engine, world, metrics: { met: met?.raster, owned: owned?.raster, recalled: recalled?.raster }, states })); save();
    await rooms(page, out);
    await worldBinding(page, out, 'after-rooms');
    await freshWalk(browser, out, (fresh) => contextCard(fresh, out));
    for (const live of LIVE) await freshWalk(browser, out, (fresh) => liveFirstState(fresh, out, live));
    out.completedWalk = true;
  } catch (error) { out.errors.push(String(error.stack || error)); console.error(`${engine}/${world}: ${error.message}`); }
  finally { await context.close(); out.completedAt = new Date().toISOString(); out.passed = !out.errors.length && out.completedWalk && out.rows.length >= 24 && out.rows.every((r) => r.passed); save(); }
}
try {
  report.load = execFileSync('uptime', { encoding: 'utf8' }).trim();
  if (process.env.DOTS_BASE_URL) {
    assert(!process.env.KAIRO_SITE_DIR && !controlBytes && !diagnosticInlineEnd, 'Remote evidence cannot impersonate a local artifact or use mutation controls');
    base = new URL(process.env.DOTS_BASE_URL); assert(base.protocol === 'https:' && base.pathname.endsWith('/'), 'DOTS_BASE_URL must be an HTTPS directory');
    const response = await fetch(new URL('build-identity.json', base)); assert(response.ok, 'Remote build identity missing'); const bytes = Buffer.from(await response.arrayBuffer()); report.identity = JSON.parse(bytes); report.identityBytesSha256 = hash(bytes);
    assert.equal(report.identity.gitSha, '09c9239dccea32242873c312a4866ca9f5080c11', 'Live build is not expected 09c9239d'); report.mode = 'remote evidence only';
    const css = await fetch(new URL('editorial.css', base)); assert(css.ok, 'Remote CSS missing'); const cssBytes = Buffer.from(await css.arrayBuffer()); report.remoteCssBytesSha256 = hash(cssBytes);
    assert.equal(report.remoteCssBytesSha256, report.identity.files?.find((f) => f.path === 'editorial.css')?.sha256, 'Remote CSS bytes must match build identity');
  } else { const site = resolveCorridorSite(); report.site = site; report.identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8')); host = await startStaticHost({ site, port: 0 }); base = new URL(`${host.origin}/`); report.mode = 'local artifact'; }
  report.baseUrl = base.href; save();
  const runEngine = async (engine) => { const browser = await ({ webkit, chromium }[engine]).launch({ headless: true }); try { for (const world of worlds) await one(browser, engine, world); } finally { await browser.close(); } };
  report.parallelEngines = process.env.DOTS_PARALLEL_ENGINES === '1';
  if (report.parallelEngines) await Promise.all(engines.map(runEngine)); else for (const engine of engines) await runEngine(engine);
} catch (error) { report.errors.push(String(error.stack || error)); console.error(error.message); }
finally {
  if (report.mode === 'remote evidence only') {
    try { const response = await fetch(new URL('build-identity.json', base)); assert(response.ok, 'Remote identity recheck missing'); const bytes = Buffer.from(await response.arrayBuffer()); report.identityAfterBytesSha256 = hash(bytes); report.identityAfter = JSON.parse(bytes); assert.equal(report.identityAfterBytesSha256, report.identityBytesSha256, 'Remote identity changed during evidence run'); assert(report.remoteCssServed?.length, 'No bound remote CSS was served'); } catch (error) { report.errors.push(String(error.stack || error)); }
  }
  if (host) await host.close();
  report.completedAt = new Date().toISOString();
  report.passed = !report.errors.length && !report.control.setupError && report.contexts.length === engines.length * worlds.length && report.contexts.every((c) => c.passed) && (!controlBytes || report.control.served.length > 0);
  report.fullAcceptance = report.passed && report.scope.full && report.mode === 'local artifact' && !controlBytes && !diagnosticInlineEnd;
  report.control.killed = Boolean(controlBytes && !report.control.setupError && !report.errors.length && report.contexts.every((c) => !c.errors.length) && report.control.served.length && report.contexts.some((c) => c.rows.some((r) => /^(reader|title|context|slip|basis|prose|tray|today|mirror)(?:-[a-z]+)*\.(size|contrast|nonempty|semantic-separation)$/.test(r.id) && !r.passed)));
  save(); console.log(`DOTS ${report.passed ? 'PASS' : 'FAIL'}: ${evidence}`); if (!report.passed) process.exitCode = 1;
}
