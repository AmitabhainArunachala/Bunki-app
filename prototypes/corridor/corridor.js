/**
 * 回廊 KAIRO — the corridor prototype.
 *
 * An instrument for making decisions, not a product. Six steps walk unbroken
 * on a phone: arrive → read → tap a word → walk the graph → take it → return.
 * Four open Wayfinder tickets are rendered as switchable variants rather than
 * silently decided (see VARIANTS below).
 *
 * Every value on screen comes from a committed corpus asset. The difficulty
 * signals are the real three-signal grader's output (PR #58) — three signals,
 * never averaged, with disagreement surfaced. The schedule preview is real
 * FSRS-6 (ts-fsrs 5.4.1) under packages/domain's pinned parameters.
 */

const DATA = {
  safe: ['passages', 'kanken', 'sem'],
  sa: ['kanji', 'words', 'idioms', 'dict', 'strokes'],
};

/** English titles for the committed shelf (authored translations of the
 * source titles — the sources themselves are CC BY / PD / glossary text). */
const TITLES_EN = {
  'wikinews:1403': 'Seven sites added to the World Natural Heritage list — including Shiretoko',
  'wikinews:6460': "Mariners' Ichiro reaches 2,500 career hits",
  'wikinews:12024': 'JR Osaka-Higashi Line partially opens',
  'wikinews:20090': 'Shigaraki Kōgen Railway crash: court finds JR West 30% at fault',
  'wikinews:45227': 'Wikinews closes the curtain on 21 years',
  'aozora:051034': 'The Wild Rose — Ogawa Mimei',
  'aozora:000628': 'Gon the Fox — Niimi Nankichi',
  'aozora:046605': 'Yamanashi — Miyazawa Kenji',
  'yasashii:1': 'Childcare leave',
  'yasashii:2': 'Childcare-leave benefit',
  'yasashii:3': "Basic survivor's pension",
};

/** Turn the grader's three signals into one sentence a learner can use.
 * The raw signals stay one 詳細 tap away — translated, not discarded. */
function levelPhrase(grading) {
  const band = grading.signals.jreadability.band || '';
  const levelMap = {
    初級前半: 'Beginner',
    初級後半: 'Upper beginner',
    中級前半: 'Intermediate',
    中級後半: 'Upper intermediate',
    上級前半: 'Advanced',
    上級後半: 'Upper advanced',
  };
  const level = levelMap[band] || 'Ungraded';
  const cov = grading.signals.lexical_coverage.coverage;
  let vocabNote = '';
  if (cov != null && cov < 1) {
    const oneIn = Math.max(2, Math.round(1 / (1 - cov)));
    vocabNote = ` · ~1 in ${oneIn} words beyond the core`;
  }
  return { level, ja: band, note: vocabNote };
}

/** The four open decisions. Crude and obvious on purpose — it is an instrument.
 * Each option carries [id, 日本語, english]; the strip renders both. `depth`
 * and `ui` are not Wayfinder tickets — they are operator feedback on v1.0
 * (2026-08-07): more separation between layers, and navigation a learner can
 * read before they can read Japanese. */
const VARIANTS = {
  cards: {
    ticket: 38,
    label: 'A 札の形 #38',
    en: 'card format',
    options: [
      ['mcd', 'MCD 文脈', 'MCD cloze'],
      ['word', '単語札', 'word card'],
    ],
  },
  difficulty: {
    ticket: 43,
    label: 'B 難易度 #43',
    en: 'difficulty',
    options: [
      ['three', '3信号', '3 signals'],
      ['band', '帯+不確実', 'band'],
    ],
  },
  contrast: {
    ticket: 47,
    label: 'C 可読性 #47',
    en: 'legibility',
    options: [
      ['wcag', 'WCAG 準拠', 'WCAG AA'],
      ['current', '現行の淡さ', 'soft fade'],
    ],
  },
  entry: {
    ticket: 37,
    label: 'D 入口 #37',
    en: 'entry',
    options: [
      ['field', 'ドリフトの野', 'drift field'],
      ['shelf', '読む棚', 'shelf'],
    ],
  },
  depth: {
    ticket: null,
    label: 'E 奥行 v1.1',
    en: 'depth',
    options: [
      ['layered', '層で分ける', 'layered'],
      ['flat', '現行の平ら', 'flat'],
    ],
  },
};

const REL = {
  syn: ['類義', 'everyday synonyms and near-neighbours'],
  ant: ['対義', 'opposites'],
  fam: ['同族', 'shares a kanji — the family around it'],
  col: ['共起', 'what it actually appears with'],
  thm: ['主題', 'the theme it lives in'],
};

/** Grammar seed — DoJG-CLASS coverage begins here (operator 2026-08-07: the
 * three Makino/Tsutsui volumes as the bar). Their text is copyrighted, so
 * every explanation and example below is ORIGINAL, authored for KAIRO; the
 * full ~600-point index is the roadmap, this is the first dozen. */
const GRAMMAR = [
  { id: 'niyoruto', p: '〜によると', lv: 'N3', mEn: 'according to …', mJa: '情報の出どころを示す', form: '名詞 + によると', ex: [{ ja: '天気予報によると、あしたは雨だ。', en: 'According to the forecast, it will rain tomorrow.' }, { ja: '新聞によると、会議は来月開かれる。', en: 'According to the paper, the meeting will be held next month.' }], note: 'Marks the source of reported information; usually paired with 〜そうだ or plain reported forms. The news texts on the shelf open with it constantly.' },
  { id: 'rareru', p: '〜られる／〜される', lv: 'N4', mEn: 'passive — is done (by …)', mJa: '受身', form: '動詞ナイ形 + れる／られる', ex: [{ ja: '会議は毎年ここで開かれる。', en: 'The meeting is held here every year.' }, { ja: '新しい駅が作られた。', en: 'A new station was built.' }], note: 'Everywhere in written news, where events happen without a named actor. Distinguish from potential られる by context.' },
  { id: 'kotoninaru', p: '〜ことになる', lv: 'N3', mEn: 'it has been decided that …; it follows that …', mJa: '決定・成り行き', form: '動詞辞書形／ナイ形 + ことになる', ex: [{ ja: '来年、大阪へ引っ越すことになった。', en: 'It has been decided that I will move to Osaka next year.' }, { ja: '規則では、ここで待つことになっている。', en: 'Under the rules, you are supposed to wait here.' }], note: 'The decision came from outside the speaker. 〜ことにする is the same shape with the speaker deciding.' },
  { id: 'toshite', p: '〜として', lv: 'N3', mEn: 'as …; in the capacity of …', mJa: '資格・立場', form: '名詞 + として', ex: [{ ja: '医者として意見を言う。', en: 'I give my opinion as a doctor.' }, { ja: 'この町は温泉の町として知られている。', en: 'This town is known as a hot-spring town.' }], note: 'Sets the role or capacity from which something is done or seen.' },
  { id: 'nitsuite', p: '〜について', lv: 'N4', mEn: 'about …; concerning …', mJa: '話題・対象', form: '名詞 + について', ex: [{ ja: '事故について説明した。', en: 'They explained about the accident.' }, { ja: '日本の歴史について本を書く。', en: 'To write a book about Japanese history.' }], note: 'The neutral way to mark a topic of discussion; 〜に関して is its formal sibling.' },
  { id: 'teiru', p: '〜ている', lv: 'N5', mEn: 'is …ing; has …ed (state)', mJa: '進行・結果の状態', form: '動詞テ形 + いる', ex: [{ ja: '雨が降っている。', en: 'It is raining.' }, { ja: '窓が開いている。', en: 'The window is open (someone opened it / it stands open).' }], note: 'Progressive with action verbs, resulting state with change verbs — the single most load-bearing form in the language.' },
  { id: 'souda-denbun', p: '〜そうだ（伝聞）', lv: 'N4', mEn: 'I hear that …; they say …', mJa: '伝聞', form: '普通形 + そうだ', ex: [{ ja: 'あの店はおいしいそうだ。', en: 'I hear that restaurant is good.' }, { ja: '半島も登録されたそうだ。', en: 'They say the peninsula was also registered.' }], note: 'Hearsay そうだ attaches to the plain form. The looks-like そうだ attaches to stems — same word, different door.' },
  { id: 'bakari', p: '〜ばかり', lv: 'N3', mEn: 'just did …; nothing but …', mJa: '直後・偏り', form: '動詞タ形 + ばかり／名詞 + ばかり', ex: [{ ja: '起きたばかりだ。', en: 'I just got up.' }, { ja: 'ゲームばかりしている。', en: 'All they do is play games.' }], note: 'After タ形: immediately after. After a noun or テ形: an unbalanced diet of one thing.' },
  { id: 'wa-ga', p: 'は と が', lv: 'N5', mEn: 'topic は vs subject が', mJa: '主題と主格', form: '名詞 + は／が', ex: [{ ja: '象は鼻が長い。', en: 'As for elephants, the nose is long.' }, { ja: 'だれが来たの？ — 田中さんが来た。', en: 'Who came? — Tanaka came.' }], note: 'は frames what the sentence is about; が picks out which one. New information leans が, known-topic leans は.' },
  { id: 'youda', p: '〜ようだ', lv: 'N4', mEn: 'it seems that …', mJa: '推量', form: '普通形 + ようだ（名詞 + のようだ）', ex: [{ ja: 'だれか来たようだ。', en: 'It seems someone came.' }, { ja: '夢のようだ。', en: 'It is like a dream.' }], note: 'Inference from evidence at hand; also the like-a simile. みたいだ is its spoken twin.' },
  { id: 'tame', p: '〜ため（に）', lv: 'N3', mEn: 'because of …; for the sake of …', mJa: '原因・目的', form: '名詞の／普通形 + ため（に）', ex: [{ ja: '事故のため、電車が止まっている。', en: 'Because of an accident, the trains are stopped.' }, { ja: '家族のために働く。', en: 'To work for one’s family.' }], note: 'Cause when the clause is settled fact, purpose when it is willed action — written Japanese leans on it hard.' },
  { id: 'ni-yotte', p: '〜によって', lv: 'N3', mEn: 'by means of …; depending on …; by (agent)', mJa: '手段・受身の動作主・相違', form: '名詞 + によって', ex: [{ ja: '国によって習慣が違う。', en: 'Customs differ depending on the country.' }, { ja: 'この寺は八世紀に建てられたと言われている。この寺は行基によって建てられた。', en: 'This temple is said to date from the 8th century — it was built by Gyōki.' }], note: 'Three doors in one form: instrument, variation, and the agent of a written passive.' },
];

const S = {
  ready: false,
  view: 'shelf',
  passageId: null,
  readerScroll: 0,
  stack: [],
  dials: { kanji: 0, furigana: 2, spacing: 0 },
  variants: { cards: 'mcd', difficulty: 'three', contrast: 'wcag', entry: 'shelf', depth: 'layered' },
  /* UI language: 'bi' = navigation carries English alongside the Japanese
   * (default — a learner must be able to steer before they can read);
   * 'ja' = 日本語のみ, the opt-in immersion chrome for advanced use. */
  lang: 'bi',
  dialsOpen: false,
  query: '',
  taken: [],
  /** manual lists: { name: [{t,id,label,ts}] } — the operator's Renzo habit */
  lists: {},
  /** tokens whose English gloss is shown beneath (double-tap) */
  glossed: null,
  /** which shelf cards have their raw signals expanded (詳細) */
  detailsOpen: null,
  sourcesOpen: false,
  debugOpen: false,
};

/* ------------------------------------------------ persistence (localStorage) */
const STORE_KEY = 'kairo-corridor-v1';
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.taken)) S.taken = s.taken;
    if (s.lists && typeof s.lists === 'object') S.lists = s.lists;
  } catch {
    /* a broken store never blocks the walk */
  }
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ taken: S.taken, lists: S.lists }));
  } catch {
    /* quota or private mode — the session keeps working unpersisted */
  }
}

/** Month bucket label for an epoch ms — the automatic Renzo-style list. */
function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/** Full dictionary record for a written form: kotobako (all senses, most
 * common first) with the original 6,687-word layer as fallback. */
function lookup(id) {
  const full = D.dict[id];
  if (full) return { r: full.r, m: full.m, p: full.p, jlpt: full.jlpt, k: full.k || [], alt: full.alt };
  const old = D.words[id];
  if (old) return { r: old.r, m: old.g ? [old.g] : [], jlpt: old.jlpt, k: old.k || [] };
  return null;
}

const D = {};
let fsrsApi = null;
let scheduler = null;

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/* ------------------------------------------------------------ ui language */
const bi = () => S.lang === 'bi';
/** Pick one rendering for prose: English when the chrome is bilingual,
 * the Japanese original in 日本語のみ mode. */
const tx = (ja, en) => (bi() && en != null ? en : ja);
/** Append a small english sub-label to a control or heading (bi mode only). */
function withEn(node, en, cls = 'en-sub') {
  if (bi() && en) node.append(el('span', cls, en));
  return node;
}
/** A label that stacks 日本語 over english inside buttons. */
function biLabel(tag, cls, ja, en) {
  const node = el(tag, cls);
  node.append(el('span', 'l-ja', ja));
  if (bi() && en) node.append(el('span', 'en-sub', en));
  return node;
}

/* ------------------------------------------------------------------ load */
async function boot() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(VARIANTS)) {
    const v = params.get(key);
    if (v && VARIANTS[key].options.some(([id]) => id === v)) S.variants[key] = v;
  }
  if (['bi', 'ja'].includes(params.get('ui'))) S.lang = params.get('ui');
  loadStore();
  if (params.get('dials')) {
    const [k, f, s] = params.get('dials').split(',').map(Number);
    if ([k, f, s].every((n) => n >= 0 && n <= 2)) S.dials = { kanji: k, furigana: f, spacing: s };
  }
  if (S.variants.entry === 'field') S.view = 'entry';

  render();

  // The standalone single-file build embeds the bundles instead of serving
  // them; everything else about the surface is byte-identical.
  const bundled = window.__CORRIDOR_BUNDLE__;
  const load = async (pool, name) => {
    if (bundled) return bundled[`${pool}/${name}`];
    const res = await fetch(`data/${pool}/${name}.json`);
    if (!res.ok) throw new Error(`data/${pool}/${name}.json → ${res.status}`);
    return res.json();
  };
  const [passages, kanken, sem, kanji, words, idioms, dict, strokes, manifest, pin] =
    await Promise.all([
      ...DATA.safe.map((n) => load('proprietary_safe', n)),
      ...DATA.sa.map((n) => load('share_alike', n)),
      bundled ? bundled.manifest : fetch('data/manifest.json').then((r) => r.json()),
      bundled ? bundled['fsrs-pin'] : fetch('data/fsrs-pin.json').then((r) => r.json()),
    ]);

  D.passages = passages.passages;
  D.passageSources = passages.sources;
  D.kanken = kanken.levels;
  D.sem = sem.edges;
  D.kanji = kanji.kanji;
  D.radicals = kanji.radicals;
  D.words = words.words;
  D.dict = dict.words;
  D.strokes = strokes.strokes;
  D.kmeta = strokes.meta;
  D.idioms = Object.fromEntries(idioms.idioms.map((i) => [i.w, i]));
  D.idiomsByKanji = idioms.byKanji;
  D.idiomMeta = { total: idioms.totalCandidates, cap: idioms.cap };
  D.manifest = manifest;
  D.pin = pin;
  D.sources = {
    proprietary_safe: [...passages.sources, ...kanken.sources, ...sem.sources],
    share_alike: [
      ...kanji.sources,
      ...words.sources,
      ...idioms.sources,
      ...dict.sources,
      ...strokes.sources,
    ],
  };

  // kanji → words containing it, derived here rather than shipped twice
  D.kanjiWords = {};
  for (const w of Object.values(D.words)) {
    for (const c of w.k || []) (D.kanjiWords[c] ||= []).push(w.w);
  }
  for (const c of Object.keys(D.kanjiWords)) {
    D.kanjiWords[c].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  }
  D.wordCap = manifest.caps.kanjiWordCap;

  try {
    fsrsApi = window.__TSFSRS__ || (await import('./vendor/ts-fsrs.mjs'));
    scheduler = fsrsApi.fsrs(
      fsrsApi.generatorParameters({
        w: pin.w,
        request_retention: pin.requestRetention,
        maximum_interval: pin.maximumInterval,
        enable_fuzz: pin.enableFuzz,
        enable_short_term: pin.enableShortTerm,
        learning_steps: pin.learningSteps,
        relearning_steps: pin.relearningSteps,
      }),
    );
  } catch (err) {
    console.warn('FSRS unavailable', err);
  }

  S.ready = true;
  document.body.dataset.ready = '1';
  render();
}

/* ------------------------------------------------------- navigation state */
function go(node) {
  if (S.view === 'reader') S.readerScroll = window.scrollY;
  S.stack.push(node);
  render();
  const sheet = $('.sheet');
  if (sheet) sheet.scrollTop = 0;
}

function back() {
  if (S.stack.length) {
    S.stack.pop();
    render();
    if (!S.stack.length && S.view === 'reader') window.scrollTo(0, S.readerScroll);
    return;
  }
  if (S.view === 'reader' || S.view === 'tray' || S.view === 'grammar') {
    S.view = 'shelf';
    render();
    return;
  }
  if (S.view === 'shelf' && S.variants.entry === 'field') {
    S.view = 'entry';
    render();
  }
}

function openPassage(id) {
  S.passageId = id;
  S.view = 'reader';
  S.readerScroll = 0;
  S.stack = [];
  render();
  window.scrollTo(0, 0);
}

/* --------------------------------------------------------------- helpers */
const passage = () => D.passages.find((p) => p.id === S.passageId);
const BEYOND_JOYO = new Set(['準1級', '1級']);

function beyondJoyo(ch) {
  const k = D.kanken[ch];
  return !!k && BEYOND_JOYO.has(k.kk);
}

function rubyNode(pairs, { furigana, revealed }) {
  const frag = document.createDocumentFragment();
  for (const pair of pairs) {
    if (!pair.r || furigana === 0) {
      frag.append(document.createTextNode(pair.t));
      continue;
    }
    const ruby = document.createElement('ruby');
    ruby.append(document.createTextNode(pair.t));
    const rt = document.createElement('rt');
    rt.textContent = pair.r;
    if (furigana === 1 && !revealed) rt.className = 'hidden-rt';
    ruby.append(rt);
    frag.append(ruby);
  }
  return frag;
}

/** Kanji dial: 0 as written · 1 above-常用 replaced by its reading · 2 all kana. */
function displayPairs(token) {
  const mode = S.dials.kanji;
  if (mode === 0) return token.f;
  if (mode === 2) return [{ t: token.r || token.s }];
  return token.f.map((pair) => {
    if (!pair.r) return pair;
    return [...pair.t].some(beyondJoyo) ? { t: pair.r } : pair;
  });
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseColor(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
}

/** Measured, not eyeballed: composite alpha over the ground, then WCAG ratio. */
function contrastOf(node) {
  const cs = getComputedStyle(node);
  const fg = parseColor(cs.color);
  const bg = parseColor(getComputedStyle(document.body).backgroundColor) || { rgb: [252, 251, 246], a: 1 };
  if (!fg) return null;
  const composited = fg.rgb.map((v, i) => v * fg.a + bg.rgb[i] * (1 - fg.a));
  const l1 = luminance(composited);
  const l2 = luminance(bg.rgb);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/* ----------------------------------------------------------- signals (B) */
const JREAD_MAX = 6.4;
const JREAD_MIN = 0.5;

function signalRows(grading) {
  const s = grading.signals;
  const jr = s.jreadability;
  const cov = s.lexical_coverage;
  const tmr = s.tmr;
  const core = tmr.by_level['ninjal-kyoiku-kihon-goi:core'];
  return [
    {
      name: 'jreadability',
      en: 'sentence ease',
      value: jr.score == null ? '—' : `${jr.score.toFixed(2)} ${jr.band}`,
      hint: tx('6.4 易 → 0.5 難（独自の尺度）', 'sentence-shape readability: 6.4 easy → 0.5 hard'),
      fill: jr.score == null ? 0 : (JREAD_MAX - jr.score) / (JREAD_MAX - JREAD_MIN),
    },
    {
      name: '語彙カバー率',
      en: 'vocab coverage',
      value: cov.coverage == null ? '—' : `${(cov.coverage * 100).toFixed(1)}%`,
      hint: tx(
        '国語研 6,103 語に対する内容語の被覆（高いほど易）',
        'share of content words inside the NINJAL 6,103-word core (higher = easier)',
      ),
      fill: cov.coverage == null ? 0 : 1 - cov.coverage,
    },
    {
      name: 'TMR（核）',
      en: 'rare-word load',
      value: core == null ? '—' : `${(core * 100).toFixed(1)}%`,
      hint: tx('◎ 2,071 語より上の語の割合（高いほど難）', 'share of words beyond the 2,071-word core (higher = harder)'),
      fill: core ?? 0,
    },
  ];
}

function renderSignals(grading, { compact = false } = {}) {
  const wrap = el('div');
  const ordinals = grading.disagreement.detail.ordinals || {};
  const values = Object.values(ordinals);

  if (S.variants.difficulty === 'three') {
    const box = el('div', 'signals');
    for (const row of signalRows(grading)) {
      const line = el('div', 'sig');
      line.append(withEn(el('span', 'sig-name', row.name), row.en));
      const track = el('div', 'sig-track');
      const fill = el('div', 'sig-fill');
      fill.style.width = `${Math.max(2, Math.min(100, row.fill * 100))}%`;
      track.append(fill);
      line.append(track, el('span', 'sig-val', row.value));
      line.title = row.hint;
      box.append(line);
    }
    wrap.append(box);
    const foot = el('div', 'shelf-meta');
    foot.style.marginTop = '8px';
    foot.append(el('span', null, tx('3つの信号。平均しない。', 'Three signals — never averaged.')));
    if (grading.disagreement.flag) {
      foot.append(
        withEn(el('span', 'disagree-tag', `不一致 gap ${grading.disagreement.detail.max_gap}`), 'signals disagree'),
      );
    }
    wrap.append(foot);
  } else {
    const box = el('div', 'band');
    const scale = el('div', 'band-scale');
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 2;
    const span = el('div', 'band-span');
    span.style.left = `${(lo / 3) * 100}%`;
    span.style.width = `${((hi - lo + 1) / 3) * 100}%`;
    scale.append(span);
    const legend = el('div', 'band-legend');
    legend.append(
      el('span', null, tx('易', '易 easy')),
      el('span', null, tx('中', '中 mid')),
      el('span', null, tx('難', '難 hard')),
    );
    box.append(withEn(el('div', 'sig-name', '難易度の帯'), 'difficulty band'), scale, legend);
    if (grading.disagreement.flag) {
      const mark = el('div', 'uncertain');
      mark.append(
        el('span', null, '⁉'),
        el(
          'span',
          null,
          tx(
            `不確実 — 3信号が ${grading.disagreement.detail.max_gap} 段ずれている`,
            `uncertain — the 3 signals are ${grading.disagreement.detail.max_gap} step(s) apart`,
          ),
        ),
      );
      box.append(mark);
    }
    wrap.append(box);
  }

  if (!compact) {
    const note = el('div', 'note');
    note.textContent = tx(
      '#58 で測定済み：jreadability はやさしい日本語を「易しくない」と採点する（符号が逆、2 seed で再現）。' +
        'だから単一の数値は出さない。',
      'Measured on #58: jreadability grades Easy-Japanese as "not easy" (sign inverted, reproduced on 2 seeds). ' +
        'That is why no single number is shown.',
    );
    wrap.append(note);
  }
  return wrap;
}

/* ---------------------------------------------------------------- views */
function renderShelf(main) {
  main.append(withEn(el('p', 'eyebrow', '回廊 · 図書館'), 'KAIRO · the library', 'en-inline'));

  // the quiet field — kanji, kana, romaji, or English; four doors, one box
  const search = el('input', 'search-field');
  search.id = 'search';
  search.type = 'search';
  search.placeholder = tx('ことばをさがす', 'Look up a word — kanji · kana · romaji · English');
  search.autocomplete = 'off';
  search.value = S.query || '';
  let debounce = null;
  search.addEventListener('input', () => {
    S.query = search.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      // surgical swap — the field keeps focus, only the body below changes
      document.getElementById('shelf-body')?.replaceWith(renderShelfBody());
    }, 120);
  });
  main.append(search);
  main.append(renderShelfBody());
}

function renderShelfBody() {
  const main = el('div');
  main.id = 'shelf-body';
  if (S.query?.trim()) {
    renderSearchResults(main, S.query);
    return main;
  }
  const h = withEn(el('h1', 'view-title', '本棚'), 'the bookshelf', 'en-inline');
  main.append(h);
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `${D.passages.length} 本。触れてひらく。`,
    `${D.passages.length} real texts. Tap one to read it.`,
  );
  main.append(sub);

  const gram = el('button', 'grammar-link');
  gram.type = 'button';
  gram.id = 'grammar-link';
  gram.append(el('span', 'l-ja', '文法'), el('span', 'en-sub', bi() ? 'grammar' : ''));
  gram.addEventListener('click', () => {
    S.view = 'grammar';
    render();
    window.scrollTo(0, 0);
  });
  main.append(gram);

  for (const p of D.passages) {
    const item = el('button', 'shelf-item');
    item.type = 'button';
    item.dataset.passage = p.id;

    const head = el('div', 'shelf-head');
    head.append(el('div', 'shelf-title', p.title));
    if (bi() && TITLES_EN[p.id]) head.append(el('div', 'shelf-title-en', TITLES_EN[p.id]));
    const lv = levelPhrase(p.grading);
    const levelLine = el('div', 'level-line');
    levelLine.append(el('span', 'level-chip', bi() ? lv.level : lv.ja));
    levelLine.append(el('span', 'level-note', bi() ? `${lv.ja}${lv.note}` : lv.note.replace('~1 in', '約1/').replace(' words beyond the core', ' 語が基本語彙の外')));
    if (p.grading.disagreement.flag) {
      levelLine.append(el('span', 'disagree-tag', tx('不一致', 'signals disagree')));
    }
    head.append(levelLine);
    item.append(head);

    const meta = el('div', 'shelf-meta');
    meta.append(el('span', null, p.sourceLabel));
    if (p.date) meta.append(el('span', null, p.date));
    meta.append(el('span', 'pool-tag', p.licence));
    item.append(meta);
    item.append(el('div', 'shelf-snippet', p.text.slice(0, 64)));

    // the instrument stays one tap away: 詳細 unfolds the raw three signals
    const details = el('button', 'details-toggle');
    details.type = 'button';
    details.dataset.details = p.id;
    details.textContent = (S.detailsOpen?.has(p.id) ? '▾ ' : '▸ ') + tx('詳細', 'details · raw signals');
    details.addEventListener('click', (ev) => {
      ev.stopPropagation();
      (S.detailsOpen ||= new Set());
      if (S.detailsOpen.has(p.id)) S.detailsOpen.delete(p.id);
      else S.detailsOpen.add(p.id);
      render();
    });
    item.append(details);
    if (S.detailsOpen?.has(p.id)) item.append(renderSignals(p.grading, { compact: true }));

    item.addEventListener('click', () => openPassage(p.id));
    main.append(item);
  }

  // sources and licences: present, honest, folded
  const src = el('button', 'details-toggle');
  src.type = 'button';
  src.id = 'sources-toggle';
  src.textContent = (S.sourcesOpen ? '▾ ' : '▸ ') + tx('出典と licence', 'sources & licences');
  src.addEventListener('click', () => {
    S.sourcesOpen = !S.sourcesOpen;
    render();
  });
  main.append(src);
  if (S.sourcesOpen) main.append(licencePanel());
  return main;
}

function dialRow(labelJa, labelEn, key, options) {
  const row = el('div', 'dial');
  row.append(withEn(el('span', 'dial-label', labelJa), labelEn));
  const seg = el('div', 'seg');
  options.forEach(([ja, en], index) => {
    const b = biLabel('button', null, ja, en);
    b.type = 'button';
    b.dataset.dial = `${key}:${index}`;
    b.setAttribute('aria-pressed', String(S.dials[key] === index));
    b.addEventListener('click', () => {
      S.dials[key] = index;
      render();
    });
    seg.append(b);
  });
  row.append(seg);
  return row;
}

/* ------------------------------------------- the reader's click grammar
 * One discipline, carried from Drift (§8 of the design-language doc), tuned
 * by operator rounds 3–4 (2026-08-07). Taps are PROGRESSIVE, not timed:
 *   1st tap        → furigana above           (instant — no double-tap wait)
 *   2nd tap        → English beneath          (a later tap, not a fast pair)
 *   3rd tap        → backs all the way out    (the word returns to bare)
 *   long-press     → floating mini-dictionary
 *   keep holding   → the mini window morphs into the full entry
 * A moved pointer is a scroll, never a gesture. Every action applies to the
 * DOM directly — no full re-render, so the reader never stutters. */
const GESTURE = { MINI_MS: 430, FULL_MS: 2100, MOVE_PX: 9 };

/* After a hold opens the full entry, the browser still synthesises a click
 * when the finger lifts — and it lands on whatever the new sheet put under
 * that spot, teleporting the reader a node deeper. Swallow that one click. */
let swallowClickUntil = 0;
document.addEventListener(
  'click',
  (ev) => {
    if (Date.now() < swallowClickUntil) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  },
  true,
);

function removeMini() {
  document.getElementById('mini')?.remove();
}

/* a tap anywhere outside the mini puts it away — easy to back out of */
document.addEventListener(
  'pointerdown',
  (ev) => {
    const mini = document.getElementById('mini');
    if (mini && !mini.contains(ev.target)) removeMini();
  },
  true,
);

function showMini(span, token) {
  removeMini();
  const g = lookup(token.b);
  const mini = el('div', null);
  mini.id = 'mini';
  mini.append(el('span', 'mini-word', token.b));
  if (g?.r) mini.append(el('span', 'mini-reading', g.r));
  mini.append(el('span', 'mini-gloss', g?.m?.[0] || tx('（語釈なし）', '(no gloss yet)')));
  mini.append(el('span', 'mini-hint', tx('押しつづけて辞書へ', 'keep holding — full entry')));
  document.body.append(mini);
  const r = span.getBoundingClientRect();
  const m = mini.getBoundingClientRect();
  const above = r.top > m.height + 70;
  mini.style.left = `${Math.max(8, Math.min(window.innerWidth - m.width - 8, r.left + r.width / 2 - m.width / 2))}px`;
  mini.style.top = `${above ? r.top - m.height - 10 : r.bottom + 10}px`;
  return mini;
}

/** Apply one token's reveal state straight to its DOM — no re-render. */
function paintTok(span, token, index) {
  const hasReading = S.dials.furigana === 2 || S.revealed?.has(index);
  const hasEn = S.glossed?.has(index);
  if (S.dials.furigana === 1) {
    for (const rt of span.querySelectorAll('rt')) rt.classList.toggle('hidden-rt', !hasReading);
  } else if (S.dials.furigana === 0) {
    // the dial says no ruby — a per-word reveal builds it on the spot
    const built = span.querySelector('ruby');
    if (hasReading && !built) {
      span.querySelector('.tok-en')?.remove();
      const frag = rubyNode(displayPairs(token), { furigana: 1, revealed: true });
      span.textContent = '';
      span.append(frag);
    } else if (!hasReading && built) {
      span.querySelector('.tok-en')?.remove();
      span.textContent = '';
      span.append(rubyNode(displayPairs(token), { furigana: 0, revealed: false }));
    }
  }
  span.classList.toggle('lit', !!(S.revealed?.has(index) || hasEn));
  const existingEn = span.querySelector('.tok-en');
  if (hasEn && !existingEn) {
    const g = lookup(token.b);
    if (g?.m?.length) {
      span.classList.add('has-en');
      span.append(el('span', 'tok-en', g.m[0]));
    }
  } else if (!hasEn && existingEn) {
    span.classList.remove('has-en');
    existingEn.remove();
  }
}

function wireTokenGestures(span, token, index, p) {
  let miniTimer = null;
  let fullTimer = null;
  let down = null;
  const openFull = () => {
    removeMini();
    swallowClickUntil = Date.now() + 700;
    go({ t: 'word', id: token.b, from: { passage: p.id, index } });
  };
  const clear = () => {
    clearTimeout(miniTimer);
    clearTimeout(fullTimer);
    miniTimer = fullTimer = null;
  };
  span.addEventListener('contextmenu', (ev) => ev.preventDefault());
  span.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY, at: Date.now() };
    miniTimer = setTimeout(() => {
      const mini = showMini(span, token);
      mini.addEventListener('click', openFull);
    }, GESTURE.MINI_MS);
    fullTimer = setTimeout(openFull, GESTURE.FULL_MS);
  });
  span.addEventListener('pointermove', (ev) => {
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > GESTURE.MOVE_PX) {
      clear();
      down = null;
    }
  });
  span.addEventListener('pointercancel', () => {
    clear();
    down = null;
  });
  span.addEventListener('pointerup', () => {
    if (!down) return;
    const held = Date.now() - down.at;
    down = null;
    clear();
    if (held >= GESTURE.MINI_MS) return; // mini stays up; tap it for the full entry
    // progressive tap, applied instantly: reading → English → back to bare
    (S.revealed ||= new Set());
    (S.glossed ||= new Set());
    const hasReading = S.dials.furigana === 2 || S.revealed.has(index);
    const hasEn = S.glossed.has(index);
    if (!hasReading) {
      S.revealed.add(index);
    } else if (!hasEn) {
      S.glossed.add(index);
    } else {
      S.glossed.delete(index);
      S.revealed.delete(index);
    }
    paintTok(span, token, index);
  });
}

function renderReader(main) {
  const p = passage();
  if (!p) {
    S.view = 'shelf';
    return renderShelf(main);
  }
  main.append(el('p', 'eyebrow', p.sourceLabel));
  main.append(el('h1', 'view-title', p.title));
  const lv = levelPhrase(p.grading);
  const levelLine = el('div', 'level-line');
  levelLine.append(el('span', 'level-chip', bi() ? lv.level : lv.ja));
  levelLine.append(el('span', 'level-note', bi() ? `${lv.ja}${lv.note}` : lv.note));
  main.append(levelLine);

  // the dials fold away — the text is the point, the settings one tap away
  const dialsToggle = el('button', 'details-toggle');
  dialsToggle.type = 'button';
  dialsToggle.id = 'dials-toggle';
  dialsToggle.textContent = (S.dialsOpen ? '▾ ' : '▸ ') + tx('文字設定', 'text settings 文字設定');
  dialsToggle.addEventListener('click', () => {
    S.dialsOpen = !S.dialsOpen;
    render();
  });
  main.append(dialsToggle);
  if (S.dialsOpen) {
    const dials = el('div', 'dials');
    dials.append(
      dialRow('漢字', 'kanji', 'kanji', [
        ['そのまま', 'as written'],
        ['常用まで', 'jōyō only'],
        ['すべて仮名', 'all kana'],
      ]),
    );
    dials.append(
      dialRow('ふりがな', 'readings', 'furigana', [
        ['なし', 'off'],
        ['触れて', 'on touch'],
        ['つねに', 'always'],
      ]),
    );
    dials.append(
      dialRow('分かち', 'spacing', 'spacing', [
        ['なし', 'none'],
        ['語の間', 'words'],
        ['文節', 'phrases'],
      ]),
    );
    main.append(dials);
  }

  const grammarHint = el('p', 'gesture-hint');
  grammarHint.textContent = tx(
    '触れる＝ふりがな · もう一度＝英語 · 長押し＝辞書',
    'tap = reading · tap again = English · hold = dictionary',
  );
  main.append(grammarHint);

  const reader = el('div', 'reader');
  reader.id = 'reader';
  if (S.dials.spacing === 1) reader.classList.add('sp-word');
  if (S.dials.spacing === 2) reader.classList.add('sp-bunsetsu');

  let group = null;
  for (const [index, token] of p.tokens.entries()) {
    const span = el('span', token.c ? 'tok content' : 'tok plain');
    span.dataset.index = String(index);
    if (token.c) span.dataset.word = token.b;
    if (S.revealed && S.revealed.has(index)) span.classList.add('lit');
    span.append(
      rubyNode(displayPairs(token), {
        furigana: S.dials.furigana,
        revealed: S.dials.furigana === 2 || (S.revealed && S.revealed.has(index)),
      }),
    );
    if (token.c && S.glossed?.has(index)) {
      const g = lookup(token.b);
      if (g?.m?.length) {
        span.classList.add('has-en');
        span.append(el('span', 'tok-en', g.m[0]));
      }
    }
    if (token.c) wireTokenGestures(span, token, index, p);
    else if (PARTICLE_BY_SURFACE[token.s]) wireParticleGestures(span, PARTICLE_BY_SURFACE[token.s]);
    if (S.dials.spacing === 2) {
      if (token.c || !group) {
        group = el('span', 'bunsetsu');
        reader.append(group);
      }
      group.append(span);
    } else {
      reader.append(span);
    }
  }
  main.append(reader);

  if (p.truncated) {
    const note = el('div', 'note');
    note.textContent = tx(
      `原典からの抜粋（先頭 ${p.text.length} 字、文単位）。`,
      `Excerpt — the first ${p.text.length} characters of the source, cut at a sentence boundary.`,
    );
    if (p.url) {
      const a = el('a', null, tx(' 原典', ' source 原典'));
      a.href = p.url;
      a.rel = 'noreferrer';
      a.target = '_blank';
      a.className = 'inline-link';
      note.append(a);
    }
    main.append(note);
  }
  const attribution = el('div', 'note');
  attribution.textContent = p.attribution;
  main.append(attribution);
}

function renderEntry(main) {
  main.style.padding = '0 16px 92px';
  const field = el('div', 'field');
  field.id = 'field';
  const seeds = [];
  for (const p of D.passages) {
    for (const t of p.tokens) {
      if (t.c && t.s.length > 1 && seeds.length < 26 && !seeds.includes(t.b)) seeds.push(t.b);
    }
  }
  seeds.forEach((word, i) => {
    const node = el('div', 'field-word', word);
    // deterministic pseudo-scatter — no rng, so screenshots are reproducible
    const x = ((i * 37) % 78) + 4;
    const y = ((i * 53) % 82) + 4;
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
    node.style.fontSize = `${13 + ((i * 7) % 11)}px`;
    // the WCAG side lifts the field's floor too — at 0.35 the words all but vanish
    const floor = S.variants.contrast === 'wcag' ? 55 : 35;
    node.style.opacity = String((floor + ((i * 13) % (95 - floor))) / 100);
    node.style.animationDuration = `${9 + (i % 7)}s`;
    node.style.animationDelay = `-${i * 0.7}s`;
    node.addEventListener('click', () => go({ t: 'word', id: word }));
    field.append(node);
  });
  const enter = el('button', 'field-enter', tx('棚へ　→', '棚へ　to the shelf →'));
  enter.type = 'button';
  enter.id = 'enter-shelf';
  enter.addEventListener('click', () => {
    S.view = 'shelf';
    render();
  });
  field.append(enter);
  main.append(field);

  const note = el('div', 'note placeholder');
  note.innerHTML = tx(
    '<b>仮置き</b> — これは入口の位置を比べるための最小の野であって、Drift そのものではない。' +
      'Drift の物理とジェスチャ文法は #46 で未決のまま、触っていない。本物の Drift はサイトの root にある。',
    '<b>placeholder</b> — a minimal field for comparing where you land, not Drift itself. ' +
      "Drift's physics and gesture grammar stay untouched (#46). The real Drift lives at the site root.",
  );
  main.append(note);
}

function renderTray(main) {
  main.append(withEn(el('p', 'eyebrow', 'リスト'), 'your lists', 'en-inline'));
  main.append(
    el('h1', 'view-title', tx(`覚える ${S.taken.length} 件`, `Memorizing ${S.taken.length} item${S.taken.length === 1 ? '' : 's'}`)),
  );
  if (!S.taken.length) {
    main.append(
      el(
        'div',
        'sem-empty',
        tx(
          'まだ何もない。語・漢字・部品・熟語のページの「覚える」から入る。',
          'Nothing here yet. The 覚える memorize button on any word, kanji, part, or idiom page adds it — this month’s list fills itself.',
        ),
      ),
    );
    return;
  }

  // month buckets fill themselves; named lists sit above them
  const buckets = new Map();
  for (const item of S.taken) {
    const key = monthKey(item.ts || 0);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const sections = [
    ...Object.entries(S.lists).map(([name, items]) => ({ name, items, manual: true })),
    ...[...buckets.entries()].map(([name, items]) => ({ name, items, manual: false })),
  ];
  for (const sec of sections) {
    const head = el('p', 'eyebrow list-head');
    head.append(document.createTextNode(`${sec.name} — ${sec.items.length}`));
    if (bi()) head.append(el('span', 'en-inline', sec.manual ? 'named list' : 'auto · monthly'));
    main.append(head);
    for (const item of sec.items) {
      const line = el('div', 'tray-line');
      line.append(el('span', 'w', item.label));
      line.append(el('span', 'pool-tag', tx(item.kind || '', item.kindEn || item.kind || '')));
      const preview = schedulePreview();
      line.append(el('span', 'when', preview ? preview.good.when : '—'));
      line.addEventListener('click', () => go({ t: item.t, id: item.id }));
      main.append(line);
    }
  }
}

/* ------------------------------------------------------------- particles
 * The structural law (design doc §4): particles are first-class doors, not
 * dead pixels between words. Original content, authored for KAIRO. */
const PARTICLES = [
  { id: 'wa', p: 'は', r: 'わ', role: 'topic', roleJa: '主題', exp: 'Frames what the sentence is about — everything after は is said ABOUT it. Contrast lives here too: 犬は好きだが猫は…', ex: [{ ja: '知床半島は北海道にある。', en: 'As for the Shiretoko Peninsula, it is in Hokkaidō.' }, { ja: '今日は寒い。', en: 'Today (at least) is cold.' }], see: 'wa-ga' },
  { id: 'ga', p: 'が', r: 'が', role: 'subject', roleJa: '主格', exp: 'Picks out WHICH one — the doer or the thing being described, often new information or the answer to a question word.', ex: [{ ja: '雨が降っている。', en: 'Rain is falling.' }, { ja: 'だれが来たの？', en: 'WHO came?' }], see: 'wa-ga' },
  { id: 'wo', p: 'を', r: 'を', role: 'direct object', roleJa: '対格', exp: 'Marks what the action is done TO — and the space moved THROUGH with motion verbs (空を飛ぶ).', ex: [{ ja: '本を読む。', en: 'To read a book.' }, { ja: '公園を歩く。', en: 'To walk through the park.' }] },
  { id: 'ni', p: 'に', r: 'に', role: 'target · time · location-of-being', roleJa: '着点・時点・存在場所', exp: 'The arrow-point: destination of motion, time of an event, place where something exists, and the receiver of giving.', ex: [{ ja: '七時に起きる。', en: 'To get up at seven.' }, { ja: '東京に住んでいる。', en: 'To live in Tokyo.' }] },
  { id: 'de', p: 'で', r: 'で', role: 'place-of-action · means', roleJa: '動作場所・手段', exp: 'Where an action happens, or the tool it happens BY: 会議はここで開かれる、バスで行く。Also the boundary of a total (三人で).', ex: [{ ja: 'ダーバンで開催中の会議', en: 'the conference being held in Durban' }, { ja: '箸で食べる。', en: 'To eat with chopsticks.' }] },
  { id: 'to', p: 'と', r: 'と', role: 'with · and · quotation', roleJa: '共同・並列・引用', exp: 'An exhaustive AND (A と B and that is the whole list), doing something WITH someone, and the mouth of a quote (…と言う).', ex: [{ ja: 'フィヨルドと知床半島が登録された。', en: 'The fjords and the Shiretoko Peninsula were registered.' }, { ja: '行くと言った。', en: 'They said they would go.' }] },
  { id: 'mo', p: 'も', r: 'も', role: 'also · even', roleJa: '同類・強調', exp: 'ALSO this one — and stretched, EVEN this one (子供もわかる). Replaces は・が・を; stacks after other particles (にも, でも).', ex: [{ ja: '知床半島も登録された。', en: 'The Shiretoko Peninsula was ALSO registered.' }, { ja: '一円もない。', en: 'I do not have even one yen.' }] },
  { id: 'no', p: 'の', r: 'の', role: 'of · belonging', roleJa: '連体・所有', exp: "Ties two nouns: B of A, A's B, B which is A. Also nominalizes (読むのが好き) and softens questions (行くの？).", ex: [{ ja: '日本の知床半島', en: "Japan's Shiretoko Peninsula" }, { ja: '泳ぐのが好きだ。', en: 'I like swimming.' }] },
  { id: 'e', p: 'へ', r: 'え', role: 'toward', roleJa: '方向', exp: 'The direction faced, softer than に about arriving: 東へ向かう cares about the heading, not the doorstep.', ex: [{ ja: '北へ向かう。', en: 'To head north.' }, { ja: '日本への手紙', en: 'a letter to Japan' }] },
  { id: 'kara', p: 'から', r: 'から', role: 'from · because', roleJa: '起点・理由', exp: 'The starting point in space or time — and, after a clause, the speaker’s reason (寒いから閉めて).', ex: [{ ja: '駅から歩く。', en: 'To walk from the station.' }, { ja: '寒いから、窓を閉めた。', en: 'Because it was cold, I shut the window.' }] },
  { id: 'made', p: 'まで', r: 'まで', role: 'until · as far as', roleJa: '限界点', exp: 'The far edge: up TO a place, UNTIL a time, and rhetorically even-as-far-as (子供にまで笑われた).', ex: [{ ja: '駅まで走った。', en: 'I ran as far as the station.' }, { ja: '五時まで働く。', en: 'To work until five.' }] },
  { id: 'yori', p: 'より', r: 'より', role: 'than · from (formal)', roleJa: '比較・起点', exp: 'The yardstick of comparison (AよりB), and a formal FROM in written Japanese (東京より).', ex: [{ ja: '飛行機は船より速い。', en: 'Planes are faster than ships.' }, { ja: '午後三時より開催。', en: 'Held from 3 p.m. (formal notice).' }] },
  { id: 'ka', p: 'か', r: 'か', role: 'question · or', roleJa: '疑問・選択', exp: 'The spoken question mark — and OR between choices (コーヒーか紅茶). Doubled, it shrugs: 行くかどうか.', ex: [{ ja: '行きますか。', en: 'Are you going?' }, { ja: 'コーヒーか紅茶にする。', en: 'I will have coffee or tea.' }] },
  { id: 'ne', p: 'ね', r: 'ね', role: 'shared feeling', roleJa: '確認・共感', exp: 'Reaches for agreement — "right?" It assumes the listener already half-knows.', ex: [{ ja: 'いい天気ですね。', en: 'Lovely weather, isn’t it?' }, { ja: 'また明日ね。', en: 'See you tomorrow, yeah?' }] },
  { id: 'yo', p: 'よ', r: 'よ', role: 'new information', roleJa: '告知', exp: 'Hands the listener something they did not know — friendly emphasis, not shouting.', ex: [{ ja: '電車、もう出ましたよ。', en: 'The train has already left, you know.' }, { ja: '大丈夫だよ。', en: 'It’s okay, really.' }] },
  { id: 'ba', p: 'ば', r: 'ば', role: 'if (conditional)', roleJa: '仮定', exp: 'The bare IF of the ば-form: 読めば分かる — if you read it, you will see. General truths and advice live here.', ex: [{ ja: '読めば分かる。', en: 'If you read it, you will understand.' }, { ja: '安ければ買う。', en: 'If it is cheap, I will buy it.' }] },
  { id: 'ya', p: 'や', r: 'や', role: 'and (open list)', roleJa: '例示並列', exp: 'A sampling AND: 本やペン — books, pens, that sort of thing. と closes the list; や leaves the door open.', ex: [{ ja: '屋久島や白神山地', en: 'Yakushima, Shirakami-Sanchi, and the like' }, { ja: '肉や野菜を買う。', en: 'To buy meat, vegetables, and so on.' }] },
  { id: 'shi', p: 'し', r: 'し', role: 'and what’s more', roleJa: '列挙・理由', exp: 'Stacks reasons with a nod that there are more: 安いし、近いし。', ex: [{ ja: '安いし、うまいし、また来る。', en: 'It’s cheap, it’s good — I’ll come again.' }, { ja: '雨だし、今日はやめよう。', en: 'It’s raining (among other things), let’s not today.' }] },
];
const PARTICLE_BY_SURFACE = Object.fromEntries(PARTICLES.map((p) => [p.p, p]));

function renderParticleNode(sheet, node) {
  const pt = PARTICLES.find((x) => x.id === node.id);
  if (!pt) {
    sheet.append(el('div', 'sem-empty', tx('この助詞はまだない。', 'This particle page does not exist yet.')));
    return;
  }
  const head = el('h2', 'headword', pt.p);
  head.append(el('span', 'headword-alt', tx('　助詞', '　particle')));
  sheet.append(head);
  if (pt.r !== pt.p) sheet.append(el('p', 'reading', pt.r));
  sheet.append(el('p', 'sense-pos', bi() ? pt.role : pt.roleJa));
  sheet.append(el('p', 'gloss', bi() ? pt.exp : pt.exp));
  sheet.append(withEn(el('p', 'eyebrow', '用例'), 'examples', 'en-inline'));
  for (const ex of pt.ex) {
    const line = el('div', 'example');
    line.append(el('p', 'example-ja', ex.ja));
    if (bi()) line.append(el('p', 'example-en', ex.en));
    sheet.append(line);
  }
  if (pt.see && GRAMMAR.some((g) => g.id === pt.see)) {
    sheet.append(withEn(el('p', 'eyebrow', '文法へ'), 'related grammar', 'en-inline'));
    const g = GRAMMAR.find((x) => x.id === pt.see);
    const row = el('button', 'entry-row');
    row.type = 'button';
    row.append(el('span', 'row-glyph', '文'));
    row.append(el('span', 'row-main', `${g.p} — ${bi() ? g.mEn : g.mJa}`));
    row.append(el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: 'grammar', id: g.id }));
    sheet.append(row);
  }
}

/** Particles keep the reading rhythm: a tap does nothing, a long press
 * floats the mini, holding opens the particle page. */
function wireParticleGestures(span, particle) {
  let miniTimer = null;
  let fullTimer = null;
  let down = null;
  const openFull = () => {
    removeMini();
    swallowClickUntil = Date.now() + 700;
    go({ t: 'particle', id: particle.id });
  };
  const clear = () => {
    clearTimeout(miniTimer);
    clearTimeout(fullTimer);
    miniTimer = fullTimer = null;
  };
  span.classList.add('particle');
  span.addEventListener('contextmenu', (ev) => ev.preventDefault());
  span.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY };
    miniTimer = setTimeout(() => {
      removeMini();
      const mini = el('div', null);
      mini.id = 'mini';
      mini.append(el('span', 'mini-word', particle.p));
      mini.append(el('span', 'mini-gloss', bi() ? particle.role : particle.roleJa));
      mini.append(el('span', 'mini-hint', tx('押しつづけて助詞のページへ', 'keep holding — the particle page')));
      document.body.append(mini);
      const r = span.getBoundingClientRect();
      const m = mini.getBoundingClientRect();
      const above = r.top > m.height + 70;
      mini.style.left = `${Math.max(8, Math.min(window.innerWidth - m.width - 8, r.left + r.width / 2 - m.width / 2))}px`;
      mini.style.top = `${above ? r.top - m.height - 10 : r.bottom + 10}px`;
      mini.addEventListener('click', openFull);
    }, GESTURE.MINI_MS);
    fullTimer = setTimeout(openFull, GESTURE.FULL_MS);
  });
  span.addEventListener('pointermove', (ev) => {
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > GESTURE.MOVE_PX) {
      clear();
      down = null;
    }
  });
  span.addEventListener('pointercancel', () => {
    clear();
    down = null;
  });
  span.addEventListener('pointerup', () => {
    clear();
    down = null;
  });
}

/* --------------------------------------------------------------- search
 * The Renzo lesson (design doc §7.2): one quiet field eating kanji, kana,
 * romaji, and English, answering while you type. Four doors, one box. */
const KATA_TO_HIRA_OFFSET = 0x30a1 - 0x3041;
function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - KATA_TO_HIRA_OFFSET));
}

/** Hepburn-ish romaji → hiragana, table-driven longest match. Returns null
 * when the input cannot be fully converted (then it is English, not romaji). */
const ROMAJI = (() => {
  const m = {
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
    bya: 'びゃ', byu: 'びゅ', byo: 'びょ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
    shi: 'し', chi: 'ち', tsu: 'つ', dzu: 'づ',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    sa: 'さ', si: 'し', su: 'す', se: 'せ', so: 'そ',
    ta: 'た', ti: 'ち', tu: 'つ', te: 'て', to: 'と',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    wa: 'わ', wo: 'を',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    za: 'ざ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', ji: 'じ',
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  };
  return (input) => {
    let s = input.toLowerCase().replace(/[^a-z']/g, '');
    if (!s) return null;
    let out = '';
    while (s.length) {
      if (s[0] === "'") {
        s = s.slice(1);
        continue;
      }
      // sokuon: doubled consonant (not n)
      if (s.length > 1 && s[0] === s[1] && 'kstcpgzdbfhjmyrw'.includes(s[0])) {
        out += 'っ';
        s = s.slice(1);
        continue;
      }
      // n before consonant or at end → ん
      if (s[0] === 'n' && (s.length === 1 || !'aiueoyn'.includes(s[1]))) {
        out += 'ん';
        s = s.slice(1);
        continue;
      }
      if (s.startsWith('nn') && (s.length === 2 || !'aiueoy'.includes(s[2]))) {
        out += 'ん';
        s = s.slice(2);
        continue;
      }
      let hit = null;
      for (const len of [3, 2, 1]) {
        const piece = s.slice(0, len);
        if (m[piece]) {
          hit = m[piece];
          s = s.slice(len);
          break;
        }
      }
      if (!hit) return null; // not romaji — treat the query as English
      out += hit;
    }
    return out || null;
  };
})();

let searchIndex = null;
function buildSearchIndex() {
  if (searchIndex) return;
  searchIndex = [];
  for (const [w, rec] of Object.entries(D.dict)) {
    searchIndex.push({
      t: 'word', id: w, w,
      r: rec.r || '',
      rh: kataToHira(rec.r || ''),
      m: (rec.m || []).join('; ').toLowerCase(),
      g: rec.m?.[0] || '',
    });
  }
  for (const [c, k] of Object.entries(D.kanji)) {
    const readings = [...k.on, ...k.kun].join('・');
    searchIndex.push({
      t: 'kanji', id: c, w: c,
      r: readings,
      rh: kataToHira([...k.on, ...k.kun].join(' ')),
      m: String(k.m).toLowerCase(),
      g: k.m,
    });
  }
  for (const g of GRAMMAR) {
    searchIndex.push({ t: 'grammar', id: g.id, w: g.p, r: g.lv, rh: '', m: `${g.mEn} ${g.mJa}`.toLowerCase(), g: g.mEn });
  }
  for (const pt of PARTICLES) {
    searchIndex.push({
      t: 'particle', id: pt.id, w: pt.p,
      r: '助詞',
      rh: pt.r,
      m: `${pt.role} ${pt.roleJa} particle`.toLowerCase(),
      g: pt.role,
    });
  }
}

function searchResults(query) {
  buildSearchIndex();
  const q = query.trim();
  if (!q) return [];
  const hasKanji = /[一-鿌]/.test(q);
  const hasKana = /[぀-ゖァ-ヺ]/.test(q);
  const qh = hasKana ? kataToHira(q) : ROMAJI(q);
  const ql = q.toLowerCase();
  const scored = [];
  for (const e of searchIndex) {
    let score = -1;
    if (hasKanji) {
      if (e.w === q) score = 100;
      else if (e.w.startsWith(q)) score = 80;
      else if (e.w.includes(q)) score = 60;
    } else if (hasKana) {
      if (e.rh === qh) score = 100;
      else if (e.rh.startsWith(qh)) score = 80;
      else if (e.w.includes(q)) score = 60;
    } else {
      // latin: try as romaji reading AND as english
      if (qh) {
        if (e.rh === qh) score = Math.max(score, 95);
        else if (e.rh.startsWith(qh)) score = Math.max(score, 75);
      }
      if (e.m) {
        const at = e.m.indexOf(ql);
        if (at === 0 || (at > 0 && ' ;('.includes(e.m[at - 1]))) score = Math.max(score, 70);
        else if (at > 0) score = Math.max(score, 40);
      }
    }
    if (score >= 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.w.length - b.e.w.length);
  return scored.slice(0, 40).map((x) => x.e);
}

function renderSearchResults(main, query) {
  const results = searchResults(query);
  const box = el('div', 'entry-rows');
  box.id = 'search-results';
  for (const e of results) {
    const row = el('button', 'entry-row compound');
    row.type = 'button';
    row.dataset.result = `${e.t}:${e.id}`;
    if (e.t === 'kanji') {
      row.append(el('span', 'row-glyph', e.w));
      const stack = el('span', 'row-stack');
      stack.append(el('span', 'row-gloss', e.g));
      stack.append(el('span', 'row-gloss', e.r));
      row.append(stack);
    } else {
      const stack = el('span', 'row-stack');
      const top = el('span', 'row-word');
      top.append(document.createTextNode(e.w));
      if (e.r) top.append(el('span', 'row-reading', e.r));
      stack.append(top);
      if (e.g) stack.append(el('span', 'row-gloss', e.g));
      row.append(stack);
    }
    row.append(el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: e.t, id: e.id }));
    box.append(row);
  }
  if (!results.length) {
    box.append(el('div', 'sem-empty', tx('見つからない。', 'Nothing found for that yet.')));
  }
  main.append(box);
}

/* -------------------------------------------------------------- grammar */
function renderGrammar(main) {
  main.append(withEn(el('p', 'eyebrow', '文法辞典 · 種'), 'grammar dictionary · the seed', 'en-inline'));
  main.append(el('h1', 'view-title', tx('文法', 'Grammar')));
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `${GRAMMAR.length} 項目。全項目版はこれから育てる。`,
    `${GRAMMAR.length} entries, original content. The full dictionary-grade index grows from here.`,
  );
  main.append(sub);
  const rows = el('div', 'entry-rows');
  for (const g of GRAMMAR) {
    const row = el('button', 'entry-row compound');
    row.type = 'button';
    row.dataset.grammar = g.id;
    const main2 = el('span', 'row-stack');
    const top = el('span', 'row-word');
    top.append(document.createTextNode(g.p));
    top.append(el('span', 'row-reading', g.lv));
    main2.append(top);
    main2.append(el('span', 'row-gloss', bi() ? g.mEn : g.mJa));
    row.append(main2, el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: 'grammar', id: g.id }));
    rows.append(row);
  }
  main.append(rows);
}

function renderGrammarNode(sheet, node) {
  const g = GRAMMAR.find((x) => x.id === node.id);
  if (!g) {
    sheet.append(el('div', 'sem-empty', tx('この項目はまだない。', 'This entry does not exist yet.')));
    return;
  }
  sheet.append(el('h2', 'headword', g.p));
  sheet.append(el('p', 'reading', g.lv));
  sheet.append(el('p', 'gloss', bi() ? `${g.mEn} — ${g.mJa}` : g.mJa));
  sheet.append(withEn(el('p', 'eyebrow', '接続'), 'formation', 'en-inline'));
  sheet.append(el('p', 'formation', g.form));
  sheet.append(withEn(el('p', 'eyebrow', '用例'), 'examples', 'en-inline'));
  for (const ex of g.ex) {
    const line = el('div', 'example');
    line.append(el('p', 'example-ja', ex.ja));
    if (bi()) line.append(el('p', 'example-en', ex.en));
    sheet.append(line);
  }
  if (g.note) {
    sheet.append(withEn(el('p', 'eyebrow', '使い分け'), 'usage', 'en-inline'));
    sheet.append(el('p', 'sem-note grammar-note', g.note));
  }
}

/* ---------------------------------------------------------------- nodes */
function nodeTitle(node) {
  if (node.t === 'word') return node.id;
  if (node.t === 'kanji') return node.id;
  if (node.t === 'radical') return node.id;
  if (node.t === 'idiom') return node.id;
  if (node.t === 'grammar') return GRAMMAR.find((x) => x.id === node.id)?.p || node.id;
  if (node.t === 'particle') return PARTICLES.find((x) => x.id === node.id)?.p || node.id;
  return '';
}

function chipsFor(items, onTap, sub, kind) {
  const wrap = el('div', 'chips');
  for (const item of items) {
    const chip = el('button', kind ? `chip t-${kind}` : 'chip');
    chip.type = 'button';
    chip.append(el('span', 'big', item.label));
    const subText = sub ? sub(item) : item.sub;
    if (subText) chip.append(el('span', 'sub', subText));
    chip.addEventListener('click', () => onTap(item));
    wrap.append(chip);
  }
  return wrap;
}

const NODE_KIND = {
  word: ['語', 'word'],
  kanji: ['漢字', 'kanji'],
  radical: ['部品', 'part'],
  idiom: ['熟語', 'idiom'],
};

function takeButton(node, label) {
  const already = S.taken.some((t) => t.t === node.t && t.id === node.id);
  const btn = biLabel(
    'button',
    already ? 'take taken' : 'take',
    already ? '覚える ✓' : '覚える',
    already ? 'memorizing' : 'memorize',
  );
  btn.type = 'button';
  btn.id = 'take';
  btn.addEventListener('click', () => {
    if (already) return;
    S.taken.push({
      t: node.t,
      id: node.id,
      label,
      kind: NODE_KIND[node.t][0],
      kindEn: NODE_KIND[node.t][1],
      from: node.from || null,
      ts: Date.now(),
    });
    saveStore();
    render();
  });
  return btn;
}

/** After 覚える: the item lands in this month's bucket automatically (the
 * operator's Renzo habit, automated) and can join any named list too. */
function renderListPicker(sheet, node, label) {
  const item = S.taken.find((t) => t.t === node.t && t.id === node.id);
  if (!item) return;
  const wrap = el('div', 'list-picker');
  wrap.append(
    withEn(el('p', 'eyebrow', `リスト — ${monthKey(item.ts)} に自動追加ずみ`), `lists — already in ${monthKey(item.ts)}`, 'en-inline'),
  );
  const chips = el('div', 'chips');
  for (const name of Object.keys(S.lists)) {
    const inList = S.lists[name].some((x) => x.t === node.t && x.id === node.id);
    const chip = el('button', inList ? 'chip wide on-list' : 'chip wide');
    chip.type = 'button';
    chip.append(el('span', 'big', name));
    chip.append(el('span', 'sub', `${S.lists[name].length}`));
    chip.addEventListener('click', () => {
      if (inList) S.lists[name] = S.lists[name].filter((x) => !(x.t === node.t && x.id === node.id));
      else S.lists[name].push({ t: node.t, id: node.id, label, ts: item.ts });
      saveStore();
      render();
    });
    chips.append(chip);
  }
  const add = el('button', 'chip wide');
  add.type = 'button';
  add.id = 'new-list';
  add.append(el('span', 'big', tx('＋ 新規リスト', '＋ new list')));
  add.addEventListener('click', () => {
    const name = window.prompt(tx('リスト名', 'List name'));
    if (!name || S.lists[name]) return;
    S.lists[name] = [{ t: node.t, id: node.id, label, ts: item.ts }];
    saveStore();
    render();
  });
  chips.append(add);
  wrap.append(chips);
  sheet.append(wrap);
}

function schedulePreview() {
  if (!scheduler || !fsrsApi) return null;
  const now = new Date();
  const card = fsrsApi.createEmptyCard(now);
  const result = scheduler.repeat(card, now);
  const out = {};
  for (const grade of ['Again', 'Hard', 'Good', 'Easy']) {
    const next = result[fsrsApi.Rating[grade]].card;
    const ms = next.due.getTime() - now.getTime();
    const mins = Math.round(ms / 60000);
    const days = next.scheduled_days;
    out[grade.toLowerCase()] = {
      when: days >= 1 ? tx(`${days} 日後`, `in ${days} d`) : tx(`${mins} 分後`, `in ${mins} min`),
      due: next.due.toISOString().slice(0, 16).replace('T', ' '),
      stability: next.stability,
      difficulty: next.difficulty,
    };
  }
  return out;
}

function renderSchedule(container) {
  const preview = schedulePreview();
  container.append(
    withEn(
      el('p', 'card-kind', tx('予定される復習', 'if you reviewed this now') + ` — FSRS-6 · ${D.pin.parameterSetId}`),
      null,
    ),
  );
  if (!preview) {
    container.append(el('div', 'sem-empty', tx('スケジューラを読み込めなかった。', 'The scheduler failed to load.')));
    return;
  }
  const table = el('table', 'sched');
  const head = el('tr');
  const headers = [
    ['評価', 'your rating'],
    ['つぎ', 'next review'],
    ['日時', 'due'],
    ['安定度', 'stability'],
  ];
  for (const [ja, en] of headers) head.append(withEn(el('th', null, ja), en));
  table.append(head);
  const labels = {
    again: ['もう一度', 'again'],
    hard: ['難しい', 'hard'],
    good: ['ふつう', 'good'],
    easy: ['簡単', 'easy'],
  };
  for (const key of ['again', 'hard', 'good', 'easy']) {
    const row = el('tr');
    row.append(withEn(el('td', null, labels[key][0]), labels[key][1]));
    row.append(el('td', key === 'good' ? 'good' : null, preview[key].when));
    row.append(el('td', null, preview[key].due));
    row.append(el('td', null, preview[key].stability.toFixed(2)));
    table.append(row);
  }
  container.append(table);
  const note = el('div', 'note');
  note.textContent = tx('実計算のプレビュー。まだ何も保存されない。', 'A real FSRS-6 preview — nothing is saved yet.');
  container.append(note);
}

/** Variant A (#38): the SAME target word rendered both ways. */
function renderCardVariant(container, target) {
  const source = target.from ? D.passages.find((p) => p.id === target.from.passage) : null;
  let sentence = null;
  let sentenceTokens = null;
  if (source) {
    const tokens = source.tokens;
    let start = target.from.index;
    let end = target.from.index;
    while (start > 0 && !'。！？'.includes(tokens[start - 1].s)) start -= 1;
    while (end < tokens.length - 1 && !'。！？'.includes(tokens[end].s)) end += 1;
    sentenceTokens = tokens.slice(start, end + 1);
    sentence = sentenceTokens.map((t) => t.s).join('');
  }

  const box = el('div', 'card-preview');
  const kind = S.variants.cards;
  box.append(
    el(
      'p',
      'card-kind',
      kind === 'mcd'
        ? tx('MCD — 文脈まるごと、一語だけ空ける', 'MCD card — the whole context, one word blanked')
        : tx('単語札 — 表は語だけ（Animecards）', 'Word card — the front is the word alone (Animecards)'),
    ),
  );
  const face = el('div', 'card-face');

  if (kind === 'mcd') {
    if (sentenceTokens) {
      for (const token of sentenceTokens) {
        if (token.b === target.id && token.c) {
          face.append(el('span', 'cloze', '　　'));
        } else {
          face.append(document.createTextNode(token.s));
        }
      }
    } else {
      face.append(document.createTextNode(`［${target.id}］の文脈がない`));
    }
  } else {
    face.append(el('span', 'target', target.id));
  }
  box.append(face);

  const back = el('div', 'card-back');
  const word = D.words[target.id];
  const reading = word?.r || '';
  const gloss = word?.g || '';
  if (kind === 'mcd') {
    back.textContent = `${target.id}${reading ? `（${reading}）` : ''}${gloss ? ` — ${gloss}` : ''}`;
  } else {
    back.textContent =
      `${reading}${gloss ? ` — ${gloss}` : ''}` + (sentence ? `\n${sentence}` : '');
    back.style.whiteSpace = 'pre-line';
  }
  box.append(back);

  if (!sentence) {
    const note = el('div', 'note placeholder');
    note.innerHTML = tx(
      '<b>仮置き</b> — このノードは本文から開いていないので文脈の文がない。MCD 側は文脈がないと成立しない、というのがこの比較の要点のひとつ。',
      '<b>placeholder</b> — this node was not opened from a text, so there is no context sentence. That an MCD card cannot exist without context is one of the points of this comparison.',
    );
    box.append(note);
  }
  container.append(box);
}

/** Real usages from the committed shelf: sentences containing the word. */
function findExamples(id, cap = 4) {
  const out = [];
  for (const p of D.passages) {
    let sentence = [];
    let hit = false;
    for (const t of p.tokens) {
      sentence.push(t);
      if (t.c && t.b === id) hit = true;
      if ('。！？'.includes(t.s)) {
        if (hit) out.push({ tokens: sentence, source: p.sourceLabel, passage: p.id });
        sentence = [];
        hit = false;
        if (out.length >= cap) return out;
      }
    }
    if (hit && sentence.length) out.push({ tokens: sentence, source: p.sourceLabel, passage: p.id });
    if (out.length >= cap) return out;
  }
  return out;
}

function renderWordNode(sheet, node) {
  const rec = lookup(node.id);
  const legacy = D.words[node.id];
  const label = node.id;
  const head = el('h2', 'headword');
  head.append(document.createTextNode(label));
  if (rec?.alt) head.append(el('span', 'headword-alt', `／${rec.alt}`));
  sheet.append(head);
  if (rec?.r) sheet.append(el('p', 'reading', rec.r));

  // TRANSLATION — every sense, most common first (JMdict order)
  if (rec?.m?.length) {
    const box = el('div', 'senses');
    if (rec.p) box.append(el('p', 'sense-pos', rec.p));
    if (rec.m.length === 1) {
      box.append(el('p', 'gloss', rec.m[0]));
    } else {
      const ol = el('ol', 'sense-list');
      for (const m of rec.m) ol.append(el('li', null, m));
      box.append(ol);
    }
    sheet.append(box);
  } else {
    const gloss = el('p', 'gloss absent');
    gloss.textContent = tx('この語の語釈はまだない。読みと接続は下にある。', 'No gloss for this word yet — its reading and connections continue below.');
    sheet.append(gloss);
  }
  const jlpt = rec?.jlpt || (legacy?.jlpt ? `N${legacy.jlpt}` : null);
  if (jlpt) {
    const meta = el('div', 'shelf-meta');
    meta.append(el('span', 'pool-tag', `JLPT ${String(jlpt).replace(/^N?/, 'N')}`));
    sheet.append(meta);
  }

  // KANJI IN THIS WORD — each row opens that kanji's full entry
  const rowChars = (rec?.k?.length ? rec.k : [...node.id]).filter((c) => D.kanji[c]);
  if (rowChars.length) {
    sheet.append(withEn(el('p', 'eyebrow', 'この語の漢字'), 'kanji in this word', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of rowChars) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.dataset.kanjirow = c;
      row.append(el('span', 'row-glyph', c));
      row.append(el('span', 'row-main', D.kanji[c].m));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'kanji', id: c, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // EXAMPLES — real sentences from the shelf, target in red
  const examples = findExamples(node.id);
  if (examples.length) {
    sheet.append(withEn(el('p', 'eyebrow', '用例'), 'examples from the shelf', 'en-inline'));
    for (const ex of examples) {
      const line = el('div', 'example');
      const text = el('p', 'example-ja');
      for (const t of ex.tokens) {
        if (t.c && t.b === node.id) text.append(el('span', 'example-hit', t.s));
        else text.append(document.createTextNode(t.s));
      }
      line.append(text);
      line.append(el('span', 'example-src', ex.source));
      sheet.append(line);
    }
  }

  // the semantic neighbourhood — the single most important surface here
  const edges = D.sem[node.id];
  const semWrap = el('div');
  semWrap.append(
    withEn(el('p', 'eyebrow', '意味の近く — 使い分けつき'), 'nearby in meaning — and how they differ', 'en-inline'),
  );
  if (edges && edges.length) {
    const byRel = {};
    for (const edge of edges) (byRel[edge.rel] ||= []).push(edge);
    for (const [rel, [jp, en]] of Object.entries(REL)) {
      const group = byRel[rel];
      if (!group) continue;
      const block = el('div', 'sem-group');
      const heading = el('p', 'sem-head');
      heading.append(el('span', null, jp));
      heading.append(el('span', 'latin', en));
      block.append(heading);
      for (const edge of group) {
        const row = el('button', 'sem-row');
        row.type = 'button';
        row.dataset.sem = edge.w;
        row.append(el('span', 'sem-word', edge.w));
        row.append(el('span', 'sem-note', edge.note));
        row.addEventListener('click', () => go({ t: 'word', id: edge.w, from: node.from }));
        block.append(row);
      }
      semWrap.append(block);
    }
  } else {
    const empty = el('div', 'sem-empty');
    empty.textContent = tx(
      'この語の意味近傍はまだ書かれていない。書かれている語：',
      'Usage notes for this word are still being written. These words have them:',
    );
    semWrap.append(empty);
    const seeds = Object.keys(D.sem).slice(0, 6);
    semWrap.append(
      chipsFor(
        seeds.map((w) => ({ label: w, sub: tx('書かれている語', 'has notes') })),
        (item) => go({ t: 'word', id: item.label, from: node.from }),
        null,
        'word',
      ),
    );
  }
  sheet.append(semWrap);

  sheet.append(takeButton(node, label));
  renderListPicker(sheet, node, label);
  renderCardVariant(sheet, { id: node.id, from: node.from });
  renderSchedule(sheet);
}

function renderKanjiNode(sheet, node) {
  const k = D.kanji[node.id];
  if (!k) {
    sheet.append(el('div', 'sem-empty', tx('この字はこの層にない。', 'This kanji is not in this layer.')));
    return;
  }
  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', k.c));
  const meta = el('div', 'hero-meta');
  meta.append(el('div', 'hero-mean', k.m));
  const chips = el('div', 'shelf-meta');
  chips.append(el('span', 'pool-tag', tx(`${k.st} 画`, `${k.st} strokes`)));
  if (D.kanken[k.c]?.kk) chips.append(el('span', 'pool-tag', `漢検 ${D.kanken[k.c].kk}`));
  if (D.kmeta?.[k.c]?.jlpt) chips.append(el('span', 'pool-tag', `JLPT ${D.kmeta[k.c].jlpt}`));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  const kv = el('dl', 'kv');
  const on = el('dd');
  on.append(el('span', 'on', k.on.join('・') || '—'));
  kv.append(withEn(el('dt', null, '音'), 'on'), on);
  const kun = el('dd');
  kun.append(el('span', 'on', k.kun.join('・') || '—'));
  kv.append(withEn(el('dt', null, '訓'), 'kun'), kun);
  sheet.append(kv);

  // STROKE ORDER — KanjiVG paths, numbered at each stroke's start
  const paths = D.strokes?.[k.c];
  if (paths?.length) {
    sheet.append(withEn(el('p', 'eyebrow', '筆順'), 'stroke order', 'en-inline'));
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 109 109');
    svg.setAttribute('class', 'strokes');
    svg.id = 'strokes';
    paths.forEach((d, i) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
      const m = d.match(/M\s*([\d.]+)[\s,]+([\d.]+)/);
      if (m) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', m[1]);
        t.setAttribute('y', m[2]);
        t.textContent = String(i + 1);
        svg.append(t);
      }
    });
    sheet.append(svg);
  }

  if (k.parts.length) {
    sheet.append(withEn(el('p', 'eyebrow', '部品'), 'components', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of k.parts) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.append(el('span', 'row-glyph', c));
      row.append(el('span', 'row-main', D.radicals[c]?.name || tx('名称なし', 'unnamed part')));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'radical', id: c, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // COMMON COMPOUNDS — reading + first gloss per row, every row a door
  const words = D.kanjiWords[k.c] || [];
  if (words.length) {
    sheet.append(withEn(el('p', 'eyebrow', `よく使う語 — ${words.length} 語`), 'common compounds', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const w of words.slice(0, D.wordCap)) {
      const g = lookup(w);
      const row = el('button', 'entry-row compound');
      row.type = 'button';
      const main = el('span', 'row-stack');
      const top = el('span', 'row-word');
      top.append(document.createTextNode(w));
      if (g?.r) top.append(el('span', 'row-reading', g.r));
      main.append(top);
      if (g?.m?.[0]) main.append(el('span', 'row-gloss', g.m[0]));
      row.append(main);
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'word', id: w, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  } else {
    sheet.append(withEn(el('p', 'eyebrow', 'この字を含む語'), 'words that contain it', 'en-inline'));
    sheet.append(
      el('div', 'sem-empty', tx('この字を含む語は辞書側にまだない。部品からは続けられる。', 'No listed word contains this kanji yet — the walk continues through its parts.')),
    );
  }

  const idioms = D.idiomsByKanji[k.c] || [];
  if (idioms.length) {
    const heading = el('p', 'eyebrow');
    heading.append(document.createTextNode(`熟語・慣用句 — ${idioms.length}　`));
    if (bi()) heading.append(el('span', 'en-inline', 'idioms and set phrases'));
    sheet.append(heading);
    sheet.append(
      chipsFor(
        idioms.slice(0, 24).map((w) => ({ label: w, sub: D.idioms[w]?.r || '' })),
        (item) => go({ t: 'idiom', id: item.label, from: node.from }),
        null,
        'idiom',
      ),
    );
  }

  sheet.append(takeButton(node, k.c));
  renderListPicker(sheet, node, k.c);
  renderSchedule(sheet);
}

function renderRadicalNode(sheet, node) {
  const r = D.radicals[node.id];
  if (!r) {
    sheet.append(el('div', 'sem-empty', tx('この部品はこの層にない。', 'This part is not in this layer.')));
    return;
  }
  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', r.c));
  const meta = el('div', 'hero-meta');
  meta.append(
    el('div', 'hero-mean', r.name || tx('（名称は漢検の部首表にない部品）', '(a part with no name in the 漢検 radical table)')),
  );
  const chips = el('div', 'shelf-meta');
  if (r.st) chips.append(el('span', 'pool-tag', tx(`${r.st} 画`, `${r.st} strokes`)));
  chips.append(el('span', 'pool-tag', tx(`${r.kanjiCount} 字`, `${r.kanjiCount} kanji`)));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  const note = el('div', 'note');
  note.textContent = tx('「この部品を含む」族。康熙部首の分類ではない。', 'The family of characters containing this part — not the Kangxi radical classification.');
  sheet.append(note);

  if (r.isKanji && D.kanji[r.c]) {
    sheet.append(
      chipsFor(
        [{ label: r.c, sub: tx('字としても見る', 'view as a kanji') }],
        (item) => go({ t: 'kanji', id: item.label, from: node.from }),
        null,
        'kanji',
      ),
    );
  }

  sheet.append(
    withEn(
      el(
        'p',
        'eyebrow',
        r.kanjiCount > r.kanji.length
          ? `この部品を含む字 — ${r.kanjiCount} 字のうち ${r.kanji.length} 字`
          : `この部品を含む字 — ${r.kanjiCount} 字`,
      ),
      'kanji that contain this part',
      'en-inline',
    ),
  );
  sheet.append(
    chipsFor(
      r.kanji.map((c) => ({ label: c, sub: D.kanken[c]?.kk || '' })),
      (item) => go({ t: 'kanji', id: item.label, from: node.from }),
      null,
      'kanji',
    ),
  );

  sheet.append(takeButton(node, r.c));
  renderListPicker(sheet, node, r.c);
  renderSchedule(sheet);
}

function renderIdiomNode(sheet, node) {
  const idiom = D.idioms[node.id];
  if (!idiom) {
    sheet.append(el('div', 'sem-empty', tx('この句はこの層にない。', 'This phrase is not in this layer.')));
    return;
  }
  const head = el('h2', 'headword', idiom.w);
  sheet.append(head);
  sheet.append(el('p', 'reading', idiom.r));
  const meta = el('div', 'shelf-meta');
  if (idiom.yoji) meta.append(withEn(el('span', 'pool-tag', '四字熟語'), 'four-character idiom'));
  sheet.append(meta);
  for (const g of idiom.g) sheet.append(el('p', 'gloss', g));

  sheet.append(withEn(el('p', 'eyebrow', '字へ'), 'into the kanji', 'en-inline'));
  sheet.append(
    chipsFor(
      idiom.k.map((c) => ({ label: c, sub: D.kanken[c]?.kk || '' })),
      (item) => go({ t: 'kanji', id: item.label, from: node.from }),
      null,
      'kanji',
    ),
  );
  sheet.append(takeButton(node, idiom.w));
  renderListPicker(sheet, node, idiom.w);
  renderSchedule(sheet);
}

function renderSheet(root) {
  const node = S.stack[S.stack.length - 1];
  if (!node) return;
  const scrim = el('div', 'scrim');
  scrim.addEventListener('click', back);
  root.append(scrim);
  const sheet = el('div', 'sheet');
  sheet.id = 'sheet';
  sheet.dataset.node = `${node.t}:${node.id}`;
  sheet.append(el('div', 'sheet-grip'));

  // the sheet carries its own way out — "NO BACK OPTION" (operator, on-device)
  const bar = el('div', 'sheet-bar');
  const backBtn = biLabel('button', 'sheet-back', '← 戻る', 'back');
  backBtn.type = 'button';
  backBtn.id = 'sheet-back';
  backBtn.addEventListener('click', back);
  bar.append(backBtn);
  if (S.stack.length > 1) {
    bar.append(el('span', 'sheet-depth', S.stack.map((n) => nodeTitle(n)).join(' › ')));
  }
  const closeBtn = el('button', 'sheet-close', '✕');
  closeBtn.type = 'button';
  closeBtn.id = 'sheet-close';
  closeBtn.title = tx('とじる', 'close');
  closeBtn.addEventListener('click', () => {
    S.stack = [];
    render();
    if (S.view === 'reader') window.scrollTo(0, S.readerScroll);
  });
  bar.append(closeBtn);
  sheet.append(bar);

  if (node.t === 'word') renderWordNode(sheet, node);
  else if (node.t === 'kanji') renderKanjiNode(sheet, node);
  else if (node.t === 'radical') renderRadicalNode(sheet, node);
  else if (node.t === 'idiom') renderIdiomNode(sheet, node);
  else if (node.t === 'grammar') renderGrammarNode(sheet, node);
  else if (node.t === 'particle') renderParticleNode(sheet, node);
  root.append(sheet);
}

function licencePanel() {
  const box = el('div', 'note');
  box.append(
    document.createTextNode(
      tx(
        '出典と licence。二つのプールは別ファイルに分けて配っている（corpus #51/#41）。' +
          'この試作は両方を読み込むので、成果物自体は ShareAlike 側に従う。' +
          'それを黙って混ぜるのではなく、こう表に出している。',
        'Sources and licences. The two pools ship as separate files (corpus #51/#41). ' +
          'This prototype loads both, so the artifact itself follows the ShareAlike side — ' +
          'stated here rather than mixed silently.',
      ),
    ),
  );
  for (const [pool, sources] of Object.entries(D.sources)) {
    const line = el('p');
    line.style.margin = '8px 0 0';
    line.append(el('span', pool === 'share_alike' ? 'pool-tag sa' : 'pool-tag', pool));
    line.append(document.createTextNode(' ' + sources.map((s) => `${s.name}（${s.licence}）`).join(' · ')));
    box.append(line);
  }
  return box;
}

/* --------------------------------------------------------- debug strip */
function renderVariants(root) {
  const bar = el('div');
  bar.id = 'variants';
  const top = el('div', 'vbar');
  const toggle = biLabel('button', 'vtoggle', S.debugOpen ? '変異 ▾' : '変異 ▴', 'variants');
  toggle.type = 'button';
  toggle.id = 'variants-toggle';
  toggle.addEventListener('click', () => {
    S.debugOpen = !S.debugOpen;
    render();
  });
  top.append(toggle);
  const summary = el('span', 'measure');
  summary.textContent = Object.entries(S.variants)
    .map(([k, v]) => {
      const opt = VARIANTS[k].options.find(([id]) => id === v);
      return bi() ? `${VARIANTS[k].en}: ${opt[2]}` : `${VARIANTS[k].label.split(' ')[0]}:${v}`;
    })
    .join(bi() ? ' · ' : '  ');
  top.append(summary);
  bar.append(top);

  if (S.debugOpen) {
    const body = el('div', 'vbody');
    for (const [key, spec] of Object.entries(VARIANTS)) {
      const row = el('div', 'vrow');
      const label = el('span', 'vlabel', spec.label);
      if (bi()) label.append(el('span', 'en-sub', spec.en));
      row.append(label);
      const seg = el('div', 'vseg');
      for (const [id, ja, en] of spec.options) {
        const b = biLabel('button', null, ja, en);
        b.type = 'button';
        b.dataset.variant = `${key}:${id}`;
        b.setAttribute('aria-pressed', String(S.variants[key] === id));
        b.addEventListener('click', () => {
          S.variants[key] = id;
          if (key === 'entry') {
            if (id === 'field' && S.view === 'shelf') S.view = 'entry';
            if (id === 'shelf' && S.view === 'entry') S.view = 'shelf';
          }
          render();
        });
        seg.append(b);
      }
      row.append(seg);
      body.append(row);
    }
    const measure = el('div', 'measure');
    measure.id = 'measure';
    body.append(measure);
    bar.append(body);
  }
  root.append(bar);
}

function updateMeasurements() {
  const out = $('#measure');
  if (!out) return;
  const probe = $('.shelf-snippet') || $('.sig-name') || $('.crumb');
  const reader = $('#reader') || $('.reader') || $('.shelf-title');
  const faint = probe ? contrastOf(probe) : null;
  const ink = $('.view-title') ? contrastOf($('.view-title')) : null;
  const readerPx = reader ? Math.round(parseFloat(getComputedStyle(reader).fontSize)) : null;
  const chromePx = Math.round(parseFloat(getComputedStyle(document.querySelector('.crumb')).fontSize));
  out.textContent = tx(
    `測定：淡色 ${faint ?? '—'}:1 · 本文墨 ${ink ?? '—'}:1 · 焦点 ${readerPx ?? '—'}px / 周辺 ${chromePx}px`,
    `measured: faint text ${faint ?? '—'}:1 · body ink ${ink ?? '—'}:1 · focus ${readerPx ?? '—'}px vs chrome ${chromePx}px`,
  );
}

/* --------------------------------------------------------------- render */
function render() {
  removeMini();
  const root = $('#app');
  root.textContent = '';
  document.body.classList.toggle('v-contrast-wcag', S.variants.contrast === 'wcag');
  document.body.classList.toggle('v-depth-layered', S.variants.depth === 'layered');
  document.body.classList.toggle('ui-bi', bi());

  const chrome = el('div', 'chrome');
  const backBtn = biLabel('button', null, '戻る', 'back');
  backBtn.type = 'button';
  backBtn.id = 'back';
  const atHome = !S.stack.length && (S.view === 'entry' || (S.view === 'shelf' && S.variants.entry === 'shelf'));
  backBtn.disabled = atHome;
  backBtn.addEventListener('click', back);
  chrome.append(backBtn);

  const crumb = el('div', 'crumb');
  const parts = [];
  if (S.view === 'entry') parts.push(tx('野', 'field'));
  else parts.push(tx('本棚', 'bookshelf'));
  if (S.view === 'reader' && passage()) parts.push(passage().title);
  if (S.view === 'tray') parts.push(tx('リスト', 'lists'));
  if (S.view === 'grammar') parts.push(tx('文法', 'grammar'));
  for (const node of S.stack) parts.push(nodeTitle(node));
  crumb.innerHTML = parts.map((p, i) => (i === parts.length - 1 ? `<b>${p}</b>` : p)).join(' › ');
  chrome.append(crumb);

  // EN | 日本語 — two visible states, the active one lit
  const langSeg = el('div', 'lang-seg');
  langSeg.id = 'lang';
  langSeg.setAttribute('aria-pressed', String(bi()));
  for (const [id, label] of [
    ['bi', 'EN'],
    ['ja', '日本語'],
  ]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.dataset.lang = id;
    b.setAttribute('aria-pressed', String(S.lang === id));
    b.addEventListener('click', () => {
      S.lang = id;
      render();
    });
    langSeg.append(b);
  }
  chrome.append(langSeg);

  const trayBtn = biLabel('button', null, `覚 ${S.taken.length}`, 'lists');
  trayBtn.type = 'button';
  trayBtn.id = 'tray';
  trayBtn.addEventListener('click', () => {
    S.stack = [];
    S.view = 'tray';
    render();
  });
  chrome.append(trayBtn);
  root.append(chrome);

  const main = el('main');
  root.append(main);

  if (!S.ready) {
    main.append(el('div', 'loading', tx('回廊 をひらいています…', 'opening the corridor…')));
    renderVariants(root);
    return;
  }

  if (S.view === 'entry') renderEntry(main);
  else if (S.view === 'reader') renderReader(main);
  else if (S.view === 'tray') renderTray(main);
  else if (S.view === 'grammar') renderGrammar(main);
  else renderShelf(main);

  renderSheet(root);
  renderVariants(root);
  updateMeasurements();
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    document.body.dataset.error = String(err);
    const root = $('#app');
    root.textContent = '';
    root.append(el('div', 'loading', `読み込めなかった could not load: ${err.message}`));
  });
});
