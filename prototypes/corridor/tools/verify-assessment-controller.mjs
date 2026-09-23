/** Executable controller/core behavior checks. The exact production compiler
 * stages the module outside the checkout; this is not a browser/device gate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const out = resolve(
  process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/assessment-controller'),
);
const inside = (parent, child) => {
  const part = relative(parent, child);
  return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};
assert(!inside(root, out), 'Runtime evidence must be outside the checkout');
mkdirSync(out, { recursive: true });
assert(
  !inside(realpathSync(root), realpathSync(out)),
  'Runtime evidence resolves outside the checkout',
);
const stage = mkdtempSync(resolve(out, 'runtime-'));
mkdirSync(resolve(stage, 'modules'));
let core;
let sourceArtifact = null;
if (process.env.KAIRO_ASSESSMENT_SITE_DIR) {
  const sourceSite = resolve(process.env.KAIRO_ASSESSMENT_SITE_DIR);
  const expectedArtifact = process.env.KAIRO_ASSESSMENT_SITE_SHA256;
  assert.match(
    expectedArtifact || '',
    /^[a-f0-9]{64}$/u,
    'A pinned staged fixture needs its expected artifact digest',
  );
  const identity = JSON.parse(readFileSync(resolve(sourceSite, 'build-identity.json'), 'utf8'));
  assert.equal(identity.artifactSha256, expectedArtifact);
  assert.equal(
    sha256(JSON.stringify(identity.files)),
    expectedArtifact,
    'Staged manifest must match the supplied artifact identity',
  );
  const metadata = identity.modules.find((entry) => entry.path === 'modules/assessment-core.mjs');
  const file = identity.files.find((entry) => entry.path === 'modules/assessment-core.mjs');
  assert(metadata && file, 'The pinned artifact must contain its assessment module');
  const bytes = readFileSync(resolve(sourceSite, file.path));
  assert.equal(bytes.length, file.bytes);
  assert.equal(sha256(bytes), file.sha256);
  core = { ...metadata, bytes };
  sourceArtifact = { path: sourceSite, artifactSha256: expectedArtifact };
} else
  core = buildCorridorModules(root).find((module) => module.path === 'modules/assessment-core.mjs');
assert(core, 'The canonical production builder must stage modules/assessment-core.mjs');
const controllerPath = resolve(root, 'prototypes/corridor/assessment-controller.mjs');
const controllerBytes = readFileSync(controllerPath);
writeFileSync(resolve(stage, 'assessment-controller.mjs'), controllerBytes);
writeFileSync(resolve(stage, core.path), core.bytes);
const api = await import(pathToFileURL(resolve(stage, 'assessment-controller.mjs')).href);
const shared = await import(pathToFileURL(resolve(stage, core.path)).href);
const clone = (value) => JSON.parse(JSON.stringify(value));
const sourcePath = resolve(root, 'prototypes/corridor/data/mock/sets/n5-01.json');
const sourceBytes = readFileSync(sourcePath);
const rawSet = JSON.parse(sourceBytes);
const scope = Object.freeze({
  accountId: 'local-account:controller-fixture',
  learnerId: 'local-learner:controller-fixture',
});
const otherScope = Object.freeze({ ...scope, learnerId: 'local-learner:other-fixture' });
const NOW = 1_788_998_400_000;
let serial = 0;
const results = [];
let stress = null;
function empty() {
  return api.createLibrary({ scope });
}
function started(attemptId = 'attempt:one', source = rawSet) {
  return api.startLegacyPractice(empty(), source, { scope, attemptId, now: NOW });
}
function active(library) {
  return library.attempts.find((attempt) => attempt.attemptId === library.activeAttemptId);
}
function command(library, extra = {}) {
  const attempt = active(library);
  return {
    scope,
    attemptId: attempt.attemptId,
    expectedRevisionId: attempt.revisionId,
    commandId: `command:${++serial}`,
    now: NOW,
    elapsedDeltaMs: 10,
    ...extra,
  };
}
function finish(initial, wrongFirst = false) {
  let library = initial;
  const questions = api.selectPractice(initial).flat;
  questions.forEach((question, index) => {
    if (index !== 0) library = api.movePractice(library, command(library, { index }));
    const choiceIndex =
      index === 0 && wrongFirst
        ? (question.item.right + 1) % question.item.opts.length
        : question.item.right;
    library = api.answerPractice(library, command(library, { choiceIndex }));
  });
  return api.submitPractice(library, command(library));
}
function dismissed(library) {
  const attempt = active(library);
  return api.dismissPractice(library, {
    scope,
    attemptId: attempt.attemptId,
    expectedRevisionId: attempt.revisionId,
  });
}
async function check(name, run) {
  try {
    await run();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({ name, pass: false, error: String(error?.message || error).slice(0, 1600) });
  }
}

await check('strict-library-rehydration-owns-data-and-keeps-local-scope', () => {
  const library = started();
  const raw = clone(library);
  const parsed = api.parseLibrary(raw, { scope });
  assert.deepEqual(parsed, library);
  assert.equal(Object.isFrozen(raw), false);
  assert.equal(Object.isFrozen(parsed.forms[0].original), true);
  raw.forms[0].original.title.en = 'Caller changed source';
  assert.notEqual(parsed.forms[0].original.title.en, raw.forms[0].original.title.en);
  assert.throws(() => api.parseLibrary(parsed, { scope: otherScope }), /scope-mismatch/u);
  assert.equal(api.parseLibrary(parsed), parsed);
});

await check('source-form-is-pinned-on-start-and-legacy-display-stays-short-unreviewed', () => {
  const source = clone(rawSet);
  const library = started('attempt:original', source);
  source.sections[0].items[0].right = (source.sections[0].items[0].right + 1) % 4;
  const selected = api.selectPractice(library);
  assert.equal(selected.flat[0].item.right, rawSet.sections[0].items[0].right);
  assert.equal(selected.set.approved, false);
  assert.match(selected.set.title.en, /short practice · unreviewed$/u);
  assert.equal(selected.run.ix, 0);
  assert.equal(selected.run.ts, NOW);
  assert.equal(selected.run.answers.length, 18);
  assert(selected.run.answers.every((answer) => answer === null));
  assert.equal(selected.admission.evidenceAdmitted, false);
  assert.equal(selected.admission.scheduling, 'unchanged');
});

await check(
  'two-completed-attempts-on-one-form-retain-earlier-answers-after-done-and-reload',
  () => {
    const first = finish(started('attempt:first'));
    const firstAttempt = active(first);
    let library = dismissed(first);
    library = api.startLegacyPractice(library, rawSet, {
      scope,
      attemptId: 'attempt:second',
      now: NOW,
    });
    library = finish(library, true);
    assert.equal(api.selectPractice(library).score.correct, 17);
    library = dismissed(library);
    const restored = api.parseLibrary(clone(library));
    assert.equal(api.selectPractice(restored), null);
    assert.equal(api.selectPractice(restored, 'attempt:first').score.correct, 18);
    assert.equal(api.selectPractice(restored, 'attempt:second').score.correct, 17);
    assert.deepEqual(restored.attempts[0], firstAttempt);
    assert.deepEqual(api.libraryCounts(restored), {
      forms: 1,
      attempts: 2,
      submitted: 2,
      abandoned: 0,
      inProgress: 0,
      legacySummaries: 0,
      legacyRuns: 0,
    });
    assert.equal(api.selectPractice(restored, 'attempt:first').run.done, NOW);
  },
);

await check('answer-changes-retain-every-response-and-genuine-prompt-exposure', () => {
  const first = started();
  const answered = api.answerPractice(first, command(first, { choiceIndex: 0 }));
  const changed = api.answerPractice(answered, command(answered, { choiceIndex: 1 }));
  const attempt = active(changed);
  assert.equal(attempt.facts.filter((fact) => fact.kind === 'response').length, 2);
  assert.equal(
    attempt.facts.filter((fact) => fact.kind === 'exposure').length,
    1,
    'Changing the response does not fabricate another prompt presentation',
  );
  assert.equal(api.selectPractice(changed).run.answers[0], 1);
  assert.equal(api.selectPractice(answered).run.answers[0], 0);
  assert.equal(api.selectPractice(first).run.answers[0], null);
  assert.equal(attempt.previousRevisionId, active(answered).revisionId);
});

await check('pure-proposals-deterministic-replay-and-stale-cas-do-not-mutate-the-caller', () => {
  const initial = started();
  const before = JSON.stringify(initial);
  const input = command(initial, { choiceIndex: 0 });
  const proposal = api.answerPractice(initial, input);
  assert.deepEqual(api.answerPractice(initial, input), proposal);
  assert.equal(
    JSON.stringify(initial),
    before,
    'A host that cannot commit still owns the unchanged initial library',
  );
  assert.throws(() => api.answerPractice(proposal, input), /stale-checkpoint/u);
  const repeatedId = command(proposal, { choiceIndex: 1, commandId: input.commandId });
  assert.throws(() => api.answerPractice(proposal, repeatedId), /facts.id/u);
});

await check('start-replay-is-idempotent-without-reopening-a-finished-attempt', () => {
  const initial = started('attempt:replay');
  assert.equal(
    api.startLegacyPractice(initial, rawSet, { scope, attemptId: 'attempt:replay', now: NOW }),
    initial,
  );
  const finished = dismissed(finish(initial));
  assert.equal(
    api.startLegacyPractice(finished, rawSet, { scope, attemptId: 'attempt:replay', now: NOW }),
    finished,
  );
  assert.equal(finished.activeAttemptId, null);
  assert.throws(
    () =>
      api.startLegacyPractice(finished, rawSet, {
        scope,
        attemptId: 'attempt:replay',
        now: NOW + 1,
      }),
    /duplicate-identity/u,
  );
  assert.throws(
    () => api.startLegacyPractice(initial, rawSet, { scope, attemptId: 'another', now: NOW }),
    /unfinished-attempt-exists/u,
  );
});

await check('new-source-revision-does-not-rebind-earlier-attempts', () => {
  let library = dismissed(finish(started('attempt:old-edition')));
  const oldReference = library.attempts[0].form;
  const newer = clone(rawSet);
  newer.sections[0].items[0].right = (newer.sections[0].items[0].right + 1) % 4;
  library = api.startLegacyPractice(library, newer, {
    scope,
    attemptId: 'attempt:new-edition',
    now: NOW,
  });
  assert.equal(library.forms.length, 2);
  assert.deepEqual(library.attempts[0].form, oldReference);
  assert.notEqual(active(library).form.revisionId, oldReference.revisionId);
  assert.equal(api.selectPractice(library, 'attempt:old-edition').score.correct, 18);
  const tampered = clone(library);
  tampered.attempts[0].form = clone(active(library).form);
  assert.throws(() => api.parseLibrary(tampered));
});

await check('cross-profile-and-inactive-attempt-commands-fail-without-changing-history', () => {
  const library = started();
  const before = JSON.stringify(library);
  assert.throws(
    () => api.answerPractice(library, command(library, { scope: otherScope, choiceIndex: 0 })),
    /scope-mismatch/u,
  );
  assert.throws(
    () => api.movePractice(library, command(library, { attemptId: 'missing', index: 1 })),
    /inactive-attempt/u,
  );
  assert.throws(
    () => api.importLegacyHistory(library, { scope: otherScope, mockDone: {} }),
    /scope-mismatch/u,
  );
  assert.equal(JSON.stringify(library), before);
  const raw = clone(library);
  raw.scope = otherScope;
  assert.throws(() => api.parseLibrary(raw), /scope-mismatch/u);
});

await check(
  'reload-interruption-keeps-answers-cursor-and-known-time-without-inventing-downtime',
  () => {
    let library = started();
    library = api.answerPractice(
      library,
      command(library, { choiceIndex: 0, elapsedDeltaMs: 1200, activeDeltaMs: 1000 }),
    );
    library = api.movePractice(
      library,
      command(library, { index: 10, elapsedDeltaMs: 100, activeDeltaMs: 50 }),
    );
    const before = api.selectPractice(library);
    const restored = api.parseLibrary(clone(library));
    const resumed = api.resumePractice(restored, {
      scope,
      attemptId: before.attemptId,
      expectedRevisionId: before.expectedRevisionId,
      commandId: 'reload:first',
      now: NOW + 86_400_000,
    });
    const after = api.selectPractice(resumed);
    assert.equal(after.run.ix, 10);
    assert.equal(after.run.answers[0], 0);
    assert.equal(after.elapsedMs, before.elapsedMs);
    assert.equal(after.activeMs, before.activeMs);
    assert.equal(after.clockStatus, 'unverified');
    assert.equal(after.attempt.facts.at(-1).kind, 'interruption');
    assert.equal(after.attempt.facts.at(-1).reason, 'process-stop');
    assert.equal(after.run.ts, NOW);
  },
);

await check(
  'monotonic-time-deltas-charge-the-current-block-and-wall-clock-rollback-is-only-observed',
  () => {
    const initial = started();
    let library = api.answerPractice(
      initial,
      command(initial, { choiceIndex: 0, elapsedDeltaMs: 100, activeDeltaMs: 80 }),
    );
    library = api.movePractice(
      library,
      command(library, { index: 10, elapsedDeltaMs: 50, activeDeltaMs: 40, now: NOW - 5000 }),
    );
    assert.deepEqual(
      active(library).timings.map((timing) => [timing.elapsedMs, timing.activeMs]),
      [
        [150, 120],
        [0, 0],
        [0, 0],
      ],
    );
    library = api.answerPractice(
      library,
      command(library, { choiceIndex: 0, elapsedDeltaMs: 200, activeDeltaMs: 100 }),
    );
    assert.deepEqual(
      active(library).timings.map((timing) => [timing.elapsedMs, timing.activeMs]),
      [
        [150, 120],
        [200, 100],
        [0, 0],
      ],
    );
    assert.throws(
      () => api.answerPractice(library, command(library, { choiceIndex: 0, elapsedDeltaMs: -1 })),
      /elapsedDeltaMs/u,
    );
    assert.throws(
      () =>
        api.answerPractice(
          library,
          command(library, { choiceIndex: 0, elapsedDeltaMs: 1, activeDeltaMs: 2 }),
        ),
      /activeDeltaMs/u,
    );
  },
);

await check(
  'partial-abandonment-is-preserved-and-neither-partial-submit-nor-unfinished-dismiss-is-accepted',
  () => {
    const initial = started();
    assert.throws(() => api.submitPractice(initial, command(initial)), /unanswered-items/u);
    assert.throws(
      () =>
        api.dismissPractice(initial, {
          scope,
          attemptId: active(initial).attemptId,
          expectedRevisionId: active(initial).revisionId,
        }),
      /attempt-not-finalized/u,
    );
    const answered = api.answerPractice(initial, command(initial, { choiceIndex: 0 }));
    const abandoned = api.abandonPractice(answered, command(answered));
    assert.equal(active(abandoned).status, 'abandoned');
    assert.equal(api.selectPractice(abandoned).score, null);
    const kept = dismissed(abandoned);
    assert.equal(kept.attempts[0].answers[0].response.kind, 'selected');
    assert.equal(kept.attempts[0].facts.length, 2);
    assert.throws(
      () => api.answerPractice(abandoned, command(abandoned, { choiceIndex: 1 })),
      /attempt-finalized/u,
    );
  },
);

await check(
  'assistance-and-interruptions-stay-in-the-sitting-and-never-admit-measured-evidence',
  () => {
    let library = started();
    library = api.recordPracticeAssistance(library, command(library, { assistance: 'dictionary' }));
    library = api.interruptPractice(library, command(library, { reason: 'background' }));
    const result = api.selectPractice(finish(library));
    assert.equal(result.admission.disposition, 'practice-only');
    assert.equal(result.admission.evidenceAdmitted, false);
    assert.equal(result.admission.scheduling, 'unchanged');
    assert(result.admission.reasons.includes('assisted-or-revealed'));
    assert(result.admission.reasons.includes('interrupted'));
    assert.equal(result.score.certification, 'none');
    assert.equal(result.score.officialScore, null);
  },
);

await check(
  'historical-bundles-retain-every-original-field-and-never-bind-old-position-indices',
  () => {
    const oldRun = {
      setId: 'n5-01',
      level: 'N5',
      ix: 2,
      answers: [2, null, 1],
      ts: 20,
      done: 10,
      privateExtra: { text: 'synthetic learner note' },
    };
    const oldDone = {
      'n5-01': { score: 2, total: 18, ts: 1, future: ['keep'] },
      'n4-03': { score: 3, total: 19 },
    };
    const library = api.importLegacyHistory(empty(), { scope, mockRun: oldRun, mockDone: oldDone });
    assert.equal(library.attempts.length, 0);
    assert.equal(library.forms.length, 0);
    assert.equal(library.activeAttemptId, null);
    const recovered = library.legacyEvidence.find((entry) => entry.kind === 'run');
    assert.deepEqual(recovered.original, oldRun);
    assert.equal(recovered.resumeAllowed, false);
    assert.equal(recovered.attemptId, null);
    assert.equal(
      api.importLegacyHistory(library, { scope, mockRun: oldRun, mockDone: oldDone }),
      library,
    );
    assert.equal(api.libraryCounts(library).legacySummaries, 2);
    assert.equal(api.libraryCounts(library).legacyRuns, 1);
    const withNew = api.startLegacyPractice(library, rawSet, {
      scope,
      attemptId: 'fresh-after-recovery',
      now: NOW,
    });
    assert.equal(api.selectPractice(withNew).run.ix, 0);
    assert(api.selectPractice(withNew).run.answers.every((answer) => answer === null));
    assert.deepEqual(api.parseLibrary(clone(withNew)).legacyEvidence, library.legacyEvidence);
  },
);

await check('tampered-content-history-scope-pointers-and-duplicate-identities-fail-closed', () => {
  const original = finish(started());
  const cases = [
    (raw) => {
      raw.forms[0].original.sections[0].items[0].q = 'Changed source question';
    },
    (raw) => {
      raw.forms[0].form.items[0].response.answerOptionId = 'changed';
    },
    (raw) => {
      raw.attempts[0].answers[0].response.optionId = 'changed';
    },
    (raw) => {
      raw.attempts[0].facts.pop();
    },
    (raw) => {
      raw.attempts[0].scope = otherScope;
    },
    (raw) => {
      raw.activeAttemptId = 'missing';
    },
    (raw) => {
      raw.forms.push(clone(raw.forms[0]));
    },
    (raw) => {
      raw.attempts.push(clone(raw.attempts[0]));
    },
    (raw) => {
      raw.authority = 'approved';
    },
    (raw) => {
      raw.v = 2;
    },
  ];
  cases.forEach((mutate) => {
    const changed = clone(original);
    mutate(changed);
    assert.throws(() => api.parseLibrary(changed));
  });
  const orphan = clone(started());
  orphan.activeAttemptId = null;
  assert.throws(() => api.parseLibrary(orphan), /inactive-unfinished-attempt/u);
  const legacy = api.importLegacyHistory(empty(), {
    scope,
    mockRun: { setId: 'n5-01', ix: 0, answers: [] },
  });
  const tampered = clone(legacy);
  tampered.legacyEvidence[0].resumeAllowed = true;
  assert.throws(() => api.parseLibrary(tampered));
});

await check('malformed-command-and-accessor-inputs-reject-without-executing-getters', () => {
  const initial = started();
  for (const choiceIndex of [-1, 4, 0.5, '1', NaN])
    assert.throws(() => api.answerPractice(initial, command(initial, { choiceIndex })));
  for (const index of [-1, 18, 0.5])
    assert.throws(() => api.movePractice(initial, command(initial, { index })));
  assert.throws(() =>
    api.answerPractice(initial, command(initial, { choiceIndex: 0, extraAuthority: true })),
  );
  assert.throws(() =>
    api.startLegacyPractice(empty(), rawSet, { scope, attemptId: 'bad', now: '2026-09-10' }),
  );
  let getters = 0;
  const bad = clone(initial);
  Object.defineProperty(bad, 'forms', {
    enumerable: true,
    get() {
      getters += 1;
      return [];
    },
  });
  assert.throws(() => api.parseLibrary(bad));
  assert.equal(getters, 0);
  const cyclic = clone(initial);
  cyclic.loop = cyclic;
  assert.throws(() => api.parseLibrary(cyclic));
  const sparse = clone(initial);
  sparse.attempts = new Array(1);
  assert.throws(() => api.parseLibrary(sparse));
});

await check(
  '500-full-short-practice-attempts-retain-all-answers-and-one-form-on-rehydration',
  () => {
    const base = started();
    const wrapper = base.forms[0];
    const full = finish(base).attempts[0];
    const attempts = [];
    const began = performance.now();
    for (let index = 0; index < 500; index += 1) {
      const initial = shared.beginAttempt(wrapper.form, {
        attemptId: `stress-attempt:${index}`,
        scope,
        mode: 'practice',
        priorExposure: 'unknown',
        editorialAtStart: full.editorialAtStart,
        startedAt: full.startedAt,
        clockStatus: 'continuous',
      });
      // Build an explicit stress fixture through the same shared checkpoint API;
      // the real controller command path is separately exercised above.
      attempts.push(
        shared.checkpointAttempt(wrapper.form, initial, {
          expectedRevisionId: initial.revisionId,
          recordedAt: full.recordedAt,
          cursor: full.cursor,
          timings: full.timings,
          clockStatus: full.clockStatus,
          facts: full.facts,
          status: 'submitted',
        }),
      );
    }
    const serialized = JSON.stringify({ ...base, attempts, activeAttemptId: null });
    const parseBegan = performance.now();
    const library = api.parseLibrary(JSON.parse(serialized));
    const parseMs = performance.now() - parseBegan;
    assert.equal(api.libraryCounts(library).attempts, 500);
    assert.equal(api.libraryCounts(library).submitted, 500);
    assert.equal(library.forms.length, 1);
    assert(
      library.attempts.every(
        (attempt) =>
          attempt.answers.length === 18 &&
          attempt.answers.every((answer) => answer.response.kind === 'selected'),
      ),
    );
    assert.equal(api.selectPractice(library, 'stress-attempt:0').score.correct, 18);
    assert.equal(api.selectPractice(library, 'stress-attempt:499').score.correct, 18);
    const again = api.parseLibrary(clone(library));
    assert.equal(again.attempts[0].sha256, library.attempts[0].sha256);
    assert.equal(again.attempts[499].sha256, library.attempts[499].sha256);
    stress = {
      attempts: 500,
      itemsPerAttempt: 18,
      totalRetainedResponses: 9000,
      forms: 1,
      serializedBytes: Buffer.byteLength(serialized),
      parseMs,
      fixtureAndCheckMs: performance.now() - began,
    };
  },
);

await check('capacity-and-untrusted-shallow-freeze-cannot-bypass-validation', () => {
  const tooMany = {
    ...clone(empty()),
    attempts: Array.from({ length: api.ASSESSMENT_LIBRARY_LIMITS.attempts + 1 }, () => null),
  };
  assert.throws(() => api.parseLibrary(tooMany));
  const untrusted = Object.freeze(clone(started()));
  api.parseLibrary(untrusted);
  untrusted.forms[0].original.sections[0].items[0].q = 'Mutation below an untrusted shallow freeze';
  assert.throws(() => api.parseLibrary(untrusted));
});

assert.equal(
  sha256(readFileSync(controllerPath)),
  sha256(controllerBytes),
  'Controller source must stay unchanged through this verification',
);
const currentInputDifferences = core.inputs
  .filter((input) => sha256(readFileSync(resolve(root, input.path))) !== input.sha256)
  .map((input) => input.path);
if (!sourceArtifact)
  assert.deepEqual(
    currentInputDifferences,
    [],
    'Core inputs must stay unchanged through verification',
  );
const receipt = {
  format: 'kairo-assessment-controller-verification',
  v: 1,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  stage,
  sourceArtifact,
  currentInputDifferences,
  source: { path: relative(root, controllerPath), sha256: sha256(controllerBytes) },
  core: {
    path: core.path,
    sha256: sha256(core.bytes),
    bytes: core.bytes.length,
    compiler: core.compiler,
    inputs: core.inputs,
  },
  fixture: {
    path: relative(root, sourcePath),
    sha256: sha256(sourceBytes),
    items: 18,
    approved: false,
  },
  results,
  passed: results.filter((result) => result.pass).length,
  failed: results.filter((result) => !result.pass).length,
  stress,
  limitations: [
    'Pure compiled module checks; not browser/native UI testing',
    'Synthetic identities and times; no real learner record used',
    'No storage mutations, profile migration, cloud sync or editorial authority',
    'No completed or reviewed full exam forms created',
  ],
};
writeFileSync(resolve(out, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
for (const result of results)
  console.log(
    `${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.pass ? '' : `: ${result.error}`}`,
  );
console.log(
  JSON.stringify(
    {
      passed: receipt.passed,
      failed: receipt.failed,
      stress,
      receipt: resolve(out, 'receipt.json'),
    },
    null,
    2,
  ),
);
if (receipt.failed) process.exitCode = 1;
