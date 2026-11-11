/** G3 word-entry seam — declarations moved verbatim from ../corridor.js (pure move, no body edits). */
import { $, savedInParts, savedPlace, AI_DEVICE_STORE, AI_KEY_STORE, D, DEPTH_OWNED_S, DEPTH_RECALLED_S, DEPTH_RECALL_R, GESTURE, NODE_KIND, NOTE_TEXT, REPORT_RELAY_STORE, S, SAVE_PRESS_MS, SLIP_NODE, SLIP_OWN_MEANING, TODAY_SKY_MISS_DAYS, VOICE_LOCK, activateWordLadder, anchorBox, bi, biLabel, capturePending, closeSealStrip, commitCapture, commitStorePatch, deeperDepth, depthRank, depthRetrievability, dictionaryRowBySeq, diveFromSlip, el, encounterKey, ensureArchiveIndex, ensureArticle, entryKanaIndex, explicitWordSnapshot, finiteNumber, fitChromeKeep, glyphBox, go, heldWordCardNode, hideReaderToast, holdPageUnderDrawer, kanaReadingKey, kataToHira, metReadable, motionEase, motionMs, nonEmptyString, notYetReleased, noteEncounter, openPlainSaveMenu, openSealStrip, openVocabularyListPopover, openWordWeb, owns, pageCutAllowed, paintMiniPath, passage, placeFloating, plainRecord, recordWritable, relayServiceUrl, removeMini, render, revalidateTutorRequests, revealFloatingFocus, rubyNode, sameItem, sameWordIdentity, saveWord, savedAnswerFor, sealListRecency, setOwnRecordValue, shallowerDepth, sheetActionLine, sheetActionLineKeys, showMini, srsKey, suppressAssessmentCards, tx, validInstant, wordCardIdentity, wordNodeIdentity, wordStudied } from '../corridor.js';
import { encounterIdentity, readerQuickRecord } from './capture.mjs';
import { listsByRecency } from './save-places.mjs';
import { dictionaryAnsweredForm, inlineWordReading, lookup, partGloss, readyTokenReading, senseNameHeldText, senseRecord, teFormRecord } from './dictionary.mjs';
import { dayKey, depthIdentityMatch, depthIndex, notYetMarks, todaySkyWhy } from './drift.mjs';
import { readRecordDrafts } from './learner.mjs';
import { learnerSourceLabel, learningItemNode, markCardMore } from './study-host.mjs';
import { canonicalAiBaseUrl } from './teacher.mjs';
import { voiceForRole } from './voice.mjs';
import { kanjiSlipReading, mainParts, wwRecentre, wwSlipNode } from './worlds.mjs';

function keptWordProjection(record) {
  const words = new Map();
  const remember = row => {
    if (row?.t === 'word' && nonEmptyString(row.id) && !words.has(row.id)) words.set(row.id, row);
  };
  for (const row of record.taken || []) remember(row);
  for (const list of Object.values(record.lists || {})) for (const row of list || []) remember(row);
  // Hfix-2b · X-1 — the not-yet marks are gathered once for the whole shelf, not once per word
  const notYet = new Set(notYetMarks(record).map((mark) => mark.id));
  const now = Date.now();
  return [...words.values()].map(row => {
    const identity = wordCardIdentity(record, row.id);
    const answer = savedAnswerFor({ t: 'word', id: row.id }, record);
    const key = JSON.stringify([row.id, identity.kind, identity.seq || null,
      identity.reading ?? null, identity.gloss ?? null]);
    return { key, id: row.id, label: row.label || row.id, identity,
      reading: identity.reading || answer?.reading || '', status: answer?.status || 'unavailable', answer,
      // why this word's star stands in the 宙 sky; '' when the record holds no reason
      why: keptStarWhy(record, row.id, now, notYet) };
  }).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

function noteText(kind) {
  return tx(...NOTE_TEXT[kind]);
}

function note(kind) {
  // a kind the house no longer says (the retired "ai" provenance line) draws nothing
  if (!NOTE_TEXT[kind]) return document.createDocumentFragment();
  const line = el('p', 'note', noteText(kind));
  line.dataset.kind = kind;
  return line;
}

function saveReaderPosition(articleId, position) {
  if (!articleId) return Promise.resolve(false);
  return commitStorePatch((latest) => ({ readerPos: { ...latest.readerPos, [articleId]: Math.max(0, position) } }));
}

function sheetDoorKey(target, sheet = $('.sheet')) {
  if (!target || !sheet?.contains(target)) return null;
  if (target.id) return { id: target.id };
  const signature = (item) => `${item.tagName}|${item.className}|${item.textContent}`;
  const value = signature(target);
  const matches = [...sheet.querySelectorAll('button, a, input, summary')].filter((item) => signature(item) === value);
  return { value, index: matches.indexOf(target) };
}

function findSheetDoor(sheet, key) {
  if (!key) return null;
  if (key.id) return sheet.querySelector(`#${CSS.escape(key.id)}`);
  return [...sheet.querySelectorAll('button, a, input, summary')].filter(
    (item) => `${item.tagName}|${item.className}|${item.textContent}` === key.value,
  )[key.index];
}

function rememberSheet(invoker = document.activeElement) {
  const parent = S.stack.at(-1);
  const sheet = $('.sheet');
  if (!parent || !sheet) return;
  parent.sheetScroll = sheet.scrollTop;
  parent.returnFocus = sheetDoorKey(invoker, sheet);
}

function wordRow(pairs, opts) {
  const row = el('span', 'tok-word');
  row.append(rubyNode(pairs, opts));
  return row;
}

function listeningField(form, id, label, value = '', multiline = false) {
  const wrap = el('div'), caption = el('label', '', label); caption.htmlFor = id;
  const input = el(multiline ? 'textarea' : 'input', 'chat-field'); input.id = id;
  if (!multiline) { input.type = 'text'; input.autocomplete = 'off'; }
  else { input.rows = 5; input.lang = 'ja'; }
  input.value = value; wrap.append(caption, input); form.append(wrap); return input;
}

function standingSlip() {
  return document.getElementById('mini');
}

function blankSlip(card) {
  card.replaceChildren();
  for (const { name } of [...card.attributes]) if (name !== 'id') card.removeAttribute(name);
  SLIP_NODE.delete(card);
  SLIP_OWN_MEANING.delete(card);
  return card;
}

function slipHeadword() {
  return standingSlip()?.querySelector('.mini-word') || null;
}

function paintWordSave(button, on) {
  // S · the one Save says its two words and nothing more (John, 2026-10-16: ":goes into review is excessive and 無駄");
  // a bar's Save names its word (the reader's keep: Save 総理 · Saved 総理 ✓)
  const word = button.dataset.saveWord || '';
  const all = button.dataset.saveAll || '';
  // Q · the reader's bar holds its Save on ONE line in the bar's own type, the verb and then the word it keeps (Save 総理).
  // It never cuts and never wraps (Grok's walk: SAVE / a word, 保存 / 語をタ…): fitChromeKeep sheds the word, then the
  // ✓, until the line fits the room the bar's doors leave; its accessible name always says the whole of it
  if (button.dataset.saveBar != null) {
    // one word on one line: set as plain text, never with the word rule's breaks (Chromium honours a <wbr> in a no-break label)
    const name = el('span', `save-bar-word${word ? '' : ' is-rest'}`);
    name.textContent = word || tx('語をタップ', 'a word');
    button.replaceChildren(el('span', 'save-bar-verb', on ? tx('保存済み ✓', 'Saved ✓') : tx('保存', 'Save')),
      document.createTextNode(' '), name);
    button.classList.remove('is-verb-only', 'is-short');
    button.classList.toggle('taken', on);
    button.setAttribute('aria-pressed', String(on));
    button.title = '';
    if (button.isConnected) fitChromeKeep(button);
    return;
  }
  // SAVE · a saved item's Save names the place it is in (John, 2026-11-11: "still don't know where it went?"): "Saved in
  // Review ✓", "Saved in 旅 ✓"; the place's name may be long, so it is its own span and the line ends it with an ellipsis
  const placed = on && typeof button.savePlaced === 'function' ? button.savePlaced() : null;
  if (placed && !all) {
    const [before, name, after] = savedInParts(placed);
    // one line, one flex item: the key's gap never falls between its words
    const said = el('span', 'save-place-said');
    said.append(before, el('span', 'save-place-label', name), after);
    button.replaceChildren(said);
    button.title = `${before}${name}${after}`;
    button.classList.toggle('taken', on);
    button.setAttribute('aria-pressed', String(on));
    return;
  }
  button.textContent = all
    ? tx(`${all} 語をぜんぶ保存`, `Save all ${all}`)
    // the reader's keep before a word is touched: what it does, in words (never an unlabelled glyph)
    : button.dataset.saveRest != null && !word ? tx('語を保存', 'Save a word')
    : word
      ? (on ? tx(`「${word}」保存済み ✓`, `Saved ${word} ✓`) : tx(`「${word}」を保存`, `Save ${word}`))
      : (on ? tx('保存済み ✓', 'Saved ✓') : tx('保存', 'Save'));
  button.classList.toggle('taken', on);
  button.setAttribute('aria-pressed', String(on));
  button.title = '';
}

function saveOne({ id = '', cls = '', label = '', saved, keep, review = null, node = null, more = () => [], place = null,
  held = false, word = '', all = 0, data = {}, home = null, remove = undefined, show = null } = {}) {
  const button = el('button', `save-one btn-primary${cls ? ` ${cls}` : ''}`);
  button.type = 'button';
  if (id) button.id = id;
  button.dataset.saveOne = '';
  button.dataset.saveMenu = 'true';
  if (word) button.dataset.saveWord = word;
  // a batch (a lesson's or a test's words, all at once) keeps them in one press; its rows hold each word's own menu
  if (all) button.dataset.saveAll = String(all);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  // a surface's own hooks (data-enroll, data-airead-take, data-feed-save, data-save-bar) ride the dataset
  Object.assign(button.dataset, data);
  // SAVE · where the item is, once it is saved: a word-like item's place in the record (Review, or the list it is on), a
  // plain item's home (the tutor page). The Save names it; Show, Move… and Remove act on it (paintPlaceLine)
  // a bar's Save names whatever word is under the finger now: its node is asked for at the press (a function)
  const nodeNow = () => (typeof node === 'function' ? node() : node);
  Object.defineProperty(button, 'saveOneNode', { configurable: true, get: nodeNow });
  button.saveOneLabel = label;
  button.savePlaced = () => { const now = nodeNow(); return now ? savedPlace(now) : home ? { kind: 'home', names: home } : null; };
  paintWordSave(button, !!saved());
  if (held) {
    button.disabled = true;
    button.classList.add('reader-capture-held');
  }
  let pressedAt = -Infinity;
  const openMenu = () => {
    const now = nodeNow();
    if (now) return openVocabularyListPopover(now, label, button, { menu: true, review: review || { saved, toggle: keep }, keep, remove, more: more(), place });
    // a bar's Save with no word it can keep says why, as it always did (its keep's own toast)
    if (typeof node === 'function' && !home) return keep();
    return openPlainSaveMenu(button, { more: more(), place, home, keep, saved, label, show, remove });
  };
  button.saveOneOpen = openMenu;
  button.saveOneRemove = node ? (remove === undefined ? null : remove) : remove || null;
  button.saveOnePaint = () => paintWordSave(button, !!saved());
  // SAVE · ask first, save second (the program lead's ruling, 2026-11-11, on John's "it happens too fast ... where it
  // goes should be a conscious choice"): a press opens the chooser and keeps nothing; the item is kept only when he picks
  // a place in it (openSaveChooser, openPlainSaveMenu). On a saved item a press opens the same chooser to move it
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (button.disabled || button.getAttribute('aria-busy') === 'true' || Date.now() - pressedAt < SAVE_PRESS_MS) return undefined;
    pressedAt = Date.now();
    return openMenu();
  });
  return button;
}

function reopenSaveMenu(match) {
  try {
    const fresh = [...document.querySelectorAll('#app button.save-one')].find(match);
    fresh?.saveOneOpen?.();
  } catch { /* nothing to reopen: the press already did its keep */ }
}

function saveDrawerScroller(kind) {
  return kind === 'sheet' ? document.getElementById('sheet') : document.scrollingElement || document.documentElement;
}

function setSaveDrawerPush(kind, px) {
  const root = document.documentElement;
  const scroller = saveDrawerScroller(kind);
  const top = scroller ? scroller.scrollTop : 0;
  if (px == null) {
    delete root.dataset.saveDrawer;
    root.style.removeProperty('--save-drawer-push');
  } else {
    root.dataset.saveDrawer = kind;
    root.style.setProperty('--save-drawer-push', `${Math.ceil(px)}px`);
  }
  if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
}

function keepMenuInCard(pop) {
  const card = pop.closest?.('#mini');
  if (!card || !(card.scrollHeight > card.clientHeight + 1) || typeof pop.getBoundingClientRect !== 'function') return;
  const box = pop.getBoundingClientRect(), view = card.getBoundingClientRect();
  const top = view.top + card.clientTop, foot = top + card.clientHeight;
  const lift = Math.min(box.bottom - foot, box.top - top);
  if (lift > 0) card.scrollTop += Math.ceil(lift);
}

function placeSaveMenu(pop, invoker, place = null) {
  // single selectors only: the corridor's own fake DOM (test-word-saved-answer) reads one selector at a time
  const where = place || (invoker?.closest?.('#mini') || invoker?.closest?.('[data-save-row]') ? 'inline' : 'popover');
  if (where === 'inline') {
    pop.classList.add('is-inline');
    (invoker.closest('.mini-actions') || invoker.closest('[data-save-row]') || invoker).after(pop);
    keepMenuInCard(pop);
  } else if (where === 'drawer') {
    pop.classList.add('is-inline', 'is-drawer');
    const bar = invoker?.closest?.('[data-bar]');
    const bottom = bar ? bar.getBoundingClientRect().bottom : 0;
    pop.style.setProperty('--drawer-top', `${Math.max(0, Math.round(bottom))}px`);
    document.body.append(pop);
    if (bar) holdPageUnderDrawer(pop, bar.dataset.bar);
  } else {
    document.body.append(pop);
    const anchor = invoker?.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    if (anchor) {
      const below = anchor.bottom + 6;
      const top = below + box.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - box.height - 6);
      pop.style.left = `${Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.left))}px`;
      pop.style.top = `${top}px`;
      // a phone lays the list popover out as a sheet at the foot; Save ▾'s menu keeps this place (CSS)
      pop.style.setProperty('--pop-left', pop.style.left);
      pop.style.setProperty('--pop-top', pop.style.top);
    }
  }
  // one selector at a time, as above: the first enabled box, else the first enabled button, else the menu
  (pop.querySelector('input[type="checkbox"]:not(:disabled)') || [...pop.querySelectorAll('button')].find((button) => !button.disabled) || pop)
    .focus({ preventScroll: true });
}

function wordSaveFacts(token, { reader = false, from = null, record } = {}) {
  // a caller that already chose the entry (the shared lookup door) hands it over as is
  // N2 · a te-form auxiliary's card leads with its senses for the te-form, however its entry is looked up (teFormRecord)
  const g = record !== undefined ? record : reader ? readerQuickRecord(token)
    : senseRecord(teFormRecord(lookup(token.b, token.seq, token.r), token.te), token.sense);
  // R3 · a name in this text, or a reading the text quotes, is held: it is not a word to review (V-07)
  const special = g?.senseName ? (g.senseKind || (token?.sense?.reading ? 'reading' : 'name')) : null;
  const held = !!special || (reader && !D.dict[token.b]) || !g?.m?.some(meaning => typeof meaning === 'string' && meaning.trim());
  const node = { t: 'word', id: token.b, ...(token.seq ? { seq: token.seq, reading: token.r || g?.r } : {}),
    ...(from ? { from, ctxScope: 'sent' } : {}) };
  // R · a reading of its own the core does not carry, with no entry named yet, rides the node, so its Save waits
  // (wordCaptureState) instead of saving the core's word for a reading the core does not have
  const own = !token.b || token.b === token.s ? String(token.r || '') : '';
  if (!token.seq && D.dict[token.b] && own && kataToHira(own) !== kataToHira(String(D.dict[token.b].r || ''))) node.reading = own;
  const state = held ? null : wordCaptureState(node);
  return { g, held, node, state, identityHeld: state === 'conflict' || state === 'unavailable', heldReason: special ? senseNameHeldText(special) : null };
}

function slipAllowed(anchor) {
  const top = document.getElementById('stroke-page') || document.getElementById('sheet');
  return !top || !!top.contains?.(anchor);
}

function miniKanjiWeb(word, anchor, wordReading = '', sourceFrom = null) {
  const chars = [...new Set([...String(word || '')].filter((c) => D.kanji?.[c]))].slice(0, 3);
  if (!chars.length) return null;
  const box = el('div', 'mini-web');
  box.dataset.japaneseLookup = 'off';
  // a kanji row (or a card word) opens its page from its own glyph; the slip leaves inside the cut (enterWord)
  const open = (node) => (event) => {
    event.stopPropagation();
    const row = event.currentTarget;
    go(node, { invoker: anchor, from: row?.querySelector?.('.mini-kanji-glyph') || row || null });
  };
  // the band's head names it, so its tiles read as the word's kanji, not as more words; the door into the
  // word's web stands at the head's end, the way a list's "See all" does
  const top = el('div', 'mini-band-head');
  top.append(el('p', 'mini-band-label', tx('漢字', 'Kanji')));
  box.append(top);
  const list = el('div', 'mini-kanji');
  for (const c of chars) {
    const k = D.kanji[c];
    const row = el('button', 'mini-kanji-row');
    row.type = 'button';
    row.dataset.kanji = c;
    const glyph = el('span', 'mini-kanji-glyph', c);
    glyph.lang = 'ja'; glyph.dataset.uiContent = 'learning';
    row.append(glyph);
    const what = el('span', 'mini-kanji-what');
    if (bi() && k.m) what.append(el('span', 'mini-kanji-meaning', k.m));
    // Ladder · D7 · its readings (on, then kun), for the compact card's one line per kanji (glyph, keyword, readings); the
    // full card shows its parts there instead. A kanji that is the whole word reads only as the word reads here: its card's
    // answer is that reading, never another of the kanji's (年 read ねん shows ネン, never とし: record-depth R.reader)
    const own = [...String(word || '')].length === 1 && String(wordReading || '').trim();
    const readings = own ? [own]
      : [...(k.on || []).slice(0, 2), ...(k.kun || []).slice(0, 1).map((kun) => String(kun).replace('.', ''))].filter(Boolean);
    if (readings.length) {
      const line = el('span', 'mini-kanji-readings', readings.join(' · '));
      line.lang = 'ja'; line.dataset.uiContent = 'learning';
      what.append(line);
    }
    const parts = mainParts(c).filter((part) => part !== c);
    if (parts.length) {
      const set = el('span', 'mini-kanji-parts');
      parts.forEach((part, i) => {
        if (i) { const plus = el('span', 'mini-kanji-plus', '+'); plus.setAttribute('aria-hidden', 'true'); set.append(plus); }
        const piece = el('span', 'mini-kanji-part', part);
        piece.lang = 'ja'; piece.dataset.uiContent = 'learning';
        set.append(piece);
        // the part's name follows the page's language (review round 2 #7): in English its meaning, from
        // the kanji data; in 日本語 its reading, from the radical names. A part with neither shows none.
        if (bi()) {
          const meaning = partGloss(c, part);
          if (meaning) set.append(el('span', 'mini-kanji-part-name mini-kanji-part-meaning', meaning));
        } else {
          const name = D.radicals?.[part]?.name;
          if (name) { const n = el('span', 'mini-kanji-part-name', name); n.lang = 'ja'; n.dataset.uiContent = 'learning'; set.append(n); }
        }
      });
      what.append(set);
    }
    row.append(what);
    row.addEventListener('click', open({ t: 'kanji', id: c, ...(sourceFrom ? { from: sourceFrom } : {}) }));
    list.append(row);
  }
  box.append(list);
  // also in your cards: saved words that share a kanji with this one
  const kin = [];
  for (const t of S.taken) {
    if (t.t !== 'word' || t.id === word || kin.includes(t.id)) continue;
    if (chars.some((c) => String(t.id).includes(c))) kin.push(t.id);
    if (kin.length >= 4) break;
  }
  if (kin.length) {
    const cards = el('p', 'mini-cards');
    cards.append(el('span', 'mini-cards-label', tx('あなたのカードにも', 'Also in your cards')));
    for (const w of kin) {
      const b = el('button', 'mini-card-word', w);
      b.type = 'button'; b.lang = 'ja'; b.dataset.uiContent = 'learning';
      b.addEventListener('click', open({ t: 'word', id: w }));
      cards.append(b);
    }
    box.append(cards);
  }
  // the web: the Words room's word web when it is there, otherwise the first kanji's own entry (its
  // parts and family). The door says what it shows, in plain words (John T5: "Open the web?? what does
  // that even mean."): the words related to this one through its kanji.
  const web = el('button', 'mini-web-open');
  web.type = 'button';
  web.append(el('span', 'mini-web-label', tx('関連語', 'Related words')));
  const chevron = el('span', 'mini-entry-chevron', '›');
  chevron.setAttribute('aria-hidden', 'true');
  web.append(chevron);
  web.addEventListener('click', (event) => {
    event.stopPropagation();
    if (typeof window.openWordWeb === 'function') { removeMini(); window.openWordWeb(word); return; }
    open({ t: 'kanji', id: chars[0], ...(sourceFrom ? { from: sourceFrom } : {}) })(event);
  });
  top.append(web);
  return box;
}

function keepFloatingBeside(card, anchor, { follow = false } = {}) {
  // Hfix-1A (19) · a slip drawn again in place keeps its wiring (below): it is only seated again from what it now says
  if (card._kept?.anchor === anchor) { card._kept.again(); return; }
  let watch = null, watched = [], last = 0, lastContent = 0;
  card._kept = { anchor, again: () => {
    placeFloating(card, anchorBox(anchor));
    if (watch) { for (const band of watched) watch.unobserve(band); watched = [...card.children]; for (const band of watched) watch.observe(band); }
    last = card.getBoundingClientRect().height;
    lastContent = card.scrollHeight;
  } };
  placeFloating(card, anchorBox(anchor));
  card.addEventListener('scroll', () => markCardMore(card), { passive: true });
  card.addEventListener('focusin', () => {
    requestAnimationFrame(() => { if (card.isConnected) revealFloatingFocus(card); });
  });
  // a word that moves (the sky's words glide as a family blooms and the camera settles) keeps its slip beside it
  if (follow) {
    let was = anchor.getBoundingClientRect();
    const tick = setInterval(() => {
      if (!card.isConnected || !anchor.isConnected) { clearInterval(tick); return; }
      const now = anchor.getBoundingClientRect();
      if (Math.abs(now.left - was.left) < 1 && Math.abs(now.top - was.top) < 1) return;
      was = now;
      placeFloating(card, anchorBox(anchor));
    }, 120);
  }
  if (typeof ResizeObserver !== 'function') return;
  // Hfix-1A · a card cut to its room keeps its box when what is inside it grows (the sense arriving after "…"), so its
  // content's own height is watched too: the cut is chosen again on the rows as they now stand
  last = card.getBoundingClientRect().height;
  lastContent = card.scrollHeight;
  let grow = null, frame = 0;
  const seat = () => {
    if (!card.isConnected || !anchor.isConnected) { watch?.disconnect(); grow?.disconnect(); return; }
    if (Math.abs(card.getBoundingClientRect().height - last) < 1 && Math.abs(card.scrollHeight - lastContent) < 1) return;
    placeFloating(card, anchorBox(anchor));
    last = card.getBoundingClientRect().height;
    lastContent = card.scrollHeight;
  };
  // L · seating the card resizes the very element the ResizeObserver watches (maxHeight), and a size changed inside
  // its own callback is left undelivered in that frame (WebKit raises it as a page error: Save ▾'s menu unfolding grew
  // #mini 476 → 399 inside one callback). So the ResizeObserver never writes: a change of the card's own content (the
  // menu unfolding or folding, a reason line, Save's note) is seated by a MutationObserver before the frame paints, and
  // a size that changes with no content change (a late font) is seated in the next frame
  if (typeof MutationObserver === 'function') {
    grow = new MutationObserver(seat);
    grow.observe(card, { childList: true, subtree: true, characterData: true });
  }
  watch = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; seat(); });
  });
  watch.observe(card);
  watched = [...card.children];
  for (const band of watched) watch.observe(band);
}

function slipScroller(anchor) {
  if (!anchor?.isConnected || !anchor.matches?.('#reader .tok, .japanese-lookup-word, .sentence-tok')) return null;
  for (let n = anchor.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (n.id === 'mini') return null;
    const style = getComputedStyle(n);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    if (style.position === 'fixed') return null;
  }
  return 'window';
}

function travelSlip(card) {
  const seat = card._seat, anchor = card._kept?.anchor;
  if (!seat || !card.isConnected || !anchor?.isConnected) return;
  const now = anchor.getBoundingClientRect();
  const top = seat.top + (now.top - seat.anchor.top), left = seat.left + (now.left - seat.anchor.left);
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.dataset.floatingTop = String(top);
  const box = card.getBoundingClientRect();
  const cutTop = Math.max(0, seat.frame.top - box.top), cutBottom = Math.max(0, box.bottom - seat.frame.bottom);
  card.style.clipPath = cutTop || cutBottom ? `inset(${cutTop}px 0 ${cutBottom}px 0)` : '';
}

function noteSealListUse(name) {
  const at = sealListRecency.indexOf(name);
  if (at >= 0) sealListRecency.splice(at, 1);
  sealListRecency.unshift(name);
}

function keptState(node) {
  if (node.t === 'word') return wordCaptureState(node);
  return S.taken.some((row) => row.t === node.t && row.id === node.id) ? 'taken' : 'take';
}

function listsWithout(latest, node) {
  const same = sameItem(node), lists = { ...latest.lists }, memberships = [];
  for (const name of Object.keys(latest.lists || {})) {
    const rows = latest.lists[name];
    if (!Array.isArray(rows) || !rows.some(same)) continue;
    rows.forEach((row, index) => { if (same(row)) memberships.push({ name, index, row }); });
    setOwnRecordValue(lists, name, rows.filter((row) => !same(row)));
  }
  return { lists, memberships };
}

async function unsaveEverywhere(node) {
  const key = srsKey(node.t, node.id);
  if (capturePending.has(key) || !recordWritable()) return null;
  capturePending.add(key);
  try {
    const same = sameItem(node);
    // D23: the removal names the card this control stood for when it was painted; another entry's card is never touched
    const expected = node.t === 'word' ? wordNodeIdentity(node, S) : null;
    const holds = (record) => {
      if (expected && !sameWordIdentity(expected, wordCardIdentity(record, node.id))) {
        throw Object.assign(new Error('word-identity-conflict'), { code: 'word-identity-conflict' });
      }
    };
    if (S.assessmentLearning && ['word', 'kanji', 'grammar', 'particle', 'sentence', 'question'].includes(node.t)) {
      const rows = S.taken.map((row, index) => ({ row, index })).filter(({ row }) => same(row));
      if (!await suppressAssessmentCards({ kind: 'remove', key }, expected ? holds : null)) return null;
      let memberships = [];
      const listed = await commitStorePatch((latest) => {
        const out = listsWithout(latest, node);
        memberships = out.memberships;
        return memberships.length ? { lists: out.lists } : {};
      });
      return listed ? { assessment: true, rows, memberships } : null;
    }
    let took = null;
    const ok = await commitStorePatch((latest) => {
      holds(latest);
      const rows = latest.taken.map((row, index) => ({ row, index })).filter(({ row }) => same(row));
      const out = listsWithout(latest, node);
      took = { assessment: false, rows, memberships: out.memberships };
      return { taken: latest.taken.filter((row) => !same(row)), ...(out.memberships.length ? { lists: out.lists } : {}) };
    });
    return ok ? took : null;
  } catch { return null; }
  finally { capturePending.delete(key); }
}

function sealListOrder() {
  // SAVE · his lists in the order he last put a word on them, from the record (no longer this session's memory alone)
  return listsByRecency(S.lists, S.saveMemory);
}

function holdRing(x, y) {
  const ring = el('span', 'hold-ring');
  ring.setAttribute('aria-hidden', 'true');
  const track = el('span', 'hold-ring-track');
  const right = el('span', 'hold-ring-half is-right');
  const left = el('span', 'hold-ring-half is-left');
  const rightArc = el('span', 'hold-ring-arc');
  const leftArc = el('span', 'hold-ring-arc');
  right.append(rightArc);
  left.append(leftArc);
  ring.append(track, right, left);
  ring.style.left = `${Math.round(x)}px`;
  ring.style.top = `${Math.round(y)}px`;
  document.body.append(ring);
  const runs = [];
  if (pageCutAllowed()) {
    const half = (GESTURE.MENU_MS - GESTURE.RING_MS) / 2;
    const turn = [{ transform: 'rotate(-135deg)' }, { transform: 'rotate(45deg)' }];
    runs.push(rightArc.animate(turn, { duration: half, easing: 'linear', fill: 'both', id: 'kairo-hold-ring' }));
    runs.push(leftArc.animate(turn, { duration: half, delay: half, easing: 'linear', fill: 'both', id: 'kairo-hold-ring-2' }));
  } else ring.classList.add('is-whole');
  let gone = false;
  const leave = (cls, ms) => {
    if (gone) return;
    gone = true;
    ring.classList.add(cls);
    setTimeout(() => ring.remove(), ms);
  };
  return {
    cancel() { for (const run of runs) run.cancel(); leave('is-leaving', 160); },
    settle(kept) {
      for (const run of runs) { try { run.finish(); } catch { /* already done */ } }
      leave(kept ? 'is-kept' : 'is-leaving', 220);
    },
  };
}

function sealTarget() {
  // SAVE · a fresh save's seal lands on Saved today, where he will find the word again
  for (const id of ['saved-today', 'tray', 'tab-review', 'tab-today']) {
    const node = document.getElementById(id);
    const box = node?.getBoundingClientRect();
    if (box?.width && box.height && getComputedStyle(node).visibility !== 'hidden') return node;
  }
  return null;
}

function flySeal(anchor, { countFrom = null } = {}) {
  const word = glyphBox(anchor) || anchor.getBoundingClientRect();
  if (!word?.width || !word.height) return null;
  const size = 26;
  const flight = el('span', 'seal-flight');
  flight.setAttribute('aria-hidden', 'true');
  const rise = el('span', 'seal-rise');
  const stamp = el('span', 'seal-stamp', '印');
  stamp.lang = 'ja';
  rise.append(stamp);
  flight.append(rise);
  // pressed at the word's upper right shoulder, over its last glyph's corner, never over the whole word
  const x = Math.round(word.left + word.width - size * 0.4);
  const y = Math.round(word.top - size * 0.45);
  flight.style.left = `${x}px`;
  flight.style.top = `${y}px`;
  document.body.append(flight);
  const done = () => flight.remove();
  if (!pageCutAllowed()) {
    flight.classList.add('is-still');
    setTimeout(done, 700);
    return null;
  }
  const press = stamp.animate([
    { transform: 'scale(1.6) rotate(-9deg)', opacity: 0 },
    { transform: 'scale(0.94) rotate(-9deg)', opacity: 1, offset: 0.72 },
    { transform: 'scale(1) rotate(-9deg)', opacity: 1 },
  ], { duration: motionMs('--motion-fast', 180), easing: motionEase('--ease-enter'), fill: 'both', id: 'kairo-seal-press' });
  const target = sealTarget();
  const count = target?.querySelector('.tray-count');
  const truth = count?.textContent;
  if (count && countFrom != null) count.textContent = String(countFrom);
  if (!target) {
    press.finished.then(() => stamp.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: motionMs('--motion-quick', 160), delay: motionMs('--motion-long', 400), fill: 'both' }).finished).then(done, done);
    return press;
  }
  const to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (x + size / 2), dy = to.top + to.height / 2 - (y + size / 2);
  const wait = motionMs('--motion-fast', 180) + motionMs('--motion-ma', 120);
  const travel = motionMs('--motion-long', 400);
  const across = flight.animate([{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${dx}px, 0, 0)` }],
    { duration: travel, delay: wait, easing: motionEase('--ease-ink'), fill: 'both', id: 'kairo-seal' });
  rise.animate([{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(0, ${dy}px, 0)` }],
    { duration: travel, delay: wait, easing: motionEase('--ease-enter'), fill: 'both', id: 'kairo-seal-rise' });
  stamp.animate([
    { transform: 'scale(1) rotate(-9deg)', opacity: 1 },
    { transform: 'scale(0.62) rotate(0deg)', opacity: 1, offset: 0.82 },
    { transform: 'scale(0.4) rotate(0deg)', opacity: 0 },
  ], { duration: travel, delay: wait, easing: 'linear', fill: 'forwards', composite: 'replace', id: 'kairo-seal-shrink' });
  across.finished.then(() => {
    if (count?.isConnected && countFrom != null && count.textContent === String(countFrom)) count.textContent = truth;
    if (target.isConnected) {
      target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
        { duration: motionMs('--motion-quick', 160), easing: motionEase('--ease-standard'), id: 'kairo-seal-land' });
    }
  }, () => { if (count?.isConnected && truth != null) count.textContent = truth; }).finally(done);
  return across;
}

function markStripMore(strip) {
  const more = strip.scrollHeight - strip.scrollTop - strip.clientHeight > 1;
  if (strip.dataset.more !== String(more)) strip.dataset.more = String(more);
}

function sealHostedWord(node, label, anchor, { created = false, keyboard = false } = {}) {
  if (!anchor?.isConnected || !closeSealStrip()) return;
  if (!standingSlip()?.contains(anchor)) removeMini();
  hideReaderToast();
  const facts = { g: null, held: false, node, state: keptState(node), identityHeld: false };
  const door = { label, copyText: label, entryAvailable: true, save: () => facts,
    openEntry: (mode) => go(node, { invoker: anchor, instant: mode === 'keyboard' }) };
  const countFrom = S.taken.length - (created ? 1 : 0);
  openSealStrip(anchor, door, facts, { status: created ? 'created' : keptState(node) === 'taken' ? 'already-kept' : 'failed' }, { keyboard });
  if (created) requestAnimationFrame(() => { if (anchor.isConnected) flySeal(anchor, { countFrom }); });
}

function wordClipKey(surface, reading) {
  return surface && reading ? `${surface}|${reading}` : null;
}

function wordClipFor(m, surface, reading, role = 'word', entrySeq = null) {
  const key = wordClipKey(surface, reading);
  if (!m || m.legacy || !key) return null;
  const entry = m.words?.[key];
  if (!entry || typeof entry.src !== 'string') return null;
  const wanted = voiceForRole(role);
  // the role law, enforced at the point of play: the second voice is not a fallback
  if (entry.voice !== wanted) return null;
  // identity is stated, never defaulted: the clip names the very role it is asked for, and the
  // locked model; a clip with no role or no model is not an approved clip
  if (entry.speakerRole !== role || entry.model !== VOICE_LOCK.model) return null;
  // the clip must live in its own voice's folder: a path is a claim and it is checked
  if (!new RegExp(`^audio/w/${entry.voice}/[a-zA-Z0-9_-]+\\.(?:m4a|mp3|wav|ogg)$`, 'u').test(entry.src)) return null;
  if (entrySeq && entry.entrySeq && String(entry.entrySeq) !== String(entrySeq)) return null;
  return entry;
}

function openSlip(node, { anchor, from = 'lookup', host = null, look = null, note = null, sentence = null, focus = false,
  onClose = null, entry, key = null, redo = false, why = '', reveal = null, clearReveal = null, readingVisible = null, onStage = null,
  gloss = null } = {}) {
  if (!anchor?.isConnected) return null;
  if (!redo && diveFromSlip(anchor)) return null;
  const kind = node?.t === 'kanji' ? 'kanji' : node?.t === 'particle' ? 'particle' : node?.t === 'grammar' ? 'grammar' : 'word';
  let token;
  let record = null;
  let save = host ? 'host' : 'default';
  let kanji = true;
  let entryAvailable = entry !== false;
  if (!node) {
    const label = look?.label || look?.surface || '';
    token = { s: look?.surface || label, b: label, r: look?.reading || '', c: false };
    save = 'none';
    entryAvailable = typeof entry === 'function';
  } else if (kind === 'word') {
    // G2 · a kept word's door names its entry: when the dictionary cannot (cold, offline), its card's own answer speaks
    record = lookup(node.id, node.seq ?? null, node.reading || '') || savedNodeRecord(node);
    token = { s: look?.surface || node.id, b: node.id, r: node.reading || record?.r || look?.reading || '', c: !!record,
      ...(node.seq != null && node.seq !== '' ? { seq: node.seq } : {}) };
    // R · a reading of its own the quick dictionary does not carry asks the full dictionary now: its entry sheet
    // resolves it, and the next look at the word stands for the entry read that way
    void readyTokenReading(token);
    if (entry === undefined) entryAvailable = !!record;
  } else if (kind === 'kanji') {
    const k = D.kanji?.[node.id];
    token = { s: node.id, b: node.id, r: look?.reading || kanjiSlipReading(k), c: !!k };
    look = { ...(look || {}), ...(!String(look?.gloss || '').trim() && String(k?.m || '').trim()
      ? { gloss: String(k.m).toLowerCase(), glossLang: 'en' } : {}) };
    kanji = false;
    if (entry === undefined) entryAvailable = !!k;
  } else if (kind === 'particle') {
    token = { s: look?.surface || look?.label || node.id, b: look?.label || node.id, r: look?.reading || '' };
    save = 'none';
    kanji = false;
  } else {
    token = { s: look?.surface || look?.label || node.id, b: look?.label || node.id, r: look?.reading || '' };
    kanji = false;
  }
  const onEntry = (modality) => {
    if (typeof entry === 'function') {
      removeMini();
      entry(modality);
    } else if (node) go(node, { invoker: anchor, from: slipHeadword() || anchor, instant: modality === 'keyboard' }); // the slip leaves inside the cut (enterWord)
  };
  // Ladder · a caller whose word stands in a line of text passes its English rung (`gloss`); the sky, the Words room and
  // the deck pass none and keep reading → stage
  return activateWordLadder(anchor, { surface: token.s, reading: look?.reading || token.r, reveal, clearReveal, readingVisible, redo, from,
    ...(gloss ? { gloss } : {}),
    openStage: () => {
      const stage = showMini(anchor, token, onEntry, { focusEntry: focus, record, entryAvailable, sentence, look, kind, save, host, note,
        source: from, key, kanji, onClose, follow: from === 'drift' || from === 'sky', nodeFor: node && kind !== 'word' ? { t: node.t, id: node.id } : null,
        entryNode: typeof entry === 'function' ? null : node, why });
      if (stage) onStage?.(stage);
      return stage;
    } });
}

function savedRecordNoteDraft(key) {
  const drafts = readRecordDrafts(); const text = drafts[key];
  if (typeof text !== 'string') return null;
  let basis;
  try { basis = JSON.parse(drafts[`${key}:basis`] || 'null'); } catch { /* A saved draft never supplies authority. */ }
  return { text, expected: basis?.expected || null, generation: basis?.generation || null,
    baselineText: typeof basis?.baselineText === 'string' ? basis.baselineText : null };
}

function keptStarWhy(record, id, now = Date.now(), notYet = null) {
  if (!nonEmptyString(id)) return '';
  const skey = srsKey('word', id);
  const since = now - TODAY_SKY_MISS_DAYS * 86400000;
  // 1 · missed lately: the review log's Again, and a practice or test answer wrong
  let miss = null;
  const later = (row, test) => { if (!miss || row[0] > miss.at) miss = { at: row[0], test }; };
  for (const row of record.revlog || []) {
    if (Array.isArray(row) && row[1] === skey && row[2] === 1 && row[0] >= since) later(row, false);
  }
  for (const row of record.obslog || []) {
    if (!Array.isArray(row) || row[0] < since || !['probe', 'dojo', 'lesson', 'mock'].includes(row[1])) continue;
    if (row[3] === 1 && row[2] === skey) later(row, row[1] === 'mock');
  }
  if (miss) return todaySkyWhy('missed', miss);
  // 2 · his own "Not yet", the same read X-9 gives Today's sky
  const marked = notYet || new Set(notYetMarks(record).map((mark) => mark.id));
  if (marked.has(id)) return todaySkyWhy('unknown');
  // 3 · looked up on two or more occasions, ten minutes apart
  const times = [];
  for (const row of record.obslog || []) {
    if (!Array.isArray(row) || row[1] !== 'tap' || row[3] < 2 || row[2] !== skey) continue;
    if (!times.length || row[0] - times[times.length - 1] >= 10 * 60000) times.push(row[0]);
  }
  if (times.length >= 2) return todaySkyWhy('looked', { times: times.length });
  // 4 · due today, by the card's own instant
  const card = plainRecord(record.srs) && owns(record.srs, skey) && plainRecord(record.srs[skey]) ? record.srs[skey] : null;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (card && validInstant(card.due) && Date.parse(card.due) <= end.getTime()) return todaySkyWhy('due');
  return '';
}

function sheetTakeLabel(saved = false) {
  return saved ? tx('保存済み ✓', 'Saved ✓') : tx('保存', 'Save');
}

function listReading(item) {
  if (item.t !== 'word') return '';
  const answer = savedAnswerFor(item);
  return answer?.status === 'available' ? answer.reading : '';
}

function listGloss(item) {
  if (item.t !== 'word') return '';
  const answer = savedAnswerFor(item);
  return answer?.status === 'available' ? answer.meanings[0] : '';
}

function listToMarkdown(name, items) {
  const lines = [`# ${name} — 回廊 KAIRO`, '', `${items.length} 件 · ${dayKey()}`, ''];
  for (const item of items) {
    const r = listReading(item);
    const g = listGloss(item);
    const kind = item.t !== 'word' ? `［${item.kind || NODE_KIND[item.t]?.[0] || item.t}］` : '';
    lines.push(`- ${item.label}${r ? `（${r}）` : ''}${kind}${g ? ` — ${g}` : ''}`);
  }
  return lines.join('\n') + '\n';
}

function openWordWebLadder(item, section, anchor, keyboard = false, redo = false) {
  const node = wwSlipNode(item);
  if (!node) { wwRecentre({ type: item.type, key: item.key }, section, anchor); return; }
  const reading = node.t === 'kanji' ? kanjiSlipReading(D.kanji?.[node.id]) : lookup(node.id)?.r || '';
  const glyph = anchor.querySelector('.ww-g') || anchor.querySelector('span') || anchor;
  openSlip(node, { anchor, from: 'lookup', focus: keyboard, redo,
    reveal: () => inlineWordReading(glyph, reading),
    readingVisible: () => !!reading && !bi() && kataToHira(anchor.querySelector('.ww-cap')?.textContent || '') === kataToHira(reading),
    onStage(stage) {
      const follow = stage.querySelector('.mini-web-open') || el('button', 'mini-web-open');
      if (!follow.isConnected) { follow.type = 'button'; stage.append(follow); }
      // Replace the generic Related words callback with this exact typed node.
      const action = follow.cloneNode(false);
      action.dataset.action = 'word-web.centre';
      action.textContent = tx('この語を中心に', 'Centre the web here');
      action.addEventListener('click', event => { event.stopPropagation(); wwRecentre({ type: item.type, key: item.key }, section, anchor); });
      follow.replaceWith(action);
    },
  });
}

function takenContext(item) {
  const ctx = item.ctx;
  if (!ctx) return null;
  const p = D.passages.find((x) => x.id === ctx.p);
  if (!p) {
    // an archive capture on a fresh boot: pull the stack's index in quietly
    if (!D.archive && !D.archiveLoading && window.__CORRIDOR_STANDALONE__ !== true) {
      ensureArchiveIndex()
        .then(() => {
          if (S.view === 'review') render();
        })
        .catch(() => {});
    }
    return null;
  }
  if (!p.tokens) {
    ensureArticle(p)
      .then(() => {
        if (S.view === 'review') render();
      })
      .catch(() => {});
    return null;
  }
  let start = 0;
  let end = p.tokens.length;
  if (ctx.scope === 'para' && Array.isArray(p.paras) && p.paras.length) {
    for (const ps of p.paras) {
      if (ps <= ctx.i) start = ps;
      else {
        end = ps;
        break;
      }
    }
  } else {
    for (let k = ctx.i - 1; k >= 0; k--) {
      if ('。！？'.includes(p.tokens[k].s)) {
        start = k + 1;
        break;
      }
    }
    for (let k = ctx.i; k < p.tokens.length; k++) {
      if ('。！？'.includes(p.tokens[k].s)) {
        end = k + 1;
        break;
      }
    }
  }
  return { tokens: p.tokens.slice(start, end), source: learnerSourceLabel(p), passage: p.id, start };
}

function wordIdentityRelation(node, card) {
  if (node?.kind !== 'seq' || card?.kind !== 'seq') return 'unestablished';
  if (node.seq !== card.seq) return 'other-entry';
  if (nonEmptyString(node.reading) && nonEmptyString(card.reading) && node.reading !== card.reading) return 'other-reading';
  return 'unestablished';
}

function entryCueReading(node) {
  if (node?.seq == null || node.seq === '' || !nonEmptyString(node.reading)) return node?.reading;
  const row = dictionaryRowBySeq(node.seq);
  if (!Array.isArray(row) || String(row[0]) !== String(node.seq)) return node.reading;
  const kana = entryKanaIndex(row, node.reading);
  return kana >= 0 ? row[5][kana] : node.reading;
}

function wordDepth(node, record = S, now = Date.now()) {
  const identity = encounterIdentity(node);
  if (!identity) return null;
  const key = encounterKey(identity);
  const met = metReadable(record.met) && owns(record.met.entries, key) && plainRecord(record.met.entries[key]) ? record.met.entries[key] : null;
  const index = depthIndex(record);
  const skey = srsKey('word', identity.id);
  const stored = plainRecord(record.srs) && owns(record.srs, skey) && plainRecord(record.srs[skey]) ? record.srs[skey] : null;
  const row = index.takenRows.get(identity.id) || null;
  const listed = index.listed.has(identity.id);
  const held = !!row || listed || !!stored || index.reviewed.has(skey);
  const match = held ? depthIdentityMatch(identity, wordCardIdentity(record, identity.id)) : 'none';
  const days = met ? met.days : 0;
  let depth = days >= 2 ? 'again' : days >= 1 ? 'met' : 'unmet';
  let review = null;
  if (match === 'same' && stored) {
    const state = Number.isInteger(stored.state) ? stored.state : 0;
    const stability = finiteNumber(stored.stability) ? stored.stability : 0;
    const r = depthRetrievability(stored, now);
    review = { state, stability, r };
    const recalling = state === 2 && r !== null && r >= DEPTH_RECALL_R;
    depth = deeperDepth(depth, recalling && stability >= DEPTH_OWNED_S ? 'owned'
      : recalling && stability >= DEPTH_RECALLED_S ? 'recalled' : state >= 1 ? 'again' : 'met');
  } else if (match === 'same' && row) depth = deeperDepth(depth, 'met');
  const said = met && plainRecord(met.said) ? met.said : null;
  if (said?.value === 'known') depth = deeperDepth(depth, 'again');
  let cap = null;
  if (said?.value === 'not-yet' && !(match === 'same' && notYetReleased(record, skey, said.cursor))) {
    if (depthRank(depth) > depthRank('again')) cap = 'not-yet';
    depth = shallowerDepth(depth, 'again');
  }
  if (identity.kind === 'unresolved' || match === 'other') {
    if (depthRank(depth) > depthRank('met')) cap = 'identity';
    depth = shallowerDepth(depth, 'met');
  }
  const keptRow = !!row || listed;
  return { depth, kept: keptRow && (match === 'same' || match === 'compatible'), otherKept: keptRow && match === 'other',
    match, identity, key, days, first: met?.first ?? null, last: met?.last ?? null, said: said?.value || null, review, cap };
}

function noteSlipDepth(mini, token, kind, { arriving = true, from = null } = {}) {
  if (kind !== 'word' || !nonEmptyString(token?.b)) return;
  const node = { t: 'word', id: token.b, ...(token.seq != null && token.seq !== '' ? { seq: String(token.seq) } : {}),
    reading: String(token.r || '') };
  mini.dataset.depthNode = JSON.stringify({ id: node.id, ...(node.seq ? { seq: node.seq } : {}), reading: node.reading });
  if (mini.dataset.demo === 'true') return;
  const identity = encounterIdentity(node);
  if (identity?.kind === 'unresolved' && !dictionaryAnsweredForm(node.id) && D.dictionaryState !== 'error') return;
  if (!arriving && identity?.kind === 'unresolved') return;
  void noteEncounter(node, { article: from?.passage && from.passage === S.passageId ? from.passage : null });
}

function savedNodeRecord(node, record = S) {
  if (node?.t !== 'word' || node.seq == null || node.seq === '') return null;
  const answer = savedAnswerFor({ t: 'word', id: node.id }, record);
  if (answer?.status !== 'available' || String(answer.seq || '') !== String(node.seq)) return null;
  if (nonEmptyString(node.reading) && nonEmptyString(answer.reading) && kanaReadingKey(answer.reading) !== kanaReadingKey(node.reading)) return null;
  const head = nonEmptyString(answer.head) ? answer.head : node.id;
  return { seq: String(node.seq), head, r: answer.reading, m: answer.meanings, k: [...head].filter((c) => /[一-鿌々]/.test(c)), saved: true };
}

function keptItemNode(t, id) {
  return S.taken.some((row) => row.t === t && row.id === id) ? learningItemNode({ t, id }) : { t, id };
}

function wordArchiveRef(node, rec) {
  const id = node.id;
  const reading = kanaReadingKey(nonEmptyString(rec?.r) ? rec.r : node.reading || '') || '';
  if (rec?.seq != null && rec.seq !== '') return `word:${id}${JSON.stringify({ seq: String(rec.seq), r: reading })}`;
  const core = D.dict?.[id];
  if (core && Array.isArray(rec?.m) && rec.m.length && reading === (kanaReadingKey(core.r || '') || '')) return `word:${id}`;
  return `word:${id}${JSON.stringify({ r: reading })}`;
}

function sheetActionVisitHolds(visit) {
  return !!visit && S.stack.length > 0 && !S.strokes && visit.view === S.view && visit.passageId === S.passageId &&
    visit.stack === S.stack && visit.path.length === S.stack.length && visit.path.every((node, index) => node === S.stack[index]);
}

function drawSheetActionLine(note, key) {
  sheetActionLineKeys.set(note, key);
  note.textContent = sheetActionLine(key);
}

async function toggleTaken(node, label) {
  const key = srsKey(node.t, node.id);
  if (capturePending.has(key)) return false;
  capturePending.add(key);
  try {
    const taking = !S.taken.some((entry) => entry.t === node.t && entry.id === node.id);
    if (taking) return await commitCapture(node, label);
    // D23: a word's removal names the card this control stood for when it was painted.
    // The latest record must still hold that card, or nothing is removed or suppressed:
    // a stale door, or another entry's door on the same spelling (the core mini on a
    // 上手#1580400 card).
    const expected = node.t === 'word' ? wordNodeIdentity(node, S) : null;
    const holds = (record) => {
      if (expected && !sameWordIdentity(expected, wordCardIdentity(record, node.id))) {
        throw Object.assign(new Error('word-identity-conflict'), { code: 'word-identity-conflict' });
      }
    };
    if (S.assessmentLearning && ['word', 'kanji', 'grammar', 'particle', 'sentence', 'question'].includes(node.t))
      return await suppressAssessmentCards({ kind: 'remove', key }, expected ? holds : null);
    return await commitStorePatch((latest) => {
      holds(latest);
      return { taken: latest.taken.filter((entry) => entry.t !== node.t || entry.id !== node.id) };
    });
  } finally { capturePending.delete(key); }
}

async function replaceWordCard(node, label) {
  const key = srsKey(node.t, node.id);
  if (capturePending.has(key)) return false;
  capturePending.add(key);
  try { return await commitCapture(node, label, Date.now(), { replace: true }); }
  finally { capturePending.delete(key); }
}

function wordCaptureState(node, record = S) {
  const row = (record.taken || []).some((entry) => entry.t === node.t && entry.id === node.id);
  if (node.t !== 'word') return row ? 'taken' : 'take';
  const explicit = node.seq != null && node.seq !== '';
  // R · a door on a core spelling carrying a reading the core does not, and naming no entry yet, is not the core's
  // word: its answer stays unconfirmed until the entry read that way is known (readingToken), so it saves nothing
  if (!explicit && node.reading && D.dict?.[node.id] &&
    kataToHira(String(node.reading)) !== kataToHira(String(D.dict[node.id].r || ''))) return 'unavailable';
  if (!row && !wordStudied(record, node.id)) return explicit && !explicitWordSnapshot(node, record) ? 'unavailable' : 'take';
  if (!sameWordIdentity(wordNodeIdentity(node, record), wordCardIdentity(record, node.id))) return 'conflict';
  if (row) return 'taken';
  return explicit && !explicitWordSnapshot(node, record) ? 'unavailable' : 'take';
}

function wordCaptureReadingMismatch(node) {
  if (node?.seq == null || node.seq === '' || !nonEmptyString(node.reading)) return null;
  const row = dictionaryRowBySeq(node.seq);
  if (!Array.isArray(row) || String(row[0]) !== String(node.seq) || !Array.isArray(row[5]) || entryKanaIndex(row, node.reading) >= 0) return null;
  return { here: node.reading, dictionary: row[5][0] || row[1] };
}

function wordCaptureHeldText(node, { route = true } = {}) {
  if (wordCaptureState(node) === 'unavailable') {
    // glance pass 2026-10-01: a learner reads why in plain words, never "the entry's answer"
    const mismatch = wordCaptureReadingMismatch(node);
    if (mismatch) {
      return tx(`この語は保存できない。記事の読み「${mismatch.here}」が辞書の読み「${mismatch.dictionary}」と一致しないため。`,
        `Can’t save this word: the article reads it ${mismatch.here}, the dictionary ${mismatch.dictionary}.`);
    }
    return tx('この項目の答えをまだ確かめられないため、覚えられない。', 'This entry’s answer cannot be confirmed yet, so it cannot be memorized.');
  }
  const relation = wordIdentityRelation(wordNodeIdentity(node, S), wordCardIdentity(S, node.id));
  if (wordCaptureBasis(S, node.id) === 'history') {
    if (relation === 'other-entry') {
      return tx(`「${node.id}」には別の項目の以前のカードの記録が残っているため、ここでは覚える・やめるができない。`,
        `${node.id} keeps history from an earlier card for another entry, so it cannot be memorized or stopped here.`);
    }
    if (relation === 'other-reading') {
      return tx(`「${node.id}」には別の読みの以前のカードの記録が残っているため、ここでは覚える・やめるができない。`,
        `${node.id} keeps history from an earlier card for another reading, so it cannot be memorized or stopped here.`);
    }
    return tx(`「${node.id}」には以前のカードの復習の記録が残っているため、ここでは覚える・やめるができない。`,
      `${node.id} keeps review history from an earlier card, so it cannot be memorized or stopped here.`);
  }
  if (relation === 'other-entry') {
    return tx(`「${node.id}」には別の項目のカードがあるため、ここでは覚える・やめるができない。`,
      `${node.id} holds a card for another entry, so it cannot be memorized or stopped here.`);
  }
  if (relation === 'other-reading') {
    return tx(`「${node.id}」には別の読みのカードがあるため、ここでは覚える・やめるができない。`,
      `${node.id} holds a card for another reading, so it cannot be memorized or stopped here.`);
  }
  if (!route) {
    return tx(`「${node.id}」には保存済みのカードがあるため、ここでは覚える・やめるができない。`,
      `A saved card exists for ${node.id}, so it cannot be memorized or stopped here.`);
  }
  return tx(`「${node.id}」には保存済みのカードがある。管理するには、そのカードを開く。`,
    `A saved card exists for ${node.id}. Open that card to manage it.`);
}

function wordCaptureNoteText(relation, basis, id, shown, studied) {
  if (basis === 'history') {
    if (relation === 'other-entry') {
      return tx(`「${id}」には別の項目の以前のカード（${shown}）の復習の記録が残っている。この入り口はその記録を表していない。表記一つにカード一枚なので、そのまま残す。`,
        `${id} keeps review history from an earlier card for another entry (${shown}). This door doesn't stand for it. One spelling holds one card, so it stays as it is.`);
    }
    if (relation === 'other-reading') {
      return tx(`「${id}」には別の読みの以前のカード（${shown}）の復習の記録が残っている。この入り口はその記録を表していない。表記一つにカード一枚なので、そのまま残す。`,
        `${id} keeps review history from an earlier card for another reading (${shown}). This door doesn't stand for it. One spelling holds one card, so it stays as it is.`);
    }
    return tx(`「${id}」には以前のカード（${shown}）の復習の記録が残っている。この入り口はその記録を表していない。表記一つにカード一枚なので、そのまま残す。`,
      `${id} keeps review history from an earlier card (${shown}). This door doesn't stand for it. One spelling holds one card, so it stays as it is.`);
  }
  if (relation === 'other-entry') {
    return studied
      ? tx(`「${id}」には別の項目（${shown}）のカードと復習の記録があります。表記一つにカード一枚なので、そのまま残します。`,
        `${id} already has a card, with review history, for another entry (${shown}). One spelling holds one card, so it stays as it is.`)
      : tx(`「${id}」には、まだ復習していない別の項目（${shown}）のカードがあります。そのままにすると、いまのカードが残ります。`,
        `${id} has a card for another entry (${shown}) that has not been reviewed yet. Leaving it keeps that card.`);
  }
  if (relation === 'other-reading') {
    return studied
      ? tx(`「${id}」には別の読み（${shown}）のカードと復習の記録があります。表記一つにカード一枚なので、そのまま残します。`,
        `${id} already has a card, with review history, for another reading (${shown}). One spelling holds one card, so it stays as it is.`)
      : tx(`「${id}」には、まだ復習していない別の読み（${shown}）のカードがあります。そのままにすると、いまのカードが残ります。`,
        `${id} has a card for another reading (${shown}) that has not been reviewed yet. Leaving it keeps that card.`);
  }
  return studied
    ? tx(`「${id}」には保存済みのカード（${shown}）と復習の記録がある。この入り口はそのカードを表していない。表記一つにカード一枚なので、そのまま残す。`,
      `A saved card exists for ${id} (${shown}), with review history. This door doesn't stand for it. One spelling holds one card, so it stays as it is.`)
    : tx(`「${id}」には、まだ復習していない保存済みのカード（${shown}）がある。この入り口はそのカードを表していない。そのままにすると、いまのカードが残る。`,
      `A saved card exists for ${id} (${shown}) that has not been reviewed yet. This door doesn't stand for it. Leaving it keeps that card.`);
}

function wordCaptureBasis(record, id) {
  return (record.taken || []).some((entry) => entry.t === 'word' && entry.id === id) ? 'card' : 'history';
}

function wordCaptureOpenLabel(basis) {
  return basis === 'history' ? ['その項目を開く', 'open that entry'] : ['そのカードを開く', 'open that card'];
}

function renderWordCaptureNote(container, node, label = node.id) {
  if (node?.t !== 'word') return;
  const state = wordCaptureState(node);
  if (state !== 'conflict' && state !== 'unavailable') return;
  const note = el('div', 'word-capture-note');
  note.id = 'word-capture-note';
  note.setAttribute('role', 'status');
  if (state === 'unavailable') {
    note.append(el('p', null, wordCaptureReadingMismatch(node) ? wordCaptureHeldText(node)
      : tx('この項目の答えをまだ確かめられないため、ここでは覚えられない。',
        'This entry’s answer cannot be confirmed yet, so it cannot be memorized here.')));
    container.append(note);
    return;
  }
  const card = savedAnswerFor({ t: 'word', id: node.id });
  const shown = card?.status === 'available'
    ? `${card.head}〔${card.reading}〕${card.meanings[0] ? ` ${card.meanings[0]}` : ''}`
    : node.id;
  const studied = wordStudied(S, node.id);
  const enrolled = S.taken.some((entry) => entry.t === 'word' && entry.id === node.id);
  const relation = wordIdentityRelation(wordNodeIdentity(node, S), wordCardIdentity(S, node.id));
  const basis = wordCaptureBasis(S, node.id);
  note.append(el('p', null, wordCaptureNoteText(relation, basis, node.id, shown, studied)));
  const actions = el('div', 'teacher-actions');
  if (!studied && enrolled) {
    const replace = biLabel('button', 'chip', 'この項目に置き換える', 'replace it with this entry');
    replace.type = 'button';
    replace.id = 'word-capture-replace';
    replace.disabled = !recordWritable();
    replace.addEventListener('click', async () => {
      if (replace.disabled) return;
      replace.disabled = true;
      const saved = await replaceWordCard(node, label);
      replace.disabled = false;
      if (saved) render();
    });
    actions.append(replace);
  }
  const open = biLabel('button', 'chip', ...wordCaptureOpenLabel(basis));
  open.type = 'button';
  open.id = 'word-capture-open';
  open.addEventListener('click', () => go(heldWordCardNode(S, node.id)));
  actions.append(open);
  note.append(actions);
  container.append(note);
}

function wordPresentationKey(item, answer) {
  return JSON.stringify([srsKey('word', item.id), answer.seq ? 'seq' : answer.source, answer.seq, answer.head,
    answer.reading, answer.meanings.slice(0, 4)]);
}

function saveAiDeviceConfig(baseUrl, model, key) {
  const canonical = canonicalAiBaseUrl(baseUrl);
  if (!canonical || !nonEmptyString(model) || model.length > 200 || typeof key !== 'string' || key.length > 8192 ||
      ['\r', '\n', '\0'].some((character) => key.includes(character))) return false;
  try {
    localStorage.setItem(AI_DEVICE_STORE, JSON.stringify({
      v: 1, baseUrl: canonical, model, configId: crypto.randomUUID(),
      credential: { origin: new URL(canonical).origin, key },
    }));
  } catch {
    return false;
  }
  // The atomic settings write is authoritative even if legacy cleanup fails.
  // A key removal saves an empty credential rather than reviving this fallback.
  try { localStorage.removeItem(AI_KEY_STORE); } catch { /* inert legacy bytes */ }
  revalidateTutorRequests();
  return true;
}

function foldEntryForms(box) {
  const head = box.querySelector(':scope > .is-entry-head .dictionary-homograph');
  const forms = box.querySelector(':scope > .dictionary-entry > .dictionary-forms');
  if (!head || !forms) return;
  const word = head.querySelector('.row-word');
  const spellings = forms.querySelector('.dictionary-spellings')?.textContent || '';
  if (word?.firstChild?.nodeType === 3 && spellings) word.firstChild.textContent = spellings;
  const reading = head.querySelector('.row-reading')?.textContent || '';
  const others = (forms.querySelector('.dictionary-readings')?.textContent || '').split('・').filter((r) => r && kataToHira(r) !== kataToHira(reading));
  if (others.length && word && !word.querySelector('.row-also')) {
    const more = el('span', 'row-also', tx('ほかに ', 'also '));
    const kana = el('span', null, others.join(tx('、', ', ')));
    kana.lang = 'ja';
    more.append(kana);
    word.append(more);
  }
  forms.remove();
}

function saveReportRelay(address, key) {
  try {
    if (address === 'off') { localStorage.removeItem(REPORT_RELAY_STORE); return 'off'; }
    const url = relayServiceUrl(address, key);
    if (url) { localStorage.setItem(REPORT_RELAY_STORE, JSON.stringify({ url })); return 'saved'; }
  } catch { /* An unusable link changes nothing. */ }
  return '';
}

function saveReportRelayLink(text) {
  let params;
  try { params = new URL(String(text).trim()).searchParams; } catch { return ''; }
  return params.has('report-relay') ? saveReportRelay(params.get('report-relay') || '', params.get('report-key') || '') : '';
}

export { keptWordProjection, noteText, note, saveReaderPosition, sheetDoorKey, findSheetDoor, rememberSheet, wordRow, listeningField, standingSlip, blankSlip, slipHeadword, paintWordSave, saveOne, reopenSaveMenu, saveDrawerScroller, setSaveDrawerPush, keepMenuInCard, placeSaveMenu, wordSaveFacts, slipAllowed, miniKanjiWeb, keepFloatingBeside, slipScroller, travelSlip, noteSealListUse, keptState, listsWithout, unsaveEverywhere, sealListOrder, holdRing, sealTarget, flySeal, markStripMore, sealHostedWord, wordClipKey, wordClipFor, openSlip, savedRecordNoteDraft, keptStarWhy, sheetTakeLabel, listReading, listGloss, listToMarkdown, openWordWebLadder, takenContext, wordIdentityRelation, entryCueReading, wordDepth, noteSlipDepth, savedNodeRecord, keptItemNode, wordArchiveRef, sheetActionVisitHolds, drawSheetActionLine, toggleTaken, replaceWordCard, wordCaptureState, wordCaptureReadingMismatch, wordCaptureHeldText, wordCaptureNoteText, wordCaptureBasis, wordCaptureOpenLabel, renderWordCaptureNote, wordPresentationKey, saveAiDeviceConfig, foldEntryForms, saveReportRelay, saveReportRelayLink };
