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
  sa: ['kanji', 'words', 'idioms'],
};

/** The four open decisions. Crude and obvious on purpose — it is an instrument. */
const VARIANTS = {
  cards: {
    ticket: 38,
    label: 'A 札の形 #38',
    options: [
      ['mcd', 'MCD 文脈'],
      ['word', '単語札'],
    ],
  },
  difficulty: {
    ticket: 43,
    label: 'B 難易度 #43',
    options: [
      ['three', '3信号'],
      ['band', '帯+不確実'],
    ],
  },
  contrast: {
    ticket: 47,
    label: 'C 可読性 #47',
    options: [
      ['current', '現行の淡さ'],
      ['wcag', 'WCAG 準拠'],
    ],
  },
  entry: {
    ticket: 37,
    label: 'D 入口 #37',
    options: [
      ['field', 'ドリフトの野'],
      ['shelf', '読む棚'],
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

const S = {
  ready: false,
  view: 'shelf',
  passageId: null,
  readerScroll: 0,
  stack: [],
  dials: { kanji: 0, furigana: 2, spacing: 0 },
  variants: { cards: 'mcd', difficulty: 'three', contrast: 'current', entry: 'shelf' },
  taken: [],
  debugOpen: false,
};

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

/* ------------------------------------------------------------------ load */
async function boot() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(VARIANTS)) {
    const v = params.get(key);
    if (v && VARIANTS[key].options.some(([id]) => id === v)) S.variants[key] = v;
  }
  if (params.get('dials')) {
    const [k, f, s] = params.get('dials').split(',').map(Number);
    if ([k, f, s].every((n) => n >= 0 && n <= 2)) S.dials = { kanji: k, furigana: f, spacing: s };
  }
  if (S.variants.entry === 'field') S.view = 'entry';

  render();

  const load = async (pool, name) => {
    const res = await fetch(`data/${pool}/${name}.json`);
    if (!res.ok) throw new Error(`data/${pool}/${name}.json → ${res.status}`);
    return res.json();
  };
  const [passages, kanken, sem, kanji, words, idioms, manifest, pin] = await Promise.all([
    ...DATA.safe.map((n) => load('proprietary_safe', n)),
    ...DATA.sa.map((n) => load('share_alike', n)),
    fetch('data/manifest.json').then((r) => r.json()),
    fetch('data/fsrs-pin.json').then((r) => r.json()),
  ]);

  D.passages = passages.passages;
  D.passageSources = passages.sources;
  D.kanken = kanken.levels;
  D.sem = sem.edges;
  D.kanji = kanji.kanji;
  D.radicals = kanji.radicals;
  D.words = words.words;
  D.idioms = Object.fromEntries(idioms.idioms.map((i) => [i.w, i]));
  D.idiomsByKanji = idioms.byKanji;
  D.idiomMeta = { total: idioms.totalCandidates, cap: idioms.cap };
  D.manifest = manifest;
  D.pin = pin;
  D.sources = {
    proprietary_safe: [...passages.sources, ...kanken.sources, ...sem.sources],
    share_alike: [...kanji.sources, ...words.sources, ...idioms.sources],
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
    fsrsApi = await import('./vendor/ts-fsrs.mjs');
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
  if (S.view === 'reader' || S.view === 'tray') {
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
      value: jr.score == null ? '—' : `${jr.score.toFixed(2)} ${jr.band}`,
      fill: jr.score == null ? 0 : (JREAD_MAX - jr.score) / (JREAD_MAX - JREAD_MIN),
      hint: '6.4 易 → 0.5 難（独自の尺度）',
    },
    {
      name: '語彙カバー率',
      value: cov.coverage == null ? '—' : `${(cov.coverage * 100).toFixed(1)}%`,
      fill: cov.coverage == null ? 0 : 1 - cov.coverage,
      hint: '国語研 6,103 語に対する内容語の被覆（高いほど易）',
    },
    {
      name: 'TMR（核）',
      value: core == null ? '—' : `${(core * 100).toFixed(1)}%`,
      fill: core ?? 0,
      hint: '◎ 2,071 語より上の語の割合（高いほど難）',
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
      line.append(el('span', 'sig-name', row.name));
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
    foot.append(el('span', null, '3つの信号。平均しない。'));
    if (grading.disagreement.flag) {
      foot.append(el('span', 'disagree-tag', `不一致 gap ${grading.disagreement.detail.max_gap}`));
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
    legend.append(el('span', null, '易'), el('span', null, '中'), el('span', null, '難'));
    box.append(el('div', 'sig-name', '難易度の帯'), scale, legend);
    if (grading.disagreement.flag) {
      const mark = el('div', 'uncertain');
      mark.append(el('span', null, '⁉'), el('span', null, `不確実 — 3信号が ${grading.disagreement.detail.max_gap} 段ずれている`));
      box.append(mark);
    }
    wrap.append(box);
  }

  if (!compact) {
    const note = el('div', 'note');
    note.textContent =
      '#58 で測定済み：jreadability はやさしい日本語を「易しくない」と採点する（符号が逆、2 seed で再現）。' +
      'だから単一の数値は出さない。';
    wrap.append(note);
  }
  return wrap;
}

/* ---------------------------------------------------------------- views */
function renderShelf(main) {
  main.append(el('p', 'eyebrow', '回廊 · よみものの棚'));
  const h = el('h1', 'view-title', '実データの棚');
  main.append(h);
  const sub = el('p', 'shelf-snippet');
  sub.textContent = `${D.passages.length} 本 — ウィキニュース (CC BY 4.0)・青空文庫 (PD, 新字新仮名)・やさしい日本語 用語集。難易度は実測の3信号。`;
  main.append(sub);

  for (const p of D.passages) {
    const item = el('button', 'shelf-item');
    item.type = 'button';
    item.dataset.passage = p.id;
    item.append(el('div', 'shelf-title', p.title));
    const meta = el('div', 'shelf-meta');
    meta.append(el('span', null, p.sourceLabel));
    if (p.date) meta.append(el('span', null, p.date));
    meta.append(el('span', 'pool-tag', p.licence));
    if (p.rubySource === 'markup') meta.append(el('span', 'pool-tag', 'ルビ原文'));
    if (p.truncated) meta.append(el('span', 'pool-tag', '抜粋'));
    item.append(meta);
    item.append(el('div', 'shelf-snippet', p.text.slice(0, 64)));
    item.append(renderSignals(p.grading, { compact: true }));
    item.addEventListener('click', () => openPassage(p.id));
    main.append(item);
  }

  const note = el('div', 'note');
  note.textContent =
    '本文は原典の先頭からの抜粋（文単位、文の途中では切らない）。採点は画面に出ている本文そのものに対して実行したもの。';
  main.append(note);
  main.append(licencePanel());
}

function dialRow(labelText, key, options) {
  const row = el('div', 'dial');
  row.append(el('span', 'dial-label', labelText));
  const seg = el('div', 'seg');
  options.forEach((label, index) => {
    const b = el('button', null, label);
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

function renderReader(main) {
  const p = passage();
  if (!p) {
    S.view = 'shelf';
    return renderShelf(main);
  }
  main.append(el('p', 'eyebrow', p.sourceLabel));
  main.append(el('h1', 'view-title', p.title));

  const meta = el('div', 'shelf-meta');
  meta.append(el('span', 'pool-tag', p.licence));
  meta.append(
    el(
      'span',
      'pool-tag',
      p.rubySource === 'markup' ? 'ふりがな：原文のルビ' : 'ふりがな：UniDic 由来（数詞+助数詞は誤る）',
    ),
  );
  main.append(meta);
  main.append(renderSignals(p.grading, { compact: true }));

  const dials = el('div', 'dials');
  dials.append(el('div', 'dial-label', '文字の出しかた — 三つの独立したダイヤル'));
  dials.append(dialRow('漢字', 'kanji', ['そのまま', '常用まで', 'すべて仮名']));
  dials.append(dialRow('ふりがな', 'furigana', ['なし', '触れて', 'つねに']));
  dials.append(dialRow('分かち', 'spacing', ['なし', '語の間', '文節']));
  main.append(dials);

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
    if (token.c) {
      span.addEventListener('click', () => {
        if (S.dials.furigana === 1) {
          (S.revealed ||= new Set()).add(index);
        }
        go({ t: 'word', id: token.b, from: { passage: p.id, index } });
      });
    }
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
    note.textContent = `原典からの抜粋（先頭 ${p.text.length} 字、文単位）。`;
    if (p.url) {
      const a = el('a', null, ' 原典');
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
    node.style.opacity = String(0.35 + ((i * 13) % 50) / 100);
    node.style.animationDuration = `${9 + (i % 7)}s`;
    node.style.animationDelay = `-${i * 0.7}s`;
    node.addEventListener('click', () => go({ t: 'word', id: word }));
    field.append(node);
  });
  const enter = el('button', 'field-enter', '棚へ　→');
  enter.type = 'button';
  enter.id = 'enter-shelf';
  enter.addEventListener('click', () => {
    S.view = 'shelf';
    render();
  });
  field.append(enter);
  main.append(field);

  const note = el('div', 'note placeholder');
  note.innerHTML =
    '<b>仮置き</b> — これは入口の位置を比べるための最小の野であって、Drift そのものではない。' +
    'Drift の物理とジェスチャ文法は #46 で未決のまま、触っていない。本物の Drift はサイトの root にある。';
  main.append(note);
}

function renderTray(main) {
  main.append(el('p', 'eyebrow', '取ったもの'));
  main.append(el('h1', 'view-title', `${S.taken.length} 件`));
  const note = el('div', 'note');
  note.textContent =
    'これは読み取り専用のプレビュー。イベントログには何も書かない（スケジューラ本体は範囲外 — #40）。';
  main.append(note);
  if (!S.taken.length) {
    main.append(el('div', 'sem-empty', 'まだ何も取っていない。どのノードからでも「取る」で入る。'));
    return;
  }
  for (const item of S.taken) {
    const line = el('div', 'tray-line');
    const w = el('span', 'w', item.label);
    line.append(w);
    line.append(el('span', 'pool-tag', item.kind));
    const preview = schedulePreview();
    line.append(el('span', 'when', preview ? preview.good.when : '—'));
    line.addEventListener('click', () => go({ t: item.t, id: item.id }));
    main.append(line);
  }
}

/* ---------------------------------------------------------------- nodes */
function nodeTitle(node) {
  if (node.t === 'word') return node.id;
  if (node.t === 'kanji') return node.id;
  if (node.t === 'radical') return node.id;
  if (node.t === 'idiom') return node.id;
  return '';
}

function chipsFor(items, onTap, sub) {
  const wrap = el('div', 'chips');
  for (const item of items) {
    const chip = el('button', 'chip');
    chip.type = 'button';
    chip.append(el('span', 'big', item.label));
    const subText = sub ? sub(item) : item.sub;
    if (subText) chip.append(el('span', 'sub', subText));
    chip.addEventListener('click', () => onTap(item));
    wrap.append(chip);
  }
  return wrap;
}

function takeButton(node, label) {
  const already = S.taken.some((t) => t.t === node.t && t.id === node.id);
  const btn = el('button', already ? 'take taken' : 'take', already ? '取った ✓' : '取る');
  btn.type = 'button';
  btn.id = 'take';
  btn.addEventListener('click', () => {
    if (already) return;
    S.taken.push({
      t: node.t,
      id: node.id,
      label,
      kind: node.t === 'word' ? '語' : node.t === 'kanji' ? '漢字' : node.t === 'radical' ? '部品' : '熟語',
      from: node.from || null,
    });
    render();
  });
  return btn;
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
      when: days >= 1 ? `${days} 日後` : `${mins} 分後`,
      due: next.due.toISOString().slice(0, 16).replace('T', ' '),
      stability: next.stability,
      difficulty: next.difficulty,
    };
  }
  return out;
}

function renderSchedule(container) {
  const preview = schedulePreview();
  container.append(el('p', 'card-kind', `予定される復習 — FSRS-6 · ${D.pin.parameterSetId}`));
  if (!preview) {
    container.append(el('div', 'sem-empty', 'スケジューラを読み込めなかった。'));
    return;
  }
  const table = el('table', 'sched');
  const head = el('tr');
  for (const h of ['評価', 'つぎ', '日時', '安定度']) head.append(el('th', null, h));
  table.append(head);
  const labels = { again: 'もう一度', hard: '難しい', good: 'ふつう', easy: '簡単' };
  for (const key of ['again', 'hard', 'good', 'easy']) {
    const row = el('tr');
    row.append(el('td', null, labels[key]));
    row.append(el('td', key === 'good' ? 'good' : null, preview[key].when));
    row.append(el('td', null, preview[key].due));
    row.append(el('td', null, preview[key].stability.toFixed(2)));
    table.append(row);
  }
  container.append(table);
  const note = el('div', 'note');
  note.textContent =
    `新規カードを「いま」評価した場合の実計算（${D.pin.package} ${D.pin.pinnedVersion}、` +
    `retention ${D.pin.requestRetention}、fuzz ${D.pin.enableFuzz ? 'on' : 'off'}）。` +
    'packages/domain の pin をそのまま読んでいる。書き込みはしない。';
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
      kind === 'mcd' ? 'MCD — 文脈まるごと、一語だけ空ける' : '単語札 — 表は語だけ（Animecards）',
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
    note.innerHTML =
      '<b>仮置き</b> — このノードは本文から開いていないので文脈の文がない。MCD 側は文脈がないと成立しない、というのがこの比較の要点のひとつ。';
    box.append(note);
  }
  container.append(box);
  const compare = el('div', 'note');
  compare.textContent =
    '#38：十五年決着していない議論。下の帯で切り替えて、同じ語が両方でどう見えるかを比べる。';
  container.append(compare);
}

function renderWordNode(sheet, node) {
  const word = D.words[node.id];
  const label = node.id;
  const head = el('h2', 'headword');
  head.append(document.createTextNode(label));
  sheet.append(head);
  if (word?.r) {
    const reading = el('p', 'reading', word.r);
    if (word.rd) reading.title = 'reading derived from the pinned UniDic tokenizer';
    sheet.append(reading);
  }

  const gloss = el('p', word?.g ? 'gloss' : 'gloss absent');
  gloss.textContent =
    word?.g || 'この語の語釈はまだこの層にない（6,687 語の辞書に載っていない語）。読みと接続は下にある。';
  sheet.append(gloss);

  if (word?.jlpt) {
    const meta = el('div', 'shelf-meta');
    meta.append(el('span', 'pool-tag', `JLPT N${word.jlpt}`));
    meta.append(el('span', 'pool-tag sa', 'ShareAlike 由来の語釈'));
    sheet.append(meta);
  }

  // the semantic neighbourhood — the single most important surface here
  const edges = D.sem[node.id];
  const semWrap = el('div');
  semWrap.append(el('p', 'eyebrow', '意味の近く — 使い分けつき'));
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
    empty.textContent =
      `この語には意味近傍がまだ書かれていない。SEM 層は現在 ${D.manifest.counts.semHeads} 語（辞書の約 1.2%）。` +
      '空白を隠さずに見せている — 拡大は #44。';
    semWrap.append(empty);
    const seeds = Object.keys(D.sem).slice(0, 6);
    semWrap.append(
      chipsFor(
        seeds.map((w) => ({ label: w, sub: '書かれている語' })),
        (item) => go({ t: 'word', id: item.label, from: node.from }),
      ),
    );
  }
  sheet.append(semWrap);

  const chars = (word?.k || [...node.id].filter((c) => D.kanji[c])).filter((c) => D.kanji[c]);
  if (chars.length) {
    sheet.append(el('p', 'eyebrow', '字へ'));
    sheet.append(
      chipsFor(
        chars.map((c) => ({ label: c, sub: D.kanken[c]?.kk || '級なし' })),
        (item) => go({ t: 'kanji', id: item.label, from: node.from }),
      ),
    );
  }

  sheet.append(takeButton(node, label));
  renderCardVariant(sheet, { id: node.id, from: node.from });
  renderSchedule(sheet);
}

function renderKanjiNode(sheet, node) {
  const k = D.kanji[node.id];
  if (!k) {
    sheet.append(el('div', 'sem-empty', 'この字はこの層にない。'));
    return;
  }
  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', k.c));
  const meta = el('div', 'hero-meta');
  meta.append(el('div', 'hero-mean', k.m));
  const chips = el('div', 'shelf-meta');
  chips.append(el('span', 'pool-tag', `${k.st} 画`));
  if (D.kanken[k.c]?.kk) chips.append(el('span', 'pool-tag', `漢検 ${D.kanken[k.c].kk}`));
  chips.append(el('span', 'pool-tag sa', 'ShareAlike'));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  const kv = el('dl', 'kv');
  const on = el('dd');
  on.append(el('span', 'on', k.on.join('・') || '—'));
  kv.append(el('dt', null, '音'), on);
  const kun = el('dd');
  kun.append(el('span', 'on', k.kun.join('・') || '—'));
  kv.append(el('dt', null, '訓'), kun);
  sheet.append(kv);

  if (k.parts.length) {
    sheet.append(el('p', 'eyebrow', '部品へ'));
    sheet.append(
      chipsFor(
        k.parts.map((c) => ({ label: c, sub: D.radicals[c]?.name || '名称なし' })),
        (item) => go({ t: 'radical', id: item.label, from: node.from }),
      ),
    );
  }

  const words = D.kanjiWords[k.c] || [];
  if (words.length) {
    const capped = words.length > D.wordCap;
    sheet.append(
      el('p', 'eyebrow', capped ? `この字を含む語 — ${words.length} 語のうち ${D.wordCap} 語` : `この字を含む語 — ${words.length} 語`),
    );
    sheet.append(
      chipsFor(
        words.slice(0, D.wordCap).map((w) => ({ label: w, sub: D.words[w]?.r || '' })),
        (item) => go({ t: 'word', id: item.label, from: node.from }),
      ),
    );
  }

  if (!words.length) {
    sheet.append(el('p', 'eyebrow', 'この字を含む語'));
    sheet.append(
      el('div', 'sem-empty', `6,687 語の辞書にこの字を含む語はない。字と部品の側からは続けられる。`),
    );
  }

  const idioms = D.idiomsByKanji[k.c] || [];
  if (idioms.length) {
    const heading = el('p', 'eyebrow');
    heading.append(document.createTextNode(`熟語・慣用句 — ${idioms.length}　`));
    heading.append(el('span', 'pool-tag sa', 'ShareAlike プール'));
    sheet.append(heading);
    sheet.append(
      chipsFor(
        idioms.slice(0, 24).map((w) => ({ label: w, sub: D.idioms[w]?.r || '' })),
        (item) => go({ t: 'idiom', id: item.label, from: node.from }),
      ),
    );
  }

  sheet.append(takeButton(node, k.c));
  renderSchedule(sheet);
}

function renderRadicalNode(sheet, node) {
  const r = D.radicals[node.id];
  if (!r) {
    sheet.append(el('div', 'sem-empty', 'この部品はこの層にない。'));
    return;
  }
  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', r.c));
  const meta = el('div', 'hero-meta');
  meta.append(el('div', 'hero-mean', r.name || '（名称は漢検の部首表にない部品）'));
  const chips = el('div', 'shelf-meta');
  if (r.st) chips.append(el('span', 'pool-tag', `${r.st} 画`));
  chips.append(el('span', 'pool-tag', `${r.kanjiCount} 字`));
  chips.append(el('span', 'pool-tag sa', 'ShareAlike'));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  const note = el('div', 'note');
  note.textContent =
    'RADK は「この部品を含む」族であって、康熙部首の分類ではない（#26 の赤チームで確定した言い方）。';
  sheet.append(note);

  if (r.isKanji && D.kanji[r.c]) {
    sheet.append(
      chipsFor([{ label: r.c, sub: '字としても見る' }], (item) =>
        go({ t: 'kanji', id: item.label, from: node.from }),
      ),
    );
  }

  sheet.append(
    el(
      'p',
      'eyebrow',
      r.kanjiCount > r.kanji.length
        ? `この部品を含む字 — ${r.kanjiCount} 字のうち ${r.kanji.length} 字`
        : `この部品を含む字 — ${r.kanjiCount} 字`,
    ),
  );
  sheet.append(
    chipsFor(
      r.kanji.map((c) => ({ label: c, sub: D.kanken[c]?.kk || '' })),
      (item) => go({ t: 'kanji', id: item.label, from: node.from }),
    ),
  );

  sheet.append(takeButton(node, r.c));
  renderSchedule(sheet);
}

function renderIdiomNode(sheet, node) {
  const idiom = D.idioms[node.id];
  if (!idiom) {
    sheet.append(el('div', 'sem-empty', 'この句はこの層にない。'));
    return;
  }
  const head = el('h2', 'headword', idiom.w);
  sheet.append(head);
  sheet.append(el('p', 'reading', idiom.r));
  const meta = el('div', 'shelf-meta');
  meta.append(el('span', 'pool-tag sa', 'JMdict · CC BY-SA'));
  if (idiom.yoji) meta.append(el('span', 'pool-tag', '四字熟語'));
  sheet.append(meta);
  for (const g of idiom.g) sheet.append(el('p', 'gloss', g));

  sheet.append(el('p', 'eyebrow', '字へ'));
  sheet.append(
    chipsFor(
      idiom.k.map((c) => ({ label: c, sub: D.kanken[c]?.kk || '' })),
      (item) => go({ t: 'kanji', id: item.label, from: node.from }),
    ),
  );
  sheet.append(takeButton(node, idiom.w));
  renderSchedule(sheet);
}

function renderSheet(root) {
  const node = S.stack[S.stack.length - 1];
  if (!node) return;
  const sheet = el('div', 'sheet');
  sheet.id = 'sheet';
  sheet.dataset.node = `${node.t}:${node.id}`;
  sheet.append(el('div', 'sheet-grip'));
  if (node.t === 'word') renderWordNode(sheet, node);
  else if (node.t === 'kanji') renderKanjiNode(sheet, node);
  else if (node.t === 'radical') renderRadicalNode(sheet, node);
  else if (node.t === 'idiom') renderIdiomNode(sheet, node);
  root.append(sheet);
}

function licencePanel() {
  const box = el('div', 'note');
  box.append(
    document.createTextNode(
      '出典と licence。二つのプールは別ファイルに分けて配っている（corpus #51/#41）。' +
        'この試作は両方を読み込むので、成果物自体は ShareAlike 側に従う。' +
        'それを黙って混ぜるのではなく、こう表に出している。',
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
  const toggle = el('button', 'vtoggle', S.debugOpen ? '変異 ▾' : '変異 ▴');
  toggle.type = 'button';
  toggle.id = 'variants-toggle';
  toggle.addEventListener('click', () => {
    S.debugOpen = !S.debugOpen;
    render();
  });
  top.append(toggle);
  const summary = el('span', 'measure');
  summary.textContent = Object.entries(S.variants)
    .map(([k, v]) => `${VARIANTS[k].label.split(' ')[0]}:${v}`)
    .join('  ');
  top.append(summary);
  bar.append(top);

  if (S.debugOpen) {
    const body = el('div', 'vbody');
    for (const [key, spec] of Object.entries(VARIANTS)) {
      const row = el('div', 'vrow');
      row.append(el('span', 'vlabel', spec.label));
      const seg = el('div', 'vseg');
      for (const [id, label] of spec.options) {
        const b = el('button', null, label);
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
  out.textContent =
    `測定：淡色 ${faint ?? '—'}:1 · 本文墨 ${ink ?? '—'}:1 · ` +
    `焦点 ${readerPx ?? '—'}px / 周辺 ${chromePx}px`;
}

/* --------------------------------------------------------------- render */
function render() {
  const root = $('#app');
  root.textContent = '';
  document.body.classList.toggle('v-contrast-wcag', S.variants.contrast === 'wcag');

  const chrome = el('div', 'chrome');
  const backBtn = el('button', null, '戻る');
  backBtn.type = 'button';
  backBtn.id = 'back';
  const atHome = !S.stack.length && (S.view === 'entry' || (S.view === 'shelf' && S.variants.entry === 'shelf'));
  backBtn.disabled = atHome;
  backBtn.addEventListener('click', back);
  chrome.append(backBtn);

  const crumb = el('div', 'crumb');
  const parts = [];
  if (S.view === 'entry') parts.push('野');
  else parts.push('棚');
  if (S.view === 'reader' && passage()) parts.push(passage().title);
  if (S.view === 'tray') parts.push('取ったもの');
  for (const node of S.stack) parts.push(nodeTitle(node));
  crumb.innerHTML = parts.map((p, i) => (i === parts.length - 1 ? `<b>${p}</b>` : p)).join(' › ');
  chrome.append(crumb);

  const trayBtn = el('button', null, `取 ${S.taken.length}`);
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
    main.append(el('div', 'loading', '回廊 をひらいています…'));
    renderVariants(root);
    return;
  }

  if (S.view === 'entry') renderEntry(main);
  else if (S.view === 'reader') renderReader(main);
  else if (S.view === 'tray') renderTray(main);
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
    root.append(el('div', 'loading', `読み込めなかった：${err.message}`));
  });
});
