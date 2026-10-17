/** F · things come from where they were (contract §3), measured in WebKit and Chromium at 390×844.
 *
 *   H1 story forward   — a tap on a shelf card with a picture opens its story: during the room change exactly one
 *                        element carries view-transition-name hero, the reader's picture of the same file; the
 *                        departing picture gave the name up; the hero group moves from the card's picture rect to the
 *                        reader's picture rect (its own keyframes, ±1.5 px) in the room's beat (--motion-room) and
 *                        curve (--ease-enter); the rooms fade through the paper — the departing room's snapshot is an
 *                        opacity-only fade that ends before the arriving room's fade begins — so two rooms' text never
 *                        show at once; the layer that draws the picture is clipped to the room (the top bar's foot to
 *                        the tabs' head), so the chrome stays above it. Frames at 0/60/120/180/240/320 ms
 *                        (every animation paused and seeked, the page's timers held). When it settles no element
 *                        keeps the name and the clip is gone.
 *   H2 story back      — Back from that story: the reader's picture is the departing hero and the same card's picture
 *                        on the shelf the arriving one; the shelf comes back at its place.
 *   H3 no picture      — a story card with no picture opens by the ordinary room change (nothing is named hero, no
 *                        clip, the departing room leaves by the ordinary kairo-room leave): the hero is narrow.
 *   H4 interrupted     — Back pressed while a story is still arriving: the second change runs, and once both settle
 *                        no element keeps the name, the clip is gone and no error was thrown.
 *   H5 reduced motion  — the same open and Back under prefers-reduced-motion: nothing is named hero, the room
 *                        arrives by an opacity-only fade of 120 ms or less.
 *   D1 deck Good       — a Good grade sends the answered card (an inert copy, no ids) 24 px to the right while it
 *                        fades (card-leave, --motion-quick), and the next card comes in from 24 px to the left on the
 *                        same line of travel (card-arrive, the same beat): frames at 0/40/80/120/160/240 ms show the
 *                        copy moving right and fading and the card moving right and rising, monotonically.
 *   D2 deck Again      — the mirror: the copy leaves to the left, the card comes in from the right, the 朱 slash runs.
 *                        D1 and D2 also hold (F, 2026-10-18) that the copy stands where the answered card stood, on
 *                        the screen (a copy left in the flow had stood below the screen, its leave never seen), and
 *                        that one card shows at a time: the copy has gone by the half-beat and the next card waits
 *                        that half-beat (its delay) before it comes in — no frame shows both.
 *   D3 deck reduced    — under reduced motion no copy is inserted and the card fades in (opacity only, ≤ 120 ms).
 *   T  frame timing    — the open and the Good grade in real time, cold and warm: worst frame, p95 and the longest
 *                        stall from requestAnimationFrame (a measured proxy, recorded, never a phone).
 * Usage: KAIRO_SITE_DIR=<artifact> KAIRO_ARTIFACT_SHA256=<digest> node verify-continuity.mjs
 *        KAIRO_BROWSER=chromium|webkit limits the engines (unset or all: both).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Choose an existing artifact and its exact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['webkit', 'chromium'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const PHONE = { width: 390, height: 844 };
const HERO_FRAMES = [0, 60, 120, 180, 240, 320];
const DECK_FRAMES = [0, 40, 80, 120, 160, 240];
const host = await startStaticHost({ site, port: 0 });
const results = [];
const timing = [];

/** startViewTransition is wrapped (never replaced) so the check can hold the transition it starts. */
const VT_HOOK = () => {
  const start = document.startViewTransition?.bind(document);
  if (!start) return;
  document.startViewTransition = (cb) => { const vt = start(cb); window.__vt = vt; window.__vtCount = (window.__vtCount || 0) + 1; return vt; };
};
const QUIET = () => { try { localStorage.setItem('kairo-tip-reader-v1', '1'); } catch { /* storage refused */ } };

async function session(browser, { reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await silenceBrowserAudio(ctx);
  await ctx.addInitScript(VT_HOOK);
  await ctx.addInitScript(QUIET);
  await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error).slice(0, 200)));
  return { ctx, page, errors };
}
async function openShelf(page) {
  await page.goto(`${host.origin}/?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(500);
}
/** a shelf card whose picture is the reader's picture (the same file), brought to the middle of the screen */
async function pictureCard(page, { withPicture = true } = {}) {
  const id = await page.evaluate((want) => {
    const cards = [...document.querySelectorAll('#shelf-body .shelf-item[data-passage]')];
    const pick = cards.find((card) => (want ? !!card.querySelector('.story-img') : !card.querySelector('.story-img') && !card.classList.contains('story-glossary')));
    if (!pick) return null;
    pick.scrollIntoView({ block: 'center' });
    return pick.dataset.passage;
  }, withPicture);
  assert(id, withPicture ? 'no shelf card with a picture' : 'no shelf card without a picture');
  if (withPicture) {
    await page.waitForFunction((pid) => { const img = document.querySelector(`#shelf-body [data-passage="${pid}"] .story-img`); return img && img.complete && img.naturalWidth > 0; }, id);
  }
  await page.waitForTimeout(300);
  return id;
}
const rectOf = (page, selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel);
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, src: node.getAttribute('src') };
}, selector);
async function tapCard(page, id) {
  const box = await page.locator(`#shelf-body [data-passage="${id}"] .shelf-open`).first().boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(30, box.height / 2));
}
/** Arm a freeze before the gesture: once the transition it starts is ready, every animation pauses and the page's
 * timers wait (their callbacks run in order on release). */
const armFreeze = (page) => page.evaluate(() => {
  window.__frozen = new Promise((resolveFrozen) => {
    const wait = () => {
      if (!window.__vt) return requestAnimationFrame(wait);
      window.__vt.ready.then(() => {
        window.__held = [];
        window.__realSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...args) => { window.__held.push([fn, ms, args]); return 0; };
        for (const a of document.getAnimations()) a.pause();
        resolveFrozen('ready');
      }, (error) => resolveFrozen(`skipped: ${error?.name || error}`));
    };
    wait();
  });
});
const release = (page) => page.evaluate(() => {
  if (window.__realSetTimeout) {
    window.setTimeout = window.__realSetTimeout;
    for (const [fn, ms, args] of window.__held || []) window.setTimeout(fn, ms, ...args);
    window.__held = [];
  }
  for (const a of document.getAnimations()) a.play();
});
const seek = (page, t) => page.evaluate((time) => { for (const a of document.getAnimations()) { try { a.currentTime = time; } catch { /* finished */ } } }, t);
/** what the paused transition holds: the named elements, the pseudo animations and the hero group's own keyframes */
const transitionState = (page) => page.evaluate(() => {
  const named = [...document.querySelectorAll('*')]
    .map((node) => ({ node, name: getComputedStyle(node).viewTransitionName }))
    .filter(({ name }) => name && name !== 'none' && name !== 'auto')
    .map(({ node, name }) => ({ name, cls: String(node.className), src: node.getAttribute('src') || null }));
  const main = document.querySelector('#app > main');
  const animations = document.getAnimations().map((a) => ({ name: a.animationName || '', pseudo: a.effect?.pseudoElement || '',
    target: a.effect?.target === main && !a.effect?.pseudoElement ? 'main' : '',
    duration: a.effect?.getTiming?.().duration, delay: a.effect?.getTiming?.().delay || 0,
    props: [...new Set((a.effect?.getKeyframes?.() || []).flatMap((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))],
    keyframes: /view-transition-group\(hero\)/.test(a.effect?.pseudoElement || '') ? a.effect.getKeyframes() : null }));
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const ms = (name) => { const v = css.getPropertyValue(name).trim(); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000; };
  const bar = document.querySelector('#app > .chrome')?.getBoundingClientRect();
  const tabs = document.querySelector('#primary-tabs')?.getBoundingClientRect();
  let clipRule = null;
  const scan = (rules) => {
    for (const rule of rules) {
      if (/data-room-hero\]::view-transition$/.test(rule.selectorText || '')) clipRule = rule.style.getPropertyValue('clip-path') || rule.style.clipPath;
      if (rule.cssRules?.length) scan(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) { try { scan(sheet.cssRules); } catch { /* cross-origin */ } }
  const overlayClip = getComputedStyle(root, '::view-transition').clipPath;
  return { named, animations, roomHero: root.dataset.roomHero || null, clipRule, overlayClip,
    heroTop: css.getPropertyValue('--room-hero-top').trim(), heroBottom: css.getPropertyValue('--room-hero-bottom').trim(),
    barBottom: bar ? bar.bottom : null, tabsTop: tabs ? tabs.top : null, innerHeight,
    motionRoom: ms('--motion-room'), easeEnter: css.getPropertyValue('--ease-enter').trim(),
    shelfInDom: !!document.querySelector('#shelf-body'), view: document.body.dataset.view };
});
/** Sample every frame of a room change in real time: the departing room's snapshot opacity (its pseudo's computed
 * style) and the arriving room's; two rooms' text show at once when both are above 2 %. */
const sampleRooms = (page) => page.evaluate(() => {
  window.__rooms = [];
  const root = document.documentElement;
  const tick = () => {
    const live = document.getAnimations().some((a) => /::view-transition-old\(kairo-room\)/.test(a.effect?.pseudoElement || ''));
    const main = document.querySelector('#app > main');
    window.__rooms.push({ t: Math.round(performance.now()), old: live ? +(+getComputedStyle(root, '::view-transition-old(kairo-room)').opacity).toFixed(3) : 0,
      main: main ? +(+getComputedStyle(main).opacity).toFixed(3) : 0, view: document.body.dataset.view });
    if (window.__rooms.length < 160) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const roomsSeen = (page) => page.evaluate(() => window.__rooms);
/** the hero group's keyframes: from (the departing rect) and to (the arriving rect), as sizes and translations */
function heroPath(state) {
  const group = state.animations.find((a) => /view-transition-group\(hero\)/.test(a.pseudo));
  assert(group, 'no ::view-transition-group(hero) animation');
  const kf = group.keyframes || [];
  const read = (frame) => {
    const m = new DOMMatrixLike(frame.transform);
    return { width: parseFloat(frame.width), height: parseFloat(frame.height), tx: m.e, ty: m.f };
  };
  return { duration: group.duration, from: read(kf[0]), to: read(kf.at(-1)), easing: group.keyframes?.[0]?.easing };
}
/** a 2D matrix() / matrix3d() / none reader (Node has no DOMMatrix) */
class DOMMatrixLike {
  constructor(value = 'none') {
    const nums = String(value).match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) || [];
    if (/^matrix3d/.test(value)) { this.e = nums[12]; this.f = nums[13]; } else if (/^matrix/.test(value)) { this.e = nums[4]; this.f = nums[5]; } else { this.e = 0; this.f = 0; }
  }
}
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const settleAll = async (page) => {
  await release(page);
  await page.evaluate(() => window.__vt?.finished?.catch(() => {}));
  await page.waitForTimeout(500);
};
const afterState = (page) => page.evaluate(() => ({
  named: [...document.querySelectorAll('*')].filter((node) => getComputedStyle(node).viewTransitionName === 'hero').length,
  roomHero: document.documentElement.dataset.roomHero || null,
  heroTop: getComputedStyle(document.documentElement).getPropertyValue('--room-hero-top').trim(),
  roomTransition: document.documentElement.dataset.roomTransition || null,
  view: document.body.dataset.view, scrollY: Math.round(scrollY),
}));

try {
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch({ headless: true });
    const version = browser.version();
    const run = async (name, body, options) => {
      const s = await session(browser, options);
      try {
        const observations = await body(s);
        assert.deepEqual(s.errors, [], 'no page errors');
        results.push({ engine, version, name, passed: true, observations });
        console.log(`PASS ${engine}/${name} ${JSON.stringify(observations).slice(0, 600)}`);
      } catch (error) {
        const screenshot = resolve(evidence, `${engine}-${name}-FAIL.png`);
        await s.page.screenshot({ path: screenshot }).catch(() => {});
        results.push({ engine, version, name, passed: false, error: String(error.message || error), errors: s.errors, screenshot });
        console.log(`FAIL ${engine}/${name}: ${String(error.message || error).split('\n')[0]}`);
      } finally { await s.ctx.close(); }
    };

    await run('H1-story-forward', async ({ page }) => {
      await openShelf(page);
      const id = await pictureCard(page);
      const from = await rectOf(page, `#shelf-body [data-passage="${id}"] .story-img`);
      await armFreeze(page);
      await tapCard(page, id);
      const frozen = await page.evaluate(() => window.__frozen);
      assert.equal(frozen, 'ready', `the room change's transition did not run: ${frozen}`);
      const state = await transitionState(page);
      const to = await rectOf(page, '#app > main .reader-picture-img');
      assert(to, 'the reader shows no picture');
      assert.equal(to.src, from.src, 'the reader picture is the card picture (one file)');
      const heroes = state.named.filter((n) => n.name === 'hero');
      assert.equal(heroes.length, 1, `exactly one element carries the hero name: ${JSON.stringify(state.named)}`);
      assert(/reader-picture-img/.test(heroes[0].cls) && heroes[0].src === from.src, `the named element is the reader's picture: ${JSON.stringify(heroes)}`);
      assert(!state.shelfInDom, 'the departing room has left the document');
      const old = state.animations.find((a) => /::view-transition-old\(kairo-room\)/.test(a.pseudo));
      assert(old && old.props.every((p) => p === 'opacity') && old.delay + old.duration < state.motionRoom, `the departing room only fades, within the beat's first part: ${JSON.stringify(old)}`);
      assert(/inset\(/.test(state.overlayClip) && near(parseFloat(state.overlayClip.match(/inset\(([\d.]+)px/)?.[1]), state.barBottom, 1), `the transition layer is clipped below the top bar: ${state.overlayClip}`);
      const path = heroPath(state);
      assert.equal(path.duration, state.motionRoom, `the picture moves in the room's beat (${path.duration} vs ${state.motionRoom})`);
      const ease = (state.animations.find((a) => /view-transition-group\(hero\)/.test(a.pseudo))?.keyframes || [])[0]?.easing;
      assert(near(path.from.width, from.width) && near(path.from.height, from.height), `it starts at the card's picture: ${JSON.stringify(path.from)} vs ${JSON.stringify(from)}`);
      assert(near(path.to.width, to.width) && near(path.to.height, to.height), `it ends at the reader's picture: ${JSON.stringify(path.to)} vs ${JSON.stringify(to)}`);
      assert(near(path.to.tx - path.from.tx, to.x - from.x) && near(path.to.ty - path.from.ty, to.y - from.y), 'it travels the distance between the two pictures');
      assert(state.roomHero && state.clipRule && /var\(--room-hero-top/.test(state.clipRule) && /var\(--room-hero-bottom/.test(state.clipRule), `the transition layer is clipped to the room: ${state.clipRule}`);
      assert(near(parseFloat(state.heroTop), state.barBottom, 1) && near(parseFloat(state.heroBottom), state.innerHeight - state.tabsTop, 1), `the clip is the top bar's foot to the tabs' head: ${state.heroTop}/${state.heroBottom} vs ${state.barBottom}/${state.innerHeight - state.tabsTop}`);
      const frames = [];
      for (const t of HERO_FRAMES) {
        await seek(page, t);
        await page.waitForTimeout(80);
        await page.screenshot({ path: resolve(evidence, `${engine}-H1-${String(t).padStart(3, '0')}ms.png`) });
        frames.push(await page.evaluate((time) => {
          const main = document.querySelector('#app > main');
          const group = document.getAnimations().find((a) => /view-transition-group\(hero\)/.test(a.effect?.pseudoElement || ''));
          return { t: time, mainOpacity: main ? +(+getComputedStyle(main).opacity).toFixed(3) : null, heroProgress: group ? +(group.effect.getComputedTiming().progress ?? 1).toFixed(3) : null };
        }, t));
      }
      assert(frames.every((f, i) => i === 0 || f.heroProgress >= frames[i - 1].heroProgress), 'the picture travels one way');
      await settleAll(page);
      const after = await afterState(page);
      assert.equal(after.named, 0, 'no element keeps the hero name');
      assert(!after.roomHero && !after.heroTop, 'the clip is gone');
      assert.equal(after.view, 'reader');
      return { id, from: [from.x, from.y, from.width, from.height].map(Math.round), to: [to.x, to.y, to.width, to.height].map(Math.round), duration: path.duration, ease, frames, after };
    });

    await run('H2-story-back', async ({ page }) => {
      await openShelf(page);
      const id = await pictureCard(page);
      const shelfY = await page.evaluate(() => Math.round(scrollY));
      await tapCard(page, id);
      await page.waitForFunction(() => document.body.dataset.view === 'reader' && document.querySelector('#app > main .reader-picture-img')?.complete);
      await page.evaluate(() => window.__vt?.finished?.catch(() => {}));
      await page.waitForTimeout(500);
      const from = await rectOf(page, '#app > main .reader-picture-img');
      await page.evaluate(() => { window.__vt = null; });
      await armFreeze(page);
      await page.locator('#back').click();
      const frozen = await page.evaluate(() => window.__frozen);
      assert.equal(frozen, 'ready', `Back's transition did not run: ${frozen}`);
      const state = await transitionState(page);
      const heroes = state.named.filter((n) => n.name === 'hero');
      assert.equal(heroes.length, 1, `exactly one element carries the hero name: ${JSON.stringify(state.named)}`);
      assert(/story-img/.test(heroes[0].cls) && heroes[0].src === from.src, `the named element is the card's picture: ${JSON.stringify(heroes)}`);
      const to = await rectOf(page, `#shelf-body [data-passage="${id}"] .story-img`);
      const path = heroPath(state);
      assert(near(path.from.width, from.width) && near(path.to.width, to.width), `it travels from the reader's picture to the card's: ${JSON.stringify(path)}`);
      for (const t of HERO_FRAMES) {
        await seek(page, t);
        await page.waitForTimeout(80);
        await page.screenshot({ path: resolve(evidence, `${engine}-H2-${String(t).padStart(3, '0')}ms.png`) });
      }
      await settleAll(page);
      const after = await afterState(page);
      assert.equal(after.named, 0, 'no element keeps the hero name');
      assert.equal(after.view, 'shelf');
      assert(near(after.scrollY, shelfY, 2), `the shelf comes back at its place: ${after.scrollY} vs ${shelfY}`);
      return { id, from: [from.x, from.y, from.width, from.height].map(Math.round), to: [to.x, to.y, to.width, to.height].map(Math.round), after };
    });

    await run('H1b-one-room-at-a-time', async ({ page }) => {
      await openShelf(page);
      const id = await pictureCard(page);
      await sampleRooms(page);
      await tapCard(page, id);
      await page.evaluate(() => window.__vt?.finished?.catch(() => {}));
      await page.waitForTimeout(400);
      const forward = await roomsSeen(page);
      await page.evaluate(() => { window.__vt = null; });
      await sampleRooms(page);
      await page.locator('#back').click();
      await page.evaluate(() => new Promise((done) => { const wait = () => (window.__vt ? window.__vt.finished.catch(() => {}).then(done) : requestAnimationFrame(wait)); wait(); }));
      await page.waitForTimeout(400);
      const back = await roomsSeen(page);
      const overlap = [...forward.filter((r) => r.old > 0.02 && r.main > 0.02), ...back.filter((r) => r.old > 0.02 && r.main > 0.02)];
      // the samples caught the change itself (a frame of the reader with the departing room still drawn or itself
      // still rising), not only the rooms before and after it
      const during = (rows, view) => rows.some((r) => r.view === view && (r.old > 0.02 || r.main < 0.98));
      assert(during(forward, 'reader') && forward.some((r) => r.main > 0.98 && r.view === 'reader'), `the forward change was sampled: ${JSON.stringify(forward.filter((r) => r.view === 'reader').slice(0, 8))}`);
      assert(during(back, 'shelf'), `the change back was sampled: ${JSON.stringify(back.filter((r) => r.view === 'shelf').slice(0, 8))}`);
      assert.deepEqual(overlap, [], 'no frame shows two rooms at once');
      return { forwardFrames: forward.length, backFrames: back.length, lastOldFrame: forward.filter((r) => r.old > 0.02).at(-1), firstMainFrame: forward.find((r) => r.main > 0.02 && r.view === 'reader') };
    });

    await run('H3-no-picture', async ({ page }) => {
      await openShelf(page);
      const id = await pictureCard(page, { withPicture: false });
      await armFreeze(page);
      await tapCard(page, id);
      const frozen = await page.evaluate(() => window.__frozen);
      assert.equal(frozen, 'ready');
      const state = await transitionState(page);
      assert.equal(state.named.filter((n) => n.name === 'hero').length, 0, 'nothing is named hero without a picture');
      const leave = state.animations.find((a) => /::view-transition-old\(kairo-room\)/.test(a.pseudo));
      assert(leave && leave.duration === state.motionRoom, `the ordinary room change: the departing room leaves in the full beat: ${JSON.stringify(leave)}`);
      assert(!state.roomHero, 'no clip without a hero');
      await settleAll(page);
      return { id };
    });

    await run('H4-interrupted', async ({ page }) => {
      await openShelf(page);
      const id = await pictureCard(page);
      await tapCard(page, id);
      await page.waitForFunction(() => document.body.dataset.view === 'reader');
      await page.locator('#back').click();
      await page.waitForFunction(() => document.body.dataset.view === 'shelf');
      await page.evaluate(() => window.__vt?.finished?.catch(() => {}));
      await page.waitForTimeout(800);
      const after = await afterState(page);
      assert.equal(after.named, 0, 'no element keeps the hero name');
      assert(!after.roomHero && !after.heroTop, 'the clip is gone');
      assert.equal(after.roomTransition, null, 'the room change settled');
      return { id, transitions: await page.evaluate(() => window.__vtCount), after };
    });

    await run('H5-reduced', async ({ page }) => {
      await openShelf(page);
      const id = await pictureCard(page);
      await armFreeze(page);
      await tapCard(page, id);
      const frozen = await page.evaluate(() => window.__frozen);
      assert.equal(frozen, 'ready');
      const state = await transitionState(page);
      assert.equal(state.named.filter((n) => n.name === 'hero').length, 0, 'nothing travels under reduced motion');
      const fade = await page.evaluate(() => {
        const main = document.querySelector('#app > main');
        const all = document.getAnimations().map((a) => ({ name: a.animationName || '', pseudo: a.effect?.pseudoElement || '', target: a.effect?.target === main ? 'main' : '',
          end: (a.effect?.getTiming?.().duration || 0) + Math.max(0, a.effect?.getTiming?.().delay || 0),
          props: [...new Set((a.effect?.getKeyframes?.() || []).flatMap((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))] }));
        return all;
      });
      const moving = fade.filter((a) => a.props.some((p) => p !== 'opacity'));
      assert.deepEqual(moving.filter((a) => a.target === 'main' || /kairo-room|hero/.test(a.pseudo)), [], `only opacity changes: ${JSON.stringify(moving)}`);
      assert(fade.filter((a) => a.target === 'main').every((a) => a.end <= 120), `the room fades in 120 ms or less: ${JSON.stringify(fade.filter((a) => a.target === 'main'))}`);
      await settleAll(page);
      await page.locator('#back').click();
      await page.waitForFunction(() => document.body.dataset.view === 'shelf');
      await page.waitForTimeout(400);
      const after = await afterState(page);
      assert.equal(after.named, 0);
      return { id, main: fade.filter((a) => a.target === 'main') };
    }, { reduced: true });

    const deckOpen = async (page) => {
      await page.goto(`${host.origin}/?deck=kotoba&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#app .kp').waitFor();
      await page.waitForTimeout(800);
      if (await page.locator('#app .kp-study #kp-quit').count()) { await page.locator('#kp-quit').click(); await page.waitForTimeout(500); }
      const begin = page.locator('#app .kp-home button.kp-primary, #app .kp-home .kp-begin, #app button[data-kp="begin"]').first();
      if (await begin.count()) await begin.click(); else await page.getByRole('button', { name: /Begin|始める|はじめる|Study|学習/u }).first().click();
      await page.locator('#app .kp-study #kp-reveal').waitFor();
      await page.waitForTimeout(600);
      await page.locator('#kp-reveal').click();
      await page.waitForTimeout(700);
    };
    const gradeFrozen = (page, grade) => page.evaluate((g) => {
      window.__held = [];
      window.__realSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => { window.__held.push([fn, ms, args]); return 0; };
      document.getElementById(`kp-grade-${g}`).click();
      for (const a of document.getAnimations()) a.pause();
    }, grade);
    const deckState = (page) => page.evaluate(() => {
      const ghosts = [...document.querySelectorAll('.kp-ghost')];
      const card = document.getElementById('kp-card');
      const css = getComputedStyle(document.documentElement);
      const quick = css.getPropertyValue('--motion-quick').trim();
      const anim = (node, name) => node?.getAnimations?.().find((a) => a.animationName === name);
      return {
        ghosts: ghosts.length, ghostClass: ghosts[0] ? String(ghosts[0].className) : null,
        ghostIds: ghosts[0] ? ghosts[0].id + ghosts[0].querySelectorAll('[id]').length : null,
        ghostInert: ghosts[0] ? ghosts[0].inert && ghosts[0].getAttribute('aria-hidden') === 'true' : null,
        leave: ghosts[0] ? { duration: anim(ghosts[0], 'card-leave')?.effect.getTiming().duration ?? null, dx: getComputedStyle(ghosts[0]).getPropertyValue('--card-dx').trim() } : null,
        arrive: card ? { arriving: card.classList.contains('kp-arrive'), duration: anim(card, 'card-arrive')?.effect.getTiming().duration ?? null, delay: anim(card, 'card-arrive')?.effect.getTiming().delay ?? null, dx: getComputedStyle(card).getPropertyValue('--card-dx').trim() } : null,
        ghostRect: ghosts[0] ? (() => { const r = ghosts[0].getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })() : null,
        viewport: innerHeight,
        advance: document.querySelector('.kp-study')?.dataset.advance || null, slash: !!document.querySelector('.kp-slash'),
        quick: quick.endsWith('ms') ? parseFloat(quick) : parseFloat(quick) * 1000,
      };
    });
    const deckFrame = (page) => page.evaluate(() => {
      const ghost = document.querySelector('.kp-ghost'), card = document.getElementById('kp-card');
      const read = (node) => {
        if (!node) return null;
        const t = getComputedStyle(node).transform;
        const m = t && t !== 'none' ? t.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number) : null;
        return { tx: m ? +(t.startsWith('matrix3d') ? m[12] : m[4]).toFixed(2) : 0, opacity: +(+getComputedStyle(node).opacity).toFixed(3) };
      };
      return { ghost: read(ghost), card: read(card) };
    });
    for (const [label, grade, leaveDx, arriveDx] of [['D1-deck-good', 'good', '24px', '-24px'], ['D2-deck-again', 'again', '-24px', '24px']]) {
      await run(label, async ({ page }) => {
        await deckOpen(page);
        const before = await page.evaluate(() => document.getElementById('kp-card')?.dataset.card || null);
        const answered = await page.evaluate(() => { const r = document.getElementById('kp-card').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
        await gradeFrozen(page, grade);
        const state = await deckState(page);
        assert.equal(state.ghosts, 1, 'one inert copy of the answered card');
        assert(new RegExp(`kp-out-${grade}`).test(state.ghostClass), state.ghostClass);
        assert(state.ghostIds === '0', 'the copy carries no ids');
        assert.equal(state.ghostInert, true, 'the copy is inert and hidden from assistive tech');
        assert.equal(state.leave.duration, state.quick, `card-leave runs --motion-quick: ${JSON.stringify(state.leave)}`);
        assert.equal(state.leave.dx, leaveDx, `the copy leaves ${leaveDx}`);
        assert(state.arrive.arriving && state.arrive.duration === state.quick, `card-arrive runs --motion-quick: ${JSON.stringify(state.arrive)}`);
        assert(near(state.arrive.delay, state.quick / 2, 0.5), `the next card waits the half-beat the copy takes to go: ${JSON.stringify(state.arrive)}`);
        // the copy stands where the answered card stood, on the screen (not left in the flow, under the next card)
        const g = state.ghostRect;
        assert(g && near(g.left, answered.left, 1) && near(g.top, answered.top, 1) && near(g.width, answered.width, 1) && g.top < state.viewport && g.top + g.height > 0,
          `the copy stands where the answered card stood: ${JSON.stringify({ copy: g, answered })}`);
        assert.equal(state.arrive.dx, arriveDx, `the next card comes in from ${arriveDx}`);
        assert.equal(state.advance, grade);
        if (grade === 'again') assert(state.slash, 'the 朱 slash runs on Again');
        const frames = [];
        for (const t of DECK_FRAMES) {
          await seek(page, t);
          await page.waitForTimeout(70);
          await page.screenshot({ path: resolve(evidence, `${engine}-${label.slice(0, 2)}-${String(t).padStart(3, '0')}ms.png`) });
          frames.push({ t, ...(await deckFrame(page)) });
        }
        const sign = grade === 'good' ? 1 : -1;
        const live = frames.filter((f) => f.ghost);
        assert(live.length >= 4, `the copy stays for its whole leave: ${JSON.stringify(frames)}`);
        assert(live.every((f, i) => i === 0 || (sign * f.ghost.tx >= sign * live[i - 1].ghost.tx && f.ghost.opacity <= live[i - 1].ghost.opacity)), 'the copy moves one way and fades');
        assert(frames.every((f, i) => i === 0 || (sign * f.card.tx >= sign * frames[i - 1].card.tx - 0.01 && f.card.opacity >= frames[i - 1].card.opacity - 0.001)), 'the card moves the same way and rises');
        assert(near(frames[0].card.tx, -sign * 24, 0.5) && frames[0].card.opacity < 0.05, `the card starts 24 px back on the line of travel: ${JSON.stringify(frames[0])}`);
        assert(frames.every((f) => !(f.ghost && f.ghost.opacity > 0.02 && f.card.opacity > 0.02)), `one card at a time, never two layers of text: ${JSON.stringify(frames)}`);
        await release(page);
        await page.evaluate(() => { for (const a of document.getAnimations()) a.finish?.(); });
        await page.waitForTimeout(600);
        const after = await page.evaluate(() => ({ ghosts: document.querySelectorAll('.kp-ghost').length, arriving: document.getElementById('kp-card')?.classList.contains('kp-arrive'), card: document.getElementById('kp-card')?.dataset.card || null }));
        assert.equal(after.ghosts, 0, 'the copy is gone');
        assert.equal(after.arriving, false, 'the arrival settled');
        return { before, after, frames };
      });
    }

    await run('D3-deck-reduced', async ({ page }) => {
      await deckOpen(page);
      await gradeFrozen(page, 'good');
      const state = await deckState(page);
      assert.equal(state.ghosts, 0, 'no copy under reduced motion');
      const card = await page.evaluate(() => {
        const node = document.getElementById('kp-card');
        const anims = node.getAnimations().map((a) => ({ name: a.animationName, end: a.effect.getTiming().duration + Math.max(0, a.effect.getTiming().delay || 0),
          props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))] }));
        return { arriving: node.classList.contains('kp-arrive'), transform: getComputedStyle(node).transform, anims };
      });
      assert(card.arriving && card.anims.length >= 1, `the next card fades in: ${JSON.stringify(card)}`);
      assert(card.anims.every((a) => a.props.every((p) => p === 'opacity') && a.end <= 120), `opacity only, 120 ms or less: ${JSON.stringify(card.anims)}`);
      assert(card.transform === 'none', 'no transform');
      await release(page);
      return card;
    }, { reduced: true });

    // T · frame timing in real time, cold and warm (a measured proxy)
    const frameProbe = async (page, act, settleMs) => {
      await page.evaluate(() => {
        window.__frames = [];
        let last = performance.now();
        const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__frames.length < 400) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await act();
      await page.waitForTimeout(settleMs);
      return page.evaluate(() => {
        const d = window.__frames.slice(1).sort((a, b) => a - b);
        const p95 = d[Math.floor(d.length * 0.95)] || 0;
        return { frames: d.length, worst: +Math.max(...d).toFixed(1), p95: +p95.toFixed(1), longestStall: +Math.max(...window.__frames.slice(1)).toFixed(1) };
      });
    };
    {
      const s = await session(browser);
      try {
        await openShelf(s.page);
        const id = await pictureCard(s.page);
        const cold = await frameProbe(s.page, () => tapCard(s.page, id), 700);
        await s.page.locator('#back').click();
        await s.page.waitForTimeout(700);
        await s.page.evaluate((pid) => document.querySelector(`#shelf-body [data-passage="${pid}"]`)?.scrollIntoView({ block: 'center' }), id);
        await s.page.waitForTimeout(400);
        const warm = await frameProbe(s.page, () => tapCard(s.page, id), 700);
        timing.push({ engine, move: 'shelf → reader (picture)', cold, warm });
      } finally { await s.ctx.close(); }
      const d = await session(browser);
      try {
        await deckOpen(d.page);
        const cold = await frameProbe(d.page, () => d.page.locator('#kp-grade-good').click(), 600);
        await d.page.locator('#kp-reveal').click().catch(() => {});
        await d.page.waitForTimeout(600);
        const warm = await frameProbe(d.page, () => d.page.locator('#kp-grade-good').click(), 600);
        timing.push({ engine, move: 'deck Good → next card', cold, warm });
      } finally { await d.ctx.close(); }
    }
    await browser.close();
  }
} finally {
  await host.close();
  const receipt = {
    artifactSha256: manifest.artifactSha256, gitSha: manifest.gitSha, sourceDirty: manifest.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope: 'F continuity: the story picture carries shelf ↔ reader (one named element, the room beat, the chrome above, no two rooms at once, cleanup), narrow (no picture, interrupted), reduced motion; the deck card leaves the way it is thrown and the next arrives on the same line of travel (one pair of keyframes), reduced motion; frame timing recorded as a proxy',
    results, timing,
    passed: results.length === engines.length * 9 && results.every((row) => row.passed),
  };
  writeFileSync(resolve(evidence, 'continuity.json'), JSON.stringify(receipt, null, 2) + '\n');
  for (const row of timing) console.log(`TIMING ${row.engine} ${row.move}: cold ${JSON.stringify(row.cold)} · warm ${JSON.stringify(row.warm)}`);
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed · evidence ${evidence}`);
  if (!receipt.passed) process.exitCode = 1;
}
