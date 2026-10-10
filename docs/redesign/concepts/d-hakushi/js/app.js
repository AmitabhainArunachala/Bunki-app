// 白紙 Hakushi — router, the Line, plate transitions, theme + language.
import { t, LANG } from './i18n.js';
import { el, btn, attr, reduced, spring } from './ui.js';
import { load, R } from './data.js';
import { closeSlip } from './slip.js';
import * as today from './rooms/today.js';
import * as read from './rooms/read.js';
import * as learn from './rooms/learn.js';
import * as words from './rooms/words.js';
import * as me from './rooms/me.js';

const ROOMS = { today, read, learn, words, me };
const ORDER = ['today', 'read', 'learn', 'words', 'me'];
const html = document.documentElement;
const q = new URLSearchParams(location.search);
html.dataset.theme = q.get('theme') === 'night' ? 'night' : 'day';
html.lang = LANG === 'ja' ? 'ja' : 'en';
if (q.has('still')) html.dataset.still = '1';

const stage = document.getElementById('stage');
let current = null; // { room, sub, plate, mod }

/* ---------------- the Line (five stations) ---------------- */
const line = el('nav', 'line');
line.setAttribute('aria-label', t('nav'));
const rail = el('div', 'line-rail', el('i', 'line-track'), el('i', 'line-car'));
const stations = ORDER.map((r, i) => {
  const b = btn('station', [el('i', 'station-node'), el('span', 'station-label', t(r)), r === 'today' ? el('span', 'station-count', String(R.dueTotal)) : null], () => go('#/' + r));
  b.dataset.go = r; b.style.setProperty('--n', i);
  if (r === 'today') b.setAttribute('aria-label', `${t(r)} · ${t('dueN', R.dueTotal)}`);
  return b;
});
line.append(rail, el('div', 'line-stations', stations));
document.body.append(line);

function placeCar(room, animate) {
  const i = ORDER.indexOf(room);
  stations.forEach((s, k) => { s.classList.toggle('on', k === i); s.toggleAttribute('aria-current', k === i); if (k === i) s.setAttribute('aria-current', 'page'); });
  const car = rail.querySelector('.line-car');
  const x = (i + .5) * (100 / ORDER.length);
  car.style.setProperty('--x', x);
  car.classList.toggle('moving', !!animate);
}

/* ---------------- routing ---------------- */
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.hakushiGo = go;

function parse() {
  const h = location.hash.replace(/^#\/?/, '') || 'today';
  const [room, ...rest] = h.split('/');
  return { room: ROOMS[room] ? room : 'today', sub: decodeURIComponent(rest.join('/')) };
}

async function route() {
  const { room, sub } = parse();
  const mod = ROOMS[room];
  html.dataset.room = room;
  placeCar(room, !!current);
  // same room: let the room morph in place (card reveal, web re-centre, open article)
  if (current && current.room === room && mod.update && mod.update(current.plate, sub, current.sub) !== false) {
    current.sub = sub; return;
  }
  closeSlip(true);
  const dir = current ? Math.sign(ORDER.indexOf(room) - ORDER.indexOf(current.room)) || 1 : 0;
  const plate = el('section', 'plate');
  plate.dataset.room = room;
  attr(plate, { 'aria-label': t(room) });
  const ctx = { sub, go, from: current };
  plate.append(mod.render(ctx));
  const old = current?.plate;
  stage.append(plate);
  current = { room, sub, plate, mod };
  html.dataset.roomEntering = '1';
  if (old) leave(old, dir);
  enter(plate, dir);
  mod.enter?.(plate, ctx);
  setTimeout(() => delete html.dataset.roomEntering, 600);
}

/* Multiplane plate change: layers travel different distances (far = less), held 40ms apart. */
function enter(plate, dir) {
  if (reduced() || html.dataset.still) { plate.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); return; }
  const layers = plate.querySelectorAll('[data-layer]');
  layers.forEach(n => {
    const L = +n.dataset.layer || 0;
    const dx = dir * (16 + L * 14);
    n.animate([{ transform: `translate3d(${dx}px, ${dir ? 0 : 10}px, 0)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 420 + L * 40, delay: 40 + L * 50, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
  });
}
function leave(old, dir) {
  old.classList.add('leaving');
  const a = old.animate([{ transform: 'none', opacity: 1 }, { transform: `translate3d(${-dir * 24}px,0,0)`, opacity: 0 }],
    { duration: reduced() ? 80 : 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  a.finished.then(() => old.remove(), () => old.remove());
}

/* ---------------- boot ---------------- */
addEventListener('hashchange', route);
load().then(() => { document.body.classList.add('ready'); route(); }).catch(e => { console.error(e); stage.textContent = String(e); });
export { spring };
