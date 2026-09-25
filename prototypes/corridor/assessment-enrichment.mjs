/** Owned retry of unresolved local mappings. Evidence and terminal scores stay
 * immutable; each changed follow-up explicitly supersedes its prior sync head. */
import { encodeLocalJson, createAssessmentSyncIntentsV2, createLearningFollowupRevisionIntentV2,
  createSyncOperationV2, operationReference, readAssessmentResultViewsV2 } from './modules/record-core.mjs';
import { parseAssessmentLibraryV2, selectAssessmentV2 } from './assessment-v2-controller.mjs';
import { parseAssessmentLearning, planAssessmentLearning, applyAssessmentLearningEnrichment } from './assessment-learning.mjs';
import { checkedAssessmentTarget } from './assessment-finalization.mjs';

export const ASSESSMENT_ENRICH = 'host.assessment-enrich/2';
const copy = value => JSON.parse(encodeLocalJson(value).text);
const hash = value => encodeLocalJson(value).sha256;
const same = (a, b) => hash(a) === hash(b);
const scopeOf = binding => ({ accountId: binding.accountId, learnerId: binding.learnerId });
const fail = reason => { throw Object.assign(new Error(`Assessment enrichment ${reason}`), { code: reason }); };
const insist = (condition, reason) => { if (!condition) fail(reason); };
const fields = (value, required) => insist(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === required.length && required.every(key => Object.hasOwn(value, key)), 'invalid-assessment-command');
// eslint-disable-next-line no-control-regex -- Reject control characters at the external identity boundary.
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/\s|[\x00-\x1f\x7f]/u.test(value);
const withoutCausality = value => { const payload = { ...value }; delete payload.generation; delete payload.supersedes; return payload; };

export function parseAssessmentEnrichmentInput(raw) {
  const input = copy(raw);
  fields(input, ['expectedRevision', 'scope']); fields(input.scope, ['accountId', 'learnerId']);
  insist(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0 && Object.values(input.scope).every(id), 'invalid-assessment-command');
  return input;
}

export function prepareAssessmentEnrichment({ binding, snapshot, meta, input: raw, resolveSubject, resolvePresentation }) {
  const input = parseAssessmentEnrichmentInput(raw), scope = scopeOf(binding);
  insist(same(snapshot.policy.binding, binding) && same(input.scope, scope), 'scope-mismatch');
  insist(snapshot.revision === input.expectedRevision, 'assessment-store-superseded');
  const select = collection => snapshot.documents.find(row => row.collection === collection && row.id === 'current')?.value;
  const original = select('learner-record'), archive = select('learner-archive');
  if (!original.assessmentLearning || !original.assessmentLibraryV2) return null;
  const root = parseAssessmentLearning(original.assessmentLearning, scope);
  const pending = root.followups.filter(row => row.status === 'pending-mapping').sort((a, b) => a.id.localeCompare(b.id));
  if (!pending.length) return null;
  const library = parseAssessmentLibraryV2(original.assessmentLibraryV2, { scope });
  const results = readAssessmentResultViewsV2(snapshot.replica);
  let record = original, remaining = 0;
  const intents = [], followupIds = [];
  for (const prior of pending) {
    const selected = selectAssessmentV2(library, prior.attemptId);
    if (!selected?.score || selected.attempt.status !== 'submitted' || selected.attempt.revisionId !== prior.attemptRevisionId ||
        selected.attempt.editorialAtStart.status === 'unreviewed') continue;
    const result = results.find(row => row.attemptId === prior.attemptId);
    const entity = snapshot.replica.projection.entities.find(row => row.target.kind === 'learning-followup' && row.target.id === prior.id);
    if (!result || result.headResults.length !== 1 || result.projection.requiresChoice || result.projection.tombstones.length ||
        result.projection.identityConflicts.length || !entity || !entity.heads.length || entity.heads.length > 128 ||
        entity.requiresChoice || entity.tombstones.length || entity.identityConflicts.length) continue;
    const previousIntents = createAssessmentSyncIntentsV2({ form: selected.form, attempt: selected.attempt, result: selected.score, followup: prior });
    if (!same(withoutCausality(result.headResults[0].payload), withoutCausality(previousIntents[0].payload))) continue;
    const heads = entity.heads.map(ref => snapshot.replica.operations.find(row => same(operationReference(row), ref)));
    if (heads.some(row => !row || row.payload.kind !== 'learning.followup/2' ||
        !same(withoutCausality(row.payload), withoutCausality(previousIntents[1].payload)))) continue;
    const outcomes = selected.score.items.map(row => ({ ...row, outcome: row.result,
      flagged: selected.attempt.answers.find(answer => answer.item.id === row.itemId)?.flagged === true }));
    const planned = planAssessmentLearning({ scope, form: selected.form, attempt: selected.attempt, outcomes,
      presentation: resolvePresentation?.(selected.form, record) || null,
      resolveSubject: (subject, item) => {
        const retained = prior.actions.find(action => `${action.target.t}:${action.target.id}` === subject &&
          prior.evidence.some(evidence => evidence.id === action.evidenceId && evidence.item.id === item.id));
        return checkedAssessmentTarget(subject, retained?.target || resolveSubject?.(subject, item, record) || null);
      } });
    const patch = applyAssessmentLearningEnrichment(record, planned);
    if (!Object.keys(patch).length) continue;
    if (intents.length >= 20) { remaining++; continue; }
    record = { ...record, v: 2, ...patch };
    const followup = record.assessmentLearning.followups.find(row => row.id === prior.id);
    const replacement = createAssessmentSyncIntentsV2({ form: selected.form, attempt: selected.attempt,
      result: selected.score, followup })[1].payload;
    const intent = createLearningFollowupRevisionIntentV2({ ...replacement, generation: heads[0].payload.generation }, entity.heads);
    intents.push(intent); followupIds.push(prior.id);
  }
  if (!intents.length) return null;
  let predecessor = snapshot.actor.predecessor;
  const operations = intents.map((intent, index) => {
    const operation = createSyncOperationV2({ format: 'kairo-sync-operation', v: 2, scope,
      actor: { deviceId: snapshot.actor.deviceId, incarnationId: snapshot.actor.incarnationId,
        sequence: snapshot.actor.sequence + index + 1 }, predecessor, dependencies: intent.dependencies,
      schemaEpoch: snapshot.policy.schemaEpoch, deletionEpoch: snapshot.policy.deletionEpoch,
      mergePolicy: snapshot.policy.mergePolicy, occurredAt: meta.occurredAt, payload: intent.payload });
    predecessor = operationReference(operation); return predecessor;
  });
  const row = { format: 'kairo-local-command-receipt', version: 1, changeId: meta.changeId,
    type: ASSESSMENT_ENRICH, occurredAt: meta.occurredAt, scope,
    commandSha256: hash({ scope, type: ASSESSMENT_ENRICH, occurredAt: meta.occurredAt, input }),
    beforeRevision: snapshot.revision, committedRevision: snapshot.revision + 1,
    recordSha256: hash(record), archiveSha256: hash(archive),
    learningEnrichment: { followupIds, remaining, intentsSha256: hash(intents), operations } };
  return copy({ changeId: `host-command:${hash([scope, meta.changeId])}`, binding,
    expectedRevision: snapshot.revision, occurredAt: meta.occurredAt,
    mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: record },
      { kind: 'put', collection: 'learner-archive', id: 'current', value: archive },
      { kind: 'put', collection: 'kairo:record-host-commands', id: meta.changeId, value: row }], operations: intents });
}

export function validateAssessmentEnrichmentProof(raw) {
  const proof = copy(raw);
  fields(proof, ['followupIds', 'remaining', 'intentsSha256', 'operations']);
  insist(Array.isArray(proof.followupIds) && proof.followupIds.length > 0 && proof.followupIds.length <= 20 &&
    proof.followupIds.every(id) && new Set(proof.followupIds).size === proof.followupIds.length &&
    Number.isSafeInteger(proof.remaining) && proof.remaining >= 0 && proof.remaining <= 1000 &&
    /^[a-f0-9]{64}$/u.test(proof.intentsSha256) && Array.isArray(proof.operations) && proof.operations.length === proof.followupIds.length,
  'invalid-assessment-proof');
  for (const reference of proof.operations) {
    fields(reference, ['opId', 'sha256']);
    insist(Object.values(reference).every(value => /^[a-f0-9]{64}$/u.test(value)), 'invalid-assessment-proof');
  }
  return proof;
}
export function confirmAssessmentEnrichment({ binding, snapshot, meta, input, row }) {
  const proof = validateAssessmentEnrichmentProof(row.learningEnrichment), scope = scopeOf(binding);
  insist(same(snapshot.policy.binding, binding) && row.type === ASSESSMENT_ENRICH && row.changeId === meta.changeId &&
    row.occurredAt === meta.occurredAt && same(row.scope, scope) &&
    row.commandSha256 === hash({ scope, type: ASSESSMENT_ENRICH, occurredAt: meta.occurredAt, input }), 'assessment-operation-unconfirmed');
  const intents = proof.operations.map((reference, index) => {
    const operation = snapshot.replica.operations.find(entry => entry.opId === reference.opId);
    insist(operation && same(operationReference(operation), reference) && same(operation.scope, scope) &&
      operation.occurredAt === meta.occurredAt && operation.payload.kind === 'learning.followup/2' &&
      operation.payload.followupId === proof.followupIds[index] && operation.payload.supersedes?.length > 0 &&
      snapshot.replica.ready.some(entry => same(entry, reference)) &&
      (index === 0 || same(operation.predecessor, proof.operations[index - 1])), 'assessment-operation-unconfirmed');
    return { payload: operation.payload, dependencies: operation.dependencies };
  });
  insist(hash(intents) === proof.intentsSha256, 'assessment-operation-unconfirmed');
  return proof;
}
