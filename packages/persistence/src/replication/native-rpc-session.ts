import { canonicalJson } from '@bunki/domain/canonical-json';
import {
  operationReference,
  parseSyncBinding,
  parseSyncOperation,
  type OperationRef,
  type SyncBinding,
  type SyncOperation,
} from '@bunki/sync';
import type {
  AuthenticatedSyncSession,
  SyncPullPage,
  SyncPullRequest,
  SyncPushAcknowledgement,
  SyncPushRequest,
  SyncSessionCapture,
} from '@bunki/persistence/replication';

/** A trusted embedding owns an exclusive, fresh native RPC connection. It must
 * serialize sends in invocation order, bound its own I/O buffers, and notify
 * close on EOF, process loss, partial write failure or navigation replacement.
 * No diagnostic strings or decoded wire objects cross this port.
 */
export interface NativeRpcBytePort {
  readonly connectionId: string;
  send(frame: Uint8Array): Promise<void>;
  subscribe(receiver: { data(bytes: Uint8Array): void; close(): void }): () => void;
  close(): void;
}

/** These exact values and the authorization capability come from trusted host
 * lifecycle/profile-pairing code, separately from all RPC traffic. In particular
 * accountId is the existing logical scope, never a replacement CloudKit user ID.
 */
export interface NativeRpcOwnerCapture extends SyncSessionCapture {
  readonly leaseId: string;
  readonly connectionId: string;
  readonly ownerId: string;
  readonly processId: string;
  readonly navigationId: string;
}
export interface NativeRpcAuthority {
  capture(): NativeRpcOwnerCapture;
  /** Synchronous, value-aware owner/authorization freshness check. */
  assertCurrent(captured: NativeRpcOwnerCapture): boolean;
}

/** Must match the limits configured by the trusted native embedding. These are
 * the frozen Swift defaults/ceilings, not limits inferred from describe.
 */
export interface NativeRpcLimits {
  readonly maxOperations: number;
  readonly maxEnvelopeBytes: number;
  readonly maxBatchBytes: number;
  readonly maxCursorBytes: number;
  readonly maxFrameBytes: number;
  readonly maxChunkBytes: number;
  readonly maxQueuedFrames: number;
}
const DEFAULT_LIMITS: NativeRpcLimits = Object.freeze({
  maxOperations: 100,
  maxEnvelopeBytes: 256 * 1024,
  maxBatchBytes: 1024 * 1024,
  maxCursorBytes: 8192,
  maxFrameBytes: 2 * 1024 * 1024,
  maxChunkBytes: 64 * 1024,
  maxQueuedFrames: 4,
});

export type NativeRpcSessionErrorCode =
  | 'invalid-authority'
  | 'stale-session'
  | 'busy'
  | 'cancelled'
  | 'closed'
  | 'invalid-request'
  | 'invalid-response'
  | 'limits-exceeded'
  | 'transport-unavailable'
  | 'native-failure';

/** Only fixed local codes escape; native/provider text and payloads never do. */
export class NativeRpcSessionError extends Error {
  constructor(readonly code: NativeRpcSessionErrorCode) {
    super(`Native RPC session: ${code}`);
    this.name = 'NativeRpcSessionError';
  }
}
function requireThat(value: unknown, code: NativeRpcSessionErrorCode): asserts value {
  if (!value) throw new NativeRpcSessionError(code);
}
function failure(error: unknown, fallback: NativeRpcSessionErrorCode): NativeRpcSessionError {
  return error instanceof NativeRpcSessionError ? error : new NativeRpcSessionError(fallback);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const FORMAT = 'kairo-journal-rpc';
const JOURNAL_ERRORS = new Set([
  'invalidInput',
  'wrongScope',
  'invalidEnvelope',
  'conflictingOperation',
  'invalidResponse',
  'accountUnavailable',
  'unauthorizedScope',
  'staleSession',
  'busy',
  'cancelled',
  'transportUnavailable',
  'invalidCursor',
  'checkpointExpired',
  'journalReset',
  'physicalDeletion',
  'limitsExceeded',
]);
const NATIVE_ERRORS = new Set([
  ...JOURNAL_ERRORS,
  'invalid-frame',
  'limits-exceeded',
  'session-required',
  'wrong-connection',
  'stale-session',
  'connection-lost',
  'io-failure',
  'transport-unavailable',
]);
const AUTHORITY_LOST = new Set([
  'session-required',
  'wrong-connection',
  'stale-session',
  'staleSession',
  'accountUnavailable',
  'unauthorizedScope',
]);
const INVALIDATIONS = new Set([
  'account-changed',
  'profile-changed',
  'logout',
  'connection-lost',
  'replaced',
  'shutdown',
  'native-session-lost',
]);

function scalar(text: string): boolean {
  for (let at = 0; at < text.length; at += 1) {
    const value = text.charCodeAt(at);
    if (value >= 0xd800 && value <= 0xdbff) {
      const next = text.charCodeAt(++at);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (value >= 0xdc00 && value <= 0xdfff) return false;
  }
  return true;
}
function string(raw: unknown, maxBytes: number, code: NativeRpcSessionErrorCode): string {
  requireThat(
    typeof raw === 'string' && raw.length > 0 && raw.length <= maxBytes && scalar(raw),
    code,
  );
  requireThat(encoder.encode(raw).length <= maxBytes, code);
  return raw;
}
function fields(
  raw: unknown,
  names: readonly string[],
  code: NativeRpcSessionErrorCode,
): Record<string, unknown> {
  requireThat(raw !== null && typeof raw === 'object' && !Array.isArray(raw), code);
  const prototype = Object.getPrototypeOf(raw);
  requireThat(prototype === Object.prototype || prototype === null, code);
  const own = Object.getOwnPropertyDescriptors(raw);
  requireThat(Reflect.ownKeys(own).length === names.length, code);
  const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    const descriptor = own[name];
    requireThat(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
    value[name] = descriptor.value;
  }
  return value;
}
function bounded(raw: unknown, min: number, max: number, code: NativeRpcSessionErrorCode): number {
  requireThat(
    typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= min && raw <= max,
    code,
  );
  return raw;
}
function operationInputs(raw: unknown, max: number): unknown[] {
  requireThat(Array.isArray(raw) && raw.length > 0 && raw.length <= max, 'limits-exceeded');
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  requireThat(Reflect.ownKeys(descriptors).length === raw.length + 1, 'invalid-request');
  return Array.from({ length: raw.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    requireThat(
      descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'invalid-request',
    );
    return descriptor.value as unknown;
  });
}
function copyBinding(raw: unknown, code: NativeRpcSessionErrorCode): SyncBinding {
  return Object.freeze(
    parseSyncBinding(fields(raw, ['accountId', 'learnerId', 'sessionId'], code)),
  );
}
function bindingEquals(left: SyncBinding, right: SyncBinding): boolean {
  return (
    left.accountId === right.accountId &&
    left.learnerId === right.learnerId &&
    left.sessionId === right.sessionId
  );
}
function copyCapture(raw: unknown): SyncSessionCapture {
  const row = fields(raw, ['binding', 'channelId', 'epoch'], 'invalid-authority');
  return Object.freeze({
    binding: copyBinding(row['binding'], 'invalid-authority'),
    channelId: string(row['channelId'], 1024, 'invalid-authority'),
    epoch: bounded(row['epoch'], 0, Number.MAX_SAFE_INTEGER, 'invalid-authority'),
  });
}
function copyOwner(raw: unknown): NativeRpcOwnerCapture {
  const row = fields(
    raw,
    [
      'binding',
      'channelId',
      'epoch',
      'leaseId',
      'connectionId',
      'ownerId',
      'processId',
      'navigationId',
    ],
    'invalid-authority',
  );
  const captured = copyCapture({
    binding: row['binding'],
    channelId: row['channelId'],
    epoch: row['epoch'],
  });
  const leaseId = string(row['leaseId'], 36, 'invalid-authority');
  const connectionId = string(row['connectionId'], 36, 'invalid-authority');
  requireThat(UUID.test(leaseId) && UUID.test(connectionId), 'invalid-authority');
  return Object.freeze({
    ...captured,
    leaseId,
    connectionId,
    ownerId: string(row['ownerId'], 1024, 'invalid-authority'),
    processId: string(row['processId'], 1024, 'invalid-authority'),
    navigationId: string(row['navigationId'], 1024, 'invalid-authority'),
  });
}
function captureEquals(left: SyncSessionCapture, right: SyncSessionCapture): boolean {
  return (
    bindingEquals(left.binding, right.binding) &&
    left.channelId === right.channelId &&
    left.epoch === right.epoch
  );
}
function ownerEquals(left: NativeRpcOwnerCapture, right: NativeRpcOwnerCapture): boolean {
  return (
    captureEquals(left, right) &&
    left.leaseId === right.leaseId &&
    left.connectionId === right.connectionId &&
    left.ownerId === right.ownerId &&
    left.processId === right.processId &&
    left.navigationId === right.navigationId
  );
}
function limitsOf(raw: Partial<NativeRpcLimits>): NativeRpcLimits {
  const row = { ...DEFAULT_LIMITS, ...raw };
  fields(row, Object.keys(DEFAULT_LIMITS), 'limits-exceeded');
  return Object.freeze({
    maxOperations: bounded(row.maxOperations, 1, 100, 'limits-exceeded'),
    maxEnvelopeBytes: bounded(row.maxEnvelopeBytes, 1, 256 * 1024, 'limits-exceeded'),
    maxBatchBytes: bounded(row.maxBatchBytes, 1024, 8 * 1024 * 1024, 'limits-exceeded'),
    maxCursorBytes: bounded(row.maxCursorBytes, 1024, 8192, 'limits-exceeded'),
    maxFrameBytes: bounded(row.maxFrameBytes, 1024, 2 * 1024 * 1024, 'limits-exceeded'),
    maxChunkBytes: bounded(row.maxChunkBytes, 1, 64 * 1024, 'limits-exceeded'),
    maxQueuedFrames: bounded(row.maxQueuedFrames, 1, 4, 'limits-exceeded'),
  });
}

/** Closed JSON reader for the small RPC wrapper, before any operation admission.
 * No JSON.parse of a recursively nested object and no duplicate-key overwrite.
 * Operation JSON has the separate, larger core parser budget.
 */
function parseJson(text: string, maxDepth = 8, maxNodes = 2048): Record<string, unknown> {
  let at = 0;
  let nodes = 0;
  const whitespace = () => {
    while (/[\t\n\r ]/u.test(text[at] ?? '') && at < text.length) at += 1;
  };
  const take = (token: string) => {
    whitespace();
    requireThat(text[at] === token, 'invalid-response');
    at += 1;
  };
  const quoted = (): string => {
    whitespace();
    const start = at;
    take('"');
    while (at < text.length) {
      const value = text[at++];
      if (value === '"') {
        const parsed: unknown = JSON.parse(text.slice(start, at));
        requireThat(typeof parsed === 'string' && scalar(parsed), 'invalid-response');
        return parsed;
      }
      requireThat(value !== undefined && value.charCodeAt(0) >= 32, 'invalid-response');
      if (value === '\\') at += 1;
    }
    throw new NativeRpcSessionError('invalid-response');
  };
  const value = (depth: number): unknown => {
    requireThat(depth <= maxDepth && ++nodes <= maxNodes, 'limits-exceeded');
    whitespace();
    if (text[at] === '"') return quoted();
    if (text[at] === '{') {
      at += 1;
      whitespace();
      const row: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (text[at] === '}') {
        at += 1;
        return row;
      }
      for (;;) {
        const key = quoted();
        requireThat(++nodes <= maxNodes && !Object.hasOwn(row, key), 'invalid-response');
        take(':');
        row[key] = value(depth + 1);
        whitespace();
        if (text[at] === '}') {
          at += 1;
          return row;
        }
        take(',');
      }
    }
    if (text[at] === '[') {
      at += 1;
      whitespace();
      const array: unknown[] = [];
      if (text[at] === ']') {
        at += 1;
        return array;
      }
      for (;;) {
        array.push(value(depth + 1));
        whitespace();
        if (text[at] === ']') {
          at += 1;
          return array;
        }
        take(',');
      }
    }
    const start = at;
    while (at < text.length && !/[\t\n\r ,\]}]/u.test(text[at] ?? '')) at += 1;
    requireThat(at > start, 'invalid-response');
    const parsed: unknown = JSON.parse(text.slice(start, at));
    requireThat(
      parsed === null ||
        typeof parsed === 'boolean' ||
        (typeof parsed === 'number' && Number.isFinite(parsed)),
      'invalid-response',
    );
    return parsed;
  };
  const result = value(0);
  whitespace();
  requireThat(
    at === text.length && result !== null && typeof result === 'object' && !Array.isArray(result),
    'invalid-response',
  );
  return result as Record<string, unknown>;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let at = 0; at < bytes.length; at += 3) {
    const first = bytes[at] ?? 0;
    const second = bytes[at + 1] ?? 0;
    const third = bytes[at + 2] ?? 0;
    chunks.push(
      (ALPHABET[first >> 2] ?? '') +
        (ALPHABET[((first & 3) << 4) | (second >> 4)] ?? '') +
        (at + 1 < bytes.length ? ALPHABET[((second & 15) << 2) | (third >> 6)] : '=') +
        (at + 2 < bytes.length ? ALPHABET[third & 63] : '='),
    );
  }
  return chunks.join('');
}
function fromBase64(raw: unknown, limit: number): Uint8Array {
  requireThat(
    typeof raw === 'string' &&
      raw.length > 0 &&
      raw.length <= 4 * Math.ceil(limit / 3) &&
      raw.length % 4 === 0,
    'invalid-response',
  );
  requireThat(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(raw),
    'invalid-response',
  );
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  const count = (raw.length / 4) * 3 - padding;
  requireThat(count <= limit, 'limits-exceeded');
  const bytes = new Uint8Array(count);
  let position = 0;
  for (let at = 0; at < raw.length; at += 4) {
    const a = ALPHABET.indexOf(raw[at] ?? '');
    const b = ALPHABET.indexOf(raw[at + 1] ?? '');
    const c = ALPHABET.indexOf(raw[at + 2] ?? '');
    const d = ALPHABET.indexOf(raw[at + 3] ?? '');
    bytes[position++] = (a << 2) | (b >> 4);
    if (position < count) bytes[position++] = ((b & 15) << 4) | (c >> 2);
    if (position < count) bytes[position++] = ((c & 3) << 6) | d;
  }
  requireThat(toBase64(bytes) === raw, 'invalid-response');
  return bytes;
}
function reference(raw: unknown): OperationRef {
  const row = fields(raw, ['opId', 'sha256'], 'invalid-response');
  requireThat(
    typeof row['opId'] === 'string' &&
      DIGEST.test(row['opId']) &&
      typeof row['sha256'] === 'string' &&
      DIGEST.test(row['sha256']),
    'invalid-response',
  );
  return Object.freeze({ opId: row['opId'], sha256: row['sha256'] });
}
function inScope(operation: SyncOperation, binding: SyncBinding): void {
  requireThat(
    operation.scope.accountId === binding.accountId &&
      operation.scope.learnerId === binding.learnerId,
    'invalid-response',
  );
}
function cursor(raw: unknown, limit: number): string | null {
  return raw === null ? null : string(raw, limit, 'invalid-response');
}
function encodedFrame(row: unknown, limit: number): Uint8Array {
  const body = encoder.encode(JSON.stringify(row));
  requireThat(body.length > 0 && body.length <= limit, 'limits-exceeded');
  const frame = new Uint8Array(body.length + 4);
  new DataView(frame.buffer).setUint32(0, body.length, false);
  frame.set(body, 4);
  return frame;
}

interface ActiveRequest {
  readonly id: string;
  readonly method: 'push' | 'pull';
  readonly request: SyncPushRequest | SyncPullRequest;
  readonly captured: SyncSessionCapture;
  readonly signal: AbortSignal;
  readonly abort: () => void;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: NativeRpcSessionError) => void;
  sent: boolean;
  terminal: boolean;
  cancelled: boolean;
  result?: unknown;
  error?: NativeRpcSessionError;
}
interface CancelControl {
  readonly id: string;
  readonly targetId: string;
}
const claimedPorts = new WeakSet<NativeRpcBytePort>();

/** Foreground transport only. It neither owns a store nor retries a write.
 * Host invalidation/close is terminal; create a new instance only after a fresh
 * trusted authorization and native connection. Describe is never an authority.
 */
export class NativeRpcSyncSession implements AuthenticatedSyncSession {
  readonly #port: NativeRpcBytePort;
  readonly #authority: NativeRpcAuthority;
  readonly #owner: NativeRpcOwnerCapture;
  readonly #limits: NativeRpcLimits;
  #unsubscribe: (() => void) | null = null;
  #dead: NativeRpcSessionError | null = null;
  #sequence = 0;
  #active: ActiveRequest | null = null;
  #control: CancelControl | null = null;
  readonly #prefix = new Uint8Array(4);
  #prefixUsed = 0;
  #body: Uint8Array | null = null;
  #bodyUsed = 0;

  constructor(options: {
    port: NativeRpcBytePort;
    authority: NativeRpcAuthority;
    limits?: Partial<NativeRpcLimits>;
  }) {
    try {
      this.#port = options.port;
      this.#authority = options.authority;
      this.#limits = limitsOf(options.limits ?? {});
      this.#owner = copyOwner(this.#authority.capture());
      requireThat(
        this.#owner.connectionId === this.#port.connectionId &&
          !claimedPorts.has(this.#port) &&
          this.#authority.assertCurrent(this.#owner) === true,
        'invalid-authority',
      );
      claimedPorts.add(this.#port);
      const unsubscribe = this.#port.subscribe({
        data: (bytes) => this.#input(bytes),
        close: () => this.#close('closed'),
      });
      this.#unsubscribe = unsubscribe;
      if (this.#dead) {
        this.#unsubscribe = null;
        unsubscribe();
      }
    } catch (error) {
      throw failure(error, 'invalid-authority');
    }
  }

  capture(): SyncSessionCapture {
    this.#guard();
    return Object.freeze({
      binding: this.#owner.binding,
      channelId: this.#owner.channelId,
      epoch: this.#owner.epoch,
    });
  }
  assertCurrent(captured: SyncSessionCapture): boolean {
    try {
      this.#guard(captured);
      return true;
    } catch {
      return false;
    }
  }
  /** Must be called synchronously by the host on logout, owner/navigation change
   * or native lease loss. Late bytes can never reopen or rebind this instance.
   */
  invalidate(): void {
    this.#close('stale-session');
  }
  close(): void {
    this.#close('closed');
  }

  #guard(captured?: SyncSessionCapture, signal?: AbortSignal): void {
    if (this.#dead) throw this.#dead;
    let current = false;
    try {
      current =
        this.#port.connectionId === this.#owner.connectionId &&
        ownerEquals(copyOwner(this.#authority.capture()), this.#owner) &&
        this.#authority.assertCurrent(this.#owner) === true;
    } catch {
      /* fail closed without provider/owner diagnostics */
    }
    if (!current) {
      this.#close('stale-session');
      throw this.#dead;
    }
    if (captured) requireThat(captureEquals(copyCapture(captured), this.#owner), 'stale-session');
    requireThat(!signal?.aborted, 'cancelled');
  }
  #close(code: NativeRpcSessionErrorCode): void {
    if (this.#dead) return;
    this.#dead = new NativeRpcSessionError(code);
    const active = this.#active;
    this.#active = null;
    this.#control = null;
    this.#body = null;
    this.#bodyUsed = 0;
    this.#prefixUsed = 0;
    if (active) {
      active.signal.removeEventListener('abort', active.abort);
      active.reject(this.#dead);
    }
    const unsubscribe = this.#unsubscribe;
    this.#unsubscribe = null;
    try {
      unsubscribe?.();
    } catch {
      /* diagnostics are not protocol */
    }
    try {
      this.#port.close();
    } catch {
      /* state was already invalidated */
    }
  }
  #nextId(): string {
    requireThat(this.#sequence < Number.MAX_SAFE_INTEGER, 'closed');
    this.#sequence += 1;
    return String(this.#sequence);
  }
  #copyRequest(
    raw: SyncPushRequest | SyncPullRequest,
    method: 'push' | 'pull',
  ): SyncPushRequest | SyncPullRequest {
    const row = fields(
      raw,
      method === 'push'
        ? ['requestId', 'binding', 'channelId', 'operations', 'maxBytes']
        : ['requestId', 'binding', 'channelId', 'checkpoint', 'limit', 'maxBytes'],
      'invalid-request',
    );
    const common = {
      requestId: string(row['requestId'], 1024, 'invalid-request'),
      binding: copyBinding(row['binding'], 'invalid-request'),
      channelId: string(row['channelId'], 1024, 'invalid-request'),
      maxBytes: bounded(row['maxBytes'], 1024, 8 * 1024 * 1024, 'invalid-request'),
    };
    requireThat(
      bindingEquals(common.binding, this.#owner.binding) &&
        common.channelId === this.#owner.channelId,
      'invalid-request',
    );
    if (method === 'pull')
      return Object.freeze({
        ...common,
        checkpoint: cursor(row['checkpoint'], this.#limits.maxCursorBytes),
        limit: bounded(row['limit'], 1, this.#limits.maxOperations, 'limits-exceeded'),
      });
    const operations: SyncOperation[] = [];
    const seen = new Set<string>();
    for (const rawOperation of operationInputs(row['operations'], this.#limits.maxOperations)) {
      const operation = parseSyncOperation(rawOperation);
      inScope(operation, common.binding);
      requireThat(!seen.has(operation.opId), 'invalid-request');
      seen.add(operation.opId);
      operations.push(operation);
    }
    return Object.freeze({ ...common, operations: Object.freeze(operations) });
  }
  push(
    captured: SyncSessionCapture,
    request: SyncPushRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    return this.#request('push', captured, request, signal);
  }
  pull(
    captured: SyncSessionCapture,
    request: SyncPullRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    return this.#request('pull', captured, request, signal);
  }
  #request(
    method: 'push' | 'pull',
    captured: SyncSessionCapture,
    raw: SyncPushRequest | SyncPullRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    try {
      this.#guard(captured, signal);
      requireThat(!this.#active && !this.#control, 'busy');
      const request = this.#copyRequest(raw, method);
      const capture = copyCapture(captured);
      let params: unknown;
      if ('operations' in request) {
        let total = 0;
        params = {
          leaseId: this.#owner.leaseId,
          envelopes: request.operations.map((operation) => {
            const bytes = encoder.encode(canonicalJson(operation));
            total += bytes.length;
            requireThat(
              bytes.length <= this.#limits.maxEnvelopeBytes && total <= this.#limits.maxBatchBytes,
              'limits-exceeded',
            );
            return { reference: operationReference(operation), canonicalBase64: toBase64(bytes) };
          }),
        };
      } else
        params = {
          leaseId: this.#owner.leaseId,
          checkpoint: request.checkpoint,
          limit: request.limit,
        };
      const id = this.#nextId();
      // Coordinator JSON budget and native canonical/base64 frame budget are
      // distinct. Refuse the whole request on either limit, never slice it.
      const frame = encodedFrame(
        { format: FORMAT, v: 1, id, method, params },
        Math.min(request.maxBytes, this.#limits.maxFrameBytes),
      );
      const result = new Promise<unknown>((resolve, reject) => {
        const active: ActiveRequest = {
          id,
          method,
          request,
          captured: capture,
          signal,
          resolve,
          reject,
          sent: false,
          terminal: false,
          cancelled: false,
          abort: () => this.#cancel(active),
        };
        this.#active = active;
        signal.addEventListener('abort', active.abort, { once: true });
        try {
          this.#guard(capture, signal);
          const sent = this.#port.send(frame);
          void Promise.resolve(sent).then(
            () => {
              if (this.#active !== active) return;
              try {
                this.#guard();
                active.sent = true;
                this.#finish(active);
              } catch {
                this.#close('stale-session');
              }
            },
            () => this.#close('transport-unavailable'),
          );
        } catch (error) {
          this.#close(failure(error, 'transport-unavailable').code);
        }
      });
      // A revocation/event admitted later in the same raw chunk or before the
      // public continuation runs wins over a queued successful response.
      return result.then((value) => {
        this.#guard(capture, signal);
        return value;
      });
    } catch (error) {
      return Promise.reject(failure(error, 'invalid-request'));
    }
  }
  #cancel(active: ActiveRequest): void {
    if (this.#active !== active || active.cancelled || this.#dead) return;
    active.cancelled = true;
    active.reject(new NativeRpcSessionError('cancelled'));
    try {
      this.#guard();
      const id = this.#nextId();
      this.#control = { id, targetId: active.id };
      const frame = encodedFrame(
        { format: FORMAT, v: 1, id, method: 'cancel', params: { targetId: active.id } },
        this.#limits.maxFrameBytes,
      );
      // No retry. The bounded target/control slots remain busy until both
      // terminal replies drain, or the host explicitly closes the connection.
      void Promise.resolve(this.#port.send(frame)).catch(() =>
        this.#close('transport-unavailable'),
      );
    } catch (error) {
      this.#close(failure(error, 'transport-unavailable').code);
    }
  }
  #finish(active: ActiveRequest): void {
    if (this.#active !== active || !active.sent || !active.terminal) return;
    this.#active = null;
    active.signal.removeEventListener('abort', active.abort);
    if (active.cancelled) return;
    if (active.error) active.reject(active.error);
    else active.resolve(active.result);
  }
  #input(raw: Uint8Array): void {
    if (this.#dead) return;
    try {
      this.#guard();
      requireThat(
        raw instanceof Uint8Array &&
          raw.buffer instanceof ArrayBuffer &&
          raw.length > 0 &&
          raw.length <= this.#limits.maxChunkBytes,
        'limits-exceeded',
      );
      const bytes = new Uint8Array(raw);
      let at = 0;
      let frames = 0;
      while (at < bytes.length && !this.#dead) {
        if (!this.#body) {
          while (at < bytes.length && this.#prefixUsed < 4)
            this.#prefix[this.#prefixUsed++] = bytes[at++] ?? 0;
          if (this.#prefixUsed < 4) return;
          const count = new DataView(this.#prefix.buffer).getUint32(0, false);
          requireThat(
            count > 0 &&
              count <= Math.min(this.#limits.maxFrameBytes, this.#active?.request.maxBytes ?? 1024),
            'limits-exceeded',
          );
          this.#body = new Uint8Array(count);
          this.#bodyUsed = 0;
        }
        const count = Math.min(this.#body.length - this.#bodyUsed, bytes.length - at);
        this.#body.set(bytes.subarray(at, at + count), this.#bodyUsed);
        at += count;
        this.#bodyUsed += count;
        if (this.#bodyUsed === this.#body.length) {
          requireThat(++frames <= this.#limits.maxQueuedFrames, 'limits-exceeded');
          const body = this.#body;
          this.#body = null;
          this.#bodyUsed = 0;
          this.#prefixUsed = 0;
          this.#reply(parseJson(decoder.decode(body)));
        }
      }
    } catch (error) {
      this.#close(failure(error, 'invalid-response').code);
    }
  }
  #reply(raw: Record<string, unknown>): void {
    this.#guard();
    if (raw['type'] === 'event') {
      const row = fields(
        raw,
        ['format', 'v', 'type', 'event', 'leaseId', 'code'],
        'invalid-response',
      );
      requireThat(
        row['format'] === FORMAT &&
          row['v'] === 1 &&
          row['event'] === 'session-invalidated' &&
          row['leaseId'] === this.#owner.leaseId &&
          typeof row['code'] === 'string' &&
          INVALIDATIONS.has(row['code']),
        'invalid-response',
      );
      this.#close('stale-session');
      return;
    }
    requireThat(typeof raw['ok'] === 'boolean', 'invalid-response');
    const row = fields(
      raw,
      ['format', 'v', 'type', 'id', 'method', 'leaseId', 'ok', raw['ok'] ? 'result' : 'error'],
      'invalid-response',
    );
    requireThat(
      row['format'] === FORMAT && row['v'] === 1 && row['type'] === 'reply',
      'invalid-response',
    );
    const control = this.#control;
    if (control && control.id === row['id']) {
      requireThat(row['method'] === 'cancel' && row['ok'] === true, 'invalid-response');
      const result = fields(row['result'], ['targetId', 'cancelled'], 'invalid-response');
      requireThat(
        result['targetId'] === control.targetId &&
          typeof result['cancelled'] === 'boolean' &&
          row['leaseId'] === (result['cancelled'] ? this.#owner.leaseId : null),
        'invalid-response',
      );
      this.#control = null;
      return;
    }
    const active = this.#active;
    requireThat(
      active &&
        !active.terminal &&
        row['id'] === active.id &&
        row['method'] === active.method &&
        row['leaseId'] === this.#owner.leaseId,
      'invalid-response',
    );
    if (row['ok'] === false) {
      const error = fields(row['error'], ['code'], 'invalid-response');
      const code = error['code'];
      requireThat(typeof code === 'string' && NATIVE_ERRORS.has(code), 'invalid-response');
      if (AUTHORITY_LOST.has(code)) {
        this.#close('stale-session');
        return;
      }
      if (['connection-lost', 'io-failure', 'invalid-frame'].includes(code)) {
        this.#close('closed');
        return;
      }
      active.error = new NativeRpcSessionError(
        code === 'busy'
          ? 'busy'
          : code === 'cancelled'
            ? 'cancelled'
            : ['transportUnavailable', 'transport-unavailable'].includes(code)
              ? 'transport-unavailable'
              : 'native-failure',
      );
    } else {
      const result =
        active.method === 'push'
          ? this.#pushReply(active.request as SyncPushRequest, row['result'])
          : this.#pullReply(active.request as SyncPullRequest, row['result']);
      requireThat(
        encoder.encode(JSON.stringify(result)).length <= active.request.maxBytes,
        'limits-exceeded',
      );
      this.#guard(active.captured);
      active.result = result;
    }
    active.terminal = true;
    this.#finish(active);
  }
  #pushReply(request: SyncPushRequest, raw: unknown): SyncPushAcknowledgement {
    const row = fields(raw, ['accepted', 'failures'], 'invalid-response');
    requireThat(
      Array.isArray(row['accepted']) &&
        Array.isArray(row['failures']) &&
        row['accepted'].length + row['failures'].length === request.operations.length,
      'invalid-response',
    );
    const offered = new Map(
      request.operations.map((operation) => [operation.opId, operationReference(operation)]),
    );
    const seen = new Set<string>();
    const accepted: OperationRef[] = [];
    for (const rawRef of row['accepted']) {
      const ref = reference(rawRef);
      requireThat(
        offered.get(ref.opId)?.sha256 === ref.sha256 && !seen.has(ref.opId),
        'invalid-response',
      );
      seen.add(ref.opId);
      accepted.push(ref);
    }
    for (const rawFailure of row['failures']) {
      const failed = fields(rawFailure, ['opId', 'code'], 'invalid-response');
      const id = failed['opId'];
      const code = failed['code'];
      requireThat(
        typeof id === 'string' &&
          offered.has(id) &&
          !seen.has(id) &&
          typeof code === 'string' &&
          JOURNAL_ERRORS.has(code),
        'invalid-response',
      );
      seen.add(id);
      // A per-record failure is not an account revocation. The transport itself
      // rechecks authority, and only its global loss/event closes this owner.
    }
    return Object.freeze({
      requestId: request.requestId,
      binding: request.binding,
      channelId: request.channelId,
      accepted: Object.freeze(accepted),
    });
  }
  #pullReply(request: SyncPullRequest, raw: unknown): SyncPullPage {
    const row = fields(
      raw,
      ['previous', 'nextCheckpoint', 'envelopes', 'hasMore'],
      'invalid-response',
    );
    requireThat(
      cursor(row['previous'], this.#limits.maxCursorBytes) === request.checkpoint &&
        typeof row['hasMore'] === 'boolean' &&
        Array.isArray(row['envelopes']) &&
        row['envelopes'].length <= request.limit,
      'invalid-response',
    );
    const next = string(row['nextCheckpoint'], this.#limits.maxCursorBytes, 'invalid-response');
    let total = 0;
    const operations: SyncOperation[] = [];
    const seen = new Set<string>();
    for (const rawEnvelope of row['envelopes']) {
      const envelope = fields(rawEnvelope, ['reference', 'canonicalBase64'], 'invalid-response');
      const ref = reference(envelope['reference']);
      requireThat(!seen.has(ref.opId), 'invalid-response');
      seen.add(ref.opId);
      const bytes = fromBase64(
        envelope['canonicalBase64'],
        Math.min(this.#limits.maxEnvelopeBytes, this.#limits.maxBatchBytes - total),
      );
      total += bytes.length;
      const text = decoder.decode(bytes);
      // Apply a bounded duplicate-key-aware reader before the sync core's
      // independent schema/digest/causal validation. No JSON overwrite is admitted.
      const operation = parseSyncOperation(parseJson(text, 20, 30000));
      inScope(operation, request.binding);
      requireThat(
        canonicalJson(operation) === text &&
          operation.opId === ref.opId &&
          operationReference(operation).sha256 === ref.sha256,
        'invalid-response',
      );
      operations.push(operation);
    }
    requireThat(
      next !== request.checkpoint || (operations.length === 0 && !row['hasMore']),
      'invalid-response',
    );
    return Object.freeze({
      requestId: request.requestId,
      binding: request.binding,
      channelId: request.channelId,
      previous: request.checkpoint,
      next,
      operations: Object.freeze(operations),
      hasMore: row['hasMore'],
    });
  }
}
