/* global window, document, getComputedStyle, Image, MutationObserver, setInterval, setTimeout, URL */
/** print-look.mjs · what the print look reads from the page (PRINT-FOLD, 2026-11-12).
 *
 * depth.css carries the print look, folded from the design layer by scripts/fold-print-look.mjs. Two of its parts are
 * printed from what the page shows, and this module hands that over. It is the design layer's live.js, those two parts
 * only, ported without changing what they compute:
 *
 *   1. An article's sky (depth.css, print section 6). On an article (body[data-view='reader']) the article's picture
 *      gives two pigments, its sky (the top band) and its horizon (the middle band): --cover-a and --cover-b on <html>,
 *      with data-cover="1". Leaving the article takes all three away.
 *   2. The old first screen's word inks (print sections 9, 11 and 13 to 16). While #drift-layer is active, every word
 *      takes its ink from the printed sky under it: data-ink "sky" (paper white) or "haze" (the deepest ink), none on
 *      bare paper; data-wisp p1 to p6 (a pool of the sky's own pigment) or w1 to w6 (a wisp of paper) where the sky is
 *      half way between the two; data-depth near or mid from the layer's own faintness, so that a word a learner can
 *      tap prints at full strength. <html> carries data-sky-ink while the words are inked.
 *
 * It writes those attributes and the two custom properties, nothing else: no storage, and no request but the plates
 * in print/ that depth.css names too. The stylesheet applies all of it only under html[data-live-depth='1'], which
 * index.html sets; the inks are measured only while that attribute stands.
 *
 * On the 18841 preview the design layer's live.js does the same from the design folder. There this module stands down
 * (window.__bunkiLiveDepth), so the lead's live copy stays the one writer while he changes it.
 */

const root = document.documentElement;
const printOn = () => root.getAttribute('data-live-depth') === '1';
const standDown = () => window.__bunkiLiveDepth === true;
const plate = (file) => new URL(`print/${file}`, import.meta.url).href;

/* 1 · an article's sky ----------------------------------------------------------------------------------------- */

// the two pigments of an article's picture: its sky (the top band) and its horizon (the middle band)
function pigments(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    const band = (r0, r1) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = r0; y < r1; y += 1) {
        for (let i = 0; i < 16; i += 1) {
          const o = (y * 16 + i) * 4;
          r += d[o];
          g += d[o + 1];
          b += d[o + 2];
          n += 1;
        }
      }
      return [r / n, g / n, b / n];
    };
    // a pigment holds a little more colour than a picture's mean, and is never lighter than the paper under it
    const ink = (q) => {
      const m = (q[0] + q[1] + q[2]) / 3;
      const v = q.map((c0) => Math.round(Math.max(0, Math.min(236, m + (c0 - m) * 1.25))));
      return `rgb(${v.join(' ')})`;
    };
    return [ink(band(0, 5)), ink(band(6, 11))];
  } catch {
    return null;
  }
}

let coverSrc = '';
function cover() {
  if (standDown()) return;
  const img = document.querySelector('#app > main > .reader-hero img.reader-picture-img');
  const src = img && (img.currentSrc || img.src);
  if (src && document.body && document.body.dataset.view === 'reader') {
    if (src === coverSrc && root.hasAttribute('data-cover')) return;
    if (!(img.complete && img.naturalWidth)) {
      img.addEventListener('load', cover, { once: true });
      return;
    }
    const two = pigments(img);
    if (!two) return;
    coverSrc = src;
    root.style.setProperty('--cover-a', two[0]);
    root.style.setProperty('--cover-b', two[1]);
    root.setAttribute('data-cover', '1');
  } else if (root.hasAttribute('data-cover')) {
    coverSrc = '';
    root.removeAttribute('data-cover');
    root.style.removeProperty('--cover-a');
    root.style.removeProperty('--cover-b');
  }
}

let coverTimer = 0;
function watchCover() {
  const app = document.getElementById('app');
  if (!app) return;
  new MutationObserver(() => {
    if (coverTimer) return;
    coverTimer = setTimeout(() => {
      coverTimer = 0;
      cover();
    }, 90);
  }).observe(app, { childList: true, subtree: true });
  cover();
}

/* 2 · the old first screen's word inks -------------------------------------------------------------------------- */

// Per look: the sky plate's height over its width, then the two lines as fractions of the plate's height (measured on
// the plates, 2026-11-10 23:45).
const SKY = {
  hokusai: [843 / 2400, 0.4, 0.55],
  sumi: [948 / 2400, 0.2, 0.48],
  shu: [843 / 2400, 0.3, 0.4],
  akafuji: [843 / 2400, 0.35, 0.42],
  iwa: [843 / 2400, 0.445, 0.515],
};
// The looks whose sky is one real plate take a word's ink from the plate itself, at the place the word stands; the
// looks printed through the block take it from the block laid as the stylesheet lays it.
const PLATE = { hokusai: plate('bokashi-ai.webp'), sumi: plate('bokashi-sumi.webp') };
const BLOCK = { shu: 1, akafuji: 1, iwa: 1 };
const BLOCK_PLATE = plate('bokashi-block.webp');
const plates = {};

function lin(v) {
  const u = v / 255;
  return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}
function lumOf(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  return (
    0.2126 * lin(parseInt(m[1], 16)) +
    0.7152 * lin(parseInt(m[2], 16)) +
    0.0722 * lin(parseInt(m[3], 16))
  );
}

function plateOf(look, layer) {
  let p = plates[look];
  if (p) return p.ready ? p : null;
  const cs = getComputedStyle(layer);
  const v = (n) => cs.getPropertyValue(n).trim();
  const paper = v('--print-paper');
  const skyA = v('--sky-a');
  const skyB = v('--sky-b');
  const deepL = lumOf(v('--print-deep'));
  const paperL = lumOf(paper);
  // the look's own colours are not on the page yet: try again at the next tick
  if (
    deepL == null ||
    paperL == null ||
    (BLOCK[look] && (lumOf(skyA) == null || lumOf(skyB) == null))
  )
    return null;
  // k: the sky on screen against this picture of it, measured row by row on real pictures (2026-11-11):
  // 0.78 to 0.85 for the two plates, 0.71 to 0.84 for the block print
  p = plates[look] = { ready: false, k: BLOCK[look] ? 0.76 : 0.8, deepL, paperL };
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = Math.max(1, Math.round((320 * img.naturalHeight) / img.naturalWidth));
      const x = c.getContext('2d', { willReadFrequently: true });
      if (!BLOCK[look]) x.drawImage(img, 0, 0, c.width, c.height);
      else {
        // the block print as the stylesheet lays it: pigment, the block over it (screen), paper over all (multiply)
        x.fillStyle = '#fff';
        x.fillRect(0, 0, c.width, c.height);
        const gh = c.width * 0.34;
        const g = x.createLinearGradient(0, 0, 0, gh);
        g.addColorStop(0, skyA);
        g.addColorStop(0.14, skyA);
        g.addColorStop(0.72, skyB);
        g.addColorStop(1, skyB);
        x.fillStyle = g;
        x.fillRect(0, 0, c.width, gh);
        x.globalCompositeOperation = 'screen';
        x.drawImage(img, 0, 0, c.width, c.height);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = paper;
        x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'source-over';
      }
      p.w = c.width;
      p.h = c.height;
      p.d = x.getImageData(0, 0, c.width, c.height).data;
      p.ready = true;
    } catch {
      /* the plate cannot be read here: the words keep the two lines of SKY */
    }
  };
  img.src = PLATE[look] || BLOCK_PLATE;
  return null;
}

// the luminance of the ground at a point of the first screen (the plate is drawn 50% 0 / max(100%, 1500px) auto)
function groundAt(p, x, y, pageW) {
  const pw = Math.max(pageW, 1500);
  const ph = (pw * p.h) / p.w;
  const fx = (x - (pageW - pw) / 2) / pw;
  const fy = y / ph;
  if (fy < 0 || fy >= 1 || fx < 0 || fx >= 1) return 0.66;
  const i =
    (Math.min(p.h - 1, Math.floor(fy * p.h)) * p.w + Math.min(p.w - 1, Math.floor(fx * p.w))) * 4;
  // the sky on screen is the plate multiplied by the paper and the ink layer: 0.78 to 0.85 of the plate's own
  // luminance in both looks (real picture against the plate, row by row, 2026-11-11 01:33)
  return p.k * (0.2126 * lin(p.d[i]) + 0.7152 * lin(p.d[i + 1]) + 0.0722 * lin(p.d[i + 2]));
}

function inkFor(p, r, pageW) {
  let lo = 1;
  let hi = 0;
  const y0 = r.top + r.height * 0.3;
  const y1 = r.top + r.height * 0.7;
  for (let k = 0; k <= 4; k += 1) {
    const x = r.left + (r.width * k) / 4;
    const a = groundAt(p, x, y0, pageW);
    const b2 = groundAt(p, x, y1, pageW);
    lo = Math.min(lo, a, b2);
    hi = Math.max(hi, a, b2);
  }
  if (lo >= 0.55) return ''; // paper, or nearly: the word's own ink reads
  // deep sky under the whole word: paper-white ink (6.4 to 1 or more against the lightest ground under it)
  if (hi <= 0.105) return 'sky';
  // The sky is half way between pigment and paper here, and neither ink reads on it (3.0 to 4.3 to 1, 2026-11-11).
  // Two remedies, whichever asks less of the sky under this word:
  //   a pool: the sky's own pigment laid deeper under the word, until its lightest part is 0.10; paper-white ink
  //   a wisp: paper laid over the sky under the word, until its darkest part is 0.34; the deepest ink
  // Colours are laid over each other in their encoded values, so the sums are done there (g), not in luminance.
  const g = (L) => Math.pow(Math.max(L, 0), 1 / 2.2);
  const wisp = (g(0.34) - g(lo)) / Math.max(0.05, g(p.paperL) - g(lo));
  if (wisp <= 0.03) return 'haze';
  const pool = (g(hi) - g(0.1)) / Math.max(0.05, g(hi) - 0.2);
  const usePool = pool < wisp;
  const need = usePool ? pool : wisp;
  const step = Math.min(6, Math.max(1, Math.ceil((need - 0.04) / 0.08)));
  return usePool ? `sky p${step}` : `haze w${step}`;
}

const mark = (el, name, value) => {
  if ((el.getAttribute(name) || '') === value) return;
  if (value) el.setAttribute(name, value);
  else el.removeAttribute(name);
};
// the layer's own faintness (0.3 to 0.7) becomes two strengths of ink; under 0.3 (far ghosts, words fading in or out,
// words dimmed round a gathered family) nothing is marked
const depthOf = (el) => {
  const o = parseFloat(el.style.opacity);
  return !(o >= 0.3) ? '' : o >= 0.5 ? 'near' : 'mid';
};

function skyInk() {
  if (standDown()) return;
  const on = printOn();
  const layer = document.getElementById('drift-layer');
  const active = !!layer && layer.classList.contains('active');
  const look = root.getAttribute('data-theme') || 'hokusai';
  const k = on && SKY[look];
  // in every look: a word a learner can tap is marked near or mid, so the stylesheet can print it at full strength
  if (on && active) {
    for (const word of layer.querySelectorAll('#sky > .word'))
      mark(word, 'data-depth', depthOf(word));
  }
  if (!k || !active) {
    if (root.hasAttribute('data-sky-ink')) root.removeAttribute('data-sky-ink');
    return;
  }
  if (!root.hasAttribute('data-sky-ink')) root.setAttribute('data-sky-ink', '1');
  // the page's own width, not window.innerWidth: WebKit reports the visible width when the page is magnified
  const pageW = root.clientWidth;
  const ph = Math.max(pageW, 1500) * k[0];
  const white = ph * k[1];
  const deep = ph * k[2];
  const printed = PLATE[look] || BLOCK[look] ? plateOf(look, layer) : null;
  for (const word of layer.querySelectorAll('#sky > .word, #sky > .scale-stars > *')) {
    const r = word.getBoundingClientRect();
    if (!r.width) continue;
    const y = r.top + r.height / 2;
    const [ink, wisp = ''] = (
      printed ? inkFor(printed, r, pageW) : y < white ? 'sky' : y < deep ? 'haze' : ''
    ).split(' ');
    mark(word, 'data-ink', ink);
    mark(word, 'data-wisp', wisp);
    mark(word, 'data-depth', depthOf(word));
  }
}

/* start ----------------------------------------------------------------------------------------------------------- */

// after the page's other deferred scripts, so that the design layer, where it is in the page, has said so
setTimeout(() => {
  window.__bunkiPrintLook = standDown() ? 'stood-down' : 'on';
  if (standDown()) return;
  setInterval(skyInk, 450);
  watchCover();
}, 0);
