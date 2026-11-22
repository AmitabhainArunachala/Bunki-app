/** N6 (owner 2026-11-11: "the duplication gone, the gawdy buttons more subtle, and simplified, voice on the front as well
 * and the option to have no highlighting at all"): one audio control on each face of a study card, in the top bar, which
 * is also the key P. Pure decisions; the caller does the speaking, the painting and the storage.
 *
 * Fix round 1 (lead, 2026-11-12): a control that stands always answers: it speaks, or it shows the one plain line that says
 * why not. Question side: the control stands where the word or pattern asked is printed on that face and speech is set up
 * on this device; a tap asks the bridge (which answers from the device's kept clips before the network). Answer side:
 * online and allowed the control reads the card (the word, then the passage sentence by sentence); otherwise it tries the
 * read from what the device kept, then the card's kept whole-passage clip, then the line. A tap pauses the read and takes
 * it up again at the same place; the whole clip keeps stop and restart.
 *
 * N8 (owner 2026-11-15: "i asked to be able to listen to the entire card, from the front"; replaces N6-3): the question
 * side's control is the card's read too, with the answer side's states, pause and resume, paths and light. It reads the
 * card as that face prints it (cardFrontRead); the whole clip is the answer side's alone. */
import {splitSentences, normaliseSpeechText} from '../audio/speech-text.mjs';

const speakable = value => typeof value === 'string' && /\S/u.test(value) ? value.trim() : null;
const MEANING = 'grammar.meaning.v1', CLOZE = 'grammar.cloze.v1', VOCABULARY = 'vocabulary.read.v1';

const SLOTS = /[〜～~…]+/gu;
// A kana bracket straight after a kanji holds either an optional part (〜際（に）, 〜以上（は）) or that kanji's reading
// (〜上（じょう）). These words are optional parts; any other kana there is a reading. tests/player/card-audio-patterns.test.mjs
// walks the shipped catalog and makes every such bracket a decision by hand.
const OPTIONAL_AFTER_KANJI = new Set(['に', 'は', 'も', 'の', 'を', 'が', 'て', 'で', 'と', 'へ', 'には', 'では', 'とも', 'して']);

function formSpeech(form) {
  return form.replace(/(\p{Script=Han})[（(]([\p{Script=Hiragana}ー]+)[）)]/gu, (all, kanji, kana) => OPTIONAL_AFTER_KANJI.has(kana) ? kanji + kana : kana)
    .replace(/[（）()［］\[\]]/gu, '').replace(/\s+/gu, ' ').trim()
    .replace(SLOTS, '〜').replace(/^〜+|〜+$/gu, '').replace(/\s*〜\s*/gu, '、');
}

/** A grammar pattern as said (fix round 1, F2): a 〜 at the start or the end goes; a 〜 inside is a pause (、), never a
 * join; a bracket that holds the reading of the kanji before it is said in place of that kanji; a bracket that holds an
 * optional part keeps its words; forms joined by ／ are said with a pause between them. */
export function patternSpeech(pattern) {
  if (typeof pattern !== 'string') return null;
  const text = pattern.split(/[／/]/u).map(formSpeech).filter(Boolean).join('、').replace(/、{2,}/gu, '、').replace(/^、+|、+$/gu, '');
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text) ? text : null;
}

/** A stored reading (or a written term) as said (fix round 1, C3/C4): a 〜 at its start or end goes (～そく is said そく);
 * readings joined by ・ are said with a pause between them (こうよう・もみじ). */
export function readingSpeech(value) {
  const text = speakable(value);
  if (!text) return null;
  const said = text.split(/\s*[・･]\s*/u).map(part => part.replace(/^[〜～~]+|[〜～~]+$/gu, '').trim()).filter(Boolean).join('、');
  return said || null;
}

/** What the card's word is said by, on either face: its stored reading, else its written term; a grammar card's pattern. */
export function cardWordSpeech(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.contractId === 'string' && entry.contractId.startsWith('grammar.')) return patternSpeech(entry.grammarRecord?.pattern);
  return readingSpeech(entry.reading) ?? readingSpeech(entry.term);
}

// A fill-in card's blank as client/grammar/renderer.mjs prints it (［　　］): said as a pause.
const GAP = /［[\s\u3000]*］/gu;
const WORD = /[\p{L}\p{N}]/u;

function blankAsPause(raw) {
  let text;
  try {text = normaliseSpeechText(raw.replace(GAP, '、'));} catch {return null;}
  text = text.replace(/、(?:\s*、)+/gu, '、').replace(/^[、\s]+/u, '').replace(/[、\s]+(?=[。！？!?」』）)]|$)/gu, '');
  return WORD.test(text) ? text : null;
}

// The printed passage's sentences as the answer side's read splits them (one text, one clip), each where it is printed.
function printedSentences(text, say = (raw, piece) => piece) {
  if (typeof text !== 'string' || !text) return [];
  let pieces;
  try {pieces = splitSentences(text);} catch {return [];}
  return pieces.map(({start, end, text: piece}) => ({part: 'passage', start, end, text: say(text.slice(start, end), piece)})).filter(item => item.text);
}

/** N8: what the question side reads, as that face prints it, or null where the card has no question-side read. `printed`
 * holds the speakable text of what the face prints: `pattern` (a meaning card's pattern heading) and `passage`. Each item
 * is what is asked (text) and where it is printed (start and end in that text; part 'word' for the pattern heading,
 * 'passage' for the passage), so the light follows the read.
 *  - a vocabulary card: its printed passage, sentence by sentence (the answer side reads the word, then the same
 *    sentences); a face that prints only the word: the word by its stored reading, as N6-3 said it;
 *  - a meaning card: the pattern as patternSpeech says it, then each sentence of the example it prints;
 *  - a fill-in card: the printed sentence with the blank as a pause. Its answer is never asked: a sentence that holds it
 *    is left out, and an answer that cannot be found leaves nothing to ask.
 * No items: nothing to say (the control answers with that line). */
export function cardFrontRead(entry, {pattern = null, passage = null} = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const printed = typeof passage === 'string' ? passage : '';
  if (entry.contractId === VOCABULARY) {
    const word = speakable(entry.form) ?? speakable(entry.term), said = cardWordSpeech(entry);
    if (word && said && printed.trim() === word) {
      const start = printed.indexOf(word);
      return {kind: 'word', items: [{part: 'passage', start, end: start + word.length, text: said}]};
    }
    return {kind: 'passage', items: printedSentences(printed)};
  }
  if (!entry.grammarRecord || typeof entry.grammarRecord !== 'object') return null;
  if (entry.contractId === MEANING) {
    const heading = typeof pattern === 'string' && pattern.trim() ? pattern : null, said = heading ? patternSpeech(entry.grammarRecord.pattern) : null;
    return {kind: 'pattern', items: [...(said ? [{part: 'word', start: 0, end: heading.length, text: said}] : []), ...printedSentences(printed)]};
  }
  if (entry.contractId === CLOZE) {
    const examples = Array.isArray(entry.grammarRecord.examples) ? entry.grammarRecord.examples : [];
    const passageId = entry.grammarTask?.passageId ?? entry.passageId;
    const answer = speakable(examples.find(example => example?.exampleId === passageId)?.cloze);
    if (!answer) return {kind: 'cloze', items: []};
    return {kind: 'cloze', items: printedSentences(printed, blankAsPause).filter(item => !item.text.includes(answer))};
  }
  return null;
}

/** The answer side's path, chosen before anything starts (fix round 1, F3): 'read' online and allowed; 'kept' where a
 * read exists but free text cannot be asked for now (offline, refused for the day): the read from what the device kept,
 * then the card's whole clip, then the line; 'clip' (the card's kept whole-passage clip) where there is no read; else
 * 'line'. With a read there is always something to ask the bridge before any line. */
export function answerAudioPath({freeText = false, reader = false, cardClip = false} = {}) {
  if (reader) return freeText ? 'read' : 'kept';
  if (cardClip) return 'clip';
  return 'line';
}

/** Where a read stands: 'going' (loading, playing, or held while a speaker he pressed has its turn), 'paused' (he paused
 * it) or 'idle' (not started, ended, stopped, failed). */
export function readStatus({state = 'idle', turn = false} = {}) {
  if (turn || state === 'loading' || state === 'playing') return 'going';
  return state === 'paused' ? 'paused' : 'idle';
}

/** What one tap (or P) on the answer side does (fix round 1, C1). A read that is going pauses; a paused read is taken up
 * again at the same place; a clip he started stops; otherwise the path starts (during the automatic reveal clip the read
 * starts from the top; on the clip path the clip restarts, as P did before). N7 fix 1: the whole clip held by its audio
 * context (stopped in the middle from outside) is resumed and goes on from the same place. */
export function answerAudioPress({path, read = 'idle', clipPlaying = false, clipAuto = false, clipHeld = false} = {}) {
  if (clipHeld) return 'resume-clip';
  if (read === 'going') return 'pause-read';
  if (read === 'paused') return 'resume-read';
  if (clipPlaying && !clipAuto) return 'stop-clip';
  if (path === 'read') return 'start-read';
  if (path === 'kept') return 'start-kept';
  if (path === 'clip') return 'play-clip';
  return 'line';
}

/** The mark's three states, told apart by shape as well as colour: at rest, speaking, paused (a paused read, or the whole
 * clip held by its audio context). */
export function answerAudioMode({read = 'idle', clipPlaying = false, clipHeld = false} = {}) {
  if (clipHeld) return 'paused';
  if (read === 'going' || clipPlaying) return 'speaking';
  return read === 'paused' ? 'paused' : 'rest';
}

/** A read that failed: tried from kept clips with nothing of it answered yet, it goes on to the card's whole clip, else
 * the line; a read that had been answered ends there with the line for its reason. */
export function readFailure({kept = false, played = false, cardClip = false} = {}) {
  return kept && !played && cardClip ? 'clip' : 'line';
}

/** Free text (a word's reading, a sentence) can be asked of the network now: a speak bridge, dynamic speech not switched
 * off, the device online, and not refused for today by the day's budget. Where it cannot, the read is still tried from
 * the device's kept clips (answerAudioPath 'kept'), on either face. */
export function freeTextAvailable({bridge = false, dynamicSpeech = 'unknown', online = true, refusedDay = null, today = null} = {}) {
  return !!bridge && dynamicSpeech !== 'off' && online !== false && (refusedDay === null || refusedDay !== today);
}

/** The clips of the card on screen, kept so that a second tap (or the answer side after the question side) asks again for
 * nothing. Bounded; the caller clears it when the card changes. */
export function createClipMemo({limit = 48} = {}) {
  const clips = new Map();
  return Object.freeze({
    get(key) {return typeof key === 'string' ? clips.get(key) : undefined;},
    set(key, clip) {
      if (typeof key !== 'string' || !key || !clip) return;
      clips.delete(key); clips.set(key, clip);
      while (clips.size > limit) clips.delete(clips.keys().next().value);
    },
    /** N7: a clip that would not play leaves the memo, so the next tap asks again. */
    delete(key) {if (typeof key === 'string') clips.delete(key);},
    clear() {clips.clear();},
    get size() {return clips.size;},
  });
}

export const READING_LIGHT_KEY = 'nihongo.highlight-reading.v1';
export const READING_LIGHT_COLORS = Object.freeze({
  off: ['なし', 'Off'],
  gold: ['金色', 'Gold'],
  blue: ['青', 'Blue'],
  green: ['緑', 'Green'],
  rose: ['バラ色', 'Rose'],
});

export function readingLightColor(stored) {
  if (stored === 'true') return 'gold';
  return typeof stored === 'string' && Object.hasOwn(READING_LIGHT_COLORS, stored) ? stored : 'off';
}

export function readingLightOn(stored) {
  return readingLightColor(stored) !== 'off';
}
