import {
  SENTENCE_DRAFT_ENTRY_LIMIT,
  editSentenceDraft,
  parseSentenceDraftKey,
  sameSentenceDraftIdentity as same,
  parseSentenceDraftRecovery,
  parseSentenceDrafts,
  reconcileSentenceDraftRecovery,
} from './sentence-drafts.mjs';

const DELAY = 750;
const keyOf = (value) => JSON.stringify([value.entryId, value.mode]);

/** Parse the storage JSON without allowing duplicate object members to hide
 * malformed data behind JSON.parse's last-member-wins behavior. */
function decode(text) {
  if (typeof text !== 'string') throw new Error('recovery-malformed');
  const value = JSON.parse(text);
  const frames = [];
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}[\],:]|[^\s{}[\],:]+/gu)) {
    const frame = frames.at(-1);
    if (token === '{' || token === '[')
      frames.push({ object: token === '{', key: token === '{', keys: new Set() });
    else if (token === '}' || token === ']') frames.pop();
    else if (token === ':' && frame?.object) frame.key = false;
    else if (token === ',' && frame?.object) frame.key = true;
    else if (token.startsWith('"') && frame?.object && frame.key) {
      const key = JSON.parse(token);
      if (frame.keys.has(key)) throw new Error('recovery-malformed');
      frame.keys.add(key);
      frame.key = false;
    }
  }
  return value;
}

/** The adapter owns the live writer and installation check, latest durable
 * draft root, and queued record transaction. Recovery storage is a cooperative
 * local fallback, not account or source authority and not compare-and-swap.
 * Construction reads but never writes or calls onChange. */
export function createSentenceDraftController(options) {
  if (
    !options ||
    typeof options !== 'object' ||
    !['assertCurrent', 'getDrafts', 'commit', 'onChange'].every(
      (key) => typeof options[key] === 'function',
    ) ||
    typeof options.storage?.getItem !== 'function' ||
    typeof options.storage?.setItem !== 'function' ||
    typeof options.databaseName !== 'string' ||
    !options.databaseName ||
    options.databaseName.length > 2048 ||
    /\s/u.test(options.databaseName) ||
    (options.revision !== undefined && typeof options.revision !== 'function')
  ) {
    throw new TypeError('Invalid sentence draft controller ports');
  }
  const { installationText, databaseName, storage, assertCurrent, getDrafts, commit, onChange } =
    options;
  const makeRevision = options.revision ?? (() => globalThis.crypto.randomUUID());
  const emptyRecovery = parseSentenceDraftRecovery({
    version: 1,
    installation: installationText,
    entries: [],
  });
  const recoveryKey = `kairo-sentence-draft-recovery-v1:${databaseName}`;
  let durable = parseSentenceDrafts(null);
  let records = new Map();
  const origins = new Map();
  const usedRevisions = new Set();
  let expectedSlot = null;
  let slotMode = 'blocked';
  let ownerIssue = null;
  let durableIssue = null;
  let recoveryIssue = null;
  let commitIssue = null;
  let editIssue = null;
  let editIssueKey = null;
  let closed = false;
  let revoked = false;
  let timer = null;
  let flight = null;
  let activeBatch = [];

  const currentIssue = () =>
    ownerIssue || durableIssue || recoveryIssue || commitIssue || editIssue;
  const recoveryOf = (entries = [...records.values()]) =>
    parseSentenceDraftRecovery({
      version: 1,
      installation: installationText,
      entries,
    });
  const currentFor = (key) => durable.entries.find((value) => keyOf(value) === keyOf(key)) ?? null;
  const analyze = () => reconcileSentenceDraftRecovery(durable, recoveryOf());
  const rememberRevisions = (entry) => {
    for (const value of [entry.base, entry.committing, entry.latest])
      if (value) usedRevisions.add(value.revision);
  };

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function notify() {
    if (closed) return;
    try {
      onChange();
    } catch {
      /* Notification cannot authorize or undo a write. */
    }
  }

  function guard() {
    if (closed || revoked) return false;
    try {
      if (assertCurrent() === false) throw new Error('writer-unavailable');
      return true;
    } catch {
      revoked = true;
      ownerIssue = 'draft-owner-unavailable';
      cancelTimer();
      return false;
    }
  }

  function readDurable() {
    if (!guard()) return false;
    try {
      const next = parseSentenceDrafts(getDrafts());
      if (!guard()) return false;
      durable = next;
      for (const value of durable.entries) usedRevisions.add(value.revision);
      durableIssue = null;
      return true;
    } catch {
      durableIssue = 'durable-drafts-unavailable';
      return false;
    }
  }

  function blockSlot(issue) {
    slotMode = 'blocked';
    recoveryIssue = issue;
    return false;
  }

  function checkSlot() {
    if (!guard() || slotMode !== 'owned') return false;
    try {
      if (storage.getItem(recoveryKey) !== expectedSlot) return blockSlot('recovery-changed');
      if (!guard()) return false;
      return true;
    } catch {
      return blockSlot('recovery-read-failed');
    }
  }

  /** Write only against the exact previously observed slot. Foreign/malformed
   * bytes remain untouched; local edits can still use the record transaction. */
  function writeSlot(entries = [...records.values()]) {
    if (!checkSlot()) return false;
    const text = JSON.stringify(recoveryOf(entries));
    try {
      if (!guard()) return false;
      storage.setItem(recoveryKey, text);
      if (!guard()) return false;
      if (storage.getItem(recoveryKey) !== text) return blockSlot('recovery-changed');
      if (!guard()) return false;
      expectedSlot = text;
      recoveryIssue = null;
      return true;
    } catch {
      recoveryIssue = 'recovery-write-failed';
      return false;
    }
  }

  function settlePublished() {
    let changed = false;
    for (const [token, entry] of records) {
      const current = currentFor(entry.key);
      if (same(current, entry.latest)) {
        records.delete(token);
        origins.delete(token);
        changed = true;
      } else if (same(current, entry.committing)) {
        const stillInFlight = activeBatch.some((batch) => same(batch.latest, entry.committing));
        const next = {
          ...entry,
          base: current,
          committing: stillInFlight ? entry.committing : null,
        };
        if (JSON.stringify(next) !== JSON.stringify(entry)) {
          records.set(token, recoveryOf([next]).entries[0]);
          changed = true;
        }
      } else if (same(current, entry.base) && current.consumed !== entry.base.consumed) {
        records.set(token, recoveryOf([{ ...entry, base: current }]).entries[0]);
        changed = true;
      }
    }
    return changed;
  }

  function refreshInternal() {
    if (!readDurable()) return false;
    checkSlot();
    if (settlePublished() || recoveryIssue === 'recovery-write-failed') writeSlot();
    return true;
  }

  function newDraft(key, text, transcriptOpened = false) {
    const token = keyOf(key);
    const occupied = new Set([...durable.entries.map(keyOf), ...records.keys()]);
    if (!occupied.has(token) && occupied.size >= SENTENCE_DRAFT_ENTRY_LIMIT) {
      throw Object.assign(new Error('draft-capacity'), { code: 'draft-capacity' });
    }
    const revision = makeRevision();
    if (usedRevisions.has(revision)) throw new Error('reused-draft-revision');
    const value = editSentenceDraft(durable, {
      ...key,
      revision,
      text,
      ...(key.mode === 'listening' ? { transcriptOpened } : {}),
    }).entries.find((item) => keyOf(item) === token);
    usedRevisions.add(revision);
    return value;
  }

  function view(rawKey) {
    let key;
    try {
      key = parseSentenceDraftKey(rawKey);
    } catch {
      return Object.freeze({
        draft: null,
        text: '',
        state: 'unavailable',
        error: 'invalid-draft-key',
        recoveryDraft: null,
      });
    }
    // The port must return the live acknowledged/published root. Reading it
    // here prevents a stale cached revision from becoming a saved UI claim.
    readDurable();
    const token = keyOf(key);
    const conflict = analyze().remaining.entries.find((entry) => keyOf(entry.key) === token);
    const current = currentFor(key);
    const entry = records.get(token);
    const pending = entry && !same(current, entry.latest);
    const draft = !conflict && pending ? entry.latest : current;
    const saving = pending && activeBatch.some((batch) => same(batch.latest, entry.latest));
    const state =
      closed || revoked || durableIssue || (editIssue && editIssueKey === token)
        ? 'unavailable'
        : conflict
          ? 'conflict'
          : recoveryIssue || (pending && commitIssue)
            ? 'unavailable'
            : saving
              ? 'saving'
              : pending
                ? 'pending'
                : draft
                  ? 'saved'
                  : 'empty';
    return Object.freeze({
      draft,
      text: draft && !draft.consumed ? draft.text : '',
      state,
      error: closed ? 'draft-controller-closed' : currentIssue(),
      recoveryDraft: conflict?.latest ?? null,
    });
  }

  function state() {
    readDurable();
    return Object.freeze({
      issue: closed ? 'draft-controller-closed' : currentIssue(),
      pending: records.size > 0 || activeBatch.length > 0,
      conflicts: analyze().remaining.entries,
    });
  }

  function schedule() {
    cancelTimer();
    if (closed || revoked || flight) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, DELAY);
  }

  function edit(rawKey, text, exposure = {}) {
    if (!refreshInternal()) {
      notify();
      return false;
    }
    let key;
    let token;
    try {
      key = parseSentenceDraftKey(rawKey);
      token = keyOf(key);
      if (analyze().remaining.entries.some((entry) => keyOf(entry.key) === token)) return false;
      if (
        exposure === null ||
        typeof exposure !== 'object' ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(exposure))
      )
        throw new Error('invalid-edit-options');
      const descriptors = Object.getOwnPropertyDescriptors(exposure);
      if (Reflect.ownKeys(descriptors).some((name) => name !== 'transcriptOpened')) {
        throw new Error('invalid-edit-options');
      }
      const requested = descriptors.transcriptOpened;
      if (
        requested &&
        (key.mode !== 'listening' ||
          !requested.enumerable ||
          !('value' in requested) ||
          typeof requested.value !== 'boolean')
      )
        throw new Error('invalid-edit-options');
      const current = view(key).draft;
      if (!guard()) return false;
      const transcriptOpened =
        key.mode === 'listening' &&
        Boolean((current && !current.consumed && current.transcriptOpened) || requested?.value);
      if (
        typeof text === 'string' &&
        current &&
        ((!current.consumed &&
          current.text === text &&
          (key.mode !== 'listening' || current.transcriptOpened === transcriptOpened)) ||
          (current.consumed && text === '' && !transcriptOpened))
      ) {
        editIssue = null;
        editIssueKey = null;
        return true;
      }
      const latest = newDraft(key, text, transcriptOpened);
      if (!guard()) return false;
      const previous = records.get(token);
      const value = previous
        ? { ...previous, latest }
        : { key, base: currentFor(key), committing: null, latest };
      const next = new Map(records);
      next.set(token, value);
      const parsed = recoveryOf([...next.values()]);
      records = new Map(parsed.entries.map((entry) => [keyOf(entry.key), entry]));
      origins.set(token, 'local');
      editIssue = null;
      editIssueKey = null;
      const kept = writeSlot();
      schedule();
      notify();
      return kept;
    } catch (error) {
      editIssue = error?.code === 'draft-capacity' ? 'draft-capacity' : 'draft-edit-invalid';
      editIssueKey = token ?? null;
      notify();
      return false;
    }
  }

  async function drain() {
    cancelTimer();
    while (!closed && !revoked) {
      if (!refreshInternal()) return false;
      const analysis = analyze();
      const eligible = analysis.applied.filter(
        (latest) => slotMode === 'owned' || origins.get(keyOf(latest)) === 'local',
      );
      if (!eligible.length) {
        if (!analysis.applied.length) commitIssue = null;
        // Conflicts remain explicit in state(); they do not prevent sending a
        // different key whose safe pending edits are already durable.
        return analysis.applied.length === 0;
      }
      const batch = eligible.map((latest) => {
        const entry = records.get(keyOf(latest));
        const committing = { ...entry, committing: latest };
        records.set(keyOf(latest), recoveryOf([committing]).entries[0]);
        return committing;
      });
      const markerKept = writeSlot();
      if (!guard()) return false;
      // A loaded recovery entry requires the guarded recovery slot. An edit
      // made in this controller may still reach durable storage if that local
      // fallback is unavailable, with its recovery issue remaining visible.
      const allowed = batch.filter(
        (entry) => markerKept || origins.get(keyOf(entry.key)) === 'local',
      );
      if (!allowed.length) return false;
      const captured = recoveryOf(allowed);
      const needsRecoverySlot = allowed.some((entry) => origins.get(keyOf(entry.key)) !== 'local');
      activeBatch = captured.entries;
      notify();
      let kept;
      try {
        kept =
          (await commit((currentRoot) => {
            if (!guard()) throw new Error('draft-owner-unavailable');
            if (needsRecoverySlot && !checkSlot()) throw new Error('recovery-unavailable');
            const result = reconcileSentenceDraftRecovery(currentRoot, captured).drafts;
            if (needsRecoverySlot && !checkSlot()) throw new Error('recovery-unavailable');
            if (!guard()) throw new Error('draft-owner-unavailable');
            return result;
          })) === true;
      } catch {
        kept = false;
      }
      activeBatch = [];
      if (!guard()) return false;
      if (!kept) {
        // Do not spin or discard the committing marker on an uncertain ack.
        // A later refresh/retry can observe an exact durable identity safely.
        readDurable();
        commitIssue = 'draft-commit-failed';
        cancelTimer();
        notify();
        return false;
      }
      if (!readDurable()) return false;
      settlePublished();
      writeSlot();
      const after = analyze();
      const stillPending = after.applied;
      if (
        captured.entries.some((entry) =>
          after.remaining.entries.some((conflict) => keyOf(conflict.key) === keyOf(entry.key)),
        )
      ) {
        // A draft that became conflicted inside this queued write was not
        // settled by this flush. Pre-existing unrelated conflicts still do
        // not block subsequent safe flushes.
        notify();
        return false;
      }
      const unconfirmed = captured.entries.some(
        (entry) =>
          !same(currentFor(entry.key), entry.latest) &&
          stillPending.some((latest) => keyOf(latest) === keyOf(entry.key)),
      );
      if (unconfirmed) {
        commitIssue = 'draft-commit-unconfirmed';
        notify();
        return false;
      }
      commitIssue = null;
      notify();
    }
    return false;
  }

  function flush() {
    cancelTimer();
    if (flight) return flight;
    if (!guard()) return Promise.resolve(false);
    let completed = false;
    flight = Promise.resolve()
      .then(drain)
      .catch(() => {
        commitIssue = 'draft-commit-failed';
        return false;
      })
      .then((result) => {
        completed = result;
        return result;
      })
      .finally(() => {
        activeBatch = [];
        flight = null;
        // An input microtask may run after drain returns but before this
        // finalizer. It still needs a debounce when the prior flush succeeded.
        if (completed && analyze().applied.some((latest) => origins.get(keyOf(latest)) === 'local'))
          schedule();
        notify();
      });
    return flight;
  }

  async function recover() {
    if (!checkSlot()) {
      notify();
      return false;
    }
    const kept = await flush();
    return (
      kept &&
      slotMode === 'owned' &&
      recoveryIssue === null &&
      analyze().remaining.entries.length === 0
    );
  }

  function refresh() {
    refreshInternal();
    notify();
  }

  async function resolve(rawKey, choice) {
    if (choice !== 'use' && choice !== 'keep') return false;
    let key;
    try {
      key = parseSentenceDraftKey(rawKey);
    } catch {
      return false;
    }
    const token = keyOf(key);
    if (flight) await flight;
    if (!refreshInternal() || !checkSlot()) {
      notify();
      return false;
    }
    const conflict = analyze().remaining.entries.find((entry) => keyOf(entry.key) === token);
    if (!conflict) return false;
    const next = new Map(records);
    if (choice === 'keep') next.delete(token);
    else {
      try {
        const current = currentFor(key);
        next.set(token, {
          key,
          base: current,
          committing: null,
          latest: newDraft(
            key,
            conflict.latest.text,
            Boolean(
              conflict.latest.transcriptOpened ||
              (current && !current.consumed && current.transcriptOpened),
            ),
          ),
        });
      } catch (error) {
        editIssue = error?.code === 'draft-capacity' ? 'draft-capacity' : 'draft-edit-invalid';
        editIssueKey = token;
        notify();
        return false;
      }
    }
    if (!writeSlot([...next.values()])) {
      notify();
      return false;
    }
    records = new Map(
      recoveryOf([...next.values()]).entries.map((entry) => [keyOf(entry.key), entry]),
    );
    if (choice === 'keep') origins.delete(token);
    else origins.set(token, 'local');
    editIssue = null;
    editIssueKey = null;
    notify();
    return choice === 'keep' ? true : flush();
  }

  function close() {
    if (closed) return;
    closed = true;
    cancelTimer();
  }

  if (readDurable()) {
    try {
      expectedSlot = storage.getItem(recoveryKey);
      if (!guard()) throw new Error('writer-unavailable');
      const recovery =
        expectedSlot === null ? emptyRecovery : parseSentenceDraftRecovery(decode(expectedSlot));
      if (recovery.installation !== installationText) blockSlot('recovery-foreign');
      else {
        slotMode = 'owned';
        records = new Map(recovery.entries.map((entry) => [keyOf(entry.key), entry]));
        for (const entry of recovery.entries) {
          origins.set(keyOf(entry.key), 'recovered');
          rememberRevisions(entry);
        }
      }
    } catch {
      if (!revoked)
        blockSlot(typeof expectedSlot === 'string' ? 'recovery-malformed' : 'recovery-read-failed');
    }
  } else recoveryIssue = 'recovery-unavailable';
  return Object.freeze({ edit, view, state, flush, recover, refresh, resolve, close });
}
