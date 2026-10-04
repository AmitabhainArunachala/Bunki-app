/**
 * 集中道場 deck player. One screen at a time: deck → study → done, plus the
 * word list and settings. The schedule is this deck's own ledger in
 * localStorage (`bunki-cloze:<deck id>`), never the corridor's word queue.
 *
 *   render(main, { deckId, storage, onLeave })
 */
import {
  RATINGS,
  buildQueue,
  createScheduler,
  emptyState,
  grade,
  indexDeck,
  learningSoon,
  normalizeState,
  preview,
  validateDeck,
  wordStatus,
} from './engine.js';

const fsrsApi = window.__TSFSRS__ || (await import('../../vendor/ts-fsrs.mjs'));
const pin = window.__CORRIDOR_BUNDLE__?.['fsrs-pin'] || (await fetchJson(new URL('../../data/fsrs-pin.json', import.meta.url)));
const scheduler = createScheduler(fsrsApi, pin);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

const decks = new Map();
async function loadDeck(deckId) {
  if (decks.has(deckId)) return decks.get(deckId);
  const packed = window.__CORRIDOR_BUNDLE__?.[`decks/${deckId}`] || window.__KP_DECKS__?.[deckId];
  const deck = packed || (await fetchJson(new URL(`../${deckId}/deck.json`, import.meta.url)));
  const problems = validateDeck(deck);
  if (problems.length) throw new Error(problems[0]);
  const entry = { deck, index: indexDeck(deck) };
  decks.set(deckId, entry);
  return entry;
}

/* ------------------------------------------------------------- state */
const PREFS_DEFAULT = { newPerDay: 15, hint: 'ja', mode: 'self', look: 'dark', furigana: 'tap' };
const ui = { screen: 'home', queue: [], pos: 0, revealed: false, picked: null, undo: null, done: 0, right: 0, q: '', open: null, shown: new Set(), toast: '' };
let ctx = null; // { root, deck, index, storage, onLeave, state, prefs }

const stateKey = (id) => `bunki-cloze:${id}`;
const prefsKey = (deckId) => `bunki-cloze:prefs:v3:${deckId}`; // one set per deck
const prefsFor = (storage, deck) => ({ ...PREFS_DEFAULT, ...(deck.defaults || {}), ...(readJson(storage, prefsKey(deck.id)) || {}) });
function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function save() {
  writeJson(ctx.storage, stateKey(ctx.deck.id), ctx.state);
}
function savePrefs() {
  writeJson(ctx.storage, prefsKey(ctx.deck.id), ctx.prefs);
}

/* ------------------------------------------------------------- helpers */
function el(tag, cls, ...kids) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
function btn(cls, label, onClick, attrs = {}) {
  const b = el('button', cls, label);
  b.type = 'button';
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  b.addEventListener('click', onClick);
  return b;
}
const KANJI = /[㐀-鿿々〆ヵヶ]/;
const MIN = 60e3;
const DAY = 864e5;
function fmtWait(ms) {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}分`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}時間`;
  if (ms < 30 * DAY) return `${Math.round(ms / DAY)}日`;
  if (ms < 365 * DAY) return `${Math.round(ms / (30 * DAY))}か月`;
  return `${(ms / (365 * DAY)).toFixed(1)}年`;
}
const KIND_NAME = { news: 'ニュース', blog: 'ブログ', qa: 'Q&A', company: '企業サイト', gov: '公的機関', literature: '文学', tatoeba: 'Tatoeba', wiki: 'Wikipedia', social: 'SNS', 'example-bank': '例文集', other: 'ウェブ', original: '書き下ろし' };
const STATUS = {
  new: ['未', 'kp-st-new'],
  learning: ['学習中', 'kp-st-learn'],
  growing: ['定着中', 'kp-st-grow'],
  known: ['覚えた', 'kp-st-known'],
  hard: ['苦手', 'kp-st-hard'],
};

/** sentence → nodes. blank: hide the target; ruby: 'all' | 'none' | 'tap' */
function sentenceNodes(card, { blank, ruby }) {
  const out = el('p', 'kp-sentence');
  out.lang = 'ja';
  card.ruby.forEach(([text, reading, isTarget], i) => {
    if (isTarget === 1 && blank) {
      out.append(el('span', 'kp-blank', card.hint ? `〔${card.hint}〕` : '　'.repeat(Math.min(6, Math.max(2, [...text].length)))));
      return;
    }
    const hasRuby = reading && KANJI.test(text);
    let node;
    if (hasRuby && (ruby === 'all' || (ruby === 'tap' && ui.shown.has(i)))) {
      node = el('ruby', null, text, el('rt', null, reading));
    } else if (hasRuby && ruby === 'tap') {
      node = el('span', 'kp-tapword', text);
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        ui.shown.add(i);
        paint();
      });
    } else {
      node = document.createTextNode(text);
    }
    if (isTarget) {
      const wrap = el('span', 'kp-target');
      wrap.append(node);
      out.append(wrap);
    } else out.append(node);
  });
  return out;
}

/* ------------------------------------------------------------- screens */
function paint() {
  if (!ctx?.root?.isConnected) return;
  const root = ctx.root;
  root.replaceChildren();
  root.dataset.look = ctx.prefs.look;
  const screens = { home: homeScreen, study: studyScreen, list: listScreen, settings: settingsScreen };
  root.append((screens[ui.screen] || homeScreen)());
  if (ui.toast) root.append(el('div', 'kp-toast', ui.toast));
}

function topBar(title, back) {
  const bar = el('header', 'kp-top');
  if (back) bar.append(btn('kp-icon', '←', back, { 'aria-label': '戻る' }));
  bar.append(el('h1', 'kp-title', title));
  return bar;
}

function homeScreen() {
  const { deck, state, prefs } = ctx;
  const now = new Date();
  const q = buildQueue(deck, state, now, prefs.newPerDay);
  const statuses = deck.words.map((w) => wordStatus(w, state));
  const known = statuses.filter((s) => s.key === 'known').length;
  const hard = statuses.filter((s) => s.key === 'hard').length;
  const box = el('section', 'kp-home');
  box.append(topBar(deck.titleJa, ctx.onLeave ? () => ctx.onLeave() : null));
  box.append(el('p', 'kp-sub', `${deck.words.length}語 · ${deck.words.reduce((n, w) => n + w.cards.length, 0)}枚 · ${deck.titleEn}`));

  const tiles = el('div', 'kp-tiles');
  const tile = (n, label, cls) => el('div', `kp-tile ${cls}`, el('b', null, String(n)), el('span', null, label));
  tiles.append(tile(q.due.length, '復習', 'kp-c-due'), tile(q.fresh.length, '新しいカード', 'kp-c-new'), tile(known, '覚えた語', 'kp-c-known'), tile(hard, '苦手', 'kp-c-hard'));
  box.append(tiles);

  const total = q.queue.length;
  const start = btn('kp-start', total ? `始める — ${total}枚` : '今日はここまで', () => startSession(), { id: 'kp-start' });
  start.disabled = !total;
  box.append(start);

  const tips = el('details', 'kp-tips');
  tips.id = 'kp-tips';
  tips.append(el('summary', null, '見て覚えるコツ（色・形・場所）'));
  for (const line of VISUAL_TIPS) tips.append(el('p', null, line));
  box.append(tips);

  if (deck.method?.length) {
    const how = el('details', 'kp-method');
    how.id = 'kp-method';
    how.append(el('summary', null, 'このデッキのしくみ'));
    for (const line of deck.method) how.append(el('p', null, line));
    box.append(how);
  }

  box.append(el('h2', 'kp-h2', 'テーマ'));
  const off = new Set(state.groupsOff);
  const list = el('div', 'kp-groups');
  for (const g of deck.groups) {
    const words = deck.words.filter((w) => w.group === g.id);
    const st = words.map((w) => wordStatus(w, state).key);
    const share = (k) => (st.filter((x) => x === k).length / words.length) * 100;
    const row = el('label', 'kp-group' + (off.has(g.id) ? ' is-off' : ''));
    row.style.setProperty('--kp-topic', topicColour(g.id));
    const box2 = el('input');
    box2.type = 'checkbox';
    box2.checked = !off.has(g.id);
    box2.dataset.group = g.id;
    box2.addEventListener('change', () => {
      const set = new Set(ctx.state.groupsOff);
      if (box2.checked) set.delete(g.id);
      else set.add(g.id);
      ctx.state = { ...ctx.state, groupsOff: [...set] };
      save();
      paint();
    });
    const bar = el('span', 'kp-bar');
    bar.append(
      Object.assign(el('i', 'kp-c-known'), { style: `width:${share('known')}%` }),
      Object.assign(el('i', 'kp-c-grow'), { style: `width:${share('growing')}%` }),
      Object.assign(el('i', 'kp-c-learn'), { style: `width:${share('learning') + share('hard')}%` }),
    );
    row.append(box2, el('span', 'kp-gname', el('b', null, g.titleJa), el('small', null, g.titleEn)), el('span', 'kp-gcount', `${st.filter((x) => x === 'known').length}/${words.length}`), bar);
    list.append(row);
  }
  box.append(list);

  const foot = el('div', 'kp-foot');
  foot.append(btn('kp-link', '語の一覧', () => go('list'), { id: 'kp-to-list' }), btn('kp-link', '設定', () => go('settings'), { id: 'kp-to-settings' }));
  box.append(foot);
  return box;
}

function go(screen) {
  ui.screen = screen;
  ui.toast = '';
  paint();
  window.scrollTo(0, 0);
}

function startSession() {
  const q = buildQueue(ctx.deck, ctx.state, new Date(), ctx.prefs.newPerDay);
  ui.queue = q.queue;
  ui.pos = 0;
  ui.done = 0;
  ui.right = 0;
  ui.undo = null;
  resetCard();
  go('study');
}

function resetCard() {
  ui.revealed = false;
  ui.picked = null;
  ui.shown = new Set();
}

/** pull learning steps that came due back into the sitting */
function refill() {
  const now = new Date();
  const ahead = new Set(ui.queue.slice(ui.pos));
  for (const { id, t } of learningSoon(ctx.deck, ctx.state, now, 0)) {
    if (!ahead.has(id) && t <= now.getTime()) ui.queue.splice(ui.pos, 0, id);
  }
}

function choicesFor(word) {
  const pool = ctx.deck.words.filter((w) => w.id !== word.id && w.pos === word.pos && w.term !== word.term);
  const alt = pool.length >= 3 ? pool : ctx.deck.words.filter((w) => w.id !== word.id);
  const seed = [...word.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const picks = [];
  for (let i = 0; picks.length < 3 && i < alt.length * 2; i++) {
    const w = alt[(seed + i * 7919) % alt.length];
    if (!picks.includes(w)) picks.push(w);
  }
  const all = [word, ...picks];
  return all.sort((a, b) => ((seed ^ a.id.length * 97) % 7) - ((seed ^ b.id.length * 97) % 7) || a.id.localeCompare(b.id));
}

function studyScreen() {
  refill();
  const box = el('section', 'kp-study');
  const id = ui.queue[ui.pos];
  if (!id) return doneScreen();
  const { card, word } = ctx.index.cards.get(id);
  const total = ui.queue.length;
  const top = el('header', 'kp-top kp-top-study');
  top.append(btn('kp-icon', '✕', () => go('home'), { 'aria-label': '終わる', id: 'kp-quit' }));
  const prog = el('div', 'kp-progress');
  prog.append(Object.assign(el('i'), { style: `width:${(ui.pos / total) * 100}%` }));
  top.append(prog, el('span', 'kp-count', `${ui.pos + 1}/${total}`));
  box.append(top);

  const stored = ctx.state.cards[id];
  const face = el('article', `kp-card kp-lv${card.lv} kp-topic kp-pos-${posKey(word.pos)}`);
  face.style.setProperty('--kp-topic', topicColour(word.group));
  face.id = 'kp-card';
  face.append(
    el(
      'div',
      'kp-chips',
      ...(card.type
        ? [el('span', `kp-chip kp-lvchip`, card.type === 'kanji' ? '字' : '語'), el('span', 'kp-chip', `${KIND_NAME[card.kind] || '例文'} · 文章${card.passage}`)]
        : [el('span', `kp-chip kp-lvchip`, `${KIND_NAME[card.kind] || '例文'} ${card.lv}/${word.cards.length}`)]),
      el('span', 'kp-chip', ctx.deck.groups.find((g) => g.id === word.group)?.titleJa || ''),
      el('span', `kp-chip ${stored ? 'kp-st-learn' : 'kp-st-new'}`, stored ? '復習' : '初めて'),
    ),
  );
  face.append(sentenceNodes(card, { blank: !ui.revealed && ctx.prefs.mode !== 'read', ruby: ui.revealed ? 'all' : ctx.prefs.furigana === 'tap' ? 'tap' : 'none' }));

  if (!ui.revealed) {
    if (ctx.prefs.hint !== 'none' && ctx.prefs.mode !== 'read' && card.type !== 'kanji') face.append(el('p', 'kp-hint', ctx.prefs.hint === 'ja' ? word.defJa : word.meaning));
    if (ctx.prefs.mode === 'choice') {
      const opts = el('div', 'kp-choices');
      for (const w of choicesFor(word)) {
        opts.append(
          btn('kp-choice', w.term, () => {
            ui.picked = w.id;
            ui.revealed = true;
            commit(w.id === word.id ? RATINGS.good : RATINGS.again, { stay: true });
          }, { 'data-choice': w.id }),
        );
      }
      face.append(opts);
    } else {
      face.append(el('p', 'kp-taphint', ctx.prefs.mode === 'read' ? '意味を思い出してからタップ' : 'タップして答えを見る'));
      face.addEventListener('click', reveal);
    }
  } else {
    face.append(answerBlock(card, word));
  }
  box.append(face);

  if (ui.revealed) {
    if (ctx.prefs.mode === 'choice') {
      const ok = ui.picked === word.id;
      box.append(el('p', `kp-verdict ${ok ? 'kp-c-known' : 'kp-c-hard'}`, ok ? '正解' : `不正解 — 正しくは ${word.term}`));
      box.append(btn('kp-next', '次へ →', next, { id: 'kp-next' }));
    } else {
      box.append(gradeBar(id));
    }
    attachSwipe(face);
  } else if (ctx.prefs.mode === 'choice') {
    box.append(
      btn('kp-reveal', 'わからない', () => {
        ui.picked = null;
        ui.revealed = true;
        commit(RATINGS.again, { stay: true });
      }, { id: 'kp-dunno' }),
    );
  } else {
    box.append(btn('kp-reveal', '答えを見る', reveal, { id: 'kp-reveal' }));
  }
  if (ui.undo) box.append(btn('kp-undo', '↶ ひとつ戻す', undo, { id: 'kp-undo' }));
  return box;
}

const THEMES = [
  ['dark', '墨', '#0a0e13', '#3fd0ff'],
  ['ai', '藍', '#121a46', '#f2c14e'],
  ['matcha', '抹茶', '#13261a', '#a6e06a'],
  ['kokuban', '黒板', '#1f2f28', '#ffe066'],
  ['washi', '和紙', '#fbf6ea', '#b23a1e'],
  ['sakura', '桜', '#fde7ec', '#d1416a'],
  ['light', '白', '#ffffff', '#0074b8'],
  ['contrast', '高', '#000000', '#ffff00'],
];
const VISUAL_TIPS = [
  '色＝品詞：答えの語の色は品詞で決まる（名詞・動詞・形容詞・副詞・表現・擬音語）。色ごと覚えると、文の中での働きも一緒に残る。',
  'カードの左端の色＝テーマ。お金は同じ色、ニュースは別の色。「あの色の札にあった言葉」と場所で思い出せる。',
  '裏の「漢字の解剖」：一字ずつ、意味と部品と画数。部品で小さな絵や物語を作ると忘れにくい（財＝貝＋才 → 貝はお金）。',
  '思い出せなかった語は、文章の場面を頭の中で一枚の絵にしてから「もう一度」。次に会うとき、その絵が手がかりになる。',
  '色テーマは気分で変えてよい。ただし一つのデッキは同じテーマで続けると、色と記憶が結びつきやすい。',
  '答えを見る前に一秒、空所の形（字数・送り仮名）と前後の言葉を見る。形と場所で記憶が引き出される。',
];
const POS = { noun: ['noun', '名詞'], verb: ['verb', '動詞'], 'い-adjective': ['adj', '形容詞'], 'な-adjective': ['adj', '形容動詞'], adverb: ['adv', '副詞'], expression: ['expr', '表現'], 'sound word': ['sound', '擬音語'], kanji: ['noun', '漢字'] };
const posKey = (pos) => (POS[pos] || ['noun'])[0];
/** each topic owns a hue, spread evenly round the colour wheel */
function topicColour(groupId) {
  const i = Math.max(0, ctx.deck.groups.findIndex((g) => g.id === groupId));
  return `hsl(${Math.round((i * 360) / Math.max(1, ctx.deck.groups.length) + 200) % 360} 70% 58%)`;
}

function kanjiAnatomy(word) {
  if (!word.kanji?.length) return null;
  const box = el('div', 'kp-kanji');
  for (const k of word.kanji) {
    box.append(el('div', 'kp-kj', el('b', null, k.c), el('span', null, k.m || ''), el('small', null, [k.parts?.length ? k.parts.join(' ') : '', k.st ? `${k.st}画` : ''].filter(Boolean).join(' · '))));
  }
  return box;
}

function answerBlock(card, word) {
  const a = el('div', 'kp-answer');
  a.lang = 'ja';
  a.append(el('div', 'kp-word', el('span', 'kp-term', word.term), el('span', 'kp-reading', word.reading), el('span', 'kp-posbadge', (POS[word.pos] || ['', ''])[1] || word.pos)));
  const anatomy = kanjiAnatomy(word);
  if (anatomy) a.append(anatomy);
  a.append(el('p', 'kp-def', word.defJa));
  // reading cards test the meaning, so it shows; cloze cards keep English behind a tap
  if (ctx.prefs.mode === 'read') a.append(el('p', 'kp-meaning', word.meaning));
  const en = el('details', 'kp-endetails');
  en.append(el('summary', null, '英語'));
  if (ctx.prefs.mode !== 'read') en.append(el('p', 'kp-meaning', word.meaning));
  if (card.en) en.append(el('p', 'kp-en', card.en));
  en.addEventListener('click', (e) => e.stopPropagation());
  a.append(en);
  if (card.src) a.append(sourceLine(card));
  if (word.tip) a.append(el('p', 'kp-tip', word.tip));
  return a;
}

function sourceLine(card) {
  const p = el('p', 'kp-src');
  const label = card.src.site || card.src.label || '';
  if (card.src.url) {
    const a = el('a', null, label);
    a.href = card.src.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', (e) => e.stopPropagation());
    p.append('出典 ', a);
  } else p.append(`出典 ${label}`);
  return p;
}

function gradeBar(id) {
  const pv = preview(fsrsApi, scheduler, ctx.state, id, new Date());
  const bar = el('div', 'kp-grades');
  const g = (name, label, cls, key) =>
    btn(`kp-grade ${cls}`, [el('b', null, label), el('small', null, fmtWait(pv[name]))], () => commit(RATINGS[name]), {
      id: `kp-grade-${name}`,
      'aria-keyshortcuts': key,
    });
  bar.append(g('again', 'もう一度', 'kp-again', '1'), g('hard', '難しい', 'kp-hard', '2'), g('good', '覚えた', 'kp-good', '3'), g('easy', '簡単', 'kp-easy', '4'));
  bar.append(el('p', 'kp-swipehint', '← もう一度　　スワイプ　　覚えた →'));
  return bar;
}

function reveal() {
  if (ui.revealed) return;
  ui.revealed = true;
  paint();
}

function commit(rating, { stay = false } = {}) {
  const id = ui.queue[ui.pos];
  if (!id) return;
  ui.undo = { state: ctx.state, queue: [...ui.queue], pos: ui.pos, done: ui.done, right: ui.right };
  ctx.state = grade(fsrsApi, scheduler, ctx.state, id, rating, new Date());
  save();
  ui.done++;
  if (rating >= RATINGS.good) ui.right++;
  if (stay) {
    paint();
    return;
  }
  next();
}

function next() {
  const id = ui.queue[ui.pos];
  ui.pos++;
  // a learning step due within the sitting comes back after a few cards
  const s = ctx.state.cards[id];
  if (s && s.state !== 2 && new Date(s.due).getTime() - Date.now() < 15 * MIN) {
    ui.queue.splice(Math.min(ui.queue.length, ui.pos + 4), 0, id);
  }
  resetCard();
  paint();
}

function undo() {
  if (!ui.undo) return;
  ctx.state = ui.undo.state;
  ui.queue = ui.undo.queue;
  ui.pos = ui.undo.pos;
  ui.done = ui.undo.done;
  ui.right = ui.undo.right;
  ui.undo = null;
  resetCard();
  ui.revealed = ctx.prefs.mode !== 'choice';
  save();
  paint();
}

function attachSwipe(face) {
  let x0 = null;
  let dx = 0;
  face.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    dx = 0;
  });
  face.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    face.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    face.dataset.swipe = dx > 40 ? 'good' : dx < -40 ? 'again' : '';
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    face.style.transform = '';
    if (Math.abs(dx) > 90) {
      if (ctx.prefs.mode === 'choice') next();
      else commit(dx > 0 ? RATINGS.good : RATINGS.again);
    } else face.dataset.swipe = '';
  };
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', end);
}

function doneScreen() {
  const box = el('section', 'kp-done');
  box.append(topBar('おつかれさま', () => go('home')));
  const pct = ui.done ? Math.round((ui.right / ui.done) * 100) : 0;
  box.append(el('div', 'kp-tiles', el('div', 'kp-tile kp-c-new', el('b', null, String(ui.done)), el('span', null, '回答')), el('div', 'kp-tile kp-c-known', el('b', null, `${pct}%`), el('span', null, '正解率'))));
  const soon = learningSoon(ctx.deck, ctx.state, new Date(), DAY)[0];
  box.append(el('p', 'kp-sub', soon ? `次の復習は ${fmtWait(Math.max(0, soon.t - Date.now()))}後。` : '今日の分は終わり。また明日。'));
  box.append(btn('kp-start', 'デッキに戻る', () => go('home'), { id: 'kp-home' }));
  return box;
}

function listScreen() {
  const box = el('section', 'kp-list');
  box.append(topBar('語の一覧', () => go('home')));
  const input = el('input', 'kp-search');
  input.type = 'search';
  input.id = 'kp-search';
  input.placeholder = '検索 — 漢字・かな・英語';
  input.value = ui.q;
  box.append(input);
  const rows = el('div', 'kp-rows');
  box.append(rows);
  const draw = () => {
    rows.replaceChildren();
    const k = ui.q.trim().toLowerCase();
    for (const w of ctx.deck.words) {
      if (k && !`${w.term}${w.reading}${w.meaning}${w.defJa}`.toLowerCase().includes(k)) continue;
      const st = wordStatus(w, ctx.state);
      const [label, cls] = STATUS[st.key];
      const row = btn('kp-row', [
        el('span', 'kp-rw', el('b', null, w.term), el('small', null, w.reading)),
        el('span', 'kp-rm', w.meaning),
        el('span', 'kp-dots', w.cards.map((c) => el('i', ctx.state.cards[c.id]?.state === 2 ? 'on' : ctx.state.cards[c.id] ? 'half' : ''))),
        el('span', `kp-chip ${cls}`, label),
      ], () => {
        ui.open = ui.open === w.id ? null : w.id;
        draw();
      });
      rows.append(row);
      if (ui.open === w.id) {
        const det = el('div', 'kp-detail');
        det.append(el('p', 'kp-def', w.defJa));
        for (const c of w.cards) det.append(el('div', 'kp-ex', sentenceNodes(c, { blank: false, ruby: 'all' }), ...(c.en ? [el('p', 'kp-en', c.en)] : [])));
        if (w.tip) det.append(el('p', 'kp-tip', w.tip));
        rows.append(det);
      }
    }
    if (!rows.childNodes.length) rows.append(el('p', 'kp-sub', '該当する語はありません。'));
  };
  input.addEventListener('input', () => {
    ui.q = input.value;
    draw();
  });
  draw();
  return box;
}

function settingsScreen() {
  const box = el('section', 'kp-settings');
  box.append(topBar('設定', () => go('home')));
  const seg = (title, key, options) => {
    const wrap = el('div', 'kp-field', el('h2', 'kp-h2', title));
    const row = el('div', 'kp-seg');
    for (const [value, label] of options) {
      const b = btn(ctx.prefs[key] === value ? 'is-on' : '', label, () => {
        ctx.prefs = { ...ctx.prefs, [key]: value };
        savePrefs();
        paint();
      }, { 'data-pref': `${key}:${value}` });
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  };
  box.append(seg('一日の新しい文', 'newPerDay', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30']]));
  box.append(seg('答え方', 'mode', [['read', '読んで思い出す'], ['self', '穴埋め'], ['choice', '4択']]));
  box.append(seg('ヒント（穴埋め・4択）', 'hint', [['en', '英語'], ['ja', '日本語'], ['none', 'なし']]));
  box.append(seg('ふりがな（問題）', 'furigana', [['tap', 'タップで表示'], ['none', 'なし']]));
  const themes = el('div', 'kp-field', el('h2', 'kp-h2', '色（テーマ）'));
  const sw = el('div', 'kp-swatches');
  for (const [value, label, bg, ink] of THEMES) {
    const b = btn(`kp-swatch${ctx.prefs.look === value ? ' is-on' : ''}`, label, () => {
      ctx.prefs = { ...ctx.prefs, look: value };
      savePrefs();
      paint();
    }, { 'data-pref': `look:${value}`, 'aria-label': label, style: `background:${bg};color:${ink}` });
    sw.append(b);
  }
  themes.append(sw);
  box.append(themes);

  const ta = el('textarea', 'kp-backup');
  ta.id = 'kp-backup';
  ta.spellcheck = false;
  const msg = el('p', 'kp-sub');
  box.append(
    el('div', 'kp-field', el('h2', 'kp-h2', 'バックアップ'), el('p', 'kp-sub', '記録はこの端末だけに保存されます。コピーして保管し、別の端末で貼り付けて復元できます。'), ta,
      el('div', 'kp-seg',
        btn('', 'コピー', () => {
          ta.value = JSON.stringify(ctx.state);
          ta.select();
          navigator.clipboard?.writeText(ta.value).then(() => (msg.textContent = 'コピーしました。'), () => (msg.textContent = '選択しました。手動でコピーしてください。'));
        }),
        btn('', '復元', () => {
          try {
            const raw = JSON.parse(ta.value);
            const next = normalizeState(raw, ctx.deck);
            if (!Object.keys(next.cards).length && Object.keys(raw?.cards || {}).length) throw new Error('mismatch');
            ctx.state = next;
            save();
            msg.textContent = '復元しました。';
          } catch {
            msg.textContent = 'このデッキのバックアップではありません。';
          }
        }),
        btn('kp-danger', '記録を消す', (e) => {
          if (e.currentTarget.dataset.arm) {
            ctx.state = emptyState(ctx.deck.id);
            save();
            go('home');
          } else {
            e.currentTarget.dataset.arm = '1';
            e.currentTarget.textContent = 'もう一度押すと消えます';
          }
        }),
      ), msg),
  );
  return box;
}

function onKey(e) {
  if (!ctx?.root?.isConnected || ui.screen !== 'study' || e.target.closest?.('input, textarea')) return;
  if (!ui.revealed && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    if (ctx.prefs.mode !== 'choice') reveal();
  } else if (ui.revealed && ctx.prefs.mode !== 'choice' && ['1', '2', '3', '4'].includes(e.key)) {
    e.preventDefault();
    commit(Number(e.key));
  } else if (ui.revealed && ctx.prefs.mode === 'choice' && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    next();
  } else if (e.key === 'u' && ui.undo) undo();
}
let keyBound = false;

/** the host's entry point */
function ensureCss() {
  if (document.querySelector('style[data-kp], link[data-kp]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./player.css', import.meta.url).href;
  link.dataset.kp = '1';
  document.head.append(link);
}

export async function render(main, { deckId, storage = window.localStorage, onLeave } = {}) {
  ensureCss();
  const root = el('div', 'kp');
  root.append(el('p', 'kp-sub', '読み込み中…'));
  main.append(root);
  const { deck, index } = await loadDeck(deckId);
  const sameDeck = ctx?.deck?.id === deck.id;
  ctx = {
    root,
    deck,
    index,
    storage,
    onLeave,
    state: normalizeState(readJson(storage, stateKey(deck.id)), deck),
    prefs: prefsFor(storage, deck),
  };
  if (!sameDeck) {
    ui.screen = 'home';
    ui.queue = [];
  }
  if (!keyBound) {
    document.addEventListener('keydown', onKey);
    keyBound = true;
  }
  paint();
}

/** due count for a deck chooser, without rendering anything */
export async function summary(deckId, storage = window.localStorage) {
  const { deck } = await loadDeck(deckId);
  const state = normalizeState(readJson(storage, stateKey(deck.id)), deck);
  const prefs = prefsFor(storage, deck);
  const q = buildQueue(deck, state, new Date(), prefs.newPerDay);
  return { due: q.due.length, fresh: q.fresh.length, words: deck.words.length, titleJa: deck.titleJa, titleEn: deck.titleEn };
}
