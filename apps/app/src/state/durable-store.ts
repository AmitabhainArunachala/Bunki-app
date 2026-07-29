/**
 * The durable `AppStore` (WP-10; controller §18 WP-10, §7, REQ-UI-01).
 *
 * ## What this file does, in one sentence
 *
 * It opens the platform's event store, reads what is already in it, builds the
 * command handler on top of that log, and carries every subsequent command's
 * events back out — so the app stops being in-memory without any screen learning
 * that persistence exists.
 *
 * ## The ordering that matters
 *
 * REQ-UI-01: acknowledge locally first, persist after, never the reverse.
 * `AppStore.execute` stays synchronous, and the durable write is started from
 * the journal callback *after* the snapshot is rebuilt and subscribers are
 * notified. A learner's save is on screen before a byte is written.
 *
 * That is a real trade and it is stated rather than hidden: a tab killed between
 * the acknowledgment and the resolved write loses that append. The alternative —
 * awaiting the disk before acknowledging — would turn a sub-frame save into a
 * storage-latency save, which is precisely the failure REQ-ARCH-06's budget and
 * the operator's "feels immediate" test exist to prevent. The web adapter
 * narrows the window by writing its snapshot inside the same synchronous step as
 * its in-memory mutation.
 *
 * ## Writes are serialised, and failures are reported rather than swallowed
 *
 * Appends are chained onto one promise, so two fast commands cannot interleave
 * into the adapter and produce a log whose order differs from the order the
 * learner saw. A rejected write records an unresolved durability gap. The queue
 * continues, but that gap stays visible because a later independent append does
 * not prove the rejected append reached storage. Nothing retries silently:
 * retrying over a conflicting key is how one lost append becomes two histories.
 */

import type { DomainEvent } from "@bunki/domain";

import { createMemoryAppStore } from "./memory-store.ts";
import {
  openAppEventStore,
  type EventStore,
  type OpenAppEventStoreOptions,
  type OpenedAppEventStore,
  type RuntimeLabel,
} from "./persistence/index.ts";
import type { AppStore, CommandObserver, DurabilityLevel } from "./store.ts";

/** What the app knows about its own durable writes. */
export type WriteState =
  /** Every append the store accepted has reached the adapter. */
  | { readonly kind: "settled" }
  /** At least one append is in flight. */
  | { readonly kind: "writing" }
  /**
   * At least one acknowledged append could not be confirmed in the adapter.
   *
   * This state is sticky for the store instance because failed appends are not
   * retried or reconciled here. A later independent success must not erase the
   * unresolved gap. `message` is the most recent adapter rejection, not
   * necessarily the latest append attempt; it names no encounter content.
   */
  | { readonly kind: "failed"; readonly message: string };

export interface DurableAppStore {
  readonly store: AppStore;
  readonly runtimeLabel: RuntimeLabel;
  /** False when the web adapter fell back to in-memory snapshots. */
  readonly snapshotAvailable: boolean;
  /** The port itself, for the export surface. Never handed to a screen. */
  readonly eventStore: EventStore;
  readonly getWriteState: () => WriteState;
  readonly subscribeWriteState: (listener: () => void) => () => void;
  /** Resolves when every queued append has settled. Tests await it; the app does not. */
  readonly flush: () => Promise<void>;
}

export interface CreateDurableAppStoreOptions extends OpenAppEventStoreOptions {
  readonly context: Parameters<typeof createMemoryAppStore>[0]["context"];
  readonly observer?: CommandObserver | undefined;
  readonly elapsedMs?: (() => number) | undefined;
  /** Re-attaches rehydrated threads to their seed entries — see `memory-store.ts`. */
  readonly resolveLexemeId?: ((text: string) => string | null) | undefined;
  /** Injected by tests so an already-open store can be reused across a "restart". */
  readonly openStore?:
    ((options: OpenAppEventStoreOptions) => OpenedAppEventStore) | undefined;
}

/**
 * The durability label a runtime honestly earns.
 *
 * Both adapters survive a reload, so both are `device-local`; the *strength* of
 * that claim differs and is carried by `runtimeLabel` plus the adapter's own
 * disclosure, never by inflating this word. A store whose browser refused
 * storage is downgraded to `in-memory-session-only`, because at that point the
 * label would otherwise promise a reload it cannot survive.
 */
export function durabilityFor(
  runtimeLabel: RuntimeLabel,
  snapshotAvailable: boolean,
): DurabilityLevel {
  if (runtimeLabel === "web-provisional" && !snapshotAvailable)
    return "in-memory-session-only";
  return "device-local";
}

/**
 * Open the durable store and build the app store over it.
 *
 * Asynchronous because reading the log is: the caller decides what to show while
 * it resolves, which is a decision a store must not make on a screen's behalf.
 */
export async function createDurableAppStore(
  options: CreateDurableAppStoreOptions,
): Promise<DurableAppStore> {
  const opened = (options.openStore ?? openAppEventStore)(options);
  const initialEvents = await opened.store.readAll();

  let writeState: WriteState = { kind: "settled" };
  let pending = 0;
  const listeners = new Set<() => void>();
  let queue: Promise<void> = Promise.resolve();

  const setWriteState = (next: WriteState): void => {
    writeState = next;
    for (const listener of listeners) listener();
  };

  const journal = (
    events: readonly DomainEvent[],
    idempotencyKey: string,
  ): void => {
    pending += 1;
    if (writeState.kind !== "failed") setWriteState({ kind: "writing" });
    queue = queue.then(async () => {
      try {
        await opened.store.append(events, { idempotencyKey });
      } catch (cause) {
        setWriteState({
          kind: "failed",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        pending -= 1;
        if (pending === 0 && writeState.kind === "writing")
          setWriteState({ kind: "settled" });
      }
    });
  };

  const store = createMemoryAppStore({
    context: options.context,
    durability: durabilityFor(opened.runtimeLabel, opened.snapshotAvailable),
    initialEvents,
    journal,
    ...(options.observer === undefined ? {} : { observer: options.observer }),
    ...(options.elapsedMs === undefined
      ? {}
      : { elapsedMs: options.elapsedMs }),
    ...(options.resolveLexemeId === undefined
      ? {}
      : { resolveLexemeId: options.resolveLexemeId }),
  });

  return {
    store,
    runtimeLabel: opened.runtimeLabel,
    snapshotAvailable: opened.snapshotAvailable,
    eventStore: opened.store,
    getWriteState: () => writeState,
    subscribeWriteState(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush: () => queue,
  };
}
