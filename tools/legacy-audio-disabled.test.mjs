/* global process, console, URL, AbortController */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const { test } = await import(
  process.env.VITEST === "true" && !process.env.NODE_TEST_CONTEXT
    ? "vitest"
    : "node:test"
);
import {
  createDeviceVoice,
  REASONS,
} from "../prototypes/corridor/device-voice.mjs";
test("unbound legacy speech and recording entry points fail closed", async () => {
  let speaks = 0,
    cancels = 0;
  const env = {
    speechSynthesis: {
      getVoices: () => [{ lang: "ja-JP", localService: true, name: "fixture" }],
      speak: () => speaks++,
      cancel: () => cancels++,
    },
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
  };
  const voice = createDeviceVoice(env);
  for (const text of ["日本語。", "English only", "日本語 and English", ""]) {
    const before = cancels,
      r = voice.speak(text);
    assert.equal(r.spoken, false);
    assert.equal(r.source, "none");
    assert.equal(r.reason, REASONS.DISABLED);
    assert(cancels > before, "cancel before refusing");
  }
  assert.equal(speaks, 0);
  const source = readFileSync(
      new URL("../prototypes/corridor/corridor.js", import.meta.url),
      "utf8",
    ),
    ast = ts.createSourceFile(
      "corridor.js",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
  assert.equal(ast.parseDiagnostics.length, 0);
  function actual(name) {
    const nodes = ast.statements.filter(
      (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
    );
    assert.equal(nodes.length, 1);
    return source.slice(nodes[0].getStart(ast), nodes[0].end);
  }
  let fetches = 0,
    starts = 0,
    retired = 0,
    stopped = 0,
    status = [];
  const sandbox = {
    Promise,
    window: { __KAIRO_AUDIO__: true },
    document: { hidden: false },
    recManifest: undefined,
    recManifestWait: null,
    recAudioEl: null,
    readAloud: { on: false },
    S: { view: "review", review: { revealed: true } },
    deviceVoice: {
      cancel: () => cancels++,
      speak: () => {
        speaks++;
      },
    },
    fetch: () => {
      fetches++;
      return Promise.resolve({ ok: true, json: async () => ({}) });
    },
    Audio: class {
      constructor() {
        starts++;
      }
      play() {
        starts++;
        return Promise.resolve();
      }
    },
    retireCardSpeech: () => retired++,
    stopReadAloud: () => {},
    stopRecAudio: () => stopped++,
    stopSentenceListening: () => {},
    cardVoiceStatus: (...args) => status.push(args),
    tx: (ja, en) => en,
    wordVoice: () => "on",
    wordClipFor: () => ({ src: "retained-synthetic.m4a" }),
    approvedWordManifest: (x) => x,
    refreshListenRow: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    actual("ensureRecManifest") +
      ";" +
      actual("playRecClip") +
      ";" +
      actual("speakCardReading") +
      ";" +
      actual("verifiedSentenceAudio"),
    sandbox,
  );
  await sandbox.ensureRecManifest();
  assert.equal(fetches, 0, "disabled legacy manifest cannot fetch");
  assert.equal(
    await sandbox.playRecClip("retained-synthetic.m4a", null),
    false,
  );
  await sandbox.speakCardReading("日本語 and English", null, "term");
  await Promise.resolve();
  assert.equal(fetches, 0);
  assert.equal(starts, 0);
  assert.equal(speaks, 0);
  assert(retired > 0 || cancels > 4);
  assert(stopped > 0);
  assert(status.some((row) => row[2] === "current-source-required"));
  await assert.rejects(
    sandbox.verifiedSentenceAudio?.(
      { path: "retained.m4a" },
      new AbortController().signal,
    ) ?? Promise.reject(Error("missing verifiedSentenceAudio")),
    /current-source-required/,
  );
  const roomSource = readFileSync(
      new URL("../prototypes/corridor/speak.js", import.meta.url),
      "utf8",
    ),
    roomAst = ts.createSourceFile(
      "speak.js",
      roomSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
  function roomFunction(name) {
    const found = [];
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name)
        found.push(node);
      ts.forEachChild(node, visit);
    }
    visit(roomAst);
    assert.equal(found.length, 1);
    return roomSource.slice(found[0].getStart(roomAst), found[0].end);
  }
  let posts = 0,
    media = 0,
    stops = 0;
  const room = {
    Promise,
    post: () => {
      posts++;
      throw Error("provider forbidden");
    },
    ensureAudio: () => {
      media++;
      throw Error("cached audio forbidden");
    },
    stopVoice: () => stops++,
  };
  vm.createContext(room);
  vm.runInContext(
    roomFunction("voiceLine") + ";" + roomFunction("playClip"),
    room,
  );
  for (const text of ["日本語", "English", "日本語 and English", ""]) {
    const line = { text };
    assert.equal(room.voiceLine(line).length, 0);
    assert.equal(line.voice.length, 0);
    assert.equal(
      await room.playClip("blob:retained-cached-English", 1, 1),
      "silent",
    );
  }
  assert.equal(posts, 0);
  assert.equal(media, 0);
  assert.equal(stops, 4);
  assert.equal(fetches, 0);
  console.log(
    JSON.stringify({
      status: "PASS",
      deviceSpeakCalls: 0,
      recordingFetches: 0,
      mediaStarts: 0,
      actualFunctions: true,
    }),
  );
});
