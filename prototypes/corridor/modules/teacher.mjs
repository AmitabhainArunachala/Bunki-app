/** G3 teacher seam — declarations moved verbatim from ../corridor.js (pure move, no body edits). */
import { $, AI_DEFAULT_BASE_URL, AI_DEFAULT_MODEL, AI_DEVICE_STORE, AI_KEY_STORE, AI_READING_TIMEOUT_CAP_MS, AI_READING_TOKENS_PER_SECOND, AI_TIMEOUT_MS, D, S, aiChatLog, aiConverse, aiLogAll, aiSheetNotes, aiSheetTurns, bi, biLabel, buildTeacherChatLog, commitCapture, el, enhanceJapaneseProse, kagamiLevel, nonEmptyString, owns, passage, plainRecord, render, renderTeacherDoor, teacherDraftInputErrors, teacherDraftWindowEdits, teacherSourceProcessingUnavailable, teacherWindowDraftPrefix, tx, withEn } from '../corridor.js';
import { dictionaryRowsForForm, lookup, readingLine } from './dictionary.mjs';
import { validArchiveTurn } from './learner.mjs';
import { note, takenContext, wordArchiveRef } from './word-entry.mjs';
import { GRAMMARS } from './worlds.mjs';

function teacherWindowDraftKey(contextRef) {
  return `${teacherWindowDraftPrefix()}${contextRef || 'general'}`;
}

function teacherDraftStatus(view, input) {
  if (teacherDraftWindowEdits.has(input)) return tx('この質問はこの窓に残る。記録を保存できないため、アプリを閉じる前にコピーする。',
    'This question stays in this window. Record saving is unavailable; copy it before closing the app.');
  if (teacherDraftInputErrors.has(input)) return tx('この質問を保存できない。書いた文をコピーしてから確認する。',
    'This question could not be kept. Copy your text before checking it.');
  if (view.state === 'conflict') return tx('保存済みの質問と、閉じる前の下書きが異なる。下で続きを選ぶ。',
    'The saved question differs from the recovered draft. Choose which one to continue below.');
  if (view.error || view.state === 'unavailable') return tx('閉じる前の下書きを復旧できない。未保存の文をコピーしてから再読み込みする。',
    'Draft recovery is unavailable. Copy any unsaved text before reloading.');
  if (view.state === 'pending' || view.state === 'saving') return tx('質問を保存中…', 'Saving your question…');
  if (!view.draft) return '';
  if (view.draft.consumed) return tx('質問と返事を保存した。次の質問を書ける。',
    'Your question and reply are saved. You can write the next question.');
  // with no key on this device nothing can be sent: the line says so and where the key goes, never only "saved"
  if (!aiKey()) return tx('質問はこの端末に残したが、送っていない。先生が答えるには、この端末にあなた自身の AI の鍵が要る。下の「あなたの鍵」に入れる。',
    'Your question is kept on this device but not sent: the tutor needs your own AI key on this device. Add it under Your key below.');
  return tx('下書きをこの端末に保存した。閉じても続きを書ける。',
    'Draft saved on this device. You can close the app and continue later.');
}

function sizeTeacherQuestion(input) {
  if (!input.isConnected) return;
  const scroll = input.scrollTop;
  input.style.height = 'auto';
  const style = getComputedStyle(input);
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const limit = Math.max(144, Math.min(360, Math.floor(innerHeight * 0.45)));
  input.style.height = `${Math.min(limit, Math.max(92, input.scrollHeight + border))}px`;
  input.style.overflowY = input.scrollHeight > input.clientHeight ? 'auto' : 'hidden';
  input.scrollTop = scroll;
}

function validAiEvidenceTurn(turn) {
  return validArchiveTurn(turn) && nonEmptyString(turn.content);
}

function aiQuizParse(raw) {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return null;
  let qs;
  try {
    qs = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(qs)) return null;
  const ok = qs.filter(
    (q) =>
      q &&
      typeof q.q === 'string' &&
      Array.isArray(q.opts) &&
      q.opts.length === 4 &&
      q.opts.every((o) => typeof o === 'string') &&
      Number.isInteger(q.right) &&
      q.right >= 0 &&
      q.right < 4 &&
      typeof q.why === 'string',
  );
  return ok.length >= 3 ? ok.slice(0, 5) : null;
}

function activeTeacherContext() {
  const root = S.teacherContexts;
  return root?.entries.find((entry) => entry.id === root.activeRef) || null;
}

function teacherSentence(node) {
  const from = node?.from;
  const p = from && D.passages.find((entry) => entry.id === from.passage);
  if (!p?.tokens || !Number.isInteger(from.index) || from.index < 0 || from.index >= p.tokens.length) return null;
  const context = takenContext({ ctx: { p: p.id, i: from.index, scope: 'sent' } });
  if (!context?.tokens.length) return null;
  return { p, index: from.index, start: context.start, end: context.start + context.tokens.length,
    quote: context.tokens.map((token) => token.s).join('') };
}

function teacherSourceError(error) {
  if (error?.message?.startsWith('source-approval')) return tx(
    'この出典を先生へ送る許可が必要か、許可や接続先が変わった。送信を止めた。質問は残っている。許可と接続先を確認する。',
    'Source approval is needed or has changed. Sending stopped and your question is kept. Check the source approval and connected tutor.',
  );
  if (error?.message === 'source-processing-unavailable') return tx(
    'この文は保存できるが、まだ先生へ送れない。元の文章を読み返せる。',
    'This sentence is saved, but this source is not available for tutor processing yet. You can return to the reading.',
  );
  return tx('元の文を確認できない。文章をひらき直し、この文を選び直す。保存した文はここに残る。',
    'The original sentence could not be verified. Reopen the reading and select it again. Your saved sentence stays here.');
}

function teacherDoorKey(node) {
  return JSON.stringify([node?.t, node?.id, node?.from?.passage, node?.from?.index, node?.sourceContext?.id]);
}

function aiChatTurns() {
  return aiChatLog.turns || S.aiChat;
}

function refreshTeacherChatHistory(contextRef = activeTeacherContext()?.id || null) {
  if (S.view !== 'ai' || (activeTeacherContext()?.id || null) !== contextRef) return;
  const log = document.querySelector('.chat-log');
  if (log) { const updated = buildTeacherChatLog(activeTeacherContext()); log.replaceWith(updated); enhanceJapaneseProse(updated); }
}

function teacherChatStatus(context) {
  if (context?.sourceKind === 'personal-reading' && teacherSourceProcessingUnavailable(context)) return tx(
    '質問はこの端末に残る。この出典について話すには、接続した先生への送信を上で許可する。',
    'Your question stays on this device. Approve this source above to discuss it with your connected tutor.',
  );
  return aiChatLog.errors.get(context?.id || null) || (teacherSourceProcessingUnavailable(context) ? tx(
    '質問はこの端末に残る。この出典の文章は、まだ先生に送れない。',
    'Your question stays on this device. This source text cannot be sent to the tutor yet.',
  ) : !aiKey() ? tx(
    '文と会話はこの端末に残る。下で先生を接続すると質問を送れる。',
    'Your sentences and conversations stay here. Connect a tutor below to send a question.',
  ) : context ? tx('送ると、この文とこの会話の最近のやり取りを接続した先生に渡す。',
    'Sending shares this sentence and recent turns from this conversation with your connected tutor.') : '');
}

function teacherDraftCopyButton(text, note) {
  const button = biLabel('button', 'chip', '質問をコピー', 'copy question');
  button.type = 'button';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      note.textContent = tx('質問をコピーした。', 'Question copied.');
    } catch { note.textContent = tx('文を選択してコピーする。', 'Select the question text and copy it.'); }
  });
  return button;
}

function aiKey() {
  return aiTransport().key;
}

function aiTeachingSubject(key) {
  if (typeof key !== 'string') return null;
  const cut = key.indexOf(':');
  if (cut < 1) return null;
  const kind = key.slice(0, cut), id = key.slice(cut + 1);
  const form = kind === 'word' && (owns(D.dict, id) || owns(D.words, id) || dictionaryRowsForForm(id).length > 0) ? id :
    kind === 'grammar' ? GRAMMARS().find((grammar) => grammar.id === id)?.p :
    kind === 'kanji' && (owns(D.kanji, id) || window.BunkiSkipUI?.getKanji(S.skipUi, id)) ? id : null;
  if (typeof form !== 'string' || !form.trim() || form.length > 80) return null;
  return { kind, form };
}

function aiRequestTimeoutMs(meta = {}) {
  if (meta.surface !== 'reading' || !Number.isInteger(meta.maxTokens) || meta.maxTokens <= 0) return AI_TIMEOUT_MS;
  const writing = Math.ceil(Math.min(meta.maxTokens, 16000) / AI_READING_TOKENS_PER_SECOND) * 1000;
  return Math.min(AI_READING_TIMEOUT_CAP_MS, AI_TIMEOUT_MS + writing);
}

function canonicalAiBaseUrl(value) {
  if (!nonEmptyString(value) || value.length > 2048 || /[\s\\]/u.test(value) ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function aiTransport() {
  const defaults = { baseUrl: AI_DEFAULT_BASE_URL, model: AI_DEFAULT_MODEL, origin: AI_DEFAULT_BASE_URL, key: '' };
  try {
    const raw = localStorage.getItem(AI_DEVICE_STORE);
    if (raw === null) return { ...defaults, requiresBinding: !!localStorage.getItem(AI_KEY_STORE) };
    const config = JSON.parse(raw);
    const baseUrl = plainRecord(config) && canonicalAiBaseUrl(config.baseUrl);
    if (!baseUrl || config.v !== 1 || !nonEmptyString(config.model) || config.model.length > 200) return { ...defaults, invalid: true };
    const origin = new URL(baseUrl).origin;
    if (!plainRecord(config.credential) || config.credential.origin !== origin || typeof config.credential.key !== 'string' || config.credential.key.length > 8192 ||
        ['\r', '\n', '\0'].some((character) => config.credential.key.includes(character))) {
      return { ...defaults, invalid: true };
    }
    if (config.configId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(config.configId))
      return { ...defaults, invalid: true };
    return { baseUrl, model: config.model, origin, key: config.credential.key, configId: config.configId || 'legacy-v1' };
  } catch {
    return { ...defaults, invalid: true };
  }
}

function aiProvider() {
  const { baseUrl, model } = aiTransport();
  return { baseUrl, model };
}

async function aiAsk(system, prompt, meta = {}) {
  return aiConverse(system, [{ role: 'user', content: prompt }], meta);
}

async function aiCreateCards(words, max = 5) {
  const made = [];
  for (const raw of Array.isArray(words) ? words : []) {
    if (made.length >= max) break;
    const w = String(raw || '')
      .trim()
      .replace(/[。、．，,.\s]+$/u, '');
    if (!w || w.length > 12 || !/[぀-ヿ㐀-鿿豈-﫿]/u.test(w)) continue;
    if (S.taken.some((t) => t.t === 'word' && t.id === w)) continue;
    if (!lookup(w)) continue; // no dictionary truth, no card — fail closed
    if (!await commitCapture({ t: 'word', id: w, from: null, by: 'sensei' }, w)) break;
    made.push(w);
  }
  return made;
}

async function aiLastReply(surface, ref) {
  const rows = await aiLogAll(surface);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].role === 'assistant' && rows[i].contextRef === ref) return rows[i].content;
  }
  return null;
}

function aiSheetTurn(key) {
  const turn = (aiSheetTurns.get(key) || 0) + 1;
  aiSheetTurns.set(key, turn);
  return turn;
}

function aiSheetSettle(box, paint) {
  if (box.isConnected) paint();
  else if ($('.sheet')) render();
}

function renderAiTutor(sheet, node, rec) {
  if (node.from?.passage || node.sourceContext) {
    renderTeacherDoor(sheet, node);
  }
  if (!aiKey()) return;
  const wrap = el('div', 'ai-tutor');
  const btn = biLabel('button', 'chip ai-ask', node.from?.passage || node.sourceContext ? 'この語だけ先生に聞く' : '先生に聞く',
    node.from?.passage || node.sourceContext ? 'ask about the word alone' : 'ask the tutor');
  btn.type = 'button';
  const out = el('div', 'ai-answer');
  // G2 · the archive is read back by the word as this page reads it: 訳's わけ reply never answers 訳 read やく
  const ref = wordArchiveRef(node, rec);
  const note = aiSheetNotes.get(`word-tutor|${ref}`);
  if (note) out.textContent = note;
  else aiLastReply('word-tutor', ref).then((prev) => {
    if (prev && !out.textContent) out.textContent = prev;
  });
  btn.addEventListener('click', async () => {
    const turn = aiSheetTurn(`word-tutor|${ref}`);
    aiSheetNotes.delete(`word-tutor|${ref}`);
    btn.disabled = true;
    out.textContent = tx('考え中…', 'thinking…');
    try {
      const senses = (rec?.m || []).slice(0, 4).join('; ');
      const said = await aiAsk(
        'You are a Japanese tutor inside a dictionary app. In under 120 words: explain the word\'s nuance and typical use using the separate learning dimensions, then give two natural example sentences, each on its own line as: Japanese sentence — reading in kana — English. Plain text only, no headers or markdown.',
        `Word: ${node.id}${rec?.r ? ` (${rec.r})` : ''}. Dictionary senses: ${senses || 'none recorded'}.`,
        { surface: 'word-tutor', ref },
      );
      aiSheetNotes.delete(`word-tutor|${ref}`);
      aiSheetSettle(out, () => { out.textContent = said; });
    } catch {
      if (aiSheetTurns.get(`word-tutor|${ref}`) === turn) {
        const line = tx('いまは答えられない。あとでもう一度。', 'The tutor could not answer just now — try again in a moment.');
        aiSheetNotes.set(`word-tutor|${ref}`, line);
        aiSheetSettle(out, () => { out.textContent = line; });
      }
    }
    btn.disabled = false;
  });
  wrap.append(btn, out);
  sheet.append(wrap);
}

function renderAiExamples(sheet, node, rec) {
  if (!aiKey()) return;
  sheet.append(withEn(el('p', 'eyebrow', '例文 — レベル別'), 'examples at every level', 'en-inline'));
  const wrap = el('div', 'ai-tutor');
  const btn = biLabel('button', 'chip ai-ask', '例文をつくる', 'write examples at my level');
  btn.type = 'button';
  const out = el('div', 'ai-examples');
  const paint = (raw) => {
    out.textContent = '';
    let shown = 0;
    for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 4) continue;
      const [lv, ja, read, en] = parts;
      const card = el('div', 'ai-ex');
      const head = el('p', 'ai-ex-ja');
      if (/^N[1-5]$/i.test(lv)) head.append(el('span', 'ai-ex-lv', lv.toUpperCase()));
      head.append(document.createTextNode(ja));
      card.append(head);
      if (read) card.append(el('p', 'ai-ex-read', read));
      if (bi() && en) card.append(el('p', 'ai-ex-en', en));
      out.append(card);
      shown += 1;
    }
    return shown;
  };
  const exRef = wordArchiveRef(node, rec);
  const note = aiSheetNotes.get(`examples|${exRef}`);
  if (note) out.append(el('p', 'ai-ex-note', note));
  else aiLastReply('examples', exRef).then((prev) => {
    if (prev && !out.childElementCount && !btn.disabled) paint(prev);
  });
  btn.addEventListener('click', async () => {
    const turn = aiSheetTurn(`examples|${exRef}`);
    aiSheetNotes.delete(`examples|${exRef}`);
    btn.disabled = true;
    out.textContent = '';
    out.append(el('p', 'ai-ex-note', tx('つくっています…', 'writing examples…')));
    try {
      const senses = (rec?.m || []).slice(0, 4).join('; ');
      const wordLv = kagamiLevel(rec?.jlpt);
      const raw = await aiAsk(
        'You are a Japanese tutor inside a dictionary app. Write 6 to 8 natural example sentences for the given word across a useful range of difficulty, easiest first, using the separate learning dimensions. Keep an unrecorded word classification unknown; a word tag alone does not establish a sentence\'s difficulty. Output ONE sentence per line and nothing else. Each line MUST be exactly: Nx | Japanese sentence | full reading of the sentence in hiragana | English. Nx is your provisional N5–N1 difficulty estimate for that example, not an official classification or a claim about the learner. No numbering, no markdown, no extra commentary.',
        `Word: ${node.id}${rec?.r ? ` (${rec.r})` : ''}. Source word JLPT classification: ${wordLv || 'not recorded'}. Dictionary senses: ${senses || 'none recorded'}.`,
        { surface: 'examples', ref: exRef },
      );
      aiSheetNotes.delete(`examples|${exRef}`);
      aiSheetSettle(out, () => {
        if (!paint(raw)) out.append(el('p', 'ai-ex-note', tx('うまく作れなかった。もう一度どうぞ。', 'Could not format the examples — try once more.')));
      });
    } catch {
      if (aiSheetTurns.get(`examples|${exRef}`) === turn) {
        const line = tx('いまは作れない。あとでもう一度。', 'The tutor could not write examples just now — try again in a moment.');
        aiSheetNotes.set(`examples|${exRef}`, line);
        aiSheetSettle(out, () => {
          out.textContent = '';
          out.append(el('p', 'ai-ex-note', line));
        });
      }
    }
    btn.disabled = false;
  });
  wrap.append(btn, out);
  sheet.append(wrap);
}

function renderAiCoach(main, rv) {
  if (!aiKey()) return;
  const wrap = el('div', 'ai-tutor');
  const btn = biLabel('button', 'chip ai-ask', '先生の一言', 'a word from the tutor');
  btn.type = 'button';
  btn.id = 'ai-coach';
  const out = el('div', 'ai-answer');
  // 考え中 and what the tutor said live on the session, not in this closure: a repaint
  // mid-request killed the spinner, re-armed the door and lost the arriving reply
  // (PR #77 d9f0b984)
  const thinking = tx('考え中…', 'thinking…');
  if (rv.coach?.pending) {
    btn.disabled = true;
    out.textContent = thinking;
  } else if (rv.coach?.said) out.textContent = rv.coach.said;
  btn.addEventListener('click', async () => {
    if (rv.coach?.pending) return;
    rv.coach = { pending: true };
    btn.disabled = true;
    out.textContent = thinking;
    let said;
    try {
      // history is queue-ordered (grades push sequentially, undo pops)
      const lines = rv.queue.map((item, i) => `${item.label} (${item.t}): ${rv.history[i]?.key || 'ungraded'}`);
      said = await aiAsk(
        "You are a Japanese tutor inside a flashcard app, speaking just after a review session. In under 110 words of plain text (no headers, no markdown): one sentence on what the session shows, then name the items graded 'again' or 'hard' that deserve another look, then ONE concrete memory hook for the single hardest item. You only advise — the app's scheduler alone decides when cards return, so never promise timings.",
        `Session grades:\n${lines.join('\n')}`,
        { surface: 'coach' },
      );
    } catch {
      said = tx('いまは答えられない。あとでもう一度。', 'The tutor could not answer just now — try again in a moment.');
    }
    rv.coach = { pending: false, said };
    if (out.isConnected) {
      out.textContent = said;
      btn.disabled = false;
    } else if (S.view === 'review' && S.review === rv) render();
  });
  wrap.append(btn, out);
  main.append(wrap);
}

function aiReadingSegments(text) {
  const out = [];
  const re = /([㐀-鿿豈-﫿々〆ヶ]+[ぁ-ゖー]*)（([ぁ-ゖァ-ヶー・]+)）/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ base: m[1], ruby: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function askOnRequest(stage, plan, readingLine) {
  const said = stage.querySelector('.mini-head-text');
  const meaning = [...stage.querySelectorAll('.mini-gloss, .mini-word-note')];
  const asks = [];
  if (readingLine) asks.push(['reading', '読', tx('読みを見る', 'Show the reading'), [readingLine]]);
  if (meaning.length) asks.push(['meaning', '意', tx('意味を見る', 'Show the meaning'), meaning]);
  if (!said || !asks.length) return;
  for (const [what, glyph, name, held] of asks) {
    const line = el('div', 'mini-asked');
    line.dataset.ask = what;
    const ask = el('button', 'mini-ask-seal', glyph);
    ask.type = 'button';
    ask.lang = 'ja';
    ask.dataset.ask = what;
    ask.title = name;
    ask.setAttribute('aria-label', name);
    const answer = el('div', 'mini-asked-answer');
    held[0].before(line);
    answer.append(...held);
    line.append(ask, answer);
    const paint = () => {
      const open = !!plan.asked[what];
      ask.setAttribute('aria-expanded', String(open));
      answer.toggleAttribute('data-ask-held', !open);
    };
    ask.addEventListener('click', (event) => {
      event.stopPropagation();
      plan.asked[what] = !plan.asked[what];
      paint();
    });
    paint();
  }
}

export { teacherWindowDraftKey, teacherDraftStatus, sizeTeacherQuestion, validAiEvidenceTurn, aiQuizParse, activeTeacherContext, teacherSentence, teacherSourceError, teacherDoorKey, aiChatTurns, refreshTeacherChatHistory, teacherChatStatus, teacherDraftCopyButton, aiKey, aiTeachingSubject, aiRequestTimeoutMs, canonicalAiBaseUrl, aiTransport, aiProvider, aiAsk, aiCreateCards, aiLastReply, aiSheetTurn, aiSheetSettle, renderAiTutor, renderAiExamples, renderAiCoach, aiReadingSegments, askOnRequest };
