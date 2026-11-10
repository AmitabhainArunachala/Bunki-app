import type { SyncReplica } from '@bunki/sync';
import { encodeLocalJson } from './json.ts';

const views = new WeakMap<SyncReplica, ReturnType<typeof encodeLocalJson>>();

/** Called only after core-planner admission inside a storage transaction. The
 * journal cache never substitutes for checking the persisted view's bytes. */
export function viewOf(replica: SyncReplica): ReturnType<typeof encodeLocalJson> {
  let view = views.get(replica);
  if (!view) {
    view = encodeLocalJson({
      ready: replica.ready,
      pending: replica.pending,
      quarantined: replica.quarantined,
      projection: replica.projection,
    });
    views.set(replica, view);
  }
  return view;
}
