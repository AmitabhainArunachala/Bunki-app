import type {
  ConceptKind,
  ConceptMemory,
  DerivedMemoryState,
  EvidenceOutcome,
  LearnerProfile,
  LearningCard,
  Phase2State,
  SkillAxis,
  SkillEvidence,
  SourceItem,
  TeacherResponse,
} from "./phase2-types.ts";
import { emptyAxes } from "./phase2-state.ts";

const LEVEL_RANK: Readonly<Record<LearnerProfile["currentLevel"], number>> = {
  zero: 0,
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
  "N1+": 6,
};

const confidenceDelta: Readonly<Record<EvidenceOutcome, number>> = {
  success: 0.16,
  partial: 0.045,
  failure: -0.2,
};

export function emptyConceptMemory(
  conceptId: string,
  kind: ConceptKind,
  at = new Date().toISOString(),
): ConceptMemory {
  return {
    conceptId,
    kind,
    intent: "normal",
    firstSeenAt: at,
    lastSeenAt: at,
    exposures: 0,
    sourceIds: [],
    contextFingerprints: [],
    uncertainties: [],
    axes: emptyAxes(),
    reviewCount: 0,
    lapseCount: 0,
    consecutiveFailures: 0,
    suspended: false,
  };
}

export function memoryState(memory: ConceptMemory | undefined): DerivedMemoryState {
  if (memory === undefined || memory.exposures === 0) return "unseen";
  if (memory.suspended || memory.intent === "ignore") return "encountered";
  const axes = Object.values(memory.axes);
  const strongest = Math.max(...axes.map((axis) => axis.confidence));
  const recognition = memory.axes.recognition.confidence;
  const active = Math.max(
    memory.axes.production.confidence,
    memory.axes.writing.confidence,
  );
  if (
    memory.consecutiveFailures >= 2 ||
    memory.lapseCount >= 3 ||
    axes.some(
      (axis) =>
        axis.lastOutcome === "failure" &&
        axis.attempts > 1 &&
        axis.confidence < 0.42,
    )
  )
    return "fragile";
  if (
    memory.exposures >= 4 &&
    memory.reviewCount >= 3 &&
    recognition >= 0.72 &&
    active >= 0.42
  )
    return "established";
  if (memory.reviewCount > 0 || strongest >= 0.25 || memory.intent === "keep")
    return "learning";
  return "encountered";
}

function updateAxis(
  evidence: SkillEvidence,
  outcome: EvidenceOutcome,
  at: string,
  weight: number,
): SkillEvidence {
  const delta = confidenceDelta[outcome] * weight;
  return {
    attempts: evidence.attempts + 1,
    successes: evidence.successes + (outcome === "success" ? 1 : 0),
    partials: evidence.partials + (outcome === "partial" ? 1 : 0),
    failures: evidence.failures + (outcome === "failure" ? 1 : 0),
    confidence: Math.max(0, Math.min(0.98, evidence.confidence + delta)),
    lastOutcome: outcome,
    lastAt: at,
  };
}

export function recordEvidence(
  memory: ConceptMemory | undefined,
  input: {
    readonly conceptId: string;
    readonly kind: ConceptKind;
    readonly skill: SkillAxis;
    readonly outcome: EvidenceOutcome;
    readonly at: string;
    readonly sourceId?: string | null;
    readonly contextFingerprint?: string | null;
    readonly passive?: boolean;
  },
): ConceptMemory {
  const existing = memory ?? emptyConceptMemory(input.conceptId, input.kind, input.at);
  const sourceIds = new Set(existing.sourceIds);
  if (input.sourceId) sourceIds.add(input.sourceId);
  const fingerprints = new Set(existing.contextFingerprints);
  if (input.contextFingerprint) fingerprints.add(input.contextFingerprint);
  const weight = input.passive ? 0.28 : 1;
  const axes = {
    ...existing.axes,
    [input.skill]: updateAxis(
      existing.axes[input.skill],
      input.outcome,
      input.at,
      weight,
    ),
  };
  return {
    ...existing,
    lastSeenAt: input.at,
    exposures: existing.exposures + 1,
    sourceIds: [...sourceIds],
    contextFingerprints: [...fingerprints].slice(-24),
    axes,
    reviewCount: existing.reviewCount + (input.passive ? 0 : 1),
    lapseCount:
      existing.lapseCount +
      (!input.passive && input.outcome === "failure" ? 1 : 0),
    consecutiveFailures:
      input.passive
        ? existing.consecutiveFailures
        : input.outcome === "failure"
          ? existing.consecutiveFailures + 1
          : 0,
  };
}

export function applyTeacherEvidence(
  memories: Phase2State["memories"],
  evidence: TeacherResponse["evidence"],
  allowedConceptIds: ReadonlySet<string>,
  turnId: string,
  at = new Date().toISOString(),
  sourceId: string | null = null,
  contextFingerprint: string | null = null,
): Phase2State["memories"] {
  const next = { ...memories };
  for (const item of evidence.slice(0, 8)) {
    if (
      !allowedConceptIds.has(item.conceptId) ||
      item.confidence < 0.65 ||
      item.outcome === "success" && item.confidence < 0.75
    )
      continue;
    next[item.conceptId] = recordEvidence(next[item.conceptId], {
      conceptId: item.conceptId,
      kind: item.conceptId.startsWith("grammar:")
        ? "grammar"
        : item.conceptId.startsWith("kanji:")
          ? "kanji"
          : "vocabulary",
      skill: item.skill,
      outcome: item.outcome,
      at,
      sourceId,
      contextFingerprint: contextFingerprint ?? `conversation:${turnId}`,
    });
  }
  return next;
}

export function cardRetrievability(card: LearningCard, at = new Date()): number {
  if (card.fsrs.reps === 0 || card.fsrs.stability <= 0) return 0;
  const last = card.fsrs.lastReview ? new Date(card.fsrs.lastReview) : new Date(card.createdAt);
  const elapsedDays = Math.max(0, (at.getTime() - last.getTime()) / 86_400_000);
  return Math.pow(1 + elapsedDays / (9 * card.fsrs.stability), -1);
}

export function dueCards(state: Phase2State, at = new Date()): readonly LearningCard[] {
  const time = at.getTime();
  return state.cards
    .filter(
      (card) =>
        !card.suspended &&
        Number.isFinite(new Date(card.dueAt).getTime()) &&
        new Date(card.dueAt).getTime() <= time,
    )
    .sort((left, right) => {
      if (left.leech !== right.leech) return left.leech ? -1 : 1;
      return left.dueAt.localeCompare(right.dueAt);
    });
}

export function fragileMemories(state: Phase2State): readonly ConceptMemory[] {
  return Object.values(state.memories)
    .filter((memory) => memoryState(memory) === "fragile" && !memory.suspended)
    .sort(
      (left, right) =>
        right.consecutiveFailures - left.consecutiveFailures ||
        right.lapseCount - left.lapseCount,
    );
}

export function learningSummary(state: Phase2State): {
  readonly encountered: number;
  readonly learning: number;
  readonly fragile: number;
  readonly established: number;
} {
  const result = { encountered: 0, learning: 0, fragile: 0, established: 0 };
  for (const memory of Object.values(state.memories)) {
    const derived = memoryState(memory);
    if (derived !== "unseen") result[derived] += 1;
  }
  return result;
}

export interface NextAction {
  readonly kind: "onboard" | "review" | "continue-source" | "analyze-source" | "capture" | "lesson" | "coach";
  readonly title: string;
  readonly detail: string;
  readonly reason: string;
  readonly minutes: number;
  readonly sourceId: string | null;
}

export function bestNextAction(state: Phase2State, at = new Date()): NextAction {
  if (!state.profile.onboardingComplete) {
    return {
      kind: "onboard",
      title: "Find your starting edge",
      detail: "A short setup creates your first real learning path.",
      reason: "Bunki has no evidence about you yet.",
      minutes: 2,
      sourceId: null,
    };
  }

  const due = dueCards(state, at);
  if (due.length > 0) {
    const sessionSize = reviewSessionLimit(state.profile, due.length);
    const estimate = Math.max(1, Math.ceil(sessionSize * 0.42));
    return {
      kind: "review",
      title: `Review ${String(sessionSize)} due thread${sessionSize === 1 ? "" : "s"}`,
      detail: `About ${String(estimate)} minute${estimate === 1 ? "" : "s"} · source context preserved`,
      reason:
        fragileMemories(state).length > 0
          ? "A fragile concept is due before new material."
          : "These memories are at their scheduled retrieval edge.",
      minutes: estimate,
      sourceId: null,
    };
  }

  const active =
    state.sources.find((source) => source.id === state.activeSourceId) ??
    state.sources.find((source) => source.status === "reading") ??
    state.sources.find((source) => source.status === "ready") ??
    null;
  if (active) {
    if (active.analysis === null && active.text.trim() !== "") {
      return {
        kind: "analyze-source",
        title: `Find the edge in “${active.title}”`,
        detail: "Preview a small, ranked packet before anything enters SRS.",
        reason: "This source has text but Bunki has not compared it with your memory.",
        minutes: 4,
        sourceId: active.id,
      };
    }
    return {
      kind: "continue-source",
      title: `Continue “${active.title}”`,
      detail: `${String(Math.round(active.progress))}% read · resume at sentence ${String(active.readingSentence + 1)}`,
      reason:
        active.analysis?.unknownCount
          ? `${String(active.analysis.unknownCount)} possible learning edges remain; Bunki will keep the packet small.`
          : "Continuing one thread creates better evidence than opening another dashboard.",
      minutes: Math.min(20, state.profile.dailyMinutes),
      sourceId: active.id,
    };
  }

  if (state.profile.currentLevel === "zero" || state.profile.currentLevel === "N5") {
    return {
      kind: "lesson",
      title: "Begin with one useful sentence",
      detail: "Three concepts maximum · furigana and meaning included",
      reason: "A first comprehensible sentence gives Bunki evidence without overload.",
      minutes: 6,
      sourceId: null,
    };
  }

  const interest = state.profile.interests[0];
  return {
    kind: "capture",
    title:
      interest === undefined
        ? "Bring in what you met today"
        : `Find one Japanese source about ${interest}`,
    detail:
      interest === undefined
        ? "Paste a URL now; add text or captions later."
        : "A creator video, university talk, article, or podcast is enough. Save the URL now and add text later.",
    reason:
      interest === undefined
        ? "Bunki needs a real encounter before it can choose a personal n+1 edge."
        : `Your interest in ${interest} is the starting lane; actual encounters will decide the vocabulary edge.`,
    minutes: 1,
    sourceId: null,
  };
}

export function reviewSessionLimit(
  profile: Pick<LearnerProfile, "dailyMinutes">,
  available = Number.POSITIVE_INFINITY,
): number {
  return Math.max(
    0,
    Math.min(20, available, Math.max(5, Math.floor(profile.dailyMinutes / 0.42))),
  );
}

export interface FrontierItem {
  readonly conceptId: string;
  readonly state: DerivedMemoryState;
  readonly score: number;
  readonly reason: string;
}

export function rankFrontier(
  state: Phase2State,
  limit = 8,
): readonly FrontierItem[] {
  return Object.values(state.memories)
    .filter((memory) => !memory.suspended && memory.intent !== "ignore")
    .map((memory): FrontierItem => {
      const derived = memoryState(memory);
      const recurrence = Math.min(4, memory.sourceIds.length) * 12;
      const failure = memory.consecutiveFailures * 28 + memory.lapseCount * 7;
      const intent = memory.intent === "keep" ? 18 : 0;
      const stateScore =
        derived === "fragile"
          ? 80
          : derived === "learning"
            ? 50
            : derived === "encountered"
              ? 38
              : 0;
      return {
        conceptId: memory.conceptId,
        state: derived,
        score: stateScore + recurrence + failure + intent,
        reason:
          derived === "fragile"
            ? `Missed ${String(memory.lapseCount)} time${memory.lapseCount === 1 ? "" : "s"} and needs a new context.`
            : memory.sourceIds.length > 1
              ? `Appeared in ${String(memory.sourceIds.length)} different sources but is not established.`
              : memory.intent === "keep"
                ? "You explicitly kept this thread."
                : "Recently encountered and still near the learning edge.",
      };
    })
    .filter((item) => item.state !== "established")
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function levelDistance(level: string | null, profileLevel: LearnerProfile["currentLevel"]): number {
  if (level === null || !(level in LEVEL_RANK)) return 2;
  return Math.abs(
    LEVEL_RANK[level as LearnerProfile["currentLevel"]] - LEVEL_RANK[profileLevel],
  );
}

export function sourceReadiness(source: SourceItem): {
  readonly ready: boolean;
  readonly reason: string;
} {
  if (source.text.trim() === "")
    return { ready: false, reason: "Attach captions, transcript, article text, or OCR first." };
  if (source.text.trim().length < 20)
    return { ready: false, reason: "There is not enough Japanese text to analyze yet." };
  return { ready: true, reason: "Text is ready for learner-aware analysis." };
}
