/* 宙 — puts the sky on the app's first screen (John, 2026-11-11 14:58: "lock it in, merge it if it is ready"; 21:03,
 * of version 2: "keep polishing, keep creating"). Loaded by index.html beside drift-layer.js, the old first screen.
 * The engine (sky.js, sky-world.js, sky-web.js in this folder) is a fixed copy from PROGRAM/design (sky-v3-*), byte for
 * byte; this file is the app's own mount, kept level with that copy's mount.js (the foot the tab bar covers, the
 * app's buttons over the sky, the context file).
 *
 * The old first screen stays in the page, unseen and untouched: its words are the learner's own (read here, and again
 * whenever they change), its level control (#lvl) stays visible on top, and every automated check still meets the
 * screen it was written for, because a driven browser (navigator.webdriver) keeps the old screen unless the address
 * says ?sky=1. ?sky=0, or localStorage 'bunki-live:sky' = '0', keeps it too. If window.__bunkiSkyMount is set by then,
 * or the live design layer has put its own sky in the page, this one stands down: in the 18841 preview the lead's
 * newer copy wins. A browser that can draw only in software (no graphics card) never gets the sky (lead, 2026-11-11:
 * right for learners on weak machines): the drawing is checked before anything is fetched. Anything else wrong (a data
 * file refused, no WebGL2, the graphics context lost, five frames failing) gives the old first screen back, whole.
 *
 * The data is two files, one per licence pool, joined here in memory (joinSkyData); the context (sentences from the
 * app's own reading, articles, grammar) is three, one per pool, joined the same way (joinSkyContext). The sky stands
 * without its context if those files fail; the reason is left in __bunkiSkyApp.context. Reads nothing of the learner's
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

/** The three pool files of the sky's context into the one object the engine reads (sky-world.js, setContext):
 * articles, their sentences, which words stand in which sentence and where, and grammar. Each file's rows carry their
 * place in the whole; a word is named by its text and becomes its row number in the sky's words. A row placed twice, a
 * gap, a sentence of an article that is not there, or an unknown word fails the join, and the sky goes on without it. */
function joinSkyContext(sky, files) {
  const rows = new Map(sky.words.map((row, i) => [row[0], i]));
  const rowOf = (word) => {
    const i = rows.get(word);
    if (i === undefined) throw new Error(`sky context: ${word} is not a word of the sky`);
    return i;
  };
  const place = (list, at, value, what) => {
    if (!Number.isInteger(at) || at < 0 || list[at] !== undefined)
      throw new Error(`sky context: ${what} ${at} is out of range or placed twice`);
    list[at] = value;
  };
  const whole = (list, what) => {
    for (let i = 0; i < list.length; i += 1)
      if (list[i] === undefined) throw new Error(`sky context: ${what} ${i} is missing`);
  };
  const articles = [];
  const articleWords = [];
  const sentences = [];
  const grammar = [];
  const grammarSource = [];
  const grammarTwin = [];
  const links = new Map();
  const notes = [];
  for (const file of files) {
    for (const [ai, id, title, titleEn, level, label, words] of file.articles || []) {
      place(articles, ai, [id, title, titleEn, level, label], 'article');
      articleWords[ai] = words.map(rowOf);
    }
    for (const [si, code, text, en] of file.sentences || []) place(sentences, si, [code, text, en], 'sentence');
    for (const [word, si, start, length, rank] of file.links || []) {
      const wi = rowOf(word);
      if (!links.has(wi)) links.set(wi, []);
      links.get(wi).push([rank, si, start, length]);
    }
    for (const [gi, id, pattern, level, mEn, mJa, form, ex, words, source, twin] of file.grammar || []) {
      place(grammar, gi, [id, pattern, level, mEn, mJa, form, ex, words.map(rowOf)], 'grammar row');
      grammarSource[gi] = source;
      grammarTwin[gi] = twin;
    }
    notes.push(...(file.notes || []));
  }
  whole(articles, 'article');
  whole(sentences, 'sentence');
  whole(grammar, 'grammar row');
  for (const [code] of sentences)
    if (code >= 0 ? code >= articles.length : ![-1, -2, -3].includes(code))
      throw new Error(`sky context: a sentence names source ${code}, which is not there`);
  const wordSent = {};
  const wordSentAt = {};
  for (const wi of [...links.keys()].sort((a, b) => a - b)) {
    const list = links.get(wi).sort((a, b) => a[0] - b[0]);
    for (const [, si] of list)
      if (sentences[si] === undefined) throw new Error(`sky context: sentence ${si} is not there`);
    wordSent[wi] = list.map((x) => x[1]);
    wordSentAt[wi] = list.map((x) => [x[2], x[3]]);
  }
  const linkCount = Object.values(wordSent).reduce((n, list) => n + list.length, 0);
  return {
    v: 1,
    built: files.map((f) => f.built).sort()[0],
    counts: {
      articles: articles.length,
      sentences: sentences.length,
      wordsWithSentence: Object.keys(wordSent).length,
      sentencesFromArticles: sentences.filter((s) => s[0] >= 0).length,
      sentencesFromExamples: sentences.filter((s) => s[0] < 0).length,
      sentencesWithEnglish: sentences.filter((s) => s[2]).length,
      wordSentenceLinks: linkCount,
      articleWordLinks: articleWords.reduce((n, list) => n + list.length, 0),
      grammar: grammar.length,
    },
    notes,
    articles,
    sentences,
    wordSent,
    wordSentAt,
    articleWords,
    grammar,
    grammarSource,
    grammarTwin,
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
/** the app's own buttons that can stand over the first screen */
const OVER_SKY = ['#ginga-symbol', '#ginga-search', '#ginga-theme-seal', '#live-depth-switch', '#prototype-open'];

/* The ear (modules/ear.mjs, 2026-11-11; ported to the engine's version 3 on 2026-11-12): the sky draws its words on the
 * graphics card, so the ear finds a canvas there and no text. The sky says what stands under a point (host.earWordAt)
 * by the engine's own rule, and before it acts on a lifted finger it asks the ear whether the tap is the ear's
 * (window.__BUNKI_EAR.takes), as the old first screen does (drift-layer.js earTakes): an armed tap or an Option-click on
 * a word is spoken and the sky does nothing with it. With the ear off and no Option key the ear answers no at once,
 * and the sky acts on the same event, in the same order, as it would without the ear.
 *
 * What the engine leans on here, and nothing else (tools/sky-ear-surface.test.mjs pins every name and fails when the
 * engine changes under them): api.W, api.S.view.over, api.wrap; W.ready, W.D (words, kanji, parts), W.rd, W.gramById,
 * W.gHits, W.hits, W.vis (five numbers a word: x, y, size, alpha, width), W.pick when the engine hands one out;
 * W.web.pick, W.web.isOpen, W.web.tap. */
/** A reading the voice can say: the first of several (いく; ゆく), without the ～ of a counter or a note in brackets. */
function sayable(reading) {
  const first = String(reading || '').split(/[;；]/u)[0];
  return first.replace(/[(（][^)）]*[)）]/gu, '').replace(/[～〜~]/gu, '').trim();
}
/* A grammar pattern as said: the lane's rule, as Nihongo Study's card audio has it (client/app/card-audio.mjs
 * patternSpeech, 6319f18): a 〜 at the start or the end goes, a 〜 inside is a pause (、), forms joined by ／ (or ・)
 * are said with a pause between them, a bracket of kana after a kanji is that kanji's reading and is said in its place
 * unless it is one of the optional particles, and any other bracket of kana is an optional part whose words are kept.
 * One addition for the sky's own patterns: a bracket that holds a kanji is a note (〜そうだ（伝聞）, 〜と（条件）) and
 * is not said, as sayable() leaves out a note. */
const OPTIONAL_AFTER_KANJI = new Set(['に', 'は', 'も', 'の', 'を', 'が', 'て', 'で', 'と', 'へ', 'には', 'では', 'とも', 'して']);
const KANA_SAID = /^[\p{Script=Hiragana}\p{Script=Katakana}ー、]+$/u;
function formSaid(form) {
  return form
    .replace(/[（(][^）)]*\p{Script=Han}[^）)]*[）)]/gu, '')
    .replace(/(\p{Script=Han})[（(]([\p{Script=Hiragana}ー]+)[）)]/gu, (all, kanji, kana) => (OPTIONAL_AFTER_KANJI.has(kana) ? kanji + kana : kana))
    .replace(/[（）()［］[\]]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[〜～~…]+/gu, '〜')
    .replace(/^〜+|〜+$/gu, '')
    .replace(/\s*〜\s*/gu, '、');
}
function patternSaid(pattern) {
  const text = String(pattern || '').split(/[／/・･]/u).map(formSaid).filter(Boolean).join('、').replace(/、{2,}/gu, '、').replace(/^、+|、+$/gu, '');
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text) ? text : '';
}
/** What the sky shows under a pick (sky-world.js pick): a word of the field or of an opened family, a grammar sign
 * overhead or an opened pattern, a character, a part of a character. */
function said(sky, h) {
  const W = sky.W, D = W.D;
  const word = (i) => ({ text: D.words[i][0], reading: sayable(W.rd[i]), id: `w${i}` });
  const pattern = (i, printed) => {
    const text = patternSaid(printed);
    return text ? { text, reading: KANA_SAID.test(text) ? text : '', id: `g${i}` } : null;
  };
  if (h.t === 'w') return word(h.i);
  if (h.t === 'g') {
    const g = W.gramById && W.gramById.get(h.i);
    return g ? pattern(h.i, g.p) : null;
  }
  const it = h.item;
  if (!it) return null;
  if (it.kind === 'w') return word(it.id);
  if (it.kind === 'k') return { text: D.kanji[it.id][0], reading: '', id: `k${it.id}` };
  if (it.kind === 'p') return { text: D.parts[it.id][0], reading: D.parts[it.id][1] || '', id: `p${it.id}` };
  if (it.kind === 'g') return pattern(it.id, it.text);
  return { text: it.text, reading: '', id: `x${it.text}` };
}
/* The engine's own rule for what stands under a point (sky-world.js pick, version 3), copied line for line: the opened
 * family first (and nothing else while one is open); nothing while he looks down from above; then the grammar signs
 * overhead; then the drawn words, the largest drawn first. The engine keeps its pick to itself; when it hands one out
 * (W.pick) that is asked instead and this copy is not used. The contract test compares the body below with the
 * engine's, character for character. */
function enginePick(W, view, hits, px, py, slop) {
      if (W.web) { const h = W.web.pick(px, py, slop); if (h) return h; if (W.web.isOpen()) return null; }
      if (view.over > 0.3) return null;
      for (const h of W.gHits) if (h.i >= 0 && Math.abs(px - h.x) <= h.w / 2 + slop && Math.abs(py - h.y) <= h.s * 0.7 + slop) return { t: 'g', i: h.i };
      let best = -1, bz = 1e9; for (const i of hits) { const o = i * 5, hw = W.vis[o + 4] / 2 + slop, hh = W.vis[o + 2] * 0.62 + slop; if (Math.abs(px - W.vis[o]) <= hw && Math.abs(py - W.vis[o + 1]) <= hh) { const z = -W.vis[o + 2]; if (z < bz) { bz = z; best = i; } } }
      return best >= 0 ? { t: 'w', i: best } : null;
}
/** The engine's own pick on a lifted finger, while the ear is asked about that lift (askEarFirst): the ear is told what
 * the engine itself chose for that event, not a second pick of its own. */
let lifted = null;
/* The sentences under an opened word (sky-web.js sentenceBlock: the caption's .cx block, a sentence from his own
 * reading) and an opened pattern's examples (its caption's .exj rows): the engine prints them as captions it does not
 * pick (a tap there lets the family go). They are what a learner most wants to hear, so the ear reads them: armed or
 * held on, a tap on one says that sentence and the family stays open (the ear takes the tap, so the engine never sees
 * it); with the ear off the engine acts as before (the ear is not asked). Its Japanese only: the English under it
 * (.en), its source and the next-sentence button (.src) are left out. A sentence is running text, not one of the sky's
 * controls (ear.mjs drawnUnit, control: false): held on, a finger's tap on it speaks. */
function sentenceAt(sky, x, y) {
  const ui = sky.ui, web = sky.W && sky.W.web;
  if (!ui || !web || !web.isOpen()) return null;
  const doc = ui.ownerDocument;
  for (const block of ui.querySelectorAll('.cap .cx, .cap .exj')) {
    const cap = block.closest('.cap');
    if (!cap || Number(getComputedStyle(cap).opacity) < 0.5 || !block.getClientRects().length) continue;
    const nodes = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) nodes.push(child);
        else if (child.nodeType === 1 && !child.matches('.en, .src, button')) walk(child);
      }
    };
    walk(block);
    const range = doc.createRange();
    for (const node of nodes) {
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3) {
          const text = nodes.map((n) => n.nodeValue).join('').trim();
          return text ? { text, reading: '', id: `s${text}`, control: false } : null;
        }
      }
    }
  }
  return null;
}
/** What the sky shows under a point of the page (CSS px), as the engine would pick it there: a finger is given the
 * engine's wider reach (14 px; a mouse or a pen 5). A sentence caption under an opened word is the ear's own. */
function wordAt(sky, x, y, pointer) {
  const W = sky && sky.W;
  if (!W || !W.ready || !sky.wrap || !sky.S || !sky.S.view) return null;
  const sentence = sentenceAt(sky, x, y);
  if (sentence) return sentence;
  if (lifted && lifted.sky === sky && Math.abs(lifted.x - x) < 0.5 && Math.abs(lifted.y - y) < 0.5) return lifted.h ? said(sky, lifted.h) : null;
  const box = sky.wrap.getBoundingClientRect();
  const px = x - box.left, py = y - box.top, slop = pointer === 'touch' ? 14 : 5;
  const h = typeof W.pick === 'function' ? W.pick(px, py, slop) : enginePick(W, sky.S.view, W.hits, px, py, slop);
  return h ? said(sky, h) : null;
}
const earTakes = (event) => {
  try {
    return !!(window.__BUNKI_EAR && window.__BUNKI_EAR.takes(event));
  } catch {
    return false;
  }
};
/** The sky acts on a lifted finger through W.web.tap (sky-world.js onUp, after its own pointer bookkeeping, with the
 * engine's own pick h): the ear is asked there, about that pick, so the engine's state is left as after any tap and
 * only the word's opening is the ear's to withhold. onUp returns before the tap for a drag and for a touch on the ring
 * seen from above: the ear is not asked there. onUp runs on pointercancel too (a touch the browser cancelled), so the
 * ear is asked on both: armed, a cancelled touch on a word opens nothing (and, no tap made, speaks nothing). The ear is
 * asked on empty sky as well, so the click that follows a lift meets the same pick, word or nothing, though the field
 * drifts between the two (ear.mjs takes). The sky's own keyboard and screen-reader buttons call W.web.tap with no
 * event: those are never the ear's. */
function askEarFirst(sky) {
  const web = sky && sky.W && sky.W.web;
  if (!web || typeof web.tap !== 'function') return;
  const tap = web.tap;
  web.tap = (h, event) => {
    if (event && (event.type === 'pointerup' || event.type === 'pointercancel')) {
      lifted = { sky, x: event.clientX, y: event.clientY, h: h || null };
      let mine = false;
      try {
        mine = earTakes(event);
      } finally {
        lifted = null;
      }
      if (mine) return;
    }
    return tap(h, event);
  };
}

let api = null;
let host = null;
let lang = null;
let dataUrl = null;
let contextUrl = null;
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
    host.earWordAt = (x, y, options) => wordAt(api, x, y, options && options.pointer);
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
    contextUrl: contextUrl || undefined,
    front: ownWords(),
    paused: covered,
    onFail: giveBack,
    paper,
    /* how much of the bottom of the sky the app's tab bar covers, so nothing of the sky stands under it */
    foot: () => {
      const tabs = document.querySelector('.primary-tabs');
      if (!tabs || !host) return 0;
      const bar = tabs.getBoundingClientRect();
      const box = host.getBoundingClientRect();
      return bar.height > 0 && bar.top < box.bottom ? box.bottom - bar.top : 0;
    },
    /* the app's own buttons that lie over the sky, as boxes in the sky's own coordinates: no word prints under them
     * (the prototype's 試 and the design layer's 深 are not in every build: what is not there is skipped) */
    clear: () => {
      if (!host) return [];
      const box = host.getBoundingClientRect();
      const out = [];
      for (const sel of OVER_SKY) {
        const e = document.querySelector(sel);
        if (!e || !e.getClientRects().length) continue;
        const q = e.getBoundingClientRect();
        if (q.width > 0 && q.width < 120 && q.bottom > box.top && q.top < box.bottom)
          out.push([q.left - box.left, q.top - box.top, q.width, q.height]);
      }
      return out;
    },
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
  askEarFirst(api);
  sayGround();
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
    sayGround();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new MutationObserver(() => {
    if (api && langOf() !== lang) start();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

/** The sky draws its own ground on the graphics card: the app's marks over it (the 耳 beside the gate) take their colours
 * from the ground they really stand on (modules/ear.mjs groundOf), so the host says what that ground is: the deep sky of
 * the chosen look, as the engine sets it on its wrap (sky.js setLook: --sky-deep). */
function sayGround() {
  const deep = host && api && api.wrap ? api.wrap.style.getPropertyValue('--sky-deep').trim() : '';
  if (deep) host.style.setProperty('--voice-ground', deep);
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

const CONTEXT = ['share_alike', 'proprietary_safe', 'original'].map(
  (pool) => `../data/${pool}/sky-context.json`,
);

/** The moment the sky would mount: another sky in the page wins, and a browser that draws only in software keeps the
 * old screen; otherwise the engine, both data files and the three context files are fetched, and the sky goes up only
 * once they are here. (Until version 3 a window under 720 px kept the old screen too: the engine now lays an opened
 * word out for a phone, proved in WebKit at 390 x 844 by tools/sky-first-screen.test.mjs.) */
async function mountOnce() {
  if (window.__bunkiSkyMount || document.querySelector('script[src*="/design/sky/"]'))
    return settle('stood-down', 'another sky is mounting');
  const refused = drawingRefused();
  if (refused) return giveBack(new Error(refused));
  window.__bunkiSkyMount = 'app';
  settle('loading');
  try {
    const engine = load('sky.js')
      .then(() => load('sky-world.js'))
      .then(() => load('sky-web.js'));
    const skyFile = json('../data/share_alike/sky.json');
    const blob = (value) =>
      URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
    const context = Promise.all([skyFile, ...CONTEXT.map(json)]).then(
      ([sky, ...files]) => {
        const url = blob(joinSkyContext(sky, files));
        status.context = 'joined';
        return url;
      },
      (err) => {
        status.context = `left out: ${(err && err.message) || err}`;
        console.warn('SKY stands without its context', err);
        return null;
      },
    );
    const [sky, sem, , ctx] = await Promise.all([
      skyFile,
      json('../data/proprietary_safe/sky-sem.json'),
      engine,
      context,
    ]);
    dataUrl = blob(joinSkyData(sky, sem));
    contextUrl = ctx;
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
