/**
 * The two records the guide writes: a long-term route and a short-term plan
 * (Campaign E / B6; map document §4.2).
 *
 * > The estimate produces two things: a **long-term route** — which era layers
 * > and which domains this learner is walking toward, in months; and a
 * > **short-term plan** — the next few stations, in days. Both are **visible,
 * > editable, and revisable**, and both are written down as records with
 * > provenance, so a learner can see what the guide believed and when.
 *
 * Four properties are structural here rather than conventional:
 *
 * **Every record carries a timestamp and an author.** {@link GuideProvenance}
 * has no optional `at` and no optional `author`, so a record with no time on it
 * is not representable. "What the guide believed and when" is answerable
 * because the second half cannot be omitted.
 *
 * **Every record is a proposal and says so in its type.** `standing` is the
 * literal `'proposal'`. There is no other inhabitant, so no code path can
 * produce a guide record that claims a stronger standing, and
 * `GUIDE_RECORD_STANDING_NOTE` cannot drift out of agreement with the data.
 *
 * **Revision supersedes rather than mutates.** Editing produces a new record
 * whose `supersedes` names the old one, and the ledger keeps both. A learner
 * who wants to know what the guide said last week can read it; nothing is
 * rewritten, which is the same rule the event log lives by (REQ-DM-04.2).
 *
 * **Ordinals are recomputed on every revision.** "Station 3 of 8" has to stay
 * true after a waypoint is removed, and a stored ordinal that nobody
 * renumbers is how "station 3 of 8" quietly becomes a lie about a seven-station
 * road. {@link renumber} is applied by every constructor in this file.
 */

import type { CapabilityLens } from '../graph/lenses.ts';
import type { IsoInstant } from '../primitives.ts';
import type { GuideArtefact } from './boundary.ts';

/**
 * The three era layers of the map document §2, as the route's own vocabulary.
 *
 * They are a coordinate, not a difficulty band: a layer says *when a word
 * entered the language and by what road*, and nothing whatever about the
 * learner. Nothing in this module reads a layer to decide anything about
 * strength, order of difficulty, or readiness.
 */
export const ROUTE_LAYERS = ['kodo', 'kaido', 'tetsudo'] as const;

export type RouteLayer = (typeof ROUTE_LAYERS)[number];

export const ROUTE_LAYER_NAMES: Readonly<Record<RouteLayer, string>> = Object.freeze({
  kodo: '古道',
  kaido: '街道',
  tetsudo: '鉄道',
});

export const ROUTE_LAYER_BLURBS: Readonly<Record<RouteLayer, string>> = Object.freeze({
  kodo: 'The old walking roads — Nara and Heian and after: native vocabulary, kun readings, the first Chinese imports.',
  kaido:
    'The Edo highways and their post stations: 漢語 in daily use, the vocabulary of trade, travel and place.',
  tetsudo:
    'The rail network laid over the old roads, Meiji onward: Meiji coinages, katakana loans, signage.',
});

/** Presentation order: oldest road first. Ties in every ordering break on this. */
export function routeLayerRank(layer: RouteLayer): number {
  return ROUTE_LAYERS.indexOf(layer);
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Who wrote a record.
 *
 * `guide_ai` and `guide_offline_fixture` are told apart for the same reason
 * `@bunki/ai` tells a live candidate from a served fixture: presenting scripted
 * text as a live model's answer is forbidden, and a record that recorded only
 * "the guide" would lose the distinction the moment it was written down.
 */
export const GUIDE_AUTHORS = ['guide_ai', 'guide_offline_fixture', 'learner_edit'] as const;

export type GuideAuthor = (typeof GUIDE_AUTHORS)[number];

export const GUIDE_AUTHOR_LABELS: Readonly<Record<GuideAuthor, string>> = Object.freeze({
  guide_ai: 'proposed by the guide, from a live model',
  guide_offline_fixture: 'proposed by the guide, from the app’s own pre-written text',
  learner_edit: 'edited by you',
});

export interface GuideProvenance {
  readonly author: GuideAuthor;
  /** When. Required — a record with no time answers half the question. */
  readonly at: IsoInstant;
  /**
   * The conversation turns this came from, oldest first.
   *
   * Empty for a learner edit, which came from the learner rather than from the
   * exchange. Never a summary: the ids are here so a surface can show *which*
   * answers a proposal was built on.
   */
  readonly basisTurnIds: readonly string[];
  /** The model that produced the guide's words, or `null`. Never invented. */
  readonly model: string | null;
  /** `offline-fallback` for a fixture-served exchange, or the provider's name. */
  readonly provider: string | null;
  readonly promptVersion: string | null;
  /** A literal. A guide record has exactly one possible standing. */
  readonly standing: 'proposal';
}

export interface GuideProvenanceInput {
  readonly author: GuideAuthor;
  readonly at: IsoInstant;
  readonly basisTurnIds?: readonly string[] | undefined;
  readonly model?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly promptVersion?: string | null | undefined;
}

export function guideProvenance(input: GuideProvenanceInput): GuideProvenance {
  return Object.freeze({
    author: input.author,
    at: input.at,
    basisTurnIds: Object.freeze([...(input.basisTurnIds ?? [])]),
    model: input.model ?? null,
    provider: input.provider ?? null,
    promptVersion: input.promptVersion ?? null,
    standing: 'proposal' as const,
  });
}

// ---------------------------------------------------------------------------
// Waypoints and steps
// ---------------------------------------------------------------------------

/**
 * A candidate station, before it is on anyone's road.
 *
 * Supplied by the caller — in the app, from `@bunki/seed`. The kernel holds no
 * vocabulary of its own, so a route can never contain a word the data does not
 * have.
 */
export interface RouteWaypointCandidate {
  readonly id: string;
  readonly layer: RouteLayer;
  /** The station's name, in Japanese. */
  readonly name: string;
  /** The written form this station is about. */
  readonly targetForm: string;
  /** Which lens this station serves. Never absent: a station with no lens is a rollup. */
  readonly lens: CapabilityLens;
  /** One line: what this station is for. Never a claim about the learner. */
  readonly note: string;
}

/** A station on a route. A candidate that has been given a position. */
export interface RouteWaypoint extends RouteWaypointCandidate {
  /** 1-based, and always contiguous. Renumbered on every revision. */
  readonly ordinal: number;
}

/** A step of the short-term plan. Days, not months. */
export interface PlanStep {
  readonly id: string;
  readonly ordinal: number;
  readonly targetForm: string;
  readonly lens: CapabilityLens;
  /**
   * What the guide is inviting, in one line.
   *
   * Phrased as an invitation because that is all it can be: the guide cannot
   * schedule this, cannot require it, and cannot record that it happened.
   */
  readonly invitation: string;
}

function renumber<T extends { readonly ordinal: number }>(items: readonly T[]): readonly T[] {
  return Object.freeze(items.map((item, index) => Object.freeze({ ...item, ordinal: index + 1 })));
}

// ---------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------

export interface GuideRouteRecord extends GuideArtefact {
  readonly guideArtefact: 'guide_route';
  readonly recordId: string;
  readonly horizon: 'months';
  /** The road's name. The learner may change it. */
  readonly title: string;
  readonly waypoints: readonly RouteWaypoint[];
  readonly provenance: GuideProvenance;
  /** The record this one replaces, or `null` for the first. */
  readonly supersedes: string | null;
}

export interface GuidePlanRecord extends GuideArtefact {
  readonly guideArtefact: 'guide_plan';
  readonly recordId: string;
  readonly horizon: 'days';
  readonly title: string;
  readonly steps: readonly PlanStep[];
  readonly provenance: GuideProvenance;
  readonly supersedes: string | null;
}

export interface RouteRecordInput {
  readonly recordId: string;
  readonly title: string;
  readonly waypoints: readonly RouteWaypointCandidate[];
  readonly provenance: GuideProvenance;
  readonly supersedes?: string | null | undefined;
}

export function routeRecord(input: RouteRecordInput): GuideRouteRecord {
  return Object.freeze({
    guideArtefact: 'guide_route' as const,
    recordId: input.recordId,
    horizon: 'months' as const,
    title: input.title,
    waypoints: renumber(input.waypoints.map((candidate) => ({ ...candidate, ordinal: 0 }))),
    provenance: input.provenance,
    supersedes: input.supersedes ?? null,
  });
}

export interface PlanRecordInput {
  readonly recordId: string;
  readonly title: string;
  readonly steps: readonly Omit<PlanStep, 'ordinal'>[];
  readonly provenance: GuideProvenance;
  readonly supersedes?: string | null | undefined;
}

export function planRecord(input: PlanRecordInput): GuidePlanRecord {
  return Object.freeze({
    guideArtefact: 'guide_plan' as const,
    recordId: input.recordId,
    horizon: 'days' as const,
    title: input.title,
    steps: renumber(input.steps.map((step) => ({ ...step, ordinal: 0 }))),
    provenance: input.provenance,
    supersedes: input.supersedes ?? null,
  });
}

// ---------------------------------------------------------------------------
// Editing — every edit is a new record that supersedes the old one
// ---------------------------------------------------------------------------

/**
 * Drop a station.
 *
 * Returns the record unchanged when the id is not on it, rather than throwing:
 * a double-tap on a remove control is a UI event, not a programming error, and
 * a new superseding record for a no-op edit would put a spurious entry in the
 * history a learner reads.
 */
export function withoutWaypoint(
  record: GuideRouteRecord,
  waypointId: string,
  recordId: string,
  provenance: GuideProvenance,
): GuideRouteRecord {
  const kept = record.waypoints.filter((waypoint) => waypoint.id !== waypointId);
  if (kept.length === record.waypoints.length) return record;
  return Object.freeze({
    ...record,
    recordId,
    waypoints: renumber(kept),
    provenance,
    supersedes: record.recordId,
  });
}

/**
 * Move a station one place earlier or later.
 *
 * `delta` is clamped to a single step in either direction, and a move off
 * either end is a no-op. Reordering rather than free positioning keeps the
 * gesture one tap, which is the same rule REQ-UI-01 sets for the uncertainty
 * mark.
 */
export function withWaypointMoved(
  record: GuideRouteRecord,
  waypointId: string,
  delta: -1 | 1,
  recordId: string,
  provenance: GuideProvenance,
): GuideRouteRecord {
  const index = record.waypoints.findIndex((waypoint) => waypoint.id === waypointId);
  if (index < 0) return record;
  const target = index + delta;
  if (target < 0 || target >= record.waypoints.length) return record;

  const moved = [...record.waypoints];
  const [lifted] = moved.splice(index, 1);
  if (lifted === undefined) return record;
  moved.splice(target, 0, lifted);

  return Object.freeze({
    ...record,
    recordId,
    waypoints: renumber(moved),
    provenance,
    supersedes: record.recordId,
  });
}

/** Rename the road. The learner's own words for where they are going. */
export function withRouteTitle(
  record: GuideRouteRecord,
  title: string,
  recordId: string,
  provenance: GuideProvenance,
): GuideRouteRecord {
  if (title === record.title) return record;
  return Object.freeze({ ...record, recordId, title, provenance, supersedes: record.recordId });
}

/** Drop a step from the short-term plan. */
export function withoutPlanStep(
  record: GuidePlanRecord,
  stepId: string,
  recordId: string,
  provenance: GuideProvenance,
): GuidePlanRecord {
  const kept = record.steps.filter((step) => step.id !== stepId);
  if (kept.length === record.steps.length) return record;
  return Object.freeze({
    ...record,
    recordId,
    steps: renumber(kept),
    provenance,
    supersedes: record.recordId,
  });
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

/**
 * Every route and plan the guide has written, oldest first.
 *
 * Append-only. Nothing here removes a record, because "see what the guide
 * believed and when" is exactly the property that a delete would break.
 */
export interface GuideLedger {
  readonly routes: readonly GuideRouteRecord[];
  readonly plans: readonly GuidePlanRecord[];
}

export const EMPTY_GUIDE_LEDGER: GuideLedger = Object.freeze({
  routes: Object.freeze([]),
  plans: Object.freeze([]),
});

export function recordRoute(ledger: GuideLedger, record: GuideRouteRecord): GuideLedger {
  if (ledger.routes.some((existing) => existing.recordId === record.recordId)) return ledger;
  return Object.freeze({
    routes: Object.freeze([...ledger.routes, record]),
    plans: ledger.plans,
  });
}

export function recordPlan(ledger: GuideLedger, record: GuidePlanRecord): GuideLedger {
  if (ledger.plans.some((existing) => existing.recordId === record.recordId)) return ledger;
  return Object.freeze({
    routes: ledger.routes,
    plans: Object.freeze([...ledger.plans, record]),
  });
}

/** The route in force, or `null` before the guide has written one. */
export function currentRoute(ledger: GuideLedger): GuideRouteRecord | null {
  return ledger.routes.at(-1) ?? null;
}

export function currentPlan(ledger: GuideLedger): GuidePlanRecord | null {
  return ledger.plans.at(-1) ?? null;
}

/** Everything the guide has believed about the road, newest first. */
export function routeHistory(ledger: GuideLedger): readonly GuideRouteRecord[] {
  return Object.freeze([...ledger.routes].reverse());
}

export function planHistory(ledger: GuideLedger): readonly GuidePlanRecord[] {
  return Object.freeze([...ledger.plans].reverse());
}

/** Records that a later one replaced. Kept, never deleted. */
export function isSuperseded(
  ledger: GuideLedger,
  record: GuideRouteRecord | GuidePlanRecord,
): boolean {
  const all: readonly { readonly supersedes: string | null }[] =
    record.guideArtefact === 'guide_route' ? ledger.routes : ledger.plans;
  return all.some((entry) => entry.supersedes === record.recordId);
}
