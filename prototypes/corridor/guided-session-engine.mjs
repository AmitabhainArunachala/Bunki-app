/**
 * 案内つきの稽古 — the guided session's state engine (schema v1). Ported from Codex's
 * prototype engine (bunki_experience/2026-09-23/guided-session/engine.js).
 *
 * API
 *   createGuidedState(setId, questionIds) -> clean state
 *   reduceGuidedState(state, event) -> new state; never mutates state or event
 *   loadGuidedState(storage, key, setId, questionIds) -> { state, error }
 *   saveGuidedState(storage, key, state) -> { ok, error }
 *
 * Evidence rules, unchanged from the prototype
 *   COMMIT is the only event that records performance; its first valid response wins.
 *   HELP and navigation never grade a question. FINISH gathers at most one Learn row per
 *   wrong or flagged question. REVIEW is the only event that marks practice, and UNDO
 *   cannot remove a row after REVIEW. FRESH_SELECT freezes the first practice response.
 *
 * What the port adds
 *   - The state names its question set, so a stored session never loads into another set.
 *   - Learn rows and saved words carry the status of their real deck cards (CARD_STATUS).
 *     The deck itself lives in the learner record and is written only through the app's
 *     覚える door; this engine remembers which cards the session is answerable for, so a
 *     removed row never takes away a card the learner already had.
 */

export const GUIDED_STATE_VERSION = 1;
const VIEWS = new Set([
  'home',
  'setup',
  'question',
  'summary',
  'results',
  'insight',
  'field',
  'learn',
  'sensei',
  'fresh',
  'expression',
  'about',
  'return',
]);
/** added: this session enrolled the card · existing: it was already in the deck ·
 * held: the deck cannot take it here · failed: the write did not land · removed: this
 * session took its own card out again · pending: not attempted yet. */
export const CARD_STATUS = new Set(['pending', 'added', 'existing', 'held', 'failed', 'removed']);
const MAX_EVENTS = 1000;

const plain = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const errorText = (error) =>
  error && typeof error.message === 'string' ? error.message : String(error);
const idsOf = (state) => Object.keys(state.answers || {});
const answer = () => ({
  choice: null,
  correct: null,
  helpBefore: false,
  explained: false,
  flagged: false,
});
const cleanIds = (ids) =>
  Array.isArray(ids)
    ? [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
    : [];
const cardKey = (value) => typeof value === 'string' && /^[a-z]+:.+/u.test(value);

export function createGuidedState(setId, questionIds) {
  const answers = {};
  for (const id of cleanIds(questionIds)) answers[id] = answer();
  return {
    version: GUIDED_STATE_VERSION,
    set: String(setId),
    view: 'home',
    started: false,
    finished: false,
    index: 0,
    answers,
    events: [],
    learn: [],
    fresh: { choice: null, revealed: false },
    draft: '',
    freshAttempts: {},
    reviewed: [],
    returnVisit: false,
    selectedTarget: null,
    savedWords: [],
  };
}

function clone(state) {
  return {
    ...state,
    answers: Object.fromEntries(
      Object.entries(state.answers).map(([id, value]) => [id, { ...value }]),
    ),
    events: state.events.map((value) => ({ ...value })),
    learn: state.learn.map((value) => ({
      ...value,
      cards: value.cards.map((card) => ({ ...card })),
    })),
    fresh: { ...state.fresh },
    freshAttempts: Object.fromEntries(
      Object.entries(state.freshAttempts || {}).map(([id, value]) => [id, { ...value }]),
    ),
    reviewed: [...state.reviewed],
    savedWords: (state.savedWords || []).map((value) => ({ ...value })),
  };
}

function record(next, event) {
  const logged = {
    type: event.type,
    source: typeof event.source === 'string' ? event.source : 'guided-session',
  };
  for (const key of ['id', 'choice', 'correct', 'target', 'view', 'wordId', 'card', 'status']) {
    if (event[key] !== undefined) logged[key] = event[key];
  }
  logged.at = Number.isFinite(event.at) ? event.at : Date.now();
  next.events.push(logged);
  if (next.events.length > MAX_EVENTS) next.events.splice(0, next.events.length - MAX_EVENTS);
}

export function reduceGuidedState(state, event) {
  if (!validGuidedState(state, idsOf(state), state?.set) || !plain(event)) return state;
  if (typeof event.type !== 'string') return state;
  if (event.type === 'RESET') return createGuidedState(state.set, idsOf(state));
  const next = clone(state);
  const ids = idsOf(next);
  const item = typeof event.id === 'string' ? next.answers[event.id] : null;
  const bounded = (count) =>
    Number.isInteger(count) && count > 0 ? Math.min(count, ids.length) : ids.length;
  let changed = false;
  switch (event.type) {
    case 'START':
      next.started = true;
      next.view = next.finished ? 'results' : 'question';
      changed = true;
      break;
    case 'COMMIT':
      if (
        item &&
        item.choice === null &&
        Number.isInteger(event.choice) &&
        typeof event.correct === 'boolean'
      ) {
        item.choice = event.choice;
        item.correct = event.correct;
        changed = true;
      }
      break;
    case 'FLAG':
      if (item) {
        item.flagged = !item.flagged;
        changed = true;
      }
      break;
    case 'HELP':
      if (item) {
        if (item.choice === null) item.helpBefore = true;
        item.explained = true;
        changed = true;
      }
      break;
    case 'NEXT': {
      if (next.index + 1 < bounded(event.count)) next.index += 1;
      else next.view = 'summary';
      changed = true;
      break;
    }
    case 'PREVIOUS':
      if (next.index > 0) next.index -= 1;
      next.view = 'question';
      changed = true;
      break;
    case 'NAVIGATE':
      if (Number.isInteger(event.index)) {
        const count = bounded(event.count);
        next.index = count ? Math.max(0, Math.min(event.index, count - 1)) : 0;
        changed = true;
      }
      if (VIEWS.has(event.view)) {
        next.view = event.view;
        changed = true;
      }
      break;
    case 'GO_TO': {
      const count = bounded(event.count);
      if (Number.isInteger(event.index)) {
        next.index = count ? Math.max(0, Math.min(event.index, count - 1)) : 0;
      }
      next.view = VIEWS.has(event.view) ? event.view : 'question';
      changed = true;
      break;
    }
    case 'SAVE_EXIT':
      next.view = 'home';
      changed = true;
      break;
    case 'FINISH': {
      const questions = Array.isArray(event.questions) ? event.questions : [];
      for (const question of questions) {
        if (!plain(question) || typeof question.id !== 'string' || !next.answers[question.id]) {
          continue;
        }
        const response = next.answers[question.id];
        if (!(response.correct === false || response.flagged)) continue;
        if (next.learn.some((row) => row.id === question.id)) continue;
        const cards = Array.isArray(question.cards)
          ? [...new Set(question.cards.filter(cardKey))]
          : [];
        next.learn.push({
          id: question.id,
          target: typeof question.target === 'string' ? question.target : null,
          removed: false,
          reviewed: false,
          cards: cards.map((key) => ({ key, status: 'pending' })),
        });
      }
      next.finished = true;
      next.view = 'results';
      changed = true;
      break;
    }
    case 'CARD_RESULT': {
      const row = next.learn.find((entry) => entry.id === event.id);
      const card = row?.cards.find((entry) => entry.key === event.card);
      if (card && CARD_STATUS.has(event.status) && card.status !== event.status) {
        card.status = event.status;
        changed = true;
      }
      break;
    }
    case 'UNDO': {
      const learned = next.learn.find((row) => row.id === event.id);
      if (learned && !learned.reviewed) {
        learned.removed = !learned.removed;
        changed = true;
      }
      break;
    }
    case 'FRESH_SELECT':
      if (next.fresh.choice === null && Number.isInteger(event.choice)) {
        next.fresh.choice = event.choice;
        if (typeof next.selectedTarget === 'string') {
          next.freshAttempts[next.selectedTarget] = { ...next.fresh };
        }
        changed = true;
      }
      break;
    case 'FRESH_REVEAL':
      if (
        next.fresh.choice !== null &&
        typeof event.correct === 'boolean' &&
        !next.fresh.revealed
      ) {
        next.fresh.revealed = true;
        if (typeof next.selectedTarget === 'string') {
          next.freshAttempts[next.selectedTarget] = { ...next.fresh };
        }
        changed = true;
      }
      break;
    case 'FRESH_RESET':
      if (typeof event.id === 'string' && event.id !== next.selectedTarget) {
        if (typeof next.selectedTarget === 'string') {
          next.freshAttempts[next.selectedTarget] = { ...next.fresh };
        }
        next.selectedTarget = event.id;
        next.fresh = next.freshAttempts[event.id]
          ? { ...next.freshAttempts[event.id] }
          : { choice: null, revealed: false };
        changed = true;
      }
      break;
    case 'DRAFT':
      if (typeof event.text === 'string' && event.text !== next.draft) {
        next.draft = event.text;
        changed = true;
      }
      break;
    case 'SAVE_WORD': {
      if (typeof event.wordId !== 'string' || !ids.includes(event.id)) break;
      if (!['added', 'existing'].includes(event.status)) break;
      const saved = next.savedWords.find((row) => row.wordId === event.wordId);
      if (!saved) {
        next.savedWords.push({ wordId: event.wordId, sourceId: event.id, status: event.status });
        changed = true;
      }
      break;
    }
    case 'REMOVE_WORD':
      if (next.savedWords.some((row) => row.wordId === event.wordId)) {
        next.savedWords = next.savedWords.filter((row) => row.wordId !== event.wordId);
        changed = true;
      }
      break;
    case 'REVIEW': {
      const learned = next.learn.find((row) => row.id === event.id && !row.removed);
      if (learned && !learned.reviewed) {
        learned.reviewed = true;
        if (!next.reviewed.includes(event.id)) next.reviewed.push(event.id);
        changed = true;
      }
      break;
    }
    case 'RETURN':
      next.returnVisit = true;
      next.finished = true;
      next.view = 'home';
      changed = true;
      break;
    case 'SELECT_TARGET':
      if (event.id === null || typeof event.id === 'string') {
        next.selectedTarget = event.id;
        changed = true;
      }
      break;
    default:
      return state;
  }
  if (!changed) return state;
  // a draft is unfinished text, not evidence (CONTEXT.md): it lives in `draft`, never the log
  if (event.type !== 'DRAFT') record(next, event);
  return next;
}

function validAnswer(value) {
  return (
    plain(value) &&
    (value.choice === null || Number.isInteger(value.choice)) &&
    (value.correct === null || typeof value.correct === 'boolean') &&
    ['helpBefore', 'explained', 'flagged'].every((key) => typeof value[key] === 'boolean')
  );
}
const validAttempt = (attempt) =>
  plain(attempt) &&
  (attempt.choice === null || Number.isInteger(attempt.choice)) &&
  typeof attempt.revealed === 'boolean';
const validCard = (card) => plain(card) && cardKey(card.key) && CARD_STATUS.has(card.status);
const validRow = (row) =>
  plain(row) &&
  typeof row.id === 'string' &&
  (row.target === null || typeof row.target === 'string') &&
  typeof row.removed === 'boolean' &&
  typeof row.reviewed === 'boolean' &&
  Array.isArray(row.cards) &&
  row.cards.every(validCard);

export function validGuidedState(value, questionIds, setId) {
  const expected = cleanIds(questionIds);
  if (
    !plain(value) ||
    value.version !== GUIDED_STATE_VERSION ||
    typeof value.set !== 'string' ||
    (setId !== undefined && value.set !== setId) ||
    !VIEWS.has(value.view) ||
    typeof value.started !== 'boolean' ||
    typeof value.finished !== 'boolean' ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    !plain(value.answers) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.learn) ||
    !plain(value.fresh) ||
    !plain(value.freshAttempts) ||
    typeof value.draft !== 'string' ||
    !Array.isArray(value.reviewed) ||
    typeof value.returnVisit !== 'boolean' ||
    !(value.selectedTarget === null || typeof value.selectedTarget === 'string') ||
    !Array.isArray(value.savedWords)
  ) {
    return false;
  }
  const actual = Object.keys(value.answers);
  if (
    actual.length !== expected.length ||
    actual.some((id) => !expected.includes(id)) ||
    actual.some((id) => !validAnswer(value.answers[id]))
  ) {
    return false;
  }
  if (!validAttempt(value.fresh) || !Object.values(value.freshAttempts).every(validAttempt)) {
    return false;
  }
  if (!value.learn.every(validRow) || !value.reviewed.every((id) => typeof id === 'string')) {
    return false;
  }
  return value.savedWords.every(
    (row) =>
      plain(row) &&
      typeof row.wordId === 'string' &&
      expected.includes(row.sourceId) &&
      ['added', 'existing'].includes(row.status),
  );
}

export function loadGuidedState(storage, key, setId, questionIds) {
  const clean = createGuidedState(setId, questionIds);
  try {
    const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null;
    if (raw === null) return { state: clean, error: null };
    const parsed = JSON.parse(raw);
    if (!validGuidedState(parsed, questionIds, setId))
      return { state: clean, error: 'invalid-state' };
    return { state: parsed, error: null };
  } catch (error) {
    return { state: clean, error: errorText(error) };
  }
}

export function saveGuidedState(storage, key, state) {
  try {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('storage-unavailable');
    if (!validGuidedState(state, idsOf(state), state.set)) throw new Error('invalid-state');
    storage.setItem(key, JSON.stringify(state));
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}
