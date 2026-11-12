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
import { answerReads, deckFrontVoice, reviewFrontVoice } from './card-audio.mjs';
import { EAR_SLOW, installEar } from './ear.mjs';
import { baseBoxes, createBands } from './voice-bands.mjs';
import { createClipStore, createIndexedDbClipStorage } from './voice-clip-store.mjs';
import { createDeviceTokenStore, createVoiceClient } from './voice-client.mjs';
import { createPocketPlayer, createReaderMediaSession, gapSleep, pageTimer } from './reader-pocket.mjs';
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

/** What one word's control asks of the seam: the text in its canonical form and the word's voice key. His tap on 音 and
 * the answer saying itself ask the same, so they share one kept clip (B3). */
export function wordVoiceRequest(text, word = '') {
  let normal = '';
  try { normal = normaliseSpeechText(String(text || '')); } catch { /* nothing to say */ }
  return { text: normal, voiceKey: voiceKeyOf('word', word || normal) };
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

/** The voice server's ceilings as far as it has said them (the seam's status): its budget answer first, then a
 * refusal's own figure. Bunki holds none of its own (the server's are set by the owner: 10,000 cents in total and
 * 1,000 a day, or 30,000 and 3,000); null where the server has said nothing. */
export function voiceLimits(status) {
  const cents = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
  return {
    dayCapCents: cents(status?.budget?.dayCapCents) ?? cents(status?.limits?.dayCapCents),
    capCents: cents(status?.budget?.capCents) ?? cents(status?.limits?.capCents),
  };
}
const amount = (cents) => { const n = cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100); return { ja: `${n}ドル`, en: `$${n}` }; };
/** The no-voice line for a limit reached, { ja, en }: the amount the server said, or no amount at all when it said none.
 * `at` is when the voice comes back (the server's new day, in this device's own time). */
export function limitLine(reason, limits, at) {
  const day = limits?.dayCapCents ?? null, total = limits?.capCents ?? null;
  if (reason === 'day-budget') {
    return day === null
      ? { ja: `声を出せません。今日の音声の上限を使いました。声は${at}に戻ります。`, en: `No voice: today’s voice limit is used. The voice comes back at ${at}.` }
      : { ja: `声を出せません。今日の${amount(day).ja}分を使いました。声は${at}に戻ります。`, en: `No voice: today’s ${amount(day).en} is used. The voice comes back at ${at}.` };
  }
  return total === null
    ? { ja: '声を出せません。音声の予算の合計を使い切りました。', en: 'No voice: the voice budget’s total is used.' }
    : { ja: `声を出せません。合計${amount(total).ja}を使い切りました。`, en: `No voice: the ${amount(total).en} total is used.` };
}

export function installVoiceLayer(host) {
  const { tx, el, uiIcon } = host;
  const doc = host.document || document;
  // the one audio element, as an article read in his pocket needs it (L1, modules/reader-pocket.mjs): a pause nobody in
  // this app asked for is told, and a read that waits for its next clip on a hidden page holds the element with silence
  const speechPlayer = createAudioPlayer(doc);
  const audio = doc.querySelector('audio[data-speak-audio]');
  // the clock of every deadline in the path to the next sentence (the client's 20 s, the device store's 1.5 s): a timer,
  // and the wall clock read at every tick of this element and every change of visibility, so a hidden page's held timers
  // never leave a read waiting without end (L1 fix round 1)
  const clock = pageTimer({ doc, ticks: audio });
  // the client knows no server until a pairing line brings its address (voice-client.mjs)
  const client = createVoiceClient({ store: createDeviceTokenStore(globalThis), after: clock });
  let heldSilence = null;
  const pocket = createPocketPlayer({ player: speechPlayer, audio, silence: () => (heldSilence ||= silenceUrl(doc.defaultView)),
    // a clip the browser will not let start (a locked phone may refuse) pauses the article's read at its sentence, so
    // the lock screen's play takes it up; any other read fails as before
    refusalIsPause: () => readerActive() && seam.active() === reader.session,
    // his read is paused: the element started by nobody in this app is paused again at once (fix round 1)
    heldPaused: () => readerActive() && seam.active() === reader.session && reader.session.state === 'paused' });
  const player = pocket.player;
  /** The play bar and the lock screen say what the article reader is doing: every change of the read repaints both. */
  const barChanged = () => { host.refreshListenRow?.(); syncMedia(); };
  let primed = false;
  const listeners = new Set();
  // where the last sentence came from outlives a reload of this tab (the status line in Settings); nothing else is kept
  const LAST = 'kairo-voice-last';
  const remembered = () => {
    // (a tab that ran an earlier build may still hold a stand-in voice's row: only a real voice counts)
    try { const row = JSON.parse(doc.defaultView.sessionStorage.getItem(LAST)); return row && ['server', 'recorded'].includes(row.source) && Number.isFinite(row.at) ? row : null; } catch { return null; }
  };
  // heard clips, kept on this device (B3): played first, at once and offline; its index is read now, so a read by itself
  // can tell whether a kept clip is there
  const clips = createClipStore({ storage: createIndexedDbClipStorage(globalThis) });
  void clips.ready();
  const seam = createVoiceSeam({
    client, player, store: clips,
    // between two sentences nothing waits on a timer while the page is hidden (L1): a hidden page's timers stop; the
    // retry after a 503 waits on the same gap, and the device store's wait is the page's clock (fix round 1)
    gapSleep: gapSleep(doc),
    after: clock,
    recorded: (src, rate) => host.playRecorded(src, rate),
    quiet: () => host.quiet(),
    onStatus: (status) => {
      if (status.last.source !== 'none') { try { doc.defaultView.sessionStorage.setItem(LAST, JSON.stringify(status.last)); } catch { /* kept for this page only */ } }
      for (const listener of listeners) { try { listener(status); } catch { /* a listener's own fault */ } }
    },
  });
  // a paired device reads the budget (free) as the app opens, so a line naming a limit names the server's own figure,
  // not a guess, whether or not Settings has been opened in this visit
  void client.ready().then(() => {
    for (const listener of listeners) listener(seam.status());
    host.refreshListenRow?.();
    if (client.paired()) void seam.refreshBudget();
  });

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
  // the two limits are the speech team's (one budget for both apps): only the server's own figures, never a guess
  const limitWords = (reason) => { const words = limitLine(reason, voiceLimits(seam.status()), newDay()); return tx(words.ja, words.en); };
  /** Why there is no voice, in one plain line: what a listen control says when it makes no sound. */
  /** "Not paired" after the server ended the pairing (a 401) is that 401's reason, whoever saw it (the combine's I13). */
  const told = (reason) => (reason === 'not-paired' && seam.status().pairAgain ? 'authentication-required' : reason);
  const silenceLine = (reason) => {
    switch (told(reason)) {
      case 'not-paired': case 'not-configured':
        return tx('声を出せません。設定の「筆と声」で音声サーバーとつなぐ。', 'No voice here. Pair the voice server in Settings, Writing and voice.');
      case 'authentication-required':
        return tx('声を出せません。音声サーバーがこの接続を終了しました。設定の「筆と声」でもう一度つなぐ。',
          'No voice: the voice server ended this pairing. Pair again in Settings, Writing and voice.');
      case 'offline': case 'network-failed':
        return tx('声を出せません。音声サーバーに届きません。接続を確かめて、もう一度。', 'No voice: the voice server is out of reach. Check the connection, then tap again.');
      case 'day-budget': case 'budget-exhausted':
        return limitWords(reason);
      case 'not-in-release':
        return tx('声を出せません。音声サーバーはいま新しい文を受け付けていません。', 'No voice: the voice server is not taking new sentences right now.');
      case 'request-rate-limit':
        return tx('声を出せません。1分あたりの新しい文が多すぎました。1分ほど待って、もう一度。', 'No voice: too many new sentences in one minute. Wait about a minute, then tap again.');
      case 'voice-unavailable': case 'voice-timeout':
        return tx('声を出せません。音声サーバーが混んでいます。もう一度。', 'No voice: the voice server is busy. Tap to try again.');
      case 'nothing-to-say': case 'not-japanese':
        return tx('ここには読み上げられる日本語がありません。', 'Nothing here can be read aloud.');
      // a clip that would not play (the speech queue names every failed play 'decode'): the clip is not kept any more, and
      // the next tap asks again (voice-seam.mjs). It is not the server refusing (the combine's review). A start the
      // browser does not allow (NotAllowedError) during the article's read is a pause instead (reader-pocket.mjs, L1)
      case 'audio-error': case 'decode':
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
    decode: tx('再生エラー', 'could not play'),
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

  /** Whether `button` is saying a turn its own tap started (not a read that started by itself). */
  const tapSpeaking = (button) => !!button && spoken?.button === button && !spoken.automatic && !!spoken.session && !spoken.session.ended;

  /** A read by itself held while the page is hidden: run when the page is shown again (a newer one replaces it). */
  let heldUntilShown = null;
  const whenShown = (run) => { heldUntilShown = run; };
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden || !heldUntilShown) return;
    const run = heldUntilShown;
    heldUntilShown = null;
    run();
  });

  /** Speak `sentences` from `button`: a second tap stops it; whatever else was speaking ends first. With no voice to be
   * had it makes no sound and hands `onNote` the reason in one plain line (and '' again once a voice answers).
   * `automatic`: the read was not started by the learner's tap (a card's answer or an opened word saying itself): it
   * does not start at all when it could not be voiced, so it stops no other sound, and it never shows a line.
   * `toggle`: false for a read the app starts that is not a tap (the Speak room's line); `rate` overrides the reader's. */
  function speakFrom(button, request) {
    const { sentences, voiceKey, single = false, onNote = null, onDone = null, automatic = false, toggle = true, rate = null } = request;
    // his second tap on a control that is speaking its own turn stops it. A read by itself (the answer's word said as it
    // is shown) is nobody's tap: a tap then ends it and starts the control's own turn from the top (lead's ruling, 11-11).
    // A read the app starts that is not a tap (`toggle` false: the Speak room's line) never stops itself this way.
    if (!automatic && toggle && tapSpeaking(button)) { seam.stop(); return null; }
    if (!sentences.length) { if (!automatic) onNote?.(silenceLine('nothing-to-say'), 'nothing-to-say'); return null; }
    if (automatic) {
      // a read of the article is under way (or yields to a word): nothing says itself over it (John, 2026-11-11)
      if (readerBusy()) return null;
      // Nothing speaks by itself on a page he is not looking at, and nothing is asked for it. It is not used up: when the
      // page is shown again it is said if its control (its screen) still stands; otherwise it stays tappable.
      if (doc.hidden) { whenShown(() => { if (button?.isConnected) speakFrom(button, request); }); return null; }
      // a clip kept on this device is a voice to be had, connection or not
      if (seam.cannot(voiceKey, sentences[0]?.text)) return null;
      // a page nobody has touched yet may not sound: asking the server then would be paid for and never heard
      const touched = doc.defaultView.navigator?.userActivation;
      if (touched && !touched.hasBeenActive) return null;
    }
    prime();
    // a read of the article that was playing and was ended in this same tap (the word box's 音: the app ends the read
    // before the word is said) yields to the word and takes itself up again when the word ends (yieldEnded)
    const yieldFrom = automatic ? null : reader.justStopped;
    reader.justStopped = null;
    // `find`: the same control of the same word after the app has drawn its screen again (anchorOf)
    const mine = { button, session: null, over: false, voiced: false, automatic, find: anchorOf(button) };
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
      sentences, voiceKey, prefetch: single ? 0 : 2, gapMs: single ? 0 : 260, rate: rate ?? reader.rate,
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
          yieldEnded(mine);
        }
      },
    });
    // the read is this control's from here: the lanes it quieted on the way in have all let go
    if (!mine.over) spoken = mine;
    if (yieldFrom) {
      reader.yielding = { pid: yieldFrom.pid, index: yieldFrom.index, resume: !yieldFrom.paused, word: mine };
      if (mine.over) yieldEnded(mine);
      else barChanged();
    }
    return mine.session;
  }
  /** The word the read yielded to has ended (said, failed, or stopped): the read takes itself up again at the same
   * sentence, unless he paused it meanwhile, left the article, or another sound took over. A refusal is the word's own:
   * the read goes on (the seam serves the clips it already holds). A read he had paused stays paused, on the bar too:
   * it waits at its sentence for his play. */
  function yieldEnded(word) {
    const y = reader.yielding;
    if (!y || y.word !== word) return;
    reader.yielding = null;
    reader.index = y.index;
    const p = host.passage();
    if (y.resume && p && p.id === y.pid && !seam.active()) startReader(p, y.index);
    else {
      if (!y.resume && p && p.id === y.pid) reader.yielding = { pid: y.pid, index: y.index, resume: false, word: null };
      barChanged();
    }
  }

  /* ------------------------------------------------------------------ the article reader */
  // `owner` names the read that may repaint the bar: a read that was replaced or stopped says nothing more
  // `lit`: the sentence the bands are on; `yielding`: the read gave way to a word (the box's 音) and takes itself up again;
  // `justStopped`: a playing read was ended in this very task (a word said now is what it yields to); `title`: the
  // article's title, for the lock screen
  // `halted`: the read ended on a sentence it could not get or play (its reason stands on the bar); the lock screen keeps
  // the article, paused, and play takes it up at that sentence (fix round 1)
  const reader = { pid: null, session: null, owner: null, sentences: [], index: 0, rate: 1, failed: null, source: null,
    lit: -1, yielding: null, justStopped: null, title: '', halted: false };
  // The sentence being read is one even band per line (modules/voice-bands.mjs), the same in every engine: the CSS Custom
  // Highlight API painted it in patches in WebKit (John's iPhone, 2026-11-11). The words carry data-speaking.
  const view = doc.defaultView;
  const readBands = createBands(doc, { layerClass: 'read-bands', bandClass: 'read-band' });
  const highlighting = () => host.highlight?.() !== false;
  const clearSpeaking = () => {
    for (const node of doc.querySelectorAll('#reader [data-speaking]')) node.removeAttribute('data-speaking');
    reader.lit = -1;
    readBands.hide();
  };
  /** The words of the lit sentence as the page stands now: drawn again, the sentence takes the page's new words. */
  const litWords = () => {
    const sentence = reader.sentences[reader.lit];
    if (!sentence) return [];
    if (stale(sentence)) remapReader();
    const shown = sentence.els.filter((node) => node.isConnected);
    for (const node of shown) if (!node.hasAttribute('data-speaking')) node.setAttribute('data-speaking', '');
    return shown;
  };
  /** A word's box, a page, the save strip, Save's chooser or a saved place's panel stands open over the article: the reader
   * does not move the text under his finger; following takes up again with the next sentence once it has closed. */
  const coverOpen = () => !!doc.getElementById('mini')?.getClientRects().length || !!doc.getElementById('sheet')?.isConnected ||
    !!doc.getElementById('seal-strip')?.isConnected || !!doc.getElementById('vocabulary-list-popover')?.isConnected ||
    !!doc.getElementById('save-place-panel')?.isConnected;
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
  /** The bands on the lit sentence: the lit words, their paragraph, the article and the page are watched, so a change of
   * size of any of them moves the light (the ear's branch). */
  const paintLit = () => readBands.show(() => baseBoxes(litWords()), '', () => {
    const words = litWords();
    return [...words, ...words.map((node) => node.closest('p') || node.parentElement), doc.getElementById('reader'), doc.body];
  });
  function showSentence(index) {
    clearSpeaking();
    if (!reader.sentences[index]) return;
    reader.lit = index;
    const first = litWords()[0];
    if (!first) return;
    // "no highlighting at all" (Settings, 筆と声): nothing is drawn over the text; the words still carry data-speaking
    // (state, no style), the read goes on in its order, and the page follows the sentence below
    if (highlighting()) paintLit();
    if (coverOpen()) return;
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
  /** How long the ear waits for its sentence to begin sounding before it gives up on it (the client's own wait is 20 s). */
  const EAR_FIRST_CLIP_MS = 8000;
  const readerBusy = () => readerActive() || !!reader.yielding;
  let readSessions = 0;
  function startReader(p, from = 0) {
    // his play on a read that ended on a sentence it could not get: should it fail again before it sounds (the server's
    // wait after a slow answer or a lost connection, the network still gone), the lock screen keeps the article, paused,
    // as the bar keeps its play (fix round 2, the re-check's F3)
    const takenUp = reader.halted && reader.pid === p.id;
    reader.pid = p.id;
    reader.title = String(p.title || '');
    // which read this is, on the page: a read that goes on keeps its number (the checks read it)
    doc.documentElement.dataset.readSession = String(++readSessions);
    reader.sentences = articleSentences(p);
    reader.failed = null;
    reader.halted = false;
    if (!reader.sentences.length) { reader.failed = { pid: p.id, code: 'nothing-to-say' }; barChanged(); return; }
    prime();
    const mine = {};
    reader.owner = mine;
    reader.session = null;
    // whether this read has sounded: only a read he has heard keeps the lock screen when it ends on a sentence it could
    // not get (a read that never found a voice leaves nothing there)
    let voiced = false;
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
        voiced = true;
        reader.source = { source };
        // a recording plays on its own element: the silence held on this one is not needed under it
        if (source === 'recorded') pocket.letGo();
        barChanged();
      },
      onState: (state, code) => {
        if (reader.owner !== mine) return;
        if (state === 'done') reader.index = 0;
        if (state === 'error') {
          reader.failed = { pid: p.id, code: code || 'failed' };
          // the sentence it could not get (or play) is where play takes it up, not the one heard before it (fix round 1)
          if (Number.isInteger(reader.session?.index)) reader.index = reader.session.index;
          reader.halted = voiced || takenUp;
        }
        if (['done', 'stopped', 'error'].includes(state)) clearSpeaking();
        // waiting for the next clip on a hidden page, the element holds silence so the page goes on sounding (L1); a clip
        // that starts takes the element itself, and a pause or an end lets the silence go
        if (state === 'loading') { if (doc.hidden) pocket.hold(); } else if (state !== 'playing') pocket.letGo();
        // the first states arrive while the read is still being set up; the bar is painted once it stands (below)
        if (reader.session) barChanged();
      },
    });
    if (reader.owner === mine) reader.session = session;
    barChanged();
  }
  const readerApi = {
    /** What the play bar shows for this article. */
    state(p) {
      const here = reader.pid === p.id;
      // a read that yields to a word shows as playing (paused, if he paused it meanwhile)
      const y = here && reader.yielding ? reader.yielding : null;
      const active = here && (readerActive() || !!y);
      const state = y ? (y.resume ? 'playing' : 'paused') : active ? reader.session.state : 'idle';
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
      // while the read yields to a word: pause holds it where it is; play again takes it up now
      const y = reader.yielding && reader.yielding.pid === p.id ? reader.yielding : null;
      if (y) {
        if (y.resume) { y.resume = false; barChanged(); return; }
        reader.yielding = null;
        startReader(p, y.index);
        return;
      }
      if (reader.pid === p.id && readerActive()) {
        const state = reader.session.state;
        if (state !== 'paused') reader.session.pause();
        // the page may have been drawn again while paused; if it now shows another text, the read starts over on it
        else if (reader.sentences.some(stale) && !remapReader()) { startReader(p, 0); return; }
        else { prime(); reader.session.resume(); showSentence(reader.session.index); }
        barChanged();
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
      // the app ends a playing read before the word box's 音 says its word: if a word is said in this same task, the
      // read yields to it (speakFrom); otherwise it has ended (leaving the article, Back, another passage)
      const yielding = reader.yielding;
      reader.yielding = null;
      if (session && !session.ended && ['loading', 'playing', 'paused'].includes(session.state))
        reader.justStopped = { pid: reader.pid, index: reader.index, paused: session.state === 'paused' };
      else if (yielding) reader.justStopped = { pid: yielding.pid, index: yielding.index, paused: !yielding.resume };
      if (reader.justStopped) Promise.resolve().then(() => { reader.justStopped = null; });
      reader.session = null;
      reader.owner = null;
      reader.halted = false;
      if (session && !session.ended) session.stop();
      clearSpeaking();
      pocket.letGo();
      // the lock screen lets go of a read that has ended (it shows itself again if the read yields to a word now)
      syncMedia();
    },
    active: readerActive,
  };

  /* ------------------------------------------------------------------ in his pocket (L1, 2026-11-12) */
  // "An article plays through with the screen locked." Hidden, the read goes on (corridor.js ends only the other sounds);
  // between sentences nothing waits on a timer (gapSleep); a wait for a clip holds the element with silence; the lock
  // screen shows the read with play, pause, next and previous; a pause from outside is a pause.
  const icon = (name, sizes) => ({ src: new URL(name, doc.baseURI).href, sizes, type: 'image/png' });
  const media = createReaderMediaSession({ navigator: view.navigator, MediaMetadata: view.MediaMetadata,
    artwork: [icon('icon-512.png', '512x512'), icon('icon-192.png', '192x192')] });
  /** The article being read, while he is still on it. */
  const readHere = () => { const p = host.passage(); return p && p.id === reader.pid ? p : null; };
  /** One sentence on or back, from the lock screen. A read paused there stays paused, at its new sentence. */
  function step(by) {
    if (!readerActive()) return;
    const at = reader.session.index, to = Math.min(Math.max(0, at + by), reader.sentences.length - 1);
    if (by > 0 && to === at) return;
    reader.session.jump(to);
    reader.index = to;
    if (reader.session.state === 'paused') showSentence(to);
    // the clip of the new sentence is still on its way: a hidden page holds the element with silence meanwhile
    else if (reader.session.state === 'loading' && doc.hidden) pocket.hold();
    barChanged();
  }
  const mediaActions = {
    play: () => {
      const p = readHere(), y = reader.yielding;
      // a read that ended on a sentence it could not get is taken up at that sentence, as the bar's play does
      if (p && ((y && !y.resume) || (!y && readerActive() && reader.session.state === 'paused') || (!y && !readerActive() && reader.halted))) readerApi.toggle(p);
    },
    pause: () => {
      const p = readHere(), y = reader.yielding;
      if (p && ((y && y.resume) || (!y && readerActive() && reader.session.state !== 'paused'))) readerApi.toggle(p);
    },
    nexttrack: () => step(1),
    previoustrack: () => step(-1),
  };
  /** While a read exists (playing or paused, or giving way to a word) the lock screen shows it. A read that ended on a
   * sentence it could not get stays there too, paused, while he is on the article (the bar offers its play): its play
   * takes it up at that sentence (fix round 1). Otherwise it is clear. */
  function syncMedia() {
    const y = reader.yielding;
    if (!readerActive() && !y) {
      if (reader.halted && readHere()) media.show({ title: reader.title, playing: false, actions: mediaActions });
      else media.clear();
      return;
    }
    media.show({ title: reader.title, playing: y ? !!y.resume : reader.session.state !== 'paused', actions: mediaActions });
  }
  // A pause nobody in this app asked for (a call, another app's sound, the lock screen's own button, headphones out): the
  // read is paused at its sentence, and the bar and the lock screen say so; nothing takes it up again by itself.
  pocket.onOutsidePause(() => {
    const y = reader.yielding;
    // the read had given way to a word or the ear: that voice ends, and the read waits paused at its sentence for his play
    if (y) { if (y.resume) { y.resume = false; if (seam.active()) seam.stop(); barChanged(); } return; }
    if (!readerActive() || seam.active() !== reader.session) return;
    if (reader.session.state === 'playing' || reader.session.state === 'loading') reader.session.pause();
  });
  doc.addEventListener('visibilitychange', () => {
    if (!readerActive()) return;
    const state = reader.session.state;
    if (doc.hidden) { if (state === 'loading') pocket.hold(); return; }
    if (state === 'loading') pocket.letGo();
    // shown again: the sentence being read is lit and the page is at it (showSentence leaves the page still under an open
    // word box), and the bar says where the read is
    if (reader.lit >= 0) showSentence(reader.lit);
    barChanged();
  });
  // A tap on a word while the article is being read is the word's own, as when it is idle: its box opens, Save and the
  // lists work, and the read goes on. Only the pause control stops it (John, 2026-11-11: "when i hit play, the only
  // thing that should stop that is hitting the pause button itself").

  /** The review card's own sentence on the answer side, as sentences to read (none when the card has no sentence). */
  const cardSentence = () => { const node = doc.querySelector('.review-face p.review-cloze'); return node ? japaneseSentences(shownText(node)) : []; };

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
    // The card's own sentence has no mark of its own any more: the card's one control (#card-say) says the word and then
    // that sentence. The other sentences, opened under the fold (more), keep a quiet mark at their line's end, beside the ▷.
    { id: 'card-example', find: '.review-face p.review-example', at: 'append',
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
    for (const note of root.querySelectorAll('.voice-note')) if (!note.previousElementSibling?.matches?.('.voice-say, .kp-word, .excerpt-listen, .card-voice')) note.remove();
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
        // the card's other sentences (under its fold) are part of the card: their mark only speaks, as the card's control does
        if (rule.id === 'card-example') onlyItsOwn(mark);
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

  /* ------------------------------------------------------------------ the Speak room's lines (B4) */
  let roomRead = null;
  /** Her line in the Speak room (speak.js, speakThenListen), said through the seam before the room listens: her
   * Japanese, through a kept clip or the voice server, otherwise nothing. Resolves { state, code, line } when the read
   * ends ('done', 'stopped' or 'error'); `line` is the plain line saying why no voice was had, for the room to show. */
  function sayLine({ sentences = [], conversation = 'speak', rate = 1, node = null } = {}) {
    return new Promise((resolve) => {
      let session = null;
      let line = '';
      let settled = false;
      const end = (state, code) => {
        if (settled) return;
        settled = true;
        if (roomRead && roomRead === session) roomRead = null;
        resolve({ state, code: code || null, line });
      };
      if (!Array.isArray(sentences) || !sentences.length) { end('error', 'nothing-to-say'); return; }
      // nothing is asked or said on a page he is not looking at (the room waits for the page to be shown: speak.js)
      if (doc.hidden) { end('stopped'); return; }
      // her line's mark stands before her voice starts, so it shows that she is speaking
      mountMarks(doc);
      const mark = node?.isConnected ? markOf(node, 'append') : null;
      session = speakFrom(mark, { sentences, voiceKey: voiceKeyOf('conv', conversation), rate, toggle: false,
        onNote: (text) => { if (text) line = text; }, onDone: end });
      if (!session) { end('error', 'not-started'); return; }
      if (!settled) roomRead = session;
    });
  }

  /** A study card's audio control does its own act and nothing else (fix round 1 of the card audio, 2026-11-11): a press
   * on it never reaches the card (a practice block turns its face over on any click; the deck reveals on Space or Enter);
   * a pointer or touch press leaves no focus on it, so Space and Enter go on turning and grading the card as before the
   * press; and when a keyboard user has tabbed to it, Space or Enter presses it and goes no further. */
  function onlyItsOwn(control) {
    control.addEventListener('mousedown', (event) => event.preventDefault());
    control.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.detail && doc.activeElement === control) control.blur();
    });
    control.addEventListener('keydown', (event) => {
      if ((event.key !== ' ' && event.key !== 'Enter') || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) control.click();
    });
    control.addEventListener('keyup', (event) => { if (event.key === ' ') event.preventDefault(); });
    return control;
  }
  /** The quiet speaker of a study card (John, 2026-11-11: "the gawdy buttons more subtle, and simplified"): a hairline
   * glyph in the secondary ink of what surrounds it, no seal, circle, box or shadow; the accent only while it speaks. */
  const cardMark = (id) => {
    const control = el('button', 'card-voice');
    control.type = 'button';
    control.id = id;
    control.dataset.japaneseLookup = 'off';
    control.append(uiIcon('speaker'));
    return onlyItsOwn(control);
  };
  /** What each deck card's question-side control says ({ text, voiceKey }): the ear says the same on the marked word. */
  const frontSays = new WeakMap();
  /** The study card has ONE audio control on each face. Answer side: it says the word by the card's reading, then the card's
   * sentence, then the definition and the note (what the old 聞く and 音 said between them), in one turn; a second tap stops
   * it. Its word says itself once as the answer is shown (John's "on reveal"), unless he switched that off. */
  let saidCard = null; // the card whose answer was last shown: said once, not at every redraw of that answer
  function mountStudyCard(root) {
    for (const card of root.querySelectorAll('.kp .kp-card')) {
      const answer = card.querySelector('.kp-answer');
      if (!answer) { mountDeckFront(card); saidCard = null; continue; }
      // the answer is shown: the front's audio ends first, and its control goes
      const front = card.querySelector('#kp-listen-front');
      if (front) {
        if (spoken?.button === front) { const was = spoken; spoken = null; if (was.session && !was.session.ended) was.session.stop(); }
        for (const stale of card.querySelectorAll('#kp-listen-front, .voice-note')) stale.remove();
      }
      if (card.querySelector('#kp-listen-word')) continue;
      const sentence = () => card.querySelector('.kp-sentence .kp-s[data-focus="1"]') || card.querySelector('.kp-sentence');
      const term = shownText(card.querySelector('.kp-term'));
      const reading = shownText(card.querySelector('.kp-reading')) || term;
      const key = voiceKeyOf('word', term || card.dataset.card || 'card');
      const word = answer.querySelector('.kp-word');
      if (!word || !reading) continue;
      // one plain line for the card's one control, on its own row under the word
      const note = (line) => {
        let at = word.nextElementSibling?.classList?.contains('voice-note') ? word.nextElementSibling : null;
        if (!at && line) {
          at = el('span', 'say-note voice-note');
          at.setAttribute('role', 'status');
          at.dataset.japaneseLookup = 'off';
          word.after(at);
        }
        if (at) at.textContent = line || '';
      };
      const say = cardMark('kp-listen-word');
      say.setAttribute('aria-label', tx('語と文を聞く', 'Listen to the word and its sentence'));
      say.addEventListener('click', (event) => {
        event.stopPropagation();
        const reads = answerReads(reading, japaneseSentences(shownText(sentence())), japaneseSentences(shownText(answer.querySelector('.kp-def'))),
          japaneseSentences(shownText(answer.querySelector('.kp-note-passage')))).filter((one) => isJapaneseEnough(one.text));
        speakFrom(say, { sentences: reads, voiceKey: key, onNote: (line) => { say.title = line || ''; note(line); } });
      });
      // at the line's end, after the word type, where the old 音 stood (tighten.css keeps its share of the line to that 音's)
      word.append(say);
      // the answer shown: its word, once, through the voice server or not at all
      const shown = card.dataset.card || term;
      if (saidCard !== shown) {
        saidCard = shown;
        if (host.bySelf?.() && isJapaneseEnough(reading)) speakFrom(say, { sentences: [{ text: reading }], voiceKey: key, single: true, automatic: true });
      }
    }
  }
  /** The question side: one control only where the card's word is printed marked in its passage (not blanked out, not a face
   * with choices, not a character or a grammar card), saying that word by the deck's stored reading. Nothing speaks by
   * itself here, and where there is nothing to say there is no control and no line. */
  function mountDeckFront(card) {
    for (const stale of card.querySelectorAll('#kp-listen-word')) stale.remove();
    const face = () => ({ kind: card.dataset.kind, printed: !!card.querySelector('.kp-sentence .kp-target'), blanked: !!card.querySelector('.kp-blank'),
      choices: !!card.querySelector('.kp-choices') });
    const have = card.querySelector('#kp-listen-front');
    if (have) {
      if (!deckFrontVoice({ ...face(), reading: 'x' })) { if (spoken?.button === have) seam.stop(); have.nextElementSibling?.classList?.contains('voice-note') && have.nextElementSibling.remove(); have.remove(); }
      return;
    }
    const id = card.dataset.card;
    if (!id || !deckFrontVoice({ ...face(), reading: 'x' }) || card.dataset.voiceFront === id) return;
    card.dataset.voiceFront = id;
    Promise.all([host.deckWordReading?.(id), host.deckWordTerm?.(id)]).then(([reading, term]) => {
      const row = card.querySelector('.kp-eyebrow');
      if (!reading || !row || !card.isConnected || card.dataset.card !== id || card.querySelector('.kp-answer') || card.querySelector('#kp-listen-front')) return;
      const plan = deckFrontVoice({ ...face(), reading });
      if (!plan) return;
      // one word, one clip (the combine's review): the voice is keyed by the card's word as the answer side keys it (its
      // dictionary form, else the card's id), never by the form the passage prints (an inflected 憧れた is 憧れる's)
      const word = host.deckWordTerm ? term || id : shownText(card.querySelector('.kp-sentence .kp-target')) || id;
      const control = cardMark('kp-listen-front');
      control.setAttribute('aria-label', tx('語を聞く', 'Listen to the word'));
      // what it says, the ear says on the marked word (one clip: the same text under the same voice key)
      const says = { text: plan.text, voiceKey: voiceKeyOf('word', word) };
      frontSays.set(control, says);
      control.addEventListener('click', (event) => {
        event.stopPropagation();
        speakFrom(control, { sentences: [{ text: says.text }], voiceKey: says.voiceKey, single: true,
          onNote: (line) => { control.title = line || ''; noteBeside(control, line); } });
      });
      row.append(control);
    }).catch(() => { /* no reading to be had: no control */ });
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
      // the ear is a deliberate act: a read of the article yields to it and takes itself up again at the same sentence
      // when the ear's voice ends, as it does for the word box's 音 (John, 2026-11-11: only pause stops a read); a read he
      // had paused yields too and stays paused
      const state = readerActive() ? reader.session.state : null;
      const yieldFrom = ['loading', 'playing', 'paused'].includes(state) ? { pid: reader.pid, index: reader.index, paused: state === 'paused' }
        : reader.yielding ? { pid: reader.yielding.pid, index: reader.yielding.index, paused: !reader.yielding.resume } : null;
      const marker = {};
      if (yieldFrom) { readerApi.stop(); reader.justStopped = null; }
      prime();
      // the ear's own limit: a sentence that has not begun to sound in EAR_FIRST_CLIP_MS is given up (the struck mark and
      // the plain line, which says the voice took too long: "busy" only when the server said so), and the read it took
      // the place of goes on; giving up is the ear's alone and blocks no one. The cut lets the sentence on its way
      // arrive and be kept, so the next tap on it plays at once (the review's K3)
      let timedOut = false;
      const limit = view.setTimeout(() => { if (!marker.over && !marker.sounding) { timedOut = true; session.cut(); } }, EAR_FIRST_CLIP_MS);
      const session = seam.read({ sentences: unit.sentences, voiceKey: unit.voiceKey, prefetch: unit.sentences.length > 1 ? 2 : 0, gapMs: 260, rate: reader.rate,
        onState: (now, code) => {
          if (now === 'playing') { marker.sounding = true; view.clearTimeout(limit); }
          if (!['done', 'stopped', 'error'].includes(now)) return;
          view.clearTimeout(limit);
          marker.over = true;
          if (timedOut && now === 'stopped') done('error', EAR_SLOW); else done(now, told(code));
          yieldEnded(marker);
        } });
      if (yieldFrom) {
        reader.yielding = { pid: yieldFrom.pid, index: yieldFrom.index, resume: !yieldFrom.paused, word: marker };
        // a read refused at once ended before the read could yield to it: the read takes itself up again now
        if (marker.over) yieldEnded(marker);
        else barChanged();
      }
      return session;
    },
    plain: { line: (reason) => silenceLine(reason), words: (reason) => reasonWords(reason) },
    // the card audio's switch (Settings, 筆と声): off, the ear draws nothing on text either
    highlight: () => highlighting(),
    cannot: (unit) => {
      const why = seam.cannot(unit.voiceKey);
      if (!why) return null;
      // a unit whose every sentence this device keeps is a voice to be had, connection or not (the offline clips, B3)
      const all = unit.sentences || [];
      return all.length && all.every((one) => !seam.cannot(unit.voiceKey, one.text)) ? null : told(why);
    },
    context: () => ({ view: host.view(), keyFor: markKey,
      articleOf: (node) => (host.view() === 'reader' && node?.closest?.('#reader') ? host.passage()?.id || null : null),
      // a study card's front (a review card before its answer, a deck card on its question side)
      cardFront: (node) => {
        if (node?.closest?.('.review-face')) return !host.cardRevealed();
        const card = node?.closest?.('.kp .kp-card');
        return !!card && !card.querySelector('.kp-answer');
      },
      // a study card's question face (the lead's ruling after the combine's review, F1): the only voice there is the card's
      // own control. The review card marks its question faces (corridor.js: data-card-face="question", the reading
      // probe's too); a deck card is on its question side until its answer is shown. There the ear may read only the
      // asked word where the face's control stands (the review card's printed word, the deck card's marked word), or that
      // control, and says what the control says; everywhere else on the face nothing (modules/ear.mjs, questionUnit)
      cardQuestion: (node) => {
        const face = node?.closest?.('.review-face');
        if (face) {
          if (face.dataset.cardFace !== 'question') return null;
          const control = face.querySelector('#card-say-front');
          const open = control ? node.closest('#card-say-front, .review-front') : null;
          return { open: open && face.contains(open) ? open : null,
            say: control ? wordVoiceRequest(control.dataset.voiceText, control.dataset.voiceWord) : null };
        }
        const card = node?.closest?.('.kp .kp-card');
        if (!card || card.querySelector('.kp-answer')) return null;
        const control = card.querySelector('#kp-listen-front');
        const open = control ? node.closest('#kp-listen-front, .kp-sentence .kp-target') : null;
        return { open: open && card.contains(open) ? open : null, say: control ? frontSays.get(control) || null : null };
      } }),
  });
  let scan = 0;
  const rescan = () => {
    if (scan) return;
    scan = doc.defaultView.setTimeout(() => {
      scan = 0;
      mountMarks(doc);
      // the page drawn again (a word looked up, a box opened, a dial moved): the bands follow the sentence's new words
      if (readBands.shown) readBands.refresh();
      ear.refresh();
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
      // the day's ceiling only as the server said it; with none said, no ceiling is named
      const capCents = spend.capCents ?? voiceLimits(status).dayCapCents;
      const cap = capCents === null ? null : dollars(capCents);
      const spent = dollars(spend.spentCents);
      if (spend.since === null) {
        today = cap ? tx(`今日：${spent}（上限は1日${cap}、${newDay()}に戻ります）。`, `Today: ${spent} of ${cap}. The day starts again at ${newDay()}.`)
          : tx(`今日：${spent}（${newDay()}に戻ります）。`, `Today: ${spent}. The day starts again at ${newDay()}.`);
      } else {
        today = cap ? tx(`今日：${spent}（この端末で${clock(spend.since)}から数えた分。上限は1日${cap}、${newDay()}に戻ります）。`,
          `Today: ${spent} since ${clock(spend.since)}, counted on this device. The limit is ${cap} a day and starts again at ${newDay()}.`)
          : tx(`今日：${spent}（この端末で${clock(spend.since)}から数えた分。${newDay()}に戻ります）。`,
            `Today: ${spent} since ${clock(spend.since)}, counted on this device. The day starts again at ${newDay()}.`);
      }
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
    /** A single word or reading from one of the app's own 音 buttons. (A box drawn again while its word is being said,
     * as with no connection when its dictionary worker cannot load, hands the read to its new 音: anchorOf.) */
    sayWord({ text, word, button, onNote, automatic = false, withSentence = false }) {
      // the text and voice key are the ones the answer saying itself asks for, so both share one kept clip (B3)
      const ask = wordVoiceRequest(text, word);
      // the answer side's one control (John, 2026-11-11): by his tap it says the word and then the card's own sentence, in
      // one turn; said by itself, as the answer is shown, it is the word alone
      const sentence = withSentence && !automatic ? cardSentence() : [];
      return speakFrom(button, { sentences: ask.text ? answerReads(ask.text, sentence) : [], voiceKey: ask.voiceKey,
        single: !sentence.length, onNote, automatic });
    },
    /** Whether a control is saying the turn its own tap started: a further tap stops it (corridor.js asks this before it
     * ends the card's other sounds, so that a tap during the answer's word said by itself starts the control's turn). */
    tapSpeaking,
    /** What the review card's question side may say, from plain inputs (modules/card-audio.mjs): { text, word } or null. */
    frontVoice: reviewFrontVoice,
    /** The switch "Highlight what is being read" was changed: a band that is drawn goes at once; with it on again the
     * sentence under way is lit again. */
    highlightChanged() {
      ear.repaint();
      if (!highlighting()) { readBands.hide(); return; }
      if (reader.lit >= 0 && readerActive()) paintLit();
    },
    /** The quote chip: the excerpt through the seam when the article has no recording of it. With no voice the reason
     * stands in one line beside the chip. */
    sayExcerpt({ text, sourceId, button, onNote = (line) => noteBeside(button, line) }) {
      return speakFrom(button, { sentences: japaneseSentences(text), voiceKey: sourceId ? voiceKeyOf('article', sourceId) : voiceKeyOf('word', 'sentence'), onNote });
    },
    /** Whether a word could be voiced right now. A read that would start by itself asks first (corridor.js), so that
     * with no voice to be had it stops no other sound. Given the word's text, a clip kept on this device counts. While an
     * article is being read (or yields to a word) nothing says itself over it. */
    canSay: (text = null, word = '') => {
      if (readerBusy()) return false;
      if (text == null) return !seam.cannot();
      const ask = wordVoiceRequest(text, word);
      return !seam.cannot(ask.voiceKey, ask.text);
    },
    /** The Speak room (speak.js, through corridor.js's host): her line's Japanese by the rule her listen mark reads, her
     * line said through the seam before the room listens, and the room's own stop for it. */
    sentencesOf: (text) => japaneseSentences(text),
    sayLine,
    stopLine() { const read = roomRead; roomRead = null; if (read && !read.ended) read.stop(); },
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
