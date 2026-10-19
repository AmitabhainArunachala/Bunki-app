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
 *      pauseWords).
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

/** a wait in the app's words: 1 min, 8 min, 2 hr; 1分, 8分, 2時間 */
export function waitWords(ms, lang = 'en') {
  const min = Math.max(1, Math.round(ms / 60e3));
  if (min < 60) return lang === 'ja' ? `${min}分` : `${min} min`;
  const hr = Math.round(min / 60);
  return lang === 'ja' ? `${hr}時間` : `${hr} hr`;
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
  if (returns) parts.push(`cards came back ${returns === 1 ? 'once' : `${returns} times`} for a learning step${early ? ` (${early} a few minutes early, with nothing else left)` : ''}`);
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
