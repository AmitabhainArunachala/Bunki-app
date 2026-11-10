#!/usr/bin/env node
/** The everything-on prototype's own check (integrate/everything-on-20261110).
 *
 * Drives a SERVED build the way a learner does, in headless Chromium (Playwright's chromium.launch() only: a hand-spawned
 * Chrome raises Keychain dialogs). It opens prototype.html, presses every door on it, and proves that the feature behind
 * the door shows; for quests it goes on to start one. A door on the page with no check here fails, so a new door cannot
 * be added without its proof. Every check starts from an empty browser profile that is thrown away. No file is written
 * unless --shots is given. Product code is not changed.
 *
 *   node prototypes/corridor/tools/check-everything-on.mjs                       http://127.0.0.1:18841/
 *   node prototypes/corridor/tools/check-everything-on.mjs --base <url>          another address
 *   node prototypes/corridor/tools/check-everything-on.mjs --only quests,places  some checks only
 *   node prototypes/corridor/tools/check-everything-on.mjs --shots <dir>         a screenshot per door
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://127.0.0.1:18841/').replace(/\/?$/, '/');
const ONLY = arg('--only', '').split(',').filter(Boolean);
const SHOTS = arg('--shots', '');
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
const { chromium } = createRequire(join(repo, 'package.json'))('playwright-core');
const ORIGIN = new URL(BASE).origin;

const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const results = [];
const browser = await chromium.launch({ headless: true });

async function fresh(device = DESKTOP) {
  const context = await browser.newContext({ ...device, locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => problems.push(`uncaught: ${String(e.message || e).slice(0, 240)}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()} ${r.url().replace(ORIGIN, '')}`); });
  page.on('requestfailed', (r) => {
    // the app reads only the head of build-identity.json and drops the rest; a frame swapped out mid-load aborts its own fetches
    if (r.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`request failed: ${r.failure()?.errorText} ${r.url().replace(ORIGIN, '')}`);
  });
  return { context, page, problems };
}
const ready = (page) => page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
const view = (page) => page.evaluate(() => document.body.dataset.view);
const text = (page, selector, n = 400) => page.evaluate(([selector, n]) => (document.querySelector(selector)?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, n), [selector, n]);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(resolve(SHOTS), `${name}.png`) }); };
const must = (ok, message) => { if (!ok) throw new Error(message); };

async function check(name, expected, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const session = await fresh();
  const row = { check: name, expected, pass: false, detail: '' };
  try {
    row.detail = String((await fn(session)) || '');
    row.pass = session.problems.length === 0;
    if (!row.pass) row.detail += ` | FIRST ERROR: ${session.problems[0]}${session.problems.length > 1 ? ` (+${session.problems.length - 1} more)` : ''}`;
  } catch (error) {
    row.detail = `did not work: ${String(error.message || error).split('\n')[0].slice(0, 300)}`;
    if (session.problems.length) row.detail += ` | FIRST ERROR: ${session.problems[0]}`;
    if (SHOTS) await session.page.screenshot({ path: join(resolve(SHOTS), `FAILED-${name}.png`) }).catch(() => {});
  }
  await session.context.close();
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${name}: ${row.detail}`);
}

/** press a door on the doors page, as the learner does, and wait for the app behind it */
async function throughDoor(page, door, { app = true } = {}) {
  await page.goto(`${BASE}prototype.html`, { waitUntil: 'load' });
  const link = page.locator(`a[data-door="${door}"]`);
  must(await link.count() === 1, `the doors page has ${await link.count()} links for "${door}"`);
  const label = (await link.innerText()).replace(/\s+/g, ' ').trim();
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), link.click()]);
  if (app) await ready(page);
  return label;
}
/** the word page of a kanji or word through the Words search, as the learner walk does for 門 */
async function searchOpen(page, query, rowText) {
  await page.locator('#nav-search-input').fill(query);
  const hit = page.locator('.nav-search-row', { hasText: rowText }).first();
  await hit.waitFor();
  await hit.click();
  await page.locator('#sheet').waitFor();
  await page.waitForTimeout(900);
}
/** 職業 as it stands in the essay the door opened: the word's box, then its page */
async function quesWordFromReader(page) {
  await page.waitForFunction(() => document.body.dataset.view === 'reader', null, { timeout: 30000 });
  await page.locator('.reader .tok.content').first().waitFor();
  // a fresh record gets the app's one-time demonstration: the first word's box opens by itself
  if (await page.locator('#mini').waitFor({ timeout: 2500 }).then(() => true, () => false)) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  const token = page.locator('.tok.content[data-word="職業"]').first();
  await token.scrollIntoViewIfNeeded();
  let taps = 0;
  while (taps < 4 && !(await page.locator('#mini').isVisible().catch(() => false))) { await token.click(); taps += 1; await page.waitForTimeout(700); }
  await page.locator('#mini .mini-word').click();
  await page.locator('#sheet').waitFor();
  await page.waitForTimeout(900);
  return taps;
}
const doorTexts = (page) => page.evaluate(() => Object.fromEntries(['kanji-course-unit-door', 'kanji-room-door', 'kanji-quest-door']
  .map((id) => [id, document.getElementById(id)?.textContent.trim() ?? null])));
const frameOf = async (page, deck) => {
  let frame = null;
  for (let i = 0; i < 150 && !frame; i += 1) {
    frame = page.frames().find((f) => f.url().includes(`shared-frame.html?deck=${deck}`)) || null;
    if (!frame) await page.waitForTimeout(200);
  }
  must(frame, `no study frame for the ${deck} deck after 30 s`);
  await frame.waitForFunction(() => /NIHONGO STUDY/.test(document.body?.innerText || ''), null, { timeout: 30000 });
  return frame;
};

// ---------------------------------------------------------------------------------------------------------------------
const CHECKED = new Set(['app']);
const door = (name, expected, fn) => { CHECKED.add(name); return check(name, expected, fn); };

await check('doors-page', 'the doors page is served, reads at phone width, and every door says preview', async ({ page, context }) => {
  const response = await page.goto(`${BASE}prototype.html`, { waitUntil: 'load' });
  must(response.status() === 200, `prototype.html answered ${response.status()}`);
  must(/Prototype doors/.test(await page.title()), `title is "${await page.title()}"`);
  await page.evaluate(() => document.fonts.ready);
  const doors = await page.evaluate(() => [...document.querySelectorAll('a[data-door]')].map((a) => ({ door: a.dataset.door, label: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') })));
  must(doors.length >= 8, `only ${doors.length} doors`);
  const absolute = doors.filter((d) => !d.href.startsWith('./'));
  must(!absolute.length, `doors that would leave this build: ${absolute.map((d) => d.href).join(', ')}`);
  // the two ways back are not doors into a prototype feature
  const unlabelled = doors.filter((d) => !['app', 'places-back'].includes(d.door) && !/preview/.test(d.label));
  must(!unlabelled.length, `doors without the word preview: ${unlabelled.map((d) => d.door).join(', ')}`);
  const scripts = await page.locator('script').count();
  must(scripts === 0, `${scripts} script elements on a page that is plain HTML and CSS`);
  // the app's own faces, from the site's fonts.css: the title's display face and the body's text face both load for this page's words
  const faces = await page.evaluate(async () => ({
    title: (await document.fonts.load('800 34px "Shippori Mincho B1"', 'Prototype doors')).length,
    body: (await document.fonts.load('400 16px "Noto Sans JP"', 'Each link opens the app')).length,
    family: getComputedStyle(document.querySelector('h1')).fontFamily,
  }));
  must(faces.title > 0 && faces.body > 0, `the page did not get the app's own faces (title ${faces.title}, body ${faces.body}; ${faces.family})`);
  await shot(page, 'doors-page-desktop');
  const phone = await context.browser().newContext({ ...PHONE, locale: 'en-US' });
  const small = await phone.newPage();
  await small.goto(`${BASE}prototype.html`, { waitUntil: 'load' });
  await small.evaluate(() => document.fonts.ready);
  const over = await small.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const short = await small.evaluate(() => [...document.querySelectorAll('.go a')].filter((a) => a.getBoundingClientRect().height < 44).length);
  if (SHOTS) await small.screenshot({ path: join(resolve(SHOTS), 'doors-page-phone.png'), fullPage: true });
  await phone.close();
  must(over <= 1, `at phone width the page is ${over}px wider than the screen`);
  must(short === 0, `${short} door links are under 44px tall at phone width`);
  globalThis.__doors = doors.map((d) => d.door);
  return `${doors.length} doors: ${doors.map((d) => d.door).join(', ')}`;
});

await door('quests', 'from the reader, 職業 offers the course, its rooms and a quest; the quest starts; from search it offers the course', async ({ page }) => {
  const label = await throughDoor(page, 'quests');
  must(await view(page) === 'reader', `the door opened "${await view(page)}", not the essay`);
  const essay = await text(page, '.reader', 60);
  must(/都市の匿名性と言語/.test(await text(page, '#app', 3000)), `the door did not open the essay 都市の匿名性と言語: ${essay}`);
  const taps = await quesWordFromReader(page);
  const doors = await doorTexts(page);
  must(doors['kanji-course-unit-door'] && doors['kanji-room-door'] && doors['kanji-quest-door'], `doors on the word page: ${JSON.stringify(doors)}`);
  must(/preview/.test(doors['kanji-quest-door']), `the quest door does not say preview: "${doors['kanji-quest-door']}"`);
  await shot(page, 'quests-word-page');
  await page.locator('#kanji-quest-door').click();
  await page.locator('#kanji-quest-start').waitFor();
  const card = await text(page, '#app > main', 700);
  must(/Quest · 職・識・織 in words/.test(card) && /出身も職業も伏せたまま/.test(card), `the quest card reads: ${card.slice(0, 200)}`);
  await shot(page, 'quests-card');
  // a learner reads the card first; a press in the same instant the card appears can be missed (the course is keeping help)
  await page.waitForTimeout(700);
  await page.locator('#kanji-quest-start').click();
  let presses = 1;
  if (!(await page.locator('#kanji-quest-reading').waitFor({ timeout: 5000 }).then(() => true, () => false))) {
    await page.locator('#kanji-quest-start').click(); presses = 2;
    await page.locator('#kanji-quest-reading').waitFor({ timeout: 8000 });
  }
  const quest = await text(page, '#app > main', 500);
  must(/0 of 3 words done/.test(quest) && /End this quest/.test(quest), `the quest page reads: ${quest.slice(0, 200)}`);
  await shot(page, 'quests-started');
  // the quest is in the learner record: after a reload the same word offers to resume it, and Lessons lists it
  await page.goto(`${BASE}?read=bunki-essay-n1-city`, { waitUntil: 'load' }); await ready(page);
  await quesWordFromReader(page);
  const resumed = (await doorTexts(page))['kanji-quest-door'] || '';
  must(/Resume this quest/.test(resumed), `after a reload the quest door reads "${resumed}"`);
  await page.goto(`${BASE}?room=dojo`, { waitUntil: 'load' }); await ready(page);
  await page.locator('.study-door[data-study-door="lessons"]').click();
  await page.locator('[id^="kanji-quest-lessons-"]').first().waitFor({ timeout: 10000 });
  const lessons = (await page.locator('[id^="kanji-quest-lessons-"]').first().innerText()).replace(/\s+/g, ' ');
  must(/Quest in progress/.test(lessons), `the Lessons row reads "${lessons}"`);
  // from search there is no sentence, so no quest; the course and its rooms are offered
  await page.goto(`${BASE}?room=search`, { waitUntil: 'load' }); await ready(page);
  await searchOpen(page, '職業', '職業');
  const fromSearch = await doorTexts(page);
  must(fromSearch['kanji-course-unit-door'] && fromSearch['kanji-room-door'], `doors from search: ${JSON.stringify(fromSearch)}`);
  must(fromSearch['kanji-quest-door'] === null, 'a page with no sentence offered a quest');
  return `"${label}" → 都市の匿名性と言語 → 職業 (${taps} taps) → "${doors['kanji-course-unit-door']}", "${doors['kanji-room-door']}", "${doors['kanji-quest-door']}" → Start quest (${presses} press${presses > 1 ? 'es' : ''}) → "0 of 3 words done"; after a reload "${resumed}" and Lessons shows "${lessons.slice(0, 40)}"; from search: the course and rooms doors, no quest`;
});

for (const [name, deck] of [['shared-n2', 'n2'], ['shared-n1', 'n1'], ['shared-senmon', 'senmon'], ['shared-kotoba-master', 'kotoba-master'], ['shared-grammar', 'shared-grammar']]) {
  await door(name, `the new study screen opens the ${deck} deck in its frame`, async ({ page }) => {
    const label = await throughDoor(page, name, { app: false });
    const frame = await frameOf(page, deck);
    const host = await text(page, '#app', 300);
    must(/Isolated preview/.test(host), `the host does not say it is an isolated preview: ${host.slice(0, 160)}`);
    const inside = (await frame.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    await shot(page, name);
    return `"${label}" → "${host.match(/Back to Bunki.*?history/)?.[0] || 'Isolated preview'}"; the frame reads "${inside.slice(0, 60)}…"`;
  });
}

await door('shared-decks', 'the deck list shows with the new study screen on, grammar row included', async ({ page }) => {
  const label = await throughDoor(page, 'shared-decks');
  must(await view(page) === 'dojo', `the door opened "${await view(page)}"`);
  const main = await text(page, '#app > main', 4000);
  must(/Grammar/.test(main), 'the deck list has no grammar row');
  await shot(page, 'shared-decks');
  return `"${label}" → Learn, with a Grammar row among the decks`;
});

await door('places', 'the five-places layout shows and stays on the device', async ({ page }) => {
  const label = await throughDoor(page, 'places');
  const state = () => page.evaluate(() => ({ layout: document.documentElement.dataset.layout, stored: localStorage.getItem('kairo-layout'),
    tabs: [...document.querySelectorAll('[id^="tab-"]')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()) }));
  const on = await state();
  must(on.stored === 'places', `the device keeps "${on.stored}"`);
  must(['Review', 'Bookshelf', 'Dictionary', 'Tests', 'Progress'].every((word) => on.tabs.some((tab) => tab.includes(word))), `the bar reads ${on.tabs.join(' · ')}`);
  must(!/layout=/.test(page.url()), `the word stayed in the address: ${page.url()}`);
  await shot(page, 'places');
  const back = await throughDoor(page, 'places-back');
  const off = await state();
  must(off.stored !== 'places' && ['Today', 'Read', 'Learn', 'Words', 'Me'].every((word) => off.tabs.some((tab) => tab.includes(word))), `after the way back the bar reads ${off.tabs.join(' · ')} (kept "${off.stored}")`);
  return `"${label}" → ${on.tabs.join(' · ')}; "${back}" → ${off.tabs.join(' · ')}`;
});
CHECKED.add('places-back');

await door('variants', 'the comparison strip shows', async ({ page }) => {
  const label = await throughDoor(page, 'variants');
  await page.locator('#variants').waitFor();
  const strip = await text(page, '#variants', 300);
  await shot(page, 'variants');
  return `"${label}" → the strip reads "${strip.slice(0, 120)}"`;
});

await door('writing-room', 'the writing room opens with its full controls', async ({ page }) => {
  const label = await throughDoor(page, 'writing-room');
  must(await view(page) === 'search', `the door opened "${await view(page)}"`);
  await page.locator('#sheet').waitFor();
  must(/門/.test(await text(page, '#sheet', 80)), `the door did not open 門's page: ${await text(page, '#sheet', 80)}`);
  const box = page.locator('#sheet .stroke-door').first();
  await box.scrollIntoViewIfNeeded();
  await box.click();
  await page.locator('[data-minimal]').waitFor();
  const minimal = await page.evaluate(() => document.querySelector('[data-minimal]').dataset.minimal);
  must(minimal === 'off', `the writing room opened with minimal="${minimal}"`);
  await page.waitForTimeout(1200);
  const room = await text(page, '[data-minimal]', 300);
  must(/strokes/.test(room), `the room shows no stroke counter: ${room.slice(0, 160)}`);
  await shot(page, 'writing-room');
  return `"${label}" → 門's page → its stroke-order box → "${room.slice(0, 110)}"`;
});

/** a Rajōmon door on the doors page: the kanji's page opens, its door says preview, the scene opens and teaches 門 */
async function rajomonFrom(page, doorName, kanji) {
  const label = await throughDoor(page, doorName);
  must(await view(page) === 'search', `the door opened "${await view(page)}"`);
  await page.locator('#sheet').waitFor();
  must((await text(page, '#sheet', 80)).includes(kanji), `the door did not open ${kanji}'s page: ${await text(page, '#sheet', 80)}`);
  const world = page.locator('#kanji-world-door');
  await world.waitFor();
  const words = (await world.innerText()).trim();
  must(/preview/.test(words), `the Rajōmon door on ${kanji} reads "${words}"`);
  if (kanji !== '門') must(words.includes('門') && words.includes(kanji), `the door on ${kanji} does not name the gate inside it: "${words}"`);
  await world.scrollIntoViewIfNeeded();
  await world.click();
  await page.locator('.kw-encounter').waitFor();
  await page.locator('.kw-image').evaluate((image) => image.decode()).catch(() => {});
  const first = await text(page, '.kw-encounter', 140);
  await shot(page, doorName);
  await page.locator('[data-kw-action="next"]').click();
  await page.waitForTimeout(500);
  const glyph = (await page.locator('.kw-glyph').innerText()).trim();
  must(glyph === '門', `from ${kanji} the second step shows "${glyph}", not 門`);
  return { label, words, first };
}
await door('rajomon', 'Rajōmon opens from the 門 page; a kanji without the gate has no door', async ({ page }) => {
  const own = await rajomonFrom(page, 'rajomon', '門');
  await page.goto(`${BASE}?room=search&kanji=${encodeURIComponent('職')}`, { waitUntil: 'load' }); await ready(page);
  await page.locator('#sheet').waitFor();
  await page.waitForTimeout(1500);
  must(await page.locator('#kanji-world-door').count() === 0, 'the 職 page has a Rajōmon door');
  return `"${own.label}" → "${own.words}" → "${own.first.slice(0, 100)}"; step two shows 門; 職 has no door`;
});
for (const [name, kanji] of [['rajomon-ma', '間'], ['rajomon-bun', '聞'], ['rajomon-mon', '問'], ['rajomon-kai', '開'], ['rajomon-hei', '閉']]) {
  await door(name, `Rajōmon opens from ${kanji}, named as the 門 inside it`, async ({ page }) => {
    const held = await rajomonFrom(page, name, kanji);
    return `"${held.label}" → "${held.words}" → 門's scene; step two shows 門`;
  });
}

await door('library', 'the bookshelf shows the 107 candidate readings after its own, each tagged', async ({ page }) => {
  const label = await throughDoor(page, 'library');
  must(await view(page) === 'shelf', `the door opened "${await view(page)}", not the bookshelf`);
  await page.locator('.shelf-item').first().waitFor();
  const shelf = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.shelf-item')];
    const tagged = items.map((item, index) => (item.querySelector('.library-candidate-tag') ? index : -1)).filter((index) => index >= 0);
    return { items: items.length, tagged: tagged.length, first: tagged[0], contiguous: tagged.every((index, n) => index === tagged[0] + n),
      tag: items[tagged[0]]?.querySelector('.library-candidate-tag')?.textContent || '', title: items[tagged[0]]?.innerText.replace(/\s+/g, ' ').slice(0, 60) || '' };
  });
  must(shelf.tagged === 107, `${shelf.tagged} cards wear the candidate tag, not 107 (of ${shelf.items} cards)`);
  must(shelf.contiguous && shelf.first + shelf.tagged === shelf.items, `the candidates do not stand together after the shelf's own readings (first at ${shelf.first} of ${shelf.items})`);
  must(/candidate|候補/.test(shelf.tag), `the tag reads "${shelf.tag}"`);
  const firstCandidate = page.locator('.shelf-item').nth(shelf.first);
  await firstCandidate.scrollIntoViewIfNeeded();
  await shot(page, 'library-shelf');
  return `"${label}" → ${shelf.items} cards; cards ${shelf.first + 1} to ${shelf.items} wear "${shelf.tag}" (107), after the shelf's own ${shelf.first}; the first is "${shelf.title}"`;
});

await door('library-one', 'one candidate opens in the reader, tagged', async ({ page }) => {
  const label = await throughDoor(page, 'library-one');
  must(await view(page) === 'reader', `the door opened "${await view(page)}", not the reader`);
  await page.locator('.reader .tok.content').first().waitFor();
  const tag = (await page.locator('.reader-meta .library-candidate-tag').first().innerText()).trim();
  must(/candidate|候補/.test(tag), `the reader's tag reads "${tag}"`);
  const head = await text(page, '.reader-head', 160);
  must(/去年の木/.test(await text(page, '#app', 2000)), `the reader does not show 去年の木: ${head}`);
  const words = await page.locator('.reader .tok.content').count();
  must(words > 20, `only ${words} words in the candidate`);
  await shot(page, 'library-one');
  return `"${label}" → the reader, tagged "${tag}", ${words} tappable words; its head reads "${head.slice(0, 90)}"`;
});

await door('orbit', 'the orbit word field opens from the galaxy menu and returns', async ({ page }) => {
  const label = await throughDoor(page, 'orbit');
  await page.locator('#ginga-symbol').click();
  const bubble = page.locator('#orbit-preview-door');
  await bubble.waitFor();
  const words = (await bubble.innerText()).replace(/\s+/g, ' ').trim();
  must(/preview/.test(words), `the orbit door reads "${words}"`);
  await bubble.click();
  await page.locator('dialog#orbit-preview[open]').waitFor();
  const bar = await text(page, '.orbit-preview-bar', 120);
  must(/preview/.test(bar), `the orbit bar reads "${bar}"`);
  const frame = page.frameLocator('.orbit-preview-frame');
  await frame.locator('body').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await shot(page, 'orbit');
  await page.locator('#orbit-preview-back').click();
  await page.locator('dialog#orbit-preview').waitFor({ state: 'detached', timeout: 10000 });
  return `"${label}" → the galaxy symbol → "${words}" → "${bar}" → Back → view "${await view(page)}"`;
});

await door('moments', 'guided practice shows its moments, style and sound choices', async ({ page }) => {
  const label = await throughDoor(page, 'moments');
  must(await view(page) === 'dojo', `the door opened "${await view(page)}"`);
  await page.locator('.study-door[data-study-door="guided"]').click();
  await page.locator('.gs-footer').waitFor();
  const foot = await text(page, '.gs-footer', 300);
  must(/moments/.test(foot) && /dramatic/.test(foot) && /sound/.test(foot), `the foot of the room reads "${foot}"`);
  await shot(page, 'moments');
  return `"${label}" → Guided test practice → "${foot.slice(0, 90)}"`;
});

await check('app', 'the way back to the app works', async ({ page }) => {
  const label = await throughDoor(page, 'app');
  return `"${label}" → view "${await view(page)}"`;
});

await check('every-door-checked', 'every door on the page has a check in this file', async () => {
  const doors = globalThis.__doors;
  if (!doors) return 'skipped: the doors page was not read in this run';
  const unchecked = doors.filter((name) => !CHECKED.has(name));
  must(!unchecked.length, `doors with no check: ${unchecked.join(', ')}`);
  return `${doors.length} doors, each with a check`;
});

await browser.close();
const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. ${BASE}`);
process.exit(failed.length ? 1 : 0);
