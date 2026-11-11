/* global process, console, URL, document, window, navigator, getComputedStyle, localStorage, HTMLMediaElement, HTMLCanvasElement */
/** The new first screen, 宙 (the sky), is part of the app (John, 2026-11-11 14:58: "lock it in, merge it if it is
 * ready").
 *
 * The whole app runs here as the production builder assembles it (KAIRO_SITE_DIR in CI, else assembled once for this
 * file), silent, at John's window width: index.html loads sky/mount.mjs
 * beside the old first screen (drift-layer.js), and the mount puts the sky over #drift-layer. Every existing walk and
 * test was written for the old screen, so a driven browser keeps it unless the address says ?sky=1; these tests ask
 * for the sky with ?sky=1 and check:
 *   · it mounts and draws (at least 300 labels once the fonts are in), the old layer stays in the page unseen with the
 *     learner's own words in it, and the level control (#lvl) stays visible on top; it follows the look and language;
 *   · John's note 74: every word gathered round a character of an opened word carries that character (強烈, 学校,
 *     大統領, 熾烈); 熾烈 opens on 熾 and 烈; a meaning link carries its stored relation and note;
 *   · the path: a word touched opens, its page button opens the app's page, Escape returns to the family still open,
 *     and the path's 宙 lets go;
 *   · every way it must not show, or must give the first screen back, ends with the old first screen and its words:
 *     a data file refused, no WebGL2, a browser that can draw only in software, the graphics context lost, frames
 *     that keep failing, ?sky=0, the stored switch off, a driven browser without ?sky=1, a window 390 wide, and another
 *     sky already mounting (the live design layer of the 18841 preview, whose newer copy must win).
 *
 * A browser that can draw only in software never gets the sky (lead, 2026-11-11, after the entry check's Linux runner,
 * with no graphics card, drew it far too slowly). Each browser is asked once, before the tests are laid out, whether it
 * draws on a graphics card, by the mount's own rule: a webgl2 context given with failIfMajorPerformanceCaveat, from a
 * renderer that is not a software one. The answer and the renderer are printed. Where it cannot, the cases that need
 * the sky drawn (?sky=1, the browser that is not driven, the context lost, the failing frames) assert instead that the
 * old first screen is given back, and say in their names that drawing was not exercised on this machine.
 *
 * Chromium by default, as the other tests here; KAIRO_BROWSER=webkit or =all runs it in WebKit as well. On macOS
 * Chromium is launched with --enable-gpu, since headless Chromium otherwise draws in SwiftShader on a Mac that has a
 * graphics card. SKY_CHROMIUM_ARGS replaces that flag, to see the software path on a machine with a graphics card:
 * SKY_CHROMIUM_ARGS=--use-gl=swiftshader (refused by failIfMajorPerformanceCaveat) or =--disable-gpu (given a
 * SwiftShader context, refused by the renderer's name). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
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
const CHROMIUM_ARGS =
  process.env.SKY_CHROMIUM_ARGS !== undefined
    ? process.env.SKY_CHROMIUM_ARGS.split(/\s+/u).filter(Boolean)
    : process.platform === 'darwin'
      ? ['--enable-gpu']
      : [];
const launchOptions = (engine) => ({
  headless: true,
  args: engine === 'chromium' ? ['--mute-audio', ...CHROMIUM_ARGS] : [],
});
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
const STORED = JSON.parse(
  readFileSync(join(CORRIDOR, 'data/proprietary_safe/sem.json'), 'utf8'),
).edges;
// the relation as the opened word's note says it (sky-web.js TXT)
const RELATION = {
  ja: { syn: '類義', ant: '対義', reg: '語感', fam: '同族', col: '共起', thm: '主題' },
  en: {
    syn: 'near in meaning',
    ant: 'opposite',
    reg: 'same sense, other tone',
    fam: 'same family',
    col: 'goes with',
    thm: 'same theme',
  },
};

/** No sound from tests (John, 2026-11-10), in either engine: media muted before it can play, speech swallowed, and an
 * AudioContext, should the page ask for one, suspended and kept so. */
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

/** Can this browser draw the sky on a graphics card? The mount's rule (sky/mount.mjs, drawingRefused): a webgl2
 * context with failIfMajorPerformanceCaveat, from a renderer that is not a software one. */
function drawingProbe() {
  const ask = (attributes) => document.createElement('canvas').getContext('webgl2', attributes);
  const fast = ask({ failIfMajorPerformanceCaveat: true });
  const gl = fast || ask();
  let renderer = null;
  if (gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  const software = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render driver/iu;
  return {
    webgl2: !!gl,
    caveatFree: !!fast,
    renderer,
    hardware: !!fast && !software.test(renderer || ''),
  };
}
const PROBE = {};
for (const engine of engines) {
  const browser = await BROWSERS[engine].launch(launchOptions(engine));
  try {
    PROBE[engine] = await (await browser.newPage()).evaluate(drawingProbe);
  } finally {
    await browser.close();
  }
}

/** The old first screen as the learner sees it: the layer and its sky shown, the sky's own words in it. */
function oldScreen() {
  const shown = (el) =>
    !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const words = [...document.querySelectorAll('#drift-layer #sky > .word')];
  return {
    view: document.body.dataset.view,
    marked: document.documentElement.hasAttribute('data-bunki-sky'),
    host: !!document.getElementById('bunki-sky'),
    layer: shown(document.getElementById('drift-layer')),
    sky: shown(document.querySelector('#drift-layer #sky')),
    words: words.filter((word) => shown(word) && Number(getComputedStyle(word).opacity) > 0).length,
  };
}

const settled = (states) =>
  `(() => { const s = window.__bunkiSkyApp; return !!s && ${JSON.stringify(states)}.includes(s.state); })()`;
const drawn = () =>
  !!window.__SKY__?.W?.ready &&
  !!window.__SKY__.W.fonts &&
  (window.__SKY__.W.stats?.labels || 0) >= 300;

let server;
let origin;
beforeAll(async () => {
  // the record saves only in an assembled site (served from the bare source folder it stays read-only, and its band
  // stands over the top left of the screen), so the app runs as built
  const site = resolveCorridorSite();
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
  await new Promise((done) => server?.close(done));
  // the run folder resolveCorridorEvidence() made for this file goes (an assembled site is about 0.5 GB);
  // KAIRO_KEEP_TEST_EVIDENCE=1 keeps it, and a supplied KAIRO_EVIDENCE_DIR is never removed
  if (!process.env.KAIRO_EVIDENCE_DIR && process.env.KAIRO_KEEP_TEST_EVIDENCE !== '1')
    rmSync(resolveCorridorEvidence(), { recursive: true, force: true });
});

describe.each(engines)('the sky (宙) as the app’s first screen, in %s', (engine) => {
  const probe = PROBE[engine];
  const draws = probe.hardware;
  // what the mount says when it gives the first screen back on this machine before drawing anything
  const refusal = probe.webgl2 ? 'software drawing' : 'no webgl2';
  const notHere = '(drawing not exercised on this machine: it draws only in software)';
  let browser;
  beforeAll(async () => {
    console.log(
      `sky drawing probe, ${engine} ${JSON.stringify(launchOptions(engine).args)}: ${JSON.stringify(probe)}` +
        (draws ? '' : ` — the sky is not drawn here; its cases assert the give-back (${refusal})`),
    );
    browser = await BROWSERS[engine].launch(launchOptions(engine));
  }, 60000);
  afterAll(async () => {
    await browser?.close();
  });

  /** One fresh profile on the app: `before` runs in the page before the app, `refuse` is a path the server refuses.
   * Returns the page once the app is ready and the sky's mount has settled on one of `until`. */
  async function open({
    query = '',
    viewport = GLASS,
    before = [],
    refuse = null,
    until = ['mounted', 'off', 'stood-down', 'gave-back'],
  } = {}) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript(silence);
    for (const [script, arg] of before) await context.addInitScript(script, arg);
    if (refuse) await context.route(`**/${refuse}`, (route) => route.abort());
    const requests = [];
    context.on('request', (request) => requests.push(new URL(request.url()).pathname));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${origin}/${query}`);
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
      timeout: 30000,
    });
    await page.waitForFunction(settled(until), null, { timeout: 30000 });
    return { context, page, requests, errors };
  }
  const state = (page) => page.evaluate(() => ({ ...window.__bunkiSkyApp }));
  async function expectOldScreen(page) {
    // the old layer's words fade in over about a second
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('#drift-layer #sky > .word')].filter(
          (word) => Number(getComputedStyle(word).opacity) > 0,
        ).length >= 8,
      null,
      { timeout: 15000 },
    );
    const seen = await page.evaluate(oldScreen);
    expect(seen).toMatchObject({
      view: 'drift',
      marked: false,
      host: false,
      layer: true,
      sky: true,
    });
    expect(seen.words).toBeGreaterThanOrEqual(8);
  }
  const skyFetched = (requests) =>
    requests.filter((path) => /\/sky\/sky(-world|-web)?\.js$|\/sky(-sem)?\.json$/u.test(path));
  /** The sky drawn: its data and fonts in, at least 300 labels. A wait that runs out says how far it got. */
  async function waitDrawn(page) {
    try {
      await page.waitForFunction(drawn, null, { timeout: 30000 });
    } catch (error) {
      const seen = await page
        .evaluate(() => ({
          app: window.__bunkiSkyApp,
          ready: !!window.__SKY__?.W?.ready,
          fonts: !!window.__SKY__?.W?.fonts,
          labels: window.__SKY__?.W?.stats?.labels ?? null,
          frames: window.__SKY__?.S?.frame ?? null,
        }))
        .catch((reason) => ({ unreadable: String(reason) }));
      console.log(`sky not drawn within 30 s, ${engine}: ${JSON.stringify(seen)}`);
      throw new Error(`the sky was not drawn within 30 s: ${JSON.stringify(seen)}`, {
        cause: error,
      });
    }
  }
  /** Where this browser draws only in software: the mount gives the old first screen back before it fetches anything. */
  async function expectSoftwareGiveBack(options) {
    const { context, page, requests } = await open({ ...options, until: ['gave-back', 'mounted'] });
    try {
      expect(await state(page)).toMatchObject({ state: 'gave-back', reason: refusal });
      expect(skyFetched(requests)).toEqual([]);
      await expectOldScreen(page);
    } finally {
      await context.close();
    }
  }

  if (!draws)
    test(`with ?sky=1: the old first screen is given back, nothing fetched ${notHere}`, async () => {
      await expectSoftwareGiveBack({ query: '?sky=1' });
    }, 90000);
  if (draws)
    describe('with ?sky=1', () => {
      let session;
      beforeAll(async () => {
        session = await open({ query: '?sky=1', until: ['mounted'] });
        await waitDrawn(session.page);
      }, 90000);
      afterAll(async () => {
        await session?.context.close();
      });

      test('it mounts over the old layer and draws; the old layer stays in the page, unseen, with its words', async () => {
        const { page } = session;
        const seen = await page.evaluate(() => {
          const host = document.getElementById('bunki-sky');
          const old = document.querySelector('#drift-layer #sky');
          return {
            marked: document.documentElement.getAttribute('data-bunki-sky'),
            inLayer: host?.parentElement?.id,
            labels: window.__SKY__.W.stats.labels,
            oldHidden: getComputedStyle(old).visibility,
            oldWords: old.querySelectorAll(':scope > .word .base').length,
            front: window.__SKY__.W.frontList.length,
          };
        });
        expect(seen.marked).toBe('1');
        expect(seen.inLayer).toBe('drift-layer');
        expect(seen.labels).toBeGreaterThanOrEqual(300);
        expect(seen.oldHidden).toBe('hidden');
        expect(seen.oldWords).toBeGreaterThanOrEqual(8);
        // the learner's own words, read from the old layer, stand in front
        expect(seen.front).toBeGreaterThanOrEqual(8);
        expect(await state(page)).toMatchObject({ state: 'mounted' });
      }, 30000);

      test('the level control (#lvl) stays visible and on top of the sky', async () => {
        const seen = await session.page.evaluate(() => {
          const lvl = document.querySelector('#drift-layer #lvl');
          const box = lvl.getBoundingClientRect();
          const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return {
            visibility: getComputedStyle(lvl).visibility,
            size: box.width * box.height,
            onTop: !!top?.closest('#lvl'),
          };
        });
        expect(seen).toMatchObject({ visibility: 'visible', onTop: true });
        expect(seen.size).toBeGreaterThan(0);
      }, 30000);

      test("John's note 74: every gathered word carries its hub's character; 熾烈 opens on 熾 and 烈; a meaning link carries its stored relation", async () => {
        const { page } = session;
        const opened = {};
        for (const word of ['強烈', '学校', '大統領', '熾烈']) {
          opened[word] = await page.evaluate((w) => {
            const api = window.__SKY__;
            if (!api.open(w)) return null;
            const web = api.W.web;
            const items = [...web.items.values()];
            const note = (item) => {
              const cap = web.caps.find((c) => c.of === item && / note/u.test(c.cls));
              return {
                tag: cap?.node.querySelector('.tag')?.textContent ?? null,
                note: cap?.node.querySelector('.nt')?.textContent ?? '',
              };
            };
            return {
              lang: api.opt.lang,
              centre: items.filter((i) => i.role === 'centre').map((i) => i.text),
              hubs: items.filter((i) => i.role === 'hub').map((i) => i.text),
              family: items
                .filter((i) => i.role === 'fam')
                .map((i) => ({ text: i.text, hub: i.from?.text, marks: i.marks })),
              sem: items.filter((i) => i.role === 'sem').map((i) => ({ text: i.text, ...note(i) })),
            };
          }, word);
        }
        for (const [word, seen] of Object.entries(opened)) {
          expect(seen, `${word} opens`).toBeTruthy();
          expect(seen.centre).toEqual([word]);
          expect(seen.hubs.length, `${word} opens on its characters`).toBeGreaterThan(0);
          for (const hub of seen.hubs) expect(word).toContain(hub);
          expect(seen.family.length, `${word} gathers a family`).toBeGreaterThan(0);
          for (const member of seen.family) {
            expect(seen.hubs).toContain(member.hub);
            expect(member.text, `${member.text} hangs from ${member.hub}`).toContain(member.hub);
            expect(member.marks.length).toBeGreaterThan(0);
            for (const at of member.marks) expect([...member.text][at]).toBe(member.hub);
          }
        }
        expect(opened['熾烈'].hubs).toEqual(['熾', '烈']);
        expect(opened['大統領'].hubs).toEqual(['大', '統', '領']);
        const school = opened['学校'];
        expect(school.sem.length).toBeGreaterThan(0);
        for (const link of school.sem) {
          const stored = [
            ...(STORED['学校'] || []).filter((e) => e.w === link.text),
            ...(STORED[link.text] || []).filter((e) => e.w === '学校'),
          ];
          expect(stored.length, `学校 and ${link.text} are linked in sem.json`).toBeGreaterThan(0);
          expect(link.tag).toBe(RELATION[school.lang][stored[0].rel]);
          expect(link.note).toBe(stored[0].note || '');
        }
        await page.evaluate(() => window.__SKY__.close());
      }, 30000);

      test('it follows the look and the language', async () => {
        const { page } = session;
        const before = await page.evaluate(() => ({
          look: window.__SKY__.S.look,
          lang: window.__SKY__.opt.lang,
          theme: document.documentElement.getAttribute('data-theme') || '',
          bi: document.body.classList.contains('ui-bi'),
        }));
        expect(before.look).toBe(before.theme || 'hokusai');
        expect(before.lang).toBe(before.bi ? 'en' : 'ja');
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sumi'));
        await page.waitForFunction(() => window.__SKY__.S.look === 'sumi');
        await page.evaluate(() => document.body.classList.toggle('ui-bi'));
        await page.waitForFunction(
          (lang) => window.__SKY__?.opt?.lang === lang,
          before.bi ? 'ja' : 'en',
        );
        await page.evaluate(({ theme, bi }) => {
          if (theme) document.documentElement.setAttribute('data-theme', theme);
          else document.documentElement.removeAttribute('data-theme');
          document.body.classList.toggle('ui-bi', bi);
        }, before);
        await page.waitForFunction((lang) => window.__SKY__?.opt?.lang === lang, before.lang);
        await waitDrawn(page);
      }, 60000);

      test('the path: a touched word opens, its page button opens the app’s page, Escape returns to the family, 宙 lets go', async () => {
        const { page } = session;
        let word = null;
        for (let attempt = 0; attempt < 10 && !word; attempt += 1) {
          const target = await page.evaluate(() => {
            const W = window.__SKY__.W;
            const box = window.__SKY__.wrap.getBoundingClientRect();
            const door = window.__BUNKI_OPEN_ENTRY;
            const pick = W.hits
              .map((i) => ({
                i,
                x: W.vis[i * 5],
                y: W.vis[i * 5 + 1],
                size: W.vis[i * 5 + 2],
                alpha: W.vis[i * 5 + 3],
              }))
              .filter(
                (h) =>
                  h.alpha > 0.5 &&
                  h.size >= 18 &&
                  h.x > box.width * 0.25 &&
                  h.x < box.width * 0.75 &&
                  h.y > box.height * 0.2 &&
                  h.y < box.height * 0.65 &&
                  door.has('word', W.D.words[h.i][0]),
              )
              .sort((a, b) => b.size - a.size)[0];
            return pick ? { x: box.left + pick.x, y: box.top + pick.y } : null;
          });
          if (!target) {
            await page.waitForTimeout(400);
            continue;
          }
          await page.mouse.click(target.x, target.y);
          word = await page
            .waitForFunction(
              () => {
                const web = window.__SKY__.W.web;
                return (
                  web.isOpen() && web.cur.kind === 'w' && window.__SKY__.W.D.words[web.cur.id][0]
                );
              },
              null,
              { timeout: 2500 },
            )
            .then(
              (handle) => handle.jsonValue(),
              () => null,
            );
        }
        expect(word, 'a touched word opens into its characters').toBeTruthy();
        await page.locator('#bunki-sky .cap .act').first().click();
        await page.waitForFunction(
          (w) => {
            const sheet = document.getElementById('sheet');
            return (
              !!sheet &&
              sheet.getClientRects().length > 0 &&
              getComputedStyle(sheet).visibility !== 'hidden' &&
              sheet.textContent.includes(w)
            );
          },
          word,
          { timeout: 15000 },
        );
        // the sky rests under the page, so Escape belongs to the page
        await page.waitForFunction(() => window.__SKY__.S.paused === true, null, { timeout: 5000 });
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () => {
            const sheet = document.getElementById('sheet');
            return (
              document.body.dataset.view === 'drift' &&
              (!sheet ||
                sheet.getClientRects().length === 0 ||
                getComputedStyle(sheet).visibility === 'hidden')
            );
          },
          null,
          { timeout: 15000 },
        );
        await page.waitForFunction(() => window.__SKY__.S.paused === false, null, {
          timeout: 5000,
        });
        expect(
          await page.evaluate(() => {
            const web = window.__SKY__.W.web;
            return web.isOpen() && window.__SKY__.W.D.words[web.cur.id][0];
          }),
          'the family is still open',
        ).toBe(word);
        // In a fresh headless profile the app's record band ("Your learning is not being saved") stands over the top
        // left, where the path is: the base this branch starts from (8efcbdf7a) shows it over the old first screen as
        // well. It is set aside so that the press lands on the path as a learner's does.
        await page.addStyleTag({ content: '#record-band{display:none!important}' });
        const home = page.locator('#bunki-sky .trail button').first();
        expect(await home.textContent()).toBe('宙');
        await home.click();
        await page.waitForFunction(() => !window.__SKY__.W.web.isOpen(), null, { timeout: 5000 });
      }, 90000);
    });

  describe('the old first screen stays, or comes back whole', () => {
    const hideDriver = () =>
      Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    const switchedOff = () => {
      try {
        localStorage.setItem('bunki-live:sky', '0');
      } catch {
        /* no storage: nothing to switch */
      }
    };
    const noWebgl2 = () => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...options) {
        return type === 'webgl2' ? null : real.call(this, type, ...options);
      };
    };
    const anotherSky = () => {
      window.__bunkiSkyMount = true;
    };
    // the live design layer of the 18841 preview, as it loads today: its deferred live.js adds the design copy's
    // mount script after the app's own module has run, and that script sets the flag only once it has arrived
    const designLayer = () =>
      document.addEventListener('DOMContentLoaded', () => {
        const script = document.createElement('script');
        script.src = '/design/sky/mount.js?v=test';
        script.async = true;
        document.head.appendChild(script);
      });

    // what a browser that can draw only in software is like, on any machine: no context is given when the request
    // carries failIfMajorPerformanceCaveat
    const softwareOnly = () => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attributes, ...rest) {
        if (type === 'webgl2' && attributes?.failIfMajorPerformanceCaveat) return null;
        return real.call(this, type, attributes, ...rest);
      };
    };

    if (draws)
      test('control: a browser that is not driven gets the sky without asking', async () => {
        const { context, page } = await open({ before: [[hideDriver]], until: ['mounted'] });
        try {
          await waitDrawn(page);
          expect(await page.evaluate(() => document.documentElement.dataset.bunkiSky)).toBe('1');
        } finally {
          await context.close();
        }
      }, 90000);
    else
      test(`a browser that is not driven: the old first screen is given back ${notHere}`, async () => {
        await expectSoftwareGiveBack({ before: [[hideDriver]] });
      }, 90000);

    const cases = [
      {
        name: 'a driven browser without ?sky=1',
        options: {},
        want: { state: 'off', reason: 'driven' },
        quiet: true,
      },
      {
        name: '?sky=0',
        options: { query: '?sky=0', before: [[hideDriver]] },
        want: { state: 'off', reason: 'asked' },
        quiet: true,
      },
      {
        name: 'the stored switch bunki-live:sky = 0',
        options: { before: [[hideDriver], [switchedOff]] },
        want: { state: 'off', reason: 'asked' },
        quiet: true,
      },
      {
        name: 'a window 390 wide',
        options: { query: '?sky=1', viewport: { width: 390, height: 844 } },
        want: { state: 'off', reason: 'narrow' },
        quiet: true,
      },
      {
        name: 'another sky already mounting (window.__bunkiSkyMount set)',
        options: { query: '?sky=1', before: [[anotherSky]] },
        want: { state: 'stood-down' },
        quiet: true,
      },
      {
        name: 'the live design layer has put its own sky in the page (its flag not yet set)',
        options: { query: '?sky=1', before: [[designLayer]] },
        want: { state: 'stood-down' },
        quiet: true,
      },
      {
        name: 'the share_alike data file refused',
        options: { query: '?sky=1', refuse: 'data/share_alike/sky.json' },
        want: { state: 'gave-back', reason: draws ? 'share_alike/sky.json' : refusal },
        quiet: !draws,
      },
      {
        name: 'the proprietary_safe data file refused',
        options: { query: '?sky=1', refuse: 'data/proprietary_safe/sky-sem.json' },
        want: { state: 'gave-back', reason: draws ? 'proprietary_safe/sky-sem.json' : refusal },
        quiet: !draws,
      },
      {
        name: "getContext('webgl2') returning null",
        options: { query: '?sky=1', before: [[noWebgl2]] },
        want: { state: 'gave-back', reason: 'no webgl2' },
        quiet: true,
      },
      {
        name: 'control, on every machine: a browser that can draw only in software (no context with failIfMajorPerformanceCaveat)',
        options: { query: '?sky=1', before: [[softwareOnly]] },
        want: { state: 'gave-back', reason: probe.webgl2 ? 'software drawing' : 'no webgl2' },
        quiet: true,
      },
    ];
    for (const { name, options, want, quiet } of cases)
      test(`${name}: the old first screen, with its words`, async () => {
        const { context, page, requests } = await open(options);
        try {
          const seen = await state(page);
          expect(seen.state).toBe(want.state);
          if (want.reason) expect(seen.reason).toContain(want.reason);
          // a sky that is not shown is not loaded either
          if (quiet) expect(skyFetched(requests)).toEqual([]);
          await expectOldScreen(page);
        } finally {
          await context.close();
        }
      }, 90000);

    for (const [name, fail] of [
      [
        'the graphics context lost',
        () =>
          document
            .getElementById('bunki-sky')
            .shadowRoot.querySelector('canvas')
            .getContext('webgl2')
            .getExtension('WEBGL_lose_context')
            .loseContext(),
      ],
      [
        'five failing frames',
        () => {
          window.__SKY__.S.update = () => {
            throw new Error('a frame that fails (test)');
          };
        },
      ],
    ])
      if (!draws)
        test(`${name} after the sky stood: never reached, the old first screen is given back first ${notHere}`, async () => {
          await expectSoftwareGiveBack({ query: '?sky=1' });
        }, 90000);
      else
        test(`${name} after the sky stood: the old first screen comes back, with its words`, async () => {
          const { context, page } = await open({ query: '?sky=1', until: ['mounted'] });
          try {
            await waitDrawn(page);
            await page.evaluate(fail);
            await page.waitForFunction(settled(['gave-back']), null, { timeout: 10000 });
            expect(await page.evaluate(() => window.__SKY__ ?? null)).toBe(null);
            await expectOldScreen(page);
          } finally {
            await context.close();
          }
        }, 90000);
  });
});
