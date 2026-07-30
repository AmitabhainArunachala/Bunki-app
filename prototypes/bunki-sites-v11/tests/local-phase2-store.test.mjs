import assert from "node:assert/strict";
import test from "node:test";

import { indexedDB } from "fake-indexeddb";

import {
  loadLocalPhase2Snapshot,
  loadLocalSourceBody,
  saveLocalPhase2Snapshot,
} from "../app/lib/local-phase2-store.ts";
import { sourceTextFingerprint } from "../app/lib/source-fingerprint.ts";
import { proposalToCard } from "../app/lib/mining-engine.ts";
import { rateLearningCard } from "../app/lib/phase2-scheduler.ts";
import { createInitialPhase2State } from "../app/lib/phase2-state.ts";

globalThis.indexedDB = indexedDB;

const deleteDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("bunki-phase2");
    request.addEventListener("success", () => resolve(), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("Could not reset test database.")),
      { once: true },
    );
  });

const snapshot = (state, syncScope) => ({
  current: state,
  base: createInitialPhase2State(),
  syncScope,
  dirty: true,
  acknowledgedServerRevision: 0,
  savedAt: "2026-07-30T00:00:00.000Z",
  conflict: null,
});

test("local persistence isolates accounts, rejects stale tabs, and keeps undo authoritative", async () => {
  await deleteDatabase();
  const initial = createInitialPhase2State();
  const anonymousState = {
    ...initial,
    revision: 1,
    profile: { ...initial.profile, displayName: "Anonymous learner" },
    sources: [
      {
        id: "shared-source-id",
        kind: "manual",
        status: "ready",
        title: "Anonymous source",
        url: "",
        text: "匿名の文章。",
        addedAt: "2026-07-30T00:00:00.000Z",
        updatedAt: "2026-07-30T00:00:00.000Z",
        progress: 0,
        readingSentence: 0,
        provenance: "user-supplied",
        capturedConceptIds: [],
        notes: "",
        segments: [],
        analysis: null,
      },
    ],
  };
  const accountState = {
    ...initial,
    revision: 1,
    profile: { ...initial.profile, displayName: "Account learner" },
    sources: [
      {
        ...anonymousState.sources[0],
        title: "Account source",
        text: "アカウントの文章。",
      },
    ],
  };

  assert.equal(
    await saveLocalPhase2Snapshot(snapshot(anonymousState, null), 0),
    1,
  );
  assert.equal(
    await saveLocalPhase2Snapshot(
      snapshot(accountState, "sha256:account-a:1"),
      0,
    ),
    1,
  );
  assert.equal(
    (await loadLocalPhase2Snapshot(null))?.current.sources[0].text,
    "匿名の文章。",
  );
  assert.equal(
    (
      await loadLocalPhase2Snapshot("sha256:account-a:1")
    )?.current.sources[0].text,
    "アカウントの文章。",
  );
  assert.equal(
    await loadLocalSourceBody(
      "sha256:account-a:1",
      "shared-source-id",
      sourceTextFingerprint("アカウントの文章。"),
    ),
    "アカウントの文章。",
  );
  assert.equal(
    await loadLocalPhase2Snapshot("sha256:account-b:1"),
    null,
  );

  const newer = {
    ...accountState,
    revision: 2,
    profile: { ...accountState.profile, target: "Newest tab wins the CAS" },
  };
  assert.equal(
    await saveLocalPhase2Snapshot(
      snapshot(newer, "sha256:account-a:1"),
      1,
    ),
    2,
  );
  await assert.rejects(
    saveLocalPhase2Snapshot(
      snapshot(
        {
          ...accountState,
          revision: 2,
          profile: { ...accountState.profile, target: "Stale overwrite" },
        },
        "sha256:account-a:1",
      ),
      1,
    ),
    /LOCAL_REVISION_CONFLICT/,
  );
  assert.equal(
    (
      await loadLocalPhase2Snapshot("sha256:account-a:1")
    )?.current.profile.target,
    "Newest tab wins the CAS",
  );

  const card = proposalToCard(
    {
      id: "proposal-review",
      conceptId: "word:学ぶ",
      sourceId: null,
      sourceSentence: "",
      front: "学ぶ",
      back: "to learn",
      reading: "まなぶ",
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
    new Date("2026-07-30T00:00:00.000Z"),
  );
  const rated = rateLearningCard(
    card,
    3,
    new Date("2026-07-30T00:01:00.000Z"),
  );
  const withReview = {
    ...newer,
    revision: 3,
    cards: [rated.card],
    reviewEvents: [rated.event],
  };
  assert.equal(
    await saveLocalPhase2Snapshot(
      snapshot(withReview, "sha256:account-a:1"),
      2,
    ),
    3,
  );
  const undone = {
    ...withReview,
    revision: 4,
    cards: [card],
    reviewEvents: [],
    lastUndo: null,
  };
  assert.equal(
    await saveLocalPhase2Snapshot(
      snapshot(undone, "sha256:account-a:1"),
      3,
    ),
    4,
  );
  assert.deepEqual(
    (
      await loadLocalPhase2Snapshot("sha256:account-a:1")
    )?.current.reviewEvents,
    [],
  );
});
