import {
  grammarMatchesInText,
  isGrammarMatchSafeToMine,
} from "./grammar.ts";
import { levelDistance, memoryState } from "./learner-engine.ts";
import { serializeEmptyFsrs } from "./phase2-state.ts";
import { sourceTextFingerprint } from "./source-fingerprint.ts";
import type {
  CardProposal,
  Phase2State,
  SourceAnalysis,
  SourceAnalysisCandidate,
  SourceItem,
  StagedPacket,
} from "./phase2-types.ts";
import type { ReaderToken } from "./tokenize.ts";

const FUNCTION_WORDS = new Set([
  "する",
  "ある",
  "いる",
  "なる",
  "こと",
  "もの",
  "これ",
  "それ",
  "ため",
  "よう",
  "ところ",
  "さん",
]);

const hash = (value: string): string => {
  let total = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    total ^= value.charCodeAt(index);
    total = Math.imul(total, 16777619);
  }
  return (total >>> 0).toString(36);
};

export const textFingerprint = sourceTextFingerprint;

export interface SentenceSpan {
  readonly id: string;
  readonly index: number;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const MAX_SENTENCE_SPAN = 220;

export function sentenceSpans(text: string): readonly SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const matcher = /[^。！？\n]+[。！？]?|\n+/gu;
  const pushSpan = (raw: string, absoluteStart: number): void => {
    let cursor = 0;
    while (cursor < raw.length) {
      let end = Math.min(raw.length, cursor + MAX_SENTENCE_SPAN);
      if (end < raw.length) {
        const floor = cursor + Math.floor(MAX_SENTENCE_SPAN * 0.55);
        let preferred = -1;
        for (const delimiter of ["、", "，", ",", "；", ";", " "]) {
          const found = raw.lastIndexOf(delimiter, end);
          if (found >= floor) preferred = Math.max(preferred, found + delimiter.length);
        }
        if (preferred > cursor) end = preferred;
      }
      const piece = raw.slice(cursor, end);
      const leading = piece.length - piece.trimStart().length;
      const sentence = piece.trim();
      if (sentence !== "") {
        const start = absoluteStart + cursor + leading;
        spans.push({
          id: `sentence-${String(spans.length)}-${hash(sentence)}`,
          index: spans.length,
          text: sentence,
          start,
          end: start + sentence.length,
        });
      }
      cursor = end;
    }
  };
  let result: RegExpExecArray | null;
  while ((result = matcher.exec(text)) !== null) {
    const raw = result[0];
    if (/^\s+$/.test(raw)) continue;
    pushSpan(raw, result.index);
  }
  return spans;
}

const levelScore = (level: string | null, state: Phase2State): number => {
  const distance = levelDistance(level, state.profile.currentLevel);
  if (state.profile.currentLevel === "zero") return distance <= 1 ? 28 : -distance * 12;
  return 30 - distance * 12;
};

const readerConfidence = (
  memory: Phase2State["memories"][string] | undefined,
): number =>
  memory === undefined
    ? 0
    : Math.max(
        memory.axes.recognition.confidence,
        memory.axes.reading.confidence,
      );

function candidateReason(
  candidate: {
    readonly recurrence: number;
    readonly sourceRecurrence: number;
    readonly memoryState: ReturnType<typeof memoryState>;
    readonly level: string | null;
  },
): string {
  if (candidate.memoryState === "fragile")
    return "Reinforce: previous review evidence is fragile, so Bunki chose a fresh source sentence.";
  if (candidate.sourceRecurrence > 1)
    return `Acquire: it appeared in ${String(candidate.sourceRecurrence)} different sources and is not established.`;
  if (candidate.recurrence > 1)
    return `Acquire: it recurs ${String(candidate.recurrence)} times in this source.`;
  if (candidate.level)
    return `Acquire: ${candidate.level} is close to the learner’s provisional edge and the sentence remains useful.`;
  return "Acquire: a content word in a useful sentence, ranked below stronger evidence.";
}

export function analyzeSource(
  source: SourceItem,
  tokens: readonly ReaderToken[],
  state: Phase2State,
): SourceAnalysis {
  const sentences = sentenceSpans(source.text);
  const occurrences = new Map<
    string,
    {
      readonly token: ReaderToken;
      readonly sentence: SentenceSpan;
      readonly count: number;
    }
  >();
  const distinctInSource = new Map<string, number>();
  let sentenceCursor = 0;

  for (const token of tokens) {
    if (
      token.entry === null ||
      token.ambiguous ||
      token.surface.trim() === "" ||
      FUNCTION_WORDS.has(token.lemma) ||
      /(particle|auxiliary|conjunction|pronoun|copula)/i.test(token.entry.pos)
    )
      continue;
    while (
      sentenceCursor < sentences.length &&
      token.position >= sentences[sentenceCursor]!.end
    )
      sentenceCursor += 1;
    const possibleSentence = sentences[sentenceCursor];
    const sentence =
      possibleSentence &&
      token.position >= possibleSentence.start &&
      token.position < possibleSentence.end
        ? possibleSentence
        : null;
    if (sentence === null || sentence.text.length < 4 || sentence.text.length > 240)
      continue;
    distinctInSource.set(token.entry.id, (distinctInSource.get(token.entry.id) ?? 0) + 1);
    const key = token.entry.id;
    const existing = occurrences.get(key);
    if (existing === undefined) {
      occurrences.set(key, { token, sentence, count: 1 });
    } else {
      occurrences.set(key, { ...existing, count: existing.count + 1 });
    }
  }

  const candidates: SourceAnalysisCandidate[] = [];
  for (const { token, sentence, count } of occurrences.values()) {
    if (token.entry === null) continue;
    const memory = state.memories[token.entry.id];
    const derived = memoryState(memory);
    if (derived === "established" || memory?.intent === "ignore" || memory?.suspended)
      continue;
    const sourceRecurrence = new Set([
      ...(memory?.sourceIds ?? []),
      source.id,
    ]).size;
    const score =
      (derived === "fragile"
        ? 150
        : derived === "learning"
          ? 105
          : derived === "encountered"
            ? 82
            : 64) +
      Math.min(4, count) * 14 +
      Math.min(4, sourceRecurrence) * 12 +
      levelScore(token.entry.jlpt, state) +
      Math.min(18, sentence.text.length / 8) -
      Math.max(0, sentence.text.length - 150) / 3;
    candidates.push({
      conceptId: token.entry.id,
      kind: "vocabulary",
      surface: token.surface,
      dictionaryForm: token.entry.word,
      reading: token.entry.reading,
      meaning: token.entry.meanings.slice(0, 2).join("; "),
      sentence: sentence.text,
      sentenceIndex: sentence.index,
      startInSentence: Math.max(0, token.position - sentence.start),
      endInSentence: Math.max(
        0,
        token.position - sentence.start + token.surface.length,
      ),
      score,
      reason:
        readerConfidence(memory) >= 0.72 &&
        (memory?.axes.production.confidence ?? 0) < 0.42
          ? "Activate: this word is readable, but production is still at the edge. Use the source sentence as a model."
          : candidateReason({
              recurrence: count,
              sourceRecurrence,
              memoryState: derived,
              level: token.entry.jlpt,
            }),
      memoryState: derived,
    });
  }

  const grammar = new Map<
    string,
    {
      readonly pattern: ReturnType<typeof grammarMatchesInText>[number]["pattern"];
      readonly sentence: SentenceSpan;
      readonly cue: string;
      readonly start: number;
      readonly end: number;
    }
  >();
  for (const sentence of sentences) {
    for (const match of grammarMatchesInText(sentence.text).filter(
      isGrammarMatchSafeToMine,
    )) {
      if (!grammar.has(match.pattern.id))
        grammar.set(match.pattern.id, {
          pattern: match.pattern,
          sentence,
          cue: match.cue,
          start: match.start,
          end: match.end,
        });
    }
  }
  for (const { pattern, sentence, cue, start, end } of grammar.values()) {
    const conceptId = `grammar:${pattern.id}`;
    const derived = memoryState(state.memories[conceptId]);
    if (derived === "established") continue;
    candidates.push({
      conceptId,
      kind: "grammar",
      surface: cue,
      dictionaryForm: pattern.pattern,
      reading: "",
      meaning: pattern.meaning,
      sentence: sentence.text,
      sentenceIndex: sentence.index,
      startInSentence: start,
      endInSentence: end,
      score:
        (derived === "fragile" ? 150 : derived === "learning" ? 100 : 70) +
        levelScore(pattern.level, state),
      reason:
        derived === "fragile"
          ? "Reinforce: this grammar previously caused difficulty and appears in a real sentence."
          : `${pattern.level} grammar detected in the source; level labels are editorial estimates.`,
      memoryState: derived,
    });
  }

  const ranked = candidates
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.sentenceIndex - right.sentenceIndex ||
        left.surface.localeCompare(right.surface, "ja"),
    )
    .slice(0, 30);
  const coverageTokens = tokens.filter(
    (token) =>
      token.entry !== null &&
      !FUNCTION_WORDS.has(token.lemma) &&
      !/(particle|auxiliary|conjunction|pronoun|copula)/i.test(token.entry.pos),
  );
  const knownCount = coverageTokens.filter((token) => {
    if (token.entry === null || token.ambiguous) return false;
    return readerConfidence(state.memories[token.entry.id]) >= 0.72;
  }).length;
  const learningCount = coverageTokens.filter((token) => {
    if (token.entry === null || token.ambiguous) return false;
    const confidence = readerConfidence(state.memories[token.entry.id]);
    return confidence > 0 && confidence < 0.72;
  }).length;
  const unknownCount = Math.max(
    0,
    coverageTokens.length - knownCount - learningCount,
  );
  const denominator = knownCount + learningCount + unknownCount;

  return {
    analyzedAt: new Date().toISOString(),
    textFingerprint: textFingerprint(source.text),
    sentenceCount: sentences.length,
    tokenCount: tokens.length,
    coverage:
      denominator === 0
        ? 0
        : Math.round(((knownCount + learningCount * 0.45) / denominator) * 100),
    knownCount,
    learningCount,
    unknownCount,
    candidates: ranked,
    grammarIds: [...grammar.keys()],
  };
}

export interface ConceptContext {
  readonly source: SourceItem;
  readonly sentence: string;
  readonly position: number | null;
}

export function contextsForConcept(
  state: Phase2State,
  conceptId: string,
  limit = 6,
): readonly ConceptContext[] {
  const memory = state.memories[conceptId];
  if (!memory) return [];
  const result: ConceptContext[] = [];
  for (const sourceId of memory.sourceIds) {
    const source = state.sources.find((item) => item.id === sourceId);
    if (!source) continue;
    for (const fingerprint of memory.contextFingerprints) {
      if (
        fingerprint.length >= 4 &&
        fingerprint.length <= 240 &&
        source.text.includes(fingerprint)
      ) {
        result.push({ source, sentence: fingerprint, position: null });
        break;
      }
      // Legacy absolute-position anchors cannot be trusted after editable source
      // text changes. New encounters store the exact sentence instead.
    }
    if (result.length >= limit) break;
  }
  return result.filter(
    (context, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.source.id === context.source.id &&
          candidate.sentence === context.sentence,
      ) === index,
  );
}

function previousContext(
  state: Phase2State,
  conceptId: string,
  currentSourceId: string,
): { readonly source: SourceItem; readonly sentence: string } | null {
  const context = contextsForConcept(state, conceptId).find(
    (item) => item.source.id !== currentSourceId,
  );
  return context ?? null;
}

export function stageSourcePacket(
  source: SourceItem,
  analysis: SourceAnalysis,
  state: Phase2State,
): StagedPacket {
  const limit =
    state.profile.currentLevel === "zero" || state.profile.currentLevel === "N5"
      ? 3
      : state.profile.currentLevel === "N4" || state.profile.currentLevel === "N3"
        ? 5
        : 7;
  const proposals: CardProposal[] = analysis.candidates
    .filter(
      (candidate) =>
        candidate.kind === "grammar" ||
        (Number.isInteger(candidate.startInSentence) &&
          Number.isInteger(candidate.endInSentence) &&
          candidate.startInSentence >= 0 &&
          candidate.endInSentence > candidate.startInSentence &&
          candidate.sentence.slice(
            candidate.startInSentence,
            candidate.endInSentence,
          ) === candidate.surface),
    )
    .slice(0, limit)
    .map((candidate) => {
    const previous = previousContext(
      state,
      candidate.conceptId,
      source.id,
    );
    const sourceSentence = candidate.sentence;
    const memory = state.memories[candidate.conceptId];
    const productionTarget =
      candidate.kind === "vocabulary" &&
      readerConfidence(memory) >= 0.72 &&
      (memory?.axes.production.confidence ?? 0) < 0.42;
    const front =
      candidate.kind === "grammar"
        ? `${candidate.surface} はこの文でどう働いている？\n${sourceSentence}`
        : productionTarget
          ? `${candidate.dictionaryForm}を使って、同じ意味の新しい一文を作ってください。\nModel: ${sourceSentence}`
        : `${sourceSentence.slice(0, candidate.startInSentence)}＿＿${sourceSentence.slice(candidate.endInSentence)}`;
    const back =
      candidate.kind === "grammar"
        ? `${candidate.meaning}\n${sourceSentence}`
        : `${candidate.dictionaryForm}${candidate.reading ? `（${candidate.reading}）` : ""} — ${candidate.meaning}${candidate.surface === candidate.dictionaryForm ? "" : `\nSource form: ${candidate.surface}`}\n${sourceSentence}`;
    return {
      id: `proposal-${hash(`${source.id}:${candidate.conceptId}:${String(candidate.sentenceIndex)}`)}`,
      conceptId: candidate.conceptId,
      sourceId: source.id,
      sourceSentence,
      front,
      back,
      reading: candidate.reading,
      note:
        previous === null
          ? ""
          : `Previously met in “${previous.source.title}”: ${previous.sentence}`,
      rationale:
        previous === null
          ? candidate.reason
          : `${candidate.reason} Woven with one earlier exact source encounter.`,
      tags: [
        candidate.kind,
        candidate.memoryState,
        `source:${source.id}`,
        ...(previous === null ? [] : [`woven:${previous.source.id}`]),
      ],
      lineage: [
        {
          sourceId: source.id,
          sourceFingerprint: textFingerprint(source.text),
          exactText: sourceSentence,
          role: "target",
          generated: false,
        },
        ...(previous === null
          ? []
          : [
              {
                sourceId: previous.source.id,
                sourceFingerprint: textFingerprint(previous.source.text),
                exactText: previous.sentence,
                role: "prior" as const,
                generated: false,
              },
            ]),
      ],
      kind:
        candidate.kind === "grammar"
          ? "grammar"
          : productionTarget
            ? "production"
            : "cloze",
      skill:
        candidate.kind === "grammar" || productionTarget
          ? "production"
          : "recognition",
      origin: "source",
      generated: false,
      selected: true,
    };
    });
  return {
    id: `packet-${crypto.randomUUID()}`,
    sourceId: source.id,
    title: `Learning edge · ${source.title}`,
    createdAt: new Date().toISOString(),
    proposals,
  };
}

export function proposalToCard(proposal: CardProposal, at = new Date()): import("./phase2-types.ts").LearningCard {
  return {
    id: `card-${crypto.randomUUID()}`,
    conceptId: proposal.conceptId,
    sourceId: proposal.sourceId,
    sourceSentence: proposal.sourceSentence,
    front: proposal.front,
    back: proposal.back,
    reading: proposal.reading,
    note: proposal.note,
    rationale: proposal.rationale,
    tags: proposal.tags,
    lineage: proposal.lineage,
    kind: proposal.kind,
    skill: proposal.skill,
    origin: proposal.origin,
    generated: proposal.generated,
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
    dueAt: at.toISOString(),
    suspended: false,
    leech: false,
    fsrs: serializeEmptyFsrs(at),
  };
}

export function normalizedProposalKey(proposal: Pick<CardProposal, "conceptId" | "sourceSentence" | "kind">): string {
  return `${proposal.conceptId}\u0000${proposal.kind}\u0000${proposal.sourceSentence
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()}`;
}

export function hasEquivalentCard(
  state: Phase2State,
  proposal: CardProposal,
): boolean {
  const target = normalizedProposalKey(proposal);
  return state.cards.some(
    (card) =>
      normalizedProposalKey({
        conceptId: card.conceptId,
        sourceSentence: card.sourceSentence,
        kind: card.kind,
      }) === target,
  );
}
