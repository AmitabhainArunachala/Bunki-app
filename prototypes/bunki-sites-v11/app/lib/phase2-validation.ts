import { isSourceTextFingerprint, sourceTextFingerprint } from "./source-fingerprint.ts";

const AXES = ["recognition", "reading", "listening", "production", "writing"] as const;
const LEVELS = ["zero", "N5", "N4", "N3", "N2", "N1", "N1+"] as const;
const SOURCE_KINDS = [
  "article",
  "youtube",
  "podcast",
  "screenshot",
  "book",
  "pdf",
  "conversation",
  "manual",
] as const;
const CARD_KINDS = [
  "recognition",
  "cloze",
  "production",
  "listening",
  "kanji",
  "grammar",
] as const;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum = Number.POSITIVE_INFINITY): value is string =>
  typeof value === "string" && value.length <= maximum;
const finite = (
  value: unknown,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= minimum &&
  value <= maximum;
const integer = (
  value: unknown,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number =>
  finite(value, minimum, maximum) && Number.isInteger(value);
const boolean = (value: unknown): value is boolean => typeof value === "boolean";
const oneOf = <T extends string>(
  value: unknown,
  choices: readonly T[],
): value is T => typeof value === "string" && choices.includes(value as T);
const stringArray = (
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): value is string[] =>
  Array.isArray(value) &&
  value.length <= maximumItems &&
  value.every((item) => text(item, maximumLength));
const iso = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
  Number.isFinite(Date.parse(value));
const nullableIso = (value: unknown): value is string | null =>
  value === null || iso(value);

function validEvidence(value: unknown): boolean {
  if (!record(value)) return false;
  const attempts = value.attempts;
  const successes = value.successes;
  const partials = value.partials;
  const failures = value.failures;
  return (
    integer(attempts, 0, 10_000_000) &&
    integer(successes, 0, attempts) &&
    integer(partials, 0, attempts) &&
    integer(failures, 0, attempts) &&
    successes + partials + failures <= attempts &&
    finite(value.confidence, 0, 1) &&
    (value.lastOutcome === null ||
      oneOf(value.lastOutcome, ["success", "partial", "failure"] as const)) &&
    nullableIso(value.lastAt)
  );
}

function validMemory(value: unknown, conceptId?: string): boolean {
  if (!record(value) || (conceptId !== undefined && value.conceptId !== conceptId))
    return false;
  return (
    text(value.conceptId, 180) &&
    value.conceptId !== "" &&
    oneOf(value.kind, ["vocabulary", "kanji", "grammar"] as const) &&
    oneOf(value.intent, ["normal", "keep", "ignore", "suspend"] as const) &&
    iso(value.firstSeenAt) &&
    iso(value.lastSeenAt) &&
    integer(value.exposures, 0, 10_000_000) &&
    stringArray(value.sourceIds, 1_000, 200) &&
    stringArray(value.contextFingerprints, 2_000, 10_000) &&
    stringArray(value.uncertainties, 30, 1_000) &&
    record(value.axes) &&
    AXES.every((axis) => validEvidence(value.axes[axis])) &&
    integer(value.reviewCount, 0, 10_000_000) &&
    integer(value.lapseCount, 0, 10_000_000) &&
    integer(value.consecutiveFailures, 0, 10_000_000) &&
    boolean(value.suspended)
  );
}

function validFsrs(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    finite(value.stability, 0, 1_000_000_000) &&
    finite(value.difficulty, 0, 10) &&
    integer(value.elapsedDays, 0, 1_000_000) &&
    integer(value.scheduledDays, 0, 1_000_000) &&
    integer(value.learningSteps, 0, 1_000_000) &&
    integer(value.reps, 0, 10_000_000) &&
    integer(value.lapses, 0, 10_000_000) &&
    integer(value.state, 0, 3) &&
    nullableIso(value.lastReview)
  );
}

function validLineage(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (anchor) =>
        record(anchor) &&
        text(anchor.sourceId, 200) &&
        anchor.sourceId !== "" &&
        text(anchor.sourceFingerprint, 160) &&
        anchor.sourceFingerprint !== "" &&
        text(anchor.exactText, 10_000) &&
        anchor.exactText !== "" &&
        oneOf(anchor.role, ["target", "prior"] as const) &&
        boolean(anchor.generated),
    )
  );
}

function validCard(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    text(value.id, 200) &&
    value.id !== "" &&
    text(value.conceptId, 180) &&
    value.conceptId !== "" &&
    (value.sourceId === null ||
      (text(value.sourceId, 200) && value.sourceId !== "")) &&
    text(value.sourceSentence, 10_000) &&
    text(value.front, 10_000) &&
    value.front !== "" &&
    text(value.back, 10_000) &&
    value.back !== "" &&
    text(value.reading, 500) &&
    text(value.note, 5_000) &&
    text(value.rationale, 1_000) &&
    stringArray(value.tags, 30, 200) &&
    validLineage(value.lineage) &&
    oneOf(value.kind, CARD_KINDS) &&
    oneOf(value.skill, AXES) &&
    oneOf(value.origin, ["source", "conversation", "generated", "manual"] as const) &&
    boolean(value.generated) &&
    iso(value.createdAt) &&
    iso(value.updatedAt) &&
    iso(value.dueAt) &&
    boolean(value.suspended) &&
    boolean(value.leech) &&
    validFsrs(value.fsrs)
  );
}

function validAnalysisCandidate(value: unknown): boolean {
  if (!record(value)) return false;
  if (
    !text(value.conceptId, 180) ||
    value.conceptId === "" ||
    !oneOf(value.kind, ["vocabulary", "grammar"] as const) ||
    !text(value.surface, 200) ||
    value.surface === "" ||
    !text(value.dictionaryForm, 200) ||
    !text(value.reading, 200) ||
    !text(value.meaning, 1_000) ||
    !text(value.sentence, 10_000) ||
    !integer(value.sentenceIndex, 0, 1_000_000) ||
    !integer(value.startInSentence, 0, value.sentence.length) ||
    !integer(value.endInSentence, value.startInSentence + 1, value.sentence.length) ||
    !finite(value.score, -1_000_000, 1_000_000) ||
    !text(value.reason, 1_000) ||
    !oneOf(
      value.memoryState,
      ["unseen", "encountered", "learning", "fragile", "established"] as const,
    )
  )
    return false;
  return (
    value.kind === "grammar" ||
    value.sentence.slice(value.startInSentence, value.endInSentence) ===
      value.surface
  );
}

function validSource(value: unknown): boolean {
  if (!record(value)) return false;
  if (
    !text(value.id, 200) ||
    value.id === "" ||
    !oneOf(value.kind, SOURCE_KINDS) ||
    !oneOf(value.status, ["inbox", "ready", "reading", "mined", "archived"] as const) ||
    !text(value.title, 180) ||
    !text(value.url, 2_000) ||
    !text(value.text, 500_000) ||
    !iso(value.addedAt) ||
    !iso(value.updatedAt) ||
    !finite(value.progress, 0, 100) ||
    !integer(value.readingSentence, 0, 1_000_000) ||
    !oneOf(value.provenance, ["user-supplied", "generated-sample"] as const) ||
    !stringArray(value.capturedConceptIds, 50_000, 180) ||
    !text(value.notes, 10_000) ||
    !Array.isArray(value.segments) ||
    value.segments.length > 20_000
  )
    return false;
  if (
    !value.segments.every(
      (segment) =>
        record(segment) &&
        finite(segment.startSeconds, 0, 100_000_000) &&
        finite(segment.durationSeconds, 0, 100_000_000) &&
        integer(segment.startCharacter, 0, value.text.length) &&
        integer(
          segment.endCharacter,
          segment.startCharacter + 1,
          value.text.length,
        ),
    )
  )
    return false;
  if (value.analysis === null) return true;
  const analysis = value.analysis;
  return (
    record(analysis) &&
    iso(analysis.analyzedAt) &&
    isSourceTextFingerprint(String(analysis.textFingerprint)) &&
    analysis.textFingerprint === sourceTextFingerprint(value.text) &&
    integer(analysis.sentenceCount, 0, 1_000_000) &&
    integer(analysis.tokenCount, 0, 10_000_000) &&
    finite(analysis.coverage, 0, 100) &&
    integer(analysis.knownCount, 0, 10_000_000) &&
    integer(analysis.learningCount, 0, 10_000_000) &&
    integer(analysis.unknownCount, 0, 10_000_000) &&
    Array.isArray(analysis.candidates) &&
    analysis.candidates.length <= 30 &&
    analysis.candidates.every(validAnalysisCandidate) &&
    stringArray(analysis.grammarIds, 200, 180)
  );
}

function validProposal(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    text(value.id, 200) &&
    value.id !== "" &&
    text(value.conceptId, 180) &&
    value.conceptId !== "" &&
    (value.sourceId === null ||
      (text(value.sourceId, 200) && value.sourceId !== "")) &&
    text(value.sourceSentence, 10_000) &&
    text(value.front, 10_000) &&
    value.front !== "" &&
    text(value.back, 10_000) &&
    value.back !== "" &&
    text(value.reading, 500) &&
    text(value.note, 5_000) &&
    text(value.rationale, 1_000) &&
    stringArray(value.tags, 30, 200) &&
    validLineage(value.lineage) &&
    oneOf(value.kind, CARD_KINDS) &&
    oneOf(value.skill, AXES) &&
    oneOf(value.origin, ["source", "conversation", "generated", "manual"] as const) &&
    boolean(value.generated) &&
    boolean(value.selected)
  );
}

function validReviewEvent(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    text(value.id, 200) &&
    value.id !== "" &&
    text(value.cardId, 200) &&
    text(value.conceptId, 180) &&
    integer(value.rating, 1, 4) &&
    iso(value.reviewedAt) &&
    validCard(value.previousCard) &&
    validCard(value.nextCard) &&
    (value.previousMemory === undefined ||
      validMemory(value.previousMemory, value.conceptId as string)) &&
    (value.nextMemory === undefined ||
      validMemory(value.nextMemory, value.conceptId as string))
  );
}

/**
 * Strict validation for current-version writes. Legacy coercion belongs only
 * to local import/migration; malformed cloud writes are rejected.
 */
export function validatePhase2StateForPersistence(value: unknown): boolean {
  if (!record(value) || value.version !== 2 || !integer(value.revision, 0))
    return false;
  const profile = value.profile;
  if (
    !record(profile) ||
    !text(profile.displayName, 80) ||
    !oneOf(profile.currentLevel, LEVELS) ||
    !oneOf(profile.targetLevel, LEVELS) ||
    !text(profile.target, 300) ||
    !stringArray(profile.interests, 12, 120) ||
    !finite(profile.dailyMinutes, 5, 480) ||
    !Array.isArray(profile.preferredMedia) ||
    profile.preferredMedia.length > SOURCE_KINDS.length ||
    !profile.preferredMedia.every((kind) => oneOf(kind, SOURCE_KINDS)) ||
    !boolean(profile.onboardingComplete) ||
    !boolean(profile.placementComplete) ||
    !Array.isArray(profile.placementAnswers) ||
    profile.placementAnswers.length > 30 ||
    !profile.placementAnswers.every(
      (answer) =>
        record(answer) &&
        text(answer.itemId, 120) &&
        answer.itemId !== "" &&
        oneOf(answer.level, LEVELS) &&
        boolean(answer.correct),
    ) ||
    !oneOf(profile.furigana, ["always", "learning", "off"] as const)
  )
    return false;

  if (
    !record(value.memories) ||
    Object.keys(value.memories).length > 50_000 ||
    !Object.entries(value.memories).every(([id, memory]) =>
      validMemory(memory, id),
    ) ||
    !Array.isArray(value.sources) ||
    value.sources.length > 2_000 ||
    !value.sources.every(validSource) ||
    !Array.isArray(value.cards) ||
    value.cards.length > 25_000 ||
    !value.cards.every(validCard) ||
    !Array.isArray(value.reviewEvents) ||
    value.reviewEvents.length > 5_000 ||
    !value.reviewEvents.every(validReviewEvent) ||
    !Array.isArray(value.messages) ||
    value.messages.length > 10_000 ||
    !Array.isArray(value.activity) ||
    value.activity.length > 10_000
  )
    return false;

  const sourceIds = new Set(
    (value.sources as Array<Record<string, unknown>>).map((source) => source.id),
  );
  const cardIds = new Set(
    (value.cards as Array<Record<string, unknown>>).map((card) => card.id),
  );
  if (
    sourceIds.size !== value.sources.length ||
    cardIds.size !== value.cards.length ||
    (value.activeSourceId !== null && !sourceIds.has(value.activeSourceId)) ||
    !(value.selectedConceptId === null || text(value.selectedConceptId, 180)) ||
    !(value.selectedKanji === null || text(value.selectedKanji, 8))
  )
    return false;

  if (value.reviewSession !== null) {
    const session = value.reviewSession;
    if (
      !record(session) ||
      !text(session.id, 200) ||
      session.id === "" ||
      !iso(session.startedAt) ||
      !nullableIso(session.completedAt) ||
      !stringArray(session.queue, 100, 200) ||
      !stringArray(session.completedCardIds, 100, 200) ||
      !session.queue.every((id) => cardIds.has(id)) ||
      !session.completedCardIds.every((id) => session.queue.includes(id)) ||
      !integer(session.initialCount, 0, 100) ||
      session.initialCount !== session.queue.length
    )
      return false;
  }

  if (value.stagedPacket !== null) {
    const packet = value.stagedPacket;
    if (
      !record(packet) ||
      !text(packet.id, 200) ||
      packet.id === "" ||
      !(packet.sourceId === null || sourceIds.has(packet.sourceId)) ||
      !text(packet.title, 300) ||
      !iso(packet.createdAt) ||
      !Array.isArray(packet.proposals) ||
      packet.proposals.length > 30 ||
      !packet.proposals.every(validProposal)
    )
      return false;
  }

  if (
    !value.messages.every(
      (message) =>
        record(message) &&
        text(message.id, 200) &&
        message.id !== "" &&
        oneOf(message.role, ["learner", "teacher"] as const) &&
        text(message.text, 4_000) &&
        message.text !== "" &&
        (message.supportEn === null || text(message.supportEn, 2_000)) &&
        iso(message.createdAt) &&
        boolean(message.generated) &&
        Array.isArray(message.corrections) &&
        message.corrections.length <= 4 &&
        message.corrections.every(
          (correction) =>
            record(correction) &&
            text(correction.original, 400) &&
            correction.original !== "" &&
            text(correction.corrected, 400) &&
            correction.corrected !== "" &&
            text(correction.explanation, 800) &&
            correction.explanation !== "" &&
            oneOf(correction.severity, ["note", "minor", "important"] as const),
        ) &&
        stringArray(message.branches, 4, 1_000) &&
        (message.whyThisFits === null || text(message.whyThisFits, 500)),
    ) ||
    !value.activity.every(
      (event) =>
        record(event) &&
        text(event.id, 200) &&
        event.id !== "" &&
        oneOf(
          event.type,
          [
            "source-added",
            "source-analyzed",
            "packet-admitted",
            "review",
            "conversation",
            "placement",
          ] as const,
        ) &&
        iso(event.at) &&
        text(event.label, 1_000) &&
        stringArray(event.conceptIds, 1_000, 180) &&
        (event.sourceId === null || text(event.sourceId, 200)),
    ) ||
    !(value.lastUndo === null || validReviewEvent(value.lastUndo))
  )
    return false;
  return true;
}
