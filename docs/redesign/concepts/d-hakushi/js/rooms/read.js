// READ 読む — a magazine of full-bleed woodblocks; a reader built around the voice line.
import { t, LANG, fmt, dateLine } from '../i18n.js';
import { el, btn, ja, sign, strip, reg, setCut, takeCut, reduced, wait } from '../ui.js';
import { D, isKanji } from '../data.js';
import { openSlip, closeSlip } from '../slip.js';

const PIC = id => `/prototypes/corridor/data/articles/pictures/${id}.webp`;
const PIC6 = id => `/prototypes/corridor/data/articles/pictures/${id}-600.webp`;
const scrollMemory = {};
let currentArticle = 0;

export function render({ sub, go }) {
  if (sub === 'article' || sub === 'popup') return article(go);
  return shelf(go);
}

export function update(plate, sub, prev) {
  if ((prev === 'article' && sub === 'popup')) { openPopup(plate); return true; }
  if ((prev === 'popup' && sub === 'article')) { closeSlip(); return true; }
  closeSlip(true);
  return false;
}

export function enter(plate, { sub }) {
  const hero = plate.querySelector('.hero img');
  const from = takeCut();
  if (hero && from && !reduced()) {
    const b = hero.getBoundingClientRect();
    hero.animate([{ transform: `translate(${from.left - b.left + (from.width - b.width) / 2}px, ${from.top - b.top + (from.height - b.height) / 2}px) scale(${from.width / b.width})` }, { transform: 'none' }],
      { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  if (sub === 'popup') openPopup(plate, true);
  if (plate.querySelector('.reader')) parallax(plate);
  if (!sub && !reduced()) plate.querySelectorAll('.cartouche').forEach((c, i) => c.animate([{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 380 + i * 90, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
}

/* ---------------- the shelf ---------------- */
function cartouche(title, level, small) {
  const cols = title.split(/――|—/).map(s => ja('span', 'c-col', s));
  return el('div', 'cartouche' + (small ? ' sm' : ''), el('div', 'c-inner', cols), level ? el('span', 'seal-lv', level) : null);
}
function print(id, cls, small) {
  return el('div', 'print ' + (cls || ''), el('img', null), el('i', 'rain'), el('i', 'rain r2'));
}
function img(node, src, alt) { const i = node.querySelector('img'); i.src = src; i.alt = alt; i.decoding = 'async'; i.lang = 'ja'; return node; }

function kindOf(a) { return a.id.startsWith('aozora') ? t('fiction') : t('essay'); }
function metaLine(a) {
  return el('div', 'story-meta micro', a.level ? el('span', 'lv', a.level) : null, el('span', null, kindOf(a)), el('i', 'sep'), el('span', null, t('chars', fmt(a.chars))), el('i', 'sep'), el('span', null, t('min', a.minutes)));
}

function shelf(go) {
  const f = document.createDocumentFragment();
  const A = D.articles;
  const open = (i, node) => () => { currentArticle = i; setCut(node.querySelector('img')); go('#/read/article'); };
  f.append(sign('read'), strip(el('span', null, t('storiesN', A.length)), el('span', 'grow'), btn('filter', [el('span', null, t('allLevels')), el('i', 'chev')], null, t('allLevels'))));

  const a0 = A[0];
  const leadPrint = img(print(a0.id, 'lead-print'), PIC(a0.id), a0.title);
  leadPrint.append(cartouche(a0.title, a0.level));
  reg(leadPrint);
  const firstSentence = a0.text.split('。').slice(0, 2).join('。') + '。';
  const lead = btn('story story-lead', [leadPrint,
    el('div', 'lead-body',
      el('div', 'pick', el('i', 'pick-tick'), el('span', 'eyebrow', t('todaysPick'))),
      metaLine(a0),
      ja('p', 'lede', firstSentence),
      el('div', 'minec micro', el('i', 'mine-dot'), t('deckWords', a0.mine)))], null, a0.title);
  lead.addEventListener('click', open(0, lead));
  lead.dataset.layer = '1';

  const pair = el('div', 'story-pair', [1, 2].map(i => {
    const a = A[i];
    const b = btn('story story-half', [img(print(a.id), PIC6(a.id), a.title), ja('div', 'half-title', a.title), metaLine(a)], null, a.title);
    b.addEventListener('click', open(i, b));
    return b;
  }));
  pair.dataset.layer = '2';

  const rows = el('div', 'story-rows', [3, 4, 5].map(i => {
    const a = A[i];
    const b = btn('story story-row', [img(print(a.id, 'thumb'), PIC6(a.id), a.title), el('div', 'row-body', ja('div', 'row-title', a.title), ja('div', 'row-src', a.sourceLabel), metaLine(a))], null, a.title);
    b.addEventListener('click', open(i, b));
    return b;
  }));
  rows.dataset.layer = '3';
  f.append(lead, pair, rows);
  return f;
}

/* ---------------- the reader ---------------- */
function article(go) {
  const a = D.articles[currentArticle];
  const f = document.createDocumentFragment();
  const hero = img(print(a.id, 'hero'), PIC(a.id), a.title);
  reg(hero);
  const back = btn('hero-back', el('i', 'chev-l'), () => go('#/read'), t('backShelf'));
  const heroWrap = el('div', 'hero-wrap', hero, back);
  heroWrap.dataset.layer = '0';

  const head = el('header', 'reader-head',
    ja('h1', 'reader-title', a.title),
    el('div', 'reader-src', ja('span', null, a.sourceLabel)),
    el('div', 'reader-meta micro', a.level ? el('span', 'lv', a.level) : null, el('span', null, t('chars', fmt(a.chars))), el('i', 'sep'), el('span', null, t('min', a.minutes)), el('i', 'sep'), el('span', 'mine-k', el('i', 'mine-dot'), t('deckWords', a.mine))));
  head.dataset.layer = '1';

  const counts = new Map();
  for (const tk of a.tokens) counts.set(tk[1], (counts.get(tk[1]) || 0) + 1);
  const body = el('div', 'reader');
  body.lang = 'ja'; body.dataset.uiContent = 'learning';
  const bounds = [0, ...a.paras, a.tokens.length];
  for (let p = 0; p < bounds.length - 1; p++) {
    const para = el('p', 'para', el('span', 'para-n micro', String(p + 1).padStart(2, '0')));
    para.querySelector('.para-n').setAttribute('aria-hidden', 'true');
    for (let i = bounds[p]; i < bounds[p + 1]; i++) {
      const [s, b, pos, fr] = a.tokens[i];
      const hasK = [...s].some(isKanji);
      const tok = el('span', 'tk');
      tok.dataset.i = i;
      for (const seg of fr) tok.append(seg[1] && [...seg[0]].some(isKanji) ? el('ruby', null, seg[0], el('rt', null, seg[1])) : seg[0]);
      if (D.byTerm.has(b)) tok.classList.add('mine');
      if (hasK || D.byTerm.has(b)) {
        tok.classList.add('tap');
        tok.addEventListener('click', () => openSlip({ surface: s, base: b, reading: fr.map(x => x[1] || x[0]).join(''), articleCount: counts.get(b) }, tok));
      }
      para.append(tok);
    }
    body.append(para);
  }
  body.dataset.layer = '2';

  // the voice line
  const prog = el('i', 'vl-fill');
  const time = el('span', 'vl-time num', `0:00 / ${mmss(a.chars / 7.4)}`);
  let playing = false, timer = null, idx = 0;
  const play = btn('vl-play', el('i', 'vl-icon'), () => {
    playing = !playing; play.classList.toggle('on', playing);
    play.setAttribute('aria-label', playing ? t('pause') : t('listen'));
    if (!playing) return clearInterval(timer);
    const toks = body.querySelectorAll('.tk');
    timer = setInterval(() => {
      toks[idx - 1]?.classList.remove('spoken');
      const n = toks[idx++]; if (!n) { clearInterval(timer); return; }
      n.classList.add('spoken');
      const pct = idx / toks.length;
      prog.style.transform = `scaleX(${pct})`;
      time.textContent = `${mmss(pct * a.chars / 7.4)} / ${mmss(a.chars / 7.4)}`;
    }, 210);
  }, t('listen'));
  const voice = el('div', 'voiceline', play, el('div', 'vl-mid', el('div', 'vl-row', el('span', 'vl-label', t('listen')), el('span', 'micro', t('voice'))), el('div', 'vl-track', prog)), time);
  voice.dataset.layer = '3';

  const nextWord = '反復';
  const door = btn('btn-ghost next-walk', [el('span', 'nw-k micro', t('nextDoor')), el('span', 'nw-t', t('walk'), ' · ', ja('b', null, nextWord), ' ', el('span', 'nw-n', t('inArticle', counts.get(nextWord) || 0)))], () => go('#/words/' + encodeURIComponent(nextWord)));
  door.dataset.uiContentValue = nextWord;
  const end = el('div', 'reader-end', el('div', 'end-seal', el('i', 'end-rule'), el('span', 'micro', t('chars', fmt(a.chars))), el('i', 'end-rule')), door, el('div', 'micro end-lic', a.licence));
  f.append(heroWrap, el('div', 'reader-sheet', head, body, end), voice);
  return f;
}
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function parallax(plate) {
  const im = plate.querySelector('.hero img');
  if (!im || reduced()) return;
  plate.addEventListener('scroll', () => { const y = plate.scrollTop; im.style.transform = `translateY(${y * .35}px) scale(${1 + Math.min(y, 300) / 3000})`; }, { passive: true });
}

async function openPopup(plate, instant) {
  const tok = [...plate.querySelectorAll('.tk')].find(n => n.textContent.startsWith('反復'));
  if (!tok) return;
  const r = tok.getBoundingClientRect();
  if (r.top > 560 || r.top < 120) { plate.scrollTop += r.top - 300; }
  if (!instant) await wait(60);
  const a = D.articles[currentArticle];
  const n = a.tokens.filter(x => x[1] === '反復').length;
  openSlip({ surface: '反復', base: '反復', reading: 'はんぷく', articleCount: n }, tok, { instant: instant && !!document.documentElement.dataset.still });
}
