/**
 * WP6 — the two new rows on the corridor's 変異 strip, measured on the fused
 * surface (index.html + drift-layer.js), and proved to actually reach the
 * Drift layer's tap ladder rather than merely light a button.
 *
 * What is checked, and nothing beyond it:
 *   · both rows render, in the bilingual chrome and in 日本語のみ
 *   · every button on both rows clears the 44px hit-target floor
 *   · the shipped position of each row is the one that starts pressed
 *   · pressing a position moves window.__DRIFT_TAP__ — the seam the layer reads
 *   · the layer's live behaviour follows: with 四段 pressed, the first tap on a
 *     word raises its family and reads nothing; back on 三段 it reads at once
 *   · switching out and back leaves the strip and the layer on the defaults
 *   · zero console/page errors throughout
 *
 * This file states no preference between the positions and records none.
 *
 * Usage: node probe-variant-strip.mjs [--out FILE] [--shots DIR]
 */
import { chromium } from 'playwright-core';
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import process from 'node:process';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const ROOT = resolve(arg('--root', resolve(HERE, '../../../../../prototypes/corridor')));
const OUT = arg('--out', `${process.env.TMPDIR || '/tmp'}/wp6-variant-strip.json`);
const SHOTS = arg('--shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // the FSRS vendor module is lazily imported as .mjs — served as anything
  // else the browser refuses it and the console gains an error that is the
  // harness's fault, not the page's
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer((q, r) => {
  const path = decodeURIComponent(q.url.split('?')[0]);
  const file = join(ROOT, path === '/' ? '/index.html' : path);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    r.writeHead(404);
    r.end('no');
    return;
  }
  r.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(r);
});
const base = await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)));

const results = [];
const R = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 200));
});
const cdp = await ctx.newCDPSession(page);
const touch = (t, pts) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: pts });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (n) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` });
};

async function openStrip(url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#variants-toggle', { timeout: 20000 });
  await wait(2200);
  const open = await page.evaluate(() => !!document.querySelector('#variants .vbody'));
  if (!open) await page.click('#variants-toggle');
  await page.waitForSelector('#variants .vbody', { timeout: 5000 });
  await wait(200);
}

const rowInfo = (key) =>
  page.evaluate((key) => {
    const btns = [...document.querySelectorAll(`#variants .vseg button[data-variant^="${key}:"]`)];
    if (!btns.length) return null;
    const row = btns[0].closest('.vrow');
    const label = row.querySelector('.vlabel');
    return {
      label: label.querySelector('.l-ja') ? label.querySelector('.l-ja').textContent : label.childNodes[0].textContent,
      labelText: label.textContent,
      labelEn: label.querySelector('.en-sub') ? label.querySelector('.en-sub').textContent : null,
      rowHeight: +row.getBoundingClientRect().height.toFixed(1),
      buttons: btns.map((x) => {
        const r = x.getBoundingClientRect();
        return {
          id: x.dataset.variant.split(':')[1],
          ja: x.querySelector('.l-ja') ? x.querySelector('.l-ja').textContent : x.textContent,
          en: x.querySelector('.en-sub') ? x.querySelector('.en-sub').textContent : null,
          w: +r.width.toFixed(1),
          h: +r.height.toFixed(1),
          pressed: x.getAttribute('aria-pressed') === 'true',
          onScreen: r.top >= 0 && r.bottom <= innerHeight + 0.5,
        };
      }),
    };
  }, key);

const seam = () => page.evaluate(() => (window.__DRIFT_TAP__ ? window.__DRIFT_TAP__.get() : null));

const pressRow = async (key, id) => {
  const sel = `#variants .vseg button[data-variant="${key}:${id}"]`;
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.locator(sel).click();
  await wait(300);
  // the strip re-renders on every click; re-open the body if it folded
  const open = await page.evaluate(() => !!document.querySelector('#variants .vbody'));
  if (!open) {
    await page.click('#variants-toggle');
    await wait(200);
  }
};

/* ------------------------------------------------- a live ladder in the fusion */
// DOM-only: the fused layer is an IIFE, so nothing inside it is reachable. The
// reading and the English are the painted opacity of the word's own spans.
const pickDriftWord = () =>
  page.evaluate(`(() => {
    let best = null, bd = 1e9;
    for (const el of document.querySelectorAll('#drift-layer .word')) {
      const base = el.querySelector('.base')?.textContent ?? '';
      const yomi = el.querySelector('.yomi')?.textContent ?? '';
      if (!base || !yomi) continue;
      if (el.classList.contains('lod')) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.45 || cs.pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 74 || cx > 356 || cy < 170 || cy > 660) continue;
      const d = Math.hypot(cx - 195, cy - 420);
      if (d < bd) { bd = d; best = { w: base, cx, cy }; }
    }
    return best;
  })()`);

const driftState = (w) =>
  page.evaluate(
    (w) => {
      for (const el of document.querySelectorAll('#drift-layer .word')) {
        if ((el.querySelector('.base') || {}).textContent !== w) continue;
        const r = el.getBoundingClientRect();
        return {
          present: true,
          reading: +(+getComputedStyle(el.querySelector('.yomi')).opacity).toFixed(2),
          english: +(+getComputedStyle(el.querySelector('.gloss')).opacity).toFixed(2),
          forefront: el.classList.contains('bctr'),
          sats: document.querySelectorAll('#drift-layer .word.bsat').length,
          cx: +(r.left + r.width / 2).toFixed(1),
          cy: +(r.top + r.height / 2).toFixed(1),
        };
      }
      return { present: false, sats: document.querySelectorAll('#drift-layer .word.bsat').length };
    },
    w,
  );

async function tapAt(x, y) {
  try {
    await touch('touchEnd', []);
  } catch {
    /* nothing live */
  }
  await touch('touchStart', [{ x, y }]);
  await wait(30);
  await touch('touchEnd', []);
  await wait(780);
}

// one first-tap on a fresh word, with the strip folded away so it cannot eat
// the touch; returns what that single tap painted
async function firstTapOnAWord(tag) {
  const open = await page.evaluate(() => !!document.querySelector('#variants .vbody'));
  if (open) {
    await page.click('#variants-toggle');
    await wait(300);
  }
  const w = await pickDriftWord();
  if (!w) throw new Error('no drift word to tap in the fusion');
  await tapAt(w.cx, w.cy);
  const s = await driftState(w.w);
  await shot(`${tag}`);
  await page.click('#variants-toggle');
  await wait(250);
  return { w: w.w, ...s };
}

const snapshot = {};

/* ------------------------------------------------------------- the checks */
await openStrip(`${base}/index.html`);
await shot('strip-open-bi');

for (const [key, ja, en] of [
  ['ladder', 'F 触れの段', 'tap ladder'],
  ['sattap', 'G 衛星の触れ', 'satellite tap'],
]) {
  const row = await rowInfo(key);
  snapshot[`row-${key}-bi`] = row;
  R(`strip · row "${key}" renders on the 変異 bar`, !!row && row.buttons.length === 2, row ? `${row.buttons.length} positions: ${row.buttons.map((x) => x.id).join(', ')}` : 'row missing');
  R(
    `strip · row "${key}" is labelled in both languages`,
    !!row && row.label.includes(ja) && row.labelEn === en && row.buttons.every((x) => x.ja && x.en),
    row ? `label "${row.label}" / "${row.labelEn}" · positions ${row.buttons.map((x) => `${x.ja}|${x.en}`).join(' , ')}` : 'row missing',
  );
  R(
    `strip · every "${key}" position clears the 44px target`,
    !!row && row.buttons.every((x) => x.h >= 44 && x.w >= 44 && x.onScreen),
    row ? row.buttons.map((x) => `${x.id} ${x.w}x${x.h}${x.onScreen ? '' : ' OFFSCREEN'}`).join(' · ') : 'row missing',
  );
}

{
  const l = await rowInfo('ladder');
  const s = await rowInfo('sattap');
  R(
    'strip · the shipped position is the one pressed on arrival',
    l.buttons.find((x) => x.id === 'stage3').pressed &&
      !l.buttons.find((x) => x.id === 'stage4').pressed &&
      s.buttons.find((x) => x.id === 'staged').pressed &&
      !s.buttons.find((x) => x.id === 'recenter').pressed,
    `ladder pressed=${l.buttons.filter((x) => x.pressed).map((x) => x.id)} · sattap pressed=${s.buttons.filter((x) => x.pressed).map((x) => x.id)}`,
  );
  const sm = await seam();
  snapshot['seam-on-arrival'] = sm;
  R('strip · the layer arrives holding the same reading', sm && sm.ladder === 'stage3' && sm.satTap === 'staged', JSON.stringify(sm));
}

/* 日本語のみ */
await openStrip(`${base}/index.html?ui=ja`);
for (const [key, ja] of [
  ['ladder', 'F 触れの段'],
  ['sattap', 'G 衛星の触れ'],
]) {
  const row = await rowInfo(key);
  snapshot[`row-${key}-ja`] = row;
  R(
    `strip · row "${key}" survives 日本語のみ at full size`,
    !!row && row.labelText.includes(ja) && row.labelEn === null && row.buttons.every((x) => x.h >= 44 && x.w >= 44 && x.ja),
    row ? `label "${row.labelText}" · ${row.buttons.map((x) => `${x.ja} ${x.w}x${x.h}`).join(' · ')}` : 'row missing',
  );
}
await shot('strip-open-ja');

/* the seam and the live layer follow the strip */
await openStrip(`${base}/index.html`);
const beforeSwitch = await firstTapOnAWord('fusion-stage3-firsttap');
snapshot['fusion-stage3-firsttap'] = beforeSwitch;
R(
  'fusion · on the shipped position the first tap reads the word and raises its family',
  beforeSwitch.reading === 1 && beforeSwitch.english === 0 && beforeSwitch.forefront === true && beforeSwitch.sats > 0,
  `"${beforeSwitch.w}" reading=${beforeSwitch.reading} english=${beforeSwitch.english} forefront=${beforeSwitch.forefront} satellites=${beforeSwitch.sats}`,
);

await pressRow('ladder', 'stage4');
const seam4 = await seam();
snapshot['seam-after-stage4'] = seam4;
R('strip · pressing 四段 moves the seam the layer reads', seam4 && seam4.ladder === 'stage4' && seam4.satTap === 'staged', JSON.stringify(seam4));
const afterSwitch = await firstTapOnAWord('fusion-stage4-firsttap');
snapshot['fusion-stage4-firsttap'] = afterSwitch;
R(
  'fusion · on the other position the first tap raises the family and reads nothing',
  afterSwitch.reading === 0 && afterSwitch.english === 0 && afterSwitch.forefront === true && afterSwitch.sats > 0,
  `"${afterSwitch.w}" reading=${afterSwitch.reading} english=${afterSwitch.english} forefront=${afterSwitch.forefront} satellites=${afterSwitch.sats}`,
);

await pressRow('sattap', 'recenter');
const seamBoth = await seam();
snapshot['seam-far-corner'] = seamBoth;
R('strip · both rows can stand off the shipped position at once', seamBoth && seamBoth.ladder === 'stage4' && seamBoth.satTap === 'recenter', JSON.stringify(seamBoth));

/* and back home */
await pressRow('ladder', 'stage3');
await pressRow('sattap', 'staged');
const seamHome = await seam();
snapshot['seam-home'] = seamHome;
const lHome = await rowInfo('ladder');
const sHome = await rowInfo('sattap');
R(
  'strip · switching back leaves the strip on the shipped positions',
  seamHome.ladder === 'stage3' &&
    seamHome.satTap === 'staged' &&
    lHome.buttons.find((x) => x.id === 'stage3').pressed &&
    sHome.buttons.find((x) => x.id === 'staged').pressed,
  `seam=${JSON.stringify(seamHome)} · pressed ${lHome.buttons.filter((x) => x.pressed).map((x) => x.id)}/${sHome.buttons.filter((x) => x.pressed).map((x) => x.id)}`,
);
const homeTap = await firstTapOnAWord('fusion-home-firsttap');
snapshot['fusion-home-firsttap'] = homeTap;
R(
  'fusion · nothing from the far corner survives the trip home',
  homeTap.reading === 1 && homeTap.english === 0 && homeTap.forefront === true && homeTap.sats > 0,
  `"${homeTap.w}" reading=${homeTap.reading} english=${homeTap.english} forefront=${homeTap.forefront} satellites=${homeTap.sats}`,
);

/* the URL seam agrees with the strip (the corridor's own variants pattern) */
await openStrip(`${base}/index.html?ladder=stage4&sattap=recenter`);
const seamUrl = await seam();
const lUrl = await rowInfo('ladder');
const sUrl = await rowInfo('sattap');
snapshot['seam-from-url'] = { seamUrl, ladder: lUrl.buttons.map((x) => [x.id, x.pressed]), sattap: sUrl.buttons.map((x) => [x.id, x.pressed]) };
R(
  'strip · a URL that names a position arrives with it pressed and in the layer',
  seamUrl.ladder === 'stage4' &&
    seamUrl.satTap === 'recenter' &&
    lUrl.buttons.find((x) => x.id === 'stage4').pressed &&
    sUrl.buttons.find((x) => x.id === 'recenter').pressed,
  `seam=${JSON.stringify(seamUrl)} · pressed ${lUrl.buttons.filter((x) => x.pressed).map((x) => x.id)}/${sUrl.buttons.filter((x) => x.pressed).map((x) => x.id)}`,
);

/* persistence: the strip is session-only, exactly like every row beside it */
{
  const store = await page.evaluate(() => localStorage.getItem('kairo-corridor-v1'));
  const driftStore = await page.evaluate(() => localStorage.getItem('bunki-drift-v1'));
  snapshot['stores'] = { store, driftStore };
  const parsed = store ? JSON.parse(store) : null;
  R(
    'persistence · neither row writes itself into kairo-corridor-v1 (session-only, as every row is)',
    !parsed || (!('variants' in parsed) && !('ladder' in parsed) && !('sattap' in parsed)),
    `kairo-corridor-v1 keys = ${parsed ? Object.keys(parsed).join(',') : '(unset)'} · bunki-drift-v1 keys = ${driftStore ? Object.keys(JSON.parse(driftStore)).join(',') : '(unset)'}`,
  );
  await openStrip(`${base}/index.html`);
  const seamPlain = await seam();
  const lPlain = await rowInfo('ladder');
  const sPlain = await rowInfo('sattap');
  snapshot['after-reload-plain'] = { seamPlain, ladder: lPlain.buttons.map((x) => [x.id, x.pressed]) };
  R(
    'persistence · a plain reload after standing off the defaults comes back on them',
    seamPlain.ladder === 'stage3' &&
      seamPlain.satTap === 'staged' &&
      lPlain.buttons.find((x) => x.id === 'stage3').pressed &&
      sPlain.buttons.find((x) => x.id === 'staged').pressed,
    `seam=${JSON.stringify(seamPlain)} · pressed ${lPlain.buttons.filter((x) => x.pressed).map((x) => x.id)}/${sPlain.buttons.filter((x) => x.pressed).map((x) => x.id)}`,
  );
}

R('zero console/page errors', errs.length === 0, errs.length ? errs.join(' | ') : 'none');

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
writeFileSync(OUT, JSON.stringify({ root: ROOT, at: new Date().toISOString(), results, snapshot, errs }, null, 2));
console.log(`results -> ${OUT}`);
await b.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
