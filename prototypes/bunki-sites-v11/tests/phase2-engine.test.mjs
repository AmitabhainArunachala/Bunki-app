import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTeacherEvidence,
  bestNextAction,
  memoryState,
  recordEvidence,
} from "../app/lib/learner-engine.ts";
import {
  analyzeSource,
  contextsForConcept,
  hasEquivalentCard,
  proposalToCard,
  sentenceSpans,
  stageSourcePacket,
  textFingerprint,
} from "../app/lib/mining-engine.ts";
import { phase2CardsToAnkiTsv } from "../app/lib/export-format.ts";
import {
  createInitialPhase2State,
  MAX_CARD_BACK_CHARACTERS,
  MAX_CARD_FRONT_CHARACTERS,
  MAX_CARD_NOTE_CHARACTERS,
  migrateToPhase2,
  removeCardFromReviewSession,
  serializeEmptyFsrs,
  threeWayMergePhase2States,
} from "../app/lib/phase2-state.ts";
import {
  rateLearningCard,
  ratingPreviews,
  sessionProgress,
  startReviewSession,
} from "../app/lib/phase2-scheduler.ts";
import {
  searchDictionaryDetailed,
} from "../app/lib/dictionary.ts";
import { grammarInText } from "../app/lib/grammar.ts";
import {
  boundTeacherResponseToReply,
  teacherProposalsToCards,
  validateTeacherRequest,
  validateTeacherResponse,
} from "../app/lib/teacher-contract.ts";
import { validatePhase2StateForPersistence } from "../app/lib/phase2-validation.ts";

const at = "2026-07-30T08:00:00.000Z";

const entry = (id, word, reading, meanings, jlpt = null, altWord = null) => ({
  id,
  source: "test",
  word,
  altWord,
  reading,
  meanings,
  pos: "verb",
  jlpt,
  containsKanji: [...word].filter((character) => /\p{Script=Han}/u.test(character)),
});

test("a fresh learner is genuinely fresh and gets onboarding first", () => {
  const state = createInitialPhase2State();
  assert.equal(state.profile.displayName, "Learner");
  assert.equal(state.profile.currentLevel, "zero");
  assert.equal(state.profile.onboardingComplete, false);
  assert.deepEqual(state.sources, []);
  assert.equal(bestNextAction(state).kind, "onboard");
});

test("v2 migration preserves multi-axis memory, lineage, and full card metadata", () => {
  const base = createInitialPhase2State();
  const recognition = {
    attempts: 5,
    successes: 4,
    partials: 0,
    failures: 1,
    confidence: 0.71,
    lastOutcome: "success",
    lastAt: at,
  };
  const memory = {
    conceptId: "word:話す",
    kind: "vocabulary",
    intent: "keep",
    firstSeenAt: at,
    lastSeenAt: at,
    exposures: 8,
    sourceIds: ["source-a", "source-b"],
    contextFingerprints: ["a:1", "b:2"],
    uncertainties: ["register"],
    axes: {
      recognition,
      reading: { ...recognition, confidence: 0.55 },
      listening: { ...recognition, confidence: 0.31 },
      production: { ...recognition, confidence: 0.44 },
      writing: { ...recognition, confidence: 0.12 },
    },
    reviewCount: 5,
    lapseCount: 1,
    consecutiveFailures: 0,
    suspended: false,
  };
  const card = {
    id: "card-a",
    conceptId: memory.conceptId,
    sourceId: "source-b",
    sourceSentence: "昨日は友達と話していた。",
    front: "昨日は友達と＿＿いた。",
    back: "話して",
    reading: "はなす",
    note: "Earlier source: source-a",
    rationale: "A repeated edge across two exact sources.",
    tags: ["woven:source-a", "source:source-b"],
    lineage: [
      {
        sourceId: "source-b",
        sourceFingerprint: "fnv1a:new:1",
        exactText: "昨日は友達と話していた。",
        role: "target",
        generated: false,
      },
      {
        sourceId: "source-a",
        sourceFingerprint: "fnv1a:old:1",
        exactText: "友達と長く話した。",
        role: "prior",
        generated: false,
      },
    ],
    kind: "cloze",
    skill: "production",
    origin: "source",
    generated: false,
    createdAt: at,
    updatedAt: at,
    dueAt: at,
    suspended: true,
    leech: true,
    fsrs: { ...serializeEmptyFsrs(new Date(at)), reps: 7, lapses: 3 },
  };
  const migrated = migrateToPhase2({
    ...base,
    version: 2,
    revision: 17,
    profile: {
      ...base.profile,
      onboardingComplete: true,
      placementComplete: true,
      placementAnswers: [{ itemId: "n2", level: "N2", correct: true }],
    },
    memories: { [memory.conceptId]: memory },
    cards: [card],
  });

  assert.equal(migrated.revision, 17);
  assert.deepEqual(migrated.memories[memory.conceptId].sourceIds, ["source-a", "source-b"]);
  assert.equal(migrated.memories[memory.conceptId].axes.production.confidence, 0.44);
  assert.equal(migrated.memories[memory.conceptId].intent, "keep");
  assert.equal(migrated.cards[0].rationale, card.rationale);
  assert.deepEqual(migrated.cards[0].tags, card.tags);
  assert.deepEqual(migrated.cards[0].lineage, card.lineage);
  assert.equal(migrated.cards[0].skill, "production");
  assert.equal(migrated.cards[0].suspended, true);
  assert.equal(migrated.cards[0].fsrs.reps, 7);
  assert.deepEqual(migrated.profile.placementAnswers, [
    { itemId: "n2", level: "N2", correct: true },
  ]);
});

test("v1 migration preserves review evidence and an auditable history marker", () => {
  const emptyFsrs = serializeEmptyFsrs(new Date(at));
  const migrated = migrateToPhase2({
    version: 1,
    profile: {
      displayName: "Legacy learner",
      currentLevel: "N3",
      target: "Read naturally",
      interests: [],
      dailyMinutes: 30,
    },
    memories: {
      "word:学ぶ": {
        vocabId: "word:学ぶ",
        status: "learning",
        firstSeenAt: at,
        lastSeenAt: at,
        lookups: 1,
        sourceIds: [],
        uncertainty: [],
      },
    },
    sources: [],
    cards: [
      {
        id: "legacy-card",
        conceptId: "word:学ぶ",
        vocabId: "word:学ぶ",
        sourceId: null,
        front: "学ぶ",
        back: "to learn",
        context: "",
        kind: "sentence",
        createdAt: at,
        dueAt: at,
        intervalDays: 0,
        ease: 2.5,
        repetitions: 0,
        lapses: 0,
        lastReviewedAt: null,
        fsrs: emptyFsrs,
      },
    ],
    reviews: [
      {
        id: "legacy-review",
        cardId: "legacy-card",
        rating: 1,
        reviewedAt: at,
        previousDueAt: at,
        nextDueAt: at,
      },
    ],
    messages: [],
    activeSourceId: null,
    selectedVocabId: null,
    selectedKanji: null,
  });
  assert.equal(migrated.memories["word:学ぶ"].reviewCount, 1);
  assert.equal(
    migrated.memories["word:学ぶ"].axes.recognition.failures,
    1,
  );
  assert.equal(migrated.activity[0].id, "legacy-review");
  assert.match(migrated.activity[0].label, /Migrated review/);
  assert.deepEqual(migrated.reviewEvents, []);
});

test("learner memory is evidence-based across recognition and production", () => {
  let memory;
  for (let index = 0; index < 5; index += 1) {
    memory = recordEvidence(memory, {
      conceptId: "word:分岐",
      kind: "vocabulary",
      skill: "recognition",
      outcome: "success",
      at,
      sourceId: `source-${index}`,
      contextFingerprint: `sentence-${index}`,
    });
  }
  assert.equal(memoryState(memory), "learning");
  for (let index = 0; index < 3; index += 1) {
    memory = recordEvidence(memory, {
      conceptId: "word:分岐",
      kind: "vocabulary",
      skill: "production",
      outcome: "success",
      at,
    });
  }
  assert.equal(memoryState(memory), "established");
  memory = recordEvidence(memory, {
    conceptId: "word:分岐",
    kind: "vocabulary",
    skill: "production",
    outcome: "failure",
    at,
  });
  memory = recordEvidence(memory, {
    conceptId: "word:分岐",
    kind: "vocabulary",
    skill: "production",
    outcome: "failure",
    at,
  });
  assert.equal(memoryState(memory), "fragile");
});

test("passive exposure never clears or adds an active failure streak", () => {
  let memory = recordEvidence(undefined, {
    conceptId: "word:難しい",
    kind: "vocabulary",
    skill: "production",
    outcome: "failure",
    at,
  });
  memory = recordEvidence(memory, {
    conceptId: "word:難しい",
    kind: "vocabulary",
    skill: "reading",
    outcome: "partial",
    at,
    passive: true,
  });
  assert.equal(memory.consecutiveFailures, 1);
  assert.equal(memory.lapseCount, 1);
  memory = recordEvidence(memory, {
    conceptId: "word:難しい",
    kind: "vocabulary",
    skill: "reading",
    outcome: "failure",
    at,
    passive: true,
  });
  assert.equal(memory.consecutiveFailures, 1);
  assert.equal(memory.lapseCount, 1);
});

test("sentence mining keeps the exact inflected occurrence and exact source lineage", () => {
  const source = {
    id: "source-new",
    kind: "youtube",
    status: "ready",
    title: "A walk and a conversation",
    url: "https://example.com/video",
    text: "昨日は歩きながら友達と話していました。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    analysis: null,
  };
  const word = entry("word:話す", "話す", "はなす", ["to speak"], "N5");
  const surface = "話して";
  const tokens = [
    {
      text: surface,
      surface,
      lemma: "話す",
      reading: "はなして",
      position: source.text.indexOf(surface),
      length: surface.length,
      entry: word,
      entryCandidates: [word],
      isJapanese: true,
    },
  ];
  const state = {
    ...createInitialPhase2State(),
    profile: {
      ...createInitialPhase2State().profile,
      currentLevel: "N2",
      onboardingComplete: true,
    },
    sources: [
      {
        ...source,
        id: "source-old",
        title: "Older article",
        text: "専門家が同じ問題について話していた。",
      },
      source,
    ],
    memories: {
      [word.id]: {
        ...recordEvidence(undefined, {
          conceptId: word.id,
          kind: "vocabulary",
          skill: "reading",
          outcome: "partial",
          at,
          sourceId: "source-old",
          contextFingerprint: "専門家が同じ問題について話していた。",
          passive: true,
        }),
        intent: "keep",
      },
    },
  };
  const analysis = analyzeSource(source, tokens, state);
  const candidate = analysis.candidates.find((item) => item.conceptId === word.id);
  assert.ok(candidate);
  assert.equal(candidate.surface, surface);
  assert.equal(candidate.sentence, source.text);
  const packet = stageSourcePacket(source, analysis, state);
  const proposal = packet.proposals.find((item) => item.conceptId === word.id);
  assert.ok(proposal);
  assert.match(proposal.front, /＿＿いました/);
  assert.match(proposal.back, /話す（はなす）/);
  assert.match(proposal.back, /Source form: 話して/);
  assert.equal(proposal.sourceSentence, source.text);
  assert.match(proposal.note, /Older article/);
  assert.match(proposal.tags.join(" "), /woven:source-old/);
  const card = proposalToCard(proposal, new Date(at));
  assert.equal(card.sourceId, source.id);
  assert.equal(card.sourceSentence, source.text);
  assert.equal(hasEquivalentCard({ ...state, cards: [card] }, proposal), true);
});

test("beginner journey runs source to edited packet to FSRS evidence", () => {
  const initial = createInitialPhase2State();
  const source = {
    id: "beginner-source",
    kind: "manual",
    status: "ready",
    title: "First real sentence",
    url: "",
    text: "毎朝、日本語を勉強します。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    segments: [],
    analysis: null,
  };
  const word = entry(
    "word:勉強する",
    "勉強する",
    "べんきょうする",
    ["to study"],
    "N5",
  );
  const surface = "勉強";
  const token = {
    text: surface,
    surface,
    lemma: word.word,
    reading: "べんきょう",
    position: source.text.indexOf(surface),
    length: surface.length,
    entry: word,
    entryCandidates: [word],
    isJapanese: true,
  };
  const learner = {
    ...initial,
    profile: {
      ...initial.profile,
      currentLevel: "zero",
      onboardingComplete: true,
      placementComplete: true,
    },
    sources: [source],
    activeSourceId: source.id,
  };
  const analysis = analyzeSource(source, [token], learner);
  const analyzedSource = { ...source, analysis };
  const packet = stageSourcePacket(analyzedSource, analysis, {
    ...learner,
    sources: [analyzedSource],
  });
  assert.equal(packet.proposals.length, 1);
  const editedProposal = {
    ...packet.proposals[0],
    note: "My first source-derived card",
  };
  const card = proposalToCard(editedProposal, new Date(at));
  const session = startReviewSession(
    { ...learner, cards: [card] },
    [card.id],
    20,
    new Date(at),
  );
  const reviewed = rateLearningCard(
    card,
    3,
    new Date("2026-07-30T08:01:00.000Z"),
  );
  const memory = recordEvidence(undefined, {
    conceptId: card.conceptId,
    kind: "vocabulary",
    skill: card.skill,
    outcome: "success",
    at: reviewed.event.reviewedAt,
    sourceId: source.id,
    contextFingerprint: card.sourceSentence,
  });
  const completed = {
    ...learner,
    memories: { [card.conceptId]: memory },
    sources: [
      {
        ...analyzedSource,
        status: "mined",
        capturedConceptIds: [card.conceptId],
      },
    ],
    cards: [reviewed.card],
    reviewEvents: [
      { ...reviewed.event, nextMemory: memory },
    ],
    reviewSession: {
      ...session,
      completedCardIds: [card.id],
      completedAt: reviewed.event.reviewedAt,
    },
    lastUndo: { ...reviewed.event, nextMemory: memory },
  };
  assert.equal(reviewed.card.fsrs.reps, 1);
  assert.ok(reviewed.card.dueAt > reviewed.event.reviewedAt);
  assert.equal(memory.sourceIds[0], source.id);
  assert.equal(validatePhase2StateForPersistence(completed), true);
});

test("N2 immersion journey turns a known reading edge into a woven production card", () => {
  const initial = createInitialPhase2State();
  const word = entry(
    "word:捉える",
    "捉える",
    "とらえる",
    ["to grasp; to capture"],
    "N1",
  );
  let memory;
  for (let index = 0; index < 5; index += 1)
    memory = recordEvidence(memory, {
      conceptId: word.id,
      kind: "vocabulary",
      skill: "reading",
      outcome: "success",
      at,
      sourceId: "older-article",
      contextFingerprint: "問題の本質を捉える必要がある。",
    });
  const older = {
    id: "older-article",
    kind: "article",
    status: "mined",
    title: "Older philosophy article",
    url: "",
    text: "問題の本質を捉える必要がある。",
    addedAt: at,
    updatedAt: at,
    progress: 100,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [word.id],
    notes: "",
    segments: [],
    analysis: null,
  };
  const source = {
    ...older,
    id: "walk-video",
    kind: "youtube",
    status: "ready",
    title: "Today’s walk",
    url: "https://youtube.com/watch?v=example",
    text: "細かなニュアンスまでは捉えきれなかった。",
    progress: 0,
    capturedConceptIds: [],
  };
  const surface = "捉え";
  const token = {
    text: surface,
    surface,
    lemma: word.word,
    reading: "とらえ",
    position: source.text.indexOf(surface),
    length: surface.length,
    entry: word,
    entryCandidates: [word],
    isJapanese: true,
  };
  const learner = {
    ...initial,
    profile: {
      ...initial.profile,
      currentLevel: "N2",
      targetLevel: "N1",
      onboardingComplete: true,
      placementComplete: true,
    },
    memories: { [word.id]: memory },
    sources: [older, source],
    activeSourceId: source.id,
  };
  const analysis = analyzeSource(source, [token], learner);
  const proposal = stageSourcePacket(source, analysis, learner).proposals[0];
  assert.equal(proposal.kind, "production");
  assert.equal(proposal.skill, "production");
  assert.deepEqual(
    proposal.lineage.map((anchor) => anchor.role),
    ["target", "prior"],
  );
  assert.match(proposal.rationale, /Woven/);
  assert.match(proposal.front, /新しい一文/);
});

test("grammar detection avoids a common literal-location false positive", () => {
  assert.equal(grammarInText("机の上で本を読んだ。").some((item) => item.id === "n2-ue-de"), false);
  assert.equal(
    grammarInText("内容を確認した上で、返事をします。").some(
      (item) => item.id === "n2-ue-de",
    ),
    true,
  );
  assert.equal(
    grammarInText("今回限りです。").some((item) => item.id === "n2-kagiri"),
    false,
  );
  assert.equal(
    grammarInText("命には限りがある。").some((item) => item.id === "n2-kagiri"),
    false,
  );
  assert.equal(
    grammarInText("できる限り頑張る。").some((item) => item.id === "n2-kagiri"),
    true,
  );
  assert.equal(
    grammarInText("命ある限り努力する。").some((item) => item.id === "n2-kagiri"),
    true,
  );
});

test("grammar mining attaches a contextual match to the exact sentence", () => {
  const source = {
    id: "grammar-source",
    kind: "article",
    status: "ready",
    title: "Before",
    url: "",
    text: "家の前に車がある。寝る前に本を読む。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    analysis: null,
  };
  const analysis = analyzeSource(source, [], createInitialPhase2State());
  const grammar = analysis.candidates.find(
    (candidate) => candidate.conceptId === "grammar:n5-mae-ni",
  );
  assert.ok(grammar);
  assert.equal(grammar.sentence, "寝る前に本を読む。");
});

test("FSRS produces real interval choices, a reversible event, and real session progress", () => {
  const proposal = {
    id: "proposal-a",
    conceptId: "word:学ぶ",
    sourceId: "source-a",
    sourceSentence: "日本語を学ぶ。",
    front: "日本語を＿＿。",
    back: "学ぶ（まなぶ）",
    reading: "まなぶ",
    note: "",
    rationale: "Exact source sentence.",
    tags: ["source:source-a"],
    lineage: [
      {
        sourceId: "source-a",
        sourceFingerprint: "fnv1a:source-a",
        exactText: "日本語を学ぶ。",
        role: "target",
        generated: false,
      },
    ],
    kind: "cloze",
    skill: "recognition",
    origin: "source",
    generated: false,
    selected: true,
  };
  const card = proposalToCard(proposal, new Date(at));
  const previews = ratingPreviews(card, new Date(at));
  assert.deepEqual(Object.keys(previews), ["1", "2", "3", "4"]);
  assert.notEqual(previews[1], previews[4]);
  const result = rateLearningCard(card, 3, new Date(at));
  assert.equal(result.event.previousCard, card);
  assert.equal(result.event.nextCard.id, card.id);
  assert.equal(result.card.fsrs.reps, 1);
  assert.ok(new Date(result.card.dueAt).getTime() > new Date(at).getTime());
  const session = startReviewSession(
    { ...createInitialPhase2State(), cards: [card] },
    [card.id],
    20,
    new Date(at),
  );
  assert.deepEqual(sessionProgress(session), { completed: 0, total: 1, percent: 0 });
  assert.deepEqual(
    sessionProgress({ ...session, completedCardIds: [card.id], completedAt: at }),
    { completed: 1, total: 1, percent: 100 },
  );
});

test("dictionary search prioritizes exact acronyms and common exact English meanings", () => {
  const ai = entry(
    "ai",
    "人工知能",
    "じんこうちのう",
    ["artificial intelligence; AI"],
    null,
    "AI",
  );
  const eat = entry("eat", "食べる", "たべる", ["to eat"], "N5");
  const overeating = entry("overeat", "過食する", "かしょくする", ["to eat excessively"], null);
  const entries = [ai, eat, overeating];
  const dictionary = {
    version: "test",
    vocab: entries,
    kanji: [],
    byId: new Map(entries.map((item) => [item.id, item])),
    byWord: new Map(entries.map((item) => [item.word, item])),
    byWordAll: new Map(entries.map((item) => [item.word, [item]])),
    kanjiByChar: new Map(),
    searchRecords: entries.map((item) => ({
      entry: item,
      word: item.word,
      alt: (item.altWord ?? "").toLowerCase(),
      reading: item.reading,
      meanings: item.meanings.join("\0").toLowerCase(),
    })),
  };
  assert.equal(searchDictionaryDetailed(dictionary, "AI", 5)[0].entry.id, "ai");
  assert.equal(searchDictionaryDetailed(dictionary, "eat", 5)[0].entry.id, "eat");
});

test("teacher contracts reject malformed state mutations and accept bounded structured turns", () => {
  const request = validateTeacherRequest({
    clientTurnId: "turn-1",
    input: "この文は自然ですか。",
    mode: "correct",
    profile: {
      currentLevel: "N2",
      targetLevel: "N1",
      target: "Read philosophy",
      interests: ["Japanese philosophy"],
    },
    recentMessages: [],
    activeSource: null,
    frontier: [],
    cards: [{ injected: true }],
  });
  assert.ok(request);
  assert.equal("cards" in request, false);
  const response = validateTeacherResponse(
    {
      replyJa: "自然ですが、文脈によって言い換えられます。",
      supportEn: "It is natural, with context-dependent alternatives.",
      reintroducedConceptIds: ["word:文脈"],
      corrections: [],
      evidence: [],
      branches: ["もう少し詳しく", "別の例を見たい"],
      cardProposals: [],
      nextMove: "Ask for one example.",
      whyThisFits: "It answers the correction request at the current level.",
      arbitraryMutation: { cards: "replace everything" },
    },
    "gpt-5.6-terra",
  );
  assert.ok(response);
  assert.equal("arbitraryMutation" in response, false);
  assert.equal(response.mode, "live-ai");
});

test("teacher evidence is bounded to a known frontier and high confidence", () => {
  const allowed = new Set(["word:文脈"]);
  const memories = applyTeacherEvidence(
    {},
    [
      {
        conceptId: "word:文脈",
        skill: "production",
        outcome: "success",
        confidence: 0.88,
      },
      {
        conceptId: "word:injected",
        skill: "production",
        outcome: "success",
        confidence: 1,
      },
      {
        conceptId: "word:low",
        skill: "production",
        outcome: "failure",
        confidence: 0.2,
      },
    ],
    allowed,
    "turn-1",
    at,
  );
  assert.ok(memories["word:文脈"]);
  assert.equal(memories["word:文脈"].axes.production.successes, 1);
  assert.equal(memories["word:injected"], undefined);
  assert.equal(memories["word:low"], undefined);
});

test("teacher reintroduction claims and evidence require the concept in replyJa", () => {
  const response = validateTeacherResponse(
    {
      replyJa: "今日は別の話をしましょう。",
      supportEn: null,
      reintroducedConceptIds: ["word:文脈", "word:学習"],
      corrections: [],
      evidence: [
        {
          conceptId: "word:文脈",
          skill: "recognition",
          outcome: "success",
          confidence: 0.9,
        },
        {
          conceptId: "word:学習",
          skill: "production",
          outcome: "success",
          confidence: 0.9,
        },
      ],
      branches: ["続ける", "例を見る"],
      cardProposals: [],
      nextMove: "Continue.",
      whyThisFits: "Tests truth-bounding.",
    },
    "test",
  );
  assert.ok(response);
  const bounded = boundTeacherResponseToReply(response, [
    {
      conceptId: "word:文脈",
      surface: "文脈",
      dictionaryForm: "文脈",
      reading: "ぶんみゃく",
      forms: [],
    },
    {
      conceptId: "word:学習",
      surface: "学習",
      dictionaryForm: "学習する",
      reading: "がくしゅう",
      forms: [],
    },
  ]);
  assert.deepEqual(bounded.reintroducedConceptIds, []);
  assert.deepEqual(bounded.evidence, []);
});

test("teacher truth-bound accepts an allowlisted surface, dictionary form, or reading", () => {
  const response = validateTeacherResponse(
    {
      replyJa: "文脈を変え、次は「がくしゅう」と声に出してみましょう。",
      supportEn: null,
      reintroducedConceptIds: ["word:文脈", "word:学習", "word:absent"],
      corrections: [],
      evidence: [
        {
          conceptId: "word:文脈",
          skill: "recognition",
          outcome: "success",
          confidence: 0.9,
        },
        {
          conceptId: "word:学習",
          skill: "reading",
          outcome: "partial",
          confidence: 0.8,
        },
        {
          conceptId: "word:absent",
          skill: "production",
          outcome: "success",
          confidence: 1,
        },
      ],
      branches: ["続ける", "例を見る"],
      cardProposals: [],
      nextMove: "Continue.",
      whyThisFits: "Tests truth-bounding.",
    },
    "test",
  );
  assert.ok(response);
  const bounded = boundTeacherResponseToReply(response, [
    {
      conceptId: "word:文脈",
      surface: "文脈",
      dictionaryForm: "文脈",
      reading: "ぶんみゃく",
      forms: [],
    },
    {
      conceptId: "word:学習",
      surface: "学んだ",
      dictionaryForm: "学習する",
      reading: "がくしゅう",
      forms: [],
    },
  ]);
  assert.deepEqual(bounded.reintroducedConceptIds, ["word:文脈", "word:学習"]);
  assert.deepEqual(
    bounded.evidence.map((item) => item.conceptId),
    ["word:文脈", "word:学習"],
  );
});

test("nested migration drops invalid analyses and malformed histories", () => {
  const base = createInitialPhase2State();
  const source = {
    id: "source-bad",
    kind: "article",
    status: "ready",
    title: "Bad old analysis",
    url: "",
    text: "食べます。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    analysis: {
      analyzedAt: at,
      textFingerprint: textFingerprint("食べます。"),
      sentenceCount: 1,
      tokenCount: 1,
      coverage: 0,
      knownCount: 0,
      learningCount: 0,
      unknownCount: 1,
      candidates: [
        {
          conceptId: "word:食べる",
          kind: "vocabulary",
          surface: "食べ",
          dictionaryForm: "食べる",
          reading: "たべる",
          meaning: "to eat",
          sentence: "食べます。",
          sentenceIndex: 0,
          score: 1,
          reason: "legacy candidate without offsets",
          memoryState: "unseen",
        },
      ],
      grammarIds: [],
    },
  };
  const migrated = migrateToPhase2({
    ...base,
    sources: [source],
    reviewEvents: [{ id: "bad" }],
    messages: [{ id: "bad-message", text: { injected: true } }],
    activity: [{ id: "bad-activity", type: "drop-me" }],
  });
  assert.equal(migrated.sources[0].analysis?.candidates.length, 0);
  assert.deepEqual(migrated.reviewEvents, []);
  assert.deepEqual(migrated.messages, []);
  assert.deepEqual(migrated.activity, []);
});

test("three-way sync preserves disjoint learner work", () => {
  const base = createInitialPhase2State();
  const source = {
    id: "source-local",
    kind: "manual",
    status: "ready",
    title: "Local",
    url: "",
    text: "ローカル。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    analysis: null,
  };
  const local = { ...base, sources: [source], activeSourceId: source.id };
  const remote = {
    ...base,
    messages: [
      {
        id: "message-remote",
        role: "learner",
        text: "クラウド",
        supportEn: null,
        createdAt: at,
        generated: false,
        corrections: [],
        branches: [],
        whyThisFits: null,
      },
    ],
  };
  const merged = threeWayMergePhase2States(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.state.sources[0].id, source.id);
  assert.equal(merged.state.messages[0].id, "message-remote");
});

test("same-source sync conflicts pause instead of guessing", () => {
  const base = createInitialPhase2State();
  const source = {
    id: "source-shared",
    kind: "manual",
    status: "ready",
    title: "Shared",
    url: "",
    text: "元の文。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    analysis: null,
  };
  const local = {
    ...base,
    sources: [{ ...source, text: "ローカルの編集。" }],
  };
  const remote = {
    ...base,
    sources: [{ ...source, text: "別のタブの編集。" }],
  };
  const merged = threeWayMergePhase2States(base, local, remote);
  assert.equal(
    merged.state.sources.find((item) => item.id === source.id)?.text,
    "ローカルの編集。",
  );
  assert.deepEqual(merged.conflicts, [`sources.${source.id}`]);
  assert.equal(
    merged.state.sources.some((item) => item.id.startsWith("sync-copy:")),
    false,
  );
});

test("three-way sync honors deletion tombstones and flags delete-versus-edit", () => {
  const empty = createInitialPhase2State();
  const card = proposalToCard(
    {
      id: "proposal-delete",
      conceptId: "word:消す",
      sourceId: null,
      sourceSentence: "",
      front: "消す",
      back: "to delete",
      reading: "けす",
      note: "",
      rationale: "test",
      tags: [],
      lineage: [],
      kind: "recognition",
      skill: "recognition",
      origin: "manual",
      generated: false,
      selected: true,
    },
    new Date(at),
  );
  const base = { ...empty, cards: [card] };
  const deletedLocally = { ...base, cards: [] };
  const unchangedRemote = { ...base };
  const deletion = threeWayMergePhase2States(
    base,
    deletedLocally,
    unchangedRemote,
  );
  assert.deepEqual(deletion.conflicts, []);
  assert.deepEqual(deletion.state.cards, []);

  const editedRemote = {
    ...base,
    cards: [{ ...card, note: "remote edit" }],
  };
  const conflict = threeWayMergePhase2States(
    base,
    deletedLocally,
    editedRemote,
  );
  assert.deepEqual(conflict.conflicts, [`cards.${card.id}`]);
  assert.deepEqual(conflict.state.cards, []);
});

test("concurrent reviews never union events onto one inconsistent FSRS card", () => {
  const empty = createInitialPhase2State();
  const card = proposalToCard(
    {
      id: "proposal-concurrent-review",
      conceptId: "word:復習",
      sourceId: null,
      sourceSentence: "",
      front: "復習",
      back: "review",
      reading: "ふくしゅう",
      note: "",
      rationale: "test",
      tags: [],
      lineage: [],
      kind: "recognition",
      skill: "recognition",
      origin: "manual",
      generated: false,
      selected: true,
    },
    new Date(at),
  );
  const localReview = rateLearningCard(
    card,
    3,
    new Date("2026-07-30T00:01:00.000Z"),
  );
  const remoteReview = rateLearningCard(
    card,
    1,
    new Date("2026-07-30T00:02:00.000Z"),
  );
  const base = { ...empty, cards: [card] };
  const local = {
    ...base,
    cards: [localReview.card],
    reviewEvents: [localReview.event],
  };
  const remote = {
    ...base,
    cards: [remoteReview.card],
    reviewEvents: [remoteReview.event],
  };
  const merged = threeWayMergePhase2States(base, local, remote);
  assert.ok(merged.conflicts.includes(`cards.${card.id}`));
  assert.ok(merged.conflicts.includes("reviewEvents.concurrent"));
  assert.deepEqual(
    merged.state.reviewEvents.map((event) => event.id),
    [localReview.event.id],
  );
  assert.equal(merged.state.cards[0].fsrs.reps, localReview.card.fsrs.reps);
});

test("source parsing and fingerprints are deterministic", () => {
  const text = "一文目です。\n二文目です！ 三文目ですか？";
  assert.deepEqual(
    sentenceSpans(text).map((item) => item.text),
    ["一文目です。", "二文目です！", "三文目ですか？"],
  );
  assert.equal(textFingerprint(text), textFingerprint(text));
  assert.notEqual(textFingerprint(text), textFingerprint(`${text}追加`));
  assert.equal(
    textFingerprint("abc"),
    "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad:3",
  );
  const long = sentenceSpans("日本語".repeat(500));
  assert.ok(long.length > 1);
  assert.ok(long.every((span) => span.text.length <= 220));
});

test("context lookup accepts exact sentences and rejects legacy positions after edits", () => {
  const source = {
    id: "context-source",
    kind: "manual",
    status: "ready",
    title: "Context",
    url: "",
    text: "前置き。パンを食べた。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    analysis: null,
  };
  const memory = recordEvidence(undefined, {
    conceptId: "word:食べる",
    kind: "vocabulary",
    skill: "reading",
    outcome: "partial",
    at,
    sourceId: source.id,
    contextFingerprint: "パンを食べた。",
    passive: true,
  });
  const state = {
    ...createInitialPhase2State(),
    sources: [source],
    memories: { [memory.conceptId]: memory },
  };
  assert.equal(
    contextsForConcept(state, memory.conceptId)[0]?.sentence,
    "パンを食べた。",
  );
  const legacyOnly = {
    ...state,
    memories: {
      [memory.conceptId]: {
        ...memory,
        contextFingerprints: [`${source.id}:4`],
      },
    },
  };
  assert.deepEqual(contextsForConcept(legacyOnly, memory.conceptId), []);
});

test("reader coverage follows reading evidence and activates production next", () => {
  const word = entry("word:学ぶ", "学ぶ", "まなぶ", ["to learn"], "N5");
  let memory;
  for (let index = 0; index < 5; index += 1)
    memory = recordEvidence(memory, {
      conceptId: word.id,
      kind: "vocabulary",
      skill: "recognition",
      outcome: "success",
      at,
    });
  const source = {
    id: "axis-source",
    kind: "manual",
    status: "ready",
    title: "Axis",
    url: "",
    text: "日本語を学ぶ。",
    addedAt: at,
    updatedAt: at,
    progress: 0,
    readingSentence: 0,
    provenance: "user-supplied",
    capturedConceptIds: [],
    notes: "",
    analysis: null,
  };
  const state = {
    ...createInitialPhase2State(),
    memories: { [word.id]: memory },
    sources: [source],
  };
  const analysis = analyzeSource(
    source,
    [
      {
        text: "学ぶ",
        surface: "学ぶ",
        lemma: "学ぶ",
        reading: "まなぶ",
        position: 4,
        length: 2,
        entry: word,
        entryCandidates: [word],
        ambiguous: false,
        isJapanese: true,
      },
    ],
    state,
  );
  assert.equal(analysis.knownCount, 1);
  assert.equal(analysis.coverage, 100);
  assert.equal(stageSourcePacket(source, analysis, state).proposals[0].skill, "production");
});

test("conversation proposals keep exact exchange and prior-source lineage", () => {
  const conversation = {
    id: "conversation-turn-1",
    kind: "conversation",
    status: "mined",
    title: "Exchange",
    url: "",
    text: "Learner:\n文脈は大切です。\n\nBunki:\n文脈を変えて、もう一度使いましょう。",
    addedAt: at,
    updatedAt: at,
    progress: 100,
    readingSentence: 0,
    provenance: "generated-sample",
    capturedConceptIds: ["word:文脈"],
    notes: "",
    segments: [],
    analysis: null,
  };
  const proposals = teacherProposalsToCards(
    {
      replyJa: "文脈を変えて、もう一度使いましょう。",
      supportEn: null,
      reintroducedConceptIds: ["word:文脈"],
      corrections: [],
      evidence: [],
      branches: ["続ける", "例を見る"],
      cardProposals: [
        {
          conceptId: "word:文脈",
          front: "文脈を変えて、もう一度使いましょう。",
          back: "Use it again in a different context.",
          rationale: "Reintroduced at n+1.",
        },
      ],
      nextMove: "Continue.",
      whyThisFits: "Reuses the frontier.",
      mode: "live-ai",
      model: "test",
    },
    conversation,
    {
      "word:文脈": [
        {
          sourceId: "article-1",
          sourceFingerprint: textFingerprint("文脈が大切だ。"),
          exactText: "文脈が大切だ。",
        },
      ],
    },
  );
  assert.equal(proposals[0].sourceId, conversation.id);
  assert.equal(proposals[0].lineage.length, 2);
  assert.equal(proposals[0].lineage[0].generated, true);
  assert.equal(proposals[0].lineage[1].role, "prior");
});

test("Anki TSV keeps one physical row per card and exports lineage", () => {
  const state = createInitialPhase2State();
  const card = proposalToCard(
    {
      id: "proposal-tsv",
      conceptId: "word:文脈",
      sourceId: null,
      sourceSentence: "文脈が大切だ。",
      front: "一行目\n二行目\t続き",
      back: "答え\n二行目",
      reading: "",
      note: "",
      rationale: "test",
      tags: ["tag"],
      lineage: [
        {
          sourceId: "source-1",
          sourceFingerprint: textFingerprint("文脈が大切だ。"),
          exactText: "文脈が大切だ。",
          role: "target",
          generated: false,
        },
      ],
      kind: "cloze",
      skill: "recognition",
      origin: "source",
      generated: false,
      selected: true,
    },
    new Date(at),
  );
  const tsv = phase2CardsToAnkiTsv({ ...state, cards: [card] });
  assert.equal(tsv.split("\n").length, 2);
  assert.match(tsv, /一行目<br>二行目 続き/);
  assert.match(tsv, /sha256:/);
});

test("strict cloud validation rejects malformed FSRS dates", () => {
  const state = createInitialPhase2State();
  const card = proposalToCard(
    {
      id: "proposal-invalid",
      conceptId: "word:bad",
      sourceId: null,
      sourceSentence: "",
      front: "front",
      back: "back",
      reading: "",
      note: "",
      rationale: "test",
      tags: [],
      lineage: [],
      kind: "recognition",
      skill: "recognition",
      origin: "manual",
      generated: false,
      selected: true,
    },
    new Date(at),
  );
  assert.equal(
    validatePhase2StateForPersistence({ ...state, cards: [card] }),
    true,
  );
  assert.equal(
    validatePhase2StateForPersistence({
      ...state,
      cards: [{ ...card, dueAt: "bad" }],
    }),
    false,
  );
});

test("card normalization clamps editable fields into a strict-valid state", () => {
  const state = createInitialPhase2State();
  const card = proposalToCard(
    {
      id: "proposal-card-limits",
      conceptId: "word:直す",
      sourceId: null,
      sourceSentence: "",
      front: "front",
      back: "back",
      reading: "",
      note: "",
      rationale: "test",
      tags: [],
      lineage: [],
      kind: "recognition",
      skill: "recognition",
      origin: "manual",
      generated: false,
      selected: true,
    },
    new Date(at),
  );
  const migrated = migrateToPhase2({
    ...state,
    cards: [
      {
        ...card,
        conceptId: `word:${"長".repeat(200)}`,
        front: "前".repeat(MAX_CARD_FRONT_CHARACTERS + 1),
        back: "後".repeat(MAX_CARD_BACK_CHARACTERS + 1),
        note: "注".repeat(MAX_CARD_NOTE_CHARACTERS + 1),
        tags: ["t".repeat(201)],
      },
      { ...card, id: "blank-card", front: " \n ", back: "answer" },
    ],
  });

  assert.equal(migrated.cards.length, 1);
  assert.equal(migrated.cards[0].front.length, MAX_CARD_FRONT_CHARACTERS);
  assert.equal(migrated.cards[0].back.length, MAX_CARD_BACK_CHARACTERS);
  assert.equal(migrated.cards[0].note.length, MAX_CARD_NOTE_CHARACTERS);
  assert.equal(migrated.cards[0].conceptId.length, 180);
  assert.equal(migrated.cards[0].tags[0].length, 200);
  assert.equal(validatePhase2StateForPersistence(migrated), true);
});

test("suspend and delete transitions preserve strict-valid review sessions", () => {
  const state = createInitialPhase2State();
  const makeCard = (id, conceptId) =>
    proposalToCard(
      {
        id: `proposal-${id}`,
        conceptId,
        sourceId: null,
        sourceSentence: "",
        front: id,
        back: `answer-${id}`,
        reading: "",
        note: "",
        rationale: "test",
        tags: [],
        lineage: [],
        kind: "recognition",
        skill: "recognition",
        origin: "manual",
        generated: false,
        selected: true,
      },
      new Date(at),
    );
  const completed = makeCard("completed", "word:済む");
  const pending = makeCard("pending", "word:待つ");
  const outside = makeCard("outside", "word:外");
  const session = {
    ...startReviewSession(
      { ...state, cards: [completed, pending, outside] },
      [completed.id, pending.id],
      20,
      new Date(at),
    ),
    completedCardIds: [completed.id],
  };

  assert.equal(removeCardFromReviewSession(session, outside.id), session);

  const afterSuspendSession = removeCardFromReviewSession(session, pending.id);
  const afterSuspend = {
    ...state,
    cards: [
      completed,
      { ...pending, suspended: true, updatedAt: at },
      outside,
    ],
    reviewSession: afterSuspendSession,
  };
  assert.deepEqual(afterSuspendSession?.queue, [completed.id]);
  assert.deepEqual(afterSuspendSession?.completedCardIds, [completed.id]);
  assert.equal(afterSuspendSession?.initialCount, 1);
  assert.equal(validatePhase2StateForPersistence(afterSuspend), true);

  const afterDeleteSession = removeCardFromReviewSession(
    afterSuspendSession,
    completed.id,
  );
  const afterDelete = {
    ...afterSuspend,
    cards: afterSuspend.cards.filter((card) => card.id !== completed.id),
    reviewSession: afterDeleteSession,
  };
  assert.deepEqual(afterDeleteSession?.queue, []);
  assert.deepEqual(afterDeleteSession?.completedCardIds, []);
  assert.equal(afterDeleteSession?.initialCount, 0);
  assert.equal(validatePhase2StateForPersistence(afterDelete), true);
});
