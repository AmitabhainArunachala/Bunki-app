// TODAY 今日 — the daily ritual as a hanging scroll and a station timetable.
import { t, LANG, dateLine, fmt } from '../i18n.js';
import { el, btn, ja, sign, strip, reg, setCut, reduced } from '../ui.js';
import { D, R, kGloss } from '../data.js';

export function render({ go }) {
  const w = D.byTerm.get(R.dayWord);
  const card = D.cards.find(c => c.term === R.dayWord);
  const kj = card.kanji;
  const art = D.articles[0];
  const shared = kj[0].parts.filter(p => kj[1]?.parts.includes(p))[0];
  const f = document.createDocumentFragment();

  f.append(sign('today'), strip(el('span', null, dateLine(R.today)), el('i', 'sep'), el('span', null, t('dueN', R.dueTotal))));

  // ---- the scroll: the day's word, vertical, on 田字格 practice squares ----
  const glyphs = el('div', 'dw-glyphs', [...w.term].map((c, i) => el('span', 'dw-cell',
    ja('span', 'dw-glyph', c),
    el('span', 'dw-st micro', String(kj[i]?.st ?? '')))));
  const dayword = btn('dayword', [glyphs, ja('span', 'dw-reading', w.reading)], () => { setCut(glyphs); go('#/words/' + encodeURIComponent(w.term)); }, `${t('wotd')}: ${w.term}`);
  dayword.dataset.uiContentValue = w.term;
  const side = el('div', 'dw-side',
    el('div', 'eyebrow', t('wotd')),
    LANG === 'ja' ? ja('div', 'dw-meaning', w.defJa) : el('div', 'dw-meaning', w.meaning),
    LANG === 'ja' ? null : ja('div', 'dw-def', w.defJa),
    el('ul', 'dw-kanji', kj.map(k => el('li', null, ja('b', null, k.c), ja('span', null, kGloss(k.c, k.m)), el('span', 'num', `${k.st}`), el('i', null, ja('span', null, k.parts.join(' ')))))),
    shared ? el('div', 'dw-shared micro', el('i', 'dot'), el('span', null, t('sharedPart')), ja('b', null, shared), el('span', null, t('inDeckKanji', D.parts[shared]?.length || 0))) : null,
  );
  if (LANG !== 'ja') side.querySelector('.dw-meaning').lang = 'en';
  const hero = el('div', 'today-hero', reg(el('div', 'dw-frame', dayword)), side);
  hero.dataset.layer = '1';

  // ---- the city: a technical elevation by day, lit windows by night ----
  const city = skyline();
  city.dataset.layer = '2';

  // ---- today's line: three stops on a vertical track ----
  const cardsMin = Math.round(R.dueTotal * 14 / 60), readMin = art.minutes, walkMin = 2;
  const stop = (k, label, detail, mins, onTap, state) => {
    const inner = [el('span', 'stop-node'), el('span', 'stop-k micro', k), el('span', 'stop-main', el('span', 'stop-label', label), detail), el('span', 'stop-min num', t('min', mins))];
    const n = onTap ? btn('stop ' + state, inner, onTap) : el('div', 'stop ' + state, ...inner);
    return n;
  };
  const board = el('div', 'board',
    el('div', 'board-head', el('span', 'eyebrow', t('todaysLine')), el('span', 'micro', t('stops', 3, cardsMin + readMin + walkMin))),
    el('div', 'board-stops',
      el('i', 'board-track'),
      stop('01', t('cards'), el('span', 'stop-detail', t('dueN', R.dueTotal), ' · ', t('newN', R.newToday)), cardsMin, null, 'now'),
      stop('02', t('read'), ja('span', 'stop-detail jp', art.title), readMin, () => go('#/read/article'), 'next'),
      stop('03', t('walk'), ja('span', 'stop-detail jp', `${w.term} → ${kj[1].c} → ${shared || kj[1].parts[0]}`), walkMin, () => go('#/words/' + encodeURIComponent(w.term)), 'next')));
  board.dataset.layer = '3';

  const begin = btn('btn-primary', [el('span', null, t('begin', R.dueTotal)), el('span', 'arrow', '→')], () => go('#/learn/front'));
  const foot = el('div', 'today-foot', begin);
  foot.dataset.layer = '4';

  f.append(hero, city, board, foot);
  return f;
}

export function enter(plate) {
  if (reduced() || document.documentElement.dataset.still) return;
  const cells = plate.querySelectorAll('.dw-cell');
  cells.forEach((c, i) => {
    c.querySelector('.dw-glyph').animate([{ opacity: 0, transform: 'translateY(-10px) scale(1.06)' }, { opacity: 1, transform: 'none' }], { duration: 760, delay: 260 + i * 220, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
    c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 120 + i * 120, fill: 'backwards' });
  });
  plate.querySelector('.dw-reading')?.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 820, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
  plate.querySelector('.board-track')?.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 640, delay: 700, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
  plate.querySelectorAll('.stop').forEach((s, i) => s.animate([{ opacity: 0, transform: 'translateX(56px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 760 + i * 110, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
  plate.querySelector('.today-foot .btn-primary')?.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 1260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
}

function skyline() {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 390, H = 92;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'city'); svg.setAttribute('aria-hidden', 'true');
  let s = 81; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let x = -4;
  const g = document.createElementNS(NS, 'g'); svg.append(g);
  while (x < W) {
    const bw = 14 + Math.floor(r() * 30), bh = 22 + Math.floor(r() * 62);
    const b = document.createElementNS(NS, 'rect');
    Object.entries({ x, y: H - bh, width: bw, height: bh, class: 'bld' }).forEach(([k, v]) => b.setAttribute(k, v));
    g.append(b);
    if (r() > .7) { const m = document.createElementNS(NS, 'rect'); Object.entries({ x: x + bw / 2 - .5, y: H - bh - 8, width: 1, height: 8, class: 'mast' }).forEach(([k, v]) => m.setAttribute(k, v)); g.append(m); }
    for (let wy = H - bh + 5; wy < H - 4; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
      const q = r(); if (q < .78) continue;
      const w = document.createElementNS(NS, 'rect');
      const cls = q > .993 ? 'win sig' : 'win';
      Object.entries({ x: wx, y: wy, width: 2, height: 2.4, class: cls }).forEach(([k, v]) => w.setAttribute(k, v));
      if (q > .9) w.style.setProperty('--d', (6 + r() * 9).toFixed(1) + 's'), w.classList.add('blink'), w.style.setProperty('--o', (r() * 6).toFixed(1) + 's');
      g.append(w);
    }
    x += bw + (r() > .6 ? 2 : 0);
  }
  const ground = document.createElementNS(NS, 'line');
  Object.entries({ x1: 0, x2: W, y1: H - .5, y2: H - .5, class: 'gl' }).forEach(([k, v]) => ground.setAttribute(k, v));
  svg.append(ground);
  return svg;
}
