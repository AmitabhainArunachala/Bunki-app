/** voice seam: split out of corridor.js (G3); now edited here directly. */
import { AI_MINE_MAX_ROWS, D, FRAMES_CAP, FRAMES_STORE, NARRATION_VOICES, S, SENSEI_OBS_CODES, SPEAK_JA, VOICE_LOCK, assertLearningSource, bi, buildListenRow, cancelExcerptPlayback, canonicalRecordJson, currentRecordNoteView, currentSentenceListeningCue, el, ensureSentenceListeningCatalog, invalidateRecordNoteViews, narrationVoiceName, openSpeakRoom, passage, performAssessmentReconciliation, plainRecord, protectStore, queueAssessmentWork, readAloud, readFrameRows, renderSentenceTokens, resolveTeacherSource, sheetActionLine, sheetActionLineKeys, speakAvailable, srsKey, stopPassageRead, transcriptTime, tx, uiIcon } from '../corridor.js';
import { appendJapaneseLookup, lookup } from './dictionary.mjs';
import './word-entry.mjs';

function recordSyncStatus(raw) {
  if (!plainRecord(raw) || !['unavailable', 'disconnected', 'connecting', 'ready', 'syncing', 'error'].includes(raw.state))
    throw new Error('invalid-sync-status');
  const result = raw.result;
  return { state: raw.state, code: typeof raw.code === 'string' ? raw.code : null,
    ...(result && Number.isSafeInteger(result.pendingOutbox) && result.pendingOutbox >= 0 &&
      Number.isSafeInteger(result.pendingCausal) && result.pendingCausal >= 0 && typeof result.hasMore === 'boolean'
      ? { result: { pendingOutbox: result.pendingOutbox, pendingCausal: result.pendingCausal, hasMore: result.hasMore } } : {}) };
}

function recordUnavailable() {
  invalidateRecordNoteViews();
  protectStore(
    'この窓は読み取り専用。ほかの KAIRO の窓を閉じ、再読み込みして続ける。未送信のメモと質問はこの窓に残る。',
    'This window is read-only. Close other KAIRO windows, then reload to continue. Unsent note and chat drafts stay in this window.',
  );
}

function transcriptRangeLabel(range) { return `${transcriptTime(range.startMs)}–${transcriptTime(range.endMs)}`; }

function voiceForRole(role) {
  return (role && VOICE_LOCK.roles[role]) || VOICE_LOCK.main;
}

function approvedNarrationClip(clip, article = null) {
  if (!clip || typeof clip.text !== 'string' || !clip.text.trim() || typeof clip.src !== 'string') return false;
  // v2 identity is stated, never defaulted: a clip that does not say its role and model is not one
  const role = clip.speakerRole;
  // The lock's narration provider is a second, separate admission: a clip of its model is prose
  // narration in a voice that provider lists, from that voice's own folder, or it is nothing.
  // It widens nothing for the render lock's clips, which are judged below as before.
  const provider = VOICE_LOCK.narration;
  if (provider && clip.model === provider.model)
    return role === 'narrator' && Object.hasOwn(provider.voices, clip.voice) &&
      new RegExp(`^audio/narration/${clip.voice}/[a-zA-Z0-9_-]+\\.(?:m4a|mp3|wav|ogg)$`, 'u').test(clip.src);
  if (typeof role !== 'string' || clip.model !== VOICE_LOCK.model) return false;
  if (!Object.hasOwn(NARRATION_VOICES, clip.voice)) return false;
  // the role law at the point of load: a clip whose voice disagrees with its role is refused,
  // which is what keeps the second speaker from reading prose
  if (clip.voice !== voiceForRole(role)) return false;
  // a second speaker exists only in a dialogue: prose cannot promote itself to one by its label
  if (role !== 'narrator' && article?.kind !== 'dialogue') return false;
  return new RegExp(`^audio/narration/${clip.voice}/[a-zA-Z0-9_-]+\\.(?:m4a|mp3|wav|ogg)$`, 'u').test(clip.src);
}

function approvedNarrationManifest(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.v !== 2 || value.lock?.model !== VOICE_LOCK.model) return null;
  if (!value.articles || typeof value.articles !== 'object' || Array.isArray(value.articles)) return null;
  for (const article of Object.values(value.articles)) {
    if (!Array.isArray(article?.clips) || !article.clips.every((clip) => approvedNarrationClip(clip, article))) return null;
  }
  return value;
}

function excerptListenLabel() {
  // This click plays the excerpt in the locked narration voice; it writes no preference.
  return tx(`${narrationVoiceName()}の声で聞く`, `Listen · ${narrationVoiceName()}`);
}

function stopReadAloud() {
  cancelExcerptPlayback();
  stopPassageRead();
}

function paintListenProgress(fraction = 0) {
  const bar = document.getElementById('listen-progress');
  if (!bar || !readAloud.total) return;
  const done = Math.min(1, (readAloud.clip + Math.max(0, Math.min(1, fraction))) / readAloud.total);
  bar.style.setProperty('--played', String(done));
  bar.setAttribute('aria-valuenow', String(Math.round(done * 100)));
}

function refreshListenRow() {
  const row = document.querySelector('#app main .listen-row');
  const p = passage();
  if (!row || !p || row.dataset.passage !== p.id) return;
  const focusedId = row.contains(document.activeElement) ? document.activeElement.id : null;
  const next = buildListenRow(p);
  // the row swaps in its state's place (placeListenRow); the keyboard stays on the mark or the control it was on
  placeListenRow(row, next);
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}

function placeListenRow(row, next) {
  const head = document.querySelector('#app > main .reader-head');
  if (next.dataset.open === 'false' && head) {
    if (row !== next) row?.remove();
    head.prepend(next);
    return;
  }
  const reader = document.getElementById('reader');
  if (row?.closest('.reader-head') && reader) {
    row.remove();
    reader.before(next);
    return;
  }
  row.replaceWith(next);
}

function voicePendingNote(id) {
  const pending = el('p', 'play-pending');
  pending.id = id;
  // a status label, like a button's: not prose, so no lookup doors (they were three Tab stops)
  pending.dataset.japaneseLookup = 'off';
  // the two names come from the lock, never from a literal: one value decides what this says
  const mainName = NARRATION_VOICES[VOICE_LOCK.main], secondName = NARRATION_VOICES[VOICE_LOCK.second];
  pending.setAttribute('aria-description', tx(`音声は ${mainName}、第二話者は ${secondName} に固定されています。`,
    `Approved voices: ${mainName} (main), ${secondName} (second).`));
  const sentence = id === 'sentence-listening-pending';
  pending.append(uiIcon('speaker'), el('span', 'l-ja', sentence
    ? tx('この文の収録音声はありません', 'No recording for this sentence')
    : tx('この記事の収録音声はありません', 'No recording for this article')));
  return pending;
}

function recordViewSurface() {
  const view = S.view;
  const listName = S.listOpen?.name;
  const manualList = S.listOpen?.manual;
  return () => S.view === view && !S.stack.length &&
    (view !== 'list' || (S.listOpen?.name === listName && S.listOpen?.manual === manualList));
}

function recordNoteExpected(view) {
  return { heads: view.projection.heads, tombstones: view.projection.tombstones,
    activeRestoreGenerations: view.projection.activeRestoreGenerations };
}

function recordNoteEditable(view) {
  if (view.headVersions.length === 1 && view.headVersions[0].payload.segments.every((segment) => segment.kind === 'original'))
    return { generation: view.headVersions[0].payload.generation,
      text: view.headVersions[0].payload.segments.map((segment) => segment.text).join('') };
  if (!view.headVersions.length && view.projection.activeRestoreGenerations.length === 1)
    return { generation: view.projection.activeRestoreGenerations[0], text: '' };
  return null;
}

async function recordSha256(value) {
  const bytes = new TextEncoder().encode(canonicalRecordJson(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reconcileAssessmentResults() {
  return queueAssessmentWork(performAssessmentReconciliation);
}

function receivedPracticeAlternativeLabel(attemptId, payloadSha256) {
  const heads = currentRecordNoteView()?.examAttemptViews.find((entry) => entry.attemptId === attemptId)?.headAttempts || [];
  if (heads.length < 2) return null;
  const index = heads.map((head) => head.payloadSha256).sort().indexOf(payloadSha256);
  return index < 0 ? null : `${tx('記録', 'Record')} ${index + 1}`;
}

function receivedPracticeLoadKey(payload) { return canonicalRecordJson(payload.form); }

function reconcileSheetActionLines(sheet) {
  for (const note of sheet.querySelectorAll('.teacher-note')) {
    const key = sheetActionLineKeys.get(note);
    if (key === undefined) continue;
    const line = sheetActionLine(key);
    if (note.textContent !== line) note.textContent = line;
  }
}

function availableSentenceListeningCue(context) {
  try { return currentSentenceListeningCue(context); } catch { return null; }
}

async function resolveSentenceListeningCue(context) {
  await resolveTeacherSource(context); await ensureSentenceListeningCatalog();
  assertLearningSource(S, context);
  return currentSentenceListeningCue(context);
}

function recordPickerSurface(node) {
  const view = S.view;
  const stacked = S.stack.length > 0;
  const type = node.t;
  const id = node.id;
  return () => {
    if (S.view !== view) return false;
    const top = S.stack[S.stack.length - 1];
    // the picker's only surface is the word's own entry sheet (the bar's capture panel is gone)
    return stacked ? top?.t === type && top.id === id : false;
  };
}

function speakGateEvidence(found, xid, now = Date.now()) {
  const subjectKey = (raw, type) => {
    if (type !== 'word' && type !== 'kanji') return null;
    const w = String(raw || '').trim();
    if (!w || w.length > 12 || !/[぀-ヿ㐀-鿿豈-﫿]/u.test(w)) return null;
    if (type === 'kanji' && [...w].length !== 1) return null;
    const inDeck = S.taken.some((item) => item.t === type && item.id === w);
    const inDict = type === 'kanji' ? !!D.kanji?.[w] : !!lookup(w);
    return inDeck || inDict ? srsKey(type, w) : null;
  };
  const rows = [];
  for (const f of Array.isArray(found) ? found : []) {
    if (rows.length >= AI_MINE_MAX_ROWS || !plainRecord(f)) continue;
    const key = subjectKey(f.subject, f.subjectType);
    if (!key) continue;
    if (f.kind === 'sensei' && [1, 3].includes(f.polarity) && SENSEI_OBS_CODES.has(f.code)) {
      rows.push([now, 'sensei', key, f.polarity, f.code, xid]);
    } else if (f.kind === 'confuse') {
      const other = subjectKey(f.other, f.otherType);
      if (other && other !== key) rows.push([now, 'confuse', key, other]);
    }
  }
  return rows;
}

function speakSentence(container, tokens, { contextId }) {
  for (const raw of tokens) {
    const s = String(raw?.s || ''), b = String(raw?.b || s), r = String(raw?.r || '');
    if (!s) continue;
    if (!SPEAK_JA.test(s)) { renderSentenceTokens(container, [{ s, b: s, r: '', c: false }], { contextId }); continue; }
    if (!lookup(b)) {
      const wrap = appendJapaneseLookup(container, s, { block: container, kinsoku: true });
      for (const word of wrap.querySelectorAll('.japanese-lookup-word')) { word.dataset.speakS = word.dataset.speakB = word.dataset.lookupText; word.dataset.speakR = ''; }
      continue;
    }
    const f = Array.isArray(raw.f) && raw.f.length ? raw.f : [{ t: s, ...(r && r !== s ? { r } : {}) }];
    renderSentenceTokens(container, [{ s, b, r, c: true, f }], { contextId });
    const door = container.lastElementChild;
    // the whole token rides the door (surface, base, the surface's reading): an inflected form keeps what R needs. G3 · a
    // sentence's word is a span in a roving paragraph now, not a button: the door is still the word
    if (door?.matches('.sentence-tok')) { door.dataset.speakS = s; door.dataset.speakB = b; door.dataset.speakR = r; }
  }
}

function speakChip(p) {
  if (!speakAvailable()) return document.createDocumentFragment();
  const chip = el('button', 'chip speak-door', tx('話してみる', '話す · Talk it over'));
  chip.type = 'button';
  chip.id = 'read-speak';
  chip.lang = bi() ? 'en' : 'ja';
  chip.addEventListener('click', (event) => openSpeakRoom({ reader: p.id, scroll: Math.round(window.scrollY) }, { kind: 'article', id: p.id }, event.currentTarget));
  return chip;
}

function recordFrameRow(row) {
  try {
    const rows = readFrameRows();
    rows.push(row);
    localStorage.setItem(FRAMES_STORE, JSON.stringify(rows.slice(-FRAMES_CAP)));
  } catch { /* a device's own measure: a full or blocked storage keeps none */ }
}

export { recordSyncStatus, recordUnavailable, transcriptRangeLabel, voiceForRole, approvedNarrationClip, approvedNarrationManifest, excerptListenLabel, stopReadAloud, paintListenProgress, refreshListenRow, placeListenRow, voicePendingNote, recordViewSurface, recordNoteExpected, recordNoteEditable, recordSha256, reconcileAssessmentResults, receivedPracticeAlternativeLabel, receivedPracticeLoadKey, reconcileSheetActionLines, availableSentenceListeningCue, resolveSentenceListeningCue, recordPickerSurface, speakGateEvidence, speakSentence, speakChip, recordFrameRow };
