/** A second durable stage after transport receipt. The journal remains the
 * source of received observations. This projection never fabricates a local
 * test, a content version, editorial approval, or an FSRS review. */
import { encodeLocalJson, readAssessmentResultViewsV2, readAssessmentLearningViewsV2 } from './modules/record-core.mjs';
import { parseFormVersion, assertItemResponse } from './modules/assessment-core.mjs';
import { createAssessmentLibraryV2 } from './assessment-v2-controller.mjs';
import { createAssessmentLearning, parseAssessmentLearning, deriveAssessmentQuestionFallback } from './assessment-learning.mjs';
import { deriveAssessmentCloze, createAssessmentClozePractice } from './assessment-cloze.mjs';
import { acceptSentencePractice } from './sentence-practice.mjs';
import { selectTeacherContext } from './teacher-context.mjs';
import { acceptAssessmentQuestionPractice } from './assessment-question-practice.mjs';

export const ASSESSMENT_RECONCILE = 'host.assessment-reconcile/2';
const POLICY = 'assessment-received-projection/2';
const copy = (value) => JSON.parse(encodeLocalJson(value).text);
const hash = (value) => encodeLocalJson(value).sha256;
const same = (a, b) => hash(a) === hash(b);
const scopeOf = (binding) => ({ accountId: binding.accountId, learnerId: binding.learnerId });
const keyOf = (target) => `${target.t}:${target.id}`;
const failure = (code) => { throw Object.assign(new Error(`Received assessment ${code}`), { code }); };
const insist = (value, code = 'invalid-received-assessment') => { if (!value) failure(code); };
const fields = (value, required) => insist(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === required.length && required.every((key) => Object.hasOwn(value, key)));
// eslint-disable-next-line no-control-regex -- Reject control characters at the external identity boundary.
const boundedId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/\s|[\x00-\x1f\x7f]/u.test(value);
const pendingStatuses = new Set(['pending-result', 'pending-form', 'pending-review', 'pending-target']);

export function parseAssessmentReceived(raw, scope) {
  const root = copy(raw);
  fields(root, ['format', 'v', 'policy', 'scope', 'sourceDigest', 'projectedAt', 'followups', 'actions']);
  fields(root.scope, ['accountId', 'learnerId']);
  insist(root.format === 'kairo-assessment-received' && root.v === 2 && root.policy === POLICY &&
    Object.values(root.scope).every(boundedId) && (!scope || same(scope, root.scope)) &&
    /^[a-f0-9]{64}$/u.test(root.sourceDigest) && Number.isSafeInteger(root.projectedAt) && root.projectedAt >= 0 &&
    Array.isArray(root.followups) && root.followups.length <= 1000 && Array.isArray(root.actions) && root.actions.length <= 10_000);
  const followups = new Set(), actions = new Set();
  for (const entry of root.followups) {
    fields(entry, ['id', 'attemptId', 'attemptRevisionId', 'status', 'form', 'operationRefs']);
    insist([entry.id, entry.attemptId, entry.attemptRevisionId].every(boundedId) && !followups.has(entry.id) &&
      ['local', 'applied', 'pending-result', 'pending-form', 'pending-review', 'pending-target', 'conflicting', 'ineligible', 'hidden'].includes(entry.status));
    followups.add(entry.id);
    fields(entry.form, ['kind', 'id', 'revisionId', 'sha256']);
    insist(entry.form.kind === 'form' && boundedId(entry.form.id) && boundedId(entry.form.revisionId) && /^[a-f0-9]{64}$/u.test(entry.form.sha256));
    insist(Array.isArray(entry.operationRefs) && entry.operationRefs.length <= 128);
    for (const ref of entry.operationRefs) {
      fields(ref, ['opId', 'sha256']); insist(Object.values(ref).every((value) => /^[a-f0-9]{64}$/u.test(value)));
    }
  }
  for (const entry of root.actions) {
    fields(entry, ['id', 'followupId', 'actionId', 'key', 'status', 'at']);
    insist([entry.id, entry.followupId, entry.actionId].every(boundedId) && !actions.has(entry.id) &&
      typeof entry.key === 'string' && /^(word|kanji|grammar|particle|sentence|question):\S+$/u.test(entry.key) && entry.key.length <= 210 &&
      ['added', 'existing', 'suppressed', 'pending-target', 'retained-history', 'removed', 'hidden'].includes(entry.status) &&
      Number.isSafeInteger(entry.at) && entry.at >= 0 &&
      entry.id === `assessment-received-action:${hash([root.scope, entry.followupId, entry.actionId])}`);
    actions.add(entry.id);
  }
  return root;
}
export function assessmentReceivedViews(snapshot) {
  const results = readAssessmentResultViewsV2(snapshot.replica);
  const learning = readAssessmentLearningViewsV2(snapshot.replica);
  return { results, learning, sourceDigest: hash({ results, learning }) };
}
export function assessmentReconciliationSummary(record, views) {
  const root = record.assessmentReceived == null ? null : parseAssessmentReceived(record.assessmentReceived);
  const localIds = new Set((record.assessmentLibraryV2?.attempts || []).map((row) => row.attemptId));
  const missingFollowups = views.results.filter((view) => !localIds.has(view.attemptId) &&
    view.headResults.length === 1 && !view.projection.requiresChoice && !view.projection.identityConflicts.length &&
    !view.projection.tombstones.length && !views.learning.followups.some((row) => row.payload.attemptId === view.attemptId &&
      row.payload.attemptRevisionId === view.headResults[0].payload.attemptRevisionId && same(row.payload.form, view.headResults[0].payload.form))).length;
  const pendingFollowups = (root?.followups.filter((row) => pendingStatuses.has(row.status)).length || 0) + missingFollowups;
  const pendingActions = root?.actions.filter((row) => row.status === 'pending-target').length || 0;
  const hasReceived = views.results.some((view) => view.headResults.length) || views.learning.followups.length || views.learning.suppressions.length;
  return { state: !hasReceived && !root ? 'none' : !root || root.sourceDigest !== views.sourceDigest || pendingFollowups || pendingActions ? 'pending' : 'current',
    sourceDigest: views.sourceDigest, projectedDigest: root?.sourceDigest || null, pendingFollowups, pendingActions,
    appliedActions: root?.actions.filter((row) => row.status === 'added').length || 0 };
}
/** Sensei may use only results whose exact current journal projection already
 * passed the local source/answer checks above. These counts are observations,
 * never scheduler reviews or a claim of proficiency. A stale projection yields
 * pending evidence until the owned reconciliation transaction catches up. */
export function receivedAssessmentEvidenceSummary(record, views) {
  const results = views?.results || views?.assessmentResultViewsV2 || [];
  const learning = views?.learning || views?.assessmentLearningViewsV2 || { followups: [], suppressions: [], scheduling: 'not-computed' };
  const summary = { completed: 0, stopped: 0, skills: {}, focus: [], pending: 0 };
  const localIds = new Set((record.assessmentLibraryV2?.attempts || []).map((row) => row.attemptId));
  const eligible = results.filter((view) => !localIds.has(view.attemptId) && view.headResults.length === 1 &&
    !view.projection.requiresChoice && !view.projection.identityConflicts.length && !view.projection.tombstones.length &&
    view.headResults[0].payload.outcome === 'submitted' && view.headResults[0].payload.editorialAtStart.status !== 'unreviewed');
  if (!record.assessmentReceived) { summary.pending = eligible.length; return summary; }
  const root = parseAssessmentReceived(record.assessmentReceived);
  if (root.sourceDigest !== hash({ results, learning })) { summary.pending = eligible.length; return summary; }
  const focus = new Map();
  for (const view of eligible) {
    const result = view.headResults[0].payload;
    const projected = root.followups.find((row) => row.attemptId === result.attemptId &&
      row.attemptRevisionId === result.attemptRevisionId && same(row.form, result.form));
    if (!projected || pendingStatuses.has(projected.status) && projected.status !== 'pending-target') { summary.pending++; continue; }
    // Target mapping follows exact source/score verification. A missing local
    // dictionary card must not hide the already-verified sitting from Sensei.
    if (!['applied', 'pending-target'].includes(projected.status)) continue;
    const followups = learning.followups.filter((row) => row.payload.followupId === projected.id);
    const followup = followups[0];
    if (followups.length !== 1 || followup.resultBinding !== 'matched' ||
        !same(followup.operationRefs, projected.operationRefs)) continue;
    summary.completed++;
    if (projected.status === 'pending-target') summary.pending++;
    for (const item of result.items) {
      if (!['correct', 'incorrect', 'unanswered', 'not-reached'].includes(item.result)) continue;
      const row = summary.skills[item.skill] ||= { correct: 0, incorrect: 0, unanswered: 0, notReached: 0, elapsedMs: 0 };
      row[item.result === 'not-reached' ? 'notReached' : item.result]++;
      row.elapsedMs += item.elapsedMs;
      if (item.result !== 'incorrect') continue;
      const evidence = followup.payload.evidence.find((entry) => same(entry.item, item.item));
      if (!evidence) continue;
      for (const subject of item.subjects) {
        const value = focus.get(subject) || { subject, misses: 0, evidenceIds: [] };
        value.misses++; value.evidenceIds.push(evidence.id); focus.set(subject, value);
      }
    }
  }
  summary.focus = [...focus.values()].sort((a, b) => b.misses - a.misses || a.subject.localeCompare(b.subject)).slice(0, 24);
  return summary;
}
function checkedForm(reference, record, resolver) {
  const resolved = resolver?.(reference, record);
  if (resolved == null) return { status: 'pending-form' };
  insist(!(resolved instanceof Promise), 'async-assessment-form-resolver');
  const form = parseFormVersion(resolved.form);
  insist(same(reference, { kind: 'form', id: form.id, revisionId: form.revisionId, sha256: form.sha256 }), 'assessment-form-resolver-mismatch');
  const reviewed = resolved.editorialAtStart;
  if (!reviewed || !['ai-reviewed-practice', 'ai-reviewed-full'].includes(reviewed.status) ||
      !boundedId(reviewed.policyVersion) || !Array.isArray(reviewed.decisionRevisionIds) || !reviewed.decisionRevisionIds.length)
    return { status: 'pending-review' };
  return { status: 'ready', form, editorialAtStart: copy(reviewed), presentation: resolved.presentation || null };
}
function scoreMatches(form, result) {
  if (result.items.length !== form.items.length) return false;
  return form.items.every((item) => {
    const row = result.items.find((entry) => entry.item.id === item.id);
    if (!row || !same(row.item, { kind: 'item', id: item.id, revisionId: item.revisionId, sha256: item.sha256 }) ||
        row.skill !== item.skill || row.task !== item.task || !same(row.subjects, item.subjects)) return false;
    try { assertItemResponse(item, row.response); } catch { return false; }
    if (row.response.kind === 'unanswered') return ['unanswered', 'not-reached'].includes(row.result);
    const spec = item.response, response = row.response;
    if (spec.kind === 'written' && spec.marking.kind === 'manual') return row.result === 'unscored';
    const correct = spec.kind === 'selected' && response.kind === 'selected' ? spec.answerOptionId === response.optionId
      : spec.kind === 'ordered' && response.kind === 'ordered' ? same(spec.answerOrder, response.tokenIds)
        : spec.kind === 'written' && response.kind === 'written' && spec.marking.kind === 'exact' ? spec.marking.accepted.includes(response.text) : false;
    return row.result === (correct ? 'correct' : 'incorrect');
  });
}
function resolveTarget(subject, item, record, resolver) {
  const raw = resolver?.(subject, item, record);
  if (raw == null) return null;
  insist(!(raw instanceof Promise), 'async-assessment-subject-resolver');
  const target = copy(raw);
  insist(['word', 'kanji', 'grammar', 'particle'].includes(target.t) && boundedId(target.id) && keyOf(target) === subject &&
    Object.keys(target).every((key) => ['t', 'id', 'label', 'dictionary'].includes(key)) &&
    (target.label === undefined || typeof target.label === 'string' && target.label.length <= 500) &&
    (target.dictionary == null || target.t === 'word' && typeof target.dictionary === 'object' && !Array.isArray(target.dictionary)) &&
    new globalThis.TextEncoder().encode(encodeLocalJson(target).text).byteLength <= 32_000, 'assessment-target-resolver-mismatch');
  return target;
}
const studied = (record, key) => !!record.srs?.[key] || (record.revlog || []).some((row) => row[1] === key);

/** Pure recomputation against the latest owned record and genuine replica. */
export function projectReceivedAssessments({ snapshot, resolveForm, resolveSubject, at }) {
  const record = snapshot.documents.find((entry) => entry.collection === 'learner-record' && entry.id === 'current')?.value;
  const scope = scopeOf(snapshot.policy.binding), views = assessmentReceivedViews(snapshot);
  if (!record.assessmentReceived && !views.results.some((row) => row.headResults.length) &&
      !views.learning.followups.length && !views.learning.suppressions.length) return { record, views, changed: false };
  const prior = record.assessmentReceived == null ? null : parseAssessmentReceived(record.assessmentReceived, scope);
  const learning = record.assessmentLearning == null ? createAssessmentLearning(scope) : parseAssessmentLearning(record.assessmentLearning, scope);
  const suppressionsByKey = new Map(learning.suppressions.map((row) => [row.key, row]));
  const suppressionKeys = new Set(learning.suppressions.map((row) => row.key));
  for (const row of views.learning.suppressions) {
    const key = keyOf(row.target);
    const existing = suppressionsByKey.get(key);
    if (!existing) {
      const suppression = { key, at: Date.parse(row.at), reason: row.reason };
      learning.suppressions.push(suppression); suppressionsByKey.set(key, suppression); suppressionKeys.add(key);
    } else if (existing.reason === 'undo-auto-add' && row.reason === 'removed') {
      // An explicit removal remains authoritative if an earlier undo for the
      // same card also arrives, regardless of transport order.
      existing.reason = 'removed'; existing.at = Date.parse(row.at);
    }
  }
  let taken = copy(record.taken || []);
  const deepWords = copy(record.deepWords || {});
  let sentencePractice = record.sentencePractice, teacherContexts = record.teacherContexts, hasCloze = false;
  let assessmentQuestionPractice = record.assessmentQuestionPractice, hasQuestion = false;
  // Undo only retracts unstudied automatic additions. Another device may have
  // reviewed one since the sender's snapshot; preserve that learner progress.
  // Explicit removal still applies. Manual retakes and review bytes survive.
  taken = taken.filter((row) => {
    const key = keyOf(row), suppression = suppressionsByKey.get(key);
    return !suppression || !(row.assessmentReceivedRef || row.assessmentRef) ||
      (suppression.reason === 'undo-auto-add' && studied(record, key));
  });
  const actionRows = new Map((prior?.actions || []).map((row) => [row.id, copy(row)]));
  const entries = new Map((prior?.followups || []).map((row) => [row.id, { ...copy(row), status: 'hidden' }]));
  const visibleActionIds = new Set();
  const currentClaims = new Map();
  const retainPriorActions = (followupId) => {
    for (const row of actionRows.values()) if (row.followupId === followupId) visibleActionIds.add(row.id);
  };
  for (const view of views.learning.followups) {
    const followup = view.payload;
    const entity = snapshot.replica.projection.entities.find((row) => row.target.kind === 'learning-followup' && row.target.id === followup.followupId);
    const entry = { id: followup.followupId, attemptId: followup.attemptId, attemptRevisionId: followup.attemptRevisionId,
      status: 'applied', form: copy(followup.form), operationRefs: copy(view.operationRefs) };
    entries.set(entry.id, entry);
    if (!entity || entity.requiresChoice || entity.identityConflicts.length || entity.tombstones.length ||
        view.resultBinding === 'conflicting') { entry.status = 'conflicting'; continue; }
    if (view.resultBinding !== 'matched') {
      const resultView = views.results.find((row) => row.attemptId === followup.attemptId);
      entry.status = view.resultBinding === 'missing-or-hidden'
        ? resultView?.projection.tombstones.length ? 'hidden' : 'pending-result'
        : 'ineligible';
      if (entry.status === 'pending-result') retainPriorActions(entry.id);
      continue;
    }
    const local = record.assessmentLibraryV2?.attempts?.find((row) => row.attemptId === followup.attemptId);
    if (local?.revisionId === followup.attemptRevisionId) { entry.status = 'local'; retainPriorActions(entry.id); continue; }
    const result = views.results.find((row) => row.attemptId === followup.attemptId)?.headResults.find((row) =>
      row.payload.attemptRevisionId === followup.attemptRevisionId && same(row.payload.form, followup.form))?.payload;
    if (!result || result.outcome !== 'submitted' || result.editorialAtStart.status === 'unreviewed') { entry.status = 'ineligible'; continue; }
    const trusted = checkedForm(followup.form, record, resolveForm);
    if (trusted.status !== 'ready') { entry.status = trusted.status; retainPriorActions(entry.id); continue; }
    if (!scoreMatches(trusted.form, result)) { entry.status = 'ineligible'; continue; }
    const derivedTargets = new Map();
    if (!followup.actions.every((action) => {
      const evidence = followup.evidence.find((row) => row.id === action.evidenceId);
      const item = trusted.form.items.find((row) => row.id === evidence?.item.id);
      if (!item) return false;
      if (!['sentence', 'question'].includes(action.target.t)) return item.subjects.includes(keyOf(action.target));
      const audioAdmitted = trusted.editorialAtStart.status === 'ai-reviewed-full' ||
        !item.media.some(reference => trusted.form.media.some(media => media.sha256 === reference.sha256 && media.kind === 'audio'));
      const derived = action.target.t === 'sentence'
        ? deriveAssessmentCloze({ form: trusted.form, item, attemptId: result.attemptId, completedAt: result.endedAt })
        : audioAdmitted ? deriveAssessmentQuestionFallback({ form: trusted.form, item, editorialAtStart: result.editorialAtStart,
          completedAt: result.endedAt, presentation: trusted.presentation }) : null;
      // An exact admitted presentation may arrive later than the body-free
      // result. Keep the action pending; never improvise audio or its target.
      if (!derived && action.target.t === 'question' && item.media.length && (!trusted.presentation || !audioAdmitted) &&
          !item.subjects.some(subject => /^(word|kanji|grammar|particle):/u.test(subject)) &&
          !deriveAssessmentCloze({ form: trusted.form, item, completedAt: result.endedAt })) {
        derivedTargets.set(action.id, null); entry.status = 'pending-target'; return true;
      }
      if (!derived || keyOf(derived) !== keyOf(action.target)) return false;
      derivedTargets.set(action.id, derived); return true;
    })) { entry.status = 'ineligible'; continue; }
    for (const action of followup.actions) {
      const evidence = followup.evidence.find((row) => row.id === action.evidenceId);
      const item = trusted.form.items.find((row) => row.id === evidence?.item.id);
      const key = keyOf(action.target);
      const id = `assessment-received-action:${hash([scope, followup.followupId, action.id])}`;
      visibleActionIds.add(id);
      const before = actionRows.get(id);
      const row = { id, followupId: followup.followupId, actionId: action.id, key,
        status: 'pending-target', at: before?.at ?? Date.parse(result.endedAt) };
      actionRows.set(id, row);
      if (suppressionKeys.has(key) || view.suppressedActionIds.includes(action.id) || action.status === 'suppressed' || record.suspended?.[key]) {
        row.status = studied(record, key) && taken.some((target) => keyOf(target) === key) ? 'retained-history' : 'suppressed'; continue;
      }
      const claim = { projectionId: id, followupId: followup.followupId, evidenceId: action.evidenceId,
        actionId: action.id, attemptId: result.attemptId, itemRevisionId: item.revisionId };
      currentClaims.set(id, claim);
      const existing = taken.find((target) => keyOf(target) === key);
      if (existing) { row.status = existing.assessmentReceivedRef?.projectionId === id ? 'added' : 'existing'; continue; }
      if (before && ['added', 'existing', 'removed', 'hidden'].includes(before.status)) { row.status = 'removed'; continue; }
      if (studied(record, key)) { row.status = 'retained-history'; continue; }
      // A sentence ID is accepted only when the existing domain constructor
      // independently derives the same capture from the trusted exact item.
      const target = ['sentence', 'question'].includes(action.target.t)
        ? derivedTargets.get(action.id)
        : resolveTarget(key, item, record, resolveSubject);
      if (!target) { entry.status = 'pending-target'; continue; }
      const { t, id: targetId, label = targetId, dictionary = null } = target;
      let sourceFields = {};
      if (t === 'sentence') {
        const candidate = createAssessmentClozePractice(target, sentencePractice);
        sentencePractice = acceptSentencePractice(sentencePractice, candidate);
        const activeRef = teacherContexts?.activeRef || null;
        teacherContexts = { ...selectTeacherContext(teacherContexts, candidate.context), activeRef };
        sourceFields = { sourceContextRef: candidate.context.id, kind: '文の穴埋め', kindEn: 'sentence cloze' };
        hasCloze = true;
      }
      if (t === 'question') {
        assessmentQuestionPractice = acceptAssessmentQuestionPractice(assessmentQuestionPractice, target.question);
        sourceFields = { kind: '設問の復習', kindEn: 'question review' }; hasQuestion = true;
      }
      taken.push({ t, id: targetId, label, ts: row.at, started: row.at, from: null, by: 'assessment',
        ...sourceFields,
        assessmentReceivedRef: claim });
      if (t === 'word' && dictionary) deepWords[targetId] ||= dictionary;
      row.status = 'added';
    }
  }
  for (const row of actionRows.values()) {
    if (visibleActionIds.has(row.id)) continue;
    const key = row.key;
    const replacement = [...actionRows.values()].filter((candidate) => candidate.key === key &&
      visibleActionIds.has(candidate.id) && currentClaims.has(candidate.id) && ['added', 'existing'].includes(candidate.status))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    taken = taken.filter((target) => {
      if (target.assessmentReceivedRef?.projectionId !== row.id) return true;
      if (replacement) {
        target.assessmentReceivedRef = currentClaims.get(replacement.id);
        replacement.status = 'added';
        return true;
      }
      return studied(record, key);
    });
    row.status = 'hidden';
  }
  const projected = { format: 'kairo-assessment-received', v: 2, policy: POLICY, scope, sourceDigest: views.sourceDigest,
    projectedAt: prior?.projectedAt ?? at, followups: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)),
    actions: [...actionRows.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  parseAssessmentReceived(projected, scope);
  const next = { ...record, v: 2, taken, deepWords, assessmentReceived: projected,
    assessmentLibraryV2: record.assessmentLibraryV2 || createAssessmentLibraryV2({ scope }), assessmentLearning: learning,
    ...(hasCloze ? { sentencePractice, teacherContexts } : {}), ...(hasQuestion ? { assessmentQuestionPractice } : {}) };
  const changed = !same(next, record);
  if (changed) projected.projectedAt = at;
  return { record: copy(next), views, changed };
}

export function prepareAssessmentReconciliation({ binding, snapshot, meta, resolveForm, resolveSubject }) {
  insist(same(binding, snapshot.policy.binding), 'scope-mismatch');
  const proposed = projectReceivedAssessments({ snapshot, resolveForm, resolveSubject, at: Date.parse(meta.occurredAt) });
  if (!proposed.changed) return null;
  const scope = scopeOf(binding), input = {};
  const archive = snapshot.documents.find((entry) => entry.collection === 'learner-archive' && entry.id === 'current')?.value;
  const row = { format: 'kairo-local-command-receipt', version: 1, changeId: meta.changeId,
    type: ASSESSMENT_RECONCILE, occurredAt: meta.occurredAt, scope,
    commandSha256: hash({ scope, type: ASSESSMENT_RECONCILE, occurredAt: meta.occurredAt, input }),
    beforeRevision: snapshot.revision, committedRevision: snapshot.revision + 1,
    recordSha256: hash(proposed.record), archiveSha256: hash(archive),
    assessmentReconciliation: { sourceDigest: proposed.views.sourceDigest,
      projectionDigest: hash(proposed.record.assessmentReceived) } };
  return copy({ changeId: `host-command:${hash([scope, meta.changeId])}`, binding,
    expectedRevision: snapshot.revision, occurredAt: meta.occurredAt,
    mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: proposed.record },
      { kind: 'put', collection: 'learner-archive', id: 'current', value: archive },
      { kind: 'put', collection: 'kairo:record-host-commands', id: meta.changeId, value: row }], operations: [] });
}
