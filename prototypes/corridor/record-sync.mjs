/** Renderer end of the foreground native sync bridge. Registration offers an
 * existing local binding for trusted host confirmation; it grants no authority.
 * Only the current record owner may service the fixed store methods and the
 * read-only canonical snapshot preparation used by the iOS native host. */
import { encodeLocalJson, operationReference } from './modules/record-core.mjs';

const REQUEST_LIMIT = 8 * 1024 * 1024;
const SNAPSHOT_LIMIT = 32 * 1024 * 1024;
const STORE_METHODS = ['snapshot', 'commitReceive', 'acknowledgeOutbox'];
const METHODS = new Set([...STORE_METHODS, 'prepareNativeSnapshot']);
const STORE_CODES = new Set([
  'invalid-request', 'closed', 'reopen-required', 'stale-revision', 'checkpoint-conflict',
  'change-identity-conflict', 'local-actor-conflict', 'sequence-exhausted', 'corrupt-store',
  'unsupported-schema', 'policy-mismatch', 'writer-required', 'session-changed',
  'source-changed', 'source-verification-failed', 'storage-failure', 'recovery-required',
  'legacy-record-diverged', 'legacy-record-unreadable', 'legacy-archive-diverged',
  'legacy-drift-diverged', 'legacy-drift-unreadable', 'activation-stores-disagree',
  'migration-binding-mismatch', 'unsupported-migration', 'custody-inconsistent',
  'custody-unavailable', 'drift-migration-required', 'drift-state-unavailable',
  'archive-unavailable', 'archive-changed', 'prepared-generation-diverged',
  'partial-fences', 'fence-awaits-activation', 'binding-mismatch', 'busy',
  'batch-too-large', 'refresh-failed', 'invalid-response',
  'invalid-source', 'invalid-source-options', 'invalid-target', 'invalid-migration-id',
  'invalid-drift-text', 'incomplete-source', 'inconsistent-source', 'unsupported-archive',
  'unsupported-drift-state', 'unsupported-legacy-drift', 'unsupported-legacy-record',
  'drift-source-required', 'drift-state-required', 'drift-root-conflict',
  'noncanonical-drift-state', 'migration-conflict', 'target-occupied',
  'source-changed-before-prepare', 'reserved-migration-data',
]);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const same = (left, right) => encodeLocalJson(left).text === encodeLocalJson(right).text;
function fail(code) { throw Object.assign(new Error('Record sync: ' + code), { code }); }
function insist(value, code = 'invalid-request') { if (!value) fail(code); }
function keys(value, required) {
  insist(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === required.length && required.every((key) => own(value, key)));
}
function copy(raw, limit) {
  const encoded = encodeLocalJson(raw);
  insist(new TextEncoder().encode(encoded.text).byteLength <= limit, 'batch-too-large');
  return encoded.value;
}
function codeOf(value, fallback = 'storage-failure') {
  return STORE_CODES.has(value) ? value : fallback;
}

/** refresh() rereads RecordApp locally so genuine replica handles stay in the
 * renderer. The transport snapshot has no learner documents or migration data;
 * deleting those fields from a transport copy never edits the stored snapshot. */
export function createRecordSyncAdapter({ binding: rawBinding, controller, assertCurrent, refresh }) {
  const binding = copy(rawBinding, 4096);
  keys(binding, ['accountId', 'learnerId', 'sessionId']);
  insist(Object.values(binding).every((value) => typeof value === 'string' && value.length > 0 && value.length <= 256));
  insist(controller && STORE_METHODS.every((method) => typeof controller[method] === 'function') &&
    typeof assertCurrent === 'function' && typeof refresh === 'function');
  let closed = false;
  let busy = false;
  const guard = () => {
    insist(!closed, 'closed');
    insist(assertCurrent() === true, 'writer-required');
  };
  function active(outcome, field) {
    if (!outcome || outcome.status !== 'active' || outcome.targetCommitDurable === true || own(outcome, 'targetReceipt')) {
      const error = Object.assign(new Error('Record sync: record unavailable'), {
        code: codeOf(outcome?.reason, 'recovery-required'),
      });
      if (outcome?.targetCommitDurable === true || outcome && own(outcome, 'targetReceipt')) error.targetCommitDurable = true;
      throw error;
    }
    insist(own(outcome, field), 'invalid-response');
    return outcome[field];
  }
  async function handle(raw) {
    let durable = false;
    if (busy) return { ok: false, error: { code: 'busy' } };
    busy = true;
    try {
      guard();
      const message = copy(raw, REQUEST_LIMIT);
      insist(message && typeof message === 'object' && METHODS.has(message.method));
      const snapshotMethod = message.method === 'snapshot' || message.method === 'prepareNativeSnapshot';
      keys(message, snapshotMethod ? ['requestId', 'method'] : ['requestId', 'method', 'request']);
      insist(typeof message.requestId === 'string' && /^[\x21-\x7e]{1,256}$/u.test(message.requestId));
      const { method, request } = message;
      if (snapshotMethod) {
        const snapshot = active(await controller.snapshot(), 'snapshot');
        guard();
        insist(same(snapshot.policy.binding, binding), 'binding-mismatch');
        if (method === 'prepareNativeSnapshot') {
          // iOS consumes canonical bytes from JS, without trying to recreate
          // JS canonicalization in Swift. This read never acknowledges rows.
          const operations = [...snapshot.outbox].sort((left, right) => left.actor.sequence - right.actor.sequence ||
            (left.opId < right.opId ? -1 : left.opId > right.opId ? 1 : 0));
          const envelopes = [];
          let total = 0;
          for (const operation of operations.slice(0, 100)) {
            const canonicalText = encodeLocalJson(operation).text;
            const bytes = new TextEncoder().encode(canonicalText).byteLength;
            if (bytes > 256 * 1024 || total + bytes > 1024 * 1024) {
              insist(envelopes.length > 0, 'batch-too-large');
              break;
            }
            envelopes.push({ reference: operationReference(operation), canonicalText });
            total += bytes;
          }
          return { ok: true, value: copy({ snapshot: { ...snapshot, documents: [] }, envelopes }, SNAPSHOT_LIMIT) };
        }
        return { ok: true, value: copy({ ...snapshot, documents: [] }, SNAPSHOT_LIMIT) };
      }
      insist(request && typeof request === 'object' && !Array.isArray(request));
      const offeredBinding = method === 'commitReceive' ? request.delivery?.binding : request.binding;
      insist(offeredBinding && same(offeredBinding, binding), 'binding-mismatch');
      guard();
      const receipt = active(await controller[method](request), 'receipt');
      durable = true;
      guard();
      if (method === 'commitReceive') {
        const refreshed = await refresh();
        guard();
        active(refreshed, 'snapshot');
      }
      return { ok: true, value: copy(receipt, REQUEST_LIMIT) };
    } catch (error) {
      // A durable-but-uncertain result is never downgraded to stale-revision,
      // retried here, or reported as a successful outbox acknowledgement.
      return { ok: false, error: { code: codeOf(error?.code),
        ...(durable || error?.targetCommitDurable === true ? { targetCommitDurable: true } : {}) } };
    } finally { busy = false; }
  }
  return Object.freeze({ handle, close() { closed = true; } });
}
