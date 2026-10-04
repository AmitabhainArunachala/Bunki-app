/**
 * Cloze-deck engine for the 集中道場 deck player.
 *
 * A deck is a list of words; each word has one or more real sentences
 * (best first). The target word is marked in each one.
 * A word's next sentence opens only after the previous one has settled
 * into review, so the same word comes back in a new sentence instead of
 * three times in one day. No DOM here; the host supplies time and storage.
 */

export const DECK_FORMAT = 'bunki-cloze-deck';
export const STATE_FORMAT = 'bunki-cloze-state';
export const VERSION = 1;

/** FSRS card states (ts-fsrs): 0 new · 1 learning · 2 review · 3 relearning */
const REVIEW = 2;
/** a sibling opens once the one before it is in review with this much stability
 * (about two weeks: the word comes back in a new sentence once the first one is known) */
const UNLOCK_STABILITY_DAYS = 14;
/** …or sooner when the sentence before it keeps failing: a fresh context helps a leech */
const UNLOCK_AFTER_LAPSES = 3;
export const LEECH_LAPSES = 6;
export const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 };

export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function validateDeck(deck) {
  const problems = [];
  if (deck?.format !== DECK_FORMAT || deck.version !== VERSION) problems.push('not a bunki-cloze-deck v1');
  const groups = new Set((deck?.groups || []).map((g) => g.id));
  const ids = new Set();
  for (const word of deck?.words || []) {
    if (!groups.has(word.group)) problems.push(`${word.id}: unknown group ${word.group}`);
    if (!word.cards?.length) problems.push(`${word.id}: no cards`);
    for (const card of word.cards || []) {
      if (ids.has(card.id)) problems.push(`${card.id}: duplicate id`);
      ids.add(card.id);
      const text = card.ruby.map((seg) => seg[0]).join('');
      if (text !== card.ja) problems.push(`${card.id}: ruby does not spell the sentence`);
      if (card.ruby.filter((seg) => seg[2] === 1).length !== 1) problems.push(`${card.id}: needs exactly one target segment`);
    }
  }
  return problems;
}

/** index every card with its word, in deck order */
export function indexDeck(deck) {
  const cards = new Map();
  const words = new Map();
  for (const word of deck.words) {
    words.set(word.id, word);
    for (const card of word.cards) cards.set(card.id, { card, word });
  }
  return { cards, words };
}

export function createScheduler(fsrsApi, pin) {
  return fsrsApi.fsrs(
    fsrsApi.generatorParameters({
      w: pin.w.slice(),
      request_retention: pin.requestRetention,
      maximum_interval: pin.maximumInterval,
      enable_fuzz: pin.enableFuzz,
      enable_short_term: pin.enableShortTerm,
      learning_steps: pin.learningSteps,
      relearning_steps: pin.relearningSteps,
    }),
  );
}

export function emptyState(deckId) {
  return { format: STATE_FORMAT, version: VERSION, deckId, cards: {}, groupsOff: [], log: [] };
}

export function normalizeState(raw, deck) {
  if (!raw || raw.format !== STATE_FORMAT || raw.version !== VERSION || raw.deckId !== deck.id) {
    return emptyState(deck.id);
  }
  const known = new Set(deck.words.flatMap((w) => w.cards.map((c) => c.id)));
  const cards = {};
  for (const [id, stored] of Object.entries(raw.cards || {})) {
    if (known.has(id) && stored && typeof stored.due === 'string') cards[id] = stored;
  }
  return {
    ...emptyState(deck.id),
    cards,
    groupsOff: Array.isArray(raw.groupsOff) ? raw.groupsOff.filter((g) => typeof g === 'string') : [],
    log: Array.isArray(raw.log) ? raw.log.slice(-5000) : [],
  };
}

const isoOf = (value) => (value ? (value instanceof Date ? value : new Date(value)).toISOString() : null);

function freeze(card, introducedAt) {
  return {
    due: isoOf(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: isoOf(card.last_review),
    introducedAt,
  };
}

/** a stored card back to ts-fsrs's Card shape (dates as Date) */
function revive(stored) {
  return {
    ...stored,
    due: new Date(stored.due),
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  };
}

/** the next sentence of a word that may be introduced, or null */
function nextNewCard(word, state, unlockDays = UNLOCK_STABILITY_DAYS) {
  for (let i = 0; i < word.cards.length; i++) {
    const card = word.cards[i];
    const stored = state.cards[card.id];
    if (!stored) {
      if (i === 0) return card;
      const prev = state.cards[word.cards[i - 1].id];
      if (!prev) return null;
      if (prev.state === REVIEW && prev.stability >= unlockDays) return card;
      return (prev.lapses || 0) >= UNLOCK_AFTER_LAPSES ? card : null;
    }
  }
  return null;
}

export function introducedToday(state, now) {
  const day = dayKey(now);
  return Object.values(state.cards).filter((c) => c.introducedAt && dayKey(new Date(c.introducedAt)) === day).length;
}

/**
 * Today's work. Due cards first (most overdue first, one per word — a
 * sibling waits for tomorrow), then new sentences up to the daily cap, at
 * most one per word per day. Opening a queue writes nothing.
 */
export function buildQueue(deck, state, now, newPerDay) {
  const off = new Set(state.groupsOff);
  const due = [];
  const fresh = [];
  const busyWords = new Set();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  for (const word of deck.words) {
    if (off.has(word.group)) continue;
    for (const card of word.cards) {
      const stored = state.cards[card.id];
      if (!stored) continue;
      if (stored.introducedAt && dayKey(new Date(stored.introducedAt)) === dayKey(now)) busyWords.add(word.id);
      const learning = stored.state !== REVIEW;
      const dueAt = new Date(stored.due).getTime();
      if (dueAt <= (learning ? now.getTime() : endOfDay.getTime())) due.push({ card, word, dueAt });
    }
  }
  due.sort((a, b) => a.dueAt - b.dueAt);
  const seen = new Set();
  const dueOut = [];
  for (const item of due) {
    if (seen.has(item.word.id)) continue;
    seen.add(item.word.id);
    dueOut.push(item.card.id);
  }
  let room = Math.max(0, newPerDay - introducedToday(state, now));
  for (const word of deck.words) {
    if (!room) break;
    if (off.has(word.group) || seen.has(word.id) || busyWords.has(word.id)) continue;
    const card = nextNewCard(word, state, deck.unlockDays);
    if (card) {
      fresh.push(card.id);
      room--;
    }
  }
  return { due: dueOut, fresh, queue: [...dueOut, ...fresh] };
}

/** learning steps due inside the sitting (minutes away), soonest first */
export function learningSoon(deck, state, now, withinMs) {
  const off = new Set(state.groupsOff);
  const out = [];
  for (const word of deck.words) {
    if (off.has(word.group)) continue;
    for (const card of word.cards) {
      const s = state.cards[card.id];
      if (s && s.state !== REVIEW) {
        const t = new Date(s.due).getTime();
        if (t - now.getTime() <= withinMs) out.push({ id: card.id, t });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * The instant handed to the scheduler (append-order-monotonic-clamp-v1, named
 * in data/fsrs-pin.json): a clock that has moved behind the card's last review
 * is lifted to that review, so a backward device clock never throws or
 * reorders a card's history.
 */
export function effectiveReviewTime(stored, now) {
  if (stored?.last_review) {
    const last = new Date(stored.last_review);
    if (last.getTime() > now.getTime()) return last;
  }
  return now;
}

/**
 * One answer. The log row is [cardId, rating, effectiveIso], plus the raw
 * device time as a fourth element only when the clock was clamped.
 */
export function grade(fsrsApi, scheduler, state, cardId, rating, now) {
  const stored = state.cards[cardId] ?? null;
  const at = effectiveReviewTime(stored, now);
  const atIso = at.toISOString();
  const before = stored ? revive(stored) : fsrsApi.createEmptyCard(at);
  const next = scheduler.next(before, at, rating);
  const row = at === now ? [cardId, rating, atIso] : [cardId, rating, atIso, now.toISOString()];
  return {
    ...state,
    cards: { ...state.cards, [cardId]: freeze(next.card, stored?.introducedAt || atIso) },
    log: [...state.log.slice(-4999), row],
  };
}

/** what each answer would schedule, for the button labels */
export function preview(fsrsApi, scheduler, state, cardId, now) {
  const stored = state.cards[cardId] ?? null;
  const at = effectiveReviewTime(stored, now);
  const before = stored ? revive(stored) : fsrsApi.createEmptyCard(at);
  const all = scheduler.repeat(before, at);
  const out = {};
  for (const [name, r] of Object.entries(RATINGS)) out[name] = new Date(all[r].card.due).getTime() - now.getTime();
  return out;
}

/** per-word progress: the highest sentence in review, or learning/new */
export function wordStatus(word, state) {
  let reviewLv = 0;
  let started = false;
  let lapses = 0;
  for (const card of word.cards) {
    const s = state.cards[card.id];
    if (!s) continue;
    started = true;
    lapses += s.lapses || 0;
    if (s.state === REVIEW) reviewLv = Math.max(reviewLv, card.lv);
  }
  if (!started) return { key: 'new', lv: 0, lapses };
  if (lapses >= LEECH_LAPSES) return { key: 'hard', lv: reviewLv, lapses };
  if (reviewLv >= word.cards.length) return { key: 'known', lv: reviewLv, lapses };
  return { key: reviewLv ? 'growing' : 'learning', lv: reviewLv, lapses };
}

export function dueCount(deck, state, now) {
  return buildQueue(deck, state, now, 0).due.length;
}
