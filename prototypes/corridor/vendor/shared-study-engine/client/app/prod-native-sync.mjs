import {canonicalStringify} from '../replay.mjs';
import {sharedPermitRequest,drainOutbox,onlyLocalPending} from '../permit-request.mjs';

const LOCAL = /^local-[a-f0-9]{32}$/;
const MAC = /^mac-[a-f0-9]{32}$/;

export const canUseLocalPermitAuthority=({localOnly,paired})=>localOnly===true&&paired===false;

export function selectProdNativeSyncRoute({bridge, runtime, validateBridge} = {}) {
  if (bridge == null) return null;
  const scope = {environment:runtime?.environment, learner:runtime?.learner,
    installation:runtime?.installation};
  if (!runtime?.native || !runtime.localOnly || scope.environment !== 'standalone-local' ||
      !LOCAL.test(scope.learner) || !MAC.test(scope.installation) ||
      !['prod-worker','prod-worker-copy'].includes(bridge.mode) || typeof validateBridge !== 'function') {
    throw Error('prod-native-sync-required');
  }
  try { validateBridge(bridge, {scope, native:true}); }
  catch { throw Error('prod-native-sync-required'); }
  return Object.freeze({bridge, scope:Object.freeze(scope)});
}

export function prodNativePermitRequest(state, {now=Date.now} = {}) {
  const scope = state?.scope, p = state?.projection;
  if (scope?.environment !== 'standalone-local' || !LOCAL.test(scope.learner) ||
      !MAC.test(scope.installation)) throw Error('prod-native-sync-required');
  return sharedPermitRequest(state,{now,prefix:'native-prod',batchSize:5});
}

// A preexisting local canonical prefix must already exist on the Worker, byte
// for byte. This read-only gate prevents accidental fork or silent history loss.
// Local canonical rows are immutable, so a session that already proved a prefix
// re-reads only its last row (head and fork anchor) and the rows applied since.
async function verifyCloudRows(store, bridge, verified = null) {
  const state = await store.readState(), cutoff = state.appliedSeq;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0) throw Error('storage-failed');
  const saved = seq => state.canonical[String(seq)];
  let after = verified?.through > 0 && verified.through <= cutoff && saved(verified.through) &&
    canonicalStringify(saved(verified.through)) === verified.anchor ? verified.through - 1 : 0;
  while (after < cutoff) {
    const limit = Math.min(1000, cutoff-after), page = await bridge.pull(after, limit);
    if (!Number.isSafeInteger(page?.head) || page.head < 0 || !Array.isArray(page.events))
      throw Error('invalid-response');
    if (page.head < cutoff) throw Error('native-sync-bootstrap-required');
    // An incomplete/malformed page proves no divergence. Keep writes gated,
    // but allow a later read-only retry instead of demanding history migration.
    if (!page.events.length || page.events.length > limit) throw Error('invalid-response');
    for (const row of page.events) {
      if (row?.seq !== after+1) throw Error('invalid-response');
      const local = state.canonical[String(after+1)];
      if (!local) throw Error('storage-failed');
      if (canonicalStringify(row)!==canonicalStringify(local)) throw Error('native-sync-bootstrap-required');
      after++;
    }
  }
  return Object.freeze({through:cutoff, anchor:cutoff ? canonicalStringify(saved(cutoff)) : null});
}

export async function verifyProdCloudPrefix(store, bridge) {
  await verifyCloudRows(store, bridge);
  return true;
}

// Keep a failed check distinct from a proved prefix mismatch. Only these
// bounded codes cross into presentation; raw native/network errors stay out.
const PREFIX_ERRORS = new Set(['native-sync-bootstrap-required','network-failed',
  'authentication-required','credential-storage-failed','invalid-credential',
  'update-required','retry-later','transport-busy','server-failed','invalid-response',
  'storage-failed','status-unavailable']);
const prefixFailure = error => PREFIX_ERRORS.has(error?.message) ? error.message : 'status-unavailable';
const prefixState = error => error === 'native-sync-bootstrap-required' ? 'bootstrap-required' : error === 'update-required' ? 'update-required' : 'error';
const RETRYABLE_PREFIX = new Set(['network-failed','retry-later','transport-busy',
  'server-failed','invalid-response','storage-failed','status-unavailable']);
export const isRetryableProdSyncError=error=>RETRYABLE_PREFIX.has(error);

/** Read-only startup evidence; absence of connectivity never proves divergence. */
export async function probeProdCloudPrefix(store, bridge) {
  try { await verifyProdCloudPrefix(store, bridge); return Object.freeze({ready:true,error:null}); }
  catch (error) { return Object.freeze({ready:false,error:prefixFailure(error)}); }
}

export async function syncWithPermits({synchronize, transport, store, permitRequest}) {
  let result = await drainOutbox(synchronize, store);
  // A second device can win a grant against the same prefix. Refetch and
  // recompute that one conflict; network/auth failures remain explicit retries.
  for(let attempt=0;attempt<2;attempt++) {
    if (result.error || result.catchUp || !await transport.isPaired()) return result;
    const stored = await store.status();
    if (!stored.upToDate) {
      if (onlyLocalPending(stored)) return result;
      throw Error('native-sync-replay-blocked');
    }
    const state = await store.readState();
    if (Object.keys(state.local || {}).length) return result;
    const request = permitRequest(state);
    if (request.count === 0) return result;
    try { await transport.reserve(request.count, request.requestId, request.policy); }
    catch(error) {
      if(error?.message!=='conflict'||attempt!==0)throw error;
      result=await synchronize();continue;
    }
    const applied = await synchronize();
    if (!applied.error && !applied.catchUp) {
      const after = await store.status();
      if (!after.upToDate && !onlyLocalPending(after)) throw Error('native-sync-replay-blocked');
    }
    return applied;
  }
}

export function createProdNativeSyncSession({transport, bridge, backend, store, enabled=false, pairingUnknown=false, verificationError=null, now=Date.now} = {}) {
  let disposed = false, flight = null, interactiveFlight = null, actionError = null, verified = null;
  let prefixError = enabled ? null : verificationError === null ? 'native-sync-bootstrap-required' : prefixFailure({message:verificationError});
  const verify = async (full = false) => {
    try { verified = await verifyCloudRows(store, bridge, full ? null : verified); prefixError = null; }
    catch (error) { verified = null; enabled = false; prefixError = prefixFailure(error); throw Error(prefixError); }
  };
  const ensureVerified = async (full = false) => {
    // An unverified network startup may retry the read-only check after
    // reconnection. A mismatch/update/auth gate never starts a quiet write.
    if (!enabled && !isRetryableProdSyncError(prefixError)) throw Error(prefixError);
    await verify(full || !enabled);
    enabled = true;
  };
  const status = async () => {
    if (disposed) throw Error('native-sync-closed');
    const paired=await transport.isPaired();
    return {...transport.status(), paired,
      ...(!bridge.pairingEnabled?{state:'pairing-disabled',error:'pairing-disabled'}:{}),
      ...(!enabled&&paired&&bridge.pairingEnabled?{state:prefixState(prefixError),error:prefixError}:{}),
      ...(actionError?{state:prefixState(actionError),error:actionError}:{}),
      ...(pairingUnknown?{state:'error',error:'authentication-required'}:{})};
  };
  const synchronize = async () => {
    if (disposed) throw Error('native-sync-closed');
    if (!bridge.pairingEnabled) throw Error('pairing-disabled');
    if (!await transport.isPaired()) { verified = null; return status(); }
    await ensureVerified();
    const result = await transport.sync();
    if (disposed) throw Error('native-sync-closed');
    await backend.refresh();
    return result;
  };
  const synchronizeWithPermits = () => syncWithPermits({synchronize, transport, store,
    permitRequest:state=>prodNativePermitRequest(state, {now})});
  function run(key, action) {
    if (disposed) return Promise.reject(Error('native-sync-closed'));
    if (flight) return flight.key === key ? flight.promise : Promise.reject(Error('native-sync-busy'));
    const promise = Promise.resolve().then(async()=>{
      if(disposed) throw Error('native-sync-closed');
      const result = await action();
      if(disposed) throw Error('native-sync-closed');
      actionError = result?.error || null;
      return status();
    }).catch(error=>{actionError=error?.message || 'operation-failed';throw error;})
      .finally(()=>{flight=null;});
    flight = {key,promise};
    return promise;
  }
  const interactiveSync = async()=>{
    if(typeof bridge.authorizeSync==='function'){
      if(!bridge.pairingEnabled)throw Error('pairing-disabled');
      const authorized=await bridge.authorizeSync();
      if(typeof authorized!=='boolean')throw Error('invalid-response');
      if(authorized){
        // Quiet startup may have been unable to unlock the credential. Prove
        // the existing history before enabling writes after explicit access.
        if(!await transport.isPaired())throw Error('authentication-required');
        await verify(true);
        enabled=true;pairingUnknown=false;transport.resumeAfterPairing?.();
      }
    }
    return synchronizeWithPermits();
  };
  const sync = ({interactive=false}={}) => {
    if(disposed)return Promise.reject(Error('native-sync-closed'));
    // A user gesture must not disappear into an already running quiet attempt.
    // Queue exactly one explicit attempt after it; later callers join that work.
    if(interactiveFlight)return interactiveFlight;
    if(interactive!==true)return run('sync',synchronizeWithPermits);
    if(flight&&flight.key!=='sync')return Promise.reject(Error('native-sync-busy'));
    const previous=flight?.promise;
    interactiveFlight=(previous?previous.catch(()=>{}).then(()=>run('sync',interactiveSync)):run('sync',interactiveSync))
      .finally(()=>{interactiveFlight=null;});
    return interactiveFlight;
  };
  return Object.freeze({status,pairingEnabled:bridge.pairingEnabled,
    pairThisMac:()=>run('pair-mac',async()=>{
      if(!bridge.pairingEnabled)throw Error('pairing-disabled');
      if(await transport.isPaired()) {
        await ensureVerified(true);return;
      }
      // Pairing would populate an empty DO and make history import impossible.
      // Existing local history must enter through the native bootstrap protocol.
      const state=await store.readState();
      if(state.head!==0||state.appliedSeq!==0||state.blocked||
          Object.keys(state.canonical||{}).length||Object.keys(state.local||{}).length)
        throw Error('native-sync-bootstrap-required');
      await transport.pairThisMac();
      verified=null;enabled=true;prefixError=null;
      pairingUnknown=false;
    }),
    issueDeviceCode:installation=>run(`phone:${typeof installation}:${installation}`,async()=>{
      if(!bridge.pairingEnabled)throw Error('pairing-disabled');
      if(!await transport.isPaired())throw Error('native-sync-bootstrap-required');
      await ensureVerified(true);
      await transport.issueDeviceCode(...(installation === undefined ? [] : [installation]));
    }),
    sync,
    reserve:sync,
    dispose(){disposed=true;transport.dispose();}});
}
