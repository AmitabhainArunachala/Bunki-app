/** DOTS: actual raster visibility, independent of the CSS pigment proxy.
 * Delta-E 76 >= 10 is a conservative engineering separation, not a WCAG rule.
 * Evidence-only --worlds may narrow a diagnostic, never the full 22-context claim.
 * The ladder contract is exercised as an attribute, not claimed as a ladder interaction.
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
async function story(page) {
  await boot(page);
  const direct = page.locator(`[data-passage="${STORY}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click(); else { await openShelfTools(page); await page.locator('#shelf-reading-search').fill('スタートアップ大賞'); await page.locator('#shelf-reading-search').press('Enter'); await page.locator(`#shelf-reading-results [data-passage="${STORY}"] .shelf-open`).first().click(); }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30000 }); await delay(1000);
}
async function seed(page) {
  await story(page);
  const nodes = await page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, at]) => { const node = window.__KAIRO_DEPTH__.readerNode(at); return [name, { node, key: window.__KAIRO_DEPTH__.key(node || {}), kind: window.__KAIRO_DEPTH__.identity(node || {})?.kind }]; })), PARA);
  const wanted = { unmet: '出席', met: '官邸', again: '大賞', recalled: '表彰', owned: '大臣', listed: '式', notYet: '挨拶' };
  assert(Object.entries(wanted).every(([k, v]) => nodes[k]?.node?.id === v && nodes[k].kind === 'core'), `Fixture identity mismatch: ${JSON.stringify(nodes)}`);
  const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day()), now = Date.now();
  const value = (await readAppRecordSnapshot(page)).record;
  const item = (id) => ({ t: 'word', id, label: id, ts: now - 40 * DAY, started: now - 40 * DAY });
  const card = (stability, daysAgo) => ({ due: new Date(now + Math.round(stability * 0.6) * DAY).toISOString(), last_review: new Date(now - daysAgo * DAY).toISOString(), stability, difficulty: 5.1, elapsed_days: daysAgo, scheduled_days: Math.round(stability * 0.6) + daysAgo, reps: 7, lapses: 0, learning_steps: 0, state: 2 });
  value.taken = [...value.taken, ...['大臣', '挨拶', '日', '年'].map(item)];
  value.lists = { ...value.lists, 式典: [{ t: 'word', id: '式', label: '式', ts: now - 3 * DAY }] };
  value.srs = { ...value.srs, 'word:大臣': card(64, 3), 'word:表彰': card(12, 1), 'word:挨拶': card(48, 2), 'word:日': card(80, 4), 'word:年': card(90, 5) };
  const rev = (t, g) => [t, 'word:大臣', g, 2, 3, 0.95, 40, 5, 42, 5, 30, t + 30 * DAY];
  value.revlog = [...value.revlog, rev(now - 3 * DAY, 1), rev(now - 2 * DAY, 3)];
  // Native history reaches real Today looked/due variants, including the due
  // star's authored breathing opacity; no DOM state or paint is manufactured.
  value.obslog = [...(value.obslog || []), ...['官邸', '大賞', '表彰'].flatMap((word) => [[now - 30 * 60000, 'tap', `word:${word}`, 2, STORY], [now - 15 * 60000, 'tap', `word:${word}`, 2, STORY]])];
  value.srs['word:挨拶'].due = new Date(now - 60000).toISOString();
  value.met = { version: 1, entries: Object.fromEntries([['met', 0, 0, 1], ['again', 9, 1, 3], ['recalled', 30, 4, 6], ['owned', 60, 2, 11], ['notYet', 20, 1, 4]].map(([k, first, last, days]) => [nodes[k].key, { first: today - first, last: today - last, days, ...(k === 'notYet' ? { said: { value: 'not-yet', at: now - DAY, cursor: value.revlog.length } } : {}) }])) };
  const blank = new URL('__dots-blank', base).href;
  await page.route(blank, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Native fixture</title>' }));
  await page.goto(blank);
  await page.evaluate(async ({ text, moduleUrl }) => { const core = await import(moduleUrl); const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')); const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { const before = await store.snapshot(); await store.commitLocal({ changeId: `dots-seed-${crypto.randomUUID()}`, binding: policy.binding, expectedRevision: before.revision, occurredAt: new Date().toISOString(), mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: JSON.parse(text) }], operations: [] }); } finally { await store.close(); }
  }, { text: JSON.stringify(value), moduleUrl: new URL('modules/record-core.mjs', base).href });
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
    if (elements.some((el) => el.matches('.japanese-lookup-word') && el.closest('#sheet'))) {
      for (const owner of document.querySelectorAll('#sheet .japanese-lookup-word')) {
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT); let text;
        while ((text = walker.nextNode())) {
          const style = getComputedStyle(text.parentElement);
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
          for (let i = 0; i < text.length; i++) { const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1); for (const r of range.getClientRects()) if (r.width && r.height) glyphs.push({ owner: owner.dataset.dotsNode || null, text: text.textContent, left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY }); }
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
async function rooms(page, out) {
  out.roomStateCoverage = {};
  // Traverse actual doors for all four fills. These are independently seeded
  // native identities; opening a slip can add today's encounter naturally.
  for (const name of ['owned', 'met', 'again', 'recalled']) {
    const word = page.locator(`#reader .tok[data-index="${PARA[name]}"]`);
    await word.scrollIntoViewIfNeeded(); await word.click();
    await page.waitForFunction((e) => document.getElementById('mini') || e?.dataset.ladderRung === 'reading', await word.elementHandle());
    if (!await page.locator('#mini').count()) await word.click();
    await page.locator('#mini .mini-word').waitFor(); await delay(200);
    const slip = await capture(page, out, `slip-${name}`, '#mini .mini-word');
    checkPaint(out, `slip-${name}`, slip);
    await page.locator('#mini .mini-word').click(); await page.locator('#depth-basis .depth-dot').waitFor(); await delay(300);
    const basis = await capture(page, out, `basis-${name}`, '#sheet .depth-dot:is([data-depth],[data-kept]):visible', false);
    checkPaint(out, `basis-${name}`, basis);
    out.roomStateCoverage[name] = { slip: slip.map((d) => d.depth), basis: basis.map((d) => d.depth) };
    const proseSelector = '#sheet .japanese-lookup-word:is([data-depth],[data-kept]):visible';
    if (await page.locator(proseSelector).count()) {
      const prose = await capture(page, out, `prose-${name}`, proseSelector);
      checkPaint(out, `prose-${name}`, prose);
      row(out, `prose-${name}.fragment-alignment`, prose.every((d) => d.fragments.some((f) => (d.left + d.right) / 2 >= f.left - 0.5 && (d.left + d.right) / 2 <= f.right + 0.5 && (d.top + d.bottom) / 2 >= f.bottom - 2 && (d.top + d.bottom) / 2 <= f.bottom + 12)), prose.map((d) => ({ text: d.text, dot: [d.left, d.top, d.right, d.bottom], fragments: d.fragments, cssGeometry: d.cssGeometry })));
      const clashes = prose.flatMap((d) => out.captureFrames[d.captureFrame].glyphs.filter((g) => g.owner !== d.probeId && d.left - d.spread < g.right && d.right + d.spread > g.left && d.top - d.spread < g.bottom && d.bottom + d.spread > g.top).map((g) => ({ captureFrame: d.captureFrame, dot: d.text, dotBox: [d.left - d.spread, d.top - d.spread, d.right + d.spread, d.bottom + d.spread], host: d.host, fragments: d.fragments, cssGeometry: d.cssGeometry, glyph: g })));
      row(out, `prose-${name}.no-other-glyph-overlap`, clashes.length === 0, clashes);
      out.proseCoverage = [...(out.proseCoverage || []), ...prose.map((d) => ({ text: d.text, depth: d.depth, kept: d.kept }))];
    }
    await page.locator('#sheet-back').click(); await page.waitForFunction(() => !document.getElementById('sheet')); await delay(250);
    if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(150); }
  }
  row(out, 'room.native-fill-coverage', ['owned', 'met', 'again', 'recalled'].every((name) => out.roomStateCoverage[name].slip.includes(name) && out.roomStateCoverage[name].basis.includes(name)), out.roomStateCoverage);
  row(out, 'room.generic-prose-covered', (out.proseCoverage || []).length > 0, out.proseCoverage || []);
  await page.locator('#tray').click(); await page.locator('.tray-line').first().waitFor(); await delay(300);
  checkPaint(out, 'tray', await capture(page, out, 'tray', '.tray-line .depth-dot:is([data-depth],[data-kept]):visible', false));
  await page.locator('#tab-today').click(); await page.locator('.today-star').first().waitFor(); await delay(350);
  checkPaint(out, 'today', await capture(page, out, 'today', '.today-star:is([data-depth],[data-kept]):not([hidden])'));
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
  checkPaint(out, 'today-minimum-breath', await capture(page, out, 'today-minimum-breath', '.today-star.due:is([data-depth],[data-kept]):not([hidden])'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#tab-me, #tab-progress').first().click(); await page.locator('#me-progress').waitFor(); await page.locator('#me-progress').click();
  await page.waitForFunction(() => document.body.dataset.view === 'kagami'); await delay(300);
  checkPaint(out, 'mirror', await capture(page, out, 'mirror', '.kagami-row .depth-dot:is([data-depth],[data-kept]):visible', false));
}

async function one(browser, engine, world) {
  const out = { engine, version: browser.version(), world, viewport: engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 2, touch: engine === 'webkit', startedAt: new Date().toISOString(), rows: [], measurements: {}, errors: [] };
  report.contexts.push(out); save();
  const context = await browser.newContext({ viewport: engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: engine === 'webkit', hasTouch: engine === 'webkit', reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block' });
  try {
    await context.addInitScript((world) => { localStorage.setItem('kairo-theme', world); localStorage.setItem('kairo-word-ladder-demo-v1', '1'); }, world);
    if (controlBytes || diagnosticInlineEnd) await context.route(new URL('editorial.css', base).href + '*', async (route) => { try { const response = await route.fetch(); const original = await response.body(); const expected = report.identity.files?.find((f) => f.path === 'editorial.css')?.sha256; assert(expected && hash(original) === expected, 'Control fetched CSS does not match artifact'); const servedBytes = controlBytes || Buffer.concat([original, Buffer.from('\n.japanese-lookup-word:is([data-depth],[data-kept])::after { left:auto; right:auto; transform:translateX(calc(-0.5em - var(--depth-size)/2)); }\n')]); assert(hash(original) !== hash(servedBytes), 'Control must change CSS'); report.control.served.push({ url: route.request().url(), candidateSha256: hash(original), servedSha256: hash(servedBytes) }); await route.fulfill({ response, body: servedBytes, headers: { ...response.headers(), 'content-length': String(servedBytes.length), 'content-type': 'text/css' } }); } catch (e) { report.control.setupError = String(e.stack); await route.abort(); } });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (e) => out.errors.push(String(e)));
    await seed(page);
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
    console.log(JSON.stringify({ engine, world, metrics: { met: met?.raster, owned: owned?.raster, recalled: recalled?.raster }, states })); save();
    await rooms(page, out);
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
  } else { const site = resolveCorridorSite(); report.site = site; report.identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8')); host = await startStaticHost({ site, port: 0 }); base = new URL(`${host.origin}/`); report.mode = 'local artifact'; }
  report.baseUrl = base.href; save();
  const runEngine = async (engine) => { const browser = await ({ webkit, chromium }[engine]).launch({ headless: true }); try { for (const world of worlds) await one(browser, engine, world); } finally { await browser.close(); } };
  report.parallelEngines = process.env.DOTS_PARALLEL_ENGINES === '1';
  if (report.parallelEngines) await Promise.all(engines.map(runEngine)); else for (const engine of engines) await runEngine(engine);
} catch (error) { report.errors.push(String(error.stack || error)); console.error(error.message); }
finally {
  if (host) await host.close();
  report.completedAt = new Date().toISOString();
  report.passed = !report.errors.length && !report.control.setupError && report.contexts.length === engines.length * worlds.length && report.contexts.every((c) => c.passed) && (!controlBytes || report.control.served.length > 0);
  report.fullAcceptance = report.passed && report.scope.full && report.mode === 'local artifact' && !controlBytes && !diagnosticInlineEnd;
  report.control.killed = Boolean(controlBytes && !report.control.setupError && !report.errors.length && report.contexts.every((c) => !c.errors.length) && report.control.served.length && report.contexts.some((c) => c.rows.some((r) => /^reader\.(size|contrast|nonempty|semantic-separation)$/.test(r.id) && !r.passed)));
  save(); console.log(`DOTS ${report.passed ? 'PASS' : 'FAIL'}: ${evidence}`); if (!report.passed) process.exitCode = 1;
}
