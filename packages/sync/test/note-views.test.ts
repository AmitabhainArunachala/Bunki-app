import { canonicalJson } from '@bunki/domain/canonical-json';
import { describe, expect, it } from 'vitest';

import {
  createReplica,
  operationReference,
  type RecordOperation,
  type SyncReplica,
} from '../src/index.ts';
import { readNoteViews, type NoteVersionPayload, type NoteView } from '../src/note-views.ts';
import {
  exam,
  HASH,
  merged,
  nextOp,
  note,
  op,
  permutations,
  policy,
  receive,
  resume,
  review,
} from './fixtures.ts';

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const first = items[0];
  if (first === undefined) throw new Error('missing fixture result');
  return first;
}
function notePayload(
  noteId = 'note-1',
  versionId = 'version-1',
  text = '猫を見た。',
): NoteVersionPayload {
  const payload = note(noteId, versionId, text);
  if (payload.kind !== 'note.version') throw new Error('wrong fixture kind');
  return payload;
}
function view(replica: SyncReplica, noteId = 'note-1'): NoteView {
  const result = readNoteViews(replica).find((candidate) => candidate.noteId === noteId);
  if (!result) throw new Error('missing fixture note view');
  return result;
}
const deletion: RecordOperation = {
  kind: 'entity.tombstone',
  target: { kind: 'note', id: 'note-1' },
  reason: 'user-deleted',
};

describe('note views from the complete current replica projection', () => {
  it('returns no notes for an empty journal or other operation families', () => {
    expect(readNoteViews(createReplica(policy))).toEqual([]);
    expect(
      readNoteViews(merged(op(resume(10)), op(exam(), 'exam'), op(review(), 'review'))),
    ).toEqual([]);
  });

  it('keeps both concurrent edits across reordered duplicate deliveries and backwards clocks', () => {
    const base = op(note());
    const left = nextOp(base, {
      ...notePayload('note-1', 'left', 'Mac edit'),
      supersedes: [operationReference(base)],
    });
    const right = op(
      {
        ...notePayload('note-1', 'right', 'Phone edit'),
        supersedes: [operationReference(base)],
      },
      'iphone',
      { occurredAt: '2020-01-01T00:00:00.000Z' },
    );
    const expected = readNoteViews(merged(base, left, right));
    for (const order of permutations([base, left, right])) {
      let replica = createReplica(policy);
      for (const operation of order) replica = receive(replica, operation, operation);
      expect(readNoteViews(replica)).toEqual(expected);
    }
    const result = only(expected);
    expect(result.headVersions.map((version) => version.payload)).toEqual(
      expect.arrayContaining([left.payload, right.payload]),
    );
    expect(result.headVersions).toHaveLength(2);
    expect(result.projection.requiresChoice).toBe(true);
    expect(result.projection.versions).toHaveLength(3);
  });

  it('groups equal payload choices while preserving every independent provenance reference', () => {
    const first = op(note());
    const copied = op(note(), 'iphone', { occurredAt: '2020-01-01T00:00:00.000Z' });
    const replica = receive(merged(first, copied), first, copied, first);
    const result = view(replica);
    const head = only(result.headVersions);
    expect(head.payload).toEqual(first.payload);
    expect(head.payloadSha256).toBe(first.payloadSha256);
    expect(head.operationRefs).toEqual(result.projection.heads);
    expect(head.operationRefs).toEqual(
      expect.arrayContaining([operationReference(first), operationReference(copied)]),
    );
    expect(head.operationRefs).toHaveLength(2);
    expect(result.projection.requiresChoice).toBe(false);
    expect(result.projection.identityConflicts).toEqual([]);
  });

  it('follows explicit supersession of an equal-payload version while retaining all active references', () => {
    const first = op(note());
    const copied = op(note(), 'iphone');
    const edit = nextOp(first, {
      ...notePayload('note-1', 'edited', 'Explicit replacement'),
      supersedes: [operationReference(first)],
    });
    const result = view(merged(copied, edit, first));
    expect(only(result.headVersions).payload).toEqual(edit.payload);
    expect(only(result.headVersions).operationRefs).toEqual([operationReference(edit)]);
    expect(result.projection.versions).toHaveLength(3);
    expect(result.projection.requiresChoice).toBe(false);
  });

  it('does not replace a head merely because a later operation knows its predecessor', () => {
    const first = op(note());
    const later = nextOp(first, note('note-1', 'later', 'No supersession claim'));
    const result = view(merged(later, first));
    expect(result.headVersions).toHaveLength(2);
    expect(result.projection.requiresChoice).toBe(true);
  });

  it('keeps delayed edits invisible until their exact prerequisites become ready', () => {
    const first = op(note());
    const edit = nextOp(first, {
      ...notePayload('note-1', 'edited'),
      supersedes: [operationReference(first)],
    });
    const pending = merged(edit);
    expect(pending.pending).toHaveLength(1);
    expect(readNoteViews(pending)).toEqual([]);
    const released = receive(pending, first);
    expect(released.pending).toEqual([]);
    expect(only(view(released).headVersions).payload).toEqual(edit.payload);
    expect(readNoteViews(pending)).toEqual([]);
  });

  it('never exposes quarantined arrivals or their descendants as content or identity conflicts', () => {
    const first = op(note());
    const corrupt = op(note('note-1', 'version-1', 'Corrupt pending replacement'), 'mac', {
      actor: { ...first.actor, sequence: 2 },
      predecessor: { opId: first.opId, sha256: HASH },
    });
    const descendant = nextOp(corrupt, note('dependent-note'));
    const waiting = merged(descendant, corrupt);
    expect(readNoteViews(waiting)).toEqual([]);
    const resolved = receive(waiting, first);
    expect(resolved.quarantined).toHaveLength(2);
    const result = only(readNoteViews(resolved));
    expect(result.noteId).toBe('note-1');
    expect(only(result.headVersions).operationRefs).toEqual([operationReference(first)]);
    expect(result.projection.identityConflicts).toEqual([]);
  });

  it('keeps a current tombstone dominant over serialized stale backup and future-clock content', () => {
    const first = op(note());
    const tombstone = nextOp(first, deletion);
    const staleCopy = JSON.parse(canonicalJson(first)) as unknown;
    const offlineEdit = op(
      note('note-1', 'stale-version', 'Offline old generation'),
      'third-device',
      {
        occurredAt: '2099-01-01T00:00:00.000Z',
      },
    );
    const replica = receive(merged(first, tombstone), staleCopy, offlineEdit);
    const result = view(replica);
    expect(result.headVersions).toEqual([]);
    expect(result.projection.heads).toEqual([]);
    expect(result.projection.versions).toEqual([]);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(result.projection.activeRestoreGenerations).toEqual([]);
    expect(replica.operations).toHaveLength(3);
  });

  it('represents tombstone-only and restore-only notes without resurrecting any content', () => {
    const tombstone = op(deletion);
    const restore = nextOp(tombstone, {
      kind: 'entity.restore',
      target: deletion.target,
      tombstones: [operationReference(tombstone)],
      reason: 'Explicit restore',
    });
    expect(readNoteViews(merged(restore))).toEqual([]);
    const deleted = view(merged(tombstone));
    expect(deleted.headVersions).toEqual([]);
    expect(deleted.projection.tombstones).toEqual([operationReference(tombstone)]);
    const restored = view(merged(restore, tombstone));
    expect(restored.headVersions).toEqual([]);
    expect(restored.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
  });

  it('shows only explicitly restored content and hides it when another tombstone defeats the generation', () => {
    const first = op(note());
    const tombstone = nextOp(first, deletion);
    const restore = op(
      {
        kind: 'entity.restore',
        target: deletion.target,
        tombstones: [operationReference(tombstone)],
        reason: 'Explicit restore',
      },
      'iphone',
    );
    const restored = nextOp(restore, {
      ...notePayload('note-1', 'restored', 'Restored text'),
      generation: operationReference(restore),
    });
    const replica = merged(restored, first, restore, tombstone);
    const active = view(replica);
    expect(only(active.headVersions).payload).toEqual(restored.payload);
    expect(active.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(active.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
    const laterDeletion = op(deletion, 'third-device');
    const hidden = view(receive(replica, laterDeletion, first));
    expect(hidden.headVersions).toEqual([]);
    expect(hidden.projection.activeRestoreGenerations).toEqual([]);
    expect(hidden.projection.tombstones).toHaveLength(2);
  });

  it('preserves ambiguous version identities even after their content is hidden', () => {
    const first = op(note());
    const conflicting = op(
      note('note-1', 'version-1', 'Different immutable version bytes'),
      'iphone',
    );
    const replica = merged(first, conflicting);
    const result = view(replica);
    expect(result.headVersions).toHaveLength(2);
    expect(result.projection.requiresChoice).toBe(true);
    expect(result.projection.identityConflicts).toEqual([
      { versionId: 'version-1', operations: replica.ready },
    ]);
    const hidden = view(receive(replica, nextOp(first, deletion)));
    expect(hidden.headVersions).toEqual([]);
    expect(hidden.projection.requiresChoice).toBe(false);
    expect(hidden.projection.identityConflicts).toEqual(result.projection.identityConflicts);
  });

  it('preserves original and source-quote segments exactly without promoting a declared sync basis', () => {
    const quote = '猫😀e\u0301';
    const payload: NoteVersionPayload = {
      ...notePayload(),
      segments: [
        { kind: 'original', text: 'My own e\u0301 observation.\r\n' },
        {
          kind: 'source-quote',
          text: quote,
          source: { sourceId: 'source-é', versionId: 'v-e\u0301', sha256: HASH },
          position: {
            kind: 'text',
            unit: 'utf16',
            start: 7,
            end: 7 + quote.length,
            bodyLength: 100,
          },
          deviceSyncBasis: { basisId: 'declared-only', policyVersion: 'unverified-source-policy' },
        },
        { kind: 'original', text: '\nSeparate concluding thought.' },
      ],
    };
    const operation = op(payload);
    const head = only(view(merged(operation)).headVersions);
    expect(canonicalJson(head.payload)).toBe(canonicalJson(payload));
    expect(head.payload.segments).toEqual(payload.segments);
    expect(head.operationRefs).toEqual([operationReference(operation)]);
    expect(head).not.toHaveProperty('sourceAdmission');
    expect(head).not.toHaveProperty('authority');
  });

  it('keeps opaque Unicode note/version IDs and reserved-looking IDs distinct', () => {
    const composed = 'café';
    const decomposed = 'cafe\u0301';
    const first = op(note(composed, 'v-é', 'Composed note'));
    const second = op(note(decomposed, 'v-é', 'Decomposed note'), 'phone');
    const reserved = op(note('__proto__', 'constructor', 'Own note identity'), 'tablet');
    const variant = op(note(composed, 'v-e\u0301', 'Different opaque version name'), 'desktop');
    const replica = merged(first, second, reserved, variant);
    const results = readNoteViews(replica);
    expect(results).toHaveLength(3);
    expect(results.map((item) => item.noteId)).toEqual(
      expect.arrayContaining([composed, decomposed, '__proto__']),
    );
    const named = view(replica, composed);
    expect(named.headVersions.map((head) => head.payload.versionId)).toEqual(
      expect.arrayContaining(['v-é', 'v-e\u0301']),
    );
    expect(named.projection.identityConflicts).toEqual([]);
    expect(named.projection.requiresChoice).toBe(true);
    expect(only(view(replica, decomposed).headVersions).payload).toEqual(second.payload);
  });

  it('uses the complete retained journal across more than one receive batch', () => {
    const operations = Array.from({ length: 1005 }, (_, index) =>
      op(note(`note-${index}`), `device-${index}`),
    );
    let replica = receive(createReplica(policy), ...operations.slice(0, 1000));
    replica = receive(replica, ...operations.slice(1000));
    const results = readNoteViews(replica);
    expect(results).toHaveLength(1005);
    expect(view(replica, 'note-0').headVersions).toHaveLength(1);
    expect(view(replica, 'note-1004').headVersions).toHaveLength(1);
  });

  it('leaves all input state unchanged and returns deeply immutable views', () => {
    const replica = merged(op(note()), op(note(), 'iphone'));
    const before = canonicalJson(replica);
    const result = only(readNoteViews(replica));
    const head = only(result.headVersions);
    expect(result.projection).toEqual(only(replica.projection.entities));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(head.operationRefs)).toBe(true);
    expect(Object.isFrozen(head.payload.segments)).toBe(true);
    expect(Reflect.set(only(head.payload.segments), 'text', 'Changed outside the planner')).toBe(
      false,
    );
    expect(Reflect.set(head.operationRefs, '0', { opId: HASH, sha256: HASH })).toBe(false);
    expect(Reflect.deleteProperty(result.projection, 'tombstones')).toBe(false);
    expect(canonicalJson(replica)).toBe(before);
    expect(readNoteViews(replica)).toEqual([result]);
    expect(replica.projection.scheduling).toBe('not-computed');
  });

  it('rejects serialized, shallow, getter-bearing and proxy lookalikes before reading their fields', () => {
    const replica = merged(op(note()));
    const serialized = JSON.parse(canonicalJson(replica)) as SyncReplica;
    let reads = 0;
    const getterBearing = {
      get policy() {
        reads += 1;
        throw new Error('policy must not be read');
      },
      get operations() {
        reads += 1;
        throw new Error('payload must not be read');
      },
      get projection() {
        reads += 1;
        throw new Error('projection must not be read');
      },
    } as unknown as SyncReplica;
    const proxy = new Proxy(replica, {
      get() {
        reads += 1;
        throw new Error('proxy must not be read');
      },
    });
    for (const forged of [serialized, { ...replica }, getterBearing, proxy]) {
      expect(() => readNoteViews(forged)).toThrow(
        expect.objectContaining({ code: 'invalid-replica' }),
      );
    }
    expect(reads).toBe(0);
    expect(view(replica).headVersions).toHaveLength(1);
  });
});
