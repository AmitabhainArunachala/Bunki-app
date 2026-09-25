/** Pure v2 host adapter. Save each returned library in the learner transaction
 * before updating the UI. This module never writes storage or starts a timer.
 * Keep the legacy v1 library alongside this field until an explicit migration.
 */
import {
  beginAttemptV2,
  parseAttemptV2,
  parseFormVersion,
  scoreAttemptV2,
  updateAttemptV2,
} from './modules/assessment-core.mjs';

export { parseFormVersion };

export const ASSESSMENT_LIBRARY_V2_LIMITS = Object.freeze({
  forms: 128, attempts: 5000, jsonCharacters: 96_000_000, jsonNodes: 4_000_000,
});
const owned = new WeakSet();
export class AssessmentV2ControllerError extends Error {
  constructor(code) { super(`Assessment v2 controller ${code}`); this.name = 'AssessmentV2ControllerError'; this.code = code; }
}
const fail = (code) => { throw new AssessmentV2ControllerError(code); };
function fields(value, required, optional = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length)
    fail('invalid-object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (required.some((key) => !keys.includes(key)) ||
      keys.some((key) => !required.includes(key) && !optional.includes(key)) ||
      keys.some((key) => !('value' in descriptors[key]) || !descriptors[key].enumerable))
    fail('invalid-fields');
  return value;
}
function scopeValue(value) {
  fields(value, ['accountId', 'learnerId']);
  for (const key of ['accountId', 'learnerId'])
    // eslint-disable-next-line no-control-regex -- Reject control characters at the learner-scope boundary.
    if (typeof value[key] !== 'string' || !value[key] || value[key].length > 200 || /\s|[\x00-\x1f\x7f]/u.test(value[key]))
      fail('invalid-scope');
  return Object.freeze({ accountId: value.accountId, learnerId: value.learnerId });
}
const sameScope = (a, b) => a.accountId === b.accountId && a.learnerId === b.learnerId;
const sameRef = (a, b) => a.id === b.id && a.revisionId === b.revisionId && a.sha256 === b.sha256;
function budget(value) {
  const stack = [{ value, depth: 0 }];
  const ancestors = new Set();
  let nodes = 0;
  let characters = 0;
  while (stack.length) {
    const entry = stack.pop();
    if (entry.leave) { ancestors.delete(entry.value); continue; }
    nodes += 1;
    if (nodes > ASSESSMENT_LIBRARY_V2_LIMITS.jsonNodes || entry.depth > 32) fail('input-budget');
    const child = entry.value;
    if (typeof child === 'string') characters += child.length;
    else if (child && typeof child === 'object') {
      if (ancestors.has(child) || Object.getOwnPropertySymbols(child).length ||
          (!Array.isArray(child) && ![Object.prototype, null].includes(Object.getPrototypeOf(child)))) fail('non-json-value');
      const descriptors = Object.getOwnPropertyDescriptors(child);
      const keys = Object.keys(descriptors);
      if (Array.isArray(child) && keys.length !== child.length + 1) fail('non-json-array');
      ancestors.add(child); stack.push({ value: child, leave: true });
      for (const key of keys) {
        if (Array.isArray(child) && key === 'length') continue;
        if (!('value' in descriptors[key]) || !descriptors[key].enumerable ||
            (Array.isArray(child) && !/^(0|[1-9][0-9]*)$/u.test(key))) fail('non-json-value');
        characters += key.length;
        stack.push({ value: descriptors[key].value, depth: entry.depth + 1 });
      }
    } else if (child !== null && typeof child !== 'boolean' &&
        !(typeof child === 'number' && Number.isFinite(child) && !Object.is(child, -0))) fail('non-json-value');
    if (characters > ASSESSMENT_LIBRARY_V2_LIMITS.jsonCharacters) fail('input-budget');
  }
}
function freezeLibrary(scope, forms, attempts, activeAttemptId) {
  const result = Object.freeze({ format: 'kairo-assessment-library', v: 2, scope,
    forms: Object.freeze(forms), attempts: Object.freeze(attempts), activeAttemptId });
  owned.add(result);
  return result;
}
export function createAssessmentLibraryV2({ scope }) {
  return freezeLibrary(scopeValue(scope), [], [], null);
}
export function parseAssessmentLibraryV2(raw, options = {}) {
  fields(options, [], ['scope']);
  if (owned.has(raw)) {
    if (options.scope && !sameScope(raw.scope, scopeValue(options.scope))) fail('scope-mismatch');
    return raw;
  }
  budget(raw);
  fields(raw, ['format', 'v', 'scope', 'forms', 'attempts', 'activeAttemptId']);
  if (raw.format !== 'kairo-assessment-library' || raw.v !== 2) fail('unsupported-library');
  const scope = scopeValue(raw.scope);
  if (options.scope && !sameScope(scope, scopeValue(options.scope))) fail('scope-mismatch');
  if (!Array.isArray(raw.forms) || raw.forms.length > ASSESSMENT_LIBRARY_V2_LIMITS.forms ||
      !Array.isArray(raw.attempts) || raw.attempts.length > ASSESSMENT_LIBRARY_V2_LIMITS.attempts)
    fail('library-capacity');
  const forms = raw.forms.map((form) => parseFormVersion(form));
  if (new Set(forms.map((form) => form.revisionId)).size !== forms.length) fail('duplicate-form');
  const attempts = raw.attempts.map((attempt) => {
    const form = forms.find((candidate) => attempt?.form && sameRef(candidate, attempt.form));
    if (!form) fail('missing-form');
    const parsed = parseAttemptV2(form, attempt);
    if (!sameScope(parsed.scope, scope)) fail('scope-mismatch');
    return parsed;
  });
  if (new Set(attempts.map((attempt) => attempt.attemptId)).size !== attempts.length) fail('duplicate-attempt');
  if (raw.activeAttemptId !== null && !attempts.some((attempt) => attempt.attemptId === raw.activeAttemptId))
    fail('missing-active-attempt');
  if (attempts.some((attempt) => attempt.status === 'in-progress' && attempt.attemptId !== raw.activeAttemptId))
    fail('multiple-active-attempts');
  return freezeLibrary(scope, forms, attempts, raw.activeAttemptId);
}
export function startAssessmentV2(raw, formRaw, options) {
  fields(options, ['scope', 'attemptId', 'mode', 'now', 'editorialAtStart', 'clockSessionId'],
    ['priorExposure', 'monotonicMs']);
  const library = parseAssessmentLibraryV2(raw, { scope: options.scope });
  if (library.attempts.some((attempt) => attempt.status === 'in-progress')) fail('attempt-in-progress');
  if (library.attempts.some((attempt) => attempt.attemptId === options.attemptId)) fail('duplicate-attempt');
  const form = parseFormVersion(formRaw);
  const existing = library.forms.find((candidate) => sameRef(candidate, form));
  if (library.attempts.length >= ASSESSMENT_LIBRARY_V2_LIMITS.attempts ||
      (!existing && library.forms.length >= ASSESSMENT_LIBRARY_V2_LIMITS.forms)) fail('library-capacity');
  const attempt = beginAttemptV2(form, { ...options, scope: library.scope,
    priorExposure: options.priorExposure ?? 'unknown' });
  const result = freezeLibrary(library.scope, existing ? [...library.forms] : [...library.forms, form],
    [...library.attempts, attempt], attempt.attemptId);
  budget(result);
  return result;
}
export function commandAssessmentV2(raw, options) {
  fields(options, ['scope', 'attemptId', 'expectedRevisionId', 'now', 'clockSessionId', 'action'], ['monotonicMs']);
  const library = parseAssessmentLibraryV2(raw, { scope: options.scope });
  const attempt = library.attempts.find((entry) => entry.attemptId === options.attemptId);
  if (!attempt) fail('missing-attempt');
  const form = library.forms.find((candidate) => sameRef(candidate, attempt.form));
  const input = { ...options }; delete input.scope; delete input.attemptId;
  const updated = updateAttemptV2(form, attempt, input);
  // An unchanged revision is a no-op (terminal, or an explanation already recorded).
  if (updated === attempt || updated.revisionId === attempt.revisionId) return library;
  return freezeLibrary(library.scope, [...library.forms],
    library.attempts.map((entry) => entry.attemptId === attempt.attemptId ? updated : entry),
    library.activeAttemptId);
}
/** This projection contains answer-bearing content only inside the form. The
 * question projection deliberately excludes keys/rationales until completion. */
export function selectAssessmentV2(raw, attemptId) {
  const library = parseAssessmentLibraryV2(raw);
  attemptId ??= library.activeAttemptId;
  const attempt = library.attempts.find((entry) => entry.attemptId === attemptId);
  if (!attempt) return null;
  const form = library.forms.find((candidate) => sameRef(candidate, attempt.form));
  const questions = form.sections.flatMap((section) => section.itemIds.map((id) => {
    const item = form.items.find((entry) => entry.id === id);
    const answer = attempt.answers.find((entry) => entry.item.id === id);
    const response = { ...item.response };
    delete response.answerOptionId; delete response.answerOrder; delete response.marking;
    return Object.freeze({ id: item.id, skill: item.skill, task: item.task, prompt: item.prompt,
      translatedInstruction: item.translatedInstruction, response: Object.freeze(response),
      passages: item.passages.map((ref) => form.passages.find((passage) => sameRef(passage, ref))),
      media: item.media.map((ref) => {
        const media = form.media.find((candidate) => sameRef(candidate, ref));
        const playable = { ...media }; delete playable.transcript; delete playable.transcriptSha256;
        return Object.freeze(playable);
      }), sectionId: section.id, sectionTitle: section.title, answer });
  }));
  const block = attempt.blocks.find((entry) => entry.blockId === attempt.cursor.blockId) ?? null;
  const spec = form.timingBlocks.find((entry) => entry.id === block?.blockId);
  const itemIndex = questions.findIndex((item) => item.id === attempt.cursor.itemId);
  return Object.freeze({ attempt, form, questions: Object.freeze(questions),
    question: questions[itemIndex] ?? null, itemIndex, block,
    awaitingNextBlock: attempt.status === 'in-progress' && block === null,
    remainingMs: attempt.mode === 'timed' && block ? Math.max(0, spec.durationMs - block.elapsedMs) : null,
    score: attempt.status === 'in-progress' ? null : scoreAttemptV2(form, attempt),
  });
}

/** A local item mark (attempt answer) or its evidence copy. Nothing else is assistance. */
export function validAssessmentAssistanceMark(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    value.kind === 'explanation' && Number.isSafeInteger(value.at) && value.at >= 0;
}
/** The one enrollment rule: wrong, or correct and flagged or assisted. */
export function assessmentFollowupEligible({ outcome, flagged, assisted }) {
  return outcome === 'incorrect' || outcome === 'correct' && (flagged === true || assisted === true);
}
/** Local evidence adapter: `assistance` must be a valid mark, never a truthy stand-in. */
export function assessmentEvidenceEligible(evidence) {
  return !!evidence && assessmentFollowupEligible({ outcome: evidence.outcome, flagged: evidence.flagged,
    assisted: validAssessmentAssistanceMark(evidence.assistance) });
}
/** Received wire adapter: only the literal `assisted: true` counts. */
export function assessmentResultItemEligible(item) {
  return !!item && assessmentFollowupEligible({ outcome: item.result, flagged: item.flagged, assisted: item.assisted === true });
}
/** One outcome projection for finalization and enrichment retry, so both see the
 * same flag and item-level assistance from the same retained attempt. */
export function assessmentOutcomesV2(selected) {
  return selected.score.items.map(row => {
    const answer = selected.attempt.answers.find(entry => entry.item.id === row.itemId);
    return { ...row, outcome: row.result, flagged: answer?.flagged === true,
      ...(answer?.assistance ? { assistance: { kind: answer.assistance.kind, at: answer.assistance.at } } : {}) };
  });
}
/** The why-sheet for one item. Null until that item's assistance is durably
 * recorded (or the attempt is terminal), so no key is handed to the view first. */
export function selectAssessmentExplanationV2(raw, attemptId, itemId) {
  const selected = selectAssessmentV2(raw, attemptId);
  if (!selected) return null;
  const item = selected.form.items.find(entry => entry.id === itemId);
  const answer = selected.attempt.answers.find(entry => entry.item.id === itemId);
  if (!item || !answer || item.response.kind !== 'selected' || answer.response.kind !== 'selected') return null;
  if (selected.attempt.status === 'in-progress' && !answer.assistance) return null;
  const option = id => item.response.options.find(entry => entry.id === id);
  const chosen = option(answer.response.optionId), key = option(item.response.answerOptionId);
  if (!chosen || !key) return null;
  return Object.freeze({ itemId: item.id, itemRevisionId: item.revisionId,
    verdict: chosen.id === key.id ? 'correct' : 'incorrect',
    chosen: Object.freeze({ optionId: chosen.id, text: chosen.text }),
    key: Object.freeze({ optionId: key.id, text: key.text }),
    rule: typeof item.rationale === 'string' && item.rationale.trim() ? item.rationale : null,
    distractorLines: null, editorial: selected.attempt.editorialAtStart.status,
    assistance: answer.assistance ?? null });
}
/** Results partition over questions. A missing item mark is not proof of
 * independence. Assistance recorded without item attribution (the retained
 * aggregate `assisted` condition with no item mark, more assistance events than
 * marks, or the engine's carried `assistanceAttribution: 'unknown'` record from
 * a later explanation) makes attribution unknown, and the independent count is
 * then withheld (null). Only question counts are reported: an event count is not
 * a number of questions, and no missing count is invented. */
export function assessmentIndependenceV2(selected) {
  if (!selected?.score) return null;
  let answered = 0, assisted = 0, assistedCorrect = 0, unanswered = 0;
  for (const row of selected.score.items) {
    if (['unanswered', 'not-reached'].includes(row.result)) { unanswered++; continue; }
    answered++;
    if (selected.attempt.answers.find(entry => entry.item.id === row.itemId)?.assistance) {
      assisted++; if (row.result === 'correct') assistedCorrect++;
    }
  }
  const events = selected.attempt.events.filter(entry => entry.kind === 'assistance').length;
  const unknown = selected.attempt.assistanceAttribution === 'unknown' || events > assisted ||
    selected.attempt.conditions.includes('assisted') && assisted === 0;
  return Object.freeze({ answered, assisted, assistedCorrect, unanswered,
    attribution: unknown ? 'unknown' : 'complete', independent: unknown ? null : answered - assisted });
}
