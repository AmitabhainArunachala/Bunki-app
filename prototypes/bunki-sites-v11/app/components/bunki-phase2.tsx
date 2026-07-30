"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Languages,
  LibraryBig,
  Link2,
  ListChecks,
  LoaderCircle,
  Menu,
  MessageCircleMore,
  Mic2,
  Minimize2,
  MoreHorizontal,
  Newspaper,
  Pause,
  PenLine,
  Play,
  Plus,
  Rss,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  loadDictionary,
  searchDictionaryDetailed,
  wordsForKanji,
  type DictionaryIndex,
} from "../lib/dictionary";
import { GRAMMAR_PATTERNS, searchGrammar } from "../lib/grammar";
import { phase2CardsToAnkiTsv } from "../lib/export-format";
import {
  bestNextAction,
  applyTeacherEvidence,
  dueCards,
  learningSummary,
  memoryState,
  rankFrontier,
  recordEvidence,
  reviewSessionLimit,
  sourceReadiness,
} from "../lib/learner-engine";
import {
  analyzeSource,
  contextsForConcept,
  hasEquivalentCard,
  proposalToCard,
  sentenceSpans,
  stageSourcePacket,
  textFingerprint,
} from "../lib/mining-engine";
import {
  compactPhase2State,
  createActivity,
  createInitialPhase2State,
  MAX_CARD_BACK_CHARACTERS,
  MAX_CARD_FRONT_CHARACTERS,
  MAX_CARD_NOTE_CHARACTERS,
  migrateToPhase2,
  removeCardFromReviewSession,
  threeWayMergePhase2States,
} from "../lib/phase2-state";
import {
  loadLocalPhase2Snapshot,
  loadLocalSourceBody,
  saveLocalPhase2Snapshot,
  type LocalPhase2Conflict,
  type LocalPhase2Snapshot,
} from "../lib/local-phase2-store";
import {
  rateLearningCard,
  ratingPreviews,
  sessionProgress,
  startReviewSession,
} from "../lib/phase2-scheduler";
import {
  boundTeacherResponseToReply,
  localCoachResponse,
  teacherProposalsToCards,
} from "../lib/teacher-contract";
import {
  cleanTranscript,
  loadJapaneseTokenizer,
  tokenizeJapanese,
  type JapaneseTokenizer,
  type ReaderToken,
} from "../lib/tokenize";
import {
  READING_CATALOG,
  nextReaderWordDepth,
  readingMinutes,
  suggestedReadingsForLevel,
  textForReadingLength,
  type ReaderWordDepth,
  type ReadingCatalogItem,
  type ReadingLength,
} from "../lib/reading-catalog";
import type { LiveReadingItem } from "../lib/reading-feeds";
import type {
  CardProposal,
  LearnerProfile,
  LearningCard,
  Level,
  Phase2State,
  SourceItem,
  SourceKind,
  SourceTranscriptSegment,
  TeacherMessage,
  TeacherResponse,
} from "../lib/phase2-types";
import type { KanjiEntry, VocabEntry } from "../lib/types";

type View = "today" | "immerse" | "review" | "coach" | "library";
type LibraryTab = "dictionary" | "kanji" | "grammar" | "memory";
type ImmerseMode = "discover" | "reader";
type ReadingFilter = "all" | "graded" | "real" | "historical" | "live";
type ReaderLexicalReturnContext = {
  readonly sourceId: string;
  readonly sentenceIndex: number;
  readonly word: string;
  readonly token: ReaderToken;
  readonly scrollY: number;
};
type KanjiReturnContext =
  | ({ readonly kind: "reader" } & ReaderLexicalReturnContext)
  | {
      readonly kind: "dictionary";
      readonly word: string;
      readonly wordId: string;
    };
type LiveSourceSummary = {
  readonly id: string;
  readonly name: string;
  readonly homepage: string;
  readonly domain: string;
  readonly lane: LiveReadingItem["lane"];
  readonly level: LiveReadingItem["level"];
  readonly articleCount: number;
  readonly available: boolean;
};
type SyncStatus =
  "loading" | "saved" | "saving" | "local" | "conflict" | "not-saved";

const NAV: readonly {
  readonly id: View;
  readonly label: string;
  readonly japanese: string;
  readonly icon: typeof BookOpen;
}[] = [
  { id: "today", label: "Today", japanese: "今日", icon: Sparkles },
  { id: "immerse", label: "Immerse", japanese: "読む", icon: BookOpen },
  { id: "review", label: "Review", japanese: "復習", icon: ListChecks },
  { id: "coach", label: "Coach", japanese: "会話", icon: MessageCircleMore },
  { id: "library", label: "Library", japanese: "辞典", icon: LibraryBig },
] as const;

const LEVELS: readonly Level[] = ["zero", "N5", "N4", "N3", "N2", "N1", "N1+"];

const SOURCE_KINDS: readonly {
  readonly id: SourceKind;
  readonly label: string;
}[] = [
  { id: "youtube", label: "YouTube" },
  { id: "article", label: "Article" },
  { id: "podcast", label: "Podcast" },
  { id: "screenshot", label: "Screenshot / OCR" },
  { id: "pdf", label: "PDF text" },
  { id: "book", label: "Book / Kindle" },
  { id: "conversation", label: "Conversation" },
  { id: "manual", label: "Note" },
] as const;

const PLACEMENT: readonly {
  readonly level: Level;
  readonly sentence: string;
  readonly meaning: string;
}[] = [
  {
    level: "N5",
    sentence: "毎朝、日本語を勉強します。",
    meaning: "I study Japanese every morning.",
  },
  {
    level: "N4",
    sentence: "歩きながら、昨日の動画をもう一度聞いてみた。",
    meaning: "While walking, I tried listening to yesterday’s video again.",
  },
  {
    level: "N3",
    sentence: "文脈ごと覚えることで、自然に使えるようになる。",
    meaning: "Learning the whole context helps it become naturally usable.",
  },
  {
    level: "N2",
    sentence:
      "内容は理解できたものの、細かなニュアンスまでは捉えきれなかった。",
    meaning:
      "Although I understood the content, I could not fully grasp the finer nuances.",
  },
  {
    level: "N1",
    sentence: "知識の蓄積は、必ずしも運用能力の向上を意味するわけではない。",
    meaning:
      "Accumulating knowledge does not necessarily mean improving usable ability.",
  },
] as const;

const INTERESTS = [
  "Japanese philosophy",
  "AI and machine learning",
  "Spirituality",
  "Sacred mountains",
  "Kansai speech",
  "Long-form YouTube",
  "News",
  "Literature",
] as const;

const LEGACY_EMPTY_SUGGESTION_URLS = new Set([
  "https://www3.nhk.or.jp/news/easy/",
  "https://www3.nhk.or.jp/news/",
  "https://www.riken.jp/press/",
  "https://ifohs.kyoto-u.ac.jp/",
  "https://www.koyasan.or.jp/shingonshu/",
]);

const STARTER_TEXT =
  "これは本です。私は毎日、日本語を勉強します。少しずつ分かるようになります。";
const STARTER_TRANSLATIONS = [
  "This is a book.",
  "I study Japanese every day.",
  "Little by little, I will come to understand.",
] as const;
const KANA_STARTER_ROWS = [
  ["あ い う え お", "ア イ ウ エ オ", "a · i · u · e · o"],
  ["か き く け こ", "カ キ ク ケ コ", "ka · ki · ku · ke · ko"],
  ["さ し す せ そ", "サ シ ス セ ソ", "sa · shi · su · se · so"],
  ["た ち つ て と", "タ チ ツ テ ト", "ta · chi · tsu · te · to"],
  ["な に ぬ ね の", "ナ ニ ヌ ネ ノ", "na · ni · nu · ne · no"],
  ["は ひ ふ へ ほ", "ハ ヒ フ ヘ ホ", "ha · hi · fu · he · ho"],
  ["ま み む め も", "マ ミ ム メ モ", "ma · mi · mu · me · mo"],
  ["や　 ゆ　 よ", "ヤ　 ユ　 ヨ", "ya · yu · yo"],
  ["ら り る れ ろ", "ラ リ ル レ ロ", "ra · ri · ru · re · ro"],
  ["わ　 を　 ん", "ワ　 ヲ　 ン", "wa · o · n"],
] as const;

const uid = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const iso = (): string => new Date().toISOString();
const READER_WINDOW_SIZE = 120;
const MAX_SOURCE_CHARACTERS = 500_000;

type CloudStateManifest = Omit<Phase2State, "sources"> & {
  readonly sources: ReadonlyArray<
    Omit<SourceItem, "text"> & {
      readonly text: "";
      readonly bodyFingerprint: string | null;
    }
  >;
};
const cloudSourceFingerprintCache = new WeakMap<object, string>();

const cloudManifest = (state: Phase2State): CloudStateManifest => ({
  ...state,
  sources: state.sources.map((source) => ({
    ...source,
    text: "",
    bodyFingerprint:
      source.text === ""
        ? null
        : (cloudSourceFingerprintCache.get(source) ??
          (() => {
            const fingerprint = textFingerprint(source.text);
            cloudSourceFingerprintCache.set(source, fingerprint);
            return fingerprint;
          })()),
  })),
});

const safeExternalUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const sourceUrlAt = (value: string, seconds: number | null): string | null => {
  const safe = safeExternalUrl(value);
  if (safe === null || seconds === null) return safe;
  try {
    const url = new URL(safe);
    if (
      url.hostname === "youtu.be" ||
      url.hostname.endsWith("youtube.com") ||
      url.hostname.endsWith("youtube-nocookie.com")
    )
      url.searchParams.set("t", String(Math.max(0, Math.floor(seconds))));
    return url.toString();
  } catch {
    return safe;
  }
};

const timestampLabel = (seconds: number): string => {
  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${String(minutes)}:${String(remainder).padStart(2, "0")}`;
};

const speakJapanese = (text: string, rate = 0.92): void => {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
};

const downloadText = (
  name: string,
  text: string,
  type = "application/json",
): void => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const conceptKind = (conceptId: string): "vocabulary" | "grammar" | "kanji" =>
  conceptId.startsWith("grammar:")
    ? "grammar"
    : conceptId.startsWith("kanji:")
      ? "kanji"
      : "vocabulary";

function Surface({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <section className={`p2-surface ${className}`}>{children}</section>;
}

function StatusPill({
  state,
}: {
  readonly state: ReturnType<typeof memoryState>;
}) {
  return <span className={`p2-memory-pill ${state}`}>{state}</span>;
}

function Phase2Brand() {
  return (
    <div className="p2-brand">
      <span aria-hidden="true">分岐</span>
      <div>
        <strong>Bunki</strong>
        <small>Living Japanese</small>
      </div>
    </div>
  );
}

export function BunkiPhase2(): ReactNode {
  const [state, setState] = useState<Phase2State>(createInitialPhase2State);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [view, setView] = useState<View>("today");
  const [zenMode, setZenMode] = useState(false);
  const [kanjiFocusMode, setKanjiFocusMode] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureAdvanced, setCaptureAdvanced] = useState(false);
  const [captureKind, setCaptureKind] = useState<SourceKind>("youtube");
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [captureSegments, setCaptureSegments] = useState<
    readonly SourceTranscriptSegment[]
  >([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captionBusy, setCaptionBusy] = useState(false);
  const [dictionary, setDictionary] = useState<DictionaryIndex | null>(null);
  const [tokenizer, setTokenizer] = useState<JapaneseTokenizer | null>(null);
  const [languageBusy, setLanguageBusy] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [readerToken, setReaderToken] = useState<ReaderToken | null>(null);
  const [readerWordDepth, setReaderWordDepth] = useState<ReaderWordDepth>(0);
  const [readerSentence, setReaderSentence] = useState<number | null>(null);
  const [immerseMode, setImmerseMode] = useState<ImmerseMode>("discover");
  const [readingLength, setReadingLength] = useState<ReadingLength>("medium");
  const [readingLevel, setReadingLevel] =
    useState<Exclude<Level, "zero">>("N2");
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [liveReadings, setLiveReadings] = useState<readonly LiveReadingItem[]>(
    [],
  );
  const [liveSources, setLiveSources] = useState<readonly LiveSourceSummary[]>(
    [],
  );
  const [liveSearch, setLiveSearch] = useState("");
  const [liveDomain, setLiveDomain] = useState("all");
  const [liveLimit, setLiveLimit] = useState(24);
  const [liveReadingBusy, setLiveReadingBusy] = useState(true);
  const [liveReadingError, setLiveReadingError] = useState<string | null>(null);
  const [articleBusyIds, setArticleBusyIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [articleErrors, setArticleErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [savedReviewCount, setSavedReviewCount] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [generationTopic, setGenerationTopic] =
    useState("日本の山岳信仰と現代の旅");
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [readerSettings, setReaderSettings] = useState({
    size: 22,
    lineHeight: 1.95,
    focus: false,
    notes: false,
    tone: "paper" as "paper" | "sepia" | "mist" | "night",
    font: "serif" as "serif" | "sans",
    brightness: 100,
  });
  const [readerPanelOpen, setReaderPanelOpen] = useState(false);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [editingCard, setEditingCard] = useState<LearningCard | null>(null);
  const [cardEditError, setCardEditError] = useState<string | null>(null);
  const [cardQuery, setCardQuery] = useState("");
  const [cardFilter, setCardFilter] = useState<
    "all" | "active" | "suspended" | "leech"
  >("all");
  const [teacherInput, setTeacherInput] = useState("");
  const [teacherBusy, setTeacherBusy] = useState(false);
  const [teacherConnection, setTeacherConnection] = useState<
    "unknown" | "live" | "signin" | "not-connected" | "offline"
  >("unknown");
  const [teacherMode, setTeacherMode] = useState<
    "conversation" | "explain" | "correct" | "roleplay"
  >("conversation");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("dictionary");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [kanjiQuery, setKanjiQuery] = useState("学");
  const [kanjiReturnContext, setKanjiReturnContext] =
    useState<KanjiReturnContext | null>(null);
  const [dictionaryReturnContext, setDictionaryReturnContext] =
    useState<ReaderLexicalReturnContext | null>(null);
  const [strokeReplayKey, setStrokeReplayKey] = useState(0);
  const [grammarQuery, setGrammarQuery] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawingEmpty, setDrawingEmpty] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const currentStateRef = useRef<Phase2State>(state);
  const serverRevision = useRef(0);
  const syncScopeRef = useRef<string | null>(null);
  const localRevisionRef = useRef(0);
  const acknowledgedBase = useRef<Phase2State | null>(null);
  const [syncConflict, setSyncConflict] = useState<LocalPhase2Conflict | null>(
    null,
  );
  const syncConflictRef = useRef<LocalPhase2Conflict | null>(null);
  const deviceImportCandidateRef = useRef<Phase2State | null>(null);
  const pendingSave = useRef<Phase2State | null>(null);
  const pendingLocalSave = useRef<Phase2State | null>(null);
  const saveInFlight = useRef(false);
  const localSaveInFlight = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const skipNextSave = useRef(false);
  const localWriteChain = useRef<Promise<void>>(Promise.resolve());
  const readingShelfScroll = useRef(0);
  const readerOpenRef = useRef(false);

  const update = useCallback(
    (updater: (previous: Phase2State) => Phase2State) => {
      setState((previous) => {
        const next = updater(previous);
        if (next === previous) return previous;
        const revised = { ...next, revision: previous.revision + 1 };
        currentStateRef.current = revised;
        return revised;
      });
    },
    [],
  );

  const writeLocalSnapshot = useCallback(
    (snapshot: Omit<LocalPhase2Snapshot, "localRevision">): Promise<void> => {
      const write = localWriteChain.current
        .catch(() => undefined)
        .then(async () => {
          localRevisionRef.current = await saveLocalPhase2Snapshot(
            snapshot,
            localRevisionRef.current,
          );
        });
      localWriteChain.current = write;
      return write;
    },
    [],
  );

  const drainSaveQueue = useCallback(async (): Promise<void> => {
    if (saveInFlight.current || syncConflictRef.current !== null) return;
    saveInFlight.current = true;
    try {
      while (pendingSave.current !== null && syncConflictRef.current === null) {
        const snapshot = pendingSave.current;
        pendingSave.current = null;
        setSyncStatus("saving");
        let response: Response;
        try {
          response = await fetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state: cloudManifest(snapshot),
              baseRevision: serverRevision.current,
              expectedSyncScope: syncScopeRef.current,
            }),
            signal: AbortSignal.timeout(20_000),
          });
        } catch {
          pendingSave.current ??= snapshot;
          setSyncStatus("local");
          return;
        }
        let payload: {
          localOnly?: boolean;
          revision?: number;
          code?: string;
          state?: unknown;
          syncScope?: string;
          missing?: readonly {
            readonly sourceId: string;
            readonly fingerprint: string;
          }[];
        };
        try {
          payload = (await response.json()) as typeof payload;
        } catch {
          pendingSave.current ??= snapshot;
          setSyncStatus("local");
          return;
        }
        if (payload.code === "SYNC_SCOPE_CHANGED") {
          const conflict: LocalPhase2Conflict = {
            remote: currentStateRef.current,
            remoteRevision: 0,
            paths: ["account.syncScope:RELOAD"],
            detectedAt: iso(),
          };
          syncConflictRef.current = conflict;
          setSyncConflict(conflict);
          setSyncStatus("conflict");
          return;
        }
        if (
          response.status === 409 &&
          payload.code === "MISSING_SOURCE_BODIES" &&
          Array.isArray(payload.missing)
        ) {
          let uploaded = true;
          for (const missing of payload.missing) {
            const source = snapshot.sources.find(
              (item) =>
                item.id === missing.sourceId &&
                item.text !== "" &&
                textFingerprint(item.text) === missing.fingerprint,
            );
            if (source === undefined) {
              uploaded = false;
              break;
            }
            try {
              const bodyResponse = await fetch("/api/source-body", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sourceId: source.id,
                  fingerprint: missing.fingerprint,
                  text: source.text,
                  expectedSyncScope: syncScopeRef.current,
                }),
                signal: AbortSignal.timeout(20_000),
              });
              if (!bodyResponse.ok) {
                uploaded = false;
                break;
              }
            } catch {
              uploaded = false;
              break;
            }
          }
          if (!uploaded) {
            pendingSave.current ??= snapshot;
            setSyncStatus("local");
            return;
          }
          pendingSave.current = snapshot;
          continue;
        }
        if (response.status === 409 && payload.state !== undefined) {
          const remote = migrateToPhase2(payload.state);
          const remoteRevision = payload.revision ?? serverRevision.current;
          const merged = threeWayMergePhase2States(
            acknowledgedBase.current ?? createInitialPhase2State(),
            currentStateRef.current,
            remote,
          );
          serverRevision.current = remoteRevision;
          if (merged.conflicts.length > 0) {
            const conflict: LocalPhase2Conflict = {
              remote,
              remoteRevision,
              paths: merged.conflicts,
              detectedAt: iso(),
            };
            syncConflictRef.current = conflict;
            setSyncConflict(conflict);
            currentStateRef.current = merged.state;
            setState(merged.state);
            setSyncStatus("conflict");
            try {
              await writeLocalSnapshot({
                current: merged.state,
                base: acknowledgedBase.current,
                syncScope: syncScopeRef.current,
                dirty: true,
                acknowledgedServerRevision: serverRevision.current,
                savedAt: iso(),
                conflict,
              });
            } catch {
              setSyncStatus("not-saved");
            }
            return;
          }
          acknowledgedBase.current = remote;
          currentStateRef.current = merged.state;
          setState(merged.state);
          pendingSave.current = merged.state;
          try {
            await writeLocalSnapshot({
              current: merged.state,
              base: remote,
              syncScope: syncScopeRef.current,
              dirty: true,
              acknowledgedServerRevision: remoteRevision,
              savedAt: iso(),
              conflict: null,
            });
          } catch {
            setSyncStatus("not-saved");
            return;
          }
          continue;
        }
        if (!response.ok) {
          pendingSave.current ??= snapshot;
          setSyncStatus("local");
          return;
        }
        const latest = currentStateRef.current;
        const stillDirty =
          pendingSave.current !== null || latest.revision !== snapshot.revision;
        if (payload.localOnly) {
          try {
            await writeLocalSnapshot({
              current: latest,
              base: acknowledgedBase.current,
              syncScope: syncScopeRef.current,
              dirty: true,
              acknowledgedServerRevision: 0,
              savedAt: iso(),
              conflict: null,
            });
          } catch {
            setSyncStatus("not-saved");
            return;
          }
          setSyncStatus("local");
        } else {
          serverRevision.current = payload.revision ?? serverRevision.current;
          acknowledgedBase.current = snapshot;
          try {
            await writeLocalSnapshot({
              current: latest,
              base: snapshot,
              syncScope: syncScopeRef.current,
              dirty: stillDirty,
              acknowledgedServerRevision: serverRevision.current,
              savedAt: iso(),
              conflict: null,
            });
          } catch {
            setSyncStatus("not-saved");
            return;
          }
          setSyncStatus(stillDirty ? "saving" : "saved");
        }
      }
    } finally {
      saveInFlight.current = false;
    }
  }, [writeLocalSnapshot]);

  const drainLocalSaveQueue = useCallback(async (): Promise<void> => {
    if (localSaveInFlight.current) return;
    localSaveInFlight.current = true;
    try {
      while (pendingLocalSave.current !== null) {
        const snapshot = pendingLocalSave.current;
        pendingLocalSave.current = null;
        try {
          await writeLocalSnapshot({
            current: snapshot,
            base: acknowledgedBase.current,
            syncScope: syncScopeRef.current,
            dirty: true,
            acknowledgedServerRevision: serverRevision.current,
            savedAt: iso(),
            conflict: syncConflictRef.current,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "LOCAL_REVISION_CONFLICT"
          ) {
            const latest = await loadLocalPhase2Snapshot(
              syncScopeRef.current,
            ).catch(() => null);
            if (latest !== null) {
              localRevisionRef.current = latest.localRevision;
              serverRevision.current = latest.acknowledgedServerRevision;
              const merged = threeWayMergePhase2States(
                acknowledgedBase.current ?? createInitialPhase2State(),
                snapshot,
                latest.current,
              );
              if (merged.conflicts.length === 0) {
                acknowledgedBase.current =
                  latest.base ?? acknowledgedBase.current;
                currentStateRef.current = merged.state;
                setState(merged.state);
                pendingLocalSave.current = merged.state;
                continue;
              }
              let durableState = merged.state;
              let durableBase = latest.base ?? acknowledgedBase.current;
              let durableConflict: LocalPhase2Conflict = {
                remote: latest.current,
                remoteRevision: latest.acknowledgedServerRevision,
                paths: merged.conflicts,
                detectedAt: iso(),
              };
              let persisted = false;
              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  await writeLocalSnapshot({
                    current: durableState,
                    base: durableBase,
                    syncScope: syncScopeRef.current,
                    dirty: true,
                    acknowledgedServerRevision: durableConflict.remoteRevision,
                    savedAt: iso(),
                    conflict: durableConflict,
                  });
                  persisted = true;
                  break;
                } catch (retryError) {
                  if (
                    !(retryError instanceof Error) ||
                    retryError.message !== "LOCAL_REVISION_CONFLICT"
                  )
                    break;
                  const newest = await loadLocalPhase2Snapshot(
                    syncScopeRef.current,
                  ).catch(() => null);
                  if (newest === null) break;
                  localRevisionRef.current = newest.localRevision;
                  const retried = threeWayMergePhase2States(
                    durableBase ?? createInitialPhase2State(),
                    durableState,
                    newest.current,
                  );
                  durableState = retried.state;
                  durableBase = newest.base ?? durableBase;
                  durableConflict = {
                    remote: newest.current,
                    remoteRevision: newest.acknowledgedServerRevision,
                    paths:
                      retried.conflicts.length > 0
                        ? retried.conflicts
                        : ["local.concurrent-write"],
                    detectedAt: iso(),
                  };
                }
              }
              currentStateRef.current = durableState;
              syncConflictRef.current = durableConflict;
              setState(durableState);
              setSyncConflict(durableConflict);
              if (!persisted) {
                setSyncStatus("not-saved");
                return;
              }
              setSyncStatus("conflict");
              return;
            }
          }
          pendingLocalSave.current ??= snapshot;
          setSyncStatus("not-saved");
          return;
        }
        if (syncConflictRef.current === null) {
          pendingSave.current = compactPhase2State(snapshot);
          void drainSaveQueue();
        } else {
          setSyncStatus("conflict");
        }
      }
    } finally {
      localSaveInFlight.current = false;
    }
  }, [drainSaveQueue, writeLocalSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const legacyState = (() => {
      for (const key of [
        "bunki-phase2-state-v1",
        "bunki-alpha-state-v2",
        "bunki-alpha-state-v1",
      ]) {
        const raw = window.localStorage.getItem(key);
        if (raw === null) continue;
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            "state" in parsed
          )
            return {
              current: migrateToPhase2((parsed as { state: unknown }).state),
            };
          return { current: migrateToPhase2(parsed) };
        } catch {
          // Try the next historical key.
        }
      }
      return null;
    })();
    void (async () => {
      type CloudPayload = {
        state?: unknown | null;
        manifest?: unknown | null;
        revision?: number;
        localOnly?: boolean;
        hasState?: boolean;
        code?: string;
        syncScope?: string | null;
        sourceId?: string;
        fingerprint?: string;
      };
      type CloudResponse = {
        readonly ok: boolean;
        readonly status: number;
        readonly payload: CloudPayload;
      };
      const fetchState = async (
        url: string,
        timeout: number,
      ): Promise<CloudResponse | null> => {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(timeout),
          });
          let payload: CloudPayload = {};
          try {
            payload = (await response.json()) as CloudPayload;
          } catch {
            payload = { code: "INVALID_SERVER_RESPONSE" };
          }
          return { ok: response.ok, status: response.status, payload };
        } catch {
          return null;
        }
      };
      const scopeResponse = await fetchState("/api/state?scopeOnly=1", 5_000);
      if (cancelled) return;
      const cloudSyncScope =
        typeof scopeResponse?.payload.syncScope === "string"
          ? scopeResponse.payload.syncScope
          : null;
      let localLoadFailed = false;
      let local = await loadLocalPhase2Snapshot(cloudSyncScope).catch(() => {
        localLoadFailed = true;
        return null;
      });
      if (local === null && cloudSyncScope === null && legacyState !== null) {
        local = {
          current: legacyState.current,
          base: createInitialPhase2State(),
          syncScope: null,
          localRevision: 0,
          dirty: true,
          acknowledgedServerRevision: 0,
          savedAt: iso(),
          conflict: null,
        };
      }
      if (!cancelled && local !== null) {
        serverRevision.current = local.acknowledgedServerRevision;
        syncScopeRef.current = cloudSyncScope;
        localRevisionRef.current = local.localRevision;
        acknowledgedBase.current = local.base ?? createInitialPhase2State();
        currentStateRef.current = local.current;
        syncConflictRef.current = local.conflict;
        skipNextSave.current = true;
        setState(local.current);
        setSyncConflict(local.conflict);
        setSyncStatus(local.conflict === null ? "loading" : "conflict");
      }
      const needsCloudState =
        scopeResponse !== null &&
        scopeResponse.ok &&
        scopeResponse.payload.localOnly !== true &&
        scopeResponse.payload.hasState === true;
      let detailedResponse = needsCloudState
        ? await fetchState("/api/state", 12_000)
        : scopeResponse;
      let bodyRecoveryAttempts = 0;
      while (
        detailedResponse?.payload.code === "MISSING_SOURCE_BODY" &&
        local !== null &&
        bodyRecoveryAttempts < Math.max(1, local.current.sources.length)
      ) {
        const sourceId = detailedResponse.payload.sourceId ?? "";
        const fingerprint = detailedResponse.payload.fingerprint ?? "";
        if (sourceId === "" || fingerprint === "") break;
        const body = await loadLocalSourceBody(
          cloudSyncScope,
          sourceId,
          fingerprint,
        ).catch(() => null);
        if (
          body === null ||
          body === "" ||
          textFingerprint(body) !== fingerprint
        )
          break;
        try {
          const bodyResponse = await fetch("/api/source-body", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceId,
              fingerprint,
              text: body,
              expectedSyncScope: cloudSyncScope,
            }),
            signal: AbortSignal.timeout(20_000),
          });
          if (!bodyResponse.ok) break;
        } catch {
          break;
        }
        bodyRecoveryAttempts += 1;
        detailedResponse = await fetchState("/api/state", 12_000);
      }
      const cloudDetailsUnavailable =
        needsCloudState &&
        (detailedResponse === null ||
          (!detailedResponse.ok &&
            detailedResponse.payload.code !== "MISSING_SOURCE_BODY"));
      const cloudResponse = detailedResponse ?? scopeResponse;
      const detailedSyncScope =
        typeof detailedResponse?.payload.syncScope === "string"
          ? detailedResponse.payload.syncScope
          : cloudSyncScope;
      const scopeChangedDuringLoad = detailedSyncScope !== cloudSyncScope;
      if (cancelled) return;
      let deviceImportCandidate: Phase2State | null = null;
      if (cloudSyncScope !== null && local === null) {
        const anonymous = await loadLocalPhase2Snapshot(null).catch(() => null);
        const candidate = anonymous?.current ?? legacyState?.current ?? null;
        if (
          candidate !== null &&
          (anonymous?.dirty === true ||
            candidate.revision > 0 ||
            candidate.profile.onboardingComplete ||
            candidate.sources.length > 0 ||
            candidate.cards.length > 0)
        )
          deviceImportCandidate = candidate;
      }
      const cloud =
        cloudResponse?.ok && cloudResponse.payload.state
          ? migrateToPhase2(cloudResponse.payload.state)
          : null;
      const cloudRevision = cloudResponse?.payload.revision ?? 0;
      const cloudLocalOnly = cloudResponse?.payload.localOnly ?? false;
      let resolved = local?.current ?? cloud ?? createInitialPhase2State();
      let base = local?.base ?? cloud ?? createInitialPhase2State();
      let dirty = local?.dirty ?? false;
      let conflict = local?.conflict ?? null;
      let acknowledgedRevision =
        local?.acknowledgedServerRevision ?? cloudRevision;
      const resolvedSyncScope = cloudSyncScope;

      if (cloudDetailsUnavailable || scopeChangedDuringLoad) {
        conflict = {
          remote: resolved,
          remoteRevision: cloudRevision,
          paths: ["cloud.unavailable:RELOAD"],
          detectedAt: iso(),
        };
        dirty = local?.dirty ?? false;
      } else if (deviceImportCandidate !== null) {
        deviceImportCandidateRef.current = deviceImportCandidate;
        resolved = cloud ?? createInitialPhase2State();
        base = resolved;
        dirty = false;
        conflict = {
          remote: resolved,
          remoteRevision: cloudRevision,
          paths: ["scope.importDevice"],
          detectedAt: iso(),
        };
        acknowledgedRevision = cloudRevision;
      } else if (cloudResponse?.payload.code === "MISSING_SOURCE_BODY") {
        resolved = local?.current ?? createInitialPhase2State();
        base = local?.base ?? resolved;
        dirty = local?.dirty ?? false;
        conflict = {
          remote: resolved,
          remoteRevision: cloudRevision,
          paths: ["cloud.MISSING_SOURCE_BODY:NO_LOCAL"],
          detectedAt: iso(),
        };
        acknowledgedRevision = cloudRevision;
      } else if (cloud !== null && local !== null) {
        if (!local.dirty) {
          resolved = cloud;
          base = cloud;
          dirty = false;
          conflict = null;
          acknowledgedRevision = cloudRevision;
        } else if (
          local.acknowledgedServerRevision === cloudRevision &&
          local.conflict === null
        ) {
          resolved = local.current;
          base = local.base ?? cloud;
          dirty = true;
        } else if (local.conflict === null) {
          const merged = threeWayMergePhase2States(
            local.base ?? createInitialPhase2State(),
            local.current,
            cloud,
          );
          resolved = merged.state;
          base = cloud;
          acknowledgedRevision = cloudRevision;
          dirty = true;
          if (merged.conflicts.length > 0) {
            conflict = {
              remote: cloud,
              remoteRevision: cloudRevision,
              paths: merged.conflicts,
              detectedAt: iso(),
            };
          }
        }
      } else if (cloud !== null) {
        resolved = cloud;
        base = cloud;
        dirty = false;
        acknowledgedRevision = cloudRevision;
      } else if (local !== null) {
        resolved = local.current;
        base = local.base ?? createInitialPhase2State();
        dirty = cloudSyncScope !== null && !cloudLocalOnly ? true : local.dirty;
        acknowledgedRevision = local.acknowledgedServerRevision;
      }

      if (cancelled) return;
      serverRevision.current = acknowledgedRevision;
      syncScopeRef.current = resolvedSyncScope;
      localRevisionRef.current = local?.localRevision ?? 0;
      acknowledgedBase.current = base;
      syncConflictRef.current = conflict;
      setSyncConflict(conflict);
      currentStateRef.current = resolved;
      skipNextSave.current = !dirty;
      setState(resolved);
      setSyncStatus(
        conflict !== null
          ? "conflict"
          : localLoadFailed
            ? "not-saved"
            : cloudLocalOnly || cloudResponse === null || !cloudResponse.ok
              ? "local"
              : dirty
                ? "saving"
                : "saved",
      );
      setHydrated(true);
      if (dirty && conflict === null) {
        pendingLocalSave.current = resolved;
        void drainLocalSaveQueue();
      }
      if (!dirty && !localLoadFailed && conflict === null) {
        try {
          await writeLocalSnapshot({
            current: resolved,
            base,
            syncScope: resolvedSyncScope,
            dirty: false,
            acknowledgedServerRevision: acknowledgedRevision,
            savedAt: iso(),
            conflict,
          });
        } catch {
          if (!cancelled) setSyncStatus("not-saved");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drainLocalSaveQueue, writeLocalSnapshot]);

  useEffect(() => {
    if (!hydrated) return;
    update((previous) => {
      const removedIds = new Set(
        previous.sources
          .filter(
            (source) =>
              source.text.trim() === "" &&
              source.notes.startsWith("Suggested for ") &&
              LEGACY_EMPTY_SUGGESTION_URLS.has(source.url),
          )
          .map((source) => source.id),
      );
      if (removedIds.size === 0) return previous;
      return {
        ...previous,
        sources: previous.sources.filter(
          (source) => !removedIds.has(source.id),
        ),
        activeSourceId:
          previous.activeSourceId !== null &&
          removedIds.has(previous.activeSourceId)
            ? null
            : previous.activeSourceId,
      };
    });
  }, [hydrated, update]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      pendingLocalSave.current = state;
      void drainLocalSaveQueue();
    }, 700);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [drainLocalSaveQueue, hydrated, state]);

  useEffect(() => {
    const retry = (): void => {
      void drainLocalSaveQueue();
      void drainSaveQueue();
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [drainLocalSaveQueue, drainSaveQueue]);

  const resolveConflictWithCloud = (): void => {
    const conflict = syncConflictRef.current;
    if (conflict === null) return;
    const remote = conflict.remote;
    if (conflict.paths.includes("cloud.MISSING_SOURCE_BODY:NO_LOCAL")) return;
    pendingSave.current = null;
    pendingLocalSave.current = null;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    deviceImportCandidateRef.current = null;
    serverRevision.current = conflict.remoteRevision;
    acknowledgedBase.current = remote;
    syncConflictRef.current = null;
    setSyncConflict(null);
    currentStateRef.current = remote;
    skipNextSave.current = true;
    setState(remote);
    setSyncStatus("saved");
    void writeLocalSnapshot({
      current: remote,
      base: remote,
      syncScope: syncScopeRef.current,
      dirty: false,
      acknowledgedServerRevision: conflict.remoteRevision,
      savedAt: iso(),
      conflict: null,
    }).catch(() => setSyncStatus("not-saved"));
  };

  const resolveConflictWithDevice = (): void => {
    const conflict = syncConflictRef.current;
    if (conflict === null) return;
    if (conflict.paths.includes("cloud.MISSING_SOURCE_BODY:NO_LOCAL")) return;
    const local = deviceImportCandidateRef.current ?? currentStateRef.current;
    deviceImportCandidateRef.current = null;
    pendingSave.current = null;
    pendingLocalSave.current = null;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    serverRevision.current = conflict.remoteRevision;
    acknowledgedBase.current = conflict.remote;
    syncConflictRef.current = null;
    setSyncConflict(null);
    setSyncStatus("saving");
    currentStateRef.current = local;
    setState(local);
    pendingLocalSave.current = local;
    void drainLocalSaveQueue();
  };

  const ensureDictionary =
    useCallback(async (): Promise<DictionaryIndex | null> => {
      if (dictionary !== null) return dictionary;
      setLanguageBusy(true);
      setLanguageError(null);
      try {
        const loaded = await loadDictionary();
        setDictionary(loaded);
        return loaded;
      } catch (error) {
        setLanguageError(
          error instanceof Error
            ? error.message
            : "The dictionary could not be loaded.",
        );
        return null;
      } finally {
        setLanguageBusy(false);
      }
    }, [dictionary]);

  const ensureLanguageTools = useCallback(async (): Promise<{
    readonly dictionary: DictionaryIndex;
    readonly tokenizer: JapaneseTokenizer;
  } | null> => {
    setLanguageBusy(true);
    setLanguageError(null);
    try {
      const [nextDictionary, nextTokenizer] = await Promise.all([
        dictionary === null ? loadDictionary() : Promise.resolve(dictionary),
        tokenizer === null
          ? loadJapaneseTokenizer()
          : Promise.resolve(tokenizer),
      ]);
      setDictionary(nextDictionary);
      setTokenizer(nextTokenizer);
      return { dictionary: nextDictionary, tokenizer: nextTokenizer };
    } catch (error) {
      setLanguageError(
        error instanceof Error
          ? error.message
          : "Japanese language tools could not be loaded.",
      );
      return null;
    } finally {
      setLanguageBusy(false);
    }
  }, [dictionary, tokenizer]);

  useEffect(() => {
    if (view !== "library" && view !== "coach") return;
    const timer = window.setTimeout(() => void ensureDictionary(), 0);
    return () => window.clearTimeout(timer);
  }, [ensureDictionary, view]);

  useEffect(() => {
    if (view !== "immerse" || immerseMode !== "discover") return;
    let cancelled = false;
    void fetch("/api/reading-feed", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Live reading shelves are unavailable.");
        const payload = (await response.json()) as {
          items?: readonly LiveReadingItem[];
          sources?: readonly LiveSourceSummary[];
        };
        if (!cancelled) {
          setLiveReadings(payload.items ?? []);
          setLiveSources(payload.sources ?? []);
        }
      })
      .catch(() => {
        if (!cancelled)
          setLiveReadingError(
            "Live shelves could not refresh. Built-in and saved readings still work.",
          );
      })
      .finally(() => {
        if (!cancelled) setLiveReadingBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [immerseMode, view]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLibraryTab("dictionary");
        setView("library");
        setMobileMenu(false);
      }
      if (event.key === "Escape" && mobileMenu) setMobileMenu(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileMenu]);

  const overlayKey =
    editingCard !== null
      ? `editing:${editingCard.id}`
      : readerToken !== null && readerWordDepth >= 3
        ? "reader-token"
        : state.stagedPacket !== null
          ? `packet:${state.stagedPacket.id}`
          : captureOpen
            ? "capture"
            : !state.profile.onboardingComplete || onboardingStep > 0
              ? `onboarding:${String(onboardingStep || 1)}:${state.profile.onboardingComplete ? "closable" : "locked"}`
              : null;
  const overlayOpen = overlayKey !== null;

  useEffect(() => {
    if (!overlayOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = (): HTMLElement | null => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      return dialogs.item(dialogs.length - 1);
    };
    const focusable = (container: HTMLElement): HTMLElement[] =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
    const frame = window.requestAnimationFrame(() => {
      const container = dialog();
      focusable(container ?? document.body)[0]?.focus();
    });
    const handler = (event: KeyboardEvent): void => {
      const container = dialog();
      if (event.key === "Tab" && container !== null) {
        const targets = focusable(container);
        if (targets.length === 0) {
          event.preventDefault();
          return;
        }
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key !== "Escape") return;
      if (overlayKey?.startsWith("editing:")) setEditingCard(null);
      else if (overlayKey === "reader-token") {
        setReaderToken(null);
        setReaderWordDepth(0);
      } else if (overlayKey?.startsWith("packet:"))
        update((previous) => ({ ...previous, stagedPacket: null }));
      else if (overlayKey === "capture") setCaptureOpen(false);
      else if (overlayKey?.endsWith(":closable")) setOnboardingStep(0);
    };
    document.addEventListener("keydown", handler);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handler);
      previousFocus?.focus();
    };
  }, [overlayKey, overlayOpen, readerWordDepth, update]);

  const activeSource =
    state.sources.find((source) => source.id === state.activeSourceId) ??
    state.sources.find((source) => source.status !== "archived") ??
    null;
  const activeSourceId = activeSource?.id ?? null;
  const activeSourceText = activeSource?.text ?? "";
  useEffect(() => {
    if (
      view !== "immerse" ||
      activeSourceId === null ||
      activeSourceText.trim() === ""
    )
      return;
    const timer = window.setTimeout(() => void ensureLanguageTools(), 0);
    return () => window.clearTimeout(timer);
  }, [activeSourceId, activeSourceText, ensureLanguageTools, view]);
  const sentences = useMemo(
    () => sentenceSpans(activeSourceText),
    [activeSourceText],
  );
  const readerAnchor = Math.max(
    0,
    readerSentence ?? activeSource?.readingSentence ?? 0,
  );
  const readerWindowStart =
    Math.floor(readerAnchor / READER_WINDOW_SIZE) * READER_WINDOW_SIZE;
  const visibleSentences = useMemo(
    () =>
      sentences.slice(
        readerWindowStart,
        readerWindowStart + READER_WINDOW_SIZE,
      ),
    [readerWindowStart, sentences],
  );
  const readerChunkStart = visibleSentences[0]?.start ?? 0;
  const readerChunkEnd =
    visibleSentences[visibleSentences.length - 1]?.end ?? readerChunkStart;
  const readerTokens = useMemo(
    () =>
      activeSourceId === null ||
      dictionary === null ||
      tokenizer === null ||
      activeSourceText.trim() === "" ||
      readerChunkEnd <= readerChunkStart
        ? []
        : tokenizeJapanese(
            activeSourceText.slice(readerChunkStart, readerChunkEnd),
            dictionary,
            tokenizer,
          ).map((token) => ({
            ...token,
            position: token.position + readerChunkStart,
          })),
    [
      activeSourceId,
      activeSourceText,
      dictionary,
      readerChunkEnd,
      readerChunkStart,
      tokenizer,
    ],
  );
  const tokensBySentence = useMemo(() => {
    const result = new Map<number, ReaderToken[]>();
    let sentenceCursor = 0;
    for (const token of readerTokens) {
      while (
        sentenceCursor < visibleSentences.length &&
        token.position >= visibleSentences[sentenceCursor].end
      )
        sentenceCursor += 1;
      const sentence = visibleSentences[sentenceCursor];
      if (sentence && token.position < sentence.start) continue;
      if (!sentence) continue;
      const bucket = result.get(sentence.index) ?? [];
      bucket.push(token);
      result.set(sentence.index, bucket);
    }
    return result;
  }, [readerTokens, visibleSentences]);
  const timestampsBySentence = useMemo(() => {
    const result = new Map<number, number>();
    const segments = activeSource?.segments ?? [];
    let segmentCursor = 0;
    for (const sentence of sentences) {
      while (
        segmentCursor < segments.length &&
        segments[segmentCursor].endCharacter <= sentence.start
      )
        segmentCursor += 1;
      const segment = segments[segmentCursor];
      if (
        segment &&
        segment.startCharacter < sentence.end &&
        segment.endCharacter > sentence.start
      )
        result.set(sentence.index, segment.startSeconds);
    }
    return result;
  }, [activeSource?.segments, sentences]);
  const due = useMemo(() => dueCards(state), [state]);
  const managedCards = useMemo(() => {
    const needle = cardQuery.trim().toLocaleLowerCase("en");
    return [...state.cards]
      .filter(
        (card) =>
          (cardFilter === "all" ||
            (cardFilter === "active" && !card.suspended) ||
            (cardFilter === "suspended" && card.suspended) ||
            (cardFilter === "leech" && card.leech)) &&
          (needle === "" ||
            [card.front, card.back, card.conceptId, card.tags.join(" ")]
              .join("\n")
              .toLocaleLowerCase("en")
              .includes(needle)),
      )
      .sort(
        (left, right) =>
          Number(right.leech) - Number(left.leech) ||
          Number(left.suspended) - Number(right.suspended) ||
          left.dueAt.localeCompare(right.dueAt),
      );
  }, [cardFilter, cardQuery, state.cards]);
  const summary = useMemo(() => learningSummary(state), [state]);
  const nextAction = useMemo(() => bestNextAction(state), [state]);
  const frontier = useMemo(() => rankFrontier(state), [state]);
  const immersionSuggestions = useMemo(
    () =>
      suggestedReadingsForLevel(
        state.profile.currentLevel,
        state.profile.interests,
        3,
      ),
    [state.profile.currentLevel, state.profile.interests],
  );
  const catalogReadings = useMemo(
    () =>
      READING_CATALOG.filter(
        (item) =>
          item.level === readingLevel &&
          (readingFilter === "all" ||
            (readingFilter === "graded" && item.lane === "graded") ||
            (readingFilter === "real" && item.real) ||
            (readingFilter === "historical" &&
              (item.lane === "historical" ||
                item.lane === "primary" ||
                item.lane === "literature"))),
      ),
    [readingFilter, readingLevel],
  );
  const filteredLiveReadings = useMemo(() => {
    const needle = liveSearch.trim().toLocaleLowerCase("ja");
    return liveReadings.filter(
      (item) =>
        (readingLevel === "N1+" ||
          item.level === readingLevel ||
          (readingLevel === "N1" && item.level === "N2")) &&
        (liveDomain === "all" || item.domain === liveDomain) &&
        (needle === "" ||
          `${item.title}\n${item.summary}\n${item.sourceName}`
            .toLocaleLowerCase("ja")
            .includes(needle)),
    );
  }, [liveDomain, liveReadings, liveSearch, readingLevel]);
  const feedTextReadyCount = useMemo(
    () =>
      liveReadings.filter((item) => item.readerStatus === "publisher-feed-text")
        .length,
    [liveReadings],
  );
  const availableLiveSources = useMemo(
    () => liveSources.filter((source) => source.available),
    [liveSources],
  );
  const availableLiveDomains = useMemo(
    () =>
      [
        ...new Map(
          availableLiveSources.map((source) => [
            source.domain,
            {
              domain: source.domain,
              name: source.name.split(" · ")[0],
              articleCount: availableLiveSources
                .filter((candidate) => candidate.domain === source.domain)
                .reduce(
                  (total, candidate) => total + candidate.articleCount,
                  0,
                ),
            },
          ]),
        ).values(),
      ].sort((left, right) => left.name.localeCompare(right.name, "ja")),
    [availableLiveSources],
  );
  const reviewProgress = sessionProgress(state.reviewSession);
  const hasActiveReviewSession =
    state.reviewSession !== null &&
    state.reviewSession.completedAt === null &&
    state.reviewSession.completedCardIds.length <
      state.reviewSession.initialCount;
  const todayReviewCount = hasActiveReviewSession
    ? Math.max(0, reviewProgress.total - reviewProgress.completed)
    : reviewSessionLimit(state.profile, due.length);
  const todayReviewMinutes = Math.max(0, Math.ceil(todayReviewCount * 0.42));
  const reviewCard = state.reviewSession
    ? state.reviewSession.queue
        .filter((id) => !state.reviewSession?.completedCardIds.includes(id))
        .map((id) => state.cards.find((card) => card.id === id))
        .find((card): card is LearningCard => card !== undefined)
    : null;
  const intervalPreviews = useMemo(
    () => (reviewCard === null ? null : ratingPreviews(reviewCard)),
    [reviewCard],
  );
  useEffect(() => {
    if (view !== "coach") return;
    const frame = window.requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? "auto"
        : "smooth";
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.messages.length, teacherBusy, view]);
  const dictionaryResults = useMemo(
    () =>
      dictionary === null || libraryQuery.trim() === ""
        ? []
        : searchDictionaryDetailed(dictionary, libraryQuery, 60),
    [dictionary, libraryQuery],
  );
  const effectiveSelectedWordId =
    libraryQuery.trim() === ""
      ? null
      : dictionaryResults.some((result) => result.entry.id === selectedWordId)
        ? selectedWordId
        : (dictionaryResults[0]?.entry.id ?? null);
  const selectedWord =
    dictionary === null || effectiveSelectedWordId === null
      ? null
      : (dictionary.byId.get(effectiveSelectedWordId) ?? null);
  const selectedKanji =
    dictionary?.kanjiByChar.get(kanjiQuery.trim().slice(0, 1)) ?? null;
  const grammarResults = useMemo(
    () =>
      grammarQuery.trim() === ""
        ? GRAMMAR_PATTERNS
        : searchGrammar(grammarQuery, 80),
    [grammarQuery],
  );

  useEffect(() => {
    if (view !== "review") return;
    const handler = (event: KeyboardEvent): void => {
      if (editingCard !== null || overlayOpen) return;
      if (event.key === " " && reviewCard !== null) {
        event.preventDefault();
        setReviewRevealed(true);
      }
      if (reviewRevealed && ["1", "2", "3", "4"].includes(event.key))
        void rateReview(Number(event.key) as 1 | 2 | 3 | 4);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z")
        undoReview();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const finishOnboarding = (): void => {
    update((previous) => {
      const beginner =
        previous.profile.currentLevel === "zero" ||
        previous.profile.currentLevel === "N5";
      const alreadyHasStarter = previous.sources.some(
        (source) => source.id === "bunki-starter-zero",
      );
      const starter: SourceItem = {
        id: "bunki-starter-zero",
        kind: "article",
        status: "ready",
        title: "First useful Japanese · はじめの一歩",
        url: "",
        text: STARTER_TEXT,
        addedAt: iso(),
        updatedAt: iso(),
        progress: 0,
        readingSentence: 0,
        provenance: "generated-sample",
        capturedConceptIds: [],
        notes: "A clearly labelled Bunki starter lesson.",
        segments: [],
        analysis: null,
      };
      return {
        ...previous,
        profile: {
          ...previous.profile,
          onboardingComplete: true,
          placementComplete: true,
          furigana: beginner
            ? "always"
            : previous.profile.currentLevel === "N4" ||
                previous.profile.currentLevel === "N3"
              ? "learning"
              : "off",
        },
        sources:
          beginner && !alreadyHasStarter
            ? [starter, ...previous.sources]
            : previous.sources,
        activeSourceId:
          beginner && !alreadyHasStarter
            ? starter.id
            : (previous.activeSourceId ?? previous.sources[0]?.id ?? null),
        activity: [
          createActivity(
            "placement",
            `Provisional starting edge: ${previous.profile.currentLevel}`,
          ),
          ...previous.activity,
        ].slice(0, 500),
      };
    });
    setOnboardingStep(0);
  };

  const toggleInterest = (interest: string): void => {
    update((previous) => {
      const current = new Set(previous.profile.interests);
      if (current.has(interest)) current.delete(interest);
      else current.add(interest);
      return {
        ...previous,
        profile: { ...previous.profile, interests: [...current] },
      };
    });
  };

  const chooseLevel = (level: Level): void => {
    if (level !== "zero") setReadingLevel(level);
    update((previous) => ({
      ...previous,
      profile: { ...previous.profile, currentLevel: level },
    }));
  };

  const choosePlacement = (level: Level): void => {
    if (level !== "zero") setReadingLevel(level);
    update((previous) => ({
      ...previous,
      profile: {
        ...previous.profile,
        currentLevel: level,
        placementAnswers: [
          {
            itemId: "comfortable-reading-edge",
            level,
            correct: true,
          },
        ],
      },
    }));
  };

  const performNextAction = (): void => {
    if (nextAction.kind === "onboard") {
      setOnboardingStep(1);
      return;
    }
    if (nextAction.kind === "review") {
      startSession();
      setView("review");
      return;
    }
    if (nextAction.kind === "capture") {
      setCaptureOpen(true);
      return;
    }
    if (nextAction.sourceId) {
      rememberReaderOrigin();
      update((previous) => ({
        ...previous,
        activeSourceId: nextAction.sourceId,
      }));
      setView("immerse");
      setImmerseMode("reader");
      setZenMode(true);
      if (nextAction.kind === "analyze-source")
        window.setTimeout(
          () => void analyzeActiveSource(nextAction.sourceId),
          0,
        );
      return;
    }
    if (nextAction.kind === "lesson") {
      const starter = state.sources.find(
        (source) => source.id === "bunki-starter-zero",
      );
      rememberReaderOrigin();
      if (starter)
        update((previous) => ({ ...previous, activeSourceId: starter.id }));
      setView("immerse");
      setImmerseMode("reader");
      setZenMode(true);
      return;
    }
    setView("coach");
  };

  const startSession = (): void => {
    if (hasActiveReviewSession) {
      setReviewRevealed(false);
      setZenMode(true);
      return;
    }
    if (due.length === 0) return;
    update((previous) => ({
      ...previous,
      reviewSession: startReviewSession(
        previous,
        due.map((card) => card.id),
        reviewSessionLimit(previous.profile, due.length),
      ),
    }));
    setReviewRevealed(false);
    setZenMode(true);
  };

  const analyzeActiveSource = async (
    sourceId = activeSource?.id ?? null,
  ): Promise<void> => {
    if (sourceId === null) return;
    const source = currentStateRef.current.sources.find(
      (item) => item.id === sourceId,
    );
    if (!source || !sourceReadiness(source).ready) return;
    const sourceFingerprint = textFingerprint(source.text);
    const tools = await ensureLanguageTools();
    if (!tools) return;
    const latest = currentStateRef.current.sources.find(
      (item) => item.id === sourceId,
    );
    if (!latest || textFingerprint(latest.text) !== sourceFingerprint) return;
    const spans = sentenceSpans(latest.text);
    const tokens: ReaderToken[] = [];
    let cursor = 0;
    while (cursor < spans.length) {
      const start = spans[cursor].start;
      let endCursor = cursor;
      while (
        endCursor + 1 < spans.length &&
        spans[endCursor + 1].end - start <= 20_000
      )
        endCursor += 1;
      const end = spans[endCursor].end;
      tokens.push(
        ...tokenizeJapanese(
          latest.text.slice(start, end),
          tools.dictionary,
          tools.tokenizer,
        ).map((token) => ({ ...token, position: token.position + start })),
      );
      cursor = endCursor + 1;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const stillCurrent = currentStateRef.current.sources.find(
        (item) => item.id === sourceId,
      );
      if (
        !stillCurrent ||
        textFingerprint(stillCurrent.text) !== sourceFingerprint
      )
        return;
    }
    const analysisState = currentStateRef.current;
    const analysisSource = analysisState.sources.find(
      (item) => item.id === sourceId,
    );
    if (
      !analysisSource ||
      textFingerprint(analysisSource.text) !== sourceFingerprint
    )
      return;
    const analysis = analyzeSource(analysisSource, tokens, analysisState);
    update((previous) => {
      const current = previous.sources.find((item) => item.id === sourceId);
      if (!current || textFingerprint(current.text) !== sourceFingerprint)
        return previous;
      const analyzedSource = {
        ...current,
        status: "reading" as const,
        analysis,
        updatedAt: iso(),
      };
      const packet = stageSourcePacket(analyzedSource, analysis, previous);
      return {
        ...previous,
        sources: previous.sources.map((item) =>
          item.id === sourceId ? analyzedSource : item,
        ),
        stagedPacket: packet,
        activity: [
          createActivity(
            "source-analyzed",
            `Found ${String(packet.proposals.length)} useful learning items in “${current.title}”`,
            packet.proposals.map((proposal) => proposal.conceptId),
            sourceId,
          ),
          ...previous.activity,
        ].slice(0, 500),
      };
    });
  };

  const saveCapture = (event: FormEvent): void => {
    event.preventDefault();
    setCaptureError(null);
    const url = captureUrl.trim();
    const text = cleanTranscript(captureText);
    if (text.length > MAX_SOURCE_CHARACTERS) {
      setCaptureError(
        `Sources are limited to ${MAX_SOURCE_CHARACTERS.toLocaleString()} characters. Split this material into separate source threads.`,
      );
      return;
    }
    if (url === "" && text === "" && captureTitle.trim() === "") {
      setCaptureError("Paste a URL, a title, or some Japanese text.");
      return;
    }
    const kind = /(?:youtube\.com|youtu\.be)/i.test(url)
      ? "youtube"
      : captureKind;
    const source: SourceItem = {
      id: uid("source"),
      kind,
      status: text === "" ? "inbox" : "ready",
      title:
        captureTitle.trim() ||
        (kind === "youtube" ? "YouTube saved while walking" : "Saved source"),
      url,
      text,
      addedAt: iso(),
      updatedAt: iso(),
      progress: 0,
      readingSentence: 0,
      provenance: "user-supplied",
      capturedConceptIds: [],
      notes: "",
      segments: captureSegments,
      analysis: null,
    };
    update((previous) => ({
      ...previous,
      sources: [source, ...previous.sources],
      activeSourceId: source.id,
      activity: [
        createActivity(
          "source-added",
          text === ""
            ? `Saved “${source.title}” to the walking inbox`
            : `Added “${source.title}” for analysis`,
          [],
          source.id,
        ),
        ...previous.activity,
      ].slice(0, 500),
    }));
    setCaptureOpen(false);
    setCaptureTitle("");
    setCaptureUrl("");
    setCaptureText("");
    setCaptureSegments([]);
    setCaptureAdvanced(false);
    if (text !== "") {
      rememberReaderOrigin();
      setView("immerse");
      setImmerseMode("reader");
      setZenMode(true);
    }
  };

  const rememberReaderOrigin = (): void => {
    readingShelfScroll.current =
      view === "immerse" && immerseMode === "discover" ? window.scrollY : 0;
    readerOpenRef.current = true;
    if (window.history.state?.bunkiSurface !== "reader")
      window.history.pushState(
        { ...(window.history.state ?? {}), bunkiSurface: "reader" },
        "",
        window.location.href,
      );
  };

  const enterReader = (sourceId: string): void => {
    rememberReaderOrigin();
    update((previous) => ({ ...previous, activeSourceId: sourceId }));
    setReaderToken(null);
    setReaderWordDepth(0);
    setReaderSentence(null);
    setImmerseMode("reader");
    setView("immerse");
    setZenMode(true);
    void ensureLanguageTools();
  };

  const openCatalogReading = (item: ReadingCatalogItem): void => {
    const sourceId = `catalog:${item.id}:${readingLength}`;
    const existing = currentStateRef.current.sources.find(
      (source) => source.id === sourceId,
    );
    if (existing) {
      enterReader(existing.id);
      return;
    }
    rememberReaderOrigin();
    const text = textForReadingLength(item.text, readingLength);
    const source: SourceItem = {
      id: sourceId,
      kind: "article",
      status: "ready",
      title: item.title,
      url: item.url,
      text,
      addedAt: iso(),
      updatedAt: iso(),
      progress: 0,
      readingSentence: 0,
      provenance: item.generated ? "generated-sample" : "user-supplied",
      capturedConceptIds: [],
      notes: `${item.sourceName} · ${item.level} · ${readingLength} · ${item.rightsNote}`,
      segments: [],
      analysis: null,
    };
    update((previous) => ({
      ...previous,
      sources: [source, ...previous.sources],
      activeSourceId: source.id,
      activity: [
        createActivity(
          "source-added",
          `Opened ${readingLength} reading “${item.title}”`,
          [],
          source.id,
        ),
        ...previous.activity,
      ].slice(0, 500),
    }));
    setReaderToken(null);
    setReaderWordDepth(0);
    setReaderSentence(0);
    setImmerseMode("reader");
    setView("immerse");
    setZenMode(true);
    void ensureLanguageTools();
  };

  const importLiveReading = async (item: LiveReadingItem): Promise<void> => {
    if (articleBusyIds.has(item.id)) return;
    const sourceId = `live:${item.id}:${readingLength}`;
    const existing = currentStateRef.current.sources.find(
      (source) => source.id === sourceId,
    );
    if (existing) {
      enterReader(existing.id);
      return;
    }
    setArticleBusyIds((current) => new Set(current).add(item.id));
    setArticleErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setLiveReadingError(null);
    try {
      const response = await fetch("/api/article-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as {
        title?: string;
        text?: string;
        error?: string;
      };
      if (!response.ok || !payload.text)
        throw new Error(
          payload.error ?? "The original article could not be imported.",
        );
      const source: SourceItem = {
        id: sourceId,
        kind: "article",
        status: "ready",
        title: payload.title?.trim() || item.title,
        url: item.url,
        text: textForReadingLength(payload.text, readingLength),
        addedAt: iso(),
        updatedAt: iso(),
        progress: 0,
        readingSentence: 0,
        provenance: "user-supplied",
        capturedConceptIds: [],
        notes: `${item.sourceName} · imported from the original page · ${readingLength}`,
        segments: [],
        analysis: null,
      };
      update((previous) => ({
        ...previous,
        sources: [
          source,
          ...previous.sources.filter((candidate) => candidate.id !== sourceId),
        ],
        activeSourceId: source.id,
        activity: [
          createActivity(
            "source-added",
            `Imported live article “${source.title}”`,
            [],
            source.id,
          ),
          ...previous.activity,
        ].slice(0, 500),
      }));
      rememberReaderOrigin();
      setReaderToken(null);
      setReaderWordDepth(0);
      setReaderSentence(0);
      setImmerseMode("reader");
      setZenMode(true);
      void ensureLanguageTools();
    } catch (error) {
      const summary = item.summary.trim();
      if (
        summary.length >= 80 &&
        /[\u3040-\u30ff\u3400-\u9fff]/u.test(summary)
      ) {
        const source: SourceItem = {
          id: sourceId,
          kind: "article",
          status: "ready",
          title: item.title,
          url: item.url,
          text: textForReadingLength(summary, readingLength),
          addedAt: iso(),
          updatedAt: iso(),
          progress: 0,
          readingSentence: 0,
          provenance: "user-supplied",
          capturedConceptIds: [],
          notes:
            item.readerStatus === "publisher-feed-text"
              ? `${item.sourceName} · PUBLISHER FEED TEXT · the full page could not be extracted`
              : `${item.sourceName} · PUBLISHER SUMMARY ONLY · the full page could not be extracted`,
          segments: [],
          analysis: null,
        };
        update((previous) => ({
          ...previous,
          sources: [
            source,
            ...previous.sources.filter(
              (candidate) => candidate.id !== sourceId,
            ),
          ],
          activeSourceId: source.id,
          activity: [
            createActivity(
              "source-added",
              `Opened publisher-supplied feed text “${source.title}”`,
              [],
              source.id,
            ),
            ...previous.activity,
          ].slice(0, 500),
        }));
        rememberReaderOrigin();
        setReaderToken(null);
        setReaderWordDepth(0);
        setReaderSentence(0);
        setImmerseMode("reader");
        setZenMode(true);
        void ensureLanguageTools();
      } else {
        const message =
          error instanceof Error
            ? `${error.message} Try again or open the publisher page.`
            : "This publisher page could not be opened in Bunki. Try again or open it at the source.";
        setArticleErrors((current) => ({ ...current, [item.id]: message }));
      }
    } finally {
      setArticleBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  const generateReading = async (): Promise<void> => {
    const topic = generationTopic.trim();
    if (topic.length < 2 || generationBusy) return;
    setGenerationBusy(true);
    setGenerationError(null);
    try {
      const response = await fetch("/api/reading-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          level: readingLevel,
          length: readingLength,
        }),
      });
      const payload = (await response.json()) as {
        title?: string;
        text?: string;
        model?: string;
        error?: string;
        code?: string;
      };
      if (!response.ok || !payload.text)
        throw new Error(
          payload.code === "AI_NOT_CONNECTED"
            ? "Live AI generation is not connected yet. The Bunki original shelf below remains available."
            : (payload.error ?? "The article could not be generated."),
        );
      const source: SourceItem = {
        id: uid("generated-reading"),
        kind: "article",
        status: "ready",
        title: payload.title?.trim() || topic,
        url: "",
        text: payload.text,
        addedAt: iso(),
        updatedAt: iso(),
        progress: 0,
        readingSentence: 0,
        provenance: "generated-sample",
        capturedConceptIds: [],
        notes: `AI-generated for ${readingLevel} · ${readingLength} · ${payload.model ?? "model"}`,
        segments: [],
        analysis: null,
      };
      update((previous) => ({
        ...previous,
        sources: [source, ...previous.sources],
        activeSourceId: source.id,
        activity: [
          createActivity(
            "source-added",
            `Generated personal reading “${source.title}”`,
            [],
            source.id,
          ),
          ...previous.activity,
        ].slice(0, 500),
      }));
      rememberReaderOrigin();
      setReaderToken(null);
      setReaderWordDepth(0);
      setReaderSentence(0);
      setImmerseMode("reader");
      setZenMode(true);
      void ensureLanguageTools();
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "The article could not be generated.",
      );
    } finally {
      setGenerationBusy(false);
    }
  };

  const fetchCaptions = async (): Promise<void> => {
    if (captureUrl.trim() === "") return;
    setCaptionBusy(true);
    setCaptureError(null);
    try {
      const response = await fetch("/api/youtube-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: captureUrl }),
      });
      const payload = (await response.json()) as {
        title?: string;
        text?: string;
        segments?: readonly SourceTranscriptSegment[];
        error?: string;
      };
      if (!response.ok || !payload.text)
        throw new Error(payload.error ?? "Captions unavailable.");
      setCaptureText(payload.text);
      setCaptureSegments(payload.segments ?? []);
      if (captureTitle.trim() === "" && payload.title)
        setCaptureTitle(payload.title);
      setCaptureAdvanced(true);
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Captions are unavailable.",
      );
    } finally {
      setCaptionBusy(false);
    }
  };

  const loadTextFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setCaptureError("Text files are limited to 2 MB in this phase.");
      return;
    }
    if (!/\.(txt|srt|vtt|md)$/i.test(file.name)) {
      setCaptureError(
        "Use a .txt, .srt, .vtt, or .md export. PDF and image OCR are not connected yet.",
      );
      return;
    }
    const text = await file.text();
    if (text.length > MAX_SOURCE_CHARACTERS) {
      setCaptureError(
        `This file has ${text.length.toLocaleString()} characters. The limit is ${MAX_SOURCE_CHARACTERS.toLocaleString()}; split it into separate source threads.`,
      );
      return;
    }
    setCaptureText(text);
    setCaptureSegments([]);
    setCaptureAdvanced(true);
    if (captureTitle.trim() === "")
      setCaptureTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const updateSourceText = (source: SourceItem, text: string): void => {
    const cleaned = cleanTranscript(text);
    if (cleaned.length > MAX_SOURCE_CHARACTERS) {
      setLanguageError(
        `This text has ${cleaned.length.toLocaleString()} characters. Bunki did not save it because the per-source limit is ${MAX_SOURCE_CHARACTERS.toLocaleString()}.`,
      );
      return;
    }
    update((previous) => ({
      ...previous,
      sources: previous.sources.map((item) =>
        item.id === source.id
          ? {
              ...item,
              text: cleaned,
              status: cleaned.trim() === "" ? "inbox" : "ready",
              segments: [],
              analysis: null,
              updatedAt: iso(),
            }
          : item,
      ),
    }));
  };

  const importCaptionsForSource = async (source: SourceItem): Promise<void> => {
    if (source.kind !== "youtube" || source.url.trim() === "") return;
    setCaptionBusy(true);
    setLanguageError(null);
    try {
      const response = await fetch("/api/youtube-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });
      const payload = (await response.json()) as {
        title?: string;
        text?: string;
        segments?: readonly SourceTranscriptSegment[];
        error?: string;
      };
      if (!response.ok || !payload.text)
        throw new Error(payload.error ?? "Captions unavailable.");
      if (payload.text.length > MAX_SOURCE_CHARACTERS)
        throw new Error(
          "The caption track is too large for one source thread.",
        );
      update((previous) => ({
        ...previous,
        sources: previous.sources.map((item) =>
          item.id === source.id
            ? {
                ...item,
                title:
                  item.title === "YouTube saved while walking" && payload.title
                    ? payload.title
                    : item.title,
                text: payload.text ?? "",
                segments: payload.segments ?? [],
                status: "ready",
                analysis: null,
                updatedAt: iso(),
              }
            : item,
        ),
      }));
      void ensureLanguageTools();
    } catch (error) {
      setLanguageError(
        error instanceof Error ? error.message : "Captions are unavailable.",
      );
    } finally {
      setCaptionBusy(false);
    }
  };

  const markSentence = (index: number): void => {
    if (!activeSource) return;
    setReaderSentence(index);
    update((previous) => ({
      ...previous,
      sources: previous.sources.map((source) =>
        source.id === activeSource.id
          ? {
              ...source,
              status: "reading",
              readingSentence: index,
              progress:
                sentences.length === 0
                  ? source.progress
                  : Math.round(((index + 1) / sentences.length) * 100),
              updatedAt: iso(),
            }
          : source,
      ),
    }));
  };

  const markTokenUnderstood = (token: ReaderToken): void => {
    if (!token.entry || token.ambiguous || !activeSource) return;
    const at = iso();
    const exactSentence =
      sentences.find(
        (sentence) =>
          token.position >= sentence.start && token.position < sentence.end,
      )?.text ?? null;
    update((previous) => ({
      ...previous,
      memories: {
        ...previous.memories,
        [token.entry!.id]: recordEvidence(previous.memories[token.entry!.id], {
          conceptId: token.entry!.id,
          kind: "vocabulary",
          skill: "recognition",
          outcome: "success",
          at,
          sourceId: activeSource.id,
          contextFingerprint: exactSentence,
          passive: true,
        }),
      },
    }));
  };

  const markTokenEncountered = (token: ReaderToken): void => {
    if (!token.entry || !activeSource) return;
    const at = iso();
    const exactSentence =
      sentences.find(
        (sentence) =>
          token.position >= sentence.start && token.position < sentence.end,
      )?.text ?? null;
    update((previous) => ({
      ...previous,
      memories: {
        ...previous.memories,
        [token.entry!.id]: recordEvidence(previous.memories[token.entry!.id], {
          conceptId: token.entry!.id,
          kind: "vocabulary",
          skill: "reading",
          outcome: "partial",
          at,
          sourceId: activeSource.id,
          contextFingerprint: exactSentence,
          passive: true,
        }),
      },
    }));
  };

  const markSentenceUnderstood = (sentenceIndex: number): void => {
    if (!activeSource) return;
    const sentenceTokens = tokensBySentence.get(sentenceIndex) ?? [];
    const at = iso();
    update((previous) => {
      const memories = { ...previous.memories };
      const seen = new Set<string>();
      for (const token of sentenceTokens) {
        if (!token.entry || token.ambiguous || seen.has(token.entry.id))
          continue;
        seen.add(token.entry.id);
        memories[token.entry.id] = recordEvidence(memories[token.entry.id], {
          conceptId: token.entry.id,
          kind: "vocabulary",
          skill: "reading",
          outcome: "success",
          at,
          sourceId: activeSource.id,
          contextFingerprint:
            sentences.find(
              (sentence) =>
                token.position >= sentence.start &&
                token.position < sentence.end,
            )?.text ?? null,
          passive: true,
        });
      }
      return { ...previous, memories };
    });
  };

  const askAboutSentence = (sentenceIndex: number): void => {
    const sentence = sentences[sentenceIndex];
    if (!sentence) return;
    setTeacherMode("explain");
    setTeacherInput(
      `この文を文脈に沿って説明してください。重要な語彙と文法も示してください。\n\n${sentence.text}`,
    );
    setView("coach");
  };

  const mineSelectedSentence = async (sentenceIndex: number): Promise<void> => {
    if (!activeSource) return;
    const sentence = sentences[sentenceIndex];
    if (!sentence) return;
    const sourceId = activeSource.id;
    const sourceFingerprintBefore = textFingerprint(activeSource.text);
    const tools = await ensureLanguageTools();
    if (!tools) return;
    const sourceSnapshot = currentStateRef.current.sources.find(
      (item) => item.id === sourceId,
    );
    if (
      !sourceSnapshot ||
      textFingerprint(sourceSnapshot.text) !== sourceFingerprintBefore
    ) {
      setLanguageError(
        "The source changed while Bunki was preparing this sentence. Select it again so the card keeps exact lineage.",
      );
      return;
    }
    const resolvedSentence = sentenceSpans(sourceSnapshot.text)[sentenceIndex];
    if (!resolvedSentence || resolvedSentence.text !== sentence.text) {
      setLanguageError(
        "That sentence moved while Bunki was preparing it. Select it again.",
      );
      return;
    }
    const temporarySource: SourceItem = {
      ...sourceSnapshot,
      text: resolvedSentence.text,
      segments: [],
      analysis: null,
    };
    const tokens = tokenizeJapanese(
      resolvedSentence.text,
      tools.dictionary,
      tools.tokenizer,
    );
    const analysis = analyzeSource(
      temporarySource,
      tokens,
      currentStateRef.current,
    );
    const packet = stageSourcePacket(
      temporarySource,
      analysis,
      currentStateRef.current,
    );
    const immutableFingerprint = sourceFingerprintBefore;
    update((previous) => ({
      ...previous,
      stagedPacket: {
        ...packet,
        title: `Selected sentence · ${sourceSnapshot.title}`,
        proposals: packet.proposals.map((proposal) => ({
          ...proposal,
          lineage: proposal.lineage.map((anchor) => ({
            ...anchor,
            sourceFingerprint: immutableFingerprint,
          })),
        })),
      },
    }));
  };

  const toggleProposal = (id: string): void => {
    update((previous) =>
      previous.stagedPacket === null
        ? previous
        : {
            ...previous,
            stagedPacket: {
              ...previous.stagedPacket,
              proposals: previous.stagedPacket.proposals.map((proposal) =>
                proposal.id === id
                  ? { ...proposal, selected: !proposal.selected }
                  : proposal,
              ),
            },
          },
    );
  };

  const editProposal = (
    id: string,
    field: "front" | "back" | "note",
    value: string,
  ): void => {
    update((previous) =>
      previous.stagedPacket === null
        ? previous
        : {
            ...previous,
            stagedPacket: {
              ...previous.stagedPacket,
              proposals: previous.stagedPacket.proposals.map((proposal) =>
                proposal.id === id ? { ...proposal, [field]: value } : proposal,
              ),
            },
          },
    );
  };

  const admitPacket = (): void => {
    if (state.stagedPacket === null) return;
    const selected = state.stagedPacket.proposals.filter(
      (proposal) => proposal.selected && !hasEquivalentCard(state, proposal),
    );
    const at = new Date();
    const cards = selected.map((proposal) => proposalToCard(proposal, at));
    update((previous) => {
      const memories = { ...previous.memories };
      for (const proposal of selected) {
        memories[proposal.conceptId] = recordEvidence(
          memories[proposal.conceptId],
          {
            conceptId: proposal.conceptId,
            kind: conceptKind(proposal.conceptId),
            skill: proposal.skill,
            outcome: "partial",
            at: at.toISOString(),
            sourceId: proposal.sourceId,
            contextFingerprint: proposal.sourceSentence,
            passive: true,
          },
        );
      }
      return {
        ...previous,
        memories,
        cards: [...cards, ...previous.cards],
        stagedPacket: null,
        sources: previous.sources.map((source) =>
          source.id === previous.stagedPacket?.sourceId
            ? {
                ...source,
                status: "mined",
                capturedConceptIds: [
                  ...new Set([
                    ...source.capturedConceptIds,
                    ...selected.map((proposal) => proposal.conceptId),
                  ]),
                ],
              }
            : source,
        ),
        activity: [
          createActivity(
            "packet-admitted",
            `Saved ${String(cards.length)} card${cards.length === 1 ? "" : "s"} for review`,
            selected.map((proposal) => proposal.conceptId),
            previous.stagedPacket?.sourceId ?? null,
          ),
          ...previous.activity,
        ].slice(0, 500),
      };
    });
    setSavedReviewCount(cards.length);
  };

  async function rateReview(rating: 1 | 2 | 3 | 4): Promise<void> {
    if (!reviewCard || !reviewRevealed) return;
    const previousMemory = state.memories[reviewCard.conceptId];
    const result = rateLearningCard(reviewCard, rating);
    const outcome =
      rating === 1 ? "failure" : rating === 2 ? "partial" : "success";
    const nextMemory = recordEvidence(previousMemory, {
      conceptId: reviewCard.conceptId,
      kind: conceptKind(reviewCard.conceptId),
      skill: reviewCard.skill,
      outcome,
      at: result.event.reviewedAt,
      sourceId: reviewCard.sourceId,
      contextFingerprint: reviewCard.sourceSentence,
    });
    update((previous) => ({
      ...previous,
      cards: previous.cards.map((card) =>
        card.id === reviewCard.id ? result.card : card,
      ),
      memories: { ...previous.memories, [reviewCard.conceptId]: nextMemory },
      reviewEvents: [
        ...previous.reviewEvents,
        { ...result.event, previousMemory, nextMemory },
      ].slice(-5_000),
      reviewSession:
        previous.reviewSession === null
          ? null
          : {
              ...previous.reviewSession,
              completedCardIds: [
                ...previous.reviewSession.completedCardIds,
                reviewCard.id,
              ],
              completedAt:
                previous.reviewSession.completedCardIds.length + 1 >=
                previous.reviewSession.initialCount
                  ? iso()
                  : null,
            },
      lastUndo: { ...result.event, previousMemory, nextMemory },
      activity: [
        createActivity(
          "review",
          `${rating === 1 ? "Missed" : rating === 2 ? "Hard" : rating === 3 ? "Recalled" : "Easy"} · ${reviewCard.conceptId}`,
          [reviewCard.conceptId],
          reviewCard.sourceId,
        ),
        ...previous.activity,
      ].slice(0, 500),
    }));
    setReviewRevealed(false);
  }

  const undoReview = (): void => {
    const event = state.lastUndo;
    if (event === null) return;
    update((previous) => {
      const memories = { ...previous.memories };
      if (event.previousMemory)
        memories[event.conceptId] = event.previousMemory;
      else delete memories[event.conceptId];
      return {
        ...previous,
        cards: previous.cards.map((card) =>
          card.id === event.cardId ? event.previousCard : card,
        ),
        memories,
        reviewEvents: previous.reviewEvents.filter(
          (item) => item.id !== event.id,
        ),
        reviewSession:
          previous.reviewSession === null
            ? null
            : {
                ...previous.reviewSession,
                completedAt: null,
                completedCardIds:
                  previous.reviewSession.completedCardIds.filter(
                    (id) => id !== event.cardId,
                  ),
              },
        lastUndo: null,
      };
    });
    setReviewRevealed(false);
  };

  const suspendCard = (card: LearningCard): void => {
    const willSuspend = !card.suspended;
    update((previous) => ({
      ...previous,
      cards: previous.cards.map((item) =>
        item.id === card.id
          ? { ...item, suspended: willSuspend, updatedAt: iso() }
          : item,
      ),
      reviewSession: willSuspend
        ? removeCardFromReviewSession(previous.reviewSession, card.id)
        : previous.reviewSession,
    }));
    setReviewRevealed(false);
  };

  const openCardEditor = (card: LearningCard): void => {
    setCardEditError(null);
    setEditingCard(card);
  };

  const deleteCard = (card: LearningCard): void => {
    if (
      !window.confirm(
        "Delete this card? Its review history will remain in the activity record.",
      )
    )
      return;
    update((previous) => ({
      ...previous,
      cards: previous.cards.filter((item) => item.id !== card.id),
      reviewSession: removeCardFromReviewSession(
        previous.reviewSession,
        card.id,
      ),
    }));
  };

  const saveCardEdit = (event: FormEvent): void => {
    event.preventDefault();
    if (editingCard === null) return;
    const front = editingCard.front.trim();
    const back = editingCard.back.trim();
    if (front === "" || back === "") {
      setCardEditError("Front and back both need text.");
      return;
    }
    const sanitized = {
      ...editingCard,
      front: front.slice(0, MAX_CARD_FRONT_CHARACTERS),
      back: back.slice(0, MAX_CARD_BACK_CHARACTERS),
      note: editingCard.note.slice(0, MAX_CARD_NOTE_CHARACTERS),
      updatedAt: iso(),
    };
    update((previous) => ({
      ...previous,
      cards: previous.cards.map((card) =>
        card.id === editingCard.id ? sanitized : card,
      ),
    }));
    setCardEditError(null);
    setEditingCard(null);
  };

  const sendTeacher = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    const input = teacherInput.trim();
    if (input === "" || teacherBusy) return;
    const turnId = uid("turn");
    const learnerMessage: TeacherMessage = {
      id: uid("message"),
      role: "learner",
      text: input,
      supportEn: null,
      createdAt: iso(),
      generated: false,
      corrections: [],
      branches: [],
      whyThisFits: null,
    };
    update((previous) => ({
      ...previous,
      messages: [...previous.messages, learnerMessage].slice(-200),
      activity: [
        createActivity("conversation", `Conversation: ${input.slice(0, 80)}`),
        ...previous.activity,
      ].slice(0, 500),
    }));
    setTeacherInput("");
    setTeacherBusy(true);
    let response: TeacherResponse;
    const requestState = currentStateRef.current;
    const teacherDictionary = dictionary ?? (await ensureDictionary());
    const activeForRequest =
      requestState.sources.find(
        (source) => source.id === requestState.activeSourceId,
      ) ?? null;
    const activeSpans =
      activeForRequest === null ? [] : sentenceSpans(activeForRequest.text);
    const activeIndex = Math.max(
      0,
      readerSentence ?? activeForRequest?.readingSentence ?? 0,
    );
    const activeExcerpt =
      activeForRequest === null
        ? ""
        : activeSpans
            .slice(Math.max(0, activeIndex - 3), activeIndex + 4)
            .map((sentence) => sentence.text)
            .join("\n")
            .slice(0, 5_000);
    const enrichedFrontier = frontier.slice(0, 8).map((item) => {
      const entry = teacherDictionary?.byId.get(item.conceptId);
      const grammar = item.conceptId.startsWith("grammar:")
        ? GRAMMAR_PATTERNS.find(
            (pattern) => `grammar:${pattern.id}` === item.conceptId,
          )
        : undefined;
      return {
        ...item,
        surface:
          entry?.word ??
          grammar?.pattern ??
          item.conceptId.replace("grammar:", ""),
        dictionaryForm:
          entry?.word ??
          grammar?.pattern ??
          item.conceptId.replace("grammar:", ""),
        reading: entry?.reading ?? "",
        forms: [
          entry?.word ?? "",
          entry?.altWord ?? "",
          entry?.reading ?? "",
          ...(grammar?.cues ?? []),
        ].filter((form) => form !== ""),
        meaning:
          entry?.meanings.slice(0, 3).join("; ") ??
          grammar?.meaning ??
          "Meaning not resolved in the local dictionary.",
        priorContexts: contextsForConcept(requestState, item.conceptId, 3).map(
          (context) => context.sentence,
        ),
      };
    });
    try {
      const api = await fetch("/api/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientTurnId: turnId,
          input,
          mode: teacherMode,
          profile: {
            currentLevel: requestState.profile.currentLevel,
            targetLevel: requestState.profile.targetLevel,
            target: requestState.profile.target,
            interests: requestState.profile.interests,
          },
          recentMessages: requestState.messages.slice(-8).map((message) => ({
            role: message.role,
            text: message.text,
          })),
          activeSource:
            activeForRequest === null
              ? null
              : {
                  id: activeForRequest.id,
                  title: activeForRequest.title,
                  excerpt: activeExcerpt,
                },
          frontier: enrichedFrontier,
        }),
      });
      if (!api.ok) {
        setTeacherConnection(
          api.status === 401
            ? "signin"
            : api.status === 503
              ? "not-connected"
              : "offline",
        );
        response = localCoachResponse(input, requestState);
      } else {
        response = (await api.json()) as TeacherResponse;
        setTeacherConnection("live");
      }
    } catch {
      setTeacherConnection("offline");
      response = localCoachResponse(input, requestState);
    }
    const teacherMessage: TeacherMessage = {
      id: uid("message"),
      role: "teacher",
      text: response.replyJa,
      supportEn: response.supportEn,
      createdAt: iso(),
      generated: true,
      corrections: response.corrections,
      branches: response.branches,
      whyThisFits: response.whyThisFits,
    };
    const allowedEvidence = new Set([
      ...Object.keys(requestState.memories),
      ...enrichedFrontier.map((item) => item.conceptId),
    ]);
    const replyBoundResponse = boundTeacherResponseToReply(
      response,
      enrichedFrontier,
    );
    const boundedResponse: TeacherResponse = {
      ...replyBoundResponse,
      reintroducedConceptIds: replyBoundResponse.reintroducedConceptIds.filter(
        (conceptId) => allowedEvidence.has(conceptId),
      ),
      evidence: replyBoundResponse.evidence.filter((item) =>
        allowedEvidence.has(item.conceptId),
      ),
      cardProposals: replyBoundResponse.cardProposals.filter((proposal) =>
        allowedEvidence.has(proposal.conceptId),
      ),
    };
    const conversationText = `Learner:\n${input}\n\nBunki:\n${response.replyJa}${
      response.supportEn ? `\n\nSupport:\n${response.supportEn}` : ""
    }`;
    const conversationSource: SourceItem = {
      id: `conversation-${turnId}`,
      kind: "conversation",
      status: "mined",
      title: `Coach exchange · ${new Date().toLocaleDateString()}`,
      url: "",
      text: conversationText,
      addedAt: iso(),
      updatedAt: iso(),
      progress: 100,
      readingSentence: 0,
      provenance: "generated-sample",
      capturedConceptIds: boundedResponse.reintroducedConceptIds,
      notes:
        boundedResponse.reintroducedConceptIds.length === 0
          ? "Conversation source."
          : `Deliberately reintroduced: ${boundedResponse.reintroducedConceptIds.join(", ")}`,
      segments: [],
      analysis: null,
    };
    const priorLineage = Object.fromEntries(
      boundedResponse.cardProposals.map((proposal) => [
        proposal.conceptId,
        contextsForConcept(requestState, proposal.conceptId, 3).map(
          (context) => ({
            sourceId: context.source.id,
            sourceFingerprint: textFingerprint(context.source.text),
            exactText: context.sentence,
          }),
        ),
      ]),
    );
    update((previous) => ({
      ...previous,
      memories: applyTeacherEvidence(
        previous.memories,
        boundedResponse.evidence,
        allowedEvidence,
        turnId,
        undefined,
        conversationSource.id,
        response.replyJa,
      ),
      messages: [...previous.messages, teacherMessage].slice(-200),
      sources: [conversationSource, ...previous.sources],
      stagedPacket:
        boundedResponse.cardProposals.length === 0
          ? previous.stagedPacket
          : {
              id: uid("packet"),
              sourceId: conversationSource.id,
              title: "Conversation-mined proposals",
              createdAt: iso(),
              proposals: teacherProposalsToCards(
                boundedResponse,
                conversationSource,
                priorLineage,
              ),
            },
    }));
    setTeacherBusy(false);
  };

  const stageDictionaryEntry = async (
    entry: VocabEntry,
    occurrenceToken: ReaderToken | null = null,
  ): Promise<void> => {
    const snapshot = currentStateRef.current;
    let occurrence:
      | {
          readonly source: SourceItem;
          readonly sentence: string;
          readonly surface: string;
          readonly start: number;
          readonly end: number;
        }
      | undefined;
    if (
      (occurrenceToken ?? readerToken)?.entry?.id === entry.id &&
      activeSource !== null
    ) {
      const focusedToken = occurrenceToken ?? readerToken;
      if (focusedToken === null) return;
      const sentence = sentenceSpans(activeSource.text).find(
        (item) =>
          focusedToken.position >= item.start &&
          focusedToken.position < item.end,
      );
      if (sentence) {
        const start = focusedToken.position - sentence.start;
        occurrence = {
          source: activeSource,
          sentence: sentence.text,
          surface: focusedToken.surface,
          start,
          end: start + focusedToken.surface.length,
        };
      }
    }
    if (occurrence === undefined) {
      const tools = await ensureLanguageTools();
      if (tools) {
        for (const context of contextsForConcept(snapshot, entry.id, 8)) {
          const tokens = tokenizeJapanese(
            context.sentence,
            tools.dictionary,
            tools.tokenizer,
          );
          const token = tokens.find(
            (item) =>
              item.entry?.id === entry.id ||
              item.entryCandidates.some(
                (candidate) => candidate.id === entry.id,
              ),
          );
          if (!token) continue;
          occurrence = {
            source: context.source,
            sentence: context.sentence,
            surface: token.surface,
            start: token.position,
            end: token.position + token.surface.length,
          };
          break;
        }
      }
    }
    const source = occurrence?.source;
    const sourceSentence = occurrence?.sentence ?? "";
    const proposal: CardProposal = {
      id: uid("proposal"),
      conceptId: entry.id,
      sourceId: source?.id ?? null,
      sourceSentence,
      front:
        occurrence === undefined
          ? `「${entry.word}」を使って、自分のことを一文で表す。`
          : `${sourceSentence.slice(0, occurrence.start)}＿＿${sourceSentence.slice(occurrence.end)}`,
      back: `${entry.word}（${entry.reading}）— ${entry.meanings
        .slice(0, 3)
        .join("; ")}${sourceSentence ? `\n${sourceSentence}` : ""}`,
      reading: entry.reading,
      note: "",
      rationale:
        sourceSentence === ""
          ? "Generated production proposal from a deliberate dictionary lookup."
          : `Exact sentence from “${source?.title ?? "source"}”.`,
      tags: [
        "dictionary",
        sourceSentence === "" ? "generated-proposal" : "source",
      ],
      lineage:
        source === undefined || occurrence === undefined
          ? []
          : [
              {
                sourceId: source.id,
                sourceFingerprint: textFingerprint(source.text),
                exactText: sourceSentence,
                role: "target",
                generated: false,
              },
            ],
      kind: sourceSentence === "" ? "production" : "cloze",
      skill: sourceSentence === "" ? "production" : "recognition",
      origin: sourceSentence === "" ? "generated" : "source",
      generated: sourceSentence === "",
      selected: true,
    };
    update((previous) => ({
      ...previous,
      stagedPacket: {
        id: uid("packet"),
        sourceId: source?.id ?? null,
        title: `Dictionary thread · ${entry.word}`,
        createdAt: iso(),
        proposals: [proposal],
      },
    }));
  };

  const readerTokenKey = (token: ReaderToken | null): string | null =>
    token?.entry
      ? `${String(token.position)}:${token.entry.id}:${token.surface}`
      : null;

  const advanceReaderWord = (
    token: ReaderToken,
    sentenceIndex: number,
  ): void => {
    const sameWord = readerTokenKey(readerToken) === readerTokenKey(token);
    const nextDepth = nextReaderWordDepth(readerWordDepth, sameWord);
    if (!token.ambiguous) markTokenEncountered(token);
    setReaderToken(token);
    setReaderSentence(sentenceIndex);
    setReaderWordDepth(nextDepth);
  };

  const closeReaderWord = (): void => {
    setReaderToken(null);
    setReaderWordDepth(0);
  };

  const restoreReadingShelfScroll = (): void => {
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: readingShelfScroll.current, behavior: "auto" }),
    );
  };

  const returnToReadingShelf = (consumeHistory = true): void => {
    const shouldPopHistory =
      consumeHistory && window.history.state?.bunkiSurface === "reader";
    readerOpenRef.current = false;
    closeReaderWord();
    setReaderPanelOpen(false);
    setSavedReviewCount(null);
    setZenMode(false);
    setImmerseMode("discover");
    setView("immerse");
    restoreReadingShelfScroll();
    if (shouldPopHistory) window.history.back();
  };

  useEffect(() => {
    const onPopState = (): void => {
      if (!readerOpenRef.current) return;
      readerOpenRef.current = false;
      closeReaderWord();
      setReaderPanelOpen(false);
      setSavedReviewCount(null);
      setZenMode(false);
      setImmerseMode("discover");
      restoreReadingShelfScroll();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const scrollDocumentTo = (top: number): void => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() =>
        window.scrollTo({ top, behavior: "auto" }),
      ),
    );
  };

  const captureReaderLexicalReturn = (
    token: ReaderToken,
  ): ReaderLexicalReturnContext | null => {
    const sourceId = activeSource?.id ?? state.activeSourceId;
    if (!sourceId || !token.entry) return null;
    return {
      sourceId,
      sentenceIndex: readerAnchor,
      word: token.entry.word,
      token,
      scrollY: window.scrollY,
    };
  };

  const restoreReaderLexicalReturn = (
    context: ReaderLexicalReturnContext,
  ): void => {
    update((previous) => ({
      ...previous,
      activeSourceId: context.sourceId,
    }));
    setReaderSentence(context.sentenceIndex);
    setReaderToken(context.token);
    setReaderWordDepth(3);
    setReaderPanelOpen(false);
    setImmerseMode("reader");
    setView("immerse");
    setZenMode(true);
    setKanjiFocusMode(false);
    readerOpenRef.current = true;
    scrollDocumentTo(context.scrollY);
  };

  const openReaderDictionary = (token: ReaderToken): void => {
    const context = captureReaderLexicalReturn(token);
    setDictionaryReturnContext(context);
    if (!token.entry) return;
    setSelectedWordId(token.entry.id);
    setLibraryQuery(token.entry.word);
    setLibraryTab("dictionary");
    closeReaderWord();
    setReaderPanelOpen(false);
    setZenMode(false);
    setView("library");
    scrollDocumentTo(0);
  };

  const openReaderKanji = (
    entry: KanjiEntry,
    token: ReaderToken,
  ): void => {
    const context = captureReaderLexicalReturn(token);
    setKanjiReturnContext(
      context === null ? null : { kind: "reader", ...context },
    );
    setKanjiQuery(entry.char);
    setLibraryTab("kanji");
    closeReaderWord();
    setReaderPanelOpen(false);
    setZenMode(false);
    setKanjiFocusMode(true);
    setStrokeReplayKey((current) => current + 1);
    setView("library");
    scrollDocumentTo(0);
  };

  const addUncertainty = (entry: VocabEntry, uncertainty: string): void => {
    const existing =
      state.memories[entry.id] ??
      recordEvidence(undefined, {
        conceptId: entry.id,
        kind: "vocabulary",
        skill: "recognition",
        outcome: "partial",
        at: iso(),
        passive: true,
      });
    update((previous) => ({
      ...previous,
      memories: {
        ...previous.memories,
        [entry.id]: {
          ...existing,
          uncertainties: existing.uncertainties.includes(uncertainty)
            ? existing.uncertainties.filter((item) => item !== uncertainty)
            : [...existing.uncertainties, uncertainty],
        },
      },
    }));
  };

  const exportState = (): void => {
    downloadText(
      `bunki-export-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(state, null, 2),
    );
  };

  const restoreState = async (file: File | undefined): Promise<void> => {
    setRestoreError(null);
    if (!file) return;
    if (file.size > 25_000_000) {
      setRestoreError(
        "That export is larger than Bunki’s 25 MB restore limit.",
      );
      return;
    }
    try {
      const decoded = JSON.parse(await file.text()) as unknown;
      if (
        decoded === null ||
        typeof decoded !== "object" ||
        !("version" in decoded) ||
        (decoded as { version?: unknown }).version !== 2
      )
        throw new Error("This is not a Bunki v2 JSON export.");
      const restored = migrateToPhase2(decoded);
      update(() => restored);
      setSelectedWordId(null);
      setLibraryQuery("");
      setKanjiReturnContext(null);
      setDictionaryReturnContext(null);
      setRestoreError(
        `Restored ${restored.sources.length} source${restored.sources.length === 1 ? "" : "s"} and ${restored.cards.length} review card${restored.cards.length === 1 ? "" : "s"} on this device.`,
      );
    } catch (error) {
      setRestoreError(
        error instanceof Error
          ? error.message
          : "Bunki could not read that JSON export.",
      );
    }
  };

  const exportTsv = (): void => {
    downloadText(
      `bunki-anki-${new Date().toISOString().slice(0, 10)}.tsv`,
      phase2CardsToAnkiTsv(state),
      "text/tab-separated-values",
    );
  };

  const canvasPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): { readonly x: number; readonly y: number } => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    return {
      x:
        ((event.clientX - rectangle.left) / rectangle.width) *
        event.currentTarget.width,
      y:
        ((event.clientY - rectangle.top) / rectangle.height) *
        event.currentTarget.height,
    };
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = canvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 11;
    context.strokeStyle = "#172338";
    setDrawing(true);
    setDrawingEmpty(false);
  };

  const continueDrawing = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): void => {
    if (!drawing) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = canvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (): void => setDrawing(false);
  const clearDrawing = (): void => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setDrawingEmpty(true);
  };

  const renderToday = (): ReactNode => (
    <div className="p2-page p2-today">
      <header className="p2-page-head">
        <div>
          <span className="p2-eyebrow">Today · 今日</span>
          <h1>
            {state.profile.onboardingComplete
              ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${state.profile.displayName}.`
              : "Start with one clear thread."}
          </h1>
          <p>
            Bunki chooses the next action from your encounters, reviews, and
            current source—not a decorative score.
          </p>
        </div>
        <button
          className="p2-button subtle"
          onClick={() => setOnboardingStep(1)}
        >
          <Settings2 size={17} /> Learning preferences
        </button>
      </header>

      <Surface className="p2-next-action">
        <div className="p2-next-icon">
          {nextAction.kind === "review" ? (
            <ListChecks />
          ) : nextAction.kind === "capture" ? (
            <Link2 />
          ) : (
            <BookOpen />
          )}
        </div>
        <div className="p2-next-copy">
          <span>Your best next action · about {nextAction.minutes} min</span>
          <h2>{nextAction.title}</h2>
          <p>{nextAction.detail}</p>
          <small>
            <Brain size={14} /> Why: {nextAction.reason}
          </small>
        </div>
        <button
          className="p2-button primary p2-continue"
          onClick={performNextAction}
        >
          Continue <ArrowRight size={18} />
        </button>
      </Surface>

      <div className="p2-today-grid">
        <Surface className="p2-noticed">
          <div className="p2-section-title">
            <div>
              <span className="p2-eyebrow">Bunki noticed</span>
              <h2>The weave is changing here</h2>
            </div>
            <Gauge size={21} />
          </div>
          {frontier.length > 0 ? (
            <div className="p2-frontier-list">
              {frontier.slice(0, 4).map((item) => (
                <button
                  key={item.conceptId}
                  onClick={() => {
                    update((previous) => ({
                      ...previous,
                      selectedConceptId: item.conceptId,
                    }));
                    setLibraryTab("memory");
                    setView("library");
                  }}
                >
                  <StatusPill state={item.state} />
                  <div>
                    <strong>
                      {dictionary?.byId.get(item.conceptId)?.word ??
                        item.conceptId.replace("grammar:", "")}
                    </strong>
                    <span>{item.reason}</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="p2-empty compact">
              <Sparkles size={24} />
              <p>
                Your first lookup, source, or review will give Bunki something
                real to notice.
              </p>
            </div>
          )}
        </Surface>

        <Surface className="p2-workload">
          <div className="p2-section-title">
            <div>
              <span className="p2-eyebrow">Today’s load</span>
              <h2>
                {hasActiveReviewSession
                  ? `${String(todayReviewCount)} left in this session`
                  : `${String(todayReviewCount)} of ${String(due.length)} today`}
                {" · "}
                {todayReviewMinutes} min
              </h2>
            </div>
            <Clock3 size={21} />
          </div>
          <div className="p2-stat-row">
            <div>
              <strong>{summary.learning}</strong>
              <span>learning</span>
            </div>
            <div>
              <strong>{summary.fragile}</strong>
              <span>fragile</span>
            </div>
            <div>
              <strong>{summary.established}</strong>
              <span>established</span>
            </div>
          </div>
          <button
            className="p2-button wide"
            onClick={() => {
              setView("review");
              if (due.length || hasActiveReviewSession) startSession();
            }}
          >
            {hasActiveReviewSession ? "Resume review" : "Open review"}{" "}
            <ChevronRight size={17} />
          </button>
        </Surface>
      </div>

      <div className="p2-thread-row">
        <Surface>
          <div className="p2-section-title">
            <div>
              <span className="p2-eyebrow">Current thread</span>
              <h2>{activeSource?.title ?? "Nothing captured yet"}</h2>
            </div>
            <BookMarked size={21} />
          </div>
          {activeSource ? (
            <>
              <p>
                {activeSource.text
                  ? activeSource.text.slice(0, 150)
                  : "URL saved. Add text or public captions when you have time."}
                {activeSource.text.length > 150 ? "…" : ""}
              </p>
              <div className="p2-source-meta">
                <span>{activeSource.kind}</span>
                <span>{activeSource.status}</span>
                <span>{Math.round(activeSource.progress)}% read</span>
              </div>
              <button
                className="p2-text-link"
                onClick={() => enterReader(activeSource.id)}
              >
                Open the thread <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <button
              className="p2-button primary"
              onClick={() => setCaptureOpen(true)}
            >
              <Plus size={17} /> Capture what you met
            </button>
          )}
        </Surface>
        <button
          className="p2-walking-capture"
          onClick={() => setCaptureOpen(true)}
        >
          <span>
            <Mic2 size={20} />
          </span>
          <div>
            <strong>Walking capture</strong>
            <small>Paste a URL now. Process it later.</small>
          </div>
          <Plus size={19} />
        </button>
      </div>

      <Surface className="p2-immersion-lanes">
        <div className="p2-section-title">
          <div>
            <span className="p2-eyebrow">Ready to read · text included</span>
            <h2>Open a real article, not an empty link.</h2>
          </div>
          <BookOpen size={20} />
        </div>
        <fieldset className="p2-today-reading-controls">
          <legend>Reading length</legend>
          <div>
            {(
              [
                ["short", "Short"],
                ["medium", "Medium"],
                ["full", "Full"],
              ] as const
            ).map(([length, label]) => (
              <button
                type="button"
                key={length}
                className={readingLength === length ? "active" : ""}
                onClick={() => setReadingLength(length)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="p2-immersion-grid">
          {immersionSuggestions.map((suggestion) => {
            const excerpt = textForReadingLength(
              suggestion.text,
              readingLength,
            );
            return (
              <article
                key={suggestion.id}
                className="p2-openable-reading"
                role="button"
                tabIndex={0}
                aria-label={`Read ${suggestion.title} in Bunki Reader`}
                onClick={() => openCatalogReading(suggestion)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCatalogReading(suggestion);
                  }
                }}
              >
                <span>
                  {suggestion.real ? "REAL TEXT" : "GRADED ORIGINAL"} ·{" "}
                  {suggestion.level} · {readingMinutes(excerpt)} min
                </span>
                <h3>{suggestion.title}</h3>
                <p>{suggestion.subtitle}</p>
                <blockquote lang="ja">{excerpt.slice(0, 120)}…</blockquote>
                <footer>
                  <small>{suggestion.sourceName}</small>
                  <span className="p2-read-here">
                    Read in Zen <ArrowRight size={13} />
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
        <small>
          Every card above contains Japanese text now. Live publisher articles
          stay in Immerse, where “Read here” imports the original page before
          opening the reader.
        </small>
      </Surface>
    </div>
  );

  const renderImmerse = (): ReactNode => (
    <div className="p2-page p2-immerse">
      <header className="p2-page-head">
        <div>
          <span className="p2-eyebrow">Immerse · 読む</span>
          <h1>
            {immerseMode === "discover"
              ? "Choose something worth reading."
              : (activeSource?.title ?? "Your reading room")}
          </h1>
          <p>
            {immerseMode === "discover"
              ? "Real Japanese, graded originals, historical texts, live reporting, and personal AI readings—at the length and edge you choose."
              : "The page stays quiet. Tap the same word again to move from reading to meaning to memory."}
          </p>
        </div>
        <div className="p2-immerse-head-actions">
          {immerseMode === "reader" ? (
            <button
              className="p2-button"
              onClick={() => returnToReadingShelf()}
            >
              <ArrowLeft size={17} /> Reading shelf
            </button>
          ) : null}
          <button
            className="p2-button primary"
            onClick={() => setCaptureOpen(true)}
          >
            <Plus size={17} /> Add my own
          </button>
        </div>
      </header>

      {immerseMode === "discover" ? (
        <div className="p2-reading-room">
          {state.sources.length > 0 ? (
            <section className="p2-reading-section p2-my-threads p2-continue-first">
              <header>
                <div>
                  <span className="p2-eyebrow">Continue</span>
                  <h2>Pick up where you left off</h2>
                </div>
                <span>{state.sources.length} saved</span>
              </header>
              <div>
                {state.sources.slice(0, 6).map((source) => (
                  <button
                    key={source.id}
                    onClick={() => enterReader(source.id)}
                  >
                    <span className={`p2-source-state ${source.status}`} />
                    <div>
                      <strong>{source.title}</strong>
                      <small>
                        {source.kind} · {source.status}
                      </small>
                    </div>
                    <span>{Math.round(source.progress)}%</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <Surface className="p2-reading-chooser">
            <div className="p2-reading-chooser-title">
              <div>
                <span className="p2-eyebrow">Reading shelf</span>
                <h2>Set the edge. Then the interface disappears.</h2>
              </div>
              <SlidersHorizontal size={21} />
            </div>
            <div className="p2-reading-controls">
              <fieldset>
                <legend>Difficulty</legend>
                <div>
                  {(["N5", "N4", "N3", "N2", "N1", "N1+"] as const).map(
                    (level) => (
                      <button
                        type="button"
                        key={level}
                        className={readingLevel === level ? "active" : ""}
                        onClick={() => setReadingLevel(level)}
                      >
                        {level}
                      </button>
                    ),
                  )}
                </div>
              </fieldset>
              <fieldset>
                <legend>Length</legend>
                <div>
                  {(
                    [
                      ["short", "Short", "about 500 characters"],
                      ["medium", "Medium", "about 1,650 characters"],
                      ["full", "Full", "all available text"],
                    ] as const
                  ).map(([length, label, hint]) => (
                    <button
                      type="button"
                      key={length}
                      className={readingLength === length ? "active" : ""}
                      onClick={() => setReadingLength(length)}
                    >
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <nav
              className="p2-reading-filters"
              aria-label="Reading source type"
            >
              {(
                [
                  ["all", "Everything"],
                  ["graded", "Graded originals"],
                  ["real", "Real Japanese"],
                  ["historical", "Historical"],
                  ["live", "Live now"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={readingFilter === id ? "active" : ""}
                  onClick={() => setReadingFilter(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </Surface>

          <Surface className="p2-ai-reading-maker">
            <div>
              <span>
                <WandSparkles size={17} /> Personal reading
              </span>
              <h2>Generate at your exact edge</h2>
              <p>
                Bunki asks for a natural {readingLevel}, {readingLength}{" "}
                article. Generated writing is always marked and never presented
                as reporting.
              </p>
            </div>
            <div>
              <label htmlFor="generation-topic">Topic</label>
              <input
                id="generation-topic"
                value={generationTopic}
                onChange={(event) => setGenerationTopic(event.target.value)}
                maxLength={180}
                placeholder="日本の山岳信仰と現代の旅"
              />
              <button
                className="p2-button primary"
                disabled={generationBusy || generationTopic.trim().length < 2}
                onClick={() => void generateReading()}
              >
                {generationBusy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                Create article
              </button>
            </div>
            {generationError ? (
              <small className="p2-inline-error">{generationError}</small>
            ) : null}
          </Surface>

          {readingFilter !== "live" ? (
            <section className="p2-reading-section">
              <header>
                <div>
                  <span className="p2-eyebrow">
                    {readingFilter === "graded"
                      ? "Original graded Japanese"
                      : readingFilter === "historical"
                        ? "Historical and classical Japanese"
                        : readingFilter === "real"
                          ? "Real Japanese texts"
                          : "Built-in reading library"}
                  </span>
                  <h2>For you · {readingLevel}</h2>
                </div>
                <span>{catalogReadings.length} readings</span>
              </header>
              {catalogReadings.length > 0 ? (
                <div className="p2-reading-grid">
                  {catalogReadings.map((item) => {
                    const excerpt = textForReadingLength(
                      item.text,
                      readingLength,
                    );
                    return (
                      <article
                        key={item.id}
                        className="p2-reading-card p2-openable-reading"
                        role="button"
                        tabIndex={0}
                        aria-label={`Read ${item.title} in Bunki Reader`}
                        onClick={() => openCatalogReading(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openCatalogReading(item);
                          }
                        }}
                      >
                        <div className="p2-reading-card-meta">
                          <span>
                            {item.real ? "REAL TEXT" : "BUNKI ORIGINAL"}
                          </span>
                          <span>{item.level}</span>
                          <span>{readingMinutes(excerpt)} min</span>
                        </div>
                        <h3>{item.title}</h3>
                        <p>{item.subtitle}</p>
                        <blockquote lang="ja">
                          {excerpt.slice(0, 155)}…
                        </blockquote>
                        <footer>
                          <small>{item.sourceName}</small>
                          <span className="p2-read-here">
                            Read in Bunki <ArrowRight size={15} />
                          </span>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="p2-empty compact">
                  <BookOpen size={22} />
                  <p>
                    No built-in {readingLevel} text matches this shelf yet.
                    Choose a neighboring level or open the live shelf.
                  </p>
                </div>
              )}
            </section>
          ) : null}

          {readingFilter === "all" || readingFilter === "live" ? (
            <section
              className="p2-reading-section p2-live-shelf"
              data-testid="live-library"
            >
              <header>
                <div>
                  <span className="p2-eyebrow">
                    Live library · original publishers
                  </span>
                  <h2>
                    {liveReadings.length.toLocaleString()} current links from{" "}
                    {availableLiveDomains.length.toLocaleString()} active
                    domains
                  </h2>
                </div>
                <Rss size={19} />
              </header>
              {!liveReadingBusy ? (
                <div
                  className={`p2-library-gate ${
                    feedTextReadyCount >= 300 &&
                    availableLiveDomains.length >= 24
                      ? "ready"
                      : "partial"
                  }`}
                >
                  <div>
                    <strong>{feedTextReadyCount.toLocaleString()}</strong>
                    <span>include substantial publisher feed text</span>
                  </div>
                  <div>
                    <strong>
                      {availableLiveDomains.length.toLocaleString()}
                    </strong>
                    <span>active domains</span>
                  </div>
                  <p>
                    {feedTextReadyCount >= 300 &&
                    availableLiveDomains.length >= 24
                      ? "Publisher-text gate met: 300+ readable feed bodies across 24+ active domains."
                      : "This is an honest live index, not a claim that every publisher page has been verified. Bunki checks the full body when you open it."}
                  </p>
                </div>
              ) : null}
              {availableLiveSources.length > 0 ? (
                <div className="p2-live-library-controls">
                  <label>
                    <Search size={14} />
                    <input
                      value={liveSearch}
                      onChange={(event) => {
                        setLiveSearch(event.target.value);
                        setLiveLimit(24);
                      }}
                      placeholder="Search titles, summaries, or publishers"
                    />
                  </label>
                  <label>
                    <span>Publisher</span>
                    <select
                      value={liveDomain}
                      onChange={(event) => {
                        setLiveDomain(event.target.value);
                        setLiveLimit(24);
                      }}
                    >
                      <option value="all">
                        All {availableLiveDomains.length} active domains
                      </option>
                      {availableLiveDomains.map((source) => (
                        <option key={source.domain} value={source.domain}>
                          {source.name} · {source.articleCount}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {liveReadingBusy && liveReadings.length === 0 ? (
                <div className="p2-language-loading">
                  <LoaderCircle className="spin" />
                  <span>Opening dozens of publisher feeds…</span>
                </div>
              ) : filteredLiveReadings.length > 0 ? (
                <>
                  <div className="p2-live-grid">
                    {filteredLiveReadings.slice(0, liveLimit).map((item) => (
                      <article
                        key={item.id}
                        className="p2-openable-reading"
                        aria-busy={articleBusyIds.has(item.id)}
                      >
                        <button
                          className="p2-live-card-main"
                          aria-label={`Read ${item.title} in Bunki Reader`}
                          onClick={() => void importLiveReading(item)}
                        >
                          <div>
                            <span>{item.sourceName}</span>
                            <span>{item.level}</span>
                            <span>
                              {item.readerStatus === "publisher-feed-text"
                                ? "feed text ready"
                                : item.lane}
                            </span>
                          </div>
                          <h3>{item.title}</h3>
                          <p>
                            {item.summary ||
                              "Open the original article or import its readable Japanese text."}
                          </p>
                        </button>
                        <footer>
                          <a href={item.url} target="_blank" rel="noreferrer">
                            Original <ExternalLink size={13} />
                          </a>
                          <button
                            className="p2-read-here"
                            data-testid={`read-live-${item.id}`}
                            onClick={() => void importLiveReading(item)}
                          >
                            {articleBusyIds.has(item.id) ? (
                              <LoaderCircle className="spin" size={14} />
                            ) : (
                              <Newspaper size={14} />
                            )}
                            {articleErrors[item.id]
                              ? "Try again"
                              : "Read in Bunki"}
                          </button>
                        </footer>
                        {articleErrors[item.id] ? (
                          <aside
                            className="p2-article-card-error"
                            role="status"
                          >
                            <CircleAlert size={14} />
                            <span>{articleErrors[item.id]}</span>
                          </aside>
                        ) : null}
                      </article>
                    ))}
                  </div>
                  {filteredLiveReadings.length > liveLimit ? (
                    <button
                      className="p2-load-more"
                      onClick={() => setLiveLimit((current) => current + 24)}
                    >
                      Show 24 more
                      <span>
                        {Math.min(liveLimit, filteredLiveReadings.length)} of{" "}
                        {filteredLiveReadings.length}
                      </span>
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="p2-empty compact">
                  <Rss size={22} />
                  <p>
                    No live article matches this level and publisher filter.
                    Choose N1+ to see every indexed article.
                  </p>
                </div>
              )}
              {liveReadingError ? (
                <div className="p2-inline-error">
                  <CircleAlert size={15} /> {liveReadingError}
                </div>
              ) : null}
              <small className="p2-feed-note">
                Tap anywhere on a card—including its title—to open Bunki Reader.
                Bunki imports the full page when the publisher permits it and
                opens the clearly labelled publisher summary when extraction is
                blocked. It never saves an empty article.
              </small>
            </section>
          ) : null}

          {state.sources.length === 0 ? (
            <section className="p2-reading-section p2-my-threads">
              <header>
                <div>
                  <span className="p2-eyebrow">Your source memory</span>
                  <h2>Add your first source</h2>
                </div>
              </header>
              <div className="p2-empty compact">
                <Link2 size={22} />
                <p>Add an article, transcript, screenshot text, or URL.</p>
                <button
                  className="p2-button"
                  onClick={() => setCaptureOpen(true)}
                >
                  <Plus size={15} /> Add my own
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div
          className={`p2-immerse-layout ${readerSettings.focus ? "focus" : ""} tone-${readerSettings.tone} font-${readerSettings.font}`}
          style={
            {
              "--reader-brightness": `${String(readerSettings.brightness)}%`,
            } as CSSProperties
          }
        >
          <aside className="p2-source-sidebar">
            <div className="p2-source-filter">
              <strong>Source inbox</strong>
              <span>
                {
                  state.sources.filter((source) => source.status === "inbox")
                    .length
                }{" "}
                waiting
              </span>
            </div>
            {state.sources.length === 0 ? (
              <div className="p2-empty compact">
                <Link2 size={22} />
                <p>Save a URL or paste Japanese text.</p>
              </div>
            ) : (
              state.sources.map((source) => (
                <button
                  key={source.id}
                  className={source.id === activeSource?.id ? "active" : ""}
                  onClick={() => {
                    update((previous) => ({
                      ...previous,
                      activeSourceId: source.id,
                    }));
                    setReaderToken(null);
                    setReaderWordDepth(0);
                    setReaderSentence(source.readingSentence);
                    if (source.text) void ensureLanguageTools();
                  }}
                >
                  <span className={`p2-source-state ${source.status}`} />
                  <div>
                    <strong>{source.title}</strong>
                    <small>
                      {source.kind} · {source.status}
                    </small>
                  </div>
                  <span>{Math.round(source.progress)}%</span>
                </button>
              ))
            )}
          </aside>

          <section className="p2-reader-shell" aria-label="Bunki reader">
            {activeSource === null ? (
              <div className="p2-empty hero">
                <BookOpen size={35} />
                <h2>Your first real source starts the weave.</h2>
                <p>
                  Save only a URL while walking, or paste an article or
                  transcript now.
                </p>
                <button
                  className="p2-button primary"
                  onClick={() => setCaptureOpen(true)}
                >
                  Capture a source
                </button>
              </div>
            ) : activeSource.text.trim() === "" ? (
              <Surface className="p2-source-waiting">
                <span className="p2-eyebrow">Saved safely · not analyzed</span>
                <h2>{activeSource.title}</h2>
                <p>{sourceReadiness(activeSource).reason}</p>
                {safeExternalUrl(activeSource.url) ? (
                  <a
                    className="p2-button"
                    href={safeExternalUrl(activeSource.url) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open original <ExternalLink size={16} />
                  </a>
                ) : null}
                {activeSource.kind === "youtube" &&
                activeSource.url.trim() !== "" ? (
                  <button
                    className="p2-button primary"
                    disabled={captionBusy}
                    onClick={() => void importCaptionsForSource(activeSource)}
                  >
                    {captionBusy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    Import public Japanese captions
                  </button>
                ) : null}
                {languageError ? (
                  <div className="p2-inline-error">
                    <CircleAlert size={16} />
                    {languageError}
                  </div>
                ) : null}
                <label className="p2-field">
                  <span>Attach transcript, article text, or existing OCR</span>
                  <textarea
                    rows={12}
                    maxLength={MAX_SOURCE_CHARACTERS}
                    placeholder="Paste Japanese text here…"
                    onBlur={(event) =>
                      updateSourceText(activeSource, event.target.value)
                    }
                  />
                </label>
              </Surface>
            ) : (
              <>
                <div className="p2-reader-toolbar">
                  <div>
                    <span>{activeSource.kind}</span>
                    <strong>{activeSource.title}</strong>
                  </div>
                  <div className="p2-reader-controls">
                    <button
                      onClick={() => returnToReadingShelf()}
                      aria-label="Return to reading shelf"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    {sourceUrlAt(
                      activeSource.url,
                      timestampsBySentence.get(readerAnchor) ?? null,
                    ) ? (
                      <a
                        href={
                          sourceUrlAt(
                            activeSource.url,
                            timestampsBySentence.get(readerAnchor) ?? null,
                          ) ?? undefined
                        }
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open original source"
                      >
                        <ExternalLink size={16} />
                      </a>
                    ) : null}
                    <button
                      className={readerPanelOpen ? "active" : ""}
                      onClick={() => setReaderPanelOpen((current) => !current)}
                      aria-label="Reading appearance"
                      aria-expanded={readerPanelOpen}
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                  </div>
                </div>

                {readerPanelOpen ? (
                  <aside
                    className="p2-reader-appearance"
                    aria-label="Reading appearance"
                  >
                    <header>
                      <div>
                        <span className="p2-eyebrow">Reading atmosphere</span>
                        <strong>Make the page disappear.</strong>
                      </div>
                      <button
                        onClick={() => setReaderPanelOpen(false)}
                        aria-label="Close reading appearance"
                      >
                        <X size={16} />
                      </button>
                    </header>
                    <fieldset>
                      <legend>Mood</legend>
                      <div className="p2-tone-options">
                        {(
                          [
                            ["paper", "Paper"],
                            ["sepia", "Warm"],
                            ["mist", "Mist"],
                            ["night", "Night"],
                          ] as const
                        ).map(([tone, label]) => (
                          <button
                            key={tone}
                            className={
                              readerSettings.tone === tone ? "active" : ""
                            }
                            onClick={() =>
                              setReaderSettings((current) => ({
                                ...current,
                                tone,
                              }))
                            }
                          >
                            <i className={`tone-${tone}`} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>Type</legend>
                      <div className="p2-type-options">
                        <button
                          className={
                            readerSettings.font === "serif" ? "active" : ""
                          }
                          onClick={() =>
                            setReaderSettings((current) => ({
                              ...current,
                              font: "serif",
                            }))
                          }
                        >
                          明朝 · Serif
                        </button>
                        <button
                          className={
                            readerSettings.font === "sans" ? "active" : ""
                          }
                          onClick={() =>
                            setReaderSettings((current) => ({
                              ...current,
                              font: "sans",
                            }))
                          }
                        >
                          ゴシック · Sans
                        </button>
                      </div>
                    </fieldset>
                    <div className="p2-appearance-row">
                      <span>Size</span>
                      <button
                        onClick={() =>
                          setReaderSettings((current) => ({
                            ...current,
                            size: Math.max(16, current.size - 2),
                          }))
                        }
                        aria-label="Decrease text size"
                      >
                        A−
                      </button>
                      <strong>{readerSettings.size}</strong>
                      <button
                        onClick={() =>
                          setReaderSettings((current) => ({
                            ...current,
                            size: Math.min(36, current.size + 2),
                          }))
                        }
                        aria-label="Increase text size"
                      >
                        A+
                      </button>
                    </div>
                    <label className="p2-brightness">
                      <span>Brightness</span>
                      <input
                        type="range"
                        min="82"
                        max="112"
                        step="2"
                        value={readerSettings.brightness}
                        onChange={(event) =>
                          setReaderSettings((current) => ({
                            ...current,
                            brightness: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                    <div className="p2-appearance-actions">
                      <button
                        className={readerSettings.notes ? "active" : ""}
                        onClick={() =>
                          setReaderSettings((current) => ({
                            ...current,
                            notes: !current.notes,
                          }))
                        }
                      >
                        <PenLine size={14} /> Notes
                      </button>
                      <button
                        className={zenMode ? "active" : ""}
                        onClick={() => {
                          setZenMode((current) => !current);
                          setReaderPanelOpen(false);
                        }}
                      >
                        <Sparkles size={14} />{" "}
                        {zenMode ? "Show app" : "Pure Zen"}
                      </button>
                      <button onClick={() => returnToReadingShelf()}>
                        <ArrowLeft size={14} /> Reading shelf
                      </button>
                    </div>
                  </aside>
                ) : null}

                {activeSource.notes.includes("PUBLISHER SUMMARY ONLY") ||
                activeSource.notes.includes("PUBLISHER FEED TEXT") ? (
                  <div className="p2-reader-source-notice" role="status">
                    <CircleAlert size={16} />
                    <div>
                      <strong>
                        {activeSource.notes.includes("PUBLISHER FEED TEXT")
                          ? "Publisher feed text—not the extracted page"
                          : "Publisher summary—not the full article"}
                      </strong>
                      <span>
                        The publisher blocked full-page extraction. You can
                        still read and mine the text it supplied in its feed, or
                        open the original.
                      </span>
                    </div>
                    {safeExternalUrl(activeSource.url) ? (
                      <a
                        href={safeExternalUrl(activeSource.url) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Original <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className="p2-reader-progress">
                  <span
                    style={{ width: `${String(activeSource.progress)}%` }}
                  />
                </div>

                {languageBusy && readerTokens.length === 0 ? (
                  <div className="p2-language-loading" role="status">
                    <LoaderCircle className="spin" />
                    <span>
                      Reading is ready. Word details are still loading…
                    </span>
                  </div>
                ) : languageError ? (
                  <div className="p2-inline-error">
                    <CircleAlert size={17} />
                    {languageError}
                    <button onClick={() => void ensureLanguageTools()}>
                      Retry word details
                    </button>
                  </div>
                ) : null}

                <>
                  {sentences.length > READER_WINDOW_SIZE ? (
                    <nav
                      className="p2-reader-window"
                      aria-label="Transcript pages"
                    >
                      <button
                        disabled={readerWindowStart === 0}
                        onClick={() => {
                          const index = Math.max(
                            0,
                            readerWindowStart - READER_WINDOW_SIZE,
                          );
                          setReaderSentence(index);
                          markSentence(index);
                        }}
                      >
                        <ArrowLeft size={15} /> Earlier
                      </button>
                      <span>
                        Sentences {readerWindowStart + 1}–
                        {Math.min(
                          sentences.length,
                          readerWindowStart + READER_WINDOW_SIZE,
                        )}{" "}
                        of {sentences.length}
                      </span>
                      <button
                        disabled={
                          readerWindowStart + READER_WINDOW_SIZE >=
                          sentences.length
                        }
                        onClick={() => {
                          const index = Math.min(
                            sentences.length - 1,
                            readerWindowStart + READER_WINDOW_SIZE,
                          );
                          setReaderSentence(index);
                          markSentence(index);
                        }}
                      >
                        Later <ArrowRight size={15} />
                      </button>
                    </nav>
                  ) : null}
                  {activeSource.id === "bunki-starter-zero" ? (
                    <section
                      className="p2-kana-chart"
                      aria-labelledby="kana-chart-title"
                    >
                      <header>
                        <div>
                          <span className="p2-eyebrow">
                            Sound chart · not dictionary words
                          </span>
                          <h2 id="kana-chart-title">Hiragana and katakana</h2>
                        </div>
                        <small>Tap a row to hear it.</small>
                      </header>
                      <div>
                        {KANA_STARTER_ROWS.map(
                          ([hiragana, katakana, romaji]) => (
                            <button
                              type="button"
                              key={hiragana}
                              onClick={() =>
                                speakJapanese(
                                  hiragana
                                    .replaceAll(" ", "")
                                    .replaceAll("　", ""),
                                  0.72,
                                )
                              }
                            >
                              <span lang="ja">{hiragana}</span>
                              <span lang="ja">{katakana}</span>
                              <small>{romaji}</small>
                              <Volume2 size={15} aria-hidden="true" />
                            </button>
                          ),
                        )}
                      </div>
                    </section>
                  ) : null}
                  <article
                    className="p2-reader"
                    data-testid="reader-article"
                    lang="ja"
                    style={{
                      fontSize: readerSettings.size,
                      lineHeight: readerSettings.lineHeight,
                    }}
                  >
                    {visibleSentences.map((sentence) => {
                      const sentenceTokens =
                        tokensBySentence.get(sentence.index) ?? [];
                      const active =
                        (readerSentence ?? activeSource.readingSentence) ===
                        sentence.index;
                      return (
                        <section
                          key={sentence.id}
                          className={`p2-sentence ${active ? "active" : ""}`}
                          onClick={() => markSentence(sentence.index)}
                        >
                          <div className="p2-sentence-copy">
                            <p>
                              {sentenceTokens.length > 0
                                ? sentenceTokens.map((token, index) => {
                                    if (!token.entry)
                                      return (
                                        <span
                                          key={`${String(token.position)}-${String(index)}`}
                                        >
                                          {token.surface}
                                        </span>
                                      );
                                    const selected =
                                      readerTokenKey(readerToken) ===
                                      readerTokenKey(token);
                                    const depth = selected
                                      ? readerWordDepth
                                      : 0;
                                    return (
                                      <button
                                        key={`${String(token.position)}-${String(index)}`}
                                        className={`p2-reader-token ${memoryState(state.memories[token.entry.id])} ${token.ambiguous ? "ambiguous" : ""} depth-${String(depth)}`}
                                        aria-label={`${token.surface}. Tap one: reading. Tap two: meaning. Tap three: full dictionary. Tap four: memorize.`}
                                        aria-expanded={depth >= 2}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          advanceReaderWord(
                                            token,
                                            sentence.index,
                                          );
                                        }}
                                      >
                                        {depth >= 1 ||
                                        activeSource.id ===
                                          "bunki-starter-zero" ? (
                                          <ruby>
                                            {token.surface}
                                            <rt>
                                              {token.reading ||
                                                token.entry.reading}
                                            </rt>
                                          </ruby>
                                        ) : (
                                          token.surface
                                        )}
                                        {depth === 2 ? (
                                          <span
                                            className="p2-word-peek"
                                            role="status"
                                          >
                                            <small>
                                              2 / 4 ·{" "}
                                              {token.ambiguous
                                                ? "several possible words"
                                                : token.entry.reading}
                                            </small>
                                            <strong>
                                              {token.ambiguous
                                                ? "Tap again to choose the intended word."
                                                : token.entry.meanings[0]}
                                            </strong>
                                            <em>
                                              Tap again for the full dictionary
                                            </em>
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })
                                : sentence.text}
                            </p>
                            {activeSource.id === "bunki-starter-zero" ? (
                              <span className="p2-sentence-translation">
                                {STARTER_TRANSLATIONS[sentence.index] ?? ""}
                              </span>
                            ) : null}
                          </div>
                          <small>
                            {timestampsBySentence.has(sentence.index)
                              ? `${timestampLabel(timestampsBySentence.get(sentence.index) ?? 0)} · `
                              : ""}
                            {String(sentence.index + 1)}
                          </small>
                        </section>
                      );
                    })}
                  </article>
                </>

                {sentences[readerAnchor] ? (
                  <div className="p2-sentence-actions">
                    <div>
                      <span className="p2-eyebrow">Selected sentence</span>
                      <strong lang="ja">{sentences[readerAnchor].text}</strong>
                    </div>
                    <div>
                      <button
                        onClick={() => markSentenceUnderstood(readerAnchor)}
                      >
                        <Check size={15} /> Understood
                      </button>
                      <button
                        onClick={() => void mineSelectedSentence(readerAnchor)}
                      >
                        <BookMarked size={15} /> Mine
                      </button>
                      <button onClick={() => askAboutSentence(readerAnchor)}>
                        <Bot size={15} /> Explain / ask
                      </button>
                    </div>
                  </div>
                ) : null}

                {readerSettings.notes ? (
                  <label className="p2-source-notes">
                    <span>Source notes</span>
                    <textarea
                      value={activeSource.notes}
                      onChange={(event) =>
                        update((previous) => ({
                          ...previous,
                          sources: previous.sources.map((source) =>
                            source.id === activeSource.id
                              ? { ...source, notes: event.target.value }
                              : source,
                          ),
                        }))
                      }
                      placeholder="What mattered, what was difficult, what you want to revisit…"
                    />
                  </label>
                ) : null}

                <div className="p2-reader-footer">
                  <div>
                    {activeSource.analysis ? (
                      <>
                        <strong>
                          {activeSource.analysis.coverage}% estimated coverage
                        </strong>
                        <span>
                          {activeSource.analysis.knownCount} established ·{" "}
                          {activeSource.analysis.learningCount} learning ·{" "}
                          {activeSource.analysis.unknownCount} unmeasured
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>Not analyzed against your memory yet</strong>
                        <span>
                          Analysis creates proposals, never hidden review debt.
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    className="p2-button primary"
                    onClick={() => void analyzeActiveSource()}
                  >
                    {languageBusy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <WandSparkles size={16} />
                    )}
                    {activeSource.analysis
                      ? "Find useful words again"
                      : "Find useful words"}
                  </button>
                </div>
                {savedReviewCount !== null ? (
                  <div className="p2-reader-saved-confirmation" role="status">
                    <Check size={17} />
                    <span>
                      Saved {savedReviewCount} item
                      {savedReviewCount === 1 ? "" : "s"} for later.
                    </span>
                    <button
                      onClick={() => {
                        setSavedReviewCount(null);
                        setZenMode(false);
                        setView("review");
                      }}
                    >
                      Review now
                    </button>
                    <button onClick={() => setSavedReviewCount(null)}>
                      Keep reading
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {readerToken?.entry && readerWordDepth >= 3 ? (
            <aside
              className="p2-reader-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Word detail for ${readerToken.surface}`}
            >
              <button
                className="p2-sheet-close"
                onClick={closeReaderWord}
                aria-label="Close word detail"
              >
                <X size={18} />
              </button>
              <div
                className="p2-word-depth-guide"
                aria-label="Four word depths"
              >
                <span className="done">1 · reading</span>
                <span className="done">2 · meaning</span>
                <span className={readerWordDepth === 3 ? "active" : "done"}>
                  3 · dictionary
                </span>
                <span className={readerWordDepth === 4 ? "active" : ""}>
                  4 · memorize
                </span>
              </div>
              <span className="p2-eyebrow">
                Full dictionary · exact source occurrence
              </span>
              <div className="p2-sheet-word">
                <small>
                  {readerToken.ambiguous
                    ? "ambiguous kana reading"
                    : readerToken.entry.reading}
                </small>
                <h2
                  className="p2-linked-word-title"
                  aria-label={readerToken.surface}
                >
                  {Array.from(readerToken.surface).map((character, index) => {
                    const kanjiEntry =
                      dictionary?.kanjiByChar.get(character) ?? null;
                    return kanjiEntry ? (
                      <button
                        type="button"
                        key={`${character}-${String(index)}`}
                        aria-label={`Open ${character} kanji from ${readerToken.surface}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openReaderKanji(kanjiEntry, readerToken);
                        }}
                      >
                        {character}
                      </button>
                    ) : (
                      <span key={`${character}-${String(index)}`}>
                        {character}
                      </span>
                    );
                  })}
                </h2>
                {readerToken.ambiguous ? (
                  <span>
                    Choose the intended word below. Bunki will not learn a
                    default.
                  </span>
                ) : readerToken.surface !== readerToken.entry.word ? (
                  <span>dictionary form · {readerToken.entry.word}</span>
                ) : null}
                {!readerToken.ambiguous ? (
                  <button
                    type="button"
                    className="p2-open-full-word"
                    aria-label={`Open full word entry for ${readerToken.entry.word}`}
                    onClick={() => openReaderDictionary(readerToken)}
                  >
                    <Languages size={14} />
                    Open the complete word entry
                    <ChevronRight size={15} />
                  </button>
                ) : null}
              </div>
              {readerToken.ambiguous ? (
                <p>
                  Japanese kana can represent several different written words
                  and meanings.
                </p>
              ) : (
                <ol>
                  {readerToken.entry.meanings.slice(0, 5).map((meaning) => (
                    <li key={meaning}>{meaning}</li>
                  ))}
                </ol>
              )}
              {!readerToken.ambiguous ? (
                <div className="p2-sheet-context">
                  <span>In this sentence</span>
                  <p lang="ja">
                    {sentences[readerAnchor]?.text ?? readerToken.surface}
                  </p>
                </div>
              ) : null}
              {!readerToken.ambiguous && dictionary ? (
                <div className="p2-sheet-kanji">
                  <span className="p2-sheet-kanji-label">
                    Kanji in this word · tap one to open
                  </span>
                  {[...new Set(Array.from(readerToken.entry.word))]
                    .map((character) => dictionary.kanjiByChar.get(character))
                    .filter((entry): entry is KanjiEntry => entry !== undefined)
                    .map((entry) => (
                      <button
                        type="button"
                        key={entry.char}
                        data-kanji-character={entry.char}
                        aria-label={`Open ${entry.char} kanji page`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openReaderKanji(entry, readerToken);
                        }}
                      >
                        <strong>{entry.char}</strong>
                        <span>
                          <b>{entry.meanings.slice(0, 3).join(" · ")}</b>
                          <small>
                            {entry.onyomi.slice(0, 2).join("、") ||
                              entry.kunyomi.slice(0, 2).join("、") ||
                              "reading unavailable"}
                            {" · "}
                            {entry.strokeCount} strokes
                          </small>
                        </span>
                        <ChevronRight aria-hidden="true" size={18} />
                      </button>
                    ))}
                </div>
              ) : null}
              {readerToken.entryCandidates.length > 1 ? (
                <div className="p2-sheet-candidates">
                  <span>
                    {readerToken.ambiguous
                      ? "Choose the intended written word"
                      : "Other possible senses"}
                  </span>
                  {readerToken.entryCandidates
                    .filter(
                      (candidate) =>
                        readerToken.ambiguous ||
                        candidate.id !== readerToken.entry?.id,
                    )
                    .slice(0, readerToken.ambiguous ? 16 : 4)
                    .map((candidate) => (
                      <button
                        key={candidate.id}
                        onClick={() =>
                          setReaderToken((current) =>
                            current === null
                              ? null
                              : {
                                  ...current,
                                  entry: candidate,
                                  ambiguous: false,
                                },
                          )
                        }
                      >
                        <strong>{candidate.word}</strong>
                        <small>
                          {candidate.pos} · {candidate.meanings[0]}
                        </small>
                      </button>
                    ))}
                </div>
              ) : null}
              <div className="p2-sheet-meta">
                <StatusPill
                  state={memoryState(state.memories[readerToken.entry.id])}
                />
                <span>{readerToken.entry.pos}</span>
                {readerToken.entry.jlpt ? (
                  <span>{readerToken.entry.jlpt}</span>
                ) : null}
              </div>
              <div className="p2-sheet-actions">
                <button
                  disabled={readerToken.ambiguous}
                  onClick={() => markTokenUnderstood(readerToken)}
                >
                  <Check size={15} />
                  {readerToken.ambiguous ? "Choose a word first" : "Understood"}
                </button>
                <button
                  className="memorize"
                  disabled={readerToken.ambiguous}
                  onClick={() => {
                    void stageDictionaryEntry(readerToken.entry!, readerToken);
                    closeReaderWord();
                  }}
                >
                  <Star size={15} />
                  {readerWordDepth === 4
                    ? "Choose this for review"
                    : "4 · Memorize"}
                </button>
                <button
                  disabled={readerToken.ambiguous}
                  onClick={() => openReaderDictionary(readerToken)}
                >
                  <Languages size={15} /> Dictionary workspace
                </button>
                <button
                  onClick={() => {
                    setTeacherInput(
                      `「${readerToken.surface}」のこの文での意味とニュアンスを説明してください。`,
                    );
                    closeReaderWord();
                    setView("coach");
                  }}
                >
                  <Bot size={15} /> Ask coach
                </button>
              </div>
              {readerWordDepth === 4 && !readerToken.ambiguous ? (
                <p className="p2-memorize-confirm">
                  Save this word with the exact sentence you are reading. You
                  will still approve the card before it enters review.
                </p>
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );

  const renderReview = (): ReactNode => (
    <div className={`p2-page p2-review ${reviewCard ? "session-active" : ""}`}>
      <header className="p2-page-head">
        <div>
          <span className="p2-eyebrow">Review · 復習</span>
          <h1>Retrieve the thread, not a floating fact.</h1>
          <p>
            FSRS schedules each card; Bunki keeps the source, skill, and reason
            visible.
          </p>
        </div>
        <div className="p2-review-head-actions">
          {state.lastUndo ? (
            <button className="p2-button subtle" onClick={undoReview}>
              <RotateCcw size={16} /> Undo
            </button>
          ) : null}
          <span>{due.length} due now</span>
        </div>
      </header>

      {state.reviewSession === null ||
      state.reviewSession.initialCount === 0 ? (
        <Surface className="p2-review-start">
          {due.length > 0 ? (
            <>
              <ListChecks size={36} />
              <h2>{due.length} cards are at their retrieval edge.</h2>
              <p>
                A frozen session prevents the target from moving while you
                review.
              </p>
              <button className="p2-button primary" onClick={startSession}>
                Start · about{" "}
                {Math.ceil(
                  reviewSessionLimit(state.profile, due.length) * 0.42,
                )}{" "}
                min
              </button>
            </>
          ) : (
            <>
              <Check size={36} />
              <h2>Nothing is due.</h2>
              <p>
                Read a source, admit a staged packet, or continue a
                conversation.
              </p>
              <button className="p2-button" onClick={() => setView("immerse")}>
                Continue immersion
              </button>
            </>
          )}
        </Surface>
      ) : reviewCard === null ? (
        <Surface className="p2-review-finished">
          <Sparkles size={38} />
          <span className="p2-eyebrow">Session complete</span>
          <h2>{reviewProgress.completed} threads retrieved.</h2>
          <p>
            Bunki updated skill evidence separately; one Easy answer did not
            magically make every dimension “known.”
          </p>
          <button
            className="p2-button primary"
            onClick={() => {
              update((previous) => ({ ...previous, reviewSession: null }));
              setZenMode(false);
              setView("today");
            }}
          >
            Return to Today
          </button>
        </Surface>
      ) : (
        <div className="p2-review-stage">
          <button
            className="p2-review-exit"
            onClick={() => {
              setReviewRevealed(false);
              setZenMode(false);
              setView("today");
            }}
          >
            <ArrowLeft size={15} /> Exit review
          </button>
          <div className="p2-session-progress">
            <span>
              {reviewProgress.completed}/{reviewProgress.total}
            </span>
            <div>
              <i style={{ width: `${String(reviewProgress.percent)}%` }} />
            </div>
            <small>
              {reviewCard.skill} · {reviewCard.kind}
            </small>
          </div>
          <Surface
            className={`p2-review-card ${reviewRevealed ? "revealed" : ""}`}
          >
            <button
              className="p2-review-more"
              onClick={() => openCardEditor(reviewCard)}
              aria-label="Card actions"
            >
              <MoreHorizontal size={18} />
            </button>
            <div className="p2-card-prompt" lang="ja">
              <p>{reviewCard.front}</p>
            </div>
            {!reviewRevealed ? (
              <button
                className="p2-button primary p2-show-answer"
                onClick={() => setReviewRevealed(true)}
              >
                Show answer <kbd>space</kbd>
              </button>
            ) : (
              <>
                <div className="p2-card-answer" lang="ja">
                  <p>{reviewCard.back}</p>
                  {reviewCard.note ? (
                    <aside>
                      <Link2 size={14} />
                      {reviewCard.note}
                    </aside>
                  ) : null}
                </div>
                <div className="p2-ratings">
                  {(
                    [
                      [1, "Soon"],
                      [2, "Hard"],
                      [3, "Medium"],
                      [4, "Easy"],
                    ] as const
                  ).map(([rating, label]) => (
                    <button
                      key={rating}
                      onClick={() => void rateReview(rating)}
                    >
                      <kbd>{rating}</kbd>
                      <strong>{label}</strong>
                      <span>{intervalPreviews?.[rating]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Surface>
        </div>
      )}
      <Surface className="p2-card-manager">
        <header>
          <div>
            <span className="p2-eyebrow">Card manager</span>
            <h2>Every learning object stays reachable.</h2>
          </div>
          <span>{state.cards.length} total</span>
        </header>
        <div className="p2-card-manager-tools">
          <label>
            <Search size={16} />
            <input
              value={cardQuery}
              onChange={(event) => setCardQuery(event.target.value)}
              placeholder="Search prompt, answer, concept, or tag"
              aria-label="Search cards"
            />
          </label>
          <div>
            {(["all", "active", "suspended", "leech"] as const).map(
              (filter) => (
                <button
                  key={filter}
                  className={cardFilter === filter ? "active" : ""}
                  onClick={() => setCardFilter(filter)}
                >
                  {filter}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="p2-card-manager-list">
          {managedCards.slice(0, 200).map((card) => {
            const reviewCount = state.reviewEvents.filter(
              (event) => event.cardId === card.id,
            ).length;
            return (
              <article key={card.id}>
                <button
                  className="p2-card-manager-main"
                  onClick={() => openCardEditor(card)}
                >
                  <span>
                    {card.suspended
                      ? "suspended"
                      : card.leech
                        ? "leech"
                        : card.kind}
                  </span>
                  <strong lang="ja">{card.front}</strong>
                  <small>
                    {card.skill} · {reviewCount} recorded review
                    {reviewCount === 1 ? "" : "s"} ·{" "}
                    {card.suspended
                      ? "not scheduled"
                      : `due ${new Date(card.dueAt).toLocaleDateString()}`}
                  </small>
                </button>
                <button
                  onClick={() => suspendCard(card)}
                  aria-label={card.suspended ? "Resume card" : "Suspend card"}
                >
                  {card.suspended ? <Play size={16} /> : <Pause size={16} />}
                </button>
                <button
                  onClick={() => openCardEditor(card)}
                  aria-label="Edit card"
                >
                  <PenLine size={16} />
                </button>
              </article>
            );
          })}
          {managedCards.length === 0 ? (
            <div className="p2-empty compact">
              <p>No cards match this view.</p>
            </div>
          ) : null}
        </div>
      </Surface>
    </div>
  );

  const renderCoach = (): ReactNode => (
    <div className="p2-page p2-coach">
      <header className="p2-page-head">
        <div>
          <span className="p2-eyebrow">Coach · 会話</span>
          <h1>Conversation should change the learning model.</h1>
          <p>
            Live AI uses a bounded learner snapshot; every card remains an
            editable proposal.
          </p>
        </div>
        <div className={`p2-ai-status ${teacherConnection}`}>
          <span />
          {teacherConnection === "live"
            ? "Live AI · GPT-5.6 Terra"
            : teacherConnection === "signin"
              ? "Sign in required"
              : teacherConnection === "not-connected"
                ? "AI server secret not connected"
                : teacherConnection === "offline"
                  ? "Local practice coach"
                  : "Live AI when connected"}
        </div>
      </header>

      <div className="p2-coach-layout">
        <Surface className="p2-conversation">
          <div className="p2-mode-picker">
            {(["conversation", "correct", "explain", "roleplay"] as const).map(
              (mode) => (
                <button
                  key={mode}
                  className={teacherMode === mode ? "active" : ""}
                  onClick={() => setTeacherMode(mode)}
                >
                  {mode}
                </button>
              ),
            )}
          </div>
          <div className="p2-messages" aria-live="polite">
            {state.messages.length === 0 ? (
              <div className="p2-coach-welcome">
                <Bot size={31} />
                <h2>何について話しましょうか。</h2>
                <p>
                  Talk about today’s walk, a source, philosophy, AI, or a phrase
                  you could not quite use.
                </p>
                <div>
                  {[
                    "今日聞いた動画について",
                    "最近の日本語学習",
                    "「文脈」のニュアンス",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setTeacherInput(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              state.messages.map((message) => (
                <article
                  key={message.id}
                  className={`p2-message ${message.role}`}
                >
                  <header>
                    <span>
                      {message.role === "learner"
                        ? state.profile.displayName
                        : "Bunki"}
                    </span>
                    <time>
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </header>
                  <p lang="ja">{message.text}</p>
                  {message.supportEn ? (
                    <small>{message.supportEn}</small>
                  ) : null}
                  {message.corrections.length > 0 ? (
                    <div className="p2-corrections">
                      {message.corrections.map((correction) => (
                        <div
                          key={`${correction.original}-${correction.corrected}`}
                        >
                          <span>
                            {correction.original} →{" "}
                            <strong>{correction.corrected}</strong>
                          </span>
                          <small>{correction.explanation}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {message.whyThisFits ? (
                    <aside>
                      <Brain size={14} />
                      {message.whyThisFits}
                    </aside>
                  ) : null}
                  {message.branches.length > 0 ? (
                    <div className="p2-message-branches">
                      {message.branches.map((branch) => (
                        <button
                          key={branch}
                          onClick={() => setTeacherInput(branch)}
                        >
                          {branch}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
            {teacherBusy ? (
              <div className="p2-teacher-thinking">
                <LoaderCircle className="spin" /> Bunki is listening to the
                thread…
              </div>
            ) : null}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
          {teacherConnection === "signin" ? (
            <a
              className="p2-signin-note"
              href="/signin-with-chatgpt?return_to=%2F"
            >
              Sign in with ChatGPT to use the live teacher. The local coach
              remains available.
            </a>
          ) : teacherConnection === "not-connected" ? (
            <div className="p2-signin-note">
              The live route is implemented, but no production OpenAI secret is
              configured. Replies below are clearly labelled local practice—not
              AI evaluation.
            </div>
          ) : null}
          <form
            className="p2-teacher-composer"
            onSubmit={(event) => void sendTeacher(event)}
          >
            <textarea
              aria-label="Message Bunki in Japanese"
              value={teacherInput}
              onChange={(event) => setTeacherInput(event.target.value)}
              placeholder="日本語で話してみてください…"
              rows={3}
              maxLength={4_000}
            />
            <button
              disabled={teacherBusy || teacherInput.trim() === ""}
              aria-label="Send to coach"
            >
              {teacherBusy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <ArrowRight size={19} />
              )}
            </button>
          </form>
        </Surface>

        <aside className="p2-coach-context">
          <Surface>
            <span className="p2-eyebrow">Current context</span>
            <h3>{activeSource?.title ?? "No active source"}</h3>
            <p>
              {activeSource?.text.slice(0, 180) ||
                "Open an immersion source to ground this conversation."}
            </p>
          </Surface>
          <Surface>
            <span className="p2-eyebrow">Adaptive edge</span>
            {frontier.slice(0, 5).map((item) => (
              <div className="p2-context-item" key={item.conceptId}>
                <StatusPill state={item.state} />
                <strong>
                  {dictionary?.byId.get(item.conceptId)?.word ??
                    item.conceptId.replace("grammar:", "")}
                </strong>
              </div>
            ))}
            {frontier.length === 0 ? <p>No measured frontier yet.</p> : null}
          </Surface>
        </aside>
      </div>
    </div>
  );

  const renderDictionary = (): ReactNode => (
    <div className="p2-library-content">
      {dictionaryReturnContext ? (
        <button
          type="button"
          className="p2-kanji-reader-return p2-dictionary-reader-return"
          onClick={() => {
            restoreReaderLexicalReturn(dictionaryReturnContext);
            setDictionaryReturnContext(null);
          }}
        >
          <ArrowLeft size={16} />
          <span>
            <small>Back to source word</small>
            <strong>{dictionaryReturnContext.word}</strong>
          </span>
        </button>
      ) : null}
      <div className="p2-library-search">
        <Search size={19} />
        <input
          autoFocus
          value={libraryQuery}
          aria-label="Dictionary search"
          onChange={(event) => setLibraryQuery(event.target.value)}
          placeholder="Japanese, kana, romaji, or English…"
        />
        {languageBusy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <kbd>⌘ K</kbd>
        )}
      </div>
      {libraryQuery.trim() === "" ? (
        <div className="p2-empty hero">
          <Languages size={34} />
          <h2>Look up a word without losing its history.</h2>
          <p>
            Search channels keep English, acronyms, romaji, kana, and Japanese
            spelling distinct.
          </p>
        </div>
      ) : (
        <div className="p2-dictionary-layout">
          <div className="p2-result-list">
            {dictionaryResults.map((result) => (
              <button
                key={result.entry.id}
                className={
                  effectiveSelectedWordId === result.entry.id ? "active" : ""
                }
                onClick={() => setSelectedWordId(result.entry.id)}
              >
                <div>
                  <strong>{result.entry.word}</strong>
                  <span>{result.entry.reading}</span>
                </div>
                <p>{result.entry.meanings[0]}</p>
                <small>
                  {result.reason}
                  {result.entry.jlpt ? ` · ${result.entry.jlpt}` : ""}
                </small>
              </button>
            ))}
            {dictionaryResults.length === 0 && !languageBusy ? (
              <div className="p2-empty compact">
                <p>No matching entry.</p>
              </div>
            ) : null}
          </div>
          <DictionaryDetail
            entry={selectedWord}
            state={state}
            onUncertainty={addUncertainty}
            onStage={stageDictionaryEntry}
            onKanji={(character) => {
              if (selectedWord) {
                setKanjiReturnContext({
                  kind: "dictionary",
                  word: selectedWord.word,
                  wordId: selectedWord.id,
                });
              }
              setKanjiQuery(character);
              setLibraryTab("kanji");
              setKanjiFocusMode(true);
              setStrokeReplayKey((current) => current + 1);
              scrollDocumentTo(0);
            }}
            onAsk={(entry) => {
              setTeacherInput(
                `「${entry.word}」の意味、ニュアンス、自然な使い分けを説明してください。`,
              );
              setView("coach");
            }}
          />
        </div>
      )}
    </div>
  );

  const stageKanjiCard = (): void => {
    if (!selectedKanji) return;
    const conceptId = `kanji:${selectedKanji.char}`;
    let sourceContext: {
      readonly source: SourceItem;
      readonly sentence: string;
    } | null = null;
    for (const source of state.sources) {
      const sentence = sentenceSpans(source.text).find((item) =>
        item.text.includes(selectedKanji.char),
      );
      if (sentence) {
        sourceContext = { source, sentence: sentence.text };
        break;
      }
    }
    const proposal: CardProposal = {
      id: uid("kanji-proposal"),
      conceptId,
      sourceId: sourceContext?.source.id ?? null,
      sourceSentence: sourceContext?.sentence ?? "",
      front: `Write the kanji for:\n${selectedKanji.meanings.join(" · ")}\n${selectedKanji.kunyomi[0] ?? selectedKanji.onyomi[0] ?? ""}`,
      back: `${selectedKanji.char}\nOn: ${selectedKanji.onyomi.join("、") || "—"}\nKun: ${selectedKanji.kunyomi.join("、") || "—"}\n${String(selectedKanji.strokeCount)} strokes`,
      reading: [...selectedKanji.onyomi, ...selectedKanji.kunyomi].join("、"),
      note:
        sourceContext === null
          ? "Deliberate kanji writing card."
          : `Met in “${sourceContext.source.title}”: ${sourceContext.sentence}`,
      rationale:
        sourceContext === null
          ? "Deliberate writing practice from the kanji library."
          : "Writing practice anchored to an exact sentence already in your source library.",
      tags: [
        "kanji",
        "writing",
        ...(sourceContext === null
          ? []
          : [`source:${sourceContext.source.id}`]),
      ],
      lineage:
        sourceContext === null
          ? []
          : [
              {
                sourceId: sourceContext.source.id,
                sourceFingerprint: textFingerprint(sourceContext.source.text),
                exactText: sourceContext.sentence,
                role: "target",
                generated: false,
              },
            ],
      kind: "kanji",
      skill: "writing",
      origin: sourceContext === null ? "manual" : "source",
      generated: false,
      selected: true,
    };
    update((previous) => ({
      ...previous,
      stagedPacket: {
        id: uid("packet"),
        sourceId: proposal.sourceId,
        title: `Kanji writing · ${selectedKanji.char}`,
        createdAt: iso(),
        proposals: [proposal],
      },
    }));
  };

  const stageKanjiRecognitionCard = (requestedContext?: {
    readonly source: SourceItem;
    readonly sentence: string;
  }): void => {
    if (!selectedKanji) return;
    let sourceContext = requestedContext ?? null;
    if (sourceContext === null) {
      for (const source of state.sources) {
        const sentence = sentenceSpans(source.text).find((item) =>
          item.text.includes(selectedKanji.char),
        );
        if (sentence) {
          sourceContext = { source, sentence: sentence.text };
          break;
        }
      }
    }
    const conceptId = `kanji:${selectedKanji.char}`;
    const hasSource = sourceContext !== null;
    const source = sourceContext?.source ?? null;
    const sourceSentence = sourceContext?.sentence ?? "";
    const proposal: CardProposal = {
      id: uid("kanji-recognition-proposal"),
      conceptId,
      sourceId: source?.id ?? null,
      sourceSentence,
      front: hasSource
        ? sourceSentence.replaceAll(selectedKanji.char, "＿")
        : selectedKanji.char,
      back: hasSource
        ? `${sourceSentence}\n${selectedKanji.char} — ${selectedKanji.meanings.join(" · ")}\nOn: ${selectedKanji.onyomi.join("、") || "—"} · Kun: ${selectedKanji.kunyomi.join("、") || "—"}`
        : `${selectedKanji.meanings.join(" · ")}\nOn: ${selectedKanji.onyomi.join("、") || "—"}\nKun: ${selectedKanji.kunyomi.join("、") || "—"}`,
      reading: [...selectedKanji.onyomi, ...selectedKanji.kunyomi].join("、"),
      note: hasSource
        ? `Exact encounter from “${source?.title ?? "source"}”.`
        : "Recognition card from the kanji library.",
      rationale: hasSource
        ? "Recognize the kanji inside the exact sentence where you encountered it."
        : "Deliberate kanji recognition practice.",
      tags: [
        "kanji",
        "recognition",
        ...(hasSource
          ? ["sentence-mining", `source:${source?.id ?? "unknown"}`]
          : []),
      ],
      lineage: hasSource
        ? [
            {
              sourceId: source?.id ?? "",
              sourceFingerprint: textFingerprint(source?.text ?? ""),
              exactText: sourceSentence,
              role: "target",
              generated: false,
            },
          ]
        : [],
      kind: hasSource ? "cloze" : "kanji",
      skill: "recognition",
      origin: hasSource ? "source" : "manual",
      generated: false,
      selected: true,
    };
    update((previous) => ({
      ...previous,
      stagedPacket: {
        id: uid("packet"),
        sourceId: proposal.sourceId,
        title: hasSource
          ? `Sentence kanji · ${selectedKanji.char}`
          : `Kanji recognition · ${selectedKanji.char}`,
        createdAt: iso(),
        proposals: [proposal],
      },
    }));
  };

  const markKanjiRecognized = (): void => {
    if (!selectedKanji) return;
    const at = iso();
    const conceptId = `kanji:${selectedKanji.char}`;
    update((previous) => ({
      ...previous,
      memories: {
        ...previous.memories,
        [conceptId]: recordEvidence(previous.memories[conceptId], {
          conceptId,
          kind: "kanji",
          skill: "recognition",
          outcome: "success",
          at,
          sourceId: null,
          contextFingerprint: null,
        }),
      },
    }));
  };

  const renderKanji = (): ReactNode => {
    const returnSource =
      kanjiReturnContext?.kind !== "reader"
        ? null
        : (state.sources.find(
            (source) => source.id === kanjiReturnContext.sourceId,
          ) ?? null);
    const sourceExamples =
      selectedKanji === null
        ? []
        : state.sources.flatMap((source) =>
            sentenceSpans(source.text)
              .filter((sentence) => sentence.text.includes(selectedKanji.char))
              .slice(0, 3)
              .map((sentence) => ({ source, sentence })),
          );
    const compounds =
      dictionary && selectedKanji
        ? [
            ...wordsForKanji(
              dictionary,
              selectedKanji.char,
              dictionary.vocab.length,
            ),
          ].sort((left, right) => {
            const leftMemory = state.memories[left.id];
            const rightMemory = state.memories[right.id];
            if (Boolean(leftMemory) !== Boolean(rightMemory))
              return leftMemory ? -1 : 1;
            if (leftMemory && rightMemory) {
              const recent = rightMemory.lastSeenAt.localeCompare(
                leftMemory.lastSeenAt,
              );
              if (recent !== 0) return recent;
            }
            const levelWeight = (level: string | null): number =>
              level === "N5"
                ? 0
                : level === "N4"
                  ? 1
                  : level === "N3"
                    ? 2
                    : level === "N2"
                      ? 3
                      : level === "N1"
                        ? 4
                        : 5;
            return (
              levelWeight(left.jlpt) - levelWeight(right.jlpt) ||
              left.word.length - right.word.length
            );
          })
        : [];
    return (
      <div className="p2-kanji-page">
        {kanjiReturnContext ? (
          <button
            className="p2-kanji-reader-return"
            onClick={() => {
              if (kanjiReturnContext.kind === "reader") {
                restoreReaderLexicalReturn(kanjiReturnContext);
              } else if (kanjiReturnContext.kind === "dictionary") {
                setLibraryQuery(kanjiReturnContext.word);
                setSelectedWordId(kanjiReturnContext.wordId);
                setLibraryTab("dictionary");
                scrollDocumentTo(0);
              }
              setKanjiFocusMode(false);
              setKanjiReturnContext(null);
            }}
          >
            <ArrowLeft size={16} />
            <span>
              <small>
                {kanjiReturnContext.kind === "reader"
                  ? "Back to source word"
                  : "Back to word"}
              </small>
              <strong>
                {kanjiReturnContext.word}
                {returnSource ? ` · ${returnSource.title}` : ""}
              </strong>
            </span>
          </button>
        ) : null}
        <div className="p2-library-search compact-search">
          <Search size={18} />
          <input
            aria-label="Kanji lookup"
            value={kanjiQuery}
            onChange={(event) => setKanjiQuery(event.target.value)}
            maxLength={4}
            placeholder="Enter one kanji"
          />
        </div>
        {selectedKanji ? (
          <div className="p2-kanji-grid">
            <Surface className="p2-kanji-main">
              <span className="p2-eyebrow">Jōyō kanji thread</span>
              <div className="p2-kanji-heading">
                <button
                  type="button"
                  className="p2-kanji-stroke-replay"
                  onClick={() => setStrokeReplayKey((current) => current + 1)}
                  aria-label={`Replay stroke order for ${selectedKanji.char}`}
                >
                  <KanjiStrokeGlyph
                    key={`${selectedKanji.char}-${String(strokeReplayKey)}`}
                    entry={selectedKanji}
                  />
                  <span>
                    <RotateCcw size={13} /> Tap to replay stroke order
                  </span>
                </button>
                <div>
                  <h2>{selectedKanji.char}</h2>
                  <span>
                    {selectedKanji.strokeCount} indexed strokes
                    {selectedKanji.strokes.length !== selectedKanji.strokeCount
                      ? ` · ${String(selectedKanji.strokes.length)} SVG paths`
                      : ""}
                    {" · "}grade {selectedKanji.grade ?? "—"} ·{" "}
                    {selectedKanji.jlpt ?? "unmapped"}
                  </span>
                </div>
              </div>
              <div className="p2-kanji-readings">
                <div>
                  <span>Meaning</span>
                  <strong>{selectedKanji.meanings.join(" · ")}</strong>
                </div>
                <div>
                  <span>On</span>
                  <strong>{selectedKanji.onyomi.join("、") || "—"}</strong>
                </div>
                <div>
                  <span>Kun</span>
                  <strong>{selectedKanji.kunyomi.join("、") || "—"}</strong>
                </div>
              </div>
              <p className="p2-honesty-note">
                <ShieldCheck size={14} /> School-grade mappings can support
                KanKen 10–5 orientation. This Jōyō dataset does not claim KanKen
                1 completeness.
              </p>
              <div className="p2-kanji-actions">
                <button className="p2-button primary" onClick={stageKanjiCard}>
                  <BookMarked size={15} /> Add writing card
                </button>
                <button
                  className="p2-button"
                  onClick={() => stageKanjiRecognitionCard()}
                >
                  <Star size={15} /> Add recognition card
                </button>
                <button className="p2-button" onClick={markKanjiRecognized}>
                  <Check size={15} /> I recognize this
                </button>
                <StatusPill
                  state={memoryState(
                    state.memories[`kanji:${selectedKanji.char}`],
                  )}
                />
              </div>
            </Surface>
            <Surface className="p2-handwriting">
              <div className="p2-section-title">
                <div>
                  <span className="p2-eyebrow">Writing self-check</span>
                  <h3>Trace, then compare</h3>
                </div>
                <PenLine size={20} />
              </div>
              <div className="p2-canvas-wrap">
                <span className={drawingEmpty ? "" : "faint"}>
                  {selectedKanji.char}
                </span>
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`Handwriting practice canvas for ${selectedKanji.char}`}
                  tabIndex={0}
                  width={320}
                  height={320}
                  onPointerDown={startDrawing}
                  onPointerMove={continueDrawing}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                />
              </div>
              <button className="p2-button subtle" onClick={clearDrawing}>
                <RotateCcw size={15} /> Clear
              </button>
              <small>
                This is a visual self-check, not handwriting recognition.
              </small>
            </Surface>
            <Surface className="p2-kanji-words">
              <div className="p2-section-title">
                <div>
                  <span className="p2-eyebrow">Vocabulary</span>
                  <h3>Encountered first</h3>
                </div>
                <BookMarked size={20} />
              </div>
              <div>
                {compounds.slice(0, 24).map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      if (kanjiReturnContext?.kind === "reader") {
                        setDictionaryReturnContext(kanjiReturnContext);
                      }
                      setLibraryQuery(entry.word);
                      setSelectedWordId(entry.id);
                      setLibraryTab("dictionary");
                      setKanjiFocusMode(false);
                      setKanjiReturnContext(null);
                      scrollDocumentTo(0);
                    }}
                  >
                    <strong>{entry.word}</strong>
                    <span>{entry.reading}</span>
                    <small>{entry.meanings[0]}</small>
                    <StatusPill state={memoryState(state.memories[entry.id])} />
                  </button>
                ))}
              </div>
            </Surface>
            {sourceExamples.length > 0 ? (
              <Surface className="p2-kanji-examples">
                <div className="p2-section-title">
                  <div>
                    <span className="p2-eyebrow">
                      Examples from your immersion
                    </span>
                    <h3>This kanji in living context</h3>
                  </div>
                  <BookOpen size={20} />
                </div>
                <div>
                  {sourceExamples.slice(0, 8).map(({ source, sentence }) => (
                    <article key={`${source.id}-${sentence.id}`}>
                      <strong lang="ja">{sentence.text}</strong>
                      <span>{source.title}</span>
                      <div>
                        <button
                          onClick={() =>
                            stageKanjiRecognitionCard({
                              source,
                              sentence: sentence.text,
                            })
                          }
                        >
                          <Star size={14} /> Mine sentence
                        </button>
                        <button
                          onClick={() => {
                            rememberReaderOrigin();
                            update((previous) => ({
                              ...previous,
                              activeSourceId: source.id,
                            }));
                            setReaderSentence(sentence.index);
                            setImmerseMode("reader");
                            setView("immerse");
                            setZenMode(true);
                            setKanjiFocusMode(false);
                            setKanjiReturnContext(null);
                          }}
                        >
                          Open in reader <ChevronRight size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </Surface>
            ) : null}
          </div>
        ) : (
          <div className="p2-empty hero">
            <PenLine size={34} />
            <h2>Enter one kanji.</h2>
          </div>
        )}
      </div>
    );
  };

  const renderGrammar = (): ReactNode => (
    <div className="p2-grammar-page">
      <div className="p2-library-search">
        <Search size={18} />
        <input
          aria-label="Grammar search"
          value={grammarQuery}
          onChange={(event) => setGrammarQuery(event.target.value)}
          placeholder="Pattern, meaning, formation, or level…"
        />
        <span>{GRAMMAR_PATTERNS.length} practical patterns</span>
      </div>
      <p className="p2-honesty-note">
        <ShieldCheck size={14} /> JLPT does not publish a canonical grammar
        inventory. Levels here are editorial estimates, not a completeness
        claim.
      </p>
      <div className="p2-grammar-grid">
        {grammarResults.map((pattern) => (
          <Surface key={pattern.id} className="p2-grammar-card">
            <header>
              <span>{pattern.level}</span>
              <StatusPill
                state={memoryState(state.memories[`grammar:${pattern.id}`])}
              />
            </header>
            <h3>{pattern.pattern}</h3>
            <strong>{pattern.meaning}</strong>
            <p>{pattern.formation}</p>
            <blockquote lang="ja">
              {pattern.example}
              <small>{pattern.translation}</small>
            </blockquote>
            {pattern.contrast ? (
              <aside>
                <b>Contrast</b>
                {pattern.contrast}
              </aside>
            ) : null}
            {pattern.pitfall ? (
              <aside>
                <b>Watch</b>
                {pattern.pitfall}
              </aside>
            ) : null}
            <button
              className="p2-text-link"
              onClick={() => {
                setTeacherInput(
                  `${pattern.pattern}を使った自然な会話練習をしてください。`,
                );
                setView("coach");
              }}
            >
              Practice with coach <ArrowRight size={14} />
            </button>
          </Surface>
        ))}
      </div>
    </div>
  );

  const renderMemory = (): ReactNode => (
    <div className="p2-memory-page">
      <div className="p2-memory-overview">
        <Surface>
          <strong>{Object.keys(state.memories).length}</strong>
          <span>measured concepts</span>
        </Surface>
        <Surface>
          <strong>{summary.established}</strong>
          <span>established across evidence</span>
        </Surface>
        <Surface>
          <strong>{summary.fragile}</strong>
          <span>fragile threads</span>
        </Surface>
        <Surface>
          <strong>{state.sources.length}</strong>
          <span>source lineages</span>
        </Surface>
      </div>
      <div className="p2-export-row">
        <div>
          <span className="p2-eyebrow">Your data</span>
          <h2>Portable, inspectable, yours.</h2>
        </div>
        <button className="p2-button" onClick={exportState}>
          <Download size={16} /> JSON
        </button>
        <label className="p2-button p2-restore-button">
          <Upload size={16} /> Restore JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void restoreState(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button className="p2-button" onClick={exportTsv}>
          <Download size={16} /> Anki TSV
        </button>
      </div>
      {restoreError ? (
        <div className="p2-restore-status" role="status">
          {restoreError}
        </div>
      ) : null}
      <Surface className="p2-memory-table">
        <header>
          <span>Concept</span>
          <span>Evidence</span>
          <span>Lineage</span>
          <span>State</span>
        </header>
        {Object.values(state.memories)
          .sort(
            (left, right) =>
              Number(right.conceptId === state.selectedConceptId) -
                Number(left.conceptId === state.selectedConceptId) ||
              right.lastSeenAt.localeCompare(left.lastSeenAt),
          )
          .slice(0, 120)
          .map((memory) => {
            const entry = dictionary?.byId.get(memory.conceptId);
            return (
              <button
                className={
                  memory.conceptId === state.selectedConceptId ? "active" : ""
                }
                key={memory.conceptId}
                onClick={() => {
                  update((previous) => ({
                    ...previous,
                    selectedConceptId: memory.conceptId,
                  }));
                  if (entry) {
                    setSelectedWordId(entry.id);
                    setLibraryQuery(entry.word);
                    setLibraryTab("dictionary");
                  }
                }}
              >
                <span>
                  <strong>
                    {entry?.word ?? memory.conceptId.replace("grammar:", "")}
                  </strong>
                  <small>{entry?.reading ?? memory.kind}</small>
                </span>
                <span>
                  {memory.reviewCount} attempts · {memory.exposures} encounters
                </span>
                <span>
                  {memory.sourceIds.length} source
                  {memory.sourceIds.length === 1 ? "" : "s"}
                </span>
                <StatusPill state={memoryState(memory)} />
              </button>
            );
          })}
      </Surface>
    </div>
  );

  const renderLibrary = (): ReactNode => (
    <div className="p2-page p2-library">
      <header className="p2-page-head">
        <div>
          <span className="p2-eyebrow">Library · 辞典</span>
          <h1>Look up, connect, and deliberately learn.</h1>
          <p>
            Dictionary volume is infrastructure. Bunki adds ranking, memory,
            lineage, kanji, grammar, and staged study.
          </p>
        </div>
      </header>
      <nav className="p2-library-tabs">
        {(
          [
            ["dictionary", "Dictionary", Languages],
            ["kanji", "Kanji", PenLine],
            ["grammar", "Grammar", FileText],
            ["memory", "Memory", Brain],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={libraryTab === id ? "active" : ""}
            onClick={() => setLibraryTab(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      {libraryTab === "dictionary"
        ? renderDictionary()
        : libraryTab === "kanji"
          ? renderKanji()
          : libraryTab === "grammar"
            ? renderGrammar()
            : renderMemory()}
    </div>
  );

  const renderView = (): ReactNode =>
    view === "today"
      ? renderToday()
      : view === "immerse"
        ? renderImmerse()
        : view === "review"
          ? renderReview()
          : view === "coach"
            ? renderCoach()
            : renderLibrary();
  const accountChanged =
    syncConflict?.paths.includes("account.syncScope:RELOAD") ?? false;
  const cloudUnavailable =
    syncConflict?.paths.includes("cloud.unavailable:RELOAD") ?? false;
  const syncNeedsReload = accountChanged || cloudUnavailable;
  const cloudBodyUnavailableWithoutLocal =
    syncConflict?.paths.includes("cloud.MISSING_SOURCE_BODY:NO_LOCAL") ?? false;
  const deviceImportAvailable =
    syncConflict?.paths.includes("scope.importDevice") ?? false;

  return (
    <main
      className={`p2-app ${hydrated ? "ready" : "hydrating"} ${zenMode ? "zen" : ""} ${kanjiFocusMode ? "kanji-focus" : ""}`}
      aria-busy={!hydrated}
      inert={!hydrated}
    >
      <aside className={`p2-sidebar ${mobileMenu ? "open" : ""}`}>
        <Phase2Brand />
        <button
          className="p2-mobile-close"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <nav>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => {
                  closeReaderWord();
                  setView(item.id);
                  if (item.id === "immerse") setImmerseMode("discover");
                  setMobileMenu(false);
                }}
              >
                <Icon size={19} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.japanese}</small>
                </span>
                {item.id === "review" && due.length > 0 ? (
                  <em>{due.length}</em>
                ) : null}
              </button>
            );
          })}
        </nav>
        <button className="p2-profile" onClick={() => setOnboardingStep(1)}>
          <span>
            {state.profile.currentLevel === "zero"
              ? "始"
              : state.profile.currentLevel}
          </span>
          <div>
            <strong>{state.profile.displayName}</strong>
            <small>{state.profile.target}</small>
          </div>
          <ChevronRight size={16} />
        </button>
        <div className={`p2-sync ${syncStatus}`}>
          {syncStatus === "saving" || syncStatus === "loading" ? (
            <LoaderCircle className="spin" size={14} />
          ) : syncStatus === "saved" ? (
            <Check size={14} />
          ) : syncStatus === "conflict" ? (
            <RefreshCw size={14} />
          ) : syncStatus === "not-saved" ? (
            <CircleAlert size={14} />
          ) : (
            <Pause size={14} />
          )}
          <span>
            {syncStatus === "saved"
              ? "Personal state saved"
              : syncStatus === "saving"
                ? "Saving…"
                : syncStatus === "loading"
                  ? "Loading your state…"
                  : syncStatus === "conflict"
                    ? "Sync needs your choice"
                    : syncStatus === "not-saved"
                      ? "Changes not safely stored"
                      : "Saved on this device"}
          </span>
        </div>
      </aside>
      {mobileMenu ? (
        <button
          className="p2-nav-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation"
        />
      ) : null}

      <section className="p2-main">
        <header className="p2-topbar">
          <button
            className="p2-menu"
            onClick={() => setMobileMenu(true)}
            aria-label="Open navigation"
            aria-expanded={mobileMenu}
          >
            <Menu size={21} />
          </button>
          <Phase2Brand />
          <button
            aria-label="Look up Japanese"
            className="p2-command-search"
            onClick={() => {
              closeReaderWord();
              setLibraryTab("dictionary");
              setView("library");
            }}
          >
            <Search size={17} />
            <span>Look up Japanese…</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="p2-zen-trigger"
            onClick={() => setZenMode(true)}
            aria-label="Enter Zen mode"
          >
            <Sparkles size={16} /> Zen
          </button>
          <button
            className="p2-button primary p2-capture-button"
            onClick={() => setCaptureOpen(true)}
            disabled={cloudBodyUnavailableWithoutLocal}
          >
            <Plus size={17} /> Capture
          </button>
        </header>
        {syncConflict ? (
          <section className="p2-sync-conflict" role="alert">
            <div>
              <CircleAlert size={18} />
              <p>
                <strong>
                  {accountChanged
                    ? "The signed-in account changed."
                    : cloudUnavailable
                      ? "Bunki could not verify the cloud copy."
                      : cloudBodyUnavailableWithoutLocal
                        ? "A cloud source body needs recovery."
                        : deviceImportAvailable
                          ? "Device work is separate from this account."
                          : "Two places changed the same learning data."}
                </strong>{" "}
                {accountChanged
                  ? "Bunki blocked the old account’s data from being written into the new one."
                  : cloudUnavailable
                    ? "Your device copy remains intact and cloud saving is paused until the account state can be checked."
                    : cloudBodyUnavailableWithoutLocal
                      ? "Bunki left the cloud manifest untouched and blocked new saves because no exact matching source body is available in this account’s device store."
                      : deviceImportAvailable
                        ? "Choose explicitly whether to keep the account copy or import the anonymous device work."
                        : "Bunki paused cloud saving instead of guessing. Your device copy remains intact."}
              </p>
            </div>
            <span>
              {syncConflict.paths.slice(0, 3).join(" · ")}
              {syncConflict.paths.length > 3
                ? ` · +${String(syncConflict.paths.length - 3)} more`
                : ""}
            </span>
            <div>
              {syncNeedsReload || cloudBodyUnavailableWithoutLocal ? (
                <button
                  className="p2-button primary"
                  onClick={() => window.location.reload()}
                >
                  Reload correct account
                </button>
              ) : (
                <>
                  <button className="p2-button" onClick={exportState}>
                    Export device JSON
                  </button>
                  <button
                    className="p2-button"
                    onClick={resolveConflictWithCloud}
                  >
                    {deviceImportAvailable
                      ? "Use account copy"
                      : "Use cloud copy"}
                  </button>
                  <button
                    className="p2-button primary"
                    onClick={resolveConflictWithDevice}
                  >
                    {deviceImportAvailable
                      ? "Import device work"
                      : "Keep this device"}
                  </button>
                </>
              )}
            </div>
          </section>
        ) : syncStatus === "not-saved" ? (
          <section className="p2-save-alert" role="alert">
            <CircleAlert size={17} />
            Bunki could not safely store the latest change on this device. Keep
            this tab open and retry after freeing browser storage.
          </section>
        ) : null}
        {cloudBodyUnavailableWithoutLocal ? (
          <section className="p2-page">
            <Surface className="p2-empty">
              <ShieldCheck size={24} />
              <h2>The saved manifest is intact.</h2>
              <p>
                Bunki will not open a partial library or replace it with a blank
                one. Reload after the source-body service recovers, or restore a
                verified device export.
              </p>
            </Surface>
          </section>
        ) : (
          renderView()
        )}
        <footer className="p2-footer">
          <span>Bunki Phase 2 · source-driven adaptive alpha</span>
          <p>
            JMdict/KANJIDIC2 © EDRDG, CC BY-SA 4.0 · KanjiVG CC BY-SA 3.0 ·
            Kuromoji Apache 2.0. JLPT levels are editorial estimates. Generated
            material is marked.
          </p>
        </footer>
      </section>

      {zenMode && view === "immerse" && immerseMode === "reader" ? (
        <button
          className="p2-zen-back"
          onClick={() => returnToReadingShelf()}
          aria-label="Back to reading shelf"
        >
          <ArrowLeft size={17} />
          <span>Back</span>
        </button>
      ) : null}

      {zenMode ? (
        <button
          className="p2-zen-dock"
          onClick={() => {
            if (view === "immerse" && immerseMode === "reader") {
              setReaderPanelOpen((current) => !current);
              return;
            }
            setZenMode(false);
          }}
          aria-label={
            view === "immerse" && immerseMode === "reader"
              ? "Reading appearance"
              : "Leave focus mode"
          }
        >
          {view === "immerse" && immerseMode === "reader" ? (
            <SlidersHorizontal size={15} />
          ) : (
            <Minimize2 size={16} />
          )}
          <span>
            {view === "immerse" && immerseMode === "reader"
              ? "Appearance"
              : "Leave focus"}
          </span>
        </button>
      ) : null}

      <button
        className="p2-mobile-capture"
        onClick={() => setCaptureOpen(true)}
        aria-label="Capture a source"
      >
        <Plus size={21} />
      </button>
      <nav className="p2-mobile-nav" aria-label="Primary navigation">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => {
                closeReaderWord();
                setView(item.id);
                if (item.id === "immerse") setImmerseMode("discover");
              }}
            >
              <Icon size={20} />
              <span>{item.label}</span>
              {item.id === "review" && due.length > 0 ? (
                <em>{due.length}</em>
              ) : null}
            </button>
          );
        })}
      </nav>

      {!state.profile.onboardingComplete || onboardingStep > 0 ? (
        <Onboarding
          step={onboardingStep === 0 ? 1 : onboardingStep}
          profile={state.profile}
          onStep={setOnboardingStep}
          onLevel={chooseLevel}
          onPlacement={choosePlacement}
          onInterest={toggleInterest}
          onProfile={(profile) =>
            update((previous) => ({ ...previous, profile }))
          }
          onFinish={finishOnboarding}
          canClose={state.profile.onboardingComplete}
          onClose={() => setOnboardingStep(0)}
        />
      ) : null}

      {captureOpen ? (
        <div
          className="p2-modal-backdrop"
          onMouseDown={() => setCaptureOpen(false)}
        >
          <form
            className="p2-modal p2-capture-modal"
            onSubmit={saveCapture}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-title"
          >
            <header>
              <div>
                <span className="p2-eyebrow">Walking capture</span>
                <h2 id="capture-title">Save now. Process later.</h2>
              </div>
              <button
                type="button"
                onClick={() => setCaptureOpen(false)}
                aria-label="Close capture"
              >
                <X size={20} />
              </button>
            </header>
            <p>
              The fast path is one pasted URL and Save. Nothing enters SRS until
              you approve a packet.
            </p>
            <label className="p2-field">
              <span>URL</span>
              <input
                autoFocus
                value={captureUrl}
                onChange={(event) => {
                  setCaptureUrl(event.target.value);
                  if (/(?:youtube\.com|youtu\.be)/i.test(event.target.value))
                    setCaptureKind("youtube");
                }}
                placeholder="https://youtube.com/…"
              />
            </label>
            <label className="p2-field">
              <span>Optional title</span>
              <input
                value={captureTitle}
                onChange={(event) => setCaptureTitle(event.target.value)}
                placeholder="Today’s walk · AI philosophy video"
              />
            </label>
            <button
              type="button"
              className="p2-disclosure"
              onClick={() => setCaptureAdvanced((current) => !current)}
              aria-expanded={captureAdvanced}
            >
              <ChevronDown size={16} />
              {captureAdvanced
                ? "Hide text and source options"
                : "Add transcript, captions, or text now"}
            </button>
            {captureAdvanced ? (
              <div className="p2-capture-advanced">
                <div className="p2-kind-grid">
                  {SOURCE_KINDS.map((kind) => (
                    <button
                      type="button"
                      key={kind.id}
                      className={captureKind === kind.id ? "active" : ""}
                      onClick={() => setCaptureKind(kind.id)}
                    >
                      {kind.label}
                    </button>
                  ))}
                </div>
                {captureKind === "youtube" && captureUrl.trim() !== "" ? (
                  <button
                    type="button"
                    className="p2-button"
                    disabled={captionBusy}
                    onClick={() => void fetchCaptions()}
                  >
                    {captionBusy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Download size={16} />
                    )}{" "}
                    Import public captions
                  </button>
                ) : null}
                <label className="p2-file-button">
                  <Upload size={16} />
                  <span>Load .txt, .srt, .vtt, or .md</span>
                  <input
                    type="file"
                    accept=".txt,.srt,.vtt,.md,text/plain"
                    onChange={(event) =>
                      void loadTextFile(event.target.files?.[0])
                    }
                  />
                </label>
                <label className="p2-field">
                  <span>Transcript, article text, or existing OCR</span>
                  <textarea
                    value={captureText}
                    onChange={(event) => {
                      setCaptureText(event.target.value);
                      setCaptureSegments([]);
                    }}
                    rows={10}
                    maxLength={MAX_SOURCE_CHARACTERS}
                    placeholder="Timestamps are cleaned when you save…"
                  />
                  <small>
                    {captureText.length.toLocaleString()} /{" "}
                    {MAX_SOURCE_CHARACTERS.toLocaleString()} characters
                  </small>
                </label>
                <small className="p2-honesty-note">
                  <ShieldCheck size={14} /> Public captions depend on YouTube
                  availability. Automatic OCR, protected-media scraping, and
                  audio transcription are not silently simulated.
                </small>
              </div>
            ) : null}
            {captureError ? (
              <div className="p2-inline-error">
                <CircleAlert size={16} />
                {captureError}
              </div>
            ) : null}
            <button
              className="p2-button primary wide"
              disabled={
                captureUrl.trim() === "" &&
                captureTitle.trim() === "" &&
                captureText.trim() === ""
              }
            >
              {captureText.trim() === ""
                ? "Save to inbox"
                : "Save and open reader"}
            </button>
          </form>
        </div>
      ) : null}

      {state.stagedPacket ? (
        <PacketDrawer
          packet={state.stagedPacket}
          onToggle={toggleProposal}
          onEdit={editProposal}
          onClose={() =>
            update((previous) => ({ ...previous, stagedPacket: null }))
          }
          onAdmit={admitPacket}
          duplicate={(proposal) => hasEquivalentCard(state, proposal)}
        />
      ) : null}

      {editingCard ? (
        <div
          className="p2-modal-backdrop"
          onMouseDown={() => setEditingCard(null)}
        >
          <form
            className="p2-modal"
            onSubmit={saveCardEdit}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-card-title"
          >
            <header>
              <div>
                <span className="p2-eyebrow">Card lifecycle</span>
                <h2 id="edit-card-title">Repair the learning object</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </header>
            <label className="p2-field">
              <span>Front</span>
              <textarea
                rows={4}
                required
                maxLength={MAX_CARD_FRONT_CHARACTERS}
                aria-invalid={
                  cardEditError !== null && editingCard.front.trim() === ""
                }
                value={editingCard.front}
                onChange={(event) => {
                  setCardEditError(null);
                  setEditingCard({
                    ...editingCard,
                    front: event.target.value.slice(
                      0,
                      MAX_CARD_FRONT_CHARACTERS,
                    ),
                  });
                }}
              />
            </label>
            <label className="p2-field">
              <span>Back</span>
              <textarea
                rows={6}
                required
                maxLength={MAX_CARD_BACK_CHARACTERS}
                aria-invalid={
                  cardEditError !== null && editingCard.back.trim() === ""
                }
                value={editingCard.back}
                onChange={(event) => {
                  setCardEditError(null);
                  setEditingCard({
                    ...editingCard,
                    back: event.target.value.slice(0, MAX_CARD_BACK_CHARACTERS),
                  });
                }}
              />
            </label>
            <label className="p2-field">
              <span>Note</span>
              <textarea
                rows={3}
                maxLength={MAX_CARD_NOTE_CHARACTERS}
                value={editingCard.note}
                onChange={(event) => {
                  setCardEditError(null);
                  setEditingCard({
                    ...editingCard,
                    note: event.target.value.slice(0, MAX_CARD_NOTE_CHARACTERS),
                  });
                }}
              />
            </label>
            {cardEditError ? (
              <div className="p2-inline-error" role="alert">
                <CircleAlert size={16} />
                {cardEditError}
              </div>
            ) : null}
            <div className="p2-modal-actions">
              <button
                type="button"
                className="p2-button"
                onClick={() => {
                  suspendCard(editingCard);
                  setEditingCard(null);
                }}
              >
                {editingCard.suspended ? (
                  <Play size={15} />
                ) : (
                  <Pause size={15} />
                )}
                {editingCard.suspended ? "Resume" : "Suspend"}
              </button>
              <button
                type="button"
                className="p2-button danger"
                onClick={() => {
                  deleteCard(editingCard);
                  setEditingCard(null);
                }}
              >
                <Trash2 size={15} /> Delete
              </button>
              <button className="p2-button primary">
                <Check size={15} /> Save changes
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function Onboarding({
  step,
  profile,
  onStep,
  onLevel,
  onPlacement,
  onInterest,
  onProfile,
  onFinish,
  canClose,
  onClose,
}: {
  readonly step: number;
  readonly profile: LearnerProfile;
  readonly onStep: (step: number) => void;
  readonly onLevel: (level: Level) => void;
  readonly onPlacement: (level: Level) => void;
  readonly onInterest: (interest: string) => void;
  readonly onProfile: (profile: LearnerProfile) => void;
  readonly onFinish: () => void;
  readonly canClose: boolean;
  readonly onClose: () => void;
}) {
  return (
    <div className="p2-modal-backdrop p2-onboarding-backdrop">
      <section
        className="p2-onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <header>
          <Phase2Brand />
          <div className="p2-step-dots">
            {[1, 2, 3, 4].map((value) => (
              <span key={value} className={value <= step ? "active" : ""} />
            ))}
          </div>
          {canClose ? (
            <button onClick={onClose} aria-label="Close learning edge">
              <X size={20} />
            </button>
          ) : null}
        </header>
        {step === 1 ? (
          <div className="p2-onboarding-page">
            <span className="p2-eyebrow">1 · Your experience</span>
            <h1 id="onboarding-title">Where should Bunki begin?</h1>
            <p>
              This is a starting assumption, not a claim that you “know N2.”
              Review evidence will replace it.
            </p>
            <div className="p2-level-grid">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  className={profile.currentLevel === level ? "active" : ""}
                  onClick={() => onLevel(level)}
                >
                  <strong>{level === "zero" ? "From zero" : level}</strong>
                  <span>
                    {level === "zero"
                      ? "Kana, translation, tiny packets"
                      : level === "N1+"
                        ? "Nuance, literature, KanKen stretch"
                        : `${level} provisional edge`}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="p2-button primary p2-onboarding-next"
              onClick={() => onStep(2)}
            >
              Continue <ArrowRight size={17} />
            </button>
          </div>
        ) : step === 2 ? (
          <div className="p2-onboarding-page">
            <span className="p2-eyebrow">2 · Provisional placement</span>
            <h1>Choose the hardest sentence you understand comfortably.</h1>
            <p>
              You may also keep “from zero.” This five-sentence check changes
              scaffolding and packet size.
            </p>
            <div className="p2-placement-list">
              {PLACEMENT.map((item) => (
                <button
                  key={item.level}
                  className={
                    profile.currentLevel === item.level ? "active" : ""
                  }
                  onClick={() => onPlacement(item.level)}
                >
                  <span>{item.level}</span>
                  <strong lang="ja">{item.sentence}</strong>
                  <small>{item.meaning}</small>
                </button>
              ))}
            </div>
            <div className="p2-onboarding-nav">
              <button className="p2-button subtle" onClick={() => onStep(1)}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="p2-button primary" onClick={() => onStep(3)}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : step === 3 ? (
          <div className="p2-onboarding-page">
            <span className="p2-eyebrow">3 · Your Japanese world</span>
            <h1>What should the language attach itself to?</h1>
            <p>
              These interests help Bunki choose examples and immersion starting
              points.
            </p>
            <div className="p2-interest-grid">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  className={
                    profile.interests.includes(interest) ? "active" : ""
                  }
                  onClick={() => onInterest(interest)}
                >
                  <Check size={15} />
                  {interest}
                </button>
              ))}
            </div>
            <label className="p2-field">
              <span>Daily time · minutes</span>
              <input
                type="number"
                min={5}
                max={480}
                value={profile.dailyMinutes}
                onChange={(event) =>
                  onProfile({
                    ...profile,
                    dailyMinutes: Math.max(
                      5,
                      Math.min(480, Number(event.target.value) || 5),
                    ),
                  })
                }
              />
            </label>
            <div className="p2-onboarding-nav">
              <button className="p2-button subtle" onClick={() => onStep(2)}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="p2-button primary" onClick={() => onStep(4)}>
                Build my path <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="p2-onboarding-page p2-plan-preview">
            <span className="p2-eyebrow">4 · Your first plan</span>
            <h1>One thread, calibrated to {profile.currentLevel}.</h1>
            <div className="p2-plan-card">
              <div>
                <span>Scaffolding</span>
                <strong>
                  {profile.currentLevel === "zero" ||
                  profile.currentLevel === "N5"
                    ? "Furigana + English support"
                    : profile.currentLevel === "N2" ||
                        profile.currentLevel === "N1" ||
                        profile.currentLevel === "N1+"
                      ? "Authentic sources + nuance"
                      : "Selective furigana + source reading"}
                </strong>
              </div>
              <div>
                <span>New concepts</span>
                <strong>
                  {profile.currentLevel === "zero" ||
                  profile.currentLevel === "N5"
                    ? "Maximum 3 per packet"
                    : profile.currentLevel === "N4" ||
                        profile.currentLevel === "N3"
                      ? "Maximum 5 per packet"
                      : "Maximum 7 per packet"}
                </strong>
              </div>
              <div>
                <span>Daily time</span>
                <strong>{profile.dailyMinutes} minutes</strong>
              </div>
              <div>
                <span>Target</span>
                <strong>{profile.targetLevel}</strong>
              </div>
            </div>
            <p className="p2-honesty-note">
              <ShieldCheck size={14} /> This is provisional. Bunki will change
              it from actual encounters and reviews—not a fake percentage.
            </p>
            <div className="p2-onboarding-nav">
              <button className="p2-button subtle" onClick={() => onStep(3)}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="p2-button primary" onClick={onFinish}>
                Enter Bunki <Sparkles size={17} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function PacketDrawer({
  packet,
  onToggle,
  onEdit,
  onClose,
  onAdmit,
  duplicate,
}: {
  readonly packet: NonNullable<Phase2State["stagedPacket"]>;
  readonly onToggle: (id: string) => void;
  readonly onEdit: (
    id: string,
    field: "front" | "back" | "note",
    value: string,
  ) => void;
  readonly onClose: () => void;
  readonly onAdmit: () => void;
  readonly duplicate: (proposal: CardProposal) => boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const selected = packet.proposals.filter(
    (proposal) => proposal.selected && !duplicate(proposal),
  ).length;
  return (
    <div className="p2-drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="p2-packet-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="packet-title"
      >
        <header>
          <div>
            <span className="p2-eyebrow">Choose what is worth remembering</span>
            <h2 id="packet-title">{packet.title}</h2>
            <p>
              Bunki found {packet.proposals.length} useful item
              {packet.proposals.length === 1 ? "" : "s"}. Three or fewer are
              selected by default. Nothing is saved until you confirm.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close suggestions">
            <X size={20} />
          </button>
        </header>
        <button
          className="p2-packet-advanced-toggle"
          onClick={() => setAdvanced((current) => !current)}
          aria-expanded={advanced}
        >
          <SlidersHorizontal size={15} />
          {advanced ? "Hide card editing" : "Advanced · edit card wording"}
        </button>
        <div className="p2-proposal-list">
          {packet.proposals.map((proposal) => {
            const isDuplicate = duplicate(proposal);
            return (
              <article
                key={proposal.id}
                className={`${proposal.selected ? "selected" : ""} ${isDuplicate ? "duplicate" : ""}`}
              >
                <button
                  className="p2-proposal-check"
                  onClick={() => onToggle(proposal.id)}
                  disabled={isDuplicate}
                  aria-label={
                    proposal.selected
                      ? "Do not save this item"
                      : "Save this item"
                  }
                >
                  {proposal.selected && !isDuplicate ? (
                    <Check size={16} />
                  ) : null}
                </button>
                <div className="p2-proposal-main">
                  <header>
                    <StatusPill
                      state={
                        proposal.tags.includes("fragile")
                          ? "fragile"
                          : proposal.tags.includes("learning")
                            ? "learning"
                            : "unseen"
                      }
                    />
                    <span>
                      {proposal.kind === "grammar"
                        ? "grammar"
                        : proposal.kind === "kanji"
                          ? "kanji"
                          : "word in context"}
                    </span>
                  </header>
                  <strong className="p2-proposal-answer">
                    {proposal.back.split("\n")[0]}
                  </strong>
                  <p className="p2-proposal-source" lang="ja">
                    {proposal.sourceSentence}
                  </p>
                  {advanced ? (
                    <div className="p2-proposal-advanced">
                      <label>
                        <span>Front</span>
                        <textarea
                          rows={3}
                          value={proposal.front}
                          onChange={(event) =>
                            onEdit(proposal.id, "front", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Back</span>
                        <textarea
                          rows={4}
                          value={proposal.back}
                          onChange={(event) =>
                            onEdit(proposal.id, "back", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Connection note</span>
                        <textarea
                          rows={2}
                          value={proposal.note}
                          onChange={(event) =>
                            onEdit(proposal.id, "note", event.target.value)
                          }
                          placeholder="Optional mnemonic, nuance, or earlier-source connection…"
                        />
                      </label>
                    </div>
                  ) : null}
                  <small>
                    <Brain size={13} />
                    {isDuplicate
                      ? "This is already in your review list."
                      : proposal.rationale}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
        <footer>
          <span>{selected} selected · you can change this</span>
          <button
            className="p2-button primary"
            disabled={selected === 0}
            onClick={onAdmit}
          >
            Save {selected} for later <ArrowRight size={16} />
          </button>
        </footer>
      </aside>
    </div>
  );
}

function DictionaryDetail({
  entry,
  state,
  onUncertainty,
  onStage,
  onKanji,
  onAsk,
}: {
  readonly entry: VocabEntry | null;
  readonly state: Phase2State;
  readonly onUncertainty: (entry: VocabEntry, uncertainty: string) => void;
  readonly onStage: (entry: VocabEntry) => void | Promise<void>;
  readonly onKanji: (character: string) => void;
  readonly onAsk: (entry: VocabEntry) => void;
}) {
  if (entry === null)
    return (
      <div className="p2-empty compact p2-dictionary-empty">
        <BookMarked size={27} />
        <p>
          Select an entry to see senses, memory, source occurrences, and
          learning actions.
        </p>
      </div>
    );
  const memory = state.memories[entry.id];
  const occurrences = contextsForConcept(state, entry.id, 5);
  return (
    <Surface className="p2-dictionary-detail">
      <div className="p2-word-heading">
        <div>
          <span>{entry.reading}</span>
          <h2 className="p2-linked-word-title" aria-label={entry.word}>
            {Array.from(entry.word).map((character, index) =>
              entry.containsKanji.includes(character) ? (
                <button
                  type="button"
                  key={`${character}-${String(index)}`}
                  aria-label={`Open ${character} kanji from ${entry.word}`}
                  onClick={() => onKanji(character)}
                >
                  {character}
                </button>
              ) : (
                <span key={`${character}-${String(index)}`}>{character}</span>
              ),
            )}
          </h2>
          {entry.altWord ? <small>{entry.altWord}</small> : null}
        </div>
        <button
          onClick={() => speakJapanese(entry.word)}
          aria-label={`Play ${entry.word}`}
        >
          <Volume2 size={20} />
        </button>
      </div>
      <div className="p2-word-meta">
        <span>{entry.pos}</span>
        {entry.jlpt ? <span>{entry.jlpt} estimate</span> : null}
        <StatusPill state={memoryState(memory)} />
      </div>
      <ol className="p2-senses">
        {entry.meanings.slice(0, 10).map((meaning) => (
          <li key={meaning}>{meaning}</li>
        ))}
      </ol>
      {entry.containsKanji.length > 0 ? (
        <div className="p2-kanji-links">
          <span>Kanji</span>
          {entry.containsKanji.map((character) => (
            <button
              type="button"
              key={character}
              aria-label={`Open ${character} kanji page`}
              onClick={() => onKanji(character)}
            >
              {character}
            </button>
          ))}
        </div>
      ) : null}
      <div className="p2-uncertainties">
        <span>What is uncertain?</span>
        {[
          "meaning",
          "reading",
          "usage",
          "nuance",
          "kanji",
          "pronunciation",
        ].map((item) => (
          <button
            key={item}
            className={memory?.uncertainties.includes(item) ? "active" : ""}
            onClick={() => onUncertainty(entry, item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="p2-source-occurrences">
        <span>Seen in your sources</span>
        {occurrences.length > 0 ? (
          occurrences.slice(0, 5).map(({ source, sentence }) => (
            <blockquote key={source.id}>
              <strong>{source.title}</strong>
              <p>{sentence}</p>
            </blockquote>
          ))
        ) : (
          <p>Not yet encountered in an imported source.</p>
        )}
      </div>
      <div className="p2-detail-actions">
        <button
          className="p2-button primary"
          onClick={() => void onStage(entry)}
        >
          <Star size={16} /> Stage a card
        </button>
        <button className="p2-button" onClick={() => onAsk(entry)}>
          <Bot size={16} /> Ask coach
        </button>
      </div>
      <p className="p2-honesty-note">
        <ShieldCheck size={13} /> Sense ranking uses available spelling,
        reading, English-match, and level evidence. This packaged corpus does
        not include full JMdict priority, pitch accent, or licensed native
        audio.
      </p>
    </Surface>
  );
}

function KanjiStrokeGlyph({ entry }: { readonly entry: KanjiEntry }) {
  return (
    <svg
      className="p2-kanji-glyph"
      viewBox="0 0 109 109"
      role="img"
      aria-label={`${entry.char}, ${String(entry.strokeCount)} indexed strokes${entry.strokes.length === entry.strokeCount ? "" : `, ${String(entry.strokes.length)} SVG paths in the drawing dataset`}`}
    >
      <g className="p2-kanji-guide">
        <rect x="5" y="5" width="99" height="99" />
        <line x1="54.5" y1="5" x2="54.5" y2="104" />
        <line x1="5" y1="54.5" x2="104" y2="54.5" />
      </g>
      <g className="p2-kanji-strokes">
        {entry.strokes.map((path, index) => (
          <path
            key={`${entry.id}-${String(index)}`}
            d={path}
            style={{ animationDelay: `${String(index * 0.1)}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
