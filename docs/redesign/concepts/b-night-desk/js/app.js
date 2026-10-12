/* 夜の文机 Night Desk — prototype runtime.
   el()/tx() mirror the corridor helpers. Every number on screen is read from DATA (real repo content)
   or from REC (the learner-record fixture, shaped like the real record). */
(() => {
'use strict';
const D = window.DATA;
const Q = new URLSearchParams(location.search);
const S = { lang: Q.get('lang') === 'ja' ? 'ja' : 'en', theme: Q.get('theme') === 'night' ? 'night' : 'day' };
const H = document.documentElement;
H.dataset.theme = S.theme;
H.lang = S.lang === 'ja' ? 'ja' : 'en';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AUDIO = '/prototypes/corridor/';
const PIC = id => `/prototypes/corridor/data/articles/pictures/${id}.webp`;

const tx = (ja, en) => {
  if (S.lang === 'ja') return ja;
  if (en == null) throw new Error('tx: missing English for ' + ja);
  return en;
};
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (typeof props === 'string') n.className = props;
  else if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
}
const ja = (text, cls) => el('span', { class: cls, lang: 'ja', 'data-ui-content': 'learning' }, text);
const hud = (...parts) => el('div', 'hud', ...parts.filter(Boolean).flatMap((p, i) => i ? [el('span', 'sep', '·'), p] : [p]));
const kk = v => !v ? '—' : S.lang === 'ja' ? v : 'Kanken ' + v.replace('準', 'pre-').replace('級', '');
const partLabel = p => {
  const k = D.kanji[p];
  if (S.lang !== 'ja') return k ? k.m.toLowerCase() : '';
  const r = D.radicals[p];
  return (r && r.name) || (k && (k.kun[0] || k.on[0] || '').replace('.', '')) || '';
};
const pad = (n, w = 2) => String(n).padStart(w, '0');
const fmt = n => n.toLocaleString('en-US');
const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const wait = ms => new Promise(r => setTimeout(r, RM ? Math.min(ms, 60) : ms));
const go = h => { location.hash = h; };

/* ------------------------------------------------------------------ learner record (fixture) */
const DAYS = [31,0,44,38,52,27,0,40,36,61,0,33,48,29,45,0,0,38,56,41,34,0,47,52,39,28,44,0,61,35,42,0,49,37,58,30,0,46,41,53,18];
const REC = {
  start: [2026, 7, 29], days: DAYS,
  due: D.due, newToday: 5,
  dueByDeck: { n1: 7, n2: 4, senmon: 7 },
  inReview: { n1: 198, n2: 141, senmon: 73 },
  words: {
    '記憶': { added: '14 Sep', addedJa: '9月14日', from: '推進', seen: 6, last: '24 Sep', lastJa: '9月24日', hist: [1, 1, 0, 1, 1, 1] },
  },
  position: { 'bunki-essay-n1-ai': 2 },
  shadowed: 23, kanjiRecalled: 486,
  recovered: [
    { w: '怠る', r: 'おこたる', lapsed: '12 Sep', kept: '30 Sep', lapsedJa: '9月12日', keptJa: '9月30日', gap: 18 },
    { w: '辛抱', r: 'しんぼう', lapsed: '19 Sep', kept: '5 Oct', lapsedJa: '9月19日', keptJa: '10月5日', gap: 16 },
  ],
  tomorrow: { due: 12, first: '象徴' },
  sitting: { date: '6 Oct', dateJa: '10月6日', min: 25 },
  intervals: ['1m', '8m', '3d', '9d'],
  read: ['bunki-essay-n1-city', 'bunki-essay-n1-ise-time', 'bunki-essay-n1-kojiki-power'],
};
const dueTotal = REC.due.length;
const reviewed = REC.days.reduce((a, b) => a + b, 0);
const studyDays = REC.days.filter(Boolean).length;

/* ------------------------------------------------------------------ shared drawing */
const REG = '<svg viewBox="0 0 13 13"><path d="M6.5 0v13M0 6.5h13" stroke="currentColor" stroke-width=".8"/><circle cx="6.5" cy="6.5" r="3.2" fill="none" stroke="currentColor" stroke-width=".8"/></svg>';
function regs(node) {
  for (const c of ['tl', 'tr', 'bl', 'br']) node.append(el('i', { class: 'reg ' + c, html: REG, 'aria-hidden': 'true' }));
  return node;
}
function rel(layer, node, ax = .5, ay = .5) {
  const L = layer.getBoundingClientRect(), r = node.getBoundingClientRect();
  return [r.left - L.left + r.width * ax, r.top - L.top + r.height * ay];
}
function trace(layer, a, b, { lit = false, delay = 0, draw = true, spark = false } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const t = el('i', 'trace' + (lit ? ' lit' : ''));
  const end = `translate(${a[0]}px,${a[1]}px) rotate(${ang}deg) scaleX(${len})`;
  layer.append(t);
  if (!draw || RM) { t.style.transform = end; }
  else {
    t.style.transform = `translate(${a[0]}px,${a[1]}px) rotate(${ang}deg) scaleX(0.001)`;
    setTimeout(() => { t.classList.add('draw'); t.style.transform = end; }, delay);
  }
  if (spark && !RM) {
    const s = el('i', 'spark'); layer.append(s);
    s.animate([
      { transform: `translate(${a[0]}px,${a[1]}px)`, opacity: 0 },
      { transform: `translate(${a[0]}px,${a[1]}px)`, opacity: 1, offset: .04 },
      { transform: `translate(${b[0]}px,${b[1]}px)`, opacity: 1, offset: .16 },
      { transform: `translate(${b[0]}px,${b[1]}px)`, opacity: 0, offset: .2 },
      { transform: `translate(${b[0]}px,${b[1]}px)`, opacity: 0 }],
      { duration: 7200, delay: delay + 900, iterations: Infinity, easing: 'linear' });
  }
  return t;
}
/* a damped spring on translateY (px) — the sheet and the card move on springs, not curves */
function spring(node, from, to, { k = 380, c = 30, axis = 'Y', extra = '' } = {}) {
  return new Promise(res => {
    if (RM) { node.style.transform = `translate${axis}(${to}px)${extra}`; return res(); }
    let x = from, v = 0, last = performance.now();
    const step = now => {
      const dt = Math.min(.032, (now - last) / 1000); last = now;
      const a = -k * (x - to) - c * v; v += a * dt; x += v * dt;
      node.style.transform = `translate${axis}(${x}px)${extra}`;
      if (Math.abs(x - to) < .3 && Math.abs(v) < 4) { node.style.transform = `translate${axis}(${to}px)${extra}`; return res(); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
let player = null;
function play(src) {
  try {
    if (player) player.pause();
    player = new Audio(AUDIO + src);
    const p = player.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* no audio on this device */ }
  return player;
}
/* ruby for one token */
function rubyToken(t, withRuby = true) {
  if (!t.f || !withRuby) return document.createTextNode(t.s);
  const f = document.createDocumentFragment();
  for (const [s, r] of t.f) {
    if (r && /[一-鿿々]/.test(s)) f.append(el('ruby', null, s, el('rt', null, r)));
    else f.append(s);
  }
  return f;
}
/* ruby from the card's ruby triples */
function rubyCard(ruby, withRuby, onWord) {
  const box = el('span', { lang: 'ja', 'data-ui-content': 'learning' });
  for (const [s, r, target] of ruby) {
    let n;
    if (target) n = el('span', 'target', withRuby && r ? el('ruby', null, s, el('rt', null, r)) : s);
    else if (r && withRuby) n = el('ruby', null, s, el('rt', null, r));
    else n = document.createTextNode(s);
    if (onWord && s === '記憶') { n = el('span', { class: 'door', role: 'button', tabindex: '0', 'aria-label': tx('記憶 を開く', 'Open 記憶'), onclick: e => onWord(e, s) }, n); }
    box.append(n);
  }
  return box;
}

/* ------------------------------------------------------------------ tab bar */
const ICONS = {
  today: '<svg viewBox="0 0 24 24"><path d="M3 17.5h18"/><path d="M6.5 17.5a5.5 5.5 0 0 1 11 0"/><path d="M12 6.2v2.3M5.6 9.1l1.6 1.6M18.4 9.1l-1.6 1.6"/></svg>',
  read: '<svg viewBox="0 0 24 24"><path d="M12 6.5c-2.6-1.6-5.6-1.9-8.5-1.2v12.8c2.9-.7 5.9-.4 8.5 1.2 2.6-1.6 5.6-1.9 8.5-1.2V5.3c-2.9-.7-5.9-.4-8.5 1.2z"/><path d="M12 6.5v12.8"/></svg>',
  learn: '<svg viewBox="0 0 24 24"><rect x="5.5" y="4.5" width="13" height="15" rx="1"/><path d="M3 4.5h1.5M4.5 3v3M21 19.5h-1.5M19.5 21v-3"/><path d="M9 10.5h6M9 13.5h4"/></svg>',
  words: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6"/><circle cx="5" cy="6" r="1.6"/><circle cx="19" cy="7" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/><circle cx="5.5" cy="17.5" r="1.6"/><path d="M6.3 7l3.8 3.2M17.6 7.8l-3.4 2.9M16.4 17.3l-2.6-3.3M6.8 16.6l3.2-2.7"/></svg>',
  me: '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="1"/><path d="M8.5 3.5v17"/><rect x="11" y="8" width="5.5" height="5.5" rx=".6"/></svg>',
};
const TABS = [['today', '今日', 'Today'], ['read', '読む', 'Read'], ['learn', '学ぶ', 'Learn'], ['words', '辞書', 'Words'], ['me', '私', 'Me']];
function buildTabs() {
  const nav = el('nav', { id: 'tabs', 'aria-label': tx('メイン', 'Main') });
  for (const [id, j, e] of TABS) {
    nav.append(el('button', { 'data-go': id, 'aria-label': tx(j, e), onclick: () => go('#/' + id) },
      el('span', { html: ICONS[id], 'aria-hidden': 'true' }), el('span', null, tx(j, e))));
  }
  document.body.append(nav);
}
function setTab(room) {
  for (const b of document.querySelectorAll('#tabs button')) {
    if (b.dataset.go === room) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}
const kanban = (j, e) => S.lang === 'ja' ? el('div', { class: 'kanban', lang: 'ja', 'aria-hidden': 'true' }, j) : el('div', { class: 'kanban', 'aria-hidden': 'true' }, e);

/* ================================================================== TODAY */
function renderToday() {
  const w = '記憶', g = D.words[w], rec = REC.words[w];
  const kan = ['記', '憶'];
  const root = el('main', 'room today');
  root.append(kanban('今日 · 十月八日', 'Today · 08.10.2026'));

  const head = el('header', { class: 't-head', 'data-in': '', style: '--i:0' },
    el('div', 't-date',
      el('span', 't-num', '08'),
      el('div', 't-dl',
        el('b', null, tx('十月 · 木曜日', 'October · Thursday')),
        hud(tx(`記録 ${REC.days.length}日目`, `Day ${REC.days.length} of your record`), tx(`学習 ${studyDays}日`, `${studyDays} days studied`)))));
  root.append(head);

  /* the plate: word → kanji → parts, joined by light */
  const plate = regs(el('section', { class: 't-plate', 'data-in': '', style: '--i:1' }));
  const layer = el('div', 'traces');
  const big = el('button', { class: 't-big', lang: 'ja', 'data-ui-content': 'learning', 'aria-label': tx('記憶 を辞書で開く', 'Open 記憶 in Words'), 'data-ui-content-value': '記憶', onclick: () => go('#/words/W:記憶') },
    ...kan.map(c => el('span', 't-ch', c)));
  const anat = el('div', 't-anat');
  kan.forEach((c, i) => {
    const k = D.kanji[c];
    const parts = k.d;
    anat.append(el('div', 't-col',
      el('button', { class: 't-k', lang: 'ja', 'data-ui-content-value': c, 'aria-label': tx(`${c} を開く`, `Open ${c}`), onclick: () => go('#/words/K:' + c) }, c),
      el('div', 't-km', el('b', null, tx(k.on.join('・'), k.m)), el('span', 'data', `${k.st}${tx('画', ' strokes')} · ${kk(k.kk)}`)),
      el('div', 't-parts', ...parts.map(p => el('button', { class: 't-p', 'data-ui-content-value': p, 'aria-label': tx(`部品 ${p}`, `Part ${p}`), onclick: () => go('#/words/P:' + p) },
        el('span', { lang: 'ja' }, p), el('small', S.lang === 'ja' ? null : 'data', partLabel(p)))))));
  });
  plate.append(layer,
    hud(el('b', null, tx('今日の言葉', 'Word of the day')), tx('今日が復習日', 'due today'), tx(`${rec.seen}回目`, `seen ${rec.seen}×`)),
    el('div', 't-wordrow',
      el('div', null, el('div', { class: 't-read', lang: 'ja' }, g.r), big),
      el('div', 't-gloss',
        S.lang === 'ja' ? null : el('span', 't-en', g.m.slice(0, 2).join(', ')),
        hud(g.jlpt, tx('名詞・する動詞', 'noun · suru verb')))),
    anat);
  root.append(plate);

  /* the sentence where it waits today: the scan-line reads it with you */
  const A = D.article, si = 2, [s0, s1, src] = A.sentences[si];
  const line = el('p', { class: 't-line', lang: 'ja', 'data-ui-content': 'learning' });
  const toks = [];
  for (let i = s0; i < s1; i++) {
    const t = A.tokens[i];
    const sp = el('span', t.s === w ? 'tk mark' : 'tk', t.s);
    toks.push(sp); line.append(sp);
  }
  const scan = el('i', 'scan');
  const art = D.articles.find(a => a.id === A.id);
  const sent = el('section', { class: 't-sent', 'data-in': '', style: '--i:2' },
    el('div', 't-sent-in', line, scan),
    el('div', 't-src',
      hud(tx('今日の記事', 'In today’s article'), el('span', { lang: 'ja' }, art.title), tx(`${si + 1}/${A.sentences.length}文`, `sentence ${si + 1}/${A.sentences.length}`)),
      el('button', { class: 'btn btn-quiet t-hear', 'aria-label': tx('この文を聞く', 'Hear this sentence'), onclick: () => scanSentence(toks, scan, src, true) },
        el('span', { html: '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M6 4.5v11l9-5.5z" fill="currentColor"/></svg>' }), tx('聞く', 'Hear'))));
  root.append(sent);

  /* the route: one next step, then the next door */
  const route = el('section', { class: 't-route', 'data-in': '', style: '--i:3' },
    el('ol', null,
      el('li', 'st now',
        el('i', 'dot'),
        el('div', null, el('b', null, tx('復習', 'Review')),
          hud(tx(`${dueTotal}枚`, `${dueTotal} cards`), `N1 ${REC.dueByDeck.n1}`, `N2 ${REC.dueByDeck.n2}`, tx(`専門 ${REC.dueByDeck.senmon}`, `fields ${REC.dueByDeck.senmon}`), tx('約9分', '≈ 9 min')))),
      el('li', { class: 'st', onclick: () => go('#/read/article') },
        el('i', 'dot'),
        el('div', null, el('b', null, tx('読む', 'Read'), ' ', el('span', { class: 'st-t', lang: 'ja' }, art.title)),
          hud(tx(`今日の復習語 ${art.due.length}語を含む`, `holds ${art.due.length} of today’s due words`), tx('声 アミ', 'voice Ami')))),
      el('li', 'st next',
        el('i', 'dot'),
        el('div', null, el('b', null, tx('明日', 'Tomorrow')),
          hud(tx(`${REC.tomorrow.due}枚`, `${REC.tomorrow.due} due`), tx('最初の言葉', 'first word'), el('span', { lang: 'ja', class: 'peek' }, REC.tomorrow.first))))),
    el('button', { class: 'btn btn-primary t-go', onclick: () => go('#/learn/front') },
      tx('復習をはじめる', 'Begin review'), el('span', 'k', `${dueTotal}`)));
  root.append(route);

  root._after = async () => {
    await wait(380);
    const chars = big.querySelectorAll('.t-ch');
    const ks = anat.querySelectorAll('.t-k');
    chars.forEach((c, i) => trace(layer, rel(layer, c, .5, .98), rel(layer, ks[i], .5, 0), { lit: true, delay: 120 + i * 140, spark: i === 0 }));
    anat.querySelectorAll('.t-col').forEach((col, i) => {
      const k = col.querySelector('.t-km');
      col.querySelectorAll('.t-p').forEach((p, j) => trace(layer, rel(layer, k, .5, 1.15), rel(layer, p, .5, 0), { lit: true, delay: 820 + i * 140 + j * 90 }));
    });
    await wait(1500);
    if (document.body.contains(scan)) scanSentence(toks, scan, null, false);
  };
  return root;
}
/* the scan-line: a bar of light under the token being read */
function scanSentence(toks, scan, src, audio) {
  const box = scan.parentElement;
  const a = audio && src ? play(src) : null;
  let i = 0;
  const per = toks.map(t => Math.max(110, t.textContent.length * 120));
  const total = per.reduce((x, y) => x + y, 0);
  const scale = a && a.duration && isFinite(a.duration) ? (a.duration * 1000) / total : 1;
  const step = () => {
    if (!document.body.contains(box)) return;
    toks.forEach(t => t.classList.remove('on'));
    if (i >= toks.length) { scan.style.opacity = 0; return; }
    const t = toks[i]; t.classList.add('on');
    const B = box.getBoundingClientRect(), r = t.getBoundingClientRect();
    scan.style.opacity = 1;
    scan.style.transform = `translate(${r.left - B.left}px,${r.bottom - B.top - 3}px) scaleX(${r.width})`;
    setTimeout(step, per[i++] * scale);
  };
  step();
}

/* ================================================================== READ — shelf */
function renderShelf() {
  const root = el('main', 'room read shelf');
  root.append(kanban('読む', 'Read'));
  const [lead, ...rest] = D.articles;
  const pos = REC.position[lead.id];
  const hero = regs(el('figure', { class: 'r-hero', 'data-in': '', style: '--i:0' },
    el('div', 'r-img', el('img', { src: PIC(lead.id), alt: '', loading: 'eager' })),
    el('i', 'r-lamp'), el('div', 'r-rain', el('i'), el('i')), el('i', 'r-shade'),
    el('div', 'r-mast',
      el('h1', null, tx('読む', 'Read')),
      hud(tx(`声つき ${D.articles.length}本`, `${D.articles.length} voiced articles`), tx('あなたの復習語順', 'ranked by your due words'))),
    el('button', { class: 'r-sort', 'aria-label': tx('並べ替え', 'Sort the shelf') }, el('span', 'data', tx('復習語順', 'BY YOUR WORDS')), el('span', { 'aria-hidden': 'true' }, '▾'))));
  const cart = regs(el('article', { class: 'r-cart', 'data-in': '', style: '--i:1' },
    el('div', 'r-cart-top', el('span', 'seal', lead.level), hud(el('b', null, tx('今日の新着', 'New today')), tx('随筆', 'Essay'), tx('書き下ろし', 'Bunki original'), tx('声 アミ', 'voice Ami'))),
    el('h2', { lang: 'ja', 'data-ui-content': 'learning' }, lead.title),
    el('p', { class: 'r-lead', lang: 'ja', 'data-ui-content': 'learning' }, lead.lead + '…'),
    el('div', 'r-stats',
      stat(fmt(lead.chars), tx('字', 'chars')), stat(lead.sentences, tx('文', 'sentences')), stat(lead.n1 + '%', tx('N1語彙', 'N1 vocab')), stat(lead.due.length, tx('復習語', 'due words'), true)),
    el('div', 'r-due', ...lead.due.map(w => el('span', { lang: 'ja', class: 'chip' }, w))),
    el('button', { class: 'btn btn-primary r-open', onclick: () => go('#/read/article') },
      tx(`${pos + 1}文目から再開`, `Resume at sentence ${pos + 1}`), el('span', 'k', `${pos + 1}/${lead.sentences}`))));
  const list = el('ol', { class: 'r-list', 'data-in': '', style: '--i:2' },
    ...rest.map((a, i) => el('li', null, el('button', { class: 'r-row', onclick: () => go('#/read/article') },
      regs(el('span', 'r-thumb', el('img', { src: `/prototypes/corridor/data/articles/pictures/${a.id}-600.webp`, alt: '' }))),
      el('span', 'r-meta',
        el('span', 'data r-no', pad(i + 2)),
        el('b', { lang: 'ja', 'data-ui-content': 'learning' }, a.title),
        hud(`${a.level}`, tx(`${fmt(a.chars)}字`, `${fmt(a.chars)} chars`), tx(`${a.sentences}文`, `${a.sentences} sent.`)),
        el('span', 'r-ticks', ...a.due.map(() => el('i')), el('span', 'hud', tx(`復習語 ${a.due.length}`, `${a.due.length} due words`)),
          REC.read.includes(a.id) ? el('span', 'hud r-done', tx('読了', 'read')) : el('span', 'hud r-new', tx('今日の新着', 'new today'))))))));
  root.append(hero, cart, list);
  root._after = () => {
    const img = hero.querySelector('.r-img');
    const v = document.getElementById('view');
    const onS = () => { if (!RM) img.style.transform = `translateY(${v.scrollTop * .35}px) scale(1.06)`; };
    v.addEventListener('scroll', onS, { passive: true }); root._cleanup = () => v.removeEventListener('scroll', onS);
  };
  return root;
}
function stat(n, label, lit) { return el('div', 'stat' + (lit ? ' lit' : ''), el('b', 'data', String(n)), el('span', null, label)); }

/* ================================================================== READ — article */
let articleState = null;
function renderArticle(withPopup) {
  const A = D.article, meta = D.articles.find(a => a.id === A.id);
  const root = el('main', 'room read article');
  const pos = REC.position[A.id];
  root.append(kanban('読む', 'Read'));
  const hero = regs(el('figure', 'a-hero', el('div', 'a-img', el('img', { src: PIC(A.id), alt: '' })), el('i', 'r-lamp'), el('div', 'r-rain', el('i'), el('i'))));
  const head = el('header', { class: 'a-head', 'data-in': '', style: '--i:0' },
    el('div', 'r-cart-top', el('span', 'seal', meta.level), hud(tx('随筆', 'Essay'), tx('書き下ろし', 'Bunki original'), tx(`${fmt(meta.chars)}字`, `${fmt(meta.chars)} chars`), tx(`${meta.sentences}文`, `${meta.sentences} sentences`))),
    el('h1', { lang: 'ja', 'data-ui-content': 'learning' }, meta.title));
  /* text */
  const text = el('article', { class: 'a-text', lang: 'ja', 'data-ui-content': 'learning' });
  const sentOf = i => A.sentences.findIndex(([a, b]) => i >= a && i < b);
  const bounds = [0, ...A.paras, A.tokens.length];
  const tokEls = [];
  for (let p = 0; p < bounds.length - 1; p++) {
    const para = el('p', null);
    const no = el('span', { class: 'pno data', 'aria-hidden': 'true' }, pad(p + 1));
    para.append(no);
    for (let i = bounds[p]; i < bounds[p + 1]; i++) {
      const t = A.tokens[i];
      const cls = ['tk'];
      if (t.c) cls.push('c');
      if (REC.due.includes(t.b)) cls.push('due');
      if (sentOf(i) === pos) cls.push('cur');
      const sp = el('span', { class: cls.join(' '), 'data-i': i }, rubyToken(t));
      tokEls[i] = sp; para.append(sp);
    }
    text.append(para);
  }
  const scan = el('i', 'scan'); text.append(scan);
  text.addEventListener('click', e => {
    const t = e.target.closest('.tk.c'); if (!t) return;
    const tok = A.tokens[+t.dataset.i];
    openSheet(tok, t);
  });
  const ticks = el('div', 'v-ticks', ...A.sentences.map((s, i) => el('i', i < pos ? 'past' : i === pos ? 'now' : '')));
  const count = el('span', 'data v-count', `${pad(pos + 1)} / ${A.sentences.length}`);
  const playBtn = el('button', { class: 'v-play', 'aria-label': tx('再生', 'Play from this sentence') },
    el('span', { html: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>' }));
  const dock = el('div', { class: 'a-voice', 'data-in': '', style: '--i:2' },
    playBtn,
    el('div', 'v-mid', el('div', 'v-row', el('b', null, tx('朗読 · アミ', 'Listening · Ami')), count), ticks),
    el('button', { class: 'v-speed data', 'aria-label': tx('速さ 1.0倍', 'Speed 1.0×') }, '1.0×'));
  root.append(hero, head, el('div', { 'data-in': '', style: '--i:1' }, text), dock);
  articleState = { tokEls, scan, text, count, ticks, pos, playing: false };
  playBtn.addEventListener('click', () => readAloud(playBtn));
  root._after = async () => {
    const v = document.getElementById('view');
    const img = hero.querySelector('.a-img');
    const onS = () => { if (!RM) img.style.transform = `translateY(${v.scrollTop * .4}px)`; };
    v.addEventListener('scroll', onS, { passive: true }); root._cleanup = () => v.removeEventListener('scroll', onS);
    placeScan(A.sentences[pos][0]);
    /* back to the exact line: hold on the print, then glide to where you stopped */
    await wait(withPopup ? 300 : 1100);
    if (!document.body.contains(text)) return;
    const line = tokEls[A.sentences[pos][0]];
    const y = line.getBoundingClientRect().top + v.scrollTop - innerHeight * .34;
    v.scrollTo({ top: y, behavior: withPopup || RM ? 'auto' : 'smooth' });
    await wait(80); placeScan(A.sentences[pos][0]);
    if (withPopup) {
      await wait(400);
      const tk = tokEls.find(e => e && A.tokens[+e.dataset.i].s === '記憶');
      openSheet(A.tokens[+tk.dataset.i], tk);
    }
  };
  return root;
}
function placeScan(i) {
  const st = articleState; if (!st) return;
  const t = st.tokEls[i]; if (!t) return;
  const B = st.text.getBoundingClientRect(), r = t.getBoundingClientRect();
  st.scan.style.opacity = 1;
  st.scan.style.transform = `translate(${r.left - B.left}px,${r.bottom - B.top - 2}px) scaleX(${r.width})`;
  st.tokEls.forEach(e => e && e.classList.remove('on')); t.classList.add('on');
}
async function readAloud(btn) {
  const st = articleState, A = D.article;
  if (st.playing) { st.playing = false; btn.classList.remove('on'); if (player) player.pause(); return; }
  st.playing = true; btn.classList.add('on');
  for (let s = st.pos; s < A.sentences.length && st.playing; s++) {
    const [a, b, src] = A.sentences[s];
    st.pos = s; st.count.textContent = `${pad(s + 1)} / ${A.sentences.length}`;
    [...st.ticks.children].forEach((t, i) => t.className = i < s ? 'past' : i === s ? 'now' : '');
    st.tokEls.forEach((e, i) => e && e.classList.toggle('cur', i >= a && i < b));
    play(src);
    for (let i = a; i < b && st.playing; i++) {
      placeScan(i);
      await wait(Math.max(90, A.tokens[i].s.length * 135));
    }
  }
}

/* ------------------------------------------------------------------ the word sheet */
let sheetOpen = null;
function closeSheet() {
  if (!sheetOpen) return;
  const { sheet, scrim, src } = sheetOpen; sheetOpen = null;
  scrim.classList.remove('on');
  if (src) src.classList.remove('lift');
  spring(sheet, 0, sheet.offsetHeight + 20, { k: 520, c: 40 }).then(() => { sheet.remove(); scrim.remove(); });
  if (location.hash === '#/read/popup') history.replaceState(null, '', location.pathname + location.search + '#/read/article');
}
function openSheet(tok, srcEl) {
  if (sheetOpen) closeSheet();
  const w = tok.b, g = D.gloss[w] || D.gloss[tok.s] || D.words[w];
  const rec = REC.words[w];
  const kanjiChars = [...w].filter(c => D.kanji[c]);
  const scrim = el('div', { id: 'scrim', onclick: closeSheet });
  const sheet = el('section', { class: 'sheet', role: 'dialog', 'aria-label': tx('言葉', 'Word') });
  const layer = el('div', 'traces');
  const word = el('div', { class: 's-word', lang: 'ja', 'data-ui-content': 'learning' }, w);
  const heard = D.wordAudio[w];
  const kRow = el('div', 's-kanji', ...kanjiChars.map(c => {
    const k = D.kanji[c];
    return el('div', 's-kc',
      el('button', { class: 's-k', lang: 'ja', 'data-ui-content-value': c, 'aria-label': tx(`${c} を開く`, `Open ${c}`), onclick: () => { closeSheet(); go('#/words/K:' + c); } }, c),
      el('div', 's-km', el('b', null, tx(k.on.join('・') || k.kun.join('・'), k.m)), el('span', 'data', `${k.st}${tx('画', ' str')} · ${kk(k.kk)}`)),
      el('div', 's-parts', ...k.d.slice(0, 3).map(p => el('button', { class: 's-p', lang: 'ja', 'data-ui-content-value': p, 'aria-label': tx(`部品 ${p}`, `Part ${p}`), onclick: () => { closeSheet(); go('#/words/P:' + p); } }, p))));
  }));
  const isKnown = !!rec || REC.due.includes(w);
  const otherPlace = w === '記憶' ? el('div', 's-also',
    hud(el('b', null, tx('ほかの場所で', 'Also met in')), tx('N1 カード', 'N1 card'), el('span', { lang: 'ja' }, '推進')),
    el('p', { lang: 'ja', 'data-ui-content': 'learning' }, '…土地の', el('mark', null, '記憶'), 'を宿した方言を圧迫してもきた。')) : null;
  sheet.append(...[el('div', 'grab'), layer,
    el('div', 's-head',
      el('div', null, el('div', { class: 's-read', lang: 'ja' }, g ? g.r : ''), word),
      heard ? el('button', { class: 's-hear', 'aria-label': tx('発音を聞く', 'Hear the word'), onclick: () => play(`audio/w/ami/${heard}.m4a`) },
        el('span', { html: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' })) : null),
    S.lang === 'ja' ? null : el('p', 's-gloss', g ? g.m.slice(0, 3).join('; ') : '—'),
    hud(g && g.jlpt, g && g.p && tx('品詞 ' + g.p, g.p)),
    rec ? el('div', 's-rec',
      el('div', 's-hist', ...rec.hist.map(h => el('i', h ? 'ok' : 'miss'))),
      hud(tx(`${rec.addedJa}に保存`, `saved ${rec.added}`), tx(`${rec.seen}回`, `seen ${rec.seen}×`), el('b', null, tx('今日が復習日', 'due today')))) : null,
    kRow, otherPlace,
    el('div', 's-acts',
      isKnown
        ? el('button', { class: 'btn btn-primary', onclick: () => { closeSheet(); go('#/words/W:' + w); } }, tx('つながりを開く', 'Open its web'))
        : el('button', { class: 'btn btn-primary', onclick: e => { e.currentTarget.textContent = tx('保存しました · カードへ', 'Saved · added to cards'); } }, tx('覚える', 'Save to cards')),
      el('button', { class: 'btn btn-line', onclick: closeSheet }, tx('文に戻る', 'Back to the sentence')))].filter(x => x != null));
  document.body.append(scrim, sheet);
  sheetOpen = { sheet, scrim, src: srcEl };
  const h = sheet.offsetHeight;
  sheet.style.transform = `translateY(${h}px)`;
  requestAnimationFrame(() => scrim.classList.add('on'));
  if (srcEl) srcEl.classList.add('lift');
  /* match-cut: the word lifts out of its sentence and becomes the sheet's headword */
  if (srcEl && !RM) {
    const r = srcEl.getBoundingClientRect();
    const fly = el('div', { class: 'flyer', lang: 'ja' }, w);
    fly.style.cssText = `left:${r.left}px;top:${r.top}px;font-size:${parseFloat(getComputedStyle(srcEl).fontSize)}px`;
    document.body.append(fly);
    word.style.opacity = 0;
    const wr = word.getBoundingClientRect();
    const tx0 = wr.left - r.left;
    const sc = parseFloat(getComputedStyle(word).fontSize) / parseFloat(getComputedStyle(srcEl).fontSize);
    const destY = (innerHeight - h) + (wr.top - sheet.getBoundingClientRect().top) - r.top;
    fly.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(0,-6px) scale(1.12)', opacity: 1, offset: .22 },
      { transform: `translate(${tx0}px,${destY}px) scale(${sc})`, opacity: 1 }],
      { duration: 640, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).finished.then(() => {
      word.style.opacity = 1; fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => fly.remove());
    });
  }
  spring(sheet, h, 0, { k: 300, c: 28 }).then(() => {
    sheet.querySelectorAll('.s-kc').forEach((kc, i) => {
      const k = kc.querySelector('.s-k');
      kc.querySelectorAll('.s-p').forEach((p, j) => trace(layer, rel(layer, k, 1, .5), rel(layer, p, 0, .5), { lit: true, delay: i * 160 + j * 90 }));
    });
  });
}

/* ================================================================== LEARN */
function renderLearn() {
  const root = el('main', 'room learn');
  root.append(kanban('学ぶ', 'Learn'));
  const stage = el('section', { class: 'l-stage', 'data-in': '', style: '--i:0' },
    el('div', 'l-top', el('h1', null, tx('学ぶ', 'Learn')), hud(tx('今日', 'today'), el('span', null, '2026.10.08'))),
    el('div', 'l-deck',
      regs(el('div', 'l-card c3')), regs(el('div', 'l-card c2')),
      regs(el('div', 'l-card c1',
        el('div', 'l-due', el('b', 'data', String(dueTotal)), el('span', null, tx('枚 今日の復習', 'cards due today'))),
        el('div', 'l-split',
          ...[['n1', 'N1'], ['n2', 'N2'], ['senmon', tx('専門', 'Fields')]].map(([k, l]) => el('span', null, el('b', 'data', String(REC.dueByDeck[k])), l))),
        hud(tx(`新しい言葉 ${REC.newToday}`, `+${REC.newToday} new`), tx('約9分', '≈ 9 min'), tx(`明日 ${REC.tomorrow.due}`, `tomorrow ${REC.tomorrow.due}`))))),
    el('button', { class: 'btn btn-primary l-start', onclick: () => go('#/learn/front') }, tx('はじめる', 'Start'), el('span', 'k', `${dueTotal}`)));
  const strata = el('div', 'l-strata', ...[['n1', 'N1'], ['n2', 'N2'], ['senmon', tx('専門', 'Fields')]].map(([k, l]) => {
    const n = REC.inReview[k], tot = D.deckSize[k];
    return el('div', 'l-str', el('span', 'l-sl', l), el('span', 'l-bar', el('i', { style: `transform:scaleX(${n / tot})` })), el('span', 'data', `${n}/${fmt(tot)}`));
  }));
  const sec = (no, title, sub, body, count, href) => el('li', null, el('button', { class: 'l-sec', onclick: () => href && go(href) },
    el('span', 'data l-no', no), el('span', 'l-sb', el('b', null, title), el('span', 'l-sub', sub), body), el('span', 'l-count data', count)));
  const index = el('ol', { class: 'l-index', 'data-in': '', style: '--i:1' },
    sec('01', tx('カード', 'Cards'), tx('三つのデッキ、文章で覚える', 'Three passage decks; one memory'), strata, `${REC.inReview.n1 + REC.inReview.n2 + REC.inReview.senmon}`, '#/learn/front'),
    sec('02', tx('集中', 'Focus sitting'), tx('25分、画面は静かに', '25 minutes; the screen goes quiet'), hud(tx(`前回 ${REC.sitting.dateJa} · ${REC.sitting.min}分`, `last ${REC.sitting.date} · ${REC.sitting.min} min`)), '25′'),
    sec('03', tx('試験', 'Tests'), tx('JLPT N1 模試 · 短縮 30分 / 本番 170分', 'JLPT N1 mock · short 30 min / full 170 min'), hud(tx('まだ受けていない', 'not taken yet')), '0'),
    sec('04', tx('案内', 'Guided'), tx('今日の記事から:', 'From today’s article:'), el('span', { class: 'l-gram', lang: 'ja' }, '〜わけではない'), '1'));
  root.append(stage, index);
  return root;
}

/* ------------------------------------------------------------------ the card */
const CARD = D.cards[0];
function renderCard(back) {
  const c = CARD, k = c.card;
  const root = el('main', 'room learn card-room' + (back ? ' is-back' : ''));
  const ticks = el('div', 'c-ticks', ...Array.from({ length: dueTotal }, (_, i) => el('i', i === 0 ? 'now' : '')));
  const top = el('div', 'c-top',
    el('button', { class: 'c-x', 'aria-label': tx('終了', 'End session'), onclick: () => go('#/learn') }, el('span', { html: '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.4"/></svg>' })),
    ticks, el('span', 'data c-n', `01/${dueTotal}`));
  const card = regs(el('article', { class: 'c-card' + (back ? ' snap' : '') }));
  const meta = hud(c.deck.toUpperCase(), tx(c.groupJa, c.group), tx('論説', 'essay register'), tx(`${pad(k.ja.length, 3)}字`, `${k.ja.length} chars`));
  const pass = el('div', 'c-pass', rubyCard(k.ruby, back, back ? (e, w) => {
    const tok = { s: w, b: w }; openSheet(tok, e.currentTarget);
  } : null));
  card.append(el('div', 'c-meta', meta), pass);
  card.append(el('i', 'c-beamwrap', el('i', 'c-beam')));
  let ans = null;
  if (back) ans = cardAnswer(c);
  const front = !back ? el('div', 'c-dock',
    el('button', { class: 'btn btn-primary c-reveal', onclick: () => flip(root, card) }, tx('答えを見る', 'Reveal'), el('span', 'k', tx('スペース', 'SPACE')))) : null;
  root.append(...[el('div', 'c-stage', top, ans, card, back ? cardFoot(c) : null), front, back ? gradeDock() : null].filter(Boolean));
  root._after = () => { if (back) drawShared(ans); };
  root._key = e => { if (e.code === 'Space' && !back) { e.preventDefault(); flip(root, card); } };
  return root;
}
function cardAnswer(c) {
  const k = c.card;
  const layer = el('div', 'traces');
  const shared = c.kanji[0].parts.filter(p => c.kanji[1] && c.kanji[1].parts.includes(p) && p !== '亻');
  const kan = el('div', 'c-kanji', ...c.kanji.map(kk => el('div', 'c-kc',
    el('button', { class: 'c-k', lang: 'ja', 'data-ui-content-value': kk.c, 'aria-label': tx(`${kk.c} を開く`, `Open ${kk.c}`), onclick: () => go('#/words/K:' + kk.c) }, kk.c),
    el('div', 'c-km', el('b', null, tx(kk.r, kk.m)), el('span', 'data', `${kk.st}${tx('画', ' str')}`)),
    el('div', 'c-parts', ...kk.parts.map(p => el('span', { class: 'c-p' + (shared.includes(p) ? ' shared' : ''), lang: 'ja' }, p))))));
  return el('section', 'c-ans', layer,
    el('div', 'c-head',
      el('div', null, el('div', { class: 'c-read', lang: 'ja' }, c.reading), el('div', { class: 'c-term', lang: 'ja', 'data-ui-content': 'learning' }, c.term)),
      el('div', 'c-def', el('p', { lang: 'ja', 'data-ui-content': 'learning' }, c.defJa), hud(tx('名詞', c.pos), tx('出典 書き下ろし', 'Bunki original')))),
    kan);
}
function cardFoot(c) {
  const k = c.card;
  const sh = c.kanji[0].parts.filter(p => c.kanji[1] && c.kanji[1].parts.includes(p) && p !== '亻')[0];
  const enBtn = el('button', { class: 'btn btn-quiet c-en-btn' }, tx('英訳を表示', 'Show English'));
  const enBox = el('div', 'c-en', el('p', null, el('b', null, c.meaning)), el('p', 'c-en-pass', k.en));
  enBtn.onclick = () => { enBox.classList.toggle('open'); enBtn.textContent = enBox.classList.contains('open') ? tx('英訳を隠す', 'Hide English') : tx('英訳を表示', 'Show English'); };
  const fam = sh && D.radicals[sh];
  return el('section', 'c-foot',
    sh ? el('div', 'c-shared hud lit', tx('共通の部品 ', 'shared part '), el('span', { lang: 'ja', 'data-ui-content': 'learning' }, sh), tx(` · ${fam ? fam.n + '字に現れる' : ''}`, ` · ${D.kanji[sh] ? D.kanji[sh].m.toLowerCase() : ''} · in ${fam ? fam.n : ''} kanji`)) : null,
    sh && fam ? el('p', { class: 'c-fam', lang: 'ja' }, fam.kanji.slice(0, 16).join(' ')) : null,
    S.lang === 'ja' ? null : el('div', 'c-enrow', enBtn, enBox));
}
function drawShared(ans) {
  const layer = ans.querySelector('.traces');
  const sh = ans.querySelectorAll('.c-p.shared');
  if (sh.length === 2) {
    const a = rel(layer, sh[0], .5, 1), b = rel(layer, sh[1], .5, 1);
    const m1 = [a[0], a[1] + 9], m2 = [b[0], b[1] + 9];
    trace(layer, a, m1, { lit: true, delay: 100 }); trace(layer, m1, m2, { lit: true, delay: 300, spark: true }); trace(layer, m2, b, { lit: true, delay: 700 });
  }
}
function gradeDock() {
  const G = [['再', 'Again', 'again'], ['難', 'Hard', 'hard'], ['良', 'Good', 'good'], ['易', 'Easy', 'easy']];
  return el('div', 'c-grades', ...G.map(([j, e, cls], i) => el('button', { class: 'g ' + cls, onclick: ev => grade(ev.currentTarget, cls) },
    S.lang === 'ja' ? el('span', { class: 'g-ja', lang: 'ja' }, j) : el('span', 'g-en', e),
    el('span', 'data g-iv', REC.intervals[i]))));
}
async function grade(btn, cls) {
  btn.classList.add('pressed');
  try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
  const card = document.querySelector('.c-card');
  if (cls === 'again' && card) { card.append(el('i', 'slash')); await wait(700); }
  else if (card) { card.append(el('i', { class: 'stamp', html: `<span>${cls === 'easy' ? tx('易', 'EASY') : cls === 'good' ? tx('良', 'GOOD') : tx('難', 'HARD')}</span>` })); await wait(520); }
  go('#/learn/done');
}
async function flip(root, card) {
  if (root.classList.contains('flipping')) return;
  root.classList.add('flipping');
  /* lift, register, then the beam reads the passage and leaves its readings behind */
  card.classList.add('lift'); card.classList.add('snap');
  await wait(260);
  history.replaceState(null, '', location.pathname + location.search + '#/learn/back');
  const fresh = renderCard(true);
  const stage = root.querySelector('.c-stage');
  const newStage = fresh.querySelector('.c-stage');
  const newCard = newStage.querySelector('.c-card');
  newCard.classList.add('revealing');
  stage.replaceWith(newStage);
  root.querySelector('.c-dock') && root.querySelector('.c-dock').replaceWith(fresh.querySelector('.c-grades'));
  root.classList.add('is-back');
  // stagger ruby by vertical position under the beam
  const rts = newCard.querySelectorAll('rt');
  const top = newCard.getBoundingClientRect().top, hgt = newCard.offsetHeight;
  rts.forEach(rt => { const y = rt.getBoundingClientRect().top - top; rt.style.transitionDelay = `${Math.round(y / hgt * 700)}ms`; });
  await raf();
  newCard.classList.add('read');
  const ans = newStage.querySelector('.c-ans');
  ans.classList.add('rise'); newStage.querySelector('.c-foot').classList.add('rise');
  await wait(900);
  drawShared(ans);
  root.classList.remove('flipping');
  setTab('learn');
}
function renderDone() {
  const root = el('main', 'room learn done');
  const next = D.articles[0];
  root.append(el('section', { class: 'd-plate', 'data-in': '', style: '--i:0' },
    regs(el('div', 'd-seal', el('span', null, tx('了', 'DONE')))),
    el('h1', null, tx('今日の復習を終えました', 'Today’s review is done')),
    hud(tx(`${dueTotal}枚`, `${dueTotal} cards`), tx('正答 16', '16 recalled'), tx('やり直し 2', '2 again'), tx('8分40秒', '8 min 40 s')),
    el('div', 'd-next',
      hud(el('b', null, tx('次の扉', 'Next door'))),
      el('button', { class: 'd-door', onclick: () => go('#/read/article') },
        el('img', { src: `/prototypes/corridor/data/articles/pictures/${next.id}-600.webp`, alt: '' }),
        el('span', null, el('b', { lang: 'ja' }, next.title), hud(tx(`今日の言葉 ${next.due.length}語がこの記事に`, `${next.due.length} of today’s words live in this article`)))),
      el('button', { class: 'btn btn-primary', onclick: () => go('#/read/article') }, tx('読みに行く', 'Read it now')),
      hud(tx('明日の最初の言葉', 'Tomorrow’s first word'), el('span', { lang: 'ja', class: 'peek' }, REC.tomorrow.first)))));
  return root;
}

/* ================================================================== WORDS — the web */
const PARTS = { '推': ['扌', '隹'], '進': ['隹', '辶'] };
const SENT = {
  'S:ai2': { ja: 'しかし、記憶の価値が失われたわけではない。', src: 'AI時代の知識と判断', where: ['¶2', '第2段落'], href: '#/read/article' },
  'S:ai1': { ja: '人間がすべてを暗記しておく必然性は以前より小さい。', src: 'AI時代の知識と判断', where: ['¶1', '第1段落'], href: '#/read/article' },
  'S:ai4': { ja: '記事で出会った語が会話で別の顔を見せ…', src: 'AI時代の知識と判断', where: ['¶4', '第4段落'], href: '#/read/article' },
  'S:card': { ja: '土地の記憶を宿した方言を圧迫してもきた。', src: 'N1 · 推進', where: ['card', 'カード'], href: '#/learn/back' },
  'S:koji': { ja: '私たちが編纂の現場を直接見たわけではなく…', src: '『古事記』編纂と権力の物語', where: ['¶2', '第2段落'], href: '#/read' },
};
const EDGES = [
  ['W:記憶', 'K:記'], ['W:記憶', 'K:憶'], ['W:記憶', 'S:ai2'], ['W:記憶', 'S:card'], ['W:記憶', 'G:wake'], ['W:記憶', 'W:暗記'], ['W:記憶', 'W:記録'], ['W:記憶', 'W:憶測'],
  ['K:記', 'P:言'], ['K:記', 'P:己'], ['K:記', 'W:記事'], ['K:記', 'W:暗記'], ['K:記', 'W:日記'], ['K:記', 'C:古事記'], ['K:記', 'W:記録'],
  ['K:憶', 'P:忄'], ['K:憶', 'K:意'], ['K:憶', 'W:憶測'],
  ['K:意', 'P:音'], ['K:意', 'P:心'], ['K:意', 'W:意味'], ['K:意', 'W:意識'], ['K:意', 'W:意図'], ['K:意', 'W:注意'],
  ['P:言', 'K:語'], ['P:言', 'K:識'], ['P:言', 'K:読'],
  ['P:己', 'K:紀'], ['P:己', 'K:起'], ['P:己', 'K:改'],
  ['P:音', 'K:識'], ['P:音', 'K:暗'], ['P:忄', 'P:心'], ['P:心', 'K:念'],
  ['K:識', 'W:知識'], ['K:識', 'W:意識'], ['K:語', 'W:語彙'], ['K:語', 'W:語学'], ['K:暗', 'W:暗記'],
  ['W:暗記', 'S:ai1'], ['W:記事', 'S:ai4'], ['G:wake', 'S:ai2'], ['G:wake', 'S:koji'], ['C:古事記', 'S:koji'],
  ['S:card', 'W:推進'], ['W:推進', 'K:推'], ['W:推進', 'K:進'], ['K:推', 'P:隹'], ['K:進', 'P:隹'], ['K:推', 'W:推測'], ['K:進', 'W:前進'], ['K:進', 'W:進歩'], ['P:隹', 'K:集'], ['K:紀', 'W:紀元'], ['K:起', 'W:起源'],
  ['W:意図', 'S:ai4'],
];
const ADJ = {};
for (const [a, b] of EDGES) { (ADJ[a] = ADJ[a] || []).push(b); (ADJ[b] = ADJ[b] || []).push(a); }
const typeOf = id => id[0];
const valOf = id => id.slice(2);
function nodeEl(id) {
  const t = typeOf(id), v = valOf(id);
  let inner;
  if (t === 'W') { const g = D.words[v]; inner = el('span', 'n-in', el('small', { lang: 'ja' }, g ? g.r : ''), el('b', { lang: 'ja' }, v)); }
  else if (t === 'K') inner = el('span', 'n-in', el('b', { lang: 'ja' }, v));
  else if (t === 'P') inner = el('span', 'n-in', el('b', { lang: 'ja' }, v));
  else if (t === 'S') inner = el('span', 'n-in', el('span', { lang: 'ja' }, SENT[id].ja.slice(0, 22) + (SENT[id].ja.length > 22 ? '…' : '')));
  else if (t === 'G') inner = el('span', 'n-in', el('b', { lang: 'ja' }, '〜わけではない'));
  else inner = el('span', 'n-in', el('b', { lang: 'ja' }, v), el('small', 'data', '712'));
  return el('button', { class: 'node n-' + t, 'data-id': id, 'data-ui-content-value': v, 'aria-label': tx(`${v} を中心に`, `Centre on ${v}`) }, inner);
}
let web = null;
function renderWords(centreId) {
  const root = el('main', 'room words');
  root.append(kanban('辞書', 'Words'));
  const head = el('header', { class: 'w-head', 'data-in': '', style: '--i:0' },
    el('h1', null, tx('辞書', 'Words')),
    el('button', { class: 'w-search', 'aria-label': tx('言葉を探す', 'Look up a word') },
      el('span', { html: '<svg viewBox="0 0 20 20" width="16" height="16"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="1.3"/></svg>' }),
      el('span', null, tx('言葉・漢字・部品を探す', 'Look up a word, kanji or part'))));
  const trail = el('div', { class: 'w-trail', 'data-in': '', style: '--i:1' });
  const canvas = el('div', { class: 'w-canvas', 'data-in': '', style: '--i:1' });
  const edges = el('div', 'traces');
  const nodes = el('div', 'w-nodes');
  const title = el('div', 'w-title');
  canvas.append(el('i', 'w-ring r1'), el('i', 'w-ring r2'), edges, nodes, title);
  regs(canvas);
  const detail = el('section', { class: 'w-detail', 'data-in': '', style: '--i:2' });
  root.append(head, trail, canvas, detail);
  web = { canvas, edges, nodes, title, detail, trail, els: new Map(), pos: new Map(), centre: null, walk: [] };
  nodes.addEventListener('click', e => { const n = e.target.closest('.node'); if (n) recentre(n.dataset.id); });
  root._after = () => recentre(centreId || 'W:記憶', true);
  return root;
}
function layout(centre, prev) {
  const W = web.canvas.clientWidth, Hh = web.canvas.clientHeight;
  const cx = W / 2, cy = Hh / 2;
  let nb = (ADJ[centre] || []).slice(0, 9);
  if (prev && !nb.includes(prev)) nb = [prev, ...nb.slice(0, 8)];
  const P = new Map([[centre, [cx, cy]]]);
  const n = nb.length;
  let a0 = -Math.PI / 2;
  if (prev && web.pos.has(centre) && web.pos.has(prev)) {
    const [px, py] = web.pos.get(centre), [ox, oy] = web.pos.get(prev);
    a0 = Math.atan2(py - oy, px - ox) + Math.PI; // the old centre goes opposite the way we travelled
  }
  const order = prev ? [prev, ...nb.filter(x => x !== prev)] : nb;
  order.forEach((id, i) => {
    const a = a0 + i * 2 * Math.PI / n;
    const rx = W / 2 - 58, ry = Hh / 2 - 46;
    P.set(id, [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  });
  return P;
}
function recentre(id, first) {
  if (!web) return;
  if (id === web.centre) return;
  const prev = web.centre;
  if (web.walk.includes(id)) web.walk = web.walk.slice(0, web.walk.indexOf(id) + 1); else web.walk.push(id);
  const P = layout(id, web.walk.length > 1 ? web.walk[web.walk.length - 2] : null);
  const old = new Map(web.pos);
  // camera shift for leavers: move with the travel
  const shift = prev && old.has(id) ? [P.get(id)[0] - old.get(id)[0], P.get(id)[1] - old.get(id)[1]] : [0, 0];
  for (const [nid, e] of web.els) {
    if (!P.has(nid)) {
      const [x, y] = old.get(nid);
      e.classList.add('gone');
      e.style.transform = `translate(${x + shift[0]}px,${y + shift[1]}px)`;
      setTimeout(() => e.remove(), 520);
      web.els.delete(nid);
    }
  }
  [...web.edges.children].forEach(t => { t.style.opacity = 0; setTimeout(() => t.remove(), 200); });
  let k = 0;
  for (const [nid, [x, y]] of P) {
    let e = web.els.get(nid);
    if (!e) {
      e = nodeEl(nid);
      const from = old.has(id) && !first ? [x - shift[0] * .5, y - shift[1] * .5] : [x, y];
      e.style.transform = `translate(${from[0]}px,${from[1]}px)`;
      e.classList.add('born');
      web.nodes.append(e); web.els.set(nid, e);
      e.style.setProperty('--d', (first ? 200 + k * 60 : 240 + k * 40) + 'ms');
    }
    e.classList.toggle('centre', nid === id);
    e.classList.toggle('walked', web.walk.includes(nid) && nid !== id);
    requestAnimationFrame(() => requestAnimationFrame(() => { e.classList.remove('born'); e.style.transform = `translate(${x}px,${y}px)`; }));
    k++;
  }
  web.pos = P; web.centre = id;
  const backTo = web.walk.length > 1 ? web.walk[web.walk.length - 2] : null;
  setTimeout(() => {
    if (web.centre !== id) return;
    const c = P.get(id);
    let j = 0;
    for (const [nid, p] of P) {
      if (nid === id) continue;
      const lit = nid === backTo;
      const dx = p[0] - c[0], dy = p[1] - c[1], L = Math.hypot(dx, dy);
      const r0 = 34, r1 = 26;
      trace(web.edges, [c[0] + dx / L * r0, c[1] + dy / L * r0], [p[0] - dx / L * r1, p[1] - dy / L * r1], { lit, delay: j++ * 45, spark: lit });
    }
  }, first ? 420 : 380);
  drawTrail(); drawDetail(id); drawTitle(id);
}
function drawTrail() {
  const t = web.trail; t.textContent = '';
  t.append(el('span', 'hud', tx('たどった道', 'Your walk')));
  web.walk.forEach((id, i) => {
    if (i) t.append(el('i', 'w-arrow'));
    t.append(el('button', { class: 'w-crumb' + (i === web.walk.length - 1 ? ' on' : ''), lang: 'ja', 'data-ui-content-value': valOf(id), 'aria-label': tx(`${valOf(id)} に戻る`, `Back to ${valOf(id)}`), onclick: () => recentre(id) }, typeOf(id) === 'G' ? '〜わけではない' : typeOf(id) === 'S' ? '「…」' : valOf(id)));
  });
}
function drawTitle(id) {
  const t = typeOf(id);
  const names = { W: tx('語', 'WORD'), K: tx('漢字', 'KANJI'), P: tx('部品', 'PART'), S: tx('文', 'PASSAGE'), G: tx('文法', 'GRAMMAR'), C: tx('文化', 'CULTURE') };
  web.title.textContent = '';
  web.title.append(hud(el('b', null, names[t]), tx(`つながり ${Math.min((ADJ[id] || []).length, 9)}`, `${Math.min((ADJ[id] || []).length, 9)} links`), tx(`深さ ${web.walk.length - 1}`, `depth ${web.walk.length - 1}`)));
}
function drawDetail(id) {
  const d = web.detail, t = typeOf(id), v = valOf(id);
  const body = el('div', 'w-d');
  const _ap = body.append.bind(body); body.append = (...k) => _ap(...k.filter(x => x != null && x !== false));
  if (t === 'W') {
    const g = D.words[v] || {}; const rec = REC.words[v];
    body.append(el('div', 'w-dh', el('div', null, el('small', { lang: 'ja' }, g.r || ''), el('b', { lang: 'ja', 'data-ui-content': 'learning' }, v)),
      D.wordAudio[v] ? el('button', { class: 's-hear', 'aria-label': tx('発音を聞く', 'Hear the word'), onclick: () => play(`audio/w/ami/${D.wordAudio[v]}.m4a`) }, el('span', { html: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' })) : null),
      S.lang === 'ja' ? null : el('p', 'w-gl', (g.m || []).slice(0, 3).join('; ')),
      hud(g.jlpt || tx('級外', 'no JLPT level'), g.p, rec ? tx(`保存 ${rec.addedJa} · ${rec.seen}回`, `saved ${rec.added} · seen ${rec.seen}×`) : REC.due.includes(v) ? tx('今日が復習日', 'due today') : tx('まだカードにない', 'not in your cards')));
  } else if (t === 'K' || t === 'P') {
    const k = D.kanji[v] || {}, fam = D.radicals[v];
    const parts = PARTS[v] || k.d || [];
    body.append(el('div', 'w-dh', el('div', null, el('b', { class: 'w-kbig', lang: 'ja' }, v)),
      el('dl', 'w-spec',
        S.lang === 'ja' ? null : el('dt', null, 'meaning'), S.lang === 'ja' ? null : el('dd', null, k.m || '—'),
        el('dt', null, tx('音', 'on')), el('dd', { lang: 'ja' }, (k.on || []).join('・') || '—'),
        el('dt', null, tx('訓', 'kun')), el('dd', { lang: 'ja' }, (k.kun || []).slice(0, 2).join('・') || '—'),
        el('dt', null, tx('画数', 'strokes')), el('dd', 'data', k.st || '—'),
        el('dt', null, tx('漢検', 'kanken')), el('dd', null, kk(k.kk).replace('Kanken ', '')),
        el('dt', null, tx('部首', 'radical')), el('dd', 'data', k.rad ? '#' + k.rad : '—'))),
      parts.length ? hud(el('b', null, tx('部品', 'parts')), ...parts.map(p => el('span', { lang: 'ja' }, p))) : null,
      fam ? hud(el('b', null, tx('家族', 'family')), tx(`${fam.n}字`, `in ${fam.n} kanji`), el('span', { lang: 'ja', class: 'w-fam' }, fam.kanji.slice(0, 12).join(' '))) : null);
  } else if (t === 'S') {
    const s = SENT[id];
    body.append(el('p', { class: 'w-sent', lang: 'ja', 'data-ui-content': 'learning' }, s.ja),
      hud(el('span', { lang: 'ja' }, s.src), tx(s.where[1], s.where[0])),
      el('button', { class: 'btn btn-line', onclick: () => go(s.href) }, tx('この文へ', 'Go to this passage')));
  } else if (t === 'G') {
    body.append(el('div', 'w-dh', el('b', { lang: 'ja', class: 'w-gram' }, '〜わけではない')),
      S.lang === 'ja' ? el('p', 'w-gl', '「必ずしも〜ではない」と部分的に打ち消す') : el('p', 'w-gl', 'it is not (necessarily) the case that… — a partial denial'),
      hud(tx('N3 文法', 'N3 grammar'), tx('今日の文章に 2回', 'twice in today’s reading')));
  } else {
    body.append(el('div', 'w-dh', el('div', null, el('small', { lang: 'ja' }, 'こじき'), el('b', { lang: 'ja' }, '古事記'))),
      S.lang === 'ja' ? el('p', 'w-gl', '現存最古の歴史書。「記」は「しるす」。') : el('p', 'w-gl', 'Record of Ancient Matters, Japan’s oldest surviving chronicle; ', el('span', { lang: 'ja', 'data-ui-content': 'learning' }, '記'), ' is “to record”.'),
      hud(tx('和銅五年', 'presented 712'), el('span', { lang: 'ja' }, '太安万侶'), tx('記事 1本', '1 article on your shelf')),
      el('button', { class: 'btn btn-line', onclick: () => go('#/read') }, tx('記事を開く', 'Open the article')));
  }
  d.classList.add('swap');
  setTimeout(() => { d.textContent = ''; d.append(regs(body)); d.classList.remove('swap'); }, d.childElementCount ? 140 : 0);
}

/* ================================================================== ME */
function renderMe() {
  const root = el('main', 'room me');
  root.append(kanban('私 · 記録', 'Me · Record'));
  const n1 = REC.inReview.n1, sen = REC.inReview.senmon;
  const gauge = (label, n, tot, unit, note, i) => el('li', { class: 'm-g', style: `--i:${i}` },
    el('div', 'm-gh', el('b', null, label), el('span', 'data', tot ? `${fmt(n)} / ${fmt(tot)}` : fmt(n))),
    el('div', 'm-track', tot ? el('i', { style: `transform:scaleX(${n / tot})` }) : el('i', { style: `transform:scaleX(.08)` }), ...Array.from({ length: 11 }, (_, k) => el('span', { style: `left:${k * 10}%` }))),
    hud(unit, note));
  const head = el('header', { class: 'm-head', 'data-in': '', style: '--i:0' },
    el('h1', null, tx('あなたの記録', 'Your record')),
    hud(tx('2026年8月29日から', 'since 29 Aug 2026'), tx(`${REC.days.length}日`, `${REC.days.length} days`), tx(`${studyDays}日 学習`, `${studyDays} studied`), tx(`${fmt(reviewed)}回 復習`, `${fmt(reviewed)} reviews`)));
  const hz = el('ol', { class: 'm-hz', 'data-in': '', style: '--i:1' },
    gauge(tx('N1 語彙', 'N1 vocabulary'), n1, D.deckSize.n1, tx('思い出せた文章カード', 'passage cards recalled'), tx(`辞書のN1語 ${fmt(D.n1Words)}`, `of ${fmt(D.n1Words)} N1 words in the dictionary`), 0),
    gauge(tx('あなたの分野', 'Your fields'), sen, D.deckSize.senmon, tx('専門カード', 'fields cards recalled'), tx('五つの分野', 'five fields'), 1),
    gauge(tx('声', 'Your voice'), REC.shadowed, 0, tx('シャドーイングした文', 'sentences shadowed'), tx('目標なし · 記録のみ', 'no target; a record'), 2),
    gauge(tx('漢検', 'Kanken'), REC.kanjiRecalled, D.kanken2, tx('思い出せた漢字', 'kanji recalled'), tx('2級までの漢字', 'kanji through level 2'), 3));
  /* hanko calendar */
  const cal = el('div', 'm-cal');
  const start = new Date(2026, 7, 29);
  const lead = (start.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cal.append(el('i', 'blank'));
  REC.days.forEach((n, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const today = i === REC.days.length - 1;
    cal.append(el('span', { class: 'm-day' + (n ? ' on' : '') + (today ? ' today' : ''), style: `--s:${n ? .55 + Math.min(n, 60) / 140 : 0};--i:${i}`, title: `${d.getMonth() + 1}/${d.getDate()} · ${n}` },
      el('small', 'data', d.getDate()), n ? el('i', { class: 'hanko', 'aria-hidden': 'true' }) : null));
  });
  const calSec = el('section', { class: 'm-sec', 'data-in': '', style: '--i:3' },
    el('div', 'm-sh', el('b', null, tx('判の暦', 'Your days')), hud(tx('月 火 水 木 金 土 日', 'MON → SUN'), tx('印 = 学習日', 'seal = a day studied'))), cal);
  const seams = el('section', { class: 'm-sec m-kin', 'data-in': '', style: '--i:2' },
    el('div', 'm-sh', el('b', null, tx('戻ってきた言葉', 'Words that came back')), hud(tx('忘れて、また覚えた', 'lost, then kept'))),
    el('ul', 'm-seams', ...REC.recovered.map(r => el('li', null,
      el('span', { class: 'm-w', lang: 'ja', 'data-ui-content': 'learning' }, el('small', null, r.r), r.w),
      el('span', 'm-seam', el('i', 'crack'), el('i', 'gold')),
      hud(tx(`${r.lapsedJa} 忘れ`, `lost ${r.lapsed}`), tx(`${r.keptJa} 定着`, `kept ${r.kept}`), tx(`${r.gap}日`, `${r.gap} days`))))));
  const set = el('section', { class: 'm-sec m-set', 'data-in': '', style: '--i:4' },
    el('div', 'm-sh', el('b', null, tx('設定', 'Settings'))),
    row(tx('言語', 'Language'), seg([['en', 'English'], ['ja', '日本語']], S.lang, v => reload({ lang: v === 'ja' ? 'ja' : null }))),
    row(tx('明かり', 'Light'), seg([['day', tx('昼', 'Day')], ['night', tx('夜', 'Night')]], S.theme, v => reload({ theme: v === 'night' ? 'night' : null }))),
    row(tx('出典とライセンス', 'Credits & licences'), el('span', 'hud', 'JMdict · KANJIDIC2 · KanjiVG · ' + tx('小春音アミ', 'Ami voice'))));
  root.append(head, hz, seams, calSec, set);
  return root;
}
const row = (l, c) => el('div', 'm-row', el('span', null, l), c);
function seg(opts, cur, on) {
  return el('div', 'seg', ...opts.map(([v, l]) => el('button', { class: v === cur ? 'on' : '', 'aria-pressed': v === cur ? 'true' : 'false', lang: v === 'ja' ? 'ja' : null, onclick: () => on(v) }, l)));
}
function reload(p) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(p)) { if (v) q.set(k, v); else q.delete(k); }
  location.href = location.pathname + (q.toString() ? '?' + q : '') + location.hash;
}

/* ================================================================== router */
const view = document.getElementById('view');
let current = null;
function route() {
  const h = location.hash || '#/today';
  const parts = h.slice(2).split('/');
  const room = ['today', 'read', 'learn', 'words', 'me'].includes(parts[0]) ? parts[0] : 'today';
  if (sheetOpen && h !== '#/read/popup') closeSheet();
  if (current && current._cleanup) current._cleanup();
  let node;
  if (room === 'today') node = renderToday();
  else if (room === 'read') node = parts[1] === 'article' ? renderArticle(false) : parts[1] === 'popup' ? renderArticle(true) : renderShelf();
  else if (room === 'learn') node = parts[1] === 'front' ? renderCard(false) : parts[1] === 'back' ? renderCard(true) : parts[1] === 'done' ? renderDone() : renderLearn();
  else if (room === 'words') node = renderWords(parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null);
  else node = renderMe();
  H.dataset.room = room;
  setTab(room);
  if (current) {
    const ghost = el('div', 'leaving');
    ghost.style.top = -view.scrollTop + 'px';
    ghost.append(current); document.body.append(ghost);
    setTimeout(() => ghost.remove(), 220);
  }
  view.scrollTop = 0;
  view.append(node);
  current = node;
  requestAnimationFrame(() => requestAnimationFrame(() => { node.classList.add('entered'); node._after && node._after(); }));
}
addEventListener('hashchange', route);
addEventListener('keydown', e => { if (current && current._key) current._key(e); if (e.key === 'Escape') closeSheet(); });
buildTabs();
route();
})();
