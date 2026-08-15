import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = (name) =>
  readFile(new URL(`../public/${name}`, import.meta.url), "utf8");

test("stroke numbers follow the brush clock instead of appearing as a set", async () => {
  const css = await load("corridor.css");
  const js = await load("corridor.js");
  const ink = await load("corridor-ink.js");

  assert.doesNotMatch(css, /\.stroke-page\[data-numbers='on'\] \.stroke-num\s*\{[^}]*opacity/s);
  assert.match(css, /\.stroke-page\[data-numbers='off'\] \.stroke-nums\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.stroke-page\[data-living='on'\][\s\S]*?svg\.stroke-canvas[\s\S]*?background:\s*transparent/s);
  assert.match(js, /function syncStrokeNumbers\(page, shown/);
  assert.match(js, /marker\.style\.opacity\s*=\s*enabled && i < current \? '0\.92' : '0'/);
  assert.match(js, /const shown = Math\.min\(strokes\.length, ix \+ 1\)/);
  assert.match(js, /page\.dataset\.numbers\s*=\s*S\.strokeNumbers\s*\?\s*'on'\s*:\s*'off'/);
  assert.match(js, /syncStrokeNumbers\(page, 0\)[\s\S]*?inkRoom\.handle\.rewrite\(strokeRewriteOptions\(\)\)/);
  assert.equal((ink.match(/spec\.onStroke && spec\.onStroke\(0\)/g) || []).length, 0);
});

test("the living writer announces a number with the first real ink sample", async () => {
  const moduleUrl = new URL("../public/corridor-ink.js", import.meta.url);
  moduleUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { makeWriterFor } = await import(moduleUrl.href);
  const stroke = {
    dur: 100,
    L: 100,
    type: "sweep",
    medPts: [[0, 0], [100, 0]],
    cum: [0, 100],
  };
  const writer = makeWriterFor([stroke, stroke]);

  writer.start(0);
  assert.equal(writer.advance(599).beginStroke, null);
  const first = writer.advance(600);
  assert.equal(first.beginStroke, 0);
  assert.ok(first.splats.length > 0);
  writer.advance(700);
  assert.equal(writer.advance(960).beginStroke, null);
  assert.equal(writer.advance(1079).beginStroke, null);
  const second = writer.advance(1080);
  assert.equal(second.beginStroke, 1);
  assert.ok(second.splats.length > 0);
});

test("minimal writing room is a kanji-only allowlist behind one faint trigger", async () => {
  const css = await load("corridor.css");
  const js = await load("corridor.js");

  assert.match(js, /S\.strokeMinimal\s*=\s*params\.get\('minimal'\) === '1'/);
  assert.match(js, /function setStrokeChrome\(page, awake\)/);
  assert.match(js, /el\('button', 'stroke-chrome-trigger', '⋯'\)/);
  assert.match(js, /wake\.setAttribute\('aria-controls', 'stroke-awake-field'\)/);
  assert.match(js, /field\.inert\s*=\s*!S\.strokeChromeAwake/);
  assert.match(js, /if \(!S\.strokeMinimal\) roomSurface\.append\(bar\)/);
  assert.match(js, /if \(!S\.strokeMinimal\) body\.append\(khead\)/);
  assert.match(js, /if \(!S\.strokeMinimal\) body\.append\(pips\)/);
  assert.match(js, /if \(!S\.strokeMinimal\) body\.append\(hint\)/);
  assert.match(js, /if \(!S\.strokeMinimal\) body\.append\(readout\)/);
  assert.match(js, /if \(S\.strokeMinimal\) \{\s*body\.append\(strokeAwakeField\(page, k, paths, reduced\)\)/s);
  assert.match(js, /stage\.setAttribute\('role', 'img'\)/);
  assert.match(css, /\.stroke-page\[data-minimal='on'\][\s\S]*?padding:\s*0/);
  assert.match(css, /\.stroke-page\[data-chrome='sleeping'\] \[data-stroke-chrome\][\s\S]*?visibility:\s*hidden/);
  assert.match(css, /\.stroke-page\[data-minimal='on'\] \.stroke-stage,[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none/s);
  assert.match(css, /\.stroke-page\[data-minimal='on'\] \.stroke-stage \.ink-sheet[\s\S]*?-webkit-mask-image:\s*radial-gradient/s);
  assert.match(css, /\.stroke-page\[data-minimal='on'\]\[data-chrome='sleeping'\] \.stroke-nums\s*\{[^}]*display:\s*none !important/s);
  assert.match(css, /\.stroke-chrome-trigger\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
});

test("the wake field exposes the exact ten reference palettes, full readings, and only stroke numbers", async () => {
  const js = await load("corridor.js");
  const themeBlock = js.match(/const THEME_UI = \[([\s\S]*?)\n\];/)?.[1] || "";
  const paletteBlock = js.match(/const WRITING_PALETTE_IDS = \[([\s\S]*?)\n\];/)?.[1] || "";
  const paletteIds = [...paletteBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const seals = new Map(
    [...themeBlock.matchAll(/\{ id: '([^']+)', seal: '([^']+)'/g)].map((match) => [match[1], match[2]]),
  );

  assert.equal((themeBlock.match(/\{ id:/g) || []).length, 11);
  assert.deepEqual(paletteIds, [
    "sumi",
    "shu",
    "iwa",
    "rokusho",
    "yoru",
    "hokusai",
    "akafuji",
    "nami",
    "keyblock",
    "hakuu",
  ]);
  assert.equal(paletteIds.map((id) => seals.get(id)).join(""), "墨朱柿漆金藍赤浪板雷");
  assert.match(js, /field\.id = 'stroke-awake-field'/);
  assert.match(js, /for \(const id of WRITING_PALETTE_IDS\)/);
  assert.match(js, /THEME_UI\.find\(\(world\) => world\.id === id\)/);
  assert.match(js, /void requestKairoTheme\(t\.id\)/);
  assert.match(js, /strokeReadingRow\('音読み', 'on', k\?\.on, 'on'\)/);
  assert.match(js, /strokeReadingRow\('訓読み', 'kun', k\?\.kun, 'kun'\)/);
  assert.doesNotMatch(js, /k\.on\.slice\(0,\s*2\)/);
  assert.doesNotMatch(js, /k\?\.kun[^\n]*\.slice\(0,\s*2\)/);
  assert.match(js, /strokeNumbersControl\(page, paths, reduced\)/);
  assert.match(js, /numbers\.classList\.add\('stroke-number-choice'\)/);
  assert.match(js, /field\.append\(palettes, readings, numbers\)/);
});

test("restored 朱・板・雷 worlds have real ink, paper, stills, and app tokens", async () => {
  const css = await load("corridor.css");
  const js = await load("corridor.js");

  for (const id of ["shu", "keyblock", "hakuu"]) {
    assert.match(css, new RegExp(`:root\\[data-theme='${id}'\\]\\s*\\{`));
    assert.match(js, new RegExp(`\\n  ${id}: \\{ pal:`));
  }
  assert.match(js, /shu: \{ pal: \{ mode: 0, low: \[0\.95, 0\.52, 0\.38\], high: \[0\.62, 0\.14, 0\.1\]/);
  assert.match(js, /keyblock: \{ pal: \{ mode: 0, low: \[0\.512, 0\.448, 0\.352\]/);
  assert.match(js, /hakuu: \{ pal: \{ mode: 1, low: \[0\.42, 0\.3, 0\.1\]/);
  assert.match(js, /still: iw\.still \|\| world\.ink/);
  assert.match(js, /shell: 17/);
  assert.match(js, /storm: 43/);
  assert.equal((js.match(/(?:kind|world\.paper) === 'shell'/g) || []).length, 2);
  assert.equal((js.match(/(?:kind|world\.paper) === 'storm'/g) || []).length, 2);
  assert.match(js, /\['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'\]/);
  assert.match(js, /const DRIFT_THEME_BY_WORLD = \{/);
  assert.doesNotMatch(js, /__DRIFT__\.setTheme\(themeIx\(\)\)/);
});

test("normal writing is subtly faster without changing slow mode", async () => {
  const js = await load("corridor.js");
  const ink = await load("corridor-ink.js");

  assert.match(js, /S\.strokeSlow\s*\?\s*\{\s*speed:\s*0\.7,\s*iterations:\s*1\s*\}\s*:\s*\{\s*speed:\s*1,\s*iterations:\s*1\.1\s*\}/s);
  assert.match(ink, /iterationCarry\s*\+=\s*iterations\s*\*\s*scale/);
});

test("paper fibers follow a natural biased grain", async () => {
  const js = await load("corridor.js");

  assert.equal((js.match(/const along = r\(\) < 0\.72;/g) || []).length, 2);
  assert.equal((js.match(/g\.lineCap = 'round';/g) || []).length, 2);
});
