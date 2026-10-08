// ME 私 — the record as a bound book in late gold light. Honest numbers, every one from the record.
import { t, LANG, fmt } from '../i18n.js';
import { el, btn, ja, sign, strip, reg, reduced } from '../ui.js';
import { D, R, activity, iso, kanjiMet } from '../data.js';

export function render({ go }) {
  const f = document.createDocumentFragment();
  const since = LANG === 'ja' ? `${R.since.getFullYear()}年${R.since.getMonth() + 1}月${R.since.getDate()}日` : `${R.since.getDate()} ${t('months')[R.since.getMonth()].toUpperCase()} ${R.since.getFullYear()}`;
  f.append(sign('me'), strip(el('span', null, t('sinceDays', since, R.days))));

  const days = activity();
  const practised = days.filter(d => d.lvl > 0).length, goldN = days.filter(d => d.gold).length;
  // ---- the year: hanko per day, week columns ----
  const start = new Date(R.since); start.setDate(start.getDate() - start.getDay());
  const weeks = Math.ceil(((R.today - start) / 864e5 + 1) / 7);
  const grid = el('div', 'year-grid');
  grid.style.setProperty('--weeks', weeks);
  const byIso = new Map(days.map(d => [iso(d.d), d]));
  const months = el('div', 'year-months micro');
  months.style.setProperty('--weeks', weeks);
  let lastM = -1;
  for (let w = 0; w < weeks; w++) {
    const col = el('div', 'wk');
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      const rec = byIso.get(iso(day));
      const c = el('i', 'dy' + (rec ? ' l' + rec.lvl : ' out') + (rec?.gold ? ' gold' : '') + (iso(day) === iso(R.today) ? ' today' : ''));
      col.append(c);
    }
    const m = new Date(start); m.setDate(start.getDate() + w * 7);
    if (m.getMonth() !== lastM) { lastM = m.getMonth(); const s = el('span', null, t('months')[lastM]); s.style.gridColumn = `${w + 1} / span 3`; months.append(s); }
    grid.append(col);
  }
  const book = el('section', 'yearbook',
    el('div', 'yb-title', el('h1', null, t('yourYear')), ja('p', 'yb-hand', '反復とは、差異を抱えた継承である。')),
    reg(el('div', 'yb-page', months, grid)),
    el('div', 'yb-legend micro', el('span', null, el('i', 'k l2'), t('daysRead', practised)), el('span', null, el('i', 'k gold'), t('recoveredDays', goldN))));
  book.dataset.layer = '1';

  // ---- four horizons: rulers with exact numbers ----
  const n1T = D.words.filter(w => w.deck === 'n1').length, fT = D.words.filter(w => w.deck === 'senmon').length;
  const H = [
    [t('hN1'), R.held.n1, n1T],
    [t('hFields'), R.held.senmon, fT],
    [t('hKanji'), kanjiMet(), 6000, '≈'],
    [t('hRead'), R.charsRead, 100000],
  ];
  const hz = el('section', 'horizons', el('div', 'sec-h', el('span', 'eyebrow', t('horizons'))),
    ...H.map(([label, v, of, approx]) => {
      const pct = Math.min(1, v / of);
      const fill = el('i', 'hz-fill'); fill.style.setProperty('--p', pct);
      const mk = el('i', 'hz-mark'); mk.style.setProperty('--p', pct);
      return el('div', 'hz',
        el('div', 'hz-top', el('span', 'hz-label', label), el('span', 'hz-v num', fmt(v), el('small', null, ' ', approx ? '≈' : '', t('of', fmt(of))))),
        el('div', 'hz-ruler', el('i', 'hz-ticks'), fill, mk),
        el('div', 'hz-pct micro num', (pct * 100).toFixed(1) + '%'));
    }));
  hz.dataset.layer = '2';

  // ---- mended in gold ----
  const gold = el('section', 'mended', el('div', 'sec-h', el('span', 'eyebrow', t('gold')), el('span', 'micro', t('goldNote'))),
    ...R.recovered.map(r => {
      const w = D.byTerm.get(r.term);
      const b = btn('mend', [ja('span', 'mend-w', r.term), ja('span', 'mend-r', w?.reading || ''), seam(), el('span', 'mend-d micro num', t('lapsed', r.lapsed), ' → ', t('back2', r.held)), el('i', 'cel')], () => go('#/words/' + encodeURIComponent(r.term)), r.term);
      b.dataset.uiContentValue = r.term;
      return b;
    }));
  gold.dataset.layer = '3';

  // ---- the next door ----
  const next = btn('btn-primary next-door', [el('span', 'nd', el('b', null, t('nextDoor')), el('span', null, t('nextBody', R.dueTotal, R.tomorrowWord))), el('span', 'arrow', '→')], () => go('#/learn/front'));
  next.dataset.uiContentValue = R.tomorrowWord;
  const nd = el('div', 'me-next', next); nd.dataset.layer = '3';

  // ---- settings: the back of the book ----
  const q = new URLSearchParams(location.search);
  const seg = (label, opts, cur, key) => el('div', 'set-row', el('span', 'set-l', label), el('div', 'seg', opts.map(([v, txt, langAttr]) => {
    const b = btn('seg-b' + (v === cur ? ' on' : ''), txt, () => { const p = new URLSearchParams(location.search); p.set(key, v); if ((key === 'lang' && v === 'en') || (key === 'theme' && v === 'day')) p.delete(key); location.search = p.toString() ? '?' + p : ''; });
    if (langAttr) b.lang = langAttr;
    b.setAttribute('aria-pressed', v === cur);
    return b;
  })));
  const settings = el('section', 'settings', el('div', 'sec-h', el('span', 'eyebrow', t('settings'))),
    seg(t('language'), [['en', 'EN', 'en'], ['ja', '日本語', 'ja']], LANG, 'lang'),
    seg(t('light'), [['day', t('day')], ['night', t('night')]], q.get('theme') === 'night' ? 'night' : 'day', 'theme'));
  settings.dataset.layer = '4';
  f.append(book, hz, gold, nd, settings);
  return f;
}

function seam() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 120 12'); s.setAttribute('class', 'seam'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M0,7 L14,5 L22,9 L37,4 L49,7 L58,3 L71,8 L86,5 L97,9 L108,4 L120,6');
  s.append(p); return s;
}

export function enter(plate) {
  if (reduced() || document.documentElement.dataset.still) return;
  plate.querySelectorAll('.wk').forEach((w, i) => w.animate([{ opacity: 0, transform: 'scale(1.25)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: 260 + i * 22, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  plate.querySelectorAll('.hz-fill, .hz-mark').forEach((n, i) => n.animate([{ transform: n.classList.contains('hz-fill') ? 'scaleX(0)' : 'translateX(-20px)', opacity: 0 }, { transform: getComputedStyle(n).transform === 'none' ? 'none' : getComputedStyle(n).transform, opacity: 1 }], { duration: 700, delay: 600 + i * 60, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' }));
  plate.querySelectorAll('.mend .cel').forEach((c, i) => c.animate([{ transform: 'translateX(-60px) skewX(-20deg)', opacity: 0 }, { opacity: .9, offset: .3 }, { transform: 'translateX(340px) skewX(-20deg)', opacity: 0 }], { duration: 900, delay: 1100 + i * 180, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' }));
}
