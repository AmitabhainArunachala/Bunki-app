/**
 * Study surface for the context-dense deck.
 *
 * The corridor and standalone.html both call render(). Schedule state stays
 * in this deck's own localStorage key, not in the corridor learner store.
 *
 * The page follows the backs of Core / Yomitan cards (the whole reading in
 * furigana), an MCD front (one gap in the sentence), and the corridor seals.
 */
import { admitContextGrade, basicTsv, buriedToday, buriedWords, closeLines, counts, createScheduler, emptyState, grade, LEARN_AHEAD_MS, nextStep, normalizeState, paragraphOf, pauseWords, preview, refusalWords, servable, sittingTally, studyQueue, validateDeck, waitWords, RATINGS, codePoints } from './engine.js';

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

// the sitting follows srs-core's rule (Anki's order): log — this sitting's answers, for the close; ahead — the learner
// chose to review learning steps early; early — the card on screen came by that choice; pause — nothing else is left but
// cards in a learning step; shown — the card's stored record when it was put on screen (a grade refuses if another window
// changed it since)
const ui = {
  screen: 'home',
  queue: [],
  index: 0,
  phase: 'declare',
  previewId: null,
  missed: false,
  log: [],
  started: 0,
  ahead: false,
  early: false,
  pause: null,
  shown: 'null',
  buried: 0,
  storage: null,
};
let pauseTimer = null;
let paintedTurn = null;
let english = false;
const t = (ja, en) => english ? en : ja;

function loadState(storage) {
  try {
    return normalizeState(JSON.parse(storage.getItem(storageKey) || 'null'), deck);
  } catch {
    return emptyState(deck.id);
  }
}

/** true when stored; a full storage leaves the ledger as it was */
function saveState(storage, state) {
  try {
    storage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

const isStep = (stored) => !!stored && (stored.state === 1 || stored.state === 3);
/**
 * Put the sitting's next card at ui.index by srs-core's rule: a learning step that is due now; else the next waiting
 * card that may be answered now; else, with nothing else left, the steps still to come — early only by the learner's
 * choice (ui.ahead), otherwise the close pauses on them and offers that choice. A waiting card another window has
 * answered meanwhile leaves the sitting.
 */
function settle(state, now = new Date()) {
  const waiting = [];
  // a word answered on another surface today rests until tomorrow (a card in its learning steps keeps them)
  const rests = ui.storage ? buriedToday(ui.storage, now) : () => false;
  for (const card of ui.queue.slice(ui.index)) {
    if (waiting.includes(card) || isStep(state.cards[card.id]) || !servable(state.cards[card.id], now)) continue;
    if (rests(card)) {
      ui.buried += 1;
      continue;
    }
    waiting.push(card);
  }
  const queued = new Set(waiting.map((card) => card.id));
  const learning = deck.cards.filter((card) => isStep(state.cards[card.id]) && !queued.has(card.id)).map((card) => ({ id: card.id, due: Date.parse(state.cards[card.id].due) }));
  const step = nextStep({ now, queue: waiting.map((card) => card.id), learning, ahead: ui.ahead });
  ui.queue = [...ui.queue.slice(0, ui.index), ...waiting];
  ui.early = false;
  ui.pause = null;
  if (step.show) {
    const card = cardById(step.show);
    ui.queue = [...ui.queue.slice(0, ui.index), card, ...waiting.filter((c) => c !== card)];
    ui.early = step.early;
    ui.shown = JSON.stringify(state.cards[step.show] ?? null);
    ui.screen = 'card';
  } else {
    if (step.pause) ui.pause = { ...step };
    ui.screen = 'done';
  }
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
  gap.setAttribute('aria-label', t('空欄', 'blank'));
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
  ui.refusal = '';
  ui.missed = missed;
  paint(host, opts, state);
}

/**
 * One answer, fresh-read-then-write: graded on the ledger as it is stored now (another window's grades are kept), and
 * only if the card is still the one put on screen and may be answered now (srs-core's gate); otherwise nothing is
 * graded and the sitting moves on. It runs under the shared answer admission (one Web Lock; today's answered words read
 * again; the word's mark reserved before the save): a word answered on another surface since the card was shown leaves
 * the sitting, and a refused grade keeps the card on screen with one plain line — practice continues.
 */
async function commit(host, opts, state, rating) {
  const card = ui.queue[ui.index];
  if (!card || ui.committing) return;
  ui.committing = true;
  let graded;
  try {
    graded = await admitContextGrade({
      locks: globalThis.navigator?.locks || null,
      storage: opts.storage,
      card,
      load: () => loadState(opts.storage),
      save: (next) => saveState(opts.storage, next),
      change: (fresh, now) => {
        const stored = fresh.cards[card.id] ?? null;
        if (JSON.stringify(stored) !== ui.shown || !servable(stored, now, { learnAhead: true })) return null;
        return grade(fsrsApi, opts.scheduler || scheduler, fresh, card.id, rating, now);
      },
    });
  } finally {
    ui.committing = false;
  }
  if (ui.queue[ui.index] !== card) return;
  const { result, fresh, next, now } = graded;
  if (result === 'refused' || result === 'answered-elsewhere') {
    ui.phase = 'declare';
    ui.missed = false;
    ui.refusal = '';
    ui.queue.splice(ui.index, 1);
    settle(fresh, now);
    paint(host, opts, fresh);
    return;
  }
  if (result !== 'graded') {
    ui.phase = 'answer';
    ui.refusal = refusalWords(result === 'failed' ? 'publish-failed' : result, english ? 'en' : 'ja') || '';
    paint(host, opts, fresh || state);
    return;
  }
  ui.phase = 'declare';
  ui.missed = false;
  ui.refusal = '';
  ui.log.push({ word: card.id, before: fresh.cards[card.id]?.state ?? null, rating, early: ui.early });
  ui.index += 1;
  settle(next, now);
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
  english = opts.bilingual === true;
  const turn = `${ui.screen}:${ui.screen === 'card' ? ui.queue[ui.index]?.id : ui.screen === 'preview' ? ui.previewId : ''}`;
  const resetScroll = turn !== paintedTurn;
  const storage = opts.storage;
  const look = loadLook(storage);
  const writing = writingMode(look);
  host.replaceChildren();
  const room = h('section', 'cd-room');
  room.lang = english ? 'en' : 'ja';
  room.dataset.deck = deck.id;
  applyLook(room, look, writing);
  document.documentElement.dataset.cdFocus = ui.screen === 'card' ? '1' : '0';

  const level = h('span', 'level-chip cd-level', t('級未判定', 'Level ungraded'));
  level.title = opts.bilingual ? 'This deck has no assigned JLPT level.' : 'この札にはJLPTの級がまだ付いていない。';
  room.append(level);

  if (ui.screen === 'home') paintHome(room, opts, state, look);
  else if (ui.screen === 'card') paintCard(room, opts, state, look);
  else if (ui.screen === 'done') paintDone(room, opts);
  else if (ui.screen === 'index') paintIndex(room, opts, state);
  else if (ui.screen === 'preview') paintPreview(room, opts, look);
  host.append(room);
  paintedTurn = turn;
  // A new page or card starts below the app header, even after a long index.
  if (resetScroll) window.scrollTo(0, 0);
}

function paintHome(room, opts, state, look) {
  const now = new Date();
  const tally = counts(deck, state, now);
  room.append(h('h1', 'cd-title', t('文脈札', 'Context cards')));
  room.append(h('p', 'cd-lead', t('一段落。空欄は一語。裏で、読みが全文につく。', 'One paragraph, one missing word. Reveal the answer to see readings throughout.')));
  const list = h('ul', 'cd-counts');
  for (const [ja, en, value] of [
    ['札', 'Cards', tally.total],
    ['今日出せる', 'New today', tally.newToday],
    ['期限', 'Due', tally.due],
    ['未学習', 'Unseen', tally.unseen],
  ]) {
    list.append(h('li', null, `${t(ja, en)} ${value}`));
  }
  room.append(list);

  const swatches = h('div', 'cd-swatches');
  for (const [id, name, color] of THEMES) {
    const dot = button('', 'cd-swatch', () => {
      saveLook(opts.storage, { ...loadLook(opts.storage), theme: id });
      paint(opts.host, opts, state);
    });
    dot.style.background = color;
    dot.setAttribute('aria-label', t(name, ({kinari:'Natural paper',torinoko:'Eggshell',gekkou:'Moonlight',sakura:'Pale cherry',wakakusa:'Young grass',aijiro:'Indigo white',gofun:'Chalk white',tan:'Pale yellow',asagi:'Pale blue',momo:'Peach'})[id]));
    dot.setAttribute('aria-pressed', String(look.theme === id));
    swatches.append(dot);
  }
  room.append(swatches);

  const tools = h('div', 'cd-tools');
  tools.append(button(writingMode(look) === 'vertical' ? t('横書き', 'Horizontal text') : t('縦書き', 'Vertical text'), 'cd-btn', () => {
    const current = loadLook(opts.storage);
    const vertical = writingMode(current) !== 'vertical';
    saveLook(opts.storage, { ...current, vertical });
    paint(opts.host, opts, state);
  }));
  tools.append(button(look.english ? t('英語を隠す', 'Hide English') : t('英語を出す', 'Show English'), 'cd-btn', () => {
    const current = loadLook(opts.storage);
    saveLook(opts.storage, { ...current, english: !current.english });
    paint(opts.host, opts, state);
  }));
  room.append(tools);

  const actions = h('div', 'cd-actions');
  const start = button(t('今日の札', 'Today’s cards'), 'cd-btn cd-primary', () => {
    const fresh = loadState(opts.storage);
    ui.queue = studyQueue(deck, fresh, new Date()).queue;
    ui.index = 0;
    ui.phase = 'declare';
    ui.log = [];
    ui.started = Date.now();
    ui.ahead = false;
    ui.buried = 0;
    ui.storage = opts.storage;
    settle(fresh);
    paint(opts.host, opts, fresh);
  });
  start.id = 'cd-start';
  actions.append(start);
  actions.append(button(t('目次', 'Contents'), 'cd-btn', () => {
    ui.screen = 'index';
    paint(opts.host, opts, state);
  }));
  if (opts.onLeave) actions.append(button(t('本棚へ', 'To the shelf'), 'cd-btn', () => opts.onLeave()));
  room.append(actions);

  const io = h('div', 'cd-actions');
  io.append(button(t('台帳を書き出す', 'Export review history'), 'cd-btn', () => {
    download(`${deck.id}-state.json`, `${JSON.stringify(loadState(opts.storage), null, 2)}\n`, 'application/json');
  }));
  io.append(button(t('Anki用の札', 'Export Anki cards'), 'cd-btn', () => {
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
  io.append(button(t('台帳を読み込む', 'Import review history'), 'cd-btn', () => file.click()), file);
  room.append(io);
}

function paintCard(room, opts, state, look) {
  const card = ui.queue[ui.index];
  const revealed = ui.phase === 'answer';
  const page = sheet(card, revealed, ui.missed, ui.queue.length - ui.index);
  room.append(page.wrap);

  if (!revealed) {
    const actions = h('div', 'cd-dock');
    const got = button(t('思い出せた', 'I recalled it'), 'cd-choice cd-primary', () => showAnswer(opts.host, opts, state, false));
    const miss = button(t('まだ', 'Not yet'), 'cd-choice', () => showAnswer(opts.host, opts, state, true));
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

  // a card in its learning steps says so, and one shown early says that it is early and why (lead's ruling 10-19)
  const stored = state.cards[card.id];
  if (ui.early || isStep(stored)) page.column.append(h('p', 'cd-step', ui.early ? t('学習中 · 少し早め（ほかに札がないため）', 'Learning · a few minutes early (nothing else left)') : t('学習中', 'Learning')));
  // a refused grade says so in one plain line; the card stays for practice (HOOKS-SPEC §3.6, lead 0128)
  if (ui.refusal) {
    const note = h('p', 'cd-refusal', ui.refusal);
    note.setAttribute('role', 'status');
    room.append(note);
  }
  const grades = h('div', 'cd-dock cd-grades');
  // each seal names the wait its answer schedules, now (the scheduler's own preview)
  const pv = preview(fsrsApi, opts.scheduler || scheduler, state, card.id, new Date());
  const seal = (glyph, className, id, rating, label) => {
    const node = button(english ? label : glyph, `cd-seal ${className}`, () => commit(opts.host, opts, state, rating));
    node.id = id;
    const wait = waitWords(pv[rating], english ? 'en' : 'ja');
    node.append(h('small', 'cd-seal-t', wait));
    node.setAttribute('aria-label', `${label} · ${wait}`);
    return node;
  };
  if (ui.missed) {
    grades.append(seal('再', 'cd-seal-again', 'cd-again', RATINGS.again, t('もう一度', 'Again')));
  } else {
    grades.append(
      seal('再', 'cd-seal-again', 'cd-again', RATINGS.again, t('もう一度', 'Again')),
      seal('難', 'cd-seal-hard', 'cd-hard', RATINGS.hard, t('難しい', 'Hard')),
      seal('良', 'cd-seal-good', 'cd-good', RATINGS.good, t('普通', 'Good')),
      seal('易', 'cd-seal-easy', 'cd-easy', RATINGS.easy, t('易しい', 'Easy')),
    );
  }
  room.append(grades);
}

function paintDone(room, opts) {
  clearTimeout(pauseTimer);
  room.append(h('h1', 'cd-title', t('今日の分はここまで', 'That’s all for today')));
  const now = new Date();
  const lang = english ? 'en' : 'ja';
  // what the sitting did, every number counted from its own answers (srs-core closeLines)
  if (ui.log.length) for (const line of closeLines(sittingTally(ui.log, { startedAt: ui.started || null, now }), lang)) room.append(h('p', 'cd-lead cd-said', line));
  if (ui.buried) room.append(h('p', 'cd-lead cd-buried', buriedWords(ui.buried, lang)));
  const actions = h('div', 'cd-actions');
  if (ui.pause) {
    // cards still in a learning step: they come back when due; the learner may review them now, early, within the limit
    const said = pauseWords({ ...ui.pause }, lang, now);
    const line = h('p', 'cd-lead cd-pause', said.line);
    line.id = 'cd-pause';
    room.append(line);
    if (said.now) {
      const ahead = button(said.now, 'cd-btn cd-primary', () => {
        ui.ahead = true;
        const fresh = loadState(opts.storage);
        settle(fresh);
        paint(opts.host, opts, fresh);
      });
      ahead.id = 'cd-ahead';
      actions.append(ahead);
    }
    const turn = ui.pause.canEarly ? ui.pause.at : ui.pause.at - LEARN_AHEAD_MS;
    if (turn > now.getTime()) {
      pauseTimer = setTimeout(() => {
        if (ui.screen !== 'done' || !opts.host.isConnected) return;
        // the close stays until the learner chooses: the steps are read again, a due one reads "due now"
        const fresh = loadState(opts.storage);
        const at = Date.now();
        const steps = deck.cards.filter((card) => isStep(fresh.cards[card.id])).map((card) => Date.parse(fresh.cards[card.id].due));
        ui.pause = steps.length ? { count: steps.length, at: Math.max(Math.min(...steps), at), canEarly: Math.min(...steps) - at <= LEARN_AHEAD_MS } : null;
        paint(opts.host, opts, fresh);
      }, Math.min(2 ** 31 - 1, turn - now.getTime() + 50));
    }
  }
  actions.append(button(t('戻る', 'Back'), 'cd-btn cd-primary', () => {
    ui.screen = 'home';
    paint(opts.host, opts, loadState(opts.storage));
  }));
  room.append(actions);
}

function paintIndex(room, opts, state) {
  room.append(h('h1', 'cd-title', t('目次', 'Contents')));
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
    if (due) open.append(h('span', 'cd-toc-due', t('今', 'Due')));
    item.append(open);
    list.append(item);
  });
  room.append(list);
  room.append(button(t('戻る', 'Back'), 'cd-btn', () => {
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
  room.append(button(t('目次へ', 'To contents'), 'cd-btn', () => {
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
  // one schedule policy on every surface: the learner's own when the host passes it, the pin otherwise
  paint(host, { ...opts, host, storage, scheduler: opts.learner ? createScheduler(fsrsApi, pin, opts.learner) : scheduler }, state);
}
