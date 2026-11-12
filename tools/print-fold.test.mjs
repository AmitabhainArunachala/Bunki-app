/* global process, document, window, getComputedStyle, HTMLMediaElement, localStorage, URL, performance, requestAnimationFrame */
/** The print look is part of the build (PRINT-FOLD, 2026-11-12).
 *
 * Until now the Mac preview (18841) showed the app plus a live design layer that its server injects from a folder
 * outside the repository: the print look (a printed sky, washi sheets), and live.js, which reads two things from the
 * page for it. scripts/fold-print-look.mjs folds the sheets into prototypes/corridor/depth.css and copies the plates
 * into prototypes/corridor/print/; prototypes/corridor/print-look.mjs is the part of live.js the look needs. The app
 * runs here as the production builder assembles it (KAIRO_SITE_DIR, else assembled once for this file), silent, at
 * John's window size, and these tests check:
 *   (a) on an article, <html> carries data-cover and the article's two pigments, --cover-a and --cover-b, as rgb()
 *       colours; leaving the article takes all three away;
 *   (b) on the old first screen (a driven browser without ?sky=1 keeps it), <html> carries data-sky-ink; every word
 *       a learner can tap (shown at 0.3 or more by the layer) is marked near or mid; every word standing in the deep
 *       part of the printed sky carries a data-ink, no word below the printed sky does (there it keeps its own ink,
 *       which reads on bare paper, as the design layer's rule says), and every value is one the stylesheet prints;
 *       in a night look (金) the words are marked but nothing is inked;
 *   (c) the built site holds no /design/ address (that path is answered only by the preview's server), and every
 *       plate depth.css and print-look.mjs name is in it, byte for byte the repository's copy;
 * and three controls: with print-look.mjs refused, none of it appears (so (a) and (b) see the module's work, not
 * something else's); with the design layer's flag in the page (18841), the module stands down and writes nothing.
 *
 * Chromium by default, as the other tests here; KAIRO_BROWSER=webkit or =all runs it in WebKit as well. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolveCorridorEvidence, resolveCorridorSite } from '../scripts/resolve-corridor-site.mjs';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CORRIDOR = join(REPO, 'prototypes/corridor');
const BROWSERS = { chromium, webkit };
const engines =
  process.env.KAIRO_BROWSER === 'all'
    ? ['chromium', 'webkit']
    : process.env.KAIRO_BROWSER === 'webkit'
      ? ['webkit']
      : ['chromium'];
const GLASS = { width: 1728, height: 1084 };
// A hosted runner draws in software on two slow cores. PRINT_FOLD_CPU_SLOWDOWN=<n> slows Chromium's CPU n times (DevTools
// throttling), so a run on a fast machine can show what the runner sees.
const SLOWDOWN = Number(process.env.PRINT_FOLD_CPU_SLOWDOWN || 0);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** No sound from tests (John, 2026-11-10), in either engine. */
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

let site;
let server;
let origin;
beforeAll(async () => {
  site = resolveCorridorSite();
  server = createServer(async (request, response) => {
    let path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(site, path));
    try {
      if (!file.startsWith(site + sep)) throw new Error('not served');
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': TYPES[extname(file)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
}, 300000);
afterAll(async () => {
  if (server) await new Promise((done) => server.close(done));
  // the run folder resolveCorridorEvidence() made for this file goes (an assembled site is about 0.5 GB)
  if (!process.env.KAIRO_EVIDENCE_DIR && process.env.KAIRO_KEEP_TEST_EVIDENCE !== '1')
    rmSync(resolveCorridorEvidence(), { recursive: true, force: true });
});

describe('(c) the built site carries the print look itself', () => {
  const TEXT = new Set([
    '.html',
    '.css',
    '.js',
    '.mjs',
    '.json',
    '.webmanifest',
    '.txt',
    '.md',
    '.svg',
  ]);
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });

  test('no /design/ address: the preview server is the only thing that answers that path', () => {
    // Two mentions are not addresses the app asks for: the repository's own docs/design/ named in comments, and the
    // sky mount's check for the 18841 design layer's script (sky/mount.mjs, a selector, not a request).
    const SKY_GUARD = 'script[src*="/design/sky/"]';
    const allowed = (text, at) =>
      text.slice(Math.max(0, at - 4), at) === 'docs' ||
      text.startsWith(SKY_GUARD, at - SKY_GUARD.indexOf('/design/'));
    const found = [];
    for (const file of files(site)) {
      if (!TEXT.has(extname(file))) continue;
      const text = readFileSync(file, 'utf8');
      for (let at = text.indexOf('/design/'); at >= 0; at = text.indexOf('/design/', at + 1)) {
        if (allowed(text, at)) continue;
        const line = text.slice(0, at).split('\n').length;
        found.push(`${relative(site, file)}:${line} ${text.slice(Math.max(0, at - 30), at + 40)}`);
      }
    }
    expect(found).toEqual([]);
  });

  test('every plate depth.css and print-look.mjs name is in the build, byte for byte the repository’s', () => {
    const sheet = readFileSync(join(site, 'depth.css'), 'utf8');
    const reader = readFileSync(join(site, 'print-look.mjs'), 'utf8');
    const urls = [...sheet.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gu)].map((m) => m[2]);
    // nothing in the folded sheet points outside the build: data: or the plates beside it
    expect(
      urls.filter((url) => !url.startsWith('data:') && !/^print\/[\w-]+\.webp$/u.test(url)),
    ).toEqual([]);
    const named = new Set([
      ...urls.filter((url) => url.startsWith('print/')).map((url) => url.slice(6)),
      ...[...reader.matchAll(/plate\('([\w-]+\.webp)'\)/gu)].map((m) => m[1]),
    ]);
    expect(named.size).toBeGreaterThanOrEqual(5);
    for (const plate of named) {
      const built = readFileSync(join(site, 'print', plate));
      expect(built.length, plate).toBeGreaterThan(1000);
      expect(sha(built), plate).toBe(sha(readFileSync(join(CORRIDOR, 'print', plate))));
    }
    const identity = JSON.parse(readFileSync(join(site, 'build-identity.json'), 'utf8'));
    const listed = new Set(identity.files.map((file) => file.path));
    for (const plate of named) expect(listed.has(`print/${plate}`), plate).toBe(true);
  });

  test('the page loads the folded sheet and the reader; the sheet holds the print look', () => {
    const index = readFileSync(join(site, 'index.html'), 'utf8');
    expect(index).toMatch(/<link rel="stylesheet" href="depth\.css" \/>/u);
    expect(index).toMatch(/<script type="module" src="print-look\.mjs"><\/script>/u);
    expect(index).toMatch(/<html lang="ja" data-live-depth="1">/u);
    const sheet = readFileSync(join(site, 'depth.css'), 'utf8');
    for (const part of [
      '[data-cover]',
      'var(--cover-a)',
      '[data-sky-ink]',
      "[data-ink='sky']",
      "[data-wisp^='p']",
    ])
      expect(sheet, part).toContain(part);
  });
});

describe.each(engines)('the print look reads the page, in %s', (engine) => {
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

  /** One fresh profile on the app's old first screen. `refuse` names a path the server refuses; `before` runs in the
   * page before the app. */
  async function open({ refuse = null, before = [], look = null } = {}) {
    const context = await browser.newContext({ viewport: GLASS, deviceScaleFactor: 1 });
    await context.addInitScript(silence);
    if (look)
      await context.addInitScript((id) => {
        try {
          localStorage.setItem('kairo-theme', id);
        } catch {
          /* the look stays the default */
        }
      }, look);
    for (const script of before) await context.addInitScript(script);
    if (refuse) await context.route(`**/${refuse}`, (route) => route.abort());
    const page = await context.newPage();
    if (SLOWDOWN > 1 && engine === 'chromium')
      await (
        await context.newCDPSession(page)
      ).send('Emulation.setCPUThrottlingRate', {
        rate: SLOWDOWN,
      });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
      timeout: 30000,
    });
    await page.waitForFunction(
      () =>
        document.getElementById('drift-layer')?.classList.contains('active') &&
        [...document.querySelectorAll('#drift-layer #sky > .word')].filter(
          (word) => Number(word.style.opacity) >= 0.3,
        ).length >= 8,
      null,
      { timeout: 20000 },
    );
    return { context, page, errors };
  }
  const rootState = (page) =>
    page.evaluate(() => {
      const root = document.documentElement;
      return {
        cover: root.getAttribute('data-cover'),
        a: root.style.getPropertyValue('--cover-a'),
        b: root.style.getPropertyValue('--cover-b'),
        skyInk: root.getAttribute('data-sky-ink'),
        status: window.__bunkiPrintLook ?? null,
      };
    });
  async function openArticle(page) {
    await page.locator('#home-review').click();
    await page.locator('#tab-read').click();
    await page.locator('.shelf-open').first().click();
    await page.waitForFunction(() => document.body.dataset.view === 'reader');
    await page.waitForFunction(() => {
      const img = document.querySelector('#app > main > .reader-hero img.reader-picture-img');
      return !!img && img.complete && img.naturalWidth > 0;
    });
  }
  /** The words of the first screen, read twice a second apart (two rounds of the reader, which marks them every 450 ms):
   * a word counts as settled when it kept its faintness and its marks in between and moved less than 8 px (the words
   * drift a few pixels a second for as long as the screen is open, so their place is never quite still). Also what kept
   * the others from settling, and how many frames the page drew in that second. */
  const readSettled = (page) =>
    page.evaluate(async () => {
      const read = (word) => {
        const r = word.getBoundingClientRect();
        return {
          word: word.textContent.trim().slice(0, 12),
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          opacity: word.style.opacity,
          ink: word.getAttribute('data-ink'),
          wisp: word.getAttribute('data-wisp'),
          depth: word.getAttribute('data-depth'),
        };
      };
      const words = () => [...document.querySelectorAll('#drift-layer #sky > .word')];
      const first = new Map(words().map((word) => [word, read(word)]));
      let frames = 0;
      const until = performance.now() + 1000;
      await new Promise((done) => {
        const frame = () => {
          frames += 1;
          if (performance.now() < until) requestAnimationFrame(frame);
          else done();
        };
        requestAnimationFrame(frame);
      });
      const seen = { settled: [], tappable: 0, fading: 0, moving: 0, remarked: 0, frames };
      for (const word of words()) {
        const now = read(word);
        const then = first.get(word);
        if (Number(now.opacity) >= 0.3) seen.tappable += 1;
        if (!then) continue;
        const fading = then.opacity !== now.opacity;
        const moving = Math.abs(then.top - now.top) >= 8 || Math.abs(then.left - now.left) >= 8;
        const remarked = then.ink !== now.ink || then.wisp !== now.wisp || then.depth !== now.depth;
        if (fading) seen.fading += 1;
        if (moving) seen.moving += 1;
        if (remarked) seen.remarked += 1;
        if (!fading && !moving && !remarked) seen.settled.push(now);
      }
      return seen;
    });
  /** Waits until at least eight words a learner can tap (0.3 or more) have settled, and `ready` holds of the settled
   * words (`what` names it in the failure), and returns the settled words. The
   * layer fades its words in and drifts them into place over a few seconds, and a slow machine takes longer (GitHub's
   * runner draws in software on two cores: a fixed wait read every word there mid-fade, run 43143633615). So this
   * waits for the screen, not for a time, and says what it last saw if the screen never settles. */
  async function settledWords(page, ready = () => true, what = '') {
    const deadline = Date.now() + 45000;
    for (;;) {
      const seen = await readSettled(page);
      const tappable = seen.settled.filter((w) => Number(w.opacity) >= 0.3);
      if (tappable.length >= 8 && ready(seen.settled)) return seen.settled;
      if (Date.now() > deadline)
        throw new Error(
          `the first screen's words did not settle within 45 s${what ? ` with ${what}` : ''}: in the last second ` +
            `${seen.tappable} words stood at 0.3 or more and ${tappable.length} of them kept their faintness, place ` +
            `and marks (${seen.fading} were still fading, ${seen.moving} moving, ${seen.remarked} re-marked); the ` +
            `page drew ${seen.frames} frames`,
        );
    }
  }

  test('(a) an article: data-cover and its two pigments on entering, all three gone on leaving', async () => {
    const { context, page, errors } = await open();
    try {
      await openArticle(page);
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-cover') === '1',
        null,
        {
          timeout: 10000,
        },
      );
      const inside = await rootState(page);
      expect(inside.status).toBe('on');
      expect(inside.a).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/u);
      expect(inside.b).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/u);
      // the stylesheet prints the article's sky from them
      const sky = await page.evaluate(
        () => getComputedStyle(document.body, '::before').backgroundImage,
      );
      expect(sky).toContain('bokashi-block.webp');
      await page.locator('#tab-today').click();
      await page.waitForFunction(() => document.body.dataset.view !== 'reader');
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-cover'), null, {
        timeout: 10000,
      });
      const outside = await rootState(page);
      expect(outside).toMatchObject({ cover: null, a: '', b: '' });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 120000);

  test('(b) the old first screen: inked from the printed sky under each word', async () => {
    const { context, page, errors } = await open();
    try {
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-sky-ink') === '1',
        null,
        {
          timeout: 10000,
        },
      );
      // where the default look's plate lies on this page (drawn 50% 0 / max(100%, 1500px) auto; 843 by 2400, and the
      // deep pigment ends at 0.40 of its height: print-look.mjs SKY)
      const width = await page.evaluate(() => document.documentElement.clientWidth);
      const plateHeight = (Math.max(width, 1500) * 843) / 2400;
      const deepLine = plateHeight * 0.4;
      // the plate starts at the window's top edge and spans its width: a word still drifting in from outside the window
      // stands on no plate at all, so only words wholly inside it are held to the rule; 12 px of margin cover the drift
      // between the reader's last round and this reading
      const inDeepSky = (w) =>
        w.width && w.top >= 12 && w.left >= 12 && w.right <= width - 12 && w.bottom < deepLine - 12;
      const words = await settledWords(
        page,
        (settled) => settled.some(inDeepSky),
        'a word standing in the deep sky',
      );
      for (const w of words) {
        const o = Number(w.opacity);
        expect(w.depth, w.word).toBe(!(o >= 0.3) ? null : o >= 0.5 ? 'near' : 'mid');
        if (w.ink !== null) expect(['sky', 'haze'], w.word).toContain(w.ink);
        if (w.wisp !== null) {
          expect(w.wisp, w.word).toMatch(/^[pw][1-6]$/u);
          expect(w.ink, w.word).toBe(w.wisp.startsWith('p') ? 'sky' : 'haze');
        }
        if (!w.width) continue;
        if (inDeepSky(w)) expect(w.ink, `${w.word} in the deep sky`).not.toBeNull();
        if (w.top > plateHeight + 12) expect(w.ink, `${w.word} on bare paper`).toBeNull();
      }
      const deep = words.filter(inDeepSky);
      expect(deep.length, 'words standing in the deep sky').toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 120000);

  test('(b) a night look (金): its words are marked near or mid, and nothing is inked', async () => {
    const { context, page, errors } = await open({ look: 'yoru' });
    try {
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
        'yoru',
      );
      const words = await settledWords(page);
      for (const w of words) {
        const o = Number(w.opacity);
        expect(w.depth, w.word).toBe(!(o >= 0.3) ? null : o >= 0.5 ? 'near' : 'mid');
      }
      expect(words.filter((w) => w.ink || w.wisp)).toEqual([]);
      expect((await rootState(page)).skyInk).toBeNull();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 120000);

  test('control: with print-look.mjs refused, no attribute of it appears', async () => {
    const { context, page } = await open({ refuse: 'print-look.mjs' });
    try {
      // settled for a second: the reader, had it been there, would have marked the words twice by now
      await settledWords(page);
      const marked = await page.evaluate(
        () =>
          document.querySelectorAll(
            '#drift-layer [data-ink], #drift-layer [data-depth], #drift-layer [data-wisp]',
          ).length,
      );
      expect(marked).toBe(0);
      expect((await rootState(page)).skyInk).toBeNull();
      await openArticle(page);
      // the article's picture is in: the reader, had it been there, sets data-cover 90 ms after the page changes
      await page.waitForTimeout(1500);
      expect(await rootState(page)).toMatchObject({ cover: null, a: '', b: '', status: null });
    } finally {
      await context.close();
    }
  }, 120000);

  test('control: where the design layer is in the page (18841), the reader stands down', async () => {
    const { context, page } = await open({
      before: [
        () => {
          window.__bunkiLiveDepth = true;
        },
      ],
    });
    try {
      await settledWords(page);
      expect((await rootState(page)).status).toBe('stood-down');
      expect(
        await page.evaluate(
          () =>
            document.querySelectorAll('#drift-layer [data-ink], #drift-layer [data-depth]').length,
        ),
      ).toBe(0);
      await openArticle(page);
      // the article's picture is in: the reader, had it been there, sets data-cover 90 ms after the page changes
      await page.waitForTimeout(1500);
      expect(await rootState(page)).toMatchObject({ cover: null, skyInk: null });
    } finally {
      await context.close();
    }
  }, 120000);
});
