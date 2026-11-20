/** One vocabulary for the voice (N7; the lead's ruling VOICE-VOCABULARY-RULED.md, 2026-11-12, for both of the owner's
 * apps). The owner's rule: real voices or silence, and when there is silence, one plain line that says why. This module is
 * the one place that holds those lines and the words on the voice controls, in Japanese and English: a cause maps to its
 * line and its short form (for a label where a sentence does not fit). Every surface (a card, the ear, a toast, a
 * control's own line, Settings) takes its words from here; no other client file holds a voice line. Pure: no DOM. */

const pair = (ja, en) => Object.freeze([ja, en]);
const cause = (id, ja, en, shortJa, shortEn) => Object.freeze({id, ja, en, short: pair(shortJa, shortEn)});

/** The ruled causes this client can meet. C12 (switched off) and C13 (a blanked answer) have no line; C11 (the browser
 * refused to start the sound) reads as C10; C14b and C18 are Bunki's own. C8 has no return time to show here, so its
 * first sentence stands alone. */
export const VOICE_CAUSES = Object.freeze({
  'not-paired': cause('C1', '声はまだ使えません。設定でこの端末をペアリングしてください。', 'No voice yet. Pair this device in Settings.', '未ペアリング', 'not paired'),
  'pair-again': cause('C2', 'ペアリングが切れました。設定でもう一度ペアリングしてください。', 'The voice pairing has ended. Pair this device again in Settings.', '再ペアリング', 'pair again'),
  'no-connection': cause('C3', '通信できません。ネットワークを確かめて、もう一度タップしてください。', 'No connection. Check your network, then tap again.', '通信なし', 'no connection'),
  'offline': cause('C4', 'オフラインのため、まだ保存されていない音声は再生できません。', "Offline. This one isn't saved on this device yet.", 'オフライン', 'offline'),
  'too-slow': cause('C5', '音声の準備に時間がかかりすぎました。少し待って、もう一度お試しください。', 'The voice took too long. Try again in a moment.', '時間切れ', 'too slow'),
  'busy': cause('C6', '音声サーバーが混み合っています。少し待って、もう一度お試しください。', 'The voice is busy. Try again in a moment.', '混雑中', 'busy'),
  'wait-a-minute': cause('C7', '1分間に新しい文が多すぎます。1分ほど待って、もう一度タップしてください。', 'Too many new sentences in one minute. Wait a minute, then tap again.', '1分待ち', 'wait a minute'),
  'day-limit': cause('C8', '今日の音声の上限に達しました。', "Today's voice limit is reached.", '今日の上限', "today's limit"),
  'limit': cause('C9', '音声の上限に達しました。この端末で一度聞いた音声は再生できます。', 'The voice limit is reached. Voices you have already heard here still play.', '上限到達', 'limit reached'),
  'could-not-play': cause('C10', '再生できませんでした。もう一度タップしてください。', "This one couldn't play. Tap to try again.", '再生エラー', 'could not play'),
  'nothing-to-read': cause('C14', 'ここには読み上げる日本語がありません。', "There's no Japanese here to read aloud.", '日本語なし', 'nothing to read'),
  'update': cause('C15', '声を使うには、アプリを更新してください。', 'Update the app to use the voice.', '要更新', 'update needed'),
  'no-new-sentences': cause('C16', 'いまは新しい文を読み上げられません。', "New sentences can't be read aloud right now.", '新規は停止中', 'no new sentences'),
  'failed': cause('C17', '読み上げられませんでした。もう一度タップしてください。', "This couldn't be read aloud. Tap to try again.", '音声エラー', 'voice error'),
});

/** N7 fix 2 (the lead): when the reveal says a cause again (it says each once per page session; a press always answers).
 * A cause a play disproves is said again after any play that sounds. A standing cause is said again only after a reply
 * over the network: 'served' (any reply with a clip proves the pairing and the version) or 'made' (a reply that made a new
 * clip; the server still serves clips it already has under the limits and while not taking new sentences, so only a new
 * one disproves them). Causes in neither list (C4, C14) follow a press, never a reveal. */
export const VOICE_PASSING = Object.freeze(['no-connection', 'too-slow', 'busy', 'wait-a-minute', 'could-not-play', 'failed']);
export const VOICE_STANDING = Object.freeze({'not-paired': 'served', 'pair-again': 'served', 'update': 'served', 'day-limit': 'made', 'limit': 'made', 'no-new-sentences': 'made'});

/** Codes from the speak bridges (native and web), the Worker and the client's own players, by the cause they name. */
const CODE_CAUSE = Object.freeze({
  'not-paired': 'not-paired',
  'authentication-required': 'pair-again',
  'network-failed': 'no-connection',
  'offline': 'offline', 'offline-missing': 'offline',
  'voice-timeout': 'too-slow',
  'voice-unavailable': 'busy',
  'request-rate-limit': 'wait-a-minute',
  'day-budget': 'day-limit',
  'budget-exhausted': 'limit',
  'decode': 'could-not-play', 'audio-error': 'could-not-play', 'integrity-invalid': 'could-not-play',
  // C11 reads as C10: the browser refused to start the sound (fix 1: the clip is held where it is, not ended).
  'start-refused': 'could-not-play',
  'update-required': 'update',
  'not-in-release': 'no-new-sentences',
  'nothing-to-say': 'nothing-to-read', 'not-japanese': 'nothing-to-read',
});

/** The cause a code (or a cause) names; anything else is C17. */
export function voiceCause(code) {
  if (typeof code !== 'string' || !code) return 'failed';
  if (Object.hasOwn(VOICE_CAUSES, code)) return code;
  return Object.hasOwn(CODE_CAUSE, code) ? CODE_CAUSE[code] : 'failed';
}
/** The line for a code or cause, as [ja, en]. */
export function voiceLine(code) {const {ja, en} = VOICE_CAUSES[voiceCause(code)]; return [ja, en];}
/** The short form for a code or cause, as [ja, en]. */
export function voiceShort(code) {return [...VOICE_CAUSES[voiceCause(code)].short];}

/** N7 fix 1: the words while a voice is being made ready (the Mac's audio-pack mount). */
export const VOICE_LOADING = pair('音声を読み込み中…', 'Loading the voice…');
/** N7 fix 2: the no-action form of C17, its first sentence alone, for a failure a tap cannot help (the pack statuses
 * below only): no "tap to try again" where tapping changes nothing. */
export const VOICE_FAILED_NO_ACTION = pair('読み上げられませんでした。', "This couldn't be read aloud.");
// The pack mount's statuses that are a wait (no status yet is a wait too); every other status is a failure.
const PACK_WAITING = new Set(['preparing', 'pending', 'speak-fetching']);
// The pack's failures that a tap cannot help (the device, the profile, the release, the preparation, the selection), and a
// cancelled status.
const PACK_NO_ACTION = new Set(['unsupported-capability', 'profile-unassigned', 'profile-unavailable', 'source-stale',
  'content-release-mismatch', 'preparation-failed', 'invalid', 'cancelled']);
// N7 fix 3 (the lead, F): a clip, or the pack root, that failed its integrity check is terminal for the pack: a tap does not
// read it again (only a change in the downloads or in the panel's choice does). A tap helps only where the answer side has
// another way to the voice (the read through the speak bridge, or the device's kept clips).
const PACK_TAP_NEEDS_OTHER_WAY = new Set(['integrity-invalid']);
/** The line for a status of the Mac's audio-pack mount, as [ja, en]: the waiting words while it loads; a failure a tap
 * cannot help, the no-action form of C17; any other failure its cause's ruled line (a speak code its own; offline and not
 * kept C4; a clip that would not decode C10). otherWay: a tap on the answer side reaches a voice another way (fix 3); a
 * failed integrity check is C10 only then, else the no-action form. */
export function voiceStatusLine(code, {otherWay = false} = {}) {
  if (code == null || PACK_WAITING.has(code)) return [...VOICE_LOADING];
  if (PACK_NO_ACTION.has(code) || PACK_TAP_NEEDS_OTHER_WAY.has(code) && otherWay !== true) return [...VOICE_FAILED_NO_ACTION];
  return voiceLine(code);
}

/** N7 fix 3: the neutral words the lock screen, Control Center and the earphones' controls show while a read or a clip can
 * be paused or resumed: the app's name and what it is doing. Never the text of a card, a passage or a word. */
export const VOICE_MEDIA = Object.freeze({title: 'Nihongo Study', artist: pair('読み上げ', 'Reading aloud')});

/** The state words on every label, tooltip and aria-label of a voice control. */
export const VOICE_WORDS = Object.freeze({
  listen: pair('聞く', 'Listen'),
  pause: pair('一時停止', 'Pause'),
  resume: pair('続きを聞く', 'Resume'),
  stop: pair('止める', 'Stop'),
  earOff: pair('耳：オフ', 'Ear: off'),
  earArmed: pair('耳：タップした日本語を読み上げます', 'Ear: reads what you tap'),
  earHeld: pair('耳：オン', 'Ear: on'),
  earSpeaking: pair('耳：読み上げ中', 'Ear: speaking'),
  speed: pair('読む速さ', 'Reading speed'),
  selection: pair('選んだ日本語を読む', 'Read the selected Japanese'),
  speakOnReveal: pair('答えを表示したら読み上げる', 'Say answers aloud when shown'),
});

/** The key help under the card: what P does there, in the state words. */
export const VOICE_KEY_HELP = Object.freeze({
  front: pair('P：聞く／止める', 'P: Listen or stop'),
  read: pair('P：聞く／一時停止／続きを聞く', 'P: Listen, pause or resume'),
  clip: pair('P：聞く／止める', 'P: Listen or stop'),
  trial: pair('P：聞く', 'P: Listen'),
});

/** A control that is also the key P keeps "(P)" after its word. */
export function withKey([ja, en]) {return [`${ja}（P）`, `${en} (P)`];}

const EAR_STATE_WORD = Object.freeze({off: 'earOff', armed: 'earArmed', held: 'earHeld', speaking: 'earSpeaking'});
/** The ear's label for its state; with no voice, the short form of the cause. */
export function earLabel(state, code = null) {
  if (state === 'novoice') {const [ja, en] = voiceShort(code); return [`耳：声なし（${ja}）`, `Ear: no voice (${en})`];}
  return [...VOICE_WORDS[EAR_STATE_WORD[state] ?? 'earOff']];
}

/** Every line and word as a [ja, en] pair for the interface translator (labels set in Japanese and localised later). */
export const voiceCopies = Object.freeze([
  ...Object.values(VOICE_CAUSES).map(({ja, en}) => pair(ja, en)),
  ...Object.values(VOICE_WORDS),
  ...['listen', 'pause', 'resume', 'stop'].map(word => pair(...withKey(VOICE_WORDS[word]))),
  VOICE_LOADING,
  VOICE_FAILED_NO_ACTION,
]);
