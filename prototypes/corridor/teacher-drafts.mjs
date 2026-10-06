/** Pure teacher-draft data and restart reconciliation. Revisions identify edits;
 * they do not grant account, installation, writer, or source-processing authority.
 * The adapter supplies fresh revisions and validates the live installation. */

export const TEACHER_DRAFT_TEXT_LIMIT = 64_000;
const CONTEXT_REF = /^teacher-context:[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class TeacherDraftError extends TypeError {
  constructor(code, path = '') {
    super(`Teacher draft ${code}${path ? ` at ${path}` : ''}`);
    this.name = 'TeacherDraftError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) {
  throw new TeacherDraftError(code, path);
}

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child);
  }
  return Object.freeze(value);
}

function fields(raw, names, path) {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  ) {
    fail('invalid-object', path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  if (
    Reflect.ownKeys(descriptors).length !== names.length ||
    names.some((name) => !Object.hasOwn(descriptors, name))
  ) {
    fail('invalid-fields', path);
  }
  if (names.some((name) => !descriptors[name].enumerable || !('value' in descriptors[name]))) {
    fail('invalid-property', path);
  }
  return Object.fromEntries(names.map((name) => [name, descriptors[name].value]));
}

function array(raw, path) {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) {
    fail('invalid-array', path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const length = descriptors.length.value;
  if (Reflect.ownKeys(descriptors).length !== length + 1) fail('invalid-array', path);
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

function topic(value, path) {
  if (value !== null && (typeof value !== 'string' || !CONTEXT_REF.test(value))) {
    fail('invalid-context-ref', path);
  }
  return value;
}

function identity(raw, path) {
  const value = fields(raw, ['contextRef', 'revision', 'text'], path);
  if (typeof value.revision !== 'string' || !UUID.test(value.revision)) {
    fail('invalid-revision', `${path}.revision`);
  }
  return {
    contextRef: topic(value.contextRef, `${path}.contextRef`),
    revision: value.revision,
    text: rawText(value.text, TEACHER_DRAFT_TEXT_LIMIT, `${path}.text`),
  };
}

function draft(raw, path) {
  const value = fields(raw, ['contextRef', 'revision', 'text', 'consumed'], path);
  if (typeof value.consumed !== 'boolean') fail('invalid-consumed', `${path}.consumed`);
  return {
    ...identity({ contextRef: value.contextRef, revision: value.revision, text: value.text }, path),
    consumed: value.consumed,
  };
}

function sameIdentity(left, right) {
  return Boolean(
    left &&
    right &&
    left.contextRef === right.contextRef &&
    left.revision === right.revision &&
    left.text === right.text,
  );
}

function registerIdentity(revisions, value, path) {
  const prior = revisions.get(value.revision);
  if (prior && !sameIdentity(prior, value)) fail('revision-collision', path);
  revisions.set(value.revision, value);
}

/** Draft = {contextRef,revision,text,consumed}. Text is exact, including empty.
 * Missing legacy roots default empty. Encoded strings are not root objects.
 * Topics need not exist in the current context collection; no entry is pruned. */
export function parseTeacherDrafts(raw) {
  if (raw === undefined || raw === null) return freeze({ version: 1, entries: [] });
  const root = fields(raw, ['version', 'entries'], 'drafts');
  if (root.version !== 1) fail('invalid-version', 'drafts.version');
  const topics = new Set();
  const revisions = new Map();
  const entries = array(root.entries, 'drafts.entries').map((entry, index) => {
    const path = `drafts.entries[${index}]`;
    const value = draft(entry, path);
    if (topics.has(value.contextRef)) fail('duplicate-topic', path);
    topics.add(value.contextRef);
    registerIdentity(revisions, value, path);
    return value;
  });
  return freeze({ version: 1, entries });
}

/** Store a caller-minted editing identity. Explicit empty edits are retained.
 * Repeating an exact identity is idempotent, including its consumed marker;
 * reusing a UUID for different text or another topic is an error. */
export function editTeacherDraft(rawRoot, rawEdit) {
  const root = parseTeacherDrafts(rawRoot);
  const edit = identity(rawEdit, 'edit');
  const existingRevision = root.entries.find((entry) => entry.revision === edit.revision);
  if (existingRevision) {
    if (!sameIdentity(existingRevision, edit)) fail('revision-collision', 'edit.revision');
    return root;
  }
  const value = { ...edit, consumed: false };
  const index = root.entries.findIndex((entry) => entry.contextRef === edit.contextRef);
  const entries = [...root.entries];
  if (index < 0) entries.push(value);
  else entries[index] = value;
  return freeze({ version: 1, entries });
}

/** Mark only the exact submitted current identity consumed. Preserve its raw
 * text and all other/newer edits, so a late response cannot clear a new draft. */
export function consumeTeacherDraft(rawRoot, rawSubmitted) {
  const root = parseTeacherDrafts(rawRoot);
  const submitted = identity(rawSubmitted, 'submitted');
  return freeze({
    version: 1,
    entries: root.entries.map((entry) =>
      sameIdentity(entry, submitted) ? { ...entry, consumed: true } : entry,
    ),
  });
}

/** RecoveryEntry = {contextRef,base:Draft|null,committing:Draft|null,latest:Draft}.
 * Committing/latest must be editing; consumed bases retain their identity.
 * Installation is bounded opaque serialized binding text, not a writer grant.
 * Its exact match to the live installation belongs to the storage adapter. */
export function parseTeacherDraftRecovery(raw) {
  const root = fields(raw, ['version', 'installation', 'entries'], 'recovery');
  if (root.version !== 1) fail('invalid-version', 'recovery.version');
  const installation = rawText(root.installation, 2048, 'recovery.installation', true);
  const topics = new Set();
  const revisions = new Map();
  const entries = array(root.entries, 'recovery.entries').map((rawEntry, index) => {
    const path = `recovery.entries[${index}]`;
    const entry = fields(rawEntry, ['contextRef', 'base', 'committing', 'latest'], path);
    const contextRef = topic(entry.contextRef, `${path}.contextRef`);
    if (topics.has(contextRef)) fail('duplicate-topic', path);
    topics.add(contextRef);
    const parsed = { contextRef };
    for (const name of ['base', 'committing', 'latest']) {
      const value =
        name !== 'latest' && entry[name] === null ? null : draft(entry[name], `${path}.${name}`);
      if (value) {
        if (value.contextRef !== contextRef) fail('topic-mismatch', `${path}.${name}`);
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

/** Return {drafts:TeacherDrafts, remaining:TeacherDraftRecovery, applied:Draft[]}.
 * Remaining contains whole unresolved entries with the same installation.
 * Applied contains only latest drafts newly written, not identities already
 * durable. Matching ignores consumed only after context/revision/raw text match.
 * In particular, an already durable consumed latest can never be resurrected.
 * Conflicting identities across inputs remain recoverable; no clock picks one. */
export function reconcileTeacherDraftRecovery(rawRoot, rawRecovery) {
  const root = parseTeacherDrafts(rawRoot);
  const recovery = parseTeacherDraftRecovery(rawRecovery);
  const revisions = new Map(root.entries.map((entry) => [entry.revision, entry]));
  const topicIndexes = new Map(root.entries.map((entry, index) => [entry.contextRef, index]));
  const entries = [...root.entries];
  const remaining = [];
  const applied = [];
  for (const entry of recovery.entries) {
    const index = topicIndexes.get(entry.contextRef);
    const current = index === undefined ? null : entries[index];
    if (sameIdentity(current, entry.latest)) continue;
    const collision = [entry.base, entry.committing, entry.latest].some((candidate) => {
      if (!candidate) return false;
      const prior = revisions.get(candidate.revision);
      return prior && !sameIdentity(prior, candidate);
    });
    const followsCurrent =
      (!current && entry.base === null) ||
      sameIdentity(current, entry.base) ||
      sameIdentity(current, entry.committing);
    if (collision || !followsCurrent) {
      remaining.push(entry);
      continue;
    }
    if (index === undefined) {
      topicIndexes.set(entry.contextRef, entries.length);
      entries.push(entry.latest);
    } else entries[index] = entry.latest;
    applied.push(entry.latest);
  }
  return freeze({
    drafts: { version: 1, entries },
    remaining: { version: 1, installation: recovery.installation, entries: remaining },
    applied,
  });
}
