/** A retained plan is history, not permission to issue a fresh grade. Resolve
 * one currently visible, matched result against the current local form trust. */
import { encodeLocalJson } from './modules/record-core.mjs';
import { selectAssessmentV2, assessmentEvidenceEligible, assessmentResultItemEligible } from './assessment-v2-controller.mjs';
import { assertAssessmentQuestionForm } from './assessment-question-practice.mjs';
const hash = value => encodeLocalJson(value).sha256;
const same = (a, b) => hash(a) === hash(b);
const matchesItem = (reference, item, local = false) => (reference?.kind === 'item' || local && reference?.kind === undefined) && reference.id === item.id &&
  reference.revisionId === item.revisionId && reference.sha256 === item.sha256;
const clear = view => view && !view.projection.requiresChoice && !view.projection.tombstones.length &&
  !view.projection.identityConflicts.length && view.headResults.length === 1;

export function resolveAssessmentQuestionSource({ record, plan, results = [], learning = { followups: [], suppressions: [], scheduling: 'not-computed' },
  resolveForm, resolvePresentation, mediaProof }) {
  const key = `question:${plan.id}`;
  if (!record.taken?.some(row => row.t === 'question' && row.id === plan.id) || record.suspended?.[key]) return null;
  const trusted = resolveForm?.(plan.form);
  if (!trusted?.form || !['ai-reviewed-practice', 'ai-reviewed-full'].includes(trusted.editorialAtStart?.status)) return null;
  try { assertAssessmentQuestionForm(plan, trusted.form); } catch { return null; }
  const source = { form: trusted.form, editorialAtStart: trusted.editorialAtStart,
    presentation: trusted.presentation || resolvePresentation?.(trusted.form) || null, visible: true, mediaProof };
  const relevant = action => action.target.t === 'question' && action.target.id === plan.id && ['added', 'existing'].includes(action.status);
  for (const followup of record.assessmentLearning?.followups || []) {
    if (!same(followup.form, plan.form) || !['complete', 'pending-mapping'].includes(followup.status)) continue;
    const view = results.find(row => row.attemptId === followup.attemptId);
    if (!clear(view)) continue;
    const liveResult = view.headResults[0].payload;
    if (liveResult.outcome !== 'submitted' || liveResult.attemptRevisionId !== followup.attemptRevisionId ||
        !same(liveResult.form, plan.form)) continue;
    const selected = selectAssessmentV2(record.assessmentLibraryV2, followup.attemptId);
    if (selected?.attempt.status !== 'submitted' || selected.attempt.revisionId !== followup.attemptRevisionId ||
        selected.form.sha256 !== plan.form.sha256) continue;
    if (followup.actions.some(action => relevant(action) && followup.evidence.some(row =>
      row.id === action.evidenceId && matchesItem(row.item, plan.item, true) && assessmentEvidenceEligible(row)))) return source;
  }
  const received = record.assessmentReceived;
  if (!received || received.sourceDigest !== hash({ results, learning })) return null;
  for (const projected of received.followups) {
    if (!['applied', 'pending-target'].includes(projected.status) || !same(projected.form, plan.form)) continue;
    const matched = learning.followups.filter(row => row.payload.followupId === projected.id);
    if (matched.length !== 1 || matched[0].resultBinding !== 'matched' || !same(matched[0].operationRefs, projected.operationRefs)) continue;
    const view = results.find(row => row.attemptId === projected.attemptId);
    if (!clear(view)) continue;
    const result = view.headResults[0].payload;
    if (result.outcome !== 'submitted' || result.attemptRevisionId !== projected.attemptRevisionId || !same(result.form, plan.form)) continue;
    const resultItem = result.items.find(row => matchesItem(row.item, plan.item));
    if (!resultItem || !assessmentResultItemEligible(resultItem)) continue;
    for (const action of matched[0].payload.actions) {
      if (action.target.t !== 'question' || action.target.id !== plan.id || action.status === 'suppressed') continue;
      const evidence = matched[0].payload.evidence.find(row => row.id === action.evidenceId && matchesItem(row.item, plan.item));
      const applied = received.actions.some(row => row.followupId === projected.id && row.actionId === action.id && row.key === key &&
        ['added', 'existing', 'retained-history'].includes(row.status));
      if (evidence && applied) return source;
    }
  }
  return null;
}
