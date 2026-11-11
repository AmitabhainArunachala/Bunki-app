/** What a study card's audio controls say, decided from plain inputs (2026-11-11; John: "voice on the front as well").
 *
 * One quiet control stands on each face of a card. On the answer side it says the word by the card's stored reading,
 * then the card's sentence (and, on the deck card, the definition and the note, as its old 音 did). On the question side
 * it stands only where the asked word is printed on that face, and says that word by the stored reading: never the
 * written form alone (a voice given 今日 or 一日 picks a reading itself), and never where the word is blanked out, where
 * the card has several readings, or on a sentence or question card. The hidden answer is never spoken. */

const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const CLEAN = (value) => String(value ?? '').trim();

/** The review card's question side. `kind` is the card's kind ('word', 'kanji', 'sentence', 'question'); `printed` is
 * whether the asked word stands printed on this face and `blanked` whether it is blanked out of a sentence; `reading` is
 * the card's stored reading, `readings` every reading of a kanji. Returns { text, word } or null for no control. */
export function reviewFrontVoice({ kind, printed, blanked, label, reading, readings = [] }) {
  if (kind !== 'word' && kind !== 'kanji') return null;
  if (blanked || !printed) return null;
  const word = CLEAN(label);
  if (!word) return null;
  if (kind === 'kanji') {
    const all = [...new Set(readings.map(CLEAN).filter(Boolean))];
    return all.length === 1 && KANA_ONLY.test(all[0]) ? { text: all[0], word } : null;
  }
  const stored = CLEAN(reading);
  if (stored) return { text: stored, word };
  return KANA_ONLY.test(word) ? { text: word, word } : null;
}

/** The deck card's question side. `kind` is the player's kind key ('go' a word, 'ji' one kanji, 'bun' a grammar point);
 * `printed` is whether the card's word stands marked in its passage, `blanked` whether any gap stands where it was,
 * `choices` whether the face offers choices (which print other words); `reading` is the word's stored reading. */
export function deckFrontVoice({ kind, printed, blanked, choices, reading }) {
  if (kind !== 'go' || !printed || blanked || choices) return null;
  const text = CLEAN(reading);
  return text ? { text } : null;
}

/** The answer side's one turn: the stored reading first, then each further group (the card's sentence, then on the deck
 * card its definition and note), in that order, with nothing empty. */
export function answerReads(reading, ...groups) {
  const reads = [];
  const head = CLEAN(reading);
  if (head) reads.push({ text: head });
  for (const group of groups) for (const one of group || []) if (CLEAN(one?.text)) reads.push({ text: CLEAN(one.text) });
  return reads;
}

/** "Highlight what is being read": on unless the learner turned it off (Settings, 筆と声). Only 'off' turns it off. */
export const highlightOn = (stored) => stored !== 'off';
