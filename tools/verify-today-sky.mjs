/** Round 4, today lane (T1, D5): Today's sky is the doorway into the universe, and Me holds his
 * horizons. Behavioural acceptance on the staged artifact, in English and 日本語, on a phone:
 *   - a fresh Today's sky is never empty, holds at most ten stars, keeps out of the header's band,
 *     and every star is a learned Japanese word or kanji with a touch area of at least 44 x 44;
 *   - one word opens that word's own entry;
 *   - open sky in the band, and the labelled door, rise into the universe (the drift view, its layer
 *     awake); the door's foot carries one way down, named Today, and it lands on Today;
 *   - negative controls: a touch on the date, the title, the day's word's label or hook, either
 *     margin beside the word or the skyline stays on Today;
 *   - the universe speaks the interface language: its explainer shows one language, its level rail
 *     shows no scale at rest, and auto (not measured yet) keeps the level and says so;
 *   - the door, in every world, keeps each word ink at 3:1 or more on the universe's ground, and by
 *     day the universe keeps a sky of its own rather than the page's flat ground;
 *   - Me, at fixed clocks: N1 · July 2027, 268 days on 9 Oct 2026 with the literal sitting
 *     (Sun 4 Jul 2027 / 2027年7月4日), "today" on the day, "passed" after it, never a negative count;
 *     then his three fields by his own names. */
/* global document, getComputedStyle, innerWidth */
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
const FIELDS = {
  bi: ['Learning psychology', 'Yoga, Buddhism, Jain and Hindu history', 'Semiconductors, AI and investing'],
  ja: ['学習心理学', 'ヨーガ・仏教・ジャイナ教・ヒンドゥー教の歴史', '半導体・AI・投資'],
};
const WORLDS = ['hokusai', 'sumi', 'shu', 'iwa', 'akafuji', 'keyblock', 'rokusho', 'yoru', 'nami', 'hakuu', 'kaku'];
const NIGHT = new Set(['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']);
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : process.env.KAIRO_BROWSER === 'webkit' ? { webkit } : { chromium, webkit };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' };

/** WCAG contrast of two #rrggbb or rgb() colours. */
function contrast(a, b) {
  const rgb = (c) => {
    const m = String(c).match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    return String(c).match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  };
  const lum = (c) => rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    try {
      for (const lang of ['bi', 'ja']) {
        const label = `${engine} ${lang}`;
        const context = await browser.newContext(phone);
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

        // the sky: never empty, at most ten, out of the header's band, every star learned Japanese
        await open('room=tray');
        const sky = await page.evaluate(() => {
          const band = document.querySelector('.today-sky').getBoundingClientRect();
          const head = document.querySelector('.today-head').getBoundingClientRect();
          const stars = [...document.querySelectorAll('.today-star')].filter((n) => !n.hidden && n.getBoundingClientRect().width).map((n) => {
            const r = n.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            // the touch area: the four corners of a 44 x 44 box around the word all reach this star
            const reach = [[-21, -21], [21, -21], [-21, 21], [21, 21]].every(([dx, dy]) => {
              const hit = document.elementFromPoint(cx + dx, cy + dy);
              return hit === n || n.contains(hit);
            });
            return { text: n.textContent, lang: n.lang, content: n.dataset.uiContent, x: cx, y: cy, reach,
              box: [r.left, r.top, r.right, r.bottom] };
          });
          return { stars, band: [band.left, band.top, band.right, band.bottom], headBottom: head.bottom };
        });
        const { stars } = sky;
        check(`${label} · a fresh Today's sky holds real words, ten at most`, stars.length >= 6 && stars.length <= 10, `${stars.length}: ${stars.map((s) => s.text).join(' ')}`);
        check(`${label} · every star is learned Japanese (lang=ja, learning content)`,
          stars.every((s) => s.lang === 'ja' && s.content === 'learning'));
        check(`${label} · no star shares the date's or the title's band`, stars.every((s) => s.box[1] >= sky.headBottom + 12),
          `header ends ${Math.round(sky.headBottom)}, highest star ${Math.round(Math.min(...stars.map((s) => s.box[1])))}`);
        check(`${label} · every star takes a finger (a 44 x 44 touch area of its own)`, stars.every((s) => s.reach),
          stars.filter((s) => !s.reach).map((s) => s.text).join(' '));
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
        // the sheet loads its example sentences; leaving mid-fetch makes WebKit report the abort as
        // a page error ("due to access control checks"), which is the walk's doing, not the app's
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        await open('room=tray');

        // negative controls: touches outside the band keep their own meaning and stay on Today.
        // Each point is found fresh, from the top of the room, just before its own touch.
        const pointOf = (where) => page.evaluate((name) => {
          window.scrollTo(0, 0);
          const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
          const free = (x, y) => {
            const hit = document.elementFromPoint(x, y);
            return hit && !hit.closest('button, a, [role="button"], .today-sky') ? { x, y } : null;
          };
          const scan = (y0, y1, x0, x1) => {
            for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 6) { const p = free(x, y); if (p) return p; }
            return null;
          };
          const date = r('.today-date');
          const title = r('.today-head .view-title');
          const hook = r('.dw-hook');
          const glyph = r('.dw-glyph');
          const label = r('.dw-label');
          const city = r('.today-city');
          const go = r('.dw-go');
          const line = r('#app > main > .today-line');
          return {
            date: date && { x: date.left + 30, y: date.top + date.height / 2 },
            title: title && { x: title.left + title.width / 2, y: title.top + title.height / 2 },
            hook: hook && { x: hook.left + hook.width / 2, y: hook.top + hook.height / 2 },
            // in 日本語 the label is the app's own lookup, so its centre is touched whatever it holds
            "day's word's label": label && { x: label.left + label.width / 2, y: label.top + label.height / 2 },
            'left margin': glyph && free(6, glyph.top + glyph.height / 2),
            'right margin': glyph && free(innerWidth - 8, glyph.top + glyph.height / 2),
            skyline: city && scan(city.top + city.height * 0.4, city.bottom - 4, 12, innerWidth - 12),
            // where the review's finger went: the skyline straight under the day's word's door
            "skyline under the word's door": go && line && free(go.left + go.width / 2, (go.bottom + line.top) / 2),
          }[name] || null;
        }, where);
        for (const where of ['date', 'title', 'hook', "day's word's label", 'left margin', 'right margin', 'skyline', "skyline under the word's door"]) {
          await open('room=tray');
          let p = await pointOf(where);
          if (!p) { await page.waitForTimeout(400); p = await pointOf(where); }
          if (!p) { check(`${label} · a touch on the ${where} stays on Today`, false, 'no point found to touch'); continue; }
          await page.touchscreen.tap(p.x, p.y);
          await page.waitForTimeout(350);
          const v = await view();
          // straight under the door, a finger within the platform's touch slop may open that door
          // (WebKit hands it a touch about 13px away): the review's defect there was the rise into
          // the universe, so that probe asks only that Today is not left for the universe
          const under = where.startsWith('skyline under');
          check(under ? `${label} · a touch on the ${where} never rises into the universe` : `${label} · a touch on the ${where} stays on Today`,
            under ? v !== 'drift' : v === 'tray', `${Math.round(p.x)},${Math.round(p.y)} → ${v}`);
        }
        await open('room=tray');

        // open sky in the band rises into the universe: the open point farthest from every star's
        // touch area, so the browser's touch adjustment cannot hand the touch to a word
        const openSky = await page.evaluate(() => {
          window.scrollTo(0, 0);
          const node = document.querySelector('.today-sky');
          const R = node.getBoundingClientRect();
          const hits = [...node.querySelectorAll('.today-star')].filter((n) => !n.hidden).map((n) => {
            const b = n.getBoundingClientRect();
            const cx = b.left + b.width / 2;
            const cy = b.top + b.height / 2;
            const hw = Math.max(44, b.width + 16) / 2;
            return [cx - hw, cy - 22, cx + hw, cy + 22];
          });
          let best = null;
          for (let y = R.top + 6; y < R.bottom - 6; y += 4) for (let x = R.left + 12; x < R.right - 12; x += 6) {
            if (document.elementFromPoint(x, y) !== node) continue;
            const d = Math.min(...hits.map(([l, t, r, b]) => Math.hypot(Math.max(l - x, 0, x - r), Math.max(t - y, 0, y - b))), 999);
            if (!best || d > best.d) best = { x, y, d: Math.round(d) };
          }
          return best;
        });
        check(`${label} · the band has open sky to touch`, !!openSky, JSON.stringify(openSky));
        if (openSky) {
          await page.touchscreen.tap(openSky.x, openSky.y);
          await page.waitForFunction(() => document.body.dataset.view === 'drift');
          await page.waitForTimeout(900);
          const universe = await page.evaluate(() => ({
            layer: document.getElementById('drift-layer')?.classList.contains('active'),
            words: document.querySelectorAll('#drift-layer .word').length,
            tabs: !!document.getElementById('primary-tabs'),
          }));
          check(`${label} · open sky opens the whole universe`, universe.layer && universe.words >= 20 && !universe.tabs, JSON.stringify(universe));

          // the universe speaks the interface language
          const speech = await page.evaluate(() => ({
            explainer: [...document.querySelectorAll('#drift-layer #radoc [data-l]')].filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.dataset.l),
            restLabels: Number(getComputedStyle(document.querySelector('#drift-layer #lvlLabels')).opacity),
          }));
          check(`${label} · the universe's explainer shows the interface language only`,
            speech.explainer.length >= 1 && speech.explainer.every((l) => l === (lang === 'ja' ? 'ja' : 'en')), speech.explainer.join(','));
          check(`${label} · the level rail shows no scale at rest`, speech.restLabels === 0, String(speech.restLabels));
          const rail = await page.evaluate(() => {
            const r = document.querySelector('#drift-layer #lvl').getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height * 0.02, handle: document.querySelector('#drift-layer #lvlHandle').style.top };
          });
          await page.touchscreen.tap(rail.x, rail.y);
          await page.waitForTimeout(500);
          const auto = await page.evaluate(() => ({
            handle: document.querySelector('#drift-layer #lvlHandle').style.top,
            hint: document.querySelector('#drift-layer #hint')?.textContent.trim(),
            label: document.querySelector('#drift-layer #lvlLabels')?.firstElementChild?.textContent,
          }));
          check(`${label} · auto keeps the level it cannot measure, and says so`,
            auto.handle === rail.handle && auto.hint === (lang === 'ja' ? '段階はまだ測っていない。N1〜N5 から選ぶ。' : "Your level isn't measured yet. Choose N1 to N5.")
              && auto.label === (lang === 'ja' ? '自' : 'auto'),
            JSON.stringify({ before: rail.handle, ...auto }));
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

        // Me's fields, by his own names, each with his gloss
        await open('room=me');
        const me = await page.evaluate(() => ({
          fields: [...document.querySelectorAll('.me-hz[data-horizon^="field-"]')].map((n) => ({
            id: n.dataset.horizon, name: n.querySelector('.me-hz-name')?.textContent, note: n.querySelector('.me-hz-note')?.textContent,
            sub: !!n.querySelector('.me-hz-sub'),
          })),
          groupNote: document.querySelectorAll('.me-hz-group-note').length,
          width: document.documentElement.scrollWidth - innerWidth,
        }));
        check(`${label} · his three fields, by his own names, each with his gloss`,
          JSON.stringify(me.fields.map((f) => f.id)) === JSON.stringify(['field-mind', 'field-india', 'field-ai']) &&
            me.fields.every((f, i) => f.name === FIELDS[lang][i] && f.note),
          me.fields.map((f) => f.name).join(' | '));
        check(`${label} · an unopened fields deck is said once, not under each field`, me.groupNote === 1 && me.fields.every((f) => !f.sub),
          `${me.groupNote} group note, rows with their own line: ${me.fields.filter((f) => f.sub).length}`);
        check(`${label} · Me has no horizontal scroll`, me.width <= 0, String(me.width));
        check(`${label} · no page errors`, errors.length === 0, errors.join(' | '));
        await page.screenshot({ path: join(out, `today-sky-${engine}-${lang}.png`) });
        await context.close();
      }

      // the countdown, at fixed clocks: the literal sitting, the day itself, and after it
      const CLOCKS = [
        { at: '2026-10-09T09:00:00+09:00', lang: 'bi', days: 268, date: 'Test expected Sun 4 Jul 2027' },
        { at: '2026-10-09T09:00:00+09:00', lang: 'ja', days: 268, date: '試験日 2027年7月4日（日）の見込み' },
        { at: '2027-07-04T10:00:00+09:00', lang: 'bi', days: null, line: 'The test is today' },
        { at: '2027-07-10T10:00:00+09:00', lang: 'bi', days: null, line: 'The July 2027 test has passed' },
      ];
      for (const c of CLOCKS) {
        const context = await browser.newContext({ ...phone, timezoneId: 'Asia/Tokyo' });
        await silenceBrowserAudio(context);
        await context.clock.install({ time: new Date(c.at) });
        await context.clock.resume();
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        await page.goto(`${host.origin}/index.html?room=me&ui=${c.lang}`);
        await page.waitForFunction(() => document.body.dataset.ready === '1');
        await page.waitForTimeout(500);
        const n1 = await page.evaluate(() => ({
          seal: document.querySelector('.me-n1-seal')?.textContent,
          when: document.querySelector('.me-n1-when')?.textContent,
          days: document.querySelector('.me-n1-days')?.textContent ?? null,
          count: document.querySelector('.me-n1-count')?.textContent.trim(),
          date: document.querySelector('.me-n1-date')?.textContent.trim() ?? null,
        }));
        const tag = `${engine} ${c.lang} @ ${c.at.slice(0, 10)}`;
        check(`${tag} · Me leads with N1 · July 2027`, n1.seal === 'N1' && n1.when === (c.lang === 'ja' ? '2027年7月' : 'July 2027'), `${n1.seal} ${n1.when}`);
        if (c.days !== null) {
          check(`${tag} · the countdown is ${c.days} days to the July sitting`, Number(String(n1.days).replace(/[^0-9]/g, '')) === c.days, `${n1.days} shown`);
          check(`${tag} · the sitting is named literally`, n1.date === c.date, n1.date);
        } else {
          check(`${tag} · on and after the day there is no count, only the truth`, n1.days === null && n1.count === c.line && (c.line.includes('passed') ? n1.date === null : true),
            JSON.stringify(n1));
        }
        await context.close();
      }

      // the door in every world: each word ink holds 3:1 on the universe's ground, and by day the
      // universe keeps a sky of its own instead of the page's flat ground
      for (const world of WORLDS) {
        const context = await browser.newContext(phone);
        await silenceBrowserAudio(context);
        await context.addInitScript((t) => { try { localStorage.setItem('kairo-theme', t); } catch { /* storage may be blocked */ } }, world);
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        await page.goto(`${host.origin}/index.html?ui=bi`);
        await page.waitForFunction(() => document.body.dataset.ready === '1');
        await page.waitForTimeout(1200);
        const door = await page.evaluate(() => {
          const layer = document.getElementById('drift-layer');
          return {
            view: document.body.dataset.view,
            ground: layer?.style.getPropertyValue('--ground').trim(),
            host: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
            inks: [...new Set([...document.querySelectorAll('#drift-layer .word')].map((n) => n.style.color).filter(Boolean))],
          };
        });
        const low = door.inks.length ? Math.min(...door.inks.map((c) => contrast(c, door.ground))) : 0;
        check(`${engine} door · ${world} · every word ink holds 3:1 on the universe's ground`, door.view === 'drift' && door.inks.length >= 3 && low >= 3,
          `${door.inks.length} inks on ${door.ground}, lowest ${low.toFixed(2)}:1`);
        if (!NIGHT.has(world)) {
          check(`${engine} door · ${world} · by day the universe keeps a sky of its own`, door.ground && door.ground.toLowerCase() !== door.host.toLowerCase(),
            `universe ${door.ground} · page ${door.host}`);
        }
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
