/** Device-only permission for bounded tutor excerpts, not ArticleCandidate
 * rights, learning evidence, or portable record authority. A request must
 * also verify the actual source and its current owner at the egress seam. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const SCOPE_FIELDS = ['sourceKind', 'sourceId', 'sourceDigest', 'baseUrl', 'model', 'providerConfigId'];
const LIMIT = 500;
export class SourceProcessingError extends TypeError {
  constructor(code) { super(code); this.name = 'SourceProcessingError'; this.code = code; }
}
const fail = (code) => { throw new SourceProcessingError(code); };
function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length) fail('source-approval-invalid');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (!keys.every((key) => descriptors[key]?.enumerable && 'value' in descriptors[key])) fail('source-approval-invalid');
}
function text(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || !value.isWellFormed() ||
      Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) fail('source-approval-invalid');
  return value;
}
const uuid = (value) => { if (typeof value !== 'string' || !UUID.test(value)) fail('source-approval-invalid'); return value; };
function timestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    fail('source-approval-invalid');
  return value;
}
export function parseSourceProcessingScope(raw) {
  fields(raw, SCOPE_FIELDS);
  if (raw.sourceKind !== 'personal-reading' || typeof raw.sourceDigest !== 'string' || !DIGEST.test(raw.sourceDigest))
    fail('source-approval-invalid');
  const baseUrl = text(raw.baseUrl, 2048);
  let url;
  try { url = new URL(baseUrl); } catch { fail('source-approval-invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      `${url.origin}${url.pathname.replace(/\/+$/, '')}` !== baseUrl) fail('source-approval-invalid');
  return Object.freeze({ sourceKind: raw.sourceKind, sourceId: uuid(raw.sourceId), sourceDigest: raw.sourceDigest,
    baseUrl, model: text(raw.model, 200),
    providerConfigId: raw.providerConfigId === 'legacy-v1' ? 'legacy-v1' : uuid(raw.providerConfigId) });
}
const sameScope = (a, b) => SCOPE_FIELDS.every((key) => a[key] === b[key]);

export function createSourceProcessingApprovals({ storage, installationText, databaseName, assertCurrent, onChange = () => {} }) {
  text(installationText, 16000); text(databaseName, 500);
  const key = `kairo-source-processing-v1:${databaseName}`;
  const leases = new WeakMap(), stopped = new Set();
  const current = () => { if (assertCurrent() !== true) fail('source-approval-owner-changed'); };
  const changed = () => { try { onChange(); } catch { /* Presentation cannot authorize processing. */ } };
  const read = () => {
    current(); const raw = storage.getItem(key);
    if (raw === null) return [];
    if (typeof raw !== 'string' || raw.length > 2000000) fail('source-approval-unreadable');
    let root;
    try { root = JSON.parse(raw); } catch { fail('source-approval-unreadable'); }
    fields(root, ['version', 'installation', 'entries']);
    if (root.version !== 1 || root.installation !== installationText || !Array.isArray(root.entries) || root.entries.length > LIMIT)
      fail('source-approval-unreadable');
    const entries = root.entries.map((entry) => {
      fields(entry, ['scope', 'revision', 'approvedAt']);
      return Object.freeze({ scope: parseSourceProcessingScope(entry.scope), revision: uuid(entry.revision), approvedAt: timestamp(entry.approvedAt) });
    });
    if (new Set(entries.map((entry) => entry.scope.sourceId)).size !== entries.length) fail('source-approval-unreadable');
    return entries;
  };
  const find = (scope) => {
    const entries = read();
    if (stopped.has(scope.sourceId)) return null;
    return entries.find((entry) => sameScope(entry.scope, scope)) || null;
  };
  const write = (entries) => {
    current();
    storage.setItem(key, JSON.stringify({ version: 1, installation: installationText, entries }));
  };
  return Object.freeze({ key,
    status(raw) {
      const scope = parseSourceProcessingScope(raw); current();
      if (stopped.has(scope.sourceId)) return 'revocation-pending';
      return find(scope) ? 'approved' : 'approval-required';
    },
    allow(raw, revision, approvedAt) {
      const scope = parseSourceProcessingScope(raw);
      const entry = Object.freeze({ scope, revision: uuid(revision), approvedAt: timestamp(approvedAt) });
      const entries = read().filter((item) => item.scope.sourceId !== scope.sourceId);
      if (entries.length >= LIMIT) fail('source-approval-capacity');
      write([...entries, entry]); stopped.delete(scope.sourceId); changed(); return entry;
    },
    revoke(sourceId) {
      uuid(sourceId); current();
      // Stop this window before disk I/O. A failed revocation must never let
      // an old in-flight lease continue; the UI must report failed persistence.
      stopped.add(sourceId); changed();
      const entries = read().filter((entry) => entry.scope.sourceId !== sourceId);
      write(entries); stopped.delete(sourceId); changed(); return true;
    },
    issue(raw) {
      const scope = parseSourceProcessingScope(raw), entry = find(scope);
      if (!entry) fail('source-approval-required');
      const lease = Object.freeze({});
      leases.set(lease, { scope, revision: entry.revision }); return lease;
    },
    assertLease(lease, raw) {
      const scope = parseSourceProcessingScope(raw), issued = leases.get(lease), entry = find(scope);
      if (!issued || !entry || !sameScope(issued.scope, scope) || issued.revision !== entry.revision)
        fail('source-approval-changed');
      return true;
    },
  });
}
