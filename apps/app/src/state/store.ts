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

import type { SUPERSESSION_REASONS } from '@bunki/domain';
import type {
  DerivedState,
  DomainEvent,
  DomainEventType,
  PromotionState,
  ProvenanceRecord,
  RetrievalSkill,
  SourceRef,
  ThreadState,
} from '@bunki/domain';

/**
 * Why an observation was corrected.
 *
 * Derived from `@bunki/domain`'s closed list rather than retyped: the app must
 * not be able to offer a reason the event schema would reject, and a local
 * union would drift the moment the kernel's list changed.
 */
export type SupersessionReason = (typeof SUPERSESSION_REASONS)[number];

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

/**
 * Append the demonstration evidence chain for one thread (WP-09).
 *
 * ## Why this command exists at all, stated before anything else
 *
 * REQ-UI-06 asks the inspector to show "the event chain, tier, source/probe,
 * rubric/model version, supersession history" for a thread. In this build,
 * nothing a learner can do produces an evidence-class event: the screens WP-05
 * shipped emit `EncounterCaptured` and `ThreadPromotionChanged` and nothing
 * else, and the session/canvas surfaces that produce real graded observations
 * belong to WP-08, on a branch this one does not contain. An inspector built
 * against an empty ledger would demonstrate nothing, and an inspector that
 * *rendered* a plausible chain without appending one would be a mock wearing a
 * screen's clothes.
 *
 * So the demonstration is real: every event below is minted by
 * `@bunki/domain`'s own factories — the evidence-class ones by the evidence
 * gate's sole factory in `src/evidence/`, which stamps the tier the app is
 * therefore unable to choose — appended to the same log everything else uses,
 * and read back by the same `replay`. The chain is genuine; only its *origin*
 * is a button rather than a study session, and the inspector says exactly that
 * on screen (`DEMONSTRATION_CHAIN_NOTE`) rather than letting it read as the
 * learner's own history.
 *
 * It is idempotent per thread, so a double tap adds one chain.
 */
export interface SeedEvidenceDemonstrationCommand {
  readonly kind: 'seedEvidenceDemonstration';
  readonly threadId: string;
  /**
   * The closed answer set the contract is scored against (REQ-DM-05:
   * `acceptedAnswers` XOR a versioned rubric). Supplied by the screen from the
   * seed entry, because the store has no seed access and inventing answers
   * here would be the store asserting lexical facts.
   */
  readonly acceptedAnswers: readonly string[];
  /** Which retrieval direction the contract tests. */
  readonly skill: RetrievalSkill;
}

/**
 * A user correction (REQ-UI-06, REQ-DM-04.2, REQ-LM-06).
 *
 * Appends `EvidenceSuperseded`. It never edits, deletes, or rewrites the
 * observation it corrects — the original event stays in the log exactly as it
 * was recorded, and the correction is a new event that names it. That is not a
 * stylistic preference: `replay` refuses a log whose correction points at an
 * observation it has not already seen, and refuses to supersede one twice, so
 * a store that tried to "fix" history would produce a log the kernel cannot
 * read at all.
 *
 * REQ-LM-06's last clause is enforced structurally rather than by review:
 * "user correction creates superseding evidence — it is not automatic
 * mastery". The only event this command can produce is `EvidenceSuperseded`,
 * which carries no grade and no tier.
 */
export interface CorrectEvidenceCommand {
  readonly kind: 'correctEvidence';
  /** The observation being corrected. Must exist in the log and be uncorrected. */
  readonly supersededEventId: string;
  readonly reason: SupersessionReason;
  /** Required by the schema: a correction with no stated reason is not a record. */
  readonly note: string;
}

/**
 * Record that an export ran (controller §11; `DataExported`, ADR-002).
 *
 * The event is appended **before** the bytes are built, and that ordering is
 * load-bearing rather than incidental: the export must contain the record of
 * itself, or the exported log and the live log describe histories of different
 * lengths and the T-14 equality check fails for a bookkeeping reason that has
 * nothing to do with losslessness. `CommandAck.events` gives the caller the
 * appended event so it can read the log afterwards and know the record is in it.
 */
export interface RecordExportCommand {
  readonly kind: 'recordExport';
  /** `exportVersion` as the *event* spells it — a string (ADR-002). */
  readonly exportVersion: string;
}

export type AppCommand =
  | CaptureCommand
  | PromoteCommand
  | MarkUncertaintyCommand
  | SeedEvidenceDemonstrationCommand
  | CorrectEvidenceCommand
  | RecordExportCommand;

/** Every command kind, as data, so a log record's field is a closed enum. */
export const APP_COMMAND_KINDS = [
  'capture',
  'promote',
  'markUncertainty',
  'seedEvidenceDemonstration',
  'correctEvidence',
  'recordExport',
] as const;

export type AppCommandKind = (typeof APP_COMMAND_KINDS)[number];

/**
 * What the store tells an observer about a command it just applied
 * (controller §12: "event appends, command latencies").
 *
 * Every field is a scalar or a member of a closed enum. There is deliberately
 * **no** field that can hold captured text, a note, an answer, or an error
 * message — see `src/observability/ring.ts` for why the record type is where
 * that argument is settled rather than at each call site.
 */
export interface CommandObservation {
  readonly commandKind: AppCommandKind;
  /** Wall time the store spent inside `execute`, from an injected counter. */
  readonly latencyMs: number;
  /** Event families appended, in order. Types only — never payloads. */
  readonly appendedTypes: readonly DomainEventType[];
  readonly deduplicated: boolean;
  /** True when the command threw; the message is deliberately not carried. */
  readonly failed: boolean;
}

/**
 * The store's observability seam.
 *
 * One method, taking a closed record. A store that took a general-purpose
 * logger would let any caller pass anything, which is exactly the hole
 * REQ-ARCH-07 is about.
 */
export interface CommandObserver {
  readonly observe: (observation: CommandObservation) => void;
}

/** The default: observe nothing. Observability is opt-in, never ambient. */
export const NULL_COMMAND_OBSERVER: CommandObserver = { observe: () => undefined };

/**
 * The prompt family version stamped on the demonstration contract (WP-09).
 *
 * REQ-UI-06 asks the inspector to show "rubric/model version" wherever one
 * exists, so the demonstration must carry a real one rather than leave the
 * column blank and let the screen imply versions are never recorded. It names
 * itself a demonstration, so a reader of an export cannot mistake it for a
 * prompt family that was actually authored and reviewed.
 *
 * It lives in this module — types and constants, no store, no clock — rather
 * than in `memory-store.ts` because it is now read from two sides: the store
 * *stamps* it, and `screens/evidence-chain.ts` *detects* it to keep the
 * REQ-LM-06 default surface from asserting that the learner answered something
 * a button appended. Putting it beside `DEMONSTRATION_CHAIN_NOTE` keeps the
 * stamp, the detection and the sentence in one place, so they cannot drift into
 * a state where a chain is demonstration-minted but nothing says so.
 */
export const DEMONSTRATION_PROMPT_FAMILY_VERSION = 'demo-recognition@1';

/**
 * The `experienceId` prefix the demonstration's `ExposureLogged` carries.
 *
 * An exposure names no contract, so the prompt-family stamp above cannot reach
 * it and there is no other field on the event that ties it to the button that
 * appended it. Without this the inspector would label a demonstration exposure
 * “meeting it in passing” — a claim about something the learner did — while
 * correctly qualifying the three graded rows beside it, which is a worse state
 * than qualifying none of them.
 *
 * It is a shared constant rather than a string built in the store and re-parsed
 * by the screen, so the format cannot drift on one side and silently stop
 * matching on the other.
 */
export const DEMONSTRATION_EXPERIENCE_PREFIX = 'demo-experience:';

/**
 * Shown wherever the demonstration chain is rendered.
 *
 * Kept beside the command that creates it so the sentence and the behaviour
 * cannot drift, and so no screen can render the chain while omitting it.
 *
 * This is the *raw chain's* note. It is deliberately no longer the only place
 * the demonstration is named: `evidence-chain.ts` also qualifies why-this,
 * strength, uncertainty and the correction labels, because this note sits
 * inside a disclosure that is closed by default and a learner who never opens
 * it would otherwise read a ledger claiming answers they never gave.
 */
export const DEMONSTRATION_CHAIN_NOTE =
  'These evidence events were appended by the “Add a demonstration chain” button on this screen, not by a study session. They are real events minted by the kernel’s evidence gate and they replay like any other — but they are not a record of you answering anything.';

/**
 * Why a correction cannot be applied, when it cannot.
 *
 * A closed set, because each one has a different honest sentence and because
 * `replay` throws on the corresponding malformed log — the store refusing
 * first is what keeps the app from writing a history the kernel cannot read.
 */
export type CorrectionRefusal =
  'unknown-observation' | 'already-corrected' | 'not-an-observation' | 'empty-note';

export const CORRECTION_REFUSAL_MESSAGES: Readonly<Record<CorrectionRefusal, string>> = {
  'unknown-observation':
    'That observation is not in this session’s log, so there is nothing to correct.',
  'already-corrected':
    'That observation has already been corrected. History is appended, never rewritten, so a second correction of the same record would leave two answers with no rule for which one replay should believe — correct the correction instead.',
  'not-an-observation':
    'Only recorded observations can be corrected. A capture, a promotion, or an export record is not an observation about your recall.',
  'empty-note':
    'A correction needs a reason in your own words; the log keeps it beside the record.',
};

/** Thrown by `execute` when a correction cannot be applied. */
export class CorrectionRefusedError extends Error {
  readonly refusal: CorrectionRefusal;

  constructor(refusal: CorrectionRefusal) {
    super(CORRECTION_REFUSAL_MESSAGES[refusal]);
    this.refusal = refusal;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

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
  /**
   * The kernel's derived state for the current log (WP-09).
   *
   * `@bunki/domain`'s `replay`, memoised on the log length — not a projection
   * maintained here. The evidence inspector needs observations, gate verdicts
   * and contracts, and every one of those is a judgement the kernel makes; a
   * second copy computed in the app would be a second opinion, and the whole
   * point of REQ-UI-06 is that the inspector shows the ledger rather than a
   * story about it.
   *
   * Stated plainly because the export badge depends on it: this is a *replay*,
   * so comparing it with a replay of the exported bytes checks serialisation
   * and parsing, not two independent projections. The adapters that maintain a
   * snapshot incrementally are checked by `npm run verify:export` (WP-03).
   */
  readonly readDerived: () => DerivedState;
}
