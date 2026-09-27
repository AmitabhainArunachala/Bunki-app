/** Assessment follow-up is a deterministic projection of a completed sitting.
 * It is committed with that sitting by the record host. This module neither
 * schedules a review nor calls a model: a test answer is not an FSRS grade. */
import { encodeLocalJson } from './modules/record-core.mjs';
import { selectAssessmentV2, parseAssessmentLibraryV2, assessmentEvidenceEligible,
  validAssessmentAssistanceMark } from './assessment-v2-controller.mjs';
import { deriveAssessmentCloze, createAssessmentClozePractice } from './assessment-cloze.mjs';
import { acceptSentencePractice } from './sentence-practice.mjs';
import { selectTeacherContext } from './teacher-context.mjs';
import { deriveAssessmentQuestion, parseAssessmentQuestionPlan, assertAssessmentQuestionForm,
  acceptAssessmentQuestionPractice } from './assessment-question-practice.mjs';
export { deriveAssessmentCloze, assessmentClozeText, assessmentSourceAttribution } from './assessment-cloze.mjs';

export const ASSESSMENT_LEARNING_POLICY = 'assessment-learning/2';
const hash = value => encodeLocalJson(value).sha256;
const copy = value => JSON.parse(encodeLocalJson(value).text);
const same = (a, b) => hash(a) === hash(b);
const TYPES = new Set(['word', 'kanji', 'grammar', 'particle', 'sentence', 'question']);
const fail = reason => { throw new TypeError(`Assessment learning: ${reason}`); };
const keyOf = target => `${target.t}:${target.id}`;
const canonicalSubjects = item => item.subjects.filter(subject => /^(word|kanji|grammar|particle):/u.test(subject));

/** A missing dictionary entry is unresolved lexical work, not permission to
 * replace its target. Exact-question recall fills only genuinely untargeted
 * reviewed items after the deterministic cloze path has been considered. */
export function deriveAssessmentQuestionFallback(input) {
  if (canonicalSubjects(input.item).length || deriveAssessmentCloze(input)) return null;
  return deriveAssessmentQuestion(input);
}

export function createAssessmentLearning(scope) {
  if (!scope?.accountId || !scope?.learnerId) fail('scope-required');
  return { format: 'kairo-assessment-learning', v: 2, scope: copy(scope), followups: [], suppressions: [] };
}

export function parseAssessmentLearning(raw, scope) {
  if (!raw || raw.format !== 'kairo-assessment-learning' || raw.v !== 2 ||
      !raw.scope?.accountId || !raw.scope?.learnerId || !Array.isArray(raw.followups) ||
      !Array.isArray(raw.suppressions) || raw.followups.length > 1000 || raw.suppressions.length > 10_000 ||
      (scope && !same(raw.scope, scope))) fail('invalid-root');
  const ids = new Set();
  for (const followup of raw.followups) {
    if (!followup || followup.policy !== ASSESSMENT_LEARNING_POLICY ||
        !same(followup.scope, raw.scope) || !Array.isArray(followup.evidence) ||
        !Array.isArray(followup.actions) || !followup.attemptId || !followup.attemptRevisionId ||
        !['complete', 'pending-mapping', 'pending-review', 'stopped'].includes(followup.status) ||
        followup.id !== `assessment-followup:${hash([raw.scope, followup.attemptId, followup.attemptRevisionId, followup.policy])}` ||
        ids.has(followup.id)) fail('invalid-followup');
    ids.add(followup.id);
    const evidenceIds = new Set();
    for (const evidence of followup.evidence) {
      if (!evidence || !evidence.item?.id || !evidence.item?.revisionId ||
          evidence.id !== `assessment-evidence:${hash([followup.id, evidence.item])}` ||
          evidenceIds.has(evidence.id) ||
          !['correct', 'incorrect', 'unanswered', 'not-reached'].includes(evidence.outcome) ||
          !Array.isArray(evidence.subjects) || !Number.isSafeInteger(evidence.elapsedMs) || evidence.elapsedMs < 0 ||
          evidence.assistance !== undefined && (!validAssessmentAssistanceMark(evidence.assistance) ||
            Object.keys(evidence.assistance).some(key => !['kind', 'at'].includes(key)) ||
            !['correct', 'incorrect'].includes(evidence.outcome)))
        fail('invalid-evidence');
      evidenceIds.add(evidence.id);
    }
    const actionIds = new Set();
    for (const action of followup.actions) {
      if (!action || !evidenceIds.has(action.evidenceId) || !TYPES.has(action.target?.t) ||
          typeof action.target.id !== 'string' || !action.target.id || action.target.id.length > 200 ||
          action.kind !== 'enroll' || !['added', 'existing', 'suppressed', 'pending'].includes(action.status) ||
          action.id !== `assessment-action:${hash([action.evidenceId, keyOf(action.target), action.kind])}` ||
          actionIds.has(action.id)) fail('invalid-action');
      if (action.target.t === 'question') {
        const plan = parseAssessmentQuestionPlan(action.target.question);
        if (action.target.id !== plan.id || action.target.label !== plan.item.prompt ||
            Object.keys(action.target).some(key => !['t', 'id', 'label', 'question'].includes(key))) fail('invalid-question-action');
      }
      actionIds.add(action.id);
    }
  }
  for (const suppression of raw.suppressions) {
    if (!suppression || typeof suppression.key !== 'string' || !suppression.key.includes(':') ||
        !Number.isFinite(suppression.at) || !['removed', 'undo-auto-add'].includes(suppression.reason))
      fail('invalid-suppression');
  }
  return copy(raw);
}

/** Imported learning evidence must still describe the exact retained sitting.
 * A syntactically valid follow-up cannot manufacture a success or a weakness. */
export function validateAssessmentLearningRecord(record) {
  if (record.assessmentLearning == null) return true;
  const library = parseAssessmentLibraryV2(record.assessmentLibraryV2);
  const root = parseAssessmentLearning(record.assessmentLearning, library.scope);
  for (const followup of root.followups) {
    const selected = selectAssessmentV2(library, followup.attemptId);
    if (!selected?.score || selected.attempt.revisionId !== followup.attemptRevisionId ||
        !same(selected.attempt.form, followup.form) ||
        !same(selected.attempt.editorialAtStart, followup.editorialAtStart) ||
        selected.attempt.endedAt !== followup.completedAt || selected.attempt.priorExposure !== followup.priorExposure ||
        selected.attempt.mode !== followup.mode || selected.form.exam.track !== followup.level) fail('attempt-mismatch');
    if (selected.attempt.status === 'abandoned') {
      if (followup.status !== 'stopped' || followup.evidence.length || followup.actions.length) fail('stopped-evidence');
      continue;
    }
    if (followup.evidence.length !== selected.form.items.length) fail('incomplete-evidence');
    for (const evidence of followup.evidence) {
      const item = selected.form.items.find(row => row.id === evidence.item.id);
      const result = selected.score.items.find(row => row.itemId === evidence.item.id);
      const answer = selected.attempt.answers.find(row => row.item.id === evidence.item.id);
      if (!item || item.revisionId !== evidence.item.revisionId || item.sha256 !== evidence.item.sha256 ||
          result.result !== evidence.outcome || !same(result.response, evidence.response) ||
          result.elapsedMs !== evidence.elapsedMs || answer.flagged !== evidence.flagged ||
          item.skill !== evidence.skill || item.task !== evidence.task || !same(item.subjects, evidence.subjects) ||
          (answer.assistance == null) !== (evidence.assistance == null) ||
          answer.assistance && (evidence.assistance.kind !== answer.assistance.kind || evidence.assistance.at !== answer.assistance.at))
        fail('evidence-mismatch');
    }
    for (const action of followup.actions) {
      const evidence = followup.evidence.find(row => row.id === action.evidenceId);
      const item = selected.form.items.find(row => row.id === evidence.item.id);
      let validTarget = action.target.t === 'sentence' ? same(action.target, deriveAssessmentCloze({
        form: selected.form, item, attemptId: followup.attemptId, completedAt: followup.completedAt }))
        : evidence.subjects.includes(keyOf(action.target));
      if (action.target.t === 'question') {
        const plan = assertAssessmentQuestionForm(action.target.question, selected.form);
        validTarget = plan.item.id === item.id && !canonicalSubjects(item).length &&
          !deriveAssessmentCloze({ form: selected.form, item, completedAt: followup.completedAt }) &&
          same(plan.editorialAtCreation, followup.editorialAtStart) &&
          plan.createdAt === new Date(followup.completedAt).toISOString();
      }
      if (!validTarget || !assessmentEvidenceEligible(evidence) ||
          followup.editorialAtStart.status === 'unreviewed') fail('action-mismatch');
    }
  }
  return true;
}

/** The caller supplies outcomes from the v2 engine and dictionary-confirmed
 * targets. Unmapped mistakes remain durable work, even when AI is offline. */
export function planAssessmentLearning({ scope, form, attempt, outcomes, resolveSubject, presentation = null }) {
  if (!same(scope, attempt.scope) || attempt.form.sha256 !== form.sha256 ||
      !['submitted', 'abandoned'].includes(attempt.status)) fail('terminal-attempt-required');
  const id = `assessment-followup:${hash([scope, attempt.attemptId, attempt.revisionId, ASSESSMENT_LEARNING_POLICY])}`;
  const followup = { id, policy: ASSESSMENT_LEARNING_POLICY, scope: copy(scope),
    attemptId: attempt.attemptId, attemptRevisionId: attempt.revisionId,
    form: copy(attempt.form), level: form.exam.track, mode: attempt.mode,
    completedAt: attempt.endedAt, priorExposure: attempt.priorExposure,
    editorialAtStart: copy(attempt.editorialAtStart), status: 'complete', evidence: [], actions: [] };
  if (attempt.status === 'abandoned') { followup.status = 'stopped'; return followup; }
  for (const item of form.items) {
    const result = outcomes.find(row => (row.itemId || row.item?.id) === item.id);
    if (!result || !['correct', 'incorrect', 'unanswered', 'not-reached'].includes(result.outcome))
      fail('complete-outcomes-required');
    const itemRef = { id: item.id, revisionId: item.revisionId, sha256: item.sha256 };
    const evidence = { id: `assessment-evidence:${hash([id, itemRef])}`, item: itemRef,
      skill: item.skill, task: item.task, subjects: [...item.subjects],
      outcome: result.outcome, elapsedMs: result.elapsedMs || 0,
      response: copy(result.response || { kind: 'unanswered' }),
      flagged: result.flagged === true,
      // Provenance only: an assisted answer is never counted as independent recall.
      ...(validAssessmentAssistanceMark(result.assistance)
        ? { assistance: { kind: result.assistance.kind, at: result.assistance.at } } : {}) };
    followup.evidence.push(evidence);
    // Skips and expired time are pacing evidence, not vocabulary weaknesses.
    if (attempt.editorialAtStart.status === 'unreviewed') { followup.status = 'pending-review'; continue; }
    if (!assessmentEvidenceEligible(evidence)) continue;
    const learnable = canonicalSubjects(item);
    const mapped = learnable.map(subject => resolveSubject?.(subject, item));
    const targets = mapped.filter(Boolean);
    const cloze = deriveAssessmentCloze({ form, item, attemptId: attempt.attemptId, completedAt: attempt.endedAt });
    if (cloze) targets.push(cloze);
    if (!targets.length && !learnable.length) {
      const question = deriveAssessmentQuestionFallback({ form, item, editorialAtStart: attempt.editorialAtStart,
        completedAt: attempt.endedAt, presentation });
      if (question) targets.push(question);
    }
    if (!targets.length || mapped.some(target => !target)) followup.status = 'pending-mapping';
    for (const target of targets) {
      if (!TYPES.has(target.t) || !target.id) fail('unsupported-target');
      const action = { id: `assessment-action:${hash([evidence.id, keyOf(target), 'enroll'])}`,
        evidenceId: evidence.id, kind: 'enroll', target: copy(target), status: 'pending' };
      if (!followup.actions.some(row => row.id === action.id)) followup.actions.push(action);
    }
  }
  return followup;
}

/** Preserve every existing card/schedule/suspension. New cards enter the same
 * capped new-card queue as other captures; no fabricated reviews are added. */
export function applyAssessmentLearning(record, followup) {
  const root = record.assessmentLearning == null ? createAssessmentLearning(followup.scope)
    : parseAssessmentLearning(record.assessmentLearning, followup.scope);
  if (root.followups.some(row => row.id === followup.id)) return {};
  const taken = [...(record.taken || [])], deepWords = { ...(record.deepWords || {}) };
  let sentencePractice = record.sentencePractice, teacherContexts = record.teacherContexts, hasCloze = false;
  let assessmentQuestionPractice = record.assessmentQuestionPractice, hasQuestion = false;
  const suppressed = new Set(root.suppressions.map(row => row.key));
  const next = copy(followup);
  for (const action of next.actions) {
    const key = keyOf(action.target);
    if (suppressed.has(key) || record.suspended?.[key] ||
        !taken.some(row => keyOf(row) === key) && (record.srs?.[key] || (record.revlog || []).some(row => row[1] === key))) {
      action.status = 'suppressed'; continue;
    }
    if (taken.some(row => keyOf(row) === key)) { action.status = 'existing'; continue; }
    const { t, id, label = id, dictionary = null } = action.target;
    const now = typeof followup.completedAt === 'number' ? followup.completedAt : Date.parse(followup.completedAt);
    if (!Number.isFinite(now)) fail('invalid-completion-time');
    let sourceFields = {};
    if (t === 'sentence') {
      const candidate = createAssessmentClozePractice(action.target, sentencePractice);
      sentencePractice = acceptSentencePractice(sentencePractice, candidate);
      const activeRef = teacherContexts?.activeRef || null;
      teacherContexts = { ...selectTeacherContext(teacherContexts, candidate.context), activeRef };
      sourceFields = { sourceContextRef: candidate.context.id, kind: '文の穴埋め', kindEn: 'sentence cloze' };
      hasCloze = true;
    }
    if (t === 'question') {
      assessmentQuestionPractice = acceptAssessmentQuestionPractice(assessmentQuestionPractice, action.target.question);
      sourceFields = { kind: '設問の復習', kindEn: 'question review' }; hasQuestion = true;
    }
    taken.push({ t, id, label, ts: now, started: now, from: null, by: 'assessment',
      ...sourceFields,
      assessmentRef: { followupId: next.id, evidenceId: action.evidenceId, actionId: action.id } });
    if (t === 'word' && dictionary) deepWords[id] ||= copy(dictionary);
    action.status = 'added';
  }
  const assessmentLearning = { ...root, followups: [...root.followups, next] };
  parseAssessmentLearning(assessmentLearning, followup.scope);
  return { taken, deepWords, assessmentLearning, ...(hasCloze ? { sentencePractice, teacherContexts } : {}),
    ...(hasQuestion ? { assessmentQuestionPractice } : {}) };
}

/** Retry only unresolved mappings from the same terminal evidence. Already
 * applied actions retain their exact bytes and can never replay a removal. */
export function applyAssessmentLearningEnrichment(record, planned) {
  const root = parseAssessmentLearning(record.assessmentLearning, planned.scope);
  const prior = root.followups.find(row => row.id === planned.id);
  if (!prior || prior.status !== 'pending-mapping' || !['complete', 'pending-mapping'].includes(planned.status))
    fail('not-pending-mapping');
  const stable = value => ({ ...value, status: null, actions: [] });
  if (!same(stable(prior), stable(planned))) fail('enrichment-evidence-changed');
  const actions = planned.actions.filter(action => !prior.actions.some(row => row.id === action.id));
  if (!actions.length && planned.status === prior.status) return {};
  const temporary = { ...record, assessmentLearning: { ...root,
    followups: root.followups.filter(row => row.id !== prior.id) } };
  const patch = applyAssessmentLearning(temporary, { ...planned, actions });
  const applied = patch.assessmentLearning.followups.find(row => row.id === prior.id);
  const enriched = { ...prior, status: planned.status, actions: [...prior.actions, ...applied.actions] };
  patch.assessmentLearning = { ...root, followups: root.followups.map(row => row.id === prior.id ? enriched : row) };
  parseAssessmentLearning(patch.assessmentLearning, planned.scope);
  return patch;
}

export function suppressAssessmentLearning(record, key, at, reason = 'removed') {
  if (!record.assessmentLearning) return {};
  const root = parseAssessmentLearning(record.assessmentLearning);
  if (root.suppressions.some(row => row.key === key)) return {};
  const next = { ...root, suppressions: [...root.suppressions, { key, at, reason }] };
  return { assessmentLearning: parseAssessmentLearning(next) };
}

/** Removing automatic additions never erases the exam or existing study work. */
export function undoAssessmentLearning(record, followupId, at) {
  const root = parseAssessmentLearning(record.assessmentLearning);
  const followup = root.followups.find(row => row.id === followupId);
  if (!followup) fail('missing-followup');
  const removable = followup.actions.filter(action => action.status === 'added' &&
    !(record.revlog || []).some(row => row[1] === keyOf(action.target)) &&
    !record.srs?.[keyOf(action.target)]);
  const keys = new Set(removable.map(action => keyOf(action.target)));
  const taken = (record.taken || []).filter(row => !(keys.has(keyOf(row)) && row.assessmentRef?.followupId === followupId));
  const suppressions = [...root.suppressions];
  for (const key of keys) if (!suppressions.some(row => row.key === key))
    suppressions.push({ key, at, reason: 'undo-auto-add' });
  return { taken, assessmentLearning: parseAssessmentLearning({ ...root, suppressions }) };
}

/** Derived Sensei evidence remains separate from measured recall/proficiency. */
export function assessmentLearningSummary(raw, scope) {
  if (!raw) return { completed: 0, stopped: 0, skills: {}, focus: [], pending: 0 };
  const root = parseAssessmentLearning(raw, scope), skills = {}, focus = new Map();
  let completed = 0, stopped = 0, pending = 0;
  for (const followup of root.followups) {
    if (followup.status === 'stopped') { stopped++; continue; }
    if (followup.status === 'pending-review') { pending++; continue; }
    completed++;
    for (const evidence of followup.evidence) {
      const row = skills[evidence.skill] ||= { correct: 0, incorrect: 0, unanswered: 0, notReached: 0, elapsedMs: 0 };
      row[evidence.outcome === 'not-reached' ? 'notReached' : evidence.outcome]++;
      row.elapsedMs += evidence.elapsedMs;
      if (evidence.outcome === 'incorrect') {
        for (const subject of evidence.subjects) {
          const value = focus.get(subject) || { subject, misses: 0, evidenceIds: [] };
          value.misses++; value.evidenceIds.push(evidence.id); focus.set(subject, value);
        }
      }
    }
    if (followup.status === 'pending-mapping') pending++;
  }
  return { completed, stopped, skills, pending, focus: [...focus.values()].sort((a, b) => b.misses - a.misses || a.subject.localeCompare(b.subject)).slice(0, 24) };
}
