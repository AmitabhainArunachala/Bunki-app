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
/** a card that has lapsed this often is a leech: the back offers the repair ladder
 * (CARD_CONTRACT_V2 §4: swap the passage, add a hint, suspend) */
export const LEECH_LAPSES = 5;
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
      // marker 1 is the target; 2 marks the rest of the word on a 字 card; 3 is a repeat of the word, blanked with it
      if (card.ruby.filter((seg) => seg[2] === 1).length !== 1) problems.push(`${card.id}: needs exactly one target segment`);
      if (card.ruby.some((seg) => seg.length > 2 && ![1, 2, 3].includes(seg[2]))) problems.push(`${card.id}: unknown segment marker`);
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

/**
 * The ledger. Besides the FSRS records (cards) and the answer log, three optional keys
 * (absent in older ledgers, read as empty):
 *   suspended  { [cardId]: { at, by: 'delete' | 'swap' | 'leech' } } — out of every queue,
 *              its FSRS record kept untouched; 設定 › 復元 brings it back
 *   repairs    { [cardId]: { at, lapses, hint?, swap?, keep? } } — what the repair ladder did
 *              to a leech: a front hint, the card that replaced it, or 'carry on as it is'
 *   repairLog  [[cardId, action, iso, detail?]] — every delete, restore and ladder choice
 */
export function emptyState(deckId) {
  return { format: STATE_FORMAT, version: VERSION, deckId, cards: {}, groupsOff: [], log: [], suspended: {}, repairs: {}, repairLog: [] };
}

const SUSPEND_BY = ['delete', 'swap', 'leech'];
export const REPAIR_ACTIONS = ['delete', 'restore', 'swap', 'hint', 'suspend', 'keep'];
const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** suspended, repairs and repairLog as stored, keeping only well-formed entries */
function cleanRepairs(raw) {
  const suspended = {};
  for (const [id, s] of Object.entries(isPlain(raw.suspended) ? raw.suspended : {})) {
    if (isPlain(s) && isIso(s.at) && SUSPEND_BY.includes(s.by)) suspended[id] = { at: s.at, by: s.by };
  }
  const repairs = {};
  for (const [id, r] of Object.entries(isPlain(raw.repairs) ? raw.repairs : {})) {
    if (!isPlain(r) || !isIso(r.at) || !Number.isFinite(r.lapses)) continue;
    const out = { at: r.at, lapses: r.lapses };
    if (typeof r.hint === 'string' && r.hint) out.hint = r.hint;
    if (typeof r.swap === 'string' && r.swap) out.swap = r.swap;
    if (r.keep === true) out.keep = true;
    repairs[id] = out;
  }
  const repairLog = (Array.isArray(raw.repairLog) ? raw.repairLog : [])
    .filter((row) => Array.isArray(row) && typeof row[0] === 'string' && REPAIR_ACTIONS.includes(row[1]) && isIso(row[2]))
    .slice(-LOG_KEEP);
  return { suspended, repairs, repairLog };
}

/** a stored card that the scheduler can read back: a parseable due date, finite
 * numbers and a known FSRS state */
function isCardRecord(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return false;
  if (typeof stored.due !== 'string' || Number.isNaN(Date.parse(stored.due))) return false;
  if (stored.last_review != null && (typeof stored.last_review !== 'string' || Number.isNaN(Date.parse(stored.last_review)))) return false;
  for (const key of ['stability', 'difficulty', 'reps', 'lapses']) if (!Number.isFinite(stored[key])) return false;
  return Number.isInteger(stored.state) && stored.state >= 0 && stored.state <= 3;
}

const LOG_KEEP = 5000;

/**
 * What a pasted backup holds, without changing anything.
 * reason: null when ok, else 'not-an-object' | 'wrong-format' | 'wrong-version' |
 * 'wrong-deck' | 'empty' | 'bad-card'. cards = every record, known = records for
 * cards in this deck, orphans = records for cards no longer in it, log = answers kept.
 */
export function inspectState(raw, deck) {
  const out = { ok: false, reason: null, cards: 0, known: 0, orphans: 0, log: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...out, reason: 'not-an-object' };
  const cards = raw.cards;
  if (cards != null && (typeof cards !== 'object' || Array.isArray(cards))) return { ...out, reason: 'wrong-format' };
  const entries = Object.entries(cards || {});
  const ids = new Set(deck.words.flatMap((w) => w.cards.map((c) => c.id)));
  out.cards = entries.length;
  out.known = entries.filter(([id]) => ids.has(id)).length;
  out.orphans = out.cards - out.known;
  out.log = Array.isArray(raw.log) ? Math.min(raw.log.length, LOG_KEEP) : 0;
  if (!entries.length) return { ...out, reason: 'empty' };
  if (raw.format !== STATE_FORMAT) return { ...out, reason: 'wrong-format' };
  if (raw.version !== VERSION) return { ...out, reason: 'wrong-version' };
  if (raw.deckId !== deck.id) return { ...out, reason: 'wrong-deck' };
  if (!entries.every(([, stored]) => isCardRecord(stored))) return { ...out, reason: 'bad-card' };
  return { ...out, ok: true };
}

/**
 * The stored ledger, cleaned. A ledger for another deck, format or version is
 * not read at all. Inside it, only malformed card records are dropped: a record
 * for a card that is no longer in the deck (an orphan) is kept, so a later deck
 * build that brings the card back finds its history. Orphans are inert:
 * buildQueue, introducedToday (via buildQueue), wordStatus and learningSoon
 * all walk the deck's own cards, never state.cards.
 */
export function normalizeState(raw, deck) {
  if (!raw || raw.format !== STATE_FORMAT || raw.version !== VERSION || raw.deckId !== deck.id) {
    return emptyState(deck.id);
  }
  const cards = {};
  const stored = raw.cards && typeof raw.cards === 'object' && !Array.isArray(raw.cards) ? raw.cards : {};
  for (const [id, record] of Object.entries(stored)) {
    if (isCardRecord(record)) cards[id] = record;
  }
  return {
    ...emptyState(deck.id),
    cards,
    groupsOff: Array.isArray(raw.groupsOff) ? raw.groupsOff.filter((g) => typeof g === 'string') : [],
    log: Array.isArray(raw.log) ? raw.log.slice(-LOG_KEEP) : [],
    ...cleanRepairs(raw),
  };
}

/* ------------------------------------------------ delete, leech repair (CARD_CONTRACT_V2 §4) */
export const isSuspended = (state, cardId) => !!state.suspended?.[cardId];

const logRepair = (state, row) => [...(state.repairLog || []).slice(-(LOG_KEEP - 1)), row];

/** take a card out of every queue without touching its FSRS record or id; by: delete | swap | leech */
export function suspendCard(state, cardId, by, now, action = by === 'leech' ? 'suspend' : by) {
  const at = now.toISOString();
  const repairs = by === 'leech' ? { ...state.repairs, [cardId]: { ...state.repairs?.[cardId], at, lapses: state.cards[cardId]?.lapses ?? 0 } } : state.repairs || {};
  return { ...state, suspended: { ...state.suspended, [cardId]: { at, by } }, repairs, repairLog: logRepair(state, [cardId, action, at]) };
}

/** bring suspended cards back (all of them when ids is omitted); their records were never touched */
export function restoreSuspended(state, now, ids = Object.keys(state.suspended || {})) {
  const at = now.toISOString();
  const suspended = { ...state.suspended };
  let repairLog = state.repairLog || [];
  for (const id of ids) {
    if (!suspended[id]) continue;
    delete suspended[id];
    repairLog = [...repairLog.slice(-(LOG_KEEP - 1)), [id, 'restore', at]];
  }
  return { ...state, suspended, repairLog };
}

/** a card the ladder should be offered for: lapsed LEECH_LAPSES times, and again since its last repair */
export function isLeech(state, cardId) {
  const s = state.cards[cardId];
  if (!s || isSuspended(state, cardId)) return false;
  const lapses = s.lapses || 0;
  const last = state.repairs?.[cardId];
  return lapses >= LEECH_LAPSES && (!last || lapses > last.lapses);
}

/**
 * The passage the ladder's first step swaps in: the word's next card that has never been
 * shown and is not suspended, of the same kind (a 語 passage for a 語 card) and from another
 * passage. A 字 card has none (its kanji are asked in the first passage only). Null when the
 * word has no such card left.
 */
export function swapTarget(word, card, state) {
  return (
    word.cards.find(
      (c) => c.id !== card.id && !state.cards[c.id] && !isSuspended(state, c.id) && (c.type || null) === (card.type || null) && (!card.type || c.passage !== card.passage),
    ) || null
  );
}

/** ladder step one: the leech is suspended (record kept, so the word keeps its progress) and the
 * next unseen passage of the word is due at once in its place */
export function swapCard(word, card, state, now) {
  const to = swapTarget(word, card, state);
  if (!to) return null;
  const at = now.toISOString();
  const lapses = state.cards[card.id]?.lapses ?? 0;
  return {
    to: to.id,
    state: {
      ...state,
      suspended: { ...state.suspended, [card.id]: { at, by: 'swap' } },
      repairs: { ...state.repairs, [card.id]: { ...state.repairs?.[card.id], at, lapses, swap: to.id } },
      repairLog: logRepair(state, [card.id, 'swap', at, to.id]),
    },
  };
}

/** ladder step two (a hint on the front of this card only) or 'keep' (carry on, ask again after the next lapse) */
export function repairCard(state, cardId, action, now, hint = '') {
  const at = now.toISOString();
  const lapses = state.cards[cardId]?.lapses ?? 0;
  const prev = state.repairs?.[cardId] || {};
  const entry = action === 'hint' ? { ...prev, at, lapses, hint } : { ...prev, at, lapses, keep: true };
  return { ...state, repairs: { ...state.repairs, [cardId]: entry }, repairLog: logRepair(state, action === 'hint' ? [cardId, 'hint', at, hint] : [cardId, 'keep', at]) };
}

/** swapped-in passages that have not been shown yet: card id → when the swap made them due */
function swapDue(state) {
  const out = new Map();
  for (const r of Object.values(state.repairs || {})) if (r.swap && !state.cards[r.swap] && !isSuspended(state, r.swap)) out.set(r.swap, Date.parse(r.at));
  return out;
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

/** the next sentence of a word that may be introduced, or null. A suspended card that was
 * never shown holds the word there until it is restored. */
function nextNewCard(word, state, unlockDays = UNLOCK_STABILITY_DAYS) {
  for (let i = 0; i < word.cards.length; i++) {
    const card = word.cards[i];
    const stored = state.cards[card.id];
    if (!stored) {
      if (isSuspended(state, card.id)) return null;
      if (i === 0) return card;
      const prev = state.cards[word.cards[i - 1].id];
      if (!prev) return null;
      if (prev.state === REVIEW && prev.stability >= unlockDays) return card;
      return (prev.lapses || 0) >= UNLOCK_AFTER_LAPSES ? card : null;
    }
  }
  return null;
}

/** cards first shown today; with a deck, only that deck's cards count (orphans do not) */
export function introducedToday(state, now, deck) {
  const day = dayKey(now);
  const records = deck ? deck.words.flatMap((w) => w.cards.map((c) => state.cards[c.id]).filter(Boolean)) : Object.values(state.cards);
  return records.filter((c) => c.introducedAt && dayKey(new Date(c.introducedAt)) === day).length;
}

/**
 * Today's work. Due cards first (most overdue first, one per word — a
 * sibling waits for tomorrow), then new sentences up to the daily cap, at
 * most one per word per day. Suspended cards are never in it; a passage the
 * repair ladder swapped in is due from the moment of the swap. Opening a
 * queue writes nothing.
 */
export function buildQueue(deck, state, now, newPerDay) {
  const off = new Set(state.groupsOff);
  const due = [];
  const fresh = [];
  const busyWords = new Set();
  const swapped = swapDue(state);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  for (const word of deck.words) {
    if (off.has(word.group)) continue;
    for (const card of word.cards) {
      if (isSuspended(state, card.id)) continue;
      const stored = state.cards[card.id];
      if (!stored) {
        if (swapped.has(card.id)) due.push({ card, word, dueAt: swapped.get(card.id) });
        continue;
      }
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
  let room = Math.max(0, newPerDay - introducedToday(state, now, deck));
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
      if (s && s.state !== REVIEW && !isSuspended(state, card.id)) {
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
