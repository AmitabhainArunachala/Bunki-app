/**
 * 集中道場 deck player. One screen at a time: deck → study → done, plus the
 * word list and settings. The schedule is this deck's own ledger in
 * localStorage (`bunki-cloze:<deck id>`), never the corridor's word queue.
 *
 *   render(main, { deckId, storage, onLeave, openEntry, host })
 *
 * openEntry({ t: 'grammar', id }) is optional: a host that can show a grammar entry passes it,
 * and the back's 文法 links call it; without it they are plain labels.
 * host is optional too: the host lexicon adapter (decks/player/host.js, built by the corridor)
 * { name, lookup(token), open(entry), isTaken(entry), take(entry, listId), lists() }. The
 * corridor passes one; the standalone study pages have none (null), and nothing here pretends
 * to a dictionary it does not have. With a host and no openEntry, 文法 links open through it.
 */
import {
  RATINGS,
  buildQueue,
  cardTokens,
  createScheduler,
  grade,
  indexDeck,
  inspectState,
  isLeech,
  learningSoon,
  normalizeState,
  preview,
  repairCard,
  restoreSuspended,
  skipFor,
  suspendCard,
  swapCard,
  swapTarget,
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

/* the deck's tokens side file (deck.tokens, build.py with_tokens), fetched once, on demand:
 * only a host lexicon has anything to do with them, so nothing loads them at start */
const tokenFiles = new Map();
function loadTokens(deckId, deck) {
  if (typeof deck?.tokens !== 'string') return Promise.resolve(null);
  if (!tokenFiles.has(deckId)) {
    const packed = window.__CORRIDOR_BUNDLE__?.[`decks/${deckId}/tokens`];
    tokenFiles.set(
      deckId,
      packed
        ? Promise.resolve(packed)
        : fetchJson(new URL(`../${deckId}/${deck.tokens}`, import.meta.url)).catch(() => {
            tokenFiles.delete(deckId); // a failed fetch is retried on the next ask
            return null;
          }),
    );
  }
  return tokenFiles.get(deckId);
}

/** one card's tokens [{ s, b, r, k, ref, at, p? }] (engine cardTokens), or null when the deck has none */
export async function tokensFor(deckId, cardId) {
  const { deck, index } = await loadDeck(deckId);
  const hit = index.cards.get(cardId);
  if (!hit) return null;
  if (Array.isArray(hit.card.tokens)) return cardTokens(hit.card);
  return cardTokens(hit.card, await loadTokens(deckId, deck));
}

const HOST_METHODS = ['lookup', 'open', 'isTaken', 'take', 'lists'];
/** the host adapter as given, or null when it is missing or lacks a method */
function hostOf(host) {
  return host && HOST_METHODS.every((m) => typeof host[m] === 'function') ? host : null;
}

/** the host lexicon adapter of the mounted player, or null (standalone, or no host passed) */
export function hostAdapter() {
  return ctx?.host || null;
}

/* ------------------------------------------------------------- state */
/* mode: 'read' (読んで思い出す, the contract's default), 'self' (穴埋め, the MCD blank preset) or
 * 'choice' (4択); gloss: the English fold on the back starts closed ('tap') or open ('show', the
 * per-deck "always show" switch); zoom: 'auto' (焦点 once a card has been seen, 全文 on a new one)
 * or the learner's 'full' | 'focus'; ruleSeen: the 「もう一度」 rule under the grade bar was shown
 * once; sittings: how many sittings this deck has started (the tap and swipe hints retire after
 * HINT_SITTINGS). A stored `hint` (the front hint, retired by STANDARD A37) is ignored. */
const PREFS_DEFAULT = { newPerDay: 15, mode: 'read', look: 'dark', gloss: 'tap', zoom: 'auto', ruleSeen: false, sittings: 0 };
/** 「タップして答えを見る」 and the swipe hint show for this many sittings per deck, then retire */
const HINT_SITTINGS = 3;
const ui = { screen: 'home', queue: [], pos: 0, revealed: false, seen: false, picked: null, undo: null, done: 0, right: 0, q: '', open: null, from: null, toast: '', rail: 0 };
let ctx = null; // { root, deck, index, storage, onLeave, openEntry, host, state, prefs, notice }

const stateKey = (id) => `bunki-cloze:${id}`;
/** the ledger as it was just before a restore replaced it */
const beforeRestoreKey = (id) => `bunki-cloze:${id}:before-restore`;
/** a stored ledger this player could not read, set aside before anything is saved over it */
const quarantineKey = (id) => `bunki-cloze:${id}:quarantine`;
const prefsKey = (deckId) => `bunki-cloze:prefs:v3:${deckId}`; // one set per deck
function prefsFor(storage, deck) {
  return { ...PREFS_DEFAULT, ...(deck.defaults || {}), ...(readJson(storage, prefsKey(deck.id)) || {}) };
}
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
function writeRaw(storage, key, text) {
  try {
    storage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}
const QUARANTINED = '前の記録を読み取れなかったので、別に保管しました。';
/**
 * The stored ledger for a deck. When the stored text is there but none of its
 * card records can be read, the text is copied to the quarantine key first, so
 * the next save cannot erase it; notice then says so.
 */
function loadState(storage, deck) {
  let text = null;
  try {
    text = storage.getItem(stateKey(deck.id));
  } catch {
    text = null;
  }
  let raw = null;
  let unreadable = false;
  if (text != null) {
    try {
      raw = JSON.parse(text);
    } catch {
      unreadable = true;
    }
  }
  const state = normalizeState(raw, deck);
  const storedCards = raw && typeof raw === 'object' && raw.cards && typeof raw.cards === 'object' ? Object.keys(raw.cards).length : 0;
  if (text != null && !Object.keys(state.cards).length && (unreadable || storedCards)) {
    const kept = writeRaw(storage, quarantineKey(deck.id), text);
    return { state, notice: kept ? QUARANTINED : '' };
  }
  return { state, notice: '' };
}
/** write a candidate ledger; the caller adopts it only when this returns true */
function save(state) {
  return writeJson(ctx.storage, stateKey(ctx.deck.id), state);
}
/** adopt new settings only once they are stored */
function savePrefs(prefs) {
  if (!writeJson(ctx.storage, prefsKey(ctx.deck.id), prefs)) return saveFailed();
  ctx.prefs = prefs;
  ui.toast = '';
  paint();
}
const SAVE_FAILED = '保存できませんでした。設定のバックアップから記録をコピーして保管してください。';
/** nothing changed: say so and keep the screen as it is */
function saveFailed() {
  ui.toast = SAVE_FAILED;
  paint();
  return false;
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
  known: ['定着', 'kp-st-known'],
  hard: ['苦手', 'kp-st-hard'],
};

/**
 * Where each sentence of a passage ends: after 。！？ outside brackets, with the closing
 * marks that follow; the last sentence runs to the end. build.py (sentence_ends) cuts the
 * passage the same way to pick the English of the target sentence.
 */
const JA_OPEN = '「『（(【〈《';
const JA_CLOSE = '」』）)】〉》';
const JA_END = '。！？!?';
function sentenceEnds(ja) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < ja.length; ) {
    const ch = ja[i];
    if (JA_OPEN.includes(ch)) depth++;
    else if (JA_CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    else if (JA_END.includes(ch) && depth === 0) {
      let j = i + 1;
      while (j < ja.length && (JA_END.includes(ja[j]) || JA_CLOSE.includes(ja[j]))) j++;
      out.push(j);
      i = j;
      continue;
    }
    i++;
  }
  const last = out.at(-1) ?? 0;
  if (last < ja.length) {
    if (ja.slice(last).trim() || !out.length) out.push(ja.length);
    else out[out.length - 1] = ja.length;
  }
  return out;
}

/** sentence → nodes. front: the card's front (CARD_CONTRACT_V2 §2): no readings, no English,
 * nothing to tap; blank: hide the target; ruby: 'all' (the back: a reading over every kanji) |
 * 'none' (what the front forces); split: wrap each sentence of a passage in .kp-s, the one
 * holding the target marked data-focus, so the back can dim the others (zoom); clamp (the back
 * only): the sentences before and after the target each in a .kp-ctx group that 焦点 folds to
 * two dimmed lines with a ⋯ to open it (STANDARD A38) */
export function sentenceNodes(card, { front = false, blank = false, ruby = front ? 'none' : 'all', split = false, clamp = false }) {
  if (front) {
    ruby = 'none';
    clamp = false;
  }
  const out = el('p', 'kp-sentence');
  out.lang = 'ja';
  const ends = split ? sentenceEnds(card.ja) : [card.ja.length];
  let host = out;
  let at = 0; // offset in card.ja of the next character
  let k = 0; // the sentence being filled
  const open = () => {
    if (!split) return;
    host = el('span', 'kp-s');
    out.append(host);
  };
  open();
  const put = (node, isTarget, len) => {
    if (split && isTarget === 1) host.dataset.focus = '1';
    host.append(node);
    at += len;
    while (split && k < ends.length - 1 && at >= ends[k]) {
      k++;
      open();
    }
  };
  card.ruby.forEach(([text, reading, isTarget]) => {
    const len = text.length;
    if (isTarget === 1 && blank) return put(el('span', 'kp-blank', card.hint ? `〔${card.hint}〕` : '　'.repeat(Math.min(6, Math.max(2, [...text].length)))), 1, len);
    // the word again later in the passage: blanked too, without the hint
    if (isTarget === 3 && blank) return put(el('span', 'kp-blank', '　'.repeat(Math.min(6, Math.max(2, [...text].length)))), 3, len);
    const hasRuby = reading && KANJI.test(text) && ruby === 'all';
    if (isTarget) {
      const wrap = el('span', 'kp-target', hasRuby ? el('ruby', null, text, el('rt', null, reading)) : text);
      return put(wrap, isTarget, len);
    }
    if (hasRuby) return put(el('ruby', null, text, el('rt', null, reading)), 0, len);
    // plain text may hold a sentence end: cut it there so each sentence keeps its own words
    let rest = text;
    while (split && rest && k < ends.length - 1 && at + rest.length > ends[k]) {
      const cut = ends[k] - at;
      put(document.createTextNode(rest.slice(0, cut)), 0, cut);
      rest = rest.slice(cut);
    }
    if (rest) put(document.createTextNode(rest), 0, rest.length);
  });
  if (clamp && split) clampContext(out);
  return out;
}

/** 焦点 on a long passage: the sentences before the target and those after it each become one
 * group. 全文 lays the groups out inline (nothing changes); 焦点 folds each to two dimmed lines
 * (the before group shows its last two, the after group its first two) and fitClamps adds a ⋯
 * that opens a group when it is longer than that */
function clampContext(out) {
  const parts = [...out.children];
  const at = parts.findIndex((n) => n.dataset.focus);
  if (at < 0) return;
  const group = (side, nodes) => {
    if (!nodes.length) return null;
    const box = el('span', 'kp-ctx', el('span', 'kp-ctx-in', el('span', 'kp-ctx-flow', nodes)));
    box.dataset.side = side;
    const label = side === 'before' ? '前の文をすべて表示' : '後の文をすべて表示';
    const more = btn('kp-more', '⋯', (e) => {
      e.stopPropagation();
      const open = box.dataset.open !== '1';
      box.dataset.open = open ? '1' : '';
      more.setAttribute('aria-expanded', String(open));
    }, { 'aria-expanded': 'false', 'aria-label': label, title: label });
    box.append(more);
    return box;
  };
  const before = group('before', parts.slice(0, at));
  const after = group('after', parts.slice(at + 1));
  if (before) out.prepend(before);
  if (after) out.append(after);
}
/** mark each context group that 焦点 clips (its text runs past two lines), so only those show ⋯ */
function fitClamps(root) {
  for (const box of root.querySelectorAll('.kp-ctx')) {
    const inner = box.querySelector('.kp-ctx-in');
    const flow = box.querySelector('.kp-ctx-flow');
    const clipped = getComputedStyle(inner).display !== 'contents' && flow.offsetHeight > inner.clientHeight + 1;
    box.dataset.clip = clipped ? '1' : '';
  }
}

/* ------------------------------------------------------------- screens */
function paint() {
  if (!ctx?.root?.isConnected) return;
  const root = ctx.root;
  root.replaceChildren();
  root.dataset.look = ctx.prefs.look;
  const screens = { home: homeScreen, study: studyScreen, list: listScreen, settings: settingsScreen };
  if (ui.toast) {
    const undoable = UNDOABLE.includes(ui.toast) && ui.undo && ui.screen === 'study';
    const toast = el('div', `kp-toast${undoable ? ' is-info' : ''}`, el('span', null, ui.toast));
    toast.setAttribute('role', undoable ? 'status' : 'alert');
    if (ui.toast === SAVE_FAILED && ui.screen !== 'settings') toast.append(btn('kp-toast-btn', 'バックアップへ', () => go('settings'), { id: 'kp-to-backup' }));
    // a delete or a ladder step is reversible for the rest of the sitting (CARD_CONTRACT_V2 §4)
    if (undoable) toast.append(btn('kp-toast-btn', '元に戻す', undo, { id: 'kp-toast-undo' }));
    root.append(toast);
  }
  root.append((screens[ui.screen] || homeScreen)());
  fitBar();
  fitClamps(root);
}
/** on a phone the grade bar is fixed to the bottom of the screen: keep room for it under the card */
function fitBar() {
  const root = ctx.root;
  const bar = root.querySelector('.kp-grades');
  if (bar && getComputedStyle(bar).position === 'fixed') root.style.setProperty('--kp-bar-h', `${bar.offsetHeight + 16}px`);
}
/** store a pref without repainting, so folds the learner opened stay open; false when the
 * storage refused it (then the failure toast repaints as usual) */
function savePrefQuiet(patch) {
  const prefs = { ...ctx.prefs, ...patch };
  if (!writeJson(ctx.storage, prefsKey(ctx.deck.id), prefs)) return saveFailed();
  ctx.prefs = prefs;
  return true;
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
  const q = buildQueue(deck, state, now, prefs.newPerDay, { skip: skipFor(prefs.mode) });
  const statuses = deck.words.map((w) => wordStatus(w, state));
  const known = statuses.filter((s) => s.key === 'known').length;
  const hard = statuses.filter((s) => s.key === 'hard').length;
  const box = el('section', 'kp-home');
  box.append(topBar(deck.titleJa, ctx.onLeave ? () => ctx.onLeave() : null));
  box.append(el('p', 'kp-sub', `${deck.words.length}語 · ${deck.words.reduce((n, w) => n + w.cards.length, 0)}枚 · ${deck.titleEn}`));
  if (ctx.notice) box.append(el('p', 'kp-sub kp-notice', ctx.notice));

  const tiles = el('div', 'kp-tiles');
  const tile = (n, label, cls) => el('div', `kp-tile ${cls}`, el('b', null, String(n)), el('span', null, label));
  tiles.append(tile(q.due.length, '復習', 'kp-c-due'), tile(q.fresh.length, '新しいカード', 'kp-c-new'), tile(known, '定着した語', 'kp-c-known'), tile(hard, '苦手', 'kp-c-hard'));
  box.append(tiles);

  const total = q.queue.length;
  const start = btn('kp-start', total ? `始める — ${total}枚` : '今日はここまで', () => startSession(), { id: 'kp-start' });
  start.disabled = !total;
  box.append(start);

  box.append(el('h2', 'kp-h2', 'テーマ'));
  const off = new Set(state.groupsOff);
  const list = el('div', 'kp-groups');
  for (const g of deck.groups) {
    const words = deck.words.filter((w) => w.group === g.id);
    const st = words.map((w) => wordStatus(w, state).key);
    const share = (k) => (st.filter((x) => x === k).length / words.length) * 100;
    const row = el('label', 'kp-group' + (off.has(g.id) ? ' is-off' : ''));
    const box2 = el('input');
    box2.type = 'checkbox';
    box2.checked = !off.has(g.id);
    box2.dataset.group = g.id;
    box2.addEventListener('change', () => {
      const set = new Set(ctx.state.groupsOff);
      if (box2.checked) set.delete(g.id);
      else set.add(g.id);
      const nextState = { ...ctx.state, groupsOff: [...set] };
      if (!save(nextState)) return saveFailed();
      ctx.state = nextState;
      ui.toast = '';
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
  const q = buildQueue(ctx.deck, ctx.state, new Date(), ctx.prefs.newPerDay, { skip: skipFor(ctx.prefs.mode) });
  // one more sitting of this deck: the tap and swipe hints count these (HINT_SITTINGS). Not stored
  // (storage full) only means they show a little longer.
  const prefs = { ...ctx.prefs, sittings: (Number(ctx.prefs.sittings) || 0) + 1 };
  writeJson(ctx.storage, prefsKey(ctx.deck.id), prefs);
  ctx.prefs = prefs;
  ui.queue = q.queue;
  ui.pos = 0;
  ui.done = 0;
  ui.right = 0;
  ui.undo = null;
  ui.rail = 0;
  refill();
  resetCard();
  go('study');
}

function resetCard() {
  ui.revealed = false;
  ui.seen = false;
  ui.picked = null;
}

/** pull learning steps that came due back into the sitting, right after the
 * card under the cursor (never in its place: the card on screen never changes) */
function refill() {
  const now = new Date();
  const ahead = new Set(ui.queue.slice(ui.pos));
  for (const { id, t } of learningSoon(ctx.deck, ctx.state, now, 0, { skip: skipFor(ctx.prefs.mode) })) {
    if (!ahead.has(id) && t <= now.getTime()) ui.queue.splice(ui.pos + 1, 0, id);
  }
}

/** the answer mode for the card on screen. 4択 offers whole words, and the rest
 * of the host word on a 字 card would give the answer away, so a 字 card is
 * always answered as 穴埋め (読んで思い出す leaves 字 cards out of its queue; one
 * that reaches the screen anyway is asked as 穴埋め too) */
function cardMode() {
  const id = ui.queue[ui.pos];
  const card = id ? ctx.index.cards.get(id)?.card : null;
  return ctx.prefs.mode !== 'self' && card?.type === 'kanji' ? 'self' : ctx.prefs.mode;
}
/** the first sittings of a deck explain the gestures; after HINT_SITTINGS they retire */
const hintsOn = () => (Number(ctx.prefs.sittings) || 0) <= HINT_SITTINGS;

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
  const box = el('section', 'kp-study');
  const id = ui.queue[ui.pos];
  if (!id) return doneScreen();
  const { card, word } = ctx.index.cards.get(id);
  const mode = cardMode();
  const total = ui.queue.length;
  const top = el('header', 'kp-top kp-top-study');
  top.append(btn('kp-icon', '✕', () => go('home'), { 'aria-label': '終わる', id: 'kp-quit' }));
  const prog = el('div', 'kp-progress');
  prog.append(rail(ui.pos / total));
  top.append(prog, el('span', 'kp-count', `${ui.pos + 1}/${total}`), deleteButton());
  box.append(top);

  const stored = ctx.state.cards[id];
  // a passage card (MCD) is several sentences; only those get the 全文／焦点 zoom
  const passage = !!card.type;
  const [kind, kindLabel] = itemKind(card);
  // one hue axis per surface: the edge and the first chip say the item kind, the target its part of speech
  const face = el('article', `kp-card kp-kind-${kind} kp-pos-${posKey(word.pos)}`);
  face.id = 'kp-card';
  face.dataset.card = id;
  face.dataset.kind = kind;
  const source = KIND_NAME[card.kind] || '例文';
  const chips = el(
    'div',
    'kp-chips',
    el('span', 'kp-chip kp-kindchip', kindLabel),
    el('span', 'kp-chip', source),
    el('span', 'kp-chip', ctx.deck.groups.find((g) => g.id === word.group)?.titleJa || ''),
    word.level ? levelChip(word.level) : null,
    el('span', `kp-chip ${stored ? 'kp-st-learn' : 'kp-st-new'}`, stored ? '復習' : '初めて'),
  );
  face.append(chips);
  if (ui.revealed && passage) {
    const zoom = zoomFor();
    face.dataset.zoom = zoom;
    chips.append(zoomToggle(zoom));
  }
  // the front: no readings, no English, nothing to tap in the passage, no hint (CARD_CONTRACT_V2 §2)
  face.append(ui.revealed ? sentenceNodes(card, { split: passage, clamp: passage }) : sentenceNodes(card, { front: true, blank: mode !== 'read', split: passage }));
  const repaired = ctx.state.repairs?.[id]?.hint;
  if (repaired) face.dataset.repaired = 'hint';

  if (!ui.revealed) {
    // a leech repaired with a hint (§4 ladder step two): this card only, marked as repaired; the
    // only hint a front ever shows
    if (repaired) face.append(el('p', 'kp-rhint', el('span', 'kp-rhint-label', 'ヒント'), repaired));
    if (mode === 'choice') {
      const opts = el('div', 'kp-choices');
      for (const w of choicesFor(word)) {
        opts.append(
          btn('kp-choice', w.term, () => {
            ui.picked = w.id;
            ui.seen = !!ctx.state.cards[id];
            ui.revealed = true;
            commit(w.id === word.id ? RATINGS.good : RATINGS.again, { stay: true });
          }, { 'data-choice': w.id }),
        );
      }
      face.append(opts);
    } else {
      if (hintsOn()) face.append(el('p', 'kp-taphint', mode === 'read' ? '意味を思い出してからタップ' : 'タップして答えを見る'));
      face.addEventListener('click', reveal);
    }
  } else {
    face.append(...backParts(card, word).nodes);
  }
  box.append(face);

  if (ui.revealed) {
    if (mode === 'choice') {
      const ok = ui.picked === word.id;
      box.append(el('p', `kp-verdict ${ok ? 'kp-c-known' : 'kp-c-hard'}`, ok ? '正解' : `不正解 — 正しくは ${word.term}`));
      box.append(btn('kp-next', '次へ →', () => next(), { id: 'kp-next' }));
    } else {
      box.append(gradeBar(id));
      box.classList.add('has-bar');
    }
    attachSwipe(face);
  } else if (mode === 'choice') {
    box.append(
      btn('kp-reveal', 'わからない', () => {
        ui.picked = null;
        ui.seen = !!ctx.state.cards[id];
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
  ['washi', '和紙', '#fbf6ea', '#93301a'],
  ['sakura', '桜', '#fde7ec', '#a1264a'],
  ['light', '白', '#ffffff', '#005f98'],
  ['contrast', '高', '#000000', '#ffff00'],
];
const POS = { noun: ['noun', '名詞'], verb: ['verb', '動詞'], 'い-adjective': ['adj', '形容詞'], 'な-adjective': ['adj', '形容動詞'], adverb: ['adv', '副詞'], expression: ['expr', '表現'], 'sound word': ['sound', '擬音語'], kanji: ['noun', '漢字'] };
const posKey = (pos) => (POS[pos] || ['noun'])[0];
/** item kind → [css key, chip label]: 語 a whole word, 字 one kanji of it, 文法 a grammar point */
function itemKind(card) {
  if (card.type === 'kanji') return ['ji', '字'];
  if (card.type === 'grammar') return ['bun', '文法'];
  return ['go', '語'];
}
/** the word's level from a public JLPT-style list (build.py, wbig.json): text only, never a hue */
function levelChip(level) {
  const chip = el('span', 'kp-chip kp-levelchip', level);
  const note = `${level}相当（公開リストによる目安）`;
  chip.title = note;
  chip.setAttribute('aria-label', note);
  return chip;
}
/** the progress rail: drawn at where it stood, then ticked to frac on the compositor */
function rail(frac) {
  const bar = el('i');
  const from = motionOk() ? ui.rail : frac;
  bar.style.setProperty('--kp-frac', String(from));
  ui.rail = frac;
  if (from !== frac) {
    queueMicrotask(() => {
      if (!bar.isConnected) return;
      bar.getBoundingClientRect(); // the old width is drawn first, so the change transitions
      bar.style.setProperty('--kp-frac', String(frac));
    });
  }
  return bar;
}
/** prefers-reduced-motion: nothing moves (aesthetics.md §5, S37) */
function motionOk() {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** 全文 (every sentence bright) or 焦点 (the sentences around the target dimmed). Unless the
 * learner chose one for this deck, a card seen before opens in 焦点 and a new card in 全文 */
function zoomFor() {
  if (ctx.prefs.zoom === 'full' || ctx.prefs.zoom === 'focus') return ctx.prefs.zoom;
  return ui.seen ? 'focus' : 'full';
}
function zoomToggle(zoom) {
  const wrap = el('span', 'kp-zoom');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', '文章の表示');
  for (const [value, label] of [['full', '全文'], ['focus', '焦点']]) {
    const b = btn('kp-zoom-btn', label, (e) => {
      e.stopPropagation();
      if (zoomFor() === value || !savePrefQuiet({ zoom: value })) return;
      // in place: a repaint would close the folds the learner opened
      const face = wrap.closest('.kp-card');
      if (face) face.dataset.zoom = value;
      for (const x of wrap.querySelectorAll('.kp-zoom-btn')) x.setAttribute('aria-pressed', String(x === b));
      if (face) fitClamps(face);
    }, { id: `kp-zoom-${value}`, 'aria-pressed': String(zoom === value) });
    wrap.append(b);
  }
  return wrap;
}

function kanjiAnatomy(word) {
  if (!word.kanji?.length) return null;
  const box = el('div', 'kp-kanji');
  for (const k of word.kanji) {
    box.append(el('div', 'kp-kj', el('b', null, k.c), el('span', null, k.m || ''), el('small', null, [k.parts?.length ? k.parts.join(' ') : '', k.st ? `${k.st}画` : ''].filter(Boolean).join(' · '))));
  }
  return box;
}

/** one tier-two fold: a native disclosure, closed unless open is set */
function fold(cls, title, open, ...kids) {
  const d = el('details', `kp-fold ${cls}`, el('summary', null, title), ...kids);
  d.open = !!open;
  d.addEventListener('click', (e) => e.stopPropagation());
  return d;
}

const EN_NONE = 'この文だけの英訳は未対応です（全文の英訳と文の区切りが合いません）';
const SEM_REL = { syn: '類語', ant: '対義語', fam: '同じ字', reg: '言い換え', col: 'よく一緒に', thm: '関連' };

/**
 * The back (CARD_CONTRACT_V2 §3). Tier one, read on every pass, no English: the word with
 * its reading and part of speech (pitch only when the deck has it), the passage above with
 * a reading over every kanji, the Japanese definition, a Japanese usage note when there is
 * one. Tier two, one tap each, in this order: 英語 (the gloss; open when 設定 says always),
 * 英訳 of the target sentence only, 漢字の形と意味 (open on a 字 card), 類語 (only with
 * entries, and only once the card is in review), the word's other passages (titles only),
 * then 出典: the author or 書き下ろし, the site, the licence (§3.10).
 */
function answerBlock(card, word) {
  const a = el('div', 'kp-answer');
  a.lang = 'ja';
  const pos = (POS[word.pos] || ['', ''])[1] || word.pos;
  a.append(el('div', 'kp-word', el('span', 'kp-term', word.term), el('span', 'kp-reading', word.reading), word.pitch != null ? el('span', 'kp-pitch', String(word.pitch)) : null, el('span', 'kp-posbadge', pos)));
  a.append(el('p', 'kp-def', word.defJa));
  // a usage note in Japanese stays in tier one; the deck's English notes go behind 英語
  const jaNote = word.tip && !/[A-Za-z]/.test(word.tip);
  if (jaNote) a.append(el('p', 'kp-note', word.tip));
  // a leech's repair ladder (§4) sits after tier one and before the folds, so the word, its
  // reading and the definition stay pinned under the passage on every card (learning-design L1)
  if (isLeech(ctx.state, card.id)) a.append(leechLadder(card, word));

  const folds = el('div', 'kp-folds');
  // English text carries lang='en'; the summaries and labels stay Japanese for screen readers
  const english = (tag, cls, text) => {
    const n = el(tag, cls, text);
    n.lang = 'en';
    return n;
  };
  const gloss = fold('kp-f-gloss', '英語', ctx.prefs.gloss === 'show', english('p', 'kp-gloss', word.meaning));
  if (word.tip && !jaNote) gloss.append(el('p', 'kp-tip', el('span', 'kp-tip-label', '注 '), english('span', null, word.tip)));
  folds.append(gloss);
  // a passage translates only the sentence holding the target (enTarget, from build.py), never
  // the whole passage; when its sentences could not be matched the fold says so, so the slot
  // stays in the same place on every card
  const en = card.type ? card.enTarget : card.en;
  if (en || card.type) folds.append(fold('kp-f-en', '英訳', false, en ? english('p', 'kp-en', en) : el('p', 'kp-en kp-en-none', EN_NONE)));
  const anatomy = kanjiAnatomy(word);
  if (anatomy) folds.append(fold('kp-f-kanji', '漢字の形と意味', card.type === 'kanji', anatomy, kanjiFamily(word)));
  // see-also and grammar from the deck, as one link line after the kanji fold; no data, no line
  const see = seeAlsoLine(card, word);
  if (see) folds.append(see);
  // synonyms interfere with a word still being learned (R13): only on a card in review state
  if (word.sem?.length && ctx.state.cards[card.id]?.state === 2) {
    const list = el('ul', 'kp-sem');
    for (const e of word.sem) list.append(el('li', null, el('b', null, e.w), el('span', 'kp-sem-rel', SEM_REL[e.rel] || e.rel), e.note ? el('small', null, e.note) : null));
    folds.append(fold('kp-f-sem', '類語', false, list));
  }
  const others = otherPassages(card, word);
  if (others.length) {
    const list = el('ul', 'kp-others');
    for (const c of others) list.append(el('li', null, c.type ? `文章${c.passage}` : `例文${c.lv}`, el('span', null, ` · ${KIND_NAME[c.kind] || '例文'}${c.src?.site ? ` · ${c.src.site}` : ''}`)));
    // a passage deck lists 文章, the one-sentence deck 文
    folds.append(fold('kp-f-others', `${card.type ? 'この語の他の文章' : 'この語の他の文'}（${others.length}）`, false, list));
  }
  if (card.src) folds.append(sourceFold(card));
  a.append(folds);
  return a;
}

/* ------------------------------------------------ kanji family, see-also (CARD_CONTRACT_V2 §3.7) */
/** per deck: glyph → words that contain it; reading of one kanji → [{ word, c }] (deck.json
 * kanji[].r is the kanji's reading inside that word, from build.py's alignment) */
const families = new WeakMap();
function familyIndex(deck) {
  if (families.has(deck)) return families.get(deck);
  const byGlyph = new Map();
  const byReading = new Map();
  for (const w of deck.words) {
    for (const k of w.kanji || []) {
      if (!byGlyph.has(k.c)) byGlyph.set(k.c, []);
      byGlyph.get(k.c).push(w);
      if (!k.r) continue;
      if (!byReading.has(k.r)) byReading.set(k.r, []);
      byReading.get(k.r).push({ word: w, c: k.c });
    }
  }
  const out = { byGlyph, byReading };
  families.set(deck, out);
  return out;
}
const FAMILY_READ_MAX = 8;
/**
 * The learner's own words in this deck (a card of the word is in the ledger) that share a kanji
 * of the target (同) or a reading of one of its kanji written with another kanji (読): the
 * JPMN/Kiku model, deck-relative. No etymology, no mnemonics. Words not yet met are left out,
 * so the fold never shows a word before its own card does.
 */
function familyOf(word) {
  const { byGlyph, byReading } = familyIndex(ctx.deck);
  const learned = (w) => w.id !== word.id && w.cards.some((c) => ctx.state.cards[c.id]);
  const rows = [];
  for (const k of word.kanji || []) {
    const same = [...new Set((byGlyph.get(k.c) || []).filter(learned))];
    const read = [...new Set((k.r ? byReading.get(k.r) || [] : []).filter((x) => x.c !== k.c && learned(x.word) && !same.includes(x.word)).map((x) => x.word))];
    if (same.length || read.length) rows.push({ k, same, read });
  }
  return rows;
}
function kanjiFamily(word) {
  const rows = familyOf(word);
  if (!rows.length) return null;
  const list = el('ul', 'kp-kfam');
  list.setAttribute('aria-label', '同じ字・同じ読みの、学習中の語');
  for (const { k, same, read } of rows) {
    const li = el('li', null, el('b', 'kp-kfam-c', k.c, k.r ? el('small', null, k.r) : null));
    for (const w of same) li.append(familyLink(w, '同', `${k.c}を含む`));
    for (const w of read.slice(0, FAMILY_READ_MAX)) li.append(familyLink(w, '読', `${k.r}と読む字を含む`));
    if (read.length > FAMILY_READ_MAX) li.append(el('span', 'kp-fam-more', `ほか${read.length - FAMILY_READ_MAX}語`));
    list.append(li);
  }
  return list;
}
function familyLink(w, mark, why) {
  return btn('kp-fam', [el('span', 'kp-fam-mark', mark), w.term], (e) => {
    e.stopPropagation();
    openWord(w.id);
  }, { 'data-word': w.id, 'data-mark': mark, 'aria-label': `${mark} ${w.term}（${why}）・語の一覧で開く` });
}
/** open a word in 語の一覧; its ← comes back to the card on screen */
function openWord(wid) {
  ui.from = ui.screen === 'study' ? 'study' : null;
  ui.q = '';
  ui.open = wid;
  go('list');
  ctx.root.querySelector(`.kp-row[data-word="${wid}"]`)?.scrollIntoView({ block: 'center' });
}

/** 参照 (deck words named by word.seeAlso) and 文法 (grammar ids on the card or the word, as
 * { id, p } or a bare id), one line; null when the deck gives neither */
function seeAlsoLine(card, word) {
  const see = (Array.isArray(word.seeAlso) ? word.seeAlso : []).filter((t) => typeof t === 'string' && t && t !== word.term);
  const grammar = [...(Array.isArray(card.grammar) ? card.grammar : []), ...(Array.isArray(word.grammar) ? word.grammar : [])]
    .map((g) => (typeof g === 'string' ? { id: g } : g))
    .filter((g, i, all) => g?.id && all.findIndex((x) => x.id === g.id) === i);
  if (!see.length && !grammar.length) return null;
  const line = el('p', 'kp-see');
  line.id = 'kp-see';
  if (see.length) {
    line.append(el('span', 'kp-see-label', '参照'));
    for (const t of see) {
      const w = ctx.deck.words.find((x) => x.term === t);
      line.append(
        w
          ? btn('kp-see-link', t, (e) => {
              e.stopPropagation();
              openWord(w.id);
            }, { 'data-word': w.id })
          : el('span', 'kp-see-item', t),
      );
    }
  }
  if (grammar.length) {
    line.append(el('span', 'kp-see-label', '文法'));
    for (const g of grammar) {
      line.append(
        ctx.openEntry
          ? btn('kp-see-link', g.p || g.id, (e) => {
              e.stopPropagation();
              ctx.openEntry({ t: 'grammar', id: g.id, label: g.p });
            }, { 'data-grammar': g.id })
          : Object.assign(el('span', 'kp-see-item', g.p || g.id), { title: g.id }),
      );
    }
  }
  return line;
}

/* ------------------------------------------------ delete and the leech ladder (CARD_CONTRACT_V2 §4) */
const DELETED = 'このカードを削除しました（設定 › 保留中のカード から戻せます）。';
const SWAPPED = '別の文に替えました。前の文は保留にしました。';
const SUSPENDED = '保留にしました（設定 › 保留中のカード から戻せます）。';
const UNDOABLE = [DELETED, SWAPPED, SUSPENDED];

/** the back's nodes in order: the answer (tier one, a leech's ladder, then the folds) */
function backParts(card, word) {
  const answer = answerBlock(card, word);
  return { answer, nodes: [answer] };
}

/** 削除 in the study top bar, front and back, never more than a glance away: one tap, undone
 * from the toast or ↶ for the rest of the sitting */
function deleteButton() {
  return btn('kp-delete', '削除', (e) => {
    e.stopPropagation();
    deleteCard();
  }, { id: 'kp-delete', 'aria-label': 'このカードを削除（保留にする・あとで戻せる）' });
}

/** a ladder hint: the first kana of the reading and one ○ per kana left; on a 字 card, the
 * blanked kanji's parts (its reading is already the card's hint) */
function repairHint(card, word) {
  if (card.type === 'kanji') {
    const glyph = card.ruby.find((seg) => seg[2] === 1)?.[0];
    const k = word.kanji?.find((x) => x.c === glyph);
    if (k?.parts?.length) return k.parts.join('＋');
    return k?.st ? `${k.st}画` : '';
  }
  const kana = [...(word.reading || '')];
  return kana.length ? kana[0] + '○'.repeat(kana.length - 1) : '';
}

function leechLadder(card, word) {
  const box = el('div', 'kp-ladder');
  box.id = 'kp-ladder';
  box.setAttribute('role', 'group');
  const lapses = ctx.state.cards[card.id]?.lapses ?? 0;
  const head = `この文で${lapses}回つまずいています`;
  box.setAttribute('aria-label', head);
  box.append(el('p', 'kp-ladder-head', `この文で`, el('span', 'kp-chip kp-st-learn kp-ladder-n', `${lapses}回`), 'つまずいています'));
  const target = swapTarget(word, card, ctx.state);
  const hint = ctx.state.repairs?.[card.id]?.hint ? '' : repairHint(card, word);
  const steps = el('ol', 'kp-ladder-steps');
  const step = (name, label, sub, onClick) => {
    const b = btn(`kp-ladder-step`, [el('b', null, label), el('small', null, sub)], (e) => {
      e.stopPropagation();
      onClick();
    }, { id: `kp-ladder-${name}`, 'data-step': name });
    if (!onClick) b.disabled = true;
    steps.append(el('li', null, b));
  };
  step('swap', '別の文に替える', target ? `${target.type ? `文章${target.passage}` : `例文${target.lv}`}へ（進み具合はそのまま）` : '替えられる文がありません', target && (() => ladderSwap(card, word)));
  step('hint', 'ヒントを付ける', hint ? `表に「${hint}」` : 'ヒントはもう付いています', hint && (() => ladderHint(card, hint)));
  step('suspend', '保留', 'このカードを休ませる', () => ladderSuspend(card));
  box.append(steps, btn('kp-link kp-ladder-keep', 'このまま続ける', (e) => {
    e.stopPropagation();
    ladderKeep(card);
  }, { id: 'kp-ladder-keep' }));
  return box;
}

/** adopt a ledger change made on the card on screen: stored first, then one undo step */
function adoptRepair(nextState) {
  if (!save(nextState)) return saveFailed();
  ui.undo = { state: ctx.state, queue: [...ui.queue], pos: ui.pos, done: ui.done, right: ui.right };
  ctx.state = nextState;
  return true;
}
/** the card leaves the sitting: this and every later place it held in the queue */
function dropFromQueue(id) {
  ui.queue = [...ui.queue.slice(0, ui.pos), ...ui.queue.slice(ui.pos).filter((x) => x !== id)];
}
function deleteCard() {
  const id = ui.queue[ui.pos];
  if (!id || !adoptRepair(suspendCard(ctx.state, id, 'delete', new Date()))) return;
  dropFromQueue(id);
  ui.toast = DELETED;
  resetCard();
  paint();
}
function ladderSwap(card, word) {
  const done = swapCard(word, card, ctx.state, new Date());
  if (!done || !adoptRepair(done.state)) return;
  dropFromQueue(card.id);
  ui.queue.splice(ui.pos, 0, done.to); // the new passage takes the card's place, front first
  ui.toast = SWAPPED;
  resetCard();
  paint();
}
function ladderHint(card, hint) {
  if (!adoptRepair(repairCard(ctx.state, card.id, 'hint', new Date(), hint))) return;
  ui.toast = '';
  paint();
}
function ladderSuspend(card) {
  if (!adoptRepair(suspendCard(ctx.state, card.id, 'leech', new Date()))) return;
  dropFromQueue(card.id);
  ui.toast = SUSPENDED;
  resetCard();
  paint();
}
function ladderKeep(card) {
  if (!adoptRepair(repairCard(ctx.state, card.id, 'keep', new Date()))) return;
  ui.toast = '';
  paint();
}

/** the word's other passages, one per passage (a passage's 字 cards share it): titles only,
 * never their text, so a sibling card is not answered here */
function otherPassages(card, word) {
  if (!card.type) return word.cards.filter((c) => c.id !== card.id);
  return word.cards.filter((c) => c.type === 'word' && c.passage !== card.passage);
}

/** 出典, the last tier-two fold (CARD_CONTRACT_V2 §3.10, STANDARD A27): who wrote it (the author,
 * and the translator when there is one; a passage written for the deck says so in its site
 * label), where it is from (a link when there is one), its licence, and which passage of the
 * word this is (kept out of the chip row: one 23px row, aesthetics.md §4) */
function sourceFold(card) {
  const src = card.src;
  const p = el('p', 'kp-src');
  const who = el('span', 'kp-src-line');
  if (src.author) who.append(src.author, src.translator ? `（訳 ${src.translator}）` : '', ' · ');
  const label = src.site || src.label || '';
  if (src.url) {
    const a = el('a', null, label);
    a.href = src.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', (e) => e.stopPropagation());
    who.append(a);
  } else who.append(label);
  if (card.type) who.append(` · 文章${card.passage}`);
  p.append(who);
  if (src.licence) {
    const lic = el('span', null, src.licence);
    lic.lang = 'en';
    p.append(el('span', 'kp-src-line kp-licence', el('span', 'kp-src-label', 'ライセンス '), lic));
  }
  return fold('kp-f-src', '出典', false, p);
}

/** もう一度／思い出せた, nothing else (CARD_CONTRACT_V2 §4: Hard and Easy are not shown).
 * Under the bar, once per deck until dismissed or answered, the rule for choosing. */
const RULE = '答えを見て理解が深まったなら もう一度';
function gradeBar(id) {
  const pv = preview(fsrsApi, scheduler, ctx.state, id, new Date());
  const bar = el('div', 'kp-grades');
  const g = (name, label, cls, key) =>
    btn(`kp-grade ${cls}`, [el('b', null, label), el('small', null, fmtWait(pv[name]))], () => commit(RATINGS[name]), {
      id: `kp-grade-${name}`,
      'aria-keyshortcuts': key,
    });
  bar.append(g('again', 'もう一度', 'kp-again', '1'), g('good', '思い出せた', 'kp-good', '3'));
  if (hintsOn()) bar.append(el('p', 'kp-swipehint', '← もう一度　　スワイプ　　思い出せた →'));
  if (!ctx.prefs.ruleSeen) {
    const rule = el('p', 'kp-rule', el('span', null, RULE));
    rule.id = 'kp-rule';
    const dismiss = () => {
      if (!savePrefQuiet({ ruleSeen: true })) return;
      rule.remove();
      fitBar();
    };
    rule.append(btn('kp-rule-x', '×', dismiss, { id: 'kp-rule-dismiss', 'aria-label': 'このヒントを閉じる' }));
    bar.append(rule);
  }
  return bar;
}

function reveal() {
  if (ui.revealed) return;
  ui.revealed = true;
  // read before any grade of this sitting: was this card answered on an earlier pass?
  ui.seen = !!ctx.state.cards[ui.queue[ui.pos]];
  if (!revealInPlace()) paint();
  settleBack();
}

const SETTLE_GAP = 12;
/**
 * After the reveal, at phone width (STANDARD A38, A39): the target sentence, the word and its
 * definition in view between the host's pinned header and the pinned grade bar, by the least
 * scroll that does it (up when the learner had scrolled past the target sentence, down when the
 * answer is under the bar); when all three cannot fit, the word and its definition win. Then no
 * fold row is left cut by the bar: it is scrolled wholly into view, or wholly under the bar,
 * whichever keeps the rest in view. Smooth unless reduced motion; nothing moves when it fits.
 */
function settleBack() {
  const face = ctx.root.querySelector('#kp-card');
  const answer = face?.querySelector('.kp-answer');
  const def = answer?.querySelector(':scope > .kp-def');
  if (!def || ui.screen !== 'study') return;
  const bar = ctx.root.querySelector('.kp-grades');
  const barTop = bar ? Math.min(innerHeight, bar.getBoundingClientRect().top) : innerHeight;
  const bottomLimit = barTop - SETTLE_GAP;
  const inset = topInset();
  const topLimit = inset + SETTLE_GAP;
  // the answer may still be rising into place (kp-rise, translateY 6px → 0): measure where it lands
  const t = getComputedStyle(answer).transform;
  const lift = t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
  const target = face.querySelector('.kp-s[data-focus]') || face.querySelector('.kp-target') || face.querySelector('.kp-sentence');
  const top = target.getBoundingClientRect().top;
  const bottom = def.getBoundingClientRect().bottom - lift;
  let dy = 0;
  if (bottom - top <= bottomLimit - topLimit) {
    if (top < topLimit) dy = top - topLimit;
    else if (bottom > bottomLimit) dy = bottom - bottomLimit;
  } else dy = bottom - bottomLimit;
  const room = { up: -window.scrollY, down: document.documentElement.scrollHeight - innerHeight - window.scrollY };
  dy = Math.max(room.up, Math.min(room.down, dy));
  // with no host header the study top bar (× n/N 削除) is the page's top edge: the fold step never
  // slides it under the viewport edge (A39); a host header covers it either way
  const head = inset ? null : ctx.root.querySelector('.kp-top-study')?.getBoundingClientRect().top;
  const headOk = (more) => head == null || head - dy - more >= Math.min(topLimit, head - dy);
  for (const s of face.querySelectorAll('.kp-folds > details > summary')) {
    const r = s.getBoundingClientRect();
    const [rTop, rBottom] = [r.top - lift - dy, r.bottom - lift - dy];
    if (!(rTop < barTop && rBottom > barTop)) continue;
    // rows touch, so the edge goes exactly at the bar: the next (or the previous) row is then whole
    const intoView = rBottom - barTop + 1; // scroll down: the row just above the bar
    const underBar = barTop - rTop; // scroll up: the row wholly under the bar
    if (top - dy - intoView >= topLimit && dy + intoView <= room.down && headOk(intoView)) dy += intoView;
    else if (bottom - dy + underBar <= bottomLimit && dy - underBar >= room.up) dy -= underBar;
    break;
  }
  if (Math.abs(dy) < 1) return;
  window.scrollTo({ top: window.scrollY + dy, behavior: motionOk() ? 'smooth' : 'instant' });
}
/** the height of a header the host pins over the top of the page (the corridor's chrome), if any */
function topInset() {
  let n = document.elementFromPoint(innerWidth / 2, 1);
  while (n && n !== document.body && !ctx.root.contains(n)) {
    const pos = getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'sticky') return Math.max(0, n.getBoundingClientRect().bottom);
    n = n.parentElement;
  }
  return 0;
}

/**
 * The reveal keeps the card node (no rebuild of the screen): the passage gains its readings,
 * the answer comes in under it, and 答えを見る becomes the grade bar. Only opacity and
 * transform animate (aesthetics.md §5); with reduced motion nothing does. False when the
 * card on screen is not the one to reveal (the caller repaints).
 */
function revealInPlace() {
  const id = ui.queue[ui.pos];
  const face = ctx.root.querySelector('#kp-card');
  if (!id || !face || face.dataset.card !== id || cardMode() === 'choice') return false;
  const { card, word } = ctx.index.cards.get(id);
  const box = face.closest('.kp-study');
  const passage = !!card.type;
  if (passage) {
    const zoom = zoomFor();
    face.dataset.zoom = zoom;
    face.querySelector('.kp-chips').append(zoomToggle(zoom));
  }
  const sentence = sentenceNodes(card, { split: passage, clamp: passage });
  face.querySelector('.kp-sentence').replaceWith(sentence);
  for (const n of face.querySelectorAll('.kp-taphint, .kp-rhint')) n.remove();
  face.removeEventListener('click', reveal);
  const { nodes, answer } = backParts(card, word);
  face.append(...nodes);
  if (motionOk()) {
    sentence.classList.add('kp-enter');
    answer.classList.add('kp-enter');
  }
  box.querySelector('#kp-reveal')?.replaceWith(gradeBar(id));
  box.classList.add('has-bar');
  attachSwipe(face);
  fitBar();
  fitClamps(face);
  return true;
}

/** the rule under the grade bar is shown once: answering the card it sat under retires it.
 * Not stored (storage full) only means it shows again. */
function retireRule() {
  if (ctx.prefs.ruleSeen) return;
  const prefs = { ...ctx.prefs, ruleSeen: true };
  if (writeJson(ctx.storage, prefsKey(ctx.deck.id), prefs)) ctx.prefs = prefs;
}

function commit(rating, { stay = false } = {}) {
  const id = ui.queue[ui.pos];
  if (!id) return;
  const nextState = grade(fsrsApi, scheduler, ctx.state, id, rating, new Date());
  if (!save(nextState)) {
    // not stored: the same card stays, ready to answer again
    if (cardMode() === 'choice') {
      ui.revealed = false;
      ui.picked = null;
    }
    saveFailed();
    return;
  }
  askToKeepStorage();
  if (cardMode() !== 'choice') retireRule();
  ui.toast = '';
  ui.undo = { state: ctx.state, queue: [...ui.queue], pos: ui.pos, done: ui.done, right: ui.right };
  ctx.state = nextState;
  ui.done++;
  if (rating >= RATINGS.good) ui.right++;
  if (stay) {
    paint();
    return;
  }
  next(rating >= RATINGS.good ? 'good' : 'again');
}

/**
 * Ask the browser once, after the first saved grade, to keep this site's
 * storage (Safari may otherwise clear it after days without a visit). A refusal
 * changes nothing; 設定 › バックアップ shows the answer.
 */
let storageAsked = false;
function askToKeepStorage() {
  if (storageAsked) return;
  storageAsked = true;
  try {
    navigator.storage?.persist?.()?.catch?.(() => {});
  } catch {
    /* not offered here */
  }
}

/** the next card. dir ('good' | 'again'): the answered card slides out that way while the
 * next one settles in (none with reduced motion) */
function next(dir) {
  const id = ui.queue[ui.pos];
  refill();
  ui.pos++;
  // a learning step due within the sitting comes back after a few cards
  const s = ctx.state.cards[id];
  if (s && s.state !== 2 && new Date(s.due).getTime() - Date.now() < 15 * MIN) {
    ui.queue.splice(Math.min(ui.queue.length, ui.pos + 4), 0, id);
  }
  resetCard();
  const ghost = dir && motionOk() ? ghostOf(ctx.root.querySelector('#kp-card'), dir) : null;
  paint();
  arrive(ghost, dir);
}

/** a copy of the answered card, inert and without ids, to slide out over the next one */
function ghostOf(face, dir) {
  if (!face) return null;
  const rect = face.getBoundingClientRect();
  const node = face.cloneNode(true);
  node.removeAttribute('id');
  for (const n of node.querySelectorAll('[id]')) n.removeAttribute('id');
  delete node.dataset.card;
  node.classList.remove('kp-arrive');
  node.classList.add('kp-ghost', `kp-out-${dir}`);
  node.style.transform = '';
  node.setAttribute('aria-hidden', 'true');
  node.inert = true;
  return { node, rect };
}
function arrive(ghost, dir) {
  const box = ctx.root.querySelector('.kp-study');
  if (!box) return; // the done screen
  if (dir) box.dataset.advance = dir;
  if (!motionOk()) return;
  box.querySelector('#kp-card')?.classList.add('kp-arrive');
  if (!ghost) return;
  const at = box.getBoundingClientRect();
  Object.assign(ghost.node.style, { top: `${ghost.rect.top - at.top}px`, left: `${ghost.rect.left - at.left}px`, width: `${ghost.rect.width}px`, height: `${ghost.rect.height}px` });
  box.append(ghost.node);
  const drop = () => ghost.node.remove();
  ghost.node.addEventListener('animationend', drop, { once: true });
  setTimeout(drop, 400);
}

function undo() {
  if (!ui.undo) return;
  if (!save(ui.undo.state)) return saveFailed();
  ui.toast = '';
  ctx.state = ui.undo.state;
  ui.queue = ui.undo.queue;
  ui.pos = ui.undo.pos;
  ui.done = ui.undo.done;
  ui.right = ui.undo.right;
  ui.undo = null;
  resetCard();
  ui.revealed = cardMode() !== 'choice';
  ui.seen = !!ctx.state.cards[ui.queue[ui.pos]];
  paint();
  if (ui.revealed) settleBack();
}

/**
 * Swipe right = 思い出せた, left = もう一度. Only the finger that started the
 * swipe counts; it must travel more than 90px and at least twice as far
 * sideways as up or down, and be lifted (pointerup). A cancelled gesture (the
 * page scrolled, the system took the touch) only puts the card back.
 */
function attachSwipe(face) {
  let x0 = null;
  let y0 = 0;
  let pid = null;
  let dx = 0;
  let dy = 0;
  const reset = () => {
    x0 = null;
    pid = null;
    face.style.transform = '';
    face.dataset.swipe = '';
  };
  face.addEventListener('pointerdown', (e) => {
    if ((x0 !== null && e.pointerId !== pid) || e.target.closest?.('button, a, summary, input, textarea')) return;
    pid = e.pointerId;
    try {
      face.setPointerCapture(pid); // a release outside the card still ends the swipe here
    } catch {
      /* a pointer the browser no longer tracks */
    }
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    dy = 0;
  });
  face.addEventListener('pointermove', (e) => {
    if (x0 === null || e.pointerId !== pid) return;
    dx = e.clientX - x0;
    dy = e.clientY - y0;
    const sideways = Math.abs(dx) > 2 * Math.abs(dy);
    // reduced motion: the card stays put, only its edge says which way (the buttons do the work)
    face.style.transform = sideways && motionOk() ? `translateX(${dx}px) rotate(${dx / 40}deg)` : '';
    face.dataset.swipe = !sideways ? '' : dx > 40 ? 'good' : dx < -40 ? 'again' : '';
  });
  face.addEventListener('pointerup', (e) => {
    if (x0 === null || e.pointerId !== pid) return;
    const swiped = Math.abs(dx) > 90 && Math.abs(dx) > 2 * Math.abs(dy);
    const right = dx > 0;
    reset();
    if (!swiped) return;
    if (cardMode() === 'choice') next(right ? 'good' : 'again');
    else commit(right ? RATINGS.good : RATINGS.again);
  });
  face.addEventListener('pointercancel', (e) => {
    if (x0 === null || e.pointerId !== pid) return;
    reset();
  });
}

function doneScreen() {
  const box = el('section', 'kp-done');
  box.append(topBar('おつかれさま', () => go('home')));
  const pct = ui.done ? Math.round((ui.right / ui.done) * 100) : 0;
  box.append(el('div', 'kp-tiles', el('div', 'kp-tile kp-c-new', el('b', null, String(ui.done)), el('span', null, '回答')), el('div', 'kp-tile kp-c-known', el('b', null, `${pct}%`), el('span', null, '思い出せた割合'))));
  const soon = learningSoon(ctx.deck, ctx.state, new Date(), DAY, { skip: skipFor(ctx.prefs.mode) })[0];
  box.append(el('p', 'kp-sub', soon ? `次の復習は ${fmtWait(Math.max(0, soon.t - Date.now()))}後。` : '今日の分は終わり。また明日。'));
  box.append(btn('kp-start', 'デッキに戻る', () => go('home'), { id: 'kp-home' }));
  if (ui.undo) box.append(btn('kp-undo', '↶ ひとつ戻す', undo, { id: 'kp-undo' }));
  return box;
}

function listScreen() {
  const box = el('section', 'kp-list');
  // opened from a card (the kanji family, 参照): ← goes back to that card, as it was
  box.append(
    topBar('語の一覧', () => {
      const back = ui.from === 'study' && ui.queue[ui.pos] ? 'study' : 'home';
      ui.from = null;
      go(back);
    }),
  );
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
      }, { 'data-word': w.id, 'aria-expanded': String(ui.open === w.id) });
      if (ui.open === w.id) row.classList.add('is-open');
      rows.append(row);
      if (ui.open === w.id) {
        const det = el('div', 'kp-detail');
        det.append(el('p', 'kp-def', w.defJa));
        for (const c of w.cards) det.append(el('div', 'kp-ex', sentenceNodes(c, {}), ...(c.en ? [el('p', 'kp-en', c.en)] : [])));
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
  if (ctx.deck.method?.length) {
    const how = el('details', 'kp-method');
    how.id = 'kp-method';
    how.append(el('summary', null, 'このデッキのしくみ'));
    for (const line of ctx.deck.method) how.append(el('p', null, line));
    box.append(how);
  }
  const seg = (title, key, options) => {
    const wrap = el('div', 'kp-field', el('h2', 'kp-h2', title));
    const row = el('div', 'kp-seg');
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', title);
    for (const [value, label] of options) {
      const on = ctx.prefs[key] === value;
      const b = btn(on ? 'is-on' : '', label, () => {
        savePrefs({ ...ctx.prefs, [key]: value });
      }, { 'data-pref': `${key}:${value}`, role: 'radio', 'aria-checked': String(on) });
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  };
  box.append(seg('一日の新しいカード', 'newPerDay', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30']]));
  box.append(seg('答え方', 'mode', [['read', '読んで思い出す'], ['self', '穴埋め'], ['choice', '4択']]));
  box.append(seg('英語の意味（答えの「英語」）', 'gloss', [['tap', 'タップで開く'], ['show', 'いつも開いておく']]));
  const themes = el('div', 'kp-field', el('h2', 'kp-h2', '色（テーマ）'));
  const sw = el('div', 'kp-swatches');
  sw.setAttribute('role', 'radiogroup');
  sw.setAttribute('aria-label', '色（テーマ）');
  for (const [value, label, bg, ink] of THEMES) {
    const on = ctx.prefs.look === value;
    const b = btn(`kp-swatch${on ? ' is-on' : ''}`, label, () => {
      savePrefs({ ...ctx.prefs, look: value });
    }, { 'data-pref': `look:${value}`, 'aria-label': label, role: 'radio', 'aria-checked': String(on), style: `background:${bg};color:${ink}` });
    sw.append(b);
  }
  themes.append(sw);
  box.append(themes);
  box.append(suspendedField());

  const ta = el('textarea', 'kp-backup');
  ta.id = 'kp-backup';
  ta.spellcheck = false;
  const msg = el('p', 'kp-sub');
  msg.id = 'kp-backup-msg';
  const taLabel = el('label', 'kp-sub', 'バックアップの文字列');
  taLabel.htmlFor = 'kp-backup';
  const kept = el('p', 'kp-sub', '端末の保存領域：不明');
  kept.id = 'kp-persist';
  navigator.storage?.persisted?.().then(
    (yes) => (kept.textContent = `端末の保存領域：${yes ? '確保済み' : '未確保'}`),
    () => {},
  );
  box.append(
    el('div', 'kp-field', el('h2', 'kp-h2', 'バックアップ'), el('p', 'kp-sub', '記録はこの端末だけに保存されます。コピーして保管し、別の端末で貼り付けて復元できます。'), kept, taLabel, ta,
      el('div', 'kp-seg',
        btn('', 'コピー', () => {
          ta.value = JSON.stringify(ctx.state);
          ta.select();
          navigator.clipboard?.writeText(ta.value).then(() => (msg.textContent = 'コピーしました。'), () => (msg.textContent = '選択しました。手動でコピーしてください。'));
        }),
        // whole-deck reset is not offered (CARD_CONTRACT_V2 §4, STANDARD A34): a card leaves
        // through 削除 (undone by 保留中のカード › 復元), a topic through テーマ
        restoreButton(ta, msg),
      ), msg),
  );
  return box;
}

/** 保留中のカード: how many cards a delete or the leech ladder took out, and 復元 for all of them */
const SUSPEND_WHY = { delete: '削除', swap: '別の文に替えた', leech: '保留' };
function suspendedField() {
  const ids = Object.keys(ctx.state.suspended || {}).filter((id) => ctx.index.cards.has(id));
  const why = {};
  for (const id of ids) why[ctx.state.suspended[id].by] = (why[ctx.state.suspended[id].by] || 0) + 1;
  const count = el('p', 'kp-sub', ids.length ? `${ids.length}枚（${Object.entries(why).map(([k, n]) => `${SUSPEND_WHY[k] || k} ${n}`).join('・')}）` : 'ありません');
  count.id = 'kp-suspended';
  const back = btn('', '復元', () => {
    const nextState = restoreSuspended(ctx.state, new Date(), ids);
    if (!save(nextState)) return saveFailed();
    ctx.state = nextState;
    ui.undo = null;
    ui.toast = '';
    paint();
  }, { id: 'kp-unsuspend', 'aria-label': `保留中の${ids.length}枚をすべて戻す` });
  back.disabled = !ids.length;
  return el('div', 'kp-field', el('h2', 'kp-h2', '保留中のカード'), el('p', 'kp-sub', '削除したカードと、つまずきが続いて休ませたカード。記録は消えていません。'), count, el('div', 'kp-seg', back));
}

const RESTORE_REFUSED = {
  json: '読み取れません。バックアップの文字列をそのまま貼り付けてください。',
  'not-an-object': 'このデッキのバックアップではありません。',
  'wrong-format': 'このデッキのバックアップではありません。',
  'wrong-version': 'このデッキのバックアップではありません。',
  'wrong-deck': 'このデッキのバックアップではありません。',
  empty: 'カードの記録が入っていません。',
  'bad-card': '壊れた記録が含まれています。',
};
const RESTORE_NO_ROOM = '保存領域がいっぱいで、置き換えられませんでした。';

/**
 * 復元: the first tap only checks the pasted backup and shows both counts; a
 * second tap on 置き換える keeps a copy of the current ledger under
 * bunki-cloze:<deck>:before-restore and only then writes the backup. Anything
 * that fails leaves the stored ledger and ctx.state as they were.
 */
function restoreButton(ta, msg) {
  let staged = null;
  const b = btn('', '復元', () => {
    if (staged && staged.text === ta.value) return replace();
    disarm();
    let raw;
    try {
      raw = JSON.parse(ta.value);
    } catch {
      msg.textContent = RESTORE_REFUSED.json;
      return;
    }
    const seen = inspectState(raw, ctx.deck);
    if (!seen.ok) {
      msg.textContent = RESTORE_REFUSED[seen.reason] || RESTORE_REFUSED['wrong-format'];
      return;
    }
    const nowCards = Object.keys(ctx.state.cards).length;
    const nowLog = ctx.state.log.length;
    msg.textContent = `このバックアップ：${seen.cards}枚・${seen.log}回答／いまの記録：${nowCards}枚・${nowLog}回答` + (seen.cards < nowCards ? '　いまより少ない記録です。' : '');
    staged = { text: ta.value, raw };
    b.dataset.arm = '1';
    b.textContent = '置き換える';
  }, { id: 'kp-restore' });
  function disarm() {
    staged = null;
    delete b.dataset.arm;
    b.textContent = '復元';
  }
  function replace() {
    const { raw } = staged;
    disarm();
    const key = stateKey(ctx.deck.id);
    let current = null;
    try {
      current = ctx.storage.getItem(key);
    } catch {
      current = null;
    }
    if (!writeRaw(ctx.storage, beforeRestoreKey(ctx.deck.id), current ?? JSON.stringify(ctx.state))) {
      msg.textContent = RESTORE_NO_ROOM;
      return;
    }
    const next = normalizeState(raw, ctx.deck);
    if (!save(next)) {
      msg.textContent = RESTORE_NO_ROOM;
      return;
    }
    ctx.state = next;
    ctx.notice = '';
    ui.undo = null;
    msg.textContent = `復元しました（${Object.keys(next.cards).length}枚・${next.log.length}回答）。`;
  }
  ta.addEventListener('input', () => staged && disarm());
  return b;
}

function onKey(e) {
  if (!ctx?.root?.isConnected || ui.screen !== 'study' || e.target.closest?.('input, textarea')) return;
  const mode = cardMode();
  if (!ui.revealed && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    if (mode !== 'choice') reveal();
  } else if (ui.revealed && mode !== 'choice' && (e.key === '1' || e.key === '3')) {
    e.preventDefault();
    commit(Number(e.key));
  } else if (ui.revealed && mode === 'choice' && (e.key === ' ' || e.key === 'Enter')) {
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

export async function render(main, { deckId, storage = window.localStorage, onLeave, openEntry, host = null } = {}) {
  ensureCss();
  const root = el('div', 'kp');
  const lexicon = hostOf(host);
  // which lexicon this player answers taps from: the corridor's, or none (the standalone pages)
  root.dataset.host = lexicon ? String(lexicon.name || 'host') : 'none';
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
    openEntry: typeof openEntry === 'function' ? openEntry : lexicon ? (node) => lexicon.open(node) : null,
    host: lexicon,
    prefs: prefsFor(storage, deck),
  };
  ({ state: ctx.state, notice: ctx.notice } = loadState(storage, deck));
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
  const { state } = loadState(storage, deck);
  const prefs = prefsFor(storage, deck);
  const q = buildQueue(deck, state, new Date(), prefs.newPerDay, { skip: skipFor(prefs.mode) });
  return { due: q.due.length, fresh: q.fresh.length, words: deck.words.length, titleJa: deck.titleJa, titleEn: deck.titleEn };
}
