// Shared building blocks: el(), the hanging sign, the strip, registration marks, ruby, springs, FLIP.
import { t, LANG } from './i18n.js';

export function el(tag, cls, ...kids) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
export const attr = (n, a) => { for (const [k, v] of Object.entries(a)) if (v != null) n.setAttribute(k, v); return n; };
export function btn(cls, label, onClick, aria) {
  const b = el('button', cls, label); b.type = 'button';
  if (aria) b.setAttribute('aria-label', aria);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
/** Japanese learning content: lang=ja and the lint marker. */
export function ja(tag, cls, text) { const n = el(tag, cls, text); n.lang = 'ja'; n.dataset.uiContent = 'learning'; return n; }

/** The hanging sign (縦看板): the room's name down the right edge; lit at night. */
export function sign(room) {
  const s = el('div', 'sign', el('span', 'sign-chain'), el('span', 'sign-plate', el('span', 'sign-text', t(room))));
  s.setAttribute('aria-hidden', 'true');
  s.dataset.layer = '0';
  return s;
}
/** Registration marks (トンボ) on a printed surface. */
export function reg(node) {
  for (const c of ['tl', 'tr', 'bl', 'br']) node.append(attr(el('i', 'reg reg-' + c), { 'aria-hidden': 'true' }));
  return node;
}
export function strip(...kids) { const s = el('div', 'strip', ...kids); s.dataset.layer = '0'; return s; }
export function micro(...kids) { return el('span', 'micro', ...kids); }

/** Ruby from kit card ruby [[text, reading, isTarget?]] */
export function rubyFromPairs(pairs, { furigana = true, onWord } = {}) {
  const f = document.createDocumentFragment();
  pairs.forEach(([txt, rd, tgt], i) => {
    let n;
    if (rd && furigana) { n = el('ruby', 'w', txt, el('rt', null, rd)); }
    else n = el('span', 'w', txt);
    if (tgt) n.classList.add('target');
    n.style.setProperty('--i', i);
    if (onWord && rd) { n.classList.add('tap'); n.addEventListener('click', e => onWord(e, n, txt, rd)); }
    f.append(n);
  });
  return f;
}

/** Tiny spring for transform-only motion (stiffness, damping), runs on rAF; returns a promise. */
export function spring(from, to, onFrame, { k = 260, c = 26, m = 1 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onFrame(to); return Promise.resolve(); }
  return new Promise(res => {
    let x = from, v = 0, last = performance.now();
    const step = now => {
      const dt = Math.min(32, now - last) / 1000; last = now;
      const a = (-k * (x - to) - c * v) / m; v += a * dt; x += v * dt;
      onFrame(x);
      if (Math.abs(v) < .02 && Math.abs(x - to) < .2) { onFrame(to); res(); } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = ms => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 60) : ms));

/** Match-cut: fly a clone of `src` text to `dst`'s box (transform + opacity only). */
export async function matchCut(src, dst, { dur = 520, ease = 'cubic-bezier(.22,1,.36,1)' } = {}) {
  if (!src || !dst || reduced()) return;
  const a = src.getBoundingClientRect ? src.getBoundingClientRect() : src, b = dst.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const ghost = el('div', 'cut-ghost', dst.cloneNode(true));
  const cs = getComputedStyle(dst);
  Object.assign(ghost.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px', color: cs.color });
  document.body.append(ghost);
  dst.style.opacity = '0';
  const sx = a.width / b.width, sy = a.height / b.height, s = Math.min(sx, sy);
  const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const anim = ghost.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: .6 },
    { transform: `translate(${dx * .15}px, ${dy * .15}px) scale(${1 + (1 - s) * .02})`, opacity: 1, offset: .82 },
    { transform: 'none', opacity: 1 },
  ], { duration: dur, easing: ease });
  await anim.finished.catch(() => {});
  dst.style.opacity = ''; ghost.remove();
}

export const LANG_IS_JA = LANG === 'ja';

/** Carry a shape across a room change: remember where it was, fly it home on the other side. */
let pending = null;
export function setCut(node) { pending = node ? node.getBoundingClientRect() : null; }
export function takeCut() { const p = pending; pending = null; return p; }
