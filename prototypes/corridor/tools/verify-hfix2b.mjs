/**
 * Hfix-2b — the 宙 sky, the thread and the drift glosses. Five rows, each red on the base and
 * green on this branch, on real WebKit 390×844 with touch and real Chromium 1440×900.
 *
 *   X-1   every 宙 star that has a recorded reason says it, in Today's sky's own words, and a
 *         star with no recorded reason says nothing rather than inventing one
 *   X-12  a saved word is lit on the FIRST frame of the sky and still lit after a drag, in the
 *         world's own ink — never the vermilion error dot
 *   X-14  at 390×844 the thread's shelf bead lies inside the viewport and nothing covers it,
 *         with no sliding first (elementFromPoint, from the bead's own centre)
 *   KH1-3 no gloss the page is served, and no accessible name it renders, ends mid-word
 *   X-9   a word marked "Not yet" through the app's own writer reaches Today's sky, with its
 *         reason
 *   H2-1  nothing legible in the sky is cut by the glass edge, at 390×844, 1024×768 and
 *         1440×900, at rest and while dragging
 *
 * HOW BASE IS MEASURED. `KAIRO_HFIX2B_BASE=1` routes the four runtime files this slice changed
 * to their bytes at the base commit, so the base and the branch are judged by the SAME rows on
 * the same server — the comparison cannot drift between two checkouts.
 *
 * DISCRIMINATING CONTROLS (`KAIRO_HFIX2B_CONTROL=`):
 *   ink      put the vermilion back in drift-layer.css        → X-12's ink row must go red
 *   seat     restore the old whole-world scatter of seats      → X-12's first-frame row must go red
 *   why      strip `why` from the kept projection              → X-1 must go red
 *   cover    slide the rail so the shelf bead hides under 宙   → X-14 must go red
 *   edge     restore the old guard's three exclusions          → H2-1 must go red
 * A control that leaves its row green is itself a failure, and is reported as one.
 *
 * This writes nothing to the learner's record beyond the fixture it imports and the one "Not yet"
 * X-9 asks for, and it never renders audio.
 */
/* global window, document, localStorage */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';
import { installOracle } from './repair-drift-glosses.mjs';
import { looksClipped } from './gloss-text.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const BASE_SHA = process.env.KAIRO_HFIX2B_BASE_SHA || '4159d180';
const AS_BASE = process.env.KAIRO_HFIX2B_BASE === '1';
const CONTROL = process.env.KAIRO_HFIX2B_CONTROL || '';
const out = resolve(process.env.KAIRO_EVIDENCE_DIR || join(REPO, '..', 'hfix2b-evidence'));
mkdirSync(out, { recursive: true });

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 1200) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${String(detail).slice(0, 240)}` : ''}`);
};

/** The files this slice changed, served at the base commit when the base run asks for them. */
const SWAP = {
  '/corridor.js': 'prototypes/corridor/corridor.js',
  '/drift-layer.js': 'prototypes/corridor/drift-layer.js',
  '/drift-layer.css': 'prototypes/corridor/drift-layer.css',
  '/data/share_alike/words.json': 'prototypes/corridor/data/share_alike/words.json',
};
const baseBytes = new Map();
const atBase = (path) => {
  if (!baseBytes.has(path)) {
    baseBytes.set(path, execFileSync('git', ['show', `${BASE_SHA}:${SWAP[path]}`],
      { cwd: REPO, maxBuffer: 1 << 29 }));
  }
  return baseBytes.get(path);
};
const TYPE = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** A control that silently fails to apply is worse than no control: the row goes green and the
 * run reports a discriminating check that never happened. Every swap goes through here, and a
 * pattern that is not found exactly once stops the run. */
function swap(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`control "${label}" did not apply: pattern not found`);
  if (text.indexOf(from, first + 1) >= 0) throw new Error(`control "${label}" is ambiguous: pattern found twice`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}
const OLD_EDGE_GUARD = '    if(n.kind==="word"&&(n.mode==="free"||n.mode==="glide")&&n!==focusN&&!n.hlDom){\n'
  + '      const zf=(n.fpx||14)*n.s*cam.z;';
const NEW_EDGE_GUARD = '    {\n      const zf=(n.fpx||14)*n.s*cam.z;';

/** corridor.js keeps its functions in its own top-level scope, not on `window`, so a test cannot
 * reach the writer the word page calls. This rides INSIDE corridor.js — base bytes included, so
 * X-9 is measured the same way on both sides — and exposes that one writer and nothing else. */
const BRIDGE = `
window.__HFIX2B__ = {
  markNotYet: (id, reading) => correctDepth({ t: 'word', id, reading }, 'not-yet'),
};`;

const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium }
  : process.env.KAIRO_BROWSER === 'webkit' ? { webkit } : { chromium, webkit };
const PROFILE = {
  webkit: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' },
  chromium: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' },
};

/** His shelf, and the moments that give four of its words a reason. The fifth (林) has none
 * recorded, so its star must stay silent — that is the half of X-1 that is easy to fake. */
const KEPT = ['電話', '政府', '経済', '学校', '林'];
function seededRecord(now) {
  const day = 86400000;
  const kept = (id, ts) => ({ t: 'word', id, label: id, kind: '語', kindEn: 'word', from: null, ts });
  return {
    v: 1,
    taken: KEPT.map((id, i) => kept(id, now - (9 - i) * day)),
    srs: { 'word:学校': { due: new Date(now - 3600000).toISOString(), last_review: new Date(now - 5 * day).toISOString(),
      stability: 3, difficulty: 5, elapsed_days: 4, scheduled_days: 4, reps: 3, lapses: 0, learning_steps: 0, state: 2 } },
    revlog: [
      [now - 5 * day, 'word:学校', 3, 2, null, null, null, null, 3, 5, 4, 1200],
      [now - day, 'word:電話', 1, 2, null, null, null, null, 3, 5, 1, 1400],
    ],
    obslog: [
      [now - 2 * 3600000, 'mock', 'word:政府', 1, 'n3-01'],
      [now - 2 * day, 'tap', 'word:経済', 2, 'wikinews:1403'],
      [now - 2 * day + 20 * 60000, 'tap', 'word:経済', 3, 'wikinews:1403'],
    ],
  };
}
const WHY = { test: 'missed in a test', yesterday: 'missed yesterday', unknown: 'you marked it not yet',
  twice: 'you looked it up twice', due: 'due today' };

/** Every kept star the sky is actually showing, with how it is painted. */

/** H2-1 — anything LEGIBLE in the sky that crosses the glass edge.
 *
 * The sky's law is a dissolve, not a hard stop: a node fades out over its last ~34px, so while
 * it is crossing it is both faintly visible and partly outside. That is the design. The floor
 * below separates that intended whisper from a cut a reader can actually read — at the moment a
 * node's box touches the edge the fade has already taken it to a quarter of its opacity, and a
 * node meaningfully over the edge is below a sixteenth. Anything at or above the floor must lie
 * wholly inside. Measured on the rendered box, so a glyph's hero type counts at its real size. */
const LEGIBLE = 0.08;
const readCutNodes = (page, floor) => page.evaluate((limit) => {
  const layer = document.getElementById('drift-layer');
  if (!layer) return { total: 0, cut: [] };
  // every piece of text the sky draws, including the scale-stars: their captions run to 210px
  // and carry a reason line under them now, so they are the largest ink in the field and the
  // likeliest to meet an edge. Leaving them out would have been a hole in the row.
  const nodes = [...layer.querySelectorAll('.word, .glyph, .part, .scale-star')];
  const cut = [];
  for (const n of nodes) {
    const op = Number(getComputedStyle(n).opacity);
    if (!(op >= limit)) continue;
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // A CUT is a node the glass slices: part of it on screen, part of it beyond. A node that
    // has left the viewport entirely is not cut, it is simply elsewhere — the field is far
    // wider than the glass and is meant to be, so flagging those would condemn the sky itself.
    const onW = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const onH = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (!(onW > 0 && onH > 0)) continue;
    const over = Math.max(-r.left, r.right - innerWidth, -r.top, r.bottom - innerHeight);
    if (over > 0.5) {
      cut.push({ text: (n.textContent || '').trim().slice(0, 10),
        kind: n.classList.contains('scale-star') ? 'scale-star'
          : n.classList.contains('word') ? 'word' : n.classList.contains('glyph') ? 'glyph' : 'part',
        sat: n.classList.contains('bsat'), op: +op.toFixed(3), over: Math.round(over),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
    }
  }
  return { total: nodes.length, cut: cut.sort((a, b) => b.op - a.op) };
}, floor);

/** Open the sky, let the field settle, tap a word to raise a constellation (the state Grok's
 * walk was in — a bloom's satellites are the brightest ink the field ever shows), then watch
 * several frames at rest and several more while the field is dragged. */
async function sweepSkyEdges(page, host, label, drag) {
  await page.goto(`${host.origin}/index.html?entry=drift&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(1500);
  const worst = [];
  let total = 0;
  const sample = async () => {
    const seen = await readCutNodes(page, LEGIBLE);
    total = Math.max(total, seen.total);
    worst.push(...seen.cut);
  };
  for (let i = 0; i < 4; i += 1) { await page.waitForTimeout(700); await sample(); }
  // raise a constellation: its satellites sit at 0.95 and orbit, which is where the walk's
  // cut words came from
  const word = page.locator('#drift-layer .word').first();
  if (await word.count()) {
    const box = await word.boundingBox().catch(() => null);
    if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(1200); }
  }
  for (let i = 0; i < 4; i += 1) { await page.waitForTimeout(700); await sample(); }
  // and while the field is carried: a node crossing the rim must fade, not slide out whole
  for (const [dx, dy] of [[-150, -90], [150, 90], [-90, 150]]) {
    await page.mouse.move(drag.x, drag.y);
    await page.mouse.down();
    for (let s = 1; s <= 5; s += 1) await page.mouse.move(drag.x + (dx * s) / 5, drag.y + (dy * s) / 5);
    await sample();
    await page.mouse.up();
    await page.waitForTimeout(500);
    await sample();
  }
  worst.sort((a, b) => b.op - a.op);
  return { total, cut: worst };
}
const readKeptStars = (page) => page.evaluate(() => [...document.querySelectorAll('.scale-star-kept')]
  .filter((n) => !n.hidden)
  .map((n) => {
    const r = n.getBoundingClientRect();
    const style = getComputedStyle(n, '::before');
    return {
      word: (n.textContent || '').trim(), why: n.dataset.why || '',
      name: n.getAttribute('aria-label') || '',
      onGlass: r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight,
      colour: getComputedStyle(n).color, mark: style.content, glow: style.textShadow,
    };
  }));

const host = await startCorridorDev(0);

try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    const version = browser.version();
    const tag = `${engine} ${version}`;
    console.log(`engine ${engine} ${version}  (base=${AS_BASE ? BASE_SHA : 'branch'}${CONTROL ? `, control=${CONTROL}` : ''})`);
    try {
      const context = await browser.newContext({ ...PROFILE[engine], timezoneId: 'Asia/Tokyo' });
      await silenceBrowserAudio(context);
      const page = await context.newPage();
      page.setDefaultTimeout(25_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // the base swap, and the two controls that live in a served file
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const hit = Object.keys(SWAP).find((path) => url.pathname.endsWith(path));
        if (!hit) return route.continue();
        const kind = TYPE[hit.slice(hit.lastIndexOf('.'))];
        let text = AS_BASE ? atBase(hit).toString('utf8') : await (await route.fetch()).text();
        if (!AS_BASE && CONTROL === 'ink' && hit === '/drift-layer.css') {
          text = swap(text, '#drift-layer .scale-star-kept { color: var(--ink); }',
            '#drift-layer .scale-star-kept { color: var(--verm, #b34836); }', 'ink');
        }
        if (!AS_BASE && CONTROL === 'seat' && hit === '/drift-layer.js') {
          text = swap(text, 'const seat=keptSeat(index);',
            'const seat={x:WR.w*(0.12+(scaleHash(row.key)%100000)/100000*0.76),y:WR.h*(0.12+(scaleHash(row.key+"y")%100000)/100000*0.76)};', 'seat');
        }
        if (!AS_BASE && CONTROL === 'why' && hit === '/drift-layer.js') {
          text = swap(text, "why:typeof row.why==='string'?row.why:''", "why:''", 'why');
        }
        // the H2-1 control: put the three exclusions back, so only free-drifting words that
        // are neither focused nor in a constellation can dissolve — the base's own guard
        if (!AS_BASE && CONTROL === 'edge' && hit === '/drift-layer.js') {
          text = swap(text, NEW_EDGE_GUARD, OLD_EDGE_GUARD, 'edge');
        }
        // the writer bridge rides on both sides, so X-9 is judged on the sky's read, never on
        // whether the test could reach the writer at all
        if (hit === '/corridor.js') text = `${text}\n${BRIDGE}`;
        return route.fulfill({ status: 200, contentType: kind, body: text });
      });

      /* ---------------------------------------------------------------- KH1-3, on the served bytes */
      await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      installOracle();
      const layer = await page.evaluate(async () => (await fetch('/drift-layer.js')).text());
      const literal = /const WBIG=(\[.*\]);/.exec(layer);
      const rows = literal ? JSON.parse(literal[1]) : [];
      const cut = rows.filter((row) => Array.isArray(row) && typeof row[2] === 'string' && looksClipped(row[2]));
      check(`${tag} · KH1-3 no gloss the sky is served ends mid-word`, rows.length > 0 && cut.length === 0,
        `${rows.length} rows, ${cut.length} still cut${cut.length ? `: ${JSON.stringify(cut.slice(0, 3).map((r) => [r[0], r[2]]))}` : ''}`);
      const headline = rows.find((row) => row[0] === '取り上げる')?.[2] || '';
      check(`${tag} · KH1-3 取り上げる carries its whole gloss, not "…to confi"`,
        !!headline && !looksClipped(headline) && !headline.endsWith('to confi'), JSON.stringify(headline));

      /* ---------------------------------------------------------------- seed his shelf */
      const now = await page.evaluate(() => Date.now());
      await restoreAppFixture(page, seededRecord(now));

      /* ---------------------------------------------------------------- X-12 and X-1, the 宙 sky */
      await page.goto(`${host.origin}/index.html?entry=drift&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      // the FIRST frame the sky can show its kept words: the projection has arrived and one paint
      // has run. No drag, no nudge — that is the whole of X-12's first half.
      await page.waitForFunction(() => document.querySelectorAll('.scale-star-kept').length > 0, null, { timeout: 20000 })
        .catch(() => {});
      await page.waitForTimeout(700);
      const firstFrame = await readKeptStars(page);
      const litAtOpen = firstFrame.filter((s) => s.onGlass);
      // "None shows when the sky opens" is the finding, so the row asks for ALL of his shelf, not
      // merely one. The old scatter seated five words across a world 3.2 viewports wide and the
      // opening camera happened to catch two of them — a row asking for "at least one" passed on
      // the base by luck of the hash and proved nothing.
      check(`${tag} · X-12 every saved word is on glass at the first frame, with no drag`,
        litAtOpen.length === KEPT.length,
        `${litAtOpen.length} of ${KEPT.length} saved words lit (${firstFrame.length} stars mounted): ${litAtOpen.map((s) => s.word).join(' ')}`);
      const vermilion = /179,\s*72,\s*54/;
      const inkOk = litAtOpen.length > 0 && litAtOpen.every((s) => !vermilion.test(s.colour));
      const glowOk = litAtOpen.length > 0 && litAtOpen.every((s) => s.glow && s.glow !== 'none');
      check(`${tag} · X-12 it is lit in the world's own ink, never the vermilion error dot`,
        inkOk && glowOk, JSON.stringify(litAtOpen.slice(0, 2).map((s) => [s.word, s.colour, s.mark, s.glow])));

      // X-1 · the reason each star carries, judged against what the record actually holds
      const expectWhy = { 電話: WHY.yesterday, 政府: WHY.test, 経済: WHY.twice, 学校: WHY.due, 林: '' };
      const said = Object.fromEntries(firstFrame.map((s) => [s.word, s.why]));
      const wrong = Object.entries(expectWhy).filter(([word, line]) => said[word] !== undefined && said[word] !== line);
      check(`${tag} · X-1 each 宙 star says why it is there, in Today's sky's own words`,
        firstFrame.length > 0 && wrong.length === 0 && firstFrame.some((s) => s.why),
        `${JSON.stringify(said)}${wrong.length ? ` wrong: ${JSON.stringify(wrong)}` : ''}`);
      const silent = firstFrame.find((s) => s.word === '林');
      check(`${tag} · X-1 a star with no recorded reason says nothing, and invents none`,
        !silent || (silent.why === '' && !/·/u.test(silent.name)), JSON.stringify(silent || null));
      const named = firstFrame.filter((s) => s.why);
      check(`${tag} · X-1 the reason is in the star's accessible name too`,
        named.length > 0 && named.every((s) => s.name.includes(s.why)),
        JSON.stringify(named.slice(0, 2).map((s) => s.name)));

      // X-12 · and it is still lit after a drag
      const centre = { x: PROFILE[engine].viewport.width / 2, y: PROFILE[engine].viewport.height / 2 };
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down();
      for (const step of [1, 2, 3, 4]) await page.mouse.move(centre.x - step * 22, centre.y - step * 14);
      await page.mouse.up();
      await page.waitForTimeout(600);
      const dragged = (await readKeptStars(page)).filter((s) => s.onGlass);
      check(`${tag} · X-12 a saved word is still lit after a drag`,
        dragged.length > 0 && dragged.every((s) => !vermilion.test(s.colour) && s.glow && s.glow !== 'none'),
        `${dragged.length} on glass: ${JSON.stringify(dragged.slice(0, 2).map((s) => [s.word, s.colour]))}`);
      await page.screenshot({ path: join(out, `sky-${engine}-${AS_BASE ? 'base' : 'branch'}${CONTROL ? `-${CONTROL}` : ''}.png`) });

      /* ---------------------------------------------------------------- X-14, the thread's beads */
      await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('.shelf-open').first().click();
      await page.waitForFunction(() => !!document.querySelector('.scale-thread'), null, { timeout: 20000 });
      await page.waitForTimeout(500);
      // D6 is not the reader at rest — the shelf bead is plainly visible there. It is the rail
      // once the path has grown past the glass: opening a word adds its bead, the rail reveals
      // the CURRENT bead, and the early beads slide under the sticky 宙. So the row is measured
      // in the state that actually shows it.
      const deepen = page.locator('#reader .tok').first();
      if (await deepen.count()) {
        await deepen.click();
        await page.waitForTimeout(700);
      }
      const depth = await page.evaluate(() => document.querySelectorAll('.scale-thread > *').length);
      if (CONTROL === 'cover') {
        await page.evaluate(() => { const t = document.querySelector('.scale-thread'); if (t) t.scrollLeft = t.scrollWidth; });
        await page.waitForTimeout(250);
      }
      const beads = await page.evaluate(() => {
        const thread = document.querySelector('.scale-thread');
        if (!thread) return null;
        const out = [];
        for (const node of thread.children) {
          const r = node.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
          const hit = document.elementFromPoint(x, y);
          out.push({
            text: (node.textContent || '').trim(),
            out: node.hasAttribute('data-scale-out'),
            inside: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5,
            covered: !(hit && (hit === node || node.contains(hit) || hit.contains(node))),
            coveredBy: hit && !(hit === node || node.contains(hit) || hit.contains(node))
              ? `${hit.tagName}.${hit.className}`.slice(0, 60) : '',
          });
        }
        return { width: innerWidth, scrollLeft: thread.scrollLeft, beads: out };
      });
      const shelf = beads?.beads.find((b) => !b.out && /本棚|shelf/iu.test(b.text));
      check(`${tag} · X-14 the thread shows a shelf bead at all (${depth} beads deep)`, !!shelf,
        JSON.stringify(beads?.beads.map((b) => b.text)));
      check(`${tag} · X-14 the shelf bead is inside the viewport and nothing covers it, with no sliding`,
        !!shelf && shelf.inside && !shelf.covered,
        JSON.stringify({ shelf, scrollLeft: beads?.scrollLeft, width: beads?.width }));
      const hiddenBeads = (beads?.beads || []).filter((b) => !b.out && (b.covered || !b.inside));
      check(`${tag} · X-14 every bead is reachable and visible, none tucked behind 宙`,
        hiddenBeads.length === 0, JSON.stringify(hiddenBeads));
      await page.screenshot({ path: join(out, `thread-${engine}-${AS_BASE ? 'base' : 'branch'}${CONTROL ? `-${CONTROL}` : ''}.png`) });

      /* ---------------------------------------------------------------- X-9, "Not yet" to Today */
      // written through the app's OWN writer, the one the word page calls — not hand-seeded
      const wrote = await page.evaluate(async () => {
        if (!window.__HFIX2B__) return 'no-bridge';
        const ok = await window.__HFIX2B__.markNotYet('練習', 'れんしゅう');
        return ok === true ? 'written' : `refused:${String(ok)}`;
      }).catch((error) => `threw:${error.message}`);
      check(`${tag} · X-9 the word page's own writer records the "Not yet"`, wrote === 'written', String(wrote));
      await page.goto(`${host.origin}/index.html?room=tray&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.waitForTimeout(900);
      const skyStars = await page.evaluate(() => [...document.querySelectorAll('.today-star')]
        .filter((n) => !n.hidden).map((n) => ({ text: (n.textContent || '').trim(), why: n.dataset.why || '', kind: [...n.classList].find((c) => c !== 'today-star') || '' })));
      const mark = skyStars.find((s) => s.text === '練習');
      check(`${tag} · X-9 a word marked "Not yet" on its page reaches Today's sky, with its reason`,
        !!mark && mark.why === WHY.unknown && mark.kind === 'unknown',
        `${JSON.stringify(mark || null)} of ${JSON.stringify(skyStars.map((s) => s.text))}`);
      await page.screenshot({ path: join(out, `today-${engine}-${AS_BASE ? 'base' : 'branch'}${CONTROL ? `-${CONTROL}` : ''}.png`) });

      check(`${tag} · no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      await context.close();

      /* ---------------------------------------------------------------- H2-1, the glass edge
       * Each engine sweeps its own sizes: the phone on WebKit, and on Chromium both the iPad
       * and the laptop, so all three sizes Grok's walk names are measured. */
      const sizes = engine === 'webkit'
        ? [['phone', 390, 844]]
        : [['ipad', 1024, 768], ['laptop', 1440, 900]];
      for (const [sizeName, width, height] of sizes) {
        const edgeContext = await browser.newContext({
          viewport: { width, height },
          isMobile: engine === 'webkit', hasTouch: engine === 'webkit', serviceWorkers: 'block',
        });
        await silenceBrowserAudio(edgeContext);
        const edgePage = await edgeContext.newPage();
        edgePage.setDefaultTimeout(25_000);
        const edgeErrors = [];
        edgePage.on('pageerror', (error) => edgeErrors.push(error.message));
        await edgePage.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          const hit = Object.keys(SWAP).find((path) => url.pathname.endsWith(path));
          if (!hit) return route.continue();
          let text = AS_BASE ? atBase(hit).toString('utf8') : await (await route.fetch()).text();
          if (!AS_BASE && CONTROL === 'edge' && hit === '/drift-layer.js') {
            text = swap(text, NEW_EDGE_GUARD, OLD_EDGE_GUARD, 'edge');
          }
          return route.fulfill({ status: 200, contentType: TYPE[hit.slice(hit.lastIndexOf('.'))], body: text });
        });
        const swept = await sweepSkyEdges(edgePage, host, sizeName, { x: width / 2, y: height / 2 });
        const kinds = [...new Set(swept.cut.map((c) => c.kind))].join('+') || 'none';
        check(`${tag} · H2-1 ${sizeName} ${width}×${height}: nothing legible is cut by the glass edge`,
          swept.total > 0 && swept.cut.length === 0,
          `${swept.total} nodes drawn, ${swept.cut.length} cut at ≥${LEGIBLE} opacity (${kinds})`
          + `${swept.cut.length ? `: ${JSON.stringify(swept.cut.slice(0, 4))}` : ''}`);
        await edgePage.screenshot({ path: join(out, `edges-${sizeName}-${AS_BASE ? 'base' : 'branch'}${CONTROL ? `-${CONTROL}` : ''}.png`) });
        check(`${tag} · H2-1 ${sizeName} no page errors`, edgeErrors.length === 0, edgeErrors.slice(0, 2).join(' | '));
        await edgeContext.close();
      }
    } finally {
      await browser.close();
    }
  }

  const failed = checks.filter((c) => !c.pass);
  const mode = AS_BASE ? `BASE ${BASE_SHA}` : CONTROL ? `CONTROL ${CONTROL}` : 'BRANCH';
  console.log(failed.length ? `HFIX-2B ${mode} — ${failed.length} of ${checks.length} red`
    : `HFIX-2B ${mode} — all ${checks.length} green`);
  // a base run and a control run are EXPECTED to be red; only the branch must be green
  if (!AS_BASE && !CONTROL && failed.length) process.exitCode = 1;
} finally {
  writeFileSync(join(out, `hfix2b-${AS_BASE ? 'base' : CONTROL || 'branch'}.json`),
    `${JSON.stringify({ base: AS_BASE ? BASE_SHA : null, control: CONTROL || null, checks }, null, 2)}\n`);
  await host.close();
}
assert(checks.length > 0, 'at least one check ran');
