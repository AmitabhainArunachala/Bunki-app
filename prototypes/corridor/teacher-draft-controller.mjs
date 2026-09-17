import {
  editTeacherDraft,
  parseTeacherDraftRecovery,
  parseTeacherDrafts,
  reconcileTeacherDraftRecovery,
} from './teacher-drafts.mjs';

const DELAY = 750;
const CONTEXT_REF = /^teacher-context:[0-9a-f]{64}$/u;
const same = (left, right) =>
  Boolean(
    left &&
    right &&
    left.contextRef === right.contextRef &&
    left.revision === right.revision &&
    left.text === right.text,
  );

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
export function createTeacherDraftController(options) {
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
    throw new TypeError('Invalid teacher draft controller ports');
  }
  const { installationText, databaseName, storage, assertCurrent, getDrafts, commit, onChange } =
    options;
  const makeRevision = options.revision ?? (() => globalThis.crypto.randomUUID());
  const emptyRecovery = parseTeacherDraftRecovery({
    version: 1,
    installation: installationText,
    entries: [],
  });
  const recoveryKey = `kairo-teacher-draft-recovery-v1:${databaseName}`;
  let durable = parseTeacherDrafts(null);
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
  let closed = false;
  let revoked = false;
  let timer = null;
  let flight = null;
  let activeBatch = [];

  const currentIssue = () =>
    ownerIssue || durableIssue || recoveryIssue || commitIssue || editIssue;
  const recoveryOf = (entries = [...records.values()]) =>
    parseTeacherDraftRecovery({
      version: 1,
      installation: installationText,
      entries,
    });
  const currentFor = (contextRef) =>
    durable.entries.find((value) => value.contextRef === contextRef) ?? null;
  const analyze = () => reconcileTeacherDraftRecovery(durable, recoveryOf());
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
      const next = parseTeacherDrafts(getDrafts());
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
    for (const [contextRef, entry] of records) {
      const current = currentFor(contextRef);
      if (same(current, entry.latest)) {
        records.delete(contextRef);
        origins.delete(contextRef);
        changed = true;
      } else if (same(current, entry.committing)) {
        const stillInFlight = activeBatch.some((batch) => same(batch.latest, entry.committing));
        const next = {
          ...entry,
          base: current,
          committing: stillInFlight ? entry.committing : null,
        };
        if (JSON.stringify(next) !== JSON.stringify(entry)) {
          records.set(contextRef, recoveryOf([next]).entries[0]);
          changed = true;
        }
      } else if (same(current, entry.base) && current.consumed !== entry.base.consumed) {
        records.set(contextRef, recoveryOf([{ ...entry, base: current }]).entries[0]);
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

  function newDraft(contextRef, text) {
    const revision = makeRevision();
    if (usedRevisions.has(revision)) throw new Error('reused-draft-revision');
    const value = editTeacherDraft(durable, { contextRef, revision, text }).entries.find(
      (item) => item.contextRef === contextRef,
    );
    usedRevisions.add(revision);
    return value;
  }

  function view(contextRef) {
    if (contextRef !== null && (typeof contextRef !== 'string' || !CONTEXT_REF.test(contextRef))) {
      return Object.freeze({
        draft: null,
        text: '',
        state: 'unavailable',
        error: 'invalid-context-ref',
        recoveryDraft: null,
      });
    }
    const conflict = analyze().remaining.entries.find((entry) => entry.contextRef === contextRef);
    const current = currentFor(contextRef);
    const entry = records.get(contextRef);
    const pending = entry && !same(current, entry.latest);
    const draft = !conflict && pending ? entry.latest : current;
    const saving = pending && activeBatch.some((batch) => same(batch.latest, entry.latest));
    const state =
      closed || revoked || durableIssue
        ? 'unavailable'
        : conflict
          ? 'conflict'
          : recoveryIssue
            ? 'unavailable'
            : saving
              ? 'saving'
              : pending
                ? 'pending'
                : 'saved';
    return Object.freeze({
      draft,
      text: draft && !draft.consumed ? draft.text : '',
      state,
      error: closed ? 'draft-controller-closed' : currentIssue(),
      recoveryDraft: conflict?.latest ?? null,
    });
  }

  function state() {
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

  function edit(contextRef, text) {
    if (!refreshInternal()) {
      notify();
      return false;
    }
    if (contextRef !== null && (typeof contextRef !== 'string' || !CONTEXT_REF.test(contextRef))) {
      editIssue = 'draft-edit-invalid';
      notify();
      return false;
    }
    if (analyze().remaining.entries.some((entry) => entry.contextRef === contextRef)) return false;
    if (typeof text === 'string' && view(contextRef).text === text) return true;
    try {
      const latest = newDraft(contextRef, text);
      const previous = records.get(contextRef);
      const value = previous
        ? { ...previous, latest }
        : {
            contextRef,
            base: currentFor(contextRef),
            committing: null,
            latest,
          };
      const next = new Map(records);
      next.set(contextRef, value);
      const parsed = recoveryOf([...next.values()]);
      records = new Map(parsed.entries.map((entry) => [entry.contextRef, entry]));
      origins.set(contextRef, 'local');
      editIssue = null;
      const kept = writeSlot();
      schedule();
      notify();
      return kept;
    } catch {
      editIssue = 'draft-edit-invalid';
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
        (latest) => slotMode === 'owned' || origins.get(latest.contextRef) === 'local',
      );
      if (!eligible.length) {
        if (!analysis.applied.length) commitIssue = null;
        // Conflicts remain explicit in state(); they do not prevent sending a
        // different topic whose safe pending edits are already durable.
        return analysis.applied.length === 0;
      }
      const batch = eligible.map((latest) => {
        const entry = records.get(latest.contextRef);
        const committing = { ...entry, committing: latest };
        records.set(latest.contextRef, recoveryOf([committing]).entries[0]);
        return committing;
      });
      const markerKept = writeSlot();
      if (!guard()) return false;
      // A loaded recovery entry requires the guarded recovery slot. An edit
      // made in this controller may still reach durable storage if that local
      // fallback is unavailable, with its recovery issue remaining visible.
      const allowed = batch.filter(
        (entry) => markerKept || origins.get(entry.contextRef) === 'local',
      );
      if (!allowed.length) return false;
      const captured = recoveryOf(allowed);
      activeBatch = captured.entries;
      notify();
      let kept;
      try {
        kept =
          (await commit((currentRoot) => {
            if (!guard()) throw new Error('draft-owner-unavailable');
            const result = reconcileTeacherDraftRecovery(currentRoot, captured).drafts;
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
          after.remaining.entries.some((conflict) => conflict.contextRef === entry.contextRef),
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
          !same(currentFor(entry.contextRef), entry.latest) &&
          stillPending.some((latest) => latest.contextRef === entry.contextRef),
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
        if (
          completed &&
          analyze().applied.some((latest) => origins.get(latest.contextRef) === 'local')
        )
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

  async function resolve(contextRef, choice) {
    if (choice !== 'use' && choice !== 'keep') return false;
    if (flight) await flight;
    if (!refreshInternal() || !checkSlot()) {
      notify();
      return false;
    }
    const conflict = analyze().remaining.entries.find((entry) => entry.contextRef === contextRef);
    if (!conflict) return false;
    const next = new Map(records);
    if (choice === 'keep') next.delete(contextRef);
    else {
      try {
        next.set(contextRef, {
          contextRef,
          base: currentFor(contextRef),
          committing: null,
          latest: newDraft(contextRef, conflict.latest.text),
        });
      } catch {
        editIssue = 'draft-edit-invalid';
        notify();
        return false;
      }
    }
    if (!writeSlot([...next.values()])) {
      notify();
      return false;
    }
    records = new Map(
      recoveryOf([...next.values()]).entries.map((entry) => [entry.contextRef, entry]),
    );
    if (choice === 'keep') origins.delete(contextRef);
    else origins.set(contextRef, 'local');
    editIssue = null;
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
        expectedSlot === null ? emptyRecovery : parseTeacherDraftRecovery(decode(expectedSlot));
      if (recovery.installation !== installationText) blockSlot('recovery-foreign');
      else {
        slotMode = 'owned';
        records = new Map(recovery.entries.map((entry) => [entry.contextRef, entry]));
        for (const entry of recovery.entries) {
          origins.set(entry.contextRef, 'recovered');
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
