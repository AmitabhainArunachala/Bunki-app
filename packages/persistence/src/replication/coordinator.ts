import {
  operationReference,
  parseSyncBinding,
  parseAnySyncOperation as parseSyncOperation,
  type OperationRef,
  type SyncBinding,
  type SyncOperation,
} from '@bunki/sync';

import { ReplicationStoreError } from './errors.ts';
import { assertLocalKey, encodeLocalJson } from './json.ts';
import type { DurableCommitReceipt, ReplicationSnapshot, ReplicationStore } from './port.ts';

/** Supplied by an authenticated session owner, never derived from a device ID. */
export interface SyncSessionCapture {
  readonly binding: SyncBinding;
  readonly channelId: string;
  readonly epoch: number;
}

export interface SyncPushRequest {
  readonly requestId: string;
  readonly binding: SyncBinding;
  readonly channelId: string;
  readonly operations: readonly SyncOperation[];
  readonly maxBytes: number;
}

export interface SyncPushAcknowledgement {
  readonly requestId: string;
  readonly binding: SyncBinding;
  readonly channelId: string;
  /** A unique subset of exactly the offered references; omitted rows stay pending. */
  readonly accepted: readonly OperationRef[];
}

export interface SyncPullRequest {
  readonly requestId: string;
  readonly binding: SyncBinding;
  readonly channelId: string;
  readonly checkpoint: string | null;
  readonly limit: number;
  readonly maxBytes: number;
}

export interface SyncPullPage {
  readonly requestId: string;
  readonly binding: SyncBinding;
  readonly channelId: string;
  readonly previous: string | null;
  readonly next: string | null;
  readonly operations: readonly SyncOperation[];
  readonly hasMore: boolean;
}

/** The implementation owns credentials and remote authentication. Each method
 * must authorize the captured account/learner, enforce response byte limits
 * before decoding, and respect cancellation. Matching IDs are not authority.
 * assertCurrent must synchronously reject logout, revocation and epoch changes.
 * This interface is an injected capability contract, not an authentication SDK.
 */
export interface AuthenticatedSyncSession {
  capture(): SyncSessionCapture;
  assertCurrent(captured: SyncSessionCapture): boolean;
  push(
    captured: SyncSessionCapture,
    request: SyncPushRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  pull(
    captured: SyncSessionCapture,
    request: SyncPullRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface SyncCoordinatorOptions {
  readonly store: Pick<ReplicationStore, 'snapshot' | 'commitReceive' | 'acknowledgeOutbox'>;
  readonly session: AuthenticatedSyncSession;
  readonly pushLimit?: number;
  readonly pullLimit?: number;
  readonly maxBytes?: number;
  readonly revisionRetries?: number;
}

/** A completed bounded cycle is not a claim that all devices are synchronized. */
export interface SyncCycleResult {
  readonly offered: readonly OperationRef[];
  readonly acknowledged: readonly OperationRef[];
  readonly received: readonly OperationRef[];
  readonly checkpoint: string | null;
  readonly pendingOutbox: number;
  readonly pendingCausal: number;
  readonly hasMore: boolean;
}

export type SyncCoordinatorErrorCode =
  | 'invalid-options'
  | 'session-required'
  | 'stale-session'
  | 'binding-mismatch'
  | 'busy'
  | 'cancelled'
  | 'transport-failed'
  | 'invalid-response'
  | 'batch-too-large'
  | 'checkpoint-changed';

/** Codes only: transport diagnostics can contain credentials or learner text. */
export class SyncCoordinatorError extends Error {
  constructor(readonly code: SyncCoordinatorErrorCode) {
    super(`Sync coordinator: ${code}`);
    this.name = 'SyncCoordinatorError';
  }
}

function insist(condition: unknown, code: SyncCoordinatorErrorCode): asserts condition {
  if (!condition) throw new SyncCoordinatorError(code);
}
const same = (a: unknown, b: unknown) => encodeLocalJson(a).text === encodeLocalJson(b).text;
const identity = (kind: string, data: unknown) => `sync-${kind}:${encodeLocalJson(data).sha256}`;
const size = (data: unknown) => new TextEncoder().encode(encodeLocalJson(data).text).byteLength;
const checkpointOf = (snapshot: ReplicationSnapshot, channel: string) =>
  snapshot.checkpoints.find((entry) => entry.channelId === channel)?.value ?? null;

function copyCapture(raw: SyncSessionCapture): SyncSessionCapture {
  const value = encodeLocalJson(raw).value as unknown as SyncSessionCapture;
  insist(Object.keys(value).length === 3, 'session-required');
  const binding = parseSyncBinding(value.binding);
  assertLocalKey(value.channelId);
  insist(Number.isSafeInteger(value.epoch) && value.epoch >= 0, 'session-required');
  return Object.freeze({ binding, channelId: value.channelId, epoch: value.epoch });
}

function bounded(value: number, min: number, max: number): number {
  insist(Number.isSafeInteger(value) && value >= min && value <= max, 'invalid-options');
  return value;
}

/** Own one coordinator per active store/session owner. Cancellation cannot undo
 * a storage transaction already submitted; wait for its settlement, then reopen
 * or take a fresh snapshot. Never automatically retry an uncertain local commit.
 */
export class SyncCoordinator {
  readonly #store: Pick<ReplicationStore, 'snapshot' | 'commitReceive' | 'acknowledgeOutbox'>;
  readonly #session: AuthenticatedSyncSession;
  readonly #pushLimit: number;
  readonly #pullLimit: number;
  readonly #maxBytes: number;
  readonly #revisionRetries: number;
  #active: AbortController | null = null;

  constructor(options: SyncCoordinatorOptions) {
    this.#store = options.store;
    this.#session = options.session;
    insist(
      this.#session &&
        typeof this.#session.capture === 'function' &&
        typeof this.#session.assertCurrent === 'function' &&
        typeof this.#session.push === 'function' &&
        typeof this.#session.pull === 'function',
      'session-required',
    );
    this.#pushLimit = bounded(options.pushLimit ?? 100, 1, 1000);
    this.#pullLimit = bounded(options.pullLimit ?? 100, 1, 1000);
    this.#maxBytes = bounded(options.maxBytes ?? 1024 * 1024, 1024, 8 * 1024 * 1024);
    this.#revisionRetries = bounded(options.revisionRetries ?? 2, 0, 10);
  }

  cancel(): void {
    this.#active?.abort();
  }

  #guard(capture: SyncSessionCapture, signal: AbortSignal): void {
    insist(!signal.aborted, 'cancelled');
    let active = false;
    try {
      active = this.#session.assertCurrent(capture) === true;
    } catch {
      /* fail closed */
    }
    insist(active, 'stale-session');
  }

  async #snapshot(capture: SyncSessionCapture, signal: AbortSignal): Promise<ReplicationSnapshot> {
    this.#guard(capture, signal);
    const snapshot = await this.#store.snapshot();
    this.#guard(capture, signal);
    insist(same(snapshot.policy.binding, capture.binding), 'binding-mismatch');
    return snapshot;
  }

  async #transport(
    capture: SyncSessionCapture,
    signal: AbortSignal,
    action: () => Promise<unknown>,
  ): Promise<unknown> {
    this.#guard(capture, signal);
    let abort: () => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new SyncCoordinatorError('cancelled'));
      signal.addEventListener('abort', abort, { once: true });
    });
    try {
      // Race only transport. A late result from a noncooperative transport is
      // observed but cannot acknowledge an outbox or mutate a checkpoint.
      const result = await Promise.race([
        Promise.resolve().then(() => {
          this.#guard(capture, signal);
          return action();
        }),
        cancelled,
      ]);
      this.#guard(capture, signal);
      return result;
    } catch {
      this.#guard(capture, signal);
      throw new SyncCoordinatorError('transport-failed');
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  #response(raw: unknown, request: SyncPushRequest | SyncPullRequest, fields: readonly string[]) {
    try {
      insist(size(raw) <= this.#maxBytes, 'invalid-response');
      const value = encodeLocalJson(raw).value;
      insist(
        value !== null && typeof value === 'object' && !Array.isArray(value),
        'invalid-response',
      );
      const row = value as Record<string, unknown>;
      insist(
        Object.keys(row).length === fields.length &&
          fields.every((field) => Object.hasOwn(row, field)),
        'invalid-response',
      );
      insist(
        row['requestId'] === request.requestId &&
          row['channelId'] === request.channelId &&
          same(parseSyncBinding(row['binding']), request.binding),
        'invalid-response',
      );
      return row;
    } catch {
      throw new SyncCoordinatorError('invalid-response');
    }
  }

  #pushRequest(snapshot: ReplicationSnapshot, capture: SyncSessionCapture): SyncPushRequest | null {
    // Early sequences first. The existing planner still owns causal readiness.
    const pending = [...snapshot.outbox]
      .sort(
        (a, b) =>
          a.actor.sequence - b.actor.sequence || (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0),
      )
      .slice(0, this.#pushLimit);
    if (!pending.length) return null;
    let selected: SyncPushRequest | null = null;
    for (const operation of pending) {
      const operations: SyncOperation[] = [...(selected?.operations ?? []), operation];
      const refs = operations.map(operationReference);
      const request: SyncPushRequest = {
        requestId: identity('push', { capture, refs, maxBytes: this.#maxBytes }),
        binding: capture.binding,
        channelId: capture.channelId,
        operations,
        maxBytes: this.#maxBytes,
      };
      if (size(request) > this.#maxBytes) break;
      selected = Object.freeze({ ...request, operations: Object.freeze(operations) });
    }
    if (!selected) throw new SyncCoordinatorError('batch-too-large');
    return selected;
  }

  #accepted(raw: unknown, request: SyncPushRequest): readonly OperationRef[] {
    const row = this.#response(raw, request, ['requestId', 'binding', 'channelId', 'accepted']);
    const accepted = row['accepted'];
    insist(
      Array.isArray(accepted) && accepted.length <= request.operations.length,
      'invalid-response',
    );
    const offered = new Map(
      request.operations.map((operation) => [operation.opId, operationReference(operation)]),
    );
    const seen = new Set<string>();
    const refs: OperationRef[] = [];
    for (const ref of accepted as unknown[]) {
      insist(ref !== null && typeof ref === 'object' && !Array.isArray(ref), 'invalid-response');
      const value = ref as OperationRef;
      const exact = offered.get(value.opId);
      insist(exact && same(exact, value) && !seen.has(value.opId), 'invalid-response');
      refs.push(exact);
      seen.add(value.opId);
    }
    return Object.freeze(refs.sort((a, b) => (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0)));
  }

  #page(raw: unknown, request: SyncPullRequest): SyncPullPage {
    const row = this.#response(raw, request, [
      'requestId',
      'binding',
      'channelId',
      'previous',
      'next',
      'operations',
      'hasMore',
    ]);
    insist(
      row['previous'] === request.checkpoint &&
        typeof row['hasMore'] === 'boolean' &&
        (row['next'] === null || (typeof row['next'] === 'string' && row['next'].length <= 8192)) &&
        Array.isArray(row['operations']) &&
        row['operations'].length <= request.limit,
      'invalid-response',
    );
    let operations;
    try {
      operations = (row['operations'] as unknown[]).map(parseSyncOperation);
    } catch {
      throw new SyncCoordinatorError('invalid-response');
    }
    if (row['next'] === request.checkpoint)
      insist(!operations.length && !row['hasMore'], 'invalid-response');
    else insist(typeof row['next'] === 'string', 'invalid-response');
    return Object.freeze({
      requestId: request.requestId,
      binding: request.binding,
      channelId: request.channelId,
      previous: request.checkpoint,
      next: row['next'] as string | null,
      operations: Object.freeze(operations),
      hasMore: row['hasMore'] as boolean,
    });
  }

  async #commit(
    capture: SyncSessionCapture,
    signal: AbortSignal,
    action: (snapshot: ReplicationSnapshot) => Promise<DurableCommitReceipt>,
  ): Promise<DurableCommitReceipt> {
    for (let attempt = 0; ; attempt++) {
      const snapshot = await this.#snapshot(capture, signal);
      this.#guard(capture, signal);
      try {
        const receipt = await action(snapshot);
        this.#guard(capture, signal);
        return receipt;
      } catch (error) {
        this.#guard(capture, signal);
        if (!(
          error instanceof ReplicationStoreError &&
          error.code === 'stale-revision' &&
          attempt < this.#revisionRetries
        ))
          throw error;
      }
    }
  }

  /** At most one push and one pull; no timer, background loop or hidden retry. */
  async syncOnce(options: { readonly signal?: AbortSignal } = {}): Promise<SyncCycleResult> {
    insist(!this.#active, 'busy');
    const controller = new AbortController();
    const signal = controller.signal;
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    this.#active = controller;
    try {
      let capture;
      try {
        capture = copyCapture(this.#session.capture());
      } catch {
        throw new SyncCoordinatorError('session-required');
      }
      const initial = await this.#snapshot(capture, signal);
      const push = this.#pushRequest(initial, capture);
      let acknowledged: readonly OperationRef[] = [];
      if (push) {
        acknowledged = this.#accepted(
          await this.#transport(capture, signal, () => this.#session.push(capture, push, signal)),
          push,
        );
        if (acknowledged.length)
          await this.#commit(capture, signal, (snapshot) =>
            this.#store.acknowledgeOutbox({
              acknowledgementId: identity('ack', { requestId: push.requestId, acknowledged }),
              binding: capture.binding,
              expectedRevision: snapshot.revision,
              operations: acknowledged,
            }),
          );
      }
      const beforePull = await this.#snapshot(capture, signal);
      const checkpoint = checkpointOf(beforePull, capture.channelId);
      const request: SyncPullRequest = Object.freeze({
        requestId: identity('pull', {
          capture,
          checkpoint,
          limit: this.#pullLimit,
          maxBytes: this.#maxBytes,
        }),
        binding: capture.binding,
        channelId: capture.channelId,
        checkpoint,
        limit: this.#pullLimit,
        maxBytes: this.#maxBytes,
      });
      insist(size(request) <= this.#maxBytes, 'batch-too-large');
      const page = this.#page(
        await this.#transport(capture, signal, () => this.#session.pull(capture, request, signal)),
        request,
      );
      let received: readonly OperationRef[] = [];
      if (page.next !== checkpoint) {
        const next = page.next as string;
        const receipt = await this.#commit(capture, signal, (snapshot) => {
          insist(checkpointOf(snapshot, capture.channelId) === checkpoint, 'checkpoint-changed');
          return this.#store.commitReceive({
            deliveryId: identity('receive', { capture, page }),
            expectedRevision: snapshot.revision,
            delivery: { binding: capture.binding, operations: page.operations },
            checkpoint: { channelId: capture.channelId, expected: checkpoint, next },
          });
        });
        received = receipt.operations;
      }
      const final = await this.#snapshot(capture, signal);
      return Object.freeze({
        offered: Object.freeze(push?.operations.map(operationReference) ?? []),
        acknowledged,
        received,
        checkpoint: checkpointOf(final, capture.channelId),
        pendingOutbox: final.outbox.length,
        pendingCausal: final.replica.pending.length,
        hasMore: page.hasMore || final.outbox.length > 0,
      });
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      if (this.#active === controller) this.#active = null;
    }
  }
}
