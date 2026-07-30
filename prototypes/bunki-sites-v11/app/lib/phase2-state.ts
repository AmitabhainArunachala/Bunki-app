import { createEmptyCard } from "ts-fsrs";
import { sourceTextFingerprint } from "./source-fingerprint.ts";

import type {
  ActivityEvent,
  CardProposal,
  ConceptMemory,
  FsrsSnapshot,
  LearnerProfile,
  LearningCard,
  PlacementAnswer,
  Phase2State,
  ReviewEvent,
  ReviewSession,
  SkillAxis,
  SkillEvidence,
  SourceAnalysis,
  SourceAnalysisCandidate,
  SourceItem,
  SourceTranscriptSegment,
  StagedPacket,
  TeacherCorrection,
  TeacherMessage,
} from "./phase2-types.ts";

const AXES: readonly SkillAxis[] = [
  "recognition",
  "reading",
  "listening",
  "production",
  "writing",
];

const nowIso = (): string => new Date().toISOString();
const MAX_REVIEW_EVENTS = 120;
const MAX_MESSAGES = 200;
const MAX_ACTIVITY = 500;
export const MAX_CARD_FRONT_CHARACTERS = 10_000;
export const MAX_CARD_BACK_CHARACTERS = 10_000;
export const MAX_CARD_NOTE_CHARACTERS = 5_000;

const emptyEvidence = (): SkillEvidence => ({
  attempts: 0,
  successes: 0,
  partials: 0,
  failures: 0,
  confidence: 0,
  lastOutcome: null,
  lastAt: null,
});

export function emptyAxes(): ConceptMemory["axes"] {
  return Object.fromEntries(AXES.map((axis) => [axis, emptyEvidence()])) as unknown as
    ConceptMemory["axes"];
}

export function serializeEmptyFsrs(at = new Date()): FsrsSnapshot {
  const card = createEmptyCard(at);
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review?.toISOString() ?? null,
  };
}

export function createInitialPhase2State(): Phase2State {
  return {
    version: 2,
    revision: 0,
    profile: {
      displayName: "Learner",
      currentLevel: "zero",
      targetLevel: "N1",
      target: "Build Japanese I can understand and use",
      interests: [],
      dailyMinutes: 30,
      preferredMedia: ["youtube", "article", "podcast"],
      onboardingComplete: false,
      placementComplete: false,
      placementAnswers: [],
      furigana: "always",
    },
    memories: {},
    sources: [],
    cards: [],
    reviewEvents: [],
    reviewSession: null,
    stagedPacket: null,
    messages: [],
    activity: [],
    activeSourceId: null,
    selectedConceptId: null,
    selectedKanji: null,
    lastUndo: null,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const numberValue = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const boundedNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number => Math.max(minimum, Math.min(maximum, numberValue(value, fallback)));

const boundedInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number =>
  Math.floor(boundedNumber(value, minimum, maximum, fallback));

const isoValue = (value: unknown, fallback = nowIso()): string => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return fallback;
  return new Date(value).toISOString();
};

const nullableIsoValue = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;

const stringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function migrateSource(value: unknown): SourceItem | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  if (id === "") return null;
  const addedAt = isoValue(value.addedAt);
  const text = stringValue(value.text).slice(0, 500_000);
  const legacyCaptured = stringArray(value.capturedVocabIds);
  return {
    id,
    kind: [
      "article",
      "youtube",
      "podcast",
      "screenshot",
      "book",
      "pdf",
      "conversation",
      "manual",
    ].includes(stringValue(value.kind))
      ? (stringValue(value.kind) as SourceItem["kind"])
      : "manual",
    status:
      text.trim() === ""
        ? "inbox"
        : numberValue(value.progress) >= 100
          ? "mined"
          : numberValue(value.progress) > 0
            ? "reading"
            : "ready",
    title: stringValue(value.title, "Untitled source").slice(0, 180),
    url: stringValue(value.url).slice(0, 2_000),
    text,
    addedAt,
    updatedAt: isoValue(value.updatedAt, addedAt),
    progress: Math.max(0, Math.min(100, numberValue(value.progress))),
    readingSentence: Math.max(0, Math.floor(numberValue(value.readingSentence))),
    provenance:
      value.provenance === "generated-sample" ? "generated-sample" : "user-supplied",
    capturedConceptIds: [
      ...new Set([...stringArray(value.capturedConceptIds), ...legacyCaptured]),
    ],
    notes: stringValue(value.notes).slice(0, 10_000),
    segments: Array.isArray(value.segments)
      ? value.segments
          .filter(isRecord)
          .map(
            (segment): SourceTranscriptSegment => ({
              startSeconds: Math.max(0, numberValue(segment.startSeconds)),
              durationSeconds: Math.max(0, numberValue(segment.durationSeconds)),
              startCharacter: Math.max(
                0,
                Math.floor(numberValue(segment.startCharacter)),
              ),
              endCharacter: Math.max(
                0,
                Math.floor(numberValue(segment.endCharacter)),
              ),
            }),
          )
          .filter(
            (segment) =>
              segment.endCharacter > segment.startCharacter &&
              segment.endCharacter <= text.length,
          )
          .slice(0, 20_000)
      : [],
    analysis: null,
  };
}

function migrateLegacyCard(value: unknown): LearningCard | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).trim().slice(0, 200);
  const front = stringValue(value.front).slice(0, MAX_CARD_FRONT_CHARACTERS);
  const back = stringValue(value.back).slice(0, MAX_CARD_BACK_CHARACTERS);
  if (id === "" || front.trim() === "" || back.trim() === "") return null;
  const conceptId =
    (
      stringValue(value.conceptId).trim() ||
      (stringValue(value.vocabId).trim() === ""
        ? `legacy:${id}`
        : stringValue(value.vocabId).trim())
    ).slice(0, 180);
  if (conceptId === "") return null;
  const createdAt = isoValue(value.createdAt);
  const rawFsrs = isRecord(value.fsrs) ? value.fsrs : {};
  const empty = serializeEmptyFsrs(new Date(createdAt));
  return {
    id,
    conceptId,
    sourceId: stringValue(value.sourceId).slice(0, 200) || null,
    sourceSentence: stringValue(value.context).slice(0, 10_000),
    front,
    back,
    reading: "",
    note: "",
    rationale: "Migrated from the first Bunki alpha.",
    tags: ["migrated"],
    lineage:
      stringValue(value.sourceId) === ""
        ? []
        : [
            {
              sourceId: stringValue(value.sourceId),
              sourceFingerprint: "legacy:unknown",
              exactText: stringValue(value.context),
              role: "target",
              generated: false,
            },
          ],
    kind: ["cloze", "production", "kanji", "grammar", "listening"].includes(
      stringValue(value.kind),
    )
      ? (stringValue(value.kind) as LearningCard["kind"])
      : "recognition",
    skill:
      value.kind === "production"
        ? "production"
        : value.kind === "listening"
          ? "listening"
          : value.kind === "kanji"
            ? "writing"
            : "recognition",
    origin: stringValue(value.sourceId) === "" ? "manual" : "source",
    generated: false,
    createdAt,
    updatedAt: isoValue(value.updatedAt, createdAt),
    dueAt: isoValue(value.dueAt, createdAt),
    suspended: Boolean(value.suspended),
    leech: numberValue(value.lapses) >= 8,
    fsrs: {
      stability: boundedNumber(rawFsrs.stability, 0, 1_000_000_000, empty.stability),
      difficulty: boundedNumber(rawFsrs.difficulty, 0, 10, empty.difficulty),
      elapsedDays: boundedInteger(rawFsrs.elapsedDays, 0, 1_000_000, empty.elapsedDays),
      scheduledDays: boundedInteger(rawFsrs.scheduledDays, 0, 1_000_000, empty.scheduledDays),
      learningSteps: boundedInteger(rawFsrs.learningSteps, 0, 1_000_000, empty.learningSteps),
      reps: boundedInteger(rawFsrs.reps, 0, 10_000_000, empty.reps),
      lapses: boundedInteger(rawFsrs.lapses, 0, 10_000_000, empty.lapses),
      state: boundedInteger(rawFsrs.state, 0, 3, empty.state),
      lastReview: nullableIsoValue(rawFsrs.lastReview),
    },
  };
}

function normalizeCardV2(value: unknown): LearningCard | null {
  const migrated = migrateLegacyCard(value);
  if (migrated === null || !isRecord(value)) return migrated;
  const rawFsrs = isRecord(value.fsrs) ? value.fsrs : {};
  const conceptId =
    stringValue(value.conceptId).trim().slice(0, 180) || migrated.conceptId;
  const kind = ["recognition", "cloze", "production", "listening", "kanji", "grammar"].includes(
    stringValue(value.kind),
  )
    ? (stringValue(value.kind) as LearningCard["kind"])
    : migrated.kind;
  const skill = AXES.includes(stringValue(value.skill) as SkillAxis)
    ? (stringValue(value.skill) as SkillAxis)
    : migrated.skill;
  const origin = ["source", "conversation", "generated", "manual"].includes(
    stringValue(value.origin),
  )
    ? (stringValue(value.origin) as LearningCard["origin"])
    : migrated.origin;
  return {
    ...migrated,
    conceptId,
    sourceId: stringValue(value.sourceId).slice(0, 200) || null,
    sourceSentence: stringValue(value.sourceSentence, migrated.sourceSentence).slice(
      0,
      10_000,
    ),
    front: stringValue(value.front, migrated.front).slice(
      0,
      MAX_CARD_FRONT_CHARACTERS,
    ),
    back: stringValue(value.back, migrated.back).slice(
      0,
      MAX_CARD_BACK_CHARACTERS,
    ),
    reading: stringValue(value.reading).slice(0, 500),
    note: stringValue(value.note).slice(0, MAX_CARD_NOTE_CHARACTERS),
    rationale: stringValue(value.rationale, migrated.rationale).slice(0, 1_000),
    tags: stringArray(value.tags)
      .map((tag) => tag.slice(0, 200))
      .slice(0, 30),
    lineage: normalizeLineage(value.lineage, migrated.lineage),
    kind,
    skill,
    origin,
    generated: Boolean(value.generated),
    suspended: Boolean(value.suspended),
    leech: Boolean(value.leech),
    fsrs: {
      stability: boundedNumber(rawFsrs.stability, 0, 1_000_000_000, migrated.fsrs.stability),
      difficulty: boundedNumber(rawFsrs.difficulty, 0, 10, migrated.fsrs.difficulty),
      elapsedDays: boundedInteger(rawFsrs.elapsedDays, 0, 1_000_000, migrated.fsrs.elapsedDays),
      scheduledDays: boundedInteger(rawFsrs.scheduledDays, 0, 1_000_000, migrated.fsrs.scheduledDays),
      learningSteps: boundedInteger(rawFsrs.learningSteps, 0, 1_000_000, migrated.fsrs.learningSteps),
      reps: boundedInteger(rawFsrs.reps, 0, 10_000_000, migrated.fsrs.reps),
      lapses: boundedInteger(rawFsrs.lapses, 0, 10_000_000, migrated.fsrs.lapses),
      state: boundedInteger(rawFsrs.state, 0, 3, migrated.fsrs.state),
      lastReview: nullableIsoValue(rawFsrs.lastReview),
    },
  };
}

function normalizeLineage(
  value: unknown,
  fallback: LearningCard["lineage"] = [],
): LearningCard["lineage"] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter(isRecord)
    .map((anchor) => ({
      sourceId: stringValue(anchor.sourceId).slice(0, 200),
      sourceFingerprint: stringValue(
        anchor.sourceFingerprint,
        "legacy:unknown",
      ).slice(0, 160),
      exactText: stringValue(anchor.exactText).slice(0, 10_000),
      role: anchor.role === "prior" ? ("prior" as const) : ("target" as const),
      generated: Boolean(anchor.generated),
    }))
    .filter(
      (anchor) =>
        anchor.sourceId !== "" &&
        anchor.sourceFingerprint !== "" &&
        anchor.exactText !== "",
    )
    .slice(0, 8);
}

function normalizeEvidence(value: unknown): SkillEvidence {
  const row = isRecord(value) ? value : {};
  const requestedSuccesses = boundedInteger(row.successes, 0, 10_000_000, 0);
  const requestedPartials = boundedInteger(row.partials, 0, 10_000_000, 0);
  const requestedFailures = boundedInteger(row.failures, 0, 10_000_000, 0);
  const attempts = Math.min(
    10_000_000,
    Math.max(
      boundedInteger(row.attempts, 0, 10_000_000, 0),
      requestedSuccesses + requestedPartials + requestedFailures,
    ),
  );
  const successes = Math.min(requestedSuccesses, attempts);
  const partials = Math.min(requestedPartials, attempts - successes);
  const failures = Math.min(
    requestedFailures,
    attempts - successes - partials,
  );
  const outcome =
    row.lastOutcome === "success" ||
    row.lastOutcome === "partial" ||
    row.lastOutcome === "failure"
      ? row.lastOutcome
      : null;
  return {
    attempts,
    successes,
    partials,
    failures,
    confidence: boundedNumber(row.confidence, 0, 1, 0),
    lastOutcome: outcome,
    lastAt: nullableIsoValue(row.lastAt),
  };
}

function normalizeMemoryV2(id: string, value: unknown): ConceptMemory {
  const migrated = migrateLegacyMemory(id, value);
  if (!isRecord(value)) return migrated;
  const rawAxes = isRecord(value.axes) ? value.axes : {};
  const axes = Object.fromEntries(
    AXES.map((axis) => [axis, normalizeEvidence(rawAxes[axis])]),
  ) as unknown as ConceptMemory["axes"];
  const kind = ["vocabulary", "kanji", "grammar"].includes(stringValue(value.kind))
    ? (stringValue(value.kind) as ConceptMemory["kind"])
    : migrated.kind;
  const intent = ["normal", "keep", "ignore", "suspend"].includes(
    stringValue(value.intent),
  )
    ? (stringValue(value.intent) as ConceptMemory["intent"])
    : migrated.intent;
  return {
    conceptId: stringValue(value.conceptId, id),
    kind,
    intent,
    firstSeenAt: isoValue(value.firstSeenAt, migrated.firstSeenAt),
    lastSeenAt: isoValue(value.lastSeenAt, migrated.lastSeenAt),
    exposures: boundedInteger(
      value.exposures,
      0,
      10_000_000,
      migrated.exposures,
    ),
    sourceIds: [...new Set(stringArray(value.sourceIds))].slice(0, 1_000),
    contextFingerprints: [...new Set(stringArray(value.contextFingerprints))].slice(
      0,
      2_000,
    ),
    uncertainties: [...new Set(stringArray(value.uncertainties))].slice(0, 30),
    axes,
    reviewCount: boundedInteger(
      value.reviewCount,
      0,
      10_000_000,
      migrated.reviewCount,
    ),
    lapseCount: boundedInteger(
      value.lapseCount,
      0,
      10_000_000,
      migrated.lapseCount,
    ),
    consecutiveFailures: boundedInteger(
      value.consecutiveFailures,
      0,
      10_000_000,
      migrated.consecutiveFailures,
    ),
    suspended: Boolean(value.suspended),
  };
}

function normalizeSourceV2(value: unknown): SourceItem | null {
  const migrated = migrateSource(value);
  if (migrated === null || !isRecord(value)) return migrated;
  const status = ["inbox", "ready", "reading", "mined", "archived"].includes(
    stringValue(value.status),
  )
    ? (stringValue(value.status) as SourceItem["status"])
    : migrated.status;
  const analysis = normalizeSourceAnalysis(value.analysis, migrated.text);
  return {
    ...migrated,
    status,
    provenance:
      value.provenance === "generated-sample" ? "generated-sample" : "user-supplied",
    analysis,
  };
}

function normalizeAnalysisCandidate(
  value: unknown,
): SourceAnalysisCandidate | null {
  if (!isRecord(value)) return null;
  const conceptId = stringValue(value.conceptId).slice(0, 180);
  const kind = value.kind === "grammar" ? "grammar" : "vocabulary";
  const surface = stringValue(value.surface).slice(0, 200);
  const sentence = stringValue(value.sentence).slice(0, 10_000);
  const startInSentence = Math.floor(numberValue(value.startInSentence, -1));
  const endInSentence = Math.floor(numberValue(value.endInSentence, -1));
  if (
    conceptId === "" ||
    surface === "" ||
    sentence === "" ||
    startInSentence < 0 ||
    endInSentence <= startInSentence ||
    endInSentence > sentence.length ||
    (kind === "vocabulary" &&
      sentence.slice(startInSentence, endInSentence) !== surface)
  )
    return null;
  const memoryState = [
    "unseen",
    "encountered",
    "learning",
    "fragile",
    "established",
  ].includes(stringValue(value.memoryState))
    ? (stringValue(value.memoryState) as SourceAnalysisCandidate["memoryState"])
    : "unseen";
  return {
    conceptId,
    kind,
    surface,
    dictionaryForm: stringValue(value.dictionaryForm, surface).slice(0, 200),
    reading: stringValue(value.reading).slice(0, 200),
    meaning: stringValue(value.meaning).slice(0, 1_000),
    sentence,
    sentenceIndex: Math.max(0, Math.floor(numberValue(value.sentenceIndex))),
    startInSentence,
    endInSentence,
    score: numberValue(value.score),
    reason: stringValue(value.reason).slice(0, 1_000),
    memoryState,
  };
}

function normalizeSourceAnalysis(
  value: unknown,
  sourceText: string,
): SourceAnalysis | null {
  if (!isRecord(value)) return null;
  const fingerprint = stringValue(value.textFingerprint);
  if (fingerprint === "" || fingerprint !== sourceTextFingerprint(sourceText)) return null;
  const candidates = Array.isArray(value.candidates)
    ? value.candidates
        .map(normalizeAnalysisCandidate)
        .filter((item): item is SourceAnalysisCandidate => item !== null)
        .slice(0, 30)
    : [];
  return {
    analyzedAt: isoValue(value.analyzedAt),
    textFingerprint: fingerprint,
    sentenceCount: boundedInteger(value.sentenceCount, 0, 1_000_000, 0),
    tokenCount: boundedInteger(value.tokenCount, 0, 10_000_000, 0),
    coverage: boundedNumber(value.coverage, 0, 100, 0),
    knownCount: boundedInteger(value.knownCount, 0, 10_000_000, 0),
    learningCount: boundedInteger(value.learningCount, 0, 10_000_000, 0),
    unknownCount: boundedInteger(value.unknownCount, 0, 10_000_000, 0),
    candidates,
    grammarIds: [...new Set(stringArray(value.grammarIds))].slice(0, 200),
  };
}

function normalizeProposal(value: unknown): CardProposal | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).slice(0, 200);
  const conceptId = stringValue(value.conceptId).slice(0, 180);
  const front = stringValue(value.front).slice(0, 10_000);
  const back = stringValue(value.back).slice(0, 10_000);
  if (id === "" || conceptId === "" || front === "" || back === "") return null;
  const kind = [
    "recognition",
    "cloze",
    "production",
    "listening",
    "kanji",
    "grammar",
  ].includes(stringValue(value.kind))
    ? (stringValue(value.kind) as CardProposal["kind"])
    : "recognition";
  const skill = AXES.includes(stringValue(value.skill) as SkillAxis)
    ? (stringValue(value.skill) as SkillAxis)
    : "recognition";
  const origin = ["source", "conversation", "generated", "manual"].includes(
    stringValue(value.origin),
  )
    ? (stringValue(value.origin) as CardProposal["origin"])
    : "manual";
  return {
    id,
    conceptId,
    sourceId: stringValue(value.sourceId).slice(0, 200) || null,
    sourceSentence: stringValue(value.sourceSentence).slice(0, 10_000),
    front,
    back,
    reading: stringValue(value.reading).slice(0, 500),
    note: stringValue(value.note).slice(0, 5_000),
    rationale: stringValue(value.rationale).slice(0, 1_000),
    tags: stringArray(value.tags).slice(0, 30),
    lineage: normalizeLineage(value.lineage),
    kind,
    skill,
    origin,
    generated: Boolean(value.generated),
    selected: Boolean(value.selected),
  };
}

function normalizePacket(value: unknown): StagedPacket | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).slice(0, 200);
  if (id === "") return null;
  const proposals = Array.isArray(value.proposals)
    ? value.proposals
        .map(normalizeProposal)
        .filter((item): item is CardProposal => item !== null)
        .slice(0, 30)
    : [];
  return {
    id,
    sourceId: stringValue(value.sourceId).slice(0, 200) || null,
    title: stringValue(value.title, "Staged learning packet").slice(0, 300),
    createdAt: isoValue(value.createdAt),
    proposals,
  };
}

function normalizeReviewEvent(value: unknown): ReviewEvent | null {
  if (!isRecord(value)) return null;
  const previousCard = normalizeCardV2(value.previousCard);
  const nextCard = normalizeCardV2(value.nextCard);
  const rating = numberValue(value.rating);
  if (
    previousCard === null ||
    nextCard === null ||
    ![1, 2, 3, 4].includes(rating)
  )
    return null;
  const conceptId = stringValue(value.conceptId, previousCard.conceptId);
  const previousMemory = isRecord(value.previousMemory)
    ? normalizeMemoryV2(conceptId, value.previousMemory)
    : undefined;
  const nextMemory = isRecord(value.nextMemory)
    ? normalizeMemoryV2(conceptId, value.nextMemory)
    : undefined;
  return {
    id: stringValue(value.id, `review-${crypto.randomUUID()}`).slice(0, 200),
    cardId: stringValue(value.cardId, previousCard.id).slice(0, 200),
    conceptId,
    rating: rating as ReviewEvent["rating"],
    reviewedAt: isoValue(value.reviewedAt),
    previousCard,
    nextCard,
    ...(previousMemory ? { previousMemory } : {}),
    ...(nextMemory ? { nextMemory } : {}),
  };
}

function normalizeReviewSession(value: unknown): ReviewSession | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).slice(0, 200);
  if (id === "") return null;
  const queue = [...new Set(stringArray(value.queue))].slice(0, 100);
  const completed = [...new Set(stringArray(value.completedCardIds))]
    .filter((cardId) => queue.includes(cardId))
    .slice(0, queue.length);
  return {
    id,
    startedAt: isoValue(value.startedAt),
    completedAt: nullableIsoValue(value.completedAt),
    queue,
    completedCardIds: completed,
    initialCount: queue.length,
  };
}

function normalizeCorrection(value: unknown): TeacherCorrection | null {
  if (!isRecord(value)) return null;
  const original = stringValue(value.original).slice(0, 400);
  const corrected = stringValue(value.corrected).slice(0, 400);
  const explanation = stringValue(value.explanation).slice(0, 800);
  if (original === "" || corrected === "" || explanation === "") return null;
  return {
    original,
    corrected,
    explanation,
    severity:
      value.severity === "important" || value.severity === "minor"
        ? value.severity
        : "note",
  };
}

function normalizeMessage(value: unknown): TeacherMessage | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).slice(0, 200);
  const text = stringValue(value.text).slice(0, 4_000);
  if (id === "" || text === "") return null;
  return {
    id,
    role: value.role === "learner" ? "learner" : "teacher",
    text,
    supportEn:
      typeof value.supportEn === "string" ? value.supportEn.slice(0, 2_000) : null,
    createdAt: isoValue(value.createdAt),
    generated: Boolean(value.generated),
    corrections: Array.isArray(value.corrections)
      ? value.corrections
          .map(normalizeCorrection)
          .filter((item): item is TeacherCorrection => item !== null)
          .slice(0, 4)
      : [],
    branches: stringArray(value.branches).slice(0, 4),
    whyThisFits:
      typeof value.whyThisFits === "string"
        ? value.whyThisFits.slice(0, 500)
        : null,
  };
}

function normalizeActivity(value: unknown): ActivityEvent | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).slice(0, 200);
  const type = stringValue(value.type);
  if (
    id === "" ||
    ![
      "source-added",
      "source-analyzed",
      "packet-admitted",
      "review",
      "conversation",
      "placement",
    ].includes(type)
  )
    return null;
  return {
    id,
    type: type as ActivityEvent["type"],
    at: isoValue(value.at),
    label: stringValue(value.label).slice(0, 500),
    conceptIds: stringArray(value.conceptIds).slice(0, 50),
    sourceId: stringValue(value.sourceId).slice(0, 200) || null,
  };
}

function migrateLegacyMemory(id: string, value: unknown): ConceptMemory {
  const row = isRecord(value) ? value : {};
  const status = stringValue(row.status);
  const lookups = Math.max(1, numberValue(row.lookups, 1));
  const explicitReviewCount = boundedInteger(
    row.reviews,
    0,
    10_000_000,
    0,
  );
  const firstSeenAt = isoValue(row.firstSeenAt);
  const lastSeenAt = isoValue(row.lastSeenAt, firstSeenAt);
  const recognition: SkillEvidence = {
    ...emptyEvidence(),
    attempts: status === "known" || status === "fragile" || status === "learning" ? 1 : 0,
    successes: status === "known" ? 1 : 0,
    failures: status === "fragile" ? 1 : 0,
    confidence:
      status === "known" ? 0.62 : status === "learning" ? 0.3 : status === "fragile" ? 0.18 : 0.08,
    lastOutcome:
      status === "known" ? "success" : status === "fragile" ? "failure" : null,
    lastAt: lastSeenAt,
  };
  return {
    conceptId: id,
    kind: id.startsWith("grammar:")
      ? "grammar"
      : id.startsWith("kanji:")
        ? "kanji"
        : "vocabulary",
    intent: status === "kept" ? "keep" : "normal",
    firstSeenAt,
    lastSeenAt,
    exposures: lookups,
    sourceIds: stringArray(row.sourceIds),
    contextFingerprints: [],
    uncertainties: stringArray(row.uncertainty),
    axes: { ...emptyAxes(), recognition },
    reviewCount: explicitReviewCount,
    lapseCount: 0,
    consecutiveFailures: recognition.failures,
    suspended: false,
  };
}

function sanitizeProfile(value: unknown, legacy = false): LearnerProfile {
  const row = isRecord(value) ? value : {};
  const currentLevel = ["zero", "N5", "N4", "N3", "N2", "N1", "N1+"].includes(
    stringValue(row.currentLevel),
  )
    ? (stringValue(row.currentLevel) as LearnerProfile["currentLevel"])
    : "zero";
  return {
    displayName: stringValue(row.displayName, legacy ? "Learner" : "Learner").slice(0, 80),
    currentLevel,
    targetLevel: ["zero", "N5", "N4", "N3", "N2", "N1", "N1+"].includes(
      stringValue(row.targetLevel),
    )
      ? (stringValue(row.targetLevel) as LearnerProfile["targetLevel"])
      : "N1",
    target: stringValue(row.target, "Build Japanese I can understand and use").slice(
      0,
      300,
    ),
    interests: stringArray(row.interests).slice(0, 12),
    dailyMinutes: Math.max(5, Math.min(480, numberValue(row.dailyMinutes, 30))),
    preferredMedia: Array.isArray(row.preferredMedia)
      ? (row.preferredMedia.filter((item): item is LearnerProfile["preferredMedia"][number] =>
          [
            "article",
            "youtube",
            "podcast",
            "screenshot",
            "book",
            "pdf",
            "conversation",
            "manual",
          ].includes(String(item)),
        ) as LearnerProfile["preferredMedia"])
      : ["youtube", "article", "podcast"],
    onboardingComplete:
      typeof row.onboardingComplete === "boolean" ? row.onboardingComplete : legacy,
    placementComplete:
      typeof row.placementComplete === "boolean" ? row.placementComplete : legacy,
    placementAnswers: Array.isArray(row.placementAnswers)
      ? row.placementAnswers
          .filter(isRecord)
          .map(
            (answer): PlacementAnswer => ({
              itemId: stringValue(answer.itemId).slice(0, 120),
              level: ["zero", "N5", "N4", "N3", "N2", "N1", "N1+"].includes(
                stringValue(answer.level),
              )
                ? (stringValue(answer.level) as PlacementAnswer["level"])
                : "zero",
              correct: Boolean(answer.correct),
            }),
          )
          .filter((answer) => answer.itemId !== "")
          .slice(0, 30)
      : [],
    furigana:
      row.furigana === "off" || row.furigana === "learning" || row.furigana === "always"
        ? row.furigana
        : currentLevel === "zero" || currentLevel === "N5"
          ? "always"
          : currentLevel === "N4" || currentLevel === "N3"
            ? "learning"
            : "off",
  };
}

export function migrateToPhase2(input: unknown): Phase2State {
  if (!isRecord(input)) return createInitialPhase2State();
  if (input.version === 2) {
    const base = createInitialPhase2State();
    const memories = isRecord(input.memories)
      ? Object.fromEntries(
          Object.entries(input.memories).map(([id, memory]) => [
            id,
            normalizeMemoryV2(id, memory),
          ]),
        )
      : {};
    const sources = Array.isArray(input.sources)
      ? input.sources
          .map(normalizeSourceV2)
          .filter((item): item is SourceItem => item !== null)
      : [];
    const cards = Array.isArray(input.cards)
      ? input.cards
          .map(normalizeCardV2)
          .filter((item): item is LearningCard => item !== null)
      : [];
    const reviewEvents = Array.isArray(input.reviewEvents)
      ? input.reviewEvents
          .map(normalizeReviewEvent)
          .filter((item): item is ReviewEvent => item !== null)
          .slice(-MAX_REVIEW_EVENTS)
      : [];
    const reviewSession = normalizeReviewSession(input.reviewSession);
    const cardIds = new Set(cards.map((card) => card.id));
    const cleanedSession =
      reviewSession === null
        ? null
        : {
            ...reviewSession,
            queue: reviewSession.queue.filter((id) => cardIds.has(id)),
            completedCardIds: reviewSession.completedCardIds.filter((id) =>
              cardIds.has(id),
            ),
            initialCount: reviewSession.queue.filter((id) => cardIds.has(id)).length,
          };
    return {
      ...base,
      version: 2,
      revision: Math.max(0, Math.floor(numberValue(input.revision))),
      profile: sanitizeProfile(input.profile),
      memories,
      sources,
      cards,
      reviewEvents,
      reviewSession: cleanedSession,
      stagedPacket: normalizePacket(input.stagedPacket),
      messages: Array.isArray(input.messages)
        ? input.messages
            .map(normalizeMessage)
            .filter((item): item is TeacherMessage => item !== null)
            .slice(-MAX_MESSAGES)
        : [],
      activity: Array.isArray(input.activity)
        ? input.activity
            .map(normalizeActivity)
            .filter((item): item is ActivityEvent => item !== null)
            .slice(0, MAX_ACTIVITY)
        : [],
      activeSourceId: stringValue(input.activeSourceId) || null,
      selectedConceptId:
        stringValue(input.selectedConceptId) || stringValue(input.selectedVocabId) || null,
      selectedKanji: stringValue(input.selectedKanji) || null,
      lastUndo: normalizeReviewEvent(input.lastUndo),
    };
  }

  const memories: Record<string, ConceptMemory> = {};
  if (isRecord(input.memories)) {
    for (const [id, memory] of Object.entries(input.memories))
      memories[id] = migrateLegacyMemory(id, memory);
  }
  if (isRecord(input.conceptMemories)) {
    for (const [id, memory] of Object.entries(input.conceptMemories))
      if (!(id in memories)) memories[id] = migrateLegacyMemory(id, memory);
  }
  const sources = Array.isArray(input.sources)
    ? input.sources.map(migrateSource).filter((item): item is SourceItem => item !== null)
    : [];
  const cards = Array.isArray(input.cards)
    ? input.cards.map(migrateLegacyCard).filter((item): item is LearningCard => item !== null)
    : [];
  const legacyMessages = Array.isArray(input.messages)
    ? input.messages
        .filter(isRecord)
        .map(
          (message): TeacherMessage => ({
            id: stringValue(message.id, `legacy-message-${crypto.randomUUID()}`),
            role: message.role === "learner" ? "learner" : "teacher",
            text: stringValue(message.text),
            supportEn: null,
            createdAt: isoValue(message.createdAt),
            generated: Boolean(message.generated),
            corrections: [],
            branches: [],
            whyThisFits: null,
          }),
        )
    : [];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const legacyReviewActivity: ActivityEvent[] = [];
  if (Array.isArray(input.reviews)) {
    for (const review of input.reviews.slice(0, MAX_ACTIVITY)) {
      if (!isRecord(review)) continue;
      const card = cardById.get(stringValue(review.cardId));
      const rating = numberValue(review.rating);
      if (card === undefined || ![1, 2, 3, 4].includes(rating)) continue;
      const reviewedAt = isoValue(review.reviewedAt);
      const existing =
        memories[card.conceptId] ??
        migrateLegacyMemory(card.conceptId, {
          status: "learning",
          firstSeenAt: card.createdAt,
          lastSeenAt: reviewedAt,
          sourceIds: card.sourceId === null ? [] : [card.sourceId],
        });
      const previousEvidence = existing.axes[card.skill];
      const outcome =
        rating === 1 ? "failure" : rating === 2 ? "partial" : "success";
      const nextEvidence: SkillEvidence = {
        attempts: previousEvidence.attempts + 1,
        successes:
          previousEvidence.successes + (outcome === "success" ? 1 : 0),
        partials:
          previousEvidence.partials + (outcome === "partial" ? 1 : 0),
        failures:
          previousEvidence.failures + (outcome === "failure" ? 1 : 0),
        confidence: Math.max(
          0,
          Math.min(
            1,
            previousEvidence.confidence +
              (outcome === "success"
                ? 0.12
                : outcome === "partial"
                  ? 0.03
                  : -0.18),
          ),
        ),
        lastOutcome: outcome,
        lastAt: reviewedAt,
      };
      memories[card.conceptId] = {
        ...existing,
        lastSeenAt: reviewedAt,
        sourceIds: [
          ...new Set([
            ...existing.sourceIds,
            ...(card.sourceId === null ? [] : [card.sourceId]),
          ]),
        ],
        axes: { ...existing.axes, [card.skill]: nextEvidence },
        reviewCount: existing.reviewCount + 1,
        lapseCount: existing.lapseCount + (rating === 1 ? 1 : 0),
        consecutiveFailures:
          rating === 1 ? existing.consecutiveFailures + 1 : 0,
      };
      legacyReviewActivity.push({
        id: stringValue(
          review.id,
          `legacy-review-${crypto.randomUUID()}`,
        ).slice(0, 200),
        type: "review",
        at: reviewedAt,
        label: `Migrated review · rating ${String(rating)}`,
        conceptIds: [card.conceptId],
        sourceId: card.sourceId,
      });
    }
  }

  return {
    ...createInitialPhase2State(),
    revision: 1,
    profile: sanitizeProfile(input.profile, true),
    memories,
    sources,
    cards,
    messages: legacyMessages,
    activity: legacyReviewActivity,
    activeSourceId:
      stringValue(input.activeSourceId) || sources.find((source) => source.status !== "archived")?.id || null,
    selectedConceptId: stringValue(input.selectedVocabId) || null,
    selectedKanji: stringValue(input.selectedKanji) || null,
  };
}

export function compactPhase2State(state: Phase2State): Phase2State {
  return migrateToPhase2({
    ...state,
    reviewEvents: state.reviewEvents.slice(-MAX_REVIEW_EVENTS),
    messages: state.messages.slice(-MAX_MESSAGES),
    activity: state.activity.slice(0, MAX_ACTIVITY),
    lastUndo: state.lastUndo,
  });
}

export function removeCardFromReviewSession(
  session: ReviewSession | null,
  cardId: string,
): ReviewSession | null {
  if (session === null || !session.queue.includes(cardId)) return session;
  const queue = session.queue.filter((id) => id !== cardId);
  const completedCardIds = session.completedCardIds.filter(
    (id) => id !== cardId && queue.includes(id),
  );
  return {
    ...session,
    queue,
    completedCardIds,
    initialCount: queue.length,
  };
}

export interface ThreeWayPhase2Merge {
  readonly state: Phase2State;
  readonly conflicts: readonly string[];
}

const structurallyEqual = (left: unknown, right: unknown): boolean => {
  if (left === undefined || right === undefined) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
};

function chooseThreeWay<T>(
  path: string,
  base: T,
  local: T,
  remote: T,
  conflicts: string[],
): T {
  if (structurallyEqual(local, remote)) return local;
  if (structurallyEqual(local, base)) return remote;
  if (structurallyEqual(remote, base)) return local;
  conflicts.push(path);
  return local;
}

function mergeEntitiesThreeWay<T extends { readonly id: string }>(
  path: string,
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  conflicts: string[],
): readonly T[] {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const merged: T[] = [];
  for (const id of ids) {
    const value = chooseThreeWay(
      `${path}.${id}`,
      baseMap.get(id),
      localMap.get(id),
      remoteMap.get(id),
      conflicts,
    );
    if (value !== undefined) merged.push(value);
  }
  return merged;
}

function mergeMemoriesThreeWay(
  base: Phase2State["memories"],
  local: Phase2State["memories"],
  remote: Phase2State["memories"],
  conflicts: string[],
): Phase2State["memories"] {
  const ids = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  const merged: Record<string, ConceptMemory> = {};
  for (const id of ids) {
    const value = chooseThreeWay(
      `memories.${id}`,
      base[id],
      local[id],
      remote[id],
      conflicts,
    );
    if (value !== undefined) merged[id] = value;
  }
  return merged;
}

/**
 * Reconciles only changes that can be proven disjoint from an acknowledged
 * base. Concurrent edits to the same learning object are surfaced to the UI
 * instead of guessing with counters, timestamps, or last-writer-wins.
 */
export function threeWayMergePhase2States(
  baseInput: unknown,
  localInput: unknown,
  remoteInput: unknown,
): ThreeWayPhase2Merge {
  const base = migrateToPhase2(baseInput);
  const local = migrateToPhase2(localInput);
  const remote = migrateToPhase2(remoteInput);
  const conflicts: string[] = [];
  const profileEntries = Object.keys(local.profile) as Array<
    keyof LearnerProfile
  >;
  const profile = Object.fromEntries(
    profileEntries.map((key) => [
      key,
      chooseThreeWay(
        `profile.${String(key)}`,
        base.profile[key],
        local.profile[key],
        remote.profile[key],
        conflicts,
      ),
    ]),
  ) as unknown as LearnerProfile;
  const sources = mergeEntitiesThreeWay(
    "sources",
    base.sources,
    local.sources,
    remote.sources,
    conflicts,
  );
  const cards = mergeEntitiesThreeWay(
    "cards",
    base.cards,
    local.cards,
    remote.cards,
    conflicts,
  );
  const memories = mergeMemoriesThreeWay(
    base.memories,
    local.memories,
    remote.memories,
    conflicts,
  );
  const learningObjectConflict = conflicts.some(
    (path) => path.startsWith("cards.") || path.startsWith("memories."),
  );
  const reviewEvents = learningObjectConflict
    ? local.reviewEvents
    : mergeEntitiesThreeWay(
        "reviewEvents",
        base.reviewEvents,
        local.reviewEvents,
        remote.reviewEvents,
        conflicts,
      );
  if (
    learningObjectConflict &&
    !structurallyEqual(local.reviewEvents, remote.reviewEvents)
  )
    conflicts.push("reviewEvents.concurrent");
  const messages = mergeEntitiesThreeWay(
    "messages",
    base.messages,
    local.messages,
    remote.messages,
    conflicts,
  );
  const activity = mergeEntitiesThreeWay(
    "activity",
    base.activity,
    local.activity,
    remote.activity,
    conflicts,
  );
  const sourceIds = new Set(sources.map((source) => source.id));
  const localActive =
    local.activeSourceId !== null && sourceIds.has(local.activeSourceId)
      ? local.activeSourceId
      : null;
  const remoteActive =
    remote.activeSourceId !== null && sourceIds.has(remote.activeSourceId)
      ? remote.activeSourceId
      : null;
  return {
    state: {
      ...local,
      revision: Math.max(local.revision, remote.revision),
      profile,
      memories,
      sources,
      cards,
      reviewEvents: reviewEvents.slice(-5_000),
      reviewSession: chooseThreeWay(
        "reviewSession",
        base.reviewSession,
        local.reviewSession,
        remote.reviewSession,
        conflicts,
      ),
      stagedPacket: chooseThreeWay(
        "stagedPacket",
        base.stagedPacket,
        local.stagedPacket,
        remote.stagedPacket,
        conflicts,
      ),
      messages: messages.slice(-MAX_MESSAGES),
      activity: activity.slice(0, MAX_ACTIVITY),
      activeSourceId: localActive ?? remoteActive,
      selectedConceptId: local.selectedConceptId,
      selectedKanji: local.selectedKanji,
      lastUndo: local.lastUndo,
    },
    conflicts: [...new Set(conflicts)],
  };
}

export function createActivity(
  type: ActivityEvent["type"],
  label: string,
  conceptIds: readonly string[] = [],
  sourceId: string | null = null,
): ActivityEvent {
  return {
    id: `activity-${crypto.randomUUID()}`,
    type,
    at: nowIso(),
    label,
    conceptIds,
    sourceId,
  };
}
