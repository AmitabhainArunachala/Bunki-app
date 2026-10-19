/** Device-local installation identity, not authentication or backup authority.
 * The caller continuously holds the cooperative origin-wide record Web Lock.
 * Exact rereads detect observed changes; localStorage has no compare-and-swap,
 * and an uncooperative writer can still change bytes after a successful check.
 * The adoption helpers below are the explicit empty-browser import exception:
 * they stage a validated restore before moving the local installation pointer. */
export const LOCAL_RECORD_BINDING_KEY = 'kairo-local-record-binding-v1';
const FORMAT = 'kairo-local-record-binding';
const MAX_TEXT = 2048;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const labels = Object.freeze({
  accountId: 'local-account:',
  learnerId: 'local-learner:',
  sessionId: 'local-session:',
  deviceId: 'local-device:',
  incarnationId: 'local-installation:',
  databaseName: 'kairo-local-record:',
});

export class LocalRecordBindingError extends Error {
  constructor(code) {
    super(`Local record binding: ${code}`);
    this.name = 'LocalRecordBindingError';
    this.code = code;
  }
}
function insist(condition, code) {
  if (!condition) throw new LocalRecordBindingError(code);
}
function keys(raw, expected) {
  insist(
    raw !== null &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      Object.keys(raw).sort().join('\0') === [...expected].sort().join('\0'),
    'invalid-binding',
  );
}
function freeze(value) {
  for (const child of Object.values(value))
    if (child !== null && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

/** Provisioning data only. A native enrollment may supply the two existing
 * logical scope IDs before first boot; it supplies no writer or sync grant. */
function initialScopeOf(value) {
  insist(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'invalid-initial-scope');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  insist(Reflect.ownKeys(descriptors).length === 2, 'invalid-initial-scope');
  const scope = {};
  for (const key of ['accountId', 'learnerId']) {
    const descriptor = descriptors[key];
    insist(descriptor && 'value' in descriptor && descriptor.enumerable && typeof descriptor.value === 'string' &&
      new RegExp(`^${labels[key]}${UUID}$`, 'u').test(descriptor.value), 'invalid-initial-scope');
    scope[key] = descriptor.value;
  }
  insist(scope.accountId.slice(labels.accountId.length) !== scope.learnerId.slice(labels.learnerId.length), 'invalid-initial-scope');
  return Object.freeze(scope);
}

/** Structural parsing only: a well-formed UUID or copied binding does not grant
 * identity authority. Only the confirmed empty-browser adoption protocol below
 * may replace this key; ordinary restore cannot change installation identity. */
export function parseLocalRecordBindingText(text) {
  insist(typeof text === 'string' && text.length > 0 && text.length <= MAX_TEXT, 'invalid-binding');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new LocalRecordBindingError('invalid-binding');
  }
  keys(raw, ['format', 'v', 'binding', 'actor', 'databaseName']);
  insist(raw.format === FORMAT && raw.v === 1, 'unsupported-binding');
  keys(raw.binding, ['accountId', 'learnerId', 'sessionId']);
  keys(raw.actor, ['deviceId', 'incarnationId']);
  const values = { ...raw.binding, ...raw.actor, databaseName: raw.databaseName };
  for (const [field, prefix] of Object.entries(labels))
    insist(
      typeof values[field] === 'string' &&
        new RegExp(`^${prefix}${UUID}$`, 'u').test(values[field]),
      'invalid-binding',
    );
  insist(
    new Set(Object.entries(labels).map(([field, prefix]) => values[field].slice(prefix.length)))
      .size === 6,
    'invalid-binding',
  );
  return freeze(raw);
}

/** Synchronous boot seam; assertOwner must synchronously return true only while
 * the host's existing Web Lock remains held. The host decides allowCreate from
 * its own legacy/null inspection and must refuse creation for a v2/future fence.
 * Call the returned assertCurrent() after async work and immediately before
 * publishing. Throws never authorize rollback, overwrite, or false success. */
export function openLocalRecordBinding(options) {
  insist(
    options !== null &&
      typeof options === 'object' &&
      !Array.isArray(options) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(options)),
    'invalid-options',
  );
  const descriptors = Object.getOwnPropertyDescriptors(options);
  insist(
    Object.getOwnPropertySymbols(options).length === 0 &&
      ['storage', 'assertOwner'].every((name) => Object.hasOwn(descriptors, name)) &&
      Object.keys(descriptors).every(
        (name) =>
          ['storage', 'crypto', 'assertOwner', 'allowCreate', 'initialScope'].includes(name) &&
          'value' in descriptors[name] &&
          descriptors[name].enumerable,
      ),
    'invalid-options',
  );
  const { storage, crypto: random, assertOwner, allowCreate = false } = options;
  const initialScope = options.initialScope === undefined ? null : initialScopeOf(options.initialScope);
  insist(
    storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof assertOwner === 'function' &&
      typeof allowCreate === 'boolean',
    'invalid-options',
  );
  const owner = () => {
    let held;
    try {
      held = assertOwner();
    } catch {
      throw new LocalRecordBindingError('owner-required');
    }
    insist(held === true, 'owner-required');
  };
  const read = () => {
    owner();
    let text;
    try {
      text = storage.getItem(LOCAL_RECORD_BINDING_KEY);
    } catch {
      throw new LocalRecordBindingError('binding-storage-unavailable');
    }
    owner();
    insist(text === null || typeof text === 'string', 'invalid-binding');
    return text;
  };
  let text = read();
  const created = text === null;
  if (created) {
    insist(allowCreate === true, 'binding-missing');
    owner();
    insist(random && typeof random.randomUUID === 'function', 'secure-random-unavailable');
    const values = {};
    for (const [field, prefix] of Object.entries(labels)) {
      if (initialScope && Object.hasOwn(initialScope, field)) { values[field] = initialScope[field]; continue; }
      let uuid;
      try {
        uuid = random.randomUUID();
      } catch {
        throw new LocalRecordBindingError('secure-random-unavailable');
      }
      insist(
        typeof uuid === 'string' && new RegExp(`^${UUID}$`, 'u').test(uuid),
        'secure-random-unavailable',
      );
      values[field] = `${prefix}${uuid}`;
    }
    text = JSON.stringify({
      format: FORMAT,
      v: 1,
      binding: {
        accountId: values.accountId,
        learnerId: values.learnerId,
        sessionId: values.sessionId,
      },
      actor: { deviceId: values.deviceId, incarnationId: values.incarnationId },
      databaseName: values.databaseName,
    });
    parseLocalRecordBindingText(text);
    insist(read() === null, 'binding-changed');
    owner();
    try {
      storage.setItem(LOCAL_RECORD_BINDING_KEY, text);
    } catch {
      throw new LocalRecordBindingError('binding-write-failed');
    }
  }
  const installation = parseLocalRecordBindingText(text);
  if (initialScope) insist(installation.binding.accountId === initialScope.accountId &&
    installation.binding.learnerId === initialScope.learnerId, 'binding-scope-mismatch');
  const assertCurrent = () => {
    insist(read() === text, 'binding-changed');
    owner();
    return true;
  };
  const result = Object.freeze({
    created,
    text,
    installation,
    policy: freeze({
      binding: installation.binding,
      schemaEpoch: 1,
      deletionEpoch: 0,
      mergePolicy: 'kairo-conservative-merge/1',
    }),
    actor: installation.actor,
    databaseName: installation.databaseName,
    assertCurrent,
  });
  assertCurrent();
  return result;
}

const ADOPTION_KEY = 'kairo-local-record-adoption-v1';
const ADOPTION_KEYS = ['kairo-corridor-v1', 'bunki-drift-v1', LOCAL_RECORD_BINDING_KEY];
export function localBackupAdoptionPolicy(policy, scope) {
  const checked = initialScopeOf(scope);
  return { ...policy, binding: { ...policy.binding, ...checked } };
}
function memoryStorage(entries = []) {
  const values = new Map(entries);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function adoptionWriter(installation, assertOwner) {
  const ownerId = `adoption:${installation.databaseName}`;
  const sessionId = installation.policy.binding.sessionId;
  return { capture: () => ({ ownerId, epoch: 0, sessionId }),
    assert: (value) => assertOwner() === true && installation.assertCurrent() === true &&
      value.ownerId === ownerId && value.epoch === 0 && value.sessionId === sessionId };
}
function activeSnapshot(outcome) {
  insist(outcome.status === 'active' && outcome.snapshot, 'adoption-unconfirmed');
  return outcome.snapshot;
}
function adoptionPrefix(storage, intent) {
  // Binding moves last. Only a prefix of these three exact writes is legal.
  for (let prefix = 0; prefix <= ADOPTION_KEYS.length; prefix += 1) {
    if (ADOPTION_KEYS.every((key, i) => storage.getItem(key) === (i < prefix ? intent.after[i] : intent.before[i]))) return prefix;
  }
  throw new LocalRecordBindingError('adoption-storage-diverged');
}
function parseAdoption(text) {
  insist(typeof text === 'string' && text.length <= 16384, 'invalid-adoption');
  const intent = JSON.parse(text);
  keys(intent, ['format', 'version', 'before', 'after', 'oldSha256', 'newSha256']);
  insist(intent.format === 'kairo-local-record-adoption' && intent.version === 1 &&
    [intent.before, intent.after].every((values) => Array.isArray(values) && values.length === 3 &&
      values.every((value) => typeof value === 'string' && value.length <= 4096)) &&
    [intent.oldSha256, intent.newSha256].every((value) => /^[0-9a-f]{64}$/u.test(value)), 'invalid-adoption');
  const before = parseLocalRecordBindingText(intent.before[2]);
  const after = parseLocalRecordBindingText(intent.after[2]);
  insist(before.databaseName !== after.databaseName && before.binding.sessionId !== after.binding.sessionId &&
    before.actor.deviceId !== after.actor.deviceId && before.actor.incarnationId !== after.actor.incarnationId, 'invalid-adoption');
  for (const values of [intent.before, intent.after]) {
    const binding = parseLocalRecordBindingText(values[2]);
    const fences = values.slice(0, 2).map((text) => JSON.parse(text));
    for (const [i, text] of values.slice(0, 2).entries()) {
      const fence = JSON.parse(text);
      keys(fence, ['v', 'format', 'version', 'migrationId', 'databaseName', 'accountId', 'learnerId', 'sourceSha256', ...(i ? ['known'] : [])]);
      insist(fence.v === 2 && fence.databaseName === binding.databaseName &&
        fence.accountId === binding.binding.accountId && fence.learnerId === binding.binding.learnerId &&
        fence.format === (i ? 'kairo-transactional-drift' : 'kairo-transactional-record') && fence.version === (i ? 1 : 2) &&
        (!i || fence.known === false) && typeof fence.migrationId === 'string' && fence.migrationId.length > 0 &&
        /^[0-9a-f]{64}$/u.test(fence.sourceSha256), 'invalid-adoption');
    }
    insist(fences[0].migrationId === fences[1].migrationId && fences[0].sourceSha256 === fences[1].sourceSha256, 'invalid-adoption');
  }
  return intent;
}

/** Resume only a previously durable, byte-exact handoff, under RECORD_LOCK and
 * before normal boot. Both databases remain intact. Unexpected storage bytes
 * or changed durable data block recovery; nothing is rolled back over them. */
export async function recoverLocalRecordAdoption({ storage, assertOwner, initialScope }) {
  insist(assertOwner() === true, 'owner-required');
  const text = storage.getItem(ADOPTION_KEY);
  if (text === null) return false;
  const intent = parseAdoption(text);
  const target = parseLocalRecordBindingText(intent.after[2]);
  if (initialScope !== undefined) {
    const scope = initialScopeOf(initialScope);
    insist(scope.accountId === target.binding.accountId && scope.learnerId === target.binding.learnerId, 'binding-scope-mismatch');
  }
  const guard = () => assertOwner() === true && storage.getItem(ADOPTION_KEY) === text;
  insist(guard(), 'owner-required');
  adoptionPrefix(storage, intent);
  const [{ createRecordController }, { encodeLocalJson }] = await Promise.all([
    import('./record-controller.mjs'), import('./modules/record-core.mjs'),
  ]);
  // Verify the unchanged admitted old generation and the confirmed restored
  // generation using their own fences, even midway through pointer promotion.
  for (const [values, sha256] of [[intent.before, intent.oldSha256], [intent.after, intent.newSha256]]) {
    const staged = memoryStorage(ADOPTION_KEYS.map((key, i) => [key, values[i]]));
    const installation = openLocalRecordBinding({ storage: staged, assertOwner: guard });
    const controller = await createRecordController({ ...installation, writer: adoptionWriter(installation, guard),
      requireDrift: true, legacyStorage: staged });
    try {
      // Do not let untrusted intent bytes provoke the controller's divergence
      // quarantine in a sound database: compare its custody before #status.
      const custody = await controller.localCustody();
      const fence = JSON.parse(values[0]);
      insist(custody.source?.version === 2 && custody.migrationId === fence.migrationId &&
        custody.source.sha256.source === fence.sourceSha256, 'adoption-custody-diverged');
      const snapshot = activeSnapshot(await controller.snapshot());
      insist(encodeLocalJson(snapshot).sha256 === sha256, 'adoption-record-diverged');
    } finally { await controller.close(); }
  }
  for (let i = adoptionPrefix(storage, intent); i < ADOPTION_KEYS.length; i += 1) {
    insist(guard() && adoptionPrefix(storage, intent) === i, 'adoption-storage-diverged');
    storage.setItem(ADOPTION_KEYS[i], intent.after[i]);
    insist(guard() && adoptionPrefix(storage, intent) === i + 1, 'adoption-write-unconfirmed');
  }
  insist(guard() && adoptionPrefix(storage, intent) === 3, 'adoption-write-unconfirmed');
  storage.removeItem(ADOPTION_KEY);
  insist(assertOwner() === true && storage.getItem(ADOPTION_KEY) === null && adoptionPrefix(storage, intent) === 3, 'adoption-write-unconfirmed');
  return true;
}

/** Caller has confirmed the restore, sealed UI and drained old producers.
 * isEmpty inspects the entire durable snapshot and local recovery drafts.
 * The new scope comes only from a validated backup; all device/session/database
 * identities are freshly generated. No old learner roots are merged into it. */
export async function adoptLocalRecord({ storage, crypto: random, assertOwner, installation, oldController,
  expectedRevision, backup, isEmpty, validateRecord, validateArchive, appOptions = {}, retire }) {
  insist(assertOwner() === true && installation.assertCurrent() === true && storage.getItem(ADOPTION_KEY) === null, 'owner-required');
  const [{ createRecordController, captureLegacySource }, { createRecordApp }, { encodeLocalJson, exportOperationJournal }] = await Promise.all([
    import('./record-controller.mjs'), import('./record-app.mjs'), import('./modules/record-core.mjs'),
  ]);
  const before = ADOPTION_KEYS.map((key) => storage.getItem(key));
  const oldSnapshot = activeSnapshot(await oldController.snapshot());
  insist(oldSnapshot.revision === expectedRevision && isEmpty(oldSnapshot), 'ownership-mismatch');
  const oldSha256 = encodeLocalJson(oldSnapshot).sha256;
  const staged = memoryStorage([['kairo-corridor-v1', JSON.stringify({ v: 1, taken: [] })]]);
  const guard = () => assertOwner() === true;
  const candidate = openLocalRecordBinding({ storage: staged, crypto: random, assertOwner: guard,
    allowCreate: true, initialScope: backup.journal.scope });
  const writer = adoptionWriter(candidate, guard);
  let controller; let app; let intentDurable = false;
  try {
    controller = await createRecordController({ ...candidate, writer, requireDrift: true, legacyStorage: staged });
    const source = await captureLegacySource(writer, { includeDrift: true, legacyStorage: staged });
    insist(source.archive.rows.length === 0 && source.archive.imports.length === 0, 'ownership-mismatch');
    const prepared = await controller.prepare(source, { migrationId: random.randomUUID() });
    insist(prepared.status === 'prepared', 'adoption-unconfirmed');
    insist((await controller.activate(prepared.migrationId)).status === 'active', 'adoption-unconfirmed');
    app = await createRecordApp({ ...appOptions, controller, binding: candidate.policy.binding, writer, validateRecord, validateArchive });
    const preview = await app.snapshot();
    insist(preview.status === 'active', 'adoption-unconfirmed');
    const restored = await app.restore(backup, { expectedRevision: preview.snapshot.revision });
    insist(restored.status === 'active', 'adoption-unconfirmed');
    await app.close(); app = null;
    const restoredSnapshot = activeSnapshot(await controller.snapshot());
    const document = (collection, id = 'current') => restoredSnapshot.documents.find((row) => row.collection === collection && row.id === id)?.value;
    insist(restored.receipt?.type === 'host.restore/2' && restored.receipt.committedRevision === restoredSnapshot.revision &&
      encodeLocalJson(document('learner-record')).sha256 === backup.sha256.record &&
      encodeLocalJson(document('learner-archive')).sha256 === backup.sha256.archive &&
      encodeLocalJson(exportOperationJournal(restoredSnapshot.replica)).sha256 === backup.sha256.journal &&
      document('kairo:record-host-commands', restored.receipt.changeId), 'adoption-restore-diverged');
    await controller.close(); controller = null;
    const latest = activeSnapshot(await oldController.snapshot());
    insist(encodeLocalJson(latest).sha256 === oldSha256 && isEmpty(latest), 'ownership-mismatch');
    insist(guard() && ADOPTION_KEYS.every((key, i) => storage.getItem(key) === before[i]), 'adoption-storage-diverged');
    const intent = { format: 'kairo-local-record-adoption', version: 1, before,
      after: ADOPTION_KEYS.map((key) => staged.getItem(key)), oldSha256,
      newSha256: encodeLocalJson(restoredSnapshot).sha256 };
    const text = JSON.stringify(intent);
    parseAdoption(text);
    // Revoke old writers before recording the irrevocable handoff intent.
    await retire();
    const retiredStorage = memoryStorage(ADOPTION_KEYS.map((key, i) => [key, before[i]]));
    const retired = openLocalRecordBinding({ storage: retiredStorage, assertOwner: guard });
    const retiredController = await createRecordController({ ...retired, writer: adoptionWriter(retired, guard),
      requireDrift: true, legacyStorage: retiredStorage });
    try {
      insist(encodeLocalJson(activeSnapshot(await retiredController.snapshot())).sha256 === oldSha256, 'adoption-record-diverged');
    } finally { await retiredController.close(); }
    insist(guard() && storage.getItem(ADOPTION_KEY) === null &&
      ADOPTION_KEYS.every((key, i) => storage.getItem(key) === before[i]), 'adoption-storage-diverged');
    storage.setItem(ADOPTION_KEY, text);
    intentDurable = true;
    insist(storage.getItem(ADOPTION_KEY) === text, 'adoption-write-unconfirmed');
    await recoverLocalRecordAdoption({ storage, assertOwner: guard });
  } finally {
    await app?.close(); await controller?.close();
    // An unpromoted staging database is ours alone. Never delete either side
    // after an intent might have become durable, including uncertain writes.
    if (!intentDurable && storage.getItem(ADOPTION_KEY) === null) {
      try { indexedDB.deleteDatabase(candidate.databaseName); } catch { /* harmless abandoned staging database */ }
    }
  }
}
