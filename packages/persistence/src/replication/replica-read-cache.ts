import {
  createReplica,
  parseAnySyncOperation,
  planReceive,
  type ReplicaPolicy,
  type SyncOperation,
  type SyncReplica,
} from '@bunki/sync';
import { ReplicationStoreError } from './errors.ts';
import { encodeLocalJson } from './json.ts';

interface ParsedEntry {
  readonly text: string;
  readonly operation: SyncOperation;
}
interface CheckedReplica {
  readonly replica: SyncReplica;
  readonly operations: readonly SyncOperation[];
}

/** Reuses only a genuine planner handle backed by the current exact operation
 * bytes and policy. A changed/deleted row rebuilds; additions use the same
 * planner. The caller still checks the persisted projection and actor state.
 */
export class ReplicaReadCache {
  #policyText: string | null = null;
  #entries = new Map<string, ParsedEntry>();
  #checked: CheckedReplica | null = null;

  read(policy: ReplicaPolicy, rows: readonly (readonly [string, unknown])[]): CheckedReplica {
    const empty = createReplica(policy);
    const policyText = encodeLocalJson(empty.policy).text;
    const previous = policyText === this.#policyText ? this.#checked : null;
    const entries = new Map<string, ParsedEntry>();
    for (const [key, raw] of rows) {
      if (entries.has(key)) throw new ReplicationStoreError('corrupt-store');
      const encoded = encodeLocalJson(raw);
      const text = encoded.text;
      const prior = previous ? this.#entries.get(key) : undefined;
      const entry =
        prior?.text === text ? prior : { text, operation: parseAnySyncOperation(encoded.value) };
      if (entry.operation.opId !== key) throw new ReplicationStoreError('corrupt-store');
      entries.set(key, entry);
    }
    const appendOnly =
      previous !== null && [...this.#entries].every(([key, entry]) => entries.get(key) === entry);
    if (appendOnly && entries.size === this.#entries.size) return previous;
    let replica = appendOnly ? previous.replica : empty;
    const operations = [...entries]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, entry]) => entry.operation);
    const added = appendOnly
      ? operations.filter((operation) => !this.#entries.has(operation.opId))
      : operations;
    for (let start = 0; start < added.length; start += 1000)
      replica = planReceive(replica, {
        binding: empty.policy.binding,
        operations: added.slice(start, start + 1000),
      }).next;
    this.#policyText = policyText;
    this.#entries = entries;
    this.#checked = { replica, operations: Object.freeze(operations) };
    return this.#checked;
  }

  clear(): void {
    this.#policyText = null;
    this.#entries.clear();
    this.#checked = null;
  }
}
