/** learner seam: split out of corridor.js (G3); now edited here directly. */
import { $, voiceSettingsBlock, AI_EVIDENCE_ROLES, D, DRAFT_KEY, GRAMMAR, ME_DECKS, ME_FIELDS, ME_MONTHS_EN, ME_N1_SITTING, PLACES_TABS, PRIMARY_TABS, REGISTER_LINE_DOORS, REGISTER_ROOM_DOORS, ROOM_IDS, ROOM_NAMES, S, SVG_NS, THEME_STORE, THEME_UI, WORD_BRUSH, WORD_BRUSH_KEY, WORD_VOICE, WORD_VOICE_KEY, bi, biLabel, contrastOf, el, fieldsDeckHome, finiteNumber, flowText, foundationDoor, logicalArchiveRows, meBackPart, meDeckIndex, meNum, meSealsPart, nonEmptyString, openPersonalCollection, optional, owns, passage, paintKeptCount, placesLayout, plainRecord, render, roomTransition, safeJsonValue, savedAnswerFor, setLayout, setWordPref, srsKey, tx, validStoreEnvelope, wordBrush, setReadHighlight, wordHighlight, wordVoice } from '../corridor.js';
import { dayKey, helpByMonth } from './drift.mjs';
import { articleReadChars } from './library.mjs';
import { VOICE_WORDS } from './voice-lines.mjs';

function mergeGrammar(harvested) {
  const norm = (p) => p.replace(/[〜～\s（）()]/g, '');
  const have = new Set(GRAMMAR.map((g) => norm(g.p)));
  const extra = (harvested || []).filter((g) => !have.has(norm(g.p)));
  const order = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
  return [...GRAMMAR, ...extra].sort((a, b) => (order[a.lv] ?? 9) - (order[b.lv] ?? 9));
}

function readRecordDrafts() {
  try { const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}'); return plainRecord(value) ? value : {}; }
  catch { return {}; }
}

function portableRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['ai', 'aiEvidence', 'recordGeneration'].includes(key)));
}

function meHelpLine() {
  const signal = helpByMonth();
  const line = el('p', 'me-help');
  line.id = 'me-help';
  const since = signal ? meDate(new Date(signal.since), true) : null;
  const month = signal?.months[0];
  // the line stands once there is a number (tighten pass, 2026-11-10); before that the book's own lede speaks
  if (!month) return null;
  const [year, mm] = month.month.split('-').map(Number);
  const label = bi() ? new Date(year, mm - 1, 1).toLocaleDateString('en-GB', { month: 'long' }) : `${mm}月`;
  const per = month.per1000 === null ? '—' : month.per1000.toFixed(1);
  line.append(el('b', 'me-help-n', per), el('span', 'me-help-l', tx('千字あたりの手助け', 'help per 1,000 characters')),
    el('span', 'me-help-m', tx(
      `${label}・はじめて読み終えた ${month.articles} 編、${month.chars.toLocaleString('ja-JP')} 字、調べた語 ${month.help}${month.level ? `・平均 ${month.level}` : ''}。${since}から数えた目安で、証明ではない`,
      `${label} · ${month.articles} first reading${month.articles === 1 ? '' : 's'}, ${month.chars.toLocaleString('en-GB')} characters, ${month.help} word${month.help === 1 ? '' : 's'} asked${month.level ? ` · about ${month.level}` : ''} · counted since ${since}; a signal, not proof`)));
  return line;
}

function syncTrayCount() {
  paintKeptCount();
  const tray = document.getElementById('tray');
  if (!tray) return;
  const saved = S.taken.length;
  const count = tray.querySelector('.tray-count');
  if (count) count.textContent = String(saved);
  tray.dataset.count = String(saved);
  const name = tx(`今日 · 保存した語 ${saved}`, `Today · ${saved} saved word${saved === 1 ? '' : 's'}`);
  tray.setAttribute('aria-label', name);
  tray.title = name;
}

function validArchiveTurn(row) {
  return plainRecord(row) && safeJsonValue(row) && nonEmptyString(row.surface) &&
    AI_EVIDENCE_ROLES.has(row.role) && typeof row.content === 'string' &&
    Number.isSafeInteger(row.ts) && row.ts > 0 && optional(row, 'model', nonEmptyString) &&
    optional(row, 'xid', nonEmptyString) && optional(row, 'contextRef', nonEmptyString) &&
    optional(row, 'id', (id) => (Number.isSafeInteger(id) && id > 0) || nonEmptyString(id));
}

function validArchiveRows(rows) {
  if (!Array.isArray(rows) || !rows.every(validArchiveTurn)) return false;
  const keys = rows.filter((row) => owns(row, 'id')).map((row) => JSON.stringify(row.id));
  return new Set(keys).size === keys.length;
}

function storedArchiveRow(row) {
  return plainRecord(row) && row.format === 'kairo-archive-row' && row.v === 1 &&
    Number.isSafeInteger(row.id) && row.id > 0 &&
    Object.keys(row).every((key) => ['format', 'v', 'id', 'turn'].includes(key)) && validArchiveTurn(row.turn);
}

function validStoredArchiveRows(rows) {
  try {
    logicalArchiveRows(rows);
    return rows.every((row) => storedArchiveRow(row) || validArchiveTurn(row)) &&
      new Set(rows.map((row) => JSON.stringify(row.id))).size === rows.length;
  } catch { return false; }
}

function validImportJournal(journal) {
  if (!plainRecord(journal) || journal.v !== 1 || journal.id !== 'active' || !nonEmptyString(journal.token) ||
    !(journal.beforeText === null || typeof journal.beforeText === 'string') || typeof journal.afterText !== 'string' ||
    journal.beforeText === journal.afterText || !validStoredArchiveRows(journal.beforeRows) || !validStoredArchiveRows(journal.afterRows)) return false;
  try { const record = JSON.parse(journal.afterText); return validStoreEnvelope(record) && record.recordGeneration === journal.token; }
  catch { return false; }
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

function themeId() {
  let stored = '';
  try {
    stored = localStorage.getItem(THEME_STORE) || '';
  } catch {
    stored = '';
  }
  if (THEME_UI.some((t) => t.id === stored)) return stored;
  try {
    if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) return 'yoru';
  } catch {
    /* no matchMedia */
  }
  return 'hokusai';
}

function themeIx() {
  return Math.max(0, THEME_UI.findIndex((t) => t.id === themeId()));
}

function primaryTabs() {
  return placesLayout() ? PLACES_TABS : PRIMARY_TABS;
}

function meN1Sitting() {
  const first = new Date(ME_N1_SITTING.year, ME_N1_SITTING.month, 1);
  return new Date(ME_N1_SITTING.year, ME_N1_SITTING.month, 1 + ((7 - first.getDay()) % 7));
}

function meDaysToSitting(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((meN1Sitting() - today) / 86400000);
}

function meDeckLedger(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(`bunki-cloze:${id}`) || 'null');
    // only a ledger the deck player itself would read (its format, version and deck)
    return raw && raw.format === 'bunki-cloze-state' && raw.version === 1 && raw.deckId === id &&
      raw.cards && typeof raw.cards === 'object' && !Array.isArray(raw.cards) && Object.keys(raw.cards).length ? raw : null;
  } catch {
    return null;
  }
}

function meDeckWords(id, onReady) {
  const have = meDeckIndex.get(id);
  if (have === null || (have && !(have instanceof Promise))) return have;
  if (!have) {
    const packed = window.__CORRIDOR_BUNDLE__?.[`decks/${id}`] || window.__KP_DECKS__?.[id];
    const got = packed ? Promise.resolve(packed)
      : fetch(new URL(`decks/${id}/deck.json`, document.baseURI)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`deck ${id} ${r.status}`))));
    meDeckIndex.set(id, got.then((deck) => {
      const cards = new Map();
      const groups = {};
      for (const w of deck.words || []) {
        if (w.group) groups[w.group] = (groups[w.group] || 0) + 1;
        for (const c of w.cards || []) cards.set(c.id, { word: w.id, term: w.term, reading: w.reading || '', group: w.group || '' });
      }
      const index = { cards, total: (deck.words || []).length, groups };
      meDeckIndex.set(id, index);
      return index;
    }, () => {
      meDeckIndex.set(id, null);
      return null;
    }));
  }
  meDeckIndex.get(id).then(onReady);
  return undefined;
}

function meDate(t, year = false) {
  const d = new Date(t);
  return tx(`${year ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日`,
    `${d.getDate()} ${ME_MONTHS_EN[d.getMonth()].slice(0, 3)}${year ? ` ${d.getFullYear()}` : ''}`);
}

function meRevoked() {
  const out = new Set();
  for (const row of S.revlog || []) if (Array.isArray(row) && row[2] === 0) out.add(row[3]);
  return out;
}

function meDays(decks) {
  const days = new Map();
  let first = Infinity;
  const mark = (t, kind) => {
    if (!finiteNumber(t) || t <= 0) return;
    const key = dayKey(new Date(t));
    const day = days.get(key) || { cards: false, read: false };
    day[kind] = true;
    days.set(key, day);
    if (t < first) first = t;
  };
  for (const [key, day] of Object.entries(S.stats || {})) {
    const [y, m, d] = key.split('-').map(Number);
    if (day && day.n > 0 && y && m && d) mark(new Date(y, m - 1, d, 12).getTime(), 'cards');
  }
  const revoked = meRevoked();
  (S.revlog || []).forEach((row, i) => { if (Array.isArray(row) && row[2] !== 0 && !revoked.has(i)) mark(row[0], 'cards'); });
  for (const row of S.obslog || []) {
    if (!Array.isArray(row)) continue;
    if (row[1] === 'tap') mark(row[0], 'read');
    else if (['probe', 'dojo', 'lesson', 'mock'].includes(row[1])) mark(row[0], 'cards');
  }
  for (const t of Object.values(S.readDone || {})) mark(t, 'read');
  for (const r of S.sentencePractice?.responses || []) mark(Date.parse(r.at), 'cards');
  for (const d of decks) for (const row of d.ledger?.log || []) if (Array.isArray(row)) mark(Date.parse(row[2]), 'cards');
  return { days, first: Number.isFinite(first) ? new Date(first) : null };
}

function meReadUnaided() {
  const passages = D.passages || [];
  const counted = new Map();
  for (const p of passages) {
    if (!owns(S.readDone || {}, p.id)) continue;
    const chars = articleReadChars(p.id, S, p);
    if (finiteNumber(chars)) counted.set(p.id, chars);
  }
  const finished = passages.filter((p) => counted.has(p.id));
  if (!finished.length) return null;
  const ids = new Set(finished.map((p) => p.id));
  const looked = new Set();
  let helped = 0;
  for (const row of S.obslog || []) {
    if (!Array.isArray(row) || row[1] !== 'tap' || !ids.has(row[4]) || typeof row[2] !== 'string') continue;
    const once = `${row[4]}\u0000${row[2]}`;
    if (looked.has(once)) continue;
    looked.add(once);
    helped += [...row[2].replace(/^word:/, '')].length;
  }
  const read = finished.reduce((sum, p) => sum + counted.get(p.id), 0);
  return { n: Math.max(0, read - helped), read, articles: finished.length, looked: looked.size };
}

function meHorizons(decks) {
  const rows = [];
  // words held by recall in a deck's ledger, optionally only the cards a test keeps
  const heldIn = (d, keep) => {
    const held = new Set();
    for (const [cardId, rec] of Object.entries(d?.ledger?.cards || {})) {
      const card = d.index?.cards.get(cardId);
      if (keep && !(card && keep(card))) continue;
      const word = card?.word || cardId.slice(0, cardId.lastIndexOf('-'));
      if (rec && rec.state === 2 && !owns(d.ledger.suspended || {}, cardId)) held.add(word);
    }
    return held.size;
  };
  const [n1Deck, fieldsDeck] = ME_DECKS.map((h) => decks.find((x) => x.id === h.id));
  rows.push({ id: 'n1', ja: ME_DECKS[0].ja, en: ME_DECKS[0].en, n: heldIn(n1Deck), of: n1Deck?.index?.total ?? null,
    begun: !!n1Deck?.ledger, measure: tx(ME_DECKS[0].measureJa, ME_DECKS[0].measureEn) });
  for (const f of ME_FIELDS) {
    // a begun deck is split by field only once its words have arrived: until then it says so
    const counting = !!fieldsDeck?.ledger && !fieldsDeck.index;
    rows.push({ id: `field-${f.id}`, field: f, ja: f.ja, en: f.en, counting,
      n: counting ? 0 : heldIn(fieldsDeck, (card) => card.group === f.id),
      of: fieldsDeck?.index?.groups?.[f.id] ?? null, begun: !!fieldsDeck?.ledger,
      measure: tx(ME_DECKS[1].measureJa, ME_DECKS[1].measureEn) });
  }
  const kk = D.kanken || {};
  const met = new Set();
  const heldK = new Set();
  const add = (text, held) => {
    for (const c of String(text || '')) if (owns(kk, c)) { met.add(c); if (held) heldK.add(c); }
  };
  let saved = 0;
  let savedHeld = 0;
  for (const item of S.taken || []) {
    const key = srsKey(item.t, item.id);
    const held = S.srs[key]?.state === 2 && !S.suspended?.[key];
    saved += 1;
    if (held) savedHeld += 1;
    if (['word', 'kanji', 'idiom'].includes(item.t)) add(item.t === 'kanji' ? item.id : item.label || item.id, held);
  }
  for (const d of decks) {
    if (!d.index || !d.ledger) continue;
    for (const [cardId, rec] of Object.entries(d.ledger.cards)) {
      const w = d.index.cards.get(cardId);
      if (w) add(w.term, rec?.state === 2 && !owns(d.ledger.suspended || {}, cardId));
    }
  }
  rows.push({ id: 'kanken', ja: '漢検の漢字', en: 'Kanken kanji', n: heldK.size, of: Object.keys(kk).length, met: met.size, begun: met.size > 0,
    measure: tx(`想起で保持 · 出会った ${meNum(met.size)} 字`, `held by recall · ${meNum(met.size)} met`) });
  rows.push({ id: 'saved', ja: '集めた言葉', en: 'Words you saved', n: savedHeld, of: saved, begun: saved > 0,
    measure: tx('想起で保持 · 自分で集めた札', 'held by recall · cards you saved yourself') });
  return rows;
}

function meCameHome(decks) {
  const rows = [];
  const revoked = meRevoked();
  const pending = new Map();
  const homes = new Map();
  (S.revlog || []).forEach((row, i) => {
    if (!Array.isArray(row) || row[2] === 0 || revoked.has(i)) return;
    if (row[3] === 2 && row[2] === 1) pending.set(row[1], row[0]);
    else if (row[3] === 2 && row[2] >= 2 && pending.has(row[1])) {
      homes.set(row[1], { lapsed: pending.get(row[1]), home: row[0] });
      pending.delete(row[1]);
    }
  });
  const byKey = new Map((S.taken || []).map((item) => [srsKey(item.t, item.id), item]));
  for (const [key, h] of homes) {
    const item = byKey.get(key);
    if (!item || !['word', 'kanji', 'idiom'].includes(item.t)) continue;
    const answer = item.t === 'word' ? savedAnswerFor(item) : null;
    rows.push({ surface: item.t === 'kanji' ? item.id : item.label || item.id, reading: answer?.status === 'available' ? answer.reading : '', ...h });
  }
  for (const d of decks) {
    if (!d.index || !d.ledger) continue;
    const log = new Map();
    for (const row of d.ledger.log || []) {
      const t = Array.isArray(row) ? Date.parse(row[2]) : NaN;
      if (!Number.isFinite(t)) continue;
      if (!log.has(row[0])) log.set(row[0], []);
      log.get(row[0]).push([t, row[1]]);
    }
    for (const [cardId, rec] of Object.entries(d.ledger.cards)) {
      if (!rec || !(rec.lapses > 0) || rec.state !== 2) continue;
      const answers = log.get(cardId) || [];
      let lapsed = null;
      for (const [t, g] of answers) if (g === 1) lapsed = t;
      const home = lapsed == null ? null : answers.find(([t, g]) => g >= 2 && t > lapsed && dayKey(new Date(t)) !== dayKey(new Date(lapsed)));
      const w = d.index.cards.get(cardId);
      if (home && w) rows.push({ surface: w.term, reading: w.reading, lapsed, home: home[0] });
    }
  }
  const seen = new Set();
  return rows.sort((a, b) => b.home - a.home).filter((r) => !seen.has(r.surface) && seen.add(r.surface)).slice(0, 4);
}

function meCopiedLine() {
  const sp = S.sentencePractice;
  if (!sp) return null;
  const entries = new Map((sp.entries || []).map((e) => [e.plan?.id, e]));
  const wrote = (sp.responses || []).filter((r) => r.mode === 'production' && typeof r.text === 'string' && r.text.trim())
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (wrote) return { text: wrote.text.trim(), title: entries.get(wrote.entryId)?.context?.title || '', at: Date.parse(wrote.at), hand: true };
  const kept = (sp.entries || []).at(-1);
  if (kept?.context?.quote) return { text: kept.context.quote, title: kept.context.title || '', at: Date.parse(kept.plan?.capture?.occurredAt), hand: false };
  return null;
}

function meSeam(surface) {
  let h = 2166136261;
  for (const c of String(surface)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0;
    return (h % 1000) / 1000;
  };
  // a crack, not a wave: uneven runs, sharp turns, one short branch
  const pts = [[0, 9 + (next() - 0.5) * 4]];
  for (let x = 0, up = next() < 0.5; x < 100; up = !up) {
    x = Math.min(100, x + 7 + next() * 11);
    pts.push([x, 9 + (up ? -1 : 1) * (1.5 + next() * 5.5)]);
  }
  const at = pts[1 + Math.floor(next() * (pts.length - 2))];
  const branch = [at, [at[0] + 5 + next() * 6, at[1] < 9 ? 1 + next() * 2 : 15 + next() * 2]];
  const line = (list) => list.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'me-seam');
  svg.setAttribute('viewBox', '0 0 100 18');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, cls] of [[line(pts), 'me-seam-main'], [line(branch), 'me-seam-branch']]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', cls);
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path);
  }
  return svg;
}

function meSection(part, ja, en, aside) {
  const sec = el('section', `me-part me-${part}`);
  sec.dataset.mePart = part;
  const head = el('div', 'me-part-head');
  head.append(el('h2', 'eyebrow', tx(ja, en)));
  if (aside) head.append(el('span', 'me-part-aside', aside));
  sec.append(head);
  return sec;
}

function meBreakable(tag, cls, text) {
  const node = el(tag, cls);
  for (const part of String(text).split(/(?<=[・、])/u)) node.append(el('span', 'me-nb', part));
  return node;
}

function meHorizonRow(h, { quiet = false } = {}) {
  const row = el('div', 'me-hz');
  row.dataset.horizon = h.id;
  if (!h.begun) row.classList.add('not-begun');
  const shown = h.begun && !h.counting;
  const top = el('div', 'me-hz-top');
  top.append(meBreakable('span', 'me-hz-name', tx(h.ja, h.en)));
  const figure = el('span', 'me-hz-n');
  figure.append(el('b', '', shown ? meNum(h.n) : '—'));
  if (h.of && shown) figure.append(el('span', 'me-hz-of', ` / ${meNum(h.of)}`));
  top.append(figure);
  row.append(top);
  if (h.field) row.append(meBreakable('p', 'me-hz-note', tx(h.field.noteJa, h.field.noteEn)));
  const rule = el('div', 'me-hz-rule');
  rule.setAttribute('aria-hidden', 'true');
  if (h.of && h.met) {
    const met = el('i', 'me-hz-met');
    met.style.setProperty('--f', Math.min(1, h.met / h.of).toFixed(4));
    rule.append(met);
  }
  const fill = el('i', 'me-hz-fill');
  fill.style.setProperty('--f', h.of && shown ? Math.min(1, h.n / h.of).toFixed(4) : '0');
  rule.append(fill);
  const sub = el('p', `me-hz-sub${h.begun ? '' : ' is-sentence'}`);
  if (!h.begun) flowText(sub, {
    saved: tx('まだ札がない。読みながら言葉を保存する。', 'No cards yet. Save words as you read.'),
    kanken: tx('保存した言葉の漢字から数える。', 'Counted from the kanji in your saved words.'),
    n1: fieldsDeckHome('N1デッキ', 'The N1 deck is'),
  }[h.id] || fieldsDeckHome());
  else if (h.counting) sub.textContent = tx('専門デッキの札を数えている…', 'counting your fields deck…');
  else {
    sub.append(el('span', '', h.measure));
    if (h.of) sub.append(el('b', '', ` · ${((h.n / h.of) * 100).toFixed(1)}%`));
  }
  row.append(rule);
  if (!quiet) row.append(sub);
  return row;
}

function meN1Plate(h, { quiet = false } = {}) {
  const plate = el('div', 'me-n1');
  const head = el('div', 'me-n1-head');
  head.append(el('span', 'me-n1-seal', 'N1'),
    el('span', 'me-n1-when', tx(`${ME_N1_SITTING.year}年${ME_N1_SITTING.month + 1}月`, `${ME_MONTHS_EN[ME_N1_SITTING.month]} ${ME_N1_SITTING.year}`)));
  plate.append(head);
  const days = meDaysToSitting();
  const sitting = meN1Sitting();
  const count = el('p', 'me-n1-count');
  if (days > 0) {
    const n = el('b', 'me-n1-days', meNum(days));
    if (bi()) count.append(n, el('span', 'me-n1-unit', days === 1 ? 'day to the test' : 'days to the test'));
    else count.append(el('span', 'me-n1-unit', 'あと'), n, el('span', 'me-n1-unit', '日'));
  } else {
    count.classList.add('is-done');
    count.append(el('span', 'me-n1-unit', days === 0
      ? tx('今日が試験の日', 'The test is today')
      : tx(`${ME_N1_SITTING.year}年7月の試験は過ぎた`, `The July ${ME_N1_SITTING.year} test has passed`)));
  }
  plate.append(count);
  if (days >= 0) {
    plate.append(el('p', 'me-n1-date', tx(
      `試験日 ${sitting.getFullYear()}年${sitting.getMonth() + 1}月${sitting.getDate()}日（日）の見込み`,
      `Test expected Sun ${sitting.getDate()} ${ME_MONTHS_EN[sitting.getMonth()].slice(0, 3)} ${sitting.getFullYear()}`)));
  }
  plate.append(meHorizonRow(h, { quiet }));
  return plate;
}

function meHorizonsPart(decks) {
  const sec = meSection('horizons', '目標', 'Your goals');
  const rows = meHorizons(decks);
  const n1 = rows.find((h) => h.id === 'n1');
  const fields = rows.filter((h) => h.field);
  // until the fields deck is opened, the three fields say so once, not three times; while the N1 deck is
  // unopened too, one line says it for both (tighten pass: "not started yet" once on the page)
  const unbegun = fields.length > 0 && fields.every((h) => !h.begun);
  const neither = unbegun && !n1.begun;
  const note = (text) => el('p', 'me-hz-sub me-hz-group-note is-sentence', text);
  sec.append(meN1Plate(n1, { quiet: neither }));
  if (neither) sec.append(note(fieldsDeckHome('N1デッキと専門デッキ', 'The N1 and fields decks are')));
  sec.append(el('h3', 'me-hz-group', tx('あなたの三つの分野', 'Your three fields')));
  if (unbegun && !neither) sec.append(note(fieldsDeckHome()));
  for (const h of fields) sec.append(meHorizonRow(h, { quiet: unbegun }));
  sec.append(el('h3', 'me-hz-group', tx('あなたの言葉', 'Your words')));
  for (const h of rows) if (h.id === 'kanken' || h.id === 'saved') sec.append(meHorizonRow(h));
  return sec;
}

function meCameHomePart(decks, active) {
  const home = meCameHome(decks);
  if (!home.length && !active) return null;
  const sec = meSection('mended', '取り戻した語', 'Words you won back');
  if (!home.length) {
    sec.append(el('p', 'me-quiet', tx('忘れた言葉をもう一度思い出すと、ここに金で継がれる。',
      'When a word slips and you win it back, it is mended here in gold.')));
    return sec;
  }
  const list = el('ol', 'me-home-list');
  home.forEach((h, i) => {
    const li = el('li', 'me-home');
    li.style.setProperty('--i', String(i));
    const word = el('span', 'me-home-w');
    const surface = el('span', 'me-home-surface', h.surface);
    surface.lang = 'ja';
    surface.dataset.uiContent = 'learning';
    word.append(surface);
    if (h.reading && h.reading !== h.surface) {
      const reading = el('span', 'me-home-r', h.reading);
      reading.lang = 'ja';
      reading.dataset.uiContent = 'learning';
      word.append(reading);
    }
    const seam = el('span', 'me-home-seam');
    seam.setAttribute('aria-hidden', 'true');
    seam.append(meSeam(h.surface), el('i', 'me-gleam'));
    const when = el('span', 'me-home-when');
    when.append(el('span', '', tx(`${meDate(h.lapsed)} 失念`, `lapsed ${meDate(h.lapsed)}`)),
      el('b', '', tx(`${meDate(h.home)} 回復`, `held ${meDate(h.home)}`)));
    li.append(word, seam, when);
    list.append(li);
  });
  sec.append(list);
  return sec;
}

function meLinePart() {
  const line = meCopiedLine();
  if (!line) return null;
  const sec = meSection('line', line.hand ? '書き写した一文' : '書き留めた一文', line.hand ? 'A line you wrote by hand' : 'A line you kept');
  const text = el('p', 'me-hand', line.text);
  text.lang = 'ja';
  text.dataset.uiContent = 'learning';
  const src = el('p', 'me-line-src');
  if (line.title) {
    const t = el('span', 'me-line-title', line.title);
    t.lang = 'ja';
    t.dataset.uiContent = 'learning';
    src.append(el('span', '', tx('出典 ', 'from ')), t);
  }
  if (Number.isFinite(line.at)) src.append(el('b', '', `${line.title ? ' · ' : ''}${meDate(line.at)}`));
  sec.append(text, src);
  return sec;
}

function renderMe(main) {
  const decks = ME_DECKS.map((d) => ({ id: d.id, ledger: meDeckLedger(d.id), index: undefined }));
  for (const d of decks) {
    const known = meDeckIndex.get(d.id);
    if (d.ledger && known && !(known instanceof Promise)) d.index = known;
  }
  const book = el('div', 'me-book');
  const spine = el('div', 'me-spine');
  spine.setAttribute('aria-hidden', 'true');
  const edges = el('div', 'me-edges');
  edges.setAttribute('aria-hidden', 'true');
  book.append(spine, edges);
  const { days, first } = meDays(decks);
  const now = new Date();
  const head = el('header', 'me-head');
  head.append(el('p', 'eyebrow me-kicker', tx('一年の帳', 'The book of your year')));
  head.append(el('h1', 'view-title', tx(...ROOM_NAMES.rooms.me)));
  const dateline = el('p', 'me-dateline');
  if (first) {
    const dayN = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000) + 1;
    // each clause holds together; the line breaks only at its dots
    const clause = (...parts) => {
      const span = el('span', 'me-clause');
      span.append(...parts.map((p, i) => (i % 2 ? el('b', '', p) : p)));
      return span;
    };
    const clauses = bi()
      ? [clause('since ', meDate(first, true)), clause('day ', meNum(dayN)), clause('', meNum(days.size), ` day${days.size === 1 ? '' : 's'} practised`)]
      : [clause('', meDate(first, true), 'から'), clause('', meNum(dayN), ' 日目'), clause('稽古 ', meNum(days.size), ' 日')];
    clauses.forEach((c, i) => dateline.append(...(i ? [' · ', c] : [c])));
  } else {
    dateline.classList.add('is-blank');
    flowText(dateline, tx('最初の札か記事から、この帳が始まる。', 'Your book begins with your first card or article.'));
  }
  head.append(dateline);
  const reading = meReadUnaided();
  if (reading) {
    const lead = el('p', 'me-lead');
    lead.append(el('b', 'me-lead-n', meNum(reading.n)), el('span', 'me-lead-l', tx('字を自力で読んだ', 'characters read unaided')),
      el('span', 'me-lead-m', tx(`読み終えた ${reading.articles} 編から、調べた ${reading.looked} 語を除く`,
        `in ${reading.articles} finished article${reading.articles === 1 ? '' : 's'}, less the ${reading.looked} word${reading.looked === 1 ? '' : 's'} you looked up`)));
    head.append(lead);
  }
  // G2 · beside it, the help signal: help per 1,000 characters of the month's first readings (meHelpLine, read-only)
  const help = meHelpLine();
  if (help) head.append(help);
  book.append(head);
  let horizons = meHorizonsPart(decks);
  let home = meCameHomePart(decks, !!first);
  book.append(horizons);
  if (home) book.append(home);
  book.append(meSealsPart(days, first));
  const line = meLinePart();
  if (line) book.append(line);
  const contents = meSection('contents', 'もっと見る', 'More');
  const doors = el('div', 'foundation-doors me-doors');
  doors.append(
    foundationDoor('me-progress', '学びの足跡', 'Your progress', 'kagami'),
    foundationDoor('me-statistics', '復習の統計', 'Review statistics', 'srs-stats'),
    placesLayout() ? foundationDoor('me-collections', '保存した語とリスト', 'Saved words & lists', 'saved') : foundationDoor('me-collections', '集めた言葉', 'Saved words & lists', 'tray'),
  );
  if (window.__CORRIDOR_STANDALONE__ !== true) {
    const personal = biLabel('button', 'grammar-link foundation-door', '自分の文章', 'Your own texts');
    personal.type = 'button'; personal.id = 'me-personal';
    personal.addEventListener('click', openPersonalCollection); doors.append(personal);
  }
  contents.append(doors);
  book.append(contents, meBackPart());
  main.append(book);
  // a deck the learner has opened brings its words: the horizon's whole, its kanji, its mended words
  for (const d of decks) {
    if (!d.ledger || d.index) continue;
    meDeckWords(d.id, (index) => {
      if (!index || !book.isConnected || d.index) return;
      d.index = index;
      const nextHorizons = meHorizonsPart(decks);
      nextHorizons.classList.add('me-settle');
      horizons.replaceWith(nextHorizons);
      horizons = nextHorizons;
      const nextHome = meCameHomePart(decks, !!first);
      if (home && nextHome) home.replaceWith(nextHome);
      else if (nextHome) horizons.after(nextHome);
      if (nextHome) home = nextHome;
    });
  }
}

function showRecordBackup() {
  // the backup row sits in Today's record drawer: the door that lands on it opens it (tighten pass)
  S.todayRecordOpen = true;
  requestAnimationFrame(() => {
    document.getElementById('record-backup')?.scrollIntoView({ block: 'center' });
    document.getElementById('export-store')?.focus({ preventScroll: true });
  });
}

function renderLayoutChoice() {
  const section = el('section', 'foundation-section settings-layout');
  section.id = 'settings-layout';
  section.append(el('h2', 'eyebrow', tx('レイアウト', 'Layout')));
  const choices = el('div', 'lang-seg settings-layout-choice');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', tx('レイアウト', 'Layout'));
  for (const [id, ja, en] of [['current', 'いまの並び', 'Current'], ['places', '新しい並び', 'New layout']]) {
    const button = el('button', '', tx(ja, en));
    button.type = 'button';
    button.dataset.layout = id;
    button.setAttribute('aria-pressed', String((placesLayout() ? 'places' : 'current') === id));
    button.addEventListener('click', () => {
      if ((placesLayout() ? 'places' : 'current') === id) return;
      roomTransition(() => {
        setLayout(id);
        render();
        window.scrollTo(0, 0);
      });
    });
    choices.append(button);
  }
  section.append(choices, el('p', 'settings-layout-note', tx(
    '新しい並び：復習・本棚・辞書・試験・記録の五つ。カードはどちらも同じ。いつでも戻せる。',
    'New layout: five places — Review, Bookshelf, Dictionary, Tests, Progress. Your cards are the same in both; switch back any time.')));
  return section;
}

function renderWritingChoice() {
  const section = el('section', 'foundation-section settings-writing');
  section.id = 'settings-writing';
  section.append(el('h2', 'eyebrow', tx('筆と声', 'Writing and voice')));
  const row = (id, ja, en, options, current, choose) => {
    const line = el('div', 'settings-writing-row');
    const name = el('p', 'settings-writing-name', tx(ja, en));
    name.id = `${id}-name`;
    const choices = el('div', 'lang-seg settings-layout-choice settings-writing-choice');
    choices.id = id;
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', name.id);
    for (const [value, optionJa, optionEn] of options) {
      const button = el('button', '', tx(optionJa, optionEn));
      button.type = 'button';
      button.dataset.value = value;
      button.setAttribute('aria-pressed', String(current === value));
      button.addEventListener('click', () => {
        const chosen = choose(value);
        for (const other of choices.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other.dataset.value === chosen));
      });
      choices.append(button);
    }
    line.append(name, choices);
    return line;
  };
  section.append(
    row('settings-brush', '筆 — 語が自分で書かれる', '筆 — a word writes itself',
      [['first', '初めての語', 'First meeting'], ['always', 'いつも', 'Always'], ['never', '書かない', 'Never']],
      wordBrush(), (value) => setWordPref(WORD_BRUSH_KEY, 'wordBrush', WORD_BRUSH, value)),
    // on unless he turns it off (John, 2026-11-10: "on reveal"): an answer shown and an opened word say themselves once
    // (corridor.js, WORD_VOICE); the row is named in the one vocabulary's words for Bunki, where it covers both
    row('settings-voice', ...VOICE_WORDS.speakOnReveal,
      [['on', 'オン', 'On'], ['off', 'オフ', 'Off']],
      wordVoice(), (value) => setWordPref(WORD_VOICE_KEY, 'wordVoice', WORD_VOICE, value)),
    // on unless he turns it off (John, 2026-11-11: "the option to have no highlighting at all"): nothing is drawn over a
    // sentence being read, anywhere; the reading goes on as it was and the page still follows it
    row('settings-highlight', '読んでいる文をハイライト', 'Highlight what is being read',
      [['on', 'オン', 'On'], ['off', 'オフ', 'Off']],
      wordHighlight(), (value) => setReadHighlight(value)),
    el('p', 'settings-layout-note', tx('書く速さは、書の間のスライダー一つで決まります。',
      'The writing speed is set in one place: the writing room’s slider.')));
  // the voice server: paired or not, where the last sentence came from, the budget, and the one-time pairing
  const voiceServer = voiceSettingsBlock();
  if (voiceServer) section.append(voiceServer);
  return section;
}

function stampRegister() {
  const html = document.documentElement;
  const main = document.querySelector('#app > main');
  const room = ROOM_IDS[S.view] || S.view || 'door';
  const material = S.view === 'personaldeck' ? 'hall'
    : document.body.classList.contains('ginga') || !main ? 'door'
    : main.querySelector('.mock-opts, .mock-q, .guided-room[data-stage="question"]') ? 'attempt'
      : main.querySelector('.exam-confirm') ? 'threshold'
        : main.querySelector('.exam-score') ? 'results'
          : main.querySelector('.exam-levels') ? 'jlpt'
            : main.querySelector('.chat-log') ? 'tutor'
              : main.querySelector('#shelf-body') ? 'shelf'
                : main.querySelector('.mock-review') ? 'review' : 'hall';
  if (html.dataset.room !== room || html.dataset.register !== material) {
    html.dataset.room = room;
    html.dataset.register = material;
  }
  // the older sets have no .exam-progress: their counter is the card-kind after the policy line
  const progress = document.querySelector('.exam-progress') ||
    document.querySelector('#app > main[data-mock-set] > .card-kind:not(.mock-attempt-policy)');
  const counted = ((progress?.firstElementChild || progress)?.textContent || '').match(/(\d+)\s*(?:of|\/)\s*(\d+)/);
  if (counted) html.style.setProperty('--stage', String(Number(counted[1]) / Number(counted[2])));
  else html.style.removeProperty('--stage');
  const opts = document.querySelector('.mock-opts, .mock-q + .lesson-options');
  if (opts?.querySelector('[aria-pressed="true"], [aria-checked="true"], .chosen, .selected, .is-selected')) html.dataset.answered = '1';
  else delete html.dataset.answered;
  for (const door of document.querySelectorAll('#shelf-body button.grammar-link:not([data-grade])')) {
    const label = (door.textContent || '').replace(/\s+/g, ' ').trim();
    door.dataset.grade = REGISTER_ROOM_DOORS.some((names) => label.toLowerCase().startsWith(tx(...names).toLowerCase())) ? 'room'
      : REGISTER_LINE_DOORS.some((names) => label.toLowerCase().startsWith(tx(...names).toLowerCase())) ? 'line' : 'tool';
  }
}

function maintenanceScreenName() {
  try {
    const story = S.view === 'reader' ? passage() : null;
    const name = story ? null : ROOM_NAMES.rooms[S.view];
    const detail = S.stack.at(-1);
    return [story ? tx(`読み物「${story.title}」`, `the story ${story.title}`) : name ? tx(...name) : '',
      detail?.id ? tx(`「${detail.id}」のページ`, `the page for ${detail.id}`) : ''].filter(Boolean).join(' · ');
  } catch { return ''; }
}

export { mergeGrammar, readRecordDrafts, portableRecord, meHelpLine, syncTrayCount, validArchiveTurn, validArchiveRows, storedArchiveRow, validStoredArchiveRows, validImportJournal, updateMeasurements, themeId, themeIx, primaryTabs, meN1Sitting, meDaysToSitting, meDeckLedger, meDeckWords, meDate, meRevoked, meDays, meReadUnaided, meHorizons, meCameHome, meCopiedLine, meSeam, meSection, meBreakable, meHorizonRow, meN1Plate, meHorizonsPart, meCameHomePart, meLinePart, renderMe, showRecordBackup, renderLayoutChoice, renderWritingChoice, stampRegister, maintenanceScreenName };
