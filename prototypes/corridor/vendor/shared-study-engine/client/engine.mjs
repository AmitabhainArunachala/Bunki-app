/** Canonical runtime-neutral v4 study API. Content, storage and transport belong
 * to the consuming shell. Importing this module opens no storage or network. */
import {createReplayEngine, canonicalStringify, payloadHash, validateEvent} from './replay.mjs';
import {createFreshStore, openStore} from './store.mjs';
import {createReplicaBackend} from './player/replica-backend.mjs';
import {EVENT_VERSION, POLICY_ID, SCHEDULED_CONTRACTS} from './schema/event.mjs';
import {SYNC_COMPATIBILITY} from './sync-compatibility.mjs';
import {createCorpusMaterializer,refreshCorpusRegistry} from './app/corpus-inventory.mjs';

export {createReplayEngine, replay, previewReview, hesitationEvidence, canonicalStringify,
  payloadHash, validateEvent, dayBounds, newCardLimit, studyDayAllowance, baselineHash} from './replay.mjs';
export {createFreshStore, openStore, StoreError} from './store.mjs';
export {createReplicaBackend} from './player/replica-backend.mjs';
export {customSessionOptions, selectCustomSession, sessionReviewEvidence} from './player/study-sessions.mjs';
export {EVENT_VERSION, POLICY_ID, SCHEDULED_CONTRACTS, DEVICE_TYPES, SERVER_TYPES, taskKey, isTaskKey} from './schema/event.mjs';
export {SYNC_COMPATIBILITY} from './sync-compatibility.mjs';
export {createCorpusMaterializer,refreshCorpusRegistry,validateCorpusInventory} from './app/corpus-inventory.mjs';
export {createIndexedDBAdapter} from './storage/indexeddb.mjs';
export {createMemoryAdapter} from './storage/memory.mjs';
export {createSyncTransport} from './sync.mjs';
export {sharedPermitRequest} from './permit-request.mjs';

export const ENGINE_METADATA = Object.freeze({
  api: 'nihongo-study-engine/v1', eventVersion: EVENT_VERSION, policyId: POLICY_ID,
  reducerSha256: SYNC_COMPATIBILITY.reducerSha256,
  scheduler: Object.freeze({algorithm: 'FSRS-6', package: 'ts-fsrs', version: '5.4.1',
    parameterSetId: 'bunki-fsrs6-r090-defaults-v1',
    pinPayloadHash: '56099b155f4928fbee57d66e7aaadfc52975698f47bc13f349eda07a75df21c1',
    reviewTimePolicyId: 'append-order-monotonic-clamp-v1'}),
  scheduledContracts: Object.freeze([...SCHEDULED_CONTRACTS]),
});

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/**
 * content: {registry, pin, catalog}; frozen identities and verified readiness are
 * supplied by the shell, never inferred from presentation strings.
 * storage: existing store adapter {read(scope), compareAndSwap(scope, revision,
 * candidate)} plus explicit environment / installation identity.
 * transport: optional {reserveNewPermits}; synchronization reconciles envelopes
 * through the returned store. Credentials and networking stay outside this API.
 * Commands/results are the existing immutable replica-backend contract; neither
 * this factory nor connect issues permits or imports a legacy ledger.
 */
export function createStudyEngine({content, learner, epoch = 0, timezone = 'Asia/Tokyo'} = {}) {
  if (!content?.registry || !content.pin || !Array.isArray(content.catalog)) throw Error('engine-content-required');
  if (typeof learner !== 'string' || !learner || !Number.isSafeInteger(epoch) || epoch < 0) throw Error('engine-scope-required');
  const frozen = freeze(structuredClone(content));
  const config = {registry: frozen.registry, pin: frozen.pin, learner, epoch, timezone};
  const engine = createReplayEngine(config);
  const initial = engine.replay([]); // Reject an unsupported pin/registry before opening storage.
  const seen = new Set();
  for (const entry of frozen.catalog) {
    const task = initial.tasks[entry.taskKey];
    if (!task || seen.has(entry.taskKey) || entry.noteGuid !== task.noteGuid ||
        entry.contractId !== task.contract || entry.passageId !== task.passageId) throw Error('engine-catalog-identity');
    seen.add(entry.taskKey);
  }
  const codec = Object.freeze({canonicalStringify, payloadHash, validateEvent});
  const guardedMaterializer=createCorpusMaterializer(engine,canonicalStringify);
  const materialize = ({canonical, provisional, learner: scopedLearner, epoch: scopedEpoch, provisionalNow}) => {
    if (scopedLearner !== learner || scopedEpoch !== epoch) throw Error('engine-store-scope');
    return guardedMaterializer({canonical, provisional, provisionalNow});
  };
  materialize.preserving=guardedMaterializer.preserving;
  const options = storage => ({...storage, learner, epoch, codec, materialize});
  return Object.freeze({
    metadata: ENGINE_METADATA, ...engine, codec, materialize,
    async refreshCorpus(store,options={}) {
      const state=await store?.readState?.();
      if(store?.scope?.learner!==learner||state?.epoch!==epoch)throw Error('engine-store-scope');
      return refreshCorpusRegistry(store,frozen.registry,frozen.catalog,{...options,materializer:materialize,canonicalStringify});
    },
    createFreshStore: storage => createFreshStore(options(storage)),
    openStore(storage) {
      if (storage?.scope?.learner !== learner) throw Error('engine-store-scope');
      return openStore(options(storage));
    },
    async connect({store, transport = null, now = Date.now, uuid, localAuthority = null} = {}) {
      const state = await store?.readState?.();
      if (store?.scope?.learner !== learner || state?.epoch !== epoch) throw Error('engine-store-scope');
      // Bind task identity and policy, without refreshing an old provisional
      // projection against a later wall clock merely because a shell reopened it.
      const rebuilt = materialize({canonical: Object.values(state.canonical).filter(row => row.seq <= state.appliedSeq).sort((a,b) => a.seq-b.seq),
        provisional: Object.values(state.local).sort((a,b) => a.event.dseq-b.event.dseq).map(({event,bodyHash}) => ({event,bodyHash})),
        learner, epoch, provisionalNow: Math.max(now(), ...Object.values(state.local).map(row => row.event.ts))});
      const identity = projection => ({format: projection.format, version: projection.version, policy: projection.policy,
        learner: projection.learner, epoch: projection.epoch, tasks: Object.fromEntries(Object.entries(projection.tasks).map(([key, task]) =>
          [key, Object.fromEntries(['noteGuid','contract','passageId','module','group','lexicalKey','contentRevision'].map(field => [field,task[field]]))]))});
      if (canonicalStringify(identity(rebuilt)) !== canonicalStringify(identity(state.projection))) throw Error('engine-store-projection');
      if (transport !== null && typeof transport.reserveNewPermits !== 'function') throw Error('engine-transport-adapter');
      return createReplicaBackend({store, engine, catalog: frozen.catalog, localAuthority, now,
        ...(uuid ? {uuid} : {}), reserveNewPermits: transport ? () => transport.reserveNewPermits({store}) : null});
    },
  });
}
