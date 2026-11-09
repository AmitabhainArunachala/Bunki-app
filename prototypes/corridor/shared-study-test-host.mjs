/** Isolated QA shared-study host.
 *
 * This host deliberately has no production identity, network credential or
 * legacy-store fallback. It exists so the actual Corridor router can exercise
 * the canonical shared-study adapter against a test-scoped IndexedDB store and
 * a finite local fixture grant. Production boot never imports this module. */
import {dayBounds, payloadHash} from './vendor/shared-study-engine/client/engine.mjs';
import {createSharedStudyStorage} from './shared-study-storage.mjs';
import {disposeSharedStudyAudioPreparation} from './shared-study-audio-preparation.mjs';
import {createSharedStudySync} from './shared-study-sync.mjs';

export const QA_HOST_MARKER = 'bunki-isolated-shared-study-qa/v1';

const LEARNER = 'test-shared-audio';
const ENVIRONMENT = 'test-shared-audio';
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const INSTALLATION = /^test-shared-audio-bunki-[A-Za-z0-9._-]{1,100}$/;
const METADATA_PREFIX = 'bunki-shared-study:qa:';

const metadataKey = runId => `${METADATA_PREFIX}${runId}:installation`;
const lockName = runId => `bunki-shared-study-qa-profile-${runId}`;
const databaseName = runId => `bunki-shared-study-qa-${runId}`;
const installationFor = uuid => `test-shared-audio-bunki-${uuid()}`;

const required = (value, code) => { if (!value) throw Error(code); return value; };
const allocation = raw => {
  if (raw === null || raw === undefined) return null;
  let value;
  try { value=JSON.parse(raw); } catch { throw Error('shared-study-qa-metadata-malformed'); }
  if (!value || Object.keys(value).sort().join('|')!=='format|installation|phase' ||
      value.format!=='bunki-shared-study-qa-allocation/v1' || !INSTALLATION.test(value.installation) ||
      !['allocated','ready'].includes(value.phase)) throw Error('shared-study-qa-metadata-malformed');
  return value;
};

export async function createSharedStudyTestHost(options = {}) {
  const {
    marker,
    runId,
    metadata = globalThis.localStorage,
    locks = globalThis.navigator?.locks,
    storageFactory = createSharedStudyStorage,
    uuid = () => globalThis.crypto?.randomUUID?.(),
    now = Date.now,
    sync: syncConfig = null,
    audio = null,
    learner = LEARNER,
    environment = ENVIRONMENT,
    identity: providedIdentity = null,
  } = options;
  if (marker !== QA_HOST_MARKER) throw Error('bunki-isolated-shared-study-qa/v1 marker required');
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw Error('shared-study-qa-run');
  if (learner !== LEARNER || environment !== ENVIRONMENT) throw Error('shared-study-qa-identity');
  if (providedIdentity != null && (providedIdentity.learner !== undefined && providedIdentity.learner !== LEARNER ||
      providedIdentity.environment !== undefined && providedIdentity.environment !== ENVIRONMENT ||
      providedIdentity.installation !== undefined && !INSTALLATION.test(providedIdentity.installation)))
    throw Error('shared-study-qa-identity');
  required(metadata && typeof metadata.getItem === 'function' && typeof metadata.setItem === 'function',
    'shared-study-qa-metadata-required');
  required(locks && typeof locks.request === 'function', 'shared-study-qa-lock-required');
  required(typeof storageFactory === 'function' && typeof uuid === 'function' && typeof now === 'function',
    'shared-study-qa-config');

  const key = metadataKey(runId);
  const database = databaseName(runId);
  const existing = allocation(metadata.getItem(key));
  let identity;
  if (existing !== null && existing !== undefined) {
    identity = Object.freeze({learner: LEARNER, environment: ENVIRONMENT, installation: existing.installation, mode: 'open'});
  } else {
    const installation = installationFor(uuid);
    if (typeof installation !== 'string' || !INSTALLATION.test(installation))
      throw Error('shared-study-qa-installation');
    identity = Object.freeze({learner: LEARNER, environment: ENVIRONMENT, installation, mode: 'fresh'});
  }

  const sync = syncConfig == null ? null : typeof syncConfig.attach === 'function' && syncConfig.hooks
    ? syncConfig : createSharedStudySync(syncConfig);
  let active = null;
  let activeStorage = null;
  let disposed = false;

  function fixtureInitialize(mode) {
    if (mode !== 'fresh' || sync) return null;
    return async ({store}) => {
      if (!store || store.scope?.learner !== LEARNER || store.scope?.environment !== ENVIRONMENT ||
          !INSTALLATION.test(store.scope?.installation || '')) throw Error('shared-study-qa-scope');
      const ts = now();
      const event = {v: 4, id: '@server:1', learner: LEARNER, install: '@server', dseq: 1, base: 0,
        ts, epoch: 0, policy: 'nsrs-policy-v1', type: 'permit-grant',
        data: {install: store.scope.installation,
          permitIds: Array.from({length: 20}, (_, index) => `qa-initial-${index + 1}`),
          ...dayBounds(ts, 'Asia/Tokyo')}};
      await store.reconcile({events: [{seq: 1, rt: ts, authority: 'server', event,
        bodyHash: payloadHash(event)}], head: 1});
    };
  }

  async function withAdapter(callback) {
    if (disposed) throw Error('shared-study-qa-disposed');
    if (typeof callback !== 'function') throw Error('shared-study-qa-adapter-required');
    return locks.request(lockName(runId), async () => {
      if (disposed) throw Error('shared-study-qa-disposed');
      // Re-read inside the creation lock. A concurrent host may have won the
      // durable marker; never silently switch installations or fall back fresh.
      const durable = allocation(metadata.getItem(key));
      let mode;
      if (durable !== null && durable !== undefined) {
        if (durable.installation !== identity.installation) throw Error('shared-study-qa-identity-race');
        mode = 'open';
      } else {
        if (identity.mode === 'open') throw Error('shared-study-qa-marker-missing');
        // Allocate identity durably before creating a store. A crash anywhere
        // after this point can only reopen this installation; missing storage
        // blocks instead of silently creating an empty replacement learner.
        metadata.setItem(key, JSON.stringify({format:'bunki-shared-study-qa-allocation/v1',
          installation:identity.installation,phase:'allocated'}));
        mode = 'fresh';
      }
      const chosen = Object.freeze({...identity, mode});
      const storage = await storageFactory({databaseName: database, runId, identity: chosen});
      required(storage && typeof storage.read === 'function' && typeof storage.compareAndSwap === 'function',
        'shared-study-qa-storage-required');
      const binding = {storage, identity: chosen,now,
        presentation:globalThis.matchMedia?.('(max-width: 600px)')?.matches?'phone':'desktop'};
      if (audio !== null && audio !== undefined) binding.audio = audio;
      if (sync) {
        binding.transport = sync;
        Object.assign(binding, sync.hooks);
      } else {
        const initialize = fixtureInitialize(mode);
        if (initialize) binding.initialize = initialize;
      }
      let adapter;
      try {
        if(disposed)throw Error('shared-study-qa-disposed');
        adapter = await callback(Object.freeze(binding));
        if (!adapter || typeof adapter !== 'object') throw Error('shared-study-qa-adapter-required');
        if(disposed)throw Error('shared-study-qa-disposed');
        if (sync) await sync.attach(adapter);
        if(disposed)throw Error('shared-study-qa-disposed');
        if (durable?.phase!=='ready') metadata.setItem(key,JSON.stringify({
          format:'bunki-shared-study-qa-allocation/v1',installation:chosen.installation,phase:'ready'}));
        active = adapter;activeStorage=storage;
        return adapter;
      } catch(error) {
        disposeSharedStudyAudioPreparation(adapter);
        adapter?.backend?.dispose();
        await storage.close?.();
        throw error;
      }
    });
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    disposeSharedStudyAudioPreparation(active);
    // Fence new requests first; the canonical in-flight turn can still settle
    // its acknowledgement/reconciliation before handles and storage close.
    let failure = null;
    try {
      sync?.dispose();
      await sync?.drain();
    } catch (error) {
      failure = {error};
    } finally {
      try {
        active?.backend?.dispose();
      } catch (error) {
        failure ??= {error};
      }
      try {
        await activeStorage?.close?.();
      } catch (error) {
        failure ??= {error};
      } finally {
        activeStorage = null;
        active = null;
      }
    }
    if (failure) throw failure.error;
  }

  return Object.freeze({
    identity,
    withAdapter,
    sync,
    getSyncState: () => sync ? sync.getSyncState() : 'idle',
    getSyncError: () => sync ? sync.getSyncError() : null,
    subscribeSyncState: listener => sync ? sync.subscribeSyncState(listener) : () => {},
    synchronize: () => sync ? sync.synchronize() : Promise.reject(Error('shared-study-qa-sync-unconfigured')),
    dispose,
  });
}
