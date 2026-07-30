import type { IpadicFeatures, Tokenizer } from "kuromoji";
import { toHiragana } from "wanakana";

import type { DictionaryIndex } from "./dictionary.ts";
import type { VocabEntry } from "./types.ts";

export interface ReaderToken {
  readonly text: string;
  readonly surface: string;
  readonly lemma: string;
  readonly reading: string;
  readonly position: number;
  readonly length: number;
  readonly entry: VocabEntry | null;
  readonly entryCandidates: readonly VocabEntry[];
  readonly ambiguous: boolean;
  readonly isJapanese: boolean;
}

export type JapaneseTokenizer = Tokenizer<IpadicFeatures>;

interface KuromojiBrowserApi {
  builder(options: { dicPath: string }): {
    build(callback: (error: Error | null, tokenizer: JapaneseTokenizer) => void): void;
  };
}

declare global {
  interface Window {
    kuromoji?: KuromojiBrowserApi;
  }
}

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const FUNCTION_POS = new Set(["助詞", "助動詞", "記号"]);
let tokenizerPromise: Promise<JapaneseTokenizer> | null = null;

function partOfSpeechMatches(tokenPos: string, entry: VocabEntry): boolean {
  const value = entry.pos.toLocaleLowerCase("en");
  if (tokenPos === "動詞") return value.includes("verb");
  if (tokenPos === "名詞") return value.includes("noun") || value.includes("pronoun");
  if (tokenPos === "形容詞") return value.includes("adjective");
  if (tokenPos === "副詞") return value.includes("adverb");
  if (tokenPos === "連体詞") return value.includes("pre-noun");
  if (tokenPos === "感動詞" || tokenPos === "フィラー")
    return value.includes("interjection");
  if (tokenPos === "接続詞") return value.includes("conjunction");
  return true;
}

function loadKuromojiRuntime(): Promise<KuromojiBrowserApi> {
  if (window.kuromoji !== undefined) return Promise.resolve(window.kuromoji);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-bunki-kuromoji="true"]',
    );
    const script = existing ?? document.createElement("script");
    const ready = (): void => {
      if (window.kuromoji === undefined) {
        reject(new Error("The Japanese morphology engine did not initialize."));
        return;
      }
      resolve(window.kuromoji);
    };
    script.addEventListener("load", ready, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("The Japanese morphology engine could not be loaded.")),
      { once: true },
    );
    if (existing === null) {
      script.src = "/kuromoji/kuromoji.js";
      script.async = true;
      script.dataset.bunkiKuromoji = "true";
      document.head.append(script);
    }
  });
}

export function loadJapaneseTokenizer(): Promise<JapaneseTokenizer> {
  tokenizerPromise ??= loadKuromojiRuntime().then(
    (kuromoji) =>
      new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath: "/kuromoji/" }).build((error, tokenizer) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(tokenizer);
        });
      }),
  );
  return tokenizerPromise;
}

export function cleanTranscript(raw: string): string {
  return raw
    .replace(/^\s*\d+\s*$/gm, "")
    .replace(
      /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{3}\s*-->\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{3}.*$/gm,
      "",
    )
    .replace(/<[^>]+>/g, "")
    .replace(/\[(?:音楽|拍手|Music|Applause)\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function tokenizeJapanese(
  text: string,
  dictionary: DictionaryIndex,
  tokenizer: JapaneseTokenizer,
): readonly ReaderToken[] {
  const rawTokens = tokenizer.tokenize(text);
  return rawTokens.map((token, tokenIndex) => {
    const textValue = token.surface_form;
    const japanese = JAPANESE.test(textValue);
    const basic =
      token.basic_form !== "" && token.basic_form !== "*"
        ? token.basic_form
        : textValue;
    const reading =
      token.reading !== undefined && token.reading !== "*"
        ? toHiragana(token.reading)
        : "";
    const effectivePos =
      textValue === "あの" && rawTokens[tokenIndex + 1]?.pos === "記号"
        ? "感動詞"
        : token.pos;
    const lemmaCandidates =
      japanese && !FUNCTION_POS.has(token.pos)
        ? [...(dictionary.byWordAll.get(basic) ?? [])]
        : [];
    const surfaceCandidates =
      japanese && !FUNCTION_POS.has(token.pos)
        ? [...(dictionary.byWordAll.get(textValue) ?? [])]
        : [];
    const readingCandidates =
      japanese && !FUNCTION_POS.has(token.pos) && KANA_ONLY.test(textValue)
        ? [
            ...(dictionary.byReadingAll.get(toHiragana(textValue)) ?? []),
            ...(dictionary.byReadingAll.get(toHiragana(basic)) ?? []),
          ]
        : [];
    const candidates = [...lemmaCandidates, ...surfaceCandidates, ...readingCandidates]
      .filter(
        (entry, index, all) =>
          all.findIndex((candidate) => candidate.id === entry.id) === index,
      )
      .sort(
        (left, right) =>
          Number(
            KANA_ONLY.test(textValue) &&
              toHiragana(right.reading) === toHiragana(textValue),
          ) -
            Number(
              KANA_ONLY.test(textValue) &&
                toHiragana(left.reading) === toHiragana(textValue),
            ) ||
          Number(partOfSpeechMatches(effectivePos, right)) -
            Number(partOfSpeechMatches(effectivePos, left)) ||
          Number(toHiragana(right.reading) === reading) -
            Number(toHiragana(left.reading) === reading),
      );
    const compatibleLemma = lemmaCandidates.find((candidate) =>
      partOfSpeechMatches(effectivePos, candidate),
    );
    const compatibleSurface = surfaceCandidates.find(
      (candidate) =>
        partOfSpeechMatches(effectivePos, candidate) &&
        (reading === "" || toHiragana(candidate.reading) === reading),
    );
    const compatibleReading = readingCandidates.find((candidate) =>
      partOfSpeechMatches(effectivePos, candidate),
    );
    const plausibleKanaIds = new Set(
      candidates
        .filter(
          (candidate) =>
            KANA_ONLY.test(textValue) &&
            partOfSpeechMatches(effectivePos, candidate) &&
            (toHiragana(candidate.reading) === toHiragana(textValue) ||
              toHiragana(candidate.reading) === reading ||
              candidate.word === basic),
        )
        .map((candidate) => candidate.id),
    );
    const ambiguous = KANA_ONLY.test(textValue) && plausibleKanaIds.size > 1;
    const entry =
      (basic !== textValue ? compatibleLemma ?? lemmaCandidates[0] : null) ??
      compatibleSurface ??
      compatibleReading ??
      candidates.find((candidate) => partOfSpeechMatches(effectivePos, candidate)) ??
      candidates.find(
        (candidate) =>
          reading !== "" && toHiragana(candidate.reading) === reading,
      ) ??
      candidates[0] ??
      null;
    const position = Math.max(0, (token.word_position ?? 1) - 1);
    return {
      text: textValue,
      surface: textValue,
      lemma: basic,
      reading,
      position,
      length: textValue.length,
      entry,
      entryCandidates: candidates,
      ambiguous,
      isJapanese: japanese,
    };
  });
}
