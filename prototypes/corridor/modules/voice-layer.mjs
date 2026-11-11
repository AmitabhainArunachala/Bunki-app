/** The voice layer: where the voice seam meets the screen (2026-11-10; John: "complete all surfaces from articles to
 * cards to grammar points to words, end to end").
 *
 * It owns no look of its own. A surface that already had a listen control keeps it (the reader's play bar, the card's
 * 音, the word box's 音); a surface with Japanese and no control gets the app's one quiet speaker mark (.play-mark),
 * or the study card's own small button on the study card. Everything speaks through modules/voice-seam.mjs: a
 * recorded clip, then the voice server, and otherwise nothing (John, 2026-11-10: "real voices or silence"). A control
 * that finds no voice makes no sound and says why in one plain line beside it. One sound at a time; a read ends when
 * its screen goes.
 *
 * On reveal (John, the same evening): a card's answer and an opened word say themselves once, unless the learner
 * switched that off (corridor.js, WORD_VOICE). A read that starts by itself is voiced by the server or not at all,
 * and when it cannot be voiced it shows nothing and stops nothing.
 *
 * corridor.js installs it beside the app (installVoiceLayer) and passes the few things it needs from the app. The
 * pairing screen and the status line stand under Settings, 筆と声 · Writing and voice. */
import { createAudioPlayer } from './nihongo-speech/audio/speech-player.mjs';
import { isJapaneseEnough, normaliseSpeechText, splitSentences } from './nihongo-speech/audio/speech-text.mjs';
import { installEar } from './ear.mjs';
import { createDeviceTokenStore, createVoiceClient } from './voice-client.mjs';
import { SPEEDS, createVoiceSeam, sentencesOf, voiceKeyOf } from './voice-seam.mjs';

export const READER_RATES = Object.freeze([1, 1.25, 0.75]);
const SKIP = new Set(['RT', 'RP', 'BUTTON', 'SCRIPT', 'STYLE', 'SVG', 'INPUT', 'TEXTAREA', 'SELECT']);
const QUOTES = /[\s「」『』“”"']/gu;
/** 50 ms of silence: played inside the learner's own tap, so the one audio element may speak after the clip arrives. */
function silenceUrl(view) {
  const samples = 400, bytes = new Uint8Array(44 + samples * 2), data = new DataView(bytes.buffer);
  const put = (at, text) => { for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i); };
  put(0, 'RIFF'); data.setUint32(4, 36 + samples * 2, true); put(8, 'WAVE'); put(12, 'fmt '); data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, 8000, true); data.setUint32(28, 16000, true);
  data.setUint16(32, 2, true); data.setUint16(34, 16, true); put(36, 'data'); data.setUint32(40, samples * 2, true);
  return view.URL.createObjectURL(new view.Blob([bytes], { type: 'audio/wav' }));
}

/** The Japanese a learner sees in `element`: no readings above the words, no controls, nothing hidden, and not the
 * line that says why a control found no voice (.say-note). */
export function shownText(element) {
  let out = '';
  const visit = (node) => {
    if (node.nodeType === 3) { out += node.nodeValue; return; }
    if (node.nodeType !== 1) return;
    if (SKIP.has(node.tagName.toUpperCase()) || node.hidden || node.getAttribute('aria-hidden') === 'true' ||
        node.classList.contains('visually-hidden') || node.classList.contains('say-note')) return;
    for (const child of node.childNodes) visit(child);
  };
  if (element) visit(element);
  return out;
}
const JAPANESE_RUN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〆ヶ、。・「」『』（）！？〜～…0-9０-９]+/gu;
const JAPANESE_LETTER = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu;
/** Only the Japanese: text that is Japanese through and through is read as it stands; from a tutor's mixed reply
 * ("Use it like this: 雨が降っているのに、出かけました。") only the Japanese is read, and the English is left unread. */
export function japaneseSentences(text) {
  const whole = sentencesOf(text);
  if (whole.length && whole.every((sentence) => isJapaneseEnough(sentence.text))) return whole;
  const runs = String(text ?? '').match(JAPANESE_RUN) || [];
  return runs.filter((run) => (run.match(JAPANESE_LETTER) || []).length >= 2).flatMap((run) => sentencesOf(run))
    .filter((sentence) => isJapaneseEnough(sentence.text));
}

/** Today's spend, for the status line. The server's day runs from 00:00 UTC. When the server sends the day's own
 * figures they are shown as they are; until then it is what the total has grown by since this device first looked today
 * (`kept` is that first look: { day, spentCents, at }; `keep` is what to remember for the next look). */
export function daySpend(budget, kept, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (Number.isSafeInteger(budget?.daySpentCents))
    return { day, spentCents: budget.daySpentCents, capCents: Number.isSafeInteger(budget.dayCapCents) ? budget.dayCapCents : null, since: null, keep: null };
  const base = kept && kept.day === day && Number.isSafeInteger(kept.spentCents) && kept.spentCents >= 0 && kept.spentCents <= budget.spentCents &&
    Number.isFinite(kept.at) ? kept : { day, spentCents: budget.spentCents, at: now };
  return { day, spentCents: budget.spentCents - base.spentCents, capCents: null, since: base.at, keep: base };
}

export function installVoiceLayer(host) {
  const { tx, el, uiIcon } = host;
  const doc = host.document || document;
  // the client knows no server until a pairing line brings its address (voice-client.mjs)
  const client = createVoiceClient({ store: createDeviceTokenStore(globalThis) });
  const player = createAudioPlayer(doc);
  const audio = doc.querySelector('audio[data-speak-audio]');
  let primed = false;
  const listeners = new Set();
  // where the last sentence came from outlives a reload of this tab (the status line in Settings); nothing else is kept
  const LAST = 'kairo-voice-last';
  const remembered = () => {
    // (a tab that ran an earlier build may still hold a stand-in voice's row: only a real voice counts)
    try { const row = JSON.parse(doc.defaultView.sessionStorage.getItem(LAST)); return row && ['server', 'recorded'].includes(row.source) && Number.isFinite(row.at) ? row : null; } catch { return null; }
  };
  const seam = createVoiceSeam({
    client, player,
    recorded: (src, rate) => host.playRecorded(src, rate),
    quiet: () => host.quiet(),
    onStatus: (status) => {
      if (status.last.source !== 'none') { try { doc.defaultView.sessionStorage.setItem(LAST, JSON.stringify(status.last)); } catch { /* kept for this page only */ } }
      for (const listener of listeners) { try { listener(status); } catch { /* a listener's own fault */ } }
    },
  });
  void client.ready().then(() => { for (const listener of listeners) listener(seam.status()); host.refreshListenRow?.(); });

  /** Inside his tap: the audio element is allowed to sound later, when the first clip has arrived. */
  function prime() {
    if (primed || !audio) return;
    primed = true;
    try {
      audio.src = silenceUrl(doc.defaultView);
      // her first clip replacing the silence aborts its play, and the element stays allowed; only a refusal undoes it
      audio.play()?.catch?.((error) => { if (error?.name === 'NotAllowedError') primed = false; });
    } catch { primed = false; }
  }

  /* ------------------------------------------------------------------ one read from one control */
  let spoken = null; // { button, session }
  const sourceLine = (source) => source === 'server' ? tx('音声サーバー', 'Voice server') : source === 'recorded' ? tx('収録音声', 'Recorded clip') : '';
  // the voice server's day is the UTC day: its new start, in this device's own time
  const newDay = () => new Date((Math.floor(Date.now() / 86400000) + 1) * 86400000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // the two limits are the speech team's (one budget for both apps): the server's own figures once it has sent them
  const money = (cents) => { const n = cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100); return { ja: `${n}ドル`, en: `$${n}` }; };
  const dayCap = () => money(seam.status().budget?.dayCapCents ?? 300);
  const totalCap = () => money(seam.status().budget?.capCents ?? 2500);
  /** Why there is no voice, in one plain line: what a listen control says when it makes no sound. */
  const silenceLine = (reason) => {
    switch (reason) {
      case 'not-paired': case 'not-configured':
        return tx('声を出せません。設定の「筆と声」で音声サーバーとつなぐ。', 'No voice here. Pair the voice server in Settings, Writing and voice.');
      case 'authentication-required':
        return tx('声を出せません。音声サーバーがこの接続を終了しました。設定の「筆と声」でもう一度つなぐ。',
          'No voice: the voice server ended this pairing. Pair again in Settings, Writing and voice.');
      case 'offline': case 'network-failed':
        return tx('声を出せません。音声サーバーに届きません。接続を確かめて、もう一度。', 'No voice: the voice server is out of reach. Check the connection, then tap again.');
      case 'day-budget':
        return tx(`声を出せません。今日の${dayCap().ja}分を使いました。声は${newDay()}に戻ります。`, `No voice: today’s ${dayCap().en} is used. The voice comes back at ${newDay()}.`);
      case 'budget-exhausted':
        return tx(`声を出せません。合計${totalCap().ja}を使い切りました。`, `No voice: the ${totalCap().en} total is used.`);
      case 'not-in-release':
        return tx('声を出せません。音声サーバーはいま新しい文を受け付けていません。', 'No voice: the voice server is not taking new sentences right now.');
      case 'request-rate-limit':
        return tx('声を出せません。1分あたりの新しい文が多すぎました。1分ほど待って、もう一度。', 'No voice: too many new sentences in one minute. Wait about a minute, then tap again.');
      case 'voice-unavailable': case 'voice-timeout':
        return tx('声を出せません。音声サーバーが混んでいます。もう一度。', 'No voice: the voice server is busy. Tap to try again.');
      case 'nothing-to-say': case 'not-japanese':
        return tx('ここには読み上げられる日本語がありません。', 'Nothing here can be read aloud.');
      case 'audio-error':
        return tx('再生できませんでした。もう一度。', 'Could not play. Tap to try again.');
      default:
        return tx('声を出せません。音声サーバーがこの文を読めませんでした。もう一度。', 'No voice: the voice server could not say this. Tap to try again.');
    }
  };
  /** The same reasons in a few words: the status line in Settings and the reader's bar. */
  const reasonWords = (reason) => ({
    'not-configured': tx('未接続', 'not paired'), 'not-paired': tx('未接続', 'not paired'), 'authentication-required': tx('再接続が必要', 'pair again'),
    offline: tx('接続なし', 'no connection'), 'network-failed': tx('接続なし', 'no connection'),
    'day-budget': tx('今日の上限', 'today’s limit reached'), 'budget-exhausted': tx('予算切れ', 'budget used up'),
    'not-in-release': tx('サーバー停止中', 'voice server not taking sentences'), 'request-rate-limit': tx('混雑、1分待つ', 'too many requests, wait a minute'),
    'voice-unavailable': tx('サーバー混雑', 'voice server busy'), 'voice-timeout': tx('サーバー混雑', 'voice server busy'),
    'nothing-to-say': tx('読む文なし', 'nothing to read'), 'not-japanese': tx('読む文なし', 'nothing to read'), 'audio-error': tx('再生エラー', 'could not play'),
  }[reason] || tx('サーバーエラー', 'voice server error'));
  // reasons that pass by themselves or by his pairing: what is true now is what a control says
  const PASSING = new Set(['not-paired', 'not-configured', 'authentication-required', 'offline', 'network-failed', 'day-budget', 'budget-exhausted',
    'not-in-release', 'request-rate-limit']);
  /** The one plain line beside a control the layer made (.say-note is the app's own small note): empty takes it away. */
  function noteBeside(control, text) {
    if (!control?.isConnected) return;
    let note = control.nextElementSibling?.classList?.contains('voice-note') ? control.nextElementSibling : null;
    if (!note) {
      if (!text) return;
      note = el('span', 'say-note voice-note');
      note.setAttribute('role', 'status');
      note.dataset.japaneseLookup = 'off';
      control.after(note);
    }
    note.textContent = text || '';
  }

  /** A read belongs to its control, and the app may draw that control's screen again while the read goes on (a page
   * settling as it opens, a box drawn again). For a control that stands once on the screen this returns how to find
   * "the same control of the same word" afterwards; for any other control, null (its read ends with it). */
  function anchorOf(button) {
    const id = button?.id || '';
    const lookup = id ? () => doc.getElementById(id)
      : button?.dataset?.voiceSay === 'entry-headword' ? () => doc.querySelector('#sheet > .voice-say[data-voice-say="entry-headword"]') : null;
    if (!lookup) return null;
    const subject = (node) => node.closest('#mini')?.dataset.uiContentValue || node.closest('.kp-card')?.dataset.card || node.closest('#sheet')?.dataset.node ||
      `${node.dataset.voiceWord || ''}|${node.dataset.voiceText || ''}`;
    const was = subject(button);
    return () => { const now = lookup(); return now && now !== button && subject(now) === was ? now : null; };
  }

  /** Speak `sentences` from `button`: a second tap stops it; whatever else was speaking ends first. With no voice to be
   * had it makes no sound and hands `onNote` the reason in one plain line (and '' again once a voice answers).
   * `automatic`: the read was not started by the learner's tap (a card's answer or an opened word saying itself): it
   * does not start at all when it could not be voiced, so it stops no other sound, and it never shows a line. */
  function speakFrom(button, { sentences, voiceKey, single = false, onNote = null, onDone = null, automatic = false }) {
    // his second tap on a control that is speaking stops it; a read by itself is nobody's tap
    if (!automatic && button && spoken?.button === button && spoken.session && !spoken.session.ended) { seam.stop(); return null; }
    if (!sentences.length) { if (!automatic) onNote?.(silenceLine('nothing-to-say'), 'nothing-to-say'); return null; }
    if (automatic) {
      if (seam.cannot(voiceKey)) return null;
      // a page nobody has touched yet may not sound: asking the server then would be paid for and never heard
      const touched = doc.defaultView.navigator?.userActivation;
      if (touched && !touched.hasBeenActive) return null;
    }
    prime();
    // `find`: the same control of the same word after the app has drawn its screen again (anchorOf)
    const mine = { button, session: null, over: false, voiced: false, find: anchorOf(button) };
    const paint = (on) => {
      if (!mine.button?.isConnected) return;
      mine.button.classList.toggle('is-speaking', on);
      if (on) mine.button.setAttribute('aria-pressed', 'true'); else mine.button.removeAttribute('aria-pressed');
    };
    /** The control was drawn again while its read goes on: the new one takes the read over, lit as the old one was. */
    mine.adopt = (next) => {
      mine.button = next;
      mine.find = anchorOf(next);
      const state = mine.session?.state;
      paint(state === 'loading' || state === 'playing');
      if (state === 'loading') next.setAttribute('aria-busy', 'true');
    };
    mine.session = seam.read({
      sentences, voiceKey, prefetch: single ? 0 : 2, gapMs: single ? 0 : 260, rate: reader.rate,
      // a voice answered: the line an earlier silence left beside the control goes
      onSource: () => { if (mine.over) return; mine.voiced = true; onNote?.('', null); },
      onState: (state, code) => {
        if (mine.over) return;
        if (state === 'loading' || state === 'playing') { paint(true); mine.button?.setAttribute('aria-busy', String(state === 'loading')); }
        if (['done', 'stopped', 'error'].includes(state)) {
          mine.over = true;
          paint(false);
          mine.button?.removeAttribute('aria-busy');
          if (spoken === mine) spoken = null;
          // no sound was made: his tap is told why, in words; a read by itself says nothing
          const why = state === 'error' ? code || 'speak-failed' : state === 'done' && !mine.voiced ? 'nothing-to-say' : null;
          if (why && !automatic) onNote?.(silenceLine(why), why);
          onDone?.(state, code);
        }
      },
    });
    // the read is this control's from here: the lanes it quieted on the way in have all let go
    if (!mine.over) spoken = mine;
    return mine.session;
  }

  /* ------------------------------------------------------------------ the article reader */
  // `owner` names the read that may repaint the bar: a read that was replaced or stopped says nothing more
  const reader = { pid: null, session: null, owner: null, sentences: [], index: 0, rate: 1, failed: null, source: null };
  // The sentence being read is one unbroken wash (the CSS Custom Highlight API, as in Nihongo Study); a browser without
  // it paints the sentence's words instead. The words carry data-speaking either way.
  const view = doc.defaultView;
  const washes = view.CSS?.highlights && typeof view.Highlight === 'function' ? view.CSS.highlights : null;
  if (washes) doc.documentElement.dataset.voiceHighlight = 'range';
  const clearSpeaking = () => {
    for (const node of doc.querySelectorAll('#reader [data-speaking]')) node.removeAttribute('data-speaking');
    washes?.delete('bunki-speaking');
  };
  /** The app draws the article again (a word looked up, a dial moved): the sentences keep their text and take the new
   * page's words. False when the text itself is no longer the one being read (the other version of the story). */
  function remapReader() {
    const p = host.passage();
    if (!p || p.id !== reader.pid) return false;
    const fresh = articleSentences(p);
    if (fresh.length !== reader.sentences.length || fresh.some((sentence, i) => sentence.text !== reader.sentences[i].text)) return false;
    fresh.forEach((sentence, i) => { reader.sentences[i].els = sentence.els; });
    return true;
  }
  const stale = (sentence) => sentence.els.length > 0 && !sentence.els.some((node) => node.isConnected);
  function showSentence(index) {
    clearSpeaking();
    const sentence = reader.sentences[index];
    if (!sentence) return;
    if (stale(sentence)) remapReader();
    const shown = sentence.els.filter((node) => node.isConnected);
    for (const node of shown) node.setAttribute('data-speaking', '');
    const first = shown[0];
    if (!first) return;
    if (washes) {
      const range = doc.createRange();
      range.setStartBefore(first);
      range.setEndAfter(shown[shown.length - 1]);
      washes.set('bunki-speaking', new view.Highlight(range));
    }
    const box = first.getBoundingClientRect();
    if (box.top < 96 || box.bottom > view.innerHeight - 140)
      first.scrollIntoView({ block: 'center', behavior: view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  /** The article's sentences as they stand on the page: the text from the article's own tokens, the place from the
   * page's words. A reading printed in brackets after a word is not said twice. */
  function readerTokens(p, { annotations = false } = {}) {
    const root = doc.getElementById('reader');
    if (!root || !p?.tokens) return [];
    const rows = [];
    for (const node of root.querySelectorAll('.tok[data-index]')) {
      if (!annotations && node.dataset.readerAnnotation === 'true') continue;
      const start = Number(node.dataset.index), end = node.dataset.indexEnd !== undefined ? Number(node.dataset.indexEnd) : start;
      const text = p.tokens.slice(start, end + 1).map((token) => String(token?.s || '')).join('');
      if (text) rows.push({ node, text, block: node.closest('p.reader-prose') || root });
    }
    return rows;
  }
  function articleSentences(p) {
    const clips = host.narration?.(p) || [];
    if (clips.length) {
      // a recorded article is read clip by clip, as recorded; each clip is found on the page so it can be shown
      const rows = readerTokens(p, { annotations: true });
      let joined = '';
      const spans = rows.map((row) => { const from = joined.length; joined += row.text.replace(QUOTES, ''); return { node: row.node, from, to: joined.length }; });
      let cursor = 0;
      return clips.map((clip) => {
        const needle = String(clip.text || '').replace(QUOTES, '');
        const at = needle ? joined.indexOf(needle, cursor) : -1;
        if (at >= 0) cursor = at + needle.length;
        return { text: clip.text, recorded: { src: clip.src }, els: at < 0 ? [] : spans.filter((span) => span.from < at + needle.length && span.to > at).map((span) => span.node) };
      });
    }
    const blocks = new Map();
    for (const row of readerTokens(p)) { if (!blocks.has(row.block)) blocks.set(row.block, []); blocks.get(row.block).push(row); }
    const sentences = [];
    for (const rows of blocks.values()) {
      let joined = '';
      const spans = rows.map((row) => { const from = joined.length; joined += row.text; return { node: row.node, from, to: joined.length }; });
      let pieces = [];
      try { pieces = splitSentences(joined); } catch { /* nothing to read in this paragraph */ }
      for (const piece of pieces) sentences.push({ text: piece.text, els: spans.filter((span) => span.from < piece.end && span.to > piece.start).map((span) => span.node) });
    }
    return sentences;
  }
  const readerActive = () => !!reader.session && !reader.session.ended;
  function startReader(p, from = 0) {
    reader.pid = p.id;
    reader.sentences = articleSentences(p);
    reader.failed = null;
    if (!reader.sentences.length) { reader.failed = { pid: p.id, code: 'nothing-to-say' }; host.refreshListenRow?.(); return; }
    prime();
    const mine = {};
    reader.owner = mine;
    reader.session = null;
    const session = seam.read({
      sentences: reader.sentences, voiceKey: voiceKeyOf('article', p.id), from: Math.min(from, reader.sentences.length - 1), rate: reader.rate,
      stopRecorded: () => host.stopRecorded?.(), rateRecorded: (rate) => host.rateRecorded?.(rate),
      onSentence: (index) => {
        if (reader.owner !== mine) return;
        if (index < 0) { clearSpeaking(); return; }
        reader.index = index;
        showSentence(index);
      },
      // the bar's note names where this sentence comes from: the recording or the voice server
      onSource: (source) => {
        if (reader.owner !== mine) return;
        reader.source = { source };
        host.refreshListenRow?.();
      },
      onState: (state, code) => {
        if (reader.owner !== mine) return;
        if (state === 'done') reader.index = 0;
        if (state === 'error') reader.failed = { pid: p.id, code: code || 'failed' };
        if (['done', 'stopped', 'error'].includes(state)) clearSpeaking();
        // the first states arrive while the read is still being set up; the bar is painted once it stands (below)
        if (reader.session) host.refreshListenRow?.();
      },
    });
    if (reader.owner === mine) reader.session = session;
    host.refreshListenRow?.();
  }
  const readerApi = {
    /** What the play bar shows for this article. */
    state(p) {
      const here = reader.pid === p.id;
      const active = here && readerActive();
      const state = active ? reader.session.state : 'idle';
      const narrated = !!(host.narration?.(p) || []).length;
      // No voice for this article (a play that ended silent, or one that would): the bar says so in a few words, and
      // `line` is the whole sentence. An article with its own recording plays it, paired or not.
      const now = narrated ? null : seam.cannot(voiceKeyOf('article', p.id));
      const failed = here && reader.failed ? reader.failed.code : null;
      // a reason that passes (he paired, the minute went by, the connection came back) is read as it stands now; a
      // read that is under way names its voice until it ends
      let silent = failed && !PASSING.has(failed) ? failed : active ? null : now;
      if (silent === 'not-paired' && seam.status().pairAgain) silent = 'authentication-required';
      const brief = (reason) => reason === 'not-paired' || reason === 'not-configured' ? tx('設定でつなぐと聞けます', 'pair in Settings to hear this')
        : reason === 'authentication-required' ? tx('設定でもう一度つなぐ', 'pair again in Settings') : reasonWords(reason);
      let note;
      if (silent) note = brief(silent);
      else if (narrated) note = host.narrationVoiceName?.() || tx('収録音声', 'Recorded clip');
      else note = tx('音声サーバー', 'Voice server');
      return {
        available: true, narrated, active, playing: active && (state === 'loading' || state === 'playing'), paused: active && state === 'paused',
        loading: active && state === 'loading', index: here ? reader.index : 0,
        total: here && reader.sentences.length ? reader.sentences.length : Math.max(1, (host.narration?.(p) || []).length || 1),
        rate: reader.rate, failed: here && !!reader.failed, note, silent: silent || null, line: silent ? silenceLine(silent) : '',
      };
    },
    /** Play, pause or resume. A read that was stopped starts again at the sentence it had reached. */
    toggle(p) {
      if (reader.pid === p.id && readerActive()) {
        const state = reader.session.state;
        if (state !== 'paused') reader.session.pause();
        // the page may have been drawn again while paused; if it now shows another text, the read starts over on it
        else if (reader.sentences.some(stale) && !remapReader()) { startReader(p, 0); return; }
        else { prime(); reader.session.resume(); showSentence(reader.session.index); }
        host.refreshListenRow?.();
        return;
      }
      startReader(p, reader.pid === p.id ? reader.index : 0);
    },
    nextRate() {
      reader.rate = READER_RATES[(READER_RATES.indexOf(reader.rate) + 1) % READER_RATES.length];
      if (readerActive()) reader.session.setRate(reader.rate);
      else if (seam.active()) seam.active().setRate(reader.rate);
      return reader.rate;
    },
    stop() {
      const session = reader.session;
      reader.session = null;
      reader.owner = null;
      if (session && !session.ended) session.stop();
      clearSpeaking();
    },
    active: readerActive,
  };
  // While the article is being read, a tap on any of its words starts the reading there; paused or idle, a tap is the
  // word's own (the reading ladder), as always.
  doc.addEventListener('click', (event) => {
    if (!readerActive() || !['loading', 'playing'].includes(reader.session.state)) return;
    const word = event.target?.closest?.('#reader .tok[data-index]');
    if (!word) return;
    let index = reader.sentences.findIndex((sentence) => sentence.els.includes(word));
    if (index < 0 && reader.sentences.some(stale) && remapReader()) index = reader.sentences.findIndex((sentence) => sentence.els.includes(word));
    if (index < 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reader.session.jump(index);
  }, true);

  /* ------------------------------------------------------------------ the quiet speaker mark */
  const sheetNode = (node) => {
    const raw = node.closest('#sheet')?.dataset.node || '';
    const cut = raw.indexOf(':');
    return cut < 0 ? { type: '', id: '' } : { type: raw.slice(0, cut), id: raw.slice(cut + 1) };
  };
  const cardWord = () => doc.getElementById('card-say')?.dataset.voiceWord || '';
  const passageKey = (node) => {
    const id = node.closest('#sheet')?.querySelector('.scale-thread[data-passage-id]')?.dataset.passageId ||
      node.dataset?.sourceId || (host.view() === 'reader' ? host.passage()?.id : '') || '';
    return id ? voiceKeyOf('article', id) : null;
  };
  const sheetKey = (node) => {
    const { type, id } = sheetNode(node);
    if (type === 'word' || type === 'kanji' || type === 'idiom') return voiceKeyOf('word', id);
    if (type === 'grammar') return voiceKeyOf('word', shownText(node.closest('#sheet').querySelector('h2.headword')) || id);
    return passageKey(node) || voiceKeyOf('word', cardWord() || 'sentence');
  };
  const kanaOnly = (text) => text.replace(/[^\p{Script=Hiragana}\p{Script=Katakana}ー]/gu, '');
  /** Every place with Japanese and no listen control of its own. `at` says where the mark goes. */
  const RULES = [
    { id: 'entry-headword', find: '#sheet > h2.headword', at: 'before',
      read: (node) => {
        const { type } = sheetNode(node);
        if (type !== 'word' && type !== 'grammar' && type !== 'idiom') return null;
        const reading = type === 'grammar' ? '' : shownText(node.parentElement.querySelector(':scope > p.reading'));
        const text = reading || shownText(node).replace(/[〜～…]+/gu, '');
        return { sentences: japaneseSentences(text), voiceKey: sheetKey(node), single: true };
      } },
    { id: 'kanji-reading', find: '#sheet dl.kv[data-kanji-readings] > dd', at: 'append',
      read: (node) => ({ sentences: [...node.querySelectorAll('.reading-item')].map((item) => ({ text: kanaOnly(shownText(item)) })).filter((s) => s.text),
        voiceKey: sheetKey(node), single: false, gapMs: 320 }) },
    { id: 'example', find: '#sheet .example > p.example-ja, #sheet p.teacher-source-quote, #sheet p.sent-reader', at: 'before',
      read: (node) => ({ sentences: japaneseSentences(shownText(node)), voiceKey: sheetKey(node) }) },
    // on the card the mark follows the sentence on its own line's end, beside the ▷ that opens it: the card's face is
    // centred, and a mark standing over the sentence would be a row of its own
    { id: 'card-sentence', find: '.review-face p.review-cloze, .review-face p.review-example', at: 'append',
      when: () => host.cardRevealed(),
      read: (node) => ({ sentences: japaneseSentences(shownText(node)), voiceKey: voiceKeyOf('word', cardWord() || 'card') }) },
    { id: 'box-sentence', find: '#mini-sentence-pane p.mini-sentence-full', at: 'before',
      read: (node) => ({ sentences: japaneseSentences(shownText(node)), voiceKey: passageKey(node) || voiceKeyOf('word', 'sentence') }) },
    { id: 'quoted-sentence', find: 'main blockquote.sentence-original', at: 'after',
      when: (node) => !node.nextElementSibling?.classList.contains('excerpt-listen'),
      read: (node) => ({ sentences: japaneseSentences(shownText(node)), voiceKey: passageKey(node) || voiceKeyOf('word', 'sentence') }) },
    { id: 'tutor-turn', find: '.chat-log > p.chat-turn.tutor:not(.thinking)', at: 'append',
      read: (node) => ({ sentences: japaneseSentences(shownText(node)),
        voiceKey: voiceKeyOf('conv', `tutor-${doc.getElementById('chat-input')?.dataset.teacherContextRef || 'open'}`) }) },
    { id: 'coach', find: '.ai-answer', at: 'append',
      read: (node) => ({ sentences: japaneseSentences(shownText(node)), voiceKey: voiceKeyOf('conv', `coach-${sheetNode(node).id || host.view()}`) }) },
    { id: 'speak-line', find: '.speak-script > li.speak-line:not([data-who="me"]) .speak-said', at: 'append',
      read: (node) => ({ sentences: japaneseSentences(shownText(node.querySelector('.speak-text'))),
        voiceKey: voiceKeyOf('conv', node.closest('.speak-script')?.dataset.session || 'speak') }) },
  ];
  function makeMark(rule) {
    const mark = el('button', 'play-mark voice-say');
    mark.type = 'button';
    mark.dataset.voiceSay = rule.id;
    mark.dataset.japaneseLookup = 'off';
    mark.setAttribute('aria-label', tx('聞く', 'Listen'));
    mark.title = tx('聞く', 'Listen');
    mark.append(uiIcon('speaker'));
    return mark;
  }
  /** corridor.js says a word page was opened by the learner's own act (not a return to it, not a page restored, and
   * not from that word's own box, which has just said it): its headword says itself once when the page stands. */
  let openedPage = null; // { node: 'word:<id>', at }
  // a mark placed before its text may have its no-voice line (noteBeside) standing between the two
  const markOf = (node, at) => {
    let near = at === 'before' ? node.previousElementSibling : at === 'after' ? node.nextElementSibling : node.querySelector(':scope > .voice-say');
    if (at === 'before' && near?.classList?.contains('voice-note')) near = near.previousElementSibling;
    return near?.classList?.contains('voice-say') ? near : null;
  };
  const dropMark = (mark) => { if (mark.nextElementSibling?.classList?.contains('voice-note')) mark.nextElementSibling.remove(); mark.remove(); };
  function mountMarks(root = doc) {
    // a line whose mark has gone (the app drew its text again) goes with it
    for (const note of root.querySelectorAll('.voice-note')) if (!note.previousElementSibling?.matches?.('.voice-say, .kp-word, .excerpt-listen')) note.remove();
    for (const rule of RULES) {
      for (const node of root.querySelectorAll(rule.find)) {
        const have = markOf(node, rule.at);
        if (rule.when && !rule.when(node)) { if (have) dropMark(have); continue; }
        if (have) continue;
        let plan = null;
        try { plan = rule.read(node); } catch { /* a surface that changed shape gets no mark */ }
        if (!plan?.sentences?.length) continue;
        node.dataset.voiceHost = rule.id;
        const mark = makeMark(rule);
        mark.addEventListener('click', (event) => {
          event.stopPropagation();
          let now = null;
          try { now = rule.read(node); } catch { /* the surface went */ }
          if (!now?.sentences?.length) return;
          speakFrom(mark, { ...now, onNote: (line) => { mark.title = line || tx('聞く', 'Listen'); noteBeside(mark, line); } });
        });
        if (rule.at === 'before') node.before(mark);
        else if (rule.at === 'after') node.after(mark);
        else node.append(mark);
        // the word page he has just opened says its word once, as its mark arrives (opened(), below)
        if (rule.id === 'entry-headword' && openedPage) {
          const page = openedPage;
          const sheet = node.closest('#sheet');
          if (sheet?.dataset.node === page.node) {
            openedPage = null;
            if (Date.now() - page.at < 5000 && host.bySelf?.()) speakFrom(mark, { ...plan, automatic: true });
          }
        }
      }
    }
    mountStudyCard(root);
  }
  /** The study card keeps its own look: one more of its own small buttons, on the answer side only. Its answer says
   * its word once as it is shown (John's "on reveal"), unless he switched that off. */
  let saidCard = null; // the card whose answer was last shown: said once, not at every redraw of that answer
  function mountStudyCard(root) {
    for (const card of root.querySelectorAll('.kp .kp-card')) {
      const answer = card.querySelector('.kp-answer');
      const row = card.querySelector('.kp-eyebrow');
      const have = card.querySelector('.kp-listen');
      if (!answer || !row) {
        // the question side: no control stands there, and the answer shown next is a new one to say
        for (const stale of card.querySelectorAll('.kp-listen, .voice-note')) stale.remove();
        if (!answer) saidCard = null;
        continue;
      }
      if (have) continue;
      const sentence = card.querySelector('.kp-sentence .kp-s[data-focus="1"]') || card.querySelector('.kp-sentence');
      const term = shownText(card.querySelector('.kp-term'));
      const reading = shownText(card.querySelector('.kp-reading')) || term;
      const key = voiceKeyOf('word', term || card.dataset.card || 'card');
      const word = answer.querySelector('.kp-word');
      // one plain line for the card's two controls, on its own row under the word
      const note = (line) => {
        let at = word?.nextElementSibling?.classList?.contains('voice-note') ? word.nextElementSibling : null;
        if (!at && line && word) {
          at = el('span', 'say-note voice-note');
          at.setAttribute('role', 'status');
          at.dataset.japaneseLookup = 'off';
          word.after(at);
        }
        if (at) at.textContent = line || '';
      };
      const button = (label, read) => {
        const control = el('button', 'kp-zoom-btn kp-listen', label);
        control.type = 'button';
        control.addEventListener('click', (event) => {
          event.stopPropagation();
          speakFrom(control, { sentences: read(), voiceKey: key, onNote: (line) => { control.title = line || ''; note(line); } });
        });
        return control;
      };
      const listen = button(tx('聞く', 'Listen'), () => japaneseSentences(shownText(sentence)));
      listen.id = 'kp-listen';
      listen.setAttribute('aria-label', tx('この文を聞く', 'Listen to this sentence'));
      row.append(listen);
      if (word && reading) {
        const say = button(tx('音', '音'), () => [{ text: reading }, ...japaneseSentences(shownText(answer.querySelector('.kp-def'))), ...japaneseSentences(shownText(answer.querySelector('.kp-note-passage')))].filter((s) => isJapaneseEnough(s.text)));
        say.id = 'kp-listen-word';
        say.lang = 'ja';
        say.setAttribute('aria-label', tx('語と説明を聞く', 'Listen to the word and its definition'));
        word.append(say);
        // the answer shown: its word, once, through the voice server or not at all
        const shown = card.dataset.card || term;
        if (saidCard !== shown) {
          saidCard = shown;
          if (host.bySelf?.() && isJapaneseEnough(reading)) speakFrom(say, { sentences: [{ text: reading }], voiceKey: key, single: true, automatic: true });
        }
      }
    }
  }
  /* ------------------------------------------------------------------ the ear (modules/ear.mjs, 2026-11-11) */
  // one gesture that speaks any Japanese on any screen, through this seam and nothing else; its mark stands beside every
  // gate. A sentence of an article keeps the article's key, and text a listen mark reads keeps that mark's key.
  const markKey = (node) => {
    const at = node?.closest?.('[data-voice-host]');
    const rule = at && RULES.find((one) => one.id === at.dataset.voiceHost);
    try { return rule ? rule.read(at)?.voiceKey || null : null; } catch { return null; }
  };
  const ear = installEar({
    doc, tx,
    speak: (unit, done) => {
      prime();
      return seam.read({ sentences: unit.sentences, voiceKey: unit.voiceKey, prefetch: unit.sentences.length > 1 ? 2 : 0, gapMs: 260, rate: reader.rate,
        onState: (state, code) => { if (['done', 'stopped', 'error'].includes(state)) done(state, code); } });
    },
    cannot: (unit) => seam.cannot(unit.voiceKey),
    context: () => ({ view: host.view(), keyFor: markKey,
      articleOf: (node) => (host.view() === 'reader' && node?.closest?.('#reader') ? host.passage()?.id || null : null),
      // a study card's front (a review card before its answer, a deck card on its question side)
      cardFront: (node) => {
        if (node?.closest?.('.review-face')) return !host.cardRevealed();
        const card = node?.closest?.('.kp .kp-card');
        return !!card && !card.querySelector('.kp-answer');
      } }),
  });
  let scan = 0;
  const rescan = () => {
    if (scan) return;
    scan = doc.defaultView.setTimeout(() => {
      scan = 0;
      mountMarks(doc);
      // A read belongs to its control. The control drawn again (the same one, of the same word) takes the read over;
      // when the control's screen has gone, the read ends.
      if (spoken?.button && !spoken.button.isConnected) {
        const again = spoken.find?.();
        if (again) spoken.adopt(again);
        else { const gone = spoken; spoken = null; if (gone.session && !gone.session.ended) gone.session.stop(); }
      }
      ear.mount();
    }, 60);
  };
  new doc.defaultView.MutationObserver(rescan).observe(doc.body, { childList: true, subtree: true });
  rescan();

  /* ------------------------------------------------------------------ Settings: pairing and the status line */
  const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
  const DAY_KEY = 'kairo-voice-day'; // the total as this device first saw it today: two numbers and a time, no secret
  const PAIR_LINES = {
    'invalid-pairing': ['コードか学習者IDの形が違います。確かめてもう一度。', 'That does not look like a pairing code and learner id. Check them and try again.'],
    'authentication-required': ['コードが違うか、使用済みか、期限切れです。デスクトップの「Bunki Voice」をもう一度実行してください。', 'That code is wrong, already used or expired. Run “Bunki Voice” on the Desktop again for a new one.'],
    'installation-exists': ['このコードの端末はすでに接続済みです。デスクトップの「Bunki Voice」をもう一度実行してください。', 'That code belongs to an install that is already paired. Run “Bunki Voice” on the Desktop again for a new one.'],
    'authentication-rate-limit': ['試行が多すぎます。1分待ってください。', 'Too many tries. Wait one minute.'],
    'pairing-unavailable': ['いま音声サーバーはつなげません。数分後にもう一度。', 'The voice server can’t pair right now. Try again in a few minutes.'],
    'network-failed': ['音声サーバーに届きませんでした。接続を確かめてください。', 'Could not reach the voice server. Check the connection.'],
    'voice-timeout': ['音声サーバーの返事が遅すぎました。もう一度。', 'The voice server took too long. Try again.'],
    'server-missing': ['この端末はまだ音声サーバーの住所を知りません。「Bunki voice code:」で始まる1行をそのまま貼ってください。',
      'This device does not know the voice server’s address yet. Paste the whole line that starts “Bunki voice code:”.'],
  };
  const pairLine = (code) => tx(...(PAIR_LINES[code] || ['接続できませんでした。もう一度。', 'Pairing did not work. Try again.']));
  function statusLines(status) {
    let state;
    if (status.paired) state = tx(`音声サーバーに接続済み（端末 …${status.installation.slice(-4)}）。`, `Paired with the voice server (install …${status.installation.slice(-4)}).`) +
      (status.durable ? '' : tx(' このブラウザは保存できないため、今回の利用だけ有効。', ' This browser could not keep it, so it lasts for this visit only.'));
    else if (status.pairAgain) state = tx('音声サーバーがこの接続を終了しました。新しいコードでもう一度つないでください。', 'The voice server ended this pairing. Pair Bunki again with a new code.');
    else state = tx('未接続。つなぐまで声は出ません（記事の収録音声を除く）。', 'Not paired. Nothing is spoken until you pair, except an article’s own recording.');
    // paired, and the server is not answering for a reason that lasts: the same plain line a control gives
    const blocked = ['day-budget', 'budget-exhausted', 'not-in-release', 'request-rate-limit'].includes(status.blocked) ? silenceLine(status.blocked) : '';
    const clock = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const said = status.last.source === 'none' ? remembered() : status.last;
    // the newest thing that happened: a sentence spoken, or a tap that found no voice, and why
    const last = status.silent && (!said || status.silent.at >= said.at)
      ? tx(`最後のタップ：声なし（${reasonWords(status.silent.reason)}、${clock(status.silent.at)}）`, `Last tap: no voice (${reasonWords(status.silent.reason)}), at ${clock(status.silent.at)}.`)
      : !said ? tx('最後に読んだ文：まだありません。', 'Last sentence: nothing spoken yet.')
        : tx(`最後に読んだ文：${sourceLine(said.source)}（${clock(said.at)}）`, `Last sentence: ${sourceLine(said.source).replace(/^./, (c) => c.toLowerCase())}, at ${clock(said.at)}.`);
    const budget = status.budget
      ? tx(`音声の予算：${dollars(status.budget.capCents)} のうち ${dollars(status.budget.spentCents)} 使用、残り ${dollars(status.budget.remainingCents)}（Nihongo Study と共通）。`,
        `Voice budget: ${dollars(status.budget.spentCents)} of ${dollars(status.budget.capCents)} used, ${dollars(status.budget.remainingCents)} left (shared with Nihongo Study).`)
      : status.paired ? tx('音声の予算：確認中…', 'Voice budget: checking…') : tx('音声の予算：接続すると表示されます。', 'Voice budget: shown once paired.');
    // today's spend beside the budget, so a session's cost can be read off
    let today = '';
    if (status.budget) {
      let kept = null;
      try { kept = JSON.parse(view.localStorage.getItem(DAY_KEY)); } catch { /* nothing kept */ }
      const spend = daySpend(status.budget, kept);
      if (spend.keep && (!kept || kept.day !== spend.keep.day || kept.spentCents !== spend.keep.spentCents)) {
        try { view.localStorage.setItem(DAY_KEY, JSON.stringify(spend.keep)); } catch { /* counted for this page only */ }
      }
      const cap = dollars(spend.capCents ?? 300);
      today = spend.since === null
        ? tx(`今日：${dollars(spend.spentCents)}（上限は1日${cap}、${newDay()}に戻ります）。`, `Today: ${dollars(spend.spentCents)} of ${cap}. The day starts again at ${newDay()}.`)
        : tx(`今日：${dollars(spend.spentCents)}（この端末で${clock(spend.since)}から数えた分。上限は1日${cap}、${newDay()}に戻ります）。`,
          `Today: ${dollars(spend.spentCents)} since ${clock(spend.since)}, counted on this device. The limit is ${cap} a day and starts again at ${newDay()}.`);
    }
    return { state: blocked && status.paired ? `${state} ${blocked}` : state, last, budget, today };
  }
  /** The block under Settings, 筆と声: paired or not, where the last sentence came from, the budget, and the pairing form. */
  function settingsBlock() {
    const block = el('div', 'settings-voice-server');
    block.id = 'settings-voice-server';
    const name = el('p', 'settings-writing-name', tx('音声サーバー — 収録音声、次に音声サーバー。ほかの声は使いません', 'Voice server — a recorded clip first, then the voice server. No other voice is used'));
    const state = el('p', 'teacher-note'); state.id = 'voice-status'; state.setAttribute('role', 'status');
    const last = el('p', 'teacher-note'); last.id = 'voice-last';
    const budget = el('p', 'teacher-note'); budget.id = 'voice-budget';
    const today = el('p', 'teacher-note'); today.id = 'voice-today';
    const form = el('form', 'listening-form settings-report-form'); form.id = 'voice-pair-form'; form.noValidate = true;
    const field = (id, ja, en, attrs) => {
      const wrap = el('div');
      const label = el('label', '', tx(ja, en)); label.htmlFor = id;
      const input = el('input', 'chat-field'); input.id = id; input.type = 'text';
      input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off');
      Object.assign(input, attrs);
      wrap.append(label, input);
      return { wrap, input };
    };
    const learner = field('voice-pair-learner', '学習者ID（または表示された1行）', 'Learner id (or the whole pairing line)', { maxLength: 400 });
    const code = field('voice-pair-code', '接続コード（12文字）', 'Pairing code (12 characters)', { maxLength: 24 });
    const submit = el('button', 'chip', tx('つなぐ', 'Pair')); submit.type = 'submit'; submit.id = 'voice-pair-submit';
    const note = el('p', 'teacher-note'); note.id = 'voice-pair-note'; note.setAttribute('role', 'status');
    // the speech team's launcher on John's Desktop is "Bunki Voice"; its pairing step prints the one line (release, 22:25)
    const how = el('p', 'teacher-note', tx('デスクトップの「Bunki Voice」を実行すると「Bunki voice code:」で始まる1行が出ます。その1行をそのまま最初の欄に貼って「つなぐ」。コードは10分で切れます。',
      'Run “Bunki Voice” on the Desktop. It prints one line that starts “Bunki voice code:”. Paste that whole line into the first box and press Pair. The code lasts 10 minutes.'));
    how.id = 'voice-pair-how';
    form.append(how, learner.wrap, code.wrap, submit, note);
    const forget = el('button', 'btn-tertiary', tx('この端末の接続を消す', 'Forget the pairing on this device')); forget.type = 'button'; forget.id = 'voice-unpair';
    const refresh = el('button', 'btn-tertiary', tx('予算を更新', 'Refresh the budget')); refresh.type = 'button'; refresh.id = 'voice-budget-refresh';
    let busy = false;
    const paint = (status = seam.status()) => {
      if (!block.isConnected && block.dataset.mounted) { listeners.delete(paint); return; }
      const lines = statusLines(status);
      state.textContent = lines.state; last.textContent = lines.last; budget.textContent = lines.budget;
      today.textContent = lines.today; today.hidden = !lines.today;
      block.dataset.paired = String(status.paired); block.dataset.configured = String(status.configured);
      block.dataset.lastSource = status.last.source;
      block.dataset.silent = status.silent?.reason || '';
      form.hidden = status.paired;
      forget.hidden = !status.paired; refresh.hidden = !status.paired;
      submit.disabled = busy;
    };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true; paint();
      note.textContent = tx('つないでいます…', 'Pairing…');
      const answer = await client.pair({ learner: learner.input.value, code: code.input.value });
      busy = false;
      if (answer.ok) {
        learner.input.value = ''; code.input.value = '';
        note.textContent = '';
        seam.repaired();
        void seam.refreshBudget();
        host.refreshListenRow?.();
      } else note.textContent = pairLine(answer.code);
      paint();
    });
    forget.addEventListener('click', async () => { seam.stop(); await client.forget(); seam.repaired(); note.textContent = ''; paint(); host.refreshListenRow?.(); });
    refresh.addEventListener('click', () => { budget.textContent = tx('音声の予算：確認中…', 'Voice budget: checking…'); void seam.refreshBudget(); });
    block.append(name, state, last, budget, today, form, refresh, forget);
    listeners.add(paint);
    paint();
    doc.defaultView.setTimeout(() => { block.dataset.mounted = '1'; }, 0);
    void client.ready().then(() => { paint(); if (client.paired()) void seam.refreshBudget(); });
    return block;
  }

  return {
    reader: readerApi,
    settingsBlock,
    status: () => seam.status(),
    onStatus: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    /** A single word or reading from one of the app's own 音 buttons. */
    sayWord({ text, word, button, onNote, automatic = false }) {
      let normal = '';
      try { normal = normaliseSpeechText(String(text || '')); } catch { /* nothing to say */ }
      return speakFrom(button, { sentences: normal ? [{ text: normal }] : [], voiceKey: voiceKeyOf('word', word || normal), single: true, onNote, automatic });
    },
    /** The quote chip: the excerpt through the seam when the article has no recording of it. With no voice the reason
     * stands in one line beside the chip. */
    sayExcerpt({ text, sourceId, button, onNote = (line) => noteBeside(button, line) }) {
      return speakFrom(button, { sentences: japaneseSentences(text), voiceKey: sourceId ? voiceKeyOf('article', sourceId) : voiceKeyOf('word', 'sentence'), onNote });
    },
    /** Whether a word could be voiced right now. A read that would start by itself asks first (corridor.js), so that
     * with no voice to be had it stops no other sound. */
    canSay: () => !seam.cannot(),
    /** A word page opened by the learner's own act: its headword says itself once when the page stands (mountMarks). */
    opened(node) { openedPage = node?.t && node.id != null ? { node: `${node.t}:${node.id}`, at: Date.now() } : null; },
    /** Every sound of the layer ends: the screen changed. `keepReader` leaves an article's read to the reader's own rule. */
    stop({ keepReader = false } = {}) {
      if (!keepReader) readerApi.stop();
      if (spoken) { const was = spoken; spoken = null; if (was.session && !was.session.ended) was.session.stop(); }
      else if (!keepReader || !readerActive()) seam.stop();
    },
    speaking: () => !!seam.active(),
    mount: mountMarks,
    rates: SPEEDS,
  };
}
