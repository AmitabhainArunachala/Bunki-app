// The word slip: one tap on any word in any room opens the same sheet. Springs in, match-cuts the word.
import { t, LANG, fmt } from './i18n.js';
import { el, btn, ja, reg, spring, matchCut, wait } from './ui.js';
import { D, groupEn, groupJa, passagesWith, isKanji, kGloss } from './data.js';

let layer, sheet, scrim, openFor = null, onCloseCb = null;

function ensure() {
  if (layer) return;
  layer = el('div', 'slip-layer');
  scrim = el('div', 'slip-scrim');
  scrim.addEventListener('click', () => closeSlip());
  sheet = el('div', 'slip');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  layer.append(scrim, sheet);
  document.body.append(layer);
}

/** w: {surface, base, reading, articleCount}; origin: the tapped element (for the match-cut) */
export async function openSlip(w, origin, { onClose, instant } = {}) {
  ensure();
  onCloseCb = onClose;
  const entry = D.byTerm.get(w.base) || D.byTerm.get(w.surface);
  const term = entry?.term || w.base || w.surface;
  const reading = entry?.reading || w.reading || '';
  const kanji = [...term].filter(isKanji).filter((c, i, a) => a.indexOf(c) === i);
  const pas = passagesWith(term, 0).count;
  sheet.replaceChildren();
  sheet.setAttribute('aria-label', term);
  const word = ja('div', 'slip-word', term);
  const close = btn('slip-close', '×', () => closeSlip(), t('close'));
  const head = el('div', 'slip-head',
    word,
    el('div', 'slip-meta',
      ja('div', 'slip-reading', reading),
      el('div', 'slip-tags',
        entry?.pos && safe(() => t('pos.' + entry.pos)) ? el('span', 'tag', safe(() => t('pos.' + entry.pos))) : null,
        entry ? el('span', 'tag tag-deck', t('deck.' + entry.deck)) : null,
        entry ? el('span', 'tag', LANG === 'ja' ? groupJa[entry.group] : groupEn[entry.group]) : null)),
    close);
  const body = el('div', 'slip-body',
    entry && LANG !== 'ja' ? attr2(el('div', 'slip-gloss', entry.meaning), { lang: 'en', 'data-ui-content': 'learning' }) : null,
    entry?.defJa ? ja('div', 'slip-def', entry.defJa) : null);
  const tiles = el('div', 'slip-kanji', kanji.map(c => {
    const k = D.kanji[c];
    const b = btn('ktile', [ja('span', 'ktile-glyph', c),
      el('span', 'ktile-info',
        ja('span', 'ktile-m', kGloss(c)),
        el('span', 'ktile-d', k ? `${k[1]} ${LANG === 'ja' ? '画' : 'str'} · ` : '', ja('span', null, (k?.[3] || []).join(' '))))],
      () => { closeSlip(true); window.hakushiGo('#/words/' + encodeURIComponent(c)); }, `${c} · ${t('openWeb')}`);
    b.dataset.uiContentValue = c;
    return b;
  }));
  const counts = el('div', 'slip-counts micro',
    w.articleCount ? el('span', null, t('inArticle', w.articleCount)) : null,
    w.articleCount ? el('span', 'sep') : null,
    el('span', null, t('inPassages', fmt(pas))));
  const seal = el('div', 'seal', el('span', null, LANG === 'ja' ? '覚' : 'KEPT'));
  seal.setAttribute('aria-hidden', 'true');
  const keep = btn('btn-primary slip-keep', [el('span', null, t('keep')), el('span', 'arrow', '+')], () => {
    keep.querySelector('span').textContent = t('kept');
    keep.querySelector('.arrow').textContent = '✓';
    keep.classList.add('done');
    seal.classList.add('stamped');
    navigator.vibrate?.(8);
  });
  const open = btn('btn-ghost', t('openWeb'), () => { closeSlip(true); window.hakushiGo('#/words/' + encodeURIComponent(term)); });
  sheet.append(reg(el('div', 'slip-paper', el('div', 'slip-grab'), head, body, tiles, counts, el('div', 'slip-actions', open, keep), seal)));
  sheet.style.visibility = 'visible';
  layer.classList.add('open');
  openFor = origin;
  origin?.classList.add('lit');
  const h = sheet.getBoundingClientRect().height || 420;
  if (instant) { sheet.style.transform = 'none'; return; }
  const p = spring(h, 0, y => sheet.style.transform = `translateY(${y}px)`, { k: 300, c: 28 });
  await wait(90);
  matchCut(origin, word, { dur: 560 });
  tiles.querySelectorAll('.ktile').forEach((n, i) => n.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 300 + i * 70, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
  return p;
}
const safe = f => { try { return f(); } catch { return null; } };
function attr2(n, a) { for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; }

export async function closeSlip(fast) {
  if (!layer?.classList.contains('open')) return;
  layer.classList.remove('open');
  openFor?.classList.remove('lit');
  const h = sheet.getBoundingClientRect().height || 420;
  if (fast) { sheet.style.transform = `translateY(${h + 20}px)`; }
  else await spring(0, h + 20, y => sheet.style.transform = `translateY(${y}px)`, { k: 420, c: 40 });
  if (!layer.classList.contains('open')) sheet.style.visibility = 'hidden';
  onCloseCb?.();
}
