/**
 * UI hooks for the export button (WP-09; controller §11, T-14, T-15,
 * REQ-UI-06, REQ-ARCH-08).
 *
 * WP-03 built the envelope and the verifier. This module is the seam WP-03's
 * header promised WP-09: one call that takes a log and returns everything an
 * export button has to render — the bytes, and an *honest* statement of what
 * was checked about them.
 *
 * ## Why the verification result is a described claim rather than a boolean
 *
 * A green tick that says "verified" invites the reader to supply their own
 * meaning, and the meanings available here are not equally true. Running
 * `verifyExportRoundTrip` proves one specific thing — that these exported
 * bytes, re-read under the fail-closed parser, replay to the derived state
 * they were taken from. It does **not** prove the data is durable, does not
 * prove a different build would agree, and does not prove two independent
 * projections agree (that last one is what `npm run verify:export` adds by
 * running the same function against the SQLite and web adapters, whose
 * snapshots are folded incrementally rather than replayed).
 *
 * So `ExportVerification` carries `checked` (what this run actually
 * established), `notChecked` (what a reader might otherwise assume it did),
 * and a `badge` whose wording is derived from `equal` rather than chosen by a
 * screen. A screen that renders `badge.headline` cannot accidentally promote a
 * failure to a pass, and a screen cannot invent a stronger sentence than the
 * one this module is willing to defend.
 *
 * One entry in `notChecked` is about the *store* rather than about the check,
 * and this package has no store: whether a log survives a reload depends on the
 * adapter the caller opened. It is therefore a parameter
 * ({@link StorageDurabilityClaim}) and not a constant. It was a constant until
 * WP-10's repair round, and the constant went stale the moment the app gained a
 * durable adapter — leaving the export screen and the diagnostics screen of one
 * build asserting opposite storage facts.
 *
 * ## The byte round trip is not decoration
 *
 * `verifyExportRoundTrip` alone accepts an in-memory object. An export leaves
 * the process as **text**, so this module serialises, `JSON.parse`s, and only
 * then verifies. That extra hop is the only place a JSON-hostile value
 * (a `Date`, a `BigInt`, a lost key order) can be caught, and it is the step
 * that makes "the export replays" a statement about the file the user actually
 * receives rather than about the object the app happened to hold.
 */

import {
  canonicalJson,
  FSRS_PIN,
  PACKAGE_NAME as DOMAIN_PACKAGE_NAME,
  type DerivedState,
  type DomainEvent,
  type IsoInstant,
} from '@bunki/domain';

import {
  buildExportEnvelope,
  serializeExportEnvelope,
  type AppVersionsInput,
  type ExportEnvelope,
} from './envelope.ts';
import { verifyExportRoundTrip, type ExportRoundTripResult } from './verify.ts';

/**
 * The name of the script that performs the wider check, quoted in the UI.
 *
 * A constant rather than a literal in a screen: if the script is ever renamed,
 * a badge that names the old one is a false pointer, and a false pointer in an
 * honesty affordance is worse than no pointer.
 */
export const WIDER_VERIFICATION_COMMAND = 'npm run verify:export';

/**
 * The workspace version of `@bunki/domain`, as a literal.
 *
 * Read from `package.json` would be better and is not available: this package
 * targets Hermes and a browser as well as Node, and neither can read a file.
 * The literal is pinned by `test/ui-hooks.test.ts` against the manifest, so it
 * cannot drift silently — an import assertion would be the right answer once
 * every target supports one.
 */
const DOMAIN_PACKAGE_VERSION = '0.0.0';

/**
 * Build identifiers for an export taken from this build.
 *
 * ## Why `fsrs` is a real string here and was `null` at WP-03
 *
 * `envelope.ts` documents `fsrs: null` as the honest WP-03 value, with a
 * standing instruction: *"When WP-06 lands, the app passes the real pin through
 * `appVersions.fsrs` and every export after that carries it."* WP-06 has
 * landed — `FSRS_PIN` exists in `@bunki/domain` and its own comment names the
 * export's `appVersions` as one of its consumers. An export from this build
 * that still said `null` would now be asserting that no scheduling engine is
 * pinned, which is false, and a false claim in the field a future importer uses
 * to decide whether it can reproduce a state is the worst place for one.
 *
 * The string carries the five things that determine a derived interval — the
 * package, its version, the algorithm generation, the parameter set, and the
 * review-time policy — so an importer can distinguish matching scheduling
 * semantics from a build that only shares the same library and weights.
 * The pin is read from the kernel rather than retyped, so it cannot describe a
 * configuration the reducer is not using.
 *
 * It lives in `@bunki/export` and not in `apps/app` deliberately: the app must
 * not name, import, or know about the scheduling engine (REQ-SCH-01), and a
 * screen that assembled this string would be doing exactly that.
 */
export function appVersionsForBuild(): AppVersionsInput {
  return {
    domain: `${DOMAIN_PACKAGE_NAME}@${DOMAIN_PACKAGE_VERSION}`,
    fsrs:
      `${FSRS_PIN.package}@${FSRS_PIN.version} (${FSRS_PIN.algorithm}, ` +
      `parameters ${FSRS_PIN.parameterSetId}, review-time ${FSRS_PIN.reviewTimePolicyId})`,
  };
}

export interface ExportVerificationBadge {
  /** `pass` / `fail` — never `verified`; see the module header. */
  readonly status: 'pass' | 'fail';
  /** One line, safe to render as-is. */
  readonly headline: string;
  /** The sentence that stops `headline` from being read as more than it is. */
  readonly qualifier: string;
}

export interface ExportVerification {
  /** Did the exported bytes replay to the state they were taken from? */
  readonly equal: boolean;
  readonly badge: ExportVerificationBadge;
  /** What this run established, in the reader's language. */
  readonly checked: readonly string[];
  /** What this run did **not** establish, so it cannot be assumed. */
  readonly notChecked: readonly string[];
  /** First differing line of the two canonical renderings; `null` when equal. */
  readonly firstDifference: string | null;
  readonly eventCount: number;
}

export interface PreparedExport {
  readonly envelope: ExportEnvelope;
  /** Canonical bytes — what a download would write. */
  readonly json: string;
  /** UTF-8 length of `json`, for a size line the user can sanity-check. */
  readonly byteLength: number;
  readonly verification: ExportVerification;
}

export interface PrepareExportArgs {
  /**
   * The complete log to export. Any `DataExported` event recording *this*
   * export must already be in it — see `verifiesAgainst` below.
   */
  readonly events: readonly DomainEvent[];
  /** From an injected clock (controller §11) — never `Date.now()`. */
  readonly generatedAt: IsoInstant;
  readonly appVersions: AppVersionsInput;
  /**
   * Derived state the store reports right now, for the equality half of T-14.
   *
   * **Ordering matters and is the caller's to get right.** If the app appends a
   * `DataExported` event for this export, it must append it *before* reading
   * both `events` and `liveState`; otherwise the two sides describe logs of
   * different lengths and the check fails for a reason that has nothing to do
   * with losslessness. `verifiesAgainst` names what a caller must satisfy so
   * this constraint is documented at the call site rather than discovered.
   */
  readonly liveState: DerivedState;
  /**
   * What the caller's store guarantees about surviving a reload.
   *
   * Optional, and omitting it asserts nothing — see
   * {@link StorageDurabilityClaim}. A caller that has an adapter should pass its
   * real answer, because the alternative is the export surface stating a storage
   * fact it did not learn here.
   */
  readonly storageDurability?: StorageDurabilityClaim | undefined;
}

/**
 * UTF-8 byte length without pulling in a platform Buffer.
 *
 * `TextEncoder` is a standard global in every runtime this package targets
 * (Node ≥22, Hermes, browsers). Falling back to `json.length` would report
 * UTF-16 code units and understate every Japanese export by roughly a third —
 * a size line that is wrong for exactly this product's data.
 */
function utf8ByteLength(json: string): number {
  return new TextEncoder().encode(json).length;
}

/**
 * What the caller must have done for the verification to mean anything.
 *
 * Exported as data so a test and a UI can both assert it, rather than trusting
 * a comment. Each entry is a precondition on `PrepareExportArgs`.
 */
export const EXPORT_VERIFICATION_PRECONDITIONS: readonly string[] = Object.freeze([
  '`events` is the complete log, in append order, including any DataExported event recorded for this export.',
  '`liveState` was derived from that same log, after that append.',
  '`generatedAt` came from the injected clock, so two exports of one store at one instant are byte-identical.',
]);

function badgeFor(result: ExportRoundTripResult): ExportVerificationBadge {
  if (result.equal) {
    return {
      status: 'pass',
      headline: `Replay check passed — ${String(result.eventCount)} events re-read and replayed to the same state.`,
      qualifier:
        'This checks the export, not durability or storage. It says the file you are holding can be read back under this build’s schema and reproduces the state it was taken from.',
    };
  }
  return {
    status: 'fail',
    headline: `Replay check FAILED — ${String(result.eventCount)} events did not reproduce the current state.`,
    qualifier:
      'Do not treat this export as a complete record. The first difference is shown below so the divergence can be diagnosed rather than guessed at.',
  };
}

function checkedClaims(result: ExportRoundTripResult): readonly string[] {
  return Object.freeze([
    'The export was serialised to text and parsed back, so nothing was lost that JSON cannot carry.',
    'Every event in it passed the same fail-closed parser the app uses to read its own log.',
    result.equal
      ? // "The state this export was taken from", not "this session's state":
        // the log the caller handed in may have been rehydrated from storage
        // and predate this session entirely. Naming the session was harmless
        // while the app was in-memory and became a second small falsehood the
        // moment WP-10 made the log durable.
        'Replaying the parsed events reproduced the derived state this export was taken from, exactly, compared as canonical bytes.'
      : 'Replaying the parsed events did NOT reproduce the derived state this export was taken from.',
  ]);
}

/**
 * What the caller's store guarantees about surviving a reload.
 *
 * This package holds no store and opens no adapter, so it cannot find this out —
 * and it must not guess. Until WP-10 it did guess: `NOT_CHECKED` carried the
 * frozen sentence "this build keeps the log in memory for one session; a reload
 * loses it", which was true when WP-09 wrote it and false the moment WP-10 put a
 * durable adapter behind `AppStore`. The export surface then contradicted the
 * diagnostics surface in the same build, and the one the operator reads at
 * acceptance-script step 8 was the wrong one (REQ-GATE-03, P0-CAP-15).
 *
 * So the fact is a parameter. The caller knows its adapter; this module knows
 * what an export check does and does not establish, which is the *other* half of
 * the sentence and the half that never changes.
 */
export type StorageDurabilityClaim =
  /** The caller's store survives a reload — e.g. a granted device-local adapter. */
  | 'survives-reload'
  /** The caller's store does not — in memory for this session only. */
  | 'session-only'
  /** The caller did not say. The default, and never an assertion either way. */
  | 'unknown';

/**
 * The durability line, which is about the *store* and never about the check.
 *
 * Every branch ends in the same clause for the same reason: whatever the storage
 * does, running an export check is not how anyone learned it. A reader who takes
 * a passing badge as evidence of durability has been misled by the badge, and
 * that is what this bullet exists to prevent — in both directions.
 */
const DURABILITY_NOT_CHECKED: Readonly<Record<StorageDurabilityClaim, string>> = Object.freeze({
  'survives-reload':
    'Durability. The store this export was taken from keeps your log where a reload finds it again — but that is a fact about the store, not something this check established. An export check reads bytes; it never touches storage.',
  'session-only':
    'Durability. The store this export was taken from keeps the log in memory for this session only, so a reload loses it — and no export check can change that. Keep the file if you want the record.',
  unknown:
    'Durability. Whether the log survives a reload is a property of the store this export came from, and this check establishes it neither way. Ask the surface that knows the adapter — the diagnostics screen names it.',
});

/**
 * What an export round trip does not establish.
 *
 * @param durability what the caller's store guarantees; see
 *   {@link StorageDurabilityClaim}. Omitted means `unknown`, which asserts
 *   nothing — the honest answer for a caller that has no adapter to describe.
 */
export function notCheckedClaims(
  durability: StorageDurabilityClaim = 'unknown',
): readonly string[] {
  return Object.freeze([
    DURABILITY_NOT_CHECKED[durability],
    `Agreement between two independent projections. This compares a replay against a replay of the same log. ${WIDER_VERIFICATION_COMMAND} adds the stronger check, replaying an export against a store snapshot that was folded event by event.`,
    'Anything about a future build. An export that replays here is not a promise that a later schema version reads it — that is what the version field and its migration are for.',
  ]);
}

/**
 * Verify already-serialised export bytes against a live derived state.
 *
 * Separated from {@link prepareExport} so a caller holding bytes from anywhere
 * — a file the user re-imported, a fixture — can run the identical check.
 *
 * @param json       the export, as text.
 * @param liveState  derived state to compare the replay against.
 * @param durability what the caller's store guarantees about a reload. Defaults
 *   to `unknown`, which states the limits of the check without claiming anything
 *   about storage in either direction.
 * @throws ExportEnvelopeError when the text is not a valid envelope of a
 *   version this build implements. A malformed export is not a failed
 *   comparison; reporting it as `equal: false` would hide a parse error behind
 *   a mismatch and send the reader looking for a divergence that is not there.
 */
export function verifyExportBytes(
  json: string,
  liveState: DerivedState,
  durability: StorageDurabilityClaim = 'unknown',
): ExportVerification {
  const result = verifyExportRoundTrip(JSON.parse(json), liveState);
  return {
    equal: result.equal,
    badge: badgeFor(result),
    checked: checkedClaims(result),
    notChecked: notCheckedClaims(durability),
    firstDifference: result.firstDifference,
    eventCount: result.eventCount,
  };
}

/**
 * Build an export and check it, in one call — the whole of what an export
 * button needs.
 *
 * The verification runs against the **bytes**, not against `envelope`, for the
 * reason in the module header.
 */
export function prepareExport(args: PrepareExportArgs): PreparedExport {
  const envelope = buildExportEnvelope({
    events: args.events,
    generatedAt: args.generatedAt,
    appVersions: args.appVersions,
  });
  const json = serializeExportEnvelope(envelope);

  return {
    envelope,
    json,
    byteLength: utf8ByteLength(json),
    verification: verifyExportBytes(json, args.liveState, args.storageDurability ?? 'unknown'),
  };
}

/**
 * A one-line summary of what an export contains, for a UI that wants to show
 * the user what they are about to take away.
 *
 * Counts only. No headword, no encounter text, no note — this string is
 * rendered next to a button and may end up in a screenshot (controller §15).
 */
export function exportSummaryLine(envelope: ExportEnvelope): string {
  const events = envelope.events.length;
  const sources = envelope.seedRefs.length;
  return `${String(events)} event${events === 1 ? '' : 's'} · ${String(sources)} source/licence reference${sources === 1 ? '' : 's'} · export version ${String(envelope.exportVersion)} · schema v${String(envelope.appVersions.schema)}`;
}

/**
 * The licence obligations carried by an export, for the T-15 half of the
 * closure predicate a user can see.
 *
 * Read straight off `seedRefs`, which `collectSeedRefs` derived from the events
 * themselves — so this list cannot claim provenance the log does not hold.
 */
export interface ExportLicenceLine {
  readonly sourceId: string;
  readonly license: string;
  readonly attribution: string | null;
  readonly encounterCount: number;
}

export function exportLicenceLines(envelope: ExportEnvelope): readonly ExportLicenceLine[] {
  return envelope.seedRefs.map((ref) => ({
    sourceId: ref.sourceId,
    license: ref.license,
    attribution: ref.attribution ?? null,
    encounterCount: ref.encounterIds.length,
  }));
}

/**
 * Canonical bytes of a derived state, for a UI that wants to show the two
 * sides of a failed comparison.
 *
 * Re-exported from the domain's own canonicaliser rather than reimplemented,
 * so what a screen displays is the exact text the comparison used.
 */
export function canonicalStateJson(state: DerivedState): string {
  return canonicalJson(state);
}
