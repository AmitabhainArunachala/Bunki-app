/** Round 4, today lane (T1, D5): Today's sky is the doorway into the universe, and Me holds his
 * horizons. Behavioural acceptance on the staged artifact, in English and 日本語, on a phone:
 *   - a fresh Today's sky is never empty, every star is a learned Japanese word or kanji;
 *   - one word opens that word's own entry;
 *   - open sky, and the labelled door, rise into the universe (the drift view, its layer awake);
 *   - the door's foot carries one way down, named Today, and it lands on Today;
 *   - negative control: a touch on the day's word's hook stays on Today (the sky door is not
 *     over-eager);
 *   - Me leads with N1 · July 2027 and the days to the July test (the JLPT's first Sunday of July),
 *     then his three fields by his own names. */
/* global document, innerWidth */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from '../prototypes/corridor/tools/browser-audio-silence.mjs';

const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
};
/** Days from today's local midnight to the first Sunday of July 2027 (0 on the day). */
function daysToJulyTest(now = new Date()) {
  const first = new Date(2027, 6, 1);
  const test = new Date(2027, 6, 1 + ((7 - first.getDay()) % 7));
  return Math.round((test - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
const FIELDS = {
  bi: ['Learning psychology', 'Yoga, Buddhism, Jain and Hindu history', 'Semiconductors, AI and investing'],
  ja: ['学習心理学', 'ヨーガ・仏教・ジャイナ教・ヒンドゥー教の歴史', '半導体・AI・投資'],
};
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : { chromium, webkit };
try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    try {
      for (const lang of ['bi', 'ja']) {
        const label = `${engine} ${lang}`;
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
          reducedMotion: 'reduce', serviceWorkers: 'block',
        });
        await silenceBrowserAudio(context);
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const open = async (query) => {
          await page.goto(`${host.origin}/index.html?${query}&ui=${lang}`);
          await page.waitForFunction(() => document.body.dataset.ready === '1');
          await page.waitForTimeout(700);
        };
        const view = () => page.evaluate(() => document.body.dataset.view);

        // the sky is never empty, and every star is learned Japanese
        await open('room=tray');
        const stars = await page.$$eval('.today-star', (nodes) => nodes
          .filter((n) => !n.hidden && n.getBoundingClientRect().width)
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { text: n.textContent, lang: n.lang, content: n.dataset.uiContent,
              x: r.left + r.width / 2, y: r.top + r.height / 2, box: [r.left, r.top, r.right, r.bottom] };
          }));
        check(`${label} · a fresh Today's sky holds real words`, stars.length >= 8, `${stars.length}: ${stars.map((s) => s.text).join(' ')}`);
        check(`${label} · every star is learned Japanese (lang=ja, learning content)`,
          stars.every((s) => s.lang === 'ja' && s.content === 'learning'));
        const overlaps = [];
        for (let i = 0; i < stars.length; i += 1) for (let j = i + 1; j < stars.length; j += 1) {
          const [a, b] = [stars[i].box, stars[j].box];
          if (a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1) overlaps.push(`${stars[i].text}/${stars[j].text}`);
        }
        check(`${label} · no two stars overlap`, overlaps.length === 0, overlaps.join(' '));

        // one word opens that word
        const star = stars.find((s) => [...s.text].length > 1) || stars[0];
        await page.touchscreen.tap(star.x, star.y);
        await page.locator('.sheet').waitFor();
        const sheetText = await page.locator('.sheet').textContent();
        check(`${label} · a sky word opens that word's entry`, sheetText.includes(star.text), star.text);
        await open('room=tray');

        // negative control: the hook is the day's word's, not a door to the universe
        const hook = await page.locator('.dw-hook').boundingBox();
        await page.touchscreen.tap(hook.x + hook.width / 2, hook.y + hook.height / 2);
        await page.waitForTimeout(400);
        check(`${label} · a touch on the day's word's hook stays on Today`, (await view()) === 'tray');

        // open sky rises into the universe
        const sky = await page.evaluate(() => {
          const node = document.querySelector('.today-sky');
          const R = node.getBoundingClientRect();
          for (let y = R.top + 24; y < R.bottom - 140; y += 7) for (let x = R.left + 12; x < R.right - 48; x += 9) {
            if (document.elementFromPoint(x, y) === node) return { x, y };
          }
          return null;
        });
        check(`${label} · the sky has open water to touch`, !!sky, JSON.stringify(sky));
        if (sky) {
          await page.touchscreen.tap(sky.x, sky.y);
          await page.waitForFunction(() => document.body.dataset.view === 'drift');
          await page.waitForTimeout(900);
          const universe = await page.evaluate(() => ({
            layer: document.getElementById('drift-layer')?.classList.contains('active'),
            words: document.querySelectorAll('#drift-layer .word').length,
            tabs: !!document.getElementById('primary-tabs'),
          }));
          check(`${label} · open sky opens the whole universe`, universe.layer && universe.words >= 20 && !universe.tabs, JSON.stringify(universe));
          // the level rail names its scale at rest, so its one word obeys the interface language
          const rail = await page.evaluate(() => document.querySelector('#drift-layer #lvlLabels')?.firstElementChild?.textContent);
          check(`${label} · the universe's level rail speaks the interface language`, rail === (lang === 'ja' ? '自' : 'auto'), rail);
        }

        // the door's one way down is named Today and lands on Today
        const pill = page.locator('#home-review');
        const pillText = (await pill.textContent()).trim();
        check(`${label} · the door's foot carries one way down, named Today`, pillText === (lang === 'ja' ? '今日' : 'Today'), pillText);
        await pill.click();
        await page.waitForFunction(() => document.body.dataset.view === 'tray');
        check(`${label} · the Today pill lands on Today`, (await view()) === 'tray');

        // the labelled door is the same rise, for every hand and key
        await page.locator('#today-universe').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.body.dataset.view === 'drift');
        check(`${label} · the labelled door rises into the universe from the keyboard`, (await view()) === 'drift');

        // Me: N1 · July 2027 with the days to the test, then his three fields
        await open('room=me');
        const me = await page.evaluate(() => ({
          seal: document.querySelector('.me-n1-seal')?.textContent,
          when: document.querySelector('.me-n1-when')?.textContent,
          days: Number(document.querySelector('.me-n1-days')?.textContent.replace(/[^0-9]/g, '') || NaN),
          fields: [...document.querySelectorAll('.me-hz[data-horizon^="field-"]')].map((n) => ({
            id: n.dataset.horizon, name: n.querySelector('.me-hz-name')?.textContent, note: n.querySelector('.me-hz-note')?.textContent,
          })),
          width: document.documentElement.scrollWidth - innerWidth,
        }));
        const expected = daysToJulyTest();
        check(`${label} · Me leads with N1 · July 2027`, me.seal === 'N1' && (lang === 'ja' ? me.when === '2027年7月' : me.when === 'July 2027'), `${me.seal} ${me.when}`);
        check(`${label} · the countdown is the honest days to the July test`, expected > 0 ? me.days === expected : Number.isNaN(me.days), `${me.days} shown · ${expected} expected`);
        check(`${label} · his three fields, by his own names, each with his gloss`,
          JSON.stringify(me.fields.map((f) => f.id)) === JSON.stringify(['field-mind', 'field-india', 'field-ai']) &&
            me.fields.every((f, i) => f.name === FIELDS[lang][i] && f.note),
          me.fields.map((f) => f.name).join(' | '));
        check(`${label} · Me has no horizontal scroll`, me.width <= 0, String(me.width));
        check(`${label} · no page errors`, errors.length === 0, errors.join(' | '));
        await page.screenshot({ path: join(out, `today-sky-${engine}-${lang}.png`) });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(failed.length ? `TODAY SKY FAIL — ${failed.length} of ${checks.length}` : `TODAY SKY PASS — ${checks.length} checks`);
  if (failed.length) process.exitCode = 1;
} finally {
  writeFileSync(join(out, 'today-sky.json'), `${JSON.stringify({ checks }, null, 2)}\n`);
  await host.close();
}
assert(checks.length > 0, 'at least one check ran');
