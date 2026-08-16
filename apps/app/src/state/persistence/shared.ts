/**
 * Types and constants both platform stores share (WP-10).
 *
 * Kept out of `./index.ts` so the two `platform-store` files can import them
 * without importing the barrel that imports them — a cycle that resolves fine
 * in a bundler and confuses everything else.
 */

import type { EventStore, EventStoreConfig, RuntimeLabel, SnapshotStore } from '@bunki/persistence';

import { UNCERTAINTY_DIMENSIONS, type UncertaintyAnnotation } from '../store.ts';

/** The database file on a device, and the storage key in a browser. */
export const STORE_NAME = 'bunki-phase0';

export interface OpenAppEventStoreOptions extends EventStoreConfig {
  /** Web only. Defaults to `globalThis.localStorage`, or memory when denied. */
  readonly snapshotStore?: SnapshotStore | undefined;
  /** Overrides the storage key / database name. Tests isolate themselves with it. */
  readonly snapshotKey?: string | undefined;
}

export interface OpenedAppEventStore {
  readonly store: EventStore;
  readonly runtimeLabel: RuntimeLabel;
  /**
   * Whether the bytes will outlive the tab or process.
   *
   * `false` when the web adapter fell back to an in-memory snapshot store. The
   * about surface renders this rather than the label alone, because
   * "web-provisional" and "web-provisional, and this browser refused storage"
   * make different promises and only one of them survives a reload.
   */
  readonly snapshotAvailable: boolean;
  /**
   * The durable side-store for the uncertainty *dimension* (R4-A, P2-18).
   *
   * The frozen v1 event schema records `EncounterCaptured.uncertaintyMark` as
   * `true | absent` (WP05-D2), so the five-way dimension the learner chose has
   * never been an event field and a post-Keep edit writes no event at all.
   * Making it durable therefore cannot go through the event log without an
   * ADR-002 amendment; it goes *beside* the log instead, through this store,
   * which lives in the same seam directory as every other persistence write
   * path (ADR-001 boundary 2 stays exactly as narrow as it was).
   *
   * What this deliberately is not: an event store, an export surface, or a
   * second command handler. Rows never enter the export, never reach `replay`,
   * and carry no grade-bearing field — losing every row loses only which chip
   * was lit, and the log's own `uncertaintyMark` facts are untouched.
   */
  readonly annotations: UncertaintyAnnotationStore;
}

/**
 * The annotation side-store's whole surface: synchronous, keyed by thread.
 *
 * Synchronous like `SnapshotStore`, because both backing stores are
 * (`localStorage` on web, the sqlite sync driver on device) and an async seam
 * here would buy nothing but ordering questions against `execute`'s
 * acknowledge-first contract.
 */
export interface UncertaintyAnnotationStore {
  /** Every stored annotation, already validated; invalid rows are dropped. */
  readonly read: () => ReadonlyMap<string, UncertaintyAnnotation>;
  /** Replace (`annotation`) or clear (`null`) one thread's annotation. */
  readonly write: (threadId: string, annotation: UncertaintyAnnotation | null) => void;
}

/** The web storage key the annotation blob lives under, beside the event snapshot. */
export const annotationSnapshotKey = (base: string): string => `${base}:annotations:v1`;

/**
 * Validate one stored row. Fail-closed per row: a corrupt or foreign value is
 * dropped rather than guessed at — a wrong dimension shown as the learner's own
 * mark would be worse than the honest "which part was not stored" fallback.
 */
export function parseStoredAnnotation(value: unknown): UncertaintyAnnotation | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const dimension = record['dimension'];
  if (
    typeof dimension !== 'string' ||
    !(UNCERTAINTY_DIMENSIONS as readonly string[]).includes(dimension)
  ) {
    return null;
  }
  if (typeof record['editedAt'] !== 'string' || record['editedAt'] === '') return null;
  if (typeof record['markedAtCapture'] !== 'boolean') return null;
  return {
    dimension: dimension as UncertaintyAnnotation['dimension'],
    editedAt: record['editedAt'],
    markedAtCapture: record['markedAtCapture'],
  };
}

/**
 * An annotation store over any `SnapshotStore`-shaped backing: one JSON object
 * keyed by thread id, read whole and written whole. The web adapter hands it
 * `localStorage` (or its in-memory stand-in when the browser refused storage,
 * so the annotation's durability honestly matches the event snapshot's);
 * tests hand it a `Map`-backed double.
 */
export function createSnapshotAnnotationStore(
  snapshot: SnapshotStore,
  key: string,
): UncertaintyAnnotationStore {
  const load = (): Record<string, unknown> => {
    try {
      const raw = snapshot.getItem(key);
      if (raw === null) return {};
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      // Unreadable bytes are dropped, not repaired: rows are app-local hints,
      // and the fallback surfaces already tell the learner the dimension was
      // not stored rather than inventing one.
      return {};
    }
  };

  return {
    read: () => {
      const entries = new Map<string, UncertaintyAnnotation>();
      for (const [threadId, value] of Object.entries(load())) {
        const annotation = parseStoredAnnotation(value);
        if (annotation !== null) entries.set(threadId, annotation);
      }
      return entries;
    },
    write: (threadId, annotation) => {
      const next = load();
      if (annotation === null) {
        delete next[threadId];
      } else {
        next[threadId] = annotation;
      }
      snapshot.setItem(key, JSON.stringify(next));
    },
  };
}
