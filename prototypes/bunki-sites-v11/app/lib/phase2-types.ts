export type Level = "zero" | "N5" | "N4" | "N3" | "N2" | "N1" | "N1+";
export type ConceptKind = "vocabulary" | "kanji" | "grammar";
export type SkillAxis =
  | "recognition"
  | "reading"
  | "listening"
  | "production"
  | "writing";
export type EvidenceOutcome = "success" | "partial" | "failure";
export type DerivedMemoryState =
  | "unseen"
  | "encountered"
  | "learning"
  | "fragile"
  | "established";
export type LearnerIntent = "normal" | "keep" | "ignore" | "suspend";
export type SourceKind =
  | "article"
  | "youtube"
  | "podcast"
  | "screenshot"
  | "book"
  | "pdf"
  | "conversation"
  | "manual";
export type SourceStatus = "inbox" | "ready" | "reading" | "mined" | "archived";
export type CardKind =
  | "recognition"
  | "cloze"
  | "production"
  | "listening"
  | "kanji"
  | "grammar";

export interface SkillEvidence {
  readonly attempts: number;
  readonly successes: number;
  readonly partials: number;
  readonly failures: number;
  readonly confidence: number;
  readonly lastOutcome: EvidenceOutcome | null;
  readonly lastAt: string | null;
}

export interface ConceptMemory {
  readonly conceptId: string;
  readonly kind: ConceptKind;
  readonly intent: LearnerIntent;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly exposures: number;
  readonly sourceIds: readonly string[];
  readonly contextFingerprints: readonly string[];
  readonly uncertainties: readonly string[];
  readonly axes: Readonly<Record<SkillAxis, SkillEvidence>>;
  readonly reviewCount: number;
  readonly lapseCount: number;
  readonly consecutiveFailures: number;
  readonly suspended: boolean;
}

export interface SourceAnalysisCandidate {
  readonly conceptId: string;
  readonly kind: "vocabulary" | "grammar";
  readonly surface: string;
  readonly dictionaryForm: string;
  readonly reading: string;
  readonly meaning: string;
  readonly sentence: string;
  readonly sentenceIndex: number;
  readonly startInSentence: number;
  readonly endInSentence: number;
  readonly score: number;
  readonly reason: string;
  readonly memoryState: DerivedMemoryState;
}

export interface SourceAnalysis {
  readonly analyzedAt: string;
  readonly textFingerprint: string;
  readonly sentenceCount: number;
  readonly tokenCount: number;
  readonly coverage: number;
  readonly knownCount: number;
  readonly learningCount: number;
  readonly unknownCount: number;
  readonly candidates: readonly SourceAnalysisCandidate[];
  readonly grammarIds: readonly string[];
}

export interface SourceTranscriptSegment {
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

export interface SourceItem {
  readonly id: string;
  readonly kind: SourceKind;
  readonly status: SourceStatus;
  readonly title: string;
  readonly url: string;
  readonly text: string;
  readonly addedAt: string;
  readonly updatedAt: string;
  readonly progress: number;
  readonly readingSentence: number;
  readonly provenance: "user-supplied" | "generated-sample";
  readonly capturedConceptIds: readonly string[];
  readonly notes: string;
  readonly segments: readonly SourceTranscriptSegment[];
  readonly analysis: SourceAnalysis | null;
}

export interface FsrsSnapshot {
  readonly stability: number;
  readonly difficulty: number;
  readonly elapsedDays: number;
  readonly scheduledDays: number;
  readonly learningSteps: number;
  readonly reps: number;
  readonly lapses: number;
  readonly state: number;
  readonly lastReview: string | null;
}

export interface LineageAnchor {
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly exactText: string;
  readonly role: "target" | "prior";
  readonly generated: boolean;
}

export interface LearningCard {
  readonly id: string;
  readonly conceptId: string;
  readonly sourceId: string | null;
  readonly sourceSentence: string;
  readonly front: string;
  readonly back: string;
  readonly reading: string;
  readonly note: string;
  readonly rationale: string;
  readonly tags: readonly string[];
  readonly lineage: readonly LineageAnchor[];
  readonly kind: CardKind;
  readonly skill: SkillAxis;
  readonly origin: "source" | "conversation" | "generated" | "manual";
  readonly generated: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dueAt: string;
  readonly suspended: boolean;
  readonly leech: boolean;
  readonly fsrs: FsrsSnapshot;
}

export interface CardProposal {
  readonly id: string;
  readonly conceptId: string;
  readonly sourceId: string | null;
  readonly sourceSentence: string;
  readonly front: string;
  readonly back: string;
  readonly reading: string;
  readonly note: string;
  readonly rationale: string;
  readonly tags: readonly string[];
  readonly lineage: readonly LineageAnchor[];
  readonly kind: CardKind;
  readonly skill: SkillAxis;
  readonly origin: "source" | "conversation" | "generated" | "manual";
  readonly generated: boolean;
  readonly selected: boolean;
}

export interface StagedPacket {
  readonly id: string;
  readonly sourceId: string | null;
  readonly title: string;
  readonly createdAt: string;
  readonly proposals: readonly CardProposal[];
}

export interface ReviewEvent {
  readonly id: string;
  readonly cardId: string;
  readonly conceptId: string;
  readonly rating: 1 | 2 | 3 | 4;
  readonly reviewedAt: string;
  readonly previousCard: LearningCard;
  readonly nextCard: LearningCard;
  readonly previousMemory?: ConceptMemory;
  readonly nextMemory?: ConceptMemory;
}

export interface ReviewSession {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly queue: readonly string[];
  readonly completedCardIds: readonly string[];
  readonly initialCount: number;
}

export interface TeacherCorrection {
  readonly original: string;
  readonly corrected: string;
  readonly explanation: string;
  readonly severity: "note" | "minor" | "important";
}

export interface TeacherMessage {
  readonly id: string;
  readonly role: "learner" | "teacher";
  readonly text: string;
  readonly supportEn: string | null;
  readonly createdAt: string;
  readonly generated: boolean;
  readonly corrections: readonly TeacherCorrection[];
  readonly branches: readonly string[];
  readonly whyThisFits: string | null;
}

export interface PlacementAnswer {
  readonly itemId: string;
  readonly level: Level;
  readonly correct: boolean;
}

export interface LearnerProfile {
  readonly displayName: string;
  readonly currentLevel: Level;
  readonly targetLevel: Level;
  readonly target: string;
  readonly interests: readonly string[];
  readonly dailyMinutes: number;
  readonly preferredMedia: readonly SourceKind[];
  readonly onboardingComplete: boolean;
  readonly placementComplete: boolean;
  readonly placementAnswers: readonly PlacementAnswer[];
  readonly furigana: "always" | "learning" | "off";
}

export interface ActivityEvent {
  readonly id: string;
  readonly type:
    | "source-added"
    | "source-analyzed"
    | "packet-admitted"
    | "review"
    | "conversation"
    | "placement";
  readonly at: string;
  readonly label: string;
  readonly conceptIds: readonly string[];
  readonly sourceId: string | null;
}

export interface Phase2State {
  readonly version: 2;
  readonly revision: number;
  readonly profile: LearnerProfile;
  readonly memories: Readonly<Record<string, ConceptMemory>>;
  readonly sources: readonly SourceItem[];
  readonly cards: readonly LearningCard[];
  readonly reviewEvents: readonly ReviewEvent[];
  readonly reviewSession: ReviewSession | null;
  readonly stagedPacket: StagedPacket | null;
  readonly messages: readonly TeacherMessage[];
  readonly activity: readonly ActivityEvent[];
  readonly activeSourceId: string | null;
  readonly selectedConceptId: string | null;
  readonly selectedKanji: string | null;
  readonly lastUndo: ReviewEvent | null;
}

export interface TeacherRequest {
  readonly clientTurnId: string;
  readonly input: string;
  readonly mode: "conversation" | "explain" | "correct" | "roleplay";
  readonly profile: Pick<
    LearnerProfile,
    "currentLevel" | "targetLevel" | "target" | "interests"
  >;
  readonly recentMessages: readonly Pick<TeacherMessage, "role" | "text">[];
  readonly activeSource: {
    readonly id: string;
    readonly title: string;
    readonly excerpt: string;
  } | null;
  readonly frontier: readonly {
    readonly conceptId: string;
    readonly surface: string;
    readonly dictionaryForm: string;
    readonly reading: string;
    readonly forms: readonly string[];
    readonly meaning: string;
    readonly state: DerivedMemoryState;
    readonly reason: string;
    readonly priorContexts: readonly string[];
  }[];
}

export interface TeacherResponse {
  readonly replyJa: string;
  readonly supportEn: string | null;
  readonly reintroducedConceptIds: readonly string[];
  readonly corrections: readonly TeacherCorrection[];
  readonly evidence: readonly {
    readonly conceptId: string;
    readonly skill: SkillAxis;
    readonly outcome: EvidenceOutcome;
    readonly confidence: number;
  }[];
  readonly branches: readonly string[];
  readonly cardProposals: readonly {
    readonly conceptId: string;
    readonly front: string;
    readonly back: string;
    readonly rationale: string;
  }[];
  readonly nextMove: string;
  readonly whyThisFits: string;
  readonly mode: "live-ai" | "local-coach";
  readonly model: string | null;
}
