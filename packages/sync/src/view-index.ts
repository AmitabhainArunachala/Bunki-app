import type { SyncOperation } from './operations.ts';
import { planReceive, type SyncReplica } from './replica.ts';

const indices = new WeakMap<SyncReplica, ReadonlyMap<string, SyncOperation>>();

/** Internal read index; never exported through the public sync API. Admission
 * precedes reuse, and a changed immutable replica gets a different index. */
export function viewOperationIndex(replica: SyncReplica): ReadonlyMap<string, SyncOperation> {
  const checked = planReceive(replica, {
    get binding() {
      return replica.policy.binding;
    },
    operations: [],
  }).next;
  let index = indices.get(checked);
  if (!index) {
    index = new Map(checked.operations.map((operation) => [operation.opId, operation]));
    indices.set(checked, index);
  }
  return index;
}
