/**
 * EVERYTHING-ON PROTOTYPE (integrate/everything-on-20261110): the prototype layer inside the app.
 *
 * John, 2026-11-10: the prototype is the app itself, with the new builds marked and a place to say what is off.
 * This module is that layer and nothing else:
 *   - one line on the first open, dismissed once;
 *   - a prototype button on every screen (it follows the app into an open dialog, as the report entry does);
 *   - a sheet with two tabs: "New in this build" (each new thing, one line, Go) and "Tell me what's off"
 *     (a note with the screen, its heading, the build, the viewport, and optionally one pointed-at element);
 *   - the language of the 新 / new mark, which prototype-layer.css draws on the new doors and screens;
 *   - 糸 depth, a trial that is off until its switch in the sheet is on (the section "糸 depth" below).
 * It reads the app's state and never writes the learner record. Its own three keys in localStorage hold "the line was
 * dismissed", an unsent note, and "the 糸 depth trial is on". Notes go to the same-origin /__feedback of the Mac prototype's server; where that
 * endpoint is missing the box says so and keeps the text.
 *
 * corridor.js touches this file once (one import beside the app); the single-file build has no such file.
 */
const ROOT_ID = 'bunki-prototype-root';
const INTRO_KEY = 'bunki-prototype:intro-dismissed:v1';
const DRAFT_KEY = 'bunki-prototype:note-draft:v1';
const POLL_MS = 15000;

let host = null;
let root, rail, intro, opener, sheet, tabs, body, pointer;
let active = 'new';
let context = null; // what stood under the sheet when it opened
let target = null; // the pointed-at element of the note being written
let notes = null; // null = not loaded
let endpoint = 'unknown'; // 'ok' | 'missing' | 'unknown'
let notice = '';
let busy = false;
let pollTimer = null;
let placeTimer = null;
let pointing = false;

const t = (ja, en) => host.tx(ja, en);
const lang = () => (host.state?.lang === 'ja' ? 'ja' : 'en');
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* this visit only */ } };

function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
function button(cls, text, onClick) {
  const node = h('button', cls, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** the new things, in a learner's words; `go` is an address of this same build, or a call */
const NEW = [
  { id: 'quests', ja: 'クエスト', en: 'Quests',
    lineJa: '読んでいる文の「職業」からクエストをつくり、三つのことばの読みを答えて確かめます。',
    lineEn: 'Make a quest from 職業 in a sentence you are reading: answer three readings and check each.',
    go: './?read=bunki-essay-n1-city&word=%E8%81%B7%E6%A5%AD' },
  { id: 'worldcraft', ja: '字を組み立てる', en: 'Build a character',
    lineJa: '職・識・織を部品から組み立てて、残せます。',
    lineEn: 'On 職, 識 or 織, put the character together from its parts and keep the build.',
    go: './?room=search&kanji=%E8%81%B7' },
  { id: 'passage', ja: '道のり', en: 'Passage',
    lineJa: '職から織まで七つの字をたどり、字と字のつながりを見ます。',
    lineEn: 'Walk seven stops from 職 to 織 and see how each character leads to the next.',
    go: './?room=search&kanji=%E8%AD%98' },
  { id: 'orbit', ja: '廻 めぐり', en: 'Orbit word field',
    lineJa: 'ことばが五つの輪をめぐり、通るたびに中心へ近づきます。',
    lineEn: 'Words circle on five rings, and each pass pulls one toward the centre.',
    go: () => import('./modules/orbit-preview.mjs').then((orbit) => orbit.openOrbitPreview({ tx: host.tx })) },
  { id: 'library', ja: '候補の読みもの 107', en: '107 candidate readings',
    lineJa: '本棚の終わりに、候補の読みものが107あります。選ばれるのを待っています。',
    lineEn: '107 more things to read at the end of the bookshelf, each tagged candidate, waiting for your choice.',
    go: './?entry=shelf&pl=candidates' },
  { id: 'sakura', ja: 'さくらの声で聞く記事', en: 'An article in Sakura’s voice',
    lineJa: '一つの記事を、さくらの声で聞けます。スピーカーの印を押し、次に再生を押します。',
    lineEn: 'One article is read aloud in Sakura’s voice: press the speaker mark, then Play.',
    go: './?read=jawiki%3A5294446' },
  { id: 'shared-study', ja: '新しい学習画面', en: 'New study screen',
    lineJa: 'Nihongo Study の学習画面を、Bunki の中で使えます。ここでの記録は、ふだんの記録とは別です。',
    lineEn: 'The study screen of the Nihongo Study app, inside Bunki. What you do there is kept apart from your record.',
    go: './?deck=n2&sharedStudy=preview' },
  { id: 'grammar', ja: '文法デッキ', en: 'Grammar deck',
    lineJa: '文法を、意味と想起で練習するデッキです。新しい学習画面の中にあります。',
    lineEn: 'Grammar points, by meaning and by recall. It lives inside the new study screen.',
    go: './?deck=shared-grammar&sharedStudy=preview' },
  { id: 'rajomon', ja: '羅城門 · 五つの字から', en: 'Rajōmon from five more kanji',
    lineJa: '門の風景に、間・聞・問・開・閉のページからも入れます。',
    lineEn: 'The gate scene now opens from 間, 聞, 問, 開 and 閉 as well as from 門.',
    go: './?room=search&kanji=%E9%96%93' },
  { id: 'places', ja: '五つの場所', en: 'Five places',
    lineJa: 'アプリ全体の別の並べ方です。もとに戻すには、この一覧の「いつもの並びへ」を押します。',
    lineEn: 'Another arrangement of the whole app: Review, Bookshelf, Dictionary, Tests, Progress.',
    go: './?layout=places&entry=shelf', back: './?layout=current&entry=shelf' },
];
const NOT_YET = [
  ['ワンタップの不具合報告：中継先とその鍵が必要です。', 'One-tap problem reports: they need a relay and its key.'],
  ['先生・クイズ・AIの読みもの・会話：この端末に自分の鍵を入れると動きます。', 'Tutor, quiz, AI reading and Speak: each works once your own key is on this device.'],
  ['ニュースの見出し・ファイルの取り込み・端末間の同期：Mac アプリの中だけで動きます。', 'News headlines, file intake and device sync: inside the Mac desktop app only.'],
  ['オフラインとホーム画面への追加：https のアドレスが必要です。', 'Offline use and home-screen install: they need an https address.'],
  ['門のほかの字の風景：字ごとに、その字の練習と絵が必要です。', 'A scene for any kanji other than 門: each needs its own lesson and picture.'],
  ['八つの契約モジュール：テストはありますが、アプリにつながっていません。', 'Eight contract modules: tested, and connected to nothing in the app.'],
  ['本棚を57に絞る案：あなたの決定の記録が必要です。', 'Showing 57 of the 156 shelf articles: it needs your recorded decision.'],
  ['新しい学習画面のカード音声と二台の同期：この版には入っていません。', 'Card audio and two-device sync for the new study screen: not in this build.'],
  ['聴解つきの N2 テスト：問題と録音がこの版にありません。', 'N2 tests with listening: the questions and recordings are not in this build.'],
];
const STATUS = {
  received: ['受け取りました', 'Received'],
  working: ['対応中', 'Being worked on'],
  done: ['対応しました', 'Done'],
  wont: ['変更しません', 'Won’t change'],
};

// ----------------------------------------------------------------------------------------------------- the screen under
const seen = (node) => { const r = node.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight; };
function hostDialogs() {
  return [...document.querySelectorAll('dialog[open]')].filter((d) => !root.contains(d) && !d.closest('#bunki-reports-root'));
}
function visibleHeading(dialog) {
  // the screen's own name before any section's
  const pick = (scope) => scope && ['h1, .headword, .view-title, .hero-mean', 'h2, [role="heading"]']
    .map((names) => [...scope.querySelectorAll(names)].find((n) => !root.contains(n) && seen(n))).find(Boolean);
  const found = pick(dialog) || pick(document.querySelector('#sheet')) || pick(document.querySelector('#app')) || pick(document.body);
  if (!found) return '';
  // a kanji page is named by its character and its meaning
  const glyph = found.classList.contains('hero-mean') ? found.closest('.hero')?.querySelector('.hero-glyph')?.textContent.trim() : '';
  return `${glyph ? `${glyph} · ` : ''}${found.textContent.replace(/\s+/g, ' ').trim()}`.slice(0, 120);
}
function snapshot() {
  const state = host.state || {};
  const top = Array.isArray(state.stack) ? state.stack.at(-1) : null;
  const dialog = hostDialogs().at(-1) || null;
  const parts = [`view=${document.body.dataset.view || state.view || ''}`];
  if (state.view === 'reader' && state.passageId) parts.push(`reading=${state.passageId}`);
  if (top?.t) parts.push(`page=${top.t}:${top.id}`);
  if (dialog) parts.push(`dialog=${dialog.id || dialog.className || 'dialog'}`);
  if (document.documentElement.dataset.layout) parts.push(`layout=${document.documentElement.dataset.layout}`);
  parts.push(`address=${location.pathname}${location.search}${location.hash}`);
  return { route: parts.join(' '), heading: visibleHeading(dialog), viewport: { w: innerWidth, h: innerHeight }, lang: lang(),
    focus: document.activeElement && document.activeElement !== document.body && !root.contains(document.activeElement) ? document.activeElement : null };
}
function cssPath(node) {
  const parts = [];
  for (let n = node; n && n.nodeType === 1 && parts.length < 8; n = n.parentElement) {
    if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
    let part = n.tagName.toLowerCase() + [...n.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
    const same = n.parentElement ? [...n.parentElement.children].filter((s) => s.tagName === n.tagName) : [];
    if (same.length > 1) part += `:nth-of-type(${same.indexOf(n) + 1})`;
    parts.unshift(part);
  }
  return parts.join(' > ');
}
function describe(node, offset = { x: 0, y: 0 }, prefix = '') {
  const r = node.getBoundingClientRect();
  const text = (node.getAttribute('aria-label') || node.innerText || node.textContent || node.getAttribute('alt') || node.value || '')
    .replace(/\s+/g, ' ').trim().slice(0, 160);
  return { text, path: prefix + cssPath(node),
    rect: { x: Math.round(r.left + offset.x), y: Math.round(r.top + offset.y), w: Math.round(r.width), h: Math.round(r.height) } };
}
/** the element at a point, under this layer; one step into a same-origin frame (the study frame, the orbit page) */
function elementAt(x, y) {
  let node = document.elementsFromPoint(x, y).find((n) => !root.contains(n));
  if (!node) return null;
  // an icon or a bare shape says nothing: the nearest thing with words (its button, its label) is what was meant
  for (let up = node, hops = 0; up && hops < 4; up = up.parentElement, hops += 1) {
    if ((up.getAttribute('aria-label') || up.innerText || '').trim()) { node = up; break; }
  }
  if (node.tagName === 'IFRAME') {
    try {
      const box = node.getBoundingClientRect();
      const inner = node.contentDocument?.elementFromPoint(x - box.left, y - box.top);
      if (inner) return describe(inner, { x: box.left, y: box.top }, `${cssPath(node)} >>> `);
    } catch { /* another origin: the frame itself is the answer */ }
  }
  return describe(node);
}

// ------------------------------------------------------------------------------------------------------------ the rail
/** Native modals make everything outside them inert, so the button moves into the open one, as the report entry does. */
function keepReachable() {
  if (!root || sheet.open || pointing) return;
  const dialogs = hostDialogs();
  const focused = document.activeElement?.closest?.('dialog[open]');
  const destination = (dialogs.includes(focused) ? focused : dialogs.at(-1)) || document.querySelector('#stroke-page:not([inert])') || document.body;
  if (root.parentElement !== destination) destination.append(root);
  if (rail.hasAttribute('popover') && !rail.matches(':popover-open')) {
    try { rail.showPopover(); } catch { rail.removeAttribute('popover'); }
  }
  document.documentElement.dataset.plLang = lang();
  place();
}
/** part of the app's fixed chrome (a floating control, a bar), as against the page that scrolls under this button */
function fixedChrome(node) {
  for (let n = node; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true;
  return false;
}
/** above the report bug, wherever that stands now; one step further up while a floating control of the app is under the spot */
function place() {
  const bug = document.querySelector('#bunki-reports-root .br-rail')?.getBoundingClientRect();
  // where a screen keeps the report entry at its top (the writing room, the orbit bar) this button stands to its left
  if (bug && bug.height && bug.top < innerHeight / 2) {
    rail.dataset.plAt = 'top';
    rail.style.setProperty('--pl-top', `${Math.round(Math.max(0, bug.top))}px`);
    rail.style.setProperty('--pl-right', `${Math.round(Math.max(4, innerWidth - bug.left + 4))}px`);
    return;
  }
  delete rail.dataset.plAt;
  const base = bug && bug.height ? Math.max(8, innerHeight - bug.top + 6) : 64;
  const right = bug && bug.height ? Math.max(4, innerWidth - bug.right) : 14;
  let bottom = base;
  for (let step = 0; step < 4; step += 1) {
    const x = innerWidth - right - 22, y = innerHeight - bottom - 22;
    const under = document.elementsFromPoint(x, y).find((n) => !root.contains(n));
    const control = under?.closest?.('button, a[href], [role="button"]');
    if (!control || !fixedChrome(control)) break;
    bottom += 52;
  }
  rail.style.setProperty('--pl-bottom', `${Math.round(bottom)}px`);
  rail.style.setProperty('--pl-right', `${Math.round(right)}px`);
}
function schedule() {
  if (placeTimer) return;
  placeTimer = setTimeout(() => { placeTimer = null; keepReachable(); }, 120);
}

// ----------------------------------------------------------------------------------------------------------- the sheet
function openSheet(tab = active) {
  if (sheet.open) return;
  context = snapshot();
  active = tab;
  notice = '';
  dismissIntro();
  if (rail.hasAttribute('popover') && rail.matches(':popover-open')) rail.hidePopover();
  render();
  sheet.showModal();
  tabs.querySelector('[aria-current="page"]')?.focus();
  if (active === 'notes') loadNotes();
}
function closeSheet() { if (sheet.open) sheet.close(); }
function onSheetClosed() {
  if (sheet.open || pointing) return; // closed to point at something: the sheet comes back by itself
  keepReachable(); // the button shows again before it takes the focus back
  opener.focus({ preventScroll: true });
}
function setTab(name) {
  active = name;
  render();
  if (name === 'notes') loadNotes();
  tabs.querySelector('[aria-current="page"]')?.focus();
}
function render() {
  sheet.querySelector('#pl-title').textContent = t('試作版', 'Prototype');
  sheet.querySelector('.pl-close').textContent = t('閉じる', 'Close');
  tabs.replaceChildren();
  for (const [name, ja, en] of [['new', 'この版の新しいもの', 'New in this build'], ['notes', '気になるところを書く', 'Tell me what’s off']]) {
    const tab = button('', t(ja, en), () => setTab(name));
    tab.dataset.plTab = name;
    if (name === active) tab.setAttribute('aria-current', 'page');
    tabs.append(tab);
  }
  body.replaceChildren();
  if (active === 'new') renderNew(); else renderNotes();
}
function mark() { const seal = h('span', 'pl-new', t('新', 'new')); seal.setAttribute('aria-hidden', 'true'); return seal; }
function renderNew() {
  body.append(renderTrial(), h('p', 'pl-note', t('今日つくられた、またはつながったものです。アプリの中では「新」の印がついています。',
    'Built or connected today. In the app each one carries the mark.')));
  const list = h('ul', 'pl-list');
  for (const item of NEW) {
    const row = h('li', 'pl-item');
    row.dataset.plItem = item.id;
    const text = h('div', 'pl-item-text');
    const name = h('p', 'pl-item-name', t(item.ja, item.en));
    name.append(mark());
    text.append(name, h('p', 'pl-item-line', t(item.lineJa, item.lineEn)));
    const actions = h('div', 'pl-item-go');
    const go = button('pl-go', t('行く', 'Go'), () => travel(item.go));
    go.dataset.plGo = item.id;
    go.setAttribute('aria-label', `${t('行く', 'Go')}: ${t(item.ja, item.en)}`);
    actions.append(go);
    if (item.back && document.documentElement.dataset.layout === 'places') {
      const back = button('pl-go pl-go-quiet', t('いつもの並びへ', 'Usual layout'), () => travel(item.back));
      back.dataset.plGo = `${item.id}-back`;
      actions.append(back);
    }
    row.append(text, actions);
    list.append(row);
  }
  body.append(list, h('h3', 'pl-rule', t('まだつながっていないもの', 'Not connected yet')));
  const rest = h('ul', 'pl-rest');
  for (const [ja, en] of NOT_YET) rest.append(h('li', '', t(ja, en)));
  body.append(rest);
}
function travel(go) {
  closeSheet();
  if (typeof go === 'function') { Promise.resolve().then(go).catch(() => {}); return; }
  location.assign(new URL(go, document.baseURI).href);
}

// ----------------------------------------------------------------------------------------------------------- the notes
const feedbackUrl = (path = '__feedback') => new URL(path, document.baseURI).href;
/** the list; a page under the app's service worker gets its own GETs answered by the worker, except under api/ */
async function readNotes() {
  for (const path of ['__feedback', 'api/__feedback']) {
    try {
      const response = await fetch(feedbackUrl(path), { cache: 'no-store', headers: { accept: 'application/json' } });
      const data = response.ok ? await response.json() : null;
      if (Array.isArray(data?.items)) return data.items;
    } catch { /* the next address */ }
  }
  throw new Error('no-endpoint');
}
async function loadNotes() {
  try {
    notes = await readNotes();
    endpoint = 'ok';
  } catch {
    if (endpoint !== 'ok') endpoint = 'missing'; // one failed refresh of a working endpoint keeps the list it had
  }
  if (sheet.open && active === 'notes') renderNoteList();
}
/** one clock for the whole visit: it asks only while the sheet is open on the notes, so no close or reopen can stop it */
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { if (sheet.open && active === 'notes') loadNotes(); }, POLL_MS);
}
async function send() {
  const box = body.querySelector('#pl-text');
  const text = box.value.trim();
  if (!text || busy) return;
  busy = true; notice = ''; renderNoteForm();
  let build = 'unknown';
  try { const served = await host.served(); if (served?.git_sha) build = served.git_sha; } catch { /* unknown */ }
  try {
    const response = await fetch(feedbackUrl(), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ text, route: context.route, heading: context.heading, build, viewport: context.viewport, target, lang: context.lang }) });
    const data = response.ok ? await response.json() : null;
    if (data?.ok !== true) throw new Error(response.status === 404 || response.status === 405 ? 'no-endpoint' : 'refused');
    endpoint = 'ok'; target = null; write(DRAFT_KEY, null);
    notice = t('送りました。返事はこの下に出ます。', 'Sent. The reply will show below.');
    busy = false; renderNoteForm('');
    await loadNotes();
    return;
  } catch (error) {
    if (error.message === 'no-endpoint' || endpoint === 'missing') endpoint = 'missing';
    else notice = t('送れませんでした。書いた文は残っています。もう一度送ってください。', 'It could not be sent. Your text is kept; send it again.');
  }
  busy = false; renderNoteForm();
}
function renderNotes() {
  body.append(h('div', 'pl-form'), h('h3', 'pl-rule', t('これまでのメモ', 'Your notes')), h('div', 'pl-notes'));
  renderNoteForm();
  renderNoteList();
}
function renderNoteForm(value) {
  const form = body.querySelector('.pl-form');
  if (!form) return;
  const kept = value ?? form.querySelector('#pl-text')?.value ?? read(DRAFT_KEY) ?? '';
  form.replaceChildren();
  const label = h('label', 'pl-field');
  label.append(h('span', '', t('何が気になりますか。', 'What is off?')));
  const box = h('textarea');
  box.id = 'pl-text'; box.rows = 4; box.value = kept;
  box.placeholder = t('例：この扉の文が長すぎる。', 'For example: the wording on this door is too long.');
  box.addEventListener('input', () => write(DRAFT_KEY, box.value || null));
  label.append(box);
  form.append(label);
  const about = h('p', 'pl-note pl-context');
  about.textContent = `${t('いっしょに送るもの', 'Sent with it')}: ${context.heading ? `“${context.heading}” · ` : ''}${context.route.split(' address=')[0]} · ${context.viewport.w}×${context.viewport.h}`;
  form.append(about);
  if (target) {
    const pointed = h('p', 'pl-target');
    pointed.append(h('span', '', `${t('指したもの', 'Pointing at')}: “${target.text.slice(0, 80) || target.path}”`));
    const drop = button('pl-link', t('外す', 'Remove'), () => { target = null; renderNoteForm(); });
    drop.dataset.plAction = 'unpoint';
    pointed.append(drop);
    form.append(pointed);
  }
  if (endpoint === 'missing') {
    const only = h('p', 'pl-notice', t('メモは Mac の試作版でだけ送れます。書いた文はここに残ります。', 'Notes work on the Mac prototype only. Your text is kept here.'));
    only.setAttribute('role', 'status'); only.dataset.plNotice = 'missing';
    form.append(only);
  } else if (notice) {
    const line = h('p', 'pl-notice', notice);
    line.setAttribute('role', 'status');
    form.append(line);
  }
  const actions = h('div', 'pl-actions');
  const point = button('pl-quiet', target ? t('指し直す', 'Point again') : t('指して示す', 'Point at it'), startPointing);
  point.dataset.plAction = 'point';
  const submit = button('pl-primary', busy ? t('送っています…', 'Sending…') : t('送る', 'Send'), send);
  submit.dataset.plAction = 'send';
  submit.disabled = busy || endpoint === 'missing';
  actions.append(point, submit);
  form.append(actions);
}
function clock(ts) {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(lang() === 'ja' ? 'ja-JP' : 'en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function renderNoteList() {
  const list = body.querySelector('.pl-notes');
  if (!list) return;
  if (endpoint === 'missing' && body.querySelector('[data-pl-action="send"]') && !body.querySelector('[data-pl-notice="missing"]')) renderNoteForm();
  list.replaceChildren();
  if (endpoint === 'missing') return;
  if (!notes) { list.append(h('p', 'pl-note', t('読み込み中…', 'Loading…'))); return; }
  if (!notes.length) { list.append(h('p', 'pl-note', t('まだメモはありません。', 'No notes yet.'))); return; }
  const rows = h('ul', 'pl-note-list');
  for (const note of notes) {
    const row = h('li', 'pl-note-row');
    row.dataset.plNote = String(note.id);
    const head = h('p', 'pl-note-head');
    const status = h('span', 'pl-status', t(...(STATUS[note.status] || [note.status, note.status])));
    status.dataset.plStatus = note.status;
    head.append(status, h('span', 'pl-date', clock(note.ts)));
    row.append(head, h('p', 'pl-note-text', note.text));
    const where = [note.heading && `“${note.heading}”`, note.target?.text && `${t('指したもの', 'pointing at')} “${String(note.target.text).slice(0, 60)}”`].filter(Boolean).join(' · ');
    if (where) row.append(h('p', 'pl-note pl-note-where', where));
    if (note.reply) {
      const reply = h('p', 'pl-reply');
      reply.append(h('strong', '', t('返事', 'Reply')), document.createTextNode(` ${note.reply}`));
      if (note.replyTs) reply.append(h('span', 'pl-date', clock(note.replyTs)));
      row.append(reply);
    }
    rows.append(row);
  }
  list.append(rows);
}

// ------------------------------------------------------------------------------------------------------- point at it
function startPointing() {
  const text = body.querySelector('#pl-text')?.value ?? '';
  write(DRAFT_KEY, text || null);
  pointing = true;
  closeSheet();
  pointer.querySelector('.pl-point-hint').textContent = t('気になるところを押してください。Esc でやめます。', 'Tap the thing that is off. Esc cancels.');
  try { pointer.showPopover(); } catch { /* no top layer: the layer is fixed and still catches the tap */ pointer.dataset.open = '1'; }
  pointer.focus({ preventScroll: true });
}
function stopPointing(picked) {
  if (!pointing) return;
  pointing = false;
  delete pointer.dataset.open;
  try { if (pointer.matches(':popover-open')) pointer.hidePopover(); } catch { /* already closed */ }
  if (picked) target = picked;
  const kept = context;
  openSheet('notes');
  context = kept; // the note is still about the screen it was started on
  renderNoteForm();
}

// ------------------------------------------------------------------------------------------------------------ the line
function dismissIntro() {
  if (intro.hidden) return;
  intro.hidden = true;
  write(INTRO_KEY, '1');
}

// ----------------------------------------------------------------------------------------------------------- arrivals
/** a Go that lands on a long page: bring the new thing into view (the candidates stand after the shelf's own 150) */
function arrive() {
  const wanted = new URLSearchParams(location.search).get('pl');
  if (wanted !== 'candidates') return;
  let tries = 0;
  const timer = setInterval(() => {
    const first = document.querySelector('.shelf-item .library-candidate-tag');
    tries += 1;
    if (first) { clearInterval(timer); first.closest('.shelf-item').scrollIntoView({ block: 'start' }); window.scrollBy(0, -96); }
    else if (tries > 60) clearInterval(timer);
  }, 250);
}

// ------------------------------------------------------------------------------------------------- 糸 depth · a trial
/** 糸 depth (lead, 2026-11-10 evening). Off until its switch in the sheet is on; the switch is kept under ITO_KEY, this
 * layer's own key. The app is one zoom, from the sky of words down into the inside of a character, and two things make
 * that felt:
 *   the light  the look follows the level the app's own trail names: the learner's look down to a sentence, dusk on a
 *              word, night on a kanji or a part, and the learner's look again on the way up;
 *   the cord   a red cord down the left edge with one bead per level of that trail. The app's breadcrumb row is hidden
 *              while the trial is on, and a bead presses that row's own control, so every move is the app's own.
 * Both are read from the app's trail row (`.scale-thread`, modules/return.mjs). The look is put on the root the way
 * setKairoTheme puts it, and the learner's saved choice is never written: this file has no write to `kairo-theme`. */
const ITO_KEY = 'bunki-prototype:ito-depth:v1';
const CORD_ID = 'bunki-prototype-cord';
const NIGHT_LOOKS = ['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']; // the app's own night list (setKairoTheme)
const DUSK = 'iwa', NIGHT = 'yoru', DEEP_NIGHT = 'kaku';
const KNOT = { sky: '宙', shelf: '棚', room: '間', article: '記', sentence: '文', word: '語', kanji: '字', part: '部', entry: '項' };
const SVG = 'http://www.w3.org/2000/svg';
const CORD_EASE = 'cubic-bezier(.2,.8,.2,1)';
const ito = {
  on: false,
  actual: null, // the depth look on the root now; null = the learner's own
  wanted: null, // the look asked for (a cross-fade puts it on the root one frame later)
  home: null, // the learner's look as the app set it, held while a depth look stands
  held: false, // the learner chose a look by hand on this page: the light waits for the next level
  level: '', sig: '', watch: null, fades: 0, asked: false,
  stirred: 0, // counts the changes the app makes to the screen: the light waits for a still page
  fade: null, // the cross-fade on the glass now
  press: null, // a mouse press that ended a fade: where its click is owed
  cord: null, thread: null, ghost: null, holes: null, knots: [], length: 0, shape: '',
};
const still = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** The app's trail row for the screen on the glass; none in a room with its own light (a world's dialog, the writing
 * room). The cord shows where the app would show that row and nowhere else: a row the app, or a stylesheet over it,
 * takes off the glass (display: none) carries no cord. This trial hides the row another way (prototype-layer.css), so
 * that test stays true while the trial is on. */
function trailRow() {
  if (hostDialogs().length || document.querySelector('#stroke-page')) return null;
  const rows = [...document.querySelectorAll('#sheet > .scale-thread, #app > .scale-thread')].filter((row) => !row.closest('[inert]'));
  const row = rows.find((item) => item.parentElement.id === 'sheet') || rows[0] || null;
  return row && getComputedStyle(row).display !== 'none' ? row : null;
}
function readTrail(row) {
  return [...row.children].map((node, index) => {
    const into = node.hasAttribute('data-scale-in'), out = node.hasAttribute('data-scale-out');
    const label = node.textContent.replace(/\s*›\s*$/, '').trim();
    return { index, kind: into ? 'in' : out ? 'out' : 'bead', scale: (into ? node.dataset.scaleTarget : node.dataset.scaleBead) || 'entry',
      current: node.getAttribute('aria-current') === 'step', label, name: node.getAttribute('aria-label') || label,
      off: node.tagName !== 'BUTTON' || node.disabled };
  });
}
/** the look a level wears, from the learner's own: a night look is already dusk, and its night is the phosphor night */
function lookFor(scale) {
  if (!ito.on || ito.held) return null;
  const home = ito.actual === null ? document.documentElement.getAttribute('data-theme') || 'hokusai' : ito.home.id;
  const night = NIGHT_LOOKS.includes(home);
  const look = scale === 'word' ? (night ? home : DUSK) : scale === 'kanji' || scale === 'part' ? (night ? DEEP_NIGHT : NIGHT) : home;
  return look === home ? null : look;
}
/** the phone's own bar follows the frame drawn, as the app's syncThemeColor has it; on a page that frame is the page's bar */
function paintBarColour() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const bar = document.querySelector('#sheet > .sheet-bar') || document.querySelector('#app > .chrome');
  if (!meta || !bar) return;
  const raw = getComputedStyle(bar).backgroundColor, nums = raw.match(/-?[0-9.]+/g)?.map(Number) || [];
  if (nums.length < 3 || (nums.length > 3 && nums[3] === 0)) return;
  const scale = raw.startsWith('color(') ? 255 : 1;
  const hex = `#${nums.slice(0, 3).map((n) => Math.round(Math.max(0, Math.min(255, n * scale))).toString(16).padStart(2, '0')).join('')}`;
  if (meta.getAttribute('content') !== hex) meta.setAttribute('content', hex);
}
/** Put a look on the root as setKairoTheme does: the attribute, the colour scheme and its meta. The saved choice is not
 * touched. The app regrows its paper whenever the body's own ground changes (syncPaper), and that paper is the writing
 * room's ground; so while a depth look stands the body keeps the learner's ground colour (prototype-layer.css). The body
 * is under its own ::before layer and under the page, so that colour is never on the glass. */
function writeLook(look) {
  if (look === ito.actual) return;
  const top = document.documentElement, meta = document.querySelector('meta[name="color-scheme"]');
  if (ito.actual === null) {
    const theme = top.getAttribute('data-theme');
    ito.home = { theme, id: theme || 'hokusai', scheme: top.style.colorScheme, meta: meta ? meta.getAttribute('content') : null,
      ground: getComputedStyle(document.body).backgroundColor };
  }
  if (look === null) {
    if (ito.home.theme === null) top.removeAttribute('data-theme'); else top.setAttribute('data-theme', ito.home.theme);
    top.style.colorScheme = ito.home.scheme;
    if (meta && ito.home.meta !== null) meta.setAttribute('content', ito.home.meta);
    delete top.dataset.plItoLook;
    top.style.removeProperty('--pl-ito-home-ground');
  } else {
    const night = NIGHT_LOOKS.includes(look);
    top.setAttribute('data-theme', look);
    top.style.colorScheme = night ? 'dark' : 'light';
    meta?.setAttribute('content', night ? 'dark' : 'light');
    top.style.setProperty('--pl-ito-home-ground', ito.home.ground);
    top.dataset.plItoLook = look;
  }
  ito.actual = look;
  ito.watch?.takeRecords(); // these writes are this layer's own, not the learner's hand
  paintBarColour();
}
/** One change of the whole glass: the browser holds the screen as it stands, the look changes under it, and the two are
 * cross-faded (the timing is in prototype-layer.css). Nothing is laid out again, so no bar or line can move. The held
 * picture is a still one, so the fade starts once the arriving page stands still: its headword has landed (the app
 * flies it home for a third of a second, `.cut-word`) and its late lines are in; anything still moving would stand
 * double in the fade. With no such transition in the browser, or where the system asks for less motion, the look
 * changes at once, with the page. */
function setLook(look, atOnce = false) {
  if (atOnce) {
    // a room with its own light takes its colours as it is built (the writing room reads its ink for the guide glyph):
    // the learner's look is on the root before that, with no fade to wait for
    ito.wanted = look;
    ito.fade?.skipTransition();
    writeLook(look);
    return;
  }
  if (look === ito.wanted) return;
  ito.wanted = look;
  if (ito.asked) return; // the fade already asked for puts the newest look on the root
  if (still() || typeof document.startViewTransition !== 'function' || document.hidden) { writeLook(look); return; }
  ito.asked = true;
  const asked = performance.now();
  let seen = ito.stirred, quiet = 0;
  const wait = () => {
    const now = performance.now();
    if (ito.stirred === seen) quiet += 1; else { seen = ito.stirred; quiet = 0; }
    if ((quiet >= 2 && now - asked >= 90 && !document.querySelector('.cut-word')) || now - asked > 800) startFade();
    else requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}
function startFade() {
  const top = document.documentElement, look = ito.wanted;
  if (look === ito.actual || !ito.on && look !== null) { ito.asked = false; return; }
  const turn = ++ito.fades;
  top.dataset.plItoFade = '';
  let fade = null;
  try { fade = document.startViewTransition(() => { ito.asked = false; writeLook(ito.wanted); }); } catch { fade = null; }
  if (!fade) { ito.asked = false; writeLook(look); delete top.dataset.plItoFade; return; }
  ito.fade = fade;
  const done = () => { if (turn === ito.fades) { delete top.dataset.plItoFade; ito.fade = null; } };
  fade.finished.then(done, done);
  fade.ready.catch(() => {}); // skipped by a newer change: the look is on the root all the same
}
/** The light never blocks the hand. While the browser holds the glass for a cross-fade the page under it takes no taps
 * (the app keeps its root out of its own transitions for this reason, rooms/motion.css). So the first touch ends the
 * fade at once: the look is already on the root, and the tap lands on the page. A mouse press is the one case where the
 * browser has by then given the press to the root; its click is handed to the thing under the pointer. */
function onFadePress(event) {
  if (!ito.fade) return;
  ito.fade.skipTransition();
  ito.press = event.pointerType === 'mouse' && event.button === 0 ? { x: event.clientX, y: event.clientY, at: performance.now() } : null;
}
function onFadeClick(event) {
  const press = ito.press;
  ito.press = null;
  if (!press || event.target !== document.documentElement || !event.isTrusted || performance.now() - press.at > 900 ||
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return;
  const under = document.elementFromPoint(event.clientX, event.clientY);
  if (!under || under === document.documentElement) return;
  under.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window, detail: 1,
    clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY, button: 0 }));
}
/** the learner's hand: a look chosen in the app while a depth look stands is theirs, and stays until the next level */
function onRootLook() {
  const now = document.documentElement.getAttribute('data-theme');
  if (ito.actual === null || now === ito.actual) return;
  const top = document.documentElement;
  delete top.dataset.plItoLook;
  top.style.removeProperty('--pl-ito-home-ground');
  ito.actual = null; ito.wanted = null; ito.home = null; ito.held = true;
}

// the cord: where each bead stands, and the thread through them
function cordShape(count) {
  const wide = innerWidth >= 1100;
  const base = wide ? { wide, cx: 23, first: 54, step: 58, sway: 2.4, waves: 1, ring: 5.5, now: 7.5 }
    : { wide, cx: 6, first: 30, step: 40, sway: 1.2, waves: 1, ring: 3.5, now: 4.5 }; // --pl-cord-x and the bead sizes in the styles
  // the thread comes out from under the top bar; on the sky, which has no bar, from above the glass
  base.from = document.body.dataset.view === 'drift' && !document.querySelector('#sheet') ? -64 : 0;
  const room = innerHeight - 45 - base.first - (wide ? 56 : 156);
  base.step = Math.max(26, Math.min(base.step, Math.floor(room / Math.max(1, count - 0.4))));
  return base;
}
const knotY = (shape, index) => shape.first + index * shape.step;
/** the thread from its start down to `to`, swaying, and through the middle of every bead; its length comes back with it */
function threadPath(shape, to) {
  const x = (y) => shape.cx + shape.sway * Math.sin((Math.PI * shape.waves * (y - shape.first)) / shape.step);
  let d = '', length = 0, px = 0, py = 0;
  for (let y = shape.from; ; y = Math.min(y + 2, to)) {
    const nx = Math.round(x(y) * 100) / 100;
    if (d) length += Math.hypot(nx - px, y - py);
    d += `${d ? 'L' : 'M'}${nx} ${y}`;
    px = nx; py = y;
    if (y >= to) break;
  }
  return { d, length };
}
function buildCord() {
  const cord = h('div'); // a plain box with the navigation role: no rule the app has for <nav> reaches it
  cord.id = CORD_ID;
  cord.setAttribute('role', 'navigation');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const defs = document.createElementNS(SVG, 'defs'), mask = document.createElementNS(SVG, 'mask');
  mask.id = 'pl-cord-holes'; mask.setAttribute('maskUnits', 'userSpaceOnUse');
  for (const [name, value] of [['x', '-40'], ['y', '-80'], ['width', '160'], ['height', '4000']]) mask.setAttribute(name, value);
  defs.append(mask);
  ito.holes = mask;
  ito.thread = document.createElementNS(SVG, 'path');
  ito.thread.setAttribute('class', 'pl-cord-thread'); ito.thread.setAttribute('mask', 'url(#pl-cord-holes)');
  ito.ghost = document.createElementNS(SVG, 'path');
  ito.ghost.setAttribute('class', 'pl-cord-ghost');
  svg.append(defs, ito.thread, ito.ghost);
  cord.append(svg);
  cord.addEventListener('keydown', onCordKey);
  ito.cord = cord; ito.knots = []; ito.length = 0; ito.shape = '';
  root.prepend(cord);
}
/** The cord stands where the row it carries stands: right after that row, in the page or the room. So it is on the same
 * keyboard ring as the row was (a page keeps Tab inside itself), and it leaves with its screen. With no trail it waits
 * in this layer's root. */
function placeCord(row) {
  const cord = ito.cord;
  if (!cord) return;
  if (!row) { if (cord.parentElement !== root) root.prepend(cord); return; }
  if (cord.previousElementSibling !== row) row.after(cord);
  // the app's one-live-layer law marks everything beside an open page; the cord has by now moved into that page
  if (cord.inert) cord.inert = false;
  if (cord.hasAttribute('aria-hidden')) cord.removeAttribute('aria-hidden');
}
function dropCord() {
  ito.cord?.remove();
  ito.cord = ito.thread = ito.ghost = ito.holes = null; ito.knots = []; ito.length = 0; ito.shape = '';
}
function drawCord(trail) {
  if (!trail.length) { if (ito.cord) ito.cord.hidden = true; return; }
  if (!ito.cord) buildCord();
  const cord = ito.cord, fresh = cord.hidden || !ito.knots.length, shape = cordShape(trail.length);
  const key = `${shape.wide}:${shape.step}:${shape.from}`, moved = key !== ito.shape, calm = still() || fresh || moved;
  ito.shape = key;
  cord.hidden = false;
  cord.dataset.plCord = shape.wide ? 'wide' : 'slim';
  cord.setAttribute('aria-label', t('ことばの道すじ', 'The way through the text'));
  cord.style.setProperty('--pl-cord-step', `${shape.step}px`);
  cord.style.height = `${knotY(shape, trail.length - 1) + shape.step}px`;

  // the beads: one per place on the trail, kept by its place so a bead that stays never moves
  for (const [index, bead] of trail.entries()) {
    let knot = ito.knots[index];
    if (!knot) {
      knot = button('pl-knot', '', (event) => pressKnot(index, event));
      knot.append(h('span', 'pl-knot-k'), h('span', 'pl-knot-o'), h('span', 'pl-knot-tip'));
      knot.dataset.plKnotAt = String(index);
      ito.knots[index] = knot;
      cord.append(knot);
      if (!calm) knot.animate([{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 460, easing: CORD_EASE });
    }
    const glyph = (bead.scale === 'kanji' || bead.scale === 'part') && [...bead.label].length === 1 ? bead.label : KNOT[bead.scale] || KNOT.entry;
    knot.dataset.plKnot = bead.kind === 'in' ? 'in' : bead.current ? 'now' : 'bead';
    knot.dataset.plScale = bead.scale;
    knot.style.top = `${knotY(shape, index)}px`;
    knot.children[0].textContent = glyph;
    knot.children[2].textContent = bead.kind === 'bead' ? bead.label : bead.name;
    knot.setAttribute('aria-label', bead.name);
    if (bead.current) knot.setAttribute('aria-current', 'step'); else knot.removeAttribute('aria-current');
    // the bead of the place the learner stands at goes nowhere; the app's own row draws it as text, not as a control
    knot.disabled = bead.off && !bead.current;
    if (bead.current && bead.off) knot.setAttribute('aria-disabled', 'true'); else knot.removeAttribute('aria-disabled');
  }
  for (const knot of ito.knots.splice(trail.length)) {
    if (calm) { knot.remove(); continue; }
    knot.disabled = true;
    knot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' }).finished.then(() => knot.remove(), () => knot.remove());
  }

  // the thread ends in the bead of this place; past it, a dotted way further in where the app offers one
  const at = Math.max(0, trail.findIndex((bead) => bead.current));
  const end = knotY(shape, at), next = trail.find((bead) => bead.kind === 'in');
  const path = threadPath(shape, end), before = ito.length;
  // the thread does not cross the inside of a ring, nor (on the wide cord) the mark that stands over each bead
  const cut = (tag, values) => { const node = document.createElementNS(SVG, tag); for (const [name, value] of Object.entries(values)) node.setAttribute(name, String(value)); return node; };
  ito.holes.replaceChildren(cut('rect', { x: -40, y: -80, width: 160, height: 4000, fill: '#fff' }));
  for (const [index, bead] of trail.entries()) {
    const y = knotY(shape, index);
    if (!bead.current) ito.holes.append(cut('circle', { cx: shape.cx, cy: y, r: bead.kind === 'in' ? shape.ring - 1 : shape.ring, fill: '#000' }));
    if (shape.wide && bead.kind !== 'in') ito.holes.append(cut('rect', { x: shape.cx - 9, y: y - shape.now - 21, width: 18, height: 17, fill: '#000' }));
  }
  for (const running of ito.thread.getAnimations()) running.cancel();
  const settle = () => {
    ito.thread.setAttribute('d', path.d);
    ito.thread.style.strokeDasharray = `${path.length} ${path.length}`;
  };
  if (calm || !before || Math.abs(path.length - before) < 1) settle();
  else if (path.length > before) {
    settle();
    ito.thread.animate([{ strokeDashoffset: path.length - before }, { strokeDashoffset: 0 }], { duration: 520, easing: CORD_EASE });
  } else {
    // drawn back up along the thread that was there, then cut to the shorter one
    const gone = before - path.length;
    ito.thread.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: gone }], { duration: 380, easing: CORD_EASE }).finished.then(settle, () => {});
  }
  ito.length = path.length;
  const tail = next ? knotY(shape, next.index) - (shape.ring - 1) - 3 : trail[at].scale === 'part' ? 0 : end + shape.now + 3 + shape.step * 0.55;
  ito.ghost.setAttribute('d', tail ? `M${shape.cx} ${end + shape.now + 4}L${shape.cx} ${tail}` : '');
  if (!calm && tail) ito.ghost.animate([{ opacity: 0 }, { opacity: 0.5 }], { duration: 520, easing: 'ease-out' });
}
/** a bead pressed: the app's own control in its own row does the moving */
function pressKnot(index, event) {
  const row = trailRow(), control = row?.children[index];
  if (!control || control.tagName !== 'BUTTON' || control.disabled) return;
  const byKey = event.detail === 0;
  control.click();
  syncIto();
  // the app hands the keyboard to its row, which is not on the glass now: the cord takes it
  if (byKey) (ito.knots.find((knot) => knot.dataset.plKnot === 'in' && !knot.disabled) || ito.knots.filter((knot) => !knot.disabled && knot.dataset.plKnot === 'bead').at(-1))?.focus({ preventScroll: true });
}
function onCordKey(event) {
  const step = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity }[event.key];
  if (!step) return;
  const open = ito.knots.filter((knot) => !knot.disabled && knot.isConnected);
  const from = open.indexOf(document.activeElement);
  if (from < 0 || !open.length) return;
  event.preventDefault();
  event.stopPropagation();
  open[Math.max(0, Math.min(open.length - 1, from + step))].focus({ preventScroll: true });
}

/** the level on the glass now: its beads on the cord, its look on the root */
function syncIto(redraw = false, records = null) {
  if (!ito.on) return;
  // the app's own changes to the screen (this layer's root and the cord's inside are not the app's)
  if (records?.some((record) => !root.contains(record.target) && !ito.cord?.contains(record.target))) ito.stirred += 1;
  const row = trailRow(), trail = row ? readTrail(row) : [];
  const scale = row?.dataset.scale || '';
  const level = `${scale}|${trail.map((bead) => `${bead.kind}:${bead.scale}:${bead.label}`).join('|')}`;
  const sig = `${level}|${trail.map((bead) => `${bead.current ? 1 : 0}${bead.off ? 1 : 0}`).join('')}|${lang()}`;
  if (level !== ito.level) { ito.level = level; ito.held = false; }
  if (redraw || sig !== ito.sig) { ito.sig = sig; drawCord(trail); }
  placeCord(trail.length ? row : null);
  // a world's dialog or the writing room is on the glass: the learner's look, at once
  if (!row && (hostDialogs().length || document.querySelector('#stroke-page'))) setLook(null, true);
  else setLook(lookFor(scale));
}
function setIto(on) {
  const top = document.documentElement;
  ito.on = !!on;
  write(ITO_KEY, ito.on ? '1' : null);
  if (ito.on) {
    top.dataset.plIto = 'on';
    if (!ito.watch) {
      ito.watch = new MutationObserver(onRootLook);
      ito.watch.observe(top, { attributes: true, attributeFilter: ['data-theme'] });
      window.addEventListener('pointerdown', onFadePress, { capture: true, passive: true });
      window.addEventListener('click', onFadeClick, true);
    }
    ito.sig = ''; ito.level = '';
    syncIto();
  } else {
    setLook(null);
    ito.watch?.disconnect(); ito.watch = null;
    window.removeEventListener('pointerdown', onFadePress, { capture: true });
    window.removeEventListener('click', onFadeClick, true);
    dropCord();
    delete top.dataset.plIto;
    ito.held = false; ito.sig = ''; ito.level = '';
  }
  const control = sheet?.querySelector('#pl-ito-switch');
  if (control) control.setAttribute('aria-checked', String(ito.on));
}
/** the switch, at the head of "New in this build" */
function renderTrial() {
  const row = h('div', 'pl-trial');
  const text = h('div', 'pl-item-text');
  const name = h('p', 'pl-item-name', t('糸 深さ · 試し', '糸 Depth · trial'));
  name.id = 'pl-ito-name';
  name.append(mark());
  text.append(name, h('p', 'pl-item-line', t('深くもぐるほど光が変わります。ことばで夕暮れ、字の中で夜。左の赤い糸が道すじです。',
    'The light follows how deep you are: dusk on a word, night inside a character. The red cord on the left is the way back up.')));
  const control = button('pl-switch', '', () => setIto(!ito.on));
  control.id = 'pl-ito-switch';
  control.setAttribute('role', 'switch');
  control.setAttribute('aria-checked', String(ito.on));
  control.setAttribute('aria-labelledby', 'pl-ito-name');
  control.append(h('span', 'pl-switch-dot'));
  row.append(text, control);
  return row;
}

function build() {
  root = h('div');
  root.id = ROOT_ID;
  rail = h('div', 'pl-rail');
  if (typeof rail.showPopover === 'function') rail.setAttribute('popover', 'manual');
  intro = h('div', 'pl-intro');
  intro.setAttribute('role', 'status');
  intro.hidden = read(INTRO_KEY) === '1';
  const introText = h('p', 'pl-intro-text');
  const introOk = button('pl-intro-ok', '', dismissIntro);
  intro.append(introText, introOk);
  opener = button('pl-open', '試', () => openSheet());
  opener.id = 'prototype-open';
  rail.append(intro, opener);

  sheet = h('dialog', 'pl-sheet');
  sheet.id = 'prototype-sheet';
  sheet.setAttribute('aria-labelledby', 'pl-title');
  const heading = h('header', 'pl-heading');
  const title = h('h2', '', '');
  title.id = 'pl-title';
  heading.append(title, button('pl-close', '', closeSheet));
  tabs = h('nav', 'pl-nav');
  body = h('div', 'pl-body');
  sheet.append(heading, tabs, body);
  sheet.addEventListener('close', onSheetClosed);

  pointer = h('div', 'pl-point');
  pointer.tabIndex = -1;
  if (typeof pointer.showPopover === 'function') pointer.setAttribute('popover', 'manual');
  pointer.append(h('p', 'pl-point-hint', ''));
  pointer.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    const { clientX, clientY } = event;
    try { if (pointer.matches(':popover-open')) pointer.hidePopover(); } catch { /* closed */ }
    delete pointer.dataset.open;
    stopPointing(elementAt(clientX, clientY));
  });
  pointer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); stopPointing(null); }
    // with the keyboard: Enter marks the control that held the focus when the sheet was opened
    if (event.key === 'Enter' && context?.focus?.isConnected) { event.preventDefault(); stopPointing(describe(context.focus)); }
  });

  root.append(rail, sheet, pointer);
  document.body.append(root);
  paintWords();
}
/** the words that follow the interface language outside the sheet */
function paintWords() {
  intro.querySelector('.pl-intro-text').textContent = t(
    'これは試作版です。新しいものには「新」の印があります。このボタンで一覧を見て、気になるところを書けます。',
    'This is the prototype. New things carry the mark “new”. This button lists them and takes your notes.');
  intro.querySelector('.pl-intro-ok').textContent = t('わかった', 'OK');
  opener.setAttribute('aria-label', t('試作版：新しいものの一覧と、気になるところのメモ', 'Prototype: what is new, and your notes'));
  opener.title = t('試作版', 'Prototype');
}

export function installPrototypeLayer(options) {
  if (typeof document === 'undefined' || document.getElementById(ROOT_ID)) return;
  host = { state: options.state, tx: options.tx, served: options.served };
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.id = 'prototype-layer-styles';
  link.href = new URL('./prototype-layer.css', import.meta.url).href;
  document.head.append(link);
  document.documentElement.dataset.prototype = 'everything-on';
  build();
  let spoken = lang();
  new MutationObserver((records) => {
    if (lang() !== spoken) { spoken = lang(); paintWords(); if (sheet.open) render(); }
    schedule();
    syncIto(false, records);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'inert', 'data-view', 'data-lang'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('resize', () => syncIto(true));
  startPolling();
  keepReachable();
  if (read(ITO_KEY) === '1') setIto(true);
  arrive();
}
