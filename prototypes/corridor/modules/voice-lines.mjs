/** One vocabulary for the voice (2026-11-13), the same words as Nihongo Study's (client/audio/voice-lines.mjs there).
 *
 * The owner's rule: real voices or silence, and when there is silence, one plain line that says why. This module is the
 * one place that holds those lines and the words on the voice controls, in Japanese and English, as [ja, en] pairs for
 * the app's tx(ja, en). A cause has its line and its short form (for the play bar, the ear's label and Settings' "Last
 * tap", where a sentence does not fit). Every surface takes its words from here: the line beside a control and the
 * control's title, the play bar, the ear's line and label, Settings, the Speak room. No other file holds a voice line.
 *
 * What a learner sees, and why:
 * - The same cause reads the same everywhere, in both apps. A slow answer is "took too long", never "busy"; "busy" is
 *   the server saying so (503). 接続 is never used: ペアリング is the pairing, 通信 and ネットワーク the network.
 * - A line ends with what he can do. Where a second tap cannot help (the text itself is refused, so it will be refused
 *   again, and nothing else can read it), the line is its first sentence alone: no "Tap to try again".
 * - A line beside a control stands for about four seconds, or until the next press, and goes when a voice answers
 *   (VOICE_LINE_STANDS_MS; modules/voice-layer.mjs keeps the time).
 *
 * Pure: no DOM, no imports. The single-file build folds it into the app as one of corridor.js's seams, so its names are
 * the app's names there, and it exports through the one list at its end. */

const voiceLinePair = (ja, en) => Object.freeze([ja, en]);
const voiceLineCause = (id, ja, en, shortJa = null, shortEn = null) =>
  Object.freeze({ id, ja, en, short: shortJa === null ? null : voiceLinePair(shortJa, shortEn) });

/** The causes, by the name this module gives them. C8's {time} is when the day's limit resets, in this device's time.
 * C12 (switched off) and C13 (a blanked answer) have no line; C11 (the browser refused to start the sound) reads as C10. */
const VOICE_CAUSES = Object.freeze({
  'not-paired': voiceLineCause('C1', '声はまだ使えません。設定でこの端末をペアリングしてください。', 'No voice yet. Pair this device in Settings.', '未ペアリング', 'not paired'),
  'pair-again': voiceLineCause('C2', 'ペアリングが切れました。設定でもう一度ペアリングしてください。', 'The voice pairing has ended. Pair this device again in Settings.', '再ペアリング', 'pair again'),
  'no-connection': voiceLineCause('C3', '通信できません。ネットワークを確かめて、もう一度タップしてください。', 'No connection. Check your network, then tap again.', '通信なし', 'no connection'),
  'offline': voiceLineCause('C4', 'オフラインのため、まだ保存されていない音声は再生できません。', "Offline. This one isn't saved on this device yet.", 'オフライン', 'offline'),
  'too-slow': voiceLineCause('C5', '音声の準備に時間がかかりすぎました。少し待って、もう一度お試しください。', 'The voice took too long. Try again in a moment.', '時間切れ', 'too slow'),
  'busy': voiceLineCause('C6', '音声サーバーが混み合っています。少し待って、もう一度お試しください。', 'The voice is busy. Try again in a moment.', '混雑中', 'busy'),
  'wait-a-minute': voiceLineCause('C7', '1分間に新しい文が多すぎます。1分ほど待って、もう一度タップしてください。', 'Too many new sentences in one minute. Wait a minute, then tap again.', '1分待ち', 'wait a minute'),
  'day-limit': voiceLineCause('C8', '今日の音声の上限に達しました。{time}にリセットされます。', "Today's voice limit is reached. It resets at {time}.", '今日の上限', "today's limit"),
  'limit': voiceLineCause('C9', '音声の上限に達しました。この端末で一度聞いた音声は再生できます。', 'The voice limit is reached. Voices you have already heard here still play.', '上限到達', 'limit reached'),
  'could-not-play': voiceLineCause('C10', '再生できませんでした。もう一度タップしてください。', "This one couldn't play. Tap to try again.", '再生エラー', 'could not play'),
  'nothing-to-read': voiceLineCause('C14', 'ここには読み上げる日本語がありません。', "There's no Japanese here to read aloud.", '日本語なし', 'nothing to read'),
  'several-readings': voiceLineCause('C14b', '読み方が一つに決まらないため、読み上げません。', 'Not read aloud: this has more than one reading.'),
  'update': voiceLineCause('C15', '声を使うには、アプリを更新してください。', 'Update the app to use the voice.', '要更新', 'update needed'),
  'no-new-sentences': voiceLineCause('C16', 'いまは新しい文を読み上げられません。', "New sentences can't be read aloud right now.", '新規は停止中', 'no new sentences'),
  'failed': voiceLineCause('C17', '読み上げられませんでした。もう一度タップしてください。', "This couldn't be read aloud. Tap to try again.", '音声エラー', 'voice error'),
  'no-voice-here': voiceLineCause('C18', 'このバージョンでは声を使えません。', "The voice isn't available in this version of the app."),
});

/** The codes the voice seam, the client, the player and the app use, by the cause they name; anything else is C17. */
const VOICE_CODE_CAUSE = Object.freeze({
  'not-paired': 'not-paired', 'not-configured': 'not-paired',
  'authentication-required': 'pair-again',
  'network-failed': 'no-connection',
  'offline': 'offline',
  // the client's 20 s, the seam's 15 s wait after it, and the ear's own limit (ear.mjs EAR_SLOW) are all "too slow"
  'voice-timeout': 'too-slow', 'ear-too-slow': 'too-slow',
  'voice-unavailable': 'busy',
  'request-rate-limit': 'wait-a-minute',
  'day-budget': 'day-limit',
  'budget-exhausted': 'limit',
  // the speech queue names every play that failed 'decode' (a start the browser refused among them, C11)
  'decode': 'could-not-play', 'audio-error': 'could-not-play',
  'upgrade-required': 'update',
  'not-in-release': 'no-new-sentences',
  'nothing-to-say': 'nothing-to-read', 'not-japanese': 'nothing-to-read',
  'several-readings': 'several-readings',
  // the review card's control with no voice layer at all: the single-file build
  'current-source-required': 'no-voice-here',
});

/** C17's codes a second tap cannot help: the server refused this text as it is (a request it will not take, Latin text,
 * a profile it does not hold, a sentence too long to split), or the client would not send it. The same text is refused
 * again, and nothing else reads it, so the line is its first sentence alone. */
const VOICE_NO_TAP = Object.freeze(['speech-input-invalid', 'speech-input-not-normal', 'japanese-only', 'profile-not-approved',
  'speech-input-too-large', 'not-speakable', 'server-missing']);

/** C17's first sentence alone: a failure no press can help (and the Speak room's line kept with no reason of its own). */
const VOICE_FAILED_NO_ACTION = voiceLinePair(VOICE_CAUSES.failed.ja.slice(0, VOICE_CAUSES.failed.ja.indexOf('。') + 1),
  VOICE_CAUSES.failed.en.slice(0, VOICE_CAUSES.failed.en.indexOf('.') + 1));

/** The cause a code names (or a cause's own name): its key in VOICE_CAUSES. */
function voiceCauseOf(code) {
  if (typeof code !== 'string' || !code) return 'failed';
  if (Object.hasOwn(VOICE_CAUSES, code)) return code;
  return Object.hasOwn(VOICE_CODE_CAUSE, code) ? VOICE_CODE_CAUSE[code] : 'failed';
}
/** The line for a code, as [ja, en]. `time`: when today's limit resets (C8); without it C8's first sentence stands
 * alone. A C17 code a tap cannot help (VOICE_NO_TAP) is C17's first sentence alone. */
function voiceLineOf(code, { time = null } = {}) {
  const cause = voiceCauseOf(code);
  const { ja, en } = VOICE_CAUSES[cause];
  if (cause === 'day-limit') {
    return time ? [ja.replace('{time}', time), en.replace('{time}', time)] : [ja.slice(0, ja.indexOf('。') + 1), en.slice(0, en.indexOf('.') + 1)];
  }
  if (cause === 'failed' && VOICE_NO_TAP.includes(code)) return [...VOICE_FAILED_NO_ACTION];
  return [ja, en];
}
/** The short form for a code, as [ja, en]: for the play bar, the ear's label and Settings' last tap. The two Bunki-only
 * causes have none (they are never on those surfaces); C17's stands in. */
function voiceShortOf(code) { return [...(VOICE_CAUSES[voiceCauseOf(code)].short || VOICE_CAUSES.failed.short)]; }

/** The state words on every label, tooltip and aria-label of a voice control. A speaker at rest is "Listen" wherever it
 * stands; only the play bar names its state in its label (Pause, Resume): every other control shows that it speaks by
 * its look and aria-pressed, and keeps its name. */
const VOICE_WORDS = Object.freeze({
  listen: voiceLinePair('聞く', 'Listen'),
  pause: voiceLinePair('一時停止', 'Pause'),
  resume: voiceLinePair('続きを聞く', 'Resume'),
  stop: voiceLinePair('止める', 'Stop'),
  earOff: voiceLinePair('耳：オフ', 'Ear: off'),
  earArmed: voiceLinePair('耳：次のタップを読み上げます', 'Ear: reads your next tap'),
  earHeld: voiceLinePair('耳：オン', 'Ear: on'),
  earSpeaking: voiceLinePair('耳：読み上げ中', 'Ear: speaking'),
  speed: voiceLinePair('読む速さ', 'Reading speed'),
  selection: voiceLinePair('選んだ日本語を読む', 'Read the selected Japanese'),
  // Bunki's own row (the ruling's amendment, 2026-11-14): in Bunki the one switch also covers an opened word (corridor.js,
  // WORD_VOICE), so Nihongo Study's "Say answers aloud when shown" would be untrue here; the budget line stands beside it
  speakOnReveal: voiceLinePair('答えと開いた語を読み上げる', 'Say answers and opened words aloud'),
});
/** The ear's title while it is off: its state, then how it is used, true on a Mac (a held ear reads what the pointer rests
 * on) and on a phone (it reads every tap). */
const VOICE_EAR_HELP = voiceLinePair('耳：オフ。タップ：次にタップした日本語を読み上げます。長押し：耳をオンのままにします。', 'Ear: off. Tap: reads the next Japanese you tap. Hold: keeps the ear on.');
const VOICE_EAR_STATE = Object.freeze({ off: 'earOff', armed: 'earArmed', held: 'earHeld', speaking: 'earSpeaking' });
/** The ear's label for its state, as [ja, en]; with no voice, the short form of the cause. */
function voiceEarLabel(state, code = null) {
  if (state === 'novoice') { const [ja, en] = voiceShortOf(code); return [`耳：声なし（${ja}）`, `Ear: no voice (${en})`]; }
  return [...VOICE_WORDS[VOICE_EAR_STATE[state] || 'earOff']];
}

/** How long a line beside a control, or the ear's, stands when nothing else takes it away. */
const VOICE_LINE_STANDS_MS = 4000;

/** Settings, Writing and voice: the state of the pairing, the last tap or sentence, and the limits' lines with the
 * figure the server sent (the owner's rule 7: Bunki keeps the dollar figure beside the limit lines here). */
const VOICE_SETTINGS = Object.freeze({
  heading: voiceLinePair('音声サーバー — 収録音声、次に音声サーバー。ほかの声は使いません', 'Voice server — a recorded clip first, then the voice server. No other voice is used'),
  paired: (tail) => [`この端末はペアリング済みです（インストール …${tail}）。`, `This device is paired (install …${tail}).`],
  notKept: voiceLinePair('このブラウザはペアリングを保存できないため、今回の利用だけ有効です。', 'This browser could not keep the pairing, so it lasts for this visit only.'),
  lastTap: (short, time) => [`最後のタップ：声なし（${short[0]}、${time}）`, `Last tap: no voice (${short[1]}), at ${time}.`],
  nothingYet: voiceLinePair('最後に読んだ文：まだありません。', 'Last sentence: nothing spoken yet.'),
  lastSentence: (source, time) => [`最後に読んだ文：${source[0]}（${time}）`, `Last sentence: ${source[1].replace(/^./u, (c) => c.toLowerCase())}, at ${time}.`],
});
/** Where a sentence came from: the bar's note and Settings' last sentence. */
const VOICE_SOURCES = Object.freeze({ server: voiceLinePair('音声サーバー', 'Voice server'), recorded: voiceLinePair('収録音声', 'Recorded clip') });
const voiceDollars = (cents) => { const n = cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100); return { ja: `${n}ドル`, en: `$${n}` }; };
/** A limit's line as Settings shows it, as [ja, en]: the ruled line, and beside it the figure the server sent (a day's
 * cap for C8, the whole cap for C9), or nothing beside it when the server sent none. */
function voiceSettingsLine(code, { time = null, dayCapCents = null, capCents = null } = {}) {
  const [ja, en] = voiceLineOf(code, { time });
  const cause = voiceCauseOf(code);
  const cents = cause === 'day-limit' ? dayCapCents : cause === 'limit' ? capCents : null;
  if (!Number.isSafeInteger(cents) || cents < 0) return [ja, en];
  const n = voiceDollars(cents);
  return cause === 'day-limit' ? [`${ja}（1日${n.ja}）`, `${en} (${n.en} a day)`] : [`${ja}（合計${n.ja}）`, `${en} (${n.en} in all)`];
}

/** The pairing form under Settings, its lines in the same words (a lost connection and a slow answer read as C3 and C5). */
const VOICE_PAIRING = Object.freeze({
  learner: voiceLinePair('学習者ID（または表示された1行）', 'Learner id (or the whole pairing line)'),
  code: voiceLinePair('ペアリングコード（12文字）', 'Pairing code (12 characters)'),
  submit: voiceLinePair('ペアリング', 'Pair'),
  pairing: voiceLinePair('ペアリング中…', 'Pairing…'),
  how: voiceLinePair('デスクトップの「Bunki Voice」を実行すると「Bunki voice code:」で始まる1行が出ます。その1行をそのまま最初の欄に貼って「ペアリング」を押してください。コードは10分で切れます。',
    'Run “Bunki Voice” on the Desktop. It prints one line that starts “Bunki voice code:”. Paste that whole line into the first box and press Pair. The code lasts 10 minutes.'),
  forget: voiceLinePair('この端末のペアリングを消す', 'Forget the pairing on this device'),
  refresh: voiceLinePair('予算を更新', 'Refresh the budget'),
  errors: Object.freeze({
    'invalid-pairing': voiceLinePair('コードか学習者IDの形が違います。確かめて、もう一度お試しください。', 'That does not look like a pairing code and learner id. Check them and try again.'),
    'authentication-required': voiceLinePair('コードが違うか、使用済みか、期限切れです。デスクトップの「Bunki Voice」をもう一度実行してください。', 'That code is wrong, already used or expired. Run “Bunki Voice” on the Desktop again for a new one.'),
    'installation-exists': voiceLinePair('このコードの端末はすでにペアリング済みです。デスクトップの「Bunki Voice」をもう一度実行してください。', 'That code belongs to an install that is already paired. Run “Bunki Voice” on the Desktop again for a new one.'),
    'authentication-rate-limit': voiceLinePair('試行が多すぎます。1分待ってください。', 'Too many tries. Wait one minute.'),
    'pairing-unavailable': voiceLinePair('いまはペアリングできません。数分後にもう一度お試しください。', "Pairing isn't available right now. Try again in a few minutes."),
    'network-failed': voiceLinePair(VOICE_CAUSES['no-connection'].ja, VOICE_CAUSES['no-connection'].en),
    'voice-timeout': voiceLinePair(VOICE_CAUSES['too-slow'].ja, VOICE_CAUSES['too-slow'].en),
    'server-missing': voiceLinePair('この端末はまだ音声サーバーの住所を知りません。「Bunki voice code:」で始まる1行をそのまま貼ってください。',
      'This device does not know the voice server’s address yet. Paste the whole line that starts “Bunki voice code:”.'),
  }),
  failed: voiceLinePair('ペアリングできませんでした。もう一度お試しください。', 'Pairing did not work. Try again.'),
});
/** A pairing answer's line, as [ja, en]. */
function voicePairingLine(code) { return [...(Object.hasOwn(VOICE_PAIRING.errors, code) ? VOICE_PAIRING.errors[code] : VOICE_PAIRING.failed)]; }

/** The other notes beside a voice control. */
const VOICE_NOTES = Object.freeze({
  // the review card's answer changed under its control after it had said the old one
  answerUpdated: voiceLinePair('答えが更新されました。タップで聞けます。', 'Answer updated. Tap to listen.'),
});

export { VOICE_CAUSES, VOICE_CODE_CAUSE, VOICE_NO_TAP, VOICE_FAILED_NO_ACTION, voiceCauseOf, voiceLineOf, voiceShortOf, VOICE_WORDS, VOICE_EAR_HELP, voiceEarLabel, VOICE_LINE_STANDS_MS, VOICE_SETTINGS, VOICE_SOURCES, voiceSettingsLine, VOICE_PAIRING, voicePairingLine, VOICE_NOTES };
