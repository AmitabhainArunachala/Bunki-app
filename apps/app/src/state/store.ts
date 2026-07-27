/**
 * `AppStore` — the app's side of the domain command flow (WP-05).
 *
 * ## What this interface is for
 *
 * WP-03 owns `@bunki/persistence` and is being built in parallel, so `apps/app`
 * cannot import it (and a lint rule enforces that it never does directly — see
 * `eslint.config.mjs` boundary 2). This interface is the seam in between: it
 * mirrors the shape the domain command flow will have when persistence lands,
 * so the screens are written against the real contract now and the swap-in is a
 * constructor change rather than a rewrite.
 *
 * ## What it deliberately is not
 *
 * It is **not** an event store and it is not a second command handler. It holds
 * no scheduling, grading, or evidence logic (controller §5) — every event it
 * emits is built by `@bunki/domain`'s validated factory, and every piece of
 * derived state it exposes comes from `@bunki/domain`'s reducers. If a screen
 * needs a new fact, the reducer that computes it belongs in the kernel, not
 * here.
 *
 * ## The acknowledgment contract (REQ-UI-01, the load-bearing part)
 *
 * `execute` is **synchronous**. It returns after the event is validated and
 * applied, and before anything enriches, decorates, or looks anything up. That
 * ordering is the requirement — "correct answer immediately → one tap to Keep →
 * return to the original activity; enrichment finishes asynchronously" — and
 * making the method synchronous is what makes it impossible to accidentally
 * await an enrichment before acknowledging a save. `test/capture-flow.test.ts`
 * asserts the ordering directly.
 *
 * When `@bunki/persistence` replaces the in-memory implementation (W4), the
 * durable append becomes asynchronous. The contract that must survive is this
 * one: acknowledge locally first, persist after, never the reverse. See
 * `DEFERRED_INTEGRATION` in `./deferred.ts`.
 *
 * ## Durability honesty (P0-CAP-15, REQ-GATE-03)
 *
 * The store reports its own durability and the UI renders it. The Phase-0
 * implementation here is `in-memory-session-only`: a reload loses everything.
 * T-01 ("saving is durable, survives reload") belongs to WP-03 and is not
 * claimed by any screen in this work package.
 */

import type {
  DomainEvent,
  PromotionState,
  ProvenanceRecord,
  SourceRef,
  ThreadState,
} from '@bunki/domain';

/**
 * How much the current implementation actually guarantees. Rendered verbatim in
 * the UI; never upgraded by a screen.
 */
export type DurabilityLevel =
  /** In memory for this tab/session. A reload loses it. */
  | 'in-memory-session-only'
  /** Written to a device-local store that survives reload (WP-03). */
  | 'device-local';

export const DURABILITY_NOTES: Readonly<Record<DurabilityLevel, string>> = {
  'in-memory-session-only':
    'Saved for this session only. Durable on-device storage arrives with the persistence layer — reloading this page clears saved threads.',
  'device-local': 'Saved on this device.',
};

/**
 * The uncertainty dimensions of REQ-UI-01, exactly as the requirement lists
 * them: `meaning · reading · use · kanji · not sure`.
 */
export const UNCERTAINTY_DIMENSIONS = ['meaning', 'reading', 'use', 'kanji', 'not-sure'] as const;
export type UncertaintyDimension = (typeof UNCERTAINTY_DIMENSIONS)[number];

export const UNCERTAINTY_LABELS: Readonly<Record<UncertaintyDimension, string>> = {
  meaning: 'meaning',
  reading: 'reading',
  use: 'use',
  kanji: 'kanji',
  'not-sure': 'not sure',
};

/**
 * The app-local half of an uncertainty mark.
 *
 * `EncounterCaptured.uncertaintyMark` is `true | absent` in the frozen v1 event
 * schema (ADR-002, controller §6.1) — the *fact* of a mark is recorded, the
 * dimension is not. REQ-UI-01 asks the interface for the five-way gesture, so
 * the app collects the dimension and keeps it here, outside the event log,
 * rather than inventing an event field the schema does not have (which would be
 * a schema change, and schema changes are ADR-002 amendments, not app edits).
 *
 * Consequence, stated so no screen implies otherwise: the dimension is **not
 * exported and not durable**. It is a W4 coordination item; see
 * `DEFERRED_INTEGRATION`.
 */
export interface UncertaintyAnnotation {
  readonly dimension: UncertaintyDimension;
  /** Set at capture, or later — REQ-UI-01 requires the mark stay editable. */
  readonly editedAt: string;
  /** True when the mark was present on the captured event itself. */
  readonly markedAtCapture: boolean;
}

/**
 * What the event log actually holds about this mark, in one sentence.
 *
 * There are two different truths here and a screen that renders only the first
 * one lies in the second case (REQ-GATE-03, P0-CAP-15):
 *
 *   - a mark chosen **before** Keep rides on `EncounterCaptured.uncertaintyMark`,
 *     so the *fact* of a mark is in the log and only the dimension is app-local;
 *   - a mark applied **after** Keep writes nothing at all — `markUncertainty`
 *     emits no event, because the v1 schema has no family for amending a mark
 *     (see `MarkUncertaintyCommand`). Fact *and* dimension are lost on export.
 *
 * The wording is derived from the annotation rather than written into a screen
 * so the two screens cannot drift apart, and so the sentence cannot survive a
 * change to what `markUncertainty` does. `test/capture-flow.test.ts` pins the
 * store behaviour each branch describes.
 *
 * @param uncertainty The thread's current annotation, or `null` for no mark.
 * @param options.kept Whether the encounter has been kept yet. Before Keep the
 *   sentence is about what Keep *will* record; after it, about what it did.
 */
export function uncertaintyLogNote(
  uncertainty: UncertaintyAnnotation | null,
  options: { readonly kept: boolean },
): string {
  if (!options.kept) {
    return 'Keeping this with a mark records in the event log that a mark exists; which dimension you chose is kept on this device only and is not exported (deferred item WP05-D2).';
  }
  if (uncertainty === null) {
    return 'A mark added now stays on this device only — the log records a mark only on the captured event, so nothing about it would be exported (deferred item WP05-D2).';
  }
  return uncertainty.markedAtCapture
    ? 'The event log records that a mark exists; which dimension you chose is kept on this device only and is not exported (deferred item WP05-D2).'
    : 'This mark was applied after Keep, so it is on this device only — it is not in the event log and will not be exported (deferred item WP05-D2).';
}

/** What a screen needs to know about one thread. */
export interface ThreadView {
  /** Straight from `@bunki/domain`'s thread reducer. Never recomputed here. */
  readonly state: ThreadState;
  /** The captured text, for display and for matching a later encounter to this thread. */
  readonly displayText: string;
  /** Normalised `displayText`; the key a re-encounter is matched on. */
  readonly targetKey: string;
  /** The seed lexeme this capture resolved to, if any. */
  readonly lexemeId: string | null;
  readonly uncertainty: UncertaintyAnnotation | null;
  readonly capturedAt: string;
}

export interface AppSnapshot {
  /** Bumps on every applied command; the subscription hook's change token. */
  readonly revision: number;
  /** Newest first. */
  readonly threads: readonly ThreadView[];
  readonly threadsById: Readonly<Record<string, ThreadView>>;
  readonly eventCount: number;
}

export interface CaptureCommand {
  readonly kind: 'capture';
  readonly text: string;
  readonly sourceRef: SourceRef;
  readonly provenance: ProvenanceRecord;
  /** The one-gesture mark, or `null` when the learner did not mark anything. */
  readonly uncertainty: UncertaintyDimension | null;
  /** The seed lexeme the query resolved to, when it resolved to one. */
  readonly lexemeId?: string | undefined;
}

export interface PromoteCommand {
  readonly kind: 'promote';
  readonly threadId: string;
  readonly to: PromotionState;
}

/**
 * Edit an existing mark (REQ-UI-01: "remains editable").
 *
 * App-local only, for the reason given on {@link UncertaintyAnnotation}.
 */
export interface MarkUncertaintyCommand {
  readonly kind: 'markUncertainty';
  readonly threadId: string;
  readonly dimension: UncertaintyDimension | null;
}

export type AppCommand = CaptureCommand | PromoteCommand | MarkUncertaintyCommand;

/** What `execute` returns, immediately, before any enrichment runs. */
export interface CommandAck {
  readonly threadId: string;
  /** The instant the store acknowledged, from the injected clock. */
  readonly acknowledgedAt: string;
  /** Events actually appended. Empty when an idempotent repeat was a no-op. */
  readonly events: readonly DomainEvent[];
  /** True when this exact command had already been applied (double-tap). */
  readonly deduplicated: boolean;
  /** What the acknowledgment is worth. Rendered, never upgraded. */
  readonly durability: DurabilityLevel;
}

export interface AppStore {
  /** What the store guarantees about an acknowledged write. */
  readonly durability: DurabilityLevel;
  readonly getSnapshot: () => AppSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Apply a command. Synchronous by contract — see the acknowledgment section
   * of this file's header.
   *
   * @throws EventValidationError when the command cannot produce a valid event.
   */
  readonly execute: (command: AppCommand) => CommandAck;
  /** The full event log, in append order. Read-only; screens never append here. */
  readonly readAll: () => readonly DomainEvent[];
}
