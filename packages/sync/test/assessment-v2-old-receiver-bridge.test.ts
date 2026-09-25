import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inputHashOf } from '@bunki/ai/hash';
import {
  createAssessmentSyncIntentsV2,
  createReplica,
  createSyncOperationV2,
  operationReference,
  parseAssessmentOperationV2,
  planReceive,
  readAssessmentLearningViewsV2,
  SYNC_MERGE_POLICY,
  SYNC_SCHEMA_EPOCH,
  SyncValidationError,
  type OperationRef,
  type ReplicaPolicy,
} from '../src/index.ts';

// Ledger C4 (independent acceptance ledger 5653be4e…). The old V2 receiver cannot run here.
// Codex's sealed reference compiled the immutable pre-G1 closure (fc6a3e50: replica, operations,
// assessment-operations-v2, common, hash, canonical-json, shared, primitives; zod 4.4.3) and, over
// five distinct lawful operation identities, accepted the old pair and a supported companion and
// refused the assisted result alone, with its followup, and after the companion, as whole batches
// (invalid-input at payload.items.0), returning no plan and leaving the supplied replica byte-equal
// (receipt b413e10a502f8066decae24c1081fa8f0ed80033758acc8fb2e9308609990b95, entry-r2 accepted).
// This file binds the candidate to those exact bytes: its own producer and constructor emit the
// five reference envelopes byte for byte, and its receiver accepts what the old one refused while
// refusing a malformed flag as a whole batch. Old-build storage and boot (C5) are not proved here.
const REFERENCE = {
  formFileSha256: '2806699c318d0b74fdb2fdb3e45aac85f05ba857da8e81687b082039ce2418fc',
  formSha256: '56d6ea3b6024cd04447a72c36640ee99c672808d93bcd22f7ccdb4c1e2c198a2',
  // inputHashOf of the old receiver's baseline replica after the old pair (receipt rows 3–5)
  baselineSha256: '17a77cb233937281b399337039831b4051dcf6709062d2541d145e5ac8536c62',
  // opId and payloadSha256 are the receipt's; sha256 is operationReference (three stated in the
  // receipt, companion and assistedFollowup recomputed from its operation bytes)
  operations: {
    oldResult: {
      opId: '9f13985dafef7d03c4272c4551d8497750a02560949549e0e0fb190489578e36',
      payloadSha256: '7816af20412ce01e1c6a70728015d4106c54aa5ab4e7ebd9ef6ebc75a26be7be',
      sha256: 'a025ce103bc45b7d951f8063c0f7d36b7e028dd284058671a4006154bd748aa0',
    },
    oldFollowup: {
      opId: '5e9885be48b9b81f4a275613d67d6493e02a5b05255e90997cecc7734b8bdd92',
      payloadSha256: '3cf4fe86239190142ada22e38438fef76568511d7de496be60f4e02830c59241',
      sha256: 'c6a7fd2f636aaff082fbe1c8140d2e47df377875346fb82f9b90fd24cc1581c7',
    },
    companion: {
      opId: 'c00707d65d0498785c7559755a887666eba580cb56363850f6a1110bab8a81eb',
      payloadSha256: 'dc4e5179069815a2253ddc0265e53d02d21bdc813c7786bb9c3f638ead9ae317',
      sha256: 'f8e1f0a8fea28334bdf90ab286ce8461da8a3617c9eeb66720ad95e765068427',
    },
    assistedResult: {
      opId: '4c13ad894b7001169d2c9d15dd615d7432b1156ac1fb72ca7f1650d01484e597',
      payloadSha256: '95c09df3f426cdf572367d30c7772d57a5c278da748504e670bb7970fca5b535',
      sha256: 'a3cd17c533103f576bf09926ad66336273b64e94e76a80b0f7c0f58c7cab5052',
    },
    assistedFollowup: {
      opId: '02210a98477e4ba01a632ae5c48506232bab7d850f8a8be2b457595e9adb5bb3',
      payloadSha256: '14ef0585ad4f991447eb13d54bab4402e68afb49c8ed23945c2334859bc312d8',
      sha256: '6520c1440e34fa49de5680271d958c2629357d31b17b0e3f629dfa78b5780a7b',
    },
  },
} as const;

interface FormItem {
  id: string;
  revisionId: string;
  sha256: string;
  skill: string;
  task: string;
  subjects: string[];
}
interface FormFile {
  id: string;
  revisionId: string;
  sha256: string;
  items: FormItem[];
}
const formBytes = readFileSync(
  new URL(
    '../../../prototypes/corridor/data/assessment/forms/kairo-original-jlpt-n2-written-12-01-56d6ea3b6024cd04447a72c36640ee99c672808d93bcd22f7ccdb4c1e2c198a2.json',
    import.meta.url,
  ),
);
const form = JSON.parse(formBytes.toString('utf8')) as FormFile;
const formRef = { kind: 'form', id: form.id, revisionId: form.revisionId, sha256: form.sha256 };
const itemRef = (item: FormItem) => ({
  kind: 'item',
  id: item.id,
  revisionId: item.revisionId,
  sha256: item.sha256,
});
const scope = { accountId: 'account:g1-c4', learnerId: 'learner:g1-c4' };
const policy: ReplicaPolicy = {
  binding: { ...scope, sessionId: 'session:g1-c4-receiver' },
  schemaEpoch: SYNC_SCHEMA_EPOCH,
  deletionEpoch: 0,
  mergePolicy: SYNC_MERGE_POLICY,
};
const START = '2026-09-23T00:00:00.000Z';
const END = '2026-09-23T00:00:01.000Z';
const editorialAtStart = {
  status: 'ai-reviewed-practice',
  policyVersion: 'fixture:g1-c4-policy',
  decisionRevisionIds: ['fixture:g1-c4-decision'],
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// The reference's three sittings, as retained terminal sources for the candidate's public intent
// producer: only q01 is reached; the assisted sitting answers it correctly and carries a mark
// consistent with the attempt (reached, practice, the aggregate condition, a copied response).
function sitting(id: 'old' | 'companion' | 'new-assisted') {
  const assisted = id === 'new-assisted';
  const attemptId = `attempt:g1-c4-${id}`;
  const revisionId = `attempt-v2:g1-c4-${id}-terminal-fixture`;
  const response = (index: number) =>
    index
      ? { kind: 'unanswered' }
      : { kind: 'selected', optionId: assisted ? 'choice-1' : 'choice-2' };
  const intents = createAssessmentSyncIntentsV2({
    form,
    attempt: {
      attemptId,
      revisionId,
      form: formRef,
      scope,
      status: 'submitted',
      startedAt: Date.parse(START),
      endedAt: Date.parse(END),
      mode: 'practice',
      priorExposure: 'unknown',
      conditions: assisted ? ['assisted'] : [],
      editorialAtStart,
      clock: { elapsedMs: 1000 },
      audio: [],
      answers: form.items.map((item, index) => ({
        item: itemRef(item),
        response: response(index),
        flagged: false,
        ...(assisted && index === 0
          ? {
              reached: true,
              assistance: { kind: 'explanation', at: Date.parse(START) + 500, response: response(0) },
            }
          : {}),
      })),
    },
    result: {
      attemptId,
      attemptRevisionId: revisionId,
      form: formRef,
      status: 'submitted',
      items: form.items.map((item, index) => ({
        itemId: item.id,
        itemRevisionId: item.revisionId,
        result: index ? 'not-reached' : assisted ? 'correct' : 'incorrect',
        response: response(index),
        skill: item.skill,
        task: item.task,
        subjects: [...item.subjects],
        elapsedMs: index ? 0 : 1000,
      })),
    },
    followup: {
      id: `followup:g1-c4-${id}`,
      policy: 'assessment-learning/2',
      scope,
      attemptId,
      attemptRevisionId: revisionId,
      form: formRef,
      status: 'complete',
      evidence: form.items.map((item, index) => ({
        id: `evidence:g1-c4-${id}-${index + 1}`,
        item: { id: item.id, revisionId: item.revisionId, sha256: item.sha256 },
      })),
      actions: [
        {
          id: `action:g1-c4-${id}-q01`,
          evidenceId: `evidence:g1-c4-${id}-1`,
          kind: 'enroll',
          target: { t: 'word', id: '点検' },
          status: 'added',
        },
      ],
    },
  });
  const result = intents[0];
  const followup = intents[1];
  if (!result || !followup) throw new Error('The producer returned no result and followup pair');
  return { result: result.payload, followup: followup.payload };
}
function envelope(
  deviceId: string,
  sequence: number,
  predecessor: OperationRef | null,
  payload: unknown,
  dependencies: readonly OperationRef[] = [],
) {
  return createSyncOperationV2({
    format: 'kairo-sync-operation',
    v: 2,
    scope,
    actor: { deviceId, incarnationId: 'incarnation:g1-c4', sequence },
    predecessor,
    dependencies,
    schemaEpoch: SYNC_SCHEMA_EPOCH,
    deletionEpoch: 0,
    mergePolicy: SYNC_MERGE_POLICY,
    occurredAt: END,
    payload,
  });
}
// Built on first use, so a producer or constructor failure is a failed row, not a collection error.
let built: ReturnType<typeof build> | undefined;
function build() {
  const old = sitting('old');
  const oldResult = envelope('device:g1-c4-old', 1, null, old.result);
  const oldFollowup = envelope('device:g1-c4-old', 2, operationReference(oldResult), old.followup, [
    operationReference(oldResult),
  ]);
  const companion = envelope('device:g1-c4-companion', 1, null, sitting('companion').result);
  const fresh = sitting('new-assisted');
  const assistedResult = envelope('device:g1-c4-new-assisted', 1, null, fresh.result);
  const assistedFollowup = envelope(
    'device:g1-c4-new-assisted',
    2,
    operationReference(assistedResult),
    fresh.followup,
    [operationReference(assistedResult)],
  );
  return { oldResult, oldFollowup, companion, assistedResult, assistedFollowup };
}
const operations = () => (built ??= build());
const delivery = (list: readonly unknown[]) => ({
  binding: policy.binding,
  operations: list.map(clone),
});
const baselinePlan = () => {
  const { oldResult, oldFollowup } = operations();
  return planReceive(createReplica(policy), delivery([oldResult, oldFollowup]));
};
const flagged = (operation: { payload: unknown }) => {
  const payload = parseAssessmentOperationV2(operation.payload);
  if (payload.kind !== 'assessment.result/2') return null;
  return payload.items.filter((row) => row.assisted === true).map((row) => row.item.id);
};

describe('C4 bridge: the candidate against the sealed pre-G1 V2 receiver reference', () => {
  it('reads the exact reference form', () => {
    expect(createHash('sha256').update(formBytes).digest('hex')).toBe(REFERENCE.formFileSha256);
    expect(form.sha256).toBe(REFERENCE.formSha256);
    expect(form.items).toHaveLength(12);
  });

  it('emits the five reference envelopes byte for byte from the candidate producer and constructor', () => {
    const emitted = operations();
    for (const [name, expected] of Object.entries(REFERENCE.operations)) {
      const operation = emitted[name as keyof typeof emitted];
      expect({
        name,
        opId: operation.opId,
        payloadSha256: operation.payloadSha256,
        sha256: operationReference(operation).sha256,
      }).toEqual({ name, ...expected });
    }
    // five distinct lawful identities; the flag rides only on the fresh actor's result
    expect(new Set(Object.values(emitted).map((operation) => operation.opId)).size).toBe(5);
    expect(flagged(emitted.assistedResult)).toEqual(['kairo-original-jlpt-n2-short-01:q01']);
    expect(flagged(emitted.oldResult)).toEqual([]);
    expect(flagged(emitted.companion)).toEqual([]);
  });

  it('inserts the old pair into an empty replica exactly as the old receiver did', () => {
    const { oldResult, oldFollowup } = operations();
    const empty = createReplica(policy);
    const emptyBefore = inputHashOf(empty);
    // the receiver is given this exact replica, so the no-write witness observes its actual input
    const plan = planReceive(empty, delivery([oldResult, oldFollowup]));
    expect(inputHashOf(empty)).toBe(emptyBefore);
    expect(plan.insert.map((operation) => operation.opId).sort()).toEqual(
      [oldResult.opId, oldFollowup.opId].sort(),
    );
    expect([
      plan.next.operations.length,
      plan.next.ready.length,
      plan.next.pending.length,
      plan.next.quarantined.length,
    ]).toEqual([2, 2, 0, 0]);
    expect(inputHashOf(plan.next)).toBe(REFERENCE.baselineSha256);
  });

  it('accepts the assisted result alone, which the old receiver refused', () => {
    const { assistedResult } = operations();
    const baseline = baselinePlan().next;
    const plan = planReceive(baseline, delivery([assistedResult]));
    expect(plan.insert.map((operation) => operation.opId)).toEqual([assistedResult.opId]);
    expect([plan.next.pending.length, plan.next.quarantined.length]).toEqual([0, 0]);
    expect(inputHashOf(baseline)).toBe(REFERENCE.baselineSha256);
  });

  it('accepts the assisted pair and binds its followup as matched, which the old receiver refused', () => {
    const { assistedResult, assistedFollowup } = operations();
    const plan = planReceive(baselinePlan().next, delivery([assistedResult, assistedFollowup]));
    expect(plan.insert.map((operation) => operation.opId).sort()).toEqual(
      [assistedResult.opId, assistedFollowup.opId].sort(),
    );
    const view = readAssessmentLearningViewsV2(plan.next).followups.find(
      (row) => row.payload.followupId === 'followup:g1-c4-new-assisted',
    );
    expect(view?.resultBinding).toBe('matched');
  });

  it('accepts the supported-then-assisted batch whole, which the old receiver refused whole', () => {
    const { companion, assistedResult, assistedFollowup } = operations();
    const plan = planReceive(
      baselinePlan().next,
      delivery([companion, assistedResult, assistedFollowup]),
    );
    expect(plan.insert.map((operation) => operation.opId).sort()).toEqual(
      [companion.opId, assistedResult.opId, assistedFollowup.opId].sort(),
    );
    expect([
      plan.next.operations.length,
      plan.next.pending.length,
      plan.next.quarantined.length,
    ]).toEqual([5, 0, 0]);
    expect(
      readAssessmentLearningViewsV2(plan.next)
        .followups.map((row) => `${row.payload.followupId} ${row.resultBinding}`)
        .sort(),
    ).toEqual(['followup:g1-c4-new-assisted matched', 'followup:g1-c4-old matched']);
  });

  it('refuses a malformed flag as a whole batch: no plan, replica and delivery unchanged, no partial application', () => {
    const { companion, assistedResult } = operations();
    const payload = clone(assistedResult.payload);
    if (payload.kind !== 'assessment.result/2') throw new Error('Expected the assisted result');
    const [first, ...rest] = payload.items;
    if (!first) throw new Error('Expected a first item');
    const withFlag = (value: unknown) => ({ ...payload, items: [{ ...first, assisted: value }, ...rest] });
    // isolation: the specimen differs from the lawful body only in the flag's value
    expect(inputHashOf(withFlag(true))).toBe(assistedResult.payloadSha256);
    expect(parseAssessmentOperationV2(withFlag(true)).kind).toBe('assessment.result/2');
    // a fresh, independently sealed envelope under its own actor: a sixth distinct identity
    const input = {
      format: 'kairo-sync-operation',
      v: 2,
      scope,
      actor: { deviceId: 'device:g1-c4-malformed', incarnationId: 'incarnation:g1-c4', sequence: 1 },
      predecessor: null,
      dependencies: [],
      schemaEpoch: SYNC_SCHEMA_EPOCH,
      deletionEpoch: 0,
      mergePolicy: SYNC_MERGE_POLICY,
      occurredAt: END,
      payload: withFlag(false),
    };
    const malformed = {
      ...input,
      opId: inputHashOf({ scope: input.scope, actor: input.actor }),
      payloadSha256: inputHashOf(input.payload),
    };
    expect(
      new Set([...Object.values(operations()).map((operation) => operation.opId), malformed.opId]).size,
    ).toBe(6);
    const baseline = baselinePlan().next;
    const companionPlan = planReceive(baseline, delivery([companion]));
    const baselineBefore = inputHashOf(baseline);
    const incoming = delivery([companion, malformed]);
    const incomingBefore = inputHashOf(incoming);
    let returned = false;
    let error: unknown;
    try {
      planReceive(baseline, incoming);
      returned = true;
    } catch (caught) {
      error = caught;
    }
    expect(returned).toBe(false);
    expect(error).toBeInstanceOf(SyncValidationError);
    if (!(error instanceof SyncValidationError)) return;
    expect(error.code).toBe('invalid-input');
    expect(error.paths).toContain('payload.items.0.assisted');
    expect(inputHashOf(baseline)).toBe(baselineBefore);
    expect(inputHashOf(incoming)).toBe(incomingBefore);
    const again = planReceive(baseline, delivery([companion]));
    expect(again.duplicates).toEqual([]);
    expect(inputHashOf(again)).toBe(inputHashOf(companionPlan));
  });
});
