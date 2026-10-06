/** Device-local installation identity, not authentication or backup authority.
 * The caller continuously holds the cooperative origin-wide record Web Lock.
 * Exact rereads detect observed changes; localStorage has no compare-and-swap,
 * and an uncooperative writer can still change bytes after a successful check.
 * No record, fence, backup, provider key, or other storage entry is read here. */
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
 * identity authority. Backup import must never write this installation key. */
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
