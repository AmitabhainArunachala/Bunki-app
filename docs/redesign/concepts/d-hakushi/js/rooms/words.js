// WORDS 辞書 — the web as a technical plate. Tap any node: it travels to the centre and the web re-forms.
import { t, LANG, fmt } from '../i18n.js';
import { el, btn, ja, sign, strip, reg, takeCut, reduced, wait } from '../ui.js';
import { D, PART, NOTES, kGloss, pGloss, groupEn, groupJa, passagesWith, wordsWithKanji, kanjiWithPart, isKanji } from '../data.js';

const W = 390, H = 452;
let trail = [];

const kindOf = key => {
  if ([...key].length === 1 && D.kanji[key]) return 'kanji';
  if (D.byTerm.has(key)) return 'word';
  if (D.parts[key]) return 'part';
  if (D.kanji[key]) return 'kanji';
  return 'word';
};

export function render({ sub, go }) {
  const key = sub || '推進';
  trail = [key];
  const f = document.createDocumentFragment();
  const input = el('input', 'search-in');
  Object.assign(input, { type: 'search', placeholder: t('search'), autocomplete: 'off', spellcheck: false });
  input.setAttribute('aria-label', t('search'));
  const results = el('div', 'search-res');
  input.addEventListener('input', () => searchInto(input.value.trim(), results, go));
  const search = el('div', 'search', el('i', 'search-ico'), input, results);
  f.append(sign('words'), el('div', 'words-top', search));
  f.lastChild.dataset.layer = '0';
  const crumbs = el('nav', 'crumbs'); crumbs.setAttribute('aria-label', t('path'));
  const field = el('div', 'field');
  const panel = el('div', 'panel');
  crumbs.dataset.layer = '1'; field.dataset.layer = '1'; panel.dataset.layer = '2';
  f.append(crumbs, field, panel);
  build(field, panel, crumbs, key, null);
  return f;
}

export function update(plate, sub) {
  const key = sub || '推進';
  const field = plate.querySelector('.field');
  if (!field) return false;
  const i = trail.indexOf(key);
  if (i >= 0) trail = trail.slice(0, i + 1); else trail.push(key);
  plate.querySelector('.search-res').replaceChildren();
  build(field, plate.querySelector('.panel'), plate.querySelector('.crumbs'), key, snapshot(field));
  plate.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  return true;
}

export function enter(plate) {
  const from = takeCut();
  const c = plate.querySelector('.node.centre');
  if (from && c && !reduced()) {
    const b = c.getBoundingClientRect();
    c.animate([{ transform: `translate(${from.left + from.width / 2 - (b.left + b.width / 2)}px, ${from.top + from.height / 2 - (b.top + b.height / 2)}px) scale(${Math.max(.5, from.height / b.height)})` }, { transform: 'none' }], { duration: 640, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  if (!reduced() && !document.documentElement.dataset.still) fanOut(plate.querySelector('.field'), null);
}

/* ---------------- the graph for one centre ---------------- */
function graph(key) {
  const kind = kindOf(key);
  const N = []; // {key, type, x, y, parent, label?}
  const C = { key, type: 'centre', kind, x: W / 2, y: 232 };
  N.push(C);
  const row = (n, y, x0 = 60, x1 = 330) => Array.from({ length: n }, (_, i) => n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1)).map(x => ({ x, y }));
  if (kind === 'word') {
    const w = D.byTerm.get(key);
    const ks = [...new Set([...key].filter(c => isKanji(c) && D.kanji[c]))].slice(0, 3);
    const kpos = row(ks.length, 128, ks.length === 3 ? 110 : 140, ks.length === 3 ? 280 : 250);
    ks.forEach((c, i) => N.push({ key: c, type: 'kanji', ...kpos[i], parent: C }));
    const parts = [];
    ks.forEach((c, i) => (D.kanji[c][3] || []).forEach(p => { if (!parts.find(q => q.p === p) && parts.length < 6) parts.push({ p, k: N.find(n => n.key === c) }); }));
    const ppos = row(parts.length, 30, 40, 350);
    parts.forEach((q, i) => N.push({ key: q.p, type: 'part', ...ppos[i], parent: q.k }));
    // family: words sharing the first kanji on the left, the last kanji on the right
    const used = new Set([key]);
    const side = (c, x, sideName) => {
      const kn = N.find(n => n.key === c);
      const ws = wordsWithKanji(c).filter(v => !used.has(v.term) && [...v.term].length <= 4).slice(0, 3);
      ws.forEach((v, i) => { used.add(v.term); N.push({ key: v.term, type: 'word', x, y: 206 + i * 58, parent: kn, via: c, side: sideName }); });
    };
    if (ks[0]) side(ks[0], 46, 'l');
    if (ks.length > 1) side(ks[ks.length - 1], 344, 'r'); else if (ks[0]) side(ks[0], 344, 'r');
    const pas = passagesWith(key, 0).count;
    N.push({ key: '§pas', type: 'pas', x: W / 2, y: 352, parent: C, count: pas });
    const note = NOTES[key];
    if (note?.grammar) N.push({ key: '§gram', type: 'gram', x: 92, y: 418, parent: C, note: note.grammar });
    if (note?.culture) N.push({ key: '§cult', type: 'cult', x: 298, y: 418, parent: C, note: note.culture });
  } else if (kind === 'kanji') {
    const k = D.kanji[key];
    const parts = (k[3] || []).slice(0, 5);
    row(parts.length, 92, 110, 280).forEach((p, i) => N.push({ key: parts[i], type: 'part', ...p, parent: C }));
    const ws = wordsWithKanji(key).filter(v => [...v.term].length <= 4).slice(0, 8);
    const slots = [[46, 206], [344, 206], [46, 264], [344, 264], [46, 322], [344, 322], [96, 392], [294, 392]];
    ws.forEach((v, i) => N.push({ key: v.term, type: 'word', x: slots[i][0], y: slots[i][1], parent: C, side: slots[i][0] < W / 2 ? 'l' : 'r' }));
    N.push({ key: '§pas', type: 'pas', x: W / 2, y: 362, parent: C, count: passagesWith(key, 0).count });
  } else {
    const ks = kanjiWithPart(key).slice(0, 11);
    const slots = [[50, 92], [122, 72], [195, 62], [268, 72], [340, 92], [44, 210], [346, 210], [44, 300], [346, 300], [96, 376], [294, 376]];
    ks.forEach((c, i) => N.push({ key: c, type: 'kanji', x: slots[i][0], y: slots[i][1], parent: C }));
    if (NOTES[key]?.culture) N.push({ key: '§cult', type: 'cult', x: W / 2, y: 412, parent: C, note: NOTES[key].culture });
  }
  return N;
}

/* ---------------- render a graph into the field, FLIP from the last one ---------------- */
function snapshot(field) {
  const m = new Map();
  const fr = field.getBoundingClientRect();
  field.querySelectorAll('.node').forEach(n => { const r = n.getBoundingClientRect(); m.set(n.dataset.key, { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height / 2, w: r.width, el: n }); });
  return m;
}

function build(field, panel, crumbs, key, prev) {
  const N = graph(key);
  const go = k => window.hakushiGo('#/words/' + encodeURIComponent(k));
  // traces
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'traces'); svg.setAttribute('aria-hidden', 'true');
  for (const n of N) if (n.parent) {
    const p = n.parent;
    let d;
    if (n.type === 'word' && p.type === 'kanji') d = `M${p.x},${p.y} H${n.x} V${n.y}`;
    else if (n.type === 'word') d = `M${p.x},${p.y} H${(p.x + n.x) / 2} V${n.y} H${n.x}`;
    else if (n.type === 'part' && p.type === 'kanji') d = `M${p.x},${p.y} V${n.y + 50} H${n.x} V${n.y}`;
    else d = `M${p.x},${p.y} V${(p.y + n.y) / 2} H${n.x} V${n.y}`;
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'tr tr-' + n.type);
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); g.append(path);
    const elbow = d.match(/[HV][\d.]+/g);
    // via dots at the elbows (real junctions)
    let x = p.x, y = p.y;
    n.pts = [[x, y]];
    for (const s of elbow) { if (s[0] === 'H') x = +s.slice(1); else y = +s.slice(1); const c = document.createElementNS(NS, 'rect'); c.setAttribute('x', x - 2); c.setAttribute('y', y - 2); c.setAttribute('width', 4); c.setAttribute('height', 4); c.setAttribute('class', 'via'); g.append(c); n.pts.push([x, y]); }
    svg.append(g);
  }
  // nodes
  const nodes = N.map(n => node(n, go));
  // the grid ticks / coordinates of the plate (real: counts of this centre)
  const kind = N[0].kind;
  const legend = el('div', 'plate-legend micro',
    el('span', null, kind === 'word' ? t('word') : kind === 'kanji' ? t('kanji') : t('part')),
    el('i', 'sep'),
    el('span', 'num', kind === 'part' ? t('inKanji', kanjiWithPart(key).length) : kind === 'kanji' ? t('usedIn', wordsWithKanji(key).length) : t('kanjiParts', N.filter(n => n.type === 'kanji').length, N.filter(n => n.type === 'part').length)));
  const old = [...field.children];
  field.replaceChildren(svg, ...nodes);
  // crumbs
  crumbs.replaceChildren(...trail.map((k, i) => {
    const b = btn('crumb' + (i === trail.length - 1 ? ' here' : ''), ja('span', null, k), i === trail.length - 1 ? null : () => go(k), k);
    b.dataset.uiContentValue = k;
    return i ? [el('i', 'crumb-sep', '›'), b] : b;
  }).flat(), el('span', 'grow'), legend);
  // panel
  const np = detail(key, kind, go);
  panel.replaceChildren(np);

  if (!prev || reduced()) return;
  // FLIP: shared nodes travel from where they were; new ones fan out from the old centre
  const centreOld = [...prev.values()].find(v => v.el.classList.contains('centre'));
  const fr = field.getBoundingClientRect();
  nodes.forEach((nd, i) => {
    const r = nd.getBoundingClientRect();
    const now = { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height / 2, w: r.width };
    const was = prev.get(nd.dataset.key);
    if (was) {
      nd.animate([{ transform: `translate(${was.x - now.x}px, ${was.y - now.y}px) scale(${was.w / now.w})` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.34,1.18,.5,1)' });
    } else {
      const o = { x: W / 2, y: 232 };
      nd.animate([{ transform: `translate(${(o.x - now.x) * .6}px, ${(o.y - now.y) * .6}px) scale(.4)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: 160 + i * 28, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    }
  });
  // leaving nodes: fade where they stood
  for (const [k, v] of prev) if (!nodes.find(n => n.dataset.key === k)) {
    const g = v.el.cloneNode(true); g.classList.add('ghost-node');
    g.style.left = v.x + 'px'; g.style.top = v.y + 'px';
    field.append(g);
    g.animate([{ opacity: .9 }, { opacity: 0, transform: 'scale(.85)' }], { duration: 220, fill: 'forwards' }).finished.then(() => g.remove());
  }
  // the circuit is alive: a pulse runs from where you were to where you are
  const was = trail[trail.length - 2];
  const back = was && N.find(n => n.key === was);
  if (back?.pts) {
    const pts = [...back.pts].reverse();
    const pulse = el('i', 'pulse');
    field.append(pulse);
    pulse.animate(pts.map(([x, y], i) => ({ transform: `translate(${x}px, ${y}px)`, opacity: i === 0 ? 0 : 1, offset: i / (pts.length - 1) })), { duration: 520, delay: 380, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' })
      .finished.then(() => pulse.animate([{ opacity: 1, transform: `translate(${pts.at(-1)[0]}px, ${pts.at(-1)[1]}px) scale(1)` }, { opacity: 0, transform: `translate(${pts.at(-1)[0]}px, ${pts.at(-1)[1]}px) scale(3)` }], { duration: 300, fill: 'forwards' }).finished).then(() => pulse.remove());
  }
  // traces arrive after the ma pause
  svg.querySelectorAll('.tr').forEach((g, i) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 420 + i * 22, fill: 'backwards' }));
  np.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
  field.querySelector('.centre .ring')?.animate([{ transform: 'scale(1.35)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, delay: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
}

function fanOut(field) {
  field.querySelectorAll('.node:not(.centre)').forEach((n, i) => n.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: 460, delay: 420 + i * 34, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
  field.querySelectorAll('.tr').forEach((g, i) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 700 + i * 20, fill: 'backwards' }));
}

function node(n, go) {
  let b;
  const pos = nd => { nd.style.left = n.x + 'px'; nd.style.top = n.y + 'px'; nd.dataset.key = n.key; return nd; };
  if (n.type === 'centre') {
    const kind = n.kind;
    const k = D.kanji[n.key], w = D.byTerm.get(n.key);
    const reading = kind === 'word' ? w?.reading : kind === 'kanji' ? k?.[2] : '';
    const gloss = LANG === 'ja' ? '' : kind === 'word' ? w?.meaning : kind === 'kanji' ? k?.[0] : PART[n.key] || '';
    b = el('div', 'node centre k-' + kind, el('i', 'ring'), ja('span', 'n-glyph', n.key), reading ? ja('span', 'n-read', reading) : null, gloss ? el('span', 'n-gloss', gloss) : null);
    b.setAttribute('role', 'heading'); b.setAttribute('aria-level', '2');
    return pos(reg(b));
  }
  if (n.type === 'kanji') {
    const k = D.kanji[n.key];
    b = btn('node n-kanji', [ja('span', 'n-glyph', n.key), ja('span', 'n-sub', kGloss(n.key)), el('span', 'n-st micro', k?.[1] || '')], () => go(n.key), `${n.key} · ${kGloss(n.key)}`);
  } else if (n.type === 'part') {
    b = btn('node n-part', [ja('span', 'n-glyph', n.key), pGloss(n.key) ? el('span', 'n-sub', pGloss(n.key)) : null], () => go(n.key), `${n.key}${pGloss(n.key) ? ' · ' + pGloss(n.key) : ''}`);
  } else if (n.type === 'word') {
    const w = D.byTerm.get(n.key);
    b = btn('node n-word side-' + n.side, [ja('span', 'n-glyph', n.key), ja('span', 'n-read', w?.reading || '')], () => go(n.key), `${n.key} · ${LANG === 'ja' ? (w?.reading || '') : (w?.meaning || '')}`);
  } else if (n.type === 'pas') {
    b = btn('node n-doc', [el('span', 'n-count num', fmt(n.count)), el('span', 'n-sub', t('passages'))], () => document.querySelector('.panel .p-pass')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), `${t('passages')} · ${n.count}`);
  } else if (n.type === 'gram' || n.type === 'cult') {
    b = btn('node n-note n-' + n.type, [el('span', 'n-sub', t(n.type === 'gram' ? 'grammar' : 'culture')), ja('span', 'n-glyph', n.type === 'gram' ? n.note.p : n.note.k)], () => document.querySelector('.panel .p-' + n.type)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), t(n.type === 'gram' ? 'grammar' : 'culture'));
  }
  b.dataset.uiContentValue = n.key.startsWith('§') ? (n.note ? (n.note.p || n.note.k) : '') : n.key;
  return pos(b);
}

/* ---------------- the entry under the web ---------------- */
function detail(key, kind, go) {
  const box = el('div', 'entry');
  if (kind === 'kanji' || kind === 'part') box.append(anatomyPlate(key, kind, go));
  if (kind === 'word') {
    const w = D.byTerm.get(key);
    box.append(el('div', 'e-head', ja('span', 'e-word', key), ja('span', 'e-read', w?.reading || ''),
      w ? el('span', 'micro', t('deck.' + w.deck), ' · ', LANG === 'ja' ? groupJa[w.group] : groupEn[w.group]) : null));
    if (w) { if (LANG !== 'ja') { const g = el('div', 'e-gloss', w.meaning); g.lang = 'en'; box.append(g); } box.append(ja('div', 'e-def', w.defJa)); }
  }
  const note = NOTES[key];
  if (note?.grammar) box.append(el('section', 'p-gram e-note', el('div', 'eyebrow', t('grammar')), ja('div', 'e-pat', note.grammar.p), el('div', 'e-note-t', LANG === 'ja' ? note.grammar.ja : note.grammar.en), ja('div', 'e-src', '「' + note.grammar.src + '」')));
  if (note?.culture) box.append(el('section', 'p-cult e-note', el('div', 'eyebrow', t('culture')), ja('div', 'e-pat', note.culture.k), el('div', 'e-note-t', LANG === 'ja' ? note.culture.ja : note.culture.en)));
  if (kind !== 'part') {
    const pas = passagesWith(key, 3);
    if (pas.count) box.append(el('section', 'p-pass', el('div', 'eyebrow', t('seenIn'), ' ', el('span', 'num', `· ${fmt(pas.count)}`)), ...pas.list.map(p => {
      const src = typeof p.src === 'string' ? D.articles.find(a => 'a:' + a.id === p.src) : null;
      const label = src ? src.title : D.words[p.src]?.term;
      const parts = p.txt.split(key);
      const line = ja('p', 'pass-line', ...parts.flatMap((s, i) => i ? [el('mark', null, key), s] : [s]));
      return el('div', 'pass', line, el('div', 'pass-src micro', src ? t('read') : t('cards'), ' · ', ja('span', null, label)));
    })));
  }
  return box;
}

function anatomyPlate(key, kind, go) {
  const k = D.kanji[key];
  const parts = kind === 'kanji' ? (k?.[3] || []) : [];
  const plate = reg(el('div', 'anat-plate',
    el('div', 'ap-grid', ja('span', 'ap-glyph', key)),
    el('ul', 'ap-call', parts.map((p, i) => el('li', null, el('i', 'lead'), ja('b', null, p), el('span', null, pGloss(p)))))));
  const marks = kind === 'kanji'
    ? [[LANG === 'ja' ? t('reading') : t('meaning'), kGloss(key)], [t('strokes'), k?.[1]], [t('parts'), parts.length], [t('siblings'), wordsWithKanji(key).length], [t('passages'), fmt(passagesWith(key, 0).count)]]
    : [...(LANG === 'ja' ? [] : [[t('meaning'), PART[key] || '']]), [t('kanji'), kanjiWithPart(key).length], [t('siblings'), kanjiWithPart(key).reduce((s, c) => s + wordsWithKanji(c).length, 0)]];
  const dl = el('dl', 'ap-marks', marks.map(([a, b]) => [el('dt', 'micro', a), el('dd', 'num', String(b))]).flat());
  const list = kind === 'part' ? el('div', 'ap-list', el('div', 'eyebrow', t('kanjiWith')), el('div', 'chips', kanjiWithPart(key).map(c => { const b = btn('chip', ja('span', null, c), () => go(c), c); b.dataset.uiContentValue = c; return b; })))
    : el('div', 'ap-list', el('div', 'eyebrow', t('wordsWith')), el('div', 'chips', wordsWithKanji(key).slice(0, 16).map(w => { const b = btn('chip', ja('span', null, w.term), () => go(w.term), w.term); b.dataset.uiContentValue = w.term; return b; })));
  return el('div', null, plate, dl, list);
}

/* ---------------- search ---------------- */
function searchInto(q, box, go) {
  box.replaceChildren();
  if (!q) return;
  const ql = q.toLowerCase();
  const hits = D.words.filter(w => w.term.includes(q) || w.reading.startsWith(q) || w.meaning.toLowerCase().includes(ql)).slice(0, 6);
  if (!hits.length) { box.append(el('div', 'sr-none micro', t('noResults'))); return; }
  box.append(...hits.map(w => btn('sr', [ja('span', 'sr-t', w.term), ja('span', 'sr-r', w.reading), el('span', 'sr-m', w.meaning)], () => go('#/words/' + encodeURIComponent(w.term)), w.term)));
}
