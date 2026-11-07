/* global structuredClone */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createBunkiStudyAdapter } from '../prototypes/corridor/study-engine-adapter.mjs';
import { decodeSharedContent, SHARED_DECKS } from '../prototypes/corridor/shared-study-content.mjs';
import { bindStudyPresentation } from '../prototypes/corridor/shared-study-presentation.mjs';
import * as api from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
import * as schedulerApi from '../prototypes/corridor/vendor/shared-study-engine/client/vendor/engine.js';
import * as fsrs from '../prototypes/corridor/vendor/shared-study-engine/client/vendor/ts-fsrs.mjs';
import { seedBunkiBacklog } from '../scripts/shared-study-backlog-fixture.mjs';

const root = new URL('../prototypes/corridor/', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root)));
const pin = read('vendor/shared-study-engine/client/vendor/fsrs-pin.json');
const content = decodeSharedContent(
  read('data/shared-study-content.json'),
  Object.fromEntries(SHARED_DECKS.map((id) => [id, read(`decks/${id}/deck.json`)])),
  pin,
);
const AT = Date.parse('2026-11-02T03:00:00Z'),
  ids = (entries) => entries.map((entry) => entry.taskKey);
async function fixture() {
  const supplied = structuredClone(content);
  let seeded,
    writes = 0;
  const adapter = await createBunkiStudyAdapter({
    content: supplied,
    storage: api.createMemoryAdapter({
      afterCommit: () => {
        writes++;
      },
    }),
    identity: {
      learner: 'test-bunki-backlog',
      environment: 'test-bunki-backlog',
      installation: 'test-bunki-backlog-local',
      mode: 'fresh',
    },
    now: () => AT,
    initialize: async ({ store, engine }) => {
      seeded = await seedBunkiBacklog({ store, engine, api, schedulerApi, fsrs, pin, at: AT });
    },
  });
  return { adapter, supplied, seeded, writes: () => writes };
}

describe('Bunki host backlog connection after canonical re-pin', () => {
  it('uses the frozen accepted pin through the actual host and presentation wrapper before the 50 cutoff', async () => {
    const f = await fixture();
    try {
      const backend = f.adapter.backend,
        view = bindStudyPresentation(backend, f.adapter.catalog);
      const before = api.canonicalStringify(await f.adapter.store.readState()),
        writes = f.writes();
      const normal = ids(view.queue({ module: 'n2' }));
      expect(normal).toEqual(f.seeded.keys);
      expect(normal.at(59)).toBe(f.seeded.expected[0]);
      // Alter the caller's old object before the first ranked request. The
      // connection must retain the accepted canonical content.pin snapshot.
      f.supplied.pin.w[0] = 999;
      const ranked = ids(view.queue({ module: 'n2', backlog: true }));
      expect(ranked.slice(0, 50)).toEqual(f.seeded.expected.slice(0, 50));
      expect(ranked[0], 'weakest old-position60 review must lead Study50').toBe(normal[59]);
      expect(ranked.slice(0, 50)).not.toEqual(normal.slice(0, 50));
      expect(ids(view.queue({ module: 'n2', backlog: true }))).toEqual(ranked);
      expect(ids(view.queue({ module: 'n2' }))).toEqual(normal);
      expect(f.writes()).toBe(writes);
      expect(api.canonicalStringify(await f.adapter.store.readState())).toBe(before);
      expect(f.adapter.platform.canRequestNewCards()).toBe(false);
      expect(f.adapter.platform.requestNewCards).toBeUndefined();
      expect(backend.readProjection().permits).toEqual({});
    } finally {
      f.adapter.backend.dispose();
    }
  });

  it('keeps backlog rank after a real chosen review without new permits, settings or legacy authority', async () => {
    const f = await fixture();
    try {
      const { backend, store } = f.adapter,
        before = await store.readState();
      const first = backend.queue({ module: 'n2', backlog: true })[0];
      expect(first.taskKey).toBe(f.seeded.expected[0]);
      const intent = backend.reviewIntent(backend.snapshotAttempt(first.taskKey), 4, 1000);
      const result = await backend.submitCommand(intent);
      expect(result).toMatchObject({
        kind: 'durable',
        persisted: true,
        outcome: { status: 'applied' },
      });
      expect(
        backend.readProjection().reviews.find((row) => row.id === result.eventId),
      ).toMatchObject({ rawRating: 4, effectiveRating: 4 });
      expect(backend.queue({ module: 'n2', backlog: true })[0].taskKey).toBe(f.seeded.expected[1]);
      const after = await store.readState(),
        reviews = Object.values(after.local).filter((row) => row.event.type === 'review');
      expect(reviews).toHaveLength(1);
      expect(reviews[0].event.data).toMatchObject({
        taskKey: first.taskKey,
        rawRating: 4,
        ratingPolicy: 'chosen-v1',
      });
      expect(after.projection.permits).toEqual(before.projection.permits);
      expect(after.projection.settings).toEqual(before.projection.settings);
      expect(after.locallyDurable - before.locallyDurable).toBe(1);
    } finally {
      f.adapter.backend.dispose();
    }
  });

  it('keeps long answers at the chosen rating and plain target lookups schedule-neutral', async () => {
    const f = await fixture();
    try {
      const { backend, store } = f.adapter,
        entry = backend.queue({ module: 'n2', backlog: true })[0];
      const attempt = backend.snapshotAttempt(entry.taskKey),
        before = structuredClone(backend.readProjection().tasks[entry.taskKey]);
      const surface = entry.form || entry.term,
        start = entry.ja.indexOf(surface);
      expect(start).toBeGreaterThanOrEqual(0);
      const capture = {
        surface,
        kind: 'lookup',
        location: 'passage',
        contextTaskKey: entry.taskKey,
        contentRevision: attempt.contentRevision,
        revealed: true,
        span: { start, end: start + surface.length, unit: 'utf16-code-unit' },
        targetTaskKey: entry.taskKey,
        source: { context: entry.ja },
      };
      const observed = await backend.submitCommand(backend.captureCommand(attempt, capture));
      expect(observed.kind).toBe('durable');
      expect(backend.readProjection().tasks[entry.taskKey]).toEqual(before);
      const intent = backend.reviewIntent(attempt, 3, 95000);
      expect(intent.data.ratingPolicy).toBe('chosen-v1');
      expect(intent.data.attempt.thinkMs).toBe(95000);
      expect(intent.data.hesitation.signalIds).toContain(observed.eventId);
      expect(Object.hasOwn(intent.data, 'boost')).toBe(false);
      const saved = await backend.submitCommand(intent);
      expect(saved.kind).toBe('durable');
      expect(
        backend.readProjection().reviews.find((row) => row.id === saved.eventId),
      ).toMatchObject({ rawRating: 3, effectiveRating: 3 });
      const rows = Object.values((await store.readState()).local);
      expect(rows.map((row) => row.event.type)).toEqual(['capture', 'review']);
      expect(backend.readProjection().boostSources).toEqual({});
    } finally {
      f.adapter.backend.dispose();
    }
  });
});
