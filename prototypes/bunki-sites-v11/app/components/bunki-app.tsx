"use client";

import {
  Archive,
  BookOpen,
  Bot,
  Brain,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  FileText,
  Flame,
  Headphones,
  Home,
  Languages,
  Library,
  Link2,
  ListPlus,
  LoaderCircle,
  Menu,
  MessageCircleMore,
  Network,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Sprout,
  Star,
  Upload,
  Video,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  entriesNearLevel,
  loadDictionary,
  searchDictionary,
  wordsForKanji,
  type DictionaryIndex,
} from "../lib/dictionary";
import {
  PRACTICE_VARIANTS_PER_ENTRY,
  practiceExamples,
} from "../lib/examples";
import {
  grammarInText,
  searchGrammar,
  type GrammarPattern,
} from "../lib/grammar";
import { INITIAL_STATE } from "../lib/initial-state";
import { newFsrsState, rateCard } from "../lib/scheduler";
import { buildTeacherTurn } from "../lib/teacher";
import {
  cleanTranscript,
  loadJapaneseTokenizer,
  tokenizeJapanese,
  type JapaneseTokenizer,
} from "../lib/tokenize";
import type {
  ChatMessage,
  KanjiEntry,
  LearnerState,
  LearningStatus,
  ReviewCard,
  SourceItem,
  SourceKind,
  ViewId,
  VocabEntry,
} from "../lib/types";

const NAV_ITEMS: readonly {
  id: ViewId;
  label: string;
  japanese: string;
  icon: LucideIcon;
}[] = [
  { id: "today", label: "Today", japanese: "今日", icon: Home },
  { id: "dictionary", label: "Dictionary", japanese: "辞書", icon: Languages },
  { id: "reader", label: "Reader", japanese: "読む", icon: BookOpen },
  { id: "sources", label: "Sources", japanese: "素材", icon: Archive },
  { id: "teacher", label: "Teacher", japanese: "対話", icon: MessageCircleMore },
  { id: "review", label: "Practice", japanese: "復習", icon: Brain },
  { id: "kanji", label: "Kanji", japanese: "漢字", icon: Flame },
  { id: "map", label: "Map", japanese: "地図", icon: Network },
];

const SOURCE_KINDS: readonly { value: SourceKind; label: string; icon: LucideIcon }[] = [
  { value: "article", label: "Article", icon: FileText },
  { value: "youtube", label: "YouTube", icon: Video },
  { value: "podcast", label: "Podcast", icon: Headphones },
  { value: "screenshot", label: "Screenshot text", icon: Upload },
  { value: "book", label: "Book / Kindle", icon: Library },
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "conversation", label: "Conversation", icon: MessageCircleMore },
  { value: "manual", label: "Manual paste", icon: Plus },
];

const STATUS_COPY: Record<LearningStatus, string> = {
  seen: "Seen",
  kept: "Keep",
  learning: "Learn",
  known: "Known",
  fragile: "Fragile",
};

const MINING_STOPWORDS = new Set([
  "ある",
  "いる",
  "する",
  "なる",
  "ない",
  "こと",
  "もの",
  "これ",
  "それ",
  "ため",
  "よう",
  "そう",
  "です",
  "ます",
  "れる",
  "られる",
]);

const LEVELS = ["zero", "N5", "N4", "N3", "N2", "N1", "N1+"] as const;
const LEVEL_RANK: Record<(typeof LEVELS)[number], number> = {
  zero: 0,
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
  "N1+": 6,
};

const INTEREST_RECOMMENDATIONS = [
  {
    title: "青空文庫",
    detail: "Original Japanese literature · long-form reading",
    level: "N2 → N1+",
    href: "https://www.aozora.gr.jp/index.html",
    reason: "Dense, authentic prose for your long-range N1 and KanKen path.",
  },
  {
    title: "NHK ONE らじるらじる",
    detail: "News, culture, philosophy, and talk radio",
    level: "N3 → N1+",
    href: "https://www.nhk.or.jp/radio/",
    reason: "High-volume listening while walking, with varied registers.",
  },
  {
    title: "NHK NEWS WEB EASY",
    detail: "Short current articles with reading support",
    level: "N5 → N3",
    href: "https://www3.nhk.or.jp/news/easy/",
    reason: "A calm entry point when a source is too dense to mine efficiently.",
  },
] as const;

const nowIso = (): string => new Date().toISOString();
const INITIAL_CLOCK = Date.now();
const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatDue = (iso: string): string => {
  const date = new Date(iso);
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "due now";
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `in ${String(minutes)}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${String(hours)}h`;
  return `in ${String(Math.ceil(hours / 24))}d`;
};

function deepInitialState(): LearnerState {
  return JSON.parse(JSON.stringify(INITIAL_STATE)) as LearnerState;
}

function boundedSourceContext(
  text: string,
  terms: readonly string[],
  limit = 420,
): string | undefined {
  const units = text
    .split(/(?<=[。！？!?])|\n+/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const match = units.find((unit) => terms.some((term) => term !== "" && unit.includes(term)));
  if (match === undefined) return undefined;
  if (match.length <= limit) return match;
  const index = Math.max(
    0,
    ...terms.map((term) => (term === "" ? -1 : match.indexOf(term))),
  );
  const start = Math.max(0, index - Math.floor(limit / 3));
  const excerpt = match.slice(start, start + limit);
  return `${start > 0 ? "…" : ""}${excerpt}${start + limit < match.length ? "…" : ""}`;
}

function speakJapanese(text: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function sourceIcon(kind: SourceKind): LucideIcon {
  return SOURCE_KINDS.find((item) => item.value === kind)?.icon ?? FileText;
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function makeCard(input: {
  vocabId?: string | null;
  sourceId?: string | null;
  conceptId?: string | null;
  front: string;
  back: string;
  context: string;
  kind?: ReviewCard["kind"];
}): ReviewCard {
  const createdAt = nowIso();
  return {
    id: uid("card"),
    vocabId: input.vocabId ?? null,
    sourceId: input.sourceId ?? null,
    conceptId: input.conceptId ?? null,
    front: input.front,
    back: input.back,
    context: input.context,
    kind: input.kind ?? "sentence",
    createdAt,
    dueAt: createdAt,
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
    lastReviewedAt: null,
    fsrs: newFsrsState(new Date(createdAt)),
  };
}

function Panel({
  children,
  className = "",
  title,
  eyebrow,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      {title || eyebrow || action ? (
        <div className="panel-head">
          <div>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const safe = Math.min(100, Math.max(0, value));
  return (
    <div
      className="progress-ring"
      style={{ "--progress": `${String(safe * 3.6)}deg` } as CSSProperties}
      aria-label={`${label}: ${String(safe)} percent`}
    >
      <span>{safe}%</span>
      <small>{label}</small>
    </div>
  );
}

export function BunkiApp(): ReactNode {
  const [view, setView] = useState<ViewId>("today");
  const [mobileNav, setMobileNav] = useState(false);
  const [state, setState] = useState<LearnerState>(deepInitialState);
  const [dictionary, setDictionary] = useState<DictionaryIndex | null>(null);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [tokenizer, setTokenizer] = useState<JapaneseTokenizer | null>(null);
  const [tokenizerError, setTokenizerError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<"loading" | "saved" | "saving" | "offline">(
    "loading",
  );
  const [query, setQuery] = useState("分岐");
  const [readerDraft, setReaderDraft] = useState(
    () => INITIAL_STATE.sources[0]?.text ?? "",
  );
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourceKindDraft, setSourceKindDraft] = useState<SourceKind>("youtube");
  const [sourceTitleDraft, setSourceTitleDraft] = useState("");
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourceTextDraft, setSourceTextDraft] = useState("");
  const [captionState, setCaptionState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [teacherInput, setTeacherInput] = useState("");
  const [suggestedCard, setSuggestedCard] = useState<{
    front: string;
    back: string;
    vocabId: string | null;
    sourceId: string | null;
    context: string;
  } | null>(null);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [kanjiQuery, setKanjiQuery] = useState("岐");
  const [kanjiReplay, setKanjiReplay] = useState(0);
  const [readerFontSize, setReaderFontSize] = useState(22);
  const [profileOpen, setProfileOpen] = useState(false);
  const [clock, setClock] = useState(INITIAL_CLOCK);
  const saveGeneration = useRef(0);

  useEffect(() => {
    void loadDictionary()
      .then(setDictionary)
      .catch((error: unknown) =>
        setDictionaryError(error instanceof Error ? error.message : "Dictionary unavailable."),
      );
  }, []);

  useEffect(() => {
    void loadJapaneseTokenizer()
      .then(setTokenizer)
      .catch((error: unknown) =>
        setTokenizerError(
          error instanceof Error
            ? error.message
            : "The Japanese morphology engine is unavailable.",
        ),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const localEnvelope = (() => {
      const currentRaw = window.localStorage.getItem("bunki-alpha-state-v2");
      if (currentRaw !== null) {
        try {
          return JSON.parse(currentRaw) as {
            state: LearnerState;
            updatedAt: string;
          };
        } catch {
          // Fall through to the first-alpha migration key.
        }
      }
      const legacyRaw = window.localStorage.getItem("bunki-alpha-state-v1");
      if (legacyRaw === null) return null;
      try {
        return {
          state: JSON.parse(legacyRaw) as LearnerState,
          updatedAt: "1970-01-01T00:00:00.000Z",
        };
      } catch {
        return null;
      }
    })();

    void fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("cloud state unavailable");
        return response.json() as Promise<{
          state: LearnerState | null;
          updatedAt: string | null;
        }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const localIsNewer =
          localEnvelope !== null &&
          (payload.updatedAt === null ||
            new Date(localEnvelope.updatedAt).getTime() >
              new Date(payload.updatedAt).getTime());
        const resolved = localIsNewer
          ? localEnvelope.state
          : payload.state ?? localEnvelope?.state ?? deepInitialState();
        setState(resolved);
        setReaderDraft(
          resolved.sources.find((source) => source.id === resolved.activeSourceId)?.text ??
            resolved.sources[0]?.text ??
            "",
        );
        setSyncState("saved");
      })
      .catch(() => {
        if (cancelled) return;
        const resolved = localEnvelope?.state ?? deepInitialState();
        setState(resolved);
        setReaderDraft(
          resolved.sources.find((source) => source.id === resolved.activeSourceId)?.text ??
            resolved.sources[0]?.text ??
            "",
        );
        setSyncState("offline");
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const generation = saveGeneration.current + 1;
    saveGeneration.current = generation;
    const updatedAt = nowIso();
    try {
      window.localStorage.setItem(
        "bunki-alpha-state-v2",
        JSON.stringify({ state, updatedAt }),
      );
    } catch {
      // Cloud persistence still runs when the browser's local quota is full.
    }

    const timer = window.setTimeout(() => {
      setSyncState("saving");
      void fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, updatedAt }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("save failed");
          const result = (await response.json()) as {
            saved?: boolean;
            localOnly?: boolean;
          };
          if (saveGeneration.current === generation)
            setSyncState(result.localOnly ? "offline" : "saved");
        })
        .catch(() => {
          if (saveGeneration.current === generation) setSyncState("offline");
        });
    }, 550);

    return () => window.clearTimeout(timer);
  }, [hydrated, state]);

  const activeSource =
    state.sources.find((source) => source.id === state.activeSourceId) ?? state.sources[0] ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const searchResults = useMemo(
    () => (dictionary === null ? [] : searchDictionary(dictionary, query)),
    [dictionary, query],
  );

  const selectedEntry =
    dictionary === null || state.selectedVocabId === null
      ? null
      : (dictionary.byId.get(state.selectedVocabId) ?? null);

  const selectedKanjiEntry =
    dictionary === null
      ? null
      : (dictionary.kanjiByChar.get(state.selectedKanji ?? kanjiQuery.trim().slice(0, 1)) ?? null);

  const readerTokens = useMemo(
    () =>
      dictionary === null || readerDraft.trim() === ""
        ? []
        : tokenizer === null
          ? []
          : tokenizeJapanese(readerDraft, dictionary, tokenizer),
    [dictionary, readerDraft, tokenizer],
  );
  const grammarResults = useMemo(() => searchGrammar(query, 8), [query]);
  const detectedGrammar = useMemo(
    () => grammarInText(readerDraft).slice(0, 8),
    [readerDraft],
  );

  const memories = Object.values(state.memories);
  const dueCards = state.cards
    .filter((card) => new Date(card.dueAt).getTime() <= clock)
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const currentCard = dueCards[0] ?? null;
  const keptCount = memories.filter((memory) => memory.status === "kept").length;
  const learningCount = memories.filter((memory) => memory.status === "learning").length;
  const knownCount = memories.filter((memory) => memory.status === "known").length;
  const fragileCount = memories.filter((memory) => memory.status === "fragile").length;

  const updateState = useCallback((updater: (previous: LearnerState) => LearnerState) => {
    setState(updater);
  }, []);

  const openNewSource = useCallback(() => {
    setEditingSourceId(null);
    setSourceKindDraft("youtube");
    setSourceTitleDraft("");
    setSourceUrlDraft("");
    setSourceTextDraft("");
    setCaptionState("idle");
    setCaptionError(null);
    setSourceFormOpen(true);
  }, []);

  const openSourceEditor = useCallback((source: SourceItem) => {
    setEditingSourceId(source.id);
    setSourceKindDraft(source.kind);
    setSourceTitleDraft(source.title);
    setSourceUrlDraft(source.url);
    setSourceTextDraft(source.text);
    setCaptionState("idle");
    setCaptionError(null);
    setSourceFormOpen(true);
  }, []);

  const closeSourceForm = useCallback(() => {
    setSourceFormOpen(false);
    setEditingSourceId(null);
  }, []);

  const fetchYouTubeCaptions = useCallback(() => {
    if (sourceUrlDraft.trim() === "") return;
    setCaptionState("loading");
    setCaptionError(null);
    void fetch("/api/youtube-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrlDraft }),
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          title?: string;
          text?: string;
          error?: string;
        };
        if (!response.ok || result.text === undefined)
          throw new Error(result.error ?? "Captions are unavailable.");
        setSourceTextDraft(result.text);
        if (sourceTitleDraft.trim() === "" && result.title)
          setSourceTitleDraft(result.title);
        setCaptionState("loaded");
      })
      .catch((error: unknown) => {
        setCaptionState("error");
        setCaptionError(
          error instanceof Error ? error.message : "Captions are unavailable.",
        );
      });
  }, [sourceTitleDraft, sourceUrlDraft]);

  const selectEntry = useCallback(
    (entry: VocabEntry, sourceId: string | null = null, openDictionary = false) => {
      const at = nowIso();
      updateState((previous) => {
        const existing = previous.memories[entry.id];
        const sourceIds = new Set(existing?.sourceIds ?? []);
        if (sourceId !== null) sourceIds.add(sourceId);
        return {
          ...previous,
          selectedVocabId: entry.id,
          memories: {
            ...previous.memories,
            [entry.id]: {
              vocabId: entry.id,
              status: existing?.status ?? "seen",
              firstSeenAt: existing?.firstSeenAt ?? at,
              lastSeenAt: at,
              lookups: (existing?.lookups ?? 0) + 1,
              sourceIds: [...sourceIds],
              uncertainty: existing?.uncertainty ?? [],
            },
          },
        };
      });
      setQuery(entry.word);
      if (openDictionary) setView("dictionary");
    },
    [updateState],
  );

  const setLearningStatus = useCallback(
    (entry: VocabEntry, status: LearningStatus) => {
      const at = nowIso();
      updateState((previous) => {
        const existing = previous.memories[entry.id];
        return {
          ...previous,
          selectedVocabId: entry.id,
          memories: {
            ...previous.memories,
            [entry.id]: {
              vocabId: entry.id,
              status,
              firstSeenAt: existing?.firstSeenAt ?? at,
              lastSeenAt: at,
              lookups: Math.max(existing?.lookups ?? 0, 1),
              sourceIds: existing?.sourceIds ?? [],
              uncertainty: existing?.uncertainty ?? [],
            },
          },
        };
      });
    },
    [updateState],
  );

  const addCard = useCallback(
    (card: ReviewCard) => {
      setClock(new Date().getTime());
      updateState((previous) => {
        const duplicate = previous.cards.some(
          (existing) => existing.front === card.front && existing.back === card.back,
        );
        if (duplicate) return previous;
        const at = nowIso();
        const existingConcept =
          card.conceptId === null || card.conceptId === undefined
            ? null
            : previous.conceptMemories?.[card.conceptId];
        return {
          ...previous,
          cards: [card, ...previous.cards],
          conceptMemories:
            card.conceptId === null || card.conceptId === undefined
              ? previous.conceptMemories
              : {
                  ...previous.conceptMemories,
                  [card.conceptId]: {
                    conceptId: card.conceptId,
                    status: existingConcept?.status ?? "learning",
                    reviews: existingConcept?.reviews ?? 0,
                    lastSeenAt: at,
                    sourceIds: [
                      ...new Set([
                        ...(existingConcept?.sourceIds ?? []),
                        ...(card.sourceId === null ? [] : [card.sourceId]),
                      ]),
                    ],
                  },
                },
        };
      });
    },
    [updateState],
  );

  const mineEntry = useCallback(
    (entry: VocabEntry, source: SourceItem | null = activeSource) => {
      setClock(new Date().getTime());
      const sentence =
        source === null
          ? undefined
          : boundedSourceContext(
              source.text,
              [entry.word, entry.altWord ?? ""],
            );
      const lineageSource = sentence === undefined ? null : source;
      const matchedSurface =
        sentence === undefined
          ? entry.word
          : [entry.word, entry.altWord ?? ""].find(
              (surface) => surface !== "" && sentence.includes(surface),
            ) ?? entry.word;
      const card = makeCard({
        vocabId: entry.id,
        sourceId: lineageSource?.id ?? null,
        front:
          sentence === undefined
            ? `「${entry.word}」を使って、最近の学びについて一文作る。`
            : sentence.replace(matchedSurface, "＿＿"),
        back:
          sentence === undefined
            ? `${entry.word}（${entry.reading}）— ${entry.meanings.slice(0, 3).join("; ")}`
            : `${entry.word}（${entry.reading}）— ${entry.meanings.slice(0, 3).join("; ")}\n${sentence}`,
        context:
          lineageSource === null
            ? "Recent lookup · active production prompt"
            : `${lineageSource.title} · exact source sentence`,
        kind: sentence === undefined ? "production" : "cloze",
      });
      const at = nowIso();
      updateState((previous) => {
        const existing = previous.memories[entry.id];
        const sourceIds = new Set(existing?.sourceIds ?? []);
        if (lineageSource !== null) sourceIds.add(lineageSource.id);
        const duplicate = previous.cards.some(
          (existingCard) =>
            existingCard.front === card.front && existingCard.back === card.back,
        );
        return {
          ...previous,
          selectedVocabId: entry.id,
          memories: {
            ...previous.memories,
            [entry.id]: {
              vocabId: entry.id,
              status: "learning",
              firstSeenAt: existing?.firstSeenAt ?? at,
              lastSeenAt: at,
              lookups: Math.max(existing?.lookups ?? 0, 1),
              sourceIds: [...sourceIds],
              uncertainty: existing?.uncertainty ?? [],
            },
          },
          cards: duplicate ? previous.cards : [card, ...previous.cards],
          sources:
            lineageSource === null
              ? previous.sources
              : previous.sources.map((item) =>
                  item.id === lineageSource.id
                    ? {
                        ...item,
                        capturedVocabIds: [
                          ...new Set([...item.capturedVocabIds, entry.id]),
                        ],
                      }
                    : item,
                ),
        };
      });
    },
    [activeSource, updateState],
  );

  const mineGrammar = useCallback(
    (pattern: GrammarPattern, source: SourceItem | null = activeSource) => {
      const sentence =
        source === null
          ? undefined
          : boundedSourceContext(source.text, pattern.cues);
      addCard(
        makeCard({
          sourceId: sentence === undefined ? null : source?.id ?? null,
          conceptId: `grammar:${pattern.id}`,
          front:
            sentence === undefined
              ? `${pattern.pattern} を使って、自分の学習について一文作る。`
              : `この文で ${pattern.pattern} はどう働いている？\n${sentence}`,
          back: `${pattern.meaning}\n${pattern.formation}\n${pattern.example}\n${pattern.translation}`,
          context:
            sentence === undefined
              ? `${pattern.level} grammar · production`
              : `${source?.title ?? "Source"} · source grammar`,
          kind: "grammar",
        }),
      );
    },
    [activeSource, addCard],
  );

  const mineReaderEdge = useCallback(() => {
    if (dictionary === null || activeSource === null) return;
    const unique = new Map<string, { entry: VocabEntry; order: number }>();
    for (const [order, token] of readerTokens.entries()) {
      if (token.entry === null) continue;
      if (
        MINING_STOPWORDS.has(token.entry.word) ||
        token.entry.word.length < 2 ||
        /(particle|auxiliary|conjunction|pronoun|copula)/i.test(token.entry.pos)
      )
        continue;
      const memory = state.memories[token.entry.id];
      if (memory?.status === "known") continue;
      if (!unique.has(token.entry.id))
        unique.set(token.entry.id, { entry: token.entry, order });
    }
    const targetRank = Math.min(
      5,
      Math.max(1, LEVEL_RANK[state.profile.currentLevel]),
    );
    const ranked = [...unique.values()]
      .sort((left, right) => {
        const score = (candidate: { entry: VocabEntry; order: number }): number => {
          const memory = state.memories[candidate.entry.id];
          const memoryScore =
            memory?.status === "fragile"
              ? 0
              : memory?.status === "learning"
                ? 1
                : memory?.status === "seen" || memory?.status === "kept"
                  ? 2
                  : 3;
          const rawLevel = candidate.entry.jlpt;
          const itemRank =
            rawLevel !== null && rawLevel in LEVEL_RANK
              ? LEVEL_RANK[rawLevel as keyof typeof LEVEL_RANK]
              : targetRank + 2;
          return (
            memoryScore * 100 +
            Math.abs(itemRank - targetRank) * 20 +
            candidate.order / 1000
          );
        };
        return score(left) - score(right);
      })
      .slice(0, 10);
    for (const { entry } of ranked) mineEntry(entry, activeSource);
    for (const pattern of detectedGrammar.slice(0, 4))
      mineGrammar(pattern, activeSource);
  }, [
    activeSource,
    detectedGrammar,
    dictionary,
    mineEntry,
    mineGrammar,
    readerTokens,
    state.memories,
    state.profile.currentLevel,
  ]);

  const importSource = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const text = cleanTranscript(sourceTextDraft);
      const url = sourceUrlDraft.trim();
      const title =
        sourceTitleDraft.trim() ||
        `${sourceKindDraft} · ${new Date().toLocaleDateString()}`;
      if (text === "" && url === "" && sourceTitleDraft.trim() === "") return;
      const existing = state.sources.find((source) => source.id === editingSourceId);
      const source: SourceItem = {
        id: existing?.id ?? uid("source"),
        kind: sourceKindDraft,
        title,
        url,
        text,
        addedAt: existing?.addedAt ?? nowIso(),
        progress: existing?.progress ?? 0,
        provenance: "user-supplied",
        capturedVocabIds: existing?.capturedVocabIds ?? [],
      };
      updateState((previous) => {
        const alreadyExists = previous.sources.some((item) => item.id === source.id);
        return {
          ...previous,
          sources: alreadyExists
            ? previous.sources.map((item) => (item.id === source.id ? source : item))
            : [source, ...previous.sources],
          activeSourceId: source.id,
          selectedVocabId: null,
        };
      });
      setReaderDraft(text);
      setEditingSourceId(null);
      setSourceTitleDraft("");
      setSourceUrlDraft("");
      setSourceTextDraft("");
      setCaptionState("idle");
      setCaptionError(null);
      setSourceFormOpen(false);
      setView(text === "" ? "sources" : "reader");
    },
    [
      editingSourceId,
      sourceKindDraft,
      sourceTextDraft,
      sourceTitleDraft,
      sourceUrlDraft,
      state.sources,
      updateState,
    ],
  );

  const sendTeacherMessage = useCallback(
    (override?: string, entryOverride?: VocabEntry) => {
      const input = (override ?? teacherInput).trim();
      if (input === "") return;
      const contextualEntry = entryOverride ?? selectedEntry;
      const at = nowIso();
      const learnerMessage: ChatMessage = {
        id: uid("message"),
        role: "learner",
        text: input,
        createdAt: at,
        contextVocabId: contextualEntry?.id ?? null,
        generated: false,
      };
      const turn = buildTeacherTurn(input, contextualEntry, state);
      const teacherMessage: ChatMessage = {
        id: uid("message"),
        role: "teacher",
        text: turn.text,
        createdAt: nowIso(),
        contextVocabId: contextualEntry?.id ?? null,
        generated: true,
      };
      updateState((previous) => ({
        ...previous,
        messages: [...previous.messages, learnerMessage, teacherMessage],
      }));
      setSuggestedCard(
        turn.suggestedFront && turn.suggestedBack
          ? {
              front: turn.suggestedFront,
              back: turn.suggestedBack,
              vocabId: contextualEntry?.id ?? null,
              sourceId: state.activeSourceId,
              context: "Teacher conversation · learner-confirmed sentence mining",
            }
          : null,
      );
      setTeacherInput("");
      setView("teacher");
    },
    [selectedEntry, state, teacherInput, updateState],
  );

  const rateCurrentCard = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      if (currentCard === null) return;
      const reviewedAt = new Date();
      const updated = rateCard(currentCard, rating, reviewedAt);
      updateState((previous) => {
        const existing =
          currentCard.vocabId === null
            ? null
            : previous.memories[currentCard.vocabId];
        const existingConcept =
          currentCard.conceptId === null || currentCard.conceptId === undefined
            ? null
            : previous.conceptMemories?.[currentCard.conceptId];
        const nextStatus: LearningStatus =
          rating === 1
            ? "fragile"
            : rating === 4 || (rating === 3 && updated.repetitions >= 2)
              ? "known"
              : "learning";
        const sourceIds = new Set(existing?.sourceIds ?? []);
        if (currentCard.sourceId !== null) sourceIds.add(currentCard.sourceId);
        const at = reviewedAt.toISOString();
        return {
          ...previous,
          cards: previous.cards.map((card) =>
            card.id === currentCard.id ? updated : card,
          ),
          reviews: [
            {
              id: uid("review"),
              cardId: currentCard.id,
              rating,
              reviewedAt: at,
              previousDueAt: currentCard.dueAt,
              nextDueAt: updated.dueAt,
            },
            ...previous.reviews,
          ],
          memories:
            currentCard.vocabId === null
              ? previous.memories
              : {
                  ...previous.memories,
                  [currentCard.vocabId]: {
                    vocabId: currentCard.vocabId,
                    status: nextStatus,
                    firstSeenAt: existing?.firstSeenAt ?? at,
                    lastSeenAt: at,
                    lookups: Math.max(existing?.lookups ?? 0, 1),
                    sourceIds: [...sourceIds],
                    uncertainty: existing?.uncertainty ?? [],
                  },
                },
          conceptMemories:
            currentCard.conceptId === null || currentCard.conceptId === undefined
              ? previous.conceptMemories
              : {
                  ...previous.conceptMemories,
                  [currentCard.conceptId]: {
                    conceptId: currentCard.conceptId,
                    status: nextStatus === "kept" || nextStatus === "seen"
                      ? "learning"
                      : nextStatus,
                    reviews: (existingConcept?.reviews ?? 0) + 1,
                    lastSeenAt: at,
                    sourceIds: [
                      ...new Set([
                        ...(existingConcept?.sourceIds ?? []),
                        ...(currentCard.sourceId === null
                          ? []
                          : [currentCard.sourceId]),
                      ]),
                    ],
                  },
                },
          sources:
            currentCard.vocabId === null || currentCard.sourceId === null
              ? previous.sources
              : previous.sources.map((source) =>
                  source.id === currentCard.sourceId
                    ? {
                        ...source,
                        capturedVocabIds: [
                          ...new Set([
                            ...source.capturedVocabIds,
                            currentCard.vocabId as string,
                          ]),
                        ],
                      }
                    : source,
                ),
        };
      });
      setReviewRevealed(false);
    },
    [currentCard, updateState],
  );

  const openKanji = useCallback(
    (character: string) => {
      setKanjiQuery(character);
      updateState((previous) => ({ ...previous, selectedKanji: character }));
      setView("kanji");
    },
    [updateState],
  );

  const renderToday = () => {
    const frontier =
      dictionary === null ? [] : entriesNearLevel(dictionary, state.profile.currentLevel, 6);
    return (
      <div className="view-stack">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">今日の分岐 · your living edge</span>
            <h1>
              What you meet today
              <br />
              becomes tomorrow&apos;s Japanese.
            </h1>
            <p>
              Capture one real encounter. Bunki will keep its source, connect its words and
              kanji, turn your questions into practice, and bring it back in another context.
            </p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => setView("reader")}>
                <BookOpen size={17} /> Continue reading
              </button>
              <button className="button" onClick={openNewSource}>
                <Plus size={17} /> Add what I encountered
              </button>
            </div>
          </div>
          <div className="hero-orbit" aria-label="Bunki learning loop">
            <div className="orbit-center">
              <span>分岐</span>
              <small>one living memory</small>
            </div>
            <span className="orbit-node node-a">読む</span>
            <span className="orbit-node node-b">話す</span>
            <span className="orbit-node node-c">思い出す</span>
            <span className="orbit-node node-d">再会</span>
          </div>
        </section>

        <div className="stat-grid">
          <Panel className="stat-card">
            <span className="stat-icon gold">
              <Brain size={19} />
            </span>
            <strong>{dueCards.length}</strong>
            <span>due now</span>
            <button onClick={() => setView("review")}>Begin a finite session</button>
          </Panel>
          <Panel className="stat-card">
            <span className="stat-icon vermilion">
              <Sprout size={19} />
            </span>
            <strong>{learningCount}</strong>
            <span>actively learning</span>
            <small>{fragileCount} fragile · {keptCount} kept</small>
          </Panel>
          <Panel className="stat-card">
            <span className="stat-icon blue">
              <Library size={19} />
            </span>
            <strong>{state.sources.length}</strong>
            <span>sources in your inbox</span>
            <button onClick={() => setView("sources")}>Open source memory</button>
          </Panel>
          <Panel className="stat-card">
            <span className="stat-icon green">
              <CircleDot size={19} />
            </span>
            <strong>{knownCount}</strong>
            <span>known in context</span>
            <small>{memories.length} total encountered</small>
          </Panel>
        </div>

        <div className="two-column">
          <Panel
            title="Continue the thread"
            eyebrow="Active source"
            action={<button className="text-button" onClick={() => setView("reader")}>Open <ChevronRight size={15} /></button>}
          >
            {activeSource ? (
              <div className="source-feature">
                <div className="source-kind-mark">
                  {(() => {
                    const Icon = sourceIcon(activeSource.kind);
                    return <Icon size={21} />;
                  })()}
                </div>
                <div>
                  <h3>{activeSource.title}</h3>
                  <p>{activeSource.text.slice(0, 180)}…</p>
                  <div className="progress-line">
                    <span style={{ width: `${String(activeSource.progress)}%` }} />
                  </div>
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="The weave" eyebrow="Cross-pollination">
            <div className="weave-list">
              <div><span>1</span><p><strong>Encounter</strong> — article, video, lookup, conversation</p></div>
              <div><span>2</span><p><strong>Understand</strong> — dictionary, kanji, grammar, teacher</p></div>
              <div><span>3</span><p><strong>Choose</strong> — keep without debt, or learn deliberately</p></div>
              <div><span>4</span><p><strong>Re-meet</strong> — SRS, new source, dialogue, production</p></div>
            </div>
          </Panel>
        </div>

        <Panel title="At your current edge" eyebrow={`${state.profile.currentLevel} · suggested seeds`}>
          <div className="frontier-row">
            {frontier.map((entry) => (
              <button key={entry.id} className="frontier-card" onClick={() => selectEntry(entry, null, true)}>
                <strong>{entry.word}</strong>
                <span>{entry.reading}</span>
                <small>{entry.meanings[0]}</small>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    );
  };

  const renderDictionary = () => (
    <div className="view-stack">
      <div className="view-title">
        <div>
          <span className="eyebrow">23,120-entry alpha lexicon · 2,136 kanji</span>
          <h1>Dictionary that remembers why you looked.</h1>
          <p>Search in Japanese, kana, romaji, or English. Grammar lives beside the words, and a lookup never becomes review debt unless you choose it.</p>
        </div>
      </div>

      <div className="dictionary-layout">
        <Panel className="dictionary-search-panel">
          <label className="search-field large">
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="分岐 · ぶんき · branching"
              autoFocus
            />
            {query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={17} /></button> : null}
          </label>
          {dictionary === null ? (
            <div className="loading-block"><LoaderCircle className="spin" /> Loading the Japanese lexicon…</div>
          ) : (
            <>
              <div className="result-meta">{searchResults.length} best matches</div>
              <div className="dictionary-results">
                {searchResults.map((entry) => {
                  const memory = state.memories[entry.id];
                  return (
                    <button
                      key={entry.id}
                      className={`dictionary-row ${selectedEntry?.id === entry.id ? "selected" : ""}`}
                      onClick={() => selectEntry(entry)}
                    >
                      <div>
                        <strong>{entry.word}</strong>
                        <span>{entry.reading}</span>
                      </div>
                      <p>{entry.meanings.slice(0, 3).join(" · ")}</p>
                      <div className="row-tags">
                        {entry.jlpt ? <small>{entry.jlpt}</small> : null}
                        {memory ? <small className={`status ${memory.status}`}>{STATUS_COPY[memory.status]}</small> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
        <WordDetail
          entry={selectedEntry ?? searchResults[0] ?? null}
          memory={state.memories[(selectedEntry ?? searchResults[0])?.id ?? ""]}
          onStatus={setLearningStatus}
          onMine={mineEntry}
          onKanji={openKanji}
          onAsk={(entry) => {
            selectEntry(entry);
            sendTeacherMessage(
              `「${entry.word}」を、意味・ニュアンス・実際の使い方まで教えて。`,
              entry,
            );
          }}
        />
      </div>
      <Panel
        title="Grammar beside the words"
        eyebrow="24 core patterns · N5 through N1 · transparent alpha catalog"
      >
        <div className="grammar-grid">
          {(grammarResults.length > 0
            ? grammarResults
            : searchGrammar(
                state.profile.currentLevel === "zero"
                  ? "N5"
                  : state.profile.currentLevel === "N1+"
                    ? "N1"
                    : state.profile.currentLevel,
                8,
              )
          ).map((pattern) => (
            <article key={pattern.id} className="grammar-card">
              <div>
                <span>{pattern.level}</span>
                <strong>{pattern.pattern}</strong>
              </div>
              <p>{pattern.meaning}</p>
              <small>{pattern.formation}</small>
              <blockquote>{pattern.example}</blockquote>
              <button onClick={() => mineGrammar(pattern, null)}>
                <ListPlus size={14} /> Add production card
              </button>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );

  const renderReader = () => {
    const matched = readerTokens.filter((token) => token.entry !== null).length;
    const unknown = new Set(
      readerTokens
        .filter((token) => token.entry !== null && !state.memories[token.entry.id])
        .map((token) => token.entry?.id),
    ).size;
    return (
      <div className="view-stack">
        <div className="view-title reader-title">
          <div>
            <span className="eyebrow">Living reader · 読む</span>
            <h1>{activeSource?.title ?? "Open a source"}</h1>
            <p>Tap any recognized word. Keep your place, mine your edge, and carry the same material into conversation.</p>
          </div>
          <div className="title-actions">
            <button className="button" onClick={openNewSource}><Plus size={16} /> Add source</button>
            <button className="button primary" onClick={mineReaderEdge} disabled={matched === 0}>
              <Sparkles size={16} /> Mine this edge
            </button>
          </div>
        </div>

        <div className="reader-layout">
          <Panel className="reader-surface">
            <div className="reader-toolbar">
              <div>
                <button
                  aria-label="Decrease text size"
                  onClick={() => setReaderFontSize((size) => Math.max(16, size - 2))}
                >
                  A−
                </button>
                <button
                  aria-label="Increase text size"
                  onClick={() => setReaderFontSize((size) => Math.min(34, size + 2))}
                >
                  A＋
                </button>
                <button
                  onClick={() => speakJapanese(readerDraft)}
                  disabled={readerDraft.trim() === ""}
                >
                  <Volume2 size={15} /> Listen
                </button>
              </div>
              <span>{matched} recognized · {unknown} new to your map</span>
            </div>
            {dictionary === null || tokenizer === null ? (
              <div className="loading-block"><LoaderCircle className="spin" /> Preparing the morphology-aware reader…</div>
            ) : (
              <div
                className="reading-text"
                lang="ja"
                style={{ fontSize: `${String(readerFontSize)}px` }}
              >
                {readerTokens.map((token, index) => (
                  token.entry ? (
                    <button
                      key={`${token.text}-${String(index)}`}
                      className={`reader-token ${state.memories[token.entry.id]?.status ?? "unseen"}`}
                      onClick={() => selectEntry(token.entry!, activeSource?.id ?? null)}
                    >
                      {token.text}
                    </button>
                  ) : (
                    <span key={`${token.text}-${String(index)}`}>{token.text}</span>
                  )
                ))}
              </div>
            )}
            <div className="reader-footer">
              <label>
                Progress
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activeSource?.progress ?? 0}
                  onChange={(event) => {
                    if (!activeSource) return;
                    const progress = Number(event.target.value);
                    updateState((previous) => ({
                      ...previous,
                      sources: previous.sources.map((source) =>
                        source.id === activeSource.id ? { ...source, progress } : source,
                      ),
                    }));
                  }}
                />
              </label>
              <span>{activeSource?.progress ?? 0}%</span>
            </div>
          </Panel>
          <ContextRail
            entry={selectedEntry}
            source={activeSource}
            memory={selectedEntry ? state.memories[selectedEntry.id] : undefined}
            onStatus={setLearningStatus}
            onMine={mineEntry}
            onDictionary={(entry) => selectEntry(entry, activeSource?.id ?? null, true)}
            onAsk={(entry) => {
              selectEntry(entry);
              sendTeacherMessage(
                `この記事の「${entry.word}」を、この文脈のまま深く説明して。`,
                entry,
              );
            }}
          />
        </div>
        {detectedGrammar.length > 0 ? (
          <Panel
            title="Grammar detected in this source"
            eyebrow={`${String(detectedGrammar.length)} reusable patterns · mine the full context`}
          >
            <div className="grammar-strip">
              {detectedGrammar.map((pattern) => (
                <button key={pattern.id} onClick={() => mineGrammar(pattern, activeSource)}>
                  <span>{pattern.level}</span>
                  <strong>{pattern.pattern}</strong>
                  <small>{pattern.meaning}</small>
                  <ListPlus size={14} />
                </button>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    );
  };

  const renderSources = () => (
    <div className="view-stack">
      <div className="view-title">
        <div>
          <span className="eyebrow">Immersion inbox · 素材</span>
          <h1>Save it while walking. Understand it later.</h1>
          <p>Articles, YouTube and podcast transcripts, screenshots, books, PDFs, conversations, and manual paste all enter one source memory.</p>
        </div>
        <button className="button primary" onClick={openNewSource}><Plus size={17} /> Add source</button>
      </div>

      <div className="source-grid">
        {state.sources.map((source) => {
          const Icon = sourceIcon(source.kind);
          return (
            <Panel key={source.id} className={`source-card ${source.id === state.activeSourceId ? "active" : ""}`}>
              <div className="source-card-top">
                <span className="source-kind-mark"><Icon size={19} /></span>
                <span className="source-type">{source.kind}</span>
                <span className="provenance">{source.provenance === "user-supplied" ? "your source" : "generated sample"}</span>
              </div>
              <h3>{source.title}</h3>
              <p>
                {source.text === ""
                  ? "Saved for later. Add captions, a transcript, or extracted text when you have time."
                  : `${source.text.slice(0, 145)}…`}
              </p>
              <div className="progress-line"><span style={{ width: `${String(source.progress)}%` }} /></div>
              <div className="source-card-bottom">
                <small>{source.progress}% complete · {source.capturedVocabIds.length} captured</small>
                {safeExternalUrl(source.url) ? (
                  <a
                    className="source-original"
                    href={safeExternalUrl(source.url) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Link2 size={13} /> Original
                  </a>
                ) : null}
                <button
                  className="text-button"
                  onClick={() => {
                    if (source.text === "") {
                      openSourceEditor(source);
                      return;
                    }
                    updateState((previous) => ({
                      ...previous,
                      activeSourceId: source.id,
                      selectedVocabId: null,
                    }));
                    setReaderDraft(source.text);
                    setView("reader");
                  }}
                >
                  {source.text === "" ? "Add text" : "Read"} <ChevronRight size={14} />
                </button>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel title="Curated immersion starting points" eyebrow={`Manual level estimates · current edge ${state.profile.currentLevel}`}>
        <div className="recommendation-list">
          {INTEREST_RECOMMENDATIONS.map((source) => (
            <a key={source.title} href={source.href} target="_blank" rel="noreferrer">
              <span className="recommendation-level">{source.level}</span>
              <div><strong>{source.title}</strong><small>{source.detail}</small><p>{source.reason}</p></div>
              <ChevronRight size={18} />
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );

  const renderTeacher = () => (
    <div className="teacher-layout">
      <div className="teacher-main">
        <div className="view-title">
          <div>
            <span className="eyebrow">Recursive teacher · 対話</span>
            <h1>Branch deeply. Return to the thread.</h1>
            <p>The current alpha runs a transparent local guide. It uses your selected word, source, and learning state without pretending to be a live model.</p>
          </div>
          <span className="mode-badge"><Bot size={15} /> Local recursive guide</span>
        </div>
        <Panel className="chat-panel">
          <div className="chat-context">
            <span><Link2 size={14} /> Context</span>
            <strong>{selectedEntry ? `${selectedEntry.word} · ${selectedEntry.reading}` : activeSource?.title ?? "General conversation"}</strong>
          </div>
          <div className="messages">
            {state.messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="message-avatar">{message.role === "teacher" ? <Sparkles size={17} /> : "J"}</div>
                <div>
                  <span>{message.role === "teacher" ? "Bunki teacher" : state.profile.displayName}{message.generated ? " · generated" : ""}</span>
                  <p>{message.text}</p>
                </div>
              </div>
            ))}
          </div>
          {suggestedCard ? (
            <div className="suggested-card">
              <div><Sparkles size={16} /><span>Mine this turn as a sentence card?</span></div>
              <p>{suggestedCard.front}</p>
              <button
                className="button small primary"
                onClick={() => {
                  addCard(makeCard({
                    vocabId: suggestedCard.vocabId,
                    sourceId: suggestedCard.sourceId,
                    front: suggestedCard.front,
                    back: suggestedCard.back,
                    context: suggestedCard.context,
                    kind: "production",
                  }));
                  if (suggestedCard.vocabId !== null) {
                    const entry = dictionary?.byId.get(suggestedCard.vocabId);
                    if (entry !== undefined) setLearningStatus(entry, "learning");
                  }
                  setSuggestedCard(null);
                }}
              ><ListPlus size={15} /> Add to practice</button>
            </div>
          ) : null}
          <div className="branch-chips">
            {["ニュアンスを深める", "漢字から見る", "文法へ枝分かれ", "別の文脈で練習"].map((branch) => (
              <button key={branch} onClick={() => sendTeacherMessage(branch)}>{branch}</button>
            ))}
          </div>
          <form
            className="teacher-composer"
            onSubmit={(event) => {
              event.preventDefault();
              sendTeacherMessage();
            }}
          >
            <textarea
              value={teacherInput}
              onChange={(event) => setTeacherInput(event.target.value)}
              placeholder="Ask in English or Japanese. Try: この表現のニュアンスは？"
              rows={2}
            />
            <button className="send-button" aria-label="Send message"><Send size={19} /></button>
          </form>
        </Panel>
      </div>
      <aside className="teacher-sidebar">
        <Panel title="What Bunki knows here" eyebrow="Shared learner state">
          <dl className="context-facts">
            <div><dt>Current edge</dt><dd>{state.profile.currentLevel}</dd></div>
            <div><dt>Active source</dt><dd>{activeSource?.title ?? "None"}</dd></div>
            <div><dt>Selected word</dt><dd>{selectedEntry?.word ?? "None"}</dd></div>
            <div><dt>Learning</dt><dd>{learningCount} threads</dd></div>
            <div><dt>Due</dt><dd>{dueCards.length} cards</dd></div>
          </dl>
        </Panel>
        <Panel title="Journey shape" eyebrow="Bifurcate and rejoin">
          <div className="journey-diagram">
            <span>Source</span><i />
            <div><span>Kanji</span><span>Grammar</span><span>Nuance</span></div>
            <i /><span>Use it again</span>
          </div>
        </Panel>
      </aside>
    </div>
  );

  const renderReview = () => (
    <div className="review-page">
      <div className="view-title">
        <div>
          <span className="eyebrow">Living SRS · 復習</span>
          <h1>A finite session, woven from real encounters.</h1>
          <p>Full sentences, production, cloze, listening, and connected kanji. FSRS schedules only what you chose to learn.</p>
        </div>
        <div className="session-count"><strong>{dueCards.length}</strong><span>due now</span></div>
      </div>
      {currentCard ? (
        <div className="review-stage">
          <div className="review-progress"><span style={{ width: `${String(Math.min(100, state.reviews.length % 10 * 10))}%` }} /></div>
          <div className={`review-card ${reviewRevealed ? "revealed" : ""}`}>
            <div className="review-card-meta">
              <span>{currentCard.kind}</span>
              <small>{currentCard.context}</small>
            </div>
            <div className="review-prompt" lang="ja">{currentCard.front}</div>
            {reviewRevealed ? <div className="review-answer" lang="ja">{currentCard.back}</div> : null}
            {!reviewRevealed ? (
              <button className="button primary reveal" onClick={() => setReviewRevealed(true)}>Show answer</button>
            ) : (
              <div className="rating-grid">
                <button onClick={() => rateCurrentCard(1)}><span>Again</span><small>1 min</small></button>
                <button onClick={() => rateCurrentCard(2)}><span>Hard</span><small>careful</small></button>
                <button onClick={() => rateCurrentCard(3)}><span>Good</span><small>remembered</small></button>
                <button onClick={() => rateCurrentCard(4)}><span>Easy</span><small>stable</small></button>
              </div>
            )}
          </div>
          <div className="review-foot">
            <span><Clock3 size={14} /> FSRS 5.4.1 · 90% target retention</span>
            <span>{state.cards.length} total cards · {state.reviews.length} reviews</span>
          </div>
        </div>
      ) : (
        <Panel className="empty-celebration">
          <Check size={31} />
          <h2>Session complete.</h2>
          <p>No more cards are due now. Go meet Japanese in the wild; Bunki will bring the right threads back.</p>
          <button className="button primary" onClick={() => setView("reader")}><BookOpen size={16} /> Return to immersion</button>
        </Panel>
      )}
      <Panel title="Coming back later" eyebrow="Scheduled threads">
        <div className="card-queue">
          {state.cards.slice(0, 8).map((card) => (
            <div key={card.id}><span>{card.kind}</span><p>{card.front}</p><small>{formatDue(card.dueAt)}</small></div>
          ))}
        </div>
      </Panel>
    </div>
  );

  const renderKanji = () => {
    const related = dictionary && selectedKanjiEntry
      ? wordsForKanji(dictionary, selectedKanjiEntry.char, 24)
      : [];
    return (
      <div className="view-stack">
        <div className="view-title">
          <div>
            <span className="eyebrow">Connected kanji · 漢字</span>
            <h1>Never learn a character alone.</h1>
            <p>Stroke form, readings, compounds, source encounters, and sentence practice remain one connected thread.</p>
          </div>
          <label className="kanji-search">
            <Search size={17} />
            <input
              value={kanjiQuery}
              onChange={(event) => {
                const character = event.target.value;
                setKanjiQuery(character);
                updateState((previous) => ({
                  ...previous,
                  selectedKanji: character || null,
                }));
              }}
              maxLength={1}
              aria-label="Search one kanji"
            />
          </label>
        </div>
        {selectedKanjiEntry ? (
          <div className="kanji-layout">
            <Panel className="kanji-glyph-panel">
              <KanjiGlyph
                key={`${selectedKanjiEntry.id}-${String(kanjiReplay)}`}
                entry={selectedKanjiEntry}
              />
              <div className="stroke-controls">
                <button onClick={() => setKanjiReplay((value) => value + 1)}>
                  <Play size={15} /> Animate
                </button>
                <button onClick={() => setKanjiReplay((value) => value + 1)}>
                  <RotateCcw size={15} /> Replay
                </button>
              </div>
            </Panel>
            <Panel className="kanji-detail-panel">
              <span className="eyebrow">{selectedKanjiEntry.jlpt ?? "ungraded"} · {selectedKanjiEntry.strokeCount} strokes · grade {selectedKanjiEntry.grade ?? "—"}</span>
              <h2>{selectedKanjiEntry.meanings.join(" · ")}</h2>
              <div className="reading-pairs">
                <div><span>音読み</span><strong>{selectedKanjiEntry.onyomi.join("、") || "—"}</strong></div>
                <div><span>訓読み</span><strong>{selectedKanjiEntry.kunyomi.join("、") || "—"}</strong></div>
              </div>
              <button
                className="button primary"
                onClick={() =>
                  addCard(makeCard({
                    conceptId: `kanji:${selectedKanjiEntry.char}`,
                    front: `Write ${selectedKanjiEntry.char}, then recall one real word that uses it.`,
                    back: `${selectedKanjiEntry.char} — ${selectedKanjiEntry.meanings.join(", ")}\n${related.slice(0, 4).map((word) => `${word.word}（${word.reading}）`).join(" · ")}`,
                    context: "Connected kanji · writing + compounds",
                    kind: "kanji",
                  }))
                }
              ><ListPlus size={16} /> Add connected kanji practice</button>
            </Panel>
            <Panel className="kanji-words" title={`Words carrying ${selectedKanjiEntry.char}`} eyebrow="Dictionary × your encounters">
              <div className="compound-grid">
                {related.map((entry) => (
                  <button key={entry.id} onClick={() => selectEntry(entry, null, true)}>
                    <strong>{entry.word}</strong><span>{entry.reading}</span><small>{entry.meanings[0]}</small>
                    {state.memories[entry.id] ? <i className={state.memories[entry.id].status} /> : null}
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        ) : (
          <Panel><p>Enter a Japanese kanji to open its connected page.</p></Panel>
        )}
      </div>
    );
  };

  const renderMap = () => {
    const recentMemories = memories.slice(-7);
    const sources = state.sources.slice(0, 3);
    return (
      <div className="view-stack">
        <div className="view-title">
          <div>
            <span className="eyebrow">Living map · 地図</span>
            <h1>Your Japanese is a tapestry, not a score.</h1>
            <p>Every line below comes from a source, lookup, deliberate promotion, conversation, or review already in your state.</p>
          </div>
        </div>
        <Panel className="map-panel">
          <svg viewBox="0 0 1000 560" role="img" aria-label="Graph connecting sources, words, conversation, and SRS cards">
            <defs>
              <radialGradient id="nodeGlow"><stop offset="0" stopColor="#e5c47e" stopOpacity=".8" /><stop offset="1" stopColor="#b8872e" stopOpacity=".15" /></radialGradient>
            </defs>
            <g className="map-lines">
              {recentMemories.map((_, index) => <line key={`a-${String(index)}`} x1="500" y1="280" x2={150 + index * 115} y2={index % 2 ? 410 : 125} />)}
              {sources.map((_, index) => <line key={`s-${String(index)}`} x1="500" y1="280" x2={220 + index * 280} y2="500" />)}
              <line x1="500" y1="280" x2="880" y2="270" />
            </g>
            <g className="map-center"><circle cx="500" cy="280" r="72" /><text x="500" y="270">分岐</text><text className="sub" x="500" y="298">your living edge</text></g>
            {recentMemories.map((memory, index) => {
              const entry = dictionary?.byId.get(memory.vocabId);
              const x = 150 + index * 115;
              const y = index % 2 ? 410 : 125;
              return <g key={memory.vocabId} className={`map-node ${memory.status}`}><circle cx={x} cy={y} r="40" /><text x={x} y={y + 5}>{entry?.word ?? "語"}</text></g>;
            })}
            {sources.map((source, index) => {
              const x = 220 + index * 280;
              return <g key={source.id} className="map-source"><rect x={x - 78} y="462" width="156" height="70" rx="18" /><text x={x} y="492">{source.title.slice(0, 12)}</text><text className="sub" x={x} y="514">{source.kind}</text></g>;
            })}
            <g className="map-review"><circle cx="880" cy="270" r="52" fill="url(#nodeGlow)" /><text x="880" y="265">復習</text><text className="sub" x="880" y="288">{state.cards.length} cards</text></g>
          </svg>
          {memories.length === 0 ? <p className="map-empty">Look up or tap a word to grow the map.</p> : null}
        </Panel>
        <div className="map-legend">
          {Object.entries(STATUS_COPY).map(([status, label]) => <span key={status}><i className={status} />{label}</span>)}
          <span><i className="source" />Source lineage</span>
        </div>
      </div>
    );
  };

  const renderView = () => {
    switch (view) {
      case "today": return renderToday();
      case "dictionary": return renderDictionary();
      case "reader": return renderReader();
      case "sources": return renderSources();
      case "teacher": return renderTeacher();
      case "review": return renderReview();
      case "kanji": return renderKanji();
      case "map": return renderMap();
    }
  };

  return (
    <main
      className={`bunki-shell ${hydrated ? "" : "hydrating"}`}
      aria-busy={!hydrated}
    >
      <aside className={`side-nav ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <span>分岐</span>
          <div><strong>Bunki</strong><small>Living Japanese</small></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav aria-label="Bunki sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => {
                  setView(item.id);
                  setMobileNav(false);
                }}
              >
                <Icon size={18} /><span>{item.label}<small>{item.japanese}</small></span>
                {item.id === "review" && dueCards.length > 0 ? <em>{dueCards.length}</em> : null}
              </button>
            );
          })}
        </nav>
        <button className="nav-profile" onClick={() => setProfileOpen(true)}>
          <ProgressRing value={Math.min(100, 34 + knownCount)} label={state.profile.currentLevel} />
          <div><strong>{state.profile.displayName}</strong><small>{state.profile.target}</small></div>
          <Settings2 size={17} />
        </button>
        <div className="data-note"><Database size={14} /><span>{dictionary ? `${dictionary.vocab.length.toLocaleString()} words ready` : "Loading lexicon"}</span></div>
      </aside>

      <section className="app-frame">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <button className="global-search" onClick={() => setView("dictionary")}>
            <Search size={17} /><span>Look up anything…</span><kbd>⌘ K</kbd>
          </button>
          <div className={`sync-state ${syncState}`}>
            {syncState === "saving" || syncState === "loading" ? <LoaderCircle className="spin" size={14} /> : syncState === "saved" ? <Check size={14} /> : <Pause size={14} />}
            <span>{syncState === "saved" ? "Saved" : syncState === "offline" ? "Offline mirror" : syncState}</span>
          </div>
          <button className="quick-capture" onClick={openNewSource}><Plus size={17} /><span>Capture</span></button>
        </header>
        {dictionaryError || tokenizerError ? (
          <div className="error-banner">{dictionaryError ?? tokenizerError}</div>
        ) : null}
        <div className="content-area">
          {renderView()}
          <footer className="data-credits">
            <span>Lexicon payload {dictionary?.version ?? "loading"} · refreshed from packaged upstream data</span>
            <p>
              Dictionary entries:{" "}
              <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noreferrer">JMdict</a>;
              kanji metadata:{" "}
              <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer">KANJIDIC2</a>
              {" "}© EDRDG,{" "}
              <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.
              Stroke paths:{" "}
              <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noreferrer">KanjiVG</a>
              {" "}© 2009–2026 Ulrich Apel, CC BY-SA 3.0. Morphology:{" "}
              <a href="https://github.com/takuyaa/kuromoji.js" target="_blank" rel="noreferrer">Kuromoji.js</a>,
              Apache 2.0. Packaged via kotobako-data 26.7.19. No affiliation, endorsement, or warranty.
            </p>
          </footer>
        </div>
      </section>

      <nav className="mobile-bottom-nav" aria-label="Mobile Bunki sections">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon size={20} /><span>{item.japanese}</span></button>;
        })}
      </nav>

      {sourceFormOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeSourceForm}>
          <form className="source-modal" onSubmit={importSource} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Universal capture</span>
                <h2>{editingSourceId === null ? "Add what you encountered" : "Complete this source"}</h2>
              </div>
              <button type="button" onClick={closeSourceForm} aria-label="Close"><X size={20} /></button>
            </div>
            <p>While walking, save only a title or URL. Later, return here and paste captions, transcript, or extracted text to make it a tappable reader.</p>
            <div className="source-kind-picker">
              {SOURCE_KINDS.map((kind) => {
                const Icon = kind.icon;
                return <button type="button" key={kind.value} className={sourceKindDraft === kind.value ? "active" : ""} onClick={() => setSourceKindDraft(kind.value)}><Icon size={16} />{kind.label}</button>;
              })}
            </div>
            <div className="form-row">
              <label><span>Title</span><input value={sourceTitleDraft} onChange={(event) => setSourceTitleDraft(event.target.value)} placeholder="Five videos from today’s walk" /></label>
              <label><span>URL or reference</span><input value={sourceUrlDraft} onChange={(event) => setSourceUrlDraft(event.target.value)} placeholder="https://youtube.com/…" /></label>
            </div>
            {sourceKindDraft === "youtube" && sourceUrlDraft.trim() !== "" ? (
              <div className={`caption-import ${captionState}`}>
                <div>
                  <Video size={16} />
                  <span>
                    {captionState === "loaded"
                      ? "Public captions loaded into the text field."
                      : "Try importing the video’s public Japanese or auto-generated captions."}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={fetchYouTubeCaptions}
                  disabled={captionState === "loading"}
                >
                  {captionState === "loading" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : captionState === "loaded" ? (
                    <Check size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {captionState === "loading" ? "Fetching…" : "Fetch captions"}
                </button>
                {captionError ? <small>{captionError}</small> : null}
              </div>
            ) : null}
            <label><span>Optional now: text, captions, transcript, or existing OCR</span><textarea maxLength={500_000} value={sourceTextDraft} onChange={(event) => setSourceTextDraft(event.target.value)} rows={10} placeholder="Paste Japanese text, SRT/VTT captions, a podcast transcript, Kindle highlights, PDF text, or OCR output. Timestamps are cleaned automatically." /></label>
            <div className="modal-note"><Link2 size={15} /><span>Bunki keeps the original pointer and your supplied text together. This alpha does not silently scrape protected media or claim that pasted material is its own.</span></div>
            <button
              className="button primary modal-submit"
              disabled={
                sourceTextDraft.trim() === "" &&
                sourceUrlDraft.trim() === "" &&
                sourceTitleDraft.trim() === ""
              }
            >
              <Sparkles size={17} />
              {sourceTextDraft.trim() === "" ? "Save for later" : "Ingest into Bunki"}
            </button>
          </form>
        </div>
      ) : null}
      {profileOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setProfileOpen(false)}>
          <section className="source-modal profile-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span className="eyebrow">Your starting edge</span><h2>Start anywhere. Keep one learner model.</h2></div>
              <button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile"><X size={20} /></button>
            </div>
            <p>Choose zero if you are starting from scratch, or place yourself anywhere through N1+. This changes the frontier—not what Bunki lets you read.</p>
            <label>
              <span>Name</span>
              <input
                value={state.profile.displayName}
                onChange={(event) =>
                  updateState((previous) => ({
                    ...previous,
                    profile: { ...previous.profile, displayName: event.target.value },
                  }))
                }
              />
            </label>
            <div className="level-picker">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  className={state.profile.currentLevel === level ? "active" : ""}
                  onClick={() =>
                    updateState((previous) => ({
                      ...previous,
                      profile: { ...previous.profile, currentLevel: level },
                    }))
                  }
                >
                  {level === "zero" ? "From zero" : level}
                </button>
              ))}
            </div>
            <label>
              <span>Goal</span>
              <input
                value={state.profile.target}
                onChange={(event) =>
                  updateState((previous) => ({
                    ...previous,
                    profile: { ...previous.profile, target: event.target.value },
                  }))
                }
              />
            </label>
            <label>
              <span>Daily minutes</span>
              <input
                type="number"
                min="5"
                max="480"
                value={state.profile.dailyMinutes}
                onChange={(event) =>
                  updateState((previous) => ({
                    ...previous,
                    profile: {
                      ...previous.profile,
                      dailyMinutes: Math.max(5, Number(event.target.value) || 5),
                    },
                  }))
                }
              />
            </label>
            <button className="button primary modal-submit" onClick={() => setProfileOpen(false)}>
              <Check size={17} /> Use this learning edge
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function WordDetail({
  entry,
  memory,
  onStatus,
  onMine,
  onKanji,
  onAsk,
}: {
  entry: VocabEntry | null;
  memory?: { status: LearningStatus; lookups: number };
  onStatus: (entry: VocabEntry, status: LearningStatus) => void;
  onMine: (entry: VocabEntry) => void;
  onKanji: (character: string) => void;
  onAsk: (entry: VocabEntry) => void;
}) {
  if (entry === null) return <Panel className="word-detail empty-detail"><Languages size={27} /><h2>Search the living dictionary</h2><p>Every lookup can remain a lookup, become a kept thread, or enter deliberate study.</p></Panel>;
  const examples = practiceExamples(entry, 3);
  return (
    <Panel className="word-detail">
      <div className="word-heading">
        <div><span className="reading">{entry.reading}</span><h2 lang="ja">{entry.word}</h2>{entry.altWord ? <small>{entry.altWord}</small> : null}</div>
        <button
          aria-label={`Play ${entry.word} pronunciation`}
          onClick={() => speakJapanese(entry.word)}
        >
          <Volume2 size={20} />
        </button>
      </div>
      <div className="word-meta"><span>{entry.pos}</span>{entry.jlpt ? <span>{entry.jlpt}</span> : null}<span>JMdict-derived</span></div>
      <ol className="meanings">{entry.meanings.slice(0, 8).map((meaning) => <li key={meaning}>{meaning}</li>)}</ol>
      <div className="status-ladder">
        {(["kept", "learning", "known", "fragile"] as const).map((status) => (
          <button key={status} className={memory?.status === status ? "active" : ""} onClick={() => onStatus(entry, status)}>{STATUS_COPY[status]}</button>
        ))}
      </div>
      {entry.containsKanji.length > 0 ? (
        <div className="kanji-links"><span>Kanji</span>{entry.containsKanji.map((character) => <button key={character} onClick={() => onKanji(character)}>{character}</button>)}</div>
      ) : null}
      <div className="generated-example">
        <span>
          <Sparkles size={14} /> 3 of {PRACTICE_VARIANTS_PER_ENTRY} transparent
          production prompts
        </span>
        {examples.map((example) => (
          <p key={example} lang="ja">{example}</p>
        ))}
      </div>
      <div className="detail-actions">
        <button className="button primary" onClick={() => onMine(entry)}><ListPlus size={16} /> Mine sentence</button>
        <button className="button" onClick={() => onAsk(entry)}><Bot size={16} /> Ask teacher</button>
      </div>
      {memory ? <small className="memory-note">Seen {memory.lookups} time{memory.lookups === 1 ? "" : "s"} · currently {STATUS_COPY[memory.status].toLowerCase()}</small> : null}
    </Panel>
  );
}

function ContextRail({
  entry,
  source,
  memory,
  onStatus,
  onMine,
  onDictionary,
  onAsk,
}: {
  entry: VocabEntry | null;
  source: SourceItem | null;
  memory?: { status: LearningStatus; lookups: number };
  onStatus: (entry: VocabEntry, status: LearningStatus) => void;
  onMine: (entry: VocabEntry) => void;
  onDictionary: (entry: VocabEntry) => void;
  onAsk: (entry: VocabEntry) => void;
}) {
  return (
    <aside className="context-rail">
      {entry ? (
        <>
          <span className="eyebrow">Tapped in this source</span>
          <div className="rail-word"><span>{entry.reading}</span><h2>{entry.word}</h2><p>{entry.meanings.slice(0, 3).join(" · ")}</p></div>
          <div className="rail-actions">
            <button onClick={() => onStatus(entry, "kept")} className={memory?.status === "kept" ? "active" : ""}><Star size={15} /> Keep</button>
            <button onClick={() => onMine(entry)}><ListPlus size={15} /> Learn</button>
            <button onClick={() => onAsk(entry)}><Bot size={15} /> Ask</button>
          </div>
          <button className="full-link" onClick={() => onDictionary(entry)}>Open full dictionary thread <ChevronRight size={15} /></button>
        </>
      ) : (
        <div className="rail-empty"><CircleDot size={25} /><h3>Tap a word</h3><p>Dictionary, kanji, memory status, and sentence-mining actions will open here without losing your reading position.</p></div>
      )}
      <div className="rail-source">
        <span>Source lineage</span><strong>{source?.title ?? "No active source"}</strong><small>{source?.provenance ?? "—"} · {source?.kind ?? "—"}</small>
        {source && safeExternalUrl(source.url) ? (
          <a href={safeExternalUrl(source.url) ?? undefined} target="_blank" rel="noreferrer">
            <Link2 size={13} /> Open original
          </a>
        ) : null}
      </div>
    </aside>
  );
}

function KanjiGlyph({ entry }: { entry: KanjiEntry }) {
  return (
    <svg className="kanji-glyph" viewBox="0 0 109 109" role="img" aria-label={`${entry.char}, ${String(entry.strokeCount)} strokes`}>
      <g className="kanji-grid"><line x1="54.5" y1="5" x2="54.5" y2="104" /><line x1="5" y1="54.5" x2="104" y2="54.5" /><rect x="5" y="5" width="99" height="99" /></g>
      <g className="kanji-strokes">{entry.strokes.map((path, index) => <path key={`${entry.id}-${String(index)}`} d={path} style={{ "--delay": `${String(index * 0.12)}s` } as CSSProperties} />)}</g>
    </svg>
  );
}
