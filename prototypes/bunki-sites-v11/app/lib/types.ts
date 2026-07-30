export type ViewId =
  | "today"
  | "dictionary"
  | "reader"
  | "sources"
  | "teacher"
  | "review"
  | "kanji"
  | "map";

export type LearningStatus = "seen" | "kept" | "learning" | "known" | "fragile";
export type SourceKind =
  | "article"
  | "youtube"
  | "podcast"
  | "screenshot"
  | "book"
  | "pdf"
  | "conversation"
  | "manual";

export interface VocabEntry {
  readonly id: string;
  readonly source: string;
  readonly word: string;
  readonly altWord: string | null;
  readonly reading: string;
  readonly meanings: readonly string[];
  readonly pos: string;
  readonly jlpt: string | null;
  readonly containsKanji: readonly string[];
}

export interface KanjiEntry {
  readonly id: string;
  readonly char: string;
  readonly meanings: readonly string[];
  readonly onyomi: readonly string[];
  readonly kunyomi: readonly string[];
  readonly strokeCount: number;
  readonly grade: number | null;
  readonly jlpt: string | null;
  readonly strokes: readonly string[];
}

export interface LexemeMemory {
  readonly vocabId: string;
  readonly status: LearningStatus;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly lookups: number;
  readonly sourceIds: readonly string[];
  readonly uncertainty: readonly string[];
}

export interface ConceptMemory {
  readonly conceptId: string;
  readonly status: "learning" | "known" | "fragile";
  readonly reviews: number;
  readonly lastSeenAt: string;
  readonly sourceIds: readonly string[];
}

export interface SourceItem {
  readonly id: string;
  readonly kind: SourceKind;
  readonly title: string;
  readonly url: string;
  readonly text: string;
  readonly addedAt: string;
  readonly progress: number;
  readonly provenance: "user-supplied" | "generated-sample";
  readonly capturedVocabIds: readonly string[];
}

export interface ReviewCard {
  readonly id: string;
  readonly vocabId: string | null;
  readonly sourceId: string | null;
  readonly conceptId?: string | null;
  readonly front: string;
  readonly back: string;
  readonly context: string;
  readonly kind: "sentence" | "cloze" | "production" | "kanji" | "grammar" | "listening";
  readonly createdAt: string;
  readonly dueAt: string;
  readonly intervalDays: number;
  readonly ease: number;
  readonly repetitions: number;
  readonly lapses: number;
  readonly lastReviewedAt: string | null;
  readonly fsrs: {
    readonly stability: number;
    readonly difficulty: number;
    readonly elapsedDays: number;
    readonly scheduledDays: number;
    readonly learningSteps: number;
    readonly reps: number;
    readonly lapses: number;
    readonly state: number;
    readonly lastReview: string | null;
  };
}

export interface ReviewRecord {
  readonly id: string;
  readonly cardId: string;
  readonly rating: 1 | 2 | 3 | 4;
  readonly reviewedAt: string;
  readonly previousDueAt: string;
  readonly nextDueAt: string;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: "learner" | "teacher";
  readonly text: string;
  readonly createdAt: string;
  readonly contextVocabId: string | null;
  readonly generated: boolean;
}

export interface LearnerProfile {
  readonly displayName: string;
  readonly currentLevel: "zero" | "N5" | "N4" | "N3" | "N2" | "N1" | "N1+";
  readonly target: string;
  readonly interests: readonly string[];
  readonly dailyMinutes: number;
}

export interface LearnerState {
  readonly version: 1;
  readonly profile: LearnerProfile;
  readonly memories: Readonly<Record<string, LexemeMemory>>;
  readonly conceptMemories?: Readonly<Record<string, ConceptMemory>>;
  readonly sources: readonly SourceItem[];
  readonly cards: readonly ReviewCard[];
  readonly reviews: readonly ReviewRecord[];
  readonly messages: readonly ChatMessage[];
  readonly activeSourceId: string | null;
  readonly selectedVocabId: string | null;
  readonly selectedKanji: string | null;
}
