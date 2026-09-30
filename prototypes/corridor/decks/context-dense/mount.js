/**
 * Study surface for the context-dense deck.
 *
 * The corridor and standalone.html both call render(). Schedule state stays
 * in this deck's own localStorage key, not in the corridor learner store.
 */
import { basicTsv, clozeParagraph, counts, createScheduler, emptyState, grade, markedParagraph, normalizeState, paragraphOf, studyQueue, validateDeck, RATINGS, codePoints } from './engine.js';

const deck = await fetch(new URL('./deck.json', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('context deck could not be read');
  return response.json();
});
const pin = await fetch(new URL('../../data/fsrs-pin.json', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('scheduler pin could not be read');
  return response.json();
});
const fsrsApi = await import('../../vendor/ts-fsrs.mjs');
const problems = validateDeck(deck);
if (problems.length) throw new Error(problems[0]);
const scheduler = createScheduler(fsrsApi, pin);
const storageKey = `bunki-srs-deck:${deck.id}`;

const ui = {
  screen: 'home',
  queue: [],
  index: 0,
  phase: 'declare',
  previewId: null,
};

function loadState(storage) {
  try {
    return normalizeState(JSON.parse(storage.getItem(storageKey) || 'null'), deck);
  } catch {
    return emptyState(deck.id);
  }
}

function saveState(storage, state) {
  storage.setItem(storageKey, JSON.stringify(state));
}

function cardById(id) {
  return deck.cards.find((card) => card.id === id) ?? null;
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const node = h('button', `cd-btn ${className || ''}`.trim(), label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function frontNodes(card) {
  const front = clozeParagraph(paragraphOf(card), card.target);
  const open = front.indexOf('［');
  const close = front.indexOf('］');
  const wrap = document.createDocumentFragment();
  wrap.append(document.createTextNode(front.slice(0, open)));
  const mark = h('span', 'cd-blank', front.slice(open, close + 1));
  mark.setAttribute('aria-label', '空欄');
  wrap.append(mark);
  wrap.append(document.createTextNode(front.slice(close + 1)));
  return wrap;
}

function showAnswer(host, opts, state, card, missed) {
  ui.phase = 'answer';
  ui.missed = missed;
  paint(host, opts, state);
}

function commit(host, opts, state, rating) {
  const card = ui.queue[ui.index];
  const next = grade(fsrsApi, scheduler, state, card.id, rating, new Date());
  saveState(opts.storage, next);
  ui.index += 1;
  ui.phase = 'declare';
  ui.missed = false;
  if (ui.index >= ui.queue.length) ui.screen = 'done';
  paint(host, opts, next);
}

function paint(host, opts, state) {
  const bi = opts.bilingual !== false;
  host.replaceChildren();
  const room = h('section', 'cd-room');
  room.lang = 'ja';
  room.dataset.deck = deck.id;
  const kicker = h('p', 'cd-kicker', '文脈札');
  if (bi) {
    const en = h('span', 'cd-en', deck.titleEn);
    kicker.append(en);
  }
  room.append(kicker);

  if (ui.screen === 'home') paintHome(room, opts, state, bi);
  else if (ui.screen === 'card') paintCard(room, opts, state, bi);
  else if (ui.screen === 'done') paintDone(room, opts, bi);
  else if (ui.screen === 'index') paintIndex(room, opts, bi);
  else if (ui.screen === 'preview') paintPreview(room, opts, bi);
  host.append(room);
}

function paintHome(room, opts, state, bi) {
  const now = new Date();
  const tally = counts(deck, state, now);
  room.append(h('h1', 'cd-title', deck.titleJa));
  const lead = h('p', 'cd-lead', '一段落の中に、空欄は一語だけ。思い出してから裏を見る。');
  if (bi) lead.append(h('span', 'cd-en', 'One paragraph, one blank. Decide whether you recall it before the back is shown.'));
  room.append(lead);
  const list = h('ul', 'cd-counts');
  for (const [ja, en, value] of [
    ['札', 'cards', tally.total],
    ['今日出せる', 'new left today', tally.newToday],
    ['期限', 'due', tally.due],
    ['未学習', 'unseen', tally.unseen],
  ]) {
    const item = h('li', null, `${ja} ${value}`);
    if (bi) item.append(h('span', 'cd-en', en));
    list.append(item);
  }
  room.append(list);
  const actions = h('div', 'cd-actions');
  const start = button('今日の札', 'cd-primary', () => {
    const queue = studyQueue(deck, loadState(opts.storage), new Date());
    ui.queue = queue.queue;
    ui.index = 0;
    ui.phase = 'declare';
    ui.screen = queue.queue.length ? 'card' : 'done';
    paint(opts.host, opts, loadState(opts.storage));
  });
  start.id = 'cd-start';
  actions.append(start);
  actions.append(button('札の一覧', '', () => {
    ui.screen = 'index';
    paint(opts.host, opts, state);
  }));
  if (opts.onLeave) {
    actions.append(button('本棚へ', '', () => opts.onLeave()));
  }
  room.append(actions);
  room.append(h('p', 'cd-note', 'この台帳は、本棚の復習とは別です。札の本文はフォルダごと、ほかの道具へ持ち出せます。'));
  const io = h('div', 'cd-actions');
  io.append(button('台帳を書き出す', '', () => {
    download(`${deck.id}-state.json`, `${JSON.stringify(loadState(opts.storage), null, 2)}\n`, 'application/json');
  }));
  io.append(button('Anki用の札', '', () => {
    download(`${deck.id}-basic.tsv`, basicTsv(deck), 'text/tab-separated-values');
  }));
  const file = h('input', 'cd-file');
  file.type = 'file';
  file.accept = 'application/json';
  file.id = 'cd-import';
  file.addEventListener('change', async () => {
    const text = await file.files?.[0]?.text();
    if (!text) return;
    try {
      const incoming = normalizeState(JSON.parse(text), deck);
      if (incoming.deckId !== deck.id) return;
      saveState(opts.storage, incoming);
      paint(opts.host, opts, incoming);
    } catch {
      /* a file that is not this deck's ledger is ignored */
    }
  });
  const importBtn = button('台帳を読み込む', '', () => file.click());
  io.append(importBtn, file);
  room.append(io);
}

function paintCard(room, opts, state, bi) {
  const card = ui.queue[ui.index];
  room.append(h('p', 'cd-progress', `${ui.index + 1} / ${ui.queue.length}`));
  const front = h('p', 'cd-front');
  front.append(frontNodes(card));
  room.append(front);
  room.append(h('p', 'cd-hint', `${codePoints(card.target).length}字`));
  if (ui.phase === 'declare') {
    const actions = h('div', 'cd-actions');
    const got = button('思い出せた', 'cd-primary', () => showAnswer(opts.host, opts, state, card, false));
    const miss = button('まだ', '', () => showAnswer(opts.host, opts, state, card, true));
    got.id = 'cd-got';
    miss.id = 'cd-miss';
    actions.append(got, miss);
    room.append(actions);
    return;
  }
  room.append(h('p', 'cd-target', card.target));
  room.append(h('p', 'cd-reading', (card.readings || [card.reading]).join('・')));
  room.append(h('p', 'cd-gloss', card.glossJa));
  if (bi) room.append(h('p', 'cd-en', card.glossEn));
  const full = h('p', 'cd-full');
  const parts = markedParagraph(paragraphOf(card), card.target);
  full.append(document.createTextNode(parts.before), h('span', 'cd-mark', parts.target), document.createTextNode(parts.after));
  room.append(full);
  if (card.note) room.append(h('p', 'cd-note', card.note));
  if (card.seeAlso?.length) {
    const names = card.seeAlso.map((id) => cardById(id)?.target).filter(Boolean);
    if (names.length) room.append(h('p', 'cd-meta', `同じ読み・関連: ${names.join('、')}`));
  }
  const grades = h('div', 'cd-grades');
  if (ui.missed) {
    const next = button('次へ', 'cd-primary', () => commit(opts.host, opts, state, RATINGS.again));
    next.id = 'cd-again';
    grades.append(next);
  } else {
    const wrong = button('違った', '', () => commit(opts.host, opts, state, RATINGS.again));
    const hard = button('難しい', '', () => commit(opts.host, opts, state, RATINGS.hard));
    const good = button('普通', 'cd-primary', () => commit(opts.host, opts, state, RATINGS.good));
    const easy = button('易しい', '', () => commit(opts.host, opts, state, RATINGS.easy));
    wrong.id = 'cd-again';
    good.id = 'cd-good';
    grades.append(wrong, hard, good, easy);
  }
  room.append(grades);
}

function paintDone(room, opts, bi) {
  room.append(h('h1', 'cd-title', '今日の分はここまで'));
  if (bi) room.append(h('p', 'cd-en', 'Nothing else is due in this sitting.'));
  const actions = h('div', 'cd-actions');
  actions.append(button('戻る', 'cd-primary', () => {
    ui.screen = 'home';
    paint(opts.host, opts, loadState(opts.storage));
  }));
  room.append(actions);
}

function paintIndex(room, opts, bi) {
  room.append(h('h1', 'cd-title', '札の一覧'));
  if (bi) room.append(h('p', 'cd-en', 'Looking is not a review. Nothing here is graded.'));
  const list = h('ul', 'cd-list');
  for (const card of deck.cards) {
    const item = h('li');
    const open = button(`${card.target}　${card.reading}`, '', () => {
      ui.previewId = card.id;
      ui.screen = 'preview';
      paint(opts.host, opts, loadState(opts.storage));
    });
    item.append(open);
    list.append(item);
  }
  room.append(list);
  room.append(button('戻る', '', () => {
    ui.screen = 'home';
    paint(opts.host, opts, loadState(opts.storage));
  }));
}

function paintPreview(room, opts, bi) {
  const card = cardById(ui.previewId);
  if (!card) {
    ui.screen = 'index';
    paint(opts.host, opts, loadState(opts.storage));
    return;
  }
  const front = h('p', 'cd-front');
  front.append(frontNodes(card));
  room.append(front, h('p', 'cd-target', card.target), h('p', 'cd-reading', card.reading), h('p', 'cd-gloss', card.glossJa));
  if (bi) room.append(h('p', 'cd-en', card.glossEn));
  const full = h('p', 'cd-full', paragraphOf(card));
  room.append(full);
  room.append(button('一覧へ', '', () => {
    ui.screen = 'index';
    paint(opts.host, opts, loadState(opts.storage));
  }));
}

function ensureCss() {
  if (document.querySelector('link[data-context-deck]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./context-deck.css', import.meta.url).href;
  link.dataset.contextDeck = '1';
  document.head.append(link);
}

export function render(host, opts = {}) {
  ensureCss();
  const storage = opts.storage || localStorage;
  const state = loadState(storage);
  paint(host, { ...opts, host, storage }, state);
}
