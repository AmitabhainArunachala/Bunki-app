import assert from 'node:assert/strict';
import test from 'node:test';
import { createTeacherDraftController } from '../teacher-draft-controller.mjs';
import { consumeTeacherDraft, parseTeacherDrafts } from '../teacher-drafts.mjs';

const revision = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const topic = (n) => `teacher-context:${n.toString(16).padStart(64, '0')}`;
const draft = (n, text, contextRef = null, consumed = false) => ({
  contextRef,
  revision: revision(n),
  text,
  consumed,
});
const identity = ({ contextRef, revision, text }) => ({ contextRef, revision, text });
const root = (...entries) => ({ version: 1, entries });
const installation = '{"format":"synthetic-installation","device":"a"}';
const recovery = (...entries) => ({ version: 1, installation, entries });
const entry = (latest, base = null, committing = null) => ({
  contextRef: latest.contextRef,
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

function fixture(t, { drafts = root(), slot = null, customRevision = true } = {}) {
  const databaseName = 'synthetic-record-db';
  const key = `kairo-teacher-draft-recovery-v1:${databaseName}`;
  const values = new Map(slot === null ? [] : [[key, slot]]);
  const controllers = [];
  const env = {
    key,
    values,
    durable: parseTeacherDrafts(drafts),
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
    const controller = createTeacherDraftController({
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
              return revision(10_000 + env.revisions);
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
  const saved = draft(1, 'Raw already sent text', topic(1), true);
  const env = fixture(t, { drafts: root(saved) });
  assert.equal(env.changes, 0);
  assert.equal(env.writes.length, 0);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(env.controller.view(topic(1)), {
    draft: saved,
    text: '',
    state: 'saved',
    error: null,
    recoveryDraft: null,
  });
  assert.deepEqual(env.controller.view(null), {
    draft: null,
    text: '',
    state: 'saved',
    error: null,
    recoveryDraft: null,
  });
  assert.deepEqual(env.controller.state(), { issue: null, pending: false, conflicts: [] });
});

test('synchronously preserves raw edits, skips identical displayed text, and debounces record receipts for 750ms', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = fixture(t);
  const controller = env.controller;
  assert.equal(controller.edit(null, '  first 😀  '), true);
  const first = controller.view(null).draft;
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(entry(first)));
  const writes = env.writes.length;
  assert.equal(controller.edit(null, first.text), true);
  assert.equal(env.writes.length, writes);
  assert.equal(env.revisions, 1);
  assert.equal(controller.edit(null, '  newest e\u0301\t  '), true);
  const newest = controller.view(null).draft;
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
  assert.equal(controller.view(null).state, 'saved');
});

test('batches several topic edits in one record transaction without altering other durable drafts', async (t) => {
  const older = draft(1, 'Other durable topic', topic(7), true);
  const env = fixture(t, { drafts: root(older) });
  env.controller.edit(null, 'General');
  env.controller.edit(topic(1), 'Source question');
  const general = env.controller.view(null).draft;
  const selected = env.controller.view(topic(1)).draft;
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
  env.controller.edit(null, 'A');
  const a = env.controller.view(null).draft;
  const flushing = env.controller.flush();
  assert.equal(env.controller.flush(), flushing);
  await until(() => env.calls.length === 1);
  assert.equal(env.controller.view(null).state, 'saving');
  env.controller.edit(null, 'B');
  const b = env.controller.view(null).draft;
  env.controller.edit(null, 'C newest');
  const c = env.controller.view(null).draft;
  assert.equal(env.calls.length, 1);
  assert.equal(env.controller.view(null).state, 'pending');
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(entry(c, null, a)));
  env.durable = env.calls[0].producer(env.durable);
  env.controller.refresh();
  assert.equal(env.calls.length, 1, 'publish refresh cannot queue a nested record commit');
  assert.equal(env.controller.view(null).text, c.text);
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
  env.controller.edit(null, 'Submitted A');
  const a = env.controller.view(null).draft;
  const flushing = env.controller.flush();
  await until(() => env.calls.length === 1);
  env.controller.edit(null, '');
  const cleared = env.controller.view(null).draft;
  assert.notEqual(cleared.revision, a.revision);
  env.durable = env.calls[0].producer(env.durable);
  env.durable = consumeTeacherDraft(env.durable, identity(a));
  env.controller.refresh();
  assert.equal(env.controller.view(null).text, '');
  assert.deepEqual(env.controller.view(null).draft, cleared);
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
  assert.equal(restarted.view(null).text, '');
  assert.equal(await restarted.recover(), true);
  assert.equal(env.calls.length, 2);
});

test('restarts before debounce using the synchronized recovery entry without minting another revision', async (t) => {
  const env = fixture(t);
  env.controller.edit(topic(1), '  Unsent restart question 😀  ');
  const latest = env.controller.view(topic(1)).draft;
  env.controller.close();
  assert.equal(env.calls.length, 0);
  const restarted = env.start();
  assert.equal(restarted.view(topic(1)).text, latest.text);
  assert.equal(restarted.view(topic(1)).state, 'pending');
  assert.equal(await restarted.recover(), true);
  assert.deepEqual(env.durable, root(latest));
  assert.equal(env.revisions, 1);
  assert.equal(env.calls.length, 1);
});

test('restart with an already durable consumed latest clears stale recovery without resurrecting or committing it', async (t) => {
  const latest = draft(1, 'Question already sent', topic(1));
  const consumed = { ...latest, consumed: true };
  const env = fixture(t, { drafts: root(consumed), slot: JSON.stringify(recovery(entry(latest))) });
  assert.equal(env.controller.view(topic(1)).text, '');
  assert.equal(env.controller.view(topic(1)).draft.consumed, true);
  assert.equal(await env.controller.recover(), true);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(env.durable, root(consumed));
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery());
  assert.equal(env.controller.state().pending, false);
});

test('stale recovery conflicts remain whole and read-only until explicit use creates a fresh identity', async (t) => {
  const base = draft(1, 'Base', topic(1));
  const pending = draft(2, 'Recover this text', topic(1));
  const current = draft(3, 'Current durable text', topic(1));
  const conflict = entry(pending, base, base);
  const env = fixture(t, { drafts: root(current), slot: JSON.stringify(recovery(conflict)) });
  const before = env.values.get(env.key);
  assert.equal(env.controller.view(topic(1)).state, 'conflict');
  assert.equal(env.controller.view(topic(1)).text, current.text);
  assert.deepEqual(env.controller.view(topic(1)).recoveryDraft, pending);
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.equal(await env.controller.recover(), false);
  assert.equal(env.controller.edit(topic(1), 'Cannot silently replace a conflict'), false);
  assert.equal(env.revisions, 0);
  assert.equal(env.calls.length, 0);
  assert.equal(env.values.get(env.key), before);
  assert.equal(await env.controller.resolve(topic(1), 'use'), true);
  const resolved = env.durable.entries[0];
  assert.equal(resolved.text, pending.text);
  assert.notEqual(resolved.revision, pending.revision);
  assert.notEqual(resolved.revision, current.revision);
  assert.equal(resolved.consumed, false);
  assert.equal(env.calls.length, 1);
  assert.equal(env.controller.view(topic(1)).state, 'saved');
});

test('explicit keep removes only the chosen conflict and leaves durable drafts and other recovery topics intact', async (t) => {
  const c1 = entry(draft(1, 'Recovered one', topic(1)), draft(2, 'Base one', topic(1)));
  const c2 = entry(draft(3, 'Recovered two', topic(2)), draft(4, 'Base two', topic(2)));
  const current = draft(5, 'Current one', topic(1), true);
  const env = fixture(t, { drafts: root(current), slot: JSON.stringify(recovery(c1, c2)) });
  assert.equal(await env.controller.resolve(topic(1), 'keep'), true);
  assert.deepEqual(env.durable, root(current));
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(c2));
  assert.deepEqual(env.controller.state().conflicts, [c2]);
  assert.equal(env.calls.length, 0);
  assert.equal(env.controller.view(topic(1)).text, '');
  assert.equal(await env.controller.resolve(topic(1), 'keep'), false);
});

test('an unrelated recovery conflict does not block flush of a safely saved question', async (t) => {
  const conflict = entry(
    draft(1, 'Unresolved source draft', topic(1)),
    draft(2, 'Missing base', topic(1)),
  );
  const env = fixture(t, { slot: JSON.stringify(recovery(conflict)) });
  env.controller.edit(null, 'General question can be sent');
  const question = env.controller.view(null).draft;
  assert.equal(await env.controller.flush(), true);
  assert.deepEqual(env.durable, root(question));
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(conflict));
  assert.equal(await env.controller.recover(), false);
  assert.equal(env.calls.length, 1);
});

test('a conflict discovered inside a queued producer makes that flush incomplete and keeps the full entry', async (t) => {
  const env = fixture(t);
  const held = deferred();
  env.commitImpl = () => held.promise;
  env.controller.edit(null, 'Queued A');
  const latest = env.controller.view(null).draft;
  const flushing = env.controller.flush();
  await until(() => env.calls.length === 1);
  const replacement = draft(1, 'A different durable edit arrived');
  env.durable = env.calls[0].producer(root(replacement));
  held.resolve(true);
  assert.equal(await flushing, false);
  assert.deepEqual(env.durable, root(replacement));
  assert.equal(env.controller.view(null).state, 'conflict');
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
      queueMicrotask(() => env.controller.edit(null, 'B at the finalization boundary'));
    }
  };
  env.controller.edit(null, 'A');
  assert.equal(await env.controller.flush(), true);
  assert.equal(queued, true);
  assert.equal(env.controller.view(null).text, 'B at the finalization boundary');
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
  env.controller.edit(null, 'Keep after false ack');
  const latest = env.controller.view(null).draft;
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(JSON.parse(env.values.get(env.key)), recovery(entry(latest, null, latest)));
  assert.equal(env.controller.view(null).text, latest.text);
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
  env.controller.edit(null, 'Question');
  const latest = env.controller.view(null).draft;
  assert.equal(await env.controller.flush(), false);
  assert.deepEqual(env.durable, root());
  assert.equal(env.controller.view(null).text, latest.text);
  env.commitImpl = async (call) => {
    env.durable = consumeTeacherDraft(call.producer(env.durable), identity(latest));
    return false;
  };
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.view(null).text, '');
  assert.equal(env.controller.view(null).draft.consumed, true);
  assert.deepEqual(JSON.parse(env.values.get(env.key)).entries[0].latest, latest);
  env.controller.close();
  assert.equal(await env.start().recover(), true);
  assert.equal(env.calls.length, 2);
});

test('a true ack without durable publication is unconfirmed and does not trigger an automatic retry', async (t) => {
  const env = fixture(t);
  env.commitImpl = async () => true;
  env.controller.edit(null, 'No publication yet');
  const latest = env.controller.view(null).draft;
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.calls.length, 1);
  assert.equal(env.controller.state().issue, 'draft-commit-unconfirmed');
  assert.equal(env.controller.view(null).text, latest.text);
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
  assert.equal(env.controller.edit(null, '  Memory text after quota failure  '), false);
  const latest = env.controller.view(null).draft;
  assert.equal(env.controller.view(null).text, latest.text);
  assert.equal(env.controller.view(null).state, 'unavailable');
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
    assert.equal(env.controller.edit(null, 'New local question'), false);
    const latest = env.controller.view(null).draft;
    assert.equal(await env.controller.flush(), true);
    assert.deepEqual(env.durable, root(latest));
    env.controller.refresh();
    assert.equal(env.controller.state().issue, issue);
    assert.equal(env.values.get(env.key), slot);
    assert.equal(env.writes.length, 0);
    assert.equal(env.controller.view(null).text, latest.text);
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
  assert.equal(env.controller.view(null).text, latest.text);
});

test('keep/use storage failures retain the whole conflict without changing the durable root', async (t) => {
  const conflict = entry(draft(1, 'Recover'), draft(2, 'Base'));
  const current = draft(3, 'Current');
  const slot = JSON.stringify(recovery(conflict));
  const env = fixture(t, { drafts: root(current), slot });
  env.writeFails = true;
  assert.equal(await env.controller.resolve(null, 'keep'), false);
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.equal(await env.controller.resolve(null, 'use'), false);
  assert.deepEqual(env.controller.state().conflicts, [conflict]);
  assert.deepEqual(env.durable, root(current));
  assert.equal(env.values.get(env.key), slot);
  assert.equal(env.calls.length, 0);
});

test('close cancels debounce and revokes edits, storage writes and future queued producers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = fixture(t);
  env.controller.edit(null, 'Close before debounce');
  const savedSlot = env.values.get(env.key);
  const writes = env.writes.length;
  env.controller.close();
  const changes = env.changes;
  t.mock.timers.tick(60_000);
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.edit(null, 'After close'), false);
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
  env.controller.edit(topic(1), 'Owned edit');
  const flushing = env.controller.flush();
  await until(() => env.calls.length === 1);
  env.owner = false;
  const writes = env.writes.length;
  assert.throws(() => env.calls[0].producer(env.durable), /draft-owner-unavailable/u);
  env.owner = true;
  held.resolve(false);
  assert.equal(await flushing, false);
  assert.equal(env.controller.edit(topic(1), 'Cannot enter a new scope'), false);
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
  assert.equal(env.controller.edit(null, 'Keep but revoke'), false);
  assert.equal(env.controller.state().issue, 'draft-owner-unavailable');
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.calls.length, 0);
  assert.equal(env.writes.length, 1);
});

test('read failures retain known text and prevent recovery from unknown storage or invalid durable roots', async (t) => {
  const env = fixture(t);
  env.controller.edit(null, 'Known in-memory text');
  env.readFails = true;
  env.controller.refresh();
  assert.equal(env.controller.view(null).text, 'Known in-memory text');
  assert.equal(env.controller.state().issue, 'recovery-read-failed');
  assert.equal(await env.controller.recover(), false);
  env.getDraftsFails = true;
  assert.equal(await env.controller.flush(), false);
  assert.equal(env.controller.state().issue, 'durable-drafts-unavailable');
  assert.equal(env.calls.length, 0);
});

test('default revisions use UUIDs and returned view/state objects are immutable snapshots', async (t) => {
  const env = fixture(t, { customRevision: false });
  assert.equal(env.controller.edit(null, '😀 raw text'), true);
  const view = env.controller.view(null);
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
  assert.equal(env.controller.edit('not-a-context', ''), false);
  assert.equal(env.controller.view(null).text, '😀 raw text');
  assert.equal(await env.controller.flush(), true);
  assert.deepEqual(clone(env.durable.entries[0]), view.draft);
});
