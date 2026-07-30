import type {
  CardProposal,
  Phase2State,
  SourceItem,
  TeacherRequest,
  TeacherResponse,
} from "./phase2-types.ts";
import { sourceTextFingerprint } from "./source-fingerprint.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const boundedString = (value: unknown, maximum: number): string | null =>
  typeof value === "string" && value.trim() !== "" && value.length <= maximum
    ? value.trim()
    : null;

export function validateTeacherRequest(value: unknown): TeacherRequest | null {
  if (!isRecord(value)) return null;
  const clientTurnId = boundedString(value.clientTurnId, 120);
  const input = boundedString(value.input, 4_000);
  const mode =
    value.mode === "conversation" ||
    value.mode === "explain" ||
    value.mode === "correct" ||
    value.mode === "roleplay"
      ? value.mode
      : null;
  if (clientTurnId === null || input === null || mode === null || !isRecord(value.profile))
    return null;
  const profile = value.profile;
  const currentLevel = boundedString(profile.currentLevel, 8);
  const targetLevel = boundedString(profile.targetLevel, 8);
  const target = boundedString(profile.target, 300);
  if (
    currentLevel === null ||
    targetLevel === null ||
    target === null ||
    !["zero", "N5", "N4", "N3", "N2", "N1", "N1+"].includes(currentLevel) ||
    !["zero", "N5", "N4", "N3", "N2", "N1", "N1+"].includes(targetLevel)
  )
    return null;

  const recentMessages = Array.isArray(value.recentMessages)
    ? value.recentMessages
        .filter(isRecord)
        .map((message) => ({
          role: message.role === "teacher" ? ("teacher" as const) : ("learner" as const),
          text: typeof message.text === "string" ? message.text.slice(0, 2_000) : "",
        }))
        .filter((message) => message.text !== "")
        .slice(-10)
    : [];
  const activeSource =
    isRecord(value.activeSource) &&
    typeof value.activeSource.id === "string" &&
    typeof value.activeSource.title === "string" &&
    typeof value.activeSource.excerpt === "string"
      ? {
          id: value.activeSource.id.slice(0, 160),
          title: value.activeSource.title.slice(0, 180),
          excerpt: value.activeSource.excerpt.slice(0, 5_000),
        }
      : null;
  const frontier = Array.isArray(value.frontier)
    ? value.frontier
        .filter(isRecord)
        .map((item) => ({
          conceptId:
            typeof item.conceptId === "string" ? item.conceptId.slice(0, 160) : "",
          surface: typeof item.surface === "string" ? item.surface.slice(0, 160) : "",
          dictionaryForm:
            typeof item.dictionaryForm === "string"
              ? item.dictionaryForm.slice(0, 160)
              : typeof item.surface === "string"
                ? item.surface.slice(0, 160)
                : "",
          reading: typeof item.reading === "string" ? item.reading.slice(0, 160) : "",
          forms: Array.isArray(item.forms)
            ? item.forms
                .filter(
                  (form): form is string =>
                    typeof form === "string" && form.trim() !== "",
                )
                .map((form) => form.slice(0, 160))
                .slice(0, 12)
            : [],
          meaning: typeof item.meaning === "string" ? item.meaning.slice(0, 500) : "",
          state:
            item.state === "fragile" ||
            item.state === "learning" ||
            item.state === "encountered" ||
            item.state === "established"
              ? item.state
              : ("unseen" as const),
          reason: typeof item.reason === "string" ? item.reason.slice(0, 300) : "",
          priorContexts: Array.isArray(item.priorContexts)
            ? item.priorContexts
                .filter(
                  (context): context is string =>
                    typeof context === "string" && context.trim() !== "",
                )
                .map((context) => context.slice(0, 500))
                .slice(0, 3)
            : [],
        }))
        .filter((item) => item.conceptId !== "")
        .slice(0, 12)
    : [];

  return {
    clientTurnId,
    input,
    mode,
    profile: {
      currentLevel: currentLevel as TeacherRequest["profile"]["currentLevel"],
      targetLevel: targetLevel as TeacherRequest["profile"]["targetLevel"],
      target,
      interests: Array.isArray(profile.interests)
        ? profile.interests
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.slice(0, 100))
            .slice(0, 8)
        : [],
    },
    recentMessages,
    activeSource,
    frontier,
  };
}

type TeacherConceptCue = Pick<
  TeacherRequest["frontier"][number],
  "conceptId" | "surface" | "dictionaryForm" | "reading" | "forms"
>;

function normalizeJapanese(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    )
    .toLocaleLowerCase("ja");
}

function reliableConceptForms(cue: TeacherConceptCue): readonly string[] {
  const conceptSuffix = cue.conceptId.includes(":")
    ? cue.conceptId.slice(cue.conceptId.indexOf(":") + 1)
    : "";
  const forms = [
    cue.surface,
    cue.dictionaryForm,
    cue.reading,
    ...cue.forms,
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(conceptSuffix)
      ? conceptSuffix
      : "",
  ];
  return [
    ...new Set(
      forms
        .map((form) =>
          normalizeJapanese(form)
            .trim()
            .replace(/^[\s~〜～・…]+|[\s~〜～・…]+$/gu, ""),
        )
        .filter((form) => {
          const visible = [
            ...form.replace(
              /[^\p{Letter}\p{Number}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
              "",
            ),
          ];
          if (visible.length === 0) return false;
          if (/\p{Script=Han}/u.test(form)) return true;
          return visible.length >= 2;
        }),
    ),
  ];
}

/**
 * Treat model-declared learning evidence as a proposal, not as ground truth.
 * A declaration is admitted only when its allowlisted frontier concept has a
 * reliable written form or reading in the Japanese reply itself.
 */
export function boundTeacherResponseToReply(
  response: TeacherResponse,
  frontier: readonly TeacherConceptCue[],
): TeacherResponse {
  const normalizedReply = normalizeJapanese(response.replyJa);
  const visibleConceptIds = new Set(
    frontier
      .filter((cue) =>
        reliableConceptForms(cue).some((form) => normalizedReply.includes(form)),
      )
      .map((cue) => cue.conceptId),
  );
  return {
    ...response,
    reintroducedConceptIds: response.reintroducedConceptIds.filter((conceptId) =>
      visibleConceptIds.has(conceptId),
    ),
    evidence: response.evidence.filter((item) =>
      visibleConceptIds.has(item.conceptId),
    ),
  };
}

export const TEACHER_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "replyJa",
    "supportEn",
    "reintroducedConceptIds",
    "corrections",
    "evidence",
    "branches",
    "cardProposals",
    "nextMove",
    "whyThisFits",
  ],
  properties: {
    replyJa: { type: "string", minLength: 1, maxLength: 4_000 },
    supportEn: { type: ["string", "null"], maxLength: 2_000 },
    reintroducedConceptIds: {
      type: "array",
      maxItems: 4,
      items: { type: "string", maxLength: 160 },
    },
    corrections: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["original", "corrected", "explanation", "severity"],
        properties: {
          original: { type: "string", maxLength: 400 },
          corrected: { type: "string", maxLength: 400 },
          explanation: { type: "string", maxLength: 800 },
          severity: { type: "string", enum: ["note", "minor", "important"] },
        },
      },
    },
    evidence: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["conceptId", "skill", "outcome", "confidence"],
        properties: {
          conceptId: { type: "string", maxLength: 160 },
          skill: {
            type: "string",
            enum: ["recognition", "reading", "listening", "production", "writing"],
          },
          outcome: { type: "string", enum: ["success", "partial", "failure"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    branches: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string", maxLength: 160 },
    },
    cardProposals: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["conceptId", "front", "back", "rationale"],
        properties: {
          conceptId: { type: "string", maxLength: 160 },
          front: { type: "string", maxLength: 800 },
          back: { type: "string", maxLength: 1_200 },
          rationale: { type: "string", maxLength: 400 },
        },
      },
    },
    nextMove: { type: "string", maxLength: 300 },
    whyThisFits: { type: "string", maxLength: 500 },
  },
} as const;

export function validateTeacherResponse(
  value: unknown,
  model: string | null,
): TeacherResponse | null {
  if (!isRecord(value)) return null;
  const replyJa = boundedString(value.replyJa, 4_000);
  const nextMove = boundedString(value.nextMove, 300);
  const whyThisFits = boundedString(value.whyThisFits, 500);
  if (replyJa === null || nextMove === null || whyThisFits === null) return null;
  const supportEn =
    value.supportEn === null
      ? null
      : typeof value.supportEn === "string"
        ? value.supportEn.slice(0, 2_000)
      : null;
  const reintroducedConceptIds = Array.isArray(value.reintroducedConceptIds)
    ? value.reintroducedConceptIds
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim() !== "",
        )
        .map((item) => item.slice(0, 160))
        .slice(0, 4)
    : [];
  const corrections = Array.isArray(value.corrections)
    ? value.corrections
        .filter(isRecord)
        .map((item) => ({
          original: typeof item.original === "string" ? item.original.slice(0, 400) : "",
          corrected: typeof item.corrected === "string" ? item.corrected.slice(0, 400) : "",
          explanation:
            typeof item.explanation === "string" ? item.explanation.slice(0, 800) : "",
          severity:
            item.severity === "important" || item.severity === "minor"
              ? item.severity
              : ("note" as const),
        }))
        .filter(
          (item) =>
            item.original !== "" && item.corrected !== "" && item.explanation !== "",
        )
        .slice(0, 4)
    : [];
  const evidence = Array.isArray(value.evidence)
    ? value.evidence
        .filter(isRecord)
        .map((item) => ({
          conceptId:
            typeof item.conceptId === "string" ? item.conceptId.slice(0, 160) : "",
          skill:
            item.skill === "reading" ||
            item.skill === "listening" ||
            item.skill === "production" ||
            item.skill === "writing"
              ? item.skill
              : ("recognition" as const),
          outcome:
            item.outcome === "failure" || item.outcome === "partial"
              ? item.outcome
              : ("success" as const),
          confidence:
            typeof item.confidence === "number"
              ? Math.max(0, Math.min(1, item.confidence))
              : 0.5,
        }))
        .filter((item) => item.conceptId !== "")
        .slice(0, 8)
    : [];
  const branches = Array.isArray(value.branches)
    ? value.branches
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map((item) => item.slice(0, 160))
        .slice(0, 4)
    : [];
  const cardProposals = Array.isArray(value.cardProposals)
    ? value.cardProposals
        .filter(isRecord)
        .map((item) => ({
          conceptId:
            typeof item.conceptId === "string" ? item.conceptId.slice(0, 160) : "",
          front: typeof item.front === "string" ? item.front.slice(0, 800) : "",
          back: typeof item.back === "string" ? item.back.slice(0, 1_200) : "",
          rationale:
            typeof item.rationale === "string" ? item.rationale.slice(0, 400) : "",
        }))
        .filter(
          (item) =>
            item.conceptId !== "" &&
            item.front !== "" &&
            item.back !== "" &&
            item.rationale !== "",
        )
        .slice(0, 3)
    : [];
  return {
    replyJa,
    supportEn,
    reintroducedConceptIds,
    corrections,
    evidence,
    branches:
      branches.length >= 2 ? branches : ["例をもう一つ", "元の文脈に戻る"],
    cardProposals,
    nextMove,
    whyThisFits,
    mode: "live-ai",
    model,
  };
}

export function localCoachResponse(
  input: string,
  state: Phase2State,
): TeacherResponse {
  const active = state.sources.find((source) => source.id === state.activeSourceId);
  const level = state.profile.currentLevel;
  const beginner = level === "zero" || level === "N5";
  return {
    replyJa: beginner
      ? `いいですね。「${input.slice(0, 80)}」について、まず短い日本語で言ってみましょう。\n\nわたしは＿＿が好きです。\n今日は＿＿を見ました。`
      : `「${input.slice(0, 120)}」を、もう一段自然な日本語へ育てましょう。主張を一つに絞り、理由を「というのも」で足してみてください。${active ? `「${active.title}」で出会った表現を一つ再利用できれば、文脈の糸がつながります。` : ""}`,
    supportEn: beginner
      ? "This is the offline practice coach. Fill one blank, then say the sentence aloud."
      : "Offline practice coach: state one claim, add a reason, and reuse one expression from your current source.",
    reintroducedConceptIds: [],
    corrections: [],
    evidence: [],
    branches: beginner
      ? ["短い答えを作る", "音読する", "単語を調べる"]
      : ["ニュアンスを比べる", "一文を添削する", "元の資料へ戻る"],
    cardProposals: [],
    nextMove: "Write one Japanese sentence; Bunki will keep it in this conversation.",
    whyThisFits:
      "No live model is connected, so Bunki is offering a transparent level-aware practice frame without pretending to evaluate your Japanese.",
    mode: "local-coach",
    model: null,
  };
}

export function teacherProposalsToCards(
  response: TeacherResponse,
  conversationSource: SourceItem,
  priorLineage: Readonly<
    Record<
      string,
      readonly {
        readonly sourceId: string;
        readonly sourceFingerprint: string;
        readonly exactText: string;
      }[]
    >
  > = {},
): readonly CardProposal[] {
  return response.cardProposals.map((proposal, index) => ({
    id: `teacher-proposal-${crypto.randomUUID()}-${String(index)}`,
    conceptId: proposal.conceptId,
    sourceId: conversationSource.id,
    sourceSentence: response.replyJa,
    front: proposal.front,
    back: proposal.back,
    reading: "",
    note: "",
    rationale: proposal.rationale,
    tags: [
      "conversation",
      "generated-proposal",
      ...(response.reintroducedConceptIds.includes(proposal.conceptId)
        ? ["frontier-reintroduction"]
        : []),
    ],
    lineage: [
      {
        sourceId: conversationSource.id,
        sourceFingerprint: sourceTextFingerprint(conversationSource.text),
        exactText: response.replyJa,
        role: "target",
        generated: true,
      },
      ...(priorLineage[proposal.conceptId] ?? []).slice(0, 3).map((anchor) => ({
        ...anchor,
        role: "prior" as const,
        generated: false,
      })),
    ],
    kind: "production",
    skill: "production",
    origin: "conversation",
    generated: true,
    selected: true,
  }));
}
