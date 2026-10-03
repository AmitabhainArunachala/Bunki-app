/**
 * Portable study engine for one Bunki context deck.
 *
 * The deck file is content. This module is the scheduler and the cloze.
 * Neither knows about the corridor's learner store. A host (the bookshelf
 * room, the standalone page, a test) supplies time, storage, and FSRS.
 */

export const DECK_FORMAT = 'bunki-srs-deck';
export const STATE_FORMAT = 'bunki-srs-deck-state';
export const DECK_VERSION = 1;
export const STATE_VERSION = 1;

const SENTENCE_END = /[。！？]$/u;
const WORD_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function codePoints(value) {
  return Array.from(value);
}

export function paragraphOf(card) {
  return card.sentences.join('');
}

export function sentenceCount(card) {
  return card.sentences.length;
}

/**
 * Blank the single occurrence of `target`. The blank scales with the
 * target so a one-character word and a long compound are not the same hole.
 */
export function clozeParagraph(paragraph, target) {
  const at = paragraph.indexOf(target);
  if (at < 0) {
    throw new Error(`target missing from paragraph: ${target}`);
  }
  if (paragraph.indexOf(target, at + target.length) !== -1) {
    throw new Error(`target occurs more than once: ${target}`);
  }
  const width = Math.min(10, Math.max(2, codePoints(target).length));
  const blank = `［${'　'.repeat(width)}］`;
  return `${paragraph.slice(0, at)}${blank}${paragraph.slice(at + target.length)}`;
}

export function markedParagraph(paragraph, target) {
  const at = paragraph.indexOf(target);
  if (at < 0) return paragraph;
  return {
    before: paragraph.slice(0, at),
    target,
    after: paragraph.slice(at + target.length),
  };
}

function isWordChar(ch) {
  return ch !== '' && WORD_CHAR.test(ch);
}

const HIRAGANA_PARTICLE = new Set(['が', 'を', 'に', 'へ', 'と', 'で', 'は', 'も', 'の', 'や', 'ね', 'よ', 'ば']);

function isKatakanaChar(ch) {
  return /\p{Script=Katakana}/u.test(ch) || ch === 'ー';
}

function scriptOf(text) {
  const chars = codePoints(text);
  if (chars.every((ch) => /\p{Script=Hiragana}/u.test(ch))) return 'hiragana';
  if (chars.every((ch) => isKatakanaChar(ch))) return 'katakana';
  if (chars.some((ch) => /\p{Script=Han}/u.test(ch))) return 'han';
  return 'other';
}

/**
 * The cloze span must be the whole target, not a piece of a longer token.
 * Hiragana and katakana targets need a hard edge on both sides (so なお is
 * not the start of なおかつ). Kanji targets may take hiragana inflection
 * after them (見分けるには) but may not sit inside another kanji word.
 */
export function clozeSpanIsBounded(paragraph, target) {
  const at = paragraph.indexOf(target);
  if (at < 0) return false;
  const chars = codePoints(paragraph);
  const targetChars = codePoints(target);
  let start = 0;
  let index = 0;
  for (let i = 0; i < chars.length; i += 1) {
    if (index === at) {
      start = i;
      break;
    }
    index += chars[i].length;
  }
  const end = start + targetChars.length;
  const before = start === 0 ? '' : chars[start - 1];
  const after = end >= chars.length ? '' : chars[end];
  const kind = scriptOf(target);
  const beforeOk =
    before === '' ||
    !isWordChar(before) ||
    ((kind === 'hiragana' || kind === 'katakana') && HIRAGANA_PARTICLE.has(before)) ||
    (kind === 'han' && !/\p{Script=Han}|\p{Script=Katakana}/u.test(before));
  const afterOk =
    after === '' ||
    !isWordChar(after) ||
    ((kind === 'hiragana' || kind === 'katakana') && HIRAGANA_PARTICLE.has(after)) ||
    (kind === 'katakana' && /\p{Script=Hiragana}/u.test(after)) ||
    (kind === 'han' && !/\p{Script=Han}|\p{Script=Katakana}/u.test(after));
  return beforeOk && afterOk;
}

function fail(errors, message) {
  errors.push(message);
}

function checkCard(card, index, errors) {
  const where = `cards[${index}]`;
  if (!card || typeof card !== 'object') {
    fail(errors, `${where} is not an object`);
    return;
  }
  for (const key of ['id', 'target', 'reading', 'glossJa', 'glossEn', 'sentences']) {
    if (typeof card[key] !== 'string' && key !== 'sentences') {
      fail(errors, `${where}.${key} must be a string`);
    }
  }
  if (typeof card.id === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.id)) {
    fail(errors, `${where}.id must be a lowercase slug`);
  }
  if (typeof card.target === 'string' && card.target.length === 0) {
    fail(errors, `${where}.target is empty`);
  }
  if (!Array.isArray(card.sentences)) {
    fail(errors, `${where}.sentences must be an array`);
    return;
  }
  if (card.sentences.length < 3 || card.sentences.length > 5) {
    fail(errors, `${where} (${card.target}) needs 3–5 sentences, has ${card.sentences.length}`);
  }
  card.sentences.forEach((sentence, sentenceIndex) => {
    if (typeof sentence !== 'string' || !SENTENCE_END.test(sentence)) {
      fail(errors, `${where}.sentences[${sentenceIndex}] must end with 。！ or ？`);
    }
  });
  if (card.note != null && typeof card.note !== 'string') {
    fail(errors, `${where}.note must be a string or null`);
  }
  if (card.seeAlso != null && !Array.isArray(card.seeAlso)) {
    fail(errors, `${where}.seeAlso must be an array`);
  }
  if (typeof card.target === 'string' && Array.isArray(card.sentences)) {
    const paragraph = paragraphOf(card);
    const chars = codePoints(paragraph).length;
    if (chars < 70 || chars > 420) {
      fail(errors, `${where} (${card.target}) paragraph length ${chars} is outside 70–420`);
    }
    const occurrences = paragraph.split(card.target).length - 1;
    if (occurrences !== 1) {
      fail(errors, `${where} (${card.target}) occurs ${occurrences} times`);
    } else if (!clozeSpanIsBounded(paragraph, card.target)) {
      fail(errors, `${where} (${card.target}) cloze span is glued to another word`);
    }
    if (/[A-Za-z]/.test(paragraph)) {
      fail(errors, `${where} (${card.target}) paragraph contains Latin letters`);
    }
  }
}

export function validateDeck(deck) {
  const errors = [];
  if (!deck || deck.format !== DECK_FORMAT || deck.version !== DECK_VERSION) {
    fail(errors, 'deck format/version mismatch');
  }
  if (typeof deck.id !== 'string' || deck.id.length === 0) fail(errors, 'deck.id missing');
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) fail(errors, 'deck.cards missing');
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  const ids = new Set();
  const targets = new Map();
  for (let i = 0; i < cards.length; i += 1) {
    checkCard(cards[i], i, errors);
    if (cards[i] && typeof cards[i].id === 'string') {
      if (ids.has(cards[i].id)) fail(errors, `duplicate id ${cards[i].id}`);
      ids.add(cards[i].id);
    }
    if (cards[i] && typeof cards[i].target === 'string') {
      if (targets.has(cards[i].target)) fail(errors, `duplicate target ${cards[i].target}`);
      targets.set(cards[i].target, cards[i]);
    }
  }
  for (const card of cards) {
    if (!card || !Array.isArray(card.seeAlso)) continue;
    for (const otherId of card.seeAlso) {
      if (!ids.has(otherId)) fail(errors, `${card.id} seeAlso missing ${otherId}`);
      const other = cards.find((candidate) => candidate.id === otherId);
      if (other && !(other.seeAlso || []).includes(card.id)) {
        fail(errors, `${card.id} seeAlso ${otherId} is not returned`);
      }
    }
    for (const [otherTarget, other] of targets) {
      if (other === card || otherTarget === card.target) continue;
      if (otherTarget.includes(card.target) && paragraphOf(card).includes(otherTarget)) {
        fail(errors, `${card.id} contains the longer target ${otherTarget}`);
      }
    }
  }
  return errors;
}

function stableHash(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return hash >>> 0;
}

/**
 * The authored sentence always introduced the word first, so every gap sat
 * on the opening line. Slide that sentence later. Sentences that point
 * backward (その, この, …) stay after the word. The cut is stable per card.
 */
export function placeCloze(card) {
  const sentences = [...card.sentences];
  const targetAt = sentences.findIndex((sentence) => sentence.includes(card.target));
  if (targetAt < 0) return { ...card, sentences };
  const others = sentences.filter((_, index) => index !== targetAt);
  const backward = /^(その|この|それ|これ|本人|前者|後者|同じ|そこでは|その後|それでも)/;
  const leadable = others.filter((sentence) => !backward.test(sentence));
  const tied = others.filter((sentence) => backward.test(sentence));
  const weights = [];
  for (let i = 0; i <= leadable.length; i += 1) weights.push(i === 0 ? 1 : (i + 1) * (i + 1));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  let roll = stableHash(card.id) % sum;
  let before = leadable.length;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) {
      before = i;
      break;
    }
  }
  return {
    ...card,
    sentences: [
      ...leadable.slice(0, before),
      sentences[targetAt],
      ...leadable.slice(before),
      ...tied,
    ],
  };
}

export function assembleDeck(cards, meta) {
  const deck = {
    format: DECK_FORMAT,
    version: DECK_VERSION,
    id: meta.id,
    titleJa: meta.titleJa,
    titleEn: meta.titleEn,
    style: 'mcd-paragraph',
    newPerDay: meta.newPerDay,
    provenance: meta.provenance,
    cards: cards.map((card) => {
      const placed = placeCloze(card);
      return {
        id: placed.id,
        target: placed.target,
        reading: placed.reading,
        readings: placed.readings ? [...placed.readings] : [placed.reading],
        glossJa: placed.glossJa,
        glossEn: placed.glossEn,
        sentences: [...placed.sentences],
        note: placed.note ?? null,
        seeAlso: placed.seeAlso ? [...placed.seeAlso] : [],
      };
    }),
  };
  const errors = validateDeck(deck);
  if (errors.length) {
    const error = new Error(`deck failed validation\n${errors.join('\n')}`);
    error.errors = errors;
    throw error;
  }
  return deck;
}

export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createScheduler(fsrsApi, pin) {
  const parameters = fsrsApi.generatorParameters({
    w: pin.w.slice(),
    request_retention: pin.requestRetention,
    maximum_interval: pin.maximumInterval,
    enable_fuzz: pin.enableFuzz,
    enable_short_term: pin.enableShortTerm,
    learning_steps: pin.learningSteps,
    relearning_steps: pin.relearningSteps,
  });
  return fsrsApi.fsrs(parameters);
}

function reviveCard(stored, TypeConvert) {
  return TypeConvert.card({
    due: stored.due,
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsed_days,
    scheduled_days: stored.scheduled_days,
    learning_steps: stored.learning_steps,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state,
    last_review: stored.last_review ?? undefined,
  });
}

function freezeCard(card, introducedAt) {
  return {
    due: card.due instanceof Date ? card.due.toISOString() : new Date(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review
      ? card.last_review instanceof Date
        ? card.last_review.toISOString()
        : new Date(card.last_review).toISOString()
      : null,
    introducedAt,
  };
}

export function emptyState(deckId) {
  return { format: STATE_FORMAT, version: STATE_VERSION, deckId, cards: {} };
}

export function normalizeState(raw, deck) {
  if (!raw || typeof raw !== 'object') return emptyState(deck.id);
  if (raw.format !== STATE_FORMAT || raw.version !== STATE_VERSION || raw.deckId !== deck.id) {
    return emptyState(deck.id);
  }
  const known = new Set(deck.cards.map((card) => card.id));
  const cards = {};
  for (const [id, stored] of Object.entries(raw.cards || {})) {
    if (!known.has(id) || !stored || typeof stored !== 'object') continue;
    if (typeof stored.due !== 'string' || typeof stored.reps !== 'number') continue;
    cards[id] = stored;
  }
  return { format: STATE_FORMAT, version: STATE_VERSION, deckId: deck.id, cards };
}

export function introducedOnDay(state, day) {
  return Object.values(state.cards).filter((card) => card.introducedAt && dayKey(new Date(card.introducedAt)) === day)
    .length;
}

/**
 * Due reviews first, then new cards up to the daily introduction cap.
 * Nothing is written: opening a queue is not a review.
 */
export function studyQueue(deck, state, now) {
  const day = dayKey(now);
  const room = Math.max(0, deck.newPerDay - introducedOnDay(state, day));
  const due = [];
  for (const card of deck.cards) {
    const stored = state.cards[card.id];
    if (!stored) continue;
    if (new Date(stored.due).getTime() <= now.getTime()) due.push(card);
  }
  due.sort((a, b) => new Date(state.cards[a.id].due) - new Date(state.cards[b.id].due) || a.id.localeCompare(b.id));
  const fresh = [];
  for (const card of deck.cards) {
    if (fresh.length >= room) break;
    if (!state.cards[card.id]) fresh.push(card);
  }
  return { due, fresh, queue: [...due, ...fresh] };
}

export function counts(deck, state, now) {
  const queue = studyQueue(deck, state, now);
  let learning = 0;
  for (const stored of Object.values(state.cards)) {
    if (stored.state === 1 || stored.state === 3) learning += 1;
  }
  const unseen = deck.cards.filter((card) => !state.cards[card.id]).length;
  return {
    total: deck.cards.length,
    unseen,
    learning,
    due: queue.due.length,
    newToday: queue.fresh.length,
    queued: queue.queue.length,
  };
}

/**
 * Apply one FSRS grade. `now` is the review instant. The first grade stamps
 * `introducedAt`; later grades keep it.
 */
export function grade(fsrsApi, scheduler, state, cardId, rating, now) {
  const stored = state.cards[cardId] ?? null;
  const before = stored
    ? reviveCard(stored, fsrsApi.TypeConvert)
    : fsrsApi.createEmptyCard(now);
  const scheduled = scheduler.next(before, now, rating);
  const introducedAt = stored?.introducedAt || now.toISOString();
  return {
    ...state,
    cards: {
      ...state.cards,
      [cardId]: freezeCard(scheduled.card, introducedAt),
    },
  };
}

export function basicTsv(deck) {
  const lines = ['id\tfront\tback'];
  for (const card of deck.cards) {
    const paragraph = paragraphOf(card);
    const front = clozeParagraph(paragraph, card.target);
    const readings = (card.readings || [card.reading]).join('・');
    const back = [
      card.target,
      readings,
      card.glossJa,
      card.glossEn,
      paragraph,
      card.note || '',
    ].join('\n');
    lines.push([card.id, front, back].map(tsvField).join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

function tsvField(value) {
  return String(value).replaceAll('\t', ' ').replaceAll('\r', '');
}

export const RATINGS = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};
