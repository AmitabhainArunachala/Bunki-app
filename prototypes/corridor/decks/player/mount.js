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
 * { name, lookup(token), open(entry), isTaken(entry), take(entry), addToList?(entry, invoker) }. The
 * corridor passes one; the standalone study pages have none (null), and nothing here pretends
 * to a dictionary it does not have. With a host and no openEntry, 文法 links open through it.
 */
import {
  RATINGS,
  buildQueue,
  cardTokens,
  createScheduler,
  defTokens,
  grade,
  indexDeck,
  inspectState,
  isLeech,
  learningSoon,
  logLookup,
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
/** deck → its tokens once they have arrived, so a repaint draws the back's taps at once */
const tokensReady = new Map();
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

const HOST_METHODS = ['lookup', 'open', 'isTaken', 'take'];
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
const ui = { screen: 'home', queue: [], pos: 0, revealed: false, seen: false, picked: null, undo: null, done: 0, right: 0, q: '', open: null, from: null, toast: '', rail: 0, sheet: null, pop: null };
let ctx = null; // { root, deck, deckKey, index, storage, onLeave, openEntry, host, tokenFile, gloss, state, prefs, notice }

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
 * two dimmed lines with a ⋯ to open it (STANDARD A38); taps (the back only, STANDARD A44):
 * { units, onTap } — each unit ({ at, len }, tapUnits) becomes one .kp-tok tap target over its
 * characters, and the target itself opens the card's own word (unit { self: true }) */
export function sentenceNodes(card, { front = false, blank = false, ruby = front ? 'none' : 'all', split = false, clamp = false, taps = null }) {
  if (front) {
    ruby = 'none';
    clamp = false;
    taps = null; // the front has nothing to tap, whatever is asked
  }
  const cover = taps ? coverOf(card.ja.length, taps.units) : null;
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
  // a piece inside a tap unit goes into that unit's .kp-tok, which continues across segments
  // (one word, several ruby segments) until a sentence starts a new host
  const put = (node, isTarget, len, unit = null) => {
    if (split && isTarget === 1) host.dataset.focus = '1';
    if (unit) {
      let tok = host.lastChild;
      if (!(tok && tok.kpUnit === unit)) {
        tok = tapNode(el('span', 'kp-tok'), unit, taps.onTap);
        host.append(tok);
      }
      tok.append(node);
    } else host.append(node);
    at += len;
    while (split && k < ends.length - 1 && at >= ends[k]) {
      k++;
      open();
    }
  };
  /** the unit that covers [a, a + len) whole, or null */
  const unitOver = (a, len) => {
    const u = cover?.[a];
    return u && u.at + u.len >= a + len ? u : null;
  };
  card.ruby.forEach(([text, reading, isTarget]) => {
    const len = text.length;
    if (isTarget === 1 && blank) return put(el('span', 'kp-blank', card.hint ? `〔${card.hint}〕` : '　'.repeat(Math.min(6, Math.max(2, [...text].length)))), 1, len);
    // the word again later in the passage: blanked too, without the hint
    if (isTarget === 3 && blank) return put(el('span', 'kp-blank', '　'.repeat(Math.min(6, Math.max(2, [...text].length)))), 3, len);
    const hasRuby = reading && KANJI.test(text) && ruby === 'all';
    if (isTarget) {
      const wrap = el('span', 'kp-target', hasRuby ? el('ruby', null, text, el('rt', null, reading)) : text);
      // the card's own word: its tap says it is in this deck (no 覚える)
      if (taps) tapNode(wrap, SELF_UNIT, taps.onTap);
      return put(wrap, isTarget, len);
    }
    if (hasRuby) return put(el('ruby', null, text, el('rt', null, reading)), 0, len, unitOver(at, len));
    // plain text may hold a sentence end or a word edge: cut it there so each sentence keeps its
    // own words and each word its own tap target
    let rest = text;
    while (rest) {
      let cut = rest.length;
      if (split && k < ends.length - 1 && at + cut > ends[k]) cut = ends[k] - at;
      if (cover) {
        const u = cover[at];
        let j = 1;
        while (j < cut && cover[at + j] === u) j++;
        cut = j;
      }
      put(document.createTextNode(rest.slice(0, cut)), 0, cut, cover ? cover[at] : null);
      rest = rest.slice(cut);
    }
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
  ui.pop = null; // its word was just redrawn
  if (ui.sheet) drawSheet({ focus: false });
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
  ui.sheet = null;
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
  wantTokens();
  go('study');
}

function resetCard() {
  ui.revealed = false;
  ui.seen = false;
  ui.picked = null;
  ui.sheet = null;
  ui.pop = null;
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
  const written = passageChips(card, source);
  const chips = el(
    'div',
    'kp-chips',
    el('span', 'kp-chip kp-kindchip', kindLabel),
    // a written passage's register chip names its source too, so the row stays one line at 390px
    REGISTER[card.register] ? null : el('span', 'kp-chip', source),
    ...written,
    TOPIC[card.topic] ? null : el('span', 'kp-chip', ctx.deck.groups.find((g) => g.id === word.group)?.titleJa || ''),
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
  face.append(ui.revealed ? sentenceNodes(card, { split: passage, clamp: passage, taps: backTaps(card, word) }) : sentenceNodes(card, { front: true, blank: mode !== 'read', split: passage }));
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
/** a written passage's register (CARD_CONTRACT_V2 §6) and topic: [chip text, full name] */
const REGISTER = { 講: ['講義', '講義・本の要約'], 報: ['報道', 'ニュース・解説'], 論: ['論説', 'エッセイ・思想'], 話: ['会話', '話し言葉'], 学: ['学び', '勉強法・学習の話'], 語: ['話し方', '話し方・書き方の話'] };
const TOPIC = { mind: ['心と学び', '心と学び'], india: ['インド・仏教', 'インド哲学と仏教'], ai: ['AI・半導体', 'AI と半導体'], history: ['世界史', '世界史'], language: ['日本語', '日本語についての話'] };
/** small text chips for the passage's register and topic (none on a card without them); the
 * passage's topic takes the place of the word's group chip, and its register the place of the
 * source chip (its label names the source), so the row stays one line: kind · register · topic ·
 * level · state (aesthetics.md §4) */
function passageChips(card, source = '') {
  const out = [];
  for (const [table, value, cls, what] of [
    [REGISTER, card.register, 'kp-regchip', '文体'],
    [TOPIC, card.topic, 'kp-topicchip', '話題'],
  ]) {
    const [text, full] = (typeof value === 'string' && table[value]) || [];
    if (!text) continue;
    const chip = el('span', `kp-chip kp-chip-sm ${cls}`, text);
    const label = `${what}：${full}${table === REGISTER && source ? `（${source}）` : ''}`;
    chip.title = label;
    chip.setAttribute('aria-label', label);
    out.push(chip);
  }
  return out;
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
  // the definition's words are tap targets like the passage's (STANDARD A44)
  a.append(defLine(card, word));
  // a usage note in Japanese stays in tier one (§3 item 4): the passage's own note (tipJa) when it
  // has one, else the word's; the deck's English notes go behind 英語
  const jaNote = word.tip && !/[A-Za-z]/.test(word.tip);
  const note = (typeof card.tipJa === 'string' && card.tipJa) || (jaNote ? word.tip : '');
  if (note) a.append(el('p', `kp-note${note === card.tipJa ? ' kp-note-passage' : ''}`, note));
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

/* ------------------------------------------------ tap → define → 覚える (CARD_CONTRACT_V2 §3, STANDARD A44)
 * After the reveal only, every word of the passage and of the Japanese definition is a tap
 * target (a word, a kanji, a grammar cue as one, and any word of this deck; particles, endings
 * and punctuation are not words and stay plain). With a host lexicon (the corridor) a tap opens
 * the entry sheet: the reading, the Japanese sense, English behind 英語, and the corridor's one-tap
 * 覚える (A51); a word of this deck says 「このデッキにあります」 and offers no 覚える (A17). A word in
 * the sheet's definition opens one more sheet, and that second one says 「ここで止めよう」 and offers
 * no further tap (Khatz's cut-off). Without a host (the standalone study pages) only this deck's
 * own words are tappable, from the page's built-in gloss map, and a tap shows a small popover with
 * no 覚える. A tap is capture, never evidence: it never grades, never changes a card's schedule and
 * never adds a card; it is written to the ledger's lookups[] for the sensei and nowhere else. */
const SHEET_DEPTH = 2;
const IN_DECK = 'このデッキにあります';
const STOP_HERE = 'ここで止めよう';
const NO_JA = 'この語の日本語の語釈は、まだ辞書にありません';
const NOT_FOUND = 'この語は辞書にありません';
const NO_TAKE_HERE = 'ここでは覚えるに保存できません（回廊でできます）';
const TAKE_NOTE = '覚えるの札に入ります — このデッキの予定は変わりません';
const SELF_UNIT = Object.freeze({ self: true });
const GLOSS_FORMAT = 'bunki-cloze-gloss';
const ENTRY_KIND = { word: '語', kanji: '字', grammar: '文法' };

/** the standalone page's built-in gloss map (build.py gloss_map), or null */
function glossFor(deckId, deck) {
  const g = window.__CORRIDOR_BUNDLE__?.[`decks/${deckId}/gloss`];
  return g?.format === GLOSS_FORMAT && g.deck === deck.id ? g : null;
}

/** with a host: fetch the deck's tokens once a sitting starts (never at the deck home) and, if
 * the card on screen is already turned over, give its back its tap targets */
function wantTokens() {
  if (!ctx.host || ctx.tokenFile || typeof ctx.deck.tokens !== 'string') return;
  const { deck, deckKey } = ctx;
  loadTokens(deckKey, deck).then((file) => {
    if (!file) return;
    tokensReady.set(deckKey, file);
    if (ctx?.deck !== deck || ctx.tokenFile) return;
    ctx.tokenFile = file;
    if (ui.screen === 'study' && ui.revealed) upgradeTaps();
  });
}

/** character offset → the unit covering it, or null */
function coverOf(n, units) {
  const out = new Array(n).fill(null);
  for (const u of units || []) for (let i = Math.max(0, u.at); i < Math.min(n, u.at + u.len); i++) out[i] = u;
  return out;
}

const termMaps = new WeakMap();
/** the word of this deck a token stands for: its lemma, its ref or its surface is a deck term
 * (build.py gloss_map follows the same rule) */
function deckWordOf(t) {
  let map = termMaps.get(ctx.deck);
  if (!map) {
    map = new Map(ctx.deck.words.map((w) => [w.term, w]));
    termMaps.set(ctx.deck, map);
  }
  for (const key of [t?.b, t?.ref, t?.s]) if (key && map.has(key)) return map.get(key);
  return null;
}

/** tokens → tap units { at, len, tok, word }: a 語, a 字, a 文法 cue (its tokens joined), or any
 * token that is a word of this deck */
function unitsOfTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    const word = deckWordOf(t);
    if (t.k === 'other' && !word) continue;
    const last = out.at(-1);
    if (!word && t.k === '文法' && last && !last.word && last.tok.k === '文法' && last.tok.ref === t.ref && last.at + last.len === t.at) {
      last.len += t.s.length;
      last.tok = { ...last.tok, s: last.tok.s + t.s, b: last.tok.b + t.s };
      continue;
    }
    out.push({ at: t.at, len: t.s.length, tok: t, word });
  }
  return out;
}
/** the gloss map's spans → tap units { at, len, word } */
function unitsOfSpans(spans) {
  return (Array.isArray(spans) ? spans : []).map(([at, len, wi]) => ({ at, len, word: ctx.deck.words[wi] })).filter((u) => u.word && Number.isInteger(u.at) && u.len > 0);
}
/** the passage's tap units, or null: nothing to look words up in (no host and no gloss map), or
 * the tokens are still on their way */
function passageUnits(card) {
  if (ctx.host) {
    const toks = cardTokens(card, ctx.tokenFile);
    return toks ? unitsOfTokens(toks) : null;
  }
  return ctx.gloss ? unitsOfSpans(ctx.gloss.cards?.[card.id]) : null;
}
function defUnits(word) {
  if (ctx.host) {
    const toks = defTokens(word, ctx.tokenFile, ctx.deck);
    return toks ? unitsOfTokens(toks) : null;
  }
  return ctx.gloss ? unitsOfSpans(ctx.gloss.defs?.[word.id]) : null;
}

/** the back's passage taps for sentenceNodes, or null */
function backTaps(card, word) {
  const units = passageUnits(card);
  if (!units) return null;
  return { units, onTap: (unit, node) => tapped(unit === SELF_UNIT ? { word } : unit, node, { card, where: 'p', depth: 1 }) };
}

let downAt = null;
/** a click that ends a drag (a swipe, a scroll) is not a tap */
function dragged(e) {
  return e.detail > 0 && !!downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10;
}
function onDown(e) {
  downAt = { x: e.clientX, y: e.clientY };
  // a press anywhere outside the popover closes it
  if (ui.pop && !e.target.closest?.('.kp-pop')) closePop();
}

/** make node one tap target: role button, in the tab order, no look of its own until hover or focus */
function tapNode(node, unit, onTap) {
  node.classList.add('kp-tok');
  node.kpUnit = unit;
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.setAttribute('aria-haspopup', 'dialog');
  if (unit.word) node.dataset.deckWord = unit.word.id;
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!dragged(e)) onTap(unit, node);
  });
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    onTap(unit, node);
  });
  return node;
}

/** text with its units as tap targets (a definition) */
function tapText(text, units, onTap) {
  if (!units?.length) return [text];
  const out = [];
  let at = 0;
  for (const u of [...units].sort((a, b) => a.at - b.at)) {
    if (u.at < at || u.at + u.len > text.length) continue;
    if (u.at > at) out.push(text.slice(at, u.at));
    out.push(tapNode(el('span', 'kp-tok', text.slice(u.at, u.at + u.len)), u, onTap));
    at = u.at + u.len;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** tier one's Japanese definition, its words tappable on the back */
function defLine(card, word) {
  const p = el('p', 'kp-def');
  p.append(...tapText(word.defJa || '', defUnits(word), (u, node) => tapped(u, node, { card, where: 'd', depth: 1 })));
  return p;
}

/** the back's sentence and definition gain their tap targets in place, once the tokens arrive */
function upgradeTaps() {
  const id = ui.queue[ui.pos];
  const face = ctx.root.querySelector('#kp-card');
  if (!id || !face || face.dataset.card !== id || face.querySelector('.kp-tok')) return;
  const { card, word } = ctx.index.cards.get(id);
  const taps = backTaps(card, word);
  if (!taps) return;
  const passage = !!card.type;
  const old = face.querySelector('.kp-sentence');
  const opened = [...old.querySelectorAll('.kp-ctx')].map((b) => b.dataset.open || '');
  const sentence = sentenceNodes(card, { split: passage, clamp: passage, taps });
  [...sentence.querySelectorAll('.kp-ctx')].forEach((b, i) => {
    if (!opened[i]) return;
    b.dataset.open = opened[i];
    b.querySelector('.kp-more')?.setAttribute('aria-expanded', String(opened[i] === '1'));
  });
  old.replaceWith(sentence);
  face.querySelector('.kp-answer > .kp-def')?.replaceWith(defLine(card, word));
  fitClamps(face);
}

/** what a tap shows: a word of this deck from the deck, anything else from the host lexicon */
function frameOf(unit) {
  const tok = unit.tok || null;
  const word = unit.word || (tok ? deckWordOf(tok) : null);
  if (word) return { word, label: word.term, reading: word.reading, ja: word.defJa || '', en: word.meaning || '', key: `deck:${word.id}`, kind: '語', level: word.level || '', surface: tok?.s || word.term };
  const entry = safely(() => ctx.host?.lookup(tok) || null, null);
  // the host lexicon is English-only: a word that is not the deck's own takes its Japanese sense
  // from the deck's tokens file (build.py, source/gloss_ja.json), keyed as the build keyed it
  const ja = (entry?.ja || '') || lemmaSense(tok);
  if (entry) return { entry, label: entry.label || entry.id, reading: entry.reading || '', ja, en: entry.en || entry.gloss || '', key: `${entry.t}:${entry.id}`, kind: ENTRY_KIND[entry.t] || '', level: entry.level || '', surface: tok.s };
  return { label: tok?.b || tok?.s || '', reading: tok?.r || '', ja, en: '', key: '', kind: ja ? '語' : '', level: '', surface: tok?.s || '' };
}

/** a 語 token's Japanese sense from the tokens file's defs, tried by ref, lemma, then surface (the
 * order build.py gloss_keys() keys them); deck word ids share that table and are never matched
 * here, since a deck word never reaches this point. '' when the table has no row. */
function lemmaSense(tok) {
  const defs = ctx.tokenFile?.defs;
  if (!tok || tok.k !== '語' || !defs || typeof defs !== 'object') return '';
  const ids = deckIds();
  for (const key of [tok.ref, tok.b, tok.s]) {
    if (!key || ids.has(key) || !Object.hasOwn(defs, key)) continue;
    const rows = defs[key];
    if (!Array.isArray(rows)) return '';
    return rows.map((r) => (Array.isArray(r) && typeof r[0] === 'string' ? r[0] : '')).join('');
  }
  return '';
}
const idSets = new WeakMap();
function deckIds() {
  let ids = idSets.get(ctx.deck);
  if (!ids) {
    ids = new Set(ctx.deck.words.map((w) => w.id));
    idSets.set(ctx.deck, ids);
  }
  return ids;
}

/** one lookup row in the ledger (engine logLookup); the card's schedule is not touched. Not stored
 * (storage full) only means the row is missing: the tap still opens. */
function logTap(card, where, frame, depth) {
  const cardId = card?.id || ui.queue[ui.pos] || '';
  const next = logLookup(ctx.state, { cardId, where, surface: frame.surface, key: frame.key, depth }, new Date());
  if (save(next)) ctx.state = next;
}

function tapped(unit, node, { card, where, depth }) {
  const frame = frameOf(unit);
  logTap(card, where, frame, depth);
  if (ctx.host) openSheet(frame, node, depth);
  else openPop(frame, node);
}

/** what the host answers, or fallback when it throws: a host fault never breaks the card */
function safely(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
const currentCard = () => ctx.index.cards.get(ui.queue[ui.pos])?.card || null;
function englishLine(cls, text) {
  const n = el('p', cls, text);
  n.lang = 'en';
  return n;
}

/* -------- the entry sheet (with a host) */
function openSheet(frame, node, depth) {
  const prior = ui.sheet;
  const stack = depth > 1 && prior ? [...prior.stack.slice(0, depth - 1), frame] : [frame];
  ui.sheet = { stack, note: '', returnTo: depth > 1 && prior ? prior.returnTo : node };
  drawSheet();
}
function closeSheet() {
  const back = ui.sheet?.returnTo;
  ui.sheet = null;
  ctx.root.querySelector('.kp-sheet-wrap')?.remove();
  if (back?.isConnected) back.focus({ preventScroll: true });
}
/** (re)draw the sheet over the card; the card itself is not repainted, so its folds stay as they are */
function drawSheet({ focus = true } = {}) {
  const old = ctx.root.querySelector('.kp-sheet-wrap');
  const scroll = old?.querySelector('.kp-sheet')?.scrollTop || 0;
  old?.remove();
  if (!ui.sheet || ui.screen !== 'study') return;
  const wrap = sheetNode();
  ctx.root.append(wrap);
  const sheet = wrap.querySelector('.kp-sheet');
  if (focus) sheet.querySelector('.kp-sheet-term')?.focus({ preventScroll: true });
  else sheet.scrollTop = scroll;
}
function sheetNode() {
  const { stack } = ui.sheet;
  const depth = stack.length;
  const f = stack[depth - 1];
  const wrap = el('div', 'kp-sheet-wrap');
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === wrap) closeSheet();
  });
  const sheet = el('div', 'kp-sheet');
  sheet.id = 'kp-sheet';
  sheet.lang = 'ja';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'kp-sheet-term');
  sheet.dataset.depth = String(depth);
  sheet.dataset.key = f.key;
  const top = el('div', 'kp-sheet-top');
  if (depth > 1) {
    top.append(btn('kp-icon kp-sheet-back', '←', () => {
      ui.sheet = { ...ui.sheet, stack: stack.slice(0, -1), note: '' };
      drawSheet();
    }, { id: 'kp-sheet-back', 'aria-label': '前の語に戻る' }));
  }
  const term = el('h2', 'kp-sheet-term', f.label);
  term.id = 'kp-sheet-term';
  term.tabIndex = -1;
  const head = el('div', 'kp-sheet-head', term, f.reading && f.reading !== f.label ? el('span', 'kp-sheet-reading', f.reading) : null);
  const chips = el('div', 'kp-sheet-chips', f.kind ? el('span', 'kp-chip', f.kind) : null, f.level ? levelChip(f.level) : null);
  top.append(head, chips, btn('kp-icon kp-sheet-x', '×', closeSheet, { id: 'kp-sheet-close', 'aria-label': '閉じる' }));
  sheet.append(top);
  // the Japanese sense first; its words open one more sheet, down to SHEET_DEPTH
  if (f.ja) {
    const def = el('p', 'kp-sheet-def');
    const units = depth < SHEET_DEPTH && f.word ? defUnits(f.word) : null;
    def.append(...tapText(f.ja, units, (u, node) => tapped(u, node, { card: currentCard(), where: 's', depth: depth + 1 })));
    sheet.append(def);
  } else sheet.append(el('p', 'kp-sheet-none', f.word || f.entry ? NO_JA : NOT_FOUND));
  if (f.en) sheet.append(fold('kp-f-gloss kp-sheet-en', '英語', ctx.prefs.gloss === 'show', englishLine('kp-gloss', f.en)));
  if (depth >= SHEET_DEPTH) sheet.append(el('p', 'kp-sheet-stop', STOP_HERE));
  if (f.word) sheet.append(el('p', 'kp-sheet-indeck', IN_DECK));
  else if (f.entry) {
    sheet.append(takeBlock(f));
    // the corridor's own entry: every sense, examples, its kanji (it leaves the card for a moment)
    sheet.append(btn('kp-link kp-sheet-full', '辞書の全項目を開く', () => {
      const entry = f.entry;
      closeSheet();
      ctx.host.open(entry);
    }, { id: 'kp-sheet-full' }));
  }
  wrap.append(sheet);
  return wrap;
}

/** 覚える is the corridor's one save path (STANDARD A51): one tap writes the word to 覚えるの札
 * through the host, the corridor shows its Saved toast with 元に戻す, and nothing is asked first.
 * Once saved, リストに追加… opens the corridor's own list popover; a list is optional. */
function takeBlock(f) {
  const box = el('div', 'kp-take-box');
  if (ui.sheet.note) box.append(el('p', 'kp-sheet-note', ui.sheet.note));
  if (safely(() => !!ctx.host.isTaken(f.entry), false)) {
    box.append(el('p', 'kp-sheet-taken', '✓ 覚えるの札にあります'));
    if (typeof ctx.host.addToList === 'function') {
      const add = btn('kp-link kp-take-list', 'リストに追加…', () => {
        safely(() => ctx.host.addToList(f.entry, add), null);
      }, { id: 'kp-take-list', 'aria-haspopup': 'dialog' });
      box.append(add);
    }
    return box;
  }
  const take = btn('kp-take', '覚える', async () => {
    if (ui.sheet?.busy) return;
    const sheetNow = ui.sheet;
    sheetNow.busy = true;
    take.disabled = true;
    const ok = await takeEntry(f.entry);
    sheetNow.busy = false;
    if (ui.sheet !== sheetNow) return; // the sheet closed or moved on while the corridor saved
    ui.sheet.note = ok ? '' : '保存できませんでした';
    drawSheet({ focus: false });
  }, { id: 'kp-take' });
  box.append(take, el('p', 'kp-take-note', TAKE_NOTE));
  return box;
}
/** 覚えるの札, through the host (the corridor's guarded one-tap save) */
async function takeEntry(entry) {
  try {
    return !!(await ctx.host.take(entry));
  } catch {
    return false;
  }
}

/* -------- the popover (no host: the standalone study pages) */
function openPop(frame, node) {
  ui.pop = { frame, node };
  drawPop();
}
function closePop() {
  ui.pop = null;
  ctx.root.querySelector('.kp-pop')?.remove();
}
function drawPop() {
  ctx.root.querySelector('.kp-pop')?.remove();
  if (!ui.pop) return;
  const f = ui.pop.frame;
  const pop = el('div', 'kp-pop');
  pop.id = 'kp-pop';
  pop.lang = 'ja';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-labelledby', 'kp-pop-term');
  pop.dataset.key = f.key;
  const term = el('b', 'kp-pop-term', f.label);
  term.id = 'kp-pop-term';
  pop.append(el('div', 'kp-pop-head', term, f.reading && f.reading !== f.label ? el('span', 'kp-pop-reading', f.reading) : null, btn('kp-pop-x', '×', closePop, { id: 'kp-pop-close', 'aria-label': '閉じる' })));
  if (f.ja) pop.append(el('p', 'kp-pop-def', f.ja));
  if (f.en) pop.append(fold('kp-pop-en', '英語', ctx.prefs.gloss === 'show', englishLine('kp-gloss', f.en)));
  pop.append(el('p', 'kp-pop-note', NO_TAKE_HERE));
  pop.addEventListener('click', (e) => e.stopPropagation());
  pop.addEventListener('toggle', placePop, true);
  ctx.root.append(pop);
  placePop();
}
/** under the tapped word (above it when the grade bar is in the way), inside the screen */
function placePop() {
  const pop = ctx?.root?.querySelector('.kp-pop');
  const node = ui.pop?.node;
  if (!pop) return;
  if (!node?.isConnected) return closePop();
  const r = node.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const bar = ctx.root.querySelector('.kp-grades');
  const floor = Math.min(innerHeight, bar && getComputedStyle(bar).position === 'fixed' ? bar.getBoundingClientRect().top : innerHeight) - 8;
  let top = r.bottom + 8;
  if (top + h > floor && r.top - 8 - h >= 8) top = r.top - 8 - h;
  pop.style.left = `${Math.max(16, Math.min(innerWidth - 16 - w, r.left + r.width / 2 - w / 2))}px`;
  pop.style.top = `${Math.max(8, top)}px`;
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
  for (const s of face.querySelectorAll('.kp-folds > details > summary')) {
    const r = s.getBoundingClientRect();
    const [rTop, rBottom] = [r.top - lift - dy, r.bottom - lift - dy];
    if (!(rTop < barTop && rBottom > barTop)) continue;
    // rows touch, so the edge goes exactly at the bar: the next (or the previous) row is then whole
    const intoView = rBottom - barTop + 1; // scroll down: the row just above the bar
    const underBar = barTop - rTop; // scroll up: the row wholly under the bar
    if (top - dy - intoView >= topLimit && dy + intoView <= room.down) dy += intoView;
    else if (bottom - dy + underBar <= bottomLimit && dy - underBar >= room.up) dy -= underBar;
    break;
  }
  if (Math.abs(dy) < 1) return;
  window.scrollTo({ top: window.scrollY + dy, behavior: motionOk() ? 'smooth' : 'instant' });
}
/** the height of a header the host pins over the top of the page (the corridor's chrome); with
 * none, the study top bar pins itself (player.css, data-host none): where it rests once stuck */
function topInset() {
  let n = document.elementFromPoint(innerWidth / 2, 1);
  while (n && n !== document.body && !ctx.root.contains(n)) {
    const pos = getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'sticky') return Math.max(0, n.getBoundingClientRect().bottom);
    n = n.parentElement;
  }
  const own = ctx.root.querySelector('.kp-top-study');
  const cs = own && getComputedStyle(own);
  return cs?.position === 'sticky' ? (parseFloat(cs.top) || 0) + own.offsetHeight : 0;
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
  const sentence = sentenceNodes(card, { split: passage, clamp: passage, taps: backTaps(card, word) });
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
  // the words looked up since stay looked up: undo takes back answers and repairs, not lookups
  const restored = { ...ui.undo.state, lookups: ctx.state.lookups || [] };
  if (!save(restored)) return saveFailed();
  ui.toast = '';
  ctx.state = restored;
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
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    dy = 0;
  });
  face.addEventListener('pointermove', (e) => {
    if (x0 === null || e.pointerId !== pid) return;
    dx = e.clientX - x0;
    dy = e.clientY - y0;
    // captured once the finger travels, not on the press: a tap on a word of the back stays a
    // click on that word (STANDARD A44), and a release outside the card still ends the swipe here
    if (Math.hypot(dx, dy) > 8 && !face.hasPointerCapture?.(pid)) {
      try {
        face.setPointerCapture(pid);
      } catch {
        /* a pointer the browser no longer tracks */
      }
    }
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
  // an open sheet or popover takes the keys: Escape closes it, and nothing grades behind it
  if (ui.sheet || ui.pop) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (ui.sheet) closeSheet();
      else closePop();
    }
    return;
  }
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
    deckKey: deckId,
    index,
    storage,
    onLeave,
    openEntry: typeof openEntry === 'function' ? openEntry : lexicon ? (node) => lexicon.open(node) : null,
    host: lexicon,
    // the tap source: with a host, the tokens side file (fetched once a sitting starts); without
    // one, the page's built-in gloss map of this deck's own words (STANDARD A44)
    tokenFile: lexicon ? tokensReady.get(deckId) || null : null,
    gloss: lexicon ? null : glossFor(deckId, deck),
    prefs: prefsFor(storage, deck),
  };
  root.addEventListener('pointerdown', onDown, true);
  ({ state: ctx.state, notice: ctx.notice } = loadState(storage, deck));
  if (!sameDeck) {
    ui.screen = 'home';
    ui.queue = [];
    ui.sheet = null;
  }
  if (!keyBound) {
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', () => ui.pop && placePop(), { passive: true });
    keyBound = true;
  }
  if (ui.screen === 'study') wantTokens();
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
