/**
 * The export envelope (WP-03; controller §11, REQ-ARCH-08, P0-CAP-12).
 *
 * ```
 * { exportVersion: 1, generatedAt, events: [...], seedRefs,
 *   appVersions: { domain, fsrs, schema } }
 * ```
 *
 * Three properties this module is built to guarantee, in the order they matter:
 *
 * **Lossless.** `events` is the event log verbatim — the same objects the store
 * holds, in the same order, with every field intact. Export does not summarise,
 * filter, or normalise. Derived state is *not* exported: it is re-derived on
 * replay, which is the only way `verify:export` can be a real check rather than
 * a comparison of one serialiser with itself.
 *
 * **Versioned and fail-closed.** `parseExportEnvelope` rejects an unknown
 * `exportVersion` before reading anything else, exactly as `@bunki/domain`'s
 * parser rejects an unknown event `v` before reading a payload field
 * (REQ-DM-04). An importer that guessed would produce state no other build can
 * reproduce.
 *
 * **Deterministic.** `generatedAt` comes from an injected clock and `seedRefs`
 * is derived and sorted. Two exports of one store, taken at one instant, are
 * byte-identical. Determinism is not tidiness here — T-14 compares canonical
 * bytes, so any ambient input would make the check probabilistic.
 *
 * ## What `seedRefs` means here (a narrow reading, recorded on purpose)
 *
 * Controller §11 names the field and does not define its shape. The reading
 * taken is the one that claims least and is checkable: a `seedRef` is a
 * **derived index of the source and licence references the exported events
 * actually cite** — collected from each `EncounterCaptured`'s `sourceRef` and
 * `provenance` (REQ-SRC-01), deduplicated and sorted. It asserts nothing the
 * events do not already contain, which means it cannot drift away from them,
 * and it makes T-15 answerable by inspection: if a licence obligation exists in
 * the log, it is listed at the top level of the export where a human can read
 * it. The alternative reading — an injected manifest of `@bunki/seed` records —
 * would let the export *claim* provenance the events do not carry.
 *
 * `locator` is deliberately excluded from a `seedRef`. It is a per-encounter
 * pointer into the learner's own material (a URL, a timecode), it is removed by
 * the purge path, and a licence index has no use for it. It stays where it
 * belongs: inside the event.
 */

import {
  canonicalJson,
  EVENT_SCHEMA_VERSION,
  MODIFICATION_STATUSES,
  parseEventLog,
  REVIEW_STATUSES,
  SOURCE_KINDS,
  type DomainEvent,
  type IsoInstant,
} from '@bunki/domain';
import { z } from 'zod';

/**
 * The only export version this build emits or accepts. A number, not a string:
 * `exportVersion` on the `DataExported` *event* is a string because ADR-002
 * froze it that way; the envelope's own field is the numeric literal controller
 * §11 specifies. They are different fields on different objects and this
 * comment exists so nobody "fixes" one to match the other.
 */
export const EXPORT_VERSION = 1;

export const SUPPORTED_EXPORT_VERSIONS: readonly number[] = [EXPORT_VERSION];

const nonEmptyString = z.string().min(1);

/**
 * Build identifiers the export was produced by.
 *
 * `fsrs` is `string | null` and `null` is the honest Phase-0 value at WP-03:
 * **no scheduler is pinned in this build yet**. The pin is WP-06's
 * (`packages/domain/src/reducers/fsrs-pin.ts`, controller §6.3), and writing a
 * plausible-looking version string here would be a claim about a component that
 * does not exist. When WP-06 lands, the app passes the real pin through
 * `appVersions.fsrs` and every export after that carries it.
 *
 * `schema` is not injected — it is `EVENT_SCHEMA_VERSION`, read from
 * `@bunki/domain`. A caller cannot mislabel the schema its own events are in.
 */
export const appVersionsSchema = z.strictObject({
  domain: nonEmptyString,
  fsrs: nonEmptyString.nullable(),
  schema: z.literal(EVENT_SCHEMA_VERSION),
});

export type AppVersions = z.infer<typeof appVersionsSchema>;

/** What a caller supplies; `schema` is derived, never accepted. */
export interface AppVersionsInput {
  readonly domain: string;
  readonly fsrs: string | null;
}

/**
 * One source/licence reference cited by the exported events.
 *
 * Every field is copied from an event, never invented. `encounterIds` lists the
 * encounters that cite this reference so an auditor can walk from an obligation
 * back to the records it attaches to.
 */
export const seedRefSchema = z.strictObject({
  sourceId: nonEmptyString,
  kind: z.enum(SOURCE_KINDS),
  source: nonEmptyString,
  sourceVersion: nonEmptyString.optional(),
  license: nonEmptyString,
  attribution: nonEmptyString.optional(),
  modificationStatus: z.enum(MODIFICATION_STATUSES),
  reviewStatus: z.enum(REVIEW_STATUSES),
  /** Ascending; log order is not meaningful for an index. */
  encounterIds: z.array(nonEmptyString).min(1),
});

export type SeedRef = z.infer<typeof seedRefSchema>;

/**
 * The envelope schema.
 *
 * `events` is `z.array(z.unknown())` here on purpose: the envelope's own shape
 * and the events' shapes are two separate fail-closed checks, and running the
 * domain's parser over the log (rather than a duplicate zod union) is what makes
 * "the export replays" mean the same thing as "the domain accepts it".
 * `parseExportEnvelope` runs both, in that order.
 */
export const exportEnvelopeSchema = z.strictObject({
  exportVersion: z.literal(EXPORT_VERSION),
  generatedAt: nonEmptyString,
  events: z.array(z.unknown()),
  seedRefs: z.array(seedRefSchema),
  appVersions: appVersionsSchema,
});

export interface ExportEnvelope {
  readonly exportVersion: typeof EXPORT_VERSION;
  readonly generatedAt: IsoInstant;
  readonly events: readonly DomainEvent[];
  readonly seedRefs: readonly SeedRef[];
  readonly appVersions: AppVersions;
}

// ---------------------------------------------------------------------------
// seedRefs derivation
// ---------------------------------------------------------------------------

interface MutableSeedRef {
  sourceId: string;
  kind: SeedRef['kind'];
  source: string;
  sourceVersion?: string;
  license: string;
  attribution?: string;
  modificationStatus: SeedRef['modificationStatus'];
  reviewStatus: SeedRef['reviewStatus'];
  encounterIds: string[];
}

/**
 * Collect the distinct source/licence references cited by a log.
 *
 * Two encounters that cite the same `sourceId` with *different* provenance
 * produce two refs, not one merged ref. Merging would have to pick a licence,
 * and picking is exactly the silent choice this project refuses everywhere else.
 */
export function collectSeedRefs(events: readonly DomainEvent[]): readonly SeedRef[] {
  const byKey = new Map<string, MutableSeedRef>();

  events.forEach((event) => {
    if (event.type !== 'EncounterCaptured') return;
    const { sourceRef, provenance } = event;

    const ref: MutableSeedRef = {
      sourceId: sourceRef.sourceId,
      kind: sourceRef.kind,
      source: provenance.source,
      ...(provenance.sourceVersion === undefined
        ? {}
        : { sourceVersion: provenance.sourceVersion }),
      license: provenance.license,
      ...(provenance.attribution === undefined ? {} : { attribution: provenance.attribution }),
      modificationStatus: provenance.modificationStatus,
      reviewStatus: provenance.reviewStatus,
      encounterIds: [],
    };

    const key = canonicalJson({ ...ref, encounterIds: undefined });
    const existing = byKey.get(key);
    if (existing === undefined) {
      ref.encounterIds.push(event.encounterId);
      byKey.set(key, ref);
      return;
    }
    if (!existing.encounterIds.includes(event.encounterId)) {
      existing.encounterIds.push(event.encounterId);
    }
  });

  return [...byKey.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, ref]) => ({ ...ref, encounterIds: [...ref.encounterIds].sort() }));
}

// ---------------------------------------------------------------------------
// Build and parse
// ---------------------------------------------------------------------------

export interface BuildExportEnvelopeArgs {
  readonly events: readonly DomainEvent[];
  /** From an injected clock (controller §11) — never `Date.now()`. */
  readonly generatedAt: IsoInstant;
  readonly appVersions: AppVersionsInput;
}

export function buildExportEnvelope(args: BuildExportEnvelopeArgs): ExportEnvelope {
  return {
    exportVersion: EXPORT_VERSION,
    generatedAt: args.generatedAt,
    events: [...args.events],
    seedRefs: collectSeedRefs(args.events),
    appVersions: {
      domain: args.appVersions.domain,
      fsrs: args.appVersions.fsrs,
      schema: EVENT_SCHEMA_VERSION,
    },
  };
}

/** Stable bytes for an envelope. Two exports of one store compare as text. */
export function serializeExportEnvelope(envelope: ExportEnvelope): string {
  return canonicalJson(envelope);
}

export class ExportEnvelopeError extends Error {
  readonly code: 'UNKNOWN_EXPORT_VERSION' | 'MALFORMED_EXPORT_ENVELOPE';

  constructor(code: 'UNKNOWN_EXPORT_VERSION' | 'MALFORMED_EXPORT_ENVELOPE', message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Parse an untrusted export payload, fail-closed, version first.
 *
 * Order matters for the same reason it does in `@bunki/domain`'s event parser:
 * an unknown `exportVersion` means this build cannot know what the other fields
 * mean, so reporting a field-level complaint about them would be a misleading
 * diagnosis that invites someone to patch a field instead of writing a
 * migration.
 */
export function parseExportEnvelope(raw: unknown): ExportEnvelope {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ExportEnvelopeError(
      'MALFORMED_EXPORT_ENVELOPE',
      `Expected an export envelope object, received ${raw === null ? 'null' : Array.isArray(raw) ? 'an array' : typeof raw}.`,
    );
  }

  const version: unknown = (raw as Record<string, unknown>)['exportVersion'];
  if (version !== EXPORT_VERSION) {
    throw new ExportEnvelopeError(
      'UNKNOWN_EXPORT_VERSION',
      `Unknown export version ${JSON.stringify(version)}; this build implements ${SUPPORTED_EXPORT_VERSIONS.join(', ')}. Unknown export versions fail closed, mirroring REQ-DM-04's treatment of unknown event versions.`,
    );
  }

  const parsed = exportEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new ExportEnvelopeError(
      'MALFORMED_EXPORT_ENVELOPE',
      `Export envelope failed validation — ${detail}`,
    );
  }

  // The events go through the domain's own fail-closed parser, not a copy of it.
  const events = parseEventLog(parsed.data.events, { path: 'export.events' });

  return {
    exportVersion: EXPORT_VERSION,
    generatedAt: parsed.data.generatedAt,
    events,
    seedRefs: parsed.data.seedRefs,
    appVersions: parsed.data.appVersions,
  };
}
