/* 宙 — puts the sky on the app's first screen (John, 2026-11-11 14:58: "lock it in, merge it if it is ready").
 * Loaded by index.html beside drift-layer.js, the old first screen. The engine (sky.js, sky-world.js, sky-web.js in
 * this folder) is the approved copy of PROGRAM/design/sky-v1-20261111-1458, unchanged but for one line the lead added
 * in the design copy since (sky.js asks for its context with failIfMajorPerformanceCaveat); this file is the app's own
 * mount, modelled on that copy's mount.js.
 *
 * The old first screen stays in the page, unseen and untouched: its words are the learner's own (read here, and again
 * whenever they change), its level control (#lvl) stays visible on top, and every automated check still meets the
 * screen it was written for, because a driven browser (navigator.webdriver) keeps the old screen unless the address
 * says ?sky=1. ?sky=0, or localStorage 'bunki-live:sky' = '0', keeps it too, and so does a window narrower than 720 px
 * when the sky would mount (an opened word is not laid out for a phone yet). If window.__bunkiSkyMount is set by then,
 * or the live design layer has put its own sky in the page, this one stands down: in the 18841 preview the lead's
 * newer copy wins. A browser that can draw only in software (no graphics card) never gets the sky (lead, 2026-11-11:
 * right for learners on weak machines): the drawing is checked before anything is fetched. Anything else wrong (a data
 * file refused, no WebGL2, the graphics context lost, five frames failing) gives the old first screen back, whole.
 *
 * The data is two files, one per licence pool, joined here in memory (joinSkyData). Reads nothing of the learner's
 * record and writes nothing; pages open through the app's own door (window.__BUNKI_OPEN_ENTRY). The decision is left
 * in window.__bunkiSkyApp = { state, reason, renderer } (waiting, off, stood-down, loading, mounted, gave-back). */

/** The two pool files into the one object the engine reads (sky-world.js): each meaning link's two words become row
 * numbers of the share_alike file. A link naming a word the file does not hold fails the join, and with it the sky. */
function joinSkyData(sky, sem) {
  const rows = new Map(sky.words.map((row, i) => [row[0], i]));
  const rowOf = (word) => {
    const i = rows.get(word);
    if (i === undefined) throw new Error(`sky data: ${word} is not a word of the sky`);
    return i;
  };
  return {
    v: sky.v,
    built: sky.built,
    counts: { ...sky.counts, sem: sem.sem.length },
    world: sky.world,
    notes: sky.notes,
    words: sky.words,
    kanji: sky.kanji,
    parts: sky.parts,
    sem: sem.sem.map(([a, b, rel, note]) => [rowOf(a), rowOf(b), rel, note]),
    sound: sky.sound,
    pos: sky.pos,
  };
}

const status = (window.__bunkiSkyApp = { state: 'waiting', reason: '' });
const settle = (state, reason = '') => Object.assign(status, { state, reason });
const here = (path) => new URL(path, import.meta.url).href;

/** '' when the sky is wanted on this visit, else why not. */
function offReason() {
  const asked = new URLSearchParams(location.search).get('sky');
  let stored = null;
  try {
    stored = localStorage.getItem('bunki-live:sky');
  } catch {
    /* no storage: this visit only */
  }
  if (asked === '1') return '';
  if (asked === '0' || stored === '0') return 'asked';
  if (navigator.webdriver === true) return 'driven';
  return '';
}

const lookOf = () => document.documentElement.getAttribute('data-theme') || 'hokusai';
const langOf = () => (document.body.classList.contains('ui-bi') ? 'en' : 'ja');
/** the learner's own words, as the old first screen shows them: [word, fragile] */
function ownWords() {
  return Array.prototype.map
    .call(document.querySelectorAll('#drift-layer #sky > .word'), (e) => {
      const b = e.querySelector('.base');
      return [(b ? b.textContent : '').trim(), e.classList.contains('fragile') ? 1 : 0];
    })
    .filter((x) => x[0]);
}
/** the sky rests while another view or the app's page is in front of it */
function covered() {
  if (document.body.dataset.view !== 'drift') return true;
  const sheet = document.getElementById('sheet');
  return !!sheet && sheet.getClientRects().length > 0 && getComputedStyle(sheet).visibility !== 'hidden';
}
/** the paper the tabs sit on, so the sky's horizon meets it */
function paper() {
  const tabs = document.querySelector('.primary-tabs');
  if (!tabs) return null;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(tabs).backgroundColor);
  return m && (m[4] == null || Number(m[4]) > 0.9) ? [m[1] / 255, m[2] / 255, m[3] / 255] : null;
}
const door = () => window.__BUNKI_OPEN_ENTRY;

let api = null;
let host = null;
let lang = null;
let dataUrl = null;
let gaveBack = false;

/** Renderers that draw in software: Chromium's SwiftShader, Mesa's llvmpipe, softpipe and lavapipe, Windows' basic
 * render driver. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render driver/iu;
/** '' where the sky can be drawn on a graphics card, else why not: 'software drawing' or 'no webgl2'. The engine asks
 * for its context with failIfMajorPerformanceCaveat, but headless Chromium, drawing in SwiftShader by default, is given
 * one all the same (measured 2026-11-11, Chromium 153 on macOS; only --use-gl=swiftshader is refused), so the
 * renderer's own name is read too. A plain request tells software from no WebGL2 at all. */
function drawingRefused() {
  const ask = (attributes) => {
    try {
      return document.createElement('canvas').getContext('webgl2', attributes);
    } catch {
      return null;
    }
  };
  const fast = ask({ failIfMajorPerformanceCaveat: true });
  const gl = fast || ask();
  if (!gl) return 'no webgl2';
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    status.renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch {
    /* a renderer that will not say its name is taken at its word */
  }
  return !fast || SOFTWARE.test(status.renderer || '') ? 'software drawing' : '';
}
/** The engine says only 'no webgl2' when it is given no context; say which. */
function failure(err) {
  const said = String((err && err.message) || err);
  return said === 'no webgl2' ? drawingRefused() || said : said;
}

/** anything wrong with the new sky: the old first screen comes back, whole */
function giveBack(err) {
  if (gaveBack) return;
  gaveBack = true;
  const reason = failure(err);
  try {
    console.error('SKY gave the first screen back', err);
    document.documentElement.removeAttribute('data-bunki-sky');
    if (api && api.destroy) api.destroy();
    if (host) host.remove();
  } catch {
    /* nothing more to undo */
  }
  host = null;
  api = null;
  window.__SKY__ = null;
  settle('gave-back', reason);
}

function start() {
  const layer = document.getElementById('drift-layer');
  if (gaveBack || !layer || !window.BunkiSky) return;
  if (!host) {
    host = document.createElement('div');
    host.id = 'bunki-sky';
    layer.appendChild(host);
    // the sky keeps its own touches: the old layer underneath never sees them
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'contextmenu'])
      host.addEventListener(type, (e) => e.stopPropagation());
    const style = document.createElement('style');
    style.textContent =
      'html[data-bunki-sky="1"] #drift-layer > :not(#bunki-sky):not(#lvl){visibility:hidden!important;pointer-events:none!important}#bunki-sky{position:absolute;inset:0;z-index:5}' +
      /* the learner's level control stays, on top of the new sky; it decides which words are his own */
      'html[data-bunki-sky="1"] #drift-layer > #lvl{z-index:6}';
    document.head.appendChild(style);
  }
  if (api) api.destroy();
  document.documentElement.setAttribute('data-bunki-sky', '1');
  lang = langOf();
  api = window.BunkiSky.mount(host, {
    look: lookOf(),
    lang,
    dataUrl,
    front: ownWords(),
    paused: covered,
    onFail: giveBack,
    paper,
    canOpen: (t) => {
      const d = door();
      return !!d && d.has(t.kind, t.kind === 'word' ? t.word : t.char);
    },
    onOpen: (t) => {
      const d = door();
      if (!d) return;
      const key = t.kind === 'word' ? t.word : t.char;
      if (d.has(t.kind, key)) d.open(t.kind, key);
    },
  });
  window.__SKY__ = api;
  if (api && api.ok) settle('mounted');
}

function watch() {
  const sky = document.querySelector('#drift-layer #sky');
  let timer = 0;
  let last = '';
  if (sky)
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const own = ownWords();
        const sig = own.map((x) => x[0]).sort().join('|');
        if (api && api.setFront && own.length > 8 && sig !== last) {
          last = sig;
          api.setFront(own);
        }
      }, 900);
    }).observe(sky, { childList: true });
  new MutationObserver(() => {
    if (api && api.ok) api.setLook(lookOf());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new MutationObserver(() => {
    if (api && langOf() !== lang) start();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function load(src) {
  return new Promise((done, fail) => {
    const s = document.createElement('script');
    s.src = here(src);
    s.onload = done;
    s.onerror = () => fail(new Error(`sky: ${src} did not load`));
    document.head.appendChild(s);
  });
}
async function json(path) {
  let response;
  try {
    response = await fetch(here(path));
  } catch (err) {
    throw new Error(`sky: ${path} did not arrive (${(err && err.message) || err})`);
  }
  if (!response.ok) throw new Error(`sky: ${path} answered ${response.status}`);
  return response.json();
}

/** The moment the sky would mount: another sky in the page wins, a narrow window keeps the old screen; otherwise the
 * engine and both data files are fetched, and the sky goes up only once all of them are here. */
async function mountOnce() {
  if (window.__bunkiSkyMount || document.querySelector('script[src*="/design/sky/"]'))
    return settle('stood-down', 'another sky is mounting');
  if (window.innerWidth < 720) return settle('off', 'narrow');
  const refused = drawingRefused();
  if (refused) return giveBack(new Error(refused));
  window.__bunkiSkyMount = 'app';
  settle('loading');
  try {
    const engine = load('sky.js')
      .then(() => load('sky-world.js'))
      .then(() => load('sky-web.js'));
    const [sky, sem] = await Promise.all([
      json('../data/share_alike/sky.json'),
      json('../data/proprietary_safe/sky-sem.json'),
      engine,
    ]);
    dataUrl = URL.createObjectURL(
      new Blob([JSON.stringify(joinSkyData(sky, sem))], { type: 'application/json' }),
    );
    start();
    if (!gaveBack) watch();
  } catch (err) {
    giveBack(err);
  }
}

const off = offReason();
if (off) settle('off', off);
else {
  let tries = 0;
  const wait = setInterval(() => {
    tries += 1;
    const ready = document.body.dataset.ready === '1' && document.getElementById('drift-layer');
    if (ready && (ownWords().length > 8 || tries > 24)) {
      clearInterval(wait);
      mountOnce();
    } else if (tries > 120) {
      clearInterval(wait);
      settle('off', 'no first screen');
    }
  }, 250);
}
