import assert from 'node:assert/strict';
import test from 'node:test';
import { createSentenceDraftController } from '../sentence-draft-controller.mjs';
import {
  SENTENCE_DRAFT_ENTRY_LIMIT,
  SENTENCE_DRAFT_TEXT_LIMIT,
  consumeSentenceDraft,
  parseSentenceDrafts,
} from '../sentence-drafts.mjs';

const revision = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const key = (n = 0, mode = 'production') => ({ entryId: `saved-plan:${n}`, mode });
const draft = (n, text, selectedKey = key(), consumed = false, transcriptOpened = false) => ({
  ...selectedKey,
  revision: revision(n),
  text,
  ...(selectedKey.mode === 'listening' ? { transcriptOpened } : {}),
  consumed,
});
const identity = ({ entryId, mode, revision, text, transcriptOpened }) => ({
  entryId,
  mode,
  revision,
  text,
  ...(mode === 'listening' ? { transcriptOpened } : {}),
});
const root = (...entries) => ({ version: 1, entries });
const installation = '{"format":"synthetic-installation","device":"a"}';
const recovery = (...entries) => ({ version: 1, installation, entries });
const entry = (latest, base = null, committing = null) => ({
  key: { entryId: latest.entryId, mode: latest.mode },
  base,
  committing,
  latest,
});
const clone = (value) => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function until(predicate) {
  for (let n = 0; n < 100; n += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert(predicate(), 'Expected deterministic promise boundary');
}

function fixture(
  t,
  { drafts = root(), slot = null, customRevision = true, initialRevision = 10_000 } = {},
) {
  const databaseName = 'synthetic-record-db';
  const key = `kairo-sentence-draft-recovery-v1:${databaseName}`;
  const values = new Map(slot === null ? [] : [[key, slot]]);
  const controllers = [];
  const env = {
    key,
    values,
    durable: parseSentenceDrafts(drafts),
    owner: true,
    readFails: false,
    writeFails: false,
    getDraftsFails: false,
    changes: 0,
    revisions: 0,
    writes: [],
    calls: [],
    controllers,
    storage: {
      getItem(key) {
        if (env.readFails) throw new Error('Synthetic storage read failure');
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        if (env.writeFails) throw new Error('Synthetic storage write failure');
        env.writes.push({ key, value });
        values.set(key, value);
        env.afterStorageWrite?.();
      },
    },
  };
  env.commitImpl = async (call) => {
    env.durable = call.producer(env.durable);
    env.controller.refresh();
    return true;
  };
  env.start = () => {
    const controller = createSentenceDraftController({
      installationText: installation,
      databaseName,
      storage: env.storage,
      assertCurrent() {
        if (!env.owner) throw new Error('Synthetic owner changed');
        return true;
      },
      getDrafts() {
        if (env.getDraftsFails) throw new Error('Synthetic durable read failure');
        return env.durable;
      },
      commit(producer) {
        const call = { producer, slot: values.get(key) ?? null };
        env.calls.push(call);
        return env.commitImpl(call);
      },
      onChange() {
        env.changes += 1;
        env.onChangeHook?.();
      },
      ...(customRevision
        ? {
            revision() {
              env.revisions += 1;
              return revision(initialRevision + env.revisions);
            },
          }
        : {}),
    });
    controllers.push(controller);
    env.controller = controller;
    return controller;
  };
  env.start();
  t.after(() => controllers.forEach((controller) => controller.close()));
  return env;
}

test('construction reads without notifying, writing or queueing commits; consumed durable text displays empty', (t) => {
  const saved = draft(1, 'Raw already sent text', key(1), true);
  const env = fixture(t, { drafts: root(saved) });
  assert.equal(env.changes, 0);
  assert.equal(env.writes.length, 0);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(env.controller.view(key(1)), {
    draft: saved,
    text: '',
    state: 'saved',
    error: null,
    recoveryDraft: null,
  });
  assert.deepEqual(env.controller.view(key()), {
    draft: null,
    text: '',
    state: 'empty',
    error: null,
    recoveryDraft: null,
  });
  assert.deepEqual(env.controller.state(), { issue: null, pending: false, conflicts: [] });
});

test('synchronously preserves raw edits, skips identical displayed text, and debounces record receipts for 750ms', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = fixture(t);
  const controller = env.controller;
  assert.equal(controller.edit(key(), '  first 😀  '), true);
  const first = controller.view(key()).draft;
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(entry(first)));
  const writes = env.writes.length;
  assert.equal(controller.edit(key(), first.text), true);
  assert.equal(env.writes.length, writes);
  assert.equal(env.revisions, 1);
  assert.equal(controller.edit(key(), '  newest e\u0301\t  '), true);
  const newest = controller.view(key()).draft;
  assert.notEqual(newest.revision, first.revision);
  assert.equal(env.calls.length, 0);
  t.mock.timers.tick(749);
  await Promise.resolve();
  assert.equal(env.calls.length, 0);
  t.mock.timers.tick(1);
  await until(() => env.calls.length === 1);
  assert.equal(await controller.flush(), true);
  assert.deepEqual(env.durable, root(newest));
  assert.equal(env.calls.length, 1);
  assert.deepEqual(JSON.parse(env.calls[0].slot), recovery(entry(newest, null, newest)));
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery());
  assert.equal(controller.view(key()).state, 'saved');
});

test('batches several key edits in one record transaction without altering other durable drafts', async (t) => {
  const older = draft(1, 'Other durable key', key(7), true);
  const env = fixture(t, { drafts: root(older) });
  env.controller.edit(key(), 'General');
  env.controller.edit(key(1), 'Source response draft');
  const general = env.controller.view(key()).draft;
  const selected = env.controller.view(key(1)).draft;
  assert.equal(await env.controller.flush(), true);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.durable, root(older, general, selected));
  assert.equal(JSON.parse(env.calls[0].slot).entries.length, 2);
});

test('one in-flight commit preserves the newest edit and rebases it after the acknowledged earlier draft', async (t) => {
  const env = fixture(t);
  const held = [];
  env.commitImpl = () => {
    const hold = deferred();
    held.push(hold);
    return hold.promise;
  };
  env.controller.edit(key(), 'A');
  const a = env.controller.view(key()).draft;
  const flushing = env.controller.flush();
  assert.equal(env.controller.flush(), flushing);
  await until(() => env.calls.length === 1);
  assert.equal(env.controller.view(key()).state, 'saving');
  env.controller.edit(key(), 'B');
  const b = env.controller.view(key()).draft;
  env.controller.edit(key(), 'C newest');
  const c = env.controller.view(key()).draft;
  assert.equal(env.calls.length, 1);
  assert.equal(env.controller.view(key()).state, 'pending');
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(entry(c, null, a)));
  env.durable = env.calls[0].producer(env.durable);
  env.controller.refresh();
  assert.equal(env.calls.length, 1, 'publish refresh cannot queue a nested record commit');
  assert.equal(env.controller.view(key()).text, c.text);
  held[0].resolve(true);
  await until(() => env.calls.length === 2);
  assert.deepEqual(JSON.parse(env.calls[1].slot), recovery(entry(c, a, c)));
  assert.notEqual(JSON.parse(env.calls[1].slot).entries[0].latest.revision, b.revision);
  env.durable = env.calls[1].producer(env.durable);
  env.controller.refresh();
  held[1].resolve(true);
  assert.equal(await flushing, true);
  assert.deepEqual(env.durable, root(c));
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery());
  assert.equal(env.calls.length, 2);
});

test('an intentional empty edit survives a late consumed publication of the prior submitted draft', async (t) => {
  const env = fixture(t);
  const held = [];
  env.commitImpl = () => {
    const hold = deferred();
    held.push(hold);
    return hold.promise;
  };
  env.controller.edit(key(), 'Submitted A');
  const a = env.controller.view(key()).draft;
  const flushing = env.controller.flush();
  await until(() => env.calls.length === 1);
  env.controller.edit(key(), '');
  const cleared = env.controller.view(key()).draft;
  assert.notEqual(cleared.revision, a.revision);
  env.durable = env.calls[0].producer(env.durable);
  env.durable = consumeSentenceDraft(env.durable, identity(a));
  env.controller.refresh();
  assert.equal(env.controller.view(key()).text, '');
  assert.deepEqual(env.controller.view(key()).draft, cleared);
  assert.equal(cleared.consumed, false);
  assert.deepEqual(JSON.parse(env.values.get(env.key)).entries[0].latest, cleared);
  held[0].resolve(true);
  await until(() => env.calls.length === 2);
  env.durable = env.calls[1].producer(env.durable);
  held[1].resolve(true);
  assert.equal(await flushing, true);
  assert.deepEqual(env.durable, root(cleared));
  env.controller.close();
  const restarted = env.start();
  assert.equal(restarted.view(key()).text, '');
  assert.equal(await restarted.recover(), true);
  assert.equal(env.calls.length, 2);
});

test('restarts before debounce using the synchronized recovery entry without minting another revision', async (t) => {
  const env = fixture(t);
  env.controller.edit(key(1), '  Unsent restart response draft 😀  ');
  const latest = env.controller.view(key(1)).draft;
  env.controller.close();
  assert.equal(env.calls.length, 0);
  const restarted = env.start();
  assert.equal(restarted.view(key(1)).text, latest.text);
  assert.equal(restarted.view(key(1)).state, 'pending');
  assert.equal(await restarted.recover(), true);
  assert.deepEqual(env.durable, root(latest));
  assert.equal(env.revisions, 1);
  assert.equal(env.calls.length, 1);
});

test('restart with an already durable consumed latest clears stale recovery without resurrecting or committing it', async (t) => {
  const latest = draft(1, 'Response draft already sent', key(1));
  const consumed = { ...latest, consumed: true };
  const env = fixture(t, { drafts: root(consumed), slot: JSON.stringify(recovery(entry(latest))) });
  assert.equal(env.controller.view(key(1)).text, '');
  assert.equal(env.controller.view(key(1)).draft.consumed, true);
  assert.equal(await env.controller.recover(), true);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(env.durable, root(consumed));
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery());
  assert.equal(env.controller.state().pending, false);
});

test('stale recovery conflicts remain whole and read-only until explicit use creates a fresh identity', async (t) => {
  const base = draft(1, 'Base', key(1));
  const pending = draft(2, 'Recover this text', key(1));
  const current = draft(3, 'Current durable text', key(1));
  const conflict = entry(pending, base, base);
  const env = fixture(t, { drafts: root(current), slot: JSON.stringify(recovery(conflict)) });
  const before = env.values.get(env.key);
  assert.equal(env.controller.view(key(1)).state, 'conflict');
  assert.equal(env.controller.view(key(1)).text, current.text);
  assert.deepEqual(env.controller.view(key(1)).recoveryDraft, pending);
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.equal(await env.controller.recover(), false);
  assert.equal(env.controller.edit(key(1), 'Cannot silently replace a conflict'), false);
  assert.equal(env.revisions, 0);
  assert.equal(env.calls.length, 0);
  assert.equal(env.values.get(env.key), before);
  assert.equal(await env.controller.resolve(key(1), 'use'), true);
  const resolved = env.durable.entries[0];
  assert.equal(resolved.text, pending.text);
  assert.notEqual(resolved.revision, pending.revision);
  assert.notEqual(resolved.revision, current.revision);
  assert.equal(resolved.consumed, false);
  assert.equal(env.calls.length, 1);
  assert.equal(env.controller.view(key(1)).state, 'saved');
});

test('explicit keep removes only the chosen conflict and leaves durable drafts and other recovery keys intact', async (t) => {
  const c1 = entry(draft(1, 'Recovered one', key(1)), draft(2, 'Base one', key(1)));
  const c2 = entry(draft(3, 'Recovered two', key(2)), draft(4, 'Base two', key(2)));
  const current = draft(5, 'Current one', key(1), true);
  const env = fixture(t, { drafts: root(current), slot: JSON.stringify(recovery(c1, c2)) });
  assert.equal(await env.controller.resolve(key(1), 'keep'), true);
  assert.deepEqual(env.durable, root(current));
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(c2));
  assert.deepEqual(env.controller.state().conflicts, [c2]);
  assert.equal(env.calls.length, 0);
  assert.equal(env.controller.view(key(1)).text, '');
  assert.equal(await env.controller.resolve(key(1), 'keep'), false);
});

test('an unrelated recovery conflict does not block flush of a safely saved response draft', async (t) => {
  const conflict = entry(
    draft(1, 'Unresolved source draft', key(1)),
    draft(2, 'Missing base', key(1)),
  );
  const env = fixture(t, { slot: JSON.stringify(recovery(conflict)) });
  env.controller.edit(key(), 'General response draft can be sent');
  const responseDraft = env.controller.view(key()).draft;
  assert.equal(await env.controller.flush(), true);
  assert.deepEqual(env.durable, root(responseDraft));
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(conflict));
  assert.equal(await env.controller.recover(), false);
  assert.equal(env.calls.length, 1);
});

test('a conflict discovered inside a queued producer makes that flush incomplete and keeps the full entry', async (t) => {
  const env = fixture(t);
  const held = deferred();
  env.commitImpl = () => held.promise;
  env.controller.edit(key(), 'Queued A');
  const latest = env.controller.view(key()).draft;
  const flushing = env.controller.flush();
  await until(() => env.calls.length === 1);
  const replacement = draft(1, 'A different durable edit arrived');
  env.durable = env.calls[0].producer(root(replacement));
  held.resolve(true);
  assert.equal(await flushing, false);
  assert.deepEqual(env.durable, root(replacement));
  assert.equal(env.controller.view(key()).state, 'conflict');
  assert.deepEqual(env.controller.state().conflicts, [entry(latest, null, latest)]);
  assert.equal(
    await env.controller.flush(),
    true,
    'an already exposed conflict is separate from safe pending writes',
  );
  assert.equal(env.calls.length, 1);
});

test('an edit arriving after successful drain still receives its debounce after flight finalization', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = fixture(t);
  let queued = false;
  env.onChangeHook = () => {
    if (!queued && env.calls.length === 1 && !env.controller.state().pending) {
      queued = true;
      queueMicrotask(() => env.controller.edit(key(), 'B at the finalization boundary'));
    }
  };
  env.controller.edit(key(), 'A');
  assert.equal(await env.controller.flush(), true);
  assert.equal(queued, true);
  assert.equal(env.controller.view(key()).text, 'B at the finalization boundary');
  assert.equal(env.calls.length, 1);
  t.mock.timers.tick(749);
  await Promise.resolve();
  assert.equal(env.calls.length, 1);
  t.mock.timers.tick(1);
  await until(() => env.calls.length === 2);
  assert.equal(await env.controller.flush(), true);
  assert.equal(env.durable.entries[0].text, 'B at the finalization boundary');
});

test('a false commit ack keeps pending data and never spins; explicit retry can settle it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = fixture(t);
  const normalCommit = env.commitImpl;
  env.commitImpl = async () => false;
  env.controller.edit(key(), 'Keep after false ack');
  const latest = env.controller.view(key()).draft;
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(entry(latest, null, latest)));
  assert.equal(env.controller.view(key()).text, latest.text);
  assert.equal(env.controller.state().pending, true);
  assert.equal(env.controller.state().issue, 'draft-commit-failed');
  t.mock.timers.tick(60_000);
  await Promise.resolve();
  assert.equal(env.calls.length, 1);
  env.commitImpl = normalCommit;
  assert.equal(await env.controller.flush(), true);
  assert.equal(env.calls.length, 2);
  assert.deepEqual(env.durable, root(latest));
  assert.equal(env.controller.state().issue, null);
});

test('a thrown commit retains its marker; a consumed publication followed by false ack never overlays old text', async (t) => {
  const env = fixture(t);
  env.commitImpl = () => {
    throw new Error('Synthetic transaction fault');
  };
  env.controller.edit(key(), 'Response draft');
  const latest = env.controller.view(key()).draft;
  assert.equal(await env.controller.flush(), false);
  assert.deepEqual(env.durable, root());
  assert.equal(env.controller.view(key()).text, latest.text);
  env.commitImpl = async (call) => {
    env.durable = consumeSentenceDraft(call.producer(env.durable), identity(latest));
    return false;
  };
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.view(key()).text, '');
  assert.equal(env.controller.view(key()).draft.consumed, true);
  assert.deepEqual(JSON.parse(env.values.get(env.key)).entries[0].latest, latest);
  env.controller.close();
  assert.equal(await env.start().recover(), true);
  assert.equal(env.calls.length, 2);
});

test('a true ack without durable publication is unconfirmed and does not trigger an automatic retry', async (t) => {
  const env = fixture(t);
  env.commitImpl = async () => true;
  env.controller.edit(key(), 'No publication yet');
  const latest = env.controller.view(key()).draft;
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.calls.length, 1);
  assert.equal(env.controller.state().issue, 'draft-commit-unconfirmed');
  assert.equal(env.controller.view(key()).text, latest.text);
  env.durable = env.calls[0].producer(env.durable);
  env.controller.refresh();
  assert.equal(env.calls.length, 1);
  assert.equal(env.controller.state().pending, false);
  assert.equal(await env.controller.flush(), true);
  assert.equal(env.controller.state().issue, null);
});

test('storage failure keeps in-memory raw text visible while allowing durable local edits and guarded recovery repair', async (t) => {
  const env = fixture(t);
  env.writeFails = true;
  assert.equal(env.controller.edit(key(), '  Memory text after quota failure  '), false);
  const latest = env.controller.view(key()).draft;
  assert.equal(env.controller.view(key()).text, latest.text);
  assert.equal(env.controller.view(key()).state, 'unavailable');
  assert.equal(env.controller.state().issue, 'recovery-write-failed');
  assert.equal(await env.controller.flush(), true);
  assert.deepEqual(env.durable, root(latest));
  assert.equal(env.controller.state().pending, false);
  assert.equal(env.controller.state().issue, 'recovery-write-failed');
  assert.equal(env.values.has(env.key), false);
  env.writeFails = false;
  env.controller.refresh();
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery());
  assert.equal(env.controller.state().issue, null);
  assert.equal(env.calls.length, 1);
});

test('malformed, encoded, duplicate-key and foreign recovery slots stay byte-exact through local durable fallback', async (t) => {
  const foreign = JSON.stringify({
    ...recovery(entry(draft(1, 'Foreign private recovery'))),
    installation: '{"device":"foreign"}',
  });
  const values = [
    ['{ malformed private bytes', 'recovery-malformed'],
    [JSON.stringify(JSON.stringify(recovery())), 'recovery-malformed'],
    [
      `{"version":1,"version":1,"installation":${JSON.stringify(installation)},"entries":[]}`,
      'recovery-malformed',
    ],
    [foreign, 'recovery-foreign'],
  ];
  for (const [slot, issue] of values) {
    const env = fixture(t, { slot });
    assert.equal(env.controller.state().issue, issue);
    assert.equal(await env.controller.recover(), false);
    assert.equal(env.controller.edit(key(), 'New local response draft'), false);
    const latest = env.controller.view(key()).draft;
    assert.equal(await env.controller.flush(), true);
    assert.deepEqual(env.durable, root(latest));
    env.controller.refresh();
    assert.equal(env.controller.state().issue, issue);
    assert.equal(env.values.get(env.key), slot);
    assert.equal(env.writes.length, 0);
    assert.equal(env.controller.view(key()).text, latest.text);
    env.controller.close();
  }
});

test('a slot change blocks recovery promotion and guarded writes without adopting the replacement bytes', async (t) => {
  const latest = draft(1, 'Originally observed recovery');
  const env = fixture(t, { slot: JSON.stringify(recovery(entry(latest))) });
  const replacement = JSON.stringify({
    ...recovery(entry(draft(2, 'Another learner text'))),
    installation: 'foreign-installation',
  });
  env.values.set(env.key, replacement);
  env.controller.refresh();
  assert.equal(env.controller.state().issue, 'recovery-changed');
  assert.equal(await env.controller.recover(), false);
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.calls.length, 0);
  assert.equal(env.writes.length, 0);
  assert.equal(env.values.get(env.key), replacement);
  assert.equal(env.controller.view(key()).text, latest.text);
});

test('keep/use storage failures retain the whole conflict without changing the durable root', async (t) => {
  const conflict = entry(draft(1, 'Recover'), draft(2, 'Base'));
  const current = draft(3, 'Current');
  const slot = JSON.stringify(recovery(conflict));
  const env = fixture(t, { drafts: root(current), slot });
  env.writeFails = true;
  assert.equal(await env.controller.resolve(key(), 'keep'), false);
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.equal(await env.controller.resolve(key(), 'use'), false);
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.deepEqual(env.durable, root(current));
  assert.equal(env.values.get(env.key), slot);
  assert.equal(env.calls.length, 0);
});

test('close cancels debounce and revokes edits, storage writes and future queued producers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = fixture(t);
  env.controller.edit(key(), 'Close before debounce');
  const savedSlot = env.values.get(env.key);
  const writes = env.writes.length;
  env.controller.close();
  const changes = env.changes;
  t.mock.timers.tick(60_000);
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.edit(key(), 'After close'), false);
  env.controller.refresh();
  assert.equal(env.writes.length, writes);
  assert.equal(env.values.get(env.key), savedSlot);
  assert.equal(env.changes, changes);
  assert.equal(env.calls.length, 0);

  const restarted = env.start();
  const held = deferred();
  env.commitImpl = () => held.promise;
  const flushing = restarted.recover();
  await until(() => env.calls.length === 1);
  restarted.close();
  const beforeAckWrites = env.writes.length;
  const beforeAckChanges = env.changes;
  assert.throws(() => env.calls[0].producer(env.durable), /draft-owner-unavailable/u);
  held.resolve(false);
  assert.equal(await flushing, false);
  assert.equal(env.writes.length, beforeAckWrites);
  assert.equal(env.changes, beforeAckChanges);
  assert.deepEqual(env.durable, root());
});

test('ownership revocation prevents queued producers and remains revoked even if the old port later returns true', async (t) => {
  const env = fixture(t);
  const held = deferred();
  env.commitImpl = () => held.promise;
  env.controller.edit(key(1), 'Owned edit');
  const flushing = env.controller.flush();
  await until(() => env.calls.length === 1);
  env.owner = false;
  const writes = env.writes.length;
  assert.throws(() => env.calls[0].producer(env.durable), /draft-owner-unavailable/u);
  env.owner = true;
  held.resolve(false);
  assert.equal(await flushing, false);
  assert.equal(env.controller.edit(key(1), 'Cannot enter a new scope'), false);
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.state().issue, 'draft-owner-unavailable');
  assert.equal(env.writes.length, writes);
  assert.deepEqual(env.durable, root());
});

test('ownership change observed after a recovery write prevents any subsequent record commit', async (t) => {
  const env = fixture(t);
  env.afterStorageWrite = () => {
    env.owner = false;
  };
  assert.equal(env.controller.edit(key(), 'Keep but revoke'), false);
  assert.equal(env.controller.state().issue, 'draft-owner-unavailable');
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.calls.length, 0);
  assert.equal(env.writes.length, 1);
});

test('read failures retain known text and prevent recovery from unknown storage or invalid durable roots', async (t) => {
  const env = fixture(t);
  env.controller.edit(key(), 'Known in-memory text');
  env.readFails = true;
  env.controller.refresh();
  assert.equal(env.controller.view(key()).text, 'Known in-memory text');
  assert.equal(env.controller.state().issue, 'recovery-read-failed');
  assert.equal(await env.controller.recover(), false);
  env.getDraftsFails = true;
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.state().issue, 'durable-drafts-unavailable');
  assert.equal(env.calls.length, 0);
});

test('default revisions use UUIDs and returned view/state objects are immutable snapshots', async (t) => {
  const env = fixture(t, { customRevision: false });
  assert.equal(env.controller.edit(key(), '😀 raw text'), true);
  const view = env.controller.view(key());
  const state = env.controller.state();
  assert.match(
    view.draft.revision,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  assert(Object.isFrozen(view));
  assert(Object.isFrozen(view.draft));
  assert(Object.isFrozen(state));
  assert(Object.isFrozen(state.conflicts));
  assert.equal(Reflect.set(view.draft, 'text', 'Outside mutation'), false);
  assert.equal(env.controller.edit('not-a-key', ''), false);
  assert.equal(env.controller.view(key()).text, '😀 raw text');
  assert.equal(await env.controller.flush(), true);
  assert.deepEqual(clone(env.durable.entries[0]), view.draft);
});

test('one exact plan has independent production/listening drafts and exposure alone is a durable edit', async (t) => {
  const env = fixture(t);
  const productionKey = key(1);
  const listeningKey = key(1, 'listening');
  assert.equal(env.controller.edit(productionKey, ' \tProduction 😀\r\n  '), true);
  const production = env.controller.view(productionKey).draft;
  assert.equal(env.controller.edit(listeningKey, ''), true);
  const unexposed = env.controller.view(listeningKey).draft;
  assert.equal(unexposed.transcriptOpened, false);
  assert.equal(env.controller.edit(listeningKey, '', { transcriptOpened: true }), true);
  const exposed = env.controller.view(listeningKey).draft;
  assert.notEqual(exposed.revision, unexposed.revision);
  assert.equal(exposed.text, '');
  assert.equal(exposed.transcriptOpened, true);
  assert.deepEqual(
    JSON.parse(env.values.get(env.key)),
    recovery(entry(production), entry(exposed)),
  );
  const edits = env.revisions;
  assert.equal(env.controller.edit(listeningKey, '', { transcriptOpened: false }), true);
  assert.equal(env.revisions, edits, 'an unconsumed exposure fact cannot be reset');
  assert.equal(
    env.controller.edit(listeningKey, '  聞いたe\u0301文\n ', { transcriptOpened: false }),
    true,
  );
  const listening = env.controller.view(listeningKey).draft;
  assert.equal(listening.transcriptOpened, true);
  assert.equal(env.controller.edit(listeningKey, listening.text), true);
  assert.equal(env.controller.view(listeningKey).draft.revision, listening.revision);
  assert.deepEqual(env.controller.view(productionKey).draft, production);
  env.controller.close();
  const restarted = env.start();
  assert.deepEqual(restarted.view(listeningKey).draft, listening);
  assert.equal(await restarted.recover(), true);
  assert.deepEqual(env.durable, root(production, listening));
  for (const value of env.durable.entries) {
    assert.equal(Object.hasOwn(value, 'completedPlays'), false);
    assert.equal(Object.hasOwn(value, 'startedAt'), false);
    assert.equal(Object.hasOwn(value, 'latencyMs'), false);
  }
});

test('empty first edits survive restart and consumed display preservation retains its tombstone', async (t) => {
  const env = fixture(t);
  assert.equal(env.controller.edit(key(), ''), true);
  const empty = env.controller.view(key()).draft;
  assert.equal(empty.consumed, false);
  env.controller.close();
  const restarted = env.start();
  assert.deepEqual(restarted.view(key()).draft, empty);
  assert.equal(await restarted.recover(), true);
  env.durable = consumeSentenceDraft(env.durable, identity(empty));
  restarted.refresh();
  const edits = env.revisions;
  const writes = env.writes.length;
  assert.equal(restarted.edit(key(), ''), true);
  assert.equal(env.revisions, edits);
  assert.equal(env.writes.length, writes);
  assert.equal(restarted.view(key()).draft.consumed, true);
});

test('listening consumption starts fresh exposure only when a new editing action occurs', async (t) => {
  const submitted = draft(1, 'Exposed response', key(1, 'listening'), true, true);
  const env = fixture(t, { drafts: root(submitted) });
  assert.equal(env.controller.edit(key(1, 'listening'), ''), true);
  assert.equal(env.revisions, 0);
  assert.deepEqual(env.controller.view(key(1, 'listening')).draft, submitted);
  assert.equal(env.controller.edit(key(1, 'listening'), submitted.text), true);
  const fresh = env.controller.view(key(1, 'listening')).draft;
  assert.notEqual(fresh.revision, submitted.revision);
  assert.equal(fresh.transcriptOpened, false);
  assert.equal(fresh.consumed, false);
  assert.equal(
    env.controller.edit(key(1, 'listening'), fresh.text, { transcriptOpened: true }),
    true,
  );
  assert.equal(env.controller.edit(key(1, 'listening'), ''), true);
  const cleared = env.controller.view(key(1, 'listening')).draft;
  assert.equal(cleared.transcriptOpened, true);
  assert.equal(cleared.text, '');
  assert.equal(await env.controller.flush(), true);
  assert.deepEqual(env.durable, root(cleared));
});

test('injected delayed consumption of A retains a newer A-B-A identity or explicit empty through restart', async (t) => {
  for (const latestText of ['窓から海が見えます。', '']) {
    const env = fixture(t);
    env.controller.edit(key(), '窓から海が見えます。');
    assert.equal(await env.controller.flush(), true);
    const submitted = env.controller.view(key()).draft;
    env.controller.edit(key(), 'B entered while Save is held');
    env.controller.edit(key(), latestText);
    const latest = env.controller.view(key()).draft;
    assert.notEqual(latest.revision, submitted.revision);
    // This models the neutral consume publication only. Response adapter and
    // actual browser Save acceptance are owned by the integration verifier.
    env.durable = consumeSentenceDraft(env.durable, identity(submitted));
    env.controller.refresh();
    assert.deepEqual(
      JSON.parse(env.values.get(env.key)),
      recovery(entry(latest, { ...submitted, consumed: true })),
    );
    env.controller.close();
    const restarted = env.start();
    assert.deepEqual(restarted.view(key()).draft, latest);
    assert.equal(await restarted.recover(), true);
    assert.deepEqual(env.durable, root(latest));
    assert.equal(env.revisions, 3);
    assert.equal(env.calls.length, 2);
  }
});

test('close after a producer published but before its acknowledgement preserves the newer committing recovery', async (t) => {
  for (const ack of [true, false]) {
    const env = fixture(t);
    const held = deferred();
    env.commitImpl = () => held.promise;
    env.controller.edit(key(1, 'listening'), 'A', { transcriptOpened: true });
    const a = env.controller.view(key(1, 'listening')).draft;
    const flushing = env.controller.flush();
    await until(() => env.calls.length === 1);
    env.controller.edit(key(1, 'listening'), '  B newest 😀\n ');
    const latest = env.controller.view(key(1, 'listening')).draft;
    env.durable = env.calls[0].producer(env.durable);
    assert.deepEqual(env.durable, root(a));
    const beforeClose = env.values.get(env.key);
    env.controller.close();
    held.resolve(ack);
    assert.equal(await flushing, false);
    assert.equal(env.values.get(env.key), beforeClose);
    env.commitImpl = async (call) => {
      env.durable = call.producer(env.durable);
      return true;
    };
    const restarted = env.start();
    assert.deepEqual(restarted.view(key(1, 'listening')).draft, latest);
    assert.equal(await restarted.recover(), true);
    assert.deepEqual(env.durable, root(latest));
    assert.equal(latest.transcriptOpened, true);
    assert.equal(env.calls.length, 2);
  }
});

test('publication of one key cannot confirm another pending key or the entire flush', async (t) => {
  const env = fixture(t);
  env.commitImpl = async (call) => {
    const result = call.producer(env.durable);
    env.durable = parseSentenceDrafts(root(result.entries[0]));
    return true;
  };
  env.controller.edit(key(1), 'Published');
  env.controller.edit(key(1, 'listening'), 'Still pending');
  const listening = env.controller.view(key(1, 'listening')).draft;
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.view(key(1)).state, 'saved');
  assert.equal(env.controller.view(key(1, 'listening')).state, 'unavailable');
  assert.equal(env.controller.view(key(1, 'listening')).error, 'draft-commit-unconfirmed');
  assert.deepEqual(
    JSON.parse(env.values.get(env.key)),
    recovery(entry(listening, null, listening)),
  );
  assert.equal(env.calls.length, 1);
});

test('view reads the live published root and revokes a lost owner without requiring refresh', (t) => {
  const first = draft(1, 'Previously published');
  const second = draft(2, 'Live current');
  const env = fixture(t, { drafts: root(first) });
  env.durable = root(second);
  assert.deepEqual(env.controller.view(key()).draft, second);
  assert.equal(env.controller.view(key()).state, 'saved');
  env.owner = false;
  assert.equal(env.controller.view(key()).state, 'unavailable');
  env.owner = true;
  assert.equal(env.controller.edit(key(), 'Old owner cannot resume'), false);
  assert.equal(env.controller.state().issue, 'draft-owner-unavailable');
  assert.deepEqual(env.durable, root(second));
});

test('a queued recovered producer rechecks exact recovery-slot bytes before promotion', async (t) => {
  const latest = draft(1, 'Loaded recovery', key(1, 'listening'), false, true);
  const env = fixture(t, { slot: JSON.stringify(recovery(entry(latest))) });
  const held = deferred();
  env.commitImpl = () => held.promise;
  const recovering = env.controller.recover();
  await until(() => env.calls.length === 1);
  const replacement = '{foreign replacement bytes must survive';
  env.values.set(env.key, replacement);
  assert.throws(() => env.calls[0].producer(env.durable), /recovery-unavailable/u);
  held.resolve(false);
  assert.equal(await recovering, false);
  assert.deepEqual(env.durable, root());
  assert.equal(env.values.get(env.key), replacement);
  assert.equal(env.controller.view(key(1, 'listening')).text, latest.text);
  assert.equal(env.controller.view(key(1, 'listening')).state, 'unavailable');
  assert.equal(env.controller.state().issue, 'recovery-changed');
});

test('keep/use resolves only the exact mode and use preserves recovered listening exposure', async (t) => {
  const production = entry(draft(1, 'Recovered production'), draft(2, 'Old production'));
  const listening = entry(
    draft(3, 'Recovered listening', key(0, 'listening'), false, true),
    draft(4, 'Old listening', key(0, 'listening')),
  );
  const currentProduction = draft(5, 'Saved production');
  const currentListening = draft(6, 'Saved listening', key(0, 'listening'));
  const env = fixture(t, {
    drafts: root(currentProduction, currentListening),
    slot: JSON.stringify(recovery(production, listening)),
  });
  assert.equal(await env.controller.resolve(key(), 'keep'), true);
  assert.deepEqual(env.controller.state().conflicts, [listening]);
  assert.deepEqual(env.durable, root(currentProduction, currentListening));
  assert.equal(await env.controller.resolve(key(0, 'listening'), 'use'), true);
  assert.deepEqual(env.durable.entries[0], currentProduction);
  const resolved = env.durable.entries[1];
  assert.equal(resolved.text, listening.latest.text);
  assert.equal(resolved.transcriptOpened, true);
  assert.notEqual(resolved.revision, listening.latest.revision);
  assert.equal(env.controller.state().conflicts.length, 0);
});

test('invalid edits and reused factory UUIDs preserve the prior draft and exact recovery bytes', (t) => {
  const env = fixture(t);
  env.controller.edit(key(), 'Valid editor text');
  const before = env.values.get(env.key);
  const latest = env.controller.view(key()).draft;
  assert.equal(env.controller.edit(key(), 'x'.repeat(SENTENCE_DRAFT_TEXT_LIMIT + 1)), false);
  assert.equal(env.controller.view(key()).state, 'unavailable');
  assert.deepEqual(env.controller.view(key()).draft, latest);
  assert.equal(env.values.get(env.key), before);
  let reads = 0;
  const accessor = {
    get transcriptOpened() {
      reads += 1;
      throw new Error('Do not read');
    },
  };
  for (const options of [accessor, { transcriptOpened: false }, { authority: true }, [], null]) {
    assert.equal(env.controller.edit(key(), 'Other text', options), false);
  }
  assert.equal(reads, 0);
  assert.equal(env.values.get(env.key), before);
  env.revisions = 0;
  assert.equal(env.controller.edit(key(), 'Factory reused the first UUID'), false);
  assert.deepEqual(env.controller.view(key()).draft, latest);
  assert.equal(env.values.get(env.key), before);
  assert.equal(env.controller.edit(key(), latest.text), true);
  assert.equal(env.controller.state().issue, null);
});

test('capacity failures keep existing journal/editor rows and never evict another key', async (t) => {
  const entries = Array.from({ length: SENTENCE_DRAFT_ENTRY_LIMIT }, (_, i) =>
    draft(i + 1, `Text ${i}`, key(i)),
  );
  const env = fixture(t, { drafts: root(...entries) });
  const before = JSON.stringify(env.durable);
  const slot = env.values.get(env.key);
  assert.equal(
    env.controller.edit(key(50_000), 'Copyable current DOM text remains with the caller'),
    false,
  );
  assert.equal(env.controller.state().issue, 'draft-capacity');
  assert.equal(env.controller.view(key(50_000)).state, 'unavailable');
  assert.equal(env.revisions, 0);
  assert.equal(env.values.get(env.key), slot);
  assert.equal(JSON.stringify(env.durable), before);
  assert.equal(env.controller.edit(key(500), ''), true);
  const cleared = env.controller.view(key(500)).draft;
  const pending = env.values.get(env.key);
  assert.equal(env.controller.edit(key(50_000), 'Still full'), false);
  assert.equal(env.values.get(env.key), pending);
  assert.deepEqual(env.controller.view(key(500)).draft, cleared);
  assert.equal(await env.controller.flush(), true);
  assert.equal(env.durable.entries.length, SENTENCE_DRAFT_ENTRY_LIMIT);
  assert.deepEqual(env.durable.entries[500], cleared);
  assert.deepEqual(env.durable.entries.at(-1), entries.at(-1));
});

test('over-capacity loaded recovery remains whole and cannot silently evict a durable key', async (t) => {
  const entries = Array.from({ length: SENTENCE_DRAFT_ENTRY_LIMIT }, (_, i) =>
    draft(i + 1, '', key(i)),
  );
  const latest = draft(50_000, 'Retained orphan recovery', key(50_000));
  const slot = JSON.stringify(recovery(entry(latest)));
  const env = fixture(t, { drafts: root(...entries), slot });
  assert.equal(await env.controller.recover(), false);
  assert.equal(await env.controller.resolve(key(50_000), 'use'), false);
  assert.deepEqual(env.controller.state().conflicts, [entry(latest)]);
  assert.equal(env.controller.state().issue, 'draft-capacity');
  assert.equal(env.values.get(env.key), slot);
  assert.deepEqual(env.durable, root(...entries));
  assert.equal(env.calls.length, 0);
});
