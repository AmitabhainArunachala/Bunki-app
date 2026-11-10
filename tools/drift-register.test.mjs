/* global process, URL, document, window, getComputedStyle, requestAnimationFrame, HTMLMediaElement */
/** The first screen's family lines stand on its words (2026-11-11).
 *
 * A tapped word gathers its family and a gold line runs from the word to each relative. John's window showed the
 * lines as a second copy of the family, 1.2 times larger, measured from the window's top-left corner: the lines were
 * ink on canvas#fx, whose pixels were counted from window.innerWidth and innerHeight, while its box and the words
 * (DOM children of #sky) are laid out on the page. WebKit reports the VISIBLE area in innerWidth and innerHeight
 * when a page is magnified (bugs.webkit.org 174362), so the canvas was stretched under words that had not moved.
 *
 * The generated layer runs here alone, silent, at John's window size and device scale. Every line is read where the
 * browser placed it (its own matrix to the screen) and compared with the middle of the word it ties, as the browser
 * placed that: in a plain window, in a window that reports its visible area as a magnified WebKit window does
 * (innerWidth and innerHeight are the page's size divided by 1.2 before any script runs), and across a resize.
 * Two controls move the overlay the way the defect did and must be caught.
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
const SMALLER = { width: 1440, height: 931 };
const TOLERANCE = 2; // CSS px, the lead's line for "the line meets the word"

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

// what the browser shows: the tapped word, its relatives, each line's two ends on the screen, the two canvases
function familyOnScreen() {
  const middle = (el) => {
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  const sky = document.getElementById('sky');
  const overlay = sky.querySelector(':scope > svg.threads');
  const lines = overlay
    ? [...overlay.querySelectorAll('line')].filter(
        (line) => getComputedStyle(line).display !== 'none',
      )
    : [];
  const centre = sky.querySelector(':scope > .word.bctr');
  const canvas = (id) => {
    const el = document.getElementById(id);
    return { pixels: [el.width, el.height], box: [el.clientWidth, el.clientHeight] };
  };
  return {
    window: [window.innerWidth, window.innerHeight],
    page: [document.documentElement.clientWidth, document.documentElement.clientHeight],
    deviceScale: window.devicePixelRatio,
    centre: centre ? middle(centre) : null,
    family: [...sky.querySelectorAll(':scope > .word.bsat')].map(middle),
    lines: lines.map((line) => {
      const toScreen = line.getScreenCTM();
      const at = (x, y) => {
        const point = overlay.createSVGPoint();
        point.x = x;
        point.y = y;
        const seen = point.matrixTransform(toScreen);
        return { x: seen.x, y: seen.y };
      };
      return {
        from: at(line.x1.baseVal.value, line.y1.baseVal.value),
        to: at(line.x2.baseVal.value, line.y2.baseVal.value),
        vector: line instanceof window.SVGLineElement,
      };
    }),
    fx: canvas('fx'),
    ink: canvas('ink'),
  };
}
// the controls: the overlay moved as a whole, or stretched from the corner the way the canvas was
function moveOverlay(transform) {
  const overlay = document.querySelector('#sky > svg.threads');
  if (!overlay) return;
  overlay.style.transformOrigin = '0 0';
  overlay.style.transform = transform;
}

const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (point, places) => Math.min(...places.map((place) => apart(point, place)));
// how far the lines stand from their words: the worst start and the worst end, in CSS px
function misses(seen) {
  return {
    start: Math.max(...seen.lines.map((line) => apart(line.from, seen.centre))),
    end: Math.max(...seen.lines.map((line) => nearest(line.to, seen.family))),
  };
}
/** Every line starts on the tapped word and ends on a relative. `whole` also asks for one line to each relative,
 * which holds once the family stands: while it gathers, a relative still outside the glass has no line yet. */
function expectRegistered(seen, { whole }) {
  expect(seen.centre, 'a tapped word stands at the centre').not.toBeNull();
  expect(seen.family.length, 'the family has gathered').toBeGreaterThanOrEqual(3);
  expect(seen.lines.length, 'the family has lines the page can point at').toBeGreaterThan(0);
  const miss = misses(seen);
  expect(miss.start, 'every line starts on the tapped word').toBeLessThanOrEqual(TOLERANCE);
  expect(miss.end, 'every line ends on a relative').toBeLessThanOrEqual(TOLERANCE);
  if (!whole) return;
  expect(seen.lines.length, 'one line to each relative').toBe(seen.family.length);
  for (const relative of seen.family) {
    const tied = seen.lines.filter((line) => apart(line.to, relative) <= TOLERANCE);
    expect(tied.length, 'each relative is tied once').toBe(1);
  }
}
// canvas#fx and canvas#ink hold as many pixels as their boxes ask for (#ink is drawn at half scale)
function expectCanvasesFitTheirBoxes(seen) {
  expect(seen.fx.pixels).toEqual(seen.fx.box);
  expect(seen.ink.pixels).toEqual(seen.fx.box.map((side) => Math.max(1, Math.round(side * 0.5))));
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

describe.each(engines)('the family lines stand on the words, in %s', (engine) => {
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
  async function openFamily({ viewport = GLASS, magnified = 0 } = {}) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    await context.addInitScript(silence);
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

  describe('a plain window', () => {
    const shots = {};
    beforeAll(async () => {
      const { context, page } = await openFamily();
      try {
        shots.gathering = await page.evaluate(familyOnScreen);
        await settle(page);
        shots.standing = await page.evaluate(familyOnScreen);
        await page.evaluate(moveOverlay, 'translate(6px, 0)');
        shots.moved = await page.evaluate(familyOnScreen);
        await page.evaluate(moveOverlay, 'scale(1.2)');
        shots.stretched = await page.evaluate(familyOnScreen);
      } finally {
        await context.close();
      }
    }, 60000);

    test('every line starts on the tapped word and ends on a relative, gathering and standing', () => {
      expect(shots.gathering.window).toEqual([GLASS.width, GLASS.height]);
      expectRegistered(shots.gathering, { whole: false });
      expectRegistered(shots.standing, { whole: true });
      expectCanvasesFitTheirBoxes(shots.standing);
    });

    test('the lines are vector, and canvas#fx is still one pixel to a CSS pixel at device scale 2', () => {
      expect(shots.standing.deviceScale).toBe(2);
      expect(shots.standing.lines.length).toBeGreaterThan(0);
      expect(shots.standing.lines.every((line) => line.vector)).toBe(true);
      expect(shots.standing.fx.pixels).toEqual([GLASS.width, GLASS.height]);
    });

    test('control: an overlay moved 6 px is caught, and one stretched 1.2 times from the corner', () => {
      // the same family passes where it stands and goes red once its lines are moved
      expectRegistered(shots.standing, { whole: true });
      expect(() => expectRegistered(shots.moved, { whole: true })).toThrow();
      const moved = misses(shots.moved);
      expect(moved.start).toBeGreaterThan(5.5);
      expect(moved.start).toBeLessThan(6.5);
      // John's picture: the hub of the lines stands a fifth of the word's own position right of and below the word
      expect(() => expectRegistered(shots.stretched, { whole: true })).toThrow();
      const hub = shots.stretched.lines[0].from;
      const word = shots.stretched.centre;
      expect(hub.x - word.x).toBeCloseTo(word.x * 0.2, 0);
      expect(hub.y - word.y).toBeCloseTo(word.y * 0.2, 0);
    });
  });

  describe('a window that reports its visible area, as a WebKit window magnified 1.2 times does', () => {
    const shots = {};
    beforeAll(async () => {
      const { context, page } = await openFamily({ magnified: 1.2 });
      try {
        shots.gathering = await page.evaluate(familyOnScreen);
        await settle(page);
        shots.standing = await page.evaluate(familyOnScreen);
      } finally {
        await context.close();
      }
    }, 60000);

    test('the window says 1440 by 931 on a page 1728 by 1117', () => {
      expect(shots.standing.window).toEqual([1440, 931]);
      expect(shots.standing.page).toEqual([GLASS.width, GLASS.height]);
    });

    test('every line starts on the tapped word and ends on a relative, gathering and standing', () => {
      expectRegistered(shots.gathering, { whole: false });
      expectRegistered(shots.standing, { whole: true });
    });

    test('the canvases are counted from their boxes, so their ink is not stretched either', () => {
      expectCanvasesFitTheirBoxes(shots.standing);
      expect(shots.standing.fx.pixels).toEqual([GLASS.width, GLASS.height]);
    });
  });

  describe('a window resized with the family open', () => {
    const shots = {};
    beforeAll(async () => {
      const { context, page } = await openFamily({ viewport: SMALLER });
      try {
        await settle(page);
        shots.before = await page.evaluate(familyOnScreen);
        await page.setViewportSize(GLASS);
        await page.waitForTimeout(1200);
        shots.after = await page.evaluate(familyOnScreen);
      } finally {
        await context.close();
      }
    }, 60000);

    test('every line starts on the tapped word and ends on a relative, before and after', () => {
      expect(shots.before.page).toEqual([SMALLER.width, SMALLER.height]);
      expectRegistered(shots.before, { whole: true });
      expect(shots.after.page).toEqual([GLASS.width, GLASS.height]);
      expectRegistered(shots.after, { whole: true });
    });

    test('the canvases follow the window', () => {
      expectCanvasesFitTheirBoxes(shots.before);
      expectCanvasesFitTheirBoxes(shots.after);
      expect(shots.after.fx.pixels).toEqual([GLASS.width, GLASS.height]);
    });
  });
});
