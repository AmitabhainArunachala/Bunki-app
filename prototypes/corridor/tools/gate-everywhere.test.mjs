// The gate on every bar (frame, 2026-11-10). John: the three marks at the top of the first screen are "the TOORI, and
// portal to the menu and navigation the whole app"; "we need a bar but the whole top is quite crowded". In the current
// layout with the five tabs every bar carries the first screen's torii at the screen's centre, opening the same menu
// over the screen it stands on; the bar holds Back, the gate, search and the language (and Save in an article); the cap
// and the bookmark leave it while the tabs show, the bookmark's count moving to the Today tab; the look moves into the
// menu; the language is one compact control; Back says Back everywhere; the trail row waits for a second step.
// The ear (B2, 2026-11-11) stands beside every bar's gate, as the design lead placed it (design/ear), and clears the gate
// like every other control.
// Served from the source folder at 390x844 (touch) and 1440x900, Chromium only, silent (--mute-audio, media muted,
// speech stubbed). Run: node --test prototypes/corridor/tools/gate-everywhere.test.mjs
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(CORRIDOR, '../../package.json'))('playwright-core');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
// John's Mac window (about 1728 wide), the phone, a smaller Mac window; the wide one again with the interface in 日本語
const WIDE = { viewport: { width: 1728, height: 1050 }, deviceScaleFactor: 1 };
const SIZES = [['1728', WIDE, 'bi'], ['390', PHONE, 'bi'], ['1440', DESK, 'bi'], ['1728ja', WIDE, 'ja']];
const withLang = (address, lang) => (lang === 'bi' ? address : `${address}${address ? '&' : '?'}ui=ja`);
const ARTICLE = 'wikinews:1403';
// [name, address, the bar's visible controls in order]
const SCREENS = [
  ['today', '?room=tray', ['back', 'bar-gate', 'ear-spot', 'chrome-search', 'lang']],
  ['read', '?room=shelf', ['back', 'bar-gate', 'ear-spot', 'chrome-search', 'lang']],
  ['article', `?read=${ARTICLE}`, ['back', 'bar-gate', 'ear-spot', 'chrome-search', 'lang', 'chrome-keep']],
  ['learn', '?room=dojo', ['back', 'bar-gate', 'ear-spot', 'chrome-search', 'lang']],
  ['words', '?room=search', ['back', 'bar-gate', 'ear-spot', 'lang']],
  ['me', '?room=me', ['back', 'bar-gate', 'ear-spot', 'chrome-search', 'lang']],
  ['word', `?read=${ARTICLE}&word=開催`, ['sheet-back', 'sheet-gate', 'ear-spot', 'sheet-search', 'sheet-take']],
  ['kanji', '?room=shelf&kanji=産', ['sheet-back', 'sheet-gate', 'ear-spot', 'sheet-search', 'sheet-take']],
];

let server, base, browser;
const contexts = [];
before(async () => {
  server = createServer((request, response) => {
    const path = decodeURIComponent((request.url || '/').split('?')[0]);
    const file = resolve(CORRIDOR, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
    if (!file.startsWith(CORRIDOR) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
});
after(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  await new Promise((done) => server?.close(done) ?? done());
});

async function open(device, address, { wait = null, places = false } = {}) {
  const context = await browser.newContext({ ...device, locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  contexts.push(context);
  await silenceBrowserAudio(context);
  await context.addInitScript((places) => {
    if (globalThis.speechSynthesis) Object.getPrototypeOf(globalThis.speechSynthesis).speak = function () {};
    try {
      localStorage.setItem('bunki-prototype:intro-dismissed:v1', '1');
      // the layout under test, as Settings or ?layout=places keeps it on this device
      if (places) localStorage.setItem('kairo-layout', 'places');
    } catch { /* storage may be blocked */ }
  }, places);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error)));
  await goto(page, address, wait);
  return { page, errors };
}
async function goto(page, address, wait = null) {
  await page.goto(base + address, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  if (wait) await page.locator(wait).waitFor();
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
}

/** The bar on top (the page's bar when a page stands, else the room's): its visible controls and their boxes. */
function readBar() {
  const shown = (node) => {
    if (!node.getClientRects().length) return false;
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 1 && box.height > 1;
  };
  const bar = document.querySelector('#sheet > .sheet-bar') || document.querySelector('#app > .chrome');
  if (!bar) return null;
  const box = (node) => { const r = node.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const items = [...bar.children].filter(shown).map((node) => ({ id: node.id || node.className, ...box(node) }));
  const gate = bar.querySelector(':scope > .bar-gate');
  return {
    which: bar.matches('.sheet-bar') ? 'sheet' : 'room', bar: box(bar), items, width: innerWidth,
    gate: gate && { ...box(gate), label: gate.getAttribute('aria-label'), expanded: gate.getAttribute('aria-expanded'), tag: gate.tagName },
  };
}

// One pass over the eight screens at every size; the first three cases read it.
const seen = {};
const skyGateX = {};
let surveyed = null;
const survey = () => (surveyed ||= (async () => {
  for (const [deviceName, device, lang] of SIZES) {
    const { page, errors } = await open(device, withLang('', lang));
    await page.locator('#ginga-symbol').waitFor();
    const sky = await page.evaluate(() => {
      const gate = document.getElementById('ginga-symbol').getBoundingClientRect();
      return {
        x: (gate.left + gate.right) / 2, label: document.getElementById('ginga-symbol').getAttribute('aria-label'),
        seal: !!document.getElementById('ginga-theme-seal'), barGates: document.querySelectorAll('.bar-gate').length,
      };
    });
    skyGateX[deviceName] = sky;
    for (const [name, address, controls] of SCREENS) {
      await goto(page, withLang(address, lang), controls[0] === 'sheet-back' ? '#sheet' : null);
      seen[`${name}@${deviceName}`] = { controls, bar: await page.evaluate(readBar) };
    }
    seen[`errors@${deviceName}`] = errors.slice();
  }
})());

test('the first screen keeps its own gate and seal, and carries no bar gate', async () => {
  await survey();
  for (const [device] of SIZES) {
    assert.equal(skyGateX[device].seal, true, `${device}: the first screen keeps its seal`);
    assert.equal(skyGateX[device].barGates, 0, `${device}: the first screen has no bar gate`);
    assert.match(skyGateX[device].label, /navigation|ナビ/);
  }
});

test('every bar carries the gate at the first screen\'s x, named as the first screen\'s gate', async () => {
  await survey();
  for (const [name] of SCREENS) for (const [device] of SIZES) {
    const { bar } = seen[`${name}@${device}`];
    assert.ok(bar, `${name}@${device}: a bar`);
    assert.ok(bar.gate, `${name}@${device}: the ${bar.which} bar carries the gate`);
    assert.equal(bar.gate.tag, 'BUTTON', `${name}@${device}: the gate is a real button`);
    assert.equal(bar.gate.label, skyGateX[device].label, `${name}@${device}: the same name as the first screen's gate`);
    assert.equal(bar.gate.expanded, 'false', `${name}@${device}: aria-expanded`);
    const x = (bar.gate.l + bar.gate.r) / 2;
    assert.ok(Math.abs(x - skyGateX[device].x) <= 1, `${name}@${device}: gate x ${x} vs first screen ${skyGateX[device].x}`);
    assert.ok(bar.gate.t >= bar.bar.t - 0.5 && bar.gate.b <= bar.bar.b + 0.5, `${name}@${device}: the gate sits inside its bar`);
  }
  for (const [device] of SIZES) assert.deepEqual(seen[`errors@${device}`], [], `${device}: no page errors`);
});

test('the bar holds Back, the gate, search and the language (and Save in an article), and nothing overlaps the gate', async () => {
  await survey();
  for (const [name] of SCREENS) for (const [device] of SIZES) {
    const { controls, bar } = seen[`${name}@${device}`];
    assert.deepEqual(bar.items.map((item) => item.id), controls, `${name}@${device}: the bar's controls, in order`);
    for (const item of bar.items) {
      assert.ok(item.l >= -0.5 && item.r <= bar.width + 0.5, `${name}@${device}: ${item.id} stays on the screen`);
      if (item.id === controls[1]) continue;
      assert.ok(item.r <= bar.gate.l || item.l >= bar.gate.r, `${name}@${device}: ${item.id} [${item.l}, ${item.r}] clears the gate [${bar.gate.l}, ${bar.gate.r}]`);
    }
  }
});

test('in Japanese and with a touched word the article bar still clears the gate at 390', async () => {
  const { page } = await open(PHONE, `?read=${ARTICLE}&ui=ja`);
  await page.locator('.reader .tok.content').first().waitFor();
  await page.locator('#mini').waitFor({ timeout: 2500 }).catch(() => {});
  await page.keyboard.press('Escape');
  // a touched word: the bar's Save names it (Save 開催), so it is at its longest
  await page.locator('.reader .tok.content').nth(3).click();
  await page.locator('#chrome-keep:not([data-save-rest])').waitFor({ state: 'attached' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  for (const lang of ['ja', 'bi']) {
    const bar = await page.evaluate(readBar);
    assert.deepEqual(bar.items.map((item) => item.id), SCREENS[2][2], `${lang}: the article bar's controls`);
    for (const item of bar.items) {
      assert.ok(item.l >= -0.5 && item.r <= bar.width + 0.5, `${lang}: ${item.id} stays on the screen`);
      if (item.id !== 'bar-gate') assert.ok(item.r <= bar.gate.l || item.l >= bar.gate.r, `${lang}: ${item.id} clears the gate`);
    }
    const lang52 = bar.items.find((item) => item.id === 'lang');
    assert.ok(lang52.r - lang52.l <= 52.5, `${lang}: the language control is at most 52 px (${lang52.r - lang52.l})`);
    if (lang === 'ja') { await page.locator('#lang button').click(); await page.waitForTimeout(400); }
  }
});

test('the gate opens the same menu over an article, and closing it keeps the place', async () => {
  const { page } = await open(PHONE, `?read=${ARTICLE}`);
  await page.locator('.reader .tok.content').first().waitFor();
  await page.locator('#mini').waitFor({ timeout: 2500 }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(300);
  const y = await page.evaluate(() => window.scrollY);
  assert.ok(y > 300, 'the article is scrolled');
  // by keyboard: Enter opens, Escape closes, focus comes home
  await page.locator('#bar-gate').focus();
  await page.keyboard.press('Enter');
  await page.locator('#gate-menu .nav-bar').waitFor();
  const menu = await page.evaluate(() => ({
    expanded: document.getElementById('bar-gate').getAttribute('aria-expanded'),
    label: document.getElementById('bar-gate').getAttribute('aria-label'),
    controls: ['#nav-search-door', '#nav-review', '#gate-menu .nav-dojo', '#gate-menu .bubble-shelf', '#gate-menu .bubble-sensei', '#nav-look']
      .filter((sel) => document.querySelector(sel)?.getClientRects().length),
    rows: [...document.querySelectorAll('#gate-menu .gate-panel .nav-station')].map((row) => row.id || row.className.replace('nav-station ', '')),
    current: document.querySelector('#gate-menu .nav-station[aria-current="page"]')?.id,
    loose: document.querySelectorAll('#gate-menu .corner-bubble').length,
    langs: document.querySelectorAll('#lang').length,
    focus: document.activeElement?.id,
    view: document.body.dataset.view,
  }));
  assert.equal(menu.expanded, 'true');
  assert.match(menu.label, /close navigation/);
  assert.deepEqual(menu.controls, ['#nav-search-door', '#nav-review', '#gate-menu .nav-dojo', '#gate-menu .bubble-shelf', '#gate-menu .bubble-sensei', '#nav-look']);
  // one panel: the five places, then Review, Focus, Tutor, Orbit, the look and the language; nothing loose in the corners
  assert.deepEqual(menu.rows, ['nav-today', 'nav-read', 'nav-learn', 'nav-words', 'nav-me',
    'nav-review', 'nav-dojo', 'bubble-sensei', 'orbit-preview-door', 'nav-look', 'nav-lang']);
  assert.equal(menu.current, 'nav-read', 'an article is in Read');
  assert.equal(menu.loose, 0);
  assert.equal(menu.langs, 1, 'one #lang on the screen');
  assert.equal(menu.focus, 'nav-search-door', 'opened from the keyboard, the look-up field takes the keys');
  assert.equal(menu.view, 'reader');
  await page.keyboard.press('Escape');
  await page.locator('#gate-menu').waitFor({ state: 'detached' });
  const closed = await page.evaluate(() => ({
    y: window.scrollY, view: document.body.dataset.view, focus: document.activeElement?.id,
    expanded: document.getElementById('bar-gate').getAttribute('aria-expanded'),
  }));
  assert.deepEqual(closed, { y, view: 'reader', focus: 'bar-gate', expanded: 'false' });
  // by touch: the gate opens it with nothing focused, a tap outside closes it
  await page.locator('#bar-gate').tap();
  await page.locator('#gate-menu .nav-bar').waitFor();
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#gate-menu')), false, 'a pointer leaves nothing focused');
  await page.touchscreen.tap(195, 830);
  await page.locator('#gate-menu').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.scrollY), y, 'the article stays where it was');
  // a door in the menu works from here: review opens Today
  await page.locator('#bar-gate').tap();
  await page.locator('#nav-review').tap();
  await page.waitForFunction(() => document.body.dataset.view === 'tray');
  assert.equal(await page.locator('#gate-menu').count(), 0, 'the menu leaves with the room');
});

test('the menu is one panel: at most 560 px and centred under the gate on a wide screen, the full width under the bar on a phone', async () => {
  for (const [device, size] of [['1728', WIDE], ['390', PHONE], ['1440', DESK]]) {
    const { page } = await open(size, '?room=me');
    await page.locator('#bar-gate').click();
    await page.locator('#gate-menu .gate-panel').waitFor();
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
      const panel = document.querySelector('#gate-menu .gate-panel').getBoundingClientRect();
      const gate = document.getElementById('bar-gate').getBoundingClientRect();
      const bar = document.querySelector('#app > .chrome').getBoundingClientRect();
      return { l: panel.left, r: panel.right, t: panel.top, b: panel.bottom, gx: (gate.left + gate.right) / 2, barB: bar.bottom, h: innerHeight,
        current: document.querySelector('#gate-menu .nav-station[aria-current="page"]')?.id };
    });
    assert.equal(box.current, 'nav-me', `${device}: Me is marked as the place you are in`);
    assert.ok(box.b <= box.h + 0.5, `${device}: the panel ends on the screen`);
    if (device === '390') {
      assert.ok(box.l <= 0.5 && box.r >= 389.5, `${device}: the full width (${box.l}..${box.r})`);
      assert.ok(Math.abs(box.t - box.barB) <= 1, `${device}: right under the bar (${box.t} vs ${box.barB})`);
    } else {
      assert.ok(box.r - box.l <= 560.5, `${device}: at most 560 px (${box.r - box.l})`);
      assert.ok(Math.abs((box.l + box.r) / 2 - box.gx) <= 1, `${device}: centred under the gate`);
      assert.ok(box.t >= box.barB, `${device}: under the bar`);
    }
    if (device === '1440') {
      // the language row changes the language and the menu stays where it stood
      await page.locator('#nav-lang').click();
      await page.waitForFunction(() => !document.body.classList.contains('ui-bi'));
      assert.equal(await page.locator('#gate-menu #nav-lang .nav-station-v').innerText(), '日本語');
      await page.locator('#nav-lang').click();
      await page.waitForFunction(() => document.body.classList.contains('ui-bi'));
      assert.equal(await page.locator('#gate-menu').count(), 1);
    }
    await page.keyboard.press('Escape');
    await page.locator('#gate-menu').waitFor({ state: 'detached' });
  }
  // the first screen's gate opens the same panel, and the same keys close it
  const { page } = await open(PHONE, '');
  await page.locator('#ginga-symbol').tap();
  await page.locator('.gate-panel').waitFor();
  const sky = await page.evaluate(() => ({
    rows: document.querySelectorAll('.gate-panel .nav-station').length, loose: document.querySelectorAll('#app .corner-bubble').length,
    shelf: !!document.querySelector('.gate-panel .bubble-shelf'),
  }));
  assert.deepEqual(sky, { rows: 11, loose: 0, shelf: true });
  await page.keyboard.press('Escape');
  await page.locator('.gate-panel').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#ginga-symbol').getAttribute('aria-expanded'), 'false');
});

test('over a word page the menu stands above the page, and closing it keeps the page', async () => {
  const { page } = await open(PHONE, `?read=${ARTICLE}&word=開催`, { wait: '#sheet' });
  await page.evaluate(() => { document.getElementById('sheet').scrollTop = 260; });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ node: document.getElementById('sheet').dataset.node, top: document.getElementById('sheet').scrollTop }));
  assert.ok(before.top > 100, 'the page is scrolled');
  await page.locator('#sheet-gate').tap();
  await page.locator('#gate-menu .nav-bar').waitFor();
  const onTop = await page.evaluate(() => {
    // hit testing passes over inert nodes, so the page under the menu is made live for the one look at what is painted on top
    const sheet = document.getElementById('sheet'), box = document.querySelector('#gate-menu .nav-bar').getBoundingClientRect();
    sheet.inert = false;
    const hits = [[0.5, 0.5], [0.1, 0.9], [0.9, 0.2]].map(([x, y]) => !!document.elementFromPoint(box.left + box.width * x, box.top + box.height * y)?.closest('#gate-menu'));
    sheet.inert = true;
    return { onTop: hits.every(Boolean), expanded: document.getElementById('sheet-gate').getAttribute('aria-expanded') };
  });
  assert.deepEqual(onTop, { onTop: true, expanded: 'true' });
  await page.keyboard.press('Escape');
  await page.locator('#gate-menu').waitFor({ state: 'detached' });
  const after = await page.evaluate(() => ({
    node: document.getElementById('sheet')?.dataset.node, top: document.getElementById('sheet')?.scrollTop,
    focus: document.activeElement?.id, inert: document.getElementById('sheet')?.inert,
  }));
  assert.deepEqual(after, { ...before, focus: 'sheet-gate', inert: false });
});

test('the look moves into the menu and opens the same picker', async () => {
  const { page } = await open(DESK, '?room=dojo');
  assert.equal(await page.locator('#app > .chrome #theme-seal').count(), 0, 'no seal in the bar');
  await page.locator('#bar-gate').click();
  const look = page.locator('#nav-look');
  await look.waitFor();
  assert.match(await look.innerText(), /look/i);
  assert.equal(await page.locator('#nav-look #theme-seal').count(), 1, 'the row carries the current seal');
  await look.click();
  await page.locator('.world-picker').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.world-picker').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'nav-look', 'focus returns to the row');
  assert.equal(await page.locator('#gate-menu').count(), 1, 'the menu is still open');
  await page.keyboard.press('Escape');
  await page.locator('#gate-menu').waitFor({ state: 'detached' });
});

test('the cap and the bookmark leave the bar with the tabs; the saved count moves to Today; without tabs they stay', async () => {
  const { page } = await open(PHONE, '?room=shelf');
  const bar = () => page.evaluate(() => ({
    cap: !!document.querySelector('#app > .chrome #chrome-dojo'), bookmark: !!document.querySelector('#app > .chrome #tray'),
    tabs: !!document.querySelector('#primary-tabs'), count: document.querySelector('#tab-today .station-kept')?.textContent ?? null,
    name: document.getElementById('tab-today')?.getAttribute('aria-label') || '',
  }));
  assert.deepEqual(await bar(), { cap: false, bookmark: false, tabs: true, count: null, name: '' });
  await page.evaluate(async () => {
    const app = await import('/corridor.js');
    app.S.taken.push(...['開催', '世界', '遺産'].map((id, i) => ({ t: 'word', id, ts: Date.now() - i })));
    app.render();
  });
  const kept = await bar();
  assert.equal(kept.count, '3');
  assert.match(kept.name, /3 saved words/);
  // where the tabs do not show (a page over the first screen), the bar keeps both doors
  await goto(page, '?kanji=産', '#sheet');
  const sky = await bar();
  assert.equal(sky.tabs, false);
  assert.equal(sky.cap, true);
  assert.equal(sky.bookmark, true);
  // a screen with neither tabs nor a trail (the Field front door) keeps the room's name in the bar, short of the gate
  const field = await open(DESK, '?entry=field');
  const named = await field.page.evaluate(() => {
    const crumb = document.querySelector('#app > .chrome > .crumb').getBoundingClientRect();
    const gate = document.querySelector('#app > .chrome > .bar-gate').getBoundingClientRect();
    return { tabs: document.body.classList.contains('has-primary-tabs'), trail: !!document.querySelector('#app > .scale-thread'),
      width: crumb.width, clear: crumb.right <= gate.left, text: document.querySelector('#app > .chrome > .crumb').textContent };
  });
  assert.equal(named.tabs, false);
  assert.equal(named.trail, false);
  assert.ok(named.width > 10 && named.clear && named.text === 'Field', JSON.stringify(named));
});

test('the language switch is one compact control that still switches', async () => {
  const { page } = await open(PHONE, '?room=shelf');
  const read = () => page.evaluate(() => {
    const lang = document.getElementById('lang');
    const buttons = [...lang.querySelectorAll('button')].filter((node) => node.getClientRects().length);
    return {
      role: lang.getAttribute('role'), name: lang.getAttribute('aria-label'), shown: buttons.length,
      text: buttons[0]?.textContent, width: lang.getBoundingClientRect().width, bi: document.body.classList.contains('ui-bi'),
    };
  });
  const en = await read();
  assert.equal(en.role, 'group');
  assert.equal(en.name, 'Interface language');
  assert.equal(en.shown, 1);
  assert.equal(en.text, 'EN');
  assert.ok(en.width <= 52.5, `EN width ${en.width}`);
  await page.locator('#lang button').tap();
  await page.waitForFunction(() => !document.body.classList.contains('ui-bi'));
  const ja = await read();
  assert.equal(ja.text, '日本語');
  assert.equal(ja.shown, 1);
  assert.ok(ja.width <= 52.5, `日本語 width ${ja.width}`);
  await page.locator('#lang button').tap();
  await page.waitForFunction(() => document.body.classList.contains('ui-bi'));
  assert.equal((await read()).text, 'EN');
});

test('Back says Back in every bar, and the trail row waits for a second step', async () => {
  const { page } = await open(PHONE, `?read=${ARTICLE}`);
  const back = (sel) => page.evaluate((sel) => {
    const word = document.querySelector(`${sel} .l-ja`);
    const box = word?.getBoundingClientRect();
    return word && box.width > 10 && getComputedStyle(word).clipPath === 'none' ? word.textContent : null;
  }, sel);
  const thread = () => page.evaluate(() => [...document.querySelectorAll('#app > .scale-thread')].filter((node) => node.getClientRects().length).length);
  assert.equal(await back('#back'), 'Back', 'the article bar says Back');
  assert.equal(await thread(), 1, 'the article keeps its trail');
  await goto(page, '?room=shelf');
  assert.equal(await thread(), 0, 'the Read tab alone has no trail row');
  assert.equal(await back('#back'), 'Back');
  await goto(page, `?read=${ARTICLE}&word=開催`, '#sheet');
  assert.equal(await back('#sheet-back'), 'Back', 'the word page says Back');
});

// The layout under test (?layout=places) gets the same gate and the same panel: its bar becomes Back, the gate, search
// (its name stays on a wide screen, short of the gate); the panel lists its own five places and, since Review is one of
// them, does not say Review twice.
const PLACES_SCREENS = [
  ['review', '?room=dojo', ['back', 'bar-gate', 'ear-spot', 'chrome-search']],
  ['bookshelf', '?room=shelf', ['back', 'bar-gate', 'ear-spot', 'chrome-search']],
  ['article', `?read=${ARTICLE}`, ['back', 'bar-gate', 'ear-spot', 'chrome-search', 'chrome-keep']],
  ['kanji', '?room=shelf&kanji=産', ['sheet-back', 'sheet-gate', 'ear-spot', 'sheet-search', 'sheet-take']],
];
test('the layout under test: the gate on every bar, the same panel with its own places, the place kept', async () => {
  for (const [device, size] of [['1728', WIDE], ['390', PHONE]]) {
    const { page, errors } = await open(size, '', { places: true });
    await page.locator('#ginga-symbol').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.layout), 'places');
    const skyX = await page.evaluate(() => { const r = document.getElementById('ginga-symbol').getBoundingClientRect(); return (r.left + r.right) / 2; });
    // the first screen's gate opens the same panel
    await page.locator('#ginga-symbol').click();
    await page.locator('.gate-panel').waitFor();
    const rows = await page.evaluate(() => [...document.querySelectorAll('.gate-panel .nav-station')].map((row) => row.id || row.className.replace('nav-station ', '')));
    assert.deepEqual(rows, ['nav-review', 'nav-bookshelf', 'nav-dictionary', 'nav-tests', 'nav-progress',
      'nav-dojo', 'bubble-sensei', 'orbit-preview-door', 'nav-look', 'nav-lang'], `${device}: the places, then the doors that are not places`);
    assert.equal(await page.locator('#app .corner-bubble').count(), 0, `${device}: nothing loose in the corners`);
    await page.keyboard.press('Escape');
    await page.locator('.gate-panel').waitFor({ state: 'detached' });
    for (const [name, address, controls] of PLACES_SCREENS) {
      await goto(page, address, controls[0] === 'sheet-back' ? '#sheet' : null);
      const bar = await page.evaluate(readBar);
      const ids = bar.items.map((item) => item.id).filter((id) => !/crumb|chrome-level/.test(id));
      assert.deepEqual(ids, controls, `${name}@${device}: the bar's controls`);
      assert.ok(Math.abs((bar.gate.l + bar.gate.r) / 2 - skyX) <= 1, `${name}@${device}: the gate at the first screen's x`);
      for (const item of bar.items) if (!/gate/.test(item.id)) {
        assert.ok(item.r <= bar.gate.l || item.l >= bar.gate.r, `${name}@${device}: ${item.id} [${item.l}, ${item.r}] clears the gate`);
      }
    }
    // over an article: opens, closes, the place kept
    await goto(page, `?read=${ARTICLE}`);
    await page.locator('#mini').waitFor({ timeout: 2500 }).catch(() => {});
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(300);
    const y = await page.evaluate(() => window.scrollY);
    await page.locator('#bar-gate').click();
    await page.locator('#gate-menu .gate-panel').waitFor();
    assert.equal(await page.locator('#gate-menu .nav-station[aria-current="page"]').getAttribute('id'), 'nav-bookshelf');
    await page.keyboard.press('Escape');
    await page.locator('#gate-menu').waitFor({ state: 'detached' });
    const after = await page.evaluate(() => ({ y: window.scrollY, view: document.body.dataset.view, focus: document.activeElement?.id }));
    assert.deepEqual(after, { y, view: 'reader', focus: 'bar-gate' }, `${device}: the article stays where it was`);
    assert.deepEqual(errors, [], `${device}: no page errors`);
  }
});
