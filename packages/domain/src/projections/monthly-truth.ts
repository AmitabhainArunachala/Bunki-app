/**
 * A2 monthly truth: a pure, UTC-month projection over the canonical event log.
 *
 * This module deliberately projects records, not ability. A v1 `ReviewGraded`
 * says that a grade was recorded under a contract and lets replay report what
 * the evidence gate did with it. It does not carry the submitted response or
 * the authority that graded that response, so this projection cannot turn it
 * into independently verified recall. The closed `recorded_claim` standing
 * below makes that limitation structural rather than a sentence a caller may
 * forget to render.
 *
 * Exposure, lookup, self-report, AI-candidate, and import signals have separate
 * discriminants and separate arrays. None is assignable to a retrieval claim,
 * and none contributes to a capability schedule. There is intentionally no
 * overall number, percentage, rank, level, or cross-capability aggregate.
 */

import {
  bindRetrievalContract,
  type BoundRetrievalContractFailure,
} from '../contracts/bound-retrieval-contract.ts';
import type { Modality, RetrievalSkill } from '../contracts/retrieval-contract.ts';
import type {
  ContractCreatedEvent,
  DomainEvent,
  ProductionObservedEvent,
  ReviewGradedEvent,
} from '../events/catalog.ts';
import type {
  EvidenceTier,
  Grade,
  LookupContext,
  LookupTargetRef,
  SourceRef,
} from '../events/shared.ts';
import { parseEventLog } from '../events/parse.ts';
import type { GateRejectionReason } from '../evidence/gate.ts';
import type { IsoInstant } from '../primitives.ts';
import type { MemoryPhase } from '../reducers/memory-state.ts';
import { replay } from '../replay/replay.ts';

/** Canonical calendar bucket: UTC year and month, never the device locale. */
export type MonthId = string;

const MONTH_ID_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthId(value: unknown): value is MonthId {
  return typeof value === 'string' && MONTH_ID_PATTERN.test(value);
}

export class MonthlyTruthProjectionError extends Error {
  readonly code = 'INVALID_MONTH';

  constructor(readonly month: unknown) {
    super(
      `monthly truth requires a canonical UTC month (YYYY-MM); received ${JSON.stringify(month)}`,
    );
    this.name = 'MonthlyTruthProjectionError';
  }
}

function requireMonthId(value: unknown): asserts value is MonthId {
  if (!isMonthId(value)) throw new MonthlyTruthProjectionError(value);
}

/** The seven retrieval-capability rows. Source exposure is the eighth row. */
export const MONTHLY_CAPABILITY_IDS = [
  'recognition',
  'meaning_recall',
  'production',
  'listening',
  'kanji_reading',
  'writing',
  'grammar_discrimination',
] as const;

export type MonthlyCapabilityId = (typeof MONTHLY_CAPABILITY_IDS)[number];

export const MONTHLY_LENS_IDS = [...MONTHLY_CAPABILITY_IDS, 'source_familiarity_exposure'] as const;

export type MonthlyLensId = (typeof MONTHLY_LENS_IDS)[number];

export type MonthlyCapabilitySupport =
  | {
      readonly kind: 'classifiable_from_v1_contract';
      readonly basis:
        | 'form_to_meaning_choice_response'
        | 'form_to_meaning_text_or_free_response'
        | 'meaning_to_production'
        | 'audio_to_meaning_with_audio_cue';
    }
  | {
      readonly kind: 'unresolved_in_v1';
      readonly reason:
        | 'component_has_no_kanji_or_lexeme_kind'
        | 'no_writing_retrieval_skill'
        | 'component_has_no_grammar_or_lexical_kind';
    };

const CAPABILITY_SUPPORT: Readonly<Record<MonthlyCapabilityId, MonthlyCapabilitySupport>> =
  Object.freeze({
    recognition: Object.freeze({
      kind: 'classifiable_from_v1_contract',
      basis: 'form_to_meaning_choice_response',
    }),
    meaning_recall: Object.freeze({
      kind: 'classifiable_from_v1_contract',
      basis: 'form_to_meaning_text_or_free_response',
    }),
    production: Object.freeze({
      kind: 'classifiable_from_v1_contract',
      basis: 'meaning_to_production',
    }),
    listening: Object.freeze({
      kind: 'classifiable_from_v1_contract',
      basis: 'audio_to_meaning_with_audio_cue',
    }),
    kanji_reading: Object.freeze({
      kind: 'unresolved_in_v1',
      reason: 'component_has_no_kanji_or_lexeme_kind',
    }),
    writing: Object.freeze({
      kind: 'unresolved_in_v1',
      reason: 'no_writing_retrieval_skill',
    }),
    grammar_discrimination: Object.freeze({
      kind: 'unresolved_in_v1',
      reason: 'component_has_no_grammar_or_lexical_kind',
    }),
  });

/** Exact current schedule, kept per contract and never averaged. */
export interface MonthlyCurrentContractSchedule {
  readonly standing: 'current_at_replay_end_not_historical_month_end';
  readonly active: boolean;
  readonly phase: MemoryPhase;
  readonly stability: number;
  readonly difficulty: number;
  readonly dueAt: IsoInstant;
  readonly lastReviewedAt: IsoInstant | null;
  readonly reps: number;
  readonly lapses: number;
  readonly admittedReviewCount: number;
}

export type MonthlyContractLineage =
  | {
      readonly kind: 'bound';
      readonly threadId: string;
      readonly originEncounterId: string;
      readonly sourceRef: SourceRef;
    }
  | {
      readonly kind: 'unresolved';
      readonly reason: BoundRetrievalContractFailure['reason'];
    };

export interface MonthlyCapabilityContract {
  readonly contractId: string;
  readonly createdAt: IsoInstant;
  readonly targetComponentId: string;
  readonly skill: RetrievalSkill;
  readonly cueModality: Modality;
  readonly responseModality: Modality;
  readonly promptFamilyVersion: string;
  readonly lineage: MonthlyContractLineage;
  readonly currentSchedule: MonthlyCurrentContractSchedule | null;
}

export type MonthlyGateStanding =
  | {
      readonly kind: 'admitted_by_replay_gate';
      readonly effectiveGrade: Grade;
      readonly forcedByReveal: boolean;
    }
  | {
      readonly kind: 'rejected_by_replay_gate';
      readonly reason: GateRejectionReason;
    };

/**
 * What v1 can honestly say about a ReviewGraded record.
 *
 * There is intentionally no `verified` member. When a future event schema
 * carries a response and grader authority, extending this union and the
 * exhaustive classifier will be an explicit integration act; no app-local
 * annotation can silently upgrade legacy history in the meantime.
 */
export interface MonthlyRecordedRetrievalClaim {
  readonly kind: 'recorded_retrieval_claim';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly contractId: string;
  readonly submittedGrade: Grade;
  readonly effectiveGrade: Grade | null;
  readonly latencyMs: number;
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
  readonly probeContext: ReviewGradedEvent['probeContext'];
  readonly evidenceTier: 'A';
  readonly authority: {
    readonly kind: 'recorded_claim';
    readonly reason: 'response_and_grader_authority_not_recorded_in_v1';
  };
  readonly gate: MonthlyGateStanding;
}

export interface MonthlyProductionObservation {
  readonly kind: 'production_observation';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly contractId: string;
  readonly evidenceTier: Extract<EvidenceTier, 'B' | 'C'>;
  readonly elicited: boolean;
  readonly rubricId: string | null;
  readonly rubricVersion: string | null;
  readonly standing: 'conservative_observation_not_fsrs_retrieval';
}

export interface MonthlyCapabilityLens {
  readonly id: MonthlyCapabilityId;
  readonly support: MonthlyCapabilitySupport;
  readonly contracts: readonly MonthlyCapabilityContract[];
  readonly retrievalClaims: readonly MonthlyRecordedRetrievalClaim[];
  readonly productionObservations: readonly MonthlyProductionObservation[];
}

export type MonthlyUnresolvedReason =
  | 'orthography_target_kind_missing'
  | 'discrimination_target_kind_missing'
  | 'form_to_meaning_response_not_classifiable'
  | 'audio_to_meaning_cue_is_not_audio'
  | 'contract_unknown'
  | 'production_contract_missing'
  | 'production_contract_is_not_production';

export interface MonthlyUnresolvedRecord {
  readonly kind: 'contract' | 'recorded_retrieval_claim' | 'production_observation';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly contractId: string | null;
  readonly declaredSkill: RetrievalSkill | null;
  readonly reason: MonthlyUnresolvedReason;
}

// ---------------------------------------------------------------------------
// Non-retrieval signal partition
// ---------------------------------------------------------------------------

export const MONTHLY_NON_RETRIEVAL_KINDS = [
  'exposure',
  'self_report',
  'lookup',
  'ai',
  'import',
] as const;

export type MonthlyNonRetrievalKind = (typeof MONTHLY_NON_RETRIEVAL_KINDS)[number];

export interface MonthlyExposureSignal {
  readonly kind: 'exposure';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly experienceId: string;
  readonly componentIds: readonly string[];
  readonly evidenceTier: 'D';
  readonly standing: 'exposure_only_never_retrieval';
  readonly sourceLink: {
    readonly kind: 'unresolved';
    readonly reason: 'exposure_event_has_no_source_ref';
  };
}

export interface MonthlySelfReportSignal {
  readonly kind: 'self_report';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly threadId: string;
  readonly report: 'uncertainty_mark';
  readonly standing: 'diagnostic_only_not_retrieval';
}

export interface MonthlyLookupSignal {
  readonly kind: 'lookup';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly targetRef: LookupTargetRef;
  readonly context: LookupContext;
  readonly standing: 'friction_not_grade';
}

export interface MonthlyAiSignal {
  readonly kind: 'ai';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly candidateId: string;
  readonly action: 'candidate_attached' | 'candidate_accepted_as_note';
  readonly threadId: string | null;
  readonly standing: 'candidate_or_note_not_evidence';
}

export interface MonthlyImportSignal {
  readonly kind: 'import';
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly encounterId: string;
  readonly threadId: string;
  readonly sourceRef: SourceRef;
  readonly standing: 'encounter_only_imported_history_not_assumed';
}

export interface MonthlyNonRetrievalSignals {
  readonly exposure: readonly MonthlyExposureSignal[];
  readonly selfReport: readonly MonthlySelfReportSignal[];
  readonly lookup: readonly MonthlyLookupSignal[];
  readonly ai: readonly MonthlyAiSignal[];
  readonly import: readonly MonthlyImportSignal[];
}

export interface MonthlySourceEncounter {
  readonly eventId: string;
  readonly occurredAt: IsoInstant;
  readonly encounterId: string;
  readonly threadId: string;
  readonly sourceRef: SourceRef;
}

/** The eighth visible row. Familiarity is explicitly not inferred from exposure. */
export interface MonthlySourceExposureLens {
  readonly id: 'source_familiarity_exposure';
  readonly familiarityStanding: 'not_inferred';
  readonly sourceEncounters: readonly MonthlySourceEncounter[];
  readonly exposureEventIds: readonly string[];
}

export interface MonthlyTruth {
  readonly schemaVersion: 1;
  readonly month: MonthId;
  readonly timeBasis: 'event_occurred_at_utc';
  readonly orderingBasis: 'canonical_append_order';
  readonly correctionBasis: 'current_full_log_supersession';
  readonly capabilities: readonly MonthlyCapabilityLens[];
  readonly sourceExposure: MonthlySourceExposureLens;
  readonly nonRetrievalSignals: MonthlyNonRetrievalSignals;
  readonly unresolvedRecords: readonly MonthlyUnresolvedRecord[];
}

type CapabilityClassification =
  | { readonly classified: true; readonly capability: MonthlyCapabilityId }
  | { readonly classified: false; readonly reason: MonthlyUnresolvedReason };

function classifyContract(event: ContractCreatedEvent): CapabilityClassification {
  switch (event.skill) {
    case 'form_to_meaning':
      if (event.responseModality === 'choice') {
        return { classified: true, capability: 'recognition' };
      }
      if (event.responseModality === 'text' || event.responseModality === 'free') {
        return { classified: true, capability: 'meaning_recall' };
      }
      return { classified: false, reason: 'form_to_meaning_response_not_classifiable' };

    case 'meaning_to_production':
      return { classified: true, capability: 'production' };

    case 'audio_to_meaning':
      return event.cueModality === 'audio'
        ? { classified: true, capability: 'listening' }
        : { classified: false, reason: 'audio_to_meaning_cue_is_not_audio' };

    case 'orthography_to_reading':
      return { classified: false, reason: 'orthography_target_kind_missing' };

    case 'discrimination':
      return { classified: false, reason: 'discrimination_target_kind_missing' };
  }
}

function monthOf(instant: IsoInstant): MonthId {
  return instant.slice(0, 7);
}

/**
 * Replay validates conflicts/invariants first. Once it succeeds, a repeated
 * event id can only be the byte-identical idempotent re-append replay skipped.
 */
function appliedEvents(events: readonly DomainEvent[]): {
  readonly events: readonly DomainEvent[];
  readonly state: ReturnType<typeof replay>;
} {
  // The public type documents the normal caller (`AppStore.readAll()`), while
  // this parse is the runtime boundary for imports, `any`, and future schemas.
  // Unknown versions/types fail here instead of falling through a projection
  // switch and disappearing from the monthly record.
  const parsed = parseEventLog(events, { path: '<monthly-truth.events>' });
  const state = replay(parsed);
  const seen = new Set<string>();
  return {
    state,
    events: parsed.filter((event) => {
      if (seen.has(event.eventId)) return false;
      seen.add(event.eventId);
      return true;
    }),
  };
}

/** Distinct UTC months present in the applied log, newest first. */
export function availableMonthlyTruthMonths(events: readonly DomainEvent[]): readonly MonthId[] {
  const applied = appliedEvents(events).events;
  return deepFreeze(
    [...new Set(applied.map((event) => monthOf(event.occurredAt)))].sort().reverse(),
  );
}

function sourceRefCopy(sourceRef: SourceRef): SourceRef {
  return {
    sourceId: sourceRef.sourceId,
    kind: sourceRef.kind,
    ...(sourceRef.locator === undefined ? {} : { locator: sourceRef.locator }),
  };
}

function contractSummary(
  event: ContractCreatedEvent,
  allEvents: readonly DomainEvent[],
  state: ReturnType<typeof replay>,
): MonthlyCapabilityContract {
  const memory = state.memoryStates.find((candidate) => candidate.contractId === event.contractId);
  const binding = bindRetrievalContract(allEvents, event.contractId);
  const lineage: MonthlyContractLineage = binding.bound
    ? {
        kind: 'bound',
        threadId: binding.value.threadId,
        originEncounterId: binding.value.originEncounterId,
        sourceRef: sourceRefCopy(binding.value.sourceRef),
      }
    : { kind: 'unresolved', reason: binding.failure.reason };

  return {
    contractId: event.contractId,
    createdAt: event.occurredAt,
    targetComponentId: event.targetComponentId,
    skill: event.skill,
    cueModality: event.cueModality,
    responseModality: event.responseModality,
    promptFamilyVersion: event.promptFamilyVersion,
    lineage,
    currentSchedule:
      memory === undefined
        ? null
        : {
            standing: 'current_at_replay_end_not_historical_month_end',
            active: memory.active,
            phase: memory.phase,
            stability: memory.stability,
            difficulty: memory.difficulty,
            dueAt: memory.dueAt,
            lastReviewedAt: memory.lastReviewedAt,
            reps: memory.reps,
            lapses: memory.lapses,
            admittedReviewCount: memory.admittedReviewCount,
          },
  };
}

function gateStanding(
  event: ReviewGradedEvent,
  state: ReturnType<typeof replay>,
): MonthlyGateStanding {
  const decision = state.gateDecisions.find((candidate) => candidate.eventId === event.eventId);
  if (decision?.admitted === true && decision.effectiveGrade !== null) {
    return {
      kind: 'admitted_by_replay_gate',
      effectiveGrade: decision.effectiveGrade,
      forcedByReveal: decision.forcedByReveal,
    };
  }
  return {
    kind: 'rejected_by_replay_gate',
    reason: decision?.reason ?? 'not_a_graded_review',
  };
}

function retrievalClaim(
  event: ReviewGradedEvent,
  state: ReturnType<typeof replay>,
): MonthlyRecordedRetrievalClaim {
  const gate = gateStanding(event, state);
  return {
    kind: 'recorded_retrieval_claim',
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    contractId: event.contractId,
    submittedGrade: event.grade,
    effectiveGrade: gate.kind === 'admitted_by_replay_gate' ? gate.effectiveGrade : null,
    latencyMs: event.latencyMs,
    hintsUsed: event.hintsUsed,
    revealedBeforeRecall: event.revealedBeforeRecall,
    probeContext: event.probeContext,
    evidenceTier: event.tier,
    authority: {
      kind: 'recorded_claim',
      reason: 'response_and_grader_authority_not_recorded_in_v1',
    },
    gate,
  };
}

function productionObservation(event: ProductionObservedEvent): MonthlyProductionObservation {
  return {
    kind: 'production_observation',
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    contractId: event.contractId ?? '',
    evidenceTier: event.tier,
    elicited: event.elicited,
    rubricId: event.rubricId ?? null,
    rubricVersion: event.rubricVersion ?? null,
    standing: 'conservative_observation_not_fsrs_retrieval',
  };
}

interface MutableCapabilityLens {
  id: MonthlyCapabilityId;
  support: MonthlyCapabilitySupport;
  contracts: MonthlyCapabilityContract[];
  retrievalClaims: MonthlyRecordedRetrievalClaim[];
  productionObservations: MonthlyProductionObservation[];
}

/** Project one UTC month without reading a clock, locale, network, or app store. */
export function deriveMonthlyTruth(events: readonly DomainEvent[], month: MonthId): MonthlyTruth {
  requireMonthId(month);
  const applied = appliedEvents(events);
  const allEvents = applied.events;
  const state = applied.state;
  const monthEvents = allEvents.filter((event) => monthOf(event.occurredAt) === month);
  const contractsById = new Map(
    allEvents
      .filter((event): event is ContractCreatedEvent => event.type === 'ContractCreated')
      .map((event) => [event.contractId, event]),
  );

  const mutable = new Map<MonthlyCapabilityId, MutableCapabilityLens>(
    MONTHLY_CAPABILITY_IDS.map((id) => [
      id,
      {
        id,
        support: CAPABILITY_SUPPORT[id],
        contracts: [],
        retrievalClaims: [],
        productionObservations: [],
      },
    ]),
  );
  const unresolved: MonthlyUnresolvedRecord[] = [];
  const relevantContracts = new Map<string, MonthlyCapabilityId>();

  for (const event of monthEvents) {
    if (event.type === 'ContractCreated') {
      const classification = classifyContract(event);
      if (classification.classified) {
        relevantContracts.set(event.contractId, classification.capability);
      } else {
        unresolved.push({
          kind: 'contract',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          contractId: event.contractId,
          declaredSkill: event.skill,
          reason: classification.reason,
        });
      }
      continue;
    }

    if (event.type === 'ReviewGraded') {
      const contract = contractsById.get(event.contractId);
      if (contract === undefined) {
        unresolved.push({
          kind: 'recorded_retrieval_claim',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          contractId: event.contractId,
          declaredSkill: null,
          reason: 'contract_unknown',
        });
        continue;
      }
      const classification = classifyContract(contract);
      if (!classification.classified) {
        unresolved.push({
          kind: 'recorded_retrieval_claim',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          contractId: event.contractId,
          declaredSkill: contract.skill,
          reason: classification.reason,
        });
        continue;
      }
      relevantContracts.set(contract.contractId, classification.capability);
      mutable.get(classification.capability)?.retrievalClaims.push(retrievalClaim(event, state));
      continue;
    }

    if (event.type === 'ProductionObserved') {
      if (event.contractId === undefined) {
        unresolved.push({
          kind: 'production_observation',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          contractId: null,
          declaredSkill: null,
          reason: 'production_contract_missing',
        });
        continue;
      }
      const contract = contractsById.get(event.contractId);
      if (contract === undefined) {
        unresolved.push({
          kind: 'production_observation',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          contractId: event.contractId,
          declaredSkill: null,
          reason: 'contract_unknown',
        });
        continue;
      }
      const classification = classifyContract(contract);
      if (!classification.classified || classification.capability !== 'production') {
        unresolved.push({
          kind: 'production_observation',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          contractId: event.contractId,
          declaredSkill: contract.skill,
          reason: 'production_contract_is_not_production',
        });
        continue;
      }
      relevantContracts.set(contract.contractId, 'production');
      mutable.get('production')?.productionObservations.push(productionObservation(event));
    }
  }

  [...relevantContracts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([contractId, capability]) => {
      const contract = contractsById.get(contractId);
      if (contract !== undefined) {
        mutable.get(capability)?.contracts.push(contractSummary(contract, allEvents, state));
      }
    });

  const exposure: MonthlyExposureSignal[] = [];
  const selfReport: MonthlySelfReportSignal[] = [];
  const lookup: MonthlyLookupSignal[] = [];
  const ai: MonthlyAiSignal[] = [];
  const imports: MonthlyImportSignal[] = [];
  const sourceEncounters: MonthlySourceEncounter[] = [];
  const candidates = new Map<string, { readonly threadId: string }>();
  allEvents.forEach((event) => {
    if (event.type === 'CandidateAttached') {
      candidates.set(event.candidateId, { threadId: event.threadId });
    }
  });

  for (const event of monthEvents) {
    switch (event.type) {
      case 'EncounterCaptured':
        sourceEncounters.push({
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          encounterId: event.encounterId,
          threadId: event.threadId,
          sourceRef: sourceRefCopy(event.sourceRef),
        });
        if (event.uncertaintyMark === true) {
          selfReport.push({
            kind: 'self_report',
            eventId: event.eventId,
            occurredAt: event.occurredAt,
            threadId: event.threadId,
            report: 'uncertainty_mark',
            standing: 'diagnostic_only_not_retrieval',
          });
        }
        if (event.sourceRef.kind === 'import') {
          imports.push({
            kind: 'import',
            eventId: event.eventId,
            occurredAt: event.occurredAt,
            encounterId: event.encounterId,
            threadId: event.threadId,
            sourceRef: sourceRefCopy(event.sourceRef),
            standing: 'encounter_only_imported_history_not_assumed',
          });
        }
        break;

      case 'ExposureLogged':
        exposure.push({
          kind: 'exposure',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          experienceId: event.experienceId,
          componentIds: [...event.componentIds],
          evidenceTier: event.tier,
          standing: 'exposure_only_never_retrieval',
          sourceLink: {
            kind: 'unresolved',
            reason: 'exposure_event_has_no_source_ref',
          },
        });
        break;

      case 'LookupFrictionLogged':
        lookup.push({
          kind: 'lookup',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          targetRef: { ...event.targetRef },
          context: event.context,
          standing: 'friction_not_grade',
        });
        break;

      case 'CandidateAttached':
        ai.push({
          kind: 'ai',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          candidateId: event.candidateId,
          action: 'candidate_attached',
          threadId: event.threadId,
          standing: 'candidate_or_note_not_evidence',
        });
        break;

      case 'CandidateAcceptedAsNote':
        ai.push({
          kind: 'ai',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          candidateId: event.candidateId,
          action: 'candidate_accepted_as_note',
          threadId: candidates.get(event.candidateId)?.threadId ?? null,
          standing: 'candidate_or_note_not_evidence',
        });
        break;

      case 'ThreadPromotionChanged':
      case 'ReviewGraded':
      case 'ProductionObserved':
      case 'EvidenceSuperseded':
      case 'SessionStarted':
      case 'SessionClosed':
      case 'DataExported':
      case 'ThreadTombstoned':
      case 'ContentPurged':
      case 'ContractCreated':
        break;
    }
  }

  const result: MonthlyTruth = {
    schemaVersion: 1,
    month,
    timeBasis: 'event_occurred_at_utc',
    orderingBasis: 'canonical_append_order',
    correctionBasis: 'current_full_log_supersession',
    capabilities: MONTHLY_CAPABILITY_IDS.map((id) => {
      const lens = mutable.get(id);
      if (lens === undefined) {
        return {
          id,
          support: CAPABILITY_SUPPORT[id],
          contracts: [],
          retrievalClaims: [],
          productionObservations: [],
        };
      }
      return lens;
    }),
    sourceExposure: {
      id: 'source_familiarity_exposure',
      familiarityStanding: 'not_inferred',
      sourceEncounters,
      exposureEventIds: exposure.map((signal) => signal.eventId),
    },
    nonRetrievalSignals: {
      exposure,
      selfReport,
      lookup,
      ai,
      import: imports,
    },
    unresolvedRecords: unresolved,
  };

  return deepFreeze(result);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  return Object.freeze(value);
}
