import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji
    .builder({ dicPath: new URL("../node_modules/kuromoji/dict", import.meta.url).pathname })
    .build((error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
});

globalThis.fetch = async () =>
  new Response(fs.readFileSync(new URL("../public/kotobako-static.json", import.meta.url)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const { loadDictionary } = await import("../app/lib/dictionary.ts");
const { tokenizeJapanese } = await import("../app/lib/tokenize.ts");
const {
  analyzeSource,
  stageSourcePacket,
} = await import("../app/lib/mining-engine.ts");
const { createInitialPhase2State } = await import("../app/lib/phase2-state.ts");
const dictionary = await loadDictionary();

test("recovers dictionary forms from inflected Japanese", () => {
  const rows = tokenizer.tokenize(
    "知らない言葉に出会って、確かめながら話していました。新しく使えるようになった。",
  );
  const lemmas = rows
    .filter((row) => !["助詞", "助動詞", "記号"].includes(row.pos))
    .map((row) => row.basic_form);

  for (const expected of ["知る", "言葉", "出会う", "確かめる", "話す", "新しい", "使える", "なる"]) {
    assert.ok(lemmas.includes(expected), `missing lemma: ${expected}`);
  }
  assert.ok(!lemmas.includes("て"));
  assert.ok(!lemmas.includes("ない"));
});

test("ships the complete alpha lexicon and kanji set", () => {
  const payload = require("../public/kotobako-static.json");
  assert.equal(payload.datasets.vocab.length, 23_120);
  assert.equal(payload.datasets.kanji.length, 2_136);
  assert.ok(payload.datasets.vocab.some((entry) => entry.word === "分岐"));
  assert.ok(payload.datasets.kanji.some((entry) => entry.char === "岐"));
});

test("resolves inflected lemmas and context-sensitive common homographs", () => {
  const thought = tokenizeJapanese("そう思います。", dictionary, tokenizer);
  assert.equal(thought.find((token) => token.surface === "思い")?.entry?.word, "思う");
  assert.match(
    thought.find((token) => token.surface === "そう")?.entry?.pos ?? "",
    /adverb/i,
  );

  const question = tokenizeJapanese("質問があります。", dictionary, tokenizer);
  assert.equal(question.find((token) => token.surface === "あり")?.entry?.word, "ある");
  assert.notEqual(question.find((token) => token.surface === "あり")?.entry?.word, "蟻");

  const filler = tokenizeJapanese("あの、質問があります。", dictionary, tokenizer);
  assert.match(
    filler.find((token) => token.surface === "あの")?.entry?.pos ?? "",
    /interjection/i,
  );
});

test("connects kana reading forms but keeps kana homographs visibly ambiguous", () => {
  const bridge = tokenizeJapanese("はしで食べます。", dictionary, tokenizer);
  const hashi = bridge.find((token) => token.surface === "はし");
  assert.ok(hashi);
  assert.equal(hashi.ambiguous, true);
  assert.ok(hashi.entryCandidates.some((entry) => entry.word === "橋"));
  assert.ok(hashi.entryCandidates.some((entry) => entry.word === "箸"));
  assert.equal(
    bridge.find((token) => token.surface === "食べ")?.entry?.word,
    "食べる",
  );

  const kami = tokenizeJapanese("かみを切る。", dictionary, tokenizer).find(
    (token) => token.surface === "かみ",
  );
  assert.ok(kami);
  assert.equal(kami.ambiguous, true);
  for (const word of ["紙", "髪", "神"])
    assert.ok(kami.entryCandidates.some((entry) => entry.word === word), word);
});

test("real token offsets cloze the inflected occurrence rather than an earlier substring", () => {
  const at = "2026-07-30T08:00:00.000Z";
  const source = {
    id: "food-source",
    kind: "article",
    status: "ready",
    title: "Food",
    url: "",
    text: "食べ物を買って、パンを食べます。",
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
    profile: {
      ...createInitialPhase2State().profile,
      currentLevel: "N5",
      onboardingComplete: true,
    },
    sources: [source],
  };
  const tokens = tokenizeJapanese(source.text, dictionary, tokenizer);
  const analysis = analyzeSource(source, tokens, state);
  const candidate = analysis.candidates.find(
    (item) => item.dictionaryForm === "食べる",
  );
  assert.ok(candidate);
  const packet = stageSourcePacket(source, analysis, state);
  const proposal = packet.proposals.find(
    (item) => item.conceptId === candidate.conceptId,
  );
  assert.ok(proposal);
  assert.match(proposal.front, /^食べ物を買って、パンを＿＿ます。$/);
});
