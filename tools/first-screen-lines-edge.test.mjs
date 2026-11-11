/* global process, URL, document, window, getComputedStyle, requestAnimationFrame, HTMLMediaElement, HTMLCanvasElement, CanvasRenderingContext2D, DOMMatrix */
/** The first screen's gold lines stop short of the words they tie, and nothing faint lies under a word (2026-11-11).
 *
 * A tapped word gathers its family and a gold line runs to each relative. Measured at John's window size with the
 * lead's contrast tool: the lines ran to the middle of every word, behind its characters, and a faint far thing (a big
 * hub character, a dimmed far word) could lie under a small relative. Small relatives then read 2.0 to 2.9 to 1.
 *
 * The goal, as the learner says it when it is right: "When I tap a word on the first screen, each gold line runs from
 * the edge of the tapped word to the edge of one relative and stops just short of it. No line runs through a
 * character. And no big faint character lies under a word I can read."
 *
 * The generated layer runs here alone, silent, at John's window size and device scale 2. After a tap every line's two
 * ends are read where the browser placed them and compared with the boxes of the gathered words as the browser laid
 * them out (the characters, and the reading and the English when they show):
 *   · no end lies inside any gathered word's text box;
 *   · each end is within that word's gap plus 3 px of the box it belongs to, where the gap is 0.3 of the word's font
 *     size on the glass and at least 4 px;
 *   · each square end mark sits on the end of a line;
 *   · once the family stands, the lines still reach the family.
 * And once the family stands, no element drawn under 0.3 opacity (a far word, a hub character painted on the canvas)
 * overlaps the box of a word drawn at 0.3 or more. Read in a plain window, while the family gathers and once it
 * stands, while a relative is dragged over a far word, and in a window that reports a narrower width than its page
 * (as a magnified WebKit window does). Two controls must be caught: lines that end on the middle of their words, and a
 * faint character planted on a relative.
 *
 * Chromium by default, as the other tests here; KAIRO_BROWSER=webkit or =all runs it in WebKit as well. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const CORRIDOR = resolve(fileURLToPath(new URL('../prototypes/corridor', import.meta.url)));
const BROWSERS = { chromium, webkit };
const engines =
  process.env.KAIRO_BROWSER === 'all'
    ? ['chromium', 'webkit']
    : process.env.KAIRO_BROWSER === 'webkit'
      ? ['webkit']
      : ['chromium'];

const GLASS = { width: 1728, height: 1117 }; // John's window (PLAN.md, 2026-11-10 21:31)
const SLACK = 3; // CSS px: an end may stand this much further than the gap from its word's box
const FAR = 0.3; // under this opacity a thing on the first screen is far (faint by design)

// the layer alone, as the app ships it: its stylesheet, its script, shown
const SKY = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="stylesheet" href="/drift-layer.css">
<style>html,body{height:100%;margin:0;overflow:hidden}</style></head>
<body><script src="/drift-layer.js"></script><script>window.__DRIFT__.show();</script></body></html>`;
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/** No sound from tests (John, 2026-11-10), in either engine: WebKit has no --mute-audio, so media is muted before it
 * can play, speech is swallowed, and an AudioContext, should the page ever ask for one, is suspended and stays so. */
function silence() {
  try {
    const media = HTMLMediaElement.prototype;
    const play = media.play;
    media.play = function () {
      this.muted = true;
      this.volume = 0;
      return play.call(this);
    };
    if (window.speechSynthesis)
      Object.getPrototypeOf(window.speechSynthesis).speak = function () {};
    for (const name of ['AudioContext', 'webkitAudioContext']) {
      const Real = window[name];
      if (!Real) continue;
      window[name] = class extends Real {
        constructor(...options) {
          super(...options);
          void this.suspend();
        }
        resume() {
          return Promise.resolve();
        }
      };
    }
  } catch {
    /* a window without media has nothing to silence */
  }
}

/** The hub characters are painted on canvas#fx, where no element can be asked for its box. So every sprite drawn on
 * it under reading presence is written down where it lands, frame by frame (a frame starts where the layer wipes the
 * canvas), and the last whole frame is what the page shows. Drawing is passed through untouched. */
function recordFaintSprites() {
  const proto = CanvasRenderingContext2D.prototype;
  const draw = proto.drawImage;
  const wipe = proto.clearRect;
  let current = [];
  let shown = [];
  window.__faintSprites = () => shown.slice();
  proto.clearRect = function (x, y, w, h) {
    if (this.canvas.id === 'fx' && x === 0 && y === 0) {
      shown = current;
      current = [];
    }
    return wipe.call(this, x, y, w, h);
  };
  proto.drawImage = function (image, ...place) {
    if (
      this.canvas.id === 'fx' &&
      image instanceof HTMLCanvasElement &&
      place.length === 4 &&
      this.globalAlpha < 0.3
    ) {
      const m = this.getTransform();
      current.push({
        x: place[0] * m.a + m.e,
        y: place[1] * m.d + m.f,
        w: place[2] * m.a,
        h: place[3] * m.d,
        alpha: this.globalAlpha,
      });
    }
    return draw.call(this, image, ...place);
  };
}

// the suspected window: innerWidth and innerHeight are the visible area of a page magnified `times`
function reportVisibleArea(times) {
  for (const [name, side] of [
    ['innerWidth', 'clientWidth'],
    ['innerHeight', 'clientHeight'],
  ])
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => Math.round(document.documentElement[side] / times),
    });
}

// a word in the middle of the glass, the clearest first; `skip` passes over the ones already tried
function wordToTap(skip) {
  const page = document.documentElement;
  const words = [...document.querySelectorAll('#sky > .word')]
    .map((el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
        ink: Number(style.opacity),
        size: parseFloat(style.fontSize),
        text: el.querySelector('.base').textContent,
      };
    })
    .filter(
      (word) =>
        word.ink >= 0.3 &&
        word.x > page.clientWidth * 0.3 &&
        word.x < page.clientWidth * 0.7 &&
        word.y > page.clientHeight * 0.3 &&
        word.y < page.clientHeight * 0.7,
    )
    .sort((a, b) => b.ink - a.ink || b.size - a.size || a.text.localeCompare(b.text));
  return words[skip] ?? null;
}

/** What the browser shows, in CSS px of the glass: every line's two ends and every end mark where the browser placed
 * them; every word on the sky with its opacity, its text boxes (its characters, and its reading and its English while
 * they show), and the gap its lines keep (0.3 of its font size as drawn, at least 4 px); and the faint sprites the
 * last frame painted on canvas#fx. */
function scene() {
  const sky = document.getElementById('sky');
  const overlay = sky.querySelector(':scope > svg.threads');
  const shown = (el) => getComputedStyle(el).display !== 'none';
  const at = (el, x, y) => {
    const point = overlay.createSVGPoint();
    point.x = x;
    point.y = y;
    const seen = point.matrixTransform(el.getScreenCTM());
    return { x: seen.x, y: seen.y };
  };
  const lines = overlay
    ? [...overlay.querySelectorAll('line')].filter(shown).map((line) => ({
        from: at(line, line.x1.baseVal.value, line.y1.baseVal.value),
        to: at(line, line.x2.baseVal.value, line.y2.baseVal.value),
      }))
    : [];
  const marks = overlay
    ? [...overlay.querySelectorAll('rect')]
        .filter(shown)
        .map((mark) =>
          at(
            mark,
            mark.x.baseVal.value + mark.width.baseVal.value / 2,
            mark.y.baseVal.value + mark.height.baseVal.value / 2,
          ),
        )
    : [];
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  };
  const words = [...sky.querySelectorAll(':scope > .word, :scope > .glyph, :scope > .part')]
    .filter(shown)
    .map((el) => {
      const style = getComputedStyle(el);
      const lod = el.classList.contains('lod');
      const text = el.querySelector(':scope > .base') || el;
      const parts = [boxOf(text)];
      for (const extra of el.querySelectorAll(':scope > .yomi, :scope > .gloss'))
        if (!lod && Number(getComputedStyle(extra).opacity) > 0.01) parts.push(boxOf(extra));
      const turn = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
      const font =
        parseFloat(getComputedStyle(el.querySelector(':scope > .g') || text).fontSize) *
        Math.hypot(turn.a, turn.b);
      return {
        text: text.textContent,
        role: el.classList.contains('bctr')
          ? 'tapped'
          : el.classList.contains('bsat')
            ? 'relative'
            : null,
        opacity: Number(style.opacity),
        parts,
        box: {
          l: Math.min(...parts.map((p) => p.l)),
          t: Math.min(...parts.map((p) => p.t)),
          r: Math.max(...parts.map((p) => p.r)),
          b: Math.max(...parts.map((p) => p.b)),
        },
        gap: Math.max(4, 0.3 * font),
      };
    });
  const fx = document.getElementById('fx').getBoundingClientRect();
  const sprites = (window.__faintSprites ? window.__faintSprites() : []).map((s) => ({
    box: { l: fx.left + s.x, t: fx.top + s.y, r: fx.left + s.x + s.w, b: fx.top + s.y + s.h },
    alpha: s.alpha,
  }));
  return {
    window: [window.innerWidth, window.innerHeight],
    page: [document.documentElement.clientWidth, document.documentElement.clientHeight],
    lines,
    marks,
    words,
    sprites,
  };
}

// the control: a faint character planted on a relative, which no layer knows of and none can fade
function plantFaintOnRelative() {
  const relative = document.querySelector('#sky > .word.bsat');
  const box = relative.getBoundingClientRect();
  const plant = document.createElement('div');
  plant.className = 'word';
  plant.dataset.plant = 'faint';
  plant.innerHTML = '<span class="base">雨</span>';
  plant.style.cssText = `font-size:40px;opacity:0.2;transform:translate(${box.left + box.width / 2}px,${
    box.top + box.height / 2
  }px) translate(-50%,-50%)`;
  document.getElementById('sky').appendChild(plant);
}

const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const toBox = (p, box) =>
  Math.hypot(Math.max(box.l - p.x, 0, p.x - box.r), Math.max(box.t - p.y, 0, p.y - box.b));
const inside = (p, box) => p.x > box.l && p.x < box.r && p.y > box.t && p.y < box.b;
const boxesMeet = (a, b, grow = 0) =>
  a.l - grow < b.r && a.r + grow > b.l && a.t - grow < b.b && a.b + grow > b.t;
const overlap = (a, b) =>
  Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
const grown = (box, by) => ({ l: box.l - by, t: box.t - by, r: box.r + by, b: box.b + by });

/** Every line keeps out of every gathered word and stops at the edge of one. `whole` also asks, once the family
 * stands, that the lines reach it: each relative with clear water round it (its grown box meets no other gathered
 * word's) has a line end at its edge, and so does at least half the family. */
function expectLinesStopShort(seen, { whole }) {
  const family = seen.words.filter((word) => word.role);
  const tapped = family.find((word) => word.role === 'tapped');
  expect(tapped, 'a tapped word stands at the centre').toBeTruthy();
  expect(family.length, 'the family has gathered').toBeGreaterThanOrEqual(4);
  expect(seen.lines.length, 'the family has lines the page can point at').toBeGreaterThan(0);
  const ends = seen.lines.flatMap((line) => [line.from, line.to]);
  for (const end of ends) {
    for (const word of family)
      for (const part of word.parts)
        expect(
          inside(end, part),
          `a line end (${end.x.toFixed(1)}, ${end.y.toFixed(1)}) lies inside ${word.text}`,
        ).toBe(false);
    const nearest = Math.min(...family.map((word) => toBox(end, word.box) - word.gap));
    expect(
      nearest,
      'each end stands at the edge of a gathered word, a gap away',
    ).toBeLessThanOrEqual(SLACK);
  }
  for (const mark of seen.marks)
    expect(
      Math.min(...ends.map((end) => apart(mark, end))),
      'each end mark sits on the end of a line',
    ).toBeLessThanOrEqual(1.5);
  expect(
    ends.some((end) => toBox(end, tapped.box) - tapped.gap <= SLACK),
    'a line leaves the tapped word',
  ).toBe(true);
  if (!whole) return;
  const relatives = family.filter((word) => word.role === 'relative');
  const reached = relatives.filter((word) =>
    ends.some((end) => toBox(end, word.box) - word.gap <= SLACK),
  );
  expect(reached.length, 'the lines reach the family').toBeGreaterThanOrEqual(
    Math.ceil(relatives.length / 2),
  );
  for (const word of relatives) {
    const crowded = family.some(
      (other) =>
        other !== word && boxesMeet(grown(word.box, word.gap), grown(other.box, other.gap), 3),
    );
    if (!crowded)
      expect(reached, `a line reaches ${word.text}, which has clear water round it`).toContain(
        word,
      );
  }
}

/** Nothing drawn under reading presence lies under a word drawn at it: no far word, no hub character. */
function expectNothingFaintUnder(seen) {
  const readable = seen.words.filter((word) => word.opacity >= FAR);
  expect(readable.length, 'there are words to read').toBeGreaterThanOrEqual(4);
  const faint = [
    ...seen.words
      .filter((word) => word.opacity > 0.02 && word.opacity < FAR)
      .map((word) => ({ what: `the far word ${word.text} at ${word.opacity}`, box: word.box })),
    ...seen.sprites
      .filter((sprite) => sprite.alpha > 0.005)
      .map((sprite) => ({
        what: `a hub character at ${sprite.alpha.toFixed(3)}`,
        box: sprite.box,
      })),
  ];
  for (const thing of faint)
    for (const word of readable)
      expect(overlap(thing.box, word.box), `${thing.what} lies under ${word.text}`).toBe(false);
}

let server;
let origin;
beforeAll(async () => {
  server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    if (path === '/sky') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(SKY);
      return;
    }
    const file = normalize(join(CORRIDOR, path));
    try {
      if (!file.startsWith(CORRIDOR + sep) || !TYPES[extname(file)]) throw new Error('not served');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': TYPES[extname(file)] });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((done) => server.close(done));
});

describe.each(engines)('the first screen lines stop short of the words, in %s', (engine) => {
  let browser;
  beforeAll(async () => {
    browser = await BROWSERS[engine].launch({
      headless: true,
      args: engine === 'chromium' ? ['--mute-audio'] : [],
    });
  }, 60000);
  afterAll(async () => {
    await browser?.close();
  });

  /** A window on the layer, at device scale 2, with a family open: a real click on a word in the middle of the
   * glass. A word with fewer than three relatives is passed over. */
  async function openFamily({ magnified = 0 } = {}) {
    const context = await browser.newContext({ viewport: GLASS, deviceScaleFactor: 2 });
    await context.addInitScript(silence);
    await context.addInitScript(recordFaintSprites);
    if (magnified) await context.addInitScript(reportVisibleArea, magnified);
    const page = await context.newPage();
    await page.goto(`${origin}/sky`);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('#sky > .word')].filter(
          (word) => Number(getComputedStyle(word).opacity) >= 0.3,
        ).length >= 12,
    );
    await page.waitForTimeout(1000); // the field fades in over about a second
    let skip = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const word = await page.evaluate(wordToTap, skip);
      if (!word) {
        await page.waitForTimeout(400); // no clear word in the middle yet
        continue;
      }
      skip += 1;
      await page.mouse.click(word.x, word.y);
      const opened = await page
        .waitForFunction(
          () =>
            document.querySelector('#sky > .word.bctr') &&
            document.querySelectorAll('#sky > .word.bsat').length >= 3,
          null,
          { timeout: 2500 },
        )
        .then(
          () => true,
          () => false,
        );
      if (opened) {
        // the tap marks the family at once; its lines are drawn from the next frame on
        await page.evaluate(
          () => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))),
        );
        return { context, page };
      }
    }
    await context.close();
    throw new Error('no word in the middle of the glass opened a family of three');
  }
  const settle = (page) => page.waitForTimeout(2600); // the family eases to its ring in about two seconds

  /** Hold a relative and carry it over a far word at about its height, as a finger would (a drag moves a word 0.9 of
   * the way across and 0.4 of the way up or down); `null` when the field offers no such pair. */
  async function dragRelativeOverFarWord(page) {
    const plan = await page.evaluate(
      ({ far }) => {
        const page = document.documentElement;
        const box = (el) => el.getBoundingClientRect();
        const middle = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        const relatives = [...document.querySelectorAll('#sky > .word.bsat')].map((el) => ({
          el,
          at: middle(box(el)),
        }));
        const faint = [...document.querySelectorAll('#sky > .word:not(.bsat):not(.bctr)')]
          .filter((el) => {
            const o = Number(getComputedStyle(el).opacity);
            return o > 0.08 && o < far;
          })
          .map((el) => ({ el, at: middle(box(el)), text: el.querySelector('.base').textContent }));
        let best = null;
        for (const r of relatives)
          for (const f of faint) {
            const dx = (f.at.x - r.at.x) / 0.9;
            const dy = (f.at.y - r.at.y) / 0.4;
            const to = { x: r.at.x + dx, y: r.at.y + dy };
            if (Math.abs(dx) < 30 || Math.abs(dx) > 320 || Math.abs(dy) > 70) continue;
            if (
              to.x < 60 ||
              to.x > page.clientWidth - 60 ||
              to.y < 120 ||
              to.y > page.clientHeight - 160
            )
              continue;
            const cost = Math.abs(dx) + Math.abs(dy) * 2;
            if (!best || cost < best.cost) best = { from: r.at, to, cost, far: f.text };
          }
        return best;
      },
      { far: FAR },
    );
    if (!plan) return null;
    await page.mouse.move(plan.from.x, plan.from.y);
    await page.mouse.down();
    await page.mouse.move(plan.to.x, plan.to.y, { steps: 6 });
    await page.waitForTimeout(500); // a far thing fades out in about 300 ms
    return plan;
  }

  describe('a plain window', () => {
    const shots = {};
    beforeAll(async () => {
      const { context, page } = await openFamily();
      try {
        shots.gathering = await page.evaluate(scene);
        await page.waitForTimeout(350);
        shots.moving = await page.evaluate(scene);
        await settle(page);
        shots.standing = await page.evaluate(scene);
        shots.dragged = await dragRelativeOverFarWord(page);
        if (shots.dragged) {
          shots.held = await page.evaluate(scene);
          await page.waitForTimeout(800);
          await page.mouse.up();
        }
        await page.evaluate(plantFaintOnRelative);
        shots.planted = await page.evaluate(scene);
      } finally {
        await context.close();
      }
    }, 60000);

    test('every line stops short of the words, while the family gathers and once it stands', () => {
      expect(shots.gathering.window).toEqual([GLASS.width, GLASS.height]);
      expectLinesStopShort(shots.gathering, { whole: false });
      expectLinesStopShort(shots.moving, { whole: false });
      expectLinesStopShort(shots.standing, { whole: true });
    });

    test('nothing faint lies under a word once the family stands', () => {
      expectNothingFaintUnder(shots.standing);
    });

    test('a relative carried over a far word: the lines still stop short, and the far word steps away', () => {
      expect(
        shots.dragged,
        'the field offers a relative and a far word at about its height',
      ).toBeTruthy();
      expectLinesStopShort(shots.held, { whole: false });
      expectNothingFaintUnder(shots.held);
    });

    test('controls: lines that end on the middle of their words are caught, and a faint character planted on a relative', () => {
      const family = shots.standing.words.filter((word) => word.role === 'relative');
      const middle = (word) => ({
        x: (word.box.l + word.box.r) / 2,
        y: (word.box.t + word.box.b) / 2,
      });
      const tapped = shots.standing.words.find((word) => word.role === 'tapped');
      const toMiddles = {
        ...shots.standing,
        marks: [],
        lines: family.map((word) => ({ from: middle(tapped), to: middle(word) })),
      };
      expect(() => expectLinesStopShort(toMiddles, { whole: true })).toThrow();
      // the family and the plant alone, so that nothing else on the field can answer for it
      const planted = {
        ...shots.planted,
        sprites: [],
        words: shots.planted.words.filter((word) => word.role || word.text === '雨'),
      };
      expect(() => expectNothingFaintUnder(planted)).toThrow(/the far word 雨 at 0\.2 lies under/);
    });
  });

  describe('a window that reports a narrower width than its page, as a WebKit window magnified 1.2 times does', () => {
    const shots = {};
    beforeAll(async () => {
      const { context, page } = await openFamily({ magnified: 1.2 });
      try {
        shots.gathering = await page.evaluate(scene);
        await settle(page);
        shots.standing = await page.evaluate(scene);
      } finally {
        await context.close();
      }
    }, 60000);

    test('the window says 1440 by 931 on a page 1728 by 1117', () => {
      expect(shots.standing.window).toEqual([1440, 931]);
      expect(shots.standing.page).toEqual([GLASS.width, GLASS.height]);
    });

    test('every line stops short of the words, gathering and standing', () => {
      expectLinesStopShort(shots.gathering, { whole: false });
      expectLinesStopShort(shots.standing, { whole: true });
    });

    test('nothing faint lies under a word once the family stands', () => {
      expectNothingFaintUnder(shots.standing);
    });
  });
});
