/** G3 return seam — declarations moved verbatim from ../corridor.js (pure move, no body edits). */
import { D, S, applyAssessmentV2, assessmentClockSession, biLabel, captureScaleVisit, clearReaderReadings, clearReaderSummons, clearWordLadder, currentAssessmentV2, el, finishPageTransition, mockFailed, passage, removeMini, render, retireScaleReturn, returnToScaleBead, scaleIn, scaleNavigationAllowed, scaleOut, scalePassage, scaleThreadPath, scaleTokenFingerprint, stopSentenceListening, tx } from '../corridor.js';
import { lookup, readerTokenAtIndex } from './dictionary.mjs';
import { readerEntryNode } from './library.mjs';
import { stopReadAloud } from './voice.mjs';
import { mainParts } from './worlds.mjs';

function scaleName(node = S.stack.at(-1)) {
  if (node) return ({ radical: 'part', kanji: 'kanji', word: 'word', sent: 'sentence' })[node.t] || null;
  return ({ reader: 'article', shelf: 'shelf', archive: 'shelf', drift: 'sky' })[S.view] || null;
}

function scaleShelfView(article = passage()) {
  return String(article?.file || '').startsWith('archive/') ? 'archive' : 'shelf';
}

function scaleLabel(scale) {
  const names = { part: ['部品', 'part'], kanji: ['漢字', 'kanji'], word: ['語', 'word'],
    sentence: ['文', 'sentence'], article: ['記事', 'article'], shelf: ['本棚', 'shelf'], sky: ['宙', 'sky'] };
  return names[scale] ? tx(...names[scale]) : '';
}

function scaleSource(visit = S.scaleVisit) {
  const p = scalePassage(visit);
  if (!p || !Number.isInteger(visit.index)) return null;
  const token = p?.tokens?.[visit.index];
  return token && scaleTokenFingerprint(token) === visit.fingerprint ? { p, token } : null;
}

function scaleNodeFrom(node) {
  if (node?.from?.passage && Number.isInteger(node.from.index)) return node.from;
  const context = node?.sourceContext;
  return context?.sourceKind === 'bundled-passage' && Number.isInteger(context.index)
    ? { passage: context.sourceId, index: context.index } : null;
}

function scaleNodeBelongs(node, visit = S.scaleVisit) {
  if (!scaleSource(visit)) return false;
  if (node?.t === 'sent') return node.passage === visit.passageId && node.start === visit.sentence.start &&
    node.tokens.length === visit.sentence.tokens.length;
  const from = scaleNodeFrom(node);
  return from?.passage === visit.passageId && from.index >= visit.sentence.start &&
    from.index < visit.sentence.start + visit.sentence.tokens.length;
}

function scaleReaderIndex() {
  const p = passage();
  if (!p?.tokens || S.view !== 'reader' || S.stack.length) return null;
  const visible = (index) => {
    const token = readerTokenAtIndex(index);
    if (!token?.isConnected || !token.hasAttribute('data-para')) return false;
    const box = token.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
  };
  const selected = S.readerTake;
  if (selected?.p === p.id && visible(selected.index)) return selected.index;
  const focused = document.activeElement?.closest?.('#reader .tok[data-index]');
  if (focused && visible(Number(focused.dataset.index))) return Number(focused.dataset.index);
  const token = [...document.querySelectorAll('#reader .tok[data-index][data-para]')]
    .find(item => visible(Number(item.dataset.index)));
  return token ? Number(token.dataset.index) : null;
}

function scaleLineTop(anchor) {
  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT,
    { acceptNode: (node) => (node.parentElement?.closest('rt, rp') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let top = Infinity;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0) top = Math.min(top, box.top);
  }
  return Number.isFinite(top) ? top : anchor.getBoundingClientRect().top;
}

function refreshScaleOrigin() {
  const index = scaleReaderIndex();
  if (index != null) captureScaleVisit(index);
}

function requestScaleReturn(visit) {
  if (S.scaleVisit !== visit || !scaleSource(visit)) return false;
  visit.returnRequest = {};
  visit.returnJob = null;
  const reader = document.getElementById('reader');
  if (reader) {
    delete reader.dataset.scaleReturnIndex;
    delete reader.dataset.scaleReturnDelta;
  }
  return true;
}

function scaleWordKanji(node) {
  if (node?.t !== 'word') return [];
  if (Object.hasOwn(node, 'keptAnswer')) return [...node.id].filter(ch => D.kanji[ch]);
  const rec = lookup(node.id, node.seq, node.reading, node.matchedGloss);
  return (rec?.k?.length ? rec.k : [...node.id]).filter(ch => D.kanji[ch]);
}

function scaleKanjiParts(node) {
  if (node?.t !== 'kanji') return [];
  const parts = mainParts(node.id).filter(ch => D.radicals[ch]);
  const rad = D.radInfo?.[D.kanji[node.id]?.rad]?.c;
  if (rad && D.radicals[rad] && !parts.includes(rad)) parts.push(rad);
  return parts;
}

function scaleParentIndex() {
  const node = S.stack.at(-1), scale = scaleName(node);
  for (let index = S.stack.length - 2; index >= 0; index -= 1) {
    const parent = S.stack[index];
    if (scale === 'part' && parent.t === 'kanji' && scaleKanjiParts(parent).includes(node.id)) return index;
    if (scale === 'kanji' && parent.t === 'word' && scaleWordKanji(parent).includes(node.id)) return index;
    if (scale === 'word' && parent.t === 'sent' && scaleNodeBelongs(parent) && scaleNodeBelongs(node)) return index;
  }
  return -1;
}

function adjacentScaleOutTarget() {
  const scale = scaleName(), node = S.stack.at(-1);
  if (scale === 'part' || scale === 'kanji') return scaleParentIndex() >= 0 ? (scale === 'part' ? 'kanji' : 'word') : null;
  if (scale === 'word') return scaleNodeBelongs(node) ? 'sentence' : null;
  if (scale === 'sentence') return scaleNodeBelongs(node) ? 'article' : null;
  if (scale === 'article') return 'shelf';
  if (scale === 'shelf') return 'sky';
  return null;
}

function scaleFallbackOut() {
  if (!S.stack.length) return null;
  if (S.stack.length > 1) {
    const index = S.stack.length - 2, node = S.stack[index];
    return { index, node, scale: scaleName(node) || 'entry' };
  }
  return { view: S.view, scale: ({ reader: 'article', shelf: 'shelf', archive: 'shelf', drift: 'sky' })[S.view] || 'room' };
}

function scaleOutTarget() {
  return adjacentScaleOutTarget() || scaleFallbackOut()?.scale ||
    (S.view === 'drift' && !S.stack.length && S.driftDepth > 0 ? 'sky' : null);
}

function retireScaleDestination(view = S.view) {
  // Explicitly leaving this destination abandons this one detour. Its older,
  // unrelated review/source callers keep their own canonical frames.
  if (S.navigationReturns.at(-1)?.destination === view) S.navigationReturns.pop();
}

function scaleInTarget() {
  const scale = scaleName(), node = S.stack.at(-1), visit = S.scaleVisit;
  if (scale === 'sky') return 'shelf';
  if (scale === 'shelf') return scalePassage(visit) ? 'article' : null;
  if (scale === 'article') return passage()?.tokens?.length ? 'sentence' : null;
  if (scale === 'sentence' && scaleNodeBelongs(node)) {
    const source = scaleSource(visit), word = visit.word || readerEntryNode(source.token, visit.index, source.p);
    return word?.t === 'word' ? 'word' : null;
  }
  // Hfix-1A (round 1, H-hakuu-09, H-nami-08: a trailing "kanji ›" on 総理's page, a level he had not entered): a word's
  // rail offers its way in only back to the kanji entered from it in this visit; the first way in is the page's own kanji
  // rows, which name each kanji
  if (scale === 'word') return node?.enteredKanji && scaleWordKanji(node).includes(node.enteredKanji) ? 'kanji' : null;
  if (scale === 'kanji') return scaleKanjiParts(node).length ? 'part' : null;
  return null;
}

function retireScaleTransients() {
  retireScaleReturn();
  finishPageTransition();
  removeMini();
  clearWordLadder();
  clearReaderReadings();
  clearReaderSummons();
  stopReadAloud();
  stopSentenceListening();
}

function scaleThread() {
  const scale = scaleName() || (S.stack.length ? 'entry' : null);
  if (!scale) return null;
  // Hfix-1A · a word remembers the kanji entered from it in this visit (its rail's way back in goes there, and only there)
  const shown = S.stack.at(-1), under = S.stack.at(-2);
  if (shown?.t === 'kanji' && under?.t === 'word' && scaleWordKanji(under).includes(shown.id)) under.enteredKanji = shown.id;
  const thread = el('nav', 'scale-thread');
  thread.dataset.scale = scale;
  thread.setAttribute('aria-label', tx('ことばの道すじ', 'The way through the text'));
  thread.setAttribute('data-drift-chrome', '');
  const visit = S.scaleVisit;
  if (scaleSource(visit)) {
    thread.dataset.passageId = visit.passageId;
    thread.dataset.tokenIndex = String(visit.index);
    thread.dataset.sentenceStart = String(visit.sentence.start);
    thread.dataset.sentenceEnd = String(visit.sentence.start + visit.sentence.tokens.length);
  }
  const path = scaleThreadPath(), top = S.stack.at(-1), view = S.view;
  for (const [index, bead] of path.entries()) {
    const current = index === path.length - 1;
    const button = el(current && !bead.out ? 'span' : 'button',
      bead.out ? 'scale-out' : current ? 'scale-current' : 'scale-bead');
    // a bead is one ellipsized line (white-space: nowrap), so its label is set as text, never through the word rule's
    // <wbr>: Blink and WebKit break at a <wbr> even in a nowrap line (Q × G6, the merge: the article's title stood three
    // lines tall in the room's rail, and the reader under it jumped when the rail settled to one line)
    button.textContent = bead.label;
    if (button.tagName === 'BUTTON') button.type = 'button';
    button.dataset.scaleBead = bead.scale;
    button.title = bead.description || bead.label;
    if (current) button.setAttribute('aria-current', 'step');
    if (bead.node) {
      button.dataset.node = `${bead.node.t}:${bead.node.id}`;
      button.dataset.stackIndex = String(bead.index);
      button.dataset.reading = bead.node.reading || '';
      if (bead.node.seq != null) button.dataset.seq = String(bead.node.seq);
    }
    if (bead.out) {
      const outside = scaleOutTarget();
      button.dataset.scaleOut = ''; button.dataset.scaleTarget = outside || '';
      const shortcut = !adjacentScaleOutTarget() && scaleFallbackOut();
      if (shortcut) button.dataset.scaleShortcut = 'caller';
      button.disabled = !outside || !scaleNavigationAllowed();
      button.setAttribute('aria-label', shortcut ? tx('この項目をひらいた場所へ戻る', 'Return to the place that opened this entry')
        : outside ? tx(`ひとつ外へ · ${scaleLabel(outside)}`, `One scale out · ${scaleLabel(outside)}`)
        : scale === 'sky' ? tx('宙 · いちばん外側', 'Sky · outermost scale')
          : tx('この訪問の外側の出典はありません', 'No enclosing source in this visit'));
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (button.isConnected && S.view === view && S.stack.at(-1) === top) scaleOut();
      });
    } else {
      if (!current) button.disabled = !scaleNavigationAllowed();
      const label = bead.description || bead.label;
      button.setAttribute('aria-label', current ? tx(`現在 · ${label}`, `Current · ${label}`)
        : tx(`${label}へ戻る`, `Return to ${label}`));
      if (!current) button.addEventListener('click', event => {
        event.stopPropagation();
        if (button.isConnected && S.view === view && S.stack.at(-1) === top) returnToScaleBead(bead);
      });
    }
    thread.append(button);
  }
  const inside = scaleInTarget();
  if (inside) {
    const enter = el('button', 'scale-in');
    enter.textContent = `${scaleLabel(inside)} ›`; // one nowrap line, as a bead (above)
    enter.type = 'button'; enter.dataset.scaleIn = ''; enter.dataset.scaleTarget = inside;
    enter.disabled = !scaleNavigationAllowed();
    enter.setAttribute('aria-label', tx(`ひとつ内へ · ${scaleLabel(inside)}`, `One scale in · ${scaleLabel(inside)}`));
    enter.addEventListener('click', event => {
      event.stopPropagation();
      if (enter.isConnected && S.view === view && S.stack.at(-1) === top) scaleIn();
    });
    thread.append(enter);
  }
  return thread;
}

function threadRest(thread, target = thread.scrollLeft) {
  const outside = thread.querySelector(':scope > [data-scale-out]');
  if (!outside || !thread.isConnected) return target;
  const port = thread.getBoundingClientRect().left + thread.clientLeft;
  const gap = parseFloat(getComputedStyle(thread).columnGap) || 0;
  // 宙 sticks at the scroller's start, so its right edge is the same at rest and while the rail is scrolled
  const reserve = Math.round(outside.getBoundingClientRect().right - port + gap);
  if (thread.style.getPropertyValue('--thread-reserve') !== `${reserve}px`) thread.style.setProperty('--thread-reserve', `${reserve}px`);
  // the rail's own end padding, read once before any room is added to it
  thread.dataset.threadPad ??= String(parseFloat(getComputedStyle(thread).paddingInlineEnd) || 0);
  const pad = Number(thread.dataset.threadPad), added = Math.max(0, (parseFloat(getComputedStyle(thread).paddingInlineEnd) || 0) - pad);
  if (thread.scrollWidth <= thread.clientWidth + 1) return 0;
  const beads = [...thread.children].filter((node) => node !== outside && node.getClientRects().length);
  const rests = beads.map((node) => node.getBoundingClientRect().left - port + thread.scrollLeft - reserve).filter((x) => x >= -0.5);
  const end = thread.scrollWidth - thread.clientWidth - added;
  const furthest = rests.filter((x) => x >= end - 0.5).sort((a, b) => a - b)[0];
  // a rest a fraction past the end is no rest in either engine (they snap back to the start): a pixel's slack
  const room = furthest > end - 0.5 ? Math.ceil(furthest - end + 1) : 0;
  if (room !== Math.round(added)) {
    thread.style.paddingInlineEnd = room ? `${pad + room}px` : '';
    // laid out now, so the snap positions a scroll set in this task is measured against include the new end
    void thread.scrollWidth;
  }
  return Math.max(0, Math.ceil(rests.filter((x) => x >= target - 0.5).sort((a, b) => a - b)[0] ?? furthest ?? target));
}

function revealMountedScaleCurrent(thread) {
  const parent = thread?.parentElement;
  const current = thread?.querySelector(':scope > [aria-current="step"]');
  const outside = thread?.querySelector(':scope > [data-scale-out]');
  if (!parent || !current || current === outside) return;
  const initialLeft = thread.scrollLeft;
  let cancelled = false;
  const events = ['pointerdown', 'wheel', 'keydown'];
  const cleanup = () => {
    for (const type of events) thread.removeEventListener(type, cancel, true);
  };
  const cancel = () => { cancelled = true; cleanup(); };
  for (const type of events) thread.addEventListener(type, cancel, { capture: true, passive: true });
  const reveal = () => {
    cleanup();
    // Hfix-1A · the rail's rests are set whoever moves it next (this reveal, or a finger); a finger's move is judged on
    // the offset before they are set (setting them may re-snap the rail)
    const left0 = thread.scrollLeft;
    if (thread.isConnected) threadRest(thread, thread.scrollLeft);
    if (cancelled || !thread.isConnected || thread.parentElement !== parent ||
        current.parentElement !== thread || current.getAttribute('aria-current') !== 'step' ||
        left0 !== initialLeft || thread.closest('[inert], [hidden], [aria-hidden="true"]') ||
        (thread.contains(document.activeElement) && document.activeElement !== outside && document.activeElement !== current)) return;
    const rect = thread.getBoundingClientRect(), bead = current.getBoundingClientRect();
    if (!rect.width || !rect.height || !bead.width || !bead.height || thread.scrollWidth <= thread.clientWidth) return;
    let left = Math.max(0, rect.left + thread.clientLeft);
    let right = Math.min(document.documentElement.clientWidth, rect.left + thread.clientLeft + thread.clientWidth);
    // Reserve the sticky control's actual occupied edge, without assuming a
    // positive scrollLeft or a particular inline direction.
    const out = outside?.getBoundingClientRect();
    if (out?.width && out.right > left && out.left < right) {
      if (out.left + out.width / 2 <= (left + right) / 2) left = Math.max(left, out.right);
      else right = Math.min(right, out.left);
    }
    if (bead.width > right - left) return;
    const delta = bead.right > right ? Math.ceil(bead.right - right)
      : bead.left < left ? Math.floor(bead.left - left) : 0;
    // Hfix-1A · the least move that shows the current bead, carried on to the next rest: no bead left half under 宙
    if (delta) thread.scrollLeft = threadRest(thread, thread.scrollLeft + delta);
  };
  // The actual sheet is untransformed; only its separate cut-word animates.
  // Read this mount's layout once, after layer law and before any later use.
  requestAnimationFrame(reveal);
}

function paintRoomScaleThread(root) {
  const old = root.querySelector(':scope > .scale-thread');
  const thread = scaleThread();
  if (!thread) { old?.remove(); return; }
  thread.dataset.scaleRoom = '';
  if (old) old.replaceWith(thread);
  else {
    const chrome = root.querySelector(':scope > .chrome');
    if (chrome) chrome.after(thread);
    else root.prepend(thread);
  }
  revealMountedScaleCurrent(thread);
}

function backupCounts(record, turns, journal) {
  return { archiveTurns: turns.length, chatTurns: record.aiChat?.length || 0,
    readingVersions: (record.aiReadings?.length || 0) + (record.aiReading ? 1 : 0),
    ...(journal ? { syncOperations: journal.operations.length } : {}) };
}

async function resumeAssessmentV2() {
  const selected = currentAssessmentV2();
  if (!selected || selected.attempt.status !== 'in-progress' ||
      (selected.attempt.clock.sessionId === assessmentClockSession && !selected.attempt.clock.interrupted)) return true;
  return applyAssessmentV2({ kind: 'resume' });
}

function retryMockLoad(main, key, start) {
  const again = biLabel('button', 'chip', 'もう一度', 'try again');
  again.type = 'button';
  again.id = 'mock-retry';
  again.addEventListener('click', () => {
    D.mockFailed?.delete(key);
    start();
    render();
  });
  main.append(again);
}

function keepSentencePracticeFocusVisible(target) {
  if (!target?.isConnected || S.view !== 'sentence-practice') return;
  const rect = target.getBoundingClientRect();
  if (rect.top < 80 || rect.bottom > window.innerHeight) target.scrollIntoView({ block: 'center' });
}

function scalePathData(d, frac, centre = 512) {
  if (/[^MLCQZmlcqz0-9.,\s-]/.test(d) || /[mlcqz]/.test(d)) return null;
  return d.replace(
    /-?\d*\.?\d+/g,
    (tok) => String(Math.round((centre + (Number(tok) - centre) * frac) * 10) / 10),
  );
}

function revealFocusedChromeDoor(event) {
  const bar = event.currentTarget, door = event.target;
  if (!(door instanceof Element) || !door.matches(':focus-visible') || bar.scrollWidth <= bar.clientWidth) return;
  const rect = bar.getBoundingClientRect(), box = door.getBoundingClientRect();
  const left = rect.left + bar.clientLeft, right = left + bar.clientWidth;
  if (!box.width || box.width > right - left) return;
  const delta = box.right > right ? Math.ceil(box.right - right) : box.left < left ? Math.floor(box.left - left) : 0;
  if (delta) bar.scrollLeft += delta;
}

export { scaleName, scaleShelfView, scaleLabel, scaleSource, scaleNodeFrom, scaleNodeBelongs, scaleReaderIndex, scaleLineTop, refreshScaleOrigin, requestScaleReturn, scaleWordKanji, scaleKanjiParts, scaleParentIndex, adjacentScaleOutTarget, scaleFallbackOut, scaleOutTarget, retireScaleDestination, scaleInTarget, retireScaleTransients, scaleThread, threadRest, revealMountedScaleCurrent, paintRoomScaleThread, backupCounts, resumeAssessmentV2, retryMockLoad, keepSentencePracticeFocusVisible, scalePathData, revealFocusedChromeDoor };
