/** Pure unfinished sentence text and restart reconciliation. UUIDs identify
 * edits; neither a draft nor its revision grants source or writer authority.
 * Saved plans and explicit responses remain the sentence-practice owner's work.
 *
 * @typedef {{entryId:string, mode:'production'|'listening'}} SentenceDraftKey
 * @typedef {{entryId:string, mode:'production', revision:string, text:string} |
 * {entryId:string, mode:'listening', revision:string, text:string,
 * transcriptOpened:boolean}} SentenceDraftIdentity
 * @typedef {SentenceDraftIdentity & {consumed:boolean}} SentenceDraft
 * @typedef {{version:1, entries:readonly SentenceDraft[]}} SentenceDrafts
 * @typedef {{key:SentenceDraftKey, base:SentenceDraft|null,
 * committing:SentenceDraft|null, latest:SentenceDraft}} SentenceDraftRecoveryEntry
 * @typedef {{version:1, installation:string,
 * entries:readonly SentenceDraftRecoveryEntry[]}} SentenceDraftRecovery
 */

export const SENTENCE_DRAFT_TEXT_LIMIT = 4_000;
export const SENTENCE_DRAFT_ENTRY_ID_LIMIT = 500;
export const SENTENCE_DRAFT_ENTRY_LIMIT = 4_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class SentenceDraftError extends TypeError {
  constructor(code, path = '') {
    super(`Sentence draft ${code}${path ? ` at ${path}` : ''}`);
    this.name = 'SentenceDraftError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) {
  throw new SentenceDraftError(code, path);
}

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child);
  }
  return Object.freeze(value);
}

function fields(raw, names, path, exposure = false) {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  ) {
    fail('invalid-object', path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const expected =
    exposure && descriptors.mode?.value === 'listening' ? [...names, 'transcriptOpened'] : names;
  if (
    Reflect.ownKeys(descriptors).length !== expected.length ||
    expected.some((name) => !Object.hasOwn(descriptors, name))
  ) {
    fail('invalid-fields', path);
  }
  if (expected.some((name) => !descriptors[name].enumerable || !('value' in descriptors[name]))) {
    fail('invalid-property', path);
  }
  return Object.fromEntries(expected.map((name) => [name, descriptors[name].value]));
}

function array(raw, path) {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) {
    fail('invalid-array', path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const length = descriptors.length.value;
  if (Reflect.ownKeys(descriptors).length !== length + 1) fail('invalid-array', path);
  if (length > SENTENCE_DRAFT_ENTRY_LIMIT) fail('draft-capacity', path);
  const items = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[index];
    if (!Object.hasOwn(descriptors, index) || !descriptor.enumerable || !('value' in descriptor)) {
      fail('invalid-array', path);
    }
    items.push(descriptor.value);
  }
  return items;
}

function rawText(value, maximum, path, nonblank = false) {
  if (typeof value !== 'string' || value.length > maximum || (nonblank && !value.trim())) {
    fail('invalid-text', path);
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if ((unit < 32 && ![9, 10, 13].includes(unit)) || (unit >= 127 && unit <= 159)) {
      fail('invalid-text', path);
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('invalid-text', path);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail('invalid-text', path);
  }
  return value;
}

function key(raw, path) {
  const value = fields(raw, ['entryId', 'mode'], path);
  if (value.mode !== 'production' && value.mode !== 'listening')
    fail('invalid-mode', `${path}.mode`);
  return {
    entryId: rawText(value.entryId, SENTENCE_DRAFT_ENTRY_ID_LIMIT, `${path}.entryId`, true),
    mode: value.mode,
  };
}

const keyOf = (value) => JSON.stringify([value.entryId, value.mode]);

/** Exact opaque saved-plan key. No article, plan or source lookup is performed. */
export function parseSentenceDraftKey(raw) {
  return freeze(key(raw, 'key'));
}

/** Canonical map/storage key; delimiters inside an opaque entryId cannot alias. */
export function sentenceDraftKey(raw) {
  return keyOf(parseSentenceDraftKey(raw));
}

function identity(raw, path) {
  const value = fields(raw, ['entryId', 'mode', 'revision', 'text'], path, true);
  const parsedKey = key({ entryId: value.entryId, mode: value.mode }, path);
  if (typeof value.revision !== 'string' || !UUID.test(value.revision)) {
    fail('invalid-revision', `${path}.revision`);
  }
  if (value.mode === 'listening' && typeof value.transcriptOpened !== 'boolean') {
    fail('invalid-transcript-opened', `${path}.transcriptOpened`);
  }
  return {
    ...parsedKey,
    revision: value.revision,
    text: rawText(value.text, SENTENCE_DRAFT_TEXT_LIMIT, `${path}.text`),
    ...(value.mode === 'listening' ? { transcriptOpened: value.transcriptOpened } : {}),
  };
}

/** A submitted identity excludes the draft's consumed marker. */
export function parseSentenceDraftIdentity(raw) {
  return freeze(identity(raw, 'identity'));
}

function draft(raw, path) {
  const value = fields(raw, ['entryId', 'mode', 'revision', 'text', 'consumed'], path, true);
  if (typeof value.consumed !== 'boolean') fail('invalid-consumed', `${path}.consumed`);
  const { consumed, ...edit } = value;
  return { ...identity(edit, path), consumed };
}

/** Compare parsed identities; consumed is ignored only after every identity
 * field, including listening exposure and exact raw text, matches. */
export function sameSentenceDraftIdentity(left, right) {
  return Boolean(
    left &&
    right &&
    left.entryId === right.entryId &&
    left.mode === right.mode &&
    left.revision === right.revision &&
    left.text === right.text &&
    (left.mode !== 'listening' || left.transcriptOpened === right.transcriptOpened),
  );
}

function registerIdentity(revisions, value, path) {
  const prior = revisions.get(value.revision);
  if (prior && !sameSentenceDraftIdentity(prior, value)) fail('revision-collision', path);
  revisions.set(value.revision, value);
}

/** Missing legacy roots default empty. Exact text, explicit empty edits and
 * historical/unavailable plan keys are retained without creating any evidence. */
export function parseSentenceDrafts(raw) {
  if (raw === undefined || raw === null) return freeze({ version: 1, entries: [] });
  const root = fields(raw, ['version', 'entries'], 'drafts');
  if (root.version !== 1) fail('invalid-version', 'drafts.version');
  const keys = new Set();
  const revisions = new Map();
  const entries = array(root.entries, 'drafts.entries').map((entry, index) => {
    const path = `drafts.entries[${index}]`;
    const value = draft(entry, path);
    const encodedKey = keyOf(value);
    if (keys.has(encodedKey)) fail('duplicate-key', path);
    keys.add(encodedKey);
    registerIdentity(revisions, value, path);
    return value;
  });
  return freeze({ version: 1, entries });
}

/** Store a caller-minted edit. An exact repeat keeps its consumed marker;
 * a new same-text revision is a new edit. Capacity never evicts another key. */
export function editSentenceDraft(rawRoot, rawEdit) {
  const root = parseSentenceDrafts(rawRoot);
  const edit = identity(rawEdit, 'edit');
  const existingRevision = root.entries.find((entry) => entry.revision === edit.revision);
  if (existingRevision) {
    if (!sameSentenceDraftIdentity(existingRevision, edit))
      fail('revision-collision', 'edit.revision');
    return root;
  }
  const value = { ...edit, consumed: false };
  const index = root.entries.findIndex((entry) => keyOf(entry) === keyOf(edit));
  const entries = [...root.entries];
  if (index < 0) {
    if (entries.length >= SENTENCE_DRAFT_ENTRY_LIMIT) fail('draft-capacity', 'drafts.entries');
    entries.push(value);
  } else entries[index] = value;
  return freeze({ version: 1, entries });
}

/** Consume only the submitted current revision; retain its raw text as a
 * tombstone. A delayed submission cannot clear another key or a newer edit. */
export function consumeSentenceDraft(rawRoot, rawSubmitted) {
  const root = parseSentenceDrafts(rawRoot);
  const submitted = identity(rawSubmitted, 'submitted');
  return freeze({
    version: 1,
    entries: root.entries.map((entry) =>
      sameSentenceDraftIdentity(entry, submitted) ? { ...entry, consumed: true } : entry,
    ),
  });
}

/** Base can be consumed; committing/latest must be editing. Installation is
 * bounded opaque binding text whose exact live match belongs to the controller. */
export function parseSentenceDraftRecovery(raw) {
  const root = fields(raw, ['version', 'installation', 'entries'], 'recovery');
  if (root.version !== 1) fail('invalid-version', 'recovery.version');
  const installation = rawText(root.installation, 2048, 'recovery.installation', true);
  const keys = new Set();
  const revisions = new Map();
  const entries = array(root.entries, 'recovery.entries').map((rawEntry, index) => {
    const path = `recovery.entries[${index}]`;
    const entry = fields(rawEntry, ['key', 'base', 'committing', 'latest'], path);
    const parsedKey = key(entry.key, `${path}.key`);
    const encodedKey = keyOf(parsedKey);
    if (keys.has(encodedKey)) fail('duplicate-key', path);
    keys.add(encodedKey);
    const parsed = { key: parsedKey };
    for (const name of ['base', 'committing', 'latest']) {
      const value =
        name !== 'latest' && entry[name] === null ? null : draft(entry[name], `${path}.${name}`);
      if (value) {
        if (keyOf(value) !== encodedKey) fail('key-mismatch', `${path}.${name}`);
        if (name !== 'base' && value.consumed)
          fail('invalid-recovery-state', `${path}.${name}.consumed`);
        registerIdentity(revisions, value, `${path}.${name}`);
      }
      parsed[name] = value;
    }
    return parsed;
  });
  return freeze({ version: 1, installation, entries });
}

/** Replay only when current follows the exact base or committing identity.
 * Durable latest, including consumed latest, never replays. Divergence,
 * identity collisions and capacity retain the whole recovery entry; no clock
 * or source availability chooses a winner. Inputs are never mutated. */
export function reconcileSentenceDraftRecovery(rawRoot, rawRecovery) {
  const root = parseSentenceDrafts(rawRoot);
  const recovery = parseSentenceDraftRecovery(rawRecovery);
  const revisions = new Map(root.entries.map((entry) => [entry.revision, entry]));
  const indexes = new Map(root.entries.map((entry, index) => [keyOf(entry), index]));
  const entries = [...root.entries];
  const remaining = [];
  const applied = [];
  for (const entry of recovery.entries) {
    const encodedKey = keyOf(entry.key);
    const index = indexes.get(encodedKey);
    const current = index === undefined ? null : entries[index];
    if (sameSentenceDraftIdentity(current, entry.latest)) continue;
    const collision = [entry.base, entry.committing, entry.latest].some((candidate) => {
      if (!candidate) return false;
      const prior = revisions.get(candidate.revision);
      return prior && !sameSentenceDraftIdentity(prior, candidate);
    });
    const followsCurrent =
      (!current && entry.base === null) ||
      sameSentenceDraftIdentity(current, entry.base) ||
      sameSentenceDraftIdentity(current, entry.committing);
    if (
      collision ||
      !followsCurrent ||
      (index === undefined && entries.length >= SENTENCE_DRAFT_ENTRY_LIMIT)
    ) {
      remaining.push(entry);
      continue;
    }
    if (index === undefined) {
      indexes.set(encodedKey, entries.length);
      entries.push(entry.latest);
    } else entries[index] = entry.latest;
    revisions.set(entry.latest.revision, entry.latest);
    applied.push(entry.latest);
  }
  return freeze({
    drafts: { version: 1, entries },
    remaining: { version: 1, installation: recovery.installation, entries: remaining },
    applied,
  });
}
