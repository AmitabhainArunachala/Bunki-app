/**
 * Durability at the app level (WP-10; T-01, T-16-web).
 *
 * ## Why this file exists when `@bunki/persistence` already has durability tests
 *
 * Those tests prove the *adapter* survives a restart. They prove nothing about
 * the app, and the two can be true and false independently: a store that never
 * journals, a projection that never rehydrates, or a boot path that builds the
 * command handler before reading the log would each leave the package's tests
 * green and the learner's captures gone. The definition-of-done names that gap —
 * "tests pass but the app doesn't" — so T-01 ("saving is immediate and durable,
 * survives reload") and T-16-web are asserted here, against the object the
 * screens actually hold.
 *
 * ## What a "reload" is here
 *
 * A second `createDurableAppStore` over the same snapshot store. That is exactly
 * what a page reload does to the provisional web adapter — reopening it restores
 * from the snapshot — so the simulation is the real code path rather than a
 * mock of it. The snapshot store is a plain object because
 * `@bunki/persistence`'s interface *is* `localStorage`'s shape, and the app's
 * lint boundary keeps this file from naming the package at all (which is itself
 * the point of the seam).
 */

import { describe, expect, it } from "vitest";

import { createDeterministicContext, type DomainContext } from "@bunki/domain";

import {
  createDurableAppStore,
  durabilityFor,
} from "../src/state/durable-store.ts";
import {
  openAppEventStore,
  type OpenedAppEventStore,
} from "../src/state/persistence/index.ts";
import type { CaptureCommand } from "../src/state/store.ts";

const SOURCE = {
  sourceId: "manual-entry",
  kind: "manual",
  locator: "capture-screen",
} as const;
const PROVENANCE = {
  source: "user_encounter",
  license: "user_owned",
  modificationStatus: "unmodified",
  reviewStatus: "unreviewed",
} as const;

const capture = (
  text: string,
  overrides: Partial<CaptureCommand> = {},
): CaptureCommand => ({
  kind: "capture",
  text,
  sourceRef: SOURCE,
  provenance: PROVENANCE,
  uncertainty: null,
  ...overrides,
});

const INSTANTS = Array.from(
  { length: 200 },
  (_value, index) =>
    `2026-07-27T09:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
);

/** A fresh clock and id sequence per "launch", like two real app starts. */
function newContext(idPrefix: string): DomainContext {
  return createDeterministicContext({ instants: INSTANTS, idPrefix });
}

/** `localStorage`'s shape, which is the interface the adapter asks for. */
function newSnapshotStore(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const APP_VERSIONS = { domain: "@bunki/domain@0.0.0", fsrs: null } as const;

/**
 * Replace only append while keeping every other operation bound to the real
 * adapter. Its implementation uses private fields, so spreading the instance
 * would create methods with the wrong receiver.
 */
function replaceAppend(
  opened: OpenedAppEventStore,
  append: OpenedAppEventStore["store"]["append"],
): OpenedAppEventStore {
  const real = opened.store;
  const store: typeof real = {
    runtimeLabel: real.runtimeLabel,
    append,
    readAll: () => real.readAll(),
    readStream: (selector) => real.readStream(selector),
    snapshot: () => real.snapshot(),
    exportJson: () => real.exportJson(),
    close: () => real.close(),
    countEvents: () => real.countEvents(),
    listThreadIds: () => real.listThreadIds(),
    threadState: (threadId) => real.threadState(threadId),
    eventById: (eventId) => real.eventById(eventId),
    hasIdempotencyKey: (key) => real.hasIdempotencyKey(key),
    derivedStateCacheMeta: () => real.derivedStateCacheMeta(),
  };
  return { ...opened, store };
}

async function launch(
  snapshotStore: ReturnType<typeof newSnapshotStore>,
  idPrefix: string,
  resolveLexemeId?: (text: string) => string | null,
): ReturnType<typeof createDurableAppStore> {
  const context = newContext(idPrefix);
  return createDurableAppStore({
    appVersions: APP_VERSIONS,
    clock: context.clock,
    context,
    snapshotKey: "test-store",
    snapshotStore,
    ...(resolveLexemeId === undefined ? {} : { resolveLexemeId }),
  });
}

describe("T-01 / T-16-web — a capture survives a reload of the app", () => {
  it("finds the thread again after a restart", async () => {
    const snapshotStore = newSnapshotStore();

    const first = await launch(snapshotStore, "run1-");
    const ack = first.store.execute(capture("分岐"));
    expect(ack.events).toHaveLength(1);
    await first.flush();

    const second = await launch(snapshotStore, "run2-");
    const threads = second.store.getSnapshot().threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]?.displayText).toBe("分岐");
    // The same log, not a rebuilt approximation of it.
    expect(second.store.readAll().map((event) => event.eventId)).toEqual([
      ack.events[0]?.eventId,
    ]);
  });

  it("keeps promotion state across the restart", async () => {
    const snapshotStore = newSnapshotStore();

    const first = await launch(snapshotStore, "run1-");
    const ack = first.store.execute(capture("分岐"));
    first.store.execute({
      kind: "promote",
      threadId: ack.threadId,
      to: "keep",
    });
    first.store.execute({
      kind: "promote",
      threadId: ack.threadId,
      to: "learn",
    });
    await first.flush();

    const second = await launch(snapshotStore, "run2-");
    expect(
      second.store.getSnapshot().threadsById[ack.threadId]?.state.promotion,
    ).toBe("learn");
  });

  /**
   * The property that makes idempotency a fact about the log rather than a UI
   * convenience: repeating the same capture after a restart must not fork a
   * second thread, even though the second launch has a different id generator.
   */
  it("treats a repeated capture after a restart as the same capture", async () => {
    const snapshotStore = newSnapshotStore();

    const first = await launch(snapshotStore, "run1-");
    const ack = first.store.execute(capture("分岐"));
    await first.flush();

    const second = await launch(snapshotStore, "run2-");
    const repeat = second.store.execute(capture("分岐"));
    await second.flush();

    expect(repeat.deduplicated).toBe(true);
    expect(repeat.events).toHaveLength(0);
    expect(repeat.threadId).toBe(ack.threadId);
    expect(second.store.getSnapshot().threads).toHaveLength(1);
    expect(second.store.readAll()).toHaveLength(1);
  });

  it("reports device-local durability once an adapter is behind it", async () => {
    const durable = await launch(newSnapshotStore(), "run1-");
    expect(durable.store.durability).toBe("device-local");
    expect(durable.runtimeLabel).toBe("web-provisional");
    expect(durable.snapshotAvailable).toBe(true);
  });
});

describe("REQ-UI-01 — acknowledge first, persist after", () => {
  it("returns the acknowledgment before the durable write has settled", async () => {
    const snapshotStore = newSnapshotStore();
    const durable = await launch(snapshotStore, "run1-");

    const ack = durable.store.execute(capture("分岐"));

    // The learner has their acknowledgment and the projection already shows the
    // thread — while the append is still in flight. That ordering is the
    // requirement; awaiting the store before returning would invert it.
    expect(ack.events).toHaveLength(1);
    expect(durable.store.getSnapshot().threads).toHaveLength(1);
    expect(durable.getWriteState().kind).toBe("writing");

    await durable.flush();
    expect(durable.getWriteState().kind).toBe("settled");
  });

  it("reports a rejected write instead of losing it quietly", async () => {
    const snapshotStore = newSnapshotStore();
    const context = newContext("run1-");
    const durable = await createDurableAppStore({
      appVersions: APP_VERSIONS,
      clock: context.clock,
      context,
      snapshotKey: "test-store",
      snapshotStore,
      openStore: (options) => {
        // The real web store, with only append replaced by a refusal.
        const real = openAppEventStore(options);
        return replaceAppend(real, () =>
          Promise.reject(new Error("storage quota exceeded")),
        );
      },
    });

    durable.store.execute(capture("分岐"));
    await durable.flush();

    const state = durable.getWriteState();
    expect(state.kind).toBe("failed");
    expect(state.kind === "failed" ? state.message : "").toContain("quota");
  });

  it("keeps an unresolved gap visible while a later independent append succeeds", async () => {
    const snapshotStore = newSnapshotStore();
    const context = newContext("run1-");
    let attempts = 0;
    let inFlight = 0;
    let maxInFlight = 0;

    const durable = await createDurableAppStore({
      appVersions: APP_VERSIONS,
      clock: context.clock,
      context,
      snapshotKey: "test-store",
      snapshotStore,
      openStore: (options) => {
        const real = openAppEventStore(options);
        return replaceAppend(real, async (events, appendOptions) => {
          attempts += 1;
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          try {
            if (attempts === 1) throw new Error("temporary write refusal");
            await real.store.append(events, appendOptions);
          } finally {
            inFlight -= 1;
          }
        });
      },
    });
    const transitions: string[] = [];
    const unsubscribe = durable.subscribeWriteState(() => {
      transitions.push(durable.getWriteState().kind);
    });

    const first = durable.store.execute(capture("最初"));
    await durable.flush();
    expect(durable.getWriteState()).toEqual({
      kind: "failed",
      message: "temporary write refusal",
    });

    const failureTransition = transitions.lastIndexOf("failed");
    const second = durable.store.execute(capture("次"));
    await durable.flush();
    unsubscribe();

    expect(durable.getWriteState()).toEqual({
      kind: "failed",
      message: "temporary write refusal",
    });
    expect(transitions.slice(failureTransition + 1)).not.toContain("settled");
    expect(attempts).toBe(2);
    expect(maxInFlight).toBe(1);

    const optimisticIds = durable.store.readAll().map((event) => event.eventId);
    const durableIds = (await durable.eventStore.readAll()).map(
      (event) => event.eventId,
    );
    expect(optimisticIds).toEqual([
      first.events[0]?.eventId,
      second.events[0]?.eventId,
    ]);
    expect(durableIds).toEqual([second.events[0]?.eventId]);
  });

  it("keeps serial order and settles only after an all-success queue drains", async () => {
    const snapshotStore = newSnapshotStore();
    const context = newContext("run1-");
    let inFlight = 0;
    let maxInFlight = 0;

    const durable = await createDurableAppStore({
      appVersions: APP_VERSIONS,
      clock: context.clock,
      context,
      snapshotKey: "test-store",
      snapshotStore,
      openStore: (options) => {
        const real = openAppEventStore(options);
        return replaceAppend(real, async (events, appendOptions) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          try {
            await real.store.append(events, appendOptions);
          } finally {
            inFlight -= 1;
          }
        });
      },
    });
    const transitions: string[] = [];
    const unsubscribe = durable.subscribeWriteState(() => {
      transitions.push(durable.getWriteState().kind);
    });

    const acknowledgments = ["一", "二", "三"].map((text) =>
      durable.store.execute(capture(text)),
    );
    expect(durable.getWriteState().kind).toBe("writing");
    await durable.flush();
    unsubscribe();

    const acknowledgedIds = acknowledgments.map(
      (ack) => ack.events[0]?.eventId,
    );
    const durableIds = (await durable.eventStore.readAll()).map(
      (event) => event.eventId,
    );
    expect(maxInFlight).toBe(1);
    expect(durableIds).toEqual(acknowledgedIds);
    expect(durable.getWriteState().kind).toBe("settled");
    expect(transitions.at(-1)).toBe("settled");
    expect(transitions.slice(0, -1)).not.toContain("settled");
  });

  it("continues after multiple refusals and retains the most recent error", async () => {
    const snapshotStore = newSnapshotStore();
    const context = newContext("run1-");
    let attempts = 0;

    const durable = await createDurableAppStore({
      appVersions: APP_VERSIONS,
      clock: context.clock,
      context,
      snapshotKey: "test-store",
      snapshotStore,
      openStore: (options) => {
        const real = openAppEventStore(options);
        return replaceAppend(real, async (events, appendOptions) => {
          attempts += 1;
          if (attempts !== 2)
            throw new Error(`write refusal ${String(attempts)}`);
          await real.store.append(events, appendOptions);
        });
      },
    });

    const acknowledgments = [];
    for (const text of ["一", "二", "三"]) {
      acknowledgments.push(durable.store.execute(capture(text)));
      await durable.flush();
    }

    expect(attempts).toBe(3);
    expect(durable.getWriteState()).toEqual({
      kind: "failed",
      message: "write refusal 3",
    });
    expect(durable.store.readAll()).toHaveLength(3);
    expect(
      (await durable.eventStore.readAll()).map((event) => event.eventId),
    ).toEqual([acknowledgments[1]?.events[0]?.eventId]);
  });

  it("does not retry an ambiguous append that committed before rejecting", async () => {
    const snapshotStore = newSnapshotStore();
    const context = newContext("run1-");
    let attempts = 0;

    const durable = await createDurableAppStore({
      appVersions: APP_VERSIONS,
      clock: context.clock,
      context,
      snapshotKey: "test-store",
      snapshotStore,
      openStore: (options) => {
        const real = openAppEventStore(options);
        return replaceAppend(real, async (events, appendOptions) => {
          attempts += 1;
          await real.store.append(events, appendOptions);
          if (attempts === 1) throw new Error("append acknowledgement lost");
        });
      },
    });

    const first = durable.store.execute(capture("一"));
    await durable.flush();
    const second = durable.store.execute(capture("二"));
    await durable.flush();

    expect(attempts).toBe(2);
    expect(durable.getWriteState()).toEqual({
      kind: "failed",
      message: "append acknowledgement lost",
    });
    expect(
      (await durable.eventStore.readAll()).map((event) => event.eventId),
    ).toEqual([first.events[0]?.eventId, second.events[0]?.eventId]);
  });

  it("does not mistake local deduplication for repair of a failed append", async () => {
    const snapshotStore = newSnapshotStore();
    const context = newContext("run1-");
    let attempts = 0;

    const durable = await createDurableAppStore({
      appVersions: APP_VERSIONS,
      clock: context.clock,
      context,
      snapshotKey: "test-store",
      snapshotStore,
      openStore: (options) => {
        const real = openAppEventStore(options);
        return replaceAppend(real, () => {
          attempts += 1;
          return Promise.reject(new Error("storage still unavailable"));
        });
      },
    });
    const command = capture("同じ");

    const first = durable.store.execute(command);
    await durable.flush();
    const repeat = durable.store.execute(command);
    await durable.flush();

    expect(first.events).toHaveLength(1);
    expect(repeat.deduplicated).toBe(true);
    expect(repeat.events).toHaveLength(0);
    expect(attempts).toBe(1);
    expect(durable.store.readAll()).toHaveLength(1);
    expect(await durable.eventStore.readAll()).toEqual([]);
    expect(durable.getWriteState()).toEqual({
      kind: "failed",
      message: "storage still unavailable",
    });
  });
});

describe("what a reload honestly cannot restore", () => {
  /**
   * The uncertainty *dimension* was never in the log (WP05-D2: the v1 schema
   * records `uncertaintyMark: true | absent`). The store must not guess it back,
   * and must not report the thread as unmarked either — both would be lies, in
   * opposite directions.
   */
  it("keeps the fact of a mark and drops the dimension, saying which", async () => {
    const snapshotStore = newSnapshotStore();

    const first = await launch(snapshotStore, "run1-");
    const ack = first.store.execute(
      capture("分岐", { uncertainty: "reading" }),
    );
    expect(
      first.store.getSnapshot().threadsById[ack.threadId]?.uncertainty
        ?.dimension,
    ).toBe("reading");
    await first.flush();

    const second = await launch(snapshotStore, "run2-");
    const thread = second.store.getSnapshot().threadsById[ack.threadId];
    expect(thread?.uncertainty).toBeNull();
    expect(thread?.markRecordedInLog).toBe(true);
  });

  it("re-attaches a thread to its seed entry through the injected resolver", async () => {
    const snapshotStore = newSnapshotStore();

    const first = await launch(snapshotStore, "run1-");
    const ack = first.store.execute(capture("分岐", { lexemeId: "lex-bunki" }));
    await first.flush();

    const withResolver = await launch(snapshotStore, "run2-", (text) =>
      text === "分岐" ? "lex-bunki" : null,
    );
    expect(
      withResolver.store.getSnapshot().threadsById[ack.threadId]?.lexemeId,
    ).toBe("lex-bunki");

    // …and without one, the link is absent rather than invented.
    const withoutResolver = await launch(snapshotStore, "run3-");
    expect(
      withoutResolver.store.getSnapshot().threadsById[ack.threadId]?.lexemeId,
    ).toBeNull();
  });
});

describe("durabilityFor", () => {
  it("refuses to promise a reload a denied browser cannot survive", () => {
    expect(durabilityFor("web-provisional", false)).toBe(
      "in-memory-session-only",
    );
    expect(durabilityFor("web-provisional", true)).toBe("device-local");
    expect(durabilityFor("native", true)).toBe("device-local");
  });
});
