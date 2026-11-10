/**
 * EVERYTHING-ON PROTOTYPE (integrate/everything-on-20261110): the prototype layer inside the app.
 *
 * John, 2026-11-10: the prototype is the app itself, with the new builds marked and a place to say what is off.
 * This module is that layer and nothing else:
 *   - one line on the first open, dismissed once;
 *   - a prototype button on every screen (it follows the app into an open dialog, as the report entry does);
 *   - a sheet with two tabs: "New in this build" (each new thing, one line, Go) and "Tell me what's off"
 *     (a note with the screen, its heading, the build, the viewport, and optionally one pointed-at element);
 *   - the language of the 新 / new mark, which prototype-layer.css draws on the new doors and screens.
 * It reads the app's state and never writes the learner record. Its own two keys in localStorage hold "the line was
 * dismissed" and an unsent note. Notes go to the same-origin /__feedback of the Mac prototype's server; where that
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
  const pick = (scope) => scope && [...scope.querySelectorAll('h1, h2, .headword, [role="heading"]')].find((n) => !root.contains(n) && seen(n));
  const found = pick(dialog) || pick(document.querySelector('#sheet')) || pick(document.querySelector('#app')) || pick(document.body);
  return found ? found.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
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
  if (active === 'notes') startPolling();
}
function closeSheet() { if (sheet.open) sheet.close(); }
function onSheetClosed() {
  stopPolling();
  schedule();
  if (!pointing) opener.focus({ preventScroll: true });
}
function setTab(name) {
  active = name;
  render();
  if (name === 'notes') startPolling(); else stopPolling();
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
  body.append(h('p', 'pl-note', t('今日つくられた、またはつながったものです。アプリの中では「新」の印がついています。',
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
function startPolling() {
  stopPolling();
  loadNotes();
  pollTimer = setInterval(loadNotes, POLL_MS);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
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
  new MutationObserver(() => {
    if (lang() !== spoken) { spoken = lang(); paintWords(); if (sheet.open) render(); }
    schedule();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'inert', 'data-view', 'data-lang'] });
  window.addEventListener('resize', schedule);
  keepReachable();
  arrive();
}
