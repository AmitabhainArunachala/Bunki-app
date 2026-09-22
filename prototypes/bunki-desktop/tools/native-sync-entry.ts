// The closed main-process bundle shares error constructors between the native
// session, coordinator and the renderer storage proxy.
export { NativeRpcSyncSession, NativeRpcSessionError } from '../../../packages/persistence/src/replication/native-rpc-session.ts';
export { SyncCoordinator, SyncCoordinatorError } from '../../../packages/persistence/src/replication/coordinator.ts';
export { ReplicationStoreError } from '../../../packages/persistence/src/replication/errors.ts';
export { parseSyncBinding } from '@bunki/sync';
export { parseFileReference, parseFileTextObservation, sameFileBytes } from '../../../packages/reading/src/file-source.ts';
