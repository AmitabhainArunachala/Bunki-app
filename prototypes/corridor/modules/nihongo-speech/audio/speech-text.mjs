/** Canonical speech text, Japanese script checks, sentence splitting and voice keys.
 *
 * Deliberately pure and runtime-neutral: no DOM, network, storage or provider
 * work, and no imports. The Worker imports this module, so it must stay valid
 * inside workerd as well as in the browser and Node.
 */

export const MAX_DYNAMIC_CODEPOINTS = 400;

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/gu;
const WHITESPACE = /\s/u;
const LETTER = /[\p{L}ー]/gu;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/gu;
const KANA_OR_HAN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const WORD = /[\p{L}\p{N}]/u;

const SENTENCE_END = new Set(['。', '！', '？', '!', '?']);
const CLOSERS = new Set(['」', '』', '）', ')', '】', '〕', '"', "'", '”', '’']);
const COMMAS = new Set(['、', '，']);

const KINDS = new Set(['card', 'word', 'conv', 'article', 'record']);
const CARD_ID = /^nsrs-[a-z]-[0-9a-f]{12}$/;
const BAD_ID = /[\s\p{Cc}]/u;

/** NFC, no zero-width marks, one ASCII space per whitespace run, trimmed. */
export function normaliseSpeechText(text) {
  if (typeof text !== 'string') throw new TypeError('speech text must be a string');
  return text.normalize('NFC').replace(ZERO_WIDTH, '').replace(/\s+/gu, ' ').trim();
}

/** True only for non-empty text that is already in canonical form. */
export function isNormalSpeechText(text) {
  return typeof text === 'string' && text.length > 0 && text === normaliseSpeechText(text);
}

const count = (text, pattern) => (text.match(pattern) ?? []).length;

/** Japanese letters (kana, Han and ー) divided by all letters; 0 without letters. */
export function japaneseShare(text) {
  if (typeof text !== 'string') return 0;
  const letters = count(text, LETTER);
  return letters === 0 ? 0 : count(text, JAPANESE) / letters;
}

/** At least one kana or kanji and a share of at least `minimum`. */
export function isJapaneseEnough(text, minimum = 0.6) {
  return typeof text === 'string' && KANA_OR_HAN.test(text) && japaneseShare(text) >= minimum;
}

// Trim only the source whitespace bounds; normalisation handles the rest.
function trimRange(text, start, end) {
  while (start < end && WHITESPACE.test(text[start])) start++;
  while (end > start && WHITESPACE.test(text[end - 1])) end--;
  return [start, end];
}

// Advance at most `limit` code points, never landing inside a surrogate pair.
function advanceCodePoints(text, start, limit, end) {
  let at = start;
  for (let seen = 0; at < end && seen < limit; seen++) {
    at += text.codePointAt(at) > 0xFFFF ? 2 : 1;
  }
  return at;
}

function cutLongRange(text, start, end, max) {
  const pieces = [];
  let at = start;
  while (at < end) {
    const limit = advanceCodePoints(text, at, max, end);
    if (limit >= end) {
      pieces.push([at, end]);
      break;
    }
    let cut = -1;
    for (let i = limit - 1; i >= at; i--) {
      if (COMMAS.has(text[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut === -1) cut = limit;
    pieces.push([at, cut]);
    at = cut;
  }
  return pieces;
}

// Sentences end after a punctuation run and its closers, except before と.
function sentenceRanges(text) {
  const ranges = [];
  let start = 0;
  let at = 0;
  while (at < text.length) {
    const ch = text[at];
    if (ch === '\n' || ch === '\r') {
      if (at > start) ranges.push([start, at]);
      at++;
      start = at;
      continue;
    }
    if (SENTENCE_END.has(ch)) {
      let end = at + 1;
      while (end < text.length && SENTENCE_END.has(text[end])) end++;
      while (end < text.length && CLOSERS.has(text[end])) end++;
      if (text[end] === 'と') {
        at = end;
        continue;
      }
      ranges.push([start, end]);
      at = end;
      start = end;
      continue;
    }
    at++;
  }
  if (start < text.length) ranges.push([start, text.length]);
  return ranges;
}

/** Split text into sentences of at most `max` code points with source offsets. */
export function splitSentences(text, {max = MAX_DYNAMIC_CODEPOINTS} = {}) {
  if (typeof text !== 'string') throw new TypeError('speech text must be a string');
  if (!Number.isInteger(max) || max < 1 || max > MAX_DYNAMIC_CODEPOINTS) {
    throw new RangeError(`max must be an integer in 1..${MAX_DYNAMIC_CODEPOINTS}`);
  }

  const pieces = [];
  for (const [sentenceStart, sentenceEnd] of sentenceRanges(text)) {
    const [start, end] = trimRange(text, sentenceStart, sentenceEnd);
    if (start >= end) continue;
    for (const [partStart, partEnd] of cutLongRange(text, start, end, max)) {
      const [pieceStart, pieceEnd] = trimRange(text, partStart, partEnd);
      if (pieceStart >= pieceEnd) continue;
      const pieceText = normaliseSpeechText(text.slice(pieceStart, pieceEnd));
      if (pieceText === '') continue;
      if (!WORD.test(pieceText)) {
        if (pieces.length === 0) continue;
        const previous = pieces[pieces.length - 1];
        const joined = normaliseSpeechText(text.slice(previous.start, pieceEnd));
        if ([...joined].length <= max) {
          previous.end = pieceEnd;
          previous.text = joined;
        }
        continue;
      }
      pieces.push({start: pieceStart, end: pieceEnd, text: pieceText});
    }
  }
  return pieces;
}

/** A `kind:id` voice identity, bounded so it can travel in a request. */
export function isVoiceKey(value) {
  if (typeof value !== 'string' || value.length > 128) return false;
  const colon = value.indexOf(':');
  if (colon <= 0) return false;
  const kind = value.slice(0, colon);
  const id = value.slice(colon + 1);
  if (!KINDS.has(kind) || id.length === 0) return false;
  if (kind === 'card') return CARD_ID.test(id);
  const codepoints = [...id].length;
  return codepoints >= 1 && codepoints <= 120 && !BAD_ID.test(id);
}

/** Build a valid voice key or throw. */
export function voiceKeyFor(kind, id) {
  if (typeof kind !== 'string' || typeof id !== 'string') throw new Error('invalid voice key');
  const key = `${kind}:${id}`;
  if (!isVoiceKey(key)) throw new Error(`invalid voice key: ${key}`);
  return key;
}

/** Cards seed from their bare GUID; every other valid key seeds from itself. */
export function voiceSeed(key) {
  if (!isVoiceKey(key)) throw new Error('invalid voice key');
  return key.startsWith('card:') ? key.slice('card:'.length) : key;
}
