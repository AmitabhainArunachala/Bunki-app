/**
 * What the guide surface looks like, as data (Campaign E / B6).
 *
 * The same split `candidate-view-model.ts` makes and for the same reason: this
 * project installs no React Native test renderer, so anything worth asserting
 * has to be a function rather than a render. Every decision on the guide screen
 * — which station the guide is standing at, what the road row says, how the
 * guide's words are labelled — is made here and is driven directly by
 * `test/guide-view-model.test.ts`. The components below map these values onto
 * elements and take no decisions of their own.
 */

import {
  CANDIDATE_LABEL,
  CANDIDATE_STANDING_NOTE,
  OFFLINE_FALLBACK_LABEL,
  OFFLINE_FALLBACK_PROVIDER,
  OFFLINE_FALLBACK_STANDING_NOTE,
} from '@bunki/ai';
import {
  GUIDE_AUTHOR_LABELS,
  ROUTE_LAYER_NAMES,
  type GuidePlanRecord,
  type GuidePosition,
  type GuideProvenance,
  type GuideRouteRecord,
  type RouteWaypoint,
  type WaypointProgress,
} from '@bunki/domain';

import { progressWord } from './guide-progress.ts';

export {
  CANDIDATE_LABEL,
  CANDIDATE_STANDING_NOTE,
  OFFLINE_FALLBACK_LABEL,
  OFFLINE_FALLBACK_STANDING_NOTE,
};

// ---------------------------------------------------------------------------
// Labelling the guide's own words
// ---------------------------------------------------------------------------

export interface GuideSpeechLabels {
  /** Always present. There is no branch in which the guide speaks unlabelled. */
  readonly primary: string;
  /** `offline-fallback`, or `null` for a live answer. Never a replacement. */
  readonly secondary: string | null;
  readonly standingNote: string;
  readonly accessibilityLabel: string;
}

/**
 * The labels for one thing the guide said.
 *
 * `primary` is returned unconditionally, so no code path can render the guide's
 * words without the label — the property `@bunki/ai`'s `labelsFor` establishes
 * for a candidate, restated here for a turn, which is not attached to a thread
 * and so cannot use a `CandidateView`. The strings themselves are imported from
 * `@bunki/ai` rather than retyped: "AI candidate / generated" drifting into
 * something softer is the whole claim, one refactor later.
 */
export function guideSpeechLabels(provider: string | null): GuideSpeechLabels {
  const fallback = provider === OFFLINE_FALLBACK_PROVIDER;
  return {
    primary: CANDIDATE_LABEL,
    secondary: fallback ? OFFLINE_FALLBACK_LABEL : null,
    standingNote: fallback ? OFFLINE_FALLBACK_STANDING_NOTE : CANDIDATE_STANDING_NOTE,
    accessibilityLabel: fallback
      ? `${CANDIDATE_LABEL}, ${OFFLINE_FALLBACK_LABEL}. ${OFFLINE_FALLBACK_STANDING_NOTE}`
      : `${CANDIDATE_LABEL}. ${CANDIDATE_STANDING_NOTE}`,
  };
}

/** Where a turn's words came from, in one line. The four facts, not a summary. */
export function speechOriginLine(provider: string | null, model: string | null): string {
  if (provider === null) return 'Nothing has been asked for this station yet.';
  return `${provider} · ${model ?? 'unnamed model'} · route T2`;
}

// ---------------------------------------------------------------------------
// The road
// ---------------------------------------------------------------------------

/** Where a station stands relative to the two walkers. */
export const ROAD_MARKS = ['learner_here', 'guide_here', 'both_here', 'plain'] as const;
export type RoadMark = (typeof ROAD_MARKS)[number];

export interface RoadRow {
  readonly waypointId: string;
  readonly ordinal: number;
  readonly total: number;
  readonly name: string;
  readonly targetForm: string;
  readonly layer: string;
  readonly layerName: string;
  readonly note: string;
  readonly mark: RoadMark;
  /** True only when the fork the guide is standing at is this station. */
  readonly atDeclaredFork: boolean;
  /** What the learner has done here. Never a claim about recall. */
  readonly progress: string;
  /** The spoken row, so the road is legible without seeing the marks. */
  readonly spoken: string;
}

const MARK_WORDS: Readonly<Record<RoadMark, string>> = Object.freeze({
  learner_here: 'you are here',
  guide_here: 'the guide is here',
  both_here: 'you and the guide are both here',
  plain: '',
});

function markFor(ordinal: number, position: GuidePosition): RoadMark {
  const learner = position.learnerOrdinal === ordinal;
  const guide = position.ordinal === ordinal;
  if (learner && guide) return 'both_here';
  if (learner) return 'learner_here';
  if (guide) return 'guide_here';
  return 'plain';
}

/**
 * The road, row by row.
 *
 * One row per station, always — a road whose length changed with what the
 * learner had done would not be able to say "station 3 of 8", which the
 * competitive round-2 research makes the whole answer to "it never ends".
 */
export function roadRows(
  route: GuideRouteRecord,
  progress: readonly WaypointProgress[],
  position: GuidePosition,
): readonly RoadRow[] {
  const byId = new Map(progress.map((entry) => [entry.waypointId, entry]));
  const total = route.waypoints.length;

  return route.waypoints.map((waypoint: RouteWaypoint) => {
    const mark = markFor(waypoint.ordinal, position);
    const atDeclaredFork = position.stance === 'at_branch' && position.waypointId === waypoint.id;
    const progressText = progressWord(byId.get(waypoint.id));
    const markWord = MARK_WORDS[mark];

    return {
      waypointId: waypoint.id,
      ordinal: waypoint.ordinal,
      total,
      name: waypoint.name,
      targetForm: waypoint.targetForm,
      layer: waypoint.layer,
      layerName: ROUTE_LAYER_NAMES[waypoint.layer],
      note: waypoint.note,
      mark,
      atDeclaredFork,
      progress: progressText,
      spoken: [
        `Station ${waypoint.ordinal} of ${total}, ${waypoint.name}`,
        `${ROUTE_LAYER_NAMES[waypoint.layer]} layer`,
        progressText,
        markWord,
        atDeclaredFork ? 'a fork was declared here' : '',
      ]
        .filter((part) => part !== '')
        .join('. '),
    };
  });
}

/** "Station 4 of 8 · the guide is one ahead of you" — the whole position, spoken. */
export function positionHeadline(position: GuidePosition): string {
  switch (position.stance) {
    case 'no_road':
      return 'The guide has no road yet';
    case 'at_branch':
      return `At the fork · station ${position.ordinal ?? 0} of ${position.total}`;
    case 'at_the_end':
      return `At the last station · ${position.total} of ${position.total}`;
    case 'ahead_on_road':
    default:
      return `One ahead of you · station ${position.ordinal ?? 0} of ${position.total}`;
  }
}

/** Where the learner stands, as the finite count a queue cannot produce. */
export function learnerHeadline(position: GuidePosition): string {
  if (position.learnerOrdinal === null) return 'You are not on a road yet.';
  return `You are at station ${position.learnerOrdinal} of ${position.total}.`;
}

// ---------------------------------------------------------------------------
// Provenance, rendered
// ---------------------------------------------------------------------------

/**
 * One line answering "what did the guide believe, and when".
 *
 * Both halves, always. A provenance line that dropped the time would answer
 * half the question the map document asks this record to answer.
 */
export function provenanceLine(provenance: GuideProvenance): string {
  const from =
    provenance.basisTurnIds.length === 0
      ? 'from no conversation turns'
      : `from ${provenance.basisTurnIds.length} ${
          provenance.basisTurnIds.length === 1 ? 'turn' : 'turns'
        } of the conversation`;
  const model =
    provenance.provider === null
      ? ''
      : ` · ${provenance.provider}${provenance.model === null ? '' : ` · ${provenance.model}`}`;
  return `${GUIDE_AUTHOR_LABELS[provenance.author]} at ${provenance.at} · ${from}${model}`;
}

export interface RecordSummary {
  readonly recordId: string;
  readonly title: string;
  readonly horizon: string;
  readonly provenance: string;
  readonly supersedes: string | null;
  readonly itemCount: number;
}

export function summarise(record: GuideRouteRecord | GuidePlanRecord): RecordSummary {
  return {
    recordId: record.recordId,
    title: record.title,
    horizon: record.horizon === 'months' ? 'the long road, in months' : 'the next few days',
    provenance: provenanceLine(record.provenance),
    supersedes: record.supersedes,
    itemCount:
      record.guideArtefact === 'guide_route' ? record.waypoints.length : record.steps.length,
  };
}
