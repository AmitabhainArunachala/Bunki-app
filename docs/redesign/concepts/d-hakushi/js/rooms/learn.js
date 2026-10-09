// LEARN 学ぶ — a lacquer stage holding one washi card; every practice has one clear home.
import { t, LANG, fmt } from '../i18n.js';
import { el, btn, ja, sign, strip, reg, rubyFromPairs, matchCut, wait, reduced, setCut } from '../ui.js';
import { D, R, groupEn, groupJa, registerEn, passagesWith, kGloss } from '../data.js';
import { openSlip } from '../slip.js';

let idx = 0;           // which card of the run
let done = 0;          // graded this sitting
const INTERVALS = [['1m', '1分'], ['2d', '2日'], ['6d', '6日'], ['14d', '14日']];

export function render({ sub, go }) {
  if (sub === 'front' || sub === 'back') return stage(go, sub === 'back');
  return index(go);
}
export function update(plate, sub, prev) {
  if (prev === 'front' && sub === 'back') { reveal(plate); return true; }
  if (prev === 'back' && sub === 'front') { return true; } // handled by grade()
  if (prev === 'back' && sub === 'back' && plate.querySelector('.card:not(.is-back)')) { reveal(plate); return true; }
  return false;
}
export function enter(plate, { sub }) {
  if (reduced() || document.documentElement.dataset.still) return;
  if (!sub) {
    plate.querySelectorAll('.deck-sheet').forEach((s, i, all) => s.animate([{ opacity: 0, transform: `translateY(${-30 - i * 6}px) rotate(${(i - 1) * 1.5}deg)` }, { opacity: 1, transform: '' }], { duration: 520, delay: 200 + (all.length - i) * 90, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
    plate.querySelectorAll('.bd-seg').forEach((s, i) => s.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 520, delay: 420 + i * 90, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' }));
  }
  if (sub === 'front') plate.querySelector('.card')?.animate([{ opacity: 0, transform: 'translateY(18px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 120, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
}

/* ---------------- the Learn room ---------------- */
function index(go) {
  const f = document.createDocumentFragment();
  const next = D.cards[idx % D.cards.length];
  f.append(sign('learn'), strip(el('span', null, t('dueN', R.dueTotal)), el('i', 'sep'), el('span', null, t('newN', R.newToday))));

  // section 01 — cards: the deck on the stage
  const sheets = [2, 1, 0].map(i => {
    const s = el('div', 'deck-sheet s' + i);
    if (i === 0) {
      const p = ja('div', 'sheet-text', rubyFromPairs(next.card.ruby.slice(0, 14), { furigana: false }));
      s.append(p);
      reg(s);
    }
    return s;
  });
  const bd = el('div', 'breakdown', ['n1', 'n2', 'senmon'].map(d => {
    const seg = el('i', 'bd-seg ' + d); seg.style.flex = R.due[d];
    return seg;
  }));
  const bdl = el('div', 'bd-labels micro', ['n1', 'n2', 'senmon'].map(d => el('span', null, t('deck.' + d), ' ', el('b', 'num', R.due[d]))));
  const startBtn = btn('btn-primary', [el('span', null, t('start', R.dueTotal)), el('span', 'arrow', '→')], () => go('#/learn/front'));
  const stage1 = el('section', 'lstage',
    el('div', 'lstage-head',
      el('span', 'sec-n micro', '01'), el('span', 'eyebrow', t('cards'))),
    el('div', 'lstage-count', el('span', 'big num', R.dueTotal), el('span', 'big-l', t('cardsDue'))),
    el('div', 'deck', sheets),
    bd, bdl, startBtn);
  stage1.dataset.layer = '1';

  // 02 focus · 03 tests · 04 guided — one row each, one home each
  const kanjiN = D.parts['隹']?.length || 0;
  const row = (n, title, body, aside, onTap) => {
    const inner = [el('span', 'sec-n micro', n), el('span', 'lrow-main', el('span', 'lrow-title', title), body), aside];
    return onTap ? btn('lrow', inner, onTap) : el('div', 'lrow', ...inner);
  };
  const focus = row('02', t('focus'), el('span', 'lrow-body', ja('b', 'jp', '隹'), ' ', el('span', null, t('focusBody', kanjiN))), el('span', 'lrow-aside num', t('min', 15)), () => go('#/words/' + encodeURIComponent('隹')));
  const tests = el('div', 'lrow lrow-tests',
    el('span', 'sec-n micro', '03'),
    el('span', 'lrow-main', el('span', 'lrow-title', t('tests')), el('span', 'lrow-body', t('mock'))),
    el('div', 'mock-lens', [['short', 30], ['half', 85], ['full', 165]].map(([k, m]) => btn('mock', [el('span', 'mock-k', t(k)), el('span', 'mock-m num', t('min', m))], null, `${t('mock')} · ${t(k)} · ${t('min', m)}`))));
  const guided = row('04', t('guided'), el('span', 'lrow-body', t('guidedTitle'), el('span', 'micro', ' · N2 · ', t('questions', 6))), el('span', 'lrow-aside num', t('min', 15)), null);
  const list = el('div', 'lrows', focus, tests, guided);
  list.dataset.layer = '2';
  f.append(stage1, list);
  return f;
}

/* ---------------- the card on its stage ---------------- */
function stage(go, back) {
  const c = D.cards[idx % D.cards.length];
  const f = document.createDocumentFragment();
  const n = done + 1;
  const ticks = el('div', 'ticks', Array.from({ length: R.dueTotal }, (_, i) => el('i', i < done ? 'done' : i === done ? 'cur' : '')));
  const top = el('div', 'stage-top',
    el('div', 'st-row', el('span', 'st-count num', t('cardOf', String(n).padStart(2, '0'), R.dueTotal)), el('span', 'grow'),
      el('span', 'micro', t('deck.' + c.deck), ' · ', LANG === 'ja' ? c.groupJa : c.group)),
    ticks);
  top.dataset.layer = '0';
  const card = buildCard(c, back);
  card.dataset.layer = '1';
  const dock = el('div', 'stage-dock');
  dock.dataset.layer = '2';
  if (back) dock.append(grades(go, card)); else dock.append(revealBtn(go));
  f.append(el('div', 'lacquer', sign('learn'), top, card, dock));
  return f;
}

function buildCard(c, back) {
  const passage = ja('div', 'passage', rubyFromPairs(c.card.ruby, { furigana: back, onWord: back ? (e, node, txt, rd) => openSlip({ surface: txt, base: txt, reading: rd }, node) : null }));
  const card = reg(el('article', 'card' + (back ? ' is-back' : '')));
  card.setAttribute('aria-label', t('frontNote'));
  if (back) card.append(backHead(c));
  card.append(passage);
  if (back) card.append(backFoot(c)); else card.append(el('div', 'card-note micro', el('i', 'cn-dot'), t('frontNote')));
  return card;
}

function backHead(c) {
  const target = ja('div', 'cb-word', c.term);
  return el('header', 'cb-head',
    el('div', 'cb-row', target,
      el('div', 'cb-side', ja('div', 'cb-reading', c.reading), el('div', 'micro', safePos(c.pos)))),
    ja('div', 'cb-def', c.defJa));
}
const safePos = p => { try { return t('pos.' + p); } catch { return p; } };

function backFoot(c) {
  const en = el('div', 'cb-en', el('div', 'cb-en-m', c.meaning), el('p', 'cb-en-t', c.card.en));
  en.lang = 'en'; en.dataset.uiContent = 'learning';
  const toggle = btn('btn-ghost cb-en-btn', t('showEn'), () => {
    const open = en.classList.toggle('open');
    toggle.textContent = open ? t('hideEn') : t('showEn');
  });
  const shared = c.kanji.length > 1 ? c.kanji[0].parts.find(p => c.kanji.slice(1).some(k => k.parts.includes(p))) : null;
  const anat = el('div', 'anatomy',
    el('div', 'an-head', el('span', 'eyebrow', t('anatomy')), shared ? el('span', 'micro an-shared', t('sharedBoth'), ' ', ja('b', null, shared)) : null),
    el('div', 'an-tiles', c.kanji.map(k => {
      const b = btn('an-tile', [ja('span', 'an-glyph', k.c), ja('span', 'an-m', kGloss(k.c, k.m)), el('span', 'an-parts', k.parts.map(p => ja('i', p === shared ? 'sh' : '', p))), el('span', 'an-st micro', `${k.st} ${t('strokes')}`)],
        () => { setCut(b.querySelector('.an-glyph')); window.hakushiGo('#/words/' + encodeURIComponent(k.c)); }, `${k.c} · ${t('openWeb')}`);
      b.dataset.uiContentValue = k.c;
      return b;
    })));
  const strokes = c.kanji.reduce((s, k) => s + k.st, 0);
  const pas = passagesWith(c.term, 0).count;
  const marks = el('div', 'cb-marks micro',
    el('span', null, t('deck.' + c.deck)), el('span', null, registerEn[c.card.register] && LANG !== 'ja' ? registerEn[c.card.register] : ja('span', null, c.card.register)),
    strokes ? el('span', null, `${strokes} ${t('strokes')}`) : null,
    el('span', null, t('inPassages', pas)),
    el('span', null, `${t('cardId')} ${c.card.id.slice(-8)}`));
  return el('footer', 'cb-foot', toggle, en, c.kanji.length ? anat : null, marks);
}

function revealBtn(go) {
  return btn('btn-primary reveal', [el('span', null, t('reveal')), el('span', 'arrow', '↓')], () => go('#/learn/back'));
}

function grades(go, card) {
  const g = el('div', 'grades');
  ['again', 'hard', 'good', 'easy'].forEach((k, i) => {
    const b = btn('grade g-' + k, [el('span', 'g-k', t(k)), el('span', 'g-i num', INTERVALS[i][LANG === 'ja' ? 1 : 0])], () => grade(k, card, go));
    b.setAttribute('aria-label', `${t(k)} · ${INTERVALS[i][LANG === 'ja' ? 1 : 0]}`);
    g.append(b);
  });
  return g;
}

async function reveal(plate) {
  const c = D.cards[idx % D.cards.length];
  const old = plate.querySelector('.card');
  const fresh = buildCard(c, true);
  fresh.dataset.layer = '1';
  const keepScroll = old.querySelector('.passage');
  old.replaceWith(fresh);
  const dock = plate.querySelector('.stage-dock');
  dock.replaceChildren(grades(null, fresh));
  if (reduced()) return;
  // 1. the target lifts out of the passage into the head (match-cut)
  const tgt = fresh.querySelector('.passage .target');
  const headWord = fresh.querySelector('.cb-word');
  fresh.querySelectorAll('.cb-head > *:not(.cb-row), .cb-side, .cb-foot').forEach(n => n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
  matchCut(tgt, headWord, { dur: 620 });
  // 2. furigana ink in, word by word
  fresh.querySelectorAll('.passage rt').forEach((rt, i) => rt.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 160 + i * 14, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' }));
  // 3. the held frame (間), then the grades rise
  dock.querySelectorAll('.grade').forEach((b, i) => b.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 340, delay: 700 + 320 + i * 50, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
}

async function grade(k, card, go) {
  navigator.vibrate?.(8);
  card.classList.add('registered');
  if (k === 'again' && !reduced()) {
    const cut = el('i', 'cut');
    card.append(cut);
    await cut.animate([{ transform: 'rotate(-14deg) scaleX(0)' }, { transform: 'rotate(-14deg) scaleX(1)' }], { duration: 160, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' }).finished;
    await wait(240);
  } else await wait(140);
  if (!reduced()) await card.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-110%) rotate(-2deg)', opacity: .2 }], { duration: 300, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'forwards' }).finished;
  done++; idx++;
  const plate = card.closest('.plate');
  const c = D.cards[idx % D.cards.length];
  const fresh = buildCard(c, false); fresh.dataset.layer = '1';
  card.replaceWith(fresh);
  plate.querySelector('.stage-dock').replaceChildren(revealBtn(window.hakushiGo));
  plate.querySelector('.st-count').textContent = t('cardOf', String(done + 1).padStart(2, '0'), R.dueTotal);
  plate.querySelectorAll('.ticks i').forEach((n, i) => n.className = i < done ? 'done' : i === done ? 'cur' : '');
  plate.querySelector('.st-row .micro').textContent = `${t('deck.' + c.deck)} · ${LANG === 'ja' ? c.groupJa : c.group}`;
  if (!reduced()) fresh.animate([{ transform: 'translateX(60%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
  history.replaceState(null, '', '#/learn/front');
}
