/**
 * The one schedule owner for every spaced-repetition surface: the corridor's saved-word review,
 * the deck player (N2, N1, 専門, 言葉の鉱脈), the context deck and your own texts.
 *
 * It holds four things and nothing else, with no DOM and no storage:
 *   1. how the FSRS scheduler is built from data/fsrs-pin.json (createScheduler);
 *   2. the review-time clamp the pin names (append-order-monotonic-clamp-v1, reviewInstant);
 *   3. the sitting rule, Anki's: a learning or relearning card comes back only when its step is
 *      due; when nothing else is left, the learner may choose to review steps due within
 *      LEARN_AHEAD_MS early, or let them wait (nextStep); and the gate that refuses to grade a card
 *      that is not due now (servable);
 *   4. the close: what a sitting did, counted from its own answers (sittingTally, closeLines,
 *      pauseWords);
 *   5. burying across surfaces: once a word is answered on one surface today, its cards on the
 *      others wait until tomorrow (answeredToday, buriedHere, noteAnswered);
 *   6. review hooks: whether a world, quest, room, ride or course attempt may grade an existing card
 *      (decideReview), and the one commit order every surface grading a word follows under one Web
 *      Lock (admitAnswer, reserveAnswered, releaseAnswered, refusalWords).
 *
 * Each surface keeps its own ledger (no learner record moves); every one of them asks this module.
 */

/** FSRS card states (ts-fsrs): 0 new · 1 learning · 2 review · 3 relearning */
export const NEW = 0;
export const LEARNING = 1;
export const REVIEW = 2;
export const RELEARNING = 3;

/** Anki's learn-ahead limit: with nothing else left in the sitting, a learning step due within this
 * long may be shown early instead of making the learner wait */
export const LEARN_AHEAD_MS = 20 * 60e3;

/**
 * ts-fsrs generatorParameters input from the pin. `learner` is the corridor's validated learner
 * policy ({ w, retention, learningSteps }, each optional); the decks pass none. Fuzz, short-term,
 * the maximum interval and relearning steps are always the pin's.
 */
export function schedulerInput(pin, learner = null) {
  return {
    w: (learner?.w || pin.w).slice(),
    request_retention: learner?.retention ?? pin.requestRetention,
    maximum_interval: pin.maximumInterval,
    enable_fuzz: pin.enableFuzz,
    enable_short_term: pin.enableShortTerm,
    learning_steps: (learner?.learningSteps || pin.learningSteps).slice(),
    relearning_steps: pin.relearningSteps.slice(),
  };
}

export function createScheduler(fsrsApi, pin, learner = null) {
  return fsrsApi.fsrs(fsrsApi.generatorParameters(schedulerInput(pin, learner)));
}

/**
 * The instant handed to the scheduler (append-order-monotonic-clamp-v1): a clock that has moved
 * behind the card's last review is lifted to that review, so a backward device clock never throws
 * or reorders a card's history. lastReview: Date | ISO string | null.
 */
export function reviewInstant(lastReview, now) {
  if (lastReview) {
    const last = lastReview instanceof Date ? lastReview : new Date(lastReview);
    if (last.getTime() > now.getTime()) return new Date(last.getTime());
  }
  return now;
}

const dueMs = (record) => (record.due instanceof Date ? record.due.getTime() : Date.parse(record.due));
export const isLearning = (record) => !!record && (record.state === LEARNING || record.state === RELEARNING);

/** the last millisecond of `now`'s local day (a surface with its own day passes servable a dayEnd) */
export function endOfDay(now) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/**
 * May this card be answered as a real review now? A card never graded is; a learning or
 * relearning card when its step is due (or, with learnAhead, due within LEARN_AHEAD_MS); a review
 * card when it falls due today (dayEnd: the surface's end of today, epoch ms). Every surface asks
 * this before it writes a grade, so a stale queue, a second window or a practice lap can never
 * record an early review.
 */
export function servable(record, now, { learnAhead = false, dayEnd = endOfDay(now) } = {}) {
  if (!record || record.state === NEW) return true;
  const due = dueMs(record);
  if (!Number.isFinite(due)) return false;
  if (isLearning(record)) return due <= now.getTime() + (learnAhead ? LEARN_AHEAD_MS : 0);
  return due <= dayEnd;
}

/**
 * The sitting's next move, Anki's order:
 *   1. a learning step that is due now (soonest first);
 *   2. else the next card still waiting in the sitting (due reviews, new cards), in order;
 *   3. else, with nothing else left and the learner having chosen to review ahead (ahead): a step
 *      due within learnAheadMs, shown early;
 *   4. else, cards still in a learning step: pause. The sitting's close counts what happened and
 *      offers the honest choice: review them now, early (only when canEarly), or they wait;
 *   5. else done.
 * queue: ids still to show, in order (never the learning cards). learning: [{ id, due }] (due in
 * epoch ms) for every learning or relearning card of the sitting's scope that is not in queue.
 * Returns { show, early } | { pause: true, count, at, canEarly } | { done: true }.
 */
export function nextStep({ now, queue = [], learning = [], ahead = false, learnAheadMs = LEARN_AHEAD_MS }) {
  const t = now.getTime();
  const steps = learning.filter((l) => Number.isFinite(l.due)).sort((a, b) => a.due - b.due);
  if (steps.length && steps[0].due <= t) return { show: steps[0].id, early: false };
  if (queue.length) return { show: queue[0], early: false };
  if (!steps.length) return { done: true };
  const canEarly = steps[0].due - t <= learnAheadMs;
  if (ahead && canEarly) return { show: steps[0].id, early: true };
  return { pause: true, count: steps.length, at: steps[0].due, canEarly };
}

/**
 * What a sitting did, from its own answers. rows: one per answer, in order:
 *   { word, before, rating, early }  word: the word's identity (term or key); before: the card's
 *   FSRS state before this answer (null or 0 for a card never answered); rating 1–4; early: shown
 *   by learn-ahead. learning: the cards still learning after the sitting, [{ due }].
 */
export function sittingTally(rows, { learning = [], startedAt = null, now = new Date() } = {}) {
  const firstSeen = new Map();
  for (const r of rows) if (!firstSeen.has(r.word)) firstSeen.set(r.word, r);
  const isNew = (r) => r.before == null || r.before === NEW;
  const words = firstSeen.size;
  const newWords = [...firstSeen.values()].filter(isNew).length;
  const reviewWords = [...firstSeen.values()].filter((r) => r.before === REVIEW).length;
  const returns = rows.filter((r) => r.before === LEARNING || r.before === RELEARNING).length;
  const early = rows.filter((r) => r.early).length;
  const againWords = new Set(rows.filter((r) => r.rating === 1).map((r) => r.word)).size;
  const againAnswers = rows.filter((r) => r.rating === 1).length;
  const nextDue = learning.map((l) => (l.due instanceof Date ? l.due.getTime() : Number(l.due))).filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null;
  const secs = startedAt == null ? 0 : Math.max(0, Math.round((now.getTime() - startedAt) / 1000));
  return {
    answers: rows.length,
    words,
    newWords,
    reviewWords,
    returns,
    early,
    againWords,
    againAnswers,
    stillLearning: learning.length,
    nextDue,
    minutes: Math.max(1, Math.round(secs / 60)),
    seconds: secs,
  };
}

/** a wait in the app's words: 1 min, 8 min, 2 hr, 1 day, 6 days, 2 months, 1.5 years; 1分 … 6日, 2か月, 1.5年 */
export function waitWords(ms, lang = 'en') {
  const MIN = 60e3;
  const DAY = 864e5;
  const ja = lang === 'ja';
  if (ms < 60 * MIN) {
    const min = Math.max(1, Math.round(ms / MIN));
    return ja ? `${min}分` : `${min} min`;
  }
  if (ms < DAY) {
    const hr = Math.round(ms / (60 * MIN));
    return ja ? `${hr}時間` : `${hr} hr`;
  }
  const count = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
  if (ms < 30 * DAY) return ja ? `${Math.round(ms / DAY)}日` : count(Math.round(ms / DAY), 'day');
  if (ms < 365 * DAY) return ja ? `${Math.round(ms / (30 * DAY))}か月` : count(Math.round(ms / (30 * DAY)), 'month');
  const years = Number((ms / (365 * DAY)).toFixed(1));
  return ja ? `${years}年` : `${years} ${years === 1 ? 'year' : 'years'}`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The close in plain words, every number from the tally, in English or 日本語:
 *   [0] what was met: new words, reviews, answers, minutes;
 *   [1] why answers exceed words: the learning-step returns (and how many came early, by the
 *       learner's choice with nothing else left), and how many words needed Again.
 */
export function closeLines(tally, lang = 'en') {
  const { newWords, reviewWords, answers, minutes, returns, early, againWords } = tally;
  const out = [];
  if (lang === 'ja') {
    const met = [newWords ? `新しい語 ${newWords}` : '', reviewWords ? `復習 ${reviewWords}` : ''].filter(Boolean).join('・');
    out.push(`${met ? `${met}・` : ''}回答 ${answers}（${minutes} 分）。`);
    const parts = [];
    if (returns) parts.push(`学習ステップで戻った札 ${returns}${early ? `（うち ${early} はほかに札がなく少し早めに）` : ''}`);
    if (againWords) parts.push(`もう一度 ${againWords} 語`);
    if (parts.length) out.push(`${parts.join('、')}。`);
    return out;
  }
  const met = [newWords ? plural(newWords, 'new word') : '', reviewWords ? plural(reviewWords, 'review') : ''].filter(Boolean).join(' and ');
  out.push(`${met ? `${met} · ` : ''}${plural(answers, 'answer')} in ${plural(minutes, 'minute')}.`);
  const parts = [];
  const earlyWords = early === returns ? (returns === 1 ? 'a few minutes early' : 'all a few minutes early') : `${early} a few minutes early`;
  if (returns) parts.push(`${returns === 1 ? 'a card came back' : `cards came back ${returns} times`} for a learning step${early ? ` (${earlyWords}, with nothing else left)` : ''}`);
  if (againWords) parts.push(`${plural(againWords, 'word')} needed Again`);
  if (parts.length) {
    const s = parts.join('; ');
    out.push(`${s[0].toUpperCase()}${s.slice(1)}.`);
  }
  return out;
}

/**
 * The close's honest choice while cards are still in a learning step (nextStep's pause), as text:
 * count: the distinct words still in a step. line: "5 words are in a learning step (the next is due in 8 min): review them now, early, or they
 * will wait for you." — or, past the learn-ahead limit, only that they will wait; now: the label of
 * the button that reviews them now (null past the limit; "Review them now" once one is due).
 */
export function pauseWords(pause, lang = 'en', now = new Date()) {
  const { count, at, canEarly } = pause;
  const left = Math.max(0, at - now.getTime());
  const due = left === 0;
  if (lang === 'ja') {
    const head = `${count} 語が学習ステップの途中です（${due ? '次はもう復習できます' : `次は ${waitWords(left, 'ja')}後`}）。`;
    return {
      line: canEarly ? `${head}${due ? 'いま復習するか' : 'いま少し早めに復習するか'}、そのまま待たせておけます。` : `${head}その時まで待っています。`,
      now: canEarly ? (due ? 'いま復習する' : 'いま復習する（少し早め）') : null,
    };
  }
  const head = `${plural(count, 'word')} ${count === 1 ? 'is' : 'are'} in a learning step (${due ? 'the next is due now' : `the next is due in ${waitWords(left)}`})`;
  return {
    line: canEarly ? `${head}: review ${count === 1 ? 'it' : 'them'} now${due ? '' : ', early'}, or ${count === 1 ? 'it' : 'they'} will wait for you.` : `${head}; ${count === 1 ? 'it' : 'they'} will wait for you.`,
    now: canEarly ? (due ? 'Review now' : 'Review now, early') : null,
  };
}

/* ---------------------------------------------------------------- burying across surfaces
 * Lead's ruling 10-19: once a word (its lemma and reading) is answered on any surface today (the
 * learner's local day), its cards on the OTHER surfaces — the other decks, the context deck, the
 * saved word: card — wait until tomorrow. A kanji card (a 字 card, a kanji: card) is another skill:
 * it neither buries nor is buried. A card already in its own learning steps keeps its steps. No
 * schedule is merged and no record moves: the day's answered words are one small key every surface
 * reads, and writes after a real answer (practice never writes it). */
export const ANSWERED_KEY = 'bunki-srs:answered-today';

const toHiragana = (text) => String(text || '').replace(/[\u30a1-\u30f6]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
/** a word's identity on every surface: its lemma and its reading in hiragana ('検証|けんしょう') */
export function wordIdentity(term, reading) {
  return `${term}|${toHiragana(reading || term)}`;
}

/** the learner's day, local midnight to midnight */
export function dayOf(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** today's answered words, { [identity]: [where, ...] } (empty on a new day, or without storage) */
export function answeredToday(storage, now) {
  try {
    const raw = JSON.parse(storage?.getItem(ANSWERED_KEY) || 'null');
    if (raw && raw.day === dayOf(now) && raw.words && typeof raw.words === 'object' && !Array.isArray(raw.words)) return raw.words;
  } catch {
    /* unreadable: nothing is buried */
  }
  return {};
}

/** is this word buried here today: answered on a surface other than `where`? A side that does not
 * know the reading (reading null) matches the lemma's every reading. */
export function buriedHere(answered, term, reading, where) {
  const others = (list) => Array.isArray(list) && list.some((w) => w !== where);
  if (reading != null && reading !== '') return others(answered[wordIdentity(term, reading)]);
  return Object.entries(answered).some(([id, list]) => id.startsWith(`${term}|`) && others(list));
}

/** after a real answer: this word was answered here today. False when storage refuses (nothing else changes). */
export function noteAnswered(storage, identity, where, now) {
  if (!storage) return false;
  try {
    const words = { ...answeredToday(storage, now) };
    const list = Array.isArray(words[identity]) ? words[identity] : [];
    if (list.includes(where)) return true;
    words[identity] = [...list, where];
    storage.setItem(ANSWERED_KEY, JSON.stringify({ day: dayOf(now), words }));
    return true;
  } catch {
    return false;
  }
}

/** the close's quiet line for cards that waited because their word was answered elsewhere today */
export function buriedWords(count, lang = 'en') {
  if (!count) return '';
  if (lang === 'ja') return `今日ほかで答えた語の札 ${count} 枚は、明日まで待ちます。`;
  return `${count === 1 ? '1 card for a word you already answered today waits' : `${count} cards for words you already answered today wait`} until tomorrow.`;
}

/* ---------------------------------------------------------------- review hooks (HOOKS-SPEC r7, W2 PASS 4fae8c1b)
 * The only path from a world, quest, room, ride or course into a schedule (lead 0057): decideReview says whether an
 * attempt may grade an existing card, and admitAnswer is the commit order every surface that commits a WORD grade
 * follows — the hook adapter, the corridor review, the deck player and the context deck — under one Web Lock, so a
 * word is graded once a day across every ledger. Evidence writing is OFF (lead 0057): nothing here writes an
 * observation. Pure like the rest of this module: storage, locks and the save itself are handed in. */
export const ANSWER_LOCK = 'bunki-srs:answer';
export const FACETS = Object.freeze(['reading', 'meaning', 'form']);
/** a hook caller: one of five kinds and a safe id (1–64: a letter or digit first, then letters, digits, . _ -; never ..) */
const HOOK_SURFACE = /^(world|quest|room|ride|course):(?!.*\.\.)[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u;
export const trustedSurface = (surface) => typeof surface === 'string' && HOOK_SURFACE.test(surface);

const filled = (value) => typeof value === 'string' && value.trim() !== '';
const plainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
/** { kind: 'word', term, reading, seq? } | { kind: 'kanji', literal } */
export function validItem(item) {
  if (!plainObject(item)) return false;
  if (item.kind === 'kanji') return filled(item.literal);
  return item.kind === 'word' && filled(item.term) && filled(item.reading) && (item.seq == null || filled(String(item.seq)));
}
/** an item's one identity: a word by its lemma and hiragana reading (wordIdentity), a kanji by its literal */
export function itemIdentity(item) {
  return item.kind === 'word' ? wordIdentity(item.term, item.reading) : `kanji:${item.literal}`;
}
/** exactly one answer: { rating: 1–4 } · { selfCheck: 'knew'|'missed' } · { claim: true } */
function validAnswer(answer) {
  if (answer == null) return true;
  if (!plainObject(answer)) return false;
  const keys = Object.keys(answer);
  if (keys.length !== 1) return false;
  if (keys[0] === 'rating') return [1, 2, 3, 4].includes(answer.rating);
  if (keys[0] === 'selfCheck') return answer.selfCheck === 'knew' || answer.selfCheck === 'missed';
  return keys[0] === 'claim' && answer.claim === true;
}
const validHelp = (help) => plainObject(help) && filled(help.what) && Array.isArray(help.reveals) &&
  help.reveals.every((facet) => FACETS.includes(facet)) && (help.about == null || validItem(help.about)) &&
  (help.at == null || Number.isFinite(help.at)) &&
  (help.relevance == null || ['target', 'related', 'unrelated'].includes(help.relevance));
/** an attempt names its item, the facet it tests, one well-formed answer, finite times and well-formed help */
export function validAttempt(evidence) {
  if (!plainObject(evidence) || !validItem(evidence.item) || !FACETS.includes(evidence.tests) || !validAnswer(evidence.answer)) return false;
  if (evidence.revealed != null && typeof evidence.revealed !== 'boolean') return false;
  if (evidence.answeredAt != null && !Number.isFinite(evidence.answeredAt)) return false;
  if (evidence.help != null && !Array.isArray(evidence.help)) return false;
  return (evidence.help || []).every(validHelp);
}
/**
 * Which card an attempt grades: always derived from its item, never chosen by the caller. named: the card key the
 * surface believes it is grading (a quest's draw) or null; card: the record owner's facts about that card on the latest
 * state — { enrolled, reading, sameEntry } — or null when there is none. sameEntry is the owner's own saved-identity
 * check (corridor: sameWordIdentity(wordNodeIdentity(node), wordCardIdentity(record, id))): a task naming another
 * dictionary entry is another word's task. Returns { key, eligible } | { refuse: 'target-mismatch' | 'invalid-task' }.
 */
export function bindTarget(item, named, card) {
  if (!validItem(item)) return { refuse: 'invalid-task' };
  const key = item.kind === 'word' ? `word:${item.term}` : `kanji:${item.literal}`;
  if (named != null && named !== key) return { refuse: 'target-mismatch' };
  if (!card || !card.enrolled) return { key, eligible: false };
  if (item.kind === 'word' && (wordIdentity(item.term, card.reading) !== itemIdentity(item) || card.sameEntry === false)) {
    return { refuse: 'target-mismatch' };
  }
  return { key, eligible: true };
}
const gradedToday = (record, now) => record?.last_review != null && dayOf(new Date(record.last_review)) === dayOf(now);
/** help shows the answer when it is about the tested item (unstated: the tested item) and reveals the tested facet */
const showsAnswer = (help, evidence) =>
  (help.about == null || itemIdentity(help.about) === itemIdentity(evidence.item)) && help.reveals.includes(evidence.tests);
const validOrigin = (o) => o === null || (plainObject(o) && filled(o.eventId) && filled(o.sessionId) && (o.attemptId == null || filled(o.attemptId)));
/** r8: an annotation may exempt help only when it is the admitted policy's (the caller passes it: the hook adapter
 * holds it, so this file never embeds the catalog version that pins this file's own bytes), bound to this attempt's target
 * and facet, names its attempt and learning session, and carries one well-formed origin per raw row (event ids unique) */
const boundRelevance = (evidence, policy) => {
  const b = evidence.helpRelevance;
  if (!filled(policy) || !plainObject(b) || b.policy !== policy || !filled(b.attemptId) || !filled(b.sessionId)) return false;
  if (b.targetIdentity !== `${evidence.item.kind}:${itemIdentity(evidence.item)}` || b.tests !== evidence.tests) return false;
  if (!Array.isArray(b.origins) || b.origins.length !== (evidence.help || []).length || !b.origins.every(validOrigin)) return false;
  const ids = b.origins.filter(Boolean).map((o) => o.eventId);
  return new Set(ids).size === ids.length;
};
const refused = (reason) => ({ write: false, reason });

/**
 * May this attempt grade this card, and with what rating? evidence: { kind, item, surface, tests, answer, revealed,
 * answeredAt, help } (only kind 'attempt' can grade); record: the bound card's FSRS record on the latest state, or null
 * when the item has no eligible card. answered: answeredToday(...) read fresh inside the admission.
 * Returns { write: true, rating, from, capped } | { write: false, reason }. The checks run in this order:
 * evidence-only · untrusted-surface · invalid-task · no-schedule (before servable: servable(null) is true) ·
 * answered-today (any hook surface: the card's own last review today, or the word answered anywhere today) · not-due ·
 * claim-without-check (a tap, or a self-check or rating before the reveal) · no-answer · then help: answer-showing help
 * used before answeredAt gives Again, any other help caps at Hard.
 */
export function decideReview(evidence, record, { now, answered = {}, dayEnd, relevancePolicy } = {}) {
  if (!plainObject(evidence) || evidence.kind !== 'attempt') return refused('evidence-only');
  if (!trustedSurface(evidence.surface)) return refused('untrusted-surface');
  if (!validAttempt(evidence)) return refused('invalid-task');
  if (!record) return refused('no-schedule');
  if (gradedToday(record, now)) return refused('answered-today');
  if (evidence.item.kind === 'word' && (answered[itemIdentity(evidence.item)] || []).length) return refused('answered-today');
  if (!servable(record, now, dayEnd == null ? {} : { dayEnd })) return refused('not-due');
  const answer = evidence.answer || {};
  let rating;
  if (answer.claim) return refused('claim-without-check');
  if (answer.selfCheck) {
    if (!evidence.revealed) return refused('claim-without-check');
    rating = answer.selfCheck === 'knew' ? 3 : 1;
  } else if (answer.rating) {
    if (!evidence.revealed) return refused('claim-without-check');
    rating = answer.rating;
  } else return refused('no-answer');
  const help = (evidence.help || []).filter((h) => evidence.answeredAt == null || h.at == null || h.at <= evidence.answeredAt);
  const from = rating;
  const bound = boundRelevance(evidence, relevancePolicy);
  if (help.some((h) => showsAnswer(h, evidence))) rating = 1;
  // r8 rule 2: a shown answer (above) is Again whatever any label says; help labelled 'unrelated' under a bound
  // annotation does not cap; target, related, unlabelled or unbound help caps at Hard, as in r7
  else if (help.some((h) => !(bound && h.relevance === 'unrelated'))) rating = Math.min(rating, 2);
  return { write: true, rating, from, capped: rating !== from };
}

/** reserve today's answer for a word before its grade is published: { ok, inserted }. A mark this surface already holds
 * (its own earlier grade, e.g. a home learning step) is ok and not inserted, and is never this call's to release. */
export function reserveAnswered(storage, identity, where, now) {
  if ((answeredToday(storage, now)[identity] || []).includes(where)) return { ok: true, inserted: false };
  const ok = noteAnswered(storage, identity, where, now) && (answeredToday(storage, now)[identity] || []).includes(where);
  return { ok, inserted: ok };
}
/** best-effort removal of one surface's mark for a word (only ever an inserted reservation whose grade was confirmed
 * not published). False when storage refuses: the word then rests ungraded until tomorrow. */
export function releaseAnswered(storage, identity, where, now) {
  if (!storage) return false;
  try {
    const words = { ...answeredToday(storage, now) };
    const list = (Array.isArray(words[identity]) ? words[identity] : []).filter((w) => w !== where);
    if (list.length) words[identity] = list;
    else delete words[identity];
    storage.setItem(ANSWERED_KEY, JSON.stringify({ day: dayOf(now), words }));
    return true;
  } catch {
    return false;
  }
}

/**
 * The commit order for one word or kanji grade on any surface (HOOKS-SPEC §3.3, §3.6):
 *   1. without Web Locks nothing is admitted ('no-shared-admission'; the surface shows refusalWords);
 *   2. under ANSWER_LOCK, `now` is sampled once (clock), after the lock is held;
 *   3. commit({ now, answered, reserve }) decides on fresh state; for a write it calls reserve(identity) — a word's
 *      identity, or null for a kanji card, which never buries — and publishes only if that returned true;
 *   4. commit returns { outcome, ...anything }: outcome 'published' (the write landed, acknowledged or not),
 *      'not-published' (confirmed before anything was applied, or refused before publishing) or 'uncertain';
 *   5. only after 'not-published' is a reservation released, and only one this attempt inserted.
 * locks: navigator.locks (or null); storage: the answered-today storage; where: the surface's answered where-string.
 */
export async function admitAnswer({ locks, clock = () => new Date(), storage, where, commit }) {
  if (!locks || typeof locks.request !== 'function') return { admitted: false, reason: 'no-shared-admission' };
  return locks.request(ANSWER_LOCK, async () => {
    const now = clock();
    let reservation = null;
    const reserve = (identity) => {
      if (identity == null) return true;
      const r = reserveAnswered(storage, identity, where, now);
      reservation = { identity, inserted: !!(r.inserted || reservation?.inserted) };
      return r.ok;
    };
    let result;
    try {
      result = (await commit({ now, answered: answeredToday(storage, now), reserve })) || {};
    } catch (error) {
      result = { outcome: 'uncertain', reason: 'publish-uncertain', error };
    }
    if (result.outcome === 'not-published' && reservation?.inserted) releaseAnswered(storage, reservation.identity, where, now);
    return { admitted: true, now, ...result };
  });
}

/** the one plain line a surface shows when it refuses a grade; practice continues and nothing claims the answer was
 * saved (lead 0128; the Japanese checked by Kimi, 0155). null for a reason that is not such a refusal. */
const REFUSAL_WORDS = {
  'no-shared-admission': {
    en: 'This page can’t keep answers in step with your other Bunki pages, so this card is practice only: your answer won’t change its schedule.',
    ja: 'このページはほかの Bunki のページと答えをそろえられないため、この札は練習だけです。答えても予定は変わりません。',
  },
  'mark-unavailable': {
    en: 'This answer couldn’t be saved safely, so it didn’t change the card’s schedule. You can keep practising.',
    ja: 'この答えは安全に保存できなかったため、札の予定は変わっていません。このまま練習を続けられます。',
  },
  'publish-failed': {
    en: 'This answer couldn’t be saved, so it didn’t change the card’s schedule. You can keep practising.',
    ja: 'この答えは保存できなかったため、札の予定は変わっていません。このまま練習を続けられます。',
  },
  'publish-uncertain': {
    en: 'We couldn’t confirm this answer was saved. You can keep practising.',
    ja: 'この答えが保存されたか確かめられませんでした。このまま練習を続けられます。',
  },  // HOOKS r8 §4: the decision refusals a learner meets in a quest or room (Claude stand-in 0507/0511, Grok 0508/0512)
  'answered-today': {
    en: 'You’ve already reviewed this today, so this answer is practice: it didn’t change the card’s schedule.',
    ja: 'これは今日もう復習したので、この答えは練習で、札の予定を変えていません。',
  },
  'not-due': {
    en: 'This card isn’t due yet, so this answer is practice: its schedule is unchanged.',
    ja: 'この札はまだ復習の時期ではないので、この答えは練習です。予定は変わっていません。',
  },
  'no-schedule': {
    en: 'This isn’t on your review schedule right now, so this answer is practice.',
    ja: 'これは今は復習の予定に入っていないので、この答えは練習です。',
  },
  'not-recorded': {
    en: 'This answer couldn’t be recorded for review. You can keep practising.',
    ja: 'この答えは復習に記録できませんでした。このまま練習を続けられます。',
  },
};
/** HOOKS r8: refusals that take an approved line: nothing was saved (owner changed), or the attempt was not admitted */
const REFUSAL_ALIASES = Object.freeze({ 'owner-changed': 'publish-failed', 'review-unverified': 'not-recorded' });
export function refusalWords(reason, lang = 'en') {
  const words = REFUSAL_WORDS[REFUSAL_ALIASES[reason] ?? reason];
  return words ? words[lang === 'ja' ? 'ja' : 'en'] : null;
}
