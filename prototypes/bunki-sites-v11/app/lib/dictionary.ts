import { toHiragana } from "wanakana";

import type { KanjiEntry, VocabEntry } from "./types.ts";

export interface DictionaryPayload {
  readonly version: string;
  readonly datasets: {
    readonly vocab: readonly VocabEntry[];
    readonly kanji: readonly KanjiEntry[];
  };
}

export interface DictionaryIndex {
  readonly version: string;
  readonly vocab: readonly VocabEntry[];
  readonly kanji: readonly KanjiEntry[];
  readonly byId: ReadonlyMap<string, VocabEntry>;
  readonly byWord: ReadonlyMap<string, VocabEntry>;
  readonly byWordAll: ReadonlyMap<string, readonly VocabEntry[]>;
  readonly byReadingAll: ReadonlyMap<string, readonly VocabEntry[]>;
  readonly kanjiByChar: ReadonlyMap<string, KanjiEntry>;
  readonly searchRecords: readonly {
    readonly entry: VocabEntry;
    readonly word: string;
    readonly alt: string;
    readonly reading: string;
    readonly meanings: string;
    readonly altLatin?: string;
    readonly meaningExact?: readonly string[];
    readonly primaryMeaning?: string;
    readonly primaryTokens?: readonly string[];
    readonly senseTokens?: readonly (readonly string[])[];
  }[];
}

export interface DictionarySearchResult {
  readonly entry: VocabEntry;
  readonly score: number;
  readonly reason: "exact spelling" | "exact reading" | "romaji" | "English meaning" | "partial match";
}

const EDITORIAL_TERMS: readonly VocabEntry[] = [
  {
    id: "bunki_editorial_ai",
    source: "Bunki editorial interest pack",
    word: "人工知能",
    altWord: "AI",
    reading: "じんこうちのう",
    meanings: ["artificial intelligence; AI"],
    pos: "noun",
    jlpt: null,
    containsKanji: ["人", "工", "知", "能"],
  },
  {
    id: "bunki_editorial_ml",
    source: "Bunki editorial interest pack",
    word: "機械学習",
    altWord: null,
    reading: "きかいがくしゅう",
    meanings: ["machine learning"],
    pos: "noun",
    jlpt: null,
    containsKanji: ["機", "械", "学", "習"],
  },
  {
    id: "bunki_editorial_llm",
    source: "Bunki editorial interest pack",
    word: "大規模言語モデル",
    altWord: "LLM",
    reading: "だいきぼげんごモデル",
    meanings: ["large language model; LLM"],
    pos: "noun",
    jlpt: null,
    containsKanji: ["大", "規", "模", "言", "語"],
  },
  {
    id: "bunki_editorial_metaphysics",
    source: "Bunki editorial interest pack",
    word: "形而上学",
    altWord: null,
    reading: "けいじじょうがく",
    meanings: ["metaphysics"],
    pos: "noun",
    jlpt: null,
    containsKanji: ["形", "而", "上", "学"],
  },
  {
    id: "bunki_editorial_epistemology",
    source: "Bunki editorial interest pack",
    word: "認識論",
    altWord: null,
    reading: "にんしきろん",
    meanings: ["epistemology; theory of knowledge"],
    pos: "noun",
    jlpt: null,
    containsKanji: ["認", "識", "論"],
  },
  {
    id: "bunki_editorial_dialectic",
    source: "Bunki editorial interest pack",
    word: "弁証法",
    altWord: null,
    reading: "べんしょうほう",
    meanings: ["dialectic; dialectical method"],
    pos: "noun",
    jlpt: null,
    containsKanji: ["弁", "証", "法"],
  },
  {
    id: "bunki_editorial_dependent_origination",
    source: "Bunki editorial interest pack",
    word: "縁起",
    altWord: null,
    reading: "えんぎ",
    meanings: ["dependent origination; causation; omen"],
    pos: "noun",
    jlpt: null,
    containsKanji: ["縁", "起"],
  },
] as const;

const POS_LABELS: Readonly<Record<string, string>> = {
  n: "noun",
  "n-suf": "noun used as a suffix",
  "n-pref": "noun used as a prefix",
  "adj-i": "い-adjective",
  "adj-na": "な-adjective",
  "adj-no": "noun taking の",
  "adj-pn": "pre-noun adjective",
  adv: "adverb",
  exp: "expression",
  int: "interjection",
  pn: "pronoun",
  pref: "prefix",
  suf: "suffix",
  "v1": "一段 verb",
  "v5": "五段 verb",
  "vs": "する verb",
  "vs-i": "する verb",
  "vs-s": "する verb",
  vi: "intransitive verb",
  vt: "transitive verb",
};

export function readablePartOfSpeech(value: string): string {
  const pieces = value
    .split(/[;,/|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => POS_LABELS[item] ?? item.replaceAll("-", " "));
  return [...new Set(pieces)].join(" · ") || "Japanese expression";
}

let dictionaryPromise: Promise<DictionaryIndex> | null = null;

export function loadDictionary(): Promise<DictionaryIndex> {
  dictionaryPromise ??= fetch("./kotobako-static.json")
    .then((response) => {
      if (!response.ok) throw new Error("The Japanese dictionary could not be loaded.");
      return response.json() as Promise<DictionaryPayload>;
    })
    .then((payload) => {
      const byId = new Map<string, VocabEntry>();
      const byWord = new Map<string, VocabEntry>();
      const kanjiByChar = new Map<string, KanjiEntry>();
      const kanjiById = new Map<string, KanjiEntry>();
      for (const entry of payload.datasets.kanji) {
        kanjiById.set(entry.id, entry);
        kanjiByChar.set(entry.char, entry);
      }
      const vocab = [...payload.datasets.vocab, ...EDITORIAL_TERMS].map((rawEntry) => {
        const looseEntry = rawEntry as VocabEntry & {
          readonly altWord?: string | null;
          readonly pos?: string | null;
        };
        return {
          ...rawEntry,
          altWord: typeof looseEntry.altWord === "string" ? looseEntry.altWord : null,
          pos:
            typeof looseEntry.pos === "string"
              ? readablePartOfSpeech(looseEntry.pos)
              : "supplemental vocabulary",
          containsKanji: rawEntry.containsKanji
            .map((value) => kanjiById.get(value)?.char ?? value)
            .filter((value) => /^\p{Script=Han}$/u.test(value)),
        } satisfies VocabEntry;
      });
      const byWordAll = new Map<string, VocabEntry[]>();
      const byReadingAll = new Map<string, VocabEntry[]>();
      for (const entry of vocab) {
        byId.set(entry.id, entry);
        if (!byWord.has(entry.word)) byWord.set(entry.word, entry);
        if (entry.altWord !== null && !byWord.has(entry.altWord)) byWord.set(entry.altWord, entry);
        for (const form of [entry.word, entry.altWord].filter(
          (value): value is string => value !== null && value !== "",
        )) {
          const bucket = byWordAll.get(form) ?? [];
          bucket.push(entry);
          byWordAll.set(form, bucket);
        }
        const readingKey = normalized(entry.reading);
        if (readingKey !== "") {
          const bucket = byReadingAll.get(readingKey) ?? [];
          bucket.push(entry);
          byReadingAll.set(readingKey, bucket);
        }
      }
      return {
        version: payload.version,
        vocab,
        kanji: payload.datasets.kanji,
        byId,
        byWord,
        byWordAll,
        byReadingAll,
        kanjiByChar,
        searchRecords: vocab.map((entry) => {
          const meaningExact = entry.meanings.map(latinNormalized);
          const primaryMeaning = meaningExact[0] ?? "";
          return {
            entry,
            word: normalized(entry.word),
            alt: entry.altWord === null ? "" : normalized(entry.altWord),
            reading: normalized(entry.reading),
            meanings: meaningExact.join("\u0000"),
            altLatin: latinNormalized(entry.altWord ?? ""),
            meaningExact,
            primaryMeaning,
            primaryTokens: englishWords(primaryMeaning),
            senseTokens: meaningExact.map(englishWords),
          };
        }),
      };
    });
  return dictionaryPromise;
}

const normalized = (value: string): string =>
  toHiragana(value.trim().normalize("NFKC")).toLocaleLowerCase("en");

const latinNormalized = (value: string): string =>
  value.trim().normalize("NFKC").toLocaleLowerCase("en");

const commonnessBoost = (entry: VocabEntry): number => {
  if (entry.source === "Bunki editorial interest pack") return 90;
  if (entry.jlpt === "N5") return 36;
  if (entry.jlpt === "N4") return 28;
  if (entry.jlpt === "N3") return 18;
  if (entry.jlpt === "N2") return 10;
  return 0;
};

const englishWords = (value: string): readonly string[] =>
  value
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9+\- ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export function searchDictionaryDetailed(
  dictionary: DictionaryIndex,
  query: string,
  limit = 80,
): readonly DictionarySearchResult[] {
  const raw = query.trim().normalize("NFKC");
  if (raw === "") return [];
  const hasJapanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(raw);
  const latin = latinNormalized(raw);
  const uppercaseAcronym = /^[A-Z][A-Z0-9+\-]{1,8}$/.test(raw);
  const japaneseNeedle = hasJapanese ? normalized(raw) : "";
  const romaji = !hasJapanese && !uppercaseAcronym ? normalized(raw) : "";
  const escapedLatin = latin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeEnglishWord =
    latin === "" ? null : new RegExp(`(?:^|[^a-z])${escapedLatin}(?:$|[^a-z])`, "i");
  const results: DictionarySearchResult[] = [];

  for (const record of dictionary.searchRecords) {
    const { entry, word, alt, reading } = record;
    let score = -1;
    let reason: DictionarySearchResult["reason"] = "partial match";
    if (hasJapanese) {
      if (word === japaneseNeedle || alt === japaneseNeedle) {
        score = 1_000;
        reason = "exact spelling";
      } else if (reading === japaneseNeedle) {
        score = 960;
        reason = "exact reading";
      } else if (
        word.startsWith(japaneseNeedle) ||
        alt.startsWith(japaneseNeedle) ||
        reading.startsWith(japaneseNeedle)
      ) {
        score = 720;
      } else if (
        word.includes(japaneseNeedle) ||
        alt.includes(japaneseNeedle) ||
        reading.includes(japaneseNeedle)
      ) {
        score = 520;
      }
    } else {
      const meaningExact =
        record.meaningExact ?? entry.meanings.map(latinNormalized);
      const primaryMeaning =
        record.primaryMeaning ?? meaningExact[0] ?? "";
      const primaryTokens =
        record.primaryTokens ?? englishWords(primaryMeaning);
      const senseTokens =
        record.senseTokens ?? meaningExact.map(englishWords);
      const altLatin =
        record.altLatin ?? latinNormalized(entry.altWord ?? "");
      const meanings =
        record.meanings || meaningExact.join("\u0000");
      const matchingSense = senseTokens.findIndex((tokens) =>
        tokens.includes(latin),
      );
      if (altLatin === latin && altLatin !== "") {
        score = 1_020;
        reason = "exact spelling";
      } else if (
        primaryMeaning === latin ||
        meaningExact.includes(latin)
      ) {
        score = primaryMeaning === latin ? 990 : 950;
        reason = "English meaning";
      } else if (primaryTokens.includes(latin)) {
        score = 970;
        reason = "English meaning";
      } else if (matchingSense >= 0) {
        score = 850 - Math.min(100, matchingSense * 12);
        reason = "English meaning";
      } else if (
        wholeEnglishWord !== null && wholeEnglishWord.test(meanings)
      ) {
        score = 820;
        reason = "English meaning";
      } else if (romaji !== "" && reading === romaji) {
        score = 880;
        reason = "romaji";
      } else if (romaji !== "" && reading.startsWith(romaji)) {
        score = 680;
        reason = "romaji";
      } else if (!uppercaseAcronym && meanings.includes(latin)) {
        score = 560;
        reason = "English meaning";
      }
    }
    if (score >= 0) {
      score += commonnessBoost(entry);
      score -= Math.min(40, entry.word.length * 1.5);
      results.push({ entry, score, reason });
    }
  }

  const seen = new Set<string>();
  return results
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.word.length - right.entry.word.length ||
        left.entry.word.localeCompare(right.entry.word, "ja"),
    )
    .filter((result) => {
      const key = `${result.entry.word}\u0000${result.entry.reading}\u0000${result.entry.meanings.join("|")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function searchDictionary(
  dictionary: DictionaryIndex,
  query: string,
  limit = 80,
): readonly VocabEntry[] {
  return searchDictionaryDetailed(dictionary, query, limit).map((result) => result.entry);
}

export function wordsForKanji(
  dictionary: DictionaryIndex,
  character: string,
  limit = 60,
): readonly VocabEntry[] {
  return dictionary.vocab
    .filter((entry) => entry.containsKanji.includes(character) || entry.word.includes(character))
    .slice(0, limit);
}

export function entriesNearLevel(
  dictionary: DictionaryIndex,
  level: string,
  limit = 20,
): readonly VocabEntry[] {
  const desired = level === "zero" ? "N5" : level === "N1+" ? "N1" : level;
  const tagged = dictionary.vocab.filter((entry) => entry.jlpt === desired).slice(0, limit);
  if (tagged.length > 0 || desired !== "N1") return tagged;

  const advancedSeeds = [
    "示唆",
    "内在",
    "超越",
    "不可逆",
    "自明",
    "相対性",
    "帰依",
    "縁起",
    "形而上学",
    "弁証法",
    "認識論",
    "淘汰",
  ];
  return advancedSeeds
    .map((word) => dictionary.byWord.get(word))
    .filter((entry): entry is VocabEntry => entry !== undefined)
    .slice(0, limit);
}
