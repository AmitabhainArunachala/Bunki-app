import type { LearnerState, SourceItem } from "./types";

const createdAt = "2026-07-29T00:00:00.000Z";

export const SAMPLE_SOURCE: SourceItem = {
  id: "source-bunki-sample",
  kind: "article",
  title: "分岐する学び — Bunki sample",
  url: "",
  text: `知らない言葉に出会うことは、道に迷うことではない。そこから新しい道が分岐していく。

辞書で意味を確かめ、漢字の成り立ちを眺め、実際の文脈でもう一度その言葉に触れる。学びは単語の一覧ではなく、経験どうしが結びつく生きた地図になる。

今日わからなかった表現が、明日の会話や記事の中で自然に戻ってくる。その再会を丁寧に重ねることで、日本語は暗記した知識から、自分で使える感覚へ変わっていく。`,
  addedAt: createdAt,
  progress: 0,
  provenance: "generated-sample",
  capturedVocabIds: [],
};

export const INITIAL_STATE: LearnerState = {
  version: 1,
  profile: {
    displayName: "John",
    currentLevel: "N2",
    target: "N1 fluency through meaningful immersion",
    interests: ["Japanese philosophy", "AI", "sacred mountains", "Kansai speech", "long-form YouTube"],
    dailyMinutes: 150,
  },
  memories: {},
  conceptMemories: {},
  sources: [SAMPLE_SOURCE],
  cards: [
    {
      id: "card-sample-bunki",
      vocabId: "vocab_1503340",
      sourceId: SAMPLE_SOURCE.id,
      front: "知らない言葉との出会いから、新しい道が＿＿していく。",
      back: "分岐（ぶんき）— branch / diverge\n知らない言葉との出会いから、新しい道が分岐していく。",
      context: "Bunki sample · source-anchored cloze",
      kind: "cloze",
      createdAt,
      dueAt: createdAt,
      intervalDays: 0,
      ease: 2.5,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
      fsrs: {
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: null,
      },
    },
    {
      id: "card-sample-context",
      vocabId: "vocab_1505630",
      sourceId: SAMPLE_SOURCE.id,
      front: "「文脈」を使って、単語暗記と生きた学習の違いを説明してください。",
      back: "文脈（ぶんみゃく）— context\n言葉は単独ではなく、実際に出会った文脈と結びつけて覚える。",
      context: "Bunki sample · active production",
      kind: "production",
      createdAt,
      dueAt: createdAt,
      intervalDays: 0,
      ease: 2.5,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
      fsrs: {
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: null,
      },
    },
  ],
  reviews: [],
  messages: [
    {
      id: "message-welcome",
      role: "teacher",
      text:
        "ようこそ。今日は何から始めましょうか？ 記事・動画・最近気になった表現のどれでも大丈夫です。言葉から漢字、文法、会話へ枝分かれして、最後は元の文脈に戻ります。",
      createdAt,
      contextVocabId: null,
      generated: true,
    },
  ],
  activeSourceId: SAMPLE_SOURCE.id,
  selectedVocabId: null,
  selectedKanji: null,
};
