/* global structuredClone */
import { URL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBunkiStudyAdapter } from '../prototypes/corridor/study-engine-adapter.mjs';
import {
  createStudyEngine,
  canonicalStringify,
  dayBounds,
  payloadHash,
  studyDayAllowance,
  validateEvent,
} from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';

const root = new URL('../prototypes/corridor/', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const contract = readJson('tools/fixtures/shared-srs-contracts.json');
const pin = readJson('vendor/shared-study-engine/client/vendor/fsrs-pin.json');
const NOW = Date.parse(contract.scope.clock.initial);
const cards = new Map(contract.cards.map((card) => [card.id, card]));
const content = {
  pin,
  catalog: contract.cards,
  registry: {
    tasks: contract.cards.map(({ taskKey, noteGuid, contractId, passageId, lexemeId }) => ({
      taskKey,
      noteGuid,
      contractId,
      passageId,
      lexemeId,
    })),
    notes: contract.cards.map(({ noteGuid, module }) => ({ noteGuid, module })),
    passages: [],
    examples: [],
  },
};
const scheduleFields = ['tasks', 'reviews', 'permits', 'introductions', 'boostSources'];

function memoryAdapter() {
  const states = new Map();
  const key = (scope) => JSON.stringify([scope.environment, scope.learner, scope.installation]);
  return Object.freeze({
    async read(scope) {
      const state = states.get(key(scope));
      return state === undefined ? null : structuredClone(state);
    },
    async compareAndSwap(scope, revision, candidate) {
      const storageKey = key(scope);
      const current = states.get(storageKey);
      if ((current?.storageRevision ?? null) !== revision) return false;
      states.set(storageKey, structuredClone(candidate));
      return true;
    },
  });
}

function createAuthority() {
  const envelopes = [];
  let permitNumber = 0;
  return {
    envelopes,
    reserve(state, count) {
      expect(state.head).toBe(state.appliedSeq);
      expect(state.blocked).toBeNull();
      expect(Object.keys(state.local)).toHaveLength(0);
      const { limit, ...bounds } = studyDayAllowance(state.projection, NOW);
      const allocated = state.projection.permitGrants
        .filter((grant) => grant.startsAt < bounds.endsAt && grant.endsAt > bounds.startsAt)
        .reduce((total, grant) => total + grant.count, 0);
      if (allocated + count > limit) return { kind: 'refused', reason: 'daily-permit-budget' };
      const seq = envelopes.length + 1;
      const event = {
        v: contract.provenance.eventVersion,
        id: `@server:${seq}`,
        learner: contract.scope.learner,
        install: '@server',
        dseq: seq,
        base: seq - 1,
        ts: NOW,
        epoch: contract.scope.epoch,
        policy: contract.provenance.policyId,
        type: 'permit-grant',
        data: {
          install: state.scope.installation,
          permitIds: Array.from({ length: count }, () => `fixture-permit-${++permitNumber}`),
          ...dayBounds(NOW, contract.scope.clock.learnerTimezone),
        },
      };
      expect(validateEvent(event, { allowServer: true })).toEqual({
        ok: true,
        unsupported: false,
        errors: [],
      });
      envelopes.push({ seq, rt: NOW, authority: 'server', event, bodyHash: payloadHash(event) });
      return { kind: 'durable', eventId: event.id, eventSeq: seq };
    },
  };
}

async function createWorld(kind) {
  const devices = {};
  for (const [device, installation] of Object.entries(contract.scope.installations)) {
    const storage = memoryAdapter();
    let uuidNumber = 0;
    const now = () => NOW;
    const uuid = () => `${installation}-uuid-${++uuidNumber}`;
    const identity = {
      learner: contract.scope.learner,
      environment: contract.scope.environment,
      installation,
      epoch: contract.scope.epoch,
      timezone: contract.scope.clock.learnerTimezone,
      mode: 'fresh',
    };
    if (kind === 'bunki') {
      const adapter = await createBunkiStudyAdapter({ content, storage, identity, now, uuid });
      devices[device] = { engine: adapter.engine, store: adapter.store, backend: adapter.backend };
    } else {
      const engine = createStudyEngine({
        content,
        learner: identity.learner,
        epoch: identity.epoch,
        timezone: identity.timezone,
      });
      const store = await engine.createFreshStore({
        adapter: storage,
        environment: identity.environment,
        newInstallationId: () => installation,
        now,
      });
      const backend = await engine.connect({ store, now, uuid });
      devices[device] = { engine, store, backend };
    }
  }
  return { devices, values: {}, authority: createAuthority() };
}

function resolveReferences(value, world, action, variant) {
  if (value === '$rating') return variant.rating;
  if (typeof value === 'string') {
    if (value.startsWith('$card.')) return cards.get(action.card)[value.slice(6)];
    if (value.startsWith('$attempt.')) return world.values[action.attempt][value.slice(9)];
    const result = /^\$([A-Za-z][A-Za-z0-9]*)\.eventId$/.exec(value);
    if (result) return world.values[result[1]].eventId;
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) => resolveReferences(item, world, action, variant));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveReferences(item, world, action, variant),
      ]),
    );
  }
  return value;
}

async function performAction(world, action, variant) {
  const host = action.device ? world.devices[action.device] : null;
  const save = (value) => {
    if (action.as) world.values[action.as] = value;
    return value;
  };
  switch (action.op) {
    case 'reservePermits': {
      const state = await host.store.readState();
      const result = world.authority.reserve(state, action.count);
      if (result.kind === 'durable') {
        await host.store.reconcile({
          events: world.authority.envelopes,
          head: world.authority.envelopes.length,
        });
        await host.backend.refresh();
      }
      return save(result);
    }
    case 'syncAll': {
      for (const device of Object.values(world.devices)) {
        await device.store.reconcile({
          events: world.authority.envelopes,
          head: world.authority.envelopes.length,
        });
        await device.backend.refresh();
      }
      return undefined;
    }
    case 'snapshotAttempt':
      return save(host.backend.snapshotAttempt(cards.get(action.card).taskKey, action.options));
    case 'preview':
      return save(host.backend.preview(world.values[action.attempt], action.thinkMs));
    case 'submitPreview': {
      const intent =
        world.values[action.preview].intents[
          resolveReferences(action.rating, world, action, variant)
        ];
      expect(Object.isFrozen(intent)).toBe(true);
      return save(await host.backend.submitCommand(intent));
    }
    case 'makeReviewCommand': {
      const make = () =>
        host.backend.reviewData(
          world.values[action.attempt],
          resolveReferences(action.rating, world, action, variant),
          action.thinkMs,
        );
      if (action.expectError) {
        let error;
        try {
          make();
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe(action.expectError);
        expect(world.values[action.as]).toBeUndefined();
        return undefined;
      }
      const command = host.backend.command('review', make());
      expect(Object.isFrozen(command)).toBe(true);
      expect(Object.isFrozen(command.data)).toBe(true);
      return save(command);
    }
    case 'submitCommand':
      return save(await host.backend.submitCommand(world.values[action.command]));
    case 'submitChangedRetry': {
      const command = world.values[action.command];
      return save(await host.backend.submitCommand({ ...command, ts: command.ts + 1 }));
    }
    case 'mutate':
      return save(
        await host.backend.mutate(
          action.type,
          cards.get(action.card).taskKey,
          resolveReferences(action.data, world, action, variant),
        ),
      );
    case 'practice':
      return save(
        await host.backend.practice(
          world.values[action.attempt],
          resolveReferences(action.rating, world, action, variant),
          action.thinkMs,
        ),
      );
    case 'capture':
      return save(
        await host.backend.capture(
          world.values[action.attempt],
          resolveReferences(action.capture, world, action, variant),
        ),
      );
    case 'checkpoint': {
      const state = await host.store.readState();
      return save({
        projection: structuredClone(host.backend.readProjection()),
        status: await host.store.status(),
        head: state.head,
        applied: state.appliedSeq,
        canonicalCount: Object.keys(state.canonical).length,
        localCount: Object.keys(state.local).length,
      });
    }
    default:
      throw new Error(`unknown-fixture-operation:${action.op}`);
  }
}

function findEvent(state, eventId) {
  return (
    state.local[eventId] ?? Object.values(state.canonical).find((row) => row.event.id === eventId)
  );
}

async function assertInvariant(world, invariant, variant) {
  const host = invariant.device ? world.devices[invariant.device] : null;
  const projection = host?.backend.readProjection();
  const value = (name) => world.values[name];
  switch (invariant.invariant) {
    case 'result': {
      const result = value(invariant.result);
      if (Object.hasOwn(invariant, 'kind')) expect(result.kind).toBe(invariant.kind);
      if (Object.hasOwn(invariant, 'reason')) expect(result.reason).toBe(invariant.reason);
      return;
    }
    case 'reviewCount':
      expect(projection.reviews).toHaveLength(invariant.value);
      return;
    case 'reviewRating': {
      expect(projection.reviews).toHaveLength(1);
      const review = projection.reviews[0];
      expect(review.rawRating).toBe(
        resolveReferences(invariant.rawRating, world, invariant, variant),
      );
      expect(review.effectiveRating).toBe(
        resolveReferences(invariant.effectiveRating, world, invariant, variant),
      );
      const event = findEvent(await host.store.readState(), review.id).event;
      expect(Object.hasOwn(event.data, 'effectiveRating')).toBe(false);
      return;
    }
    case 'previewMatchesCommitted': {
      expect(projection.reviews).toHaveLength(1);
      const preview = value(invariant.preview);
      const result = value(invariant.result);
      const rating = resolveReferences(invariant.rating, world, invariant, variant);
      const review = projection.reviews[0];
      expect(review.id).toBe(result.eventId);
      expect(canonicalStringify(projection.tasks[cards.get(invariant.card).taskKey].card)).toBe(
        canonicalStringify(preview.cards[rating]),
      );
      expect({ effectiveRating: review.effectiveRating, at: review.at }).toEqual(
        preview.ratings[rating],
      );
      return;
    }
    case 'permitUse': {
      const installation = contract.scope.installations[invariant.device];
      const permits = Object.values(projection.permits).filter(
        (permit) => permit.install === installation,
      );
      expect(permits.filter((permit) => permit.usedBy !== null)).toHaveLength(invariant.used);
      if (Object.hasOwn(invariant, 'issued')) expect(permits).toHaveLength(invariant.issued);
      return;
    }
    case 'undoRestoresNewCard': {
      const task = projection.tasks[cards.get(invariant.card).taskKey];
      const reviewResult = value(invariant.review);
      const undoResult = value(invariant.undo);
      expect(task.card).toBeNull();
      expect(task.head).toBe(undoResult.eventId);
      expect(projection.reviews).toHaveLength(1);
      expect(projection.reviews[0].id).toBe(reviewResult.eventId);
      expect(projection.reviews[0].undoneAt).not.toBeNull();
      expect(
        Object.values(projection.permits).filter(
          (permit) => permit.usedBy === reviewResult.eventId,
        ),
      ).toHaveLength(1);
      return;
    }
    case 'sharedBudget': {
      for (const [device, installation] of Object.entries(contract.scope.installations)) {
        const deviceHost = world.devices[device];
        const current = deviceHost.backend.readProjection();
        expect(deviceHost.backend.todayAllowance().limit).toBe(invariant.limit);
        expect(studyDayAllowance(current, NOW).limit).toBe(invariant.limit);
        const bounds = dayBounds(NOW, contract.scope.clock.learnerTimezone);
        const allocated = current.permitGrants
          .filter((grant) => grant.startsAt < bounds.endsAt && grant.endsAt > bounds.startsAt)
          .reduce((total, grant) => total + grant.count, 0);
        expect(allocated).toBe(invariant.allocated);
        const permits = Object.values(current.permits).filter(
          (permit) => permit.install === installation,
        );
        const used = permits.filter((permit) => permit.usedBy !== null).length;
        expect(permits).toHaveLength(invariant[`${device}Issued`]);
        expect(used).toBe(invariant[`${device}Used`] ?? 0);
        expect(permits.length - used).toBe(
          invariant[`${device}Unused`] ?? invariant[`${device}Issued`] - used,
        );
      }
      return;
    }
    case 'sameEvent': {
      const first = value(invariant.first);
      const retry = value(invariant.retry);
      expect({ eventId: retry.eventId, dseq: retry.dseq, eventTs: retry.eventTs }).toEqual({
        eventId: first.eventId,
        dseq: first.dseq,
        eventTs: first.eventTs,
      });
      expect(projection.reviews).toHaveLength(1);
      expect((await host.store.status()).locallyDurable).toBe(
        value(invariant.checkpoint).status.locallyDurable,
      );
      return;
    }
    case 'noNewDurableEvent': {
      const checkpoint = value(invariant.checkpoint);
      const state = await host.store.readState();
      const status = await host.store.status();
      expect({ head: status.head, locallyDurable: status.locallyDurable }).toEqual({
        head: checkpoint.head,
        locallyDurable: checkpoint.status.locallyDurable,
      });
      expect(Object.keys(state.canonical)).toHaveLength(checkpoint.canonicalCount);
      expect(Object.keys(state.local)).toHaveLength(checkpoint.localCount);
      return;
    }
    case 'localEventDelta': {
      const checkpoint = value(invariant.checkpoint);
      expect((await host.store.status()).locallyDurable - checkpoint.status.locallyDurable).toBe(
        invariant.value,
      );
      return;
    }
    case 'noScheduleMutation': {
      const before = value(invariant.checkpoint).projection;
      for (const field of scheduleFields) {
        expect(canonicalStringify(projection[field])).toBe(canonicalStringify(before[field]));
      }
      return;
    }
    case 'captureCount':
      expect(projection.captures).toHaveLength(invariant.value);
      return;
    case 'practiceEvidence': {
      const result = value(invariant.result);
      const event = findEvent(await host.store.readState(), result.eventId).event;
      expect(event.type).toBe('review');
      expect(event.data.attempt).toMatchObject({
        mode: 'practice',
        revealed: true,
        helpBeforeAnswer: false,
      });
      expect(projection.outcomes[result.eventId]).toMatchObject({
        status: 'observation',
        reason: 'practice-or-assisted',
      });
      return;
    }
    case 'crossHostParity':
      return;
    default:
      throw new Error(`unknown-fixture-invariant:${invariant.invariant}`);
  }
}

function independentReplay(host, state) {
  const canonical = Object.values(state.canonical)
    .filter((row) => row.seq <= state.appliedSeq)
    .sort((a, b) => a.seq - b.seq);
  const provisional = Object.values(state.local)
    .sort((a, b) => a.event.dseq - b.event.dseq)
    .map(({ event, bodyHash }) => ({ event, bodyHash }));
  return host.engine.replay(canonical, {
    provisional,
    provisionalNow: Math.max(NOW, ...provisional.map((row) => row.event.ts)),
  });
}

async function executeScenario(kind, scenario, variant) {
  const world = await createWorld(kind);
  try {
    for (const action of contract.setups[scenario.setup] ?? [])
      await performAction(world, action, variant);
    for (const action of scenario.actions) await performAction(world, action, variant);
    for (const invariant of scenario.expect) await assertInvariant(world, invariant, variant);
    const devices = {};
    for (const [name, host] of Object.entries(world.devices)) {
      const state = await host.store.readState();
      const projection = host.backend.readProjection();
      expect(canonicalStringify(projection)).toBe(canonicalStringify(state.projection));
      expect(canonicalStringify(independentReplay(host, state))).toBe(
        canonicalStringify(state.projection),
      );
      devices[name] = { state, projection: structuredClone(projection) };
    }
    return { values: structuredClone(world.values), devices };
  } finally {
    for (const host of Object.values(world.devices)) host.backend.dispose();
  }
}

function assertCrossHostParity(canonical, bunki) {
  expect(canonicalStringify(bunki.values)).toBe(canonicalStringify(canonical.values));
  for (const device of Object.keys(canonical.devices)) {
    expect(canonicalStringify(bunki.devices[device].state)).toBe(
      canonicalStringify(canonical.devices[device].state),
    );
    expect(canonicalStringify(bunki.devices[device].projection)).toBe(
      canonicalStringify(canonical.devices[device].projection),
    );
  }
}

describe('synthetic shared SRS fixture execution through canonical and Bunki consumers', () => {
  for (const scenario of contract.scenarios) {
    for (const variant of scenario.variants ?? [{}]) {
      const title = variant.rating
        ? `${scenario.id}: rating ${variant.rating} (${contract.scope.ratings[variant.rating]})`
        : scenario.id;
      it(title, async () => {
        const canonical = await executeScenario('canonical', scenario, variant);
        const bunki = await executeScenario('bunki', scenario, variant);
        assertCrossHostParity(canonical, bunki);
      });
    }
  }
});
