/** capture seam: split out of corridor.js (G3); now edited here directly. */
import { D, S, TOUCH_READING_FADES, TOUCH_READING_GAP, TOUCH_READING_MOTION, TOUCH_READING_ROWS, TOUCH_ROW_PINS, TRAIL_KINDS, copyRecordWith, dictionaryRowBySeq, el, encounterKey, entryKanaIndex, kanaReadingKey, kataToHira, metReadable, nonEmptyString, owns, plainRecord, readHelpPatch, renderSourceInboxEntries, sourceInboxShelf, srsKey, syncChromeKeep, tx, updateReaderPlaceSave, withEn } from '../corridor.js';
import { lookup, readerTokenAtIndex, readingLine, senseRecord, teFormRecord } from './dictionary.mjs';
import { localDayOrdinal, trailLastPhrase } from './drift.mjs';
import { aiTransport } from './teacher.mjs';

function rememberFileDraft(state, input) {
  if (state.draft && JSON.stringify(input) === JSON.stringify(state.draft.input)) return;
  state.draft = { revision: crypto.randomUUID(), editedAt: new Date().toISOString(), input };
  try { state.recovery.edit(input, state.draft.revision, state.draft.editedAt); state.error = false; }
  catch { state.error = true; }
}

function fileIntakeFailure(code) {
  if (code === 'file-mismatch') return tx('保存したファイルとは内容が違う。同じ版のファイルを選ぶ。', 'That file differs from the saved source. Choose the same version.');
  if (code === 'file-selection-expired') return tx('もう一度同じファイルを選ぶ。下書きはここに残る。', 'Choose the file again. Your draft stays here.');
  if (code === 'extraction-timeout' || code === 'text-capacity' || code === 'extraction-capacity')
    return tx('この範囲の取り込みを完了できなかった。ページ数を減らしてもう一度試す。', 'This page range could not finish. Try fewer pages.');
  if (code === 'locked-pdf' || code === 'copy-restricted-pdf') return tx('このPDFはロックされているか、文章のコピーが制限されている。', 'This PDF is locked or restricts copying text.');
  if (code === 'file-size' || code === 'image-size') return tx('20 MB 以下、画像は4000万画素以下のファイルを選ぶ。', 'Choose a file up to 20 MB and an image up to 40 megapixels.');
  return tx('取り込みを完了できなかった。対応する画像かPDFを選び、もう一度試す。下書きはここに残る。',
    'Intake could not finish. Choose a supported image or PDF and try again. Your draft stays here.');
}

function filePageLabel(pages) { return tx(`${pages.join('・')} ページ`, `Page${pages.length === 1 ? '' : 's'} ${pages.join(', ')}`); }

function sourceInboxEntries(inbox) {
  const children = new Set([...(inbox.excerpts || []), ...(inbox.transcripts || []), ...(inbox.files || []).filter(entry => entry.sourceId)].map(entry => entry.captureId));
  return sourceInboxShelf(inbox).entries.filter(entry => !children.has(entry.id))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || a.id.localeCompare(b.id));
}

function reconcileSourceInboxEntries(section, inbox) {
  const next = el('section'); renderSourceInboxEntries(next, inbox);
  const key = node => node.id || (node.dataset.sourceReferenceConflict ? `conflict:${node.dataset.sourceReferenceConflict}`
    : node.querySelector('[data-source-capture]')?.dataset.sourceCapture || null);
  const previous = new Map([...section.children].filter(node => key(node)).map(node => [key(node), node]));
  const active = section.contains(document.activeElement) ? document.activeElement : null;
  const focusedCapture = active?.dataset.sourceCapture;
  const focusedConflict = active?.closest('[data-source-reference-conflict]')?.dataset.sourceReferenceConflict;
  const focusedUrl = active?.getAttribute('href');
  const planned = [...next.children].map(node => {
    const old = previous.get(key(node));
    if (old?.id === 'source-inbox-kept') { old.textContent = node.textContent; return old; }
    return old?.outerHTML === node.outerHTML ? old : node;
  });
  const retained = new Set(planned);
  // Removing obsolete siblings first keeps unchanged rows in their relative
  // order. A received neighbor can be inserted without detaching a focused row.
  for (const child of [...section.children]) if (!retained.has(child)) child.remove();
  planned.forEach((child, index) => {
    if (section.children[index] !== child) section.insertBefore(child, section.children[index] || null);
  });
  if (active && document.activeElement !== active) {
    const replacement = active.isConnected ? active : focusedCapture
      ? [...section.querySelectorAll('[data-source-capture]')].find(node => node.dataset.sourceCapture === focusedCapture)
      : focusedConflict && focusedUrl ? [...section.querySelectorAll('[data-source-reference-conflict] a')].find(node =>
        node.closest('[data-source-reference-conflict]').dataset.sourceReferenceConflict === focusedConflict &&
        node.getAttribute('href') === focusedUrl) : null;
    if (replacement) replacement.focus({ preventScroll: true });
  }
}

function seatGlossRow(anchor, line) {
  anchor.querySelector(':scope > .tok-en')?.remove();
  anchor.append(line);
  anchor.classList.add('has-en');
  anchor.dataset.depthAside = 'meaning';
  return () => {
    line.remove();
    if (!anchor.querySelector(':scope > .tok-en')) { anchor.classList.remove('has-en'); delete anchor.dataset.depthAside; }
  };
}

function seatInlineGloss(line) {
  const ink = line?.firstElementChild;
  if (!ink?.isConnected || !line.isConnected) return;
  ink.style.removeProperty('translate');
  const box = ink.getBoundingClientRect();
  if (!box.width) return;
  const edges = readingLine(line);
  if (!edges) return;
  const shift = box.left < edges.left ? edges.left - box.left : box.right > edges.right ? edges.right - box.right : 0;
  if (Math.abs(shift) > 0.5) ink.style.translate = `${shift}px 0`;
}

function touchReading(rt) {
  const ruby = rt?.parentElement;
  if (!rt?.isConnected || ruby?.tagName !== 'RUBY' || rt.classList.contains('hidden-rt')) return false;
  if (ruby.dataset.r != null) return true; // the ladder's own inline reading (inlineWordReading)
  const reader = rt.closest('#reader');
  return !!reader && !reader.classList.contains('fg-always');
}

function touchRows(rt, block) {
  const rows = [];
  for (let n = rt.parentElement?.parentElement; n && n !== block && n !== document.body; n = n.parentElement) {
    if (!/^inline|^ruby|^contents$/.test(getComputedStyle(n).display) && /^inline/.test(getComputedStyle(n.parentElement).display)) rows.push(n);
  }
  return rows;
}

function pinTouchRows(rt, rows, widths) {
  if (!rows.length) return;
  TOUCH_READING_ROWS.set(rt, rows);
  rows.forEach((row, i) => {
    let pin = TOUCH_ROW_PINS.get(row);
    if (!pin) {
      pin = { owners: new Map(), width: row.style.width, priority: row.style.getPropertyPriority('width'),
        attribute: row.getAttribute('data-touch-pin') };
      TOUCH_ROW_PINS.set(row, pin);
    }
    pin.owners.set(rt, widths[i]);
    row.style.width = [...pin.owners.values()].reduce((a, b) => parseFloat(a) >= parseFloat(b) ? a : b);
    row.setAttribute('data-touch-pin', '');
  });
}

function unpinTouchRows(rt) {
  const rows = TOUCH_READING_ROWS.get(rt) || [];
  TOUCH_READING_ROWS.delete(rt);
  for (const row of rows) {
    const pin = TOUCH_ROW_PINS.get(row);
    if (!pin) continue;
    pin.owners.delete(rt);
    if (pin.owners.size) {
      row.style.width = [...pin.owners.values()].reduce((a, b) => parseFloat(a) >= parseFloat(b) ? a : b);
    } else {
      if (pin.width) row.style.setProperty('width', pin.width, pin.priority);
      else row.style.removeProperty('width');
      if (pin.attribute == null) row.removeAttribute('data-touch-pin');
      else row.setAttribute('data-touch-pin', pin.attribute);
      TOUCH_ROW_PINS.delete(row);
    }
  }
}

function clearTouchReadingSeat(rt) {
  rt.style.removeProperty('margin-inline');
  unpinTouchRows(rt);
}

function stopTouchReadingFade(rt) {
  const cycle = TOUCH_READING_FADES.get(rt);
  if (cycle) {
    TOUCH_READING_FADES.delete(rt);
    clearTimeout(cycle.timer);
    rt.removeEventListener('transitionend', cycle.event);
    rt.removeEventListener('transitioncancel', cycle.event);
  }
  rt.removeAttribute('data-touch-fading');
}

function finishTouchReadingFade(rt, cycle) {
  if (TOUCH_READING_FADES.get(rt) !== cycle) return;
  stopTouchReadingFade(rt);
  // Box removal and seat release share this task: no intervening painted frame.
  clearTouchReadingSeat(rt);
  if (touchReading(rt)) seatTouchReading(rt);
}

function touchReadingFading(rt) {
  return TOUCH_READING_FADES.has(rt);
}

function setTouchReadingShown(rt, shown) {
  if (shown) {
    stopTouchReadingFade(rt);
    rt.classList.remove('hidden-rt');
    seatTouchReading(rt);
    return;
  }
  const current = TOUCH_READING_FADES.get(rt);
  const reader = rt.closest('#reader');
  const canFade = rt.isConnected && rt.parentElement?.tagName === 'RUBY' && reader &&
    !reader.classList.contains('fg-always') && !TOUCH_READING_MOTION.matches;
  if (current) {
    if (!canFade) finishTouchReadingFade(rt, current);
    return; // repeated conceal cannot restart the fade or extend its deadline
  }
  const hidden = rt.classList.contains('hidden-rt');
  const before = canFade && !hidden ? getComputedStyle(rt) : null;
  const visible = before && before.display !== 'none' && before.visibility !== 'hidden' && Number(before.opacity) > 0;
  if (!visible) {
    stopTouchReadingFade(rt);
    rt.classList.add('hidden-rt');
    clearTouchReadingSeat(rt);
    return;
  }
  const cycle = { timer: 0, animation: null, started: performance.now(), event: null };
  const complete = () => finishTouchReadingFade(rt, cycle);
  cycle.event = (event) => {
    if (event.target !== rt || event.propertyName !== 'opacity' || event.pseudoElement || event.timeStamp < cycle.started) return;
    // A queued event from an interrupted old transition cannot finish a new running one.
    if (cycle.animation && ['running', 'pending'].includes(cycle.animation.playState)) return;
    complete();
  };
  TOUCH_READING_FADES.set(rt, cycle);
  rt.addEventListener('transitionend', cycle.event);
  rt.addEventListener('transitioncancel', cycle.event);
  rt.setAttribute('data-touch-fading', '');
  rt.classList.add('hidden-rt');
  const style = getComputedStyle(rt);
  const seconds = value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
  const properties = style.transitionProperty.split(',').map(value => value.trim());
  const durations = style.transitionDuration.split(',').map(seconds);
  const delays = style.transitionDelay.split(',').map(seconds);
  const time = Math.max(0, ...properties.map((property, i) => property === 'opacity'
    ? durations[i % durations.length] + delays[i % delays.length] : 0));
  if (!(time > 0)) { complete(); return; }
  cycle.animation = rt.getAnimations?.().find(animation => animation.transitionProperty === 'opacity' && animation.effect?.target === rt) || null;
  // The promise belongs to this actual transition; both outcomes still check this cycle's identity.
  cycle.animation?.finished.then(complete, complete);
  cycle.timer = setTimeout(complete, time + 50); // only a lost-completion fallback, not the normal fade clock
}

function seatTouchReading(rt) {
  if (!rt?.style) return;
  if (touchReadingFading(rt)) return;
  clearTouchReadingSeat(rt);
  if (!touchReading(rt)) return;
  const style = getComputedStyle(rt);
  if (style.display === 'none' || style.visibility === 'hidden') return;
  const line = readingLine(rt);
  if (!line) return;
  const rows = touchRows(rt, line.block);
  // the word under this reading: the ruby's own text before it, back to the reading before, measured with the reading
  // set aside (Chromium reports a base already widened to its reading), and the rows it stands in, as wide
  const range = document.createRange();
  let left = Infinity, right = -Infinity;
  const shown = rt.style.display;
  rt.style.display = 'none';
  for (let node = rt.previousSibling; node && node.nodeName !== 'RT'; node = node.previousSibling) {
    if (node.nodeName === 'RP') continue;
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (box.width > 0) { left = Math.min(left, box.left); right = Math.max(right, box.right); }
  }
  const rowWidths = rows.map((n) => getComputedStyle(n).width);
  rt.style.display = shown;
  const own = rt.getBoundingClientRect();
  const excess = own.width - (right - left);
  if (!Number.isFinite(excess) || excess <= 0.5) return;
  let roomLeft = Math.max(0, left - line.left), roomRight = Math.max(0, line.right - right);
  // another reading shown on this line keeps its paper: the nearest on each side bounds the overhang
  for (const other of line.block.querySelectorAll('rt')) {
    if (other === rt || (other.classList.contains('hidden-rt') && !touchReadingFading(other))) continue;
    const box = other.getBoundingClientRect();
    if (!box.width || box.bottom <= own.top || box.top >= own.bottom) continue;
    if (box.right <= left) roomLeft = Math.min(roomLeft, Math.max(0, left - box.right - TOUCH_READING_GAP));
    else if (box.left >= right) roomRight = Math.min(roomRight, Math.max(0, box.left - right - TOUCH_READING_GAP));
  }
  let start = Math.min(excess / 2, roomLeft), end = Math.min(excess / 2, roomRight);
  // at a line's edge the reading slides inward: what one side cannot take, the other may
  const short = excess - start - end;
  if (short > 0) { const more = Math.min(roomLeft - start, short); start += more; end += Math.min(roomRight - end, short - more); }
  if (start + end <= 0.5) return;
  rt.style.marginInline = `${-start}px ${-end}px`;
  pinTouchRows(rt, rows, rowWidths);
}

function sourceLadderAction(target) {
  const action = target?.closest?.('button');
  if (!action || !/^(publisher|source)-(context-save|context-open|sentence-practice|selection-lookup)$/.test(action.id)) return null;
  return action.closest('.publisher-context-selection') ? action : null;
}

function readerQuickRecord(token) {
  // R · read in the token's own reading (tokenReading's rule): a door that names its entry (readingToken) answers
  // by it, and a core spelling read otherwise answers with the entry so read once the full dictionary has it
  const own = !token.b || token.b === token.s ? String(token.r || '') : '';
  // R3 · a name in its text has no dictionary meaning (senseRecord)
  if (token.senseName) return senseRecord(null, token.sense);
  // N2 · a te-form auxiliary's entry leads with its senses for the te-form (teFormRecord); R3 · any other with its sense
  if (token.seq != null && token.seq !== '') return senseRecord(teFormRecord(lookup(token.b, token.seq, own), token.te), token.sense);
  // R2 · a door marked unfit (a verb whose kana form the quick dictionary has only as a noun) never takes that noun
  if (D.dict[token.b] && !token.unfit) return senseRecord(lookup(token.b, null, own), token.sense);
  const kept = S.deepWords?.[token.b];
  if (kept) return { r: kept.r || '', m: kept.m || [] };
  const old = D.words[token.b];
  return old ? { r: old.r, m: old.g ? [old.g] : [] } : null;
}

function readerQuickRecordAsRead(token, record = readerQuickRecord(token)) {
  const own = !token.b || token.b === token.s ? String(token.r || '') : '';
  return record && own && record.r && kataToHira(String(record.r)) !== kataToHira(own) ? null : record;
}

function sourceProcessingScope(context, transport = aiTransport()) {
  return { sourceKind: context.sourceKind, sourceId: context.sourceId, sourceDigest: context.sourceDigest,
    baseUrl: transport.baseUrl, model: transport.model, providerConfigId: transport.configId };
}

function encounterIdentity(node) {
  if (!node || (node.t && node.t !== 'word') || !nonEmptyString(node.id)) return null;
  const id = node.id;
  const shown = nonEmptyString(node.reading) ? node.reading : null;
  const reading = shown ? kanaReadingKey(shown) || null : null;
  const make = (kind, seq, read) => ({ t: 'word', id, kind, seq, reading: read });
  if (node.seq != null && node.seq !== '') {
    const seq = String(node.seq);
    if (!reading) return make('unresolved', null, null);
    const row = dictionaryRowBySeq(seq);
    if (Array.isArray(row) && String(row[0]) === seq) {
      const kana = entryKanaIndex(row, shown);
      return kana >= 0 ? make('seq', seq, kanaReadingKey(row[5][kana]) || reading) : make('unresolved', null, reading);
    }
    return make('seq', seq, reading);
  }
  const core = D.dict?.[id];
  if (core) {
    const coreReading = kanaReadingKey(core.r || '') || null;
    return !reading || reading === coreReading ? make('core', null, coreReading) : make('unresolved', null, reading);
  }
  return reading ? make('text', null, reading) : make('unresolved', null, null);
}

function encounterPatch(latest, node, now, { article = null } = {}) {
  const identity = encounterIdentity(node);
  if (!identity || !Number.isFinite(now)) return {};
  const key = encounterKey(identity);
  const patch = {};
  const root = latest.met;
  if (root == null || metReadable(root)) {
    const entries = root?.entries || {};
    const prior = owns(entries, key) && plainRecord(entries[key]) ? entries[key] : null;
    const day = localDayOrdinal(now);
    if (!prior || day > prior.last) {
      const next = prior ? { ...prior, last: day, days: prior.days + 1 } : { first: day, last: day, days: 1 };
      patch.met = { ...(root || {}), version: 1, entries: copyRecordWith(entries, key, next) };
    }
  }
  const help = article ? readHelpPatch(latest, article, key, now) : null;
  if (help) patch.readHelp = help;
  return patch;
}

function readerTakeCurrent() {
  if (S.view !== 'reader' || !S.passageId) return null;
  const cur = S.readerTake;
  if (!cur || cur.p !== S.passageId) return null;
  return cur;
}

function readerTakeNode(cur) {
  return { t: 'word', id: cur.id, from: { passage: cur.p, index: cur.index }, ctxScope: 'sent' };
}

function syncReaderTakeSeal() {
  updateReaderPlaceSave();
  syncChromeKeep();
  const selected = readerTakeCurrent();
  for (const node of document.querySelectorAll('#reader .tok-current')) node.classList.remove('tok-current');
  if (selected) readerTokenAtIndex(selected.index)?.classList.add('tok-current');
}

function readerCaptureReasonText(spelling) {
  return tx(
    `「${spelling}」は簡易辞書にないため、ここでは保存できません。全項目で全辞書を引けます。`,
    `${spelling} isn't in the quick dictionary, so it can't be saved here. Full entry looks it up in the whole dictionary.`,
  );
}

function readerCaptureReason(node) {
  const reason = el('p', 'reader-choice-capture', readerCaptureReasonText(node.id));
  reason.id = 'reader-choice-capture';
  return reason;
}

function holdReaderCapture(button) {
  button.disabled = true;
  button.classList.add('reader-capture-held');
  button.setAttribute('aria-describedby', 'reader-choice-capture');
}

function encounterTrail(key) {
  const rows = (S.obslog || []).filter((row) => TRAIL_KINDS.has(row[1]) && row[2] === key);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  // a drill undo is a bare [t,'dojo',key,0] row revoking the most recent standing dojo grade (study-host's rule, PR #77
  // 3df6ed8f4): neither is an encounter or a practice, so an undo never makes the trail claim more than before
  const struck = new Set();
  const standing = [];
  rows.forEach((row, ix) => {
    if (row[1] !== 'dojo') return;
    if (row[3] === 0) {
      struck.add(ix);
      if (standing.length) struck.add(standing.pop());
    } else standing.push(ix);
  });
  const counts = {};
  rows.forEach((row, ix) => { if (!struck.has(ix)) counts[row[1]] = (counts[row[1]] || 0) + 1; });
  return { rows, first: rows[0][0], last, counts, met: Math.max(1, rows.length - struck.size) };
}

function renderEncounterTrail(sheet, node) {
  if (!['word', 'kanji', 'radical', 'idiom'].includes(node.t)) return;
  const trail = encounterTrail(srsKey(node.t, node.id));
  if (!trail) return;
  const box = el('div', 'encounter-trail');
  box.append(withEn(el('p', 'eyebrow', '出会い'), 'your encounters', 'en-inline'));
  const day = (t) => new Date(t).toLocaleDateString();
  const n = trail.met;
  box.append(
    el(
      'p',
      'trail-line',
      tx(
        `初めて ${day(trail.first)} ・ これまで ${n}回`,
        `first met ${day(trail.first)} · ${n} ${n === 1 ? 'encounter' : 'encounters'} so far`,
      ),
    ),
  );
  box.append(
    el('p', 'trail-line', tx(`直近 ${day(trail.last[0])} — ${trailLastPhrase(trail.last)}`, `last ${day(trail.last[0])} — ${trailLastPhrase(trail.last)}`)),
  );
  // the third line only when practice actually happened — a reading tapped
  // in the reader is assistance, not practice, and must not be dressed as it
  const practice = (trail.counts.dojo || 0) + (trail.counts.probe || 0) + (trail.counts.lesson || 0);
  if (practice) {
    box.append(
      el(
        'p',
        'trail-line trail-quiet',
        tx(`稽古 ${practice}回（記録であって、習熟ではない）`, `${practice} practice ${practice === 1 ? 'record' : 'records'} — evidence, not mastery`),
      ),
    );
  }
  sheet.append(box);
}

export { rememberFileDraft, fileIntakeFailure, filePageLabel, sourceInboxEntries, reconcileSourceInboxEntries, seatGlossRow, seatInlineGloss, touchReading, touchRows, pinTouchRows, unpinTouchRows, clearTouchReadingSeat, stopTouchReadingFade, finishTouchReadingFade, touchReadingFading, setTouchReadingShown, seatTouchReading, sourceLadderAction, readerQuickRecord, readerQuickRecordAsRead, sourceProcessingScope, encounterIdentity, encounterPatch, readerTakeCurrent, readerTakeNode, syncReaderTakeSeal, readerCaptureReasonText, readerCaptureReason, holdReaderCapture, encounterTrail, renderEncounterTrail };
