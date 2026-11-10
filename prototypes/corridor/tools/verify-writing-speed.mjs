/** Packet INK: actual rendered-deposit timing and quiet corner controls.
 * Pin KAIRO_SITE_DIR + KAIRO_ARTIFACT_SHA256; evidence is external.
 * --controls additionally requires ignored-speed mutation to fail both ratios
 * in BOTH browsers. A prior pinned artifact uses the identical positive schedule
 * and exits red normally; there is no expected-red switch masking positive rows.
 * Neither next-rAF observation nor automated touch is physical-device evidence.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = process.env.KAIRO_VERIFIER_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(resolve(root, 'package.json'));
const { chromium, webkit } = require('playwright-core');
const { startStaticHost } = require(resolve(root, 'prototypes/bunki-desktop/lib/static-host.cjs'));
const { resolveCorridorSite, resolveCorridorEvidence } = await import(pathToFileURL(resolve(root, 'scripts/resolve-corridor-site.mjs')));
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin a built site and its exact artifact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const controls = process.argv.includes('--controls');
const timingOnly = process.argv.includes('--timing-only');
const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const report = {
  schemaVersion: 1, site, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
  artifactSha256: identity.artifactSha256,
  scope: timingOnly ? 'Timing, retiming, persistence and canvas witness only; no visual/contrast claim' : 'Timing plus eleven-world kanji/board visual checks and classic hit area',
  verifierSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  method: 'Observe splat-bearing frames after actual render/blit submission at the next rAF; first-to-last presented deposit excludes the writer settling tail. Served-byte observation is hashed below; original artifact admission is unchanged.',
  limitations: ['Next rAF is a presentation proxy, not GPU scanout instrumentation', 'Automated browser touch is not a physical iPhone test', 'Virtual clock samples diagnose retiming; independent visible-deposit duration is also required', 'Hidden-glyph paired screenshots temporarily change only glyph visibility for background sampling'],
  browsers: [], rows: [], loads: [], instrumentation: [], infrastructure: [],
};
function check(id, ok, observed) {
  report.rows.push({ id, ok: !!ok, observed });
  console.log(`${ok ? 'ok' : 'FAIL'} ${id} ${JSON.stringify(observed).slice(0, 600)}`);
}
function load(label) {
  const text = execFileSync('uptime', { encoding: 'utf8' }).trim();
  const value = Number(text.match(/load averages?:\s*([\d.]+)/u)?.[1]);
  const row = { label, at: new Date().toISOString(), text, oneMinute: value, absoluteDurationProvisional: value > 20 };
  report.loads.push(row); console.log(text);
  assert(Number.isFinite(value), `Unknown system load: ${text}`);
  return row;
}
function save() { writeFileSync(resolve(evidence, 'verify-writing-speed.json'), JSON.stringify(report, null, 2) + '\n'); }
const observer = `
function inkObserved(out,vNow,now){
  const run=window.__inkRun;if(!run)return;
  if(out.beginStroke!==null)run.stroke=out.beginStroke;
  run.frames.push({at:now,virtual:vNow});
  if(out.splats.length){
    const sample={at:now,virtual:vNow,stroke:run.stroke,splats:out.splats.length};
    requestAnimationFrame(presented=>{sample.presented=presented;run.samples.push(sample);});
  }
  if(out.finished)requestAnimationFrame(()=>{run.done=true;run.completedAt=performance.now();});
}
`;
function instrument(original, ignored) {
  let source = original;
  const starts = source.match(/writer\.start\(t0\);/gu) || [];
  assert.equal(starts.length, 2, 'Observe both real renderer starts; source contract changed');
  let mutationAssignments = 0;
  if (ignored) {
    // Only the selected rate is mutated. Writer geometry, clocks, draw and UI are untouched.
    source = source.replace(/\bwriteSpeed\s*=\s*([^;,\n]+)/gu, () => { mutationAssignments++; return 'writeSpeed = 1.1'; });
    assert(mutationAssignments >= 6, 'Mutant must cover declaration, begin and setter in BOTH backends');
  }
  source = source.replaceAll('writer.start(t0);', `writer.start(t0);window.__inkRun={id:++window.__inkSerial,samples:[],frames:[],done:false,stroke:-1};window.__inkRuns.push(window.__inkRun);`);
  for (const name of ['step', 'out']) {
    const anchor = `if (${name}.finished) { writing = false;`;
    assert.equal(source.split(anchor).length - 1, 1, `Observe ${name} only after real rendering`);
    source = source.replace(anchor, `inkObserved(${name},vNow,now); ${anchor}`);
  }
  source += observer;
  return { source, mutationAssignments };
}
async function makeContext(browser, name, world, ignored = false) {
  const context = await browser.newContext({ viewport: name === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: name === 'webkit', hasTouch: name === 'webkit', deviceScaleFactor: 2,
    reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.addInitScript(w => {
    // Seed once so a reload genuinely tests persistence instead of reseeding speed.
    if (!sessionStorage.getItem('ink-verifier-seeded')) {
      localStorage.setItem('kairo-theme', w);
      localStorage.setItem('kairo-stroke-speed-v1', w === 'hokusai' || w === 'sumi' ? '1.1' : '2.2');
      sessionStorage.setItem('ink-verifier-seeded', '1');
    }
    window.__inkRuns = []; window.__inkRun = null; window.__inkSerial = 0;
  }, world);
  await context.route('**/corridor-ink.js*', async route => {
    try {
      const response = await route.fetch(), original = await response.text();
      const result = instrument(original, ignored);
      report.instrumentation.push({ name, world, ignored, originalSha256: createHash('sha256').update(original).digest('hex'),
        servedSha256: createHash('sha256').update(result.source).digest('hex'), mutationAssignments: result.mutationAssignments });
      await route.fulfill({ response, body: result.source });
    } catch (error) {
      report.infrastructure.push({ name, world, ignored, routeError: String(error.stack || error) });
      await route.abort();
    }
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error.stack || error)));
  page.setDefaultTimeout(60000);
  return { context, page, errors };
}
async function openBoard(page, origin, navigate = true, classic = false, beforeBoard = null) {
  if (navigate) await page.goto(`${origin}/index.html?entry=shelf&ui=bi${classic ? '&minimal=0' : ''}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const tools = page.locator('#shelf-tools-toggle');
  if (await tools.getAttribute('aria-expanded') !== 'true') await tools.click();
  await page.locator('#search').fill('海');
  await page.locator('[data-result="kanji:海"]').first().click();
  if (beforeBoard) await beforeBoard();
  await page.locator('#strokes-door').click();
  await page.waitForFunction(() => document.querySelector('#stroke-page')?.dataset.living === 'on' && window.__inkRun);
  await page.evaluate(() => document.fonts.ready);
  const facts = await page.locator('#stroke-page').evaluate(node => ({ ...node.dataset }));
  assert(['gpu', 'gl2'].includes(facts.inkKind), `A real living renderer must own the board: ${JSON.stringify(facts)}`);
  return facts;
}
async function setRate(page, index) {
  const range = page.locator('#stroke-speed-range');
  await range.focus();
  if (index === 0) await range.press('Home');
  else if (index === 2) await range.press('End');
  else { await range.press('Home'); await range.press('ArrowRight'); }
  assert.equal(await range.inputValue(), String(index), 'Native range keyboard input changed position');
}
async function replay(page) {
  const previous = await page.evaluate(() => window.__inkRun?.id);
  await page.locator('#ink-stage').click({ position: { x: 80, y: 80 } });
  await page.waitForFunction(id => window.__inkRun?.id > id, previous);
  return page.evaluate(() => window.__inkRun.id);
}
async function completed(page, id) {
  await page.waitForFunction(id => window.__inkRun?.id === id && window.__inkRun.done, id, { timeout: 120000 });
  const run = await page.evaluate(() => window.__inkRun);
  assert(run.samples.length >= 12, 'Enough real deposited/presented samples, not a timer-only proof');
  assert(run.samples.every(s => Number.isFinite(s.presented) && s.splats > 0), 'Every timing sample came from submitted ink');
  run.duration = run.samples.at(-1).presented - run.samples[0].presented;
  assert(run.duration > 0);
  return run;
}
async function durations(page, label) {
  const rates = [];
  for (const index of [0, 1, 2]) {
    load(`${label}/${index}/before`);
    await setRate(page, index);
    const id = await replay(page), run = await completed(page, id);
    load(`${label}/${index}/after`);
    rates.push({ index, stored: await page.evaluate(() => localStorage.getItem('kairo-stroke-speed-v1')), ...run });
    console.log(label, index, run.duration);
    if (index === 1) await page.screenshot({ path: resolve(evidence, `${label}-middle-board.png`) });
  }
  return { rates, slowMiddle: rates[0].duration / rates[1].duration, middleFast: rates[1].duration / rates[2].duration };
}
function slope(samples) {
  assert(samples.length >= 3, 'At least three deposit samples define a clock slope');
  const a = samples[0], b = samples.at(-1);
  return (b.virtual - a.virtual) / (b.at - a.at);
}
async function retime(page, baseline, label) {
  load(`${label}/before`);
  await setRate(page, 0);
  const id = await replay(page);
  await page.waitForFunction(({ id, duration }) => {
    const run = window.__inkRun, samples = run?.samples;
    return run?.id === id && samples.length >= 10 && samples.at(-1).presented - samples[0].presented >= duration * .25;
  }, { id, duration: baseline.duration }, { timeout: 60000 });
  const before = await page.evaluate(() => ({ id: window.__inkRun.id, samples: window.__inkRun.samples.slice(), frames: window.__inkRun.frames.slice(), at: performance.now() }));
  await setRate(page, 2);
  const immediate = await page.evaluate(() => ({ id: window.__inkRun.id, at: performance.now() }));
  if (immediate.id !== id) {
    load(`${label}/after-reset`);
    check(`${label}/same-run-monotonic`, false, { expected: id, actual: immediate.id, reason: 'Changing speed restarted the writing' });
    return { before, immediate, reset: true };
  }
  const changedAt = immediate.at;
  const run = await completed(page, id);
  load(`${label}/after`);
  const post = run.frames.filter(frame => frame.at > changedAt);
  const oldSlope = slope(before.frames.slice(-8)), newSlope = slope(post.slice(0, 3));
  const all = run.samples, monotonic = all.every((sample, i) => !i || sample.virtual >= all[i - 1].virtual && sample.stroke >= all[i - 1].stroke);
  const oldRemaining = baseline.duration - (before.samples.at(-1).presented - before.samples[0].presented);
  const remaining = all.at(-1).presented - changedAt;
  const firstAfter = all.find(sample => sample.at >= changedAt);
  // A reset cannot satisfy completed(id). An anchor jump cannot satisfy the cross-boundary
  // integral below even if stroke indices happen to remain unchanged.
  const pre = before.samples.at(-1);
  const cross = all.find(sample => sample.at > changedAt + 30);
  const integratedLower = pre.virtual + (cross.at - pre.at) * oldSlope;
  const integratedUpper = pre.virtual + (cross.at - pre.at) * newSlope;
  check(`${label}/same-run-monotonic`, run.id === before.id && monotonic, { id, oldId: before.id, monotonic });
  check(`${label}/clock-continuity`, cross.virtual >= integratedLower - 2 && cross.virtual <= integratedUpper + 2,
    { pre, cross, integratedLower, integratedUpper });
  check(`${label}/immediate-fourfold-rate`, newSlope / oldSlope >= 3.8 && newSlope / oldSlope <= 4.2,
    { oldSlope, newSlope, ratio: newSlope / oldSlope, firstThreeFrames: post.slice(0, 3), firstDepositDelay: firstAfter.at - changedAt });
  check(`${label}/shorter-visible-remainder`, remaining > 0 && remaining < oldRemaining * .65, { remaining, oldRemaining });
  return { before, changedAt, run, oldSlope, newSlope, remaining, oldRemaining };
}

// Screenshot decoder retained locally so the new verifier does not modify the shared contrast sweep.
function decodePng(buffer) {
  let at = 8, width, height, type; const chunks = [];
  while (at < buffer.length) {
    const n = buffer.readUInt32BE(at), kind = buffer.toString('latin1', at + 4, at + 8), data = buffer.subarray(at + 8, at + 8 + n);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9]; assert(data[8] === 8 && data[12] === 0 && [2, 6].includes(type)); }
    if (kind === 'IDAT') chunks.push(data);
    if (kind === 'IEND') break;
    at += n + 12;
  }
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(chunks)), pixels = new Uint8Array(width * height * 3);
  let previous = new Uint8Array(stride), line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; assert(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = previous[x], c = x >= bpp ? previous[x - bpp] : 0;
      let v = raw[y * (stride + 1) + x + 1];
      if (filter === 1) v += a;
      if (filter === 2) v += b;
      if (filter === 3) v += (a + b) >> 1;
      if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) pixels[(y * width + x) * 3 + k] = line[x * bpp + k];
    [previous, line] = [line, previous];
  }
  return { width, height, pixels };
}
const luminance = rgb => rgb.map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
async function kanjiPageContrast(page, label) {
  // Same text-run basis as the contrast sweep: actual text Range rectangles,
  // ancestor opacity, rendered text fill and screenshot pixels of its ground.
  await page.locator('#sheet .hero-glyph').first().waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !document.querySelector('#sheet').getAnimations({ subtree: true }).some(animation =>
    animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity), null, { timeout: 10000 });
  const facts = await page.locator('#sheet .hero-glyph').first().evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node);
    const boxes = [...range.getClientRects()].map(b => ({ x: b.x, y: b.y, width: b.width, height: b.height }));
    const style = getComputedStyle(node); let opacity = 1, unsupported = false;
    for (let p = node; p; p = p.parentElement) {
      const s = getComputedStyle(p); opacity *= Number(s.opacity);
      unsupported ||= s.mixBlendMode !== 'normal' || s.filter !== 'none';
    }
    return { text: node.textContent.trim(), boxes, color: (style.webkitTextFillColor || style.color).match(/[\d.]+/g)?.map(Number), opacity, unsupported, width: innerWidth };
  });
  const visible = decodePng(await page.screenshot({ path: resolve(evidence, `${label}-kanji-page.png`) }));
  const glyph = page.locator('#sheet .hero-glyph').first();
  const old = await glyph.getAttribute('style');
  await glyph.evaluate(node => node.style.setProperty('visibility', 'hidden', 'important'));
  let hidden;
  try { hidden = decodePng(await page.screenshot({ path: resolve(evidence, `${label}-kanji-background.png`) })); }
  finally { await glyph.evaluate((node, old) => old == null ? node.removeAttribute('style') : node.setAttribute('style', old), old); }
  const scale = hidden.width / facts.width, rgb = facts.color?.slice(0, 3), alpha = facts.opacity * (facts.color?.[3] ?? 1);
  let minimum = Infinity, strongest = 1, changed = 0, pixels = 0;
  assert(rgb?.length === 3, 'Kanji text fill resolves to RGB');
  for (const box of facts.boxes) {
    for (let y = Math.max(0, Math.ceil(box.y * scale)); y < Math.min(hidden.height, Math.floor((box.y + box.height) * scale)); y++) {
      for (let x = Math.max(0, Math.ceil(box.x * scale)); x < Math.min(hidden.width, Math.floor((box.x + box.width) * scale)); x++) {
        const at = (y * hidden.width + x) * 3, bg = [...hidden.pixels.slice(at, at + 3)], ink = [...visible.pixels.slice(at, at + 3)];
        minimum = Math.min(minimum, contrast(rgb.map((value, i) => value * alpha + bg[i] * (1 - alpha)), bg));
        if (Math.max(...ink.map((value, i) => Math.abs(value - bg[i]))) >= 12) { changed++; strongest = Math.max(strongest, contrast(ink, bg)); }
        pixels++;
      }
    }
  }
  const result = { ...facts, minimum, strongest, changed, pixels };
  check(`${label}/kanji-page-glyph-contrast`, facts.text === '海' && !facts.unsupported && minimum >= 3 && strongest >= 3 && changed >= 4 && pixels > 0, result);
  return result;
}
async function canvasWitness(page, label) {
  load(`${label}/before`);
  await setRate(page, 0);
  const id = await replay(page);
  await page.waitForFunction(id => window.__inkRun?.id === id && window.__inkRun.samples.length >= 2, id);
  const early = decodePng(await page.locator('canvas.ink-sheet').screenshot({ path: resolve(evidence, `${label}-canvas-early.png`) }));
  const run = await completed(page, id);
  const final = decodePng(await page.locator('canvas.ink-sheet').screenshot({ path: resolve(evidence, `${label}-canvas-final.png`) }));
  load(`${label}/after`);
  assert(early.width === final.width && early.height === final.height, 'Compare the same actual canvas viewport');
  let changed = 0;
  for (let at = 0; at < early.pixels.length; at += 3) {
    if (Math.max(...[0, 1, 2].map(k => Math.abs(early.pixels[at + k] - final.pixels[at + k]))) >= 12) changed++;
  }
  const result = { id, width: early.width, height: early.height, changedPixels: changed, share: changed / (early.width * early.height), run };
  check(`${label}/actual-canvas-changes`, changed >= 100 && result.share >= .001, { ...result, run: { id, samples: run.samples.length, duration: run.duration } });
  return result;
}
async function placement(page, label) {
  const result = await page.evaluate(() => {
    const wrap = document.querySelector('.stroke-speed-wrap'), range = document.querySelector('#stroke-speed-range');
    const a = wrap.getBoundingClientRect(), b = range.getBoundingClientRect();
    const matches = ['x', 'y', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) <= 1);
    const hits = [.17, .5, .83].map(t => document.elementFromPoint(a.x + a.width * t, a.y + a.height / 2) === range);
    return { minimal: document.querySelector('#stroke-page').dataset.minimal, wrap: { x: a.x, y: a.y, width: a.width, height: a.height },
      range: { x: b.x, y: b.y, width: b.width, height: b.height }, matches, hits };
  });
  check(`${label}/range-covers-glyphs`, result.matches && result.hits.every(Boolean), result);
  return result;
}
async function visuals(page, label) {
  const facts = await page.evaluate(() => {
    const rect = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    const style = node => { const s = getComputedStyle(node); return { background: s.backgroundColor, shadow: s.boxShadow,
      borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].map(parseFloat) }; };
    const wrap = document.querySelector('.stroke-speed-wrap'), range = document.querySelector('#stroke-speed-range'), numbers = document.querySelector('#stroke-numbers');
    const glyphs = [...document.querySelectorAll('.stroke-speed-glyph, #stroke-numbers .stroke-corner-glyph')].map(node => {
      const s = getComputedStyle(node); let opacity = 1;
      for (let p = node; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
      const color = s.color.match(/[\d.]+/g)?.map(Number);
      return { text: node.textContent.trim(), box: rect(node), color, opacity, visibility: s.visibility, display: s.display };
    });
    const name = node => node.getAttribute('aria-label') || [...(node.labels || [])].map(n => n.textContent).join(' ').trim();
    return { wrap: { box: rect(wrap), ...style(wrap) }, range: { box: rect(range), name: name(range), disabled: range.disabled, tabIndex: range.tabIndex },
      numbers: { box: rect(numbers), name: name(numbers), text: numbers.textContent.trim(), disabled: numbers.disabled, tabIndex: numbers.tabIndex, ...style(numbers) }, glyphs, viewport: { width: innerWidth, height: innerHeight } };
  });
  const clear = s => /rgba\([^)]*,\s*0\s*\)$/u.test(s.background) || s.background === 'transparent';
  const quiet = s => clear(s) && s.shadow === 'none' && s.borders.every(width => width === 0);
  check(`${label}/compact-transparent`, quiet(facts.wrap) && quiet(facts.numbers) && facts.wrap.box.width <= 85 && facts.wrap.box.height <= 45 && facts.numbers.box.width <= 45 && facts.numbers.box.height <= 45, facts);
  check(`${label}/touch-targets`, facts.range.box.width >= 44 && facts.range.box.height >= 44 && facts.numbers.box.width >= 44 && facts.numbers.box.height >= 44, facts);
  check(`${label}/names-and-glyphs`, !!facts.range.name && !!facts.numbers.name && facts.glyphs.length === 4 && ['緩', '中', '速', '順'].every(text => facts.glyphs.filter(g => g.text === text).length === 1) && facts.numbers.text === '順', facts);
  for (const selector of ['#stroke-speed-range', '#stroke-numbers']) {
    await page.locator(selector).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    check(`${label}/focus/${selector}`, await page.locator(selector).evaluate(node => document.activeElement === node && node.matches(':focus-visible') && !node.disabled && node.tabIndex >= 0), selector);
  }
  // Blur before the rest-state image: focus decoration is a separate accessibility state.
  await page.evaluate(() => document.activeElement?.blur());
  const visibleBuffer = await page.screenshot({ path: resolve(evidence, `${label}-board.png`) });
  let hiddenBuffer;
  await page.evaluate(() => {
    window.__inkGlyphStyles = [...document.querySelectorAll('.stroke-speed-glyph, #stroke-numbers .stroke-corner-glyph')].map(node => [node, node.getAttribute('style')]);
    for (const [node] of window.__inkGlyphStyles) node.style.setProperty('visibility', 'hidden', 'important');
  });
  try { hiddenBuffer = await page.screenshot({ path: resolve(evidence, `${label}-background.png`) }); }
  finally {
    await page.evaluate(() => { for (const [node, value] of window.__inkGlyphStyles) value == null ? node.removeAttribute('style') : node.setAttribute('style', value); delete window.__inkGlyphStyles; });
  }
  const visible = decodePng(visibleBuffer), hidden = decodePng(hiddenBuffer), scale = hidden.width / facts.viewport.width;
  const rows = [];
  for (const glyph of facts.glyphs) {
    let minimum = Infinity, strongest = 1, changed = 0, pixels = 0;
    const box = glyph.box, rgb = glyph.color?.slice(0, 3), alpha = glyph.opacity * (glyph.color?.[3] ?? 1);
    if (!rgb || !box.width || !box.height) { rows.push({ ...glyph, error: 'Missing rendered glyph geometry/color' }); continue; }
    for (let y = Math.max(0, Math.ceil(box.y * scale)); y < Math.min(hidden.height, Math.floor((box.y + box.height) * scale)); y++) {
      for (let x = Math.max(0, Math.ceil(box.x * scale)); x < Math.min(hidden.width, Math.floor((box.x + box.width) * scale)); x++) {
        const at = (y * hidden.width + x) * 3, background = [...hidden.pixels.slice(at, at + 3)], foreground = [...visible.pixels.slice(at, at + 3)];
        const composite = rgb.map((value, i) => value * alpha + background[i] * (1 - alpha));
        minimum = Math.min(minimum, contrast(composite, background));
        if (Math.max(...foreground.map((value, i) => Math.abs(value - background[i]))) >= 12) { changed++; strongest = Math.max(strongest, contrast(foreground, background)); }
        pixels++;
      }
    }
    rows.push({ ...glyph, minimumInkBackgroundContrast: minimum, strongestRenderedContrast: strongest, changedPixels: changed, pixels });
  }
  check(`${label}/pixel-background-contrast`, rows.length === 4 && rows.every(row => row.minimumInkBackgroundContrast >= 3 && row.strongestRenderedContrast >= 3 && row.changedPixels >= 4 && row.visibility === 'visible' && row.display !== 'none'), rows);
  return { facts, rows };
}

const host = await startStaticHost({ site, port: 0 });
try {
  for (const [name, type] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await type.launch({ headless: true });
    const item = { name, version: browser.version(), timing: [], visuals: [], controls: [] };
    report.browsers.push(item); console.log(name, item.version);
    try {
      for (const world of timingOnly ? ['hokusai'] : WORLDS) {
        const { context, page, errors } = await makeContext(browser, name, world);
        const label = `${name}-${world}`;
        try {
          let kanji;
          item.board = await openBoard(page, host.origin, true, false, timingOnly ? null : async () => { kanji = await kanjiPageContrast(page, label); });
          if (world === 'hokusai') {
            const measured = await durations(page, label);
            item.timing.push({ world, ...measured });
            check(`${label}/slow-middle`, measured.slowMiddle >= 1.6, { ratio: measured.slowMiddle, durations: measured.rates.map(row => row.duration) });
            check(`${label}/middle-fast`, measured.middleFast >= 1.6, { ratio: measured.middleFast });
            item.timing.at(-1).retime = await retime(page, measured.rates[0], `${label}-retime`);
            item.timing.at(-1).canvasWitness = await canvasWitness(page, `${label}-witness`);
            await setRate(page, 0);
            const stored = await page.evaluate(() => localStorage.getItem('kairo-stroke-speed-v1'));
            await page.reload(); await openBoard(page, host.origin, false);
            check(`${label}/reload-persists`, stored === '0.55' && await page.locator('#stroke-speed-range').inputValue() === '0' && await page.evaluate(() => localStorage.getItem('kairo-stroke-speed-v1')) === stored, { stored });
            await setRate(page, 1);
          }
          // A still settled sheet makes paired glyph/background captures stable.
          await page.waitForFunction(() => window.__inkRun?.done, null, { timeout: 120000 });
          if (!timingOnly) item.visuals.push({ world, kanji, placement: await placement(page, label), ...await visuals(page, label) });
          check(`${label}/page-errors`, errors.length === 0, errors);
        } catch (error) {
          report.infrastructure.push({ name, world, error: String(error.stack || error) });
          check(`${label}/complete`, false, String(error.stack || error));
          await page.screenshot({ path: resolve(evidence, `${label}-failure.png`) }).catch(() => {});
        } finally { await context.close(); save(); }
      }
      if (!timingOnly) {
        const { context, page, errors } = await makeContext(browser, name, 'hokusai');
        try {
          await openBoard(page, host.origin, true, true);
          await page.locator('#stroke-speed-range').scrollIntoViewIfNeeded();
          const classic = await placement(page, `${name}-classic`);
          check(`${name}-classic/explicit-mode`, classic.minimal === 'off' && errors.length === 0, { classic, errors });
          item.classic = classic;
        } catch (error) {
          report.infrastructure.push({ name, classic: true, error: String(error.stack || error) });
          check(`${name}-classic/complete`, false, String(error.stack || error));
        } finally { await context.close(); save(); }
      }
      if (controls) {
        const { context, page, errors } = await makeContext(browser, name, 'hokusai', true);
        try {
          await openBoard(page, host.origin);
          const measured = await durations(page, `${name}-ignored-speed`);
          item.controls.push(measured);
          check(`${name}/ignored-speed-caught`, measured.slowMiddle < 1.6 && measured.middleFast < 1.6 && errors.length === 0,
            { slowMiddle: measured.slowMiddle, middleFast: measured.middleFast, errors });
        } catch (error) {
          report.infrastructure.push({ name, mutant: 'ignored-speed', error: String(error.stack || error) });
          check(`${name}/ignored-speed-complete`, false, String(error.stack || error));
        } finally { await context.close(); save(); }
      }
    } finally { await browser.close(); save(); }
  }
} finally { await host.close(); save(); }
const failures = report.rows.filter(row => !row.ok);
report.absoluteDurationsProvisional = report.loads.some(row => row.absoluteDurationProvisional);
report.timingLoadPolicy = 'Lead 1740 override: back-to-back ratios count at any logged load; absolute durations remain provisional if any sampled load exceeds20. No quiet wait or retry.';
save();
console.log(`${report.rows.length - failures.length}/${report.rows.length}; evidence ${evidence}`);
if (failures.length || report.infrastructure.length) process.exitCode = 1;
