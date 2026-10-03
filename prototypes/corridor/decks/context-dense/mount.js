/**
 * Study surface for the context-dense deck.
 *
 * The corridor and standalone.html both call render(). Schedule state stays
 * in this deck's own localStorage key, not in the corridor learner store.
 *
 * The page follows the backs of Core / Yomitan cards (the whole reading in
 * furigana), an MCD front (one gap in the sentence), and the corridor seals.
 */
import { basicTsv, counts, createScheduler, emptyState, grade, normalizeState, paragraphOf, studyQueue, validateDeck, RATINGS, codePoints } from './engine.js';

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
const lookKey = `${storageKey}:look`;

const THEMES = [
  ['kinari', '生成り', '#f3ecdf'],
  ['torinoko', '鳥の子', '#f8f1dc'],
  ['gekkou', '月光', '#f3f5f4'],
  ['sakura', '薄桜', '#fbf4f4'],
  ['wakakusa', '若草', '#f2f6ec'],
  ['aijiro', '藍白', '#eef3f6'],
  ['gofun', '胡粉', '#f7f5f1'],
  ['tan', '淡黄', '#fbf6e4'],
  ['asagi', '浅葱', '#e7f2ef'],
  ['momo', '桃色', '#fff5ee'],
];

const lexicon = [...deck.cards].sort((a, b) => b.target.length - a.target.length || a.id.localeCompare(b.id));

const ui = {
  screen: 'home',
  queue: [],
  index: 0,
  phase: 'declare',
  previewId: null,
  missed: false,
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

function loadLook(storage) {
  const base = { theme: 'kinari', vertical: null, english: false };
  try {
    return { ...base, ...JSON.parse(storage.getItem(lookKey) || '{}') };
  } catch {
    return base;
  }
}

function saveLook(storage, look) {
  storage.setItem(lookKey, JSON.stringify(look));
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
  const role = /(?:^|\s)(?:cd-btn|cd-choice|cd-seal)(?:\s|$)/u.test(className || '')
    ? (className.includes('cd-primary') || className.includes('cd-seal-good') ? 'chip btn-primary' : 'chip btn-secondary') : '';
  const node = h('button', `${className || ''} ${role}`.trim(), label);
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

function readingsOf(card) {
  const list = card.readings?.length ? card.readings : [card.reading];
  return [...new Set(list.filter(Boolean))];
}

function isSingleKanji(text) {
  return /^\p{Script=Han}$/u.test(text);
}

function gapNode(card) {
  const gap = h('span', 'cd-gap');
  const sizer = h('span', 'cd-sizer', card.target);
  sizer.setAttribute('aria-hidden', 'true');
  gap.append(sizer);
  gap.append(h('span', 'cd-gap-line'));
  const note = h('span', 'cd-footnote', `${codePoints(card.target).length}字`);
  gap.append(note);
  gap.setAttribute('aria-label', '空欄');
  return gap;
}

function rubyNode(text, reading, { primary = false, missed = false } = {}) {
  const ruby = document.createElement('ruby');
  ruby.className = primary ? 'cd-ruby cd-ruby-target' : 'cd-ruby';
  if (missed && primary) ruby.classList.add('cd-miss');
  const ink = h('span', 'cd-ink', text);
  const rt = document.createElement('rt');
  rt.textContent = reading;
  ruby.append(ink, rt);
  return ruby;
}

/** Furigana for every deck word in the sentence. The card's own target wins its span. */
function rubyParagraph(paragraph, card, missed) {
  const taken = new Array(paragraph.length).fill(false);
  const spans = [];
  const own = paragraph.indexOf(card.target);
  if (own >= 0) {
    spans.push({ start: own, end: own + card.target.length, reading: card.reading, primary: true });
    for (let i = own; i < own + card.target.length; i += 1) taken[i] = true;
  }
  for (const entry of lexicon) {
    if (entry.target === card.target) continue;
    let from = 0;
    while (from < paragraph.length) {
      const at = paragraph.indexOf(entry.target, from);
      if (at < 0) break;
      const end = at + entry.target.length;
      let blocked = false;
      for (let i = at; i < end; i += 1) {
        if (taken[i]) blocked = true;
      }
      if (!blocked) {
        spans.push({ start: at, end, reading: entry.reading, primary: false });
        for (let i = at; i < end; i += 1) taken[i] = true;
      }
      from = at + entry.target.length;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) frag.append(document.createTextNode(paragraph.slice(cursor, span.start)));
    frag.append(rubyNode(paragraph.slice(span.start, span.end), span.reading, { primary: span.primary, missed }));
    cursor = span.end;
  }
  if (cursor < paragraph.length) frag.append(document.createTextNode(paragraph.slice(cursor)));
  return frag;
}

function sentenceNode(card, revealed, missed) {
  const line = h('p', revealed ? 'cd-backline cd-write' : 'cd-front');
  if (!revealed) {
    const text = paragraphOf(card);
    const at = text.indexOf(card.target);
    line.append(document.createTextNode(text.slice(0, at)));
    line.append(gapNode(card));
    line.append(document.createTextNode(text.slice(at + card.target.length)));
    return line;
  }
  if (missed) line.append(h('span', 'cd-dot'));
  line.append(rubyParagraph(paragraphOf(card), card, missed));
  return line;
}

function stackEl(remaining) {
  const stack = h('div', 'cd-stack');
  stack.setAttribute('aria-label', `${remaining}`);
  const n = Math.min(12, Math.max(remaining, 1));
  for (let i = 0; i < n; i += 1) stack.append(h('i'));
  return stack;
}

function sheet(card, revealed, missed, remaining) {
  const wrap = h('div', 'cd-sheet');
  wrap.append(stackEl(remaining));
  const column = h('div', 'cd-column');
  column.append(sentenceNode(card, revealed, missed));
  wrap.append(column);
  wrap.append(h('div', 'cd-rule'));
  return { wrap, column };
}

function showAnswer(host, opts, state, missed) {
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

function applyLook(room, look, writing) {
  room.dataset.theme = look.theme;
  room.dataset.writing = writing;
  document.documentElement.dataset.cdTheme = look.theme;
  const theme = THEMES.find(([id]) => id === look.theme);
  document.documentElement.style.setProperty('--cd-paper', theme ? theme[2] : '#f3ecdf');
}

function writingMode(look) {
  if (look.vertical === true) return 'vertical';
  if (look.vertical === false) return 'horizontal';
  return window.innerWidth < 720 ? 'vertical' : 'horizontal';
}

function paint(host, opts, state) {
  const storage = opts.storage;
  const look = loadLook(storage);
  const writing = writingMode(look);
  host.replaceChildren();
  const room = h('section', 'cd-room');
  room.lang = 'ja';
  room.dataset.deck = deck.id;
  applyLook(room, look, writing);
  document.documentElement.dataset.cdFocus = ui.screen === 'card' ? '1' : '0';

  const level = h('span', 'level-chip cd-level', opts.bilingual ? '級未判定 · Level ungraded' : '級未判定');
  level.title = opts.bilingual ? 'This deck has no assigned JLPT level.' : 'この札にはJLPTの級がまだ付いていない。';
  room.append(level);

  if (ui.screen === 'home') paintHome(room, opts, state, look);
  else if (ui.screen === 'card') paintCard(room, opts, state, look);
  else if (ui.screen === 'done') paintDone(room, opts);
  else if (ui.screen === 'index') paintIndex(room, opts, state);
  else if (ui.screen === 'preview') paintPreview(room, opts, look);
  host.append(room);
}

function paintHome(room, opts, state, look) {
  const now = new Date();
  const tally = counts(deck, state, now);
  room.append(h('h1', 'cd-title', '文脈札'));
  room.append(h('p', 'cd-lead', '一段落。空欄は一語。裏で、読みが全文につく。'));
  const list = h('ul', 'cd-counts');
  for (const [ja, value] of [
    ['札', tally.total],
    ['今日出せる', tally.newToday],
    ['期限', tally.due],
    ['未学習', tally.unseen],
  ]) {
    list.append(h('li', null, `${ja} ${value}`));
  }
  room.append(list);

  const swatches = h('div', 'cd-swatches');
  for (const [id, name, color] of THEMES) {
    const dot = button('', 'cd-swatch', () => {
      saveLook(opts.storage, { ...loadLook(opts.storage), theme: id });
      paint(opts.host, opts, state);
    });
    dot.style.background = color;
    dot.setAttribute('aria-label', name);
    dot.setAttribute('aria-pressed', String(look.theme === id));
    swatches.append(dot);
  }
  room.append(swatches);

  const tools = h('div', 'cd-tools');
  tools.append(button(writingMode(look) === 'vertical' ? '横書き' : '縦書き', 'cd-btn', () => {
    const current = loadLook(opts.storage);
    const vertical = writingMode(current) !== 'vertical';
    saveLook(opts.storage, { ...current, vertical });
    paint(opts.host, opts, state);
  }));
  tools.append(button(look.english ? '英語を隠す' : '英語を出す', 'cd-btn', () => {
    const current = loadLook(opts.storage);
    saveLook(opts.storage, { ...current, english: !current.english });
    paint(opts.host, opts, state);
  }));
  room.append(tools);

  const actions = h('div', 'cd-actions');
  const start = button('今日の札', 'cd-btn cd-primary', () => {
    const queue = studyQueue(deck, loadState(opts.storage), new Date());
    ui.queue = queue.queue;
    ui.index = 0;
    ui.phase = 'declare';
    ui.screen = queue.queue.length ? 'card' : 'done';
    paint(opts.host, opts, loadState(opts.storage));
  });
  start.id = 'cd-start';
  actions.append(start);
  actions.append(button('目次', 'cd-btn', () => {
    ui.screen = 'index';
    paint(opts.host, opts, state);
  }));
  if (opts.onLeave) actions.append(button('本棚へ', 'cd-btn', () => opts.onLeave()));
  room.append(actions);

  const io = h('div', 'cd-actions');
  io.append(button('台帳を書き出す', 'cd-btn', () => {
    download(`${deck.id}-state.json`, `${JSON.stringify(loadState(opts.storage), null, 2)}\n`, 'application/json');
  }));
  io.append(button('Anki用の札', 'cd-btn', () => {
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
      saveState(opts.storage, incoming);
      paint(opts.host, opts, incoming);
    } catch {
      /* a file that is not this deck's ledger is ignored */
    }
  });
  io.append(button('台帳を読み込む', 'cd-btn', () => file.click()), file);
  room.append(io);
}

function paintCard(room, opts, state, look) {
  const card = ui.queue[ui.index];
  const revealed = ui.phase === 'answer';
  const page = sheet(card, revealed, ui.missed, ui.queue.length - ui.index);
  room.append(page.wrap);

  if (!revealed) {
    const actions = h('div', 'cd-dock');
    const got = button('思い出せた', 'cd-choice cd-primary', () => showAnswer(opts.host, opts, state, false));
    const miss = button('まだ', 'cd-choice', () => showAnswer(opts.host, opts, state, true));
    got.id = 'cd-got';
    miss.id = 'cd-miss';
    actions.append(got, miss);
    room.append(actions);
    return;
  }

  const readings = readingsOf(card);
  const readingLine = h('p', 'cd-readings', readings.join('・'));
  readingLine.lang = 'ja';
  page.column.append(readingLine);
  page.column.append(h('p', 'cd-gloss', card.glossJa));
  if (look.english) page.column.append(h('p', 'cd-en', card.glossEn));
  if (card.note) page.column.append(h('p', 'cd-note', card.note));
  if (card.seeAlso?.length) {
    const names = card.seeAlso.map((id) => cardById(id)?.target).filter(Boolean);
    if (names.length) {
      const meta = h('p', 'cd-meta');
      meta.append(h('span', 'cd-pair', '同'));
      meta.append(document.createTextNode(names.join('、')));
      page.column.append(meta);
    }
  }
  if (isSingleKanji(card.target)) {
    const plate = rubyNode(card.target, readings.join('・'), { primary: true, missed: ui.missed });
    plate.classList.add('cd-plate');
    page.column.append(plate);
  }

  const grades = h('div', 'cd-dock cd-grades');
  const seal = (glyph, className, id, rating, label) => {
    const node = button(glyph, `cd-seal ${className}`, () => commit(opts.host, opts, state, rating));
    node.id = id;
    node.setAttribute('aria-label', label);
    return node;
  };
  if (ui.missed) {
    grades.append(seal('再', 'cd-seal-again', 'cd-again', RATINGS.again, 'もう一度'));
  } else {
    grades.append(
      seal('再', 'cd-seal-again', 'cd-again', RATINGS.again, 'もう一度'),
      seal('難', 'cd-seal-hard', 'cd-hard', RATINGS.hard, '難しい'),
      seal('良', 'cd-seal-good', 'cd-good', RATINGS.good, '普通'),
      seal('易', 'cd-seal-easy', 'cd-easy', RATINGS.easy, '易しい'),
    );
  }
  room.append(grades);
}

function paintDone(room, opts) {
  room.append(h('h1', 'cd-title', '今日の分はここまで'));
  const actions = h('div', 'cd-actions');
  actions.append(button('戻る', 'cd-btn cd-primary', () => {
    ui.screen = 'home';
    paint(opts.host, opts, loadState(opts.storage));
  }));
  room.append(actions);
}

function paintIndex(room, opts, state) {
  room.append(h('h1', 'cd-title', '目次'));
  const now = new Date();
  const list = h('ol', 'cd-toc');
  deck.cards.forEach((card, index) => {
    const stored = state.cards[card.id];
    const due = stored && new Date(stored.due).getTime() <= now.getTime();
    const item = h('li', due ? 'cd-due' : stored ? 'cd-known' : 'cd-unseen');
    const open = button('', 'cd-toc-row', () => {
      ui.previewId = card.id;
      ui.screen = 'preview';
      paint(opts.host, opts, state);
    });
    open.append(h('span', 'cd-toc-n', String(index + 1)));
    open.append(h('span', 'cd-toc-word', card.target));
    if (due) open.append(h('span', 'cd-toc-due', '今'));
    item.append(open);
    list.append(item);
  });
  room.append(list);
  room.append(button('戻る', 'cd-btn', () => {
    ui.screen = 'home';
    paint(opts.host, opts, state);
  }));
}

function paintPreview(room, opts, look) {
  const card = cardById(ui.previewId);
  if (!card) {
    ui.screen = 'index';
    paint(opts.host, opts, loadState(opts.storage));
    return;
  }
  const page = sheet(card, true, false, 1);
  room.append(page.wrap);
  page.column.append(h('p', 'cd-readings', readingsOf(card).join('・')));
  page.column.append(h('p', 'cd-gloss', card.glossJa));
  if (look.english) page.column.append(h('p', 'cd-en', card.glossEn));
  room.append(button('目次へ', 'cd-btn', () => {
    ui.screen = 'index';
    paint(opts.host, opts, loadState(opts.storage));
  }));
}

function ensureCss() {
  if (!document.querySelector('link[data-context-fonts]')) {
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = new URL('../../fonts.css', import.meta.url).href;
    fonts.dataset.contextFonts = '1';
    document.head.append(fonts);
  }
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
